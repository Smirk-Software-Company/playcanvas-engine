import '../../core/tracing.js';
import { FILTER_NEAREST, FILTER_LINEAR_MIPMAP_LINEAR, FILTER_LINEAR, ADDRESS_CLAMP_TO_EDGE, PIXELFORMAT_RGBA8, PIXELFORMAT_DEPTHSTENCIL, PIXELFORMAT_R32F } from '../../platform/graphics/constants.js';
import { RenderTarget } from '../../platform/graphics/render-target.js';
import { Texture } from '../../platform/graphics/texture.js';
import { BlendState } from '../../platform/graphics/blend-state.js';
import { LAYERID_DEPTH, SHADER_DEPTH, LAYERID_WORLD } from '../constants.js';
import { Layer } from '../layer.js';

const _depthUniformNames = ['uSceneDepthMap', 'uDepthMap'];
const _colorUniformNames = ['uSceneColorMap', 'texture_grabPass'];
class SceneGrab {
	constructor(device, scene) {
		this.scene = scene;
		this.device = device;
		this.layer = null;
		if (this.device.isNull) {
			this.layer = new Layer({
				enabled: false,
				name: "Depth",
				id: LAYERID_DEPTH
			});
			return;
		}
		if (this.device.webgl2 || this.device.isWebGPU) {
			this.initMainPath();
		} else {
			this.initFallbackPath();
		}
	}
	static requiresRenderPass(device, camera) {
		if (device.webgl2 || device.isWebGPU) {
			return false;
		}
		return camera.renderSceneDepthMap;
	}
	setupUniform(device, depth, buffer) {
		const names = depth ? _depthUniformNames : _colorUniformNames;
		names.forEach(name => device.scope.resolve(name).setValue(buffer));
	}
	allocateTexture(device, source, name, format, isDepth, mipmaps) {
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
	getSourceColorFormat(texture) {
		var _texture$format;
		return (_texture$format = texture == null ? void 0 : texture.format) != null ? _texture$format : this.device.backBufferFormat;
	}
	shouldReallocate(targetRT, sourceTexture, testFormat) {
		if (testFormat) {
			const targetFormat = targetRT == null ? void 0 : targetRT.colorBuffer.format;
			const sourceFormat = this.getSourceColorFormat(sourceTexture);
			if (targetFormat !== sourceFormat) return true;
		}
		const width = (sourceTexture == null ? void 0 : sourceTexture.width) || this.device.width;
		const height = (sourceTexture == null ? void 0 : sourceTexture.height) || this.device.height;
		return !targetRT || width !== targetRT.width || height !== targetRT.height;
	}
	allocateRenderTarget(renderTarget, sourceRenderTarget, device, format, isDepth, mipmaps, isDepthUniforms) {
		const names = isDepthUniforms ? _depthUniformNames : _colorUniformNames;
		const buffer = this.allocateTexture(device, sourceRenderTarget, names[0], format, isDepth, mipmaps);
		if (renderTarget) {
			renderTarget.destroyFrameBuffers();
			if (isDepth) {
				renderTarget._depthBuffer = buffer;
			} else {
				renderTarget._colorBuffer = buffer;
				renderTarget._colorBuffers = [buffer];
			}
		} else {
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
	initMainPath() {
		const device = this.device;
		const self = this;
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
				const camera = this.cameras[cameraPass];
				if (camera.renderSceneColorMap) {
					var _camera$renderTarget;
					if (self.shouldReallocate(this.colorRenderTarget, (_camera$renderTarget = camera.renderTarget) == null ? void 0 : _camera$renderTarget.colorBuffer, true)) {
						var _camera$renderTarget2;
						self.releaseRenderTarget(this.colorRenderTarget);
						const format = self.getSourceColorFormat((_camera$renderTarget2 = camera.renderTarget) == null ? void 0 : _camera$renderTarget2.colorBuffer);
						this.colorRenderTarget = self.allocateRenderTarget(this.colorRenderTarget, camera.renderTarget, device, format, false, true, false);
					}
					const colorBuffer = this.colorRenderTarget.colorBuffer;
					if (device.isWebGPU) {
						device.copyRenderTarget(camera.renderTarget, this.colorRenderTarget, true, false);
						device.mipmapRenderer.generate(this.colorRenderTarget.colorBuffer.impl);
					} else {
						device.copyRenderTarget(device.renderTarget, this.colorRenderTarget, true, false);
						device.activeTexture(device.maxCombinedTextures - 1);
						device.bindTexture(colorBuffer);
						device.gl.generateMipmap(colorBuffer.impl._glTarget);
					}
					self.setupUniform(device, false, colorBuffer);
				}
				if (camera.renderSceneDepthMap) {
					var _camera$renderTarget4;
					let useDepthBuffer = true;
					let format = PIXELFORMAT_DEPTHSTENCIL;
					if (device.isWebGPU) {
						var _camera$renderTarget$, _camera$renderTarget3;
						const numSamples = (_camera$renderTarget$ = (_camera$renderTarget3 = camera.renderTarget) == null ? void 0 : _camera$renderTarget3.samples) != null ? _camera$renderTarget$ : device.samples;
						if (numSamples > 1) {
							format = PIXELFORMAT_R32F;
							useDepthBuffer = false;
						}
					}
					if (self.shouldReallocate(this.depthRenderTarget, (_camera$renderTarget4 = camera.renderTarget) == null ? void 0 : _camera$renderTarget4.depthBuffer)) {
						self.releaseRenderTarget(this.depthRenderTarget);
						this.depthRenderTarget = self.allocateRenderTarget(this.depthRenderTarget, camera.renderTarget, device, format, useDepthBuffer, false, true);
					}
					if (device.webgl2 && device.renderTarget.samples > 1) {
						const src = device.renderTarget.impl._glFrameBuffer;
						const dest = this.depthRenderTarget;
						device.renderTarget = dest;
						device.updateBegin();
						this.depthRenderTarget.impl.internalResolve(device, src, dest.impl._glFrameBuffer, this.depthRenderTarget, device.gl.DEPTH_BUFFER_BIT);
					} else {
						device.copyRenderTarget(device.renderTarget, this.depthRenderTarget, false, true);
					}
					self.setupUniform(device, true, useDepthBuffer ? this.depthRenderTarget.depthBuffer : this.depthRenderTarget.colorBuffer);
				}
			},
			onPostRenderOpaque: function (cameraPass) {}
		});
	}
	initFallbackPath() {
		const self = this;
		const device = this.device;
		const scene = this.scene;
		this.layer = new Layer({
			enabled: false,
			name: "Depth",
			id: LAYERID_DEPTH,
			shaderPass: SHADER_DEPTH,
			onEnable: function () {
				this.depthRenderTarget = new RenderTarget({
					name: 'depthRenderTarget-webgl1',
					depth: true,
					stencil: device.supportsStencil,
					autoResolve: false,
					graphicsDevice: device
				});
				this.renderTarget = this.depthRenderTarget;
			},
			onDisable: function () {
				this.depthRenderTarget.destroyTextureBuffers();
				this.renderTarget = null;
				self.releaseRenderTarget(this.colorRenderTarget);
				this.colorRenderTarget = null;
			},
			onPostCull: function (cameraPass) {
				const camera = this.cameras[cameraPass];
				if (camera.renderSceneDepthMap) {
					var _this$depthRenderTarg, _camera$renderTarget5;
					if (!((_this$depthRenderTarg = this.depthRenderTarget) != null && _this$depthRenderTarg.colorBuffer) || self.shouldReallocate(this.depthRenderTarget, (_camera$renderTarget5 = camera.renderTarget) == null ? void 0 : _camera$renderTarget5.depthBuffer)) {
						var _this$depthRenderTarg2;
						(_this$depthRenderTarg2 = this.depthRenderTarget) == null ? void 0 : _this$depthRenderTarg2.destroyTextureBuffers();
						this.depthRenderTarget = self.allocateRenderTarget(this.depthRenderTarget, camera.renderTarget, device, PIXELFORMAT_RGBA8, false, false, true);
						this.renderTarget = this.depthRenderTarget;
					}
					const culledDepthInstances = this.getCulledInstances(camera.camera);
					const depthOpaque = culledDepthInstances.opaque;
					depthOpaque.length = 0;
					const layerComposition = scene.layers;
					const subLayerEnabled = layerComposition.subLayerEnabled;
					const isTransparent = layerComposition.subLayerList;
					const rt = layerComposition.getLayerById(LAYERID_WORLD).renderTarget;
					const layers = layerComposition.layerList;
					for (let i = 0; i < layers.length; i++) {
						const layer = layers[i];
						if (layer === this) break;
						if (layer.renderTarget !== rt || !layer.enabled || !subLayerEnabled[i]) continue;
						if (layer.cameras.indexOf(camera) < 0) continue;
						const transparent = isTransparent[i];
						const layerCulledInstances = layer.getCulledInstances(camera.camera);
						const layerMeshInstances = transparent ? layerCulledInstances.transparent : layerCulledInstances.opaque;
						const count = layerMeshInstances.length;
						for (let j = 0; j < count; j++) {
							var _drawCall$material;
							const drawCall = layerMeshInstances[j];
							if ((_drawCall$material = drawCall.material) != null && _drawCall$material.depthWrite && !drawCall._noDepthDrawGl1) {
								depthOpaque.push(drawCall);
							}
						}
					}
				}
			},
			onPreRenderOpaque: function (cameraPass) {
				const camera = this.cameras[cameraPass];
				if (camera.renderSceneColorMap) {
					var _camera$renderTarget6;
					if (self.shouldReallocate(this.colorRenderTarget, (_camera$renderTarget6 = camera.renderTarget) == null ? void 0 : _camera$renderTarget6.colorBuffer)) {
						var _camera$renderTarget7;
						self.releaseRenderTarget(this.colorRenderTarget);
						const format = self.getSourceColorFormat((_camera$renderTarget7 = camera.renderTarget) == null ? void 0 : _camera$renderTarget7.colorBuffer);
						this.colorRenderTarget = self.allocateRenderTarget(this.colorRenderTarget, camera.renderTarget, device, format, false, false, false);
					}
					const colorBuffer = this.colorRenderTarget._colorBuffer;
					if (!colorBuffer.impl._glTexture) {
						colorBuffer.impl.initialize(device, colorBuffer);
					}
					device.bindTexture(colorBuffer);
					const gl = device.gl;
					gl.copyTexImage2D(gl.TEXTURE_2D, 0, colorBuffer.impl._glFormat, 0, 0, colorBuffer.width, colorBuffer.height, 0);
					colorBuffer._needsUpload = false;
					colorBuffer._needsMipmapsUpload = false;
					self.setupUniform(device, false, colorBuffer);
				}
				if (camera.renderSceneDepthMap) {
					self.setupUniform(device, true, this.depthRenderTarget.colorBuffer);
				}
			},
			onDrawCall: function () {
				device.setBlendState(BlendState.NOBLEND);
			},
			onPostRenderOpaque: function (cameraPass) {
				const camera = this.cameras[cameraPass];
				if (camera.renderSceneDepthMap) {
					const culledDepthInstances = this.getCulledInstances(camera.camera);
					culledDepthInstances.opaque.length = 0;
				}
			}
		});
	}
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
