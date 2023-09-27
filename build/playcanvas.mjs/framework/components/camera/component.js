import { Debug } from '../../../core/debug.js';
import { LAYERID_UI, LAYERID_DEPTH, ASPECT_AUTO } from '../../../scene/constants.js';
import { Camera } from '../../../scene/camera.js';
import { ShaderPass } from '../../../scene/shader-pass.js';
import { Component } from '../component.js';
import { PostEffectQueue } from './post-effect-queue.js';

/**
 * Callback used by {@link CameraComponent#calculateTransform} and {@link CameraComponent#calculateProjection}.
 *
 * @callback CalculateMatrixCallback
 * @param {import('../../../core/math/mat4.js').Mat4} transformMatrix - Output of the function.
 * @param {number} view - Type of view. Can be {@link VIEW_CENTER}, {@link VIEW_LEFT} or {@link VIEW_RIGHT}. Left and right are only used in stereo rendering.
 */

/**
 * The Camera Component enables an Entity to render the scene. A scene requires at least one
 * enabled camera component to be rendered. Note that multiple camera components can be enabled
 * simultaneously (for split-screen or offscreen rendering, for example).
 *
 * ```javascript
 * // Add a pc.CameraComponent to an entity
 * const entity = new pc.Entity();
 * entity.addComponent('camera', {
 *     nearClip: 1,
 *     farClip: 100,
 *     fov: 55
 * });
 *
 * // Get the pc.CameraComponent on an entity
 * const cameraComponent = entity.camera;
 *
 * // Update a property on a camera component
 * entity.camera.nearClip = 2;
 * ```
 *
 * @augments Component
 * @category Graphics
 */
class CameraComponent extends Component {
  /**
   * Create a new CameraComponent instance.
   *
   * @param {import('./system.js').CameraComponentSystem} system - The ComponentSystem that
   * created this Component.
   * @param {import('../../entity.js').Entity} entity - The Entity that this Component is
   * attached to.
   */
  constructor(system, entity) {
    super(system, entity);
    /**
     * Custom function that is called when postprocessing should execute.
     *
     * @type {Function}
     * @ignore
     */
    this.onPostprocessing = null;
    /**
     * Custom function that is called before the camera renders the scene.
     *
     * @type {Function}
     */
    this.onPreRender = null;
    /**
     * Custom function that is called after the camera renders the scene.
     *
     * @type {Function}
     */
    this.onPostRender = null;
    /**
     * A counter of requests of depth map rendering.
     *
     * @type {number}
     * @private
     */
    this._renderSceneDepthMap = 0;
    /**
     * A counter of requests of color map rendering.
     *
     * @type {number}
     * @private
     */
    this._renderSceneColorMap = 0;
    /** @private */
    this._sceneDepthMapRequested = false;
    /** @private */
    this._sceneColorMapRequested = false;
    /** @private */
    this._priority = 0;
    /**
     * Layer id at which the postprocessing stops for the camera.
     *
     * @type {number}
     * @private
     */
    this._disablePostEffectsLayer = LAYERID_UI;
    /** @private */
    this._camera = new Camera();
    this._camera.node = entity;

    // postprocessing management
    this._postEffects = new PostEffectQueue(system.app, this);
  }

  /**
   * Sets the name of the shader pass the camera will use when rendering.
   *
   * In addition to existing names (see the parameter description), a new name can be specified,
   * which creates a new shader pass with the given name. The name provided can only use
   * alphanumeric characters and underscores. When a shader is compiled for the new pass, a define
   * is added to the shader. For example, if the name is 'custom_rendering', the define
   * 'CUSTOM_RENDERING_PASS' is added to the shader, allowing the shader code to conditionally
   * execute code only when that shader pass is active.
   *
   * Another instance where this approach may prove useful is when a camera needs to render a more
   * cost-effective version of shaders, such as when creating a reflection texture. To accomplish
   * this, a callback on the material that triggers during shader compilation can be used. This
   * callback can modify the shader generation options specifically for this shader pass.
   *
   * ```javascript
   * const shaderPassId = camera.setShaderPass('custom_rendering');
   *
   * material.onUpdateShader = function (options) {
   *     if (options.pass === shaderPassId) {
   *         options.litOptions.normalMapEnabled = false;
   *         options.litOptions.useSpecular = false;
   *     }
   *     return options;
   * };
   * ```
   *
   * @param {string} name - The name of the shader pass. Defaults to undefined, which is
   * equivalent to {@link SHADERPASS_FORWARD}. Can be:
   *
   * - {@link SHADERPASS_FORWARD}
   * - {@link SHADERPASS_ALBEDO}
   * - {@link SHADERPASS_OPACITY}
   * - {@link SHADERPASS_WORLDNORMAL}
   * - {@link SHADERPASS_SPECULARITY}
   * - {@link SHADERPASS_GLOSS}
   * - {@link SHADERPASS_METALNESS}
   * - {@link SHADERPASS_AO}
   * - {@link SHADERPASS_EMISSION}
   * - {@link SHADERPASS_LIGHTING}
   * - {@link SHADERPASS_UV0}
   *
   * @returns {number} The id of the shader pass.
   */
  setShaderPass(name) {
    const shaderPass = ShaderPass.get(this.system.app.graphicsDevice);
    const shaderPassInfo = name ? shaderPass.allocate(name, {
      isForward: true
    }) : null;
    this._camera.shaderPassInfo = shaderPassInfo;
    return shaderPassInfo.index;
  }

  /**
   * Shader pass name.
   *
   * @returns {string} The name of the shader pass, or undefined if no shader pass is set.
   */
  getShaderPass() {
    var _this$_camera$shaderP;
    return (_this$_camera$shaderP = this._camera.shaderPassInfo) == null ? void 0 : _this$_camera$shaderP.name;
  }

  /**
   * Set camera aperture in f-stops, the default value is 16.0. Higher value means less exposure.
   *
   * @type {number}
   */
  set aperture(value) {
    this._camera.aperture = value;
  }
  get aperture() {
    return this._camera.aperture;
  }

  /**
   * The aspect ratio (width divided by height) of the camera. If aspectRatioMode is
   * {@link ASPECT_AUTO}, then this value will be automatically calculated every frame, and you
   * can only read it. If it's ASPECT_MANUAL, you can set the value.
   *
   * @type {number}
   */
  set aspectRatio(value) {
    this._camera.aspectRatio = value;
  }
  get aspectRatio() {
    return this._camera.aspectRatio;
  }

  /**
   * The aspect ratio mode of the camera. Can be:
   *
   * - {@link ASPECT_AUTO}: aspect ratio will be calculated from the current render
   * target's width divided by height.
   * - {@link ASPECT_MANUAL}: use the aspectRatio value.
   *
   * Defaults to {@link ASPECT_AUTO}.
   *
   * @type {number}
   */
  set aspectRatioMode(value) {
    this._camera.aspectRatioMode = value;
  }
  get aspectRatioMode() {
    return this._camera.aspectRatioMode;
  }

  /**
   * Custom function you can provide to calculate the camera projection matrix manually. Can be
   * used for complex effects like doing oblique projection. Function is called using component's
   * scope. Arguments:
   *
   * - {@link Mat4} transformMatrix: output of the function
   * - view: Type of view. Can be {@link VIEW_CENTER}, {@link VIEW_LEFT} or {@link VIEW_RIGHT}.
   *
   * Left and right are only used in stereo rendering.
   *
   * @type {CalculateMatrixCallback}
   */
  set calculateProjection(value) {
    this._camera.calculateProjection = value;
  }
  get calculateProjection() {
    return this._camera.calculateProjection;
  }

  /**
   * Custom function you can provide to calculate the camera transformation matrix manually. Can
   * be used for complex effects like reflections. Function is called using component's scope.
   * Arguments:
   *
   * - {@link Mat4} transformMatrix: output of the function.
   * - view: Type of view. Can be {@link VIEW_CENTER}, {@link VIEW_LEFT} or {@link VIEW_RIGHT}.
   *
   * Left and right are only used in stereo rendering.
   *
   * @type {CalculateMatrixCallback}
   */
  set calculateTransform(value) {
    this._camera.calculateTransform = value;
  }
  get calculateTransform() {
    return this._camera.calculateTransform;
  }

  /**
   * Queries the camera component's underlying Camera instance.
   *
   * @type {Camera}
   * @ignore
   */
  get camera() {
    return this._camera;
  }

  /**
   * The color used to clear the canvas to before the camera starts to render. Defaults to
   * [0.75, 0.75, 0.75, 1].
   *
   * @type {import('../../../core/math/color.js').Color}
   */
  set clearColor(value) {
    this._camera.clearColor = value;
  }
  get clearColor() {
    return this._camera.clearColor;
  }

  /**
   * If true the camera will clear the color buffer to the color set in clearColor. Defaults to true.
   *
   * @type {boolean}
   */
  set clearColorBuffer(value) {
    this._camera.clearColorBuffer = value;
    this.dirtyLayerCompositionCameras();
  }
  get clearColorBuffer() {
    return this._camera.clearColorBuffer;
  }

  /**
   * If true the camera will clear the depth buffer. Defaults to true.
   *
   * @type {boolean}
   */
  set clearDepthBuffer(value) {
    this._camera.clearDepthBuffer = value;
    this.dirtyLayerCompositionCameras();
  }
  get clearDepthBuffer() {
    return this._camera.clearDepthBuffer;
  }

  /**
   * If true the camera will clear the stencil buffer. Defaults to true.
   *
   * @type {boolean}
   */
  set clearStencilBuffer(value) {
    this._camera.clearStencilBuffer = value;
    this.dirtyLayerCompositionCameras();
  }
  get clearStencilBuffer() {
    return this._camera.clearStencilBuffer;
  }

  /**
   * If true the camera will take material.cull into account. Otherwise both front and back faces
   * will be rendered. Defaults to true.
   *
   * @type {boolean}
   */
  set cullFaces(value) {
    this._camera.cullFaces = value;
  }
  get cullFaces() {
    return this._camera.cullFaces;
  }

  /**
   * Layer ID of a layer on which the postprocessing of the camera stops being applied to.
   * Defaults to LAYERID_UI, which causes post processing to not be applied to UI layer and any
   * following layers for the camera. Set to undefined for post-processing to be applied to all
   * layers of the camera.
   *
   * @type {number}
   */
  set disablePostEffectsLayer(layer) {
    this._disablePostEffectsLayer = layer;
    this.dirtyLayerCompositionCameras();
  }
  get disablePostEffectsLayer() {
    return this._disablePostEffectsLayer;
  }

  /**
   * The distance from the camera after which no rendering will take place. Defaults to 1000.
   *
   * @type {number}
   */
  set farClip(value) {
    this._camera.farClip = value;
  }
  get farClip() {
    return this._camera.farClip;
  }

  /**
   * If true the camera will invert front and back faces. Can be useful for reflection rendering.
   * Defaults to false.
   *
   * @type {boolean}
   */
  set flipFaces(value) {
    this._camera.flipFaces = value;
  }
  get flipFaces() {
    return this._camera.flipFaces;
  }

  /**
   * The field of view of the camera in degrees. Usually this is the Y-axis field of view, see
   * {@link CameraComponent#horizontalFov}. Used for {@link PROJECTION_PERSPECTIVE} cameras only.
   * Defaults to 45.
   *
   * @type {number}
   */
  set fov(value) {
    this._camera.fov = value;
  }
  get fov() {
    return this._camera.fov;
  }

  /**
   * Queries the camera's frustum shape.
   *
   * @type {import('../../../core/shape/frustum.js').Frustum}
   */
  get frustum() {
    return this._camera.frustum;
  }

  /**
   * Controls the culling of mesh instances against the camera frustum, i.e. if objects outside
   * of camera should be omitted from rendering. If false, all mesh instances in the scene are
   * rendered by the camera, regardless of visibility. Defaults to false.
   *
   * @type {boolean}
   */
  set frustumCulling(value) {
    this._camera.frustumCulling = value;
  }
  get frustumCulling() {
    return this._camera.frustumCulling;
  }

  /**
   * Set which axis to use for the Field of View calculation. Defaults to false.
   *
   * @type {boolean}
   */
  set horizontalFov(value) {
    this._camera.horizontalFov = value;
  }
  get horizontalFov() {
    return this._camera.horizontalFov;
  }

  /**
   * An array of layer IDs ({@link Layer#id}) to which this camera should belong. Don't push,
   * pop, splice or modify this array, if you want to change it, set a new one instead. Defaults
   * to [LAYERID_WORLD, LAYERID_DEPTH, LAYERID_SKYBOX, LAYERID_UI, LAYERID_IMMEDIATE].
   *
   * @type {number[]}
   */
  set layers(newValue) {
    const layers = this._camera.layers;
    for (let i = 0; i < layers.length; i++) {
      const layer = this.system.app.scene.layers.getLayerById(layers[i]);
      if (!layer) continue;
      layer.removeCamera(this);
    }
    this._camera.layers = newValue;
    if (!this.enabled || !this.entity.enabled) return;
    for (let i = 0; i < newValue.length; i++) {
      const layer = this.system.app.scene.layers.getLayerById(newValue[i]);
      if (!layer) continue;
      layer.addCamera(this);
    }
  }
  get layers() {
    return this._camera.layers;
  }
  get layersSet() {
    return this._camera.layersSet;
  }

  /**
   * The distance from the camera before which no rendering will take place. Defaults to 0.1.
   *
   * @type {number}
   */
  set nearClip(value) {
    this._camera.nearClip = value;
  }
  get nearClip() {
    return this._camera.nearClip;
  }

  /**
   * The half-height of the orthographic view window (in the Y-axis). Used for
   * {@link PROJECTION_ORTHOGRAPHIC} cameras only. Defaults to 10.
   *
   * @type {number}
   */
  set orthoHeight(value) {
    this._camera.orthoHeight = value;
  }
  get orthoHeight() {
    return this._camera.orthoHeight;
  }
  get postEffects() {
    return this._postEffects;
  }

  /**
   * The post effects queue for this camera. Use this to add or remove post effects from the camera.
   *
   * @type {PostEffectQueue}
   */
  get postEffectsEnabled() {
    return this._postEffects.enabled;
  }

  /**
   * Controls the order in which cameras are rendered. Cameras with smaller values for priority
   * are rendered first. Defaults to 0.
   *
   * @type {number}
   */
  set priority(newValue) {
    this._priority = newValue;
    this.dirtyLayerCompositionCameras();
  }
  get priority() {
    return this._priority;
  }

  /**
   * The type of projection used to render the camera. Can be:
   *
   * - {@link PROJECTION_PERSPECTIVE}: A perspective projection. The camera frustum
   * resembles a truncated pyramid.
   * - {@link PROJECTION_ORTHOGRAPHIC}: An orthographic projection. The camera
   * frustum is a cuboid.
   *
   * Defaults to {@link PROJECTION_PERSPECTIVE}.
   *
   * @type {number}
   */
  set projection(value) {
    this._camera.projection = value;
  }
  get projection() {
    return this._camera.projection;
  }

  /**
   * Queries the camera's projection matrix.
   *
   * @type {import('../../../core/math/mat4.js').Mat4}
   */
  get projectionMatrix() {
    return this._camera.projectionMatrix;
  }

  /**
   * Controls where on the screen the camera will be rendered in normalized screen coordinates.
   * Defaults to [0, 0, 1, 1].
   *
   * @type {import('../../../core/math/vec4.js').Vec4}
   */
  set rect(value) {
    this._camera.rect = value;
    this.fire('set:rect', this._camera.rect);
  }
  get rect() {
    return this._camera.rect;
  }
  set renderSceneColorMap(value) {
    if (value && !this._sceneColorMapRequested) {
      this.requestSceneColorMap(true);
      this._sceneColorMapRequested = true;
    } else if (this._sceneColorMapRequested) {
      this.requestSceneColorMap(false);
      this._sceneColorMapRequested = false;
    }
  }
  get renderSceneColorMap() {
    return this._renderSceneColorMap > 0;
  }
  set renderSceneDepthMap(value) {
    if (value && !this._sceneDepthMapRequested) {
      this.requestSceneDepthMap(true);
      this._sceneDepthMapRequested = true;
    } else if (this._sceneDepthMapRequested) {
      this.requestSceneDepthMap(false);
      this._sceneDepthMapRequested = false;
    }
  }
  get renderSceneDepthMap() {
    return this._renderSceneDepthMap > 0;
  }

  /**
   * Render target to which rendering of the cameras is performed. If not set, it will render
   * simply to the screen.
   *
   * @type {import('../../../platform/graphics/render-target.js').RenderTarget}
   */
  set renderTarget(value) {
    this._camera.renderTarget = value;
    this.dirtyLayerCompositionCameras();
  }
  get renderTarget() {
    return this._camera.renderTarget;
  }

  /**
   * Clips all pixels which are not in the rectangle. The order of the values is
   * [x, y, width, height]. Defaults to [0, 0, 1, 1].
   *
   * @type {import('../../../core/math/vec4.js').Vec4}
   */
  set scissorRect(value) {
    this._camera.scissorRect = value;
  }
  get scissorRect() {
    return this._camera.scissorRect;
  }

  /**
   * Set camera sensitivity in ISO, the default value is 1000. Higher value means more exposure.
   *
   * @type {number}
   */
  set sensitivity(value) {
    this._camera.sensitivity = value;
  }
  get sensitivity() {
    return this._camera.sensitivity;
  }

  /**
   * Set camera shutter speed in seconds, the default value is 1/1000s. Longer shutter means more exposure.
   *
   * @type {number}
   */
  set shutter(value) {
    this._camera.shutter = value;
  }
  get shutter() {
    return this._camera.shutter;
  }

  /**
   * Queries the camera's view matrix.
   *
   * @type {import('../../../core/math/mat4.js').Mat4}
   */
  get viewMatrix() {
    return this._camera.viewMatrix;
  }

  /**
   * Based on the value, the depth layer's enable counter is incremented or decremented.
   *
   * @param {boolean} value - True to increment the counter, false to decrement it.
   * @returns {boolean} True if the counter was incremented or decremented, false if the depth
   * layer is not present.
   * @private
   */
  _enableDepthLayer(value) {
    const hasDepthLayer = this.layers.find(layerId => layerId === LAYERID_DEPTH);
    if (hasDepthLayer) {
      /** @type {import('../../../scene/layer.js').Layer} */
      const depthLayer = this.system.app.scene.layers.getLayerById(LAYERID_DEPTH);
      if (value) {
        depthLayer == null ? void 0 : depthLayer.incrementCounter();
      } else {
        depthLayer == null ? void 0 : depthLayer.decrementCounter();
      }
    } else if (value) {
      return false;
    }
    return true;
  }

  /**
   * Request the scene to generate a texture containing the scene color map. Note that this call
   * is accumulative, and for each enable request, a disable request need to be called.
   *
   * @param {boolean} enabled - True to request the generation, false to disable it.
   */
  requestSceneColorMap(enabled) {
    this._renderSceneColorMap += enabled ? 1 : -1;
    Debug.assert(this._renderSceneColorMap >= 0);
    const ok = this._enableDepthLayer(enabled);
    if (!ok) {
      Debug.warnOnce('CameraComponent.requestSceneColorMap was called, but the camera does not have a Depth layer, ignoring.');
    }
  }

  /**
   * Request the scene to generate a texture containing the scene depth map. Note that this call
   * is accumulative, and for each enable request, a disable request need to be called.
   *
   * @param {boolean} enabled - True to request the generation, false to disable it.
   */
  requestSceneDepthMap(enabled) {
    this._renderSceneDepthMap += enabled ? 1 : -1;
    Debug.assert(this._renderSceneDepthMap >= 0);
    const ok = this._enableDepthLayer(enabled);
    if (!ok) {
      Debug.warnOnce('CameraComponent.requestSceneDepthMap was called, but the camera does not have a Depth layer, ignoring.');
    }
  }
  dirtyLayerCompositionCameras() {
    // layer composition needs to update order
    const layerComp = this.system.app.scene.layers;
    layerComp._dirtyCameras = true;
  }

  /**
   * Convert a point from 2D screen space to 3D world space.
   *
   * @param {number} screenx - X coordinate on PlayCanvas' canvas element. Should be in the range
   * 0 to `canvas.offsetWidth` of the application's canvas element.
   * @param {number} screeny - Y coordinate on PlayCanvas' canvas element. Should be in the range
   * 0 to `canvas.offsetHeight` of the application's canvas element.
   * @param {number} cameraz - The distance from the camera in world space to create the new
   * point.
   * @param {import('../../../core/math/vec3.js').Vec3} [worldCoord] - 3D vector to receive world
   * coordinate result.
   * @example
   * // Get the start and end points of a 3D ray fired from a screen click position
   * const start = entity.camera.screenToWorld(clickX, clickY, entity.camera.nearClip);
   * const end = entity.camera.screenToWorld(clickX, clickY, entity.camera.farClip);
   *
   * // Use the ray coordinates to perform a raycast
   * app.systems.rigidbody.raycastFirst(start, end, function (result) {
   *     console.log("Entity " + result.entity.name + " was selected");
   * });
   * @returns {import('../../../core/math/vec3.js').Vec3} The world space coordinate.
   */
  screenToWorld(screenx, screeny, cameraz, worldCoord) {
    const device = this.system.app.graphicsDevice;
    const w = device.clientRect.width;
    const h = device.clientRect.height;
    return this._camera.screenToWorld(screenx, screeny, cameraz, w, h, worldCoord);
  }

  /**
   * Convert a point from 3D world space to 2D screen space.
   *
   * @param {import('../../../core/math/vec3.js').Vec3} worldCoord - The world space coordinate.
   * @param {import('../../../core/math/vec3.js').Vec3} [screenCoord] - 3D vector to receive
   * screen coordinate result.
   * @returns {import('../../../core/math/vec3.js').Vec3} The screen space coordinate.
   */
  worldToScreen(worldCoord, screenCoord) {
    const device = this.system.app.graphicsDevice;
    const w = device.clientRect.width;
    const h = device.clientRect.height;
    return this._camera.worldToScreen(worldCoord, w, h, screenCoord);
  }

  /**
   * Called before application renders the scene.
   *
   * @ignore
   */
  onAppPrerender() {
    this._camera._viewMatDirty = true;
    this._camera._viewProjMatDirty = true;
  }

  /** @private */
  addCameraToLayers() {
    const layers = this.layers;
    for (let i = 0; i < layers.length; i++) {
      const layer = this.system.app.scene.layers.getLayerById(layers[i]);
      if (layer) {
        layer.addCamera(this);
      }
    }
  }

  /** @private */
  removeCameraFromLayers() {
    const layers = this.layers;
    for (let i = 0; i < layers.length; i++) {
      const layer = this.system.app.scene.layers.getLayerById(layers[i]);
      if (layer) {
        layer.removeCamera(this);
      }
    }
  }

  /**
   * @param {import('../../../scene/composition/layer-composition.js').LayerComposition} oldComp - Old layer composition.
   * @param {import('../../../scene/composition/layer-composition.js').LayerComposition} newComp - New layer composition.
   * @private
   */
  onLayersChanged(oldComp, newComp) {
    this.addCameraToLayers();
    oldComp.off('add', this.onLayerAdded, this);
    oldComp.off('remove', this.onLayerRemoved, this);
    newComp.on('add', this.onLayerAdded, this);
    newComp.on('remove', this.onLayerRemoved, this);
  }

  /**
   * @param {import('../../../scene/layer.js').Layer} layer - The layer to add the camera to.
   * @private
   */
  onLayerAdded(layer) {
    const index = this.layers.indexOf(layer.id);
    if (index < 0) return;
    layer.addCamera(this);
  }

  /**
   * @param {import('../../../scene/layer.js').Layer} layer - The layer to remove the camera from.
   * @private
   */
  onLayerRemoved(layer) {
    const index = this.layers.indexOf(layer.id);
    if (index < 0) return;
    layer.removeCamera(this);
  }
  onEnable() {
    const system = this.system;
    const scene = system.app.scene;
    const layers = scene.layers;
    system.addCamera(this);
    scene.on('set:layers', this.onLayersChanged, this);
    if (layers) {
      layers.on('add', this.onLayerAdded, this);
      layers.on('remove', this.onLayerRemoved, this);
    }
    if (this.enabled && this.entity.enabled) {
      this.addCameraToLayers();
    }
    this.postEffects.enable();
  }
  onDisable() {
    const system = this.system;
    const scene = system.app.scene;
    const layers = scene.layers;
    this.postEffects.disable();
    this.removeCameraFromLayers();
    scene.off('set:layers', this.onLayersChanged, this);
    if (layers) {
      layers.off('add', this.onLayerAdded, this);
      layers.off('remove', this.onLayerRemoved, this);
    }
    system.removeCamera(this);
  }
  onRemove() {
    this.onDisable();
    this.off();
  }

  /**
   * Calculates aspect ratio value for a given render target.
   *
   * @param {import('../../../platform/graphics/render-target.js').RenderTarget} [rt] - Optional
   * render target. If unspecified, the backbuffer is used.
   * @returns {number} The aspect ratio of the render target (or backbuffer).
   */
  calculateAspectRatio(rt) {
    const device = this.system.app.graphicsDevice;
    const width = rt ? rt.width : device.width;
    const height = rt ? rt.height : device.height;
    return width * this.rect.z / (height * this.rect.w);
  }

  /**
   * Prepare the camera for frame rendering.
   *
   * @param {import('../../../platform/graphics/render-target.js').RenderTarget} rt - Render
   * target to which rendering will be performed. Will affect camera's aspect ratio, if
   * aspectRatioMode is {@link ASPECT_AUTO}.
   * @ignore
   */
  frameUpdate(rt) {
    if (this.aspectRatioMode === ASPECT_AUTO) {
      this.aspectRatio = this.calculateAspectRatio(rt);
    }
  }

  /**
   * Attempt to start XR session with this camera.
   *
   * @param {string} type - The type of session. Can be one of the following:
   *
   * - {@link XRTYPE_INLINE}: Inline - always available type of session. It has limited feature
   * availability and is rendered into HTML element.
   * - {@link XRTYPE_VR}: Immersive VR - session that provides exclusive access to the VR device
   * with the best available tracking features.
   * - {@link XRTYPE_AR}: Immersive AR - session that provides exclusive access to the VR/AR
   * device that is intended to be blended with the real-world environment.
   *
   * @param {string} spaceType - Reference space type. Can be one of the following:
   *
   * - {@link XRSPACE_VIEWER}: Viewer - always supported space with some basic tracking
   * capabilities.
   * - {@link XRSPACE_LOCAL}: Local - represents a tracking space with a native origin near the
   * viewer at the time of creation. It is meant for seated or basic local XR sessions.
   * - {@link XRSPACE_LOCALFLOOR}: Local Floor - represents a tracking space with a native origin
   * at the floor in a safe position for the user to stand. The y-axis equals 0 at floor level.
   * Floor level value might be estimated by the underlying platform. It is meant for seated or
   * basic local XR sessions.
   * - {@link XRSPACE_BOUNDEDFLOOR}: Bounded Floor - represents a tracking space with its native
   * origin at the floor, where the user is expected to move within a pre-established boundary.
   * - {@link XRSPACE_UNBOUNDED}: Unbounded - represents a tracking space where the user is
   * expected to move freely around their environment, potentially long distances from their
   * starting point.
   *
   * @param {object} [options] - Object with options for XR session initialization.
   * @param {string[]} [options.optionalFeatures] - Optional features for XRSession start. It is
   * used for getting access to additional WebXR spec extensions.
   * @param {boolean} [options.imageTracking] - Set to true to attempt to enable {@link XrImageTracking}.
   * @param {boolean} [options.planeDetection] - Set to true to attempt to enable {@link XrPlaneDetection}.
   * @param {import('../../xr/xr-manager.js').XrErrorCallback} [options.callback] - Optional
   * callback function called once the session is started. The callback has one argument Error -
   * it is null if the XR session started successfully.
   * @param {boolean} [options.anchors] - Optional boolean to attempt to enable {@link XrAnchors}.
   * @param {object} [options.depthSensing] - Optional object with depth sensing parameters to
   * attempt to enable {@link XrDepthSensing}.
   * @param {string} [options.depthSensing.usagePreference] - Optional usage preference for depth
   * sensing, can be 'cpu-optimized' or 'gpu-optimized' (XRDEPTHSENSINGUSAGE_*), defaults to
   * 'cpu-optimized'. Most preferred and supported will be chosen by the underlying depth sensing
   * system.
   * @param {string} [options.depthSensing.dataFormatPreference] - Optional data format
   * preference for depth sensing. Can be 'luminance-alpha' or 'float32' (XRDEPTHSENSINGFORMAT_*),
   * defaults to 'luminance-alpha'. Most preferred and supported will be chosen by the underlying
   * depth sensing system.
   * @example
   * // On an entity with a camera component
   * this.entity.camera.startXr(pc.XRTYPE_VR, pc.XRSPACE_LOCAL, {
   *     callback: function (err) {
   *         if (err) {
   *             // failed to start XR session
   *         } else {
   *             // in XR
   *         }
   *     }
   * });
   */
  startXr(type, spaceType, options) {
    this.system.app.xr.start(this, type, spaceType, options);
  }

  /**
   * Attempt to end XR session of this camera.
   *
   * @param {import('../../xr/xr-manager.js').XrErrorCallback} [callback] - Optional callback
   * function called once session is ended. The callback has one argument Error - it is null if
   * successfully ended XR session.
   * @example
   * // On an entity with a camera component
   * this.entity.camera.endXr(function (err) {
   *     // not anymore in XR
   * });
   */
  endXr(callback) {
    if (!this._camera.xr) {
      if (callback) callback(new Error('Camera is not in XR'));
      return;
    }
    this._camera.xr.end(callback);
  }

  /**
   * Function to copy properties from the source CameraComponent.
   * Properties not copied: postEffects.
   * Inherited properties not copied (all): system, entity, enabled.
   *
   * @param {CameraComponent} source - The source component.
   * @ignore
   */
  copy(source) {
    this.aperture = source.aperture;
    this.aspectRatio = source.aspectRatio;
    this.aspectRatioMode = source.aspectRatioMode;
    this.calculateProjection = source.calculateProjection;
    this.calculateTransform = source.calculateTransform;
    this.clearColor = source.clearColor;
    this.clearColorBuffer = source.clearColorBuffer;
    this.clearDepthBuffer = source.clearDepthBuffer;
    this.clearStencilBuffer = source.clearStencilBuffer;
    this.cullFaces = source.cullFaces;
    this.disablePostEffectsLayer = source.disablePostEffectsLayer;
    this.farClip = source.farClip;
    this.flipFaces = source.flipFaces;
    this.fov = source.fov;
    this.frustumCulling = source.frustumCulling;
    this.horizontalFov = source.horizontalFov;
    this.layers = source.layers;
    this.nearClip = source.nearClip;
    this.orthoHeight = source.orthoHeight;
    this.priority = source.priority;
    this.projection = source.projection;
    this.rect = source.rect;
    this.renderTarget = source.renderTarget;
    this.scissorRect = source.scissorRect;
    this.sensitivity = source.sensitivity;
    this.shutter = source.shutter;
  }
}

export { CameraComponent };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tcG9uZW50LmpzIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi9zcmMvZnJhbWV3b3JrL2NvbXBvbmVudHMvY2FtZXJhL2NvbXBvbmVudC5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBEZWJ1ZyB9IGZyb20gJy4uLy4uLy4uL2NvcmUvZGVidWcuanMnO1xuXG5pbXBvcnQgeyBBU1BFQ1RfQVVUTywgTEFZRVJJRF9VSSwgTEFZRVJJRF9ERVBUSCB9IGZyb20gJy4uLy4uLy4uL3NjZW5lL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBDYW1lcmEgfSBmcm9tICcuLi8uLi8uLi9zY2VuZS9jYW1lcmEuanMnO1xuaW1wb3J0IHsgU2hhZGVyUGFzcyB9IGZyb20gJy4uLy4uLy4uL3NjZW5lL3NoYWRlci1wYXNzLmpzJztcblxuaW1wb3J0IHsgQ29tcG9uZW50IH0gZnJvbSAnLi4vY29tcG9uZW50LmpzJztcblxuaW1wb3J0IHsgUG9zdEVmZmVjdFF1ZXVlIH0gZnJvbSAnLi9wb3N0LWVmZmVjdC1xdWV1ZS5qcyc7XG5cbi8qKlxuICogQ2FsbGJhY2sgdXNlZCBieSB7QGxpbmsgQ2FtZXJhQ29tcG9uZW50I2NhbGN1bGF0ZVRyYW5zZm9ybX0gYW5kIHtAbGluayBDYW1lcmFDb21wb25lbnQjY2FsY3VsYXRlUHJvamVjdGlvbn0uXG4gKlxuICogQGNhbGxiYWNrIENhbGN1bGF0ZU1hdHJpeENhbGxiYWNrXG4gKiBAcGFyYW0ge2ltcG9ydCgnLi4vLi4vLi4vY29yZS9tYXRoL21hdDQuanMnKS5NYXQ0fSB0cmFuc2Zvcm1NYXRyaXggLSBPdXRwdXQgb2YgdGhlIGZ1bmN0aW9uLlxuICogQHBhcmFtIHtudW1iZXJ9IHZpZXcgLSBUeXBlIG9mIHZpZXcuIENhbiBiZSB7QGxpbmsgVklFV19DRU5URVJ9LCB7QGxpbmsgVklFV19MRUZUfSBvciB7QGxpbmsgVklFV19SSUdIVH0uIExlZnQgYW5kIHJpZ2h0IGFyZSBvbmx5IHVzZWQgaW4gc3RlcmVvIHJlbmRlcmluZy5cbiAqL1xuXG4vKipcbiAqIFRoZSBDYW1lcmEgQ29tcG9uZW50IGVuYWJsZXMgYW4gRW50aXR5IHRvIHJlbmRlciB0aGUgc2NlbmUuIEEgc2NlbmUgcmVxdWlyZXMgYXQgbGVhc3Qgb25lXG4gKiBlbmFibGVkIGNhbWVyYSBjb21wb25lbnQgdG8gYmUgcmVuZGVyZWQuIE5vdGUgdGhhdCBtdWx0aXBsZSBjYW1lcmEgY29tcG9uZW50cyBjYW4gYmUgZW5hYmxlZFxuICogc2ltdWx0YW5lb3VzbHkgKGZvciBzcGxpdC1zY3JlZW4gb3Igb2Zmc2NyZWVuIHJlbmRlcmluZywgZm9yIGV4YW1wbGUpLlxuICpcbiAqIGBgYGphdmFzY3JpcHRcbiAqIC8vIEFkZCBhIHBjLkNhbWVyYUNvbXBvbmVudCB0byBhbiBlbnRpdHlcbiAqIGNvbnN0IGVudGl0eSA9IG5ldyBwYy5FbnRpdHkoKTtcbiAqIGVudGl0eS5hZGRDb21wb25lbnQoJ2NhbWVyYScsIHtcbiAqICAgICBuZWFyQ2xpcDogMSxcbiAqICAgICBmYXJDbGlwOiAxMDAsXG4gKiAgICAgZm92OiA1NVxuICogfSk7XG4gKlxuICogLy8gR2V0IHRoZSBwYy5DYW1lcmFDb21wb25lbnQgb24gYW4gZW50aXR5XG4gKiBjb25zdCBjYW1lcmFDb21wb25lbnQgPSBlbnRpdHkuY2FtZXJhO1xuICpcbiAqIC8vIFVwZGF0ZSBhIHByb3BlcnR5IG9uIGEgY2FtZXJhIGNvbXBvbmVudFxuICogZW50aXR5LmNhbWVyYS5uZWFyQ2xpcCA9IDI7XG4gKiBgYGBcbiAqXG4gKiBAYXVnbWVudHMgQ29tcG9uZW50XG4gKiBAY2F0ZWdvcnkgR3JhcGhpY3NcbiAqL1xuY2xhc3MgQ2FtZXJhQ29tcG9uZW50IGV4dGVuZHMgQ29tcG9uZW50IHtcbiAgICAvKipcbiAgICAgKiBDdXN0b20gZnVuY3Rpb24gdGhhdCBpcyBjYWxsZWQgd2hlbiBwb3N0cHJvY2Vzc2luZyBzaG91bGQgZXhlY3V0ZS5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtGdW5jdGlvbn1cbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgb25Qb3N0cHJvY2Vzc2luZyA9IG51bGw7XG5cbiAgICAvKipcbiAgICAgKiBDdXN0b20gZnVuY3Rpb24gdGhhdCBpcyBjYWxsZWQgYmVmb3JlIHRoZSBjYW1lcmEgcmVuZGVycyB0aGUgc2NlbmUuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7RnVuY3Rpb259XG4gICAgICovXG4gICAgb25QcmVSZW5kZXIgPSBudWxsO1xuXG4gICAgLyoqXG4gICAgICogQ3VzdG9tIGZ1bmN0aW9uIHRoYXQgaXMgY2FsbGVkIGFmdGVyIHRoZSBjYW1lcmEgcmVuZGVycyB0aGUgc2NlbmUuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7RnVuY3Rpb259XG4gICAgICovXG4gICAgb25Qb3N0UmVuZGVyID0gbnVsbDtcblxuICAgIC8qKlxuICAgICAqIEEgY291bnRlciBvZiByZXF1ZXN0cyBvZiBkZXB0aCBtYXAgcmVuZGVyaW5nLlxuICAgICAqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9yZW5kZXJTY2VuZURlcHRoTWFwID0gMDtcblxuICAgIC8qKlxuICAgICAqIEEgY291bnRlciBvZiByZXF1ZXN0cyBvZiBjb2xvciBtYXAgcmVuZGVyaW5nLlxuICAgICAqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9yZW5kZXJTY2VuZUNvbG9yTWFwID0gMDtcblxuICAgIC8qKiBAcHJpdmF0ZSAqL1xuICAgIF9zY2VuZURlcHRoTWFwUmVxdWVzdGVkID0gZmFsc2U7XG5cbiAgICAvKiogQHByaXZhdGUgKi9cbiAgICBfc2NlbmVDb2xvck1hcFJlcXVlc3RlZCA9IGZhbHNlO1xuXG4gICAgLyoqIEBwcml2YXRlICovXG4gICAgX3ByaW9yaXR5ID0gMDtcblxuICAgIC8qKlxuICAgICAqIExheWVyIGlkIGF0IHdoaWNoIHRoZSBwb3N0cHJvY2Vzc2luZyBzdG9wcyBmb3IgdGhlIGNhbWVyYS5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtudW1iZXJ9XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfZGlzYWJsZVBvc3RFZmZlY3RzTGF5ZXIgPSBMQVlFUklEX1VJO1xuXG4gICAgLyoqIEBwcml2YXRlICovXG4gICAgX2NhbWVyYSA9IG5ldyBDYW1lcmEoKTtcblxuICAgIC8qKlxuICAgICAqIENyZWF0ZSBhIG5ldyBDYW1lcmFDb21wb25lbnQgaW5zdGFuY2UuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi9zeXN0ZW0uanMnKS5DYW1lcmFDb21wb25lbnRTeXN0ZW19IHN5c3RlbSAtIFRoZSBDb21wb25lbnRTeXN0ZW0gdGhhdFxuICAgICAqIGNyZWF0ZWQgdGhpcyBDb21wb25lbnQuXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4uLy4uL2VudGl0eS5qcycpLkVudGl0eX0gZW50aXR5IC0gVGhlIEVudGl0eSB0aGF0IHRoaXMgQ29tcG9uZW50IGlzXG4gICAgICogYXR0YWNoZWQgdG8uXG4gICAgICovXG4gICAgY29uc3RydWN0b3Ioc3lzdGVtLCBlbnRpdHkpIHtcbiAgICAgICAgc3VwZXIoc3lzdGVtLCBlbnRpdHkpO1xuXG4gICAgICAgIHRoaXMuX2NhbWVyYS5ub2RlID0gZW50aXR5O1xuXG4gICAgICAgIC8vIHBvc3Rwcm9jZXNzaW5nIG1hbmFnZW1lbnRcbiAgICAgICAgdGhpcy5fcG9zdEVmZmVjdHMgPSBuZXcgUG9zdEVmZmVjdFF1ZXVlKHN5c3RlbS5hcHAsIHRoaXMpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIG5hbWUgb2YgdGhlIHNoYWRlciBwYXNzIHRoZSBjYW1lcmEgd2lsbCB1c2Ugd2hlbiByZW5kZXJpbmcuXG4gICAgICpcbiAgICAgKiBJbiBhZGRpdGlvbiB0byBleGlzdGluZyBuYW1lcyAoc2VlIHRoZSBwYXJhbWV0ZXIgZGVzY3JpcHRpb24pLCBhIG5ldyBuYW1lIGNhbiBiZSBzcGVjaWZpZWQsXG4gICAgICogd2hpY2ggY3JlYXRlcyBhIG5ldyBzaGFkZXIgcGFzcyB3aXRoIHRoZSBnaXZlbiBuYW1lLiBUaGUgbmFtZSBwcm92aWRlZCBjYW4gb25seSB1c2VcbiAgICAgKiBhbHBoYW51bWVyaWMgY2hhcmFjdGVycyBhbmQgdW5kZXJzY29yZXMuIFdoZW4gYSBzaGFkZXIgaXMgY29tcGlsZWQgZm9yIHRoZSBuZXcgcGFzcywgYSBkZWZpbmVcbiAgICAgKiBpcyBhZGRlZCB0byB0aGUgc2hhZGVyLiBGb3IgZXhhbXBsZSwgaWYgdGhlIG5hbWUgaXMgJ2N1c3RvbV9yZW5kZXJpbmcnLCB0aGUgZGVmaW5lXG4gICAgICogJ0NVU1RPTV9SRU5ERVJJTkdfUEFTUycgaXMgYWRkZWQgdG8gdGhlIHNoYWRlciwgYWxsb3dpbmcgdGhlIHNoYWRlciBjb2RlIHRvIGNvbmRpdGlvbmFsbHlcbiAgICAgKiBleGVjdXRlIGNvZGUgb25seSB3aGVuIHRoYXQgc2hhZGVyIHBhc3MgaXMgYWN0aXZlLlxuICAgICAqXG4gICAgICogQW5vdGhlciBpbnN0YW5jZSB3aGVyZSB0aGlzIGFwcHJvYWNoIG1heSBwcm92ZSB1c2VmdWwgaXMgd2hlbiBhIGNhbWVyYSBuZWVkcyB0byByZW5kZXIgYSBtb3JlXG4gICAgICogY29zdC1lZmZlY3RpdmUgdmVyc2lvbiBvZiBzaGFkZXJzLCBzdWNoIGFzIHdoZW4gY3JlYXRpbmcgYSByZWZsZWN0aW9uIHRleHR1cmUuIFRvIGFjY29tcGxpc2hcbiAgICAgKiB0aGlzLCBhIGNhbGxiYWNrIG9uIHRoZSBtYXRlcmlhbCB0aGF0IHRyaWdnZXJzIGR1cmluZyBzaGFkZXIgY29tcGlsYXRpb24gY2FuIGJlIHVzZWQuIFRoaXNcbiAgICAgKiBjYWxsYmFjayBjYW4gbW9kaWZ5IHRoZSBzaGFkZXIgZ2VuZXJhdGlvbiBvcHRpb25zIHNwZWNpZmljYWxseSBmb3IgdGhpcyBzaGFkZXIgcGFzcy5cbiAgICAgKlxuICAgICAqIGBgYGphdmFzY3JpcHRcbiAgICAgKiBjb25zdCBzaGFkZXJQYXNzSWQgPSBjYW1lcmEuc2V0U2hhZGVyUGFzcygnY3VzdG9tX3JlbmRlcmluZycpO1xuICAgICAqXG4gICAgICogbWF0ZXJpYWwub25VcGRhdGVTaGFkZXIgPSBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAqICAgICBpZiAob3B0aW9ucy5wYXNzID09PSBzaGFkZXJQYXNzSWQpIHtcbiAgICAgKiAgICAgICAgIG9wdGlvbnMubGl0T3B0aW9ucy5ub3JtYWxNYXBFbmFibGVkID0gZmFsc2U7XG4gICAgICogICAgICAgICBvcHRpb25zLmxpdE9wdGlvbnMudXNlU3BlY3VsYXIgPSBmYWxzZTtcbiAgICAgKiAgICAgfVxuICAgICAqICAgICByZXR1cm4gb3B0aW9ucztcbiAgICAgKiB9O1xuICAgICAqIGBgYFxuICAgICAqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IG5hbWUgLSBUaGUgbmFtZSBvZiB0aGUgc2hhZGVyIHBhc3MuIERlZmF1bHRzIHRvIHVuZGVmaW5lZCwgd2hpY2ggaXNcbiAgICAgKiBlcXVpdmFsZW50IHRvIHtAbGluayBTSEFERVJQQVNTX0ZPUldBUkR9LiBDYW4gYmU6XG4gICAgICpcbiAgICAgKiAtIHtAbGluayBTSEFERVJQQVNTX0ZPUldBUkR9XG4gICAgICogLSB7QGxpbmsgU0hBREVSUEFTU19BTEJFRE99XG4gICAgICogLSB7QGxpbmsgU0hBREVSUEFTU19PUEFDSVRZfVxuICAgICAqIC0ge0BsaW5rIFNIQURFUlBBU1NfV09STEROT1JNQUx9XG4gICAgICogLSB7QGxpbmsgU0hBREVSUEFTU19TUEVDVUxBUklUWX1cbiAgICAgKiAtIHtAbGluayBTSEFERVJQQVNTX0dMT1NTfVxuICAgICAqIC0ge0BsaW5rIFNIQURFUlBBU1NfTUVUQUxORVNTfVxuICAgICAqIC0ge0BsaW5rIFNIQURFUlBBU1NfQU99XG4gICAgICogLSB7QGxpbmsgU0hBREVSUEFTU19FTUlTU0lPTn1cbiAgICAgKiAtIHtAbGluayBTSEFERVJQQVNTX0xJR0hUSU5HfVxuICAgICAqIC0ge0BsaW5rIFNIQURFUlBBU1NfVVYwfVxuICAgICAqXG4gICAgICogQHJldHVybnMge251bWJlcn0gVGhlIGlkIG9mIHRoZSBzaGFkZXIgcGFzcy5cbiAgICAgKi9cbiAgICBzZXRTaGFkZXJQYXNzKG5hbWUpIHtcbiAgICAgICAgY29uc3Qgc2hhZGVyUGFzcyA9ICBTaGFkZXJQYXNzLmdldCh0aGlzLnN5c3RlbS5hcHAuZ3JhcGhpY3NEZXZpY2UpO1xuICAgICAgICBjb25zdCBzaGFkZXJQYXNzSW5mbyA9IG5hbWUgPyBzaGFkZXJQYXNzLmFsbG9jYXRlKG5hbWUsIHtcbiAgICAgICAgICAgIGlzRm9yd2FyZDogdHJ1ZVxuICAgICAgICB9KSA6IG51bGw7XG4gICAgICAgIHRoaXMuX2NhbWVyYS5zaGFkZXJQYXNzSW5mbyA9IHNoYWRlclBhc3NJbmZvO1xuXG4gICAgICAgIHJldHVybiBzaGFkZXJQYXNzSW5mby5pbmRleDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTaGFkZXIgcGFzcyBuYW1lLlxuICAgICAqXG4gICAgICogQHJldHVybnMge3N0cmluZ30gVGhlIG5hbWUgb2YgdGhlIHNoYWRlciBwYXNzLCBvciB1bmRlZmluZWQgaWYgbm8gc2hhZGVyIHBhc3MgaXMgc2V0LlxuICAgICAqL1xuICAgIGdldFNoYWRlclBhc3MoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9jYW1lcmEuc2hhZGVyUGFzc0luZm8/Lm5hbWU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0IGNhbWVyYSBhcGVydHVyZSBpbiBmLXN0b3BzLCB0aGUgZGVmYXVsdCB2YWx1ZSBpcyAxNi4wLiBIaWdoZXIgdmFsdWUgbWVhbnMgbGVzcyBleHBvc3VyZS5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtudW1iZXJ9XG4gICAgICovXG4gICAgc2V0IGFwZXJ0dXJlKHZhbHVlKSB7XG4gICAgICAgIHRoaXMuX2NhbWVyYS5hcGVydHVyZSA9IHZhbHVlO1xuICAgIH1cblxuICAgIGdldCBhcGVydHVyZSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2NhbWVyYS5hcGVydHVyZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUaGUgYXNwZWN0IHJhdGlvICh3aWR0aCBkaXZpZGVkIGJ5IGhlaWdodCkgb2YgdGhlIGNhbWVyYS4gSWYgYXNwZWN0UmF0aW9Nb2RlIGlzXG4gICAgICoge0BsaW5rIEFTUEVDVF9BVVRPfSwgdGhlbiB0aGlzIHZhbHVlIHdpbGwgYmUgYXV0b21hdGljYWxseSBjYWxjdWxhdGVkIGV2ZXJ5IGZyYW1lLCBhbmQgeW91XG4gICAgICogY2FuIG9ubHkgcmVhZCBpdC4gSWYgaXQncyBBU1BFQ1RfTUFOVUFMLCB5b3UgY2FuIHNldCB0aGUgdmFsdWUuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqL1xuICAgIHNldCBhc3BlY3RSYXRpbyh2YWx1ZSkge1xuICAgICAgICB0aGlzLl9jYW1lcmEuYXNwZWN0UmF0aW8gPSB2YWx1ZTtcbiAgICB9XG5cbiAgICBnZXQgYXNwZWN0UmF0aW8oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9jYW1lcmEuYXNwZWN0UmF0aW87XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVGhlIGFzcGVjdCByYXRpbyBtb2RlIG9mIHRoZSBjYW1lcmEuIENhbiBiZTpcbiAgICAgKlxuICAgICAqIC0ge0BsaW5rIEFTUEVDVF9BVVRPfTogYXNwZWN0IHJhdGlvIHdpbGwgYmUgY2FsY3VsYXRlZCBmcm9tIHRoZSBjdXJyZW50IHJlbmRlclxuICAgICAqIHRhcmdldCdzIHdpZHRoIGRpdmlkZWQgYnkgaGVpZ2h0LlxuICAgICAqIC0ge0BsaW5rIEFTUEVDVF9NQU5VQUx9OiB1c2UgdGhlIGFzcGVjdFJhdGlvIHZhbHVlLlxuICAgICAqXG4gICAgICogRGVmYXVsdHMgdG8ge0BsaW5rIEFTUEVDVF9BVVRPfS5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtudW1iZXJ9XG4gICAgICovXG4gICAgc2V0IGFzcGVjdFJhdGlvTW9kZSh2YWx1ZSkge1xuICAgICAgICB0aGlzLl9jYW1lcmEuYXNwZWN0UmF0aW9Nb2RlID0gdmFsdWU7XG4gICAgfVxuXG4gICAgZ2V0IGFzcGVjdFJhdGlvTW9kZSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2NhbWVyYS5hc3BlY3RSYXRpb01vZGU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ3VzdG9tIGZ1bmN0aW9uIHlvdSBjYW4gcHJvdmlkZSB0byBjYWxjdWxhdGUgdGhlIGNhbWVyYSBwcm9qZWN0aW9uIG1hdHJpeCBtYW51YWxseS4gQ2FuIGJlXG4gICAgICogdXNlZCBmb3IgY29tcGxleCBlZmZlY3RzIGxpa2UgZG9pbmcgb2JsaXF1ZSBwcm9qZWN0aW9uLiBGdW5jdGlvbiBpcyBjYWxsZWQgdXNpbmcgY29tcG9uZW50J3NcbiAgICAgKiBzY29wZS4gQXJndW1lbnRzOlxuICAgICAqXG4gICAgICogLSB7QGxpbmsgTWF0NH0gdHJhbnNmb3JtTWF0cml4OiBvdXRwdXQgb2YgdGhlIGZ1bmN0aW9uXG4gICAgICogLSB2aWV3OiBUeXBlIG9mIHZpZXcuIENhbiBiZSB7QGxpbmsgVklFV19DRU5URVJ9LCB7QGxpbmsgVklFV19MRUZUfSBvciB7QGxpbmsgVklFV19SSUdIVH0uXG4gICAgICpcbiAgICAgKiBMZWZ0IGFuZCByaWdodCBhcmUgb25seSB1c2VkIGluIHN0ZXJlbyByZW5kZXJpbmcuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7Q2FsY3VsYXRlTWF0cml4Q2FsbGJhY2t9XG4gICAgICovXG4gICAgc2V0IGNhbGN1bGF0ZVByb2plY3Rpb24odmFsdWUpIHtcbiAgICAgICAgdGhpcy5fY2FtZXJhLmNhbGN1bGF0ZVByb2plY3Rpb24gPSB2YWx1ZTtcbiAgICB9XG5cbiAgICBnZXQgY2FsY3VsYXRlUHJvamVjdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2NhbWVyYS5jYWxjdWxhdGVQcm9qZWN0aW9uO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEN1c3RvbSBmdW5jdGlvbiB5b3UgY2FuIHByb3ZpZGUgdG8gY2FsY3VsYXRlIHRoZSBjYW1lcmEgdHJhbnNmb3JtYXRpb24gbWF0cml4IG1hbnVhbGx5LiBDYW5cbiAgICAgKiBiZSB1c2VkIGZvciBjb21wbGV4IGVmZmVjdHMgbGlrZSByZWZsZWN0aW9ucy4gRnVuY3Rpb24gaXMgY2FsbGVkIHVzaW5nIGNvbXBvbmVudCdzIHNjb3BlLlxuICAgICAqIEFyZ3VtZW50czpcbiAgICAgKlxuICAgICAqIC0ge0BsaW5rIE1hdDR9IHRyYW5zZm9ybU1hdHJpeDogb3V0cHV0IG9mIHRoZSBmdW5jdGlvbi5cbiAgICAgKiAtIHZpZXc6IFR5cGUgb2Ygdmlldy4gQ2FuIGJlIHtAbGluayBWSUVXX0NFTlRFUn0sIHtAbGluayBWSUVXX0xFRlR9IG9yIHtAbGluayBWSUVXX1JJR0hUfS5cbiAgICAgKlxuICAgICAqIExlZnQgYW5kIHJpZ2h0IGFyZSBvbmx5IHVzZWQgaW4gc3RlcmVvIHJlbmRlcmluZy5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtDYWxjdWxhdGVNYXRyaXhDYWxsYmFja31cbiAgICAgKi9cbiAgICBzZXQgY2FsY3VsYXRlVHJhbnNmb3JtKHZhbHVlKSB7XG4gICAgICAgIHRoaXMuX2NhbWVyYS5jYWxjdWxhdGVUcmFuc2Zvcm0gPSB2YWx1ZTtcbiAgICB9XG5cbiAgICBnZXQgY2FsY3VsYXRlVHJhbnNmb3JtKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fY2FtZXJhLmNhbGN1bGF0ZVRyYW5zZm9ybTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBRdWVyaWVzIHRoZSBjYW1lcmEgY29tcG9uZW50J3MgdW5kZXJseWluZyBDYW1lcmEgaW5zdGFuY2UuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7Q2FtZXJhfVxuICAgICAqIEBpZ25vcmVcbiAgICAgKi9cbiAgICBnZXQgY2FtZXJhKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fY2FtZXJhO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRoZSBjb2xvciB1c2VkIHRvIGNsZWFyIHRoZSBjYW52YXMgdG8gYmVmb3JlIHRoZSBjYW1lcmEgc3RhcnRzIHRvIHJlbmRlci4gRGVmYXVsdHMgdG9cbiAgICAgKiBbMC43NSwgMC43NSwgMC43NSwgMV0uXG4gICAgICpcbiAgICAgKiBAdHlwZSB7aW1wb3J0KCcuLi8uLi8uLi9jb3JlL21hdGgvY29sb3IuanMnKS5Db2xvcn1cbiAgICAgKi9cbiAgICBzZXQgY2xlYXJDb2xvcih2YWx1ZSkge1xuICAgICAgICB0aGlzLl9jYW1lcmEuY2xlYXJDb2xvciA9IHZhbHVlO1xuICAgIH1cblxuICAgIGdldCBjbGVhckNvbG9yKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fY2FtZXJhLmNsZWFyQ29sb3I7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSWYgdHJ1ZSB0aGUgY2FtZXJhIHdpbGwgY2xlYXIgdGhlIGNvbG9yIGJ1ZmZlciB0byB0aGUgY29sb3Igc2V0IGluIGNsZWFyQ29sb3IuIERlZmF1bHRzIHRvIHRydWUuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICAgKi9cbiAgICBzZXQgY2xlYXJDb2xvckJ1ZmZlcih2YWx1ZSkge1xuICAgICAgICB0aGlzLl9jYW1lcmEuY2xlYXJDb2xvckJ1ZmZlciA9IHZhbHVlO1xuICAgICAgICB0aGlzLmRpcnR5TGF5ZXJDb21wb3NpdGlvbkNhbWVyYXMoKTtcbiAgICB9XG5cbiAgICBnZXQgY2xlYXJDb2xvckJ1ZmZlcigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2NhbWVyYS5jbGVhckNvbG9yQnVmZmVyO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIElmIHRydWUgdGhlIGNhbWVyYSB3aWxsIGNsZWFyIHRoZSBkZXB0aCBidWZmZXIuIERlZmF1bHRzIHRvIHRydWUuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICAgKi9cbiAgICBzZXQgY2xlYXJEZXB0aEJ1ZmZlcih2YWx1ZSkge1xuICAgICAgICB0aGlzLl9jYW1lcmEuY2xlYXJEZXB0aEJ1ZmZlciA9IHZhbHVlO1xuICAgICAgICB0aGlzLmRpcnR5TGF5ZXJDb21wb3NpdGlvbkNhbWVyYXMoKTtcbiAgICB9XG5cbiAgICBnZXQgY2xlYXJEZXB0aEJ1ZmZlcigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2NhbWVyYS5jbGVhckRlcHRoQnVmZmVyO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIElmIHRydWUgdGhlIGNhbWVyYSB3aWxsIGNsZWFyIHRoZSBzdGVuY2lsIGJ1ZmZlci4gRGVmYXVsdHMgdG8gdHJ1ZS5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAqL1xuICAgIHNldCBjbGVhclN0ZW5jaWxCdWZmZXIodmFsdWUpIHtcbiAgICAgICAgdGhpcy5fY2FtZXJhLmNsZWFyU3RlbmNpbEJ1ZmZlciA9IHZhbHVlO1xuICAgICAgICB0aGlzLmRpcnR5TGF5ZXJDb21wb3NpdGlvbkNhbWVyYXMoKTtcbiAgICB9XG5cbiAgICBnZXQgY2xlYXJTdGVuY2lsQnVmZmVyKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fY2FtZXJhLmNsZWFyU3RlbmNpbEJ1ZmZlcjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJZiB0cnVlIHRoZSBjYW1lcmEgd2lsbCB0YWtlIG1hdGVyaWFsLmN1bGwgaW50byBhY2NvdW50LiBPdGhlcndpc2UgYm90aCBmcm9udCBhbmQgYmFjayBmYWNlc1xuICAgICAqIHdpbGwgYmUgcmVuZGVyZWQuIERlZmF1bHRzIHRvIHRydWUuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICAgKi9cbiAgICBzZXQgY3VsbEZhY2VzKHZhbHVlKSB7XG4gICAgICAgIHRoaXMuX2NhbWVyYS5jdWxsRmFjZXMgPSB2YWx1ZTtcbiAgICB9XG5cbiAgICBnZXQgY3VsbEZhY2VzKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fY2FtZXJhLmN1bGxGYWNlcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBMYXllciBJRCBvZiBhIGxheWVyIG9uIHdoaWNoIHRoZSBwb3N0cHJvY2Vzc2luZyBvZiB0aGUgY2FtZXJhIHN0b3BzIGJlaW5nIGFwcGxpZWQgdG8uXG4gICAgICogRGVmYXVsdHMgdG8gTEFZRVJJRF9VSSwgd2hpY2ggY2F1c2VzIHBvc3QgcHJvY2Vzc2luZyB0byBub3QgYmUgYXBwbGllZCB0byBVSSBsYXllciBhbmQgYW55XG4gICAgICogZm9sbG93aW5nIGxheWVycyBmb3IgdGhlIGNhbWVyYS4gU2V0IHRvIHVuZGVmaW5lZCBmb3IgcG9zdC1wcm9jZXNzaW5nIHRvIGJlIGFwcGxpZWQgdG8gYWxsXG4gICAgICogbGF5ZXJzIG9mIHRoZSBjYW1lcmEuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqL1xuICAgIHNldCBkaXNhYmxlUG9zdEVmZmVjdHNMYXllcihsYXllcikge1xuICAgICAgICB0aGlzLl9kaXNhYmxlUG9zdEVmZmVjdHNMYXllciA9IGxheWVyO1xuICAgICAgICB0aGlzLmRpcnR5TGF5ZXJDb21wb3NpdGlvbkNhbWVyYXMoKTtcbiAgICB9XG5cbiAgICBnZXQgZGlzYWJsZVBvc3RFZmZlY3RzTGF5ZXIoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9kaXNhYmxlUG9zdEVmZmVjdHNMYXllcjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUaGUgZGlzdGFuY2UgZnJvbSB0aGUgY2FtZXJhIGFmdGVyIHdoaWNoIG5vIHJlbmRlcmluZyB3aWxsIHRha2UgcGxhY2UuIERlZmF1bHRzIHRvIDEwMDAuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqL1xuICAgIHNldCBmYXJDbGlwKHZhbHVlKSB7XG4gICAgICAgIHRoaXMuX2NhbWVyYS5mYXJDbGlwID0gdmFsdWU7XG4gICAgfVxuXG4gICAgZ2V0IGZhckNsaXAoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9jYW1lcmEuZmFyQ2xpcDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJZiB0cnVlIHRoZSBjYW1lcmEgd2lsbCBpbnZlcnQgZnJvbnQgYW5kIGJhY2sgZmFjZXMuIENhbiBiZSB1c2VmdWwgZm9yIHJlZmxlY3Rpb24gcmVuZGVyaW5nLlxuICAgICAqIERlZmF1bHRzIHRvIGZhbHNlLlxuICAgICAqXG4gICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICovXG4gICAgc2V0IGZsaXBGYWNlcyh2YWx1ZSkge1xuICAgICAgICB0aGlzLl9jYW1lcmEuZmxpcEZhY2VzID0gdmFsdWU7XG4gICAgfVxuXG4gICAgZ2V0IGZsaXBGYWNlcygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2NhbWVyYS5mbGlwRmFjZXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVGhlIGZpZWxkIG9mIHZpZXcgb2YgdGhlIGNhbWVyYSBpbiBkZWdyZWVzLiBVc3VhbGx5IHRoaXMgaXMgdGhlIFktYXhpcyBmaWVsZCBvZiB2aWV3LCBzZWVcbiAgICAgKiB7QGxpbmsgQ2FtZXJhQ29tcG9uZW50I2hvcml6b250YWxGb3Z9LiBVc2VkIGZvciB7QGxpbmsgUFJPSkVDVElPTl9QRVJTUEVDVElWRX0gY2FtZXJhcyBvbmx5LlxuICAgICAqIERlZmF1bHRzIHRvIDQ1LlxuICAgICAqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKi9cbiAgICBzZXQgZm92KHZhbHVlKSB7XG4gICAgICAgIHRoaXMuX2NhbWVyYS5mb3YgPSB2YWx1ZTtcbiAgICB9XG5cbiAgICBnZXQgZm92KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fY2FtZXJhLmZvdjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBRdWVyaWVzIHRoZSBjYW1lcmEncyBmcnVzdHVtIHNoYXBlLlxuICAgICAqXG4gICAgICogQHR5cGUge2ltcG9ydCgnLi4vLi4vLi4vY29yZS9zaGFwZS9mcnVzdHVtLmpzJykuRnJ1c3R1bX1cbiAgICAgKi9cbiAgICBnZXQgZnJ1c3R1bSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2NhbWVyYS5mcnVzdHVtO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENvbnRyb2xzIHRoZSBjdWxsaW5nIG9mIG1lc2ggaW5zdGFuY2VzIGFnYWluc3QgdGhlIGNhbWVyYSBmcnVzdHVtLCBpLmUuIGlmIG9iamVjdHMgb3V0c2lkZVxuICAgICAqIG9mIGNhbWVyYSBzaG91bGQgYmUgb21pdHRlZCBmcm9tIHJlbmRlcmluZy4gSWYgZmFsc2UsIGFsbCBtZXNoIGluc3RhbmNlcyBpbiB0aGUgc2NlbmUgYXJlXG4gICAgICogcmVuZGVyZWQgYnkgdGhlIGNhbWVyYSwgcmVnYXJkbGVzcyBvZiB2aXNpYmlsaXR5LiBEZWZhdWx0cyB0byBmYWxzZS5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAqL1xuICAgIHNldCBmcnVzdHVtQ3VsbGluZyh2YWx1ZSkge1xuICAgICAgICB0aGlzLl9jYW1lcmEuZnJ1c3R1bUN1bGxpbmcgPSB2YWx1ZTtcbiAgICB9XG5cbiAgICBnZXQgZnJ1c3R1bUN1bGxpbmcoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9jYW1lcmEuZnJ1c3R1bUN1bGxpbmc7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0IHdoaWNoIGF4aXMgdG8gdXNlIGZvciB0aGUgRmllbGQgb2YgVmlldyBjYWxjdWxhdGlvbi4gRGVmYXVsdHMgdG8gZmFsc2UuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICAgKi9cbiAgICBzZXQgaG9yaXpvbnRhbEZvdih2YWx1ZSkge1xuICAgICAgICB0aGlzLl9jYW1lcmEuaG9yaXpvbnRhbEZvdiA9IHZhbHVlO1xuICAgIH1cblxuICAgIGdldCBob3Jpem9udGFsRm92KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fY2FtZXJhLmhvcml6b250YWxGb3Y7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQW4gYXJyYXkgb2YgbGF5ZXIgSURzICh7QGxpbmsgTGF5ZXIjaWR9KSB0byB3aGljaCB0aGlzIGNhbWVyYSBzaG91bGQgYmVsb25nLiBEb24ndCBwdXNoLFxuICAgICAqIHBvcCwgc3BsaWNlIG9yIG1vZGlmeSB0aGlzIGFycmF5LCBpZiB5b3Ugd2FudCB0byBjaGFuZ2UgaXQsIHNldCBhIG5ldyBvbmUgaW5zdGVhZC4gRGVmYXVsdHNcbiAgICAgKiB0byBbTEFZRVJJRF9XT1JMRCwgTEFZRVJJRF9ERVBUSCwgTEFZRVJJRF9TS1lCT1gsIExBWUVSSURfVUksIExBWUVSSURfSU1NRURJQVRFXS5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtudW1iZXJbXX1cbiAgICAgKi9cbiAgICBzZXQgbGF5ZXJzKG5ld1ZhbHVlKSB7XG4gICAgICAgIGNvbnN0IGxheWVycyA9IHRoaXMuX2NhbWVyYS5sYXllcnM7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbGF5ZXJzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBsYXllciA9IHRoaXMuc3lzdGVtLmFwcC5zY2VuZS5sYXllcnMuZ2V0TGF5ZXJCeUlkKGxheWVyc1tpXSk7XG4gICAgICAgICAgICBpZiAoIWxheWVyKSBjb250aW51ZTtcbiAgICAgICAgICAgIGxheWVyLnJlbW92ZUNhbWVyYSh0aGlzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuX2NhbWVyYS5sYXllcnMgPSBuZXdWYWx1ZTtcblxuICAgICAgICBpZiAoIXRoaXMuZW5hYmxlZCB8fCAhdGhpcy5lbnRpdHkuZW5hYmxlZCkgcmV0dXJuO1xuXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbmV3VmFsdWUubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGNvbnN0IGxheWVyID0gdGhpcy5zeXN0ZW0uYXBwLnNjZW5lLmxheWVycy5nZXRMYXllckJ5SWQobmV3VmFsdWVbaV0pO1xuICAgICAgICAgICAgaWYgKCFsYXllcikgY29udGludWU7XG4gICAgICAgICAgICBsYXllci5hZGRDYW1lcmEodGhpcyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBnZXQgbGF5ZXJzKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fY2FtZXJhLmxheWVycztcbiAgICB9XG5cbiAgICBnZXQgbGF5ZXJzU2V0KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fY2FtZXJhLmxheWVyc1NldDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUaGUgZGlzdGFuY2UgZnJvbSB0aGUgY2FtZXJhIGJlZm9yZSB3aGljaCBubyByZW5kZXJpbmcgd2lsbCB0YWtlIHBsYWNlLiBEZWZhdWx0cyB0byAwLjEuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqL1xuICAgIHNldCBuZWFyQ2xpcCh2YWx1ZSkge1xuICAgICAgICB0aGlzLl9jYW1lcmEubmVhckNsaXAgPSB2YWx1ZTtcbiAgICB9XG5cbiAgICBnZXQgbmVhckNsaXAoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9jYW1lcmEubmVhckNsaXA7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVGhlIGhhbGYtaGVpZ2h0IG9mIHRoZSBvcnRob2dyYXBoaWMgdmlldyB3aW5kb3cgKGluIHRoZSBZLWF4aXMpLiBVc2VkIGZvclxuICAgICAqIHtAbGluayBQUk9KRUNUSU9OX09SVEhPR1JBUEhJQ30gY2FtZXJhcyBvbmx5LiBEZWZhdWx0cyB0byAxMC5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtudW1iZXJ9XG4gICAgICovXG4gICAgc2V0IG9ydGhvSGVpZ2h0KHZhbHVlKSB7XG4gICAgICAgIHRoaXMuX2NhbWVyYS5vcnRob0hlaWdodCA9IHZhbHVlO1xuICAgIH1cblxuICAgIGdldCBvcnRob0hlaWdodCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2NhbWVyYS5vcnRob0hlaWdodDtcbiAgICB9XG5cbiAgICBnZXQgcG9zdEVmZmVjdHMoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9wb3N0RWZmZWN0cztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUaGUgcG9zdCBlZmZlY3RzIHF1ZXVlIGZvciB0aGlzIGNhbWVyYS4gVXNlIHRoaXMgdG8gYWRkIG9yIHJlbW92ZSBwb3N0IGVmZmVjdHMgZnJvbSB0aGUgY2FtZXJhLlxuICAgICAqXG4gICAgICogQHR5cGUge1Bvc3RFZmZlY3RRdWV1ZX1cbiAgICAgKi9cbiAgICBnZXQgcG9zdEVmZmVjdHNFbmFibGVkKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fcG9zdEVmZmVjdHMuZW5hYmxlZDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDb250cm9scyB0aGUgb3JkZXIgaW4gd2hpY2ggY2FtZXJhcyBhcmUgcmVuZGVyZWQuIENhbWVyYXMgd2l0aCBzbWFsbGVyIHZhbHVlcyBmb3IgcHJpb3JpdHlcbiAgICAgKiBhcmUgcmVuZGVyZWQgZmlyc3QuIERlZmF1bHRzIHRvIDAuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqL1xuICAgIHNldCBwcmlvcml0eShuZXdWYWx1ZSkge1xuICAgICAgICB0aGlzLl9wcmlvcml0eSA9IG5ld1ZhbHVlO1xuICAgICAgICB0aGlzLmRpcnR5TGF5ZXJDb21wb3NpdGlvbkNhbWVyYXMoKTtcbiAgICB9XG5cbiAgICBnZXQgcHJpb3JpdHkoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9wcmlvcml0eTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUaGUgdHlwZSBvZiBwcm9qZWN0aW9uIHVzZWQgdG8gcmVuZGVyIHRoZSBjYW1lcmEuIENhbiBiZTpcbiAgICAgKlxuICAgICAqIC0ge0BsaW5rIFBST0pFQ1RJT05fUEVSU1BFQ1RJVkV9OiBBIHBlcnNwZWN0aXZlIHByb2plY3Rpb24uIFRoZSBjYW1lcmEgZnJ1c3R1bVxuICAgICAqIHJlc2VtYmxlcyBhIHRydW5jYXRlZCBweXJhbWlkLlxuICAgICAqIC0ge0BsaW5rIFBST0pFQ1RJT05fT1JUSE9HUkFQSElDfTogQW4gb3J0aG9ncmFwaGljIHByb2plY3Rpb24uIFRoZSBjYW1lcmFcbiAgICAgKiBmcnVzdHVtIGlzIGEgY3Vib2lkLlxuICAgICAqXG4gICAgICogRGVmYXVsdHMgdG8ge0BsaW5rIFBST0pFQ1RJT05fUEVSU1BFQ1RJVkV9LlxuICAgICAqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKi9cbiAgICBzZXQgcHJvamVjdGlvbih2YWx1ZSkge1xuICAgICAgICB0aGlzLl9jYW1lcmEucHJvamVjdGlvbiA9IHZhbHVlO1xuICAgIH1cblxuICAgIGdldCBwcm9qZWN0aW9uKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fY2FtZXJhLnByb2plY3Rpb247XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUXVlcmllcyB0aGUgY2FtZXJhJ3MgcHJvamVjdGlvbiBtYXRyaXguXG4gICAgICpcbiAgICAgKiBAdHlwZSB7aW1wb3J0KCcuLi8uLi8uLi9jb3JlL21hdGgvbWF0NC5qcycpLk1hdDR9XG4gICAgICovXG4gICAgZ2V0IHByb2plY3Rpb25NYXRyaXgoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9jYW1lcmEucHJvamVjdGlvbk1hdHJpeDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDb250cm9scyB3aGVyZSBvbiB0aGUgc2NyZWVuIHRoZSBjYW1lcmEgd2lsbCBiZSByZW5kZXJlZCBpbiBub3JtYWxpemVkIHNjcmVlbiBjb29yZGluYXRlcy5cbiAgICAgKiBEZWZhdWx0cyB0byBbMCwgMCwgMSwgMV0uXG4gICAgICpcbiAgICAgKiBAdHlwZSB7aW1wb3J0KCcuLi8uLi8uLi9jb3JlL21hdGgvdmVjNC5qcycpLlZlYzR9XG4gICAgICovXG4gICAgc2V0IHJlY3QodmFsdWUpIHtcbiAgICAgICAgdGhpcy5fY2FtZXJhLnJlY3QgPSB2YWx1ZTtcbiAgICAgICAgdGhpcy5maXJlKCdzZXQ6cmVjdCcsIHRoaXMuX2NhbWVyYS5yZWN0KTtcbiAgICB9XG5cbiAgICBnZXQgcmVjdCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2NhbWVyYS5yZWN0O1xuICAgIH1cblxuICAgIHNldCByZW5kZXJTY2VuZUNvbG9yTWFwKHZhbHVlKSB7XG4gICAgICAgIGlmICh2YWx1ZSAmJiAhdGhpcy5fc2NlbmVDb2xvck1hcFJlcXVlc3RlZCkge1xuICAgICAgICAgICAgdGhpcy5yZXF1ZXN0U2NlbmVDb2xvck1hcCh0cnVlKTtcbiAgICAgICAgICAgIHRoaXMuX3NjZW5lQ29sb3JNYXBSZXF1ZXN0ZWQgPSB0cnVlO1xuICAgICAgICB9IGVsc2UgaWYgKHRoaXMuX3NjZW5lQ29sb3JNYXBSZXF1ZXN0ZWQpIHtcbiAgICAgICAgICAgIHRoaXMucmVxdWVzdFNjZW5lQ29sb3JNYXAoZmFsc2UpO1xuICAgICAgICAgICAgdGhpcy5fc2NlbmVDb2xvck1hcFJlcXVlc3RlZCA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2V0IHJlbmRlclNjZW5lQ29sb3JNYXAoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9yZW5kZXJTY2VuZUNvbG9yTWFwID4gMDtcbiAgICB9XG5cbiAgICBzZXQgcmVuZGVyU2NlbmVEZXB0aE1hcCh2YWx1ZSkge1xuICAgICAgICBpZiAodmFsdWUgJiYgIXRoaXMuX3NjZW5lRGVwdGhNYXBSZXF1ZXN0ZWQpIHtcbiAgICAgICAgICAgIHRoaXMucmVxdWVzdFNjZW5lRGVwdGhNYXAodHJ1ZSk7XG4gICAgICAgICAgICB0aGlzLl9zY2VuZURlcHRoTWFwUmVxdWVzdGVkID0gdHJ1ZTtcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLl9zY2VuZURlcHRoTWFwUmVxdWVzdGVkKSB7XG4gICAgICAgICAgICB0aGlzLnJlcXVlc3RTY2VuZURlcHRoTWFwKGZhbHNlKTtcbiAgICAgICAgICAgIHRoaXMuX3NjZW5lRGVwdGhNYXBSZXF1ZXN0ZWQgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGdldCByZW5kZXJTY2VuZURlcHRoTWFwKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fcmVuZGVyU2NlbmVEZXB0aE1hcCA+IDA7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVuZGVyIHRhcmdldCB0byB3aGljaCByZW5kZXJpbmcgb2YgdGhlIGNhbWVyYXMgaXMgcGVyZm9ybWVkLiBJZiBub3Qgc2V0LCBpdCB3aWxsIHJlbmRlclxuICAgICAqIHNpbXBseSB0byB0aGUgc2NyZWVuLlxuICAgICAqXG4gICAgICogQHR5cGUge2ltcG9ydCgnLi4vLi4vLi4vcGxhdGZvcm0vZ3JhcGhpY3MvcmVuZGVyLXRhcmdldC5qcycpLlJlbmRlclRhcmdldH1cbiAgICAgKi9cbiAgICBzZXQgcmVuZGVyVGFyZ2V0KHZhbHVlKSB7XG4gICAgICAgIHRoaXMuX2NhbWVyYS5yZW5kZXJUYXJnZXQgPSB2YWx1ZTtcbiAgICAgICAgdGhpcy5kaXJ0eUxheWVyQ29tcG9zaXRpb25DYW1lcmFzKCk7XG4gICAgfVxuXG4gICAgZ2V0IHJlbmRlclRhcmdldCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2NhbWVyYS5yZW5kZXJUYXJnZXQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ2xpcHMgYWxsIHBpeGVscyB3aGljaCBhcmUgbm90IGluIHRoZSByZWN0YW5nbGUuIFRoZSBvcmRlciBvZiB0aGUgdmFsdWVzIGlzXG4gICAgICogW3gsIHksIHdpZHRoLCBoZWlnaHRdLiBEZWZhdWx0cyB0byBbMCwgMCwgMSwgMV0uXG4gICAgICpcbiAgICAgKiBAdHlwZSB7aW1wb3J0KCcuLi8uLi8uLi9jb3JlL21hdGgvdmVjNC5qcycpLlZlYzR9XG4gICAgICovXG4gICAgc2V0IHNjaXNzb3JSZWN0KHZhbHVlKSB7XG4gICAgICAgIHRoaXMuX2NhbWVyYS5zY2lzc29yUmVjdCA9IHZhbHVlO1xuICAgIH1cblxuICAgIGdldCBzY2lzc29yUmVjdCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2NhbWVyYS5zY2lzc29yUmVjdDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXQgY2FtZXJhIHNlbnNpdGl2aXR5IGluIElTTywgdGhlIGRlZmF1bHQgdmFsdWUgaXMgMTAwMC4gSGlnaGVyIHZhbHVlIG1lYW5zIG1vcmUgZXhwb3N1cmUuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqL1xuICAgIHNldCBzZW5zaXRpdml0eSh2YWx1ZSkge1xuICAgICAgICB0aGlzLl9jYW1lcmEuc2Vuc2l0aXZpdHkgPSB2YWx1ZTtcbiAgICB9XG5cbiAgICBnZXQgc2Vuc2l0aXZpdHkoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9jYW1lcmEuc2Vuc2l0aXZpdHk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0IGNhbWVyYSBzaHV0dGVyIHNwZWVkIGluIHNlY29uZHMsIHRoZSBkZWZhdWx0IHZhbHVlIGlzIDEvMTAwMHMuIExvbmdlciBzaHV0dGVyIG1lYW5zIG1vcmUgZXhwb3N1cmUuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqL1xuICAgIHNldCBzaHV0dGVyKHZhbHVlKSB7XG4gICAgICAgIHRoaXMuX2NhbWVyYS5zaHV0dGVyID0gdmFsdWU7XG4gICAgfVxuXG4gICAgZ2V0IHNodXR0ZXIoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9jYW1lcmEuc2h1dHRlcjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBRdWVyaWVzIHRoZSBjYW1lcmEncyB2aWV3IG1hdHJpeC5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtpbXBvcnQoJy4uLy4uLy4uL2NvcmUvbWF0aC9tYXQ0LmpzJykuTWF0NH1cbiAgICAgKi9cbiAgICBnZXQgdmlld01hdHJpeCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2NhbWVyYS52aWV3TWF0cml4O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEJhc2VkIG9uIHRoZSB2YWx1ZSwgdGhlIGRlcHRoIGxheWVyJ3MgZW5hYmxlIGNvdW50ZXIgaXMgaW5jcmVtZW50ZWQgb3IgZGVjcmVtZW50ZWQuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IHZhbHVlIC0gVHJ1ZSB0byBpbmNyZW1lbnQgdGhlIGNvdW50ZXIsIGZhbHNlIHRvIGRlY3JlbWVudCBpdC5cbiAgICAgKiBAcmV0dXJucyB7Ym9vbGVhbn0gVHJ1ZSBpZiB0aGUgY291bnRlciB3YXMgaW5jcmVtZW50ZWQgb3IgZGVjcmVtZW50ZWQsIGZhbHNlIGlmIHRoZSBkZXB0aFxuICAgICAqIGxheWVyIGlzIG5vdCBwcmVzZW50LlxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX2VuYWJsZURlcHRoTGF5ZXIodmFsdWUpIHtcbiAgICAgICAgY29uc3QgaGFzRGVwdGhMYXllciA9IHRoaXMubGF5ZXJzLmZpbmQobGF5ZXJJZCA9PiBsYXllcklkID09PSBMQVlFUklEX0RFUFRIKTtcbiAgICAgICAgaWYgKGhhc0RlcHRoTGF5ZXIpIHtcblxuICAgICAgICAgICAgLyoqIEB0eXBlIHtpbXBvcnQoJy4uLy4uLy4uL3NjZW5lL2xheWVyLmpzJykuTGF5ZXJ9ICovXG4gICAgICAgICAgICBjb25zdCBkZXB0aExheWVyID0gdGhpcy5zeXN0ZW0uYXBwLnNjZW5lLmxheWVycy5nZXRMYXllckJ5SWQoTEFZRVJJRF9ERVBUSCk7XG5cbiAgICAgICAgICAgIGlmICh2YWx1ZSkge1xuICAgICAgICAgICAgICAgIGRlcHRoTGF5ZXI/LmluY3JlbWVudENvdW50ZXIoKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZGVwdGhMYXllcj8uZGVjcmVtZW50Q291bnRlcigpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKHZhbHVlKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXF1ZXN0IHRoZSBzY2VuZSB0byBnZW5lcmF0ZSBhIHRleHR1cmUgY29udGFpbmluZyB0aGUgc2NlbmUgY29sb3IgbWFwLiBOb3RlIHRoYXQgdGhpcyBjYWxsXG4gICAgICogaXMgYWNjdW11bGF0aXZlLCBhbmQgZm9yIGVhY2ggZW5hYmxlIHJlcXVlc3QsIGEgZGlzYWJsZSByZXF1ZXN0IG5lZWQgdG8gYmUgY2FsbGVkLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtib29sZWFufSBlbmFibGVkIC0gVHJ1ZSB0byByZXF1ZXN0IHRoZSBnZW5lcmF0aW9uLCBmYWxzZSB0byBkaXNhYmxlIGl0LlxuICAgICAqL1xuICAgIHJlcXVlc3RTY2VuZUNvbG9yTWFwKGVuYWJsZWQpIHtcbiAgICAgICAgdGhpcy5fcmVuZGVyU2NlbmVDb2xvck1hcCArPSBlbmFibGVkID8gMSA6IC0xO1xuICAgICAgICBEZWJ1Zy5hc3NlcnQodGhpcy5fcmVuZGVyU2NlbmVDb2xvck1hcCA+PSAwKTtcbiAgICAgICAgY29uc3Qgb2sgPSB0aGlzLl9lbmFibGVEZXB0aExheWVyKGVuYWJsZWQpO1xuICAgICAgICBpZiAoIW9rKSB7XG4gICAgICAgICAgICBEZWJ1Zy53YXJuT25jZSgnQ2FtZXJhQ29tcG9uZW50LnJlcXVlc3RTY2VuZUNvbG9yTWFwIHdhcyBjYWxsZWQsIGJ1dCB0aGUgY2FtZXJhIGRvZXMgbm90IGhhdmUgYSBEZXB0aCBsYXllciwgaWdub3JpbmcuJyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXF1ZXN0IHRoZSBzY2VuZSB0byBnZW5lcmF0ZSBhIHRleHR1cmUgY29udGFpbmluZyB0aGUgc2NlbmUgZGVwdGggbWFwLiBOb3RlIHRoYXQgdGhpcyBjYWxsXG4gICAgICogaXMgYWNjdW11bGF0aXZlLCBhbmQgZm9yIGVhY2ggZW5hYmxlIHJlcXVlc3QsIGEgZGlzYWJsZSByZXF1ZXN0IG5lZWQgdG8gYmUgY2FsbGVkLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtib29sZWFufSBlbmFibGVkIC0gVHJ1ZSB0byByZXF1ZXN0IHRoZSBnZW5lcmF0aW9uLCBmYWxzZSB0byBkaXNhYmxlIGl0LlxuICAgICAqL1xuICAgIHJlcXVlc3RTY2VuZURlcHRoTWFwKGVuYWJsZWQpIHtcbiAgICAgICAgdGhpcy5fcmVuZGVyU2NlbmVEZXB0aE1hcCArPSBlbmFibGVkID8gMSA6IC0xO1xuICAgICAgICBEZWJ1Zy5hc3NlcnQodGhpcy5fcmVuZGVyU2NlbmVEZXB0aE1hcCA+PSAwKTtcbiAgICAgICAgY29uc3Qgb2sgPSB0aGlzLl9lbmFibGVEZXB0aExheWVyKGVuYWJsZWQpO1xuICAgICAgICBpZiAoIW9rKSB7XG4gICAgICAgICAgICBEZWJ1Zy53YXJuT25jZSgnQ2FtZXJhQ29tcG9uZW50LnJlcXVlc3RTY2VuZURlcHRoTWFwIHdhcyBjYWxsZWQsIGJ1dCB0aGUgY2FtZXJhIGRvZXMgbm90IGhhdmUgYSBEZXB0aCBsYXllciwgaWdub3JpbmcuJyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBkaXJ0eUxheWVyQ29tcG9zaXRpb25DYW1lcmFzKCkge1xuICAgICAgICAvLyBsYXllciBjb21wb3NpdGlvbiBuZWVkcyB0byB1cGRhdGUgb3JkZXJcbiAgICAgICAgY29uc3QgbGF5ZXJDb21wID0gdGhpcy5zeXN0ZW0uYXBwLnNjZW5lLmxheWVycztcbiAgICAgICAgbGF5ZXJDb21wLl9kaXJ0eUNhbWVyYXMgPSB0cnVlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENvbnZlcnQgYSBwb2ludCBmcm9tIDJEIHNjcmVlbiBzcGFjZSB0byAzRCB3b3JsZCBzcGFjZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBzY3JlZW54IC0gWCBjb29yZGluYXRlIG9uIFBsYXlDYW52YXMnIGNhbnZhcyBlbGVtZW50LiBTaG91bGQgYmUgaW4gdGhlIHJhbmdlXG4gICAgICogMCB0byBgY2FudmFzLm9mZnNldFdpZHRoYCBvZiB0aGUgYXBwbGljYXRpb24ncyBjYW52YXMgZWxlbWVudC5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gc2NyZWVueSAtIFkgY29vcmRpbmF0ZSBvbiBQbGF5Q2FudmFzJyBjYW52YXMgZWxlbWVudC4gU2hvdWxkIGJlIGluIHRoZSByYW5nZVxuICAgICAqIDAgdG8gYGNhbnZhcy5vZmZzZXRIZWlnaHRgIG9mIHRoZSBhcHBsaWNhdGlvbidzIGNhbnZhcyBlbGVtZW50LlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBjYW1lcmF6IC0gVGhlIGRpc3RhbmNlIGZyb20gdGhlIGNhbWVyYSBpbiB3b3JsZCBzcGFjZSB0byBjcmVhdGUgdGhlIG5ld1xuICAgICAqIHBvaW50LlxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuLi8uLi8uLi9jb3JlL21hdGgvdmVjMy5qcycpLlZlYzN9IFt3b3JsZENvb3JkXSAtIDNEIHZlY3RvciB0byByZWNlaXZlIHdvcmxkXG4gICAgICogY29vcmRpbmF0ZSByZXN1bHQuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiAvLyBHZXQgdGhlIHN0YXJ0IGFuZCBlbmQgcG9pbnRzIG9mIGEgM0QgcmF5IGZpcmVkIGZyb20gYSBzY3JlZW4gY2xpY2sgcG9zaXRpb25cbiAgICAgKiBjb25zdCBzdGFydCA9IGVudGl0eS5jYW1lcmEuc2NyZWVuVG9Xb3JsZChjbGlja1gsIGNsaWNrWSwgZW50aXR5LmNhbWVyYS5uZWFyQ2xpcCk7XG4gICAgICogY29uc3QgZW5kID0gZW50aXR5LmNhbWVyYS5zY3JlZW5Ub1dvcmxkKGNsaWNrWCwgY2xpY2tZLCBlbnRpdHkuY2FtZXJhLmZhckNsaXApO1xuICAgICAqXG4gICAgICogLy8gVXNlIHRoZSByYXkgY29vcmRpbmF0ZXMgdG8gcGVyZm9ybSBhIHJheWNhc3RcbiAgICAgKiBhcHAuc3lzdGVtcy5yaWdpZGJvZHkucmF5Y2FzdEZpcnN0KHN0YXJ0LCBlbmQsIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgKiAgICAgY29uc29sZS5sb2coXCJFbnRpdHkgXCIgKyByZXN1bHQuZW50aXR5Lm5hbWUgKyBcIiB3YXMgc2VsZWN0ZWRcIik7XG4gICAgICogfSk7XG4gICAgICogQHJldHVybnMge2ltcG9ydCgnLi4vLi4vLi4vY29yZS9tYXRoL3ZlYzMuanMnKS5WZWMzfSBUaGUgd29ybGQgc3BhY2UgY29vcmRpbmF0ZS5cbiAgICAgKi9cbiAgICBzY3JlZW5Ub1dvcmxkKHNjcmVlbngsIHNjcmVlbnksIGNhbWVyYXosIHdvcmxkQ29vcmQpIHtcbiAgICAgICAgY29uc3QgZGV2aWNlID0gdGhpcy5zeXN0ZW0uYXBwLmdyYXBoaWNzRGV2aWNlO1xuICAgICAgICBjb25zdCB3ID0gZGV2aWNlLmNsaWVudFJlY3Qud2lkdGg7XG4gICAgICAgIGNvbnN0IGggPSBkZXZpY2UuY2xpZW50UmVjdC5oZWlnaHQ7XG4gICAgICAgIHJldHVybiB0aGlzLl9jYW1lcmEuc2NyZWVuVG9Xb3JsZChzY3JlZW54LCBzY3JlZW55LCBjYW1lcmF6LCB3LCBoLCB3b3JsZENvb3JkKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDb252ZXJ0IGEgcG9pbnQgZnJvbSAzRCB3b3JsZCBzcGFjZSB0byAyRCBzY3JlZW4gc3BhY2UuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi4vLi4vLi4vY29yZS9tYXRoL3ZlYzMuanMnKS5WZWMzfSB3b3JsZENvb3JkIC0gVGhlIHdvcmxkIHNwYWNlIGNvb3JkaW5hdGUuXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4uLy4uLy4uL2NvcmUvbWF0aC92ZWMzLmpzJykuVmVjM30gW3NjcmVlbkNvb3JkXSAtIDNEIHZlY3RvciB0byByZWNlaXZlXG4gICAgICogc2NyZWVuIGNvb3JkaW5hdGUgcmVzdWx0LlxuICAgICAqIEByZXR1cm5zIHtpbXBvcnQoJy4uLy4uLy4uL2NvcmUvbWF0aC92ZWMzLmpzJykuVmVjM30gVGhlIHNjcmVlbiBzcGFjZSBjb29yZGluYXRlLlxuICAgICAqL1xuICAgIHdvcmxkVG9TY3JlZW4od29ybGRDb29yZCwgc2NyZWVuQ29vcmQpIHtcbiAgICAgICAgY29uc3QgZGV2aWNlID0gdGhpcy5zeXN0ZW0uYXBwLmdyYXBoaWNzRGV2aWNlO1xuICAgICAgICBjb25zdCB3ID0gZGV2aWNlLmNsaWVudFJlY3Qud2lkdGg7XG4gICAgICAgIGNvbnN0IGggPSBkZXZpY2UuY2xpZW50UmVjdC5oZWlnaHQ7XG4gICAgICAgIHJldHVybiB0aGlzLl9jYW1lcmEud29ybGRUb1NjcmVlbih3b3JsZENvb3JkLCB3LCBoLCBzY3JlZW5Db29yZCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ2FsbGVkIGJlZm9yZSBhcHBsaWNhdGlvbiByZW5kZXJzIHRoZSBzY2VuZS5cbiAgICAgKlxuICAgICAqIEBpZ25vcmVcbiAgICAgKi9cbiAgICBvbkFwcFByZXJlbmRlcigpIHtcbiAgICAgICAgdGhpcy5fY2FtZXJhLl92aWV3TWF0RGlydHkgPSB0cnVlO1xuICAgICAgICB0aGlzLl9jYW1lcmEuX3ZpZXdQcm9qTWF0RGlydHkgPSB0cnVlO1xuICAgIH1cblxuICAgIC8qKiBAcHJpdmF0ZSAqL1xuICAgIGFkZENhbWVyYVRvTGF5ZXJzKCkge1xuICAgICAgICBjb25zdCBsYXllcnMgPSB0aGlzLmxheWVycztcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBsYXllcnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGNvbnN0IGxheWVyID0gdGhpcy5zeXN0ZW0uYXBwLnNjZW5lLmxheWVycy5nZXRMYXllckJ5SWQobGF5ZXJzW2ldKTtcbiAgICAgICAgICAgIGlmIChsYXllcikge1xuICAgICAgICAgICAgICAgIGxheWVyLmFkZENhbWVyYSh0aGlzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKiBAcHJpdmF0ZSAqL1xuICAgIHJlbW92ZUNhbWVyYUZyb21MYXllcnMoKSB7XG4gICAgICAgIGNvbnN0IGxheWVycyA9IHRoaXMubGF5ZXJzO1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGxheWVycy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgY29uc3QgbGF5ZXIgPSB0aGlzLnN5c3RlbS5hcHAuc2NlbmUubGF5ZXJzLmdldExheWVyQnlJZChsYXllcnNbaV0pO1xuICAgICAgICAgICAgaWYgKGxheWVyKSB7XG4gICAgICAgICAgICAgICAgbGF5ZXIucmVtb3ZlQ2FtZXJhKHRoaXMpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4uLy4uLy4uL3NjZW5lL2NvbXBvc2l0aW9uL2xheWVyLWNvbXBvc2l0aW9uLmpzJykuTGF5ZXJDb21wb3NpdGlvbn0gb2xkQ29tcCAtIE9sZCBsYXllciBjb21wb3NpdGlvbi5cbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi4vLi4vLi4vc2NlbmUvY29tcG9zaXRpb24vbGF5ZXItY29tcG9zaXRpb24uanMnKS5MYXllckNvbXBvc2l0aW9ufSBuZXdDb21wIC0gTmV3IGxheWVyIGNvbXBvc2l0aW9uLlxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgb25MYXllcnNDaGFuZ2VkKG9sZENvbXAsIG5ld0NvbXApIHtcbiAgICAgICAgdGhpcy5hZGRDYW1lcmFUb0xheWVycygpO1xuICAgICAgICBvbGRDb21wLm9mZignYWRkJywgdGhpcy5vbkxheWVyQWRkZWQsIHRoaXMpO1xuICAgICAgICBvbGRDb21wLm9mZigncmVtb3ZlJywgdGhpcy5vbkxheWVyUmVtb3ZlZCwgdGhpcyk7XG4gICAgICAgIG5ld0NvbXAub24oJ2FkZCcsIHRoaXMub25MYXllckFkZGVkLCB0aGlzKTtcbiAgICAgICAgbmV3Q29tcC5vbigncmVtb3ZlJywgdGhpcy5vbkxheWVyUmVtb3ZlZCwgdGhpcyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4uLy4uLy4uL3NjZW5lL2xheWVyLmpzJykuTGF5ZXJ9IGxheWVyIC0gVGhlIGxheWVyIHRvIGFkZCB0aGUgY2FtZXJhIHRvLlxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgb25MYXllckFkZGVkKGxheWVyKSB7XG4gICAgICAgIGNvbnN0IGluZGV4ID0gdGhpcy5sYXllcnMuaW5kZXhPZihsYXllci5pZCk7XG4gICAgICAgIGlmIChpbmRleCA8IDApIHJldHVybjtcbiAgICAgICAgbGF5ZXIuYWRkQ2FtZXJhKHRoaXMpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuLi8uLi8uLi9zY2VuZS9sYXllci5qcycpLkxheWVyfSBsYXllciAtIFRoZSBsYXllciB0byByZW1vdmUgdGhlIGNhbWVyYSBmcm9tLlxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgb25MYXllclJlbW92ZWQobGF5ZXIpIHtcbiAgICAgICAgY29uc3QgaW5kZXggPSB0aGlzLmxheWVycy5pbmRleE9mKGxheWVyLmlkKTtcbiAgICAgICAgaWYgKGluZGV4IDwgMCkgcmV0dXJuO1xuICAgICAgICBsYXllci5yZW1vdmVDYW1lcmEodGhpcyk7XG4gICAgfVxuXG4gICAgb25FbmFibGUoKSB7XG4gICAgICAgIGNvbnN0IHN5c3RlbSA9IHRoaXMuc3lzdGVtO1xuICAgICAgICBjb25zdCBzY2VuZSA9IHN5c3RlbS5hcHAuc2NlbmU7XG4gICAgICAgIGNvbnN0IGxheWVycyA9IHNjZW5lLmxheWVycztcblxuICAgICAgICBzeXN0ZW0uYWRkQ2FtZXJhKHRoaXMpO1xuXG4gICAgICAgIHNjZW5lLm9uKCdzZXQ6bGF5ZXJzJywgdGhpcy5vbkxheWVyc0NoYW5nZWQsIHRoaXMpO1xuICAgICAgICBpZiAobGF5ZXJzKSB7XG4gICAgICAgICAgICBsYXllcnMub24oJ2FkZCcsIHRoaXMub25MYXllckFkZGVkLCB0aGlzKTtcbiAgICAgICAgICAgIGxheWVycy5vbigncmVtb3ZlJywgdGhpcy5vbkxheWVyUmVtb3ZlZCwgdGhpcyk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5lbmFibGVkICYmIHRoaXMuZW50aXR5LmVuYWJsZWQpIHtcbiAgICAgICAgICAgIHRoaXMuYWRkQ2FtZXJhVG9MYXllcnMoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMucG9zdEVmZmVjdHMuZW5hYmxlKCk7XG4gICAgfVxuXG4gICAgb25EaXNhYmxlKCkge1xuICAgICAgICBjb25zdCBzeXN0ZW0gPSB0aGlzLnN5c3RlbTtcbiAgICAgICAgY29uc3Qgc2NlbmUgPSBzeXN0ZW0uYXBwLnNjZW5lO1xuICAgICAgICBjb25zdCBsYXllcnMgPSBzY2VuZS5sYXllcnM7XG5cbiAgICAgICAgdGhpcy5wb3N0RWZmZWN0cy5kaXNhYmxlKCk7XG5cbiAgICAgICAgdGhpcy5yZW1vdmVDYW1lcmFGcm9tTGF5ZXJzKCk7XG5cbiAgICAgICAgc2NlbmUub2ZmKCdzZXQ6bGF5ZXJzJywgdGhpcy5vbkxheWVyc0NoYW5nZWQsIHRoaXMpO1xuICAgICAgICBpZiAobGF5ZXJzKSB7XG4gICAgICAgICAgICBsYXllcnMub2ZmKCdhZGQnLCB0aGlzLm9uTGF5ZXJBZGRlZCwgdGhpcyk7XG4gICAgICAgICAgICBsYXllcnMub2ZmKCdyZW1vdmUnLCB0aGlzLm9uTGF5ZXJSZW1vdmVkLCB0aGlzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHN5c3RlbS5yZW1vdmVDYW1lcmEodGhpcyk7XG4gICAgfVxuXG4gICAgb25SZW1vdmUoKSB7XG4gICAgICAgIHRoaXMub25EaXNhYmxlKCk7XG4gICAgICAgIHRoaXMub2ZmKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ2FsY3VsYXRlcyBhc3BlY3QgcmF0aW8gdmFsdWUgZm9yIGEgZ2l2ZW4gcmVuZGVyIHRhcmdldC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuLi8uLi8uLi9wbGF0Zm9ybS9ncmFwaGljcy9yZW5kZXItdGFyZ2V0LmpzJykuUmVuZGVyVGFyZ2V0fSBbcnRdIC0gT3B0aW9uYWxcbiAgICAgKiByZW5kZXIgdGFyZ2V0LiBJZiB1bnNwZWNpZmllZCwgdGhlIGJhY2tidWZmZXIgaXMgdXNlZC5cbiAgICAgKiBAcmV0dXJucyB7bnVtYmVyfSBUaGUgYXNwZWN0IHJhdGlvIG9mIHRoZSByZW5kZXIgdGFyZ2V0IChvciBiYWNrYnVmZmVyKS5cbiAgICAgKi9cbiAgICBjYWxjdWxhdGVBc3BlY3RSYXRpbyhydCkge1xuICAgICAgICBjb25zdCBkZXZpY2UgPSB0aGlzLnN5c3RlbS5hcHAuZ3JhcGhpY3NEZXZpY2U7XG4gICAgICAgIGNvbnN0IHdpZHRoID0gcnQgPyBydC53aWR0aCA6IGRldmljZS53aWR0aDtcbiAgICAgICAgY29uc3QgaGVpZ2h0ID0gcnQgPyBydC5oZWlnaHQgOiBkZXZpY2UuaGVpZ2h0O1xuICAgICAgICByZXR1cm4gKHdpZHRoICogdGhpcy5yZWN0LnopIC8gKGhlaWdodCAqIHRoaXMucmVjdC53KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBQcmVwYXJlIHRoZSBjYW1lcmEgZm9yIGZyYW1lIHJlbmRlcmluZy5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuLi8uLi8uLi9wbGF0Zm9ybS9ncmFwaGljcy9yZW5kZXItdGFyZ2V0LmpzJykuUmVuZGVyVGFyZ2V0fSBydCAtIFJlbmRlclxuICAgICAqIHRhcmdldCB0byB3aGljaCByZW5kZXJpbmcgd2lsbCBiZSBwZXJmb3JtZWQuIFdpbGwgYWZmZWN0IGNhbWVyYSdzIGFzcGVjdCByYXRpbywgaWZcbiAgICAgKiBhc3BlY3RSYXRpb01vZGUgaXMge0BsaW5rIEFTUEVDVF9BVVRPfS5cbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgZnJhbWVVcGRhdGUocnQpIHtcbiAgICAgICAgaWYgKHRoaXMuYXNwZWN0UmF0aW9Nb2RlID09PSBBU1BFQ1RfQVVUTykge1xuICAgICAgICAgICAgdGhpcy5hc3BlY3RSYXRpbyA9IHRoaXMuY2FsY3VsYXRlQXNwZWN0UmF0aW8ocnQpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQXR0ZW1wdCB0byBzdGFydCBYUiBzZXNzaW9uIHdpdGggdGhpcyBjYW1lcmEuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gdHlwZSAtIFRoZSB0eXBlIG9mIHNlc3Npb24uIENhbiBiZSBvbmUgb2YgdGhlIGZvbGxvd2luZzpcbiAgICAgKlxuICAgICAqIC0ge0BsaW5rIFhSVFlQRV9JTkxJTkV9OiBJbmxpbmUgLSBhbHdheXMgYXZhaWxhYmxlIHR5cGUgb2Ygc2Vzc2lvbi4gSXQgaGFzIGxpbWl0ZWQgZmVhdHVyZVxuICAgICAqIGF2YWlsYWJpbGl0eSBhbmQgaXMgcmVuZGVyZWQgaW50byBIVE1MIGVsZW1lbnQuXG4gICAgICogLSB7QGxpbmsgWFJUWVBFX1ZSfTogSW1tZXJzaXZlIFZSIC0gc2Vzc2lvbiB0aGF0IHByb3ZpZGVzIGV4Y2x1c2l2ZSBhY2Nlc3MgdG8gdGhlIFZSIGRldmljZVxuICAgICAqIHdpdGggdGhlIGJlc3QgYXZhaWxhYmxlIHRyYWNraW5nIGZlYXR1cmVzLlxuICAgICAqIC0ge0BsaW5rIFhSVFlQRV9BUn06IEltbWVyc2l2ZSBBUiAtIHNlc3Npb24gdGhhdCBwcm92aWRlcyBleGNsdXNpdmUgYWNjZXNzIHRvIHRoZSBWUi9BUlxuICAgICAqIGRldmljZSB0aGF0IGlzIGludGVuZGVkIHRvIGJlIGJsZW5kZWQgd2l0aCB0aGUgcmVhbC13b3JsZCBlbnZpcm9ubWVudC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBzcGFjZVR5cGUgLSBSZWZlcmVuY2Ugc3BhY2UgdHlwZS4gQ2FuIGJlIG9uZSBvZiB0aGUgZm9sbG93aW5nOlxuICAgICAqXG4gICAgICogLSB7QGxpbmsgWFJTUEFDRV9WSUVXRVJ9OiBWaWV3ZXIgLSBhbHdheXMgc3VwcG9ydGVkIHNwYWNlIHdpdGggc29tZSBiYXNpYyB0cmFja2luZ1xuICAgICAqIGNhcGFiaWxpdGllcy5cbiAgICAgKiAtIHtAbGluayBYUlNQQUNFX0xPQ0FMfTogTG9jYWwgLSByZXByZXNlbnRzIGEgdHJhY2tpbmcgc3BhY2Ugd2l0aCBhIG5hdGl2ZSBvcmlnaW4gbmVhciB0aGVcbiAgICAgKiB2aWV3ZXIgYXQgdGhlIHRpbWUgb2YgY3JlYXRpb24uIEl0IGlzIG1lYW50IGZvciBzZWF0ZWQgb3IgYmFzaWMgbG9jYWwgWFIgc2Vzc2lvbnMuXG4gICAgICogLSB7QGxpbmsgWFJTUEFDRV9MT0NBTEZMT09SfTogTG9jYWwgRmxvb3IgLSByZXByZXNlbnRzIGEgdHJhY2tpbmcgc3BhY2Ugd2l0aCBhIG5hdGl2ZSBvcmlnaW5cbiAgICAgKiBhdCB0aGUgZmxvb3IgaW4gYSBzYWZlIHBvc2l0aW9uIGZvciB0aGUgdXNlciB0byBzdGFuZC4gVGhlIHktYXhpcyBlcXVhbHMgMCBhdCBmbG9vciBsZXZlbC5cbiAgICAgKiBGbG9vciBsZXZlbCB2YWx1ZSBtaWdodCBiZSBlc3RpbWF0ZWQgYnkgdGhlIHVuZGVybHlpbmcgcGxhdGZvcm0uIEl0IGlzIG1lYW50IGZvciBzZWF0ZWQgb3JcbiAgICAgKiBiYXNpYyBsb2NhbCBYUiBzZXNzaW9ucy5cbiAgICAgKiAtIHtAbGluayBYUlNQQUNFX0JPVU5ERURGTE9PUn06IEJvdW5kZWQgRmxvb3IgLSByZXByZXNlbnRzIGEgdHJhY2tpbmcgc3BhY2Ugd2l0aCBpdHMgbmF0aXZlXG4gICAgICogb3JpZ2luIGF0IHRoZSBmbG9vciwgd2hlcmUgdGhlIHVzZXIgaXMgZXhwZWN0ZWQgdG8gbW92ZSB3aXRoaW4gYSBwcmUtZXN0YWJsaXNoZWQgYm91bmRhcnkuXG4gICAgICogLSB7QGxpbmsgWFJTUEFDRV9VTkJPVU5ERUR9OiBVbmJvdW5kZWQgLSByZXByZXNlbnRzIGEgdHJhY2tpbmcgc3BhY2Ugd2hlcmUgdGhlIHVzZXIgaXNcbiAgICAgKiBleHBlY3RlZCB0byBtb3ZlIGZyZWVseSBhcm91bmQgdGhlaXIgZW52aXJvbm1lbnQsIHBvdGVudGlhbGx5IGxvbmcgZGlzdGFuY2VzIGZyb20gdGhlaXJcbiAgICAgKiBzdGFydGluZyBwb2ludC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7b2JqZWN0fSBbb3B0aW9uc10gLSBPYmplY3Qgd2l0aCBvcHRpb25zIGZvciBYUiBzZXNzaW9uIGluaXRpYWxpemF0aW9uLlxuICAgICAqIEBwYXJhbSB7c3RyaW5nW119IFtvcHRpb25zLm9wdGlvbmFsRmVhdHVyZXNdIC0gT3B0aW9uYWwgZmVhdHVyZXMgZm9yIFhSU2Vzc2lvbiBzdGFydC4gSXQgaXNcbiAgICAgKiB1c2VkIGZvciBnZXR0aW5nIGFjY2VzcyB0byBhZGRpdGlvbmFsIFdlYlhSIHNwZWMgZXh0ZW5zaW9ucy5cbiAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IFtvcHRpb25zLmltYWdlVHJhY2tpbmddIC0gU2V0IHRvIHRydWUgdG8gYXR0ZW1wdCB0byBlbmFibGUge0BsaW5rIFhySW1hZ2VUcmFja2luZ30uXG4gICAgICogQHBhcmFtIHtib29sZWFufSBbb3B0aW9ucy5wbGFuZURldGVjdGlvbl0gLSBTZXQgdG8gdHJ1ZSB0byBhdHRlbXB0IHRvIGVuYWJsZSB7QGxpbmsgWHJQbGFuZURldGVjdGlvbn0uXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4uLy4uL3hyL3hyLW1hbmFnZXIuanMnKS5YckVycm9yQ2FsbGJhY2t9IFtvcHRpb25zLmNhbGxiYWNrXSAtIE9wdGlvbmFsXG4gICAgICogY2FsbGJhY2sgZnVuY3Rpb24gY2FsbGVkIG9uY2UgdGhlIHNlc3Npb24gaXMgc3RhcnRlZC4gVGhlIGNhbGxiYWNrIGhhcyBvbmUgYXJndW1lbnQgRXJyb3IgLVxuICAgICAqIGl0IGlzIG51bGwgaWYgdGhlIFhSIHNlc3Npb24gc3RhcnRlZCBzdWNjZXNzZnVsbHkuXG4gICAgICogQHBhcmFtIHtib29sZWFufSBbb3B0aW9ucy5hbmNob3JzXSAtIE9wdGlvbmFsIGJvb2xlYW4gdG8gYXR0ZW1wdCB0byBlbmFibGUge0BsaW5rIFhyQW5jaG9yc30uXG4gICAgICogQHBhcmFtIHtvYmplY3R9IFtvcHRpb25zLmRlcHRoU2Vuc2luZ10gLSBPcHRpb25hbCBvYmplY3Qgd2l0aCBkZXB0aCBzZW5zaW5nIHBhcmFtZXRlcnMgdG9cbiAgICAgKiBhdHRlbXB0IHRvIGVuYWJsZSB7QGxpbmsgWHJEZXB0aFNlbnNpbmd9LlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBbb3B0aW9ucy5kZXB0aFNlbnNpbmcudXNhZ2VQcmVmZXJlbmNlXSAtIE9wdGlvbmFsIHVzYWdlIHByZWZlcmVuY2UgZm9yIGRlcHRoXG4gICAgICogc2Vuc2luZywgY2FuIGJlICdjcHUtb3B0aW1pemVkJyBvciAnZ3B1LW9wdGltaXplZCcgKFhSREVQVEhTRU5TSU5HVVNBR0VfKiksIGRlZmF1bHRzIHRvXG4gICAgICogJ2NwdS1vcHRpbWl6ZWQnLiBNb3N0IHByZWZlcnJlZCBhbmQgc3VwcG9ydGVkIHdpbGwgYmUgY2hvc2VuIGJ5IHRoZSB1bmRlcmx5aW5nIGRlcHRoIHNlbnNpbmdcbiAgICAgKiBzeXN0ZW0uXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IFtvcHRpb25zLmRlcHRoU2Vuc2luZy5kYXRhRm9ybWF0UHJlZmVyZW5jZV0gLSBPcHRpb25hbCBkYXRhIGZvcm1hdFxuICAgICAqIHByZWZlcmVuY2UgZm9yIGRlcHRoIHNlbnNpbmcuIENhbiBiZSAnbHVtaW5hbmNlLWFscGhhJyBvciAnZmxvYXQzMicgKFhSREVQVEhTRU5TSU5HRk9STUFUXyopLFxuICAgICAqIGRlZmF1bHRzIHRvICdsdW1pbmFuY2UtYWxwaGEnLiBNb3N0IHByZWZlcnJlZCBhbmQgc3VwcG9ydGVkIHdpbGwgYmUgY2hvc2VuIGJ5IHRoZSB1bmRlcmx5aW5nXG4gICAgICogZGVwdGggc2Vuc2luZyBzeXN0ZW0uXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiAvLyBPbiBhbiBlbnRpdHkgd2l0aCBhIGNhbWVyYSBjb21wb25lbnRcbiAgICAgKiB0aGlzLmVudGl0eS5jYW1lcmEuc3RhcnRYcihwYy5YUlRZUEVfVlIsIHBjLlhSU1BBQ0VfTE9DQUwsIHtcbiAgICAgKiAgICAgY2FsbGJhY2s6IGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgKiAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgKiAgICAgICAgICAgICAvLyBmYWlsZWQgdG8gc3RhcnQgWFIgc2Vzc2lvblxuICAgICAqICAgICAgICAgfSBlbHNlIHtcbiAgICAgKiAgICAgICAgICAgICAvLyBpbiBYUlxuICAgICAqICAgICAgICAgfVxuICAgICAqICAgICB9XG4gICAgICogfSk7XG4gICAgICovXG4gICAgc3RhcnRYcih0eXBlLCBzcGFjZVR5cGUsIG9wdGlvbnMpIHtcbiAgICAgICAgdGhpcy5zeXN0ZW0uYXBwLnhyLnN0YXJ0KHRoaXMsIHR5cGUsIHNwYWNlVHlwZSwgb3B0aW9ucyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQXR0ZW1wdCB0byBlbmQgWFIgc2Vzc2lvbiBvZiB0aGlzIGNhbWVyYS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuLi8uLi94ci94ci1tYW5hZ2VyLmpzJykuWHJFcnJvckNhbGxiYWNrfSBbY2FsbGJhY2tdIC0gT3B0aW9uYWwgY2FsbGJhY2tcbiAgICAgKiBmdW5jdGlvbiBjYWxsZWQgb25jZSBzZXNzaW9uIGlzIGVuZGVkLiBUaGUgY2FsbGJhY2sgaGFzIG9uZSBhcmd1bWVudCBFcnJvciAtIGl0IGlzIG51bGwgaWZcbiAgICAgKiBzdWNjZXNzZnVsbHkgZW5kZWQgWFIgc2Vzc2lvbi5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIC8vIE9uIGFuIGVudGl0eSB3aXRoIGEgY2FtZXJhIGNvbXBvbmVudFxuICAgICAqIHRoaXMuZW50aXR5LmNhbWVyYS5lbmRYcihmdW5jdGlvbiAoZXJyKSB7XG4gICAgICogICAgIC8vIG5vdCBhbnltb3JlIGluIFhSXG4gICAgICogfSk7XG4gICAgICovXG4gICAgZW5kWHIoY2FsbGJhY2spIHtcbiAgICAgICAgaWYgKCF0aGlzLl9jYW1lcmEueHIpIHtcbiAgICAgICAgICAgIGlmIChjYWxsYmFjaykgY2FsbGJhY2sobmV3IEVycm9yKCdDYW1lcmEgaXMgbm90IGluIFhSJykpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fY2FtZXJhLnhyLmVuZChjYWxsYmFjayk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRnVuY3Rpb24gdG8gY29weSBwcm9wZXJ0aWVzIGZyb20gdGhlIHNvdXJjZSBDYW1lcmFDb21wb25lbnQuXG4gICAgICogUHJvcGVydGllcyBub3QgY29waWVkOiBwb3N0RWZmZWN0cy5cbiAgICAgKiBJbmhlcml0ZWQgcHJvcGVydGllcyBub3QgY29waWVkIChhbGwpOiBzeXN0ZW0sIGVudGl0eSwgZW5hYmxlZC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7Q2FtZXJhQ29tcG9uZW50fSBzb3VyY2UgLSBUaGUgc291cmNlIGNvbXBvbmVudC5cbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgY29weShzb3VyY2UpIHtcbiAgICAgICAgdGhpcy5hcGVydHVyZSA9IHNvdXJjZS5hcGVydHVyZTtcbiAgICAgICAgdGhpcy5hc3BlY3RSYXRpbyA9IHNvdXJjZS5hc3BlY3RSYXRpbztcbiAgICAgICAgdGhpcy5hc3BlY3RSYXRpb01vZGUgPSBzb3VyY2UuYXNwZWN0UmF0aW9Nb2RlO1xuICAgICAgICB0aGlzLmNhbGN1bGF0ZVByb2plY3Rpb24gPSBzb3VyY2UuY2FsY3VsYXRlUHJvamVjdGlvbjtcbiAgICAgICAgdGhpcy5jYWxjdWxhdGVUcmFuc2Zvcm0gPSBzb3VyY2UuY2FsY3VsYXRlVHJhbnNmb3JtO1xuICAgICAgICB0aGlzLmNsZWFyQ29sb3IgPSBzb3VyY2UuY2xlYXJDb2xvcjtcbiAgICAgICAgdGhpcy5jbGVhckNvbG9yQnVmZmVyID0gc291cmNlLmNsZWFyQ29sb3JCdWZmZXI7XG4gICAgICAgIHRoaXMuY2xlYXJEZXB0aEJ1ZmZlciA9IHNvdXJjZS5jbGVhckRlcHRoQnVmZmVyO1xuICAgICAgICB0aGlzLmNsZWFyU3RlbmNpbEJ1ZmZlciA9IHNvdXJjZS5jbGVhclN0ZW5jaWxCdWZmZXI7XG4gICAgICAgIHRoaXMuY3VsbEZhY2VzID0gc291cmNlLmN1bGxGYWNlcztcbiAgICAgICAgdGhpcy5kaXNhYmxlUG9zdEVmZmVjdHNMYXllciA9IHNvdXJjZS5kaXNhYmxlUG9zdEVmZmVjdHNMYXllcjtcbiAgICAgICAgdGhpcy5mYXJDbGlwID0gc291cmNlLmZhckNsaXA7XG4gICAgICAgIHRoaXMuZmxpcEZhY2VzID0gc291cmNlLmZsaXBGYWNlcztcbiAgICAgICAgdGhpcy5mb3YgPSBzb3VyY2UuZm92O1xuICAgICAgICB0aGlzLmZydXN0dW1DdWxsaW5nID0gc291cmNlLmZydXN0dW1DdWxsaW5nO1xuICAgICAgICB0aGlzLmhvcml6b250YWxGb3YgPSBzb3VyY2UuaG9yaXpvbnRhbEZvdjtcbiAgICAgICAgdGhpcy5sYXllcnMgPSBzb3VyY2UubGF5ZXJzO1xuICAgICAgICB0aGlzLm5lYXJDbGlwID0gc291cmNlLm5lYXJDbGlwO1xuICAgICAgICB0aGlzLm9ydGhvSGVpZ2h0ID0gc291cmNlLm9ydGhvSGVpZ2h0O1xuICAgICAgICB0aGlzLnByaW9yaXR5ID0gc291cmNlLnByaW9yaXR5O1xuICAgICAgICB0aGlzLnByb2plY3Rpb24gPSBzb3VyY2UucHJvamVjdGlvbjtcbiAgICAgICAgdGhpcy5yZWN0ID0gc291cmNlLnJlY3Q7XG4gICAgICAgIHRoaXMucmVuZGVyVGFyZ2V0ID0gc291cmNlLnJlbmRlclRhcmdldDtcbiAgICAgICAgdGhpcy5zY2lzc29yUmVjdCA9IHNvdXJjZS5zY2lzc29yUmVjdDtcbiAgICAgICAgdGhpcy5zZW5zaXRpdml0eSA9IHNvdXJjZS5zZW5zaXRpdml0eTtcbiAgICAgICAgdGhpcy5zaHV0dGVyID0gc291cmNlLnNodXR0ZXI7XG4gICAgfVxufVxuXG5leHBvcnQgeyBDYW1lcmFDb21wb25lbnQgfTtcbiJdLCJuYW1lcyI6WyJDYW1lcmFDb21wb25lbnQiLCJDb21wb25lbnQiLCJjb25zdHJ1Y3RvciIsInN5c3RlbSIsImVudGl0eSIsIm9uUG9zdHByb2Nlc3NpbmciLCJvblByZVJlbmRlciIsIm9uUG9zdFJlbmRlciIsIl9yZW5kZXJTY2VuZURlcHRoTWFwIiwiX3JlbmRlclNjZW5lQ29sb3JNYXAiLCJfc2NlbmVEZXB0aE1hcFJlcXVlc3RlZCIsIl9zY2VuZUNvbG9yTWFwUmVxdWVzdGVkIiwiX3ByaW9yaXR5IiwiX2Rpc2FibGVQb3N0RWZmZWN0c0xheWVyIiwiTEFZRVJJRF9VSSIsIl9jYW1lcmEiLCJDYW1lcmEiLCJub2RlIiwiX3Bvc3RFZmZlY3RzIiwiUG9zdEVmZmVjdFF1ZXVlIiwiYXBwIiwic2V0U2hhZGVyUGFzcyIsIm5hbWUiLCJzaGFkZXJQYXNzIiwiU2hhZGVyUGFzcyIsImdldCIsImdyYXBoaWNzRGV2aWNlIiwic2hhZGVyUGFzc0luZm8iLCJhbGxvY2F0ZSIsImlzRm9yd2FyZCIsImluZGV4IiwiZ2V0U2hhZGVyUGFzcyIsIl90aGlzJF9jYW1lcmEkc2hhZGVyUCIsImFwZXJ0dXJlIiwidmFsdWUiLCJhc3BlY3RSYXRpbyIsImFzcGVjdFJhdGlvTW9kZSIsImNhbGN1bGF0ZVByb2plY3Rpb24iLCJjYWxjdWxhdGVUcmFuc2Zvcm0iLCJjYW1lcmEiLCJjbGVhckNvbG9yIiwiY2xlYXJDb2xvckJ1ZmZlciIsImRpcnR5TGF5ZXJDb21wb3NpdGlvbkNhbWVyYXMiLCJjbGVhckRlcHRoQnVmZmVyIiwiY2xlYXJTdGVuY2lsQnVmZmVyIiwiY3VsbEZhY2VzIiwiZGlzYWJsZVBvc3RFZmZlY3RzTGF5ZXIiLCJsYXllciIsImZhckNsaXAiLCJmbGlwRmFjZXMiLCJmb3YiLCJmcnVzdHVtIiwiZnJ1c3R1bUN1bGxpbmciLCJob3Jpem9udGFsRm92IiwibGF5ZXJzIiwibmV3VmFsdWUiLCJpIiwibGVuZ3RoIiwic2NlbmUiLCJnZXRMYXllckJ5SWQiLCJyZW1vdmVDYW1lcmEiLCJlbmFibGVkIiwiYWRkQ2FtZXJhIiwibGF5ZXJzU2V0IiwibmVhckNsaXAiLCJvcnRob0hlaWdodCIsInBvc3RFZmZlY3RzIiwicG9zdEVmZmVjdHNFbmFibGVkIiwicHJpb3JpdHkiLCJwcm9qZWN0aW9uIiwicHJvamVjdGlvbk1hdHJpeCIsInJlY3QiLCJmaXJlIiwicmVuZGVyU2NlbmVDb2xvck1hcCIsInJlcXVlc3RTY2VuZUNvbG9yTWFwIiwicmVuZGVyU2NlbmVEZXB0aE1hcCIsInJlcXVlc3RTY2VuZURlcHRoTWFwIiwicmVuZGVyVGFyZ2V0Iiwic2Npc3NvclJlY3QiLCJzZW5zaXRpdml0eSIsInNodXR0ZXIiLCJ2aWV3TWF0cml4IiwiX2VuYWJsZURlcHRoTGF5ZXIiLCJoYXNEZXB0aExheWVyIiwiZmluZCIsImxheWVySWQiLCJMQVlFUklEX0RFUFRIIiwiZGVwdGhMYXllciIsImluY3JlbWVudENvdW50ZXIiLCJkZWNyZW1lbnRDb3VudGVyIiwiRGVidWciLCJhc3NlcnQiLCJvayIsIndhcm5PbmNlIiwibGF5ZXJDb21wIiwiX2RpcnR5Q2FtZXJhcyIsInNjcmVlblRvV29ybGQiLCJzY3JlZW54Iiwic2NyZWVueSIsImNhbWVyYXoiLCJ3b3JsZENvb3JkIiwiZGV2aWNlIiwidyIsImNsaWVudFJlY3QiLCJ3aWR0aCIsImgiLCJoZWlnaHQiLCJ3b3JsZFRvU2NyZWVuIiwic2NyZWVuQ29vcmQiLCJvbkFwcFByZXJlbmRlciIsIl92aWV3TWF0RGlydHkiLCJfdmlld1Byb2pNYXREaXJ0eSIsImFkZENhbWVyYVRvTGF5ZXJzIiwicmVtb3ZlQ2FtZXJhRnJvbUxheWVycyIsIm9uTGF5ZXJzQ2hhbmdlZCIsIm9sZENvbXAiLCJuZXdDb21wIiwib2ZmIiwib25MYXllckFkZGVkIiwib25MYXllclJlbW92ZWQiLCJvbiIsImluZGV4T2YiLCJpZCIsIm9uRW5hYmxlIiwiZW5hYmxlIiwib25EaXNhYmxlIiwiZGlzYWJsZSIsIm9uUmVtb3ZlIiwiY2FsY3VsYXRlQXNwZWN0UmF0aW8iLCJydCIsInoiLCJmcmFtZVVwZGF0ZSIsIkFTUEVDVF9BVVRPIiwic3RhcnRYciIsInR5cGUiLCJzcGFjZVR5cGUiLCJvcHRpb25zIiwieHIiLCJzdGFydCIsImVuZFhyIiwiY2FsbGJhY2siLCJFcnJvciIsImVuZCIsImNvcHkiLCJzb3VyY2UiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFVQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxNQUFNQSxlQUFlLFNBQVNDLFNBQVMsQ0FBQztBQTJEcEM7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNJQyxFQUFBQSxXQUFXQSxDQUFDQyxNQUFNLEVBQUVDLE1BQU0sRUFBRTtBQUN4QixJQUFBLEtBQUssQ0FBQ0QsTUFBTSxFQUFFQyxNQUFNLENBQUMsQ0FBQTtBQW5FekI7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0lBTEksSUFNQUMsQ0FBQUEsZ0JBQWdCLEdBQUcsSUFBSSxDQUFBO0FBRXZCO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7SUFKSSxJQUtBQyxDQUFBQSxXQUFXLEdBQUcsSUFBSSxDQUFBO0FBRWxCO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7SUFKSSxJQUtBQyxDQUFBQSxZQUFZLEdBQUcsSUFBSSxDQUFBO0FBRW5CO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtJQUxJLElBTUFDLENBQUFBLG9CQUFvQixHQUFHLENBQUMsQ0FBQTtBQUV4QjtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7SUFMSSxJQU1BQyxDQUFBQSxvQkFBb0IsR0FBRyxDQUFDLENBQUE7QUFFeEI7SUFBQSxJQUNBQyxDQUFBQSx1QkFBdUIsR0FBRyxLQUFLLENBQUE7QUFFL0I7SUFBQSxJQUNBQyxDQUFBQSx1QkFBdUIsR0FBRyxLQUFLLENBQUE7QUFFL0I7SUFBQSxJQUNBQyxDQUFBQSxTQUFTLEdBQUcsQ0FBQyxDQUFBO0FBRWI7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0lBTEksSUFNQUMsQ0FBQUEsd0JBQXdCLEdBQUdDLFVBQVUsQ0FBQTtBQUVyQztBQUFBLElBQUEsSUFBQSxDQUNBQyxPQUFPLEdBQUcsSUFBSUMsTUFBTSxFQUFFLENBQUE7QUFhbEIsSUFBQSxJQUFJLENBQUNELE9BQU8sQ0FBQ0UsSUFBSSxHQUFHYixNQUFNLENBQUE7O0FBRTFCO0lBQ0EsSUFBSSxDQUFDYyxZQUFZLEdBQUcsSUFBSUMsZUFBZSxDQUFDaEIsTUFBTSxDQUFDaUIsR0FBRyxFQUFFLElBQUksQ0FBQyxDQUFBO0FBQzdELEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtFQUNJQyxhQUFhQSxDQUFDQyxJQUFJLEVBQUU7QUFDaEIsSUFBQSxNQUFNQyxVQUFVLEdBQUlDLFVBQVUsQ0FBQ0MsR0FBRyxDQUFDLElBQUksQ0FBQ3RCLE1BQU0sQ0FBQ2lCLEdBQUcsQ0FBQ00sY0FBYyxDQUFDLENBQUE7SUFDbEUsTUFBTUMsY0FBYyxHQUFHTCxJQUFJLEdBQUdDLFVBQVUsQ0FBQ0ssUUFBUSxDQUFDTixJQUFJLEVBQUU7QUFDcERPLE1BQUFBLFNBQVMsRUFBRSxJQUFBO0tBQ2QsQ0FBQyxHQUFHLElBQUksQ0FBQTtBQUNULElBQUEsSUFBSSxDQUFDZCxPQUFPLENBQUNZLGNBQWMsR0FBR0EsY0FBYyxDQUFBO0lBRTVDLE9BQU9BLGNBQWMsQ0FBQ0csS0FBSyxDQUFBO0FBQy9CLEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNJQyxFQUFBQSxhQUFhQSxHQUFHO0FBQUEsSUFBQSxJQUFBQyxxQkFBQSxDQUFBO0lBQ1osT0FBQUEsQ0FBQUEscUJBQUEsR0FBTyxJQUFJLENBQUNqQixPQUFPLENBQUNZLGNBQWMsS0FBQSxJQUFBLEdBQUEsS0FBQSxDQUFBLEdBQTNCSyxxQkFBQSxDQUE2QlYsSUFBSSxDQUFBO0FBQzVDLEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtFQUNJLElBQUlXLFFBQVFBLENBQUNDLEtBQUssRUFBRTtBQUNoQixJQUFBLElBQUksQ0FBQ25CLE9BQU8sQ0FBQ2tCLFFBQVEsR0FBR0MsS0FBSyxDQUFBO0FBQ2pDLEdBQUE7RUFFQSxJQUFJRCxRQUFRQSxHQUFHO0FBQ1gsSUFBQSxPQUFPLElBQUksQ0FBQ2xCLE9BQU8sQ0FBQ2tCLFFBQVEsQ0FBQTtBQUNoQyxHQUFBOztBQUVBO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0VBQ0ksSUFBSUUsV0FBV0EsQ0FBQ0QsS0FBSyxFQUFFO0FBQ25CLElBQUEsSUFBSSxDQUFDbkIsT0FBTyxDQUFDb0IsV0FBVyxHQUFHRCxLQUFLLENBQUE7QUFDcEMsR0FBQTtFQUVBLElBQUlDLFdBQVdBLEdBQUc7QUFDZCxJQUFBLE9BQU8sSUFBSSxDQUFDcEIsT0FBTyxDQUFDb0IsV0FBVyxDQUFBO0FBQ25DLEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtFQUNJLElBQUlDLGVBQWVBLENBQUNGLEtBQUssRUFBRTtBQUN2QixJQUFBLElBQUksQ0FBQ25CLE9BQU8sQ0FBQ3FCLGVBQWUsR0FBR0YsS0FBSyxDQUFBO0FBQ3hDLEdBQUE7RUFFQSxJQUFJRSxlQUFlQSxHQUFHO0FBQ2xCLElBQUEsT0FBTyxJQUFJLENBQUNyQixPQUFPLENBQUNxQixlQUFlLENBQUE7QUFDdkMsR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7RUFDSSxJQUFJQyxtQkFBbUJBLENBQUNILEtBQUssRUFBRTtBQUMzQixJQUFBLElBQUksQ0FBQ25CLE9BQU8sQ0FBQ3NCLG1CQUFtQixHQUFHSCxLQUFLLENBQUE7QUFDNUMsR0FBQTtFQUVBLElBQUlHLG1CQUFtQkEsR0FBRztBQUN0QixJQUFBLE9BQU8sSUFBSSxDQUFDdEIsT0FBTyxDQUFDc0IsbUJBQW1CLENBQUE7QUFDM0MsR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7RUFDSSxJQUFJQyxrQkFBa0JBLENBQUNKLEtBQUssRUFBRTtBQUMxQixJQUFBLElBQUksQ0FBQ25CLE9BQU8sQ0FBQ3VCLGtCQUFrQixHQUFHSixLQUFLLENBQUE7QUFDM0MsR0FBQTtFQUVBLElBQUlJLGtCQUFrQkEsR0FBRztBQUNyQixJQUFBLE9BQU8sSUFBSSxDQUFDdkIsT0FBTyxDQUFDdUIsa0JBQWtCLENBQUE7QUFDMUMsR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7RUFDSSxJQUFJQyxNQUFNQSxHQUFHO0lBQ1QsT0FBTyxJQUFJLENBQUN4QixPQUFPLENBQUE7QUFDdkIsR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7RUFDSSxJQUFJeUIsVUFBVUEsQ0FBQ04sS0FBSyxFQUFFO0FBQ2xCLElBQUEsSUFBSSxDQUFDbkIsT0FBTyxDQUFDeUIsVUFBVSxHQUFHTixLQUFLLENBQUE7QUFDbkMsR0FBQTtFQUVBLElBQUlNLFVBQVVBLEdBQUc7QUFDYixJQUFBLE9BQU8sSUFBSSxDQUFDekIsT0FBTyxDQUFDeUIsVUFBVSxDQUFBO0FBQ2xDLEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtFQUNJLElBQUlDLGdCQUFnQkEsQ0FBQ1AsS0FBSyxFQUFFO0FBQ3hCLElBQUEsSUFBSSxDQUFDbkIsT0FBTyxDQUFDMEIsZ0JBQWdCLEdBQUdQLEtBQUssQ0FBQTtJQUNyQyxJQUFJLENBQUNRLDRCQUE0QixFQUFFLENBQUE7QUFDdkMsR0FBQTtFQUVBLElBQUlELGdCQUFnQkEsR0FBRztBQUNuQixJQUFBLE9BQU8sSUFBSSxDQUFDMUIsT0FBTyxDQUFDMEIsZ0JBQWdCLENBQUE7QUFDeEMsR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0VBQ0ksSUFBSUUsZ0JBQWdCQSxDQUFDVCxLQUFLLEVBQUU7QUFDeEIsSUFBQSxJQUFJLENBQUNuQixPQUFPLENBQUM0QixnQkFBZ0IsR0FBR1QsS0FBSyxDQUFBO0lBQ3JDLElBQUksQ0FBQ1EsNEJBQTRCLEVBQUUsQ0FBQTtBQUN2QyxHQUFBO0VBRUEsSUFBSUMsZ0JBQWdCQSxHQUFHO0FBQ25CLElBQUEsT0FBTyxJQUFJLENBQUM1QixPQUFPLENBQUM0QixnQkFBZ0IsQ0FBQTtBQUN4QyxHQUFBOztBQUVBO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7RUFDSSxJQUFJQyxrQkFBa0JBLENBQUNWLEtBQUssRUFBRTtBQUMxQixJQUFBLElBQUksQ0FBQ25CLE9BQU8sQ0FBQzZCLGtCQUFrQixHQUFHVixLQUFLLENBQUE7SUFDdkMsSUFBSSxDQUFDUSw0QkFBNEIsRUFBRSxDQUFBO0FBQ3ZDLEdBQUE7RUFFQSxJQUFJRSxrQkFBa0JBLEdBQUc7QUFDckIsSUFBQSxPQUFPLElBQUksQ0FBQzdCLE9BQU8sQ0FBQzZCLGtCQUFrQixDQUFBO0FBQzFDLEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0VBQ0ksSUFBSUMsU0FBU0EsQ0FBQ1gsS0FBSyxFQUFFO0FBQ2pCLElBQUEsSUFBSSxDQUFDbkIsT0FBTyxDQUFDOEIsU0FBUyxHQUFHWCxLQUFLLENBQUE7QUFDbEMsR0FBQTtFQUVBLElBQUlXLFNBQVNBLEdBQUc7QUFDWixJQUFBLE9BQU8sSUFBSSxDQUFDOUIsT0FBTyxDQUFDOEIsU0FBUyxDQUFBO0FBQ2pDLEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtFQUNJLElBQUlDLHVCQUF1QkEsQ0FBQ0MsS0FBSyxFQUFFO0lBQy9CLElBQUksQ0FBQ2xDLHdCQUF3QixHQUFHa0MsS0FBSyxDQUFBO0lBQ3JDLElBQUksQ0FBQ0wsNEJBQTRCLEVBQUUsQ0FBQTtBQUN2QyxHQUFBO0VBRUEsSUFBSUksdUJBQXVCQSxHQUFHO0lBQzFCLE9BQU8sSUFBSSxDQUFDakMsd0JBQXdCLENBQUE7QUFDeEMsR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0VBQ0ksSUFBSW1DLE9BQU9BLENBQUNkLEtBQUssRUFBRTtBQUNmLElBQUEsSUFBSSxDQUFDbkIsT0FBTyxDQUFDaUMsT0FBTyxHQUFHZCxLQUFLLENBQUE7QUFDaEMsR0FBQTtFQUVBLElBQUljLE9BQU9BLEdBQUc7QUFDVixJQUFBLE9BQU8sSUFBSSxDQUFDakMsT0FBTyxDQUFDaUMsT0FBTyxDQUFBO0FBQy9CLEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0VBQ0ksSUFBSUMsU0FBU0EsQ0FBQ2YsS0FBSyxFQUFFO0FBQ2pCLElBQUEsSUFBSSxDQUFDbkIsT0FBTyxDQUFDa0MsU0FBUyxHQUFHZixLQUFLLENBQUE7QUFDbEMsR0FBQTtFQUVBLElBQUllLFNBQVNBLEdBQUc7QUFDWixJQUFBLE9BQU8sSUFBSSxDQUFDbEMsT0FBTyxDQUFDa0MsU0FBUyxDQUFBO0FBQ2pDLEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7RUFDSSxJQUFJQyxHQUFHQSxDQUFDaEIsS0FBSyxFQUFFO0FBQ1gsSUFBQSxJQUFJLENBQUNuQixPQUFPLENBQUNtQyxHQUFHLEdBQUdoQixLQUFLLENBQUE7QUFDNUIsR0FBQTtFQUVBLElBQUlnQixHQUFHQSxHQUFHO0FBQ04sSUFBQSxPQUFPLElBQUksQ0FBQ25DLE9BQU8sQ0FBQ21DLEdBQUcsQ0FBQTtBQUMzQixHQUFBOztBQUVBO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7RUFDSSxJQUFJQyxPQUFPQSxHQUFHO0FBQ1YsSUFBQSxPQUFPLElBQUksQ0FBQ3BDLE9BQU8sQ0FBQ29DLE9BQU8sQ0FBQTtBQUMvQixHQUFBOztBQUVBO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0VBQ0ksSUFBSUMsY0FBY0EsQ0FBQ2xCLEtBQUssRUFBRTtBQUN0QixJQUFBLElBQUksQ0FBQ25CLE9BQU8sQ0FBQ3FDLGNBQWMsR0FBR2xCLEtBQUssQ0FBQTtBQUN2QyxHQUFBO0VBRUEsSUFBSWtCLGNBQWNBLEdBQUc7QUFDakIsSUFBQSxPQUFPLElBQUksQ0FBQ3JDLE9BQU8sQ0FBQ3FDLGNBQWMsQ0FBQTtBQUN0QyxHQUFBOztBQUVBO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7RUFDSSxJQUFJQyxhQUFhQSxDQUFDbkIsS0FBSyxFQUFFO0FBQ3JCLElBQUEsSUFBSSxDQUFDbkIsT0FBTyxDQUFDc0MsYUFBYSxHQUFHbkIsS0FBSyxDQUFBO0FBQ3RDLEdBQUE7RUFFQSxJQUFJbUIsYUFBYUEsR0FBRztBQUNoQixJQUFBLE9BQU8sSUFBSSxDQUFDdEMsT0FBTyxDQUFDc0MsYUFBYSxDQUFBO0FBQ3JDLEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7RUFDSSxJQUFJQyxNQUFNQSxDQUFDQyxRQUFRLEVBQUU7QUFDakIsSUFBQSxNQUFNRCxNQUFNLEdBQUcsSUFBSSxDQUFDdkMsT0FBTyxDQUFDdUMsTUFBTSxDQUFBO0FBQ2xDLElBQUEsS0FBSyxJQUFJRSxDQUFDLEdBQUcsQ0FBQyxFQUFFQSxDQUFDLEdBQUdGLE1BQU0sQ0FBQ0csTUFBTSxFQUFFRCxDQUFDLEVBQUUsRUFBRTtBQUNwQyxNQUFBLE1BQU1ULEtBQUssR0FBRyxJQUFJLENBQUM1QyxNQUFNLENBQUNpQixHQUFHLENBQUNzQyxLQUFLLENBQUNKLE1BQU0sQ0FBQ0ssWUFBWSxDQUFDTCxNQUFNLENBQUNFLENBQUMsQ0FBQyxDQUFDLENBQUE7TUFDbEUsSUFBSSxDQUFDVCxLQUFLLEVBQUUsU0FBQTtBQUNaQSxNQUFBQSxLQUFLLENBQUNhLFlBQVksQ0FBQyxJQUFJLENBQUMsQ0FBQTtBQUM1QixLQUFBO0FBRUEsSUFBQSxJQUFJLENBQUM3QyxPQUFPLENBQUN1QyxNQUFNLEdBQUdDLFFBQVEsQ0FBQTtJQUU5QixJQUFJLENBQUMsSUFBSSxDQUFDTSxPQUFPLElBQUksQ0FBQyxJQUFJLENBQUN6RCxNQUFNLENBQUN5RCxPQUFPLEVBQUUsT0FBQTtBQUUzQyxJQUFBLEtBQUssSUFBSUwsQ0FBQyxHQUFHLENBQUMsRUFBRUEsQ0FBQyxHQUFHRCxRQUFRLENBQUNFLE1BQU0sRUFBRUQsQ0FBQyxFQUFFLEVBQUU7QUFDdEMsTUFBQSxNQUFNVCxLQUFLLEdBQUcsSUFBSSxDQUFDNUMsTUFBTSxDQUFDaUIsR0FBRyxDQUFDc0MsS0FBSyxDQUFDSixNQUFNLENBQUNLLFlBQVksQ0FBQ0osUUFBUSxDQUFDQyxDQUFDLENBQUMsQ0FBQyxDQUFBO01BQ3BFLElBQUksQ0FBQ1QsS0FBSyxFQUFFLFNBQUE7QUFDWkEsTUFBQUEsS0FBSyxDQUFDZSxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUE7QUFDekIsS0FBQTtBQUNKLEdBQUE7RUFFQSxJQUFJUixNQUFNQSxHQUFHO0FBQ1QsSUFBQSxPQUFPLElBQUksQ0FBQ3ZDLE9BQU8sQ0FBQ3VDLE1BQU0sQ0FBQTtBQUM5QixHQUFBO0VBRUEsSUFBSVMsU0FBU0EsR0FBRztBQUNaLElBQUEsT0FBTyxJQUFJLENBQUNoRCxPQUFPLENBQUNnRCxTQUFTLENBQUE7QUFDakMsR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0VBQ0ksSUFBSUMsUUFBUUEsQ0FBQzlCLEtBQUssRUFBRTtBQUNoQixJQUFBLElBQUksQ0FBQ25CLE9BQU8sQ0FBQ2lELFFBQVEsR0FBRzlCLEtBQUssQ0FBQTtBQUNqQyxHQUFBO0VBRUEsSUFBSThCLFFBQVFBLEdBQUc7QUFDWCxJQUFBLE9BQU8sSUFBSSxDQUFDakQsT0FBTyxDQUFDaUQsUUFBUSxDQUFBO0FBQ2hDLEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0VBQ0ksSUFBSUMsV0FBV0EsQ0FBQy9CLEtBQUssRUFBRTtBQUNuQixJQUFBLElBQUksQ0FBQ25CLE9BQU8sQ0FBQ2tELFdBQVcsR0FBRy9CLEtBQUssQ0FBQTtBQUNwQyxHQUFBO0VBRUEsSUFBSStCLFdBQVdBLEdBQUc7QUFDZCxJQUFBLE9BQU8sSUFBSSxDQUFDbEQsT0FBTyxDQUFDa0QsV0FBVyxDQUFBO0FBQ25DLEdBQUE7RUFFQSxJQUFJQyxXQUFXQSxHQUFHO0lBQ2QsT0FBTyxJQUFJLENBQUNoRCxZQUFZLENBQUE7QUFDNUIsR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0VBQ0ksSUFBSWlELGtCQUFrQkEsR0FBRztBQUNyQixJQUFBLE9BQU8sSUFBSSxDQUFDakQsWUFBWSxDQUFDMkMsT0FBTyxDQUFBO0FBQ3BDLEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0VBQ0ksSUFBSU8sUUFBUUEsQ0FBQ2IsUUFBUSxFQUFFO0lBQ25CLElBQUksQ0FBQzNDLFNBQVMsR0FBRzJDLFFBQVEsQ0FBQTtJQUN6QixJQUFJLENBQUNiLDRCQUE0QixFQUFFLENBQUE7QUFDdkMsR0FBQTtFQUVBLElBQUkwQixRQUFRQSxHQUFHO0lBQ1gsT0FBTyxJQUFJLENBQUN4RCxTQUFTLENBQUE7QUFDekIsR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7RUFDSSxJQUFJeUQsVUFBVUEsQ0FBQ25DLEtBQUssRUFBRTtBQUNsQixJQUFBLElBQUksQ0FBQ25CLE9BQU8sQ0FBQ3NELFVBQVUsR0FBR25DLEtBQUssQ0FBQTtBQUNuQyxHQUFBO0VBRUEsSUFBSW1DLFVBQVVBLEdBQUc7QUFDYixJQUFBLE9BQU8sSUFBSSxDQUFDdEQsT0FBTyxDQUFDc0QsVUFBVSxDQUFBO0FBQ2xDLEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtFQUNJLElBQUlDLGdCQUFnQkEsR0FBRztBQUNuQixJQUFBLE9BQU8sSUFBSSxDQUFDdkQsT0FBTyxDQUFDdUQsZ0JBQWdCLENBQUE7QUFDeEMsR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7RUFDSSxJQUFJQyxJQUFJQSxDQUFDckMsS0FBSyxFQUFFO0FBQ1osSUFBQSxJQUFJLENBQUNuQixPQUFPLENBQUN3RCxJQUFJLEdBQUdyQyxLQUFLLENBQUE7SUFDekIsSUFBSSxDQUFDc0MsSUFBSSxDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUN6RCxPQUFPLENBQUN3RCxJQUFJLENBQUMsQ0FBQTtBQUM1QyxHQUFBO0VBRUEsSUFBSUEsSUFBSUEsR0FBRztBQUNQLElBQUEsT0FBTyxJQUFJLENBQUN4RCxPQUFPLENBQUN3RCxJQUFJLENBQUE7QUFDNUIsR0FBQTtFQUVBLElBQUlFLG1CQUFtQkEsQ0FBQ3ZDLEtBQUssRUFBRTtBQUMzQixJQUFBLElBQUlBLEtBQUssSUFBSSxDQUFDLElBQUksQ0FBQ3ZCLHVCQUF1QixFQUFFO0FBQ3hDLE1BQUEsSUFBSSxDQUFDK0Qsb0JBQW9CLENBQUMsSUFBSSxDQUFDLENBQUE7TUFDL0IsSUFBSSxDQUFDL0QsdUJBQXVCLEdBQUcsSUFBSSxDQUFBO0FBQ3ZDLEtBQUMsTUFBTSxJQUFJLElBQUksQ0FBQ0EsdUJBQXVCLEVBQUU7QUFDckMsTUFBQSxJQUFJLENBQUMrRCxvQkFBb0IsQ0FBQyxLQUFLLENBQUMsQ0FBQTtNQUNoQyxJQUFJLENBQUMvRCx1QkFBdUIsR0FBRyxLQUFLLENBQUE7QUFDeEMsS0FBQTtBQUNKLEdBQUE7RUFFQSxJQUFJOEQsbUJBQW1CQSxHQUFHO0FBQ3RCLElBQUEsT0FBTyxJQUFJLENBQUNoRSxvQkFBb0IsR0FBRyxDQUFDLENBQUE7QUFDeEMsR0FBQTtFQUVBLElBQUlrRSxtQkFBbUJBLENBQUN6QyxLQUFLLEVBQUU7QUFDM0IsSUFBQSxJQUFJQSxLQUFLLElBQUksQ0FBQyxJQUFJLENBQUN4Qix1QkFBdUIsRUFBRTtBQUN4QyxNQUFBLElBQUksQ0FBQ2tFLG9CQUFvQixDQUFDLElBQUksQ0FBQyxDQUFBO01BQy9CLElBQUksQ0FBQ2xFLHVCQUF1QixHQUFHLElBQUksQ0FBQTtBQUN2QyxLQUFDLE1BQU0sSUFBSSxJQUFJLENBQUNBLHVCQUF1QixFQUFFO0FBQ3JDLE1BQUEsSUFBSSxDQUFDa0Usb0JBQW9CLENBQUMsS0FBSyxDQUFDLENBQUE7TUFDaEMsSUFBSSxDQUFDbEUsdUJBQXVCLEdBQUcsS0FBSyxDQUFBO0FBQ3hDLEtBQUE7QUFDSixHQUFBO0VBRUEsSUFBSWlFLG1CQUFtQkEsR0FBRztBQUN0QixJQUFBLE9BQU8sSUFBSSxDQUFDbkUsb0JBQW9CLEdBQUcsQ0FBQyxDQUFBO0FBQ3hDLEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0VBQ0ksSUFBSXFFLFlBQVlBLENBQUMzQyxLQUFLLEVBQUU7QUFDcEIsSUFBQSxJQUFJLENBQUNuQixPQUFPLENBQUM4RCxZQUFZLEdBQUczQyxLQUFLLENBQUE7SUFDakMsSUFBSSxDQUFDUSw0QkFBNEIsRUFBRSxDQUFBO0FBQ3ZDLEdBQUE7RUFFQSxJQUFJbUMsWUFBWUEsR0FBRztBQUNmLElBQUEsT0FBTyxJQUFJLENBQUM5RCxPQUFPLENBQUM4RCxZQUFZLENBQUE7QUFDcEMsR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7RUFDSSxJQUFJQyxXQUFXQSxDQUFDNUMsS0FBSyxFQUFFO0FBQ25CLElBQUEsSUFBSSxDQUFDbkIsT0FBTyxDQUFDK0QsV0FBVyxHQUFHNUMsS0FBSyxDQUFBO0FBQ3BDLEdBQUE7RUFFQSxJQUFJNEMsV0FBV0EsR0FBRztBQUNkLElBQUEsT0FBTyxJQUFJLENBQUMvRCxPQUFPLENBQUMrRCxXQUFXLENBQUE7QUFDbkMsR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0VBQ0ksSUFBSUMsV0FBV0EsQ0FBQzdDLEtBQUssRUFBRTtBQUNuQixJQUFBLElBQUksQ0FBQ25CLE9BQU8sQ0FBQ2dFLFdBQVcsR0FBRzdDLEtBQUssQ0FBQTtBQUNwQyxHQUFBO0VBRUEsSUFBSTZDLFdBQVdBLEdBQUc7QUFDZCxJQUFBLE9BQU8sSUFBSSxDQUFDaEUsT0FBTyxDQUFDZ0UsV0FBVyxDQUFBO0FBQ25DLEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtFQUNJLElBQUlDLE9BQU9BLENBQUM5QyxLQUFLLEVBQUU7QUFDZixJQUFBLElBQUksQ0FBQ25CLE9BQU8sQ0FBQ2lFLE9BQU8sR0FBRzlDLEtBQUssQ0FBQTtBQUNoQyxHQUFBO0VBRUEsSUFBSThDLE9BQU9BLEdBQUc7QUFDVixJQUFBLE9BQU8sSUFBSSxDQUFDakUsT0FBTyxDQUFDaUUsT0FBTyxDQUFBO0FBQy9CLEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtFQUNJLElBQUlDLFVBQVVBLEdBQUc7QUFDYixJQUFBLE9BQU8sSUFBSSxDQUFDbEUsT0FBTyxDQUFDa0UsVUFBVSxDQUFBO0FBQ2xDLEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtFQUNJQyxpQkFBaUJBLENBQUNoRCxLQUFLLEVBQUU7QUFDckIsSUFBQSxNQUFNaUQsYUFBYSxHQUFHLElBQUksQ0FBQzdCLE1BQU0sQ0FBQzhCLElBQUksQ0FBQ0MsT0FBTyxJQUFJQSxPQUFPLEtBQUtDLGFBQWEsQ0FBQyxDQUFBO0FBQzVFLElBQUEsSUFBSUgsYUFBYSxFQUFFO0FBRWY7QUFDQSxNQUFBLE1BQU1JLFVBQVUsR0FBRyxJQUFJLENBQUNwRixNQUFNLENBQUNpQixHQUFHLENBQUNzQyxLQUFLLENBQUNKLE1BQU0sQ0FBQ0ssWUFBWSxDQUFDMkIsYUFBYSxDQUFDLENBQUE7QUFFM0UsTUFBQSxJQUFJcEQsS0FBSyxFQUFFO0FBQ1BxRCxRQUFBQSxVQUFVLElBQVZBLElBQUFBLEdBQUFBLEtBQUFBLENBQUFBLEdBQUFBLFVBQVUsQ0FBRUMsZ0JBQWdCLEVBQUUsQ0FBQTtBQUNsQyxPQUFDLE1BQU07QUFDSEQsUUFBQUEsVUFBVSxJQUFWQSxJQUFBQSxHQUFBQSxLQUFBQSxDQUFBQSxHQUFBQSxVQUFVLENBQUVFLGdCQUFnQixFQUFFLENBQUE7QUFDbEMsT0FBQTtLQUNILE1BQU0sSUFBSXZELEtBQUssRUFBRTtBQUNkLE1BQUEsT0FBTyxLQUFLLENBQUE7QUFDaEIsS0FBQTtBQUVBLElBQUEsT0FBTyxJQUFJLENBQUE7QUFDZixHQUFBOztBQUVBO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtFQUNJd0Msb0JBQW9CQSxDQUFDYixPQUFPLEVBQUU7SUFDMUIsSUFBSSxDQUFDcEQsb0JBQW9CLElBQUlvRCxPQUFPLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFBO0lBQzdDNkIsS0FBSyxDQUFDQyxNQUFNLENBQUMsSUFBSSxDQUFDbEYsb0JBQW9CLElBQUksQ0FBQyxDQUFDLENBQUE7QUFDNUMsSUFBQSxNQUFNbUYsRUFBRSxHQUFHLElBQUksQ0FBQ1YsaUJBQWlCLENBQUNyQixPQUFPLENBQUMsQ0FBQTtJQUMxQyxJQUFJLENBQUMrQixFQUFFLEVBQUU7QUFDTEYsTUFBQUEsS0FBSyxDQUFDRyxRQUFRLENBQUMsd0dBQXdHLENBQUMsQ0FBQTtBQUM1SCxLQUFBO0FBQ0osR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7RUFDSWpCLG9CQUFvQkEsQ0FBQ2YsT0FBTyxFQUFFO0lBQzFCLElBQUksQ0FBQ3JELG9CQUFvQixJQUFJcUQsT0FBTyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQTtJQUM3QzZCLEtBQUssQ0FBQ0MsTUFBTSxDQUFDLElBQUksQ0FBQ25GLG9CQUFvQixJQUFJLENBQUMsQ0FBQyxDQUFBO0FBQzVDLElBQUEsTUFBTW9GLEVBQUUsR0FBRyxJQUFJLENBQUNWLGlCQUFpQixDQUFDckIsT0FBTyxDQUFDLENBQUE7SUFDMUMsSUFBSSxDQUFDK0IsRUFBRSxFQUFFO0FBQ0xGLE1BQUFBLEtBQUssQ0FBQ0csUUFBUSxDQUFDLHdHQUF3RyxDQUFDLENBQUE7QUFDNUgsS0FBQTtBQUNKLEdBQUE7QUFFQW5ELEVBQUFBLDRCQUE0QkEsR0FBRztBQUMzQjtJQUNBLE1BQU1vRCxTQUFTLEdBQUcsSUFBSSxDQUFDM0YsTUFBTSxDQUFDaUIsR0FBRyxDQUFDc0MsS0FBSyxDQUFDSixNQUFNLENBQUE7SUFDOUN3QyxTQUFTLENBQUNDLGFBQWEsR0FBRyxJQUFJLENBQUE7QUFDbEMsR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtFQUNJQyxhQUFhQSxDQUFDQyxPQUFPLEVBQUVDLE9BQU8sRUFBRUMsT0FBTyxFQUFFQyxVQUFVLEVBQUU7SUFDakQsTUFBTUMsTUFBTSxHQUFHLElBQUksQ0FBQ2xHLE1BQU0sQ0FBQ2lCLEdBQUcsQ0FBQ00sY0FBYyxDQUFBO0FBQzdDLElBQUEsTUFBTTRFLENBQUMsR0FBR0QsTUFBTSxDQUFDRSxVQUFVLENBQUNDLEtBQUssQ0FBQTtBQUNqQyxJQUFBLE1BQU1DLENBQUMsR0FBR0osTUFBTSxDQUFDRSxVQUFVLENBQUNHLE1BQU0sQ0FBQTtBQUNsQyxJQUFBLE9BQU8sSUFBSSxDQUFDM0YsT0FBTyxDQUFDaUYsYUFBYSxDQUFDQyxPQUFPLEVBQUVDLE9BQU8sRUFBRUMsT0FBTyxFQUFFRyxDQUFDLEVBQUVHLENBQUMsRUFBRUwsVUFBVSxDQUFDLENBQUE7QUFDbEYsR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0lPLEVBQUFBLGFBQWFBLENBQUNQLFVBQVUsRUFBRVEsV0FBVyxFQUFFO0lBQ25DLE1BQU1QLE1BQU0sR0FBRyxJQUFJLENBQUNsRyxNQUFNLENBQUNpQixHQUFHLENBQUNNLGNBQWMsQ0FBQTtBQUM3QyxJQUFBLE1BQU00RSxDQUFDLEdBQUdELE1BQU0sQ0FBQ0UsVUFBVSxDQUFDQyxLQUFLLENBQUE7QUFDakMsSUFBQSxNQUFNQyxDQUFDLEdBQUdKLE1BQU0sQ0FBQ0UsVUFBVSxDQUFDRyxNQUFNLENBQUE7QUFDbEMsSUFBQSxPQUFPLElBQUksQ0FBQzNGLE9BQU8sQ0FBQzRGLGFBQWEsQ0FBQ1AsVUFBVSxFQUFFRSxDQUFDLEVBQUVHLENBQUMsRUFBRUcsV0FBVyxDQUFDLENBQUE7QUFDcEUsR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0lDLEVBQUFBLGNBQWNBLEdBQUc7QUFDYixJQUFBLElBQUksQ0FBQzlGLE9BQU8sQ0FBQytGLGFBQWEsR0FBRyxJQUFJLENBQUE7QUFDakMsSUFBQSxJQUFJLENBQUMvRixPQUFPLENBQUNnRyxpQkFBaUIsR0FBRyxJQUFJLENBQUE7QUFDekMsR0FBQTs7QUFFQTtBQUNBQyxFQUFBQSxpQkFBaUJBLEdBQUc7QUFDaEIsSUFBQSxNQUFNMUQsTUFBTSxHQUFHLElBQUksQ0FBQ0EsTUFBTSxDQUFBO0FBQzFCLElBQUEsS0FBSyxJQUFJRSxDQUFDLEdBQUcsQ0FBQyxFQUFFQSxDQUFDLEdBQUdGLE1BQU0sQ0FBQ0csTUFBTSxFQUFFRCxDQUFDLEVBQUUsRUFBRTtBQUNwQyxNQUFBLE1BQU1ULEtBQUssR0FBRyxJQUFJLENBQUM1QyxNQUFNLENBQUNpQixHQUFHLENBQUNzQyxLQUFLLENBQUNKLE1BQU0sQ0FBQ0ssWUFBWSxDQUFDTCxNQUFNLENBQUNFLENBQUMsQ0FBQyxDQUFDLENBQUE7QUFDbEUsTUFBQSxJQUFJVCxLQUFLLEVBQUU7QUFDUEEsUUFBQUEsS0FBSyxDQUFDZSxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUE7QUFDekIsT0FBQTtBQUNKLEtBQUE7QUFDSixHQUFBOztBQUVBO0FBQ0FtRCxFQUFBQSxzQkFBc0JBLEdBQUc7QUFDckIsSUFBQSxNQUFNM0QsTUFBTSxHQUFHLElBQUksQ0FBQ0EsTUFBTSxDQUFBO0FBQzFCLElBQUEsS0FBSyxJQUFJRSxDQUFDLEdBQUcsQ0FBQyxFQUFFQSxDQUFDLEdBQUdGLE1BQU0sQ0FBQ0csTUFBTSxFQUFFRCxDQUFDLEVBQUUsRUFBRTtBQUNwQyxNQUFBLE1BQU1ULEtBQUssR0FBRyxJQUFJLENBQUM1QyxNQUFNLENBQUNpQixHQUFHLENBQUNzQyxLQUFLLENBQUNKLE1BQU0sQ0FBQ0ssWUFBWSxDQUFDTCxNQUFNLENBQUNFLENBQUMsQ0FBQyxDQUFDLENBQUE7QUFDbEUsTUFBQSxJQUFJVCxLQUFLLEVBQUU7QUFDUEEsUUFBQUEsS0FBSyxDQUFDYSxZQUFZLENBQUMsSUFBSSxDQUFDLENBQUE7QUFDNUIsT0FBQTtBQUNKLEtBQUE7QUFDSixHQUFBOztBQUVBO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDSXNELEVBQUFBLGVBQWVBLENBQUNDLE9BQU8sRUFBRUMsT0FBTyxFQUFFO0lBQzlCLElBQUksQ0FBQ0osaUJBQWlCLEVBQUUsQ0FBQTtJQUN4QkcsT0FBTyxDQUFDRSxHQUFHLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQ0MsWUFBWSxFQUFFLElBQUksQ0FBQyxDQUFBO0lBQzNDSCxPQUFPLENBQUNFLEdBQUcsQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDRSxjQUFjLEVBQUUsSUFBSSxDQUFDLENBQUE7SUFDaERILE9BQU8sQ0FBQ0ksRUFBRSxDQUFDLEtBQUssRUFBRSxJQUFJLENBQUNGLFlBQVksRUFBRSxJQUFJLENBQUMsQ0FBQTtJQUMxQ0YsT0FBTyxDQUFDSSxFQUFFLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQ0QsY0FBYyxFQUFFLElBQUksQ0FBQyxDQUFBO0FBQ25ELEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7RUFDSUQsWUFBWUEsQ0FBQ3ZFLEtBQUssRUFBRTtJQUNoQixNQUFNakIsS0FBSyxHQUFHLElBQUksQ0FBQ3dCLE1BQU0sQ0FBQ21FLE9BQU8sQ0FBQzFFLEtBQUssQ0FBQzJFLEVBQUUsQ0FBQyxDQUFBO0lBQzNDLElBQUk1RixLQUFLLEdBQUcsQ0FBQyxFQUFFLE9BQUE7QUFDZmlCLElBQUFBLEtBQUssQ0FBQ2UsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFBO0FBQ3pCLEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7RUFDSXlELGNBQWNBLENBQUN4RSxLQUFLLEVBQUU7SUFDbEIsTUFBTWpCLEtBQUssR0FBRyxJQUFJLENBQUN3QixNQUFNLENBQUNtRSxPQUFPLENBQUMxRSxLQUFLLENBQUMyRSxFQUFFLENBQUMsQ0FBQTtJQUMzQyxJQUFJNUYsS0FBSyxHQUFHLENBQUMsRUFBRSxPQUFBO0FBQ2ZpQixJQUFBQSxLQUFLLENBQUNhLFlBQVksQ0FBQyxJQUFJLENBQUMsQ0FBQTtBQUM1QixHQUFBO0FBRUErRCxFQUFBQSxRQUFRQSxHQUFHO0FBQ1AsSUFBQSxNQUFNeEgsTUFBTSxHQUFHLElBQUksQ0FBQ0EsTUFBTSxDQUFBO0FBQzFCLElBQUEsTUFBTXVELEtBQUssR0FBR3ZELE1BQU0sQ0FBQ2lCLEdBQUcsQ0FBQ3NDLEtBQUssQ0FBQTtBQUM5QixJQUFBLE1BQU1KLE1BQU0sR0FBR0ksS0FBSyxDQUFDSixNQUFNLENBQUE7QUFFM0JuRCxJQUFBQSxNQUFNLENBQUMyRCxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUE7SUFFdEJKLEtBQUssQ0FBQzhELEVBQUUsQ0FBQyxZQUFZLEVBQUUsSUFBSSxDQUFDTixlQUFlLEVBQUUsSUFBSSxDQUFDLENBQUE7QUFDbEQsSUFBQSxJQUFJNUQsTUFBTSxFQUFFO01BQ1JBLE1BQU0sQ0FBQ2tFLEVBQUUsQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDRixZQUFZLEVBQUUsSUFBSSxDQUFDLENBQUE7TUFDekNoRSxNQUFNLENBQUNrRSxFQUFFLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQ0QsY0FBYyxFQUFFLElBQUksQ0FBQyxDQUFBO0FBQ2xELEtBQUE7SUFFQSxJQUFJLElBQUksQ0FBQzFELE9BQU8sSUFBSSxJQUFJLENBQUN6RCxNQUFNLENBQUN5RCxPQUFPLEVBQUU7TUFDckMsSUFBSSxDQUFDbUQsaUJBQWlCLEVBQUUsQ0FBQTtBQUM1QixLQUFBO0FBRUEsSUFBQSxJQUFJLENBQUM5QyxXQUFXLENBQUMwRCxNQUFNLEVBQUUsQ0FBQTtBQUM3QixHQUFBO0FBRUFDLEVBQUFBLFNBQVNBLEdBQUc7QUFDUixJQUFBLE1BQU0xSCxNQUFNLEdBQUcsSUFBSSxDQUFDQSxNQUFNLENBQUE7QUFDMUIsSUFBQSxNQUFNdUQsS0FBSyxHQUFHdkQsTUFBTSxDQUFDaUIsR0FBRyxDQUFDc0MsS0FBSyxDQUFBO0FBQzlCLElBQUEsTUFBTUosTUFBTSxHQUFHSSxLQUFLLENBQUNKLE1BQU0sQ0FBQTtBQUUzQixJQUFBLElBQUksQ0FBQ1ksV0FBVyxDQUFDNEQsT0FBTyxFQUFFLENBQUE7SUFFMUIsSUFBSSxDQUFDYixzQkFBc0IsRUFBRSxDQUFBO0lBRTdCdkQsS0FBSyxDQUFDMkQsR0FBRyxDQUFDLFlBQVksRUFBRSxJQUFJLENBQUNILGVBQWUsRUFBRSxJQUFJLENBQUMsQ0FBQTtBQUNuRCxJQUFBLElBQUk1RCxNQUFNLEVBQUU7TUFDUkEsTUFBTSxDQUFDK0QsR0FBRyxDQUFDLEtBQUssRUFBRSxJQUFJLENBQUNDLFlBQVksRUFBRSxJQUFJLENBQUMsQ0FBQTtNQUMxQ2hFLE1BQU0sQ0FBQytELEdBQUcsQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDRSxjQUFjLEVBQUUsSUFBSSxDQUFDLENBQUE7QUFDbkQsS0FBQTtBQUVBcEgsSUFBQUEsTUFBTSxDQUFDeUQsWUFBWSxDQUFDLElBQUksQ0FBQyxDQUFBO0FBQzdCLEdBQUE7QUFFQW1FLEVBQUFBLFFBQVFBLEdBQUc7SUFDUCxJQUFJLENBQUNGLFNBQVMsRUFBRSxDQUFBO0lBQ2hCLElBQUksQ0FBQ1IsR0FBRyxFQUFFLENBQUE7QUFDZCxHQUFBOztBQUVBO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0VBQ0lXLG9CQUFvQkEsQ0FBQ0MsRUFBRSxFQUFFO0lBQ3JCLE1BQU01QixNQUFNLEdBQUcsSUFBSSxDQUFDbEcsTUFBTSxDQUFDaUIsR0FBRyxDQUFDTSxjQUFjLENBQUE7SUFDN0MsTUFBTThFLEtBQUssR0FBR3lCLEVBQUUsR0FBR0EsRUFBRSxDQUFDekIsS0FBSyxHQUFHSCxNQUFNLENBQUNHLEtBQUssQ0FBQTtJQUMxQyxNQUFNRSxNQUFNLEdBQUd1QixFQUFFLEdBQUdBLEVBQUUsQ0FBQ3ZCLE1BQU0sR0FBR0wsTUFBTSxDQUFDSyxNQUFNLENBQUE7QUFDN0MsSUFBQSxPQUFRRixLQUFLLEdBQUcsSUFBSSxDQUFDakMsSUFBSSxDQUFDMkQsQ0FBQyxJQUFLeEIsTUFBTSxHQUFHLElBQUksQ0FBQ25DLElBQUksQ0FBQytCLENBQUMsQ0FBQyxDQUFBO0FBQ3pELEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtFQUNJNkIsV0FBV0EsQ0FBQ0YsRUFBRSxFQUFFO0FBQ1osSUFBQSxJQUFJLElBQUksQ0FBQzdGLGVBQWUsS0FBS2dHLFdBQVcsRUFBRTtNQUN0QyxJQUFJLENBQUNqRyxXQUFXLEdBQUcsSUFBSSxDQUFDNkYsb0JBQW9CLENBQUNDLEVBQUUsQ0FBQyxDQUFBO0FBQ3BELEtBQUE7QUFDSixHQUFBOztBQUVBO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDSUksRUFBQUEsT0FBT0EsQ0FBQ0MsSUFBSSxFQUFFQyxTQUFTLEVBQUVDLE9BQU8sRUFBRTtBQUM5QixJQUFBLElBQUksQ0FBQ3JJLE1BQU0sQ0FBQ2lCLEdBQUcsQ0FBQ3FILEVBQUUsQ0FBQ0MsS0FBSyxDQUFDLElBQUksRUFBRUosSUFBSSxFQUFFQyxTQUFTLEVBQUVDLE9BQU8sQ0FBQyxDQUFBO0FBQzVELEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0VBQ0lHLEtBQUtBLENBQUNDLFFBQVEsRUFBRTtBQUNaLElBQUEsSUFBSSxDQUFDLElBQUksQ0FBQzdILE9BQU8sQ0FBQzBILEVBQUUsRUFBRTtNQUNsQixJQUFJRyxRQUFRLEVBQUVBLFFBQVEsQ0FBQyxJQUFJQyxLQUFLLENBQUMscUJBQXFCLENBQUMsQ0FBQyxDQUFBO0FBQ3hELE1BQUEsT0FBQTtBQUNKLEtBQUE7SUFFQSxJQUFJLENBQUM5SCxPQUFPLENBQUMwSCxFQUFFLENBQUNLLEdBQUcsQ0FBQ0YsUUFBUSxDQUFDLENBQUE7QUFDakMsR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0VBQ0lHLElBQUlBLENBQUNDLE1BQU0sRUFBRTtBQUNULElBQUEsSUFBSSxDQUFDL0csUUFBUSxHQUFHK0csTUFBTSxDQUFDL0csUUFBUSxDQUFBO0FBQy9CLElBQUEsSUFBSSxDQUFDRSxXQUFXLEdBQUc2RyxNQUFNLENBQUM3RyxXQUFXLENBQUE7QUFDckMsSUFBQSxJQUFJLENBQUNDLGVBQWUsR0FBRzRHLE1BQU0sQ0FBQzVHLGVBQWUsQ0FBQTtBQUM3QyxJQUFBLElBQUksQ0FBQ0MsbUJBQW1CLEdBQUcyRyxNQUFNLENBQUMzRyxtQkFBbUIsQ0FBQTtBQUNyRCxJQUFBLElBQUksQ0FBQ0Msa0JBQWtCLEdBQUcwRyxNQUFNLENBQUMxRyxrQkFBa0IsQ0FBQTtBQUNuRCxJQUFBLElBQUksQ0FBQ0UsVUFBVSxHQUFHd0csTUFBTSxDQUFDeEcsVUFBVSxDQUFBO0FBQ25DLElBQUEsSUFBSSxDQUFDQyxnQkFBZ0IsR0FBR3VHLE1BQU0sQ0FBQ3ZHLGdCQUFnQixDQUFBO0FBQy9DLElBQUEsSUFBSSxDQUFDRSxnQkFBZ0IsR0FBR3FHLE1BQU0sQ0FBQ3JHLGdCQUFnQixDQUFBO0FBQy9DLElBQUEsSUFBSSxDQUFDQyxrQkFBa0IsR0FBR29HLE1BQU0sQ0FBQ3BHLGtCQUFrQixDQUFBO0FBQ25ELElBQUEsSUFBSSxDQUFDQyxTQUFTLEdBQUdtRyxNQUFNLENBQUNuRyxTQUFTLENBQUE7QUFDakMsSUFBQSxJQUFJLENBQUNDLHVCQUF1QixHQUFHa0csTUFBTSxDQUFDbEcsdUJBQXVCLENBQUE7QUFDN0QsSUFBQSxJQUFJLENBQUNFLE9BQU8sR0FBR2dHLE1BQU0sQ0FBQ2hHLE9BQU8sQ0FBQTtBQUM3QixJQUFBLElBQUksQ0FBQ0MsU0FBUyxHQUFHK0YsTUFBTSxDQUFDL0YsU0FBUyxDQUFBO0FBQ2pDLElBQUEsSUFBSSxDQUFDQyxHQUFHLEdBQUc4RixNQUFNLENBQUM5RixHQUFHLENBQUE7QUFDckIsSUFBQSxJQUFJLENBQUNFLGNBQWMsR0FBRzRGLE1BQU0sQ0FBQzVGLGNBQWMsQ0FBQTtBQUMzQyxJQUFBLElBQUksQ0FBQ0MsYUFBYSxHQUFHMkYsTUFBTSxDQUFDM0YsYUFBYSxDQUFBO0FBQ3pDLElBQUEsSUFBSSxDQUFDQyxNQUFNLEdBQUcwRixNQUFNLENBQUMxRixNQUFNLENBQUE7QUFDM0IsSUFBQSxJQUFJLENBQUNVLFFBQVEsR0FBR2dGLE1BQU0sQ0FBQ2hGLFFBQVEsQ0FBQTtBQUMvQixJQUFBLElBQUksQ0FBQ0MsV0FBVyxHQUFHK0UsTUFBTSxDQUFDL0UsV0FBVyxDQUFBO0FBQ3JDLElBQUEsSUFBSSxDQUFDRyxRQUFRLEdBQUc0RSxNQUFNLENBQUM1RSxRQUFRLENBQUE7QUFDL0IsSUFBQSxJQUFJLENBQUNDLFVBQVUsR0FBRzJFLE1BQU0sQ0FBQzNFLFVBQVUsQ0FBQTtBQUNuQyxJQUFBLElBQUksQ0FBQ0UsSUFBSSxHQUFHeUUsTUFBTSxDQUFDekUsSUFBSSxDQUFBO0FBQ3ZCLElBQUEsSUFBSSxDQUFDTSxZQUFZLEdBQUdtRSxNQUFNLENBQUNuRSxZQUFZLENBQUE7QUFDdkMsSUFBQSxJQUFJLENBQUNDLFdBQVcsR0FBR2tFLE1BQU0sQ0FBQ2xFLFdBQVcsQ0FBQTtBQUNyQyxJQUFBLElBQUksQ0FBQ0MsV0FBVyxHQUFHaUUsTUFBTSxDQUFDakUsV0FBVyxDQUFBO0FBQ3JDLElBQUEsSUFBSSxDQUFDQyxPQUFPLEdBQUdnRSxNQUFNLENBQUNoRSxPQUFPLENBQUE7QUFDakMsR0FBQTtBQUNKOzs7OyJ9
