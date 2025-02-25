import { path } from '../../core/path.js';
import { http } from '../../platform/net/http.js';
import { Sprite } from '../../scene/sprite.js';

function onTextureAtlasLoaded(atlasAsset) {
	const spriteAsset = this;
	if (spriteAsset.resource) {
		spriteAsset.resource.atlas = atlasAsset.resource;
	}
}
function onTextureAtlasAdded(atlasAsset) {
	const spriteAsset = this;
	spriteAsset.registry.load(atlasAsset);
}
class SpriteHandler {
	constructor(app) {
		this.handlerType = "sprite";
		this._assets = app.assets;
		this._device = app.graphicsDevice;
		this.maxRetries = 0;
	}
	load(url, callback) {
		if (typeof url === 'string') {
			url = {
				load: url,
				original: url
			};
		}
		if (path.getExtension(url.original) === '.json') {
			http.get(url.load, {
				retry: this.maxRetries > 0,
				maxRetries: this.maxRetries
			}, function (err, response) {
				if (!err) {
					callback(null, response);
				} else {
					callback(err);
				}
			});
		}
	}
	open(url, data) {
		const sprite = new Sprite(this._device);
		if (url) {
			sprite.__data = data;
		}
		return sprite;
	}
	patch(asset, assets) {
		const sprite = asset.resource;
		if (sprite.__data) {
			asset.data.pixelsPerUnit = sprite.__data.pixelsPerUnit;
			asset.data.renderMode = sprite.__data.renderMode;
			asset.data.frameKeys = sprite.__data.frameKeys;
			if (sprite.__data.textureAtlasAsset) {
				const atlas = assets.getByUrl(sprite.__data.textureAtlasAsset);
				if (atlas) {
					asset.data.textureAtlasAsset = atlas.id;
				} else {
					console.warn('Could not find textureatlas with url: ' + sprite.__data.textureAtlasAsset);
				}
			}
		}
		sprite.startUpdate();
		sprite.renderMode = asset.data.renderMode;
		sprite.pixelsPerUnit = asset.data.pixelsPerUnit;
		sprite.frameKeys = asset.data.frameKeys;
		this._updateAtlas(asset);
		sprite.endUpdate();
		asset.off('change', this._onAssetChange, this);
		asset.on('change', this._onAssetChange, this);
	}
	_updateAtlas(asset) {
		const sprite = asset.resource;
		if (!asset.data.textureAtlasAsset) {
			sprite.atlas = null;
			return;
		}
		this._assets.off('load:' + asset.data.textureAtlasAsset, onTextureAtlasLoaded, asset);
		this._assets.on('load:' + asset.data.textureAtlasAsset, onTextureAtlasLoaded, asset);
		const atlasAsset = this._assets.get(asset.data.textureAtlasAsset);
		if (atlasAsset && atlasAsset.resource) {
			sprite.atlas = atlasAsset.resource;
		} else {
			if (!atlasAsset) {
				this._assets.off('add:' + asset.data.textureAtlasAsset, onTextureAtlasAdded, asset);
				this._assets.on('add:' + asset.data.textureAtlasAsset, onTextureAtlasAdded, asset);
			} else {
				this._assets.load(atlasAsset);
			}
		}
	}
	_onAssetChange(asset, attribute, value, oldValue) {
		if (attribute === 'data') {
			if (value && value.textureAtlasAsset && oldValue && value.textureAtlasAsset !== oldValue.textureAtlasAsset) {
				this._assets.off('load:' + oldValue.textureAtlasAsset, onTextureAtlasLoaded, asset);
				this._assets.off('add:' + oldValue.textureAtlasAsset, onTextureAtlasAdded, asset);
			}
		}
	}
}

export { SpriteHandler };
