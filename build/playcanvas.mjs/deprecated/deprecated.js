import { version, revision } from '../core/core.js';
import { string } from '../core/string.js';
import { now } from '../core/time.js';
import { Debug } from '../core/debug.js';
import { math } from '../core/math/math.js';
import { Color } from '../core/math/color.js';
import { Mat4 } from '../core/math/mat4.js';
import { Vec2 } from '../core/math/vec2.js';
import { Vec3 } from '../core/math/vec3.js';
import { Vec4 } from '../core/math/vec4.js';
import { BoundingBox } from '../core/shape/bounding-box.js';
import { BoundingSphere } from '../core/shape/bounding-sphere.js';
import { Frustum } from '../core/shape/frustum.js';
import { Plane } from '../core/shape/plane.js';
import { TYPE_INT8, TYPE_UINT8, TYPE_INT16, TYPE_UINT16, TYPE_INT32, TYPE_UINT32, TYPE_FLOAT32, PIXELFORMAT_LA8, PIXELFORMAT_RGB565, PIXELFORMAT_RGBA5551, PIXELFORMAT_RGBA4, PIXELFORMAT_RGB8, PIXELFORMAT_RGBA8, BLENDMODE_CONSTANT, BLENDMODE_ONE_MINUS_CONSTANT, ADDRESS_CLAMP_TO_EDGE, ADDRESS_MIRRORED_REPEAT, ADDRESS_REPEAT, BLENDMODE_ZERO, BLENDMODE_ONE, BLENDMODE_SRC_COLOR, BLENDMODE_ONE_MINUS_SRC_COLOR, BLENDMODE_DST_COLOR, BLENDMODE_ONE_MINUS_DST_COLOR, BLENDMODE_SRC_ALPHA, BLENDMODE_SRC_ALPHA_SATURATE, BLENDMODE_ONE_MINUS_SRC_ALPHA, BLENDMODE_DST_ALPHA, BLENDMODE_ONE_MINUS_DST_ALPHA, BUFFER_STATIC, BUFFER_DYNAMIC, BUFFER_STREAM, CULLFACE_NONE, CULLFACE_BACK, CULLFACE_FRONT, CULLFACE_FRONTANDBACK, FILTER_NEAREST, FILTER_LINEAR, FILTER_NEAREST_MIPMAP_NEAREST, FILTER_NEAREST_MIPMAP_LINEAR, FILTER_LINEAR_MIPMAP_NEAREST, FILTER_LINEAR_MIPMAP_LINEAR, INDEXFORMAT_UINT8, INDEXFORMAT_UINT16, INDEXFORMAT_UINT32, PRIMITIVE_POINTS, PRIMITIVE_LINES, PRIMITIVE_LINELOOP, PRIMITIVE_LINESTRIP, PRIMITIVE_TRIANGLES, PRIMITIVE_TRISTRIP, PRIMITIVE_TRIFAN, SEMANTIC_POSITION, SEMANTIC_NORMAL, SEMANTIC_COLOR, SEMANTIC_TEXCOORD, SEMANTIC_TEXCOORD0, SEMANTIC_TEXCOORD1, SEMANTIC_ATTR0, SEMANTIC_ATTR1, SEMANTIC_ATTR2, SEMANTIC_ATTR3, TEXTURELOCK_READ, TEXTURELOCK_WRITE, TEXTURETYPE_RGBM, TEXTURETYPE_DEFAULT, TEXTURETYPE_SWIZZLEGGGR } from '../platform/graphics/constants.js';
import { ShaderGenerator } from '../scene/shader-lib/programs/shader-generator.js';
import { drawQuadWithShader } from '../scene/graphics/quad-render-utils.js';
import { shaderChunks } from '../scene/shader-lib/chunks/chunks.js';
import { GraphicsDevice } from '../platform/graphics/graphics-device.js';
import { IndexBuffer } from '../platform/graphics/index-buffer.js';
import { LayerComposition } from '../scene/composition/layer-composition.js';
import { PostEffect } from '../scene/graphics/post-effect.js';
import { PostEffectQueue } from '../framework/components/camera/post-effect-queue.js';
import { ProgramLibrary } from '../scene/shader-lib/program-library.js';
import { getProgramLibrary, setProgramLibrary } from '../scene/shader-lib/get-program-library.js';
import { RenderTarget } from '../platform/graphics/render-target.js';
import { ScopeId } from '../platform/graphics/scope-id.js';
import { Shader } from '../platform/graphics/shader.js';
import { WebglShaderInput } from '../platform/graphics/webgl/webgl-shader-input.js';
import { Texture } from '../platform/graphics/texture.js';
import { VertexBuffer } from '../platform/graphics/vertex-buffer.js';
import { VertexFormat } from '../platform/graphics/vertex-format.js';
import { VertexIterator } from '../platform/graphics/vertex-iterator.js';
import { ShaderUtils } from '../platform/graphics/shader-utils.js';
import { GraphicsDeviceAccess } from '../platform/graphics/graphics-device-access.js';
import { BlendState } from '../platform/graphics/blend-state.js';
import { DepthState } from '../platform/graphics/depth-state.js';
import { LAYERID_WORLD, LAYERID_IMMEDIATE, LINEBATCH_OVERLAY, PROJECTION_ORTHOGRAPHIC, PROJECTION_PERSPECTIVE } from '../scene/constants.js';
import { calculateTangents, createMesh, createTorus, createCylinder, createCapsule, createCone, createSphere, createPlane, createBox } from '../scene/procedural.js';
import { partitionSkin } from '../scene/skin-partition.js';
import { BasicMaterial } from '../scene/materials/basic-material.js';
import { ForwardRenderer } from '../scene/renderer/forward-renderer.js';
import { GraphNode } from '../scene/graph-node.js';
import { Material } from '../scene/materials/material.js';
import { Mesh } from '../scene/mesh.js';
import { Morph } from '../scene/morph.js';
import { MeshInstance } from '../scene/mesh-instance.js';
import { Model } from '../scene/model.js';
import { ParticleEmitter } from '../scene/particle-system/particle-emitter.js';
import { Picker } from '../framework/graphics/picker.js';
import { Scene } from '../scene/scene.js';
import { Skin } from '../scene/skin.js';
import { SkinInstance } from '../scene/skin-instance.js';
import { StandardMaterial } from '../scene/materials/standard-material.js';
import { Batch } from '../scene/batching/batch.js';
import { getDefaultMaterial } from '../scene/materials/default-material.js';
import { StandardMaterialOptions } from '../scene/materials/standard-material-options.js';
import { LitShaderOptions } from '../scene/shader-lib/programs/lit-shader-options.js';
import { Layer } from '../scene/layer.js';
import { Animation, Key, Node } from '../scene/animation/animation.js';
import { Skeleton } from '../scene/animation/skeleton.js';
import { Channel } from '../platform/audio/channel.js';
import { Channel3d } from '../platform/audio/channel3d.js';
import { Listener } from '../platform/sound/listener.js';
import { Sound } from '../platform/sound/sound.js';
import { SoundManager } from '../platform/sound/manager.js';
import { AssetRegistry } from '../framework/asset/asset-registry.js';
import { XrInputSource } from '../framework/xr/xr-input-source.js';
import { Controller } from '../platform/input/controller.js';
import { ElementInput } from '../framework/input/element-input.js';
import { GamePads } from '../platform/input/game-pads.js';
import { Keyboard } from '../platform/input/keyboard.js';
import { KeyboardEvent } from '../platform/input/keyboard-event.js';
import { Mouse } from '../platform/input/mouse.js';
import { MouseEvent } from '../platform/input/mouse-event.js';
import { TouchDevice } from '../platform/input/touch-device.js';
import { getTouchTargetCoords, Touch, TouchEvent } from '../platform/input/touch-event.js';
import { AppBase } from '../framework/app-base.js';
import { getApplication } from '../framework/globals.js';
import { CameraComponent } from '../framework/components/camera/component.js';
import { LightComponent } from '../framework/components/light/component.js';
import { ModelComponent } from '../framework/components/model/component.js';
import { RenderComponent } from '../framework/components/render/component.js';
import { BODYTYPE_STATIC, BODYTYPE_DYNAMIC, BODYTYPE_KINEMATIC, BODYFLAG_STATIC_OBJECT, BODYFLAG_KINEMATIC_OBJECT, BODYFLAG_NORESPONSE_OBJECT, BODYSTATE_ACTIVE_TAG, BODYSTATE_ISLAND_SLEEPING, BODYSTATE_WANTS_DEACTIVATION, BODYSTATE_DISABLE_DEACTIVATION, BODYSTATE_DISABLE_SIMULATION } from '../framework/components/rigid-body/constants.js';
import { RigidBodyComponent } from '../framework/components/rigid-body/component.js';
import { RigidBodyComponentSystem } from '../framework/components/rigid-body/system.js';
import { basisInitialize } from '../framework/handlers/basis.js';
import { LitShader } from '../scene/shader-lib/programs/lit-shader.js';

// CORE

const log = {
  write: function (text) {
    Debug.deprecated('pc.log.write is deprecated. Use console.log instead.');
    console.log(text);
  },
  open: function () {
    Debug.deprecated('pc.log.open is deprecated. Use console.log instead.');
    log.write('Powered by PlayCanvas ' + version + ' ' + revision);
  },
  info: function (text) {
    Debug.deprecated('pc.log.info is deprecated. Use console.info instead.');
    console.info('INFO:    ' + text);
  },
  debug: function (text) {
    Debug.deprecated('pc.log.debug is deprecated. Use console.debug instead.');
    console.debug('DEBUG:   ' + text);
  },
  error: function (text) {
    Debug.deprecated('pc.log.error is deprecated. Use console.error instead.');
    console.error('ERROR:   ' + text);
  },
  warning: function (text) {
    Debug.deprecated('pc.log.warning is deprecated. Use console.warn instead.');
    console.warn('WARNING: ' + text);
  },
  alert: function (text) {
    Debug.deprecated('pc.log.alert is deprecated. Use alert instead.');
    log.write('ALERT:   ' + text);
    alert(text); // eslint-disable-line no-alert
  },

  assert: function (condition, text) {
    Debug.deprecated('pc.log.assert is deprecated. Use a conditional plus console.log instead.');
    if (condition === false) {
      log.write('ASSERT:  ' + text);
    }
  }
};
string.endsWith = function (s, subs) {
  Debug.deprecated('pc.string.endsWith is deprecated. Use String#endsWith instead.');
  return s.endsWith(subs);
};
string.startsWith = function (s, subs) {
  Debug.deprecated('pc.string.startsWith is deprecated. Use String#startsWith instead.');
  return s.startsWith(subs);
};
class Timer {
  constructor() {
    this._isRunning = false;
    this._a = 0;
    this._b = 0;
  }
  start() {
    this._isRunning = true;
    this._a = now();
  }
  stop() {
    this._isRunning = false;
    this._b = now();
  }
  getMilliseconds() {
    return this._b - this._a;
  }
}
const time = {
  now: now,
  Timer: Timer
};
Object.defineProperty(Color.prototype, 'data', {
  get: function () {
    Debug.deprecated('pc.Color#data is not public API and should not be used. Access color components via their individual properties.');
    if (!this._data) {
      this._data = new Float32Array(4);
    }
    this._data[0] = this.r;
    this._data[1] = this.g;
    this._data[2] = this.b;
    this._data[3] = this.a;
    return this._data;
  }
});
Object.defineProperty(Color.prototype, 'data3', {
  get: function () {
    Debug.deprecated('pc.Color#data3 is not public API and should not be used. Access color components via their individual properties.');
    if (!this._data3) {
      this._data3 = new Float32Array(3);
    }
    this._data3[0] = this.r;
    this._data3[1] = this.g;
    this._data3[2] = this.b;
    return this._data3;
  }
});
function inherits(Self, Super) {
  const Temp = function Temp() {};
  const Func = function Func(arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8) {
    Super.call(this, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8);
    Self.call(this, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8);
    // this.constructor = Self;
  };

  Func._super = Super.prototype;
  Temp.prototype = Super.prototype;
  Func.prototype = new Temp();
  return Func;
}
function makeArray(arr) {
  Debug.deprecated('pc.makeArray is not public API and should not be used. Use Array.prototype.slice.call instead.');
  return Array.prototype.slice.call(arr);
}
function createStyle(cssString) {
  const result = document.createElement('style');
  result.type = 'text/css';
  if (result.styleSheet) {
    result.styleSheet.cssText = cssString;
  } else {
    result.appendChild(document.createTextNode(cssString));
  }
  return result;
}

// MATH

math.INV_LOG2 = Math.LOG2E;
math.intToBytes = math.intToBytes32;
math.bytesToInt = math.bytesToInt32;
Object.defineProperty(Vec2.prototype, 'data', {
  get: function () {
    Debug.deprecated('pc.Vec2#data is not public API and should not be used. Access vector components via their individual properties.');
    if (!this._data) {
      this._data = new Float32Array(2);
    }
    this._data[0] = this.x;
    this._data[1] = this.y;
    return this._data;
  }
});
Vec2.prototype.scale = Vec2.prototype.mulScalar;
Object.defineProperty(Vec3.prototype, 'data', {
  get: function () {
    Debug.deprecated('pc.Vec3#data is not public API and should not be used. Access vector components via their individual properties.');
    if (!this._data) {
      this._data = new Float32Array(3);
    }
    this._data[0] = this.x;
    this._data[1] = this.y;
    this._data[2] = this.z;
    return this._data;
  }
});
Vec3.prototype.scale = Vec3.prototype.mulScalar;
Object.defineProperty(Vec4.prototype, 'data', {
  get: function () {
    Debug.deprecated('pc.Vec4#data is not public API and should not be used. Access vector components via their individual properties.');
    if (!this._data) {
      this._data = new Float32Array(4);
    }
    this._data[0] = this.x;
    this._data[1] = this.y;
    this._data[2] = this.z;
    this._data[3] = this.w;
    return this._data;
  }
});
Vec4.prototype.scale = Vec4.prototype.mulScalar;

// SHAPE

const shape = {
  Aabb: BoundingBox,
  Sphere: BoundingSphere,
  Plane: Plane
};
BoundingSphere.prototype.intersectRay = BoundingSphere.prototype.intersectsRay;
Frustum.prototype.update = function (projectionMatrix, viewMatrix) {
  Debug.deprecated('pc.Frustum#update is deprecated. Use pc.Frustum#setFromMat4 instead.');
  const viewProj = new Mat4();
  viewProj.mul2(projectionMatrix, viewMatrix);
  this.setFromMat4(viewProj);
};

// GRAPHICS

const ELEMENTTYPE_INT8 = TYPE_INT8;
const ELEMENTTYPE_UINT8 = TYPE_UINT8;
const ELEMENTTYPE_INT16 = TYPE_INT16;
const ELEMENTTYPE_UINT16 = TYPE_UINT16;
const ELEMENTTYPE_INT32 = TYPE_INT32;
const ELEMENTTYPE_UINT32 = TYPE_UINT32;
const ELEMENTTYPE_FLOAT32 = TYPE_FLOAT32;
const PIXELFORMAT_L8_A8 = PIXELFORMAT_LA8;
const PIXELFORMAT_R5_G6_B5 = PIXELFORMAT_RGB565;
const PIXELFORMAT_R5_G5_B5_A1 = PIXELFORMAT_RGBA5551;
const PIXELFORMAT_R4_G4_B4_A4 = PIXELFORMAT_RGBA4;
const PIXELFORMAT_R8_G8_B8 = PIXELFORMAT_RGB8;
const PIXELFORMAT_R8_G8_B8_A8 = PIXELFORMAT_RGBA8;
const BLENDMODE_CONSTANT_COLOR = BLENDMODE_CONSTANT;
const BLENDMODE_ONE_MINUS_CONSTANT_COLOR = BLENDMODE_ONE_MINUS_CONSTANT;
const BLENDMODE_CONSTANT_ALPHA = BLENDMODE_CONSTANT;
const BLENDMODE_ONE_MINUS_CONSTANT_ALPHA = BLENDMODE_ONE_MINUS_CONSTANT;
function UnsupportedBrowserError(message) {
  this.name = 'UnsupportedBrowserError';
  this.message = message || '';
}
UnsupportedBrowserError.prototype = Error.prototype;
function ContextCreationError(message) {
  this.name = 'ContextCreationError';
  this.message = message || '';
}
ContextCreationError.prototype = Error.prototype;
const programlib = {
  begin: ShaderGenerator.begin,
  dummyFragmentCode: ShaderUtils.dummyFragmentCode,
  end: ShaderGenerator.end,
  fogCode: ShaderGenerator.fogCode,
  gammaCode: ShaderGenerator.gammaCode,
  precisionCode: ShaderUtils.precisionCode,
  skinCode: ShaderGenerator.skinCode,
  tonemapCode: ShaderGenerator.tonemapCode,
  versionCode: ShaderUtils.versionCode
};
const gfx = {
  ADDRESS_CLAMP_TO_EDGE: ADDRESS_CLAMP_TO_EDGE,
  ADDRESS_MIRRORED_REPEAT: ADDRESS_MIRRORED_REPEAT,
  ADDRESS_REPEAT: ADDRESS_REPEAT,
  BLENDMODE_ZERO: BLENDMODE_ZERO,
  BLENDMODE_ONE: BLENDMODE_ONE,
  BLENDMODE_SRC_COLOR: BLENDMODE_SRC_COLOR,
  BLENDMODE_ONE_MINUS_SRC_COLOR: BLENDMODE_ONE_MINUS_SRC_COLOR,
  BLENDMODE_DST_COLOR: BLENDMODE_DST_COLOR,
  BLENDMODE_ONE_MINUS_DST_COLOR: BLENDMODE_ONE_MINUS_DST_COLOR,
  BLENDMODE_SRC_ALPHA: BLENDMODE_SRC_ALPHA,
  BLENDMODE_SRC_ALPHA_SATURATE: BLENDMODE_SRC_ALPHA_SATURATE,
  BLENDMODE_ONE_MINUS_SRC_ALPHA: BLENDMODE_ONE_MINUS_SRC_ALPHA,
  BLENDMODE_DST_ALPHA: BLENDMODE_DST_ALPHA,
  BLENDMODE_ONE_MINUS_DST_ALPHA: BLENDMODE_ONE_MINUS_DST_ALPHA,
  BUFFER_STATIC: BUFFER_STATIC,
  BUFFER_DYNAMIC: BUFFER_DYNAMIC,
  BUFFER_STREAM: BUFFER_STREAM,
  CULLFACE_NONE: CULLFACE_NONE,
  CULLFACE_BACK: CULLFACE_BACK,
  CULLFACE_FRONT: CULLFACE_FRONT,
  CULLFACE_FRONTANDBACK: CULLFACE_FRONTANDBACK,
  ELEMENTTYPE_INT8: TYPE_INT8,
  ELEMENTTYPE_UINT8: TYPE_UINT8,
  ELEMENTTYPE_INT16: TYPE_INT16,
  ELEMENTTYPE_UINT16: TYPE_UINT16,
  ELEMENTTYPE_INT32: TYPE_INT32,
  ELEMENTTYPE_UINT32: TYPE_UINT32,
  ELEMENTTYPE_FLOAT32: TYPE_FLOAT32,
  FILTER_NEAREST: FILTER_NEAREST,
  FILTER_LINEAR: FILTER_LINEAR,
  FILTER_NEAREST_MIPMAP_NEAREST: FILTER_NEAREST_MIPMAP_NEAREST,
  FILTER_NEAREST_MIPMAP_LINEAR: FILTER_NEAREST_MIPMAP_LINEAR,
  FILTER_LINEAR_MIPMAP_NEAREST: FILTER_LINEAR_MIPMAP_NEAREST,
  FILTER_LINEAR_MIPMAP_LINEAR: FILTER_LINEAR_MIPMAP_LINEAR,
  INDEXFORMAT_UINT8: INDEXFORMAT_UINT8,
  INDEXFORMAT_UINT16: INDEXFORMAT_UINT16,
  INDEXFORMAT_UINT32: INDEXFORMAT_UINT32,
  PIXELFORMAT_RGB565: PIXELFORMAT_RGB565,
  PIXELFORMAT_RGB8: PIXELFORMAT_RGB8,
  PIXELFORMAT_RGBA8: PIXELFORMAT_RGBA8,
  PRIMITIVE_POINTS: PRIMITIVE_POINTS,
  PRIMITIVE_LINES: PRIMITIVE_LINES,
  PRIMITIVE_LINELOOP: PRIMITIVE_LINELOOP,
  PRIMITIVE_LINESTRIP: PRIMITIVE_LINESTRIP,
  PRIMITIVE_TRIANGLES: PRIMITIVE_TRIANGLES,
  PRIMITIVE_TRISTRIP: PRIMITIVE_TRISTRIP,
  PRIMITIVE_TRIFAN: PRIMITIVE_TRIFAN,
  SEMANTIC_POSITION: SEMANTIC_POSITION,
  SEMANTIC_NORMAL: SEMANTIC_NORMAL,
  SEMANTIC_COLOR: SEMANTIC_COLOR,
  SEMANTIC_TEXCOORD: SEMANTIC_TEXCOORD,
  SEMANTIC_TEXCOORD0: SEMANTIC_TEXCOORD0,
  SEMANTIC_TEXCOORD1: SEMANTIC_TEXCOORD1,
  SEMANTIC_ATTR0: SEMANTIC_ATTR0,
  SEMANTIC_ATTR1: SEMANTIC_ATTR1,
  SEMANTIC_ATTR2: SEMANTIC_ATTR2,
  SEMANTIC_ATTR3: SEMANTIC_ATTR3,
  TEXTURELOCK_READ: TEXTURELOCK_READ,
  TEXTURELOCK_WRITE: TEXTURELOCK_WRITE,
  drawQuadWithShader: drawQuadWithShader,
  programlib: programlib,
  shaderChunks: shaderChunks,
  ContextCreationError: ContextCreationError,
  Device: GraphicsDevice,
  IndexBuffer: IndexBuffer,
  ProgramLibrary: ProgramLibrary,
  RenderTarget: RenderTarget,
  ScopeId: ScopeId,
  Shader: Shader,
  ShaderInput: WebglShaderInput,
  Texture: Texture,
  UnsupportedBrowserError: UnsupportedBrowserError,
  VertexBuffer: VertexBuffer,
  VertexFormat: VertexFormat,
  VertexIterator: VertexIterator
};
const _viewport = new Vec4();
function drawFullscreenQuad(device, target, vertexBuffer, shader, rect) {
  Debug.deprecated(`pc.drawFullscreenQuad is deprecated. When used as part of PostEffect, use PostEffect#drawQuad instead.`);

  // convert rect in normalized space to viewport in pixel space
  let viewport;
  if (rect) {
    const w = target ? target.width : device.width;
    const h = target ? target.height : device.height;
    viewport = _viewport.set(rect.x * w, rect.y * h, rect.z * w, rect.w * h);
  }
  drawQuadWithShader(device, target, shader, viewport);
}
const posteffect = {
  createFullscreenQuad: device => {
    return device.quadVertexBuffer;
  },
  drawFullscreenQuad: drawFullscreenQuad,
  PostEffect: PostEffect,
  PostEffectQueue: PostEffectQueue
};
Object.defineProperty(shaderChunks, 'transformSkinnedVS', {
  get: function () {
    return '#define SKIN\n' + shaderChunks.transformVS;
  }
});
const deprecatedChunks = {
  'ambientPrefilteredCube.frag': 'ambientEnv.frag',
  'ambientPrefilteredCubeLod.frag': 'ambientEnv.frag',
  'dpAtlasQuad.frag': null,
  'genParaboloid.frag': null,
  'prefilterCubemap.frag': null,
  'reflectionDpAtlas.frag': 'reflectionEnv.frag',
  'reflectionPrefilteredCube.frag': 'reflectionEnv.frag',
  'reflectionPrefilteredCubeLod.frag': 'reflectionEnv.frag'
};
Object.keys(deprecatedChunks).forEach(chunkName => {
  const replacement = deprecatedChunks[chunkName];
  const useInstead = replacement ? ` Use pc.shaderChunks['${replacement}'] instead.` : '';
  const msg = `pc.shaderChunks['${chunkName}'] is deprecated.${useInstead}}`;
  Object.defineProperty(shaderChunks, chunkName, {
    get: function () {
      Debug.error(msg);
      return null;
    },
    set: function () {
      Debug.error(msg);
    }
  });
});

// We only provide backwards compatibility in debug builds, production builds have to be
// as fast and small as possible.

/**
 * Helper function to ensure a bit of backwards compatibility.
 *
 * @example
 * toLitArgs('litShaderArgs.sheen.specularity'); // Result: 'litArgs_sheen_specularity'
 * @param {string} src - The shader source which may generate shader errors.
 * @returns {string} The backwards compatible shader source.
 * @ignore
 */
function compatibilityForLitArgs(src) {
  if (src.includes('litShaderArgs')) {
    src = src.replace(/litShaderArgs([\.a-zA-Z]+)+/g, (a, b) => {
      const newSource = 'litArgs' + b.replace(/\./g, '_');
      Debug.deprecated(`Nested struct property access is deprecated, because it's crashing some devices. Please update your custom chunks manually. In particular ${a} should be ${newSource} now.`);
      return newSource;
    });
  }
  return src;
}

/**
 * Add more backwards compatibility functions as needed.
 */
LitShader.prototype.handleCompatibility = function () {
  this.fshader = compatibilityForLitArgs(this.fshader);
};

// Note: This was never public interface, but has been used in external scripts
Object.defineProperties(RenderTarget.prototype, {
  _glFrameBuffer: {
    get: function () {
      Debug.deprecated('pc.RenderTarget#_glFrameBuffer is deprecated. Use pc.RenderTarget.impl#_glFrameBuffer instead.');
      return this.impl._glFrameBuffer;
    },
    set: function (rgbm) {
      Debug.deprecated('pc.RenderTarget#_glFrameBuffer is deprecated. Use pc.RenderTarget.impl#_glFrameBuffer instead.');
    }
  }
});
Object.defineProperty(VertexFormat, 'defaultInstancingFormat', {
  get: function () {
    Debug.deprecated('pc.VertexFormat.defaultInstancingFormat is deprecated, use pc.VertexFormat.getDefaultInstancingFormat(graphicsDevice).');
    return VertexFormat.getDefaultInstancingFormat(GraphicsDeviceAccess.get());
  }
});
Object.defineProperties(Texture.prototype, {
  rgbm: {
    get: function () {
      Debug.deprecated('pc.Texture#rgbm is deprecated. Use pc.Texture#type instead.');
      return this.type === TEXTURETYPE_RGBM;
    },
    set: function (rgbm) {
      Debug.deprecated('pc.Texture#rgbm is deprecated. Use pc.Texture#type instead.');
      this.type = rgbm ? TEXTURETYPE_RGBM : TEXTURETYPE_DEFAULT;
    }
  },
  swizzleGGGR: {
    get: function () {
      Debug.deprecated('pc.Texture#swizzleGGGR is deprecated. Use pc.Texture#type instead.');
      return this.type === TEXTURETYPE_SWIZZLEGGGR;
    },
    set: function (swizzleGGGR) {
      Debug.deprecated('pc.Texture#swizzleGGGR is deprecated. Use pc.Texture#type instead.');
      this.type = swizzleGGGR ? TEXTURETYPE_SWIZZLEGGGR : TEXTURETYPE_DEFAULT;
    }
  },
  _glTexture: {
    get: function () {
      Debug.deprecated('pc.Texture#_glTexture is no longer available, use Use pc.Texture.impl._glTexture instead.');
      return this.impl._glTexture;
    }
  },
  autoMipmap: {
    get: function () {
      Debug.deprecated('pc.Texture#autoMipmap is deprecated, use pc.Texture#mipmaps instead.');
      return this._mipmaps;
    },
    set: function (value) {
      Debug.deprecated('pc.Texture#autoMipmap is deprecated, use pc.Texture#mipmaps instead.');
      this._mipmaps = value;
    }
  }
});
GraphicsDevice.prototype.getProgramLibrary = function () {
  Debug.deprecated(`pc.GraphicsDevice#getProgramLibrary is deprecated.`);
  return getProgramLibrary(this);
};
GraphicsDevice.prototype.setProgramLibrary = function (lib) {
  Debug.deprecated(`pc.GraphicsDevice#setProgramLibrary is deprecated.`);
  setProgramLibrary(this, lib);
};
GraphicsDevice.prototype.removeShaderFromCache = function (shader) {
  Debug.deprecated(`pc.GraphicsDevice#removeShaderFromCache is deprecated.`);
  getProgramLibrary(this).removeFromCache(shader);
};
BlendState.DEFAULT = Object.freeze(new BlendState());
const _tempBlendState = new BlendState();
const _tempDepthState = new DepthState();
GraphicsDevice.prototype.setBlendFunction = function (blendSrc, blendDst) {
  Debug.deprecated(`pc.GraphicsDevice#setBlendFunction is deprecated, use pc.GraphicsDevice.setBlendState instead.`);
  const currentBlendState = this.blendState;
  _tempBlendState.copy(currentBlendState);
  _tempBlendState.setColorBlend(currentBlendState.colorOp, blendSrc, blendDst);
  _tempBlendState.setAlphaBlend(currentBlendState.alphaOp, blendSrc, blendDst);
  this.setBlendState(_tempBlendState);
};
GraphicsDevice.prototype.setBlendFunctionSeparate = function (blendSrc, blendDst, blendSrcAlpha, blendDstAlpha) {
  Debug.deprecated(`pc.GraphicsDevice#setBlendFunctionSeparate is deprecated, use pc.GraphicsDevice.setBlendState instead.`);
  const currentBlendState = this.blendState;
  _tempBlendState.copy(currentBlendState);
  _tempBlendState.setColorBlend(currentBlendState.colorOp, blendSrc, blendDst);
  _tempBlendState.setAlphaBlend(currentBlendState.alphaOp, blendSrcAlpha, blendDstAlpha);
  this.setBlendState(_tempBlendState);
};
GraphicsDevice.prototype.setBlendEquation = function (blendEquation) {
  Debug.deprecated(`pc.GraphicsDevice#setBlendEquation is deprecated, use pc.GraphicsDevice.setBlendState instead.`);
  const currentBlendState = this.blendState;
  _tempBlendState.copy(currentBlendState);
  _tempBlendState.setColorBlend(blendEquation, currentBlendState.colorSrcFactor, currentBlendState.colorDstFactor);
  _tempBlendState.setAlphaBlend(blendEquation, currentBlendState.alphaSrcFactor, currentBlendState.alphaDstFactor);
  this.setBlendState(_tempBlendState);
};
GraphicsDevice.prototype.setBlendEquationSeparate = function (blendEquation, blendAlphaEquation) {
  Debug.deprecated(`pc.GraphicsDevice#setBlendEquationSeparate is deprecated, use pc.GraphicsDevice.setBlendState instead.`);
  const currentBlendState = this.blendState;
  _tempBlendState.copy(currentBlendState);
  _tempBlendState.setColorBlend(blendEquation, currentBlendState.colorSrcFactor, currentBlendState.colorDstFactor);
  _tempBlendState.setAlphaBlend(blendAlphaEquation, currentBlendState.alphaSrcFactor, currentBlendState.alphaDstFactor);
  this.setBlendState(_tempBlendState);
};
GraphicsDevice.prototype.setColorWrite = function (redWrite, greenWrite, blueWrite, alphaWrite) {
  Debug.deprecated(`pc.GraphicsDevice#setColorWrite is deprecated, use pc.GraphicsDevice.setBlendState instead.`);
  const currentBlendState = this.blendState;
  _tempBlendState.copy(currentBlendState);
  _tempBlendState.setColorWrite(redWrite, greenWrite, blueWrite, alphaWrite);
  this.setBlendState(_tempBlendState);
};
GraphicsDevice.prototype.getBlending = function () {
  return this.blendState.blend;
};
GraphicsDevice.prototype.setBlending = function (blending) {
  Debug.deprecated(`pc.GraphicsDevice#setBlending is deprecated, use pc.GraphicsDevice.setBlendState instead.`);
  _tempBlendState.copy(this.blendState);
  _tempBlendState.blend = blending;
  this.setBlendState(_tempBlendState);
};
GraphicsDevice.prototype.setDepthWrite = function (write) {
  Debug.deprecated(`pc.GraphicsDevice#setDepthWrite is deprecated, use pc.GraphicsDevice.setDepthState instead.`);
  _tempDepthState.copy(this.depthState);
  _tempDepthState.write = write;
  this.setDepthState(_tempDepthState);
};
GraphicsDevice.prototype.setDepthFunc = function (func) {
  Debug.deprecated(`pc.GraphicsDevice#setDepthFunc is deprecated, use pc.GraphicsDevice.setDepthState instead.`);
  _tempDepthState.copy(this.depthState);
  _tempDepthState.func = func;
  this.setDepthState(_tempDepthState);
};
GraphicsDevice.prototype.setDepthTest = function (test) {
  Debug.deprecated(`pc.GraphicsDevice#setDepthTest is deprecated, use pc.GraphicsDevice.setDepthState instead.`);
  _tempDepthState.copy(this.depthState);
  _tempDepthState.test = test;
  this.setDepthState(_tempDepthState);
};
GraphicsDevice.prototype.getCullMode = function () {
  return this.cullMode;
};

// SCENE

const PhongMaterial = StandardMaterial;
const LitOptions = LitShaderOptions;
const scene = {
  partitionSkin: partitionSkin,
  procedural: {
    calculateTangents: calculateTangents,
    createMesh: createMesh,
    createTorus: createTorus,
    createCylinder: createCylinder,
    createCapsule: createCapsule,
    createCone: createCone,
    createSphere: createSphere,
    createPlane: createPlane,
    createBox: createBox
  },
  BasicMaterial: BasicMaterial,
  ForwardRenderer: ForwardRenderer,
  GraphNode: GraphNode,
  Material: Material,
  Mesh: Mesh,
  MeshInstance: MeshInstance,
  Model: Model,
  ParticleEmitter: ParticleEmitter,
  PhongMaterial: StandardMaterial,
  Picker: Picker,
  Projection: {
    ORTHOGRAPHIC: PROJECTION_ORTHOGRAPHIC,
    PERSPECTIVE: PROJECTION_PERSPECTIVE
  },
  Scene: Scene,
  Skin: Skin,
  SkinInstance: SkinInstance
};
Object.defineProperty(Scene.prototype, 'defaultMaterial', {
  get: function () {
    Debug.deprecated('pc.Scene#defaultMaterial is deprecated.');
    return getDefaultMaterial(getApplication().graphicsDevice);
  }
});
Object.defineProperty(LayerComposition.prototype, '_meshInstances', {
  get: function () {
    Debug.deprecated('pc.LayerComposition#_meshInstances is deprecated.');
    return null;
  }
});
Object.defineProperty(Scene.prototype, 'drawCalls', {
  get: function () {
    Debug.deprecated('pc.Scene#drawCalls is deprecated and no longer provides mesh instances.');
    return null;
  }
});

// scene.skyboxPrefiltered**** are deprecated
['128', '64', '32', '16', '8', '4'].forEach((size, index) => {
  Object.defineProperty(Scene.prototype, `skyboxPrefiltered${size}`, {
    get: function () {
      Debug.deprecated(`pc.Scene#skyboxPrefiltered${size} is deprecated. Use pc.Scene#prefilteredCubemaps instead.`);
      return this._prefilteredCubemaps[index];
    },
    set: function (value) {
      Debug.deprecated(`pc.Scene#skyboxPrefiltered${size} is deprecated. Use pc.Scene#prefilteredCubemaps instead.`);
      this._prefilteredCubemaps[index] = value;
      this.updateShaders = true;
    }
  });
});
Object.defineProperty(Scene.prototype, 'models', {
  get: function () {
    if (!this._models) {
      this._models = [];
    }
    return this._models;
  }
});
Object.defineProperty(Layer.prototype, 'renderTarget', {
  set: function (rt) {
    Debug.deprecated(`pc.Layer#renderTarget is deprecated. Set the render target on the camera instead.`);
    this._renderTarget = rt;
    this._dirtyCameras = true;
  },
  get: function () {
    return this._renderTarget;
  }
});

// This can be removed when 1.56 is out and the Editor no longer calls this
Scene.prototype._updateSkybox = function (device) {
  Debug.deprecated(`pc.Scene#_updateSkybox is deprecated. Use pc.Scene#_updateSky instead.`);
  this._updateSky(device);
};
Scene.prototype.addModel = function (model) {
  Debug.deprecated('pc.Scene#addModel is deprecated.');
  if (this.containsModel(model)) return;
  const layer = this.layers.getLayerById(LAYERID_WORLD);
  if (!layer) return;
  layer.addMeshInstances(model.meshInstances);
  this.models.push(model);
};
Scene.prototype.addShadowCaster = function (model) {
  Debug.deprecated('pc.Scene#addShadowCaster is deprecated.');
  const layer = this.layers.getLayerById(LAYERID_WORLD);
  if (!layer) return;
  layer.addShadowCasters(model.meshInstances);
};
Scene.prototype.removeModel = function (model) {
  Debug.deprecated('pc.Scene#removeModel is deprecated.');
  const index = this.models.indexOf(model);
  if (index !== -1) {
    const layer = this.layers.getLayerById(LAYERID_WORLD);
    if (!layer) return;
    layer.removeMeshInstances(model.meshInstances);
    this.models.splice(index, 1);
  }
};
Scene.prototype.removeShadowCasters = function (model) {
  Debug.deprecated('pc.Scene#removeShadowCasters is deprecated.');
  const layer = this.layers.getLayerById(LAYERID_WORLD);
  if (!layer) return;
  layer.removeShadowCasters(model.meshInstances);
};
Scene.prototype.containsModel = function (model) {
  Debug.deprecated('pc.Scene#containsModel is deprecated.');
  return this.models.indexOf(model) >= 0;
};
Scene.prototype.getModels = function (model) {
  Debug.deprecated('pc.Scene#getModels is deprecated.');
  return this.models;
};
Object.defineProperty(Batch.prototype, 'model', {
  get: function () {
    Debug.deprecated('pc.Batch#model is deprecated. Use pc.Batch#meshInstance to access batched mesh instead.');
    return null;
  }
});
ForwardRenderer.prototype.renderComposition = function (comp) {
  Debug.deprecated('pc.ForwardRenderer#renderComposition is deprecated. Use pc.AppBase.renderComposition instead.');
  getApplication().renderComposition(comp);
};
MeshInstance.prototype.syncAabb = function () {
  Debug.deprecated('pc.MeshInstance#syncAabb is deprecated.');
};
Morph.prototype.getTarget = function (index) {
  Debug.deprecated('pc.Morph#getTarget is deprecated. Use pc.Morph#targets instead.');
  return this.targets[index];
};
GraphNode.prototype._dirtify = function (local) {
  Debug.deprecated('pc.GraphNode#_dirtify is deprecated. Use pc.GraphNode#_dirtifyLocal or _dirtifyWorld respectively instead.');
  if (local) this._dirtifyLocal();else this._dirtifyWorld();
};
GraphNode.prototype.addLabel = function (label) {
  Debug.deprecated('pc.GraphNode#addLabel is deprecated. Use pc.GraphNode#tags instead.');
  this._labels[label] = true;
};
GraphNode.prototype.getLabels = function () {
  Debug.deprecated('pc.GraphNode#getLabels is deprecated. Use pc.GraphNode#tags instead.');
  return Object.keys(this._labels);
};
GraphNode.prototype.hasLabel = function (label) {
  Debug.deprecated('pc.GraphNode#hasLabel is deprecated. Use pc.GraphNode#tags instead.');
  return !!this._labels[label];
};
GraphNode.prototype.removeLabel = function (label) {
  Debug.deprecated('pc.GraphNode#removeLabel is deprecated. Use pc.GraphNode#tags instead.');
  delete this._labels[label];
};
GraphNode.prototype.findByLabel = function (label, results = []) {
  Debug.deprecated('pc.GraphNode#findByLabel is deprecated. Use pc.GraphNode#tags instead.');
  if (this.hasLabel(label)) {
    results.push(this);
  }
  for (let i = 0; i < this._children.length; ++i) {
    results = this._children[i].findByLabel(label, results);
  }
  return results;
};
GraphNode.prototype.getChildren = function () {
  Debug.deprecated('pc.GraphNode#getChildren is deprecated. Use pc.GraphNode#children instead.');
  return this.children;
};
GraphNode.prototype.getName = function () {
  Debug.deprecated('pc.GraphNode#getName is deprecated. Use pc.GraphNode#name instead.');
  return this.name;
};
GraphNode.prototype.getPath = function () {
  Debug.deprecated('pc.GraphNode#getPath is deprecated. Use pc.GraphNode#path instead.');
  return this.path;
};
GraphNode.prototype.getRoot = function () {
  Debug.deprecated('pc.GraphNode#getRoot is deprecated. Use pc.GraphNode#root instead.');
  return this.root;
};
GraphNode.prototype.getParent = function () {
  Debug.deprecated('pc.GraphNode#getParent is deprecated. Use pc.GraphNode#parent instead.');
  return this.parent;
};
GraphNode.prototype.setName = function (name) {
  Debug.deprecated('pc.GraphNode#setName is deprecated. Use pc.GraphNode#name instead.');
  this.name = name;
};
Material.prototype.getName = function () {
  Debug.deprecated('pc.Material#getName is deprecated. Use pc.Material#name instead.');
  return this.name;
};
Material.prototype.setName = function (name) {
  Debug.deprecated('pc.Material#setName is deprecated. Use pc.Material#name instead.');
  this.name = name;
};
Material.prototype.getShader = function () {
  Debug.deprecated('pc.Material#getShader is deprecated. Use pc.Material#shader instead.');
  return this.shader;
};
Material.prototype.setShader = function (shader) {
  Debug.deprecated('pc.Material#setShader is deprecated. Use pc.Material#shader instead.');
  this.shader = shader;
};

// Note: this is used by the Editor
Object.defineProperty(Material.prototype, 'blend', {
  set: function (value) {
    Debug.deprecated(`pc.Material#blend is deprecated, use pc.Material.blendState.`);
    this.blendState.blend = value;
  },
  get: function () {
    return this.blendState.blend;
  }
});

// Note: this is used by the Editor
Object.defineProperty(Material.prototype, 'blendSrc', {
  set: function (value) {
    Debug.deprecated(`pc.Material#blendSrc is deprecated, use pc.Material.blendState.`);
    const currentBlendState = this.blendState;
    _tempBlendState.copy(currentBlendState);
    _tempBlendState.setColorBlend(currentBlendState.colorOp, value, currentBlendState.colorDstFactor);
    _tempBlendState.setAlphaBlend(currentBlendState.alphaOp, value, currentBlendState.alphaDstFactor);
    this.blendState = _tempBlendState;
  },
  get: function () {
    return this.blendState.colorSrcFactor;
  }
});

// Note: this is used by the Editor
Object.defineProperty(Material.prototype, 'blendDst', {
  set: function (value) {
    Debug.deprecated(`pc.Material#blendDst is deprecated, use pc.Material.blendState.`);
    const currentBlendState = this.blendState;
    _tempBlendState.copy(currentBlendState);
    _tempBlendState.setColorBlend(currentBlendState.colorOp, currentBlendState.colorSrcFactor, value);
    _tempBlendState.setAlphaBlend(currentBlendState.alphaOp, currentBlendState.alphaSrcFactor, value);
    this.blendState = _tempBlendState;
  },
  get: function () {
    return this.blendState.colorDstFactor;
  }
});

// shininess (range 0..100) - maps to internal gloss value (range 0..1)
Object.defineProperty(StandardMaterial.prototype, 'shininess', {
  get: function () {
    return this.gloss * 100;
  },
  set: function (value) {
    this.gloss = value * 0.01;
  }
});
function _defineAlias(newName, oldName) {
  Object.defineProperty(StandardMaterial.prototype, oldName, {
    get: function () {
      Debug.deprecated(`pc.StandardMaterial#${oldName} is deprecated. Use pc.StandardMaterial#${newName} instead.`);
      return this[newName];
    },
    set: function (value) {
      Debug.deprecated(`pc.StandardMaterial#${oldName} is deprecated. Use pc.StandardMaterial#${newName} instead.`);
      this[newName] = value;
    }
  });
}
_defineAlias('diffuseTint', 'diffuseMapTint');
_defineAlias('specularTint', 'specularMapTint');
_defineAlias('emissiveTint', 'emissiveMapTint');
_defineAlias('aoVertexColor', 'aoMapVertexColor');
_defineAlias('diffuseVertexColor', 'diffuseMapVertexColor');
_defineAlias('specularVertexColor', 'specularMapVertexColor');
_defineAlias('emissiveVertexColor', 'emissiveMapVertexColor');
_defineAlias('metalnessVertexColor', 'metalnessMapVertexColor');
_defineAlias('glossVertexColor', 'glossMapVertexColor');
_defineAlias('opacityVertexColor', 'opacityMapVertexColor');
_defineAlias('lightVertexColor', 'lightMapVertexColor');
_defineAlias('sheenGloss', 'sheenGlossiess');
_defineAlias('clearCoatGloss', 'clearCostGlossiness');
function _defineOption(name, newName) {
  if (name !== 'pass') {
    Object.defineProperty(StandardMaterialOptions.prototype, name, {
      get: function () {
        Debug.deprecated(`Getting pc.Options#${name} has been deprecated as the property has been moved to pc.Options.LitShaderOptions#${newName || name}.`);
        return this.litOptions[newName || name];
      },
      set: function (value) {
        Debug.deprecated(`Setting pc.Options#${name} has been deprecated as the property has been moved to pc.Options.LitShaderOptions#${newName || name}.`);
        this.litOptions[newName || name] = value;
      }
    });
  }
}
_defineOption('refraction', 'useRefraction');
const tempOptions = new LitShaderOptions();
const litOptionProperties = Object.getOwnPropertyNames(tempOptions);
for (const litOption in litOptionProperties) {
  _defineOption(litOptionProperties[litOption]);
}

// ANIMATION

const anim = {
  Animation: Animation,
  Key: Key,
  Node: Node,
  Skeleton: Skeleton
};
Animation.prototype.getDuration = function () {
  Debug.deprecated('pc.Animation#getDuration is deprecated. Use pc.Animation#duration instead.');
  return this.duration;
};
Animation.prototype.getName = function () {
  Debug.deprecated('pc.Animation#getName is deprecated. Use pc.Animation#name instead.');
  return this.name;
};
Animation.prototype.getNodes = function () {
  Debug.deprecated('pc.Animation#getNodes is deprecated. Use pc.Animation#nodes instead.');
  return this.nodes;
};
Animation.prototype.setDuration = function (duration) {
  Debug.deprecated('pc.Animation#setDuration is deprecated. Use pc.Animation#duration instead.');
  this.duration = duration;
};
Animation.prototype.setName = function (name) {
  Debug.deprecated('pc.Animation#setName is deprecated. Use pc.Animation#name instead.');
  this.name = name;
};
Skeleton.prototype.getAnimation = function () {
  Debug.deprecated('pc.Skeleton#getAnimation is deprecated. Use pc.Skeleton#animation instead.');
  return this.animation;
};
Skeleton.prototype.getCurrentTime = function () {
  Debug.deprecated('pc.Skeleton#getCurrentTime is deprecated. Use pc.Skeleton#currentTime instead.');
  return this.currentTime;
};
Skeleton.prototype.getLooping = function () {
  Debug.deprecated('pc.Skeleton#getLooping is deprecated. Use pc.Skeleton#looping instead.');
  return this.looping;
};
Skeleton.prototype.getNumNodes = function () {
  Debug.deprecated('pc.Skeleton#getNumNodes is deprecated. Use pc.Skeleton#numNodes instead.');
  return this.numNodes;
};
Skeleton.prototype.setAnimation = function (animation) {
  Debug.deprecated('pc.Skeleton#setAnimation is deprecated. Use pc.Skeleton#animation instead.');
  this.animation = animation;
};
Skeleton.prototype.setCurrentTime = function (time) {
  Debug.deprecated('pc.Skeleton#setCurrentTime is deprecated. Use pc.Skeleton#currentTime instead.');
  this.currentTime = time;
};
Skeleton.prototype.setLooping = function (looping) {
  Debug.deprecated('pc.Skeleton#setLooping is deprecated. Use pc.Skeleton#looping instead.');
  this.looping = looping;
};

// SOUND

const audio = {
  AudioManager: SoundManager,
  Channel: Channel,
  Channel3d: Channel3d,
  Listener: Listener,
  Sound: Sound
};
SoundManager.prototype.getListener = function () {
  Debug.deprecated('pc.SoundManager#getListener is deprecated. Use pc.SoundManager#listener instead.');
  return this.listener;
};
SoundManager.prototype.getVolume = function () {
  Debug.deprecated('pc.SoundManager#getVolume is deprecated. Use pc.SoundManager#volume instead.');
  return this.volume;
};
SoundManager.prototype.setVolume = function (volume) {
  Debug.deprecated('pc.SoundManager#setVolume is deprecated. Use pc.SoundManager#volume instead.');
  this.volume = volume;
};

// ASSET

const asset = {
  ASSET_ANIMATION: 'animation',
  ASSET_AUDIO: 'audio',
  ASSET_IMAGE: 'image',
  ASSET_JSON: 'json',
  ASSET_MODEL: 'model',
  ASSET_MATERIAL: 'material',
  ASSET_TEXT: 'text',
  ASSET_TEXTURE: 'texture',
  ASSET_CUBEMAP: 'cubemap',
  ASSET_SCRIPT: 'script'
};
AssetRegistry.prototype.getAssetById = function (id) {
  Debug.deprecated('pc.AssetRegistry#getAssetById is deprecated. Use pc.AssetRegistry#get instead.');
  return this.get(id);
};

// XR

Object.defineProperty(XrInputSource.prototype, 'ray', {
  get: function () {
    Debug.deprecated('pc.XrInputSource#ray is deprecated. Use pc.XrInputSource#getOrigin and pc.XrInputSource#getDirection instead.');
    return this._rayLocal;
  }
});
Object.defineProperty(XrInputSource.prototype, 'position', {
  get: function () {
    Debug.deprecated('pc.XrInputSource#position is deprecated. Use pc.XrInputSource#getLocalPosition instead.');
    return this._localPosition;
  }
});
Object.defineProperty(XrInputSource.prototype, 'rotation', {
  get: function () {
    Debug.deprecated('pc.XrInputSource#rotation is deprecated. Use pc.XrInputSource#getLocalRotation instead.');
    return this._localRotation;
  }
});

// INPUT

const input = {
  getTouchTargetCoords: getTouchTargetCoords,
  Controller: Controller,
  GamePads: GamePads,
  Keyboard: Keyboard,
  KeyboardEvent: KeyboardEvent,
  Mouse: Mouse,
  MouseEvent: MouseEvent,
  Touch: Touch,
  TouchDevice: TouchDevice,
  TouchEvent: TouchEvent
};
Object.defineProperty(ElementInput.prototype, 'wheel', {
  get: function () {
    return this.wheelDelta * -2;
  }
});
Object.defineProperty(MouseEvent.prototype, 'wheel', {
  get: function () {
    return this.wheelDelta * -2;
  }
});

// FRAMEWORK

const RIGIDBODY_TYPE_STATIC = BODYTYPE_STATIC;
const RIGIDBODY_TYPE_DYNAMIC = BODYTYPE_DYNAMIC;
const RIGIDBODY_TYPE_KINEMATIC = BODYTYPE_KINEMATIC;
const RIGIDBODY_CF_STATIC_OBJECT = BODYFLAG_STATIC_OBJECT;
const RIGIDBODY_CF_KINEMATIC_OBJECT = BODYFLAG_KINEMATIC_OBJECT;
const RIGIDBODY_CF_NORESPONSE_OBJECT = BODYFLAG_NORESPONSE_OBJECT;
const RIGIDBODY_ACTIVE_TAG = BODYSTATE_ACTIVE_TAG;
const RIGIDBODY_ISLAND_SLEEPING = BODYSTATE_ISLAND_SLEEPING;
const RIGIDBODY_WANTS_DEACTIVATION = BODYSTATE_WANTS_DEACTIVATION;
const RIGIDBODY_DISABLE_DEACTIVATION = BODYSTATE_DISABLE_DEACTIVATION;
const RIGIDBODY_DISABLE_SIMULATION = BODYSTATE_DISABLE_SIMULATION;
AppBase.prototype.isFullscreen = function () {
  Debug.deprecated('pc.AppBase#isFullscreen is deprecated. Use the Fullscreen API directly.');
  return !!document.fullscreenElement;
};
AppBase.prototype.enableFullscreen = function (element, success, error) {
  Debug.deprecated('pc.AppBase#enableFullscreen is deprecated. Use the Fullscreen API directly.');
  element = element || this.graphicsDevice.canvas;

  // success callback
  const s = function s() {
    success();
    document.removeEventListener('fullscreenchange', s);
  };

  // error callback
  const e = function e() {
    error();
    document.removeEventListener('fullscreenerror', e);
  };
  if (success) {
    document.addEventListener('fullscreenchange', s, false);
  }
  if (error) {
    document.addEventListener('fullscreenerror', e, false);
  }
  if (element.requestFullscreen) {
    element.requestFullscreen(Element.ALLOW_KEYBOARD_INPUT);
  } else {
    error();
  }
};
AppBase.prototype.disableFullscreen = function (success) {
  Debug.deprecated('pc.AppBase#disableFullscreen is deprecated. Use the Fullscreen API directly.');

  // success callback
  const s = function s() {
    success();
    document.removeEventListener('fullscreenchange', s);
  };
  if (success) {
    document.addEventListener('fullscreenchange', s, false);
  }
  document.exitFullscreen();
};
AppBase.prototype.getSceneUrl = function (name) {
  Debug.deprecated('pc.AppBase#getSceneUrl is deprecated. Use pc.AppBase#scenes and pc.SceneRegistry#find instead.');
  const entry = this.scenes.find(name);
  if (entry) {
    return entry.url;
  }
  return null;
};
AppBase.prototype.loadScene = function (url, callback) {
  Debug.deprecated('pc.AppBase#loadScene is deprecated. Use pc.AppBase#scenes and pc.SceneRegistry#loadScene instead.');
  this.scenes.loadScene(url, callback);
};
AppBase.prototype.loadSceneHierarchy = function (url, callback) {
  Debug.deprecated('pc.AppBase#loadSceneHierarchy is deprecated. Use pc.AppBase#scenes and pc.SceneRegistry#loadSceneHierarchy instead.');
  this.scenes.loadSceneHierarchy(url, callback);
};
AppBase.prototype.loadSceneSettings = function (url, callback) {
  Debug.deprecated('pc.AppBase#loadSceneSettings is deprecated. Use pc.AppBase#scenes and pc.SceneRegistry#loadSceneSettings instead.');
  this.scenes.loadSceneSettings(url, callback);
};
AppBase.prototype.renderMeshInstance = function (meshInstance, options) {
  Debug.deprecated('pc.AppBase.renderMeshInstance is deprecated. Use pc.AppBase.drawMeshInstance.');
  const layer = options != null && options.layer ? options.layer : this.scene.defaultDrawLayer;
  this.scene.immediate.drawMesh(null, null, null, meshInstance, layer);
};
AppBase.prototype.renderMesh = function (mesh, material, matrix, options) {
  Debug.deprecated('pc.AppBase.renderMesh is deprecated. Use pc.AppBase.drawMesh.');
  const layer = options != null && options.layer ? options.layer : this.scene.defaultDrawLayer;
  this.scene.immediate.drawMesh(material, matrix, mesh, null, layer);
};
AppBase.prototype._addLines = function (positions, colors, options) {
  const layer = options && options.layer ? options.layer : this.scene.layers.getLayerById(LAYERID_IMMEDIATE);
  const depthTest = options && options.depthTest !== undefined ? options.depthTest : true;
  const batch = this.scene.immediate.getBatch(layer, depthTest);
  batch.addLines(positions, colors);
};
AppBase.prototype.renderLine = function (start, end, color) {
  Debug.deprecated('pc.AppBase.renderLine is deprecated. Use pc.AppBase.drawLine.');
  let endColor = color;
  let options;
  const arg3 = arguments[3];
  const arg4 = arguments[4];
  if (arg3 instanceof Color) {
    // passed in end color
    endColor = arg3;
    if (typeof arg4 === 'number') {
      // compatibility: convert linebatch id into options
      if (arg4 === LINEBATCH_OVERLAY) {
        options = {
          layer: this.scene.layers.getLayerById(LAYERID_IMMEDIATE),
          depthTest: false
        };
      } else {
        options = {
          layer: this.scene.layers.getLayerById(LAYERID_IMMEDIATE),
          depthTest: true
        };
      }
    } else {
      // use passed in options
      options = arg4;
    }
  } else if (typeof arg3 === 'number') {
    endColor = color;

    // compatibility: convert linebatch id into options
    if (arg3 === LINEBATCH_OVERLAY) {
      options = {
        layer: this.scene.layers.getLayerById(LAYERID_IMMEDIATE),
        depthTest: false
      };
    } else {
      options = {
        layer: this.scene.layers.getLayerById(LAYERID_IMMEDIATE),
        depthTest: true
      };
    }
  } else if (arg3) {
    // options passed in
    options = arg3;
  }
  this._addLines([start, end], [color, endColor], options);
};
AppBase.prototype.renderLines = function (position, color, options) {
  Debug.deprecated('pc.AppBase.renderLines is deprecated. Use pc.AppBase.drawLines.');
  if (!options) {
    // default option
    options = {
      layer: this.scene.layers.getLayerById(LAYERID_IMMEDIATE),
      depthTest: true
    };
  } else if (typeof options === 'number') {
    // backwards compatibility, LINEBATCH_OVERLAY lines have depthtest disabled
    if (options === LINEBATCH_OVERLAY) {
      options = {
        layer: this.scene.layers.getLayerById(LAYERID_IMMEDIATE),
        depthTest: false
      };
    } else {
      options = {
        layer: this.scene.layers.getLayerById(LAYERID_IMMEDIATE),
        depthTest: true
      };
    }
  }
  const multiColor = !!color.length;
  if (multiColor) {
    if (position.length !== color.length) {
      console.error('renderLines: position/color arrays have different lengths');
      return;
    }
  }
  if (position.length % 2 !== 0) {
    console.error('renderLines: array length is not divisible by 2');
    return;
  }
  this._addLines(position, color, options);
};
AppBase.prototype.enableVr = function () {
  Debug.deprecated('pc.AppBase#enableVR is deprecated, and WebVR API is no longer supported.');
};
Object.defineProperty(CameraComponent.prototype, 'node', {
  get: function () {
    Debug.deprecated('pc.CameraComponent#node is deprecated. Use pc.CameraComponent#entity instead.');
    return this.entity;
  }
});
Object.defineProperty(LightComponent.prototype, 'enable', {
  get: function () {
    Debug.deprecated('pc.LightComponent#enable is deprecated. Use pc.LightComponent#enabled instead.');
    return this.enabled;
  },
  set: function (value) {
    Debug.deprecated('pc.LightComponent#enable is deprecated. Use pc.LightComponent#enabled instead.');
    this.enabled = value;
  }
});
ModelComponent.prototype.setVisible = function (visible) {
  Debug.deprecated('pc.ModelComponent#setVisible is deprecated. Use pc.ModelComponent#enabled instead.');
  this.enabled = visible;
};
Object.defineProperty(ModelComponent.prototype, 'aabb', {
  get: function () {
    Debug.deprecated('pc.ModelComponent#aabb is deprecated. Use pc.ModelComponent#customAabb instead - which expects local space AABB instead of a world space AABB.');
    return null;
  },
  set: function (type) {
    Debug.deprecated('pc.ModelComponent#aabb is deprecated. Use pc.ModelComponent#customAabb instead - which expects local space AABB instead of a world space AABB.');
  }
});
Object.defineProperty(RenderComponent.prototype, 'aabb', {
  get: function () {
    Debug.deprecated('pc.RenderComponent#aabb is deprecated. Use pc.RenderComponent#customAabb instead - which expects local space AABB instead of a world space AABB.');
    return null;
  },
  set: function (type) {
    Debug.deprecated('pc.RenderComponent#aabb is deprecated. Use pc.RenderComponent#customAabb instead - which expects local space AABB instead of a world space AABB.');
  }
});
Object.defineProperty(RigidBodyComponent.prototype, 'bodyType', {
  get: function () {
    Debug.deprecated('pc.RigidBodyComponent#bodyType is deprecated. Use pc.RigidBodyComponent#type instead.');
    return this.type;
  },
  set: function (type) {
    Debug.deprecated('pc.RigidBodyComponent#bodyType is deprecated. Use pc.RigidBodyComponent#type instead.');
    this.type = type;
  }
});
RigidBodyComponent.prototype.syncBodyToEntity = function () {
  Debug.deprecated('pc.RigidBodyComponent#syncBodyToEntity is not public API and should not be used.');
  this._updateDynamic();
};
RigidBodyComponentSystem.prototype.setGravity = function () {
  Debug.deprecated('pc.RigidBodyComponentSystem#setGravity is deprecated. Use pc.RigidBodyComponentSystem#gravity instead.');
  if (arguments.length === 1) {
    this.gravity.copy(arguments[0]);
  } else {
    this.gravity.set(arguments[0], arguments[1], arguments[2]);
  }
};
function basisSetDownloadConfig(glueUrl, wasmUrl, fallbackUrl) {
  Debug.deprecated('pc.basisSetDownloadConfig is deprecated. Use pc.basisInitialize instead.');
  basisInitialize({
    glueUrl: glueUrl,
    wasmUrl: wasmUrl,
    fallbackUrl: fallbackUrl,
    lazyInit: true
  });
}
function prefilterCubemap(options) {
  Debug.deprecated('pc.prefilterCubemap is deprecated. Use pc.envLighting instead.');
}

export { BLENDMODE_CONSTANT_ALPHA, BLENDMODE_CONSTANT_COLOR, BLENDMODE_ONE_MINUS_CONSTANT_ALPHA, BLENDMODE_ONE_MINUS_CONSTANT_COLOR, ContextCreationError, ELEMENTTYPE_FLOAT32, ELEMENTTYPE_INT16, ELEMENTTYPE_INT32, ELEMENTTYPE_INT8, ELEMENTTYPE_UINT16, ELEMENTTYPE_UINT32, ELEMENTTYPE_UINT8, LitOptions, PIXELFORMAT_L8_A8, PIXELFORMAT_R4_G4_B4_A4, PIXELFORMAT_R5_G5_B5_A1, PIXELFORMAT_R5_G6_B5, PIXELFORMAT_R8_G8_B8, PIXELFORMAT_R8_G8_B8_A8, PhongMaterial, RIGIDBODY_ACTIVE_TAG, RIGIDBODY_CF_KINEMATIC_OBJECT, RIGIDBODY_CF_NORESPONSE_OBJECT, RIGIDBODY_CF_STATIC_OBJECT, RIGIDBODY_DISABLE_DEACTIVATION, RIGIDBODY_DISABLE_SIMULATION, RIGIDBODY_ISLAND_SLEEPING, RIGIDBODY_TYPE_DYNAMIC, RIGIDBODY_TYPE_KINEMATIC, RIGIDBODY_TYPE_STATIC, RIGIDBODY_WANTS_DEACTIVATION, UnsupportedBrowserError, anim, asset, audio, basisSetDownloadConfig, createStyle, drawFullscreenQuad, gfx, inherits, input, log, makeArray, posteffect, prefilterCubemap, programlib, scene, shape, time };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVwcmVjYXRlZC5qcyIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL2RlcHJlY2F0ZWQvZGVwcmVjYXRlZC5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyByZXZpc2lvbiwgdmVyc2lvbiB9IGZyb20gJy4uL2NvcmUvY29yZS5qcyc7XG5pbXBvcnQgeyBzdHJpbmcgfSBmcm9tICcuLi9jb3JlL3N0cmluZy5qcyc7XG5pbXBvcnQgeyBub3cgfSBmcm9tICcuLi9jb3JlL3RpbWUuanMnO1xuaW1wb3J0IHsgRGVidWcgfSBmcm9tICcuLi9jb3JlL2RlYnVnLmpzJztcblxuaW1wb3J0IHsgbWF0aCB9IGZyb20gJy4uL2NvcmUvbWF0aC9tYXRoLmpzJztcbmltcG9ydCB7IENvbG9yIH0gZnJvbSAnLi4vY29yZS9tYXRoL2NvbG9yLmpzJztcbmltcG9ydCB7IE1hdDQgfSBmcm9tICcuLi9jb3JlL21hdGgvbWF0NC5qcyc7XG5pbXBvcnQgeyBWZWMyIH0gZnJvbSAnLi4vY29yZS9tYXRoL3ZlYzIuanMnO1xuaW1wb3J0IHsgVmVjMyB9IGZyb20gJy4uL2NvcmUvbWF0aC92ZWMzLmpzJztcbmltcG9ydCB7IFZlYzQgfSBmcm9tICcuLi9jb3JlL21hdGgvdmVjNC5qcyc7XG5cbmltcG9ydCB7IEJvdW5kaW5nQm94IH0gZnJvbSAnLi4vY29yZS9zaGFwZS9ib3VuZGluZy1ib3guanMnO1xuaW1wb3J0IHsgQm91bmRpbmdTcGhlcmUgfSBmcm9tICcuLi9jb3JlL3NoYXBlL2JvdW5kaW5nLXNwaGVyZS5qcyc7XG5pbXBvcnQgeyBGcnVzdHVtIH0gZnJvbSAnLi4vY29yZS9zaGFwZS9mcnVzdHVtLmpzJztcbmltcG9ydCB7IFBsYW5lIH0gZnJvbSAnLi4vY29yZS9zaGFwZS9wbGFuZS5qcyc7XG5cbmltcG9ydCB7XG4gICAgQUREUkVTU19DTEFNUF9UT19FREdFLCBBRERSRVNTX01JUlJPUkVEX1JFUEVBVCwgQUREUkVTU19SRVBFQVQsXG4gICAgQkxFTkRNT0RFX1pFUk8sIEJMRU5ETU9ERV9PTkUsIEJMRU5ETU9ERV9TUkNfQ09MT1IsIEJMRU5ETU9ERV9PTkVfTUlOVVNfU1JDX0NPTE9SLFxuICAgIEJMRU5ETU9ERV9EU1RfQ09MT1IsIEJMRU5ETU9ERV9PTkVfTUlOVVNfRFNUX0NPTE9SLCBCTEVORE1PREVfU1JDX0FMUEhBLCBCTEVORE1PREVfU1JDX0FMUEhBX1NBVFVSQVRFLFxuICAgIEJMRU5ETU9ERV9PTkVfTUlOVVNfU1JDX0FMUEhBLCBCTEVORE1PREVfRFNUX0FMUEhBLCBCTEVORE1PREVfT05FX01JTlVTX0RTVF9BTFBIQSxcbiAgICBCTEVORE1PREVfQ09OU1RBTlQsIEJMRU5ETU9ERV9PTkVfTUlOVVNfQ09OU1RBTlQsXG4gICAgQlVGRkVSX1NUQVRJQywgQlVGRkVSX0RZTkFNSUMsIEJVRkZFUl9TVFJFQU0sXG4gICAgQ1VMTEZBQ0VfTk9ORSwgQ1VMTEZBQ0VfQkFDSywgQ1VMTEZBQ0VfRlJPTlQsIENVTExGQUNFX0ZST05UQU5EQkFDSyxcbiAgICBGSUxURVJfTkVBUkVTVCwgRklMVEVSX0xJTkVBUiwgRklMVEVSX05FQVJFU1RfTUlQTUFQX05FQVJFU1QsIEZJTFRFUl9ORUFSRVNUX01JUE1BUF9MSU5FQVIsXG4gICAgRklMVEVSX0xJTkVBUl9NSVBNQVBfTkVBUkVTVCwgRklMVEVSX0xJTkVBUl9NSVBNQVBfTElORUFSLFxuICAgIElOREVYRk9STUFUX1VJTlQ4LCBJTkRFWEZPUk1BVF9VSU5UMTYsIElOREVYRk9STUFUX1VJTlQzMixcbiAgICBQSVhFTEZPUk1BVF9MQTgsIFBJWEVMRk9STUFUX1JHQjU2NSwgUElYRUxGT1JNQVRfUkdCQTU1NTEsIFBJWEVMRk9STUFUX1JHQkE0LCBQSVhFTEZPUk1BVF9SR0I4LCBQSVhFTEZPUk1BVF9SR0JBOCxcbiAgICBQUklNSVRJVkVfUE9JTlRTLCBQUklNSVRJVkVfTElORVMsIFBSSU1JVElWRV9MSU5FTE9PUCwgUFJJTUlUSVZFX0xJTkVTVFJJUCxcbiAgICBQUklNSVRJVkVfVFJJQU5HTEVTLCBQUklNSVRJVkVfVFJJU1RSSVAsIFBSSU1JVElWRV9UUklGQU4sXG4gICAgU0VNQU5USUNfUE9TSVRJT04sIFNFTUFOVElDX05PUk1BTCwgU0VNQU5USUNfQ09MT1IsIFNFTUFOVElDX1RFWENPT1JELCBTRU1BTlRJQ19URVhDT09SRDAsXG4gICAgU0VNQU5USUNfVEVYQ09PUkQxLCBTRU1BTlRJQ19BVFRSMCwgU0VNQU5USUNfQVRUUjEsIFNFTUFOVElDX0FUVFIyLCBTRU1BTlRJQ19BVFRSMyxcbiAgICBURVhUVVJFTE9DS19SRUFELCBURVhUVVJFTE9DS19XUklURSxcbiAgICBURVhUVVJFVFlQRV9ERUZBVUxULCBURVhUVVJFVFlQRV9SR0JNLCBURVhUVVJFVFlQRV9TV0laWkxFR0dHUixcbiAgICBUWVBFX0lOVDgsIFRZUEVfVUlOVDgsIFRZUEVfSU5UMTYsIFRZUEVfVUlOVDE2LCBUWVBFX0lOVDMyLCBUWVBFX1VJTlQzMiwgVFlQRV9GTE9BVDMyXG59IGZyb20gJy4uL3BsYXRmb3JtL2dyYXBoaWNzL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBTaGFkZXJHZW5lcmF0b3IgfSBmcm9tICcuLi9zY2VuZS9zaGFkZXItbGliL3Byb2dyYW1zL3NoYWRlci1nZW5lcmF0b3IuanMnO1xuaW1wb3J0IHsgZHJhd1F1YWRXaXRoU2hhZGVyIH0gZnJvbSAnLi4vc2NlbmUvZ3JhcGhpY3MvcXVhZC1yZW5kZXItdXRpbHMuanMnO1xuaW1wb3J0IHsgc2hhZGVyQ2h1bmtzIH0gZnJvbSAnLi4vc2NlbmUvc2hhZGVyLWxpYi9jaHVua3MvY2h1bmtzLmpzJztcbmltcG9ydCB7IEdyYXBoaWNzRGV2aWNlIH0gZnJvbSAnLi4vcGxhdGZvcm0vZ3JhcGhpY3MvZ3JhcGhpY3MtZGV2aWNlLmpzJztcbmltcG9ydCB7IEluZGV4QnVmZmVyIH0gZnJvbSAnLi4vcGxhdGZvcm0vZ3JhcGhpY3MvaW5kZXgtYnVmZmVyLmpzJztcbmltcG9ydCB7IExheWVyQ29tcG9zaXRpb24gfSBmcm9tICcuLi9zY2VuZS9jb21wb3NpdGlvbi9sYXllci1jb21wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBQb3N0RWZmZWN0IH0gZnJvbSAnLi4vc2NlbmUvZ3JhcGhpY3MvcG9zdC1lZmZlY3QuanMnO1xuaW1wb3J0IHsgUG9zdEVmZmVjdFF1ZXVlIH0gZnJvbSAnLi4vZnJhbWV3b3JrL2NvbXBvbmVudHMvY2FtZXJhL3Bvc3QtZWZmZWN0LXF1ZXVlLmpzJztcbmltcG9ydCB7IFByb2dyYW1MaWJyYXJ5IH0gZnJvbSAnLi4vc2NlbmUvc2hhZGVyLWxpYi9wcm9ncmFtLWxpYnJhcnkuanMnO1xuaW1wb3J0IHsgZ2V0UHJvZ3JhbUxpYnJhcnksIHNldFByb2dyYW1MaWJyYXJ5IH0gZnJvbSAnLi4vc2NlbmUvc2hhZGVyLWxpYi9nZXQtcHJvZ3JhbS1saWJyYXJ5LmpzJztcbmltcG9ydCB7IFJlbmRlclRhcmdldCB9IGZyb20gJy4uL3BsYXRmb3JtL2dyYXBoaWNzL3JlbmRlci10YXJnZXQuanMnO1xuaW1wb3J0IHsgU2NvcGVJZCB9IGZyb20gJy4uL3BsYXRmb3JtL2dyYXBoaWNzL3Njb3BlLWlkLmpzJztcbmltcG9ydCB7IFNoYWRlciB9IGZyb20gJy4uL3BsYXRmb3JtL2dyYXBoaWNzL3NoYWRlci5qcyc7XG5pbXBvcnQgeyBXZWJnbFNoYWRlcklucHV0IH0gZnJvbSAnLi4vcGxhdGZvcm0vZ3JhcGhpY3Mvd2ViZ2wvd2ViZ2wtc2hhZGVyLWlucHV0LmpzJztcbmltcG9ydCB7IFRleHR1cmUgfSBmcm9tICcuLi9wbGF0Zm9ybS9ncmFwaGljcy90ZXh0dXJlLmpzJztcbmltcG9ydCB7IFZlcnRleEJ1ZmZlciB9IGZyb20gJy4uL3BsYXRmb3JtL2dyYXBoaWNzL3ZlcnRleC1idWZmZXIuanMnO1xuaW1wb3J0IHsgVmVydGV4Rm9ybWF0IH0gZnJvbSAnLi4vcGxhdGZvcm0vZ3JhcGhpY3MvdmVydGV4LWZvcm1hdC5qcyc7XG5pbXBvcnQgeyBWZXJ0ZXhJdGVyYXRvciB9IGZyb20gJy4uL3BsYXRmb3JtL2dyYXBoaWNzL3ZlcnRleC1pdGVyYXRvci5qcyc7XG5pbXBvcnQgeyBTaGFkZXJVdGlscyB9IGZyb20gJy4uL3BsYXRmb3JtL2dyYXBoaWNzL3NoYWRlci11dGlscy5qcyc7XG5pbXBvcnQgeyBHcmFwaGljc0RldmljZUFjY2VzcyB9IGZyb20gJy4uL3BsYXRmb3JtL2dyYXBoaWNzL2dyYXBoaWNzLWRldmljZS1hY2Nlc3MuanMnO1xuaW1wb3J0IHsgQmxlbmRTdGF0ZSB9IGZyb20gJy4uL3BsYXRmb3JtL2dyYXBoaWNzL2JsZW5kLXN0YXRlLmpzJztcbmltcG9ydCB7IERlcHRoU3RhdGUgfSBmcm9tICcuLi9wbGF0Zm9ybS9ncmFwaGljcy9kZXB0aC1zdGF0ZS5qcyc7XG5cbmltcG9ydCB7IFBST0pFQ1RJT05fT1JUSE9HUkFQSElDLCBQUk9KRUNUSU9OX1BFUlNQRUNUSVZFLCBMQVlFUklEX0lNTUVESUFURSwgTElORUJBVENIX09WRVJMQVksIExBWUVSSURfV09STEQgfSBmcm9tICcuLi9zY2VuZS9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgY2FsY3VsYXRlVGFuZ2VudHMsIGNyZWF0ZUJveCwgY3JlYXRlQ2Fwc3VsZSwgY3JlYXRlQ29uZSwgY3JlYXRlQ3lsaW5kZXIsIGNyZWF0ZU1lc2gsIGNyZWF0ZVBsYW5lLCBjcmVhdGVTcGhlcmUsIGNyZWF0ZVRvcnVzIH0gZnJvbSAnLi4vc2NlbmUvcHJvY2VkdXJhbC5qcyc7XG5pbXBvcnQgeyBwYXJ0aXRpb25Ta2luIH0gZnJvbSAnLi4vc2NlbmUvc2tpbi1wYXJ0aXRpb24uanMnO1xuaW1wb3J0IHsgQmFzaWNNYXRlcmlhbCB9IGZyb20gJy4uL3NjZW5lL21hdGVyaWFscy9iYXNpYy1tYXRlcmlhbC5qcyc7XG5pbXBvcnQgeyBGb3J3YXJkUmVuZGVyZXIgfSBmcm9tICcuLi9zY2VuZS9yZW5kZXJlci9mb3J3YXJkLXJlbmRlcmVyLmpzJztcbmltcG9ydCB7IEdyYXBoTm9kZSB9IGZyb20gJy4uL3NjZW5lL2dyYXBoLW5vZGUuanMnO1xuaW1wb3J0IHsgTWF0ZXJpYWwgfSBmcm9tICcuLi9zY2VuZS9tYXRlcmlhbHMvbWF0ZXJpYWwuanMnO1xuaW1wb3J0IHsgTWVzaCB9IGZyb20gJy4uL3NjZW5lL21lc2guanMnO1xuaW1wb3J0IHsgTW9ycGggfSBmcm9tICcuLi9zY2VuZS9tb3JwaC5qcyc7XG5pbXBvcnQgeyBNZXNoSW5zdGFuY2UgfSBmcm9tICcuLi9zY2VuZS9tZXNoLWluc3RhbmNlLmpzJztcbmltcG9ydCB7IE1vZGVsIH0gZnJvbSAnLi4vc2NlbmUvbW9kZWwuanMnO1xuaW1wb3J0IHsgUGFydGljbGVFbWl0dGVyIH0gZnJvbSAnLi4vc2NlbmUvcGFydGljbGUtc3lzdGVtL3BhcnRpY2xlLWVtaXR0ZXIuanMnO1xuaW1wb3J0IHsgUGlja2VyIH0gZnJvbSAnLi4vZnJhbWV3b3JrL2dyYXBoaWNzL3BpY2tlci5qcyc7XG5pbXBvcnQgeyBTY2VuZSB9IGZyb20gJy4uL3NjZW5lL3NjZW5lLmpzJztcbmltcG9ydCB7IFNraW4gfSBmcm9tICcuLi9zY2VuZS9za2luLmpzJztcbmltcG9ydCB7IFNraW5JbnN0YW5jZSB9IGZyb20gJy4uL3NjZW5lL3NraW4taW5zdGFuY2UuanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRNYXRlcmlhbCB9IGZyb20gJy4uL3NjZW5lL21hdGVyaWFscy9zdGFuZGFyZC1tYXRlcmlhbC5qcyc7XG5pbXBvcnQgeyBCYXRjaCB9IGZyb20gJy4uL3NjZW5lL2JhdGNoaW5nL2JhdGNoLmpzJztcbmltcG9ydCB7IGdldERlZmF1bHRNYXRlcmlhbCB9IGZyb20gJy4uL3NjZW5lL21hdGVyaWFscy9kZWZhdWx0LW1hdGVyaWFsLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkTWF0ZXJpYWxPcHRpb25zIH0gZnJvbSAnLi4vc2NlbmUvbWF0ZXJpYWxzL3N0YW5kYXJkLW1hdGVyaWFsLW9wdGlvbnMuanMnO1xuaW1wb3J0IHsgTGl0U2hhZGVyT3B0aW9ucyB9IGZyb20gJy4uL3NjZW5lL3NoYWRlci1saWIvcHJvZ3JhbXMvbGl0LXNoYWRlci1vcHRpb25zLmpzJztcbmltcG9ydCB7IExheWVyIH0gZnJvbSAnLi4vc2NlbmUvbGF5ZXIuanMnO1xuXG5pbXBvcnQgeyBBbmltYXRpb24sIEtleSwgTm9kZSB9IGZyb20gJy4uL3NjZW5lL2FuaW1hdGlvbi9hbmltYXRpb24uanMnO1xuaW1wb3J0IHsgU2tlbGV0b24gfSBmcm9tICcuLi9zY2VuZS9hbmltYXRpb24vc2tlbGV0b24uanMnO1xuXG5pbXBvcnQgeyBDaGFubmVsIH0gZnJvbSAnLi4vcGxhdGZvcm0vYXVkaW8vY2hhbm5lbC5qcyc7XG5pbXBvcnQgeyBDaGFubmVsM2QgfSBmcm9tICcuLi9wbGF0Zm9ybS9hdWRpby9jaGFubmVsM2QuanMnO1xuaW1wb3J0IHsgTGlzdGVuZXIgfSBmcm9tICcuLi9wbGF0Zm9ybS9zb3VuZC9saXN0ZW5lci5qcyc7XG5pbXBvcnQgeyBTb3VuZCB9IGZyb20gJy4uL3BsYXRmb3JtL3NvdW5kL3NvdW5kLmpzJztcbmltcG9ydCB7IFNvdW5kTWFuYWdlciB9IGZyb20gJy4uL3BsYXRmb3JtL3NvdW5kL21hbmFnZXIuanMnO1xuXG5pbXBvcnQgeyBBc3NldFJlZ2lzdHJ5IH0gZnJvbSAnLi4vZnJhbWV3b3JrL2Fzc2V0L2Fzc2V0LXJlZ2lzdHJ5LmpzJztcblxuaW1wb3J0IHsgWHJJbnB1dFNvdXJjZSB9IGZyb20gJy4uL2ZyYW1ld29yay94ci94ci1pbnB1dC1zb3VyY2UuanMnO1xuXG5pbXBvcnQgeyBDb250cm9sbGVyIH0gZnJvbSAnLi4vcGxhdGZvcm0vaW5wdXQvY29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBFbGVtZW50SW5wdXQgfSBmcm9tICcuLi9mcmFtZXdvcmsvaW5wdXQvZWxlbWVudC1pbnB1dC5qcyc7XG5pbXBvcnQgeyBHYW1lUGFkcyB9IGZyb20gJy4uL3BsYXRmb3JtL2lucHV0L2dhbWUtcGFkcy5qcyc7XG5pbXBvcnQgeyBLZXlib2FyZCB9IGZyb20gJy4uL3BsYXRmb3JtL2lucHV0L2tleWJvYXJkLmpzJztcbmltcG9ydCB7IEtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi9wbGF0Zm9ybS9pbnB1dC9rZXlib2FyZC1ldmVudC5qcyc7XG5pbXBvcnQgeyBNb3VzZSB9IGZyb20gJy4uL3BsYXRmb3JtL2lucHV0L21vdXNlLmpzJztcbmltcG9ydCB7IE1vdXNlRXZlbnQgfSBmcm9tICcuLi9wbGF0Zm9ybS9pbnB1dC9tb3VzZS1ldmVudC5qcyc7XG5pbXBvcnQgeyBUb3VjaERldmljZSB9IGZyb20gJy4uL3BsYXRmb3JtL2lucHV0L3RvdWNoLWRldmljZS5qcyc7XG5pbXBvcnQgeyBnZXRUb3VjaFRhcmdldENvb3JkcywgVG91Y2gsIFRvdWNoRXZlbnQgfSBmcm9tICcuLi9wbGF0Zm9ybS9pbnB1dC90b3VjaC1ldmVudC5qcyc7XG5cbmltcG9ydCB7IEFwcEJhc2UgfSBmcm9tICcuLi9mcmFtZXdvcmsvYXBwLWJhc2UuanMnO1xuaW1wb3J0IHsgZ2V0QXBwbGljYXRpb24gfSBmcm9tICcuLi9mcmFtZXdvcmsvZ2xvYmFscy5qcyc7XG5pbXBvcnQgeyBDYW1lcmFDb21wb25lbnQgfSBmcm9tICcuLi9mcmFtZXdvcmsvY29tcG9uZW50cy9jYW1lcmEvY29tcG9uZW50LmpzJztcbmltcG9ydCB7IExpZ2h0Q29tcG9uZW50IH0gZnJvbSAnLi4vZnJhbWV3b3JrL2NvbXBvbmVudHMvbGlnaHQvY29tcG9uZW50LmpzJztcbmltcG9ydCB7IE1vZGVsQ29tcG9uZW50IH0gZnJvbSAnLi4vZnJhbWV3b3JrL2NvbXBvbmVudHMvbW9kZWwvY29tcG9uZW50LmpzJztcbmltcG9ydCB7IFJlbmRlckNvbXBvbmVudCB9IGZyb20gJy4uL2ZyYW1ld29yay9jb21wb25lbnRzL3JlbmRlci9jb21wb25lbnQuanMnO1xuaW1wb3J0IHtcbiAgICBCT0RZRkxBR19LSU5FTUFUSUNfT0JKRUNULCBCT0RZRkxBR19OT1JFU1BPTlNFX09CSkVDVCwgQk9EWUZMQUdfU1RBVElDX09CSkVDVCxcbiAgICBCT0RZU1RBVEVfQUNUSVZFX1RBRywgQk9EWVNUQVRFX0RJU0FCTEVfREVBQ1RJVkFUSU9OLCBCT0RZU1RBVEVfRElTQUJMRV9TSU1VTEFUSU9OLCBCT0RZU1RBVEVfSVNMQU5EX1NMRUVQSU5HLCBCT0RZU1RBVEVfV0FOVFNfREVBQ1RJVkFUSU9OLFxuICAgIEJPRFlUWVBFX0RZTkFNSUMsIEJPRFlUWVBFX0tJTkVNQVRJQywgQk9EWVRZUEVfU1RBVElDXG59IGZyb20gJy4uL2ZyYW1ld29yay9jb21wb25lbnRzL3JpZ2lkLWJvZHkvY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IFJpZ2lkQm9keUNvbXBvbmVudCB9IGZyb20gJy4uL2ZyYW1ld29yay9jb21wb25lbnRzL3JpZ2lkLWJvZHkvY29tcG9uZW50LmpzJztcbmltcG9ydCB7IFJpZ2lkQm9keUNvbXBvbmVudFN5c3RlbSB9IGZyb20gJy4uL2ZyYW1ld29yay9jb21wb25lbnRzL3JpZ2lkLWJvZHkvc3lzdGVtLmpzJztcbmltcG9ydCB7IGJhc2lzSW5pdGlhbGl6ZSB9IGZyb20gJy4uL2ZyYW1ld29yay9oYW5kbGVycy9iYXNpcy5qcyc7XG5pbXBvcnQgeyBMaXRTaGFkZXIgfSBmcm9tICcuLi9zY2VuZS9zaGFkZXItbGliL3Byb2dyYW1zL2xpdC1zaGFkZXIuanMnO1xuXG4vLyBDT1JFXG5cbmV4cG9ydCBjb25zdCBsb2cgPSB7XG4gICAgd3JpdGU6IGZ1bmN0aW9uICh0ZXh0KSB7XG4gICAgICAgIERlYnVnLmRlcHJlY2F0ZWQoJ3BjLmxvZy53cml0ZSBpcyBkZXByZWNhdGVkLiBVc2UgY29uc29sZS5sb2cgaW5zdGVhZC4nKTtcbiAgICAgICAgY29uc29sZS5sb2codGV4dCk7XG4gICAgfSxcblxuICAgIG9wZW46IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgRGVidWcuZGVwcmVjYXRlZCgncGMubG9nLm9wZW4gaXMgZGVwcmVjYXRlZC4gVXNlIGNvbnNvbGUubG9nIGluc3RlYWQuJyk7XG4gICAgICAgIGxvZy53cml0ZSgnUG93ZXJlZCBieSBQbGF5Q2FudmFzICcgKyB2ZXJzaW9uICsgJyAnICsgcmV2aXNpb24pO1xuICAgIH0sXG5cbiAgICBpbmZvOiBmdW5jdGlvbiAodGV4dCkge1xuICAgICAgICBEZWJ1Zy5kZXByZWNhdGVkKCdwYy5sb2cuaW5mbyBpcyBkZXByZWNhdGVkLiBVc2UgY29uc29sZS5pbmZvIGluc3RlYWQuJyk7XG4gICAgICAgIGNvbnNvbGUuaW5mbygnSU5GTzogICAgJyArIHRleHQpO1xuICAgIH0sXG5cbiAgICBkZWJ1ZzogZnVuY3Rpb24gKHRleHQpIHtcbiAgICAgICAgRGVidWcuZGVwcmVjYXRlZCgncGMubG9nLmRlYnVnIGlzIGRlcHJlY2F0ZWQuIFVzZSBjb25zb2xlLmRlYnVnIGluc3RlYWQuJyk7XG4gICAgICAgIGNvbnNvbGUuZGVidWcoJ0RFQlVHOiAgICcgKyB0ZXh0KTtcbiAgICB9LFxuXG4gICAgZXJyb3I6IGZ1bmN0aW9uICh0ZXh0KSB7XG4gICAgICAgIERlYnVnLmRlcHJlY2F0ZWQoJ3BjLmxvZy5lcnJvciBpcyBkZXByZWNhdGVkLiBVc2UgY29uc29sZS5lcnJvciBpbnN0ZWFkLicpO1xuICAgICAgICBjb25zb2xlLmVycm9yKCdFUlJPUjogICAnICsgdGV4dCk7XG4gICAgfSxcblxuICAgIHdhcm5pbmc6IGZ1bmN0aW9uICh0ZXh0KSB7XG4gICAgICAgIERlYnVnLmRlcHJlY2F0ZWQoJ3BjLmxvZy53YXJuaW5nIGlzIGRlcHJlY2F0ZWQuIFVzZSBjb25zb2xlLndhcm4gaW5zdGVhZC4nKTtcbiAgICAgICAgY29uc29sZS53YXJuKCdXQVJOSU5HOiAnICsgdGV4dCk7XG4gICAgfSxcblxuICAgIGFsZXJ0OiBmdW5jdGlvbiAodGV4dCkge1xuICAgICAgICBEZWJ1Zy5kZXByZWNhdGVkKCdwYy5sb2cuYWxlcnQgaXMgZGVwcmVjYXRlZC4gVXNlIGFsZXJ0IGluc3RlYWQuJyk7XG4gICAgICAgIGxvZy53cml0ZSgnQUxFUlQ6ICAgJyArIHRleHQpO1xuICAgICAgICBhbGVydCh0ZXh0KTsgLy8gZXNsaW50LWRpc2FibGUtbGluZSBuby1hbGVydFxuICAgIH0sXG5cbiAgICBhc3NlcnQ6IGZ1bmN0aW9uIChjb25kaXRpb24sIHRleHQpIHtcbiAgICAgICAgRGVidWcuZGVwcmVjYXRlZCgncGMubG9nLmFzc2VydCBpcyBkZXByZWNhdGVkLiBVc2UgYSBjb25kaXRpb25hbCBwbHVzIGNvbnNvbGUubG9nIGluc3RlYWQuJyk7XG4gICAgICAgIGlmIChjb25kaXRpb24gPT09IGZhbHNlKSB7XG4gICAgICAgICAgICBsb2cud3JpdGUoJ0FTU0VSVDogICcgKyB0ZXh0KTtcbiAgICAgICAgfVxuICAgIH1cbn07XG5cbnN0cmluZy5lbmRzV2l0aCA9IGZ1bmN0aW9uIChzLCBzdWJzKSB7XG4gICAgRGVidWcuZGVwcmVjYXRlZCgncGMuc3RyaW5nLmVuZHNXaXRoIGlzIGRlcHJlY2F0ZWQuIFVzZSBTdHJpbmcjZW5kc1dpdGggaW5zdGVhZC4nKTtcbiAgICByZXR1cm4gcy5lbmRzV2l0aChzdWJzKTtcbn07XG5cbnN0cmluZy5zdGFydHNXaXRoID0gZnVuY3Rpb24gKHMsIHN1YnMpIHtcbiAgICBEZWJ1Zy5kZXByZWNhdGVkKCdwYy5zdHJpbmcuc3RhcnRzV2l0aCBpcyBkZXByZWNhdGVkLiBVc2UgU3RyaW5nI3N0YXJ0c1dpdGggaW5zdGVhZC4nKTtcbiAgICByZXR1cm4gcy5zdGFydHNXaXRoKHN1YnMpO1xufTtcblxuY2xhc3MgVGltZXIge1xuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICB0aGlzLl9pc1J1bm5pbmcgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fYSA9IDA7XG4gICAgICAgIHRoaXMuX2IgPSAwO1xuICAgIH1cblxuICAgIHN0YXJ0KCkge1xuICAgICAgICB0aGlzLl9pc1J1bm5pbmcgPSB0cnVlO1xuICAgICAgICB0aGlzLl9hID0gbm93KCk7XG4gICAgfVxuXG4gICAgc3RvcCgpIHtcbiAgICAgICAgdGhpcy5faXNSdW5uaW5nID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX2IgPSBub3coKTtcbiAgICB9XG5cbiAgICBnZXRNaWxsaXNlY29uZHMoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9iIC0gdGhpcy5fYTtcbiAgICB9XG59XG5cbmV4cG9ydCBjb25zdCB0aW1lID0ge1xuICAgIG5vdzogbm93LFxuICAgIFRpbWVyOiBUaW1lclxufTtcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KENvbG9yLnByb3RvdHlwZSwgJ2RhdGEnLCB7XG4gICAgZ2V0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIERlYnVnLmRlcHJlY2F0ZWQoJ3BjLkNvbG9yI2RhdGEgaXMgbm90IHB1YmxpYyBBUEkgYW5kIHNob3VsZCBub3QgYmUgdXNlZC4gQWNjZXNzIGNvbG9yIGNvbXBvbmVudHMgdmlhIHRoZWlyIGluZGl2aWR1YWwgcHJvcGVydGllcy4nKTtcbiAgICAgICAgaWYgKCF0aGlzLl9kYXRhKSB7XG4gICAgICAgICAgICB0aGlzLl9kYXRhID0gbmV3IEZsb2F0MzJBcnJheSg0KTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLl9kYXRhWzBdID0gdGhpcy5yO1xuICAgICAgICB0aGlzLl9kYXRhWzFdID0gdGhpcy5nO1xuICAgICAgICB0aGlzLl9kYXRhWzJdID0gdGhpcy5iO1xuICAgICAgICB0aGlzLl9kYXRhWzNdID0gdGhpcy5hO1xuICAgICAgICByZXR1cm4gdGhpcy5fZGF0YTtcbiAgICB9XG59KTtcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KENvbG9yLnByb3RvdHlwZSwgJ2RhdGEzJywge1xuICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICBEZWJ1Zy5kZXByZWNhdGVkKCdwYy5Db2xvciNkYXRhMyBpcyBub3QgcHVibGljIEFQSSBhbmQgc2hvdWxkIG5vdCBiZSB1c2VkLiBBY2Nlc3MgY29sb3IgY29tcG9uZW50cyB2aWEgdGhlaXIgaW5kaXZpZHVhbCBwcm9wZXJ0aWVzLicpO1xuICAgICAgICBpZiAoIXRoaXMuX2RhdGEzKSB7XG4gICAgICAgICAgICB0aGlzLl9kYXRhMyA9IG5ldyBGbG9hdDMyQXJyYXkoMyk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5fZGF0YTNbMF0gPSB0aGlzLnI7XG4gICAgICAgIHRoaXMuX2RhdGEzWzFdID0gdGhpcy5nO1xuICAgICAgICB0aGlzLl9kYXRhM1syXSA9IHRoaXMuYjtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2RhdGEzO1xuICAgIH1cbn0pO1xuXG5leHBvcnQgZnVuY3Rpb24gaW5oZXJpdHMoU2VsZiwgU3VwZXIpIHtcbiAgICBjb25zdCBUZW1wID0gZnVuY3Rpb24gKCkge307XG4gICAgY29uc3QgRnVuYyA9IGZ1bmN0aW9uIChhcmcxLCBhcmcyLCBhcmczLCBhcmc0LCBhcmc1LCBhcmc2LCBhcmc3LCBhcmc4KSB7XG4gICAgICAgIFN1cGVyLmNhbGwodGhpcywgYXJnMSwgYXJnMiwgYXJnMywgYXJnNCwgYXJnNSwgYXJnNiwgYXJnNywgYXJnOCk7XG4gICAgICAgIFNlbGYuY2FsbCh0aGlzLCBhcmcxLCBhcmcyLCBhcmczLCBhcmc0LCBhcmc1LCBhcmc2LCBhcmc3LCBhcmc4KTtcbiAgICAgICAgLy8gdGhpcy5jb25zdHJ1Y3RvciA9IFNlbGY7XG4gICAgfTtcbiAgICBGdW5jLl9zdXBlciA9IFN1cGVyLnByb3RvdHlwZTtcbiAgICBUZW1wLnByb3RvdHlwZSA9IFN1cGVyLnByb3RvdHlwZTtcbiAgICBGdW5jLnByb3RvdHlwZSA9IG5ldyBUZW1wKCk7XG5cbiAgICByZXR1cm4gRnVuYztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1ha2VBcnJheShhcnIpIHtcbiAgICBEZWJ1Zy5kZXByZWNhdGVkKCdwYy5tYWtlQXJyYXkgaXMgbm90IHB1YmxpYyBBUEkgYW5kIHNob3VsZCBub3QgYmUgdXNlZC4gVXNlIEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsIGluc3RlYWQuJyk7XG4gICAgcmV0dXJuIEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFycik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVTdHlsZShjc3NTdHJpbmcpIHtcbiAgICBjb25zdCByZXN1bHQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzdHlsZScpO1xuICAgIHJlc3VsdC50eXBlID0gJ3RleHQvY3NzJztcbiAgICBpZiAocmVzdWx0LnN0eWxlU2hlZXQpIHtcbiAgICAgICAgcmVzdWx0LnN0eWxlU2hlZXQuY3NzVGV4dCA9IGNzc1N0cmluZztcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXN1bHQuYXBwZW5kQ2hpbGQoZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoY3NzU3RyaW5nKSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlc3VsdDtcbn1cblxuLy8gTUFUSFxuXG5tYXRoLklOVl9MT0cyID0gTWF0aC5MT0cyRTtcblxubWF0aC5pbnRUb0J5dGVzID0gbWF0aC5pbnRUb0J5dGVzMzI7XG5tYXRoLmJ5dGVzVG9JbnQgPSBtYXRoLmJ5dGVzVG9JbnQzMjtcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KFZlYzIucHJvdG90eXBlLCAnZGF0YScsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgRGVidWcuZGVwcmVjYXRlZCgncGMuVmVjMiNkYXRhIGlzIG5vdCBwdWJsaWMgQVBJIGFuZCBzaG91bGQgbm90IGJlIHVzZWQuIEFjY2VzcyB2ZWN0b3IgY29tcG9uZW50cyB2aWEgdGhlaXIgaW5kaXZpZHVhbCBwcm9wZXJ0aWVzLicpO1xuICAgICAgICBpZiAoIXRoaXMuX2RhdGEpIHtcbiAgICAgICAgICAgIHRoaXMuX2RhdGEgPSBuZXcgRmxvYXQzMkFycmF5KDIpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuX2RhdGFbMF0gPSB0aGlzLng7XG4gICAgICAgIHRoaXMuX2RhdGFbMV0gPSB0aGlzLnk7XG4gICAgICAgIHJldHVybiB0aGlzLl9kYXRhO1xuICAgIH1cbn0pO1xuXG5WZWMyLnByb3RvdHlwZS5zY2FsZSA9IFZlYzIucHJvdG90eXBlLm11bFNjYWxhcjtcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KFZlYzMucHJvdG90eXBlLCAnZGF0YScsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgRGVidWcuZGVwcmVjYXRlZCgncGMuVmVjMyNkYXRhIGlzIG5vdCBwdWJsaWMgQVBJIGFuZCBzaG91bGQgbm90IGJlIHVzZWQuIEFjY2VzcyB2ZWN0b3IgY29tcG9uZW50cyB2aWEgdGhlaXIgaW5kaXZpZHVhbCBwcm9wZXJ0aWVzLicpO1xuICAgICAgICBpZiAoIXRoaXMuX2RhdGEpIHtcbiAgICAgICAgICAgIHRoaXMuX2RhdGEgPSBuZXcgRmxvYXQzMkFycmF5KDMpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuX2RhdGFbMF0gPSB0aGlzLng7XG4gICAgICAgIHRoaXMuX2RhdGFbMV0gPSB0aGlzLnk7XG4gICAgICAgIHRoaXMuX2RhdGFbMl0gPSB0aGlzLno7XG4gICAgICAgIHJldHVybiB0aGlzLl9kYXRhO1xuICAgIH1cbn0pO1xuXG5WZWMzLnByb3RvdHlwZS5zY2FsZSA9IFZlYzMucHJvdG90eXBlLm11bFNjYWxhcjtcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KFZlYzQucHJvdG90eXBlLCAnZGF0YScsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgRGVidWcuZGVwcmVjYXRlZCgncGMuVmVjNCNkYXRhIGlzIG5vdCBwdWJsaWMgQVBJIGFuZCBzaG91bGQgbm90IGJlIHVzZWQuIEFjY2VzcyB2ZWN0b3IgY29tcG9uZW50cyB2aWEgdGhlaXIgaW5kaXZpZHVhbCBwcm9wZXJ0aWVzLicpO1xuICAgICAgICBpZiAoIXRoaXMuX2RhdGEpIHtcbiAgICAgICAgICAgIHRoaXMuX2RhdGEgPSBuZXcgRmxvYXQzMkFycmF5KDQpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuX2RhdGFbMF0gPSB0aGlzLng7XG4gICAgICAgIHRoaXMuX2RhdGFbMV0gPSB0aGlzLnk7XG4gICAgICAgIHRoaXMuX2RhdGFbMl0gPSB0aGlzLno7XG4gICAgICAgIHRoaXMuX2RhdGFbM10gPSB0aGlzLnc7XG4gICAgICAgIHJldHVybiB0aGlzLl9kYXRhO1xuICAgIH1cbn0pO1xuXG5WZWM0LnByb3RvdHlwZS5zY2FsZSA9IFZlYzQucHJvdG90eXBlLm11bFNjYWxhcjtcblxuLy8gU0hBUEVcblxuZXhwb3J0IGNvbnN0IHNoYXBlID0ge1xuICAgIEFhYmI6IEJvdW5kaW5nQm94LFxuICAgIFNwaGVyZTogQm91bmRpbmdTcGhlcmUsXG4gICAgUGxhbmU6IFBsYW5lXG59O1xuXG5Cb3VuZGluZ1NwaGVyZS5wcm90b3R5cGUuaW50ZXJzZWN0UmF5ID0gQm91bmRpbmdTcGhlcmUucHJvdG90eXBlLmludGVyc2VjdHNSYXk7XG5cbkZydXN0dW0ucHJvdG90eXBlLnVwZGF0ZSA9IGZ1bmN0aW9uIChwcm9qZWN0aW9uTWF0cml4LCB2aWV3TWF0cml4KSB7XG4gICAgRGVidWcuZGVwcmVjYXRlZCgncGMuRnJ1c3R1bSN1cGRhdGUgaXMgZGVwcmVjYXRlZC4gVXNlIHBjLkZydXN0dW0jc2V0RnJvbU1hdDQgaW5zdGVhZC4nKTtcblxuICAgIGNvbnN0IHZpZXdQcm9qID0gbmV3IE1hdDQoKTtcblxuICAgIHZpZXdQcm9qLm11bDIocHJvamVjdGlvbk1hdHJpeCwgdmlld01hdHJpeCk7XG5cbiAgICB0aGlzLnNldEZyb21NYXQ0KHZpZXdQcm9qKTtcbn07XG5cbi8vIEdSQVBISUNTXG5cbmV4cG9ydCBjb25zdCBFTEVNRU5UVFlQRV9JTlQ4ID0gVFlQRV9JTlQ4O1xuZXhwb3J0IGNvbnN0IEVMRU1FTlRUWVBFX1VJTlQ4ID0gVFlQRV9VSU5UODtcbmV4cG9ydCBjb25zdCBFTEVNRU5UVFlQRV9JTlQxNiA9IFRZUEVfSU5UMTY7XG5leHBvcnQgY29uc3QgRUxFTUVOVFRZUEVfVUlOVDE2ID0gVFlQRV9VSU5UMTY7XG5leHBvcnQgY29uc3QgRUxFTUVOVFRZUEVfSU5UMzIgPSBUWVBFX0lOVDMyO1xuZXhwb3J0IGNvbnN0IEVMRU1FTlRUWVBFX1VJTlQzMiA9IFRZUEVfVUlOVDMyO1xuZXhwb3J0IGNvbnN0IEVMRU1FTlRUWVBFX0ZMT0FUMzIgPSBUWVBFX0ZMT0FUMzI7XG5cbmV4cG9ydCBjb25zdCBQSVhFTEZPUk1BVF9MOF9BOCA9IFBJWEVMRk9STUFUX0xBODtcbmV4cG9ydCBjb25zdCBQSVhFTEZPUk1BVF9SNV9HNl9CNSA9IFBJWEVMRk9STUFUX1JHQjU2NTtcbmV4cG9ydCBjb25zdCBQSVhFTEZPUk1BVF9SNV9HNV9CNV9BMSA9IFBJWEVMRk9STUFUX1JHQkE1NTUxO1xuZXhwb3J0IGNvbnN0IFBJWEVMRk9STUFUX1I0X0c0X0I0X0E0ID0gUElYRUxGT1JNQVRfUkdCQTQ7XG5leHBvcnQgY29uc3QgUElYRUxGT1JNQVRfUjhfRzhfQjggPSBQSVhFTEZPUk1BVF9SR0I4O1xuZXhwb3J0IGNvbnN0IFBJWEVMRk9STUFUX1I4X0c4X0I4X0E4ID0gUElYRUxGT1JNQVRfUkdCQTg7XG5cbmV4cG9ydCBjb25zdCBCTEVORE1PREVfQ09OU1RBTlRfQ09MT1IgPSBCTEVORE1PREVfQ09OU1RBTlQ7XG5leHBvcnQgY29uc3QgQkxFTkRNT0RFX09ORV9NSU5VU19DT05TVEFOVF9DT0xPUiA9IEJMRU5ETU9ERV9PTkVfTUlOVVNfQ09OU1RBTlQ7XG5leHBvcnQgY29uc3QgQkxFTkRNT0RFX0NPTlNUQU5UX0FMUEhBID0gQkxFTkRNT0RFX0NPTlNUQU5UO1xuZXhwb3J0IGNvbnN0IEJMRU5ETU9ERV9PTkVfTUlOVVNfQ09OU1RBTlRfQUxQSEEgPSBCTEVORE1PREVfT05FX01JTlVTX0NPTlNUQU5UO1xuXG5leHBvcnQgZnVuY3Rpb24gVW5zdXBwb3J0ZWRCcm93c2VyRXJyb3IobWVzc2FnZSkge1xuICAgIHRoaXMubmFtZSA9ICdVbnN1cHBvcnRlZEJyb3dzZXJFcnJvcic7XG4gICAgdGhpcy5tZXNzYWdlID0gKG1lc3NhZ2UgfHwgJycpO1xufVxuVW5zdXBwb3J0ZWRCcm93c2VyRXJyb3IucHJvdG90eXBlID0gRXJyb3IucHJvdG90eXBlO1xuXG5leHBvcnQgZnVuY3Rpb24gQ29udGV4dENyZWF0aW9uRXJyb3IobWVzc2FnZSkge1xuICAgIHRoaXMubmFtZSA9ICdDb250ZXh0Q3JlYXRpb25FcnJvcic7XG4gICAgdGhpcy5tZXNzYWdlID0gKG1lc3NhZ2UgfHwgJycpO1xufVxuQ29udGV4dENyZWF0aW9uRXJyb3IucHJvdG90eXBlID0gRXJyb3IucHJvdG90eXBlO1xuXG5leHBvcnQgY29uc3QgcHJvZ3JhbWxpYiA9IHtcbiAgICBiZWdpbjogU2hhZGVyR2VuZXJhdG9yLmJlZ2luLFxuICAgIGR1bW15RnJhZ21lbnRDb2RlOiBTaGFkZXJVdGlscy5kdW1teUZyYWdtZW50Q29kZSxcbiAgICBlbmQ6IFNoYWRlckdlbmVyYXRvci5lbmQsXG4gICAgZm9nQ29kZTogU2hhZGVyR2VuZXJhdG9yLmZvZ0NvZGUsXG4gICAgZ2FtbWFDb2RlOiBTaGFkZXJHZW5lcmF0b3IuZ2FtbWFDb2RlLFxuICAgIHByZWNpc2lvbkNvZGU6IFNoYWRlclV0aWxzLnByZWNpc2lvbkNvZGUsXG4gICAgc2tpbkNvZGU6IFNoYWRlckdlbmVyYXRvci5za2luQ29kZSxcbiAgICB0b25lbWFwQ29kZTogU2hhZGVyR2VuZXJhdG9yLnRvbmVtYXBDb2RlLFxuICAgIHZlcnNpb25Db2RlOiBTaGFkZXJVdGlscy52ZXJzaW9uQ29kZVxufTtcblxuZXhwb3J0IGNvbnN0IGdmeCA9IHtcbiAgICBBRERSRVNTX0NMQU1QX1RPX0VER0U6IEFERFJFU1NfQ0xBTVBfVE9fRURHRSxcbiAgICBBRERSRVNTX01JUlJPUkVEX1JFUEVBVDogQUREUkVTU19NSVJST1JFRF9SRVBFQVQsXG4gICAgQUREUkVTU19SRVBFQVQ6IEFERFJFU1NfUkVQRUFULFxuICAgIEJMRU5ETU9ERV9aRVJPOiBCTEVORE1PREVfWkVSTyxcbiAgICBCTEVORE1PREVfT05FOiBCTEVORE1PREVfT05FLFxuICAgIEJMRU5ETU9ERV9TUkNfQ09MT1I6IEJMRU5ETU9ERV9TUkNfQ09MT1IsXG4gICAgQkxFTkRNT0RFX09ORV9NSU5VU19TUkNfQ09MT1I6IEJMRU5ETU9ERV9PTkVfTUlOVVNfU1JDX0NPTE9SLFxuICAgIEJMRU5ETU9ERV9EU1RfQ09MT1I6IEJMRU5ETU9ERV9EU1RfQ09MT1IsXG4gICAgQkxFTkRNT0RFX09ORV9NSU5VU19EU1RfQ09MT1I6IEJMRU5ETU9ERV9PTkVfTUlOVVNfRFNUX0NPTE9SLFxuICAgIEJMRU5ETU9ERV9TUkNfQUxQSEE6IEJMRU5ETU9ERV9TUkNfQUxQSEEsXG4gICAgQkxFTkRNT0RFX1NSQ19BTFBIQV9TQVRVUkFURTogQkxFTkRNT0RFX1NSQ19BTFBIQV9TQVRVUkFURSxcbiAgICBCTEVORE1PREVfT05FX01JTlVTX1NSQ19BTFBIQTogQkxFTkRNT0RFX09ORV9NSU5VU19TUkNfQUxQSEEsXG4gICAgQkxFTkRNT0RFX0RTVF9BTFBIQTogQkxFTkRNT0RFX0RTVF9BTFBIQSxcbiAgICBCTEVORE1PREVfT05FX01JTlVTX0RTVF9BTFBIQTogQkxFTkRNT0RFX09ORV9NSU5VU19EU1RfQUxQSEEsXG4gICAgQlVGRkVSX1NUQVRJQzogQlVGRkVSX1NUQVRJQyxcbiAgICBCVUZGRVJfRFlOQU1JQzogQlVGRkVSX0RZTkFNSUMsXG4gICAgQlVGRkVSX1NUUkVBTTogQlVGRkVSX1NUUkVBTSxcbiAgICBDVUxMRkFDRV9OT05FOiBDVUxMRkFDRV9OT05FLFxuICAgIENVTExGQUNFX0JBQ0s6IENVTExGQUNFX0JBQ0ssXG4gICAgQ1VMTEZBQ0VfRlJPTlQ6IENVTExGQUNFX0ZST05ULFxuICAgIENVTExGQUNFX0ZST05UQU5EQkFDSzogQ1VMTEZBQ0VfRlJPTlRBTkRCQUNLLFxuICAgIEVMRU1FTlRUWVBFX0lOVDg6IFRZUEVfSU5UOCxcbiAgICBFTEVNRU5UVFlQRV9VSU5UODogVFlQRV9VSU5UOCxcbiAgICBFTEVNRU5UVFlQRV9JTlQxNjogVFlQRV9JTlQxNixcbiAgICBFTEVNRU5UVFlQRV9VSU5UMTY6IFRZUEVfVUlOVDE2LFxuICAgIEVMRU1FTlRUWVBFX0lOVDMyOiBUWVBFX0lOVDMyLFxuICAgIEVMRU1FTlRUWVBFX1VJTlQzMjogVFlQRV9VSU5UMzIsXG4gICAgRUxFTUVOVFRZUEVfRkxPQVQzMjogVFlQRV9GTE9BVDMyLFxuICAgIEZJTFRFUl9ORUFSRVNUOiBGSUxURVJfTkVBUkVTVCxcbiAgICBGSUxURVJfTElORUFSOiBGSUxURVJfTElORUFSLFxuICAgIEZJTFRFUl9ORUFSRVNUX01JUE1BUF9ORUFSRVNUOiBGSUxURVJfTkVBUkVTVF9NSVBNQVBfTkVBUkVTVCxcbiAgICBGSUxURVJfTkVBUkVTVF9NSVBNQVBfTElORUFSOiBGSUxURVJfTkVBUkVTVF9NSVBNQVBfTElORUFSLFxuICAgIEZJTFRFUl9MSU5FQVJfTUlQTUFQX05FQVJFU1Q6IEZJTFRFUl9MSU5FQVJfTUlQTUFQX05FQVJFU1QsXG4gICAgRklMVEVSX0xJTkVBUl9NSVBNQVBfTElORUFSOiBGSUxURVJfTElORUFSX01JUE1BUF9MSU5FQVIsXG4gICAgSU5ERVhGT1JNQVRfVUlOVDg6IElOREVYRk9STUFUX1VJTlQ4LFxuICAgIElOREVYRk9STUFUX1VJTlQxNjogSU5ERVhGT1JNQVRfVUlOVDE2LFxuICAgIElOREVYRk9STUFUX1VJTlQzMjogSU5ERVhGT1JNQVRfVUlOVDMyLFxuICAgIFBJWEVMRk9STUFUX1JHQjU2NTogUElYRUxGT1JNQVRfUkdCNTY1LFxuICAgIFBJWEVMRk9STUFUX1JHQjg6IFBJWEVMRk9STUFUX1JHQjgsXG4gICAgUElYRUxGT1JNQVRfUkdCQTg6IFBJWEVMRk9STUFUX1JHQkE4LFxuICAgIFBSSU1JVElWRV9QT0lOVFM6IFBSSU1JVElWRV9QT0lOVFMsXG4gICAgUFJJTUlUSVZFX0xJTkVTOiBQUklNSVRJVkVfTElORVMsXG4gICAgUFJJTUlUSVZFX0xJTkVMT09QOiBQUklNSVRJVkVfTElORUxPT1AsXG4gICAgUFJJTUlUSVZFX0xJTkVTVFJJUDogUFJJTUlUSVZFX0xJTkVTVFJJUCxcbiAgICBQUklNSVRJVkVfVFJJQU5HTEVTOiBQUklNSVRJVkVfVFJJQU5HTEVTLFxuICAgIFBSSU1JVElWRV9UUklTVFJJUDogUFJJTUlUSVZFX1RSSVNUUklQLFxuICAgIFBSSU1JVElWRV9UUklGQU46IFBSSU1JVElWRV9UUklGQU4sXG4gICAgU0VNQU5USUNfUE9TSVRJT046IFNFTUFOVElDX1BPU0lUSU9OLFxuICAgIFNFTUFOVElDX05PUk1BTDogU0VNQU5USUNfTk9STUFMLFxuICAgIFNFTUFOVElDX0NPTE9SOiBTRU1BTlRJQ19DT0xPUixcbiAgICBTRU1BTlRJQ19URVhDT09SRDogU0VNQU5USUNfVEVYQ09PUkQsXG4gICAgU0VNQU5USUNfVEVYQ09PUkQwOiBTRU1BTlRJQ19URVhDT09SRDAsXG4gICAgU0VNQU5USUNfVEVYQ09PUkQxOiBTRU1BTlRJQ19URVhDT09SRDEsXG4gICAgU0VNQU5USUNfQVRUUjA6IFNFTUFOVElDX0FUVFIwLFxuICAgIFNFTUFOVElDX0FUVFIxOiBTRU1BTlRJQ19BVFRSMSxcbiAgICBTRU1BTlRJQ19BVFRSMjogU0VNQU5USUNfQVRUUjIsXG4gICAgU0VNQU5USUNfQVRUUjM6IFNFTUFOVElDX0FUVFIzLFxuICAgIFRFWFRVUkVMT0NLX1JFQUQ6IFRFWFRVUkVMT0NLX1JFQUQsXG4gICAgVEVYVFVSRUxPQ0tfV1JJVEU6IFRFWFRVUkVMT0NLX1dSSVRFLFxuICAgIGRyYXdRdWFkV2l0aFNoYWRlcjogZHJhd1F1YWRXaXRoU2hhZGVyLFxuICAgIHByb2dyYW1saWI6IHByb2dyYW1saWIsXG4gICAgc2hhZGVyQ2h1bmtzOiBzaGFkZXJDaHVua3MsXG4gICAgQ29udGV4dENyZWF0aW9uRXJyb3I6IENvbnRleHRDcmVhdGlvbkVycm9yLFxuICAgIERldmljZTogR3JhcGhpY3NEZXZpY2UsXG4gICAgSW5kZXhCdWZmZXI6IEluZGV4QnVmZmVyLFxuICAgIFByb2dyYW1MaWJyYXJ5OiBQcm9ncmFtTGlicmFyeSxcbiAgICBSZW5kZXJUYXJnZXQ6IFJlbmRlclRhcmdldCxcbiAgICBTY29wZUlkOiBTY29wZUlkLFxuICAgIFNoYWRlcjogU2hhZGVyLFxuICAgIFNoYWRlcklucHV0OiBXZWJnbFNoYWRlcklucHV0LFxuICAgIFRleHR1cmU6IFRleHR1cmUsXG4gICAgVW5zdXBwb3J0ZWRCcm93c2VyRXJyb3I6IFVuc3VwcG9ydGVkQnJvd3NlckVycm9yLFxuICAgIFZlcnRleEJ1ZmZlcjogVmVydGV4QnVmZmVyLFxuICAgIFZlcnRleEZvcm1hdDogVmVydGV4Rm9ybWF0LFxuICAgIFZlcnRleEl0ZXJhdG9yOiBWZXJ0ZXhJdGVyYXRvclxufTtcblxuY29uc3QgX3ZpZXdwb3J0ID0gbmV3IFZlYzQoKTtcblxuZXhwb3J0IGZ1bmN0aW9uIGRyYXdGdWxsc2NyZWVuUXVhZChkZXZpY2UsIHRhcmdldCwgdmVydGV4QnVmZmVyLCBzaGFkZXIsIHJlY3QpIHtcblxuICAgIERlYnVnLmRlcHJlY2F0ZWQoYHBjLmRyYXdGdWxsc2NyZWVuUXVhZCBpcyBkZXByZWNhdGVkLiBXaGVuIHVzZWQgYXMgcGFydCBvZiBQb3N0RWZmZWN0LCB1c2UgUG9zdEVmZmVjdCNkcmF3UXVhZCBpbnN0ZWFkLmApO1xuXG4gICAgLy8gY29udmVydCByZWN0IGluIG5vcm1hbGl6ZWQgc3BhY2UgdG8gdmlld3BvcnQgaW4gcGl4ZWwgc3BhY2VcbiAgICBsZXQgdmlld3BvcnQ7XG4gICAgaWYgKHJlY3QpIHtcbiAgICAgICAgY29uc3QgdyA9IHRhcmdldCA/IHRhcmdldC53aWR0aCA6IGRldmljZS53aWR0aDtcbiAgICAgICAgY29uc3QgaCA9IHRhcmdldCA/IHRhcmdldC5oZWlnaHQgOiBkZXZpY2UuaGVpZ2h0O1xuICAgICAgICB2aWV3cG9ydCA9IF92aWV3cG9ydC5zZXQocmVjdC54ICogdywgcmVjdC55ICogaCwgcmVjdC56ICogdywgcmVjdC53ICogaCk7XG4gICAgfVxuXG4gICAgZHJhd1F1YWRXaXRoU2hhZGVyKGRldmljZSwgdGFyZ2V0LCBzaGFkZXIsIHZpZXdwb3J0KTtcbn1cblxuZXhwb3J0IGNvbnN0IHBvc3RlZmZlY3QgPSB7XG4gICAgY3JlYXRlRnVsbHNjcmVlblF1YWQ6IChkZXZpY2UpID0+IHtcbiAgICAgICAgcmV0dXJuIGRldmljZS5xdWFkVmVydGV4QnVmZmVyO1xuICAgIH0sXG4gICAgZHJhd0Z1bGxzY3JlZW5RdWFkOiBkcmF3RnVsbHNjcmVlblF1YWQsXG4gICAgUG9zdEVmZmVjdDogUG9zdEVmZmVjdCxcbiAgICBQb3N0RWZmZWN0UXVldWU6IFBvc3RFZmZlY3RRdWV1ZVxufTtcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KHNoYWRlckNodW5rcywgJ3RyYW5zZm9ybVNraW5uZWRWUycsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuICcjZGVmaW5lIFNLSU5cXG4nICsgc2hhZGVyQ2h1bmtzLnRyYW5zZm9ybVZTO1xuICAgIH1cbn0pO1xuXG5jb25zdCBkZXByZWNhdGVkQ2h1bmtzID0ge1xuICAgICdhbWJpZW50UHJlZmlsdGVyZWRDdWJlLmZyYWcnOiAnYW1iaWVudEVudi5mcmFnJyxcbiAgICAnYW1iaWVudFByZWZpbHRlcmVkQ3ViZUxvZC5mcmFnJzogJ2FtYmllbnRFbnYuZnJhZycsXG4gICAgJ2RwQXRsYXNRdWFkLmZyYWcnOiBudWxsLFxuICAgICdnZW5QYXJhYm9sb2lkLmZyYWcnOiBudWxsLFxuICAgICdwcmVmaWx0ZXJDdWJlbWFwLmZyYWcnOiBudWxsLFxuICAgICdyZWZsZWN0aW9uRHBBdGxhcy5mcmFnJzogJ3JlZmxlY3Rpb25FbnYuZnJhZycsXG4gICAgJ3JlZmxlY3Rpb25QcmVmaWx0ZXJlZEN1YmUuZnJhZyc6ICdyZWZsZWN0aW9uRW52LmZyYWcnLFxuICAgICdyZWZsZWN0aW9uUHJlZmlsdGVyZWRDdWJlTG9kLmZyYWcnOiAncmVmbGVjdGlvbkVudi5mcmFnJ1xufTtcblxuT2JqZWN0LmtleXMoZGVwcmVjYXRlZENodW5rcykuZm9yRWFjaCgoY2h1bmtOYW1lKSA9PiB7XG4gICAgY29uc3QgcmVwbGFjZW1lbnQgPSBkZXByZWNhdGVkQ2h1bmtzW2NodW5rTmFtZV07XG4gICAgY29uc3QgdXNlSW5zdGVhZCA9IHJlcGxhY2VtZW50ID8gYCBVc2UgcGMuc2hhZGVyQ2h1bmtzWycke3JlcGxhY2VtZW50fSddIGluc3RlYWQuYCA6ICcnO1xuICAgIGNvbnN0IG1zZyA9IGBwYy5zaGFkZXJDaHVua3NbJyR7Y2h1bmtOYW1lfSddIGlzIGRlcHJlY2F0ZWQuJHt1c2VJbnN0ZWFkfX1gO1xuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShzaGFkZXJDaHVua3MsIGNodW5rTmFtZSwge1xuICAgICAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIERlYnVnLmVycm9yKG1zZyk7XG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfSxcbiAgICAgICAgc2V0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBEZWJ1Zy5lcnJvcihtc2cpO1xuICAgICAgICB9XG4gICAgfSk7XG59KTtcblxuLy8gV2Ugb25seSBwcm92aWRlIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5IGluIGRlYnVnIGJ1aWxkcywgcHJvZHVjdGlvbiBidWlsZHMgaGF2ZSB0byBiZVxuLy8gYXMgZmFzdCBhbmQgc21hbGwgYXMgcG9zc2libGUuXG5cbi8vICNpZiBfREVCVUdcblxuLyoqXG4gKiBIZWxwZXIgZnVuY3Rpb24gdG8gZW5zdXJlIGEgYml0IG9mIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5LlxuICpcbiAqIEBleGFtcGxlXG4gKiB0b0xpdEFyZ3MoJ2xpdFNoYWRlckFyZ3Muc2hlZW4uc3BlY3VsYXJpdHknKTsgLy8gUmVzdWx0OiAnbGl0QXJnc19zaGVlbl9zcGVjdWxhcml0eSdcbiAqIEBwYXJhbSB7c3RyaW5nfSBzcmMgLSBUaGUgc2hhZGVyIHNvdXJjZSB3aGljaCBtYXkgZ2VuZXJhdGUgc2hhZGVyIGVycm9ycy5cbiAqIEByZXR1cm5zIHtzdHJpbmd9IFRoZSBiYWNrd2FyZHMgY29tcGF0aWJsZSBzaGFkZXIgc291cmNlLlxuICogQGlnbm9yZVxuICovXG5mdW5jdGlvbiBjb21wYXRpYmlsaXR5Rm9yTGl0QXJncyhzcmMpIHtcbiAgICBpZiAoc3JjLmluY2x1ZGVzKCdsaXRTaGFkZXJBcmdzJykpIHtcbiAgICAgICAgc3JjID0gc3JjLnJlcGxhY2UoL2xpdFNoYWRlckFyZ3MoW1xcLmEtekEtWl0rKSsvZywgKGEsIGIpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IG5ld1NvdXJjZSA9ICdsaXRBcmdzJyArIGIucmVwbGFjZSgvXFwuL2csICdfJyk7XG4gICAgICAgICAgICBEZWJ1Zy5kZXByZWNhdGVkKGBOZXN0ZWQgc3RydWN0IHByb3BlcnR5IGFjY2VzcyBpcyBkZXByZWNhdGVkLCBiZWNhdXNlIGl0J3MgY3Jhc2hpbmcgc29tZSBkZXZpY2VzLiBQbGVhc2UgdXBkYXRlIHlvdXIgY3VzdG9tIGNodW5rcyBtYW51YWxseS4gSW4gcGFydGljdWxhciAke2F9IHNob3VsZCBiZSAke25ld1NvdXJjZX0gbm93LmApO1xuICAgICAgICAgICAgcmV0dXJuIG5ld1NvdXJjZTtcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIHJldHVybiBzcmM7XG59XG5cbi8qKlxuICogQWRkIG1vcmUgYmFja3dhcmRzIGNvbXBhdGliaWxpdHkgZnVuY3Rpb25zIGFzIG5lZWRlZC5cbiAqL1xuTGl0U2hhZGVyLnByb3RvdHlwZS5oYW5kbGVDb21wYXRpYmlsaXR5ID0gZnVuY3Rpb24gKCkge1xuICAgIHRoaXMuZnNoYWRlciA9IGNvbXBhdGliaWxpdHlGb3JMaXRBcmdzKHRoaXMuZnNoYWRlcik7XG59O1xuXG4vLyAjZW5kaWZcblxuLy8gTm90ZTogVGhpcyB3YXMgbmV2ZXIgcHVibGljIGludGVyZmFjZSwgYnV0IGhhcyBiZWVuIHVzZWQgaW4gZXh0ZXJuYWwgc2NyaXB0c1xuT2JqZWN0LmRlZmluZVByb3BlcnRpZXMoUmVuZGVyVGFyZ2V0LnByb3RvdHlwZSwge1xuICAgIF9nbEZyYW1lQnVmZmVyOiB7XG4gICAgICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgRGVidWcuZGVwcmVjYXRlZCgncGMuUmVuZGVyVGFyZ2V0I19nbEZyYW1lQnVmZmVyIGlzIGRlcHJlY2F0ZWQuIFVzZSBwYy5SZW5kZXJUYXJnZXQuaW1wbCNfZ2xGcmFtZUJ1ZmZlciBpbnN0ZWFkLicpO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuaW1wbC5fZ2xGcmFtZUJ1ZmZlcjtcbiAgICAgICAgfSxcbiAgICAgICAgc2V0OiBmdW5jdGlvbiAocmdibSkge1xuICAgICAgICAgICAgRGVidWcuZGVwcmVjYXRlZCgncGMuUmVuZGVyVGFyZ2V0I19nbEZyYW1lQnVmZmVyIGlzIGRlcHJlY2F0ZWQuIFVzZSBwYy5SZW5kZXJUYXJnZXQuaW1wbCNfZ2xGcmFtZUJ1ZmZlciBpbnN0ZWFkLicpO1xuICAgICAgICB9XG4gICAgfVxufSk7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShWZXJ0ZXhGb3JtYXQsICdkZWZhdWx0SW5zdGFuY2luZ0Zvcm1hdCcsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgRGVidWcuZGVwcmVjYXRlZCgncGMuVmVydGV4Rm9ybWF0LmRlZmF1bHRJbnN0YW5jaW5nRm9ybWF0IGlzIGRlcHJlY2F0ZWQsIHVzZSBwYy5WZXJ0ZXhGb3JtYXQuZ2V0RGVmYXVsdEluc3RhbmNpbmdGb3JtYXQoZ3JhcGhpY3NEZXZpY2UpLicpO1xuICAgICAgICByZXR1cm4gVmVydGV4Rm9ybWF0LmdldERlZmF1bHRJbnN0YW5jaW5nRm9ybWF0KEdyYXBoaWNzRGV2aWNlQWNjZXNzLmdldCgpKTtcbiAgICB9XG59KTtcblxuT2JqZWN0LmRlZmluZVByb3BlcnRpZXMoVGV4dHVyZS5wcm90b3R5cGUsIHtcbiAgICByZ2JtOiB7XG4gICAgICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgRGVidWcuZGVwcmVjYXRlZCgncGMuVGV4dHVyZSNyZ2JtIGlzIGRlcHJlY2F0ZWQuIFVzZSBwYy5UZXh0dXJlI3R5cGUgaW5zdGVhZC4nKTtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnR5cGUgPT09IFRFWFRVUkVUWVBFX1JHQk07XG4gICAgICAgIH0sXG4gICAgICAgIHNldDogZnVuY3Rpb24gKHJnYm0pIHtcbiAgICAgICAgICAgIERlYnVnLmRlcHJlY2F0ZWQoJ3BjLlRleHR1cmUjcmdibSBpcyBkZXByZWNhdGVkLiBVc2UgcGMuVGV4dHVyZSN0eXBlIGluc3RlYWQuJyk7XG4gICAgICAgICAgICB0aGlzLnR5cGUgPSByZ2JtID8gVEVYVFVSRVRZUEVfUkdCTSA6IFRFWFRVUkVUWVBFX0RFRkFVTFQ7XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgc3dpenpsZUdHR1I6IHtcbiAgICAgICAgZ2V0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBEZWJ1Zy5kZXByZWNhdGVkKCdwYy5UZXh0dXJlI3N3aXp6bGVHR0dSIGlzIGRlcHJlY2F0ZWQuIFVzZSBwYy5UZXh0dXJlI3R5cGUgaW5zdGVhZC4nKTtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnR5cGUgPT09IFRFWFRVUkVUWVBFX1NXSVpaTEVHR0dSO1xuICAgICAgICB9LFxuICAgICAgICBzZXQ6IGZ1bmN0aW9uIChzd2l6emxlR0dHUikge1xuICAgICAgICAgICAgRGVidWcuZGVwcmVjYXRlZCgncGMuVGV4dHVyZSNzd2l6emxlR0dHUiBpcyBkZXByZWNhdGVkLiBVc2UgcGMuVGV4dHVyZSN0eXBlIGluc3RlYWQuJyk7XG4gICAgICAgICAgICB0aGlzLnR5cGUgPSBzd2l6emxlR0dHUiA/IFRFWFRVUkVUWVBFX1NXSVpaTEVHR0dSIDogVEVYVFVSRVRZUEVfREVGQVVMVDtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICBfZ2xUZXh0dXJlOiB7XG4gICAgICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgRGVidWcuZGVwcmVjYXRlZCgncGMuVGV4dHVyZSNfZ2xUZXh0dXJlIGlzIG5vIGxvbmdlciBhdmFpbGFibGUsIHVzZSBVc2UgcGMuVGV4dHVyZS5pbXBsLl9nbFRleHR1cmUgaW5zdGVhZC4nKTtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmltcGwuX2dsVGV4dHVyZTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICBhdXRvTWlwbWFwOiB7XG4gICAgICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgRGVidWcuZGVwcmVjYXRlZCgncGMuVGV4dHVyZSNhdXRvTWlwbWFwIGlzIGRlcHJlY2F0ZWQsIHVzZSBwYy5UZXh0dXJlI21pcG1hcHMgaW5zdGVhZC4nKTtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9taXBtYXBzO1xuICAgICAgICB9LFxuICAgICAgICBzZXQ6IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgRGVidWcuZGVwcmVjYXRlZCgncGMuVGV4dHVyZSNhdXRvTWlwbWFwIGlzIGRlcHJlY2F0ZWQsIHVzZSBwYy5UZXh0dXJlI21pcG1hcHMgaW5zdGVhZC4nKTtcbiAgICAgICAgICAgIHRoaXMuX21pcG1hcHMgPSB2YWx1ZTtcbiAgICAgICAgfVxuICAgIH1cbn0pO1xuXG5HcmFwaGljc0RldmljZS5wcm90b3R5cGUuZ2V0UHJvZ3JhbUxpYnJhcnkgPSBmdW5jdGlvbiAoKSB7XG4gICAgRGVidWcuZGVwcmVjYXRlZChgcGMuR3JhcGhpY3NEZXZpY2UjZ2V0UHJvZ3JhbUxpYnJhcnkgaXMgZGVwcmVjYXRlZC5gKTtcbiAgICByZXR1cm4gZ2V0UHJvZ3JhbUxpYnJhcnkodGhpcyk7XG59O1xuXG5HcmFwaGljc0RldmljZS5wcm90b3R5cGUuc2V0UHJvZ3JhbUxpYnJhcnkgPSBmdW5jdGlvbiAobGliKSB7XG4gICAgRGVidWcuZGVwcmVjYXRlZChgcGMuR3JhcGhpY3NEZXZpY2Ujc2V0UHJvZ3JhbUxpYnJhcnkgaXMgZGVwcmVjYXRlZC5gKTtcbiAgICBzZXRQcm9ncmFtTGlicmFyeSh0aGlzLCBsaWIpO1xufTtcblxuR3JhcGhpY3NEZXZpY2UucHJvdG90eXBlLnJlbW92ZVNoYWRlckZyb21DYWNoZSA9IGZ1bmN0aW9uIChzaGFkZXIpIHtcbiAgICBEZWJ1Zy5kZXByZWNhdGVkKGBwYy5HcmFwaGljc0RldmljZSNyZW1vdmVTaGFkZXJGcm9tQ2FjaGUgaXMgZGVwcmVjYXRlZC5gKTtcbiAgICBnZXRQcm9ncmFtTGlicmFyeSh0aGlzKS5yZW1vdmVGcm9tQ2FjaGUoc2hhZGVyKTtcbn07XG5cbkJsZW5kU3RhdGUuREVGQVVMVCA9IE9iamVjdC5mcmVlemUobmV3IEJsZW5kU3RhdGUoKSk7XG5cbmNvbnN0IF90ZW1wQmxlbmRTdGF0ZSA9IG5ldyBCbGVuZFN0YXRlKCk7XG5jb25zdCBfdGVtcERlcHRoU3RhdGUgPSBuZXcgRGVwdGhTdGF0ZSgpO1xuXG5HcmFwaGljc0RldmljZS5wcm90b3R5cGUuc2V0QmxlbmRGdW5jdGlvbiA9IGZ1bmN0aW9uIChibGVuZFNyYywgYmxlbmREc3QpIHtcbiAgICBEZWJ1Zy5kZXByZWNhdGVkKGBwYy5HcmFwaGljc0RldmljZSNzZXRCbGVuZEZ1bmN0aW9uIGlzIGRlcHJlY2F0ZWQsIHVzZSBwYy5HcmFwaGljc0RldmljZS5zZXRCbGVuZFN0YXRlIGluc3RlYWQuYCk7XG4gICAgY29uc3QgY3VycmVudEJsZW5kU3RhdGUgPSB0aGlzLmJsZW5kU3RhdGU7XG4gICAgX3RlbXBCbGVuZFN0YXRlLmNvcHkoY3VycmVudEJsZW5kU3RhdGUpO1xuICAgIF90ZW1wQmxlbmRTdGF0ZS5zZXRDb2xvckJsZW5kKGN1cnJlbnRCbGVuZFN0YXRlLmNvbG9yT3AsIGJsZW5kU3JjLCBibGVuZERzdCk7XG4gICAgX3RlbXBCbGVuZFN0YXRlLnNldEFscGhhQmxlbmQoY3VycmVudEJsZW5kU3RhdGUuYWxwaGFPcCwgYmxlbmRTcmMsIGJsZW5kRHN0KTtcbiAgICB0aGlzLnNldEJsZW5kU3RhdGUoX3RlbXBCbGVuZFN0YXRlKTtcbn07XG5cbkdyYXBoaWNzRGV2aWNlLnByb3RvdHlwZS5zZXRCbGVuZEZ1bmN0aW9uU2VwYXJhdGUgPSBmdW5jdGlvbiAoYmxlbmRTcmMsIGJsZW5kRHN0LCBibGVuZFNyY0FscGhhLCBibGVuZERzdEFscGhhKSB7XG4gICAgRGVidWcuZGVwcmVjYXRlZChgcGMuR3JhcGhpY3NEZXZpY2Ujc2V0QmxlbmRGdW5jdGlvblNlcGFyYXRlIGlzIGRlcHJlY2F0ZWQsIHVzZSBwYy5HcmFwaGljc0RldmljZS5zZXRCbGVuZFN0YXRlIGluc3RlYWQuYCk7XG4gICAgY29uc3QgY3VycmVudEJsZW5kU3RhdGUgPSB0aGlzLmJsZW5kU3RhdGU7XG4gICAgX3RlbXBCbGVuZFN0YXRlLmNvcHkoY3VycmVudEJsZW5kU3RhdGUpO1xuICAgIF90ZW1wQmxlbmRTdGF0ZS5zZXRDb2xvckJsZW5kKGN1cnJlbnRCbGVuZFN0YXRlLmNvbG9yT3AsIGJsZW5kU3JjLCBibGVuZERzdCk7XG4gICAgX3RlbXBCbGVuZFN0YXRlLnNldEFscGhhQmxlbmQoY3VycmVudEJsZW5kU3RhdGUuYWxwaGFPcCwgYmxlbmRTcmNBbHBoYSwgYmxlbmREc3RBbHBoYSk7XG4gICAgdGhpcy5zZXRCbGVuZFN0YXRlKF90ZW1wQmxlbmRTdGF0ZSk7XG59O1xuXG5HcmFwaGljc0RldmljZS5wcm90b3R5cGUuc2V0QmxlbmRFcXVhdGlvbiA9IGZ1bmN0aW9uIChibGVuZEVxdWF0aW9uKSB7XG4gICAgRGVidWcuZGVwcmVjYXRlZChgcGMuR3JhcGhpY3NEZXZpY2Ujc2V0QmxlbmRFcXVhdGlvbiBpcyBkZXByZWNhdGVkLCB1c2UgcGMuR3JhcGhpY3NEZXZpY2Uuc2V0QmxlbmRTdGF0ZSBpbnN0ZWFkLmApO1xuICAgIGNvbnN0IGN1cnJlbnRCbGVuZFN0YXRlID0gdGhpcy5ibGVuZFN0YXRlO1xuICAgIF90ZW1wQmxlbmRTdGF0ZS5jb3B5KGN1cnJlbnRCbGVuZFN0YXRlKTtcbiAgICBfdGVtcEJsZW5kU3RhdGUuc2V0Q29sb3JCbGVuZChibGVuZEVxdWF0aW9uLCBjdXJyZW50QmxlbmRTdGF0ZS5jb2xvclNyY0ZhY3RvciwgY3VycmVudEJsZW5kU3RhdGUuY29sb3JEc3RGYWN0b3IpO1xuICAgIF90ZW1wQmxlbmRTdGF0ZS5zZXRBbHBoYUJsZW5kKGJsZW5kRXF1YXRpb24sIGN1cnJlbnRCbGVuZFN0YXRlLmFscGhhU3JjRmFjdG9yLCBjdXJyZW50QmxlbmRTdGF0ZS5hbHBoYURzdEZhY3Rvcik7XG4gICAgdGhpcy5zZXRCbGVuZFN0YXRlKF90ZW1wQmxlbmRTdGF0ZSk7XG59O1xuXG5HcmFwaGljc0RldmljZS5wcm90b3R5cGUuc2V0QmxlbmRFcXVhdGlvblNlcGFyYXRlID0gZnVuY3Rpb24gKGJsZW5kRXF1YXRpb24sIGJsZW5kQWxwaGFFcXVhdGlvbikge1xuICAgIERlYnVnLmRlcHJlY2F0ZWQoYHBjLkdyYXBoaWNzRGV2aWNlI3NldEJsZW5kRXF1YXRpb25TZXBhcmF0ZSBpcyBkZXByZWNhdGVkLCB1c2UgcGMuR3JhcGhpY3NEZXZpY2Uuc2V0QmxlbmRTdGF0ZSBpbnN0ZWFkLmApO1xuICAgIGNvbnN0IGN1cnJlbnRCbGVuZFN0YXRlID0gdGhpcy5ibGVuZFN0YXRlO1xuICAgIF90ZW1wQmxlbmRTdGF0ZS5jb3B5KGN1cnJlbnRCbGVuZFN0YXRlKTtcbiAgICBfdGVtcEJsZW5kU3RhdGUuc2V0Q29sb3JCbGVuZChibGVuZEVxdWF0aW9uLCBjdXJyZW50QmxlbmRTdGF0ZS5jb2xvclNyY0ZhY3RvciwgY3VycmVudEJsZW5kU3RhdGUuY29sb3JEc3RGYWN0b3IpO1xuICAgIF90ZW1wQmxlbmRTdGF0ZS5zZXRBbHBoYUJsZW5kKGJsZW5kQWxwaGFFcXVhdGlvbiwgY3VycmVudEJsZW5kU3RhdGUuYWxwaGFTcmNGYWN0b3IsIGN1cnJlbnRCbGVuZFN0YXRlLmFscGhhRHN0RmFjdG9yKTtcbiAgICB0aGlzLnNldEJsZW5kU3RhdGUoX3RlbXBCbGVuZFN0YXRlKTtcbn07XG5cbkdyYXBoaWNzRGV2aWNlLnByb3RvdHlwZS5zZXRDb2xvcldyaXRlID0gZnVuY3Rpb24gKHJlZFdyaXRlLCBncmVlbldyaXRlLCBibHVlV3JpdGUsIGFscGhhV3JpdGUpIHtcbiAgICBEZWJ1Zy5kZXByZWNhdGVkKGBwYy5HcmFwaGljc0RldmljZSNzZXRDb2xvcldyaXRlIGlzIGRlcHJlY2F0ZWQsIHVzZSBwYy5HcmFwaGljc0RldmljZS5zZXRCbGVuZFN0YXRlIGluc3RlYWQuYCk7XG4gICAgY29uc3QgY3VycmVudEJsZW5kU3RhdGUgPSB0aGlzLmJsZW5kU3RhdGU7XG4gICAgX3RlbXBCbGVuZFN0YXRlLmNvcHkoY3VycmVudEJsZW5kU3RhdGUpO1xuICAgIF90ZW1wQmxlbmRTdGF0ZS5zZXRDb2xvcldyaXRlKHJlZFdyaXRlLCBncmVlbldyaXRlLCBibHVlV3JpdGUsIGFscGhhV3JpdGUpO1xuICAgIHRoaXMuc2V0QmxlbmRTdGF0ZShfdGVtcEJsZW5kU3RhdGUpO1xufTtcblxuR3JhcGhpY3NEZXZpY2UucHJvdG90eXBlLmdldEJsZW5kaW5nID0gZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB0aGlzLmJsZW5kU3RhdGUuYmxlbmQ7XG59O1xuXG5HcmFwaGljc0RldmljZS5wcm90b3R5cGUuc2V0QmxlbmRpbmcgPSBmdW5jdGlvbiAoYmxlbmRpbmcpIHtcbiAgICBEZWJ1Zy5kZXByZWNhdGVkKGBwYy5HcmFwaGljc0RldmljZSNzZXRCbGVuZGluZyBpcyBkZXByZWNhdGVkLCB1c2UgcGMuR3JhcGhpY3NEZXZpY2Uuc2V0QmxlbmRTdGF0ZSBpbnN0ZWFkLmApO1xuICAgIF90ZW1wQmxlbmRTdGF0ZS5jb3B5KHRoaXMuYmxlbmRTdGF0ZSk7XG4gICAgX3RlbXBCbGVuZFN0YXRlLmJsZW5kID0gYmxlbmRpbmc7XG4gICAgdGhpcy5zZXRCbGVuZFN0YXRlKF90ZW1wQmxlbmRTdGF0ZSk7XG59O1xuXG5HcmFwaGljc0RldmljZS5wcm90b3R5cGUuc2V0RGVwdGhXcml0ZSA9IGZ1bmN0aW9uICh3cml0ZSkge1xuICAgIERlYnVnLmRlcHJlY2F0ZWQoYHBjLkdyYXBoaWNzRGV2aWNlI3NldERlcHRoV3JpdGUgaXMgZGVwcmVjYXRlZCwgdXNlIHBjLkdyYXBoaWNzRGV2aWNlLnNldERlcHRoU3RhdGUgaW5zdGVhZC5gKTtcbiAgICBfdGVtcERlcHRoU3RhdGUuY29weSh0aGlzLmRlcHRoU3RhdGUpO1xuICAgIF90ZW1wRGVwdGhTdGF0ZS53cml0ZSA9IHdyaXRlO1xuICAgIHRoaXMuc2V0RGVwdGhTdGF0ZShfdGVtcERlcHRoU3RhdGUpO1xufTtcblxuR3JhcGhpY3NEZXZpY2UucHJvdG90eXBlLnNldERlcHRoRnVuYyA9IGZ1bmN0aW9uIChmdW5jKSB7XG4gICAgRGVidWcuZGVwcmVjYXRlZChgcGMuR3JhcGhpY3NEZXZpY2Ujc2V0RGVwdGhGdW5jIGlzIGRlcHJlY2F0ZWQsIHVzZSBwYy5HcmFwaGljc0RldmljZS5zZXREZXB0aFN0YXRlIGluc3RlYWQuYCk7XG4gICAgX3RlbXBEZXB0aFN0YXRlLmNvcHkodGhpcy5kZXB0aFN0YXRlKTtcbiAgICBfdGVtcERlcHRoU3RhdGUuZnVuYyA9IGZ1bmM7XG4gICAgdGhpcy5zZXREZXB0aFN0YXRlKF90ZW1wRGVwdGhTdGF0ZSk7XG59O1xuXG5HcmFwaGljc0RldmljZS5wcm90b3R5cGUuc2V0RGVwdGhUZXN0ID0gZnVuY3Rpb24gKHRlc3QpIHtcbiAgICBEZWJ1Zy5kZXByZWNhdGVkKGBwYy5HcmFwaGljc0RldmljZSNzZXREZXB0aFRlc3QgaXMgZGVwcmVjYXRlZCwgdXNlIHBjLkdyYXBoaWNzRGV2aWNlLnNldERlcHRoU3RhdGUgaW5zdGVhZC5gKTtcbiAgICBfdGVtcERlcHRoU3RhdGUuY29weSh0aGlzLmRlcHRoU3RhdGUpO1xuICAgIF90ZW1wRGVwdGhTdGF0ZS50ZXN0ID0gdGVzdDtcbiAgICB0aGlzLnNldERlcHRoU3RhdGUoX3RlbXBEZXB0aFN0YXRlKTtcbn07XG5cbkdyYXBoaWNzRGV2aWNlLnByb3RvdHlwZS5nZXRDdWxsTW9kZSA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdGhpcy5jdWxsTW9kZTtcbn07XG5cbi8vIFNDRU5FXG5cbmV4cG9ydCBjb25zdCBQaG9uZ01hdGVyaWFsID0gU3RhbmRhcmRNYXRlcmlhbDtcbmV4cG9ydCBjb25zdCBMaXRPcHRpb25zID0gTGl0U2hhZGVyT3B0aW9ucztcblxuZXhwb3J0IGNvbnN0IHNjZW5lID0ge1xuICAgIHBhcnRpdGlvblNraW46IHBhcnRpdGlvblNraW4sXG4gICAgcHJvY2VkdXJhbDoge1xuICAgICAgICBjYWxjdWxhdGVUYW5nZW50czogY2FsY3VsYXRlVGFuZ2VudHMsXG4gICAgICAgIGNyZWF0ZU1lc2g6IGNyZWF0ZU1lc2gsXG4gICAgICAgIGNyZWF0ZVRvcnVzOiBjcmVhdGVUb3J1cyxcbiAgICAgICAgY3JlYXRlQ3lsaW5kZXI6IGNyZWF0ZUN5bGluZGVyLFxuICAgICAgICBjcmVhdGVDYXBzdWxlOiBjcmVhdGVDYXBzdWxlLFxuICAgICAgICBjcmVhdGVDb25lOiBjcmVhdGVDb25lLFxuICAgICAgICBjcmVhdGVTcGhlcmU6IGNyZWF0ZVNwaGVyZSxcbiAgICAgICAgY3JlYXRlUGxhbmU6IGNyZWF0ZVBsYW5lLFxuICAgICAgICBjcmVhdGVCb3g6IGNyZWF0ZUJveFxuICAgIH0sXG4gICAgQmFzaWNNYXRlcmlhbDogQmFzaWNNYXRlcmlhbCxcbiAgICBGb3J3YXJkUmVuZGVyZXI6IEZvcndhcmRSZW5kZXJlcixcbiAgICBHcmFwaE5vZGU6IEdyYXBoTm9kZSxcbiAgICBNYXRlcmlhbDogTWF0ZXJpYWwsXG4gICAgTWVzaDogTWVzaCxcbiAgICBNZXNoSW5zdGFuY2U6IE1lc2hJbnN0YW5jZSxcbiAgICBNb2RlbDogTW9kZWwsXG4gICAgUGFydGljbGVFbWl0dGVyOiBQYXJ0aWNsZUVtaXR0ZXIsXG4gICAgUGhvbmdNYXRlcmlhbDogU3RhbmRhcmRNYXRlcmlhbCxcbiAgICBQaWNrZXI6IFBpY2tlcixcbiAgICBQcm9qZWN0aW9uOiB7XG4gICAgICAgIE9SVEhPR1JBUEhJQzogUFJPSkVDVElPTl9PUlRIT0dSQVBISUMsXG4gICAgICAgIFBFUlNQRUNUSVZFOiBQUk9KRUNUSU9OX1BFUlNQRUNUSVZFXG4gICAgfSxcbiAgICBTY2VuZTogU2NlbmUsXG4gICAgU2tpbjogU2tpbixcbiAgICBTa2luSW5zdGFuY2U6IFNraW5JbnN0YW5jZVxufTtcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KFNjZW5lLnByb3RvdHlwZSwgJ2RlZmF1bHRNYXRlcmlhbCcsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgRGVidWcuZGVwcmVjYXRlZCgncGMuU2NlbmUjZGVmYXVsdE1hdGVyaWFsIGlzIGRlcHJlY2F0ZWQuJyk7XG4gICAgICAgIHJldHVybiBnZXREZWZhdWx0TWF0ZXJpYWwoZ2V0QXBwbGljYXRpb24oKS5ncmFwaGljc0RldmljZSk7XG4gICAgfVxufSk7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShMYXllckNvbXBvc2l0aW9uLnByb3RvdHlwZSwgJ19tZXNoSW5zdGFuY2VzJywge1xuICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICBEZWJ1Zy5kZXByZWNhdGVkKCdwYy5MYXllckNvbXBvc2l0aW9uI19tZXNoSW5zdGFuY2VzIGlzIGRlcHJlY2F0ZWQuJyk7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbn0pO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoU2NlbmUucHJvdG90eXBlLCAnZHJhd0NhbGxzJywge1xuICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICBEZWJ1Zy5kZXByZWNhdGVkKCdwYy5TY2VuZSNkcmF3Q2FsbHMgaXMgZGVwcmVjYXRlZCBhbmQgbm8gbG9uZ2VyIHByb3ZpZGVzIG1lc2ggaW5zdGFuY2VzLicpO1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG59KTtcblxuLy8gc2NlbmUuc2t5Ym94UHJlZmlsdGVyZWQqKioqIGFyZSBkZXByZWNhdGVkXG5bJzEyOCcsICc2NCcsICczMicsICcxNicsICc4JywgJzQnXS5mb3JFYWNoKChzaXplLCBpbmRleCkgPT4ge1xuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShTY2VuZS5wcm90b3R5cGUsIGBza3lib3hQcmVmaWx0ZXJlZCR7c2l6ZX1gLCB7XG4gICAgICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgRGVidWcuZGVwcmVjYXRlZChgcGMuU2NlbmUjc2t5Ym94UHJlZmlsdGVyZWQke3NpemV9IGlzIGRlcHJlY2F0ZWQuIFVzZSBwYy5TY2VuZSNwcmVmaWx0ZXJlZEN1YmVtYXBzIGluc3RlYWQuYCk7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fcHJlZmlsdGVyZWRDdWJlbWFwc1tpbmRleF07XG4gICAgICAgIH0sXG4gICAgICAgIHNldDogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICBEZWJ1Zy5kZXByZWNhdGVkKGBwYy5TY2VuZSNza3lib3hQcmVmaWx0ZXJlZCR7c2l6ZX0gaXMgZGVwcmVjYXRlZC4gVXNlIHBjLlNjZW5lI3ByZWZpbHRlcmVkQ3ViZW1hcHMgaW5zdGVhZC5gKTtcbiAgICAgICAgICAgIHRoaXMuX3ByZWZpbHRlcmVkQ3ViZW1hcHNbaW5kZXhdID0gdmFsdWU7XG4gICAgICAgICAgICB0aGlzLnVwZGF0ZVNoYWRlcnMgPSB0cnVlO1xuICAgICAgICB9XG4gICAgfSk7XG59KTtcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KFNjZW5lLnByb3RvdHlwZSwgJ21vZGVscycsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKCF0aGlzLl9tb2RlbHMpIHtcbiAgICAgICAgICAgIHRoaXMuX21vZGVscyA9IFtdO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLl9tb2RlbHM7XG4gICAgfVxufSk7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShMYXllci5wcm90b3R5cGUsICdyZW5kZXJUYXJnZXQnLCB7XG4gICAgc2V0OiBmdW5jdGlvbiAocnQpIHtcbiAgICAgICAgRGVidWcuZGVwcmVjYXRlZChgcGMuTGF5ZXIjcmVuZGVyVGFyZ2V0IGlzIGRlcHJlY2F0ZWQuIFNldCB0aGUgcmVuZGVyIHRhcmdldCBvbiB0aGUgY2FtZXJhIGluc3RlYWQuYCk7XG4gICAgICAgIHRoaXMuX3JlbmRlclRhcmdldCA9IHJ0O1xuICAgICAgICB0aGlzLl9kaXJ0eUNhbWVyYXMgPSB0cnVlO1xuICAgIH0sXG4gICAgZ2V0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9yZW5kZXJUYXJnZXQ7XG4gICAgfVxufSk7XG5cbi8vIFRoaXMgY2FuIGJlIHJlbW92ZWQgd2hlbiAxLjU2IGlzIG91dCBhbmQgdGhlIEVkaXRvciBubyBsb25nZXIgY2FsbHMgdGhpc1xuU2NlbmUucHJvdG90eXBlLl91cGRhdGVTa3lib3ggPSBmdW5jdGlvbiAoZGV2aWNlKSB7XG4gICAgRGVidWcuZGVwcmVjYXRlZChgcGMuU2NlbmUjX3VwZGF0ZVNreWJveCBpcyBkZXByZWNhdGVkLiBVc2UgcGMuU2NlbmUjX3VwZGF0ZVNreSBpbnN0ZWFkLmApO1xuICAgIHRoaXMuX3VwZGF0ZVNreShkZXZpY2UpO1xufTtcblxuU2NlbmUucHJvdG90eXBlLmFkZE1vZGVsID0gZnVuY3Rpb24gKG1vZGVsKSB7XG4gICAgRGVidWcuZGVwcmVjYXRlZCgncGMuU2NlbmUjYWRkTW9kZWwgaXMgZGVwcmVjYXRlZC4nKTtcbiAgICBpZiAodGhpcy5jb250YWluc01vZGVsKG1vZGVsKSkgcmV0dXJuO1xuICAgIGNvbnN0IGxheWVyID0gdGhpcy5sYXllcnMuZ2V0TGF5ZXJCeUlkKExBWUVSSURfV09STEQpO1xuICAgIGlmICghbGF5ZXIpIHJldHVybjtcbiAgICBsYXllci5hZGRNZXNoSW5zdGFuY2VzKG1vZGVsLm1lc2hJbnN0YW5jZXMpO1xuICAgIHRoaXMubW9kZWxzLnB1c2gobW9kZWwpO1xufTtcblxuU2NlbmUucHJvdG90eXBlLmFkZFNoYWRvd0Nhc3RlciA9IGZ1bmN0aW9uIChtb2RlbCkge1xuICAgIERlYnVnLmRlcHJlY2F0ZWQoJ3BjLlNjZW5lI2FkZFNoYWRvd0Nhc3RlciBpcyBkZXByZWNhdGVkLicpO1xuICAgIGNvbnN0IGxheWVyID0gdGhpcy5sYXllcnMuZ2V0TGF5ZXJCeUlkKExBWUVSSURfV09STEQpO1xuICAgIGlmICghbGF5ZXIpIHJldHVybjtcbiAgICBsYXllci5hZGRTaGFkb3dDYXN0ZXJzKG1vZGVsLm1lc2hJbnN0YW5jZXMpO1xufTtcblxuU2NlbmUucHJvdG90eXBlLnJlbW92ZU1vZGVsID0gZnVuY3Rpb24gKG1vZGVsKSB7XG4gICAgRGVidWcuZGVwcmVjYXRlZCgncGMuU2NlbmUjcmVtb3ZlTW9kZWwgaXMgZGVwcmVjYXRlZC4nKTtcbiAgICBjb25zdCBpbmRleCA9IHRoaXMubW9kZWxzLmluZGV4T2YobW9kZWwpO1xuICAgIGlmIChpbmRleCAhPT0gLTEpIHtcbiAgICAgICAgY29uc3QgbGF5ZXIgPSB0aGlzLmxheWVycy5nZXRMYXllckJ5SWQoTEFZRVJJRF9XT1JMRCk7XG4gICAgICAgIGlmICghbGF5ZXIpIHJldHVybjtcbiAgICAgICAgbGF5ZXIucmVtb3ZlTWVzaEluc3RhbmNlcyhtb2RlbC5tZXNoSW5zdGFuY2VzKTtcbiAgICAgICAgdGhpcy5tb2RlbHMuc3BsaWNlKGluZGV4LCAxKTtcbiAgICB9XG59O1xuXG5TY2VuZS5wcm90b3R5cGUucmVtb3ZlU2hhZG93Q2FzdGVycyA9IGZ1bmN0aW9uIChtb2RlbCkge1xuICAgIERlYnVnLmRlcHJlY2F0ZWQoJ3BjLlNjZW5lI3JlbW92ZVNoYWRvd0Nhc3RlcnMgaXMgZGVwcmVjYXRlZC4nKTtcbiAgICBjb25zdCBsYXllciA9IHRoaXMubGF5ZXJzLmdldExheWVyQnlJZChMQVlFUklEX1dPUkxEKTtcbiAgICBpZiAoIWxheWVyKSByZXR1cm47XG4gICAgbGF5ZXIucmVtb3ZlU2hhZG93Q2FzdGVycyhtb2RlbC5tZXNoSW5zdGFuY2VzKTtcbn07XG5cblNjZW5lLnByb3RvdHlwZS5jb250YWluc01vZGVsID0gZnVuY3Rpb24gKG1vZGVsKSB7XG4gICAgRGVidWcuZGVwcmVjYXRlZCgncGMuU2NlbmUjY29udGFpbnNNb2RlbCBpcyBkZXByZWNhdGVkLicpO1xuICAgIHJldHVybiB0aGlzLm1vZGVscy5pbmRleE9mKG1vZGVsKSA+PSAwO1xufTtcblxuU2NlbmUucHJvdG90eXBlLmdldE1vZGVscyA9IGZ1bmN0aW9uIChtb2RlbCkge1xuICAgIERlYnVnLmRlcHJlY2F0ZWQoJ3BjLlNjZW5lI2dldE1vZGVscyBpcyBkZXByZWNhdGVkLicpO1xuICAgIHJldHVybiB0aGlzLm1vZGVscztcbn07XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShCYXRjaC5wcm90b3R5cGUsICdtb2RlbCcsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgRGVidWcuZGVwcmVjYXRlZCgncGMuQmF0Y2gjbW9kZWwgaXMgZGVwcmVjYXRlZC4gVXNlIHBjLkJhdGNoI21lc2hJbnN0YW5jZSB0byBhY2Nlc3MgYmF0Y2hlZCBtZXNoIGluc3RlYWQuJyk7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbn0pO1xuXG5Gb3J3YXJkUmVuZGVyZXIucHJvdG90eXBlLnJlbmRlckNvbXBvc2l0aW9uID0gZnVuY3Rpb24gKGNvbXApIHtcbiAgICBEZWJ1Zy5kZXByZWNhdGVkKCdwYy5Gb3J3YXJkUmVuZGVyZXIjcmVuZGVyQ29tcG9zaXRpb24gaXMgZGVwcmVjYXRlZC4gVXNlIHBjLkFwcEJhc2UucmVuZGVyQ29tcG9zaXRpb24gaW5zdGVhZC4nKTtcbiAgICBnZXRBcHBsaWNhdGlvbigpLnJlbmRlckNvbXBvc2l0aW9uKGNvbXApO1xufTtcblxuTWVzaEluc3RhbmNlLnByb3RvdHlwZS5zeW5jQWFiYiA9IGZ1bmN0aW9uICgpIHtcbiAgICBEZWJ1Zy5kZXByZWNhdGVkKCdwYy5NZXNoSW5zdGFuY2Ujc3luY0FhYmIgaXMgZGVwcmVjYXRlZC4nKTtcbn07XG5cbk1vcnBoLnByb3RvdHlwZS5nZXRUYXJnZXQgPSBmdW5jdGlvbiAoaW5kZXgpIHtcbiAgICBEZWJ1Zy5kZXByZWNhdGVkKCdwYy5Nb3JwaCNnZXRUYXJnZXQgaXMgZGVwcmVjYXRlZC4gVXNlIHBjLk1vcnBoI3RhcmdldHMgaW5zdGVhZC4nKTtcblxuICAgIHJldHVybiB0aGlzLnRhcmdldHNbaW5kZXhdO1xufTtcblxuR3JhcGhOb2RlLnByb3RvdHlwZS5fZGlydGlmeSA9IGZ1bmN0aW9uIChsb2NhbCkge1xuICAgIERlYnVnLmRlcHJlY2F0ZWQoJ3BjLkdyYXBoTm9kZSNfZGlydGlmeSBpcyBkZXByZWNhdGVkLiBVc2UgcGMuR3JhcGhOb2RlI19kaXJ0aWZ5TG9jYWwgb3IgX2RpcnRpZnlXb3JsZCByZXNwZWN0aXZlbHkgaW5zdGVhZC4nKTtcbiAgICBpZiAobG9jYWwpXG4gICAgICAgIHRoaXMuX2RpcnRpZnlMb2NhbCgpO1xuICAgIGVsc2VcbiAgICAgICAgdGhpcy5fZGlydGlmeVdvcmxkKCk7XG59O1xuXG5HcmFwaE5vZGUucHJvdG90eXBlLmFkZExhYmVsID0gZnVuY3Rpb24gKGxhYmVsKSB7XG4gICAgRGVidWcuZGVwcmVjYXRlZCgncGMuR3JhcGhOb2RlI2FkZExhYmVsIGlzIGRlcHJlY2F0ZWQuIFVzZSBwYy5HcmFwaE5vZGUjdGFncyBpbnN0ZWFkLicpO1xuXG4gICAgdGhpcy5fbGFiZWxzW2xhYmVsXSA9IHRydWU7XG59O1xuXG5HcmFwaE5vZGUucHJvdG90eXBlLmdldExhYmVscyA9IGZ1bmN0aW9uICgpIHtcbiAgICBEZWJ1Zy5kZXByZWNhdGVkKCdwYy5HcmFwaE5vZGUjZ2V0TGFiZWxzIGlzIGRlcHJlY2F0ZWQuIFVzZSBwYy5HcmFwaE5vZGUjdGFncyBpbnN0ZWFkLicpO1xuXG4gICAgcmV0dXJuIE9iamVjdC5rZXlzKHRoaXMuX2xhYmVscyk7XG59O1xuXG5HcmFwaE5vZGUucHJvdG90eXBlLmhhc0xhYmVsID0gZnVuY3Rpb24gKGxhYmVsKSB7XG4gICAgRGVidWcuZGVwcmVjYXRlZCgncGMuR3JhcGhOb2RlI2hhc0xhYmVsIGlzIGRlcHJlY2F0ZWQuIFVzZSBwYy5HcmFwaE5vZGUjdGFncyBpbnN0ZWFkLicpO1xuXG4gICAgcmV0dXJuICEhdGhpcy5fbGFiZWxzW2xhYmVsXTtcbn07XG5cbkdyYXBoTm9kZS5wcm90b3R5cGUucmVtb3ZlTGFiZWwgPSBmdW5jdGlvbiAobGFiZWwpIHtcbiAgICBEZWJ1Zy5kZXByZWNhdGVkKCdwYy5HcmFwaE5vZGUjcmVtb3ZlTGFiZWwgaXMgZGVwcmVjYXRlZC4gVXNlIHBjLkdyYXBoTm9kZSN0YWdzIGluc3RlYWQuJyk7XG5cbiAgICBkZWxldGUgdGhpcy5fbGFiZWxzW2xhYmVsXTtcbn07XG5cbkdyYXBoTm9kZS5wcm90b3R5cGUuZmluZEJ5TGFiZWwgPSBmdW5jdGlvbiAobGFiZWwsIHJlc3VsdHMgPSBbXSkge1xuICAgIERlYnVnLmRlcHJlY2F0ZWQoJ3BjLkdyYXBoTm9kZSNmaW5kQnlMYWJlbCBpcyBkZXByZWNhdGVkLiBVc2UgcGMuR3JhcGhOb2RlI3RhZ3MgaW5zdGVhZC4nKTtcblxuICAgIGlmICh0aGlzLmhhc0xhYmVsKGxhYmVsKSkge1xuICAgICAgICByZXN1bHRzLnB1c2godGhpcyk7XG4gICAgfVxuXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLl9jaGlsZHJlbi5sZW5ndGg7ICsraSkge1xuICAgICAgICByZXN1bHRzID0gdGhpcy5fY2hpbGRyZW5baV0uZmluZEJ5TGFiZWwobGFiZWwsIHJlc3VsdHMpO1xuICAgIH1cblxuICAgIHJldHVybiByZXN1bHRzO1xufTtcblxuR3JhcGhOb2RlLnByb3RvdHlwZS5nZXRDaGlsZHJlbiA9IGZ1bmN0aW9uICgpIHtcbiAgICBEZWJ1Zy5kZXByZWNhdGVkKCdwYy5HcmFwaE5vZGUjZ2V0Q2hpbGRyZW4gaXMgZGVwcmVjYXRlZC4gVXNlIHBjLkdyYXBoTm9kZSNjaGlsZHJlbiBpbnN0ZWFkLicpO1xuXG4gICAgcmV0dXJuIHRoaXMuY2hpbGRyZW47XG59O1xuXG5HcmFwaE5vZGUucHJvdG90eXBlLmdldE5hbWUgPSBmdW5jdGlvbiAoKSB7XG4gICAgRGVidWcuZGVwcmVjYXRlZCgncGMuR3JhcGhOb2RlI2dldE5hbWUgaXMgZGVwcmVjYXRlZC4gVXNlIHBjLkdyYXBoTm9kZSNuYW1lIGluc3RlYWQuJyk7XG5cbiAgICByZXR1cm4gdGhpcy5uYW1lO1xufTtcblxuR3JhcGhOb2RlLnByb3RvdHlwZS5nZXRQYXRoID0gZnVuY3Rpb24gKCkge1xuICAgIERlYnVnLmRlcHJlY2F0ZWQoJ3BjLkdyYXBoTm9kZSNnZXRQYXRoIGlzIGRlcHJlY2F0ZWQuIFVzZSBwYy5HcmFwaE5vZGUjcGF0aCBpbnN0ZWFkLicpO1xuXG4gICAgcmV0dXJuIHRoaXMucGF0aDtcbn07XG5cbkdyYXBoTm9kZS5wcm90b3R5cGUuZ2V0Um9vdCA9IGZ1bmN0aW9uICgpIHtcbiAgICBEZWJ1Zy5kZXByZWNhdGVkKCdwYy5HcmFwaE5vZGUjZ2V0Um9vdCBpcyBkZXByZWNhdGVkLiBVc2UgcGMuR3JhcGhOb2RlI3Jvb3QgaW5zdGVhZC4nKTtcblxuICAgIHJldHVybiB0aGlzLnJvb3Q7XG59O1xuXG5HcmFwaE5vZGUucHJvdG90eXBlLmdldFBhcmVudCA9IGZ1bmN0aW9uICgpIHtcbiAgICBEZWJ1Zy5kZXByZWNhdGVkKCdwYy5HcmFwaE5vZGUjZ2V0UGFyZW50IGlzIGRlcHJlY2F0ZWQuIFVzZSBwYy5HcmFwaE5vZGUjcGFyZW50IGluc3RlYWQuJyk7XG5cbiAgICByZXR1cm4gdGhpcy5wYXJlbnQ7XG59O1xuXG5HcmFwaE5vZGUucHJvdG90eXBlLnNldE5hbWUgPSBmdW5jdGlvbiAobmFtZSkge1xuICAgIERlYnVnLmRlcHJlY2F0ZWQoJ3BjLkdyYXBoTm9kZSNzZXROYW1lIGlzIGRlcHJlY2F0ZWQuIFVzZSBwYy5HcmFwaE5vZGUjbmFtZSBpbnN0ZWFkLicpO1xuXG4gICAgdGhpcy5uYW1lID0gbmFtZTtcbn07XG5cbk1hdGVyaWFsLnByb3RvdHlwZS5nZXROYW1lID0gZnVuY3Rpb24gKCkge1xuICAgIERlYnVnLmRlcHJlY2F0ZWQoJ3BjLk1hdGVyaWFsI2dldE5hbWUgaXMgZGVwcmVjYXRlZC4gVXNlIHBjLk1hdGVyaWFsI25hbWUgaW5zdGVhZC4nKTtcbiAgICByZXR1cm4gdGhpcy5uYW1lO1xufTtcblxuTWF0ZXJpYWwucHJvdG90eXBlLnNldE5hbWUgPSBmdW5jdGlvbiAobmFtZSkge1xuICAgIERlYnVnLmRlcHJlY2F0ZWQoJ3BjLk1hdGVyaWFsI3NldE5hbWUgaXMgZGVwcmVjYXRlZC4gVXNlIHBjLk1hdGVyaWFsI25hbWUgaW5zdGVhZC4nKTtcbiAgICB0aGlzLm5hbWUgPSBuYW1lO1xufTtcblxuTWF0ZXJpYWwucHJvdG90eXBlLmdldFNoYWRlciA9IGZ1bmN0aW9uICgpIHtcbiAgICBEZWJ1Zy5kZXByZWNhdGVkKCdwYy5NYXRlcmlhbCNnZXRTaGFkZXIgaXMgZGVwcmVjYXRlZC4gVXNlIHBjLk1hdGVyaWFsI3NoYWRlciBpbnN0ZWFkLicpO1xuICAgIHJldHVybiB0aGlzLnNoYWRlcjtcbn07XG5cbk1hdGVyaWFsLnByb3RvdHlwZS5zZXRTaGFkZXIgPSBmdW5jdGlvbiAoc2hhZGVyKSB7XG4gICAgRGVidWcuZGVwcmVjYXRlZCgncGMuTWF0ZXJpYWwjc2V0U2hhZGVyIGlzIGRlcHJlY2F0ZWQuIFVzZSBwYy5NYXRlcmlhbCNzaGFkZXIgaW5zdGVhZC4nKTtcbiAgICB0aGlzLnNoYWRlciA9IHNoYWRlcjtcbn07XG5cbi8vIE5vdGU6IHRoaXMgaXMgdXNlZCBieSB0aGUgRWRpdG9yXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoTWF0ZXJpYWwucHJvdG90eXBlLCAnYmxlbmQnLCB7XG4gICAgc2V0OiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgRGVidWcuZGVwcmVjYXRlZChgcGMuTWF0ZXJpYWwjYmxlbmQgaXMgZGVwcmVjYXRlZCwgdXNlIHBjLk1hdGVyaWFsLmJsZW5kU3RhdGUuYCk7XG4gICAgICAgIHRoaXMuYmxlbmRTdGF0ZS5ibGVuZCA9IHZhbHVlO1xuICAgIH0sXG4gICAgZ2V0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmJsZW5kU3RhdGUuYmxlbmQ7XG4gICAgfVxufSk7XG5cbi8vIE5vdGU6IHRoaXMgaXMgdXNlZCBieSB0aGUgRWRpdG9yXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoTWF0ZXJpYWwucHJvdG90eXBlLCAnYmxlbmRTcmMnLCB7XG4gICAgc2V0OiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgRGVidWcuZGVwcmVjYXRlZChgcGMuTWF0ZXJpYWwjYmxlbmRTcmMgaXMgZGVwcmVjYXRlZCwgdXNlIHBjLk1hdGVyaWFsLmJsZW5kU3RhdGUuYCk7XG4gICAgICAgIGNvbnN0IGN1cnJlbnRCbGVuZFN0YXRlID0gdGhpcy5ibGVuZFN0YXRlO1xuICAgICAgICBfdGVtcEJsZW5kU3RhdGUuY29weShjdXJyZW50QmxlbmRTdGF0ZSk7XG4gICAgICAgIF90ZW1wQmxlbmRTdGF0ZS5zZXRDb2xvckJsZW5kKGN1cnJlbnRCbGVuZFN0YXRlLmNvbG9yT3AsIHZhbHVlLCBjdXJyZW50QmxlbmRTdGF0ZS5jb2xvckRzdEZhY3Rvcik7XG4gICAgICAgIF90ZW1wQmxlbmRTdGF0ZS5zZXRBbHBoYUJsZW5kKGN1cnJlbnRCbGVuZFN0YXRlLmFscGhhT3AsIHZhbHVlLCBjdXJyZW50QmxlbmRTdGF0ZS5hbHBoYURzdEZhY3Rvcik7XG4gICAgICAgIHRoaXMuYmxlbmRTdGF0ZSA9IF90ZW1wQmxlbmRTdGF0ZTtcbiAgICB9LFxuICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5ibGVuZFN0YXRlLmNvbG9yU3JjRmFjdG9yO1xuICAgIH1cbn0pO1xuXG4vLyBOb3RlOiB0aGlzIGlzIHVzZWQgYnkgdGhlIEVkaXRvclxuT2JqZWN0LmRlZmluZVByb3BlcnR5KE1hdGVyaWFsLnByb3RvdHlwZSwgJ2JsZW5kRHN0Jywge1xuICAgIHNldDogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgIERlYnVnLmRlcHJlY2F0ZWQoYHBjLk1hdGVyaWFsI2JsZW5kRHN0IGlzIGRlcHJlY2F0ZWQsIHVzZSBwYy5NYXRlcmlhbC5ibGVuZFN0YXRlLmApO1xuICAgICAgICBjb25zdCBjdXJyZW50QmxlbmRTdGF0ZSA9IHRoaXMuYmxlbmRTdGF0ZTtcbiAgICAgICAgX3RlbXBCbGVuZFN0YXRlLmNvcHkoY3VycmVudEJsZW5kU3RhdGUpO1xuICAgICAgICBfdGVtcEJsZW5kU3RhdGUuc2V0Q29sb3JCbGVuZChjdXJyZW50QmxlbmRTdGF0ZS5jb2xvck9wLCBjdXJyZW50QmxlbmRTdGF0ZS5jb2xvclNyY0ZhY3RvciwgdmFsdWUpO1xuICAgICAgICBfdGVtcEJsZW5kU3RhdGUuc2V0QWxwaGFCbGVuZChjdXJyZW50QmxlbmRTdGF0ZS5hbHBoYU9wLCBjdXJyZW50QmxlbmRTdGF0ZS5hbHBoYVNyY0ZhY3RvciwgdmFsdWUpO1xuICAgICAgICB0aGlzLmJsZW5kU3RhdGUgPSBfdGVtcEJsZW5kU3RhdGU7XG4gICAgfSxcbiAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuYmxlbmRTdGF0ZS5jb2xvckRzdEZhY3RvcjtcbiAgICB9XG59KTtcblxuLy8gc2hpbmluZXNzIChyYW5nZSAwLi4xMDApIC0gbWFwcyB0byBpbnRlcm5hbCBnbG9zcyB2YWx1ZSAocmFuZ2UgMC4uMSlcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShTdGFuZGFyZE1hdGVyaWFsLnByb3RvdHlwZSwgJ3NoaW5pbmVzcycsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2xvc3MgKiAxMDA7XG4gICAgfSxcbiAgICBzZXQ6IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICB0aGlzLmdsb3NzID0gdmFsdWUgKiAwLjAxO1xuICAgIH1cbn0pO1xuXG5mdW5jdGlvbiBfZGVmaW5lQWxpYXMobmV3TmFtZSwgb2xkTmFtZSkge1xuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShTdGFuZGFyZE1hdGVyaWFsLnByb3RvdHlwZSwgb2xkTmFtZSwge1xuICAgICAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIERlYnVnLmRlcHJlY2F0ZWQoYHBjLlN0YW5kYXJkTWF0ZXJpYWwjJHtvbGROYW1lfSBpcyBkZXByZWNhdGVkLiBVc2UgcGMuU3RhbmRhcmRNYXRlcmlhbCMke25ld05hbWV9IGluc3RlYWQuYCk7XG4gICAgICAgICAgICByZXR1cm4gdGhpc1tuZXdOYW1lXTtcbiAgICAgICAgfSxcbiAgICAgICAgc2V0OiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgIERlYnVnLmRlcHJlY2F0ZWQoYHBjLlN0YW5kYXJkTWF0ZXJpYWwjJHtvbGROYW1lfSBpcyBkZXByZWNhdGVkLiBVc2UgcGMuU3RhbmRhcmRNYXRlcmlhbCMke25ld05hbWV9IGluc3RlYWQuYCk7XG4gICAgICAgICAgICB0aGlzW25ld05hbWVdID0gdmFsdWU7XG4gICAgICAgIH1cbiAgICB9KTtcbn1cblxuX2RlZmluZUFsaWFzKCdkaWZmdXNlVGludCcsICdkaWZmdXNlTWFwVGludCcpO1xuX2RlZmluZUFsaWFzKCdzcGVjdWxhclRpbnQnLCAnc3BlY3VsYXJNYXBUaW50Jyk7XG5fZGVmaW5lQWxpYXMoJ2VtaXNzaXZlVGludCcsICdlbWlzc2l2ZU1hcFRpbnQnKTtcbl9kZWZpbmVBbGlhcygnYW9WZXJ0ZXhDb2xvcicsICdhb01hcFZlcnRleENvbG9yJyk7XG5fZGVmaW5lQWxpYXMoJ2RpZmZ1c2VWZXJ0ZXhDb2xvcicsICdkaWZmdXNlTWFwVmVydGV4Q29sb3InKTtcbl9kZWZpbmVBbGlhcygnc3BlY3VsYXJWZXJ0ZXhDb2xvcicsICdzcGVjdWxhck1hcFZlcnRleENvbG9yJyk7XG5fZGVmaW5lQWxpYXMoJ2VtaXNzaXZlVmVydGV4Q29sb3InLCAnZW1pc3NpdmVNYXBWZXJ0ZXhDb2xvcicpO1xuX2RlZmluZUFsaWFzKCdtZXRhbG5lc3NWZXJ0ZXhDb2xvcicsICdtZXRhbG5lc3NNYXBWZXJ0ZXhDb2xvcicpO1xuX2RlZmluZUFsaWFzKCdnbG9zc1ZlcnRleENvbG9yJywgJ2dsb3NzTWFwVmVydGV4Q29sb3InKTtcbl9kZWZpbmVBbGlhcygnb3BhY2l0eVZlcnRleENvbG9yJywgJ29wYWNpdHlNYXBWZXJ0ZXhDb2xvcicpO1xuX2RlZmluZUFsaWFzKCdsaWdodFZlcnRleENvbG9yJywgJ2xpZ2h0TWFwVmVydGV4Q29sb3InKTtcblxuX2RlZmluZUFsaWFzKCdzaGVlbkdsb3NzJywgJ3NoZWVuR2xvc3NpZXNzJyk7XG5fZGVmaW5lQWxpYXMoJ2NsZWFyQ29hdEdsb3NzJywgJ2NsZWFyQ29zdEdsb3NzaW5lc3MnKTtcblxuZnVuY3Rpb24gX2RlZmluZU9wdGlvbihuYW1lLCBuZXdOYW1lKSB7XG4gICAgaWYgKG5hbWUgIT09ICdwYXNzJykge1xuICAgICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkoU3RhbmRhcmRNYXRlcmlhbE9wdGlvbnMucHJvdG90eXBlLCBuYW1lLCB7XG4gICAgICAgICAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBEZWJ1Zy5kZXByZWNhdGVkKGBHZXR0aW5nIHBjLk9wdGlvbnMjJHtuYW1lfSBoYXMgYmVlbiBkZXByZWNhdGVkIGFzIHRoZSBwcm9wZXJ0eSBoYXMgYmVlbiBtb3ZlZCB0byBwYy5PcHRpb25zLkxpdFNoYWRlck9wdGlvbnMjJHtuZXdOYW1lIHx8IG5hbWV9LmApO1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmxpdE9wdGlvbnNbbmV3TmFtZSB8fCBuYW1lXTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBzZXQ6IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICAgIERlYnVnLmRlcHJlY2F0ZWQoYFNldHRpbmcgcGMuT3B0aW9ucyMke25hbWV9IGhhcyBiZWVuIGRlcHJlY2F0ZWQgYXMgdGhlIHByb3BlcnR5IGhhcyBiZWVuIG1vdmVkIHRvIHBjLk9wdGlvbnMuTGl0U2hhZGVyT3B0aW9ucyMke25ld05hbWUgfHwgbmFtZX0uYCk7XG4gICAgICAgICAgICAgICAgdGhpcy5saXRPcHRpb25zW25ld05hbWUgfHwgbmFtZV0gPSB2YWx1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxufVxuX2RlZmluZU9wdGlvbigncmVmcmFjdGlvbicsICd1c2VSZWZyYWN0aW9uJyk7XG5cbmNvbnN0IHRlbXBPcHRpb25zID0gbmV3IExpdFNoYWRlck9wdGlvbnMoKTtcbmNvbnN0IGxpdE9wdGlvblByb3BlcnRpZXMgPSBPYmplY3QuZ2V0T3duUHJvcGVydHlOYW1lcyh0ZW1wT3B0aW9ucyk7XG5mb3IgKGNvbnN0IGxpdE9wdGlvbiBpbiBsaXRPcHRpb25Qcm9wZXJ0aWVzKSB7XG4gICAgX2RlZmluZU9wdGlvbihsaXRPcHRpb25Qcm9wZXJ0aWVzW2xpdE9wdGlvbl0pO1xufVxuXG4vLyBBTklNQVRJT05cblxuZXhwb3J0IGNvbnN0IGFuaW0gPSB7XG4gICAgQW5pbWF0aW9uOiBBbmltYXRpb24sXG4gICAgS2V5OiBLZXksXG4gICAgTm9kZTogTm9kZSxcbiAgICBTa2VsZXRvbjogU2tlbGV0b25cbn07XG5cbkFuaW1hdGlvbi5wcm90b3R5cGUuZ2V0RHVyYXRpb24gPSBmdW5jdGlvbiAoKSB7XG4gICAgRGVidWcuZGVwcmVjYXRlZCgncGMuQW5pbWF0aW9uI2dldER1cmF0aW9uIGlzIGRlcHJlY2F0ZWQuIFVzZSBwYy5BbmltYXRpb24jZHVyYXRpb24gaW5zdGVhZC4nKTtcbiAgICByZXR1cm4gdGhpcy5kdXJhdGlvbjtcbn07XG5cbkFuaW1hdGlvbi5wcm90b3R5cGUuZ2V0TmFtZSA9IGZ1bmN0aW9uICgpIHtcbiAgICBEZWJ1Zy5kZXByZWNhdGVkKCdwYy5BbmltYXRpb24jZ2V0TmFtZSBpcyBkZXByZWNhdGVkLiBVc2UgcGMuQW5pbWF0aW9uI25hbWUgaW5zdGVhZC4nKTtcbiAgICByZXR1cm4gdGhpcy5uYW1lO1xufTtcblxuQW5pbWF0aW9uLnByb3RvdHlwZS5nZXROb2RlcyA9IGZ1bmN0aW9uICgpIHtcbiAgICBEZWJ1Zy5kZXByZWNhdGVkKCdwYy5BbmltYXRpb24jZ2V0Tm9kZXMgaXMgZGVwcmVjYXRlZC4gVXNlIHBjLkFuaW1hdGlvbiNub2RlcyBpbnN0ZWFkLicpO1xuICAgIHJldHVybiB0aGlzLm5vZGVzO1xufTtcblxuQW5pbWF0aW9uLnByb3RvdHlwZS5zZXREdXJhdGlvbiA9IGZ1bmN0aW9uIChkdXJhdGlvbikge1xuICAgIERlYnVnLmRlcHJlY2F0ZWQoJ3BjLkFuaW1hdGlvbiNzZXREdXJhdGlvbiBpcyBkZXByZWNhdGVkLiBVc2UgcGMuQW5pbWF0aW9uI2R1cmF0aW9uIGluc3RlYWQuJyk7XG4gICAgdGhpcy5kdXJhdGlvbiA9IGR1cmF0aW9uO1xufTtcblxuQW5pbWF0aW9uLnByb3RvdHlwZS5zZXROYW1lID0gZnVuY3Rpb24gKG5hbWUpIHtcbiAgICBEZWJ1Zy5kZXByZWNhdGVkKCdwYy5BbmltYXRpb24jc2V0TmFtZSBpcyBkZXByZWNhdGVkLiBVc2UgcGMuQW5pbWF0aW9uI25hbWUgaW5zdGVhZC4nKTtcbiAgICB0aGlzLm5hbWUgPSBuYW1lO1xufTtcblxuU2tlbGV0b24ucHJvdG90eXBlLmdldEFuaW1hdGlvbiA9IGZ1bmN0aW9uICgpIHtcbiAgICBEZWJ1Zy5kZXByZWNhdGVkKCdwYy5Ta2VsZXRvbiNnZXRBbmltYXRpb24gaXMgZGVwcmVjYXRlZC4gVXNlIHBjLlNrZWxldG9uI2FuaW1hdGlvbiBpbnN0ZWFkLicpO1xuICAgIHJldHVybiB0aGlzLmFuaW1hdGlvbjtcbn07XG5cblNrZWxldG9uLnByb3RvdHlwZS5nZXRDdXJyZW50VGltZSA9IGZ1bmN0aW9uICgpIHtcbiAgICBEZWJ1Zy5kZXByZWNhdGVkKCdwYy5Ta2VsZXRvbiNnZXRDdXJyZW50VGltZSBpcyBkZXByZWNhdGVkLiBVc2UgcGMuU2tlbGV0b24jY3VycmVudFRpbWUgaW5zdGVhZC4nKTtcbiAgICByZXR1cm4gdGhpcy5jdXJyZW50VGltZTtcbn07XG5cblNrZWxldG9uLnByb3RvdHlwZS5nZXRMb29waW5nID0gZnVuY3Rpb24gKCkge1xuICAgIERlYnVnLmRlcHJlY2F0ZWQoJ3BjLlNrZWxldG9uI2dldExvb3BpbmcgaXMgZGVwcmVjYXRlZC4gVXNlIHBjLlNrZWxldG9uI2xvb3BpbmcgaW5zdGVhZC4nKTtcbiAgICByZXR1cm4gdGhpcy5sb29waW5nO1xufTtcblxuU2tlbGV0b24ucHJvdG90eXBlLmdldE51bU5vZGVzID0gZnVuY3Rpb24gKCkge1xuICAgIERlYnVnLmRlcHJlY2F0ZWQoJ3BjLlNrZWxldG9uI2dldE51bU5vZGVzIGlzIGRlcHJlY2F0ZWQuIFVzZSBwYy5Ta2VsZXRvbiNudW1Ob2RlcyBpbnN0ZWFkLicpO1xuICAgIHJldHVybiB0aGlzLm51bU5vZGVzO1xufTtcblxuU2tlbGV0b24ucHJvdG90eXBlLnNldEFuaW1hdGlvbiA9IGZ1bmN0aW9uIChhbmltYXRpb24pIHtcbiAgICBEZWJ1Zy5kZXByZWNhdGVkKCdwYy5Ta2VsZXRvbiNzZXRBbmltYXRpb24gaXMgZGVwcmVjYXRlZC4gVXNlIHBjLlNrZWxldG9uI2FuaW1hdGlvbiBpbnN0ZWFkLicpO1xuICAgIHRoaXMuYW5pbWF0aW9uID0gYW5pbWF0aW9uO1xufTtcblxuU2tlbGV0b24ucHJvdG90eXBlLnNldEN1cnJlbnRUaW1lID0gZnVuY3Rpb24gKHRpbWUpIHtcbiAgICBEZWJ1Zy5kZXByZWNhdGVkKCdwYy5Ta2VsZXRvbiNzZXRDdXJyZW50VGltZSBpcyBkZXByZWNhdGVkLiBVc2UgcGMuU2tlbGV0b24jY3VycmVudFRpbWUgaW5zdGVhZC4nKTtcbiAgICB0aGlzLmN1cnJlbnRUaW1lID0gdGltZTtcbn07XG5cblNrZWxldG9uLnByb3RvdHlwZS5zZXRMb29waW5nID0gZnVuY3Rpb24gKGxvb3BpbmcpIHtcbiAgICBEZWJ1Zy5kZXByZWNhdGVkKCdwYy5Ta2VsZXRvbiNzZXRMb29waW5nIGlzIGRlcHJlY2F0ZWQuIFVzZSBwYy5Ta2VsZXRvbiNsb29waW5nIGluc3RlYWQuJyk7XG4gICAgdGhpcy5sb29waW5nID0gbG9vcGluZztcbn07XG5cbi8vIFNPVU5EXG5cbmV4cG9ydCBjb25zdCBhdWRpbyA9IHtcbiAgICBBdWRpb01hbmFnZXI6IFNvdW5kTWFuYWdlcixcbiAgICBDaGFubmVsOiBDaGFubmVsLFxuICAgIENoYW5uZWwzZDogQ2hhbm5lbDNkLFxuICAgIExpc3RlbmVyOiBMaXN0ZW5lcixcbiAgICBTb3VuZDogU291bmRcbn07XG5cblNvdW5kTWFuYWdlci5wcm90b3R5cGUuZ2V0TGlzdGVuZXIgPSBmdW5jdGlvbiAoKSB7XG4gICAgRGVidWcuZGVwcmVjYXRlZCgncGMuU291bmRNYW5hZ2VyI2dldExpc3RlbmVyIGlzIGRlcHJlY2F0ZWQuIFVzZSBwYy5Tb3VuZE1hbmFnZXIjbGlzdGVuZXIgaW5zdGVhZC4nKTtcbiAgICByZXR1cm4gdGhpcy5saXN0ZW5lcjtcbn07XG5cblNvdW5kTWFuYWdlci5wcm90b3R5cGUuZ2V0Vm9sdW1lID0gZnVuY3Rpb24gKCkge1xuICAgIERlYnVnLmRlcHJlY2F0ZWQoJ3BjLlNvdW5kTWFuYWdlciNnZXRWb2x1bWUgaXMgZGVwcmVjYXRlZC4gVXNlIHBjLlNvdW5kTWFuYWdlciN2b2x1bWUgaW5zdGVhZC4nKTtcbiAgICByZXR1cm4gdGhpcy52b2x1bWU7XG59O1xuXG5Tb3VuZE1hbmFnZXIucHJvdG90eXBlLnNldFZvbHVtZSA9IGZ1bmN0aW9uICh2b2x1bWUpIHtcbiAgICBEZWJ1Zy5kZXByZWNhdGVkKCdwYy5Tb3VuZE1hbmFnZXIjc2V0Vm9sdW1lIGlzIGRlcHJlY2F0ZWQuIFVzZSBwYy5Tb3VuZE1hbmFnZXIjdm9sdW1lIGluc3RlYWQuJyk7XG4gICAgdGhpcy52b2x1bWUgPSB2b2x1bWU7XG59O1xuXG4vLyBBU1NFVFxuXG5leHBvcnQgY29uc3QgYXNzZXQgPSB7XG4gICAgQVNTRVRfQU5JTUFUSU9OOiAnYW5pbWF0aW9uJyxcbiAgICBBU1NFVF9BVURJTzogJ2F1ZGlvJyxcbiAgICBBU1NFVF9JTUFHRTogJ2ltYWdlJyxcbiAgICBBU1NFVF9KU09OOiAnanNvbicsXG4gICAgQVNTRVRfTU9ERUw6ICdtb2RlbCcsXG4gICAgQVNTRVRfTUFURVJJQUw6ICdtYXRlcmlhbCcsXG4gICAgQVNTRVRfVEVYVDogJ3RleHQnLFxuICAgIEFTU0VUX1RFWFRVUkU6ICd0ZXh0dXJlJyxcbiAgICBBU1NFVF9DVUJFTUFQOiAnY3ViZW1hcCcsXG4gICAgQVNTRVRfU0NSSVBUOiAnc2NyaXB0J1xufTtcblxuQXNzZXRSZWdpc3RyeS5wcm90b3R5cGUuZ2V0QXNzZXRCeUlkID0gZnVuY3Rpb24gKGlkKSB7XG4gICAgRGVidWcuZGVwcmVjYXRlZCgncGMuQXNzZXRSZWdpc3RyeSNnZXRBc3NldEJ5SWQgaXMgZGVwcmVjYXRlZC4gVXNlIHBjLkFzc2V0UmVnaXN0cnkjZ2V0IGluc3RlYWQuJyk7XG4gICAgcmV0dXJuIHRoaXMuZ2V0KGlkKTtcbn07XG5cbi8vIFhSXG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShYcklucHV0U291cmNlLnByb3RvdHlwZSwgJ3JheScsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgRGVidWcuZGVwcmVjYXRlZCgncGMuWHJJbnB1dFNvdXJjZSNyYXkgaXMgZGVwcmVjYXRlZC4gVXNlIHBjLlhySW5wdXRTb3VyY2UjZ2V0T3JpZ2luIGFuZCBwYy5YcklucHV0U291cmNlI2dldERpcmVjdGlvbiBpbnN0ZWFkLicpO1xuICAgICAgICByZXR1cm4gdGhpcy5fcmF5TG9jYWw7XG4gICAgfVxufSk7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShYcklucHV0U291cmNlLnByb3RvdHlwZSwgJ3Bvc2l0aW9uJywge1xuICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICBEZWJ1Zy5kZXByZWNhdGVkKCdwYy5YcklucHV0U291cmNlI3Bvc2l0aW9uIGlzIGRlcHJlY2F0ZWQuIFVzZSBwYy5YcklucHV0U291cmNlI2dldExvY2FsUG9zaXRpb24gaW5zdGVhZC4nKTtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2xvY2FsUG9zaXRpb247XG4gICAgfVxufSk7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShYcklucHV0U291cmNlLnByb3RvdHlwZSwgJ3JvdGF0aW9uJywge1xuICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICBEZWJ1Zy5kZXByZWNhdGVkKCdwYy5YcklucHV0U291cmNlI3JvdGF0aW9uIGlzIGRlcHJlY2F0ZWQuIFVzZSBwYy5YcklucHV0U291cmNlI2dldExvY2FsUm90YXRpb24gaW5zdGVhZC4nKTtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2xvY2FsUm90YXRpb247XG4gICAgfVxufSk7XG5cbi8vIElOUFVUXG5cbmV4cG9ydCBjb25zdCBpbnB1dCA9IHtcbiAgICBnZXRUb3VjaFRhcmdldENvb3JkczogZ2V0VG91Y2hUYXJnZXRDb29yZHMsXG4gICAgQ29udHJvbGxlcjogQ29udHJvbGxlcixcbiAgICBHYW1lUGFkczogR2FtZVBhZHMsXG4gICAgS2V5Ym9hcmQ6IEtleWJvYXJkLFxuICAgIEtleWJvYXJkRXZlbnQ6IEtleWJvYXJkRXZlbnQsXG4gICAgTW91c2U6IE1vdXNlLFxuICAgIE1vdXNlRXZlbnQ6IE1vdXNlRXZlbnQsXG4gICAgVG91Y2g6IFRvdWNoLFxuICAgIFRvdWNoRGV2aWNlOiBUb3VjaERldmljZSxcbiAgICBUb3VjaEV2ZW50OiBUb3VjaEV2ZW50XG59O1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoRWxlbWVudElucHV0LnByb3RvdHlwZSwgJ3doZWVsJywge1xuICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gdGhpcy53aGVlbERlbHRhICogLTI7XG4gICAgfVxufSk7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShNb3VzZUV2ZW50LnByb3RvdHlwZSwgJ3doZWVsJywge1xuICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gdGhpcy53aGVlbERlbHRhICogLTI7XG4gICAgfVxufSk7XG5cbi8vIEZSQU1FV09SS1xuXG5leHBvcnQgY29uc3QgUklHSURCT0RZX1RZUEVfU1RBVElDID0gQk9EWVRZUEVfU1RBVElDO1xuZXhwb3J0IGNvbnN0IFJJR0lEQk9EWV9UWVBFX0RZTkFNSUMgPSBCT0RZVFlQRV9EWU5BTUlDO1xuZXhwb3J0IGNvbnN0IFJJR0lEQk9EWV9UWVBFX0tJTkVNQVRJQyA9IEJPRFlUWVBFX0tJTkVNQVRJQztcbmV4cG9ydCBjb25zdCBSSUdJREJPRFlfQ0ZfU1RBVElDX09CSkVDVCA9IEJPRFlGTEFHX1NUQVRJQ19PQkpFQ1Q7XG5leHBvcnQgY29uc3QgUklHSURCT0RZX0NGX0tJTkVNQVRJQ19PQkpFQ1QgPSBCT0RZRkxBR19LSU5FTUFUSUNfT0JKRUNUO1xuZXhwb3J0IGNvbnN0IFJJR0lEQk9EWV9DRl9OT1JFU1BPTlNFX09CSkVDVCA9IEJPRFlGTEFHX05PUkVTUE9OU0VfT0JKRUNUO1xuZXhwb3J0IGNvbnN0IFJJR0lEQk9EWV9BQ1RJVkVfVEFHID0gQk9EWVNUQVRFX0FDVElWRV9UQUc7XG5leHBvcnQgY29uc3QgUklHSURCT0RZX0lTTEFORF9TTEVFUElORyA9IEJPRFlTVEFURV9JU0xBTkRfU0xFRVBJTkc7XG5leHBvcnQgY29uc3QgUklHSURCT0RZX1dBTlRTX0RFQUNUSVZBVElPTiA9IEJPRFlTVEFURV9XQU5UU19ERUFDVElWQVRJT047XG5leHBvcnQgY29uc3QgUklHSURCT0RZX0RJU0FCTEVfREVBQ1RJVkFUSU9OID0gQk9EWVNUQVRFX0RJU0FCTEVfREVBQ1RJVkFUSU9OO1xuZXhwb3J0IGNvbnN0IFJJR0lEQk9EWV9ESVNBQkxFX1NJTVVMQVRJT04gPSBCT0RZU1RBVEVfRElTQUJMRV9TSU1VTEFUSU9OO1xuXG5BcHBCYXNlLnByb3RvdHlwZS5pc0Z1bGxzY3JlZW4gPSBmdW5jdGlvbiAoKSB7XG4gICAgRGVidWcuZGVwcmVjYXRlZCgncGMuQXBwQmFzZSNpc0Z1bGxzY3JlZW4gaXMgZGVwcmVjYXRlZC4gVXNlIHRoZSBGdWxsc2NyZWVuIEFQSSBkaXJlY3RseS4nKTtcblxuICAgIHJldHVybiAhIWRvY3VtZW50LmZ1bGxzY3JlZW5FbGVtZW50O1xufTtcblxuQXBwQmFzZS5wcm90b3R5cGUuZW5hYmxlRnVsbHNjcmVlbiA9IGZ1bmN0aW9uIChlbGVtZW50LCBzdWNjZXNzLCBlcnJvcikge1xuICAgIERlYnVnLmRlcHJlY2F0ZWQoJ3BjLkFwcEJhc2UjZW5hYmxlRnVsbHNjcmVlbiBpcyBkZXByZWNhdGVkLiBVc2UgdGhlIEZ1bGxzY3JlZW4gQVBJIGRpcmVjdGx5LicpO1xuXG4gICAgZWxlbWVudCA9IGVsZW1lbnQgfHwgdGhpcy5ncmFwaGljc0RldmljZS5jYW52YXM7XG5cbiAgICAvLyBzdWNjZXNzIGNhbGxiYWNrXG4gICAgY29uc3QgcyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgc3VjY2VzcygpO1xuICAgICAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdmdWxsc2NyZWVuY2hhbmdlJywgcyk7XG4gICAgfTtcblxuICAgIC8vIGVycm9yIGNhbGxiYWNrXG4gICAgY29uc3QgZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgZXJyb3IoKTtcbiAgICAgICAgZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcignZnVsbHNjcmVlbmVycm9yJywgZSk7XG4gICAgfTtcblxuICAgIGlmIChzdWNjZXNzKSB7XG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2Z1bGxzY3JlZW5jaGFuZ2UnLCBzLCBmYWxzZSk7XG4gICAgfVxuXG4gICAgaWYgKGVycm9yKSB7XG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2Z1bGxzY3JlZW5lcnJvcicsIGUsIGZhbHNlKTtcbiAgICB9XG5cbiAgICBpZiAoZWxlbWVudC5yZXF1ZXN0RnVsbHNjcmVlbikge1xuICAgICAgICBlbGVtZW50LnJlcXVlc3RGdWxsc2NyZWVuKEVsZW1lbnQuQUxMT1dfS0VZQk9BUkRfSU5QVVQpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIGVycm9yKCk7XG4gICAgfVxufTtcblxuQXBwQmFzZS5wcm90b3R5cGUuZGlzYWJsZUZ1bGxzY3JlZW4gPSBmdW5jdGlvbiAoc3VjY2Vzcykge1xuICAgIERlYnVnLmRlcHJlY2F0ZWQoJ3BjLkFwcEJhc2UjZGlzYWJsZUZ1bGxzY3JlZW4gaXMgZGVwcmVjYXRlZC4gVXNlIHRoZSBGdWxsc2NyZWVuIEFQSSBkaXJlY3RseS4nKTtcblxuICAgIC8vIHN1Y2Nlc3MgY2FsbGJhY2tcbiAgICBjb25zdCBzID0gZnVuY3Rpb24gKCkge1xuICAgICAgICBzdWNjZXNzKCk7XG4gICAgICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2Z1bGxzY3JlZW5jaGFuZ2UnLCBzKTtcbiAgICB9O1xuXG4gICAgaWYgKHN1Y2Nlc3MpIHtcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignZnVsbHNjcmVlbmNoYW5nZScsIHMsIGZhbHNlKTtcbiAgICB9XG5cbiAgICBkb2N1bWVudC5leGl0RnVsbHNjcmVlbigpO1xufTtcblxuQXBwQmFzZS5wcm90b3R5cGUuZ2V0U2NlbmVVcmwgPSBmdW5jdGlvbiAobmFtZSkge1xuICAgIERlYnVnLmRlcHJlY2F0ZWQoJ3BjLkFwcEJhc2UjZ2V0U2NlbmVVcmwgaXMgZGVwcmVjYXRlZC4gVXNlIHBjLkFwcEJhc2Ujc2NlbmVzIGFuZCBwYy5TY2VuZVJlZ2lzdHJ5I2ZpbmQgaW5zdGVhZC4nKTtcbiAgICBjb25zdCBlbnRyeSA9IHRoaXMuc2NlbmVzLmZpbmQobmFtZSk7XG4gICAgaWYgKGVudHJ5KSB7XG4gICAgICAgIHJldHVybiBlbnRyeS51cmw7XG4gICAgfVxuICAgIHJldHVybiBudWxsO1xufTtcblxuQXBwQmFzZS5wcm90b3R5cGUubG9hZFNjZW5lID0gZnVuY3Rpb24gKHVybCwgY2FsbGJhY2spIHtcbiAgICBEZWJ1Zy5kZXByZWNhdGVkKCdwYy5BcHBCYXNlI2xvYWRTY2VuZSBpcyBkZXByZWNhdGVkLiBVc2UgcGMuQXBwQmFzZSNzY2VuZXMgYW5kIHBjLlNjZW5lUmVnaXN0cnkjbG9hZFNjZW5lIGluc3RlYWQuJyk7XG4gICAgdGhpcy5zY2VuZXMubG9hZFNjZW5lKHVybCwgY2FsbGJhY2spO1xufTtcblxuQXBwQmFzZS5wcm90b3R5cGUubG9hZFNjZW5lSGllcmFyY2h5ID0gZnVuY3Rpb24gKHVybCwgY2FsbGJhY2spIHtcbiAgICBEZWJ1Zy5kZXByZWNhdGVkKCdwYy5BcHBCYXNlI2xvYWRTY2VuZUhpZXJhcmNoeSBpcyBkZXByZWNhdGVkLiBVc2UgcGMuQXBwQmFzZSNzY2VuZXMgYW5kIHBjLlNjZW5lUmVnaXN0cnkjbG9hZFNjZW5lSGllcmFyY2h5IGluc3RlYWQuJyk7XG4gICAgdGhpcy5zY2VuZXMubG9hZFNjZW5lSGllcmFyY2h5KHVybCwgY2FsbGJhY2spO1xufTtcblxuQXBwQmFzZS5wcm90b3R5cGUubG9hZFNjZW5lU2V0dGluZ3MgPSBmdW5jdGlvbiAodXJsLCBjYWxsYmFjaykge1xuICAgIERlYnVnLmRlcHJlY2F0ZWQoJ3BjLkFwcEJhc2UjbG9hZFNjZW5lU2V0dGluZ3MgaXMgZGVwcmVjYXRlZC4gVXNlIHBjLkFwcEJhc2Ujc2NlbmVzIGFuZCBwYy5TY2VuZVJlZ2lzdHJ5I2xvYWRTY2VuZVNldHRpbmdzIGluc3RlYWQuJyk7XG4gICAgdGhpcy5zY2VuZXMubG9hZFNjZW5lU2V0dGluZ3ModXJsLCBjYWxsYmFjayk7XG59O1xuXG5BcHBCYXNlLnByb3RvdHlwZS5yZW5kZXJNZXNoSW5zdGFuY2UgPSBmdW5jdGlvbiAobWVzaEluc3RhbmNlLCBvcHRpb25zKSB7XG4gICAgRGVidWcuZGVwcmVjYXRlZCgncGMuQXBwQmFzZS5yZW5kZXJNZXNoSW5zdGFuY2UgaXMgZGVwcmVjYXRlZC4gVXNlIHBjLkFwcEJhc2UuZHJhd01lc2hJbnN0YW5jZS4nKTtcbiAgICBjb25zdCBsYXllciA9IG9wdGlvbnM/LmxheWVyID8gb3B0aW9ucy5sYXllciA6IHRoaXMuc2NlbmUuZGVmYXVsdERyYXdMYXllcjtcbiAgICB0aGlzLnNjZW5lLmltbWVkaWF0ZS5kcmF3TWVzaChudWxsLCBudWxsLCBudWxsLCBtZXNoSW5zdGFuY2UsIGxheWVyKTtcbn07XG5cbkFwcEJhc2UucHJvdG90eXBlLnJlbmRlck1lc2ggPSBmdW5jdGlvbiAobWVzaCwgbWF0ZXJpYWwsIG1hdHJpeCwgb3B0aW9ucykge1xuICAgIERlYnVnLmRlcHJlY2F0ZWQoJ3BjLkFwcEJhc2UucmVuZGVyTWVzaCBpcyBkZXByZWNhdGVkLiBVc2UgcGMuQXBwQmFzZS5kcmF3TWVzaC4nKTtcbiAgICBjb25zdCBsYXllciA9IG9wdGlvbnM/LmxheWVyID8gb3B0aW9ucy5sYXllciA6IHRoaXMuc2NlbmUuZGVmYXVsdERyYXdMYXllcjtcbiAgICB0aGlzLnNjZW5lLmltbWVkaWF0ZS5kcmF3TWVzaChtYXRlcmlhbCwgbWF0cml4LCBtZXNoLCBudWxsLCBsYXllcik7XG59O1xuXG5BcHBCYXNlLnByb3RvdHlwZS5fYWRkTGluZXMgPSBmdW5jdGlvbiAocG9zaXRpb25zLCBjb2xvcnMsIG9wdGlvbnMpIHtcbiAgICBjb25zdCBsYXllciA9IChvcHRpb25zICYmIG9wdGlvbnMubGF5ZXIpID8gb3B0aW9ucy5sYXllciA6IHRoaXMuc2NlbmUubGF5ZXJzLmdldExheWVyQnlJZChMQVlFUklEX0lNTUVESUFURSk7XG4gICAgY29uc3QgZGVwdGhUZXN0ID0gKG9wdGlvbnMgJiYgb3B0aW9ucy5kZXB0aFRlc3QgIT09IHVuZGVmaW5lZCkgPyBvcHRpb25zLmRlcHRoVGVzdCA6IHRydWU7XG5cbiAgICBjb25zdCBiYXRjaCA9IHRoaXMuc2NlbmUuaW1tZWRpYXRlLmdldEJhdGNoKGxheWVyLCBkZXB0aFRlc3QpO1xuICAgIGJhdGNoLmFkZExpbmVzKHBvc2l0aW9ucywgY29sb3JzKTtcbn07XG5cbkFwcEJhc2UucHJvdG90eXBlLnJlbmRlckxpbmUgPSBmdW5jdGlvbiAoc3RhcnQsIGVuZCwgY29sb3IpIHtcblxuICAgIERlYnVnLmRlcHJlY2F0ZWQoJ3BjLkFwcEJhc2UucmVuZGVyTGluZSBpcyBkZXByZWNhdGVkLiBVc2UgcGMuQXBwQmFzZS5kcmF3TGluZS4nKTtcblxuICAgIGxldCBlbmRDb2xvciA9IGNvbG9yO1xuICAgIGxldCBvcHRpb25zO1xuXG4gICAgY29uc3QgYXJnMyA9IGFyZ3VtZW50c1szXTtcbiAgICBjb25zdCBhcmc0ID0gYXJndW1lbnRzWzRdO1xuXG4gICAgaWYgKGFyZzMgaW5zdGFuY2VvZiBDb2xvcikge1xuICAgICAgICAvLyBwYXNzZWQgaW4gZW5kIGNvbG9yXG4gICAgICAgIGVuZENvbG9yID0gYXJnMztcblxuICAgICAgICBpZiAodHlwZW9mIGFyZzQgPT09ICdudW1iZXInKSB7XG4gICAgICAgICAgICAvLyBjb21wYXRpYmlsaXR5OiBjb252ZXJ0IGxpbmViYXRjaCBpZCBpbnRvIG9wdGlvbnNcbiAgICAgICAgICAgIGlmIChhcmc0ID09PSBMSU5FQkFUQ0hfT1ZFUkxBWSkge1xuICAgICAgICAgICAgICAgIG9wdGlvbnMgPSB7XG4gICAgICAgICAgICAgICAgICAgIGxheWVyOiB0aGlzLnNjZW5lLmxheWVycy5nZXRMYXllckJ5SWQoTEFZRVJJRF9JTU1FRElBVEUpLFxuICAgICAgICAgICAgICAgICAgICBkZXB0aFRlc3Q6IGZhbHNlXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgb3B0aW9ucyA9IHtcbiAgICAgICAgICAgICAgICAgICAgbGF5ZXI6IHRoaXMuc2NlbmUubGF5ZXJzLmdldExheWVyQnlJZChMQVlFUklEX0lNTUVESUFURSksXG4gICAgICAgICAgICAgICAgICAgIGRlcHRoVGVzdDogdHJ1ZVxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyB1c2UgcGFzc2VkIGluIG9wdGlvbnNcbiAgICAgICAgICAgIG9wdGlvbnMgPSBhcmc0O1xuICAgICAgICB9XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgYXJnMyA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgZW5kQ29sb3IgPSBjb2xvcjtcblxuICAgICAgICAvLyBjb21wYXRpYmlsaXR5OiBjb252ZXJ0IGxpbmViYXRjaCBpZCBpbnRvIG9wdGlvbnNcbiAgICAgICAgaWYgKGFyZzMgPT09IExJTkVCQVRDSF9PVkVSTEFZKSB7XG4gICAgICAgICAgICBvcHRpb25zID0ge1xuICAgICAgICAgICAgICAgIGxheWVyOiB0aGlzLnNjZW5lLmxheWVycy5nZXRMYXllckJ5SWQoTEFZRVJJRF9JTU1FRElBVEUpLFxuICAgICAgICAgICAgICAgIGRlcHRoVGVzdDogZmFsc2VcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBvcHRpb25zID0ge1xuICAgICAgICAgICAgICAgIGxheWVyOiB0aGlzLnNjZW5lLmxheWVycy5nZXRMYXllckJ5SWQoTEFZRVJJRF9JTU1FRElBVEUpLFxuICAgICAgICAgICAgICAgIGRlcHRoVGVzdDogdHJ1ZVxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgIH0gZWxzZSBpZiAoYXJnMykge1xuICAgICAgICAvLyBvcHRpb25zIHBhc3NlZCBpblxuICAgICAgICBvcHRpb25zID0gYXJnMztcbiAgICB9XG5cbiAgICB0aGlzLl9hZGRMaW5lcyhbc3RhcnQsIGVuZF0sIFtjb2xvciwgZW5kQ29sb3JdLCBvcHRpb25zKTtcbn07XG5cbkFwcEJhc2UucHJvdG90eXBlLnJlbmRlckxpbmVzID0gZnVuY3Rpb24gKHBvc2l0aW9uLCBjb2xvciwgb3B0aW9ucykge1xuXG4gICAgRGVidWcuZGVwcmVjYXRlZCgncGMuQXBwQmFzZS5yZW5kZXJMaW5lcyBpcyBkZXByZWNhdGVkLiBVc2UgcGMuQXBwQmFzZS5kcmF3TGluZXMuJyk7XG5cbiAgICBpZiAoIW9wdGlvbnMpIHtcbiAgICAgICAgLy8gZGVmYXVsdCBvcHRpb25cbiAgICAgICAgb3B0aW9ucyA9IHtcbiAgICAgICAgICAgIGxheWVyOiB0aGlzLnNjZW5lLmxheWVycy5nZXRMYXllckJ5SWQoTEFZRVJJRF9JTU1FRElBVEUpLFxuICAgICAgICAgICAgZGVwdGhUZXN0OiB0cnVlXG4gICAgICAgIH07XG4gICAgfSBlbHNlIGlmICh0eXBlb2Ygb3B0aW9ucyA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgLy8gYmFja3dhcmRzIGNvbXBhdGliaWxpdHksIExJTkVCQVRDSF9PVkVSTEFZIGxpbmVzIGhhdmUgZGVwdGh0ZXN0IGRpc2FibGVkXG4gICAgICAgIGlmIChvcHRpb25zID09PSBMSU5FQkFUQ0hfT1ZFUkxBWSkge1xuICAgICAgICAgICAgb3B0aW9ucyA9IHtcbiAgICAgICAgICAgICAgICBsYXllcjogdGhpcy5zY2VuZS5sYXllcnMuZ2V0TGF5ZXJCeUlkKExBWUVSSURfSU1NRURJQVRFKSxcbiAgICAgICAgICAgICAgICBkZXB0aFRlc3Q6IGZhbHNlXG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgb3B0aW9ucyA9IHtcbiAgICAgICAgICAgICAgICBsYXllcjogdGhpcy5zY2VuZS5sYXllcnMuZ2V0TGF5ZXJCeUlkKExBWUVSSURfSU1NRURJQVRFKSxcbiAgICAgICAgICAgICAgICBkZXB0aFRlc3Q6IHRydWVcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCBtdWx0aUNvbG9yID0gISFjb2xvci5sZW5ndGg7XG4gICAgaWYgKG11bHRpQ29sb3IpIHtcbiAgICAgICAgaWYgKHBvc2l0aW9uLmxlbmd0aCAhPT0gY29sb3IubGVuZ3RoKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdyZW5kZXJMaW5lczogcG9zaXRpb24vY29sb3IgYXJyYXlzIGhhdmUgZGlmZmVyZW50IGxlbmd0aHMnKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgIH1cbiAgICBpZiAocG9zaXRpb24ubGVuZ3RoICUgMiAhPT0gMCkge1xuICAgICAgICBjb25zb2xlLmVycm9yKCdyZW5kZXJMaW5lczogYXJyYXkgbGVuZ3RoIGlzIG5vdCBkaXZpc2libGUgYnkgMicpO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIHRoaXMuX2FkZExpbmVzKHBvc2l0aW9uLCBjb2xvciwgb3B0aW9ucyk7XG59O1xuXG5BcHBCYXNlLnByb3RvdHlwZS5lbmFibGVWciA9IGZ1bmN0aW9uICgpIHtcbiAgICBEZWJ1Zy5kZXByZWNhdGVkKCdwYy5BcHBCYXNlI2VuYWJsZVZSIGlzIGRlcHJlY2F0ZWQsIGFuZCBXZWJWUiBBUEkgaXMgbm8gbG9uZ2VyIHN1cHBvcnRlZC4nKTtcbn07XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShDYW1lcmFDb21wb25lbnQucHJvdG90eXBlLCAnbm9kZScsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgRGVidWcuZGVwcmVjYXRlZCgncGMuQ2FtZXJhQ29tcG9uZW50I25vZGUgaXMgZGVwcmVjYXRlZC4gVXNlIHBjLkNhbWVyYUNvbXBvbmVudCNlbnRpdHkgaW5zdGVhZC4nKTtcbiAgICAgICAgcmV0dXJuIHRoaXMuZW50aXR5O1xuICAgIH1cbn0pO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoTGlnaHRDb21wb25lbnQucHJvdG90eXBlLCAnZW5hYmxlJywge1xuICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICBEZWJ1Zy5kZXByZWNhdGVkKCdwYy5MaWdodENvbXBvbmVudCNlbmFibGUgaXMgZGVwcmVjYXRlZC4gVXNlIHBjLkxpZ2h0Q29tcG9uZW50I2VuYWJsZWQgaW5zdGVhZC4nKTtcbiAgICAgICAgcmV0dXJuIHRoaXMuZW5hYmxlZDtcbiAgICB9LFxuICAgIHNldDogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgIERlYnVnLmRlcHJlY2F0ZWQoJ3BjLkxpZ2h0Q29tcG9uZW50I2VuYWJsZSBpcyBkZXByZWNhdGVkLiBVc2UgcGMuTGlnaHRDb21wb25lbnQjZW5hYmxlZCBpbnN0ZWFkLicpO1xuICAgICAgICB0aGlzLmVuYWJsZWQgPSB2YWx1ZTtcbiAgICB9XG59KTtcblxuTW9kZWxDb21wb25lbnQucHJvdG90eXBlLnNldFZpc2libGUgPSBmdW5jdGlvbiAodmlzaWJsZSkge1xuICAgIERlYnVnLmRlcHJlY2F0ZWQoJ3BjLk1vZGVsQ29tcG9uZW50I3NldFZpc2libGUgaXMgZGVwcmVjYXRlZC4gVXNlIHBjLk1vZGVsQ29tcG9uZW50I2VuYWJsZWQgaW5zdGVhZC4nKTtcbiAgICB0aGlzLmVuYWJsZWQgPSB2aXNpYmxlO1xufTtcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KE1vZGVsQ29tcG9uZW50LnByb3RvdHlwZSwgJ2FhYmInLCB7XG4gICAgZ2V0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIERlYnVnLmRlcHJlY2F0ZWQoJ3BjLk1vZGVsQ29tcG9uZW50I2FhYmIgaXMgZGVwcmVjYXRlZC4gVXNlIHBjLk1vZGVsQ29tcG9uZW50I2N1c3RvbUFhYmIgaW5zdGVhZCAtIHdoaWNoIGV4cGVjdHMgbG9jYWwgc3BhY2UgQUFCQiBpbnN0ZWFkIG9mIGEgd29ybGQgc3BhY2UgQUFCQi4nKTtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfSxcbiAgICBzZXQ6IGZ1bmN0aW9uICh0eXBlKSB7XG4gICAgICAgIERlYnVnLmRlcHJlY2F0ZWQoJ3BjLk1vZGVsQ29tcG9uZW50I2FhYmIgaXMgZGVwcmVjYXRlZC4gVXNlIHBjLk1vZGVsQ29tcG9uZW50I2N1c3RvbUFhYmIgaW5zdGVhZCAtIHdoaWNoIGV4cGVjdHMgbG9jYWwgc3BhY2UgQUFCQiBpbnN0ZWFkIG9mIGEgd29ybGQgc3BhY2UgQUFCQi4nKTtcbiAgICB9XG59KTtcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KFJlbmRlckNvbXBvbmVudC5wcm90b3R5cGUsICdhYWJiJywge1xuICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICBEZWJ1Zy5kZXByZWNhdGVkKCdwYy5SZW5kZXJDb21wb25lbnQjYWFiYiBpcyBkZXByZWNhdGVkLiBVc2UgcGMuUmVuZGVyQ29tcG9uZW50I2N1c3RvbUFhYmIgaW5zdGVhZCAtIHdoaWNoIGV4cGVjdHMgbG9jYWwgc3BhY2UgQUFCQiBpbnN0ZWFkIG9mIGEgd29ybGQgc3BhY2UgQUFCQi4nKTtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfSxcbiAgICBzZXQ6IGZ1bmN0aW9uICh0eXBlKSB7XG4gICAgICAgIERlYnVnLmRlcHJlY2F0ZWQoJ3BjLlJlbmRlckNvbXBvbmVudCNhYWJiIGlzIGRlcHJlY2F0ZWQuIFVzZSBwYy5SZW5kZXJDb21wb25lbnQjY3VzdG9tQWFiYiBpbnN0ZWFkIC0gd2hpY2ggZXhwZWN0cyBsb2NhbCBzcGFjZSBBQUJCIGluc3RlYWQgb2YgYSB3b3JsZCBzcGFjZSBBQUJCLicpO1xuICAgIH1cbn0pO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoUmlnaWRCb2R5Q29tcG9uZW50LnByb3RvdHlwZSwgJ2JvZHlUeXBlJywge1xuICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICBEZWJ1Zy5kZXByZWNhdGVkKCdwYy5SaWdpZEJvZHlDb21wb25lbnQjYm9keVR5cGUgaXMgZGVwcmVjYXRlZC4gVXNlIHBjLlJpZ2lkQm9keUNvbXBvbmVudCN0eXBlIGluc3RlYWQuJyk7XG4gICAgICAgIHJldHVybiB0aGlzLnR5cGU7XG4gICAgfSxcbiAgICBzZXQ6IGZ1bmN0aW9uICh0eXBlKSB7XG4gICAgICAgIERlYnVnLmRlcHJlY2F0ZWQoJ3BjLlJpZ2lkQm9keUNvbXBvbmVudCNib2R5VHlwZSBpcyBkZXByZWNhdGVkLiBVc2UgcGMuUmlnaWRCb2R5Q29tcG9uZW50I3R5cGUgaW5zdGVhZC4nKTtcbiAgICAgICAgdGhpcy50eXBlID0gdHlwZTtcbiAgICB9XG59KTtcblxuUmlnaWRCb2R5Q29tcG9uZW50LnByb3RvdHlwZS5zeW5jQm9keVRvRW50aXR5ID0gZnVuY3Rpb24gKCkge1xuICAgIERlYnVnLmRlcHJlY2F0ZWQoJ3BjLlJpZ2lkQm9keUNvbXBvbmVudCNzeW5jQm9keVRvRW50aXR5IGlzIG5vdCBwdWJsaWMgQVBJIGFuZCBzaG91bGQgbm90IGJlIHVzZWQuJyk7XG4gICAgdGhpcy5fdXBkYXRlRHluYW1pYygpO1xufTtcblxuUmlnaWRCb2R5Q29tcG9uZW50U3lzdGVtLnByb3RvdHlwZS5zZXRHcmF2aXR5ID0gZnVuY3Rpb24gKCkge1xuICAgIERlYnVnLmRlcHJlY2F0ZWQoJ3BjLlJpZ2lkQm9keUNvbXBvbmVudFN5c3RlbSNzZXRHcmF2aXR5IGlzIGRlcHJlY2F0ZWQuIFVzZSBwYy5SaWdpZEJvZHlDb21wb25lbnRTeXN0ZW0jZ3Jhdml0eSBpbnN0ZWFkLicpO1xuXG4gICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgdGhpcy5ncmF2aXR5LmNvcHkoYXJndW1lbnRzWzBdKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLmdyYXZpdHkuc2V0KGFyZ3VtZW50c1swXSwgYXJndW1lbnRzWzFdLCBhcmd1bWVudHNbMl0pO1xuICAgIH1cbn07XG5cblxuZXhwb3J0IGZ1bmN0aW9uIGJhc2lzU2V0RG93bmxvYWRDb25maWcoZ2x1ZVVybCwgd2FzbVVybCwgZmFsbGJhY2tVcmwpIHtcbiAgICBEZWJ1Zy5kZXByZWNhdGVkKCdwYy5iYXNpc1NldERvd25sb2FkQ29uZmlnIGlzIGRlcHJlY2F0ZWQuIFVzZSBwYy5iYXNpc0luaXRpYWxpemUgaW5zdGVhZC4nKTtcbiAgICBiYXNpc0luaXRpYWxpemUoe1xuICAgICAgICBnbHVlVXJsOiBnbHVlVXJsLFxuICAgICAgICB3YXNtVXJsOiB3YXNtVXJsLFxuICAgICAgICBmYWxsYmFja1VybDogZmFsbGJhY2tVcmwsXG4gICAgICAgIGxhenlJbml0OiB0cnVlXG4gICAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwcmVmaWx0ZXJDdWJlbWFwKG9wdGlvbnMpIHtcbiAgICBEZWJ1Zy5kZXByZWNhdGVkKCdwYy5wcmVmaWx0ZXJDdWJlbWFwIGlzIGRlcHJlY2F0ZWQuIFVzZSBwYy5lbnZMaWdodGluZyBpbnN0ZWFkLicpO1xufVxuIl0sIm5hbWVzIjpbImxvZyIsIndyaXRlIiwidGV4dCIsIkRlYnVnIiwiZGVwcmVjYXRlZCIsImNvbnNvbGUiLCJvcGVuIiwidmVyc2lvbiIsInJldmlzaW9uIiwiaW5mbyIsImRlYnVnIiwiZXJyb3IiLCJ3YXJuaW5nIiwid2FybiIsImFsZXJ0IiwiYXNzZXJ0IiwiY29uZGl0aW9uIiwic3RyaW5nIiwiZW5kc1dpdGgiLCJzIiwic3VicyIsInN0YXJ0c1dpdGgiLCJUaW1lciIsImNvbnN0cnVjdG9yIiwiX2lzUnVubmluZyIsIl9hIiwiX2IiLCJzdGFydCIsIm5vdyIsInN0b3AiLCJnZXRNaWxsaXNlY29uZHMiLCJ0aW1lIiwiT2JqZWN0IiwiZGVmaW5lUHJvcGVydHkiLCJDb2xvciIsInByb3RvdHlwZSIsImdldCIsIl9kYXRhIiwiRmxvYXQzMkFycmF5IiwiciIsImciLCJiIiwiYSIsIl9kYXRhMyIsImluaGVyaXRzIiwiU2VsZiIsIlN1cGVyIiwiVGVtcCIsIkZ1bmMiLCJhcmcxIiwiYXJnMiIsImFyZzMiLCJhcmc0IiwiYXJnNSIsImFyZzYiLCJhcmc3IiwiYXJnOCIsImNhbGwiLCJfc3VwZXIiLCJtYWtlQXJyYXkiLCJhcnIiLCJBcnJheSIsInNsaWNlIiwiY3JlYXRlU3R5bGUiLCJjc3NTdHJpbmciLCJyZXN1bHQiLCJkb2N1bWVudCIsImNyZWF0ZUVsZW1lbnQiLCJ0eXBlIiwic3R5bGVTaGVldCIsImNzc1RleHQiLCJhcHBlbmRDaGlsZCIsImNyZWF0ZVRleHROb2RlIiwibWF0aCIsIklOVl9MT0cyIiwiTWF0aCIsIkxPRzJFIiwiaW50VG9CeXRlcyIsImludFRvQnl0ZXMzMiIsImJ5dGVzVG9JbnQiLCJieXRlc1RvSW50MzIiLCJWZWMyIiwieCIsInkiLCJzY2FsZSIsIm11bFNjYWxhciIsIlZlYzMiLCJ6IiwiVmVjNCIsInciLCJzaGFwZSIsIkFhYmIiLCJCb3VuZGluZ0JveCIsIlNwaGVyZSIsIkJvdW5kaW5nU3BoZXJlIiwiUGxhbmUiLCJpbnRlcnNlY3RSYXkiLCJpbnRlcnNlY3RzUmF5IiwiRnJ1c3R1bSIsInVwZGF0ZSIsInByb2plY3Rpb25NYXRyaXgiLCJ2aWV3TWF0cml4Iiwidmlld1Byb2oiLCJNYXQ0IiwibXVsMiIsInNldEZyb21NYXQ0IiwiRUxFTUVOVFRZUEVfSU5UOCIsIlRZUEVfSU5UOCIsIkVMRU1FTlRUWVBFX1VJTlQ4IiwiVFlQRV9VSU5UOCIsIkVMRU1FTlRUWVBFX0lOVDE2IiwiVFlQRV9JTlQxNiIsIkVMRU1FTlRUWVBFX1VJTlQxNiIsIlRZUEVfVUlOVDE2IiwiRUxFTUVOVFRZUEVfSU5UMzIiLCJUWVBFX0lOVDMyIiwiRUxFTUVOVFRZUEVfVUlOVDMyIiwiVFlQRV9VSU5UMzIiLCJFTEVNRU5UVFlQRV9GTE9BVDMyIiwiVFlQRV9GTE9BVDMyIiwiUElYRUxGT1JNQVRfTDhfQTgiLCJQSVhFTEZPUk1BVF9MQTgiLCJQSVhFTEZPUk1BVF9SNV9HNl9CNSIsIlBJWEVMRk9STUFUX1JHQjU2NSIsIlBJWEVMRk9STUFUX1I1X0c1X0I1X0ExIiwiUElYRUxGT1JNQVRfUkdCQTU1NTEiLCJQSVhFTEZPUk1BVF9SNF9HNF9CNF9BNCIsIlBJWEVMRk9STUFUX1JHQkE0IiwiUElYRUxGT1JNQVRfUjhfRzhfQjgiLCJQSVhFTEZPUk1BVF9SR0I4IiwiUElYRUxGT1JNQVRfUjhfRzhfQjhfQTgiLCJQSVhFTEZPUk1BVF9SR0JBOCIsIkJMRU5ETU9ERV9DT05TVEFOVF9DT0xPUiIsIkJMRU5ETU9ERV9DT05TVEFOVCIsIkJMRU5ETU9ERV9PTkVfTUlOVVNfQ09OU1RBTlRfQ09MT1IiLCJCTEVORE1PREVfT05FX01JTlVTX0NPTlNUQU5UIiwiQkxFTkRNT0RFX0NPTlNUQU5UX0FMUEhBIiwiQkxFTkRNT0RFX09ORV9NSU5VU19DT05TVEFOVF9BTFBIQSIsIlVuc3VwcG9ydGVkQnJvd3NlckVycm9yIiwibWVzc2FnZSIsIm5hbWUiLCJFcnJvciIsIkNvbnRleHRDcmVhdGlvbkVycm9yIiwicHJvZ3JhbWxpYiIsImJlZ2luIiwiU2hhZGVyR2VuZXJhdG9yIiwiZHVtbXlGcmFnbWVudENvZGUiLCJTaGFkZXJVdGlscyIsImVuZCIsImZvZ0NvZGUiLCJnYW1tYUNvZGUiLCJwcmVjaXNpb25Db2RlIiwic2tpbkNvZGUiLCJ0b25lbWFwQ29kZSIsInZlcnNpb25Db2RlIiwiZ2Z4IiwiQUREUkVTU19DTEFNUF9UT19FREdFIiwiQUREUkVTU19NSVJST1JFRF9SRVBFQVQiLCJBRERSRVNTX1JFUEVBVCIsIkJMRU5ETU9ERV9aRVJPIiwiQkxFTkRNT0RFX09ORSIsIkJMRU5ETU9ERV9TUkNfQ09MT1IiLCJCTEVORE1PREVfT05FX01JTlVTX1NSQ19DT0xPUiIsIkJMRU5ETU9ERV9EU1RfQ09MT1IiLCJCTEVORE1PREVfT05FX01JTlVTX0RTVF9DT0xPUiIsIkJMRU5ETU9ERV9TUkNfQUxQSEEiLCJCTEVORE1PREVfU1JDX0FMUEhBX1NBVFVSQVRFIiwiQkxFTkRNT0RFX09ORV9NSU5VU19TUkNfQUxQSEEiLCJCTEVORE1PREVfRFNUX0FMUEhBIiwiQkxFTkRNT0RFX09ORV9NSU5VU19EU1RfQUxQSEEiLCJCVUZGRVJfU1RBVElDIiwiQlVGRkVSX0RZTkFNSUMiLCJCVUZGRVJfU1RSRUFNIiwiQ1VMTEZBQ0VfTk9ORSIsIkNVTExGQUNFX0JBQ0siLCJDVUxMRkFDRV9GUk9OVCIsIkNVTExGQUNFX0ZST05UQU5EQkFDSyIsIkZJTFRFUl9ORUFSRVNUIiwiRklMVEVSX0xJTkVBUiIsIkZJTFRFUl9ORUFSRVNUX01JUE1BUF9ORUFSRVNUIiwiRklMVEVSX05FQVJFU1RfTUlQTUFQX0xJTkVBUiIsIkZJTFRFUl9MSU5FQVJfTUlQTUFQX05FQVJFU1QiLCJGSUxURVJfTElORUFSX01JUE1BUF9MSU5FQVIiLCJJTkRFWEZPUk1BVF9VSU5UOCIsIklOREVYRk9STUFUX1VJTlQxNiIsIklOREVYRk9STUFUX1VJTlQzMiIsIlBSSU1JVElWRV9QT0lOVFMiLCJQUklNSVRJVkVfTElORVMiLCJQUklNSVRJVkVfTElORUxPT1AiLCJQUklNSVRJVkVfTElORVNUUklQIiwiUFJJTUlUSVZFX1RSSUFOR0xFUyIsIlBSSU1JVElWRV9UUklTVFJJUCIsIlBSSU1JVElWRV9UUklGQU4iLCJTRU1BTlRJQ19QT1NJVElPTiIsIlNFTUFOVElDX05PUk1BTCIsIlNFTUFOVElDX0NPTE9SIiwiU0VNQU5USUNfVEVYQ09PUkQiLCJTRU1BTlRJQ19URVhDT09SRDAiLCJTRU1BTlRJQ19URVhDT09SRDEiLCJTRU1BTlRJQ19BVFRSMCIsIlNFTUFOVElDX0FUVFIxIiwiU0VNQU5USUNfQVRUUjIiLCJTRU1BTlRJQ19BVFRSMyIsIlRFWFRVUkVMT0NLX1JFQUQiLCJURVhUVVJFTE9DS19XUklURSIsImRyYXdRdWFkV2l0aFNoYWRlciIsInNoYWRlckNodW5rcyIsIkRldmljZSIsIkdyYXBoaWNzRGV2aWNlIiwiSW5kZXhCdWZmZXIiLCJQcm9ncmFtTGlicmFyeSIsIlJlbmRlclRhcmdldCIsIlNjb3BlSWQiLCJTaGFkZXIiLCJTaGFkZXJJbnB1dCIsIldlYmdsU2hhZGVySW5wdXQiLCJUZXh0dXJlIiwiVmVydGV4QnVmZmVyIiwiVmVydGV4Rm9ybWF0IiwiVmVydGV4SXRlcmF0b3IiLCJfdmlld3BvcnQiLCJkcmF3RnVsbHNjcmVlblF1YWQiLCJkZXZpY2UiLCJ0YXJnZXQiLCJ2ZXJ0ZXhCdWZmZXIiLCJzaGFkZXIiLCJyZWN0Iiwidmlld3BvcnQiLCJ3aWR0aCIsImgiLCJoZWlnaHQiLCJzZXQiLCJwb3N0ZWZmZWN0IiwiY3JlYXRlRnVsbHNjcmVlblF1YWQiLCJxdWFkVmVydGV4QnVmZmVyIiwiUG9zdEVmZmVjdCIsIlBvc3RFZmZlY3RRdWV1ZSIsInRyYW5zZm9ybVZTIiwiZGVwcmVjYXRlZENodW5rcyIsImtleXMiLCJmb3JFYWNoIiwiY2h1bmtOYW1lIiwicmVwbGFjZW1lbnQiLCJ1c2VJbnN0ZWFkIiwibXNnIiwiY29tcGF0aWJpbGl0eUZvckxpdEFyZ3MiLCJzcmMiLCJpbmNsdWRlcyIsInJlcGxhY2UiLCJuZXdTb3VyY2UiLCJMaXRTaGFkZXIiLCJoYW5kbGVDb21wYXRpYmlsaXR5IiwiZnNoYWRlciIsImRlZmluZVByb3BlcnRpZXMiLCJfZ2xGcmFtZUJ1ZmZlciIsImltcGwiLCJyZ2JtIiwiZ2V0RGVmYXVsdEluc3RhbmNpbmdGb3JtYXQiLCJHcmFwaGljc0RldmljZUFjY2VzcyIsIlRFWFRVUkVUWVBFX1JHQk0iLCJURVhUVVJFVFlQRV9ERUZBVUxUIiwic3dpenpsZUdHR1IiLCJURVhUVVJFVFlQRV9TV0laWkxFR0dHUiIsIl9nbFRleHR1cmUiLCJhdXRvTWlwbWFwIiwiX21pcG1hcHMiLCJ2YWx1ZSIsImdldFByb2dyYW1MaWJyYXJ5Iiwic2V0UHJvZ3JhbUxpYnJhcnkiLCJsaWIiLCJyZW1vdmVTaGFkZXJGcm9tQ2FjaGUiLCJyZW1vdmVGcm9tQ2FjaGUiLCJCbGVuZFN0YXRlIiwiREVGQVVMVCIsImZyZWV6ZSIsIl90ZW1wQmxlbmRTdGF0ZSIsIl90ZW1wRGVwdGhTdGF0ZSIsIkRlcHRoU3RhdGUiLCJzZXRCbGVuZEZ1bmN0aW9uIiwiYmxlbmRTcmMiLCJibGVuZERzdCIsImN1cnJlbnRCbGVuZFN0YXRlIiwiYmxlbmRTdGF0ZSIsImNvcHkiLCJzZXRDb2xvckJsZW5kIiwiY29sb3JPcCIsInNldEFscGhhQmxlbmQiLCJhbHBoYU9wIiwic2V0QmxlbmRTdGF0ZSIsInNldEJsZW5kRnVuY3Rpb25TZXBhcmF0ZSIsImJsZW5kU3JjQWxwaGEiLCJibGVuZERzdEFscGhhIiwic2V0QmxlbmRFcXVhdGlvbiIsImJsZW5kRXF1YXRpb24iLCJjb2xvclNyY0ZhY3RvciIsImNvbG9yRHN0RmFjdG9yIiwiYWxwaGFTcmNGYWN0b3IiLCJhbHBoYURzdEZhY3RvciIsInNldEJsZW5kRXF1YXRpb25TZXBhcmF0ZSIsImJsZW5kQWxwaGFFcXVhdGlvbiIsInNldENvbG9yV3JpdGUiLCJyZWRXcml0ZSIsImdyZWVuV3JpdGUiLCJibHVlV3JpdGUiLCJhbHBoYVdyaXRlIiwiZ2V0QmxlbmRpbmciLCJibGVuZCIsInNldEJsZW5kaW5nIiwiYmxlbmRpbmciLCJzZXREZXB0aFdyaXRlIiwiZGVwdGhTdGF0ZSIsInNldERlcHRoU3RhdGUiLCJzZXREZXB0aEZ1bmMiLCJmdW5jIiwic2V0RGVwdGhUZXN0IiwidGVzdCIsImdldEN1bGxNb2RlIiwiY3VsbE1vZGUiLCJQaG9uZ01hdGVyaWFsIiwiU3RhbmRhcmRNYXRlcmlhbCIsIkxpdE9wdGlvbnMiLCJMaXRTaGFkZXJPcHRpb25zIiwic2NlbmUiLCJwYXJ0aXRpb25Ta2luIiwicHJvY2VkdXJhbCIsImNhbGN1bGF0ZVRhbmdlbnRzIiwiY3JlYXRlTWVzaCIsImNyZWF0ZVRvcnVzIiwiY3JlYXRlQ3lsaW5kZXIiLCJjcmVhdGVDYXBzdWxlIiwiY3JlYXRlQ29uZSIsImNyZWF0ZVNwaGVyZSIsImNyZWF0ZVBsYW5lIiwiY3JlYXRlQm94IiwiQmFzaWNNYXRlcmlhbCIsIkZvcndhcmRSZW5kZXJlciIsIkdyYXBoTm9kZSIsIk1hdGVyaWFsIiwiTWVzaCIsIk1lc2hJbnN0YW5jZSIsIk1vZGVsIiwiUGFydGljbGVFbWl0dGVyIiwiUGlja2VyIiwiUHJvamVjdGlvbiIsIk9SVEhPR1JBUEhJQyIsIlBST0pFQ1RJT05fT1JUSE9HUkFQSElDIiwiUEVSU1BFQ1RJVkUiLCJQUk9KRUNUSU9OX1BFUlNQRUNUSVZFIiwiU2NlbmUiLCJTa2luIiwiU2tpbkluc3RhbmNlIiwiZ2V0RGVmYXVsdE1hdGVyaWFsIiwiZ2V0QXBwbGljYXRpb24iLCJncmFwaGljc0RldmljZSIsIkxheWVyQ29tcG9zaXRpb24iLCJzaXplIiwiaW5kZXgiLCJfcHJlZmlsdGVyZWRDdWJlbWFwcyIsInVwZGF0ZVNoYWRlcnMiLCJfbW9kZWxzIiwiTGF5ZXIiLCJydCIsIl9yZW5kZXJUYXJnZXQiLCJfZGlydHlDYW1lcmFzIiwiX3VwZGF0ZVNreWJveCIsIl91cGRhdGVTa3kiLCJhZGRNb2RlbCIsIm1vZGVsIiwiY29udGFpbnNNb2RlbCIsImxheWVyIiwibGF5ZXJzIiwiZ2V0TGF5ZXJCeUlkIiwiTEFZRVJJRF9XT1JMRCIsImFkZE1lc2hJbnN0YW5jZXMiLCJtZXNoSW5zdGFuY2VzIiwibW9kZWxzIiwicHVzaCIsImFkZFNoYWRvd0Nhc3RlciIsImFkZFNoYWRvd0Nhc3RlcnMiLCJyZW1vdmVNb2RlbCIsImluZGV4T2YiLCJyZW1vdmVNZXNoSW5zdGFuY2VzIiwic3BsaWNlIiwicmVtb3ZlU2hhZG93Q2FzdGVycyIsImdldE1vZGVscyIsIkJhdGNoIiwicmVuZGVyQ29tcG9zaXRpb24iLCJjb21wIiwic3luY0FhYmIiLCJNb3JwaCIsImdldFRhcmdldCIsInRhcmdldHMiLCJfZGlydGlmeSIsImxvY2FsIiwiX2RpcnRpZnlMb2NhbCIsIl9kaXJ0aWZ5V29ybGQiLCJhZGRMYWJlbCIsImxhYmVsIiwiX2xhYmVscyIsImdldExhYmVscyIsImhhc0xhYmVsIiwicmVtb3ZlTGFiZWwiLCJmaW5kQnlMYWJlbCIsInJlc3VsdHMiLCJpIiwiX2NoaWxkcmVuIiwibGVuZ3RoIiwiZ2V0Q2hpbGRyZW4iLCJjaGlsZHJlbiIsImdldE5hbWUiLCJnZXRQYXRoIiwicGF0aCIsImdldFJvb3QiLCJyb290IiwiZ2V0UGFyZW50IiwicGFyZW50Iiwic2V0TmFtZSIsImdldFNoYWRlciIsInNldFNoYWRlciIsImdsb3NzIiwiX2RlZmluZUFsaWFzIiwibmV3TmFtZSIsIm9sZE5hbWUiLCJfZGVmaW5lT3B0aW9uIiwiU3RhbmRhcmRNYXRlcmlhbE9wdGlvbnMiLCJsaXRPcHRpb25zIiwidGVtcE9wdGlvbnMiLCJsaXRPcHRpb25Qcm9wZXJ0aWVzIiwiZ2V0T3duUHJvcGVydHlOYW1lcyIsImxpdE9wdGlvbiIsImFuaW0iLCJBbmltYXRpb24iLCJLZXkiLCJOb2RlIiwiU2tlbGV0b24iLCJnZXREdXJhdGlvbiIsImR1cmF0aW9uIiwiZ2V0Tm9kZXMiLCJub2RlcyIsInNldER1cmF0aW9uIiwiZ2V0QW5pbWF0aW9uIiwiYW5pbWF0aW9uIiwiZ2V0Q3VycmVudFRpbWUiLCJjdXJyZW50VGltZSIsImdldExvb3BpbmciLCJsb29waW5nIiwiZ2V0TnVtTm9kZXMiLCJudW1Ob2RlcyIsInNldEFuaW1hdGlvbiIsInNldEN1cnJlbnRUaW1lIiwic2V0TG9vcGluZyIsImF1ZGlvIiwiQXVkaW9NYW5hZ2VyIiwiU291bmRNYW5hZ2VyIiwiQ2hhbm5lbCIsIkNoYW5uZWwzZCIsIkxpc3RlbmVyIiwiU291bmQiLCJnZXRMaXN0ZW5lciIsImxpc3RlbmVyIiwiZ2V0Vm9sdW1lIiwidm9sdW1lIiwic2V0Vm9sdW1lIiwiYXNzZXQiLCJBU1NFVF9BTklNQVRJT04iLCJBU1NFVF9BVURJTyIsIkFTU0VUX0lNQUdFIiwiQVNTRVRfSlNPTiIsIkFTU0VUX01PREVMIiwiQVNTRVRfTUFURVJJQUwiLCJBU1NFVF9URVhUIiwiQVNTRVRfVEVYVFVSRSIsIkFTU0VUX0NVQkVNQVAiLCJBU1NFVF9TQ1JJUFQiLCJBc3NldFJlZ2lzdHJ5IiwiZ2V0QXNzZXRCeUlkIiwiaWQiLCJYcklucHV0U291cmNlIiwiX3JheUxvY2FsIiwiX2xvY2FsUG9zaXRpb24iLCJfbG9jYWxSb3RhdGlvbiIsImlucHV0IiwiZ2V0VG91Y2hUYXJnZXRDb29yZHMiLCJDb250cm9sbGVyIiwiR2FtZVBhZHMiLCJLZXlib2FyZCIsIktleWJvYXJkRXZlbnQiLCJNb3VzZSIsIk1vdXNlRXZlbnQiLCJUb3VjaCIsIlRvdWNoRGV2aWNlIiwiVG91Y2hFdmVudCIsIkVsZW1lbnRJbnB1dCIsIndoZWVsRGVsdGEiLCJSSUdJREJPRFlfVFlQRV9TVEFUSUMiLCJCT0RZVFlQRV9TVEFUSUMiLCJSSUdJREJPRFlfVFlQRV9EWU5BTUlDIiwiQk9EWVRZUEVfRFlOQU1JQyIsIlJJR0lEQk9EWV9UWVBFX0tJTkVNQVRJQyIsIkJPRFlUWVBFX0tJTkVNQVRJQyIsIlJJR0lEQk9EWV9DRl9TVEFUSUNfT0JKRUNUIiwiQk9EWUZMQUdfU1RBVElDX09CSkVDVCIsIlJJR0lEQk9EWV9DRl9LSU5FTUFUSUNfT0JKRUNUIiwiQk9EWUZMQUdfS0lORU1BVElDX09CSkVDVCIsIlJJR0lEQk9EWV9DRl9OT1JFU1BPTlNFX09CSkVDVCIsIkJPRFlGTEFHX05PUkVTUE9OU0VfT0JKRUNUIiwiUklHSURCT0RZX0FDVElWRV9UQUciLCJCT0RZU1RBVEVfQUNUSVZFX1RBRyIsIlJJR0lEQk9EWV9JU0xBTkRfU0xFRVBJTkciLCJCT0RZU1RBVEVfSVNMQU5EX1NMRUVQSU5HIiwiUklHSURCT0RZX1dBTlRTX0RFQUNUSVZBVElPTiIsIkJPRFlTVEFURV9XQU5UU19ERUFDVElWQVRJT04iLCJSSUdJREJPRFlfRElTQUJMRV9ERUFDVElWQVRJT04iLCJCT0RZU1RBVEVfRElTQUJMRV9ERUFDVElWQVRJT04iLCJSSUdJREJPRFlfRElTQUJMRV9TSU1VTEFUSU9OIiwiQk9EWVNUQVRFX0RJU0FCTEVfU0lNVUxBVElPTiIsIkFwcEJhc2UiLCJpc0Z1bGxzY3JlZW4iLCJmdWxsc2NyZWVuRWxlbWVudCIsImVuYWJsZUZ1bGxzY3JlZW4iLCJlbGVtZW50Iiwic3VjY2VzcyIsImNhbnZhcyIsInJlbW92ZUV2ZW50TGlzdGVuZXIiLCJlIiwiYWRkRXZlbnRMaXN0ZW5lciIsInJlcXVlc3RGdWxsc2NyZWVuIiwiRWxlbWVudCIsIkFMTE9XX0tFWUJPQVJEX0lOUFVUIiwiZGlzYWJsZUZ1bGxzY3JlZW4iLCJleGl0RnVsbHNjcmVlbiIsImdldFNjZW5lVXJsIiwiZW50cnkiLCJzY2VuZXMiLCJmaW5kIiwidXJsIiwibG9hZFNjZW5lIiwiY2FsbGJhY2siLCJsb2FkU2NlbmVIaWVyYXJjaHkiLCJsb2FkU2NlbmVTZXR0aW5ncyIsInJlbmRlck1lc2hJbnN0YW5jZSIsIm1lc2hJbnN0YW5jZSIsIm9wdGlvbnMiLCJkZWZhdWx0RHJhd0xheWVyIiwiaW1tZWRpYXRlIiwiZHJhd01lc2giLCJyZW5kZXJNZXNoIiwibWVzaCIsIm1hdGVyaWFsIiwibWF0cml4IiwiX2FkZExpbmVzIiwicG9zaXRpb25zIiwiY29sb3JzIiwiTEFZRVJJRF9JTU1FRElBVEUiLCJkZXB0aFRlc3QiLCJ1bmRlZmluZWQiLCJiYXRjaCIsImdldEJhdGNoIiwiYWRkTGluZXMiLCJyZW5kZXJMaW5lIiwiY29sb3IiLCJlbmRDb2xvciIsImFyZ3VtZW50cyIsIkxJTkVCQVRDSF9PVkVSTEFZIiwicmVuZGVyTGluZXMiLCJwb3NpdGlvbiIsIm11bHRpQ29sb3IiLCJlbmFibGVWciIsIkNhbWVyYUNvbXBvbmVudCIsImVudGl0eSIsIkxpZ2h0Q29tcG9uZW50IiwiZW5hYmxlZCIsIk1vZGVsQ29tcG9uZW50Iiwic2V0VmlzaWJsZSIsInZpc2libGUiLCJSZW5kZXJDb21wb25lbnQiLCJSaWdpZEJvZHlDb21wb25lbnQiLCJzeW5jQm9keVRvRW50aXR5IiwiX3VwZGF0ZUR5bmFtaWMiLCJSaWdpZEJvZHlDb21wb25lbnRTeXN0ZW0iLCJzZXRHcmF2aXR5IiwiZ3Jhdml0eSIsImJhc2lzU2V0RG93bmxvYWRDb25maWciLCJnbHVlVXJsIiwid2FzbVVybCIsImZhbGxiYWNrVXJsIiwiYmFzaXNJbml0aWFsaXplIiwibGF6eUluaXQiLCJwcmVmaWx0ZXJDdWJlbWFwIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQTBIQTs7QUFFTyxNQUFN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
