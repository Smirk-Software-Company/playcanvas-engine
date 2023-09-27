import { setupVertexArrayObject } from '../../../polyfill/OESVertexArrayObject.js';
import { math } from '../../../core/math/math.js';
import { Debug } from '../../../core/debug.js';
import { platform } from '../../../core/platform.js';
import { Color } from '../../../core/math/color.js';
import { DEVICETYPE_WEBGL2, DEVICETYPE_WEBGL1, PIXELFORMAT_RGBA8, PIXELFORMAT_RGB8, UNIFORMTYPE_BOOL, UNIFORMTYPE_INT, UNIFORMTYPE_FLOAT, UNIFORMTYPE_VEC2, UNIFORMTYPE_VEC3, UNIFORMTYPE_VEC4, UNIFORMTYPE_IVEC2, UNIFORMTYPE_IVEC3, UNIFORMTYPE_IVEC4, UNIFORMTYPE_BVEC2, UNIFORMTYPE_BVEC3, UNIFORMTYPE_BVEC4, UNIFORMTYPE_MAT2, UNIFORMTYPE_MAT3, UNIFORMTYPE_MAT4, UNIFORMTYPE_TEXTURE2D, UNIFORMTYPE_TEXTURECUBE, UNIFORMTYPE_TEXTURE2D_SHADOW, UNIFORMTYPE_TEXTURECUBE_SHADOW, UNIFORMTYPE_TEXTURE3D, UNIFORMTYPE_FLOATARRAY, UNIFORMTYPE_VEC2ARRAY, UNIFORMTYPE_VEC3ARRAY, UNIFORMTYPE_VEC4ARRAY, PIXELFORMAT_RGBA16F, PIXELFORMAT_RGBA32F, FUNC_ALWAYS, STENCILOP_KEEP, ADDRESS_CLAMP_TO_EDGE, semanticToLocation, CLEARFLAG_COLOR, CLEARFLAG_DEPTH, CLEARFLAG_STENCIL, CULLFACE_NONE, PRIMITIVE_TRISTRIP, FILTER_NEAREST_MIPMAP_NEAREST, FILTER_NEAREST_MIPMAP_LINEAR, FILTER_NEAREST, FILTER_LINEAR_MIPMAP_NEAREST, FILTER_LINEAR_MIPMAP_LINEAR, FILTER_LINEAR } from '../constants.js';
import { GraphicsDevice } from '../graphics-device.js';
import { RenderTarget } from '../render-target.js';
import { Texture } from '../texture.js';
import { DebugGraphics } from '../debug-graphics.js';
import { WebglVertexBuffer } from './webgl-vertex-buffer.js';
import { WebglIndexBuffer } from './webgl-index-buffer.js';
import { WebglShader } from './webgl-shader.js';
import { WebglTexture } from './webgl-texture.js';
import { WebglRenderTarget } from './webgl-render-target.js';
import { ShaderUtils } from '../shader-utils.js';
import { Shader } from '../shader.js';
import { BlendState } from '../blend-state.js';
import { DepthState } from '../depth-state.js';
import { StencilParameters } from '../stencil-parameters.js';
import { WebglGpuProfiler } from './webgl-gpu-profiler.js';

const invalidateAttachments = [];
const _fullScreenQuadVS = /* glsl */`
attribute vec2 vertex_position;
varying vec2 vUv0;
void main(void)
{
    gl_Position = vec4(vertex_position, 0.5, 1.0);
    vUv0 = vertex_position.xy*0.5+0.5;
}
`;
const _precisionTest1PS = /* glsl */`
void main(void) { 
    gl_FragColor = vec4(2147483648.0);
}
`;
const _precisionTest2PS = /* glsl */`
uniform sampler2D source;
vec4 packFloat(float depth) {
    const vec4 bit_shift = vec4(256.0 * 256.0 * 256.0, 256.0 * 256.0, 256.0, 1.0);
    const vec4 bit_mask  = vec4(0.0, 1.0 / 256.0, 1.0 / 256.0, 1.0 / 256.0);
    vec4 res = mod(depth * bit_shift * vec4(255), vec4(256) ) / vec4(255);
    res -= res.xxyz * bit_mask;
    return res;
}
void main(void) {
    float c = texture2D(source, vec2(0.0)).r;
    float diff = abs(c - 2147483648.0) / 2147483648.0;
    gl_FragColor = packFloat(diff);
}
`;
const _outputTexture2D = /* glsl */`
varying vec2 vUv0;
uniform sampler2D source;
void main(void) {
    gl_FragColor = texture2D(source, vUv0);
}
`;
function quadWithShader(device, target, shader) {
  DebugGraphics.pushGpuMarker(device, "QuadWithShader");
  const oldRt = device.renderTarget;
  device.setRenderTarget(target);
  device.updateBegin();
  device.setCullMode(CULLFACE_NONE);
  device.setBlendState(BlendState.NOBLEND);
  device.setDepthState(DepthState.NODEPTH);
  device.setStencilState(null, null);
  device.setVertexBuffer(device.quadVertexBuffer, 0);
  device.setShader(shader);
  device.draw({
    type: PRIMITIVE_TRISTRIP,
    base: 0,
    count: 4,
    indexed: false
  });
  device.updateEnd();
  device.setRenderTarget(oldRt);
  device.updateBegin();
  DebugGraphics.popGpuMarker(device);
}
function testRenderable(gl, pixelFormat) {
  let result = true;

  // Create a 2x2 texture
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 2, 2, 0, gl.RGBA, pixelFormat, null);

  // Try to use this texture as a render target
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

  // It is legal for a WebGL implementation exposing the OES_texture_float extension to
  // support floating-point textures but not as attachments to framebuffer objects.
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    result = false;
  }

  // Clean up
  gl.bindTexture(gl.TEXTURE_2D, null);
  gl.deleteTexture(texture);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(framebuffer);
  return result;
}
function testTextureHalfFloatUpdatable(gl, pixelFormat) {
  let result = true;

  // Create a 2x2 texture
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  // upload some data - on iOS prior to about November 2019, passing data to half texture would fail here
  // see details here: https://bugs.webkit.org/show_bug.cgi?id=169999
  // note that if not supported, this prints an error to console, the error can be safely ignored as it's handled
  const data = new Uint16Array(4 * 2 * 2);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 2, 2, 0, gl.RGBA, pixelFormat, data);
  if (gl.getError() !== gl.NO_ERROR) {
    result = false;
    console.log("Above error related to HALF_FLOAT_OES can be ignored, it was triggered by testing half float texture support");
  }

  // Clean up
  gl.bindTexture(gl.TEXTURE_2D, null);
  gl.deleteTexture(texture);
  return result;
}
function testTextureFloatHighPrecision(device) {
  if (!device.textureFloatRenderable) return false;
  const shader1 = new Shader(device, ShaderUtils.createDefinition(device, {
    name: 'ptest1',
    vertexCode: _fullScreenQuadVS,
    fragmentCode: _precisionTest1PS
  }));
  const shader2 = new Shader(device, ShaderUtils.createDefinition(device, {
    name: 'ptest2',
    vertexCode: _fullScreenQuadVS,
    fragmentCode: _precisionTest2PS
  }));
  const textureOptions = {
    format: PIXELFORMAT_RGBA32F,
    width: 1,
    height: 1,
    mipmaps: false,
    minFilter: FILTER_NEAREST,
    magFilter: FILTER_NEAREST,
    name: 'testFHP'
  };
  const tex1 = new Texture(device, textureOptions);
  const targ1 = new RenderTarget({
    colorBuffer: tex1,
    depth: false
  });
  quadWithShader(device, targ1, shader1);
  textureOptions.format = PIXELFORMAT_RGBA8;
  const tex2 = new Texture(device, textureOptions);
  const targ2 = new RenderTarget({
    colorBuffer: tex2,
    depth: false
  });
  device.constantTexSource.setValue(tex1);
  quadWithShader(device, targ2, shader2);
  const prevFramebuffer = device.activeFramebuffer;
  device.setFramebuffer(targ2.impl._glFrameBuffer);
  const pixels = new Uint8Array(4);
  device.readPixels(0, 0, 1, 1, pixels);
  device.setFramebuffer(prevFramebuffer);
  const x = pixels[0] / 255;
  const y = pixels[1] / 255;
  const z = pixels[2] / 255;
  const w = pixels[3] / 255;
  const f = x / (256 * 256 * 256) + y / (256 * 256) + z / 256 + w;
  tex1.destroy();
  targ1.destroy();
  tex2.destroy();
  targ2.destroy();
  shader1.destroy();
  shader2.destroy();
  return f === 0;
}

/**
 * The graphics device manages the underlying graphics context. It is responsible for submitting
 * render state changes and graphics primitives to the hardware. A graphics device is tied to a
 * specific canvas HTML element. It is valid to have more than one canvas element per page and
 * create a new graphics device against each.
 *
 * @augments GraphicsDevice
 * @category Graphics
 */
class WebglGraphicsDevice extends GraphicsDevice {
  /**
   * Creates a new WebglGraphicsDevice instance.
   *
   * @param {HTMLCanvasElement} canvas - The canvas to which the graphics device will render.
   * @param {object} [options] - Options passed when creating the WebGL context.
   * @param {boolean} [options.alpha] - Boolean that indicates if the canvas contains an
   * alpha buffer. Defaults to true.
   * @param {boolean} [options.depth] - Boolean that indicates that the drawing buffer is
   * requested to have a depth buffer of at least 16 bits. Defaults to true.
   * @param {boolean} [options.stencil] - Boolean that indicates that the drawing buffer is
   * requested to have a stencil buffer of at least 8 bits. Defaults to true.
   * @param {boolean} [options.antialias] - Boolean that indicates whether or not to perform
   * anti-aliasing if possible. Defaults to true.
   * @param {boolean} [options.premultipliedAlpha] - Boolean that indicates that the page
   * compositor will assume the drawing buffer contains colors with pre-multiplied alpha.
   * Defaults to true.
   * @param {boolean} [options.preserveDrawingBuffer] - If the value is true the buffers will not
   * be cleared and will preserve their values until cleared or overwritten by the author.
   * Defaults to false.
   * @param {'default'|'high-performance'|'low-power'} [options.powerPreference] - A hint to the
   * user agent indicating what configuration of GPU is suitable for the WebGL context. Possible
   * values are:
   *
   * - 'default': Let the user agent decide which GPU configuration is most suitable. This is the
   * default value.
   * - 'high-performance': Prioritizes rendering performance over power consumption.
   * - 'low-power': Prioritizes power saving over rendering performance.
   *
   * Defaults to 'default'.
   * @param {boolean} [options.failIfMajorPerformanceCaveat] - Boolean that indicates if a
   * context will be created if the system performance is low or if no hardware GPU is available.
   * Defaults to false.
   * @param {boolean} [options.preferWebGl2] - Boolean that indicates if a WebGl2 context should
   * be preferred. Defaults to true.
   * @param {boolean} [options.desynchronized] - Boolean that hints the user agent to reduce the
   * latency by desynchronizing the canvas paint cycle from the event loop. Defaults to false.
   * @param {boolean} [options.xrCompatible] - Boolean that hints to the user agent to use a
   * compatible graphics adapter for an immersive XR device.
   * @param {WebGLRenderingContext | WebGL2RenderingContext} [options.gl] - The rendering context
   * to use. If not specified, a new context will be created.
   */
  constructor(canvas, options = {}) {
    super(canvas, options);
    /**
     * The WebGL context managed by the graphics device. The type could also technically be
     * `WebGLRenderingContext` if WebGL 2.0 is not available. But in order for IntelliSense to be
     * able to function for all WebGL calls in the codebase, we specify `WebGL2RenderingContext`
     * here instead.
     *
     * @type {WebGL2RenderingContext}
     * @ignore
     */
    this.gl = void 0;
    /**
     * True if the WebGL context of this device is using the WebGL 2.0 API. If false, WebGL 1.0 is
     * being used.
     *
     * @type {boolean}
     * @ignore
     */
    this.webgl2 = void 0;
    /**
     * WebGLFramebuffer object that represents the backbuffer of the device for a rendering frame.
     * When null, this is a framebuffer created when the device was created, otherwise it is a
     * framebuffer supplied by the XR session.
     *
     * @ignore
     */
    this._defaultFramebuffer = null;
    /**
     * True if the default framebuffer has changed since the last frame.
     *
     * @ignore
     */
    this._defaultFramebufferChanged = false;
    options = this.initOptions;
    this.updateClientRect();

    // Add handlers for when the WebGL context is lost or restored
    this.contextLost = false;
    this._contextLostHandler = event => {
      event.preventDefault();
      this.contextLost = true;
      this.loseContext();
      Debug.log('pc.GraphicsDevice: WebGL context lost.');
      this.fire('devicelost');
    };
    this._contextRestoredHandler = () => {
      Debug.log('pc.GraphicsDevice: WebGL context restored.');
      this.contextLost = false;
      this.restoreContext();
      this.fire('devicerestored');
    };

    // #4136 - turn off antialiasing on AppleWebKit browsers 15.4
    const ua = typeof navigator !== 'undefined' && navigator.userAgent;
    this.forceDisableMultisampling = ua && ua.includes('AppleWebKit') && (ua.includes('15.4') || ua.includes('15_4'));
    if (this.forceDisableMultisampling) {
      options.antialias = false;
      Debug.log("Antialiasing has been turned off due to rendering issues on AppleWebKit 15.4");
    }
    let gl = null;

    // we always allocate the default framebuffer without antialiasing, so remove that option
    const antialias = options.antialias;
    options.antialias = false;

    // Retrieve the WebGL context
    if (options.gl) {
      gl = options.gl;
    } else {
      const preferWebGl2 = options.preferWebGl2 !== undefined ? options.preferWebGl2 : true;
      const names = preferWebGl2 ? ["webgl2", "webgl", "experimental-webgl"] : ["webgl", "experimental-webgl"];
      for (let i = 0; i < names.length; i++) {
        gl = canvas.getContext(names[i], options);
        if (gl) {
          break;
        }
      }
    }
    if (!gl) {
      throw new Error("WebGL not supported");
    }
    this.gl = gl;
    this.webgl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
    this._deviceType = this.webgl2 ? DEVICETYPE_WEBGL2 : DEVICETYPE_WEBGL1;

    // pixel format of the framebuffer
    const alphaBits = gl.getParameter(gl.ALPHA_BITS);
    this.backBufferFormat = alphaBits ? PIXELFORMAT_RGBA8 : PIXELFORMAT_RGB8;
    const isChrome = platform.browserName === 'chrome';
    const isSafari = platform.browserName === 'safari';
    const isMac = platform.browser && navigator.appVersion.indexOf("Mac") !== -1;

    // enable temporary texture unit workaround on desktop safari
    this._tempEnableSafariTextureUnitWorkaround = isSafari;

    // enable temporary workaround for glBlitFramebuffer failing on Mac Chrome (#2504)
    this._tempMacChromeBlitFramebufferWorkaround = isMac && isChrome && !options.alpha;

    // init polyfill for VAOs under webgl1
    if (!this.webgl2) {
      setupVertexArrayObject(gl);
    }
    canvas.addEventListener("webglcontextlost", this._contextLostHandler, false);
    canvas.addEventListener("webglcontextrestored", this._contextRestoredHandler, false);
    this.initializeExtensions();
    this.initializeCapabilities();
    this.initializeRenderState();
    this.initializeContextCaches();

    // handle anti-aliasing internally
    this.samples = antialias ? 4 : 1;
    this.createBackbuffer(null);

    // only enable ImageBitmap on chrome
    this.supportsImageBitmap = !isSafari && typeof ImageBitmap !== 'undefined';
    this.glAddress = [gl.REPEAT, gl.CLAMP_TO_EDGE, gl.MIRRORED_REPEAT];
    this.glBlendEquation = [gl.FUNC_ADD, gl.FUNC_SUBTRACT, gl.FUNC_REVERSE_SUBTRACT, this.webgl2 ? gl.MIN : this.extBlendMinmax ? this.extBlendMinmax.MIN_EXT : gl.FUNC_ADD, this.webgl2 ? gl.MAX : this.extBlendMinmax ? this.extBlendMinmax.MAX_EXT : gl.FUNC_ADD];
    this.glBlendFunctionColor = [gl.ZERO, gl.ONE, gl.SRC_COLOR, gl.ONE_MINUS_SRC_COLOR, gl.DST_COLOR, gl.ONE_MINUS_DST_COLOR, gl.SRC_ALPHA, gl.SRC_ALPHA_SATURATE, gl.ONE_MINUS_SRC_ALPHA, gl.DST_ALPHA, gl.ONE_MINUS_DST_ALPHA, gl.CONSTANT_COLOR, gl.ONE_MINUS_CONSTANT_COLOR];
    this.glBlendFunctionAlpha = [gl.ZERO, gl.ONE, gl.SRC_COLOR, gl.ONE_MINUS_SRC_COLOR, gl.DST_COLOR, gl.ONE_MINUS_DST_COLOR, gl.SRC_ALPHA, gl.SRC_ALPHA_SATURATE, gl.ONE_MINUS_SRC_ALPHA, gl.DST_ALPHA, gl.ONE_MINUS_DST_ALPHA, gl.CONSTANT_ALPHA, gl.ONE_MINUS_CONSTANT_ALPHA];
    this.glComparison = [gl.NEVER, gl.LESS, gl.EQUAL, gl.LEQUAL, gl.GREATER, gl.NOTEQUAL, gl.GEQUAL, gl.ALWAYS];
    this.glStencilOp = [gl.KEEP, gl.ZERO, gl.REPLACE, gl.INCR, gl.INCR_WRAP, gl.DECR, gl.DECR_WRAP, gl.INVERT];
    this.glClearFlag = [0, gl.COLOR_BUFFER_BIT, gl.DEPTH_BUFFER_BIT, gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT, gl.STENCIL_BUFFER_BIT, gl.STENCIL_BUFFER_BIT | gl.COLOR_BUFFER_BIT, gl.STENCIL_BUFFER_BIT | gl.DEPTH_BUFFER_BIT, gl.STENCIL_BUFFER_BIT | gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT];
    this.glCull = [0, gl.BACK, gl.FRONT, gl.FRONT_AND_BACK];
    this.glFilter = [gl.NEAREST, gl.LINEAR, gl.NEAREST_MIPMAP_NEAREST, gl.NEAREST_MIPMAP_LINEAR, gl.LINEAR_MIPMAP_NEAREST, gl.LINEAR_MIPMAP_LINEAR];
    this.glPrimitive = [gl.POINTS, gl.LINES, gl.LINE_LOOP, gl.LINE_STRIP, gl.TRIANGLES, gl.TRIANGLE_STRIP, gl.TRIANGLE_FAN];
    this.glType = [gl.BYTE, gl.UNSIGNED_BYTE, gl.SHORT, gl.UNSIGNED_SHORT, gl.INT, gl.UNSIGNED_INT, gl.FLOAT];
    this.pcUniformType = {};
    this.pcUniformType[gl.BOOL] = UNIFORMTYPE_BOOL;
    this.pcUniformType[gl.INT] = UNIFORMTYPE_INT;
    this.pcUniformType[gl.FLOAT] = UNIFORMTYPE_FLOAT;
    this.pcUniformType[gl.FLOAT_VEC2] = UNIFORMTYPE_VEC2;
    this.pcUniformType[gl.FLOAT_VEC3] = UNIFORMTYPE_VEC3;
    this.pcUniformType[gl.FLOAT_VEC4] = UNIFORMTYPE_VEC4;
    this.pcUniformType[gl.INT_VEC2] = UNIFORMTYPE_IVEC2;
    this.pcUniformType[gl.INT_VEC3] = UNIFORMTYPE_IVEC3;
    this.pcUniformType[gl.INT_VEC4] = UNIFORMTYPE_IVEC4;
    this.pcUniformType[gl.BOOL_VEC2] = UNIFORMTYPE_BVEC2;
    this.pcUniformType[gl.BOOL_VEC3] = UNIFORMTYPE_BVEC3;
    this.pcUniformType[gl.BOOL_VEC4] = UNIFORMTYPE_BVEC4;
    this.pcUniformType[gl.FLOAT_MAT2] = UNIFORMTYPE_MAT2;
    this.pcUniformType[gl.FLOAT_MAT3] = UNIFORMTYPE_MAT3;
    this.pcUniformType[gl.FLOAT_MAT4] = UNIFORMTYPE_MAT4;
    this.pcUniformType[gl.SAMPLER_2D] = UNIFORMTYPE_TEXTURE2D;
    this.pcUniformType[gl.SAMPLER_CUBE] = UNIFORMTYPE_TEXTURECUBE;
    if (this.webgl2) {
      this.pcUniformType[gl.SAMPLER_2D_SHADOW] = UNIFORMTYPE_TEXTURE2D_SHADOW;
      this.pcUniformType[gl.SAMPLER_CUBE_SHADOW] = UNIFORMTYPE_TEXTURECUBE_SHADOW;
      this.pcUniformType[gl.SAMPLER_3D] = UNIFORMTYPE_TEXTURE3D;
    }
    this.targetToSlot = {};
    this.targetToSlot[gl.TEXTURE_2D] = 0;
    this.targetToSlot[gl.TEXTURE_CUBE_MAP] = 1;
    this.targetToSlot[gl.TEXTURE_3D] = 2;

    // Define the uniform commit functions
    let scopeX, scopeY, scopeZ, scopeW;
    let uniformValue;
    this.commitFunction = [];
    this.commitFunction[UNIFORMTYPE_BOOL] = function (uniform, value) {
      if (uniform.value !== value) {
        gl.uniform1i(uniform.locationId, value);
        uniform.value = value;
      }
    };
    this.commitFunction[UNIFORMTYPE_INT] = this.commitFunction[UNIFORMTYPE_BOOL];
    this.commitFunction[UNIFORMTYPE_FLOAT] = function (uniform, value) {
      if (uniform.value !== value) {
        gl.uniform1f(uniform.locationId, value);
        uniform.value = value;
      }
    };
    this.commitFunction[UNIFORMTYPE_VEC2] = function (uniform, value) {
      uniformValue = uniform.value;
      scopeX = value[0];
      scopeY = value[1];
      if (uniformValue[0] !== scopeX || uniformValue[1] !== scopeY) {
        gl.uniform2fv(uniform.locationId, value);
        uniformValue[0] = scopeX;
        uniformValue[1] = scopeY;
      }
    };
    this.commitFunction[UNIFORMTYPE_VEC3] = function (uniform, value) {
      uniformValue = uniform.value;
      scopeX = value[0];
      scopeY = value[1];
      scopeZ = value[2];
      if (uniformValue[0] !== scopeX || uniformValue[1] !== scopeY || uniformValue[2] !== scopeZ) {
        gl.uniform3fv(uniform.locationId, value);
        uniformValue[0] = scopeX;
        uniformValue[1] = scopeY;
        uniformValue[2] = scopeZ;
      }
    };
    this.commitFunction[UNIFORMTYPE_VEC4] = function (uniform, value) {
      uniformValue = uniform.value;
      scopeX = value[0];
      scopeY = value[1];
      scopeZ = value[2];
      scopeW = value[3];
      if (uniformValue[0] !== scopeX || uniformValue[1] !== scopeY || uniformValue[2] !== scopeZ || uniformValue[3] !== scopeW) {
        gl.uniform4fv(uniform.locationId, value);
        uniformValue[0] = scopeX;
        uniformValue[1] = scopeY;
        uniformValue[2] = scopeZ;
        uniformValue[3] = scopeW;
      }
    };
    this.commitFunction[UNIFORMTYPE_IVEC2] = function (uniform, value) {
      uniformValue = uniform.value;
      scopeX = value[0];
      scopeY = value[1];
      if (uniformValue[0] !== scopeX || uniformValue[1] !== scopeY) {
        gl.uniform2iv(uniform.locationId, value);
        uniformValue[0] = scopeX;
        uniformValue[1] = scopeY;
      }
    };
    this.commitFunction[UNIFORMTYPE_BVEC2] = this.commitFunction[UNIFORMTYPE_IVEC2];
    this.commitFunction[UNIFORMTYPE_IVEC3] = function (uniform, value) {
      uniformValue = uniform.value;
      scopeX = value[0];
      scopeY = value[1];
      scopeZ = value[2];
      if (uniformValue[0] !== scopeX || uniformValue[1] !== scopeY || uniformValue[2] !== scopeZ) {
        gl.uniform3iv(uniform.locationId, value);
        uniformValue[0] = scopeX;
        uniformValue[1] = scopeY;
        uniformValue[2] = scopeZ;
      }
    };
    this.commitFunction[UNIFORMTYPE_BVEC3] = this.commitFunction[UNIFORMTYPE_IVEC3];
    this.commitFunction[UNIFORMTYPE_IVEC4] = function (uniform, value) {
      uniformValue = uniform.value;
      scopeX = value[0];
      scopeY = value[1];
      scopeZ = value[2];
      scopeW = value[3];
      if (uniformValue[0] !== scopeX || uniformValue[1] !== scopeY || uniformValue[2] !== scopeZ || uniformValue[3] !== scopeW) {
        gl.uniform4iv(uniform.locationId, value);
        uniformValue[0] = scopeX;
        uniformValue[1] = scopeY;
        uniformValue[2] = scopeZ;
        uniformValue[3] = scopeW;
      }
    };
    this.commitFunction[UNIFORMTYPE_BVEC4] = this.commitFunction[UNIFORMTYPE_IVEC4];
    this.commitFunction[UNIFORMTYPE_MAT2] = function (uniform, value) {
      gl.uniformMatrix2fv(uniform.locationId, false, value);
    };
    this.commitFunction[UNIFORMTYPE_MAT3] = function (uniform, value) {
      gl.uniformMatrix3fv(uniform.locationId, false, value);
    };
    this.commitFunction[UNIFORMTYPE_MAT4] = function (uniform, value) {
      gl.uniformMatrix4fv(uniform.locationId, false, value);
    };
    this.commitFunction[UNIFORMTYPE_FLOATARRAY] = function (uniform, value) {
      gl.uniform1fv(uniform.locationId, value);
    };
    this.commitFunction[UNIFORMTYPE_VEC2ARRAY] = function (uniform, value) {
      gl.uniform2fv(uniform.locationId, value);
    };
    this.commitFunction[UNIFORMTYPE_VEC3ARRAY] = function (uniform, value) {
      gl.uniform3fv(uniform.locationId, value);
    };
    this.commitFunction[UNIFORMTYPE_VEC4ARRAY] = function (uniform, value) {
      gl.uniform4fv(uniform.locationId, value);
    };
    this.supportsBoneTextures = this.extTextureFloat && this.maxVertexTextures > 0;

    // Calculate an estimate of the maximum number of bones that can be uploaded to the GPU
    // based on the number of available uniforms and the number of uniforms required for non-
    // bone data.  This is based off of the Standard shader.  A user defined shader may have
    // even less space available for bones so this calculated value can be overridden via
    // pc.GraphicsDevice.setBoneLimit.
    let numUniforms = this.vertexUniformsCount;
    numUniforms -= 4 * 4; // Model, view, projection and shadow matrices
    numUniforms -= 8; // 8 lights max, each specifying a position vector
    numUniforms -= 1; // Eye position
    numUniforms -= 4 * 4; // Up to 4 texture transforms
    this.boneLimit = Math.floor(numUniforms / 3); // each bone uses 3 uniforms

    // Put a limit on the number of supported bones before skin partitioning must be performed
    // Some GPUs have demonstrated performance issues if the number of vectors allocated to the
    // skin matrix palette is left unbounded
    this.boneLimit = Math.min(this.boneLimit, 128);
    if (this.unmaskedRenderer === 'Mali-450 MP') {
      this.boneLimit = 34;
    }
    this.constantTexSource = this.scope.resolve("source");
    if (this.extTextureFloat) {
      if (this.webgl2) {
        // In WebGL2 float texture renderability is dictated by the EXT_color_buffer_float extension
        this.textureFloatRenderable = !!this.extColorBufferFloat;
      } else {
        // In WebGL1 we should just try rendering into a float texture
        this.textureFloatRenderable = testRenderable(gl, gl.FLOAT);
      }
    } else {
      this.textureFloatRenderable = false;
    }

    // two extensions allow us to render to half float buffers
    if (this.extColorBufferHalfFloat) {
      this.textureHalfFloatRenderable = !!this.extColorBufferHalfFloat;
    } else if (this.extTextureHalfFloat) {
      if (this.webgl2) {
        // EXT_color_buffer_float should affect both float and halffloat formats
        this.textureHalfFloatRenderable = !!this.extColorBufferFloat;
      } else {
        // Manual render check for half float
        this.textureHalfFloatRenderable = testRenderable(gl, this.extTextureHalfFloat.HALF_FLOAT_OES);
      }
    } else {
      this.textureHalfFloatRenderable = false;
    }
    this.supportsMorphTargetTexturesCore = this.maxPrecision === "highp" && this.maxVertexTextures >= 2;
    this.supportsDepthShadow = this.webgl2;
    this._textureFloatHighPrecision = undefined;
    this._textureHalfFloatUpdatable = undefined;

    // area light LUT format - order of preference: half, float, 8bit
    this.areaLightLutFormat = PIXELFORMAT_RGBA8;
    if (this.extTextureHalfFloat && this.textureHalfFloatUpdatable && this.extTextureHalfFloatLinear) {
      this.areaLightLutFormat = PIXELFORMAT_RGBA16F;
    } else if (this.extTextureFloat && this.extTextureFloatLinear) {
      this.areaLightLutFormat = PIXELFORMAT_RGBA32F;
    }
    this.postInit();
  }
  postInit() {
    super.postInit();
    this.gpuProfiler = new WebglGpuProfiler(this);
  }

  /**
   * Destroy the graphics device.
   */
  destroy() {
    super.destroy();
    const gl = this.gl;
    if (this.webgl2 && this.feedback) {
      gl.deleteTransformFeedback(this.feedback);
    }
    this.clearVertexArrayObjectCache();
    this.canvas.removeEventListener('webglcontextlost', this._contextLostHandler, false);
    this.canvas.removeEventListener('webglcontextrestored', this._contextRestoredHandler, false);
    this._contextLostHandler = null;
    this._contextRestoredHandler = null;
    this.gl = null;
    super.postDestroy();
  }
  createBackbuffer(frameBuffer) {
    this.supportsStencil = this.initOptions.stencil;
    this.backBuffer = new RenderTarget({
      name: 'WebglFramebuffer',
      graphicsDevice: this,
      depth: this.initOptions.depth,
      stencil: this.supportsStencil,
      samples: this.samples
    });

    // use the default WebGL framebuffer for rendering
    this.backBuffer.impl.suppliedColorFramebuffer = frameBuffer;
  }
  updateBackbuffer() {
    const resolutionChanged = this.canvas.width !== this.backBufferSize.x || this.canvas.height !== this.backBufferSize.y;
    if (this._defaultFramebufferChanged || resolutionChanged) {
      this._defaultFramebufferChanged = false;
      this.backBufferSize.set(this.canvas.width, this.canvas.height);

      // recreate the backbuffer with newly supplied framebuffer
      this.backBuffer.destroy();
      this.createBackbuffer(this._defaultFramebuffer);
    }
  }

  // provide webgl implementation for the vertex buffer
  createVertexBufferImpl(vertexBuffer, format) {
    return new WebglVertexBuffer();
  }

  // provide webgl implementation for the index buffer
  createIndexBufferImpl(indexBuffer) {
    return new WebglIndexBuffer(indexBuffer);
  }
  createShaderImpl(shader) {
    return new WebglShader(shader);
  }
  createTextureImpl(texture) {
    return new WebglTexture();
  }
  createRenderTargetImpl(renderTarget) {
    return new WebglRenderTarget();
  }
  pushMarker(name) {
    if (window.spector) {
      const label = DebugGraphics.toString();
      window.spector.setMarker(`${label} #`);
    }
  }
  popMarker() {
    if (window.spector) {
      const label = DebugGraphics.toString();
      if (label.length) window.spector.setMarker(`${label} #`);else window.spector.clearMarker();
    }
  }

  /**
   * Query the precision supported by ints and floats in vertex and fragment shaders. Note that
   * getShaderPrecisionFormat is not guaranteed to be present (such as some instances of the
   * default Android browser). In this case, assume highp is available.
   *
   * @returns {string} "highp", "mediump" or "lowp"
   * @ignore
   */
  getPrecision() {
    const gl = this.gl;
    let precision = "highp";
    if (gl.getShaderPrecisionFormat) {
      const vertexShaderPrecisionHighpFloat = gl.getShaderPrecisionFormat(gl.VERTEX_SHADER, gl.HIGH_FLOAT);
      const vertexShaderPrecisionMediumpFloat = gl.getShaderPrecisionFormat(gl.VERTEX_SHADER, gl.MEDIUM_FLOAT);
      const fragmentShaderPrecisionHighpFloat = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
      const fragmentShaderPrecisionMediumpFloat = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.MEDIUM_FLOAT);
      if (vertexShaderPrecisionHighpFloat && vertexShaderPrecisionMediumpFloat && fragmentShaderPrecisionHighpFloat && fragmentShaderPrecisionMediumpFloat) {
        const highpAvailable = vertexShaderPrecisionHighpFloat.precision > 0 && fragmentShaderPrecisionHighpFloat.precision > 0;
        const mediumpAvailable = vertexShaderPrecisionMediumpFloat.precision > 0 && fragmentShaderPrecisionMediumpFloat.precision > 0;
        if (!highpAvailable) {
          if (mediumpAvailable) {
            precision = "mediump";
            Debug.warn("WARNING: highp not supported, using mediump");
          } else {
            precision = "lowp";
            Debug.warn("WARNING: highp and mediump not supported, using lowp");
          }
        }
      }
    }
    return precision;
  }
  getExtension() {
    for (let i = 0; i < arguments.length; i++) {
      if (this.supportedExtensions.indexOf(arguments[i]) !== -1) {
        return this.gl.getExtension(arguments[i]);
      }
    }
    return null;
  }

  /** @ignore */
  get extDisjointTimerQuery() {
    // lazy evaluation as this is not typically used
    if (!this._extDisjointTimerQuery) {
      if (this.webgl2) {
        // Note that Firefox exposes EXT_disjoint_timer_query under WebGL2 rather than EXT_disjoint_timer_query_webgl2
        this._extDisjointTimerQuery = this.getExtension('EXT_disjoint_timer_query_webgl2', 'EXT_disjoint_timer_query');
      }
    }
    return this._extDisjointTimerQuery;
  }

  /**
   * Initialize the extensions provided by the WebGL context.
   *
   * @ignore
   */
  initializeExtensions() {
    var _gl$getSupportedExten;
    const gl = this.gl;
    this.supportedExtensions = (_gl$getSupportedExten = gl.getSupportedExtensions()) != null ? _gl$getSupportedExten : [];
    this._extDisjointTimerQuery = null;
    if (this.webgl2) {
      this.extBlendMinmax = true;
      this.extDrawBuffers = true;
      this.drawBuffers = gl.drawBuffers.bind(gl);
      this.extInstancing = true;
      this.extStandardDerivatives = true;
      this.extTextureFloat = true;
      this.extTextureHalfFloat = true;
      this.extTextureLod = true;
      this.extUintElement = true;
      this.extVertexArrayObject = true;
      this.extColorBufferFloat = this.getExtension('EXT_color_buffer_float');
      this.extDepthTexture = true;
    } else {
      var _this$extDrawBuffers;
      this.extBlendMinmax = this.getExtension("EXT_blend_minmax");
      this.extDrawBuffers = this.getExtension('WEBGL_draw_buffers');
      this.extInstancing = this.getExtension("ANGLE_instanced_arrays");
      this.drawBuffers = (_this$extDrawBuffers = this.extDrawBuffers) == null ? void 0 : _this$extDrawBuffers.drawBuffersWEBGL.bind(this.extDrawBuffers);
      if (this.extInstancing) {
        // Install the WebGL 2 Instancing API for WebGL 1.0
        const ext = this.extInstancing;
        gl.drawArraysInstanced = ext.drawArraysInstancedANGLE.bind(ext);
        gl.drawElementsInstanced = ext.drawElementsInstancedANGLE.bind(ext);
        gl.vertexAttribDivisor = ext.vertexAttribDivisorANGLE.bind(ext);
      }
      this.extStandardDerivatives = this.getExtension("OES_standard_derivatives");
      this.extTextureFloat = this.getExtension("OES_texture_float");
      this.extTextureHalfFloat = this.getExtension("OES_texture_half_float");
      this.extTextureLod = this.getExtension('EXT_shader_texture_lod');
      this.extUintElement = this.getExtension("OES_element_index_uint");
      this.extVertexArrayObject = this.getExtension("OES_vertex_array_object");
      if (this.extVertexArrayObject) {
        // Install the WebGL 2 VAO API for WebGL 1.0
        const ext = this.extVertexArrayObject;
        gl.createVertexArray = ext.createVertexArrayOES.bind(ext);
        gl.deleteVertexArray = ext.deleteVertexArrayOES.bind(ext);
        gl.isVertexArray = ext.isVertexArrayOES.bind(ext);
        gl.bindVertexArray = ext.bindVertexArrayOES.bind(ext);
      }
      this.extColorBufferFloat = null;
      this.extDepthTexture = gl.getExtension('WEBGL_depth_texture');
    }
    this.extDebugRendererInfo = this.getExtension('WEBGL_debug_renderer_info');
    this.extTextureFloatLinear = this.getExtension("OES_texture_float_linear");
    this.extTextureHalfFloatLinear = this.getExtension("OES_texture_half_float_linear");
    this.extFloatBlend = this.getExtension("EXT_float_blend");
    this.extTextureFilterAnisotropic = this.getExtension('EXT_texture_filter_anisotropic', 'WEBKIT_EXT_texture_filter_anisotropic');
    this.extCompressedTextureETC1 = this.getExtension('WEBGL_compressed_texture_etc1');
    this.extCompressedTextureETC = this.getExtension('WEBGL_compressed_texture_etc');
    this.extCompressedTexturePVRTC = this.getExtension('WEBGL_compressed_texture_pvrtc', 'WEBKIT_WEBGL_compressed_texture_pvrtc');
    this.extCompressedTextureS3TC = this.getExtension('WEBGL_compressed_texture_s3tc', 'WEBKIT_WEBGL_compressed_texture_s3tc');
    this.extCompressedTextureATC = this.getExtension('WEBGL_compressed_texture_atc');
    this.extCompressedTextureASTC = this.getExtension('WEBGL_compressed_texture_astc');
    this.extParallelShaderCompile = this.getExtension('KHR_parallel_shader_compile');

    // iOS exposes this for half precision render targets on both Webgl1 and 2 from iOS v 14.5beta
    this.extColorBufferHalfFloat = this.getExtension("EXT_color_buffer_half_float");
  }

  /**
   * Query the capabilities of the WebGL context.
   *
   * @ignore
   */
  initializeCapabilities() {
    var _contextAttribs$antia, _contextAttribs$stenc;
    const gl = this.gl;
    let ext;
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : "";
    this.maxPrecision = this.precision = this.getPrecision();
    const contextAttribs = gl.getContextAttributes();
    this.supportsMsaa = (_contextAttribs$antia = contextAttribs == null ? void 0 : contextAttribs.antialias) != null ? _contextAttribs$antia : false;
    this.supportsStencil = (_contextAttribs$stenc = contextAttribs == null ? void 0 : contextAttribs.stencil) != null ? _contextAttribs$stenc : false;
    this.supportsInstancing = !!this.extInstancing;

    // Query parameter values from the WebGL context
    this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    this.maxCubeMapSize = gl.getParameter(gl.MAX_CUBE_MAP_TEXTURE_SIZE);
    this.maxRenderBufferSize = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
    this.maxTextures = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);
    this.maxCombinedTextures = gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS);
    this.maxVertexTextures = gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS);
    this.vertexUniformsCount = gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS);
    this.fragmentUniformsCount = gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS);
    if (this.webgl2) {
      this.maxDrawBuffers = gl.getParameter(gl.MAX_DRAW_BUFFERS);
      this.maxColorAttachments = gl.getParameter(gl.MAX_COLOR_ATTACHMENTS);
      this.maxVolumeSize = gl.getParameter(gl.MAX_3D_TEXTURE_SIZE);
      this.supportsMrt = true;
      this.supportsVolumeTextures = true;
    } else {
      ext = this.extDrawBuffers;
      this.supportsMrt = !!ext;
      this.maxDrawBuffers = ext ? gl.getParameter(ext.MAX_DRAW_BUFFERS_WEBGL) : 1;
      this.maxColorAttachments = ext ? gl.getParameter(ext.MAX_COLOR_ATTACHMENTS_WEBGL) : 1;
      this.maxVolumeSize = 1;
    }
    ext = this.extDebugRendererInfo;
    this.unmaskedRenderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';
    this.unmaskedVendor = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : '';

    // Mali-G52 has rendering issues with GPU particles including
    // SM-A225M, M2003J15SC and KFRAWI (Amazon Fire HD 8 2022)
    const maliRendererRegex = /\bMali-G52+/;

    // Samsung devices with Exynos (ARM) either crash or render incorrectly when using GPU for particles. See:
    // https://github.com/playcanvas/engine/issues/3967
    // https://github.com/playcanvas/engine/issues/3415
    // https://github.com/playcanvas/engine/issues/4514
    // Example UA matches: Starting 'SM' and any combination of letters or numbers:
    // Mozilla/5.0 (Linux, Android 12; SM-G970F Build/SP1A.210812.016; wv)
    const samsungModelRegex = /SM-[a-zA-Z0-9]+/;
    this.supportsGpuParticles = !(this.unmaskedVendor === 'ARM' && userAgent.match(samsungModelRegex)) && !this.unmaskedRenderer.match(maliRendererRegex);
    ext = this.extTextureFilterAnisotropic;
    this.maxAnisotropy = ext ? gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT) : 1;
    this.samples = gl.getParameter(gl.SAMPLES);
    this.maxSamples = this.webgl2 && !this.forceDisableMultisampling ? gl.getParameter(gl.MAX_SAMPLES) : 1;

    // Don't allow area lights on old android devices, they often fail to compile the shader, run it incorrectly or are very slow.
    this.supportsAreaLights = this.webgl2 || !platform.android;

    // supports texture fetch instruction
    this.supportsTextureFetch = this.webgl2;

    // Also do not allow them when we only have small number of texture units
    if (this.maxTextures <= 8) {
      this.supportsAreaLights = false;
    }
  }

  /**
   * Set the initial render state on the WebGL context.
   *
   * @ignore
   */
  initializeRenderState() {
    super.initializeRenderState();
    const gl = this.gl;

    // Initialize render state to a known start state

    // default blend state
    gl.disable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ZERO);
    gl.blendEquation(gl.FUNC_ADD);
    gl.colorMask(true, true, true, true);
    this.blendColor = new Color(0, 0, 0, 0);
    gl.blendColor(0, 0, 0, 0);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    // default depth state
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    this.stencil = false;
    gl.disable(gl.STENCIL_TEST);
    this.stencilFuncFront = this.stencilFuncBack = FUNC_ALWAYS;
    this.stencilRefFront = this.stencilRefBack = 0;
    this.stencilMaskFront = this.stencilMaskBack = 0xFF;
    gl.stencilFunc(gl.ALWAYS, 0, 0xFF);
    this.stencilFailFront = this.stencilFailBack = STENCILOP_KEEP;
    this.stencilZfailFront = this.stencilZfailBack = STENCILOP_KEEP;
    this.stencilZpassFront = this.stencilZpassBack = STENCILOP_KEEP;
    this.stencilWriteMaskFront = 0xFF;
    this.stencilWriteMaskBack = 0xFF;
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
    gl.stencilMask(0xFF);
    this.alphaToCoverage = false;
    this.raster = true;
    if (this.webgl2) {
      gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
      gl.disable(gl.RASTERIZER_DISCARD);
    }
    this.depthBiasEnabled = false;
    gl.disable(gl.POLYGON_OFFSET_FILL);
    this.clearDepth = 1;
    gl.clearDepth(1);
    this.clearColor = new Color(0, 0, 0, 0);
    gl.clearColor(0, 0, 0, 0);
    this.clearStencil = 0;
    gl.clearStencil(0);
    if (this.webgl2) {
      gl.hint(gl.FRAGMENT_SHADER_DERIVATIVE_HINT, gl.NICEST);
    } else {
      if (this.extStandardDerivatives) {
        gl.hint(this.extStandardDerivatives.FRAGMENT_SHADER_DERIVATIVE_HINT_OES, gl.NICEST);
      }
    }
    gl.enable(gl.SCISSOR_TEST);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    this.unpackFlipY = false;
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    this.unpackPremultiplyAlpha = false;
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  }
  initializeContextCaches() {
    super.initializeContextCaches();

    // cache of VAOs
    this._vaoMap = new Map();
    this.boundVao = null;
    this.activeFramebuffer = null;
    this.feedback = null;
    this.transformFeedbackBuffer = null;
    this.textureUnit = 0;
    this.textureUnits = [];
    for (let i = 0; i < this.maxCombinedTextures; i++) {
      this.textureUnits.push([null, null, null]);
    }
  }

  /**
   * Called when the WebGL context was lost. It releases all context related resources.
   *
   * @ignore
   */
  loseContext() {
    var _this$gpuProfiler;
    // force the backbuffer to be recreated on restore
    this.backBufferSize.set(-1, -1);

    // release shaders
    for (const shader of this.shaders) {
      shader.loseContext();
    }

    // release textures
    for (const texture of this.textures) {
      texture.loseContext();
    }

    // release vertex and index buffers
    for (const buffer of this.buffers) {
      buffer.loseContext();
    }

    // Reset all render targets so they'll be recreated as required.
    // TODO: a solution for the case where a render target contains something
    // that was previously generated that needs to be re-rendered.
    for (const target of this.targets) {
      target.loseContext();
    }
    (_this$gpuProfiler = this.gpuProfiler) == null ? void 0 : _this$gpuProfiler.loseContext();
  }

  /**
   * Called when the WebGL context is restored. It reinitializes all context related resources.
   *
   * @ignore
   */
  restoreContext() {
    var _this$gpuProfiler2;
    this.initializeExtensions();
    this.initializeCapabilities();
    this.initializeRenderState();
    this.initializeContextCaches();

    // Recompile all shaders (they'll be linked when they're next actually used)
    for (const shader of this.shaders) {
      shader.restoreContext();
    }

    // Recreate buffer objects and reupload buffer data to the GPU
    for (const buffer of this.buffers) {
      buffer.unlock();
    }
    (_this$gpuProfiler2 = this.gpuProfiler) == null ? void 0 : _this$gpuProfiler2.restoreContext();
  }

  /**
   * Called after a batch of shaders was created, to guide in their optimal preparation for rendering.
   *
   * @ignore
   */
  endShaderBatch() {
    WebglShader.endShaderBatch(this);
  }

  /**
   * Set the active rectangle for rendering on the specified device.
   *
   * @param {number} x - The pixel space x-coordinate of the bottom left corner of the viewport.
   * @param {number} y - The pixel space y-coordinate of the bottom left corner of the viewport.
   * @param {number} w - The width of the viewport in pixels.
   * @param {number} h - The height of the viewport in pixels.
   */
  setViewport(x, y, w, h) {
    if (this.vx !== x || this.vy !== y || this.vw !== w || this.vh !== h) {
      this.gl.viewport(x, y, w, h);
      this.vx = x;
      this.vy = y;
      this.vw = w;
      this.vh = h;
    }
  }

  /**
   * Set the active scissor rectangle on the specified device.
   *
   * @param {number} x - The pixel space x-coordinate of the bottom left corner of the scissor rectangle.
   * @param {number} y - The pixel space y-coordinate of the bottom left corner of the scissor rectangle.
   * @param {number} w - The width of the scissor rectangle in pixels.
   * @param {number} h - The height of the scissor rectangle in pixels.
   */
  setScissor(x, y, w, h) {
    if (this.sx !== x || this.sy !== y || this.sw !== w || this.sh !== h) {
      this.gl.scissor(x, y, w, h);
      this.sx = x;
      this.sy = y;
      this.sw = w;
      this.sh = h;
    }
  }

  /**
   * Binds the specified framebuffer object.
   *
   * @param {WebGLFramebuffer | null} fb - The framebuffer to bind.
   * @ignore
   */
  setFramebuffer(fb) {
    if (this.activeFramebuffer !== fb) {
      const gl = this.gl;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      this.activeFramebuffer = fb;
    }
  }

  /**
   * Copies source render target into destination render target. Mostly used by post-effects.
   *
   * @param {RenderTarget} [source] - The source render target. Defaults to frame buffer.
   * @param {RenderTarget} [dest] - The destination render target. Defaults to frame buffer.
   * @param {boolean} [color] - If true will copy the color buffer. Defaults to false.
   * @param {boolean} [depth] - If true will copy the depth buffer. Defaults to false.
   * @returns {boolean} True if the copy was successful, false otherwise.
   */
  copyRenderTarget(source, dest, color, depth) {
    const gl = this.gl;

    // if copying from the backbuffer
    if (source === this.backBuffer) {
      source = null;
    }
    if (!this.webgl2 && depth) {
      Debug.error("Depth is not copyable on WebGL 1.0");
      return false;
    }
    if (color) {
      if (!dest) {
        // copying to backbuffer
        if (!source._colorBuffer) {
          Debug.error("Can't copy empty color buffer to backbuffer");
          return false;
        }
      } else if (source) {
        // copying to render target
        if (!source._colorBuffer || !dest._colorBuffer) {
          Debug.error("Can't copy color buffer, because one of the render targets doesn't have it");
          return false;
        }
        if (source._colorBuffer._format !== dest._colorBuffer._format) {
          Debug.error("Can't copy render targets of different color formats");
          return false;
        }
      }
    }
    if (depth && source) {
      if (!source._depth) {
        // when depth is automatic, we cannot test the buffer nor its format
        if (!source._depthBuffer || !dest._depthBuffer) {
          Debug.error("Can't copy depth buffer, because one of the render targets doesn't have it");
          return false;
        }
        if (source._depthBuffer._format !== dest._depthBuffer._format) {
          Debug.error("Can't copy render targets of different depth formats");
          return false;
        }
      }
    }
    DebugGraphics.pushGpuMarker(this, 'COPY-RT');
    if (this.webgl2 && dest) {
      var _this$backBuffer;
      const prevRt = this.renderTarget;
      this.renderTarget = dest;
      this.updateBegin();

      // copy from single sampled framebuffer
      const src = source ? source.impl._glFrameBuffer : (_this$backBuffer = this.backBuffer) == null ? void 0 : _this$backBuffer.impl._glFrameBuffer;
      const dst = dest.impl._glFrameBuffer;
      Debug.assert(src !== dst, 'Source and destination framebuffers must be different when blitting.');
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, src);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, dst);
      const w = source ? source.width : dest.width;
      const h = source ? source.height : dest.height;
      gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, (color ? gl.COLOR_BUFFER_BIT : 0) | (depth ? gl.DEPTH_BUFFER_BIT : 0), gl.NEAREST);

      // TODO: not sure we need to restore the prev target, as this only should run in-between render passes
      this.renderTarget = prevRt;
      gl.bindFramebuffer(gl.FRAMEBUFFER, prevRt ? prevRt.impl._glFrameBuffer : null);
    } else {
      const shader = this.getCopyShader();
      this.constantTexSource.setValue(source._colorBuffer);
      quadWithShader(this, dest, shader);
    }
    DebugGraphics.popGpuMarker(this);
    return true;
  }

  /**
   * Get copy shader for efficient rendering of fullscreen-quad with texture.
   *
   * @returns {Shader} The copy shader (based on `fullscreenQuadVS` and `outputTex2DPS` in
   * `shaderChunks`).
   * @ignore
   */
  getCopyShader() {
    if (!this._copyShader) {
      this._copyShader = new Shader(this, ShaderUtils.createDefinition(this, {
        name: 'outputTex2D',
        vertexCode: _fullScreenQuadVS,
        fragmentCode: _outputTexture2D
      }));
    }
    return this._copyShader;
  }
  frameStart() {
    super.frameStart();
    this.updateBackbuffer();
    this.gpuProfiler.frameStart();
  }
  frameEnd() {
    super.frameEnd();
    this.gpuProfiler.frameEnd();
    this.gpuProfiler.request();
  }

  /**
   * Start a render pass.
   *
   * @param {import('../render-pass.js').RenderPass} renderPass - The render pass to start.
   * @ignore
   */
  startPass(renderPass) {
    DebugGraphics.pushGpuMarker(this, `START-PASS`);

    // set up render target
    const rt = renderPass.renderTarget || this.backBuffer;
    this.renderTarget = rt;
    Debug.assert(rt);
    this.updateBegin();

    // clear the render target
    const colorOps = renderPass.colorOps;
    const depthStencilOps = renderPass.depthStencilOps;
    if (colorOps != null && colorOps.clear || depthStencilOps.clearDepth || depthStencilOps.clearStencil) {
      // the pass always clears full target
      const _rt = renderPass.renderTarget;
      const width = _rt ? _rt.width : this.width;
      const height = _rt ? _rt.height : this.height;
      this.setViewport(0, 0, width, height);
      this.setScissor(0, 0, width, height);
      let clearFlags = 0;
      const clearOptions = {};
      if (colorOps != null && colorOps.clear) {
        clearFlags |= CLEARFLAG_COLOR;
        clearOptions.color = [colorOps.clearValue.r, colorOps.clearValue.g, colorOps.clearValue.b, colorOps.clearValue.a];
      }
      if (depthStencilOps.clearDepth) {
        clearFlags |= CLEARFLAG_DEPTH;
        clearOptions.depth = depthStencilOps.clearDepthValue;
      }
      if (depthStencilOps.clearStencil) {
        clearFlags |= CLEARFLAG_STENCIL;
        clearOptions.stencil = depthStencilOps.clearStencilValue;
      }

      // clear it
      clearOptions.flags = clearFlags;
      this.clear(clearOptions);
    }
    Debug.call(() => {
      if (this.insideRenderPass) {
        Debug.errorOnce('RenderPass cannot be started while inside another render pass.');
      }
    });
    this.insideRenderPass = true;
    DebugGraphics.popGpuMarker(this);
  }

  /**
   * End a render pass.
   *
   * @param {import('../render-pass.js').RenderPass} renderPass - The render pass to end.
   * @ignore
   */
  endPass(renderPass) {
    DebugGraphics.pushGpuMarker(this, `END-PASS`);
    this.unbindVertexArray();
    const target = this.renderTarget;
    const colorBufferCount = renderPass.colorArrayOps.length;
    if (target) {
      var _renderPass$colorOps;
      // invalidate buffers to stop them being written to on tiled architectures
      if (this.webgl2) {
        invalidateAttachments.length = 0;
        const gl = this.gl;

        // color buffers
        for (let i = 0; i < colorBufferCount; i++) {
          const colorOps = renderPass.colorArrayOps[i];

          // invalidate color only if we don't need to resolve it
          if (!(colorOps.store || colorOps.resolve)) {
            invalidateAttachments.push(gl.COLOR_ATTACHMENT0 + i);
          }
        }

        // we cannot invalidate depth/stencil buffers of the backbuffer
        if (target !== this.backBuffer) {
          if (!renderPass.depthStencilOps.storeDepth) {
            invalidateAttachments.push(gl.DEPTH_ATTACHMENT);
          }
          if (!renderPass.depthStencilOps.storeStencil) {
            invalidateAttachments.push(gl.STENCIL_ATTACHMENT);
          }
        }
        if (invalidateAttachments.length > 0) {
          // invalidate the whole buffer
          // TODO: we could handle viewport invalidation as well
          if (renderPass.fullSizeClearRect) {
            gl.invalidateFramebuffer(gl.DRAW_FRAMEBUFFER, invalidateAttachments);
          }
        }
      }

      // resolve the color buffer (this resolves all MRT color buffers at once)
      if ((_renderPass$colorOps = renderPass.colorOps) != null && _renderPass$colorOps.resolve) {
        if (this.webgl2 && renderPass.samples > 1 && target.autoResolve) {
          target.resolve(true, false);
        }
      }

      // generate mipmaps
      for (let i = 0; i < colorBufferCount; i++) {
        const colorOps = renderPass.colorArrayOps[i];
        if (colorOps.mipmaps) {
          const colorBuffer = target._colorBuffers[i];
          if (colorBuffer && colorBuffer.impl._glTexture && colorBuffer.mipmaps && (colorBuffer.pot || this.webgl2)) {
            DebugGraphics.pushGpuMarker(this, `MIPS${i}`);
            this.activeTexture(this.maxCombinedTextures - 1);
            this.bindTexture(colorBuffer);
            this.gl.generateMipmap(colorBuffer.impl._glTarget);
            DebugGraphics.popGpuMarker(this);
          }
        }
      }
    }
    this.insideRenderPass = false;
    DebugGraphics.popGpuMarker(this);
  }
  set defaultFramebuffer(value) {
    if (this._defaultFramebuffer !== value) {
      this._defaultFramebuffer = value;
      this._defaultFramebufferChanged = true;
    }
  }
  get defaultFramebuffer() {
    return this._defaultFramebuffer;
  }

  /**
   * Marks the beginning of a block of rendering. Internally, this function binds the render
   * target currently set on the device. This function should be matched with a call to
   * {@link GraphicsDevice#updateEnd}. Calls to {@link GraphicsDevice#updateBegin} and
   * {@link GraphicsDevice#updateEnd} must not be nested.
   *
   * @ignore
   */
  updateBegin() {
    var _this$renderTarget;
    DebugGraphics.pushGpuMarker(this, 'UPDATE-BEGIN');
    this.boundVao = null;

    // clear texture units once a frame on desktop safari
    if (this._tempEnableSafariTextureUnitWorkaround) {
      for (let unit = 0; unit < this.textureUnits.length; ++unit) {
        for (let slot = 0; slot < 3; ++slot) {
          this.textureUnits[unit][slot] = null;
        }
      }
    }

    // Set the render target
    const target = (_this$renderTarget = this.renderTarget) != null ? _this$renderTarget : this.backBuffer;
    Debug.assert(target);

    // Initialize the framebuffer
    const targetImpl = target.impl;
    if (!targetImpl.initialized) {
      this.initRenderTarget(target);
    }

    // Bind the framebuffer
    this.setFramebuffer(targetImpl._glFrameBuffer);
    DebugGraphics.popGpuMarker(this);
  }

  /**
   * Marks the end of a block of rendering. This function should be called after a matching call
   * to {@link GraphicsDevice#updateBegin}. Calls to {@link GraphicsDevice#updateBegin} and
   * {@link GraphicsDevice#updateEnd} must not be nested.
   *
   * @ignore
   */
  updateEnd() {
    DebugGraphics.pushGpuMarker(this, `UPDATE-END`);
    this.unbindVertexArray();

    // Unset the render target
    const target = this.renderTarget;
    if (target && target !== this.backBuffer) {
      // Resolve MSAA if needed
      if (this.webgl2 && target._samples > 1 && target.autoResolve) {
        target.resolve();
      }

      // If the active render target is auto-mipmapped, generate its mip chain
      const colorBuffer = target._colorBuffer;
      if (colorBuffer && colorBuffer.impl._glTexture && colorBuffer.mipmaps && (colorBuffer.pot || this.webgl2)) {
        // FIXME: if colorBuffer is a cubemap currently we're re-generating mipmaps after
        // updating each face!
        this.activeTexture(this.maxCombinedTextures - 1);
        this.bindTexture(colorBuffer);
        this.gl.generateMipmap(colorBuffer.impl._glTarget);
      }
    }
    DebugGraphics.popGpuMarker(this);
  }

  /**
   * Updates a texture's vertical flip.
   *
   * @param {boolean} flipY - True to flip the texture vertically.
   * @ignore
   */
  setUnpackFlipY(flipY) {
    if (this.unpackFlipY !== flipY) {
      this.unpackFlipY = flipY;

      // Note: the WebGL spec states that UNPACK_FLIP_Y_WEBGL only affects
      // texImage2D and texSubImage2D, not compressedTexImage2D
      const gl = this.gl;
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flipY);
    }
  }

  /**
   * Updates a texture to have its RGB channels premultiplied by its alpha channel or not.
   *
   * @param {boolean} premultiplyAlpha - True to premultiply the alpha channel against the RGB
   * channels.
   * @ignore
   */
  setUnpackPremultiplyAlpha(premultiplyAlpha) {
    if (this.unpackPremultiplyAlpha !== premultiplyAlpha) {
      this.unpackPremultiplyAlpha = premultiplyAlpha;

      // Note: the WebGL spec states that UNPACK_PREMULTIPLY_ALPHA_WEBGL only affects
      // texImage2D and texSubImage2D, not compressedTexImage2D
      const gl = this.gl;
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiplyAlpha);
    }
  }

  /**
   * Activate the specified texture unit.
   *
   * @param {number} textureUnit - The texture unit to activate.
   * @ignore
   */
  activeTexture(textureUnit) {
    if (this.textureUnit !== textureUnit) {
      this.gl.activeTexture(this.gl.TEXTURE0 + textureUnit);
      this.textureUnit = textureUnit;
    }
  }

  /**
   * If the texture is not already bound on the currently active texture unit, bind it.
   *
   * @param {Texture} texture - The texture to bind.
   * @ignore
   */
  bindTexture(texture) {
    const impl = texture.impl;
    const textureTarget = impl._glTarget;
    const textureObject = impl._glTexture;
    const textureUnit = this.textureUnit;
    const slot = this.targetToSlot[textureTarget];
    if (this.textureUnits[textureUnit][slot] !== textureObject) {
      this.gl.bindTexture(textureTarget, textureObject);
      this.textureUnits[textureUnit][slot] = textureObject;
    }
  }

  /**
   * If the texture is not bound on the specified texture unit, active the texture unit and bind
   * the texture to it.
   *
   * @param {Texture} texture - The texture to bind.
   * @param {number} textureUnit - The texture unit to activate and bind the texture to.
   * @ignore
   */
  bindTextureOnUnit(texture, textureUnit) {
    const impl = texture.impl;
    const textureTarget = impl._glTarget;
    const textureObject = impl._glTexture;
    const slot = this.targetToSlot[textureTarget];
    if (this.textureUnits[textureUnit][slot] !== textureObject) {
      this.activeTexture(textureUnit);
      this.gl.bindTexture(textureTarget, textureObject);
      this.textureUnits[textureUnit][slot] = textureObject;
    }
  }

  /**
   * Update the texture parameters for a given texture if they have changed.
   *
   * @param {Texture} texture - The texture to update.
   * @ignore
   */
  setTextureParameters(texture) {
    const gl = this.gl;
    const flags = texture.impl.dirtyParameterFlags;
    const target = texture.impl._glTarget;
    if (flags & 1) {
      let filter = texture._minFilter;
      if (!texture.pot && !this.webgl2 || !texture._mipmaps || texture._compressed && texture._levels.length === 1) {
        if (filter === FILTER_NEAREST_MIPMAP_NEAREST || filter === FILTER_NEAREST_MIPMAP_LINEAR) {
          filter = FILTER_NEAREST;
        } else if (filter === FILTER_LINEAR_MIPMAP_NEAREST || filter === FILTER_LINEAR_MIPMAP_LINEAR) {
          filter = FILTER_LINEAR;
        }
      }
      gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, this.glFilter[filter]);
    }
    if (flags & 2) {
      gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, this.glFilter[texture._magFilter]);
    }
    if (flags & 4) {
      if (this.webgl2) {
        gl.texParameteri(target, gl.TEXTURE_WRAP_S, this.glAddress[texture._addressU]);
      } else {
        // WebGL1 doesn't support all addressing modes with NPOT textures
        gl.texParameteri(target, gl.TEXTURE_WRAP_S, this.glAddress[texture.pot ? texture._addressU : ADDRESS_CLAMP_TO_EDGE]);
      }
    }
    if (flags & 8) {
      if (this.webgl2) {
        gl.texParameteri(target, gl.TEXTURE_WRAP_T, this.glAddress[texture._addressV]);
      } else {
        // WebGL1 doesn't support all addressing modes with NPOT textures
        gl.texParameteri(target, gl.TEXTURE_WRAP_T, this.glAddress[texture.pot ? texture._addressV : ADDRESS_CLAMP_TO_EDGE]);
      }
    }
    if (flags & 16) {
      if (this.webgl2) {
        gl.texParameteri(target, gl.TEXTURE_WRAP_R, this.glAddress[texture._addressW]);
      }
    }
    if (flags & 32) {
      if (this.webgl2) {
        gl.texParameteri(target, gl.TEXTURE_COMPARE_MODE, texture._compareOnRead ? gl.COMPARE_REF_TO_TEXTURE : gl.NONE);
      }
    }
    if (flags & 64) {
      if (this.webgl2) {
        gl.texParameteri(target, gl.TEXTURE_COMPARE_FUNC, this.glComparison[texture._compareFunc]);
      }
    }
    if (flags & 128) {
      const ext = this.extTextureFilterAnisotropic;
      if (ext) {
        gl.texParameterf(target, ext.TEXTURE_MAX_ANISOTROPY_EXT, math.clamp(Math.round(texture._anisotropy), 1, this.maxAnisotropy));
      }
    }
  }

  /**
   * Sets the specified texture on the specified texture unit.
   *
   * @param {Texture} texture - The texture to set.
   * @param {number} textureUnit - The texture unit to set the texture on.
   * @ignore
   */
  setTexture(texture, textureUnit) {
    const impl = texture.impl;
    if (!impl._glTexture) impl.initialize(this, texture);
    if (impl.dirtyParameterFlags > 0 || texture._needsUpload || texture._needsMipmapsUpload) {
      // Ensure the specified texture unit is active
      this.activeTexture(textureUnit);

      // Ensure the texture is bound on correct target of the specified texture unit
      this.bindTexture(texture);
      if (impl.dirtyParameterFlags) {
        this.setTextureParameters(texture);
        impl.dirtyParameterFlags = 0;
      }
      if (texture._needsUpload || texture._needsMipmapsUpload) {
        impl.upload(this, texture);
        texture._needsUpload = false;
        texture._needsMipmapsUpload = false;
      }
    } else {
      // Ensure the texture is currently bound to the correct target on the specified texture unit.
      // If the texture is already bound to the correct target on the specified unit, there's no need
      // to actually make the specified texture unit active because the texture itself does not need
      // to be updated.
      this.bindTextureOnUnit(texture, textureUnit);
    }
  }

  // function creates VertexArrayObject from list of vertex buffers
  createVertexArray(vertexBuffers) {
    let key, vao;

    // only use cache when more than 1 vertex buffer, otherwise it's unique
    const useCache = vertexBuffers.length > 1;
    if (useCache) {
      // generate unique key for the vertex buffers
      key = "";
      for (let i = 0; i < vertexBuffers.length; i++) {
        const vertexBuffer = vertexBuffers[i];
        key += vertexBuffer.id + vertexBuffer.format.renderingHash;
      }

      // try to get VAO from cache
      vao = this._vaoMap.get(key);
    }

    // need to create new vao
    if (!vao) {
      // create VA object
      const gl = this.gl;
      vao = gl.createVertexArray();
      gl.bindVertexArray(vao);

      // don't capture index buffer in VAO
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
      let locZero = false;
      for (let i = 0; i < vertexBuffers.length; i++) {
        // bind buffer
        const vertexBuffer = vertexBuffers[i];
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer.impl.bufferId);

        // for each attribute
        const elements = vertexBuffer.format.elements;
        for (let j = 0; j < elements.length; j++) {
          const e = elements[j];
          const loc = semanticToLocation[e.name];
          if (loc === 0) {
            locZero = true;
          }
          gl.vertexAttribPointer(loc, e.numComponents, this.glType[e.dataType], e.normalize, e.stride, e.offset);
          gl.enableVertexAttribArray(loc);
          if (vertexBuffer.format.instancing) {
            gl.vertexAttribDivisor(loc, 1);
          }
        }
      }

      // end of VA object
      gl.bindVertexArray(null);

      // unbind any array buffer
      gl.bindBuffer(gl.ARRAY_BUFFER, null);

      // add it to cache
      if (useCache) {
        this._vaoMap.set(key, vao);
      }
      if (!locZero) {
        Debug.warn("No vertex attribute is mapped to location 0, which might cause compatibility issues on Safari on MacOS - please use attribute SEMANTIC_POSITION or SEMANTIC_ATTR15");
      }
    }
    return vao;
  }
  unbindVertexArray() {
    // unbind VAO from device to protect it from being changed
    if (this.boundVao) {
      this.boundVao = null;
      this.gl.bindVertexArray(null);
    }
  }
  setBuffers() {
    const gl = this.gl;
    let vao;

    // create VAO for specified vertex buffers
    if (this.vertexBuffers.length === 1) {
      // single VB keeps its VAO
      const vertexBuffer = this.vertexBuffers[0];
      Debug.assert(vertexBuffer.device === this, "The VertexBuffer was not created using current GraphicsDevice");
      if (!vertexBuffer.impl.vao) {
        vertexBuffer.impl.vao = this.createVertexArray(this.vertexBuffers);
      }
      vao = vertexBuffer.impl.vao;
    } else {
      // obtain temporary VAO for multiple vertex buffers
      vao = this.createVertexArray(this.vertexBuffers);
    }

    // set active VAO
    if (this.boundVao !== vao) {
      this.boundVao = vao;
      gl.bindVertexArray(vao);
    }

    // empty array of vertex buffers
    this.vertexBuffers.length = 0;

    // Set the active index buffer object
    // Note: we don't cache this state and set it only when it changes, as VAO captures last bind buffer in it
    // and so we don't know what VAO sets it to.
    const bufferId = this.indexBuffer ? this.indexBuffer.impl.bufferId : null;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bufferId);
  }

  /**
   * Submits a graphical primitive to the hardware for immediate rendering.
   *
   * @param {object} primitive - Primitive object describing how to submit current vertex/index
   * buffers.
   * @param {number} primitive.type - The type of primitive to render. Can be:
   *
   * - {@link PRIMITIVE_POINTS}
   * - {@link PRIMITIVE_LINES}
   * - {@link PRIMITIVE_LINELOOP}
   * - {@link PRIMITIVE_LINESTRIP}
   * - {@link PRIMITIVE_TRIANGLES}
   * - {@link PRIMITIVE_TRISTRIP}
   * - {@link PRIMITIVE_TRIFAN}
   *
   * @param {number} primitive.base - The offset of the first index or vertex to dispatch in the
   * draw call.
   * @param {number} primitive.count - The number of indices or vertices to dispatch in the draw
   * call.
   * @param {boolean} [primitive.indexed] - True to interpret the primitive as indexed, thereby
   * using the currently set index buffer and false otherwise.
   * @param {number} [numInstances] - The number of instances to render when using
   * ANGLE_instanced_arrays. Defaults to 1.
   * @param {boolean} [keepBuffers] - Optionally keep the current set of vertex / index buffers /
   * VAO. This is used when rendering of multiple views, for example under WebXR.
   * @example
   * // Render a single, unindexed triangle
   * device.draw({
   *     type: pc.PRIMITIVE_TRIANGLES,
   *     base: 0,
   *     count: 3,
   *     indexed: false
   * });
   */
  draw(primitive, numInstances, keepBuffers) {
    const gl = this.gl;
    let sampler, samplerValue, texture, numTextures; // Samplers
    let uniform, scopeId, uniformVersion, programVersion; // Uniforms
    const shader = this.shader;
    if (!shader) return;
    const samplers = shader.impl.samplers;
    const uniforms = shader.impl.uniforms;

    // vertex buffers
    if (!keepBuffers) {
      this.setBuffers();
    }

    // Commit the shader program variables
    let textureUnit = 0;
    for (let i = 0, len = samplers.length; i < len; i++) {
      sampler = samplers[i];
      samplerValue = sampler.scopeId.value;
      if (!samplerValue) {
        const samplerName = sampler.scopeId.name;
        if (samplerName === 'uSceneDepthMap' || samplerName === 'uDepthMap') {
          Debug.warnOnce(`A sampler ${samplerName} is used by the shader but a scene depth texture is not available. Use CameraComponent.requestSceneDepthMap to enable it.`);
        }
        if (samplerName === 'uSceneColorMap' || samplerName === 'texture_grabPass') {
          Debug.warnOnce(`A sampler ${samplerName} is used by the shader but a scene color texture is not available. Use CameraComponent.requestSceneColorMap to enable it.`);
        }
        Debug.errorOnce(`Shader [${shader.label}] requires texture sampler [${samplerName}] which has not been set, while rendering [${DebugGraphics.toString()}]`);

        // skip this draw call to avoid incorrect rendering / webgl errors
        return;
      }
      if (samplerValue instanceof Texture) {
        texture = samplerValue;
        this.setTexture(texture, textureUnit);
        if (this.renderTarget) {
          // Set breakpoint here to debug "Source and destination textures of the draw are the same" errors
          if (this.renderTarget._samples < 2) {
            if (this.renderTarget.colorBuffer && this.renderTarget.colorBuffer === texture) {
              Debug.error("Trying to bind current color buffer as a texture", {
                renderTarget: this.renderTarget,
                texture
              });
            } else if (this.renderTarget.depthBuffer && this.renderTarget.depthBuffer === texture) {
              Debug.error("Trying to bind current depth buffer as a texture", {
                texture
              });
            }
          }
        }
        if (sampler.slot !== textureUnit) {
          gl.uniform1i(sampler.locationId, textureUnit);
          sampler.slot = textureUnit;
        }
        textureUnit++;
      } else {
        // Array
        sampler.array.length = 0;
        numTextures = samplerValue.length;
        for (let j = 0; j < numTextures; j++) {
          texture = samplerValue[j];
          this.setTexture(texture, textureUnit);
          sampler.array[j] = textureUnit;
          textureUnit++;
        }
        gl.uniform1iv(sampler.locationId, sampler.array);
      }
    }

    // Commit any updated uniforms
    for (let i = 0, len = uniforms.length; i < len; i++) {
      uniform = uniforms[i];
      scopeId = uniform.scopeId;
      uniformVersion = uniform.version;
      programVersion = scopeId.versionObject.version;

      // Check the value is valid
      if (uniformVersion.globalId !== programVersion.globalId || uniformVersion.revision !== programVersion.revision) {
        uniformVersion.globalId = programVersion.globalId;
        uniformVersion.revision = programVersion.revision;

        // Call the function to commit the uniform value
        if (scopeId.value !== null) {
          this.commitFunction[uniform.dataType](uniform, scopeId.value);
        }
      }
    }
    if (this.webgl2 && this.transformFeedbackBuffer) {
      // Enable TF, start writing to out buffer
      gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, this.transformFeedbackBuffer.impl.bufferId);
      gl.beginTransformFeedback(gl.POINTS);
    }
    const mode = this.glPrimitive[primitive.type];
    const count = primitive.count;
    if (primitive.indexed) {
      const indexBuffer = this.indexBuffer;
      Debug.assert(indexBuffer.device === this, "The IndexBuffer was not created using current GraphicsDevice");
      const format = indexBuffer.impl.glFormat;
      const offset = primitive.base * indexBuffer.bytesPerIndex;
      if (numInstances > 0) {
        gl.drawElementsInstanced(mode, count, format, offset, numInstances);
      } else {
        gl.drawElements(mode, count, format, offset);
      }
    } else {
      const first = primitive.base;
      if (numInstances > 0) {
        gl.drawArraysInstanced(mode, first, count, numInstances);
      } else {
        gl.drawArrays(mode, first, count);
      }
    }
    if (this.webgl2 && this.transformFeedbackBuffer) {
      // disable TF
      gl.endTransformFeedback();
      gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
    }
    this._drawCallsPerFrame++;
    this._primsPerFrame[primitive.type] += primitive.count * (numInstances > 1 ? numInstances : 1);
  }

  /**
   * Clears the frame buffer of the currently set render target.
   *
   * @param {object} [options] - Optional options object that controls the behavior of the clear
   * operation defined as follows:
   * @param {number[]} [options.color] - The color to clear the color buffer to in the range 0 to
   * 1 for each component.
   * @param {number} [options.depth] - The depth value to clear the depth buffer to in the
   * range 0 to 1. Defaults to 1.
   * @param {number} [options.flags] - The buffers to clear (the types being color, depth and
   * stencil). Can be any bitwise combination of:
   *
   * - {@link CLEARFLAG_COLOR}
   * - {@link CLEARFLAG_DEPTH}
   * - {@link CLEARFLAG_STENCIL}
   *
   * @param {number} [options.stencil] - The stencil value to clear the stencil buffer to.
   * Defaults to 0.
   * @example
   * // Clear color buffer to black and depth buffer to 1
   * device.clear();
   *
   * // Clear just the color buffer to red
   * device.clear({
   *     color: [1, 0, 0, 1],
   *     flags: pc.CLEARFLAG_COLOR
   * });
   *
   * // Clear color buffer to yellow and depth to 1.0
   * device.clear({
   *     color: [1, 1, 0, 1],
   *     depth: 1,
   *     flags: pc.CLEARFLAG_COLOR | pc.CLEARFLAG_DEPTH
   * });
   */
  clear(options) {
    var _options$flags;
    const defaultOptions = this.defaultClearOptions;
    options = options || defaultOptions;
    const flags = (_options$flags = options.flags) != null ? _options$flags : defaultOptions.flags;
    if (flags !== 0) {
      const gl = this.gl;

      // Set the clear color
      if (flags & CLEARFLAG_COLOR) {
        var _options$color;
        const color = (_options$color = options.color) != null ? _options$color : defaultOptions.color;
        const r = color[0];
        const g = color[1];
        const b = color[2];
        const a = color[3];
        const c = this.clearColor;
        if (r !== c.r || g !== c.g || b !== c.b || a !== c.a) {
          this.gl.clearColor(r, g, b, a);
          this.clearColor.set(r, g, b, a);
        }
        this.setBlendState(BlendState.NOBLEND);
      }
      if (flags & CLEARFLAG_DEPTH) {
        var _options$depth;
        // Set the clear depth
        const depth = (_options$depth = options.depth) != null ? _options$depth : defaultOptions.depth;
        if (depth !== this.clearDepth) {
          this.gl.clearDepth(depth);
          this.clearDepth = depth;
        }
        this.setDepthState(DepthState.WRITEDEPTH);
      }
      if (flags & CLEARFLAG_STENCIL) {
        var _options$stencil;
        // Set the clear stencil
        const stencil = (_options$stencil = options.stencil) != null ? _options$stencil : defaultOptions.stencil;
        if (stencil !== this.clearStencil) {
          this.gl.clearStencil(stencil);
          this.clearStencil = stencil;
        }
      }

      // Clear the frame buffer
      gl.clear(this.glClearFlag[flags]);
    }
  }
  submit() {
    this.gl.flush();
  }

  /**
   * Reads a block of pixels from a specified rectangle of the current color framebuffer into an
   * ArrayBufferView object.
   *
   * @param {number} x - The x-coordinate of the rectangle's lower-left corner.
   * @param {number} y - The y-coordinate of the rectangle's lower-left corner.
   * @param {number} w - The width of the rectangle, in pixels.
   * @param {number} h - The height of the rectangle, in pixels.
   * @param {ArrayBufferView} pixels - The ArrayBufferView object that holds the returned pixel
   * data.
   * @ignore
   */
  readPixels(x, y, w, h, pixels) {
    const gl = this.gl;
    gl.readPixels(x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  }

  /**
   * Asynchronously reads a block of pixels from a specified rectangle of the current color framebuffer
   * into an ArrayBufferView object.
   *
   * @param {number} x - The x-coordinate of the rectangle's lower-left corner.
   * @param {number} y - The y-coordinate of the rectangle's lower-left corner.
   * @param {number} w - The width of the rectangle, in pixels.
   * @param {number} h - The height of the rectangle, in pixels.
   * @param {ArrayBufferView} pixels - The ArrayBufferView object that holds the returned pixel
   * data.
   * @ignore
   */
  async readPixelsAsync(x, y, w, h, pixels) {
    var _this$renderTarget$co, _impl$_glFormat, _impl$_glPixelType;
    const gl = this.gl;
    if (!this.webgl2) {
      // async fences aren't supported on webgl1
      this.readPixels(x, y, w, h, pixels);
      return;
    }
    const clientWaitAsync = (flags, interval_ms) => {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      this.submit();
      return new Promise((resolve, reject) => {
        function test() {
          const res = gl.clientWaitSync(sync, flags, 0);
          if (res === gl.WAIT_FAILED) {
            gl.deleteSync(sync);
            reject(new Error('webgl clientWaitSync sync failed'));
          } else if (res === gl.TIMEOUT_EXPIRED) {
            setTimeout(test, interval_ms);
          } else {
            gl.deleteSync(sync);
            resolve();
          }
        }
        test();
      });
    };
    const impl = (_this$renderTarget$co = this.renderTarget.colorBuffer) == null ? void 0 : _this$renderTarget$co.impl;
    const format = (_impl$_glFormat = impl == null ? void 0 : impl._glFormat) != null ? _impl$_glFormat : gl.RGBA;
    const pixelType = (_impl$_glPixelType = impl == null ? void 0 : impl._glPixelType) != null ? _impl$_glPixelType : gl.UNSIGNED_BYTE;

    // create temporary (gpu-side) buffer and copy data into it
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buf);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, pixels.byteLength, gl.STREAM_READ);
    gl.readPixels(x, y, w, h, format, pixelType, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);

    // async wait for previous read to finish
    await clientWaitAsync(0, 20);

    // copy the resulting data once it's arrived
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buf);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, pixels);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    gl.deleteBuffer(buf);
  }

  /**
   * Enables or disables alpha to coverage (WebGL2 only).
   *
   * @param {boolean} state - True to enable alpha to coverage and false to disable it.
   * @ignore
   */
  setAlphaToCoverage(state) {
    if (!this.webgl2) return;
    if (this.alphaToCoverage === state) return;
    this.alphaToCoverage = state;
    if (state) {
      this.gl.enable(this.gl.SAMPLE_ALPHA_TO_COVERAGE);
    } else {
      this.gl.disable(this.gl.SAMPLE_ALPHA_TO_COVERAGE);
    }
  }

  /**
   * Sets the output vertex buffer. It will be written to by a shader with transform feedback
   * varyings.
   *
   * @param {import('../vertex-buffer.js').VertexBuffer} tf - The output vertex buffer.
   * @ignore
   */
  setTransformFeedbackBuffer(tf) {
    if (this.transformFeedbackBuffer === tf) return;
    this.transformFeedbackBuffer = tf;
    if (this.webgl2) {
      const gl = this.gl;
      if (tf) {
        if (!this.feedback) {
          this.feedback = gl.createTransformFeedback();
        }
        gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, this.feedback);
      } else {
        gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
      }
    }
  }

  /**
   * Toggles the rasterization render state. Useful with transform feedback, when you only need
   * to process the data without drawing.
   *
   * @param {boolean} on - True to enable rasterization and false to disable it.
   * @ignore
   */
  setRaster(on) {
    if (this.raster === on) return;
    this.raster = on;
    if (this.webgl2) {
      if (on) {
        this.gl.disable(this.gl.RASTERIZER_DISCARD);
      } else {
        this.gl.enable(this.gl.RASTERIZER_DISCARD);
      }
    }
  }

  /**
   * Toggles the polygon offset render state.
   *
   * @param {boolean} on - True to enable polygon offset and false to disable it.
   * @ignore
   */
  setDepthBias(on) {
    if (this.depthBiasEnabled === on) return;
    this.depthBiasEnabled = on;
    if (on) {
      this.gl.enable(this.gl.POLYGON_OFFSET_FILL);
    } else {
      this.gl.disable(this.gl.POLYGON_OFFSET_FILL);
    }
  }

  /**
   * Specifies the scale factor and units to calculate depth values. The offset is added before
   * the depth test is performed and before the value is written into the depth buffer.
   *
   * @param {number} constBias - The multiplier by which an implementation-specific value is
   * multiplied with to create a constant depth offset.
   * @param {number} slopeBias - The scale factor for the variable depth offset for each polygon.
   * @ignore
   */
  setDepthBiasValues(constBias, slopeBias) {
    this.gl.polygonOffset(slopeBias, constBias);
  }
  setStencilTest(enable) {
    if (this.stencil !== enable) {
      const gl = this.gl;
      if (enable) {
        gl.enable(gl.STENCIL_TEST);
      } else {
        gl.disable(gl.STENCIL_TEST);
      }
      this.stencil = enable;
    }
  }
  setStencilFunc(func, ref, mask) {
    if (this.stencilFuncFront !== func || this.stencilRefFront !== ref || this.stencilMaskFront !== mask || this.stencilFuncBack !== func || this.stencilRefBack !== ref || this.stencilMaskBack !== mask) {
      this.gl.stencilFunc(this.glComparison[func], ref, mask);
      this.stencilFuncFront = this.stencilFuncBack = func;
      this.stencilRefFront = this.stencilRefBack = ref;
      this.stencilMaskFront = this.stencilMaskBack = mask;
    }
  }
  setStencilFuncFront(func, ref, mask) {
    if (this.stencilFuncFront !== func || this.stencilRefFront !== ref || this.stencilMaskFront !== mask) {
      const gl = this.gl;
      gl.stencilFuncSeparate(gl.FRONT, this.glComparison[func], ref, mask);
      this.stencilFuncFront = func;
      this.stencilRefFront = ref;
      this.stencilMaskFront = mask;
    }
  }
  setStencilFuncBack(func, ref, mask) {
    if (this.stencilFuncBack !== func || this.stencilRefBack !== ref || this.stencilMaskBack !== mask) {
      const gl = this.gl;
      gl.stencilFuncSeparate(gl.BACK, this.glComparison[func], ref, mask);
      this.stencilFuncBack = func;
      this.stencilRefBack = ref;
      this.stencilMaskBack = mask;
    }
  }
  setStencilOperation(fail, zfail, zpass, writeMask) {
    if (this.stencilFailFront !== fail || this.stencilZfailFront !== zfail || this.stencilZpassFront !== zpass || this.stencilFailBack !== fail || this.stencilZfailBack !== zfail || this.stencilZpassBack !== zpass) {
      this.gl.stencilOp(this.glStencilOp[fail], this.glStencilOp[zfail], this.glStencilOp[zpass]);
      this.stencilFailFront = this.stencilFailBack = fail;
      this.stencilZfailFront = this.stencilZfailBack = zfail;
      this.stencilZpassFront = this.stencilZpassBack = zpass;
    }
    if (this.stencilWriteMaskFront !== writeMask || this.stencilWriteMaskBack !== writeMask) {
      this.gl.stencilMask(writeMask);
      this.stencilWriteMaskFront = writeMask;
      this.stencilWriteMaskBack = writeMask;
    }
  }
  setStencilOperationFront(fail, zfail, zpass, writeMask) {
    if (this.stencilFailFront !== fail || this.stencilZfailFront !== zfail || this.stencilZpassFront !== zpass) {
      this.gl.stencilOpSeparate(this.gl.FRONT, this.glStencilOp[fail], this.glStencilOp[zfail], this.glStencilOp[zpass]);
      this.stencilFailFront = fail;
      this.stencilZfailFront = zfail;
      this.stencilZpassFront = zpass;
    }
    if (this.stencilWriteMaskFront !== writeMask) {
      this.gl.stencilMaskSeparate(this.gl.FRONT, writeMask);
      this.stencilWriteMaskFront = writeMask;
    }
  }
  setStencilOperationBack(fail, zfail, zpass, writeMask) {
    if (this.stencilFailBack !== fail || this.stencilZfailBack !== zfail || this.stencilZpassBack !== zpass) {
      this.gl.stencilOpSeparate(this.gl.BACK, this.glStencilOp[fail], this.glStencilOp[zfail], this.glStencilOp[zpass]);
      this.stencilFailBack = fail;
      this.stencilZfailBack = zfail;
      this.stencilZpassBack = zpass;
    }
    if (this.stencilWriteMaskBack !== writeMask) {
      this.gl.stencilMaskSeparate(this.gl.BACK, writeMask);
      this.stencilWriteMaskBack = writeMask;
    }
  }
  setBlendState(blendState) {
    const currentBlendState = this.blendState;
    if (!currentBlendState.equals(blendState)) {
      const gl = this.gl;

      // state values to set
      const {
        blend,
        colorOp,
        alphaOp,
        colorSrcFactor,
        colorDstFactor,
        alphaSrcFactor,
        alphaDstFactor
      } = blendState;

      // enable blend
      if (currentBlendState.blend !== blend) {
        if (blend) {
          gl.enable(gl.BLEND);
        } else {
          gl.disable(gl.BLEND);
        }
      }

      // blend ops
      if (currentBlendState.colorOp !== colorOp || currentBlendState.alphaOp !== alphaOp) {
        const glBlendEquation = this.glBlendEquation;
        gl.blendEquationSeparate(glBlendEquation[colorOp], glBlendEquation[alphaOp]);
      }

      // blend factors
      if (currentBlendState.colorSrcFactor !== colorSrcFactor || currentBlendState.colorDstFactor !== colorDstFactor || currentBlendState.alphaSrcFactor !== alphaSrcFactor || currentBlendState.alphaDstFactor !== alphaDstFactor) {
        gl.blendFuncSeparate(this.glBlendFunctionColor[colorSrcFactor], this.glBlendFunctionColor[colorDstFactor], this.glBlendFunctionAlpha[alphaSrcFactor], this.glBlendFunctionAlpha[alphaDstFactor]);
      }

      // color write
      if (currentBlendState.allWrite !== blendState.allWrite) {
        this.gl.colorMask(blendState.redWrite, blendState.greenWrite, blendState.blueWrite, blendState.alphaWrite);
      }

      // update internal state
      currentBlendState.copy(blendState);
    }
  }

  /**
   * Set the source and destination blending factors.
   *
   * @param {number} r - The red component in the range of 0 to 1. Default value is 0.
   * @param {number} g - The green component in the range of 0 to 1. Default value is 0.
   * @param {number} b - The blue component in the range of 0 to 1. Default value is 0.
   * @param {number} a - The alpha component in the range of 0 to 1. Default value is 0.
   * @ignore
   */
  setBlendColor(r, g, b, a) {
    const c = this.blendColor;
    if (r !== c.r || g !== c.g || b !== c.b || a !== c.a) {
      this.gl.blendColor(r, g, b, a);
      c.set(r, g, b, a);
    }
  }
  setStencilState(stencilFront, stencilBack) {
    if (stencilFront || stencilBack) {
      this.setStencilTest(true);
      if (stencilFront === stencilBack) {
        // identical front/back stencil
        this.setStencilFunc(stencilFront.func, stencilFront.ref, stencilFront.readMask);
        this.setStencilOperation(stencilFront.fail, stencilFront.zfail, stencilFront.zpass, stencilFront.writeMask);
      } else {
        var _stencilFront, _stencilBack;
        // front
        (_stencilFront = stencilFront) != null ? _stencilFront : stencilFront = StencilParameters.DEFAULT;
        this.setStencilFuncFront(stencilFront.func, stencilFront.ref, stencilFront.readMask);
        this.setStencilOperationFront(stencilFront.fail, stencilFront.zfail, stencilFront.zpass, stencilFront.writeMask);

        // back
        (_stencilBack = stencilBack) != null ? _stencilBack : stencilBack = StencilParameters.DEFAULT;
        this.setStencilFuncBack(stencilBack.func, stencilBack.ref, stencilBack.readMask);
        this.setStencilOperationBack(stencilBack.fail, stencilBack.zfail, stencilBack.zpass, stencilBack.writeMask);
      }
    } else {
      this.setStencilTest(false);
    }
  }
  setDepthState(depthState) {
    const currentDepthState = this.depthState;
    if (!currentDepthState.equals(depthState)) {
      const gl = this.gl;

      // write
      const write = depthState.write;
      if (currentDepthState.write !== write) {
        gl.depthMask(write);
      }

      // handle case where depth testing is off, but depth write is on => enable always test to depth write
      // Note on WebGL API behavior: When depth testing is disabled, writes to the depth buffer are also disabled.
      let {
        func,
        test
      } = depthState;
      if (!test && write) {
        test = true;
        func = FUNC_ALWAYS;
      }
      if (currentDepthState.func !== func) {
        gl.depthFunc(this.glComparison[func]);
      }
      if (currentDepthState.test !== test) {
        if (test) {
          gl.enable(gl.DEPTH_TEST);
        } else {
          gl.disable(gl.DEPTH_TEST);
        }
      }

      // update internal state
      currentDepthState.copy(depthState);
    }
  }
  setCullMode(cullMode) {
    if (this.cullMode !== cullMode) {
      if (cullMode === CULLFACE_NONE) {
        this.gl.disable(this.gl.CULL_FACE);
      } else {
        if (this.cullMode === CULLFACE_NONE) {
          this.gl.enable(this.gl.CULL_FACE);
        }
        const mode = this.glCull[cullMode];
        if (this.cullFace !== mode) {
          this.gl.cullFace(mode);
          this.cullFace = mode;
        }
      }
      this.cullMode = cullMode;
    }
  }

  /**
   * Sets the active shader to be used during subsequent draw calls.
   *
   * @param {Shader} shader - The shader to set to assign to the device.
   * @returns {boolean} True if the shader was successfully set, false otherwise.
   */
  setShader(shader) {
    if (shader !== this.shader) {
      if (shader.failed) {
        return false;
      } else if (!shader.ready && !shader.impl.finalize(this, shader)) {
        shader.failed = true;
        return false;
      }
      this.shader = shader;

      // Set the active shader
      this.gl.useProgram(shader.impl.glProgram);
      this._shaderSwitchesPerFrame++;
      this.attributesInvalidated = true;
    }
    return true;
  }

  /**
   * Get a supported HDR pixel format given a set of hardware support requirements.
   *
   * @param {boolean} preferLargest - If true, prefer the highest precision format. Otherwise prefer the lowest precision format.
   * @param {boolean} renderable - If true, only include pixel formats that can be used as render targets.
   * @param {boolean} updatable - If true, only include formats that can be updated by the CPU.
   * @param {boolean} filterable - If true, only include formats that support texture filtering.
   *
   * @returns {number} The HDR pixel format or null if there are none.
   * @ignore
   */
  getHdrFormat(preferLargest, renderable, updatable, filterable) {
    // Note that for WebGL2, PIXELFORMAT_RGB16F and PIXELFORMAT_RGB32F are not renderable according to this:
    // https://developer.mozilla.org/en-US/docs/Web/API/EXT_color_buffer_float
    // For WebGL1, only PIXELFORMAT_RGBA16F and PIXELFORMAT_RGBA32F are tested for being renderable.
    const f16Valid = this.extTextureHalfFloat && (!renderable || this.textureHalfFloatRenderable) && (!updatable || this.textureHalfFloatUpdatable) && (!filterable || this.extTextureHalfFloatLinear);
    const f32Valid = this.extTextureFloat && (!renderable || this.textureFloatRenderable) && (!filterable || this.extTextureFloatLinear);
    if (f16Valid && f32Valid) {
      return preferLargest ? PIXELFORMAT_RGBA32F : PIXELFORMAT_RGBA16F;
    } else if (f16Valid) {
      return PIXELFORMAT_RGBA16F;
    } else if (f32Valid) {
      return PIXELFORMAT_RGBA32F;
    } /* else */
    return null;
  }

  /**
   * Frees memory from all vertex array objects ever allocated with this device.
   *
   * @ignore
   */
  clearVertexArrayObjectCache() {
    const gl = this.gl;
    this._vaoMap.forEach((item, key, mapObj) => {
      gl.deleteVertexArray(item);
    });
    this._vaoMap.clear();
  }
  resizeCanvas(width, height) {
    // store the client sizes in CSS pixels, without pixel ratio applied
    this._width = width;
    this._height = height;
    const ratio = Math.min(this._maxPixelRatio, platform.browser ? window.devicePixelRatio : 1);
    width = Math.floor(width * ratio);
    height = Math.floor(height * ratio);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.fire(GraphicsDevice.EVENT_RESIZE, width, height);
    }
  }

  /**
   * Width of the back buffer in pixels.
   *
   * @type {number}
   */
  get width() {
    return this.gl.drawingBufferWidth || this.canvas.width;
  }

  /**
   * Height of the back buffer in pixels.
   *
   * @type {number}
   */
  get height() {
    return this.gl.drawingBufferHeight || this.canvas.height;
  }

  /**
   * Fullscreen mode.
   *
   * @type {boolean}
   */
  set fullscreen(fullscreen) {
    if (fullscreen) {
      const canvas = this.gl.canvas;
      canvas.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }
  get fullscreen() {
    return !!document.fullscreenElement;
  }

  /**
   * Check if high precision floating-point textures are supported.
   *
   * @type {boolean}
   */
  get textureFloatHighPrecision() {
    if (this._textureFloatHighPrecision === undefined) {
      this._textureFloatHighPrecision = testTextureFloatHighPrecision(this);
    }
    return this._textureFloatHighPrecision;
  }

  /**
   * Check if texture with half float format can be updated with data.
   *
   * @type {boolean}
   */
  get textureHalfFloatUpdatable() {
    if (this._textureHalfFloatUpdatable === undefined) {
      if (this.webgl2) {
        this._textureHalfFloatUpdatable = true;
      } else {
        this._textureHalfFloatUpdatable = testTextureHalfFloatUpdatable(this.gl, this.extTextureHalfFloat.HALF_FLOAT_OES);
      }
    }
    return this._textureHalfFloatUpdatable;
  }

  // debug helper to force lost context
  debugLoseContext(sleep = 100) {
    const context = this.gl.getExtension('WEBGL_lose_context');
    context.loseContext();
    setTimeout(() => context.restoreContext(), sleep);
  }
}

export { WebglGraphicsDevice };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2ViZ2wtZ3JhcGhpY3MtZGV2aWNlLmpzIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi9zcmMvcGxhdGZvcm0vZ3JhcGhpY3Mvd2ViZ2wvd2ViZ2wtZ3JhcGhpY3MtZGV2aWNlLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IHNldHVwVmVydGV4QXJyYXlPYmplY3QgfSBmcm9tICcuLi8uLi8uLi9wb2x5ZmlsbC9PRVNWZXJ0ZXhBcnJheU9iamVjdC5qcyc7XG5pbXBvcnQgeyBtYXRoIH0gZnJvbSAnLi4vLi4vLi4vY29yZS9tYXRoL21hdGguanMnO1xuaW1wb3J0IHsgRGVidWcgfSBmcm9tICcuLi8uLi8uLi9jb3JlL2RlYnVnLmpzJztcbmltcG9ydCB7IHBsYXRmb3JtIH0gZnJvbSAnLi4vLi4vLi4vY29yZS9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBDb2xvciB9IGZyb20gJy4uLy4uLy4uL2NvcmUvbWF0aC9jb2xvci5qcyc7XG5cbmltcG9ydCB7XG4gICAgQUREUkVTU19DTEFNUF9UT19FREdFLFxuICAgIENMRUFSRkxBR19DT0xPUiwgQ0xFQVJGTEFHX0RFUFRILCBDTEVBUkZMQUdfU1RFTkNJTCxcbiAgICBDVUxMRkFDRV9OT05FLFxuICAgIEZJTFRFUl9ORUFSRVNULCBGSUxURVJfTElORUFSLCBGSUxURVJfTkVBUkVTVF9NSVBNQVBfTkVBUkVTVCwgRklMVEVSX05FQVJFU1RfTUlQTUFQX0xJTkVBUixcbiAgICBGSUxURVJfTElORUFSX01JUE1BUF9ORUFSRVNULCBGSUxURVJfTElORUFSX01JUE1BUF9MSU5FQVIsXG4gICAgRlVOQ19BTFdBWVMsXG4gICAgUElYRUxGT1JNQVRfUkdCOCwgUElYRUxGT1JNQVRfUkdCQTgsIFBJWEVMRk9STUFUX1JHQkExNkYsIFBJWEVMRk9STUFUX1JHQkEzMkYsXG4gICAgU1RFTkNJTE9QX0tFRVAsXG4gICAgVU5JRk9STVRZUEVfQk9PTCwgVU5JRk9STVRZUEVfSU5ULCBVTklGT1JNVFlQRV9GTE9BVCwgVU5JRk9STVRZUEVfVkVDMiwgVU5JRk9STVRZUEVfVkVDMyxcbiAgICBVTklGT1JNVFlQRV9WRUM0LCBVTklGT1JNVFlQRV9JVkVDMiwgVU5JRk9STVRZUEVfSVZFQzMsIFVOSUZPUk1UWVBFX0lWRUM0LCBVTklGT1JNVFlQRV9CVkVDMixcbiAgICBVTklGT1JNVFlQRV9CVkVDMywgVU5JRk9STVRZUEVfQlZFQzQsIFVOSUZPUk1UWVBFX01BVDIsIFVOSUZPUk1UWVBFX01BVDMsIFVOSUZPUk1UWVBFX01BVDQsXG4gICAgVU5JRk9STVRZUEVfVEVYVFVSRTJELCBVTklGT1JNVFlQRV9URVhUVVJFQ1VCRSwgVU5JRk9STVRZUEVfRkxPQVRBUlJBWSwgVU5JRk9STVRZUEVfVEVYVFVSRTJEX1NIQURPVyxcbiAgICBVTklGT1JNVFlQRV9URVhUVVJFQ1VCRV9TSEFET1csIFVOSUZPUk1UWVBFX1RFWFRVUkUzRCwgVU5JRk9STVRZUEVfVkVDMkFSUkFZLCBVTklGT1JNVFlQRV9WRUMzQVJSQVksIFVOSUZPUk1UWVBFX1ZFQzRBUlJBWSxcbiAgICBzZW1hbnRpY1RvTG9jYXRpb24sXG4gICAgUFJJTUlUSVZFX1RSSVNUUklQLFxuICAgIERFVklDRVRZUEVfV0VCR0wyLFxuICAgIERFVklDRVRZUEVfV0VCR0wxXG59IGZyb20gJy4uL2NvbnN0YW50cy5qcyc7XG5cbmltcG9ydCB7IEdyYXBoaWNzRGV2aWNlIH0gZnJvbSAnLi4vZ3JhcGhpY3MtZGV2aWNlLmpzJztcbmltcG9ydCB7IFJlbmRlclRhcmdldCB9IGZyb20gJy4uL3JlbmRlci10YXJnZXQuanMnO1xuaW1wb3J0IHsgVGV4dHVyZSB9IGZyb20gJy4uL3RleHR1cmUuanMnO1xuaW1wb3J0IHsgRGVidWdHcmFwaGljcyB9IGZyb20gJy4uL2RlYnVnLWdyYXBoaWNzLmpzJztcblxuaW1wb3J0IHsgV2ViZ2xWZXJ0ZXhCdWZmZXIgfSBmcm9tICcuL3dlYmdsLXZlcnRleC1idWZmZXIuanMnO1xuaW1wb3J0IHsgV2ViZ2xJbmRleEJ1ZmZlciB9IGZyb20gJy4vd2ViZ2wtaW5kZXgtYnVmZmVyLmpzJztcbmltcG9ydCB7IFdlYmdsU2hhZGVyIH0gZnJvbSAnLi93ZWJnbC1zaGFkZXIuanMnO1xuaW1wb3J0IHsgV2ViZ2xUZXh0dXJlIH0gZnJvbSAnLi93ZWJnbC10ZXh0dXJlLmpzJztcbmltcG9ydCB7IFdlYmdsUmVuZGVyVGFyZ2V0IH0gZnJvbSAnLi93ZWJnbC1yZW5kZXItdGFyZ2V0LmpzJztcbmltcG9ydCB7IFNoYWRlclV0aWxzIH0gZnJvbSAnLi4vc2hhZGVyLXV0aWxzLmpzJztcbmltcG9ydCB7IFNoYWRlciB9IGZyb20gJy4uL3NoYWRlci5qcyc7XG5pbXBvcnQgeyBCbGVuZFN0YXRlIH0gZnJvbSAnLi4vYmxlbmQtc3RhdGUuanMnO1xuaW1wb3J0IHsgRGVwdGhTdGF0ZSB9IGZyb20gJy4uL2RlcHRoLXN0YXRlLmpzJztcbmltcG9ydCB7IFN0ZW5jaWxQYXJhbWV0ZXJzIH0gZnJvbSAnLi4vc3RlbmNpbC1wYXJhbWV0ZXJzLmpzJztcbmltcG9ydCB7IFdlYmdsR3B1UHJvZmlsZXIgfSBmcm9tICcuL3dlYmdsLWdwdS1wcm9maWxlci5qcyc7XG5cbmNvbnN0IGludmFsaWRhdGVBdHRhY2htZW50cyA9IFtdO1xuXG5jb25zdCBfZnVsbFNjcmVlblF1YWRWUyA9IC8qIGdsc2wgKi9gXG5hdHRyaWJ1dGUgdmVjMiB2ZXJ0ZXhfcG9zaXRpb247XG52YXJ5aW5nIHZlYzIgdlV2MDtcbnZvaWQgbWFpbih2b2lkKVxue1xuICAgIGdsX1Bvc2l0aW9uID0gdmVjNCh2ZXJ0ZXhfcG9zaXRpb24sIDAuNSwgMS4wKTtcbiAgICB2VXYwID0gdmVydGV4X3Bvc2l0aW9uLnh5KjAuNSswLjU7XG59XG5gO1xuXG5jb25zdCBfcHJlY2lzaW9uVGVzdDFQUyA9IC8qIGdsc2wgKi9gXG52b2lkIG1haW4odm9pZCkgeyBcbiAgICBnbF9GcmFnQ29sb3IgPSB2ZWM0KDIxNDc0ODM2NDguMCk7XG59XG5gO1xuXG5jb25zdCBfcHJlY2lzaW9uVGVzdDJQUyA9IC8qIGdsc2wgKi9gXG51bmlmb3JtIHNhbXBsZXIyRCBzb3VyY2U7XG52ZWM0IHBhY2tGbG9hdChmbG9hdCBkZXB0aCkge1xuICAgIGNvbnN0IHZlYzQgYml0X3NoaWZ0ID0gdmVjNCgyNTYuMCAqIDI1Ni4wICogMjU2LjAsIDI1Ni4wICogMjU2LjAsIDI1Ni4wLCAxLjApO1xuICAgIGNvbnN0IHZlYzQgYml0X21hc2sgID0gdmVjNCgwLjAsIDEuMCAvIDI1Ni4wLCAxLjAgLyAyNTYuMCwgMS4wIC8gMjU2LjApO1xuICAgIHZlYzQgcmVzID0gbW9kKGRlcHRoICogYml0X3NoaWZ0ICogdmVjNCgyNTUpLCB2ZWM0KDI1NikgKSAvIHZlYzQoMjU1KTtcbiAgICByZXMgLT0gcmVzLnh4eXogKiBiaXRfbWFzaztcbiAgICByZXR1cm4gcmVzO1xufVxudm9pZCBtYWluKHZvaWQpIHtcbiAgICBmbG9hdCBjID0gdGV4dHVyZTJEKHNvdXJjZSwgdmVjMigwLjApKS5yO1xuICAgIGZsb2F0IGRpZmYgPSBhYnMoYyAtIDIxNDc0ODM2NDguMCkgLyAyMTQ3NDgzNjQ4LjA7XG4gICAgZ2xfRnJhZ0NvbG9yID0gcGFja0Zsb2F0KGRpZmYpO1xufVxuYDtcblxuY29uc3QgX291dHB1dFRleHR1cmUyRCA9IC8qIGdsc2wgKi9gXG52YXJ5aW5nIHZlYzIgdlV2MDtcbnVuaWZvcm0gc2FtcGxlcjJEIHNvdXJjZTtcbnZvaWQgbWFpbih2b2lkKSB7XG4gICAgZ2xfRnJhZ0NvbG9yID0gdGV4dHVyZTJEKHNvdXJjZSwgdlV2MCk7XG59XG5gO1xuXG5mdW5jdGlvbiBxdWFkV2l0aFNoYWRlcihkZXZpY2UsIHRhcmdldCwgc2hhZGVyKSB7XG5cbiAgICBEZWJ1Z0dyYXBoaWNzLnB1c2hHcHVNYXJrZXIoZGV2aWNlLCBcIlF1YWRXaXRoU2hhZGVyXCIpO1xuXG4gICAgY29uc3Qgb2xkUnQgPSBkZXZpY2UucmVuZGVyVGFyZ2V0O1xuICAgIGRldmljZS5zZXRSZW5kZXJUYXJnZXQodGFyZ2V0KTtcbiAgICBkZXZpY2UudXBkYXRlQmVnaW4oKTtcblxuICAgIGRldmljZS5zZXRDdWxsTW9kZShDVUxMRkFDRV9OT05FKTtcbiAgICBkZXZpY2Uuc2V0QmxlbmRTdGF0ZShCbGVuZFN0YXRlLk5PQkxFTkQpO1xuICAgIGRldmljZS5zZXREZXB0aFN0YXRlKERlcHRoU3RhdGUuTk9ERVBUSCk7XG4gICAgZGV2aWNlLnNldFN0ZW5jaWxTdGF0ZShudWxsLCBudWxsKTtcblxuICAgIGRldmljZS5zZXRWZXJ0ZXhCdWZmZXIoZGV2aWNlLnF1YWRWZXJ0ZXhCdWZmZXIsIDApO1xuICAgIGRldmljZS5zZXRTaGFkZXIoc2hhZGVyKTtcblxuICAgIGRldmljZS5kcmF3KHtcbiAgICAgICAgdHlwZTogUFJJTUlUSVZFX1RSSVNUUklQLFxuICAgICAgICBiYXNlOiAwLFxuICAgICAgICBjb3VudDogNCxcbiAgICAgICAgaW5kZXhlZDogZmFsc2VcbiAgICB9KTtcblxuICAgIGRldmljZS51cGRhdGVFbmQoKTtcblxuICAgIGRldmljZS5zZXRSZW5kZXJUYXJnZXQob2xkUnQpO1xuICAgIGRldmljZS51cGRhdGVCZWdpbigpO1xuXG4gICAgRGVidWdHcmFwaGljcy5wb3BHcHVNYXJrZXIoZGV2aWNlKTtcbn1cblxuZnVuY3Rpb24gdGVzdFJlbmRlcmFibGUoZ2wsIHBpeGVsRm9ybWF0KSB7XG4gICAgbGV0IHJlc3VsdCA9IHRydWU7XG5cbiAgICAvLyBDcmVhdGUgYSAyeDIgdGV4dHVyZVxuICAgIGNvbnN0IHRleHR1cmUgPSBnbC5jcmVhdGVUZXh0dXJlKCk7XG4gICAgZ2wuYmluZFRleHR1cmUoZ2wuVEVYVFVSRV8yRCwgdGV4dHVyZSk7XG4gICAgZ2wudGV4UGFyYW1ldGVyaShnbC5URVhUVVJFXzJELCBnbC5URVhUVVJFX01JTl9GSUxURVIsIGdsLk5FQVJFU1QpO1xuICAgIGdsLnRleFBhcmFtZXRlcmkoZ2wuVEVYVFVSRV8yRCwgZ2wuVEVYVFVSRV9NQUdfRklMVEVSLCBnbC5ORUFSRVNUKTtcbiAgICBnbC50ZXhQYXJhbWV0ZXJpKGdsLlRFWFRVUkVfMkQsIGdsLlRFWFRVUkVfV1JBUF9TLCBnbC5DTEFNUF9UT19FREdFKTtcbiAgICBnbC50ZXhQYXJhbWV0ZXJpKGdsLlRFWFRVUkVfMkQsIGdsLlRFWFRVUkVfV1JBUF9ULCBnbC5DTEFNUF9UT19FREdFKTtcbiAgICBnbC50ZXhJbWFnZTJEKGdsLlRFWFRVUkVfMkQsIDAsIGdsLlJHQkEsIDIsIDIsIDAsIGdsLlJHQkEsIHBpeGVsRm9ybWF0LCBudWxsKTtcblxuICAgIC8vIFRyeSB0byB1c2UgdGhpcyB0ZXh0dXJlIGFzIGEgcmVuZGVyIHRhcmdldFxuICAgIGNvbnN0IGZyYW1lYnVmZmVyID0gZ2wuY3JlYXRlRnJhbWVidWZmZXIoKTtcbiAgICBnbC5iaW5kRnJhbWVidWZmZXIoZ2wuRlJBTUVCVUZGRVIsIGZyYW1lYnVmZmVyKTtcbiAgICBnbC5mcmFtZWJ1ZmZlclRleHR1cmUyRChnbC5GUkFNRUJVRkZFUiwgZ2wuQ09MT1JfQVRUQUNITUVOVDAsIGdsLlRFWFRVUkVfMkQsIHRleHR1cmUsIDApO1xuXG4gICAgLy8gSXQgaXMgbGVnYWwgZm9yIGEgV2ViR0wgaW1wbGVtZW50YXRpb24gZXhwb3NpbmcgdGhlIE9FU190ZXh0dXJlX2Zsb2F0IGV4dGVuc2lvbiB0b1xuICAgIC8vIHN1cHBvcnQgZmxvYXRpbmctcG9pbnQgdGV4dHVyZXMgYnV0IG5vdCBhcyBhdHRhY2htZW50cyB0byBmcmFtZWJ1ZmZlciBvYmplY3RzLlxuICAgIGlmIChnbC5jaGVja0ZyYW1lYnVmZmVyU3RhdHVzKGdsLkZSQU1FQlVGRkVSKSAhPT0gZ2wuRlJBTUVCVUZGRVJfQ09NUExFVEUpIHtcbiAgICAgICAgcmVzdWx0ID0gZmFsc2U7XG4gICAgfVxuXG4gICAgLy8gQ2xlYW4gdXBcbiAgICBnbC5iaW5kVGV4dHVyZShnbC5URVhUVVJFXzJELCBudWxsKTtcbiAgICBnbC5kZWxldGVUZXh0dXJlKHRleHR1cmUpO1xuICAgIGdsLmJpbmRGcmFtZWJ1ZmZlcihnbC5GUkFNRUJVRkZFUiwgbnVsbCk7XG4gICAgZ2wuZGVsZXRlRnJhbWVidWZmZXIoZnJhbWVidWZmZXIpO1xuXG4gICAgcmV0dXJuIHJlc3VsdDtcbn1cblxuZnVuY3Rpb24gdGVzdFRleHR1cmVIYWxmRmxvYXRVcGRhdGFibGUoZ2wsIHBpeGVsRm9ybWF0KSB7XG4gICAgbGV0IHJlc3VsdCA9IHRydWU7XG5cbiAgICAvLyBDcmVhdGUgYSAyeDIgdGV4dHVyZVxuICAgIGNvbnN0IHRleHR1cmUgPSBnbC5jcmVhdGVUZXh0dXJlKCk7XG4gICAgZ2wuYmluZFRleHR1cmUoZ2wuVEVYVFVSRV8yRCwgdGV4dHVyZSk7XG4gICAgZ2wudGV4UGFyYW1ldGVyaShnbC5URVhUVVJFXzJELCBnbC5URVhUVVJFX01JTl9GSUxURVIsIGdsLk5FQVJFU1QpO1xuICAgIGdsLnRleFBhcmFtZXRlcmkoZ2wuVEVYVFVSRV8yRCwgZ2wuVEVYVFVSRV9NQUdfRklMVEVSLCBnbC5ORUFSRVNUKTtcbiAgICBnbC50ZXhQYXJhbWV0ZXJpKGdsLlRFWFRVUkVfMkQsIGdsLlRFWFRVUkVfV1JBUF9TLCBnbC5DTEFNUF9UT19FREdFKTtcbiAgICBnbC50ZXhQYXJhbWV0ZXJpKGdsLlRFWFRVUkVfMkQsIGdsLlRFWFRVUkVfV1JBUF9ULCBnbC5DTEFNUF9UT19FREdFKTtcblxuICAgIC8vIHVwbG9hZCBzb21lIGRhdGEgLSBvbiBpT1MgcHJpb3IgdG8gYWJvdXQgTm92ZW1iZXIgMjAxOSwgcGFzc2luZyBkYXRhIHRvIGhhbGYgdGV4dHVyZSB3b3VsZCBmYWlsIGhlcmVcbiAgICAvLyBzZWUgZGV0YWlscyBoZXJlOiBodHRwczovL2J1Z3Mud2Via2l0Lm9yZy9zaG93X2J1Zy5jZ2k/aWQ9MTY5OTk5XG4gICAgLy8gbm90ZSB0aGF0IGlmIG5vdCBzdXBwb3J0ZWQsIHRoaXMgcHJpbnRzIGFuIGVycm9yIHRvIGNvbnNvbGUsIHRoZSBlcnJvciBjYW4gYmUgc2FmZWx5IGlnbm9yZWQgYXMgaXQncyBoYW5kbGVkXG4gICAgY29uc3QgZGF0YSA9IG5ldyBVaW50MTZBcnJheSg0ICogMiAqIDIpO1xuICAgIGdsLnRleEltYWdlMkQoZ2wuVEVYVFVSRV8yRCwgMCwgZ2wuUkdCQSwgMiwgMiwgMCwgZ2wuUkdCQSwgcGl4ZWxGb3JtYXQsIGRhdGEpO1xuXG4gICAgaWYgKGdsLmdldEVycm9yKCkgIT09IGdsLk5PX0VSUk9SKSB7XG4gICAgICAgIHJlc3VsdCA9IGZhbHNlO1xuICAgICAgICBjb25zb2xlLmxvZyhcIkFib3ZlIGVycm9yIHJlbGF0ZWQgdG8gSEFMRl9GTE9BVF9PRVMgY2FuIGJlIGlnbm9yZWQsIGl0IHdhcyB0cmlnZ2VyZWQgYnkgdGVzdGluZyBoYWxmIGZsb2F0IHRleHR1cmUgc3VwcG9ydFwiKTtcbiAgICB9XG5cbiAgICAvLyBDbGVhbiB1cFxuICAgIGdsLmJpbmRUZXh0dXJlKGdsLlRFWFRVUkVfMkQsIG51bGwpO1xuICAgIGdsLmRlbGV0ZVRleHR1cmUodGV4dHVyZSk7XG5cbiAgICByZXR1cm4gcmVzdWx0O1xufVxuXG5mdW5jdGlvbiB0ZXN0VGV4dHVyZUZsb2F0SGlnaFByZWNpc2lvbihkZXZpY2UpIHtcbiAgICBpZiAoIWRldmljZS50ZXh0dXJlRmxvYXRSZW5kZXJhYmxlKVxuICAgICAgICByZXR1cm4gZmFsc2U7XG5cbiAgICBjb25zdCBzaGFkZXIxID0gbmV3IFNoYWRlcihkZXZpY2UsIFNoYWRlclV0aWxzLmNyZWF0ZURlZmluaXRpb24oZGV2aWNlLCB7XG4gICAgICAgIG5hbWU6ICdwdGVzdDEnLFxuICAgICAgICB2ZXJ0ZXhDb2RlOiBfZnVsbFNjcmVlblF1YWRWUyxcbiAgICAgICAgZnJhZ21lbnRDb2RlOiBfcHJlY2lzaW9uVGVzdDFQU1xuICAgIH0pKTtcblxuICAgIGNvbnN0IHNoYWRlcjIgPSBuZXcgU2hhZGVyKGRldmljZSwgU2hhZGVyVXRpbHMuY3JlYXRlRGVmaW5pdGlvbihkZXZpY2UsIHtcbiAgICAgICAgbmFtZTogJ3B0ZXN0MicsXG4gICAgICAgIHZlcnRleENvZGU6IF9mdWxsU2NyZWVuUXVhZFZTLFxuICAgICAgICBmcmFnbWVudENvZGU6IF9wcmVjaXNpb25UZXN0MlBTXG4gICAgfSkpO1xuXG4gICAgY29uc3QgdGV4dHVyZU9wdGlvbnMgPSB7XG4gICAgICAgIGZvcm1hdDogUElYRUxGT1JNQVRfUkdCQTMyRixcbiAgICAgICAgd2lkdGg6IDEsXG4gICAgICAgIGhlaWdodDogMSxcbiAgICAgICAgbWlwbWFwczogZmFsc2UsXG4gICAgICAgIG1pbkZpbHRlcjogRklMVEVSX05FQVJFU1QsXG4gICAgICAgIG1hZ0ZpbHRlcjogRklMVEVSX05FQVJFU1QsXG4gICAgICAgIG5hbWU6ICd0ZXN0RkhQJ1xuICAgIH07XG4gICAgY29uc3QgdGV4MSA9IG5ldyBUZXh0dXJlKGRldmljZSwgdGV4dHVyZU9wdGlvbnMpO1xuICAgIGNvbnN0IHRhcmcxID0gbmV3IFJlbmRlclRhcmdldCh7XG4gICAgICAgIGNvbG9yQnVmZmVyOiB0ZXgxLFxuICAgICAgICBkZXB0aDogZmFsc2VcbiAgICB9KTtcbiAgICBxdWFkV2l0aFNoYWRlcihkZXZpY2UsIHRhcmcxLCBzaGFkZXIxKTtcblxuICAgIHRleHR1cmVPcHRpb25zLmZvcm1hdCA9IFBJWEVMRk9STUFUX1JHQkE4O1xuICAgIGNvbnN0IHRleDIgPSBuZXcgVGV4dHVyZShkZXZpY2UsIHRleHR1cmVPcHRpb25zKTtcbiAgICBjb25zdCB0YXJnMiA9IG5ldyBSZW5kZXJUYXJnZXQoe1xuICAgICAgICBjb2xvckJ1ZmZlcjogdGV4MixcbiAgICAgICAgZGVwdGg6IGZhbHNlXG4gICAgfSk7XG4gICAgZGV2aWNlLmNvbnN0YW50VGV4U291cmNlLnNldFZhbHVlKHRleDEpO1xuICAgIHF1YWRXaXRoU2hhZGVyKGRldmljZSwgdGFyZzIsIHNoYWRlcjIpO1xuXG4gICAgY29uc3QgcHJldkZyYW1lYnVmZmVyID0gZGV2aWNlLmFjdGl2ZUZyYW1lYnVmZmVyO1xuICAgIGRldmljZS5zZXRGcmFtZWJ1ZmZlcih0YXJnMi5pbXBsLl9nbEZyYW1lQnVmZmVyKTtcblxuICAgIGNvbnN0IHBpeGVscyA9IG5ldyBVaW50OEFycmF5KDQpO1xuICAgIGRldmljZS5yZWFkUGl4ZWxzKDAsIDAsIDEsIDEsIHBpeGVscyk7XG5cbiAgICBkZXZpY2Uuc2V0RnJhbWVidWZmZXIocHJldkZyYW1lYnVmZmVyKTtcblxuICAgIGNvbnN0IHggPSBwaXhlbHNbMF0gLyAyNTU7XG4gICAgY29uc3QgeSA9IHBpeGVsc1sxXSAvIDI1NTtcbiAgICBjb25zdCB6ID0gcGl4ZWxzWzJdIC8gMjU1O1xuICAgIGNvbnN0IHcgPSBwaXhlbHNbM10gLyAyNTU7XG4gICAgY29uc3QgZiA9IHggLyAoMjU2ICogMjU2ICogMjU2KSArIHkgLyAoMjU2ICogMjU2KSArIHogLyAyNTYgKyB3O1xuXG4gICAgdGV4MS5kZXN0cm95KCk7XG4gICAgdGFyZzEuZGVzdHJveSgpO1xuICAgIHRleDIuZGVzdHJveSgpO1xuICAgIHRhcmcyLmRlc3Ryb3koKTtcbiAgICBzaGFkZXIxLmRlc3Ryb3koKTtcbiAgICBzaGFkZXIyLmRlc3Ryb3koKTtcblxuICAgIHJldHVybiBmID09PSAwO1xufVxuXG4vKipcbiAqIFRoZSBncmFwaGljcyBkZXZpY2UgbWFuYWdlcyB0aGUgdW5kZXJseWluZyBncmFwaGljcyBjb250ZXh0LiBJdCBpcyByZXNwb25zaWJsZSBmb3Igc3VibWl0dGluZ1xuICogcmVuZGVyIHN0YXRlIGNoYW5nZXMgYW5kIGdyYXBoaWNzIHByaW1pdGl2ZXMgdG8gdGhlIGhhcmR3YXJlLiBBIGdyYXBoaWNzIGRldmljZSBpcyB0aWVkIHRvIGFcbiAqIHNwZWNpZmljIGNhbnZhcyBIVE1MIGVsZW1lbnQuIEl0IGlzIHZhbGlkIHRvIGhhdmUgbW9yZSB0aGFuIG9uZSBjYW52YXMgZWxlbWVudCBwZXIgcGFnZSBhbmRcbiAqIGNyZWF0ZSBhIG5ldyBncmFwaGljcyBkZXZpY2UgYWdhaW5zdCBlYWNoLlxuICpcbiAqIEBhdWdtZW50cyBHcmFwaGljc0RldmljZVxuICogQGNhdGVnb3J5IEdyYXBoaWNzXG4gKi9cbmNsYXNzIFdlYmdsR3JhcGhpY3NEZXZpY2UgZXh0ZW5kcyBHcmFwaGljc0RldmljZSB7XG4gICAgLyoqXG4gICAgICogVGhlIFdlYkdMIGNvbnRleHQgbWFuYWdlZCBieSB0aGUgZ3JhcGhpY3MgZGV2aWNlLiBUaGUgdHlwZSBjb3VsZCBhbHNvIHRlY2huaWNhbGx5IGJlXG4gICAgICogYFdlYkdMUmVuZGVyaW5nQ29udGV4dGAgaWYgV2ViR0wgMi4wIGlzIG5vdCBhdmFpbGFibGUuIEJ1dCBpbiBvcmRlciBmb3IgSW50ZWxsaVNlbnNlIHRvIGJlXG4gICAgICogYWJsZSB0byBmdW5jdGlvbiBmb3IgYWxsIFdlYkdMIGNhbGxzIGluIHRoZSBjb2RlYmFzZSwgd2Ugc3BlY2lmeSBgV2ViR0wyUmVuZGVyaW5nQ29udGV4dGBcbiAgICAgKiBoZXJlIGluc3RlYWQuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7V2ViR0wyUmVuZGVyaW5nQ29udGV4dH1cbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgZ2w7XG5cbiAgICAvKipcbiAgICAgKiBUcnVlIGlmIHRoZSBXZWJHTCBjb250ZXh0IG9mIHRoaXMgZGV2aWNlIGlzIHVzaW5nIHRoZSBXZWJHTCAyLjAgQVBJLiBJZiBmYWxzZSwgV2ViR0wgMS4wIGlzXG4gICAgICogYmVpbmcgdXNlZC5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAqIEBpZ25vcmVcbiAgICAgKi9cbiAgICB3ZWJnbDI7XG5cbiAgICAvKipcbiAgICAgKiBXZWJHTEZyYW1lYnVmZmVyIG9iamVjdCB0aGF0IHJlcHJlc2VudHMgdGhlIGJhY2tidWZmZXIgb2YgdGhlIGRldmljZSBmb3IgYSByZW5kZXJpbmcgZnJhbWUuXG4gICAgICogV2hlbiBudWxsLCB0aGlzIGlzIGEgZnJhbWVidWZmZXIgY3JlYXRlZCB3aGVuIHRoZSBkZXZpY2Ugd2FzIGNyZWF0ZWQsIG90aGVyd2lzZSBpdCBpcyBhXG4gICAgICogZnJhbWVidWZmZXIgc3VwcGxpZWQgYnkgdGhlIFhSIHNlc3Npb24uXG4gICAgICpcbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgX2RlZmF1bHRGcmFtZWJ1ZmZlciA9IG51bGw7XG5cbiAgICAvKipcbiAgICAgKiBUcnVlIGlmIHRoZSBkZWZhdWx0IGZyYW1lYnVmZmVyIGhhcyBjaGFuZ2VkIHNpbmNlIHRoZSBsYXN0IGZyYW1lLlxuICAgICAqXG4gICAgICogQGlnbm9yZVxuICAgICAqL1xuICAgIF9kZWZhdWx0RnJhbWVidWZmZXJDaGFuZ2VkID0gZmFsc2U7XG5cbiAgICAvKipcbiAgICAgKiBDcmVhdGVzIGEgbmV3IFdlYmdsR3JhcGhpY3NEZXZpY2UgaW5zdGFuY2UuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge0hUTUxDYW52YXNFbGVtZW50fSBjYW52YXMgLSBUaGUgY2FudmFzIHRvIHdoaWNoIHRoZSBncmFwaGljcyBkZXZpY2Ugd2lsbCByZW5kZXIuXG4gICAgICogQHBhcmFtIHtvYmplY3R9IFtvcHRpb25zXSAtIE9wdGlvbnMgcGFzc2VkIHdoZW4gY3JlYXRpbmcgdGhlIFdlYkdMIGNvbnRleHQuXG4gICAgICogQHBhcmFtIHtib29sZWFufSBbb3B0aW9ucy5hbHBoYV0gLSBCb29sZWFuIHRoYXQgaW5kaWNhdGVzIGlmIHRoZSBjYW52YXMgY29udGFpbnMgYW5cbiAgICAgKiBhbHBoYSBidWZmZXIuIERlZmF1bHRzIHRvIHRydWUuXG4gICAgICogQHBhcmFtIHtib29sZWFufSBbb3B0aW9ucy5kZXB0aF0gLSBCb29sZWFuIHRoYXQgaW5kaWNhdGVzIHRoYXQgdGhlIGRyYXdpbmcgYnVmZmVyIGlzXG4gICAgICogcmVxdWVzdGVkIHRvIGhhdmUgYSBkZXB0aCBidWZmZXIgb2YgYXQgbGVhc3QgMTYgYml0cy4gRGVmYXVsdHMgdG8gdHJ1ZS5cbiAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IFtvcHRpb25zLnN0ZW5jaWxdIC0gQm9vbGVhbiB0aGF0IGluZGljYXRlcyB0aGF0IHRoZSBkcmF3aW5nIGJ1ZmZlciBpc1xuICAgICAqIHJlcXVlc3RlZCB0byBoYXZlIGEgc3RlbmNpbCBidWZmZXIgb2YgYXQgbGVhc3QgOCBiaXRzLiBEZWZhdWx0cyB0byB0cnVlLlxuICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gW29wdGlvbnMuYW50aWFsaWFzXSAtIEJvb2xlYW4gdGhhdCBpbmRpY2F0ZXMgd2hldGhlciBvciBub3QgdG8gcGVyZm9ybVxuICAgICAqIGFudGktYWxpYXNpbmcgaWYgcG9zc2libGUuIERlZmF1bHRzIHRvIHRydWUuXG4gICAgICogQHBhcmFtIHtib29sZWFufSBbb3B0aW9ucy5wcmVtdWx0aXBsaWVkQWxwaGFdIC0gQm9vbGVhbiB0aGF0IGluZGljYXRlcyB0aGF0IHRoZSBwYWdlXG4gICAgICogY29tcG9zaXRvciB3aWxsIGFzc3VtZSB0aGUgZHJhd2luZyBidWZmZXIgY29udGFpbnMgY29sb3JzIHdpdGggcHJlLW11bHRpcGxpZWQgYWxwaGEuXG4gICAgICogRGVmYXVsdHMgdG8gdHJ1ZS5cbiAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IFtvcHRpb25zLnByZXNlcnZlRHJhd2luZ0J1ZmZlcl0gLSBJZiB0aGUgdmFsdWUgaXMgdHJ1ZSB0aGUgYnVmZmVycyB3aWxsIG5vdFxuICAgICAqIGJlIGNsZWFyZWQgYW5kIHdpbGwgcHJlc2VydmUgdGhlaXIgdmFsdWVzIHVudGlsIGNsZWFyZWQgb3Igb3ZlcndyaXR0ZW4gYnkgdGhlIGF1dGhvci5cbiAgICAgKiBEZWZhdWx0cyB0byBmYWxzZS5cbiAgICAgKiBAcGFyYW0geydkZWZhdWx0J3wnaGlnaC1wZXJmb3JtYW5jZSd8J2xvdy1wb3dlcid9IFtvcHRpb25zLnBvd2VyUHJlZmVyZW5jZV0gLSBBIGhpbnQgdG8gdGhlXG4gICAgICogdXNlciBhZ2VudCBpbmRpY2F0aW5nIHdoYXQgY29uZmlndXJhdGlvbiBvZiBHUFUgaXMgc3VpdGFibGUgZm9yIHRoZSBXZWJHTCBjb250ZXh0LiBQb3NzaWJsZVxuICAgICAqIHZhbHVlcyBhcmU6XG4gICAgICpcbiAgICAgKiAtICdkZWZhdWx0JzogTGV0IHRoZSB1c2VyIGFnZW50IGRlY2lkZSB3aGljaCBHUFUgY29uZmlndXJhdGlvbiBpcyBtb3N0IHN1aXRhYmxlLiBUaGlzIGlzIHRoZVxuICAgICAqIGRlZmF1bHQgdmFsdWUuXG4gICAgICogLSAnaGlnaC1wZXJmb3JtYW5jZSc6IFByaW9yaXRpemVzIHJlbmRlcmluZyBwZXJmb3JtYW5jZSBvdmVyIHBvd2VyIGNvbnN1bXB0aW9uLlxuICAgICAqIC0gJ2xvdy1wb3dlcic6IFByaW9yaXRpemVzIHBvd2VyIHNhdmluZyBvdmVyIHJlbmRlcmluZyBwZXJmb3JtYW5jZS5cbiAgICAgKlxuICAgICAqIERlZmF1bHRzIHRvICdkZWZhdWx0Jy5cbiAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IFtvcHRpb25zLmZhaWxJZk1ham9yUGVyZm9ybWFuY2VDYXZlYXRdIC0gQm9vbGVhbiB0aGF0IGluZGljYXRlcyBpZiBhXG4gICAgICogY29udGV4dCB3aWxsIGJlIGNyZWF0ZWQgaWYgdGhlIHN5c3RlbSBwZXJmb3JtYW5jZSBpcyBsb3cgb3IgaWYgbm8gaGFyZHdhcmUgR1BVIGlzIGF2YWlsYWJsZS5cbiAgICAgKiBEZWZhdWx0cyB0byBmYWxzZS5cbiAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IFtvcHRpb25zLnByZWZlcldlYkdsMl0gLSBCb29sZWFuIHRoYXQgaW5kaWNhdGVzIGlmIGEgV2ViR2wyIGNvbnRleHQgc2hvdWxkXG4gICAgICogYmUgcHJlZmVycmVkLiBEZWZhdWx0cyB0byB0cnVlLlxuICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gW29wdGlvbnMuZGVzeW5jaHJvbml6ZWRdIC0gQm9vbGVhbiB0aGF0IGhpbnRzIHRoZSB1c2VyIGFnZW50IHRvIHJlZHVjZSB0aGVcbiAgICAgKiBsYXRlbmN5IGJ5IGRlc3luY2hyb25pemluZyB0aGUgY2FudmFzIHBhaW50IGN5Y2xlIGZyb20gdGhlIGV2ZW50IGxvb3AuIERlZmF1bHRzIHRvIGZhbHNlLlxuICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gW29wdGlvbnMueHJDb21wYXRpYmxlXSAtIEJvb2xlYW4gdGhhdCBoaW50cyB0byB0aGUgdXNlciBhZ2VudCB0byB1c2UgYVxuICAgICAqIGNvbXBhdGlibGUgZ3JhcGhpY3MgYWRhcHRlciBmb3IgYW4gaW1tZXJzaXZlIFhSIGRldmljZS5cbiAgICAgKiBAcGFyYW0ge1dlYkdMUmVuZGVyaW5nQ29udGV4dCB8IFdlYkdMMlJlbmRlcmluZ0NvbnRleHR9IFtvcHRpb25zLmdsXSAtIFRoZSByZW5kZXJpbmcgY29udGV4dFxuICAgICAqIHRvIHVzZS4gSWYgbm90IHNwZWNpZmllZCwgYSBuZXcgY29udGV4dCB3aWxsIGJlIGNyZWF0ZWQuXG4gICAgICovXG4gICAgY29uc3RydWN0b3IoY2FudmFzLCBvcHRpb25zID0ge30pIHtcbiAgICAgICAgc3VwZXIoY2FudmFzLCBvcHRpb25zKTtcbiAgICAgICAgb3B0aW9ucyA9IHRoaXMuaW5pdE9wdGlvbnM7XG5cbiAgICAgICAgdGhpcy51cGRhdGVDbGllbnRSZWN0KCk7XG5cbiAgICAgICAgLy8gQWRkIGhhbmRsZXJzIGZvciB3aGVuIHRoZSBXZWJHTCBjb250ZXh0IGlzIGxvc3Qgb3IgcmVzdG9yZWRcbiAgICAgICAgdGhpcy5jb250ZXh0TG9zdCA9IGZhbHNlO1xuXG4gICAgICAgIHRoaXMuX2NvbnRleHRMb3N0SGFuZGxlciA9IChldmVudCkgPT4ge1xuICAgICAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgIHRoaXMuY29udGV4dExvc3QgPSB0cnVlO1xuICAgICAgICAgICAgdGhpcy5sb3NlQ29udGV4dCgpO1xuICAgICAgICAgICAgRGVidWcubG9nKCdwYy5HcmFwaGljc0RldmljZTogV2ViR0wgY29udGV4dCBsb3N0LicpO1xuICAgICAgICAgICAgdGhpcy5maXJlKCdkZXZpY2Vsb3N0Jyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgdGhpcy5fY29udGV4dFJlc3RvcmVkSGFuZGxlciA9ICgpID0+IHtcbiAgICAgICAgICAgIERlYnVnLmxvZygncGMuR3JhcGhpY3NEZXZpY2U6IFdlYkdMIGNvbnRleHQgcmVzdG9yZWQuJyk7XG4gICAgICAgICAgICB0aGlzLmNvbnRleHRMb3N0ID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLnJlc3RvcmVDb250ZXh0KCk7XG4gICAgICAgICAgICB0aGlzLmZpcmUoJ2RldmljZXJlc3RvcmVkJyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgLy8gIzQxMzYgLSB0dXJuIG9mZiBhbnRpYWxpYXNpbmcgb24gQXBwbGVXZWJLaXQgYnJvd3NlcnMgMTUuNFxuICAgICAgICBjb25zdCB1YSA9ICh0eXBlb2YgbmF2aWdhdG9yICE9PSAndW5kZWZpbmVkJykgJiYgbmF2aWdhdG9yLnVzZXJBZ2VudDtcbiAgICAgICAgdGhpcy5mb3JjZURpc2FibGVNdWx0aXNhbXBsaW5nID0gdWEgJiYgdWEuaW5jbHVkZXMoJ0FwcGxlV2ViS2l0JykgJiYgKHVhLmluY2x1ZGVzKCcxNS40JykgfHwgdWEuaW5jbHVkZXMoJzE1XzQnKSk7XG4gICAgICAgIGlmICh0aGlzLmZvcmNlRGlzYWJsZU11bHRpc2FtcGxpbmcpIHtcbiAgICAgICAgICAgIG9wdGlvbnMuYW50aWFsaWFzID0gZmFsc2U7XG4gICAgICAgICAgICBEZWJ1Zy5sb2coXCJBbnRpYWxpYXNpbmcgaGFzIGJlZW4gdHVybmVkIG9mZiBkdWUgdG8gcmVuZGVyaW5nIGlzc3VlcyBvbiBBcHBsZVdlYktpdCAxNS40XCIpO1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IGdsID0gbnVsbDtcblxuICAgICAgICAvLyB3ZSBhbHdheXMgYWxsb2NhdGUgdGhlIGRlZmF1bHQgZnJhbWVidWZmZXIgd2l0aG91dCBhbnRpYWxpYXNpbmcsIHNvIHJlbW92ZSB0aGF0IG9wdGlvblxuICAgICAgICBjb25zdCBhbnRpYWxpYXMgPSBvcHRpb25zLmFudGlhbGlhcztcbiAgICAgICAgb3B0aW9ucy5hbnRpYWxpYXMgPSBmYWxzZTtcblxuICAgICAgICAvLyBSZXRyaWV2ZSB0aGUgV2ViR0wgY29udGV4dFxuICAgICAgICBpZiAob3B0aW9ucy5nbCkge1xuICAgICAgICAgICAgZ2wgPSBvcHRpb25zLmdsO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc3QgcHJlZmVyV2ViR2wyID0gKG9wdGlvbnMucHJlZmVyV2ViR2wyICE9PSB1bmRlZmluZWQpID8gb3B0aW9ucy5wcmVmZXJXZWJHbDIgOiB0cnVlO1xuICAgICAgICAgICAgY29uc3QgbmFtZXMgPSBwcmVmZXJXZWJHbDIgPyBbXCJ3ZWJnbDJcIiwgXCJ3ZWJnbFwiLCBcImV4cGVyaW1lbnRhbC13ZWJnbFwiXSA6IFtcIndlYmdsXCIsIFwiZXhwZXJpbWVudGFsLXdlYmdsXCJdO1xuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBuYW1lcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIGdsID0gY2FudmFzLmdldENvbnRleHQobmFtZXNbaV0sIG9wdGlvbnMpO1xuICAgICAgICAgICAgICAgIGlmIChnbCkge1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIWdsKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJXZWJHTCBub3Qgc3VwcG9ydGVkXCIpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5nbCA9IGdsO1xuICAgICAgICB0aGlzLndlYmdsMiA9IHR5cGVvZiBXZWJHTDJSZW5kZXJpbmdDb250ZXh0ICE9PSAndW5kZWZpbmVkJyAmJiBnbCBpbnN0YW5jZW9mIFdlYkdMMlJlbmRlcmluZ0NvbnRleHQ7XG4gICAgICAgIHRoaXMuX2RldmljZVR5cGUgPSB0aGlzLndlYmdsMiA/IERFVklDRVRZUEVfV0VCR0wyIDogREVWSUNFVFlQRV9XRUJHTDE7XG5cbiAgICAgICAgLy8gcGl4ZWwgZm9ybWF0IG9mIHRoZSBmcmFtZWJ1ZmZlclxuICAgICAgICBjb25zdCBhbHBoYUJpdHMgPSBnbC5nZXRQYXJhbWV0ZXIoZ2wuQUxQSEFfQklUUyk7XG4gICAgICAgIHRoaXMuYmFja0J1ZmZlckZvcm1hdCA9IGFscGhhQml0cyA/IFBJWEVMRk9STUFUX1JHQkE4IDogUElYRUxGT1JNQVRfUkdCODtcblxuICAgICAgICBjb25zdCBpc0Nocm9tZSA9IHBsYXRmb3JtLmJyb3dzZXJOYW1lID09PSAnY2hyb21lJztcbiAgICAgICAgY29uc3QgaXNTYWZhcmkgPSBwbGF0Zm9ybS5icm93c2VyTmFtZSA9PT0gJ3NhZmFyaSc7XG4gICAgICAgIGNvbnN0IGlzTWFjID0gcGxhdGZvcm0uYnJvd3NlciAmJiBuYXZpZ2F0b3IuYXBwVmVyc2lvbi5pbmRleE9mKFwiTWFjXCIpICE9PSAtMTtcblxuICAgICAgICAvLyBlbmFibGUgdGVtcG9yYXJ5IHRleHR1cmUgdW5pdCB3b3JrYXJvdW5kIG9uIGRlc2t0b3Agc2FmYXJpXG4gICAgICAgIHRoaXMuX3RlbXBFbmFibGVTYWZhcmlUZXh0dXJlVW5pdFdvcmthcm91bmQgPSBpc1NhZmFyaTtcblxuICAgICAgICAvLyBlbmFibGUgdGVtcG9yYXJ5IHdvcmthcm91bmQgZm9yIGdsQmxpdEZyYW1lYnVmZmVyIGZhaWxpbmcgb24gTWFjIENocm9tZSAoIzI1MDQpXG4gICAgICAgIHRoaXMuX3RlbXBNYWNDaHJvbWVCbGl0RnJhbWVidWZmZXJXb3JrYXJvdW5kID0gaXNNYWMgJiYgaXNDaHJvbWUgJiYgIW9wdGlvbnMuYWxwaGE7XG5cbiAgICAgICAgLy8gaW5pdCBwb2x5ZmlsbCBmb3IgVkFPcyB1bmRlciB3ZWJnbDFcbiAgICAgICAgaWYgKCF0aGlzLndlYmdsMikge1xuICAgICAgICAgICAgc2V0dXBWZXJ0ZXhBcnJheU9iamVjdChnbCk7XG4gICAgICAgIH1cblxuICAgICAgICBjYW52YXMuYWRkRXZlbnRMaXN0ZW5lcihcIndlYmdsY29udGV4dGxvc3RcIiwgdGhpcy5fY29udGV4dExvc3RIYW5kbGVyLCBmYWxzZSk7XG4gICAgICAgIGNhbnZhcy5hZGRFdmVudExpc3RlbmVyKFwid2ViZ2xjb250ZXh0cmVzdG9yZWRcIiwgdGhpcy5fY29udGV4dFJlc3RvcmVkSGFuZGxlciwgZmFsc2UpO1xuXG4gICAgICAgIHRoaXMuaW5pdGlhbGl6ZUV4dGVuc2lvbnMoKTtcbiAgICAgICAgdGhpcy5pbml0aWFsaXplQ2FwYWJpbGl0aWVzKCk7XG4gICAgICAgIHRoaXMuaW5pdGlhbGl6ZVJlbmRlclN0YXRlKCk7XG4gICAgICAgIHRoaXMuaW5pdGlhbGl6ZUNvbnRleHRDYWNoZXMoKTtcblxuICAgICAgICAvLyBoYW5kbGUgYW50aS1hbGlhc2luZyBpbnRlcm5hbGx5XG4gICAgICAgIHRoaXMuc2FtcGxlcyA9IGFudGlhbGlhcyA/IDQgOiAxO1xuICAgICAgICB0aGlzLmNyZWF0ZUJhY2tidWZmZXIobnVsbCk7XG5cbiAgICAgICAgLy8gb25seSBlbmFibGUgSW1hZ2VCaXRtYXAgb24gY2hyb21lXG4gICAgICAgIHRoaXMuc3VwcG9ydHNJbWFnZUJpdG1hcCA9ICFpc1NhZmFyaSAmJiB0eXBlb2YgSW1hZ2VCaXRtYXAgIT09ICd1bmRlZmluZWQnO1xuXG4gICAgICAgIHRoaXMuZ2xBZGRyZXNzID0gW1xuICAgICAgICAgICAgZ2wuUkVQRUFULFxuICAgICAgICAgICAgZ2wuQ0xBTVBfVE9fRURHRSxcbiAgICAgICAgICAgIGdsLk1JUlJPUkVEX1JFUEVBVFxuICAgICAgICBdO1xuXG4gICAgICAgIHRoaXMuZ2xCbGVuZEVxdWF0aW9uID0gW1xuICAgICAgICAgICAgZ2wuRlVOQ19BREQsXG4gICAgICAgICAgICBnbC5GVU5DX1NVQlRSQUNULFxuICAgICAgICAgICAgZ2wuRlVOQ19SRVZFUlNFX1NVQlRSQUNULFxuICAgICAgICAgICAgdGhpcy53ZWJnbDIgPyBnbC5NSU4gOiB0aGlzLmV4dEJsZW5kTWlubWF4ID8gdGhpcy5leHRCbGVuZE1pbm1heC5NSU5fRVhUIDogZ2wuRlVOQ19BREQsXG4gICAgICAgICAgICB0aGlzLndlYmdsMiA/IGdsLk1BWCA6IHRoaXMuZXh0QmxlbmRNaW5tYXggPyB0aGlzLmV4dEJsZW5kTWlubWF4Lk1BWF9FWFQgOiBnbC5GVU5DX0FERFxuICAgICAgICBdO1xuXG4gICAgICAgIHRoaXMuZ2xCbGVuZEZ1bmN0aW9uQ29sb3IgPSBbXG4gICAgICAgICAgICBnbC5aRVJPLFxuICAgICAgICAgICAgZ2wuT05FLFxuICAgICAgICAgICAgZ2wuU1JDX0NPTE9SLFxuICAgICAgICAgICAgZ2wuT05FX01JTlVTX1NSQ19DT0xPUixcbiAgICAgICAgICAgIGdsLkRTVF9DT0xPUixcbiAgICAgICAgICAgIGdsLk9ORV9NSU5VU19EU1RfQ09MT1IsXG4gICAgICAgICAgICBnbC5TUkNfQUxQSEEsXG4gICAgICAgICAgICBnbC5TUkNfQUxQSEFfU0FUVVJBVEUsXG4gICAgICAgICAgICBnbC5PTkVfTUlOVVNfU1JDX0FMUEhBLFxuICAgICAgICAgICAgZ2wuRFNUX0FMUEhBLFxuICAgICAgICAgICAgZ2wuT05FX01JTlVTX0RTVF9BTFBIQSxcbiAgICAgICAgICAgIGdsLkNPTlNUQU5UX0NPTE9SLFxuICAgICAgICAgICAgZ2wuT05FX01JTlVTX0NPTlNUQU5UX0NPTE9SXG4gICAgICAgIF07XG5cbiAgICAgICAgdGhpcy5nbEJsZW5kRnVuY3Rpb25BbHBoYSA9IFtcbiAgICAgICAgICAgIGdsLlpFUk8sXG4gICAgICAgICAgICBnbC5PTkUsXG4gICAgICAgICAgICBnbC5TUkNfQ09MT1IsXG4gICAgICAgICAgICBnbC5PTkVfTUlOVVNfU1JDX0NPTE9SLFxuICAgICAgICAgICAgZ2wuRFNUX0NPTE9SLFxuICAgICAgICAgICAgZ2wuT05FX01JTlVTX0RTVF9DT0xPUixcbiAgICAgICAgICAgIGdsLlNSQ19BTFBIQSxcbiAgICAgICAgICAgIGdsLlNSQ19BTFBIQV9TQVRVUkFURSxcbiAgICAgICAgICAgIGdsLk9ORV9NSU5VU19TUkNfQUxQSEEsXG4gICAgICAgICAgICBnbC5EU1RfQUxQSEEsXG4gICAgICAgICAgICBnbC5PTkVfTUlOVVNfRFNUX0FMUEhBLFxuICAgICAgICAgICAgZ2wuQ09OU1RBTlRfQUxQSEEsXG4gICAgICAgICAgICBnbC5PTkVfTUlOVVNfQ09OU1RBTlRfQUxQSEFcbiAgICAgICAgXTtcblxuICAgICAgICB0aGlzLmdsQ29tcGFyaXNvbiA9IFtcbiAgICAgICAgICAgIGdsLk5FVkVSLFxuICAgICAgICAgICAgZ2wuTEVTUyxcbiAgICAgICAgICAgIGdsLkVRVUFMLFxuICAgICAgICAgICAgZ2wuTEVRVUFMLFxuICAgICAgICAgICAgZ2wuR1JFQVRFUixcbiAgICAgICAgICAgIGdsLk5PVEVRVUFMLFxuICAgICAgICAgICAgZ2wuR0VRVUFMLFxuICAgICAgICAgICAgZ2wuQUxXQVlTXG4gICAgICAgIF07XG5cbiAgICAgICAgdGhpcy5nbFN0ZW5jaWxPcCA9IFtcbiAgICAgICAgICAgIGdsLktFRVAsXG4gICAgICAgICAgICBnbC5aRVJPLFxuICAgICAgICAgICAgZ2wuUkVQTEFDRSxcbiAgICAgICAgICAgIGdsLklOQ1IsXG4gICAgICAgICAgICBnbC5JTkNSX1dSQVAsXG4gICAgICAgICAgICBnbC5ERUNSLFxuICAgICAgICAgICAgZ2wuREVDUl9XUkFQLFxuICAgICAgICAgICAgZ2wuSU5WRVJUXG4gICAgICAgIF07XG5cbiAgICAgICAgdGhpcy5nbENsZWFyRmxhZyA9IFtcbiAgICAgICAgICAgIDAsXG4gICAgICAgICAgICBnbC5DT0xPUl9CVUZGRVJfQklULFxuICAgICAgICAgICAgZ2wuREVQVEhfQlVGRkVSX0JJVCxcbiAgICAgICAgICAgIGdsLkNPTE9SX0JVRkZFUl9CSVQgfCBnbC5ERVBUSF9CVUZGRVJfQklULFxuICAgICAgICAgICAgZ2wuU1RFTkNJTF9CVUZGRVJfQklULFxuICAgICAgICAgICAgZ2wuU1RFTkNJTF9CVUZGRVJfQklUIHwgZ2wuQ09MT1JfQlVGRkVSX0JJVCxcbiAgICAgICAgICAgIGdsLlNURU5DSUxfQlVGRkVSX0JJVCB8IGdsLkRFUFRIX0JVRkZFUl9CSVQsXG4gICAgICAgICAgICBnbC5TVEVOQ0lMX0JVRkZFUl9CSVQgfCBnbC5DT0xPUl9CVUZGRVJfQklUIHwgZ2wuREVQVEhfQlVGRkVSX0JJVFxuICAgICAgICBdO1xuXG4gICAgICAgIHRoaXMuZ2xDdWxsID0gW1xuICAgICAgICAgICAgMCxcbiAgICAgICAgICAgIGdsLkJBQ0ssXG4gICAgICAgICAgICBnbC5GUk9OVCxcbiAgICAgICAgICAgIGdsLkZST05UX0FORF9CQUNLXG4gICAgICAgIF07XG5cbiAgICAgICAgdGhpcy5nbEZpbHRlciA9IFtcbiAgICAgICAgICAgIGdsLk5FQVJFU1QsXG4gICAgICAgICAgICBnbC5MSU5FQVIsXG4gICAgICAgICAgICBnbC5ORUFSRVNUX01JUE1BUF9ORUFSRVNULFxuICAgICAgICAgICAgZ2wuTkVBUkVTVF9NSVBNQVBfTElORUFSLFxuICAgICAgICAgICAgZ2wuTElORUFSX01JUE1BUF9ORUFSRVNULFxuICAgICAgICAgICAgZ2wuTElORUFSX01JUE1BUF9MSU5FQVJcbiAgICAgICAgXTtcblxuICAgICAgICB0aGlzLmdsUHJpbWl0aXZlID0gW1xuICAgICAgICAgICAgZ2wuUE9JTlRTLFxuICAgICAgICAgICAgZ2wuTElORVMsXG4gICAgICAgICAgICBnbC5MSU5FX0xPT1AsXG4gICAgICAgICAgICBnbC5MSU5FX1NUUklQLFxuICAgICAgICAgICAgZ2wuVFJJQU5HTEVTLFxuICAgICAgICAgICAgZ2wuVFJJQU5HTEVfU1RSSVAsXG4gICAgICAgICAgICBnbC5UUklBTkdMRV9GQU5cbiAgICAgICAgXTtcblxuICAgICAgICB0aGlzLmdsVHlwZSA9IFtcbiAgICAgICAgICAgIGdsLkJZVEUsXG4gICAgICAgICAgICBnbC5VTlNJR05FRF9CWVRFLFxuICAgICAgICAgICAgZ2wuU0hPUlQsXG4gICAgICAgICAgICBnbC5VTlNJR05FRF9TSE9SVCxcbiAgICAgICAgICAgIGdsLklOVCxcbiAgICAgICAgICAgIGdsLlVOU0lHTkVEX0lOVCxcbiAgICAgICAgICAgIGdsLkZMT0FUXG4gICAgICAgIF07XG5cbiAgICAgICAgdGhpcy5wY1VuaWZvcm1UeXBlID0ge307XG4gICAgICAgIHRoaXMucGNVbmlmb3JtVHlwZVtnbC5CT09MXSAgICAgICAgID0gVU5JRk9STVRZUEVfQk9PTDtcbiAgICAgICAgdGhpcy5wY1VuaWZvcm1UeXBlW2dsLklOVF0gICAgICAgICAgPSBVTklGT1JNVFlQRV9JTlQ7XG4gICAgICAgIHRoaXMucGNVbmlmb3JtVHlwZVtnbC5GTE9BVF0gICAgICAgID0gVU5JRk9STVRZUEVfRkxPQVQ7XG4gICAgICAgIHRoaXMucGNVbmlmb3JtVHlwZVtnbC5GTE9BVF9WRUMyXSAgID0gVU5JRk9STVRZUEVfVkVDMjtcbiAgICAgICAgdGhpcy5wY1VuaWZvcm1UeXBlW2dsLkZMT0FUX1ZFQzNdICAgPSBVTklGT1JNVFlQRV9WRUMzO1xuICAgICAgICB0aGlzLnBjVW5pZm9ybVR5cGVbZ2wuRkxPQVRfVkVDNF0gICA9IFVOSUZPUk1UWVBFX1ZFQzQ7XG4gICAgICAgIHRoaXMucGNVbmlmb3JtVHlwZVtnbC5JTlRfVkVDMl0gICAgID0gVU5JRk9STVRZUEVfSVZFQzI7XG4gICAgICAgIHRoaXMucGNVbmlmb3JtVHlwZVtnbC5JTlRfVkVDM10gICAgID0gVU5JRk9STVRZUEVfSVZFQzM7XG4gICAgICAgIHRoaXMucGNVbmlmb3JtVHlwZVtnbC5JTlRfVkVDNF0gICAgID0gVU5JRk9STVRZUEVfSVZFQzQ7XG4gICAgICAgIHRoaXMucGNVbmlmb3JtVHlwZVtnbC5CT09MX1ZFQzJdICAgID0gVU5JRk9STVRZUEVfQlZFQzI7XG4gICAgICAgIHRoaXMucGNVbmlmb3JtVHlwZVtnbC5CT09MX1ZFQzNdICAgID0gVU5JRk9STVRZUEVfQlZFQzM7XG4gICAgICAgIHRoaXMucGNVbmlmb3JtVHlwZVtnbC5CT09MX1ZFQzRdICAgID0gVU5JRk9STVRZUEVfQlZFQzQ7XG4gICAgICAgIHRoaXMucGNVbmlmb3JtVHlwZVtnbC5GTE9BVF9NQVQyXSAgID0gVU5JRk9STVRZUEVfTUFUMjtcbiAgICAgICAgdGhpcy5wY1VuaWZvcm1UeXBlW2dsLkZMT0FUX01BVDNdICAgPSBVTklGT1JNVFlQRV9NQVQzO1xuICAgICAgICB0aGlzLnBjVW5pZm9ybVR5cGVbZ2wuRkxPQVRfTUFUNF0gICA9IFVOSUZPUk1UWVBFX01BVDQ7XG4gICAgICAgIHRoaXMucGNVbmlmb3JtVHlwZVtnbC5TQU1QTEVSXzJEXSAgID0gVU5JRk9STVRZUEVfVEVYVFVSRTJEO1xuICAgICAgICB0aGlzLnBjVW5pZm9ybVR5cGVbZ2wuU0FNUExFUl9DVUJFXSA9IFVOSUZPUk1UWVBFX1RFWFRVUkVDVUJFO1xuICAgICAgICBpZiAodGhpcy53ZWJnbDIpIHtcbiAgICAgICAgICAgIHRoaXMucGNVbmlmb3JtVHlwZVtnbC5TQU1QTEVSXzJEX1NIQURPV10gICA9IFVOSUZPUk1UWVBFX1RFWFRVUkUyRF9TSEFET1c7XG4gICAgICAgICAgICB0aGlzLnBjVW5pZm9ybVR5cGVbZ2wuU0FNUExFUl9DVUJFX1NIQURPV10gPSBVTklGT1JNVFlQRV9URVhUVVJFQ1VCRV9TSEFET1c7XG4gICAgICAgICAgICB0aGlzLnBjVW5pZm9ybVR5cGVbZ2wuU0FNUExFUl8zRF0gICAgICAgICAgPSBVTklGT1JNVFlQRV9URVhUVVJFM0Q7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnRhcmdldFRvU2xvdCA9IHt9O1xuICAgICAgICB0aGlzLnRhcmdldFRvU2xvdFtnbC5URVhUVVJFXzJEXSA9IDA7XG4gICAgICAgIHRoaXMudGFyZ2V0VG9TbG90W2dsLlRFWFRVUkVfQ1VCRV9NQVBdID0gMTtcbiAgICAgICAgdGhpcy50YXJnZXRUb1Nsb3RbZ2wuVEVYVFVSRV8zRF0gPSAyO1xuXG4gICAgICAgIC8vIERlZmluZSB0aGUgdW5pZm9ybSBjb21taXQgZnVuY3Rpb25zXG4gICAgICAgIGxldCBzY29wZVgsIHNjb3BlWSwgc2NvcGVaLCBzY29wZVc7XG4gICAgICAgIGxldCB1bmlmb3JtVmFsdWU7XG4gICAgICAgIHRoaXMuY29tbWl0RnVuY3Rpb24gPSBbXTtcbiAgICAgICAgdGhpcy5jb21taXRGdW5jdGlvbltVTklGT1JNVFlQRV9CT09MXSA9IGZ1bmN0aW9uICh1bmlmb3JtLCB2YWx1ZSkge1xuICAgICAgICAgICAgaWYgKHVuaWZvcm0udmFsdWUgIT09IHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgZ2wudW5pZm9ybTFpKHVuaWZvcm0ubG9jYXRpb25JZCwgdmFsdWUpO1xuICAgICAgICAgICAgICAgIHVuaWZvcm0udmFsdWUgPSB2YWx1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgdGhpcy5jb21taXRGdW5jdGlvbltVTklGT1JNVFlQRV9JTlRdID0gdGhpcy5jb21taXRGdW5jdGlvbltVTklGT1JNVFlQRV9CT09MXTtcbiAgICAgICAgdGhpcy5jb21taXRGdW5jdGlvbltVTklGT1JNVFlQRV9GTE9BVF0gPSBmdW5jdGlvbiAodW5pZm9ybSwgdmFsdWUpIHtcbiAgICAgICAgICAgIGlmICh1bmlmb3JtLnZhbHVlICE9PSB2YWx1ZSkge1xuICAgICAgICAgICAgICAgIGdsLnVuaWZvcm0xZih1bmlmb3JtLmxvY2F0aW9uSWQsIHZhbHVlKTtcbiAgICAgICAgICAgICAgICB1bmlmb3JtLnZhbHVlID0gdmFsdWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHRoaXMuY29tbWl0RnVuY3Rpb25bVU5JRk9STVRZUEVfVkVDMl0gID0gZnVuY3Rpb24gKHVuaWZvcm0sIHZhbHVlKSB7XG4gICAgICAgICAgICB1bmlmb3JtVmFsdWUgPSB1bmlmb3JtLnZhbHVlO1xuICAgICAgICAgICAgc2NvcGVYID0gdmFsdWVbMF07XG4gICAgICAgICAgICBzY29wZVkgPSB2YWx1ZVsxXTtcbiAgICAgICAgICAgIGlmICh1bmlmb3JtVmFsdWVbMF0gIT09IHNjb3BlWCB8fCB1bmlmb3JtVmFsdWVbMV0gIT09IHNjb3BlWSkge1xuICAgICAgICAgICAgICAgIGdsLnVuaWZvcm0yZnYodW5pZm9ybS5sb2NhdGlvbklkLCB2YWx1ZSk7XG4gICAgICAgICAgICAgICAgdW5pZm9ybVZhbHVlWzBdID0gc2NvcGVYO1xuICAgICAgICAgICAgICAgIHVuaWZvcm1WYWx1ZVsxXSA9IHNjb3BlWTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgdGhpcy5jb21taXRGdW5jdGlvbltVTklGT1JNVFlQRV9WRUMzXSAgPSBmdW5jdGlvbiAodW5pZm9ybSwgdmFsdWUpIHtcbiAgICAgICAgICAgIHVuaWZvcm1WYWx1ZSA9IHVuaWZvcm0udmFsdWU7XG4gICAgICAgICAgICBzY29wZVggPSB2YWx1ZVswXTtcbiAgICAgICAgICAgIHNjb3BlWSA9IHZhbHVlWzFdO1xuICAgICAgICAgICAgc2NvcGVaID0gdmFsdWVbMl07XG4gICAgICAgICAgICBpZiAodW5pZm9ybVZhbHVlWzBdICE9PSBzY29wZVggfHwgdW5pZm9ybVZhbHVlWzFdICE9PSBzY29wZVkgfHwgdW5pZm9ybVZhbHVlWzJdICE9PSBzY29wZVopIHtcbiAgICAgICAgICAgICAgICBnbC51bmlmb3JtM2Z2KHVuaWZvcm0ubG9jYXRpb25JZCwgdmFsdWUpO1xuICAgICAgICAgICAgICAgIHVuaWZvcm1WYWx1ZVswXSA9IHNjb3BlWDtcbiAgICAgICAgICAgICAgICB1bmlmb3JtVmFsdWVbMV0gPSBzY29wZVk7XG4gICAgICAgICAgICAgICAgdW5pZm9ybVZhbHVlWzJdID0gc2NvcGVaO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICB0aGlzLmNvbW1pdEZ1bmN0aW9uW1VOSUZPUk1UWVBFX1ZFQzRdICA9IGZ1bmN0aW9uICh1bmlmb3JtLCB2YWx1ZSkge1xuICAgICAgICAgICAgdW5pZm9ybVZhbHVlID0gdW5pZm9ybS52YWx1ZTtcbiAgICAgICAgICAgIHNjb3BlWCA9IHZhbHVlWzBdO1xuICAgICAgICAgICAgc2NvcGVZID0gdmFsdWVbMV07XG4gICAgICAgICAgICBzY29wZVogPSB2YWx1ZVsyXTtcbiAgICAgICAgICAgIHNjb3BlVyA9IHZhbHVlWzNdO1xuICAgICAgICAgICAgaWYgKHVuaWZvcm1WYWx1ZVswXSAhPT0gc2NvcGVYIHx8IHVuaWZvcm1WYWx1ZVsxXSAhPT0gc2NvcGVZIHx8IHVuaWZvcm1WYWx1ZVsyXSAhPT0gc2NvcGVaIHx8IHVuaWZvcm1WYWx1ZVszXSAhPT0gc2NvcGVXKSB7XG4gICAgICAgICAgICAgICAgZ2wudW5pZm9ybTRmdih1bmlmb3JtLmxvY2F0aW9uSWQsIHZhbHVlKTtcbiAgICAgICAgICAgICAgICB1bmlmb3JtVmFsdWVbMF0gPSBzY29wZVg7XG4gICAgICAgICAgICAgICAgdW5pZm9ybVZhbHVlWzFdID0gc2NvcGVZO1xuICAgICAgICAgICAgICAgIHVuaWZvcm1WYWx1ZVsyXSA9IHNjb3BlWjtcbiAgICAgICAgICAgICAgICB1bmlmb3JtVmFsdWVbM10gPSBzY29wZVc7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHRoaXMuY29tbWl0RnVuY3Rpb25bVU5JRk9STVRZUEVfSVZFQzJdID0gZnVuY3Rpb24gKHVuaWZvcm0sIHZhbHVlKSB7XG4gICAgICAgICAgICB1bmlmb3JtVmFsdWUgPSB1bmlmb3JtLnZhbHVlO1xuICAgICAgICAgICAgc2NvcGVYID0gdmFsdWVbMF07XG4gICAgICAgICAgICBzY29wZVkgPSB2YWx1ZVsxXTtcbiAgICAgICAgICAgIGlmICh1bmlmb3JtVmFsdWVbMF0gIT09IHNjb3BlWCB8fCB1bmlmb3JtVmFsdWVbMV0gIT09IHNjb3BlWSkge1xuICAgICAgICAgICAgICAgIGdsLnVuaWZvcm0yaXYodW5pZm9ybS5sb2NhdGlvbklkLCB2YWx1ZSk7XG4gICAgICAgICAgICAgICAgdW5pZm9ybVZhbHVlWzBdID0gc2NvcGVYO1xuICAgICAgICAgICAgICAgIHVuaWZvcm1WYWx1ZVsxXSA9IHNjb3BlWTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgdGhpcy5jb21taXRGdW5jdGlvbltVTklGT1JNVFlQRV9CVkVDMl0gPSB0aGlzLmNvbW1pdEZ1bmN0aW9uW1VOSUZPUk1UWVBFX0lWRUMyXTtcbiAgICAgICAgdGhpcy5jb21taXRGdW5jdGlvbltVTklGT1JNVFlQRV9JVkVDM10gPSBmdW5jdGlvbiAodW5pZm9ybSwgdmFsdWUpIHtcbiAgICAgICAgICAgIHVuaWZvcm1WYWx1ZSA9IHVuaWZvcm0udmFsdWU7XG4gICAgICAgICAgICBzY29wZVggPSB2YWx1ZVswXTtcbiAgICAgICAgICAgIHNjb3BlWSA9IHZhbHVlWzFdO1xuICAgICAgICAgICAgc2NvcGVaID0gdmFsdWVbMl07XG4gICAgICAgICAgICBpZiAodW5pZm9ybVZhbHVlWzBdICE9PSBzY29wZVggfHwgdW5pZm9ybVZhbHVlWzFdICE9PSBzY29wZVkgfHwgdW5pZm9ybVZhbHVlWzJdICE9PSBzY29wZVopIHtcbiAgICAgICAgICAgICAgICBnbC51bmlmb3JtM2l2KHVuaWZvcm0ubG9jYXRpb25JZCwgdmFsdWUpO1xuICAgICAgICAgICAgICAgIHVuaWZvcm1WYWx1ZVswXSA9IHNjb3BlWDtcbiAgICAgICAgICAgICAgICB1bmlmb3JtVmFsdWVbMV0gPSBzY29wZVk7XG4gICAgICAgICAgICAgICAgdW5pZm9ybVZhbHVlWzJdID0gc2NvcGVaO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICB0aGlzLmNvbW1pdEZ1bmN0aW9uW1VOSUZPUk1UWVBFX0JWRUMzXSA9IHRoaXMuY29tbWl0RnVuY3Rpb25bVU5JRk9STVRZUEVfSVZFQzNdO1xuICAgICAgICB0aGlzLmNvbW1pdEZ1bmN0aW9uW1VOSUZPUk1UWVBFX0lWRUM0XSA9IGZ1bmN0aW9uICh1bmlmb3JtLCB2YWx1ZSkge1xuICAgICAgICAgICAgdW5pZm9ybVZhbHVlID0gdW5pZm9ybS52YWx1ZTtcbiAgICAgICAgICAgIHNjb3BlWCA9IHZhbHVlWzBdO1xuICAgICAgICAgICAgc2NvcGVZID0gdmFsdWVbMV07XG4gICAgICAgICAgICBzY29wZVogPSB2YWx1ZVsyXTtcbiAgICAgICAgICAgIHNjb3BlVyA9IHZhbHVlWzNdO1xuICAgICAgICAgICAgaWYgKHVuaWZvcm1WYWx1ZVswXSAhPT0gc2NvcGVYIHx8IHVuaWZvcm1WYWx1ZVsxXSAhPT0gc2NvcGVZIHx8IHVuaWZvcm1WYWx1ZVsyXSAhPT0gc2NvcGVaIHx8IHVuaWZvcm1WYWx1ZVszXSAhPT0gc2NvcGVXKSB7XG4gICAgICAgICAgICAgICAgZ2wudW5pZm9ybTRpdih1bmlmb3JtLmxvY2F0aW9uSWQsIHZhbHVlKTtcbiAgICAgICAgICAgICAgICB1bmlmb3JtVmFsdWVbMF0gPSBzY29wZVg7XG4gICAgICAgICAgICAgICAgdW5pZm9ybVZhbHVlWzFdID0gc2NvcGVZO1xuICAgICAgICAgICAgICAgIHVuaWZvcm1WYWx1ZVsyXSA9IHNjb3BlWjtcbiAgICAgICAgICAgICAgICB1bmlmb3JtVmFsdWVbM10gPSBzY29wZVc7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHRoaXMuY29tbWl0RnVuY3Rpb25bVU5JRk9STVRZUEVfQlZFQzRdID0gdGhpcy5jb21taXRGdW5jdGlvbltVTklGT1JNVFlQRV9JVkVDNF07XG4gICAgICAgIHRoaXMuY29tbWl0RnVuY3Rpb25bVU5JRk9STVRZUEVfTUFUMl0gID0gZnVuY3Rpb24gKHVuaWZvcm0sIHZhbHVlKSB7XG4gICAgICAgICAgICBnbC51bmlmb3JtTWF0cml4MmZ2KHVuaWZvcm0ubG9jYXRpb25JZCwgZmFsc2UsIHZhbHVlKTtcbiAgICAgICAgfTtcbiAgICAgICAgdGhpcy5jb21taXRGdW5jdGlvbltVTklGT1JNVFlQRV9NQVQzXSAgPSBmdW5jdGlvbiAodW5pZm9ybSwgdmFsdWUpIHtcbiAgICAgICAgICAgIGdsLnVuaWZvcm1NYXRyaXgzZnYodW5pZm9ybS5sb2NhdGlvbklkLCBmYWxzZSwgdmFsdWUpO1xuICAgICAgICB9O1xuICAgICAgICB0aGlzLmNvbW1pdEZ1bmN0aW9uW1VOSUZPUk1UWVBFX01BVDRdICA9IGZ1bmN0aW9uICh1bmlmb3JtLCB2YWx1ZSkge1xuICAgICAgICAgICAgZ2wudW5pZm9ybU1hdHJpeDRmdih1bmlmb3JtLmxvY2F0aW9uSWQsIGZhbHNlLCB2YWx1ZSk7XG4gICAgICAgIH07XG4gICAgICAgIHRoaXMuY29tbWl0RnVuY3Rpb25bVU5JRk9STVRZUEVfRkxPQVRBUlJBWV0gPSBmdW5jdGlvbiAodW5pZm9ybSwgdmFsdWUpIHtcbiAgICAgICAgICAgIGdsLnVuaWZvcm0xZnYodW5pZm9ybS5sb2NhdGlvbklkLCB2YWx1ZSk7XG4gICAgICAgIH07XG4gICAgICAgIHRoaXMuY29tbWl0RnVuY3Rpb25bVU5JRk9STVRZUEVfVkVDMkFSUkFZXSAgPSBmdW5jdGlvbiAodW5pZm9ybSwgdmFsdWUpIHtcbiAgICAgICAgICAgIGdsLnVuaWZvcm0yZnYodW5pZm9ybS5sb2NhdGlvbklkLCB2YWx1ZSk7XG4gICAgICAgIH07XG4gICAgICAgIHRoaXMuY29tbWl0RnVuY3Rpb25bVU5JRk9STVRZUEVfVkVDM0FSUkFZXSAgPSBmdW5jdGlvbiAodW5pZm9ybSwgdmFsdWUpIHtcbiAgICAgICAgICAgIGdsLnVuaWZvcm0zZnYodW5pZm9ybS5sb2NhdGlvbklkLCB2YWx1ZSk7XG4gICAgICAgIH07XG4gICAgICAgIHRoaXMuY29tbWl0RnVuY3Rpb25bVU5JRk9STVRZUEVfVkVDNEFSUkFZXSAgPSBmdW5jdGlvbiAodW5pZm9ybSwgdmFsdWUpIHtcbiAgICAgICAgICAgIGdsLnVuaWZvcm00ZnYodW5pZm9ybS5sb2NhdGlvbklkLCB2YWx1ZSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgdGhpcy5zdXBwb3J0c0JvbmVUZXh0dXJlcyA9IHRoaXMuZXh0VGV4dHVyZUZsb2F0ICYmIHRoaXMubWF4VmVydGV4VGV4dHVyZXMgPiAwO1xuXG4gICAgICAgIC8vIENhbGN1bGF0ZSBhbiBlc3RpbWF0ZSBvZiB0aGUgbWF4aW11bSBudW1iZXIgb2YgYm9uZXMgdGhhdCBjYW4gYmUgdXBsb2FkZWQgdG8gdGhlIEdQVVxuICAgICAgICAvLyBiYXNlZCBvbiB0aGUgbnVtYmVyIG9mIGF2YWlsYWJsZSB1bmlmb3JtcyBhbmQgdGhlIG51bWJlciBvZiB1bmlmb3JtcyByZXF1aXJlZCBmb3Igbm9uLVxuICAgICAgICAvLyBib25lIGRhdGEuICBUaGlzIGlzIGJhc2VkIG9mZiBvZiB0aGUgU3RhbmRhcmQgc2hhZGVyLiAgQSB1c2VyIGRlZmluZWQgc2hhZGVyIG1heSBoYXZlXG4gICAgICAgIC8vIGV2ZW4gbGVzcyBzcGFjZSBhdmFpbGFibGUgZm9yIGJvbmVzIHNvIHRoaXMgY2FsY3VsYXRlZCB2YWx1ZSBjYW4gYmUgb3ZlcnJpZGRlbiB2aWFcbiAgICAgICAgLy8gcGMuR3JhcGhpY3NEZXZpY2Uuc2V0Qm9uZUxpbWl0LlxuICAgICAgICBsZXQgbnVtVW5pZm9ybXMgPSB0aGlzLnZlcnRleFVuaWZvcm1zQ291bnQ7XG4gICAgICAgIG51bVVuaWZvcm1zIC09IDQgKiA0OyAvLyBNb2RlbCwgdmlldywgcHJvamVjdGlvbiBhbmQgc2hhZG93IG1hdHJpY2VzXG4gICAgICAgIG51bVVuaWZvcm1zIC09IDg7ICAgICAvLyA4IGxpZ2h0cyBtYXgsIGVhY2ggc3BlY2lmeWluZyBhIHBvc2l0aW9uIHZlY3RvclxuICAgICAgICBudW1Vbmlmb3JtcyAtPSAxOyAgICAgLy8gRXllIHBvc2l0aW9uXG4gICAgICAgIG51bVVuaWZvcm1zIC09IDQgKiA0OyAvLyBVcCB0byA0IHRleHR1cmUgdHJhbnNmb3Jtc1xuICAgICAgICB0aGlzLmJvbmVMaW1pdCA9IE1hdGguZmxvb3IobnVtVW5pZm9ybXMgLyAzKTsgICAvLyBlYWNoIGJvbmUgdXNlcyAzIHVuaWZvcm1zXG5cbiAgICAgICAgLy8gUHV0IGEgbGltaXQgb24gdGhlIG51bWJlciBvZiBzdXBwb3J0ZWQgYm9uZXMgYmVmb3JlIHNraW4gcGFydGl0aW9uaW5nIG11c3QgYmUgcGVyZm9ybWVkXG4gICAgICAgIC8vIFNvbWUgR1BVcyBoYXZlIGRlbW9uc3RyYXRlZCBwZXJmb3JtYW5jZSBpc3N1ZXMgaWYgdGhlIG51bWJlciBvZiB2ZWN0b3JzIGFsbG9jYXRlZCB0byB0aGVcbiAgICAgICAgLy8gc2tpbiBtYXRyaXggcGFsZXR0ZSBpcyBsZWZ0IHVuYm91bmRlZFxuICAgICAgICB0aGlzLmJvbmVMaW1pdCA9IE1hdGgubWluKHRoaXMuYm9uZUxpbWl0LCAxMjgpO1xuXG4gICAgICAgIGlmICh0aGlzLnVubWFza2VkUmVuZGVyZXIgPT09ICdNYWxpLTQ1MCBNUCcpIHtcbiAgICAgICAgICAgIHRoaXMuYm9uZUxpbWl0ID0gMzQ7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmNvbnN0YW50VGV4U291cmNlID0gdGhpcy5zY29wZS5yZXNvbHZlKFwic291cmNlXCIpO1xuXG4gICAgICAgIGlmICh0aGlzLmV4dFRleHR1cmVGbG9hdCkge1xuICAgICAgICAgICAgaWYgKHRoaXMud2ViZ2wyKSB7XG4gICAgICAgICAgICAgICAgLy8gSW4gV2ViR0wyIGZsb2F0IHRleHR1cmUgcmVuZGVyYWJpbGl0eSBpcyBkaWN0YXRlZCBieSB0aGUgRVhUX2NvbG9yX2J1ZmZlcl9mbG9hdCBleHRlbnNpb25cbiAgICAgICAgICAgICAgICB0aGlzLnRleHR1cmVGbG9hdFJlbmRlcmFibGUgPSAhIXRoaXMuZXh0Q29sb3JCdWZmZXJGbG9hdDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gSW4gV2ViR0wxIHdlIHNob3VsZCBqdXN0IHRyeSByZW5kZXJpbmcgaW50byBhIGZsb2F0IHRleHR1cmVcbiAgICAgICAgICAgICAgICB0aGlzLnRleHR1cmVGbG9hdFJlbmRlcmFibGUgPSB0ZXN0UmVuZGVyYWJsZShnbCwgZ2wuRkxPQVQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy50ZXh0dXJlRmxvYXRSZW5kZXJhYmxlID0gZmFsc2U7XG4gICAgICAgIH1cblxuICAgICAgICAvLyB0d28gZXh0ZW5zaW9ucyBhbGxvdyB1cyB0byByZW5kZXIgdG8gaGFsZiBmbG9hdCBidWZmZXJzXG4gICAgICAgIGlmICh0aGlzLmV4dENvbG9yQnVmZmVySGFsZkZsb2F0KSB7XG4gICAgICAgICAgICB0aGlzLnRleHR1cmVIYWxmRmxvYXRSZW5kZXJhYmxlID0gISF0aGlzLmV4dENvbG9yQnVmZmVySGFsZkZsb2F0O1xuICAgICAgICB9IGVsc2UgaWYgKHRoaXMuZXh0VGV4dHVyZUhhbGZGbG9hdCkge1xuICAgICAgICAgICAgaWYgKHRoaXMud2ViZ2wyKSB7XG4gICAgICAgICAgICAgICAgLy8gRVhUX2NvbG9yX2J1ZmZlcl9mbG9hdCBzaG91bGQgYWZmZWN0IGJvdGggZmxvYXQgYW5kIGhhbGZmbG9hdCBmb3JtYXRzXG4gICAgICAgICAgICAgICAgdGhpcy50ZXh0dXJlSGFsZkZsb2F0UmVuZGVyYWJsZSA9ICEhdGhpcy5leHRDb2xvckJ1ZmZlckZsb2F0O1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBNYW51YWwgcmVuZGVyIGNoZWNrIGZvciBoYWxmIGZsb2F0XG4gICAgICAgICAgICAgICAgdGhpcy50ZXh0dXJlSGFsZkZsb2F0UmVuZGVyYWJsZSA9IHRlc3RSZW5kZXJhYmxlKGdsLCB0aGlzLmV4dFRleHR1cmVIYWxmRmxvYXQuSEFMRl9GTE9BVF9PRVMpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy50ZXh0dXJlSGFsZkZsb2F0UmVuZGVyYWJsZSA9IGZhbHNlO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5zdXBwb3J0c01vcnBoVGFyZ2V0VGV4dHVyZXNDb3JlID0gKHRoaXMubWF4UHJlY2lzaW9uID09PSBcImhpZ2hwXCIgJiYgdGhpcy5tYXhWZXJ0ZXhUZXh0dXJlcyA+PSAyKTtcbiAgICAgICAgdGhpcy5zdXBwb3J0c0RlcHRoU2hhZG93ID0gdGhpcy53ZWJnbDI7XG5cbiAgICAgICAgdGhpcy5fdGV4dHVyZUZsb2F0SGlnaFByZWNpc2lvbiA9IHVuZGVmaW5lZDtcbiAgICAgICAgdGhpcy5fdGV4dHVyZUhhbGZGbG9hdFVwZGF0YWJsZSA9IHVuZGVmaW5lZDtcblxuICAgICAgICAvLyBhcmVhIGxpZ2h0IExVVCBmb3JtYXQgLSBvcmRlciBvZiBwcmVmZXJlbmNlOiBoYWxmLCBmbG9hdCwgOGJpdFxuICAgICAgICB0aGlzLmFyZWFMaWdodEx1dEZvcm1hdCA9IFBJWEVMRk9STUFUX1JHQkE4O1xuICAgICAgICBpZiAodGhpcy5leHRUZXh0dXJlSGFsZkZsb2F0ICYmIHRoaXMudGV4dHVyZUhhbGZGbG9hdFVwZGF0YWJsZSAmJiB0aGlzLmV4dFRleHR1cmVIYWxmRmxvYXRMaW5lYXIpIHtcbiAgICAgICAgICAgIHRoaXMuYXJlYUxpZ2h0THV0Rm9ybWF0ID0gUElYRUxGT1JNQVRfUkdCQTE2RjtcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLmV4dFRleHR1cmVGbG9hdCAmJiB0aGlzLmV4dFRleHR1cmVGbG9hdExpbmVhcikge1xuICAgICAgICAgICAgdGhpcy5hcmVhTGlnaHRMdXRGb3JtYXQgPSBQSVhFTEZPUk1BVF9SR0JBMzJGO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5wb3N0SW5pdCgpO1xuICAgIH1cblxuICAgIHBvc3RJbml0KCkge1xuICAgICAgICBzdXBlci5wb3N0SW5pdCgpO1xuXG4gICAgICAgIHRoaXMuZ3B1UHJvZmlsZXIgPSBuZXcgV2ViZ2xHcHVQcm9maWxlcih0aGlzKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBEZXN0cm95IHRoZSBncmFwaGljcyBkZXZpY2UuXG4gICAgICovXG4gICAgZGVzdHJveSgpIHtcbiAgICAgICAgc3VwZXIuZGVzdHJveSgpO1xuICAgICAgICBjb25zdCBnbCA9IHRoaXMuZ2w7XG5cbiAgICAgICAgaWYgKHRoaXMud2ViZ2wyICYmIHRoaXMuZmVlZGJhY2spIHtcbiAgICAgICAgICAgIGdsLmRlbGV0ZVRyYW5zZm9ybUZlZWRiYWNrKHRoaXMuZmVlZGJhY2spO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5jbGVhclZlcnRleEFycmF5T2JqZWN0Q2FjaGUoKTtcblxuICAgICAgICB0aGlzLmNhbnZhcy5yZW1vdmVFdmVudExpc3RlbmVyKCd3ZWJnbGNvbnRleHRsb3N0JywgdGhpcy5fY29udGV4dExvc3RIYW5kbGVyLCBmYWxzZSk7XG4gICAgICAgIHRoaXMuY2FudmFzLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3dlYmdsY29udGV4dHJlc3RvcmVkJywgdGhpcy5fY29udGV4dFJlc3RvcmVkSGFuZGxlciwgZmFsc2UpO1xuXG4gICAgICAgIHRoaXMuX2NvbnRleHRMb3N0SGFuZGxlciA9IG51bGw7XG4gICAgICAgIHRoaXMuX2NvbnRleHRSZXN0b3JlZEhhbmRsZXIgPSBudWxsO1xuXG4gICAgICAgIHRoaXMuZ2wgPSBudWxsO1xuXG4gICAgICAgIHN1cGVyLnBvc3REZXN0cm95KCk7XG4gICAgfVxuXG4gICAgY3JlYXRlQmFja2J1ZmZlcihmcmFtZUJ1ZmZlcikge1xuICAgICAgICB0aGlzLnN1cHBvcnRzU3RlbmNpbCA9IHRoaXMuaW5pdE9wdGlvbnMuc3RlbmNpbDtcblxuICAgICAgICB0aGlzLmJhY2tCdWZmZXIgPSBuZXcgUmVuZGVyVGFyZ2V0KHtcbiAgICAgICAgICAgIG5hbWU6ICdXZWJnbEZyYW1lYnVmZmVyJyxcbiAgICAgICAgICAgIGdyYXBoaWNzRGV2aWNlOiB0aGlzLFxuICAgICAgICAgICAgZGVwdGg6IHRoaXMuaW5pdE9wdGlvbnMuZGVwdGgsXG4gICAgICAgICAgICBzdGVuY2lsOiB0aGlzLnN1cHBvcnRzU3RlbmNpbCxcbiAgICAgICAgICAgIHNhbXBsZXM6IHRoaXMuc2FtcGxlc1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyB1c2UgdGhlIGRlZmF1bHQgV2ViR0wgZnJhbWVidWZmZXIgZm9yIHJlbmRlcmluZ1xuICAgICAgICB0aGlzLmJhY2tCdWZmZXIuaW1wbC5zdXBwbGllZENvbG9yRnJhbWVidWZmZXIgPSBmcmFtZUJ1ZmZlcjtcbiAgICB9XG5cbiAgICB1cGRhdGVCYWNrYnVmZmVyKCkge1xuXG4gICAgICAgIGNvbnN0IHJlc29sdXRpb25DaGFuZ2VkID0gdGhpcy5jYW52YXMud2lkdGggIT09IHRoaXMuYmFja0J1ZmZlclNpemUueCB8fCB0aGlzLmNhbnZhcy5oZWlnaHQgIT09IHRoaXMuYmFja0J1ZmZlclNpemUueTtcbiAgICAgICAgaWYgKHRoaXMuX2RlZmF1bHRGcmFtZWJ1ZmZlckNoYW5nZWQgfHwgcmVzb2x1dGlvbkNoYW5nZWQpIHtcbiAgICAgICAgICAgIHRoaXMuX2RlZmF1bHRGcmFtZWJ1ZmZlckNoYW5nZWQgPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMuYmFja0J1ZmZlclNpemUuc2V0KHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xuXG4gICAgICAgICAgICAvLyByZWNyZWF0ZSB0aGUgYmFja2J1ZmZlciB3aXRoIG5ld2x5IHN1cHBsaWVkIGZyYW1lYnVmZmVyXG4gICAgICAgICAgICB0aGlzLmJhY2tCdWZmZXIuZGVzdHJveSgpO1xuICAgICAgICAgICAgdGhpcy5jcmVhdGVCYWNrYnVmZmVyKHRoaXMuX2RlZmF1bHRGcmFtZWJ1ZmZlcik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBwcm92aWRlIHdlYmdsIGltcGxlbWVudGF0aW9uIGZvciB0aGUgdmVydGV4IGJ1ZmZlclxuICAgIGNyZWF0ZVZlcnRleEJ1ZmZlckltcGwodmVydGV4QnVmZmVyLCBmb3JtYXQpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBXZWJnbFZlcnRleEJ1ZmZlcigpO1xuICAgIH1cblxuICAgIC8vIHByb3ZpZGUgd2ViZ2wgaW1wbGVtZW50YXRpb24gZm9yIHRoZSBpbmRleCBidWZmZXJcbiAgICBjcmVhdGVJbmRleEJ1ZmZlckltcGwoaW5kZXhCdWZmZXIpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBXZWJnbEluZGV4QnVmZmVyKGluZGV4QnVmZmVyKTtcbiAgICB9XG5cbiAgICBjcmVhdGVTaGFkZXJJbXBsKHNoYWRlcikge1xuICAgICAgICByZXR1cm4gbmV3IFdlYmdsU2hhZGVyKHNoYWRlcik7XG4gICAgfVxuXG4gICAgY3JlYXRlVGV4dHVyZUltcGwodGV4dHVyZSkge1xuICAgICAgICByZXR1cm4gbmV3IFdlYmdsVGV4dHVyZSgpO1xuICAgIH1cblxuICAgIGNyZWF0ZVJlbmRlclRhcmdldEltcGwocmVuZGVyVGFyZ2V0KSB7XG4gICAgICAgIHJldHVybiBuZXcgV2ViZ2xSZW5kZXJUYXJnZXQoKTtcbiAgICB9XG5cbiAgICAvLyAjaWYgX0RFQlVHXG4gICAgcHVzaE1hcmtlcihuYW1lKSB7XG4gICAgICAgIGlmICh3aW5kb3cuc3BlY3Rvcikge1xuICAgICAgICAgICAgY29uc3QgbGFiZWwgPSBEZWJ1Z0dyYXBoaWNzLnRvU3RyaW5nKCk7XG4gICAgICAgICAgICB3aW5kb3cuc3BlY3Rvci5zZXRNYXJrZXIoYCR7bGFiZWx9ICNgKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHBvcE1hcmtlcigpIHtcbiAgICAgICAgaWYgKHdpbmRvdy5zcGVjdG9yKSB7XG4gICAgICAgICAgICBjb25zdCBsYWJlbCA9IERlYnVnR3JhcGhpY3MudG9TdHJpbmcoKTtcbiAgICAgICAgICAgIGlmIChsYWJlbC5sZW5ndGgpXG4gICAgICAgICAgICAgICAgd2luZG93LnNwZWN0b3Iuc2V0TWFya2VyKGAke2xhYmVsfSAjYCk7XG4gICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgd2luZG93LnNwZWN0b3IuY2xlYXJNYXJrZXIoKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICAvLyAjZW5kaWZcblxuICAgIC8qKlxuICAgICAqIFF1ZXJ5IHRoZSBwcmVjaXNpb24gc3VwcG9ydGVkIGJ5IGludHMgYW5kIGZsb2F0cyBpbiB2ZXJ0ZXggYW5kIGZyYWdtZW50IHNoYWRlcnMuIE5vdGUgdGhhdFxuICAgICAqIGdldFNoYWRlclByZWNpc2lvbkZvcm1hdCBpcyBub3QgZ3VhcmFudGVlZCB0byBiZSBwcmVzZW50IChzdWNoIGFzIHNvbWUgaW5zdGFuY2VzIG9mIHRoZVxuICAgICAqIGRlZmF1bHQgQW5kcm9pZCBicm93c2VyKS4gSW4gdGhpcyBjYXNlLCBhc3N1bWUgaGlnaHAgaXMgYXZhaWxhYmxlLlxuICAgICAqXG4gICAgICogQHJldHVybnMge3N0cmluZ30gXCJoaWdocFwiLCBcIm1lZGl1bXBcIiBvciBcImxvd3BcIlxuICAgICAqIEBpZ25vcmVcbiAgICAgKi9cbiAgICBnZXRQcmVjaXNpb24oKSB7XG4gICAgICAgIGNvbnN0IGdsID0gdGhpcy5nbDtcbiAgICAgICAgbGV0IHByZWNpc2lvbiA9IFwiaGlnaHBcIjtcblxuICAgICAgICBpZiAoZ2wuZ2V0U2hhZGVyUHJlY2lzaW9uRm9ybWF0KSB7XG4gICAgICAgICAgICBjb25zdCB2ZXJ0ZXhTaGFkZXJQcmVjaXNpb25IaWdocEZsb2F0ID0gZ2wuZ2V0U2hhZGVyUHJlY2lzaW9uRm9ybWF0KGdsLlZFUlRFWF9TSEFERVIsIGdsLkhJR0hfRkxPQVQpO1xuICAgICAgICAgICAgY29uc3QgdmVydGV4U2hhZGVyUHJlY2lzaW9uTWVkaXVtcEZsb2F0ID0gZ2wuZ2V0U2hhZGVyUHJlY2lzaW9uRm9ybWF0KGdsLlZFUlRFWF9TSEFERVIsIGdsLk1FRElVTV9GTE9BVCk7XG5cbiAgICAgICAgICAgIGNvbnN0IGZyYWdtZW50U2hhZGVyUHJlY2lzaW9uSGlnaHBGbG9hdCA9IGdsLmdldFNoYWRlclByZWNpc2lvbkZvcm1hdChnbC5GUkFHTUVOVF9TSEFERVIsIGdsLkhJR0hfRkxPQVQpO1xuICAgICAgICAgICAgY29uc3QgZnJhZ21lbnRTaGFkZXJQcmVjaXNpb25NZWRpdW1wRmxvYXQgPSBnbC5nZXRTaGFkZXJQcmVjaXNpb25Gb3JtYXQoZ2wuRlJBR01FTlRfU0hBREVSLCBnbC5NRURJVU1fRkxPQVQpO1xuXG4gICAgICAgICAgICBpZiAodmVydGV4U2hhZGVyUHJlY2lzaW9uSGlnaHBGbG9hdCAmJiB2ZXJ0ZXhTaGFkZXJQcmVjaXNpb25NZWRpdW1wRmxvYXQgJiYgZnJhZ21lbnRTaGFkZXJQcmVjaXNpb25IaWdocEZsb2F0ICYmIGZyYWdtZW50U2hhZGVyUHJlY2lzaW9uTWVkaXVtcEZsb2F0KSB7XG5cbiAgICAgICAgICAgICAgICBjb25zdCBoaWdocEF2YWlsYWJsZSA9IHZlcnRleFNoYWRlclByZWNpc2lvbkhpZ2hwRmxvYXQucHJlY2lzaW9uID4gMCAmJiBmcmFnbWVudFNoYWRlclByZWNpc2lvbkhpZ2hwRmxvYXQucHJlY2lzaW9uID4gMDtcbiAgICAgICAgICAgICAgICBjb25zdCBtZWRpdW1wQXZhaWxhYmxlID0gdmVydGV4U2hhZGVyUHJlY2lzaW9uTWVkaXVtcEZsb2F0LnByZWNpc2lvbiA+IDAgJiYgZnJhZ21lbnRTaGFkZXJQcmVjaXNpb25NZWRpdW1wRmxvYXQucHJlY2lzaW9uID4gMDtcblxuICAgICAgICAgICAgICAgIGlmICghaGlnaHBBdmFpbGFibGUpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKG1lZGl1bXBBdmFpbGFibGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHByZWNpc2lvbiA9IFwibWVkaXVtcFwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgRGVidWcud2FybihcIldBUk5JTkc6IGhpZ2hwIG5vdCBzdXBwb3J0ZWQsIHVzaW5nIG1lZGl1bXBcIik7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBwcmVjaXNpb24gPSBcImxvd3BcIjtcbiAgICAgICAgICAgICAgICAgICAgICAgIERlYnVnLndhcm4oXCJXQVJOSU5HOiBoaWdocCBhbmQgbWVkaXVtcCBub3Qgc3VwcG9ydGVkLCB1c2luZyBsb3dwXCIpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHByZWNpc2lvbjtcbiAgICB9XG5cbiAgICBnZXRFeHRlbnNpb24oKSB7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYXJndW1lbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5zdXBwb3J0ZWRFeHRlbnNpb25zLmluZGV4T2YoYXJndW1lbnRzW2ldKSAhPT0gLTEpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5nbC5nZXRFeHRlbnNpb24oYXJndW1lbnRzW2ldKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICAvKiogQGlnbm9yZSAqL1xuICAgIGdldCBleHREaXNqb2ludFRpbWVyUXVlcnkoKSB7XG4gICAgICAgIC8vIGxhenkgZXZhbHVhdGlvbiBhcyB0aGlzIGlzIG5vdCB0eXBpY2FsbHkgdXNlZFxuICAgICAgICBpZiAoIXRoaXMuX2V4dERpc2pvaW50VGltZXJRdWVyeSkge1xuICAgICAgICAgICAgaWYgKHRoaXMud2ViZ2wyKSB7XG4gICAgICAgICAgICAgICAgLy8gTm90ZSB0aGF0IEZpcmVmb3ggZXhwb3NlcyBFWFRfZGlzam9pbnRfdGltZXJfcXVlcnkgdW5kZXIgV2ViR0wyIHJhdGhlciB0aGFuIEVYVF9kaXNqb2ludF90aW1lcl9xdWVyeV93ZWJnbDJcbiAgICAgICAgICAgICAgICB0aGlzLl9leHREaXNqb2ludFRpbWVyUXVlcnkgPSB0aGlzLmdldEV4dGVuc2lvbignRVhUX2Rpc2pvaW50X3RpbWVyX3F1ZXJ5X3dlYmdsMicsICdFWFRfZGlzam9pbnRfdGltZXJfcXVlcnknKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy5fZXh0RGlzam9pbnRUaW1lclF1ZXJ5O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEluaXRpYWxpemUgdGhlIGV4dGVuc2lvbnMgcHJvdmlkZWQgYnkgdGhlIFdlYkdMIGNvbnRleHQuXG4gICAgICpcbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgaW5pdGlhbGl6ZUV4dGVuc2lvbnMoKSB7XG4gICAgICAgIGNvbnN0IGdsID0gdGhpcy5nbDtcbiAgICAgICAgdGhpcy5zdXBwb3J0ZWRFeHRlbnNpb25zID0gZ2wuZ2V0U3VwcG9ydGVkRXh0ZW5zaW9ucygpID8/IFtdO1xuICAgICAgICB0aGlzLl9leHREaXNqb2ludFRpbWVyUXVlcnkgPSBudWxsO1xuXG4gICAgICAgIGlmICh0aGlzLndlYmdsMikge1xuICAgICAgICAgICAgdGhpcy5leHRCbGVuZE1pbm1heCA9IHRydWU7XG4gICAgICAgICAgICB0aGlzLmV4dERyYXdCdWZmZXJzID0gdHJ1ZTtcbiAgICAgICAgICAgIHRoaXMuZHJhd0J1ZmZlcnMgPSBnbC5kcmF3QnVmZmVycy5iaW5kKGdsKTtcbiAgICAgICAgICAgIHRoaXMuZXh0SW5zdGFuY2luZyA9IHRydWU7XG4gICAgICAgICAgICB0aGlzLmV4dFN0YW5kYXJkRGVyaXZhdGl2ZXMgPSB0cnVlO1xuICAgICAgICAgICAgdGhpcy5leHRUZXh0dXJlRmxvYXQgPSB0cnVlO1xuICAgICAgICAgICAgdGhpcy5leHRUZXh0dXJlSGFsZkZsb2F0ID0gdHJ1ZTtcbiAgICAgICAgICAgIHRoaXMuZXh0VGV4dHVyZUxvZCA9IHRydWU7XG4gICAgICAgICAgICB0aGlzLmV4dFVpbnRFbGVtZW50ID0gdHJ1ZTtcbiAgICAgICAgICAgIHRoaXMuZXh0VmVydGV4QXJyYXlPYmplY3QgPSB0cnVlO1xuICAgICAgICAgICAgdGhpcy5leHRDb2xvckJ1ZmZlckZsb2F0ID0gdGhpcy5nZXRFeHRlbnNpb24oJ0VYVF9jb2xvcl9idWZmZXJfZmxvYXQnKTtcbiAgICAgICAgICAgIHRoaXMuZXh0RGVwdGhUZXh0dXJlID0gdHJ1ZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuZXh0QmxlbmRNaW5tYXggPSB0aGlzLmdldEV4dGVuc2lvbihcIkVYVF9ibGVuZF9taW5tYXhcIik7XG4gICAgICAgICAgICB0aGlzLmV4dERyYXdCdWZmZXJzID0gdGhpcy5nZXRFeHRlbnNpb24oJ1dFQkdMX2RyYXdfYnVmZmVycycpO1xuICAgICAgICAgICAgdGhpcy5leHRJbnN0YW5jaW5nID0gdGhpcy5nZXRFeHRlbnNpb24oXCJBTkdMRV9pbnN0YW5jZWRfYXJyYXlzXCIpO1xuICAgICAgICAgICAgdGhpcy5kcmF3QnVmZmVycyA9IHRoaXMuZXh0RHJhd0J1ZmZlcnM/LmRyYXdCdWZmZXJzV0VCR0wuYmluZCh0aGlzLmV4dERyYXdCdWZmZXJzKTtcbiAgICAgICAgICAgIGlmICh0aGlzLmV4dEluc3RhbmNpbmcpIHtcbiAgICAgICAgICAgICAgICAvLyBJbnN0YWxsIHRoZSBXZWJHTCAyIEluc3RhbmNpbmcgQVBJIGZvciBXZWJHTCAxLjBcbiAgICAgICAgICAgICAgICBjb25zdCBleHQgPSB0aGlzLmV4dEluc3RhbmNpbmc7XG4gICAgICAgICAgICAgICAgZ2wuZHJhd0FycmF5c0luc3RhbmNlZCA9IGV4dC5kcmF3QXJyYXlzSW5zdGFuY2VkQU5HTEUuYmluZChleHQpO1xuICAgICAgICAgICAgICAgIGdsLmRyYXdFbGVtZW50c0luc3RhbmNlZCA9IGV4dC5kcmF3RWxlbWVudHNJbnN0YW5jZWRBTkdMRS5iaW5kKGV4dCk7XG4gICAgICAgICAgICAgICAgZ2wudmVydGV4QXR0cmliRGl2aXNvciA9IGV4dC52ZXJ0ZXhBdHRyaWJEaXZpc29yQU5HTEUuYmluZChleHQpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLmV4dFN0YW5kYXJkRGVyaXZhdGl2ZXMgPSB0aGlzLmdldEV4dGVuc2lvbihcIk9FU19zdGFuZGFyZF9kZXJpdmF0aXZlc1wiKTtcbiAgICAgICAgICAgIHRoaXMuZXh0VGV4dHVyZUZsb2F0ID0gdGhpcy5nZXRFeHRlbnNpb24oXCJPRVNfdGV4dHVyZV9mbG9hdFwiKTtcbiAgICAgICAgICAgIHRoaXMuZXh0VGV4dHVyZUhhbGZGbG9hdCA9IHRoaXMuZ2V0RXh0ZW5zaW9uKFwiT0VTX3RleHR1cmVfaGFsZl9mbG9hdFwiKTtcbiAgICAgICAgICAgIHRoaXMuZXh0VGV4dHVyZUxvZCA9IHRoaXMuZ2V0RXh0ZW5zaW9uKCdFWFRfc2hhZGVyX3RleHR1cmVfbG9kJyk7XG4gICAgICAgICAgICB0aGlzLmV4dFVpbnRFbGVtZW50ID0gdGhpcy5nZXRFeHRlbnNpb24oXCJPRVNfZWxlbWVudF9pbmRleF91aW50XCIpO1xuICAgICAgICAgICAgdGhpcy5leHRWZXJ0ZXhBcnJheU9iamVjdCA9IHRoaXMuZ2V0RXh0ZW5zaW9uKFwiT0VTX3ZlcnRleF9hcnJheV9vYmplY3RcIik7XG4gICAgICAgICAgICBpZiAodGhpcy5leHRWZXJ0ZXhBcnJheU9iamVjdCkge1xuICAgICAgICAgICAgICAgIC8vIEluc3RhbGwgdGhlIFdlYkdMIDIgVkFPIEFQSSBmb3IgV2ViR0wgMS4wXG4gICAgICAgICAgICAgICAgY29uc3QgZXh0ID0gdGhpcy5leHRWZXJ0ZXhBcnJheU9iamVjdDtcbiAgICAgICAgICAgICAgICBnbC5jcmVhdGVWZXJ0ZXhBcnJheSA9IGV4dC5jcmVhdGVWZXJ0ZXhBcnJheU9FUy5iaW5kKGV4dCk7XG4gICAgICAgICAgICAgICAgZ2wuZGVsZXRlVmVydGV4QXJyYXkgPSBleHQuZGVsZXRlVmVydGV4QXJyYXlPRVMuYmluZChleHQpO1xuICAgICAgICAgICAgICAgIGdsLmlzVmVydGV4QXJyYXkgPSBleHQuaXNWZXJ0ZXhBcnJheU9FUy5iaW5kKGV4dCk7XG4gICAgICAgICAgICAgICAgZ2wuYmluZFZlcnRleEFycmF5ID0gZXh0LmJpbmRWZXJ0ZXhBcnJheU9FUy5iaW5kKGV4dCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmV4dENvbG9yQnVmZmVyRmxvYXQgPSBudWxsO1xuICAgICAgICAgICAgdGhpcy5leHREZXB0aFRleHR1cmUgPSBnbC5nZXRFeHRlbnNpb24oJ1dFQkdMX2RlcHRoX3RleHR1cmUnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuZXh0RGVidWdSZW5kZXJlckluZm8gPSB0aGlzLmdldEV4dGVuc2lvbignV0VCR0xfZGVidWdfcmVuZGVyZXJfaW5mbycpO1xuICAgICAgICB0aGlzLmV4dFRleHR1cmVGbG9hdExpbmVhciA9IHRoaXMuZ2V0RXh0ZW5zaW9uKFwiT0VTX3RleHR1cmVfZmxvYXRfbGluZWFyXCIpO1xuICAgICAgICB0aGlzLmV4dFRleHR1cmVIYWxmRmxvYXRMaW5lYXIgPSB0aGlzLmdldEV4dGVuc2lvbihcIk9FU190ZXh0dXJlX2hhbGZfZmxvYXRfbGluZWFyXCIpO1xuICAgICAgICB0aGlzLmV4dEZsb2F0QmxlbmQgPSB0aGlzLmdldEV4dGVuc2lvbihcIkVYVF9mbG9hdF9ibGVuZFwiKTtcbiAgICAgICAgdGhpcy5leHRUZXh0dXJlRmlsdGVyQW5pc290cm9waWMgPSB0aGlzLmdldEV4dGVuc2lvbignRVhUX3RleHR1cmVfZmlsdGVyX2FuaXNvdHJvcGljJywgJ1dFQktJVF9FWFRfdGV4dHVyZV9maWx0ZXJfYW5pc290cm9waWMnKTtcbiAgICAgICAgdGhpcy5leHRDb21wcmVzc2VkVGV4dHVyZUVUQzEgPSB0aGlzLmdldEV4dGVuc2lvbignV0VCR0xfY29tcHJlc3NlZF90ZXh0dXJlX2V0YzEnKTtcbiAgICAgICAgdGhpcy5leHRDb21wcmVzc2VkVGV4dHVyZUVUQyA9IHRoaXMuZ2V0RXh0ZW5zaW9uKCdXRUJHTF9jb21wcmVzc2VkX3RleHR1cmVfZXRjJyk7XG4gICAgICAgIHRoaXMuZXh0Q29tcHJlc3NlZFRleHR1cmVQVlJUQyA9IHRoaXMuZ2V0RXh0ZW5zaW9uKCdXRUJHTF9jb21wcmVzc2VkX3RleHR1cmVfcHZydGMnLCAnV0VCS0lUX1dFQkdMX2NvbXByZXNzZWRfdGV4dHVyZV9wdnJ0YycpO1xuICAgICAgICB0aGlzLmV4dENvbXByZXNzZWRUZXh0dXJlUzNUQyA9IHRoaXMuZ2V0RXh0ZW5zaW9uKCdXRUJHTF9jb21wcmVzc2VkX3RleHR1cmVfczN0YycsICdXRUJLSVRfV0VCR0xfY29tcHJlc3NlZF90ZXh0dXJlX3MzdGMnKTtcbiAgICAgICAgdGhpcy5leHRDb21wcmVzc2VkVGV4dHVyZUFUQyA9IHRoaXMuZ2V0RXh0ZW5zaW9uKCdXRUJHTF9jb21wcmVzc2VkX3RleHR1cmVfYXRjJyk7XG4gICAgICAgIHRoaXMuZXh0Q29tcHJlc3NlZFRleHR1cmVBU1RDID0gdGhpcy5nZXRFeHRlbnNpb24oJ1dFQkdMX2NvbXByZXNzZWRfdGV4dHVyZV9hc3RjJyk7XG4gICAgICAgIHRoaXMuZXh0UGFyYWxsZWxTaGFkZXJDb21waWxlID0gdGhpcy5nZXRFeHRlbnNpb24oJ0tIUl9wYXJhbGxlbF9zaGFkZXJfY29tcGlsZScpO1xuXG4gICAgICAgIC8vIGlPUyBleHBvc2VzIHRoaXMgZm9yIGhhbGYgcHJlY2lzaW9uIHJlbmRlciB0YXJnZXRzIG9uIGJvdGggV2ViZ2wxIGFuZCAyIGZyb20gaU9TIHYgMTQuNWJldGFcbiAgICAgICAgdGhpcy5leHRDb2xvckJ1ZmZlckhhbGZGbG9hdCA9IHRoaXMuZ2V0RXh0ZW5zaW9uKFwiRVhUX2NvbG9yX2J1ZmZlcl9oYWxmX2Zsb2F0XCIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFF1ZXJ5IHRoZSBjYXBhYmlsaXRpZXMgb2YgdGhlIFdlYkdMIGNvbnRleHQuXG4gICAgICpcbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgaW5pdGlhbGl6ZUNhcGFiaWxpdGllcygpIHtcbiAgICAgICAgY29uc3QgZ2wgPSB0aGlzLmdsO1xuICAgICAgICBsZXQgZXh0O1xuXG4gICAgICAgIGNvbnN0IHVzZXJBZ2VudCA9IHR5cGVvZiBuYXZpZ2F0b3IgIT09ICd1bmRlZmluZWQnID8gbmF2aWdhdG9yLnVzZXJBZ2VudCA6IFwiXCI7XG5cbiAgICAgICAgdGhpcy5tYXhQcmVjaXNpb24gPSB0aGlzLnByZWNpc2lvbiA9IHRoaXMuZ2V0UHJlY2lzaW9uKCk7XG5cbiAgICAgICAgY29uc3QgY29udGV4dEF0dHJpYnMgPSBnbC5nZXRDb250ZXh0QXR0cmlidXRlcygpO1xuICAgICAgICB0aGlzLnN1cHBvcnRzTXNhYSA9IGNvbnRleHRBdHRyaWJzPy5hbnRpYWxpYXMgPz8gZmFsc2U7XG4gICAgICAgIHRoaXMuc3VwcG9ydHNTdGVuY2lsID0gY29udGV4dEF0dHJpYnM/LnN0ZW5jaWwgPz8gZmFsc2U7XG5cbiAgICAgICAgdGhpcy5zdXBwb3J0c0luc3RhbmNpbmcgPSAhIXRoaXMuZXh0SW5zdGFuY2luZztcblxuICAgICAgICAvLyBRdWVyeSBwYXJhbWV0ZXIgdmFsdWVzIGZyb20gdGhlIFdlYkdMIGNvbnRleHRcbiAgICAgICAgdGhpcy5tYXhUZXh0dXJlU2l6ZSA9IGdsLmdldFBhcmFtZXRlcihnbC5NQVhfVEVYVFVSRV9TSVpFKTtcbiAgICAgICAgdGhpcy5tYXhDdWJlTWFwU2l6ZSA9IGdsLmdldFBhcmFtZXRlcihnbC5NQVhfQ1VCRV9NQVBfVEVYVFVSRV9TSVpFKTtcbiAgICAgICAgdGhpcy5tYXhSZW5kZXJCdWZmZXJTaXplID0gZ2wuZ2V0UGFyYW1ldGVyKGdsLk1BWF9SRU5ERVJCVUZGRVJfU0laRSk7XG4gICAgICAgIHRoaXMubWF4VGV4dHVyZXMgPSBnbC5nZXRQYXJhbWV0ZXIoZ2wuTUFYX1RFWFRVUkVfSU1BR0VfVU5JVFMpO1xuICAgICAgICB0aGlzLm1heENvbWJpbmVkVGV4dHVyZXMgPSBnbC5nZXRQYXJhbWV0ZXIoZ2wuTUFYX0NPTUJJTkVEX1RFWFRVUkVfSU1BR0VfVU5JVFMpO1xuICAgICAgICB0aGlzLm1heFZlcnRleFRleHR1cmVzID0gZ2wuZ2V0UGFyYW1ldGVyKGdsLk1BWF9WRVJURVhfVEVYVFVSRV9JTUFHRV9VTklUUyk7XG4gICAgICAgIHRoaXMudmVydGV4VW5pZm9ybXNDb3VudCA9IGdsLmdldFBhcmFtZXRlcihnbC5NQVhfVkVSVEVYX1VOSUZPUk1fVkVDVE9SUyk7XG4gICAgICAgIHRoaXMuZnJhZ21lbnRVbmlmb3Jtc0NvdW50ID0gZ2wuZ2V0UGFyYW1ldGVyKGdsLk1BWF9GUkFHTUVOVF9VTklGT1JNX1ZFQ1RPUlMpO1xuICAgICAgICBpZiAodGhpcy53ZWJnbDIpIHtcbiAgICAgICAgICAgIHRoaXMubWF4RHJhd0J1ZmZlcnMgPSBnbC5nZXRQYXJhbWV0ZXIoZ2wuTUFYX0RSQVdfQlVGRkVSUyk7XG4gICAgICAgICAgICB0aGlzLm1heENvbG9yQXR0YWNobWVudHMgPSBnbC5nZXRQYXJhbWV0ZXIoZ2wuTUFYX0NPTE9SX0FUVEFDSE1FTlRTKTtcbiAgICAgICAgICAgIHRoaXMubWF4Vm9sdW1lU2l6ZSA9IGdsLmdldFBhcmFtZXRlcihnbC5NQVhfM0RfVEVYVFVSRV9TSVpFKTtcbiAgICAgICAgICAgIHRoaXMuc3VwcG9ydHNNcnQgPSB0cnVlO1xuICAgICAgICAgICAgdGhpcy5zdXBwb3J0c1ZvbHVtZVRleHR1cmVzID0gdHJ1ZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGV4dCA9IHRoaXMuZXh0RHJhd0J1ZmZlcnM7XG4gICAgICAgICAgICB0aGlzLnN1cHBvcnRzTXJ0ID0gISFleHQ7XG4gICAgICAgICAgICB0aGlzLm1heERyYXdCdWZmZXJzID0gZXh0ID8gZ2wuZ2V0UGFyYW1ldGVyKGV4dC5NQVhfRFJBV19CVUZGRVJTX1dFQkdMKSA6IDE7XG4gICAgICAgICAgICB0aGlzLm1heENvbG9yQXR0YWNobWVudHMgPSBleHQgPyBnbC5nZXRQYXJhbWV0ZXIoZXh0Lk1BWF9DT0xPUl9BVFRBQ0hNRU5UU19XRUJHTCkgOiAxO1xuICAgICAgICAgICAgdGhpcy5tYXhWb2x1bWVTaXplID0gMTtcbiAgICAgICAgfVxuXG4gICAgICAgIGV4dCA9IHRoaXMuZXh0RGVidWdSZW5kZXJlckluZm87XG4gICAgICAgIHRoaXMudW5tYXNrZWRSZW5kZXJlciA9IGV4dCA/IGdsLmdldFBhcmFtZXRlcihleHQuVU5NQVNLRURfUkVOREVSRVJfV0VCR0wpIDogJyc7XG4gICAgICAgIHRoaXMudW5tYXNrZWRWZW5kb3IgPSBleHQgPyBnbC5nZXRQYXJhbWV0ZXIoZXh0LlVOTUFTS0VEX1ZFTkRPUl9XRUJHTCkgOiAnJztcblxuICAgICAgICAvLyBNYWxpLUc1MiBoYXMgcmVuZGVyaW5nIGlzc3VlcyB3aXRoIEdQVSBwYXJ0aWNsZXMgaW5jbHVkaW5nXG4gICAgICAgIC8vIFNNLUEyMjVNLCBNMjAwM0oxNVNDIGFuZCBLRlJBV0kgKEFtYXpvbiBGaXJlIEhEIDggMjAyMilcbiAgICAgICAgY29uc3QgbWFsaVJlbmRlcmVyUmVnZXggPSAvXFxiTWFsaS1HNTIrLztcblxuICAgICAgICAvLyBTYW1zdW5nIGRldmljZXMgd2l0aCBFeHlub3MgKEFSTSkgZWl0aGVyIGNyYXNoIG9yIHJlbmRlciBpbmNvcnJlY3RseSB3aGVuIHVzaW5nIEdQVSBmb3IgcGFydGljbGVzLiBTZWU6XG4gICAgICAgIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9wbGF5Y2FudmFzL2VuZ2luZS9pc3N1ZXMvMzk2N1xuICAgICAgICAvLyBodHRwczovL2dpdGh1Yi5jb20vcGxheWNhbnZhcy9lbmdpbmUvaXNzdWVzLzM0MTVcbiAgICAgICAgLy8gaHR0cHM6Ly9naXRodWIuY29tL3BsYXljYW52YXMvZW5naW5lL2lzc3Vlcy80NTE0XG4gICAgICAgIC8vIEV4YW1wbGUgVUEgbWF0Y2hlczogU3RhcnRpbmcgJ1NNJyBhbmQgYW55IGNvbWJpbmF0aW9uIG9mIGxldHRlcnMgb3IgbnVtYmVyczpcbiAgICAgICAgLy8gTW96aWxsYS81LjAgKExpbnV4LCBBbmRyb2lkIDEyOyBTTS1HOTcwRiBCdWlsZC9TUDFBLjIxMDgxMi4wMTY7IHd2KVxuICAgICAgICBjb25zdCBzYW1zdW5nTW9kZWxSZWdleCA9IC9TTS1bYS16QS1aMC05XSsvO1xuICAgICAgICB0aGlzLnN1cHBvcnRzR3B1UGFydGljbGVzID0gISh0aGlzLnVubWFza2VkVmVuZG9yID09PSAnQVJNJyAmJiB1c2VyQWdlbnQubWF0Y2goc2Ftc3VuZ01vZGVsUmVnZXgpKSAmJlxuICAgICAgICAgICAgISh0aGlzLnVubWFza2VkUmVuZGVyZXIubWF0Y2gobWFsaVJlbmRlcmVyUmVnZXgpKTtcblxuICAgICAgICBleHQgPSB0aGlzLmV4dFRleHR1cmVGaWx0ZXJBbmlzb3Ryb3BpYztcbiAgICAgICAgdGhpcy5tYXhBbmlzb3Ryb3B5ID0gZXh0ID8gZ2wuZ2V0UGFyYW1ldGVyKGV4dC5NQVhfVEVYVFVSRV9NQVhfQU5JU09UUk9QWV9FWFQpIDogMTtcblxuICAgICAgICB0aGlzLnNhbXBsZXMgPSBnbC5nZXRQYXJhbWV0ZXIoZ2wuU0FNUExFUyk7XG4gICAgICAgIHRoaXMubWF4U2FtcGxlcyA9IHRoaXMud2ViZ2wyICYmICF0aGlzLmZvcmNlRGlzYWJsZU11bHRpc2FtcGxpbmcgPyBnbC5nZXRQYXJhbWV0ZXIoZ2wuTUFYX1NBTVBMRVMpIDogMTtcblxuICAgICAgICAvLyBEb24ndCBhbGxvdyBhcmVhIGxpZ2h0cyBvbiBvbGQgYW5kcm9pZCBkZXZpY2VzLCB0aGV5IG9mdGVuIGZhaWwgdG8gY29tcGlsZSB0aGUgc2hhZGVyLCBydW4gaXQgaW5jb3JyZWN0bHkgb3IgYXJlIHZlcnkgc2xvdy5cbiAgICAgICAgdGhpcy5zdXBwb3J0c0FyZWFMaWdodHMgPSB0aGlzLndlYmdsMiB8fCAhcGxhdGZvcm0uYW5kcm9pZDtcblxuICAgICAgICAvLyBzdXBwb3J0cyB0ZXh0dXJlIGZldGNoIGluc3RydWN0aW9uXG4gICAgICAgIHRoaXMuc3VwcG9ydHNUZXh0dXJlRmV0Y2ggPSB0aGlzLndlYmdsMjtcblxuICAgICAgICAvLyBBbHNvIGRvIG5vdCBhbGxvdyB0aGVtIHdoZW4gd2Ugb25seSBoYXZlIHNtYWxsIG51bWJlciBvZiB0ZXh0dXJlIHVuaXRzXG4gICAgICAgIGlmICh0aGlzLm1heFRleHR1cmVzIDw9IDgpIHtcbiAgICAgICAgICAgIHRoaXMuc3VwcG9ydHNBcmVhTGlnaHRzID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXQgdGhlIGluaXRpYWwgcmVuZGVyIHN0YXRlIG9uIHRoZSBXZWJHTCBjb250ZXh0LlxuICAgICAqXG4gICAgICogQGlnbm9yZVxuICAgICAqL1xuICAgIGluaXRpYWxpemVSZW5kZXJTdGF0ZSgpIHtcbiAgICAgICAgc3VwZXIuaW5pdGlhbGl6ZVJlbmRlclN0YXRlKCk7XG5cbiAgICAgICAgY29uc3QgZ2wgPSB0aGlzLmdsO1xuXG4gICAgICAgIC8vIEluaXRpYWxpemUgcmVuZGVyIHN0YXRlIHRvIGEga25vd24gc3RhcnQgc3RhdGVcblxuICAgICAgICAvLyBkZWZhdWx0IGJsZW5kIHN0YXRlXG4gICAgICAgIGdsLmRpc2FibGUoZ2wuQkxFTkQpO1xuICAgICAgICBnbC5ibGVuZEZ1bmMoZ2wuT05FLCBnbC5aRVJPKTtcbiAgICAgICAgZ2wuYmxlbmRFcXVhdGlvbihnbC5GVU5DX0FERCk7XG4gICAgICAgIGdsLmNvbG9yTWFzayh0cnVlLCB0cnVlLCB0cnVlLCB0cnVlKTtcblxuICAgICAgICB0aGlzLmJsZW5kQ29sb3IgPSBuZXcgQ29sb3IoMCwgMCwgMCwgMCk7XG4gICAgICAgIGdsLmJsZW5kQ29sb3IoMCwgMCwgMCwgMCk7XG5cbiAgICAgICAgZ2wuZW5hYmxlKGdsLkNVTExfRkFDRSk7XG4gICAgICAgIGdsLmN1bGxGYWNlKGdsLkJBQ0spO1xuXG4gICAgICAgIC8vIGRlZmF1bHQgZGVwdGggc3RhdGVcbiAgICAgICAgZ2wuZW5hYmxlKGdsLkRFUFRIX1RFU1QpO1xuICAgICAgICBnbC5kZXB0aEZ1bmMoZ2wuTEVRVUFMKTtcbiAgICAgICAgZ2wuZGVwdGhNYXNrKHRydWUpO1xuXG4gICAgICAgIHRoaXMuc3RlbmNpbCA9IGZhbHNlO1xuICAgICAgICBnbC5kaXNhYmxlKGdsLlNURU5DSUxfVEVTVCk7XG5cbiAgICAgICAgdGhpcy5zdGVuY2lsRnVuY0Zyb250ID0gdGhpcy5zdGVuY2lsRnVuY0JhY2sgPSBGVU5DX0FMV0FZUztcbiAgICAgICAgdGhpcy5zdGVuY2lsUmVmRnJvbnQgPSB0aGlzLnN0ZW5jaWxSZWZCYWNrID0gMDtcbiAgICAgICAgdGhpcy5zdGVuY2lsTWFza0Zyb250ID0gdGhpcy5zdGVuY2lsTWFza0JhY2sgPSAweEZGO1xuICAgICAgICBnbC5zdGVuY2lsRnVuYyhnbC5BTFdBWVMsIDAsIDB4RkYpO1xuXG4gICAgICAgIHRoaXMuc3RlbmNpbEZhaWxGcm9udCA9IHRoaXMuc3RlbmNpbEZhaWxCYWNrID0gU1RFTkNJTE9QX0tFRVA7XG4gICAgICAgIHRoaXMuc3RlbmNpbFpmYWlsRnJvbnQgPSB0aGlzLnN0ZW5jaWxaZmFpbEJhY2sgPSBTVEVOQ0lMT1BfS0VFUDtcbiAgICAgICAgdGhpcy5zdGVuY2lsWnBhc3NGcm9udCA9IHRoaXMuc3RlbmNpbFpwYXNzQmFjayA9IFNURU5DSUxPUF9LRUVQO1xuICAgICAgICB0aGlzLnN0ZW5jaWxXcml0ZU1hc2tGcm9udCA9IDB4RkY7XG4gICAgICAgIHRoaXMuc3RlbmNpbFdyaXRlTWFza0JhY2sgPSAweEZGO1xuICAgICAgICBnbC5zdGVuY2lsT3AoZ2wuS0VFUCwgZ2wuS0VFUCwgZ2wuS0VFUCk7XG4gICAgICAgIGdsLnN0ZW5jaWxNYXNrKDB4RkYpO1xuXG4gICAgICAgIHRoaXMuYWxwaGFUb0NvdmVyYWdlID0gZmFsc2U7XG4gICAgICAgIHRoaXMucmFzdGVyID0gdHJ1ZTtcbiAgICAgICAgaWYgKHRoaXMud2ViZ2wyKSB7XG4gICAgICAgICAgICBnbC5kaXNhYmxlKGdsLlNBTVBMRV9BTFBIQV9UT19DT1ZFUkFHRSk7XG4gICAgICAgICAgICBnbC5kaXNhYmxlKGdsLlJBU1RFUklaRVJfRElTQ0FSRCk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmRlcHRoQmlhc0VuYWJsZWQgPSBmYWxzZTtcbiAgICAgICAgZ2wuZGlzYWJsZShnbC5QT0xZR09OX09GRlNFVF9GSUxMKTtcblxuICAgICAgICB0aGlzLmNsZWFyRGVwdGggPSAxO1xuICAgICAgICBnbC5jbGVhckRlcHRoKDEpO1xuXG4gICAgICAgIHRoaXMuY2xlYXJDb2xvciA9IG5ldyBDb2xvcigwLCAwLCAwLCAwKTtcbiAgICAgICAgZ2wuY2xlYXJDb2xvcigwLCAwLCAwLCAwKTtcblxuICAgICAgICB0aGlzLmNsZWFyU3RlbmNpbCA9IDA7XG4gICAgICAgIGdsLmNsZWFyU3RlbmNpbCgwKTtcblxuICAgICAgICBpZiAodGhpcy53ZWJnbDIpIHtcbiAgICAgICAgICAgIGdsLmhpbnQoZ2wuRlJBR01FTlRfU0hBREVSX0RFUklWQVRJVkVfSElOVCwgZ2wuTklDRVNUKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGlmICh0aGlzLmV4dFN0YW5kYXJkRGVyaXZhdGl2ZXMpIHtcbiAgICAgICAgICAgICAgICBnbC5oaW50KHRoaXMuZXh0U3RhbmRhcmREZXJpdmF0aXZlcy5GUkFHTUVOVF9TSEFERVJfREVSSVZBVElWRV9ISU5UX09FUywgZ2wuTklDRVNUKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGdsLmVuYWJsZShnbC5TQ0lTU09SX1RFU1QpO1xuXG4gICAgICAgIGdsLnBpeGVsU3RvcmVpKGdsLlVOUEFDS19DT0xPUlNQQUNFX0NPTlZFUlNJT05fV0VCR0wsIGdsLk5PTkUpO1xuXG4gICAgICAgIHRoaXMudW5wYWNrRmxpcFkgPSBmYWxzZTtcbiAgICAgICAgZ2wucGl4ZWxTdG9yZWkoZ2wuVU5QQUNLX0ZMSVBfWV9XRUJHTCwgZmFsc2UpO1xuXG4gICAgICAgIHRoaXMudW5wYWNrUHJlbXVsdGlwbHlBbHBoYSA9IGZhbHNlO1xuICAgICAgICBnbC5waXhlbFN0b3JlaShnbC5VTlBBQ0tfUFJFTVVMVElQTFlfQUxQSEFfV0VCR0wsIGZhbHNlKTtcblxuICAgICAgICBnbC5waXhlbFN0b3JlaShnbC5VTlBBQ0tfQUxJR05NRU5ULCAxKTtcbiAgICB9XG5cbiAgICBpbml0aWFsaXplQ29udGV4dENhY2hlcygpIHtcbiAgICAgICAgc3VwZXIuaW5pdGlhbGl6ZUNvbnRleHRDYWNoZXMoKTtcblxuICAgICAgICAvLyBjYWNoZSBvZiBWQU9zXG4gICAgICAgIHRoaXMuX3Zhb01hcCA9IG5ldyBNYXAoKTtcblxuICAgICAgICB0aGlzLmJvdW5kVmFvID0gbnVsbDtcbiAgICAgICAgdGhpcy5hY3RpdmVGcmFtZWJ1ZmZlciA9IG51bGw7XG4gICAgICAgIHRoaXMuZmVlZGJhY2sgPSBudWxsO1xuICAgICAgICB0aGlzLnRyYW5zZm9ybUZlZWRiYWNrQnVmZmVyID0gbnVsbDtcblxuICAgICAgICB0aGlzLnRleHR1cmVVbml0ID0gMDtcbiAgICAgICAgdGhpcy50ZXh0dXJlVW5pdHMgPSBbXTtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLm1heENvbWJpbmVkVGV4dHVyZXM7IGkrKykge1xuICAgICAgICAgICAgdGhpcy50ZXh0dXJlVW5pdHMucHVzaChbbnVsbCwgbnVsbCwgbnVsbF0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ2FsbGVkIHdoZW4gdGhlIFdlYkdMIGNvbnRleHQgd2FzIGxvc3QuIEl0IHJlbGVhc2VzIGFsbCBjb250ZXh0IHJlbGF0ZWQgcmVzb3VyY2VzLlxuICAgICAqXG4gICAgICogQGlnbm9yZVxuICAgICAqL1xuICAgIGxvc2VDb250ZXh0KCkge1xuXG4gICAgICAgIC8vIGZvcmNlIHRoZSBiYWNrYnVmZmVyIHRvIGJlIHJlY3JlYXRlZCBvbiByZXN0b3JlXG4gICAgICAgIHRoaXMuYmFja0J1ZmZlclNpemUuc2V0KC0xLCAtMSk7XG5cbiAgICAgICAgLy8gcmVsZWFzZSBzaGFkZXJzXG4gICAgICAgIGZvciAoY29uc3Qgc2hhZGVyIG9mIHRoaXMuc2hhZGVycykge1xuICAgICAgICAgICAgc2hhZGVyLmxvc2VDb250ZXh0KCk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyByZWxlYXNlIHRleHR1cmVzXG4gICAgICAgIGZvciAoY29uc3QgdGV4dHVyZSBvZiB0aGlzLnRleHR1cmVzKSB7XG4gICAgICAgICAgICB0ZXh0dXJlLmxvc2VDb250ZXh0KCk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyByZWxlYXNlIHZlcnRleCBhbmQgaW5kZXggYnVmZmVyc1xuICAgICAgICBmb3IgKGNvbnN0IGJ1ZmZlciBvZiB0aGlzLmJ1ZmZlcnMpIHtcbiAgICAgICAgICAgIGJ1ZmZlci5sb3NlQ29udGV4dCgpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gUmVzZXQgYWxsIHJlbmRlciB0YXJnZXRzIHNvIHRoZXknbGwgYmUgcmVjcmVhdGVkIGFzIHJlcXVpcmVkLlxuICAgICAgICAvLyBUT0RPOiBhIHNvbHV0aW9uIGZvciB0aGUgY2FzZSB3aGVyZSBhIHJlbmRlciB0YXJnZXQgY29udGFpbnMgc29tZXRoaW5nXG4gICAgICAgIC8vIHRoYXQgd2FzIHByZXZpb3VzbHkgZ2VuZXJhdGVkIHRoYXQgbmVlZHMgdG8gYmUgcmUtcmVuZGVyZWQuXG4gICAgICAgIGZvciAoY29uc3QgdGFyZ2V0IG9mIHRoaXMudGFyZ2V0cykge1xuICAgICAgICAgICAgdGFyZ2V0Lmxvc2VDb250ZXh0KCk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmdwdVByb2ZpbGVyPy5sb3NlQ29udGV4dCgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENhbGxlZCB3aGVuIHRoZSBXZWJHTCBjb250ZXh0IGlzIHJlc3RvcmVkLiBJdCByZWluaXRpYWxpemVzIGFsbCBjb250ZXh0IHJlbGF0ZWQgcmVzb3VyY2VzLlxuICAgICAqXG4gICAgICogQGlnbm9yZVxuICAgICAqL1xuICAgIHJlc3RvcmVDb250ZXh0KCkge1xuICAgICAgICB0aGlzLmluaXRpYWxpemVFeHRlbnNpb25zKCk7XG4gICAgICAgIHRoaXMuaW5pdGlhbGl6ZUNhcGFiaWxpdGllcygpO1xuICAgICAgICB0aGlzLmluaXRpYWxpemVSZW5kZXJTdGF0ZSgpO1xuICAgICAgICB0aGlzLmluaXRpYWxpemVDb250ZXh0Q2FjaGVzKCk7XG5cbiAgICAgICAgLy8gUmVjb21waWxlIGFsbCBzaGFkZXJzICh0aGV5J2xsIGJlIGxpbmtlZCB3aGVuIHRoZXkncmUgbmV4dCBhY3R1YWxseSB1c2VkKVxuICAgICAgICBmb3IgKGNvbnN0IHNoYWRlciBvZiB0aGlzLnNoYWRlcnMpIHtcbiAgICAgICAgICAgIHNoYWRlci5yZXN0b3JlQ29udGV4dCgpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gUmVjcmVhdGUgYnVmZmVyIG9iamVjdHMgYW5kIHJldXBsb2FkIGJ1ZmZlciBkYXRhIHRvIHRoZSBHUFVcbiAgICAgICAgZm9yIChjb25zdCBidWZmZXIgb2YgdGhpcy5idWZmZXJzKSB7XG4gICAgICAgICAgICBidWZmZXIudW5sb2NrKCk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmdwdVByb2ZpbGVyPy5yZXN0b3JlQ29udGV4dCgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENhbGxlZCBhZnRlciBhIGJhdGNoIG9mIHNoYWRlcnMgd2FzIGNyZWF0ZWQsIHRvIGd1aWRlIGluIHRoZWlyIG9wdGltYWwgcHJlcGFyYXRpb24gZm9yIHJlbmRlcmluZy5cbiAgICAgKlxuICAgICAqIEBpZ25vcmVcbiAgICAgKi9cbiAgICBlbmRTaGFkZXJCYXRjaCgpIHtcbiAgICAgICAgV2ViZ2xTaGFkZXIuZW5kU2hhZGVyQmF0Y2godGhpcyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0IHRoZSBhY3RpdmUgcmVjdGFuZ2xlIGZvciByZW5kZXJpbmcgb24gdGhlIHNwZWNpZmllZCBkZXZpY2UuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge251bWJlcn0geCAtIFRoZSBwaXhlbCBzcGFjZSB4LWNvb3JkaW5hdGUgb2YgdGhlIGJvdHRvbSBsZWZ0IGNvcm5lciBvZiB0aGUgdmlld3BvcnQuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHkgLSBUaGUgcGl4ZWwgc3BhY2UgeS1jb29yZGluYXRlIG9mIHRoZSBib3R0b20gbGVmdCBjb3JuZXIgb2YgdGhlIHZpZXdwb3J0LlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSB3IC0gVGhlIHdpZHRoIG9mIHRoZSB2aWV3cG9ydCBpbiBwaXhlbHMuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGggLSBUaGUgaGVpZ2h0IG9mIHRoZSB2aWV3cG9ydCBpbiBwaXhlbHMuXG4gICAgICovXG4gICAgc2V0Vmlld3BvcnQoeCwgeSwgdywgaCkge1xuICAgICAgICBpZiAoKHRoaXMudnggIT09IHgpIHx8ICh0aGlzLnZ5ICE9PSB5KSB8fCAodGhpcy52dyAhPT0gdykgfHwgKHRoaXMudmggIT09IGgpKSB7XG4gICAgICAgICAgICB0aGlzLmdsLnZpZXdwb3J0KHgsIHksIHcsIGgpO1xuICAgICAgICAgICAgdGhpcy52eCA9IHg7XG4gICAgICAgICAgICB0aGlzLnZ5ID0geTtcbiAgICAgICAgICAgIHRoaXMudncgPSB3O1xuICAgICAgICAgICAgdGhpcy52aCA9IGg7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXQgdGhlIGFjdGl2ZSBzY2lzc29yIHJlY3RhbmdsZSBvbiB0aGUgc3BlY2lmaWVkIGRldmljZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSB4IC0gVGhlIHBpeGVsIHNwYWNlIHgtY29vcmRpbmF0ZSBvZiB0aGUgYm90dG9tIGxlZnQgY29ybmVyIG9mIHRoZSBzY2lzc29yIHJlY3RhbmdsZS5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0geSAtIFRoZSBwaXhlbCBzcGFjZSB5LWNvb3JkaW5hdGUgb2YgdGhlIGJvdHRvbSBsZWZ0IGNvcm5lciBvZiB0aGUgc2Npc3NvciByZWN0YW5nbGUuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHcgLSBUaGUgd2lkdGggb2YgdGhlIHNjaXNzb3IgcmVjdGFuZ2xlIGluIHBpeGVscy5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gaCAtIFRoZSBoZWlnaHQgb2YgdGhlIHNjaXNzb3IgcmVjdGFuZ2xlIGluIHBpeGVscy5cbiAgICAgKi9cbiAgICBzZXRTY2lzc29yKHgsIHksIHcsIGgpIHtcbiAgICAgICAgaWYgKCh0aGlzLnN4ICE9PSB4KSB8fCAodGhpcy5zeSAhPT0geSkgfHwgKHRoaXMuc3cgIT09IHcpIHx8ICh0aGlzLnNoICE9PSBoKSkge1xuICAgICAgICAgICAgdGhpcy5nbC5zY2lzc29yKHgsIHksIHcsIGgpO1xuICAgICAgICAgICAgdGhpcy5zeCA9IHg7XG4gICAgICAgICAgICB0aGlzLnN5ID0geTtcbiAgICAgICAgICAgIHRoaXMuc3cgPSB3O1xuICAgICAgICAgICAgdGhpcy5zaCA9IGg7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBCaW5kcyB0aGUgc3BlY2lmaWVkIGZyYW1lYnVmZmVyIG9iamVjdC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7V2ViR0xGcmFtZWJ1ZmZlciB8IG51bGx9IGZiIC0gVGhlIGZyYW1lYnVmZmVyIHRvIGJpbmQuXG4gICAgICogQGlnbm9yZVxuICAgICAqL1xuICAgIHNldEZyYW1lYnVmZmVyKGZiKSB7XG4gICAgICAgIGlmICh0aGlzLmFjdGl2ZUZyYW1lYnVmZmVyICE9PSBmYikge1xuICAgICAgICAgICAgY29uc3QgZ2wgPSB0aGlzLmdsO1xuICAgICAgICAgICAgZ2wuYmluZEZyYW1lYnVmZmVyKGdsLkZSQU1FQlVGRkVSLCBmYik7XG4gICAgICAgICAgICB0aGlzLmFjdGl2ZUZyYW1lYnVmZmVyID0gZmI7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDb3BpZXMgc291cmNlIHJlbmRlciB0YXJnZXQgaW50byBkZXN0aW5hdGlvbiByZW5kZXIgdGFyZ2V0LiBNb3N0bHkgdXNlZCBieSBwb3N0LWVmZmVjdHMuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1JlbmRlclRhcmdldH0gW3NvdXJjZV0gLSBUaGUgc291cmNlIHJlbmRlciB0YXJnZXQuIERlZmF1bHRzIHRvIGZyYW1lIGJ1ZmZlci5cbiAgICAgKiBAcGFyYW0ge1JlbmRlclRhcmdldH0gW2Rlc3RdIC0gVGhlIGRlc3RpbmF0aW9uIHJlbmRlciB0YXJnZXQuIERlZmF1bHRzIHRvIGZyYW1lIGJ1ZmZlci5cbiAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IFtjb2xvcl0gLSBJZiB0cnVlIHdpbGwgY29weSB0aGUgY29sb3IgYnVmZmVyLiBEZWZhdWx0cyB0byBmYWxzZS5cbiAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IFtkZXB0aF0gLSBJZiB0cnVlIHdpbGwgY29weSB0aGUgZGVwdGggYnVmZmVyLiBEZWZhdWx0cyB0byBmYWxzZS5cbiAgICAgKiBAcmV0dXJucyB7Ym9vbGVhbn0gVHJ1ZSBpZiB0aGUgY29weSB3YXMgc3VjY2Vzc2Z1bCwgZmFsc2Ugb3RoZXJ3aXNlLlxuICAgICAqL1xuICAgIGNvcHlSZW5kZXJUYXJnZXQoc291cmNlLCBkZXN0LCBjb2xvciwgZGVwdGgpIHtcbiAgICAgICAgY29uc3QgZ2wgPSB0aGlzLmdsO1xuXG4gICAgICAgIC8vIGlmIGNvcHlpbmcgZnJvbSB0aGUgYmFja2J1ZmZlclxuICAgICAgICBpZiAoc291cmNlID09PSB0aGlzLmJhY2tCdWZmZXIpIHtcbiAgICAgICAgICAgIHNvdXJjZSA9IG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIXRoaXMud2ViZ2wyICYmIGRlcHRoKSB7XG4gICAgICAgICAgICBEZWJ1Zy5lcnJvcihcIkRlcHRoIGlzIG5vdCBjb3B5YWJsZSBvbiBXZWJHTCAxLjBcIik7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGNvbG9yKSB7XG4gICAgICAgICAgICBpZiAoIWRlc3QpIHtcbiAgICAgICAgICAgICAgICAvLyBjb3B5aW5nIHRvIGJhY2tidWZmZXJcbiAgICAgICAgICAgICAgICBpZiAoIXNvdXJjZS5fY29sb3JCdWZmZXIpIHtcbiAgICAgICAgICAgICAgICAgICAgRGVidWcuZXJyb3IoXCJDYW4ndCBjb3B5IGVtcHR5IGNvbG9yIGJ1ZmZlciB0byBiYWNrYnVmZmVyXCIpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIGlmIChzb3VyY2UpIHtcbiAgICAgICAgICAgICAgICAvLyBjb3B5aW5nIHRvIHJlbmRlciB0YXJnZXRcbiAgICAgICAgICAgICAgICBpZiAoIXNvdXJjZS5fY29sb3JCdWZmZXIgfHwgIWRlc3QuX2NvbG9yQnVmZmVyKSB7XG4gICAgICAgICAgICAgICAgICAgIERlYnVnLmVycm9yKFwiQ2FuJ3QgY29weSBjb2xvciBidWZmZXIsIGJlY2F1c2Ugb25lIG9mIHRoZSByZW5kZXIgdGFyZ2V0cyBkb2Vzbid0IGhhdmUgaXRcIik7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKHNvdXJjZS5fY29sb3JCdWZmZXIuX2Zvcm1hdCAhPT0gZGVzdC5fY29sb3JCdWZmZXIuX2Zvcm1hdCkge1xuICAgICAgICAgICAgICAgICAgICBEZWJ1Zy5lcnJvcihcIkNhbid0IGNvcHkgcmVuZGVyIHRhcmdldHMgb2YgZGlmZmVyZW50IGNvbG9yIGZvcm1hdHNcIik7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGRlcHRoICYmIHNvdXJjZSkge1xuICAgICAgICAgICAgaWYgKCFzb3VyY2UuX2RlcHRoKSB7ICAgLy8gd2hlbiBkZXB0aCBpcyBhdXRvbWF0aWMsIHdlIGNhbm5vdCB0ZXN0IHRoZSBidWZmZXIgbm9yIGl0cyBmb3JtYXRcbiAgICAgICAgICAgICAgICBpZiAoIXNvdXJjZS5fZGVwdGhCdWZmZXIgfHwgIWRlc3QuX2RlcHRoQnVmZmVyKSB7XG4gICAgICAgICAgICAgICAgICAgIERlYnVnLmVycm9yKFwiQ2FuJ3QgY29weSBkZXB0aCBidWZmZXIsIGJlY2F1c2Ugb25lIG9mIHRoZSByZW5kZXIgdGFyZ2V0cyBkb2Vzbid0IGhhdmUgaXRcIik7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKHNvdXJjZS5fZGVwdGhCdWZmZXIuX2Zvcm1hdCAhPT0gZGVzdC5fZGVwdGhCdWZmZXIuX2Zvcm1hdCkge1xuICAgICAgICAgICAgICAgICAgICBEZWJ1Zy5lcnJvcihcIkNhbid0IGNvcHkgcmVuZGVyIHRhcmdldHMgb2YgZGlmZmVyZW50IGRlcHRoIGZvcm1hdHNcIik7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBEZWJ1Z0dyYXBoaWNzLnB1c2hHcHVNYXJrZXIodGhpcywgJ0NPUFktUlQnKTtcblxuICAgICAgICBpZiAodGhpcy53ZWJnbDIgJiYgZGVzdCkge1xuICAgICAgICAgICAgY29uc3QgcHJldlJ0ID0gdGhpcy5yZW5kZXJUYXJnZXQ7XG4gICAgICAgICAgICB0aGlzLnJlbmRlclRhcmdldCA9IGRlc3Q7XG4gICAgICAgICAgICB0aGlzLnVwZGF0ZUJlZ2luKCk7XG5cbiAgICAgICAgICAgIC8vIGNvcHkgZnJvbSBzaW5nbGUgc2FtcGxlZCBmcmFtZWJ1ZmZlclxuICAgICAgICAgICAgY29uc3Qgc3JjID0gc291cmNlID8gc291cmNlLmltcGwuX2dsRnJhbWVCdWZmZXIgOiB0aGlzLmJhY2tCdWZmZXI/LmltcGwuX2dsRnJhbWVCdWZmZXI7XG5cbiAgICAgICAgICAgIGNvbnN0IGRzdCA9IGRlc3QuaW1wbC5fZ2xGcmFtZUJ1ZmZlcjtcbiAgICAgICAgICAgIERlYnVnLmFzc2VydChzcmMgIT09IGRzdCwgJ1NvdXJjZSBhbmQgZGVzdGluYXRpb24gZnJhbWVidWZmZXJzIG11c3QgYmUgZGlmZmVyZW50IHdoZW4gYmxpdHRpbmcuJyk7XG5cbiAgICAgICAgICAgIGdsLmJpbmRGcmFtZWJ1ZmZlcihnbC5SRUFEX0ZSQU1FQlVGRkVSLCBzcmMpO1xuICAgICAgICAgICAgZ2wuYmluZEZyYW1lYnVmZmVyKGdsLkRSQVdfRlJBTUVCVUZGRVIsIGRzdCk7XG4gICAgICAgICAgICBjb25zdCB3ID0gc291cmNlID8gc291cmNlLndpZHRoIDogZGVzdC53aWR0aDtcbiAgICAgICAgICAgIGNvbnN0IGggPSBzb3VyY2UgPyBzb3VyY2UuaGVpZ2h0IDogZGVzdC5oZWlnaHQ7XG5cbiAgICAgICAgICAgIGdsLmJsaXRGcmFtZWJ1ZmZlcigwLCAwLCB3LCBoLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDAsIDAsIHcsIGgsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKGNvbG9yID8gZ2wuQ09MT1JfQlVGRkVSX0JJVCA6IDApIHwgKGRlcHRoID8gZ2wuREVQVEhfQlVGRkVSX0JJVCA6IDApLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGdsLk5FQVJFU1QpO1xuXG4gICAgICAgICAgICAvLyBUT0RPOiBub3Qgc3VyZSB3ZSBuZWVkIHRvIHJlc3RvcmUgdGhlIHByZXYgdGFyZ2V0LCBhcyB0aGlzIG9ubHkgc2hvdWxkIHJ1biBpbi1iZXR3ZWVuIHJlbmRlciBwYXNzZXNcbiAgICAgICAgICAgIHRoaXMucmVuZGVyVGFyZ2V0ID0gcHJldlJ0O1xuICAgICAgICAgICAgZ2wuYmluZEZyYW1lYnVmZmVyKGdsLkZSQU1FQlVGRkVSLCBwcmV2UnQgPyBwcmV2UnQuaW1wbC5fZ2xGcmFtZUJ1ZmZlciA6IG51bGwpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc3Qgc2hhZGVyID0gdGhpcy5nZXRDb3B5U2hhZGVyKCk7XG4gICAgICAgICAgICB0aGlzLmNvbnN0YW50VGV4U291cmNlLnNldFZhbHVlKHNvdXJjZS5fY29sb3JCdWZmZXIpO1xuICAgICAgICAgICAgcXVhZFdpdGhTaGFkZXIodGhpcywgZGVzdCwgc2hhZGVyKTtcbiAgICAgICAgfVxuXG4gICAgICAgIERlYnVnR3JhcGhpY3MucG9wR3B1TWFya2VyKHRoaXMpO1xuXG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEdldCBjb3B5IHNoYWRlciBmb3IgZWZmaWNpZW50IHJlbmRlcmluZyBvZiBmdWxsc2NyZWVuLXF1YWQgd2l0aCB0ZXh0dXJlLlxuICAgICAqXG4gICAgICogQHJldHVybnMge1NoYWRlcn0gVGhlIGNvcHkgc2hhZGVyIChiYXNlZCBvbiBgZnVsbHNjcmVlblF1YWRWU2AgYW5kIGBvdXRwdXRUZXgyRFBTYCBpblxuICAgICAqIGBzaGFkZXJDaHVua3NgKS5cbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgZ2V0Q29weVNoYWRlcigpIHtcbiAgICAgICAgaWYgKCF0aGlzLl9jb3B5U2hhZGVyKSB7XG4gICAgICAgICAgICB0aGlzLl9jb3B5U2hhZGVyID0gbmV3IFNoYWRlcih0aGlzLCBTaGFkZXJVdGlscy5jcmVhdGVEZWZpbml0aW9uKHRoaXMsIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnb3V0cHV0VGV4MkQnLFxuICAgICAgICAgICAgICAgIHZlcnRleENvZGU6IF9mdWxsU2NyZWVuUXVhZFZTLFxuICAgICAgICAgICAgICAgIGZyYWdtZW50Q29kZTogX291dHB1dFRleHR1cmUyRFxuICAgICAgICAgICAgfSkpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLl9jb3B5U2hhZGVyO1xuICAgIH1cblxuICAgIGZyYW1lU3RhcnQoKSB7XG4gICAgICAgIHN1cGVyLmZyYW1lU3RhcnQoKTtcblxuICAgICAgICB0aGlzLnVwZGF0ZUJhY2tidWZmZXIoKTtcblxuICAgICAgICB0aGlzLmdwdVByb2ZpbGVyLmZyYW1lU3RhcnQoKTtcbiAgICB9XG5cbiAgICBmcmFtZUVuZCgpIHtcbiAgICAgICAgc3VwZXIuZnJhbWVFbmQoKTtcbiAgICAgICAgdGhpcy5ncHVQcm9maWxlci5mcmFtZUVuZCgpO1xuICAgICAgICB0aGlzLmdwdVByb2ZpbGVyLnJlcXVlc3QoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTdGFydCBhIHJlbmRlciBwYXNzLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4uL3JlbmRlci1wYXNzLmpzJykuUmVuZGVyUGFzc30gcmVuZGVyUGFzcyAtIFRoZSByZW5kZXIgcGFzcyB0byBzdGFydC5cbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgc3RhcnRQYXNzKHJlbmRlclBhc3MpIHtcblxuICAgICAgICBEZWJ1Z0dyYXBoaWNzLnB1c2hHcHVNYXJrZXIodGhpcywgYFNUQVJULVBBU1NgKTtcblxuICAgICAgICAvLyBzZXQgdXAgcmVuZGVyIHRhcmdldFxuICAgICAgICBjb25zdCBydCA9IHJlbmRlclBhc3MucmVuZGVyVGFyZ2V0IHx8IHRoaXMuYmFja0J1ZmZlcjtcbiAgICAgICAgdGhpcy5yZW5kZXJUYXJnZXQgPSBydDtcbiAgICAgICAgRGVidWcuYXNzZXJ0KHJ0KTtcblxuICAgICAgICB0aGlzLnVwZGF0ZUJlZ2luKCk7XG5cbiAgICAgICAgLy8gY2xlYXIgdGhlIHJlbmRlciB0YXJnZXRcbiAgICAgICAgY29uc3QgY29sb3JPcHMgPSByZW5kZXJQYXNzLmNvbG9yT3BzO1xuICAgICAgICBjb25zdCBkZXB0aFN0ZW5jaWxPcHMgPSByZW5kZXJQYXNzLmRlcHRoU3RlbmNpbE9wcztcbiAgICAgICAgaWYgKGNvbG9yT3BzPy5jbGVhciB8fCBkZXB0aFN0ZW5jaWxPcHMuY2xlYXJEZXB0aCB8fCBkZXB0aFN0ZW5jaWxPcHMuY2xlYXJTdGVuY2lsKSB7XG5cbiAgICAgICAgICAgIC8vIHRoZSBwYXNzIGFsd2F5cyBjbGVhcnMgZnVsbCB0YXJnZXRcbiAgICAgICAgICAgIGNvbnN0IHJ0ID0gcmVuZGVyUGFzcy5yZW5kZXJUYXJnZXQ7XG4gICAgICAgICAgICBjb25zdCB3aWR0aCA9IHJ0ID8gcnQud2lkdGggOiB0aGlzLndpZHRoO1xuICAgICAgICAgICAgY29uc3QgaGVpZ2h0ID0gcnQgPyBydC5oZWlnaHQgOiB0aGlzLmhlaWdodDtcbiAgICAgICAgICAgIHRoaXMuc2V0Vmlld3BvcnQoMCwgMCwgd2lkdGgsIGhlaWdodCk7XG4gICAgICAgICAgICB0aGlzLnNldFNjaXNzb3IoMCwgMCwgd2lkdGgsIGhlaWdodCk7XG5cbiAgICAgICAgICAgIGxldCBjbGVhckZsYWdzID0gMDtcbiAgICAgICAgICAgIGNvbnN0IGNsZWFyT3B0aW9ucyA9IHt9O1xuXG4gICAgICAgICAgICBpZiAoY29sb3JPcHM/LmNsZWFyKSB7XG4gICAgICAgICAgICAgICAgY2xlYXJGbGFncyB8PSBDTEVBUkZMQUdfQ09MT1I7XG4gICAgICAgICAgICAgICAgY2xlYXJPcHRpb25zLmNvbG9yID0gW2NvbG9yT3BzLmNsZWFyVmFsdWUuciwgY29sb3JPcHMuY2xlYXJWYWx1ZS5nLCBjb2xvck9wcy5jbGVhclZhbHVlLmIsIGNvbG9yT3BzLmNsZWFyVmFsdWUuYV07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChkZXB0aFN0ZW5jaWxPcHMuY2xlYXJEZXB0aCkge1xuICAgICAgICAgICAgICAgIGNsZWFyRmxhZ3MgfD0gQ0xFQVJGTEFHX0RFUFRIO1xuICAgICAgICAgICAgICAgIGNsZWFyT3B0aW9ucy5kZXB0aCA9IGRlcHRoU3RlbmNpbE9wcy5jbGVhckRlcHRoVmFsdWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChkZXB0aFN0ZW5jaWxPcHMuY2xlYXJTdGVuY2lsKSB7XG4gICAgICAgICAgICAgICAgY2xlYXJGbGFncyB8PSBDTEVBUkZMQUdfU1RFTkNJTDtcbiAgICAgICAgICAgICAgICBjbGVhck9wdGlvbnMuc3RlbmNpbCA9IGRlcHRoU3RlbmNpbE9wcy5jbGVhclN0ZW5jaWxWYWx1ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gY2xlYXIgaXRcbiAgICAgICAgICAgIGNsZWFyT3B0aW9ucy5mbGFncyA9IGNsZWFyRmxhZ3M7XG4gICAgICAgICAgICB0aGlzLmNsZWFyKGNsZWFyT3B0aW9ucyk7XG4gICAgICAgIH1cblxuICAgICAgICBEZWJ1Zy5jYWxsKCgpID0+IHtcbiAgICAgICAgICAgIGlmICh0aGlzLmluc2lkZVJlbmRlclBhc3MpIHtcbiAgICAgICAgICAgICAgICBEZWJ1Zy5lcnJvck9uY2UoJ1JlbmRlclBhc3MgY2Fubm90IGJlIHN0YXJ0ZWQgd2hpbGUgaW5zaWRlIGFub3RoZXIgcmVuZGVyIHBhc3MuJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLmluc2lkZVJlbmRlclBhc3MgPSB0cnVlO1xuXG4gICAgICAgIERlYnVnR3JhcGhpY3MucG9wR3B1TWFya2VyKHRoaXMpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEVuZCBhIHJlbmRlciBwYXNzLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4uL3JlbmRlci1wYXNzLmpzJykuUmVuZGVyUGFzc30gcmVuZGVyUGFzcyAtIFRoZSByZW5kZXIgcGFzcyB0byBlbmQuXG4gICAgICogQGlnbm9yZVxuICAgICAqL1xuICAgIGVuZFBhc3MocmVuZGVyUGFzcykge1xuXG4gICAgICAgIERlYnVnR3JhcGhpY3MucHVzaEdwdU1hcmtlcih0aGlzLCBgRU5ELVBBU1NgKTtcblxuICAgICAgICB0aGlzLnVuYmluZFZlcnRleEFycmF5KCk7XG5cbiAgICAgICAgY29uc3QgdGFyZ2V0ID0gdGhpcy5yZW5kZXJUYXJnZXQ7XG4gICAgICAgIGNvbnN0IGNvbG9yQnVmZmVyQ291bnQgPSByZW5kZXJQYXNzLmNvbG9yQXJyYXlPcHMubGVuZ3RoO1xuICAgICAgICBpZiAodGFyZ2V0KSB7XG5cbiAgICAgICAgICAgIC8vIGludmFsaWRhdGUgYnVmZmVycyB0byBzdG9wIHRoZW0gYmVpbmcgd3JpdHRlbiB0byBvbiB0aWxlZCBhcmNoaXRlY3R1cmVzXG4gICAgICAgICAgICBpZiAodGhpcy53ZWJnbDIpIHtcbiAgICAgICAgICAgICAgICBpbnZhbGlkYXRlQXR0YWNobWVudHMubGVuZ3RoID0gMDtcbiAgICAgICAgICAgICAgICBjb25zdCBnbCA9IHRoaXMuZ2w7XG5cbiAgICAgICAgICAgICAgICAvLyBjb2xvciBidWZmZXJzXG4gICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjb2xvckJ1ZmZlckNvdW50OyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY29sb3JPcHMgPSByZW5kZXJQYXNzLmNvbG9yQXJyYXlPcHNbaV07XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gaW52YWxpZGF0ZSBjb2xvciBvbmx5IGlmIHdlIGRvbid0IG5lZWQgdG8gcmVzb2x2ZSBpdFxuICAgICAgICAgICAgICAgICAgICBpZiAoIShjb2xvck9wcy5zdG9yZSB8fCBjb2xvck9wcy5yZXNvbHZlKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaW52YWxpZGF0ZUF0dGFjaG1lbnRzLnB1c2goZ2wuQ09MT1JfQVRUQUNITUVOVDAgKyBpKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIHdlIGNhbm5vdCBpbnZhbGlkYXRlIGRlcHRoL3N0ZW5jaWwgYnVmZmVycyBvZiB0aGUgYmFja2J1ZmZlclxuICAgICAgICAgICAgICAgIGlmICh0YXJnZXQgIT09IHRoaXMuYmFja0J1ZmZlcikge1xuICAgICAgICAgICAgICAgICAgICBpZiAoIXJlbmRlclBhc3MuZGVwdGhTdGVuY2lsT3BzLnN0b3JlRGVwdGgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGludmFsaWRhdGVBdHRhY2htZW50cy5wdXNoKGdsLkRFUFRIX0FUVEFDSE1FTlQpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGlmICghcmVuZGVyUGFzcy5kZXB0aFN0ZW5jaWxPcHMuc3RvcmVTdGVuY2lsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpbnZhbGlkYXRlQXR0YWNobWVudHMucHVzaChnbC5TVEVOQ0lMX0FUVEFDSE1FTlQpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKGludmFsaWRhdGVBdHRhY2htZW50cy5sZW5ndGggPiAwKSB7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gaW52YWxpZGF0ZSB0aGUgd2hvbGUgYnVmZmVyXG4gICAgICAgICAgICAgICAgICAgIC8vIFRPRE86IHdlIGNvdWxkIGhhbmRsZSB2aWV3cG9ydCBpbnZhbGlkYXRpb24gYXMgd2VsbFxuICAgICAgICAgICAgICAgICAgICBpZiAocmVuZGVyUGFzcy5mdWxsU2l6ZUNsZWFyUmVjdCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZ2wuaW52YWxpZGF0ZUZyYW1lYnVmZmVyKGdsLkRSQVdfRlJBTUVCVUZGRVIsIGludmFsaWRhdGVBdHRhY2htZW50cyk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIHJlc29sdmUgdGhlIGNvbG9yIGJ1ZmZlciAodGhpcyByZXNvbHZlcyBhbGwgTVJUIGNvbG9yIGJ1ZmZlcnMgYXQgb25jZSlcbiAgICAgICAgICAgIGlmIChyZW5kZXJQYXNzLmNvbG9yT3BzPy5yZXNvbHZlKSB7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMud2ViZ2wyICYmIHJlbmRlclBhc3Muc2FtcGxlcyA+IDEgJiYgdGFyZ2V0LmF1dG9SZXNvbHZlKSB7XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldC5yZXNvbHZlKHRydWUsIGZhbHNlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIGdlbmVyYXRlIG1pcG1hcHNcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgY29sb3JCdWZmZXJDb3VudDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgY29sb3JPcHMgPSByZW5kZXJQYXNzLmNvbG9yQXJyYXlPcHNbaV07XG4gICAgICAgICAgICAgICAgaWYgKGNvbG9yT3BzLm1pcG1hcHMpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY29sb3JCdWZmZXIgPSB0YXJnZXQuX2NvbG9yQnVmZmVyc1tpXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNvbG9yQnVmZmVyICYmIGNvbG9yQnVmZmVyLmltcGwuX2dsVGV4dHVyZSAmJiBjb2xvckJ1ZmZlci5taXBtYXBzICYmIChjb2xvckJ1ZmZlci5wb3QgfHwgdGhpcy53ZWJnbDIpKSB7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIERlYnVnR3JhcGhpY3MucHVzaEdwdU1hcmtlcih0aGlzLCBgTUlQUyR7aX1gKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5hY3RpdmVUZXh0dXJlKHRoaXMubWF4Q29tYmluZWRUZXh0dXJlcyAtIDEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5iaW5kVGV4dHVyZShjb2xvckJ1ZmZlcik7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmdsLmdlbmVyYXRlTWlwbWFwKGNvbG9yQnVmZmVyLmltcGwuX2dsVGFyZ2V0KTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgRGVidWdHcmFwaGljcy5wb3BHcHVNYXJrZXIodGhpcyk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmluc2lkZVJlbmRlclBhc3MgPSBmYWxzZTtcblxuICAgICAgICBEZWJ1Z0dyYXBoaWNzLnBvcEdwdU1hcmtlcih0aGlzKTtcbiAgICB9XG5cbiAgICBzZXQgZGVmYXVsdEZyYW1lYnVmZmVyKHZhbHVlKSB7XG4gICAgICAgIGlmICh0aGlzLl9kZWZhdWx0RnJhbWVidWZmZXIgIT09IHZhbHVlKSB7XG4gICAgICAgICAgICB0aGlzLl9kZWZhdWx0RnJhbWVidWZmZXIgPSB2YWx1ZTtcbiAgICAgICAgICAgIHRoaXMuX2RlZmF1bHRGcmFtZWJ1ZmZlckNoYW5nZWQgPSB0cnVlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2V0IGRlZmF1bHRGcmFtZWJ1ZmZlcigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2RlZmF1bHRGcmFtZWJ1ZmZlcjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNYXJrcyB0aGUgYmVnaW5uaW5nIG9mIGEgYmxvY2sgb2YgcmVuZGVyaW5nLiBJbnRlcm5hbGx5LCB0aGlzIGZ1bmN0aW9uIGJpbmRzIHRoZSByZW5kZXJcbiAgICAgKiB0YXJnZXQgY3VycmVudGx5IHNldCBvbiB0aGUgZGV2aWNlLiBUaGlzIGZ1bmN0aW9uIHNob3VsZCBiZSBtYXRjaGVkIHdpdGggYSBjYWxsIHRvXG4gICAgICoge0BsaW5rIEdyYXBoaWNzRGV2aWNlI3VwZGF0ZUVuZH0uIENhbGxzIHRvIHtAbGluayBHcmFwaGljc0RldmljZSN1cGRhdGVCZWdpbn0gYW5kXG4gICAgICoge0BsaW5rIEdyYXBoaWNzRGV2aWNlI3VwZGF0ZUVuZH0gbXVzdCBub3QgYmUgbmVzdGVkLlxuICAgICAqXG4gICAgICogQGlnbm9yZVxuICAgICAqL1xuICAgIHVwZGF0ZUJlZ2luKCkge1xuICAgICAgICBEZWJ1Z0dyYXBoaWNzLnB1c2hHcHVNYXJrZXIodGhpcywgJ1VQREFURS1CRUdJTicpO1xuXG4gICAgICAgIHRoaXMuYm91bmRWYW8gPSBudWxsO1xuXG4gICAgICAgIC8vIGNsZWFyIHRleHR1cmUgdW5pdHMgb25jZSBhIGZyYW1lIG9uIGRlc2t0b3Agc2FmYXJpXG4gICAgICAgIGlmICh0aGlzLl90ZW1wRW5hYmxlU2FmYXJpVGV4dHVyZVVuaXRXb3JrYXJvdW5kKSB7XG4gICAgICAgICAgICBmb3IgKGxldCB1bml0ID0gMDsgdW5pdCA8IHRoaXMudGV4dHVyZVVuaXRzLmxlbmd0aDsgKyt1bml0KSB7XG4gICAgICAgICAgICAgICAgZm9yIChsZXQgc2xvdCA9IDA7IHNsb3QgPCAzOyArK3Nsb3QpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50ZXh0dXJlVW5pdHNbdW5pdF1bc2xvdF0gPSBudWxsO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFNldCB0aGUgcmVuZGVyIHRhcmdldFxuICAgICAgICBjb25zdCB0YXJnZXQgPSB0aGlzLnJlbmRlclRhcmdldCA/PyB0aGlzLmJhY2tCdWZmZXI7XG4gICAgICAgIERlYnVnLmFzc2VydCh0YXJnZXQpO1xuXG4gICAgICAgIC8vIEluaXRpYWxpemUgdGhlIGZyYW1lYnVmZmVyXG4gICAgICAgIGNvbnN0IHRhcmdldEltcGwgPSB0YXJnZXQuaW1wbDtcbiAgICAgICAgaWYgKCF0YXJnZXRJbXBsLmluaXRpYWxpemVkKSB7XG4gICAgICAgICAgICB0aGlzLmluaXRSZW5kZXJUYXJnZXQodGFyZ2V0KTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEJpbmQgdGhlIGZyYW1lYnVmZmVyXG4gICAgICAgIHRoaXMuc2V0RnJhbWVidWZmZXIodGFyZ2V0SW1wbC5fZ2xGcmFtZUJ1ZmZlcik7XG5cbiAgICAgICAgRGVidWdHcmFwaGljcy5wb3BHcHVNYXJrZXIodGhpcyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTWFya3MgdGhlIGVuZCBvZiBhIGJsb2NrIG9mIHJlbmRlcmluZy4gVGhpcyBmdW5jdGlvbiBzaG91bGQgYmUgY2FsbGVkIGFmdGVyIGEgbWF0Y2hpbmcgY2FsbFxuICAgICAqIHRvIHtAbGluayBHcmFwaGljc0RldmljZSN1cGRhdGVCZWdpbn0uIENhbGxzIHRvIHtAbGluayBHcmFwaGljc0RldmljZSN1cGRhdGVCZWdpbn0gYW5kXG4gICAgICoge0BsaW5rIEdyYXBoaWNzRGV2aWNlI3VwZGF0ZUVuZH0gbXVzdCBub3QgYmUgbmVzdGVkLlxuICAgICAqXG4gICAgICogQGlnbm9yZVxuICAgICAqL1xuICAgIHVwZGF0ZUVuZCgpIHtcblxuICAgICAgICBEZWJ1Z0dyYXBoaWNzLnB1c2hHcHVNYXJrZXIodGhpcywgYFVQREFURS1FTkRgKTtcblxuICAgICAgICB0aGlzLnVuYmluZFZlcnRleEFycmF5KCk7XG5cbiAgICAgICAgLy8gVW5zZXQgdGhlIHJlbmRlciB0YXJnZXRcbiAgICAgICAgY29uc3QgdGFyZ2V0ID0gdGhpcy5yZW5kZXJUYXJnZXQ7XG4gICAgICAgIGlmICh0YXJnZXQgJiYgdGFyZ2V0ICE9PSB0aGlzLmJhY2tCdWZmZXIpIHtcbiAgICAgICAgICAgIC8vIFJlc29sdmUgTVNBQSBpZiBuZWVkZWRcbiAgICAgICAgICAgIGlmICh0aGlzLndlYmdsMiAmJiB0YXJnZXQuX3NhbXBsZXMgPiAxICYmIHRhcmdldC5hdXRvUmVzb2x2ZSkge1xuICAgICAgICAgICAgICAgIHRhcmdldC5yZXNvbHZlKCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIElmIHRoZSBhY3RpdmUgcmVuZGVyIHRhcmdldCBpcyBhdXRvLW1pcG1hcHBlZCwgZ2VuZXJhdGUgaXRzIG1pcCBjaGFpblxuICAgICAgICAgICAgY29uc3QgY29sb3JCdWZmZXIgPSB0YXJnZXQuX2NvbG9yQnVmZmVyO1xuICAgICAgICAgICAgaWYgKGNvbG9yQnVmZmVyICYmIGNvbG9yQnVmZmVyLmltcGwuX2dsVGV4dHVyZSAmJiBjb2xvckJ1ZmZlci5taXBtYXBzICYmIChjb2xvckJ1ZmZlci5wb3QgfHwgdGhpcy53ZWJnbDIpKSB7XG4gICAgICAgICAgICAgICAgLy8gRklYTUU6IGlmIGNvbG9yQnVmZmVyIGlzIGEgY3ViZW1hcCBjdXJyZW50bHkgd2UncmUgcmUtZ2VuZXJhdGluZyBtaXBtYXBzIGFmdGVyXG4gICAgICAgICAgICAgICAgLy8gdXBkYXRpbmcgZWFjaCBmYWNlIVxuICAgICAgICAgICAgICAgIHRoaXMuYWN0aXZlVGV4dHVyZSh0aGlzLm1heENvbWJpbmVkVGV4dHVyZXMgLSAxKTtcbiAgICAgICAgICAgICAgICB0aGlzLmJpbmRUZXh0dXJlKGNvbG9yQnVmZmVyKTtcbiAgICAgICAgICAgICAgICB0aGlzLmdsLmdlbmVyYXRlTWlwbWFwKGNvbG9yQnVmZmVyLmltcGwuX2dsVGFyZ2V0KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIERlYnVnR3JhcGhpY3MucG9wR3B1TWFya2VyKHRoaXMpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFVwZGF0ZXMgYSB0ZXh0dXJlJ3MgdmVydGljYWwgZmxpcC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gZmxpcFkgLSBUcnVlIHRvIGZsaXAgdGhlIHRleHR1cmUgdmVydGljYWxseS5cbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgc2V0VW5wYWNrRmxpcFkoZmxpcFkpIHtcbiAgICAgICAgaWYgKHRoaXMudW5wYWNrRmxpcFkgIT09IGZsaXBZKSB7XG4gICAgICAgICAgICB0aGlzLnVucGFja0ZsaXBZID0gZmxpcFk7XG5cbiAgICAgICAgICAgIC8vIE5vdGU6IHRoZSBXZWJHTCBzcGVjIHN0YXRlcyB0aGF0IFVOUEFDS19GTElQX1lfV0VCR0wgb25seSBhZmZlY3RzXG4gICAgICAgICAgICAvLyB0ZXhJbWFnZTJEIGFuZCB0ZXhTdWJJbWFnZTJELCBub3QgY29tcHJlc3NlZFRleEltYWdlMkRcbiAgICAgICAgICAgIGNvbnN0IGdsID0gdGhpcy5nbDtcbiAgICAgICAgICAgIGdsLnBpeGVsU3RvcmVpKGdsLlVOUEFDS19GTElQX1lfV0VCR0wsIGZsaXBZKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFVwZGF0ZXMgYSB0ZXh0dXJlIHRvIGhhdmUgaXRzIFJHQiBjaGFubmVscyBwcmVtdWx0aXBsaWVkIGJ5IGl0cyBhbHBoYSBjaGFubmVsIG9yIG5vdC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gcHJlbXVsdGlwbHlBbHBoYSAtIFRydWUgdG8gcHJlbXVsdGlwbHkgdGhlIGFscGhhIGNoYW5uZWwgYWdhaW5zdCB0aGUgUkdCXG4gICAgICogY2hhbm5lbHMuXG4gICAgICogQGlnbm9yZVxuICAgICAqL1xuICAgIHNldFVucGFja1ByZW11bHRpcGx5QWxwaGEocHJlbXVsdGlwbHlBbHBoYSkge1xuICAgICAgICBpZiAodGhpcy51bnBhY2tQcmVtdWx0aXBseUFscGhhICE9PSBwcmVtdWx0aXBseUFscGhhKSB7XG4gICAgICAgICAgICB0aGlzLnVucGFja1ByZW11bHRpcGx5QWxwaGEgPSBwcmVtdWx0aXBseUFscGhhO1xuXG4gICAgICAgICAgICAvLyBOb3RlOiB0aGUgV2ViR0wgc3BlYyBzdGF0ZXMgdGhhdCBVTlBBQ0tfUFJFTVVMVElQTFlfQUxQSEFfV0VCR0wgb25seSBhZmZlY3RzXG4gICAgICAgICAgICAvLyB0ZXhJbWFnZTJEIGFuZCB0ZXhTdWJJbWFnZTJELCBub3QgY29tcHJlc3NlZFRleEltYWdlMkRcbiAgICAgICAgICAgIGNvbnN0IGdsID0gdGhpcy5nbDtcbiAgICAgICAgICAgIGdsLnBpeGVsU3RvcmVpKGdsLlVOUEFDS19QUkVNVUxUSVBMWV9BTFBIQV9XRUJHTCwgcHJlbXVsdGlwbHlBbHBoYSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBY3RpdmF0ZSB0aGUgc3BlY2lmaWVkIHRleHR1cmUgdW5pdC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSB0ZXh0dXJlVW5pdCAtIFRoZSB0ZXh0dXJlIHVuaXQgdG8gYWN0aXZhdGUuXG4gICAgICogQGlnbm9yZVxuICAgICAqL1xuICAgIGFjdGl2ZVRleHR1cmUodGV4dHVyZVVuaXQpIHtcbiAgICAgICAgaWYgKHRoaXMudGV4dHVyZVVuaXQgIT09IHRleHR1cmVVbml0KSB7XG4gICAgICAgICAgICB0aGlzLmdsLmFjdGl2ZVRleHR1cmUodGhpcy5nbC5URVhUVVJFMCArIHRleHR1cmVVbml0KTtcbiAgICAgICAgICAgIHRoaXMudGV4dHVyZVVuaXQgPSB0ZXh0dXJlVW5pdDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIElmIHRoZSB0ZXh0dXJlIGlzIG5vdCBhbHJlYWR5IGJvdW5kIG9uIHRoZSBjdXJyZW50bHkgYWN0aXZlIHRleHR1cmUgdW5pdCwgYmluZCBpdC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7VGV4dHVyZX0gdGV4dHVyZSAtIFRoZSB0ZXh0dXJlIHRvIGJpbmQuXG4gICAgICogQGlnbm9yZVxuICAgICAqL1xuICAgIGJpbmRUZXh0dXJlKHRleHR1cmUpIHtcbiAgICAgICAgY29uc3QgaW1wbCA9IHRleHR1cmUuaW1wbDtcbiAgICAgICAgY29uc3QgdGV4dHVyZVRhcmdldCA9IGltcGwuX2dsVGFyZ2V0O1xuICAgICAgICBjb25zdCB0ZXh0dXJlT2JqZWN0ID0gaW1wbC5fZ2xUZXh0dXJlO1xuICAgICAgICBjb25zdCB0ZXh0dXJlVW5pdCA9IHRoaXMudGV4dHVyZVVuaXQ7XG4gICAgICAgIGNvbnN0IHNsb3QgPSB0aGlzLnRhcmdldFRvU2xvdFt0ZXh0dXJlVGFyZ2V0XTtcbiAgICAgICAgaWYgKHRoaXMudGV4dHVyZVVuaXRzW3RleHR1cmVVbml0XVtzbG90XSAhPT0gdGV4dHVyZU9iamVjdCkge1xuICAgICAgICAgICAgdGhpcy5nbC5iaW5kVGV4dHVyZSh0ZXh0dXJlVGFyZ2V0LCB0ZXh0dXJlT2JqZWN0KTtcbiAgICAgICAgICAgIHRoaXMudGV4dHVyZVVuaXRzW3RleHR1cmVVbml0XVtzbG90XSA9IHRleHR1cmVPYmplY3Q7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJZiB0aGUgdGV4dHVyZSBpcyBub3QgYm91bmQgb24gdGhlIHNwZWNpZmllZCB0ZXh0dXJlIHVuaXQsIGFjdGl2ZSB0aGUgdGV4dHVyZSB1bml0IGFuZCBiaW5kXG4gICAgICogdGhlIHRleHR1cmUgdG8gaXQuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1RleHR1cmV9IHRleHR1cmUgLSBUaGUgdGV4dHVyZSB0byBiaW5kLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSB0ZXh0dXJlVW5pdCAtIFRoZSB0ZXh0dXJlIHVuaXQgdG8gYWN0aXZhdGUgYW5kIGJpbmQgdGhlIHRleHR1cmUgdG8uXG4gICAgICogQGlnbm9yZVxuICAgICAqL1xuICAgIGJpbmRUZXh0dXJlT25Vbml0KHRleHR1cmUsIHRleHR1cmVVbml0KSB7XG4gICAgICAgIGNvbnN0IGltcGwgPSB0ZXh0dXJlLmltcGw7XG4gICAgICAgIGNvbnN0IHRleHR1cmVUYXJnZXQgPSBpbXBsLl9nbFRhcmdldDtcbiAgICAgICAgY29uc3QgdGV4dHVyZU9iamVjdCA9IGltcGwuX2dsVGV4dHVyZTtcbiAgICAgICAgY29uc3Qgc2xvdCA9IHRoaXMudGFyZ2V0VG9TbG90W3RleHR1cmVUYXJnZXRdO1xuICAgICAgICBpZiAodGhpcy50ZXh0dXJlVW5pdHNbdGV4dHVyZVVuaXRdW3Nsb3RdICE9PSB0ZXh0dXJlT2JqZWN0KSB7XG4gICAgICAgICAgICB0aGlzLmFjdGl2ZVRleHR1cmUodGV4dHVyZVVuaXQpO1xuICAgICAgICAgICAgdGhpcy5nbC5iaW5kVGV4dHVyZSh0ZXh0dXJlVGFyZ2V0LCB0ZXh0dXJlT2JqZWN0KTtcbiAgICAgICAgICAgIHRoaXMudGV4dHVyZVVuaXRzW3RleHR1cmVVbml0XVtzbG90XSA9IHRleHR1cmVPYmplY3Q7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBVcGRhdGUgdGhlIHRleHR1cmUgcGFyYW1ldGVycyBmb3IgYSBnaXZlbiB0ZXh0dXJlIGlmIHRoZXkgaGF2ZSBjaGFuZ2VkLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtUZXh0dXJlfSB0ZXh0dXJlIC0gVGhlIHRleHR1cmUgdG8gdXBkYXRlLlxuICAgICAqIEBpZ25vcmVcbiAgICAgKi9cbiAgICBzZXRUZXh0dXJlUGFyYW1ldGVycyh0ZXh0dXJlKSB7XG4gICAgICAgIGNvbnN0IGdsID0gdGhpcy5nbDtcbiAgICAgICAgY29uc3QgZmxhZ3MgPSB0ZXh0dXJlLmltcGwuZGlydHlQYXJhbWV0ZXJGbGFncztcbiAgICAgICAgY29uc3QgdGFyZ2V0ID0gdGV4dHVyZS5pbXBsLl9nbFRhcmdldDtcblxuICAgICAgICBpZiAoZmxhZ3MgJiAxKSB7XG4gICAgICAgICAgICBsZXQgZmlsdGVyID0gdGV4dHVyZS5fbWluRmlsdGVyO1xuICAgICAgICAgICAgaWYgKCghdGV4dHVyZS5wb3QgJiYgIXRoaXMud2ViZ2wyKSB8fCAhdGV4dHVyZS5fbWlwbWFwcyB8fCAodGV4dHVyZS5fY29tcHJlc3NlZCAmJiB0ZXh0dXJlLl9sZXZlbHMubGVuZ3RoID09PSAxKSkge1xuICAgICAgICAgICAgICAgIGlmIChmaWx0ZXIgPT09IEZJTFRFUl9ORUFSRVNUX01JUE1BUF9ORUFSRVNUIHx8IGZpbHRlciA9PT0gRklMVEVSX05FQVJFU1RfTUlQTUFQX0xJTkVBUikge1xuICAgICAgICAgICAgICAgICAgICBmaWx0ZXIgPSBGSUxURVJfTkVBUkVTVDtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGZpbHRlciA9PT0gRklMVEVSX0xJTkVBUl9NSVBNQVBfTkVBUkVTVCB8fCBmaWx0ZXIgPT09IEZJTFRFUl9MSU5FQVJfTUlQTUFQX0xJTkVBUikge1xuICAgICAgICAgICAgICAgICAgICBmaWx0ZXIgPSBGSUxURVJfTElORUFSO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGdsLnRleFBhcmFtZXRlcmkodGFyZ2V0LCBnbC5URVhUVVJFX01JTl9GSUxURVIsIHRoaXMuZ2xGaWx0ZXJbZmlsdGVyXSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGZsYWdzICYgMikge1xuICAgICAgICAgICAgZ2wudGV4UGFyYW1ldGVyaSh0YXJnZXQsIGdsLlRFWFRVUkVfTUFHX0ZJTFRFUiwgdGhpcy5nbEZpbHRlclt0ZXh0dXJlLl9tYWdGaWx0ZXJdKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoZmxhZ3MgJiA0KSB7XG4gICAgICAgICAgICBpZiAodGhpcy53ZWJnbDIpIHtcbiAgICAgICAgICAgICAgICBnbC50ZXhQYXJhbWV0ZXJpKHRhcmdldCwgZ2wuVEVYVFVSRV9XUkFQX1MsIHRoaXMuZ2xBZGRyZXNzW3RleHR1cmUuX2FkZHJlc3NVXSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIFdlYkdMMSBkb2Vzbid0IHN1cHBvcnQgYWxsIGFkZHJlc3NpbmcgbW9kZXMgd2l0aCBOUE9UIHRleHR1cmVzXG4gICAgICAgICAgICAgICAgZ2wudGV4UGFyYW1ldGVyaSh0YXJnZXQsIGdsLlRFWFRVUkVfV1JBUF9TLCB0aGlzLmdsQWRkcmVzc1t0ZXh0dXJlLnBvdCA/IHRleHR1cmUuX2FkZHJlc3NVIDogQUREUkVTU19DTEFNUF9UT19FREdFXSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGZsYWdzICYgOCkge1xuICAgICAgICAgICAgaWYgKHRoaXMud2ViZ2wyKSB7XG4gICAgICAgICAgICAgICAgZ2wudGV4UGFyYW1ldGVyaSh0YXJnZXQsIGdsLlRFWFRVUkVfV1JBUF9ULCB0aGlzLmdsQWRkcmVzc1t0ZXh0dXJlLl9hZGRyZXNzVl0pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBXZWJHTDEgZG9lc24ndCBzdXBwb3J0IGFsbCBhZGRyZXNzaW5nIG1vZGVzIHdpdGggTlBPVCB0ZXh0dXJlc1xuICAgICAgICAgICAgICAgIGdsLnRleFBhcmFtZXRlcmkodGFyZ2V0LCBnbC5URVhUVVJFX1dSQVBfVCwgdGhpcy5nbEFkZHJlc3NbdGV4dHVyZS5wb3QgPyB0ZXh0dXJlLl9hZGRyZXNzViA6IEFERFJFU1NfQ0xBTVBfVE9fRURHRV0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChmbGFncyAmIDE2KSB7XG4gICAgICAgICAgICBpZiAodGhpcy53ZWJnbDIpIHtcbiAgICAgICAgICAgICAgICBnbC50ZXhQYXJhbWV0ZXJpKHRhcmdldCwgZ2wuVEVYVFVSRV9XUkFQX1IsIHRoaXMuZ2xBZGRyZXNzW3RleHR1cmUuX2FkZHJlc3NXXSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGZsYWdzICYgMzIpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLndlYmdsMikge1xuICAgICAgICAgICAgICAgIGdsLnRleFBhcmFtZXRlcmkodGFyZ2V0LCBnbC5URVhUVVJFX0NPTVBBUkVfTU9ERSwgdGV4dHVyZS5fY29tcGFyZU9uUmVhZCA/IGdsLkNPTVBBUkVfUkVGX1RPX1RFWFRVUkUgOiBnbC5OT05FKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAoZmxhZ3MgJiA2NCkge1xuICAgICAgICAgICAgaWYgKHRoaXMud2ViZ2wyKSB7XG4gICAgICAgICAgICAgICAgZ2wudGV4UGFyYW1ldGVyaSh0YXJnZXQsIGdsLlRFWFRVUkVfQ09NUEFSRV9GVU5DLCB0aGlzLmdsQ29tcGFyaXNvblt0ZXh0dXJlLl9jb21wYXJlRnVuY10pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChmbGFncyAmIDEyOCkge1xuICAgICAgICAgICAgY29uc3QgZXh0ID0gdGhpcy5leHRUZXh0dXJlRmlsdGVyQW5pc290cm9waWM7XG4gICAgICAgICAgICBpZiAoZXh0KSB7XG4gICAgICAgICAgICAgICAgZ2wudGV4UGFyYW1ldGVyZih0YXJnZXQsIGV4dC5URVhUVVJFX01BWF9BTklTT1RST1BZX0VYVCwgbWF0aC5jbGFtcChNYXRoLnJvdW5kKHRleHR1cmUuX2FuaXNvdHJvcHkpLCAxLCB0aGlzLm1heEFuaXNvdHJvcHkpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIHNwZWNpZmllZCB0ZXh0dXJlIG9uIHRoZSBzcGVjaWZpZWQgdGV4dHVyZSB1bml0LlxuICAgICAqXG4gICAgICogQHBhcmFtIHtUZXh0dXJlfSB0ZXh0dXJlIC0gVGhlIHRleHR1cmUgdG8gc2V0LlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSB0ZXh0dXJlVW5pdCAtIFRoZSB0ZXh0dXJlIHVuaXQgdG8gc2V0IHRoZSB0ZXh0dXJlIG9uLlxuICAgICAqIEBpZ25vcmVcbiAgICAgKi9cbiAgICBzZXRUZXh0dXJlKHRleHR1cmUsIHRleHR1cmVVbml0KSB7XG5cbiAgICAgICAgY29uc3QgaW1wbCA9IHRleHR1cmUuaW1wbDtcbiAgICAgICAgaWYgKCFpbXBsLl9nbFRleHR1cmUpXG4gICAgICAgICAgICBpbXBsLmluaXRpYWxpemUodGhpcywgdGV4dHVyZSk7XG5cbiAgICAgICAgaWYgKGltcGwuZGlydHlQYXJhbWV0ZXJGbGFncyA+IDAgfHwgdGV4dHVyZS5fbmVlZHNVcGxvYWQgfHwgdGV4dHVyZS5fbmVlZHNNaXBtYXBzVXBsb2FkKSB7XG5cbiAgICAgICAgICAgIC8vIEVuc3VyZSB0aGUgc3BlY2lmaWVkIHRleHR1cmUgdW5pdCBpcyBhY3RpdmVcbiAgICAgICAgICAgIHRoaXMuYWN0aXZlVGV4dHVyZSh0ZXh0dXJlVW5pdCk7XG5cbiAgICAgICAgICAgIC8vIEVuc3VyZSB0aGUgdGV4dHVyZSBpcyBib3VuZCBvbiBjb3JyZWN0IHRhcmdldCBvZiB0aGUgc3BlY2lmaWVkIHRleHR1cmUgdW5pdFxuICAgICAgICAgICAgdGhpcy5iaW5kVGV4dHVyZSh0ZXh0dXJlKTtcblxuICAgICAgICAgICAgaWYgKGltcGwuZGlydHlQYXJhbWV0ZXJGbGFncykge1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0VGV4dHVyZVBhcmFtZXRlcnModGV4dHVyZSk7XG4gICAgICAgICAgICAgICAgaW1wbC5kaXJ0eVBhcmFtZXRlckZsYWdzID0gMDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHRleHR1cmUuX25lZWRzVXBsb2FkIHx8IHRleHR1cmUuX25lZWRzTWlwbWFwc1VwbG9hZCkge1xuICAgICAgICAgICAgICAgIGltcGwudXBsb2FkKHRoaXMsIHRleHR1cmUpO1xuICAgICAgICAgICAgICAgIHRleHR1cmUuX25lZWRzVXBsb2FkID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgdGV4dHVyZS5fbmVlZHNNaXBtYXBzVXBsb2FkID0gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBFbnN1cmUgdGhlIHRleHR1cmUgaXMgY3VycmVudGx5IGJvdW5kIHRvIHRoZSBjb3JyZWN0IHRhcmdldCBvbiB0aGUgc3BlY2lmaWVkIHRleHR1cmUgdW5pdC5cbiAgICAgICAgICAgIC8vIElmIHRoZSB0ZXh0dXJlIGlzIGFscmVhZHkgYm91bmQgdG8gdGhlIGNvcnJlY3QgdGFyZ2V0IG9uIHRoZSBzcGVjaWZpZWQgdW5pdCwgdGhlcmUncyBubyBuZWVkXG4gICAgICAgICAgICAvLyB0byBhY3R1YWxseSBtYWtlIHRoZSBzcGVjaWZpZWQgdGV4dHVyZSB1bml0IGFjdGl2ZSBiZWNhdXNlIHRoZSB0ZXh0dXJlIGl0c2VsZiBkb2VzIG5vdCBuZWVkXG4gICAgICAgICAgICAvLyB0byBiZSB1cGRhdGVkLlxuICAgICAgICAgICAgdGhpcy5iaW5kVGV4dHVyZU9uVW5pdCh0ZXh0dXJlLCB0ZXh0dXJlVW5pdCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBmdW5jdGlvbiBjcmVhdGVzIFZlcnRleEFycmF5T2JqZWN0IGZyb20gbGlzdCBvZiB2ZXJ0ZXggYnVmZmVyc1xuICAgIGNyZWF0ZVZlcnRleEFycmF5KHZlcnRleEJ1ZmZlcnMpIHtcblxuICAgICAgICBsZXQga2V5LCB2YW87XG5cbiAgICAgICAgLy8gb25seSB1c2UgY2FjaGUgd2hlbiBtb3JlIHRoYW4gMSB2ZXJ0ZXggYnVmZmVyLCBvdGhlcndpc2UgaXQncyB1bmlxdWVcbiAgICAgICAgY29uc3QgdXNlQ2FjaGUgPSB2ZXJ0ZXhCdWZmZXJzLmxlbmd0aCA+IDE7XG4gICAgICAgIGlmICh1c2VDYWNoZSkge1xuXG4gICAgICAgICAgICAvLyBnZW5lcmF0ZSB1bmlxdWUga2V5IGZvciB0aGUgdmVydGV4IGJ1ZmZlcnNcbiAgICAgICAgICAgIGtleSA9IFwiXCI7XG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHZlcnRleEJ1ZmZlcnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICBjb25zdCB2ZXJ0ZXhCdWZmZXIgPSB2ZXJ0ZXhCdWZmZXJzW2ldO1xuICAgICAgICAgICAgICAgIGtleSArPSB2ZXJ0ZXhCdWZmZXIuaWQgKyB2ZXJ0ZXhCdWZmZXIuZm9ybWF0LnJlbmRlcmluZ0hhc2g7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIHRyeSB0byBnZXQgVkFPIGZyb20gY2FjaGVcbiAgICAgICAgICAgIHZhbyA9IHRoaXMuX3Zhb01hcC5nZXQoa2V5KTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIG5lZWQgdG8gY3JlYXRlIG5ldyB2YW9cbiAgICAgICAgaWYgKCF2YW8pIHtcblxuICAgICAgICAgICAgLy8gY3JlYXRlIFZBIG9iamVjdFxuICAgICAgICAgICAgY29uc3QgZ2wgPSB0aGlzLmdsO1xuICAgICAgICAgICAgdmFvID0gZ2wuY3JlYXRlVmVydGV4QXJyYXkoKTtcbiAgICAgICAgICAgIGdsLmJpbmRWZXJ0ZXhBcnJheSh2YW8pO1xuXG4gICAgICAgICAgICAvLyBkb24ndCBjYXB0dXJlIGluZGV4IGJ1ZmZlciBpbiBWQU9cbiAgICAgICAgICAgIGdsLmJpbmRCdWZmZXIoZ2wuRUxFTUVOVF9BUlJBWV9CVUZGRVIsIG51bGwpO1xuXG4gICAgICAgICAgICBsZXQgbG9jWmVybyA9IGZhbHNlO1xuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB2ZXJ0ZXhCdWZmZXJzLmxlbmd0aDsgaSsrKSB7XG5cbiAgICAgICAgICAgICAgICAvLyBiaW5kIGJ1ZmZlclxuICAgICAgICAgICAgICAgIGNvbnN0IHZlcnRleEJ1ZmZlciA9IHZlcnRleEJ1ZmZlcnNbaV07XG4gICAgICAgICAgICAgICAgZ2wuYmluZEJ1ZmZlcihnbC5BUlJBWV9CVUZGRVIsIHZlcnRleEJ1ZmZlci5pbXBsLmJ1ZmZlcklkKTtcblxuICAgICAgICAgICAgICAgIC8vIGZvciBlYWNoIGF0dHJpYnV0ZVxuICAgICAgICAgICAgICAgIGNvbnN0IGVsZW1lbnRzID0gdmVydGV4QnVmZmVyLmZvcm1hdC5lbGVtZW50cztcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBqID0gMDsgaiA8IGVsZW1lbnRzLmxlbmd0aDsgaisrKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGUgPSBlbGVtZW50c1tqXTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbG9jID0gc2VtYW50aWNUb0xvY2F0aW9uW2UubmFtZV07XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGxvYyA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgbG9jWmVybyA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBnbC52ZXJ0ZXhBdHRyaWJQb2ludGVyKGxvYywgZS5udW1Db21wb25lbnRzLCB0aGlzLmdsVHlwZVtlLmRhdGFUeXBlXSwgZS5ub3JtYWxpemUsIGUuc3RyaWRlLCBlLm9mZnNldCk7XG4gICAgICAgICAgICAgICAgICAgIGdsLmVuYWJsZVZlcnRleEF0dHJpYkFycmF5KGxvYyk7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKHZlcnRleEJ1ZmZlci5mb3JtYXQuaW5zdGFuY2luZykge1xuICAgICAgICAgICAgICAgICAgICAgICAgZ2wudmVydGV4QXR0cmliRGl2aXNvcihsb2MsIDEpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBlbmQgb2YgVkEgb2JqZWN0XG4gICAgICAgICAgICBnbC5iaW5kVmVydGV4QXJyYXkobnVsbCk7XG5cbiAgICAgICAgICAgIC8vIHVuYmluZCBhbnkgYXJyYXkgYnVmZmVyXG4gICAgICAgICAgICBnbC5iaW5kQnVmZmVyKGdsLkFSUkFZX0JVRkZFUiwgbnVsbCk7XG5cbiAgICAgICAgICAgIC8vIGFkZCBpdCB0byBjYWNoZVxuICAgICAgICAgICAgaWYgKHVzZUNhY2hlKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fdmFvTWFwLnNldChrZXksIHZhbyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICghbG9jWmVybykge1xuICAgICAgICAgICAgICAgIERlYnVnLndhcm4oXCJObyB2ZXJ0ZXggYXR0cmlidXRlIGlzIG1hcHBlZCB0byBsb2NhdGlvbiAwLCB3aGljaCBtaWdodCBjYXVzZSBjb21wYXRpYmlsaXR5IGlzc3VlcyBvbiBTYWZhcmkgb24gTWFjT1MgLSBwbGVhc2UgdXNlIGF0dHJpYnV0ZSBTRU1BTlRJQ19QT1NJVElPTiBvciBTRU1BTlRJQ19BVFRSMTVcIik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdmFvO1xuICAgIH1cblxuICAgIHVuYmluZFZlcnRleEFycmF5KCkge1xuICAgICAgICAvLyB1bmJpbmQgVkFPIGZyb20gZGV2aWNlIHRvIHByb3RlY3QgaXQgZnJvbSBiZWluZyBjaGFuZ2VkXG4gICAgICAgIGlmICh0aGlzLmJvdW5kVmFvKSB7XG4gICAgICAgICAgICB0aGlzLmJvdW5kVmFvID0gbnVsbDtcbiAgICAgICAgICAgIHRoaXMuZ2wuYmluZFZlcnRleEFycmF5KG51bGwpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgc2V0QnVmZmVycygpIHtcbiAgICAgICAgY29uc3QgZ2wgPSB0aGlzLmdsO1xuICAgICAgICBsZXQgdmFvO1xuXG4gICAgICAgIC8vIGNyZWF0ZSBWQU8gZm9yIHNwZWNpZmllZCB2ZXJ0ZXggYnVmZmVyc1xuICAgICAgICBpZiAodGhpcy52ZXJ0ZXhCdWZmZXJzLmxlbmd0aCA9PT0gMSkge1xuXG4gICAgICAgICAgICAvLyBzaW5nbGUgVkIga2VlcHMgaXRzIFZBT1xuICAgICAgICAgICAgY29uc3QgdmVydGV4QnVmZmVyID0gdGhpcy52ZXJ0ZXhCdWZmZXJzWzBdO1xuICAgICAgICAgICAgRGVidWcuYXNzZXJ0KHZlcnRleEJ1ZmZlci5kZXZpY2UgPT09IHRoaXMsIFwiVGhlIFZlcnRleEJ1ZmZlciB3YXMgbm90IGNyZWF0ZWQgdXNpbmcgY3VycmVudCBHcmFwaGljc0RldmljZVwiKTtcbiAgICAgICAgICAgIGlmICghdmVydGV4QnVmZmVyLmltcGwudmFvKSB7XG4gICAgICAgICAgICAgICAgdmVydGV4QnVmZmVyLmltcGwudmFvID0gdGhpcy5jcmVhdGVWZXJ0ZXhBcnJheSh0aGlzLnZlcnRleEJ1ZmZlcnMpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdmFvID0gdmVydGV4QnVmZmVyLmltcGwudmFvO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gb2J0YWluIHRlbXBvcmFyeSBWQU8gZm9yIG11bHRpcGxlIHZlcnRleCBidWZmZXJzXG4gICAgICAgICAgICB2YW8gPSB0aGlzLmNyZWF0ZVZlcnRleEFycmF5KHRoaXMudmVydGV4QnVmZmVycyk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBzZXQgYWN0aXZlIFZBT1xuICAgICAgICBpZiAodGhpcy5ib3VuZFZhbyAhPT0gdmFvKSB7XG4gICAgICAgICAgICB0aGlzLmJvdW5kVmFvID0gdmFvO1xuICAgICAgICAgICAgZ2wuYmluZFZlcnRleEFycmF5KHZhbyk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBlbXB0eSBhcnJheSBvZiB2ZXJ0ZXggYnVmZmVyc1xuICAgICAgICB0aGlzLnZlcnRleEJ1ZmZlcnMubGVuZ3RoID0gMDtcblxuICAgICAgICAvLyBTZXQgdGhlIGFjdGl2ZSBpbmRleCBidWZmZXIgb2JqZWN0XG4gICAgICAgIC8vIE5vdGU6IHdlIGRvbid0IGNhY2hlIHRoaXMgc3RhdGUgYW5kIHNldCBpdCBvbmx5IHdoZW4gaXQgY2hhbmdlcywgYXMgVkFPIGNhcHR1cmVzIGxhc3QgYmluZCBidWZmZXIgaW4gaXRcbiAgICAgICAgLy8gYW5kIHNvIHdlIGRvbid0IGtub3cgd2hhdCBWQU8gc2V0cyBpdCB0by5cbiAgICAgICAgY29uc3QgYnVmZmVySWQgPSB0aGlzLmluZGV4QnVmZmVyID8gdGhpcy5pbmRleEJ1ZmZlci5pbXBsLmJ1ZmZlcklkIDogbnVsbDtcbiAgICAgICAgZ2wuYmluZEJ1ZmZlcihnbC5FTEVNRU5UX0FSUkFZX0JVRkZFUiwgYnVmZmVySWQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFN1Ym1pdHMgYSBncmFwaGljYWwgcHJpbWl0aXZlIHRvIHRoZSBoYXJkd2FyZSBmb3IgaW1tZWRpYXRlIHJlbmRlcmluZy5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7b2JqZWN0fSBwcmltaXRpdmUgLSBQcmltaXRpdmUgb2JqZWN0IGRlc2NyaWJpbmcgaG93IHRvIHN1Ym1pdCBjdXJyZW50IHZlcnRleC9pbmRleFxuICAgICAqIGJ1ZmZlcnMuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHByaW1pdGl2ZS50eXBlIC0gVGhlIHR5cGUgb2YgcHJpbWl0aXZlIHRvIHJlbmRlci4gQ2FuIGJlOlxuICAgICAqXG4gICAgICogLSB7QGxpbmsgUFJJTUlUSVZFX1BPSU5UU31cbiAgICAgKiAtIHtAbGluayBQUklNSVRJVkVfTElORVN9XG4gICAgICogLSB7QGxpbmsgUFJJTUlUSVZFX0xJTkVMT09QfVxuICAgICAqIC0ge0BsaW5rIFBSSU1JVElWRV9MSU5FU1RSSVB9XG4gICAgICogLSB7QGxpbmsgUFJJTUlUSVZFX1RSSUFOR0xFU31cbiAgICAgKiAtIHtAbGluayBQUklNSVRJVkVfVFJJU1RSSVB9XG4gICAgICogLSB7QGxpbmsgUFJJTUlUSVZFX1RSSUZBTn1cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBwcmltaXRpdmUuYmFzZSAtIFRoZSBvZmZzZXQgb2YgdGhlIGZpcnN0IGluZGV4IG9yIHZlcnRleCB0byBkaXNwYXRjaCBpbiB0aGVcbiAgICAgKiBkcmF3IGNhbGwuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHByaW1pdGl2ZS5jb3VudCAtIFRoZSBudW1iZXIgb2YgaW5kaWNlcyBvciB2ZXJ0aWNlcyB0byBkaXNwYXRjaCBpbiB0aGUgZHJhd1xuICAgICAqIGNhbGwuXG4gICAgICogQHBhcmFtIHtib29sZWFufSBbcHJpbWl0aXZlLmluZGV4ZWRdIC0gVHJ1ZSB0byBpbnRlcnByZXQgdGhlIHByaW1pdGl2ZSBhcyBpbmRleGVkLCB0aGVyZWJ5XG4gICAgICogdXNpbmcgdGhlIGN1cnJlbnRseSBzZXQgaW5kZXggYnVmZmVyIGFuZCBmYWxzZSBvdGhlcndpc2UuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFtudW1JbnN0YW5jZXNdIC0gVGhlIG51bWJlciBvZiBpbnN0YW5jZXMgdG8gcmVuZGVyIHdoZW4gdXNpbmdcbiAgICAgKiBBTkdMRV9pbnN0YW5jZWRfYXJyYXlzLiBEZWZhdWx0cyB0byAxLlxuICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gW2tlZXBCdWZmZXJzXSAtIE9wdGlvbmFsbHkga2VlcCB0aGUgY3VycmVudCBzZXQgb2YgdmVydGV4IC8gaW5kZXggYnVmZmVycyAvXG4gICAgICogVkFPLiBUaGlzIGlzIHVzZWQgd2hlbiByZW5kZXJpbmcgb2YgbXVsdGlwbGUgdmlld3MsIGZvciBleGFtcGxlIHVuZGVyIFdlYlhSLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogLy8gUmVuZGVyIGEgc2luZ2xlLCB1bmluZGV4ZWQgdHJpYW5nbGVcbiAgICAgKiBkZXZpY2UuZHJhdyh7XG4gICAgICogICAgIHR5cGU6IHBjLlBSSU1JVElWRV9UUklBTkdMRVMsXG4gICAgICogICAgIGJhc2U6IDAsXG4gICAgICogICAgIGNvdW50OiAzLFxuICAgICAqICAgICBpbmRleGVkOiBmYWxzZVxuICAgICAqIH0pO1xuICAgICAqL1xuICAgIGRyYXcocHJpbWl0aXZlLCBudW1JbnN0YW5jZXMsIGtlZXBCdWZmZXJzKSB7XG4gICAgICAgIGNvbnN0IGdsID0gdGhpcy5nbDtcblxuICAgICAgICBsZXQgc2FtcGxlciwgc2FtcGxlclZhbHVlLCB0ZXh0dXJlLCBudW1UZXh0dXJlczsgLy8gU2FtcGxlcnNcbiAgICAgICAgbGV0IHVuaWZvcm0sIHNjb3BlSWQsIHVuaWZvcm1WZXJzaW9uLCBwcm9ncmFtVmVyc2lvbjsgLy8gVW5pZm9ybXNcbiAgICAgICAgY29uc3Qgc2hhZGVyID0gdGhpcy5zaGFkZXI7XG4gICAgICAgIGlmICghc2hhZGVyKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICBjb25zdCBzYW1wbGVycyA9IHNoYWRlci5pbXBsLnNhbXBsZXJzO1xuICAgICAgICBjb25zdCB1bmlmb3JtcyA9IHNoYWRlci5pbXBsLnVuaWZvcm1zO1xuXG4gICAgICAgIC8vIHZlcnRleCBidWZmZXJzXG4gICAgICAgIGlmICgha2VlcEJ1ZmZlcnMpIHtcbiAgICAgICAgICAgIHRoaXMuc2V0QnVmZmVycygpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQ29tbWl0IHRoZSBzaGFkZXIgcHJvZ3JhbSB2YXJpYWJsZXNcbiAgICAgICAgbGV0IHRleHR1cmVVbml0ID0gMDtcblxuICAgICAgICBmb3IgKGxldCBpID0gMCwgbGVuID0gc2FtcGxlcnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgICAgIHNhbXBsZXIgPSBzYW1wbGVyc1tpXTtcbiAgICAgICAgICAgIHNhbXBsZXJWYWx1ZSA9IHNhbXBsZXIuc2NvcGVJZC52YWx1ZTtcbiAgICAgICAgICAgIGlmICghc2FtcGxlclZhbHVlKSB7XG5cbiAgICAgICAgICAgICAgICAvLyAjaWYgX0RFQlVHXG4gICAgICAgICAgICAgICAgY29uc3Qgc2FtcGxlck5hbWUgPSBzYW1wbGVyLnNjb3BlSWQubmFtZTtcbiAgICAgICAgICAgICAgICBpZiAoc2FtcGxlck5hbWUgPT09ICd1U2NlbmVEZXB0aE1hcCcgfHwgc2FtcGxlck5hbWUgPT09ICd1RGVwdGhNYXAnKSB7XG4gICAgICAgICAgICAgICAgICAgIERlYnVnLndhcm5PbmNlKGBBIHNhbXBsZXIgJHtzYW1wbGVyTmFtZX0gaXMgdXNlZCBieSB0aGUgc2hhZGVyIGJ1dCBhIHNjZW5lIGRlcHRoIHRleHR1cmUgaXMgbm90IGF2YWlsYWJsZS4gVXNlIENhbWVyYUNvbXBvbmVudC5yZXF1ZXN0U2NlbmVEZXB0aE1hcCB0byBlbmFibGUgaXQuYCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChzYW1wbGVyTmFtZSA9PT0gJ3VTY2VuZUNvbG9yTWFwJyB8fCBzYW1wbGVyTmFtZSA9PT0gJ3RleHR1cmVfZ3JhYlBhc3MnKSB7XG4gICAgICAgICAgICAgICAgICAgIERlYnVnLndhcm5PbmNlKGBBIHNhbXBsZXIgJHtzYW1wbGVyTmFtZX0gaXMgdXNlZCBieSB0aGUgc2hhZGVyIGJ1dCBhIHNjZW5lIGNvbG9yIHRleHR1cmUgaXMgbm90IGF2YWlsYWJsZS4gVXNlIENhbWVyYUNvbXBvbmVudC5yZXF1ZXN0U2NlbmVDb2xvck1hcCB0byBlbmFibGUgaXQuYCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIC8vICNlbmRpZlxuXG4gICAgICAgICAgICAgICAgRGVidWcuZXJyb3JPbmNlKGBTaGFkZXIgWyR7c2hhZGVyLmxhYmVsfV0gcmVxdWlyZXMgdGV4dHVyZSBzYW1wbGVyIFske3NhbXBsZXJOYW1lfV0gd2hpY2ggaGFzIG5vdCBiZWVuIHNldCwgd2hpbGUgcmVuZGVyaW5nIFske0RlYnVnR3JhcGhpY3MudG9TdHJpbmcoKX1dYCk7XG5cbiAgICAgICAgICAgICAgICAvLyBza2lwIHRoaXMgZHJhdyBjYWxsIHRvIGF2b2lkIGluY29ycmVjdCByZW5kZXJpbmcgLyB3ZWJnbCBlcnJvcnNcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChzYW1wbGVyVmFsdWUgaW5zdGFuY2VvZiBUZXh0dXJlKSB7XG4gICAgICAgICAgICAgICAgdGV4dHVyZSA9IHNhbXBsZXJWYWx1ZTtcbiAgICAgICAgICAgICAgICB0aGlzLnNldFRleHR1cmUodGV4dHVyZSwgdGV4dHVyZVVuaXQpO1xuXG4gICAgICAgICAgICAgICAgLy8gI2lmIF9ERUJVR1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLnJlbmRlclRhcmdldCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBTZXQgYnJlYWtwb2ludCBoZXJlIHRvIGRlYnVnIFwiU291cmNlIGFuZCBkZXN0aW5hdGlvbiB0ZXh0dXJlcyBvZiB0aGUgZHJhdyBhcmUgdGhlIHNhbWVcIiBlcnJvcnNcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMucmVuZGVyVGFyZ2V0Ll9zYW1wbGVzIDwgMikge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMucmVuZGVyVGFyZ2V0LmNvbG9yQnVmZmVyICYmIHRoaXMucmVuZGVyVGFyZ2V0LmNvbG9yQnVmZmVyID09PSB0ZXh0dXJlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgRGVidWcuZXJyb3IoXCJUcnlpbmcgdG8gYmluZCBjdXJyZW50IGNvbG9yIGJ1ZmZlciBhcyBhIHRleHR1cmVcIiwgeyByZW5kZXJUYXJnZXQ6IHRoaXMucmVuZGVyVGFyZ2V0LCB0ZXh0dXJlIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0aGlzLnJlbmRlclRhcmdldC5kZXB0aEJ1ZmZlciAmJiB0aGlzLnJlbmRlclRhcmdldC5kZXB0aEJ1ZmZlciA9PT0gdGV4dHVyZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIERlYnVnLmVycm9yKFwiVHJ5aW5nIHRvIGJpbmQgY3VycmVudCBkZXB0aCBidWZmZXIgYXMgYSB0ZXh0dXJlXCIsIHsgdGV4dHVyZSB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAvLyAjZW5kaWZcblxuICAgICAgICAgICAgICAgIGlmIChzYW1wbGVyLnNsb3QgIT09IHRleHR1cmVVbml0KSB7XG4gICAgICAgICAgICAgICAgICAgIGdsLnVuaWZvcm0xaShzYW1wbGVyLmxvY2F0aW9uSWQsIHRleHR1cmVVbml0KTtcbiAgICAgICAgICAgICAgICAgICAgc2FtcGxlci5zbG90ID0gdGV4dHVyZVVuaXQ7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRleHR1cmVVbml0Kys7XG4gICAgICAgICAgICB9IGVsc2UgeyAvLyBBcnJheVxuICAgICAgICAgICAgICAgIHNhbXBsZXIuYXJyYXkubGVuZ3RoID0gMDtcbiAgICAgICAgICAgICAgICBudW1UZXh0dXJlcyA9IHNhbXBsZXJWYWx1ZS5sZW5ndGg7XG4gICAgICAgICAgICAgICAgZm9yIChsZXQgaiA9IDA7IGogPCBudW1UZXh0dXJlczsgaisrKSB7XG4gICAgICAgICAgICAgICAgICAgIHRleHR1cmUgPSBzYW1wbGVyVmFsdWVbal07XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0VGV4dHVyZSh0ZXh0dXJlLCB0ZXh0dXJlVW5pdCk7XG5cbiAgICAgICAgICAgICAgICAgICAgc2FtcGxlci5hcnJheVtqXSA9IHRleHR1cmVVbml0O1xuICAgICAgICAgICAgICAgICAgICB0ZXh0dXJlVW5pdCsrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBnbC51bmlmb3JtMWl2KHNhbXBsZXIubG9jYXRpb25JZCwgc2FtcGxlci5hcnJheSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBDb21taXQgYW55IHVwZGF0ZWQgdW5pZm9ybXNcbiAgICAgICAgZm9yIChsZXQgaSA9IDAsIGxlbiA9IHVuaWZvcm1zLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgICAgICB1bmlmb3JtID0gdW5pZm9ybXNbaV07XG4gICAgICAgICAgICBzY29wZUlkID0gdW5pZm9ybS5zY29wZUlkO1xuICAgICAgICAgICAgdW5pZm9ybVZlcnNpb24gPSB1bmlmb3JtLnZlcnNpb247XG4gICAgICAgICAgICBwcm9ncmFtVmVyc2lvbiA9IHNjb3BlSWQudmVyc2lvbk9iamVjdC52ZXJzaW9uO1xuXG4gICAgICAgICAgICAvLyBDaGVjayB0aGUgdmFsdWUgaXMgdmFsaWRcbiAgICAgICAgICAgIGlmICh1bmlmb3JtVmVyc2lvbi5nbG9iYWxJZCAhPT0gcHJvZ3JhbVZlcnNpb24uZ2xvYmFsSWQgfHwgdW5pZm9ybVZlcnNpb24ucmV2aXNpb24gIT09IHByb2dyYW1WZXJzaW9uLnJldmlzaW9uKSB7XG4gICAgICAgICAgICAgICAgdW5pZm9ybVZlcnNpb24uZ2xvYmFsSWQgPSBwcm9ncmFtVmVyc2lvbi5nbG9iYWxJZDtcbiAgICAgICAgICAgICAgICB1bmlmb3JtVmVyc2lvbi5yZXZpc2lvbiA9IHByb2dyYW1WZXJzaW9uLnJldmlzaW9uO1xuXG4gICAgICAgICAgICAgICAgLy8gQ2FsbCB0aGUgZnVuY3Rpb24gdG8gY29tbWl0IHRoZSB1bmlmb3JtIHZhbHVlXG4gICAgICAgICAgICAgICAgaWYgKHNjb3BlSWQudmFsdWUgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jb21taXRGdW5jdGlvblt1bmlmb3JtLmRhdGFUeXBlXSh1bmlmb3JtLCBzY29wZUlkLnZhbHVlKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAvLyBjb21tZW50ZWQgb3V0IHRpbGwgZW5naW5lIGlzc3VlICM0OTcxIGlzIHNvcnRlZCBvdXRcbiAgICAgICAgICAgICAgICAgICAgLy8gRGVidWcud2Fybk9uY2UoYFNoYWRlciBbJHtzaGFkZXIubGFiZWx9XSByZXF1aXJlcyB1bmlmb3JtIFske3VuaWZvcm0uc2NvcGVJZC5uYW1lfV0gd2hpY2ggaGFzIG5vdCBiZWVuIHNldCwgd2hpbGUgcmVuZGVyaW5nIFske0RlYnVnR3JhcGhpY3MudG9TdHJpbmcoKX1dYCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMud2ViZ2wyICYmIHRoaXMudHJhbnNmb3JtRmVlZGJhY2tCdWZmZXIpIHtcbiAgICAgICAgICAgIC8vIEVuYWJsZSBURiwgc3RhcnQgd3JpdGluZyB0byBvdXQgYnVmZmVyXG4gICAgICAgICAgICBnbC5iaW5kQnVmZmVyQmFzZShnbC5UUkFOU0ZPUk1fRkVFREJBQ0tfQlVGRkVSLCAwLCB0aGlzLnRyYW5zZm9ybUZlZWRiYWNrQnVmZmVyLmltcGwuYnVmZmVySWQpO1xuICAgICAgICAgICAgZ2wuYmVnaW5UcmFuc2Zvcm1GZWVkYmFjayhnbC5QT0lOVFMpO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgbW9kZSA9IHRoaXMuZ2xQcmltaXRpdmVbcHJpbWl0aXZlLnR5cGVdO1xuICAgICAgICBjb25zdCBjb3VudCA9IHByaW1pdGl2ZS5jb3VudDtcblxuICAgICAgICBpZiAocHJpbWl0aXZlLmluZGV4ZWQpIHtcbiAgICAgICAgICAgIGNvbnN0IGluZGV4QnVmZmVyID0gdGhpcy5pbmRleEJ1ZmZlcjtcbiAgICAgICAgICAgIERlYnVnLmFzc2VydChpbmRleEJ1ZmZlci5kZXZpY2UgPT09IHRoaXMsIFwiVGhlIEluZGV4QnVmZmVyIHdhcyBub3QgY3JlYXRlZCB1c2luZyBjdXJyZW50IEdyYXBoaWNzRGV2aWNlXCIpO1xuXG4gICAgICAgICAgICBjb25zdCBmb3JtYXQgPSBpbmRleEJ1ZmZlci5pbXBsLmdsRm9ybWF0O1xuICAgICAgICAgICAgY29uc3Qgb2Zmc2V0ID0gcHJpbWl0aXZlLmJhc2UgKiBpbmRleEJ1ZmZlci5ieXRlc1BlckluZGV4O1xuXG4gICAgICAgICAgICBpZiAobnVtSW5zdGFuY2VzID4gMCkge1xuICAgICAgICAgICAgICAgIGdsLmRyYXdFbGVtZW50c0luc3RhbmNlZChtb2RlLCBjb3VudCwgZm9ybWF0LCBvZmZzZXQsIG51bUluc3RhbmNlcyk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGdsLmRyYXdFbGVtZW50cyhtb2RlLCBjb3VudCwgZm9ybWF0LCBvZmZzZXQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc3QgZmlyc3QgPSBwcmltaXRpdmUuYmFzZTtcblxuICAgICAgICAgICAgaWYgKG51bUluc3RhbmNlcyA+IDApIHtcbiAgICAgICAgICAgICAgICBnbC5kcmF3QXJyYXlzSW5zdGFuY2VkKG1vZGUsIGZpcnN0LCBjb3VudCwgbnVtSW5zdGFuY2VzKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZ2wuZHJhd0FycmF5cyhtb2RlLCBmaXJzdCwgY291bnQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMud2ViZ2wyICYmIHRoaXMudHJhbnNmb3JtRmVlZGJhY2tCdWZmZXIpIHtcbiAgICAgICAgICAgIC8vIGRpc2FibGUgVEZcbiAgICAgICAgICAgIGdsLmVuZFRyYW5zZm9ybUZlZWRiYWNrKCk7XG4gICAgICAgICAgICBnbC5iaW5kQnVmZmVyQmFzZShnbC5UUkFOU0ZPUk1fRkVFREJBQ0tfQlVGRkVSLCAwLCBudWxsKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuX2RyYXdDYWxsc1BlckZyYW1lKys7XG5cbiAgICAgICAgLy8gI2lmIF9QUk9GSUxFUlxuICAgICAgICB0aGlzLl9wcmltc1BlckZyYW1lW3ByaW1pdGl2ZS50eXBlXSArPSBwcmltaXRpdmUuY291bnQgKiAobnVtSW5zdGFuY2VzID4gMSA/IG51bUluc3RhbmNlcyA6IDEpO1xuICAgICAgICAvLyAjZW5kaWZcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDbGVhcnMgdGhlIGZyYW1lIGJ1ZmZlciBvZiB0aGUgY3VycmVudGx5IHNldCByZW5kZXIgdGFyZ2V0LlxuICAgICAqXG4gICAgICogQHBhcmFtIHtvYmplY3R9IFtvcHRpb25zXSAtIE9wdGlvbmFsIG9wdGlvbnMgb2JqZWN0IHRoYXQgY29udHJvbHMgdGhlIGJlaGF2aW9yIG9mIHRoZSBjbGVhclxuICAgICAqIG9wZXJhdGlvbiBkZWZpbmVkIGFzIGZvbGxvd3M6XG4gICAgICogQHBhcmFtIHtudW1iZXJbXX0gW29wdGlvbnMuY29sb3JdIC0gVGhlIGNvbG9yIHRvIGNsZWFyIHRoZSBjb2xvciBidWZmZXIgdG8gaW4gdGhlIHJhbmdlIDAgdG9cbiAgICAgKiAxIGZvciBlYWNoIGNvbXBvbmVudC5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gW29wdGlvbnMuZGVwdGhdIC0gVGhlIGRlcHRoIHZhbHVlIHRvIGNsZWFyIHRoZSBkZXB0aCBidWZmZXIgdG8gaW4gdGhlXG4gICAgICogcmFuZ2UgMCB0byAxLiBEZWZhdWx0cyB0byAxLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBbb3B0aW9ucy5mbGFnc10gLSBUaGUgYnVmZmVycyB0byBjbGVhciAodGhlIHR5cGVzIGJlaW5nIGNvbG9yLCBkZXB0aCBhbmRcbiAgICAgKiBzdGVuY2lsKS4gQ2FuIGJlIGFueSBiaXR3aXNlIGNvbWJpbmF0aW9uIG9mOlxuICAgICAqXG4gICAgICogLSB7QGxpbmsgQ0xFQVJGTEFHX0NPTE9SfVxuICAgICAqIC0ge0BsaW5rIENMRUFSRkxBR19ERVBUSH1cbiAgICAgKiAtIHtAbGluayBDTEVBUkZMQUdfU1RFTkNJTH1cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBbb3B0aW9ucy5zdGVuY2lsXSAtIFRoZSBzdGVuY2lsIHZhbHVlIHRvIGNsZWFyIHRoZSBzdGVuY2lsIGJ1ZmZlciB0by5cbiAgICAgKiBEZWZhdWx0cyB0byAwLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogLy8gQ2xlYXIgY29sb3IgYnVmZmVyIHRvIGJsYWNrIGFuZCBkZXB0aCBidWZmZXIgdG8gMVxuICAgICAqIGRldmljZS5jbGVhcigpO1xuICAgICAqXG4gICAgICogLy8gQ2xlYXIganVzdCB0aGUgY29sb3IgYnVmZmVyIHRvIHJlZFxuICAgICAqIGRldmljZS5jbGVhcih7XG4gICAgICogICAgIGNvbG9yOiBbMSwgMCwgMCwgMV0sXG4gICAgICogICAgIGZsYWdzOiBwYy5DTEVBUkZMQUdfQ09MT1JcbiAgICAgKiB9KTtcbiAgICAgKlxuICAgICAqIC8vIENsZWFyIGNvbG9yIGJ1ZmZlciB0byB5ZWxsb3cgYW5kIGRlcHRoIHRvIDEuMFxuICAgICAqIGRldmljZS5jbGVhcih7XG4gICAgICogICAgIGNvbG9yOiBbMSwgMSwgMCwgMV0sXG4gICAgICogICAgIGRlcHRoOiAxLFxuICAgICAqICAgICBmbGFnczogcGMuQ0xFQVJGTEFHX0NPTE9SIHwgcGMuQ0xFQVJGTEFHX0RFUFRIXG4gICAgICogfSk7XG4gICAgICovXG4gICAgY2xlYXIob3B0aW9ucykge1xuICAgICAgICBjb25zdCBkZWZhdWx0T3B0aW9ucyA9IHRoaXMuZGVmYXVsdENsZWFyT3B0aW9ucztcbiAgICAgICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwgZGVmYXVsdE9wdGlvbnM7XG5cbiAgICAgICAgY29uc3QgZmxhZ3MgPSBvcHRpb25zLmZsYWdzID8/IGRlZmF1bHRPcHRpb25zLmZsYWdzO1xuICAgICAgICBpZiAoZmxhZ3MgIT09IDApIHtcbiAgICAgICAgICAgIGNvbnN0IGdsID0gdGhpcy5nbDtcblxuICAgICAgICAgICAgLy8gU2V0IHRoZSBjbGVhciBjb2xvclxuICAgICAgICAgICAgaWYgKGZsYWdzICYgQ0xFQVJGTEFHX0NPTE9SKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgY29sb3IgPSBvcHRpb25zLmNvbG9yID8/IGRlZmF1bHRPcHRpb25zLmNvbG9yO1xuICAgICAgICAgICAgICAgIGNvbnN0IHIgPSBjb2xvclswXTtcbiAgICAgICAgICAgICAgICBjb25zdCBnID0gY29sb3JbMV07XG4gICAgICAgICAgICAgICAgY29uc3QgYiA9IGNvbG9yWzJdO1xuICAgICAgICAgICAgICAgIGNvbnN0IGEgPSBjb2xvclszXTtcblxuICAgICAgICAgICAgICAgIGNvbnN0IGMgPSB0aGlzLmNsZWFyQ29sb3I7XG4gICAgICAgICAgICAgICAgaWYgKChyICE9PSBjLnIpIHx8IChnICE9PSBjLmcpIHx8IChiICE9PSBjLmIpIHx8IChhICE9PSBjLmEpKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZ2wuY2xlYXJDb2xvcihyLCBnLCBiLCBhKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jbGVhckNvbG9yLnNldChyLCBnLCBiLCBhKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB0aGlzLnNldEJsZW5kU3RhdGUoQmxlbmRTdGF0ZS5OT0JMRU5EKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGZsYWdzICYgQ0xFQVJGTEFHX0RFUFRIKSB7XG4gICAgICAgICAgICAgICAgLy8gU2V0IHRoZSBjbGVhciBkZXB0aFxuICAgICAgICAgICAgICAgIGNvbnN0IGRlcHRoID0gb3B0aW9ucy5kZXB0aCA/PyBkZWZhdWx0T3B0aW9ucy5kZXB0aDtcblxuICAgICAgICAgICAgICAgIGlmIChkZXB0aCAhPT0gdGhpcy5jbGVhckRlcHRoKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZ2wuY2xlYXJEZXB0aChkZXB0aCk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY2xlYXJEZXB0aCA9IGRlcHRoO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHRoaXMuc2V0RGVwdGhTdGF0ZShEZXB0aFN0YXRlLldSSVRFREVQVEgpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoZmxhZ3MgJiBDTEVBUkZMQUdfU1RFTkNJTCkge1xuICAgICAgICAgICAgICAgIC8vIFNldCB0aGUgY2xlYXIgc3RlbmNpbFxuICAgICAgICAgICAgICAgIGNvbnN0IHN0ZW5jaWwgPSBvcHRpb25zLnN0ZW5jaWwgPz8gZGVmYXVsdE9wdGlvbnMuc3RlbmNpbDtcbiAgICAgICAgICAgICAgICBpZiAoc3RlbmNpbCAhPT0gdGhpcy5jbGVhclN0ZW5jaWwpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5nbC5jbGVhclN0ZW5jaWwoc3RlbmNpbCk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY2xlYXJTdGVuY2lsID0gc3RlbmNpbDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIENsZWFyIHRoZSBmcmFtZSBidWZmZXJcbiAgICAgICAgICAgIGdsLmNsZWFyKHRoaXMuZ2xDbGVhckZsYWdbZmxhZ3NdKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHN1Ym1pdCgpIHtcbiAgICAgICAgdGhpcy5nbC5mbHVzaCgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJlYWRzIGEgYmxvY2sgb2YgcGl4ZWxzIGZyb20gYSBzcGVjaWZpZWQgcmVjdGFuZ2xlIG9mIHRoZSBjdXJyZW50IGNvbG9yIGZyYW1lYnVmZmVyIGludG8gYW5cbiAgICAgKiBBcnJheUJ1ZmZlclZpZXcgb2JqZWN0LlxuICAgICAqXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHggLSBUaGUgeC1jb29yZGluYXRlIG9mIHRoZSByZWN0YW5nbGUncyBsb3dlci1sZWZ0IGNvcm5lci5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0geSAtIFRoZSB5LWNvb3JkaW5hdGUgb2YgdGhlIHJlY3RhbmdsZSdzIGxvd2VyLWxlZnQgY29ybmVyLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSB3IC0gVGhlIHdpZHRoIG9mIHRoZSByZWN0YW5nbGUsIGluIHBpeGVscy5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gaCAtIFRoZSBoZWlnaHQgb2YgdGhlIHJlY3RhbmdsZSwgaW4gcGl4ZWxzLlxuICAgICAqIEBwYXJhbSB7QXJyYXlCdWZmZXJWaWV3fSBwaXhlbHMgLSBUaGUgQXJyYXlCdWZmZXJWaWV3IG9iamVjdCB0aGF0IGhvbGRzIHRoZSByZXR1cm5lZCBwaXhlbFxuICAgICAqIGRhdGEuXG4gICAgICogQGlnbm9yZVxuICAgICAqL1xuICAgIHJlYWRQaXhlbHMoeCwgeSwgdywgaCwgcGl4ZWxzKSB7XG4gICAgICAgIGNvbnN0IGdsID0gdGhpcy5nbDtcbiAgICAgICAgZ2wucmVhZFBpeGVscyh4LCB5LCB3LCBoLCBnbC5SR0JBLCBnbC5VTlNJR05FRF9CWVRFLCBwaXhlbHMpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEFzeW5jaHJvbm91c2x5IHJlYWRzIGEgYmxvY2sgb2YgcGl4ZWxzIGZyb20gYSBzcGVjaWZpZWQgcmVjdGFuZ2xlIG9mIHRoZSBjdXJyZW50IGNvbG9yIGZyYW1lYnVmZmVyXG4gICAgICogaW50byBhbiBBcnJheUJ1ZmZlclZpZXcgb2JqZWN0LlxuICAgICAqXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHggLSBUaGUgeC1jb29yZGluYXRlIG9mIHRoZSByZWN0YW5nbGUncyBsb3dlci1sZWZ0IGNvcm5lci5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0geSAtIFRoZSB5LWNvb3JkaW5hdGUgb2YgdGhlIHJlY3RhbmdsZSdzIGxvd2VyLWxlZnQgY29ybmVyLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSB3IC0gVGhlIHdpZHRoIG9mIHRoZSByZWN0YW5nbGUsIGluIHBpeGVscy5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gaCAtIFRoZSBoZWlnaHQgb2YgdGhlIHJlY3RhbmdsZSwgaW4gcGl4ZWxzLlxuICAgICAqIEBwYXJhbSB7QXJyYXlCdWZmZXJWaWV3fSBwaXhlbHMgLSBUaGUgQXJyYXlCdWZmZXJWaWV3IG9iamVjdCB0aGF0IGhvbGRzIHRoZSByZXR1cm5lZCBwaXhlbFxuICAgICAqIGRhdGEuXG4gICAgICogQGlnbm9yZVxuICAgICAqL1xuICAgIGFzeW5jIHJlYWRQaXhlbHNBc3luYyh4LCB5LCB3LCBoLCBwaXhlbHMpIHtcbiAgICAgICAgY29uc3QgZ2wgPSB0aGlzLmdsO1xuXG4gICAgICAgIGlmICghdGhpcy53ZWJnbDIpIHtcbiAgICAgICAgICAgIC8vIGFzeW5jIGZlbmNlcyBhcmVuJ3Qgc3VwcG9ydGVkIG9uIHdlYmdsMVxuICAgICAgICAgICAgdGhpcy5yZWFkUGl4ZWxzKHgsIHksIHcsIGgsIHBpeGVscyk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBjbGllbnRXYWl0QXN5bmMgPSAoZmxhZ3MsIGludGVydmFsX21zKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBzeW5jID0gZ2wuZmVuY2VTeW5jKGdsLlNZTkNfR1BVX0NPTU1BTkRTX0NPTVBMRVRFLCAwKTtcbiAgICAgICAgICAgIHRoaXMuc3VibWl0KCk7XG5cbiAgICAgICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgICAgICAgICAgZnVuY3Rpb24gdGVzdCgpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVzID0gZ2wuY2xpZW50V2FpdFN5bmMoc3luYywgZmxhZ3MsIDApO1xuICAgICAgICAgICAgICAgICAgICBpZiAocmVzID09PSBnbC5XQUlUX0ZBSUxFRCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZ2wuZGVsZXRlU3luYyhzeW5jKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IoJ3dlYmdsIGNsaWVudFdhaXRTeW5jIHN5bmMgZmFpbGVkJykpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHJlcyA9PT0gZ2wuVElNRU9VVF9FWFBJUkVEKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZXRUaW1lb3V0KHRlc3QsIGludGVydmFsX21zKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGdsLmRlbGV0ZVN5bmMoc3luYyk7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdGVzdCgpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3QgaW1wbCA9IHRoaXMucmVuZGVyVGFyZ2V0LmNvbG9yQnVmZmVyPy5pbXBsO1xuICAgICAgICBjb25zdCBmb3JtYXQgPSBpbXBsPy5fZ2xGb3JtYXQgPz8gZ2wuUkdCQTtcbiAgICAgICAgY29uc3QgcGl4ZWxUeXBlID0gaW1wbD8uX2dsUGl4ZWxUeXBlID8/IGdsLlVOU0lHTkVEX0JZVEU7XG5cbiAgICAgICAgLy8gY3JlYXRlIHRlbXBvcmFyeSAoZ3B1LXNpZGUpIGJ1ZmZlciBhbmQgY29weSBkYXRhIGludG8gaXRcbiAgICAgICAgY29uc3QgYnVmID0gZ2wuY3JlYXRlQnVmZmVyKCk7XG4gICAgICAgIGdsLmJpbmRCdWZmZXIoZ2wuUElYRUxfUEFDS19CVUZGRVIsIGJ1Zik7XG4gICAgICAgIGdsLmJ1ZmZlckRhdGEoZ2wuUElYRUxfUEFDS19CVUZGRVIsIHBpeGVscy5ieXRlTGVuZ3RoLCBnbC5TVFJFQU1fUkVBRCk7XG4gICAgICAgIGdsLnJlYWRQaXhlbHMoeCwgeSwgdywgaCwgZm9ybWF0LCBwaXhlbFR5cGUsIDApO1xuICAgICAgICBnbC5iaW5kQnVmZmVyKGdsLlBJWEVMX1BBQ0tfQlVGRkVSLCBudWxsKTtcblxuICAgICAgICAvLyBhc3luYyB3YWl0IGZvciBwcmV2aW91cyByZWFkIHRvIGZpbmlzaFxuICAgICAgICBhd2FpdCBjbGllbnRXYWl0QXN5bmMoMCwgMjApO1xuXG4gICAgICAgIC8vIGNvcHkgdGhlIHJlc3VsdGluZyBkYXRhIG9uY2UgaXQncyBhcnJpdmVkXG4gICAgICAgIGdsLmJpbmRCdWZmZXIoZ2wuUElYRUxfUEFDS19CVUZGRVIsIGJ1Zik7XG4gICAgICAgIGdsLmdldEJ1ZmZlclN1YkRhdGEoZ2wuUElYRUxfUEFDS19CVUZGRVIsIDAsIHBpeGVscyk7XG4gICAgICAgIGdsLmJpbmRCdWZmZXIoZ2wuUElYRUxfUEFDS19CVUZGRVIsIG51bGwpO1xuICAgICAgICBnbC5kZWxldGVCdWZmZXIoYnVmKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBFbmFibGVzIG9yIGRpc2FibGVzIGFscGhhIHRvIGNvdmVyYWdlIChXZWJHTDIgb25seSkuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IHN0YXRlIC0gVHJ1ZSB0byBlbmFibGUgYWxwaGEgdG8gY292ZXJhZ2UgYW5kIGZhbHNlIHRvIGRpc2FibGUgaXQuXG4gICAgICogQGlnbm9yZVxuICAgICAqL1xuICAgIHNldEFscGhhVG9Db3ZlcmFnZShzdGF0ZSkge1xuICAgICAgICBpZiAoIXRoaXMud2ViZ2wyKSByZXR1cm47XG4gICAgICAgIGlmICh0aGlzLmFscGhhVG9Db3ZlcmFnZSA9PT0gc3RhdGUpIHJldHVybjtcbiAgICAgICAgdGhpcy5hbHBoYVRvQ292ZXJhZ2UgPSBzdGF0ZTtcblxuICAgICAgICBpZiAoc3RhdGUpIHtcbiAgICAgICAgICAgIHRoaXMuZ2wuZW5hYmxlKHRoaXMuZ2wuU0FNUExFX0FMUEhBX1RPX0NPVkVSQUdFKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuZ2wuZGlzYWJsZSh0aGlzLmdsLlNBTVBMRV9BTFBIQV9UT19DT1ZFUkFHRSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHRoZSBvdXRwdXQgdmVydGV4IGJ1ZmZlci4gSXQgd2lsbCBiZSB3cml0dGVuIHRvIGJ5IGEgc2hhZGVyIHdpdGggdHJhbnNmb3JtIGZlZWRiYWNrXG4gICAgICogdmFyeWluZ3MuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi4vdmVydGV4LWJ1ZmZlci5qcycpLlZlcnRleEJ1ZmZlcn0gdGYgLSBUaGUgb3V0cHV0IHZlcnRleCBidWZmZXIuXG4gICAgICogQGlnbm9yZVxuICAgICAqL1xuICAgIHNldFRyYW5zZm9ybUZlZWRiYWNrQnVmZmVyKHRmKSB7XG4gICAgICAgIGlmICh0aGlzLnRyYW5zZm9ybUZlZWRiYWNrQnVmZmVyID09PSB0ZilcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICB0aGlzLnRyYW5zZm9ybUZlZWRiYWNrQnVmZmVyID0gdGY7XG5cbiAgICAgICAgaWYgKHRoaXMud2ViZ2wyKSB7XG4gICAgICAgICAgICBjb25zdCBnbCA9IHRoaXMuZ2w7XG4gICAgICAgICAgICBpZiAodGYpIHtcbiAgICAgICAgICAgICAgICBpZiAoIXRoaXMuZmVlZGJhY2spIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5mZWVkYmFjayA9IGdsLmNyZWF0ZVRyYW5zZm9ybUZlZWRiYWNrKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGdsLmJpbmRUcmFuc2Zvcm1GZWVkYmFjayhnbC5UUkFOU0ZPUk1fRkVFREJBQ0ssIHRoaXMuZmVlZGJhY2spO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBnbC5iaW5kVHJhbnNmb3JtRmVlZGJhY2soZ2wuVFJBTlNGT1JNX0ZFRURCQUNLLCBudWxsKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRvZ2dsZXMgdGhlIHJhc3Rlcml6YXRpb24gcmVuZGVyIHN0YXRlLiBVc2VmdWwgd2l0aCB0cmFuc2Zvcm0gZmVlZGJhY2ssIHdoZW4geW91IG9ubHkgbmVlZFxuICAgICAqIHRvIHByb2Nlc3MgdGhlIGRhdGEgd2l0aG91dCBkcmF3aW5nLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtib29sZWFufSBvbiAtIFRydWUgdG8gZW5hYmxlIHJhc3Rlcml6YXRpb24gYW5kIGZhbHNlIHRvIGRpc2FibGUgaXQuXG4gICAgICogQGlnbm9yZVxuICAgICAqL1xuICAgIHNldFJhc3Rlcihvbikge1xuICAgICAgICBpZiAodGhpcy5yYXN0ZXIgPT09IG9uKSByZXR1cm47XG5cbiAgICAgICAgdGhpcy5yYXN0ZXIgPSBvbjtcblxuICAgICAgICBpZiAodGhpcy53ZWJnbDIpIHtcbiAgICAgICAgICAgIGlmIChvbikge1xuICAgICAgICAgICAgICAgIHRoaXMuZ2wuZGlzYWJsZSh0aGlzLmdsLlJBU1RFUklaRVJfRElTQ0FSRCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMuZ2wuZW5hYmxlKHRoaXMuZ2wuUkFTVEVSSVpFUl9ESVNDQVJEKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRvZ2dsZXMgdGhlIHBvbHlnb24gb2Zmc2V0IHJlbmRlciBzdGF0ZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gb24gLSBUcnVlIHRvIGVuYWJsZSBwb2x5Z29uIG9mZnNldCBhbmQgZmFsc2UgdG8gZGlzYWJsZSBpdC5cbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgc2V0RGVwdGhCaWFzKG9uKSB7XG4gICAgICAgIGlmICh0aGlzLmRlcHRoQmlhc0VuYWJsZWQgPT09IG9uKSByZXR1cm47XG5cbiAgICAgICAgdGhpcy5kZXB0aEJpYXNFbmFibGVkID0gb247XG5cbiAgICAgICAgaWYgKG9uKSB7XG4gICAgICAgICAgICB0aGlzLmdsLmVuYWJsZSh0aGlzLmdsLlBPTFlHT05fT0ZGU0VUX0ZJTEwpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5nbC5kaXNhYmxlKHRoaXMuZ2wuUE9MWUdPTl9PRkZTRVRfRklMTCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTcGVjaWZpZXMgdGhlIHNjYWxlIGZhY3RvciBhbmQgdW5pdHMgdG8gY2FsY3VsYXRlIGRlcHRoIHZhbHVlcy4gVGhlIG9mZnNldCBpcyBhZGRlZCBiZWZvcmVcbiAgICAgKiB0aGUgZGVwdGggdGVzdCBpcyBwZXJmb3JtZWQgYW5kIGJlZm9yZSB0aGUgdmFsdWUgaXMgd3JpdHRlbiBpbnRvIHRoZSBkZXB0aCBidWZmZXIuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gY29uc3RCaWFzIC0gVGhlIG11bHRpcGxpZXIgYnkgd2hpY2ggYW4gaW1wbGVtZW50YXRpb24tc3BlY2lmaWMgdmFsdWUgaXNcbiAgICAgKiBtdWx0aXBsaWVkIHdpdGggdG8gY3JlYXRlIGEgY29uc3RhbnQgZGVwdGggb2Zmc2V0LlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBzbG9wZUJpYXMgLSBUaGUgc2NhbGUgZmFjdG9yIGZvciB0aGUgdmFyaWFibGUgZGVwdGggb2Zmc2V0IGZvciBlYWNoIHBvbHlnb24uXG4gICAgICogQGlnbm9yZVxuICAgICAqL1xuICAgIHNldERlcHRoQmlhc1ZhbHVlcyhjb25zdEJpYXMsIHNsb3BlQmlhcykge1xuICAgICAgICB0aGlzLmdsLnBvbHlnb25PZmZzZXQoc2xvcGVCaWFzLCBjb25zdEJpYXMpO1xuICAgIH1cblxuICAgIHNldFN0ZW5jaWxUZXN0KGVuYWJsZSkge1xuICAgICAgICBpZiAodGhpcy5zdGVuY2lsICE9PSBlbmFibGUpIHtcbiAgICAgICAgICAgIGNvbnN0IGdsID0gdGhpcy5nbDtcbiAgICAgICAgICAgIGlmIChlbmFibGUpIHtcbiAgICAgICAgICAgICAgICBnbC5lbmFibGUoZ2wuU1RFTkNJTF9URVNUKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZ2wuZGlzYWJsZShnbC5TVEVOQ0lMX1RFU1QpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5zdGVuY2lsID0gZW5hYmxlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgc2V0U3RlbmNpbEZ1bmMoZnVuYywgcmVmLCBtYXNrKSB7XG4gICAgICAgIGlmICh0aGlzLnN0ZW5jaWxGdW5jRnJvbnQgIT09IGZ1bmMgfHwgdGhpcy5zdGVuY2lsUmVmRnJvbnQgIT09IHJlZiB8fCB0aGlzLnN0ZW5jaWxNYXNrRnJvbnQgIT09IG1hc2sgfHxcbiAgICAgICAgICAgIHRoaXMuc3RlbmNpbEZ1bmNCYWNrICE9PSBmdW5jIHx8IHRoaXMuc3RlbmNpbFJlZkJhY2sgIT09IHJlZiB8fCB0aGlzLnN0ZW5jaWxNYXNrQmFjayAhPT0gbWFzaykge1xuICAgICAgICAgICAgdGhpcy5nbC5zdGVuY2lsRnVuYyh0aGlzLmdsQ29tcGFyaXNvbltmdW5jXSwgcmVmLCBtYXNrKTtcbiAgICAgICAgICAgIHRoaXMuc3RlbmNpbEZ1bmNGcm9udCA9IHRoaXMuc3RlbmNpbEZ1bmNCYWNrID0gZnVuYztcbiAgICAgICAgICAgIHRoaXMuc3RlbmNpbFJlZkZyb250ID0gdGhpcy5zdGVuY2lsUmVmQmFjayA9IHJlZjtcbiAgICAgICAgICAgIHRoaXMuc3RlbmNpbE1hc2tGcm9udCA9IHRoaXMuc3RlbmNpbE1hc2tCYWNrID0gbWFzaztcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHNldFN0ZW5jaWxGdW5jRnJvbnQoZnVuYywgcmVmLCBtYXNrKSB7XG4gICAgICAgIGlmICh0aGlzLnN0ZW5jaWxGdW5jRnJvbnQgIT09IGZ1bmMgfHwgdGhpcy5zdGVuY2lsUmVmRnJvbnQgIT09IHJlZiB8fCB0aGlzLnN0ZW5jaWxNYXNrRnJvbnQgIT09IG1hc2spIHtcbiAgICAgICAgICAgIGNvbnN0IGdsID0gdGhpcy5nbDtcbiAgICAgICAgICAgIGdsLnN0ZW5jaWxGdW5jU2VwYXJhdGUoZ2wuRlJPTlQsIHRoaXMuZ2xDb21wYXJpc29uW2Z1bmNdLCByZWYsIG1hc2spO1xuICAgICAgICAgICAgdGhpcy5zdGVuY2lsRnVuY0Zyb250ID0gZnVuYztcbiAgICAgICAgICAgIHRoaXMuc3RlbmNpbFJlZkZyb250ID0gcmVmO1xuICAgICAgICAgICAgdGhpcy5zdGVuY2lsTWFza0Zyb250ID0gbWFzaztcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHNldFN0ZW5jaWxGdW5jQmFjayhmdW5jLCByZWYsIG1hc2spIHtcbiAgICAgICAgaWYgKHRoaXMuc3RlbmNpbEZ1bmNCYWNrICE9PSBmdW5jIHx8IHRoaXMuc3RlbmNpbFJlZkJhY2sgIT09IHJlZiB8fCB0aGlzLnN0ZW5jaWxNYXNrQmFjayAhPT0gbWFzaykge1xuICAgICAgICAgICAgY29uc3QgZ2wgPSB0aGlzLmdsO1xuICAgICAgICAgICAgZ2wuc3RlbmNpbEZ1bmNTZXBhcmF0ZShnbC5CQUNLLCB0aGlzLmdsQ29tcGFyaXNvbltmdW5jXSwgcmVmLCBtYXNrKTtcbiAgICAgICAgICAgIHRoaXMuc3RlbmNpbEZ1bmNCYWNrID0gZnVuYztcbiAgICAgICAgICAgIHRoaXMuc3RlbmNpbFJlZkJhY2sgPSByZWY7XG4gICAgICAgICAgICB0aGlzLnN0ZW5jaWxNYXNrQmFjayA9IG1hc2s7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBzZXRTdGVuY2lsT3BlcmF0aW9uKGZhaWwsIHpmYWlsLCB6cGFzcywgd3JpdGVNYXNrKSB7XG4gICAgICAgIGlmICh0aGlzLnN0ZW5jaWxGYWlsRnJvbnQgIT09IGZhaWwgfHwgdGhpcy5zdGVuY2lsWmZhaWxGcm9udCAhPT0gemZhaWwgfHwgdGhpcy5zdGVuY2lsWnBhc3NGcm9udCAhPT0genBhc3MgfHxcbiAgICAgICAgICAgIHRoaXMuc3RlbmNpbEZhaWxCYWNrICE9PSBmYWlsIHx8IHRoaXMuc3RlbmNpbFpmYWlsQmFjayAhPT0gemZhaWwgfHwgdGhpcy5zdGVuY2lsWnBhc3NCYWNrICE9PSB6cGFzcykge1xuICAgICAgICAgICAgdGhpcy5nbC5zdGVuY2lsT3AodGhpcy5nbFN0ZW5jaWxPcFtmYWlsXSwgdGhpcy5nbFN0ZW5jaWxPcFt6ZmFpbF0sIHRoaXMuZ2xTdGVuY2lsT3BbenBhc3NdKTtcbiAgICAgICAgICAgIHRoaXMuc3RlbmNpbEZhaWxGcm9udCA9IHRoaXMuc3RlbmNpbEZhaWxCYWNrID0gZmFpbDtcbiAgICAgICAgICAgIHRoaXMuc3RlbmNpbFpmYWlsRnJvbnQgPSB0aGlzLnN0ZW5jaWxaZmFpbEJhY2sgPSB6ZmFpbDtcbiAgICAgICAgICAgIHRoaXMuc3RlbmNpbFpwYXNzRnJvbnQgPSB0aGlzLnN0ZW5jaWxacGFzc0JhY2sgPSB6cGFzcztcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5zdGVuY2lsV3JpdGVNYXNrRnJvbnQgIT09IHdyaXRlTWFzayB8fCB0aGlzLnN0ZW5jaWxXcml0ZU1hc2tCYWNrICE9PSB3cml0ZU1hc2spIHtcbiAgICAgICAgICAgIHRoaXMuZ2wuc3RlbmNpbE1hc2sod3JpdGVNYXNrKTtcbiAgICAgICAgICAgIHRoaXMuc3RlbmNpbFdyaXRlTWFza0Zyb250ID0gd3JpdGVNYXNrO1xuICAgICAgICAgICAgdGhpcy5zdGVuY2lsV3JpdGVNYXNrQmFjayA9IHdyaXRlTWFzaztcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHNldFN0ZW5jaWxPcGVyYXRpb25Gcm9udChmYWlsLCB6ZmFpbCwgenBhc3MsIHdyaXRlTWFzaykge1xuICAgICAgICBpZiAodGhpcy5zdGVuY2lsRmFpbEZyb250ICE9PSBmYWlsIHx8IHRoaXMuc3RlbmNpbFpmYWlsRnJvbnQgIT09IHpmYWlsIHx8IHRoaXMuc3RlbmNpbFpwYXNzRnJvbnQgIT09IHpwYXNzKSB7XG4gICAgICAgICAgICB0aGlzLmdsLnN0ZW5jaWxPcFNlcGFyYXRlKHRoaXMuZ2wuRlJPTlQsIHRoaXMuZ2xTdGVuY2lsT3BbZmFpbF0sIHRoaXMuZ2xTdGVuY2lsT3BbemZhaWxdLCB0aGlzLmdsU3RlbmNpbE9wW3pwYXNzXSk7XG4gICAgICAgICAgICB0aGlzLnN0ZW5jaWxGYWlsRnJvbnQgPSBmYWlsO1xuICAgICAgICAgICAgdGhpcy5zdGVuY2lsWmZhaWxGcm9udCA9IHpmYWlsO1xuICAgICAgICAgICAgdGhpcy5zdGVuY2lsWnBhc3NGcm9udCA9IHpwYXNzO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLnN0ZW5jaWxXcml0ZU1hc2tGcm9udCAhPT0gd3JpdGVNYXNrKSB7XG4gICAgICAgICAgICB0aGlzLmdsLnN0ZW5jaWxNYXNrU2VwYXJhdGUodGhpcy5nbC5GUk9OVCwgd3JpdGVNYXNrKTtcbiAgICAgICAgICAgIHRoaXMuc3RlbmNpbFdyaXRlTWFza0Zyb250ID0gd3JpdGVNYXNrO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgc2V0U3RlbmNpbE9wZXJhdGlvbkJhY2soZmFpbCwgemZhaWwsIHpwYXNzLCB3cml0ZU1hc2spIHtcbiAgICAgICAgaWYgKHRoaXMuc3RlbmNpbEZhaWxCYWNrICE9PSBmYWlsIHx8IHRoaXMuc3RlbmNpbFpmYWlsQmFjayAhPT0gemZhaWwgfHwgdGhpcy5zdGVuY2lsWnBhc3NCYWNrICE9PSB6cGFzcykge1xuICAgICAgICAgICAgdGhpcy5nbC5zdGVuY2lsT3BTZXBhcmF0ZSh0aGlzLmdsLkJBQ0ssIHRoaXMuZ2xTdGVuY2lsT3BbZmFpbF0sIHRoaXMuZ2xTdGVuY2lsT3BbemZhaWxdLCB0aGlzLmdsU3RlbmNpbE9wW3pwYXNzXSk7XG4gICAgICAgICAgICB0aGlzLnN0ZW5jaWxGYWlsQmFjayA9IGZhaWw7XG4gICAgICAgICAgICB0aGlzLnN0ZW5jaWxaZmFpbEJhY2sgPSB6ZmFpbDtcbiAgICAgICAgICAgIHRoaXMuc3RlbmNpbFpwYXNzQmFjayA9IHpwYXNzO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLnN0ZW5jaWxXcml0ZU1hc2tCYWNrICE9PSB3cml0ZU1hc2spIHtcbiAgICAgICAgICAgIHRoaXMuZ2wuc3RlbmNpbE1hc2tTZXBhcmF0ZSh0aGlzLmdsLkJBQ0ssIHdyaXRlTWFzayk7XG4gICAgICAgICAgICB0aGlzLnN0ZW5jaWxXcml0ZU1hc2tCYWNrID0gd3JpdGVNYXNrO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgc2V0QmxlbmRTdGF0ZShibGVuZFN0YXRlKSB7XG4gICAgICAgIGNvbnN0IGN1cnJlbnRCbGVuZFN0YXRlID0gdGhpcy5ibGVuZFN0YXRlO1xuICAgICAgICBpZiAoIWN1cnJlbnRCbGVuZFN0YXRlLmVxdWFscyhibGVuZFN0YXRlKSkge1xuICAgICAgICAgICAgY29uc3QgZ2wgPSB0aGlzLmdsO1xuXG4gICAgICAgICAgICAvLyBzdGF0ZSB2YWx1ZXMgdG8gc2V0XG4gICAgICAgICAgICBjb25zdCB7IGJsZW5kLCBjb2xvck9wLCBhbHBoYU9wLCBjb2xvclNyY0ZhY3RvciwgY29sb3JEc3RGYWN0b3IsIGFscGhhU3JjRmFjdG9yLCBhbHBoYURzdEZhY3RvciB9ID0gYmxlbmRTdGF0ZTtcblxuICAgICAgICAgICAgLy8gZW5hYmxlIGJsZW5kXG4gICAgICAgICAgICBpZiAoY3VycmVudEJsZW5kU3RhdGUuYmxlbmQgIT09IGJsZW5kKSB7XG4gICAgICAgICAgICAgICAgaWYgKGJsZW5kKSB7XG4gICAgICAgICAgICAgICAgICAgIGdsLmVuYWJsZShnbC5CTEVORCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgZ2wuZGlzYWJsZShnbC5CTEVORCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBibGVuZCBvcHNcbiAgICAgICAgICAgIGlmIChjdXJyZW50QmxlbmRTdGF0ZS5jb2xvck9wICE9PSBjb2xvck9wIHx8IGN1cnJlbnRCbGVuZFN0YXRlLmFscGhhT3AgIT09IGFscGhhT3ApIHtcbiAgICAgICAgICAgICAgICBjb25zdCBnbEJsZW5kRXF1YXRpb24gPSB0aGlzLmdsQmxlbmRFcXVhdGlvbjtcbiAgICAgICAgICAgICAgICBnbC5ibGVuZEVxdWF0aW9uU2VwYXJhdGUoZ2xCbGVuZEVxdWF0aW9uW2NvbG9yT3BdLCBnbEJsZW5kRXF1YXRpb25bYWxwaGFPcF0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBibGVuZCBmYWN0b3JzXG4gICAgICAgICAgICBpZiAoY3VycmVudEJsZW5kU3RhdGUuY29sb3JTcmNGYWN0b3IgIT09IGNvbG9yU3JjRmFjdG9yIHx8IGN1cnJlbnRCbGVuZFN0YXRlLmNvbG9yRHN0RmFjdG9yICE9PSBjb2xvckRzdEZhY3RvciB8fFxuICAgICAgICAgICAgICAgIGN1cnJlbnRCbGVuZFN0YXRlLmFscGhhU3JjRmFjdG9yICE9PSBhbHBoYVNyY0ZhY3RvciB8fCBjdXJyZW50QmxlbmRTdGF0ZS5hbHBoYURzdEZhY3RvciAhPT0gYWxwaGFEc3RGYWN0b3IpIHtcblxuICAgICAgICAgICAgICAgIGdsLmJsZW5kRnVuY1NlcGFyYXRlKHRoaXMuZ2xCbGVuZEZ1bmN0aW9uQ29sb3JbY29sb3JTcmNGYWN0b3JdLCB0aGlzLmdsQmxlbmRGdW5jdGlvbkNvbG9yW2NvbG9yRHN0RmFjdG9yXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmdsQmxlbmRGdW5jdGlvbkFscGhhW2FscGhhU3JjRmFjdG9yXSwgdGhpcy5nbEJsZW5kRnVuY3Rpb25BbHBoYVthbHBoYURzdEZhY3Rvcl0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBjb2xvciB3cml0ZVxuICAgICAgICAgICAgaWYgKGN1cnJlbnRCbGVuZFN0YXRlLmFsbFdyaXRlICE9PSBibGVuZFN0YXRlLmFsbFdyaXRlKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5nbC5jb2xvck1hc2soYmxlbmRTdGF0ZS5yZWRXcml0ZSwgYmxlbmRTdGF0ZS5ncmVlbldyaXRlLCBibGVuZFN0YXRlLmJsdWVXcml0ZSwgYmxlbmRTdGF0ZS5hbHBoYVdyaXRlKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gdXBkYXRlIGludGVybmFsIHN0YXRlXG4gICAgICAgICAgICBjdXJyZW50QmxlbmRTdGF0ZS5jb3B5KGJsZW5kU3RhdGUpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0IHRoZSBzb3VyY2UgYW5kIGRlc3RpbmF0aW9uIGJsZW5kaW5nIGZhY3RvcnMuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gciAtIFRoZSByZWQgY29tcG9uZW50IGluIHRoZSByYW5nZSBvZiAwIHRvIDEuIERlZmF1bHQgdmFsdWUgaXMgMC5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gZyAtIFRoZSBncmVlbiBjb21wb25lbnQgaW4gdGhlIHJhbmdlIG9mIDAgdG8gMS4gRGVmYXVsdCB2YWx1ZSBpcyAwLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBiIC0gVGhlIGJsdWUgY29tcG9uZW50IGluIHRoZSByYW5nZSBvZiAwIHRvIDEuIERlZmF1bHQgdmFsdWUgaXMgMC5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gYSAtIFRoZSBhbHBoYSBjb21wb25lbnQgaW4gdGhlIHJhbmdlIG9mIDAgdG8gMS4gRGVmYXVsdCB2YWx1ZSBpcyAwLlxuICAgICAqIEBpZ25vcmVcbiAgICAgKi9cbiAgICBzZXRCbGVuZENvbG9yKHIsIGcsIGIsIGEpIHtcbiAgICAgICAgY29uc3QgYyA9IHRoaXMuYmxlbmRDb2xvcjtcbiAgICAgICAgaWYgKChyICE9PSBjLnIpIHx8IChnICE9PSBjLmcpIHx8IChiICE9PSBjLmIpIHx8IChhICE9PSBjLmEpKSB7XG4gICAgICAgICAgICB0aGlzLmdsLmJsZW5kQ29sb3IociwgZywgYiwgYSk7XG4gICAgICAgICAgICBjLnNldChyLCBnLCBiLCBhKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHNldFN0ZW5jaWxTdGF0ZShzdGVuY2lsRnJvbnQsIHN0ZW5jaWxCYWNrKSB7XG4gICAgICAgIGlmIChzdGVuY2lsRnJvbnQgfHwgc3RlbmNpbEJhY2spIHtcbiAgICAgICAgICAgIHRoaXMuc2V0U3RlbmNpbFRlc3QodHJ1ZSk7XG4gICAgICAgICAgICBpZiAoc3RlbmNpbEZyb250ID09PSBzdGVuY2lsQmFjaykge1xuXG4gICAgICAgICAgICAgICAgLy8gaWRlbnRpY2FsIGZyb250L2JhY2sgc3RlbmNpbFxuICAgICAgICAgICAgICAgIHRoaXMuc2V0U3RlbmNpbEZ1bmMoc3RlbmNpbEZyb250LmZ1bmMsIHN0ZW5jaWxGcm9udC5yZWYsIHN0ZW5jaWxGcm9udC5yZWFkTWFzayk7XG4gICAgICAgICAgICAgICAgdGhpcy5zZXRTdGVuY2lsT3BlcmF0aW9uKHN0ZW5jaWxGcm9udC5mYWlsLCBzdGVuY2lsRnJvbnQuemZhaWwsIHN0ZW5jaWxGcm9udC56cGFzcywgc3RlbmNpbEZyb250LndyaXRlTWFzayk7XG5cbiAgICAgICAgICAgIH0gZWxzZSB7XG5cbiAgICAgICAgICAgICAgICAvLyBmcm9udFxuICAgICAgICAgICAgICAgIHN0ZW5jaWxGcm9udCA/Pz0gU3RlbmNpbFBhcmFtZXRlcnMuREVGQVVMVDtcbiAgICAgICAgICAgICAgICB0aGlzLnNldFN0ZW5jaWxGdW5jRnJvbnQoc3RlbmNpbEZyb250LmZ1bmMsIHN0ZW5jaWxGcm9udC5yZWYsIHN0ZW5jaWxGcm9udC5yZWFkTWFzayk7XG4gICAgICAgICAgICAgICAgdGhpcy5zZXRTdGVuY2lsT3BlcmF0aW9uRnJvbnQoc3RlbmNpbEZyb250LmZhaWwsIHN0ZW5jaWxGcm9udC56ZmFpbCwgc3RlbmNpbEZyb250LnpwYXNzLCBzdGVuY2lsRnJvbnQud3JpdGVNYXNrKTtcblxuICAgICAgICAgICAgICAgIC8vIGJhY2tcbiAgICAgICAgICAgICAgICBzdGVuY2lsQmFjayA/Pz0gU3RlbmNpbFBhcmFtZXRlcnMuREVGQVVMVDtcbiAgICAgICAgICAgICAgICB0aGlzLnNldFN0ZW5jaWxGdW5jQmFjayhzdGVuY2lsQmFjay5mdW5jLCBzdGVuY2lsQmFjay5yZWYsIHN0ZW5jaWxCYWNrLnJlYWRNYXNrKTtcbiAgICAgICAgICAgICAgICB0aGlzLnNldFN0ZW5jaWxPcGVyYXRpb25CYWNrKHN0ZW5jaWxCYWNrLmZhaWwsIHN0ZW5jaWxCYWNrLnpmYWlsLCBzdGVuY2lsQmFjay56cGFzcywgc3RlbmNpbEJhY2sud3JpdGVNYXNrKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuc2V0U3RlbmNpbFRlc3QoZmFsc2UpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgc2V0RGVwdGhTdGF0ZShkZXB0aFN0YXRlKSB7XG4gICAgICAgIGNvbnN0IGN1cnJlbnREZXB0aFN0YXRlID0gdGhpcy5kZXB0aFN0YXRlO1xuICAgICAgICBpZiAoIWN1cnJlbnREZXB0aFN0YXRlLmVxdWFscyhkZXB0aFN0YXRlKSkge1xuICAgICAgICAgICAgY29uc3QgZ2wgPSB0aGlzLmdsO1xuXG4gICAgICAgICAgICAvLyB3cml0ZVxuICAgICAgICAgICAgY29uc3Qgd3JpdGUgPSBkZXB0aFN0YXRlLndyaXRlO1xuICAgICAgICAgICAgaWYgKGN1cnJlbnREZXB0aFN0YXRlLndyaXRlICE9PSB3cml0ZSkge1xuICAgICAgICAgICAgICAgIGdsLmRlcHRoTWFzayh3cml0ZSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIGhhbmRsZSBjYXNlIHdoZXJlIGRlcHRoIHRlc3RpbmcgaXMgb2ZmLCBidXQgZGVwdGggd3JpdGUgaXMgb24gPT4gZW5hYmxlIGFsd2F5cyB0ZXN0IHRvIGRlcHRoIHdyaXRlXG4gICAgICAgICAgICAvLyBOb3RlIG9uIFdlYkdMIEFQSSBiZWhhdmlvcjogV2hlbiBkZXB0aCB0ZXN0aW5nIGlzIGRpc2FibGVkLCB3cml0ZXMgdG8gdGhlIGRlcHRoIGJ1ZmZlciBhcmUgYWxzbyBkaXNhYmxlZC5cbiAgICAgICAgICAgIGxldCB7IGZ1bmMsIHRlc3QgfSA9IGRlcHRoU3RhdGU7XG4gICAgICAgICAgICBpZiAoIXRlc3QgJiYgd3JpdGUpIHtcbiAgICAgICAgICAgICAgICB0ZXN0ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBmdW5jID0gRlVOQ19BTFdBWVM7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChjdXJyZW50RGVwdGhTdGF0ZS5mdW5jICE9PSBmdW5jKSB7XG4gICAgICAgICAgICAgICAgZ2wuZGVwdGhGdW5jKHRoaXMuZ2xDb21wYXJpc29uW2Z1bmNdKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGN1cnJlbnREZXB0aFN0YXRlLnRlc3QgIT09IHRlc3QpIHtcbiAgICAgICAgICAgICAgICBpZiAodGVzdCkge1xuICAgICAgICAgICAgICAgICAgICBnbC5lbmFibGUoZ2wuREVQVEhfVEVTVCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgZ2wuZGlzYWJsZShnbC5ERVBUSF9URVNUKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIHVwZGF0ZSBpbnRlcm5hbCBzdGF0ZVxuICAgICAgICAgICAgY3VycmVudERlcHRoU3RhdGUuY29weShkZXB0aFN0YXRlKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHNldEN1bGxNb2RlKGN1bGxNb2RlKSB7XG4gICAgICAgIGlmICh0aGlzLmN1bGxNb2RlICE9PSBjdWxsTW9kZSkge1xuICAgICAgICAgICAgaWYgKGN1bGxNb2RlID09PSBDVUxMRkFDRV9OT05FKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5nbC5kaXNhYmxlKHRoaXMuZ2wuQ1VMTF9GQUNFKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuY3VsbE1vZGUgPT09IENVTExGQUNFX05PTkUpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5nbC5lbmFibGUodGhpcy5nbC5DVUxMX0ZBQ0UpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGNvbnN0IG1vZGUgPSB0aGlzLmdsQ3VsbFtjdWxsTW9kZV07XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuY3VsbEZhY2UgIT09IG1vZGUpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5nbC5jdWxsRmFjZShtb2RlKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jdWxsRmFjZSA9IG1vZGU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5jdWxsTW9kZSA9IGN1bGxNb2RlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyB0aGUgYWN0aXZlIHNoYWRlciB0byBiZSB1c2VkIGR1cmluZyBzdWJzZXF1ZW50IGRyYXcgY2FsbHMuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1NoYWRlcn0gc2hhZGVyIC0gVGhlIHNoYWRlciB0byBzZXQgdG8gYXNzaWduIHRvIHRoZSBkZXZpY2UuXG4gICAgICogQHJldHVybnMge2Jvb2xlYW59IFRydWUgaWYgdGhlIHNoYWRlciB3YXMgc3VjY2Vzc2Z1bGx5IHNldCwgZmFsc2Ugb3RoZXJ3aXNlLlxuICAgICAqL1xuICAgIHNldFNoYWRlcihzaGFkZXIpIHtcbiAgICAgICAgaWYgKHNoYWRlciAhPT0gdGhpcy5zaGFkZXIpIHtcbiAgICAgICAgICAgIGlmIChzaGFkZXIuZmFpbGVkKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfSBlbHNlIGlmICghc2hhZGVyLnJlYWR5ICYmICFzaGFkZXIuaW1wbC5maW5hbGl6ZSh0aGlzLCBzaGFkZXIpKSB7XG4gICAgICAgICAgICAgICAgc2hhZGVyLmZhaWxlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLnNoYWRlciA9IHNoYWRlcjtcblxuICAgICAgICAgICAgLy8gU2V0IHRoZSBhY3RpdmUgc2hhZGVyXG4gICAgICAgICAgICB0aGlzLmdsLnVzZVByb2dyYW0oc2hhZGVyLmltcGwuZ2xQcm9ncmFtKTtcblxuICAgICAgICAgICAgLy8gI2lmIF9QUk9GSUxFUlxuICAgICAgICAgICAgdGhpcy5fc2hhZGVyU3dpdGNoZXNQZXJGcmFtZSsrO1xuICAgICAgICAgICAgLy8gI2VuZGlmXG5cbiAgICAgICAgICAgIHRoaXMuYXR0cmlidXRlc0ludmFsaWRhdGVkID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBHZXQgYSBzdXBwb3J0ZWQgSERSIHBpeGVsIGZvcm1hdCBnaXZlbiBhIHNldCBvZiBoYXJkd2FyZSBzdXBwb3J0IHJlcXVpcmVtZW50cy5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gcHJlZmVyTGFyZ2VzdCAtIElmIHRydWUsIHByZWZlciB0aGUgaGlnaGVzdCBwcmVjaXNpb24gZm9ybWF0LiBPdGhlcndpc2UgcHJlZmVyIHRoZSBsb3dlc3QgcHJlY2lzaW9uIGZvcm1hdC5cbiAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IHJlbmRlcmFibGUgLSBJZiB0cnVlLCBvbmx5IGluY2x1ZGUgcGl4ZWwgZm9ybWF0cyB0aGF0IGNhbiBiZSB1c2VkIGFzIHJlbmRlciB0YXJnZXRzLlxuICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gdXBkYXRhYmxlIC0gSWYgdHJ1ZSwgb25seSBpbmNsdWRlIGZvcm1hdHMgdGhhdCBjYW4gYmUgdXBkYXRlZCBieSB0aGUgQ1BVLlxuICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gZmlsdGVyYWJsZSAtIElmIHRydWUsIG9ubHkgaW5jbHVkZSBmb3JtYXRzIHRoYXQgc3VwcG9ydCB0ZXh0dXJlIGZpbHRlcmluZy5cbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtudW1iZXJ9IFRoZSBIRFIgcGl4ZWwgZm9ybWF0IG9yIG51bGwgaWYgdGhlcmUgYXJlIG5vbmUuXG4gICAgICogQGlnbm9yZVxuICAgICAqL1xuICAgIGdldEhkckZvcm1hdChwcmVmZXJMYXJnZXN0LCByZW5kZXJhYmxlLCB1cGRhdGFibGUsIGZpbHRlcmFibGUpIHtcbiAgICAgICAgLy8gTm90ZSB0aGF0IGZvciBXZWJHTDIsIFBJWEVMRk9STUFUX1JHQjE2RiBhbmQgUElYRUxGT1JNQVRfUkdCMzJGIGFyZSBub3QgcmVuZGVyYWJsZSBhY2NvcmRpbmcgdG8gdGhpczpcbiAgICAgICAgLy8gaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvQVBJL0VYVF9jb2xvcl9idWZmZXJfZmxvYXRcbiAgICAgICAgLy8gRm9yIFdlYkdMMSwgb25seSBQSVhFTEZPUk1BVF9SR0JBMTZGIGFuZCBQSVhFTEZPUk1BVF9SR0JBMzJGIGFyZSB0ZXN0ZWQgZm9yIGJlaW5nIHJlbmRlcmFibGUuXG4gICAgICAgIGNvbnN0IGYxNlZhbGlkID0gdGhpcy5leHRUZXh0dXJlSGFsZkZsb2F0ICYmXG4gICAgICAgICAgICAoIXJlbmRlcmFibGUgfHwgdGhpcy50ZXh0dXJlSGFsZkZsb2F0UmVuZGVyYWJsZSkgJiZcbiAgICAgICAgICAgICghdXBkYXRhYmxlIHx8IHRoaXMudGV4dHVyZUhhbGZGbG9hdFVwZGF0YWJsZSkgJiZcbiAgICAgICAgICAgICghZmlsdGVyYWJsZSB8fCB0aGlzLmV4dFRleHR1cmVIYWxmRmxvYXRMaW5lYXIpO1xuICAgICAgICBjb25zdCBmMzJWYWxpZCA9IHRoaXMuZXh0VGV4dHVyZUZsb2F0ICYmXG4gICAgICAgICAgICAoIXJlbmRlcmFibGUgfHwgdGhpcy50ZXh0dXJlRmxvYXRSZW5kZXJhYmxlKSAmJlxuICAgICAgICAgICAgKCFmaWx0ZXJhYmxlIHx8IHRoaXMuZXh0VGV4dHVyZUZsb2F0TGluZWFyKTtcblxuICAgICAgICBpZiAoZjE2VmFsaWQgJiYgZjMyVmFsaWQpIHtcbiAgICAgICAgICAgIHJldHVybiBwcmVmZXJMYXJnZXN0ID8gUElYRUxGT1JNQVRfUkdCQTMyRiA6IFBJWEVMRk9STUFUX1JHQkExNkY7XG4gICAgICAgIH0gZWxzZSBpZiAoZjE2VmFsaWQpIHtcbiAgICAgICAgICAgIHJldHVybiBQSVhFTEZPUk1BVF9SR0JBMTZGO1xuICAgICAgICB9IGVsc2UgaWYgKGYzMlZhbGlkKSB7XG4gICAgICAgICAgICByZXR1cm4gUElYRUxGT1JNQVRfUkdCQTMyRjtcbiAgICAgICAgfSAvKiBlbHNlICovXG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEZyZWVzIG1lbW9yeSBmcm9tIGFsbCB2ZXJ0ZXggYXJyYXkgb2JqZWN0cyBldmVyIGFsbG9jYXRlZCB3aXRoIHRoaXMgZGV2aWNlLlxuICAgICAqXG4gICAgICogQGlnbm9yZVxuICAgICAqL1xuICAgIGNsZWFyVmVydGV4QXJyYXlPYmplY3RDYWNoZSgpIHtcbiAgICAgICAgY29uc3QgZ2wgPSB0aGlzLmdsO1xuICAgICAgICB0aGlzLl92YW9NYXAuZm9yRWFjaCgoaXRlbSwga2V5LCBtYXBPYmopID0+IHtcbiAgICAgICAgICAgIGdsLmRlbGV0ZVZlcnRleEFycmF5KGl0ZW0pO1xuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLl92YW9NYXAuY2xlYXIoKTtcbiAgICB9XG5cbiAgICByZXNpemVDYW52YXMod2lkdGgsIGhlaWdodCkge1xuXG4gICAgICAgIC8vIHN0b3JlIHRoZSBjbGllbnQgc2l6ZXMgaW4gQ1NTIHBpeGVscywgd2l0aG91dCBwaXhlbCByYXRpbyBhcHBsaWVkXG4gICAgICAgIHRoaXMuX3dpZHRoID0gd2lkdGg7XG4gICAgICAgIHRoaXMuX2hlaWdodCA9IGhlaWdodDtcblxuICAgICAgICBjb25zdCByYXRpbyA9IE1hdGgubWluKHRoaXMuX21heFBpeGVsUmF0aW8sIHBsYXRmb3JtLmJyb3dzZXIgPyB3aW5kb3cuZGV2aWNlUGl4ZWxSYXRpbyA6IDEpO1xuICAgICAgICB3aWR0aCA9IE1hdGguZmxvb3Iod2lkdGggKiByYXRpbyk7XG4gICAgICAgIGhlaWdodCA9IE1hdGguZmxvb3IoaGVpZ2h0ICogcmF0aW8pO1xuXG4gICAgICAgIGlmICh0aGlzLmNhbnZhcy53aWR0aCAhPT0gd2lkdGggfHwgdGhpcy5jYW52YXMuaGVpZ2h0ICE9PSBoZWlnaHQpIHtcblxuICAgICAgICAgICAgdGhpcy5jYW52YXMud2lkdGggPSB3aWR0aDtcbiAgICAgICAgICAgIHRoaXMuY2FudmFzLmhlaWdodCA9IGhlaWdodDtcblxuICAgICAgICAgICAgdGhpcy5maXJlKEdyYXBoaWNzRGV2aWNlLkVWRU5UX1JFU0laRSwgd2lkdGgsIGhlaWdodCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBXaWR0aCBvZiB0aGUgYmFjayBidWZmZXIgaW4gcGl4ZWxzLlxuICAgICAqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKi9cbiAgICBnZXQgd2lkdGgoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmdsLmRyYXdpbmdCdWZmZXJXaWR0aCB8fCB0aGlzLmNhbnZhcy53aWR0aDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBIZWlnaHQgb2YgdGhlIGJhY2sgYnVmZmVyIGluIHBpeGVscy5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtudW1iZXJ9XG4gICAgICovXG4gICAgZ2V0IGhlaWdodCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2wuZHJhd2luZ0J1ZmZlckhlaWdodCB8fCB0aGlzLmNhbnZhcy5oZWlnaHQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRnVsbHNjcmVlbiBtb2RlLlxuICAgICAqXG4gICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICovXG4gICAgc2V0IGZ1bGxzY3JlZW4oZnVsbHNjcmVlbikge1xuICAgICAgICBpZiAoZnVsbHNjcmVlbikge1xuICAgICAgICAgICAgY29uc3QgY2FudmFzID0gdGhpcy5nbC5jYW52YXM7XG4gICAgICAgICAgICBjYW52YXMucmVxdWVzdEZ1bGxzY3JlZW4oKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGRvY3VtZW50LmV4aXRGdWxsc2NyZWVuKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBnZXQgZnVsbHNjcmVlbigpIHtcbiAgICAgICAgcmV0dXJuICEhZG9jdW1lbnQuZnVsbHNjcmVlbkVsZW1lbnQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ2hlY2sgaWYgaGlnaCBwcmVjaXNpb24gZmxvYXRpbmctcG9pbnQgdGV4dHVyZXMgYXJlIHN1cHBvcnRlZC5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAqL1xuICAgIGdldCB0ZXh0dXJlRmxvYXRIaWdoUHJlY2lzaW9uKCkge1xuICAgICAgICBpZiAodGhpcy5fdGV4dHVyZUZsb2F0SGlnaFByZWNpc2lvbiA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aGlzLl90ZXh0dXJlRmxvYXRIaWdoUHJlY2lzaW9uID0gdGVzdFRleHR1cmVGbG9hdEhpZ2hQcmVjaXNpb24odGhpcyk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMuX3RleHR1cmVGbG9hdEhpZ2hQcmVjaXNpb247XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ2hlY2sgaWYgdGV4dHVyZSB3aXRoIGhhbGYgZmxvYXQgZm9ybWF0IGNhbiBiZSB1cGRhdGVkIHdpdGggZGF0YS5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAqL1xuICAgIGdldCB0ZXh0dXJlSGFsZkZsb2F0VXBkYXRhYmxlKCkge1xuICAgICAgICBpZiAodGhpcy5fdGV4dHVyZUhhbGZGbG9hdFVwZGF0YWJsZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBpZiAodGhpcy53ZWJnbDIpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl90ZXh0dXJlSGFsZkZsb2F0VXBkYXRhYmxlID0gdHJ1ZTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fdGV4dHVyZUhhbGZGbG9hdFVwZGF0YWJsZSA9IHRlc3RUZXh0dXJlSGFsZkZsb2F0VXBkYXRhYmxlKHRoaXMuZ2wsIHRoaXMuZXh0VGV4dHVyZUhhbGZGbG9hdC5IQUxGX0ZMT0FUX09FUyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMuX3RleHR1cmVIYWxmRmxvYXRVcGRhdGFibGU7XG4gICAgfVxuXG4gICAgLy8gI2lmIF9ERUJVR1xuICAgIC8vIGRlYnVnIGhlbHBlciB0byBmb3JjZSBsb3N0IGNvbnRleHRcbiAgICBkZWJ1Z0xvc2VDb250ZXh0KHNsZWVwID0gMTAwKSB7XG4gICAgICAgIGNvbnN0IGNvbnRleHQgPSB0aGlzLmdsLmdldEV4dGVuc2lvbignV0VCR0xfbG9zZV9jb250ZXh0Jyk7XG4gICAgICAgIGNvbnRleHQubG9zZUNvbnRleHQoKTtcbiAgICAgICAgc2V0VGltZW91dCgoKSA9PiBjb250ZXh0LnJlc3RvcmVDb250ZXh0KCksIHNsZWVwKTtcbiAgICB9XG4gICAgLy8gI2VuZGlmXG59XG5cbmV4cG9ydCB7IFdlYmdsR3JhcGhpY3NEZXZpY2UgfTtcbiJdLCJuYW1lcyI6WyJpbnZhbGlkYXRlQXR0YWNobWVudHMiLCJfZnVsbFNjcmVlblF1YWRWUyIsIl9wcmVjaXNpb25UZXN0MVBTIiwiX3ByZWNpc2lvblRlc3QyUFMiLCJfb3V0cHV0VGV4dHVyZTJEIiwicXVhZFdpdGhTaGFkZXIiLCJkZXZpY2UiLCJ0YXJnZXQiLCJzaGFkZXIiLCJEZWJ1Z0dyYXBoaWNzIiwicHVzaEdwdU1hcmtlciIsIm9sZFJ0IiwicmVuZGVyVGFyZ2V0Iiwic2V0UmVuZGVyVGFyZ2V0IiwidXBkYXRlQmVnaW4iLCJzZXRDdWxsTW9kZSIsIkNVTExGQUNFX05PTkUiLCJzZXRCbGVuZFN0YXRlIiwiQmxlbmRTdGF0ZSIsIk5PQkxFTkQiLCJzZXREZXB0aFN0YXRlIiwiRGVwdGhTdGF0ZSIsIk5PREVQVEgiLCJzZXRTdGVuY2lsU3RhdGUiLCJzZXRWZXJ0ZXhCdWZmZXIiLCJxdWFkVmVydGV4QnVmZmVyIiwic2V0U2hhZGVyIiwiZHJhdyIsInR5cGUiLCJQUklNSVRJVkVfVFJJU1RSSVAiLCJiYXNlIiwiY291bnQiLCJpbmRleGVkIiwidXBkYXRlRW5kIiwicG9wR3B1TWFya2VyIiwidGVzdFJlbmRlcmFibGUiLCJnbCIsInBpeGVsRm9ybWF0IiwicmVzdWx0IiwidGV4dHVyZSIsImNyZWF0ZVRleHR1cmUiLCJiaW5kVGV4dHVyZSIsIlRFWFRVUkVfMkQiLCJ0ZXhQYXJhbWV0ZXJpIiwiVEVYVFVSRV9NSU5fRklMVEVSIiwiTkVBUkVTVCIsIlRFWFRVUkVfTUFHX0ZJTFRFUiIsIlRFWFRVUkVfV1JBUF9TIiwiQ0xBTVBfVE9fRURHRSIsIlRFWFRVUkVfV1JBUF9UIiwidGV4SW1hZ2UyRCIsIlJHQkEiLCJmcmFtZWJ1ZmZlciIsImNyZWF0ZUZyYW1lYnVmZmVyIiwiYmluZEZyYW1lYnVmZmVyIiwiRlJBTUVCVUZGRVIiLCJmcmFtZWJ1ZmZlclRleHR1cmUyRCIsIkNPTE9SX0FUVEFDSE1FTlQwIiwiY2hlY2tGcmFtZWJ1ZmZlclN0YXR1cyIsIkZSQU1FQlVGRkVSX0NPTVBMRVRFIiwiZGVsZXRlVGV4dHVyZSIsImRlbGV0ZUZyYW1lYnVmZmVyIiwidGVzdFRleHR1cmVIYWxmRmxvYXRVcGRhdGFibGUiLCJkYXRhIiwiVWludDE2QXJyYXkiLCJnZXRFcnJvciIsIk5PX0VSUk9SIiwiY29uc29sZSIsImxvZyIsInRlc3RUZXh0dXJlRmxvYXRIaWdoUHJlY2lzaW9uIiwidGV4dHVyZUZsb2F0UmVuZGVyYWJsZSIsInNoYWRlcjEiLCJTaGFkZXIiLCJTaGFkZXJVdGlscyIsImNyZWF0ZURlZmluaXRpb24iLCJuYW1lIiwidmVydGV4Q29kZSIsImZyYWdtZW50Q29kZSIsInNoYWRlcjIiLCJ0ZXh0dXJlT3B0aW9ucyIsImZvcm1hdCIsIlBJWEVMRk9STUFUX1JHQkEzMkYiLCJ3aWR0aCIsImhlaWdodCIsIm1pcG1hcHMiLCJtaW5GaWx0ZXIiLCJGSUxURVJfTkVBUkVTVCIsIm1hZ0ZpbHRlciIsInRleDEiLCJUZXh0dXJlIiwidGFyZzEiLCJSZW5kZXJUYXJnZXQiLCJjb2xvckJ1ZmZlciIsImRlcHRoIiwiUElYRUxGT1JNQVRfUkdCQTgiLCJ0ZXgyIiwidGFyZzIiLCJjb25zdGFudFRleFNvdXJjZSIsInNldFZhbHVlIiwicHJldkZyYW1lYnVmZmVyIiwiYWN0aXZlRnJhbWVidWZmZXIiLCJzZXRGcmFtZWJ1ZmZlciIsImltcGwiLCJfZ2xGcmFtZUJ1ZmZlciIsInBpeGVscyIsIlVpbnQ4QXJyYXkiLCJyZWFkUGl4ZWxzIiwieCIsInkiLCJ6IiwidyIsImYiLCJkZXN0cm95IiwiV2ViZ2xHcmFwaGljc0RldmljZSIsIkdyYXBoaWNzRGV2aWNlIiwiY29uc3RydWN0b3IiLCJjYW52YXMiLCJvcHRpb25zIiwid2ViZ2wyIiwiX2RlZmF1bHRGcmFtZWJ1ZmZlciIsIl9kZWZhdWx0RnJhbWVidWZmZXJDaGFuZ2VkIiwiaW5pdE9wdGlvbnMiLCJ1cGRhdGVDbGllbnRSZWN0IiwiY29udGV4dExvc3QiLCJfY29udGV4dExvc3RIYW5kbGVyIiwiZXZlbnQiLCJwcmV2ZW50RGVmYXVsdCIsImxvc2VDb250ZXh0IiwiRGVidWciLCJmaXJlIiwiX2NvbnRleHRSZXN0b3JlZEhhbmRsZXIiLCJyZXN0b3JlQ29udGV4dCIsInVhIiwibmF2aWdhdG9yIiwidXNlckFnZW50IiwiZm9yY2VEaXNhYmxlTXVsdGlzYW1wbGluZyIsImluY2x1ZGVzIiwiYW50aWFsaWFzIiwicHJlZmVyV2ViR2wyIiwidW5kZWZpbmVkIiwibmFtZXMiLCJpIiwibGVuZ3RoIiwiZ2V0Q29udGV4dCIsIkVycm9yIiwiV2ViR0wyUmVuZGVyaW5nQ29udGV4dCIsIl9kZXZpY2VUeXBlIiwiREVWSUNFVFlQRV9XRUJHTDIiLCJERVZJQ0VUWVBFX1dFQkdMMSIsImFscGhhQml0cyIsImdldFBhcmFtZXRlciIsIkFMUEhBX0JJVFMiLCJiYWNrQnVmZmVyRm9ybWF0IiwiUElYRUxGT1JNQVRfUkdCOCIsImlzQ2hyb21lIiwicGxhdGZvcm0iLCJicm93c2VyTmFtZSIsImlzU2FmYXJpIiwiaXNNYWMiLCJicm93c2VyIiwiYXBwVmVyc2lvbiIsImluZGV4T2YiLCJfdGVtcEVuYWJsZVNhZmFyaVRleHR1cmVVbml0V29ya2Fyb3VuZCIsIl90ZW1wTWFjQ2hyb21lQmxpdEZyYW1lYnVmZmVyV29ya2Fyb3VuZCIsImFscGhhIiwic2V0dXBWZXJ0ZXhBcnJheU9iamVjdCIsImFkZEV2ZW50TGlzdGVuZXIiLCJpbml0aWFsaXplRXh0ZW5zaW9ucyIsImluaXRpYWxpemVDYXBhYmlsaXRpZXMiLCJpbml0aWFsaXplUmVuZGVyU3RhdGUiLCJpbml0aWFsaXplQ29udGV4dENhY2hlcyIsInNhbXBsZXMiLCJjcmVhdGVCYWNrYnVmZmVyIiwic3VwcG9ydHNJbWFnZUJpdG1hcCIsIkltYWdlQml0bWFwIiwiZ2xBZGRyZXNzIiwiUkVQRUFUIiwiTUlSUk9SRURfUkVQRUFUIiwiZ2xCbGVuZEVxdWF0aW9uIiwiRlVOQ19BREQiLCJGVU5DX1NVQlRSQUNUIiwiRlVOQ19SRVZFUlNFX1NVQlRSQUNUIiwiTUlOIiwiZXh0QmxlbmRNaW5tYXgiLCJNSU5fRVhUIiwiTUFYIiwiTUFYX0VYVCIsImdsQmxlbmRGdW5jdGlvbkNvbG9yIiwiWkVSTyIsIk9ORSIsIlNSQ19DT0xPUiIsIk9ORV9NSU5VU19TUkNfQ09MT1IiLCJEU1RfQ09MT1IiLCJPTkVfTUlOVVNfRFNUX0NPTE9SIiwiU1JDX0FMUEhBIiwiU1JDX0FMUEhBX1NBVFVSQVRFIiwiT05FX01JTlVTX1NSQ19BTFBIQSIsIkRTVF9BTFBIQSIsIk9ORV9NSU5VU19EU1RfQUxQSEEiLCJDT05TVEFOVF9DT0xPUiIsIk9ORV9NSU5VU19DT05TVEFOVF9DT0xPUiIsImdsQmxlbmRGdW5jdGlvbkFscGhhIiwiQ09OU1RBTlRfQUxQSEEiLCJPTkVfTUlOVVNfQ09OU1RBTlRfQUxQSEEiLCJnbENvbXBhcmlzb24iLCJORVZFUiIsIkxFU1MiLCJFUVVBTCIsIkxFUVVBTCIsIkdSRUFURVIiLCJOT1RFUVVBTCIsIkdFUVVBTCIsIkFMV0FZUyIsImdsU3RlbmNpbE9wIiwiS0VFUCIsIlJFUExBQ0UiLCJJTkNSIiwiSU5DUl9XUkFQIiwiREVDUiIsIkRFQ1JfV1JBUCIsIklOVkVSVCIsImdsQ2xlYXJGbGFnIiwiQ09MT1JfQlVGRkVSX0JJVCIsIkRFUFRIX0JVRkZFUl9CSVQiLCJTVEVOQ0lMX0JVRkZFUl9CSVQiLCJnbEN1bGwiLCJCQUNLIiwiRlJPTlQiLCJGUk9OVF9BTkRfQkFDSyIsImdsRmlsdGVyIiwiTElORUFSIiwiTkVBUkVTVF9NSVBNQVBfTkVBUkVTVCIsIk5FQVJFU1RfTUlQTUFQX0xJTkVBUiIsIkxJTkVBUl9NSVBNQVBfTkVBUkVTVCIsIkxJTkVBUl9NSVBNQVBfTElORUFSIiwiZ2xQcmltaXRpdmUiLCJQT0lOVFMiLCJMSU5FUyIsIkxJTkVfTE9PUCIsIkxJTkVfU1RSSVAiLCJUUklBTkdMRVMiLCJUUklBTkdMRV9TVFJJUCIsIlRSSUFOR0xFX0ZBTiIsImdsVHlwZSIsIkJZVEUiLCJVTlNJR05FRF9CWVRFIiwiU0hPUlQiLCJVTlNJR05FRF9TSE9SVCIsIklOVCIsIlVOU0lHTkVEX0lOVCIsIkZMT0FUIiwicGNVbmlmb3JtVHlwZSIsIkJPT0wiLCJVTklGT1JNVFlQRV9CT09MIiwiVU5JRk9STVRZUEVfSU5UIiwiVU5JRk9STVRZUEVfRkxPQVQiLCJGTE9BVF9WRUMyIiwiVU5JRk9STVRZUEVfVkVDMiIsIkZMT0FUX1ZFQzMiLCJVTklGT1JNVFlQRV9WRUMzIiwiRkxPQVRfVkVDNCIsIlVOSUZPUk1UWVBFX1ZFQzQiLCJJTlRfVkVDMiIsIlVOSUZPUk1UWVBFX0lWRUMyIiwiSU5UX1ZFQzMiLCJVTklGT1JNVFlQRV9JVkVDMyIsIklOVF9WRUM0IiwiVU5JRk9STVRZUEVfSVZFQzQiLCJCT09MX1ZFQzIiLCJVTklGT1JNVFlQRV9CVkVDMiIsIkJPT0xfVkVDMyIsIlVOSUZPUk1UWVBFX0JWRUMzIiwiQk9PTF9WRUM0IiwiVU5JRk9STVRZUEVfQlZFQzQiLCJGTE9BVF9NQVQyIiwiVU5JRk9STVRZUEVfTUFUMiIsIkZMT0FUX01BVDMiLCJVTklGT1JNVFlQRV9NQVQzIiwiRkxPQVRfTUFUNCIsIlVOSUZPUk1UWVBFX01BVDQiLCJTQU1QTEVSXzJEIiwiVU5JRk9STVRZUEVfVEVYVFVSRTJEIiwiU0FNUExFUl9DVUJFIiwiVU5JRk9STVRZUEVfVEVYVFVSRUNVQkUiLCJTQU1QTEVSXzJEX1NIQURPVyIsIlVOSUZPUk1UWVBFX1RFWFRVUkUyRF9TSEFET1ciLCJTQU1QTEVSX0NVQkVfU0hBRE9XIiwiVU5JRk9STVRZUEVfVEVYVFVSRUNVQkVfU0hBRE9XIiwiU0FNUExFUl8zRCIsIlVOSUZPUk1UWVBFX1RFWFRVUkUzRCIsInRhcmdldFRvU2xvdCIsIlRFWFRVUkVfQ1VCRV9NQVAiLCJURVhUVVJFXzNEIiwic2NvcGVYIiwic2NvcGVZIiwic2NvcGVaIiwic2NvcGVXIiwidW5pZm9ybVZhbHVlIiwiY29tbWl0RnVuY3Rpb24iLCJ1bmlmb3JtIiwidmFsdWUiLCJ1bmlmb3JtMWkiLCJsb2NhdGlvbklkIiwidW5pZm9ybTFmIiwidW5pZm9ybTJmdiIsInVuaWZvcm0zZnYiLCJ1bmlmb3JtNGZ2IiwidW5pZm9ybTJpdiIsInVuaWZvcm0zaXYiLCJ1bmlmb3JtNGl2IiwidW5pZm9ybU1hdHJpeDJmdiIsInVuaWZvcm1NYXRyaXgzZnYiLCJ1bmlmb3JtTWF0cml4NGZ2IiwiVU5JRk9STVRZUEVfRkxPQVRBUlJBWSIsInVuaWZvcm0xZnYiLCJVTklGT1JNVFlQRV9WRUMyQVJSQVkiLCJVTklGT1JNVFlQRV9WRUMzQVJSQVkiLCJVTklGT1JNVFlQRV9WRUM0QVJSQVkiLCJzdXBwb3J0c0JvbmVUZXh0dXJlcyIsImV4dFRleHR1cmVGbG9hdCIsIm1heFZlcnRleFRleHR1cmVzIiwibnVtVW5pZm9ybXMiLCJ2ZXJ0ZXhVbmlmb3Jtc0NvdW50IiwiYm9uZUxpbWl0IiwiTWF0aCIsImZsb29yIiwibWluIiwidW5tYXNrZWRSZW5kZXJlciIsInNjb3BlIiwicmVzb2x2ZSIsImV4dENvbG9yQnVmZmVyRmxvYXQiLCJleHRDb2xvckJ1ZmZlckhhbGZGbG9hdCIsInRleHR1cmVIYWxmRmxvYXRSZW5kZXJhYmxlIiwiZXh0VGV4dHVyZUhhbGZGbG9hdCIsIkhBTEZfRkxPQVRfT0VTIiwic3VwcG9ydHNNb3JwaFRhcmdldFRleHR1cmVzQ29yZSIsIm1heFByZWNpc2lvbiIsInN1cHBvcnRzRGVwdGhTaGFkb3ciLCJfdGV4dHVyZUZsb2F0SGlnaFByZWNpc2lvbiIsIl90ZXh0dXJlSGFsZkZsb2F0VXBkYXRhYmxlIiwiYXJlYUxpZ2h0THV0Rm9ybWF0IiwidGV4dHVyZUhhbGZGbG9hdFVwZGF0YWJsZSIsImV4dFRleHR1cmVIYWxmRmxvYXRMaW5lYXIiLCJQSVhFTEZPUk1BVF9SR0JBMTZGIiwiZXh0VGV4dHVyZUZsb2F0TGluZWFyIiwicG9zdEluaXQiLCJncHVQcm9maWxlciIsIldlYmdsR3B1UHJvZmlsZXIiLCJmZWVkYmFjayIsImRlbGV0ZVRyYW5zZm9ybUZlZWRiYWNrIiwiY2xlYXJWZXJ0ZXhBcnJheU9iamVjdENhY2hlIiwicmVtb3ZlRXZlbnRMaXN0ZW5lciIsInBvc3REZXN0cm95IiwiZnJhbWVCdWZmZXIiLCJzdXBwb3J0c1N0ZW5jaWwiLCJzdGVuY2lsIiwiYmFja0J1ZmZlciIsImdyYXBoaWNzRGV2aWNlIiwic3VwcGxpZWRDb2xvckZyYW1lYnVmZmVyIiwidXBkYXRlQmFja2J1ZmZlciIsInJlc29sdXRpb25DaGFuZ2VkIiwiYmFja0J1ZmZlclNpemUiLCJzZXQiLCJjcmVhdGVWZXJ0ZXhCdWZmZXJJbXBsIiwidmVydGV4QnVmZmVyIiwiV2ViZ2xWZXJ0ZXhCdWZmZXIiLCJjcmVhdGVJbmRleEJ1ZmZlckltcGwiLCJpbmRleEJ1ZmZlciIsIldlYmdsSW5kZXhCdWZmZXIiLCJjcmVhdGVTaGFkZXJJbXBsIiwiV2ViZ2xTaGFkZXIiLCJjcmVhdGVUZXh0dXJlSW1wbCIsIldlYmdsVGV4dHVyZSIsImNyZWF0ZVJlbmRlclRhcmdldEltcGwiLCJXZWJnbFJlbmRlclRhcmdldCIsInB1c2hNYXJrZXIiLCJ3aW5kb3ciLCJzcGVjdG9yIiwibGFiZWwiLCJ0b1N0cmluZyIsInNldE1hcmtlciIsInBvcE1hcmtlciIsImNsZWFyTWFya2VyIiwiZ2V0UHJlY2lzaW9uIiwicHJlY2lzaW9uIiwiZ2V0U2hhZGVyUHJlY2lzaW9uRm9ybWF0IiwidmVydGV4U2hhZGVyUHJlY2lzaW9uSGlnaHBGbG9hdCIsIlZFUlRFWF9TSEFERVIiLCJISUdIX0ZMT0FUIiwidmVydGV4U2hhZGVyUHJlY2lzaW9uTWVkaXVtcEZsb2F0IiwiTUVESVVNX0ZMT0FUIiwiZnJhZ21lbnRTaGFkZXJQcmVjaXNpb25IaWdocEZsb2F0IiwiRlJBR01FTlRfU0hBREVSIiwiZnJhZ21lbnRTaGFkZXJQcmVjaXNpb25NZWRpdW1wRmxvYXQiLCJoaWdocEF2YWlsYWJsZSIsIm1lZGl1bXBBdmFpbGFibGUiLCJ3YXJuIiwiZ2V0RXh0ZW5zaW9uIiwiYXJndW1lbnRzIiwic3VwcG9ydGVkRXh0ZW5zaW9ucyIsImV4dERpc2pvaW50VGltZXJRdWVyeSIsIl9leHREaXNqb2ludFRpbWVyUXVlcnkiLCJfZ2wkZ2V0U3VwcG9ydGVkRXh0ZW4iLCJnZXRTdXBwb3J0ZWRFeHRlbnNpb25zIiwiZXh0RHJhd0J1ZmZlcnMiLCJkcmF3QnVmZmVycyIsImJpbmQiLCJleHRJbnN0YW5jaW5nIiwiZXh0U3RhbmRhcmREZXJpdmF0aXZlcyIsImV4dFRleHR1cmVMb2QiLCJleHRVaW50RWxlbWVudCIsImV4dFZlcnRleEFycmF5T2JqZWN0IiwiZXh0RGVwdGhUZXh0dXJlIiwiX3RoaXMkZXh0RHJhd0J1ZmZlcnMiLCJkcmF3QnVmZmVyc1dFQkdMIiwiZXh0IiwiZHJhd0FycmF5c0luc3RhbmNlZCIsImRyYXdBcnJheXNJbnN0YW5jZWRBTkdMRSIsImRyYXdFbGVtZW50c0luc3RhbmNlZCIsImRyYXdFbGVtZW50c0luc3RhbmNlZEFOR0xFIiwidmVydGV4QXR0cmliRGl2aXNvciIsInZlcnRleEF0dHJpYkRpdmlzb3JBTkdMRSIsImNyZWF0ZVZlcnRleEFycmF5IiwiY3JlYXRlVmVydGV4QXJyYXlPRVMiLCJkZWxldGVWZXJ0ZXhBcnJheSIsImRlbGV0ZVZlcnRleEFycmF5T0VTIiwiaXNWZXJ0ZXhBcnJheSIsImlzVmVydGV4QXJyYXlPRVMiLCJiaW5kVmVydGV4QXJyYXkiLCJiaW5kVmVydGV4QXJyYXlPRVMiLCJleHREZWJ1Z1JlbmRlcmVySW5mbyIsImV4dEZsb2F0QmxlbmQiLCJleHRUZXh0dXJlRmlsdGVyQW5pc290cm9waWMiLCJleHRDb21wcmVzc2VkVGV4dHVyZUVUQzEiLCJleHRDb21wcmVzc2VkVGV4dHVyZUVUQyIsImV4dENvbXByZXNzZWRUZXh0dXJlUFZSVEMiLCJleHRDb21wcmVzc2VkVGV4dHVyZVMzVEMiLCJleHRDb21wcmVzc2VkVGV4dHVyZUFUQyIsImV4dENvbXByZXNzZWRUZXh0dXJlQVNUQyIsImV4dFBhcmFsbGVsU2hhZGVyQ29tcGlsZSIsIl9jb250ZXh0QXR0cmlicyRhbnRpYSIsIl9jb250ZXh0QXR0cmlicyRzdGVuYyIsImNvbnRleHRBdHRyaWJzIiwiZ2V0Q29udGV4dEF0dHJpYnV0ZXMiLCJzdXBwb3J0c01zYWEiLCJzdXBwb3J0c0luc3RhbmNpbmciLCJtYXhUZXh0dXJlU2l6ZSIsIk1BWF9URVhUVVJFX1NJWkUiLCJtYXhDdWJlTWFwU2l6ZSIsIk1BWF9DVUJFX01BUF9URVhUVVJFX1NJWkUiLCJtYXhSZW5kZXJCdWZmZXJTaXplIiwiTUFYX1JFTkRFUkJVRkZFUl9TSVpFIiwibWF4VGV4dHVyZXMiLCJNQVhfVEVYVFVSRV9JTUFHRV9VTklUUyIsIm1heENvbWJpbmVkVGV4dHVyZXMiLCJNQVhfQ09NQklORURfVEVYVFVSRV9JTUFHRV9VTklUUyIsIk1BWF9WRVJURVhfVEVYVFVSRV9JTUFHRV9VTklUUyIsIk1BWF9WRVJURVhfVU5JRk9STV9WRUNUT1JTIiwiZnJhZ21lbnRVbmlmb3Jtc0NvdW50IiwiTUFYX0ZSQUdNRU5UX1VOSUZPUk1fVkVDVE9SUyIsIm1heERyYXdCdWZmZXJzIiwiTUFYX0RSQVdfQlVGRkVSUyIsIm1heENvbG9yQXR0YWNobWVudHMiLCJNQVhfQ09MT1JfQVRUQUNITUVOVFMiLCJtYXhWb2x1bWVTaXplIiwiTUFYXzNEX1RFWFRVUkVfU0laRSIsInN1cHBvcnRzTXJ0Iiwic3VwcG9ydHNWb2x1bWVUZXh0dXJlcyIsIk1BWF9EUkFXX0JVRkZFUlNfV0VCR0wiLCJNQVhfQ09MT1JfQVRUQUNITUVOVFNfV0VCR0wiLCJVTk1BU0tFRF9SRU5ERVJFUl9XRUJHTCIsInVubWFza2VkVmVuZG9yIiwiVU5NQVNLRURfVkVORE9SX1dFQkdMIiwibWFsaVJlbmRlcmVyUmVnZXgiLCJzYW1zdW5nTW9kZWxSZWdleCIsInN1cHBvcnRzR3B1UGFydGljbGVzIiwibWF0Y2giLCJtYXhBbmlzb3Ryb3B5IiwiTUFYX1RFWFRVUkVfTUFYX0FOSVNPVFJPUFlfRVhUIiwiU0FNUExFUyIsIm1heFNhbXBsZXMiLCJNQVhfU0FNUExFUyIsInN1cHBvcnRzQXJlYUxpZ2h0cyIsImFuZHJvaWQiLCJzdXBwb3J0c1RleHR1cmVGZXRjaCIsImRpc2FibGUiLCJCTEVORCIsImJsZW5kRnVuYyIsImJsZW5kRXF1YXRpb24iLCJjb2xvck1hc2siLCJibGVuZENvbG9yIiwiQ29sb3IiLCJlbmFibGUiLCJDVUxMX0ZBQ0UiLCJjdWxsRmFjZSIsIkRFUFRIX1RFU1QiLCJkZXB0aEZ1bmMiLCJkZXB0aE1hc2siLCJTVEVOQ0lMX1RFU1QiLCJzdGVuY2lsRnVuY0Zyb250Iiwic3RlbmNpbEZ1bmNCYWNrIiwiRlVOQ19BTFdBWVMiLCJzdGVuY2lsUmVmRnJvbnQiLCJzdGVuY2lsUmVmQmFjayIsInN0ZW5jaWxNYXNrRnJvbnQiLCJzdGVuY2lsTWFza0JhY2siLCJzdGVuY2lsRnVuYyIsInN0ZW5jaWxGYWlsRnJvbnQiLCJzdGVuY2lsRmFpbEJhY2siLCJTVEVOQ0lMT1BfS0VFUCIsInN0ZW5jaWxaZmFpbEZyb250Iiwic3RlbmNpbFpmYWlsQmFjayIsInN0ZW5jaWxacGFzc0Zyb250Iiwic3RlbmNpbFpwYXNzQmFjayIsInN0ZW5jaWxXcml0ZU1hc2tGcm9udCIsInN0ZW5jaWxXcml0ZU1hc2tCYWNrIiwic3RlbmNpbE9wIiwic3RlbmNpbE1hc2siLCJhbHBoYVRvQ292ZXJhZ2UiLCJyYXN0ZXIiLCJTQU1QTEVfQUxQSEFfVE9fQ09WRVJBR0UiLCJSQVNURVJJWkVSX0RJU0NBUkQiLCJkZXB0aEJpYXNFbmFibGVkIiwiUE9MWUdPTl9PRkZTRVRfRklMTCIsImNsZWFyRGVwdGgiLCJjbGVhckNvbG9yIiwiY2xlYXJTdGVuY2lsIiwiaGludCIsIkZSQUdNRU5UX1NIQURFUl9ERVJJVkFUSVZFX0hJTlQiLCJOSUNFU1QiLCJGUkFHTUVOVF9TSEFERVJfREVSSVZBVElWRV9ISU5UX09FUyIsIlNDSVNTT1JfVEVTVCIsInBpeGVsU3RvcmVpIiwiVU5QQUNLX0NPTE9SU1BBQ0VfQ09OVkVSU0lPTl9XRUJHTCIsIk5PTkUiLCJ1bnBhY2tGbGlwWSIsIlVOUEFDS19GTElQX1lfV0VCR0wiLCJ1bnBhY2tQcmVtdWx0aXBseUFscGhhIiwiVU5QQUNLX1BSRU1VTFRJUExZX0FMUEhBX1dFQkdMIiwiVU5QQUNLX0FMSUdOTUVOVCIsIl92YW9NYXAiLCJNYXAiLCJib3VuZFZhbyIsInRyYW5zZm9ybUZlZWRiYWNrQnVmZmVyIiwidGV4dHVyZVVuaXQiLCJ0ZXh0dXJlVW5pdHMiLCJwdXNoIiwiX3RoaXMkZ3B1UHJvZmlsZXIiLCJzaGFkZXJzIiwidGV4dHVyZXMiLCJidWZmZXIiLCJidWZmZXJzIiwidGFyZ2V0cyIsIl90aGlzJGdwdVByb2ZpbGVyMiIsInVubG9jayIsImVuZFNoYWRlckJhdGNoIiwic2V0Vmlld3BvcnQiLCJoIiwidngiLCJ2eSIsInZ3IiwidmgiLCJ2aWV3cG9ydCIsInNldFNjaXNzb3IiLCJzeCIsInN5Iiwic3ciLCJzaCIsInNjaXNzb3IiLCJmYiIsImNvcHlSZW5kZXJUYXJnZXQiLCJzb3VyY2UiLCJkZXN0IiwiY29sb3IiLCJlcnJvciIsIl9jb2xvckJ1ZmZlciIsIl9mb3JtYXQiLCJfZGVwdGgiLCJfZGVwdGhCdWZmZXIiLCJfdGhpcyRiYWNrQnVmZmVyIiwicHJldlJ0Iiwic3JjIiwiZHN0IiwiYXNzZXJ0IiwiUkVBRF9GUkFNRUJVRkZFUiIsIkRSQVdfRlJBTUVCVUZGRVIiLCJibGl0RnJhbWVidWZmZXIiLCJnZXRDb3B5U2hhZGVyIiwiX2NvcHlTaGFkZXIiLCJmcmFtZVN0YXJ0IiwiZnJhbWVFbmQiLCJyZXF1ZXN0Iiwic3RhcnRQYXNzIiwicmVuZGVyUGFzcyIsInJ0IiwiY29sb3JPcHMiLCJkZXB0aFN0ZW5jaWxPcHMiLCJjbGVhciIsImNsZWFyRmxhZ3MiLCJjbGVhck9wdGlvbnMiLCJDTEVBUkZMQUdfQ09MT1IiLCJjbGVhclZhbHVlIiwiciIsImciLCJiIiwiYSIsIkNMRUFSRkxBR19ERVBUSCIsImNsZWFyRGVwdGhWYWx1ZSIsIkNMRUFSRkxBR19TVEVOQ0lMIiwiY2xlYXJTdGVuY2lsVmFsdWUiLCJmbGFncyIsImNhbGwiLCJpbnNpZGVSZW5kZXJQYXNzIiwiZXJyb3JPbmNlIiwiZW5kUGFzcyIsInVuYmluZFZlcnRleEFycmF5IiwiY29sb3JCdWZmZXJDb3VudCIsImNvbG9yQXJyYXlPcHMiLCJfcmVuZGVyUGFzcyRjb2xvck9wcyIsInN0b3JlIiwic3RvcmVEZXB0aCIsIkRFUFRIX0FUVEFDSE1FTlQiLCJzdG9yZVN0ZW5jaWwiLCJTVEVOQ0lMX0FUVEFDSE1FTlQiLCJmdWxsU2l6ZUNsZWFyUmVjdCIsImludmFsaWRhdGVGcmFtZWJ1ZmZlciIsImF1dG9SZXNvbHZlIiwiX2NvbG9yQnVmZmVycyIsIl9nbFRleHR1cmUiLCJwb3QiLCJhY3RpdmVUZXh0dXJlIiwiZ2VuZXJhdGVNaXBtYXAiLCJfZ2xUYXJnZXQiLCJkZWZhdWx0RnJhbWVidWZmZXIiLCJfdGhpcyRyZW5kZXJUYXJnZXQiLCJ1bml0Iiwic2xvdCIsInRhcmdldEltcGwiLCJpbml0aWFsaXplZCIsImluaXRSZW5kZXJUYXJnZXQiLCJfc2FtcGxlcyIsInNldFVucGFja0ZsaXBZIiwiZmxpcFkiLCJzZXRVbnBhY2tQcmVtdWx0aXBseUFscGhhIiwicHJlbXVsdGlwbHlBbHBoYSIsIlRFWFRVUkUwIiwidGV4dHVyZVRhcmdldCIsInRleHR1cmVPYmplY3QiLCJiaW5kVGV4dHVyZU9uVW5pdCIsInNldFRleHR1cmVQYXJhbWV0ZXJzIiwiZGlydHlQYXJhbWV0ZXJGbGFncyIsImZpbHRlciIsIl9taW5GaWx0ZXIiLCJfbWlwbWFwcyIsIl9jb21wcmVzc2VkIiwiX2xldmVscyIsIkZJTFRFUl9ORUFSRVNUX01JUE1BUF9ORUFSRVNUIiwiRklMVEVSX05FQVJFU1RfTUlQTUFQX0xJTkVBUiIsIkZJTFRFUl9MSU5FQVJfTUlQTUFQX05FQVJFU1QiLCJGSUxURVJfTElORUFSX01JUE1BUF9MSU5FQVIiLCJGSUxURVJfTElORUFSIiwiX21hZ0ZpbHRlciIsIl9hZGRyZXNzVSIsIkFERFJFU1NfQ0xBTVBfVE9fRURHRSIsIl9hZGRyZXNzViIsIlRFWFRVUkVfV1JBUF9SIiwiX2FkZHJlc3NXIiwiVEVYVFVSRV9DT01QQVJFX01PREUiLCJfY29tcGFyZU9uUmVhZCIsIkNPTVBBUkVfUkVGX1RPX1RFWFRVUkUiLCJURVhUVVJFX0NPTVBBUkVfRlVOQyIsIl9jb21wYXJlRnVuYyIsInRleFBhcmFtZXRlcmYiLCJURVhUVVJFX01BWF9BTklTT1RST1BZX0VYVCIsIm1hdGgiLCJjbGFtcCIsInJvdW5kIiwiX2FuaXNvdHJvcHkiLCJzZXRUZXh0dXJlIiwiaW5pdGlhbGl6ZSIsIl9uZWVkc1VwbG9hZCIsIl9uZWVkc01pcG1hcHNVcGxvYWQiLCJ1cGxvYWQiLCJ2ZXJ0ZXhCdWZmZXJzIiwia2V5IiwidmFvIiwidXNlQ2FjaGUiLCJpZCIsInJlbmRlcmluZ0hhc2giLCJnZXQiLCJiaW5kQnVmZmVyIiwiRUxFTUVOVF9BUlJBWV9CVUZGRVIiLCJsb2NaZXJvIiwiQVJSQVlfQlVGRkVSIiwiYnVmZmVySWQiLCJlbGVtZW50cyIsImoiLCJlIiwibG9jIiwic2VtYW50aWNUb0xvY2F0aW9uIiwidmVydGV4QXR0cmliUG9pbnRlciIsIm51bUNvbXBvbmVudHMiLCJkYXRhVHlwZSIsIm5vcm1hbGl6ZSIsInN0cmlkZSIsIm9mZnNldCIsImVuYWJsZVZlcnRleEF0dHJpYkFycmF5IiwiaW5zdGFuY2luZyIsInNldEJ1ZmZlcnMiLCJwcmltaXRpdmUiLCJudW1JbnN0YW5jZXMiLCJrZWVwQnVmZmVycyIsInNhbXBsZXIiLCJzYW1wbGVyVmFsdWUiLCJudW1UZXh0dXJlcyIsInNjb3BlSWQiLCJ1bmlmb3JtVmVyc2lvbiIsInByb2dyYW1WZXJzaW9uIiwic2FtcGxlcnMiLCJ1bmlmb3JtcyIsImxlbiIsInNhbXBsZXJOYW1lIiwid2Fybk9uY2UiLCJkZXB0aEJ1ZmZlciIsImFycmF5IiwidW5pZm9ybTFpdiIsInZlcnNpb24iLCJ2ZXJzaW9uT2JqZWN0IiwiZ2xvYmFsSWQiLCJyZXZpc2lvbiIsImJpbmRCdWZmZXJCYXNlIiwiVFJBTlNGT1JNX0ZFRURCQUNLX0JVRkZFUiIsImJlZ2luVHJhbnNmb3JtRmVlZGJhY2siLCJtb2RlIiwiZ2xGb3JtYXQiLCJieXRlc1BlckluZGV4IiwiZHJhd0VsZW1lbnRzIiwiZmlyc3QiLCJkcmF3QXJyYXlzIiwiZW5kVHJhbnNmb3JtRmVlZGJhY2siLCJfZHJhd0NhbGxzUGVyRnJhbWUiLCJfcHJpbXNQZXJGcmFtZSIsIl9vcHRpb25zJGZsYWdzIiwiZGVmYXVsdE9wdGlvbnMiLCJkZWZhdWx0Q2xlYXJPcHRpb25zIiwiX29wdGlvbnMkY29sb3IiLCJjIiwiX29wdGlvbnMkZGVwdGgiLCJXUklURURFUFRIIiwiX29wdGlvbnMkc3RlbmNpbCIsInN1Ym1pdCIsImZsdXNoIiwicmVhZFBpeGVsc0FzeW5jIiwiX3RoaXMkcmVuZGVyVGFyZ2V0JGNvIiwiX2ltcGwkX2dsRm9ybWF0IiwiX2ltcGwkX2dsUGl4ZWxUeXBlIiwiY2xpZW50V2FpdEFzeW5jIiwiaW50ZXJ2YWxfbXMiLCJzeW5jIiwiZmVuY2VTeW5jIiwiU1lOQ19HUFVfQ09NTUFORFNfQ09NUExFVEUiLCJQcm9taXNlIiwicmVqZWN0IiwidGVzdCIsInJlcyIsImNsaWVudFdhaXRTeW5jIiwiV0FJVF9GQUlMRUQiLCJkZWxldGVTeW5jIiwiVElNRU9VVF9FWFBJUkVEIiwic2V0VGltZW91dCIsIl9nbEZvcm1hdCIsInBpeGVsVHlwZSIsIl9nbFBpeGVsVHlwZSIsImJ1ZiIsImNyZWF0ZUJ1ZmZlciIsIlBJWEVMX1BBQ0tfQlVGRkVSIiwiYnVmZmVyRGF0YSIsImJ5dGVMZW5ndGgiLCJTVFJFQU1fUkVBRCIsImdldEJ1ZmZlclN1YkRhdGEiLCJkZWxldGVCdWZmZXIiLCJzZXRBbHBoYVRvQ292ZXJhZ2UiLCJzdGF0ZSIsInNldFRyYW5zZm9ybUZlZWRiYWNrQnVmZmVyIiwidGYiLCJjcmVhdGVUcmFuc2Zvcm1GZWVkYmFjayIsImJpbmRUcmFuc2Zvcm1GZWVkYmFjayIsIlRSQU5TRk9STV9GRUVEQkFDSyIsInNldFJhc3RlciIsIm9uIiwic2V0RGVwdGhCaWFzIiwic2V0RGVwdGhCaWFzVmFsdWVzIiwiY29uc3RCaWFzIiwic2xvcGVCaWFzIiwicG9seWdvbk9mZnNldCIsInNldFN0ZW5jaWxUZXN0Iiwic2V0U3RlbmNpbEZ1bmMiLCJmdW5jIiwicmVmIiwibWFzayIsInNldFN0ZW5jaWxGdW5jRnJvbnQiLCJzdGVuY2lsRnVuY1NlcGFyYXRlIiwic2V0U3RlbmNpbEZ1bmNCYWNrIiwic2V0U3RlbmNpbE9wZXJhdGlvbiIsImZhaWwiLCJ6ZmFpbCIsInpwYXNzIiwid3JpdGVNYXNrIiwic2V0U3RlbmNpbE9wZXJhdGlvbkZyb250Iiwic3RlbmNpbE9wU2VwYXJhdGUiLCJzdGVuY2lsTWFza1NlcGFyYXRlIiwic2V0U3RlbmNpbE9wZXJhdGlvbkJhY2siLCJibGVuZFN0YXRlIiwiY3VycmVudEJsZW5kU3RhdGUiLCJlcXVhbHMiLCJibGVuZCIsImNvbG9yT3AiLCJhbHBoYU9wIiwiY29sb3JTcmNGYWN0b3IiLCJjb2xvckRzdEZhY3RvciIsImFscGhhU3JjRmFjdG9yIiwiYWxwaGFEc3RGYWN0b3IiLCJibGVuZEVxdWF0aW9uU2VwYXJhdGUiLCJibGVuZEZ1bmNTZXBhcmF0ZSIsImFsbFdyaXRlIiwicmVkV3JpdGUiLCJncmVlbldyaXRlIiwiYmx1ZVdyaXRlIiwiYWxwaGFXcml0ZSIsImNvcHkiLCJzZXRCbGVuZENvbG9yIiwic3RlbmNpbEZyb250Iiwic3RlbmNpbEJhY2siLCJyZWFkTWFzayIsIl9zdGVuY2lsRnJvbnQiLCJfc3RlbmNpbEJhY2siLCJTdGVuY2lsUGFyYW1ldGVycyIsIkRFRkFVTFQiLCJkZXB0aFN0YXRlIiwiY3VycmVudERlcHRoU3RhdGUiLCJ3cml0ZSIsImN1bGxNb2RlIiwiZmFpbGVkIiwicmVhZHkiLCJmaW5hbGl6ZSIsInVzZVByb2dyYW0iLCJnbFByb2dyYW0iLCJfc2hhZGVyU3dpdGNoZXNQZXJGcmFtZSIsImF0dHJpYnV0ZXNJbnZhbGlkYXRlZCIsImdldEhkckZvcm1hdCIsInByZWZlckxhcmdlc3QiLCJyZW5kZXJhYmxlIiwidXBkYXRhYmxlIiwiZmlsdGVyYWJsZSIsImYxNlZhbGlkIiwiZjMyVmFsaWQiLCJmb3JFYWNoIiwiaXRlbSIsIm1hcE9iaiIsInJlc2l6ZUNhbnZhcyIsIl93aWR0aCIsIl9oZWlnaHQiLCJyYXRpbyIsIl9tYXhQaXhlbFJhdGlvIiwiZGV2aWNlUGl4ZWxSYXRpbyIsIkVWRU5UX1JFU0laRSIsImRyYXdpbmdCdWZmZXJXaWR0aCIsImRyYXdpbmdCdWZmZXJIZWlnaHQiLCJmdWxsc2NyZWVuIiwicmVxdWVzdEZ1bGxzY3JlZW4iLCJkb2N1bWVudCIsImV4aXRGdWxsc2NyZWVuIiwiZnVsbHNjcmVlbkVsZW1lbnQiLCJ0ZXh0dXJlRmxvYXRIaWdoUHJlY2lzaW9uIiwiZGVidWdMb3NlQ29udGV4dCIsInNsZWVwIiwiY29udGV4dCJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQTJDQSxNQUFNQSxxQkFBcUIsR0FBRyxFQUFFLENBQUE7QUFFaEMsTUFBTUMsaUJBQWlCLGFBQWMsQ0FBQTtBQUNy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
