import { Debug } from '../core/debug.js';
import { EventHandler } from '../core/event-handler.js';
import { Color } from '../core/math/color.js';
import { Vec3 } from '../core/math/vec3.js';
import { Quat } from '../core/math/quat.js';
import { math } from '../core/math/math.js';
import { Mat3 } from '../core/math/mat3.js';
import { Mat4 } from '../core/math/mat4.js';
import { GraphicsDeviceAccess } from '../platform/graphics/graphics-device-access.js';
import { ADDRESS_CLAMP_TO_EDGE, FILTER_LINEAR, PIXELFORMAT_RGBA8 } from '../platform/graphics/constants.js';
import { BAKE_COLORDIR, FOG_NONE, GAMMA_SRGB, LAYERID_IMMEDIATE } from './constants.js';
import { Sky } from './sky.js';
import { LightingParams } from './lighting/lighting-params.js';
import { Immediate } from './immediate/immediate.js';
import { EnvLighting } from './graphics/env-lighting.js';

/**
 * A scene is graphical representation of an environment. It manages the scene hierarchy, all
 * graphical objects, lights, and scene-wide properties.
 *
 * @augments EventHandler
 * @category Graphics
 */
class Scene extends EventHandler {
  /**
   * Create a new Scene instance.
   *
   * @param {import('../platform/graphics/graphics-device.js').GraphicsDevice} graphicsDevice -
   * The graphics device used to manage this scene.
   * @hideconstructor
   */
  constructor(graphicsDevice) {
    super();
    /**
     * If enabled, the ambient lighting will be baked into lightmaps. This will be either the
     * {@link Scene#skybox} if set up, otherwise {@link Scene#ambientLight}. Defaults to false.
     *
     * @type {boolean}
     */
    this.ambientBake = false;
    /**
     * If {@link Scene#ambientBake} is true, this specifies the brightness of ambient occlusion.
     * Typical range is -1 to 1. Defaults to 0, representing no change to brightness.
     *
     * @type {number}
     */
    this.ambientBakeOcclusionBrightness = 0;
    /**
     * If {@link Scene#ambientBake} is true, this specifies the contrast of ambient occlusion.
     * Typical range is -1 to 1. Defaults to 0, representing no change to contrast.
     *
     * @type {number}
     */
    this.ambientBakeOcclusionContrast = 0;
    /**
     * The color of the scene's ambient light. Defaults to black (0, 0, 0).
     *
     * @type {Color}
     */
    this.ambientLight = new Color(0, 0, 0);
    /**
     * The luminosity of the scene's ambient light in lux (lm/m^2). Used if physicalUnits is true. Defaults to 0.
     *
     * @type {number}
     */
    this.ambientLuminance = 0;
    /**
     * The exposure value tweaks the overall brightness of the scene. Ignored if physicalUnits is true. Defaults to 1.
     *
     * @type {number}
     */
    this.exposure = 1;
    /**
     * The color of the fog (if enabled). Defaults to black (0, 0, 0).
     *
     * @type {Color}
     */
    this.fogColor = new Color(0, 0, 0);
    /**
     * The density of the fog (if enabled). This property is only valid if the fog property is set
     * to {@link FOG_EXP} or {@link FOG_EXP2}. Defaults to 0.
     *
     * @type {number}
     */
    this.fogDensity = 0;
    /**
     * The distance from the viewpoint where linear fog reaches its maximum. This property is only
     * valid if the fog property is set to {@link FOG_LINEAR}. Defaults to 1000.
     *
     * @type {number}
     */
    this.fogEnd = 1000;
    /**
     * The distance from the viewpoint where linear fog begins. This property is only valid if the
     * fog property is set to {@link FOG_LINEAR}. Defaults to 1.
     *
     * @type {number}
     */
    this.fogStart = 1;
    /**
     * The lightmap resolution multiplier. Defaults to 1.
     *
     * @type {number}
     */
    this.lightmapSizeMultiplier = 1;
    /**
     * The maximum lightmap resolution. Defaults to 2048.
     *
     * @type {number}
     */
    this.lightmapMaxResolution = 2048;
    /**
     * The lightmap baking mode. Can be:
     *
     * - {@link BAKE_COLOR}: single color lightmap
     * - {@link BAKE_COLORDIR}: single color lightmap + dominant light direction (used for bump or
     * specular). Only lights with bakeDir=true will be used for generating the dominant light
     * direction.
     *
     * Defaults to {@link BAKE_COLORDIR}.
     *
     * @type {number}
     */
    this.lightmapMode = BAKE_COLORDIR;
    /**
     * Enables bilateral filter on runtime baked color lightmaps, which removes the noise and
     * banding while preserving the edges. Defaults to false. Note that the filtering takes place
     * in the image space of the lightmap, and it does not filter across lightmap UV space seams,
     * often making the seams more visible. It's important to balance the strength of the filter
     * with number of samples used for lightmap baking to limit the visible artifacts.
     *
     * @type {boolean}
     */
    this.lightmapFilterEnabled = false;
    /**
     * Enables HDR lightmaps. This can result in smoother lightmaps especially when many samples
     * are used. Defaults to false.
     *
     * @type {boolean}
     */
    this.lightmapHDR = false;
    /**
     * The root entity of the scene, which is usually the only child to the {@link Application}
     * root entity.
     *
     * @type {import('../framework/entity.js').Entity}
     */
    this.root = null;
    /**
     * The sky of the scene.
     *
     * @type {Sky}
     * @ignore
     */
    this.sky = null;
    /**
     * Use physically based units for cameras and lights. When used, the exposure value is ignored.
     *
     * @type {boolean}
     */
    this.physicalUnits = false;
    Debug.assertDeprecated(graphicsDevice, "Scene constructor takes a GraphicsDevice as a parameter, and it was not provided.");
    this.device = graphicsDevice || GraphicsDeviceAccess.get();
    this._gravity = new Vec3(0, -9.8, 0);

    /**
     * @type {import('./composition/layer-composition.js').LayerComposition}
     * @private
     */
    this._layers = null;
    this._fog = FOG_NONE;
    this._gammaCorrection = GAMMA_SRGB;
    this._toneMapping = 0;

    /**
     * The skybox cubemap as set by user (gets used when skyboxMip === 0)
     *
     * @type {import('../platform/graphics/texture.js').Texture}
     * @private
     */
    this._skyboxCubeMap = null;

    /**
     * Array of 6 prefiltered lighting data cubemaps.
     *
     * @type {import('../platform/graphics/texture.js').Texture[]}
     * @private
     */
    this._prefilteredCubemaps = [];

    /**
     * Environment lighting atlas
     *
     * @type {import('../platform/graphics/texture.js').Texture}
     * @private
     */
    this._envAtlas = null;

    // internally generated envAtlas owned by the scene
    this._internalEnvAtlas = null;
    this._skyboxIntensity = 1;
    this._skyboxLuminance = 0;
    this._skyboxMip = 0;
    this._skyboxRotationShaderInclude = false;
    this._skyboxRotation = new Quat();
    this._skyboxRotationMat3 = new Mat3();
    this._skyboxRotationMat4 = new Mat4();

    // ambient light lightmapping properties
    this._ambientBakeNumSamples = 1;
    this._ambientBakeSpherePart = 0.4;
    this._lightmapFilterRange = 10;
    this._lightmapFilterSmoothness = 0.2;

    // clustered lighting
    this._clusteredLightingEnabled = true;
    this._lightingParams = new LightingParams(this.device.supportsAreaLights, this.device.maxTextureSize, () => {
      this.updateShaders = true;
    });
    this._stats = {
      meshInstances: 0,
      lights: 0,
      dynamicLights: 0,
      bakedLights: 0,
      updateShadersTime: 0 // deprecated
    };

    /**
     * This flag indicates changes were made to the scene which may require recompilation of
     * shaders that reference global settings.
     *
     * @type {boolean}
     * @ignore
     */
    this.updateShaders = true;
    this._shaderVersion = 0;

    // immediate rendering
    this.immediate = new Immediate(this.device);
  }

  /**
   * Fired when the skybox is set.
   *
   * @event Scene#set:skybox
   * @param {import('../platform/graphics/texture.js').Texture} usedTex - Previously used cubemap
   * texture. New is in the {@link Scene#skybox}.
   */

  /**
   * Fired when the layer composition is set. Use this event to add callbacks or advanced
   * properties to your layers.
   *
   * @event Scene#set:layers
   * @param {import('./composition/layer-composition.js').LayerComposition} oldComp - Previously
   * used {@link LayerComposition}.
   * @param {import('./composition/layer-composition.js').LayerComposition} newComp - Newly set
   * {@link LayerComposition}.
   * @example
   * this.app.scene.on('set:layers', function (oldComp, newComp) {
   *     const list = newComp.layerList;
   *     for (let i = 0; i < list.length; i++) {
   *         const layer = list[i];
   *         switch (layer.name) {
   *             case 'MyLayer':
   *                 layer.onEnable = myOnEnableFunction;
   *                 layer.onDisable = myOnDisableFunction;
   *                 break;
   *             case 'MyOtherLayer':
   *                 layer.shaderPass = myShaderPass;
   *                 break;
   *         }
   *     }
   * });
   */

  /**
   * Returns the default layer used by the immediate drawing functions.
   *
   * @type {import('./layer.js').Layer}
   * @private
   */
  get defaultDrawLayer() {
    return this.layers.getLayerById(LAYERID_IMMEDIATE);
  }

  /**
   * If {@link Scene#ambientBake} is true, this specifies the number of samples used to bake the
   * ambient light into the lightmap. Defaults to 1. Maximum value is 255.
   *
   * @type {number}
   */
  set ambientBakeNumSamples(value) {
    this._ambientBakeNumSamples = math.clamp(Math.floor(value), 1, 255);
  }
  get ambientBakeNumSamples() {
    return this._ambientBakeNumSamples;
  }

  /**
   * If {@link Scene#ambientBake} is true, this specifies a part of the sphere which represents
   * the source of ambient light. The valid range is 0..1, representing a part of the sphere from
   * top to the bottom. A value of 0.5 represents the upper hemisphere. A value of 1 represents a
   * full sphere. Defaults to 0.4, which is a smaller upper hemisphere as this requires fewer
   * samples to bake.
   *
   * @type {number}
   */
  set ambientBakeSpherePart(value) {
    this._ambientBakeSpherePart = math.clamp(value, 0.001, 1);
  }
  get ambientBakeSpherePart() {
    return this._ambientBakeSpherePart;
  }

  /**
   * True if the clustered lighting is enabled. Set to false before the first frame is rendered
   * to use non-clustered lighting. Defaults to true.
   *
   * @type {boolean}
   */
  set clusteredLightingEnabled(value) {
    if (this.device.isWebGPU && !value) {
      Debug.warnOnce('WebGPU currently only supports clustered lighting, and this cannot be disabled.');
      return;
    }
    if (!this._clusteredLightingEnabled && value) {
      console.error('Turning on disabled clustered lighting is not currently supported');
      return;
    }
    this._clusteredLightingEnabled = value;
  }
  get clusteredLightingEnabled() {
    return this._clusteredLightingEnabled;
  }

  /**
   * The environment lighting atlas.
   *
   * @type {import('../platform/graphics/texture.js').Texture}
   */
  set envAtlas(value) {
    if (value !== this._envAtlas) {
      this._envAtlas = value;

      // make sure required options are set up on the texture
      if (value) {
        value.addressU = ADDRESS_CLAMP_TO_EDGE;
        value.addressV = ADDRESS_CLAMP_TO_EDGE;
        value.minFilter = FILTER_LINEAR;
        value.magFilter = FILTER_LINEAR;
        value.mipmaps = false;
      }
      this._prefilteredCubemaps = [];
      if (this._internalEnvAtlas) {
        this._internalEnvAtlas.destroy();
        this._internalEnvAtlas = null;
      }
      this._resetSky();
    }
  }
  get envAtlas() {
    return this._envAtlas;
  }

  /**
   * The type of fog used by the scene. Can be:
   *
   * - {@link FOG_NONE}
   * - {@link FOG_LINEAR}
   * - {@link FOG_EXP}
   * - {@link FOG_EXP2}
   *
   * Defaults to {@link FOG_NONE}.
   *
   * @type {string}
   */
  set fog(type) {
    if (type !== this._fog) {
      this._fog = type;
      this.updateShaders = true;
    }
  }
  get fog() {
    return this._fog;
  }

  /**
   * The gamma correction to apply when rendering the scene. Can be:
   *
   * - {@link GAMMA_NONE}
   * - {@link GAMMA_SRGB}
   *
   * Defaults to {@link GAMMA_SRGB}.
   *
   * @type {number}
   */
  set gammaCorrection(value) {
    if (value !== this._gammaCorrection) {
      this._gammaCorrection = value;
      this.updateShaders = true;
    }
  }
  get gammaCorrection() {
    return this._gammaCorrection;
  }

  /**
   * A {@link LayerComposition} that defines rendering order of this scene.
   *
   * @type {import('./composition/layer-composition.js').LayerComposition}
   */
  set layers(layers) {
    const prev = this._layers;
    this._layers = layers;
    this.fire('set:layers', prev, layers);
  }
  get layers() {
    return this._layers;
  }

  /**
   * A {@link LightingParams} that defines lighting parameters.
   *
   * @type {LightingParams}
   */
  get lighting() {
    return this._lightingParams;
  }

  /**
   * A range parameter of the bilateral filter. It's used when {@link Scene#lightmapFilterEnabled}
   * is enabled. Larger value applies more widespread blur. This needs to be a positive non-zero
   * value. Defaults to 10.
   *
   * @type {number}
   */
  set lightmapFilterRange(value) {
    this._lightmapFilterRange = Math.max(value, 0.001);
  }
  get lightmapFilterRange() {
    return this._lightmapFilterRange;
  }

  /**
   * A spatial parameter of the bilateral filter. It's used when {@link Scene#lightmapFilterEnabled}
   * is enabled. Larger value blurs less similar colors. This needs to be a positive non-zero
   * value. Defaults to 0.2.
   *
   * @type {number}
   */
  set lightmapFilterSmoothness(value) {
    this._lightmapFilterSmoothness = Math.max(value, 0.001);
  }
  get lightmapFilterSmoothness() {
    return this._lightmapFilterSmoothness;
  }

  /**
   * Set of 6 prefiltered cubemaps.
   *
   * @type {import('../platform/graphics/texture.js').Texture[]}
   */
  set prefilteredCubemaps(value) {
    value = value || [];
    const cubemaps = this._prefilteredCubemaps;
    const changed = cubemaps.length !== value.length || cubemaps.some((c, i) => c !== value[i]);
    if (changed) {
      const complete = value.length === 6 && value.every(c => !!c);
      if (complete) {
        // update env atlas
        this._internalEnvAtlas = EnvLighting.generatePrefilteredAtlas(value, {
          target: this._internalEnvAtlas
        });
        this._envAtlas = this._internalEnvAtlas;
      } else {
        if (this._internalEnvAtlas) {
          this._internalEnvAtlas.destroy();
          this._internalEnvAtlas = null;
        }
        this._envAtlas = null;
      }
      this._prefilteredCubemaps = value.slice();
      this._resetSky();
    }
  }
  get prefilteredCubemaps() {
    return this._prefilteredCubemaps;
  }

  /**
   * The base cubemap texture used as the scene's skybox, if mip level is 0. Defaults to null.
   *
   * @type {import('../platform/graphics/texture.js').Texture}
   */
  set skybox(value) {
    if (value !== this._skyboxCubeMap) {
      this._skyboxCubeMap = value;
      this._resetSky();
    }
  }
  get skybox() {
    return this._skyboxCubeMap;
  }

  /**
   * Multiplier for skybox intensity. Defaults to 1. Unused if physical units are used.
   *
   * @type {number}
   */
  set skyboxIntensity(value) {
    if (value !== this._skyboxIntensity) {
      this._skyboxIntensity = value;
      this._resetSky();
    }
  }
  get skyboxIntensity() {
    return this._skyboxIntensity;
  }

  /**
   * Luminance (in lm/m^2) of skybox. Defaults to 0. Only used if physical units are used.
   *
   * @type {number}
   */
  set skyboxLuminance(value) {
    if (value !== this._skyboxLuminance) {
      this._skyboxLuminance = value;
      this._resetSky();
    }
  }
  get skyboxLuminance() {
    return this._skyboxLuminance;
  }

  /**
   * The mip level of the skybox to be displayed. Only valid for prefiltered cubemap skyboxes.
   * Defaults to 0 (base level).
   *
   * @type {number}
   */
  set skyboxMip(value) {
    if (value !== this._skyboxMip) {
      this._skyboxMip = value;
      this._resetSky();
    }
  }
  get skyboxMip() {
    return this._skyboxMip;
  }

  /**
   * The rotation of the skybox to be displayed. Defaults to {@link Quat.IDENTITY}.
   *
   * @type {Quat}
   */
  set skyboxRotation(value) {
    if (!this._skyboxRotation.equals(value)) {
      const isIdentity = value.equals(Quat.IDENTITY);
      this._skyboxRotation.copy(value);
      if (isIdentity) {
        this._skyboxRotationMat3.setIdentity();
      } else {
        this._skyboxRotationMat4.setTRS(Vec3.ZERO, value, Vec3.ONE);
        this._skyboxRotationMat3.invertMat4(this._skyboxRotationMat4);
      }

      // only reset sky / rebuild scene shaders if rotation changed away from identity for the first time
      if (!this._skyboxRotationShaderInclude && !isIdentity) {
        this._skyboxRotationShaderInclude = true;
        this._resetSky();
      }
    }
  }
  get skyboxRotation() {
    return this._skyboxRotation;
  }

  /**
   * The tonemapping transform to apply when writing fragments to the frame buffer. Can be:
   *
   * - {@link TONEMAP_LINEAR}
   * - {@link TONEMAP_FILMIC}
   * - {@link TONEMAP_HEJL}
   * - {@link TONEMAP_ACES}
   * - {@link TONEMAP_ACES2}
   *
   * Defaults to {@link TONEMAP_LINEAR}.
   *
   * @type {number}
   */
  set toneMapping(value) {
    if (value !== this._toneMapping) {
      this._toneMapping = value;
      this.updateShaders = true;
    }
  }
  get toneMapping() {
    return this._toneMapping;
  }
  destroy() {
    this._resetSky();
    this.root = null;
    this.off();
  }
  drawLine(start, end, color = Color.WHITE, depthTest = true, layer = this.defaultDrawLayer) {
    const batch = this.immediate.getBatch(layer, depthTest);
    batch.addLines([start, end], [color, color]);
  }
  drawLines(positions, colors, depthTest = true, layer = this.defaultDrawLayer) {
    const batch = this.immediate.getBatch(layer, depthTest);
    batch.addLines(positions, colors);
  }
  drawLineArrays(positions, colors, depthTest = true, layer = this.defaultDrawLayer) {
    const batch = this.immediate.getBatch(layer, depthTest);
    batch.addLinesArrays(positions, colors);
  }
  applySettings(settings) {
    var _render$skyboxIntensi, _render$skyboxLuminan, _render$skyboxMip, _render$clusteredLigh;
    const physics = settings.physics;
    const render = settings.render;

    // settings
    this._gravity.set(physics.gravity[0], physics.gravity[1], physics.gravity[2]);
    this.ambientLight.set(render.global_ambient[0], render.global_ambient[1], render.global_ambient[2]);
    this.ambientLuminance = render.ambientLuminance;
    this._fog = render.fog;
    this.fogColor.set(render.fog_color[0], render.fog_color[1], render.fog_color[2]);
    this.fogStart = render.fog_start;
    this.fogEnd = render.fog_end;
    this.fogDensity = render.fog_density;
    this._gammaCorrection = render.gamma_correction;
    this._toneMapping = render.tonemapping;
    this.lightmapSizeMultiplier = render.lightmapSizeMultiplier;
    this.lightmapMaxResolution = render.lightmapMaxResolution;
    this.lightmapMode = render.lightmapMode;
    this.exposure = render.exposure;
    this._skyboxIntensity = (_render$skyboxIntensi = render.skyboxIntensity) != null ? _render$skyboxIntensi : 1;
    this._skyboxLuminance = (_render$skyboxLuminan = render.skyboxLuminance) != null ? _render$skyboxLuminan : 20000;
    this._skyboxMip = (_render$skyboxMip = render.skyboxMip) != null ? _render$skyboxMip : 0;
    if (render.skyboxRotation) {
      this.skyboxRotation = new Quat().setFromEulerAngles(render.skyboxRotation[0], render.skyboxRotation[1], render.skyboxRotation[2]);
    }
    this.clusteredLightingEnabled = (_render$clusteredLigh = render.clusteredLightingEnabled) != null ? _render$clusteredLigh : false;
    this.lighting.applySettings(render);

    // bake settings
    ['lightmapFilterEnabled', 'lightmapFilterRange', 'lightmapFilterSmoothness', 'ambientBake', 'ambientBakeNumSamples', 'ambientBakeSpherePart', 'ambientBakeOcclusionBrightness', 'ambientBakeOcclusionContrast'].forEach(setting => {
      if (render.hasOwnProperty(setting)) {
        this[setting] = render[setting];
      }
    });
    this._resetSky();
  }

  // get the actual texture to use for skybox rendering
  _getSkyboxTex() {
    const cubemaps = this._prefilteredCubemaps;
    if (this._skyboxMip) {
      // skybox selection for some reason has always skipped the 32x32 prefiltered mipmap, presumably a bug.
      // we can't simply fix this and map 3 to the correct level, since doing so has the potential
      // to change the look of existing scenes dramatically.
      // NOTE: the table skips the 32x32 mipmap
      const skyboxMapping = [0, 1, /* 2 */3, 4, 5, 6];

      // select blurry texture for use on the skybox
      return cubemaps[skyboxMapping[this._skyboxMip]] || this._envAtlas || cubemaps[0] || this._skyboxCubeMap;
    }
    return this._skyboxCubeMap || cubemaps[0] || this._envAtlas;
  }
  _updateSky(device) {
    if (!this.sky) {
      const texture = this._getSkyboxTex();
      if (texture) {
        this.sky = new Sky(device, this, texture);
        this.fire('set:skybox', texture);
      }
    }
  }
  _resetSky() {
    var _this$sky;
    (_this$sky = this.sky) == null ? void 0 : _this$sky.destroy();
    this.sky = null;
    this.updateShaders = true;
  }

  /**
   * Sets the cubemap for the scene skybox.
   *
   * @param {import('../platform/graphics/texture.js').Texture[]} [cubemaps] - An array of
   * cubemaps corresponding to the skybox at different mip levels. If undefined, scene will
   * remove skybox. Cubemap array should be of size 7, with the first element (index 0)
   * corresponding to the base cubemap (mip level 0) with original resolution. Each remaining
   * element (index 1-6) corresponds to a fixed prefiltered resolution (128x128, 64x64, 32x32,
   * 16x16, 8x8, 4x4).
   */
  setSkybox(cubemaps) {
    if (!cubemaps) {
      this.skybox = null;
      this.envAtlas = null;
    } else {
      this.skybox = cubemaps[0] || null;
      if (cubemaps[1] && !cubemaps[1].cubemap) {
        // prefiltered data is an env atlas
        this.envAtlas = cubemaps[1];
      } else {
        // prefiltered data is a set of cubemaps
        this.prefilteredCubemaps = cubemaps.slice(1);
      }
    }
  }

  /**
   * The lightmap pixel format.
   *
   * @type {number}
   */
  get lightmapPixelFormat() {
    return this.lightmapHDR && this.device.getHdrFormat(false, true, false, true) || PIXELFORMAT_RGBA8;
  }
}

export { Scene };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NlbmUuanMiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9zY2VuZS9zY2VuZS5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBEZWJ1ZyB9IGZyb20gJy4uL2NvcmUvZGVidWcuanMnO1xuaW1wb3J0IHsgRXZlbnRIYW5kbGVyIH0gZnJvbSAnLi4vY29yZS9ldmVudC1oYW5kbGVyLmpzJztcbmltcG9ydCB7IENvbG9yIH0gZnJvbSAnLi4vY29yZS9tYXRoL2NvbG9yLmpzJztcbmltcG9ydCB7IFZlYzMgfSBmcm9tICcuLi9jb3JlL21hdGgvdmVjMy5qcyc7XG5pbXBvcnQgeyBRdWF0IH0gZnJvbSAnLi4vY29yZS9tYXRoL3F1YXQuanMnO1xuaW1wb3J0IHsgbWF0aCB9IGZyb20gJy4uL2NvcmUvbWF0aC9tYXRoLmpzJztcbmltcG9ydCB7IE1hdDMgfSBmcm9tICcuLi9jb3JlL21hdGgvbWF0My5qcyc7XG5pbXBvcnQgeyBNYXQ0IH0gZnJvbSAnLi4vY29yZS9tYXRoL21hdDQuanMnO1xuXG5pbXBvcnQgeyBHcmFwaGljc0RldmljZUFjY2VzcyB9IGZyb20gJy4uL3BsYXRmb3JtL2dyYXBoaWNzL2dyYXBoaWNzLWRldmljZS1hY2Nlc3MuanMnO1xuaW1wb3J0IHsgUElYRUxGT1JNQVRfUkdCQTgsIEFERFJFU1NfQ0xBTVBfVE9fRURHRSwgRklMVEVSX0xJTkVBUiB9IGZyb20gJy4uL3BsYXRmb3JtL2dyYXBoaWNzL2NvbnN0YW50cy5qcyc7XG5cbmltcG9ydCB7IEJBS0VfQ09MT1JESVIsIEZPR19OT05FLCBHQU1NQV9TUkdCLCBMQVlFUklEX0lNTUVESUFURSB9IGZyb20gJy4vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IFNreSB9IGZyb20gJy4vc2t5LmpzJztcbmltcG9ydCB7IExpZ2h0aW5nUGFyYW1zIH0gZnJvbSAnLi9saWdodGluZy9saWdodGluZy1wYXJhbXMuanMnO1xuaW1wb3J0IHsgSW1tZWRpYXRlIH0gZnJvbSAnLi9pbW1lZGlhdGUvaW1tZWRpYXRlLmpzJztcbmltcG9ydCB7IEVudkxpZ2h0aW5nIH0gZnJvbSAnLi9ncmFwaGljcy9lbnYtbGlnaHRpbmcuanMnO1xuXG4vKipcbiAqIEEgc2NlbmUgaXMgZ3JhcGhpY2FsIHJlcHJlc2VudGF0aW9uIG9mIGFuIGVudmlyb25tZW50LiBJdCBtYW5hZ2VzIHRoZSBzY2VuZSBoaWVyYXJjaHksIGFsbFxuICogZ3JhcGhpY2FsIG9iamVjdHMsIGxpZ2h0cywgYW5kIHNjZW5lLXdpZGUgcHJvcGVydGllcy5cbiAqXG4gKiBAYXVnbWVudHMgRXZlbnRIYW5kbGVyXG4gKiBAY2F0ZWdvcnkgR3JhcGhpY3NcbiAqL1xuY2xhc3MgU2NlbmUgZXh0ZW5kcyBFdmVudEhhbmRsZXIge1xuICAgIC8qKlxuICAgICAqIElmIGVuYWJsZWQsIHRoZSBhbWJpZW50IGxpZ2h0aW5nIHdpbGwgYmUgYmFrZWQgaW50byBsaWdodG1hcHMuIFRoaXMgd2lsbCBiZSBlaXRoZXIgdGhlXG4gICAgICoge0BsaW5rIFNjZW5lI3NreWJveH0gaWYgc2V0IHVwLCBvdGhlcndpc2Uge0BsaW5rIFNjZW5lI2FtYmllbnRMaWdodH0uIERlZmF1bHRzIHRvIGZhbHNlLlxuICAgICAqXG4gICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICovXG4gICAgYW1iaWVudEJha2UgPSBmYWxzZTtcblxuICAgIC8qKlxuICAgICAqIElmIHtAbGluayBTY2VuZSNhbWJpZW50QmFrZX0gaXMgdHJ1ZSwgdGhpcyBzcGVjaWZpZXMgdGhlIGJyaWdodG5lc3Mgb2YgYW1iaWVudCBvY2NsdXNpb24uXG4gICAgICogVHlwaWNhbCByYW5nZSBpcyAtMSB0byAxLiBEZWZhdWx0cyB0byAwLCByZXByZXNlbnRpbmcgbm8gY2hhbmdlIHRvIGJyaWdodG5lc3MuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqL1xuICAgIGFtYmllbnRCYWtlT2NjbHVzaW9uQnJpZ2h0bmVzcyA9IDA7XG5cbiAgICAgLyoqXG4gICAgICAqIElmIHtAbGluayBTY2VuZSNhbWJpZW50QmFrZX0gaXMgdHJ1ZSwgdGhpcyBzcGVjaWZpZXMgdGhlIGNvbnRyYXN0IG9mIGFtYmllbnQgb2NjbHVzaW9uLlxuICAgICAgKiBUeXBpY2FsIHJhbmdlIGlzIC0xIHRvIDEuIERlZmF1bHRzIHRvIDAsIHJlcHJlc2VudGluZyBubyBjaGFuZ2UgdG8gY29udHJhc3QuXG4gICAgICAqXG4gICAgICAqIEB0eXBlIHtudW1iZXJ9XG4gICAgICAqL1xuICAgIGFtYmllbnRCYWtlT2NjbHVzaW9uQ29udHJhc3QgPSAwO1xuXG4gICAgLyoqXG4gICAgICogVGhlIGNvbG9yIG9mIHRoZSBzY2VuZSdzIGFtYmllbnQgbGlnaHQuIERlZmF1bHRzIHRvIGJsYWNrICgwLCAwLCAwKS5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtDb2xvcn1cbiAgICAgKi9cbiAgICBhbWJpZW50TGlnaHQgPSBuZXcgQ29sb3IoMCwgMCwgMCk7XG5cbiAgICAvKipcbiAgICAgKiBUaGUgbHVtaW5vc2l0eSBvZiB0aGUgc2NlbmUncyBhbWJpZW50IGxpZ2h0IGluIGx1eCAobG0vbV4yKS4gVXNlZCBpZiBwaHlzaWNhbFVuaXRzIGlzIHRydWUuIERlZmF1bHRzIHRvIDAuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqL1xuICAgIGFtYmllbnRMdW1pbmFuY2UgPSAwO1xuXG4gICAgLyoqXG4gICAgICogVGhlIGV4cG9zdXJlIHZhbHVlIHR3ZWFrcyB0aGUgb3ZlcmFsbCBicmlnaHRuZXNzIG9mIHRoZSBzY2VuZS4gSWdub3JlZCBpZiBwaHlzaWNhbFVuaXRzIGlzIHRydWUuIERlZmF1bHRzIHRvIDEuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqL1xuICAgIGV4cG9zdXJlID0gMTtcblxuICAgIC8qKlxuICAgICAqIFRoZSBjb2xvciBvZiB0aGUgZm9nIChpZiBlbmFibGVkKS4gRGVmYXVsdHMgdG8gYmxhY2sgKDAsIDAsIDApLlxuICAgICAqXG4gICAgICogQHR5cGUge0NvbG9yfVxuICAgICAqL1xuICAgIGZvZ0NvbG9yID0gbmV3IENvbG9yKDAsIDAsIDApO1xuXG4gICAgLyoqXG4gICAgICogVGhlIGRlbnNpdHkgb2YgdGhlIGZvZyAoaWYgZW5hYmxlZCkuIFRoaXMgcHJvcGVydHkgaXMgb25seSB2YWxpZCBpZiB0aGUgZm9nIHByb3BlcnR5IGlzIHNldFxuICAgICAqIHRvIHtAbGluayBGT0dfRVhQfSBvciB7QGxpbmsgRk9HX0VYUDJ9LiBEZWZhdWx0cyB0byAwLlxuICAgICAqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKi9cbiAgICBmb2dEZW5zaXR5ID0gMDtcblxuICAgIC8qKlxuICAgICAqIFRoZSBkaXN0YW5jZSBmcm9tIHRoZSB2aWV3cG9pbnQgd2hlcmUgbGluZWFyIGZvZyByZWFjaGVzIGl0cyBtYXhpbXVtLiBUaGlzIHByb3BlcnR5IGlzIG9ubHlcbiAgICAgKiB2YWxpZCBpZiB0aGUgZm9nIHByb3BlcnR5IGlzIHNldCB0byB7QGxpbmsgRk9HX0xJTkVBUn0uIERlZmF1bHRzIHRvIDEwMDAuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqL1xuICAgIGZvZ0VuZCA9IDEwMDA7XG5cbiAgICAvKipcbiAgICAgKiBUaGUgZGlzdGFuY2UgZnJvbSB0aGUgdmlld3BvaW50IHdoZXJlIGxpbmVhciBmb2cgYmVnaW5zLiBUaGlzIHByb3BlcnR5IGlzIG9ubHkgdmFsaWQgaWYgdGhlXG4gICAgICogZm9nIHByb3BlcnR5IGlzIHNldCB0byB7QGxpbmsgRk9HX0xJTkVBUn0uIERlZmF1bHRzIHRvIDEuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqL1xuICAgIGZvZ1N0YXJ0ID0gMTtcblxuICAgIC8qKlxuICAgICAqIFRoZSBsaWdodG1hcCByZXNvbHV0aW9uIG11bHRpcGxpZXIuIERlZmF1bHRzIHRvIDEuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqL1xuICAgIGxpZ2h0bWFwU2l6ZU11bHRpcGxpZXIgPSAxO1xuXG4gICAgLyoqXG4gICAgICogVGhlIG1heGltdW0gbGlnaHRtYXAgcmVzb2x1dGlvbi4gRGVmYXVsdHMgdG8gMjA0OC5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtudW1iZXJ9XG4gICAgICovXG4gICAgbGlnaHRtYXBNYXhSZXNvbHV0aW9uID0gMjA0ODtcblxuICAgIC8qKlxuICAgICAqIFRoZSBsaWdodG1hcCBiYWtpbmcgbW9kZS4gQ2FuIGJlOlxuICAgICAqXG4gICAgICogLSB7QGxpbmsgQkFLRV9DT0xPUn06IHNpbmdsZSBjb2xvciBsaWdodG1hcFxuICAgICAqIC0ge0BsaW5rIEJBS0VfQ09MT1JESVJ9OiBzaW5nbGUgY29sb3IgbGlnaHRtYXAgKyBkb21pbmFudCBsaWdodCBkaXJlY3Rpb24gKHVzZWQgZm9yIGJ1bXAgb3JcbiAgICAgKiBzcGVjdWxhcikuIE9ubHkgbGlnaHRzIHdpdGggYmFrZURpcj10cnVlIHdpbGwgYmUgdXNlZCBmb3IgZ2VuZXJhdGluZyB0aGUgZG9taW5hbnQgbGlnaHRcbiAgICAgKiBkaXJlY3Rpb24uXG4gICAgICpcbiAgICAgKiBEZWZhdWx0cyB0byB7QGxpbmsgQkFLRV9DT0xPUkRJUn0uXG4gICAgICpcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqL1xuICAgIGxpZ2h0bWFwTW9kZSA9IEJBS0VfQ09MT1JESVI7XG5cbiAgICAvKipcbiAgICAgKiBFbmFibGVzIGJpbGF0ZXJhbCBmaWx0ZXIgb24gcnVudGltZSBiYWtlZCBjb2xvciBsaWdodG1hcHMsIHdoaWNoIHJlbW92ZXMgdGhlIG5vaXNlIGFuZFxuICAgICAqIGJhbmRpbmcgd2hpbGUgcHJlc2VydmluZyB0aGUgZWRnZXMuIERlZmF1bHRzIHRvIGZhbHNlLiBOb3RlIHRoYXQgdGhlIGZpbHRlcmluZyB0YWtlcyBwbGFjZVxuICAgICAqIGluIHRoZSBpbWFnZSBzcGFjZSBvZiB0aGUgbGlnaHRtYXAsIGFuZCBpdCBkb2VzIG5vdCBmaWx0ZXIgYWNyb3NzIGxpZ2h0bWFwIFVWIHNwYWNlIHNlYW1zLFxuICAgICAqIG9mdGVuIG1ha2luZyB0aGUgc2VhbXMgbW9yZSB2aXNpYmxlLiBJdCdzIGltcG9ydGFudCB0byBiYWxhbmNlIHRoZSBzdHJlbmd0aCBvZiB0aGUgZmlsdGVyXG4gICAgICogd2l0aCBudW1iZXIgb2Ygc2FtcGxlcyB1c2VkIGZvciBsaWdodG1hcCBiYWtpbmcgdG8gbGltaXQgdGhlIHZpc2libGUgYXJ0aWZhY3RzLlxuICAgICAqXG4gICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICovXG4gICAgbGlnaHRtYXBGaWx0ZXJFbmFibGVkID0gZmFsc2U7XG5cbiAgICAvKipcbiAgICAgKiBFbmFibGVzIEhEUiBsaWdodG1hcHMuIFRoaXMgY2FuIHJlc3VsdCBpbiBzbW9vdGhlciBsaWdodG1hcHMgZXNwZWNpYWxseSB3aGVuIG1hbnkgc2FtcGxlc1xuICAgICAqIGFyZSB1c2VkLiBEZWZhdWx0cyB0byBmYWxzZS5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAqL1xuICAgIGxpZ2h0bWFwSERSID0gZmFsc2U7XG5cbiAgICAvKipcbiAgICAgKiBUaGUgcm9vdCBlbnRpdHkgb2YgdGhlIHNjZW5lLCB3aGljaCBpcyB1c3VhbGx5IHRoZSBvbmx5IGNoaWxkIHRvIHRoZSB7QGxpbmsgQXBwbGljYXRpb259XG4gICAgICogcm9vdCBlbnRpdHkuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7aW1wb3J0KCcuLi9mcmFtZXdvcmsvZW50aXR5LmpzJykuRW50aXR5fVxuICAgICAqL1xuICAgIHJvb3QgPSBudWxsO1xuXG4gICAgLyoqXG4gICAgICogVGhlIHNreSBvZiB0aGUgc2NlbmUuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7U2t5fVxuICAgICAqIEBpZ25vcmVcbiAgICAgKi9cbiAgICBza3kgPSBudWxsO1xuXG4gICAgLyoqXG4gICAgICogVXNlIHBoeXNpY2FsbHkgYmFzZWQgdW5pdHMgZm9yIGNhbWVyYXMgYW5kIGxpZ2h0cy4gV2hlbiB1c2VkLCB0aGUgZXhwb3N1cmUgdmFsdWUgaXMgaWdub3JlZC5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAqL1xuICAgIHBoeXNpY2FsVW5pdHMgPSBmYWxzZTtcblxuICAgIC8qKlxuICAgICAqIENyZWF0ZSBhIG5ldyBTY2VuZSBpbnN0YW5jZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuLi9wbGF0Zm9ybS9ncmFwaGljcy9ncmFwaGljcy1kZXZpY2UuanMnKS5HcmFwaGljc0RldmljZX0gZ3JhcGhpY3NEZXZpY2UgLVxuICAgICAqIFRoZSBncmFwaGljcyBkZXZpY2UgdXNlZCB0byBtYW5hZ2UgdGhpcyBzY2VuZS5cbiAgICAgKiBAaGlkZWNvbnN0cnVjdG9yXG4gICAgICovXG4gICAgY29uc3RydWN0b3IoZ3JhcGhpY3NEZXZpY2UpIHtcbiAgICAgICAgc3VwZXIoKTtcblxuICAgICAgICBEZWJ1Zy5hc3NlcnREZXByZWNhdGVkKGdyYXBoaWNzRGV2aWNlLCBcIlNjZW5lIGNvbnN0cnVjdG9yIHRha2VzIGEgR3JhcGhpY3NEZXZpY2UgYXMgYSBwYXJhbWV0ZXIsIGFuZCBpdCB3YXMgbm90IHByb3ZpZGVkLlwiKTtcbiAgICAgICAgdGhpcy5kZXZpY2UgPSBncmFwaGljc0RldmljZSB8fCBHcmFwaGljc0RldmljZUFjY2Vzcy5nZXQoKTtcblxuICAgICAgICB0aGlzLl9ncmF2aXR5ID0gbmV3IFZlYzMoMCwgLTkuOCwgMCk7XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEB0eXBlIHtpbXBvcnQoJy4vY29tcG9zaXRpb24vbGF5ZXItY29tcG9zaXRpb24uanMnKS5MYXllckNvbXBvc2l0aW9ufVxuICAgICAgICAgKiBAcHJpdmF0ZVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5fbGF5ZXJzID0gbnVsbDtcblxuICAgICAgICB0aGlzLl9mb2cgPSBGT0dfTk9ORTtcblxuICAgICAgICB0aGlzLl9nYW1tYUNvcnJlY3Rpb24gPSBHQU1NQV9TUkdCO1xuICAgICAgICB0aGlzLl90b25lTWFwcGluZyA9IDA7XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIFRoZSBza3lib3ggY3ViZW1hcCBhcyBzZXQgYnkgdXNlciAoZ2V0cyB1c2VkIHdoZW4gc2t5Ym94TWlwID09PSAwKVxuICAgICAgICAgKlxuICAgICAgICAgKiBAdHlwZSB7aW1wb3J0KCcuLi9wbGF0Zm9ybS9ncmFwaGljcy90ZXh0dXJlLmpzJykuVGV4dHVyZX1cbiAgICAgICAgICogQHByaXZhdGVcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuX3NreWJveEN1YmVNYXAgPSBudWxsO1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBBcnJheSBvZiA2IHByZWZpbHRlcmVkIGxpZ2h0aW5nIGRhdGEgY3ViZW1hcHMuXG4gICAgICAgICAqXG4gICAgICAgICAqIEB0eXBlIHtpbXBvcnQoJy4uL3BsYXRmb3JtL2dyYXBoaWNzL3RleHR1cmUuanMnKS5UZXh0dXJlW119XG4gICAgICAgICAqIEBwcml2YXRlXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLl9wcmVmaWx0ZXJlZEN1YmVtYXBzID0gW107XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEVudmlyb25tZW50IGxpZ2h0aW5nIGF0bGFzXG4gICAgICAgICAqXG4gICAgICAgICAqIEB0eXBlIHtpbXBvcnQoJy4uL3BsYXRmb3JtL2dyYXBoaWNzL3RleHR1cmUuanMnKS5UZXh0dXJlfVxuICAgICAgICAgKiBAcHJpdmF0ZVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5fZW52QXRsYXMgPSBudWxsO1xuXG4gICAgICAgIC8vIGludGVybmFsbHkgZ2VuZXJhdGVkIGVudkF0bGFzIG93bmVkIGJ5IHRoZSBzY2VuZVxuICAgICAgICB0aGlzLl9pbnRlcm5hbEVudkF0bGFzID0gbnVsbDtcblxuICAgICAgICB0aGlzLl9za3lib3hJbnRlbnNpdHkgPSAxO1xuICAgICAgICB0aGlzLl9za3lib3hMdW1pbmFuY2UgPSAwO1xuICAgICAgICB0aGlzLl9za3lib3hNaXAgPSAwO1xuXG4gICAgICAgIHRoaXMuX3NreWJveFJvdGF0aW9uU2hhZGVySW5jbHVkZSA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9za3lib3hSb3RhdGlvbiA9IG5ldyBRdWF0KCk7XG4gICAgICAgIHRoaXMuX3NreWJveFJvdGF0aW9uTWF0MyA9IG5ldyBNYXQzKCk7XG4gICAgICAgIHRoaXMuX3NreWJveFJvdGF0aW9uTWF0NCA9IG5ldyBNYXQ0KCk7XG5cbiAgICAgICAgLy8gYW1iaWVudCBsaWdodCBsaWdodG1hcHBpbmcgcHJvcGVydGllc1xuICAgICAgICB0aGlzLl9hbWJpZW50QmFrZU51bVNhbXBsZXMgPSAxO1xuICAgICAgICB0aGlzLl9hbWJpZW50QmFrZVNwaGVyZVBhcnQgPSAwLjQ7XG5cbiAgICAgICAgdGhpcy5fbGlnaHRtYXBGaWx0ZXJSYW5nZSA9IDEwO1xuICAgICAgICB0aGlzLl9saWdodG1hcEZpbHRlclNtb290aG5lc3MgPSAwLjI7XG5cbiAgICAgICAgLy8gY2x1c3RlcmVkIGxpZ2h0aW5nXG4gICAgICAgIHRoaXMuX2NsdXN0ZXJlZExpZ2h0aW5nRW5hYmxlZCA9IHRydWU7XG4gICAgICAgIHRoaXMuX2xpZ2h0aW5nUGFyYW1zID0gbmV3IExpZ2h0aW5nUGFyYW1zKHRoaXMuZGV2aWNlLnN1cHBvcnRzQXJlYUxpZ2h0cywgdGhpcy5kZXZpY2UubWF4VGV4dHVyZVNpemUsICgpID0+IHtcbiAgICAgICAgICAgIHRoaXMudXBkYXRlU2hhZGVycyA9IHRydWU7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRoaXMuX3N0YXRzID0ge1xuICAgICAgICAgICAgbWVzaEluc3RhbmNlczogMCxcbiAgICAgICAgICAgIGxpZ2h0czogMCxcbiAgICAgICAgICAgIGR5bmFtaWNMaWdodHM6IDAsXG4gICAgICAgICAgICBiYWtlZExpZ2h0czogMCxcbiAgICAgICAgICAgIHVwZGF0ZVNoYWRlcnNUaW1lOiAwIC8vIGRlcHJlY2F0ZWRcbiAgICAgICAgfTtcblxuICAgICAgICAvKipcbiAgICAgICAgICogVGhpcyBmbGFnIGluZGljYXRlcyBjaGFuZ2VzIHdlcmUgbWFkZSB0byB0aGUgc2NlbmUgd2hpY2ggbWF5IHJlcXVpcmUgcmVjb21waWxhdGlvbiBvZlxuICAgICAgICAgKiBzaGFkZXJzIHRoYXQgcmVmZXJlbmNlIGdsb2JhbCBzZXR0aW5ncy5cbiAgICAgICAgICpcbiAgICAgICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICAgICAqIEBpZ25vcmVcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMudXBkYXRlU2hhZGVycyA9IHRydWU7XG5cbiAgICAgICAgdGhpcy5fc2hhZGVyVmVyc2lvbiA9IDA7XG5cbiAgICAgICAgLy8gaW1tZWRpYXRlIHJlbmRlcmluZ1xuICAgICAgICB0aGlzLmltbWVkaWF0ZSA9IG5ldyBJbW1lZGlhdGUodGhpcy5kZXZpY2UpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEZpcmVkIHdoZW4gdGhlIHNreWJveCBpcyBzZXQuXG4gICAgICpcbiAgICAgKiBAZXZlbnQgU2NlbmUjc2V0OnNreWJveFxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuLi9wbGF0Zm9ybS9ncmFwaGljcy90ZXh0dXJlLmpzJykuVGV4dHVyZX0gdXNlZFRleCAtIFByZXZpb3VzbHkgdXNlZCBjdWJlbWFwXG4gICAgICogdGV4dHVyZS4gTmV3IGlzIGluIHRoZSB7QGxpbmsgU2NlbmUjc2t5Ym94fS5cbiAgICAgKi9cblxuICAgIC8qKlxuICAgICAqIEZpcmVkIHdoZW4gdGhlIGxheWVyIGNvbXBvc2l0aW9uIGlzIHNldC4gVXNlIHRoaXMgZXZlbnQgdG8gYWRkIGNhbGxiYWNrcyBvciBhZHZhbmNlZFxuICAgICAqIHByb3BlcnRpZXMgdG8geW91ciBsYXllcnMuXG4gICAgICpcbiAgICAgKiBAZXZlbnQgU2NlbmUjc2V0OmxheWVyc1xuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuL2NvbXBvc2l0aW9uL2xheWVyLWNvbXBvc2l0aW9uLmpzJykuTGF5ZXJDb21wb3NpdGlvbn0gb2xkQ29tcCAtIFByZXZpb3VzbHlcbiAgICAgKiB1c2VkIHtAbGluayBMYXllckNvbXBvc2l0aW9ufS5cbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi9jb21wb3NpdGlvbi9sYXllci1jb21wb3NpdGlvbi5qcycpLkxheWVyQ29tcG9zaXRpb259IG5ld0NvbXAgLSBOZXdseSBzZXRcbiAgICAgKiB7QGxpbmsgTGF5ZXJDb21wb3NpdGlvbn0uXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiB0aGlzLmFwcC5zY2VuZS5vbignc2V0OmxheWVycycsIGZ1bmN0aW9uIChvbGRDb21wLCBuZXdDb21wKSB7XG4gICAgICogICAgIGNvbnN0IGxpc3QgPSBuZXdDb21wLmxheWVyTGlzdDtcbiAgICAgKiAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBsaXN0Lmxlbmd0aDsgaSsrKSB7XG4gICAgICogICAgICAgICBjb25zdCBsYXllciA9IGxpc3RbaV07XG4gICAgICogICAgICAgICBzd2l0Y2ggKGxheWVyLm5hbWUpIHtcbiAgICAgKiAgICAgICAgICAgICBjYXNlICdNeUxheWVyJzpcbiAgICAgKiAgICAgICAgICAgICAgICAgbGF5ZXIub25FbmFibGUgPSBteU9uRW5hYmxlRnVuY3Rpb247XG4gICAgICogICAgICAgICAgICAgICAgIGxheWVyLm9uRGlzYWJsZSA9IG15T25EaXNhYmxlRnVuY3Rpb247XG4gICAgICogICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAqICAgICAgICAgICAgIGNhc2UgJ015T3RoZXJMYXllcic6XG4gICAgICogICAgICAgICAgICAgICAgIGxheWVyLnNoYWRlclBhc3MgPSBteVNoYWRlclBhc3M7XG4gICAgICogICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAqICAgICAgICAgfVxuICAgICAqICAgICB9XG4gICAgICogfSk7XG4gICAgICovXG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBkZWZhdWx0IGxheWVyIHVzZWQgYnkgdGhlIGltbWVkaWF0ZSBkcmF3aW5nIGZ1bmN0aW9ucy5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtpbXBvcnQoJy4vbGF5ZXIuanMnKS5MYXllcn1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIGdldCBkZWZhdWx0RHJhd0xheWVyKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5sYXllcnMuZ2V0TGF5ZXJCeUlkKExBWUVSSURfSU1NRURJQVRFKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJZiB7QGxpbmsgU2NlbmUjYW1iaWVudEJha2V9IGlzIHRydWUsIHRoaXMgc3BlY2lmaWVzIHRoZSBudW1iZXIgb2Ygc2FtcGxlcyB1c2VkIHRvIGJha2UgdGhlXG4gICAgICogYW1iaWVudCBsaWdodCBpbnRvIHRoZSBsaWdodG1hcC4gRGVmYXVsdHMgdG8gMS4gTWF4aW11bSB2YWx1ZSBpcyAyNTUuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqL1xuICAgIHNldCBhbWJpZW50QmFrZU51bVNhbXBsZXModmFsdWUpIHtcbiAgICAgICAgdGhpcy5fYW1iaWVudEJha2VOdW1TYW1wbGVzID0gbWF0aC5jbGFtcChNYXRoLmZsb29yKHZhbHVlKSwgMSwgMjU1KTtcbiAgICB9XG5cbiAgICBnZXQgYW1iaWVudEJha2VOdW1TYW1wbGVzKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fYW1iaWVudEJha2VOdW1TYW1wbGVzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIElmIHtAbGluayBTY2VuZSNhbWJpZW50QmFrZX0gaXMgdHJ1ZSwgdGhpcyBzcGVjaWZpZXMgYSBwYXJ0IG9mIHRoZSBzcGhlcmUgd2hpY2ggcmVwcmVzZW50c1xuICAgICAqIHRoZSBzb3VyY2Ugb2YgYW1iaWVudCBsaWdodC4gVGhlIHZhbGlkIHJhbmdlIGlzIDAuLjEsIHJlcHJlc2VudGluZyBhIHBhcnQgb2YgdGhlIHNwaGVyZSBmcm9tXG4gICAgICogdG9wIHRvIHRoZSBib3R0b20uIEEgdmFsdWUgb2YgMC41IHJlcHJlc2VudHMgdGhlIHVwcGVyIGhlbWlzcGhlcmUuIEEgdmFsdWUgb2YgMSByZXByZXNlbnRzIGFcbiAgICAgKiBmdWxsIHNwaGVyZS4gRGVmYXVsdHMgdG8gMC40LCB3aGljaCBpcyBhIHNtYWxsZXIgdXBwZXIgaGVtaXNwaGVyZSBhcyB0aGlzIHJlcXVpcmVzIGZld2VyXG4gICAgICogc2FtcGxlcyB0byBiYWtlLlxuICAgICAqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKi9cbiAgICBzZXQgYW1iaWVudEJha2VTcGhlcmVQYXJ0KHZhbHVlKSB7XG4gICAgICAgIHRoaXMuX2FtYmllbnRCYWtlU3BoZXJlUGFydCA9IG1hdGguY2xhbXAodmFsdWUsIDAuMDAxLCAxKTtcbiAgICB9XG5cbiAgICBnZXQgYW1iaWVudEJha2VTcGhlcmVQYXJ0KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fYW1iaWVudEJha2VTcGhlcmVQYXJ0O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRydWUgaWYgdGhlIGNsdXN0ZXJlZCBsaWdodGluZyBpcyBlbmFibGVkLiBTZXQgdG8gZmFsc2UgYmVmb3JlIHRoZSBmaXJzdCBmcmFtZSBpcyByZW5kZXJlZFxuICAgICAqIHRvIHVzZSBub24tY2x1c3RlcmVkIGxpZ2h0aW5nLiBEZWZhdWx0cyB0byB0cnVlLlxuICAgICAqXG4gICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICovXG4gICAgc2V0IGNsdXN0ZXJlZExpZ2h0aW5nRW5hYmxlZCh2YWx1ZSkge1xuXG4gICAgICAgIGlmICh0aGlzLmRldmljZS5pc1dlYkdQVSAmJiAhdmFsdWUpIHtcbiAgICAgICAgICAgIERlYnVnLndhcm5PbmNlKCdXZWJHUFUgY3VycmVudGx5IG9ubHkgc3VwcG9ydHMgY2x1c3RlcmVkIGxpZ2h0aW5nLCBhbmQgdGhpcyBjYW5ub3QgYmUgZGlzYWJsZWQuJyk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIXRoaXMuX2NsdXN0ZXJlZExpZ2h0aW5nRW5hYmxlZCAmJiB2YWx1ZSkge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcignVHVybmluZyBvbiBkaXNhYmxlZCBjbHVzdGVyZWQgbGlnaHRpbmcgaXMgbm90IGN1cnJlbnRseSBzdXBwb3J0ZWQnKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuX2NsdXN0ZXJlZExpZ2h0aW5nRW5hYmxlZCA9IHZhbHVlO1xuICAgIH1cblxuICAgIGdldCBjbHVzdGVyZWRMaWdodGluZ0VuYWJsZWQoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9jbHVzdGVyZWRMaWdodGluZ0VuYWJsZWQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVGhlIGVudmlyb25tZW50IGxpZ2h0aW5nIGF0bGFzLlxuICAgICAqXG4gICAgICogQHR5cGUge2ltcG9ydCgnLi4vcGxhdGZvcm0vZ3JhcGhpY3MvdGV4dHVyZS5qcycpLlRleHR1cmV9XG4gICAgICovXG4gICAgc2V0IGVudkF0bGFzKHZhbHVlKSB7XG4gICAgICAgIGlmICh2YWx1ZSAhPT0gdGhpcy5fZW52QXRsYXMpIHtcbiAgICAgICAgICAgIHRoaXMuX2VudkF0bGFzID0gdmFsdWU7XG5cbiAgICAgICAgICAgIC8vIG1ha2Ugc3VyZSByZXF1aXJlZCBvcHRpb25zIGFyZSBzZXQgdXAgb24gdGhlIHRleHR1cmVcbiAgICAgICAgICAgIGlmICh2YWx1ZSkge1xuICAgICAgICAgICAgICAgIHZhbHVlLmFkZHJlc3NVID0gQUREUkVTU19DTEFNUF9UT19FREdFO1xuICAgICAgICAgICAgICAgIHZhbHVlLmFkZHJlc3NWID0gQUREUkVTU19DTEFNUF9UT19FREdFO1xuICAgICAgICAgICAgICAgIHZhbHVlLm1pbkZpbHRlciA9IEZJTFRFUl9MSU5FQVI7XG4gICAgICAgICAgICAgICAgdmFsdWUubWFnRmlsdGVyID0gRklMVEVSX0xJTkVBUjtcbiAgICAgICAgICAgICAgICB2YWx1ZS5taXBtYXBzID0gZmFsc2U7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuX3ByZWZpbHRlcmVkQ3ViZW1hcHMgPSBbXTtcbiAgICAgICAgICAgIGlmICh0aGlzLl9pbnRlcm5hbEVudkF0bGFzKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5faW50ZXJuYWxFbnZBdGxhcy5kZXN0cm95KCk7XG4gICAgICAgICAgICAgICAgdGhpcy5faW50ZXJuYWxFbnZBdGxhcyA9IG51bGw7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuX3Jlc2V0U2t5KCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBnZXQgZW52QXRsYXMoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9lbnZBdGxhcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUaGUgdHlwZSBvZiBmb2cgdXNlZCBieSB0aGUgc2NlbmUuIENhbiBiZTpcbiAgICAgKlxuICAgICAqIC0ge0BsaW5rIEZPR19OT05FfVxuICAgICAqIC0ge0BsaW5rIEZPR19MSU5FQVJ9XG4gICAgICogLSB7QGxpbmsgRk9HX0VYUH1cbiAgICAgKiAtIHtAbGluayBGT0dfRVhQMn1cbiAgICAgKlxuICAgICAqIERlZmF1bHRzIHRvIHtAbGluayBGT0dfTk9ORX0uXG4gICAgICpcbiAgICAgKiBAdHlwZSB7c3RyaW5nfVxuICAgICAqL1xuICAgIHNldCBmb2codHlwZSkge1xuICAgICAgICBpZiAodHlwZSAhPT0gdGhpcy5fZm9nKSB7XG4gICAgICAgICAgICB0aGlzLl9mb2cgPSB0eXBlO1xuICAgICAgICAgICAgdGhpcy51cGRhdGVTaGFkZXJzID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGdldCBmb2coKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9mb2c7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVGhlIGdhbW1hIGNvcnJlY3Rpb24gdG8gYXBwbHkgd2hlbiByZW5kZXJpbmcgdGhlIHNjZW5lLiBDYW4gYmU6XG4gICAgICpcbiAgICAgKiAtIHtAbGluayBHQU1NQV9OT05FfVxuICAgICAqIC0ge0BsaW5rIEdBTU1BX1NSR0J9XG4gICAgICpcbiAgICAgKiBEZWZhdWx0cyB0byB7QGxpbmsgR0FNTUFfU1JHQn0uXG4gICAgICpcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqL1xuICAgIHNldCBnYW1tYUNvcnJlY3Rpb24odmFsdWUpIHtcbiAgICAgICAgaWYgKHZhbHVlICE9PSB0aGlzLl9nYW1tYUNvcnJlY3Rpb24pIHtcbiAgICAgICAgICAgIHRoaXMuX2dhbW1hQ29ycmVjdGlvbiA9IHZhbHVlO1xuICAgICAgICAgICAgdGhpcy51cGRhdGVTaGFkZXJzID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGdldCBnYW1tYUNvcnJlY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9nYW1tYUNvcnJlY3Rpb247XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQSB7QGxpbmsgTGF5ZXJDb21wb3NpdGlvbn0gdGhhdCBkZWZpbmVzIHJlbmRlcmluZyBvcmRlciBvZiB0aGlzIHNjZW5lLlxuICAgICAqXG4gICAgICogQHR5cGUge2ltcG9ydCgnLi9jb21wb3NpdGlvbi9sYXllci1jb21wb3NpdGlvbi5qcycpLkxheWVyQ29tcG9zaXRpb259XG4gICAgICovXG4gICAgc2V0IGxheWVycyhsYXllcnMpIHtcbiAgICAgICAgY29uc3QgcHJldiA9IHRoaXMuX2xheWVycztcbiAgICAgICAgdGhpcy5fbGF5ZXJzID0gbGF5ZXJzO1xuICAgICAgICB0aGlzLmZpcmUoJ3NldDpsYXllcnMnLCBwcmV2LCBsYXllcnMpO1xuICAgIH1cblxuICAgIGdldCBsYXllcnMoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9sYXllcnM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQSB7QGxpbmsgTGlnaHRpbmdQYXJhbXN9IHRoYXQgZGVmaW5lcyBsaWdodGluZyBwYXJhbWV0ZXJzLlxuICAgICAqXG4gICAgICogQHR5cGUge0xpZ2h0aW5nUGFyYW1zfVxuICAgICAqL1xuICAgIGdldCBsaWdodGluZygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2xpZ2h0aW5nUGFyYW1zO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEEgcmFuZ2UgcGFyYW1ldGVyIG9mIHRoZSBiaWxhdGVyYWwgZmlsdGVyLiBJdCdzIHVzZWQgd2hlbiB7QGxpbmsgU2NlbmUjbGlnaHRtYXBGaWx0ZXJFbmFibGVkfVxuICAgICAqIGlzIGVuYWJsZWQuIExhcmdlciB2YWx1ZSBhcHBsaWVzIG1vcmUgd2lkZXNwcmVhZCBibHVyLiBUaGlzIG5lZWRzIHRvIGJlIGEgcG9zaXRpdmUgbm9uLXplcm9cbiAgICAgKiB2YWx1ZS4gRGVmYXVsdHMgdG8gMTAuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqL1xuICAgIHNldCBsaWdodG1hcEZpbHRlclJhbmdlKHZhbHVlKSB7XG4gICAgICAgIHRoaXMuX2xpZ2h0bWFwRmlsdGVyUmFuZ2UgPSBNYXRoLm1heCh2YWx1ZSwgMC4wMDEpO1xuICAgIH1cblxuICAgIGdldCBsaWdodG1hcEZpbHRlclJhbmdlKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fbGlnaHRtYXBGaWx0ZXJSYW5nZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBIHNwYXRpYWwgcGFyYW1ldGVyIG9mIHRoZSBiaWxhdGVyYWwgZmlsdGVyLiBJdCdzIHVzZWQgd2hlbiB7QGxpbmsgU2NlbmUjbGlnaHRtYXBGaWx0ZXJFbmFibGVkfVxuICAgICAqIGlzIGVuYWJsZWQuIExhcmdlciB2YWx1ZSBibHVycyBsZXNzIHNpbWlsYXIgY29sb3JzLiBUaGlzIG5lZWRzIHRvIGJlIGEgcG9zaXRpdmUgbm9uLXplcm9cbiAgICAgKiB2YWx1ZS4gRGVmYXVsdHMgdG8gMC4yLlxuICAgICAqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKi9cbiAgICBzZXQgbGlnaHRtYXBGaWx0ZXJTbW9vdGhuZXNzKHZhbHVlKSB7XG4gICAgICAgIHRoaXMuX2xpZ2h0bWFwRmlsdGVyU21vb3RobmVzcyA9IE1hdGgubWF4KHZhbHVlLCAwLjAwMSk7XG4gICAgfVxuXG4gICAgZ2V0IGxpZ2h0bWFwRmlsdGVyU21vb3RobmVzcygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2xpZ2h0bWFwRmlsdGVyU21vb3RobmVzcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXQgb2YgNiBwcmVmaWx0ZXJlZCBjdWJlbWFwcy5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtpbXBvcnQoJy4uL3BsYXRmb3JtL2dyYXBoaWNzL3RleHR1cmUuanMnKS5UZXh0dXJlW119XG4gICAgICovXG4gICAgc2V0IHByZWZpbHRlcmVkQ3ViZW1hcHModmFsdWUpIHtcbiAgICAgICAgdmFsdWUgPSB2YWx1ZSB8fCBbXTtcbiAgICAgICAgY29uc3QgY3ViZW1hcHMgPSB0aGlzLl9wcmVmaWx0ZXJlZEN1YmVtYXBzO1xuICAgICAgICBjb25zdCBjaGFuZ2VkID0gY3ViZW1hcHMubGVuZ3RoICE9PSB2YWx1ZS5sZW5ndGggfHwgY3ViZW1hcHMuc29tZSgoYywgaSkgPT4gYyAhPT0gdmFsdWVbaV0pO1xuXG4gICAgICAgIGlmIChjaGFuZ2VkKSB7XG4gICAgICAgICAgICBjb25zdCBjb21wbGV0ZSA9IHZhbHVlLmxlbmd0aCA9PT0gNiAmJiB2YWx1ZS5ldmVyeShjID0+ICEhYyk7XG5cbiAgICAgICAgICAgIGlmIChjb21wbGV0ZSkge1xuICAgICAgICAgICAgICAgIC8vIHVwZGF0ZSBlbnYgYXRsYXNcbiAgICAgICAgICAgICAgICB0aGlzLl9pbnRlcm5hbEVudkF0bGFzID0gRW52TGlnaHRpbmcuZ2VuZXJhdGVQcmVmaWx0ZXJlZEF0bGFzKHZhbHVlLCB7XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldDogdGhpcy5faW50ZXJuYWxFbnZBdGxhc1xuICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgdGhpcy5fZW52QXRsYXMgPSB0aGlzLl9pbnRlcm5hbEVudkF0bGFzO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5faW50ZXJuYWxFbnZBdGxhcykge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9pbnRlcm5hbEVudkF0bGFzLmRlc3Ryb3koKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5faW50ZXJuYWxFbnZBdGxhcyA9IG51bGw7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRoaXMuX2VudkF0bGFzID0gbnVsbDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5fcHJlZmlsdGVyZWRDdWJlbWFwcyA9IHZhbHVlLnNsaWNlKCk7XG4gICAgICAgICAgICB0aGlzLl9yZXNldFNreSgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2V0IHByZWZpbHRlcmVkQ3ViZW1hcHMoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9wcmVmaWx0ZXJlZEN1YmVtYXBzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRoZSBiYXNlIGN1YmVtYXAgdGV4dHVyZSB1c2VkIGFzIHRoZSBzY2VuZSdzIHNreWJveCwgaWYgbWlwIGxldmVsIGlzIDAuIERlZmF1bHRzIHRvIG51bGwuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7aW1wb3J0KCcuLi9wbGF0Zm9ybS9ncmFwaGljcy90ZXh0dXJlLmpzJykuVGV4dHVyZX1cbiAgICAgKi9cbiAgICBzZXQgc2t5Ym94KHZhbHVlKSB7XG4gICAgICAgIGlmICh2YWx1ZSAhPT0gdGhpcy5fc2t5Ym94Q3ViZU1hcCkge1xuICAgICAgICAgICAgdGhpcy5fc2t5Ym94Q3ViZU1hcCA9IHZhbHVlO1xuICAgICAgICAgICAgdGhpcy5fcmVzZXRTa3koKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGdldCBza3lib3goKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9za3lib3hDdWJlTWFwO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE11bHRpcGxpZXIgZm9yIHNreWJveCBpbnRlbnNpdHkuIERlZmF1bHRzIHRvIDEuIFVudXNlZCBpZiBwaHlzaWNhbCB1bml0cyBhcmUgdXNlZC5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtudW1iZXJ9XG4gICAgICovXG4gICAgc2V0IHNreWJveEludGVuc2l0eSh2YWx1ZSkge1xuICAgICAgICBpZiAodmFsdWUgIT09IHRoaXMuX3NreWJveEludGVuc2l0eSkge1xuICAgICAgICAgICAgdGhpcy5fc2t5Ym94SW50ZW5zaXR5ID0gdmFsdWU7XG4gICAgICAgICAgICB0aGlzLl9yZXNldFNreSgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2V0IHNreWJveEludGVuc2l0eSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3NreWJveEludGVuc2l0eTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBMdW1pbmFuY2UgKGluIGxtL21eMikgb2Ygc2t5Ym94LiBEZWZhdWx0cyB0byAwLiBPbmx5IHVzZWQgaWYgcGh5c2ljYWwgdW5pdHMgYXJlIHVzZWQuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqL1xuICAgIHNldCBza3lib3hMdW1pbmFuY2UodmFsdWUpIHtcbiAgICAgICAgaWYgKHZhbHVlICE9PSB0aGlzLl9za3lib3hMdW1pbmFuY2UpIHtcbiAgICAgICAgICAgIHRoaXMuX3NreWJveEx1bWluYW5jZSA9IHZhbHVlO1xuICAgICAgICAgICAgdGhpcy5fcmVzZXRTa3koKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGdldCBza3lib3hMdW1pbmFuY2UoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9za3lib3hMdW1pbmFuY2U7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVGhlIG1pcCBsZXZlbCBvZiB0aGUgc2t5Ym94IHRvIGJlIGRpc3BsYXllZC4gT25seSB2YWxpZCBmb3IgcHJlZmlsdGVyZWQgY3ViZW1hcCBza3lib3hlcy5cbiAgICAgKiBEZWZhdWx0cyB0byAwIChiYXNlIGxldmVsKS5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtudW1iZXJ9XG4gICAgICovXG4gICAgc2V0IHNreWJveE1pcCh2YWx1ZSkge1xuICAgICAgICBpZiAodmFsdWUgIT09IHRoaXMuX3NreWJveE1pcCkge1xuICAgICAgICAgICAgdGhpcy5fc2t5Ym94TWlwID0gdmFsdWU7XG4gICAgICAgICAgICB0aGlzLl9yZXNldFNreSgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2V0IHNreWJveE1pcCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3NreWJveE1pcDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUaGUgcm90YXRpb24gb2YgdGhlIHNreWJveCB0byBiZSBkaXNwbGF5ZWQuIERlZmF1bHRzIHRvIHtAbGluayBRdWF0LklERU5USVRZfS5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtRdWF0fVxuICAgICAqL1xuICAgIHNldCBza3lib3hSb3RhdGlvbih2YWx1ZSkge1xuICAgICAgICBpZiAoIXRoaXMuX3NreWJveFJvdGF0aW9uLmVxdWFscyh2YWx1ZSkpIHtcblxuICAgICAgICAgICAgY29uc3QgaXNJZGVudGl0eSA9IHZhbHVlLmVxdWFscyhRdWF0LklERU5USVRZKTtcbiAgICAgICAgICAgIHRoaXMuX3NreWJveFJvdGF0aW9uLmNvcHkodmFsdWUpO1xuXG4gICAgICAgICAgICBpZiAoaXNJZGVudGl0eSkge1xuICAgICAgICAgICAgICAgIHRoaXMuX3NreWJveFJvdGF0aW9uTWF0My5zZXRJZGVudGl0eSgpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9za3lib3hSb3RhdGlvbk1hdDQuc2V0VFJTKFZlYzMuWkVSTywgdmFsdWUsIFZlYzMuT05FKTtcbiAgICAgICAgICAgICAgICB0aGlzLl9za3lib3hSb3RhdGlvbk1hdDMuaW52ZXJ0TWF0NCh0aGlzLl9za3lib3hSb3RhdGlvbk1hdDQpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBvbmx5IHJlc2V0IHNreSAvIHJlYnVpbGQgc2NlbmUgc2hhZGVycyBpZiByb3RhdGlvbiBjaGFuZ2VkIGF3YXkgZnJvbSBpZGVudGl0eSBmb3IgdGhlIGZpcnN0IHRpbWVcbiAgICAgICAgICAgIGlmICghdGhpcy5fc2t5Ym94Um90YXRpb25TaGFkZXJJbmNsdWRlICYmICFpc0lkZW50aXR5KSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fc2t5Ym94Um90YXRpb25TaGFkZXJJbmNsdWRlID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB0aGlzLl9yZXNldFNreSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2V0IHNreWJveFJvdGF0aW9uKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fc2t5Ym94Um90YXRpb247XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVGhlIHRvbmVtYXBwaW5nIHRyYW5zZm9ybSB0byBhcHBseSB3aGVuIHdyaXRpbmcgZnJhZ21lbnRzIHRvIHRoZSBmcmFtZSBidWZmZXIuIENhbiBiZTpcbiAgICAgKlxuICAgICAqIC0ge0BsaW5rIFRPTkVNQVBfTElORUFSfVxuICAgICAqIC0ge0BsaW5rIFRPTkVNQVBfRklMTUlDfVxuICAgICAqIC0ge0BsaW5rIFRPTkVNQVBfSEVKTH1cbiAgICAgKiAtIHtAbGluayBUT05FTUFQX0FDRVN9XG4gICAgICogLSB7QGxpbmsgVE9ORU1BUF9BQ0VTMn1cbiAgICAgKlxuICAgICAqIERlZmF1bHRzIHRvIHtAbGluayBUT05FTUFQX0xJTkVBUn0uXG4gICAgICpcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqL1xuICAgIHNldCB0b25lTWFwcGluZyh2YWx1ZSkge1xuICAgICAgICBpZiAodmFsdWUgIT09IHRoaXMuX3RvbmVNYXBwaW5nKSB7XG4gICAgICAgICAgICB0aGlzLl90b25lTWFwcGluZyA9IHZhbHVlO1xuICAgICAgICAgICAgdGhpcy51cGRhdGVTaGFkZXJzID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGdldCB0b25lTWFwcGluZygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3RvbmVNYXBwaW5nO1xuICAgIH1cblxuICAgIGRlc3Ryb3koKSB7XG4gICAgICAgIHRoaXMuX3Jlc2V0U2t5KCk7XG4gICAgICAgIHRoaXMucm9vdCA9IG51bGw7XG4gICAgICAgIHRoaXMub2ZmKCk7XG4gICAgfVxuXG4gICAgZHJhd0xpbmUoc3RhcnQsIGVuZCwgY29sb3IgPSBDb2xvci5XSElURSwgZGVwdGhUZXN0ID0gdHJ1ZSwgbGF5ZXIgPSB0aGlzLmRlZmF1bHREcmF3TGF5ZXIpIHtcbiAgICAgICAgY29uc3QgYmF0Y2ggPSB0aGlzLmltbWVkaWF0ZS5nZXRCYXRjaChsYXllciwgZGVwdGhUZXN0KTtcbiAgICAgICAgYmF0Y2guYWRkTGluZXMoW3N0YXJ0LCBlbmRdLCBbY29sb3IsIGNvbG9yXSk7XG4gICAgfVxuXG4gICAgZHJhd0xpbmVzKHBvc2l0aW9ucywgY29sb3JzLCBkZXB0aFRlc3QgPSB0cnVlLCBsYXllciA9IHRoaXMuZGVmYXVsdERyYXdMYXllcikge1xuICAgICAgICBjb25zdCBiYXRjaCA9IHRoaXMuaW1tZWRpYXRlLmdldEJhdGNoKGxheWVyLCBkZXB0aFRlc3QpO1xuICAgICAgICBiYXRjaC5hZGRMaW5lcyhwb3NpdGlvbnMsIGNvbG9ycyk7XG4gICAgfVxuXG4gICAgZHJhd0xpbmVBcnJheXMocG9zaXRpb25zLCBjb2xvcnMsIGRlcHRoVGVzdCA9IHRydWUsIGxheWVyID0gdGhpcy5kZWZhdWx0RHJhd0xheWVyKSB7XG4gICAgICAgIGNvbnN0IGJhdGNoID0gdGhpcy5pbW1lZGlhdGUuZ2V0QmF0Y2gobGF5ZXIsIGRlcHRoVGVzdCk7XG4gICAgICAgIGJhdGNoLmFkZExpbmVzQXJyYXlzKHBvc2l0aW9ucywgY29sb3JzKTtcbiAgICB9XG5cbiAgICBhcHBseVNldHRpbmdzKHNldHRpbmdzKSB7XG4gICAgICAgIGNvbnN0IHBoeXNpY3MgPSBzZXR0aW5ncy5waHlzaWNzO1xuICAgICAgICBjb25zdCByZW5kZXIgPSBzZXR0aW5ncy5yZW5kZXI7XG5cbiAgICAgICAgLy8gc2V0dGluZ3NcbiAgICAgICAgdGhpcy5fZ3Jhdml0eS5zZXQocGh5c2ljcy5ncmF2aXR5WzBdLCBwaHlzaWNzLmdyYXZpdHlbMV0sIHBoeXNpY3MuZ3Jhdml0eVsyXSk7XG4gICAgICAgIHRoaXMuYW1iaWVudExpZ2h0LnNldChyZW5kZXIuZ2xvYmFsX2FtYmllbnRbMF0sIHJlbmRlci5nbG9iYWxfYW1iaWVudFsxXSwgcmVuZGVyLmdsb2JhbF9hbWJpZW50WzJdKTtcbiAgICAgICAgdGhpcy5hbWJpZW50THVtaW5hbmNlID0gcmVuZGVyLmFtYmllbnRMdW1pbmFuY2U7XG4gICAgICAgIHRoaXMuX2ZvZyA9IHJlbmRlci5mb2c7XG4gICAgICAgIHRoaXMuZm9nQ29sb3Iuc2V0KHJlbmRlci5mb2dfY29sb3JbMF0sIHJlbmRlci5mb2dfY29sb3JbMV0sIHJlbmRlci5mb2dfY29sb3JbMl0pO1xuICAgICAgICB0aGlzLmZvZ1N0YXJ0ID0gcmVuZGVyLmZvZ19zdGFydDtcbiAgICAgICAgdGhpcy5mb2dFbmQgPSByZW5kZXIuZm9nX2VuZDtcbiAgICAgICAgdGhpcy5mb2dEZW5zaXR5ID0gcmVuZGVyLmZvZ19kZW5zaXR5O1xuICAgICAgICB0aGlzLl9nYW1tYUNvcnJlY3Rpb24gPSByZW5kZXIuZ2FtbWFfY29ycmVjdGlvbjtcbiAgICAgICAgdGhpcy5fdG9uZU1hcHBpbmcgPSByZW5kZXIudG9uZW1hcHBpbmc7XG4gICAgICAgIHRoaXMubGlnaHRtYXBTaXplTXVsdGlwbGllciA9IHJlbmRlci5saWdodG1hcFNpemVNdWx0aXBsaWVyO1xuICAgICAgICB0aGlzLmxpZ2h0bWFwTWF4UmVzb2x1dGlvbiA9IHJlbmRlci5saWdodG1hcE1heFJlc29sdXRpb247XG4gICAgICAgIHRoaXMubGlnaHRtYXBNb2RlID0gcmVuZGVyLmxpZ2h0bWFwTW9kZTtcbiAgICAgICAgdGhpcy5leHBvc3VyZSA9IHJlbmRlci5leHBvc3VyZTtcbiAgICAgICAgdGhpcy5fc2t5Ym94SW50ZW5zaXR5ID0gcmVuZGVyLnNreWJveEludGVuc2l0eSA/PyAxO1xuICAgICAgICB0aGlzLl9za3lib3hMdW1pbmFuY2UgPSByZW5kZXIuc2t5Ym94THVtaW5hbmNlID8/IDIwMDAwO1xuICAgICAgICB0aGlzLl9za3lib3hNaXAgPSByZW5kZXIuc2t5Ym94TWlwID8/IDA7XG5cbiAgICAgICAgaWYgKHJlbmRlci5za3lib3hSb3RhdGlvbikge1xuICAgICAgICAgICAgdGhpcy5za3lib3hSb3RhdGlvbiA9IChuZXcgUXVhdCgpKS5zZXRGcm9tRXVsZXJBbmdsZXMocmVuZGVyLnNreWJveFJvdGF0aW9uWzBdLCByZW5kZXIuc2t5Ym94Um90YXRpb25bMV0sIHJlbmRlci5za3lib3hSb3RhdGlvblsyXSk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmNsdXN0ZXJlZExpZ2h0aW5nRW5hYmxlZCA9IHJlbmRlci5jbHVzdGVyZWRMaWdodGluZ0VuYWJsZWQgPz8gZmFsc2U7XG4gICAgICAgIHRoaXMubGlnaHRpbmcuYXBwbHlTZXR0aW5ncyhyZW5kZXIpO1xuXG4gICAgICAgIC8vIGJha2Ugc2V0dGluZ3NcbiAgICAgICAgW1xuICAgICAgICAgICAgJ2xpZ2h0bWFwRmlsdGVyRW5hYmxlZCcsXG4gICAgICAgICAgICAnbGlnaHRtYXBGaWx0ZXJSYW5nZScsXG4gICAgICAgICAgICAnbGlnaHRtYXBGaWx0ZXJTbW9vdGhuZXNzJyxcbiAgICAgICAgICAgICdhbWJpZW50QmFrZScsXG4gICAgICAgICAgICAnYW1iaWVudEJha2VOdW1TYW1wbGVzJyxcbiAgICAgICAgICAgICdhbWJpZW50QmFrZVNwaGVyZVBhcnQnLFxuICAgICAgICAgICAgJ2FtYmllbnRCYWtlT2NjbHVzaW9uQnJpZ2h0bmVzcycsXG4gICAgICAgICAgICAnYW1iaWVudEJha2VPY2NsdXNpb25Db250cmFzdCdcbiAgICAgICAgXS5mb3JFYWNoKChzZXR0aW5nKSA9PiB7XG4gICAgICAgICAgICBpZiAocmVuZGVyLmhhc093blByb3BlcnR5KHNldHRpbmcpKSB7XG4gICAgICAgICAgICAgICAgdGhpc1tzZXR0aW5nXSA9IHJlbmRlcltzZXR0aW5nXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgdGhpcy5fcmVzZXRTa3koKTtcbiAgICB9XG5cbiAgICAvLyBnZXQgdGhlIGFjdHVhbCB0ZXh0dXJlIHRvIHVzZSBmb3Igc2t5Ym94IHJlbmRlcmluZ1xuICAgIF9nZXRTa3lib3hUZXgoKSB7XG4gICAgICAgIGNvbnN0IGN1YmVtYXBzID0gdGhpcy5fcHJlZmlsdGVyZWRDdWJlbWFwcztcblxuICAgICAgICBpZiAodGhpcy5fc2t5Ym94TWlwKSB7XG4gICAgICAgICAgICAvLyBza3lib3ggc2VsZWN0aW9uIGZvciBzb21lIHJlYXNvbiBoYXMgYWx3YXlzIHNraXBwZWQgdGhlIDMyeDMyIHByZWZpbHRlcmVkIG1pcG1hcCwgcHJlc3VtYWJseSBhIGJ1Zy5cbiAgICAgICAgICAgIC8vIHdlIGNhbid0IHNpbXBseSBmaXggdGhpcyBhbmQgbWFwIDMgdG8gdGhlIGNvcnJlY3QgbGV2ZWwsIHNpbmNlIGRvaW5nIHNvIGhhcyB0aGUgcG90ZW50aWFsXG4gICAgICAgICAgICAvLyB0byBjaGFuZ2UgdGhlIGxvb2sgb2YgZXhpc3Rpbmcgc2NlbmVzIGRyYW1hdGljYWxseS5cbiAgICAgICAgICAgIC8vIE5PVEU6IHRoZSB0YWJsZSBza2lwcyB0aGUgMzJ4MzIgbWlwbWFwXG4gICAgICAgICAgICBjb25zdCBza3lib3hNYXBwaW5nID0gWzAsIDEsIC8qIDIgKi8gMywgNCwgNSwgNl07XG5cbiAgICAgICAgICAgIC8vIHNlbGVjdCBibHVycnkgdGV4dHVyZSBmb3IgdXNlIG9uIHRoZSBza3lib3hcbiAgICAgICAgICAgIHJldHVybiBjdWJlbWFwc1tza3lib3hNYXBwaW5nW3RoaXMuX3NreWJveE1pcF1dIHx8IHRoaXMuX2VudkF0bGFzIHx8IGN1YmVtYXBzWzBdIHx8IHRoaXMuX3NreWJveEN1YmVNYXA7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdGhpcy5fc2t5Ym94Q3ViZU1hcCB8fCBjdWJlbWFwc1swXSB8fCB0aGlzLl9lbnZBdGxhcztcbiAgICB9XG5cbiAgICBfdXBkYXRlU2t5KGRldmljZSkge1xuICAgICAgICBpZiAoIXRoaXMuc2t5KSB7XG4gICAgICAgICAgICBjb25zdCB0ZXh0dXJlID0gdGhpcy5fZ2V0U2t5Ym94VGV4KCk7XG4gICAgICAgICAgICBpZiAodGV4dHVyZSkge1xuICAgICAgICAgICAgICAgIHRoaXMuc2t5ID0gbmV3IFNreShkZXZpY2UsIHRoaXMsIHRleHR1cmUpO1xuICAgICAgICAgICAgICAgIHRoaXMuZmlyZSgnc2V0OnNreWJveCcsIHRleHR1cmUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgX3Jlc2V0U2t5KCkge1xuICAgICAgICB0aGlzLnNreT8uZGVzdHJveSgpO1xuICAgICAgICB0aGlzLnNreSA9IG51bGw7XG4gICAgICAgIHRoaXMudXBkYXRlU2hhZGVycyA9IHRydWU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyB0aGUgY3ViZW1hcCBmb3IgdGhlIHNjZW5lIHNreWJveC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuLi9wbGF0Zm9ybS9ncmFwaGljcy90ZXh0dXJlLmpzJykuVGV4dHVyZVtdfSBbY3ViZW1hcHNdIC0gQW4gYXJyYXkgb2ZcbiAgICAgKiBjdWJlbWFwcyBjb3JyZXNwb25kaW5nIHRvIHRoZSBza3lib3ggYXQgZGlmZmVyZW50IG1pcCBsZXZlbHMuIElmIHVuZGVmaW5lZCwgc2NlbmUgd2lsbFxuICAgICAqIHJlbW92ZSBza3lib3guIEN1YmVtYXAgYXJyYXkgc2hvdWxkIGJlIG9mIHNpemUgNywgd2l0aCB0aGUgZmlyc3QgZWxlbWVudCAoaW5kZXggMClcbiAgICAgKiBjb3JyZXNwb25kaW5nIHRvIHRoZSBiYXNlIGN1YmVtYXAgKG1pcCBsZXZlbCAwKSB3aXRoIG9yaWdpbmFsIHJlc29sdXRpb24uIEVhY2ggcmVtYWluaW5nXG4gICAgICogZWxlbWVudCAoaW5kZXggMS02KSBjb3JyZXNwb25kcyB0byBhIGZpeGVkIHByZWZpbHRlcmVkIHJlc29sdXRpb24gKDEyOHgxMjgsIDY0eDY0LCAzMngzMixcbiAgICAgKiAxNngxNiwgOHg4LCA0eDQpLlxuICAgICAqL1xuICAgIHNldFNreWJveChjdWJlbWFwcykge1xuICAgICAgICBpZiAoIWN1YmVtYXBzKSB7XG4gICAgICAgICAgICB0aGlzLnNreWJveCA9IG51bGw7XG4gICAgICAgICAgICB0aGlzLmVudkF0bGFzID0gbnVsbDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuc2t5Ym94ID0gY3ViZW1hcHNbMF0gfHwgbnVsbDtcbiAgICAgICAgICAgIGlmIChjdWJlbWFwc1sxXSAmJiAhY3ViZW1hcHNbMV0uY3ViZW1hcCkge1xuICAgICAgICAgICAgICAgIC8vIHByZWZpbHRlcmVkIGRhdGEgaXMgYW4gZW52IGF0bGFzXG4gICAgICAgICAgICAgICAgdGhpcy5lbnZBdGxhcyA9IGN1YmVtYXBzWzFdO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBwcmVmaWx0ZXJlZCBkYXRhIGlzIGEgc2V0IG9mIGN1YmVtYXBzXG4gICAgICAgICAgICAgICAgdGhpcy5wcmVmaWx0ZXJlZEN1YmVtYXBzID0gY3ViZW1hcHMuc2xpY2UoMSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUaGUgbGlnaHRtYXAgcGl4ZWwgZm9ybWF0LlxuICAgICAqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKi9cbiAgICBnZXQgbGlnaHRtYXBQaXhlbEZvcm1hdCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMubGlnaHRtYXBIRFIgJiYgdGhpcy5kZXZpY2UuZ2V0SGRyRm9ybWF0KGZhbHNlLCB0cnVlLCBmYWxzZSwgdHJ1ZSkgfHwgUElYRUxGT1JNQVRfUkdCQTg7XG4gICAgfVxufVxuXG5leHBvcnQgeyBTY2VuZSB9O1xuIl0sIm5hbWVzIjpbIlNjZW5lIiwiRXZlbnRIYW5kbGVyIiwiY29uc3RydWN0b3IiLCJncmFwaGljc0RldmljZSIsImFtYmllbnRCYWtlIiwiYW1iaWVudEJha2VPY2NsdXNpb25CcmlnaHRuZXNzIiwiYW1iaWVudEJha2VPY2NsdXNpb25Db250cmFzdCIsImFtYmllbnRMaWdodCIsIkNvbG9yIiwiYW1iaWVudEx1bWluYW5jZSIsImV4cG9zdXJlIiwiZm9nQ29sb3IiLCJmb2dEZW5zaXR5IiwiZm9nRW5kIiwiZm9nU3RhcnQiLCJsaWdodG1hcFNpemVNdWx0aXBsaWVyIiwibGlnaHRtYXBNYXhSZXNvbHV0aW9uIiwibGlnaHRtYXBNb2RlIiwiQkFLRV9DT0xPUkRJUiIsImxpZ2h0bWFwRmlsdGVyRW5hYmxlZCIsImxpZ2h0bWFwSERSIiwicm9vdCIsInNreSIsInBoeXNpY2FsVW5pdHMiLCJEZWJ1ZyIsImFzc2VydERlcHJlY2F0ZWQiLCJkZXZpY2UiLCJHcmFwaGljc0RldmljZUFjY2VzcyIsImdldCIsIl9ncmF2aXR5IiwiVmVjMyIsIl9sYXllcnMiLCJfZm9nIiwiRk9HX05PTkUiLCJfZ2FtbWFDb3JyZWN0aW9uIiwiR0FNTUFfU1JHQiIsIl90b25lTWFwcGluZyIsIl9za3lib3hDdWJlTWFwIiwiX3ByZWZpbHRlcmVkQ3ViZW1hcHMiLCJfZW52QXRsYXMiLCJfaW50ZXJuYWxFbnZBdGxhcyIsIl9za3lib3hJbnRlbnNpdHkiLCJfc2t5Ym94THVtaW5hbmNlIiwiX3NreWJveE1pcCIsIl9za3lib3hSb3RhdGlvblNoYWRlckluY2x1ZGUiLCJfc2t5Ym94Um90YXRpb24iLCJRdWF0IiwiX3NreWJveFJvdGF0aW9uTWF0MyIsIk1hdDMiLCJfc2t5Ym94Um90YXRpb25NYXQ0IiwiTWF0NCIsIl9hbWJpZW50QmFrZU51bVNhbXBsZXMiLCJfYW1iaWVudEJha2VTcGhlcmVQYXJ0IiwiX2xpZ2h0bWFwRmlsdGVyUmFuZ2UiLCJfbGlnaHRtYXBGaWx0ZXJTbW9vdGhuZXNzIiwiX2NsdXN0ZXJlZExpZ2h0aW5nRW5hYmxlZCIsIl9saWdodGluZ1BhcmFtcyIsIkxpZ2h0aW5nUGFyYW1zIiwic3VwcG9ydHNBcmVhTGlnaHRzIiwibWF4VGV4dHVyZVNpemUiLCJ1cGRhdGVTaGFkZXJzIiwiX3N0YXRzIiwibWVzaEluc3RhbmNlcyIsImxpZ2h0cyIsImR5bmFtaWNMaWdodHMiLCJiYWtlZExpZ2h0cyIsInVwZGF0ZVNoYWRlcnNUaW1lIiwiX3NoYWRlclZlcnNpb24iLCJpbW1lZGlhdGUiLCJJbW1lZGlhdGUiLCJkZWZhdWx0RHJhd0xheWVyIiwibGF5ZXJzIiwiZ2V0TGF5ZXJCeUlkIiwiTEFZRVJJRF9JTU1FRElBVEUiLCJhbWJpZW50QmFrZU51bVNhbXBsZXMiLCJ2YWx1ZSIsIm1hdGgiLCJjbGFtcCIsIk1hdGgiLCJmbG9vciIsImFtYmllbnRCYWtlU3BoZXJlUGFydCIsImNsdXN0ZXJlZExpZ2h0aW5nRW5hYmxlZCIsImlzV2ViR1BVIiwid2Fybk9uY2UiLCJjb25zb2xlIiwiZXJyb3IiLCJlbnZBdGxhcyIsImFkZHJlc3NVIiwiQUREUkVTU19DTEFNUF9UT19FREdFIiwiYWRkcmVzc1YiLCJtaW5GaWx0ZXIiLCJGSUxURVJfTElORUFSIiwibWFnRmlsdGVyIiwibWlwbWFwcyIsImRlc3Ryb3kiLCJfcmVzZXRTa3kiLCJmb2ciLCJ0eXBlIiwiZ2FtbWFDb3JyZWN0aW9uIiwicHJldiIsImZpcmUiLCJsaWdodGluZyIsImxpZ2h0bWFwRmlsdGVyUmFuZ2UiLCJtYXgiLCJsaWdodG1hcEZpbHRlclNtb290aG5lc3MiLCJwcmVmaWx0ZXJlZEN1YmVtYXBzIiwiY3ViZW1hcHMiLCJjaGFuZ2VkIiwibGVuZ3RoIiwic29tZSIsImMiLCJpIiwiY29tcGxldGUiLCJldmVyeSIsIkVudkxpZ2h0aW5nIiwiZ2VuZXJhdGVQcmVmaWx0ZXJlZEF0bGFzIiwidGFyZ2V0Iiwic2xpY2UiLCJza3lib3giLCJza3lib3hJbnRlbnNpdHkiLCJza3lib3hMdW1pbmFuY2UiLCJza3lib3hNaXAiLCJza3lib3hSb3RhdGlvbiIsImVxdWFscyIsImlzSWRlbnRpdHkiLCJJREVOVElUWSIsImNvcHkiLCJzZXRJZGVudGl0eSIsInNldFRSUyIsIlpFUk8iLCJPTkUiLCJpbnZlcnRNYXQ0IiwidG9uZU1hcHBpbmciLCJvZmYiLCJkcmF3TGluZSIsInN0YXJ0IiwiZW5kIiwiY29sb3IiLCJXSElURSIsImRlcHRoVGVzdCIsImxheWVyIiwiYmF0Y2giLCJnZXRCYXRjaCIsImFkZExpbmVzIiwiZHJhd0xpbmVzIiwicG9zaXRpb25zIiwiY29sb3JzIiwiZHJhd0xpbmVBcnJheXMiLCJhZGRMaW5lc0FycmF5cyIsImFwcGx5U2V0dGluZ3MiLCJzZXR0aW5ncyIsIl9yZW5kZXIkc2t5Ym94SW50ZW5zaSIsIl9yZW5kZXIkc2t5Ym94THVtaW5hbiIsIl9yZW5kZXIkc2t5Ym94TWlwIiwiX3JlbmRlciRjbHVzdGVyZWRMaWdoIiwicGh5c2ljcyIsInJlbmRlciIsInNldCIsImdyYXZpdHkiLCJnbG9iYWxfYW1iaWVudCIsImZvZ19jb2xvciIsImZvZ19zdGFydCIsImZvZ19lbmQiLCJmb2dfZGVuc2l0eSIsImdhbW1hX2NvcnJlY3Rpb24iLCJ0b25lbWFwcGluZyIsInNldEZyb21FdWxlckFuZ2xlcyIsImZvckVhY2giLCJzZXR0aW5nIiwiaGFzT3duUHJvcGVydHkiLCJfZ2V0U2t5Ym94VGV4Iiwic2t5Ym94TWFwcGluZyIsIl91cGRhdGVTa3kiLCJ0ZXh0dXJlIiwiU2t5IiwiX3RoaXMkc2t5Iiwic2V0U2t5Ym94IiwiY3ViZW1hcCIsImxpZ2h0bWFwUGl4ZWxGb3JtYXQiLCJnZXRIZHJGb3JtYXQiLCJQSVhFTEZPUk1BVF9SR0JBOCJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7OztBQWtCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLE1BQU1BLEtBQUssU0FBU0MsWUFBWSxDQUFDO0FBbUo3QjtBQUNK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
