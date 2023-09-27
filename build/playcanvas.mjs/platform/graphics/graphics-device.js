import { extends as _extends } from '../../_virtual/_rollupPluginBabelHelpers.js';
import { Debug } from '../../core/debug.js';
import { EventHandler } from '../../core/event-handler.js';
import { platform } from '../../core/platform.js';
import { now } from '../../core/time.js';
import { Vec2 } from '../../core/math/vec2.js';
import { Tracing } from '../../core/tracing.js';
import { TRACEID_TEXTURES } from '../../core/constants.js';
import { CLEARFLAG_COLOR, CLEARFLAG_DEPTH, PRIMITIVE_TRIFAN, SEMANTIC_POSITION, TYPE_FLOAT32, BUFFER_STATIC, CULLFACE_BACK, PRIMITIVE_POINTS } from './constants.js';
import { BlendState } from './blend-state.js';
import { DepthState } from './depth-state.js';
import { ScopeSpace } from './scope-space.js';
import { VertexBuffer } from './vertex-buffer.js';
import { VertexFormat } from './vertex-format.js';
import { StencilParameters } from './stencil-parameters.js';

/**
 * The graphics device manages the underlying graphics context. It is responsible for submitting
 * render state changes and graphics primitives to the hardware. A graphics device is tied to a
 * specific canvas HTML element. It is valid to have more than one canvas element per page and
 * create a new graphics device against each.
 *
 * @augments EventHandler
 * @category Graphics
 */
class GraphicsDevice extends EventHandler {
  constructor(canvas, options) {
    var _this$initOptions, _this$initOptions$dep, _this$initOptions2, _this$initOptions2$st, _this$initOptions3, _this$initOptions3$an, _this$initOptions4, _this$initOptions4$po;
    super();
    /**
     * The canvas DOM element that provides the underlying WebGL context used by the graphics device.
     *
     * @type {HTMLCanvasElement}
     * @readonly
     */
    this.canvas = void 0;
    /**
     * The render target representing the main back-buffer.
     *
     * @type {import('./render-target.js').RenderTarget|null}
     * @ignore
     */
    this.backBuffer = null;
    /**
     * The dimensions of the back buffer.
     *
     * @ignore
     */
    this.backBufferSize = new Vec2();
    /**
     * The pixel format of the back buffer. Typically PIXELFORMAT_RGBA8, PIXELFORMAT_BGRA8 or
     * PIXELFORMAT_RGB8.
     *
     * @ignore
     */
    this.backBufferFormat = void 0;
    /**
     * True if the deviceType is WebGPU
     *
     * @type {boolean}
     * @readonly
     */
    this.isWebGPU = false;
    /**
     * The scope namespace for shader attributes and variables.
     *
     * @type {ScopeSpace}
     * @readonly
     */
    this.scope = void 0;
    /**
     * The maximum number of supported bones using uniform buffers.
     *
     * @type {number}
     * @readonly
     */
    this.boneLimit = void 0;
    /**
     * The maximum supported texture anisotropy setting.
     *
     * @type {number}
     * @readonly
     */
    this.maxAnisotropy = void 0;
    /**
     * The maximum supported dimension of a cube map.
     *
     * @type {number}
     * @readonly
     */
    this.maxCubeMapSize = void 0;
    /**
     * The maximum supported dimension of a texture.
     *
     * @type {number}
     * @readonly
     */
    this.maxTextureSize = void 0;
    /**
     * The maximum supported dimension of a 3D texture (any axis).
     *
     * @type {number}
     * @readonly
     */
    this.maxVolumeSize = void 0;
    /**
     * The maximum supported number of color buffers attached to a render target.
     *
     * @type {number}
     * @readonly
     */
    this.maxColorAttachments = 1;
    /**
     * The highest shader precision supported by this graphics device. Can be 'hiphp', 'mediump' or
     * 'lowp'.
     *
     * @type {string}
     * @readonly
     */
    this.precision = void 0;
    /**
     * The number of hardware anti-aliasing samples used by the frame buffer.
     *
     * @readonly
     * @type {number}
     */
    this.samples = void 0;
    /**
     * True if the main framebuffer contains stencil attachment.
     *
     * @ignore
     * @type {boolean}
     */
    this.supportsStencil = void 0;
    /**
     * True if Multiple Render Targets feature is supported. This refers to the ability to render to
     * multiple color textures with a single draw call.
     *
     * @readonly
     * @type {boolean}
     */
    this.supportsMrt = false;
    /**
     * True if the device supports volume textures.
     *
     * @readonly
     * @type {boolean}
     */
    this.supportsVolumeTextures = false;
    /**
     * Currently active render target.
     *
     * @type {import('./render-target.js').RenderTarget|null}
     * @ignore
     */
    this.renderTarget = null;
    /**
     * Array of objects that need to be re-initialized after a context restore event
     *
     * @type {import('./shader.js').Shader[]}
     * @ignore
     */
    this.shaders = [];
    /**
     * An array of currently created textures.
     *
     * @type {import('./texture.js').Texture[]}
     * @ignore
     */
    this.textures = [];
    /**
     * A set of currently created render targets.
     *
     * @type {Set<import('./render-target.js').RenderTarget>}
     * @ignore
     */
    this.targets = new Set();
    /**
     * A version number that is incremented every frame. This is used to detect if some object were
     * invalidated.
     *
     * @type {number}
     * @ignore
     */
    this.renderVersion = 0;
    /**
     * Index of the currently active render pass.
     *
     * @type {number}
     * @ignore
     */
    this.renderPassIndex = void 0;
    /** @type {boolean} */
    this.insideRenderPass = false;
    /**
     * True if hardware instancing is supported.
     *
     * @type {boolean}
     * @readonly
     */
    this.supportsInstancing = void 0;
    /**
     * True if the device supports uniform buffers.
     *
     * @type {boolean}
     * @ignore
     */
    this.supportsUniformBuffers = false;
    /**
     * True if 32-bit floating-point textures can be used as a frame buffer.
     *
     * @type {boolean}
     * @readonly
     */
    this.textureFloatRenderable = void 0;
    /**
     * True if 16-bit floating-point textures can be used as a frame buffer.
     *
     * @type {boolean}
     * @readonly
     */
    this.textureHalfFloatRenderable = void 0;
    /**
     * A vertex buffer representing a quad.
     *
     * @type {VertexBuffer}
     * @ignore
     */
    this.quadVertexBuffer = void 0;
    /**
     * An object representing current blend state
     *
     * @ignore
     */
    this.blendState = new BlendState();
    /**
     * The current depth state.
     *
     * @ignore
     */
    this.depthState = new DepthState();
    /**
     * True if stencil is enabled and stencilFront and stencilBack are used
     *
     * @ignore
     */
    this.stencilEnabled = false;
    /**
     * The current front stencil parameters.
     *
     * @ignore
     */
    this.stencilFront = new StencilParameters();
    /**
     * The current back stencil parameters.
     *
     * @ignore
     */
    this.stencilBack = new StencilParameters();
    /**
     * The dynamic buffer manager.
     *
     * @type {import('./dynamic-buffers.js').DynamicBuffers}
     * @ignore
     */
    this.dynamicBuffers = void 0;
    /**
     * The GPU profiler.
     *
     * @type {import('./gpu-profiler.js').GpuProfiler}
     */
    this.gpuProfiler = void 0;
    this.defaultClearOptions = {
      color: [0, 0, 0, 1],
      depth: 1,
      stencil: 0,
      flags: CLEARFLAG_COLOR | CLEARFLAG_DEPTH
    };
    this.canvas = canvas;

    // copy options and handle defaults
    this.initOptions = _extends({}, options);
    (_this$initOptions$dep = (_this$initOptions = this.initOptions).depth) != null ? _this$initOptions$dep : _this$initOptions.depth = true;
    (_this$initOptions2$st = (_this$initOptions2 = this.initOptions).stencil) != null ? _this$initOptions2$st : _this$initOptions2.stencil = true;
    (_this$initOptions3$an = (_this$initOptions3 = this.initOptions).antialias) != null ? _this$initOptions3$an : _this$initOptions3.antialias = true;
    (_this$initOptions4$po = (_this$initOptions4 = this.initOptions).powerPreference) != null ? _this$initOptions4$po : _this$initOptions4.powerPreference = 'high-performance';

    // local width/height without pixelRatio applied
    this._width = 0;
    this._height = 0;

    // Some devices window.devicePixelRatio can be less than one
    // eg Oculus Quest 1 which returns a window.devicePixelRatio of 0.8
    this._maxPixelRatio = platform.browser ? Math.min(1, window.devicePixelRatio) : 1;
    this.buffers = [];
    this._vram = {
      texShadow: 0,
      texAsset: 0,
      texLightmap: 0,
      tex: 0,
      vb: 0,
      ib: 0,
      ub: 0
    };
    this._shaderStats = {
      vsCompiled: 0,
      fsCompiled: 0,
      linked: 0,
      materialShaders: 0,
      compileTime: 0
    };
    this.initializeContextCaches();

    // Profiler stats
    this._drawCallsPerFrame = 0;
    this._shaderSwitchesPerFrame = 0;
    this._primsPerFrame = [];
    for (let i = PRIMITIVE_POINTS; i <= PRIMITIVE_TRIFAN; i++) {
      this._primsPerFrame[i] = 0;
    }
    this._renderTargetCreationTime = 0;

    // Create the ScopeNamespace for shader attributes and variables
    this.scope = new ScopeSpace("Device");
    this.textureBias = this.scope.resolve("textureBias");
    this.textureBias.setValue(0.0);
  }

  /**
   * Function that executes after the device has been created.
   */
  postInit() {
    // create quad vertex buffer
    const vertexFormat = new VertexFormat(this, [{
      semantic: SEMANTIC_POSITION,
      components: 2,
      type: TYPE_FLOAT32
    }]);
    const positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    this.quadVertexBuffer = new VertexBuffer(this, vertexFormat, 4, BUFFER_STATIC, positions);
  }

  /**
   * Fired when the canvas is resized.
   *
   * @event GraphicsDevice#resizecanvas
   * @param {number} width - The new width of the canvas in pixels.
   * @param {number} height - The new height of the canvas in pixels.
   */

  /**
   * Destroy the graphics device.
   */
  destroy() {
    var _this$quadVertexBuffe, _this$dynamicBuffers, _this$gpuProfiler;
    // fire the destroy event.
    // textures and other device resources may destroy themselves in response.
    this.fire('destroy');
    (_this$quadVertexBuffe = this.quadVertexBuffer) == null ? void 0 : _this$quadVertexBuffe.destroy();
    this.quadVertexBuffer = null;
    (_this$dynamicBuffers = this.dynamicBuffers) == null ? void 0 : _this$dynamicBuffers.destroy();
    this.dynamicBuffers = null;
    (_this$gpuProfiler = this.gpuProfiler) == null ? void 0 : _this$gpuProfiler.destroy();
    this.gpuProfiler = null;
  }
  onDestroyShader(shader) {
    this.fire('destroy:shader', shader);
    const idx = this.shaders.indexOf(shader);
    if (idx !== -1) {
      this.shaders.splice(idx, 1);
    }
  }

  // executes after the extended classes have executed their destroy function
  postDestroy() {
    this.scope = null;
    this.canvas = null;
  }

  // don't stringify GraphicsDevice to JSON by JSON.stringify
  toJSON(key) {
    return undefined;
  }
  initializeContextCaches() {
    this.indexBuffer = null;
    this.vertexBuffers = [];
    this.shader = null;
    this.renderTarget = null;
  }
  initializeRenderState() {
    this.blendState = new BlendState();
    this.depthState = new DepthState();
    this.cullMode = CULLFACE_BACK;

    // Cached viewport and scissor dimensions
    this.vx = this.vy = this.vw = this.vh = 0;
    this.sx = this.sy = this.sw = this.sh = 0;
  }

  /**
   * Sets the specified stencil state. If both stencilFront and stencilBack are null, stencil
   * operation is disabled.
   *
   * @param {StencilParameters} [stencilFront] - The front stencil parameters. Defaults to
   * {@link StencilParameters.DEFAULT} if not specified.
   * @param {StencilParameters} [stencilBack] - The back stencil parameters. Defaults to
   * {@link StencilParameters.DEFAULT} if not specified.
   */
  setStencilState(stencilFront, stencilBack) {
    Debug.assert(false);
  }

  /**
   * Sets the specified blend state.
   *
   * @param {BlendState} blendState - New blend state.
   */
  setBlendState(blendState) {
    Debug.assert(false);
  }

  /**
   * Sets the specified depth state.
   *
   * @param {DepthState} depthState - New depth state.
   */
  setDepthState(depthState) {
    Debug.assert(false);
  }

  /**
   * Controls how triangles are culled based on their face direction. The default cull mode is
   * {@link CULLFACE_BACK}.
   *
   * @param {number} cullMode - The cull mode to set. Can be:
   *
   * - {@link CULLFACE_NONE}
   * - {@link CULLFACE_BACK}
   * - {@link CULLFACE_FRONT}
   */
  setCullMode(cullMode) {
    Debug.assert(false);
  }

  /**
   * Sets the specified render target on the device. If null is passed as a parameter, the back
   * buffer becomes the current target for all rendering operations.
   *
   * @param {import('./render-target.js').RenderTarget|null} renderTarget - The render target to
   * activate.
   * @example
   * // Set a render target to receive all rendering output
   * device.setRenderTarget(renderTarget);
   *
   * // Set the back buffer to receive all rendering output
   * device.setRenderTarget(null);
   */
  setRenderTarget(renderTarget) {
    this.renderTarget = renderTarget;
  }

  /**
   * Sets the current index buffer on the graphics device. On subsequent calls to
   * {@link GraphicsDevice#draw}, the specified index buffer will be used to provide index data
   * for any indexed primitives.
   *
   * @param {import('./index-buffer.js').IndexBuffer} indexBuffer - The index buffer to assign to
   * the device.
   */
  setIndexBuffer(indexBuffer) {
    // Store the index buffer
    this.indexBuffer = indexBuffer;
  }

  /**
   * Sets the current vertex buffer on the graphics device. On subsequent calls to
   * {@link GraphicsDevice#draw}, the specified vertex buffer(s) will be used to provide vertex
   * data for any primitives.
   *
   * @param {import('./vertex-buffer.js').VertexBuffer} vertexBuffer - The vertex buffer to
   * assign to the device.
   */
  setVertexBuffer(vertexBuffer) {
    if (vertexBuffer) {
      this.vertexBuffers.push(vertexBuffer);
    }
  }

  /**
   * Queries the currently set render target on the device.
   *
   * @returns {import('./render-target.js').RenderTarget} The current render target.
   * @example
   * // Get the current render target
   * const renderTarget = device.getRenderTarget();
   */
  getRenderTarget() {
    return this.renderTarget;
  }

  /**
   * Initialize render target before it can be used.
   *
   * @param {import('./render-target.js').RenderTarget} target - The render target to be
   * initialized.
   * @ignore
   */
  initRenderTarget(target) {
    if (target.initialized) return;
    const startTime = now();
    this.fire('fbo:create', {
      timestamp: startTime,
      target: this
    });
    target.init();
    this.targets.add(target);
    this._renderTargetCreationTime += now() - startTime;
  }

  /**
   * Reports whether a texture source is a canvas, image, video or ImageBitmap.
   *
   * @param {*} texture - Texture source data.
   * @returns {boolean} True if the texture is a canvas, image, video or ImageBitmap and false
   * otherwise.
   * @ignore
   */
  _isBrowserInterface(texture) {
    return this._isImageBrowserInterface(texture) || this._isImageCanvasInterface(texture) || this._isImageVideoInterface(texture);
  }
  _isImageBrowserInterface(texture) {
    return typeof ImageBitmap !== 'undefined' && texture instanceof ImageBitmap || typeof HTMLImageElement !== 'undefined' && texture instanceof HTMLImageElement;
  }
  _isImageCanvasInterface(texture) {
    return typeof HTMLCanvasElement !== 'undefined' && texture instanceof HTMLCanvasElement;
  }
  _isImageVideoInterface(texture) {
    return typeof HTMLVideoElement !== 'undefined' && texture instanceof HTMLVideoElement;
  }

  /**
   * Sets the width and height of the canvas, then fires the `resizecanvas` event. Note that the
   * specified width and height values will be multiplied by the value of
   * {@link GraphicsDevice#maxPixelRatio} to give the final resultant width and height for the
   * canvas.
   *
   * @param {number} width - The new width of the canvas.
   * @param {number} height - The new height of the canvas.
   * @ignore
   */
  resizeCanvas(width, height) {}

  /**
   * Sets the width and height of the canvas, then fires the `resizecanvas` event. Note that the
   * value of {@link GraphicsDevice#maxPixelRatio} is ignored.
   *
   * @param {number} width - The new width of the canvas.
   * @param {number} height - The new height of the canvas.
   * @ignore
   */
  setResolution(width, height) {
    this._width = width;
    this._height = height;
    this.canvas.width = width;
    this.canvas.height = height;
    this.fire(GraphicsDevice.EVENT_RESIZE, width, height);
  }
  updateClientRect() {
    this.clientRect = this.canvas.getBoundingClientRect();
  }

  /**
   * Width of the back buffer in pixels.
   *
   * @type {number}
   */
  get width() {
    Debug.error("GraphicsDevice.width is not implemented on current device.");
    return this.canvas.width;
  }

  /**
   * Height of the back buffer in pixels.
   *
   * @type {number}
   */
  get height() {
    Debug.error("GraphicsDevice.height is not implemented on current device.");
    return this.canvas.height;
  }

  /**
   * Fullscreen mode.
   *
   * @type {boolean}
   */
  set fullscreen(fullscreen) {
    Debug.error("GraphicsDevice.fullscreen is not implemented on current device.");
  }
  get fullscreen() {
    Debug.error("GraphicsDevice.fullscreen is not implemented on current device.");
    return false;
  }

  /**
   * Maximum pixel ratio.
   *
   * @type {number}
   */
  set maxPixelRatio(ratio) {
    if (this._maxPixelRatio !== ratio) {
      this._maxPixelRatio = ratio;
      this.resizeCanvas(this._width, this._height);
    }
  }
  get maxPixelRatio() {
    return this._maxPixelRatio;
  }

  /**
   * The type of the device. Can be one of pc.DEVICETYPE_WEBGL1, pc.DEVICETYPE_WEBGL2 or pc.DEVICETYPE_WEBGPU.
   *
   * @type {import('./constants.js').DEVICETYPE_WEBGL1 | import('./constants.js').DEVICETYPE_WEBGL2 | import('./constants.js').DEVICETYPE_WEBGPU}
   */
  get deviceType() {
    return this._deviceType;
  }

  /**
   * Queries the maximum number of bones that can be referenced by a shader. The shader
   * generators (programlib) use this number to specify the matrix array size of the uniform
   * 'matrix_pose[0]'. The value is calculated based on the number of available uniform vectors
   * available after subtracting the number taken by a typical heavyweight shader. If a different
   * number is required, it can be tuned via {@link GraphicsDevice#setBoneLimit}.
   *
   * @returns {number} The maximum number of bones that can be supported by the host hardware.
   * @ignore
   */
  getBoneLimit() {
    return this.boneLimit;
  }

  /**
   * Specifies the maximum number of bones that the device can support on the current hardware.
   * This function allows the default calculated value based on available vector uniforms to be
   * overridden.
   *
   * @param {number} maxBones - The maximum number of bones supported by the host hardware.
   * @ignore
   */
  setBoneLimit(maxBones) {
    this.boneLimit = maxBones;
  }

  /**
   * Function which executes at the start of the frame. This should not be called manually, as
   * it is handled by the AppBase instance.
   *
   * @ignore
   */
  frameStart() {
    this.renderPassIndex = 0;
    this.renderVersion++;
    Debug.call(() => {
      // log out all loaded textures, sorted by gpu memory size
      if (Tracing.get(TRACEID_TEXTURES)) {
        const textures = this.textures.slice();
        textures.sort((a, b) => b.gpuSize - a.gpuSize);
        Debug.log(`Textures: ${textures.length}`);
        let textureTotal = 0;
        textures.forEach((texture, index) => {
          const textureSize = texture.gpuSize;
          textureTotal += textureSize;
          Debug.log(`${index}. ${texture.name} ${texture.width}x${texture.height} VRAM: ${(textureSize / 1024 / 1024).toFixed(2)} MB`);
        });
        Debug.log(`Total: ${(textureTotal / 1024 / 1024).toFixed(2)}MB`);
      }
    });
  }

  /**
   * Function which executes at the end of the frame. This should not be called manually, as it is
   * handled by the AppBase instance.
   *
   * @ignore
   */
  frameEnd() {}
}
GraphicsDevice.EVENT_RESIZE = 'resizecanvas';

export { GraphicsDevice };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ3JhcGhpY3MtZGV2aWNlLmpzIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvcGxhdGZvcm0vZ3JhcGhpY3MvZ3JhcGhpY3MtZGV2aWNlLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IERlYnVnIH0gZnJvbSAnLi4vLi4vY29yZS9kZWJ1Zy5qcyc7XG5pbXBvcnQgeyBFdmVudEhhbmRsZXIgfSBmcm9tICcuLi8uLi9jb3JlL2V2ZW50LWhhbmRsZXIuanMnO1xuaW1wb3J0IHsgcGxhdGZvcm0gfSBmcm9tICcuLi8uLi9jb3JlL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IG5vdyB9IGZyb20gJy4uLy4uL2NvcmUvdGltZS5qcyc7XG5pbXBvcnQgeyBWZWMyIH0gZnJvbSAnLi4vLi4vY29yZS9tYXRoL3ZlYzIuanMnO1xuaW1wb3J0IHsgVHJhY2luZyB9IGZyb20gJy4uLy4uL2NvcmUvdHJhY2luZy5qcyc7XG5pbXBvcnQgeyBUUkFDRUlEX1RFWFRVUkVTIH0gZnJvbSAnLi4vLi4vY29yZS9jb25zdGFudHMuanMnO1xuXG5pbXBvcnQge1xuICAgIEJVRkZFUl9TVEFUSUMsXG4gICAgQ1VMTEZBQ0VfQkFDSyxcbiAgICBDTEVBUkZMQUdfQ09MT1IsIENMRUFSRkxBR19ERVBUSCxcbiAgICBQUklNSVRJVkVfUE9JTlRTLCBQUklNSVRJVkVfVFJJRkFOLCBTRU1BTlRJQ19QT1NJVElPTiwgVFlQRV9GTE9BVDMyXG59IGZyb20gJy4vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IEJsZW5kU3RhdGUgfSBmcm9tICcuL2JsZW5kLXN0YXRlLmpzJztcbmltcG9ydCB7IERlcHRoU3RhdGUgfSBmcm9tICcuL2RlcHRoLXN0YXRlLmpzJztcbmltcG9ydCB7IFNjb3BlU3BhY2UgfSBmcm9tICcuL3Njb3BlLXNwYWNlLmpzJztcbmltcG9ydCB7IFZlcnRleEJ1ZmZlciB9IGZyb20gJy4vdmVydGV4LWJ1ZmZlci5qcyc7XG5pbXBvcnQgeyBWZXJ0ZXhGb3JtYXQgfSBmcm9tICcuL3ZlcnRleC1mb3JtYXQuanMnO1xuaW1wb3J0IHsgU3RlbmNpbFBhcmFtZXRlcnMgfSBmcm9tICcuL3N0ZW5jaWwtcGFyYW1ldGVycy5qcyc7XG5cbi8qKlxuICogVGhlIGdyYXBoaWNzIGRldmljZSBtYW5hZ2VzIHRoZSB1bmRlcmx5aW5nIGdyYXBoaWNzIGNvbnRleHQuIEl0IGlzIHJlc3BvbnNpYmxlIGZvciBzdWJtaXR0aW5nXG4gKiByZW5kZXIgc3RhdGUgY2hhbmdlcyBhbmQgZ3JhcGhpY3MgcHJpbWl0aXZlcyB0byB0aGUgaGFyZHdhcmUuIEEgZ3JhcGhpY3MgZGV2aWNlIGlzIHRpZWQgdG8gYVxuICogc3BlY2lmaWMgY2FudmFzIEhUTUwgZWxlbWVudC4gSXQgaXMgdmFsaWQgdG8gaGF2ZSBtb3JlIHRoYW4gb25lIGNhbnZhcyBlbGVtZW50IHBlciBwYWdlIGFuZFxuICogY3JlYXRlIGEgbmV3IGdyYXBoaWNzIGRldmljZSBhZ2FpbnN0IGVhY2guXG4gKlxuICogQGF1Z21lbnRzIEV2ZW50SGFuZGxlclxuICogQGNhdGVnb3J5IEdyYXBoaWNzXG4gKi9cbmNsYXNzIEdyYXBoaWNzRGV2aWNlIGV4dGVuZHMgRXZlbnRIYW5kbGVyIHtcbiAgICAvKipcbiAgICAgKiBUaGUgY2FudmFzIERPTSBlbGVtZW50IHRoYXQgcHJvdmlkZXMgdGhlIHVuZGVybHlpbmcgV2ViR0wgY29udGV4dCB1c2VkIGJ5IHRoZSBncmFwaGljcyBkZXZpY2UuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7SFRNTENhbnZhc0VsZW1lbnR9XG4gICAgICogQHJlYWRvbmx5XG4gICAgICovXG4gICAgY2FudmFzO1xuXG4gICAgLyoqXG4gICAgICogVGhlIHJlbmRlciB0YXJnZXQgcmVwcmVzZW50aW5nIHRoZSBtYWluIGJhY2stYnVmZmVyLlxuICAgICAqXG4gICAgICogQHR5cGUge2ltcG9ydCgnLi9yZW5kZXItdGFyZ2V0LmpzJykuUmVuZGVyVGFyZ2V0fG51bGx9XG4gICAgICogQGlnbm9yZVxuICAgICAqL1xuICAgIGJhY2tCdWZmZXIgPSBudWxsO1xuXG4gICAgLyoqXG4gICAgICogVGhlIGRpbWVuc2lvbnMgb2YgdGhlIGJhY2sgYnVmZmVyLlxuICAgICAqXG4gICAgICogQGlnbm9yZVxuICAgICAqL1xuICAgIGJhY2tCdWZmZXJTaXplID0gbmV3IFZlYzIoKTtcblxuICAgIC8qKlxuICAgICAqIFRoZSBwaXhlbCBmb3JtYXQgb2YgdGhlIGJhY2sgYnVmZmVyLiBUeXBpY2FsbHkgUElYRUxGT1JNQVRfUkdCQTgsIFBJWEVMRk9STUFUX0JHUkE4IG9yXG4gICAgICogUElYRUxGT1JNQVRfUkdCOC5cbiAgICAgKlxuICAgICAqIEBpZ25vcmVcbiAgICAgKi9cbiAgICBiYWNrQnVmZmVyRm9ybWF0O1xuXG4gICAgLyoqXG4gICAgICogVHJ1ZSBpZiB0aGUgZGV2aWNlVHlwZSBpcyBXZWJHUFVcbiAgICAgKlxuICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAqIEByZWFkb25seVxuICAgICAqL1xuICAgIGlzV2ViR1BVID0gZmFsc2U7XG5cbiAgICAvKipcbiAgICAgKiBUaGUgc2NvcGUgbmFtZXNwYWNlIGZvciBzaGFkZXIgYXR0cmlidXRlcyBhbmQgdmFyaWFibGVzLlxuICAgICAqXG4gICAgICogQHR5cGUge1Njb3BlU3BhY2V9XG4gICAgICogQHJlYWRvbmx5XG4gICAgICovXG4gICAgc2NvcGU7XG5cbiAgICAvKipcbiAgICAgKiBUaGUgbWF4aW11bSBudW1iZXIgb2Ygc3VwcG9ydGVkIGJvbmVzIHVzaW5nIHVuaWZvcm0gYnVmZmVycy5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtudW1iZXJ9XG4gICAgICogQHJlYWRvbmx5XG4gICAgICovXG4gICAgYm9uZUxpbWl0O1xuXG4gICAgLyoqXG4gICAgICogVGhlIG1heGltdW0gc3VwcG9ydGVkIHRleHR1cmUgYW5pc290cm9weSBzZXR0aW5nLlxuICAgICAqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKiBAcmVhZG9ubHlcbiAgICAgKi9cbiAgICBtYXhBbmlzb3Ryb3B5O1xuXG4gICAgLyoqXG4gICAgICogVGhlIG1heGltdW0gc3VwcG9ydGVkIGRpbWVuc2lvbiBvZiBhIGN1YmUgbWFwLlxuICAgICAqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKiBAcmVhZG9ubHlcbiAgICAgKi9cbiAgICBtYXhDdWJlTWFwU2l6ZTtcblxuICAgIC8qKlxuICAgICAqIFRoZSBtYXhpbXVtIHN1cHBvcnRlZCBkaW1lbnNpb24gb2YgYSB0ZXh0dXJlLlxuICAgICAqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKiBAcmVhZG9ubHlcbiAgICAgKi9cbiAgICBtYXhUZXh0dXJlU2l6ZTtcblxuICAgIC8qKlxuICAgICAqIFRoZSBtYXhpbXVtIHN1cHBvcnRlZCBkaW1lbnNpb24gb2YgYSAzRCB0ZXh0dXJlIChhbnkgYXhpcykuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqIEByZWFkb25seVxuICAgICAqL1xuICAgIG1heFZvbHVtZVNpemU7XG5cbiAgICAvKipcbiAgICAgKiBUaGUgbWF4aW11bSBzdXBwb3J0ZWQgbnVtYmVyIG9mIGNvbG9yIGJ1ZmZlcnMgYXR0YWNoZWQgdG8gYSByZW5kZXIgdGFyZ2V0LlxuICAgICAqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKiBAcmVhZG9ubHlcbiAgICAgKi9cbiAgICBtYXhDb2xvckF0dGFjaG1lbnRzID0gMTtcblxuICAgIC8qKlxuICAgICAqIFRoZSBoaWdoZXN0IHNoYWRlciBwcmVjaXNpb24gc3VwcG9ydGVkIGJ5IHRoaXMgZ3JhcGhpY3MgZGV2aWNlLiBDYW4gYmUgJ2hpcGhwJywgJ21lZGl1bXAnIG9yXG4gICAgICogJ2xvd3AnLlxuICAgICAqXG4gICAgICogQHR5cGUge3N0cmluZ31cbiAgICAgKiBAcmVhZG9ubHlcbiAgICAgKi9cbiAgICBwcmVjaXNpb247XG5cbiAgICAvKipcbiAgICAgKiBUaGUgbnVtYmVyIG9mIGhhcmR3YXJlIGFudGktYWxpYXNpbmcgc2FtcGxlcyB1c2VkIGJ5IHRoZSBmcmFtZSBidWZmZXIuXG4gICAgICpcbiAgICAgKiBAcmVhZG9ubHlcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqL1xuICAgIHNhbXBsZXM7XG5cbiAgICAvKipcbiAgICAgKiBUcnVlIGlmIHRoZSBtYWluIGZyYW1lYnVmZmVyIGNvbnRhaW5zIHN0ZW5jaWwgYXR0YWNobWVudC5cbiAgICAgKlxuICAgICAqIEBpZ25vcmVcbiAgICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICAgKi9cbiAgICBzdXBwb3J0c1N0ZW5jaWw7XG5cbiAgICAvKipcbiAgICAgKiBUcnVlIGlmIE11bHRpcGxlIFJlbmRlciBUYXJnZXRzIGZlYXR1cmUgaXMgc3VwcG9ydGVkLiBUaGlzIHJlZmVycyB0byB0aGUgYWJpbGl0eSB0byByZW5kZXIgdG9cbiAgICAgKiBtdWx0aXBsZSBjb2xvciB0ZXh0dXJlcyB3aXRoIGEgc2luZ2xlIGRyYXcgY2FsbC5cbiAgICAgKlxuICAgICAqIEByZWFkb25seVxuICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAqL1xuICAgIHN1cHBvcnRzTXJ0ID0gZmFsc2U7XG5cbiAgICAvKipcbiAgICAgKiBUcnVlIGlmIHRoZSBkZXZpY2Ugc3VwcG9ydHMgdm9sdW1lIHRleHR1cmVzLlxuICAgICAqXG4gICAgICogQHJlYWRvbmx5XG4gICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICovXG4gICAgc3VwcG9ydHNWb2x1bWVUZXh0dXJlcyA9IGZhbHNlO1xuXG4gICAgLyoqXG4gICAgICogQ3VycmVudGx5IGFjdGl2ZSByZW5kZXIgdGFyZ2V0LlxuICAgICAqXG4gICAgICogQHR5cGUge2ltcG9ydCgnLi9yZW5kZXItdGFyZ2V0LmpzJykuUmVuZGVyVGFyZ2V0fG51bGx9XG4gICAgICogQGlnbm9yZVxuICAgICAqL1xuICAgIHJlbmRlclRhcmdldCA9IG51bGw7XG5cbiAgICAvKipcbiAgICAgKiBBcnJheSBvZiBvYmplY3RzIHRoYXQgbmVlZCB0byBiZSByZS1pbml0aWFsaXplZCBhZnRlciBhIGNvbnRleHQgcmVzdG9yZSBldmVudFxuICAgICAqXG4gICAgICogQHR5cGUge2ltcG9ydCgnLi9zaGFkZXIuanMnKS5TaGFkZXJbXX1cbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgc2hhZGVycyA9IFtdO1xuXG4gICAgLyoqXG4gICAgICogQW4gYXJyYXkgb2YgY3VycmVudGx5IGNyZWF0ZWQgdGV4dHVyZXMuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7aW1wb3J0KCcuL3RleHR1cmUuanMnKS5UZXh0dXJlW119XG4gICAgICogQGlnbm9yZVxuICAgICAqL1xuICAgIHRleHR1cmVzID0gW107XG5cbiAgICAvKipcbiAgICAgKiBBIHNldCBvZiBjdXJyZW50bHkgY3JlYXRlZCByZW5kZXIgdGFyZ2V0cy5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtTZXQ8aW1wb3J0KCcuL3JlbmRlci10YXJnZXQuanMnKS5SZW5kZXJUYXJnZXQ+fVxuICAgICAqIEBpZ25vcmVcbiAgICAgKi9cbiAgICB0YXJnZXRzID0gbmV3IFNldCgpO1xuXG4gICAgLyoqXG4gICAgICogQSB2ZXJzaW9uIG51bWJlciB0aGF0IGlzIGluY3JlbWVudGVkIGV2ZXJ5IGZyYW1lLiBUaGlzIGlzIHVzZWQgdG8gZGV0ZWN0IGlmIHNvbWUgb2JqZWN0IHdlcmVcbiAgICAgKiBpbnZhbGlkYXRlZC5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtudW1iZXJ9XG4gICAgICogQGlnbm9yZVxuICAgICAqL1xuICAgIHJlbmRlclZlcnNpb24gPSAwO1xuXG4gICAgLyoqXG4gICAgICogSW5kZXggb2YgdGhlIGN1cnJlbnRseSBhY3RpdmUgcmVuZGVyIHBhc3MuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqIEBpZ25vcmVcbiAgICAgKi9cbiAgICByZW5kZXJQYXNzSW5kZXg7XG5cbiAgICAvKiogQHR5cGUge2Jvb2xlYW59ICovXG4gICAgaW5zaWRlUmVuZGVyUGFzcyA9IGZhbHNlO1xuXG4gICAgLyoqXG4gICAgICogVHJ1ZSBpZiBoYXJkd2FyZSBpbnN0YW5jaW5nIGlzIHN1cHBvcnRlZC5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAqIEByZWFkb25seVxuICAgICAqL1xuICAgIHN1cHBvcnRzSW5zdGFuY2luZztcblxuICAgIC8qKlxuICAgICAqIFRydWUgaWYgdGhlIGRldmljZSBzdXBwb3J0cyB1bmlmb3JtIGJ1ZmZlcnMuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgc3VwcG9ydHNVbmlmb3JtQnVmZmVycyA9IGZhbHNlO1xuXG4gICAgLyoqXG4gICAgICogVHJ1ZSBpZiAzMi1iaXQgZmxvYXRpbmctcG9pbnQgdGV4dHVyZXMgY2FuIGJlIHVzZWQgYXMgYSBmcmFtZSBidWZmZXIuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICAgKiBAcmVhZG9ubHlcbiAgICAgKi9cbiAgICB0ZXh0dXJlRmxvYXRSZW5kZXJhYmxlO1xuXG4gICAgIC8qKlxuICAgICAgKiBUcnVlIGlmIDE2LWJpdCBmbG9hdGluZy1wb2ludCB0ZXh0dXJlcyBjYW4gYmUgdXNlZCBhcyBhIGZyYW1lIGJ1ZmZlci5cbiAgICAgICpcbiAgICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICAqIEByZWFkb25seVxuICAgICAgKi9cbiAgICB0ZXh0dXJlSGFsZkZsb2F0UmVuZGVyYWJsZTtcblxuICAgIC8qKlxuICAgICAqIEEgdmVydGV4IGJ1ZmZlciByZXByZXNlbnRpbmcgYSBxdWFkLlxuICAgICAqXG4gICAgICogQHR5cGUge1ZlcnRleEJ1ZmZlcn1cbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgcXVhZFZlcnRleEJ1ZmZlcjtcblxuICAgIC8qKlxuICAgICAqIEFuIG9iamVjdCByZXByZXNlbnRpbmcgY3VycmVudCBibGVuZCBzdGF0ZVxuICAgICAqXG4gICAgICogQGlnbm9yZVxuICAgICAqL1xuICAgIGJsZW5kU3RhdGUgPSBuZXcgQmxlbmRTdGF0ZSgpO1xuXG4gICAgLyoqXG4gICAgICogVGhlIGN1cnJlbnQgZGVwdGggc3RhdGUuXG4gICAgICpcbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgZGVwdGhTdGF0ZSA9IG5ldyBEZXB0aFN0YXRlKCk7XG5cbiAgICAvKipcbiAgICAgKiBUcnVlIGlmIHN0ZW5jaWwgaXMgZW5hYmxlZCBhbmQgc3RlbmNpbEZyb250IGFuZCBzdGVuY2lsQmFjayBhcmUgdXNlZFxuICAgICAqXG4gICAgICogQGlnbm9yZVxuICAgICAqL1xuICAgIHN0ZW5jaWxFbmFibGVkID0gZmFsc2U7XG5cbiAgICAvKipcbiAgICAgKiBUaGUgY3VycmVudCBmcm9udCBzdGVuY2lsIHBhcmFtZXRlcnMuXG4gICAgICpcbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgc3RlbmNpbEZyb250ID0gbmV3IFN0ZW5jaWxQYXJhbWV0ZXJzKCk7XG5cbiAgICAvKipcbiAgICAgKiBUaGUgY3VycmVudCBiYWNrIHN0ZW5jaWwgcGFyYW1ldGVycy5cbiAgICAgKlxuICAgICAqIEBpZ25vcmVcbiAgICAgKi9cbiAgICBzdGVuY2lsQmFjayA9IG5ldyBTdGVuY2lsUGFyYW1ldGVycygpO1xuXG4gICAgLyoqXG4gICAgICogVGhlIGR5bmFtaWMgYnVmZmVyIG1hbmFnZXIuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7aW1wb3J0KCcuL2R5bmFtaWMtYnVmZmVycy5qcycpLkR5bmFtaWNCdWZmZXJzfVxuICAgICAqIEBpZ25vcmVcbiAgICAgKi9cbiAgICBkeW5hbWljQnVmZmVycztcblxuICAgIC8qKlxuICAgICAqIFRoZSBHUFUgcHJvZmlsZXIuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7aW1wb3J0KCcuL2dwdS1wcm9maWxlci5qcycpLkdwdVByb2ZpbGVyfVxuICAgICAqL1xuICAgIGdwdVByb2ZpbGVyO1xuXG4gICAgZGVmYXVsdENsZWFyT3B0aW9ucyA9IHtcbiAgICAgICAgY29sb3I6IFswLCAwLCAwLCAxXSxcbiAgICAgICAgZGVwdGg6IDEsXG4gICAgICAgIHN0ZW5jaWw6IDAsXG4gICAgICAgIGZsYWdzOiBDTEVBUkZMQUdfQ09MT1IgfCBDTEVBUkZMQUdfREVQVEhcbiAgICB9O1xuXG4gICAgc3RhdGljIEVWRU5UX1JFU0laRSA9ICdyZXNpemVjYW52YXMnO1xuXG4gICAgY29uc3RydWN0b3IoY2FudmFzLCBvcHRpb25zKSB7XG4gICAgICAgIHN1cGVyKCk7XG5cbiAgICAgICAgdGhpcy5jYW52YXMgPSBjYW52YXM7XG5cbiAgICAgICAgLy8gY29weSBvcHRpb25zIGFuZCBoYW5kbGUgZGVmYXVsdHNcbiAgICAgICAgdGhpcy5pbml0T3B0aW9ucyA9IHsgLi4ub3B0aW9ucyB9O1xuICAgICAgICB0aGlzLmluaXRPcHRpb25zLmRlcHRoID8/PSB0cnVlO1xuICAgICAgICB0aGlzLmluaXRPcHRpb25zLnN0ZW5jaWwgPz89IHRydWU7XG4gICAgICAgIHRoaXMuaW5pdE9wdGlvbnMuYW50aWFsaWFzID8/PSB0cnVlO1xuICAgICAgICB0aGlzLmluaXRPcHRpb25zLnBvd2VyUHJlZmVyZW5jZSA/Pz0gJ2hpZ2gtcGVyZm9ybWFuY2UnO1xuXG4gICAgICAgIC8vIGxvY2FsIHdpZHRoL2hlaWdodCB3aXRob3V0IHBpeGVsUmF0aW8gYXBwbGllZFxuICAgICAgICB0aGlzLl93aWR0aCA9IDA7XG4gICAgICAgIHRoaXMuX2hlaWdodCA9IDA7XG5cbiAgICAgICAgLy8gU29tZSBkZXZpY2VzIHdpbmRvdy5kZXZpY2VQaXhlbFJhdGlvIGNhbiBiZSBsZXNzIHRoYW4gb25lXG4gICAgICAgIC8vIGVnIE9jdWx1cyBRdWVzdCAxIHdoaWNoIHJldHVybnMgYSB3aW5kb3cuZGV2aWNlUGl4ZWxSYXRpbyBvZiAwLjhcbiAgICAgICAgdGhpcy5fbWF4UGl4ZWxSYXRpbyA9IHBsYXRmb3JtLmJyb3dzZXIgPyBNYXRoLm1pbigxLCB3aW5kb3cuZGV2aWNlUGl4ZWxSYXRpbykgOiAxO1xuXG4gICAgICAgIHRoaXMuYnVmZmVycyA9IFtdO1xuXG4gICAgICAgIHRoaXMuX3ZyYW0gPSB7XG4gICAgICAgICAgICAvLyAjaWYgX1BST0ZJTEVSXG4gICAgICAgICAgICB0ZXhTaGFkb3c6IDAsXG4gICAgICAgICAgICB0ZXhBc3NldDogMCxcbiAgICAgICAgICAgIHRleExpZ2h0bWFwOiAwLFxuICAgICAgICAgICAgLy8gI2VuZGlmXG4gICAgICAgICAgICB0ZXg6IDAsXG4gICAgICAgICAgICB2YjogMCxcbiAgICAgICAgICAgIGliOiAwLFxuICAgICAgICAgICAgdWI6IDBcbiAgICAgICAgfTtcblxuICAgICAgICB0aGlzLl9zaGFkZXJTdGF0cyA9IHtcbiAgICAgICAgICAgIHZzQ29tcGlsZWQ6IDAsXG4gICAgICAgICAgICBmc0NvbXBpbGVkOiAwLFxuICAgICAgICAgICAgbGlua2VkOiAwLFxuICAgICAgICAgICAgbWF0ZXJpYWxTaGFkZXJzOiAwLFxuICAgICAgICAgICAgY29tcGlsZVRpbWU6IDBcbiAgICAgICAgfTtcblxuICAgICAgICB0aGlzLmluaXRpYWxpemVDb250ZXh0Q2FjaGVzKCk7XG5cbiAgICAgICAgLy8gUHJvZmlsZXIgc3RhdHNcbiAgICAgICAgdGhpcy5fZHJhd0NhbGxzUGVyRnJhbWUgPSAwO1xuICAgICAgICB0aGlzLl9zaGFkZXJTd2l0Y2hlc1BlckZyYW1lID0gMDtcblxuICAgICAgICB0aGlzLl9wcmltc1BlckZyYW1lID0gW107XG4gICAgICAgIGZvciAobGV0IGkgPSBQUklNSVRJVkVfUE9JTlRTOyBpIDw9IFBSSU1JVElWRV9UUklGQU47IGkrKykge1xuICAgICAgICAgICAgdGhpcy5fcHJpbXNQZXJGcmFtZVtpXSA9IDA7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5fcmVuZGVyVGFyZ2V0Q3JlYXRpb25UaW1lID0gMDtcblxuICAgICAgICAvLyBDcmVhdGUgdGhlIFNjb3BlTmFtZXNwYWNlIGZvciBzaGFkZXIgYXR0cmlidXRlcyBhbmQgdmFyaWFibGVzXG4gICAgICAgIHRoaXMuc2NvcGUgPSBuZXcgU2NvcGVTcGFjZShcIkRldmljZVwiKTtcblxuICAgICAgICB0aGlzLnRleHR1cmVCaWFzID0gdGhpcy5zY29wZS5yZXNvbHZlKFwidGV4dHVyZUJpYXNcIik7XG4gICAgICAgIHRoaXMudGV4dHVyZUJpYXMuc2V0VmFsdWUoMC4wKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBGdW5jdGlvbiB0aGF0IGV4ZWN1dGVzIGFmdGVyIHRoZSBkZXZpY2UgaGFzIGJlZW4gY3JlYXRlZC5cbiAgICAgKi9cbiAgICBwb3N0SW5pdCgpIHtcblxuICAgICAgICAvLyBjcmVhdGUgcXVhZCB2ZXJ0ZXggYnVmZmVyXG4gICAgICAgIGNvbnN0IHZlcnRleEZvcm1hdCA9IG5ldyBWZXJ0ZXhGb3JtYXQodGhpcywgW1xuICAgICAgICAgICAgeyBzZW1hbnRpYzogU0VNQU5USUNfUE9TSVRJT04sIGNvbXBvbmVudHM6IDIsIHR5cGU6IFRZUEVfRkxPQVQzMiB9XG4gICAgICAgIF0pO1xuICAgICAgICBjb25zdCBwb3NpdGlvbnMgPSBuZXcgRmxvYXQzMkFycmF5KFstMSwgLTEsIDEsIC0xLCAtMSwgMSwgMSwgMV0pO1xuICAgICAgICB0aGlzLnF1YWRWZXJ0ZXhCdWZmZXIgPSBuZXcgVmVydGV4QnVmZmVyKHRoaXMsIHZlcnRleEZvcm1hdCwgNCwgQlVGRkVSX1NUQVRJQywgcG9zaXRpb25zKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBGaXJlZCB3aGVuIHRoZSBjYW52YXMgaXMgcmVzaXplZC5cbiAgICAgKlxuICAgICAqIEBldmVudCBHcmFwaGljc0RldmljZSNyZXNpemVjYW52YXNcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gd2lkdGggLSBUaGUgbmV3IHdpZHRoIG9mIHRoZSBjYW52YXMgaW4gcGl4ZWxzLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBoZWlnaHQgLSBUaGUgbmV3IGhlaWdodCBvZiB0aGUgY2FudmFzIGluIHBpeGVscy5cbiAgICAgKi9cblxuICAgIC8qKlxuICAgICAqIERlc3Ryb3kgdGhlIGdyYXBoaWNzIGRldmljZS5cbiAgICAgKi9cbiAgICBkZXN0cm95KCkge1xuICAgICAgICAvLyBmaXJlIHRoZSBkZXN0cm95IGV2ZW50LlxuICAgICAgICAvLyB0ZXh0dXJlcyBhbmQgb3RoZXIgZGV2aWNlIHJlc291cmNlcyBtYXkgZGVzdHJveSB0aGVtc2VsdmVzIGluIHJlc3BvbnNlLlxuICAgICAgICB0aGlzLmZpcmUoJ2Rlc3Ryb3knKTtcblxuICAgICAgICB0aGlzLnF1YWRWZXJ0ZXhCdWZmZXI/LmRlc3Ryb3koKTtcbiAgICAgICAgdGhpcy5xdWFkVmVydGV4QnVmZmVyID0gbnVsbDtcblxuICAgICAgICB0aGlzLmR5bmFtaWNCdWZmZXJzPy5kZXN0cm95KCk7XG4gICAgICAgIHRoaXMuZHluYW1pY0J1ZmZlcnMgPSBudWxsO1xuXG4gICAgICAgIHRoaXMuZ3B1UHJvZmlsZXI/LmRlc3Ryb3koKTtcbiAgICAgICAgdGhpcy5ncHVQcm9maWxlciA9IG51bGw7XG4gICAgfVxuXG4gICAgb25EZXN0cm95U2hhZGVyKHNoYWRlcikge1xuICAgICAgICB0aGlzLmZpcmUoJ2Rlc3Ryb3k6c2hhZGVyJywgc2hhZGVyKTtcblxuICAgICAgICBjb25zdCBpZHggPSB0aGlzLnNoYWRlcnMuaW5kZXhPZihzaGFkZXIpO1xuICAgICAgICBpZiAoaWR4ICE9PSAtMSkge1xuICAgICAgICAgICAgdGhpcy5zaGFkZXJzLnNwbGljZShpZHgsIDEpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gZXhlY3V0ZXMgYWZ0ZXIgdGhlIGV4dGVuZGVkIGNsYXNzZXMgaGF2ZSBleGVjdXRlZCB0aGVpciBkZXN0cm95IGZ1bmN0aW9uXG4gICAgcG9zdERlc3Ryb3koKSB7XG4gICAgICAgIHRoaXMuc2NvcGUgPSBudWxsO1xuICAgICAgICB0aGlzLmNhbnZhcyA9IG51bGw7XG4gICAgfVxuXG4gICAgLy8gZG9uJ3Qgc3RyaW5naWZ5IEdyYXBoaWNzRGV2aWNlIHRvIEpTT04gYnkgSlNPTi5zdHJpbmdpZnlcbiAgICB0b0pTT04oa2V5KSB7XG4gICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuXG4gICAgaW5pdGlhbGl6ZUNvbnRleHRDYWNoZXMoKSB7XG4gICAgICAgIHRoaXMuaW5kZXhCdWZmZXIgPSBudWxsO1xuICAgICAgICB0aGlzLnZlcnRleEJ1ZmZlcnMgPSBbXTtcbiAgICAgICAgdGhpcy5zaGFkZXIgPSBudWxsO1xuICAgICAgICB0aGlzLnJlbmRlclRhcmdldCA9IG51bGw7XG4gICAgfVxuXG4gICAgaW5pdGlhbGl6ZVJlbmRlclN0YXRlKCkge1xuXG4gICAgICAgIHRoaXMuYmxlbmRTdGF0ZSA9IG5ldyBCbGVuZFN0YXRlKCk7XG4gICAgICAgIHRoaXMuZGVwdGhTdGF0ZSA9IG5ldyBEZXB0aFN0YXRlKCk7XG4gICAgICAgIHRoaXMuY3VsbE1vZGUgPSBDVUxMRkFDRV9CQUNLO1xuXG4gICAgICAgIC8vIENhY2hlZCB2aWV3cG9ydCBhbmQgc2Npc3NvciBkaW1lbnNpb25zXG4gICAgICAgIHRoaXMudnggPSB0aGlzLnZ5ID0gdGhpcy52dyA9IHRoaXMudmggPSAwO1xuICAgICAgICB0aGlzLnN4ID0gdGhpcy5zeSA9IHRoaXMuc3cgPSB0aGlzLnNoID0gMDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHRoZSBzcGVjaWZpZWQgc3RlbmNpbCBzdGF0ZS4gSWYgYm90aCBzdGVuY2lsRnJvbnQgYW5kIHN0ZW5jaWxCYWNrIGFyZSBudWxsLCBzdGVuY2lsXG4gICAgICogb3BlcmF0aW9uIGlzIGRpc2FibGVkLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtTdGVuY2lsUGFyYW1ldGVyc30gW3N0ZW5jaWxGcm9udF0gLSBUaGUgZnJvbnQgc3RlbmNpbCBwYXJhbWV0ZXJzLiBEZWZhdWx0cyB0b1xuICAgICAqIHtAbGluayBTdGVuY2lsUGFyYW1ldGVycy5ERUZBVUxUfSBpZiBub3Qgc3BlY2lmaWVkLlxuICAgICAqIEBwYXJhbSB7U3RlbmNpbFBhcmFtZXRlcnN9IFtzdGVuY2lsQmFja10gLSBUaGUgYmFjayBzdGVuY2lsIHBhcmFtZXRlcnMuIERlZmF1bHRzIHRvXG4gICAgICoge0BsaW5rIFN0ZW5jaWxQYXJhbWV0ZXJzLkRFRkFVTFR9IGlmIG5vdCBzcGVjaWZpZWQuXG4gICAgICovXG4gICAgc2V0U3RlbmNpbFN0YXRlKHN0ZW5jaWxGcm9udCwgc3RlbmNpbEJhY2spIHtcbiAgICAgICAgRGVidWcuYXNzZXJ0KGZhbHNlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHRoZSBzcGVjaWZpZWQgYmxlbmQgc3RhdGUuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge0JsZW5kU3RhdGV9IGJsZW5kU3RhdGUgLSBOZXcgYmxlbmQgc3RhdGUuXG4gICAgICovXG4gICAgc2V0QmxlbmRTdGF0ZShibGVuZFN0YXRlKSB7XG4gICAgICAgIERlYnVnLmFzc2VydChmYWxzZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyB0aGUgc3BlY2lmaWVkIGRlcHRoIHN0YXRlLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtEZXB0aFN0YXRlfSBkZXB0aFN0YXRlIC0gTmV3IGRlcHRoIHN0YXRlLlxuICAgICAqL1xuICAgIHNldERlcHRoU3RhdGUoZGVwdGhTdGF0ZSkge1xuICAgICAgICBEZWJ1Zy5hc3NlcnQoZmFsc2UpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENvbnRyb2xzIGhvdyB0cmlhbmdsZXMgYXJlIGN1bGxlZCBiYXNlZCBvbiB0aGVpciBmYWNlIGRpcmVjdGlvbi4gVGhlIGRlZmF1bHQgY3VsbCBtb2RlIGlzXG4gICAgICoge0BsaW5rIENVTExGQUNFX0JBQ0t9LlxuICAgICAqXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGN1bGxNb2RlIC0gVGhlIGN1bGwgbW9kZSB0byBzZXQuIENhbiBiZTpcbiAgICAgKlxuICAgICAqIC0ge0BsaW5rIENVTExGQUNFX05PTkV9XG4gICAgICogLSB7QGxpbmsgQ1VMTEZBQ0VfQkFDS31cbiAgICAgKiAtIHtAbGluayBDVUxMRkFDRV9GUk9OVH1cbiAgICAgKi9cbiAgICBzZXRDdWxsTW9kZShjdWxsTW9kZSkge1xuICAgICAgICBEZWJ1Zy5hc3NlcnQoZmFsc2UpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIHNwZWNpZmllZCByZW5kZXIgdGFyZ2V0IG9uIHRoZSBkZXZpY2UuIElmIG51bGwgaXMgcGFzc2VkIGFzIGEgcGFyYW1ldGVyLCB0aGUgYmFja1xuICAgICAqIGJ1ZmZlciBiZWNvbWVzIHRoZSBjdXJyZW50IHRhcmdldCBmb3IgYWxsIHJlbmRlcmluZyBvcGVyYXRpb25zLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4vcmVuZGVyLXRhcmdldC5qcycpLlJlbmRlclRhcmdldHxudWxsfSByZW5kZXJUYXJnZXQgLSBUaGUgcmVuZGVyIHRhcmdldCB0b1xuICAgICAqIGFjdGl2YXRlLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogLy8gU2V0IGEgcmVuZGVyIHRhcmdldCB0byByZWNlaXZlIGFsbCByZW5kZXJpbmcgb3V0cHV0XG4gICAgICogZGV2aWNlLnNldFJlbmRlclRhcmdldChyZW5kZXJUYXJnZXQpO1xuICAgICAqXG4gICAgICogLy8gU2V0IHRoZSBiYWNrIGJ1ZmZlciB0byByZWNlaXZlIGFsbCByZW5kZXJpbmcgb3V0cHV0XG4gICAgICogZGV2aWNlLnNldFJlbmRlclRhcmdldChudWxsKTtcbiAgICAgKi9cbiAgICBzZXRSZW5kZXJUYXJnZXQocmVuZGVyVGFyZ2V0KSB7XG4gICAgICAgIHRoaXMucmVuZGVyVGFyZ2V0ID0gcmVuZGVyVGFyZ2V0O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIGN1cnJlbnQgaW5kZXggYnVmZmVyIG9uIHRoZSBncmFwaGljcyBkZXZpY2UuIE9uIHN1YnNlcXVlbnQgY2FsbHMgdG9cbiAgICAgKiB7QGxpbmsgR3JhcGhpY3NEZXZpY2UjZHJhd30sIHRoZSBzcGVjaWZpZWQgaW5kZXggYnVmZmVyIHdpbGwgYmUgdXNlZCB0byBwcm92aWRlIGluZGV4IGRhdGFcbiAgICAgKiBmb3IgYW55IGluZGV4ZWQgcHJpbWl0aXZlcy5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuL2luZGV4LWJ1ZmZlci5qcycpLkluZGV4QnVmZmVyfSBpbmRleEJ1ZmZlciAtIFRoZSBpbmRleCBidWZmZXIgdG8gYXNzaWduIHRvXG4gICAgICogdGhlIGRldmljZS5cbiAgICAgKi9cbiAgICBzZXRJbmRleEJ1ZmZlcihpbmRleEJ1ZmZlcikge1xuICAgICAgICAvLyBTdG9yZSB0aGUgaW5kZXggYnVmZmVyXG4gICAgICAgIHRoaXMuaW5kZXhCdWZmZXIgPSBpbmRleEJ1ZmZlcjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHRoZSBjdXJyZW50IHZlcnRleCBidWZmZXIgb24gdGhlIGdyYXBoaWNzIGRldmljZS4gT24gc3Vic2VxdWVudCBjYWxscyB0b1xuICAgICAqIHtAbGluayBHcmFwaGljc0RldmljZSNkcmF3fSwgdGhlIHNwZWNpZmllZCB2ZXJ0ZXggYnVmZmVyKHMpIHdpbGwgYmUgdXNlZCB0byBwcm92aWRlIHZlcnRleFxuICAgICAqIGRhdGEgZm9yIGFueSBwcmltaXRpdmVzLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4vdmVydGV4LWJ1ZmZlci5qcycpLlZlcnRleEJ1ZmZlcn0gdmVydGV4QnVmZmVyIC0gVGhlIHZlcnRleCBidWZmZXIgdG9cbiAgICAgKiBhc3NpZ24gdG8gdGhlIGRldmljZS5cbiAgICAgKi9cbiAgICBzZXRWZXJ0ZXhCdWZmZXIodmVydGV4QnVmZmVyKSB7XG5cbiAgICAgICAgaWYgKHZlcnRleEJ1ZmZlcikge1xuICAgICAgICAgICAgdGhpcy52ZXJ0ZXhCdWZmZXJzLnB1c2godmVydGV4QnVmZmVyKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFF1ZXJpZXMgdGhlIGN1cnJlbnRseSBzZXQgcmVuZGVyIHRhcmdldCBvbiB0aGUgZGV2aWNlLlxuICAgICAqXG4gICAgICogQHJldHVybnMge2ltcG9ydCgnLi9yZW5kZXItdGFyZ2V0LmpzJykuUmVuZGVyVGFyZ2V0fSBUaGUgY3VycmVudCByZW5kZXIgdGFyZ2V0LlxuICAgICAqIEBleGFtcGxlXG4gICAgICogLy8gR2V0IHRoZSBjdXJyZW50IHJlbmRlciB0YXJnZXRcbiAgICAgKiBjb25zdCByZW5kZXJUYXJnZXQgPSBkZXZpY2UuZ2V0UmVuZGVyVGFyZ2V0KCk7XG4gICAgICovXG4gICAgZ2V0UmVuZGVyVGFyZ2V0KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5yZW5kZXJUYXJnZXQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSW5pdGlhbGl6ZSByZW5kZXIgdGFyZ2V0IGJlZm9yZSBpdCBjYW4gYmUgdXNlZC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuL3JlbmRlci10YXJnZXQuanMnKS5SZW5kZXJUYXJnZXR9IHRhcmdldCAtIFRoZSByZW5kZXIgdGFyZ2V0IHRvIGJlXG4gICAgICogaW5pdGlhbGl6ZWQuXG4gICAgICogQGlnbm9yZVxuICAgICAqL1xuICAgIGluaXRSZW5kZXJUYXJnZXQodGFyZ2V0KSB7XG5cbiAgICAgICAgaWYgKHRhcmdldC5pbml0aWFsaXplZCkgcmV0dXJuO1xuXG4gICAgICAgIC8vICNpZiBfUFJPRklMRVJcbiAgICAgICAgY29uc3Qgc3RhcnRUaW1lID0gbm93KCk7XG4gICAgICAgIHRoaXMuZmlyZSgnZmJvOmNyZWF0ZScsIHtcbiAgICAgICAgICAgIHRpbWVzdGFtcDogc3RhcnRUaW1lLFxuICAgICAgICAgICAgdGFyZ2V0OiB0aGlzXG4gICAgICAgIH0pO1xuICAgICAgICAvLyAjZW5kaWZcblxuICAgICAgICB0YXJnZXQuaW5pdCgpO1xuICAgICAgICB0aGlzLnRhcmdldHMuYWRkKHRhcmdldCk7XG5cbiAgICAgICAgLy8gI2lmIF9QUk9GSUxFUlxuICAgICAgICB0aGlzLl9yZW5kZXJUYXJnZXRDcmVhdGlvblRpbWUgKz0gbm93KCkgLSBzdGFydFRpbWU7XG4gICAgICAgIC8vICNlbmRpZlxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJlcG9ydHMgd2hldGhlciBhIHRleHR1cmUgc291cmNlIGlzIGEgY2FudmFzLCBpbWFnZSwgdmlkZW8gb3IgSW1hZ2VCaXRtYXAuXG4gICAgICpcbiAgICAgKiBAcGFyYW0geyp9IHRleHR1cmUgLSBUZXh0dXJlIHNvdXJjZSBkYXRhLlxuICAgICAqIEByZXR1cm5zIHtib29sZWFufSBUcnVlIGlmIHRoZSB0ZXh0dXJlIGlzIGEgY2FudmFzLCBpbWFnZSwgdmlkZW8gb3IgSW1hZ2VCaXRtYXAgYW5kIGZhbHNlXG4gICAgICogb3RoZXJ3aXNlLlxuICAgICAqIEBpZ25vcmVcbiAgICAgKi9cbiAgICBfaXNCcm93c2VySW50ZXJmYWNlKHRleHR1cmUpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2lzSW1hZ2VCcm93c2VySW50ZXJmYWNlKHRleHR1cmUpIHx8XG4gICAgICAgICAgICAgICAgdGhpcy5faXNJbWFnZUNhbnZhc0ludGVyZmFjZSh0ZXh0dXJlKSB8fFxuICAgICAgICAgICAgICAgIHRoaXMuX2lzSW1hZ2VWaWRlb0ludGVyZmFjZSh0ZXh0dXJlKTtcbiAgICB9XG5cbiAgICBfaXNJbWFnZUJyb3dzZXJJbnRlcmZhY2UodGV4dHVyZSkge1xuICAgICAgICByZXR1cm4gKHR5cGVvZiBJbWFnZUJpdG1hcCAhPT0gJ3VuZGVmaW5lZCcgJiYgdGV4dHVyZSBpbnN0YW5jZW9mIEltYWdlQml0bWFwKSB8fFxuICAgICAgICAgICAgICAgKHR5cGVvZiBIVE1MSW1hZ2VFbGVtZW50ICE9PSAndW5kZWZpbmVkJyAmJiB0ZXh0dXJlIGluc3RhbmNlb2YgSFRNTEltYWdlRWxlbWVudCk7XG4gICAgfVxuXG4gICAgX2lzSW1hZ2VDYW52YXNJbnRlcmZhY2UodGV4dHVyZSkge1xuICAgICAgICByZXR1cm4gKHR5cGVvZiBIVE1MQ2FudmFzRWxlbWVudCAhPT0gJ3VuZGVmaW5lZCcgJiYgdGV4dHVyZSBpbnN0YW5jZW9mIEhUTUxDYW52YXNFbGVtZW50KTtcbiAgICB9XG5cbiAgICBfaXNJbWFnZVZpZGVvSW50ZXJmYWNlKHRleHR1cmUpIHtcbiAgICAgICAgcmV0dXJuICh0eXBlb2YgSFRNTFZpZGVvRWxlbWVudCAhPT0gJ3VuZGVmaW5lZCcgJiYgdGV4dHVyZSBpbnN0YW5jZW9mIEhUTUxWaWRlb0VsZW1lbnQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIHdpZHRoIGFuZCBoZWlnaHQgb2YgdGhlIGNhbnZhcywgdGhlbiBmaXJlcyB0aGUgYHJlc2l6ZWNhbnZhc2AgZXZlbnQuIE5vdGUgdGhhdCB0aGVcbiAgICAgKiBzcGVjaWZpZWQgd2lkdGggYW5kIGhlaWdodCB2YWx1ZXMgd2lsbCBiZSBtdWx0aXBsaWVkIGJ5IHRoZSB2YWx1ZSBvZlxuICAgICAqIHtAbGluayBHcmFwaGljc0RldmljZSNtYXhQaXhlbFJhdGlvfSB0byBnaXZlIHRoZSBmaW5hbCByZXN1bHRhbnQgd2lkdGggYW5kIGhlaWdodCBmb3IgdGhlXG4gICAgICogY2FudmFzLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHdpZHRoIC0gVGhlIG5ldyB3aWR0aCBvZiB0aGUgY2FudmFzLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBoZWlnaHQgLSBUaGUgbmV3IGhlaWdodCBvZiB0aGUgY2FudmFzLlxuICAgICAqIEBpZ25vcmVcbiAgICAgKi9cbiAgICByZXNpemVDYW52YXMod2lkdGgsIGhlaWdodCkge1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIHdpZHRoIGFuZCBoZWlnaHQgb2YgdGhlIGNhbnZhcywgdGhlbiBmaXJlcyB0aGUgYHJlc2l6ZWNhbnZhc2AgZXZlbnQuIE5vdGUgdGhhdCB0aGVcbiAgICAgKiB2YWx1ZSBvZiB7QGxpbmsgR3JhcGhpY3NEZXZpY2UjbWF4UGl4ZWxSYXRpb30gaXMgaWdub3JlZC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSB3aWR0aCAtIFRoZSBuZXcgd2lkdGggb2YgdGhlIGNhbnZhcy5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gaGVpZ2h0IC0gVGhlIG5ldyBoZWlnaHQgb2YgdGhlIGNhbnZhcy5cbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgc2V0UmVzb2x1dGlvbih3aWR0aCwgaGVpZ2h0KSB7XG4gICAgICAgIHRoaXMuX3dpZHRoID0gd2lkdGg7XG4gICAgICAgIHRoaXMuX2hlaWdodCA9IGhlaWdodDtcbiAgICAgICAgdGhpcy5jYW52YXMud2lkdGggPSB3aWR0aDtcbiAgICAgICAgdGhpcy5jYW52YXMuaGVpZ2h0ID0gaGVpZ2h0O1xuICAgICAgICB0aGlzLmZpcmUoR3JhcGhpY3NEZXZpY2UuRVZFTlRfUkVTSVpFLCB3aWR0aCwgaGVpZ2h0KTtcbiAgICB9XG5cbiAgICB1cGRhdGVDbGllbnRSZWN0KCkge1xuICAgICAgICB0aGlzLmNsaWVudFJlY3QgPSB0aGlzLmNhbnZhcy5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBXaWR0aCBvZiB0aGUgYmFjayBidWZmZXIgaW4gcGl4ZWxzLlxuICAgICAqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKi9cbiAgICBnZXQgd2lkdGgoKSB7XG4gICAgICAgIERlYnVnLmVycm9yKFwiR3JhcGhpY3NEZXZpY2Uud2lkdGggaXMgbm90IGltcGxlbWVudGVkIG9uIGN1cnJlbnQgZGV2aWNlLlwiKTtcbiAgICAgICAgcmV0dXJuIHRoaXMuY2FudmFzLndpZHRoO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEhlaWdodCBvZiB0aGUgYmFjayBidWZmZXIgaW4gcGl4ZWxzLlxuICAgICAqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKi9cbiAgICBnZXQgaGVpZ2h0KCkge1xuICAgICAgICBEZWJ1Zy5lcnJvcihcIkdyYXBoaWNzRGV2aWNlLmhlaWdodCBpcyBub3QgaW1wbGVtZW50ZWQgb24gY3VycmVudCBkZXZpY2UuXCIpO1xuICAgICAgICByZXR1cm4gdGhpcy5jYW52YXMuaGVpZ2h0O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEZ1bGxzY3JlZW4gbW9kZS5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAqL1xuICAgIHNldCBmdWxsc2NyZWVuKGZ1bGxzY3JlZW4pIHtcbiAgICAgICAgRGVidWcuZXJyb3IoXCJHcmFwaGljc0RldmljZS5mdWxsc2NyZWVuIGlzIG5vdCBpbXBsZW1lbnRlZCBvbiBjdXJyZW50IGRldmljZS5cIik7XG4gICAgfVxuXG4gICAgZ2V0IGZ1bGxzY3JlZW4oKSB7XG4gICAgICAgIERlYnVnLmVycm9yKFwiR3JhcGhpY3NEZXZpY2UuZnVsbHNjcmVlbiBpcyBub3QgaW1wbGVtZW50ZWQgb24gY3VycmVudCBkZXZpY2UuXCIpO1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTWF4aW11bSBwaXhlbCByYXRpby5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtudW1iZXJ9XG4gICAgICovXG4gICAgc2V0IG1heFBpeGVsUmF0aW8ocmF0aW8pIHtcbiAgICAgICAgaWYgKHRoaXMuX21heFBpeGVsUmF0aW8gIT09IHJhdGlvKSB7XG4gICAgICAgICAgICB0aGlzLl9tYXhQaXhlbFJhdGlvID0gcmF0aW87XG4gICAgICAgICAgICB0aGlzLnJlc2l6ZUNhbnZhcyh0aGlzLl93aWR0aCwgdGhpcy5faGVpZ2h0KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGdldCBtYXhQaXhlbFJhdGlvKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fbWF4UGl4ZWxSYXRpbztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUaGUgdHlwZSBvZiB0aGUgZGV2aWNlLiBDYW4gYmUgb25lIG9mIHBjLkRFVklDRVRZUEVfV0VCR0wxLCBwYy5ERVZJQ0VUWVBFX1dFQkdMMiBvciBwYy5ERVZJQ0VUWVBFX1dFQkdQVS5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtpbXBvcnQoJy4vY29uc3RhbnRzLmpzJykuREVWSUNFVFlQRV9XRUJHTDEgfCBpbXBvcnQoJy4vY29uc3RhbnRzLmpzJykuREVWSUNFVFlQRV9XRUJHTDIgfCBpbXBvcnQoJy4vY29uc3RhbnRzLmpzJykuREVWSUNFVFlQRV9XRUJHUFV9XG4gICAgICovXG4gICAgZ2V0IGRldmljZVR5cGUoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9kZXZpY2VUeXBlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFF1ZXJpZXMgdGhlIG1heGltdW0gbnVtYmVyIG9mIGJvbmVzIHRoYXQgY2FuIGJlIHJlZmVyZW5jZWQgYnkgYSBzaGFkZXIuIFRoZSBzaGFkZXJcbiAgICAgKiBnZW5lcmF0b3JzIChwcm9ncmFtbGliKSB1c2UgdGhpcyBudW1iZXIgdG8gc3BlY2lmeSB0aGUgbWF0cml4IGFycmF5IHNpemUgb2YgdGhlIHVuaWZvcm1cbiAgICAgKiAnbWF0cml4X3Bvc2VbMF0nLiBUaGUgdmFsdWUgaXMgY2FsY3VsYXRlZCBiYXNlZCBvbiB0aGUgbnVtYmVyIG9mIGF2YWlsYWJsZSB1bmlmb3JtIHZlY3RvcnNcbiAgICAgKiBhdmFpbGFibGUgYWZ0ZXIgc3VidHJhY3RpbmcgdGhlIG51bWJlciB0YWtlbiBieSBhIHR5cGljYWwgaGVhdnl3ZWlnaHQgc2hhZGVyLiBJZiBhIGRpZmZlcmVudFxuICAgICAqIG51bWJlciBpcyByZXF1aXJlZCwgaXQgY2FuIGJlIHR1bmVkIHZpYSB7QGxpbmsgR3JhcGhpY3NEZXZpY2Ujc2V0Qm9uZUxpbWl0fS5cbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtudW1iZXJ9IFRoZSBtYXhpbXVtIG51bWJlciBvZiBib25lcyB0aGF0IGNhbiBiZSBzdXBwb3J0ZWQgYnkgdGhlIGhvc3QgaGFyZHdhcmUuXG4gICAgICogQGlnbm9yZVxuICAgICAqL1xuICAgIGdldEJvbmVMaW1pdCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuYm9uZUxpbWl0O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNwZWNpZmllcyB0aGUgbWF4aW11bSBudW1iZXIgb2YgYm9uZXMgdGhhdCB0aGUgZGV2aWNlIGNhbiBzdXBwb3J0IG9uIHRoZSBjdXJyZW50IGhhcmR3YXJlLlxuICAgICAqIFRoaXMgZnVuY3Rpb24gYWxsb3dzIHRoZSBkZWZhdWx0IGNhbGN1bGF0ZWQgdmFsdWUgYmFzZWQgb24gYXZhaWxhYmxlIHZlY3RvciB1bmlmb3JtcyB0byBiZVxuICAgICAqIG92ZXJyaWRkZW4uXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gbWF4Qm9uZXMgLSBUaGUgbWF4aW11bSBudW1iZXIgb2YgYm9uZXMgc3VwcG9ydGVkIGJ5IHRoZSBob3N0IGhhcmR3YXJlLlxuICAgICAqIEBpZ25vcmVcbiAgICAgKi9cbiAgICBzZXRCb25lTGltaXQobWF4Qm9uZXMpIHtcbiAgICAgICAgdGhpcy5ib25lTGltaXQgPSBtYXhCb25lcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBGdW5jdGlvbiB3aGljaCBleGVjdXRlcyBhdCB0aGUgc3RhcnQgb2YgdGhlIGZyYW1lLiBUaGlzIHNob3VsZCBub3QgYmUgY2FsbGVkIG1hbnVhbGx5LCBhc1xuICAgICAqIGl0IGlzIGhhbmRsZWQgYnkgdGhlIEFwcEJhc2UgaW5zdGFuY2UuXG4gICAgICpcbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgZnJhbWVTdGFydCgpIHtcbiAgICAgICAgdGhpcy5yZW5kZXJQYXNzSW5kZXggPSAwO1xuICAgICAgICB0aGlzLnJlbmRlclZlcnNpb24rKztcblxuICAgICAgICBEZWJ1Zy5jYWxsKCgpID0+IHtcblxuICAgICAgICAgICAgLy8gbG9nIG91dCBhbGwgbG9hZGVkIHRleHR1cmVzLCBzb3J0ZWQgYnkgZ3B1IG1lbW9yeSBzaXplXG4gICAgICAgICAgICBpZiAoVHJhY2luZy5nZXQoVFJBQ0VJRF9URVhUVVJFUykpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB0ZXh0dXJlcyA9IHRoaXMudGV4dHVyZXMuc2xpY2UoKTtcbiAgICAgICAgICAgICAgICB0ZXh0dXJlcy5zb3J0KChhLCBiKSA9PiBiLmdwdVNpemUgLSBhLmdwdVNpemUpO1xuICAgICAgICAgICAgICAgIERlYnVnLmxvZyhgVGV4dHVyZXM6ICR7dGV4dHVyZXMubGVuZ3RofWApO1xuICAgICAgICAgICAgICAgIGxldCB0ZXh0dXJlVG90YWwgPSAwO1xuICAgICAgICAgICAgICAgIHRleHR1cmVzLmZvckVhY2goKHRleHR1cmUsIGluZGV4KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRleHR1cmVTaXplICA9IHRleHR1cmUuZ3B1U2l6ZTtcbiAgICAgICAgICAgICAgICAgICAgdGV4dHVyZVRvdGFsICs9IHRleHR1cmVTaXplO1xuICAgICAgICAgICAgICAgICAgICBEZWJ1Zy5sb2coYCR7aW5kZXh9LiAke3RleHR1cmUubmFtZX0gJHt0ZXh0dXJlLndpZHRofXgke3RleHR1cmUuaGVpZ2h0fSBWUkFNOiAkeyh0ZXh0dXJlU2l6ZSAvIDEwMjQgLyAxMDI0KS50b0ZpeGVkKDIpfSBNQmApO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIERlYnVnLmxvZyhgVG90YWw6ICR7KHRleHR1cmVUb3RhbCAvIDEwMjQgLyAxMDI0KS50b0ZpeGVkKDIpfU1CYCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEZ1bmN0aW9uIHdoaWNoIGV4ZWN1dGVzIGF0IHRoZSBlbmQgb2YgdGhlIGZyYW1lLiBUaGlzIHNob3VsZCBub3QgYmUgY2FsbGVkIG1hbnVhbGx5LCBhcyBpdCBpc1xuICAgICAqIGhhbmRsZWQgYnkgdGhlIEFwcEJhc2UgaW5zdGFuY2UuXG4gICAgICpcbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgZnJhbWVFbmQoKSB7XG4gICAgfVxufVxuXG5leHBvcnQgeyBHcmFwaGljc0RldmljZSB9O1xuIl0sIm5hbWVzIjpbIkdyYXBoaWNzRGV2aWNlIiwiRXZlbnRIYW5kbGVyIiwiY29uc3RydWN0b3IiLCJjYW52YXMiLCJvcHRpb25zIiwiX3RoaXMkaW5pdE9wdGlvbnMiLCJfdGhpcyRpbml0T3B0aW9ucyRkZXAiLCJfdGhpcyRpbml0T3B0aW9uczIiLCJfdGhpcyRpbml0T3B0aW9uczIkc3QiLCJfdGhpcyRpbml0T3B0aW9uczMiLCJfdGhpcyRpbml0T3B0aW9uczMkYW4iLCJfdGhpcyRpbml0T3B0aW9uczQiLCJfdGhpcyRpbml0T3B0aW9uczQkcG8iLCJiYWNrQnVmZmVyIiwiYmFja0J1ZmZlclNpemUiLCJWZWMyIiwiYmFja0J1ZmZlckZvcm1hdCIsImlzV2ViR1BVIiwic2NvcGUiLCJib25lTGltaXQiLCJtYXhBbmlzb3Ryb3B5IiwibWF4Q3ViZU1hcFNpemUiLCJtYXhUZXh0dXJlU2l6ZSIsIm1heFZvbHVtZVNpemUiLCJtYXhDb2xvckF0dGFjaG1lbnRzIiwicHJlY2lzaW9uIiwic2FtcGxlcyIsInN1cHBvcnRzU3RlbmNpbCIsInN1cHBvcnRzTXJ0Iiwic3VwcG9ydHNWb2x1bWVUZXh0dXJlcyIsInJlbmRlclRhcmdldCIsInNoYWRlcnMiLCJ0ZXh0dXJlcyIsInRhcmdldHMiLCJTZXQiLCJyZW5kZXJWZXJzaW9uIiwicmVuZGVyUGFzc0luZGV4IiwiaW5zaWRlUmVuZGVyUGFzcyIsInN1cHBvcnRzSW5zdGFuY2luZyIsInN1cHBvcnRzVW5pZm9ybUJ1ZmZlcnMiLCJ0ZXh0dXJlRmxvYXRSZW5kZXJhYmxlIiwidGV4dHVyZUhhbGZGbG9hdFJlbmRlcmFibGUiLCJxdWFkVmVydGV4QnVmZmVyIiwiYmxlbmRTdGF0ZSIsIkJsZW5kU3RhdGUiLCJkZXB0aFN0YXRlIiwiRGVwdGhTdGF0ZSIsInN0ZW5jaWxFbmFibGVkIiwic3RlbmNpbEZyb250IiwiU3RlbmNpbFBhcmFtZXRlcnMiLCJzdGVuY2lsQmFjayIsImR5bmFtaWNCdWZmZXJzIiwiZ3B1UHJvZmlsZXIiLCJkZWZhdWx0Q2xlYXJPcHRpb25zIiwiY29sb3IiLCJkZXB0aCIsInN0ZW5jaWwiLCJmbGFncyIsIkNMRUFSRkxBR19DT0xPUiIsIkNMRUFSRkxBR19ERVBUSCIsImluaXRPcHRpb25zIiwiX2V4dGVuZHMiLCJhbnRpYWxpYXMiLCJwb3dlclByZWZlcmVuY2UiLCJfd2lkdGgiLCJfaGVpZ2h0IiwiX21heFBpeGVsUmF0aW8iLCJwbGF0Zm9ybSIsImJyb3dzZXIiLCJNYXRoIiwibWluIiwid2luZG93IiwiZGV2aWNlUGl4ZWxSYXRpbyIsImJ1ZmZlcnMiLCJfdnJhbSIsInRleFNoYWRvdyIsInRleEFzc2V0IiwidGV4TGlnaHRtYXAiLCJ0ZXgiLCJ2YiIsImliIiwidWIiLCJfc2hhZGVyU3RhdHMiLCJ2c0NvbXBpbGVkIiwiZnNDb21waWxlZCIsImxpbmtlZCIsIm1hdGVyaWFsU2hhZGVycyIsImNvbXBpbGVUaW1lIiwiaW5pdGlhbGl6ZUNvbnRleHRDYWNoZXMiLCJfZHJhd0NhbGxzUGVyRnJhbWUiLCJfc2hhZGVyU3dpdGNoZXNQZXJGcmFtZSIsIl9wcmltc1BlckZyYW1lIiwiaSIsIlBSSU1JVElWRV9QT0lOVFMiLCJQUklNSVRJVkVfVFJJRkFOIiwiX3JlbmRlclRhcmdldENyZWF0aW9uVGltZSIsIlNjb3BlU3BhY2UiLCJ0ZXh0dXJlQmlhcyIsInJlc29sdmUiLCJzZXRWYWx1ZSIsInBvc3RJbml0IiwidmVydGV4Rm9ybWF0IiwiVmVydGV4Rm9ybWF0Iiwic2VtYW50aWMiLCJTRU1BTlRJQ19QT1NJVElPTiIsImNvbXBvbmVudHMiLCJ0eXBlIiwiVFlQRV9GTE9BVDMyIiwicG9zaXRpb25zIiwiRmxvYXQzMkFycmF5IiwiVmVydGV4QnVmZmVyIiwiQlVGRkVSX1NUQVRJQyIsImRlc3Ryb3kiLCJfdGhpcyRxdWFkVmVydGV4QnVmZmUiLCJfdGhpcyRkeW5hbWljQnVmZmVycyIsIl90aGlzJGdwdVByb2ZpbGVyIiwiZmlyZSIsIm9uRGVzdHJveVNoYWRlciIsInNoYWRlciIsImlkeCIsImluZGV4T2YiLCJzcGxpY2UiLCJwb3N0RGVzdHJveSIsInRvSlNPTiIsImtleSIsInVuZGVmaW5lZCIsImluZGV4QnVmZmVyIiwidmVydGV4QnVmZmVycyIsImluaXRpYWxpemVSZW5kZXJTdGF0ZSIsImN1bGxNb2RlIiwiQ1VMTEZBQ0VfQkFDSyIsInZ4IiwidnkiLCJ2dyIsInZoIiwic3giLCJzeSIsInN3Iiwic2giLCJzZXRTdGVuY2lsU3RhdGUiLCJEZWJ1ZyIsImFzc2VydCIsInNldEJsZW5kU3RhdGUiLCJzZXREZXB0aFN0YXRlIiwic2V0Q3VsbE1vZGUiLCJzZXRSZW5kZXJUYXJnZXQiLCJzZXRJbmRleEJ1ZmZlciIsInNldFZlcnRleEJ1ZmZlciIsInZlcnRleEJ1ZmZlciIsInB1c2giLCJnZXRSZW5kZXJUYXJnZXQiLCJpbml0UmVuZGVyVGFyZ2V0IiwidGFyZ2V0IiwiaW5pdGlhbGl6ZWQiLCJzdGFydFRpbWUiLCJub3ciLCJ0aW1lc3RhbXAiLCJpbml0IiwiYWRkIiwiX2lzQnJvd3NlckludGVyZmFjZSIsInRleHR1cmUiLCJfaXNJbWFnZUJyb3dzZXJJbnRlcmZhY2UiLCJfaXNJbWFnZUNhbnZhc0ludGVyZmFjZSIsIl9pc0ltYWdlVmlkZW9JbnRlcmZhY2UiLCJJbWFnZUJpdG1hcCIsIkhUTUxJbWFnZUVsZW1lbnQiLCJIVE1MQ2FudmFzRWxlbWVudCIsIkhUTUxWaWRlb0VsZW1lbnQiLCJyZXNpemVDYW52YXMiLCJ3aWR0aCIsImhlaWdodCIsInNldFJlc29sdXRpb24iLCJFVkVOVF9SRVNJWkUiLCJ1cGRhdGVDbGllbnRSZWN0IiwiY2xpZW50UmVjdCIsImdldEJvdW5kaW5nQ2xpZW50UmVjdCIsImVycm9yIiwiZnVsbHNjcmVlbiIsIm1heFBpeGVsUmF0aW8iLCJyYXRpbyIsImRldmljZVR5cGUiLCJfZGV2aWNlVHlwZSIsImdldEJvbmVMaW1pdCIsInNldEJvbmVMaW1pdCIsIm1heEJvbmVzIiwiZnJhbWVTdGFydCIsImNhbGwiLCJUcmFjaW5nIiwiZ2V0IiwiVFJBQ0VJRF9URVhUVVJFUyIsInNsaWNlIiwic29ydCIsImEiLCJiIiwiZ3B1U2l6ZSIsImxvZyIsImxlbmd0aCIsInRleHR1cmVUb3RhbCIsImZvckVhY2giLCJpbmRleCIsInRleHR1cmVTaXplIiwibmFtZSIsInRvRml4ZWQiLCJmcmFtZUVuZCJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7OztBQXFCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxNQUFNQSxjQUFjLFNBQVNDLFlBQVksQ0FBQztBQWlTdENDLEVBQUFBLFdBQVdBLENBQUNDLE1BQU0sRUFBRUMsT0FBTyxFQUFFO0FBQUEsSUFBQSxJQUFBQyxpQkFBQSxFQUFBQyxxQkFBQSxFQUFBQyxrQkFBQSxFQUFBQyxxQkFBQSxFQUFBQyxrQkFBQSxFQUFBQyxxQkFBQSxFQUFBQyxrQkFBQSxFQUFBQyxxQkFBQSxDQUFBO0FBQ3pCLElBQUEsS0FBSyxFQUFFLENBQUE7QUFqU1g7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBTEksSUFBQSxJQUFBLENBTUFULE1BQU0sR0FBQSxLQUFBLENBQUEsQ0FBQTtBQUVOO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtJQUxJLElBTUFVLENBQUFBLFVBQVUsR0FBRyxJQUFJLENBQUE7QUFFakI7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUpJLElBQUEsSUFBQSxDQUtBQyxjQUFjLEdBQUcsSUFBSUMsSUFBSSxFQUFFLENBQUE7QUFFM0I7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBTEksSUFBQSxJQUFBLENBTUFDLGdCQUFnQixHQUFBLEtBQUEsQ0FBQSxDQUFBO0FBRWhCO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtJQUxJLElBTUFDLENBQUFBLFFBQVEsR0FBRyxLQUFLLENBQUE7QUFFaEI7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBTEksSUFBQSxJQUFBLENBTUFDLEtBQUssR0FBQSxLQUFBLENBQUEsQ0FBQTtBQUVMO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUxJLElBQUEsSUFBQSxDQU1BQyxTQUFTLEdBQUEsS0FBQSxDQUFB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
