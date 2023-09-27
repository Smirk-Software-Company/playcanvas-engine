import '../../core/tracing.js';
import { PIXELFORMAT_RGBA8, FILTER_NEAREST, ADDRESS_CLAMP_TO_EDGE } from '../../platform/graphics/constants.js';
import { Texture } from '../../platform/graphics/texture.js';
import { LIGHTTYPE_DIRECTIONAL } from '../constants.js';
import { RenderPassCookieRenderer } from './render-pass-cookie-renderer.js';

class CookieRenderer {
	constructor(device, lightTextureAtlas) {
		this.device = device;
		this.lightTextureAtlas = lightTextureAtlas;
		this.renderPass = this.createRenderPass(lightTextureAtlas.cookieRenderTarget);
	}
	destroy() {
		this.renderPass.destroy();
	}
	static createTexture(device, resolution) {
		const texture = new Texture(device, {
			name: 'CookieAtlas',
			width: resolution,
			height: resolution,
			format: PIXELFORMAT_RGBA8,
			cubemap: false,
			mipmaps: false,
			minFilter: FILTER_NEAREST,
			magFilter: FILTER_NEAREST,
			addressU: ADDRESS_CLAMP_TO_EDGE,
			addressV: ADDRESS_CLAMP_TO_EDGE
		});
		return texture;
	}
	filter(lights, filteredLights) {
		for (let i = 0; i < lights.length; i++) {
			const light = lights[i];
			if (light._type === LIGHTTYPE_DIRECTIONAL) continue;
			if (!light.atlasViewportAllocated) continue;
			if (!light.atlasSlotUpdated) continue;
			if (light.enabled && light.cookie && light.visibleThisFrame) {
				filteredLights.push(light);
			}
		}
	}
	createRenderPass(renderTarget) {
		const renderPass = new RenderPassCookieRenderer(this.device, this.lightTextureAtlas.cubeSlotsOffsets);
		renderPass.init(renderTarget);
		renderPass.colorOps.clear = false;
		renderPass.depthStencilOps.clearDepth = false;
		return renderPass;
	}
	render(lights) {
		const filteredLights = this.renderPass._filteredLights;
		this.filter(lights, filteredLights);
		if (filteredLights.length > 0) {
			this.renderPass.render();
			filteredLights.length = 0;
		}
	}
}

export { CookieRenderer };
