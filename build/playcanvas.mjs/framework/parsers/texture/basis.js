import { extends as _extends } from '../../../_virtual/_rollupPluginBabelHelpers.js';
import { ADDRESS_CLAMP_TO_EDGE, ADDRESS_REPEAT } from '../../../platform/graphics/constants.js';
import { Texture } from '../../../platform/graphics/texture.js';
import { Asset } from '../../asset/asset.js';
import { basisTranscode } from '../../handlers/basis.js';

class BasisParser {
	constructor(registry, device) {
		this.device = device;
		this.maxRetries = 0;
	}
	load(url, callback, asset) {
		const device = this.device;
		const transcode = data => {
			var _asset$file;
			const basisModuleFound = basisTranscode(device, url.load, data, callback, {
				isGGGR: ((asset == null || (_asset$file = asset.file) == null || (_asset$file = _asset$file.variants) == null || (_asset$file = _asset$file.basis) == null ? void 0 : _asset$file.opt) & 8) !== 0
			});
			if (!basisModuleFound) {
				callback(`Basis module not found. Asset '${asset.name}' basis texture variant will not be loaded.`);
			}
		};
		Asset.fetchArrayBuffer(url.load, (err, result) => {
			if (err) {
				callback(err);
			} else {
				transcode(result);
			}
		}, asset, this.maxRetries);
	}
	open(url, data, device, textureOptions = {}) {
		const texture = new Texture(device, _extends({
			name: url,
			addressU: data.cubemap ? ADDRESS_CLAMP_TO_EDGE : ADDRESS_REPEAT,
			addressV: data.cubemap ? ADDRESS_CLAMP_TO_EDGE : ADDRESS_REPEAT,
			width: data.width,
			height: data.height,
			format: data.format,
			cubemap: data.cubemap,
			levels: data.levels
		}, textureOptions));
		texture.upload();
		return texture;
	}
}

export { BasisParser };
