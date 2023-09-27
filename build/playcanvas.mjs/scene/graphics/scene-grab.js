import { Debug } from '../../core/debug.js';
import { FILTER_NEAREST, FILTER_LINEAR_MIPMAP_LINEAR, FILTER_LINEAR, ADDRESS_CLAMP_TO_EDGE, PIXELFORMAT_RGBA8, PIXELFORMAT_DEPTHSTENCIL, PIXELFORMAT_R32F } from '../../platform/graphics/constants.js';
import { RenderTarget } from '../../platform/graphics/render-target.js';
import { Texture } from '../../platform/graphics/texture.js';
import { BlendState } from '../../platform/graphics/blend-state.js';
import { DebugGraphics } from '../../platform/graphics/debug-graphics.js';
import { LAYERID_DEPTH, SHADER_DEPTH, LAYERID_WORLD } from '../constants.js';
import { Layer } from '../layer.js';

// uniform names (first is current name, second one is deprecated name for compatibility)
const _depthUniformNames = ['uSceneDepthMap', 'uDepthMap'];
const _colorUniformNames = ['uSceneColorMap', 'texture_grabPass'];

/**
 * Internal class abstracting the access to the depth and color texture of the scene.
 * color frame buffer is copied to a texture
 * For webgl 2 devices, the depth buffer is copied to a texture
 * for webgl 1 devices, the scene's depth is rendered to a separate RGBA texture
 *
 * TODO: implement mipmapped color buffer support for WebGL 1 as well, which requires
 * the texture to be a power of two, by first downscaling the captured framebuffer
 * texture to smaller power of 2 texture, and then generate mipmaps and use it for rendering
 * TODO: or even better, implement blur filter to have smoother lower levels
 *
 * @ignore
 */
class SceneGrab {
  /**
   * Create an instance of SceneGrab.
   *
   * @param {import('../../platform/graphics/graphics-device.js').GraphicsDevice} device - The
   * graphics device.
   * @param {import('../scene.js').Scene} scene - The scene.
   */
  constructor(device, scene) {
    Debug.assert(scene);
    this.scene = scene;
    Debug.assert(device);
    this.device = device;

    // create depth layer
    this.layer = null;

    // null device does not support scene grab
    if (this.device.isNull) {
      this.layer = new Layer({
        enabled: false,
        name: "Depth",
        id: LAYERID_DEPTH
      });
      return;
    }

    // create a depth layer, which is a default depth layer, but also a template used
    // to patch application created depth layers to behave as one
    if (this.device.webgl2 || this.device.isWebGPU) {
      this.initMainPath();
    } else {
      this.initFallbackPath();
    }
  }

  /**
   * Returns true if the camera rendering scene grab textures requires a render pass to do it.
   *
   * @param {import('../../platform/graphics/graphics-device.js').GraphicsDevice} device - The
   * graphics device used for rendering.
   * @param {import('../../framework/components/camera/component.js').CameraComponent} camera - The camera that
   * needs scene grab textures.
   */
  static requiresRenderPass(device, camera) {
    // just copy out the textures, no render pass needed
    if (device.webgl2 || device.isWebGPU) {
      return false;
    }

    // on WebGL1 device, only depth rendering needs render pass
    return camera.renderSceneDepthMap;
  }
  setupUniform(device, depth, buffer) {
    // assign it to scopes to expose it to shaders
    const names = depth ? _depthUniformNames : _colorUniformNames;
    names.forEach(name => device.scope.resolve(name).setValue(buffer));
  }
  allocateTexture(device, source, name, format, isDepth, mipmaps) {
    // allocate texture that will store the depth
    return new Texture(device, {
      name,
      format,
      width: source ? source.colorBuffer.width : device.width,
      height: source ? source.colorBuffer.height : device.height,
      mipmaps,
      minFilter: isDepth ? FILTER_NEAREST : mipmaps ? FILTER_LINEAR_MIPMAP_LINEAR : FILTER_LINEAR,
      magFilter: isDepth ? FILTER_NEAREST : FILTER_LINEAR,
      addressU: ADDRESS_CLAMP_TO_EDGE,
      addressV: ADDRESS_CLAMP_TO_EDGE
    });
  }

  // texture format of the source texture the grab pass needs to copy
  getSourceColorFormat(texture) {
    var _texture$format;
    // based on the RT the camera renders to, otherwise framebuffer
    return (_texture$format = texture == null ? void 0 : texture.format) != null ? _texture$format : this.device.backBufferFormat;
  }
  shouldReallocate(targetRT, sourceTexture, testFormat) {
    // need to reallocate if format does not match
    if (testFormat) {
      const targetFormat = targetRT == null ? void 0 : targetRT.colorBuffer.format;
      const sourceFormat = this.getSourceColorFormat(sourceTexture);
      if (targetFormat !== sourceFormat) return true;
    }

    // need to reallocate if dimensions don't match
    const width = (sourceTexture == null ? void 0 : sourceTexture.width) || this.device.width;
    const height = (sourceTexture == null ? void 0 : sourceTexture.height) || this.device.height;
    return !targetRT || width !== targetRT.width || height !== targetRT.height;
  }
  allocateRenderTarget(renderTarget, sourceRenderTarget, device, format, isDepth, mipmaps, isDepthUniforms) {
    // texture / uniform names: new one (first), as well as old one  (second) for compatibility
    const names = isDepthUniforms ? _depthUniformNames : _colorUniformNames;

    // allocate texture buffer
    const buffer = this.allocateTexture(device, sourceRenderTarget, names[0], format, isDepth, mipmaps);
    if (renderTarget) {
      // if reallocating RT size, release previous framebuffer
      renderTarget.destroyFrameBuffers();

      // assign new texture
      if (isDepth) {
        renderTarget._depthBuffer = buffer;
      } else {
        renderTarget._colorBuffer = buffer;
        renderTarget._colorBuffers = [buffer];
      }
    } else {
      // create new render target with the texture
      renderTarget = new RenderTarget({
        name: 'renderTargetSceneGrab',
        colorBuffer: isDepth ? null : buffer,
        depthBuffer: isDepth ? buffer : null,
        depth: !isDepth,
        stencil: device.supportsStencil,
        autoResolve: false
      });
    }
    return renderTarget;
  }
  releaseRenderTarget(rt) {
    if (rt) {
      rt.destroyTextureBuffers();
      rt.destroy();
    }
  }

  // main path where both color and depth is copied from existing surface
  initMainPath() {
    const device = this.device;
    const self = this;

    // WebGL 2 depth layer just copies existing color or depth
    this.layer = new Layer({
      enabled: false,
      name: "Depth",
      id: LAYERID_DEPTH,
      onDisable: function () {
        self.releaseRenderTarget(this.depthRenderTarget);
        this.depthRenderTarget = null;
        self.releaseRenderTarget(this.colorRenderTarget);
        this.colorRenderTarget = null;
      },
      onPreRenderOpaque: function (cameraPass) {
        // resize depth map if needed

        /** @type {import('../../framework/components/camera/component.js').CameraComponent} */
        const camera = this.cameras[cameraPass];
        if (camera.renderSceneColorMap) {
          var _camera$renderTarget;
          // allocate / resize existing RT as needed
          if (self.shouldReallocate(this.colorRenderTarget, (_camera$renderTarget = camera.renderTarget) == null ? void 0 : _camera$renderTarget.colorBuffer, true)) {
            var _camera$renderTarget2;
            self.releaseRenderTarget(this.colorRenderTarget);
            const format = self.getSourceColorFormat((_camera$renderTarget2 = camera.renderTarget) == null ? void 0 : _camera$renderTarget2.colorBuffer);
            this.colorRenderTarget = self.allocateRenderTarget(this.colorRenderTarget, camera.renderTarget, device, format, false, true, false);
          }

          // copy color from the current render target
          DebugGraphics.pushGpuMarker(device, 'GRAB-COLOR');
          const colorBuffer = this.colorRenderTarget.colorBuffer;
          if (device.isWebGPU) {
            device.copyRenderTarget(camera.renderTarget, this.colorRenderTarget, true, false);

            // generate mipmaps
            device.mipmapRenderer.generate(this.colorRenderTarget.colorBuffer.impl);
          } else {
            device.copyRenderTarget(device.renderTarget, this.colorRenderTarget, true, false);

            // generate mipmaps
            device.activeTexture(device.maxCombinedTextures - 1);
            device.bindTexture(colorBuffer);
            device.gl.generateMipmap(colorBuffer.impl._glTarget);
          }
          DebugGraphics.popGpuMarker(device);

          // assign unifrom
          self.setupUniform(device, false, colorBuffer);
        }
        if (camera.renderSceneDepthMap) {
          var _camera$renderTarget4;
          let useDepthBuffer = true;
          let format = PIXELFORMAT_DEPTHSTENCIL;
          if (device.isWebGPU) {
            var _camera$renderTarget$, _camera$renderTarget3;
            const numSamples = (_camera$renderTarget$ = (_camera$renderTarget3 = camera.renderTarget) == null ? void 0 : _camera$renderTarget3.samples) != null ? _camera$renderTarget$ : device.samples;

            // when depth buffer is multi-sampled, instead of copying it out, we use custom shader to resolve it
            // to a R32F texture, used as a color attachment of the render target
            if (numSamples > 1) {
              format = PIXELFORMAT_R32F;
              useDepthBuffer = false;
            }
          }

          // reallocate RT if needed
          if (self.shouldReallocate(this.depthRenderTarget, (_camera$renderTarget4 = camera.renderTarget) == null ? void 0 : _camera$renderTarget4.depthBuffer)) {
            self.releaseRenderTarget(this.depthRenderTarget);
            this.depthRenderTarget = self.allocateRenderTarget(this.depthRenderTarget, camera.renderTarget, device, format, useDepthBuffer, false, true);
          }

          // WebGL2 multisampling depth handling: we resolve multi-sampled depth buffer to a single-sampled destination buffer.
          // We could use existing API and resolve depth first and then blit it to destination, but this avoids the extra copy.
          if (device.webgl2 && device.renderTarget.samples > 1) {
            // multi-sampled buffer
            const src = device.renderTarget.impl._glFrameBuffer;

            // single sampled destination buffer
            const dest = this.depthRenderTarget;
            device.renderTarget = dest;
            device.updateBegin();
            this.depthRenderTarget.impl.internalResolve(device, src, dest.impl._glFrameBuffer, this.depthRenderTarget, device.gl.DEPTH_BUFFER_BIT);
          } else {
            // copy depth
            DebugGraphics.pushGpuMarker(device, 'GRAB-DEPTH');
            device.copyRenderTarget(device.renderTarget, this.depthRenderTarget, false, true);
            DebugGraphics.popGpuMarker(device);
          }

          // assign uniform
          self.setupUniform(device, true, useDepthBuffer ? this.depthRenderTarget.depthBuffer : this.depthRenderTarget.colorBuffer);
        }
      },
      onPostRenderOpaque: function (cameraPass) {}
    });
  }

  // fallback path, where copy is not possible and the scene gets re-rendered
  initFallbackPath() {
    const self = this;
    const device = this.device;
    const scene = this.scene;

    // WebGL 1 depth layer renders the same objects as in World, but with RGBA-encoded depth shader to get depth
    this.layer = new Layer({
      enabled: false,
      name: "Depth",
      id: LAYERID_DEPTH,
      shaderPass: SHADER_DEPTH,
      onEnable: function () {
        // create RT without textures, those will be created as needed later
        this.depthRenderTarget = new RenderTarget({
          name: 'depthRenderTarget-webgl1',
          depth: true,
          stencil: device.supportsStencil,
          autoResolve: false,
          graphicsDevice: device
        });

        // assign it so the render actions knows to render to it
        // TODO: avoid this as this API is deprecated
        this.renderTarget = this.depthRenderTarget;
      },
      onDisable: function () {
        // only release depth texture, but not the render target itself
        this.depthRenderTarget.destroyTextureBuffers();
        this.renderTarget = null;
        self.releaseRenderTarget(this.colorRenderTarget);
        this.colorRenderTarget = null;
      },
      onPostCull: function (cameraPass) {
        /** @type {import('../../framework/components/camera/component.js').CameraComponent} */
        const camera = this.cameras[cameraPass];
        if (camera.renderSceneDepthMap) {
          var _this$depthRenderTarg, _camera$renderTarget5;
          // reallocate RT if needed
          if (!((_this$depthRenderTarg = this.depthRenderTarget) != null && _this$depthRenderTarg.colorBuffer) || self.shouldReallocate(this.depthRenderTarget, (_camera$renderTarget5 = camera.renderTarget) == null ? void 0 : _camera$renderTarget5.depthBuffer)) {
            var _this$depthRenderTarg2;
            (_this$depthRenderTarg2 = this.depthRenderTarget) == null ? void 0 : _this$depthRenderTarg2.destroyTextureBuffers();
            this.depthRenderTarget = self.allocateRenderTarget(this.depthRenderTarget, camera.renderTarget, device, PIXELFORMAT_RGBA8, false, false, true);

            // assign it so the render actions knows to render to it
            // TODO: avoid this as this API is deprecated
            this.renderTarget = this.depthRenderTarget;
          }

          // Collect all rendered mesh instances on the layers prior to the depth layer.
          // Store them in a visible list of instances on the depth layer.
          const culledDepthInstances = this.getCulledInstances(camera.camera);
          const depthOpaque = culledDepthInstances.opaque;
          depthOpaque.length = 0;
          const layerComposition = scene.layers;
          const subLayerEnabled = layerComposition.subLayerEnabled;
          const isTransparent = layerComposition.subLayerList;

          // can't use self.defaultLayerWorld.renderTarget because projects that use the editor override default layers
          const rt = layerComposition.getLayerById(LAYERID_WORLD).renderTarget;
          const layers = layerComposition.layerList;
          for (let i = 0; i < layers.length; i++) {
            const layer = layers[i];

            // only use the layers before the depth layer
            if (layer === this) break;
            if (layer.renderTarget !== rt || !layer.enabled || !subLayerEnabled[i]) continue;
            if (layer.cameras.indexOf(camera) < 0) continue;

            // visible instances for the camera for the layer
            const transparent = isTransparent[i];
            const layerCulledInstances = layer.getCulledInstances(camera.camera);
            const layerMeshInstances = transparent ? layerCulledInstances.transparent : layerCulledInstances.opaque;

            // copy them to a visible list of the depth layer
            const count = layerMeshInstances.length;
            for (let j = 0; j < count; j++) {
              var _drawCall$material;
              const drawCall = layerMeshInstances[j];

              // only collect meshes that update the depth
              if ((_drawCall$material = drawCall.material) != null && _drawCall$material.depthWrite && !drawCall._noDepthDrawGl1) {
                depthOpaque.push(drawCall);
              }
            }
          }
        }
      },
      onPreRenderOpaque: function (cameraPass) {
        /** @type {import('../../framework/components/camera/component.js').CameraComponent} */
        const camera = this.cameras[cameraPass];
        if (camera.renderSceneColorMap) {
          var _camera$renderTarget6;
          // reallocate RT if needed
          if (self.shouldReallocate(this.colorRenderTarget, (_camera$renderTarget6 = camera.renderTarget) == null ? void 0 : _camera$renderTarget6.colorBuffer)) {
            var _camera$renderTarget7;
            self.releaseRenderTarget(this.colorRenderTarget);
            const format = self.getSourceColorFormat((_camera$renderTarget7 = camera.renderTarget) == null ? void 0 : _camera$renderTarget7.colorBuffer);
            this.colorRenderTarget = self.allocateRenderTarget(this.colorRenderTarget, camera.renderTarget, device, format, false, false, false);
          }

          // copy out the color buffer
          DebugGraphics.pushGpuMarker(device, 'GRAB-COLOR');

          // initialize the texture
          const colorBuffer = this.colorRenderTarget._colorBuffer;
          if (!colorBuffer.impl._glTexture) {
            colorBuffer.impl.initialize(device, colorBuffer);
          }

          // copy framebuffer to it
          device.bindTexture(colorBuffer);
          const gl = device.gl;
          gl.copyTexImage2D(gl.TEXTURE_2D, 0, colorBuffer.impl._glFormat, 0, 0, colorBuffer.width, colorBuffer.height, 0);

          // stop the device from updating this texture further
          colorBuffer._needsUpload = false;
          colorBuffer._needsMipmapsUpload = false;
          DebugGraphics.popGpuMarker(device);

          // assign unifrom
          self.setupUniform(device, false, colorBuffer);
        }
        if (camera.renderSceneDepthMap) {
          // assign unifrom
          self.setupUniform(device, true, this.depthRenderTarget.colorBuffer);
        }
      },
      onDrawCall: function () {
        // writing depth to color render target, force no blending and writing to all channels
        device.setBlendState(BlendState.NOBLEND);
      },
      onPostRenderOpaque: function (cameraPass) {
        /** @type {import('../../framework/components/camera/component.js').CameraComponent} */
        const camera = this.cameras[cameraPass];
        if (camera.renderSceneDepthMap) {
          // just clear the list of visible objects to avoid keeping references
          const culledDepthInstances = this.getCulledInstances(camera.camera);
          culledDepthInstances.opaque.length = 0;
        }
      }
    });
  }

  // function which patches a layer to use depth layer set up in this class
  patch(layer) {
    layer.onEnable = this.layer.onEnable;
    layer.onDisable = this.layer.onDisable;
    layer.onPreRenderOpaque = this.layer.onPreRenderOpaque;
    layer.onPostRenderOpaque = this.layer.onPostRenderOpaque;
    layer.shaderPass = this.layer.shaderPass;
    layer.onPostCull = this.layer.onPostCull;
    layer.onDrawCall = this.layer.onDrawCall;
  }
}

export { SceneGrab };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NlbmUtZ3JhYi5qcyIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL3NjZW5lL2dyYXBoaWNzL3NjZW5lLWdyYWIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgRGVidWcgfSBmcm9tICcuLi8uLi9jb3JlL2RlYnVnLmpzJztcblxuaW1wb3J0IHtcbiAgICBBRERSRVNTX0NMQU1QX1RPX0VER0UsXG4gICAgRklMVEVSX05FQVJFU1QsIEZJTFRFUl9MSU5FQVIsIEZJTFRFUl9MSU5FQVJfTUlQTUFQX0xJTkVBUixcbiAgICBQSVhFTEZPUk1BVF9ERVBUSFNURU5DSUwsIFBJWEVMRk9STUFUX1IzMkYsIFBJWEVMRk9STUFUX1JHQkE4XG59IGZyb20gJy4uLy4uL3BsYXRmb3JtL2dyYXBoaWNzL2NvbnN0YW50cy5qcyc7XG5cbmltcG9ydCB7IFJlbmRlclRhcmdldCB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2dyYXBoaWNzL3JlbmRlci10YXJnZXQuanMnO1xuaW1wb3J0IHsgVGV4dHVyZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2dyYXBoaWNzL3RleHR1cmUuanMnO1xuaW1wb3J0IHsgQmxlbmRTdGF0ZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2dyYXBoaWNzL2JsZW5kLXN0YXRlLmpzJztcbmltcG9ydCB7IERlYnVnR3JhcGhpY3MgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9ncmFwaGljcy9kZWJ1Zy1ncmFwaGljcy5qcyc7XG5cbmltcG9ydCB7XG4gICAgTEFZRVJJRF9ERVBUSCwgTEFZRVJJRF9XT1JMRCxcbiAgICBTSEFERVJfREVQVEhcbn0gZnJvbSAnLi4vY29uc3RhbnRzLmpzJztcblxuaW1wb3J0IHsgTGF5ZXIgfSBmcm9tICcuLi9sYXllci5qcyc7XG5cbi8vIHVuaWZvcm0gbmFtZXMgKGZpcnN0IGlzIGN1cnJlbnQgbmFtZSwgc2Vjb25kIG9uZSBpcyBkZXByZWNhdGVkIG5hbWUgZm9yIGNvbXBhdGliaWxpdHkpXG5jb25zdCBfZGVwdGhVbmlmb3JtTmFtZXMgPSBbJ3VTY2VuZURlcHRoTWFwJywgJ3VEZXB0aE1hcCddO1xuY29uc3QgX2NvbG9yVW5pZm9ybU5hbWVzID0gWyd1U2NlbmVDb2xvck1hcCcsICd0ZXh0dXJlX2dyYWJQYXNzJ107XG5cbi8qKlxuICogSW50ZXJuYWwgY2xhc3MgYWJzdHJhY3RpbmcgdGhlIGFjY2VzcyB0byB0aGUgZGVwdGggYW5kIGNvbG9yIHRleHR1cmUgb2YgdGhlIHNjZW5lLlxuICogY29sb3IgZnJhbWUgYnVmZmVyIGlzIGNvcGllZCB0byBhIHRleHR1cmVcbiAqIEZvciB3ZWJnbCAyIGRldmljZXMsIHRoZSBkZXB0aCBidWZmZXIgaXMgY29waWVkIHRvIGEgdGV4dHVyZVxuICogZm9yIHdlYmdsIDEgZGV2aWNlcywgdGhlIHNjZW5lJ3MgZGVwdGggaXMgcmVuZGVyZWQgdG8gYSBzZXBhcmF0ZSBSR0JBIHRleHR1cmVcbiAqXG4gKiBUT0RPOiBpbXBsZW1lbnQgbWlwbWFwcGVkIGNvbG9yIGJ1ZmZlciBzdXBwb3J0IGZvciBXZWJHTCAxIGFzIHdlbGwsIHdoaWNoIHJlcXVpcmVzXG4gKiB0aGUgdGV4dHVyZSB0byBiZSBhIHBvd2VyIG9mIHR3bywgYnkgZmlyc3QgZG93bnNjYWxpbmcgdGhlIGNhcHR1cmVkIGZyYW1lYnVmZmVyXG4gKiB0ZXh0dXJlIHRvIHNtYWxsZXIgcG93ZXIgb2YgMiB0ZXh0dXJlLCBhbmQgdGhlbiBnZW5lcmF0ZSBtaXBtYXBzIGFuZCB1c2UgaXQgZm9yIHJlbmRlcmluZ1xuICogVE9ETzogb3IgZXZlbiBiZXR0ZXIsIGltcGxlbWVudCBibHVyIGZpbHRlciB0byBoYXZlIHNtb290aGVyIGxvd2VyIGxldmVsc1xuICpcbiAqIEBpZ25vcmVcbiAqL1xuY2xhc3MgU2NlbmVHcmFiIHtcbiAgICAvKipcbiAgICAgKiBDcmVhdGUgYW4gaW5zdGFuY2Ugb2YgU2NlbmVHcmFiLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4uLy4uL3BsYXRmb3JtL2dyYXBoaWNzL2dyYXBoaWNzLWRldmljZS5qcycpLkdyYXBoaWNzRGV2aWNlfSBkZXZpY2UgLSBUaGVcbiAgICAgKiBncmFwaGljcyBkZXZpY2UuXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4uL3NjZW5lLmpzJykuU2NlbmV9IHNjZW5lIC0gVGhlIHNjZW5lLlxuICAgICAqL1xuICAgIGNvbnN0cnVjdG9yKGRldmljZSwgc2NlbmUpIHtcblxuICAgICAgICBEZWJ1Zy5hc3NlcnQoc2NlbmUpO1xuICAgICAgICB0aGlzLnNjZW5lID0gc2NlbmU7XG5cbiAgICAgICAgRGVidWcuYXNzZXJ0KGRldmljZSk7XG4gICAgICAgIHRoaXMuZGV2aWNlID0gZGV2aWNlO1xuXG4gICAgICAgIC8vIGNyZWF0ZSBkZXB0aCBsYXllclxuICAgICAgICB0aGlzLmxheWVyID0gbnVsbDtcblxuICAgICAgICAvLyBudWxsIGRldmljZSBkb2VzIG5vdCBzdXBwb3J0IHNjZW5lIGdyYWJcbiAgICAgICAgaWYgKHRoaXMuZGV2aWNlLmlzTnVsbCkge1xuXG4gICAgICAgICAgICB0aGlzLmxheWVyID0gbmV3IExheWVyKHtcbiAgICAgICAgICAgICAgICBlbmFibGVkOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBuYW1lOiBcIkRlcHRoXCIsXG4gICAgICAgICAgICAgICAgaWQ6IExBWUVSSURfREVQVEhcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBjcmVhdGUgYSBkZXB0aCBsYXllciwgd2hpY2ggaXMgYSBkZWZhdWx0IGRlcHRoIGxheWVyLCBidXQgYWxzbyBhIHRlbXBsYXRlIHVzZWRcbiAgICAgICAgLy8gdG8gcGF0Y2ggYXBwbGljYXRpb24gY3JlYXRlZCBkZXB0aCBsYXllcnMgdG8gYmVoYXZlIGFzIG9uZVxuICAgICAgICBpZiAodGhpcy5kZXZpY2Uud2ViZ2wyIHx8IHRoaXMuZGV2aWNlLmlzV2ViR1BVKSB7XG4gICAgICAgICAgICB0aGlzLmluaXRNYWluUGF0aCgpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5pbml0RmFsbGJhY2tQYXRoKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRydWUgaWYgdGhlIGNhbWVyYSByZW5kZXJpbmcgc2NlbmUgZ3JhYiB0ZXh0dXJlcyByZXF1aXJlcyBhIHJlbmRlciBwYXNzIHRvIGRvIGl0LlxuICAgICAqXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4uLy4uL3BsYXRmb3JtL2dyYXBoaWNzL2dyYXBoaWNzLWRldmljZS5qcycpLkdyYXBoaWNzRGV2aWNlfSBkZXZpY2UgLSBUaGVcbiAgICAgKiBncmFwaGljcyBkZXZpY2UgdXNlZCBmb3IgcmVuZGVyaW5nLlxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuLi8uLi9mcmFtZXdvcmsvY29tcG9uZW50cy9jYW1lcmEvY29tcG9uZW50LmpzJykuQ2FtZXJhQ29tcG9uZW50fSBjYW1lcmEgLSBUaGUgY2FtZXJhIHRoYXRcbiAgICAgKiBuZWVkcyBzY2VuZSBncmFiIHRleHR1cmVzLlxuICAgICAqL1xuICAgIHN0YXRpYyByZXF1aXJlc1JlbmRlclBhc3MoZGV2aWNlLCBjYW1lcmEpIHtcblxuICAgICAgICAvLyBqdXN0IGNvcHkgb3V0IHRoZSB0ZXh0dXJlcywgbm8gcmVuZGVyIHBhc3MgbmVlZGVkXG4gICAgICAgIGlmIChkZXZpY2Uud2ViZ2wyIHx8IGRldmljZS5pc1dlYkdQVSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gb24gV2ViR0wxIGRldmljZSwgb25seSBkZXB0aCByZW5kZXJpbmcgbmVlZHMgcmVuZGVyIHBhc3NcbiAgICAgICAgcmV0dXJuIGNhbWVyYS5yZW5kZXJTY2VuZURlcHRoTWFwO1xuICAgIH1cblxuICAgIHNldHVwVW5pZm9ybShkZXZpY2UsIGRlcHRoLCBidWZmZXIpIHtcblxuICAgICAgICAvLyBhc3NpZ24gaXQgdG8gc2NvcGVzIHRvIGV4cG9zZSBpdCB0byBzaGFkZXJzXG4gICAgICAgIGNvbnN0IG5hbWVzID0gZGVwdGggPyBfZGVwdGhVbmlmb3JtTmFtZXMgOiBfY29sb3JVbmlmb3JtTmFtZXM7XG4gICAgICAgIG5hbWVzLmZvckVhY2gobmFtZSA9PiBkZXZpY2Uuc2NvcGUucmVzb2x2ZShuYW1lKS5zZXRWYWx1ZShidWZmZXIpKTtcbiAgICB9XG5cbiAgICBhbGxvY2F0ZVRleHR1cmUoZGV2aWNlLCBzb3VyY2UsIG5hbWUsIGZvcm1hdCwgaXNEZXB0aCwgbWlwbWFwcykge1xuXG4gICAgICAgIC8vIGFsbG9jYXRlIHRleHR1cmUgdGhhdCB3aWxsIHN0b3JlIHRoZSBkZXB0aFxuICAgICAgICByZXR1cm4gbmV3IFRleHR1cmUoZGV2aWNlLCB7XG4gICAgICAgICAgICBuYW1lLFxuICAgICAgICAgICAgZm9ybWF0LFxuICAgICAgICAgICAgd2lkdGg6IHNvdXJjZSA/IHNvdXJjZS5jb2xvckJ1ZmZlci53aWR0aCA6IGRldmljZS53aWR0aCxcbiAgICAgICAgICAgIGhlaWdodDogc291cmNlID8gc291cmNlLmNvbG9yQnVmZmVyLmhlaWdodCA6IGRldmljZS5oZWlnaHQsXG4gICAgICAgICAgICBtaXBtYXBzLFxuICAgICAgICAgICAgbWluRmlsdGVyOiBpc0RlcHRoID8gRklMVEVSX05FQVJFU1QgOiAobWlwbWFwcyA/IEZJTFRFUl9MSU5FQVJfTUlQTUFQX0xJTkVBUiA6IEZJTFRFUl9MSU5FQVIpLFxuICAgICAgICAgICAgbWFnRmlsdGVyOiBpc0RlcHRoID8gRklMVEVSX05FQVJFU1QgOiBGSUxURVJfTElORUFSLFxuICAgICAgICAgICAgYWRkcmVzc1U6IEFERFJFU1NfQ0xBTVBfVE9fRURHRSxcbiAgICAgICAgICAgIGFkZHJlc3NWOiBBRERSRVNTX0NMQU1QX1RPX0VER0VcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gdGV4dHVyZSBmb3JtYXQgb2YgdGhlIHNvdXJjZSB0ZXh0dXJlIHRoZSBncmFiIHBhc3MgbmVlZHMgdG8gY29weVxuICAgIGdldFNvdXJjZUNvbG9yRm9ybWF0KHRleHR1cmUpIHtcbiAgICAgICAgLy8gYmFzZWQgb24gdGhlIFJUIHRoZSBjYW1lcmEgcmVuZGVycyB0bywgb3RoZXJ3aXNlIGZyYW1lYnVmZmVyXG4gICAgICAgIHJldHVybiB0ZXh0dXJlPy5mb3JtYXQgPz8gdGhpcy5kZXZpY2UuYmFja0J1ZmZlckZvcm1hdDtcbiAgICB9XG5cbiAgICBzaG91bGRSZWFsbG9jYXRlKHRhcmdldFJULCBzb3VyY2VUZXh0dXJlLCB0ZXN0Rm9ybWF0KSB7XG5cbiAgICAgICAgLy8gbmVlZCB0byByZWFsbG9jYXRlIGlmIGZvcm1hdCBkb2VzIG5vdCBtYXRjaFxuICAgICAgICBpZiAodGVzdEZvcm1hdCkge1xuICAgICAgICAgICAgY29uc3QgdGFyZ2V0Rm9ybWF0ID0gdGFyZ2V0UlQ/LmNvbG9yQnVmZmVyLmZvcm1hdDtcbiAgICAgICAgICAgIGNvbnN0IHNvdXJjZUZvcm1hdCA9IHRoaXMuZ2V0U291cmNlQ29sb3JGb3JtYXQoc291cmNlVGV4dHVyZSk7XG4gICAgICAgICAgICBpZiAodGFyZ2V0Rm9ybWF0ICE9PSBzb3VyY2VGb3JtYXQpXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBuZWVkIHRvIHJlYWxsb2NhdGUgaWYgZGltZW5zaW9ucyBkb24ndCBtYXRjaFxuICAgICAgICBjb25zdCB3aWR0aCA9IHNvdXJjZVRleHR1cmU/LndpZHRoIHx8IHRoaXMuZGV2aWNlLndpZHRoO1xuICAgICAgICBjb25zdCBoZWlnaHQgPSBzb3VyY2VUZXh0dXJlPy5oZWlnaHQgfHwgdGhpcy5kZXZpY2UuaGVpZ2h0O1xuICAgICAgICByZXR1cm4gIXRhcmdldFJUIHx8IHdpZHRoICE9PSB0YXJnZXRSVC53aWR0aCB8fCBoZWlnaHQgIT09IHRhcmdldFJULmhlaWdodDtcbiAgICB9XG5cbiAgICBhbGxvY2F0ZVJlbmRlclRhcmdldChyZW5kZXJUYXJnZXQsIHNvdXJjZVJlbmRlclRhcmdldCwgZGV2aWNlLCBmb3JtYXQsIGlzRGVwdGgsIG1pcG1hcHMsIGlzRGVwdGhVbmlmb3Jtcykge1xuXG4gICAgICAgIC8vIHRleHR1cmUgLyB1bmlmb3JtIG5hbWVzOiBuZXcgb25lIChmaXJzdCksIGFzIHdlbGwgYXMgb2xkIG9uZSAgKHNlY29uZCkgZm9yIGNvbXBhdGliaWxpdHlcbiAgICAgICAgY29uc3QgbmFtZXMgPSBpc0RlcHRoVW5pZm9ybXMgPyBfZGVwdGhVbmlmb3JtTmFtZXMgOiBfY29sb3JVbmlmb3JtTmFtZXM7XG5cbiAgICAgICAgLy8gYWxsb2NhdGUgdGV4dHVyZSBidWZmZXJcbiAgICAgICAgY29uc3QgYnVmZmVyID0gdGhpcy5hbGxvY2F0ZVRleHR1cmUoZGV2aWNlLCBzb3VyY2VSZW5kZXJUYXJnZXQsIG5hbWVzWzBdLCBmb3JtYXQsIGlzRGVwdGgsIG1pcG1hcHMpO1xuXG4gICAgICAgIGlmIChyZW5kZXJUYXJnZXQpIHtcblxuICAgICAgICAgICAgLy8gaWYgcmVhbGxvY2F0aW5nIFJUIHNpemUsIHJlbGVhc2UgcHJldmlvdXMgZnJhbWVidWZmZXJcbiAgICAgICAgICAgIHJlbmRlclRhcmdldC5kZXN0cm95RnJhbWVCdWZmZXJzKCk7XG5cbiAgICAgICAgICAgIC8vIGFzc2lnbiBuZXcgdGV4dHVyZVxuICAgICAgICAgICAgaWYgKGlzRGVwdGgpIHtcbiAgICAgICAgICAgICAgICByZW5kZXJUYXJnZXQuX2RlcHRoQnVmZmVyID0gYnVmZmVyO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZW5kZXJUYXJnZXQuX2NvbG9yQnVmZmVyID0gYnVmZmVyO1xuICAgICAgICAgICAgICAgIHJlbmRlclRhcmdldC5fY29sb3JCdWZmZXJzID0gW2J1ZmZlcl07XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG5cbiAgICAgICAgICAgIC8vIGNyZWF0ZSBuZXcgcmVuZGVyIHRhcmdldCB3aXRoIHRoZSB0ZXh0dXJlXG4gICAgICAgICAgICByZW5kZXJUYXJnZXQgPSBuZXcgUmVuZGVyVGFyZ2V0KHtcbiAgICAgICAgICAgICAgICBuYW1lOiAncmVuZGVyVGFyZ2V0U2NlbmVHcmFiJyxcbiAgICAgICAgICAgICAgICBjb2xvckJ1ZmZlcjogaXNEZXB0aCA/IG51bGwgOiBidWZmZXIsXG4gICAgICAgICAgICAgICAgZGVwdGhCdWZmZXI6IGlzRGVwdGggPyBidWZmZXIgOiBudWxsLFxuICAgICAgICAgICAgICAgIGRlcHRoOiAhaXNEZXB0aCxcbiAgICAgICAgICAgICAgICBzdGVuY2lsOiBkZXZpY2Uuc3VwcG9ydHNTdGVuY2lsLFxuICAgICAgICAgICAgICAgIGF1dG9SZXNvbHZlOiBmYWxzZVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcmVuZGVyVGFyZ2V0O1xuICAgIH1cblxuICAgIHJlbGVhc2VSZW5kZXJUYXJnZXQocnQpIHtcblxuICAgICAgICBpZiAocnQpIHtcbiAgICAgICAgICAgIHJ0LmRlc3Ryb3lUZXh0dXJlQnVmZmVycygpO1xuICAgICAgICAgICAgcnQuZGVzdHJveSgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gbWFpbiBwYXRoIHdoZXJlIGJvdGggY29sb3IgYW5kIGRlcHRoIGlzIGNvcGllZCBmcm9tIGV4aXN0aW5nIHN1cmZhY2VcbiAgICBpbml0TWFpblBhdGgoKSB7XG5cbiAgICAgICAgY29uc3QgZGV2aWNlID0gdGhpcy5kZXZpY2U7XG4gICAgICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuXG4gICAgICAgIC8vIFdlYkdMIDIgZGVwdGggbGF5ZXIganVzdCBjb3BpZXMgZXhpc3RpbmcgY29sb3Igb3IgZGVwdGhcbiAgICAgICAgdGhpcy5sYXllciA9IG5ldyBMYXllcih7XG4gICAgICAgICAgICBlbmFibGVkOiBmYWxzZSxcbiAgICAgICAgICAgIG5hbWU6IFwiRGVwdGhcIixcbiAgICAgICAgICAgIGlkOiBMQVlFUklEX0RFUFRILFxuXG4gICAgICAgICAgICBvbkRpc2FibGU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBzZWxmLnJlbGVhc2VSZW5kZXJUYXJnZXQodGhpcy5kZXB0aFJlbmRlclRhcmdldCk7XG4gICAgICAgICAgICAgICAgdGhpcy5kZXB0aFJlbmRlclRhcmdldCA9IG51bGw7XG5cbiAgICAgICAgICAgICAgICBzZWxmLnJlbGVhc2VSZW5kZXJUYXJnZXQodGhpcy5jb2xvclJlbmRlclRhcmdldCk7XG4gICAgICAgICAgICAgICAgdGhpcy5jb2xvclJlbmRlclRhcmdldCA9IG51bGw7XG4gICAgICAgICAgICB9LFxuXG4gICAgICAgICAgICBvblByZVJlbmRlck9wYXF1ZTogZnVuY3Rpb24gKGNhbWVyYVBhc3MpIHsgLy8gcmVzaXplIGRlcHRoIG1hcCBpZiBuZWVkZWRcblxuICAgICAgICAgICAgICAgIC8qKiBAdHlwZSB7aW1wb3J0KCcuLi8uLi9mcmFtZXdvcmsvY29tcG9uZW50cy9jYW1lcmEvY29tcG9uZW50LmpzJykuQ2FtZXJhQ29tcG9uZW50fSAqL1xuICAgICAgICAgICAgICAgIGNvbnN0IGNhbWVyYSA9IHRoaXMuY2FtZXJhc1tjYW1lcmFQYXNzXTtcblxuICAgICAgICAgICAgICAgIGlmIChjYW1lcmEucmVuZGVyU2NlbmVDb2xvck1hcCkge1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIGFsbG9jYXRlIC8gcmVzaXplIGV4aXN0aW5nIFJUIGFzIG5lZWRlZFxuICAgICAgICAgICAgICAgICAgICBpZiAoc2VsZi5zaG91bGRSZWFsbG9jYXRlKHRoaXMuY29sb3JSZW5kZXJUYXJnZXQsIGNhbWVyYS5yZW5kZXJUYXJnZXQ/LmNvbG9yQnVmZmVyLCB0cnVlKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi5yZWxlYXNlUmVuZGVyVGFyZ2V0KHRoaXMuY29sb3JSZW5kZXJUYXJnZXQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZm9ybWF0ID0gc2VsZi5nZXRTb3VyY2VDb2xvckZvcm1hdChjYW1lcmEucmVuZGVyVGFyZ2V0Py5jb2xvckJ1ZmZlcik7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmNvbG9yUmVuZGVyVGFyZ2V0ID0gc2VsZi5hbGxvY2F0ZVJlbmRlclRhcmdldCh0aGlzLmNvbG9yUmVuZGVyVGFyZ2V0LCBjYW1lcmEucmVuZGVyVGFyZ2V0LCBkZXZpY2UsIGZvcm1hdCwgZmFsc2UsIHRydWUsIGZhbHNlKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIGNvcHkgY29sb3IgZnJvbSB0aGUgY3VycmVudCByZW5kZXIgdGFyZ2V0XG4gICAgICAgICAgICAgICAgICAgIERlYnVnR3JhcGhpY3MucHVzaEdwdU1hcmtlcihkZXZpY2UsICdHUkFCLUNPTE9SJyk7XG5cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY29sb3JCdWZmZXIgPSB0aGlzLmNvbG9yUmVuZGVyVGFyZ2V0LmNvbG9yQnVmZmVyO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChkZXZpY2UuaXNXZWJHUFUpIHtcblxuICAgICAgICAgICAgICAgICAgICAgICAgZGV2aWNlLmNvcHlSZW5kZXJUYXJnZXQoY2FtZXJhLnJlbmRlclRhcmdldCwgdGhpcy5jb2xvclJlbmRlclRhcmdldCwgdHJ1ZSwgZmFsc2UpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBnZW5lcmF0ZSBtaXBtYXBzXG4gICAgICAgICAgICAgICAgICAgICAgICBkZXZpY2UubWlwbWFwUmVuZGVyZXIuZ2VuZXJhdGUodGhpcy5jb2xvclJlbmRlclRhcmdldC5jb2xvckJ1ZmZlci5pbXBsKTtcblxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBkZXZpY2UuY29weVJlbmRlclRhcmdldChkZXZpY2UucmVuZGVyVGFyZ2V0LCB0aGlzLmNvbG9yUmVuZGVyVGFyZ2V0LCB0cnVlLCBmYWxzZSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGdlbmVyYXRlIG1pcG1hcHNcbiAgICAgICAgICAgICAgICAgICAgICAgIGRldmljZS5hY3RpdmVUZXh0dXJlKGRldmljZS5tYXhDb21iaW5lZFRleHR1cmVzIC0gMSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBkZXZpY2UuYmluZFRleHR1cmUoY29sb3JCdWZmZXIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgZGV2aWNlLmdsLmdlbmVyYXRlTWlwbWFwKGNvbG9yQnVmZmVyLmltcGwuX2dsVGFyZ2V0KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIERlYnVnR3JhcGhpY3MucG9wR3B1TWFya2VyKGRldmljZSk7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gYXNzaWduIHVuaWZyb21cbiAgICAgICAgICAgICAgICAgICAgc2VsZi5zZXR1cFVuaWZvcm0oZGV2aWNlLCBmYWxzZSwgY29sb3JCdWZmZXIpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmIChjYW1lcmEucmVuZGVyU2NlbmVEZXB0aE1hcCkge1xuXG4gICAgICAgICAgICAgICAgICAgIGxldCB1c2VEZXB0aEJ1ZmZlciA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIGxldCBmb3JtYXQgPSBQSVhFTEZPUk1BVF9ERVBUSFNURU5DSUw7XG4gICAgICAgICAgICAgICAgICAgIGlmIChkZXZpY2UuaXNXZWJHUFUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG51bVNhbXBsZXMgPSBjYW1lcmEucmVuZGVyVGFyZ2V0Py5zYW1wbGVzID8/IGRldmljZS5zYW1wbGVzO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyB3aGVuIGRlcHRoIGJ1ZmZlciBpcyBtdWx0aS1zYW1wbGVkLCBpbnN0ZWFkIG9mIGNvcHlpbmcgaXQgb3V0LCB3ZSB1c2UgY3VzdG9tIHNoYWRlciB0byByZXNvbHZlIGl0XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyB0byBhIFIzMkYgdGV4dHVyZSwgdXNlZCBhcyBhIGNvbG9yIGF0dGFjaG1lbnQgb2YgdGhlIHJlbmRlciB0YXJnZXRcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChudW1TYW1wbGVzID4gMSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZvcm1hdCA9IFBJWEVMRk9STUFUX1IzMkY7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdXNlRGVwdGhCdWZmZXIgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIHJlYWxsb2NhdGUgUlQgaWYgbmVlZGVkXG4gICAgICAgICAgICAgICAgICAgIGlmIChzZWxmLnNob3VsZFJlYWxsb2NhdGUodGhpcy5kZXB0aFJlbmRlclRhcmdldCwgY2FtZXJhLnJlbmRlclRhcmdldD8uZGVwdGhCdWZmZXIpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxmLnJlbGVhc2VSZW5kZXJUYXJnZXQodGhpcy5kZXB0aFJlbmRlclRhcmdldCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmRlcHRoUmVuZGVyVGFyZ2V0ID0gc2VsZi5hbGxvY2F0ZVJlbmRlclRhcmdldCh0aGlzLmRlcHRoUmVuZGVyVGFyZ2V0LCBjYW1lcmEucmVuZGVyVGFyZ2V0LCBkZXZpY2UsIGZvcm1hdCwgdXNlRGVwdGhCdWZmZXIsIGZhbHNlLCB0cnVlKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIFdlYkdMMiBtdWx0aXNhbXBsaW5nIGRlcHRoIGhhbmRsaW5nOiB3ZSByZXNvbHZlIG11bHRpLXNhbXBsZWQgZGVwdGggYnVmZmVyIHRvIGEgc2luZ2xlLXNhbXBsZWQgZGVzdGluYXRpb24gYnVmZmVyLlxuICAgICAgICAgICAgICAgICAgICAvLyBXZSBjb3VsZCB1c2UgZXhpc3RpbmcgQVBJIGFuZCByZXNvbHZlIGRlcHRoIGZpcnN0IGFuZCB0aGVuIGJsaXQgaXQgdG8gZGVzdGluYXRpb24sIGJ1dCB0aGlzIGF2b2lkcyB0aGUgZXh0cmEgY29weS5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGRldmljZS53ZWJnbDIgJiYgZGV2aWNlLnJlbmRlclRhcmdldC5zYW1wbGVzID4gMSkge1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBtdWx0aS1zYW1wbGVkIGJ1ZmZlclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgc3JjID0gZGV2aWNlLnJlbmRlclRhcmdldC5pbXBsLl9nbEZyYW1lQnVmZmVyO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBzaW5nbGUgc2FtcGxlZCBkZXN0aW5hdGlvbiBidWZmZXJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGRlc3QgPSB0aGlzLmRlcHRoUmVuZGVyVGFyZ2V0O1xuICAgICAgICAgICAgICAgICAgICAgICAgZGV2aWNlLnJlbmRlclRhcmdldCA9IGRlc3Q7XG4gICAgICAgICAgICAgICAgICAgICAgICBkZXZpY2UudXBkYXRlQmVnaW4oKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5kZXB0aFJlbmRlclRhcmdldC5pbXBsLmludGVybmFsUmVzb2x2ZShkZXZpY2UsIHNyYywgZGVzdC5pbXBsLl9nbEZyYW1lQnVmZmVyLCB0aGlzLmRlcHRoUmVuZGVyVGFyZ2V0LCBkZXZpY2UuZ2wuREVQVEhfQlVGRkVSX0JJVCk7XG5cbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gY29weSBkZXB0aFxuICAgICAgICAgICAgICAgICAgICAgICAgRGVidWdHcmFwaGljcy5wdXNoR3B1TWFya2VyKGRldmljZSwgJ0dSQUItREVQVEgnKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRldmljZS5jb3B5UmVuZGVyVGFyZ2V0KGRldmljZS5yZW5kZXJUYXJnZXQsIHRoaXMuZGVwdGhSZW5kZXJUYXJnZXQsIGZhbHNlLCB0cnVlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIERlYnVnR3JhcGhpY3MucG9wR3B1TWFya2VyKGRldmljZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAvLyBhc3NpZ24gdW5pZm9ybVxuICAgICAgICAgICAgICAgICAgICBzZWxmLnNldHVwVW5pZm9ybShkZXZpY2UsIHRydWUsIHVzZURlcHRoQnVmZmVyID8gdGhpcy5kZXB0aFJlbmRlclRhcmdldC5kZXB0aEJ1ZmZlciA6IHRoaXMuZGVwdGhSZW5kZXJUYXJnZXQuY29sb3JCdWZmZXIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIG9uUG9zdFJlbmRlck9wYXF1ZTogZnVuY3Rpb24gKGNhbWVyYVBhc3MpIHtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gZmFsbGJhY2sgcGF0aCwgd2hlcmUgY29weSBpcyBub3QgcG9zc2libGUgYW5kIHRoZSBzY2VuZSBnZXRzIHJlLXJlbmRlcmVkXG4gICAgaW5pdEZhbGxiYWNrUGF0aCgpIHtcblxuICAgICAgICBjb25zdCBzZWxmID0gdGhpcztcbiAgICAgICAgY29uc3QgZGV2aWNlID0gdGhpcy5kZXZpY2U7XG4gICAgICAgIGNvbnN0IHNjZW5lID0gdGhpcy5zY2VuZTtcblxuICAgICAgICAvLyBXZWJHTCAxIGRlcHRoIGxheWVyIHJlbmRlcnMgdGhlIHNhbWUgb2JqZWN0cyBhcyBpbiBXb3JsZCwgYnV0IHdpdGggUkdCQS1lbmNvZGVkIGRlcHRoIHNoYWRlciB0byBnZXQgZGVwdGhcbiAgICAgICAgdGhpcy5sYXllciA9IG5ldyBMYXllcih7XG4gICAgICAgICAgICBlbmFibGVkOiBmYWxzZSxcbiAgICAgICAgICAgIG5hbWU6IFwiRGVwdGhcIixcbiAgICAgICAgICAgIGlkOiBMQVlFUklEX0RFUFRILFxuICAgICAgICAgICAgc2hhZGVyUGFzczogU0hBREVSX0RFUFRILFxuXG4gICAgICAgICAgICBvbkVuYWJsZTogZnVuY3Rpb24gKCkge1xuXG4gICAgICAgICAgICAgICAgLy8gY3JlYXRlIFJUIHdpdGhvdXQgdGV4dHVyZXMsIHRob3NlIHdpbGwgYmUgY3JlYXRlZCBhcyBuZWVkZWQgbGF0ZXJcbiAgICAgICAgICAgICAgICB0aGlzLmRlcHRoUmVuZGVyVGFyZ2V0ID0gbmV3IFJlbmRlclRhcmdldCh7XG4gICAgICAgICAgICAgICAgICAgIG5hbWU6ICdkZXB0aFJlbmRlclRhcmdldC13ZWJnbDEnLFxuICAgICAgICAgICAgICAgICAgICBkZXB0aDogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgc3RlbmNpbDogZGV2aWNlLnN1cHBvcnRzU3RlbmNpbCxcbiAgICAgICAgICAgICAgICAgICAgYXV0b1Jlc29sdmU6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICBncmFwaGljc0RldmljZTogZGV2aWNlXG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICAvLyBhc3NpZ24gaXQgc28gdGhlIHJlbmRlciBhY3Rpb25zIGtub3dzIHRvIHJlbmRlciB0byBpdFxuICAgICAgICAgICAgICAgIC8vIFRPRE86IGF2b2lkIHRoaXMgYXMgdGhpcyBBUEkgaXMgZGVwcmVjYXRlZFxuICAgICAgICAgICAgICAgIHRoaXMucmVuZGVyVGFyZ2V0ID0gdGhpcy5kZXB0aFJlbmRlclRhcmdldDtcbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIG9uRGlzYWJsZTogZnVuY3Rpb24gKCkge1xuXG4gICAgICAgICAgICAgICAgLy8gb25seSByZWxlYXNlIGRlcHRoIHRleHR1cmUsIGJ1dCBub3QgdGhlIHJlbmRlciB0YXJnZXQgaXRzZWxmXG4gICAgICAgICAgICAgICAgdGhpcy5kZXB0aFJlbmRlclRhcmdldC5kZXN0cm95VGV4dHVyZUJ1ZmZlcnMoKTtcbiAgICAgICAgICAgICAgICB0aGlzLnJlbmRlclRhcmdldCA9IG51bGw7XG5cbiAgICAgICAgICAgICAgICBzZWxmLnJlbGVhc2VSZW5kZXJUYXJnZXQodGhpcy5jb2xvclJlbmRlclRhcmdldCk7XG4gICAgICAgICAgICAgICAgdGhpcy5jb2xvclJlbmRlclRhcmdldCA9IG51bGw7XG4gICAgICAgICAgICB9LFxuXG4gICAgICAgICAgICBvblBvc3RDdWxsOiBmdW5jdGlvbiAoY2FtZXJhUGFzcykge1xuXG4gICAgICAgICAgICAgICAgLyoqIEB0eXBlIHtpbXBvcnQoJy4uLy4uL2ZyYW1ld29yay9jb21wb25lbnRzL2NhbWVyYS9jb21wb25lbnQuanMnKS5DYW1lcmFDb21wb25lbnR9ICovXG4gICAgICAgICAgICAgICAgY29uc3QgY2FtZXJhID0gdGhpcy5jYW1lcmFzW2NhbWVyYVBhc3NdO1xuXG4gICAgICAgICAgICAgICAgaWYgKGNhbWVyYS5yZW5kZXJTY2VuZURlcHRoTWFwKSB7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gcmVhbGxvY2F0ZSBSVCBpZiBuZWVkZWRcbiAgICAgICAgICAgICAgICAgICAgaWYgKCF0aGlzLmRlcHRoUmVuZGVyVGFyZ2V0Py5jb2xvckJ1ZmZlciB8fCBzZWxmLnNob3VsZFJlYWxsb2NhdGUodGhpcy5kZXB0aFJlbmRlclRhcmdldCwgY2FtZXJhLnJlbmRlclRhcmdldD8uZGVwdGhCdWZmZXIpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmRlcHRoUmVuZGVyVGFyZ2V0Py5kZXN0cm95VGV4dHVyZUJ1ZmZlcnMoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZGVwdGhSZW5kZXJUYXJnZXQgPSBzZWxmLmFsbG9jYXRlUmVuZGVyVGFyZ2V0KHRoaXMuZGVwdGhSZW5kZXJUYXJnZXQsIGNhbWVyYS5yZW5kZXJUYXJnZXQsIGRldmljZSwgUElYRUxGT1JNQVRfUkdCQTgsIGZhbHNlLCBmYWxzZSwgdHJ1ZSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGFzc2lnbiBpdCBzbyB0aGUgcmVuZGVyIGFjdGlvbnMga25vd3MgdG8gcmVuZGVyIHRvIGl0XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBUT0RPOiBhdm9pZCB0aGlzIGFzIHRoaXMgQVBJIGlzIGRlcHJlY2F0ZWRcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucmVuZGVyVGFyZ2V0ID0gdGhpcy5kZXB0aFJlbmRlclRhcmdldDtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIENvbGxlY3QgYWxsIHJlbmRlcmVkIG1lc2ggaW5zdGFuY2VzIG9uIHRoZSBsYXllcnMgcHJpb3IgdG8gdGhlIGRlcHRoIGxheWVyLlxuICAgICAgICAgICAgICAgICAgICAvLyBTdG9yZSB0aGVtIGluIGEgdmlzaWJsZSBsaXN0IG9mIGluc3RhbmNlcyBvbiB0aGUgZGVwdGggbGF5ZXIuXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGN1bGxlZERlcHRoSW5zdGFuY2VzID0gdGhpcy5nZXRDdWxsZWRJbnN0YW5jZXMoY2FtZXJhLmNhbWVyYSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGRlcHRoT3BhcXVlID0gY3VsbGVkRGVwdGhJbnN0YW5jZXMub3BhcXVlO1xuICAgICAgICAgICAgICAgICAgICBkZXB0aE9wYXF1ZS5sZW5ndGggPSAwO1xuXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGxheWVyQ29tcG9zaXRpb24gPSBzY2VuZS5sYXllcnM7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHN1YkxheWVyRW5hYmxlZCA9IGxheWVyQ29tcG9zaXRpb24uc3ViTGF5ZXJFbmFibGVkO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBpc1RyYW5zcGFyZW50ID0gbGF5ZXJDb21wb3NpdGlvbi5zdWJMYXllckxpc3Q7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gY2FuJ3QgdXNlIHNlbGYuZGVmYXVsdExheWVyV29ybGQucmVuZGVyVGFyZ2V0IGJlY2F1c2UgcHJvamVjdHMgdGhhdCB1c2UgdGhlIGVkaXRvciBvdmVycmlkZSBkZWZhdWx0IGxheWVyc1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBydCA9IGxheWVyQ29tcG9zaXRpb24uZ2V0TGF5ZXJCeUlkKExBWUVSSURfV09STEQpLnJlbmRlclRhcmdldDtcblxuICAgICAgICAgICAgICAgICAgICBjb25zdCBsYXllcnMgPSBsYXllckNvbXBvc2l0aW9uLmxheWVyTGlzdDtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBsYXllcnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGxheWVyID0gbGF5ZXJzW2ldO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBvbmx5IHVzZSB0aGUgbGF5ZXJzIGJlZm9yZSB0aGUgZGVwdGggbGF5ZXJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChsYXllciA9PT0gdGhpcykgYnJlYWs7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChsYXllci5yZW5kZXJUYXJnZXQgIT09IHJ0IHx8ICFsYXllci5lbmFibGVkIHx8ICFzdWJMYXllckVuYWJsZWRbaV0pIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGxheWVyLmNhbWVyYXMuaW5kZXhPZihjYW1lcmEpIDwgMCkgY29udGludWU7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHZpc2libGUgaW5zdGFuY2VzIGZvciB0aGUgY2FtZXJhIGZvciB0aGUgbGF5ZXJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHRyYW5zcGFyZW50ID0gaXNUcmFuc3BhcmVudFtpXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGxheWVyQ3VsbGVkSW5zdGFuY2VzID0gbGF5ZXIuZ2V0Q3VsbGVkSW5zdGFuY2VzKGNhbWVyYS5jYW1lcmEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbGF5ZXJNZXNoSW5zdGFuY2VzID0gdHJhbnNwYXJlbnQgPyBsYXllckN1bGxlZEluc3RhbmNlcy50cmFuc3BhcmVudCA6IGxheWVyQ3VsbGVkSW5zdGFuY2VzLm9wYXF1ZTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gY29weSB0aGVtIHRvIGEgdmlzaWJsZSBsaXN0IG9mIHRoZSBkZXB0aCBsYXllclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgY291bnQgPSBsYXllck1lc2hJbnN0YW5jZXMubGVuZ3RoO1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgaiA9IDA7IGogPCBjb3VudDsgaisrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZHJhd0NhbGwgPSBsYXllck1lc2hJbnN0YW5jZXNbal07XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBvbmx5IGNvbGxlY3QgbWVzaGVzIHRoYXQgdXBkYXRlIHRoZSBkZXB0aFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChkcmF3Q2FsbC5tYXRlcmlhbD8uZGVwdGhXcml0ZSAmJiAhZHJhd0NhbGwuX25vRGVwdGhEcmF3R2wxKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlcHRoT3BhcXVlLnB1c2goZHJhd0NhbGwpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIG9uUHJlUmVuZGVyT3BhcXVlOiBmdW5jdGlvbiAoY2FtZXJhUGFzcykge1xuXG4gICAgICAgICAgICAgICAgLyoqIEB0eXBlIHtpbXBvcnQoJy4uLy4uL2ZyYW1ld29yay9jb21wb25lbnRzL2NhbWVyYS9jb21wb25lbnQuanMnKS5DYW1lcmFDb21wb25lbnR9ICovXG4gICAgICAgICAgICAgICAgY29uc3QgY2FtZXJhID0gdGhpcy5jYW1lcmFzW2NhbWVyYVBhc3NdO1xuXG4gICAgICAgICAgICAgICAgaWYgKGNhbWVyYS5yZW5kZXJTY2VuZUNvbG9yTWFwKSB7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gcmVhbGxvY2F0ZSBSVCBpZiBuZWVkZWRcbiAgICAgICAgICAgICAgICAgICAgaWYgKHNlbGYuc2hvdWxkUmVhbGxvY2F0ZSh0aGlzLmNvbG9yUmVuZGVyVGFyZ2V0LCBjYW1lcmEucmVuZGVyVGFyZ2V0Py5jb2xvckJ1ZmZlcikpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYucmVsZWFzZVJlbmRlclRhcmdldCh0aGlzLmNvbG9yUmVuZGVyVGFyZ2V0KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGZvcm1hdCA9IHNlbGYuZ2V0U291cmNlQ29sb3JGb3JtYXQoY2FtZXJhLnJlbmRlclRhcmdldD8uY29sb3JCdWZmZXIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5jb2xvclJlbmRlclRhcmdldCA9IHNlbGYuYWxsb2NhdGVSZW5kZXJUYXJnZXQodGhpcy5jb2xvclJlbmRlclRhcmdldCwgY2FtZXJhLnJlbmRlclRhcmdldCwgZGV2aWNlLCBmb3JtYXQsIGZhbHNlLCBmYWxzZSwgZmFsc2UpO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gY29weSBvdXQgdGhlIGNvbG9yIGJ1ZmZlclxuICAgICAgICAgICAgICAgICAgICBEZWJ1Z0dyYXBoaWNzLnB1c2hHcHVNYXJrZXIoZGV2aWNlLCAnR1JBQi1DT0xPUicpO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIGluaXRpYWxpemUgdGhlIHRleHR1cmVcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY29sb3JCdWZmZXIgPSB0aGlzLmNvbG9yUmVuZGVyVGFyZ2V0Ll9jb2xvckJ1ZmZlcjtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFjb2xvckJ1ZmZlci5pbXBsLl9nbFRleHR1cmUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbG9yQnVmZmVyLmltcGwuaW5pdGlhbGl6ZShkZXZpY2UsIGNvbG9yQnVmZmVyKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIGNvcHkgZnJhbWVidWZmZXIgdG8gaXRcbiAgICAgICAgICAgICAgICAgICAgZGV2aWNlLmJpbmRUZXh0dXJlKGNvbG9yQnVmZmVyKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZ2wgPSBkZXZpY2UuZ2w7XG4gICAgICAgICAgICAgICAgICAgIGdsLmNvcHlUZXhJbWFnZTJEKGdsLlRFWFRVUkVfMkQsIDAsIGNvbG9yQnVmZmVyLmltcGwuX2dsRm9ybWF0LCAwLCAwLCBjb2xvckJ1ZmZlci53aWR0aCwgY29sb3JCdWZmZXIuaGVpZ2h0LCAwKTtcblxuICAgICAgICAgICAgICAgICAgICAvLyBzdG9wIHRoZSBkZXZpY2UgZnJvbSB1cGRhdGluZyB0aGlzIHRleHR1cmUgZnVydGhlclxuICAgICAgICAgICAgICAgICAgICBjb2xvckJ1ZmZlci5fbmVlZHNVcGxvYWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgY29sb3JCdWZmZXIuX25lZWRzTWlwbWFwc1VwbG9hZCA9IGZhbHNlO1xuXG4gICAgICAgICAgICAgICAgICAgIERlYnVnR3JhcGhpY3MucG9wR3B1TWFya2VyKGRldmljZSk7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gYXNzaWduIHVuaWZyb21cbiAgICAgICAgICAgICAgICAgICAgc2VsZi5zZXR1cFVuaWZvcm0oZGV2aWNlLCBmYWxzZSwgY29sb3JCdWZmZXIpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmIChjYW1lcmEucmVuZGVyU2NlbmVEZXB0aE1hcCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBhc3NpZ24gdW5pZnJvbVxuICAgICAgICAgICAgICAgICAgICBzZWxmLnNldHVwVW5pZm9ybShkZXZpY2UsIHRydWUsIHRoaXMuZGVwdGhSZW5kZXJUYXJnZXQuY29sb3JCdWZmZXIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIG9uRHJhd0NhbGw6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAvLyB3cml0aW5nIGRlcHRoIHRvIGNvbG9yIHJlbmRlciB0YXJnZXQsIGZvcmNlIG5vIGJsZW5kaW5nIGFuZCB3cml0aW5nIHRvIGFsbCBjaGFubmVsc1xuICAgICAgICAgICAgICAgIGRldmljZS5zZXRCbGVuZFN0YXRlKEJsZW5kU3RhdGUuTk9CTEVORCk7XG4gICAgICAgICAgICB9LFxuXG4gICAgICAgICAgICBvblBvc3RSZW5kZXJPcGFxdWU6IGZ1bmN0aW9uIChjYW1lcmFQYXNzKSB7XG5cbiAgICAgICAgICAgICAgICAvKiogQHR5cGUge2ltcG9ydCgnLi4vLi4vZnJhbWV3b3JrL2NvbXBvbmVudHMvY2FtZXJhL2NvbXBvbmVudC5qcycpLkNhbWVyYUNvbXBvbmVudH0gKi9cbiAgICAgICAgICAgICAgICBjb25zdCBjYW1lcmEgPSB0aGlzLmNhbWVyYXNbY2FtZXJhUGFzc107XG5cbiAgICAgICAgICAgICAgICBpZiAoY2FtZXJhLnJlbmRlclNjZW5lRGVwdGhNYXApIHtcbiAgICAgICAgICAgICAgICAgICAgLy8ganVzdCBjbGVhciB0aGUgbGlzdCBvZiB2aXNpYmxlIG9iamVjdHMgdG8gYXZvaWQga2VlcGluZyByZWZlcmVuY2VzXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGN1bGxlZERlcHRoSW5zdGFuY2VzID0gdGhpcy5nZXRDdWxsZWRJbnN0YW5jZXMoY2FtZXJhLmNhbWVyYSk7XG4gICAgICAgICAgICAgICAgICAgIGN1bGxlZERlcHRoSW5zdGFuY2VzLm9wYXF1ZS5sZW5ndGggPSAwO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gZnVuY3Rpb24gd2hpY2ggcGF0Y2hlcyBhIGxheWVyIHRvIHVzZSBkZXB0aCBsYXllciBzZXQgdXAgaW4gdGhpcyBjbGFzc1xuICAgIHBhdGNoKGxheWVyKSB7XG5cbiAgICAgICAgbGF5ZXIub25FbmFibGUgPSB0aGlzLmxheWVyLm9uRW5hYmxlO1xuICAgICAgICBsYXllci5vbkRpc2FibGUgPSB0aGlzLmxheWVyLm9uRGlzYWJsZTtcbiAgICAgICAgbGF5ZXIub25QcmVSZW5kZXJPcGFxdWUgPSB0aGlzLmxheWVyLm9uUHJlUmVuZGVyT3BhcXVlO1xuICAgICAgICBsYXllci5vblBvc3RSZW5kZXJPcGFxdWUgPSB0aGlzLmxheWVyLm9uUG9zdFJlbmRlck9wYXF1ZTtcbiAgICAgICAgbGF5ZXIuc2hhZGVyUGFzcyA9IHRoaXMubGF5ZXIuc2hhZGVyUGFzcztcbiAgICAgICAgbGF5ZXIub25Qb3N0Q3VsbCA9IHRoaXMubGF5ZXIub25Qb3N0Q3VsbDtcbiAgICAgICAgbGF5ZXIub25EcmF3Q2FsbCA9IHRoaXMubGF5ZXIub25EcmF3Q2FsbDtcbiAgICB9XG59XG5cbmV4cG9ydCB7IFNjZW5lR3JhYiB9O1xuIl0sIm5hbWVzIjpbIl9kZXB0aFVuaWZvcm1OYW1lcyIsIl9jb2xvclVuaWZvcm1OYW1lcyIsIlNjZW5lR3JhYiIsImNvbnN0cnVjdG9yIiwiZGV2aWNlIiwic2NlbmUiLCJEZWJ1ZyIsImFzc2VydCIsImxheWVyIiwiaXNOdWxsIiwiTGF5ZXIiLCJlbmFibGVkIiwibmFtZSIsImlkIiwiTEFZRVJJRF9ERVBUSCIsIndlYmdsMiIsImlzV2ViR1BVIiwiaW5pdE1haW5QYXRoIiwiaW5pdEZhbGxiYWNrUGF0aCIsInJlcXVpcmVzUmVuZGVyUGFzcyIsImNhbWVyYSIsInJlbmRlclNjZW5lRGVwdGhNYXAiLCJzZXR1cFVuaWZvcm0iLCJkZXB0aCIsImJ1ZmZlciIsIm5hbWVzIiwiZm9yRWFjaCIsInNjb3BlIiwicmVzb2x2ZSIsInNldFZhbHVlIiwiYWxsb2NhdGVUZXh0dXJlIiwic291cmNlIiwiZm9ybWF0IiwiaXNEZXB0aCIsIm1pcG1hcHMiLCJUZXh0dXJlIiwid2lkdGgiLCJjb2xvckJ1ZmZlciIsImhlaWdodCIsIm1pbkZpbHRlciIsIkZJTFRFUl9ORUFSRVNUIiwiRklMVEVSX0xJTkVBUl9NSVBNQVBfTElORUFSIiwiRklMVEVSX0xJTkVBUiIsIm1hZ0ZpbHRlciIsImFkZHJlc3NVIiwiQUREUkVTU19DTEFNUF9UT19FREdFIiwiYWRkcmVzc1YiLCJnZXRTb3VyY2VDb2xvckZvcm1hdCIsInRleHR1cmUiLCJfdGV4dHVyZSRmb3JtYXQiLCJiYWNrQnVmZmVyRm9ybWF0Iiwic2hvdWxkUmVhbGxvY2F0ZSIsInRhcmdldFJUIiwic291cmNlVGV4dHVyZSIsInRlc3RGb3JtYXQiLCJ0YXJnZXRGb3JtYXQiLCJzb3VyY2VGb3JtYXQiLCJhbGxvY2F0ZVJlbmRlclRhcmdldCIsInJlbmRlclRhcmdldCIsInNvdXJjZVJlbmRlclRhcmdldCIsImlzRGVwdGhVbmlmb3JtcyIsImRlc3Ryb3lGcmFtZUJ1ZmZlcnMiLCJfZGVwdGhCdWZmZXIiLCJfY29sb3JCdWZmZXIiLCJfY29sb3JCdWZmZXJzIiwiUmVuZGVyVGFyZ2V0IiwiZGVwdGhCdWZmZXIiLCJzdGVuY2lsIiwic3VwcG9ydHNTdGVuY2lsIiwiYXV0b1Jlc29sdmUiLCJyZWxlYXNlUmVuZGVyVGFyZ2V0IiwicnQiLCJkZXN0cm95VGV4dHVyZUJ1ZmZlcnMiLCJkZXN0cm95Iiwic2VsZiIsIm9uRGlzYWJsZSIsImRlcHRoUmVuZGVyVGFyZ2V0IiwiY29sb3JSZW5kZXJUYXJnZXQiLCJvblByZVJlbmRlck9wYXF1ZSIsImNhbWVyYVBhc3MiLCJjYW1lcmFzIiwicmVuZGVyU2NlbmVDb2xvck1hcCIsIl9jYW1lcmEkcmVuZGVyVGFyZ2V0IiwiX2NhbWVyYSRyZW5kZXJUYXJnZXQyIiwiRGVidWdHcmFwaGljcyIsInB1c2hHcHVNYXJrZXIiLCJjb3B5UmVuZGVyVGFyZ2V0IiwibWlwbWFwUmVuZGVyZXIiLCJnZW5lcmF0ZSIsImltcGwiLCJhY3RpdmVUZXh0dXJlIiwibWF4Q29tYmluZWRUZXh0dXJlcyIsImJpbmRUZXh0dXJlIiwiZ2wiLCJnZW5lcmF0ZU1pcG1hcCIsIl9nbFRhcmdldCIsInBvcEdwdU1hcmtlciIsIl9jYW1lcmEkcmVuZGVyVGFyZ2V0NCIsInVzZURlcHRoQnVmZmVyIiwiUElYRUxGT1JNQVRfREVQVEhTVEVOQ0lMIiwiX2NhbWVyYSRyZW5kZXJUYXJnZXQkIiwiX2NhbWVyYSRyZW5kZXJUYXJnZXQzIiwibnVtU2FtcGxlcyIsInNhbXBsZXMiLCJQSVhFTEZPUk1BVF9SMzJGIiwic3JjIiwiX2dsRnJhbWVCdWZmZXIiLCJkZXN0IiwidXBkYXRlQmVnaW4iLCJpbnRlcm5hbFJlc29sdmUiLCJERVBUSF9CVUZGRVJfQklUIiwib25Qb3N0UmVuZGVyT3BhcXVlIiwic2hhZGVyUGFzcyIsIlNIQURFUl9ERVBUSCIsIm9uRW5hYmxlIiwiZ3JhcGhpY3NEZXZpY2UiLCJvblBvc3RDdWxsIiwiX3RoaXMkZGVwdGhSZW5kZXJUYXJnIiwiX2NhbWVyYSRyZW5kZXJUYXJnZXQ1IiwiX3RoaXMkZGVwdGhSZW5kZXJUYXJnMiIsIlBJWEVMRk9STUFUX1JHQkE4IiwiY3VsbGVkRGVwdGhJbnN0YW5jZXMiLCJnZXRDdWxsZWRJbnN0YW5jZXMiLCJkZXB0aE9wYXF1ZSIsIm9wYXF1ZSIsImxlbmd0aCIsImxheWVyQ29tcG9zaXRpb24iLCJsYXllcnMiLCJzdWJMYXllckVuYWJsZWQiLCJpc1RyYW5zcGFyZW50Iiwic3ViTGF5ZXJMaXN0IiwiZ2V0TGF5ZXJCeUlkIiwiTEFZRVJJRF9XT1JMRCIsImxheWVyTGlzdCIsImkiLCJpbmRleE9mIiwidHJhbnNwYXJlbnQiLCJsYXllckN1bGxlZEluc3RhbmNlcyIsImxheWVyTWVzaEluc3RhbmNlcyIsImNvdW50IiwiaiIsIl9kcmF3Q2FsbCRtYXRlcmlhbCIsImRyYXdDYWxsIiwibWF0ZXJpYWwiLCJkZXB0aFdyaXRlIiwiX25vRGVwdGhEcmF3R2wxIiwicHVzaCIsIl9jYW1lcmEkcmVuZGVyVGFyZ2V0NiIsIl9jYW1lcmEkcmVuZGVyVGFyZ2V0NyIsIl9nbFRleHR1cmUiLCJpbml0aWFsaXplIiwiY29weVRleEltYWdlMkQiLCJURVhUVVJFXzJEIiwiX2dsRm9ybWF0IiwiX25lZWRzVXBsb2FkIiwiX25lZWRzTWlwbWFwc1VwbG9hZCIsIm9uRHJhd0NhbGwiLCJzZXRCbGVuZFN0YXRlIiwiQmxlbmRTdGF0ZSIsIk5PQkxFTkQiLCJwYXRjaCJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7O0FBb0JBO0FBQ0EsTUFBTUEsa0JBQWtCLEdBQUcsQ0FBQyxnQkFBZ0IsRUFBRSxXQUFXLENBQUMsQ0FBQTtBQUMxRCxNQUFNQyxrQkFBa0IsR0FBRyxDQUFDLGdCQUFnQixFQUFFLGtCQUFrQixDQUFDLENBQUE7O0FBRWpFO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsTUFBTUMsU0FBUyxDQUFDO0FBQ1o7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDSUMsRUFBQUEsV0FBV0EsQ0FBQ0MsTUFBTSxFQUFFQyxLQUFLLEVBQUU7QUFFdkJDLElBQUFBLEtBQUssQ0FBQ0MsTUFBTSxDQUFDRixLQUFLLENBQUMsQ0FBQTtJQUNuQixJQUFJLENBQUNBLEtBQUssR0FBR0EsS0FBSyxDQUFBO0FBRWxCQyxJQUFBQSxLQUFLLENBQUNDLE1BQU0sQ0FBQ0gsTUFBTSxDQUFDLENBQUE7SUFDcEIsSUFBSSxDQUFDQSxNQUFNLEdBQUdBLE1BQU0sQ0FBQTs7QUFFcEI7SUFDQSxJQUFJLENBQUNJLEtBQUssR0FBRyxJQUFJLENBQUE7O0FBRWpCO0FBQ0EsSUFBQSxJQUFJLElBQUksQ0FBQ0osTUFBTSxDQUFDSyxNQUFNLEVBQUU7QUFFcEIsTUFBQSxJQUFJLENBQUNELEtBQUssR0FBRyxJQUFJRSxLQUFLLENBQUM7QUFDbkJDLFFBQUFBLE9BQU8sRUFBRSxLQUFLO0FBQ2RDLFFBQUFBLElBQUksRUFBRSxPQUFPO0FBQ2JDLFFBQUFBLEVBQUUsRUFBRUMsYUFBQUE7QUFD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
