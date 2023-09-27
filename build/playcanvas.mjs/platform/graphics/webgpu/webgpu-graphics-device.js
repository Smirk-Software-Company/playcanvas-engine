import { TRACEID_RENDER_QUEUE } from '../../../core/constants.js';
import { Debug, DebugHelper } from '../../../core/debug.js';
import { DEVICETYPE_WEBGPU, PIXELFORMAT_RGBA32F, PIXELFORMAT_RGBA8, PIXELFORMAT_BGRA8 } from '../constants.js';
import { GraphicsDevice } from '../graphics-device.js';
import { DebugGraphics } from '../debug-graphics.js';
import { RenderTarget } from '../render-target.js';
import { StencilParameters } from '../stencil-parameters.js';
import { WebgpuBindGroup } from './webgpu-bind-group.js';
import { WebgpuBindGroupFormat } from './webgpu-bind-group-format.js';
import { WebgpuIndexBuffer } from './webgpu-index-buffer.js';
import { WebgpuRenderPipeline } from './webgpu-render-pipeline.js';
import { WebgpuRenderTarget } from './webgpu-render-target.js';
import { WebgpuShader } from './webgpu-shader.js';
import { WebgpuTexture } from './webgpu-texture.js';
import { WebgpuUniformBuffer } from './webgpu-uniform-buffer.js';
import { WebgpuVertexBuffer } from './webgpu-vertex-buffer.js';
import { WebgpuClearRenderer } from './webgpu-clear-renderer.js';
import { WebgpuMipmapRenderer } from './webgpu-mipmap-renderer.js';
import { WebgpuDebug } from './webgpu-debug.js';
import { WebgpuDynamicBuffers } from './webgpu-dynamic-buffers.js';
import { WebgpuGpuProfiler } from './webgpu-gpu-profiler.js';
import { WebgpuResolver } from './webgpu-resolver.js';

class WebgpuGraphicsDevice extends GraphicsDevice {
  constructor(canvas, options = {}) {
    super(canvas, options);
    /**
     * Object responsible for caching and creation of render pipelines.
     */
    this.renderPipeline = new WebgpuRenderPipeline(this);
    /**
     * Object responsible for clearing the rendering surface by rendering a quad.
     *
     * @type { WebgpuClearRenderer }
     */
    this.clearRenderer = void 0;
    /**
     * Object responsible for mipmap generation.
     *
     * @type { WebgpuMipmapRenderer }
     */
    this.mipmapRenderer = void 0;
    /**
     * Render pipeline currently set on the device.
     *
     * @type {GPURenderPipeline}
     * @private
     */
    this.pipeline = void 0;
    /**
     * An array of bind group formats, based on currently assigned bind groups
     *
     * @type {WebgpuBindGroupFormat[]}
     */
    this.bindGroupFormats = [];
    /**
     * Current command buffer encoder.
     *
     * @type {GPUCommandEncoder}
     * @private
     */
    this.commandEncoder = void 0;
    /**
     * Command buffers scheduled for execution on the GPU.
     *
     * @type {GPUCommandBuffer[]}
     * @private
     */
    this.commandBuffers = [];
    /**
     * @type {GPUSupportedLimits}
     * @private
     */
    this.limits = void 0;
    options = this.initOptions;
    this.isWebGPU = true;
    this._deviceType = DEVICETYPE_WEBGPU;

    // WebGPU currently only supports 1 and 4 samples
    this.samples = options.antialias ? 4 : 1;
    this.setupPassEncoderDefaults();
  }

  /**
   * Destroy the graphics device.
   */
  destroy() {
    this.clearRenderer.destroy();
    this.clearRenderer = null;
    this.mipmapRenderer.destroy();
    this.mipmapRenderer = null;
    this.resolver.destroy();
    this.resolver = null;
    super.destroy();
  }
  initDeviceCaps() {
    // temporarily disabled functionality which is not supported to avoid errors
    this.disableParticleSystem = true;
    const limits = this.gpuAdapter.limits;
    this.limits = limits;
    this.precision = 'highp';
    this.maxPrecision = 'highp';
    this.maxSamples = 4;
    this.maxTextures = 16;
    this.maxTextureSize = limits.maxTextureDimension2D;
    this.maxCubeMapSize = limits.maxTextureDimension2D;
    this.maxVolumeSize = limits.maxTextureDimension3D;
    this.maxColorAttachments = limits.maxColorAttachments;
    this.maxPixelRatio = 1;
    this.maxAnisotropy = 16;
    this.supportsInstancing = true;
    this.supportsUniformBuffers = true;
    this.supportsVolumeTextures = true;
    this.supportsBoneTextures = true;
    this.supportsMorphTargetTexturesCore = true;
    this.supportsAreaLights = true;
    this.supportsDepthShadow = true;
    this.supportsGpuParticles = false;
    this.supportsMrt = true;
    this.extUintElement = true;
    this.extTextureFloat = true;
    this.textureFloatRenderable = true;
    this.extTextureHalfFloat = true;
    this.textureHalfFloatRenderable = true;
    this.textureHalfFloatUpdatable = true;
    this.boneLimit = 1024;
    this.supportsImageBitmap = true;
    this.extStandardDerivatives = true;
    this.extBlendMinmax = true;
    this.areaLightLutFormat = this.floatFilterable ? PIXELFORMAT_RGBA32F : PIXELFORMAT_RGBA8;
    this.supportsTextureFetch = true;
  }
  async initWebGpu(glslangUrl, twgslUrl) {
    if (!window.navigator.gpu) {
      throw new Error('Unable to retrieve GPU. Ensure you are using a browser that supports WebGPU rendering.');
    }

    // temporary message to confirm Webgpu is being used
    Debug.log("WebgpuGraphicsDevice initialization ..");
    const loadScript = url => {
      return new Promise(function (resolve, reject) {
        const script = document.createElement('script');
        script.src = url;
        script.async = false;
        script.onload = function () {
          resolve(url);
        };
        script.onerror = function () {
          reject(new Error(`Failed to download script ${url}`));
        };
        document.body.appendChild(script);
      });
    };

    // TODO: add both loadScript calls and requestAdapter to promise list and wait for all.
    await loadScript(glslangUrl);
    await loadScript(twgslUrl);
    this.glslang = await glslang();
    const wasmPath = twgslUrl.replace('.js', '.wasm');
    this.twgsl = await twgsl(wasmPath);

    /** @type {GPURequestAdapterOptions} */
    const adapterOptions = {
      powerPreference: this.initOptions.powerPreference !== 'default' ? this.initOptions.powerPreference : undefined
    };

    /**
     * @type {GPUAdapter}
     * @private
     */
    this.gpuAdapter = await window.navigator.gpu.requestAdapter(adapterOptions);

    // optional features:
    //      "depth-clip-control",
    //      "depth32float-stencil8",
    //      "indirect-first-instance",
    //      "shader-f16",
    //      "rg11b10ufloat-renderable",
    //      "bgra8unorm-storage",

    // request optional features
    const requiredFeatures = [];
    const requireFeature = feature => {
      const supported = this.gpuAdapter.features.has(feature);
      if (supported) {
        requiredFeatures.push(feature);
      }
      return supported;
    };
    this.floatFilterable = requireFeature('float32-filterable');
    this.extCompressedTextureS3TC = requireFeature('texture-compression-bc');
    this.extCompressedTextureETC = requireFeature('texture-compression-etc2');
    this.extCompressedTextureASTC = requireFeature('texture-compression-astc');
    this.supportsTimestampQuery = requireFeature('timestamp-query');
    Debug.log(`WEBGPU features: ${requiredFeatures.join(', ')}`);

    /** @type {GPUDeviceDescriptor} */
    const deviceDescr = {
      requiredFeatures,
      // Note that we can request limits, but it does not seem to be supported at the moment
      requiredLimits: {},
      defaultQueue: {
        label: 'Default Queue'
      }
    };

    /**
     * @type {GPUDevice}
     * @private
     */
    this.wgpu = await this.gpuAdapter.requestDevice(deviceDescr);
    this.initDeviceCaps();

    // initially fill the window. This needs improvement.
    this.setResolution(window.innerWidth, window.innerHeight);
    this.gpuContext = this.canvas.getContext('webgpu');

    // pixel format of the framebuffer is the most efficient one on the system
    const preferredCanvasFormat = navigator.gpu.getPreferredCanvasFormat();
    this.backBufferFormat = preferredCanvasFormat === 'rgba8unorm' ? PIXELFORMAT_RGBA8 : PIXELFORMAT_BGRA8;

    /**
     * Configuration of the main colorframebuffer we obtain using getCurrentTexture
     *
     * @type {GPUCanvasConfiguration}
     * @private
     */
    this.canvasConfig = {
      device: this.wgpu,
      colorSpace: 'srgb',
      alphaMode: 'opaque',
      // could also be 'premultiplied'

      // use preferred format for optimal performance on mobile
      format: preferredCanvasFormat,
      // RENDER_ATTACHMENT is required, COPY_SRC allows scene grab to copy out from it
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST,
      // formats that views created from textures returned by getCurrentTexture may use
      viewFormats: []
    };
    this.gpuContext.configure(this.canvasConfig);
    this.createBackbuffer();
    this.clearRenderer = new WebgpuClearRenderer(this);
    this.mipmapRenderer = new WebgpuMipmapRenderer(this);
    this.resolver = new WebgpuResolver(this);
    this.postInit();
    return this;
  }
  postInit() {
    super.postInit();
    this.gpuProfiler = new WebgpuGpuProfiler(this);

    // init dynamic buffer using 1MB allocation
    this.dynamicBuffers = new WebgpuDynamicBuffers(this, 1024 * 1024, this.limits.minUniformBufferOffsetAlignment);
  }
  createBackbuffer() {
    this.supportsStencil = this.initOptions.stencil;
    this.backBuffer = new RenderTarget({
      name: 'WebgpuFramebuffer',
      graphicsDevice: this,
      depth: this.initOptions.depth,
      stencil: this.supportsStencil,
      samples: this.samples
    });
  }
  resizeCanvas(width, height) {
    this._width = width;
    this._height = height;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.fire(GraphicsDevice.EVENT_RESIZE, width, height);
    }
  }
  frameStart() {
    super.frameStart();
    this.gpuProfiler.frameStart();

    // submit any commands collected before the frame rendering
    this.submit();
    WebgpuDebug.memory(this);
    WebgpuDebug.validate(this);

    // current frame color output buffer
    const outColorBuffer = this.gpuContext.getCurrentTexture();
    DebugHelper.setLabel(outColorBuffer, `${this.backBuffer.name}`);

    // reallocate framebuffer if dimensions change, to match the output texture
    if (this.backBufferSize.x !== outColorBuffer.width || this.backBufferSize.y !== outColorBuffer.height) {
      this.backBufferSize.set(outColorBuffer.width, outColorBuffer.height);
      this.backBuffer.destroy();
      this.backBuffer = null;
      this.createBackbuffer();
    }
    const rt = this.backBuffer;
    const wrt = rt.impl;

    // assign the format, allowing following init call to use it to allocate matching multisampled buffer
    wrt.setColorAttachment(0, undefined, outColorBuffer.format);
    this.initRenderTarget(rt);

    // assign current frame's render texture
    wrt.assignColorTexture(outColorBuffer);
    WebgpuDebug.end(this);
    WebgpuDebug.end(this);
  }
  frameEnd() {
    super.frameEnd();
    this.gpuProfiler.frameEnd();

    // submit scheduled command buffers
    this.submit();
    this.gpuProfiler.request();
  }
  createUniformBufferImpl(uniformBuffer) {
    return new WebgpuUniformBuffer(uniformBuffer);
  }
  createVertexBufferImpl(vertexBuffer, format) {
    return new WebgpuVertexBuffer(vertexBuffer, format);
  }
  createIndexBufferImpl(indexBuffer) {
    return new WebgpuIndexBuffer(indexBuffer);
  }
  createShaderImpl(shader) {
    return new WebgpuShader(shader);
  }
  createTextureImpl(texture) {
    return new WebgpuTexture(texture);
  }
  createRenderTargetImpl(renderTarget) {
    return new WebgpuRenderTarget(renderTarget);
  }
  createBindGroupFormatImpl(bindGroupFormat) {
    return new WebgpuBindGroupFormat(bindGroupFormat);
  }
  createBindGroupImpl(bindGroup) {
    return new WebgpuBindGroup();
  }

  /**
   * @param {number} index - Index of the bind group slot
   * @param {import('../bind-group.js').BindGroup} bindGroup - Bind group to attach
   */
  setBindGroup(index, bindGroup) {
    // TODO: this condition should be removed, it's here to handle fake grab pass, which should be refactored instead
    if (this.passEncoder) {
      // set it on the device
      this.passEncoder.setBindGroup(index, bindGroup.impl.bindGroup, bindGroup.uniformBufferOffsets);

      // store the active formats, used by the pipeline creation
      this.bindGroupFormats[index] = bindGroup.format.impl;
    }
  }
  submitVertexBuffer(vertexBuffer, slot) {
    const elements = vertexBuffer.format.elements;
    const elementCount = elements.length;
    const vbBuffer = vertexBuffer.impl.buffer;
    for (let i = 0; i < elementCount; i++) {
      this.passEncoder.setVertexBuffer(slot + i, vbBuffer, elements[i].offset);
    }
    return elementCount;
  }
  draw(primitive, numInstances = 1, keepBuffers) {
    if (this.shader.ready && !this.shader.failed) {
      WebgpuDebug.validate(this);
      const passEncoder = this.passEncoder;
      Debug.assert(passEncoder);

      // vertex buffers
      const vb0 = this.vertexBuffers[0];
      const vb1 = this.vertexBuffers[1];
      this.vertexBuffers.length = 0;
      if (vb0) {
        const vbSlot = this.submitVertexBuffer(vb0, 0);
        if (vb1) {
          this.submitVertexBuffer(vb1, vbSlot);
        }
      }

      // render pipeline
      const pipeline = this.renderPipeline.get(primitive, vb0 == null ? void 0 : vb0.format, vb1 == null ? void 0 : vb1.format, this.shader, this.renderTarget, this.bindGroupFormats, this.blendState, this.depthState, this.cullMode, this.stencilEnabled, this.stencilFront, this.stencilBack);
      Debug.assert(pipeline);
      if (this.pipeline !== pipeline) {
        this.pipeline = pipeline;
        passEncoder.setPipeline(pipeline);
      }

      // draw
      const ib = this.indexBuffer;
      if (ib) {
        this.indexBuffer = null;
        passEncoder.setIndexBuffer(ib.impl.buffer, ib.impl.format);
        passEncoder.drawIndexed(primitive.count, numInstances, 0, 0, 0);
      } else {
        passEncoder.draw(primitive.count, numInstances, 0, 0);
      }
      WebgpuDebug.end(this, {
        vb0,
        vb1,
        ib,
        primitive,
        numInstances,
        pipeline
      });
    }
  }
  setShader(shader) {
    this.shader = shader;

    // TODO: we should probably track other stats instead, like pipeline switches
    this._shaderSwitchesPerFrame++;
    return true;
  }
  setBlendState(blendState) {
    this.blendState.copy(blendState);
  }
  setDepthState(depthState) {
    this.depthState.copy(depthState);
  }
  setStencilState(stencilFront, stencilBack) {
    if (stencilFront || stencilBack) {
      this.stencilEnabled = true;
      this.stencilFront.copy(stencilFront != null ? stencilFront : StencilParameters.DEFAULT);
      this.stencilBack.copy(stencilBack != null ? stencilBack : StencilParameters.DEFAULT);

      // ref value - based on stencil front
      const ref = this.stencilFront.ref;
      if (this.stencilRef !== ref) {
        this.stencilRef = ref;
        this.passEncoder.setStencilReference(ref);
      }
    } else {
      this.stencilEnabled = false;
    }
  }
  setBlendColor(r, g, b, a) {
    // TODO: this should use passEncoder.setBlendConstant(color)
    // similar implementation to this.stencilRef
  }
  setCullMode(cullMode) {
    this.cullMode = cullMode;
  }
  setAlphaToCoverage(state) {}
  initializeContextCaches() {
    super.initializeContextCaches();
  }

  /**
   * Set up default values for the render pass encoder.
   */
  setupPassEncoderDefaults() {
    this.stencilRef = 0;
  }

  /**
   * Start a render pass.
   *
   * @param {import('../render-pass.js').RenderPass} renderPass - The render pass to start.
   * @ignore
   */
  startPass(renderPass) {
    WebgpuDebug.internal(this);
    WebgpuDebug.validate(this);
    const rt = renderPass.renderTarget || this.backBuffer;
    this.renderTarget = rt;
    Debug.assert(rt);

    /** @type {WebgpuRenderTarget} */
    const wrt = rt.impl;

    // create a new encoder for each pass
    this.commandEncoder = this.wgpu.createCommandEncoder();
    DebugHelper.setLabel(this.commandEncoder, `${renderPass.name}-Encoder`);

    // framebuffer is initialized at the start of the frame
    if (rt !== this.backBuffer) {
      this.initRenderTarget(rt);
    }

    // set up clear / store / load settings
    wrt.setupForRenderPass(renderPass);

    // clear cached encoder state
    this.pipeline = null;
    const renderPassDesc = wrt.renderPassDescriptor;

    // timestamp
    if (this.gpuProfiler._enabled) {
      if (this.gpuProfiler.timestampQueriesSet) {
        const slot = this.gpuProfiler.getSlot(renderPass.name);
        renderPassDesc.timestampWrites = {
          querySet: this.gpuProfiler.timestampQueriesSet.querySet,
          beginningOfPassWriteIndex: slot * 2,
          endOfPassWriteIndex: slot * 2 + 1
        };
      }
    }

    // start the pass
    this.passEncoder = this.commandEncoder.beginRenderPass(renderPassDesc);
    DebugHelper.setLabel(this.passEncoder, renderPass.name);
    this.setupPassEncoderDefaults();

    // the pass always clears full target
    // TODO: avoid this setting the actual viewport/scissor on webgpu as those are automatically reset to full
    // render target. We just need to update internal state, for the get functionality to return it.
    const {
      width,
      height
    } = rt;
    this.setViewport(0, 0, width, height);
    this.setScissor(0, 0, width, height);
    Debug.assert(!this.insideRenderPass, 'RenderPass cannot be started while inside another render pass.');
    this.insideRenderPass = true;
  }

  /**
   * End a render pass.
   *
   * @param {import('../render-pass.js').RenderPass} renderPass - The render pass to end.
   * @ignore
   */
  endPass(renderPass) {
    // end the render pass
    this.passEncoder.end();
    this.passEncoder = null;
    this.insideRenderPass = false;

    // each render pass can use different number of bind groups
    this.bindGroupFormats.length = 0;

    // generate mipmaps using the same command buffer encoder
    for (let i = 0; i < renderPass.colorArrayOps.length; i++) {
      const colorOps = renderPass.colorArrayOps[i];
      if (colorOps.mipmaps) {
        this.mipmapRenderer.generate(renderPass.renderTarget._colorBuffers[i].impl);
      }
    }

    // schedule command buffer submission
    const cb = this.commandEncoder.finish();
    DebugHelper.setLabel(cb, `${renderPass.name}-CommandBuffer`);
    this.addCommandBuffer(cb);
    this.commandEncoder = null;
    WebgpuDebug.end(this, {
      renderPass
    });
    WebgpuDebug.end(this, {
      renderPass
    });
  }
  addCommandBuffer(commandBuffer, front = false) {
    if (front) {
      this.commandBuffers.unshift(commandBuffer);
    } else {
      this.commandBuffers.push(commandBuffer);
    }
  }
  submit() {
    if (this.commandBuffers.length > 0) {
      // copy dynamic buffers data to the GPU (this schedules the copy CB to run before all other CBs)
      this.dynamicBuffers.submit();

      // trace all scheduled command buffers
      Debug.call(() => {
        if (this.commandBuffers.length > 0) {
          Debug.trace(TRACEID_RENDER_QUEUE, `SUBMIT (${this.commandBuffers.length})`);
          for (let i = 0; i < this.commandBuffers.length; i++) {
            Debug.trace(TRACEID_RENDER_QUEUE, `  CB: ${this.commandBuffers[i].label}`);
          }
        }
      });
      this.wgpu.queue.submit(this.commandBuffers);
      this.commandBuffers.length = 0;

      // notify dynamic buffers
      this.dynamicBuffers.onCommandBuffersSubmitted();
    }
  }
  clear(options) {
    if (options.flags) {
      this.clearRenderer.clear(this, this.renderTarget, options, this.defaultClearOptions);
    }
  }
  get width() {
    return this._width;
  }
  get height() {
    return this._height;
  }
  setDepthBias(on) {}
  setDepthBiasValues(constBias, slopeBias) {}
  setViewport(x, y, w, h) {
    // TODO: only execute when it changes. Also, the viewport of encoder  matches the rendering attachments,
    // so we can skip this if fullscreen
    // TODO: this condition should be removed, it's here to handle fake grab pass, which should be refactored instead
    if (this.passEncoder) {
      if (!this.renderTarget.flipY) {
        y = this.renderTarget.height - y - h;
      }
      this.vx = x;
      this.vy = y;
      this.vw = w;
      this.vh = h;
      this.passEncoder.setViewport(x, y, w, h, 0, 1);
    }
  }
  setScissor(x, y, w, h) {
    // TODO: only execute when it changes. Also, the viewport of encoder  matches the rendering attachments,
    // so we can skip this if fullscreen
    // TODO: this condition should be removed, it's here to handle fake grab pass, which should be refactored instead
    if (this.passEncoder) {
      if (!this.renderTarget.flipY) {
        y = this.renderTarget.height - y - h;
      }
      this.sx = x;
      this.sy = y;
      this.sw = w;
      this.sh = h;
      this.passEncoder.setScissorRect(x, y, w, h);
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
    var _this$commandEncoder;
    /** @type {GPUExtent3D} */
    const copySize = {
      width: source ? source.width : dest.width,
      height: source ? source.height : dest.height,
      depthOrArrayLayers: 1
    };

    // use existing or create new encoder if not in a render pass
    const commandEncoder = (_this$commandEncoder = this.commandEncoder) != null ? _this$commandEncoder : this.wgpu.createCommandEncoder();
    DebugHelper.setLabel(commandEncoder, 'CopyRenderTarget-Encoder');
    DebugGraphics.pushGpuMarker(this, 'COPY-RT');
    if (color) {
      // read from supplied render target, or from the framebuffer
      /** @type {GPUImageCopyTexture} */
      const copySrc = {
        texture: source ? source.colorBuffer.impl.gpuTexture : this.renderTarget.impl.assignedColorTexture,
        mipLevel: 0
      };

      // write to supplied render target, or to the framebuffer
      /** @type {GPUImageCopyTexture} */
      const copyDst = {
        texture: dest ? dest.colorBuffer.impl.gpuTexture : this.renderTarget.impl.assignedColorTexture,
        mipLevel: 0
      };
      Debug.assert(copySrc.texture !== null && copyDst.texture !== null);
      commandEncoder.copyTextureToTexture(copySrc, copyDst, copySize);
    }
    if (depth) {
      // read from supplied render target, or from the framebuffer
      const sourceRT = source ? source : this.renderTarget;
      const sourceTexture = sourceRT.impl.depthTexture;
      if (source.samples > 1) {
        // resolve the depth to a color buffer of destination render target
        const destTexture = dest.colorBuffer.impl.gpuTexture;
        this.resolver.resolveDepth(commandEncoder, sourceTexture, destTexture);
      } else {
        // write to supplied render target, or to the framebuffer
        const destTexture = dest ? dest.depthBuffer.impl.gpuTexture : this.renderTarget.impl.depthTexture;

        /** @type {GPUImageCopyTexture} */
        const copySrc = {
          texture: sourceTexture,
          mipLevel: 0
        };

        /** @type {GPUImageCopyTexture} */
        const copyDst = {
          texture: destTexture,
          mipLevel: 0
        };
        Debug.assert(copySrc.texture !== null && copyDst.texture !== null);
        commandEncoder.copyTextureToTexture(copySrc, copyDst, copySize);
      }
    }
    DebugGraphics.popGpuMarker(this);

    // if we created the encoder
    if (!this.commandEncoder) {
      // copy operation runs next
      const cb = commandEncoder.finish();
      DebugHelper.setLabel(cb, 'CopyRenderTarget-CommandBuffer');
      this.addCommandBuffer(cb);
    }
    return true;
  }
  pushMarker(name) {
    var _this$passEncoder;
    (_this$passEncoder = this.passEncoder) == null ? void 0 : _this$passEncoder.pushDebugGroup(name);
  }
  popMarker() {
    var _this$passEncoder2;
    (_this$passEncoder2 = this.passEncoder) == null ? void 0 : _this$passEncoder2.popDebugGroup();
  }
}

export { WebgpuGraphicsDevice };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2ViZ3B1LWdyYXBoaWNzLWRldmljZS5qcyIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vc3JjL3BsYXRmb3JtL2dyYXBoaWNzL3dlYmdwdS93ZWJncHUtZ3JhcGhpY3MtZGV2aWNlLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFRSQUNFSURfUkVOREVSX1FVRVVFIH0gZnJvbSAnLi4vLi4vLi4vY29yZS9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgRGVidWcsIERlYnVnSGVscGVyIH0gZnJvbSAnLi4vLi4vLi4vY29yZS9kZWJ1Zy5qcyc7XG5cbmltcG9ydCB7XG4gICAgUElYRUxGT1JNQVRfUkdCQTMyRiwgUElYRUxGT1JNQVRfUkdCQTgsIFBJWEVMRk9STUFUX0JHUkE4LCBERVZJQ0VUWVBFX1dFQkdQVVxufSBmcm9tICcuLi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgR3JhcGhpY3NEZXZpY2UgfSBmcm9tICcuLi9ncmFwaGljcy1kZXZpY2UuanMnO1xuaW1wb3J0IHsgRGVidWdHcmFwaGljcyB9IGZyb20gJy4uL2RlYnVnLWdyYXBoaWNzLmpzJztcbmltcG9ydCB7IFJlbmRlclRhcmdldCB9IGZyb20gJy4uL3JlbmRlci10YXJnZXQuanMnO1xuaW1wb3J0IHsgU3RlbmNpbFBhcmFtZXRlcnMgfSBmcm9tICcuLi9zdGVuY2lsLXBhcmFtZXRlcnMuanMnO1xuXG5pbXBvcnQgeyBXZWJncHVCaW5kR3JvdXAgfSBmcm9tICcuL3dlYmdwdS1iaW5kLWdyb3VwLmpzJztcbmltcG9ydCB7IFdlYmdwdUJpbmRHcm91cEZvcm1hdCB9IGZyb20gJy4vd2ViZ3B1LWJpbmQtZ3JvdXAtZm9ybWF0LmpzJztcbmltcG9ydCB7IFdlYmdwdUluZGV4QnVmZmVyIH0gZnJvbSAnLi93ZWJncHUtaW5kZXgtYnVmZmVyLmpzJztcbmltcG9ydCB7IFdlYmdwdVJlbmRlclBpcGVsaW5lIH0gZnJvbSAnLi93ZWJncHUtcmVuZGVyLXBpcGVsaW5lLmpzJztcbmltcG9ydCB7IFdlYmdwdVJlbmRlclRhcmdldCB9IGZyb20gJy4vd2ViZ3B1LXJlbmRlci10YXJnZXQuanMnO1xuaW1wb3J0IHsgV2ViZ3B1U2hhZGVyIH0gZnJvbSAnLi93ZWJncHUtc2hhZGVyLmpzJztcbmltcG9ydCB7IFdlYmdwdVRleHR1cmUgfSBmcm9tICcuL3dlYmdwdS10ZXh0dXJlLmpzJztcbmltcG9ydCB7IFdlYmdwdVVuaWZvcm1CdWZmZXIgfSBmcm9tICcuL3dlYmdwdS11bmlmb3JtLWJ1ZmZlci5qcyc7XG5pbXBvcnQgeyBXZWJncHVWZXJ0ZXhCdWZmZXIgfSBmcm9tICcuL3dlYmdwdS12ZXJ0ZXgtYnVmZmVyLmpzJztcbmltcG9ydCB7IFdlYmdwdUNsZWFyUmVuZGVyZXIgfSBmcm9tICcuL3dlYmdwdS1jbGVhci1yZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBXZWJncHVNaXBtYXBSZW5kZXJlciB9IGZyb20gJy4vd2ViZ3B1LW1pcG1hcC1yZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBXZWJncHVEZWJ1ZyB9IGZyb20gJy4vd2ViZ3B1LWRlYnVnLmpzJztcbmltcG9ydCB7IFdlYmdwdUR5bmFtaWNCdWZmZXJzIH0gZnJvbSAnLi93ZWJncHUtZHluYW1pYy1idWZmZXJzLmpzJztcbmltcG9ydCB7IFdlYmdwdUdwdVByb2ZpbGVyIH0gZnJvbSAnLi93ZWJncHUtZ3B1LXByb2ZpbGVyLmpzJztcbmltcG9ydCB7IFdlYmdwdVJlc29sdmVyIH0gZnJvbSAnLi93ZWJncHUtcmVzb2x2ZXIuanMnO1xuXG5jbGFzcyBXZWJncHVHcmFwaGljc0RldmljZSBleHRlbmRzIEdyYXBoaWNzRGV2aWNlIHtcbiAgICAvKipcbiAgICAgKiBPYmplY3QgcmVzcG9uc2libGUgZm9yIGNhY2hpbmcgYW5kIGNyZWF0aW9uIG9mIHJlbmRlciBwaXBlbGluZXMuXG4gICAgICovXG4gICAgcmVuZGVyUGlwZWxpbmUgPSBuZXcgV2ViZ3B1UmVuZGVyUGlwZWxpbmUodGhpcyk7XG5cbiAgICAvKipcbiAgICAgKiBPYmplY3QgcmVzcG9uc2libGUgZm9yIGNsZWFyaW5nIHRoZSByZW5kZXJpbmcgc3VyZmFjZSBieSByZW5kZXJpbmcgYSBxdWFkLlxuICAgICAqXG4gICAgICogQHR5cGUgeyBXZWJncHVDbGVhclJlbmRlcmVyIH1cbiAgICAgKi9cbiAgICBjbGVhclJlbmRlcmVyO1xuXG4gICAgLyoqXG4gICAgICogT2JqZWN0IHJlc3BvbnNpYmxlIGZvciBtaXBtYXAgZ2VuZXJhdGlvbi5cbiAgICAgKlxuICAgICAqIEB0eXBlIHsgV2ViZ3B1TWlwbWFwUmVuZGVyZXIgfVxuICAgICAqL1xuICAgIG1pcG1hcFJlbmRlcmVyO1xuXG4gICAgLyoqXG4gICAgICogUmVuZGVyIHBpcGVsaW5lIGN1cnJlbnRseSBzZXQgb24gdGhlIGRldmljZS5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtHUFVSZW5kZXJQaXBlbGluZX1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIHBpcGVsaW5lO1xuXG4gICAgLyoqXG4gICAgICogQW4gYXJyYXkgb2YgYmluZCBncm91cCBmb3JtYXRzLCBiYXNlZCBvbiBjdXJyZW50bHkgYXNzaWduZWQgYmluZCBncm91cHNcbiAgICAgKlxuICAgICAqIEB0eXBlIHtXZWJncHVCaW5kR3JvdXBGb3JtYXRbXX1cbiAgICAgKi9cbiAgICBiaW5kR3JvdXBGb3JtYXRzID0gW107XG5cbiAgICAvKipcbiAgICAgKiBDdXJyZW50IGNvbW1hbmQgYnVmZmVyIGVuY29kZXIuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7R1BVQ29tbWFuZEVuY29kZXJ9XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBjb21tYW5kRW5jb2RlcjtcblxuICAgIC8qKlxuICAgICAqIENvbW1hbmQgYnVmZmVycyBzY2hlZHVsZWQgZm9yIGV4ZWN1dGlvbiBvbiB0aGUgR1BVLlxuICAgICAqXG4gICAgICogQHR5cGUge0dQVUNvbW1hbmRCdWZmZXJbXX1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIGNvbW1hbmRCdWZmZXJzID0gW107XG5cbiAgICAvKipcbiAgICAgKiBAdHlwZSB7R1BVU3VwcG9ydGVkTGltaXRzfVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgbGltaXRzO1xuXG4gICAgY29uc3RydWN0b3IoY2FudmFzLCBvcHRpb25zID0ge30pIHtcbiAgICAgICAgc3VwZXIoY2FudmFzLCBvcHRpb25zKTtcbiAgICAgICAgb3B0aW9ucyA9IHRoaXMuaW5pdE9wdGlvbnM7XG5cbiAgICAgICAgdGhpcy5pc1dlYkdQVSA9IHRydWU7XG4gICAgICAgIHRoaXMuX2RldmljZVR5cGUgPSBERVZJQ0VUWVBFX1dFQkdQVTtcblxuICAgICAgICAvLyBXZWJHUFUgY3VycmVudGx5IG9ubHkgc3VwcG9ydHMgMSBhbmQgNCBzYW1wbGVzXG4gICAgICAgIHRoaXMuc2FtcGxlcyA9IG9wdGlvbnMuYW50aWFsaWFzID8gNCA6IDE7XG5cbiAgICAgICAgdGhpcy5zZXR1cFBhc3NFbmNvZGVyRGVmYXVsdHMoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBEZXN0cm95IHRoZSBncmFwaGljcyBkZXZpY2UuXG4gICAgICovXG4gICAgZGVzdHJveSgpIHtcblxuICAgICAgICB0aGlzLmNsZWFyUmVuZGVyZXIuZGVzdHJveSgpO1xuICAgICAgICB0aGlzLmNsZWFyUmVuZGVyZXIgPSBudWxsO1xuXG4gICAgICAgIHRoaXMubWlwbWFwUmVuZGVyZXIuZGVzdHJveSgpO1xuICAgICAgICB0aGlzLm1pcG1hcFJlbmRlcmVyID0gbnVsbDtcblxuICAgICAgICB0aGlzLnJlc29sdmVyLmRlc3Ryb3koKTtcbiAgICAgICAgdGhpcy5yZXNvbHZlciA9IG51bGw7XG5cbiAgICAgICAgc3VwZXIuZGVzdHJveSgpO1xuICAgIH1cblxuICAgIGluaXREZXZpY2VDYXBzKCkge1xuXG4gICAgICAgIC8vIHRlbXBvcmFyaWx5IGRpc2FibGVkIGZ1bmN0aW9uYWxpdHkgd2hpY2ggaXMgbm90IHN1cHBvcnRlZCB0byBhdm9pZCBlcnJvcnNcbiAgICAgICAgdGhpcy5kaXNhYmxlUGFydGljbGVTeXN0ZW0gPSB0cnVlO1xuXG4gICAgICAgIGNvbnN0IGxpbWl0cyA9IHRoaXMuZ3B1QWRhcHRlci5saW1pdHM7XG4gICAgICAgIHRoaXMubGltaXRzID0gbGltaXRzO1xuXG4gICAgICAgIHRoaXMucHJlY2lzaW9uID0gJ2hpZ2hwJztcbiAgICAgICAgdGhpcy5tYXhQcmVjaXNpb24gPSAnaGlnaHAnO1xuICAgICAgICB0aGlzLm1heFNhbXBsZXMgPSA0O1xuICAgICAgICB0aGlzLm1heFRleHR1cmVzID0gMTY7XG4gICAgICAgIHRoaXMubWF4VGV4dHVyZVNpemUgPSBsaW1pdHMubWF4VGV4dHVyZURpbWVuc2lvbjJEO1xuICAgICAgICB0aGlzLm1heEN1YmVNYXBTaXplID0gbGltaXRzLm1heFRleHR1cmVEaW1lbnNpb24yRDtcbiAgICAgICAgdGhpcy5tYXhWb2x1bWVTaXplID0gbGltaXRzLm1heFRleHR1cmVEaW1lbnNpb24zRDtcbiAgICAgICAgdGhpcy5tYXhDb2xvckF0dGFjaG1lbnRzID0gbGltaXRzLm1heENvbG9yQXR0YWNobWVudHM7XG4gICAgICAgIHRoaXMubWF4UGl4ZWxSYXRpbyA9IDE7XG4gICAgICAgIHRoaXMubWF4QW5pc290cm9weSA9IDE2O1xuICAgICAgICB0aGlzLnN1cHBvcnRzSW5zdGFuY2luZyA9IHRydWU7XG4gICAgICAgIHRoaXMuc3VwcG9ydHNVbmlmb3JtQnVmZmVycyA9IHRydWU7XG4gICAgICAgIHRoaXMuc3VwcG9ydHNWb2x1bWVUZXh0dXJlcyA9IHRydWU7XG4gICAgICAgIHRoaXMuc3VwcG9ydHNCb25lVGV4dHVyZXMgPSB0cnVlO1xuICAgICAgICB0aGlzLnN1cHBvcnRzTW9ycGhUYXJnZXRUZXh0dXJlc0NvcmUgPSB0cnVlO1xuICAgICAgICB0aGlzLnN1cHBvcnRzQXJlYUxpZ2h0cyA9IHRydWU7XG4gICAgICAgIHRoaXMuc3VwcG9ydHNEZXB0aFNoYWRvdyA9IHRydWU7XG4gICAgICAgIHRoaXMuc3VwcG9ydHNHcHVQYXJ0aWNsZXMgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5zdXBwb3J0c01ydCA9IHRydWU7XG4gICAgICAgIHRoaXMuZXh0VWludEVsZW1lbnQgPSB0cnVlO1xuICAgICAgICB0aGlzLmV4dFRleHR1cmVGbG9hdCA9IHRydWU7XG4gICAgICAgIHRoaXMudGV4dHVyZUZsb2F0UmVuZGVyYWJsZSA9IHRydWU7XG4gICAgICAgIHRoaXMuZXh0VGV4dHVyZUhhbGZGbG9hdCA9IHRydWU7XG4gICAgICAgIHRoaXMudGV4dHVyZUhhbGZGbG9hdFJlbmRlcmFibGUgPSB0cnVlO1xuICAgICAgICB0aGlzLnRleHR1cmVIYWxmRmxvYXRVcGRhdGFibGUgPSB0cnVlO1xuICAgICAgICB0aGlzLmJvbmVMaW1pdCA9IDEwMjQ7XG4gICAgICAgIHRoaXMuc3VwcG9ydHNJbWFnZUJpdG1hcCA9IHRydWU7XG4gICAgICAgIHRoaXMuZXh0U3RhbmRhcmREZXJpdmF0aXZlcyA9IHRydWU7XG4gICAgICAgIHRoaXMuZXh0QmxlbmRNaW5tYXggPSB0cnVlO1xuICAgICAgICB0aGlzLmFyZWFMaWdodEx1dEZvcm1hdCA9IHRoaXMuZmxvYXRGaWx0ZXJhYmxlID8gUElYRUxGT1JNQVRfUkdCQTMyRiA6IFBJWEVMRk9STUFUX1JHQkE4O1xuICAgICAgICB0aGlzLnN1cHBvcnRzVGV4dHVyZUZldGNoID0gdHJ1ZTtcbiAgICB9XG5cbiAgICBhc3luYyBpbml0V2ViR3B1KGdsc2xhbmdVcmwsIHR3Z3NsVXJsKSB7XG5cbiAgICAgICAgaWYgKCF3aW5kb3cubmF2aWdhdG9yLmdwdSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbmFibGUgdG8gcmV0cmlldmUgR1BVLiBFbnN1cmUgeW91IGFyZSB1c2luZyBhIGJyb3dzZXIgdGhhdCBzdXBwb3J0cyBXZWJHUFUgcmVuZGVyaW5nLicpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gdGVtcG9yYXJ5IG1lc3NhZ2UgdG8gY29uZmlybSBXZWJncHUgaXMgYmVpbmcgdXNlZFxuICAgICAgICBEZWJ1Zy5sb2coXCJXZWJncHVHcmFwaGljc0RldmljZSBpbml0aWFsaXphdGlvbiAuLlwiKTtcblxuICAgICAgICBjb25zdCBsb2FkU2NyaXB0ID0gKHVybCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKGZ1bmN0aW9uIChyZXNvbHZlLCByZWplY3QpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBzY3JpcHQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzY3JpcHQnKTtcbiAgICAgICAgICAgICAgICBzY3JpcHQuc3JjID0gdXJsO1xuICAgICAgICAgICAgICAgIHNjcmlwdC5hc3luYyA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIHNjcmlwdC5vbmxvYWQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUodXJsKTtcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIHNjcmlwdC5vbmVycm9yID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICByZWplY3QobmV3IEVycm9yKGBGYWlsZWQgdG8gZG93bmxvYWQgc2NyaXB0ICR7dXJsfWApKTtcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoc2NyaXB0KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9O1xuXG4gICAgICAgIC8vIFRPRE86IGFkZCBib3RoIGxvYWRTY3JpcHQgY2FsbHMgYW5kIHJlcXVlc3RBZGFwdGVyIHRvIHByb21pc2UgbGlzdCBhbmQgd2FpdCBmb3IgYWxsLlxuICAgICAgICBhd2FpdCBsb2FkU2NyaXB0KGdsc2xhbmdVcmwpO1xuICAgICAgICBhd2FpdCBsb2FkU2NyaXB0KHR3Z3NsVXJsKTtcblxuICAgICAgICB0aGlzLmdsc2xhbmcgPSBhd2FpdCBnbHNsYW5nKCk7XG5cbiAgICAgICAgY29uc3Qgd2FzbVBhdGggPSB0d2dzbFVybC5yZXBsYWNlKCcuanMnLCAnLndhc20nKTtcbiAgICAgICAgdGhpcy50d2dzbCA9IGF3YWl0IHR3Z3NsKHdhc21QYXRoKTtcblxuICAgICAgICAvKiogQHR5cGUge0dQVVJlcXVlc3RBZGFwdGVyT3B0aW9uc30gKi9cbiAgICAgICAgY29uc3QgYWRhcHRlck9wdGlvbnMgPSB7XG4gICAgICAgICAgICBwb3dlclByZWZlcmVuY2U6IHRoaXMuaW5pdE9wdGlvbnMucG93ZXJQcmVmZXJlbmNlICE9PSAnZGVmYXVsdCcgPyB0aGlzLmluaXRPcHRpb25zLnBvd2VyUHJlZmVyZW5jZSA6IHVuZGVmaW5lZFxuICAgICAgICB9O1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAdHlwZSB7R1BVQWRhcHRlcn1cbiAgICAgICAgICogQHByaXZhdGVcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuZ3B1QWRhcHRlciA9IGF3YWl0IHdpbmRvdy5uYXZpZ2F0b3IuZ3B1LnJlcXVlc3RBZGFwdGVyKGFkYXB0ZXJPcHRpb25zKTtcblxuICAgICAgICAvLyBvcHRpb25hbCBmZWF0dXJlczpcbiAgICAgICAgLy8gICAgICBcImRlcHRoLWNsaXAtY29udHJvbFwiLFxuICAgICAgICAvLyAgICAgIFwiZGVwdGgzMmZsb2F0LXN0ZW5jaWw4XCIsXG4gICAgICAgIC8vICAgICAgXCJpbmRpcmVjdC1maXJzdC1pbnN0YW5jZVwiLFxuICAgICAgICAvLyAgICAgIFwic2hhZGVyLWYxNlwiLFxuICAgICAgICAvLyAgICAgIFwicmcxMWIxMHVmbG9hdC1yZW5kZXJhYmxlXCIsXG4gICAgICAgIC8vICAgICAgXCJiZ3JhOHVub3JtLXN0b3JhZ2VcIixcblxuICAgICAgICAvLyByZXF1ZXN0IG9wdGlvbmFsIGZlYXR1cmVzXG4gICAgICAgIGNvbnN0IHJlcXVpcmVkRmVhdHVyZXMgPSBbXTtcbiAgICAgICAgY29uc3QgcmVxdWlyZUZlYXR1cmUgPSAoZmVhdHVyZSkgPT4ge1xuICAgICAgICAgICAgY29uc3Qgc3VwcG9ydGVkID0gdGhpcy5ncHVBZGFwdGVyLmZlYXR1cmVzLmhhcyhmZWF0dXJlKTtcbiAgICAgICAgICAgIGlmIChzdXBwb3J0ZWQpIHtcbiAgICAgICAgICAgICAgICByZXF1aXJlZEZlYXR1cmVzLnB1c2goZmVhdHVyZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gc3VwcG9ydGVkO1xuICAgICAgICB9O1xuICAgICAgICB0aGlzLmZsb2F0RmlsdGVyYWJsZSA9IHJlcXVpcmVGZWF0dXJlKCdmbG9hdDMyLWZpbHRlcmFibGUnKTtcbiAgICAgICAgdGhpcy5leHRDb21wcmVzc2VkVGV4dHVyZVMzVEMgPSByZXF1aXJlRmVhdHVyZSgndGV4dHVyZS1jb21wcmVzc2lvbi1iYycpO1xuICAgICAgICB0aGlzLmV4dENvbXByZXNzZWRUZXh0dXJlRVRDID0gcmVxdWlyZUZlYXR1cmUoJ3RleHR1cmUtY29tcHJlc3Npb24tZXRjMicpO1xuICAgICAgICB0aGlzLmV4dENvbXByZXNzZWRUZXh0dXJlQVNUQyA9IHJlcXVpcmVGZWF0dXJlKCd0ZXh0dXJlLWNvbXByZXNzaW9uLWFzdGMnKTtcbiAgICAgICAgdGhpcy5zdXBwb3J0c1RpbWVzdGFtcFF1ZXJ5ID0gcmVxdWlyZUZlYXR1cmUoJ3RpbWVzdGFtcC1xdWVyeScpO1xuICAgICAgICBEZWJ1Zy5sb2coYFdFQkdQVSBmZWF0dXJlczogJHtyZXF1aXJlZEZlYXR1cmVzLmpvaW4oJywgJyl9YCk7XG5cbiAgICAgICAgLyoqIEB0eXBlIHtHUFVEZXZpY2VEZXNjcmlwdG9yfSAqL1xuICAgICAgICBjb25zdCBkZXZpY2VEZXNjciA9IHtcbiAgICAgICAgICAgIHJlcXVpcmVkRmVhdHVyZXMsXG5cbiAgICAgICAgICAgIC8vIE5vdGUgdGhhdCB3ZSBjYW4gcmVxdWVzdCBsaW1pdHMsIGJ1dCBpdCBkb2VzIG5vdCBzZWVtIHRvIGJlIHN1cHBvcnRlZCBhdCB0aGUgbW9tZW50XG4gICAgICAgICAgICByZXF1aXJlZExpbWl0czoge1xuICAgICAgICAgICAgfSxcblxuICAgICAgICAgICAgZGVmYXVsdFF1ZXVlOiB7XG4gICAgICAgICAgICAgICAgbGFiZWw6ICdEZWZhdWx0IFF1ZXVlJ1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAdHlwZSB7R1BVRGV2aWNlfVxuICAgICAgICAgKiBAcHJpdmF0ZVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy53Z3B1ID0gYXdhaXQgdGhpcy5ncHVBZGFwdGVyLnJlcXVlc3REZXZpY2UoZGV2aWNlRGVzY3IpO1xuXG4gICAgICAgIHRoaXMuaW5pdERldmljZUNhcHMoKTtcblxuICAgICAgICAvLyBpbml0aWFsbHkgZmlsbCB0aGUgd2luZG93LiBUaGlzIG5lZWRzIGltcHJvdmVtZW50LlxuICAgICAgICB0aGlzLnNldFJlc29sdXRpb24od2luZG93LmlubmVyV2lkdGgsIHdpbmRvdy5pbm5lckhlaWdodCk7XG5cbiAgICAgICAgdGhpcy5ncHVDb250ZXh0ID0gdGhpcy5jYW52YXMuZ2V0Q29udGV4dCgnd2ViZ3B1Jyk7XG5cbiAgICAgICAgLy8gcGl4ZWwgZm9ybWF0IG9mIHRoZSBmcmFtZWJ1ZmZlciBpcyB0aGUgbW9zdCBlZmZpY2llbnQgb25lIG9uIHRoZSBzeXN0ZW1cbiAgICAgICAgY29uc3QgcHJlZmVycmVkQ2FudmFzRm9ybWF0ID0gbmF2aWdhdG9yLmdwdS5nZXRQcmVmZXJyZWRDYW52YXNGb3JtYXQoKTtcbiAgICAgICAgdGhpcy5iYWNrQnVmZmVyRm9ybWF0ID0gcHJlZmVycmVkQ2FudmFzRm9ybWF0ID09PSAncmdiYTh1bm9ybScgPyBQSVhFTEZPUk1BVF9SR0JBOCA6IFBJWEVMRk9STUFUX0JHUkE4O1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBDb25maWd1cmF0aW9uIG9mIHRoZSBtYWluIGNvbG9yZnJhbWVidWZmZXIgd2Ugb2J0YWluIHVzaW5nIGdldEN1cnJlbnRUZXh0dXJlXG4gICAgICAgICAqXG4gICAgICAgICAqIEB0eXBlIHtHUFVDYW52YXNDb25maWd1cmF0aW9ufVxuICAgICAgICAgKiBAcHJpdmF0ZVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5jYW52YXNDb25maWcgPSB7XG4gICAgICAgICAgICBkZXZpY2U6IHRoaXMud2dwdSxcbiAgICAgICAgICAgIGNvbG9yU3BhY2U6ICdzcmdiJyxcbiAgICAgICAgICAgIGFscGhhTW9kZTogJ29wYXF1ZScsICAvLyBjb3VsZCBhbHNvIGJlICdwcmVtdWx0aXBsaWVkJ1xuXG4gICAgICAgICAgICAvLyB1c2UgcHJlZmVycmVkIGZvcm1hdCBmb3Igb3B0aW1hbCBwZXJmb3JtYW5jZSBvbiBtb2JpbGVcbiAgICAgICAgICAgIGZvcm1hdDogcHJlZmVycmVkQ2FudmFzRm9ybWF0LFxuXG4gICAgICAgICAgICAvLyBSRU5ERVJfQVRUQUNITUVOVCBpcyByZXF1aXJlZCwgQ09QWV9TUkMgYWxsb3dzIHNjZW5lIGdyYWIgdG8gY29weSBvdXQgZnJvbSBpdFxuICAgICAgICAgICAgdXNhZ2U6IEdQVVRleHR1cmVVc2FnZS5SRU5ERVJfQVRUQUNITUVOVCB8IEdQVVRleHR1cmVVc2FnZS5DT1BZX1NSQyB8IEdQVVRleHR1cmVVc2FnZS5DT1BZX0RTVCxcblxuICAgICAgICAgICAgLy8gZm9ybWF0cyB0aGF0IHZpZXdzIGNyZWF0ZWQgZnJvbSB0ZXh0dXJlcyByZXR1cm5lZCBieSBnZXRDdXJyZW50VGV4dHVyZSBtYXkgdXNlXG4gICAgICAgICAgICB2aWV3Rm9ybWF0czogW11cbiAgICAgICAgfTtcbiAgICAgICAgdGhpcy5ncHVDb250ZXh0LmNvbmZpZ3VyZSh0aGlzLmNhbnZhc0NvbmZpZyk7XG5cbiAgICAgICAgdGhpcy5jcmVhdGVCYWNrYnVmZmVyKCk7XG5cbiAgICAgICAgdGhpcy5jbGVhclJlbmRlcmVyID0gbmV3IFdlYmdwdUNsZWFyUmVuZGVyZXIodGhpcyk7XG4gICAgICAgIHRoaXMubWlwbWFwUmVuZGVyZXIgPSBuZXcgV2ViZ3B1TWlwbWFwUmVuZGVyZXIodGhpcyk7XG4gICAgICAgIHRoaXMucmVzb2x2ZXIgPSBuZXcgV2ViZ3B1UmVzb2x2ZXIodGhpcyk7XG5cbiAgICAgICAgdGhpcy5wb3N0SW5pdCgpO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHBvc3RJbml0KCkge1xuICAgICAgICBzdXBlci5wb3N0SW5pdCgpO1xuXG4gICAgICAgIHRoaXMuZ3B1UHJvZmlsZXIgPSBuZXcgV2ViZ3B1R3B1UHJvZmlsZXIodGhpcyk7XG5cbiAgICAgICAgLy8gaW5pdCBkeW5hbWljIGJ1ZmZlciB1c2luZyAxTUIgYWxsb2NhdGlvblxuICAgICAgICB0aGlzLmR5bmFtaWNCdWZmZXJzID0gbmV3IFdlYmdwdUR5bmFtaWNCdWZmZXJzKHRoaXMsIDEwMjQgKiAxMDI0LCB0aGlzLmxpbWl0cy5taW5Vbmlmb3JtQnVmZmVyT2Zmc2V0QWxpZ25tZW50KTtcbiAgICB9XG5cbiAgICBjcmVhdGVCYWNrYnVmZmVyKCkge1xuICAgICAgICB0aGlzLnN1cHBvcnRzU3RlbmNpbCA9IHRoaXMuaW5pdE9wdGlvbnMuc3RlbmNpbDtcbiAgICAgICAgdGhpcy5iYWNrQnVmZmVyID0gbmV3IFJlbmRlclRhcmdldCh7XG4gICAgICAgICAgICBuYW1lOiAnV2ViZ3B1RnJhbWVidWZmZXInLFxuICAgICAgICAgICAgZ3JhcGhpY3NEZXZpY2U6IHRoaXMsXG4gICAgICAgICAgICBkZXB0aDogdGhpcy5pbml0T3B0aW9ucy5kZXB0aCxcbiAgICAgICAgICAgIHN0ZW5jaWw6IHRoaXMuc3VwcG9ydHNTdGVuY2lsLFxuICAgICAgICAgICAgc2FtcGxlczogdGhpcy5zYW1wbGVzXG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHJlc2l6ZUNhbnZhcyh3aWR0aCwgaGVpZ2h0KSB7XG5cbiAgICAgICAgdGhpcy5fd2lkdGggPSB3aWR0aDtcbiAgICAgICAgdGhpcy5faGVpZ2h0ID0gaGVpZ2h0O1xuXG4gICAgICAgIGlmICh0aGlzLmNhbnZhcy53aWR0aCAhPT0gd2lkdGggfHwgdGhpcy5jYW52YXMuaGVpZ2h0ICE9PSBoZWlnaHQpIHtcbiAgICAgICAgICAgIHRoaXMuY2FudmFzLndpZHRoID0gd2lkdGg7XG4gICAgICAgICAgICB0aGlzLmNhbnZhcy5oZWlnaHQgPSBoZWlnaHQ7XG4gICAgICAgICAgICB0aGlzLmZpcmUoR3JhcGhpY3NEZXZpY2UuRVZFTlRfUkVTSVpFLCB3aWR0aCwgaGVpZ2h0KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZyYW1lU3RhcnQoKSB7XG5cbiAgICAgICAgc3VwZXIuZnJhbWVTdGFydCgpO1xuICAgICAgICB0aGlzLmdwdVByb2ZpbGVyLmZyYW1lU3RhcnQoKTtcblxuICAgICAgICAvLyBzdWJtaXQgYW55IGNvbW1hbmRzIGNvbGxlY3RlZCBiZWZvcmUgdGhlIGZyYW1lIHJlbmRlcmluZ1xuICAgICAgICB0aGlzLnN1Ym1pdCgpO1xuXG4gICAgICAgIFdlYmdwdURlYnVnLm1lbW9yeSh0aGlzKTtcbiAgICAgICAgV2ViZ3B1RGVidWcudmFsaWRhdGUodGhpcyk7XG5cbiAgICAgICAgLy8gY3VycmVudCBmcmFtZSBjb2xvciBvdXRwdXQgYnVmZmVyXG4gICAgICAgIGNvbnN0IG91dENvbG9yQnVmZmVyID0gdGhpcy5ncHVDb250ZXh0LmdldEN1cnJlbnRUZXh0dXJlKCk7XG4gICAgICAgIERlYnVnSGVscGVyLnNldExhYmVsKG91dENvbG9yQnVmZmVyLCBgJHt0aGlzLmJhY2tCdWZmZXIubmFtZX1gKTtcblxuICAgICAgICAvLyByZWFsbG9jYXRlIGZyYW1lYnVmZmVyIGlmIGRpbWVuc2lvbnMgY2hhbmdlLCB0byBtYXRjaCB0aGUgb3V0cHV0IHRleHR1cmVcbiAgICAgICAgaWYgKHRoaXMuYmFja0J1ZmZlclNpemUueCAhPT0gb3V0Q29sb3JCdWZmZXIud2lkdGggfHwgdGhpcy5iYWNrQnVmZmVyU2l6ZS55ICE9PSBvdXRDb2xvckJ1ZmZlci5oZWlnaHQpIHtcblxuICAgICAgICAgICAgdGhpcy5iYWNrQnVmZmVyU2l6ZS5zZXQob3V0Q29sb3JCdWZmZXIud2lkdGgsIG91dENvbG9yQnVmZmVyLmhlaWdodCk7XG5cbiAgICAgICAgICAgIHRoaXMuYmFja0J1ZmZlci5kZXN0cm95KCk7XG4gICAgICAgICAgICB0aGlzLmJhY2tCdWZmZXIgPSBudWxsO1xuXG4gICAgICAgICAgICB0aGlzLmNyZWF0ZUJhY2tidWZmZXIoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHJ0ID0gdGhpcy5iYWNrQnVmZmVyO1xuICAgICAgICBjb25zdCB3cnQgPSBydC5pbXBsO1xuXG4gICAgICAgIC8vIGFzc2lnbiB0aGUgZm9ybWF0LCBhbGxvd2luZyBmb2xsb3dpbmcgaW5pdCBjYWxsIHRvIHVzZSBpdCB0byBhbGxvY2F0ZSBtYXRjaGluZyBtdWx0aXNhbXBsZWQgYnVmZmVyXG4gICAgICAgIHdydC5zZXRDb2xvckF0dGFjaG1lbnQoMCwgdW5kZWZpbmVkLCBvdXRDb2xvckJ1ZmZlci5mb3JtYXQpO1xuXG4gICAgICAgIHRoaXMuaW5pdFJlbmRlclRhcmdldChydCk7XG5cbiAgICAgICAgLy8gYXNzaWduIGN1cnJlbnQgZnJhbWUncyByZW5kZXIgdGV4dHVyZVxuICAgICAgICB3cnQuYXNzaWduQ29sb3JUZXh0dXJlKG91dENvbG9yQnVmZmVyKTtcblxuICAgICAgICBXZWJncHVEZWJ1Zy5lbmQodGhpcyk7XG4gICAgICAgIFdlYmdwdURlYnVnLmVuZCh0aGlzKTtcbiAgICB9XG5cbiAgICBmcmFtZUVuZCgpIHtcbiAgICAgICAgc3VwZXIuZnJhbWVFbmQoKTtcbiAgICAgICAgdGhpcy5ncHVQcm9maWxlci5mcmFtZUVuZCgpO1xuXG4gICAgICAgIC8vIHN1Ym1pdCBzY2hlZHVsZWQgY29tbWFuZCBidWZmZXJzXG4gICAgICAgIHRoaXMuc3VibWl0KCk7XG5cbiAgICAgICAgdGhpcy5ncHVQcm9maWxlci5yZXF1ZXN0KCk7XG4gICAgfVxuXG4gICAgY3JlYXRlVW5pZm9ybUJ1ZmZlckltcGwodW5pZm9ybUJ1ZmZlcikge1xuICAgICAgICByZXR1cm4gbmV3IFdlYmdwdVVuaWZvcm1CdWZmZXIodW5pZm9ybUJ1ZmZlcik7XG4gICAgfVxuXG4gICAgY3JlYXRlVmVydGV4QnVmZmVySW1wbCh2ZXJ0ZXhCdWZmZXIsIGZvcm1hdCkge1xuICAgICAgICByZXR1cm4gbmV3IFdlYmdwdVZlcnRleEJ1ZmZlcih2ZXJ0ZXhCdWZmZXIsIGZvcm1hdCk7XG4gICAgfVxuXG4gICAgY3JlYXRlSW5kZXhCdWZmZXJJbXBsKGluZGV4QnVmZmVyKSB7XG4gICAgICAgIHJldHVybiBuZXcgV2ViZ3B1SW5kZXhCdWZmZXIoaW5kZXhCdWZmZXIpO1xuICAgIH1cblxuICAgIGNyZWF0ZVNoYWRlckltcGwoc2hhZGVyKSB7XG4gICAgICAgIHJldHVybiBuZXcgV2ViZ3B1U2hhZGVyKHNoYWRlcik7XG4gICAgfVxuXG4gICAgY3JlYXRlVGV4dHVyZUltcGwodGV4dHVyZSkge1xuICAgICAgICByZXR1cm4gbmV3IFdlYmdwdVRleHR1cmUodGV4dHVyZSk7XG4gICAgfVxuXG4gICAgY3JlYXRlUmVuZGVyVGFyZ2V0SW1wbChyZW5kZXJUYXJnZXQpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBXZWJncHVSZW5kZXJUYXJnZXQocmVuZGVyVGFyZ2V0KTtcbiAgICB9XG5cbiAgICBjcmVhdGVCaW5kR3JvdXBGb3JtYXRJbXBsKGJpbmRHcm91cEZvcm1hdCkge1xuICAgICAgICByZXR1cm4gbmV3IFdlYmdwdUJpbmRHcm91cEZvcm1hdChiaW5kR3JvdXBGb3JtYXQpO1xuICAgIH1cblxuICAgIGNyZWF0ZUJpbmRHcm91cEltcGwoYmluZEdyb3VwKSB7XG4gICAgICAgIHJldHVybiBuZXcgV2ViZ3B1QmluZEdyb3VwKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGluZGV4IC0gSW5kZXggb2YgdGhlIGJpbmQgZ3JvdXAgc2xvdFxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuLi9iaW5kLWdyb3VwLmpzJykuQmluZEdyb3VwfSBiaW5kR3JvdXAgLSBCaW5kIGdyb3VwIHRvIGF0dGFjaFxuICAgICAqL1xuICAgIHNldEJpbmRHcm91cChpbmRleCwgYmluZEdyb3VwKSB7XG5cbiAgICAgICAgLy8gVE9ETzogdGhpcyBjb25kaXRpb24gc2hvdWxkIGJlIHJlbW92ZWQsIGl0J3MgaGVyZSB0byBoYW5kbGUgZmFrZSBncmFiIHBhc3MsIHdoaWNoIHNob3VsZCBiZSByZWZhY3RvcmVkIGluc3RlYWRcbiAgICAgICAgaWYgKHRoaXMucGFzc0VuY29kZXIpIHtcblxuICAgICAgICAgICAgLy8gc2V0IGl0IG9uIHRoZSBkZXZpY2VcbiAgICAgICAgICAgIHRoaXMucGFzc0VuY29kZXIuc2V0QmluZEdyb3VwKGluZGV4LCBiaW5kR3JvdXAuaW1wbC5iaW5kR3JvdXAsIGJpbmRHcm91cC51bmlmb3JtQnVmZmVyT2Zmc2V0cyk7XG5cbiAgICAgICAgICAgIC8vIHN0b3JlIHRoZSBhY3RpdmUgZm9ybWF0cywgdXNlZCBieSB0aGUgcGlwZWxpbmUgY3JlYXRpb25cbiAgICAgICAgICAgIHRoaXMuYmluZEdyb3VwRm9ybWF0c1tpbmRleF0gPSBiaW5kR3JvdXAuZm9ybWF0LmltcGw7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBzdWJtaXRWZXJ0ZXhCdWZmZXIodmVydGV4QnVmZmVyLCBzbG90KSB7XG5cbiAgICAgICAgY29uc3QgZWxlbWVudHMgPSB2ZXJ0ZXhCdWZmZXIuZm9ybWF0LmVsZW1lbnRzO1xuICAgICAgICBjb25zdCBlbGVtZW50Q291bnQgPSBlbGVtZW50cy5sZW5ndGg7XG4gICAgICAgIGNvbnN0IHZiQnVmZmVyID0gdmVydGV4QnVmZmVyLmltcGwuYnVmZmVyO1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGVsZW1lbnRDb3VudDsgaSsrKSB7XG4gICAgICAgICAgICB0aGlzLnBhc3NFbmNvZGVyLnNldFZlcnRleEJ1ZmZlcihzbG90ICsgaSwgdmJCdWZmZXIsIGVsZW1lbnRzW2ldLm9mZnNldCk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gZWxlbWVudENvdW50O1xuICAgIH1cblxuICAgIGRyYXcocHJpbWl0aXZlLCBudW1JbnN0YW5jZXMgPSAxLCBrZWVwQnVmZmVycykge1xuXG4gICAgICAgIGlmICh0aGlzLnNoYWRlci5yZWFkeSAmJiAhdGhpcy5zaGFkZXIuZmFpbGVkKSB7XG5cbiAgICAgICAgICAgIFdlYmdwdURlYnVnLnZhbGlkYXRlKHRoaXMpO1xuXG4gICAgICAgICAgICBjb25zdCBwYXNzRW5jb2RlciA9IHRoaXMucGFzc0VuY29kZXI7XG4gICAgICAgICAgICBEZWJ1Zy5hc3NlcnQocGFzc0VuY29kZXIpO1xuXG4gICAgICAgICAgICAvLyB2ZXJ0ZXggYnVmZmVyc1xuICAgICAgICAgICAgY29uc3QgdmIwID0gdGhpcy52ZXJ0ZXhCdWZmZXJzWzBdO1xuICAgICAgICAgICAgY29uc3QgdmIxID0gdGhpcy52ZXJ0ZXhCdWZmZXJzWzFdO1xuICAgICAgICAgICAgdGhpcy52ZXJ0ZXhCdWZmZXJzLmxlbmd0aCA9IDA7XG5cbiAgICAgICAgICAgIGlmICh2YjApIHtcbiAgICAgICAgICAgICAgICBjb25zdCB2YlNsb3QgPSB0aGlzLnN1Ym1pdFZlcnRleEJ1ZmZlcih2YjAsIDApO1xuICAgICAgICAgICAgICAgIGlmICh2YjEpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zdWJtaXRWZXJ0ZXhCdWZmZXIodmIxLCB2YlNsb3QpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gcmVuZGVyIHBpcGVsaW5lXG4gICAgICAgICAgICBjb25zdCBwaXBlbGluZSA9IHRoaXMucmVuZGVyUGlwZWxpbmUuZ2V0KHByaW1pdGl2ZSwgdmIwPy5mb3JtYXQsIHZiMT8uZm9ybWF0LCB0aGlzLnNoYWRlciwgdGhpcy5yZW5kZXJUYXJnZXQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuYmluZEdyb3VwRm9ybWF0cywgdGhpcy5ibGVuZFN0YXRlLCB0aGlzLmRlcHRoU3RhdGUsIHRoaXMuY3VsbE1vZGUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc3RlbmNpbEVuYWJsZWQsIHRoaXMuc3RlbmNpbEZyb250LCB0aGlzLnN0ZW5jaWxCYWNrKTtcbiAgICAgICAgICAgIERlYnVnLmFzc2VydChwaXBlbGluZSk7XG5cbiAgICAgICAgICAgIGlmICh0aGlzLnBpcGVsaW5lICE9PSBwaXBlbGluZSkge1xuICAgICAgICAgICAgICAgIHRoaXMucGlwZWxpbmUgPSBwaXBlbGluZTtcbiAgICAgICAgICAgICAgICBwYXNzRW5jb2Rlci5zZXRQaXBlbGluZShwaXBlbGluZSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIGRyYXdcbiAgICAgICAgICAgIGNvbnN0IGliID0gdGhpcy5pbmRleEJ1ZmZlcjtcbiAgICAgICAgICAgIGlmIChpYikge1xuICAgICAgICAgICAgICAgIHRoaXMuaW5kZXhCdWZmZXIgPSBudWxsO1xuICAgICAgICAgICAgICAgIHBhc3NFbmNvZGVyLnNldEluZGV4QnVmZmVyKGliLmltcGwuYnVmZmVyLCBpYi5pbXBsLmZvcm1hdCk7XG4gICAgICAgICAgICAgICAgcGFzc0VuY29kZXIuZHJhd0luZGV4ZWQocHJpbWl0aXZlLmNvdW50LCBudW1JbnN0YW5jZXMsIDAsIDAsIDApO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBwYXNzRW5jb2Rlci5kcmF3KHByaW1pdGl2ZS5jb3VudCwgbnVtSW5zdGFuY2VzLCAwLCAwKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgV2ViZ3B1RGVidWcuZW5kKHRoaXMsIHtcbiAgICAgICAgICAgICAgICB2YjAsXG4gICAgICAgICAgICAgICAgdmIxLFxuICAgICAgICAgICAgICAgIGliLFxuICAgICAgICAgICAgICAgIHByaW1pdGl2ZSxcbiAgICAgICAgICAgICAgICBudW1JbnN0YW5jZXMsXG4gICAgICAgICAgICAgICAgcGlwZWxpbmVcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgc2V0U2hhZGVyKHNoYWRlcikge1xuXG4gICAgICAgIHRoaXMuc2hhZGVyID0gc2hhZGVyO1xuXG4gICAgICAgIC8vICNpZiBfUFJPRklMRVJcbiAgICAgICAgLy8gVE9ETzogd2Ugc2hvdWxkIHByb2JhYmx5IHRyYWNrIG90aGVyIHN0YXRzIGluc3RlYWQsIGxpa2UgcGlwZWxpbmUgc3dpdGNoZXNcbiAgICAgICAgdGhpcy5fc2hhZGVyU3dpdGNoZXNQZXJGcmFtZSsrO1xuICAgICAgICAvLyAjZW5kaWZcblxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICBzZXRCbGVuZFN0YXRlKGJsZW5kU3RhdGUpIHtcbiAgICAgICAgdGhpcy5ibGVuZFN0YXRlLmNvcHkoYmxlbmRTdGF0ZSk7XG4gICAgfVxuXG4gICAgc2V0RGVwdGhTdGF0ZShkZXB0aFN0YXRlKSB7XG4gICAgICAgIHRoaXMuZGVwdGhTdGF0ZS5jb3B5KGRlcHRoU3RhdGUpO1xuICAgIH1cblxuICAgIHNldFN0ZW5jaWxTdGF0ZShzdGVuY2lsRnJvbnQsIHN0ZW5jaWxCYWNrKSB7XG4gICAgICAgIGlmIChzdGVuY2lsRnJvbnQgfHwgc3RlbmNpbEJhY2spIHtcbiAgICAgICAgICAgIHRoaXMuc3RlbmNpbEVuYWJsZWQgPSB0cnVlO1xuICAgICAgICAgICAgdGhpcy5zdGVuY2lsRnJvbnQuY29weShzdGVuY2lsRnJvbnQgPz8gU3RlbmNpbFBhcmFtZXRlcnMuREVGQVVMVCk7XG4gICAgICAgICAgICB0aGlzLnN0ZW5jaWxCYWNrLmNvcHkoc3RlbmNpbEJhY2sgPz8gU3RlbmNpbFBhcmFtZXRlcnMuREVGQVVMVCk7XG5cbiAgICAgICAgICAgIC8vIHJlZiB2YWx1ZSAtIGJhc2VkIG9uIHN0ZW5jaWwgZnJvbnRcbiAgICAgICAgICAgIGNvbnN0IHJlZiA9IHRoaXMuc3RlbmNpbEZyb250LnJlZjtcbiAgICAgICAgICAgIGlmICh0aGlzLnN0ZW5jaWxSZWYgIT09IHJlZikge1xuICAgICAgICAgICAgICAgIHRoaXMuc3RlbmNpbFJlZiA9IHJlZjtcbiAgICAgICAgICAgICAgICB0aGlzLnBhc3NFbmNvZGVyLnNldFN0ZW5jaWxSZWZlcmVuY2UocmVmKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuc3RlbmNpbEVuYWJsZWQgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHNldEJsZW5kQ29sb3IociwgZywgYiwgYSkge1xuICAgICAgICAvLyBUT0RPOiB0aGlzIHNob3VsZCB1c2UgcGFzc0VuY29kZXIuc2V0QmxlbmRDb25zdGFudChjb2xvcilcbiAgICAgICAgLy8gc2ltaWxhciBpbXBsZW1lbnRhdGlvbiB0byB0aGlzLnN0ZW5jaWxSZWZcbiAgICB9XG5cbiAgICBzZXRDdWxsTW9kZShjdWxsTW9kZSkge1xuICAgICAgICB0aGlzLmN1bGxNb2RlID0gY3VsbE1vZGU7XG4gICAgfVxuXG4gICAgc2V0QWxwaGFUb0NvdmVyYWdlKHN0YXRlKSB7XG4gICAgfVxuXG4gICAgaW5pdGlhbGl6ZUNvbnRleHRDYWNoZXMoKSB7XG4gICAgICAgIHN1cGVyLmluaXRpYWxpemVDb250ZXh0Q2FjaGVzKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0IHVwIGRlZmF1bHQgdmFsdWVzIGZvciB0aGUgcmVuZGVyIHBhc3MgZW5jb2Rlci5cbiAgICAgKi9cbiAgICBzZXR1cFBhc3NFbmNvZGVyRGVmYXVsdHMoKSB7XG4gICAgICAgIHRoaXMuc3RlbmNpbFJlZiA9IDA7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU3RhcnQgYSByZW5kZXIgcGFzcy5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuLi9yZW5kZXItcGFzcy5qcycpLlJlbmRlclBhc3N9IHJlbmRlclBhc3MgLSBUaGUgcmVuZGVyIHBhc3MgdG8gc3RhcnQuXG4gICAgICogQGlnbm9yZVxuICAgICAqL1xuICAgIHN0YXJ0UGFzcyhyZW5kZXJQYXNzKSB7XG5cbiAgICAgICAgV2ViZ3B1RGVidWcuaW50ZXJuYWwodGhpcyk7XG4gICAgICAgIFdlYmdwdURlYnVnLnZhbGlkYXRlKHRoaXMpO1xuXG4gICAgICAgIGNvbnN0IHJ0ID0gcmVuZGVyUGFzcy5yZW5kZXJUYXJnZXQgfHwgdGhpcy5iYWNrQnVmZmVyO1xuICAgICAgICB0aGlzLnJlbmRlclRhcmdldCA9IHJ0O1xuICAgICAgICBEZWJ1Zy5hc3NlcnQocnQpO1xuXG4gICAgICAgIC8qKiBAdHlwZSB7V2ViZ3B1UmVuZGVyVGFyZ2V0fSAqL1xuICAgICAgICBjb25zdCB3cnQgPSBydC5pbXBsO1xuXG4gICAgICAgIC8vIGNyZWF0ZSBhIG5ldyBlbmNvZGVyIGZvciBlYWNoIHBhc3NcbiAgICAgICAgdGhpcy5jb21tYW5kRW5jb2RlciA9IHRoaXMud2dwdS5jcmVhdGVDb21tYW5kRW5jb2RlcigpO1xuICAgICAgICBEZWJ1Z0hlbHBlci5zZXRMYWJlbCh0aGlzLmNvbW1hbmRFbmNvZGVyLCBgJHtyZW5kZXJQYXNzLm5hbWV9LUVuY29kZXJgKTtcblxuICAgICAgICAvLyBmcmFtZWJ1ZmZlciBpcyBpbml0aWFsaXplZCBhdCB0aGUgc3RhcnQgb2YgdGhlIGZyYW1lXG4gICAgICAgIGlmIChydCAhPT0gdGhpcy5iYWNrQnVmZmVyKSB7XG4gICAgICAgICAgICB0aGlzLmluaXRSZW5kZXJUYXJnZXQocnQpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gc2V0IHVwIGNsZWFyIC8gc3RvcmUgLyBsb2FkIHNldHRpbmdzXG4gICAgICAgIHdydC5zZXR1cEZvclJlbmRlclBhc3MocmVuZGVyUGFzcyk7XG5cbiAgICAgICAgLy8gY2xlYXIgY2FjaGVkIGVuY29kZXIgc3RhdGVcbiAgICAgICAgdGhpcy5waXBlbGluZSA9IG51bGw7XG5cbiAgICAgICAgY29uc3QgcmVuZGVyUGFzc0Rlc2MgPSB3cnQucmVuZGVyUGFzc0Rlc2NyaXB0b3I7XG5cbiAgICAgICAgLy8gdGltZXN0YW1wXG4gICAgICAgIGlmICh0aGlzLmdwdVByb2ZpbGVyLl9lbmFibGVkKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5ncHVQcm9maWxlci50aW1lc3RhbXBRdWVyaWVzU2V0KSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgc2xvdCA9IHRoaXMuZ3B1UHJvZmlsZXIuZ2V0U2xvdChyZW5kZXJQYXNzLm5hbWUpO1xuXG4gICAgICAgICAgICAgICAgcmVuZGVyUGFzc0Rlc2MudGltZXN0YW1wV3JpdGVzID0ge1xuICAgICAgICAgICAgICAgICAgICBxdWVyeVNldDogdGhpcy5ncHVQcm9maWxlci50aW1lc3RhbXBRdWVyaWVzU2V0LnF1ZXJ5U2V0LFxuICAgICAgICAgICAgICAgICAgICBiZWdpbm5pbmdPZlBhc3NXcml0ZUluZGV4OiBzbG90ICogMixcbiAgICAgICAgICAgICAgICAgICAgZW5kT2ZQYXNzV3JpdGVJbmRleDogc2xvdCAqIDIgKyAxXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHN0YXJ0IHRoZSBwYXNzXG4gICAgICAgIHRoaXMucGFzc0VuY29kZXIgPSB0aGlzLmNvbW1hbmRFbmNvZGVyLmJlZ2luUmVuZGVyUGFzcyhyZW5kZXJQYXNzRGVzYyk7XG4gICAgICAgIERlYnVnSGVscGVyLnNldExhYmVsKHRoaXMucGFzc0VuY29kZXIsIHJlbmRlclBhc3MubmFtZSk7XG5cbiAgICAgICAgdGhpcy5zZXR1cFBhc3NFbmNvZGVyRGVmYXVsdHMoKTtcblxuICAgICAgICAvLyB0aGUgcGFzcyBhbHdheXMgY2xlYXJzIGZ1bGwgdGFyZ2V0XG4gICAgICAgIC8vIFRPRE86IGF2b2lkIHRoaXMgc2V0dGluZyB0aGUgYWN0dWFsIHZpZXdwb3J0L3NjaXNzb3Igb24gd2ViZ3B1IGFzIHRob3NlIGFyZSBhdXRvbWF0aWNhbGx5IHJlc2V0IHRvIGZ1bGxcbiAgICAgICAgLy8gcmVuZGVyIHRhcmdldC4gV2UganVzdCBuZWVkIHRvIHVwZGF0ZSBpbnRlcm5hbCBzdGF0ZSwgZm9yIHRoZSBnZXQgZnVuY3Rpb25hbGl0eSB0byByZXR1cm4gaXQuXG4gICAgICAgIGNvbnN0IHsgd2lkdGgsIGhlaWdodCB9ID0gcnQ7XG4gICAgICAgIHRoaXMuc2V0Vmlld3BvcnQoMCwgMCwgd2lkdGgsIGhlaWdodCk7XG4gICAgICAgIHRoaXMuc2V0U2Npc3NvcigwLCAwLCB3aWR0aCwgaGVpZ2h0KTtcblxuICAgICAgICBEZWJ1Zy5hc3NlcnQoIXRoaXMuaW5zaWRlUmVuZGVyUGFzcywgJ1JlbmRlclBhc3MgY2Fubm90IGJlIHN0YXJ0ZWQgd2hpbGUgaW5zaWRlIGFub3RoZXIgcmVuZGVyIHBhc3MuJyk7XG4gICAgICAgIHRoaXMuaW5zaWRlUmVuZGVyUGFzcyA9IHRydWU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRW5kIGEgcmVuZGVyIHBhc3MuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi4vcmVuZGVyLXBhc3MuanMnKS5SZW5kZXJQYXNzfSByZW5kZXJQYXNzIC0gVGhlIHJlbmRlciBwYXNzIHRvIGVuZC5cbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgZW5kUGFzcyhyZW5kZXJQYXNzKSB7XG5cbiAgICAgICAgLy8gZW5kIHRoZSByZW5kZXIgcGFzc1xuICAgICAgICB0aGlzLnBhc3NFbmNvZGVyLmVuZCgpO1xuICAgICAgICB0aGlzLnBhc3NFbmNvZGVyID0gbnVsbDtcbiAgICAgICAgdGhpcy5pbnNpZGVSZW5kZXJQYXNzID0gZmFsc2U7XG5cbiAgICAgICAgLy8gZWFjaCByZW5kZXIgcGFzcyBjYW4gdXNlIGRpZmZlcmVudCBudW1iZXIgb2YgYmluZCBncm91cHNcbiAgICAgICAgdGhpcy5iaW5kR3JvdXBGb3JtYXRzLmxlbmd0aCA9IDA7XG5cbiAgICAgICAgLy8gZ2VuZXJhdGUgbWlwbWFwcyB1c2luZyB0aGUgc2FtZSBjb21tYW5kIGJ1ZmZlciBlbmNvZGVyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcmVuZGVyUGFzcy5jb2xvckFycmF5T3BzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBjb2xvck9wcyA9IHJlbmRlclBhc3MuY29sb3JBcnJheU9wc1tpXTtcbiAgICAgICAgICAgIGlmIChjb2xvck9wcy5taXBtYXBzKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5taXBtYXBSZW5kZXJlci5nZW5lcmF0ZShyZW5kZXJQYXNzLnJlbmRlclRhcmdldC5fY29sb3JCdWZmZXJzW2ldLmltcGwpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gc2NoZWR1bGUgY29tbWFuZCBidWZmZXIgc3VibWlzc2lvblxuICAgICAgICBjb25zdCBjYiA9IHRoaXMuY29tbWFuZEVuY29kZXIuZmluaXNoKCk7XG4gICAgICAgIERlYnVnSGVscGVyLnNldExhYmVsKGNiLCBgJHtyZW5kZXJQYXNzLm5hbWV9LUNvbW1hbmRCdWZmZXJgKTtcblxuICAgICAgICB0aGlzLmFkZENvbW1hbmRCdWZmZXIoY2IpO1xuICAgICAgICB0aGlzLmNvbW1hbmRFbmNvZGVyID0gbnVsbDtcblxuICAgICAgICBXZWJncHVEZWJ1Zy5lbmQodGhpcywgeyByZW5kZXJQYXNzIH0pO1xuICAgICAgICBXZWJncHVEZWJ1Zy5lbmQodGhpcywgeyByZW5kZXJQYXNzIH0pO1xuICAgIH1cblxuICAgIGFkZENvbW1hbmRCdWZmZXIoY29tbWFuZEJ1ZmZlciwgZnJvbnQgPSBmYWxzZSkge1xuICAgICAgICBpZiAoZnJvbnQpIHtcbiAgICAgICAgICAgIHRoaXMuY29tbWFuZEJ1ZmZlcnMudW5zaGlmdChjb21tYW5kQnVmZmVyKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuY29tbWFuZEJ1ZmZlcnMucHVzaChjb21tYW5kQnVmZmVyKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHN1Ym1pdCgpIHtcbiAgICAgICAgaWYgKHRoaXMuY29tbWFuZEJ1ZmZlcnMubGVuZ3RoID4gMCkge1xuXG4gICAgICAgICAgICAvLyBjb3B5IGR5bmFtaWMgYnVmZmVycyBkYXRhIHRvIHRoZSBHUFUgKHRoaXMgc2NoZWR1bGVzIHRoZSBjb3B5IENCIHRvIHJ1biBiZWZvcmUgYWxsIG90aGVyIENCcylcbiAgICAgICAgICAgIHRoaXMuZHluYW1pY0J1ZmZlcnMuc3VibWl0KCk7XG5cbiAgICAgICAgICAgIC8vIHRyYWNlIGFsbCBzY2hlZHVsZWQgY29tbWFuZCBidWZmZXJzXG4gICAgICAgICAgICBEZWJ1Zy5jYWxsKCgpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5jb21tYW5kQnVmZmVycy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIERlYnVnLnRyYWNlKFRSQUNFSURfUkVOREVSX1FVRVVFLCBgU1VCTUlUICgke3RoaXMuY29tbWFuZEJ1ZmZlcnMubGVuZ3RofSlgKTtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLmNvbW1hbmRCdWZmZXJzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBEZWJ1Zy50cmFjZShUUkFDRUlEX1JFTkRFUl9RVUVVRSwgYCAgQ0I6ICR7dGhpcy5jb21tYW5kQnVmZmVyc1tpXS5sYWJlbH1gKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICB0aGlzLndncHUucXVldWUuc3VibWl0KHRoaXMuY29tbWFuZEJ1ZmZlcnMpO1xuICAgICAgICAgICAgdGhpcy5jb21tYW5kQnVmZmVycy5sZW5ndGggPSAwO1xuXG4gICAgICAgICAgICAvLyBub3RpZnkgZHluYW1pYyBidWZmZXJzXG4gICAgICAgICAgICB0aGlzLmR5bmFtaWNCdWZmZXJzLm9uQ29tbWFuZEJ1ZmZlcnNTdWJtaXR0ZWQoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGNsZWFyKG9wdGlvbnMpIHtcbiAgICAgICAgaWYgKG9wdGlvbnMuZmxhZ3MpIHtcbiAgICAgICAgICAgIHRoaXMuY2xlYXJSZW5kZXJlci5jbGVhcih0aGlzLCB0aGlzLnJlbmRlclRhcmdldCwgb3B0aW9ucywgdGhpcy5kZWZhdWx0Q2xlYXJPcHRpb25zKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGdldCB3aWR0aCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3dpZHRoO1xuICAgIH1cblxuICAgIGdldCBoZWlnaHQoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9oZWlnaHQ7XG4gICAgfVxuXG4gICAgc2V0RGVwdGhCaWFzKG9uKSB7XG4gICAgfVxuXG4gICAgc2V0RGVwdGhCaWFzVmFsdWVzKGNvbnN0Qmlhcywgc2xvcGVCaWFzKSB7XG4gICAgfVxuXG4gICAgc2V0Vmlld3BvcnQoeCwgeSwgdywgaCkge1xuICAgICAgICAvLyBUT0RPOiBvbmx5IGV4ZWN1dGUgd2hlbiBpdCBjaGFuZ2VzLiBBbHNvLCB0aGUgdmlld3BvcnQgb2YgZW5jb2RlciAgbWF0Y2hlcyB0aGUgcmVuZGVyaW5nIGF0dGFjaG1lbnRzLFxuICAgICAgICAvLyBzbyB3ZSBjYW4gc2tpcCB0aGlzIGlmIGZ1bGxzY3JlZW5cbiAgICAgICAgLy8gVE9ETzogdGhpcyBjb25kaXRpb24gc2hvdWxkIGJlIHJlbW92ZWQsIGl0J3MgaGVyZSB0byBoYW5kbGUgZmFrZSBncmFiIHBhc3MsIHdoaWNoIHNob3VsZCBiZSByZWZhY3RvcmVkIGluc3RlYWRcbiAgICAgICAgaWYgKHRoaXMucGFzc0VuY29kZXIpIHtcblxuICAgICAgICAgICAgaWYgKCF0aGlzLnJlbmRlclRhcmdldC5mbGlwWSkge1xuICAgICAgICAgICAgICAgIHkgPSB0aGlzLnJlbmRlclRhcmdldC5oZWlnaHQgLSB5IC0gaDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy52eCA9IHg7XG4gICAgICAgICAgICB0aGlzLnZ5ID0geTtcbiAgICAgICAgICAgIHRoaXMudncgPSB3O1xuICAgICAgICAgICAgdGhpcy52aCA9IGg7XG5cbiAgICAgICAgICAgIHRoaXMucGFzc0VuY29kZXIuc2V0Vmlld3BvcnQoeCwgeSwgdywgaCwgMCwgMSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBzZXRTY2lzc29yKHgsIHksIHcsIGgpIHtcbiAgICAgICAgLy8gVE9ETzogb25seSBleGVjdXRlIHdoZW4gaXQgY2hhbmdlcy4gQWxzbywgdGhlIHZpZXdwb3J0IG9mIGVuY29kZXIgIG1hdGNoZXMgdGhlIHJlbmRlcmluZyBhdHRhY2htZW50cyxcbiAgICAgICAgLy8gc28gd2UgY2FuIHNraXAgdGhpcyBpZiBmdWxsc2NyZWVuXG4gICAgICAgIC8vIFRPRE86IHRoaXMgY29uZGl0aW9uIHNob3VsZCBiZSByZW1vdmVkLCBpdCdzIGhlcmUgdG8gaGFuZGxlIGZha2UgZ3JhYiBwYXNzLCB3aGljaCBzaG91bGQgYmUgcmVmYWN0b3JlZCBpbnN0ZWFkXG4gICAgICAgIGlmICh0aGlzLnBhc3NFbmNvZGVyKSB7XG5cbiAgICAgICAgICAgIGlmICghdGhpcy5yZW5kZXJUYXJnZXQuZmxpcFkpIHtcbiAgICAgICAgICAgICAgICB5ID0gdGhpcy5yZW5kZXJUYXJnZXQuaGVpZ2h0IC0geSAtIGg7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuc3ggPSB4O1xuICAgICAgICAgICAgdGhpcy5zeSA9IHk7XG4gICAgICAgICAgICB0aGlzLnN3ID0gdztcbiAgICAgICAgICAgIHRoaXMuc2ggPSBoO1xuXG4gICAgICAgICAgICB0aGlzLnBhc3NFbmNvZGVyLnNldFNjaXNzb3JSZWN0KHgsIHksIHcsIGgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ29waWVzIHNvdXJjZSByZW5kZXIgdGFyZ2V0IGludG8gZGVzdGluYXRpb24gcmVuZGVyIHRhcmdldC4gTW9zdGx5IHVzZWQgYnkgcG9zdC1lZmZlY3RzLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtSZW5kZXJUYXJnZXR9IFtzb3VyY2VdIC0gVGhlIHNvdXJjZSByZW5kZXIgdGFyZ2V0LiBEZWZhdWx0cyB0byBmcmFtZSBidWZmZXIuXG4gICAgICogQHBhcmFtIHtSZW5kZXJUYXJnZXR9IFtkZXN0XSAtIFRoZSBkZXN0aW5hdGlvbiByZW5kZXIgdGFyZ2V0LiBEZWZhdWx0cyB0byBmcmFtZSBidWZmZXIuXG4gICAgICogQHBhcmFtIHtib29sZWFufSBbY29sb3JdIC0gSWYgdHJ1ZSB3aWxsIGNvcHkgdGhlIGNvbG9yIGJ1ZmZlci4gRGVmYXVsdHMgdG8gZmFsc2UuXG4gICAgICogQHBhcmFtIHtib29sZWFufSBbZGVwdGhdIC0gSWYgdHJ1ZSB3aWxsIGNvcHkgdGhlIGRlcHRoIGJ1ZmZlci4gRGVmYXVsdHMgdG8gZmFsc2UuXG4gICAgICogQHJldHVybnMge2Jvb2xlYW59IFRydWUgaWYgdGhlIGNvcHkgd2FzIHN1Y2Nlc3NmdWwsIGZhbHNlIG90aGVyd2lzZS5cbiAgICAgKi9cbiAgICBjb3B5UmVuZGVyVGFyZ2V0KHNvdXJjZSwgZGVzdCwgY29sb3IsIGRlcHRoKSB7XG5cbiAgICAgICAgLyoqIEB0eXBlIHtHUFVFeHRlbnQzRH0gKi9cbiAgICAgICAgY29uc3QgY29weVNpemUgPSB7XG4gICAgICAgICAgICB3aWR0aDogc291cmNlID8gc291cmNlLndpZHRoIDogZGVzdC53aWR0aCxcbiAgICAgICAgICAgIGhlaWdodDogc291cmNlID8gc291cmNlLmhlaWdodCA6IGRlc3QuaGVpZ2h0LFxuICAgICAgICAgICAgZGVwdGhPckFycmF5TGF5ZXJzOiAxXG4gICAgICAgIH07XG5cbiAgICAgICAgLy8gdXNlIGV4aXN0aW5nIG9yIGNyZWF0ZSBuZXcgZW5jb2RlciBpZiBub3QgaW4gYSByZW5kZXIgcGFzc1xuICAgICAgICBjb25zdCBjb21tYW5kRW5jb2RlciA9IHRoaXMuY29tbWFuZEVuY29kZXIgPz8gdGhpcy53Z3B1LmNyZWF0ZUNvbW1hbmRFbmNvZGVyKCk7XG4gICAgICAgIERlYnVnSGVscGVyLnNldExhYmVsKGNvbW1hbmRFbmNvZGVyLCAnQ29weVJlbmRlclRhcmdldC1FbmNvZGVyJyk7XG5cbiAgICAgICAgRGVidWdHcmFwaGljcy5wdXNoR3B1TWFya2VyKHRoaXMsICdDT1BZLVJUJyk7XG5cbiAgICAgICAgaWYgKGNvbG9yKSB7XG5cbiAgICAgICAgICAgIC8vIHJlYWQgZnJvbSBzdXBwbGllZCByZW5kZXIgdGFyZ2V0LCBvciBmcm9tIHRoZSBmcmFtZWJ1ZmZlclxuICAgICAgICAgICAgLyoqIEB0eXBlIHtHUFVJbWFnZUNvcHlUZXh0dXJlfSAqL1xuICAgICAgICAgICAgY29uc3QgY29weVNyYyA9IHtcbiAgICAgICAgICAgICAgICB0ZXh0dXJlOiBzb3VyY2UgPyBzb3VyY2UuY29sb3JCdWZmZXIuaW1wbC5ncHVUZXh0dXJlIDogdGhpcy5yZW5kZXJUYXJnZXQuaW1wbC5hc3NpZ25lZENvbG9yVGV4dHVyZSxcbiAgICAgICAgICAgICAgICBtaXBMZXZlbDogMFxuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgLy8gd3JpdGUgdG8gc3VwcGxpZWQgcmVuZGVyIHRhcmdldCwgb3IgdG8gdGhlIGZyYW1lYnVmZmVyXG4gICAgICAgICAgICAvKiogQHR5cGUge0dQVUltYWdlQ29weVRleHR1cmV9ICovXG4gICAgICAgICAgICBjb25zdCBjb3B5RHN0ID0ge1xuICAgICAgICAgICAgICAgIHRleHR1cmU6IGRlc3QgPyBkZXN0LmNvbG9yQnVmZmVyLmltcGwuZ3B1VGV4dHVyZSA6IHRoaXMucmVuZGVyVGFyZ2V0LmltcGwuYXNzaWduZWRDb2xvclRleHR1cmUsXG4gICAgICAgICAgICAgICAgbWlwTGV2ZWw6IDBcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIERlYnVnLmFzc2VydChjb3B5U3JjLnRleHR1cmUgIT09IG51bGwgJiYgY29weURzdC50ZXh0dXJlICE9PSBudWxsKTtcbiAgICAgICAgICAgIGNvbW1hbmRFbmNvZGVyLmNvcHlUZXh0dXJlVG9UZXh0dXJlKGNvcHlTcmMsIGNvcHlEc3QsIGNvcHlTaXplKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChkZXB0aCkge1xuXG4gICAgICAgICAgICAvLyByZWFkIGZyb20gc3VwcGxpZWQgcmVuZGVyIHRhcmdldCwgb3IgZnJvbSB0aGUgZnJhbWVidWZmZXJcbiAgICAgICAgICAgIGNvbnN0IHNvdXJjZVJUID0gc291cmNlID8gc291cmNlIDogdGhpcy5yZW5kZXJUYXJnZXQ7XG4gICAgICAgICAgICBjb25zdCBzb3VyY2VUZXh0dXJlID0gc291cmNlUlQuaW1wbC5kZXB0aFRleHR1cmU7XG5cbiAgICAgICAgICAgIGlmIChzb3VyY2Uuc2FtcGxlcyA+IDEpIHtcblxuICAgICAgICAgICAgICAgIC8vIHJlc29sdmUgdGhlIGRlcHRoIHRvIGEgY29sb3IgYnVmZmVyIG9mIGRlc3RpbmF0aW9uIHJlbmRlciB0YXJnZXRcbiAgICAgICAgICAgICAgICBjb25zdCBkZXN0VGV4dHVyZSA9IGRlc3QuY29sb3JCdWZmZXIuaW1wbC5ncHVUZXh0dXJlO1xuICAgICAgICAgICAgICAgIHRoaXMucmVzb2x2ZXIucmVzb2x2ZURlcHRoKGNvbW1hbmRFbmNvZGVyLCBzb3VyY2VUZXh0dXJlLCBkZXN0VGV4dHVyZSk7XG5cbiAgICAgICAgICAgIH0gZWxzZSB7XG5cbiAgICAgICAgICAgICAgICAvLyB3cml0ZSB0byBzdXBwbGllZCByZW5kZXIgdGFyZ2V0LCBvciB0byB0aGUgZnJhbWVidWZmZXJcbiAgICAgICAgICAgICAgICBjb25zdCBkZXN0VGV4dHVyZSA9IGRlc3QgPyBkZXN0LmRlcHRoQnVmZmVyLmltcGwuZ3B1VGV4dHVyZSA6IHRoaXMucmVuZGVyVGFyZ2V0LmltcGwuZGVwdGhUZXh0dXJlO1xuXG4gICAgICAgICAgICAgICAgLyoqIEB0eXBlIHtHUFVJbWFnZUNvcHlUZXh0dXJlfSAqL1xuICAgICAgICAgICAgICAgIGNvbnN0IGNvcHlTcmMgPSB7XG4gICAgICAgICAgICAgICAgICAgIHRleHR1cmU6IHNvdXJjZVRleHR1cmUsXG4gICAgICAgICAgICAgICAgICAgIG1pcExldmVsOiAwXG4gICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICAgIC8qKiBAdHlwZSB7R1BVSW1hZ2VDb3B5VGV4dHVyZX0gKi9cbiAgICAgICAgICAgICAgICBjb25zdCBjb3B5RHN0ID0ge1xuICAgICAgICAgICAgICAgICAgICB0ZXh0dXJlOiBkZXN0VGV4dHVyZSxcbiAgICAgICAgICAgICAgICAgICAgbWlwTGV2ZWw6IDBcbiAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgICAgRGVidWcuYXNzZXJ0KGNvcHlTcmMudGV4dHVyZSAhPT0gbnVsbCAmJiBjb3B5RHN0LnRleHR1cmUgIT09IG51bGwpO1xuICAgICAgICAgICAgICAgIGNvbW1hbmRFbmNvZGVyLmNvcHlUZXh0dXJlVG9UZXh0dXJlKGNvcHlTcmMsIGNvcHlEc3QsIGNvcHlTaXplKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIERlYnVnR3JhcGhpY3MucG9wR3B1TWFya2VyKHRoaXMpO1xuXG4gICAgICAgIC8vIGlmIHdlIGNyZWF0ZWQgdGhlIGVuY29kZXJcbiAgICAgICAgaWYgKCF0aGlzLmNvbW1hbmRFbmNvZGVyKSB7XG5cbiAgICAgICAgICAgIC8vIGNvcHkgb3BlcmF0aW9uIHJ1bnMgbmV4dFxuICAgICAgICAgICAgY29uc3QgY2IgPSBjb21tYW5kRW5jb2Rlci5maW5pc2goKTtcbiAgICAgICAgICAgIERlYnVnSGVscGVyLnNldExhYmVsKGNiLCAnQ29weVJlbmRlclRhcmdldC1Db21tYW5kQnVmZmVyJyk7XG4gICAgICAgICAgICB0aGlzLmFkZENvbW1hbmRCdWZmZXIoY2IpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgLy8gI2lmIF9ERUJVR1xuICAgIHB1c2hNYXJrZXIobmFtZSkge1xuICAgICAgICB0aGlzLnBhc3NFbmNvZGVyPy5wdXNoRGVidWdHcm91cChuYW1lKTtcbiAgICB9XG5cbiAgICBwb3BNYXJrZXIoKSB7XG4gICAgICAgIHRoaXMucGFzc0VuY29kZXI/LnBvcERlYnVnR3JvdXAoKTtcbiAgICB9XG4gICAgLy8gI2VuZGlmXG59XG5cbmV4cG9ydCB7IFdlYmdwdUdyYXBoaWNzRGV2aWNlIH07XG4iXSwibmFtZXMiOlsiV2ViZ3B1R3JhcGhpY3NEZXZpY2UiLCJHcmFwaGljc0RldmljZSIsImNvbnN0cnVjdG9yIiwiY2FudmFzIiwib3B0aW9ucyIsInJlbmRlclBpcGVsaW5lIiwiV2ViZ3B1UmVuZGVyUGlwZWxpbmUiLCJjbGVhclJlbmRlcmVyIiwibWlwbWFwUmVuZGVyZXIiLCJwaXBlbGluZSIsImJpbmRHcm91cEZvcm1hdHMiLCJjb21tYW5kRW5jb2RlciIsImNvbW1hbmRCdWZmZXJzIiwibGltaXRzIiwiaW5pdE9wdGlvbnMiLCJpc1dlYkdQVSIsIl9kZXZpY2VUeXBlIiwiREVWSUNFVFlQRV9XRUJHUFUiLCJzYW1wbGVzIiwiYW50aWFsaWFzIiwic2V0dXBQYXNzRW5jb2RlckRlZmF1bHRzIiwiZGVzdHJveSIsInJlc29sdmVyIiwiaW5pdERldmljZUNhcHMiLCJkaXNhYmxlUGFydGljbGVTeXN0ZW0iLCJncHVBZGFwdGVyIiwicHJlY2lzaW9uIiwibWF4UHJlY2lzaW9uIiwibWF4U2FtcGxlcyIsIm1heFRleHR1cmVzIiwibWF4VGV4dHVyZVNpemUiLCJtYXhUZXh0dXJlRGltZW5zaW9uMkQiLCJtYXhDdWJlTWFwU2l6ZSIsIm1heFZvbHVtZVNpemUiLCJtYXhUZXh0dXJlRGltZW5zaW9uM0QiLCJtYXhDb2xvckF0dGFjaG1lbnRzIiwibWF4UGl4ZWxSYXRpbyIsIm1heEFuaXNvdHJvcHkiLCJzdXBwb3J0c0luc3RhbmNpbmciLCJzdXBwb3J0c1VuaWZvcm1CdWZmZXJzIiwic3VwcG9ydHNWb2x1bWVUZXh0dXJlcyIsInN1cHBvcnRzQm9uZVRleHR1cmVzIiwic3VwcG9ydHNNb3JwaFRhcmdldFRleHR1cmVzQ29yZSIsInN1cHBvcnRzQXJlYUxpZ2h0cyIsInN1cHBvcnRzRGVwdGhTaGFkb3ciLCJzdXBwb3J0c0dwdVBhcnRpY2xlcyIsInN1cHBvcnRzTXJ0IiwiZXh0VWludEVsZW1lbnQiLCJleHRUZXh0dXJlRmxvYXQiLCJ0ZXh0dXJlRmxvYXRSZW5kZXJhYmxlIiwiZXh0VGV4dHVyZUhhbGZGbG9hdCIsInRleHR1cmVIYWxmRmxvYXRSZW5kZXJhYmxlIiwidGV4dHVyZUhhbGZGbG9hdFVwZGF0YWJsZSIsImJvbmVMaW1pdCIsInN1cHBvcnRzSW1hZ2VCaXRtYXAiLCJleHRTdGFuZGFyZERlcml2YXRpdmVzIiwiZXh0QmxlbmRNaW5tYXgiLCJhcmVhTGlnaHRMdXRGb3JtYXQiLCJmbG9hdEZpbHRlcmFibGUiLCJQSVhFTEZPUk1BVF9SR0JBMzJGIiwiUElYRUxGT1JNQVRfUkdCQTgiLCJzdXBwb3J0c1RleHR1cmVGZXRjaCIsImluaXRXZWJHcHUiLCJnbHNsYW5nVXJsIiwidHdnc2xVcmwiLCJ3aW5kb3ciLCJuYXZpZ2F0b3IiLCJncHUiLCJFcnJvciIsIkRlYnVnIiwibG9nIiwibG9hZFNjcmlwdCIsInVybCIsIlByb21pc2UiLCJyZXNvbHZlIiwicmVqZWN0Iiwic2NyaXB0IiwiZG9jdW1lbnQiLCJjcmVhdGVFbGVtZW50Iiwic3JjIiwiYXN5bmMiLCJvbmxvYWQiLCJvbmVycm9yIiwiYm9keSIsImFwcGVuZENoaWxkIiwiZ2xzbGFuZyIsIndhc21QYXRoIiwicmVwbGFjZSIsInR3Z3NsIiwiYWRhcHRlck9wdGlvbnMiLCJwb3dlclByZWZlcmVuY2UiLCJ1bmRlZmluZWQiLCJyZXF1ZXN0QWRhcHRlciIsInJlcXVpcmVkRmVhdHVyZXMiLCJyZXF1aXJlRmVhdHVyZSIsImZlYXR1cmUiLCJzdXBwb3J0ZWQiLCJmZWF0dXJlcyIsImhhcyIsInB1c2giLCJleHRDb21wcmVzc2VkVGV4dHVyZVMzVEMiLCJleHRDb21wcmVzc2VkVGV4dHVyZUVUQyIsImV4dENvbXByZXNzZWRUZXh0dXJlQVNUQyIsInN1cHBvcnRzVGltZXN0YW1wUXVlcnkiLCJqb2luIiwiZGV2aWNlRGVzY3IiLCJyZXF1aXJlZExpbWl0cyIsImRlZmF1bHRRdWV1ZSIsImxhYmVsIiwid2dwdSIsInJlcXVlc3REZXZpY2UiLCJzZXRSZXNvbHV0aW9uIiwiaW5uZXJXaWR0aCIsImlubmVySGVpZ2h0IiwiZ3B1Q29udGV4dCIsImdldENvbnRleHQiLCJwcmVmZXJyZWRDYW52YXNGb3JtYXQiLCJnZXRQcmVmZXJyZWRDYW52YXNGb3JtYXQiLCJiYWNrQnVmZmVyRm9ybWF0IiwiUElYRUxGT1JNQVRfQkdSQTgiLCJjYW52YXNDb25maWciLCJkZXZpY2UiLCJjb2xvclNwYWNlIiwiYWxwaGFNb2RlIiwiZm9ybWF0IiwidXNhZ2UiLCJHUFVUZXh0dXJlVXNhZ2UiLCJSRU5ERVJfQVRUQUNITUVOVCIsIkNPUFlfU1JDIiwiQ09QWV9EU1QiLCJ2aWV3Rm9ybWF0cyIsImNvbmZpZ3VyZSIsImNyZWF0ZUJhY2tidWZmZXIiLCJXZWJncHVDbGVhclJlbmRlcmVyIiwiV2ViZ3B1TWlwbWFwUmVuZGVyZXIiLCJXZWJncHVSZXNvbHZlciIsInBvc3RJbml0IiwiZ3B1UHJvZmlsZXIiLCJXZWJncHVHcHVQcm9maWxlciIsImR5bmFtaWNCdWZmZXJzIiwiV2ViZ3B1RHluYW1pY0J1ZmZlcnMiLCJtaW5Vbmlmb3JtQnVmZmVyT2Zmc2V0QWxpZ25tZW50Iiwic3VwcG9ydHNTdGVuY2lsIiwic3RlbmNpbCIsImJhY2tCdWZmZXIiLCJSZW5kZXJUYXJnZXQiLCJuYW1lIiwiZ3JhcGhpY3NEZXZpY2UiLCJkZXB0aCIsInJlc2l6ZUNhbnZhcyIsIndpZHRoIiwiaGVpZ2h0IiwiX3dpZHRoIiwiX2hlaWdodCIsImZpcmUiLCJFVkVOVF9SRVNJWkUiLCJmcmFtZVN0YXJ0Iiwic3VibWl0IiwiV2ViZ3B1RGVidWciLCJtZW1vcnkiLCJ2YWxpZGF0ZSIsIm91dENvbG9yQnVmZmVyIiwiZ2V0Q3VycmVudFRleHR1cmUiLCJEZWJ1Z0hlbHBlciIsInNldExhYmVsIiwiYmFja0J1ZmZlclNpemUiLCJ4IiwieSIsInNldCIsInJ0Iiwid3J0IiwiaW1wbCIsInNldENvbG9yQXR0YWNobWVudCIsImluaXRSZW5kZXJUYXJnZXQiLCJhc3NpZ25Db2xvclRleHR1cmUiLCJlbmQiLCJmcmFtZUVuZCIsInJlcXVlc3QiLCJjcmVhdGVVbmlmb3JtQnVmZmVySW1wbCIsInVuaWZvcm1CdWZmZXIiLCJXZWJncHVVbmlmb3JtQnVmZmVyIiwiY3JlYXRlVmVydGV4QnVmZmVySW1wbCIsInZlcnRleEJ1ZmZlciIsIldlYmdwdVZlcnRleEJ1ZmZlciIsImNyZWF0ZUluZGV4QnVmZmVySW1wbCIsImluZGV4QnVmZmVyIiwiV2ViZ3B1SW5kZXhCdWZmZXIiLCJjcmVhdGVTaGFkZXJJbXBsIiwic2hhZGVyIiwiV2ViZ3B1U2hhZGVyIiwiY3JlYXRlVGV4dHVyZUltcGwiLCJ0ZXh0dXJlIiwiV2ViZ3B1VGV4dHVyZSIsImNyZWF0ZVJlbmRlclRhcmdldEltcGwiLCJyZW5kZXJUYXJnZXQiLCJXZWJncHVSZW5kZXJUYXJnZXQiLCJjcmVhdGVCaW5kR3JvdXBGb3JtYXRJbXBsIiwiYmluZEdyb3VwRm9ybWF0IiwiV2ViZ3B1QmluZEdyb3VwRm9ybWF0IiwiY3JlYXRlQmluZEdyb3VwSW1wbCIsImJpbmRHcm91cCIsIldlYmdwdUJpbmRHcm91cCIsInNldEJpbmRHcm91cCIsImluZGV4IiwicGFzc0VuY29kZXIiLCJ1bmlmb3JtQnVmZmVyT2Zmc2V0cyIsInN1Ym1pdFZlcnRleEJ1ZmZlciIsInNsb3QiLCJlbGVtZW50cyIsImVsZW1lbnRDb3VudCIsImxlbmd0aCIsInZiQnVmZmVyIiwiYnVmZmVyIiwiaSIsInNldFZlcnRleEJ1ZmZlciIsIm9mZnNldCIsImRyYXciLCJwcmltaXRpdmUiLCJudW1JbnN0YW5jZXMiLCJrZWVwQnVmZmVycyIsInJlYWR5IiwiZmFpbGVkIiwiYXNzZXJ0IiwidmIwIiwidmVydGV4QnVmZmVycyIsInZiMSIsInZiU2xvdCIsImdldCIsImJsZW5kU3RhdGUiLCJkZXB0aFN0YXRlIiwiY3VsbE1vZGUiLCJzdGVuY2lsRW5hYmxlZCIsInN0ZW5jaWxGcm9udCIsInN0ZW5jaWxCYWNrIiwic2V0UGlwZWxpbmUiLCJpYiIsInNldEluZGV4QnVmZmVyIiwiZHJhd0luZGV4ZWQiLCJjb3VudCIsInNldFNoYWRlciIsIl9zaGFkZXJTd2l0Y2hlc1BlckZyYW1lIiwic2V0QmxlbmRTdGF0ZSIsImNvcHkiLCJzZXREZXB0aFN0YXRlIiwic2V0U3RlbmNpbFN0YXRlIiwiU3RlbmNpbFBhcmFtZXRlcnMiLCJERUZBVUxUIiwicmVmIiwic3RlbmNpbFJlZiIsInNldFN0ZW5jaWxSZWZlcmVuY2UiLCJzZXRCbGVuZENvbG9yIiwiciIsImciLCJiIiwiYSIsInNldEN1bGxNb2RlIiwic2V0QWxwaGFUb0NvdmVyYWdlIiwic3RhdGUiLCJpbml0aWFsaXplQ29udGV4dENhY2hlcyIsInN0YXJ0UGFzcyIsInJlbmRlclBhc3MiLCJpbnRlcm5hbCIsImNyZWF0ZUNvbW1hbmRFbmNvZGVyIiwic2V0dXBGb3JSZW5kZXJQYXNzIiwicmVuZGVyUGFzc0Rlc2MiLCJyZW5kZXJQYXNzRGVzY3JpcHRvciIsIl9lbmFibGVkIiwidGltZXN0YW1wUXVlcmllc1NldCIsImdldFNsb3QiLCJ0aW1lc3RhbXBXcml0ZXMiLCJxdWVyeVNldCIsImJlZ2lubmluZ09mUGFzc1dyaXRlSW5kZXgiLCJlbmRPZlBhc3NXcml0ZUluZGV4IiwiYmVnaW5SZW5kZXJQYXNzIiwic2V0Vmlld3BvcnQiLCJzZXRTY2lzc29yIiwiaW5zaWRlUmVuZGVyUGFzcyIsImVuZFBhc3MiLCJjb2xvckFycmF5T3BzIiwiY29sb3JPcHMiLCJtaXBtYXBzIiwiZ2VuZXJhdGUiLCJfY29sb3JCdWZmZXJzIiwiY2IiLCJmaW5pc2giLCJhZGRDb21tYW5kQnVmZmVyIiwiY29tbWFuZEJ1ZmZlciIsImZyb250IiwidW5zaGlmdCIsImNhbGwiLCJ0cmFjZSIsIlRSQUNFSURfUkVOREVSX1FVRVVFIiwicXVldWUiLCJvbkNvbW1hbmRCdWZmZXJzU3VibWl0dGVkIiwiY2xlYXIiLCJmbGFncyIsImRlZmF1bHRDbGVhck9wdGlvbnMiLCJzZXREZXB0aEJpYXMiLCJvbiIsInNldERlcHRoQmlhc1ZhbHVlcyIsImNvbnN0QmlhcyIsInNsb3BlQmlhcyIsInciLCJoIiwiZmxpcFkiLCJ2eCIsInZ5IiwidnciLCJ2aCIsInN4Iiwic3kiLCJzdyIsInNoIiwic2V0U2Npc3NvclJlY3QiLCJjb3B5UmVuZGVyVGFyZ2V0Iiwic291cmNlIiwiZGVzdCIsImNvbG9yIiwiX3RoaXMkY29tbWFuZEVuY29kZXIiLCJjb3B5U2l6ZSIsImRlcHRoT3JBcnJheUxheWVycyIsIkRlYnVnR3JhcGhpY3MiLCJwdXNoR3B1TWFya2VyIiwiY29weVNyYyIsImNvbG9yQnVmZmVyIiwiZ3B1VGV4dHVyZSIsImFzc2lnbmVkQ29sb3JUZXh0dXJlIiwibWlwTGV2ZWwiLCJjb3B5RHN0IiwiY29weVRleHR1cmVUb1RleHR1cmUiLCJzb3VyY2VSVCIsInNvdXJjZVRleHR1cmUiLCJkZXB0aFRleHR1cmUiLCJkZXN0VGV4dHVyZSIsInJlc29sdmVEZXB0aCIsImRlcHRoQnVmZmVyIiwicG9wR3B1TWFya2VyIiwicHVzaE1hcmtlciIsIl90aGlzJHBhc3NFbmNvZGVyIiwicHVzaERlYnVnR3JvdXAiLCJwb3BNYXJrZXIiLCJfdGhpcyRwYXNzRW5jb2RlcjIiLCJwb3BEZWJ1Z0dyb3VwIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQTJCQSxNQUFNQSxvQkFBb0IsU0FBU0MsY0FBYyxDQUFDO0FBeUQ5Q0MsRUFBQUEsV0FBV0EsQ0FBQ0MsTUFBTSxFQUFFQyxPQUFPLEdBQUcsRUFBRSxFQUFFO0FBQzlCLElBQUEsS0FBSyxDQUFDRCxNQUFNLEVBQUVDLE9BQU8sQ0FBQyxDQUFBO0FBekQxQjtBQUNKO0FBQ0E7QUFGSSxJQUFBLElBQUEsQ0FHQUMsY0FBYyxHQUFHLElBQUlDLG9CQUFvQixDQUFDLElBQUksQ0FBQyxDQUFBO0FBRS9DO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFKSSxJQUFBLElBQUEsQ0FLQUMsYUFBYSxHQUFBLEtBQUEsQ0FBQSxDQUFBO0FBRWI7QUFDSjtBQUNB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
