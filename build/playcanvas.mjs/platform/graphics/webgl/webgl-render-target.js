import { Debug } from '../../../core/debug.js';
import { PIXELFORMAT_RGBA8 } from '../constants.js';
import { DebugGraphics } from '../debug-graphics.js';

/**
 * A private class representing a pair of framebuffers, when MSAA is used.
 *
 * @ignore
 */
class FramebufferPair {
  constructor(msaaFB, resolveFB) {
    /** Multi-sampled rendering framebuffer */
    this.msaaFB = void 0;
    /** Single-sampled resolve framebuffer */
    this.resolveFB = void 0;
    this.msaaFB = msaaFB;
    this.resolveFB = resolveFB;
  }
  destroy(gl) {
    if (this.msaaFB) {
      gl.deleteRenderbuffer(this.msaaFB);
      this.msaaFB = null;
    }
    if (this.resolveFB) {
      gl.deleteRenderbuffer(this.resolveFB);
      this.resolveFB = null;
    }
  }
}

/**
 * A WebGL implementation of the RenderTarget.
 *
 * @ignore
 */
class WebglRenderTarget {
  constructor() {
    this._glFrameBuffer = null;
    this._glDepthBuffer = null;
    this._glResolveFrameBuffer = null;
    /**
     * A list of framebuffers created When MSAA and MRT are used together, one for each color buffer.
     * This allows color buffers to be resolved separately.
     *
     * @type {FramebufferPair[]}
     */
    this.colorMrtFramebuffers = null;
    this._glMsaaColorBuffers = [];
    this._glMsaaDepthBuffer = null;
    /**
     * The supplied single-sampled framebuffer for rendering. Undefined represents no supplied
     * framebuffer. Null represents the default framebuffer. A value represents a user-supplied
     * framebuffer.
     */
    this.suppliedColorFramebuffer = void 0;
    this._isInitialized = false;
  }
  destroy(device) {
    var _this$colorMrtFramebu;
    const gl = device.gl;
    this._isInitialized = false;
    if (this._glFrameBuffer) {
      gl.deleteFramebuffer(this._glFrameBuffer);
      this._glFrameBuffer = null;
    }
    if (this._glDepthBuffer) {
      gl.deleteRenderbuffer(this._glDepthBuffer);
      this._glDepthBuffer = null;
    }
    if (this._glResolveFrameBuffer) {
      gl.deleteFramebuffer(this._glResolveFrameBuffer);
      this._glResolveFrameBuffer = null;
    }
    this._glMsaaColorBuffers.forEach(buffer => {
      gl.deleteRenderbuffer(buffer);
    });
    this._glMsaaColorBuffers.length = 0;
    (_this$colorMrtFramebu = this.colorMrtFramebuffers) == null ? void 0 : _this$colorMrtFramebu.forEach(framebuffer => {
      framebuffer.destroy(gl);
    });
    this.colorMrtFramebuffers = null;
    if (this._glMsaaDepthBuffer) {
      gl.deleteRenderbuffer(this._glMsaaDepthBuffer);
      this._glMsaaDepthBuffer = null;
    }
  }
  get initialized() {
    return this._isInitialized;
  }
  init(device, target) {
    const gl = device.gl;
    this._isInitialized = true;
    const buffers = [];
    if (this.suppliedColorFramebuffer !== undefined) {
      this._glFrameBuffer = this.suppliedColorFramebuffer;
    } else {
      var _target$_colorBuffers, _target$_colorBuffers2, _device$extDrawBuffer, _device$extDrawBuffer2;
      // ##### Create main FBO #####
      this._glFrameBuffer = gl.createFramebuffer();
      device.setFramebuffer(this._glFrameBuffer);

      // --- Init the provided color buffer (optional) ---
      const colorBufferCount = (_target$_colorBuffers = (_target$_colorBuffers2 = target._colorBuffers) == null ? void 0 : _target$_colorBuffers2.length) != null ? _target$_colorBuffers : 0;
      const attachmentBaseConstant = device.webgl2 ? gl.COLOR_ATTACHMENT0 : (_device$extDrawBuffer = (_device$extDrawBuffer2 = device.extDrawBuffers) == null ? void 0 : _device$extDrawBuffer2.COLOR_ATTACHMENT0_WEBGL) != null ? _device$extDrawBuffer : gl.COLOR_ATTACHMENT0;
      for (let i = 0; i < colorBufferCount; ++i) {
        const colorBuffer = target.getColorBuffer(i);
        if (colorBuffer) {
          if (!colorBuffer.impl._glTexture) {
            // Clamp the render buffer size to the maximum supported by the device
            colorBuffer._width = Math.min(colorBuffer.width, device.maxRenderBufferSize);
            colorBuffer._height = Math.min(colorBuffer.height, device.maxRenderBufferSize);
            device.setTexture(colorBuffer, 0);
          }
          // Attach the color buffer
          gl.framebufferTexture2D(gl.FRAMEBUFFER, attachmentBaseConstant + i, colorBuffer._cubemap ? gl.TEXTURE_CUBE_MAP_POSITIVE_X + target._face : gl.TEXTURE_2D, colorBuffer.impl._glTexture, 0);
          buffers.push(attachmentBaseConstant + i);
        }
      }
      if (device.drawBuffers) {
        device.drawBuffers(buffers);
      }
      const depthBuffer = target._depthBuffer;
      if (depthBuffer) {
        // --- Init the provided depth/stencil buffer (optional, WebGL2 only) ---
        if (!depthBuffer.impl._glTexture) {
          // Clamp the render buffer size to the maximum supported by the device
          depthBuffer._width = Math.min(depthBuffer.width, device.maxRenderBufferSize);
          depthBuffer._height = Math.min(depthBuffer.height, device.maxRenderBufferSize);
          device.setTexture(depthBuffer, 0);
        }
        // Attach
        if (target._stencil) {
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, depthBuffer._cubemap ? gl.TEXTURE_CUBE_MAP_POSITIVE_X + target._face : gl.TEXTURE_2D, target._depthBuffer.impl._glTexture, 0);
        } else {
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, depthBuffer._cubemap ? gl.TEXTURE_CUBE_MAP_POSITIVE_X + target._face : gl.TEXTURE_2D, target._depthBuffer.impl._glTexture, 0);
        }
      } else if (target._depth) {
        // --- Init a new depth/stencil buffer (optional) ---
        // if device is a MSAA RT, and no buffer to resolve to, skip creating non-MSAA depth
        const willRenderMsaa = target._samples > 1 && device.webgl2;
        if (!willRenderMsaa) {
          if (!this._glDepthBuffer) {
            this._glDepthBuffer = gl.createRenderbuffer();
          }
          gl.bindRenderbuffer(gl.RENDERBUFFER, this._glDepthBuffer);
          if (target._stencil) {
            gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_STENCIL, target.width, target.height);
            gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, this._glDepthBuffer);
          } else {
            const depthFormat = device.webgl2 ? gl.DEPTH_COMPONENT32F : gl.DEPTH_COMPONENT16;
            gl.renderbufferStorage(gl.RENDERBUFFER, depthFormat, target.width, target.height);
            gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this._glDepthBuffer);
          }
          gl.bindRenderbuffer(gl.RENDERBUFFER, null);
        }
      }
      Debug.call(() => this._checkFbo(device, target));
    }

    // ##### Create MSAA FBO (WebGL2 only) #####
    if (device.webgl2 && target._samples > 1) {
      var _target$_colorBuffers3, _target$_colorBuffers4;
      // Use previous FBO for resolves
      this._glResolveFrameBuffer = this._glFrameBuffer;

      // Actual FBO will be MSAA
      this._glFrameBuffer = gl.createFramebuffer();
      device.setFramebuffer(this._glFrameBuffer);

      // Create an optional MSAA color buffers
      const colorBufferCount = (_target$_colorBuffers3 = (_target$_colorBuffers4 = target._colorBuffers) == null ? void 0 : _target$_colorBuffers4.length) != null ? _target$_colorBuffers3 : 0;
      if (this.suppliedColorFramebuffer !== undefined) {
        const buffer = gl.createRenderbuffer();
        this._glMsaaColorBuffers.push(buffer);
        const internalFormat = device.backBufferFormat === PIXELFORMAT_RGBA8 ? gl.RGBA8 : gl.RGB8;
        gl.bindRenderbuffer(gl.RENDERBUFFER, buffer);
        gl.renderbufferStorageMultisample(gl.RENDERBUFFER, target._samples, internalFormat, target.width, target.height);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, buffer);
      } else {
        for (let i = 0; i < colorBufferCount; ++i) {
          const colorBuffer = target.getColorBuffer(i);
          if (colorBuffer) {
            const buffer = gl.createRenderbuffer();
            this._glMsaaColorBuffers.push(buffer);
            gl.bindRenderbuffer(gl.RENDERBUFFER, buffer);
            gl.renderbufferStorageMultisample(gl.RENDERBUFFER, target._samples, colorBuffer.impl._glInternalFormat, target.width, target.height);
            gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.RENDERBUFFER, buffer);
          }
        }
      }

      // Optionally add a MSAA depth/stencil buffer
      if (target._depth) {
        if (!this._glMsaaDepthBuffer) {
          this._glMsaaDepthBuffer = gl.createRenderbuffer();
        }
        gl.bindRenderbuffer(gl.RENDERBUFFER, this._glMsaaDepthBuffer);
        if (target._stencil) {
          gl.renderbufferStorageMultisample(gl.RENDERBUFFER, target._samples, gl.DEPTH24_STENCIL8, target.width, target.height);
          gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, this._glMsaaDepthBuffer);
        } else {
          gl.renderbufferStorageMultisample(gl.RENDERBUFFER, target._samples, gl.DEPTH_COMPONENT32F, target.width, target.height);
          gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this._glMsaaDepthBuffer);
        }
      }
      Debug.call(() => this._checkFbo(device, target, 'MSAA'));
      if (colorBufferCount > 1) {
        // create framebuffers allowing us to individually resolve each color buffer
        this._createMsaaMrtFramebuffers(device, target, colorBufferCount);

        // restore rendering back to the main framebuffer
        device.setFramebuffer(this._glFrameBuffer);
        device.drawBuffers(buffers);
      }
    }
  }
  _createMsaaMrtFramebuffers(device, target, colorBufferCount) {
    const gl = device.gl;
    this.colorMrtFramebuffers = [];
    for (let i = 0; i < colorBufferCount; ++i) {
      const colorBuffer = target.getColorBuffer(i);

      // src
      const srcFramebuffer = gl.createFramebuffer();
      device.setFramebuffer(srcFramebuffer);
      const buffer = this._glMsaaColorBuffers[i];
      gl.bindRenderbuffer(gl.RENDERBUFFER, buffer);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, target._samples, colorBuffer.impl._glInternalFormat, target.width, target.height);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, buffer);
      device.drawBuffers([gl.COLOR_ATTACHMENT0]);
      Debug.call(() => this._checkFbo(device, target, `MSAA-MRT-src${i}`));

      // dst
      const dstFramebuffer = gl.createFramebuffer();
      device.setFramebuffer(dstFramebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, colorBuffer._cubemap ? gl.TEXTURE_CUBE_MAP_POSITIVE_X + target._face : gl.TEXTURE_2D, colorBuffer.impl._glTexture, 0);
      this.colorMrtFramebuffers[i] = new FramebufferPair(srcFramebuffer, dstFramebuffer);
      Debug.call(() => this._checkFbo(device, target, `MSAA-MRT-dst${i}`));
    }
  }

  /**
   * Checks the completeness status of the currently bound WebGLFramebuffer object.
   *
   * @private
   */
  _checkFbo(device, target, type = '') {
    const gl = device.gl;
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    let errorCode;
    switch (status) {
      case gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT:
        errorCode = 'FRAMEBUFFER_INCOMPLETE_ATTACHMENT';
        break;
      case gl.FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT:
        errorCode = 'FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT';
        break;
      case gl.FRAMEBUFFER_INCOMPLETE_DIMENSIONS:
        errorCode = 'FRAMEBUFFER_INCOMPLETE_DIMENSIONS';
        break;
      case gl.FRAMEBUFFER_UNSUPPORTED:
        errorCode = 'FRAMEBUFFER_UNSUPPORTED';
        break;
    }
    Debug.assert(!errorCode, `Framebuffer creation failed with error code ${errorCode}, render target: ${target.name} ${type}`, target);
  }
  loseContext() {
    this._glFrameBuffer = null;
    this._glDepthBuffer = null;
    this._glResolveFrameBuffer = null;
    this._glMsaaColorBuffers.length = 0;
    this._glMsaaDepthBuffer = null;
    this.colorMrtFramebuffers = null;
    this.suppliedColorFramebuffer = undefined;
    this._isInitialized = false;
  }
  internalResolve(device, src, dst, target, mask) {
    Debug.assert(src !== dst, 'Source and destination framebuffers must be different when blitting.');
    const gl = device.gl;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, src);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, dst);
    gl.blitFramebuffer(0, 0, target.width, target.height, 0, 0, target.width, target.height, mask, gl.NEAREST);
  }
  resolve(device, target, color, depth) {
    if (device.webgl2) {
      const gl = device.gl;

      // if MRT is used, we need to resolve each buffer individually
      if (this.colorMrtFramebuffers) {
        // color
        if (color) {
          for (let i = 0; i < this.colorMrtFramebuffers.length; i++) {
            const fbPair = this.colorMrtFramebuffers[i];
            DebugGraphics.pushGpuMarker(device, `RESOLVE-MRT${i}`);
            this.internalResolve(device, fbPair.msaaFB, fbPair.resolveFB, target, gl.COLOR_BUFFER_BIT);
            DebugGraphics.popGpuMarker(device);
          }
        }

        // depth
        if (depth) {
          DebugGraphics.pushGpuMarker(device, `RESOLVE-MRT-DEPTH`);
          this.internalResolve(device, this._glFrameBuffer, this._glResolveFrameBuffer, target, gl.DEPTH_BUFFER_BIT);
          DebugGraphics.popGpuMarker(device);
        }
      } else {
        DebugGraphics.pushGpuMarker(device, `RESOLVE`);
        this.internalResolve(device, this._glFrameBuffer, this._glResolveFrameBuffer, target, (color ? gl.COLOR_BUFFER_BIT : 0) | (depth ? gl.DEPTH_BUFFER_BIT : 0));
        DebugGraphics.popGpuMarker(device);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, this._glFrameBuffer);
    }
  }
}

export { WebglRenderTarget };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2ViZ2wtcmVuZGVyLXRhcmdldC5qcyIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vc3JjL3BsYXRmb3JtL2dyYXBoaWNzL3dlYmdsL3dlYmdsLXJlbmRlci10YXJnZXQuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgRGVidWcgfSBmcm9tIFwiLi4vLi4vLi4vY29yZS9kZWJ1Zy5qc1wiO1xuaW1wb3J0IHsgUElYRUxGT1JNQVRfUkdCQTggfSBmcm9tIFwiLi4vY29uc3RhbnRzLmpzXCI7XG5pbXBvcnQgeyBEZWJ1Z0dyYXBoaWNzIH0gZnJvbSBcIi4uL2RlYnVnLWdyYXBoaWNzLmpzXCI7XG5cbi8qKlxuICogQSBwcml2YXRlIGNsYXNzIHJlcHJlc2VudGluZyBhIHBhaXIgb2YgZnJhbWVidWZmZXJzLCB3aGVuIE1TQUEgaXMgdXNlZC5cbiAqXG4gKiBAaWdub3JlXG4gKi9cbmNsYXNzIEZyYW1lYnVmZmVyUGFpciB7XG4gICAgLyoqIE11bHRpLXNhbXBsZWQgcmVuZGVyaW5nIGZyYW1lYnVmZmVyICovXG4gICAgbXNhYUZCO1xuXG4gICAgLyoqIFNpbmdsZS1zYW1wbGVkIHJlc29sdmUgZnJhbWVidWZmZXIgKi9cbiAgICByZXNvbHZlRkI7XG5cbiAgICBjb25zdHJ1Y3Rvcihtc2FhRkIsIHJlc29sdmVGQikge1xuICAgICAgICB0aGlzLm1zYWFGQiA9IG1zYWFGQjtcbiAgICAgICAgdGhpcy5yZXNvbHZlRkIgPSByZXNvbHZlRkI7XG4gICAgfVxuXG4gICAgZGVzdHJveShnbCkge1xuICAgICAgICBpZiAodGhpcy5tc2FhRkIpIHtcbiAgICAgICAgICAgIGdsLmRlbGV0ZVJlbmRlcmJ1ZmZlcih0aGlzLm1zYWFGQik7XG4gICAgICAgICAgICB0aGlzLm1zYWFGQiA9IG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5yZXNvbHZlRkIpIHtcbiAgICAgICAgICAgIGdsLmRlbGV0ZVJlbmRlcmJ1ZmZlcih0aGlzLnJlc29sdmVGQik7XG4gICAgICAgICAgICB0aGlzLnJlc29sdmVGQiA9IG51bGw7XG4gICAgICAgIH1cbiAgICB9XG59XG5cbi8qKlxuICogQSBXZWJHTCBpbXBsZW1lbnRhdGlvbiBvZiB0aGUgUmVuZGVyVGFyZ2V0LlxuICpcbiAqIEBpZ25vcmVcbiAqL1xuY2xhc3MgV2ViZ2xSZW5kZXJUYXJnZXQge1xuICAgIF9nbEZyYW1lQnVmZmVyID0gbnVsbDtcblxuICAgIF9nbERlcHRoQnVmZmVyID0gbnVsbDtcblxuICAgIF9nbFJlc29sdmVGcmFtZUJ1ZmZlciA9IG51bGw7XG5cbiAgICAvKipcbiAgICAgKiBBIGxpc3Qgb2YgZnJhbWVidWZmZXJzIGNyZWF0ZWQgV2hlbiBNU0FBIGFuZCBNUlQgYXJlIHVzZWQgdG9nZXRoZXIsIG9uZSBmb3IgZWFjaCBjb2xvciBidWZmZXIuXG4gICAgICogVGhpcyBhbGxvd3MgY29sb3IgYnVmZmVycyB0byBiZSByZXNvbHZlZCBzZXBhcmF0ZWx5LlxuICAgICAqXG4gICAgICogQHR5cGUge0ZyYW1lYnVmZmVyUGFpcltdfVxuICAgICAqL1xuICAgIGNvbG9yTXJ0RnJhbWVidWZmZXJzID0gbnVsbDtcblxuICAgIF9nbE1zYWFDb2xvckJ1ZmZlcnMgPSBbXTtcblxuICAgIF9nbE1zYWFEZXB0aEJ1ZmZlciA9IG51bGw7XG5cbiAgICAvKipcbiAgICAgKiBUaGUgc3VwcGxpZWQgc2luZ2xlLXNhbXBsZWQgZnJhbWVidWZmZXIgZm9yIHJlbmRlcmluZy4gVW5kZWZpbmVkIHJlcHJlc2VudHMgbm8gc3VwcGxpZWRcbiAgICAgKiBmcmFtZWJ1ZmZlci4gTnVsbCByZXByZXNlbnRzIHRoZSBkZWZhdWx0IGZyYW1lYnVmZmVyLiBBIHZhbHVlIHJlcHJlc2VudHMgYSB1c2VyLXN1cHBsaWVkXG4gICAgICogZnJhbWVidWZmZXIuXG4gICAgICovXG4gICAgc3VwcGxpZWRDb2xvckZyYW1lYnVmZmVyO1xuXG4gICAgX2lzSW5pdGlhbGl6ZWQgPSBmYWxzZTtcblxuICAgIGRlc3Ryb3koZGV2aWNlKSB7XG4gICAgICAgIGNvbnN0IGdsID0gZGV2aWNlLmdsO1xuICAgICAgICB0aGlzLl9pc0luaXRpYWxpemVkID0gZmFsc2U7XG5cbiAgICAgICAgaWYgKHRoaXMuX2dsRnJhbWVCdWZmZXIpIHtcbiAgICAgICAgICAgIGdsLmRlbGV0ZUZyYW1lYnVmZmVyKHRoaXMuX2dsRnJhbWVCdWZmZXIpO1xuICAgICAgICAgICAgdGhpcy5fZ2xGcmFtZUJ1ZmZlciA9IG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5fZ2xEZXB0aEJ1ZmZlcikge1xuICAgICAgICAgICAgZ2wuZGVsZXRlUmVuZGVyYnVmZmVyKHRoaXMuX2dsRGVwdGhCdWZmZXIpO1xuICAgICAgICAgICAgdGhpcy5fZ2xEZXB0aEJ1ZmZlciA9IG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5fZ2xSZXNvbHZlRnJhbWVCdWZmZXIpIHtcbiAgICAgICAgICAgIGdsLmRlbGV0ZUZyYW1lYnVmZmVyKHRoaXMuX2dsUmVzb2x2ZUZyYW1lQnVmZmVyKTtcbiAgICAgICAgICAgIHRoaXMuX2dsUmVzb2x2ZUZyYW1lQnVmZmVyID0gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuX2dsTXNhYUNvbG9yQnVmZmVycy5mb3JFYWNoKChidWZmZXIpID0+IHtcbiAgICAgICAgICAgIGdsLmRlbGV0ZVJlbmRlcmJ1ZmZlcihidWZmZXIpO1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5fZ2xNc2FhQ29sb3JCdWZmZXJzLmxlbmd0aCA9IDA7XG5cbiAgICAgICAgdGhpcy5jb2xvck1ydEZyYW1lYnVmZmVycz8uZm9yRWFjaCgoZnJhbWVidWZmZXIpID0+IHtcbiAgICAgICAgICAgIGZyYW1lYnVmZmVyLmRlc3Ryb3koZ2wpO1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5jb2xvck1ydEZyYW1lYnVmZmVycyA9IG51bGw7XG5cbiAgICAgICAgaWYgKHRoaXMuX2dsTXNhYURlcHRoQnVmZmVyKSB7XG4gICAgICAgICAgICBnbC5kZWxldGVSZW5kZXJidWZmZXIodGhpcy5fZ2xNc2FhRGVwdGhCdWZmZXIpO1xuICAgICAgICAgICAgdGhpcy5fZ2xNc2FhRGVwdGhCdWZmZXIgPSBudWxsO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2V0IGluaXRpYWxpemVkKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5faXNJbml0aWFsaXplZDtcbiAgICB9XG5cbiAgICBpbml0KGRldmljZSwgdGFyZ2V0KSB7XG4gICAgICAgIGNvbnN0IGdsID0gZGV2aWNlLmdsO1xuXG4gICAgICAgIHRoaXMuX2lzSW5pdGlhbGl6ZWQgPSB0cnVlO1xuICAgICAgICBjb25zdCBidWZmZXJzID0gW107XG5cbiAgICAgICAgaWYgKHRoaXMuc3VwcGxpZWRDb2xvckZyYW1lYnVmZmVyICE9PSB1bmRlZmluZWQpIHtcblxuICAgICAgICAgICAgdGhpcy5fZ2xGcmFtZUJ1ZmZlciA9IHRoaXMuc3VwcGxpZWRDb2xvckZyYW1lYnVmZmVyO1xuXG4gICAgICAgIH0gZWxzZSB7XG5cbiAgICAgICAgICAgIC8vICMjIyMjIENyZWF0ZSBtYWluIEZCTyAjIyMjI1xuICAgICAgICAgICAgdGhpcy5fZ2xGcmFtZUJ1ZmZlciA9IGdsLmNyZWF0ZUZyYW1lYnVmZmVyKCk7XG4gICAgICAgICAgICBkZXZpY2Uuc2V0RnJhbWVidWZmZXIodGhpcy5fZ2xGcmFtZUJ1ZmZlcik7XG5cbiAgICAgICAgICAgIC8vIC0tLSBJbml0IHRoZSBwcm92aWRlZCBjb2xvciBidWZmZXIgKG9wdGlvbmFsKSAtLS1cbiAgICAgICAgICAgIGNvbnN0IGNvbG9yQnVmZmVyQ291bnQgPSB0YXJnZXQuX2NvbG9yQnVmZmVycz8ubGVuZ3RoID8/IDA7XG4gICAgICAgICAgICBjb25zdCBhdHRhY2htZW50QmFzZUNvbnN0YW50ID0gZGV2aWNlLndlYmdsMiA/IGdsLkNPTE9SX0FUVEFDSE1FTlQwIDogKGRldmljZS5leHREcmF3QnVmZmVycz8uQ09MT1JfQVRUQUNITUVOVDBfV0VCR0wgPz8gZ2wuQ09MT1JfQVRUQUNITUVOVDApO1xuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjb2xvckJ1ZmZlckNvdW50OyArK2kpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBjb2xvckJ1ZmZlciA9IHRhcmdldC5nZXRDb2xvckJ1ZmZlcihpKTtcbiAgICAgICAgICAgICAgICBpZiAoY29sb3JCdWZmZXIpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFjb2xvckJ1ZmZlci5pbXBsLl9nbFRleHR1cmUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIENsYW1wIHRoZSByZW5kZXIgYnVmZmVyIHNpemUgdG8gdGhlIG1heGltdW0gc3VwcG9ydGVkIGJ5IHRoZSBkZXZpY2VcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbG9yQnVmZmVyLl93aWR0aCA9IE1hdGgubWluKGNvbG9yQnVmZmVyLndpZHRoLCBkZXZpY2UubWF4UmVuZGVyQnVmZmVyU2l6ZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb2xvckJ1ZmZlci5faGVpZ2h0ID0gTWF0aC5taW4oY29sb3JCdWZmZXIuaGVpZ2h0LCBkZXZpY2UubWF4UmVuZGVyQnVmZmVyU2l6ZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBkZXZpY2Uuc2V0VGV4dHVyZShjb2xvckJ1ZmZlciwgMCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgLy8gQXR0YWNoIHRoZSBjb2xvciBidWZmZXJcbiAgICAgICAgICAgICAgICAgICAgZ2wuZnJhbWVidWZmZXJUZXh0dXJlMkQoXG4gICAgICAgICAgICAgICAgICAgICAgICBnbC5GUkFNRUJVRkZFUixcbiAgICAgICAgICAgICAgICAgICAgICAgIGF0dGFjaG1lbnRCYXNlQ29uc3RhbnQgKyBpLFxuICAgICAgICAgICAgICAgICAgICAgICAgY29sb3JCdWZmZXIuX2N1YmVtYXAgPyBnbC5URVhUVVJFX0NVQkVfTUFQX1BPU0lUSVZFX1ggKyB0YXJnZXQuX2ZhY2UgOiBnbC5URVhUVVJFXzJELFxuICAgICAgICAgICAgICAgICAgICAgICAgY29sb3JCdWZmZXIuaW1wbC5fZ2xUZXh0dXJlLFxuICAgICAgICAgICAgICAgICAgICAgICAgMFxuICAgICAgICAgICAgICAgICAgICApO1xuXG4gICAgICAgICAgICAgICAgICAgIGJ1ZmZlcnMucHVzaChhdHRhY2htZW50QmFzZUNvbnN0YW50ICsgaSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoZGV2aWNlLmRyYXdCdWZmZXJzKSB7XG4gICAgICAgICAgICAgICAgZGV2aWNlLmRyYXdCdWZmZXJzKGJ1ZmZlcnMpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBkZXB0aEJ1ZmZlciA9IHRhcmdldC5fZGVwdGhCdWZmZXI7XG4gICAgICAgICAgICBpZiAoZGVwdGhCdWZmZXIpIHtcbiAgICAgICAgICAgICAgICAvLyAtLS0gSW5pdCB0aGUgcHJvdmlkZWQgZGVwdGgvc3RlbmNpbCBidWZmZXIgKG9wdGlvbmFsLCBXZWJHTDIgb25seSkgLS0tXG4gICAgICAgICAgICAgICAgaWYgKCFkZXB0aEJ1ZmZlci5pbXBsLl9nbFRleHR1cmUpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gQ2xhbXAgdGhlIHJlbmRlciBidWZmZXIgc2l6ZSB0byB0aGUgbWF4aW11bSBzdXBwb3J0ZWQgYnkgdGhlIGRldmljZVxuICAgICAgICAgICAgICAgICAgICBkZXB0aEJ1ZmZlci5fd2lkdGggPSBNYXRoLm1pbihkZXB0aEJ1ZmZlci53aWR0aCwgZGV2aWNlLm1heFJlbmRlckJ1ZmZlclNpemUpO1xuICAgICAgICAgICAgICAgICAgICBkZXB0aEJ1ZmZlci5faGVpZ2h0ID0gTWF0aC5taW4oZGVwdGhCdWZmZXIuaGVpZ2h0LCBkZXZpY2UubWF4UmVuZGVyQnVmZmVyU2l6ZSk7XG4gICAgICAgICAgICAgICAgICAgIGRldmljZS5zZXRUZXh0dXJlKGRlcHRoQnVmZmVyLCAwKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgLy8gQXR0YWNoXG4gICAgICAgICAgICAgICAgaWYgKHRhcmdldC5fc3RlbmNpbCkge1xuICAgICAgICAgICAgICAgICAgICBnbC5mcmFtZWJ1ZmZlclRleHR1cmUyRChnbC5GUkFNRUJVRkZFUiwgZ2wuREVQVEhfU1RFTkNJTF9BVFRBQ0hNRU5ULFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZXB0aEJ1ZmZlci5fY3ViZW1hcCA/IGdsLlRFWFRVUkVfQ1VCRV9NQVBfUE9TSVRJVkVfWCArIHRhcmdldC5fZmFjZSA6IGdsLlRFWFRVUkVfMkQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRhcmdldC5fZGVwdGhCdWZmZXIuaW1wbC5fZ2xUZXh0dXJlLCAwKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBnbC5mcmFtZWJ1ZmZlclRleHR1cmUyRChnbC5GUkFNRUJVRkZFUiwgZ2wuREVQVEhfQVRUQUNITUVOVCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVwdGhCdWZmZXIuX2N1YmVtYXAgPyBnbC5URVhUVVJFX0NVQkVfTUFQX1BPU0lUSVZFX1ggKyB0YXJnZXQuX2ZhY2UgOiBnbC5URVhUVVJFXzJELFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0YXJnZXQuX2RlcHRoQnVmZmVyLmltcGwuX2dsVGV4dHVyZSwgMCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIGlmICh0YXJnZXQuX2RlcHRoKSB7XG4gICAgICAgICAgICAgICAgLy8gLS0tIEluaXQgYSBuZXcgZGVwdGgvc3RlbmNpbCBidWZmZXIgKG9wdGlvbmFsKSAtLS1cbiAgICAgICAgICAgICAgICAvLyBpZiBkZXZpY2UgaXMgYSBNU0FBIFJULCBhbmQgbm8gYnVmZmVyIHRvIHJlc29sdmUgdG8sIHNraXAgY3JlYXRpbmcgbm9uLU1TQUEgZGVwdGhcbiAgICAgICAgICAgICAgICBjb25zdCB3aWxsUmVuZGVyTXNhYSA9IHRhcmdldC5fc2FtcGxlcyA+IDEgJiYgZGV2aWNlLndlYmdsMjtcbiAgICAgICAgICAgICAgICBpZiAoIXdpbGxSZW5kZXJNc2FhKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICghdGhpcy5fZ2xEZXB0aEJ1ZmZlcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fZ2xEZXB0aEJ1ZmZlciA9IGdsLmNyZWF0ZVJlbmRlcmJ1ZmZlcigpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGdsLmJpbmRSZW5kZXJidWZmZXIoZ2wuUkVOREVSQlVGRkVSLCB0aGlzLl9nbERlcHRoQnVmZmVyKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRhcmdldC5fc3RlbmNpbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZ2wucmVuZGVyYnVmZmVyU3RvcmFnZShnbC5SRU5ERVJCVUZGRVIsIGdsLkRFUFRIX1NURU5DSUwsIHRhcmdldC53aWR0aCwgdGFyZ2V0LmhlaWdodCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBnbC5mcmFtZWJ1ZmZlclJlbmRlcmJ1ZmZlcihnbC5GUkFNRUJVRkZFUiwgZ2wuREVQVEhfU1RFTkNJTF9BVFRBQ0hNRU5ULCBnbC5SRU5ERVJCVUZGRVIsIHRoaXMuX2dsRGVwdGhCdWZmZXIpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZGVwdGhGb3JtYXQgPSBkZXZpY2Uud2ViZ2wyID8gZ2wuREVQVEhfQ09NUE9ORU5UMzJGIDogZ2wuREVQVEhfQ09NUE9ORU5UMTY7XG4gICAgICAgICAgICAgICAgICAgICAgICBnbC5yZW5kZXJidWZmZXJTdG9yYWdlKGdsLlJFTkRFUkJVRkZFUiwgZGVwdGhGb3JtYXQsIHRhcmdldC53aWR0aCwgdGFyZ2V0LmhlaWdodCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBnbC5mcmFtZWJ1ZmZlclJlbmRlcmJ1ZmZlcihnbC5GUkFNRUJVRkZFUiwgZ2wuREVQVEhfQVRUQUNITUVOVCwgZ2wuUkVOREVSQlVGRkVSLCB0aGlzLl9nbERlcHRoQnVmZmVyKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBnbC5iaW5kUmVuZGVyYnVmZmVyKGdsLlJFTkRFUkJVRkZFUiwgbnVsbCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBEZWJ1Zy5jYWxsKCgpID0+IHRoaXMuX2NoZWNrRmJvKGRldmljZSwgdGFyZ2V0KSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyAjIyMjIyBDcmVhdGUgTVNBQSBGQk8gKFdlYkdMMiBvbmx5KSAjIyMjI1xuICAgICAgICBpZiAoZGV2aWNlLndlYmdsMiAmJiB0YXJnZXQuX3NhbXBsZXMgPiAxKSB7XG5cbiAgICAgICAgICAgIC8vIFVzZSBwcmV2aW91cyBGQk8gZm9yIHJlc29sdmVzXG4gICAgICAgICAgICB0aGlzLl9nbFJlc29sdmVGcmFtZUJ1ZmZlciA9IHRoaXMuX2dsRnJhbWVCdWZmZXI7XG5cbiAgICAgICAgICAgIC8vIEFjdHVhbCBGQk8gd2lsbCBiZSBNU0FBXG4gICAgICAgICAgICB0aGlzLl9nbEZyYW1lQnVmZmVyID0gZ2wuY3JlYXRlRnJhbWVidWZmZXIoKTtcbiAgICAgICAgICAgIGRldmljZS5zZXRGcmFtZWJ1ZmZlcih0aGlzLl9nbEZyYW1lQnVmZmVyKTtcblxuICAgICAgICAgICAgLy8gQ3JlYXRlIGFuIG9wdGlvbmFsIE1TQUEgY29sb3IgYnVmZmVyc1xuICAgICAgICAgICAgY29uc3QgY29sb3JCdWZmZXJDb3VudCA9IHRhcmdldC5fY29sb3JCdWZmZXJzPy5sZW5ndGggPz8gMDtcblxuICAgICAgICAgICAgaWYgKHRoaXMuc3VwcGxpZWRDb2xvckZyYW1lYnVmZmVyICE9PSB1bmRlZmluZWQpIHtcblxuICAgICAgICAgICAgICAgIGNvbnN0IGJ1ZmZlciA9IGdsLmNyZWF0ZVJlbmRlcmJ1ZmZlcigpO1xuICAgICAgICAgICAgICAgIHRoaXMuX2dsTXNhYUNvbG9yQnVmZmVycy5wdXNoKGJ1ZmZlcik7XG5cbiAgICAgICAgICAgICAgICBjb25zdCBpbnRlcm5hbEZvcm1hdCA9IGRldmljZS5iYWNrQnVmZmVyRm9ybWF0ID09PSBQSVhFTEZPUk1BVF9SR0JBOCA/IGdsLlJHQkE4IDogZ2wuUkdCODtcblxuICAgICAgICAgICAgICAgIGdsLmJpbmRSZW5kZXJidWZmZXIoZ2wuUkVOREVSQlVGRkVSLCBidWZmZXIpO1xuICAgICAgICAgICAgICAgIGdsLnJlbmRlcmJ1ZmZlclN0b3JhZ2VNdWx0aXNhbXBsZShnbC5SRU5ERVJCVUZGRVIsIHRhcmdldC5fc2FtcGxlcywgaW50ZXJuYWxGb3JtYXQsIHRhcmdldC53aWR0aCwgdGFyZ2V0LmhlaWdodCk7XG4gICAgICAgICAgICAgICAgZ2wuZnJhbWVidWZmZXJSZW5kZXJidWZmZXIoZ2wuRlJBTUVCVUZGRVIsIGdsLkNPTE9SX0FUVEFDSE1FTlQwLCBnbC5SRU5ERVJCVUZGRVIsIGJ1ZmZlcik7XG5cbiAgICAgICAgICAgIH0gZWxzZSB7XG5cbiAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGNvbG9yQnVmZmVyQ291bnQ7ICsraSkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBjb2xvckJ1ZmZlciA9IHRhcmdldC5nZXRDb2xvckJ1ZmZlcihpKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNvbG9yQnVmZmVyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBidWZmZXIgPSBnbC5jcmVhdGVSZW5kZXJidWZmZXIoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX2dsTXNhYUNvbG9yQnVmZmVycy5wdXNoKGJ1ZmZlcik7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGdsLmJpbmRSZW5kZXJidWZmZXIoZ2wuUkVOREVSQlVGRkVSLCBidWZmZXIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgZ2wucmVuZGVyYnVmZmVyU3RvcmFnZU11bHRpc2FtcGxlKGdsLlJFTkRFUkJVRkZFUiwgdGFyZ2V0Ll9zYW1wbGVzLCBjb2xvckJ1ZmZlci5pbXBsLl9nbEludGVybmFsRm9ybWF0LCB0YXJnZXQud2lkdGgsIHRhcmdldC5oZWlnaHQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgZ2wuZnJhbWVidWZmZXJSZW5kZXJidWZmZXIoZ2wuRlJBTUVCVUZGRVIsIGdsLkNPTE9SX0FUVEFDSE1FTlQwICsgaSwgZ2wuUkVOREVSQlVGRkVSLCBidWZmZXIpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBPcHRpb25hbGx5IGFkZCBhIE1TQUEgZGVwdGgvc3RlbmNpbCBidWZmZXJcbiAgICAgICAgICAgIGlmICh0YXJnZXQuX2RlcHRoKSB7XG4gICAgICAgICAgICAgICAgaWYgKCF0aGlzLl9nbE1zYWFEZXB0aEJ1ZmZlcikge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9nbE1zYWFEZXB0aEJ1ZmZlciA9IGdsLmNyZWF0ZVJlbmRlcmJ1ZmZlcigpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBnbC5iaW5kUmVuZGVyYnVmZmVyKGdsLlJFTkRFUkJVRkZFUiwgdGhpcy5fZ2xNc2FhRGVwdGhCdWZmZXIpO1xuICAgICAgICAgICAgICAgIGlmICh0YXJnZXQuX3N0ZW5jaWwpIHtcbiAgICAgICAgICAgICAgICAgICAgZ2wucmVuZGVyYnVmZmVyU3RvcmFnZU11bHRpc2FtcGxlKGdsLlJFTkRFUkJVRkZFUiwgdGFyZ2V0Ll9zYW1wbGVzLCBnbC5ERVBUSDI0X1NURU5DSUw4LCB0YXJnZXQud2lkdGgsIHRhcmdldC5oZWlnaHQpO1xuICAgICAgICAgICAgICAgICAgICBnbC5mcmFtZWJ1ZmZlclJlbmRlcmJ1ZmZlcihnbC5GUkFNRUJVRkZFUiwgZ2wuREVQVEhfU1RFTkNJTF9BVFRBQ0hNRU5ULCBnbC5SRU5ERVJCVUZGRVIsIHRoaXMuX2dsTXNhYURlcHRoQnVmZmVyKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBnbC5yZW5kZXJidWZmZXJTdG9yYWdlTXVsdGlzYW1wbGUoZ2wuUkVOREVSQlVGRkVSLCB0YXJnZXQuX3NhbXBsZXMsIGdsLkRFUFRIX0NPTVBPTkVOVDMyRiwgdGFyZ2V0LndpZHRoLCB0YXJnZXQuaGVpZ2h0KTtcbiAgICAgICAgICAgICAgICAgICAgZ2wuZnJhbWVidWZmZXJSZW5kZXJidWZmZXIoZ2wuRlJBTUVCVUZGRVIsIGdsLkRFUFRIX0FUVEFDSE1FTlQsIGdsLlJFTkRFUkJVRkZFUiwgdGhpcy5fZ2xNc2FhRGVwdGhCdWZmZXIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgRGVidWcuY2FsbCgoKSA9PiB0aGlzLl9jaGVja0ZibyhkZXZpY2UsIHRhcmdldCwgJ01TQUEnKSk7XG5cbiAgICAgICAgICAgIGlmIChjb2xvckJ1ZmZlckNvdW50ID4gMSkge1xuICAgICAgICAgICAgICAgIC8vIGNyZWF0ZSBmcmFtZWJ1ZmZlcnMgYWxsb3dpbmcgdXMgdG8gaW5kaXZpZHVhbGx5IHJlc29sdmUgZWFjaCBjb2xvciBidWZmZXJcbiAgICAgICAgICAgICAgICB0aGlzLl9jcmVhdGVNc2FhTXJ0RnJhbWVidWZmZXJzKGRldmljZSwgdGFyZ2V0LCBjb2xvckJ1ZmZlckNvdW50KTtcblxuICAgICAgICAgICAgICAgIC8vIHJlc3RvcmUgcmVuZGVyaW5nIGJhY2sgdG8gdGhlIG1haW4gZnJhbWVidWZmZXJcbiAgICAgICAgICAgICAgICBkZXZpY2Uuc2V0RnJhbWVidWZmZXIodGhpcy5fZ2xGcmFtZUJ1ZmZlcik7XG4gICAgICAgICAgICAgICAgZGV2aWNlLmRyYXdCdWZmZXJzKGJ1ZmZlcnMpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgX2NyZWF0ZU1zYWFNcnRGcmFtZWJ1ZmZlcnMoZGV2aWNlLCB0YXJnZXQsIGNvbG9yQnVmZmVyQ291bnQpIHtcblxuICAgICAgICBjb25zdCBnbCA9IGRldmljZS5nbDtcbiAgICAgICAgdGhpcy5jb2xvck1ydEZyYW1lYnVmZmVycyA9IFtdO1xuXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgY29sb3JCdWZmZXJDb3VudDsgKytpKSB7XG4gICAgICAgICAgICBjb25zdCBjb2xvckJ1ZmZlciA9IHRhcmdldC5nZXRDb2xvckJ1ZmZlcihpKTtcblxuICAgICAgICAgICAgLy8gc3JjXG4gICAgICAgICAgICBjb25zdCBzcmNGcmFtZWJ1ZmZlciA9IGdsLmNyZWF0ZUZyYW1lYnVmZmVyKCk7XG4gICAgICAgICAgICBkZXZpY2Uuc2V0RnJhbWVidWZmZXIoc3JjRnJhbWVidWZmZXIpO1xuICAgICAgICAgICAgY29uc3QgYnVmZmVyID0gdGhpcy5fZ2xNc2FhQ29sb3JCdWZmZXJzW2ldO1xuXG4gICAgICAgICAgICBnbC5iaW5kUmVuZGVyYnVmZmVyKGdsLlJFTkRFUkJVRkZFUiwgYnVmZmVyKTtcbiAgICAgICAgICAgIGdsLnJlbmRlcmJ1ZmZlclN0b3JhZ2VNdWx0aXNhbXBsZShnbC5SRU5ERVJCVUZGRVIsIHRhcmdldC5fc2FtcGxlcywgY29sb3JCdWZmZXIuaW1wbC5fZ2xJbnRlcm5hbEZvcm1hdCwgdGFyZ2V0LndpZHRoLCB0YXJnZXQuaGVpZ2h0KTtcbiAgICAgICAgICAgIGdsLmZyYW1lYnVmZmVyUmVuZGVyYnVmZmVyKGdsLkZSQU1FQlVGRkVSLCBnbC5DT0xPUl9BVFRBQ0hNRU5UMCwgZ2wuUkVOREVSQlVGRkVSLCBidWZmZXIpO1xuXG4gICAgICAgICAgICBkZXZpY2UuZHJhd0J1ZmZlcnMoW2dsLkNPTE9SX0FUVEFDSE1FTlQwXSk7XG5cbiAgICAgICAgICAgIERlYnVnLmNhbGwoKCkgPT4gdGhpcy5fY2hlY2tGYm8oZGV2aWNlLCB0YXJnZXQsIGBNU0FBLU1SVC1zcmMke2l9YCkpO1xuXG4gICAgICAgICAgICAvLyBkc3RcbiAgICAgICAgICAgIGNvbnN0IGRzdEZyYW1lYnVmZmVyID0gZ2wuY3JlYXRlRnJhbWVidWZmZXIoKTtcbiAgICAgICAgICAgIGRldmljZS5zZXRGcmFtZWJ1ZmZlcihkc3RGcmFtZWJ1ZmZlcik7XG4gICAgICAgICAgICBnbC5mcmFtZWJ1ZmZlclRleHR1cmUyRChnbC5GUkFNRUJVRkZFUiwgZ2wuQ09MT1JfQVRUQUNITUVOVDAsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb2xvckJ1ZmZlci5fY3ViZW1hcCA/IGdsLlRFWFRVUkVfQ1VCRV9NQVBfUE9TSVRJVkVfWCArIHRhcmdldC5fZmFjZSA6IGdsLlRFWFRVUkVfMkQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb2xvckJ1ZmZlci5pbXBsLl9nbFRleHR1cmUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAwXG4gICAgICAgICAgICApO1xuXG4gICAgICAgICAgICB0aGlzLmNvbG9yTXJ0RnJhbWVidWZmZXJzW2ldID0gbmV3IEZyYW1lYnVmZmVyUGFpcihzcmNGcmFtZWJ1ZmZlciwgZHN0RnJhbWVidWZmZXIpO1xuXG4gICAgICAgICAgICBEZWJ1Zy5jYWxsKCgpID0+IHRoaXMuX2NoZWNrRmJvKGRldmljZSwgdGFyZ2V0LCBgTVNBQS1NUlQtZHN0JHtpfWApKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENoZWNrcyB0aGUgY29tcGxldGVuZXNzIHN0YXR1cyBvZiB0aGUgY3VycmVudGx5IGJvdW5kIFdlYkdMRnJhbWVidWZmZXIgb2JqZWN0LlxuICAgICAqXG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfY2hlY2tGYm8oZGV2aWNlLCB0YXJnZXQsIHR5cGUgPSAnJykge1xuICAgICAgICBjb25zdCBnbCA9IGRldmljZS5nbDtcbiAgICAgICAgY29uc3Qgc3RhdHVzID0gZ2wuY2hlY2tGcmFtZWJ1ZmZlclN0YXR1cyhnbC5GUkFNRUJVRkZFUik7XG4gICAgICAgIGxldCBlcnJvckNvZGU7XG4gICAgICAgIHN3aXRjaCAoc3RhdHVzKSB7XG4gICAgICAgICAgICBjYXNlIGdsLkZSQU1FQlVGRkVSX0lOQ09NUExFVEVfQVRUQUNITUVOVDpcbiAgICAgICAgICAgICAgICBlcnJvckNvZGUgPSAnRlJBTUVCVUZGRVJfSU5DT01QTEVURV9BVFRBQ0hNRU5UJztcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgZ2wuRlJBTUVCVUZGRVJfSU5DT01QTEVURV9NSVNTSU5HX0FUVEFDSE1FTlQ6XG4gICAgICAgICAgICAgICAgZXJyb3JDb2RlID0gJ0ZSQU1FQlVGRkVSX0lOQ09NUExFVEVfTUlTU0lOR19BVFRBQ0hNRU5UJztcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgZ2wuRlJBTUVCVUZGRVJfSU5DT01QTEVURV9ESU1FTlNJT05TOlxuICAgICAgICAgICAgICAgIGVycm9yQ29kZSA9ICdGUkFNRUJVRkZFUl9JTkNPTVBMRVRFX0RJTUVOU0lPTlMnO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBnbC5GUkFNRUJVRkZFUl9VTlNVUFBPUlRFRDpcbiAgICAgICAgICAgICAgICBlcnJvckNvZGUgPSAnRlJBTUVCVUZGRVJfVU5TVVBQT1JURUQnO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG5cbiAgICAgICAgRGVidWcuYXNzZXJ0KCFlcnJvckNvZGUsIGBGcmFtZWJ1ZmZlciBjcmVhdGlvbiBmYWlsZWQgd2l0aCBlcnJvciBjb2RlICR7ZXJyb3JDb2RlfSwgcmVuZGVyIHRhcmdldDogJHt0YXJnZXQubmFtZX0gJHt0eXBlfWAsIHRhcmdldCk7XG4gICAgfVxuXG4gICAgbG9zZUNvbnRleHQoKSB7XG4gICAgICAgIHRoaXMuX2dsRnJhbWVCdWZmZXIgPSBudWxsO1xuICAgICAgICB0aGlzLl9nbERlcHRoQnVmZmVyID0gbnVsbDtcbiAgICAgICAgdGhpcy5fZ2xSZXNvbHZlRnJhbWVCdWZmZXIgPSBudWxsO1xuICAgICAgICB0aGlzLl9nbE1zYWFDb2xvckJ1ZmZlcnMubGVuZ3RoID0gMDtcbiAgICAgICAgdGhpcy5fZ2xNc2FhRGVwdGhCdWZmZXIgPSBudWxsO1xuICAgICAgICB0aGlzLmNvbG9yTXJ0RnJhbWVidWZmZXJzID0gbnVsbDtcbiAgICAgICAgdGhpcy5zdXBwbGllZENvbG9yRnJhbWVidWZmZXIgPSB1bmRlZmluZWQ7XG4gICAgICAgIHRoaXMuX2lzSW5pdGlhbGl6ZWQgPSBmYWxzZTtcbiAgICB9XG5cbiAgICBpbnRlcm5hbFJlc29sdmUoZGV2aWNlLCBzcmMsIGRzdCwgdGFyZ2V0LCBtYXNrKSB7XG5cbiAgICAgICAgRGVidWcuYXNzZXJ0KHNyYyAhPT0gZHN0LCAnU291cmNlIGFuZCBkZXN0aW5hdGlvbiBmcmFtZWJ1ZmZlcnMgbXVzdCBiZSBkaWZmZXJlbnQgd2hlbiBibGl0dGluZy4nKTtcblxuICAgICAgICBjb25zdCBnbCA9IGRldmljZS5nbDtcbiAgICAgICAgZ2wuYmluZEZyYW1lYnVmZmVyKGdsLlJFQURfRlJBTUVCVUZGRVIsIHNyYyk7XG4gICAgICAgIGdsLmJpbmRGcmFtZWJ1ZmZlcihnbC5EUkFXX0ZSQU1FQlVGRkVSLCBkc3QpO1xuICAgICAgICBnbC5ibGl0RnJhbWVidWZmZXIoMCwgMCwgdGFyZ2V0LndpZHRoLCB0YXJnZXQuaGVpZ2h0LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgMCwgMCwgdGFyZ2V0LndpZHRoLCB0YXJnZXQuaGVpZ2h0LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgbWFzayxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIGdsLk5FQVJFU1QpO1xuICAgIH1cblxuICAgIHJlc29sdmUoZGV2aWNlLCB0YXJnZXQsIGNvbG9yLCBkZXB0aCkge1xuICAgICAgICBpZiAoZGV2aWNlLndlYmdsMikge1xuXG4gICAgICAgICAgICBjb25zdCBnbCA9IGRldmljZS5nbDtcblxuICAgICAgICAgICAgLy8gaWYgTVJUIGlzIHVzZWQsIHdlIG5lZWQgdG8gcmVzb2x2ZSBlYWNoIGJ1ZmZlciBpbmRpdmlkdWFsbHlcbiAgICAgICAgICAgIGlmICh0aGlzLmNvbG9yTXJ0RnJhbWVidWZmZXJzKSB7XG5cbiAgICAgICAgICAgICAgICAvLyBjb2xvclxuICAgICAgICAgICAgICAgIGlmIChjb2xvcikge1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuY29sb3JNcnRGcmFtZWJ1ZmZlcnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGZiUGFpciA9IHRoaXMuY29sb3JNcnRGcmFtZWJ1ZmZlcnNbaV07XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIERlYnVnR3JhcGhpY3MucHVzaEdwdU1hcmtlcihkZXZpY2UsIGBSRVNPTFZFLU1SVCR7aX1gKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuaW50ZXJuYWxSZXNvbHZlKGRldmljZSwgZmJQYWlyLm1zYWFGQiwgZmJQYWlyLnJlc29sdmVGQiwgdGFyZ2V0LCBnbC5DT0xPUl9CVUZGRVJfQklUKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIERlYnVnR3JhcGhpY3MucG9wR3B1TWFya2VyKGRldmljZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBkZXB0aFxuICAgICAgICAgICAgICAgIGlmIChkZXB0aCkge1xuICAgICAgICAgICAgICAgICAgICBEZWJ1Z0dyYXBoaWNzLnB1c2hHcHVNYXJrZXIoZGV2aWNlLCBgUkVTT0xWRS1NUlQtREVQVEhgKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5pbnRlcm5hbFJlc29sdmUoZGV2aWNlLCB0aGlzLl9nbEZyYW1lQnVmZmVyLCB0aGlzLl9nbFJlc29sdmVGcmFtZUJ1ZmZlciwgdGFyZ2V0LCBnbC5ERVBUSF9CVUZGRVJfQklUKTtcbiAgICAgICAgICAgICAgICAgICAgRGVidWdHcmFwaGljcy5wb3BHcHVNYXJrZXIoZGV2aWNlKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgRGVidWdHcmFwaGljcy5wdXNoR3B1TWFya2VyKGRldmljZSwgYFJFU09MVkVgKTtcbiAgICAgICAgICAgICAgICB0aGlzLmludGVybmFsUmVzb2x2ZShkZXZpY2UsIHRoaXMuX2dsRnJhbWVCdWZmZXIsIHRoaXMuX2dsUmVzb2x2ZUZyYW1lQnVmZmVyLCB0YXJnZXQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKGNvbG9yID8gZ2wuQ09MT1JfQlVGRkVSX0JJVCA6IDApIHwgKGRlcHRoID8gZ2wuREVQVEhfQlVGRkVSX0JJVCA6IDApKTtcbiAgICAgICAgICAgICAgICBEZWJ1Z0dyYXBoaWNzLnBvcEdwdU1hcmtlcihkZXZpY2UpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBnbC5iaW5kRnJhbWVidWZmZXIoZ2wuRlJBTUVCVUZGRVIsIHRoaXMuX2dsRnJhbWVCdWZmZXIpO1xuICAgICAgICB9XG4gICAgfVxufVxuXG5leHBvcnQgeyBXZWJnbFJlbmRlclRhcmdldCB9O1xuIl0sIm5hbWVzIjpbIkZyYW1lYnVmZmVyUGFpciIsImNvbnN0cnVjdG9yIiwibXNhYUZCIiwicmVzb2x2ZUZCIiwiZGVzdHJveSIsImdsIiwiZGVsZXRlUmVuZGVyYnVmZmVyIiwiV2ViZ2xSZW5kZXJUYXJnZXQiLCJfZ2xGcmFtZUJ1ZmZlciIsIl9nbERlcHRoQnVmZmVyIiwiX2dsUmVzb2x2ZUZyYW1lQnVmZmVyIiwiY29sb3JNcnRGcmFtZWJ1ZmZlcnMiLCJfZ2xNc2FhQ29sb3JCdWZmZXJzIiwiX2dsTXNhYURlcHRoQnVmZmVyIiwic3VwcGxpZWRDb2xvckZyYW1lYnVmZmVyIiwiX2lzSW5pdGlhbGl6ZWQiLCJkZXZpY2UiLCJfdGhpcyRjb2xvck1ydEZyYW1lYnUiLCJkZWxldGVGcmFtZWJ1ZmZlciIsImZvckVhY2giLCJidWZmZXIiLCJsZW5ndGgiLCJmcmFtZWJ1ZmZlciIsImluaXRpYWxpemVkIiwiaW5pdCIsInRhcmdldCIsImJ1ZmZlcnMiLCJ1bmRlZmluZWQiLCJfdGFyZ2V0JF9jb2xvckJ1ZmZlcnMiLCJfdGFyZ2V0JF9jb2xvckJ1ZmZlcnMyIiwiX2RldmljZSRleHREcmF3QnVmZmVyIiwiX2RldmljZSRleHREcmF3QnVmZmVyMiIsImNyZWF0ZUZyYW1lYnVmZmVyIiwic2V0RnJhbWVidWZmZXIiLCJjb2xvckJ1ZmZlckNvdW50IiwiX2NvbG9yQnVmZmVycyIsImF0dGFjaG1lbnRCYXNlQ29uc3RhbnQiLCJ3ZWJnbDIiLCJDT0xPUl9BVFRBQ0hNRU5UMCIsImV4dERyYXdCdWZmZXJzIiwiQ09MT1JfQVRUQUNITUVOVDBfV0VCR0wiLCJpIiwiY29sb3JCdWZmZXIiLCJnZXRDb2xvckJ1ZmZlciIsImltcGwiLCJfZ2xUZXh0dXJlIiwiX3dpZHRoIiwiTWF0aCIsIm1pbiIsIndpZHRoIiwibWF4UmVuZGVyQnVmZmVyU2l6ZSIsIl9oZWlnaHQiLCJoZWlnaHQiLCJzZXRUZXh0dXJlIiwiZnJhbWVidWZmZXJUZXh0dXJlMkQiLCJGUkFNRUJVRkZFUiIsIl9jdWJlbWFwIiwiVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YIiwiX2ZhY2UiLCJURVhUVVJFXzJEIiwicHVzaCIsImRyYXdCdWZmZXJzIiwiZGVwdGhCdWZmZXIiLCJfZGVwdGhCdWZmZXIiLCJfc3RlbmNpbCIsIkRFUFRIX1NURU5DSUxfQVRUQUNITUVOVCIsIkRFUFRIX0FUVEFDSE1FTlQiLCJfZGVwdGgiLCJ3aWxsUmVuZGVyTXNhYSIsIl9zYW1wbGVzIiwiY3JlYXRlUmVuZGVyYnVmZmVyIiwiYmluZFJlbmRlcmJ1ZmZlciIsIlJFTkRFUkJVRkZFUiIsInJlbmRlcmJ1ZmZlclN0b3JhZ2UiLCJERVBUSF9TVEVOQ0lMIiwiZnJhbWVidWZmZXJSZW5kZXJidWZmZXIiLCJkZXB0aEZvcm1hdCIsIkRFUFRIX0NPTVBPTkVOVDMyRiIsIkRFUFRIX0NPTVBPTkVOVDE2IiwiRGVidWciLCJjYWxsIiwiX2NoZWNrRmJvIiwiX3RhcmdldCRfY29sb3JCdWZmZXJzMyIsIl90YXJnZXQkX2NvbG9yQnVmZmVyczQiLCJpbnRlcm5hbEZvcm1hdCIsImJhY2tCdWZmZXJGb3JtYXQiLCJQSVhFTEZPUk1BVF9SR0JBOCIsIlJHQkE4IiwiUkdCOCIsInJlbmRlcmJ1ZmZlclN0b3JhZ2VNdWx0aXNhbXBsZSIsIl9nbEludGVybmFsRm9ybWF0IiwiREVQVEgyNF9TVEVOQ0lMOCIsIl9jcmVhdGVNc2FhTXJ0RnJhbWVidWZmZXJzIiwic3JjRnJhbWVidWZmZXIiLCJkc3RGcmFtZWJ1ZmZlciIsInR5cGUiLCJzdGF0dXMiLCJjaGVja0ZyYW1lYnVmZmVyU3RhdHVzIiwiZXJyb3JDb2RlIiwiRlJBTUVCVUZGRVJfSU5DT01QTEVURV9BVFRBQ0hNRU5UIiwiRlJBTUVCVUZGRVJfSU5DT01QTEVURV9NSVNTSU5HX0FUVEFDSE1FTlQiLCJGUkFNRUJVRkZFUl9JTkNPTVBMRVRFX0RJTUVOU0lPTlMiLCJGUkFNRUJVRkZFUl9VTlNVUFBPUlRFRCIsImFzc2VydCIsIm5hbWUiLCJsb3NlQ29udGV4dCIsImludGVybmFsUmVzb2x2ZSIsInNyYyIsImRzdCIsIm1hc2siLCJiaW5kRnJhbWVidWZmZXIiLCJSRUFEX0ZSQU1FQlVGRkVSIiwiRFJBV19GUkFNRUJVRkZFUiIsImJsaXRGcmFtZWJ1ZmZlciIsIk5FQVJFU1QiLCJyZXNvbHZlIiwiY29sb3IiLCJkZXB0aCIsImZiUGFpciIsIkRlYnVnR3JhcGhpY3MiLCJwdXNoR3B1TWFya2VyIiwiQ09MT1JfQlVGRkVSX0JJVCIsInBvcEdwdU1hcmtlciIsIkRFUFRIX0JVRkZFUl9CSVQiXSwibWFwcGluZ3MiOiI7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
