import { version, revision } from '../core/core.js';
import { platform } from '../core/platform.js';
import { now } from '../core/time.js';
import { path } from '../core/path.js';
import { TRACEID_RENDER_FRAME, TRACEID_RENDER_FRAME_TIME } from '../core/constants.js';
import { Debug } from '../core/debug.js';
import { EventHandler } from '../core/event-handler.js';
import { Color } from '../core/math/color.js';
import { Mat4 } from '../core/math/mat4.js';
import { math } from '../core/math/math.js';
import { Quat } from '../core/math/quat.js';
import { Vec3 } from '../core/math/vec3.js';
import { PRIMITIVE_TRIANGLES, PRIMITIVE_TRISTRIP, PRIMITIVE_TRIFAN, CULLFACE_NONE } from '../platform/graphics/constants.js';
import { GraphicsDeviceAccess } from '../platform/graphics/graphics-device-access.js';
import { DebugGraphics } from '../platform/graphics/debug-graphics.js';
import { http } from '../platform/net/http.js';
import { LAYERID_WORLD, LAYERID_SKYBOX, SORTMODE_NONE, LAYERID_UI, SORTMODE_MANUAL, LAYERID_IMMEDIATE, LAYERID_DEPTH, SPECULAR_BLINN } from '../scene/constants.js';
import { setProgramLibrary } from '../scene/shader-lib/get-program-library.js';
import { ProgramLibrary } from '../scene/shader-lib/program-library.js';
import { ForwardRenderer } from '../scene/renderer/forward-renderer.js';
import { FrameGraph } from '../scene/frame-graph.js';
import { AreaLightLuts } from '../scene/area-light-luts.js';
import { Layer } from '../scene/layer.js';
import { LayerComposition } from '../scene/composition/layer-composition.js';
import { Scene } from '../scene/scene.js';
import { Material } from '../scene/materials/material.js';
import { LightsBuffer } from '../scene/lighting/lights-buffer.js';
import { StandardMaterial } from '../scene/materials/standard-material.js';
import { setDefaultMaterial } from '../scene/materials/default-material.js';
import { Asset } from './asset/asset.js';
import { AssetRegistry } from './asset/asset-registry.js';
import { BundleRegistry } from './bundle/bundle-registry.js';
import { ComponentSystemRegistry } from './components/registry.js';
import { SceneGrab } from '../scene/graphics/scene-grab.js';
import { BundleHandler } from './handlers/bundle.js';
import { ResourceLoader } from './handlers/loader.js';
import { I18n } from './i18n/i18n.js';
import { ScriptRegistry } from './script/script-registry.js';
import { Entity } from './entity.js';
import { SceneRegistry } from './scene-registry.js';
import { script } from './script.js';
import { ApplicationStats } from './stats.js';
import { FILLMODE_KEEP_ASPECT, RESOLUTION_FIXED, RESOLUTION_AUTO, FILLMODE_FILL_WINDOW } from './constants.js';
import { setApplication, getApplication } from './globals.js';

// Mini-object used to measure progress of loading sets
class Progress {
  constructor(length) {
    this.length = length;
    this.count = 0;
  }
  inc() {
    this.count++;
  }
  done() {
    return this.count === this.length;
  }
}

/**
 * Callback used by {@link AppBase#configure} when configuration file is loaded and parsed (or
 * an error occurs).
 *
 * @callback ConfigureAppCallback
 * @param {string|null} err - The error message in the case where the loading or parsing fails.
 */

/**
 * Callback used by {@link AppBase#preload} when all assets (marked as 'preload') are loaded.
 *
 * @callback PreloadAppCallback
 */

/**
 * Gets the current application, if any.
 *
 * @type {AppBase|null}
 * @ignore
 */
let app = null;

/**
 * An Application represents and manages your PlayCanvas application. If you are developing using
 * the PlayCanvas Editor, the Application is created for you. You can access your Application
 * instance in your scripts. Below is a skeleton script which shows how you can access the
 * application 'app' property inside the initialize and update functions:
 *
 * ```javascript
 * // Editor example: accessing the pc.Application from a script
 * var MyScript = pc.createScript('myScript');
 *
 * MyScript.prototype.initialize = function() {
 *     // Every script instance has a property 'this.app' accessible in the initialize...
 *     const app = this.app;
 * };
 *
 * MyScript.prototype.update = function(dt) {
 *     // ...and update functions.
 *     const app = this.app;
 * };
 * ```
 *
 * If you are using the Engine without the Editor, you have to create the application instance
 * manually.
 *
 * @augments EventHandler
 */
class AppBase extends EventHandler {
  /**
   * Create a new AppBase instance.
   *
   * @param {HTMLCanvasElement} canvas - The canvas element.
   * @example
   * // Engine-only example: create the application manually
   * const options = new AppOptions();
   * const app = new pc.AppBase(canvas);
   * app.init(options);
   *
   * // Start the application's main loop
   * app.start();
   *
   * @hideconstructor
   */
  constructor(canvas) {
    super();
    if ((version.indexOf('$')) < 0) {
      Debug.log(`Powered by PlayCanvas ${version} ${revision}`);
    }

    // Store application instance
    AppBase._applications[canvas.id] = this;
    setApplication(this);
    app = this;

    /** @private */
    this._destroyRequested = false;

    /** @private */
    this._inFrameUpdate = false;

    /** @private */
    this._time = 0;

    /**
     * Scales the global time delta. Defaults to 1.
     *
     * @type {number}
     * @example
     * // Set the app to run at half speed
     * this.app.timeScale = 0.5;
     */
    this.timeScale = 1;

    /**
     * Clamps per-frame delta time to an upper bound. Useful since returning from a tab
     * deactivation can generate huge values for dt, which can adversely affect game state.
     * Defaults to 0.1 (seconds).
     *
     * @type {number}
     * @example
     * // Don't clamp inter-frame times of 200ms or less
     * this.app.maxDeltaTime = 0.2;
     */
    this.maxDeltaTime = 0.1; // Maximum delta is 0.1s or 10 fps.

    /**
     * The total number of frames the application has updated since start() was called.
     *
     * @type {number}
     * @ignore
     */
    this.frame = 0;

    /**
     * When true, the application's render function is called every frame. Setting autoRender
     * to false is useful to applications where the rendered image may often be unchanged over
     * time. This can heavily reduce the application's load on the CPU and GPU. Defaults to
     * true.
     *
     * @type {boolean}
     * @example
     * // Disable rendering every frame and only render on a keydown event
     * this.app.autoRender = false;
     * this.app.keyboard.on('keydown', function (event) {
     *     this.app.renderNextFrame = true;
     * }, this);
     */
    this.autoRender = true;

    /**
     * Set to true to render the scene on the next iteration of the main loop. This only has an
     * effect if {@link AppBase#autoRender} is set to false. The value of renderNextFrame
     * is set back to false again as soon as the scene has been rendered.
     *
     * @type {boolean}
     * @example
     * // Render the scene only while space key is pressed
     * if (this.app.keyboard.isPressed(pc.KEY_SPACE)) {
     *     this.app.renderNextFrame = true;
     * }
     */
    this.renderNextFrame = false;

    /**
     * Enable if you want entity type script attributes to not be re-mapped when an entity is
     * cloned.
     *
     * @type {boolean}
     * @ignore
     */
    this.useLegacyScriptAttributeCloning = script.legacy;
    this._librariesLoaded = false;
    this._fillMode = FILLMODE_KEEP_ASPECT;
    this._resolutionMode = RESOLUTION_FIXED;
    this._allowResize = true;

    /**
     * For backwards compatibility with scripts 1.0.
     *
     * @type {AppBase}
     * @deprecated
     * @ignore
     */
    this.context = this;
  }

  /**
   * Initialize the app.
   *
   * @param {import('./app-options.js').AppOptions} appOptions - Options specifying the init
   * parameters for the app.
   */
  init(appOptions) {
    const device = appOptions.graphicsDevice;
    Debug.assert(device, "The application cannot be created without a valid GraphicsDevice");

    /**
     * The graphics device used by the application.
     *
     * @type {import('../platform/graphics/graphics-device.js').GraphicsDevice}
     */
    this.graphicsDevice = device;
    GraphicsDeviceAccess.set(device);
    this._initDefaultMaterial();
    this._initProgramLibrary();
    this.stats = new ApplicationStats(device);

    /**
     * @type {import('../platform/sound/manager.js').SoundManager}
     * @private
     */
    this._soundManager = appOptions.soundManager;

    /**
     * The resource loader.
     *
     * @type {ResourceLoader}
     */
    this.loader = new ResourceLoader(this);
    LightsBuffer.init(device);

    /**
     * Stores all entities that have been created for this app by guid.
     *
     * @type {Object<string, Entity>}
     * @ignore
     */
    this._entityIndex = {};

    /**
     * The scene managed by the application.
     *
     * @type {Scene}
     * @example
     * // Set the tone mapping property of the application's scene
     * this.app.scene.toneMapping = pc.TONEMAP_FILMIC;
     */
    this.scene = new Scene(device);
    this._registerSceneImmediate(this.scene);

    /**
     * The root entity of the application.
     *
     * @type {Entity}
     * @example
     * // Return the first entity called 'Camera' in a depth-first search of the scene hierarchy
     * const camera = this.app.root.findByName('Camera');
     */
    this.root = new Entity();
    this.root._enabledInHierarchy = true;

    /**
     * The asset registry managed by the application.
     *
     * @type {AssetRegistry}
     * @example
     * // Search the asset registry for all assets with the tag 'vehicle'
     * const vehicleAssets = this.app.assets.findByTag('vehicle');
     */
    this.assets = new AssetRegistry(this.loader);
    if (appOptions.assetPrefix) this.assets.prefix = appOptions.assetPrefix;

    /**
     * @type {BundleRegistry}
     * @ignore
     */
    this.bundles = new BundleRegistry(this.assets);

    /**
     * Set this to false if you want to run without using bundles. We set it to true only if
     * TextDecoder is available because we currently rely on it for untarring.
     *
     * @type {boolean}
     * @ignore
     */
    this.enableBundles = typeof TextDecoder !== 'undefined';
    this.scriptsOrder = appOptions.scriptsOrder || [];

    /**
     * The application's script registry.
     *
     * @type {ScriptRegistry}
     */
    this.scripts = new ScriptRegistry(this);

    /**
     * Handles localization.
     *
     * @type {I18n}
     */
    this.i18n = new I18n(this);

    /**
     * The scene registry managed by the application.
     *
     * @type {SceneRegistry}
     * @example
     * // Search the scene registry for a item with the name 'racetrack1'
     * const sceneItem = this.app.scenes.find('racetrack1');
     *
     * // Load the scene using the item's url
     * this.app.scenes.loadScene(sceneItem.url);
     */
    this.scenes = new SceneRegistry(this);
    const self = this;
    this.defaultLayerWorld = new Layer({
      name: "World",
      id: LAYERID_WORLD
    });
    this.sceneGrab = new SceneGrab(this.graphicsDevice, this.scene);
    this.defaultLayerDepth = this.sceneGrab.layer;
    this.defaultLayerSkybox = new Layer({
      enabled: true,
      name: "Skybox",
      id: LAYERID_SKYBOX,
      opaqueSortMode: SORTMODE_NONE
    });
    this.defaultLayerUi = new Layer({
      enabled: true,
      name: "UI",
      id: LAYERID_UI,
      transparentSortMode: SORTMODE_MANUAL
    });
    this.defaultLayerImmediate = new Layer({
      enabled: true,
      name: "Immediate",
      id: LAYERID_IMMEDIATE,
      opaqueSortMode: SORTMODE_NONE
    });
    const defaultLayerComposition = new LayerComposition("default");
    defaultLayerComposition.pushOpaque(this.defaultLayerWorld);
    defaultLayerComposition.pushOpaque(this.defaultLayerDepth);
    defaultLayerComposition.pushOpaque(this.defaultLayerSkybox);
    defaultLayerComposition.pushTransparent(this.defaultLayerWorld);
    defaultLayerComposition.pushOpaque(this.defaultLayerImmediate);
    defaultLayerComposition.pushTransparent(this.defaultLayerImmediate);
    defaultLayerComposition.pushTransparent(this.defaultLayerUi);
    this.scene.layers = defaultLayerComposition;

    // Default layers patch
    this.scene.on('set:layers', function (oldComp, newComp) {
      const list = newComp.layerList;
      let layer;
      for (let i = 0; i < list.length; i++) {
        layer = list[i];
        switch (layer.id) {
          case LAYERID_DEPTH:
            self.sceneGrab.patch(layer);
            break;
        }
      }
    });

    // placeholder texture for area light LUTs
    AreaLightLuts.createPlaceholder(device);

    /**
     * The forward renderer.
     *
     * @type {ForwardRenderer}
     * @ignore
     */
    this.renderer = new ForwardRenderer(device);
    this.renderer.scene = this.scene;

    /**
     * The frame graph.
     *
     * @type {FrameGraph}
     * @ignore
     */
    this.frameGraph = new FrameGraph();

    /**
     * The run-time lightmapper.
     *
     * @type {import('./lightmapper/lightmapper.js').Lightmapper}
     */
    this.lightmapper = null;
    if (appOptions.lightmapper) {
      this.lightmapper = new appOptions.lightmapper(device, this.root, this.scene, this.renderer, this.assets);
      this.once('prerender', this._firstBake, this);
    }

    /**
     * The application's batch manager.
     *
     * @type {import('../scene/batching/batch-manager.js').BatchManager}
     * @private
     */
    this._batcher = null;
    if (appOptions.batchManager) {
      this._batcher = new appOptions.batchManager(device, this.root, this.scene);
      this.once('prerender', this._firstBatch, this);
    }

    /**
     * The keyboard device.
     *
     * @type {import('../platform/input/keyboard.js').Keyboard}
     */
    this.keyboard = appOptions.keyboard || null;

    /**
     * The mouse device.
     *
     * @type {import('../platform/input/mouse.js').Mouse}
     */
    this.mouse = appOptions.mouse || null;

    /**
     * Used to get touch events input.
     *
     * @type {import('../platform/input/touch-device.js').TouchDevice}
     */
    this.touch = appOptions.touch || null;

    /**
     * Used to access GamePad input.
     *
     * @type {import('../platform/input/game-pads.js').GamePads}
     */
    this.gamepads = appOptions.gamepads || null;

    /**
     * Used to handle input for {@link ElementComponent}s.
     *
     * @type {import('./input/element-input.js').ElementInput}
     */
    this.elementInput = appOptions.elementInput || null;
    if (this.elementInput) this.elementInput.app = this;

    /**
     * The XR Manager that provides ability to start VR/AR sessions.
     *
     * @type {import('./xr/xr-manager.js').XrManager}
     * @example
     * // check if VR is available
     * if (app.xr.isAvailable(pc.XRTYPE_VR)) {
     *     // VR is available
     * }
     */
    this.xr = appOptions.xr ? new appOptions.xr(this) : null;
    if (this.elementInput) this.elementInput.attachSelectEvents();

    /**
     * @type {boolean}
     * @ignore
     */
    this._inTools = false;

    /**
     * @type {Asset|null}
     * @private
     */
    this._skyboxAsset = null;

    /**
     * @type {string}
     * @ignore
     */
    this._scriptPrefix = appOptions.scriptPrefix || '';
    if (this.enableBundles) {
      this.loader.addHandler("bundle", new BundleHandler(this));
    }

    // create and register all required resource handlers
    appOptions.resourceHandlers.forEach(resourceHandler => {
      const handler = new resourceHandler(this);
      this.loader.addHandler(handler.handlerType, handler);
    });

    /**
     * The application's component system registry. The Application constructor adds the
     * following component systems to its component system registry:
     *
     * - anim ({@link AnimComponentSystem})
     * - animation ({@link AnimationComponentSystem})
     * - audiolistener ({@link AudioListenerComponentSystem})
     * - button ({@link ButtonComponentSystem})
     * - camera ({@link CameraComponentSystem})
     * - collision ({@link CollisionComponentSystem})
     * - element ({@link ElementComponentSystem})
     * - layoutchild ({@link LayoutChildComponentSystem})
     * - layoutgroup ({@link LayoutGroupComponentSystem})
     * - light ({@link LightComponentSystem})
     * - model ({@link ModelComponentSystem})
     * - particlesystem ({@link ParticleSystemComponentSystem})
     * - rigidbody ({@link RigidBodyComponentSystem})
     * - render ({@link RenderComponentSystem})
     * - screen ({@link ScreenComponentSystem})
     * - script ({@link ScriptComponentSystem})
     * - scrollbar ({@link ScrollbarComponentSystem})
     * - scrollview ({@link ScrollViewComponentSystem})
     * - sound ({@link SoundComponentSystem})
     * - sprite ({@link SpriteComponentSystem})
     *
     * @type {ComponentSystemRegistry}
     * @example
     * // Set global gravity to zero
     * this.app.systems.rigidbody.gravity.set(0, 0, 0);
     * @example
     * // Set the global sound volume to 50%
     * this.app.systems.sound.volume = 0.5;
     */
    this.systems = new ComponentSystemRegistry();

    // create and register all required component systems
    appOptions.componentSystems.forEach(componentSystem => {
      this.systems.add(new componentSystem(this));
    });

    /** @private */
    this._visibilityChangeHandler = this.onVisibilityChange.bind(this);

    // Depending on browser add the correct visibilitychange event and store the name of the
    // hidden attribute in this._hiddenAttr.
    if (typeof document !== 'undefined') {
      if (document.hidden !== undefined) {
        this._hiddenAttr = 'hidden';
        document.addEventListener('visibilitychange', this._visibilityChangeHandler, false);
      } else if (document.mozHidden !== undefined) {
        this._hiddenAttr = 'mozHidden';
        document.addEventListener('mozvisibilitychange', this._visibilityChangeHandler, false);
      } else if (document.msHidden !== undefined) {
        this._hiddenAttr = 'msHidden';
        document.addEventListener('msvisibilitychange', this._visibilityChangeHandler, false);
      } else if (document.webkitHidden !== undefined) {
        this._hiddenAttr = 'webkitHidden';
        document.addEventListener('webkitvisibilitychange', this._visibilityChangeHandler, false);
      }
    }

    // bind tick function to current scope
    /* eslint-disable-next-line no-use-before-define */
    this.tick = makeTick(this); // Circular linting issue as makeTick and Application reference each other
  }

  /**
   * Get the current application. In the case where there are multiple running applications, the
   * function can get an application based on a supplied canvas id. This function is particularly
   * useful when the current Application is not readily available. For example, in the JavaScript
   * console of the browser's developer tools.
   *
   * @param {string} [id] - If defined, the returned application should use the canvas which has
   * this id. Otherwise current application will be returned.
   * @returns {AppBase|undefined} The running application, if any.
   * @example
   * const app = pc.AppBase.getApplication();
   */
  static getApplication(id) {
    return id ? AppBase._applications[id] : getApplication();
  }

  /** @private */
  _initDefaultMaterial() {
    const material = new StandardMaterial();
    material.name = "Default Material";
    material.shadingModel = SPECULAR_BLINN;
    setDefaultMaterial(this.graphicsDevice, material);
  }

  /** @private */
  _initProgramLibrary() {
    const library = new ProgramLibrary(this.graphicsDevice, new StandardMaterial());
    setProgramLibrary(this.graphicsDevice, library);
  }

  /**
   * @type {import('../platform/sound/manager.js').SoundManager}
   * @ignore
   */
  get soundManager() {
    return this._soundManager;
  }

  /**
   * The application's batch manager. The batch manager is used to merge mesh instances in
   * the scene, which reduces the overall number of draw calls, thereby boosting performance.
   *
   * @type {import('../scene/batching/batch-manager.js').BatchManager}
   */
  get batcher() {
    Debug.assert(this._batcher, "BatchManager has not been created and is required for correct functionality.");
    return this._batcher;
  }

  /**
   * The current fill mode of the canvas. Can be:
   *
   * - {@link FILLMODE_NONE}: the canvas will always match the size provided.
   * - {@link FILLMODE_FILL_WINDOW}: the canvas will simply fill the window, changing aspect ratio.
   * - {@link FILLMODE_KEEP_ASPECT}: the canvas will grow to fill the window as best it can while
   * maintaining the aspect ratio.
   *
   * @type {string}
   */
  get fillMode() {
    return this._fillMode;
  }

  /**
   * The current resolution mode of the canvas, Can be:
   *
   * - {@link RESOLUTION_AUTO}: if width and height are not provided, canvas will be resized to
   * match canvas client size.
   * - {@link RESOLUTION_FIXED}: resolution of canvas will be fixed.
   *
   * @type {string}
   */
  get resolutionMode() {
    return this._resolutionMode;
  }

  /**
   * Load the application configuration file and apply application properties and fill the asset
   * registry.
   *
   * @param {string} url - The URL of the configuration file to load.
   * @param {ConfigureAppCallback} callback - The Function called when the configuration file is
   * loaded and parsed (or an error occurs).
   */
  configure(url, callback) {
    http.get(url, (err, response) => {
      if (err) {
        callback(err);
        return;
      }
      const props = response.application_properties;
      const scenes = response.scenes;
      const assets = response.assets;
      this._parseApplicationProperties(props, err => {
        this._parseScenes(scenes);
        this._parseAssets(assets);
        if (!err) {
          callback(null);
        } else {
          callback(err);
        }
      });
    });
  }

  /**
   * Load all assets in the asset registry that are marked as 'preload'.
   *
   * @param {PreloadAppCallback} callback - Function called when all assets are loaded.
   */
  preload(callback) {
    this.fire("preload:start");

    // get list of assets to preload
    const assets = this.assets.list({
      preload: true
    });
    const progress = new Progress(assets.length);
    let _done = false;

    // check if all loading is done
    const done = () => {
      // do not proceed if application destroyed
      if (!this.graphicsDevice) {
        return;
      }
      if (!_done && progress.done()) {
        _done = true;
        this.fire("preload:end");
        callback();
      }
    };

    // totals loading progress of assets
    const total = assets.length;
    if (progress.length) {
      const onAssetLoad = asset => {
        progress.inc();
        this.fire('preload:progress', progress.count / total);
        if (progress.done()) done();
      };
      const onAssetError = (err, asset) => {
        progress.inc();
        this.fire('preload:progress', progress.count / total);
        if (progress.done()) done();
      };

      // for each asset
      for (let i = 0; i < assets.length; i++) {
        if (!assets[i].loaded) {
          assets[i].once('load', onAssetLoad);
          assets[i].once('error', onAssetError);
          this.assets.load(assets[i]);
        } else {
          progress.inc();
          this.fire("preload:progress", progress.count / total);
          if (progress.done()) done();
        }
      }
    } else {
      done();
    }
  }
  _preloadScripts(sceneData, callback) {
    if (!script.legacy) {
      callback();
      return;
    }
    this.systems.script.preloading = true;
    const scripts = this._getScriptReferences(sceneData);
    const l = scripts.length;
    const progress = new Progress(l);
    const regex = /^http(s)?:\/\//;
    if (l) {
      const onLoad = (err, ScriptType) => {
        if (err) console.error(err);
        progress.inc();
        if (progress.done()) {
          this.systems.script.preloading = false;
          callback();
        }
      };
      for (let i = 0; i < l; i++) {
        let scriptUrl = scripts[i];
        // support absolute URLs (for now)
        if (!regex.test(scriptUrl.toLowerCase()) && this._scriptPrefix) scriptUrl = path.join(this._scriptPrefix, scripts[i]);
        this.loader.load(scriptUrl, 'script', onLoad);
      }
    } else {
      this.systems.script.preloading = false;
      callback();
    }
  }

  // set application properties from data file
  _parseApplicationProperties(props, callback) {
    // configure retrying assets
    if (typeof props.maxAssetRetries === 'number' && props.maxAssetRetries > 0) {
      this.loader.enableRetry(props.maxAssetRetries);
    }

    // TODO: remove this temporary block after migrating properties
    if (!props.useDevicePixelRatio) props.useDevicePixelRatio = props.use_device_pixel_ratio;
    if (!props.resolutionMode) props.resolutionMode = props.resolution_mode;
    if (!props.fillMode) props.fillMode = props.fill_mode;
    this._width = props.width;
    this._height = props.height;
    if (props.useDevicePixelRatio) {
      this.graphicsDevice.maxPixelRatio = window.devicePixelRatio;
    }
    this.setCanvasResolution(props.resolutionMode, this._width, this._height);
    this.setCanvasFillMode(props.fillMode, this._width, this._height);

    // set up layers
    if (props.layers && props.layerOrder) {
      const composition = new LayerComposition("application");
      const layers = {};
      for (const key in props.layers) {
        const data = props.layers[key];
        data.id = parseInt(key, 10);
        // depth layer should only be enabled when needed
        // by incrementing its ref counter
        data.enabled = data.id !== LAYERID_DEPTH;
        layers[key] = new Layer(data);
      }
      for (let i = 0, len = props.layerOrder.length; i < len; i++) {
        const sublayer = props.layerOrder[i];
        const layer = layers[sublayer.layer];
        if (!layer) continue;
        if (sublayer.transparent) {
          composition.pushTransparent(layer);
        } else {
          composition.pushOpaque(layer);
        }
        composition.subLayerEnabled[i] = sublayer.enabled;
      }
      this.scene.layers = composition;
    }

    // add batch groups
    if (props.batchGroups) {
      const batcher = this.batcher;
      if (batcher) {
        for (let i = 0, len = props.batchGroups.length; i < len; i++) {
          const grp = props.batchGroups[i];
          batcher.addGroup(grp.name, grp.dynamic, grp.maxAabbSize, grp.id, grp.layers);
        }
      }
    }

    // set localization assets
    if (props.i18nAssets) {
      this.i18n.assets = props.i18nAssets;
    }
    this._loadLibraries(props.libraries, callback);
  }

  /**
   * @param {string[]} urls - List of URLs to load.
   * @param {Function} callback - Callback function.
   * @private
   */
  _loadLibraries(urls, callback) {
    const len = urls.length;
    let count = len;
    const regex = /^http(s)?:\/\//;
    if (len) {
      const onLoad = (err, script) => {
        count--;
        if (err) {
          callback(err);
        } else if (count === 0) {
          this.onLibrariesLoaded();
          callback(null);
        }
      };
      for (let i = 0; i < len; ++i) {
        let url = urls[i];
        if (!regex.test(url.toLowerCase()) && this._scriptPrefix) url = path.join(this._scriptPrefix, url);
        this.loader.load(url, 'script', onLoad);
      }
    } else {
      this.onLibrariesLoaded();
      callback(null);
    }
  }

  /**
   * Insert scene name/urls into the registry.
   *
   * @param {*} scenes - Scenes to add to the scene registry.
   * @private
   */
  _parseScenes(scenes) {
    if (!scenes) return;
    for (let i = 0; i < scenes.length; i++) {
      this.scenes.add(scenes[i].name, scenes[i].url);
    }
  }

  /**
   * Insert assets into registry.
   *
   * @param {*} assets - Assets to insert.
   * @private
   */
  _parseAssets(assets) {
    const list = [];
    const scriptsIndex = {};
    const bundlesIndex = {};
    if (!script.legacy) {
      // add scripts in order of loading first
      for (let i = 0; i < this.scriptsOrder.length; i++) {
        const id = this.scriptsOrder[i];
        if (!assets[id]) continue;
        scriptsIndex[id] = true;
        list.push(assets[id]);
      }

      // then add bundles
      if (this.enableBundles) {
        for (const id in assets) {
          if (assets[id].type === 'bundle') {
            bundlesIndex[id] = true;
            list.push(assets[id]);
          }
        }
      }

      // then add rest of assets
      for (const id in assets) {
        if (scriptsIndex[id] || bundlesIndex[id]) continue;
        list.push(assets[id]);
      }
    } else {
      if (this.enableBundles) {
        // add bundles
        for (const id in assets) {
          if (assets[id].type === 'bundle') {
            bundlesIndex[id] = true;
            list.push(assets[id]);
          }
        }
      }

      // then add rest of assets
      for (const id in assets) {
        if (bundlesIndex[id]) continue;
        list.push(assets[id]);
      }
    }
    for (let i = 0; i < list.length; i++) {
      const data = list[i];
      const asset = new Asset(data.name, data.type, data.file, data.data);
      asset.id = parseInt(data.id, 10);
      asset.preload = data.preload ? data.preload : false;
      // if this is a script asset and has already been embedded in the page then
      // mark it as loaded
      asset.loaded = data.type === 'script' && data.data && data.data.loadingType > 0;
      // tags
      asset.tags.add(data.tags);
      // i18n
      if (data.i18n) {
        for (const locale in data.i18n) {
          asset.addLocalizedAssetId(locale, data.i18n[locale]);
        }
      }
      // registry
      this.assets.add(asset);
    }
  }

  /**
   * @param {Scene} scene - The scene.
   * @returns {Array} - The list of scripts that are referenced by the scene.
   * @private
   */
  _getScriptReferences(scene) {
    let priorityScripts = [];
    if (scene.settings.priority_scripts) {
      priorityScripts = scene.settings.priority_scripts;
    }
    const _scripts = [];
    const _index = {};

    // first add priority scripts
    for (let i = 0; i < priorityScripts.length; i++) {
      _scripts.push(priorityScripts[i]);
      _index[priorityScripts[i]] = true;
    }

    // then iterate hierarchy to get referenced scripts
    const entities = scene.entities;
    for (const key in entities) {
      if (!entities[key].components.script) {
        continue;
      }
      const scripts = entities[key].components.script.scripts;
      for (let i = 0; i < scripts.length; i++) {
        if (_index[scripts[i].url]) continue;
        _scripts.push(scripts[i].url);
        _index[scripts[i].url] = true;
      }
    }
    return _scripts;
  }

  /**
   * Start the application. This function does the following:
   *
   * 1. Fires an event on the application named 'start'
   * 2. Calls initialize for all components on entities in the hierarchy
   * 3. Fires an event on the application named 'initialize'
   * 4. Calls postInitialize for all components on entities in the hierarchy
   * 5. Fires an event on the application named 'postinitialize'
   * 6. Starts executing the main loop of the application
   *
   * This function is called internally by PlayCanvas applications made in the Editor but you
   * will need to call start yourself if you are using the engine stand-alone.
   *
   * @example
   * app.start();
   */
  start() {
    Debug.call(() => {
      Debug.assert(!this._alreadyStarted, "The application can be started only one time.");
      this._alreadyStarted = true;
    });
    this.frame = 0;
    this.fire("start", {
      timestamp: now(),
      target: this
    });
    if (!this._librariesLoaded) {
      this.onLibrariesLoaded();
    }
    this.systems.fire('initialize', this.root);
    this.fire('initialize');
    this.systems.fire('postInitialize', this.root);
    this.systems.fire('postPostInitialize', this.root);
    this.fire('postinitialize');
    this.tick();
  }

  /**
   * Update all input devices managed by the application.
   *
   * @param {number} dt - The time in seconds since the last update.
   * @private
   */
  inputUpdate(dt) {
    if (this.controller) {
      this.controller.update(dt);
    }
    if (this.mouse) {
      this.mouse.update();
    }
    if (this.keyboard) {
      this.keyboard.update();
    }
    if (this.gamepads) {
      this.gamepads.update();
    }
  }

  /**
   * Update the application. This function will call the update functions and then the postUpdate
   * functions of all enabled components. It will then update the current state of all connected
   * input devices. This function is called internally in the application's main loop and does
   * not need to be called explicitly.
   *
   * @param {number} dt - The time delta in seconds since the last frame.
   */
  update(dt) {
    this.frame++;
    this.graphicsDevice.updateClientRect();
    this.stats.frame.updateStart = now();

    // Perform ComponentSystem update
    if (script.legacy) this.systems.fire('fixedUpdate', 1.0 / 60.0);
    this.systems.fire(this._inTools ? 'toolsUpdate' : 'update', dt);
    this.systems.fire('animationUpdate', dt);
    this.systems.fire('postUpdate', dt);

    // fire update event
    this.fire("update", dt);

    // update input devices
    this.inputUpdate(dt);
    this.stats.frame.updateTime = now() - this.stats.frame.updateStart;
  }
  frameStart() {
    this.graphicsDevice.frameStart();
  }
  frameEnd() {
    this.graphicsDevice.frameEnd();
  }

  /**
   * Render the application's scene. More specifically, the scene's {@link LayerComposition} is
   * rendered. This function is called internally in the application's main loop and does not
   * need to be called explicitly.
   *
   * @ignore
   */
  render() {
    this.stats.frame.renderStart = now();
    this.fire('prerender');
    this.root.syncHierarchy();
    if (this._batcher) {
      this._batcher.updateAll();
    }
    ForwardRenderer._skipRenderCounter = 0;

    // render the scene composition
    this.renderComposition(this.scene.layers);
    this.fire('postrender');
    this.stats.frame.renderTime = now() - this.stats.frame.renderStart;
  }

  // render a layer composition
  renderComposition(layerComposition) {
    DebugGraphics.clearGpuMarkers();
    this.renderer.buildFrameGraph(this.frameGraph, layerComposition);
    this.frameGraph.render(this.graphicsDevice);
  }

  /**
   * @param {number} now - The timestamp passed to the requestAnimationFrame callback.
   * @param {number} dt - The time delta in seconds since the last frame. This is subject to the
   * application's time scale and max delta values.
   * @param {number} ms - The time in milliseconds since the last frame.
   * @private
   */
  _fillFrameStatsBasic(now, dt, ms) {
    // Timing stats
    const stats = this.stats.frame;
    stats.dt = dt;
    stats.ms = ms;
    if (now > stats._timeToCountFrames) {
      stats.fps = stats._fpsAccum;
      stats._fpsAccum = 0;
      stats._timeToCountFrames = now + 1000;
    } else {
      stats._fpsAccum++;
    }

    // total draw call
    this.stats.drawCalls.total = this.graphicsDevice._drawCallsPerFrame;
    this.graphicsDevice._drawCallsPerFrame = 0;
  }

  /** @private */
  _fillFrameStats() {
    let stats = this.stats.frame;

    // Render stats
    stats.cameras = this.renderer._camerasRendered;
    stats.materials = this.renderer._materialSwitches;
    stats.shaders = this.graphicsDevice._shaderSwitchesPerFrame;
    stats.shadowMapUpdates = this.renderer._shadowMapUpdates;
    stats.shadowMapTime = this.renderer._shadowMapTime;
    stats.depthMapTime = this.renderer._depthMapTime;
    stats.forwardTime = this.renderer._forwardTime;
    const prims = this.graphicsDevice._primsPerFrame;
    stats.triangles = prims[PRIMITIVE_TRIANGLES] / 3 + Math.max(prims[PRIMITIVE_TRISTRIP] - 2, 0) + Math.max(prims[PRIMITIVE_TRIFAN] - 2, 0);
    stats.cullTime = this.renderer._cullTime;
    stats.sortTime = this.renderer._sortTime;
    stats.skinTime = this.renderer._skinTime;
    stats.morphTime = this.renderer._morphTime;
    stats.lightClusters = this.renderer._lightClusters;
    stats.lightClustersTime = this.renderer._lightClustersTime;
    stats.otherPrimitives = 0;
    for (let i = 0; i < prims.length; i++) {
      if (i < PRIMITIVE_TRIANGLES) {
        stats.otherPrimitives += prims[i];
      }
      prims[i] = 0;
    }
    this.renderer._camerasRendered = 0;
    this.renderer._materialSwitches = 0;
    this.renderer._shadowMapUpdates = 0;
    this.graphicsDevice._shaderSwitchesPerFrame = 0;
    this.renderer._cullTime = 0;
    this.renderer._layerCompositionUpdateTime = 0;
    this.renderer._lightClustersTime = 0;
    this.renderer._sortTime = 0;
    this.renderer._skinTime = 0;
    this.renderer._morphTime = 0;
    this.renderer._shadowMapTime = 0;
    this.renderer._depthMapTime = 0;
    this.renderer._forwardTime = 0;

    // Draw call stats
    stats = this.stats.drawCalls;
    stats.forward = this.renderer._forwardDrawCalls;
    stats.culled = this.renderer._numDrawCallsCulled;
    stats.depth = 0;
    stats.shadow = this.renderer._shadowDrawCalls;
    stats.skinned = this.renderer._skinDrawCalls;
    stats.immediate = 0;
    stats.instanced = 0;
    stats.removedByInstancing = 0;
    stats.misc = stats.total - (stats.forward + stats.shadow);
    this.renderer._depthDrawCalls = 0;
    this.renderer._shadowDrawCalls = 0;
    this.renderer._forwardDrawCalls = 0;
    this.renderer._numDrawCallsCulled = 0;
    this.renderer._skinDrawCalls = 0;
    this.renderer._immediateRendered = 0;
    this.renderer._instancedDrawCalls = 0;
    this.stats.misc.renderTargetCreationTime = this.graphicsDevice.renderTargetCreationTime;
    stats = this.stats.particles;
    stats.updatesPerFrame = stats._updatesPerFrame;
    stats.frameTime = stats._frameTime;
    stats._updatesPerFrame = 0;
    stats._frameTime = 0;
  }

  /**
   * Controls how the canvas fills the window and resizes when the window changes.
   *
   * @param {string} mode - The mode to use when setting the size of the canvas. Can be:
   *
   * - {@link FILLMODE_NONE}: the canvas will always match the size provided.
   * - {@link FILLMODE_FILL_WINDOW}: the canvas will simply fill the window, changing aspect ratio.
   * - {@link FILLMODE_KEEP_ASPECT}: the canvas will grow to fill the window as best it can while
   * maintaining the aspect ratio.
   *
   * @param {number} [width] - The width of the canvas (only used when mode is {@link FILLMODE_NONE}).
   * @param {number} [height] - The height of the canvas (only used when mode is {@link FILLMODE_NONE}).
   */
  setCanvasFillMode(mode, width, height) {
    this._fillMode = mode;
    this.resizeCanvas(width, height);
  }

  /**
   * Change the resolution of the canvas, and set the way it behaves when the window is resized.
   *
   * @param {string} mode - The mode to use when setting the resolution. Can be:
   *
   * - {@link RESOLUTION_AUTO}: if width and height are not provided, canvas will be resized to
   * match canvas client size.
   * - {@link RESOLUTION_FIXED}: resolution of canvas will be fixed.
   *
   * @param {number} [width] - The horizontal resolution, optional in AUTO mode, if not provided
   * canvas clientWidth is used.
   * @param {number} [height] - The vertical resolution, optional in AUTO mode, if not provided
   * canvas clientHeight is used.
   */
  setCanvasResolution(mode, width, height) {
    this._resolutionMode = mode;

    // In AUTO mode the resolution is the same as the canvas size, unless specified
    if (mode === RESOLUTION_AUTO && width === undefined) {
      width = this.graphicsDevice.canvas.clientWidth;
      height = this.graphicsDevice.canvas.clientHeight;
    }
    this.graphicsDevice.resizeCanvas(width, height);
  }

  /**
   * Queries the visibility of the window or tab in which the application is running.
   *
   * @returns {boolean} True if the application is not visible and false otherwise.
   */
  isHidden() {
    return document[this._hiddenAttr];
  }

  /**
   * Called when the visibility state of the current tab/window changes.
   *
   * @private
   */
  onVisibilityChange() {
    if (this.isHidden()) {
      if (this._soundManager) {
        this._soundManager.suspend();
      }
    } else {
      if (this._soundManager) {
        this._soundManager.resume();
      }
    }
  }

  /**
   * Resize the application's canvas element in line with the current fill mode.
   *
   * - In {@link FILLMODE_KEEP_ASPECT} mode, the canvas will grow to fill the window as best it
   * can while maintaining the aspect ratio.
   * - In {@link FILLMODE_FILL_WINDOW} mode, the canvas will simply fill the window, changing
   * aspect ratio.
   * - In {@link FILLMODE_NONE} mode, the canvas will always match the size provided.
   *
   * @param {number} [width] - The width of the canvas. Only used if current fill mode is {@link FILLMODE_NONE}.
   * @param {number} [height] - The height of the canvas. Only used if current fill mode is {@link FILLMODE_NONE}.
   * @returns {object} A object containing the values calculated to use as width and height.
   */
  resizeCanvas(width, height) {
    if (!this._allowResize) return undefined; // prevent resizing (e.g. if presenting in VR HMD)

    // prevent resizing when in XR session
    if (this.xr && this.xr.session) return undefined;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    if (this._fillMode === FILLMODE_KEEP_ASPECT) {
      const r = this.graphicsDevice.canvas.width / this.graphicsDevice.canvas.height;
      const winR = windowWidth / windowHeight;
      if (r > winR) {
        width = windowWidth;
        height = width / r;
      } else {
        height = windowHeight;
        width = height * r;
      }
    } else if (this._fillMode === FILLMODE_FILL_WINDOW) {
      width = windowWidth;
      height = windowHeight;
    }
    // OTHERWISE: FILLMODE_NONE use width and height that are provided

    this.graphicsDevice.canvas.style.width = width + 'px';
    this.graphicsDevice.canvas.style.height = height + 'px';
    this.updateCanvasSize();

    // return the final values calculated for width and height
    return {
      width: width,
      height: height
    };
  }

  /**
   * Updates the {@link GraphicsDevice} canvas size to match the canvas size on the document
   * page. It is recommended to call this function when the canvas size changes (e.g on window
   * resize and orientation change events) so that the canvas resolution is immediately updated.
   */
  updateCanvasSize() {
    var _this$xr;
    // Don't update if we are in VR or XR
    if (!this._allowResize || (_this$xr = this.xr) != null && _this$xr.active) {
      return;
    }

    // In AUTO mode the resolution is changed to match the canvas size
    if (this._resolutionMode === RESOLUTION_AUTO) {
      // Check if the canvas DOM has changed size
      const canvas = this.graphicsDevice.canvas;
      this.graphicsDevice.resizeCanvas(canvas.clientWidth, canvas.clientHeight);
    }
  }

  /**
   * Event handler called when all code libraries have been loaded. Code libraries are passed
   * into the constructor of the Application and the application won't start running or load
   * packs until all libraries have been loaded.
   *
   * @private
   */
  onLibrariesLoaded() {
    this._librariesLoaded = true;
    if (this.systems.rigidbody) {
      this.systems.rigidbody.onLibraryLoaded();
    }
  }

  /**
   * Apply scene settings to the current scene. Useful when your scene settings are parsed or
   * generated from a non-URL source.
   *
   * @param {object} settings - The scene settings to be applied.
   * @param {object} settings.physics - The physics settings to be applied.
   * @param {number[]} settings.physics.gravity - The world space vector representing global
   * gravity in the physics simulation. Must be a fixed size array with three number elements,
   * corresponding to each axis [ X, Y, Z ].
   * @param {object} settings.render - The rendering settings to be applied.
   * @param {number[]} settings.render.global_ambient - The color of the scene's ambient light.
   * Must be a fixed size array with three number elements, corresponding to each color channel
   * [ R, G, B ].
   * @param {string} settings.render.fog - The type of fog used by the scene. Can be:
   *
   * - {@link FOG_NONE}
   * - {@link FOG_LINEAR}
   * - {@link FOG_EXP}
   * - {@link FOG_EXP2}
   *
   * @param {number[]} settings.render.fog_color - The color of the fog (if enabled). Must be a
   * fixed size array with three number elements, corresponding to each color channel [ R, G, B ].
   * @param {number} settings.render.fog_density - The density of the fog (if enabled). This
   * property is only valid if the fog property is set to {@link FOG_EXP} or {@link FOG_EXP2}.
   * @param {number} settings.render.fog_start - The distance from the viewpoint where linear fog
   * begins. This property is only valid if the fog property is set to {@link FOG_LINEAR}.
   * @param {number} settings.render.fog_end - The distance from the viewpoint where linear fog
   * reaches its maximum. This property is only valid if the fog property is set to {@link FOG_LINEAR}.
   * @param {number} settings.render.gamma_correction - The gamma correction to apply when
   * rendering the scene. Can be:
   *
   * - {@link GAMMA_NONE}
   * - {@link GAMMA_SRGB}
   *
   * @param {number} settings.render.tonemapping - The tonemapping transform to apply when
   * writing fragments to the frame buffer. Can be:
   *
   * - {@link TONEMAP_LINEAR}
   * - {@link TONEMAP_FILMIC}
   * - {@link TONEMAP_HEJL}
   * - {@link TONEMAP_ACES}
   *
   * @param {number} settings.render.exposure - The exposure value tweaks the overall brightness
   * of the scene.
   * @param {number|null} [settings.render.skybox] - The asset ID of the cube map texture to be
   * used as the scene's skybox. Defaults to null.
   * @param {number} settings.render.skyboxIntensity - Multiplier for skybox intensity.
   * @param {number} settings.render.skyboxLuminance - Lux (lm/m^2) value for skybox intensity when physical light units are enabled.
   * @param {number} settings.render.skyboxMip - The mip level of the skybox to be displayed.
   * Only valid for prefiltered cubemap skyboxes.
   * @param {number[]} settings.render.skyboxRotation - Rotation of skybox.
   * @param {number} settings.render.lightmapSizeMultiplier - The lightmap resolution multiplier.
   * @param {number} settings.render.lightmapMaxResolution - The maximum lightmap resolution.
   * @param {number} settings.render.lightmapMode - The lightmap baking mode. Can be:
   *
   * - {@link BAKE_COLOR}: single color lightmap
   * - {@link BAKE_COLORDIR}: single color lightmap + dominant light direction (used for bump/specular)
   *
   * @param {boolean} settings.render.ambientBake - Enable baking ambient light into lightmaps.
   * @param {number} settings.render.ambientBakeNumSamples - Number of samples to use when baking ambient light.
   * @param {number} settings.render.ambientBakeSpherePart - How much of the sphere to include when baking ambient light.
   * @param {number} settings.render.ambientBakeOcclusionBrightness - Brightness of the baked ambient occlusion.
   * @param {number} settings.render.ambientBakeOcclusionContrast - Contrast of the baked ambient occlusion.
   * @param {number} settings.render.ambientLuminance - Lux (lm/m^2) value for ambient light intensity.
   *
   * @param {boolean} settings.render.clusteredLightingEnabled - Enable clustered lighting.
   * @param {boolean} settings.render.lightingShadowsEnabled - If set to true, the clustered lighting will support shadows.
   * @param {boolean} settings.render.lightingCookiesEnabled - If set to true, the clustered lighting will support cookie textures.
   * @param {boolean} settings.render.lightingAreaLightsEnabled - If set to true, the clustered lighting will support area lights.
   * @param {number} settings.render.lightingShadowAtlasResolution - Resolution of the atlas texture storing all non-directional shadow textures.
   * @param {number} settings.render.lightingCookieAtlasResolution - Resolution of the atlas texture storing all non-directional cookie textures.
   * @param {number} settings.render.lightingMaxLightsPerCell - Maximum number of lights a cell can store.
   * @param {number} settings.render.lightingShadowType - The type of shadow filtering used by all shadows. Can be:
   *
   * - {@link SHADOW_PCF1}: PCF 1x1 sampling.
   * - {@link SHADOW_PCF3}: PCF 3x3 sampling.
   * - {@link SHADOW_PCF5}: PCF 5x5 sampling. Falls back to {@link SHADOW_PCF3} on WebGL 1.0.
   *
   * @param {Vec3} settings.render.lightingCells - Number of cells along each world-space axis the space containing lights
   * is subdivided into.
   *
   * Only lights with bakeDir=true will be used for generating the dominant light direction.
   * @example
   *
   * const settings = {
   *     physics: {
   *         gravity: [0, -9.8, 0]
   *     },
   *     render: {
   *         fog_end: 1000,
   *         tonemapping: 0,
   *         skybox: null,
   *         fog_density: 0.01,
   *         gamma_correction: 1,
   *         exposure: 1,
   *         fog_start: 1,
   *         global_ambient: [0, 0, 0],
   *         skyboxIntensity: 1,
   *         skyboxRotation: [0, 0, 0],
   *         fog_color: [0, 0, 0],
   *         lightmapMode: 1,
   *         fog: 'none',
   *         lightmapMaxResolution: 2048,
   *         skyboxMip: 2,
   *         lightmapSizeMultiplier: 16
   *     }
   * };
   * app.applySceneSettings(settings);
   */
  applySceneSettings(settings) {
    let asset;
    if (this.systems.rigidbody && typeof Ammo !== 'undefined') {
      const gravity = settings.physics.gravity;
      this.systems.rigidbody.gravity.set(gravity[0], gravity[1], gravity[2]);
    }
    this.scene.applySettings(settings);
    if (settings.render.hasOwnProperty('skybox')) {
      if (settings.render.skybox) {
        asset = this.assets.get(settings.render.skybox);
        if (asset) {
          this.setSkybox(asset);
        } else {
          this.assets.once('add:' + settings.render.skybox, this.setSkybox, this);
        }
      } else {
        this.setSkybox(null);
      }
    }
  }

  /**
   * Sets the area light LUT tables for this app.
   *
   * @param {number[]} ltcMat1 - LUT table of type `array` to be set.
   * @param {number[]} ltcMat2 - LUT table of type `array` to be set.
   */
  setAreaLightLuts(ltcMat1, ltcMat2) {
    if (ltcMat1 && ltcMat2) {
      AreaLightLuts.set(this.graphicsDevice, ltcMat1, ltcMat2);
    } else {
      Debug.warn("setAreaLightLuts: LUTs for area light are not valid");
    }
  }

  /**
   * Sets the skybox asset to current scene, and subscribes to asset load/change events.
   *
   * @param {Asset} asset - Asset of type `skybox` to be set to, or null to remove skybox.
   */
  setSkybox(asset) {
    if (asset !== this._skyboxAsset) {
      const onSkyboxRemoved = () => {
        this.setSkybox(null);
      };
      const onSkyboxChanged = () => {
        this.scene.setSkybox(this._skyboxAsset ? this._skyboxAsset.resources : null);
      };

      // cleanup previous asset
      if (this._skyboxAsset) {
        this.assets.off('load:' + this._skyboxAsset.id, onSkyboxChanged, this);
        this.assets.off('remove:' + this._skyboxAsset.id, onSkyboxRemoved, this);
        this._skyboxAsset.off('change', onSkyboxChanged, this);
      }

      // set new asset
      this._skyboxAsset = asset;
      if (this._skyboxAsset) {
        this.assets.on('load:' + this._skyboxAsset.id, onSkyboxChanged, this);
        this.assets.once('remove:' + this._skyboxAsset.id, onSkyboxRemoved, this);
        this._skyboxAsset.on('change', onSkyboxChanged, this);
        if (this.scene.skyboxMip === 0 && !this._skyboxAsset.loadFaces) {
          this._skyboxAsset.loadFaces = true;
        }
        this.assets.load(this._skyboxAsset);
      }
      onSkyboxChanged();
    }
  }

  /** @private */
  _firstBake() {
    var _this$lightmapper;
    (_this$lightmapper = this.lightmapper) == null ? void 0 : _this$lightmapper.bake(null, this.scene.lightmapMode);
  }

  /** @private */
  _firstBatch() {
    var _this$batcher;
    (_this$batcher = this.batcher) == null ? void 0 : _this$batcher.generate();
  }

  /**
   * Provide an opportunity to modify the timestamp supplied by requestAnimationFrame.
   *
   * @param {number} [timestamp] - The timestamp supplied by requestAnimationFrame.
   * @returns {number|undefined} The modified timestamp.
   * @ignore
   */
  _processTimestamp(timestamp) {
    return timestamp;
  }

  /**
   * Draws a single line. Line start and end coordinates are specified in world-space. The line
   * will be flat-shaded with the specified color.
   *
   * @param {Vec3} start - The start world-space coordinate of the line.
   * @param {Vec3} end - The end world-space coordinate of the line.
   * @param {Color} [color] - The color of the line. It defaults to white if not specified.
   * @param {boolean} [depthTest] - Specifies if the line is depth tested against the depth
   * buffer. Defaults to true.
   * @param {Layer} [layer] - The layer to render the line into. Defaults to {@link LAYERID_IMMEDIATE}.
   * @example
   * // Render a 1-unit long white line
   * const start = new pc.Vec3(0, 0, 0);
   * const end = new pc.Vec3(1, 0, 0);
   * app.drawLine(start, end);
   * @example
   * // Render a 1-unit long red line which is not depth tested and renders on top of other geometry
   * const start = new pc.Vec3(0, 0, 0);
   * const end = new pc.Vec3(1, 0, 0);
   * app.drawLine(start, end, pc.Color.RED, false);
   * @example
   * // Render a 1-unit long white line into the world layer
   * const start = new pc.Vec3(0, 0, 0);
   * const end = new pc.Vec3(1, 0, 0);
   * const worldLayer = app.scene.layers.getLayerById(pc.LAYERID_WORLD);
   * app.drawLine(start, end, pc.Color.WHITE, true, worldLayer);
   */
  drawLine(start, end, color, depthTest, layer) {
    this.scene.drawLine(start, end, color, depthTest, layer);
  }

  /**
   * Renders an arbitrary number of discrete line segments. The lines are not connected by each
   * subsequent point in the array. Instead, they are individual segments specified by two
   * points. Therefore, the lengths of the supplied position and color arrays must be the same
   * and also must be a multiple of 2. The colors of the ends of each line segment will be
   * interpolated along the length of each line.
   *
   * @param {Vec3[]} positions - An array of points to draw lines between. The length of the
   * array must be a multiple of 2.
   * @param {Color[]} colors - An array of colors to color the lines. This must be the same
   * length as the position array. The length of the array must also be a multiple of 2.
   * @param {boolean} [depthTest] - Specifies if the lines are depth tested against the depth
   * buffer. Defaults to true.
   * @param {Layer} [layer] - The layer to render the lines into. Defaults to {@link LAYERID_IMMEDIATE}.
   * @example
   * // Render a single line, with unique colors for each point
   * const start = new pc.Vec3(0, 0, 0);
   * const end = new pc.Vec3(1, 0, 0);
   * app.drawLines([start, end], [pc.Color.RED, pc.Color.WHITE]);
   * @example
   * // Render 2 discrete line segments
   * const points = [
   *     // Line 1
   *     new pc.Vec3(0, 0, 0),
   *     new pc.Vec3(1, 0, 0),
   *     // Line 2
   *     new pc.Vec3(1, 1, 0),
   *     new pc.Vec3(1, 1, 1)
   * ];
   * const colors = [
   *     // Line 1
   *     pc.Color.RED,
   *     pc.Color.YELLOW,
   *     // Line 2
   *     pc.Color.CYAN,
   *     pc.Color.BLUE
   * ];
   * app.drawLines(points, colors);
   */
  drawLines(positions, colors, depthTest = true, layer = this.scene.defaultDrawLayer) {
    this.scene.drawLines(positions, colors, depthTest, layer);
  }

  /**
   * Renders an arbitrary number of discrete line segments. The lines are not connected by each
   * subsequent point in the array. Instead, they are individual segments specified by two
   * points.
   *
   * @param {number[]} positions - An array of points to draw lines between. Each point is
   * represented by 3 numbers - x, y and z coordinate.
   * @param {number[]} colors - An array of colors to color the lines. This must be the same
   * length as the position array. The length of the array must also be a multiple of 2.
   * @param {boolean} [depthTest] - Specifies if the lines are depth tested against the depth
   * buffer. Defaults to true.
   * @param {Layer} [layer] - The layer to render the lines into. Defaults to {@link LAYERID_IMMEDIATE}.
   * @example
   * // Render 2 discrete line segments
   * const points = [
   *     // Line 1
   *     0, 0, 0,
   *     1, 0, 0,
   *     // Line 2
   *     1, 1, 0,
   *     1, 1, 1
   * ];
   * const colors = [
   *     // Line 1
   *     1, 0, 0, 1,  // red
   *     0, 1, 0, 1,  // green
   *     // Line 2
   *     0, 0, 1, 1,  // blue
   *     1, 1, 1, 1   // white
   * ];
   * app.drawLineArrays(points, colors);
   */
  drawLineArrays(positions, colors, depthTest = true, layer = this.scene.defaultDrawLayer) {
    this.scene.drawLineArrays(positions, colors, depthTest, layer);
  }

  /**
   * Draws a wireframe sphere with center, radius and color.
   *
   * @param {Vec3} center - The center of the sphere.
   * @param {number} radius - The radius of the sphere.
   * @param {Color} [color] - The color of the sphere. It defaults to white if not specified.
   * @param {number} [segments] - Number of line segments used to render the circles forming the
   * sphere. Defaults to 20.
   * @param {boolean} [depthTest] - Specifies if the sphere lines are depth tested against the
   * depth buffer. Defaults to true.
   * @param {Layer} [layer] - The layer to render the sphere into. Defaults to {@link LAYERID_IMMEDIATE}.
   * @example
   * // Render a red wire sphere with radius of 1
   * const center = new pc.Vec3(0, 0, 0);
   * app.drawWireSphere(center, 1.0, pc.Color.RED);
   * @ignore
   */
  drawWireSphere(center, radius, color = Color.WHITE, segments = 20, depthTest = true, layer = this.scene.defaultDrawLayer) {
    this.scene.immediate.drawWireSphere(center, radius, color, segments, depthTest, layer);
  }

  /**
   * Draws a wireframe axis aligned box specified by min and max points and color.
   *
   * @param {Vec3} minPoint - The min corner point of the box.
   * @param {Vec3} maxPoint - The max corner point of the box.
   * @param {Color} [color] - The color of the sphere. It defaults to white if not specified.
   * @param {boolean} [depthTest] - Specifies if the sphere lines are depth tested against the
   * depth buffer. Defaults to true.
   * @param {Layer} [layer] - The layer to render the sphere into. Defaults to {@link LAYERID_IMMEDIATE}.
   * @example
   * // Render a red wire aligned box
   * const min = new pc.Vec3(-1, -1, -1);
   * const max = new pc.Vec3(1, 1, 1);
   * app.drawWireAlignedBox(min, max, pc.Color.RED);
   * @ignore
   */
  drawWireAlignedBox(minPoint, maxPoint, color = Color.WHITE, depthTest = true, layer = this.scene.defaultDrawLayer) {
    this.scene.immediate.drawWireAlignedBox(minPoint, maxPoint, color, depthTest, layer);
  }

  /**
   * Draw meshInstance at this frame
   *
   * @param {import('../scene/mesh-instance.js').MeshInstance} meshInstance - The mesh instance
   * to draw.
   * @param {Layer} [layer] - The layer to render the mesh instance into. Defaults to
   * {@link LAYERID_IMMEDIATE}.
   * @ignore
   */
  drawMeshInstance(meshInstance, layer = this.scene.defaultDrawLayer) {
    this.scene.immediate.drawMesh(null, null, null, meshInstance, layer);
  }

  /**
   * Draw mesh at this frame.
   *
   * @param {import('../scene/mesh.js').Mesh} mesh - The mesh to draw.
   * @param {Material} material - The material to use to render the mesh.
   * @param {Mat4} matrix - The matrix to use to render the mesh.
   * @param {Layer} [layer] - The layer to render the mesh into. Defaults to {@link LAYERID_IMMEDIATE}.
   * @ignore
   */
  drawMesh(mesh, material, matrix, layer = this.scene.defaultDrawLayer) {
    this.scene.immediate.drawMesh(material, matrix, mesh, null, layer);
  }

  /**
   * Draw quad of size [-0.5, 0.5] at this frame.
   *
   * @param {Mat4} matrix - The matrix to use to render the quad.
   * @param {Material} material - The material to use to render the quad.
   * @param {Layer} [layer] - The layer to render the quad into. Defaults to {@link LAYERID_IMMEDIATE}.
   * @ignore
   */
  drawQuad(matrix, material, layer = this.scene.defaultDrawLayer) {
    this.scene.immediate.drawMesh(material, matrix, this.scene.immediate.getQuadMesh(), null, layer);
  }

  /**
   * Draws a texture at [x, y] position on screen, with size [width, height]. The origin of the
   * screen is top-left [0, 0]. Coordinates and sizes are in projected space (-1 .. 1).
   *
   * @param {number} x - The x coordinate on the screen of the top left corner of the texture.
   * Should be in the range [-1, 1].
   * @param {number} y - The y coordinate on the screen of the top left corner of the texture.
   * Should be in the range [-1, 1].
   * @param {number} width - The width of the rectangle of the rendered texture. Should be in the
   * range [0, 2].
   * @param {number} height - The height of the rectangle of the rendered texture. Should be in
   * the range [0, 2].
   * @param {import('../platform/graphics/texture.js').Texture} texture - The texture to render.
   * @param {Material} material - The material used when rendering the texture.
   * @param {Layer} [layer] - The layer to render the texture into. Defaults to {@link LAYERID_IMMEDIATE}.
   * @param {boolean} [filterable] - Indicate if the texture can be sampled using filtering.
   * Passing false uses unfiltered sampling, allowing a depth texture to be sampled on WebGPU.
   * Defaults to true.
   * @ignore
   */
  drawTexture(x, y, width, height, texture, material, layer = this.scene.defaultDrawLayer, filterable = true) {
    // only WebGPU supports filterable parameter to be false, allowing a depth texture / shadow
    // map to be fetched (without filtering) and rendered
    if (filterable === false && !this.graphicsDevice.isWebGPU) return;

    // TODO: if this is used for anything other than debug texture display, we should optimize this to avoid allocations
    const matrix = new Mat4();
    matrix.setTRS(new Vec3(x, y, 0.0), Quat.IDENTITY, new Vec3(width, -height, 0.0));
    if (!material) {
      material = new Material();
      material.cull = CULLFACE_NONE;
      material.setParameter("colorMap", texture);
      material.shader = filterable ? this.scene.immediate.getTextureShader() : this.scene.immediate.getUnfilterableTextureShader();
      material.update();
    }
    this.drawQuad(matrix, material, layer);
  }

  /**
   * Draws a depth texture at [x, y] position on screen, with size [width, height]. The origin of
   * the screen is top-left [0, 0]. Coordinates and sizes are in projected space (-1 .. 1).
   *
   * @param {number} x - The x coordinate on the screen of the top left corner of the texture.
   * Should be in the range [-1, 1].
   * @param {number} y - The y coordinate on the screen of the top left corner of the texture.
   * Should be in the range [-1, 1].
   * @param {number} width - The width of the rectangle of the rendered texture. Should be in the
   * range [0, 2].
   * @param {number} height - The height of the rectangle of the rendered texture. Should be in
   * the range [0, 2].
   * @param {Layer} [layer] - The layer to render the texture into. Defaults to {@link LAYERID_IMMEDIATE}.
   * @ignore
   */
  drawDepthTexture(x, y, width, height, layer = this.scene.defaultDrawLayer) {
    const material = new Material();
    material.cull = CULLFACE_NONE;
    material.shader = this.scene.immediate.getDepthTextureShader();
    material.update();
    this.drawTexture(x, y, width, height, null, material, layer);
  }

  /**
   * Destroys application and removes all event listeners at the end of the current engine frame
   * update. However, if called outside of the engine frame update, calling destroy() will
   * destroy the application immediately.
   *
   * @example
   * app.destroy();
   */
  destroy() {
    var _this$lightmapper2, _this$xr2, _this$xr3, _this$_soundManager;
    if (this._inFrameUpdate) {
      this._destroyRequested = true;
      return;
    }
    const canvasId = this.graphicsDevice.canvas.id;
    this.off('librariesloaded');
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this._visibilityChangeHandler, false);
      document.removeEventListener('mozvisibilitychange', this._visibilityChangeHandler, false);
      document.removeEventListener('msvisibilitychange', this._visibilityChangeHandler, false);
      document.removeEventListener('webkitvisibilitychange', this._visibilityChangeHandler, false);
    }
    this._visibilityChangeHandler = null;
    this.root.destroy();
    this.root = null;
    if (this.mouse) {
      this.mouse.off();
      this.mouse.detach();
      this.mouse = null;
    }
    if (this.keyboard) {
      this.keyboard.off();
      this.keyboard.detach();
      this.keyboard = null;
    }
    if (this.touch) {
      this.touch.off();
      this.touch.detach();
      this.touch = null;
    }
    if (this.elementInput) {
      this.elementInput.detach();
      this.elementInput = null;
    }
    if (this.gamepads) {
      this.gamepads.destroy();
      this.gamepads = null;
    }
    if (this.controller) {
      this.controller = null;
    }
    this.systems.destroy();

    // layer composition
    if (this.scene.layers) {
      this.scene.layers.destroy();
    }

    // destroy all texture resources
    const assets = this.assets.list();
    for (let i = 0; i < assets.length; i++) {
      assets[i].unload();
      assets[i].off();
    }
    this.assets.off();

    // destroy bundle registry
    this.bundles.destroy();
    this.bundles = null;
    this.i18n.destroy();
    this.i18n = null;
    const scriptHandler = this.loader.getHandler('script');
    scriptHandler == null ? void 0 : scriptHandler.clearCache();
    this.loader.destroy();
    this.loader = null;
    this.scene.destroy();
    this.scene = null;
    this.systems = null;
    this.context = null;

    // script registry
    this.scripts.destroy();
    this.scripts = null;
    this.scenes.destroy();
    this.scenes = null;
    (_this$lightmapper2 = this.lightmapper) == null ? void 0 : _this$lightmapper2.destroy();
    this.lightmapper = null;
    if (this._batcher) {
      this._batcher.destroy();
      this._batcher = null;
    }
    this._entityIndex = {};
    this.defaultLayerDepth.onPreRenderOpaque = null;
    this.defaultLayerDepth.onPostRenderOpaque = null;
    this.defaultLayerDepth.onDisable = null;
    this.defaultLayerDepth.onEnable = null;
    this.defaultLayerDepth = null;
    this.defaultLayerWorld = null;
    (_this$xr2 = this.xr) == null ? void 0 : _this$xr2.end();
    (_this$xr3 = this.xr) == null ? void 0 : _this$xr3.destroy();
    this.renderer.destroy();
    this.renderer = null;
    this.graphicsDevice.destroy();
    this.graphicsDevice = null;
    this.tick = null;
    this.off(); // remove all events

    (_this$_soundManager = this._soundManager) == null ? void 0 : _this$_soundManager.destroy();
    this._soundManager = null;
    script.app = null;
    AppBase._applications[canvasId] = null;
    if (getApplication() === this) {
      setApplication(null);
    }
  }

  /**
   * Get entity from the index by guid.
   *
   * @param {string} guid - The GUID to search for.
   * @returns {Entity} The Entity with the GUID or null.
   * @ignore
   */
  getEntityFromIndex(guid) {
    return this._entityIndex[guid];
  }

  /**
   * @param {Scene} scene - The scene.
   * @private
   */
  _registerSceneImmediate(scene) {
    this.on('postrender', scene.immediate.onPostRender, scene.immediate);
  }
}

// static data
AppBase._applications = {};
const _frameEndData = {};

/**
 * Callback used by {@link AppBase#start} and itself to request
 * the rendering of a new animation frame.
 *
 * @callback MakeTickCallback
 * @param {number} [timestamp] - The timestamp supplied by requestAnimationFrame.
 * @param {*} [frame] - XRFrame from requestAnimationFrame callback.
 * @ignore
 */

/**
 * Create tick function to be wrapped in closure.
 *
 * @param {AppBase} _app - The application.
 * @returns {MakeTickCallback} The tick function.
 * @private
 */
const makeTick = function makeTick(_app) {
  const application = _app;
  let frameRequest;
  /**
   * @param {number} [timestamp] - The timestamp supplied by requestAnimationFrame.
   * @param {*} [frame] - XRFrame from requestAnimationFrame callback.
   */
  return function (timestamp, frame) {
    var _application$xr;
    if (!application.graphicsDevice) return;
    setApplication(application);
    if (frameRequest) {
      window.cancelAnimationFrame(frameRequest);
      frameRequest = null;
    }

    // have current application pointer in pc
    app = application;
    const currentTime = application._processTimestamp(timestamp) || now();
    const ms = currentTime - (application._time || currentTime);
    let dt = ms / 1000.0;
    dt = math.clamp(dt, 0, application.maxDeltaTime);
    dt *= application.timeScale;
    application._time = currentTime;

    // Submit a request to queue up a new animation frame immediately
    if ((_application$xr = application.xr) != null && _application$xr.session) {
      frameRequest = application.xr.session.requestAnimationFrame(application.tick);
    } else {
      frameRequest = platform.browser ? window.requestAnimationFrame(application.tick) : null;
    }
    if (application.graphicsDevice.contextLost) return;
    application._fillFrameStatsBasic(currentTime, dt, ms);
    application._fillFrameStats();
    application._inFrameUpdate = true;
    application.fire("frameupdate", ms);
    let shouldRenderFrame = true;
    if (frame) {
      var _application$xr2;
      shouldRenderFrame = (_application$xr2 = application.xr) == null ? void 0 : _application$xr2.update(frame);
      application.graphicsDevice.defaultFramebuffer = frame.session.renderState.baseLayer.framebuffer;
    } else {
      application.graphicsDevice.defaultFramebuffer = null;
    }
    if (shouldRenderFrame) {
      Debug.trace(TRACEID_RENDER_FRAME, `---- Frame ${application.frame}`);
      Debug.trace(TRACEID_RENDER_FRAME_TIME, `-- UpdateStart ${now().toFixed(2)}ms`);
      application.update(dt);
      application.fire("framerender");
      if (application.autoRender || application.renderNextFrame) {
        Debug.trace(TRACEID_RENDER_FRAME_TIME, `-- RenderStart ${now().toFixed(2)}ms`);
        application.updateCanvasSize();
        application.frameStart();
        application.render();
        application.frameEnd();
        application.renderNextFrame = false;
        Debug.trace(TRACEID_RENDER_FRAME_TIME, `-- RenderEnd ${now().toFixed(2)}ms`);
      }

      // set event data
      _frameEndData.timestamp = now();
      _frameEndData.target = application;
      application.fire("frameend", _frameEndData);
    }
    application._inFrameUpdate = false;
    if (application._destroyRequested) {
      application.destroy();
    }
  };
};

export { AppBase, app };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBwLWJhc2UuanMiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9mcmFtZXdvcmsvYXBwLWJhc2UuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gI2lmIF9ERUJVR1xuaW1wb3J0IHsgdmVyc2lvbiwgcmV2aXNpb24gfSBmcm9tICcuLi9jb3JlL2NvcmUuanMnO1xuLy8gI2VuZGlmXG5pbXBvcnQgeyBwbGF0Zm9ybSB9IGZyb20gJy4uL2NvcmUvcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgbm93IH0gZnJvbSAnLi4vY29yZS90aW1lLmpzJztcbmltcG9ydCB7IHBhdGggfSBmcm9tICcuLi9jb3JlL3BhdGguanMnO1xuaW1wb3J0IHsgVFJBQ0VJRF9SRU5ERVJfRlJBTUUsIFRSQUNFSURfUkVOREVSX0ZSQU1FX1RJTUUgfSBmcm9tICcuLi9jb3JlL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBEZWJ1ZyB9IGZyb20gJy4uL2NvcmUvZGVidWcuanMnO1xuaW1wb3J0IHsgRXZlbnRIYW5kbGVyIH0gZnJvbSAnLi4vY29yZS9ldmVudC1oYW5kbGVyLmpzJztcbmltcG9ydCB7IENvbG9yIH0gZnJvbSAnLi4vY29yZS9tYXRoL2NvbG9yLmpzJztcbmltcG9ydCB7IE1hdDQgfSBmcm9tICcuLi9jb3JlL21hdGgvbWF0NC5qcyc7XG5pbXBvcnQgeyBtYXRoIH0gZnJvbSAnLi4vY29yZS9tYXRoL21hdGguanMnO1xuaW1wb3J0IHsgUXVhdCB9IGZyb20gJy4uL2NvcmUvbWF0aC9xdWF0LmpzJztcbmltcG9ydCB7IFZlYzMgfSBmcm9tICcuLi9jb3JlL21hdGgvdmVjMy5qcyc7XG5cbmltcG9ydCB7XG4gICAgUFJJTUlUSVZFX1RSSUFOR0xFUywgUFJJTUlUSVZFX1RSSUZBTiwgUFJJTUlUSVZFX1RSSVNUUklQLCBDVUxMRkFDRV9OT05FXG59IGZyb20gJy4uL3BsYXRmb3JtL2dyYXBoaWNzL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBHcmFwaGljc0RldmljZUFjY2VzcyB9IGZyb20gJy4uL3BsYXRmb3JtL2dyYXBoaWNzL2dyYXBoaWNzLWRldmljZS1hY2Nlc3MuanMnO1xuaW1wb3J0IHsgRGVidWdHcmFwaGljcyB9IGZyb20gJy4uL3BsYXRmb3JtL2dyYXBoaWNzL2RlYnVnLWdyYXBoaWNzLmpzJztcbmltcG9ydCB7IGh0dHAgfSBmcm9tICcuLi9wbGF0Zm9ybS9uZXQvaHR0cC5qcyc7XG5cbmltcG9ydCB7XG4gICAgTEFZRVJJRF9ERVBUSCwgTEFZRVJJRF9JTU1FRElBVEUsIExBWUVSSURfU0tZQk9YLCBMQVlFUklEX1VJLCBMQVlFUklEX1dPUkxELFxuICAgIFNPUlRNT0RFX05PTkUsIFNPUlRNT0RFX01BTlVBTCwgU1BFQ1VMQVJfQkxJTk5cbn0gZnJvbSAnLi4vc2NlbmUvY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IHNldFByb2dyYW1MaWJyYXJ5IH0gZnJvbSAnLi4vc2NlbmUvc2hhZGVyLWxpYi9nZXQtcHJvZ3JhbS1saWJyYXJ5LmpzJztcbmltcG9ydCB7IFByb2dyYW1MaWJyYXJ5IH0gZnJvbSAnLi4vc2NlbmUvc2hhZGVyLWxpYi9wcm9ncmFtLWxpYnJhcnkuanMnO1xuaW1wb3J0IHsgRm9yd2FyZFJlbmRlcmVyIH0gZnJvbSAnLi4vc2NlbmUvcmVuZGVyZXIvZm9yd2FyZC1yZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBGcmFtZUdyYXBoIH0gZnJvbSAnLi4vc2NlbmUvZnJhbWUtZ3JhcGguanMnO1xuaW1wb3J0IHsgQXJlYUxpZ2h0THV0cyB9IGZyb20gJy4uL3NjZW5lL2FyZWEtbGlnaHQtbHV0cy5qcyc7XG5pbXBvcnQgeyBMYXllciB9IGZyb20gJy4uL3NjZW5lL2xheWVyLmpzJztcbmltcG9ydCB7IExheWVyQ29tcG9zaXRpb24gfSBmcm9tICcuLi9zY2VuZS9jb21wb3NpdGlvbi9sYXllci1jb21wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBTY2VuZSB9IGZyb20gJy4uL3NjZW5lL3NjZW5lLmpzJztcbmltcG9ydCB7IE1hdGVyaWFsIH0gZnJvbSAnLi4vc2NlbmUvbWF0ZXJpYWxzL21hdGVyaWFsLmpzJztcbmltcG9ydCB7IExpZ2h0c0J1ZmZlciB9IGZyb20gJy4uL3NjZW5lL2xpZ2h0aW5nL2xpZ2h0cy1idWZmZXIuanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRNYXRlcmlhbCB9IGZyb20gJy4uL3NjZW5lL21hdGVyaWFscy9zdGFuZGFyZC1tYXRlcmlhbC5qcyc7XG5pbXBvcnQgeyBzZXREZWZhdWx0TWF0ZXJpYWwgfSBmcm9tICcuLi9zY2VuZS9tYXRlcmlhbHMvZGVmYXVsdC1tYXRlcmlhbC5qcyc7XG5cbmltcG9ydCB7IEFzc2V0IH0gZnJvbSAnLi9hc3NldC9hc3NldC5qcyc7XG5pbXBvcnQgeyBBc3NldFJlZ2lzdHJ5IH0gZnJvbSAnLi9hc3NldC9hc3NldC1yZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBCdW5kbGVSZWdpc3RyeSB9IGZyb20gJy4vYnVuZGxlL2J1bmRsZS1yZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBDb21wb25lbnRTeXN0ZW1SZWdpc3RyeSB9IGZyb20gJy4vY29tcG9uZW50cy9yZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBTY2VuZUdyYWIgfSBmcm9tICcuLi9zY2VuZS9ncmFwaGljcy9zY2VuZS1ncmFiLmpzJztcbmltcG9ydCB7IEJ1bmRsZUhhbmRsZXIgfSBmcm9tICcuL2hhbmRsZXJzL2J1bmRsZS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZUxvYWRlciB9IGZyb20gJy4vaGFuZGxlcnMvbG9hZGVyLmpzJztcbmltcG9ydCB7IEkxOG4gfSBmcm9tICcuL2kxOG4vaTE4bi5qcyc7XG5pbXBvcnQgeyBTY3JpcHRSZWdpc3RyeSB9IGZyb20gJy4vc2NyaXB0L3NjcmlwdC1yZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBFbnRpdHkgfSBmcm9tICcuL2VudGl0eS5qcyc7XG5pbXBvcnQgeyBTY2VuZVJlZ2lzdHJ5IH0gZnJvbSAnLi9zY2VuZS1yZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBzY3JpcHQgfSBmcm9tICcuL3NjcmlwdC5qcyc7XG5pbXBvcnQgeyBBcHBsaWNhdGlvblN0YXRzIH0gZnJvbSAnLi9zdGF0cy5qcyc7XG5cbmltcG9ydCB7XG4gICAgRklMTE1PREVfRklMTF9XSU5ET1csIEZJTExNT0RFX0tFRVBfQVNQRUNULFxuICAgIFJFU09MVVRJT05fQVVUTywgUkVTT0xVVElPTl9GSVhFRFxufSBmcm9tICcuL2NvbnN0YW50cy5qcyc7XG5cbmltcG9ydCB7XG4gICAgZ2V0QXBwbGljYXRpb24sXG4gICAgc2V0QXBwbGljYXRpb25cbn0gZnJvbSAnLi9nbG9iYWxzLmpzJztcblxuLy8gTWluaS1vYmplY3QgdXNlZCB0byBtZWFzdXJlIHByb2dyZXNzIG9mIGxvYWRpbmcgc2V0c1xuY2xhc3MgUHJvZ3Jlc3Mge1xuICAgIGNvbnN0cnVjdG9yKGxlbmd0aCkge1xuICAgICAgICB0aGlzLmxlbmd0aCA9IGxlbmd0aDtcbiAgICAgICAgdGhpcy5jb3VudCA9IDA7XG4gICAgfVxuXG4gICAgaW5jKCkge1xuICAgICAgICB0aGlzLmNvdW50Kys7XG4gICAgfVxuXG4gICAgZG9uZSgpIHtcbiAgICAgICAgcmV0dXJuICh0aGlzLmNvdW50ID09PSB0aGlzLmxlbmd0aCk7XG4gICAgfVxufVxuXG4vKipcbiAqIENhbGxiYWNrIHVzZWQgYnkge0BsaW5rIEFwcEJhc2UjY29uZmlndXJlfSB3aGVuIGNvbmZpZ3VyYXRpb24gZmlsZSBpcyBsb2FkZWQgYW5kIHBhcnNlZCAob3JcbiAqIGFuIGVycm9yIG9jY3VycykuXG4gKlxuICogQGNhbGxiYWNrIENvbmZpZ3VyZUFwcENhbGxiYWNrXG4gKiBAcGFyYW0ge3N0cmluZ3xudWxsfSBlcnIgLSBUaGUgZXJyb3IgbWVzc2FnZSBpbiB0aGUgY2FzZSB3aGVyZSB0aGUgbG9hZGluZyBvciBwYXJzaW5nIGZhaWxzLlxuICovXG5cbi8qKlxuICogQ2FsbGJhY2sgdXNlZCBieSB7QGxpbmsgQXBwQmFzZSNwcmVsb2FkfSB3aGVuIGFsbCBhc3NldHMgKG1hcmtlZCBhcyAncHJlbG9hZCcpIGFyZSBsb2FkZWQuXG4gKlxuICogQGNhbGxiYWNrIFByZWxvYWRBcHBDYWxsYmFja1xuICovXG5cbi8qKlxuICogR2V0cyB0aGUgY3VycmVudCBhcHBsaWNhdGlvbiwgaWYgYW55LlxuICpcbiAqIEB0eXBlIHtBcHBCYXNlfG51bGx9XG4gKiBAaWdub3JlXG4gKi9cbmxldCBhcHAgPSBudWxsO1xuXG4vKipcbiAqIEFuIEFwcGxpY2F0aW9uIHJlcHJlc2VudHMgYW5kIG1hbmFnZXMgeW91ciBQbGF5Q2FudmFzIGFwcGxpY2F0aW9uLiBJZiB5b3UgYXJlIGRldmVsb3BpbmcgdXNpbmdcbiAqIHRoZSBQbGF5Q2FudmFzIEVkaXRvciwgdGhlIEFwcGxpY2F0aW9uIGlzIGNyZWF0ZWQgZm9yIHlvdS4gWW91IGNhbiBhY2Nlc3MgeW91ciBBcHBsaWNhdGlvblxuICogaW5zdGFuY2UgaW4geW91ciBzY3JpcHRzLiBCZWxvdyBpcyBhIHNrZWxldG9uIHNjcmlwdCB3aGljaCBzaG93cyBob3cgeW91IGNhbiBhY2Nlc3MgdGhlXG4gKiBhcHBsaWNhdGlvbiAnYXBwJyBwcm9wZXJ0eSBpbnNpZGUgdGhlIGluaXRpYWxpemUgYW5kIHVwZGF0ZSBmdW5jdGlvbnM6XG4gKlxuICogYGBgamF2YXNjcmlwdFxuICogLy8gRWRpdG9yIGV4YW1wbGU6IGFjY2Vzc2luZyB0aGUgcGMuQXBwbGljYXRpb24gZnJvbSBhIHNjcmlwdFxuICogdmFyIE15U2NyaXB0ID0gcGMuY3JlYXRlU2NyaXB0KCdteVNjcmlwdCcpO1xuICpcbiAqIE15U2NyaXB0LnByb3RvdHlwZS5pbml0aWFsaXplID0gZnVuY3Rpb24oKSB7XG4gKiAgICAgLy8gRXZlcnkgc2NyaXB0IGluc3RhbmNlIGhhcyBhIHByb3BlcnR5ICd0aGlzLmFwcCcgYWNjZXNzaWJsZSBpbiB0aGUgaW5pdGlhbGl6ZS4uLlxuICogICAgIGNvbnN0IGFwcCA9IHRoaXMuYXBwO1xuICogfTtcbiAqXG4gKiBNeVNjcmlwdC5wcm90b3R5cGUudXBkYXRlID0gZnVuY3Rpb24oZHQpIHtcbiAqICAgICAvLyAuLi5hbmQgdXBkYXRlIGZ1bmN0aW9ucy5cbiAqICAgICBjb25zdCBhcHAgPSB0aGlzLmFwcDtcbiAqIH07XG4gKiBgYGBcbiAqXG4gKiBJZiB5b3UgYXJlIHVzaW5nIHRoZSBFbmdpbmUgd2l0aG91dCB0aGUgRWRpdG9yLCB5b3UgaGF2ZSB0byBjcmVhdGUgdGhlIGFwcGxpY2F0aW9uIGluc3RhbmNlXG4gKiBtYW51YWxseS5cbiAqXG4gKiBAYXVnbWVudHMgRXZlbnRIYW5kbGVyXG4gKi9cbmNsYXNzIEFwcEJhc2UgZXh0ZW5kcyBFdmVudEhhbmRsZXIge1xuICAgIC8qKlxuICAgICAqIENyZWF0ZSBhIG5ldyBBcHBCYXNlIGluc3RhbmNlLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtIVE1MQ2FudmFzRWxlbWVudH0gY2FudmFzIC0gVGhlIGNhbnZhcyBlbGVtZW50LlxuICAgICAqIEBleGFtcGxlXG4gICAgICogLy8gRW5naW5lLW9ubHkgZXhhbXBsZTogY3JlYXRlIHRoZSBhcHBsaWNhdGlvbiBtYW51YWxseVxuICAgICAqIGNvbnN0IG9wdGlvbnMgPSBuZXcgQXBwT3B0aW9ucygpO1xuICAgICAqIGNvbnN0IGFwcCA9IG5ldyBwYy5BcHBCYXNlKGNhbnZhcyk7XG4gICAgICogYXBwLmluaXQob3B0aW9ucyk7XG4gICAgICpcbiAgICAgKiAvLyBTdGFydCB0aGUgYXBwbGljYXRpb24ncyBtYWluIGxvb3BcbiAgICAgKiBhcHAuc3RhcnQoKTtcbiAgICAgKlxuICAgICAqIEBoaWRlY29uc3RydWN0b3JcbiAgICAgKi9cbiAgICBjb25zdHJ1Y3RvcihjYW52YXMpIHtcbiAgICAgICAgc3VwZXIoKTtcblxuICAgICAgICAvLyAjaWYgX0RFQlVHXG4gICAgICAgIGlmICh2ZXJzaW9uPy5pbmRleE9mKCckJykgPCAwKSB7XG4gICAgICAgICAgICBEZWJ1Zy5sb2coYFBvd2VyZWQgYnkgUGxheUNhbnZhcyAke3ZlcnNpb259ICR7cmV2aXNpb259YCk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gI2VuZGlmXG5cbiAgICAgICAgLy8gU3RvcmUgYXBwbGljYXRpb24gaW5zdGFuY2VcbiAgICAgICAgQXBwQmFzZS5fYXBwbGljYXRpb25zW2NhbnZhcy5pZF0gPSB0aGlzO1xuICAgICAgICBzZXRBcHBsaWNhdGlvbih0aGlzKTtcblxuICAgICAgICBhcHAgPSB0aGlzO1xuXG4gICAgICAgIC8qKiBAcHJpdmF0ZSAqL1xuICAgICAgICB0aGlzLl9kZXN0cm95UmVxdWVzdGVkID0gZmFsc2U7XG5cbiAgICAgICAgLyoqIEBwcml2YXRlICovXG4gICAgICAgIHRoaXMuX2luRnJhbWVVcGRhdGUgPSBmYWxzZTtcblxuICAgICAgICAvKiogQHByaXZhdGUgKi9cbiAgICAgICAgdGhpcy5fdGltZSA9IDA7XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIFNjYWxlcyB0aGUgZ2xvYmFsIHRpbWUgZGVsdGEuIERlZmF1bHRzIHRvIDEuXG4gICAgICAgICAqXG4gICAgICAgICAqIEB0eXBlIHtudW1iZXJ9XG4gICAgICAgICAqIEBleGFtcGxlXG4gICAgICAgICAqIC8vIFNldCB0aGUgYXBwIHRvIHJ1biBhdCBoYWxmIHNwZWVkXG4gICAgICAgICAqIHRoaXMuYXBwLnRpbWVTY2FsZSA9IDAuNTtcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMudGltZVNjYWxlID0gMTtcblxuICAgICAgICAvKipcbiAgICAgICAgICogQ2xhbXBzIHBlci1mcmFtZSBkZWx0YSB0aW1lIHRvIGFuIHVwcGVyIGJvdW5kLiBVc2VmdWwgc2luY2UgcmV0dXJuaW5nIGZyb20gYSB0YWJcbiAgICAgICAgICogZGVhY3RpdmF0aW9uIGNhbiBnZW5lcmF0ZSBodWdlIHZhbHVlcyBmb3IgZHQsIHdoaWNoIGNhbiBhZHZlcnNlbHkgYWZmZWN0IGdhbWUgc3RhdGUuXG4gICAgICAgICAqIERlZmF1bHRzIHRvIDAuMSAoc2Vjb25kcykuXG4gICAgICAgICAqXG4gICAgICAgICAqIEB0eXBlIHtudW1iZXJ9XG4gICAgICAgICAqIEBleGFtcGxlXG4gICAgICAgICAqIC8vIERvbid0IGNsYW1wIGludGVyLWZyYW1lIHRpbWVzIG9mIDIwMG1zIG9yIGxlc3NcbiAgICAgICAgICogdGhpcy5hcHAubWF4RGVsdGFUaW1lID0gMC4yO1xuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5tYXhEZWx0YVRpbWUgPSAwLjE7IC8vIE1heGltdW0gZGVsdGEgaXMgMC4xcyBvciAxMCBmcHMuXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIFRoZSB0b3RhbCBudW1iZXIgb2YgZnJhbWVzIHRoZSBhcHBsaWNhdGlvbiBoYXMgdXBkYXRlZCBzaW5jZSBzdGFydCgpIHdhcyBjYWxsZWQuXG4gICAgICAgICAqXG4gICAgICAgICAqIEB0eXBlIHtudW1iZXJ9XG4gICAgICAgICAqIEBpZ25vcmVcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuZnJhbWUgPSAwO1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBXaGVuIHRydWUsIHRoZSBhcHBsaWNhdGlvbidzIHJlbmRlciBmdW5jdGlvbiBpcyBjYWxsZWQgZXZlcnkgZnJhbWUuIFNldHRpbmcgYXV0b1JlbmRlclxuICAgICAgICAgKiB0byBmYWxzZSBpcyB1c2VmdWwgdG8gYXBwbGljYXRpb25zIHdoZXJlIHRoZSByZW5kZXJlZCBpbWFnZSBtYXkgb2Z0ZW4gYmUgdW5jaGFuZ2VkIG92ZXJcbiAgICAgICAgICogdGltZS4gVGhpcyBjYW4gaGVhdmlseSByZWR1Y2UgdGhlIGFwcGxpY2F0aW9uJ3MgbG9hZCBvbiB0aGUgQ1BVIGFuZCBHUFUuIERlZmF1bHRzIHRvXG4gICAgICAgICAqIHRydWUuXG4gICAgICAgICAqXG4gICAgICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAgICAgKiBAZXhhbXBsZVxuICAgICAgICAgKiAvLyBEaXNhYmxlIHJlbmRlcmluZyBldmVyeSBmcmFtZSBhbmQgb25seSByZW5kZXIgb24gYSBrZXlkb3duIGV2ZW50XG4gICAgICAgICAqIHRoaXMuYXBwLmF1dG9SZW5kZXIgPSBmYWxzZTtcbiAgICAgICAgICogdGhpcy5hcHAua2V5Ym9hcmQub24oJ2tleWRvd24nLCBmdW5jdGlvbiAoZXZlbnQpIHtcbiAgICAgICAgICogICAgIHRoaXMuYXBwLnJlbmRlck5leHRGcmFtZSA9IHRydWU7XG4gICAgICAgICAqIH0sIHRoaXMpO1xuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5hdXRvUmVuZGVyID0gdHJ1ZTtcblxuICAgICAgICAvKipcbiAgICAgICAgICogU2V0IHRvIHRydWUgdG8gcmVuZGVyIHRoZSBzY2VuZSBvbiB0aGUgbmV4dCBpdGVyYXRpb24gb2YgdGhlIG1haW4gbG9vcC4gVGhpcyBvbmx5IGhhcyBhblxuICAgICAgICAgKiBlZmZlY3QgaWYge0BsaW5rIEFwcEJhc2UjYXV0b1JlbmRlcn0gaXMgc2V0IHRvIGZhbHNlLiBUaGUgdmFsdWUgb2YgcmVuZGVyTmV4dEZyYW1lXG4gICAgICAgICAqIGlzIHNldCBiYWNrIHRvIGZhbHNlIGFnYWluIGFzIHNvb24gYXMgdGhlIHNjZW5lIGhhcyBiZWVuIHJlbmRlcmVkLlxuICAgICAgICAgKlxuICAgICAgICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICAgICAgICogQGV4YW1wbGVcbiAgICAgICAgICogLy8gUmVuZGVyIHRoZSBzY2VuZSBvbmx5IHdoaWxlIHNwYWNlIGtleSBpcyBwcmVzc2VkXG4gICAgICAgICAqIGlmICh0aGlzLmFwcC5rZXlib2FyZC5pc1ByZXNzZWQocGMuS0VZX1NQQUNFKSkge1xuICAgICAgICAgKiAgICAgdGhpcy5hcHAucmVuZGVyTmV4dEZyYW1lID0gdHJ1ZTtcbiAgICAgICAgICogfVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5yZW5kZXJOZXh0RnJhbWUgPSBmYWxzZTtcblxuICAgICAgICAvKipcbiAgICAgICAgICogRW5hYmxlIGlmIHlvdSB3YW50IGVudGl0eSB0eXBlIHNjcmlwdCBhdHRyaWJ1dGVzIHRvIG5vdCBiZSByZS1tYXBwZWQgd2hlbiBhbiBlbnRpdHkgaXNcbiAgICAgICAgICogY2xvbmVkLlxuICAgICAgICAgKlxuICAgICAgICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICAgICAgICogQGlnbm9yZVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy51c2VMZWdhY3lTY3JpcHRBdHRyaWJ1dGVDbG9uaW5nID0gc2NyaXB0LmxlZ2FjeTtcblxuICAgICAgICB0aGlzLl9saWJyYXJpZXNMb2FkZWQgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fZmlsbE1vZGUgPSBGSUxMTU9ERV9LRUVQX0FTUEVDVDtcbiAgICAgICAgdGhpcy5fcmVzb2x1dGlvbk1vZGUgPSBSRVNPTFVUSU9OX0ZJWEVEO1xuICAgICAgICB0aGlzLl9hbGxvd1Jlc2l6ZSA9IHRydWU7XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEZvciBiYWNrd2FyZHMgY29tcGF0aWJpbGl0eSB3aXRoIHNjcmlwdHMgMS4wLlxuICAgICAgICAgKlxuICAgICAgICAgKiBAdHlwZSB7QXBwQmFzZX1cbiAgICAgICAgICogQGRlcHJlY2F0ZWRcbiAgICAgICAgICogQGlnbm9yZVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5jb250ZXh0ID0gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJbml0aWFsaXplIHRoZSBhcHAuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi9hcHAtb3B0aW9ucy5qcycpLkFwcE9wdGlvbnN9IGFwcE9wdGlvbnMgLSBPcHRpb25zIHNwZWNpZnlpbmcgdGhlIGluaXRcbiAgICAgKiBwYXJhbWV0ZXJzIGZvciB0aGUgYXBwLlxuICAgICAqL1xuICAgIGluaXQoYXBwT3B0aW9ucykge1xuICAgICAgICBjb25zdCBkZXZpY2UgPSBhcHBPcHRpb25zLmdyYXBoaWNzRGV2aWNlO1xuXG4gICAgICAgIERlYnVnLmFzc2VydChkZXZpY2UsIFwiVGhlIGFwcGxpY2F0aW9uIGNhbm5vdCBiZSBjcmVhdGVkIHdpdGhvdXQgYSB2YWxpZCBHcmFwaGljc0RldmljZVwiKTtcblxuICAgICAgICAvKipcbiAgICAgICAgICogVGhlIGdyYXBoaWNzIGRldmljZSB1c2VkIGJ5IHRoZSBhcHBsaWNhdGlvbi5cbiAgICAgICAgICpcbiAgICAgICAgICogQHR5cGUge2ltcG9ydCgnLi4vcGxhdGZvcm0vZ3JhcGhpY3MvZ3JhcGhpY3MtZGV2aWNlLmpzJykuR3JhcGhpY3NEZXZpY2V9XG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLmdyYXBoaWNzRGV2aWNlID0gZGV2aWNlO1xuICAgICAgICBHcmFwaGljc0RldmljZUFjY2Vzcy5zZXQoZGV2aWNlKTtcblxuICAgICAgICB0aGlzLl9pbml0RGVmYXVsdE1hdGVyaWFsKCk7XG4gICAgICAgIHRoaXMuX2luaXRQcm9ncmFtTGlicmFyeSgpO1xuICAgICAgICB0aGlzLnN0YXRzID0gbmV3IEFwcGxpY2F0aW9uU3RhdHMoZGV2aWNlKTtcblxuICAgICAgICAvKipcbiAgICAgICAgICogQHR5cGUge2ltcG9ydCgnLi4vcGxhdGZvcm0vc291bmQvbWFuYWdlci5qcycpLlNvdW5kTWFuYWdlcn1cbiAgICAgICAgICogQHByaXZhdGVcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuX3NvdW5kTWFuYWdlciA9IGFwcE9wdGlvbnMuc291bmRNYW5hZ2VyO1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBUaGUgcmVzb3VyY2UgbG9hZGVyLlxuICAgICAgICAgKlxuICAgICAgICAgKiBAdHlwZSB7UmVzb3VyY2VMb2FkZXJ9XG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLmxvYWRlciA9IG5ldyBSZXNvdXJjZUxvYWRlcih0aGlzKTtcblxuICAgICAgICBMaWdodHNCdWZmZXIuaW5pdChkZXZpY2UpO1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBTdG9yZXMgYWxsIGVudGl0aWVzIHRoYXQgaGF2ZSBiZWVuIGNyZWF0ZWQgZm9yIHRoaXMgYXBwIGJ5IGd1aWQuXG4gICAgICAgICAqXG4gICAgICAgICAqIEB0eXBlIHtPYmplY3Q8c3RyaW5nLCBFbnRpdHk+fVxuICAgICAgICAgKiBAaWdub3JlXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLl9lbnRpdHlJbmRleCA9IHt9O1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBUaGUgc2NlbmUgbWFuYWdlZCBieSB0aGUgYXBwbGljYXRpb24uXG4gICAgICAgICAqXG4gICAgICAgICAqIEB0eXBlIHtTY2VuZX1cbiAgICAgICAgICogQGV4YW1wbGVcbiAgICAgICAgICogLy8gU2V0IHRoZSB0b25lIG1hcHBpbmcgcHJvcGVydHkgb2YgdGhlIGFwcGxpY2F0aW9uJ3Mgc2NlbmVcbiAgICAgICAgICogdGhpcy5hcHAuc2NlbmUudG9uZU1hcHBpbmcgPSBwYy5UT05FTUFQX0ZJTE1JQztcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuc2NlbmUgPSBuZXcgU2NlbmUoZGV2aWNlKTtcbiAgICAgICAgdGhpcy5fcmVnaXN0ZXJTY2VuZUltbWVkaWF0ZSh0aGlzLnNjZW5lKTtcblxuICAgICAgICAvKipcbiAgICAgICAgICogVGhlIHJvb3QgZW50aXR5IG9mIHRoZSBhcHBsaWNhdGlvbi5cbiAgICAgICAgICpcbiAgICAgICAgICogQHR5cGUge0VudGl0eX1cbiAgICAgICAgICogQGV4YW1wbGVcbiAgICAgICAgICogLy8gUmV0dXJuIHRoZSBmaXJzdCBlbnRpdHkgY2FsbGVkICdDYW1lcmEnIGluIGEgZGVwdGgtZmlyc3Qgc2VhcmNoIG9mIHRoZSBzY2VuZSBoaWVyYXJjaHlcbiAgICAgICAgICogY29uc3QgY2FtZXJhID0gdGhpcy5hcHAucm9vdC5maW5kQnlOYW1lKCdDYW1lcmEnKTtcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMucm9vdCA9IG5ldyBFbnRpdHkoKTtcbiAgICAgICAgdGhpcy5yb290Ll9lbmFibGVkSW5IaWVyYXJjaHkgPSB0cnVlO1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBUaGUgYXNzZXQgcmVnaXN0cnkgbWFuYWdlZCBieSB0aGUgYXBwbGljYXRpb24uXG4gICAgICAgICAqXG4gICAgICAgICAqIEB0eXBlIHtBc3NldFJlZ2lzdHJ5fVxuICAgICAgICAgKiBAZXhhbXBsZVxuICAgICAgICAgKiAvLyBTZWFyY2ggdGhlIGFzc2V0IHJlZ2lzdHJ5IGZvciBhbGwgYXNzZXRzIHdpdGggdGhlIHRhZyAndmVoaWNsZSdcbiAgICAgICAgICogY29uc3QgdmVoaWNsZUFzc2V0cyA9IHRoaXMuYXBwLmFzc2V0cy5maW5kQnlUYWcoJ3ZlaGljbGUnKTtcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuYXNzZXRzID0gbmV3IEFzc2V0UmVnaXN0cnkodGhpcy5sb2FkZXIpO1xuICAgICAgICBpZiAoYXBwT3B0aW9ucy5hc3NldFByZWZpeCkgdGhpcy5hc3NldHMucHJlZml4ID0gYXBwT3B0aW9ucy5hc3NldFByZWZpeDtcblxuICAgICAgICAvKipcbiAgICAgICAgICogQHR5cGUge0J1bmRsZVJlZ2lzdHJ5fVxuICAgICAgICAgKiBAaWdub3JlXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLmJ1bmRsZXMgPSBuZXcgQnVuZGxlUmVnaXN0cnkodGhpcy5hc3NldHMpO1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBTZXQgdGhpcyB0byBmYWxzZSBpZiB5b3Ugd2FudCB0byBydW4gd2l0aG91dCB1c2luZyBidW5kbGVzLiBXZSBzZXQgaXQgdG8gdHJ1ZSBvbmx5IGlmXG4gICAgICAgICAqIFRleHREZWNvZGVyIGlzIGF2YWlsYWJsZSBiZWNhdXNlIHdlIGN1cnJlbnRseSByZWx5IG9uIGl0IGZvciB1bnRhcnJpbmcuXG4gICAgICAgICAqXG4gICAgICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAgICAgKiBAaWdub3JlXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLmVuYWJsZUJ1bmRsZXMgPSAodHlwZW9mIFRleHREZWNvZGVyICE9PSAndW5kZWZpbmVkJyk7XG5cbiAgICAgICAgdGhpcy5zY3JpcHRzT3JkZXIgPSBhcHBPcHRpb25zLnNjcmlwdHNPcmRlciB8fCBbXTtcblxuICAgICAgICAvKipcbiAgICAgICAgICogVGhlIGFwcGxpY2F0aW9uJ3Mgc2NyaXB0IHJlZ2lzdHJ5LlxuICAgICAgICAgKlxuICAgICAgICAgKiBAdHlwZSB7U2NyaXB0UmVnaXN0cnl9XG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLnNjcmlwdHMgPSBuZXcgU2NyaXB0UmVnaXN0cnkodGhpcyk7XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEhhbmRsZXMgbG9jYWxpemF0aW9uLlxuICAgICAgICAgKlxuICAgICAgICAgKiBAdHlwZSB7STE4bn1cbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuaTE4biA9IG5ldyBJMThuKHRoaXMpO1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBUaGUgc2NlbmUgcmVnaXN0cnkgbWFuYWdlZCBieSB0aGUgYXBwbGljYXRpb24uXG4gICAgICAgICAqXG4gICAgICAgICAqIEB0eXBlIHtTY2VuZVJlZ2lzdHJ5fVxuICAgICAgICAgKiBAZXhhbXBsZVxuICAgICAgICAgKiAvLyBTZWFyY2ggdGhlIHNjZW5lIHJlZ2lzdHJ5IGZvciBhIGl0ZW0gd2l0aCB0aGUgbmFtZSAncmFjZXRyYWNrMSdcbiAgICAgICAgICogY29uc3Qgc2NlbmVJdGVtID0gdGhpcy5hcHAuc2NlbmVzLmZpbmQoJ3JhY2V0cmFjazEnKTtcbiAgICAgICAgICpcbiAgICAgICAgICogLy8gTG9hZCB0aGUgc2NlbmUgdXNpbmcgdGhlIGl0ZW0ncyB1cmxcbiAgICAgICAgICogdGhpcy5hcHAuc2NlbmVzLmxvYWRTY2VuZShzY2VuZUl0ZW0udXJsKTtcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuc2NlbmVzID0gbmV3IFNjZW5lUmVnaXN0cnkodGhpcyk7XG5cbiAgICAgICAgY29uc3Qgc2VsZiA9IHRoaXM7XG4gICAgICAgIHRoaXMuZGVmYXVsdExheWVyV29ybGQgPSBuZXcgTGF5ZXIoe1xuICAgICAgICAgICAgbmFtZTogXCJXb3JsZFwiLFxuICAgICAgICAgICAgaWQ6IExBWUVSSURfV09STERcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdGhpcy5zY2VuZUdyYWIgPSBuZXcgU2NlbmVHcmFiKHRoaXMuZ3JhcGhpY3NEZXZpY2UsIHRoaXMuc2NlbmUpO1xuICAgICAgICB0aGlzLmRlZmF1bHRMYXllckRlcHRoID0gdGhpcy5zY2VuZUdyYWIubGF5ZXI7XG5cbiAgICAgICAgdGhpcy5kZWZhdWx0TGF5ZXJTa3lib3ggPSBuZXcgTGF5ZXIoe1xuICAgICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICAgIG5hbWU6IFwiU2t5Ym94XCIsXG4gICAgICAgICAgICBpZDogTEFZRVJJRF9TS1lCT1gsXG4gICAgICAgICAgICBvcGFxdWVTb3J0TW9kZTogU09SVE1PREVfTk9ORVxuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5kZWZhdWx0TGF5ZXJVaSA9IG5ldyBMYXllcih7XG4gICAgICAgICAgICBlbmFibGVkOiB0cnVlLFxuICAgICAgICAgICAgbmFtZTogXCJVSVwiLFxuICAgICAgICAgICAgaWQ6IExBWUVSSURfVUksXG4gICAgICAgICAgICB0cmFuc3BhcmVudFNvcnRNb2RlOiBTT1JUTU9ERV9NQU5VQUxcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuZGVmYXVsdExheWVySW1tZWRpYXRlID0gbmV3IExheWVyKHtcbiAgICAgICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgICBuYW1lOiBcIkltbWVkaWF0ZVwiLFxuICAgICAgICAgICAgaWQ6IExBWUVSSURfSU1NRURJQVRFLFxuICAgICAgICAgICAgb3BhcXVlU29ydE1vZGU6IFNPUlRNT0RFX05PTkVcbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uc3QgZGVmYXVsdExheWVyQ29tcG9zaXRpb24gPSBuZXcgTGF5ZXJDb21wb3NpdGlvbihcImRlZmF1bHRcIik7XG4gICAgICAgIGRlZmF1bHRMYXllckNvbXBvc2l0aW9uLnB1c2hPcGFxdWUodGhpcy5kZWZhdWx0TGF5ZXJXb3JsZCk7XG4gICAgICAgIGRlZmF1bHRMYXllckNvbXBvc2l0aW9uLnB1c2hPcGFxdWUodGhpcy5kZWZhdWx0TGF5ZXJEZXB0aCk7XG4gICAgICAgIGRlZmF1bHRMYXllckNvbXBvc2l0aW9uLnB1c2hPcGFxdWUodGhpcy5kZWZhdWx0TGF5ZXJTa3lib3gpO1xuICAgICAgICBkZWZhdWx0TGF5ZXJDb21wb3NpdGlvbi5wdXNoVHJhbnNwYXJlbnQodGhpcy5kZWZhdWx0TGF5ZXJXb3JsZCk7XG4gICAgICAgIGRlZmF1bHRMYXllckNvbXBvc2l0aW9uLnB1c2hPcGFxdWUodGhpcy5kZWZhdWx0TGF5ZXJJbW1lZGlhdGUpO1xuICAgICAgICBkZWZhdWx0TGF5ZXJDb21wb3NpdGlvbi5wdXNoVHJhbnNwYXJlbnQodGhpcy5kZWZhdWx0TGF5ZXJJbW1lZGlhdGUpO1xuICAgICAgICBkZWZhdWx0TGF5ZXJDb21wb3NpdGlvbi5wdXNoVHJhbnNwYXJlbnQodGhpcy5kZWZhdWx0TGF5ZXJVaSk7XG4gICAgICAgIHRoaXMuc2NlbmUubGF5ZXJzID0gZGVmYXVsdExheWVyQ29tcG9zaXRpb247XG5cbiAgICAgICAgLy8gRGVmYXVsdCBsYXllcnMgcGF0Y2hcbiAgICAgICAgdGhpcy5zY2VuZS5vbignc2V0OmxheWVycycsIGZ1bmN0aW9uIChvbGRDb21wLCBuZXdDb21wKSB7XG4gICAgICAgICAgICBjb25zdCBsaXN0ID0gbmV3Q29tcC5sYXllckxpc3Q7XG4gICAgICAgICAgICBsZXQgbGF5ZXI7XG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGxpc3QubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICBsYXllciA9IGxpc3RbaV07XG4gICAgICAgICAgICAgICAgc3dpdGNoIChsYXllci5pZCkge1xuICAgICAgICAgICAgICAgICAgICBjYXNlIExBWUVSSURfREVQVEg6XG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxmLnNjZW5lR3JhYi5wYXRjaChsYXllcik7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIHBsYWNlaG9sZGVyIHRleHR1cmUgZm9yIGFyZWEgbGlnaHQgTFVUc1xuICAgICAgICBBcmVhTGlnaHRMdXRzLmNyZWF0ZVBsYWNlaG9sZGVyKGRldmljZSk7XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIFRoZSBmb3J3YXJkIHJlbmRlcmVyLlxuICAgICAgICAgKlxuICAgICAgICAgKiBAdHlwZSB7Rm9yd2FyZFJlbmRlcmVyfVxuICAgICAgICAgKiBAaWdub3JlXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLnJlbmRlcmVyID0gbmV3IEZvcndhcmRSZW5kZXJlcihkZXZpY2UpO1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnNjZW5lID0gdGhpcy5zY2VuZTtcblxuICAgICAgICAvKipcbiAgICAgICAgICogVGhlIGZyYW1lIGdyYXBoLlxuICAgICAgICAgKlxuICAgICAgICAgKiBAdHlwZSB7RnJhbWVHcmFwaH1cbiAgICAgICAgICogQGlnbm9yZVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5mcmFtZUdyYXBoID0gbmV3IEZyYW1lR3JhcGgoKTtcblxuICAgICAgICAvKipcbiAgICAgICAgICogVGhlIHJ1bi10aW1lIGxpZ2h0bWFwcGVyLlxuICAgICAgICAgKlxuICAgICAgICAgKiBAdHlwZSB7aW1wb3J0KCcuL2xpZ2h0bWFwcGVyL2xpZ2h0bWFwcGVyLmpzJykuTGlnaHRtYXBwZXJ9XG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLmxpZ2h0bWFwcGVyID0gbnVsbDtcbiAgICAgICAgaWYgKGFwcE9wdGlvbnMubGlnaHRtYXBwZXIpIHtcbiAgICAgICAgICAgIHRoaXMubGlnaHRtYXBwZXIgPSBuZXcgYXBwT3B0aW9ucy5saWdodG1hcHBlcihkZXZpY2UsIHRoaXMucm9vdCwgdGhpcy5zY2VuZSwgdGhpcy5yZW5kZXJlciwgdGhpcy5hc3NldHMpO1xuICAgICAgICAgICAgdGhpcy5vbmNlKCdwcmVyZW5kZXInLCB0aGlzLl9maXJzdEJha2UsIHRoaXMpO1xuICAgICAgICB9XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIFRoZSBhcHBsaWNhdGlvbidzIGJhdGNoIG1hbmFnZXIuXG4gICAgICAgICAqXG4gICAgICAgICAqIEB0eXBlIHtpbXBvcnQoJy4uL3NjZW5lL2JhdGNoaW5nL2JhdGNoLW1hbmFnZXIuanMnKS5CYXRjaE1hbmFnZXJ9XG4gICAgICAgICAqIEBwcml2YXRlXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLl9iYXRjaGVyID0gbnVsbDtcbiAgICAgICAgaWYgKGFwcE9wdGlvbnMuYmF0Y2hNYW5hZ2VyKSB7XG4gICAgICAgICAgICB0aGlzLl9iYXRjaGVyID0gbmV3IGFwcE9wdGlvbnMuYmF0Y2hNYW5hZ2VyKGRldmljZSwgdGhpcy5yb290LCB0aGlzLnNjZW5lKTtcbiAgICAgICAgICAgIHRoaXMub25jZSgncHJlcmVuZGVyJywgdGhpcy5fZmlyc3RCYXRjaCwgdGhpcyk7XG4gICAgICAgIH1cblxuICAgICAgICAvKipcbiAgICAgICAgICogVGhlIGtleWJvYXJkIGRldmljZS5cbiAgICAgICAgICpcbiAgICAgICAgICogQHR5cGUge2ltcG9ydCgnLi4vcGxhdGZvcm0vaW5wdXQva2V5Ym9hcmQuanMnKS5LZXlib2FyZH1cbiAgICAgICAgICovXG4gICAgICAgIHRoaXMua2V5Ym9hcmQgPSBhcHBPcHRpb25zLmtleWJvYXJkIHx8IG51bGw7XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIFRoZSBtb3VzZSBkZXZpY2UuXG4gICAgICAgICAqXG4gICAgICAgICAqIEB0eXBlIHtpbXBvcnQoJy4uL3BsYXRmb3JtL2lucHV0L21vdXNlLmpzJykuTW91c2V9XG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLm1vdXNlID0gYXBwT3B0aW9ucy5tb3VzZSB8fCBudWxsO1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBVc2VkIHRvIGdldCB0b3VjaCBldmVudHMgaW5wdXQuXG4gICAgICAgICAqXG4gICAgICAgICAqIEB0eXBlIHtpbXBvcnQoJy4uL3BsYXRmb3JtL2lucHV0L3RvdWNoLWRldmljZS5qcycpLlRvdWNoRGV2aWNlfVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy50b3VjaCA9IGFwcE9wdGlvbnMudG91Y2ggfHwgbnVsbDtcblxuICAgICAgICAvKipcbiAgICAgICAgICogVXNlZCB0byBhY2Nlc3MgR2FtZVBhZCBpbnB1dC5cbiAgICAgICAgICpcbiAgICAgICAgICogQHR5cGUge2ltcG9ydCgnLi4vcGxhdGZvcm0vaW5wdXQvZ2FtZS1wYWRzLmpzJykuR2FtZVBhZHN9XG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLmdhbWVwYWRzID0gYXBwT3B0aW9ucy5nYW1lcGFkcyB8fCBudWxsO1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBVc2VkIHRvIGhhbmRsZSBpbnB1dCBmb3Ige0BsaW5rIEVsZW1lbnRDb21wb25lbnR9cy5cbiAgICAgICAgICpcbiAgICAgICAgICogQHR5cGUge2ltcG9ydCgnLi9pbnB1dC9lbGVtZW50LWlucHV0LmpzJykuRWxlbWVudElucHV0fVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5lbGVtZW50SW5wdXQgPSBhcHBPcHRpb25zLmVsZW1lbnRJbnB1dCB8fCBudWxsO1xuICAgICAgICBpZiAodGhpcy5lbGVtZW50SW5wdXQpXG4gICAgICAgICAgICB0aGlzLmVsZW1lbnRJbnB1dC5hcHAgPSB0aGlzO1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBUaGUgWFIgTWFuYWdlciB0aGF0IHByb3ZpZGVzIGFiaWxpdHkgdG8gc3RhcnQgVlIvQVIgc2Vzc2lvbnMuXG4gICAgICAgICAqXG4gICAgICAgICAqIEB0eXBlIHtpbXBvcnQoJy4veHIveHItbWFuYWdlci5qcycpLlhyTWFuYWdlcn1cbiAgICAgICAgICogQGV4YW1wbGVcbiAgICAgICAgICogLy8gY2hlY2sgaWYgVlIgaXMgYXZhaWxhYmxlXG4gICAgICAgICAqIGlmIChhcHAueHIuaXNBdmFpbGFibGUocGMuWFJUWVBFX1ZSKSkge1xuICAgICAgICAgKiAgICAgLy8gVlIgaXMgYXZhaWxhYmxlXG4gICAgICAgICAqIH1cbiAgICAgICAgICovXG4gICAgICAgIHRoaXMueHIgPSBhcHBPcHRpb25zLnhyID8gbmV3IGFwcE9wdGlvbnMueHIodGhpcykgOiBudWxsO1xuXG4gICAgICAgIGlmICh0aGlzLmVsZW1lbnRJbnB1dClcbiAgICAgICAgICAgIHRoaXMuZWxlbWVudElucHV0LmF0dGFjaFNlbGVjdEV2ZW50cygpO1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICAgICAgICogQGlnbm9yZVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5faW5Ub29scyA9IGZhbHNlO1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAdHlwZSB7QXNzZXR8bnVsbH1cbiAgICAgICAgICogQHByaXZhdGVcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuX3NreWJveEFzc2V0ID0gbnVsbDtcblxuICAgICAgICAvKipcbiAgICAgICAgICogQHR5cGUge3N0cmluZ31cbiAgICAgICAgICogQGlnbm9yZVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5fc2NyaXB0UHJlZml4ID0gYXBwT3B0aW9ucy5zY3JpcHRQcmVmaXggfHwgJyc7XG5cbiAgICAgICAgaWYgKHRoaXMuZW5hYmxlQnVuZGxlcykge1xuICAgICAgICAgICAgdGhpcy5sb2FkZXIuYWRkSGFuZGxlcihcImJ1bmRsZVwiLCBuZXcgQnVuZGxlSGFuZGxlcih0aGlzKSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBjcmVhdGUgYW5kIHJlZ2lzdGVyIGFsbCByZXF1aXJlZCByZXNvdXJjZSBoYW5kbGVyc1xuICAgICAgICBhcHBPcHRpb25zLnJlc291cmNlSGFuZGxlcnMuZm9yRWFjaCgocmVzb3VyY2VIYW5kbGVyKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBoYW5kbGVyID0gbmV3IHJlc291cmNlSGFuZGxlcih0aGlzKTtcbiAgICAgICAgICAgIHRoaXMubG9hZGVyLmFkZEhhbmRsZXIoaGFuZGxlci5oYW5kbGVyVHlwZSwgaGFuZGxlcik7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBUaGUgYXBwbGljYXRpb24ncyBjb21wb25lbnQgc3lzdGVtIHJlZ2lzdHJ5LiBUaGUgQXBwbGljYXRpb24gY29uc3RydWN0b3IgYWRkcyB0aGVcbiAgICAgICAgICogZm9sbG93aW5nIGNvbXBvbmVudCBzeXN0ZW1zIHRvIGl0cyBjb21wb25lbnQgc3lzdGVtIHJlZ2lzdHJ5OlxuICAgICAgICAgKlxuICAgICAgICAgKiAtIGFuaW0gKHtAbGluayBBbmltQ29tcG9uZW50U3lzdGVtfSlcbiAgICAgICAgICogLSBhbmltYXRpb24gKHtAbGluayBBbmltYXRpb25Db21wb25lbnRTeXN0ZW19KVxuICAgICAgICAgKiAtIGF1ZGlvbGlzdGVuZXIgKHtAbGluayBBdWRpb0xpc3RlbmVyQ29tcG9uZW50U3lzdGVtfSlcbiAgICAgICAgICogLSBidXR0b24gKHtAbGluayBCdXR0b25Db21wb25lbnRTeXN0ZW19KVxuICAgICAgICAgKiAtIGNhbWVyYSAoe0BsaW5rIENhbWVyYUNvbXBvbmVudFN5c3RlbX0pXG4gICAgICAgICAqIC0gY29sbGlzaW9uICh7QGxpbmsgQ29sbGlzaW9uQ29tcG9uZW50U3lzdGVtfSlcbiAgICAgICAgICogLSBlbGVtZW50ICh7QGxpbmsgRWxlbWVudENvbXBvbmVudFN5c3RlbX0pXG4gICAgICAgICAqIC0gbGF5b3V0Y2hpbGQgKHtAbGluayBMYXlvdXRDaGlsZENvbXBvbmVudFN5c3RlbX0pXG4gICAgICAgICAqIC0gbGF5b3V0Z3JvdXAgKHtAbGluayBMYXlvdXRHcm91cENvbXBvbmVudFN5c3RlbX0pXG4gICAgICAgICAqIC0gbGlnaHQgKHtAbGluayBMaWdodENvbXBvbmVudFN5c3RlbX0pXG4gICAgICAgICAqIC0gbW9kZWwgKHtAbGluayBNb2RlbENvbXBvbmVudFN5c3RlbX0pXG4gICAgICAgICAqIC0gcGFydGljbGVzeXN0ZW0gKHtAbGluayBQYXJ0aWNsZVN5c3RlbUNvbXBvbmVudFN5c3RlbX0pXG4gICAgICAgICAqIC0gcmlnaWRib2R5ICh7QGxpbmsgUmlnaWRCb2R5Q29tcG9uZW50U3lzdGVtfSlcbiAgICAgICAgICogLSByZW5kZXIgKHtAbGluayBSZW5kZXJDb21wb25lbnRTeXN0ZW19KVxuICAgICAgICAgKiAtIHNjcmVlbiAoe0BsaW5rIFNjcmVlbkNvbXBvbmVudFN5c3RlbX0pXG4gICAgICAgICAqIC0gc2NyaXB0ICh7QGxpbmsgU2NyaXB0Q29tcG9uZW50U3lzdGVtfSlcbiAgICAgICAgICogLSBzY3JvbGxiYXIgKHtAbGluayBTY3JvbGxiYXJDb21wb25lbnRTeXN0ZW19KVxuICAgICAgICAgKiAtIHNjcm9sbHZpZXcgKHtAbGluayBTY3JvbGxWaWV3Q29tcG9uZW50U3lzdGVtfSlcbiAgICAgICAgICogLSBzb3VuZCAoe0BsaW5rIFNvdW5kQ29tcG9uZW50U3lzdGVtfSlcbiAgICAgICAgICogLSBzcHJpdGUgKHtAbGluayBTcHJpdGVDb21wb25lbnRTeXN0ZW19KVxuICAgICAgICAgKlxuICAgICAgICAgKiBAdHlwZSB7Q29tcG9uZW50U3lzdGVtUmVnaXN0cnl9XG4gICAgICAgICAqIEBleGFtcGxlXG4gICAgICAgICAqIC8vIFNldCBnbG9iYWwgZ3Jhdml0eSB0byB6ZXJvXG4gICAgICAgICAqIHRoaXMuYXBwLnN5c3RlbXMucmlnaWRib2R5LmdyYXZpdHkuc2V0KDAsIDAsIDApO1xuICAgICAgICAgKiBAZXhhbXBsZVxuICAgICAgICAgKiAvLyBTZXQgdGhlIGdsb2JhbCBzb3VuZCB2b2x1bWUgdG8gNTAlXG4gICAgICAgICAqIHRoaXMuYXBwLnN5c3RlbXMuc291bmQudm9sdW1lID0gMC41O1xuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5zeXN0ZW1zID0gbmV3IENvbXBvbmVudFN5c3RlbVJlZ2lzdHJ5KCk7XG5cbiAgICAgICAgLy8gY3JlYXRlIGFuZCByZWdpc3RlciBhbGwgcmVxdWlyZWQgY29tcG9uZW50IHN5c3RlbXNcbiAgICAgICAgYXBwT3B0aW9ucy5jb21wb25lbnRTeXN0ZW1zLmZvckVhY2goKGNvbXBvbmVudFN5c3RlbSkgPT4ge1xuICAgICAgICAgICAgdGhpcy5zeXN0ZW1zLmFkZChuZXcgY29tcG9uZW50U3lzdGVtKHRoaXMpKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLyoqIEBwcml2YXRlICovXG4gICAgICAgIHRoaXMuX3Zpc2liaWxpdHlDaGFuZ2VIYW5kbGVyID0gdGhpcy5vblZpc2liaWxpdHlDaGFuZ2UuYmluZCh0aGlzKTtcblxuICAgICAgICAvLyBEZXBlbmRpbmcgb24gYnJvd3NlciBhZGQgdGhlIGNvcnJlY3QgdmlzaWJpbGl0eWNoYW5nZSBldmVudCBhbmQgc3RvcmUgdGhlIG5hbWUgb2YgdGhlXG4gICAgICAgIC8vIGhpZGRlbiBhdHRyaWJ1dGUgaW4gdGhpcy5faGlkZGVuQXR0ci5cbiAgICAgICAgaWYgKHR5cGVvZiBkb2N1bWVudCAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgIGlmIChkb2N1bWVudC5oaWRkZW4gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIHRoaXMuX2hpZGRlbkF0dHIgPSAnaGlkZGVuJztcbiAgICAgICAgICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCd2aXNpYmlsaXR5Y2hhbmdlJywgdGhpcy5fdmlzaWJpbGl0eUNoYW5nZUhhbmRsZXIsIGZhbHNlKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZG9jdW1lbnQubW96SGlkZGVuICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9oaWRkZW5BdHRyID0gJ21vekhpZGRlbic7XG4gICAgICAgICAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW96dmlzaWJpbGl0eWNoYW5nZScsIHRoaXMuX3Zpc2liaWxpdHlDaGFuZ2VIYW5kbGVyLCBmYWxzZSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGRvY3VtZW50Lm1zSGlkZGVuICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9oaWRkZW5BdHRyID0gJ21zSGlkZGVuJztcbiAgICAgICAgICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdtc3Zpc2liaWxpdHljaGFuZ2UnLCB0aGlzLl92aXNpYmlsaXR5Q2hhbmdlSGFuZGxlciwgZmFsc2UpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChkb2N1bWVudC53ZWJraXRIaWRkZW4gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIHRoaXMuX2hpZGRlbkF0dHIgPSAnd2Via2l0SGlkZGVuJztcbiAgICAgICAgICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCd3ZWJraXR2aXNpYmlsaXR5Y2hhbmdlJywgdGhpcy5fdmlzaWJpbGl0eUNoYW5nZUhhbmRsZXIsIGZhbHNlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGJpbmQgdGljayBmdW5jdGlvbiB0byBjdXJyZW50IHNjb3BlXG4gICAgICAgIC8qIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby11c2UtYmVmb3JlLWRlZmluZSAqL1xuICAgICAgICB0aGlzLnRpY2sgPSBtYWtlVGljayh0aGlzKTsgLy8gQ2lyY3VsYXIgbGludGluZyBpc3N1ZSBhcyBtYWtlVGljayBhbmQgQXBwbGljYXRpb24gcmVmZXJlbmNlIGVhY2ggb3RoZXJcbiAgICB9XG5cbiAgICBzdGF0aWMgX2FwcGxpY2F0aW9ucyA9IHt9O1xuXG4gICAgLyoqXG4gICAgICogR2V0IHRoZSBjdXJyZW50IGFwcGxpY2F0aW9uLiBJbiB0aGUgY2FzZSB3aGVyZSB0aGVyZSBhcmUgbXVsdGlwbGUgcnVubmluZyBhcHBsaWNhdGlvbnMsIHRoZVxuICAgICAqIGZ1bmN0aW9uIGNhbiBnZXQgYW4gYXBwbGljYXRpb24gYmFzZWQgb24gYSBzdXBwbGllZCBjYW52YXMgaWQuIFRoaXMgZnVuY3Rpb24gaXMgcGFydGljdWxhcmx5XG4gICAgICogdXNlZnVsIHdoZW4gdGhlIGN1cnJlbnQgQXBwbGljYXRpb24gaXMgbm90IHJlYWRpbHkgYXZhaWxhYmxlLiBGb3IgZXhhbXBsZSwgaW4gdGhlIEphdmFTY3JpcHRcbiAgICAgKiBjb25zb2xlIG9mIHRoZSBicm93c2VyJ3MgZGV2ZWxvcGVyIHRvb2xzLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IFtpZF0gLSBJZiBkZWZpbmVkLCB0aGUgcmV0dXJuZWQgYXBwbGljYXRpb24gc2hvdWxkIHVzZSB0aGUgY2FudmFzIHdoaWNoIGhhc1xuICAgICAqIHRoaXMgaWQuIE90aGVyd2lzZSBjdXJyZW50IGFwcGxpY2F0aW9uIHdpbGwgYmUgcmV0dXJuZWQuXG4gICAgICogQHJldHVybnMge0FwcEJhc2V8dW5kZWZpbmVkfSBUaGUgcnVubmluZyBhcHBsaWNhdGlvbiwgaWYgYW55LlxuICAgICAqIEBleGFtcGxlXG4gICAgICogY29uc3QgYXBwID0gcGMuQXBwQmFzZS5nZXRBcHBsaWNhdGlvbigpO1xuICAgICAqL1xuICAgIHN0YXRpYyBnZXRBcHBsaWNhdGlvbihpZCkge1xuICAgICAgICByZXR1cm4gaWQgPyBBcHBCYXNlLl9hcHBsaWNhdGlvbnNbaWRdIDogZ2V0QXBwbGljYXRpb24oKTtcbiAgICB9XG5cbiAgICAvKiogQHByaXZhdGUgKi9cbiAgICBfaW5pdERlZmF1bHRNYXRlcmlhbCgpIHtcbiAgICAgICAgY29uc3QgbWF0ZXJpYWwgPSBuZXcgU3RhbmRhcmRNYXRlcmlhbCgpO1xuICAgICAgICBtYXRlcmlhbC5uYW1lID0gXCJEZWZhdWx0IE1hdGVyaWFsXCI7XG4gICAgICAgIG1hdGVyaWFsLnNoYWRpbmdNb2RlbCA9IFNQRUNVTEFSX0JMSU5OO1xuICAgICAgICBzZXREZWZhdWx0TWF0ZXJpYWwodGhpcy5ncmFwaGljc0RldmljZSwgbWF0ZXJpYWwpO1xuICAgIH1cblxuICAgIC8qKiBAcHJpdmF0ZSAqL1xuICAgIF9pbml0UHJvZ3JhbUxpYnJhcnkoKSB7XG4gICAgICAgIGNvbnN0IGxpYnJhcnkgPSBuZXcgUHJvZ3JhbUxpYnJhcnkodGhpcy5ncmFwaGljc0RldmljZSwgbmV3IFN0YW5kYXJkTWF0ZXJpYWwoKSk7XG4gICAgICAgIHNldFByb2dyYW1MaWJyYXJ5KHRoaXMuZ3JhcGhpY3NEZXZpY2UsIGxpYnJhcnkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEB0eXBlIHtpbXBvcnQoJy4uL3BsYXRmb3JtL3NvdW5kL21hbmFnZXIuanMnKS5Tb3VuZE1hbmFnZXJ9XG4gICAgICogQGlnbm9yZVxuICAgICAqL1xuICAgIGdldCBzb3VuZE1hbmFnZXIoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9zb3VuZE1hbmFnZXI7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVGhlIGFwcGxpY2F0aW9uJ3MgYmF0Y2ggbWFuYWdlci4gVGhlIGJhdGNoIG1hbmFnZXIgaXMgdXNlZCB0byBtZXJnZSBtZXNoIGluc3RhbmNlcyBpblxuICAgICAqIHRoZSBzY2VuZSwgd2hpY2ggcmVkdWNlcyB0aGUgb3ZlcmFsbCBudW1iZXIgb2YgZHJhdyBjYWxscywgdGhlcmVieSBib29zdGluZyBwZXJmb3JtYW5jZS5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtpbXBvcnQoJy4uL3NjZW5lL2JhdGNoaW5nL2JhdGNoLW1hbmFnZXIuanMnKS5CYXRjaE1hbmFnZXJ9XG4gICAgICovXG4gICAgZ2V0IGJhdGNoZXIoKSB7XG4gICAgICAgIERlYnVnLmFzc2VydCh0aGlzLl9iYXRjaGVyLCBcIkJhdGNoTWFuYWdlciBoYXMgbm90IGJlZW4gY3JlYXRlZCBhbmQgaXMgcmVxdWlyZWQgZm9yIGNvcnJlY3QgZnVuY3Rpb25hbGl0eS5cIik7XG4gICAgICAgIHJldHVybiB0aGlzLl9iYXRjaGVyO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRoZSBjdXJyZW50IGZpbGwgbW9kZSBvZiB0aGUgY2FudmFzLiBDYW4gYmU6XG4gICAgICpcbiAgICAgKiAtIHtAbGluayBGSUxMTU9ERV9OT05FfTogdGhlIGNhbnZhcyB3aWxsIGFsd2F5cyBtYXRjaCB0aGUgc2l6ZSBwcm92aWRlZC5cbiAgICAgKiAtIHtAbGluayBGSUxMTU9ERV9GSUxMX1dJTkRPV306IHRoZSBjYW52YXMgd2lsbCBzaW1wbHkgZmlsbCB0aGUgd2luZG93LCBjaGFuZ2luZyBhc3BlY3QgcmF0aW8uXG4gICAgICogLSB7QGxpbmsgRklMTE1PREVfS0VFUF9BU1BFQ1R9OiB0aGUgY2FudmFzIHdpbGwgZ3JvdyB0byBmaWxsIHRoZSB3aW5kb3cgYXMgYmVzdCBpdCBjYW4gd2hpbGVcbiAgICAgKiBtYWludGFpbmluZyB0aGUgYXNwZWN0IHJhdGlvLlxuICAgICAqXG4gICAgICogQHR5cGUge3N0cmluZ31cbiAgICAgKi9cbiAgICBnZXQgZmlsbE1vZGUoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9maWxsTW9kZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUaGUgY3VycmVudCByZXNvbHV0aW9uIG1vZGUgb2YgdGhlIGNhbnZhcywgQ2FuIGJlOlxuICAgICAqXG4gICAgICogLSB7QGxpbmsgUkVTT0xVVElPTl9BVVRPfTogaWYgd2lkdGggYW5kIGhlaWdodCBhcmUgbm90IHByb3ZpZGVkLCBjYW52YXMgd2lsbCBiZSByZXNpemVkIHRvXG4gICAgICogbWF0Y2ggY2FudmFzIGNsaWVudCBzaXplLlxuICAgICAqIC0ge0BsaW5rIFJFU09MVVRJT05fRklYRUR9OiByZXNvbHV0aW9uIG9mIGNhbnZhcyB3aWxsIGJlIGZpeGVkLlxuICAgICAqXG4gICAgICogQHR5cGUge3N0cmluZ31cbiAgICAgKi9cbiAgICBnZXQgcmVzb2x1dGlvbk1vZGUoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9yZXNvbHV0aW9uTW9kZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBMb2FkIHRoZSBhcHBsaWNhdGlvbiBjb25maWd1cmF0aW9uIGZpbGUgYW5kIGFwcGx5IGFwcGxpY2F0aW9uIHByb3BlcnRpZXMgYW5kIGZpbGwgdGhlIGFzc2V0XG4gICAgICogcmVnaXN0cnkuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gdXJsIC0gVGhlIFVSTCBvZiB0aGUgY29uZmlndXJhdGlvbiBmaWxlIHRvIGxvYWQuXG4gICAgICogQHBhcmFtIHtDb25maWd1cmVBcHBDYWxsYmFja30gY2FsbGJhY2sgLSBUaGUgRnVuY3Rpb24gY2FsbGVkIHdoZW4gdGhlIGNvbmZpZ3VyYXRpb24gZmlsZSBpc1xuICAgICAqIGxvYWRlZCBhbmQgcGFyc2VkIChvciBhbiBlcnJvciBvY2N1cnMpLlxuICAgICAqL1xuICAgIGNvbmZpZ3VyZSh1cmwsIGNhbGxiYWNrKSB7XG4gICAgICAgIGh0dHAuZ2V0KHVybCwgKGVyciwgcmVzcG9uc2UpID0+IHtcbiAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgICBjYWxsYmFjayhlcnIpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgcHJvcHMgPSByZXNwb25zZS5hcHBsaWNhdGlvbl9wcm9wZXJ0aWVzO1xuICAgICAgICAgICAgY29uc3Qgc2NlbmVzID0gcmVzcG9uc2Uuc2NlbmVzO1xuICAgICAgICAgICAgY29uc3QgYXNzZXRzID0gcmVzcG9uc2UuYXNzZXRzO1xuXG4gICAgICAgICAgICB0aGlzLl9wYXJzZUFwcGxpY2F0aW9uUHJvcGVydGllcyhwcm9wcywgKGVycikgPT4ge1xuICAgICAgICAgICAgICAgIHRoaXMuX3BhcnNlU2NlbmVzKHNjZW5lcyk7XG4gICAgICAgICAgICAgICAgdGhpcy5fcGFyc2VBc3NldHMoYXNzZXRzKTtcbiAgICAgICAgICAgICAgICBpZiAoIWVycikge1xuICAgICAgICAgICAgICAgICAgICBjYWxsYmFjayhudWxsKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBjYWxsYmFjayhlcnIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBMb2FkIGFsbCBhc3NldHMgaW4gdGhlIGFzc2V0IHJlZ2lzdHJ5IHRoYXQgYXJlIG1hcmtlZCBhcyAncHJlbG9hZCcuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1ByZWxvYWRBcHBDYWxsYmFja30gY2FsbGJhY2sgLSBGdW5jdGlvbiBjYWxsZWQgd2hlbiBhbGwgYXNzZXRzIGFyZSBsb2FkZWQuXG4gICAgICovXG4gICAgcHJlbG9hZChjYWxsYmFjaykge1xuICAgICAgICB0aGlzLmZpcmUoXCJwcmVsb2FkOnN0YXJ0XCIpO1xuXG4gICAgICAgIC8vIGdldCBsaXN0IG9mIGFzc2V0cyB0byBwcmVsb2FkXG4gICAgICAgIGNvbnN0IGFzc2V0cyA9IHRoaXMuYXNzZXRzLmxpc3Qoe1xuICAgICAgICAgICAgcHJlbG9hZDogdHJ1ZVxuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCBwcm9ncmVzcyA9IG5ldyBQcm9ncmVzcyhhc3NldHMubGVuZ3RoKTtcblxuICAgICAgICBsZXQgX2RvbmUgPSBmYWxzZTtcblxuICAgICAgICAvLyBjaGVjayBpZiBhbGwgbG9hZGluZyBpcyBkb25lXG4gICAgICAgIGNvbnN0IGRvbmUgPSAoKSA9PiB7XG4gICAgICAgICAgICAvLyBkbyBub3QgcHJvY2VlZCBpZiBhcHBsaWNhdGlvbiBkZXN0cm95ZWRcbiAgICAgICAgICAgIGlmICghdGhpcy5ncmFwaGljc0RldmljZSkge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKCFfZG9uZSAmJiBwcm9ncmVzcy5kb25lKCkpIHtcbiAgICAgICAgICAgICAgICBfZG9uZSA9IHRydWU7XG4gICAgICAgICAgICAgICAgdGhpcy5maXJlKFwicHJlbG9hZDplbmRcIik7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2soKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICAvLyB0b3RhbHMgbG9hZGluZyBwcm9ncmVzcyBvZiBhc3NldHNcbiAgICAgICAgY29uc3QgdG90YWwgPSBhc3NldHMubGVuZ3RoO1xuXG4gICAgICAgIGlmIChwcm9ncmVzcy5sZW5ndGgpIHtcbiAgICAgICAgICAgIGNvbnN0IG9uQXNzZXRMb2FkID0gKGFzc2V0KSA9PiB7XG4gICAgICAgICAgICAgICAgcHJvZ3Jlc3MuaW5jKCk7XG4gICAgICAgICAgICAgICAgdGhpcy5maXJlKCdwcmVsb2FkOnByb2dyZXNzJywgcHJvZ3Jlc3MuY291bnQgLyB0b3RhbCk7XG5cbiAgICAgICAgICAgICAgICBpZiAocHJvZ3Jlc3MuZG9uZSgpKVxuICAgICAgICAgICAgICAgICAgICBkb25lKCk7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBjb25zdCBvbkFzc2V0RXJyb3IgPSAoZXJyLCBhc3NldCkgPT4ge1xuICAgICAgICAgICAgICAgIHByb2dyZXNzLmluYygpO1xuICAgICAgICAgICAgICAgIHRoaXMuZmlyZSgncHJlbG9hZDpwcm9ncmVzcycsIHByb2dyZXNzLmNvdW50IC8gdG90YWwpO1xuXG4gICAgICAgICAgICAgICAgaWYgKHByb2dyZXNzLmRvbmUoKSlcbiAgICAgICAgICAgICAgICAgICAgZG9uZSgpO1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgLy8gZm9yIGVhY2ggYXNzZXRcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYXNzZXRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFhc3NldHNbaV0ubG9hZGVkKSB7XG4gICAgICAgICAgICAgICAgICAgIGFzc2V0c1tpXS5vbmNlKCdsb2FkJywgb25Bc3NldExvYWQpO1xuICAgICAgICAgICAgICAgICAgICBhc3NldHNbaV0ub25jZSgnZXJyb3InLCBvbkFzc2V0RXJyb3IpO1xuXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYXNzZXRzLmxvYWQoYXNzZXRzW2ldKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBwcm9ncmVzcy5pbmMoKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5maXJlKFwicHJlbG9hZDpwcm9ncmVzc1wiLCBwcm9ncmVzcy5jb3VudCAvIHRvdGFsKTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAocHJvZ3Jlc3MuZG9uZSgpKVxuICAgICAgICAgICAgICAgICAgICAgICAgZG9uZSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGRvbmUoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIF9wcmVsb2FkU2NyaXB0cyhzY2VuZURhdGEsIGNhbGxiYWNrKSB7XG4gICAgICAgIGlmICghc2NyaXB0LmxlZ2FjeSkge1xuICAgICAgICAgICAgY2FsbGJhY2soKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuc3lzdGVtcy5zY3JpcHQucHJlbG9hZGluZyA9IHRydWU7XG5cbiAgICAgICAgY29uc3Qgc2NyaXB0cyA9IHRoaXMuX2dldFNjcmlwdFJlZmVyZW5jZXMoc2NlbmVEYXRhKTtcblxuICAgICAgICBjb25zdCBsID0gc2NyaXB0cy5sZW5ndGg7XG4gICAgICAgIGNvbnN0IHByb2dyZXNzID0gbmV3IFByb2dyZXNzKGwpO1xuICAgICAgICBjb25zdCByZWdleCA9IC9eaHR0cChzKT86XFwvXFwvLztcblxuICAgICAgICBpZiAobCkge1xuICAgICAgICAgICAgY29uc3Qgb25Mb2FkID0gKGVyciwgU2NyaXB0VHlwZSkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChlcnIpXG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoZXJyKTtcblxuICAgICAgICAgICAgICAgIHByb2dyZXNzLmluYygpO1xuICAgICAgICAgICAgICAgIGlmIChwcm9ncmVzcy5kb25lKCkpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zeXN0ZW1zLnNjcmlwdC5wcmVsb2FkaW5nID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgICAgICAgICBsZXQgc2NyaXB0VXJsID0gc2NyaXB0c1tpXTtcbiAgICAgICAgICAgICAgICAvLyBzdXBwb3J0IGFic29sdXRlIFVSTHMgKGZvciBub3cpXG4gICAgICAgICAgICAgICAgaWYgKCFyZWdleC50ZXN0KHNjcmlwdFVybC50b0xvd2VyQ2FzZSgpKSAmJiB0aGlzLl9zY3JpcHRQcmVmaXgpXG4gICAgICAgICAgICAgICAgICAgIHNjcmlwdFVybCA9IHBhdGguam9pbih0aGlzLl9zY3JpcHRQcmVmaXgsIHNjcmlwdHNbaV0pO1xuXG4gICAgICAgICAgICAgICAgdGhpcy5sb2FkZXIubG9hZChzY3JpcHRVcmwsICdzY3JpcHQnLCBvbkxvYWQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5zeXN0ZW1zLnNjcmlwdC5wcmVsb2FkaW5nID0gZmFsc2U7XG4gICAgICAgICAgICBjYWxsYmFjaygpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gc2V0IGFwcGxpY2F0aW9uIHByb3BlcnRpZXMgZnJvbSBkYXRhIGZpbGVcbiAgICBfcGFyc2VBcHBsaWNhdGlvblByb3BlcnRpZXMocHJvcHMsIGNhbGxiYWNrKSB7XG4gICAgICAgIC8vIGNvbmZpZ3VyZSByZXRyeWluZyBhc3NldHNcbiAgICAgICAgaWYgKHR5cGVvZiBwcm9wcy5tYXhBc3NldFJldHJpZXMgPT09ICdudW1iZXInICYmIHByb3BzLm1heEFzc2V0UmV0cmllcyA+IDApIHtcbiAgICAgICAgICAgIHRoaXMubG9hZGVyLmVuYWJsZVJldHJ5KHByb3BzLm1heEFzc2V0UmV0cmllcyk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBUT0RPOiByZW1vdmUgdGhpcyB0ZW1wb3JhcnkgYmxvY2sgYWZ0ZXIgbWlncmF0aW5nIHByb3BlcnRpZXNcbiAgICAgICAgaWYgKCFwcm9wcy51c2VEZXZpY2VQaXhlbFJhdGlvKVxuICAgICAgICAgICAgcHJvcHMudXNlRGV2aWNlUGl4ZWxSYXRpbyA9IHByb3BzLnVzZV9kZXZpY2VfcGl4ZWxfcmF0aW87XG4gICAgICAgIGlmICghcHJvcHMucmVzb2x1dGlvbk1vZGUpXG4gICAgICAgICAgICBwcm9wcy5yZXNvbHV0aW9uTW9kZSA9IHByb3BzLnJlc29sdXRpb25fbW9kZTtcbiAgICAgICAgaWYgKCFwcm9wcy5maWxsTW9kZSlcbiAgICAgICAgICAgIHByb3BzLmZpbGxNb2RlID0gcHJvcHMuZmlsbF9tb2RlO1xuXG4gICAgICAgIHRoaXMuX3dpZHRoID0gcHJvcHMud2lkdGg7XG4gICAgICAgIHRoaXMuX2hlaWdodCA9IHByb3BzLmhlaWdodDtcbiAgICAgICAgaWYgKHByb3BzLnVzZURldmljZVBpeGVsUmF0aW8pIHtcbiAgICAgICAgICAgIHRoaXMuZ3JhcGhpY3NEZXZpY2UubWF4UGl4ZWxSYXRpbyA9IHdpbmRvdy5kZXZpY2VQaXhlbFJhdGlvO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5zZXRDYW52YXNSZXNvbHV0aW9uKHByb3BzLnJlc29sdXRpb25Nb2RlLCB0aGlzLl93aWR0aCwgdGhpcy5faGVpZ2h0KTtcbiAgICAgICAgdGhpcy5zZXRDYW52YXNGaWxsTW9kZShwcm9wcy5maWxsTW9kZSwgdGhpcy5fd2lkdGgsIHRoaXMuX2hlaWdodCk7XG5cbiAgICAgICAgLy8gc2V0IHVwIGxheWVyc1xuICAgICAgICBpZiAocHJvcHMubGF5ZXJzICYmIHByb3BzLmxheWVyT3JkZXIpIHtcbiAgICAgICAgICAgIGNvbnN0IGNvbXBvc2l0aW9uID0gbmV3IExheWVyQ29tcG9zaXRpb24oXCJhcHBsaWNhdGlvblwiKTtcblxuICAgICAgICAgICAgY29uc3QgbGF5ZXJzID0ge307XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGtleSBpbiBwcm9wcy5sYXllcnMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBkYXRhID0gcHJvcHMubGF5ZXJzW2tleV07XG4gICAgICAgICAgICAgICAgZGF0YS5pZCA9IHBhcnNlSW50KGtleSwgMTApO1xuICAgICAgICAgICAgICAgIC8vIGRlcHRoIGxheWVyIHNob3VsZCBvbmx5IGJlIGVuYWJsZWQgd2hlbiBuZWVkZWRcbiAgICAgICAgICAgICAgICAvLyBieSBpbmNyZW1lbnRpbmcgaXRzIHJlZiBjb3VudGVyXG4gICAgICAgICAgICAgICAgZGF0YS5lbmFibGVkID0gZGF0YS5pZCAhPT0gTEFZRVJJRF9ERVBUSDtcbiAgICAgICAgICAgICAgICBsYXllcnNba2V5XSA9IG5ldyBMYXllcihkYXRhKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDAsIGxlbiA9IHByb3BzLmxheWVyT3JkZXIubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgICAgICAgICBjb25zdCBzdWJsYXllciA9IHByb3BzLmxheWVyT3JkZXJbaV07XG4gICAgICAgICAgICAgICAgY29uc3QgbGF5ZXIgPSBsYXllcnNbc3VibGF5ZXIubGF5ZXJdO1xuICAgICAgICAgICAgICAgIGlmICghbGF5ZXIpIGNvbnRpbnVlO1xuXG4gICAgICAgICAgICAgICAgaWYgKHN1YmxheWVyLnRyYW5zcGFyZW50KSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbXBvc2l0aW9uLnB1c2hUcmFuc3BhcmVudChsYXllcik7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgY29tcG9zaXRpb24ucHVzaE9wYXF1ZShsYXllcik7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgY29tcG9zaXRpb24uc3ViTGF5ZXJFbmFibGVkW2ldID0gc3VibGF5ZXIuZW5hYmxlZDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5zY2VuZS5sYXllcnMgPSBjb21wb3NpdGlvbjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGFkZCBiYXRjaCBncm91cHNcbiAgICAgICAgaWYgKHByb3BzLmJhdGNoR3JvdXBzKSB7XG4gICAgICAgICAgICBjb25zdCBiYXRjaGVyID0gdGhpcy5iYXRjaGVyO1xuICAgICAgICAgICAgaWYgKGJhdGNoZXIpIHtcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMCwgbGVuID0gcHJvcHMuYmF0Y2hHcm91cHMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZ3JwID0gcHJvcHMuYmF0Y2hHcm91cHNbaV07XG4gICAgICAgICAgICAgICAgICAgIGJhdGNoZXIuYWRkR3JvdXAoZ3JwLm5hbWUsIGdycC5keW5hbWljLCBncnAubWF4QWFiYlNpemUsIGdycC5pZCwgZ3JwLmxheWVycyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gc2V0IGxvY2FsaXphdGlvbiBhc3NldHNcbiAgICAgICAgaWYgKHByb3BzLmkxOG5Bc3NldHMpIHtcbiAgICAgICAgICAgIHRoaXMuaTE4bi5hc3NldHMgPSBwcm9wcy5pMThuQXNzZXRzO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fbG9hZExpYnJhcmllcyhwcm9wcy5saWJyYXJpZXMsIGNhbGxiYWNrKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0ge3N0cmluZ1tdfSB1cmxzIC0gTGlzdCBvZiBVUkxzIHRvIGxvYWQuXG4gICAgICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgLSBDYWxsYmFjayBmdW5jdGlvbi5cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9sb2FkTGlicmFyaWVzKHVybHMsIGNhbGxiYWNrKSB7XG4gICAgICAgIGNvbnN0IGxlbiA9IHVybHMubGVuZ3RoO1xuICAgICAgICBsZXQgY291bnQgPSBsZW47XG5cbiAgICAgICAgY29uc3QgcmVnZXggPSAvXmh0dHAocyk/OlxcL1xcLy87XG5cbiAgICAgICAgaWYgKGxlbikge1xuICAgICAgICAgICAgY29uc3Qgb25Mb2FkID0gKGVyciwgc2NyaXB0KSA9PiB7XG4gICAgICAgICAgICAgICAgY291bnQtLTtcbiAgICAgICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKGVycik7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChjb3VudCA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLm9uTGlicmFyaWVzTG9hZGVkKCk7XG4gICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKG51bGwpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbGVuOyArK2kpIHtcbiAgICAgICAgICAgICAgICBsZXQgdXJsID0gdXJsc1tpXTtcblxuICAgICAgICAgICAgICAgIGlmICghcmVnZXgudGVzdCh1cmwudG9Mb3dlckNhc2UoKSkgJiYgdGhpcy5fc2NyaXB0UHJlZml4KVxuICAgICAgICAgICAgICAgICAgICB1cmwgPSBwYXRoLmpvaW4odGhpcy5fc2NyaXB0UHJlZml4LCB1cmwpO1xuXG4gICAgICAgICAgICAgICAgdGhpcy5sb2FkZXIubG9hZCh1cmwsICdzY3JpcHQnLCBvbkxvYWQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5vbkxpYnJhcmllc0xvYWRlZCgpO1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJbnNlcnQgc2NlbmUgbmFtZS91cmxzIGludG8gdGhlIHJlZ2lzdHJ5LlxuICAgICAqXG4gICAgICogQHBhcmFtIHsqfSBzY2VuZXMgLSBTY2VuZXMgdG8gYWRkIHRvIHRoZSBzY2VuZSByZWdpc3RyeS5cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9wYXJzZVNjZW5lcyhzY2VuZXMpIHtcbiAgICAgICAgaWYgKCFzY2VuZXMpIHJldHVybjtcblxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHNjZW5lcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgdGhpcy5zY2VuZXMuYWRkKHNjZW5lc1tpXS5uYW1lLCBzY2VuZXNbaV0udXJsKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEluc2VydCBhc3NldHMgaW50byByZWdpc3RyeS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7Kn0gYXNzZXRzIC0gQXNzZXRzIHRvIGluc2VydC5cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9wYXJzZUFzc2V0cyhhc3NldHMpIHtcbiAgICAgICAgY29uc3QgbGlzdCA9IFtdO1xuXG4gICAgICAgIGNvbnN0IHNjcmlwdHNJbmRleCA9IHt9O1xuICAgICAgICBjb25zdCBidW5kbGVzSW5kZXggPSB7fTtcblxuICAgICAgICBpZiAoIXNjcmlwdC5sZWdhY3kpIHtcbiAgICAgICAgICAgIC8vIGFkZCBzY3JpcHRzIGluIG9yZGVyIG9mIGxvYWRpbmcgZmlyc3RcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5zY3JpcHRzT3JkZXIubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICBjb25zdCBpZCA9IHRoaXMuc2NyaXB0c09yZGVyW2ldO1xuICAgICAgICAgICAgICAgIGlmICghYXNzZXRzW2lkXSlcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG5cbiAgICAgICAgICAgICAgICBzY3JpcHRzSW5kZXhbaWRdID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBsaXN0LnB1c2goYXNzZXRzW2lkXSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIHRoZW4gYWRkIGJ1bmRsZXNcbiAgICAgICAgICAgIGlmICh0aGlzLmVuYWJsZUJ1bmRsZXMpIHtcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGlkIGluIGFzc2V0cykge1xuICAgICAgICAgICAgICAgICAgICBpZiAoYXNzZXRzW2lkXS50eXBlID09PSAnYnVuZGxlJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgYnVuZGxlc0luZGV4W2lkXSA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICBsaXN0LnB1c2goYXNzZXRzW2lkXSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIHRoZW4gYWRkIHJlc3Qgb2YgYXNzZXRzXG4gICAgICAgICAgICBmb3IgKGNvbnN0IGlkIGluIGFzc2V0cykge1xuICAgICAgICAgICAgICAgIGlmIChzY3JpcHRzSW5kZXhbaWRdIHx8IGJ1bmRsZXNJbmRleFtpZF0pXG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuXG4gICAgICAgICAgICAgICAgbGlzdC5wdXNoKGFzc2V0c1tpZF0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaWYgKHRoaXMuZW5hYmxlQnVuZGxlcykge1xuICAgICAgICAgICAgICAgIC8vIGFkZCBidW5kbGVzXG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCBpZCBpbiBhc3NldHMpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGFzc2V0c1tpZF0udHlwZSA9PT0gJ2J1bmRsZScpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJ1bmRsZXNJbmRleFtpZF0gPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgbGlzdC5wdXNoKGFzc2V0c1tpZF0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyB0aGVuIGFkZCByZXN0IG9mIGFzc2V0c1xuICAgICAgICAgICAgZm9yIChjb25zdCBpZCBpbiBhc3NldHMpIHtcbiAgICAgICAgICAgICAgICBpZiAoYnVuZGxlc0luZGV4W2lkXSlcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG5cbiAgICAgICAgICAgICAgICBsaXN0LnB1c2goYXNzZXRzW2lkXSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGxpc3QubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGNvbnN0IGRhdGEgPSBsaXN0W2ldO1xuICAgICAgICAgICAgY29uc3QgYXNzZXQgPSBuZXcgQXNzZXQoZGF0YS5uYW1lLCBkYXRhLnR5cGUsIGRhdGEuZmlsZSwgZGF0YS5kYXRhKTtcbiAgICAgICAgICAgIGFzc2V0LmlkID0gcGFyc2VJbnQoZGF0YS5pZCwgMTApO1xuICAgICAgICAgICAgYXNzZXQucHJlbG9hZCA9IGRhdGEucHJlbG9hZCA/IGRhdGEucHJlbG9hZCA6IGZhbHNlO1xuICAgICAgICAgICAgLy8gaWYgdGhpcyBpcyBhIHNjcmlwdCBhc3NldCBhbmQgaGFzIGFscmVhZHkgYmVlbiBlbWJlZGRlZCBpbiB0aGUgcGFnZSB0aGVuXG4gICAgICAgICAgICAvLyBtYXJrIGl0IGFzIGxvYWRlZFxuICAgICAgICAgICAgYXNzZXQubG9hZGVkID0gZGF0YS50eXBlID09PSAnc2NyaXB0JyAmJiBkYXRhLmRhdGEgJiYgZGF0YS5kYXRhLmxvYWRpbmdUeXBlID4gMDtcbiAgICAgICAgICAgIC8vIHRhZ3NcbiAgICAgICAgICAgIGFzc2V0LnRhZ3MuYWRkKGRhdGEudGFncyk7XG4gICAgICAgICAgICAvLyBpMThuXG4gICAgICAgICAgICBpZiAoZGF0YS5pMThuKSB7XG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCBsb2NhbGUgaW4gZGF0YS5pMThuKSB7XG4gICAgICAgICAgICAgICAgICAgIGFzc2V0LmFkZExvY2FsaXplZEFzc2V0SWQobG9jYWxlLCBkYXRhLmkxOG5bbG9jYWxlXSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gcmVnaXN0cnlcbiAgICAgICAgICAgIHRoaXMuYXNzZXRzLmFkZChhc3NldCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0ge1NjZW5lfSBzY2VuZSAtIFRoZSBzY2VuZS5cbiAgICAgKiBAcmV0dXJucyB7QXJyYXl9IC0gVGhlIGxpc3Qgb2Ygc2NyaXB0cyB0aGF0IGFyZSByZWZlcmVuY2VkIGJ5IHRoZSBzY2VuZS5cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9nZXRTY3JpcHRSZWZlcmVuY2VzKHNjZW5lKSB7XG4gICAgICAgIGxldCBwcmlvcml0eVNjcmlwdHMgPSBbXTtcbiAgICAgICAgaWYgKHNjZW5lLnNldHRpbmdzLnByaW9yaXR5X3NjcmlwdHMpIHtcbiAgICAgICAgICAgIHByaW9yaXR5U2NyaXB0cyA9IHNjZW5lLnNldHRpbmdzLnByaW9yaXR5X3NjcmlwdHM7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBfc2NyaXB0cyA9IFtdO1xuICAgICAgICBjb25zdCBfaW5kZXggPSB7fTtcblxuICAgICAgICAvLyBmaXJzdCBhZGQgcHJpb3JpdHkgc2NyaXB0c1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHByaW9yaXR5U2NyaXB0cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgX3NjcmlwdHMucHVzaChwcmlvcml0eVNjcmlwdHNbaV0pO1xuICAgICAgICAgICAgX2luZGV4W3ByaW9yaXR5U2NyaXB0c1tpXV0gPSB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gdGhlbiBpdGVyYXRlIGhpZXJhcmNoeSB0byBnZXQgcmVmZXJlbmNlZCBzY3JpcHRzXG4gICAgICAgIGNvbnN0IGVudGl0aWVzID0gc2NlbmUuZW50aXRpZXM7XG4gICAgICAgIGZvciAoY29uc3Qga2V5IGluIGVudGl0aWVzKSB7XG4gICAgICAgICAgICBpZiAoIWVudGl0aWVzW2tleV0uY29tcG9uZW50cy5zY3JpcHQpIHtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3Qgc2NyaXB0cyA9IGVudGl0aWVzW2tleV0uY29tcG9uZW50cy5zY3JpcHQuc2NyaXB0cztcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc2NyaXB0cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIGlmIChfaW5kZXhbc2NyaXB0c1tpXS51cmxdKVxuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICBfc2NyaXB0cy5wdXNoKHNjcmlwdHNbaV0udXJsKTtcbiAgICAgICAgICAgICAgICBfaW5kZXhbc2NyaXB0c1tpXS51cmxdID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBfc2NyaXB0cztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTdGFydCB0aGUgYXBwbGljYXRpb24uIFRoaXMgZnVuY3Rpb24gZG9lcyB0aGUgZm9sbG93aW5nOlxuICAgICAqXG4gICAgICogMS4gRmlyZXMgYW4gZXZlbnQgb24gdGhlIGFwcGxpY2F0aW9uIG5hbWVkICdzdGFydCdcbiAgICAgKiAyLiBDYWxscyBpbml0aWFsaXplIGZvciBhbGwgY29tcG9uZW50cyBvbiBlbnRpdGllcyBpbiB0aGUgaGllcmFyY2h5XG4gICAgICogMy4gRmlyZXMgYW4gZXZlbnQgb24gdGhlIGFwcGxpY2F0aW9uIG5hbWVkICdpbml0aWFsaXplJ1xuICAgICAqIDQuIENhbGxzIHBvc3RJbml0aWFsaXplIGZvciBhbGwgY29tcG9uZW50cyBvbiBlbnRpdGllcyBpbiB0aGUgaGllcmFyY2h5XG4gICAgICogNS4gRmlyZXMgYW4gZXZlbnQgb24gdGhlIGFwcGxpY2F0aW9uIG5hbWVkICdwb3N0aW5pdGlhbGl6ZSdcbiAgICAgKiA2LiBTdGFydHMgZXhlY3V0aW5nIHRoZSBtYWluIGxvb3Agb2YgdGhlIGFwcGxpY2F0aW9uXG4gICAgICpcbiAgICAgKiBUaGlzIGZ1bmN0aW9uIGlzIGNhbGxlZCBpbnRlcm5hbGx5IGJ5IFBsYXlDYW52YXMgYXBwbGljYXRpb25zIG1hZGUgaW4gdGhlIEVkaXRvciBidXQgeW91XG4gICAgICogd2lsbCBuZWVkIHRvIGNhbGwgc3RhcnQgeW91cnNlbGYgaWYgeW91IGFyZSB1c2luZyB0aGUgZW5naW5lIHN0YW5kLWFsb25lLlxuICAgICAqXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBhcHAuc3RhcnQoKTtcbiAgICAgKi9cbiAgICBzdGFydCgpIHtcblxuICAgICAgICBEZWJ1Zy5jYWxsKCgpID0+IHtcbiAgICAgICAgICAgIERlYnVnLmFzc2VydCghdGhpcy5fYWxyZWFkeVN0YXJ0ZWQsIFwiVGhlIGFwcGxpY2F0aW9uIGNhbiBiZSBzdGFydGVkIG9ubHkgb25lIHRpbWUuXCIpO1xuICAgICAgICAgICAgdGhpcy5fYWxyZWFkeVN0YXJ0ZWQgPSB0cnVlO1xuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLmZyYW1lID0gMDtcblxuICAgICAgICB0aGlzLmZpcmUoXCJzdGFydFwiLCB7XG4gICAgICAgICAgICB0aW1lc3RhbXA6IG5vdygpLFxuICAgICAgICAgICAgdGFyZ2V0OiB0aGlzXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGlmICghdGhpcy5fbGlicmFyaWVzTG9hZGVkKSB7XG4gICAgICAgICAgICB0aGlzLm9uTGlicmFyaWVzTG9hZGVkKCk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnN5c3RlbXMuZmlyZSgnaW5pdGlhbGl6ZScsIHRoaXMucm9vdCk7XG4gICAgICAgIHRoaXMuZmlyZSgnaW5pdGlhbGl6ZScpO1xuXG4gICAgICAgIHRoaXMuc3lzdGVtcy5maXJlKCdwb3N0SW5pdGlhbGl6ZScsIHRoaXMucm9vdCk7XG4gICAgICAgIHRoaXMuc3lzdGVtcy5maXJlKCdwb3N0UG9zdEluaXRpYWxpemUnLCB0aGlzLnJvb3QpO1xuICAgICAgICB0aGlzLmZpcmUoJ3Bvc3Rpbml0aWFsaXplJyk7XG5cbiAgICAgICAgdGhpcy50aWNrKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVXBkYXRlIGFsbCBpbnB1dCBkZXZpY2VzIG1hbmFnZWQgYnkgdGhlIGFwcGxpY2F0aW9uLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGR0IC0gVGhlIHRpbWUgaW4gc2Vjb25kcyBzaW5jZSB0aGUgbGFzdCB1cGRhdGUuXG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBpbnB1dFVwZGF0ZShkdCkge1xuICAgICAgICBpZiAodGhpcy5jb250cm9sbGVyKSB7XG4gICAgICAgICAgICB0aGlzLmNvbnRyb2xsZXIudXBkYXRlKGR0KTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5tb3VzZSkge1xuICAgICAgICAgICAgdGhpcy5tb3VzZS51cGRhdGUoKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5rZXlib2FyZCkge1xuICAgICAgICAgICAgdGhpcy5rZXlib2FyZC51cGRhdGUoKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5nYW1lcGFkcykge1xuICAgICAgICAgICAgdGhpcy5nYW1lcGFkcy51cGRhdGUoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFVwZGF0ZSB0aGUgYXBwbGljYXRpb24uIFRoaXMgZnVuY3Rpb24gd2lsbCBjYWxsIHRoZSB1cGRhdGUgZnVuY3Rpb25zIGFuZCB0aGVuIHRoZSBwb3N0VXBkYXRlXG4gICAgICogZnVuY3Rpb25zIG9mIGFsbCBlbmFibGVkIGNvbXBvbmVudHMuIEl0IHdpbGwgdGhlbiB1cGRhdGUgdGhlIGN1cnJlbnQgc3RhdGUgb2YgYWxsIGNvbm5lY3RlZFxuICAgICAqIGlucHV0IGRldmljZXMuIFRoaXMgZnVuY3Rpb24gaXMgY2FsbGVkIGludGVybmFsbHkgaW4gdGhlIGFwcGxpY2F0aW9uJ3MgbWFpbiBsb29wIGFuZCBkb2VzXG4gICAgICogbm90IG5lZWQgdG8gYmUgY2FsbGVkIGV4cGxpY2l0bHkuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gZHQgLSBUaGUgdGltZSBkZWx0YSBpbiBzZWNvbmRzIHNpbmNlIHRoZSBsYXN0IGZyYW1lLlxuICAgICAqL1xuICAgIHVwZGF0ZShkdCkge1xuICAgICAgICB0aGlzLmZyYW1lKys7XG5cbiAgICAgICAgdGhpcy5ncmFwaGljc0RldmljZS51cGRhdGVDbGllbnRSZWN0KCk7XG5cbiAgICAgICAgLy8gI2lmIF9QUk9GSUxFUlxuICAgICAgICB0aGlzLnN0YXRzLmZyYW1lLnVwZGF0ZVN0YXJ0ID0gbm93KCk7XG4gICAgICAgIC8vICNlbmRpZlxuXG4gICAgICAgIC8vIFBlcmZvcm0gQ29tcG9uZW50U3lzdGVtIHVwZGF0ZVxuICAgICAgICBpZiAoc2NyaXB0LmxlZ2FjeSlcbiAgICAgICAgICAgIHRoaXMuc3lzdGVtcy5maXJlKCdmaXhlZFVwZGF0ZScsIDEuMCAvIDYwLjApO1xuXG4gICAgICAgIHRoaXMuc3lzdGVtcy5maXJlKHRoaXMuX2luVG9vbHMgPyAndG9vbHNVcGRhdGUnIDogJ3VwZGF0ZScsIGR0KTtcbiAgICAgICAgdGhpcy5zeXN0ZW1zLmZpcmUoJ2FuaW1hdGlvblVwZGF0ZScsIGR0KTtcbiAgICAgICAgdGhpcy5zeXN0ZW1zLmZpcmUoJ3Bvc3RVcGRhdGUnLCBkdCk7XG5cbiAgICAgICAgLy8gZmlyZSB1cGRhdGUgZXZlbnRcbiAgICAgICAgdGhpcy5maXJlKFwidXBkYXRlXCIsIGR0KTtcblxuICAgICAgICAvLyB1cGRhdGUgaW5wdXQgZGV2aWNlc1xuICAgICAgICB0aGlzLmlucHV0VXBkYXRlKGR0KTtcblxuICAgICAgICAvLyAjaWYgX1BST0ZJTEVSXG4gICAgICAgIHRoaXMuc3RhdHMuZnJhbWUudXBkYXRlVGltZSA9IG5vdygpIC0gdGhpcy5zdGF0cy5mcmFtZS51cGRhdGVTdGFydDtcbiAgICAgICAgLy8gI2VuZGlmXG4gICAgfVxuXG4gICAgZnJhbWVTdGFydCgpIHtcbiAgICAgICAgdGhpcy5ncmFwaGljc0RldmljZS5mcmFtZVN0YXJ0KCk7XG4gICAgfVxuXG4gICAgZnJhbWVFbmQoKSB7XG4gICAgICAgIHRoaXMuZ3JhcGhpY3NEZXZpY2UuZnJhbWVFbmQoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZW5kZXIgdGhlIGFwcGxpY2F0aW9uJ3Mgc2NlbmUuIE1vcmUgc3BlY2lmaWNhbGx5LCB0aGUgc2NlbmUncyB7QGxpbmsgTGF5ZXJDb21wb3NpdGlvbn0gaXNcbiAgICAgKiByZW5kZXJlZC4gVGhpcyBmdW5jdGlvbiBpcyBjYWxsZWQgaW50ZXJuYWxseSBpbiB0aGUgYXBwbGljYXRpb24ncyBtYWluIGxvb3AgYW5kIGRvZXMgbm90XG4gICAgICogbmVlZCB0byBiZSBjYWxsZWQgZXhwbGljaXRseS5cbiAgICAgKlxuICAgICAqIEBpZ25vcmVcbiAgICAgKi9cbiAgICByZW5kZXIoKSB7XG4gICAgICAgIC8vICNpZiBfUFJPRklMRVJcbiAgICAgICAgdGhpcy5zdGF0cy5mcmFtZS5yZW5kZXJTdGFydCA9IG5vdygpO1xuICAgICAgICAvLyAjZW5kaWZcblxuICAgICAgICB0aGlzLmZpcmUoJ3ByZXJlbmRlcicpO1xuICAgICAgICB0aGlzLnJvb3Quc3luY0hpZXJhcmNoeSgpO1xuXG4gICAgICAgIGlmICh0aGlzLl9iYXRjaGVyKSB7XG4gICAgICAgICAgICB0aGlzLl9iYXRjaGVyLnVwZGF0ZUFsbCgpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gI2lmIF9QUk9GSUxFUlxuICAgICAgICBGb3J3YXJkUmVuZGVyZXIuX3NraXBSZW5kZXJDb3VudGVyID0gMDtcbiAgICAgICAgLy8gI2VuZGlmXG5cbiAgICAgICAgLy8gcmVuZGVyIHRoZSBzY2VuZSBjb21wb3NpdGlvblxuICAgICAgICB0aGlzLnJlbmRlckNvbXBvc2l0aW9uKHRoaXMuc2NlbmUubGF5ZXJzKTtcblxuICAgICAgICB0aGlzLmZpcmUoJ3Bvc3RyZW5kZXInKTtcblxuICAgICAgICAvLyAjaWYgX1BST0ZJTEVSXG4gICAgICAgIHRoaXMuc3RhdHMuZnJhbWUucmVuZGVyVGltZSA9IG5vdygpIC0gdGhpcy5zdGF0cy5mcmFtZS5yZW5kZXJTdGFydDtcbiAgICAgICAgLy8gI2VuZGlmXG4gICAgfVxuXG4gICAgLy8gcmVuZGVyIGEgbGF5ZXIgY29tcG9zaXRpb25cbiAgICByZW5kZXJDb21wb3NpdGlvbihsYXllckNvbXBvc2l0aW9uKSB7XG4gICAgICAgIERlYnVnR3JhcGhpY3MuY2xlYXJHcHVNYXJrZXJzKCk7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuYnVpbGRGcmFtZUdyYXBoKHRoaXMuZnJhbWVHcmFwaCwgbGF5ZXJDb21wb3NpdGlvbik7XG4gICAgICAgIHRoaXMuZnJhbWVHcmFwaC5yZW5kZXIodGhpcy5ncmFwaGljc0RldmljZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IG5vdyAtIFRoZSB0aW1lc3RhbXAgcGFzc2VkIHRvIHRoZSByZXF1ZXN0QW5pbWF0aW9uRnJhbWUgY2FsbGJhY2suXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGR0IC0gVGhlIHRpbWUgZGVsdGEgaW4gc2Vjb25kcyBzaW5jZSB0aGUgbGFzdCBmcmFtZS4gVGhpcyBpcyBzdWJqZWN0IHRvIHRoZVxuICAgICAqIGFwcGxpY2F0aW9uJ3MgdGltZSBzY2FsZSBhbmQgbWF4IGRlbHRhIHZhbHVlcy5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gbXMgLSBUaGUgdGltZSBpbiBtaWxsaXNlY29uZHMgc2luY2UgdGhlIGxhc3QgZnJhbWUuXG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfZmlsbEZyYW1lU3RhdHNCYXNpYyhub3csIGR0LCBtcykge1xuICAgICAgICAvLyBUaW1pbmcgc3RhdHNcbiAgICAgICAgY29uc3Qgc3RhdHMgPSB0aGlzLnN0YXRzLmZyYW1lO1xuICAgICAgICBzdGF0cy5kdCA9IGR0O1xuICAgICAgICBzdGF0cy5tcyA9IG1zO1xuICAgICAgICBpZiAobm93ID4gc3RhdHMuX3RpbWVUb0NvdW50RnJhbWVzKSB7XG4gICAgICAgICAgICBzdGF0cy5mcHMgPSBzdGF0cy5fZnBzQWNjdW07XG4gICAgICAgICAgICBzdGF0cy5fZnBzQWNjdW0gPSAwO1xuICAgICAgICAgICAgc3RhdHMuX3RpbWVUb0NvdW50RnJhbWVzID0gbm93ICsgMTAwMDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHN0YXRzLl9mcHNBY2N1bSsrO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gdG90YWwgZHJhdyBjYWxsXG4gICAgICAgIHRoaXMuc3RhdHMuZHJhd0NhbGxzLnRvdGFsID0gdGhpcy5ncmFwaGljc0RldmljZS5fZHJhd0NhbGxzUGVyRnJhbWU7XG4gICAgICAgIHRoaXMuZ3JhcGhpY3NEZXZpY2UuX2RyYXdDYWxsc1BlckZyYW1lID0gMDtcbiAgICB9XG5cbiAgICAvKiogQHByaXZhdGUgKi9cbiAgICBfZmlsbEZyYW1lU3RhdHMoKSB7XG4gICAgICAgIGxldCBzdGF0cyA9IHRoaXMuc3RhdHMuZnJhbWU7XG5cbiAgICAgICAgLy8gUmVuZGVyIHN0YXRzXG4gICAgICAgIHN0YXRzLmNhbWVyYXMgPSB0aGlzLnJlbmRlcmVyLl9jYW1lcmFzUmVuZGVyZWQ7XG4gICAgICAgIHN0YXRzLm1hdGVyaWFscyA9IHRoaXMucmVuZGVyZXIuX21hdGVyaWFsU3dpdGNoZXM7XG4gICAgICAgIHN0YXRzLnNoYWRlcnMgPSB0aGlzLmdyYXBoaWNzRGV2aWNlLl9zaGFkZXJTd2l0Y2hlc1BlckZyYW1lO1xuICAgICAgICBzdGF0cy5zaGFkb3dNYXBVcGRhdGVzID0gdGhpcy5yZW5kZXJlci5fc2hhZG93TWFwVXBkYXRlcztcbiAgICAgICAgc3RhdHMuc2hhZG93TWFwVGltZSA9IHRoaXMucmVuZGVyZXIuX3NoYWRvd01hcFRpbWU7XG4gICAgICAgIHN0YXRzLmRlcHRoTWFwVGltZSA9IHRoaXMucmVuZGVyZXIuX2RlcHRoTWFwVGltZTtcbiAgICAgICAgc3RhdHMuZm9yd2FyZFRpbWUgPSB0aGlzLnJlbmRlcmVyLl9mb3J3YXJkVGltZTtcbiAgICAgICAgY29uc3QgcHJpbXMgPSB0aGlzLmdyYXBoaWNzRGV2aWNlLl9wcmltc1BlckZyYW1lO1xuICAgICAgICBzdGF0cy50cmlhbmdsZXMgPSBwcmltc1tQUklNSVRJVkVfVFJJQU5HTEVTXSAvIDMgK1xuICAgICAgICAgICAgTWF0aC5tYXgocHJpbXNbUFJJTUlUSVZFX1RSSVNUUklQXSAtIDIsIDApICtcbiAgICAgICAgICAgIE1hdGgubWF4KHByaW1zW1BSSU1JVElWRV9UUklGQU5dIC0gMiwgMCk7XG4gICAgICAgIHN0YXRzLmN1bGxUaW1lID0gdGhpcy5yZW5kZXJlci5fY3VsbFRpbWU7XG4gICAgICAgIHN0YXRzLnNvcnRUaW1lID0gdGhpcy5yZW5kZXJlci5fc29ydFRpbWU7XG4gICAgICAgIHN0YXRzLnNraW5UaW1lID0gdGhpcy5yZW5kZXJlci5fc2tpblRpbWU7XG4gICAgICAgIHN0YXRzLm1vcnBoVGltZSA9IHRoaXMucmVuZGVyZXIuX21vcnBoVGltZTtcbiAgICAgICAgc3RhdHMubGlnaHRDbHVzdGVycyA9IHRoaXMucmVuZGVyZXIuX2xpZ2h0Q2x1c3RlcnM7XG4gICAgICAgIHN0YXRzLmxpZ2h0Q2x1c3RlcnNUaW1lID0gdGhpcy5yZW5kZXJlci5fbGlnaHRDbHVzdGVyc1RpbWU7XG4gICAgICAgIHN0YXRzLm90aGVyUHJpbWl0aXZlcyA9IDA7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcHJpbXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGlmIChpIDwgUFJJTUlUSVZFX1RSSUFOR0xFUykge1xuICAgICAgICAgICAgICAgIHN0YXRzLm90aGVyUHJpbWl0aXZlcyArPSBwcmltc1tpXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHByaW1zW2ldID0gMDtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnJlbmRlcmVyLl9jYW1lcmFzUmVuZGVyZWQgPSAwO1xuICAgICAgICB0aGlzLnJlbmRlcmVyLl9tYXRlcmlhbFN3aXRjaGVzID0gMDtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5fc2hhZG93TWFwVXBkYXRlcyA9IDA7XG4gICAgICAgIHRoaXMuZ3JhcGhpY3NEZXZpY2UuX3NoYWRlclN3aXRjaGVzUGVyRnJhbWUgPSAwO1xuICAgICAgICB0aGlzLnJlbmRlcmVyLl9jdWxsVGltZSA9IDA7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuX2xheWVyQ29tcG9zaXRpb25VcGRhdGVUaW1lID0gMDtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5fbGlnaHRDbHVzdGVyc1RpbWUgPSAwO1xuICAgICAgICB0aGlzLnJlbmRlcmVyLl9zb3J0VGltZSA9IDA7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuX3NraW5UaW1lID0gMDtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5fbW9ycGhUaW1lID0gMDtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5fc2hhZG93TWFwVGltZSA9IDA7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuX2RlcHRoTWFwVGltZSA9IDA7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuX2ZvcndhcmRUaW1lID0gMDtcblxuICAgICAgICAvLyBEcmF3IGNhbGwgc3RhdHNcbiAgICAgICAgc3RhdHMgPSB0aGlzLnN0YXRzLmRyYXdDYWxscztcbiAgICAgICAgc3RhdHMuZm9yd2FyZCA9IHRoaXMucmVuZGVyZXIuX2ZvcndhcmREcmF3Q2FsbHM7XG4gICAgICAgIHN0YXRzLmN1bGxlZCA9IHRoaXMucmVuZGVyZXIuX251bURyYXdDYWxsc0N1bGxlZDtcbiAgICAgICAgc3RhdHMuZGVwdGggPSAwO1xuICAgICAgICBzdGF0cy5zaGFkb3cgPSB0aGlzLnJlbmRlcmVyLl9zaGFkb3dEcmF3Q2FsbHM7XG4gICAgICAgIHN0YXRzLnNraW5uZWQgPSB0aGlzLnJlbmRlcmVyLl9za2luRHJhd0NhbGxzO1xuICAgICAgICBzdGF0cy5pbW1lZGlhdGUgPSAwO1xuICAgICAgICBzdGF0cy5pbnN0YW5jZWQgPSAwO1xuICAgICAgICBzdGF0cy5yZW1vdmVkQnlJbnN0YW5jaW5nID0gMDtcbiAgICAgICAgc3RhdHMubWlzYyA9IHN0YXRzLnRvdGFsIC0gKHN0YXRzLmZvcndhcmQgKyBzdGF0cy5zaGFkb3cpO1xuICAgICAgICB0aGlzLnJlbmRlcmVyLl9kZXB0aERyYXdDYWxscyA9IDA7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuX3NoYWRvd0RyYXdDYWxscyA9IDA7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuX2ZvcndhcmREcmF3Q2FsbHMgPSAwO1xuICAgICAgICB0aGlzLnJlbmRlcmVyLl9udW1EcmF3Q2FsbHNDdWxsZWQgPSAwO1xuICAgICAgICB0aGlzLnJlbmRlcmVyLl9za2luRHJhd0NhbGxzID0gMDtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5faW1tZWRpYXRlUmVuZGVyZWQgPSAwO1xuICAgICAgICB0aGlzLnJlbmRlcmVyLl9pbnN0YW5jZWREcmF3Q2FsbHMgPSAwO1xuXG4gICAgICAgIHRoaXMuc3RhdHMubWlzYy5yZW5kZXJUYXJnZXRDcmVhdGlvblRpbWUgPSB0aGlzLmdyYXBoaWNzRGV2aWNlLnJlbmRlclRhcmdldENyZWF0aW9uVGltZTtcblxuICAgICAgICBzdGF0cyA9IHRoaXMuc3RhdHMucGFydGljbGVzO1xuICAgICAgICBzdGF0cy51cGRhdGVzUGVyRnJhbWUgPSBzdGF0cy5fdXBkYXRlc1BlckZyYW1lO1xuICAgICAgICBzdGF0cy5mcmFtZVRpbWUgPSBzdGF0cy5fZnJhbWVUaW1lO1xuICAgICAgICBzdGF0cy5fdXBkYXRlc1BlckZyYW1lID0gMDtcbiAgICAgICAgc3RhdHMuX2ZyYW1lVGltZSA9IDA7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ29udHJvbHMgaG93IHRoZSBjYW52YXMgZmlsbHMgdGhlIHdpbmRvdyBhbmQgcmVzaXplcyB3aGVuIHRoZSB3aW5kb3cgY2hhbmdlcy5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBtb2RlIC0gVGhlIG1vZGUgdG8gdXNlIHdoZW4gc2V0dGluZyB0aGUgc2l6ZSBvZiB0aGUgY2FudmFzLiBDYW4gYmU6XG4gICAgICpcbiAgICAgKiAtIHtAbGluayBGSUxMTU9ERV9OT05FfTogdGhlIGNhbnZhcyB3aWxsIGFsd2F5cyBtYXRjaCB0aGUgc2l6ZSBwcm92aWRlZC5cbiAgICAgKiAtIHtAbGluayBGSUxMTU9ERV9GSUxMX1dJTkRPV306IHRoZSBjYW52YXMgd2lsbCBzaW1wbHkgZmlsbCB0aGUgd2luZG93LCBjaGFuZ2luZyBhc3BlY3QgcmF0aW8uXG4gICAgICogLSB7QGxpbmsgRklMTE1PREVfS0VFUF9BU1BFQ1R9OiB0aGUgY2FudmFzIHdpbGwgZ3JvdyB0byBmaWxsIHRoZSB3aW5kb3cgYXMgYmVzdCBpdCBjYW4gd2hpbGVcbiAgICAgKiBtYWludGFpbmluZyB0aGUgYXNwZWN0IHJhdGlvLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFt3aWR0aF0gLSBUaGUgd2lkdGggb2YgdGhlIGNhbnZhcyAob25seSB1c2VkIHdoZW4gbW9kZSBpcyB7QGxpbmsgRklMTE1PREVfTk9ORX0pLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBbaGVpZ2h0XSAtIFRoZSBoZWlnaHQgb2YgdGhlIGNhbnZhcyAob25seSB1c2VkIHdoZW4gbW9kZSBpcyB7QGxpbmsgRklMTE1PREVfTk9ORX0pLlxuICAgICAqL1xuICAgIHNldENhbnZhc0ZpbGxNb2RlKG1vZGUsIHdpZHRoLCBoZWlnaHQpIHtcbiAgICAgICAgdGhpcy5fZmlsbE1vZGUgPSBtb2RlO1xuICAgICAgICB0aGlzLnJlc2l6ZUNhbnZhcyh3aWR0aCwgaGVpZ2h0KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDaGFuZ2UgdGhlIHJlc29sdXRpb24gb2YgdGhlIGNhbnZhcywgYW5kIHNldCB0aGUgd2F5IGl0IGJlaGF2ZXMgd2hlbiB0aGUgd2luZG93IGlzIHJlc2l6ZWQuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gbW9kZSAtIFRoZSBtb2RlIHRvIHVzZSB3aGVuIHNldHRpbmcgdGhlIHJlc29sdXRpb24uIENhbiBiZTpcbiAgICAgKlxuICAgICAqIC0ge0BsaW5rIFJFU09MVVRJT05fQVVUT306IGlmIHdpZHRoIGFuZCBoZWlnaHQgYXJlIG5vdCBwcm92aWRlZCwgY2FudmFzIHdpbGwgYmUgcmVzaXplZCB0b1xuICAgICAqIG1hdGNoIGNhbnZhcyBjbGllbnQgc2l6ZS5cbiAgICAgKiAtIHtAbGluayBSRVNPTFVUSU9OX0ZJWEVEfTogcmVzb2x1dGlvbiBvZiBjYW52YXMgd2lsbCBiZSBmaXhlZC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBbd2lkdGhdIC0gVGhlIGhvcml6b250YWwgcmVzb2x1dGlvbiwgb3B0aW9uYWwgaW4gQVVUTyBtb2RlLCBpZiBub3QgcHJvdmlkZWRcbiAgICAgKiBjYW52YXMgY2xpZW50V2lkdGggaXMgdXNlZC5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gW2hlaWdodF0gLSBUaGUgdmVydGljYWwgcmVzb2x1dGlvbiwgb3B0aW9uYWwgaW4gQVVUTyBtb2RlLCBpZiBub3QgcHJvdmlkZWRcbiAgICAgKiBjYW52YXMgY2xpZW50SGVpZ2h0IGlzIHVzZWQuXG4gICAgICovXG4gICAgc2V0Q2FudmFzUmVzb2x1dGlvbihtb2RlLCB3aWR0aCwgaGVpZ2h0KSB7XG4gICAgICAgIHRoaXMuX3Jlc29sdXRpb25Nb2RlID0gbW9kZTtcblxuICAgICAgICAvLyBJbiBBVVRPIG1vZGUgdGhlIHJlc29sdXRpb24gaXMgdGhlIHNhbWUgYXMgdGhlIGNhbnZhcyBzaXplLCB1bmxlc3Mgc3BlY2lmaWVkXG4gICAgICAgIGlmIChtb2RlID09PSBSRVNPTFVUSU9OX0FVVE8gJiYgKHdpZHRoID09PSB1bmRlZmluZWQpKSB7XG4gICAgICAgICAgICB3aWR0aCA9IHRoaXMuZ3JhcGhpY3NEZXZpY2UuY2FudmFzLmNsaWVudFdpZHRoO1xuICAgICAgICAgICAgaGVpZ2h0ID0gdGhpcy5ncmFwaGljc0RldmljZS5jYW52YXMuY2xpZW50SGVpZ2h0O1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5ncmFwaGljc0RldmljZS5yZXNpemVDYW52YXMod2lkdGgsIGhlaWdodCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUXVlcmllcyB0aGUgdmlzaWJpbGl0eSBvZiB0aGUgd2luZG93IG9yIHRhYiBpbiB3aGljaCB0aGUgYXBwbGljYXRpb24gaXMgcnVubmluZy5cbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtib29sZWFufSBUcnVlIGlmIHRoZSBhcHBsaWNhdGlvbiBpcyBub3QgdmlzaWJsZSBhbmQgZmFsc2Ugb3RoZXJ3aXNlLlxuICAgICAqL1xuICAgIGlzSGlkZGVuKCkge1xuICAgICAgICByZXR1cm4gZG9jdW1lbnRbdGhpcy5faGlkZGVuQXR0cl07XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ2FsbGVkIHdoZW4gdGhlIHZpc2liaWxpdHkgc3RhdGUgb2YgdGhlIGN1cnJlbnQgdGFiL3dpbmRvdyBjaGFuZ2VzLlxuICAgICAqXG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBvblZpc2liaWxpdHlDaGFuZ2UoKSB7XG4gICAgICAgIGlmICh0aGlzLmlzSGlkZGVuKCkpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLl9zb3VuZE1hbmFnZXIpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9zb3VuZE1hbmFnZXIuc3VzcGVuZCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaWYgKHRoaXMuX3NvdW5kTWFuYWdlcikge1xuICAgICAgICAgICAgICAgIHRoaXMuX3NvdW5kTWFuYWdlci5yZXN1bWUoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJlc2l6ZSB0aGUgYXBwbGljYXRpb24ncyBjYW52YXMgZWxlbWVudCBpbiBsaW5lIHdpdGggdGhlIGN1cnJlbnQgZmlsbCBtb2RlLlxuICAgICAqXG4gICAgICogLSBJbiB7QGxpbmsgRklMTE1PREVfS0VFUF9BU1BFQ1R9IG1vZGUsIHRoZSBjYW52YXMgd2lsbCBncm93IHRvIGZpbGwgdGhlIHdpbmRvdyBhcyBiZXN0IGl0XG4gICAgICogY2FuIHdoaWxlIG1haW50YWluaW5nIHRoZSBhc3BlY3QgcmF0aW8uXG4gICAgICogLSBJbiB7QGxpbmsgRklMTE1PREVfRklMTF9XSU5ET1d9IG1vZGUsIHRoZSBjYW52YXMgd2lsbCBzaW1wbHkgZmlsbCB0aGUgd2luZG93LCBjaGFuZ2luZ1xuICAgICAqIGFzcGVjdCByYXRpby5cbiAgICAgKiAtIEluIHtAbGluayBGSUxMTU9ERV9OT05FfSBtb2RlLCB0aGUgY2FudmFzIHdpbGwgYWx3YXlzIG1hdGNoIHRoZSBzaXplIHByb3ZpZGVkLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFt3aWR0aF0gLSBUaGUgd2lkdGggb2YgdGhlIGNhbnZhcy4gT25seSB1c2VkIGlmIGN1cnJlbnQgZmlsbCBtb2RlIGlzIHtAbGluayBGSUxMTU9ERV9OT05FfS5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gW2hlaWdodF0gLSBUaGUgaGVpZ2h0IG9mIHRoZSBjYW52YXMuIE9ubHkgdXNlZCBpZiBjdXJyZW50IGZpbGwgbW9kZSBpcyB7QGxpbmsgRklMTE1PREVfTk9ORX0uXG4gICAgICogQHJldHVybnMge29iamVjdH0gQSBvYmplY3QgY29udGFpbmluZyB0aGUgdmFsdWVzIGNhbGN1bGF0ZWQgdG8gdXNlIGFzIHdpZHRoIGFuZCBoZWlnaHQuXG4gICAgICovXG4gICAgcmVzaXplQ2FudmFzKHdpZHRoLCBoZWlnaHQpIHtcbiAgICAgICAgaWYgKCF0aGlzLl9hbGxvd1Jlc2l6ZSkgcmV0dXJuIHVuZGVmaW5lZDsgLy8gcHJldmVudCByZXNpemluZyAoZS5nLiBpZiBwcmVzZW50aW5nIGluIFZSIEhNRClcblxuICAgICAgICAvLyBwcmV2ZW50IHJlc2l6aW5nIHdoZW4gaW4gWFIgc2Vzc2lvblxuICAgICAgICBpZiAodGhpcy54ciAmJiB0aGlzLnhyLnNlc3Npb24pXG4gICAgICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuXG4gICAgICAgIGNvbnN0IHdpbmRvd1dpZHRoID0gd2luZG93LmlubmVyV2lkdGg7XG4gICAgICAgIGNvbnN0IHdpbmRvd0hlaWdodCA9IHdpbmRvdy5pbm5lckhlaWdodDtcblxuICAgICAgICBpZiAodGhpcy5fZmlsbE1vZGUgPT09IEZJTExNT0RFX0tFRVBfQVNQRUNUKSB7XG4gICAgICAgICAgICBjb25zdCByID0gdGhpcy5ncmFwaGljc0RldmljZS5jYW52YXMud2lkdGggLyB0aGlzLmdyYXBoaWNzRGV2aWNlLmNhbnZhcy5oZWlnaHQ7XG4gICAgICAgICAgICBjb25zdCB3aW5SID0gd2luZG93V2lkdGggLyB3aW5kb3dIZWlnaHQ7XG5cbiAgICAgICAgICAgIGlmIChyID4gd2luUikge1xuICAgICAgICAgICAgICAgIHdpZHRoID0gd2luZG93V2lkdGg7XG4gICAgICAgICAgICAgICAgaGVpZ2h0ID0gd2lkdGggLyByO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBoZWlnaHQgPSB3aW5kb3dIZWlnaHQ7XG4gICAgICAgICAgICAgICAgd2lkdGggPSBoZWlnaHQgKiByO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKHRoaXMuX2ZpbGxNb2RlID09PSBGSUxMTU9ERV9GSUxMX1dJTkRPVykge1xuICAgICAgICAgICAgd2lkdGggPSB3aW5kb3dXaWR0aDtcbiAgICAgICAgICAgIGhlaWdodCA9IHdpbmRvd0hlaWdodDtcbiAgICAgICAgfVxuICAgICAgICAvLyBPVEhFUldJU0U6IEZJTExNT0RFX05PTkUgdXNlIHdpZHRoIGFuZCBoZWlnaHQgdGhhdCBhcmUgcHJvdmlkZWRcblxuICAgICAgICB0aGlzLmdyYXBoaWNzRGV2aWNlLmNhbnZhcy5zdHlsZS53aWR0aCA9IHdpZHRoICsgJ3B4JztcbiAgICAgICAgdGhpcy5ncmFwaGljc0RldmljZS5jYW52YXMuc3R5bGUuaGVpZ2h0ID0gaGVpZ2h0ICsgJ3B4JztcblxuICAgICAgICB0aGlzLnVwZGF0ZUNhbnZhc1NpemUoKTtcblxuICAgICAgICAvLyByZXR1cm4gdGhlIGZpbmFsIHZhbHVlcyBjYWxjdWxhdGVkIGZvciB3aWR0aCBhbmQgaGVpZ2h0XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICB3aWR0aDogd2lkdGgsXG4gICAgICAgICAgICBoZWlnaHQ6IGhlaWdodFxuICAgICAgICB9O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFVwZGF0ZXMgdGhlIHtAbGluayBHcmFwaGljc0RldmljZX0gY2FudmFzIHNpemUgdG8gbWF0Y2ggdGhlIGNhbnZhcyBzaXplIG9uIHRoZSBkb2N1bWVudFxuICAgICAqIHBhZ2UuIEl0IGlzIHJlY29tbWVuZGVkIHRvIGNhbGwgdGhpcyBmdW5jdGlvbiB3aGVuIHRoZSBjYW52YXMgc2l6ZSBjaGFuZ2VzIChlLmcgb24gd2luZG93XG4gICAgICogcmVzaXplIGFuZCBvcmllbnRhdGlvbiBjaGFuZ2UgZXZlbnRzKSBzbyB0aGF0IHRoZSBjYW52YXMgcmVzb2x1dGlvbiBpcyBpbW1lZGlhdGVseSB1cGRhdGVkLlxuICAgICAqL1xuICAgIHVwZGF0ZUNhbnZhc1NpemUoKSB7XG4gICAgICAgIC8vIERvbid0IHVwZGF0ZSBpZiB3ZSBhcmUgaW4gVlIgb3IgWFJcbiAgICAgICAgaWYgKCghdGhpcy5fYWxsb3dSZXNpemUpIHx8ICh0aGlzLnhyPy5hY3RpdmUpKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBJbiBBVVRPIG1vZGUgdGhlIHJlc29sdXRpb24gaXMgY2hhbmdlZCB0byBtYXRjaCB0aGUgY2FudmFzIHNpemVcbiAgICAgICAgaWYgKHRoaXMuX3Jlc29sdXRpb25Nb2RlID09PSBSRVNPTFVUSU9OX0FVVE8pIHtcbiAgICAgICAgICAgIC8vIENoZWNrIGlmIHRoZSBjYW52YXMgRE9NIGhhcyBjaGFuZ2VkIHNpemVcbiAgICAgICAgICAgIGNvbnN0IGNhbnZhcyA9IHRoaXMuZ3JhcGhpY3NEZXZpY2UuY2FudmFzO1xuICAgICAgICAgICAgdGhpcy5ncmFwaGljc0RldmljZS5yZXNpemVDYW52YXMoY2FudmFzLmNsaWVudFdpZHRoLCBjYW52YXMuY2xpZW50SGVpZ2h0KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEV2ZW50IGhhbmRsZXIgY2FsbGVkIHdoZW4gYWxsIGNvZGUgbGlicmFyaWVzIGhhdmUgYmVlbiBsb2FkZWQuIENvZGUgbGlicmFyaWVzIGFyZSBwYXNzZWRcbiAgICAgKiBpbnRvIHRoZSBjb25zdHJ1Y3RvciBvZiB0aGUgQXBwbGljYXRpb24gYW5kIHRoZSBhcHBsaWNhdGlvbiB3b24ndCBzdGFydCBydW5uaW5nIG9yIGxvYWRcbiAgICAgKiBwYWNrcyB1bnRpbCBhbGwgbGlicmFyaWVzIGhhdmUgYmVlbiBsb2FkZWQuXG4gICAgICpcbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIG9uTGlicmFyaWVzTG9hZGVkKCkge1xuICAgICAgICB0aGlzLl9saWJyYXJpZXNMb2FkZWQgPSB0cnVlO1xuXG4gICAgICAgIGlmICh0aGlzLnN5c3RlbXMucmlnaWRib2R5KSB7XG4gICAgICAgICAgICB0aGlzLnN5c3RlbXMucmlnaWRib2R5Lm9uTGlicmFyeUxvYWRlZCgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQXBwbHkgc2NlbmUgc2V0dGluZ3MgdG8gdGhlIGN1cnJlbnQgc2NlbmUuIFVzZWZ1bCB3aGVuIHlvdXIgc2NlbmUgc2V0dGluZ3MgYXJlIHBhcnNlZCBvclxuICAgICAqIGdlbmVyYXRlZCBmcm9tIGEgbm9uLVVSTCBzb3VyY2UuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge29iamVjdH0gc2V0dGluZ3MgLSBUaGUgc2NlbmUgc2V0dGluZ3MgdG8gYmUgYXBwbGllZC5cbiAgICAgKiBAcGFyYW0ge29iamVjdH0gc2V0dGluZ3MucGh5c2ljcyAtIFRoZSBwaHlzaWNzIHNldHRpbmdzIHRvIGJlIGFwcGxpZWQuXG4gICAgICogQHBhcmFtIHtudW1iZXJbXX0gc2V0dGluZ3MucGh5c2ljcy5ncmF2aXR5IC0gVGhlIHdvcmxkIHNwYWNlIHZlY3RvciByZXByZXNlbnRpbmcgZ2xvYmFsXG4gICAgICogZ3Jhdml0eSBpbiB0aGUgcGh5c2ljcyBzaW11bGF0aW9uLiBNdXN0IGJlIGEgZml4ZWQgc2l6ZSBhcnJheSB3aXRoIHRocmVlIG51bWJlciBlbGVtZW50cyxcbiAgICAgKiBjb3JyZXNwb25kaW5nIHRvIGVhY2ggYXhpcyBbIFgsIFksIFogXS5cbiAgICAgKiBAcGFyYW0ge29iamVjdH0gc2V0dGluZ3MucmVuZGVyIC0gVGhlIHJlbmRlcmluZyBzZXR0aW5ncyB0byBiZSBhcHBsaWVkLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyW119IHNldHRpbmdzLnJlbmRlci5nbG9iYWxfYW1iaWVudCAtIFRoZSBjb2xvciBvZiB0aGUgc2NlbmUncyBhbWJpZW50IGxpZ2h0LlxuICAgICAqIE11c3QgYmUgYSBmaXhlZCBzaXplIGFycmF5IHdpdGggdGhyZWUgbnVtYmVyIGVsZW1lbnRzLCBjb3JyZXNwb25kaW5nIHRvIGVhY2ggY29sb3IgY2hhbm5lbFxuICAgICAqIFsgUiwgRywgQiBdLlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBzZXR0aW5ncy5yZW5kZXIuZm9nIC0gVGhlIHR5cGUgb2YgZm9nIHVzZWQgYnkgdGhlIHNjZW5lLiBDYW4gYmU6XG4gICAgICpcbiAgICAgKiAtIHtAbGluayBGT0dfTk9ORX1cbiAgICAgKiAtIHtAbGluayBGT0dfTElORUFSfVxuICAgICAqIC0ge0BsaW5rIEZPR19FWFB9XG4gICAgICogLSB7QGxpbmsgRk9HX0VYUDJ9XG4gICAgICpcbiAgICAgKiBAcGFyYW0ge251bWJlcltdfSBzZXR0aW5ncy5yZW5kZXIuZm9nX2NvbG9yIC0gVGhlIGNvbG9yIG9mIHRoZSBmb2cgKGlmIGVuYWJsZWQpLiBNdXN0IGJlIGFcbiAgICAgKiBmaXhlZCBzaXplIGFycmF5IHdpdGggdGhyZWUgbnVtYmVyIGVsZW1lbnRzLCBjb3JyZXNwb25kaW5nIHRvIGVhY2ggY29sb3IgY2hhbm5lbCBbIFIsIEcsIEIgXS5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gc2V0dGluZ3MucmVuZGVyLmZvZ19kZW5zaXR5IC0gVGhlIGRlbnNpdHkgb2YgdGhlIGZvZyAoaWYgZW5hYmxlZCkuIFRoaXNcbiAgICAgKiBwcm9wZXJ0eSBpcyBvbmx5IHZhbGlkIGlmIHRoZSBmb2cgcHJvcGVydHkgaXMgc2V0IHRvIHtAbGluayBGT0dfRVhQfSBvciB7QGxpbmsgRk9HX0VYUDJ9LlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBzZXR0aW5ncy5yZW5kZXIuZm9nX3N0YXJ0IC0gVGhlIGRpc3RhbmNlIGZyb20gdGhlIHZpZXdwb2ludCB3aGVyZSBsaW5lYXIgZm9nXG4gICAgICogYmVnaW5zLiBUaGlzIHByb3BlcnR5IGlzIG9ubHkgdmFsaWQgaWYgdGhlIGZvZyBwcm9wZXJ0eSBpcyBzZXQgdG8ge0BsaW5rIEZPR19MSU5FQVJ9LlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBzZXR0aW5ncy5yZW5kZXIuZm9nX2VuZCAtIFRoZSBkaXN0YW5jZSBmcm9tIHRoZSB2aWV3cG9pbnQgd2hlcmUgbGluZWFyIGZvZ1xuICAgICAqIHJlYWNoZXMgaXRzIG1heGltdW0uIFRoaXMgcHJvcGVydHkgaXMgb25seSB2YWxpZCBpZiB0aGUgZm9nIHByb3BlcnR5IGlzIHNldCB0byB7QGxpbmsgRk9HX0xJTkVBUn0uXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHNldHRpbmdzLnJlbmRlci5nYW1tYV9jb3JyZWN0aW9uIC0gVGhlIGdhbW1hIGNvcnJlY3Rpb24gdG8gYXBwbHkgd2hlblxuICAgICAqIHJlbmRlcmluZyB0aGUgc2NlbmUuIENhbiBiZTpcbiAgICAgKlxuICAgICAqIC0ge0BsaW5rIEdBTU1BX05PTkV9XG4gICAgICogLSB7QGxpbmsgR0FNTUFfU1JHQn1cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBzZXR0aW5ncy5yZW5kZXIudG9uZW1hcHBpbmcgLSBUaGUgdG9uZW1hcHBpbmcgdHJhbnNmb3JtIHRvIGFwcGx5IHdoZW5cbiAgICAgKiB3cml0aW5nIGZyYWdtZW50cyB0byB0aGUgZnJhbWUgYnVmZmVyLiBDYW4gYmU6XG4gICAgICpcbiAgICAgKiAtIHtAbGluayBUT05FTUFQX0xJTkVBUn1cbiAgICAgKiAtIHtAbGluayBUT05FTUFQX0ZJTE1JQ31cbiAgICAgKiAtIHtAbGluayBUT05FTUFQX0hFSkx9XG4gICAgICogLSB7QGxpbmsgVE9ORU1BUF9BQ0VTfVxuICAgICAqXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHNldHRpbmdzLnJlbmRlci5leHBvc3VyZSAtIFRoZSBleHBvc3VyZSB2YWx1ZSB0d2Vha3MgdGhlIG92ZXJhbGwgYnJpZ2h0bmVzc1xuICAgICAqIG9mIHRoZSBzY2VuZS5cbiAgICAgKiBAcGFyYW0ge251bWJlcnxudWxsfSBbc2V0dGluZ3MucmVuZGVyLnNreWJveF0gLSBUaGUgYXNzZXQgSUQgb2YgdGhlIGN1YmUgbWFwIHRleHR1cmUgdG8gYmVcbiAgICAgKiB1c2VkIGFzIHRoZSBzY2VuZSdzIHNreWJveC4gRGVmYXVsdHMgdG8gbnVsbC5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gc2V0dGluZ3MucmVuZGVyLnNreWJveEludGVuc2l0eSAtIE11bHRpcGxpZXIgZm9yIHNreWJveCBpbnRlbnNpdHkuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHNldHRpbmdzLnJlbmRlci5za3lib3hMdW1pbmFuY2UgLSBMdXggKGxtL21eMikgdmFsdWUgZm9yIHNreWJveCBpbnRlbnNpdHkgd2hlbiBwaHlzaWNhbCBsaWdodCB1bml0cyBhcmUgZW5hYmxlZC5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gc2V0dGluZ3MucmVuZGVyLnNreWJveE1pcCAtIFRoZSBtaXAgbGV2ZWwgb2YgdGhlIHNreWJveCB0byBiZSBkaXNwbGF5ZWQuXG4gICAgICogT25seSB2YWxpZCBmb3IgcHJlZmlsdGVyZWQgY3ViZW1hcCBza3lib3hlcy5cbiAgICAgKiBAcGFyYW0ge251bWJlcltdfSBzZXR0aW5ncy5yZW5kZXIuc2t5Ym94Um90YXRpb24gLSBSb3RhdGlvbiBvZiBza3lib3guXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHNldHRpbmdzLnJlbmRlci5saWdodG1hcFNpemVNdWx0aXBsaWVyIC0gVGhlIGxpZ2h0bWFwIHJlc29sdXRpb24gbXVsdGlwbGllci5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gc2V0dGluZ3MucmVuZGVyLmxpZ2h0bWFwTWF4UmVzb2x1dGlvbiAtIFRoZSBtYXhpbXVtIGxpZ2h0bWFwIHJlc29sdXRpb24uXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHNldHRpbmdzLnJlbmRlci5saWdodG1hcE1vZGUgLSBUaGUgbGlnaHRtYXAgYmFraW5nIG1vZGUuIENhbiBiZTpcbiAgICAgKlxuICAgICAqIC0ge0BsaW5rIEJBS0VfQ09MT1J9OiBzaW5nbGUgY29sb3IgbGlnaHRtYXBcbiAgICAgKiAtIHtAbGluayBCQUtFX0NPTE9SRElSfTogc2luZ2xlIGNvbG9yIGxpZ2h0bWFwICsgZG9taW5hbnQgbGlnaHQgZGlyZWN0aW9uICh1c2VkIGZvciBidW1wL3NwZWN1bGFyKVxuICAgICAqXG4gICAgICogQHBhcmFtIHtib29sZWFufSBzZXR0aW5ncy5yZW5kZXIuYW1iaWVudEJha2UgLSBFbmFibGUgYmFraW5nIGFtYmllbnQgbGlnaHQgaW50byBsaWdodG1hcHMuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHNldHRpbmdzLnJlbmRlci5hbWJpZW50QmFrZU51bVNhbXBsZXMgLSBOdW1iZXIgb2Ygc2FtcGxlcyB0byB1c2Ugd2hlbiBiYWtpbmcgYW1iaWVudCBsaWdodC5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gc2V0dGluZ3MucmVuZGVyLmFtYmllbnRCYWtlU3BoZXJlUGFydCAtIEhvdyBtdWNoIG9mIHRoZSBzcGhlcmUgdG8gaW5jbHVkZSB3aGVuIGJha2luZyBhbWJpZW50IGxpZ2h0LlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBzZXR0aW5ncy5yZW5kZXIuYW1iaWVudEJha2VPY2NsdXNpb25CcmlnaHRuZXNzIC0gQnJpZ2h0bmVzcyBvZiB0aGUgYmFrZWQgYW1iaWVudCBvY2NsdXNpb24uXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHNldHRpbmdzLnJlbmRlci5hbWJpZW50QmFrZU9jY2x1c2lvbkNvbnRyYXN0IC0gQ29udHJhc3Qgb2YgdGhlIGJha2VkIGFtYmllbnQgb2NjbHVzaW9uLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBzZXR0aW5ncy5yZW5kZXIuYW1iaWVudEx1bWluYW5jZSAtIEx1eCAobG0vbV4yKSB2YWx1ZSBmb3IgYW1iaWVudCBsaWdodCBpbnRlbnNpdHkuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IHNldHRpbmdzLnJlbmRlci5jbHVzdGVyZWRMaWdodGluZ0VuYWJsZWQgLSBFbmFibGUgY2x1c3RlcmVkIGxpZ2h0aW5nLlxuICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gc2V0dGluZ3MucmVuZGVyLmxpZ2h0aW5nU2hhZG93c0VuYWJsZWQgLSBJZiBzZXQgdG8gdHJ1ZSwgdGhlIGNsdXN0ZXJlZCBsaWdodGluZyB3aWxsIHN1cHBvcnQgc2hhZG93cy5cbiAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IHNldHRpbmdzLnJlbmRlci5saWdodGluZ0Nvb2tpZXNFbmFibGVkIC0gSWYgc2V0IHRvIHRydWUsIHRoZSBjbHVzdGVyZWQgbGlnaHRpbmcgd2lsbCBzdXBwb3J0IGNvb2tpZSB0ZXh0dXJlcy5cbiAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IHNldHRpbmdzLnJlbmRlci5saWdodGluZ0FyZWFMaWdodHNFbmFibGVkIC0gSWYgc2V0IHRvIHRydWUsIHRoZSBjbHVzdGVyZWQgbGlnaHRpbmcgd2lsbCBzdXBwb3J0IGFyZWEgbGlnaHRzLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBzZXR0aW5ncy5yZW5kZXIubGlnaHRpbmdTaGFkb3dBdGxhc1Jlc29sdXRpb24gLSBSZXNvbHV0aW9uIG9mIHRoZSBhdGxhcyB0ZXh0dXJlIHN0b3JpbmcgYWxsIG5vbi1kaXJlY3Rpb25hbCBzaGFkb3cgdGV4dHVyZXMuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHNldHRpbmdzLnJlbmRlci5saWdodGluZ0Nvb2tpZUF0bGFzUmVzb2x1dGlvbiAtIFJlc29sdXRpb24gb2YgdGhlIGF0bGFzIHRleHR1cmUgc3RvcmluZyBhbGwgbm9uLWRpcmVjdGlvbmFsIGNvb2tpZSB0ZXh0dXJlcy5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gc2V0dGluZ3MucmVuZGVyLmxpZ2h0aW5nTWF4TGlnaHRzUGVyQ2VsbCAtIE1heGltdW0gbnVtYmVyIG9mIGxpZ2h0cyBhIGNlbGwgY2FuIHN0b3JlLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBzZXR0aW5ncy5yZW5kZXIubGlnaHRpbmdTaGFkb3dUeXBlIC0gVGhlIHR5cGUgb2Ygc2hhZG93IGZpbHRlcmluZyB1c2VkIGJ5IGFsbCBzaGFkb3dzLiBDYW4gYmU6XG4gICAgICpcbiAgICAgKiAtIHtAbGluayBTSEFET1dfUENGMX06IFBDRiAxeDEgc2FtcGxpbmcuXG4gICAgICogLSB7QGxpbmsgU0hBRE9XX1BDRjN9OiBQQ0YgM3gzIHNhbXBsaW5nLlxuICAgICAqIC0ge0BsaW5rIFNIQURPV19QQ0Y1fTogUENGIDV4NSBzYW1wbGluZy4gRmFsbHMgYmFjayB0byB7QGxpbmsgU0hBRE9XX1BDRjN9IG9uIFdlYkdMIDEuMC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7VmVjM30gc2V0dGluZ3MucmVuZGVyLmxpZ2h0aW5nQ2VsbHMgLSBOdW1iZXIgb2YgY2VsbHMgYWxvbmcgZWFjaCB3b3JsZC1zcGFjZSBheGlzIHRoZSBzcGFjZSBjb250YWluaW5nIGxpZ2h0c1xuICAgICAqIGlzIHN1YmRpdmlkZWQgaW50by5cbiAgICAgKlxuICAgICAqIE9ubHkgbGlnaHRzIHdpdGggYmFrZURpcj10cnVlIHdpbGwgYmUgdXNlZCBmb3IgZ2VuZXJhdGluZyB0aGUgZG9taW5hbnQgbGlnaHQgZGlyZWN0aW9uLlxuICAgICAqIEBleGFtcGxlXG4gICAgICpcbiAgICAgKiBjb25zdCBzZXR0aW5ncyA9IHtcbiAgICAgKiAgICAgcGh5c2ljczoge1xuICAgICAqICAgICAgICAgZ3Jhdml0eTogWzAsIC05LjgsIDBdXG4gICAgICogICAgIH0sXG4gICAgICogICAgIHJlbmRlcjoge1xuICAgICAqICAgICAgICAgZm9nX2VuZDogMTAwMCxcbiAgICAgKiAgICAgICAgIHRvbmVtYXBwaW5nOiAwLFxuICAgICAqICAgICAgICAgc2t5Ym94OiBudWxsLFxuICAgICAqICAgICAgICAgZm9nX2RlbnNpdHk6IDAuMDEsXG4gICAgICogICAgICAgICBnYW1tYV9jb3JyZWN0aW9uOiAxLFxuICAgICAqICAgICAgICAgZXhwb3N1cmU6IDEsXG4gICAgICogICAgICAgICBmb2dfc3RhcnQ6IDEsXG4gICAgICogICAgICAgICBnbG9iYWxfYW1iaWVudDogWzAsIDAsIDBdLFxuICAgICAqICAgICAgICAgc2t5Ym94SW50ZW5zaXR5OiAxLFxuICAgICAqICAgICAgICAgc2t5Ym94Um90YXRpb246IFswLCAwLCAwXSxcbiAgICAgKiAgICAgICAgIGZvZ19jb2xvcjogWzAsIDAsIDBdLFxuICAgICAqICAgICAgICAgbGlnaHRtYXBNb2RlOiAxLFxuICAgICAqICAgICAgICAgZm9nOiAnbm9uZScsXG4gICAgICogICAgICAgICBsaWdodG1hcE1heFJlc29sdXRpb246IDIwNDgsXG4gICAgICogICAgICAgICBza3lib3hNaXA6IDIsXG4gICAgICogICAgICAgICBsaWdodG1hcFNpemVNdWx0aXBsaWVyOiAxNlxuICAgICAqICAgICB9XG4gICAgICogfTtcbiAgICAgKiBhcHAuYXBwbHlTY2VuZVNldHRpbmdzKHNldHRpbmdzKTtcbiAgICAgKi9cbiAgICBhcHBseVNjZW5lU2V0dGluZ3Moc2V0dGluZ3MpIHtcbiAgICAgICAgbGV0IGFzc2V0O1xuXG4gICAgICAgIGlmICh0aGlzLnN5c3RlbXMucmlnaWRib2R5ICYmIHR5cGVvZiBBbW1vICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgY29uc3QgZ3Jhdml0eSA9IHNldHRpbmdzLnBoeXNpY3MuZ3Jhdml0eTtcbiAgICAgICAgICAgIHRoaXMuc3lzdGVtcy5yaWdpZGJvZHkuZ3Jhdml0eS5zZXQoZ3Jhdml0eVswXSwgZ3Jhdml0eVsxXSwgZ3Jhdml0eVsyXSk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnNjZW5lLmFwcGx5U2V0dGluZ3Moc2V0dGluZ3MpO1xuXG4gICAgICAgIGlmIChzZXR0aW5ncy5yZW5kZXIuaGFzT3duUHJvcGVydHkoJ3NreWJveCcpKSB7XG4gICAgICAgICAgICBpZiAoc2V0dGluZ3MucmVuZGVyLnNreWJveCkge1xuICAgICAgICAgICAgICAgIGFzc2V0ID0gdGhpcy5hc3NldHMuZ2V0KHNldHRpbmdzLnJlbmRlci5za3lib3gpO1xuXG4gICAgICAgICAgICAgICAgaWYgKGFzc2V0KSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0U2t5Ym94KGFzc2V0KTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmFzc2V0cy5vbmNlKCdhZGQ6JyArIHNldHRpbmdzLnJlbmRlci5za3lib3gsIHRoaXMuc2V0U2t5Ym94LCB0aGlzKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0U2t5Ym94KG51bGwpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyB0aGUgYXJlYSBsaWdodCBMVVQgdGFibGVzIGZvciB0aGlzIGFwcC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7bnVtYmVyW119IGx0Y01hdDEgLSBMVVQgdGFibGUgb2YgdHlwZSBgYXJyYXlgIHRvIGJlIHNldC5cbiAgICAgKiBAcGFyYW0ge251bWJlcltdfSBsdGNNYXQyIC0gTFVUIHRhYmxlIG9mIHR5cGUgYGFycmF5YCB0byBiZSBzZXQuXG4gICAgICovXG4gICAgc2V0QXJlYUxpZ2h0THV0cyhsdGNNYXQxLCBsdGNNYXQyKSB7XG5cbiAgICAgICAgaWYgKGx0Y01hdDEgJiYgbHRjTWF0Mikge1xuICAgICAgICAgICAgQXJlYUxpZ2h0THV0cy5zZXQodGhpcy5ncmFwaGljc0RldmljZSwgbHRjTWF0MSwgbHRjTWF0Mik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBEZWJ1Zy53YXJuKFwic2V0QXJlYUxpZ2h0THV0czogTFVUcyBmb3IgYXJlYSBsaWdodCBhcmUgbm90IHZhbGlkXCIpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyB0aGUgc2t5Ym94IGFzc2V0IHRvIGN1cnJlbnQgc2NlbmUsIGFuZCBzdWJzY3JpYmVzIHRvIGFzc2V0IGxvYWQvY2hhbmdlIGV2ZW50cy5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7QXNzZXR9IGFzc2V0IC0gQXNzZXQgb2YgdHlwZSBgc2t5Ym94YCB0byBiZSBzZXQgdG8sIG9yIG51bGwgdG8gcmVtb3ZlIHNreWJveC5cbiAgICAgKi9cbiAgICBzZXRTa3lib3goYXNzZXQpIHtcbiAgICAgICAgaWYgKGFzc2V0ICE9PSB0aGlzLl9za3lib3hBc3NldCkge1xuICAgICAgICAgICAgY29uc3Qgb25Ta3lib3hSZW1vdmVkID0gKCkgPT4ge1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0U2t5Ym94KG51bGwpO1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgY29uc3Qgb25Ta3lib3hDaGFuZ2VkID0gKCkgPT4ge1xuICAgICAgICAgICAgICAgIHRoaXMuc2NlbmUuc2V0U2t5Ym94KHRoaXMuX3NreWJveEFzc2V0ID8gdGhpcy5fc2t5Ym94QXNzZXQucmVzb3VyY2VzIDogbnVsbCk7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAvLyBjbGVhbnVwIHByZXZpb3VzIGFzc2V0XG4gICAgICAgICAgICBpZiAodGhpcy5fc2t5Ym94QXNzZXQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmFzc2V0cy5vZmYoJ2xvYWQ6JyArIHRoaXMuX3NreWJveEFzc2V0LmlkLCBvblNreWJveENoYW5nZWQsIHRoaXMpO1xuICAgICAgICAgICAgICAgIHRoaXMuYXNzZXRzLm9mZigncmVtb3ZlOicgKyB0aGlzLl9za3lib3hBc3NldC5pZCwgb25Ta3lib3hSZW1vdmVkLCB0aGlzKTtcbiAgICAgICAgICAgICAgICB0aGlzLl9za3lib3hBc3NldC5vZmYoJ2NoYW5nZScsIG9uU2t5Ym94Q2hhbmdlZCwgdGhpcyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIHNldCBuZXcgYXNzZXRcbiAgICAgICAgICAgIHRoaXMuX3NreWJveEFzc2V0ID0gYXNzZXQ7XG4gICAgICAgICAgICBpZiAodGhpcy5fc2t5Ym94QXNzZXQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmFzc2V0cy5vbignbG9hZDonICsgdGhpcy5fc2t5Ym94QXNzZXQuaWQsIG9uU2t5Ym94Q2hhbmdlZCwgdGhpcyk7XG4gICAgICAgICAgICAgICAgdGhpcy5hc3NldHMub25jZSgncmVtb3ZlOicgKyB0aGlzLl9za3lib3hBc3NldC5pZCwgb25Ta3lib3hSZW1vdmVkLCB0aGlzKTtcbiAgICAgICAgICAgICAgICB0aGlzLl9za3lib3hBc3NldC5vbignY2hhbmdlJywgb25Ta3lib3hDaGFuZ2VkLCB0aGlzKTtcblxuICAgICAgICAgICAgICAgIGlmICh0aGlzLnNjZW5lLnNreWJveE1pcCA9PT0gMCAmJiAhdGhpcy5fc2t5Ym94QXNzZXQubG9hZEZhY2VzKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3NreWJveEFzc2V0LmxvYWRGYWNlcyA9IHRydWU7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgdGhpcy5hc3NldHMubG9hZCh0aGlzLl9za3lib3hBc3NldCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIG9uU2t5Ym94Q2hhbmdlZCgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqIEBwcml2YXRlICovXG4gICAgX2ZpcnN0QmFrZSgpIHtcbiAgICAgICAgdGhpcy5saWdodG1hcHBlcj8uYmFrZShudWxsLCB0aGlzLnNjZW5lLmxpZ2h0bWFwTW9kZSk7XG4gICAgfVxuXG4gICAgLyoqIEBwcml2YXRlICovXG4gICAgX2ZpcnN0QmF0Y2goKSB7XG4gICAgICAgIHRoaXMuYmF0Y2hlcj8uZ2VuZXJhdGUoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBQcm92aWRlIGFuIG9wcG9ydHVuaXR5IHRvIG1vZGlmeSB0aGUgdGltZXN0YW1wIHN1cHBsaWVkIGJ5IHJlcXVlc3RBbmltYXRpb25GcmFtZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBbdGltZXN0YW1wXSAtIFRoZSB0aW1lc3RhbXAgc3VwcGxpZWQgYnkgcmVxdWVzdEFuaW1hdGlvbkZyYW1lLlxuICAgICAqIEByZXR1cm5zIHtudW1iZXJ8dW5kZWZpbmVkfSBUaGUgbW9kaWZpZWQgdGltZXN0YW1wLlxuICAgICAqIEBpZ25vcmVcbiAgICAgKi9cbiAgICBfcHJvY2Vzc1RpbWVzdGFtcCh0aW1lc3RhbXApIHtcbiAgICAgICAgcmV0dXJuIHRpbWVzdGFtcDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBEcmF3cyBhIHNpbmdsZSBsaW5lLiBMaW5lIHN0YXJ0IGFuZCBlbmQgY29vcmRpbmF0ZXMgYXJlIHNwZWNpZmllZCBpbiB3b3JsZC1zcGFjZS4gVGhlIGxpbmVcbiAgICAgKiB3aWxsIGJlIGZsYXQtc2hhZGVkIHdpdGggdGhlIHNwZWNpZmllZCBjb2xvci5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7VmVjM30gc3RhcnQgLSBUaGUgc3RhcnQgd29ybGQtc3BhY2UgY29vcmRpbmF0ZSBvZiB0aGUgbGluZS5cbiAgICAgKiBAcGFyYW0ge1ZlYzN9IGVuZCAtIFRoZSBlbmQgd29ybGQtc3BhY2UgY29vcmRpbmF0ZSBvZiB0aGUgbGluZS5cbiAgICAgKiBAcGFyYW0ge0NvbG9yfSBbY29sb3JdIC0gVGhlIGNvbG9yIG9mIHRoZSBsaW5lLiBJdCBkZWZhdWx0cyB0byB3aGl0ZSBpZiBub3Qgc3BlY2lmaWVkLlxuICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gW2RlcHRoVGVzdF0gLSBTcGVjaWZpZXMgaWYgdGhlIGxpbmUgaXMgZGVwdGggdGVzdGVkIGFnYWluc3QgdGhlIGRlcHRoXG4gICAgICogYnVmZmVyLiBEZWZhdWx0cyB0byB0cnVlLlxuICAgICAqIEBwYXJhbSB7TGF5ZXJ9IFtsYXllcl0gLSBUaGUgbGF5ZXIgdG8gcmVuZGVyIHRoZSBsaW5lIGludG8uIERlZmF1bHRzIHRvIHtAbGluayBMQVlFUklEX0lNTUVESUFURX0uXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiAvLyBSZW5kZXIgYSAxLXVuaXQgbG9uZyB3aGl0ZSBsaW5lXG4gICAgICogY29uc3Qgc3RhcnQgPSBuZXcgcGMuVmVjMygwLCAwLCAwKTtcbiAgICAgKiBjb25zdCBlbmQgPSBuZXcgcGMuVmVjMygxLCAwLCAwKTtcbiAgICAgKiBhcHAuZHJhd0xpbmUoc3RhcnQsIGVuZCk7XG4gICAgICogQGV4YW1wbGVcbiAgICAgKiAvLyBSZW5kZXIgYSAxLXVuaXQgbG9uZyByZWQgbGluZSB3aGljaCBpcyBub3QgZGVwdGggdGVzdGVkIGFuZCByZW5kZXJzIG9uIHRvcCBvZiBvdGhlciBnZW9tZXRyeVxuICAgICAqIGNvbnN0IHN0YXJ0ID0gbmV3IHBjLlZlYzMoMCwgMCwgMCk7XG4gICAgICogY29uc3QgZW5kID0gbmV3IHBjLlZlYzMoMSwgMCwgMCk7XG4gICAgICogYXBwLmRyYXdMaW5lKHN0YXJ0LCBlbmQsIHBjLkNvbG9yLlJFRCwgZmFsc2UpO1xuICAgICAqIEBleGFtcGxlXG4gICAgICogLy8gUmVuZGVyIGEgMS11bml0IGxvbmcgd2hpdGUgbGluZSBpbnRvIHRoZSB3b3JsZCBsYXllclxuICAgICAqIGNvbnN0IHN0YXJ0ID0gbmV3IHBjLlZlYzMoMCwgMCwgMCk7XG4gICAgICogY29uc3QgZW5kID0gbmV3IHBjLlZlYzMoMSwgMCwgMCk7XG4gICAgICogY29uc3Qgd29ybGRMYXllciA9IGFwcC5zY2VuZS5sYXllcnMuZ2V0TGF5ZXJCeUlkKHBjLkxBWUVSSURfV09STEQpO1xuICAgICAqIGFwcC5kcmF3TGluZShzdGFydCwgZW5kLCBwYy5Db2xvci5XSElURSwgdHJ1ZSwgd29ybGRMYXllcik7XG4gICAgICovXG4gICAgZHJhd0xpbmUoc3RhcnQsIGVuZCwgY29sb3IsIGRlcHRoVGVzdCwgbGF5ZXIpIHtcbiAgICAgICAgdGhpcy5zY2VuZS5kcmF3TGluZShzdGFydCwgZW5kLCBjb2xvciwgZGVwdGhUZXN0LCBsYXllcik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVuZGVycyBhbiBhcmJpdHJhcnkgbnVtYmVyIG9mIGRpc2NyZXRlIGxpbmUgc2VnbWVudHMuIFRoZSBsaW5lcyBhcmUgbm90IGNvbm5lY3RlZCBieSBlYWNoXG4gICAgICogc3Vic2VxdWVudCBwb2ludCBpbiB0aGUgYXJyYXkuIEluc3RlYWQsIHRoZXkgYXJlIGluZGl2aWR1YWwgc2VnbWVudHMgc3BlY2lmaWVkIGJ5IHR3b1xuICAgICAqIHBvaW50cy4gVGhlcmVmb3JlLCB0aGUgbGVuZ3RocyBvZiB0aGUgc3VwcGxpZWQgcG9zaXRpb24gYW5kIGNvbG9yIGFycmF5cyBtdXN0IGJlIHRoZSBzYW1lXG4gICAgICogYW5kIGFsc28gbXVzdCBiZSBhIG11bHRpcGxlIG9mIDIuIFRoZSBjb2xvcnMgb2YgdGhlIGVuZHMgb2YgZWFjaCBsaW5lIHNlZ21lbnQgd2lsbCBiZVxuICAgICAqIGludGVycG9sYXRlZCBhbG9uZyB0aGUgbGVuZ3RoIG9mIGVhY2ggbGluZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7VmVjM1tdfSBwb3NpdGlvbnMgLSBBbiBhcnJheSBvZiBwb2ludHMgdG8gZHJhdyBsaW5lcyBiZXR3ZWVuLiBUaGUgbGVuZ3RoIG9mIHRoZVxuICAgICAqIGFycmF5IG11c3QgYmUgYSBtdWx0aXBsZSBvZiAyLlxuICAgICAqIEBwYXJhbSB7Q29sb3JbXX0gY29sb3JzIC0gQW4gYXJyYXkgb2YgY29sb3JzIHRvIGNvbG9yIHRoZSBsaW5lcy4gVGhpcyBtdXN0IGJlIHRoZSBzYW1lXG4gICAgICogbGVuZ3RoIGFzIHRoZSBwb3NpdGlvbiBhcnJheS4gVGhlIGxlbmd0aCBvZiB0aGUgYXJyYXkgbXVzdCBhbHNvIGJlIGEgbXVsdGlwbGUgb2YgMi5cbiAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IFtkZXB0aFRlc3RdIC0gU3BlY2lmaWVzIGlmIHRoZSBsaW5lcyBhcmUgZGVwdGggdGVzdGVkIGFnYWluc3QgdGhlIGRlcHRoXG4gICAgICogYnVmZmVyLiBEZWZhdWx0cyB0byB0cnVlLlxuICAgICAqIEBwYXJhbSB7TGF5ZXJ9IFtsYXllcl0gLSBUaGUgbGF5ZXIgdG8gcmVuZGVyIHRoZSBsaW5lcyBpbnRvLiBEZWZhdWx0cyB0byB7QGxpbmsgTEFZRVJJRF9JTU1FRElBVEV9LlxuICAgICAqIEBleGFtcGxlXG4gICAgICogLy8gUmVuZGVyIGEgc2luZ2xlIGxpbmUsIHdpdGggdW5pcXVlIGNvbG9ycyBmb3IgZWFjaCBwb2ludFxuICAgICAqIGNvbnN0IHN0YXJ0ID0gbmV3IHBjLlZlYzMoMCwgMCwgMCk7XG4gICAgICogY29uc3QgZW5kID0gbmV3IHBjLlZlYzMoMSwgMCwgMCk7XG4gICAgICogYXBwLmRyYXdMaW5lcyhbc3RhcnQsIGVuZF0sIFtwYy5Db2xvci5SRUQsIHBjLkNvbG9yLldISVRFXSk7XG4gICAgICogQGV4YW1wbGVcbiAgICAgKiAvLyBSZW5kZXIgMiBkaXNjcmV0ZSBsaW5lIHNlZ21lbnRzXG4gICAgICogY29uc3QgcG9pbnRzID0gW1xuICAgICAqICAgICAvLyBMaW5lIDFcbiAgICAgKiAgICAgbmV3IHBjLlZlYzMoMCwgMCwgMCksXG4gICAgICogICAgIG5ldyBwYy5WZWMzKDEsIDAsIDApLFxuICAgICAqICAgICAvLyBMaW5lIDJcbiAgICAgKiAgICAgbmV3IHBjLlZlYzMoMSwgMSwgMCksXG4gICAgICogICAgIG5ldyBwYy5WZWMzKDEsIDEsIDEpXG4gICAgICogXTtcbiAgICAgKiBjb25zdCBjb2xvcnMgPSBbXG4gICAgICogICAgIC8vIExpbmUgMVxuICAgICAqICAgICBwYy5Db2xvci5SRUQsXG4gICAgICogICAgIHBjLkNvbG9yLllFTExPVyxcbiAgICAgKiAgICAgLy8gTGluZSAyXG4gICAgICogICAgIHBjLkNvbG9yLkNZQU4sXG4gICAgICogICAgIHBjLkNvbG9yLkJMVUVcbiAgICAgKiBdO1xuICAgICAqIGFwcC5kcmF3TGluZXMocG9pbnRzLCBjb2xvcnMpO1xuICAgICAqL1xuICAgIGRyYXdMaW5lcyhwb3NpdGlvbnMsIGNvbG9ycywgZGVwdGhUZXN0ID0gdHJ1ZSwgbGF5ZXIgPSB0aGlzLnNjZW5lLmRlZmF1bHREcmF3TGF5ZXIpIHtcbiAgICAgICAgdGhpcy5zY2VuZS5kcmF3TGluZXMocG9zaXRpb25zLCBjb2xvcnMsIGRlcHRoVGVzdCwgbGF5ZXIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJlbmRlcnMgYW4gYXJiaXRyYXJ5IG51bWJlciBvZiBkaXNjcmV0ZSBsaW5lIHNlZ21lbnRzLiBUaGUgbGluZXMgYXJlIG5vdCBjb25uZWN0ZWQgYnkgZWFjaFxuICAgICAqIHN1YnNlcXVlbnQgcG9pbnQgaW4gdGhlIGFycmF5LiBJbnN0ZWFkLCB0aGV5IGFyZSBpbmRpdmlkdWFsIHNlZ21lbnRzIHNwZWNpZmllZCBieSB0d29cbiAgICAgKiBwb2ludHMuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge251bWJlcltdfSBwb3NpdGlvbnMgLSBBbiBhcnJheSBvZiBwb2ludHMgdG8gZHJhdyBsaW5lcyBiZXR3ZWVuLiBFYWNoIHBvaW50IGlzXG4gICAgICogcmVwcmVzZW50ZWQgYnkgMyBudW1iZXJzIC0geCwgeSBhbmQgeiBjb29yZGluYXRlLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyW119IGNvbG9ycyAtIEFuIGFycmF5IG9mIGNvbG9ycyB0byBjb2xvciB0aGUgbGluZXMuIFRoaXMgbXVzdCBiZSB0aGUgc2FtZVxuICAgICAqIGxlbmd0aCBhcyB0aGUgcG9zaXRpb24gYXJyYXkuIFRoZSBsZW5ndGggb2YgdGhlIGFycmF5IG11c3QgYWxzbyBiZSBhIG11bHRpcGxlIG9mIDIuXG4gICAgICogQHBhcmFtIHtib29sZWFufSBbZGVwdGhUZXN0XSAtIFNwZWNpZmllcyBpZiB0aGUgbGluZXMgYXJlIGRlcHRoIHRlc3RlZCBhZ2FpbnN0IHRoZSBkZXB0aFxuICAgICAqIGJ1ZmZlci4gRGVmYXVsdHMgdG8gdHJ1ZS5cbiAgICAgKiBAcGFyYW0ge0xheWVyfSBbbGF5ZXJdIC0gVGhlIGxheWVyIHRvIHJlbmRlciB0aGUgbGluZXMgaW50by4gRGVmYXVsdHMgdG8ge0BsaW5rIExBWUVSSURfSU1NRURJQVRFfS5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIC8vIFJlbmRlciAyIGRpc2NyZXRlIGxpbmUgc2VnbWVudHNcbiAgICAgKiBjb25zdCBwb2ludHMgPSBbXG4gICAgICogICAgIC8vIExpbmUgMVxuICAgICAqICAgICAwLCAwLCAwLFxuICAgICAqICAgICAxLCAwLCAwLFxuICAgICAqICAgICAvLyBMaW5lIDJcbiAgICAgKiAgICAgMSwgMSwgMCxcbiAgICAgKiAgICAgMSwgMSwgMVxuICAgICAqIF07XG4gICAgICogY29uc3QgY29sb3JzID0gW1xuICAgICAqICAgICAvLyBMaW5lIDFcbiAgICAgKiAgICAgMSwgMCwgMCwgMSwgIC8vIHJlZFxuICAgICAqICAgICAwLCAxLCAwLCAxLCAgLy8gZ3JlZW5cbiAgICAgKiAgICAgLy8gTGluZSAyXG4gICAgICogICAgIDAsIDAsIDEsIDEsICAvLyBibHVlXG4gICAgICogICAgIDEsIDEsIDEsIDEgICAvLyB3aGl0ZVxuICAgICAqIF07XG4gICAgICogYXBwLmRyYXdMaW5lQXJyYXlzKHBvaW50cywgY29sb3JzKTtcbiAgICAgKi9cbiAgICBkcmF3TGluZUFycmF5cyhwb3NpdGlvbnMsIGNvbG9ycywgZGVwdGhUZXN0ID0gdHJ1ZSwgbGF5ZXIgPSB0aGlzLnNjZW5lLmRlZmF1bHREcmF3TGF5ZXIpIHtcbiAgICAgICAgdGhpcy5zY2VuZS5kcmF3TGluZUFycmF5cyhwb3NpdGlvbnMsIGNvbG9ycywgZGVwdGhUZXN0LCBsYXllcik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRHJhd3MgYSB3aXJlZnJhbWUgc3BoZXJlIHdpdGggY2VudGVyLCByYWRpdXMgYW5kIGNvbG9yLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtWZWMzfSBjZW50ZXIgLSBUaGUgY2VudGVyIG9mIHRoZSBzcGhlcmUuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHJhZGl1cyAtIFRoZSByYWRpdXMgb2YgdGhlIHNwaGVyZS5cbiAgICAgKiBAcGFyYW0ge0NvbG9yfSBbY29sb3JdIC0gVGhlIGNvbG9yIG9mIHRoZSBzcGhlcmUuIEl0IGRlZmF1bHRzIHRvIHdoaXRlIGlmIG5vdCBzcGVjaWZpZWQuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFtzZWdtZW50c10gLSBOdW1iZXIgb2YgbGluZSBzZWdtZW50cyB1c2VkIHRvIHJlbmRlciB0aGUgY2lyY2xlcyBmb3JtaW5nIHRoZVxuICAgICAqIHNwaGVyZS4gRGVmYXVsdHMgdG8gMjAuXG4gICAgICogQHBhcmFtIHtib29sZWFufSBbZGVwdGhUZXN0XSAtIFNwZWNpZmllcyBpZiB0aGUgc3BoZXJlIGxpbmVzIGFyZSBkZXB0aCB0ZXN0ZWQgYWdhaW5zdCB0aGVcbiAgICAgKiBkZXB0aCBidWZmZXIuIERlZmF1bHRzIHRvIHRydWUuXG4gICAgICogQHBhcmFtIHtMYXllcn0gW2xheWVyXSAtIFRoZSBsYXllciB0byByZW5kZXIgdGhlIHNwaGVyZSBpbnRvLiBEZWZhdWx0cyB0byB7QGxpbmsgTEFZRVJJRF9JTU1FRElBVEV9LlxuICAgICAqIEBleGFtcGxlXG4gICAgICogLy8gUmVuZGVyIGEgcmVkIHdpcmUgc3BoZXJlIHdpdGggcmFkaXVzIG9mIDFcbiAgICAgKiBjb25zdCBjZW50ZXIgPSBuZXcgcGMuVmVjMygwLCAwLCAwKTtcbiAgICAgKiBhcHAuZHJhd1dpcmVTcGhlcmUoY2VudGVyLCAxLjAsIHBjLkNvbG9yLlJFRCk7XG4gICAgICogQGlnbm9yZVxuICAgICAqL1xuICAgIGRyYXdXaXJlU3BoZXJlKGNlbnRlciwgcmFkaXVzLCBjb2xvciA9IENvbG9yLldISVRFLCBzZWdtZW50cyA9IDIwLCBkZXB0aFRlc3QgPSB0cnVlLCBsYXllciA9IHRoaXMuc2NlbmUuZGVmYXVsdERyYXdMYXllcikge1xuICAgICAgICB0aGlzLnNjZW5lLmltbWVkaWF0ZS5kcmF3V2lyZVNwaGVyZShjZW50ZXIsIHJhZGl1cywgY29sb3IsIHNlZ21lbnRzLCBkZXB0aFRlc3QsIGxheWVyKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBEcmF3cyBhIHdpcmVmcmFtZSBheGlzIGFsaWduZWQgYm94IHNwZWNpZmllZCBieSBtaW4gYW5kIG1heCBwb2ludHMgYW5kIGNvbG9yLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtWZWMzfSBtaW5Qb2ludCAtIFRoZSBtaW4gY29ybmVyIHBvaW50IG9mIHRoZSBib3guXG4gICAgICogQHBhcmFtIHtWZWMzfSBtYXhQb2ludCAtIFRoZSBtYXggY29ybmVyIHBvaW50IG9mIHRoZSBib3guXG4gICAgICogQHBhcmFtIHtDb2xvcn0gW2NvbG9yXSAtIFRoZSBjb2xvciBvZiB0aGUgc3BoZXJlLiBJdCBkZWZhdWx0cyB0byB3aGl0ZSBpZiBub3Qgc3BlY2lmaWVkLlxuICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gW2RlcHRoVGVzdF0gLSBTcGVjaWZpZXMgaWYgdGhlIHNwaGVyZSBsaW5lcyBhcmUgZGVwdGggdGVzdGVkIGFnYWluc3QgdGhlXG4gICAgICogZGVwdGggYnVmZmVyLiBEZWZhdWx0cyB0byB0cnVlLlxuICAgICAqIEBwYXJhbSB7TGF5ZXJ9IFtsYXllcl0gLSBUaGUgbGF5ZXIgdG8gcmVuZGVyIHRoZSBzcGhlcmUgaW50by4gRGVmYXVsdHMgdG8ge0BsaW5rIExBWUVSSURfSU1NRURJQVRFfS5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIC8vIFJlbmRlciBhIHJlZCB3aXJlIGFsaWduZWQgYm94XG4gICAgICogY29uc3QgbWluID0gbmV3IHBjLlZlYzMoLTEsIC0xLCAtMSk7XG4gICAgICogY29uc3QgbWF4ID0gbmV3IHBjLlZlYzMoMSwgMSwgMSk7XG4gICAgICogYXBwLmRyYXdXaXJlQWxpZ25lZEJveChtaW4sIG1heCwgcGMuQ29sb3IuUkVEKTtcbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgZHJhd1dpcmVBbGlnbmVkQm94KG1pblBvaW50LCBtYXhQb2ludCwgY29sb3IgPSBDb2xvci5XSElURSwgZGVwdGhUZXN0ID0gdHJ1ZSwgbGF5ZXIgPSB0aGlzLnNjZW5lLmRlZmF1bHREcmF3TGF5ZXIpIHtcbiAgICAgICAgdGhpcy5zY2VuZS5pbW1lZGlhdGUuZHJhd1dpcmVBbGlnbmVkQm94KG1pblBvaW50LCBtYXhQb2ludCwgY29sb3IsIGRlcHRoVGVzdCwgbGF5ZXIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIERyYXcgbWVzaEluc3RhbmNlIGF0IHRoaXMgZnJhbWVcbiAgICAgKlxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuLi9zY2VuZS9tZXNoLWluc3RhbmNlLmpzJykuTWVzaEluc3RhbmNlfSBtZXNoSW5zdGFuY2UgLSBUaGUgbWVzaCBpbnN0YW5jZVxuICAgICAqIHRvIGRyYXcuXG4gICAgICogQHBhcmFtIHtMYXllcn0gW2xheWVyXSAtIFRoZSBsYXllciB0byByZW5kZXIgdGhlIG1lc2ggaW5zdGFuY2UgaW50by4gRGVmYXVsdHMgdG9cbiAgICAgKiB7QGxpbmsgTEFZRVJJRF9JTU1FRElBVEV9LlxuICAgICAqIEBpZ25vcmVcbiAgICAgKi9cbiAgICBkcmF3TWVzaEluc3RhbmNlKG1lc2hJbnN0YW5jZSwgbGF5ZXIgPSB0aGlzLnNjZW5lLmRlZmF1bHREcmF3TGF5ZXIpIHtcbiAgICAgICAgdGhpcy5zY2VuZS5pbW1lZGlhdGUuZHJhd01lc2gobnVsbCwgbnVsbCwgbnVsbCwgbWVzaEluc3RhbmNlLCBsYXllcik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRHJhdyBtZXNoIGF0IHRoaXMgZnJhbWUuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi4vc2NlbmUvbWVzaC5qcycpLk1lc2h9IG1lc2ggLSBUaGUgbWVzaCB0byBkcmF3LlxuICAgICAqIEBwYXJhbSB7TWF0ZXJpYWx9IG1hdGVyaWFsIC0gVGhlIG1hdGVyaWFsIHRvIHVzZSB0byByZW5kZXIgdGhlIG1lc2guXG4gICAgICogQHBhcmFtIHtNYXQ0fSBtYXRyaXggLSBUaGUgbWF0cml4IHRvIHVzZSB0byByZW5kZXIgdGhlIG1lc2guXG4gICAgICogQHBhcmFtIHtMYXllcn0gW2xheWVyXSAtIFRoZSBsYXllciB0byByZW5kZXIgdGhlIG1lc2ggaW50by4gRGVmYXVsdHMgdG8ge0BsaW5rIExBWUVSSURfSU1NRURJQVRFfS5cbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgZHJhd01lc2gobWVzaCwgbWF0ZXJpYWwsIG1hdHJpeCwgbGF5ZXIgPSB0aGlzLnNjZW5lLmRlZmF1bHREcmF3TGF5ZXIpIHtcbiAgICAgICAgdGhpcy5zY2VuZS5pbW1lZGlhdGUuZHJhd01lc2gobWF0ZXJpYWwsIG1hdHJpeCwgbWVzaCwgbnVsbCwgbGF5ZXIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIERyYXcgcXVhZCBvZiBzaXplIFstMC41LCAwLjVdIGF0IHRoaXMgZnJhbWUuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge01hdDR9IG1hdHJpeCAtIFRoZSBtYXRyaXggdG8gdXNlIHRvIHJlbmRlciB0aGUgcXVhZC5cbiAgICAgKiBAcGFyYW0ge01hdGVyaWFsfSBtYXRlcmlhbCAtIFRoZSBtYXRlcmlhbCB0byB1c2UgdG8gcmVuZGVyIHRoZSBxdWFkLlxuICAgICAqIEBwYXJhbSB7TGF5ZXJ9IFtsYXllcl0gLSBUaGUgbGF5ZXIgdG8gcmVuZGVyIHRoZSBxdWFkIGludG8uIERlZmF1bHRzIHRvIHtAbGluayBMQVlFUklEX0lNTUVESUFURX0uXG4gICAgICogQGlnbm9yZVxuICAgICAqL1xuICAgIGRyYXdRdWFkKG1hdHJpeCwgbWF0ZXJpYWwsIGxheWVyID0gdGhpcy5zY2VuZS5kZWZhdWx0RHJhd0xheWVyKSB7XG4gICAgICAgIHRoaXMuc2NlbmUuaW1tZWRpYXRlLmRyYXdNZXNoKG1hdGVyaWFsLCBtYXRyaXgsIHRoaXMuc2NlbmUuaW1tZWRpYXRlLmdldFF1YWRNZXNoKCksIG51bGwsIGxheWVyKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBEcmF3cyBhIHRleHR1cmUgYXQgW3gsIHldIHBvc2l0aW9uIG9uIHNjcmVlbiwgd2l0aCBzaXplIFt3aWR0aCwgaGVpZ2h0XS4gVGhlIG9yaWdpbiBvZiB0aGVcbiAgICAgKiBzY3JlZW4gaXMgdG9wLWxlZnQgWzAsIDBdLiBDb29yZGluYXRlcyBhbmQgc2l6ZXMgYXJlIGluIHByb2plY3RlZCBzcGFjZSAoLTEgLi4gMSkuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge251bWJlcn0geCAtIFRoZSB4IGNvb3JkaW5hdGUgb24gdGhlIHNjcmVlbiBvZiB0aGUgdG9wIGxlZnQgY29ybmVyIG9mIHRoZSB0ZXh0dXJlLlxuICAgICAqIFNob3VsZCBiZSBpbiB0aGUgcmFuZ2UgWy0xLCAxXS5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0geSAtIFRoZSB5IGNvb3JkaW5hdGUgb24gdGhlIHNjcmVlbiBvZiB0aGUgdG9wIGxlZnQgY29ybmVyIG9mIHRoZSB0ZXh0dXJlLlxuICAgICAqIFNob3VsZCBiZSBpbiB0aGUgcmFuZ2UgWy0xLCAxXS5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gd2lkdGggLSBUaGUgd2lkdGggb2YgdGhlIHJlY3RhbmdsZSBvZiB0aGUgcmVuZGVyZWQgdGV4dHVyZS4gU2hvdWxkIGJlIGluIHRoZVxuICAgICAqIHJhbmdlIFswLCAyXS5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gaGVpZ2h0IC0gVGhlIGhlaWdodCBvZiB0aGUgcmVjdGFuZ2xlIG9mIHRoZSByZW5kZXJlZCB0ZXh0dXJlLiBTaG91bGQgYmUgaW5cbiAgICAgKiB0aGUgcmFuZ2UgWzAsIDJdLlxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuLi9wbGF0Zm9ybS9ncmFwaGljcy90ZXh0dXJlLmpzJykuVGV4dHVyZX0gdGV4dHVyZSAtIFRoZSB0ZXh0dXJlIHRvIHJlbmRlci5cbiAgICAgKiBAcGFyYW0ge01hdGVyaWFsfSBtYXRlcmlhbCAtIFRoZSBtYXRlcmlhbCB1c2VkIHdoZW4gcmVuZGVyaW5nIHRoZSB0ZXh0dXJlLlxuICAgICAqIEBwYXJhbSB7TGF5ZXJ9IFtsYXllcl0gLSBUaGUgbGF5ZXIgdG8gcmVuZGVyIHRoZSB0ZXh0dXJlIGludG8uIERlZmF1bHRzIHRvIHtAbGluayBMQVlFUklEX0lNTUVESUFURX0uXG4gICAgICogQHBhcmFtIHtib29sZWFufSBbZmlsdGVyYWJsZV0gLSBJbmRpY2F0ZSBpZiB0aGUgdGV4dHVyZSBjYW4gYmUgc2FtcGxlZCB1c2luZyBmaWx0ZXJpbmcuXG4gICAgICogUGFzc2luZyBmYWxzZSB1c2VzIHVuZmlsdGVyZWQgc2FtcGxpbmcsIGFsbG93aW5nIGEgZGVwdGggdGV4dHVyZSB0byBiZSBzYW1wbGVkIG9uIFdlYkdQVS5cbiAgICAgKiBEZWZhdWx0cyB0byB0cnVlLlxuICAgICAqIEBpZ25vcmVcbiAgICAgKi9cbiAgICBkcmF3VGV4dHVyZSh4LCB5LCB3aWR0aCwgaGVpZ2h0LCB0ZXh0dXJlLCBtYXRlcmlhbCwgbGF5ZXIgPSB0aGlzLnNjZW5lLmRlZmF1bHREcmF3TGF5ZXIsIGZpbHRlcmFibGUgPSB0cnVlKSB7XG5cbiAgICAgICAgLy8gb25seSBXZWJHUFUgc3VwcG9ydHMgZmlsdGVyYWJsZSBwYXJhbWV0ZXIgdG8gYmUgZmFsc2UsIGFsbG93aW5nIGEgZGVwdGggdGV4dHVyZSAvIHNoYWRvd1xuICAgICAgICAvLyBtYXAgdG8gYmUgZmV0Y2hlZCAod2l0aG91dCBmaWx0ZXJpbmcpIGFuZCByZW5kZXJlZFxuICAgICAgICBpZiAoZmlsdGVyYWJsZSA9PT0gZmFsc2UgJiYgIXRoaXMuZ3JhcGhpY3NEZXZpY2UuaXNXZWJHUFUpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgLy8gVE9ETzogaWYgdGhpcyBpcyB1c2VkIGZvciBhbnl0aGluZyBvdGhlciB0aGFuIGRlYnVnIHRleHR1cmUgZGlzcGxheSwgd2Ugc2hvdWxkIG9wdGltaXplIHRoaXMgdG8gYXZvaWQgYWxsb2NhdGlvbnNcbiAgICAgICAgY29uc3QgbWF0cml4ID0gbmV3IE1hdDQoKTtcbiAgICAgICAgbWF0cml4LnNldFRSUyhuZXcgVmVjMyh4LCB5LCAwLjApLCBRdWF0LklERU5USVRZLCBuZXcgVmVjMyh3aWR0aCwgLWhlaWdodCwgMC4wKSk7XG5cbiAgICAgICAgaWYgKCFtYXRlcmlhbCkge1xuICAgICAgICAgICAgbWF0ZXJpYWwgPSBuZXcgTWF0ZXJpYWwoKTtcbiAgICAgICAgICAgIG1hdGVyaWFsLmN1bGwgPSBDVUxMRkFDRV9OT05FO1xuICAgICAgICAgICAgbWF0ZXJpYWwuc2V0UGFyYW1ldGVyKFwiY29sb3JNYXBcIiwgdGV4dHVyZSk7XG4gICAgICAgICAgICBtYXRlcmlhbC5zaGFkZXIgPSBmaWx0ZXJhYmxlID8gdGhpcy5zY2VuZS5pbW1lZGlhdGUuZ2V0VGV4dHVyZVNoYWRlcigpIDogdGhpcy5zY2VuZS5pbW1lZGlhdGUuZ2V0VW5maWx0ZXJhYmxlVGV4dHVyZVNoYWRlcigpO1xuICAgICAgICAgICAgbWF0ZXJpYWwudXBkYXRlKCk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmRyYXdRdWFkKG1hdHJpeCwgbWF0ZXJpYWwsIGxheWVyKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBEcmF3cyBhIGRlcHRoIHRleHR1cmUgYXQgW3gsIHldIHBvc2l0aW9uIG9uIHNjcmVlbiwgd2l0aCBzaXplIFt3aWR0aCwgaGVpZ2h0XS4gVGhlIG9yaWdpbiBvZlxuICAgICAqIHRoZSBzY3JlZW4gaXMgdG9wLWxlZnQgWzAsIDBdLiBDb29yZGluYXRlcyBhbmQgc2l6ZXMgYXJlIGluIHByb2plY3RlZCBzcGFjZSAoLTEgLi4gMSkuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge251bWJlcn0geCAtIFRoZSB4IGNvb3JkaW5hdGUgb24gdGhlIHNjcmVlbiBvZiB0aGUgdG9wIGxlZnQgY29ybmVyIG9mIHRoZSB0ZXh0dXJlLlxuICAgICAqIFNob3VsZCBiZSBpbiB0aGUgcmFuZ2UgWy0xLCAxXS5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0geSAtIFRoZSB5IGNvb3JkaW5hdGUgb24gdGhlIHNjcmVlbiBvZiB0aGUgdG9wIGxlZnQgY29ybmVyIG9mIHRoZSB0ZXh0dXJlLlxuICAgICAqIFNob3VsZCBiZSBpbiB0aGUgcmFuZ2UgWy0xLCAxXS5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gd2lkdGggLSBUaGUgd2lkdGggb2YgdGhlIHJlY3RhbmdsZSBvZiB0aGUgcmVuZGVyZWQgdGV4dHVyZS4gU2hvdWxkIGJlIGluIHRoZVxuICAgICAqIHJhbmdlIFswLCAyXS5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gaGVpZ2h0IC0gVGhlIGhlaWdodCBvZiB0aGUgcmVjdGFuZ2xlIG9mIHRoZSByZW5kZXJlZCB0ZXh0dXJlLiBTaG91bGQgYmUgaW5cbiAgICAgKiB0aGUgcmFuZ2UgWzAsIDJdLlxuICAgICAqIEBwYXJhbSB7TGF5ZXJ9IFtsYXllcl0gLSBUaGUgbGF5ZXIgdG8gcmVuZGVyIHRoZSB0ZXh0dXJlIGludG8uIERlZmF1bHRzIHRvIHtAbGluayBMQVlFUklEX0lNTUVESUFURX0uXG4gICAgICogQGlnbm9yZVxuICAgICAqL1xuICAgIGRyYXdEZXB0aFRleHR1cmUoeCwgeSwgd2lkdGgsIGhlaWdodCwgbGF5ZXIgPSB0aGlzLnNjZW5lLmRlZmF1bHREcmF3TGF5ZXIpIHtcbiAgICAgICAgY29uc3QgbWF0ZXJpYWwgPSBuZXcgTWF0ZXJpYWwoKTtcbiAgICAgICAgbWF0ZXJpYWwuY3VsbCA9IENVTExGQUNFX05PTkU7XG4gICAgICAgIG1hdGVyaWFsLnNoYWRlciA9IHRoaXMuc2NlbmUuaW1tZWRpYXRlLmdldERlcHRoVGV4dHVyZVNoYWRlcigpO1xuICAgICAgICBtYXRlcmlhbC51cGRhdGUoKTtcblxuICAgICAgICB0aGlzLmRyYXdUZXh0dXJlKHgsIHksIHdpZHRoLCBoZWlnaHQsIG51bGwsIG1hdGVyaWFsLCBsYXllcik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRGVzdHJveXMgYXBwbGljYXRpb24gYW5kIHJlbW92ZXMgYWxsIGV2ZW50IGxpc3RlbmVycyBhdCB0aGUgZW5kIG9mIHRoZSBjdXJyZW50IGVuZ2luZSBmcmFtZVxuICAgICAqIHVwZGF0ZS4gSG93ZXZlciwgaWYgY2FsbGVkIG91dHNpZGUgb2YgdGhlIGVuZ2luZSBmcmFtZSB1cGRhdGUsIGNhbGxpbmcgZGVzdHJveSgpIHdpbGxcbiAgICAgKiBkZXN0cm95IHRoZSBhcHBsaWNhdGlvbiBpbW1lZGlhdGVseS5cbiAgICAgKlxuICAgICAqIEBleGFtcGxlXG4gICAgICogYXBwLmRlc3Ryb3koKTtcbiAgICAgKi9cbiAgICBkZXN0cm95KCkge1xuICAgICAgICBpZiAodGhpcy5faW5GcmFtZVVwZGF0ZSkge1xuICAgICAgICAgICAgdGhpcy5fZGVzdHJveVJlcXVlc3RlZCA9IHRydWU7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBjYW52YXNJZCA9IHRoaXMuZ3JhcGhpY3NEZXZpY2UuY2FudmFzLmlkO1xuXG4gICAgICAgIHRoaXMub2ZmKCdsaWJyYXJpZXNsb2FkZWQnKTtcblxuICAgICAgICBpZiAodHlwZW9mIGRvY3VtZW50ICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcigndmlzaWJpbGl0eWNoYW5nZScsIHRoaXMuX3Zpc2liaWxpdHlDaGFuZ2VIYW5kbGVyLCBmYWxzZSk7XG4gICAgICAgICAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdtb3p2aXNpYmlsaXR5Y2hhbmdlJywgdGhpcy5fdmlzaWJpbGl0eUNoYW5nZUhhbmRsZXIsIGZhbHNlKTtcbiAgICAgICAgICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ21zdmlzaWJpbGl0eWNoYW5nZScsIHRoaXMuX3Zpc2liaWxpdHlDaGFuZ2VIYW5kbGVyLCBmYWxzZSk7XG4gICAgICAgICAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCd3ZWJraXR2aXNpYmlsaXR5Y2hhbmdlJywgdGhpcy5fdmlzaWJpbGl0eUNoYW5nZUhhbmRsZXIsIGZhbHNlKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLl92aXNpYmlsaXR5Q2hhbmdlSGFuZGxlciA9IG51bGw7XG5cbiAgICAgICAgdGhpcy5yb290LmRlc3Ryb3koKTtcbiAgICAgICAgdGhpcy5yb290ID0gbnVsbDtcblxuICAgICAgICBpZiAodGhpcy5tb3VzZSkge1xuICAgICAgICAgICAgdGhpcy5tb3VzZS5vZmYoKTtcbiAgICAgICAgICAgIHRoaXMubW91c2UuZGV0YWNoKCk7XG4gICAgICAgICAgICB0aGlzLm1vdXNlID0gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLmtleWJvYXJkKSB7XG4gICAgICAgICAgICB0aGlzLmtleWJvYXJkLm9mZigpO1xuICAgICAgICAgICAgdGhpcy5rZXlib2FyZC5kZXRhY2goKTtcbiAgICAgICAgICAgIHRoaXMua2V5Ym9hcmQgPSBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMudG91Y2gpIHtcbiAgICAgICAgICAgIHRoaXMudG91Y2gub2ZmKCk7XG4gICAgICAgICAgICB0aGlzLnRvdWNoLmRldGFjaCgpO1xuICAgICAgICAgICAgdGhpcy50b3VjaCA9IG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5lbGVtZW50SW5wdXQpIHtcbiAgICAgICAgICAgIHRoaXMuZWxlbWVudElucHV0LmRldGFjaCgpO1xuICAgICAgICAgICAgdGhpcy5lbGVtZW50SW5wdXQgPSBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuZ2FtZXBhZHMpIHtcbiAgICAgICAgICAgIHRoaXMuZ2FtZXBhZHMuZGVzdHJveSgpO1xuICAgICAgICAgICAgdGhpcy5nYW1lcGFkcyA9IG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5jb250cm9sbGVyKSB7XG4gICAgICAgICAgICB0aGlzLmNvbnRyb2xsZXIgPSBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5zeXN0ZW1zLmRlc3Ryb3koKTtcblxuICAgICAgICAvLyBsYXllciBjb21wb3NpdGlvblxuICAgICAgICBpZiAodGhpcy5zY2VuZS5sYXllcnMpIHtcbiAgICAgICAgICAgIHRoaXMuc2NlbmUubGF5ZXJzLmRlc3Ryb3koKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGRlc3Ryb3kgYWxsIHRleHR1cmUgcmVzb3VyY2VzXG4gICAgICAgIGNvbnN0IGFzc2V0cyA9IHRoaXMuYXNzZXRzLmxpc3QoKTtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhc3NldHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGFzc2V0c1tpXS51bmxvYWQoKTtcbiAgICAgICAgICAgIGFzc2V0c1tpXS5vZmYoKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmFzc2V0cy5vZmYoKTtcblxuXG4gICAgICAgIC8vIGRlc3Ryb3kgYnVuZGxlIHJlZ2lzdHJ5XG4gICAgICAgIHRoaXMuYnVuZGxlcy5kZXN0cm95KCk7XG4gICAgICAgIHRoaXMuYnVuZGxlcyA9IG51bGw7XG5cbiAgICAgICAgdGhpcy5pMThuLmRlc3Ryb3koKTtcbiAgICAgICAgdGhpcy5pMThuID0gbnVsbDtcblxuICAgICAgICBjb25zdCBzY3JpcHRIYW5kbGVyID0gdGhpcy5sb2FkZXIuZ2V0SGFuZGxlcignc2NyaXB0Jyk7XG4gICAgICAgIHNjcmlwdEhhbmRsZXI/LmNsZWFyQ2FjaGUoKTtcblxuICAgICAgICB0aGlzLmxvYWRlci5kZXN0cm95KCk7XG4gICAgICAgIHRoaXMubG9hZGVyID0gbnVsbDtcblxuICAgICAgICB0aGlzLnNjZW5lLmRlc3Ryb3koKTtcbiAgICAgICAgdGhpcy5zY2VuZSA9IG51bGw7XG5cbiAgICAgICAgdGhpcy5zeXN0ZW1zID0gbnVsbDtcbiAgICAgICAgdGhpcy5jb250ZXh0ID0gbnVsbDtcblxuICAgICAgICAvLyBzY3JpcHQgcmVnaXN0cnlcbiAgICAgICAgdGhpcy5zY3JpcHRzLmRlc3Ryb3koKTtcbiAgICAgICAgdGhpcy5zY3JpcHRzID0gbnVsbDtcblxuICAgICAgICB0aGlzLnNjZW5lcy5kZXN0cm95KCk7XG4gICAgICAgIHRoaXMuc2NlbmVzID0gbnVsbDtcblxuICAgICAgICB0aGlzLmxpZ2h0bWFwcGVyPy5kZXN0cm95KCk7XG4gICAgICAgIHRoaXMubGlnaHRtYXBwZXIgPSBudWxsO1xuXG4gICAgICAgIGlmICh0aGlzLl9iYXRjaGVyKSB7XG4gICAgICAgICAgICB0aGlzLl9iYXRjaGVyLmRlc3Ryb3koKTtcbiAgICAgICAgICAgIHRoaXMuX2JhdGNoZXIgPSBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fZW50aXR5SW5kZXggPSB7fTtcblxuICAgICAgICB0aGlzLmRlZmF1bHRMYXllckRlcHRoLm9uUHJlUmVuZGVyT3BhcXVlID0gbnVsbDtcbiAgICAgICAgdGhpcy5kZWZhdWx0TGF5ZXJEZXB0aC5vblBvc3RSZW5kZXJPcGFxdWUgPSBudWxsO1xuICAgICAgICB0aGlzLmRlZmF1bHRMYXllckRlcHRoLm9uRGlzYWJsZSA9IG51bGw7XG4gICAgICAgIHRoaXMuZGVmYXVsdExheWVyRGVwdGgub25FbmFibGUgPSBudWxsO1xuICAgICAgICB0aGlzLmRlZmF1bHRMYXllckRlcHRoID0gbnVsbDtcbiAgICAgICAgdGhpcy5kZWZhdWx0TGF5ZXJXb3JsZCA9IG51bGw7XG5cbiAgICAgICAgdGhpcy54cj8uZW5kKCk7XG4gICAgICAgIHRoaXMueHI/LmRlc3Ryb3koKTtcblxuICAgICAgICB0aGlzLnJlbmRlcmVyLmRlc3Ryb3koKTtcbiAgICAgICAgdGhpcy5yZW5kZXJlciA9IG51bGw7XG5cbiAgICAgICAgdGhpcy5ncmFwaGljc0RldmljZS5kZXN0cm95KCk7XG4gICAgICAgIHRoaXMuZ3JhcGhpY3NEZXZpY2UgPSBudWxsO1xuXG4gICAgICAgIHRoaXMudGljayA9IG51bGw7XG5cbiAgICAgICAgdGhpcy5vZmYoKTsgLy8gcmVtb3ZlIGFsbCBldmVudHNcblxuICAgICAgICB0aGlzLl9zb3VuZE1hbmFnZXI/LmRlc3Ryb3koKTtcbiAgICAgICAgdGhpcy5fc291bmRNYW5hZ2VyID0gbnVsbDtcblxuICAgICAgICBzY3JpcHQuYXBwID0gbnVsbDtcblxuICAgICAgICBBcHBCYXNlLl9hcHBsaWNhdGlvbnNbY2FudmFzSWRdID0gbnVsbDtcblxuICAgICAgICBpZiAoZ2V0QXBwbGljYXRpb24oKSA9PT0gdGhpcykge1xuICAgICAgICAgICAgc2V0QXBwbGljYXRpb24obnVsbCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBHZXQgZW50aXR5IGZyb20gdGhlIGluZGV4IGJ5IGd1aWQuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gZ3VpZCAtIFRoZSBHVUlEIHRvIHNlYXJjaCBmb3IuXG4gICAgICogQHJldHVybnMge0VudGl0eX0gVGhlIEVudGl0eSB3aXRoIHRoZSBHVUlEIG9yIG51bGwuXG4gICAgICogQGlnbm9yZVxuICAgICAqL1xuICAgIGdldEVudGl0eUZyb21JbmRleChndWlkKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9lbnRpdHlJbmRleFtndWlkXTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0ge1NjZW5lfSBzY2VuZSAtIFRoZSBzY2VuZS5cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9yZWdpc3RlclNjZW5lSW1tZWRpYXRlKHNjZW5lKSB7XG4gICAgICAgIHRoaXMub24oJ3Bvc3RyZW5kZXInLCBzY2VuZS5pbW1lZGlhdGUub25Qb3N0UmVuZGVyLCBzY2VuZS5pbW1lZGlhdGUpO1xuICAgIH1cbn1cblxuLy8gc3RhdGljIGRhdGFcbmNvbnN0IF9mcmFtZUVuZERhdGEgPSB7fTtcblxuLyoqXG4gKiBDYWxsYmFjayB1c2VkIGJ5IHtAbGluayBBcHBCYXNlI3N0YXJ0fSBhbmQgaXRzZWxmIHRvIHJlcXVlc3RcbiAqIHRoZSByZW5kZXJpbmcgb2YgYSBuZXcgYW5pbWF0aW9uIGZyYW1lLlxuICpcbiAqIEBjYWxsYmFjayBNYWtlVGlja0NhbGxiYWNrXG4gKiBAcGFyYW0ge251bWJlcn0gW3RpbWVzdGFtcF0gLSBUaGUgdGltZXN0YW1wIHN1cHBsaWVkIGJ5IHJlcXVlc3RBbmltYXRpb25GcmFtZS5cbiAqIEBwYXJhbSB7Kn0gW2ZyYW1lXSAtIFhSRnJhbWUgZnJvbSByZXF1ZXN0QW5pbWF0aW9uRnJhbWUgY2FsbGJhY2suXG4gKiBAaWdub3JlXG4gKi9cblxuLyoqXG4gKiBDcmVhdGUgdGljayBmdW5jdGlvbiB0byBiZSB3cmFwcGVkIGluIGNsb3N1cmUuXG4gKlxuICogQHBhcmFtIHtBcHBCYXNlfSBfYXBwIC0gVGhlIGFwcGxpY2F0aW9uLlxuICogQHJldHVybnMge01ha2VUaWNrQ2FsbGJhY2t9IFRoZSB0aWNrIGZ1bmN0aW9uLlxuICogQHByaXZhdGVcbiAqL1xuY29uc3QgbWFrZVRpY2sgPSBmdW5jdGlvbiAoX2FwcCkge1xuICAgIGNvbnN0IGFwcGxpY2F0aW9uID0gX2FwcDtcbiAgICBsZXQgZnJhbWVSZXF1ZXN0O1xuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBbdGltZXN0YW1wXSAtIFRoZSB0aW1lc3RhbXAgc3VwcGxpZWQgYnkgcmVxdWVzdEFuaW1hdGlvbkZyYW1lLlxuICAgICAqIEBwYXJhbSB7Kn0gW2ZyYW1lXSAtIFhSRnJhbWUgZnJvbSByZXF1ZXN0QW5pbWF0aW9uRnJhbWUgY2FsbGJhY2suXG4gICAgICovXG4gICAgcmV0dXJuIGZ1bmN0aW9uICh0aW1lc3RhbXAsIGZyYW1lKSB7XG4gICAgICAgIGlmICghYXBwbGljYXRpb24uZ3JhcGhpY3NEZXZpY2UpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgc2V0QXBwbGljYXRpb24oYXBwbGljYXRpb24pO1xuXG4gICAgICAgIGlmIChmcmFtZVJlcXVlc3QpIHtcbiAgICAgICAgICAgIHdpbmRvdy5jYW5jZWxBbmltYXRpb25GcmFtZShmcmFtZVJlcXVlc3QpO1xuICAgICAgICAgICAgZnJhbWVSZXF1ZXN0ID0gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGhhdmUgY3VycmVudCBhcHBsaWNhdGlvbiBwb2ludGVyIGluIHBjXG4gICAgICAgIGFwcCA9IGFwcGxpY2F0aW9uO1xuXG4gICAgICAgIGNvbnN0IGN1cnJlbnRUaW1lID0gYXBwbGljYXRpb24uX3Byb2Nlc3NUaW1lc3RhbXAodGltZXN0YW1wKSB8fCBub3coKTtcbiAgICAgICAgY29uc3QgbXMgPSBjdXJyZW50VGltZSAtIChhcHBsaWNhdGlvbi5fdGltZSB8fCBjdXJyZW50VGltZSk7XG4gICAgICAgIGxldCBkdCA9IG1zIC8gMTAwMC4wO1xuICAgICAgICBkdCA9IG1hdGguY2xhbXAoZHQsIDAsIGFwcGxpY2F0aW9uLm1heERlbHRhVGltZSk7XG4gICAgICAgIGR0ICo9IGFwcGxpY2F0aW9uLnRpbWVTY2FsZTtcblxuICAgICAgICBhcHBsaWNhdGlvbi5fdGltZSA9IGN1cnJlbnRUaW1lO1xuXG4gICAgICAgIC8vIFN1Ym1pdCBhIHJlcXVlc3QgdG8gcXVldWUgdXAgYSBuZXcgYW5pbWF0aW9uIGZyYW1lIGltbWVkaWF0ZWx5XG4gICAgICAgIGlmIChhcHBsaWNhdGlvbi54cj8uc2Vzc2lvbikge1xuICAgICAgICAgICAgZnJhbWVSZXF1ZXN0ID0gYXBwbGljYXRpb24ueHIuc2Vzc2lvbi5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUoYXBwbGljYXRpb24udGljayk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBmcmFtZVJlcXVlc3QgPSBwbGF0Zm9ybS5icm93c2VyID8gd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZShhcHBsaWNhdGlvbi50aWNrKSA6IG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoYXBwbGljYXRpb24uZ3JhcGhpY3NEZXZpY2UuY29udGV4dExvc3QpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgYXBwbGljYXRpb24uX2ZpbGxGcmFtZVN0YXRzQmFzaWMoY3VycmVudFRpbWUsIGR0LCBtcyk7XG5cbiAgICAgICAgLy8gI2lmIF9QUk9GSUxFUlxuICAgICAgICBhcHBsaWNhdGlvbi5fZmlsbEZyYW1lU3RhdHMoKTtcbiAgICAgICAgLy8gI2VuZGlmXG5cbiAgICAgICAgYXBwbGljYXRpb24uX2luRnJhbWVVcGRhdGUgPSB0cnVlO1xuICAgICAgICBhcHBsaWNhdGlvbi5maXJlKFwiZnJhbWV1cGRhdGVcIiwgbXMpO1xuXG4gICAgICAgIGxldCBzaG91bGRSZW5kZXJGcmFtZSA9IHRydWU7XG5cbiAgICAgICAgaWYgKGZyYW1lKSB7XG4gICAgICAgICAgICBzaG91bGRSZW5kZXJGcmFtZSA9IGFwcGxpY2F0aW9uLnhyPy51cGRhdGUoZnJhbWUpO1xuICAgICAgICAgICAgYXBwbGljYXRpb24uZ3JhcGhpY3NEZXZpY2UuZGVmYXVsdEZyYW1lYnVmZmVyID0gZnJhbWUuc2Vzc2lvbi5yZW5kZXJTdGF0ZS5iYXNlTGF5ZXIuZnJhbWVidWZmZXI7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBhcHBsaWNhdGlvbi5ncmFwaGljc0RldmljZS5kZWZhdWx0RnJhbWVidWZmZXIgPSBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHNob3VsZFJlbmRlckZyYW1lKSB7XG5cbiAgICAgICAgICAgIERlYnVnLnRyYWNlKFRSQUNFSURfUkVOREVSX0ZSQU1FLCBgLS0tLSBGcmFtZSAke2FwcGxpY2F0aW9uLmZyYW1lfWApO1xuICAgICAgICAgICAgRGVidWcudHJhY2UoVFJBQ0VJRF9SRU5ERVJfRlJBTUVfVElNRSwgYC0tIFVwZGF0ZVN0YXJ0ICR7bm93KCkudG9GaXhlZCgyKX1tc2ApO1xuXG4gICAgICAgICAgICBhcHBsaWNhdGlvbi51cGRhdGUoZHQpO1xuXG4gICAgICAgICAgICBhcHBsaWNhdGlvbi5maXJlKFwiZnJhbWVyZW5kZXJcIik7XG5cblxuICAgICAgICAgICAgaWYgKGFwcGxpY2F0aW9uLmF1dG9SZW5kZXIgfHwgYXBwbGljYXRpb24ucmVuZGVyTmV4dEZyYW1lKSB7XG5cbiAgICAgICAgICAgICAgICBEZWJ1Zy50cmFjZShUUkFDRUlEX1JFTkRFUl9GUkFNRV9USU1FLCBgLS0gUmVuZGVyU3RhcnQgJHtub3coKS50b0ZpeGVkKDIpfW1zYCk7XG5cbiAgICAgICAgICAgICAgICBhcHBsaWNhdGlvbi51cGRhdGVDYW52YXNTaXplKCk7XG4gICAgICAgICAgICAgICAgYXBwbGljYXRpb24uZnJhbWVTdGFydCgpO1xuICAgICAgICAgICAgICAgIGFwcGxpY2F0aW9uLnJlbmRlcigpO1xuICAgICAgICAgICAgICAgIGFwcGxpY2F0aW9uLmZyYW1lRW5kKCk7XG4gICAgICAgICAgICAgICAgYXBwbGljYXRpb24ucmVuZGVyTmV4dEZyYW1lID0gZmFsc2U7XG5cbiAgICAgICAgICAgICAgICBEZWJ1Zy50cmFjZShUUkFDRUlEX1JFTkRFUl9GUkFNRV9USU1FLCBgLS0gUmVuZGVyRW5kICR7bm93KCkudG9GaXhlZCgyKX1tc2ApO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBzZXQgZXZlbnQgZGF0YVxuICAgICAgICAgICAgX2ZyYW1lRW5kRGF0YS50aW1lc3RhbXAgPSBub3coKTtcbiAgICAgICAgICAgIF9mcmFtZUVuZERhdGEudGFyZ2V0ID0gYXBwbGljYXRpb247XG5cbiAgICAgICAgICAgIGFwcGxpY2F0aW9uLmZpcmUoXCJmcmFtZWVuZFwiLCBfZnJhbWVFbmREYXRhKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGFwcGxpY2F0aW9uLl9pbkZyYW1lVXBkYXRlID0gZmFsc2U7XG5cbiAgICAgICAgaWYgKGFwcGxpY2F0aW9uLl9kZXN0cm95UmVxdWVzdGVkKSB7XG4gICAgICAgICAgICBhcHBsaWNhdGlvbi5kZXN0cm95KCk7XG4gICAgICAgIH1cbiAgICB9O1xufTtcblxuZXhwb3J0IHsgYXBwLCBBcHBCYXNlIH07XG4iXSwibmFtZXMiOlsiUHJvZ3Jlc3MiLCJjb25zdHJ1Y3RvciIsImxlbmd0aCIsImNvdW50IiwiaW5jIiwiZG9uZSIsImFwcCIsIkFwcEJhc2UiLCJFdmVudEhhbmRsZXIiLCJjYW52YXMiLCJ2ZXJzaW9uIiwiaW5kZXhPZiIsIkRlYnVnIiwibG9nIiwicmV2aXNpb24iLCJfYXBwbGljYXRpb25zIiwiaWQiLCJzZXRBcHBsaWNhdGlvbiIsIl9kZXN0cm95UmVxdWVzdGVkIiwiX2luRnJhbWVVcGRhdGUiLCJfdGltZSIsInRpbWVTY2FsZSIsIm1heERlbHRhVGltZSIsImZyYW1lIiwiYXV0b1JlbmRlciIsInJlbmRlck5leHRGcmFtZSIsInVzZUxlZ2FjeVNjcmlwdEF0dHJpYnV0ZUNsb25pbmciLCJzY3JpcHQiLCJsZWdhY3kiLCJfbGlicmFyaWVzTG9hZGVkIiwiX2ZpbGxNb2RlIiwiRklMTE1PREVfS0VFUF9BU1BFQ1QiLCJfcmVzb2x1dGlvbk1vZGUiLCJSRVNPTFVUSU9OX0ZJWEVEIiwiX2FsbG93UmVzaXplIiwiY29udGV4dCIsImluaXQiLCJhcHBPcHRpb25zIiwiZGV2aWNlIiwiZ3JhcGhpY3NEZXZpY2UiLCJhc3NlcnQiLCJHcmFwaGljc0RldmljZUFjY2VzcyIsInNldCIsIl9pbml0RGVmYXVsdE1hdGVyaWFsIiwiX2luaXRQcm9ncmFtTGlicmFyeSIsInN0YXRzIiwiQXBwbGljYXRpb25TdGF0cyIsIl9zb3VuZE1hbmFnZXIiLCJzb3VuZE1hbmFnZXIiLCJsb2FkZXIiLCJSZXNvdXJjZUxvYWRlciIsIkxpZ2h0c0J1ZmZlciIsIl9lbnRpdHlJbmRleCIsInNjZW5lIiwiU2NlbmUiLCJfcmVnaXN0ZXJTY2VuZUltbWVkaWF0ZSIsInJvb3QiLCJFbnRpdHkiLCJfZW5hYmxlZEluSGllcmFyY2h5IiwiYXNzZXRzIiwiQXNzZXRSZWdpc3RyeSIsImFzc2V0UHJlZml4IiwicHJlZml4IiwiYnVuZGxlcyIsIkJ1bmRsZVJlZ2lzdHJ5IiwiZW5hYmxlQnVuZGxlcyIsIlRleHREZWNvZGVyIiwic2NyaXB0c09yZGVyIiwic2NyaXB0cyIsIlNjcmlwdFJlZ2lzdHJ5IiwiaTE4biIsIkkxOG4iLCJzY2VuZXMiLCJTY2VuZVJlZ2lzdHJ5Iiwic2VsZiIsImRlZmF1bHRMYXllcldvcmxkIiwiTGF5ZXIiLCJuYW1lIiwiTEFZRVJJRF9XT1JMRCIsInNjZW5lR3JhYiIsIlNjZW5lR3JhYiIsImRlZmF1bHRMYXllckRlcHRoIiwibGF5ZXIiLCJkZWZhdWx0TGF5ZXJTa3lib3giLCJlbmFibGVkIiwiTEFZRVJJRF9TS1lCT1giLCJvcGFxdWVTb3J0TW9kZSIsIlNPUlRNT0RFX05PTkUiLCJkZWZhdWx0TGF5ZXJVaSIsIkxBWUVSSURfVUkiLCJ0cmFuc3BhcmVudFNvcnRNb2RlIiwiU09SVE1PREVfTUFOVUFMIiwiZGVmYXVsdExheWVySW1tZWRpYXRlIiwiTEFZRVJJRF9JTU1FRElBVEUiLCJkZWZhdWx0TGF5ZXJDb21wb3NpdGlvbiIsIkxheWVyQ29tcG9zaXRpb24iLCJwdXNoT3BhcXVlIiwicHVzaFRyYW5zcGFyZW50IiwibGF5ZXJzIiwib24iLCJvbGRDb21wIiwibmV3Q29tcCIsImxpc3QiLCJsYXllckxpc3QiLCJpIiwiTEFZRVJJRF9ERVBUSCIsInBhdGNoIiwiQXJlYUxpZ2h0THV0cyIsImNyZWF0ZVBsYWNlaG9sZGVyIiwicmVuZGVyZXIiLCJGb3J3YXJkUmVuZGVyZXIiLCJmcmFtZUdyYXBoIiwiRnJhbWVHcmFwaCIsImxpZ2h0bWFwcGVyIiwib25jZSIsIl9maXJzdEJha2UiLCJfYmF0Y2hlciIsImJhdGNoTWFuYWdlciIsIl9maXJzdEJhdGNoIiwia2V5Ym9hcmQiLCJtb3VzZSIsInRvdWNoIiwiZ2FtZXBhZHMiLCJlbGVtZW50SW5wdXQiLCJ4ciIsImF0dGFjaFNlbGVjdEV2ZW50cyIsIl9pblRvb2xzIiwiX3NreWJveEFzc2V0IiwiX3NjcmlwdFByZWZpeCIsInNjcmlwdFByZWZpeCIsImFkZEhhbmRsZXIiLCJCdW5kbGVIYW5kbGVyIiwicmVzb3VyY2VIYW5kbGVycyIsImZvckVhY2giLCJyZXNvdXJjZUhhbmRsZXIiLCJoYW5kbGVyIiwiaGFuZGxlclR5cGUiLCJzeXN0ZW1zIiwiQ29tcG9uZW50U3lzdGVtUmVnaXN0cnkiLCJjb21wb25lbnRTeXN0ZW1zIiwiY29tcG9uZW50U3lzdGVtIiwiYWRkIiwiX3Zpc2liaWxpdHlDaGFuZ2VIYW5kbGVyIiwib25WaXNpYmlsaXR5Q2hhbmdlIiwiYmluZCIsImRvY3VtZW50IiwiaGlkZGVuIiwidW5kZWZpbmVkIiwiX2hpZGRlbkF0dHIiLCJhZGRFdmVudExpc3RlbmVyIiwibW96SGlkZGVuIiwibXNIaWRkZW4iLCJ3ZWJraXRIaWRkZW4iLCJ0aWNrIiwibWFrZVRpY2siLCJnZXRBcHBsaWNhdGlvbiIsIm1hdGVyaWFsIiwiU3RhbmRhcmRNYXRlcmlhbCIsInNoYWRpbmdNb2RlbCIsIlNQRUNVTEFSX0JMSU5OIiwic2V0RGVmYXVsdE1hdGVyaWFsIiwibGlicmFyeSIsIlByb2dyYW1MaWJyYXJ5Iiwic2V0UHJvZ3JhbUxpYnJhcnkiLCJiYXRjaGVyIiwiZmlsbE1vZGUiLCJyZXNvbHV0aW9uTW9kZSIsImNvbmZpZ3VyZSIsInVybCIsImNhbGxiYWNrIiwiaHR0cCIsImdldCIsImVyciIsInJlc3BvbnNlIiwicHJvcHMiLCJhcHBsaWNhdGlvbl9wcm9wZXJ0aWVzIiwiX3BhcnNlQXBwbGljYXRpb25Qcm9wZXJ0aWVzIiwiX3BhcnNlU2NlbmVzIiwiX3BhcnNlQXNzZXRzIiwicHJlbG9hZCIsImZpcmUiLCJwcm9ncmVzcyIsIl9kb25lIiwidG90YWwiLCJvbkFzc2V0TG9hZCIsImFzc2V0Iiwib25Bc3NldEVycm9yIiwibG9hZGVkIiwibG9hZCIsIl9wcmVsb2FkU2NyaXB0cyIsInNjZW5lRGF0YSIsInByZWxvYWRpbmciLCJfZ2V0U2NyaXB0UmVmZXJlbmNlcyIsImwiLCJyZWdleCIsIm9uTG9hZCIsIlNjcmlwdFR5cGUiLCJjb25zb2xlIiwiZXJyb3IiLCJzY3JpcHRVcmwiLCJ0ZXN0IiwidG9Mb3dlckNhc2UiLCJwYXRoIiwiam9pbiIsIm1heEFzc2V0UmV0cmllcyIsImVuYWJsZVJldHJ5IiwidXNlRGV2aWNlUGl4ZWxSYXRpbyIsInVzZV9kZXZpY2VfcGl4ZWxfcmF0aW8iLCJyZXNvbHV0aW9uX21vZGUiLCJmaWxsX21vZGUiLCJfd2lkdGgiLCJ3aWR0aCIsIl9oZWlnaHQiLCJoZWlnaHQiLCJtYXhQaXhlbFJhdGlvIiwid2luZG93IiwiZGV2aWNlUGl4ZWxSYXRpbyIsInNldENhbnZhc1Jlc29sdXRpb24iLCJzZXRDYW52YXNGaWxsTW9kZSIsImxheWVyT3JkZXIiLCJjb21wb3NpdGlvbiIsImtleSIsImRhdGEiLCJwYXJzZUludCIsImxlbiIsInN1YmxheWVyIiwidHJhbnNwYXJlbnQiLCJzdWJMYXllckVuYWJsZWQiLCJiYXRjaEdyb3VwcyIsImdycCIsImFkZEdyb3VwIiwiZHluYW1pYyIsIm1heEFhYmJTaXplIiwiaTE4bkFzc2V0cyIsIl9sb2FkTGlicmFyaWVzIiwibGlicmFyaWVzIiwidXJscyIsIm9uTGlicmFyaWVzTG9hZGVkIiwic2NyaXB0c0luZGV4IiwiYnVuZGxlc0luZGV4IiwicHVzaCIsInR5cGUiLCJBc3NldCIsImZpbGUiLCJsb2FkaW5nVHlwZSIsInRhZ3MiLCJsb2NhbGUiLCJhZGRMb2NhbGl6ZWRBc3NldElkIiwicHJpb3JpdHlTY3JpcHRzIiwic2V0dGluZ3MiLCJwcmlvcml0eV9zY3JpcHRzIiwiX3NjcmlwdHMiLCJfaW5kZXgiLCJlbnRpdGllcyIsImNvbXBvbmVudHMiLCJzdGFydCIsImNhbGwiLCJfYWxyZWFkeVN0YXJ0ZWQiLCJ0aW1lc3RhbXAiLCJub3ciLCJ0YXJnZXQiLCJpbnB1dFVwZGF0ZSIsImR0IiwiY29udHJvbGxlciIsInVwZGF0ZSIsInVwZGF0ZUNsaWVudFJlY3QiLCJ1cGRhdGVTdGFydCIsInVwZGF0ZVRpbWUiLCJmcmFtZVN0YXJ0IiwiZnJhbWVFbmQiLCJyZW5kZXIiLCJyZW5kZXJTdGFydCIsInN5bmNIaWVyYXJjaHkiLCJ1cGRhdGVBbGwiLCJfc2tpcFJlbmRlckNvdW50ZXIiLCJyZW5kZXJDb21wb3NpdGlvbiIsInJlbmRlclRpbWUiLCJsYXllckNvbXBvc2l0aW9uIiwiRGVidWdHcmFwaGljcyIsImNsZWFyR3B1TWFya2VycyIsImJ1aWxkRnJhbWVHcmFwaCIsIl9maWxsRnJhbWVTdGF0c0Jhc2ljIiwibXMiLCJfdGltZVRvQ291bnRGcmFtZXMiLCJmcHMiLCJfZnBzQWNjdW0iLCJkcmF3Q2FsbHMiLCJfZHJhd0NhbGxzUGVyRnJhbWUiLCJfZmlsbEZyYW1lU3RhdHMiLCJjYW1lcmFzIiwiX2NhbWVyYXNSZW5kZXJlZCIsIm1hdGVyaWFscyIsIl9tYXRlcmlhbFN3aXRjaGVzIiwic2hhZGVycyIsIl9zaGFkZXJTd2l0Y2hlc1BlckZyYW1lIiwic2hhZG93TWFwVXBkYXRlcyIsIl9zaGFkb3dNYXBVcGRhdGVzIiwic2hhZG93TWFwVGltZSIsIl9zaGFkb3dNYXBUaW1lIiwiZGVwdGhNYXBUaW1lIiwiX2RlcHRoTWFwVGltZSIsImZvcndhcmRUaW1lIiwiX2ZvcndhcmRUaW1lIiwicHJpbXMiLCJfcHJpbXNQZXJGcmFtZSIsInRyaWFuZ2xlcyIsIlBSSU1JVElWRV9UUklBTkdMRVMiLCJNYXRoIiwibWF4IiwiUFJJTUlUSVZFX1RSSVNUUklQIiwiUFJJTUlUSVZFX1RSSUZBTiIsImN1bGxUaW1lIiwiX2N1bGxUaW1lIiwic29ydFRpbWUiLCJfc29ydFRpbWUiLCJza2luVGltZSIsIl9za2luVGltZSIsIm1vcnBoVGltZSIsIl9tb3JwaFRpbWUiLCJsaWdodENsdXN0ZXJzIiwiX2xpZ2h0Q2x1c3RlcnMiLCJsaWdodENsdXN0ZXJzVGltZSIsIl9saWdodENsdXN0ZXJzVGltZSIsIm90aGVyUHJpbWl0aXZlcyIsIl9sYXllckNvbXBvc2l0aW9uVXBkYXRlVGltZSIsImZvcndhcmQiLCJfZm9yd2FyZERyYXdDYWxscyIsImN1bGxlZCIsIl9udW1EcmF3Q2FsbHNDdWxsZWQiLCJkZXB0aCIsInNoYWRvdyIsIl9zaGFkb3dEcmF3Q2FsbHMiLCJza2lubmVkIiwiX3NraW5EcmF3Q2FsbHMiLCJpbW1lZGlhdGUiLCJpbnN0YW5jZWQiLCJyZW1vdmVkQnlJbnN0YW5jaW5nIiwibWlzYyIsIl9kZXB0aERyYXdDYWxscyIsIl9pbW1lZGlhdGVSZW5kZXJlZCIsIl9pbnN0YW5jZWREcmF3Q2FsbHMiLCJyZW5kZXJUYXJnZXRDcmVhdGlvblRpbWUiLCJwYXJ0aWNsZXMiLCJ1cGRhdGVzUGVyRnJhbWUiLCJfdXBkYXRlc1BlckZyYW1lIiwiZnJhbWVUaW1lIiwiX2ZyYW1lVGltZSIsIm1vZGUiLCJyZXNpemVDYW52YXMiLCJSRVNPTFVUSU9OX0FVVE8iLCJjbGllbnRXaWR0aCIsImNsaWVudEhlaWdodCIsImlzSGlkZGVuIiwic3VzcGVuZCIsInJlc3VtZSIsInNlc3Npb24iLCJ3aW5kb3dXaWR0aCIsImlubmVyV2lkdGgiLCJ3aW5kb3dIZWlnaHQiLCJpbm5lckhlaWdodCIsInIiLCJ3aW5SIiwiRklMTE1PREVfRklMTF9XSU5ET1ciLCJzdHlsZSIsInVwZGF0ZUNhbnZhc1NpemUiLCJfdGhpcyR4ciIsImFjdGl2ZSIsInJpZ2lkYm9keSIsIm9uTGlicmFyeUxvYWRlZCIsImFwcGx5U2NlbmVTZXR0aW5ncyIsIkFtbW8iLCJncmF2aXR5IiwicGh5c2ljcyIsImFwcGx5U2V0dGluZ3MiLCJoYXNPd25Qcm9wZXJ0eSIsInNreWJveCIsInNldFNreWJveCIsInNldEFyZWFMaWdodEx1dHMiLCJsdGNNYXQxIiwibHRjTWF0MiIsIndhcm4iLCJvblNreWJveFJlbW92ZWQiLCJvblNreWJveENoYW5nZWQiLCJyZXNvdXJjZXMiLCJvZmYiLCJza3lib3hNaXAiLCJsb2FkRmFjZXMiLCJfdGhpcyRsaWdodG1hcHBlciIsImJha2UiLCJsaWdodG1hcE1vZGUiLCJfdGhpcyRiYXRjaGVyIiwiZ2VuZXJhdGUiLCJfcHJvY2Vzc1RpbWVzdGFtcCIsImRyYXdMaW5lIiwiZW5kIiwiY29sb3IiLCJkZXB0aFRlc3QiLCJkcmF3TGluZXMiLCJwb3NpdGlvbnMiLCJjb2xvcnMiLCJkZWZhdWx0RHJhd0xheWVyIiwiZHJhd0xpbmVBcnJheXMiLCJkcmF3V2lyZVNwaGVyZSIsImNlbnRlciIsInJhZGl1cyIsIkNvbG9yIiwiV0hJVEUiLCJzZWdtZW50cyIsImRyYXdXaXJlQWxpZ25lZEJveCIsIm1pblBvaW50IiwibWF4UG9pbnQiLCJkcmF3TWVzaEluc3RhbmNlIiwibWVzaEluc3RhbmNlIiwiZHJhd01lc2giLCJtZXNoIiwibWF0cml4IiwiZHJhd1F1YWQiLCJnZXRRdWFkTWVzaCIsImRyYXdUZXh0dXJlIiwieCIsInkiLCJ0ZXh0dXJlIiwiZmlsdGVyYWJsZSIsImlzV2ViR1BVIiwiTWF0NCIsInNldFRSUyIsIlZlYzMiLCJRdWF0IiwiSURFTlRJVFkiLCJNYXRlcmlhbCIsImN1bGwiLCJDVUxMRkFDRV9OT05FIiwic2V0UGFyYW1ldGVyIiwic2hhZGVyIiwiZ2V0VGV4dHVyZVNoYWRlciIsImdldFVuZmlsdGVyYWJsZVRleHR1cmVTaGFkZXIiLCJkcmF3RGVwdGhUZXh0dXJlIiwiZ2V0RGVwdGhUZXh0dXJlU2hhZGVyIiwiZGVzdHJveSIsIl90aGlzJGxpZ2h0bWFwcGVyMiIsIl90aGlzJHhyMiIsIl90aGlzJHhyMyIsIl90aGlzJF9zb3VuZE1hbmFnZXIiLCJjYW52YXNJZCIsInJlbW92ZUV2ZW50TGlzdGVuZXIiLCJkZXRhY2giLCJ1bmxvYWQiLCJzY3JpcHRIYW5kbGVyIiwiZ2V0SGFuZGxlciIsImNsZWFyQ2FjaGUiLCJvblByZVJlbmRlck9wYXF1ZSIsIm9uUG9zdFJlbmRlck9wYXF1ZSIsIm9uRGlzYWJsZSIsIm9uRW5hYmxlIiwiZ2V0RW50aXR5RnJvbUluZGV4IiwiZ3VpZCIsIm9uUG9zdFJlbmRlciIsIl9mcmFtZUVuZERhdGEiLCJfYXBwIiwiYXBwbGljYXRpb24iLCJmcmFtZVJlcXVlc3QiLCJfYXBwbGljYXRpb24keHIiLCJjYW5jZWxBbmltYXRpb25GcmFtZSIsImN1cnJlbnRUaW1lIiwibWF0aCIsImNsYW1wIiwicmVxdWVzdEFuaW1hdGlvbkZyYW1lIiwicGxhdGZvcm0iLCJicm93c2VyIiwiY29udGV4dExvc3QiLCJzaG91bGRSZW5kZXJGcmFtZSIsIl9hcHBsaWNhdGlvbiR4cjIiLCJkZWZhdWx0RnJhbWVidWZmZXIiLCJyZW5kZXJTdGF0ZSIsImJhc2VMYXllciIsImZyYW1lYnVmZmVyIiwidHJhY2UiLCJUUkFDRUlEX1JFTkRFUl9GUkFNRSIsIlRSQUNFSURfUkVOREVSX0ZSQU1FX1RJTUUiLCJ0b0ZpeGVkIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUErREE7QUFDQSxNQUFNQSxRQUFRLENBQUM7RUFDWEMsV0FBV0EsQ0FBQ0MsTUFBTSxFQUFFO0lBQ2hCLElBQUksQ0FBQ0EsTUFBTSxHQUFHQSxNQUFNLENBQUE7SUFDcEIsSUFBSSxDQUFDQyxLQUFLLEdBQUcsQ0FBQyxDQUFBO0FBQ2xCLEdBQUE7QUFFQUMsRUFBQUEsR0FBR0EsR0FBRztJQUNGLElBQUksQ0FBQ0QsS0FBSyxFQUFFLENBQUE7QUFDaEIsR0FBQTtBQUVBRSxFQUFBQSxJQUFJQSxHQUFHO0FBQ0gsSUFBQSxPQUFRLElBQUksQ0FBQ0YsS0FBSyxLQUFLLElBQUksQ0FBQ0QsTUFBTSxDQUFBO0FBQ3RDLEdBQUE7QUFDSixDQUFBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNB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
