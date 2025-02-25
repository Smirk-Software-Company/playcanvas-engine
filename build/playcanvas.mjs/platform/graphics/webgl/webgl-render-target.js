import '../../../core/tracing.js';
import { PIXELFORMAT_RGBA8 } from '../constants.js';

class FramebufferPair {
	constructor(msaaFB, resolveFB) {
		this.msaaFB = void 0;
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
class WebglRenderTarget {
	constructor() {
		this._glFrameBuffer = null;
		this._glDepthBuffer = null;
		this._glResolveFrameBuffer = null;
		this.colorMrtFramebuffers = null;
		this._glMsaaColorBuffers = [];
		this._glMsaaDepthBuffer = null;
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
			this._glFrameBuffer = gl.createFramebuffer();
			device.setFramebuffer(this._glFrameBuffer);
			const colorBufferCount = (_target$_colorBuffers = (_target$_colorBuffers2 = target._colorBuffers) == null ? void 0 : _target$_colorBuffers2.length) != null ? _target$_colorBuffers : 0;
			const attachmentBaseConstant = device.webgl2 ? gl.COLOR_ATTACHMENT0 : (_device$extDrawBuffer = (_device$extDrawBuffer2 = device.extDrawBuffers) == null ? void 0 : _device$extDrawBuffer2.COLOR_ATTACHMENT0_WEBGL) != null ? _device$extDrawBuffer : gl.COLOR_ATTACHMENT0;
			for (let i = 0; i < colorBufferCount; ++i) {
				const colorBuffer = target.getColorBuffer(i);
				if (colorBuffer) {
					if (!colorBuffer.impl._glTexture) {
						colorBuffer._width = Math.min(colorBuffer.width, device.maxRenderBufferSize);
						colorBuffer._height = Math.min(colorBuffer.height, device.maxRenderBufferSize);
						device.setTexture(colorBuffer, 0);
					}
					gl.framebufferTexture2D(gl.FRAMEBUFFER, attachmentBaseConstant + i, colorBuffer._cubemap ? gl.TEXTURE_CUBE_MAP_POSITIVE_X + target._face : gl.TEXTURE_2D, colorBuffer.impl._glTexture, 0);
					buffers.push(attachmentBaseConstant + i);
				}
			}
			if (device.drawBuffers) {
				device.drawBuffers(buffers);
			}
			const depthBuffer = target._depthBuffer;
			if (depthBuffer) {
				if (!depthBuffer.impl._glTexture) {
					depthBuffer._width = Math.min(depthBuffer.width, device.maxRenderBufferSize);
					depthBuffer._height = Math.min(depthBuffer.height, device.maxRenderBufferSize);
					device.setTexture(depthBuffer, 0);
				}
				if (target._stencil) {
					gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, depthBuffer._cubemap ? gl.TEXTURE_CUBE_MAP_POSITIVE_X + target._face : gl.TEXTURE_2D, target._depthBuffer.impl._glTexture, 0);
				} else {
					gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, depthBuffer._cubemap ? gl.TEXTURE_CUBE_MAP_POSITIVE_X + target._face : gl.TEXTURE_2D, target._depthBuffer.impl._glTexture, 0);
				}
			} else if (target._depth) {
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
		}
		if (device.webgl2 && target._samples > 1) {
			var _target$_colorBuffers3, _target$_colorBuffers4;
			this._glResolveFrameBuffer = this._glFrameBuffer;
			this._glFrameBuffer = gl.createFramebuffer();
			device.setFramebuffer(this._glFrameBuffer);
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
			if (colorBufferCount > 1) {
				this._createMsaaMrtFramebuffers(device, target, colorBufferCount);
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
			const srcFramebuffer = gl.createFramebuffer();
			device.setFramebuffer(srcFramebuffer);
			const buffer = this._glMsaaColorBuffers[i];
			gl.bindRenderbuffer(gl.RENDERBUFFER, buffer);
			gl.renderbufferStorageMultisample(gl.RENDERBUFFER, target._samples, colorBuffer.impl._glInternalFormat, target.width, target.height);
			gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, buffer);
			device.drawBuffers([gl.COLOR_ATTACHMENT0]);
			const dstFramebuffer = gl.createFramebuffer();
			device.setFramebuffer(dstFramebuffer);
			gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, colorBuffer._cubemap ? gl.TEXTURE_CUBE_MAP_POSITIVE_X + target._face : gl.TEXTURE_2D, colorBuffer.impl._glTexture, 0);
			this.colorMrtFramebuffers[i] = new FramebufferPair(srcFramebuffer, dstFramebuffer);
		}
	}
	_checkFbo(device, target, type = '') {
		const gl = device.gl;
		const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
		switch (status) {
			case gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT:
				break;
			case gl.FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT:
				break;
			case gl.FRAMEBUFFER_INCOMPLETE_DIMENSIONS:
				break;
			case gl.FRAMEBUFFER_UNSUPPORTED:
				break;
		}
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
		const gl = device.gl;
		gl.bindFramebuffer(gl.READ_FRAMEBUFFER, src);
		gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, dst);
		gl.blitFramebuffer(0, 0, target.width, target.height, 0, 0, target.width, target.height, mask, gl.NEAREST);
	}
	resolve(device, target, color, depth) {
		if (device.webgl2) {
			const gl = device.gl;
			if (this.colorMrtFramebuffers) {
				if (color) {
					for (let i = 0; i < this.colorMrtFramebuffers.length; i++) {
						const fbPair = this.colorMrtFramebuffers[i];
						this.internalResolve(device, fbPair.msaaFB, fbPair.resolveFB, target, gl.COLOR_BUFFER_BIT);
					}
				}
				if (depth) {
					this.internalResolve(device, this._glFrameBuffer, this._glResolveFrameBuffer, target, gl.DEPTH_BUFFER_BIT);
				}
			} else {
				this.internalResolve(device, this._glFrameBuffer, this._glResolveFrameBuffer, target, (color ? gl.COLOR_BUFFER_BIT : 0) | (depth ? gl.DEPTH_BUFFER_BIT : 0));
			}
			gl.bindFramebuffer(gl.FRAMEBUFFER, this._glFrameBuffer);
		}
	}
}

export { WebglRenderTarget };
