import { ADDRESS_CLAMP_TO_EDGE, TEXTURETYPE_RGBP, PIXELFORMAT_RGB8, PIXELFORMAT_RGBA8, TEXTURETYPE_RGBM, TEXTURETYPE_DEFAULT } from '../../platform/graphics/constants.js';
import { Texture } from '../../platform/graphics/texture.js';
import { Asset } from '../asset/asset.js';

/** @typedef {import('./handler.js').ResourceHandler} ResourceHandler */

/**
 * Resource handler used for loading cubemap {@link Texture} resources.
 *
 * @implements {ResourceHandler}
 * @category Graphics
 */
class CubemapHandler {
  /**
   * Create a new CubemapHandler instance.
   *
   * @param {import('../app-base.js').AppBase} app - The running {@link AppBase}.
   * @hideconstructor
   */
  constructor(app) {
    /**
     * Type of the resource the handler handles.
     *
     * @type {string}
     */
    this.handlerType = "cubemap";
    this._device = app.graphicsDevice;
    this._registry = app.assets;
    this._loader = app.loader;
  }
  load(url, callback, asset) {
    this.loadAssets(asset, callback);
  }
  open(url, data, asset) {
    // caller will set our return value to asset.resources[0]. We've already set resources[0],
    // but we must return it again here so it doesn't get overwritten.
    return asset ? asset.resource : null;
  }
  patch(asset, registry) {
    this.loadAssets(asset, function (err, result) {
      if (err) {
        // fire error event if patch failed
        registry.fire('error', asset);
        registry.fire('error:' + asset.id, err, asset);
        asset.fire('error', asset);
      }
      // nothing to do since asset:change would have been raised if
      // resources were changed.
    });
  }

  // get the list of dependent asset ids for the cubemap
  getAssetIds(cubemapAsset) {
    const result = [];

    // prefiltered cubemap is stored at index 0
    result[0] = cubemapAsset.file;

    // faces are stored at index 1..6
    if ((cubemapAsset.loadFaces || !cubemapAsset.file) && cubemapAsset.data && cubemapAsset.data.textures) {
      for (let i = 0; i < 6; ++i) {
        result[i + 1] = cubemapAsset.data.textures[i];
      }
    } else {
      result[1] = result[2] = result[3] = result[4] = result[5] = result[6] = null;
    }
    return result;
  }

  // test whether two assets ids are the same
  compareAssetIds(assetIdA, assetIdB) {
    if (assetIdA && assetIdB) {
      if (parseInt(assetIdA, 10) === assetIdA || typeof assetIdA === 'string') {
        return assetIdA === assetIdB; // id or url
      }
      // else {
      return assetIdA.url === assetIdB.url; // file/url structure with url and filename
    }
    // else {
    return assetIdA !== null === (assetIdB !== null);
  }

  // update the cubemap resources given a newly loaded set of assets with their corresponding ids
  update(cubemapAsset, assetIds, assets) {
    const assetData = cubemapAsset.data || {};
    const oldAssets = cubemapAsset._handlerState.assets;
    const oldResources = cubemapAsset._resources;
    let tex, mip, i;

    // faces, prelit cubemap 128, 64, 32, 16, 8, 4
    const resources = [null, null, null, null, null, null, null];

    // texture type used for faces and prelit cubemaps are both taken from
    // cubemap.data.rgbm
    const getType = function getType() {
      if (assetData.hasOwnProperty('type')) {
        return assetData.type;
      }
      if (assetData.hasOwnProperty('rgbm')) {
        return assetData.rgbm ? TEXTURETYPE_RGBM : TEXTURETYPE_DEFAULT;
      }
      return null;
    };

    // handle the prelit data
    if (!cubemapAsset.loaded || assets[0] !== oldAssets[0]) {
      // prelit asset changed
      if (assets[0]) {
        tex = assets[0].resource;
        if (tex.cubemap) {
          for (i = 0; i < 6; ++i) {
            resources[i + 1] = new Texture(this._device, {
              name: cubemapAsset.name + '_prelitCubemap' + (tex.width >> i),
              cubemap: true,
              // assume prefiltered data has same encoding as the faces asset
              type: getType() || tex.type,
              width: tex.width >> i,
              height: tex.height >> i,
              format: tex.format,
              levels: [tex._levels[i]],
              fixCubemapSeams: true,
              addressU: ADDRESS_CLAMP_TO_EDGE,
              addressV: ADDRESS_CLAMP_TO_EDGE,
              // generate cubemaps on the top level only
              mipmaps: i === 0
            });
          }
        } else {
          // prefiltered data is an env atlas
          tex.type = TEXTURETYPE_RGBP;
          tex.addressU = ADDRESS_CLAMP_TO_EDGE;
          tex.addressV = ADDRESS_CLAMP_TO_EDGE;
          tex.mipmaps = false;
          resources[1] = tex;
        }
      }
    } else {
      // prelit asset didn't change so keep the existing cubemap resources
      resources[1] = oldResources[1] || null;
      resources[2] = oldResources[2] || null;
      resources[3] = oldResources[3] || null;
      resources[4] = oldResources[4] || null;
      resources[5] = oldResources[5] || null;
      resources[6] = oldResources[6] || null;
    }
    const faceAssets = assets.slice(1);
    if (!cubemapAsset.loaded || !this.cmpArrays(faceAssets, oldAssets.slice(1))) {
      // face assets have changed
      if (faceAssets.indexOf(null) === -1) {
        var _assetData$mipmaps;
        // extract cubemap level data from face textures
        const faceTextures = faceAssets.map(function (asset) {
          return asset.resource;
        });
        const faceLevels = [];
        for (mip = 0; mip < faceTextures[0]._levels.length; ++mip) {
          faceLevels.push(faceTextures.map(function (faceTexture) {
            // eslint-disable-line no-loop-func
            return faceTexture._levels[mip];
          }));
        }

        // Force RGBA8 if we are loading a RGB8 texture due to a bug on M1 Macs Monterey and Chrome not
        // rendering the face on right of the cubemap (`faceAssets[0]` and `resources[1]`).
        // Using a RGBA8 texture works around the issue https://github.com/playcanvas/engine/issues/4091
        const format = faceTextures[0].format;
        const faces = new Texture(this._device, {
          name: cubemapAsset.name + '_faces',
          cubemap: true,
          type: getType() || faceTextures[0].type,
          width: faceTextures[0].width,
          height: faceTextures[0].height,
          format: format === PIXELFORMAT_RGB8 ? PIXELFORMAT_RGBA8 : format,
          mipmaps: (_assetData$mipmaps = assetData.mipmaps) != null ? _assetData$mipmaps : true,
          levels: faceLevels,
          minFilter: assetData.hasOwnProperty('minFilter') ? assetData.minFilter : faceTextures[0].minFilter,
          magFilter: assetData.hasOwnProperty('magFilter') ? assetData.magFilter : faceTextures[0].magFilter,
          anisotropy: assetData.hasOwnProperty('anisotropy') ? assetData.anisotropy : 1,
          addressU: ADDRESS_CLAMP_TO_EDGE,
          addressV: ADDRESS_CLAMP_TO_EDGE,
          fixCubemapSeams: !!assets[0]
        });
        resources[0] = faces;
      }
    } else {
      // no faces changed so keep existing faces cubemap
      resources[0] = oldResources[0] || null;
    }

    // check if any resource changed
    if (!this.cmpArrays(resources, oldResources)) {
      // set the new resources, change events will fire
      cubemapAsset.resources = resources;
      cubemapAsset._handlerState.assetIds = assetIds;
      cubemapAsset._handlerState.assets = assets;

      // destroy the old cubemap resources that are not longer needed
      for (i = 0; i < oldResources.length; ++i) {
        if (oldResources[i] !== null && resources.indexOf(oldResources[i]) === -1) {
          oldResources[i].destroy();
        }
      }
    }

    // destroy old assets which have been replaced
    for (i = 0; i < oldAssets.length; ++i) {
      if (oldAssets[i] !== null && assets.indexOf(oldAssets[i]) === -1) {
        oldAssets[i].unload();
      }
    }
  }
  cmpArrays(arr1, arr2) {
    if (arr1.length !== arr2.length) {
      return false;
    }
    for (let i = 0; i < arr1.length; ++i) {
      if (arr1[i] !== arr2[i]) {
        return false;
      }
    }
    return true;
  }

  // convert string id to int
  resolveId(value) {
    const valueInt = parseInt(value, 10);
    return valueInt === value || valueInt.toString() === value ? valueInt : value;
  }
  loadAssets(cubemapAsset, callback) {
    // initialize asset structures for tracking load requests
    if (!cubemapAsset.hasOwnProperty('_handlerState')) {
      cubemapAsset._handlerState = {
        // the list of requested asset ids in order of [prelit cubemap, 6 faces]
        assetIds: [null, null, null, null, null, null, null],
        // the dependent (loaded, active) texture assets
        assets: [null, null, null, null, null, null, null]
      };
    }
    const self = this;
    const assetIds = self.getAssetIds(cubemapAsset);
    const assets = [null, null, null, null, null, null, null];
    const loadedAssetIds = cubemapAsset._handlerState.assetIds;
    const loadedAssets = cubemapAsset._handlerState.assets;
    const registry = self._registry;

    // one of the dependent assets has finished loading
    let awaiting = 7;
    const onLoad = function onLoad(index, asset) {
      assets[index] = asset;
      awaiting--;
      if (awaiting === 0) {
        // all dependent assets are finished loading, set them as the active resources
        self.update(cubemapAsset, assetIds, assets);
        callback(null, cubemapAsset.resources);
      }
    };

    // handle an asset load failure
    const onError = function onError(index, err, asset) {
      callback(err);
    };

    // process the texture asset
    const processTexAsset = function processTexAsset(index, texAsset) {
      if (texAsset.loaded) {
        // asset already exists
        onLoad(index, texAsset);
      } else {
        // asset is not loaded, register for load and error events
        registry.once('load:' + texAsset.id, onLoad.bind(self, index));
        registry.once('error:' + texAsset.id, onError.bind(self, index));
        if (!texAsset.loading) {
          // kick off load if it's not already
          registry.load(texAsset);
        }
      }
    };
    let texAsset;
    for (let i = 0; i < 7; ++i) {
      const assetId = this.resolveId(assetIds[i]);
      if (!assetId) {
        // no asset
        onLoad(i, null);
      } else if (self.compareAssetIds(assetId, loadedAssetIds[i])) {
        // asset id hasn't changed from what is currently set
        onLoad(i, loadedAssets[i]);
      } else if (parseInt(assetId, 10) === assetId) {
        // assetId is an asset id
        texAsset = registry.get(assetId);
        if (texAsset) {
          processTexAsset(i, texAsset);
        } else {
          // if we are unable to find the dependent asset, then we introduce here an
          // asynchronous step. this gives the caller (for example the scene loader)
          // a chance to add the dependent scene texture to registry before we attempt
          // to get the asset again.
          setTimeout(function (index, assetId_) {
            const texAsset = registry.get(assetId_);
            if (texAsset) {
              processTexAsset(index, texAsset);
            } else {
              onError(index, 'failed to find dependent cubemap asset=' + assetId_);
            }
          }.bind(null, i, assetId));
        }
      } else {
        // assetId is a url or file object and we're responsible for creating it
        const file = typeof assetId === 'string' ? {
          url: assetId,
          filename: assetId
        } : assetId;
        texAsset = new Asset(cubemapAsset.name + '_part_' + i, 'texture', file);
        registry.add(texAsset);
        registry.once('load:' + texAsset.id, onLoad.bind(self, i));
        registry.once('error:' + texAsset.id, onError.bind(self, i));
        registry.load(texAsset);
      }
    }
  }
}

export { CubemapHandler };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3ViZW1hcC5qcyIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL2ZyYW1ld29yay9oYW5kbGVycy9jdWJlbWFwLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7XG4gICAgQUREUkVTU19DTEFNUF9UT19FREdFLCBQSVhFTEZPUk1BVF9SR0I4LCBQSVhFTEZPUk1BVF9SR0JBOCxcbiAgICBURVhUVVJFVFlQRV9ERUZBVUxULCBURVhUVVJFVFlQRV9SR0JNLCBURVhUVVJFVFlQRV9SR0JQXG59IGZyb20gJy4uLy4uL3BsYXRmb3JtL2dyYXBoaWNzL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBUZXh0dXJlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vZ3JhcGhpY3MvdGV4dHVyZS5qcyc7XG5cbmltcG9ydCB7IEFzc2V0IH0gZnJvbSAnLi4vYXNzZXQvYXNzZXQuanMnO1xuXG4vKiogQHR5cGVkZWYge2ltcG9ydCgnLi9oYW5kbGVyLmpzJykuUmVzb3VyY2VIYW5kbGVyfSBSZXNvdXJjZUhhbmRsZXIgKi9cblxuLyoqXG4gKiBSZXNvdXJjZSBoYW5kbGVyIHVzZWQgZm9yIGxvYWRpbmcgY3ViZW1hcCB7QGxpbmsgVGV4dHVyZX0gcmVzb3VyY2VzLlxuICpcbiAqIEBpbXBsZW1lbnRzIHtSZXNvdXJjZUhhbmRsZXJ9XG4gKiBAY2F0ZWdvcnkgR3JhcGhpY3NcbiAqL1xuY2xhc3MgQ3ViZW1hcEhhbmRsZXIge1xuICAgIC8qKlxuICAgICAqIFR5cGUgb2YgdGhlIHJlc291cmNlIHRoZSBoYW5kbGVyIGhhbmRsZXMuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7c3RyaW5nfVxuICAgICAqL1xuICAgIGhhbmRsZXJUeXBlID0gXCJjdWJlbWFwXCI7XG5cbiAgICAvKipcbiAgICAgKiBDcmVhdGUgYSBuZXcgQ3ViZW1hcEhhbmRsZXIgaW5zdGFuY2UuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi4vYXBwLWJhc2UuanMnKS5BcHBCYXNlfSBhcHAgLSBUaGUgcnVubmluZyB7QGxpbmsgQXBwQmFzZX0uXG4gICAgICogQGhpZGVjb25zdHJ1Y3RvclxuICAgICAqL1xuICAgIGNvbnN0cnVjdG9yKGFwcCkge1xuICAgICAgICB0aGlzLl9kZXZpY2UgPSBhcHAuZ3JhcGhpY3NEZXZpY2U7XG4gICAgICAgIHRoaXMuX3JlZ2lzdHJ5ID0gYXBwLmFzc2V0cztcbiAgICAgICAgdGhpcy5fbG9hZGVyID0gYXBwLmxvYWRlcjtcbiAgICB9XG5cbiAgICBsb2FkKHVybCwgY2FsbGJhY2ssIGFzc2V0KSB7XG4gICAgICAgIHRoaXMubG9hZEFzc2V0cyhhc3NldCwgY2FsbGJhY2spO1xuICAgIH1cblxuICAgIG9wZW4odXJsLCBkYXRhLCBhc3NldCkge1xuICAgICAgICAvLyBjYWxsZXIgd2lsbCBzZXQgb3VyIHJldHVybiB2YWx1ZSB0byBhc3NldC5yZXNvdXJjZXNbMF0uIFdlJ3ZlIGFscmVhZHkgc2V0IHJlc291cmNlc1swXSxcbiAgICAgICAgLy8gYnV0IHdlIG11c3QgcmV0dXJuIGl0IGFnYWluIGhlcmUgc28gaXQgZG9lc24ndCBnZXQgb3ZlcndyaXR0ZW4uXG4gICAgICAgIHJldHVybiBhc3NldCA/IGFzc2V0LnJlc291cmNlIDogbnVsbDtcbiAgICB9XG5cbiAgICBwYXRjaChhc3NldCwgcmVnaXN0cnkpIHtcbiAgICAgICAgdGhpcy5sb2FkQXNzZXRzKGFzc2V0LCBmdW5jdGlvbiAoZXJyLCByZXN1bHQpIHtcbiAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgICAvLyBmaXJlIGVycm9yIGV2ZW50IGlmIHBhdGNoIGZhaWxlZFxuICAgICAgICAgICAgICAgIHJlZ2lzdHJ5LmZpcmUoJ2Vycm9yJywgYXNzZXQpO1xuICAgICAgICAgICAgICAgIHJlZ2lzdHJ5LmZpcmUoJ2Vycm9yOicgKyBhc3NldC5pZCwgZXJyLCBhc3NldCk7XG4gICAgICAgICAgICAgICAgYXNzZXQuZmlyZSgnZXJyb3InLCBhc3NldCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBub3RoaW5nIHRvIGRvIHNpbmNlIGFzc2V0OmNoYW5nZSB3b3VsZCBoYXZlIGJlZW4gcmFpc2VkIGlmXG4gICAgICAgICAgICAvLyByZXNvdXJjZXMgd2VyZSBjaGFuZ2VkLlxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBnZXQgdGhlIGxpc3Qgb2YgZGVwZW5kZW50IGFzc2V0IGlkcyBmb3IgdGhlIGN1YmVtYXBcbiAgICBnZXRBc3NldElkcyhjdWJlbWFwQXNzZXQpIHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gW107XG5cbiAgICAgICAgLy8gcHJlZmlsdGVyZWQgY3ViZW1hcCBpcyBzdG9yZWQgYXQgaW5kZXggMFxuICAgICAgICByZXN1bHRbMF0gPSBjdWJlbWFwQXNzZXQuZmlsZTtcblxuICAgICAgICAvLyBmYWNlcyBhcmUgc3RvcmVkIGF0IGluZGV4IDEuLjZcbiAgICAgICAgaWYgKChjdWJlbWFwQXNzZXQubG9hZEZhY2VzIHx8ICFjdWJlbWFwQXNzZXQuZmlsZSkgJiYgY3ViZW1hcEFzc2V0LmRhdGEgJiYgY3ViZW1hcEFzc2V0LmRhdGEudGV4dHVyZXMpIHtcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgNjsgKytpKSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0W2kgKyAxXSA9IGN1YmVtYXBBc3NldC5kYXRhLnRleHR1cmVzW2ldO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmVzdWx0WzFdID0gcmVzdWx0WzJdID0gcmVzdWx0WzNdID0gcmVzdWx0WzRdID0gcmVzdWx0WzVdID0gcmVzdWx0WzZdID0gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuXG4gICAgLy8gdGVzdCB3aGV0aGVyIHR3byBhc3NldHMgaWRzIGFyZSB0aGUgc2FtZVxuICAgIGNvbXBhcmVBc3NldElkcyhhc3NldElkQSwgYXNzZXRJZEIpIHtcbiAgICAgICAgaWYgKGFzc2V0SWRBICYmIGFzc2V0SWRCKSB7XG4gICAgICAgICAgICBpZiAocGFyc2VJbnQoYXNzZXRJZEEsIDEwKSA9PT0gYXNzZXRJZEEgfHwgdHlwZW9mIGFzc2V0SWRBID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgIHJldHVybiBhc3NldElkQSA9PT0gYXNzZXRJZEI7ICAgICAgICAgICAvLyBpZCBvciB1cmxcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIGFzc2V0SWRBLnVybCA9PT0gYXNzZXRJZEIudXJsOyAgICAgICAvLyBmaWxlL3VybCBzdHJ1Y3R1cmUgd2l0aCB1cmwgYW5kIGZpbGVuYW1lXG4gICAgICAgIH1cbiAgICAgICAgLy8gZWxzZSB7XG4gICAgICAgIHJldHVybiAoYXNzZXRJZEEgIT09IG51bGwpID09PSAoYXNzZXRJZEIgIT09IG51bGwpO1xuICAgIH1cblxuICAgIC8vIHVwZGF0ZSB0aGUgY3ViZW1hcCByZXNvdXJjZXMgZ2l2ZW4gYSBuZXdseSBsb2FkZWQgc2V0IG9mIGFzc2V0cyB3aXRoIHRoZWlyIGNvcnJlc3BvbmRpbmcgaWRzXG4gICAgdXBkYXRlKGN1YmVtYXBBc3NldCwgYXNzZXRJZHMsIGFzc2V0cykge1xuICAgICAgICBjb25zdCBhc3NldERhdGEgPSBjdWJlbWFwQXNzZXQuZGF0YSB8fCB7fTtcbiAgICAgICAgY29uc3Qgb2xkQXNzZXRzID0gY3ViZW1hcEFzc2V0Ll9oYW5kbGVyU3RhdGUuYXNzZXRzO1xuICAgICAgICBjb25zdCBvbGRSZXNvdXJjZXMgPSBjdWJlbWFwQXNzZXQuX3Jlc291cmNlcztcbiAgICAgICAgbGV0IHRleCwgbWlwLCBpO1xuXG4gICAgICAgIC8vIGZhY2VzLCBwcmVsaXQgY3ViZW1hcCAxMjgsIDY0LCAzMiwgMTYsIDgsIDRcbiAgICAgICAgY29uc3QgcmVzb3VyY2VzID0gW251bGwsIG51bGwsIG51bGwsIG51bGwsIG51bGwsIG51bGwsIG51bGxdO1xuXG4gICAgICAgIC8vIHRleHR1cmUgdHlwZSB1c2VkIGZvciBmYWNlcyBhbmQgcHJlbGl0IGN1YmVtYXBzIGFyZSBib3RoIHRha2VuIGZyb21cbiAgICAgICAgLy8gY3ViZW1hcC5kYXRhLnJnYm1cbiAgICAgICAgY29uc3QgZ2V0VHlwZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGlmIChhc3NldERhdGEuaGFzT3duUHJvcGVydHkoJ3R5cGUnKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBhc3NldERhdGEudHlwZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChhc3NldERhdGEuaGFzT3duUHJvcGVydHkoJ3JnYm0nKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBhc3NldERhdGEucmdibSA/IFRFWFRVUkVUWVBFX1JHQk0gOiBURVhUVVJFVFlQRV9ERUZBVUxUO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH07XG5cbiAgICAgICAgLy8gaGFuZGxlIHRoZSBwcmVsaXQgZGF0YVxuICAgICAgICBpZiAoIWN1YmVtYXBBc3NldC5sb2FkZWQgfHwgYXNzZXRzWzBdICE9PSBvbGRBc3NldHNbMF0pIHtcbiAgICAgICAgICAgIC8vIHByZWxpdCBhc3NldCBjaGFuZ2VkXG4gICAgICAgICAgICBpZiAoYXNzZXRzWzBdKSB7XG4gICAgICAgICAgICAgICAgdGV4ID0gYXNzZXRzWzBdLnJlc291cmNlO1xuICAgICAgICAgICAgICAgIGlmICh0ZXguY3ViZW1hcCkge1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgNjsgKytpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXNvdXJjZXNbaSArIDFdID0gbmV3IFRleHR1cmUodGhpcy5fZGV2aWNlLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogY3ViZW1hcEFzc2V0Lm5hbWUgKyAnX3ByZWxpdEN1YmVtYXAnICsgKHRleC53aWR0aCA+PiBpKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjdWJlbWFwOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGFzc3VtZSBwcmVmaWx0ZXJlZCBkYXRhIGhhcyBzYW1lIGVuY29kaW5nIGFzIHRoZSBmYWNlcyBhc3NldFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6IGdldFR5cGUoKSB8fCB0ZXgudHlwZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB3aWR0aDogdGV4LndpZHRoID4+IGksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaGVpZ2h0OiB0ZXguaGVpZ2h0ID4+IGksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZm9ybWF0OiB0ZXguZm9ybWF0LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxldmVsczogW3RleC5fbGV2ZWxzW2ldXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmaXhDdWJlbWFwU2VhbXM6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYWRkcmVzc1U6IEFERFJFU1NfQ0xBTVBfVE9fRURHRSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBhZGRyZXNzVjogQUREUkVTU19DTEFNUF9UT19FREdFLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGdlbmVyYXRlIGN1YmVtYXBzIG9uIHRoZSB0b3AgbGV2ZWwgb25seVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1pcG1hcHM6IGkgPT09IDBcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gcHJlZmlsdGVyZWQgZGF0YSBpcyBhbiBlbnYgYXRsYXNcbiAgICAgICAgICAgICAgICAgICAgdGV4LnR5cGUgPSBURVhUVVJFVFlQRV9SR0JQO1xuICAgICAgICAgICAgICAgICAgICB0ZXguYWRkcmVzc1UgPSBBRERSRVNTX0NMQU1QX1RPX0VER0U7XG4gICAgICAgICAgICAgICAgICAgIHRleC5hZGRyZXNzViA9IEFERFJFU1NfQ0xBTVBfVE9fRURHRTtcbiAgICAgICAgICAgICAgICAgICAgdGV4Lm1pcG1hcHMgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgcmVzb3VyY2VzWzFdID0gdGV4O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIHByZWxpdCBhc3NldCBkaWRuJ3QgY2hhbmdlIHNvIGtlZXAgdGhlIGV4aXN0aW5nIGN1YmVtYXAgcmVzb3VyY2VzXG4gICAgICAgICAgICByZXNvdXJjZXNbMV0gPSBvbGRSZXNvdXJjZXNbMV0gfHwgbnVsbDtcbiAgICAgICAgICAgIHJlc291cmNlc1syXSA9IG9sZFJlc291cmNlc1syXSB8fCBudWxsO1xuICAgICAgICAgICAgcmVzb3VyY2VzWzNdID0gb2xkUmVzb3VyY2VzWzNdIHx8IG51bGw7XG4gICAgICAgICAgICByZXNvdXJjZXNbNF0gPSBvbGRSZXNvdXJjZXNbNF0gfHwgbnVsbDtcbiAgICAgICAgICAgIHJlc291cmNlc1s1XSA9IG9sZFJlc291cmNlc1s1XSB8fCBudWxsO1xuICAgICAgICAgICAgcmVzb3VyY2VzWzZdID0gb2xkUmVzb3VyY2VzWzZdIHx8IG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBmYWNlQXNzZXRzID0gYXNzZXRzLnNsaWNlKDEpO1xuICAgICAgICBpZiAoIWN1YmVtYXBBc3NldC5sb2FkZWQgfHwgIXRoaXMuY21wQXJyYXlzKGZhY2VBc3NldHMsIG9sZEFzc2V0cy5zbGljZSgxKSkpIHtcbiAgICAgICAgICAgIC8vIGZhY2UgYXNzZXRzIGhhdmUgY2hhbmdlZFxuICAgICAgICAgICAgaWYgKGZhY2VBc3NldHMuaW5kZXhPZihudWxsKSA9PT0gLTEpIHtcbiAgICAgICAgICAgICAgICAvLyBleHRyYWN0IGN1YmVtYXAgbGV2ZWwgZGF0YSBmcm9tIGZhY2UgdGV4dHVyZXNcbiAgICAgICAgICAgICAgICBjb25zdCBmYWNlVGV4dHVyZXMgPSBmYWNlQXNzZXRzLm1hcChmdW5jdGlvbiAoYXNzZXQpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGFzc2V0LnJlc291cmNlO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIGNvbnN0IGZhY2VMZXZlbHMgPSBbXTtcbiAgICAgICAgICAgICAgICBmb3IgKG1pcCA9IDA7IG1pcCA8IGZhY2VUZXh0dXJlc1swXS5fbGV2ZWxzLmxlbmd0aDsgKyttaXApIHtcbiAgICAgICAgICAgICAgICAgICAgZmFjZUxldmVscy5wdXNoKGZhY2VUZXh0dXJlcy5tYXAoZnVuY3Rpb24gKGZhY2VUZXh0dXJlKSB7ICAvLyBlc2xpbnQtZGlzYWJsZS1saW5lIG5vLWxvb3AtZnVuY1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhY2VUZXh0dXJlLl9sZXZlbHNbbWlwXTtcbiAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIEZvcmNlIFJHQkE4IGlmIHdlIGFyZSBsb2FkaW5nIGEgUkdCOCB0ZXh0dXJlIGR1ZSB0byBhIGJ1ZyBvbiBNMSBNYWNzIE1vbnRlcmV5IGFuZCBDaHJvbWUgbm90XG4gICAgICAgICAgICAgICAgLy8gcmVuZGVyaW5nIHRoZSBmYWNlIG9uIHJpZ2h0IG9mIHRoZSBjdWJlbWFwIChgZmFjZUFzc2V0c1swXWAgYW5kIGByZXNvdXJjZXNbMV1gKS5cbiAgICAgICAgICAgICAgICAvLyBVc2luZyBhIFJHQkE4IHRleHR1cmUgd29ya3MgYXJvdW5kIHRoZSBpc3N1ZSBodHRwczovL2dpdGh1Yi5jb20vcGxheWNhbnZhcy9lbmdpbmUvaXNzdWVzLzQwOTFcbiAgICAgICAgICAgICAgICBjb25zdCBmb3JtYXQgPSBmYWNlVGV4dHVyZXNbMF0uZm9ybWF0O1xuXG4gICAgICAgICAgICAgICAgY29uc3QgZmFjZXMgPSBuZXcgVGV4dHVyZSh0aGlzLl9kZXZpY2UsIHtcbiAgICAgICAgICAgICAgICAgICAgbmFtZTogY3ViZW1hcEFzc2V0Lm5hbWUgKyAnX2ZhY2VzJyxcbiAgICAgICAgICAgICAgICAgICAgY3ViZW1hcDogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogZ2V0VHlwZSgpIHx8IGZhY2VUZXh0dXJlc1swXS50eXBlLFxuICAgICAgICAgICAgICAgICAgICB3aWR0aDogZmFjZVRleHR1cmVzWzBdLndpZHRoLFxuICAgICAgICAgICAgICAgICAgICBoZWlnaHQ6IGZhY2VUZXh0dXJlc1swXS5oZWlnaHQsXG4gICAgICAgICAgICAgICAgICAgIGZvcm1hdDogZm9ybWF0ID09PSBQSVhFTEZPUk1BVF9SR0I4ID8gUElYRUxGT1JNQVRfUkdCQTggOiBmb3JtYXQsXG4gICAgICAgICAgICAgICAgICAgIG1pcG1hcHM6IGFzc2V0RGF0YS5taXBtYXBzID8/IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIGxldmVsczogZmFjZUxldmVscyxcbiAgICAgICAgICAgICAgICAgICAgbWluRmlsdGVyOiBhc3NldERhdGEuaGFzT3duUHJvcGVydHkoJ21pbkZpbHRlcicpID8gYXNzZXREYXRhLm1pbkZpbHRlciA6IGZhY2VUZXh0dXJlc1swXS5taW5GaWx0ZXIsXG4gICAgICAgICAgICAgICAgICAgIG1hZ0ZpbHRlcjogYXNzZXREYXRhLmhhc093blByb3BlcnR5KCdtYWdGaWx0ZXInKSA/IGFzc2V0RGF0YS5tYWdGaWx0ZXIgOiBmYWNlVGV4dHVyZXNbMF0ubWFnRmlsdGVyLFxuICAgICAgICAgICAgICAgICAgICBhbmlzb3Ryb3B5OiBhc3NldERhdGEuaGFzT3duUHJvcGVydHkoJ2FuaXNvdHJvcHknKSA/IGFzc2V0RGF0YS5hbmlzb3Ryb3B5IDogMSxcbiAgICAgICAgICAgICAgICAgICAgYWRkcmVzc1U6IEFERFJFU1NfQ0xBTVBfVE9fRURHRSxcbiAgICAgICAgICAgICAgICAgICAgYWRkcmVzc1Y6IEFERFJFU1NfQ0xBTVBfVE9fRURHRSxcbiAgICAgICAgICAgICAgICAgICAgZml4Q3ViZW1hcFNlYW1zOiAhIWFzc2V0c1swXVxuICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgcmVzb3VyY2VzWzBdID0gZmFjZXM7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBubyBmYWNlcyBjaGFuZ2VkIHNvIGtlZXAgZXhpc3RpbmcgZmFjZXMgY3ViZW1hcFxuICAgICAgICAgICAgcmVzb3VyY2VzWzBdID0gb2xkUmVzb3VyY2VzWzBdIHx8IG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBjaGVjayBpZiBhbnkgcmVzb3VyY2UgY2hhbmdlZFxuICAgICAgICBpZiAoIXRoaXMuY21wQXJyYXlzKHJlc291cmNlcywgb2xkUmVzb3VyY2VzKSkge1xuICAgICAgICAgICAgLy8gc2V0IHRoZSBuZXcgcmVzb3VyY2VzLCBjaGFuZ2UgZXZlbnRzIHdpbGwgZmlyZVxuICAgICAgICAgICAgY3ViZW1hcEFzc2V0LnJlc291cmNlcyA9IHJlc291cmNlcztcbiAgICAgICAgICAgIGN1YmVtYXBBc3NldC5faGFuZGxlclN0YXRlLmFzc2V0SWRzID0gYXNzZXRJZHM7XG4gICAgICAgICAgICBjdWJlbWFwQXNzZXQuX2hhbmRsZXJTdGF0ZS5hc3NldHMgPSBhc3NldHM7XG5cbiAgICAgICAgICAgIC8vIGRlc3Ryb3kgdGhlIG9sZCBjdWJlbWFwIHJlc291cmNlcyB0aGF0IGFyZSBub3QgbG9uZ2VyIG5lZWRlZFxuICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IG9sZFJlc291cmNlcy5sZW5ndGg7ICsraSkge1xuICAgICAgICAgICAgICAgIGlmIChvbGRSZXNvdXJjZXNbaV0gIT09IG51bGwgJiYgcmVzb3VyY2VzLmluZGV4T2Yob2xkUmVzb3VyY2VzW2ldKSA9PT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgb2xkUmVzb3VyY2VzW2ldLmRlc3Ryb3koKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBkZXN0cm95IG9sZCBhc3NldHMgd2hpY2ggaGF2ZSBiZWVuIHJlcGxhY2VkXG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBvbGRBc3NldHMubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgICAgIGlmIChvbGRBc3NldHNbaV0gIT09IG51bGwgJiYgYXNzZXRzLmluZGV4T2Yob2xkQXNzZXRzW2ldKSA9PT0gLTEpIHtcbiAgICAgICAgICAgICAgICBvbGRBc3NldHNbaV0udW5sb2FkKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBjbXBBcnJheXMoYXJyMSwgYXJyMikge1xuICAgICAgICBpZiAoYXJyMS5sZW5ndGggIT09IGFycjIubGVuZ3RoKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhcnIxLmxlbmd0aDsgKytpKSB7XG4gICAgICAgICAgICBpZiAoYXJyMVtpXSAhPT0gYXJyMltpXSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICAvLyBjb252ZXJ0IHN0cmluZyBpZCB0byBpbnRcbiAgICByZXNvbHZlSWQodmFsdWUpIHtcbiAgICAgICAgY29uc3QgdmFsdWVJbnQgPSBwYXJzZUludCh2YWx1ZSwgMTApO1xuICAgICAgICByZXR1cm4gKCh2YWx1ZUludCA9PT0gdmFsdWUpIHx8ICh2YWx1ZUludC50b1N0cmluZygpID09PSB2YWx1ZSkpID8gdmFsdWVJbnQgOiB2YWx1ZTtcbiAgICB9XG5cbiAgICBsb2FkQXNzZXRzKGN1YmVtYXBBc3NldCwgY2FsbGJhY2spIHtcbiAgICAgICAgLy8gaW5pdGlhbGl6ZSBhc3NldCBzdHJ1Y3R1cmVzIGZvciB0cmFja2luZyBsb2FkIHJlcXVlc3RzXG4gICAgICAgIGlmICghY3ViZW1hcEFzc2V0Lmhhc093blByb3BlcnR5KCdfaGFuZGxlclN0YXRlJykpIHtcbiAgICAgICAgICAgIGN1YmVtYXBBc3NldC5faGFuZGxlclN0YXRlID0ge1xuICAgICAgICAgICAgICAgIC8vIHRoZSBsaXN0IG9mIHJlcXVlc3RlZCBhc3NldCBpZHMgaW4gb3JkZXIgb2YgW3ByZWxpdCBjdWJlbWFwLCA2IGZhY2VzXVxuICAgICAgICAgICAgICAgIGFzc2V0SWRzOiBbbnVsbCwgbnVsbCwgbnVsbCwgbnVsbCwgbnVsbCwgbnVsbCwgbnVsbF0sXG4gICAgICAgICAgICAgICAgLy8gdGhlIGRlcGVuZGVudCAobG9hZGVkLCBhY3RpdmUpIHRleHR1cmUgYXNzZXRzXG4gICAgICAgICAgICAgICAgYXNzZXRzOiBbbnVsbCwgbnVsbCwgbnVsbCwgbnVsbCwgbnVsbCwgbnVsbCwgbnVsbF1cbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBzZWxmID0gdGhpcztcbiAgICAgICAgY29uc3QgYXNzZXRJZHMgPSBzZWxmLmdldEFzc2V0SWRzKGN1YmVtYXBBc3NldCk7XG4gICAgICAgIGNvbnN0IGFzc2V0cyA9IFtudWxsLCBudWxsLCBudWxsLCBudWxsLCBudWxsLCBudWxsLCBudWxsXTtcbiAgICAgICAgY29uc3QgbG9hZGVkQXNzZXRJZHMgPSBjdWJlbWFwQXNzZXQuX2hhbmRsZXJTdGF0ZS5hc3NldElkcztcbiAgICAgICAgY29uc3QgbG9hZGVkQXNzZXRzID0gY3ViZW1hcEFzc2V0Ll9oYW5kbGVyU3RhdGUuYXNzZXRzO1xuICAgICAgICBjb25zdCByZWdpc3RyeSA9IHNlbGYuX3JlZ2lzdHJ5O1xuXG4gICAgICAgIC8vIG9uZSBvZiB0aGUgZGVwZW5kZW50IGFzc2V0cyBoYXMgZmluaXNoZWQgbG9hZGluZ1xuICAgICAgICBsZXQgYXdhaXRpbmcgPSA3O1xuICAgICAgICBjb25zdCBvbkxvYWQgPSBmdW5jdGlvbiAoaW5kZXgsIGFzc2V0KSB7XG4gICAgICAgICAgICBhc3NldHNbaW5kZXhdID0gYXNzZXQ7XG4gICAgICAgICAgICBhd2FpdGluZy0tO1xuXG4gICAgICAgICAgICBpZiAoYXdhaXRpbmcgPT09IDApIHtcbiAgICAgICAgICAgICAgICAvLyBhbGwgZGVwZW5kZW50IGFzc2V0cyBhcmUgZmluaXNoZWQgbG9hZGluZywgc2V0IHRoZW0gYXMgdGhlIGFjdGl2ZSByZXNvdXJjZXNcbiAgICAgICAgICAgICAgICBzZWxmLnVwZGF0ZShjdWJlbWFwQXNzZXQsIGFzc2V0SWRzLCBhc3NldHMpO1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsIGN1YmVtYXBBc3NldC5yZXNvdXJjZXMpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIC8vIGhhbmRsZSBhbiBhc3NldCBsb2FkIGZhaWx1cmVcbiAgICAgICAgY29uc3Qgb25FcnJvciA9IGZ1bmN0aW9uIChpbmRleCwgZXJyLCBhc3NldCkge1xuICAgICAgICAgICAgY2FsbGJhY2soZXJyKTtcbiAgICAgICAgfTtcblxuICAgICAgICAvLyBwcm9jZXNzIHRoZSB0ZXh0dXJlIGFzc2V0XG4gICAgICAgIGNvbnN0IHByb2Nlc3NUZXhBc3NldCA9IGZ1bmN0aW9uIChpbmRleCwgdGV4QXNzZXQpIHtcbiAgICAgICAgICAgIGlmICh0ZXhBc3NldC5sb2FkZWQpIHtcbiAgICAgICAgICAgICAgICAvLyBhc3NldCBhbHJlYWR5IGV4aXN0c1xuICAgICAgICAgICAgICAgIG9uTG9hZChpbmRleCwgdGV4QXNzZXQpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBhc3NldCBpcyBub3QgbG9hZGVkLCByZWdpc3RlciBmb3IgbG9hZCBhbmQgZXJyb3IgZXZlbnRzXG4gICAgICAgICAgICAgICAgcmVnaXN0cnkub25jZSgnbG9hZDonICsgdGV4QXNzZXQuaWQsIG9uTG9hZC5iaW5kKHNlbGYsIGluZGV4KSk7XG4gICAgICAgICAgICAgICAgcmVnaXN0cnkub25jZSgnZXJyb3I6JyArIHRleEFzc2V0LmlkLCBvbkVycm9yLmJpbmQoc2VsZiwgaW5kZXgpKTtcbiAgICAgICAgICAgICAgICBpZiAoIXRleEFzc2V0LmxvYWRpbmcpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8ga2ljayBvZmYgbG9hZCBpZiBpdCdzIG5vdCBhbHJlYWR5XG4gICAgICAgICAgICAgICAgICAgIHJlZ2lzdHJ5LmxvYWQodGV4QXNzZXQpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICBsZXQgdGV4QXNzZXQ7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgNzsgKytpKSB7XG4gICAgICAgICAgICBjb25zdCBhc3NldElkID0gdGhpcy5yZXNvbHZlSWQoYXNzZXRJZHNbaV0pO1xuXG4gICAgICAgICAgICBpZiAoIWFzc2V0SWQpIHtcbiAgICAgICAgICAgICAgICAvLyBubyBhc3NldFxuICAgICAgICAgICAgICAgIG9uTG9hZChpLCBudWxsKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoc2VsZi5jb21wYXJlQXNzZXRJZHMoYXNzZXRJZCwgbG9hZGVkQXNzZXRJZHNbaV0pKSB7XG4gICAgICAgICAgICAgICAgLy8gYXNzZXQgaWQgaGFzbid0IGNoYW5nZWQgZnJvbSB3aGF0IGlzIGN1cnJlbnRseSBzZXRcbiAgICAgICAgICAgICAgICBvbkxvYWQoaSwgbG9hZGVkQXNzZXRzW2ldKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocGFyc2VJbnQoYXNzZXRJZCwgMTApID09PSBhc3NldElkKSB7XG4gICAgICAgICAgICAgICAgLy8gYXNzZXRJZCBpcyBhbiBhc3NldCBpZFxuICAgICAgICAgICAgICAgIHRleEFzc2V0ID0gcmVnaXN0cnkuZ2V0KGFzc2V0SWQpO1xuICAgICAgICAgICAgICAgIGlmICh0ZXhBc3NldCkge1xuICAgICAgICAgICAgICAgICAgICBwcm9jZXNzVGV4QXNzZXQoaSwgdGV4QXNzZXQpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIGlmIHdlIGFyZSB1bmFibGUgdG8gZmluZCB0aGUgZGVwZW5kZW50IGFzc2V0LCB0aGVuIHdlIGludHJvZHVjZSBoZXJlIGFuXG4gICAgICAgICAgICAgICAgICAgIC8vIGFzeW5jaHJvbm91cyBzdGVwLiB0aGlzIGdpdmVzIHRoZSBjYWxsZXIgKGZvciBleGFtcGxlIHRoZSBzY2VuZSBsb2FkZXIpXG4gICAgICAgICAgICAgICAgICAgIC8vIGEgY2hhbmNlIHRvIGFkZCB0aGUgZGVwZW5kZW50IHNjZW5lIHRleHR1cmUgdG8gcmVnaXN0cnkgYmVmb3JlIHdlIGF0dGVtcHRcbiAgICAgICAgICAgICAgICAgICAgLy8gdG8gZ2V0IHRoZSBhc3NldCBhZ2Fpbi5cbiAgICAgICAgICAgICAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbiAoaW5kZXgsIGFzc2V0SWRfKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB0ZXhBc3NldCA9IHJlZ2lzdHJ5LmdldChhc3NldElkXyk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodGV4QXNzZXQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9jZXNzVGV4QXNzZXQoaW5kZXgsIHRleEFzc2V0KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgb25FcnJvcihpbmRleCwgJ2ZhaWxlZCB0byBmaW5kIGRlcGVuZGVudCBjdWJlbWFwIGFzc2V0PScgKyBhc3NldElkXyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0uYmluZChudWxsLCBpLCBhc3NldElkKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBhc3NldElkIGlzIGEgdXJsIG9yIGZpbGUgb2JqZWN0IGFuZCB3ZSdyZSByZXNwb25zaWJsZSBmb3IgY3JlYXRpbmcgaXRcbiAgICAgICAgICAgICAgICBjb25zdCBmaWxlID0gKHR5cGVvZiBhc3NldElkID09PSAnc3RyaW5nJykgPyB7XG4gICAgICAgICAgICAgICAgICAgIHVybDogYXNzZXRJZCxcbiAgICAgICAgICAgICAgICAgICAgZmlsZW5hbWU6IGFzc2V0SWRcbiAgICAgICAgICAgICAgICB9IDogYXNzZXRJZDtcbiAgICAgICAgICAgICAgICB0ZXhBc3NldCA9IG5ldyBBc3NldChjdWJlbWFwQXNzZXQubmFtZSArICdfcGFydF8nICsgaSwgJ3RleHR1cmUnLCBmaWxlKTtcbiAgICAgICAgICAgICAgICByZWdpc3RyeS5hZGQodGV4QXNzZXQpO1xuICAgICAgICAgICAgICAgIHJlZ2lzdHJ5Lm9uY2UoJ2xvYWQ6JyArIHRleEFzc2V0LmlkLCBvbkxvYWQuYmluZChzZWxmLCBpKSk7XG4gICAgICAgICAgICAgICAgcmVnaXN0cnkub25jZSgnZXJyb3I6JyArIHRleEFzc2V0LmlkLCBvbkVycm9yLmJpbmQoc2VsZiwgaSkpO1xuICAgICAgICAgICAgICAgIHJlZ2lzdHJ5LmxvYWQodGV4QXNzZXQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxufVxuXG5leHBvcnQgeyBDdWJlbWFwSGFuZGxlciB9O1xuIl0sIm5hbWVzIjpbIkN1YmVtYXBIYW5kbGVyIiwiY29uc3RydWN0b3IiLCJhcHAiLCJoYW5kbGVyVHlwZSIsIl9kZXZpY2UiLCJncmFwaGljc0RldmljZSIsIl9yZWdpc3RyeSIsImFzc2V0cyIsIl9sb2FkZXIiLCJsb2FkZXIiLCJsb2FkIiwidXJsIiwiY2FsbGJhY2siLCJhc3NldCIsImxvYWRBc3NldHMiLCJvcGVuIiwiZGF0YSIsInJlc291cmNlIiwicGF0Y2giLCJyZWdpc3RyeSIsImVyciIsInJlc3VsdCIsImZpcmUiLCJpZCIsImdldEFzc2V0SWRzIiwiY3ViZW1hcEFzc2V0IiwiZmlsZSIsImxvYWRGYWNlcyIsInRleHR1cmVzIiwiaSIsImNvbXBhcmVBc3NldElkcyIsImFzc2V0SWRBIiwiYXNzZXRJZEIiLCJwYXJzZUludCIsInVwZGF0ZSIsImFzc2V0SWRzIiwiYXNzZXREYXRhIiwib2xkQXNzZXRzIiwiX2hhbmRsZXJTdGF0ZSIsIm9sZFJlc291cmNlcyIsIl9yZXNvdXJjZXMiLCJ0ZXgiLCJtaXAiLCJyZXNvdXJjZXMiLCJnZXRUeXBlIiwiaGFzT3duUHJvcGVydHkiLCJ0eXBlIiwicmdibSIsIlRFWFRVUkVUWVBFX1JHQk0iLCJURVhUVVJFVFlQRV9ERUZBVUxUIiwibG9hZGVkIiwiY3ViZW1hcCIsIlRleHR1cmUiLCJuYW1lIiwid2lkdGgiLCJoZWlnaHQiLCJmb3JtYXQiLCJsZXZlbHMiLCJfbGV2ZWxzIiwiZml4Q3ViZW1hcFNlYW1zIiwiYWRkcmVzc1UiLCJBRERSRVNTX0NMQU1QX1RPX0VER0UiLCJhZGRyZXNzViIsIm1pcG1hcHMiLCJURVhUVVJFVFlQRV9SR0JQIiwiZmFjZUFzc2V0cyIsInNsaWNlIiwiY21wQXJyYXlzIiwiaW5kZXhPZiIsIl9hc3NldERhdGEkbWlwbWFwcyIsImZhY2VUZXh0dXJlcyIsIm1hcCIsImZhY2VMZXZlbHMiLCJsZW5ndGgiLCJwdXNoIiwiZmFjZVRleHR1cmUiLCJmYWNlcyIsIlBJWEVMRk9STUFUX1JHQjgiLCJQSVhFTEZPUk1BVF9SR0JBOCIsIm1pbkZpbHRlciIsIm1hZ0ZpbHRlciIsImFuaXNvdHJvcHkiLCJkZXN0cm95IiwidW5sb2FkIiwiYXJyMSIsImFycjIiLCJyZXNvbHZlSWQiLCJ2YWx1ZSIsInZhbHVlSW50IiwidG9TdHJpbmciLCJzZWxmIiwibG9hZGVkQXNzZXRJZHMiLCJsb2FkZWRBc3NldHMiLCJhd2FpdGluZyIsIm9uTG9hZCIsImluZGV4Iiwib25FcnJvciIsInByb2Nlc3NUZXhBc3NldCIsInRleEFzc2V0Iiwib25jZSIsImJpbmQiLCJsb2FkaW5nIiwiYXNzZXRJZCIs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
