import { math } from '../core/math/math.js';
import { Color } from '../core/math/color.js';
import { Mat4 } from '../core/math/mat4.js';
import { Vec2 } from '../core/math/vec2.js';
import { Vec3 } from '../core/math/vec3.js';
import { Vec4 } from '../core/math/vec4.js';
import { LIGHTTYPE_DIRECTIONAL, MASK_AFFECT_DYNAMIC, LIGHTFALLOFF_LINEAR, SHADOW_PCF3, BLUR_GAUSSIAN, LIGHTSHAPE_PUNCTUAL, SHADOWUPDATE_REALTIME, LIGHTTYPE_OMNI, SHADOW_PCSS, SHADOW_PCF5, SHADOW_VSM32, SHADOW_VSM16, SHADOW_VSM8, SHADOW_PCF1, MASK_BAKE, SHADOWUPDATE_NONE, SHADOWUPDATE_THISFRAME, LIGHTTYPE_SPOT } from './constants.js';
import { ShadowRenderer } from './renderer/shadow-renderer.js';

const tmpVec = new Vec3();
const tmpBiases = {
  bias: 0,
  normalBias: 0
};
const chanId = {
  r: 0,
  g: 1,
  b: 2,
  a: 3
};
const lightTypes = {
  'directional': LIGHTTYPE_DIRECTIONAL,
  'omni': LIGHTTYPE_OMNI,
  'point': LIGHTTYPE_OMNI,
  'spot': LIGHTTYPE_SPOT
};

// viewport in shadows map for cascades for directional light
const directionalCascades = [[new Vec4(0, 0, 1, 1)], [new Vec4(0, 0, 0.5, 0.5), new Vec4(0, 0.5, 0.5, 0.5)], [new Vec4(0, 0, 0.5, 0.5), new Vec4(0, 0.5, 0.5, 0.5), new Vec4(0.5, 0, 0.5, 0.5)], [new Vec4(0, 0, 0.5, 0.5), new Vec4(0, 0.5, 0.5, 0.5), new Vec4(0.5, 0, 0.5, 0.5), new Vec4(0.5, 0.5, 0.5, 0.5)]];
let id = 0;

/**
 * Class storing shadow rendering related private information
 *
 * @ignore
 */
class LightRenderData {
  constructor(device, camera, face, light) {
    // light this data belongs to
    this.light = light;

    // camera this applies to. Only used by directional light, as directional shadow map
    // is culled and rendered for each camera. Local lights' shadow is culled and rendered one time
    // and shared between cameras (even though it's not strictly correct and we can get shadows
    // from a mesh that is not visible by the camera)
    this.camera = camera;

    // camera used to cull / render the shadow map
    this.shadowCamera = ShadowRenderer.createShadowCamera(device, light._shadowType, light._type, face);

    // shadow view-projection matrix
    this.shadowMatrix = new Mat4();

    // viewport for the shadow rendering to the texture (x, y, width, height)
    this.shadowViewport = new Vec4(0, 0, 1, 1);

    // scissor rectangle for the shadow rendering to the texture (x, y, width, height)
    this.shadowScissor = new Vec4(0, 0, 1, 1);

    // depth range compensation for PCSS with directional lights
    this.depthRangeCompensation = 0;
    this.projectionCompensation = 0;

    // face index, value is based on light type:
    // - spot: always 0
    // - omni: cubemap face, 0..5
    // - directional: 0 for simple shadows, cascade index for cascaded shadow map
    this.face = face;

    // visible shadow casters
    this.visibleCasters = [];

    // an array of view bind groups, single entry is used for shadows
    /** @type {import('../platform/graphics/bind-group.js').BindGroup[]} */
    this.viewBindGroups = [];
  }

  // releases GPU resources
  destroy() {
    this.viewBindGroups.forEach(bg => {
      bg.defaultUniformBuffer.destroy();
      bg.destroy();
    });
    this.viewBindGroups.length = 0;
  }

  // returns shadow buffer currently attached to the shadow camera
  get shadowBuffer() {
    const rt = this.shadowCamera.renderTarget;
    if (rt) {
      const light = this.light;
      if (light._type === LIGHTTYPE_OMNI) {
        return rt.colorBuffer;
      }
      return light._isPcf && light.device.supportsDepthShadow ? rt.depthBuffer : rt.colorBuffer;
    }
    return null;
  }
}

/**
 * A light.
 *
 * @ignore
 */
class Light {
  constructor(graphicsDevice) {
    /**
     * The Layers the light is on.
     *
     * @type {Set<import('./layer.js').Layer>}
     */
    this.layers = new Set();
    this.device = graphicsDevice;
    this.id = id++;

    // Light properties (defaults)
    this._type = LIGHTTYPE_DIRECTIONAL;
    this._color = new Color(0.8, 0.8, 0.8);
    this._intensity = 1;
    this._affectSpecularity = true;
    this._luminance = 0;
    this._castShadows = false;
    this._enabled = false;
    this._mask = MASK_AFFECT_DYNAMIC;
    this.isStatic = false;
    this.key = 0;
    this.bakeDir = true;
    this.bakeNumSamples = 1;
    this.bakeArea = 0;

    // Omni and spot properties
    this.attenuationStart = 10;
    this.attenuationEnd = 10;
    this._falloffMode = LIGHTFALLOFF_LINEAR;
    this._shadowType = SHADOW_PCF3;
    this._vsmBlurSize = 11;
    this.vsmBlurMode = BLUR_GAUSSIAN;
    this.vsmBias = 0.01 * 0.25;
    this._cookie = null; // light cookie texture (2D for spot, cubemap for omni)
    this.cookieIntensity = 1;
    this._cookieFalloff = true;
    this._cookieChannel = 'rgb';
    this._cookieTransform = null; // 2d rotation/scale matrix (spot only)
    this._cookieTransformUniform = new Float32Array(4);
    this._cookieOffset = null; // 2d position offset (spot only)
    this._cookieOffsetUniform = new Float32Array(2);
    this._cookieTransformSet = false;
    this._cookieOffsetSet = false;

    // Spot properties
    this._innerConeAngle = 40;
    this._outerConeAngle = 45;

    // Directional properties
    this.cascades = null; // an array of Vec4 viewports per cascade
    this._shadowMatrixPalette = null; // a float array, 16 floats per cascade
    this._shadowCascadeDistances = null;
    this.numCascades = 1;
    this.cascadeDistribution = 0.5;

    // Light source shape properties
    this._shape = LIGHTSHAPE_PUNCTUAL;

    // Cache of light property data in a format more friendly for shader uniforms
    this._finalColor = new Float32Array([0.8, 0.8, 0.8]);
    const c = Math.pow(this._finalColor[0], 2.2);
    this._linearFinalColor = new Float32Array([c, c, c]);
    this._position = new Vec3(0, 0, 0);
    this._direction = new Vec3(0, 0, 0);
    this._innerConeAngleCos = Math.cos(this._innerConeAngle * Math.PI / 180);
    this._updateOuterAngle(this._outerConeAngle);
    this._usePhysicalUnits = undefined;

    // Shadow mapping resources
    this._shadowMap = null;
    this._shadowRenderParams = [];
    this._shadowCameraParams = [];

    // Shadow mapping properties
    this.shadowDistance = 40;
    this._shadowResolution = 1024;
    this.shadowBias = -0.0005;
    this.shadowIntensity = 1.0;
    this._normalOffsetBias = 0.0;
    this.shadowUpdateMode = SHADOWUPDATE_REALTIME;
    this.shadowUpdateOverrides = null;
    this._penumbraSize = 1.0;
    this._isVsm = false;
    this._isPcf = true;

    // cookie matrix (used in case the shadow mapping is disabled and so the shadow matrix cannot be used)
    this._cookieMatrix = null;

    // viewport of the cookie texture / shadow in the atlas
    this._atlasViewport = null;
    this.atlasViewportAllocated = false; // if true, atlas slot is allocated for the current frame
    this.atlasVersion = 0; // version of the atlas for the allocated slot, allows invalidation when atlas recreates slots
    this.atlasSlotIndex = 0; // allocated slot index, used for more persistent slot allocation
    this.atlasSlotUpdated = false; // true if the atlas slot was reassigned this frame (and content needs to be updated)

    this._node = null;

    // private rendering data
    this._renderData = [];

    // true if the light is visible by any camera within a frame
    this.visibleThisFrame = false;

    // maximum size of the light bounding sphere on the screen by any camera within a frame
    // (used to estimate shadow resolution), range [0..1]
    this.maxScreenSize = 0;
  }
  destroy() {
    this._destroyShadowMap();
    this.releaseRenderData();
    this._renderData = null;
  }
  releaseRenderData() {
    if (this._renderData) {
      for (let i = 0; i < this._renderData.length; i++) {
        this._renderData[i].destroy();
      }
      this._renderData.length = 0;
    }
  }
  addLayer(layer) {
    this.layers.add(layer);
  }
  removeLayer(layer) {
    this.layers.delete(layer);
  }
  set numCascades(value) {
    if (!this.cascades || this.numCascades !== value) {
      this.cascades = directionalCascades[value - 1];
      this._shadowMatrixPalette = new Float32Array(4 * 16); // always 4
      this._shadowCascadeDistances = new Float32Array(4); // always 4
      this._destroyShadowMap();
      this.updateKey();
    }
  }
  get numCascades() {
    return this.cascades.length;
  }
  set shadowMap(shadowMap) {
    if (this._shadowMap !== shadowMap) {
      this._destroyShadowMap();
      this._shadowMap = shadowMap;
    }
  }
  get shadowMap() {
    return this._shadowMap;
  }
  set mask(value) {
    if (this._mask !== value) {
      this._mask = value;
      this.updateKey();
    }
  }
  get mask() {
    return this._mask;
  }

  // returns number of render targets to render the shadow map
  get numShadowFaces() {
    const type = this._type;
    if (type === LIGHTTYPE_DIRECTIONAL) {
      return this.numCascades;
    } else if (type === LIGHTTYPE_OMNI) {
      return 6;
    }
    return 1;
  }
  set type(value) {
    if (this._type === value) return;
    this._type = value;
    this._destroyShadowMap();
    this.updateKey();
    const stype = this._shadowType;
    this._shadowType = null;
    this.shadowUpdateOverrides = null;
    this.shadowType = stype; // refresh shadow type; switching from direct/spot to omni and back may change it
  }

  get type() {
    return this._type;
  }
  set shape(value) {
    if (this._shape === value) return;
    this._shape = value;
    this._destroyShadowMap();
    this.updateKey();
    const stype = this._shadowType;
    this._shadowType = null;
    this.shadowType = stype; // refresh shadow type; switching shape and back may change it
  }

  get shape() {
    return this._shape;
  }
  set usePhysicalUnits(value) {
    if (this._usePhysicalUnits !== value) {
      this._usePhysicalUnits = value;
      this._updateFinalColor();
    }
  }
  get usePhysicalUnits() {
    return this._usePhysicalUnits;
  }
  set shadowType(value) {
    if (this._shadowType === value) return;
    const device = this.device;
    if (this._type === LIGHTTYPE_OMNI && value !== SHADOW_PCF3 && value !== SHADOW_PCSS) value = SHADOW_PCF3; // VSM or HW PCF for omni lights is not supported yet

    const supportsDepthShadow = device.supportsDepthShadow;
    if (value === SHADOW_PCF5 && !supportsDepthShadow) {
      value = SHADOW_PCF3; // fallback from HW PCF to old PCF
    }

    if (value === SHADOW_VSM32 && !device.textureFloatRenderable)
      // fallback from vsm32 to vsm16
      value = SHADOW_VSM16;
    if (value === SHADOW_VSM16 && !device.textureHalfFloatRenderable)
      // fallback from vsm16 to vsm8
      value = SHADOW_VSM8;
    this._isVsm = value >= SHADOW_VSM8 && value <= SHADOW_VSM32;
    this._isPcf = value === SHADOW_PCF1 || value === SHADOW_PCF3 || value === SHADOW_PCF5;
    this._shadowType = value;
    this._destroyShadowMap();
    this.updateKey();
  }
  get shadowType() {
    return this._shadowType;
  }
  set enabled(value) {
    if (this._enabled !== value) {
      this._enabled = value;
      this.layersDirty();
    }
  }
  get enabled() {
    return this._enabled;
  }
  set castShadows(value) {
    if (this._castShadows !== value) {
      this._castShadows = value;
      this._destroyShadowMap();
      this.layersDirty();
      this.updateKey();
    }
  }
  get castShadows() {
    return this._castShadows && this._mask !== MASK_BAKE && this._mask !== 0;
  }
  set shadowResolution(value) {
    if (this._shadowResolution !== value) {
      if (this._type === LIGHTTYPE_OMNI) {
        value = Math.min(value, this.device.maxCubeMapSize);
      } else {
        value = Math.min(value, this.device.maxTextureSize);
      }
      this._shadowResolution = value;
      this._destroyShadowMap();
    }
  }
  get shadowResolution() {
    return this._shadowResolution;
  }
  set vsmBlurSize(value) {
    if (this._vsmBlurSize === value) return;
    if (value % 2 === 0) value++; // don't allow even size
    this._vsmBlurSize = value;
  }
  get vsmBlurSize() {
    return this._vsmBlurSize;
  }
  set normalOffsetBias(value) {
    if (this._normalOffsetBias === value) return;
    if (!this._normalOffsetBias && value || this._normalOffsetBias && !value) {
      this.updateKey();
    }
    this._normalOffsetBias = value;
  }
  get normalOffsetBias() {
    return this._normalOffsetBias;
  }
  set falloffMode(value) {
    if (this._falloffMode === value) return;
    this._falloffMode = value;
    this.updateKey();
  }
  get falloffMode() {
    return this._falloffMode;
  }
  set innerConeAngle(value) {
    if (this._innerConeAngle === value) return;
    this._innerConeAngle = value;
    this._innerConeAngleCos = Math.cos(value * Math.PI / 180);
    if (this._usePhysicalUnits) {
      this._updateFinalColor();
    }
  }
  get innerConeAngle() {
    return this._innerConeAngle;
  }
  set outerConeAngle(value) {
    if (this._outerConeAngle === value) return;
    this._outerConeAngle = value;
    this._updateOuterAngle(value);
    if (this._usePhysicalUnits) {
      this._updateFinalColor();
    }
  }
  get outerConeAngle() {
    return this._outerConeAngle;
  }
  set penumbraSize(value) {
    this._penumbraSize = value;
  }
  get penumbraSize() {
    return this._penumbraSize;
  }
  _updateOuterAngle(angle) {
    const radAngle = angle * Math.PI / 180;
    this._outerConeAngleCos = Math.cos(radAngle);
    this._outerConeAngleSin = Math.sin(radAngle);
  }
  set intensity(value) {
    if (this._intensity !== value) {
      this._intensity = value;
      this._updateFinalColor();
    }
  }
  get intensity() {
    return this._intensity;
  }
  set affectSpecularity(value) {
    if (this._type === LIGHTTYPE_DIRECTIONAL) {
      this._affectSpecularity = value;
      this.updateKey();
    }
  }
  get affectSpecularity() {
    return this._affectSpecularity;
  }
  set luminance(value) {
    if (this._luminance !== value) {
      this._luminance = value;
      this._updateFinalColor();
    }
  }
  get luminance() {
    return this._luminance;
  }
  get cookieMatrix() {
    if (!this._cookieMatrix) {
      this._cookieMatrix = new Mat4();
    }
    return this._cookieMatrix;
  }
  get atlasViewport() {
    if (!this._atlasViewport) {
      this._atlasViewport = new Vec4(0, 0, 1, 1);
    }
    return this._atlasViewport;
  }
  set cookie(value) {
    if (this._cookie === value) return;
    this._cookie = value;
    this.updateKey();
  }
  get cookie() {
    return this._cookie;
  }
  set cookieFalloff(value) {
    if (this._cookieFalloff === value) return;
    this._cookieFalloff = value;
    this.updateKey();
  }
  get cookieFalloff() {
    return this._cookieFalloff;
  }
  set cookieChannel(value) {
    if (this._cookieChannel === value) return;
    if (value.length < 3) {
      const chr = value.charAt(value.length - 1);
      const addLen = 3 - value.length;
      for (let i = 0; i < addLen; i++) value += chr;
    }
    this._cookieChannel = value;
    this.updateKey();
  }
  get cookieChannel() {
    return this._cookieChannel;
  }
  set cookieTransform(value) {
    if (this._cookieTransform === value) return;
    this._cookieTransform = value;
    this._cookieTransformSet = !!value;
    if (value && !this._cookieOffset) {
      this.cookieOffset = new Vec2(); // using transform forces using offset code
      this._cookieOffsetSet = false;
    }
    this.updateKey();
  }
  get cookieTransform() {
    return this._cookieTransform;
  }
  set cookieOffset(value) {
    if (this._cookieOffset === value) return;
    const xformNew = !!(this._cookieTransformSet || value);
    if (xformNew && !value && this._cookieOffset) {
      this._cookieOffset.set(0, 0);
    } else {
      this._cookieOffset = value;
    }
    this._cookieOffsetSet = !!value;
    if (value && !this._cookieTransform) {
      this.cookieTransform = new Vec4(1, 1, 0, 0); // using offset forces using matrix code
      this._cookieTransformSet = false;
    }
    this.updateKey();
  }
  get cookieOffset() {
    return this._cookieOffset;
  }

  // prepares light for the frame rendering
  beginFrame() {
    this.visibleThisFrame = this._type === LIGHTTYPE_DIRECTIONAL && this._enabled;
    this.maxScreenSize = 0;
    this.atlasViewportAllocated = false;
    this.atlasSlotUpdated = false;
  }

  // destroys shadow map related resources, called when shadow properties change and resources
  // need to be recreated
  _destroyShadowMap() {
    this.releaseRenderData();
    if (this._shadowMap) {
      if (!this._shadowMap.cached) {
        this._shadowMap.destroy();
      }
      this._shadowMap = null;
    }
    if (this.shadowUpdateMode === SHADOWUPDATE_NONE) {
      this.shadowUpdateMode = SHADOWUPDATE_THISFRAME;
    }
    if (this.shadowUpdateOverrides) {
      for (let i = 0; i < this.shadowUpdateOverrides.length; i++) {
        if (this.shadowUpdateOverrides[i] === SHADOWUPDATE_NONE) {
          this.shadowUpdateOverrides[i] = SHADOWUPDATE_THISFRAME;
        }
      }
    }
  }

  // returns LightRenderData with matching camera and face
  getRenderData(camera, face) {
    // returns existing
    for (let i = 0; i < this._renderData.length; i++) {
      const current = this._renderData[i];
      if (current.camera === camera && current.face === face) {
        return current;
      }
    }

    // create new one
    const rd = new LightRenderData(this.device, camera, face, this);
    this._renderData.push(rd);
    return rd;
  }

  /**
   * Duplicates a light node but does not 'deep copy' the hierarchy.
   *
   * @returns {Light} A cloned Light.
   */
  clone() {
    const clone = new Light(this.device);

    // Clone Light properties
    clone.type = this._type;
    clone.setColor(this._color);
    clone.intensity = this._intensity;
    clone.affectSpecularity = this._affectSpecularity;
    clone.luminance = this._luminance;
    clone.castShadows = this.castShadows;
    clone._enabled = this._enabled;

    // Omni and spot properties
    clone.attenuationStart = this.attenuationStart;
    clone.attenuationEnd = this.attenuationEnd;
    clone.falloffMode = this._falloffMode;
    clone.shadowType = this._shadowType;
    clone.vsmBlurSize = this._vsmBlurSize;
    clone.vsmBlurMode = this.vsmBlurMode;
    clone.vsmBias = this.vsmBias;
    clone.penumbraSize = this.penumbraSize;
    clone.shadowUpdateMode = this.shadowUpdateMode;
    clone.mask = this.mask;
    if (this.shadowUpdateOverrides) {
      clone.shadowUpdateOverrides = this.shadowUpdateOverrides.slice();
    }

    // Spot properties
    clone.innerConeAngle = this._innerConeAngle;
    clone.outerConeAngle = this._outerConeAngle;

    // Directional properties
    clone.numCascades = this.numCascades;
    clone.cascadeDistribution = this.cascadeDistribution;

    // shape properties
    clone.shape = this._shape;

    // Shadow properties
    clone.shadowBias = this.shadowBias;
    clone.normalOffsetBias = this._normalOffsetBias;
    clone.shadowResolution = this._shadowResolution;
    clone.shadowDistance = this.shadowDistance;
    clone.shadowIntensity = this.shadowIntensity;

    // Cookies properties
    // clone.cookie = this._cookie;
    // clone.cookieIntensity = this.cookieIntensity;
    // clone.cookieFalloff = this._cookieFalloff;
    // clone.cookieChannel = this._cookieChannel;
    // clone.cookieTransform = this._cookieTransform;
    // clone.cookieOffset = this._cookieOffset;

    return clone;
  }

  /**
   * Get conversion factor for luminance -> light specific light unit.
   *
   * @param {number} type - The type of light.
   * @param {number} [outerAngle] - The outer angle of a spot light.
   * @param {number} [innerAngle] - The inner angle of a spot light.
   * @returns {number} The scaling factor to multiply with the luminance value.
   */
  static getLightUnitConversion(type, outerAngle = Math.PI / 4, innerAngle = 0) {
    switch (type) {
      case LIGHTTYPE_SPOT:
        {
          const falloffEnd = Math.cos(outerAngle);
          const falloffStart = Math.cos(innerAngle);

          // https://github.com/mmp/pbrt-v4/blob/faac34d1a0ebd24928828fe9fa65b65f7efc5937/src/pbrt/lights.cpp#L1463
          return 2 * Math.PI * (1 - falloffStart + (falloffStart - falloffEnd) / 2.0);
        }
      case LIGHTTYPE_OMNI:
        // https://google.github.io/filament/Filament.md.html#lighting/directlighting/punctuallights/pointlights
        return 4 * Math.PI;
      case LIGHTTYPE_DIRECTIONAL:
        // https://google.github.io/filament/Filament.md.html#lighting/directlighting/directionallights
        return 1;
    }
  }

  // returns the bias (.x) and normalBias (.y) value for lights as passed to shaders by uniforms
  // Note: this needs to be revisited and simplified
  // Note: vsmBias is not used at all for omni light, even though it is editable in the Editor
  _getUniformBiasValues(lightRenderData) {
    const farClip = lightRenderData.shadowCamera._farClip;
    switch (this._type) {
      case LIGHTTYPE_OMNI:
        tmpBiases.bias = this.shadowBias;
        tmpBiases.normalBias = this._normalOffsetBias;
        break;
      case LIGHTTYPE_SPOT:
        if (this._isVsm) {
          tmpBiases.bias = -0.00001 * 20;
        } else {
          tmpBiases.bias = this.shadowBias * 20; // approx remap from old bias values
          if (!this.device.webgl2 && this.device.extStandardDerivatives) tmpBiases.bias *= -100;
        }
        tmpBiases.normalBias = this._isVsm ? this.vsmBias / (this.attenuationEnd / 7.0) : this._normalOffsetBias;
        break;
      case LIGHTTYPE_DIRECTIONAL:
        // make bias dependent on far plane because it's not constant for direct light
        // clip distance used is based on the nearest shadow cascade
        if (this._isVsm) {
          tmpBiases.bias = -0.00001 * 20;
        } else {
          tmpBiases.bias = this.shadowBias / farClip * 100;
          if (!this.device.webgl2 && this.device.extStandardDerivatives) tmpBiases.bias *= -100;
        }
        tmpBiases.normalBias = this._isVsm ? this.vsmBias / (farClip / 7.0) : this._normalOffsetBias;
        break;
    }
    return tmpBiases;
  }
  getColor() {
    return this._color;
  }
  getBoundingSphere(sphere) {
    if (this._type === LIGHTTYPE_SPOT) {
      // based on https://bartwronski.com/2017/04/13/cull-that-cone/
      const size = this.attenuationEnd;
      const angle = this._outerConeAngle;
      const cosAngle = this._outerConeAngleCos;
      const node = this._node;
      tmpVec.copy(node.up);
      if (angle > 45) {
        sphere.radius = size * this._outerConeAngleSin;
        tmpVec.mulScalar(-size * cosAngle);
      } else {
        sphere.radius = size / (2 * cosAngle);
        tmpVec.mulScalar(-sphere.radius);
      }
      sphere.center.add2(node.getPosition(), tmpVec);
    } else if (this._type === LIGHTTYPE_OMNI) {
      sphere.center = this._node.getPosition();
      sphere.radius = this.attenuationEnd;
    }
  }
  getBoundingBox(box) {
    if (this._type === LIGHTTYPE_SPOT) {
      const range = this.attenuationEnd;
      const angle = this._outerConeAngle;
      const node = this._node;
      const scl = Math.abs(Math.sin(angle * math.DEG_TO_RAD) * range);
      box.center.set(0, -range * 0.5, 0);
      box.halfExtents.set(scl, range * 0.5, scl);
      box.setFromTransformedAabb(box, node.getWorldTransform(), true);
    } else if (this._type === LIGHTTYPE_OMNI) {
      box.center.copy(this._node.getPosition());
      box.halfExtents.set(this.attenuationEnd, this.attenuationEnd, this.attenuationEnd);
    }
  }
  _updateFinalColor() {
    const color = this._color;
    const r = color.r;
    const g = color.g;
    const b = color.b;
    let i = this._intensity;

    // To calculate the lux, which is lm/m^2, we need to convert from luminous power
    if (this._usePhysicalUnits) {
      i = this._luminance / Light.getLightUnitConversion(this._type, this._outerConeAngle * math.DEG_TO_RAD, this._innerConeAngle * math.DEG_TO_RAD);
    }
    const finalColor = this._finalColor;
    const linearFinalColor = this._linearFinalColor;
    finalColor[0] = r * i;
    finalColor[1] = g * i;
    finalColor[2] = b * i;
    if (i >= 1) {
      linearFinalColor[0] = Math.pow(r, 2.2) * i;
      linearFinalColor[1] = Math.pow(g, 2.2) * i;
      linearFinalColor[2] = Math.pow(b, 2.2) * i;
    } else {
      linearFinalColor[0] = Math.pow(finalColor[0], 2.2);
      linearFinalColor[1] = Math.pow(finalColor[1], 2.2);
      linearFinalColor[2] = Math.pow(finalColor[2], 2.2);
    }
  }
  setColor() {
    if (arguments.length === 1) {
      this._color.set(arguments[0].r, arguments[0].g, arguments[0].b);
    } else if (arguments.length === 3) {
      this._color.set(arguments[0], arguments[1], arguments[2]);
    }
    this._updateFinalColor();
  }
  layersDirty() {
    this.layers.forEach(layer => {
      layer.markLightsDirty();
    });
  }

  /**
   * Updates a integer key for the light. The key is used to identify all shader related features
   * of the light, and so needs to have all properties that modify the generated shader encoded.
   * Properties without an effect on the shader (color, shadow intensity) should not be encoded.
   */
  updateKey() {
    // Key definition:
    // Bit
    // 31      : sign bit (leave)
    // 29 - 30 : type
    // 28      : cast shadows
    // 25 - 27 : shadow type
    // 23 - 24 : falloff mode
    // 22      : normal offset bias
    // 21      : cookie
    // 20      : cookie falloff
    // 18 - 19 : cookie channel R
    // 16 - 17 : cookie channel G
    // 14 - 15 : cookie channel B
    // 12      : cookie transform
    // 10 - 11 : light source shape
    //  8 -  9 : light num cascades
    //  7      : disable specular
    //  6 -  4 : mask
    let key = this._type << 29 | (this._castShadows ? 1 : 0) << 28 | this._shadowType << 25 | this._falloffMode << 23 | (this._normalOffsetBias !== 0.0 ? 1 : 0) << 22 | (this._cookie ? 1 : 0) << 21 | (this._cookieFalloff ? 1 : 0) << 20 | chanId[this._cookieChannel.charAt(0)] << 18 | (this._cookieTransform ? 1 : 0) << 12 | this._shape << 10 | this.numCascades - 1 << 8 | (this.affectSpecularity ? 1 : 0) << 7 | this.mask << 6;
    if (this._cookieChannel.length === 3) {
      key |= chanId[this._cookieChannel.charAt(1)] << 16;
      key |= chanId[this._cookieChannel.charAt(2)] << 14;
    }
    if (key !== this.key) {
      // The layer maintains lights split and sorted by the key, notify it when the key changes
      this.layersDirty();
    }
    this.key = key;
  }
}

export { Light, lightTypes };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGlnaHQuanMiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9zY2VuZS9saWdodC5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBtYXRoIH0gZnJvbSAnLi4vY29yZS9tYXRoL21hdGguanMnO1xuaW1wb3J0IHsgQ29sb3IgfSBmcm9tICcuLi9jb3JlL21hdGgvY29sb3IuanMnO1xuaW1wb3J0IHsgTWF0NCB9IGZyb20gJy4uL2NvcmUvbWF0aC9tYXQ0LmpzJztcbmltcG9ydCB7IFZlYzIgfSBmcm9tICcuLi9jb3JlL21hdGgvdmVjMi5qcyc7XG5pbXBvcnQgeyBWZWMzIH0gZnJvbSAnLi4vY29yZS9tYXRoL3ZlYzMuanMnO1xuaW1wb3J0IHsgVmVjNCB9IGZyb20gJy4uL2NvcmUvbWF0aC92ZWM0LmpzJztcblxuaW1wb3J0IHtcbiAgICBCTFVSX0dBVVNTSUFOLFxuICAgIExJR0hUVFlQRV9ESVJFQ1RJT05BTCwgTElHSFRUWVBFX09NTkksIExJR0hUVFlQRV9TUE9ULFxuICAgIE1BU0tfQkFLRSwgTUFTS19BRkZFQ1RfRFlOQU1JQyxcbiAgICBTSEFET1dfUENGMSwgU0hBRE9XX1BDRjMsIFNIQURPV19QQ0Y1LCBTSEFET1dfVlNNOCwgU0hBRE9XX1ZTTTE2LCBTSEFET1dfVlNNMzIsIFNIQURPV19QQ1NTLFxuICAgIFNIQURPV1VQREFURV9OT05FLCBTSEFET1dVUERBVEVfUkVBTFRJTUUsIFNIQURPV1VQREFURV9USElTRlJBTUUsXG4gICAgTElHSFRTSEFQRV9QVU5DVFVBTCwgTElHSFRGQUxMT0ZGX0xJTkVBUlxufSBmcm9tICcuL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBTaGFkb3dSZW5kZXJlciB9IGZyb20gJy4vcmVuZGVyZXIvc2hhZG93LXJlbmRlcmVyLmpzJztcblxuY29uc3QgdG1wVmVjID0gbmV3IFZlYzMoKTtcbmNvbnN0IHRtcEJpYXNlcyA9IHtcbiAgICBiaWFzOiAwLFxuICAgIG5vcm1hbEJpYXM6IDBcbn07XG5cbmNvbnN0IGNoYW5JZCA9IHsgcjogMCwgZzogMSwgYjogMiwgYTogMyB9O1xuXG5jb25zdCBsaWdodFR5cGVzID0ge1xuICAgICdkaXJlY3Rpb25hbCc6IExJR0hUVFlQRV9ESVJFQ1RJT05BTCxcbiAgICAnb21uaSc6IExJR0hUVFlQRV9PTU5JLFxuICAgICdwb2ludCc6IExJR0hUVFlQRV9PTU5JLFxuICAgICdzcG90JzogTElHSFRUWVBFX1NQT1Rcbn07XG5cbi8vIHZpZXdwb3J0IGluIHNoYWRvd3MgbWFwIGZvciBjYXNjYWRlcyBmb3IgZGlyZWN0aW9uYWwgbGlnaHRcbmNvbnN0IGRpcmVjdGlvbmFsQ2FzY2FkZXMgPSBbXG4gICAgW25ldyBWZWM0KDAsIDAsIDEsIDEpXSxcbiAgICBbbmV3IFZlYzQoMCwgMCwgMC41LCAwLjUpLCBuZXcgVmVjNCgwLCAwLjUsIDAuNSwgMC41KV0sXG4gICAgW25ldyBWZWM0KDAsIDAsIDAuNSwgMC41KSwgbmV3IFZlYzQoMCwgMC41LCAwLjUsIDAuNSksIG5ldyBWZWM0KDAuNSwgMCwgMC41LCAwLjUpXSxcbiAgICBbbmV3IFZlYzQoMCwgMCwgMC41LCAwLjUpLCBuZXcgVmVjNCgwLCAwLjUsIDAuNSwgMC41KSwgbmV3IFZlYzQoMC41LCAwLCAwLjUsIDAuNSksIG5ldyBWZWM0KDAuNSwgMC41LCAwLjUsIDAuNSldXG5dO1xuXG5sZXQgaWQgPSAwO1xuXG4vKipcbiAqIENsYXNzIHN0b3Jpbmcgc2hhZG93IHJlbmRlcmluZyByZWxhdGVkIHByaXZhdGUgaW5mb3JtYXRpb25cbiAqXG4gKiBAaWdub3JlXG4gKi9cbmNsYXNzIExpZ2h0UmVuZGVyRGF0YSB7XG4gICAgY29uc3RydWN0b3IoZGV2aWNlLCBjYW1lcmEsIGZhY2UsIGxpZ2h0KSB7XG5cbiAgICAgICAgLy8gbGlnaHQgdGhpcyBkYXRhIGJlbG9uZ3MgdG9cbiAgICAgICAgdGhpcy5saWdodCA9IGxpZ2h0O1xuXG4gICAgICAgIC8vIGNhbWVyYSB0aGlzIGFwcGxpZXMgdG8uIE9ubHkgdXNlZCBieSBkaXJlY3Rpb25hbCBsaWdodCwgYXMgZGlyZWN0aW9uYWwgc2hhZG93IG1hcFxuICAgICAgICAvLyBpcyBjdWxsZWQgYW5kIHJlbmRlcmVkIGZvciBlYWNoIGNhbWVyYS4gTG9jYWwgbGlnaHRzJyBzaGFkb3cgaXMgY3VsbGVkIGFuZCByZW5kZXJlZCBvbmUgdGltZVxuICAgICAgICAvLyBhbmQgc2hhcmVkIGJldHdlZW4gY2FtZXJhcyAoZXZlbiB0aG91Z2ggaXQncyBub3Qgc3RyaWN0bHkgY29ycmVjdCBhbmQgd2UgY2FuIGdldCBzaGFkb3dzXG4gICAgICAgIC8vIGZyb20gYSBtZXNoIHRoYXQgaXMgbm90IHZpc2libGUgYnkgdGhlIGNhbWVyYSlcbiAgICAgICAgdGhpcy5jYW1lcmEgPSBjYW1lcmE7XG5cbiAgICAgICAgLy8gY2FtZXJhIHVzZWQgdG8gY3VsbCAvIHJlbmRlciB0aGUgc2hhZG93IG1hcFxuICAgICAgICB0aGlzLnNoYWRvd0NhbWVyYSA9IFNoYWRvd1JlbmRlcmVyLmNyZWF0ZVNoYWRvd0NhbWVyYShkZXZpY2UsIGxpZ2h0Ll9zaGFkb3dUeXBlLCBsaWdodC5fdHlwZSwgZmFjZSk7XG5cbiAgICAgICAgLy8gc2hhZG93IHZpZXctcHJvamVjdGlvbiBtYXRyaXhcbiAgICAgICAgdGhpcy5zaGFkb3dNYXRyaXggPSBuZXcgTWF0NCgpO1xuXG4gICAgICAgIC8vIHZpZXdwb3J0IGZvciB0aGUgc2hhZG93IHJlbmRlcmluZyB0byB0aGUgdGV4dHVyZSAoeCwgeSwgd2lkdGgsIGhlaWdodClcbiAgICAgICAgdGhpcy5zaGFkb3dWaWV3cG9ydCA9IG5ldyBWZWM0KDAsIDAsIDEsIDEpO1xuXG4gICAgICAgIC8vIHNjaXNzb3IgcmVjdGFuZ2xlIGZvciB0aGUgc2hhZG93IHJlbmRlcmluZyB0byB0aGUgdGV4dHVyZSAoeCwgeSwgd2lkdGgsIGhlaWdodClcbiAgICAgICAgdGhpcy5zaGFkb3dTY2lzc29yID0gbmV3IFZlYzQoMCwgMCwgMSwgMSk7XG5cbiAgICAgICAgLy8gZGVwdGggcmFuZ2UgY29tcGVuc2F0aW9uIGZvciBQQ1NTIHdpdGggZGlyZWN0aW9uYWwgbGlnaHRzXG4gICAgICAgIHRoaXMuZGVwdGhSYW5nZUNvbXBlbnNhdGlvbiA9IDA7XG4gICAgICAgIHRoaXMucHJvamVjdGlvbkNvbXBlbnNhdGlvbiA9IDA7XG5cbiAgICAgICAgLy8gZmFjZSBpbmRleCwgdmFsdWUgaXMgYmFzZWQgb24gbGlnaHQgdHlwZTpcbiAgICAgICAgLy8gLSBzcG90OiBhbHdheXMgMFxuICAgICAgICAvLyAtIG9tbmk6IGN1YmVtYXAgZmFjZSwgMC4uNVxuICAgICAgICAvLyAtIGRpcmVjdGlvbmFsOiAwIGZvciBzaW1wbGUgc2hhZG93cywgY2FzY2FkZSBpbmRleCBmb3IgY2FzY2FkZWQgc2hhZG93IG1hcFxuICAgICAgICB0aGlzLmZhY2UgPSBmYWNlO1xuXG4gICAgICAgIC8vIHZpc2libGUgc2hhZG93IGNhc3RlcnNcbiAgICAgICAgdGhpcy52aXNpYmxlQ2FzdGVycyA9IFtdO1xuXG4gICAgICAgIC8vIGFuIGFycmF5IG9mIHZpZXcgYmluZCBncm91cHMsIHNpbmdsZSBlbnRyeSBpcyB1c2VkIGZvciBzaGFkb3dzXG4gICAgICAgIC8qKiBAdHlwZSB7aW1wb3J0KCcuLi9wbGF0Zm9ybS9ncmFwaGljcy9iaW5kLWdyb3VwLmpzJykuQmluZEdyb3VwW119ICovXG4gICAgICAgIHRoaXMudmlld0JpbmRHcm91cHMgPSBbXTtcbiAgICB9XG5cbiAgICAvLyByZWxlYXNlcyBHUFUgcmVzb3VyY2VzXG4gICAgZGVzdHJveSgpIHtcbiAgICAgICAgdGhpcy52aWV3QmluZEdyb3Vwcy5mb3JFYWNoKChiZykgPT4ge1xuICAgICAgICAgICAgYmcuZGVmYXVsdFVuaWZvcm1CdWZmZXIuZGVzdHJveSgpO1xuICAgICAgICAgICAgYmcuZGVzdHJveSgpO1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy52aWV3QmluZEdyb3Vwcy5sZW5ndGggPSAwO1xuICAgIH1cblxuICAgIC8vIHJldHVybnMgc2hhZG93IGJ1ZmZlciBjdXJyZW50bHkgYXR0YWNoZWQgdG8gdGhlIHNoYWRvdyBjYW1lcmFcbiAgICBnZXQgc2hhZG93QnVmZmVyKCkge1xuICAgICAgICBjb25zdCBydCA9IHRoaXMuc2hhZG93Q2FtZXJhLnJlbmRlclRhcmdldDtcbiAgICAgICAgaWYgKHJ0KSB7XG4gICAgICAgICAgICBjb25zdCBsaWdodCA9IHRoaXMubGlnaHQ7XG4gICAgICAgICAgICBpZiAobGlnaHQuX3R5cGUgPT09IExJR0hUVFlQRV9PTU5JKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJ0LmNvbG9yQnVmZmVyO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gbGlnaHQuX2lzUGNmICYmIGxpZ2h0LmRldmljZS5zdXBwb3J0c0RlcHRoU2hhZG93ID8gcnQuZGVwdGhCdWZmZXIgOiBydC5jb2xvckJ1ZmZlcjtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbn1cblxuLyoqXG4gKiBBIGxpZ2h0LlxuICpcbiAqIEBpZ25vcmVcbiAqL1xuY2xhc3MgTGlnaHQge1xuICAgIC8qKlxuICAgICAqIFRoZSBMYXllcnMgdGhlIGxpZ2h0IGlzIG9uLlxuICAgICAqXG4gICAgICogQHR5cGUge1NldDxpbXBvcnQoJy4vbGF5ZXIuanMnKS5MYXllcj59XG4gICAgICovXG4gICAgbGF5ZXJzID0gbmV3IFNldCgpO1xuXG4gICAgY29uc3RydWN0b3IoZ3JhcGhpY3NEZXZpY2UpIHtcbiAgICAgICAgdGhpcy5kZXZpY2UgPSBncmFwaGljc0RldmljZTtcbiAgICAgICAgdGhpcy5pZCA9IGlkKys7XG5cbiAgICAgICAgLy8gTGlnaHQgcHJvcGVydGllcyAoZGVmYXVsdHMpXG4gICAgICAgIHRoaXMuX3R5cGUgPSBMSUdIVFRZUEVfRElSRUNUSU9OQUw7XG4gICAgICAgIHRoaXMuX2NvbG9yID0gbmV3IENvbG9yKDAuOCwgMC44LCAwLjgpO1xuICAgICAgICB0aGlzLl9pbnRlbnNpdHkgPSAxO1xuICAgICAgICB0aGlzLl9hZmZlY3RTcGVjdWxhcml0eSA9IHRydWU7XG4gICAgICAgIHRoaXMuX2x1bWluYW5jZSA9IDA7XG4gICAgICAgIHRoaXMuX2Nhc3RTaGFkb3dzID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX2VuYWJsZWQgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fbWFzayA9IE1BU0tfQUZGRUNUX0RZTkFNSUM7XG4gICAgICAgIHRoaXMuaXNTdGF0aWMgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5rZXkgPSAwO1xuICAgICAgICB0aGlzLmJha2VEaXIgPSB0cnVlO1xuICAgICAgICB0aGlzLmJha2VOdW1TYW1wbGVzID0gMTtcbiAgICAgICAgdGhpcy5iYWtlQXJlYSA9IDA7XG5cbiAgICAgICAgLy8gT21uaSBhbmQgc3BvdCBwcm9wZXJ0aWVzXG4gICAgICAgIHRoaXMuYXR0ZW51YXRpb25TdGFydCA9IDEwO1xuICAgICAgICB0aGlzLmF0dGVudWF0aW9uRW5kID0gMTA7XG4gICAgICAgIHRoaXMuX2ZhbGxvZmZNb2RlID0gTElHSFRGQUxMT0ZGX0xJTkVBUjtcbiAgICAgICAgdGhpcy5fc2hhZG93VHlwZSA9IFNIQURPV19QQ0YzO1xuICAgICAgICB0aGlzLl92c21CbHVyU2l6ZSA9IDExO1xuICAgICAgICB0aGlzLnZzbUJsdXJNb2RlID0gQkxVUl9HQVVTU0lBTjtcbiAgICAgICAgdGhpcy52c21CaWFzID0gMC4wMSAqIDAuMjU7XG4gICAgICAgIHRoaXMuX2Nvb2tpZSA9IG51bGw7IC8vIGxpZ2h0IGNvb2tpZSB0ZXh0dXJlICgyRCBmb3Igc3BvdCwgY3ViZW1hcCBmb3Igb21uaSlcbiAgICAgICAgdGhpcy5jb29raWVJbnRlbnNpdHkgPSAxO1xuICAgICAgICB0aGlzLl9jb29raWVGYWxsb2ZmID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5fY29va2llQ2hhbm5lbCA9ICdyZ2InO1xuICAgICAgICB0aGlzLl9jb29raWVUcmFuc2Zvcm0gPSBudWxsOyAvLyAyZCByb3RhdGlvbi9zY2FsZSBtYXRyaXggKHNwb3Qgb25seSlcbiAgICAgICAgdGhpcy5fY29va2llVHJhbnNmb3JtVW5pZm9ybSA9IG5ldyBGbG9hdDMyQXJyYXkoNCk7XG4gICAgICAgIHRoaXMuX2Nvb2tpZU9mZnNldCA9IG51bGw7IC8vIDJkIHBvc2l0aW9uIG9mZnNldCAoc3BvdCBvbmx5KVxuICAgICAgICB0aGlzLl9jb29raWVPZmZzZXRVbmlmb3JtID0gbmV3IEZsb2F0MzJBcnJheSgyKTtcbiAgICAgICAgdGhpcy5fY29va2llVHJhbnNmb3JtU2V0ID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX2Nvb2tpZU9mZnNldFNldCA9IGZhbHNlO1xuXG4gICAgICAgIC8vIFNwb3QgcHJvcGVydGllc1xuICAgICAgICB0aGlzLl9pbm5lckNvbmVBbmdsZSA9IDQwO1xuICAgICAgICB0aGlzLl9vdXRlckNvbmVBbmdsZSA9IDQ1O1xuXG4gICAgICAgIC8vIERpcmVjdGlvbmFsIHByb3BlcnRpZXNcbiAgICAgICAgdGhpcy5jYXNjYWRlcyA9IG51bGw7ICAgICAgICAgICAgICAgLy8gYW4gYXJyYXkgb2YgVmVjNCB2aWV3cG9ydHMgcGVyIGNhc2NhZGVcbiAgICAgICAgdGhpcy5fc2hhZG93TWF0cml4UGFsZXR0ZSA9IG51bGw7ICAgLy8gYSBmbG9hdCBhcnJheSwgMTYgZmxvYXRzIHBlciBjYXNjYWRlXG4gICAgICAgIHRoaXMuX3NoYWRvd0Nhc2NhZGVEaXN0YW5jZXMgPSBudWxsO1xuICAgICAgICB0aGlzLm51bUNhc2NhZGVzID0gMTtcbiAgICAgICAgdGhpcy5jYXNjYWRlRGlzdHJpYnV0aW9uID0gMC41O1xuXG4gICAgICAgIC8vIExpZ2h0IHNvdXJjZSBzaGFwZSBwcm9wZXJ0aWVzXG4gICAgICAgIHRoaXMuX3NoYXBlID0gTElHSFRTSEFQRV9QVU5DVFVBTDtcblxuICAgICAgICAvLyBDYWNoZSBvZiBsaWdodCBwcm9wZXJ0eSBkYXRhIGluIGEgZm9ybWF0IG1vcmUgZnJpZW5kbHkgZm9yIHNoYWRlciB1bmlmb3Jtc1xuICAgICAgICB0aGlzLl9maW5hbENvbG9yID0gbmV3IEZsb2F0MzJBcnJheShbMC44LCAwLjgsIDAuOF0pO1xuICAgICAgICBjb25zdCBjID0gTWF0aC5wb3codGhpcy5fZmluYWxDb2xvclswXSwgMi4yKTtcbiAgICAgICAgdGhpcy5fbGluZWFyRmluYWxDb2xvciA9IG5ldyBGbG9hdDMyQXJyYXkoW2MsIGMsIGNdKTtcblxuICAgICAgICB0aGlzLl9wb3NpdGlvbiA9IG5ldyBWZWMzKDAsIDAsIDApO1xuICAgICAgICB0aGlzLl9kaXJlY3Rpb24gPSBuZXcgVmVjMygwLCAwLCAwKTtcbiAgICAgICAgdGhpcy5faW5uZXJDb25lQW5nbGVDb3MgPSBNYXRoLmNvcyh0aGlzLl9pbm5lckNvbmVBbmdsZSAqIE1hdGguUEkgLyAxODApO1xuICAgICAgICB0aGlzLl91cGRhdGVPdXRlckFuZ2xlKHRoaXMuX291dGVyQ29uZUFuZ2xlKTtcblxuICAgICAgICB0aGlzLl91c2VQaHlzaWNhbFVuaXRzID0gdW5kZWZpbmVkO1xuXG4gICAgICAgIC8vIFNoYWRvdyBtYXBwaW5nIHJlc291cmNlc1xuICAgICAgICB0aGlzLl9zaGFkb3dNYXAgPSBudWxsO1xuICAgICAgICB0aGlzLl9zaGFkb3dSZW5kZXJQYXJhbXMgPSBbXTtcbiAgICAgICAgdGhpcy5fc2hhZG93Q2FtZXJhUGFyYW1zID0gW107XG5cbiAgICAgICAgLy8gU2hhZG93IG1hcHBpbmcgcHJvcGVydGllc1xuICAgICAgICB0aGlzLnNoYWRvd0Rpc3RhbmNlID0gNDA7XG4gICAgICAgIHRoaXMuX3NoYWRvd1Jlc29sdXRpb24gPSAxMDI0O1xuICAgICAgICB0aGlzLnNoYWRvd0JpYXMgPSAtMC4wMDA1O1xuICAgICAgICB0aGlzLnNoYWRvd0ludGVuc2l0eSA9IDEuMDtcbiAgICAgICAgdGhpcy5fbm9ybWFsT2Zmc2V0QmlhcyA9IDAuMDtcbiAgICAgICAgdGhpcy5zaGFkb3dVcGRhdGVNb2RlID0gU0hBRE9XVVBEQVRFX1JFQUxUSU1FO1xuICAgICAgICB0aGlzLnNoYWRvd1VwZGF0ZU92ZXJyaWRlcyA9IG51bGw7XG4gICAgICAgIHRoaXMuX3BlbnVtYnJhU2l6ZSA9IDEuMDtcbiAgICAgICAgdGhpcy5faXNWc20gPSBmYWxzZTtcbiAgICAgICAgdGhpcy5faXNQY2YgPSB0cnVlO1xuXG4gICAgICAgIC8vIGNvb2tpZSBtYXRyaXggKHVzZWQgaW4gY2FzZSB0aGUgc2hhZG93IG1hcHBpbmcgaXMgZGlzYWJsZWQgYW5kIHNvIHRoZSBzaGFkb3cgbWF0cml4IGNhbm5vdCBiZSB1c2VkKVxuICAgICAgICB0aGlzLl9jb29raWVNYXRyaXggPSBudWxsO1xuXG4gICAgICAgIC8vIHZpZXdwb3J0IG9mIHRoZSBjb29raWUgdGV4dHVyZSAvIHNoYWRvdyBpbiB0aGUgYXRsYXNcbiAgICAgICAgdGhpcy5fYXRsYXNWaWV3cG9ydCA9IG51bGw7XG4gICAgICAgIHRoaXMuYXRsYXNWaWV3cG9ydEFsbG9jYXRlZCA9IGZhbHNlOyAgICAvLyBpZiB0cnVlLCBhdGxhcyBzbG90IGlzIGFsbG9jYXRlZCBmb3IgdGhlIGN1cnJlbnQgZnJhbWVcbiAgICAgICAgdGhpcy5hdGxhc1ZlcnNpb24gPSAwOyAgICAgIC8vIHZlcnNpb24gb2YgdGhlIGF0bGFzIGZvciB0aGUgYWxsb2NhdGVkIHNsb3QsIGFsbG93cyBpbnZhbGlkYXRpb24gd2hlbiBhdGxhcyByZWNyZWF0ZXMgc2xvdHNcbiAgICAgICAgdGhpcy5hdGxhc1Nsb3RJbmRleCA9IDA7ICAgIC8vIGFsbG9jYXRlZCBzbG90IGluZGV4LCB1c2VkIGZvciBtb3JlIHBlcnNpc3RlbnQgc2xvdCBhbGxvY2F0aW9uXG4gICAgICAgIHRoaXMuYXRsYXNTbG90VXBkYXRlZCA9IGZhbHNlOyAgLy8gdHJ1ZSBpZiB0aGUgYXRsYXMgc2xvdCB3YXMgcmVhc3NpZ25lZCB0aGlzIGZyYW1lIChhbmQgY29udGVudCBuZWVkcyB0byBiZSB1cGRhdGVkKVxuXG4gICAgICAgIHRoaXMuX25vZGUgPSBudWxsO1xuXG4gICAgICAgIC8vIHByaXZhdGUgcmVuZGVyaW5nIGRhdGFcbiAgICAgICAgdGhpcy5fcmVuZGVyRGF0YSA9IFtdO1xuXG4gICAgICAgIC8vIHRydWUgaWYgdGhlIGxpZ2h0IGlzIHZpc2libGUgYnkgYW55IGNhbWVyYSB3aXRoaW4gYSBmcmFtZVxuICAgICAgICB0aGlzLnZpc2libGVUaGlzRnJhbWUgPSBmYWxzZTtcblxuICAgICAgICAvLyBtYXhpbXVtIHNpemUgb2YgdGhlIGxpZ2h0IGJvdW5kaW5nIHNwaGVyZSBvbiB0aGUgc2NyZWVuIGJ5IGFueSBjYW1lcmEgd2l0aGluIGEgZnJhbWVcbiAgICAgICAgLy8gKHVzZWQgdG8gZXN0aW1hdGUgc2hhZG93IHJlc29sdXRpb24pLCByYW5nZSBbMC4uMV1cbiAgICAgICAgdGhpcy5tYXhTY3JlZW5TaXplID0gMDtcbiAgICB9XG5cbiAgICBkZXN0cm95KCkge1xuICAgICAgICB0aGlzLl9kZXN0cm95U2hhZG93TWFwKCk7XG5cbiAgICAgICAgdGhpcy5yZWxlYXNlUmVuZGVyRGF0YSgpO1xuICAgICAgICB0aGlzLl9yZW5kZXJEYXRhID0gbnVsbDtcbiAgICB9XG5cbiAgICByZWxlYXNlUmVuZGVyRGF0YSgpIHtcblxuICAgICAgICBpZiAodGhpcy5fcmVuZGVyRGF0YSkge1xuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLl9yZW5kZXJEYXRhLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fcmVuZGVyRGF0YVtpXS5kZXN0cm95KCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuX3JlbmRlckRhdGEubGVuZ3RoID0gMDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGFkZExheWVyKGxheWVyKSB7XG4gICAgICAgIHRoaXMubGF5ZXJzLmFkZChsYXllcik7XG4gICAgfVxuXG4gICAgcmVtb3ZlTGF5ZXIobGF5ZXIpIHtcbiAgICAgICAgdGhpcy5sYXllcnMuZGVsZXRlKGxheWVyKTtcbiAgICB9XG5cbiAgICBzZXQgbnVtQ2FzY2FkZXModmFsdWUpIHtcbiAgICAgICAgaWYgKCF0aGlzLmNhc2NhZGVzIHx8IHRoaXMubnVtQ2FzY2FkZXMgIT09IHZhbHVlKSB7XG4gICAgICAgICAgICB0aGlzLmNhc2NhZGVzID0gZGlyZWN0aW9uYWxDYXNjYWRlc1t2YWx1ZSAtIDFdO1xuICAgICAgICAgICAgdGhpcy5fc2hhZG93TWF0cml4UGFsZXR0ZSA9IG5ldyBGbG9hdDMyQXJyYXkoNCAqIDE2KTsgICAvLyBhbHdheXMgNFxuICAgICAgICAgICAgdGhpcy5fc2hhZG93Q2FzY2FkZURpc3RhbmNlcyA9IG5ldyBGbG9hdDMyQXJyYXkoNCk7ICAgICAvLyBhbHdheXMgNFxuICAgICAgICAgICAgdGhpcy5fZGVzdHJveVNoYWRvd01hcCgpO1xuICAgICAgICAgICAgdGhpcy51cGRhdGVLZXkoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGdldCBudW1DYXNjYWRlcygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY2FzY2FkZXMubGVuZ3RoO1xuICAgIH1cblxuICAgIHNldCBzaGFkb3dNYXAoc2hhZG93TWFwKSB7XG4gICAgICAgIGlmICh0aGlzLl9zaGFkb3dNYXAgIT09IHNoYWRvd01hcCkge1xuICAgICAgICAgICAgdGhpcy5fZGVzdHJveVNoYWRvd01hcCgpO1xuICAgICAgICAgICAgdGhpcy5fc2hhZG93TWFwID0gc2hhZG93TWFwO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2V0IHNoYWRvd01hcCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3NoYWRvd01hcDtcbiAgICB9XG5cbiAgICBzZXQgbWFzayh2YWx1ZSkge1xuICAgICAgICBpZiAodGhpcy5fbWFzayAhPT0gdmFsdWUpIHtcbiAgICAgICAgICAgIHRoaXMuX21hc2sgPSB2YWx1ZTtcbiAgICAgICAgICAgIHRoaXMudXBkYXRlS2V5KCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBnZXQgbWFzaygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX21hc2s7XG4gICAgfVxuXG4gICAgLy8gcmV0dXJucyBudW1iZXIgb2YgcmVuZGVyIHRhcmdldHMgdG8gcmVuZGVyIHRoZSBzaGFkb3cgbWFwXG4gICAgZ2V0IG51bVNoYWRvd0ZhY2VzKCkge1xuICAgICAgICBjb25zdCB0eXBlID0gdGhpcy5fdHlwZTtcbiAgICAgICAgaWYgKHR5cGUgPT09IExJR0hUVFlQRV9ESVJFQ1RJT05BTCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMubnVtQ2FzY2FkZXM7XG4gICAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gTElHSFRUWVBFX09NTkkpIHtcbiAgICAgICAgICAgIHJldHVybiA2O1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIDE7XG4gICAgfVxuXG4gICAgc2V0IHR5cGUodmFsdWUpIHtcbiAgICAgICAgaWYgKHRoaXMuX3R5cGUgPT09IHZhbHVlKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHRoaXMuX3R5cGUgPSB2YWx1ZTtcbiAgICAgICAgdGhpcy5fZGVzdHJveVNoYWRvd01hcCgpO1xuICAgICAgICB0aGlzLnVwZGF0ZUtleSgpO1xuXG4gICAgICAgIGNvbnN0IHN0eXBlID0gdGhpcy5fc2hhZG93VHlwZTtcbiAgICAgICAgdGhpcy5fc2hhZG93VHlwZSA9IG51bGw7XG4gICAgICAgIHRoaXMuc2hhZG93VXBkYXRlT3ZlcnJpZGVzID0gbnVsbDtcbiAgICAgICAgdGhpcy5zaGFkb3dUeXBlID0gc3R5cGU7IC8vIHJlZnJlc2ggc2hhZG93IHR5cGU7IHN3aXRjaGluZyBmcm9tIGRpcmVjdC9zcG90IHRvIG9tbmkgYW5kIGJhY2sgbWF5IGNoYW5nZSBpdFxuICAgIH1cblxuICAgIGdldCB0eXBlKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fdHlwZTtcbiAgICB9XG5cbiAgICBzZXQgc2hhcGUodmFsdWUpIHtcbiAgICAgICAgaWYgKHRoaXMuX3NoYXBlID09PSB2YWx1ZSlcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICB0aGlzLl9zaGFwZSA9IHZhbHVlO1xuICAgICAgICB0aGlzLl9kZXN0cm95U2hhZG93TWFwKCk7XG4gICAgICAgIHRoaXMudXBkYXRlS2V5KCk7XG5cbiAgICAgICAgY29uc3Qgc3R5cGUgPSB0aGlzLl9zaGFkb3dUeXBlO1xuICAgICAgICB0aGlzLl9zaGFkb3dUeXBlID0gbnVsbDtcbiAgICAgICAgdGhpcy5zaGFkb3dUeXBlID0gc3R5cGU7IC8vIHJlZnJlc2ggc2hhZG93IHR5cGU7IHN3aXRjaGluZyBzaGFwZSBhbmQgYmFjayBtYXkgY2hhbmdlIGl0XG4gICAgfVxuXG4gICAgZ2V0IHNoYXBlKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fc2hhcGU7XG4gICAgfVxuXG4gICAgc2V0IHVzZVBoeXNpY2FsVW5pdHModmFsdWUpIHtcbiAgICAgICAgaWYgKHRoaXMuX3VzZVBoeXNpY2FsVW5pdHMgIT09IHZhbHVlKSB7XG4gICAgICAgICAgICB0aGlzLl91c2VQaHlzaWNhbFVuaXRzID0gdmFsdWU7XG4gICAgICAgICAgICB0aGlzLl91cGRhdGVGaW5hbENvbG9yKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBnZXQgdXNlUGh5c2ljYWxVbml0cygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3VzZVBoeXNpY2FsVW5pdHM7XG4gICAgfVxuXG4gICAgc2V0IHNoYWRvd1R5cGUodmFsdWUpIHtcbiAgICAgICAgaWYgKHRoaXMuX3NoYWRvd1R5cGUgPT09IHZhbHVlKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIGNvbnN0IGRldmljZSA9IHRoaXMuZGV2aWNlO1xuXG4gICAgICAgIGlmICh0aGlzLl90eXBlID09PSBMSUdIVFRZUEVfT01OSSAmJiB2YWx1ZSAhPT0gU0hBRE9XX1BDRjMgJiYgdmFsdWUgIT09IFNIQURPV19QQ1NTKVxuICAgICAgICAgICAgdmFsdWUgPSBTSEFET1dfUENGMzsgLy8gVlNNIG9yIEhXIFBDRiBmb3Igb21uaSBsaWdodHMgaXMgbm90IHN1cHBvcnRlZCB5ZXRcblxuICAgICAgICBjb25zdCBzdXBwb3J0c0RlcHRoU2hhZG93ID0gZGV2aWNlLnN1cHBvcnRzRGVwdGhTaGFkb3c7XG4gICAgICAgIGlmICh2YWx1ZSA9PT0gU0hBRE9XX1BDRjUgJiYgIXN1cHBvcnRzRGVwdGhTaGFkb3cpIHtcbiAgICAgICAgICAgIHZhbHVlID0gU0hBRE9XX1BDRjM7IC8vIGZhbGxiYWNrIGZyb20gSFcgUENGIHRvIG9sZCBQQ0ZcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh2YWx1ZSA9PT0gU0hBRE9XX1ZTTTMyICYmICFkZXZpY2UudGV4dHVyZUZsb2F0UmVuZGVyYWJsZSkgLy8gZmFsbGJhY2sgZnJvbSB2c20zMiB0byB2c20xNlxuICAgICAgICAgICAgdmFsdWUgPSBTSEFET1dfVlNNMTY7XG5cbiAgICAgICAgaWYgKHZhbHVlID09PSBTSEFET1dfVlNNMTYgJiYgIWRldmljZS50ZXh0dXJlSGFsZkZsb2F0UmVuZGVyYWJsZSkgLy8gZmFsbGJhY2sgZnJvbSB2c20xNiB0byB2c204XG4gICAgICAgICAgICB2YWx1ZSA9IFNIQURPV19WU004O1xuXG4gICAgICAgIHRoaXMuX2lzVnNtID0gdmFsdWUgPj0gU0hBRE9XX1ZTTTggJiYgdmFsdWUgPD0gU0hBRE9XX1ZTTTMyO1xuICAgICAgICB0aGlzLl9pc1BjZiA9IHZhbHVlID09PSBTSEFET1dfUENGMSB8fCB2YWx1ZSA9PT0gU0hBRE9XX1BDRjMgfHwgdmFsdWUgPT09IFNIQURPV19QQ0Y1O1xuXG4gICAgICAgIHRoaXMuX3NoYWRvd1R5cGUgPSB2YWx1ZTtcbiAgICAgICAgdGhpcy5fZGVzdHJveVNoYWRvd01hcCgpO1xuICAgICAgICB0aGlzLnVwZGF0ZUtleSgpO1xuICAgIH1cblxuICAgIGdldCBzaGFkb3dUeXBlKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fc2hhZG93VHlwZTtcbiAgICB9XG5cbiAgICBzZXQgZW5hYmxlZCh2YWx1ZSkge1xuICAgICAgICBpZiAodGhpcy5fZW5hYmxlZCAhPT0gdmFsdWUpIHtcbiAgICAgICAgICAgIHRoaXMuX2VuYWJsZWQgPSB2YWx1ZTtcbiAgICAgICAgICAgIHRoaXMubGF5ZXJzRGlydHkoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGdldCBlbmFibGVkKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fZW5hYmxlZDtcbiAgICB9XG5cbiAgICBzZXQgY2FzdFNoYWRvd3ModmFsdWUpIHtcbiAgICAgICAgaWYgKHRoaXMuX2Nhc3RTaGFkb3dzICE9PSB2YWx1ZSkge1xuICAgICAgICAgICAgdGhpcy5fY2FzdFNoYWRvd3MgPSB2YWx1ZTtcbiAgICAgICAgICAgIHRoaXMuX2Rlc3Ryb3lTaGFkb3dNYXAoKTtcbiAgICAgICAgICAgIHRoaXMubGF5ZXJzRGlydHkoKTtcbiAgICAgICAgICAgIHRoaXMudXBkYXRlS2V5KCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBnZXQgY2FzdFNoYWRvd3MoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9jYXN0U2hhZG93cyAmJiB0aGlzLl9tYXNrICE9PSBNQVNLX0JBS0UgJiYgdGhpcy5fbWFzayAhPT0gMDtcbiAgICB9XG5cbiAgICBzZXQgc2hhZG93UmVzb2x1dGlvbih2YWx1ZSkge1xuICAgICAgICBpZiAodGhpcy5fc2hhZG93UmVzb2x1dGlvbiAhPT0gdmFsdWUpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLl90eXBlID09PSBMSUdIVFRZUEVfT01OSSkge1xuICAgICAgICAgICAgICAgIHZhbHVlID0gTWF0aC5taW4odmFsdWUsIHRoaXMuZGV2aWNlLm1heEN1YmVNYXBTaXplKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdmFsdWUgPSBNYXRoLm1pbih2YWx1ZSwgdGhpcy5kZXZpY2UubWF4VGV4dHVyZVNpemUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5fc2hhZG93UmVzb2x1dGlvbiA9IHZhbHVlO1xuICAgICAgICAgICAgdGhpcy5fZGVzdHJveVNoYWRvd01hcCgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2V0IHNoYWRvd1Jlc29sdXRpb24oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9zaGFkb3dSZXNvbHV0aW9uO1xuICAgIH1cblxuICAgIHNldCB2c21CbHVyU2l6ZSh2YWx1ZSkge1xuICAgICAgICBpZiAodGhpcy5fdnNtQmx1clNpemUgPT09IHZhbHVlKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIGlmICh2YWx1ZSAlIDIgPT09IDApIHZhbHVlKys7IC8vIGRvbid0IGFsbG93IGV2ZW4gc2l6ZVxuICAgICAgICB0aGlzLl92c21CbHVyU2l6ZSA9IHZhbHVlO1xuICAgIH1cblxuICAgIGdldCB2c21CbHVyU2l6ZSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3ZzbUJsdXJTaXplO1xuICAgIH1cblxuICAgIHNldCBub3JtYWxPZmZzZXRCaWFzKHZhbHVlKSB7XG4gICAgICAgIGlmICh0aGlzLl9ub3JtYWxPZmZzZXRCaWFzID09PSB2YWx1ZSlcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICBpZiAoKCF0aGlzLl9ub3JtYWxPZmZzZXRCaWFzICYmIHZhbHVlKSB8fCAodGhpcy5fbm9ybWFsT2Zmc2V0QmlhcyAmJiAhdmFsdWUpKSB7XG4gICAgICAgICAgICB0aGlzLnVwZGF0ZUtleSgpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuX25vcm1hbE9mZnNldEJpYXMgPSB2YWx1ZTtcbiAgICB9XG5cbiAgICBnZXQgbm9ybWFsT2Zmc2V0QmlhcygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX25vcm1hbE9mZnNldEJpYXM7XG4gICAgfVxuXG4gICAgc2V0IGZhbGxvZmZNb2RlKHZhbHVlKSB7XG4gICAgICAgIGlmICh0aGlzLl9mYWxsb2ZmTW9kZSA9PT0gdmFsdWUpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgdGhpcy5fZmFsbG9mZk1vZGUgPSB2YWx1ZTtcbiAgICAgICAgdGhpcy51cGRhdGVLZXkoKTtcbiAgICB9XG5cbiAgICBnZXQgZmFsbG9mZk1vZGUoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9mYWxsb2ZmTW9kZTtcbiAgICB9XG5cbiAgICBzZXQgaW5uZXJDb25lQW5nbGUodmFsdWUpIHtcbiAgICAgICAgaWYgKHRoaXMuX2lubmVyQ29uZUFuZ2xlID09PSB2YWx1ZSlcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICB0aGlzLl9pbm5lckNvbmVBbmdsZSA9IHZhbHVlO1xuICAgICAgICB0aGlzLl9pbm5lckNvbmVBbmdsZUNvcyA9IE1hdGguY29zKHZhbHVlICogTWF0aC5QSSAvIDE4MCk7XG4gICAgICAgIGlmICh0aGlzLl91c2VQaHlzaWNhbFVuaXRzKSB7XG4gICAgICAgICAgICB0aGlzLl91cGRhdGVGaW5hbENvbG9yKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBnZXQgaW5uZXJDb25lQW5nbGUoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9pbm5lckNvbmVBbmdsZTtcbiAgICB9XG5cbiAgICBzZXQgb3V0ZXJDb25lQW5nbGUodmFsdWUpIHtcbiAgICAgICAgaWYgKHRoaXMuX291dGVyQ29uZUFuZ2xlID09PSB2YWx1ZSlcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICB0aGlzLl9vdXRlckNvbmVBbmdsZSA9IHZhbHVlO1xuICAgICAgICB0aGlzLl91cGRhdGVPdXRlckFuZ2xlKHZhbHVlKTtcblxuICAgICAgICBpZiAodGhpcy5fdXNlUGh5c2ljYWxVbml0cykge1xuICAgICAgICAgICAgdGhpcy5fdXBkYXRlRmluYWxDb2xvcigpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2V0IG91dGVyQ29uZUFuZ2xlKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fb3V0ZXJDb25lQW5nbGU7XG4gICAgfVxuXG4gICAgc2V0IHBlbnVtYnJhU2l6ZSh2YWx1ZSkge1xuICAgICAgICB0aGlzLl9wZW51bWJyYVNpemUgPSB2YWx1ZTtcbiAgICB9XG5cbiAgICBnZXQgcGVudW1icmFTaXplKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fcGVudW1icmFTaXplO1xuICAgIH1cblxuICAgIF91cGRhdGVPdXRlckFuZ2xlKGFuZ2xlKSB7XG4gICAgICAgIGNvbnN0IHJhZEFuZ2xlID0gYW5nbGUgKiBNYXRoLlBJIC8gMTgwO1xuICAgICAgICB0aGlzLl9vdXRlckNvbmVBbmdsZUNvcyA9IE1hdGguY29zKHJhZEFuZ2xlKTtcbiAgICAgICAgdGhpcy5fb3V0ZXJDb25lQW5nbGVTaW4gPSBNYXRoLnNpbihyYWRBbmdsZSk7XG4gICAgfVxuXG4gICAgc2V0IGludGVuc2l0eSh2YWx1ZSkge1xuICAgICAgICBpZiAodGhpcy5faW50ZW5zaXR5ICE9PSB2YWx1ZSkge1xuICAgICAgICAgICAgdGhpcy5faW50ZW5zaXR5ID0gdmFsdWU7XG4gICAgICAgICAgICB0aGlzLl91cGRhdGVGaW5hbENvbG9yKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBnZXQgaW50ZW5zaXR5KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5faW50ZW5zaXR5O1xuICAgIH1cblxuICAgIHNldCBhZmZlY3RTcGVjdWxhcml0eSh2YWx1ZSkge1xuICAgICAgICBpZiAodGhpcy5fdHlwZSA9PT0gTElHSFRUWVBFX0RJUkVDVElPTkFMKSB7XG4gICAgICAgICAgICB0aGlzLl9hZmZlY3RTcGVjdWxhcml0eSA9IHZhbHVlO1xuICAgICAgICAgICAgdGhpcy51cGRhdGVLZXkoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGdldCBhZmZlY3RTcGVjdWxhcml0eSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FmZmVjdFNwZWN1bGFyaXR5O1xuICAgIH1cblxuICAgIHNldCBsdW1pbmFuY2UodmFsdWUpIHtcbiAgICAgICAgaWYgKHRoaXMuX2x1bWluYW5jZSAhPT0gdmFsdWUpIHtcbiAgICAgICAgICAgIHRoaXMuX2x1bWluYW5jZSA9IHZhbHVlO1xuICAgICAgICAgICAgdGhpcy5fdXBkYXRlRmluYWxDb2xvcigpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2V0IGx1bWluYW5jZSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2x1bWluYW5jZTtcbiAgICB9XG5cbiAgICBnZXQgY29va2llTWF0cml4KCkge1xuICAgICAgICBpZiAoIXRoaXMuX2Nvb2tpZU1hdHJpeCkge1xuICAgICAgICAgICAgdGhpcy5fY29va2llTWF0cml4ID0gbmV3IE1hdDQoKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy5fY29va2llTWF0cml4O1xuICAgIH1cblxuICAgIGdldCBhdGxhc1ZpZXdwb3J0KCkge1xuICAgICAgICBpZiAoIXRoaXMuX2F0bGFzVmlld3BvcnQpIHtcbiAgICAgICAgICAgIHRoaXMuX2F0bGFzVmlld3BvcnQgPSBuZXcgVmVjNCgwLCAwLCAxLCAxKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy5fYXRsYXNWaWV3cG9ydDtcbiAgICB9XG5cbiAgICBzZXQgY29va2llKHZhbHVlKSB7XG4gICAgICAgIGlmICh0aGlzLl9jb29raWUgPT09IHZhbHVlKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHRoaXMuX2Nvb2tpZSA9IHZhbHVlO1xuICAgICAgICB0aGlzLnVwZGF0ZUtleSgpO1xuICAgIH1cblxuICAgIGdldCBjb29raWUoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9jb29raWU7XG4gICAgfVxuXG4gICAgc2V0IGNvb2tpZUZhbGxvZmYodmFsdWUpIHtcbiAgICAgICAgaWYgKHRoaXMuX2Nvb2tpZUZhbGxvZmYgPT09IHZhbHVlKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHRoaXMuX2Nvb2tpZUZhbGxvZmYgPSB2YWx1ZTtcbiAgICAgICAgdGhpcy51cGRhdGVLZXkoKTtcbiAgICB9XG5cbiAgICBnZXQgY29va2llRmFsbG9mZigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2Nvb2tpZUZhbGxvZmY7XG4gICAgfVxuXG4gICAgc2V0IGNvb2tpZUNoYW5uZWwodmFsdWUpIHtcbiAgICAgICAgaWYgKHRoaXMuX2Nvb2tpZUNoYW5uZWwgPT09IHZhbHVlKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIGlmICh2YWx1ZS5sZW5ndGggPCAzKSB7XG4gICAgICAgICAgICBjb25zdCBjaHIgPSB2YWx1ZS5jaGFyQXQodmFsdWUubGVuZ3RoIC0gMSk7XG4gICAgICAgICAgICBjb25zdCBhZGRMZW4gPSAzIC0gdmFsdWUubGVuZ3RoO1xuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhZGRMZW47IGkrKylcbiAgICAgICAgICAgICAgICB2YWx1ZSArPSBjaHI7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5fY29va2llQ2hhbm5lbCA9IHZhbHVlO1xuICAgICAgICB0aGlzLnVwZGF0ZUtleSgpO1xuICAgIH1cblxuICAgIGdldCBjb29raWVDaGFubmVsKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fY29va2llQ2hhbm5lbDtcbiAgICB9XG5cbiAgICBzZXQgY29va2llVHJhbnNmb3JtKHZhbHVlKSB7XG4gICAgICAgIGlmICh0aGlzLl9jb29raWVUcmFuc2Zvcm0gPT09IHZhbHVlKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHRoaXMuX2Nvb2tpZVRyYW5zZm9ybSA9IHZhbHVlO1xuICAgICAgICB0aGlzLl9jb29raWVUcmFuc2Zvcm1TZXQgPSAhIXZhbHVlO1xuICAgICAgICBpZiAodmFsdWUgJiYgIXRoaXMuX2Nvb2tpZU9mZnNldCkge1xuICAgICAgICAgICAgdGhpcy5jb29raWVPZmZzZXQgPSBuZXcgVmVjMigpOyAvLyB1c2luZyB0cmFuc2Zvcm0gZm9yY2VzIHVzaW5nIG9mZnNldCBjb2RlXG4gICAgICAgICAgICB0aGlzLl9jb29raWVPZmZzZXRTZXQgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnVwZGF0ZUtleSgpO1xuICAgIH1cblxuICAgIGdldCBjb29raWVUcmFuc2Zvcm0oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9jb29raWVUcmFuc2Zvcm07XG4gICAgfVxuXG4gICAgc2V0IGNvb2tpZU9mZnNldCh2YWx1ZSkge1xuICAgICAgICBpZiAodGhpcy5fY29va2llT2Zmc2V0ID09PSB2YWx1ZSlcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICBjb25zdCB4Zm9ybU5ldyA9ICEhKHRoaXMuX2Nvb2tpZVRyYW5zZm9ybVNldCB8fCB2YWx1ZSk7XG4gICAgICAgIGlmICh4Zm9ybU5ldyAmJiAhdmFsdWUgJiYgdGhpcy5fY29va2llT2Zmc2V0KSB7XG4gICAgICAgICAgICB0aGlzLl9jb29raWVPZmZzZXQuc2V0KDAsIDApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5fY29va2llT2Zmc2V0ID0gdmFsdWU7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5fY29va2llT2Zmc2V0U2V0ID0gISF2YWx1ZTtcbiAgICAgICAgaWYgKHZhbHVlICYmICF0aGlzLl9jb29raWVUcmFuc2Zvcm0pIHtcbiAgICAgICAgICAgIHRoaXMuY29va2llVHJhbnNmb3JtID0gbmV3IFZlYzQoMSwgMSwgMCwgMCk7IC8vIHVzaW5nIG9mZnNldCBmb3JjZXMgdXNpbmcgbWF0cml4IGNvZGVcbiAgICAgICAgICAgIHRoaXMuX2Nvb2tpZVRyYW5zZm9ybVNldCA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMudXBkYXRlS2V5KCk7XG4gICAgfVxuXG4gICAgZ2V0IGNvb2tpZU9mZnNldCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2Nvb2tpZU9mZnNldDtcbiAgICB9XG5cbiAgICAvLyBwcmVwYXJlcyBsaWdodCBmb3IgdGhlIGZyYW1lIHJlbmRlcmluZ1xuICAgIGJlZ2luRnJhbWUoKSB7XG4gICAgICAgIHRoaXMudmlzaWJsZVRoaXNGcmFtZSA9IHRoaXMuX3R5cGUgPT09IExJR0hUVFlQRV9ESVJFQ1RJT05BTCAmJiB0aGlzLl9lbmFibGVkO1xuICAgICAgICB0aGlzLm1heFNjcmVlblNpemUgPSAwO1xuICAgICAgICB0aGlzLmF0bGFzVmlld3BvcnRBbGxvY2F0ZWQgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5hdGxhc1Nsb3RVcGRhdGVkID0gZmFsc2U7XG4gICAgfVxuXG4gICAgLy8gZGVzdHJveXMgc2hhZG93IG1hcCByZWxhdGVkIHJlc291cmNlcywgY2FsbGVkIHdoZW4gc2hhZG93IHByb3BlcnRpZXMgY2hhbmdlIGFuZCByZXNvdXJjZXNcbiAgICAvLyBuZWVkIHRvIGJlIHJlY3JlYXRlZFxuICAgIF9kZXN0cm95U2hhZG93TWFwKCkge1xuXG4gICAgICAgIHRoaXMucmVsZWFzZVJlbmRlckRhdGEoKTtcblxuICAgICAgICBpZiAodGhpcy5fc2hhZG93TWFwKSB7XG4gICAgICAgICAgICBpZiAoIXRoaXMuX3NoYWRvd01hcC5jYWNoZWQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9zaGFkb3dNYXAuZGVzdHJveSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5fc2hhZG93TWFwID0gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLnNoYWRvd1VwZGF0ZU1vZGUgPT09IFNIQURPV1VQREFURV9OT05FKSB7XG4gICAgICAgICAgICB0aGlzLnNoYWRvd1VwZGF0ZU1vZGUgPSBTSEFET1dVUERBVEVfVEhJU0ZSQU1FO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuc2hhZG93VXBkYXRlT3ZlcnJpZGVzKSB7XG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuc2hhZG93VXBkYXRlT3ZlcnJpZGVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuc2hhZG93VXBkYXRlT3ZlcnJpZGVzW2ldID09PSBTSEFET1dVUERBVEVfTk9ORSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnNoYWRvd1VwZGF0ZU92ZXJyaWRlc1tpXSA9IFNIQURPV1VQREFURV9USElTRlJBTUU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gcmV0dXJucyBMaWdodFJlbmRlckRhdGEgd2l0aCBtYXRjaGluZyBjYW1lcmEgYW5kIGZhY2VcbiAgICBnZXRSZW5kZXJEYXRhKGNhbWVyYSwgZmFjZSkge1xuXG4gICAgICAgIC8vIHJldHVybnMgZXhpc3RpbmdcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLl9yZW5kZXJEYXRhLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBjdXJyZW50ID0gdGhpcy5fcmVuZGVyRGF0YVtpXTtcbiAgICAgICAgICAgIGlmIChjdXJyZW50LmNhbWVyYSA9PT0gY2FtZXJhICYmIGN1cnJlbnQuZmFjZSA9PT0gZmFjZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBjdXJyZW50O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gY3JlYXRlIG5ldyBvbmVcbiAgICAgICAgY29uc3QgcmQgPSBuZXcgTGlnaHRSZW5kZXJEYXRhKHRoaXMuZGV2aWNlLCBjYW1lcmEsIGZhY2UsIHRoaXMpO1xuICAgICAgICB0aGlzLl9yZW5kZXJEYXRhLnB1c2gocmQpO1xuICAgICAgICByZXR1cm4gcmQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRHVwbGljYXRlcyBhIGxpZ2h0IG5vZGUgYnV0IGRvZXMgbm90ICdkZWVwIGNvcHknIHRoZSBoaWVyYXJjaHkuXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7TGlnaHR9IEEgY2xvbmVkIExpZ2h0LlxuICAgICAqL1xuICAgIGNsb25lKCkge1xuICAgICAgICBjb25zdCBjbG9uZSA9IG5ldyBMaWdodCh0aGlzLmRldmljZSk7XG5cbiAgICAgICAgLy8gQ2xvbmUgTGlnaHQgcHJvcGVydGllc1xuICAgICAgICBjbG9uZS50eXBlID0gdGhpcy5fdHlwZTtcbiAgICAgICAgY2xvbmUuc2V0Q29sb3IodGhpcy5fY29sb3IpO1xuICAgICAgICBjbG9uZS5pbnRlbnNpdHkgPSB0aGlzLl9pbnRlbnNpdHk7XG4gICAgICAgIGNsb25lLmFmZmVjdFNwZWN1bGFyaXR5ID0gdGhpcy5fYWZmZWN0U3BlY3VsYXJpdHk7XG4gICAgICAgIGNsb25lLmx1bWluYW5jZSA9IHRoaXMuX2x1bWluYW5jZTtcbiAgICAgICAgY2xvbmUuY2FzdFNoYWRvd3MgPSB0aGlzLmNhc3RTaGFkb3dzO1xuICAgICAgICBjbG9uZS5fZW5hYmxlZCA9IHRoaXMuX2VuYWJsZWQ7XG5cbiAgICAgICAgLy8gT21uaSBhbmQgc3BvdCBwcm9wZXJ0aWVzXG4gICAgICAgIGNsb25lLmF0dGVudWF0aW9uU3RhcnQgPSB0aGlzLmF0dGVudWF0aW9uU3RhcnQ7XG4gICAgICAgIGNsb25lLmF0dGVudWF0aW9uRW5kID0gdGhpcy5hdHRlbnVhdGlvbkVuZDtcbiAgICAgICAgY2xvbmUuZmFsbG9mZk1vZGUgPSB0aGlzLl9mYWxsb2ZmTW9kZTtcbiAgICAgICAgY2xvbmUuc2hhZG93VHlwZSA9IHRoaXMuX3NoYWRvd1R5cGU7XG4gICAgICAgIGNsb25lLnZzbUJsdXJTaXplID0gdGhpcy5fdnNtQmx1clNpemU7XG4gICAgICAgIGNsb25lLnZzbUJsdXJNb2RlID0gdGhpcy52c21CbHVyTW9kZTtcbiAgICAgICAgY2xvbmUudnNtQmlhcyA9IHRoaXMudnNtQmlhcztcbiAgICAgICAgY2xvbmUucGVudW1icmFTaXplID0gdGhpcy5wZW51bWJyYVNpemU7XG4gICAgICAgIGNsb25lLnNoYWRvd1VwZGF0ZU1vZGUgPSB0aGlzLnNoYWRvd1VwZGF0ZU1vZGU7XG4gICAgICAgIGNsb25lLm1hc2sgPSB0aGlzLm1hc2s7XG5cbiAgICAgICAgaWYgKHRoaXMuc2hhZG93VXBkYXRlT3ZlcnJpZGVzKSB7XG4gICAgICAgICAgICBjbG9uZS5zaGFkb3dVcGRhdGVPdmVycmlkZXMgPSB0aGlzLnNoYWRvd1VwZGF0ZU92ZXJyaWRlcy5zbGljZSgpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gU3BvdCBwcm9wZXJ0aWVzXG4gICAgICAgIGNsb25lLmlubmVyQ29uZUFuZ2xlID0gdGhpcy5faW5uZXJDb25lQW5nbGU7XG4gICAgICAgIGNsb25lLm91dGVyQ29uZUFuZ2xlID0gdGhpcy5fb3V0ZXJDb25lQW5nbGU7XG5cbiAgICAgICAgLy8gRGlyZWN0aW9uYWwgcHJvcGVydGllc1xuICAgICAgICBjbG9uZS5udW1DYXNjYWRlcyA9IHRoaXMubnVtQ2FzY2FkZXM7XG4gICAgICAgIGNsb25lLmNhc2NhZGVEaXN0cmlidXRpb24gPSB0aGlzLmNhc2NhZGVEaXN0cmlidXRpb247XG5cbiAgICAgICAgLy8gc2hhcGUgcHJvcGVydGllc1xuICAgICAgICBjbG9uZS5zaGFwZSA9IHRoaXMuX3NoYXBlO1xuXG4gICAgICAgIC8vIFNoYWRvdyBwcm9wZXJ0aWVzXG4gICAgICAgIGNsb25lLnNoYWRvd0JpYXMgPSB0aGlzLnNoYWRvd0JpYXM7XG4gICAgICAgIGNsb25lLm5vcm1hbE9mZnNldEJpYXMgPSB0aGlzLl9ub3JtYWxPZmZzZXRCaWFzO1xuICAgICAgICBjbG9uZS5zaGFkb3dSZXNvbHV0aW9uID0gdGhpcy5fc2hhZG93UmVzb2x1dGlvbjtcbiAgICAgICAgY2xvbmUuc2hhZG93RGlzdGFuY2UgPSB0aGlzLnNoYWRvd0Rpc3RhbmNlO1xuICAgICAgICBjbG9uZS5zaGFkb3dJbnRlbnNpdHkgPSB0aGlzLnNoYWRvd0ludGVuc2l0eTtcblxuICAgICAgICAvLyBDb29raWVzIHByb3BlcnRpZXNcbiAgICAgICAgLy8gY2xvbmUuY29va2llID0gdGhpcy5fY29va2llO1xuICAgICAgICAvLyBjbG9uZS5jb29raWVJbnRlbnNpdHkgPSB0aGlzLmNvb2tpZUludGVuc2l0eTtcbiAgICAgICAgLy8gY2xvbmUuY29va2llRmFsbG9mZiA9IHRoaXMuX2Nvb2tpZUZhbGxvZmY7XG4gICAgICAgIC8vIGNsb25lLmNvb2tpZUNoYW5uZWwgPSB0aGlzLl9jb29raWVDaGFubmVsO1xuICAgICAgICAvLyBjbG9uZS5jb29raWVUcmFuc2Zvcm0gPSB0aGlzLl9jb29raWVUcmFuc2Zvcm07XG4gICAgICAgIC8vIGNsb25lLmNvb2tpZU9mZnNldCA9IHRoaXMuX2Nvb2tpZU9mZnNldDtcblxuICAgICAgICByZXR1cm4gY2xvbmU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogR2V0IGNvbnZlcnNpb24gZmFjdG9yIGZvciBsdW1pbmFuY2UgLT4gbGlnaHQgc3BlY2lmaWMgbGlnaHQgdW5pdC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSB0eXBlIC0gVGhlIHR5cGUgb2YgbGlnaHQuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFtvdXRlckFuZ2xlXSAtIFRoZSBvdXRlciBhbmdsZSBvZiBhIHNwb3QgbGlnaHQuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFtpbm5lckFuZ2xlXSAtIFRoZSBpbm5lciBhbmdsZSBvZiBhIHNwb3QgbGlnaHQuXG4gICAgICogQHJldHVybnMge251bWJlcn0gVGhlIHNjYWxpbmcgZmFjdG9yIHRvIG11bHRpcGx5IHdpdGggdGhlIGx1bWluYW5jZSB2YWx1ZS5cbiAgICAgKi9cbiAgICBzdGF0aWMgZ2V0TGlnaHRVbml0Q29udmVyc2lvbih0eXBlLCBvdXRlckFuZ2xlID0gTWF0aC5QSSAvIDQsIGlubmVyQW5nbGUgPSAwKSB7XG4gICAgICAgIHN3aXRjaCAodHlwZSkge1xuICAgICAgICAgICAgY2FzZSBMSUdIVFRZUEVfU1BPVDoge1xuICAgICAgICAgICAgICAgIGNvbnN0IGZhbGxvZmZFbmQgPSBNYXRoLmNvcyhvdXRlckFuZ2xlKTtcbiAgICAgICAgICAgICAgICBjb25zdCBmYWxsb2ZmU3RhcnQgPSBNYXRoLmNvcyhpbm5lckFuZ2xlKTtcblxuICAgICAgICAgICAgICAgIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9tbXAvcGJydC12NC9ibG9iL2ZhYWMzNGQxYTBlYmQyNDkyODgyOGZlOWZhNjViNjVmN2VmYzU5Mzcvc3JjL3BicnQvbGlnaHRzLmNwcCNMMTQ2M1xuICAgICAgICAgICAgICAgIHJldHVybiAoMiAqIE1hdGguUEkgKiAoKDEgLSBmYWxsb2ZmU3RhcnQpICsgKGZhbGxvZmZTdGFydCAtIGZhbGxvZmZFbmQpIC8gMi4wKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYXNlIExJR0hUVFlQRV9PTU5JOlxuICAgICAgICAgICAgICAgIC8vIGh0dHBzOi8vZ29vZ2xlLmdpdGh1Yi5pby9maWxhbWVudC9GaWxhbWVudC5tZC5odG1sI2xpZ2h0aW5nL2RpcmVjdGxpZ2h0aW5nL3B1bmN0dWFsbGlnaHRzL3BvaW50bGlnaHRzXG4gICAgICAgICAgICAgICAgcmV0dXJuICg0ICogTWF0aC5QSSk7XG4gICAgICAgICAgICBjYXNlIExJR0hUVFlQRV9ESVJFQ1RJT05BTDpcbiAgICAgICAgICAgICAgICAvLyBodHRwczovL2dvb2dsZS5naXRodWIuaW8vZmlsYW1lbnQvRmlsYW1lbnQubWQuaHRtbCNsaWdodGluZy9kaXJlY3RsaWdodGluZy9kaXJlY3Rpb25hbGxpZ2h0c1xuICAgICAgICAgICAgICAgIHJldHVybiAxO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gcmV0dXJucyB0aGUgYmlhcyAoLngpIGFuZCBub3JtYWxCaWFzICgueSkgdmFsdWUgZm9yIGxpZ2h0cyBhcyBwYXNzZWQgdG8gc2hhZGVycyBieSB1bmlmb3Jtc1xuICAgIC8vIE5vdGU6IHRoaXMgbmVlZHMgdG8gYmUgcmV2aXNpdGVkIGFuZCBzaW1wbGlmaWVkXG4gICAgLy8gTm90ZTogdnNtQmlhcyBpcyBub3QgdXNlZCBhdCBhbGwgZm9yIG9tbmkgbGlnaHQsIGV2ZW4gdGhvdWdoIGl0IGlzIGVkaXRhYmxlIGluIHRoZSBFZGl0b3JcbiAgICBfZ2V0VW5pZm9ybUJpYXNWYWx1ZXMobGlnaHRSZW5kZXJEYXRhKSB7XG5cbiAgICAgICAgY29uc3QgZmFyQ2xpcCA9IGxpZ2h0UmVuZGVyRGF0YS5zaGFkb3dDYW1lcmEuX2ZhckNsaXA7XG5cbiAgICAgICAgc3dpdGNoICh0aGlzLl90eXBlKSB7XG4gICAgICAgICAgICBjYXNlIExJR0hUVFlQRV9PTU5JOlxuICAgICAgICAgICAgICAgIHRtcEJpYXNlcy5iaWFzID0gdGhpcy5zaGFkb3dCaWFzO1xuICAgICAgICAgICAgICAgIHRtcEJpYXNlcy5ub3JtYWxCaWFzID0gdGhpcy5fbm9ybWFsT2Zmc2V0QmlhcztcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgTElHSFRUWVBFX1NQT1Q6XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuX2lzVnNtKSB7XG4gICAgICAgICAgICAgICAgICAgIHRtcEJpYXNlcy5iaWFzID0gLTAuMDAwMDEgKiAyMDtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB0bXBCaWFzZXMuYmlhcyA9IHRoaXMuc2hhZG93QmlhcyAqIDIwOyAvLyBhcHByb3ggcmVtYXAgZnJvbSBvbGQgYmlhcyB2YWx1ZXNcbiAgICAgICAgICAgICAgICAgICAgaWYgKCF0aGlzLmRldmljZS53ZWJnbDIgJiYgdGhpcy5kZXZpY2UuZXh0U3RhbmRhcmREZXJpdmF0aXZlcykgdG1wQmlhc2VzLmJpYXMgKj0gLTEwMDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdG1wQmlhc2VzLm5vcm1hbEJpYXMgPSB0aGlzLl9pc1ZzbSA/IHRoaXMudnNtQmlhcyAvICh0aGlzLmF0dGVudWF0aW9uRW5kIC8gNy4wKSA6IHRoaXMuX25vcm1hbE9mZnNldEJpYXM7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIExJR0hUVFlQRV9ESVJFQ1RJT05BTDpcbiAgICAgICAgICAgICAgICAvLyBtYWtlIGJpYXMgZGVwZW5kZW50IG9uIGZhciBwbGFuZSBiZWNhdXNlIGl0J3Mgbm90IGNvbnN0YW50IGZvciBkaXJlY3QgbGlnaHRcbiAgICAgICAgICAgICAgICAvLyBjbGlwIGRpc3RhbmNlIHVzZWQgaXMgYmFzZWQgb24gdGhlIG5lYXJlc3Qgc2hhZG93IGNhc2NhZGVcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5faXNWc20pIHtcbiAgICAgICAgICAgICAgICAgICAgdG1wQmlhc2VzLmJpYXMgPSAtMC4wMDAwMSAqIDIwO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHRtcEJpYXNlcy5iaWFzID0gKHRoaXMuc2hhZG93QmlhcyAvIGZhckNsaXApICogMTAwO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIXRoaXMuZGV2aWNlLndlYmdsMiAmJiB0aGlzLmRldmljZS5leHRTdGFuZGFyZERlcml2YXRpdmVzKSB0bXBCaWFzZXMuYmlhcyAqPSAtMTAwO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0bXBCaWFzZXMubm9ybWFsQmlhcyA9IHRoaXMuX2lzVnNtID8gdGhpcy52c21CaWFzIC8gKGZhckNsaXAgLyA3LjApIDogdGhpcy5fbm9ybWFsT2Zmc2V0QmlhcztcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0bXBCaWFzZXM7XG4gICAgfVxuXG4gICAgZ2V0Q29sb3IoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9jb2xvcjtcbiAgICB9XG5cbiAgICBnZXRCb3VuZGluZ1NwaGVyZShzcGhlcmUpIHtcbiAgICAgICAgaWYgKHRoaXMuX3R5cGUgPT09IExJR0hUVFlQRV9TUE9UKSB7XG5cbiAgICAgICAgICAgIC8vIGJhc2VkIG9uIGh0dHBzOi8vYmFydHdyb25za2kuY29tLzIwMTcvMDQvMTMvY3VsbC10aGF0LWNvbmUvXG4gICAgICAgICAgICBjb25zdCBzaXplID0gdGhpcy5hdHRlbnVhdGlvbkVuZDtcbiAgICAgICAgICAgIGNvbnN0IGFuZ2xlID0gdGhpcy5fb3V0ZXJDb25lQW5nbGU7XG4gICAgICAgICAgICBjb25zdCBjb3NBbmdsZSA9IHRoaXMuX291dGVyQ29uZUFuZ2xlQ29zO1xuICAgICAgICAgICAgY29uc3Qgbm9kZSA9IHRoaXMuX25vZGU7XG4gICAgICAgICAgICB0bXBWZWMuY29weShub2RlLnVwKTtcblxuICAgICAgICAgICAgaWYgKGFuZ2xlID4gNDUpIHtcbiAgICAgICAgICAgICAgICBzcGhlcmUucmFkaXVzID0gc2l6ZSAqIHRoaXMuX291dGVyQ29uZUFuZ2xlU2luO1xuICAgICAgICAgICAgICAgIHRtcFZlYy5tdWxTY2FsYXIoLXNpemUgKiBjb3NBbmdsZSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHNwaGVyZS5yYWRpdXMgPSBzaXplIC8gKDIgKiBjb3NBbmdsZSk7XG4gICAgICAgICAgICAgICAgdG1wVmVjLm11bFNjYWxhcigtc3BoZXJlLnJhZGl1cyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHNwaGVyZS5jZW50ZXIuYWRkMihub2RlLmdldFBvc2l0aW9uKCksIHRtcFZlYyk7XG5cbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLl90eXBlID09PSBMSUdIVFRZUEVfT01OSSkge1xuICAgICAgICAgICAgc3BoZXJlLmNlbnRlciA9IHRoaXMuX25vZGUuZ2V0UG9zaXRpb24oKTtcbiAgICAgICAgICAgIHNwaGVyZS5yYWRpdXMgPSB0aGlzLmF0dGVudWF0aW9uRW5kO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2V0Qm91bmRpbmdCb3goYm94KSB7XG4gICAgICAgIGlmICh0aGlzLl90eXBlID09PSBMSUdIVFRZUEVfU1BPVCkge1xuICAgICAgICAgICAgY29uc3QgcmFuZ2UgPSB0aGlzLmF0dGVudWF0aW9uRW5kO1xuICAgICAgICAgICAgY29uc3QgYW5nbGUgPSB0aGlzLl9vdXRlckNvbmVBbmdsZTtcbiAgICAgICAgICAgIGNvbnN0IG5vZGUgPSB0aGlzLl9ub2RlO1xuXG4gICAgICAgICAgICBjb25zdCBzY2wgPSBNYXRoLmFicyhNYXRoLnNpbihhbmdsZSAqIG1hdGguREVHX1RPX1JBRCkgKiByYW5nZSk7XG5cbiAgICAgICAgICAgIGJveC5jZW50ZXIuc2V0KDAsIC1yYW5nZSAqIDAuNSwgMCk7XG4gICAgICAgICAgICBib3guaGFsZkV4dGVudHMuc2V0KHNjbCwgcmFuZ2UgKiAwLjUsIHNjbCk7XG5cbiAgICAgICAgICAgIGJveC5zZXRGcm9tVHJhbnNmb3JtZWRBYWJiKGJveCwgbm9kZS5nZXRXb3JsZFRyYW5zZm9ybSgpLCB0cnVlKTtcblxuICAgICAgICB9IGVsc2UgaWYgKHRoaXMuX3R5cGUgPT09IExJR0hUVFlQRV9PTU5JKSB7XG4gICAgICAgICAgICBib3guY2VudGVyLmNvcHkodGhpcy5fbm9kZS5nZXRQb3NpdGlvbigpKTtcbiAgICAgICAgICAgIGJveC5oYWxmRXh0ZW50cy5zZXQodGhpcy5hdHRlbnVhdGlvbkVuZCwgdGhpcy5hdHRlbnVhdGlvbkVuZCwgdGhpcy5hdHRlbnVhdGlvbkVuZCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBfdXBkYXRlRmluYWxDb2xvcigpIHtcbiAgICAgICAgY29uc3QgY29sb3IgPSB0aGlzLl9jb2xvcjtcbiAgICAgICAgY29uc3QgciA9IGNvbG9yLnI7XG4gICAgICAgIGNvbnN0IGcgPSBjb2xvci5nO1xuICAgICAgICBjb25zdCBiID0gY29sb3IuYjtcblxuICAgICAgICBsZXQgaSA9IHRoaXMuX2ludGVuc2l0eTtcblxuICAgICAgICAvLyBUbyBjYWxjdWxhdGUgdGhlIGx1eCwgd2hpY2ggaXMgbG0vbV4yLCB3ZSBuZWVkIHRvIGNvbnZlcnQgZnJvbSBsdW1pbm91cyBwb3dlclxuICAgICAgICBpZiAodGhpcy5fdXNlUGh5c2ljYWxVbml0cykge1xuICAgICAgICAgICAgaSA9IHRoaXMuX2x1bWluYW5jZSAvIExpZ2h0LmdldExpZ2h0VW5pdENvbnZlcnNpb24odGhpcy5fdHlwZSwgdGhpcy5fb3V0ZXJDb25lQW5nbGUgKiBtYXRoLkRFR19UT19SQUQsIHRoaXMuX2lubmVyQ29uZUFuZ2xlICogbWF0aC5ERUdfVE9fUkFEKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGZpbmFsQ29sb3IgPSB0aGlzLl9maW5hbENvbG9yO1xuICAgICAgICBjb25zdCBsaW5lYXJGaW5hbENvbG9yID0gdGhpcy5fbGluZWFyRmluYWxDb2xvcjtcblxuICAgICAgICBmaW5hbENvbG9yWzBdID0gciAqIGk7XG4gICAgICAgIGZpbmFsQ29sb3JbMV0gPSBnICogaTtcbiAgICAgICAgZmluYWxDb2xvclsyXSA9IGIgKiBpO1xuICAgICAgICBpZiAoaSA+PSAxKSB7XG4gICAgICAgICAgICBsaW5lYXJGaW5hbENvbG9yWzBdID0gTWF0aC5wb3cociwgMi4yKSAqIGk7XG4gICAgICAgICAgICBsaW5lYXJGaW5hbENvbG9yWzFdID0gTWF0aC5wb3coZywgMi4yKSAqIGk7XG4gICAgICAgICAgICBsaW5lYXJGaW5hbENvbG9yWzJdID0gTWF0aC5wb3coYiwgMi4yKSAqIGk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBsaW5lYXJGaW5hbENvbG9yWzBdID0gTWF0aC5wb3coZmluYWxDb2xvclswXSwgMi4yKTtcbiAgICAgICAgICAgIGxpbmVhckZpbmFsQ29sb3JbMV0gPSBNYXRoLnBvdyhmaW5hbENvbG9yWzFdLCAyLjIpO1xuICAgICAgICAgICAgbGluZWFyRmluYWxDb2xvclsyXSA9IE1hdGgucG93KGZpbmFsQ29sb3JbMl0sIDIuMik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBzZXRDb2xvcigpIHtcbiAgICAgICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgICAgIHRoaXMuX2NvbG9yLnNldChhcmd1bWVudHNbMF0uciwgYXJndW1lbnRzWzBdLmcsIGFyZ3VtZW50c1swXS5iKTtcbiAgICAgICAgfSBlbHNlIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAzKSB7XG4gICAgICAgICAgICB0aGlzLl9jb2xvci5zZXQoYXJndW1lbnRzWzBdLCBhcmd1bWVudHNbMV0sIGFyZ3VtZW50c1syXSk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl91cGRhdGVGaW5hbENvbG9yKCk7XG4gICAgfVxuXG4gICAgbGF5ZXJzRGlydHkoKSB7XG4gICAgICAgIHRoaXMubGF5ZXJzLmZvckVhY2goKGxheWVyKSA9PiB7XG4gICAgICAgICAgICBsYXllci5tYXJrTGlnaHRzRGlydHkoKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVXBkYXRlcyBhIGludGVnZXIga2V5IGZvciB0aGUgbGlnaHQuIFRoZSBrZXkgaXMgdXNlZCB0byBpZGVudGlmeSBhbGwgc2hhZGVyIHJlbGF0ZWQgZmVhdHVyZXNcbiAgICAgKiBvZiB0aGUgbGlnaHQsIGFuZCBzbyBuZWVkcyB0byBoYXZlIGFsbCBwcm9wZXJ0aWVzIHRoYXQgbW9kaWZ5IHRoZSBnZW5lcmF0ZWQgc2hhZGVyIGVuY29kZWQuXG4gICAgICogUHJvcGVydGllcyB3aXRob3V0IGFuIGVmZmVjdCBvbiB0aGUgc2hhZGVyIChjb2xvciwgc2hhZG93IGludGVuc2l0eSkgc2hvdWxkIG5vdCBiZSBlbmNvZGVkLlxuICAgICAqL1xuICAgIHVwZGF0ZUtleSgpIHtcbiAgICAgICAgLy8gS2V5IGRlZmluaXRpb246XG4gICAgICAgIC8vIEJpdFxuICAgICAgICAvLyAzMSAgICAgIDogc2lnbiBiaXQgKGxlYXZlKVxuICAgICAgICAvLyAyOSAtIDMwIDogdHlwZVxuICAgICAgICAvLyAyOCAgICAgIDogY2FzdCBzaGFkb3dzXG4gICAgICAgIC8vIDI1IC0gMjcgOiBzaGFkb3cgdHlwZVxuICAgICAgICAvLyAyMyAtIDI0IDogZmFsbG9mZiBtb2RlXG4gICAgICAgIC8vIDIyICAgICAgOiBub3JtYWwgb2Zmc2V0IGJpYXNcbiAgICAgICAgLy8gMjEgICAgICA6IGNvb2tpZVxuICAgICAgICAvLyAyMCAgICAgIDogY29va2llIGZhbGxvZmZcbiAgICAgICAgLy8gMTggLSAxOSA6IGNvb2tpZSBjaGFubmVsIFJcbiAgICAgICAgLy8gMTYgLSAxNyA6IGNvb2tpZSBjaGFubmVsIEdcbiAgICAgICAgLy8gMTQgLSAxNSA6IGNvb2tpZSBjaGFubmVsIEJcbiAgICAgICAgLy8gMTIgICAgICA6IGNvb2tpZSB0cmFuc2Zvcm1cbiAgICAgICAgLy8gMTAgLSAxMSA6IGxpZ2h0IHNvdXJjZSBzaGFwZVxuICAgICAgICAvLyAgOCAtICA5IDogbGlnaHQgbnVtIGNhc2NhZGVzXG4gICAgICAgIC8vICA3ICAgICAgOiBkaXNhYmxlIHNwZWN1bGFyXG4gICAgICAgIC8vICA2IC0gIDQgOiBtYXNrXG4gICAgICAgIGxldCBrZXkgPVxuICAgICAgICAgICAgICAgKHRoaXMuX3R5cGUgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDw8IDI5KSB8XG4gICAgICAgICAgICAgICAoKHRoaXMuX2Nhc3RTaGFkb3dzID8gMSA6IDApICAgICAgICAgICAgICAgPDwgMjgpIHxcbiAgICAgICAgICAgICAgICh0aGlzLl9zaGFkb3dUeXBlICAgICAgICAgICAgICAgICAgICAgICAgICA8PCAyNSkgfFxuICAgICAgICAgICAgICAgKHRoaXMuX2ZhbGxvZmZNb2RlICAgICAgICAgICAgICAgICAgICAgICAgIDw8IDIzKSB8XG4gICAgICAgICAgICAgICAoKHRoaXMuX25vcm1hbE9mZnNldEJpYXMgIT09IDAuMCA/IDEgOiAwKSAgPDwgMjIpIHxcbiAgICAgICAgICAgICAgICgodGhpcy5fY29va2llID8gMSA6IDApICAgICAgICAgICAgICAgICAgICA8PCAyMSkgfFxuICAgICAgICAgICAgICAgKCh0aGlzLl9jb29raWVGYWxsb2ZmID8gMSA6IDApICAgICAgICAgICAgIDw8IDIwKSB8XG4gICAgICAgICAgICAgICAoY2hhbklkW3RoaXMuX2Nvb2tpZUNoYW5uZWwuY2hhckF0KDApXSAgICAgPDwgMTgpIHxcbiAgICAgICAgICAgICAgICgodGhpcy5fY29va2llVHJhbnNmb3JtID8gMSA6IDApICAgICAgICAgICA8PCAxMikgfFxuICAgICAgICAgICAgICAgKCh0aGlzLl9zaGFwZSkgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDw8IDEwKSB8XG4gICAgICAgICAgICAgICAoKHRoaXMubnVtQ2FzY2FkZXMgLSAxKSAgICAgICAgICAgICAgICAgICAgPDwgIDgpIHxcbiAgICAgICAgICAgICAgICgodGhpcy5hZmZlY3RTcGVjdWxhcml0eSA/IDEgOiAwKSAgICAgICAgICA8PCAgNykgfFxuICAgICAgICAgICAgICAgKCh0aGlzLm1hc2spICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDw8ICA2KTtcblxuICAgICAgICBpZiAodGhpcy5fY29va2llQ2hhbm5lbC5sZW5ndGggPT09IDMpIHtcbiAgICAgICAgICAgIGtleSB8PSAoY2hhbklkW3RoaXMuX2Nvb2tpZUNoYW5uZWwuY2hhckF0KDEpXSA8PCAxNik7XG4gICAgICAgICAgICBrZXkgfD0gKGNoYW5JZFt0aGlzLl9jb29raWVDaGFubmVsLmNoYXJBdCgyKV0gPDwgMTQpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGtleSAhPT0gdGhpcy5rZXkpIHtcbiAgICAgICAgICAgIC8vIFRoZSBsYXllciBtYWludGFpbnMgbGlnaHRzIHNwbGl0IGFuZCBzb3J0ZWQgYnkgdGhlIGtleSwgbm90aWZ5IGl0IHdoZW4gdGhlIGtleSBjaGFuZ2VzXG4gICAgICAgICAgICB0aGlzLmxheWVyc0RpcnR5KCk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmtleSA9IGtleTtcbiAgICB9XG59XG5cbmV4cG9ydCB7IExpZ2h0LCBsaWdodFR5cGVzIH07XG4iXSwibmFtZXMiOlsidG1wVmVjIiwiVmVjMyIsInRtcEJpYXNlcyIsImJpYXMiLCJub3JtYWxCaWFzIiwiY2hhbklkIiwiciIsImciLCJiIiwiYSIsImxpZ2h0VHlwZXMiLCJMSUdIVFRZUEVfRElSRUNUSU9OQUwiLCJMSUdIVFRZUEVfT01OSSIsIkxJR0hUVFlQRV9TUE9UIiwiZGlyZWN0aW9uYWxDYXNjYWRlcyIsIlZlYzQiLCJpZCIsIkxpZ2h0UmVuZGVyRGF0YSIsImNvbnN0cnVjdG9yIiwiZGV2aWNlIiwiY2FtZXJhIiwiZmFjZSIsImxpZ2h0Iiwic2hhZG93Q2FtZXJhIiwiU2hhZG93UmVuZGVyZXIiLCJjcmVhdGVTaGFkb3dDYW1lcmEiLCJfc2hhZG93VHlwZSIsIl90eXBlIiwic2hhZG93TWF0cml4IiwiTWF0NCIsInNoYWRvd1ZpZXdwb3J0Iiwic2hhZG93U2Npc3NvciIsImRlcHRoUmFuZ2VDb21wZW5zYXRpb24iLCJwcm9qZWN0aW9uQ29tcGVuc2F0aW9uIiwidmlzaWJsZUNhc3RlcnMiLCJ2aWV3QmluZEdyb3VwcyIsImRlc3Ryb3kiLCJmb3JFYWNoIiwiYmciLCJkZWZhdWx0VW5pZm9ybUJ1ZmZlciIsImxlbmd0aCIsInNoYWRvd0J1ZmZlciIsInJ0IiwicmVuZGVyVGFyZ2V0IiwiY29sb3JCdWZmZXIiLCJfaXNQY2YiLCJzdXBwb3J0c0RlcHRoU2hhZG93IiwiZGVwdGhCdWZmZXIiLCJMaWdodCIsImdyYXBoaWNzRGV2aWNlIiwibGF5ZXJzIiwiU2V0IiwiX2NvbG9yIiwiQ29sb3IiLCJfaW50ZW5zaXR5IiwiX2FmZmVjdFNwZWN1bGFyaXR5IiwiX2x1bWluYW5jZSIsIl9jYXN0U2hhZG93cyIsIl9lbmFibGVkIiwiX21hc2siLCJNQVNLX0FGRkVDVF9EWU5BTUlDIiwiaXNTdGF0aWMiLCJrZXkiLCJiYWtlRGlyIiwiYmFrZU51bVNhbXBsZXMiLCJiYWtlQXJlYSIsImF0dGVudWF0aW9uU3RhcnQiLCJhdHRlbnVhdGlvbkVuZCIsIl9mYWxsb2ZmTW9kZSIsIkxJR0hURkFMTE9GRl9MSU5FQVIiLCJTSEFET1dfUENGMyIsIl92c21CbHVyU2l6ZSIsInZzbUJsdXJNb2RlIiwiQkxVUl9HQVVTU0lBTiIsInZzbUJpYXMiLCJfY29va2llIiwiY29va2llSW50ZW5zaXR5IiwiX2Nvb2tpZUZhbGxvZmYiLCJfY29va2llQ2hhbm5lbCIsIl9jb29raWVUcmFuc2Zvcm0iLCJfY29va2llVHJhbnNmb3JtVW5pZm9ybSIsIkZsb2F0MzJBcnJheSIsIl9jb29raWVPZmZzZXQiLCJfY29va2llT2Zmc2V0VW5pZm9ybSIsIl9jb29raWVUcmFuc2Zvcm1TZXQiLCJfY29va2llT2Zmc2V0U2V0IiwiX2lubmVyQ29uZUFuZ2xlIiwiX291dGVyQ29uZUFuZ2xlIiwiY2FzY2FkZXMiLCJfc2hhZG93TWF0cml4UGFsZXR0ZSIsIl9zaGFkb3dDYXNjYWRlRGlzdGFuY2VzIiwibnVtQ2FzY2FkZXMiLCJjYXNjYWRlRGlzdHJpYnV0aW9uIiwiX3NoYXBlIiwiTElHSFRTSEFQRV9QVU5DVFVBTCIsIl9maW5hbENvbG9yIiwiYyIsIk1hdGgiLCJwb3ciLCJfbGluZWFyRmluYWxDb2xvciIsIl9wb3NpdGlvbiIsIl9kaXJlY3Rpb24iLCJfaW5uZXJDb25lQW5nbGVDb3MiLCJjb3MiLCJQSSIsIl91cGRhdGVPdXRlckFuZ2xlIiwiX3VzZVBoeXNpY2FsVW5pdHMiLCJ1bmRlZmluZWQiLCJfc2hhZG93TWFwIiwiX3NoYWRvd1JlbmRlclBhcmFtcyIsIl9zaGFkb3dDYW1lcmFQYXJhbXMiLCJzaGFkb3dEaXN0YW5jZSIsIl9zaGFkb3dSZXNvbHV0aW9uIiwic2hhZG93QmlhcyIsInNoYWRvd0ludGVuc2l0eSIsIl9ub3JtYWxPZmZzZXRCaWFzIiwic2hhZG93VXBkYXRlTW9kZSIsIlNIQURPV1VQREFURV9SRUFMVElNRSIsInNoYWRvd1VwZGF0ZU92ZXJyaWRlcyIsIl9wZW51bWJyYVNpemUiLCJfaXNWc20iLCJfY29va2llTWF0cml4IiwiX2F0bGFzVmlld3BvcnQiLCJhdGxhc1ZpZXdwb3J0QWxsb2NhdGVkIiwiYXRsYXNWZXJzaW9uIiwiYXRsYXNTbG90SW5kZXgiLCJhdGxhc1Nsb3RVcGRhdGVkIiwiX25vZGUiLCJfcmVuZGVyRGF0YSIsInZpc2libGVUaGlzRnJhbWUiLCJtYXhTY3JlZW5TaXplIiwiX2Rlc3Ryb3lTaGFkb3dNYXAiLCJyZWxlYXNlUmVuZGVyRGF0YSIsImkiLCJhZGRMYXllciIsImxheWVyIiwiYWRkIiwicmVtb3ZlTGF5ZXIiLCJkZWxldGUiLCJ2YWx1ZSIsInVwZGF0ZUtleSIsInNoYWRvd01hcCIsIm1hc2siLCJudW1TaGFkb3dGYWNlcyIsInR5cGUiLCJzdHlwZSIsInNoYWRvd1R5cGUiLCJzaGFwZSIsInVzZVBoeXNpY2FsVW5pdHMiLCJfdXBkYXRlRmluYWxDb2xvciIsIlNIQURPV19QQ1NTIiwiU0hBRE9XX1BDRjUiLCJTSEFET1dfVlNNMzIiLCJ0ZXh0dXJlRmxvYXRSZW5kZXJhYmxlIiwiU0hBRE9XX1ZTTTE2IiwidGV4dHVyZUhhbGZGbG9hdFJlbmRlcmFibGUiLCJTSEFET1dfVlNNOCIsIlNIQURPV19QQ0YxIiwiZW5hYmxlZCIsImxheWVyc0RpcnR5IiwiY2FzdFNoYWRvd3MiLCJNQVNLX0JBS0UiLCJzaGFkb3dSZXNvbHV0aW9uIiwibWluIiwibWF4Q3ViZU1hcFNpemUiLCJtYXhUZXh0dXJlU2l6ZSIsInZzbUJsdXJTaXplIiwibm9ybWFsT2Zmc2V0QmlhcyIsImZhbGxvZmZNb2RlIiwiaW5uZXJDb25lQW5nbGUiLCJvdXRlckNvbmVBbmdsZSIsInBlbnVtYnJhU2l6ZSIsImFuZ2xlIiwicmFkQW5nbGUiLCJfb3V0ZXJDb25lQW5nbGVDb3MiLCJfb3V0ZXJDb25lQW5nbGVTaW4iLCJzaW4iLCJpbnRlbnNpdHkiLCJhZmZlY3RTcGVjdWxhcml0eSIsImx1bWluYW5jZSIsImNvb2tpZU1hdHJpeCIsImF0bGFzVmlld3BvcnQiLCJjb29raWUiLCJjb29raWVGYWxsb2ZmIiwiY29va2llQ2hhbm5lbCIsImNociIsImNoYXJBdCIsImFkZExlbiIsImNvb2tpZVRyYW5zZm9ybSIsImNvb2tpZU9mZnNldCIsIlZlYzIiLCJ4Zm9ybU5ldyIsInNldCIsImJlZ2luRnJhbWUiLCJjYWNoZWQiLCJTSEFET1dVUERBVEVfTk9ORSIsIlNIQURPV1VQREFURV9USElTRlJBTUUiLCJnZXRSZW5kZXJEYXRhIiwiY3VycmVudCIsInJkIiwicHVzaCIsImNsb25lIiwic2V0Q29sb3IiLCJzbGljZSIsImdldExpZ2h0VW5pdENvbnZlcnNpb24iLCJvdXRlckFuZ2xlIiwiaW5uZXJBbmdsZSIsImZhbGxvZmZFbmQiLCJmYWxsb2ZmU3RhcnQiLCJfZ2V0VW5pZm9ybUJpYXNWYWx1ZXMiLCJsaWdodFJlbmRlckRhdGEiLCJmYXJDbGlwIiwiX2ZhckNsaXAiLCJ3ZWJnbDIiLCJleHRTdGFuZGFyZERlcml2YXRpdmVzIiwiZ2V0Q29sb3IiLCJnZXRCb3VuZGluZ1NwaGVyZSIsInNwaGVyZSIsInNpemUiLCJjb3NBbmdsZSIsIm5vZGUiLCJjb3B5IiwidXAiLCJyYWRpdXMiLCJtdWxTY2FsYXIiLCJjZW50ZXIiLCJhZGQyIiwiZ2V0UG9zaXRpb24iLCJnZXRCb3VuZGluZ0JveCIsImJveCIsInJhbmdlIiwic2NsIiwiYWJzIiwibWF0aCIsIkRFR19UT19SQUQiLCJoYWxmRXh0ZW50cyIsInNldEZyb21UcmFuc2Zvcm1lZEFhYmIiLCJnZXRXb3JsZFRyYW5zZm9ybSIsImNvbG9yIiwiZmluYWxDb2xvciIsImxpbmVhckZpbmFsQ29sb3IiLCJhcmd1bWVudHMiLCJtYXJrTGlnaHRzRGlydHkiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7OztBQWlCQSxNQUFNQSxNQUFNLEdBQUcsSUFBSUMsSUFBSSxFQUFFLENBQUE7QUFDekIsTUFBTUMsU0FBUyxHQUFHO0FBQ2RDLEVBQUFBLElBQUksRUFBRSxDQUFDO0FBQ1BDLEVBQUFBLFVBQVUsRUFBRSxDQUFBO0FBQ2hCLENBQUMsQ0FBQTtBQUVELE1BQU1DLE1BQU0sR0FBRztBQUFFQyxFQUFBQSxDQUFDLEVBQUUsQ0FBQztBQUFFQyxFQUFBQSxDQUFDLEVBQUUsQ0FBQztBQUFFQyxFQUFBQSxDQUFDLEVBQUUsQ0FBQztBQUFFQyxFQUFBQSxDQUFDLEVBQUUsQ0FBQTtBQUFFLENBQUMsQ0FBQTtBQUV6QyxNQUFNQyxVQUFVLEdBQUc7QUFDZixFQUFBLGFBQWEsRUFBRUMscUJBQXFCO0FBQ3BDLEVBQUEsTUFBTSxFQUFFQyxjQUFjO0FBQ3RCLEVBQUEsT0FBTyxFQUFFQSxjQUFjO0FBQ3ZCLEVBQUEsTUFBTSxFQUFFQyxjQUFBQTtBQUNaLEVBQUM7O0FBRUQ7QUFDQSxNQUFNQyxtQkFBbUIsR0FBRyxDQUN4QixDQUFDLElBQUlDLElBQUksQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUN0QixDQUFDLElBQUlBLElBQUksQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsRUFBRSxJQUFJQSxJQUFJLENBQUMsQ0FBQyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUMsRUFDdEQsQ0FBQyxJQUFJQSxJQUFJLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLEVBQUUsSUFBSUEsSUFBSSxDQUFDLENBQUMsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxFQUFFLElBQUlBLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQyxFQUNsRixDQUFDLElBQUlBLElBQUksQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsRUFBRSxJQUFJQSxJQUFJLENBQUMsQ0FBQyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLEVBQUUsSUFBSUEsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxFQUFFLElBQUlBLElBQUksQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUNuSCxDQUFBO0FBRUQsSUFBSUMsRUFBRSxHQUFHLENBQUMsQ0FBQTs7QUFFVjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsTUFBTUMsZUFBZSxDQUFDO0VBQ2xCQyxXQUFXQSxDQUFDQyxNQUFNLEVBQUVDLE1BQU0sRUFBRUMsSUFBSSxFQUFFQyxLQUFLLEVBQUU7QUFFckM7SUFDQSxJQUFJLENBQUNBLEtBQUssR0FBR0EsS0FBSyxDQUFBOztBQUVsQjtBQUNBO0FBQ0E7QUFDQTtJQUNBLElBQUksQ0FBQ0YsTUFBTSxHQUFHQSxNQUFNLENBQUE7O0FBRXBCO0FBQ0EsSUFBQSxJQUFJLENBQUNHLFlBQVksR0FBR0MsY0FBYyxDQUFDQyxrQkFBa0IsQ0FBQ04sTUFBTSxFQUFFRyxLQUFLLENBQUNJLFdBQVcsRUFBRUosS0FBSyxDQUFDSyxLQUFLLEVBQUVOLElBQUksQ0FBQyxDQUFBOztBQUVuRztBQUNBLElBQUEsSUFBSSxDQUFDTyxZQUFZLEdBQUcsSUFBSUMsSUFBSSxFQUFFLENBQUE7O0FBRTlCO0FBQ0EsSUFBQSxJQUFJLENBQUNDLGNBQWMsR0FBRyxJQUFJZixJQUFJLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUE7O0FBRTFDO0FBQ0EsSUFBQSxJQUFJLENBQUNnQixhQUFhLEdBQUcsSUFBSWhCLElBQUksQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQTs7QUFFekM7SUFDQSxJQUFJLENBQUNpQixzQkFBc0IsR0FBRyxDQUFDLENBQUE7SUFDL0IsSUFBSSxDQUFDQyxzQkFBc0IsR0FBRyxDQUFDLENBQUE7O0FBRS9CO0FBQ0E7QUFDQTtBQUNBO0lBQ0EsSUFBSSxDQUFDWixJQUFJLEdBQUdBLElBQUksQ0FBQTs7QUFFaEI7SUFDQSxJQUFJLENBQUNhLGNBQWMsR0FBRyxFQUFFLENBQUE7O0FBRXhCO0FBQ0E7SUFDQSxJQUFJLENBQUNDLGNBQWMsR0FBRyxFQUFFLENBQUE7QUFDNUIsR0FBQTs7QUFFQTtBQUNBQyxFQUFBQSxPQUFPQSxHQUFHO0FBQ04sSUFBQSxJQUFJLENBQUNELGNBQWMsQ0FBQ0UsT0FBTyxDQUFFQyxFQUFFLElBQUs7QUFDaENBLE1BQUFBLEVBQUUsQ0FBQ0Msb0JBQW9CLENBQUNILE9BQU8sRUFBRSxDQUFBO01BQ2pDRSxFQUFFLENBQUNGLE9BQU8sRUFBRSxDQUFBO0FBQ2hCLEtBQUMsQ0FBQyxDQUFBO0FBQ0YsSUFBQSxJQUFJLENBQUNELGNBQWMsQ0FBQ0ssTUFBTSxHQUFHLENBQUMsQ0FBQTtBQUNsQyxHQUFBOztBQUVBO0VBQ0EsSUFBSUMsWUFBWUEsR0FBRztBQUNmLElBQUEsTUFBTUMsRUFBRSxHQUFHLElBQUksQ0FBQ25CLFlBQVksQ0FBQ29CLFlBQVksQ0FBQTtBQUN6QyxJQUFBLElBQUlELEVBQUUsRUFBRTtBQUNKLE1BQUEsTUFBTXBCLEtBQUssR0FBRyxJQUFJLENBQUNBLEtBQUssQ0FBQTtBQUN4QixNQUFBLElBQUlBLEtBQUssQ0FBQ0ssS0FBSyxLQUFLZixjQUFjLEVBQUU7UUFDaEMsT0FBTzhCLEVBQUUsQ0FBQ0UsV0FBVyxDQUFBO0FBQ3pCLE9BQUE7QUFFQSxNQUFBLE9BQU90QixLQUFLLENBQUN1QixNQUFNLElBQUl2QixLQUFLLENBQUNILE1BQU0sQ0FBQzJCLG1CQUFtQixHQUFHSixFQUFFLENBQUNLLFdBQVcsR0FBR0wsRUFBRSxDQUFDRSxXQUFXLENBQUE7QUFDN0YsS0FBQTtBQUVBLElBQUEsT0FBTyxJQUFJLENBQUE7QUFDZixHQUFBO0FBQ0osQ0FBQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsTUFBTUksS0FBSyxDQUFDO0VBUVI5QixXQUFXQSxDQUFDK0IsY0FBYyxFQUFFO0FBUDVCO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFKSSxJQUFBLElBQUEsQ0FLQUMsTUFBTSxHQUFHLElBQUlDLEdBQUcsRUFBRSxDQUFBO0lBR2QsSUFBSSxDQUFDaEMsTUFBTSxHQUFHOEIsY0FBYyxDQUFBO0FBQzVCLElBQUEsSUFBSSxDQUFDakMsRUFBRSxHQUFHQSxFQUFFLEVBQUUsQ0FBQTs7QUFFZDtJQUNBLElBQUksQ0FBQ1csS0FBSyxHQUFHaEIscUJBQXFCLENBQUE7SUFDbEMsSUFBSSxDQUFDeUMsTUFBTSxHQUFHLElBQUlDLEtBQUssQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFBO0lBQ3RDLElBQUksQ0FBQ0MsVUFBVSxHQUFHLENBQUMsQ0FBQTtJQUNuQixJQUFJLENBQUNDLGtCQUFrQixHQUFHLElBQUksQ0FBQTtJQUM5QixJQUFJLENBQUNDLFVBQVUsR0FBRyxDQUFDLENBQUE7SUFDbkIsSUFBSSxDQUFDQyxZQUFZLEdBQUcsS0FBSyxDQUFBO0lBQ3pCLElBQUksQ0FBQ0MsUUFBUSxHQUFHLEtBQUssQ0FBQTtJQUNyQixJQUFJLENBQUNDLEtBQUssR0FBR0MsbUJBQW1CLENBQUE7SUFDaEMsSUFBSSxDQUFDQyxRQUFRLEdBQUcsS0FBSyxDQUFBO0lBQ3JCLElBQUksQ0FBQ0MsR0FBRyxHQUFHLENBQUMsQ0FBQTtJQUNaLElBQUksQ0FBQ0MsT0FBTyxHQUFHLElBQUksQ0FBQTtJQUNuQixJQUFJLENBQUNDLGNBQWMsR0FBRyxDQUFDLENBQUE7SUFDdkIsSUFBSSxDQUFDQyxRQUFRLEdBQUcsQ0FBQyxDQUFBOztBQUVqQjtJQUNBLElBQUksQ0FBQ0MsZ0JBQWdCLEdBQUcsRUFBRSxDQUFBO0lBQzFCLElBQUksQ0FBQ0MsY0FBYyxHQUFHLEVBQUUsQ0FBQTtJQUN4QixJQUFJLENBQUNDLFlBQVksR0FBR0MsbUJBQW1CLENBQUE7SUFDdkMsSUFBSSxDQUFDM0MsV0FBVyxHQUFHNEMsV0FBVyxDQUFBO0lBQzlCLElBQUksQ0FBQ0MsWUFBWSxHQUFHLEVBQUUsQ0FBQTtJQUN0QixJQUFJLENBQUNDLFdBQVcsR0FBR0MsYUFBYSxDQUFBO0FBQ2hDLElBQUEsSUFBSSxDQUFDQyxPQUFPLEdBQUcsSUFBSSxHQUFHLElBQUksQ0FBQTtBQUMxQixJQUFBLElBQUksQ0FBQ0MsT0FBTyxHQUFHLElBQUksQ0FBQztJQUNwQixJQUFJLENBQUNDLGVBQWUsR0FBRyxDQUFDLENBQUE7SUFDeEIsSUFBSSxDQUFDQyxjQUFjLEdBQUcsSUFBSSxDQUFBO0lBQzFCLElBQUksQ0FBQ0MsY0FBYyxHQUFHLEtBQUssQ0FBQTtBQUMzQixJQUFBLElBQUksQ0FBQ0MsZ0JBQWdCLEdBQUcsSUFBSSxDQUFDO0FBQzdCLElBQUEsSUFBSSxDQUFDQyx1QkFBdUIsR0FBRyxJQUFJQyxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUE7QUFDbEQsSUFBQSxJQUFJLENBQUNDLGFBQWEsR0FBRyxJQUFJLENBQUM7QUFDMUIsSUFBQSxJQUFJLENBQUNDLG9CQUFvQixHQUFHLElBQUlGLFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQTtJQUMvQyxJQUFJLENBQUNHLG1CQUFtQixHQUFHLEtBQUssQ0FBQTtJQUNoQyxJQUFJLENBQUNDLGdCQUFnQixHQUFHLEtBQUssQ0FBQTs7QUFFN0I7SUFDQSxJQUFJLENBQUNDLGVBQWUsR0FBRyxFQUFFLENBQUE7SUFDekIsSUFBSSxDQUFDQyxlQUFlLEdBQUcsRUFBRSxDQUFBOztBQUV6QjtBQUNBLElBQUEsSUFBSSxDQUFDQyxRQUFRLEdBQUcsSUFBSSxDQUFDO0FBQ3JCLElBQUEsSUFBSSxDQUFDQyxvQkFBb0IsR0FBRyxJQUFJLENBQUM7SUFDakMsSUFBSSxDQUFDQyx1QkFBdUIsR0FBRyxJQUFJLENBQUE7SUFDbkMsSUFBSSxDQUFDQyxXQUFXLEdBQUcsQ0FBQyxDQUFBO0lBQ3BCLElBQUksQ0FBQ0MsbUJBQW1CLEdBQUcsR0FBRyxDQUFBOztBQUU5QjtJQUNBLElBQUksQ0FBQ0MsTUFBTSxHQUFHQyxtQkFBbUIsQ0FBQTs7QUFFakM7QUFDQSxJQUFBLElBQUksQ0FBQ0MsV0FBVyxHQUFHLElBQUlkLFlBQVksQ0FBQyxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQTtBQUNwRCxJQUFBLE1BQU1lLENBQUMsR0FBR0MsSUFBSSxDQUFDQyxHQUFHLENBQUMsSUFBSSxDQUFDSCxXQUFXLENBQUMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUE7QUFDNUMsSUFBQSxJQUFJLENBQUNJLGlCQUFpQixHQUFHLElBQUlsQixZQUFZLENBQUMsQ0FBQ2UsQ0FBQyxFQUFFQSxDQUFDLEVBQUVBLENBQUMsQ0FBQyxDQUFDLENBQUE7SUFFcEQsSUFBSSxDQUFDSSxTQUFTLEdBQUcsSUFBSW5HLElBQUksQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFBO0lBQ2xDLElBQUksQ0FBQ29HLFVBQVUsR0FBRyxJQUFJcEcsSUFBSSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUE7QUFDbkMsSUFBQSxJQUFJLENBQUNxRyxrQkFBa0IsR0FBR0wsSUFBSSxDQUFDTSxHQUFHLENBQUMsSUFBSSxDQUFDakIsZUFBZSxHQUFHVyxJQUFJLENBQUNPLEVBQUUsR0FBRyxHQUFHLENBQUMsQ0FBQTtBQUN4RSxJQUFBLElBQUksQ0FBQ0MsaUJBQWlCLENBQUMsSUFBSSxDQUFDbEIsZUFBZSxDQUFDLENBQUE7SUFFNUMsSUFBSSxDQUFDbUIsaUJBQWlCLEdBQUdDLFNBQVMsQ0FBQTs7QUFFbEM7SUFDQSxJQUFJLENBQUNDLFVBQVUsR0FBRyxJQUFJLENBQUE7SUFDdEIsSUFBSSxDQUFDQyxtQkFBbUIsR0FBRyxFQUFFLENBQUE7SUFDN0IsSUFBSSxDQUFDQyxtQkFBbUIsR0FBRyxFQUFFLENBQUE7O0FBRTdCO0lBQ0EsSUFBSSxDQUFDQyxjQUFjLEdBQUcsRUFBRSxDQUFBO0lBQ3hCLElBQUksQ0FBQ0MsaUJBQWlCLEdBQUcsSUFBSSxDQUFBO0FBQzdCLElBQUEsSUFBSSxDQUFDQyxVQUFVLEdBQUcsQ0FBQyxNQUFNLENBQUE7SUFDekIsSUFBSSxDQUFDQyxlQUFlLEdBQUcsR0FBRyxDQUFBO0lBQzFCLElBQUksQ0FBQ0MsaUJBQWlCLEdBQUcsR0FBRyxDQUFBO0lBQzVCLElBQUksQ0FBQ0MsZ0JBQWdCLEdBQUdDLHFCQUFxQixDQUFBO0lBQzdDLElBQUksQ0FBQ0MscUJBQXFCLEdBQUcsSUFBSSxDQUFBO0lBQ2pDLElBQUksQ0FBQ0MsYUFBYSxHQUFHLEdBQUcsQ0FBQTtJQUN4QixJQUFJLENBQUNDLE1BQU0sR0FBRyxLQUFLLENBQUE7SUFDbkIsSUFBSSxDQUFDM0UsTUFBTSxHQUFHLElBQUksQ0FBQTs7QUFFbEI7SUFDQSxJQUFJLENBQUM0RSxhQUFhLEdBQUcsSUFBSSxDQUFBOztBQUV6QjtJQUNBLElBQUksQ0FBQ0MsY0FBYyxHQUFHLElBQUksQ0FBQTtBQUMxQixJQUFBLElBQUksQ0FBQ0Msc0JBQXNCLEdBQUcsS0FBSyxDQUFDO0FBQ3BDLElBQUEsSUFBSSxDQUFDQyxZQUFZLEdBQUcsQ0FBQyxDQUFDO0FBQ3RCLElBQUEsSUFBSSxDQUFDQyxjQUFjLEdBQUcsQ0FBQyxDQUFDO0FBQ3hCLElBQUEsSUFBSSxDQUFDQyxnQkFBZ0IsR0FBRyxLQUFLLENBQUM7O0lBRTlCLElBQUksQ0FBQ0MsS0FBSyxHQUFHLElBQUksQ0FBQTs7QUFFakI7SUFDQSxJQUFJLENBQUNDLFdBQVcsR0FBRyxFQUFFLENBQUE7O0FBRXJCO0lBQ0EsSUFBSSxDQUFDQyxnQkFBZ0IsR0FBRyxLQUFLLENBQUE7O0FBRTdCO0FBQ0E7SUFDQSxJQUFJLENBQUNDLGFBQWEsR0FBRyxDQUFDLENBQUE7QUFDMUIsR0FBQTtBQUVBOUYsRUFBQUEsT0FBT0EsR0FBRztJQUNOLElBQUksQ0FBQytGLGlCQUFpQixFQUFFLENBQUE7SUFFeEIsSUFBSSxDQUFDQyxpQkFBaUIsRUFBRSxDQUFBO0lBQ3hCLElBQUksQ0FBQ0osV0FBVyxHQUFHLElBQUksQ0FBQTtBQUMzQixHQUFBO0FBRUFJLEVBQUFBLGlCQUFpQkEsR0FBRztJQUVoQixJQUFJLElBQUksQ0FBQ0osV0FBVyxFQUFFO0FBQ2xCLE1BQUEsS0FBSyxJQUFJSyxDQUFDLEdBQUcsQ0FBQyxFQUFFQSxDQUFDLEdBQUcsSUFBSSxDQUFDTCxXQUFXLENBQUN4RixNQUFNLEVBQUU2RixDQUFDLEVBQUUsRUFBRTtRQUM5QyxJQUFJLENBQUNMLFdBQVcsQ0FBQ0ssQ0FBQyxDQUFDLENBQUNqRyxPQUFPLEVBQUUsQ0FBQTtBQUNqQyxPQUFBO0FBRUEsTUFBQSxJQUFJLENBQUM0RixXQUFXLENBQUN4RixNQUFNLEdBQUcsQ0FBQyxDQUFBO0FBQy9CLEtBQUE7QUFDSixHQUFBO0VBRUE4RixRQUFRQSxDQUFDQyxLQUFLLEVBQUU7QUFDWixJQUFBLElBQUksQ0FBQ3JGLE1BQU0sQ0FBQ3NGLEdBQUcsQ0FBQ0QsS0FBSyxDQUFDLENBQUE7QUFDMUIsR0FBQTtFQUVBRSxXQUFXQSxDQUFDRixLQUFLLEVBQUU7QUFDZixJQUFBLElBQUksQ0FBQ3JGLE1BQU0sQ0FBQ3dGLE1BQU0sQ0FBQ0gsS0FBSyxDQUFDLENBQUE7QUFDN0IsR0FBQTtFQUVBLElBQUk1QyxXQUFXQSxDQUFDZ0QsS0FBSyxFQUFFO0lBQ25CLElBQUksQ0FBQyxJQUFJLENBQUNuRCxRQUFRLElBQUksSUFBSSxDQUFDRyxXQUFXLEtBQUtnRCxLQUFLLEVBQUU7TUFDOUMsSUFBSSxDQUFDbkQsUUFBUSxHQUFHMUUsbUJBQW1CLENBQUM2SCxLQUFLLEdBQUcsQ0FBQyxDQUFDLENBQUE7TUFDOUMsSUFBSSxDQUFDbEQsb0JBQW9CLEdBQUcsSUFBSVIsWUFBWSxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQztNQUNyRCxJQUFJLENBQUNTLHVCQUF1QixHQUFHLElBQUlULFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQztNQUNuRCxJQUFJLENBQUNrRCxpQkFBaUIsRUFBRSxDQUFBO01BQ3hCLElBQUksQ0FBQ1MsU0FBUyxFQUFFLENBQUE7QUFDcEIsS0FBQTtBQUNKLEdBQUE7RUFFQSxJQUFJakQsV0FBV0EsR0FBRztBQUNkLElBQUEsT0FBTyxJQUFJLENBQUNILFFBQVEsQ0FBQ2hELE1BQU0sQ0FBQTtBQUMvQixHQUFBO0VBRUEsSUFBSXFHLFNBQVNBLENBQUNBLFNBQVMsRUFBRTtBQUNyQixJQUFBLElBQUksSUFBSSxDQUFDakMsVUFBVSxLQUFLaUMsU0FBUyxFQUFFO01BQy9CLElBQUksQ0FBQ1YsaUJBQWlCLEVBQUUsQ0FBQTtNQUN4QixJQUFJLENBQUN2QixVQUFVLEdBQUdpQyxTQUFTLENBQUE7QUFDL0IsS0FBQTtBQUNKLEdBQUE7RUFFQSxJQUFJQSxTQUFTQSxHQUFHO0lBQ1osT0FBTyxJQUFJLENBQUNqQyxVQUFVLENBQUE7QUFDMUIsR0FBQTtFQUVBLElBQUlrQyxJQUFJQSxDQUFDSCxLQUFLLEVBQUU7QUFDWixJQUFBLElBQUksSUFBSSxDQUFDaEYsS0FBSyxLQUFLZ0YsS0FBSyxFQUFFO01BQ3RCLElBQUksQ0FBQ2hGLEtBQUssR0FBR2dGLEtBQUssQ0FBQTtNQUNsQixJQUFJLENBQUNDLFNBQVMsRUFBRSxDQUFBO0FBQ3BCLEtBQUE7QUFDSixHQUFBO0VBRUEsSUFBSUUsSUFBSUEsR0FBRztJQUNQLE9BQU8sSUFBSSxDQUFDbkYsS0FBSyxDQUFBO0FBQ3JCLEdBQUE7O0FBRUE7RUFDQSxJQUFJb0YsY0FBY0EsR0FBRztBQUNqQixJQUFBLE1BQU1DLElBQUksR0FBRyxJQUFJLENBQUNySCxLQUFLLENBQUE7SUFDdkIsSUFBSXFILElBQUksS0FBS3JJLHFCQUFxQixFQUFFO01BQ2hDLE9BQU8sSUFBSSxDQUFDZ0YsV0FBVyxDQUFBO0FBQzNCLEtBQUMsTUFBTSxJQUFJcUQsSUFBSSxLQUFLcEksY0FBYyxFQUFFO0FBQ2hDLE1BQUEsT0FBTyxDQUFDLENBQUE7QUFDWixLQUFBO0FBRUEsSUFBQSxPQUFPLENBQUMsQ0FBQTtBQUNaLEdBQUE7RUFFQSxJQUFJb0ksSUFBSUEsQ0FBQ0wsS0FBSyxFQUFFO0FBQ1osSUFBQSxJQUFJLElBQUksQ0FBQ2hILEtBQUssS0FBS2dILEtBQUssRUFDcEIsT0FBQTtJQUVKLElBQUksQ0FBQ2hILEtBQUssR0FBR2dILEtBQUssQ0FBQTtJQUNsQixJQUFJLENBQUNSLGlCQUFpQixFQUFFLENBQUE7SUFDeEIsSUFBSSxDQUFDUyxTQUFTLEVBQUUsQ0FBQTtBQUVoQixJQUFBLE1BQU1LLEtBQUssR0FBRyxJQUFJLENBQUN2SCxXQUFXLENBQUE7SUFDOUIsSUFBSSxDQUFDQSxXQUFXLEdBQUcsSUFBSSxDQUFBO0lBQ3ZCLElBQUksQ0FBQzRGLHFCQUFxQixHQUFHLElBQUksQ0FBQTtBQUNqQyxJQUFBLElBQUksQ0FBQzRCLFVBQVUsR0FBR0QsS0FBSyxDQUFDO0FBQzVCLEdBQUE7O0VBRUEsSUFBSUQsSUFBSUEsR0FBRztJQUNQLE9BQU8sSUFBSSxDQUFDckgsS0FBSyxDQUFBO0FBQ3JCLEdBQUE7RUFFQSxJQUFJd0gsS0FBS0EsQ0FBQ1IsS0FBSyxFQUFFO0FBQ2IsSUFBQSxJQUFJLElBQUksQ0FBQzlDLE1BQU0sS0FBSzhDLEtBQUssRUFDckIsT0FBQTtJQUVKLElBQUksQ0FBQzlDLE1BQU0sR0FBRzhDLEtBQUssQ0FBQTtJQUNuQixJQUFJLENBQUNSLGlCQUFpQixFQUFFLENBQUE7SUFDeEIsSUFBSSxDQUFDUyxTQUFTLEVBQUUsQ0FBQTtBQUVoQixJQUFBLE1BQU1LLEtBQUssR0FBRyxJQUFJLENBQUN2SCxXQUFXLENBQUE7SUFDOUIsSUFBSSxDQUFDQSxXQUFXLEdBQUcsSUFBSSxDQUFBO0FBQ3ZCLElBQUEsSUFBSSxDQUFDd0gsVUFBVSxHQUFHRCxLQUFLLENBQUM7QUFDNUIsR0FBQTs7RUFFQSxJQUFJRSxLQUFLQSxHQUFHO0lBQ1IsT0FBTyxJQUFJLENBQUN0RCxNQUFNLENBQUE7QUFDdEIsR0FBQTtFQUVBLElBQUl1RCxnQkFBZ0JBLENBQUNULEtBQUssRUFBRTtBQUN4QixJQUFBLElBQUksSUFBSSxDQUFDakMsaUJBQWlCLEtBQUtpQyxLQUFLLEVBQUU7TUFDbEMsSUFBSSxDQUFDakMsaUJBQWlCLEdBQUdpQyxLQUFLLENBQUE7TUFDOUIsSUFBSSxDQUFDVSxpQkFBaUIsRUFBRSxDQUFBO0FBQzVCLEtBQUE7QUFDSixHQUFBO0VBRUEsSUFBSUQsZ0JBQWdCQSxHQUFHO0lBQ25CLE9BQU8sSUFBSSxDQUFDMUMsaUJBQWlCLENBQUE7QUFDakMsR0FBQTtFQUVBLElBQUl3QyxVQUFVQSxDQUFDUCxLQUFLLEVBQUU7QUFDbEIsSUFBQSxJQUFJLElBQUksQ0FBQ2pILFdBQVcsS0FBS2lILEtBQUssRUFDMUIsT0FBQTtBQUVKLElBQUEsTUFBTXhILE1BQU0sR0FBRyxJQUFJLENBQUNBLE1BQU0sQ0FBQTtBQUUxQixJQUFBLElBQUksSUFBSSxDQUFDUSxLQUFLLEtBQUtmLGNBQWMsSUFBSStILEtBQUssS0FBS3JFLFdBQVcsSUFBSXFFLEtBQUssS0FBS1csV0FBVyxFQUMvRVgsS0FBSyxHQUFHckUsV0FBVyxDQUFDOztBQUV4QixJQUFBLE1BQU14QixtQkFBbUIsR0FBRzNCLE1BQU0sQ0FBQzJCLG1CQUFtQixDQUFBO0FBQ3RELElBQUEsSUFBSTZGLEtBQUssS0FBS1ksV0FBVyxJQUFJLENBQUN6RyxtQkFBbUIsRUFBRTtNQUMvQzZGLEtBQUssR0FBR3JFLFdBQVcsQ0FBQztBQUN4QixLQUFBOztBQUVBLElBQUEsSUFBSXFFLEtBQUssS0FBS2EsWUFBWSxJQUFJLENBQUNySSxNQUFNLENBQUNzSSxzQkFBc0I7QUFBRTtBQUMxRGQsTUFBQUEsS0FBSyxHQUFHZSxZQUFZLENBQUE7QUFFeEIsSUFBQSxJQUFJZixLQUFLLEtBQUtlLFlBQVksSUFBSSxDQUFDdkksTUFBTSxDQUFDd0ksMEJBQTBCO0FBQUU7QUFDOURoQixNQUFBQSxLQUFLLEdBQUdpQixXQUFXLENBQUE7SUFFdkIsSUFBSSxDQUFDcEMsTUFBTSxHQUFHbUIsS0FBSyxJQUFJaUIsV0FBVyxJQUFJakIsS0FBSyxJQUFJYSxZQUFZLENBQUE7QUFDM0QsSUFBQSxJQUFJLENBQUMzRyxNQUFNLEdBQUc4RixLQUFLLEtBQUtrQixXQUFXLElBQUlsQixLQUFLLEtBQUtyRSxXQUFXLElBQUlxRSxLQUFLLEtBQUtZLFdBQVcsQ0FBQTtJQUVyRixJQUFJLENBQUM3SCxXQUFXLEdBQUdpSCxLQUFLLENBQUE7SUFDeEIsSUFBSSxDQUFDUixpQkFBaUIsRUFBRSxDQUFBO0lBQ3hCLElBQUksQ0FBQ1MsU0FBUyxFQUFFLENBQUE7QUFDcEIsR0FBQTtFQUVBLElBQUlNLFVBQVVBLEdBQUc7SUFDYixPQUFPLElBQUksQ0FBQ3hILFdBQVcsQ0FBQTtBQUMzQixHQUFBO0VBRUEsSUFBSW9JLE9BQU9BLENBQUNuQixLQUFLLEVBQUU7QUFDZixJQUFBLElBQUksSUFBSSxDQUFDakYsUUFBUSxLQUFLaUYsS0FBSyxFQUFFO01BQ3pCLElBQUksQ0FBQ2pGLFFBQVEsR0FBR2lGLEtBQUssQ0FBQTtNQUNyQixJQUFJLENBQUNvQixXQUFXLEVBQUUsQ0FBQTtBQUN0QixLQUFBO0FBQ0osR0FBQTtFQUVBLElBQUlELE9BQU9BLEdBQUc7SUFDVixPQUFPLElBQUksQ0FBQ3BHLFFBQVEsQ0FBQTtBQUN4QixHQUFBO0VBRUEsSUFBSXNHLFdBQVdBLENBQUNyQixLQUFLLEVBQUU7QUFDbkIsSUFBQSxJQUFJLElBQUksQ0FBQ2xGLFlBQVksS0FBS2tGLEtBQUssRUFBRTtNQUM3QixJQUFJLENBQUNsRixZQUFZLEdBQUdrRixLQUFLLENBQUE7TUFDekIsSUFBSSxDQUFDUixpQkFBaUIsRUFBRSxDQUFBO01BQ3hCLElBQUksQ0FBQzRCLFdBQVcsRUFBRSxDQUFBO01BQ2xCLElBQUksQ0FBQ25CLFNBQVMsRUFBRSxDQUFBO0FBQ3BCLEtBQUE7QUFDSixHQUFBO0VBRUEsSUFBSW9CLFdBQVdBLEdBQUc7QUFDZCxJQUFBLE9BQU8sSUFBSSxDQUFDdkcsWUFBWSxJQUFJLElBQUksQ0FBQ0UsS0FBSyxLQUFLc0csU0FBUyxJQUFJLElBQUksQ0FBQ3RHLEtBQUssS0FBSyxDQUFDLENBQUE7QUFDNUUsR0FBQTtFQUVBLElBQUl1RyxnQkFBZ0JBLENBQUN2QixLQUFLLEVBQUU7QUFDeEIsSUFBQSxJQUFJLElBQUksQ0FBQzNCLGlCQUFpQixLQUFLMkIsS0FBSyxFQUFFO0FBQ2xDLE1BQUEsSUFBSSxJQUFJLENBQUNoSCxLQUFLLEtBQUtmLGNBQWMsRUFBRTtBQUMvQitILFFBQUFBLEtBQUssR0FBRzFDLElBQUksQ0FBQ2tFLEdBQUcsQ0FBQ3hCLEtBQUssRUFBRSxJQUFJLENBQUN4SCxNQUFNLENBQUNpSixjQUFjLENBQUMsQ0FBQTtBQUN2RCxPQUFDLE1BQU07QUFDSHpCLFFBQUFBLEtBQUssR0FBRzFDLElBQUksQ0FBQ2tFLEdBQUcsQ0FBQ3hCLEtBQUssRUFBRSxJQUFJLENBQUN4SCxNQUFNLENBQUNrSixjQUFjLENBQUMsQ0FBQTtBQUN2RCxPQUFBO01BQ0EsSUFBSSxDQUFDckQsaUJBQWlCLEdBQUcyQixLQUFLLENBQUE7TUFDOUIsSUFBSSxDQUFDUixpQkFBaUIsRUFBRSxDQUFBO0FBQzVCLEtBQUE7QUFDSixHQUFBO0VBRUEsSUFBSStCLGdCQUFnQkEsR0FBRztJQUNuQixPQUFPLElBQUksQ0FBQ2xELGlCQUFpQixDQUFBO0FBQ2pDLEdBQUE7RUFFQSxJQUFJc0QsV0FBV0EsQ0FBQzNCLEtBQUssRUFBRTtBQUNuQixJQUFBLElBQUksSUFBSSxDQUFDcEUsWUFBWSxLQUFLb0UsS0FBSyxFQUMzQixPQUFBO0lBRUosSUFBSUEsS0FBSyxHQUFHLENBQUMsS0FBSyxDQUFDLEVBQUVBLEtBQUssRUFBRSxDQUFDO0lBQzdCLElBQUksQ0FBQ3BFLFlBQVksR0FBR29FLEtBQUssQ0FBQTtBQUM3QixHQUFBO0VBRUEsSUFBSTJCLFdBQVdBLEdBQUc7SUFDZCxPQUFPLElBQUksQ0FBQy9GLFlBQVksQ0FBQTtBQUM1QixHQUFBO0VBRUEsSUFBSWdHLGdCQUFnQkEsQ0FBQzVCLEtBQUssRUFBRTtBQUN4QixJQUFBLElBQUksSUFBSSxDQUFDeEIsaUJBQWlCLEtBQUt3QixLQUFLLEVBQ2hDLE9BQUE7QUFFSixJQUFBLElBQUssQ0FBQyxJQUFJLENBQUN4QixpQkFBaUIsSUFBSXdCLEtBQUssSUFBTSxJQUFJLENBQUN4QixpQkFBaUIsSUFBSSxDQUFDd0IsS0FBTSxFQUFFO01BQzFFLElBQUksQ0FBQ0MsU0FBUyxFQUFFLENBQUE7QUFDcEIsS0FBQTtJQUNBLElBQUksQ0FBQ3pCLGlCQUFpQixHQUFHd0IsS0FBSyxDQUFBO0FBQ2xDLEdBQUE7RUFFQSxJQUFJNEIsZ0JBQWdCQSxHQUFHO0lBQ25CLE9BQU8sSUFBSSxDQUFDcEQsaUJBQWlCLENBQUE7QUFDakMsR0FBQTtFQUVBLElBQUlxRCxXQUFXQSxDQUFDN0IsS0FBSyxFQUFFO0FBQ25CLElBQUEsSUFBSSxJQUFJLENBQUN2RSxZQUFZLEtBQUt1RSxLQUFLLEVBQzNCLE9BQUE7SUFFSixJQUFJLENBQUN2RSxZQUFZLEdBQUd1RSxLQUFLLENBQUE7SUFDekIsSUFBSSxDQUFDQyxTQUFTLEVBQUUsQ0FBQTtBQUNwQixHQUFBO0VBRUEsSUFBSTRCLFdBQVdBLEdBQUc7SUFDZCxPQUFPLElBQUksQ0FBQ3BHLFlBQVksQ0FBQTtBQUM1QixHQUFBO0VBRUEsSUFBSXFHLGNBQWNBLENBQUM5QixLQUFLLEVBQUU7QUFDdEIsSUFBQSxJQUFJLElBQUksQ0FBQ3JELGVBQWUsS0FBS3FELEtBQUssRUFDOUIsT0FBQTtJQUVKLElBQUksQ0FBQ3JELGVBQWUsR0FBR3FELEtBQUssQ0FBQTtBQUM1QixJQUFBLElBQUksQ0FBQ3JDLGtCQUFrQixHQUFHTCxJQUFJLENBQUNNLEdBQUcsQ0FBQ29DLEtBQUssR0FBRzFDLElBQUksQ0FBQ08sRUFBRSxHQUFHLEdBQUcsQ0FBQyxDQUFBO0lBQ3pELElBQUksSUFBSSxDQUFDRSxpQkFBaUIsRUFBRTtNQUN4QixJQUFJLENBQUMyQyxpQkFBaUIsRUFBRSxDQUFBO0FBQzVCLEtBQUE7QUFDSixHQUFBO0VBRUEsSUFBSW9CLGNBQWNBLEdBQUc7SUFDakIsT0FBTyxJQUFJLENBQUNuRixlQUFlLENBQUE7QUFDL0IsR0FBQTtFQUVBLElBQUlvRixjQUFjQSxDQUFDL0IsS0FBSyxFQUFFO0FBQ3RCLElBQUEsSUFBSSxJQUFJLENBQUNwRCxlQUFlLEtBQUtvRCxLQUFLLEVBQzlCLE9BQUE7SUFFSixJQUFJLENBQUNwRCxlQUFlLEdBQUdvRCxLQUFLLENBQUE7QUFDNUIsSUFBQSxJQUFJLENBQUNsQyxpQkFBaUIsQ0FBQ2tDLEtBQUssQ0FBQyxDQUFBO0lBRTdCLElBQUksSUFBSSxDQUFDakMsaUJBQWlCLEVBQUU7TUFDeEIsSUFBSSxDQUFDMkMsaUJBQWlCLEVBQUUsQ0FBQTtBQUM1QixLQUFBO0FBQ0osR0FBQTtFQUVBLElBQUlxQixjQUFjQSxHQUFHO0lBQ2pCLE9BQU8sSUFBSSxDQUFDbkYsZUFBZSxDQUFBO0FBQy9CLEdBQUE7RUFFQSxJQUFJb0YsWUFBWUEsQ0FBQ2hDLEtBQUssRUFBRTtJQUNwQixJQUFJLENBQUNwQixhQUFhLEdBQUdvQixLQUFLLENBQUE7QUFDOUIsR0FBQTtFQUVBLElBQUlnQyxZQUFZQSxHQUFHO0lBQ2YsT0FBTyxJQUFJLENBQUNwRCxhQUFhLENBQUE7QUFDN0IsR0FBQTtFQUVBZCxpQkFBaUJBLENBQUNtRSxLQUFLLEVBQUU7SUFDckIsTUFBTUMsUUFBUSxHQUFHRCxLQUFLLEdBQUczRSxJQUFJLENBQUNPLEVBQUUsR0FBRyxHQUFHLENBQUE7SUFDdEMsSUFBSSxDQUFDc0Usa0JBQWtCLEdBQUc3RSxJQUFJLENBQUNNLEdBQUcsQ0FBQ3NFLFFBQVEsQ0FBQyxDQUFBO0lBQzVDLElBQUksQ0FBQ0Usa0JBQWtCLEdBQUc5RSxJQUFJLENBQUMrRSxHQUFHLENBQUNILFFBQVEsQ0FBQyxDQUFBO0FBQ2hELEdBQUE7RUFFQSxJQUFJSSxTQUFTQSxDQUFDdEMsS0FBSyxFQUFFO0FBQ2pCLElBQUEsSUFBSSxJQUFJLENBQUNyRixVQUFVLEtBQUtxRixLQUFLLEVBQUU7TUFDM0IsSUFBSSxDQUFDckYsVUFBVSxHQUFHcUYsS0FBSyxDQUFBO01BQ3ZCLElBQUksQ0FBQ1UsaUJBQWlCLEVBQUUsQ0FBQTtBQUM1QixLQUFBO0FBQ0osR0FBQTtFQUVBLElBQUk0QixTQUFTQSxHQUFHO0lBQ1osT0FBTyxJQUFJLENBQUMzSCxVQUFVLENBQUE7QUFDMUIsR0FBQTtFQUVBLElBQUk0SCxpQkFBaUJBLENBQUN2QyxLQUFLLEVBQUU7QUFDekIsSUFBQSxJQUFJLElBQUksQ0FBQ2hILEtBQUssS0FBS2hCLHFCQUFxQixFQUFFO01BQ3RDLElBQUksQ0FBQzRDLGtCQUFrQixHQUFHb0YsS0FBSyxDQUFBO01BQy9CLElBQUksQ0FBQ0MsU0FBUyxFQUFFLENBQUE7QUFDcEIsS0FBQTtBQUNKLEdBQUE7RUFFQSxJQUFJc0MsaUJBQWlCQSxHQUFHO0lBQ3BCLE9BQU8sSUFBSSxDQUFDM0gsa0JBQWtCLENBQUE7QUFDbEMsR0FBQTtFQUVBLElBQUk0SCxTQUFTQSxDQUFDeEMsS0FBSyxFQUFFO0FBQ2pCLElBQUEsSUFBSSxJQUFJLENBQUNuRixVQUFVLEtBQUttRixLQUFLLEVBQUU7TUFDM0IsSUFBSSxDQUFDbkYsVUFBVSxHQUFHbUYsS0FBSyxDQUFBO01BQ3ZCLElBQUksQ0FBQ1UsaUJBQWlCLEVBQUUsQ0FBQTtBQUM1QixLQUFBO0FBQ0osR0FBQTtFQUVBLElBQUk4QixTQUFTQSxHQUFHO0lBQ1osT0FBTyxJQUFJLENBQUMzSCxVQUFVLENBQUE7QUFDMUIsR0FBQTtFQUVBLElBQUk0SCxZQUFZQSxHQUFHO0FBQ2YsSUFBQSxJQUFJLENBQUMsSUFBSSxDQUFDM0QsYUFBYSxFQUFFO0FBQ3JCLE1BQUEsSUFBSSxDQUFDQSxhQUFhLEdBQUcsSUFBSTVGLElBQUksRUFBRSxDQUFBO0FBQ25DLEtBQUE7SUFDQSxPQUFPLElBQUksQ0FBQzRGLGFBQWEsQ0FBQTtBQUM3QixHQUFBO0VBRUEsSUFBSTRELGFBQWFBLEdBQUc7QUFDaEIsSUFBQSxJQUFJLENBQUMsSUFBSSxDQUFDM0QsY0FBYyxFQUFFO0FBQ3RCLE1BQUEsSUFBSSxDQUFDQSxjQUFjLEdBQUcsSUFBSTNHLElBQUksQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQTtBQUM5QyxLQUFBO0lBQ0EsT0FBTyxJQUFJLENBQUMyRyxjQUFjLENBQUE7QUFDOUIsR0FBQTtFQUVBLElBQUk0RCxNQUFNQSxDQUFDM0MsS0FBSyxFQUFFO0FBQ2QsSUFBQSxJQUFJLElBQUksQ0FBQ2hFLE9BQU8sS0FBS2dFLEtBQUssRUFDdEIsT0FBQTtJQUVKLElBQUksQ0FBQ2hFLE9BQU8sR0FBR2dFLEtBQUssQ0FBQTtJQUNwQixJQUFJLENBQUNDLFNBQVMsRUFBRSxDQUFBO0FBQ3BCLEdBQUE7RUFFQSxJQUFJMEMsTUFBTUEsR0FBRztJQUNULE9BQU8sSUFBSSxDQUFDM0csT0FBTyxDQUFBO0FBQ3ZCLEdBQUE7RUFFQSxJQUFJNEcsYUFBYUEsQ0FBQzVDLEtBQUssRUFBRTtBQUNyQixJQUFBLElBQUksSUFBSSxDQUFDOUQsY0FBYyxLQUFLOEQsS0FBSyxFQUM3QixPQUFBO0lBRUosSUFBSSxDQUFDOUQsY0FBYyxHQUFHOEQsS0FBSyxDQUFBO0lBQzNCLElBQUksQ0FBQ0MsU0FBUyxFQUFFLENBQUE7QUFDcEIsR0FBQTtFQUVBLElBQUkyQyxhQUFhQSxHQUFHO0lBQ2hCLE9BQU8sSUFBSSxDQUFDMUcsY0FBYyxDQUFBO0FBQzlCLEdBQUE7RUFFQSxJQUFJMkcsYUFBYUEsQ0FBQzdDLEtBQUssRUFBRTtBQUNyQixJQUFBLElBQUksSUFBSSxDQUFDN0QsY0FBYyxLQUFLNkQsS0FBSyxFQUM3QixPQUFBO0FBRUosSUFBQSxJQUFJQSxLQUFLLENBQUNuRyxNQUFNLEdBQUcsQ0FBQyxFQUFFO01BQ2xCLE1BQU1pSixHQUFHLEdBQUc5QyxLQUFLLENBQUMrQyxNQUFNLENBQUMvQyxLQUFLLENBQUNuRyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUE7QUFDMUMsTUFBQSxNQUFNbUosTUFBTSxHQUFHLENBQUMsR0FBR2hELEtBQUssQ0FBQ25HLE1BQU0sQ0FBQTtBQUMvQixNQUFBLEtBQUssSUFBSTZGLENBQUMsR0FBRyxDQUFDLEVBQUVBLENBQUMsR0FBR3NELE1BQU0sRUFBRXRELENBQUMsRUFBRSxFQUMzQk0sS0FBSyxJQUFJOEMsR0FBRyxDQUFBO0FBQ3BCLEtBQUE7SUFDQSxJQUFJLENBQUMzRyxjQUFjLEdBQUc2RCxLQUFLLENBQUE7SUFDM0IsSUFBSSxDQUFDQyxTQUFTLEVBQUUsQ0FBQTtBQUNwQixHQUFBO0VBRUEsSUFBSTRDLGFBQWFBLEdBQUc7SUFDaEIsT0FBTyxJQUFJLENBQUMxRyxjQUFjLENBQUE7QUFDOUIsR0FBQTtFQUVBLElBQUk4RyxlQUFlQSxDQUFDakQsS0FBSyxFQUFFO0FBQ3ZCLElBQUEsSUFBSSxJQUFJLENBQUM1RCxnQkFBZ0IsS0FBSzRELEtBQUssRUFDL0IsT0FBQTtJQUVKLElBQUksQ0FBQzVELGdCQUFnQixHQUFHNEQsS0FBSyxDQUFBO0FBQzdCLElBQUEsSUFBSSxDQUFDdkQsbUJBQW1CLEdBQUcsQ0FBQyxDQUFDdUQsS0FBSyxDQUFBO0FBQ2xDLElBQUEsSUFBSUEsS0FBSyxJQUFJLENBQUMsSUFBSSxDQUFDekQsYUFBYSxFQUFFO01BQzlCLElBQUksQ0FBQzJHLFlBQVksR0FBRyxJQUFJQyxJQUFJLEVBQUUsQ0FBQztNQUMvQixJQUFJLENBQUN6RyxnQkFBZ0IsR0FBRyxLQUFLLENBQUE7QUFDakMsS0FBQTtJQUNBLElBQUksQ0FBQ3VELFNBQVMsRUFBRSxDQUFBO0FBQ3BCLEdBQUE7RUFFQSxJQUFJZ0QsZUFBZUEsR0FBRztJQUNsQixPQUFPLElBQUksQ0FBQzdHLGdCQUFnQixDQUFBO0FBQ2hDLEdBQUE7RUFFQSxJQUFJOEcsWUFBWUEsQ0FBQ2xELEtBQUssRUFBRTtBQUNwQixJQUFBLElBQUksSUFBSSxDQUFDekQsYUFBYSxLQUFLeUQsS0FBSyxFQUM1QixPQUFBO0lBRUosTUFBTW9ELFFBQVEsR0FBRyxDQUFDLEVBQUUsSUFBSSxDQUFDM0csbUJBQW1CLElBQUl1RCxLQUFLLENBQUMsQ0FBQTtJQUN0RCxJQUFJb0QsUUFBUSxJQUFJLENBQUNwRCxLQUFLLElBQUksSUFBSSxDQUFDekQsYUFBYSxFQUFFO01BQzFDLElBQUksQ0FBQ0EsYUFBYSxDQUFDOEcsR0FBRyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQTtBQUNoQyxLQUFDLE1BQU07TUFDSCxJQUFJLENBQUM5RyxhQUFhLEdBQUd5RCxLQUFLLENBQUE7QUFDOUIsS0FBQTtBQUNBLElBQUEsSUFBSSxDQUFDdEQsZ0JBQWdCLEdBQUcsQ0FBQyxDQUFDc0QsS0FBSyxDQUFBO0FBQy9CLElBQUEsSUFBSUEsS0FBSyxJQUFJLENBQUMsSUFBSSxDQUFDNUQsZ0JBQWdCLEVBQUU7QUFDakMsTUFBQSxJQUFJLENBQUM2RyxlQUFlLEdBQUcsSUFBSTdLLElBQUksQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztNQUM1QyxJQUFJLENBQUNxRSxtQkFBbUIsR0FBRyxLQUFLLENBQUE7QUFDcEMsS0FBQTtJQUNBLElBQUksQ0FBQ3dELFNBQVMsRUFBRSxDQUFBO0FBQ3BCLEdBQUE7RUFFQSxJQUFJaUQsWUFBWUEsR0FBRztJQUNmLE9BQU8sSUFBSSxDQUFDM0csYUFBYSxDQUFBO0FBQzdCLEdBQUE7O0FBRUE7QUFDQStHLEVBQUFBLFVBQVVBLEdBQUc7SUFDVCxJQUFJLENBQUNoRSxnQkFBZ0IsR0FBRyxJQUFJLENBQUN0RyxLQUFLLEtBQUtoQixxQkFBcUIsSUFBSSxJQUFJLENBQUMrQyxRQUFRLENBQUE7SUFDN0UsSUFBSSxDQUFDd0UsYUFBYSxHQUFHLENBQUMsQ0FBQTtJQUN0QixJQUFJLENBQUNQLHNCQUFzQixHQUFHLEtBQUssQ0FBQTtJQUNuQyxJQUFJLENBQUNHLGdCQUFnQixHQUFHLEtBQUssQ0FBQTtBQUNqQyxHQUFBOztBQUVBO0FBQ0E7QUFDQUssRUFBQUEsaUJBQWlCQSxHQUFHO0lBRWhCLElBQUksQ0FBQ0MsaUJBQWlCLEVBQUUsQ0FBQTtJQUV4QixJQUFJLElBQUksQ0FBQ3hCLFVBQVUsRUFBRTtBQUNqQixNQUFBLElBQUksQ0FBQyxJQUFJLENBQUNBLFVBQVUsQ0FBQ3NGLE1BQU0sRUFBRTtBQUN6QixRQUFBLElBQUksQ0FBQ3RGLFVBQVUsQ0FBQ3hFLE9BQU8sRUFBRSxDQUFBO0FBQzdCLE9BQUE7TUFDQSxJQUFJLENBQUN3RSxVQUFVLEdBQUcsSUFBSSxDQUFBO0FBQzFCLEtBQUE7QUFFQSxJQUFBLElBQUksSUFBSSxDQUFDUSxnQkFBZ0IsS0FBSytFLGlCQUFpQixFQUFFO01BQzdDLElBQUksQ0FBQy9FLGdCQUFnQixHQUFHZ0Ysc0JBQXNCLENBQUE7QUFDbEQsS0FBQTtJQUVBLElBQUksSUFBSSxDQUFDOUUscUJBQXFCLEVBQUU7QUFDNUIsTUFBQSxLQUFLLElBQUllLENBQUMsR0FBRyxDQUFDLEVBQUVBLENBQUMsR0FBRyxJQUFJLENBQUNmLHFCQUFxQixDQUFDOUUsTUFBTSxFQUFFNkYsQ0FBQyxFQUFFLEVBQUU7UUFDeEQsSUFBSSxJQUFJLENBQUNmLHFCQUFxQixDQUFDZSxDQUFDLENBQUMsS0FBSzhELGlCQUFpQixFQUFFO0FBQ3JELFVBQUEsSUFBSSxDQUFDN0UscUJBQXFCLENBQUNlLENBQUMsQ0FBQyxHQUFHK0Qsc0JBQXNCLENBQUE7QUFDMUQsU0FBQTtBQUNKLE9BQUE7QUFDSixLQUFBO0FBQ0osR0FBQTs7QUFFQTtBQUNBQyxFQUFBQSxhQUFhQSxDQUFDakwsTUFBTSxFQUFFQyxJQUFJLEVBQUU7QUFFeEI7QUFDQSxJQUFBLEtBQUssSUFBSWdILENBQUMsR0FBRyxDQUFDLEVBQUVBLENBQUMsR0FBRyxJQUFJLENBQUNMLFdBQVcsQ0FBQ3hGLE1BQU0sRUFBRTZGLENBQUMsRUFBRSxFQUFFO0FBQzlDLE1BQUEsTUFBTWlFLE9BQU8sR0FBRyxJQUFJLENBQUN0RSxXQUFXLENBQUNLLENBQUMsQ0FBQyxDQUFBO01BQ25DLElBQUlpRSxPQUFPLENBQUNsTCxNQUFNLEtBQUtBLE1BQU0sSUFBSWtMLE9BQU8sQ0FBQ2pMLElBQUksS0FBS0EsSUFBSSxFQUFFO0FBQ3BELFFBQUEsT0FBT2lMLE9BQU8sQ0FBQTtBQUNsQixPQUFBO0FBQ0osS0FBQTs7QUFFQTtBQUNBLElBQUEsTUFBTUMsRUFBRSxHQUFHLElBQUl0TCxlQUFlLENBQUMsSUFBSSxDQUFDRSxNQUFNLEVBQUVDLE1BQU0sRUFBRUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFBO0FBQy9ELElBQUEsSUFBSSxDQUFDMkcsV0FBVyxDQUFDd0UsSUFBSSxDQUFDRCxFQUFFLENBQUMsQ0FBQTtBQUN6QixJQUFBLE9BQU9BLEVBQUUsQ0FBQTtBQUNiLEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNJRSxFQUFBQSxLQUFLQSxHQUFHO0lBQ0osTUFBTUEsS0FBSyxHQUFHLElBQUl6SixLQUFLLENBQUMsSUFBSSxDQUFDN0IsTUFBTSxDQUFDLENBQUE7O0FBRXBDO0FBQ0FzTCxJQUFBQSxLQUFLLENBQUN6RCxJQUFJLEdBQUcsSUFBSSxDQUFDckgsS0FBSyxDQUFBO0FBQ3ZCOEssSUFBQUEsS0FBSyxDQUFDQyxRQUFRLENBQUMsSUFBSSxDQUFDdEosTUFBTSxDQUFDLENBQUE7QUFDM0JxSixJQUFBQSxLQUFLLENBQUN4QixTQUFTLEdBQUcsSUFBSSxDQUFDM0gsVUFBVSxDQUFBO0FBQ2pDbUosSUFBQUEsS0FBSyxDQUFDdkIsaUJBQWlCLEdBQUcsSUFBSSxDQUFDM0gsa0JBQWtCLENBQUE7QUFDakRrSixJQUFBQSxLQUFLLENBQUN0QixTQUFTLEdBQUcsSUFBSSxDQUFDM0gsVUFBVSxDQUFBO0FBQ2pDaUosSUFBQUEsS0FBSyxDQUFDekMsV0FBVyxHQUFHLElBQUksQ0FBQ0EsV0FBVyxDQUFBO0FBQ3BDeUMsSUFBQUEsS0FBSyxDQUFDL0ksUUFBUSxHQUFHLElBQUksQ0FBQ0EsUUFBUSxDQUFBOztBQUU5QjtBQUNBK0ksSUFBQUEsS0FBSyxDQUFDdkksZ0JBQWdCLEdBQUcsSUFBSSxDQUFDQSxnQkFBZ0IsQ0FBQTtBQUM5Q3VJLElBQUFBLEtBQUssQ0FBQ3RJLGNBQWMsR0FBRyxJQUFJLENBQUNBLGNBQWMsQ0FBQTtBQUMxQ3NJLElBQUFBLEtBQUssQ0FBQ2pDLFdBQVcsR0FBRyxJQUFJLENBQUNwRyxZQUFZLENBQUE7QUFDckNxSSxJQUFBQSxLQUFLLENBQUN2RCxVQUFVLEdBQUcsSUFBSSxDQUFDeEgsV0FBVyxDQUFBO0FBQ25DK0ssSUFBQUEsS0FBSyxDQUFDbkMsV0FBVyxHQUFHLElBQUksQ0FBQy9GLFlBQVksQ0FBQTtBQUNyQ2tJLElBQUFBLEtBQUssQ0FBQ2pJLFdBQVcsR0FBRyxJQUFJLENBQUNBLFdBQVcsQ0FBQTtBQUNwQ2lJLElBQUFBLEtBQUssQ0FBQy9ILE9BQU8sR0FBRyxJQUFJLENBQUNBLE9BQU8sQ0FBQTtBQUM1QitILElBQUFBLEtBQUssQ0FBQzlCLFlBQVksR0FBRyxJQUFJLENBQUNBLFlBQVksQ0FBQTtBQUN0QzhCLElBQUFBLEtBQUssQ0FBQ3JGLGdCQUFnQixHQUFHLElBQUksQ0FBQ0EsZ0JBQWdCLENBQUE7QUFDOUNxRixJQUFBQSxLQUFLLENBQUMzRCxJQUFJLEdBQUcsSUFBSSxDQUFDQSxJQUFJLENBQUE7SUFFdEIsSUFBSSxJQUFJLENBQUN4QixxQkFBcUIsRUFBRTtNQUM1Qm1GLEtBQUssQ0FBQ25GLHFCQUFxQixHQUFHLElBQUksQ0FBQ0EscUJBQXFCLENBQUNxRixLQUFLLEVBQUUsQ0FBQTtBQUNwRSxLQUFBOztBQUVBO0FBQ0FGLElBQUFBLEtBQUssQ0FBQ2hDLGNBQWMsR0FBRyxJQUFJLENBQUNuRixlQUFlLENBQUE7QUFDM0NtSCxJQUFBQSxLQUFLLENBQUMvQixjQUFjLEdBQUcsSUFBSSxDQUFDbkYsZUFBZSxDQUFBOztBQUUzQztBQUNBa0gsSUFBQUEsS0FBSyxDQUFDOUcsV0FBVyxHQUFHLElBQUksQ0FBQ0EsV0FBVyxDQUFBO0FBQ3BDOEcsSUFBQUEsS0FBSyxDQUFDN0csbUJBQW1CLEdBQUcsSUFBSSxDQUFDQSxtQkFBbUIsQ0FBQTs7QUFFcEQ7QUFDQTZHLElBQUFBLEtBQUssQ0FBQ3RELEtBQUssR0FBRyxJQUFJLENBQUN0RCxNQUFNLENBQUE7O0FBRXpCO0FBQ0E0RyxJQUFBQSxLQUFLLENBQUN4RixVQUFVLEdBQUcsSUFBSSxDQUFDQSxVQUFVLENBQUE7QUFDbEN3RixJQUFBQSxLQUFLLENBQUNsQyxnQkFBZ0IsR0FBRyxJQUFJLENBQUNwRCxpQkFBaUIsQ0FBQTtBQUMvQ3NGLElBQUFBLEtBQUssQ0FBQ3ZDLGdCQUFnQixHQUFHLElBQUksQ0FBQ2xELGlCQUFpQixDQUFBO0FBQy9DeUYsSUFBQUEsS0FBSyxDQUFDMUYsY0FBYyxHQUFHLElBQUksQ0FBQ0EsY0FBYyxDQUFBO0FBQzFDMEYsSUFBQUEsS0FBSyxDQUFDdkYsZUFBZSxHQUFHLElBQUksQ0FBQ0EsZUFBZSxDQUFBOztBQUU1QztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQSxJQUFBLE9BQU91RixLQUFLLENBQUE7QUFDaEIsR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0ksRUFBQSxPQUFPRyxzQkFBc0JBLENBQUM1RCxJQUFJLEVBQUU2RCxVQUFVLEdBQUc1RyxJQUFJLENBQUNPLEVBQUUsR0FBRyxDQUFDLEVBQUVzRyxVQUFVLEdBQUcsQ0FBQyxFQUFFO0FBQzFFLElBQUEsUUFBUTlELElBQUk7QUFDUixNQUFBLEtBQUtuSSxjQUFjO0FBQUUsUUFBQTtBQUNqQixVQUFBLE1BQU1rTSxVQUFVLEdBQUc5RyxJQUFJLENBQUNNLEdBQUcsQ0FBQ3NHLFVBQVUsQ0FBQyxDQUFBO0FBQ3ZDLFVBQUEsTUFBTUcsWUFBWSxHQUFHL0csSUFBSSxDQUFDTSxHQUFHLENBQUN1RyxVQUFVLENBQUMsQ0FBQTs7QUFFekM7QUFDQSxVQUFBLE9BQVEsQ0FBQyxHQUFHN0csSUFBSSxDQUFDTyxFQUFFLElBQUssQ0FBQyxHQUFHd0csWUFBWSxHQUFJLENBQUNBLFlBQVksR0FBR0QsVUFBVSxJQUFJLEdBQUcsQ0FBQyxDQUFBO0FBQ2xGLFNBQUE7QUFDQSxNQUFBLEtBQUtuTSxjQUFjO0FBQ2Y7QUFDQSxRQUFBLE9BQVEsQ0FBQyxHQUFHcUYsSUFBSSxDQUFDTyxFQUFFLENBQUE7QUFDdkIsTUFBQSxLQUFLN0YscUJBQXFCO0FBQ3RCO0FBQ0EsUUFBQSxPQUFPLENBQUMsQ0FBQTtBQUNoQixLQUFBO0FBQ0osR0FBQTs7QUFFQTtBQUNBO0FBQ0E7RUFDQXNNLHFCQUFxQkEsQ0FBQ0MsZUFBZSxFQUFFO0FBRW5DLElBQUEsTUFBTUMsT0FBTyxHQUFHRCxlQUFlLENBQUMzTCxZQUFZLENBQUM2TCxRQUFRLENBQUE7SUFFckQsUUFBUSxJQUFJLENBQUN6TCxLQUFLO0FBQ2QsTUFBQSxLQUFLZixjQUFjO0FBQ2ZWLFFBQUFBLFNBQVMsQ0FBQ0MsSUFBSSxHQUFHLElBQUksQ0FBQzhHLFVBQVUsQ0FBQTtBQUNoQy9HLFFBQUFBLFNBQVMsQ0FBQ0UsVUFBVSxHQUFHLElBQUksQ0FBQytHLGlCQUFpQixDQUFBO0FBQzdDLFFBQUEsTUFBQTtBQUNKLE1BQUEsS0FBS3RHLGNBQWM7UUFDZixJQUFJLElBQUksQ0FBQzJHLE1BQU0sRUFBRTtBQUNidEgsVUFBQUEsU0FBUyxDQUFDQyxJQUFJLEdBQUcsQ0FBQyxPQUFPLEdBQUcsRUFBRSxDQUFBO0FBQ2xDLFNBQUMsTUFBTTtVQUNIRCxTQUFTLENBQUNDLElBQUksR0FBRyxJQUFJLENBQUM4RyxVQUFVLEdBQUcsRUFBRSxDQUFDO0FBQ3RDLFVBQUEsSUFBSSxDQUFDLElBQUksQ0FBQzlGLE1BQU0sQ0FBQ2tNLE1BQU0sSUFBSSxJQUFJLENBQUNsTSxNQUFNLENBQUNtTSxzQkFBc0IsRUFBRXBOLFNBQVMsQ0FBQ0MsSUFBSSxJQUFJLENBQUMsR0FBRyxDQUFBO0FBQ3pGLFNBQUE7UUFDQUQsU0FBUyxDQUFDRSxVQUFVLEdBQUcsSUFBSSxDQUFDb0gsTUFBTSxHQUFHLElBQUksQ0FBQzlDLE9BQU8sSUFBSSxJQUFJLENBQUNQLGNBQWMsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLENBQUNnRCxpQkFBaUIsQ0FBQTtBQUN4RyxRQUFBLE1BQUE7QUFDSixNQUFBLEtBQUt4RyxxQkFBcUI7QUFDdEI7QUFDQTtRQUNBLElBQUksSUFBSSxDQUFDNkcsTUFBTSxFQUFFO0FBQ2J0SCxVQUFBQSxTQUFTLENBQUNDLElBQUksR0FBRyxDQUFDLE9BQU8sR0FBRyxFQUFFLENBQUE7QUFDbEMsU0FBQyxNQUFNO1VBQ0hELFNBQVMsQ0FBQ0MsSUFBSSxHQUFJLElBQUksQ0FBQzhHLFVBQVUsR0FBR2tHLE9BQU8sR0FBSSxHQUFHLENBQUE7QUFDbEQsVUFBQSxJQUFJLENBQUMsSUFBSSxDQUFDaE0sTUFBTSxDQUFDa00sTUFBTSxJQUFJLElBQUksQ0FBQ2xNLE1BQU0sQ0FBQ21NLHNCQUFzQixFQUFFcE4sU0FBUyxDQUFDQyxJQUFJLElBQUksQ0FBQyxHQUFHLENBQUE7QUFDekYsU0FBQTtBQUNBRCxRQUFBQSxTQUFTLENBQUNFLFVBQVUsR0FBRyxJQUFJLENBQUNvSCxNQUFNLEdBQUcsSUFBSSxDQUFDOUMsT0FBTyxJQUFJeUksT0FBTyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksQ0FBQ2hHLGlCQUFpQixDQUFBO0FBQzVGLFFBQUEsTUFBQTtBQUNSLEtBQUE7QUFFQSxJQUFBLE9BQU9qSCxTQUFTLENBQUE7QUFDcEIsR0FBQTtBQUVBcU4sRUFBQUEsUUFBUUEsR0FBRztJQUNQLE9BQU8sSUFBSSxDQUFDbkssTUFBTSxDQUFBO0FBQ3RCLEdBQUE7RUFFQW9LLGlCQUFpQkEsQ0FBQ0MsTUFBTSxFQUFFO0FBQ3RCLElBQUEsSUFBSSxJQUFJLENBQUM5TCxLQUFLLEtBQUtkLGNBQWMsRUFBRTtBQUUvQjtBQUNBLE1BQUEsTUFBTTZNLElBQUksR0FBRyxJQUFJLENBQUN2SixjQUFjLENBQUE7QUFDaEMsTUFBQSxNQUFNeUcsS0FBSyxHQUFHLElBQUksQ0FBQ3JGLGVBQWUsQ0FBQTtBQUNsQyxNQUFBLE1BQU1vSSxRQUFRLEdBQUcsSUFBSSxDQUFDN0Msa0JBQWtCLENBQUE7QUFDeEMsTUFBQSxNQUFNOEMsSUFBSSxHQUFHLElBQUksQ0FBQzdGLEtBQUssQ0FBQTtBQUN2Qi9ILE1BQUFBLE1BQU0sQ0FBQzZOLElBQUksQ0FBQ0QsSUFBSSxDQUFDRSxFQUFFLENBQUMsQ0FBQTtNQUVwQixJQUFJbEQsS0FBSyxHQUFHLEVBQUUsRUFBRTtBQUNaNkMsUUFBQUEsTUFBTSxDQUFDTSxNQUFNLEdBQUdMLElBQUksR0FBRyxJQUFJLENBQUMzQyxrQkFBa0IsQ0FBQTtBQUM5Qy9LLFFBQUFBLE1BQU0sQ0FBQ2dPLFNBQVMsQ0FBQyxDQUFDTixJQUFJLEdBQUdDLFFBQVEsQ0FBQyxDQUFBO0FBQ3RDLE9BQUMsTUFBTTtRQUNIRixNQUFNLENBQUNNLE1BQU0sR0FBR0wsSUFBSSxJQUFJLENBQUMsR0FBR0MsUUFBUSxDQUFDLENBQUE7QUFDckMzTixRQUFBQSxNQUFNLENBQUNnTyxTQUFTLENBQUMsQ0FBQ1AsTUFBTSxDQUFDTSxNQUFNLENBQUMsQ0FBQTtBQUNwQyxPQUFBO0FBRUFOLE1BQUFBLE1BQU0sQ0FBQ1EsTUFBTSxDQUFDQyxJQUFJLENBQUNOLElBQUksQ0FBQ08sV0FBVyxFQUFFLEVBQUVuTyxNQUFNLENBQUMsQ0FBQTtBQUVsRCxLQUFDLE1BQU0sSUFBSSxJQUFJLENBQUMyQixLQUFLLEtBQUtmLGNBQWMsRUFBRTtNQUN0QzZNLE1BQU0sQ0FBQ1EsTUFBTSxHQUFHLElBQUksQ0FBQ2xHLEtBQUssQ0FBQ29HLFdBQVcsRUFBRSxDQUFBO0FBQ3hDVixNQUFBQSxNQUFNLENBQUNNLE1BQU0sR0FBRyxJQUFJLENBQUM1SixjQUFjLENBQUE7QUFDdkMsS0FBQTtBQUNKLEdBQUE7RUFFQWlLLGNBQWNBLENBQUNDLEdBQUcsRUFBRTtBQUNoQixJQUFBLElBQUksSUFBSSxDQUFDMU0sS0FBSyxLQUFLZCxjQUFjLEVBQUU7QUFDL0IsTUFBQSxNQUFNeU4sS0FBSyxHQUFHLElBQUksQ0FBQ25LLGNBQWMsQ0FBQTtBQUNqQyxNQUFBLE1BQU15RyxLQUFLLEdBQUcsSUFBSSxDQUFDckYsZUFBZSxDQUFBO0FBQ2xDLE1BQUEsTUFBTXFJLElBQUksR0FBRyxJQUFJLENBQUM3RixLQUFLLENBQUE7QUFFdkIsTUFBQSxNQUFNd0csR0FBRyxHQUFHdEksSUFBSSxDQUFDdUksR0FBRyxDQUFDdkksSUFBSSxDQUFDK0UsR0FBRyxDQUFDSixLQUFLLEdBQUc2RCxJQUFJLENBQUNDLFVBQVUsQ0FBQyxHQUFHSixLQUFLLENBQUMsQ0FBQTtBQUUvREQsTUFBQUEsR0FBRyxDQUFDSixNQUFNLENBQUNqQyxHQUFHLENBQUMsQ0FBQyxFQUFFLENBQUNzQyxLQUFLLEdBQUcsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFBO0FBQ2xDRCxNQUFBQSxHQUFHLENBQUNNLFdBQVcsQ0FBQzNDLEdBQUcsQ0FBQ3VDLEdBQUcsRUFBRUQsS0FBSyxHQUFHLEdBQUcsRUFBRUMsR0FBRyxDQUFDLENBQUE7QUFFMUNGLE1BQUFBLEdBQUcsQ0FBQ08sc0JBQXNCLENBQUNQLEdBQUcsRUFBRVQsSUFBSSxDQUFDaUIsaUJBQWlCLEVBQUUsRUFBRSxJQUFJLENBQUMsQ0FBQTtBQUVuRSxLQUFDLE1BQU0sSUFBSSxJQUFJLENBQUNsTixLQUFLLEtBQUtmLGNBQWMsRUFBRTtBQUN0Q3lOLE1BQUFBLEdBQUcsQ0FBQ0osTUFBTSxDQUFDSixJQUFJLENBQUMsSUFBSSxDQUFDOUYsS0FBSyxDQUFDb0csV0FBVyxFQUFFLENBQUMsQ0FBQTtBQUN6Q0UsTUFBQUEsR0FBRyxDQUFDTSxXQUFXLENBQUMzQyxHQUFHLENBQUMsSUFBSSxDQUFDN0gsY0FBYyxFQUFFLElBQUksQ0FBQ0EsY0FBYyxFQUFFLElBQUksQ0FBQ0EsY0FBYyxDQUFDLENBQUE7QUFDdEYsS0FBQTtBQUNKLEdBQUE7QUFFQWtGLEVBQUFBLGlCQUFpQkEsR0FBRztBQUNoQixJQUFBLE1BQU15RixLQUFLLEdBQUcsSUFBSSxDQUFDMUwsTUFBTSxDQUFBO0FBQ3pCLElBQUEsTUFBTTlDLENBQUMsR0FBR3dPLEtBQUssQ0FBQ3hPLENBQUMsQ0FBQTtBQUNqQixJQUFBLE1BQU1DLENBQUMsR0FBR3VPLEtBQUssQ0FBQ3ZPLENBQUMsQ0FBQTtBQUNqQixJQUFBLE1BQU1DLENBQUMsR0FBR3NPLEtBQUssQ0FBQ3RPLENBQUMsQ0FBQTtBQUVqQixJQUFBLElBQUk2SCxDQUFDLEdBQUcsSUFBSSxDQUFDL0UsVUFBVSxDQUFBOztBQUV2QjtJQUNBLElBQUksSUFBSSxDQUFDb0QsaUJBQWlCLEVBQUU7QUFDeEIyQixNQUFBQSxDQUFDLEdBQUcsSUFBSSxDQUFDN0UsVUFBVSxHQUFHUixLQUFLLENBQUM0SixzQkFBc0IsQ0FBQyxJQUFJLENBQUNqTCxLQUFLLEVBQUUsSUFBSSxDQUFDNEQsZUFBZSxHQUFHa0osSUFBSSxDQUFDQyxVQUFVLEVBQUUsSUFBSSxDQUFDcEosZUFBZSxHQUFHbUosSUFBSSxDQUFDQyxVQUFVLENBQUMsQ0FBQTtBQUNsSixLQUFBO0FBRUEsSUFBQSxNQUFNSyxVQUFVLEdBQUcsSUFBSSxDQUFDaEosV0FBVyxDQUFBO0FBQ25DLElBQUEsTUFBTWlKLGdCQUFnQixHQUFHLElBQUksQ0FBQzdJLGlCQUFpQixDQUFBO0FBRS9DNEksSUFBQUEsVUFBVSxDQUFDLENBQUMsQ0FBQyxHQUFHek8sQ0FBQyxHQUFHK0gsQ0FBQyxDQUFBO0FBQ3JCMEcsSUFBQUEsVUFBVSxDQUFDLENBQUMsQ0FBQyxHQUFHeE8sQ0FBQyxHQUFHOEgsQ0FBQyxDQUFBO0FBQ3JCMEcsSUFBQUEsVUFBVSxDQUFDLENBQUMsQ0FBQyxHQUFHdk8sQ0FBQyxHQUFHNkgsQ0FBQyxDQUFBO0lBQ3JCLElBQUlBLENBQUMsSUFBSSxDQUFDLEVBQUU7QUFDUjJHLE1BQUFBLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxHQUFHL0ksSUFBSSxDQUFDQyxHQUFHLENBQUM1RixDQUFDLEVBQUUsR0FBRyxDQUFDLEdBQUcrSCxDQUFDLENBQUE7QUFDMUMyRyxNQUFBQSxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsR0FBRy9JLElBQUksQ0FBQ0MsR0FBRyxDQUFDM0YsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxHQUFHOEgsQ0FBQyxDQUFBO0FBQzFDMkcsTUFBQUEsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLEdBQUcvSSxJQUFJLENBQUNDLEdBQUcsQ0FBQzFGLENBQUMsRUFBRSxHQUFHLENBQUMsR0FBRzZILENBQUMsQ0FBQTtBQUM5QyxLQUFDLE1BQU07QUFDSDJHLE1BQUFBLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxHQUFHL0ksSUFBSSxDQUFDQyxHQUFHLENBQUM2SSxVQUFVLENBQUMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUE7QUFDbERDLE1BQUFBLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxHQUFHL0ksSUFBSSxDQUFDQyxHQUFHLENBQUM2SSxVQUFVLENBQUMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUE7QUFDbERDLE1BQUFBLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxHQUFHL0ksSUFBSSxDQUFDQyxHQUFHLENBQUM2SSxVQUFVLENBQUMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUE7QUFDdEQsS0FBQTtBQUNKLEdBQUE7QUFFQXJDLEVBQUFBLFFBQVFBLEdBQUc7QUFDUCxJQUFBLElBQUl1QyxTQUFTLENBQUN6TSxNQUFNLEtBQUssQ0FBQyxFQUFFO01BQ3hCLElBQUksQ0FBQ1ksTUFBTSxDQUFDNEksR0FBRyxDQUFDaUQsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDM08sQ0FBQyxFQUFFMk8sU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDMU8sQ0FBQyxFQUFFME8sU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDek8sQ0FBQyxDQUFDLENBQUE7QUFDbkUsS0FBQyxNQUFNLElBQUl5TyxTQUFTLENBQUN6TSxNQUFNLEtBQUssQ0FBQyxFQUFFO0FBQy9CLE1BQUEsSUFBSSxDQUFDWSxNQUFNLENBQUM0SSxHQUFHLENBQUNpRCxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUVBLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRUEsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUE7QUFDN0QsS0FBQTtJQUVBLElBQUksQ0FBQzVGLGlCQUFpQixFQUFFLENBQUE7QUFDNUIsR0FBQTtBQUVBVSxFQUFBQSxXQUFXQSxHQUFHO0FBQ1YsSUFBQSxJQUFJLENBQUM3RyxNQUFNLENBQUNiLE9BQU8sQ0FBRWtHLEtBQUssSUFBSztNQUMzQkEsS0FBSyxDQUFDMkcsZUFBZSxFQUFFLENBQUE7QUFDM0IsS0FBQyxDQUFDLENBQUE7QUFDTixHQUFBOztBQUVBO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDSXRHLEVBQUFBLFNBQVNBLEdBQUc7QUFDUjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7SUFDQSxJQUFJOUUsR0FBRyxHQUNDLElBQUksQ0FBQ25DLEtBQUssSUFBbUMsRUFBRSxHQUMvQyxDQUFDLElBQUksQ0FBQzhCLFlBQVksR0FBRyxDQUFDLEdBQUcsQ0FBQyxLQUFtQixFQUFHLEdBQ2hELElBQUksQ0FBQy9CLFdBQVcsSUFBNkIsRUFBRyxHQUNoRCxJQUFJLENBQUMwQyxZQUFZLElBQTRCLEVBQUcsR0FDaEQsQ0FBQyxJQUFJLENBQUMrQyxpQkFBaUIsS0FBSyxHQUFHLEdBQUcsQ0FBQyxHQUFHLENBQUMsS0FBTSxFQUFHLEdBQ2hELENBQUMsSUFBSSxDQUFDeEMsT0FBTyxHQUFHLENBQUMsR0FBRyxDQUFDLEtBQXdCLEVBQUcsR0FDaEQsQ0FBQyxJQUFJLENBQUNFLGNBQWMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxLQUFpQixFQUFHLEdBQ2hEeEUsTUFBTSxDQUFDLElBQUksQ0FBQ3lFLGNBQWMsQ0FBQzRHLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFRLEVBQUcsR0FDaEQsQ0FBQyxJQUFJLENBQUMzRyxnQkFBZ0IsR0FBRyxDQUFDLEdBQUcsQ0FBQyxLQUFlLEVBQUcsR0FDL0MsSUFBSSxDQUFDYyxNQUFNLElBQWlDLEVBQUcsR0FDL0MsSUFBSSxDQUFDRixXQUFXLEdBQUcsQ0FBQyxJQUF5QixDQUFFLEdBQ2hELENBQUMsSUFBSSxDQUFDdUYsaUJBQWlCLEdBQUcsQ0FBQyxHQUFHLENBQUMsS0FBZSxDQUFFLEdBQy9DLElBQUksQ0FBQ3BDLElBQUksSUFBb0MsQ0FBRSxDQUFBO0FBRXhELElBQUEsSUFBSSxJQUFJLENBQUNoRSxjQUFjLENBQUN0QyxNQUFNLEtBQUssQ0FBQyxFQUFFO0FBQ2xDc0IsTUFBQUEsR0FBRyxJQUFLekQsTUFBTSxDQUFDLElBQUksQ0FBQ3lFLGNBQWMsQ0FBQzRHLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUcsQ0FBQTtBQUNwRDVILE1BQUFBLEdBQUcsSUFBS3pELE1BQU0sQ0FBQyxJQUFJLENBQUN5RSxjQUFjLENBQUM0RyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFHLENBQUE7QUFDeEQsS0FBQTtBQUVBLElBQUEsSUFBSTVILEdBQUcsS0FBSyxJQUFJLENBQUNBLEdBQUcsRUFBRTtBQUNsQjtNQUNBLElBQUksQ0FBQ2lHLFdBQVcsRUFBRSxDQUFBO0FBQ3RCLEtBQUE7SUFFQSxJQUFJLENBQUNqRyxHQUFHLEdBQUdBLEdBQUcsQ0FBQTtBQUNsQixHQUFBO0FBQ0o7Ozs7In0=
