import { Debug } from '../../core/debug.js';
import { TRACEID_RENDER_TARGET_ALLOC } from '../../core/constants.js';
import { PIXELFORMAT_DEPTH, PIXELFORMAT_DEPTHSTENCIL } from './constants.js';
import { DebugGraphics } from './debug-graphics.js';
import { GraphicsDevice } from './graphics-device.js';

let id = 0;

/**
 * A render target is a rectangular rendering surface.
 *
 * @category Graphics
 */
class RenderTarget {
  /**
   * Creates a new RenderTarget instance. A color buffer or a depth buffer must be set.
   *
   * @param {object} [options] - Object for passing optional arguments.
   * @param {boolean} [options.autoResolve] - If samples > 1, enables or disables automatic MSAA
   * resolve after rendering to this RT (see {@link RenderTarget#resolve}). Defaults to true.
   * @param {import('./texture.js').Texture} [options.colorBuffer] - The texture that this render
   * target will treat as a rendering surface.
   * @param {import('./texture.js').Texture[]} [options.colorBuffers] - The textures that this
   * render target will treat as a rendering surfaces. If this option is set, the colorBuffer
   * option is ignored. This option can be used only when {@link GraphicsDevice#supportsMrt} is
   * true.
   * @param {boolean} [options.depth] - If set to true, depth buffer will be created. Defaults to
   * true. Ignored if depthBuffer is defined.
   * @param {import('./texture.js').Texture} [options.depthBuffer] - The texture that this render
   * target will treat as a depth/stencil surface (WebGL2 only). If set, the 'depth' and
   * 'stencil' properties are ignored. Texture must have {@link PIXELFORMAT_DEPTH} or
   * {@link PIXELFORMAT_DEPTHSTENCIL} format.
   * @param {number} [options.face] - If the colorBuffer parameter is a cubemap, use this option
   * to specify the face of the cubemap to render to. Can be:
   *
   * - {@link CUBEFACE_POSX}
   * - {@link CUBEFACE_NEGX}
   * - {@link CUBEFACE_POSY}
   * - {@link CUBEFACE_NEGY}
   * - {@link CUBEFACE_POSZ}
   * - {@link CUBEFACE_NEGZ}
   *
   * Defaults to {@link CUBEFACE_POSX}.
   * @param {boolean} [options.flipY] - When set to true the image will be flipped in Y. Default
   * is false.
   * @param {string} [options.name] - The name of the render target.
   * @param {number} [options.samples] - Number of hardware anti-aliasing samples (not supported
   * on WebGL1). Default is 1.
   * @param {boolean} [options.stencil] - If set to true, depth buffer will include stencil.
   * Defaults to false. Ignored if depthBuffer is defined or depth is false.
   * @example
   * // Create a 512x512x24-bit render target with a depth buffer
   * const colorBuffer = new pc.Texture(graphicsDevice, {
   *     width: 512,
   *     height: 512,
   *     format: pc.PIXELFORMAT_RGB8
   * });
   * const renderTarget = new pc.RenderTarget({
   *     colorBuffer: colorBuffer,
   *     depth: true
   * });
   *
   * // Set the render target on a camera component
   * camera.renderTarget = renderTarget;
   *
   * // Destroy render target at a later stage. Note that the color buffer needs
   * // to be destroyed separately.
   * renderTarget.colorBuffer.destroy();
   * renderTarget.destroy();
   * camera.renderTarget = null;
   */
  constructor(options = {}) {
    var _options$face, _this$_colorBuffer, _this$_depthBuffer, _this$_colorBuffers, _options$samples, _options$autoResolve, _options$flipY, _this$_colorBuffers2;
    /**
     * The name of the render target.
     *
     * @type {string}
     */
    this.name = void 0;
    /**
     * @type {import('./graphics-device.js').GraphicsDevice}
     * @private
     */
    this._device = void 0;
    /**
     * @type {import('./texture.js').Texture}
     * @private
     */
    this._colorBuffer = void 0;
    /**
     * @type {import('./texture.js').Texture[]}
     * @private
     */
    this._colorBuffers = void 0;
    /**
     * @type {import('./texture.js').Texture}
     * @private
     */
    this._depthBuffer = void 0;
    /**
     * @type {boolean}
     * @private
     */
    this._depth = void 0;
    /**
     * @type {boolean}
     * @private
     */
    this._stencil = void 0;
    /**
     * @type {number}
     * @private
     */
    this._samples = void 0;
    /** @type {boolean} */
    this.autoResolve = void 0;
    /**
     * @type {number}
     * @private
     */
    this._face = void 0;
    /** @type {boolean} */
    this.flipY = void 0;
    this.id = id++;
    const _arg2 = arguments[1];
    const _arg3 = arguments[2];
    if (options instanceof GraphicsDevice) {
      // old constructor
      this._colorBuffer = _arg2;
      options = _arg3;
      Debug.deprecated('pc.RenderTarget constructor no longer accepts GraphicsDevice parameter.');
    } else {
      // new constructor
      this._colorBuffer = options.colorBuffer;
    }

    // Use the single colorBuffer in the colorBuffers array. This allows us to always just use the array internally.
    if (this._colorBuffer) {
      this._colorBuffers = [this._colorBuffer];
    }

    // Process optional arguments
    this._depthBuffer = options.depthBuffer;
    this._face = (_options$face = options.face) != null ? _options$face : 0;
    if (this._depthBuffer) {
      const format = this._depthBuffer._format;
      if (format === PIXELFORMAT_DEPTH) {
        this._depth = true;
        this._stencil = false;
      } else if (format === PIXELFORMAT_DEPTHSTENCIL) {
        this._depth = true;
        this._stencil = true;
      } else {
        Debug.warn('Incorrect depthBuffer format. Must be pc.PIXELFORMAT_DEPTH or pc.PIXELFORMAT_DEPTHSTENCIL');
        this._depth = false;
        this._stencil = false;
      }
    } else {
      var _options$depth, _options$stencil;
      this._depth = (_options$depth = options.depth) != null ? _options$depth : true;
      this._stencil = (_options$stencil = options.stencil) != null ? _options$stencil : false;
    }

    // MRT
    if (options.colorBuffers) {
      Debug.assert(!this._colorBuffers, 'When constructing RenderTarget and options.colorBuffers is used, options.colorBuffer must not be used.');
      if (!this._colorBuffers) {
        this._colorBuffers = [...options.colorBuffers];

        // set the main color buffer to point to 0 index
        this._colorBuffer = options.colorBuffers[0];
      }
    }

    // device, from one of the buffers
    const device = ((_this$_colorBuffer = this._colorBuffer) == null ? void 0 : _this$_colorBuffer.device) || ((_this$_depthBuffer = this._depthBuffer) == null ? void 0 : _this$_depthBuffer.device) || options.graphicsDevice;
    Debug.assert(device, "Failed to obtain the device, colorBuffer nor depthBuffer store it.");
    this._device = device;
    Debug.call(() => {
      if (this._colorBuffers) {
        Debug.assert(this._colorBuffers.length <= 1 || device.supportsMrt, 'Multiple render targets are not supported on this device');
      }
    });

    // mark color buffer textures as render target
    (_this$_colorBuffers = this._colorBuffers) == null ? void 0 : _this$_colorBuffers.forEach(colorBuffer => {
      colorBuffer._isRenderTarget = true;
    });
    const {
      maxSamples
    } = this._device;
    this._samples = Math.min((_options$samples = options.samples) != null ? _options$samples : 1, maxSamples);

    // WebGPU only supports values of 1 or 4 for samples
    if (device.isWebGPU) {
      this._samples = this._samples > 1 ? maxSamples : 1;
    }
    this.autoResolve = (_options$autoResolve = options.autoResolve) != null ? _options$autoResolve : true;

    // use specified name, otherwise get one from color or depth buffer
    this.name = options.name;
    if (!this.name) {
      var _this$_colorBuffer2;
      this.name = (_this$_colorBuffer2 = this._colorBuffer) == null ? void 0 : _this$_colorBuffer2.name;
    }
    if (!this.name) {
      var _this$_depthBuffer2;
      this.name = (_this$_depthBuffer2 = this._depthBuffer) == null ? void 0 : _this$_depthBuffer2.name;
    }
    if (!this.name) {
      this.name = "Untitled";
    }

    // render image flipped in Y
    this.flipY = (_options$flipY = options.flipY) != null ? _options$flipY : false;
    this.validateMrt();

    // device specific implementation
    this.impl = device.createRenderTargetImpl(this);
    Debug.trace(TRACEID_RENDER_TARGET_ALLOC, `Alloc: Id ${this.id} ${this.name}: ${this.width}x${this.height} ` + `[samples: ${this.samples}]` + `${(_this$_colorBuffers2 = this._colorBuffers) != null && _this$_colorBuffers2.length ? `[MRT: ${this._colorBuffers.length}]` : ''}` + `${this.colorBuffer ? '[Color]' : ''}` + `${this.depth ? '[Depth]' : ''}` + `${this.stencil ? '[Stencil]' : ''}` + `[Face:${this.face}]`);
  }

  /**
   * Frees resources associated with this render target.
   */
  destroy() {
    Debug.trace(TRACEID_RENDER_TARGET_ALLOC, `DeAlloc: Id ${this.id} ${this.name}`);
    const device = this._device;
    if (device) {
      device.targets.delete(this);
      if (device.renderTarget === this) {
        device.setRenderTarget(null);
      }
      this.destroyFrameBuffers();
    }
  }

  /**
   * Free device resources associated with this render target.
   *
   * @ignore
   */
  destroyFrameBuffers() {
    const device = this._device;
    if (device) {
      this.impl.destroy(device);
    }
  }

  /**
   * Free textures associated with this render target.
   *
   * @ignore
   */
  destroyTextureBuffers() {
    var _this$_depthBuffer3, _this$_colorBuffers3;
    (_this$_depthBuffer3 = this._depthBuffer) == null ? void 0 : _this$_depthBuffer3.destroy();
    this._depthBuffer = null;
    (_this$_colorBuffers3 = this._colorBuffers) == null ? void 0 : _this$_colorBuffers3.forEach(colorBuffer => {
      colorBuffer.destroy();
    });
    this._colorBuffers = null;
    this._colorBuffer = null;
  }

  /**
   * Resizes the render target to the specified width and height. Internally this resizes all the
   * assigned texture color and depth buffers.
   *
   * @param {number} width - The width of the render target in pixels.
   * @param {number} height - The height of the render target in pixels.
   */
  resize(width, height) {
    var _this$_depthBuffer4, _this$_colorBuffers4;
    // release existing
    const device = this._device;
    this.destroyFrameBuffers();
    if (device.renderTarget === this) {
      device.setRenderTarget(null);
    }

    // resize textures
    (_this$_depthBuffer4 = this._depthBuffer) == null ? void 0 : _this$_depthBuffer4.resize(width, height);
    (_this$_colorBuffers4 = this._colorBuffers) == null ? void 0 : _this$_colorBuffers4.forEach(colorBuffer => {
      colorBuffer.resize(width, height);
    });

    // initialize again
    this.validateMrt();
    this.impl = device.createRenderTargetImpl(this);
  }
  validateMrt() {
    Debug.call(() => {
      if (this._colorBuffers) {
        const {
          width,
          height,
          cubemap,
          volume
        } = this._colorBuffers[0];
        for (let i = 1; i < this._colorBuffers.length; i++) {
          const colorBuffer = this._colorBuffers[i];
          Debug.assert(colorBuffer.width === width, 'All render target color buffers must have the same width', this);
          Debug.assert(colorBuffer.height === height, 'All render target color buffers must have the same height', this);
          Debug.assert(colorBuffer.cubemap === cubemap, 'All render target color buffers must have the same cubemap setting', this);
          Debug.assert(colorBuffer.volume === volume, 'All render target color buffers must have the same volume setting', this);
        }
      }
    });
  }

  /**
   * Initializes the resources associated with this render target.
   *
   * @ignore
   */
  init() {
    this.impl.init(this._device, this);
  }

  /** @ignore */
  get initialized() {
    return this.impl.initialized;
  }

  /**
   * Called when the device context was lost. It releases all context related resources.
   *
   * @ignore
   */
  loseContext() {
    this.impl.loseContext();
  }

  /**
   * If samples > 1, resolves the anti-aliased render target (WebGL2 only). When you're rendering
   * to an anti-aliased render target, pixels aren't written directly to the readable texture.
   * Instead, they're first written to a MSAA buffer, where each sample for each pixel is stored
   * independently. In order to read the results, you first need to 'resolve' the buffer - to
   * average all samples and create a simple texture with one color per pixel. This function
   * performs this averaging and updates the colorBuffer and the depthBuffer. If autoResolve is
   * set to true, the resolve will happen after every rendering to this render target, otherwise
   * you can do it manually, during the app update or inside a {@link Command}.
   *
   * @param {boolean} [color] - Resolve color buffer. Defaults to true.
   * @param {boolean} [depth] - Resolve depth buffer. Defaults to true if the render target has a
   * depth buffer.
   */
  resolve(color = true, depth = !!this._depthBuffer) {
    // TODO: consider adding support for MRT to this function.

    if (this._device && this._samples > 1) {
      DebugGraphics.pushGpuMarker(this._device, `RESOLVE-RT:${this.name}`);
      this.impl.resolve(this._device, this, color, depth);
      DebugGraphics.popGpuMarker(this._device);
    }
  }

  /**
   * Copies color and/or depth contents of source render target to this one. Formats, sizes and
   * anti-aliasing samples must match. Depth buffer can only be copied on WebGL 2.0.
   *
   * @param {RenderTarget} source - Source render target to copy from.
   * @param {boolean} [color] - If true will copy the color buffer. Defaults to false.
   * @param {boolean} [depth] - If true will copy the depth buffer. Defaults to false.
   * @returns {boolean} True if the copy was successful, false otherwise.
   */
  copy(source, color, depth) {
    // TODO: consider adding support for MRT to this function.

    if (!this._device) {
      if (source._device) {
        this._device = source._device;
      } else {
        Debug.error("Render targets are not initialized");
        return false;
      }
    }
    DebugGraphics.pushGpuMarker(this._device, `COPY-RT:${source.name}->${this.name}`);
    const success = this._device.copyRenderTarget(source, this, color, depth);
    DebugGraphics.popGpuMarker(this._device);
    return success;
  }

  /**
   * Number of antialiasing samples the render target uses.
   *
   * @type {number}
   */
  get samples() {
    return this._samples;
  }

  /**
   * True if the render target contains the depth attachment.
   *
   * @type {boolean}
   */
  get depth() {
    return this._depth;
  }

  /**
   * True if the render target contains the stencil attachment.
   *
   * @type {boolean}
   */
  get stencil() {
    return this._stencil;
  }

  /**
   * Color buffer set up on the render target.
   *
   * @type {import('./texture.js').Texture}
   */
  get colorBuffer() {
    return this._colorBuffer;
  }

  /**
   * Accessor for multiple render target color buffers.
   *
   * @param {*} index - Index of the color buffer to get.
   * @returns {import('./texture.js').Texture} - Color buffer at the specified index.
   */
  getColorBuffer(index) {
    var _this$_colorBuffers5;
    return (_this$_colorBuffers5 = this._colorBuffers) == null ? void 0 : _this$_colorBuffers5[index];
  }

  /**
   * Depth buffer set up on the render target. Only available, if depthBuffer was set in
   * constructor. Not available if depth property was used instead.
   *
   * @type {import('./texture.js').Texture}
   */
  get depthBuffer() {
    return this._depthBuffer;
  }

  /**
   * If the render target is bound to a cubemap, this property specifies which face of the
   * cubemap is rendered to. Can be:
   *
   * - {@link CUBEFACE_POSX}
   * - {@link CUBEFACE_NEGX}
   * - {@link CUBEFACE_POSY}
   * - {@link CUBEFACE_NEGY}
   * - {@link CUBEFACE_POSZ}
   * - {@link CUBEFACE_NEGZ}
   *
   * @type {number}
   */
  get face() {
    return this._face;
  }

  /**
   * Width of the render target in pixels.
   *
   * @type {number}
   */
  get width() {
    var _this$_colorBuffer3, _this$_depthBuffer5;
    return ((_this$_colorBuffer3 = this._colorBuffer) == null ? void 0 : _this$_colorBuffer3.width) || ((_this$_depthBuffer5 = this._depthBuffer) == null ? void 0 : _this$_depthBuffer5.width) || this._device.width;
  }

  /**
   * Height of the render target in pixels.
   *
   * @type {number}
   */
  get height() {
    var _this$_colorBuffer4, _this$_depthBuffer6;
    return ((_this$_colorBuffer4 = this._colorBuffer) == null ? void 0 : _this$_colorBuffer4.height) || ((_this$_depthBuffer6 = this._depthBuffer) == null ? void 0 : _this$_depthBuffer6.height) || this._device.height;
  }
}

export { RenderTarget };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVuZGVyLXRhcmdldC5qcyIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL3BsYXRmb3JtL2dyYXBoaWNzL3JlbmRlci10YXJnZXQuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgRGVidWcgfSBmcm9tICcuLi8uLi9jb3JlL2RlYnVnLmpzJztcbmltcG9ydCB7IFRSQUNFSURfUkVOREVSX1RBUkdFVF9BTExPQyB9IGZyb20gJy4uLy4uL2NvcmUvY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IFBJWEVMRk9STUFUX0RFUFRILCBQSVhFTEZPUk1BVF9ERVBUSFNURU5DSUwgfSBmcm9tICcuL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBEZWJ1Z0dyYXBoaWNzIH0gZnJvbSAnLi9kZWJ1Zy1ncmFwaGljcy5qcyc7XG5pbXBvcnQgeyBHcmFwaGljc0RldmljZSB9IGZyb20gJy4vZ3JhcGhpY3MtZGV2aWNlLmpzJztcblxubGV0IGlkID0gMDtcblxuLyoqXG4gKiBBIHJlbmRlciB0YXJnZXQgaXMgYSByZWN0YW5ndWxhciByZW5kZXJpbmcgc3VyZmFjZS5cbiAqXG4gKiBAY2F0ZWdvcnkgR3JhcGhpY3NcbiAqL1xuY2xhc3MgUmVuZGVyVGFyZ2V0IHtcbiAgICAvKipcbiAgICAgKiBUaGUgbmFtZSBvZiB0aGUgcmVuZGVyIHRhcmdldC5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtzdHJpbmd9XG4gICAgICovXG4gICAgbmFtZTtcblxuICAgIC8qKlxuICAgICAqIEB0eXBlIHtpbXBvcnQoJy4vZ3JhcGhpY3MtZGV2aWNlLmpzJykuR3JhcGhpY3NEZXZpY2V9XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfZGV2aWNlO1xuXG4gICAgLyoqXG4gICAgICogQHR5cGUge2ltcG9ydCgnLi90ZXh0dXJlLmpzJykuVGV4dHVyZX1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9jb2xvckJ1ZmZlcjtcblxuICAgIC8qKlxuICAgICAqIEB0eXBlIHtpbXBvcnQoJy4vdGV4dHVyZS5qcycpLlRleHR1cmVbXX1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9jb2xvckJ1ZmZlcnM7XG5cbiAgICAvKipcbiAgICAgKiBAdHlwZSB7aW1wb3J0KCcuL3RleHR1cmUuanMnKS5UZXh0dXJlfVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX2RlcHRoQnVmZmVyO1xuXG4gICAgLyoqXG4gICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfZGVwdGg7XG5cbiAgICAvKipcbiAgICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9zdGVuY2lsO1xuXG4gICAgLyoqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9zYW1wbGVzO1xuXG4gICAgLyoqIEB0eXBlIHtib29sZWFufSAqL1xuICAgIGF1dG9SZXNvbHZlO1xuXG4gICAgLyoqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9mYWNlO1xuXG4gICAgLyoqIEB0eXBlIHtib29sZWFufSAqL1xuICAgIGZsaXBZO1xuXG4gICAgLyoqXG4gICAgICogQ3JlYXRlcyBhIG5ldyBSZW5kZXJUYXJnZXQgaW5zdGFuY2UuIEEgY29sb3IgYnVmZmVyIG9yIGEgZGVwdGggYnVmZmVyIG11c3QgYmUgc2V0LlxuICAgICAqXG4gICAgICogQHBhcmFtIHtvYmplY3R9IFtvcHRpb25zXSAtIE9iamVjdCBmb3IgcGFzc2luZyBvcHRpb25hbCBhcmd1bWVudHMuXG4gICAgICogQHBhcmFtIHtib29sZWFufSBbb3B0aW9ucy5hdXRvUmVzb2x2ZV0gLSBJZiBzYW1wbGVzID4gMSwgZW5hYmxlcyBvciBkaXNhYmxlcyBhdXRvbWF0aWMgTVNBQVxuICAgICAqIHJlc29sdmUgYWZ0ZXIgcmVuZGVyaW5nIHRvIHRoaXMgUlQgKHNlZSB7QGxpbmsgUmVuZGVyVGFyZ2V0I3Jlc29sdmV9KS4gRGVmYXVsdHMgdG8gdHJ1ZS5cbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi90ZXh0dXJlLmpzJykuVGV4dHVyZX0gW29wdGlvbnMuY29sb3JCdWZmZXJdIC0gVGhlIHRleHR1cmUgdGhhdCB0aGlzIHJlbmRlclxuICAgICAqIHRhcmdldCB3aWxsIHRyZWF0IGFzIGEgcmVuZGVyaW5nIHN1cmZhY2UuXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4vdGV4dHVyZS5qcycpLlRleHR1cmVbXX0gW29wdGlvbnMuY29sb3JCdWZmZXJzXSAtIFRoZSB0ZXh0dXJlcyB0aGF0IHRoaXNcbiAgICAgKiByZW5kZXIgdGFyZ2V0IHdpbGwgdHJlYXQgYXMgYSByZW5kZXJpbmcgc3VyZmFjZXMuIElmIHRoaXMgb3B0aW9uIGlzIHNldCwgdGhlIGNvbG9yQnVmZmVyXG4gICAgICogb3B0aW9uIGlzIGlnbm9yZWQuIFRoaXMgb3B0aW9uIGNhbiBiZSB1c2VkIG9ubHkgd2hlbiB7QGxpbmsgR3JhcGhpY3NEZXZpY2Ujc3VwcG9ydHNNcnR9IGlzXG4gICAgICogdHJ1ZS5cbiAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IFtvcHRpb25zLmRlcHRoXSAtIElmIHNldCB0byB0cnVlLCBkZXB0aCBidWZmZXIgd2lsbCBiZSBjcmVhdGVkLiBEZWZhdWx0cyB0b1xuICAgICAqIHRydWUuIElnbm9yZWQgaWYgZGVwdGhCdWZmZXIgaXMgZGVmaW5lZC5cbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi90ZXh0dXJlLmpzJykuVGV4dHVyZX0gW29wdGlvbnMuZGVwdGhCdWZmZXJdIC0gVGhlIHRleHR1cmUgdGhhdCB0aGlzIHJlbmRlclxuICAgICAqIHRhcmdldCB3aWxsIHRyZWF0IGFzIGEgZGVwdGgvc3RlbmNpbCBzdXJmYWNlIChXZWJHTDIgb25seSkuIElmIHNldCwgdGhlICdkZXB0aCcgYW5kXG4gICAgICogJ3N0ZW5jaWwnIHByb3BlcnRpZXMgYXJlIGlnbm9yZWQuIFRleHR1cmUgbXVzdCBoYXZlIHtAbGluayBQSVhFTEZPUk1BVF9ERVBUSH0gb3JcbiAgICAgKiB7QGxpbmsgUElYRUxGT1JNQVRfREVQVEhTVEVOQ0lMfSBmb3JtYXQuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFtvcHRpb25zLmZhY2VdIC0gSWYgdGhlIGNvbG9yQnVmZmVyIHBhcmFtZXRlciBpcyBhIGN1YmVtYXAsIHVzZSB0aGlzIG9wdGlvblxuICAgICAqIHRvIHNwZWNpZnkgdGhlIGZhY2Ugb2YgdGhlIGN1YmVtYXAgdG8gcmVuZGVyIHRvLiBDYW4gYmU6XG4gICAgICpcbiAgICAgKiAtIHtAbGluayBDVUJFRkFDRV9QT1NYfVxuICAgICAqIC0ge0BsaW5rIENVQkVGQUNFX05FR1h9XG4gICAgICogLSB7QGxpbmsgQ1VCRUZBQ0VfUE9TWX1cbiAgICAgKiAtIHtAbGluayBDVUJFRkFDRV9ORUdZfVxuICAgICAqIC0ge0BsaW5rIENVQkVGQUNFX1BPU1p9XG4gICAgICogLSB7QGxpbmsgQ1VCRUZBQ0VfTkVHWn1cbiAgICAgKlxuICAgICAqIERlZmF1bHRzIHRvIHtAbGluayBDVUJFRkFDRV9QT1NYfS5cbiAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IFtvcHRpb25zLmZsaXBZXSAtIFdoZW4gc2V0IHRvIHRydWUgdGhlIGltYWdlIHdpbGwgYmUgZmxpcHBlZCBpbiBZLiBEZWZhdWx0XG4gICAgICogaXMgZmFsc2UuXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IFtvcHRpb25zLm5hbWVdIC0gVGhlIG5hbWUgb2YgdGhlIHJlbmRlciB0YXJnZXQuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFtvcHRpb25zLnNhbXBsZXNdIC0gTnVtYmVyIG9mIGhhcmR3YXJlIGFudGktYWxpYXNpbmcgc2FtcGxlcyAobm90IHN1cHBvcnRlZFxuICAgICAqIG9uIFdlYkdMMSkuIERlZmF1bHQgaXMgMS5cbiAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IFtvcHRpb25zLnN0ZW5jaWxdIC0gSWYgc2V0IHRvIHRydWUsIGRlcHRoIGJ1ZmZlciB3aWxsIGluY2x1ZGUgc3RlbmNpbC5cbiAgICAgKiBEZWZhdWx0cyB0byBmYWxzZS4gSWdub3JlZCBpZiBkZXB0aEJ1ZmZlciBpcyBkZWZpbmVkIG9yIGRlcHRoIGlzIGZhbHNlLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogLy8gQ3JlYXRlIGEgNTEyeDUxMngyNC1iaXQgcmVuZGVyIHRhcmdldCB3aXRoIGEgZGVwdGggYnVmZmVyXG4gICAgICogY29uc3QgY29sb3JCdWZmZXIgPSBuZXcgcGMuVGV4dHVyZShncmFwaGljc0RldmljZSwge1xuICAgICAqICAgICB3aWR0aDogNTEyLFxuICAgICAqICAgICBoZWlnaHQ6IDUxMixcbiAgICAgKiAgICAgZm9ybWF0OiBwYy5QSVhFTEZPUk1BVF9SR0I4XG4gICAgICogfSk7XG4gICAgICogY29uc3QgcmVuZGVyVGFyZ2V0ID0gbmV3IHBjLlJlbmRlclRhcmdldCh7XG4gICAgICogICAgIGNvbG9yQnVmZmVyOiBjb2xvckJ1ZmZlcixcbiAgICAgKiAgICAgZGVwdGg6IHRydWVcbiAgICAgKiB9KTtcbiAgICAgKlxuICAgICAqIC8vIFNldCB0aGUgcmVuZGVyIHRhcmdldCBvbiBhIGNhbWVyYSBjb21wb25lbnRcbiAgICAgKiBjYW1lcmEucmVuZGVyVGFyZ2V0ID0gcmVuZGVyVGFyZ2V0O1xuICAgICAqXG4gICAgICogLy8gRGVzdHJveSByZW5kZXIgdGFyZ2V0IGF0IGEgbGF0ZXIgc3RhZ2UuIE5vdGUgdGhhdCB0aGUgY29sb3IgYnVmZmVyIG5lZWRzXG4gICAgICogLy8gdG8gYmUgZGVzdHJveWVkIHNlcGFyYXRlbHkuXG4gICAgICogcmVuZGVyVGFyZ2V0LmNvbG9yQnVmZmVyLmRlc3Ryb3koKTtcbiAgICAgKiByZW5kZXJUYXJnZXQuZGVzdHJveSgpO1xuICAgICAqIGNhbWVyYS5yZW5kZXJUYXJnZXQgPSBudWxsO1xuICAgICAqL1xuICAgIGNvbnN0cnVjdG9yKG9wdGlvbnMgPSB7fSkge1xuICAgICAgICB0aGlzLmlkID0gaWQrKztcblxuICAgICAgICBjb25zdCBfYXJnMiA9IGFyZ3VtZW50c1sxXTtcbiAgICAgICAgY29uc3QgX2FyZzMgPSBhcmd1bWVudHNbMl07XG5cbiAgICAgICAgaWYgKG9wdGlvbnMgaW5zdGFuY2VvZiBHcmFwaGljc0RldmljZSkge1xuICAgICAgICAgICAgLy8gb2xkIGNvbnN0cnVjdG9yXG4gICAgICAgICAgICB0aGlzLl9jb2xvckJ1ZmZlciA9IF9hcmcyO1xuICAgICAgICAgICAgb3B0aW9ucyA9IF9hcmczO1xuXG4gICAgICAgICAgICBEZWJ1Zy5kZXByZWNhdGVkKCdwYy5SZW5kZXJUYXJnZXQgY29uc3RydWN0b3Igbm8gbG9uZ2VyIGFjY2VwdHMgR3JhcGhpY3NEZXZpY2UgcGFyYW1ldGVyLicpO1xuXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBuZXcgY29uc3RydWN0b3JcbiAgICAgICAgICAgIHRoaXMuX2NvbG9yQnVmZmVyID0gb3B0aW9ucy5jb2xvckJ1ZmZlcjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFVzZSB0aGUgc2luZ2xlIGNvbG9yQnVmZmVyIGluIHRoZSBjb2xvckJ1ZmZlcnMgYXJyYXkuIFRoaXMgYWxsb3dzIHVzIHRvIGFsd2F5cyBqdXN0IHVzZSB0aGUgYXJyYXkgaW50ZXJuYWxseS5cbiAgICAgICAgaWYgKHRoaXMuX2NvbG9yQnVmZmVyKSB7XG4gICAgICAgICAgICB0aGlzLl9jb2xvckJ1ZmZlcnMgPSBbdGhpcy5fY29sb3JCdWZmZXJdO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gUHJvY2VzcyBvcHRpb25hbCBhcmd1bWVudHNcbiAgICAgICAgdGhpcy5fZGVwdGhCdWZmZXIgPSBvcHRpb25zLmRlcHRoQnVmZmVyO1xuICAgICAgICB0aGlzLl9mYWNlID0gb3B0aW9ucy5mYWNlID8/IDA7XG5cbiAgICAgICAgaWYgKHRoaXMuX2RlcHRoQnVmZmVyKSB7XG4gICAgICAgICAgICBjb25zdCBmb3JtYXQgPSB0aGlzLl9kZXB0aEJ1ZmZlci5fZm9ybWF0O1xuICAgICAgICAgICAgaWYgKGZvcm1hdCA9PT0gUElYRUxGT1JNQVRfREVQVEgpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9kZXB0aCA9IHRydWU7XG4gICAgICAgICAgICAgICAgdGhpcy5fc3RlbmNpbCA9IGZhbHNlO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChmb3JtYXQgPT09IFBJWEVMRk9STUFUX0RFUFRIU1RFTkNJTCkge1xuICAgICAgICAgICAgICAgIHRoaXMuX2RlcHRoID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB0aGlzLl9zdGVuY2lsID0gdHJ1ZTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgRGVidWcud2FybignSW5jb3JyZWN0IGRlcHRoQnVmZmVyIGZvcm1hdC4gTXVzdCBiZSBwYy5QSVhFTEZPUk1BVF9ERVBUSCBvciBwYy5QSVhFTEZPUk1BVF9ERVBUSFNURU5DSUwnKTtcbiAgICAgICAgICAgICAgICB0aGlzLl9kZXB0aCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIHRoaXMuX3N0ZW5jaWwgPSBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuX2RlcHRoID0gb3B0aW9ucy5kZXB0aCA/PyB0cnVlO1xuICAgICAgICAgICAgdGhpcy5fc3RlbmNpbCA9IG9wdGlvbnMuc3RlbmNpbCA/PyBmYWxzZTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIE1SVFxuICAgICAgICBpZiAob3B0aW9ucy5jb2xvckJ1ZmZlcnMpIHtcbiAgICAgICAgICAgIERlYnVnLmFzc2VydCghdGhpcy5fY29sb3JCdWZmZXJzLCAnV2hlbiBjb25zdHJ1Y3RpbmcgUmVuZGVyVGFyZ2V0IGFuZCBvcHRpb25zLmNvbG9yQnVmZmVycyBpcyB1c2VkLCBvcHRpb25zLmNvbG9yQnVmZmVyIG11c3Qgbm90IGJlIHVzZWQuJyk7XG5cbiAgICAgICAgICAgIGlmICghdGhpcy5fY29sb3JCdWZmZXJzKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fY29sb3JCdWZmZXJzID0gWy4uLm9wdGlvbnMuY29sb3JCdWZmZXJzXTtcblxuICAgICAgICAgICAgICAgIC8vIHNldCB0aGUgbWFpbiBjb2xvciBidWZmZXIgdG8gcG9pbnQgdG8gMCBpbmRleFxuICAgICAgICAgICAgICAgIHRoaXMuX2NvbG9yQnVmZmVyID0gb3B0aW9ucy5jb2xvckJ1ZmZlcnNbMF07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBkZXZpY2UsIGZyb20gb25lIG9mIHRoZSBidWZmZXJzXG4gICAgICAgIGNvbnN0IGRldmljZSA9IHRoaXMuX2NvbG9yQnVmZmVyPy5kZXZpY2UgfHwgdGhpcy5fZGVwdGhCdWZmZXI/LmRldmljZSB8fCBvcHRpb25zLmdyYXBoaWNzRGV2aWNlO1xuICAgICAgICBEZWJ1Zy5hc3NlcnQoZGV2aWNlLCBcIkZhaWxlZCB0byBvYnRhaW4gdGhlIGRldmljZSwgY29sb3JCdWZmZXIgbm9yIGRlcHRoQnVmZmVyIHN0b3JlIGl0LlwiKTtcbiAgICAgICAgdGhpcy5fZGV2aWNlID0gZGV2aWNlO1xuXG4gICAgICAgIERlYnVnLmNhbGwoKCkgPT4ge1xuICAgICAgICAgICAgaWYgKHRoaXMuX2NvbG9yQnVmZmVycykge1xuICAgICAgICAgICAgICAgIERlYnVnLmFzc2VydCh0aGlzLl9jb2xvckJ1ZmZlcnMubGVuZ3RoIDw9IDEgfHwgZGV2aWNlLnN1cHBvcnRzTXJ0LCAnTXVsdGlwbGUgcmVuZGVyIHRhcmdldHMgYXJlIG5vdCBzdXBwb3J0ZWQgb24gdGhpcyBkZXZpY2UnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gbWFyayBjb2xvciBidWZmZXIgdGV4dHVyZXMgYXMgcmVuZGVyIHRhcmdldFxuICAgICAgICB0aGlzLl9jb2xvckJ1ZmZlcnM/LmZvckVhY2goKGNvbG9yQnVmZmVyKSA9PiB7XG4gICAgICAgICAgICBjb2xvckJ1ZmZlci5faXNSZW5kZXJUYXJnZXQgPSB0cnVlO1xuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCB7IG1heFNhbXBsZXMgfSA9IHRoaXMuX2RldmljZTtcbiAgICAgICAgdGhpcy5fc2FtcGxlcyA9IE1hdGgubWluKG9wdGlvbnMuc2FtcGxlcyA/PyAxLCBtYXhTYW1wbGVzKTtcblxuICAgICAgICAvLyBXZWJHUFUgb25seSBzdXBwb3J0cyB2YWx1ZXMgb2YgMSBvciA0IGZvciBzYW1wbGVzXG4gICAgICAgIGlmIChkZXZpY2UuaXNXZWJHUFUpIHtcbiAgICAgICAgICAgIHRoaXMuX3NhbXBsZXMgPSB0aGlzLl9zYW1wbGVzID4gMSA/IG1heFNhbXBsZXMgOiAxO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5hdXRvUmVzb2x2ZSA9IG9wdGlvbnMuYXV0b1Jlc29sdmUgPz8gdHJ1ZTtcblxuICAgICAgICAvLyB1c2Ugc3BlY2lmaWVkIG5hbWUsIG90aGVyd2lzZSBnZXQgb25lIGZyb20gY29sb3Igb3IgZGVwdGggYnVmZmVyXG4gICAgICAgIHRoaXMubmFtZSA9IG9wdGlvbnMubmFtZTtcbiAgICAgICAgaWYgKCF0aGlzLm5hbWUpIHtcbiAgICAgICAgICAgIHRoaXMubmFtZSA9IHRoaXMuX2NvbG9yQnVmZmVyPy5uYW1lO1xuICAgICAgICB9XG4gICAgICAgIGlmICghdGhpcy5uYW1lKSB7XG4gICAgICAgICAgICB0aGlzLm5hbWUgPSB0aGlzLl9kZXB0aEJ1ZmZlcj8ubmFtZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIXRoaXMubmFtZSkge1xuICAgICAgICAgICAgdGhpcy5uYW1lID0gXCJVbnRpdGxlZFwiO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gcmVuZGVyIGltYWdlIGZsaXBwZWQgaW4gWVxuICAgICAgICB0aGlzLmZsaXBZID0gb3B0aW9ucy5mbGlwWSA/PyBmYWxzZTtcblxuICAgICAgICB0aGlzLnZhbGlkYXRlTXJ0KCk7XG5cbiAgICAgICAgLy8gZGV2aWNlIHNwZWNpZmljIGltcGxlbWVudGF0aW9uXG4gICAgICAgIHRoaXMuaW1wbCA9IGRldmljZS5jcmVhdGVSZW5kZXJUYXJnZXRJbXBsKHRoaXMpO1xuXG4gICAgICAgIERlYnVnLnRyYWNlKFRSQUNFSURfUkVOREVSX1RBUkdFVF9BTExPQywgYEFsbG9jOiBJZCAke3RoaXMuaWR9ICR7dGhpcy5uYW1lfTogJHt0aGlzLndpZHRofXgke3RoaXMuaGVpZ2h0fSBgICtcbiAgICAgICAgICAgIGBbc2FtcGxlczogJHt0aGlzLnNhbXBsZXN9XWAgK1xuICAgICAgICAgICAgYCR7dGhpcy5fY29sb3JCdWZmZXJzPy5sZW5ndGggPyBgW01SVDogJHt0aGlzLl9jb2xvckJ1ZmZlcnMubGVuZ3RofV1gIDogJyd9YCArXG4gICAgICAgICAgICBgJHt0aGlzLmNvbG9yQnVmZmVyID8gJ1tDb2xvcl0nIDogJyd9YCArXG4gICAgICAgICAgICBgJHt0aGlzLmRlcHRoID8gJ1tEZXB0aF0nIDogJyd9YCArXG4gICAgICAgICAgICBgJHt0aGlzLnN0ZW5jaWwgPyAnW1N0ZW5jaWxdJyA6ICcnfWAgK1xuICAgICAgICAgICAgYFtGYWNlOiR7dGhpcy5mYWNlfV1gKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBGcmVlcyByZXNvdXJjZXMgYXNzb2NpYXRlZCB3aXRoIHRoaXMgcmVuZGVyIHRhcmdldC5cbiAgICAgKi9cbiAgICBkZXN0cm95KCkge1xuXG4gICAgICAgIERlYnVnLnRyYWNlKFRSQUNFSURfUkVOREVSX1RBUkdFVF9BTExPQywgYERlQWxsb2M6IElkICR7dGhpcy5pZH0gJHt0aGlzLm5hbWV9YCk7XG5cbiAgICAgICAgY29uc3QgZGV2aWNlID0gdGhpcy5fZGV2aWNlO1xuICAgICAgICBpZiAoZGV2aWNlKSB7XG4gICAgICAgICAgICBkZXZpY2UudGFyZ2V0cy5kZWxldGUodGhpcyk7XG5cbiAgICAgICAgICAgIGlmIChkZXZpY2UucmVuZGVyVGFyZ2V0ID09PSB0aGlzKSB7XG4gICAgICAgICAgICAgICAgZGV2aWNlLnNldFJlbmRlclRhcmdldChudWxsKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5kZXN0cm95RnJhbWVCdWZmZXJzKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBGcmVlIGRldmljZSByZXNvdXJjZXMgYXNzb2NpYXRlZCB3aXRoIHRoaXMgcmVuZGVyIHRhcmdldC5cbiAgICAgKlxuICAgICAqIEBpZ25vcmVcbiAgICAgKi9cbiAgICBkZXN0cm95RnJhbWVCdWZmZXJzKCkge1xuXG4gICAgICAgIGNvbnN0IGRldmljZSA9IHRoaXMuX2RldmljZTtcbiAgICAgICAgaWYgKGRldmljZSkge1xuICAgICAgICAgICAgdGhpcy5pbXBsLmRlc3Ryb3koZGV2aWNlKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEZyZWUgdGV4dHVyZXMgYXNzb2NpYXRlZCB3aXRoIHRoaXMgcmVuZGVyIHRhcmdldC5cbiAgICAgKlxuICAgICAqIEBpZ25vcmVcbiAgICAgKi9cbiAgICBkZXN0cm95VGV4dHVyZUJ1ZmZlcnMoKSB7XG5cbiAgICAgICAgdGhpcy5fZGVwdGhCdWZmZXI/LmRlc3Ryb3koKTtcbiAgICAgICAgdGhpcy5fZGVwdGhCdWZmZXIgPSBudWxsO1xuXG4gICAgICAgIHRoaXMuX2NvbG9yQnVmZmVycz8uZm9yRWFjaCgoY29sb3JCdWZmZXIpID0+IHtcbiAgICAgICAgICAgIGNvbG9yQnVmZmVyLmRlc3Ryb3koKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuX2NvbG9yQnVmZmVycyA9IG51bGw7XG4gICAgICAgIHRoaXMuX2NvbG9yQnVmZmVyID0gbnVsbDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXNpemVzIHRoZSByZW5kZXIgdGFyZ2V0IHRvIHRoZSBzcGVjaWZpZWQgd2lkdGggYW5kIGhlaWdodC4gSW50ZXJuYWxseSB0aGlzIHJlc2l6ZXMgYWxsIHRoZVxuICAgICAqIGFzc2lnbmVkIHRleHR1cmUgY29sb3IgYW5kIGRlcHRoIGJ1ZmZlcnMuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gd2lkdGggLSBUaGUgd2lkdGggb2YgdGhlIHJlbmRlciB0YXJnZXQgaW4gcGl4ZWxzLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBoZWlnaHQgLSBUaGUgaGVpZ2h0IG9mIHRoZSByZW5kZXIgdGFyZ2V0IGluIHBpeGVscy5cbiAgICAgKi9cbiAgICByZXNpemUod2lkdGgsIGhlaWdodCkge1xuXG4gICAgICAgIC8vIHJlbGVhc2UgZXhpc3RpbmdcbiAgICAgICAgY29uc3QgZGV2aWNlID0gdGhpcy5fZGV2aWNlO1xuICAgICAgICB0aGlzLmRlc3Ryb3lGcmFtZUJ1ZmZlcnMoKTtcbiAgICAgICAgaWYgKGRldmljZS5yZW5kZXJUYXJnZXQgPT09IHRoaXMpIHtcbiAgICAgICAgICAgIGRldmljZS5zZXRSZW5kZXJUYXJnZXQobnVsbCk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyByZXNpemUgdGV4dHVyZXNcbiAgICAgICAgdGhpcy5fZGVwdGhCdWZmZXI/LnJlc2l6ZSh3aWR0aCwgaGVpZ2h0KTtcbiAgICAgICAgdGhpcy5fY29sb3JCdWZmZXJzPy5mb3JFYWNoKChjb2xvckJ1ZmZlcikgPT4ge1xuICAgICAgICAgICAgY29sb3JCdWZmZXIucmVzaXplKHdpZHRoLCBoZWlnaHQpO1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyBpbml0aWFsaXplIGFnYWluXG4gICAgICAgIHRoaXMudmFsaWRhdGVNcnQoKTtcbiAgICAgICAgdGhpcy5pbXBsID0gZGV2aWNlLmNyZWF0ZVJlbmRlclRhcmdldEltcGwodGhpcyk7XG4gICAgfVxuXG4gICAgdmFsaWRhdGVNcnQoKSB7XG4gICAgICAgIERlYnVnLmNhbGwoKCkgPT4ge1xuICAgICAgICAgICAgaWYgKHRoaXMuX2NvbG9yQnVmZmVycykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHsgd2lkdGgsIGhlaWdodCwgY3ViZW1hcCwgdm9sdW1lIH0gPSB0aGlzLl9jb2xvckJ1ZmZlcnNbMF07XG4gICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDE7IGkgPCB0aGlzLl9jb2xvckJ1ZmZlcnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY29sb3JCdWZmZXIgPSB0aGlzLl9jb2xvckJ1ZmZlcnNbaV07XG4gICAgICAgICAgICAgICAgICAgIERlYnVnLmFzc2VydChjb2xvckJ1ZmZlci53aWR0aCA9PT0gd2lkdGgsICdBbGwgcmVuZGVyIHRhcmdldCBjb2xvciBidWZmZXJzIG11c3QgaGF2ZSB0aGUgc2FtZSB3aWR0aCcsIHRoaXMpO1xuICAgICAgICAgICAgICAgICAgICBEZWJ1Zy5hc3NlcnQoY29sb3JCdWZmZXIuaGVpZ2h0ID09PSBoZWlnaHQsICdBbGwgcmVuZGVyIHRhcmdldCBjb2xvciBidWZmZXJzIG11c3QgaGF2ZSB0aGUgc2FtZSBoZWlnaHQnLCB0aGlzKTtcbiAgICAgICAgICAgICAgICAgICAgRGVidWcuYXNzZXJ0KGNvbG9yQnVmZmVyLmN1YmVtYXAgPT09IGN1YmVtYXAsICdBbGwgcmVuZGVyIHRhcmdldCBjb2xvciBidWZmZXJzIG11c3QgaGF2ZSB0aGUgc2FtZSBjdWJlbWFwIHNldHRpbmcnLCB0aGlzKTtcbiAgICAgICAgICAgICAgICAgICAgRGVidWcuYXNzZXJ0KGNvbG9yQnVmZmVyLnZvbHVtZSA9PT0gdm9sdW1lLCAnQWxsIHJlbmRlciB0YXJnZXQgY29sb3IgYnVmZmVycyBtdXN0IGhhdmUgdGhlIHNhbWUgdm9sdW1lIHNldHRpbmcnLCB0aGlzKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEluaXRpYWxpemVzIHRoZSByZXNvdXJjZXMgYXNzb2NpYXRlZCB3aXRoIHRoaXMgcmVuZGVyIHRhcmdldC5cbiAgICAgKlxuICAgICAqIEBpZ25vcmVcbiAgICAgKi9cbiAgICBpbml0KCkge1xuICAgICAgICB0aGlzLmltcGwuaW5pdCh0aGlzLl9kZXZpY2UsIHRoaXMpO1xuICAgIH1cblxuICAgIC8qKiBAaWdub3JlICovXG4gICAgZ2V0IGluaXRpYWxpemVkKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5pbXBsLmluaXRpYWxpemVkO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENhbGxlZCB3aGVuIHRoZSBkZXZpY2UgY29udGV4dCB3YXMgbG9zdC4gSXQgcmVsZWFzZXMgYWxsIGNvbnRleHQgcmVsYXRlZCByZXNvdXJjZXMuXG4gICAgICpcbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgbG9zZUNvbnRleHQoKSB7XG4gICAgICAgIHRoaXMuaW1wbC5sb3NlQ29udGV4dCgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIElmIHNhbXBsZXMgPiAxLCByZXNvbHZlcyB0aGUgYW50aS1hbGlhc2VkIHJlbmRlciB0YXJnZXQgKFdlYkdMMiBvbmx5KS4gV2hlbiB5b3UncmUgcmVuZGVyaW5nXG4gICAgICogdG8gYW4gYW50aS1hbGlhc2VkIHJlbmRlciB0YXJnZXQsIHBpeGVscyBhcmVuJ3Qgd3JpdHRlbiBkaXJlY3RseSB0byB0aGUgcmVhZGFibGUgdGV4dHVyZS5cbiAgICAgKiBJbnN0ZWFkLCB0aGV5J3JlIGZpcnN0IHdyaXR0ZW4gdG8gYSBNU0FBIGJ1ZmZlciwgd2hlcmUgZWFjaCBzYW1wbGUgZm9yIGVhY2ggcGl4ZWwgaXMgc3RvcmVkXG4gICAgICogaW5kZXBlbmRlbnRseS4gSW4gb3JkZXIgdG8gcmVhZCB0aGUgcmVzdWx0cywgeW91IGZpcnN0IG5lZWQgdG8gJ3Jlc29sdmUnIHRoZSBidWZmZXIgLSB0b1xuICAgICAqIGF2ZXJhZ2UgYWxsIHNhbXBsZXMgYW5kIGNyZWF0ZSBhIHNpbXBsZSB0ZXh0dXJlIHdpdGggb25lIGNvbG9yIHBlciBwaXhlbC4gVGhpcyBmdW5jdGlvblxuICAgICAqIHBlcmZvcm1zIHRoaXMgYXZlcmFnaW5nIGFuZCB1cGRhdGVzIHRoZSBjb2xvckJ1ZmZlciBhbmQgdGhlIGRlcHRoQnVmZmVyLiBJZiBhdXRvUmVzb2x2ZSBpc1xuICAgICAqIHNldCB0byB0cnVlLCB0aGUgcmVzb2x2ZSB3aWxsIGhhcHBlbiBhZnRlciBldmVyeSByZW5kZXJpbmcgdG8gdGhpcyByZW5kZXIgdGFyZ2V0LCBvdGhlcndpc2VcbiAgICAgKiB5b3UgY2FuIGRvIGl0IG1hbnVhbGx5LCBkdXJpbmcgdGhlIGFwcCB1cGRhdGUgb3IgaW5zaWRlIGEge0BsaW5rIENvbW1hbmR9LlxuICAgICAqXG4gICAgICogQHBhcmFtIHtib29sZWFufSBbY29sb3JdIC0gUmVzb2x2ZSBjb2xvciBidWZmZXIuIERlZmF1bHRzIHRvIHRydWUuXG4gICAgICogQHBhcmFtIHtib29sZWFufSBbZGVwdGhdIC0gUmVzb2x2ZSBkZXB0aCBidWZmZXIuIERlZmF1bHRzIHRvIHRydWUgaWYgdGhlIHJlbmRlciB0YXJnZXQgaGFzIGFcbiAgICAgKiBkZXB0aCBidWZmZXIuXG4gICAgICovXG4gICAgcmVzb2x2ZShjb2xvciA9IHRydWUsIGRlcHRoID0gISF0aGlzLl9kZXB0aEJ1ZmZlcikge1xuXG4gICAgICAgIC8vIFRPRE86IGNvbnNpZGVyIGFkZGluZyBzdXBwb3J0IGZvciBNUlQgdG8gdGhpcyBmdW5jdGlvbi5cblxuICAgICAgICBpZiAodGhpcy5fZGV2aWNlICYmIHRoaXMuX3NhbXBsZXMgPiAxKSB7XG4gICAgICAgICAgICBEZWJ1Z0dyYXBoaWNzLnB1c2hHcHVNYXJrZXIodGhpcy5fZGV2aWNlLCBgUkVTT0xWRS1SVDoke3RoaXMubmFtZX1gKTtcbiAgICAgICAgICAgIHRoaXMuaW1wbC5yZXNvbHZlKHRoaXMuX2RldmljZSwgdGhpcywgY29sb3IsIGRlcHRoKTtcbiAgICAgICAgICAgIERlYnVnR3JhcGhpY3MucG9wR3B1TWFya2VyKHRoaXMuX2RldmljZSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDb3BpZXMgY29sb3IgYW5kL29yIGRlcHRoIGNvbnRlbnRzIG9mIHNvdXJjZSByZW5kZXIgdGFyZ2V0IHRvIHRoaXMgb25lLiBGb3JtYXRzLCBzaXplcyBhbmRcbiAgICAgKiBhbnRpLWFsaWFzaW5nIHNhbXBsZXMgbXVzdCBtYXRjaC4gRGVwdGggYnVmZmVyIGNhbiBvbmx5IGJlIGNvcGllZCBvbiBXZWJHTCAyLjAuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1JlbmRlclRhcmdldH0gc291cmNlIC0gU291cmNlIHJlbmRlciB0YXJnZXQgdG8gY29weSBmcm9tLlxuICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gW2NvbG9yXSAtIElmIHRydWUgd2lsbCBjb3B5IHRoZSBjb2xvciBidWZmZXIuIERlZmF1bHRzIHRvIGZhbHNlLlxuICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gW2RlcHRoXSAtIElmIHRydWUgd2lsbCBjb3B5IHRoZSBkZXB0aCBidWZmZXIuIERlZmF1bHRzIHRvIGZhbHNlLlxuICAgICAqIEByZXR1cm5zIHtib29sZWFufSBUcnVlIGlmIHRoZSBjb3B5IHdhcyBzdWNjZXNzZnVsLCBmYWxzZSBvdGhlcndpc2UuXG4gICAgICovXG4gICAgY29weShzb3VyY2UsIGNvbG9yLCBkZXB0aCkge1xuXG4gICAgICAgIC8vIFRPRE86IGNvbnNpZGVyIGFkZGluZyBzdXBwb3J0IGZvciBNUlQgdG8gdGhpcyBmdW5jdGlvbi5cblxuICAgICAgICBpZiAoIXRoaXMuX2RldmljZSkge1xuICAgICAgICAgICAgaWYgKHNvdXJjZS5fZGV2aWNlKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fZGV2aWNlID0gc291cmNlLl9kZXZpY2U7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIERlYnVnLmVycm9yKFwiUmVuZGVyIHRhcmdldHMgYXJlIG5vdCBpbml0aWFsaXplZFwiKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBEZWJ1Z0dyYXBoaWNzLnB1c2hHcHVNYXJrZXIodGhpcy5fZGV2aWNlLCBgQ09QWS1SVDoke3NvdXJjZS5uYW1lfS0+JHt0aGlzLm5hbWV9YCk7XG4gICAgICAgIGNvbnN0IHN1Y2Nlc3MgPSB0aGlzLl9kZXZpY2UuY29weVJlbmRlclRhcmdldChzb3VyY2UsIHRoaXMsIGNvbG9yLCBkZXB0aCk7XG4gICAgICAgIERlYnVnR3JhcGhpY3MucG9wR3B1TWFya2VyKHRoaXMuX2RldmljZSk7XG5cbiAgICAgICAgcmV0dXJuIHN1Y2Nlc3M7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTnVtYmVyIG9mIGFudGlhbGlhc2luZyBzYW1wbGVzIHRoZSByZW5kZXIgdGFyZ2V0IHVzZXMuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqL1xuICAgIGdldCBzYW1wbGVzKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fc2FtcGxlcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUcnVlIGlmIHRoZSByZW5kZXIgdGFyZ2V0IGNvbnRhaW5zIHRoZSBkZXB0aCBhdHRhY2htZW50LlxuICAgICAqXG4gICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICovXG4gICAgZ2V0IGRlcHRoKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fZGVwdGg7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVHJ1ZSBpZiB0aGUgcmVuZGVyIHRhcmdldCBjb250YWlucyB0aGUgc3RlbmNpbCBhdHRhY2htZW50LlxuICAgICAqXG4gICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICovXG4gICAgZ2V0IHN0ZW5jaWwoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9zdGVuY2lsO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENvbG9yIGJ1ZmZlciBzZXQgdXAgb24gdGhlIHJlbmRlciB0YXJnZXQuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7aW1wb3J0KCcuL3RleHR1cmUuanMnKS5UZXh0dXJlfVxuICAgICAqL1xuICAgIGdldCBjb2xvckJ1ZmZlcigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2NvbG9yQnVmZmVyO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEFjY2Vzc29yIGZvciBtdWx0aXBsZSByZW5kZXIgdGFyZ2V0IGNvbG9yIGJ1ZmZlcnMuXG4gICAgICpcbiAgICAgKiBAcGFyYW0geyp9IGluZGV4IC0gSW5kZXggb2YgdGhlIGNvbG9yIGJ1ZmZlciB0byBnZXQuXG4gICAgICogQHJldHVybnMge2ltcG9ydCgnLi90ZXh0dXJlLmpzJykuVGV4dHVyZX0gLSBDb2xvciBidWZmZXIgYXQgdGhlIHNwZWNpZmllZCBpbmRleC5cbiAgICAgKi9cbiAgICBnZXRDb2xvckJ1ZmZlcihpbmRleCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fY29sb3JCdWZmZXJzPy5baW5kZXhdO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIERlcHRoIGJ1ZmZlciBzZXQgdXAgb24gdGhlIHJlbmRlciB0YXJnZXQuIE9ubHkgYXZhaWxhYmxlLCBpZiBkZXB0aEJ1ZmZlciB3YXMgc2V0IGluXG4gICAgICogY29uc3RydWN0b3IuIE5vdCBhdmFpbGFibGUgaWYgZGVwdGggcHJvcGVydHkgd2FzIHVzZWQgaW5zdGVhZC5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtpbXBvcnQoJy4vdGV4dHVyZS5qcycpLlRleHR1cmV9XG4gICAgICovXG4gICAgZ2V0IGRlcHRoQnVmZmVyKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fZGVwdGhCdWZmZXI7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSWYgdGhlIHJlbmRlciB0YXJnZXQgaXMgYm91bmQgdG8gYSBjdWJlbWFwLCB0aGlzIHByb3BlcnR5IHNwZWNpZmllcyB3aGljaCBmYWNlIG9mIHRoZVxuICAgICAqIGN1YmVtYXAgaXMgcmVuZGVyZWQgdG8uIENhbiBiZTpcbiAgICAgKlxuICAgICAqIC0ge0BsaW5rIENVQkVGQUNFX1BPU1h9XG4gICAgICogLSB7QGxpbmsgQ1VCRUZBQ0VfTkVHWH1cbiAgICAgKiAtIHtAbGluayBDVUJFRkFDRV9QT1NZfVxuICAgICAqIC0ge0BsaW5rIENVQkVGQUNFX05FR1l9XG4gICAgICogLSB7QGxpbmsgQ1VCRUZBQ0VfUE9TWn1cbiAgICAgKiAtIHtAbGluayBDVUJFRkFDRV9ORUdafVxuICAgICAqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKi9cbiAgICBnZXQgZmFjZSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2ZhY2U7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogV2lkdGggb2YgdGhlIHJlbmRlciB0YXJnZXQgaW4gcGl4ZWxzLlxuICAgICAqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKi9cbiAgICBnZXQgd2lkdGgoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9jb2xvckJ1ZmZlcj8ud2lkdGggfHwgdGhpcy5fZGVwdGhCdWZmZXI/LndpZHRoIHx8IHRoaXMuX2RldmljZS53aWR0aDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBIZWlnaHQgb2YgdGhlIHJlbmRlciB0YXJnZXQgaW4gcGl4ZWxzLlxuICAgICAqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKi9cbiAgICBnZXQgaGVpZ2h0KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fY29sb3JCdWZmZXI/LmhlaWdodCB8fCB0aGlzLl9kZXB0aEJ1ZmZlcj8uaGVpZ2h0IHx8IHRoaXMuX2RldmljZS5oZWlnaHQ7XG4gICAgfVxufVxuXG5leHBvcnQgeyBSZW5kZXJUYXJnZXQgfTtcbiJdLCJuYW1lcyI6WyJpZCIsIlJlbmRlclRhcmdldCIsImNvbnN0cnVjdG9yIiwib3B0aW9ucyIsIl9vcHRpb25zJGZhY2UiLCJfdGhpcyRfY29sb3JCdWZmZXIiLCJfdGhpcyRfZGVwdGhCdWZmZXIiLCJfdGhpcyRfY29sb3JCdWZmZXJzIiwiX29wdGlvbnMkc2FtcGxlcyIsIl9vcHRpb25zJGF1dG9SZXNvbHZlIiwiX29wdGlvbnMkZmxpcFkiLCJfdGhpcyRfY29sb3JCdWZmZXJzMiIsIm5hbWUiLCJfZGV2aWNlIiwiX2NvbG9yQnVmZmVyIiwiX2NvbG9yQnVmZmVycyIsIl9kZXB0aEJ1ZmZlciIsIl9kZXB0aCIsIl9zdGVuY2lsIiwiX3NhbXBsZXMiLCJhdXRvUmVzb2x2ZSIsIl9mYWNlIiwiZmxpcFkiLCJfYXJnMiIsImFyZ3VtZW50cyIsIl9hcmczIiwiR3JhcGhpY3NEZXZpY2UiLCJEZWJ1ZyIsImRlcHJlY2F0ZWQiLCJjb2xvckJ1ZmZlciIsImRlcHRoQnVmZmVyIiwiZmFjZSIsImZvcm1hdCIsIl9mb3JtYXQiLCJQSVhFTEZPUk1BVF9ERVBUSCIsIlBJWEVMRk9STUFUX0RFUFRIU1RFTkNJTCIsIndhcm4iLCJfb3B0aW9ucyRkZXB0aCIsIl9vcHRpb25zJHN0ZW5jaWwiLCJkZXB0aCIsInN0ZW5jaWwiLCJjb2xvckJ1ZmZlcnMiLCJhc3NlcnQiLCJkZXZpY2UiLCJncmFwaGljc0RldmljZSIsImNhbGwiLCJsZW5ndGgiLCJzdXBwb3J0c01ydCIsImZvckVhY2giLCJfaXNSZW5kZXJUYXJnZXQiLCJtYXhTYW1wbGVzIiwiTWF0aCIsIm1pbiIsInNhbXBsZXMiLCJpc1dlYkdQVSIsIl90aGlzJF9jb2xvckJ1ZmZlcjIiLCJfdGhpcyRfZGVwdGhCdWZmZXIyIiwidmFsaWRhdGVNcnQiLCJpbXBsIiwiY3JlYXRlUmVuZGVyVGFyZ2V0SW1wbCIsInRyYWNlIiwiVFJBQ0VJRF9SRU5ERVJfVEFSR0VUX0FMTE9DIiwid2lkdGgiLCJoZWlnaHQiLCJkZXN0cm95IiwidGFyZ2V0cyIsImRlbGV0ZSIsInJlbmRlclRhcmdldCIsInNldFJlbmRlclRhcmdldCIsImRlc3Ryb3lGcmFtZUJ1ZmZlcnMiLCJkZXN0cm95VGV4dHVyZUJ1ZmZlcnMiLCJfdGhpcyRfZGVwdGhCdWZmZXIzIiwiX3RoaXMkX2NvbG9yQnVmZmVyczMiLCJyZXNpemUiLCJfdGhpcyRfZGVwdGhCdWZmZXI0IiwiX3RoaXMkX2NvbG9yQnVmZmVyczQiLCJjdWJlbWFwIiwidm9sdW1lIiwiaSIsImluaXQiLCJpbml0aWFsaXplZCIsImxvc2VDb250ZXh0IiwicmVzb2x2ZSIsImNvbG9yIiwiRGVidWdHcmFwaGljcyIsInB1c2hHcHVNYXJrZXIiLCJwb3BHcHVNYXJrZXIiLCJjb3B5Iiwic291cmNlIiwiZXJyb3IiLCJzdWNjZXNzIiwiY29weVJlbmRlclRhcmdldCIsImdldENvbG9yQnVmZmVyIiwiaW5kZXgiLCJfdGhpcyRfY29sb3JCdWZmZXJzNSIsIl90aGlzJF9jb2xvckJ1ZmZlcjMiLCJfdGhpcyRfZGVwdGhCdWZmZXI1IiwiX3RoaXMkX2NvbG9yQnVmZmVyNCIsIl90aGlzJF9kZXB0aEJ1ZmZlcjYiXSwibWFwcGluZ3MiOiI7Ozs7OztBQU1BLElBQUlBLEVBQUUsR0FBRyxDQUFDLENBQUE7O0FBRVY7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLE1BQU1DLFlBQVksQ0FBQztBQThEZjtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDSUMsRUFBQUEsV0FBV0EsQ0FBQ0MsT0FBTyxHQUFHLEVBQUUsRUFBRTtBQUFBLElBQUEsSUFBQUMsYUFBQSxFQUFBQyxrQkFBQSxFQUFBQyxrQkFBQSxFQUFBQyxtQkFBQSxFQUFBQyxnQkFBQSxFQUFBQyxvQkFBQSxFQUFBQyxjQUFBLEVBQUFDLG9CQUFBLENBQUE7QUF0SDFCO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFKSSxJQUFBLElBQUEsQ0FLQUMsSUFBSSxHQUFBLEtBQUEsQ0FBQSxDQUFBO0FBRUo7QUFDSjtBQUNBO0FBQ0E7QUFISSxJQUFBLElBQUEsQ0FJQUMsT0FBTyxHQUFBLEtBQUEsQ0FBQSxDQUFBO0FBRVA7QUFDSjtBQUNBO0FBQ0E7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
