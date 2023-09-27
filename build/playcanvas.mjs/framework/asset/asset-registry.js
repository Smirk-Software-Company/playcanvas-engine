import { path } from '../../core/path.js';
import { Debug } from '../../core/debug.js';
import { EventHandler } from '../../core/event-handler.js';
import { TagsCache } from '../../core/tags-cache.js';
import { standardMaterialTextureParameters } from '../../scene/materials/standard-material-parameters.js';
import { script } from '../script.js';
import { Asset } from './asset.js';

/**
 * Callback used by {@link AssetRegistry#filter} to filter assets.
 *
 * @callback FilterAssetCallback
 * @param {Asset} asset - The current asset to filter.
 * @returns {boolean} Return `true` to include asset to result list.
 */

/**
 * Callback used by {@link AssetRegistry#loadFromUrl} and called when an asset is loaded (or an
 * error occurs).
 *
 * @callback LoadAssetCallback
 * @param {string|null} err - The error message is null if no errors were encountered.
 * @param {Asset} [asset] - The loaded asset if no errors were encountered.
 */

/**
 * Container for all assets that are available to this application. Note that PlayCanvas scripts
 * are provided with an AssetRegistry instance as `app.assets`.
 *
 * @augments EventHandler
 */
class AssetRegistry extends EventHandler {
  /**
   * Create an instance of an AssetRegistry.
   *
   * @param {import('../handlers/loader.js').ResourceLoader} loader - The ResourceLoader used to
   * load the asset files.
   */
  constructor(loader) {
    super();
    /**
     * @type {Set<Asset>}
     * @private
     */
    this._assets = new Set();
    /**
     * @type {Map<number, Asset>}
     * @private
     */
    this._idToAsset = new Map();
    /**
     * @type {Map<string, Asset>}
     * @private
     */
    this._urlToAsset = new Map();
    /**
     * @type {Map<string, Set<Asset>>}
     * @private
     */
    this._nameToAsset = new Map();
    /**
     * Index for looking up by tags.
     *
     * @private
     */
    this._tags = new TagsCache('_id');
    /**
     * A URL prefix that will be added to all asset loading requests.
     *
     * @type {string|null}
     */
    this.prefix = null;
    this._loader = loader;
  }

  /**
   * Fired when an asset completes loading.
   *
   * @event AssetRegistry#load
   * @param {Asset} asset - The asset that has just loaded.
   * @example
   * app.assets.on("load", function (asset) {
   *     console.log("asset loaded: " + asset.name);
   * });
   */

  /**
   * Fired when an asset completes loading.
   *
   * @event AssetRegistry#load:[id]
   * @param {Asset} asset - The asset that has just loaded.
   * @example
   * const id = 123456;
   * const asset = app.assets.get(id);
   * app.assets.on("load:" + id, function (asset) {
   *     console.log("asset loaded: " + asset.name);
   * });
   * app.assets.load(asset);
   */

  /**
   * Fired when an asset completes loading.
   *
   * @event AssetRegistry#load:url:[url]
   * @param {Asset} asset - The asset that has just loaded.
   * @example
   * const id = 123456;
   * const asset = app.assets.get(id);
   * app.assets.on("load:url:" + asset.file.url, function (asset) {
   *     console.log("asset loaded: " + asset.name);
   * });
   * app.assets.load(asset);
   */

  /**
   * Fired when an asset is added to the registry.
   *
   * @event AssetRegistry#add
   * @param {Asset} asset - The asset that was added.
   * @example
   * app.assets.on("add", function (asset) {
   *     console.log("New asset added: " + asset.name);
   * });
   */

  /**
   * Fired when an asset is added to the registry.
   *
   * @event AssetRegistry#add:[id]
   * @param {Asset} asset - The asset that was added.
   * @example
   * const id = 123456;
   * app.assets.on("add:" + id, function (asset) {
   *     console.log("Asset 123456 loaded");
   * });
   */

  /**
   * Fired when an asset is added to the registry.
   *
   * @event AssetRegistry#add:url:[url]
   * @param {Asset} asset - The asset that was added.
   */

  /**
   * Fired when an asset is removed from the registry.
   *
   * @event AssetRegistry#remove
   * @param {Asset} asset - The asset that was removed.
   * @example
   * app.assets.on("remove", function (asset) {
   *     console.log("Asset removed: " + asset.name);
   * });
   */

  /**
   * Fired when an asset is removed from the registry.
   *
   * @event AssetRegistry#remove:[id]
   * @param {Asset} asset - The asset that was removed.
   * @example
   * const id = 123456;
   * app.assets.on("remove:" + id, function (asset) {
   *     console.log("Asset removed: " + asset.name);
   * });
   */

  /**
   * Fired when an asset is removed from the registry.
   *
   * @event AssetRegistry#remove:url:[url]
   * @param {Asset} asset - The asset that was removed.
   */

  /**
   * Fired when an error occurs during asset loading.
   *
   * @event AssetRegistry#error
   * @param {string} err - The error message.
   * @param {Asset} asset - The asset that generated the error.
   * @example
   * const id = 123456;
   * const asset = app.assets.get(id);
   * app.assets.on("error", function (err, asset) {
   *     console.error(err);
   * });
   * app.assets.load(asset);
   */

  /**
   * Fired when an error occurs during asset loading.
   *
   * @event AssetRegistry#error:[id]
   * @param {Asset} asset - The asset that generated the error.
   * @example
   * const id = 123456;
   * const asset = app.assets.get(id);
   * app.assets.on("error:" + id, function (err, asset) {
   *     console.error(err);
   * });
   * app.assets.load(asset);
   */

  /**
   * Create a filtered list of assets from the registry.
   *
   * @param {object} filters - Properties to filter on, currently supports: 'preload: true|false'.
   * @returns {Asset[]} The filtered list of assets.
   */
  list(filters = {}) {
    const assets = Array.from(this._assets);
    if (filters.preload !== undefined) {
      return assets.filter(asset => asset.preload === filters.preload);
    }
    return assets;
  }

  /**
   * Add an asset to the registry.
   *
   * @param {Asset} asset - The asset to add.
   * @example
   * const asset = new pc.Asset("My Asset", "texture", {
   *     url: "../path/to/image.jpg"
   * });
   * app.assets.add(asset);
   */
  add(asset) {
    var _asset$file, _asset$file2;
    if (this._assets.has(asset)) return;
    this._assets.add(asset);
    this._idToAsset.set(asset.id, asset);
    if ((_asset$file = asset.file) != null && _asset$file.url) {
      this._urlToAsset.set(asset.file.url, asset);
    }
    if (!this._nameToAsset.has(asset.name)) this._nameToAsset.set(asset.name, new Set());
    this._nameToAsset.get(asset.name).add(asset);
    asset.on('name', this._onNameChange, this);
    asset.registry = this;

    // tags cache
    this._tags.addItem(asset);
    asset.tags.on('add', this._onTagAdd, this);
    asset.tags.on('remove', this._onTagRemove, this);
    this.fire('add', asset);
    this.fire('add:' + asset.id, asset);
    if ((_asset$file2 = asset.file) != null && _asset$file2.url) {
      this.fire('add:url:' + asset.file.url, asset);
    }
    if (asset.preload) this.load(asset);
  }

  /**
   * Remove an asset from the registry.
   *
   * @param {Asset} asset - The asset to remove.
   * @returns {boolean} True if the asset was successfully removed and false otherwise.
   * @example
   * const asset = app.assets.get(100);
   * app.assets.remove(asset);
   */
  remove(asset) {
    var _asset$file3, _asset$file4;
    if (!this._assets.has(asset)) return false;
    this._assets.delete(asset);
    this._idToAsset.delete(asset.id);
    if ((_asset$file3 = asset.file) != null && _asset$file3.url) {
      this._urlToAsset.delete(asset.file.url);
    }
    asset.off('name', this._onNameChange, this);
    if (this._nameToAsset.has(asset.name)) {
      const items = this._nameToAsset.get(asset.name);
      items.delete(asset);
      if (items.size === 0) {
        this._nameToAsset.delete(asset.name);
      }
    }

    // tags cache
    this._tags.removeItem(asset);
    asset.tags.off('add', this._onTagAdd, this);
    asset.tags.off('remove', this._onTagRemove, this);
    asset.fire('remove', asset);
    this.fire('remove', asset);
    this.fire('remove:' + asset.id, asset);
    if ((_asset$file4 = asset.file) != null && _asset$file4.url) {
      this.fire('remove:url:' + asset.file.url, asset);
    }
    return true;
  }

  /**
   * Retrieve an asset from the registry by its id field.
   *
   * @param {number} id - The id of the asset to get.
   * @returns {Asset|undefined} The asset.
   * @example
   * const asset = app.assets.get(100);
   */
  get(id) {
    // Since some apps incorrectly pass the id as a string, force a conversion to a number
    return this._idToAsset.get(Number(id));
  }

  /**
   * Retrieve an asset from the registry by its file's URL field.
   *
   * @param {string} url - The url of the asset to get.
   * @returns {Asset|undefined} The asset.
   * @example
   * const asset = app.assets.getByUrl("../path/to/image.jpg");
   */
  getByUrl(url) {
    return this._urlToAsset.get(url);
  }

  /**
   * Load the asset's file from a remote source. Listen for "load" events on the asset to find
   * out when it is loaded.
   *
   * @param {Asset} asset - The asset to load.
   * @example
   * // load some assets
   * const assetsToLoad = [
   *     app.assets.find("My Asset"),
   *     app.assets.find("Another Asset")
   * ];
   * let count = 0;
   * assetsToLoad.forEach(function (assetToLoad) {
   *     assetToLoad.ready(function (asset) {
   *         count++;
   *         if (count === assetsToLoad.length) {
   *             // done
   *         }
   *     });
   *     app.assets.load(assetToLoad);
   * });
   */
  load(asset) {
    // do nothing if asset is already loaded
    // note: lots of code calls assets.load() assuming this check is present
    // don't remove it without updating calls to assets.load() with checks for the asset.loaded state
    if (asset.loading || asset.loaded) {
      return;
    }
    const file = asset.file;

    // open has completed on the resource
    const _opened = resource => {
      if (resource instanceof Array) {
        asset.resources = resource;
      } else {
        asset.resource = resource;
      }

      // let handler patch the resource
      this._loader.patch(asset, this);
      this.fire('load', asset);
      this.fire('load:' + asset.id, asset);
      if (file && file.url) this.fire('load:url:' + file.url, asset);
      asset.fire('load', asset);
    };

    // load has completed on the resource
    const _loaded = (err, resource, extra) => {
      asset.loaded = true;
      asset.loading = false;
      if (err) {
        this.fire('error', err, asset);
        this.fire('error:' + asset.id, err, asset);
        asset.fire('error', err, asset);
      } else {
        if (!script.legacy && asset.type === 'script') {
          const handler = this._loader.getHandler('script');
          if (handler._cache[asset.id] && handler._cache[asset.id].parentNode === document.head) {
            // remove old element
            document.head.removeChild(handler._cache[asset.id]);
          }
          handler._cache[asset.id] = extra;
        }
        _opened(resource);
      }
    };
    if (file || asset.type === 'cubemap') {
      // start loading the resource
      this.fire('load:start', asset);
      this.fire('load:' + asset.id + ':start', asset);
      asset.loading = true;
      this._loader.load(asset.getFileUrl(), asset.type, _loaded, asset);
    } else {
      // asset has no file to load, open it directly
      const resource = this._loader.open(asset.type, asset.data);
      asset.loaded = true;
      _opened(resource);
    }
  }

  /**
   * Use this to load and create an asset if you don't have assets created. Usually you would
   * only use this if you are not integrated with the PlayCanvas Editor.
   *
   * @param {string} url - The url to load.
   * @param {string} type - The type of asset to load.
   * @param {LoadAssetCallback} callback - Function called when asset is loaded, passed (err,
   * asset), where err is null if no errors were encountered.
   * @example
   * app.assets.loadFromUrl("../path/to/texture.jpg", "texture", function (err, asset) {
   *     const texture = asset.resource;
   * });
   */
  loadFromUrl(url, type, callback) {
    this.loadFromUrlAndFilename(url, null, type, callback);
  }

  /**
   * Use this to load and create an asset when both the URL and filename are required. For
   * example, use this function when loading BLOB assets, where the URL does not adequately
   * identify the file.
   *
   * @param {string} url - The url to load.
   * @param {string} filename - The filename of the asset to load.
   * @param {string} type - The type of asset to load.
   * @param {LoadAssetCallback} callback - Function called when asset is loaded, passed (err,
   * asset), where err is null if no errors were encountered.
   * @example
   * const file = magicallyObtainAFile();
   * app.assets.loadFromUrlAndFilename(URL.createObjectURL(file), "texture.png", "texture", function (err, asset) {
   *     const texture = asset.resource;
   * });
   */
  loadFromUrlAndFilename(url, filename, type, callback) {
    const name = path.getBasename(filename || url);
    const file = {
      filename: filename || name,
      url: url
    };
    let asset = this.getByUrl(url);
    if (!asset) {
      asset = new Asset(name, type, file);
      this.add(asset);
    } else if (asset.loaded) {
      // asset is already loaded
      callback(asset.loadFromUrlError || null, asset);
      return;
    }
    const startLoad = asset => {
      asset.once('load', loadedAsset => {
        if (type === 'material') {
          this._loadTextures(loadedAsset, (err, textures) => {
            callback(err, loadedAsset);
          });
        } else {
          callback(null, loadedAsset);
        }
      });
      asset.once('error', err => {
        // store the error on the asset in case user requests this asset again
        if (err) {
          this.loadFromUrlError = err;
        }
        callback(err, asset);
      });
      this.load(asset);
    };
    if (asset.resource) {
      callback(null, asset);
    } else if (type === 'model') {
      this._loadModel(asset, startLoad);
    } else {
      startLoad(asset);
    }
  }

  // private method used for engine-only loading of model data
  _loadModel(modelAsset, continuation) {
    const url = modelAsset.getFileUrl();
    const ext = path.getExtension(url);
    if (ext === '.json' || ext === '.glb') {
      const dir = path.getDirectory(url);
      const basename = path.getBasename(url);

      // PlayCanvas model format supports material mapping file
      const mappingUrl = path.join(dir, basename.replace(ext, '.mapping.json'));
      this._loader.load(mappingUrl, 'json', (err, data) => {
        if (err) {
          modelAsset.data = {
            mapping: []
          };
          continuation(modelAsset);
        } else {
          this._loadMaterials(modelAsset, data, (e, materials) => {
            modelAsset.data = data;
            continuation(modelAsset);
          });
        }
      });
    } else {
      // other model format (e.g. obj)
      continuation(modelAsset);
    }
  }

  // private method used for engine-only loading of model materials
  _loadMaterials(modelAsset, mapping, callback) {
    const materials = [];
    let count = 0;
    const onMaterialLoaded = (err, materialAsset) => {
      // load dependent textures
      this._loadTextures(materialAsset, (err, textures) => {
        materials.push(materialAsset);
        if (materials.length === count) {
          callback(null, materials);
        }
      });
    };
    for (let i = 0; i < mapping.mapping.length; i++) {
      const path = mapping.mapping[i].path;
      if (path) {
        count++;
        const url = modelAsset.getAbsoluteUrl(path);
        this.loadFromUrl(url, 'material', onMaterialLoaded);
      }
    }
    if (count === 0) {
      callback(null, materials);
    }
  }

  // private method used for engine-only loading of the textures referenced by
  // the material asset
  _loadTextures(materialAsset, callback) {
    const textures = [];
    let count = 0;
    const data = materialAsset.data;
    if (data.mappingFormat !== 'path') {
      Debug.warn(`Skipping: ${materialAsset.name}, material files must be mappingFormat: "path" to be loaded from URL`);
      callback(null, textures);
      return;
    }
    const onTextureLoaded = (err, texture) => {
      if (err) console.error(err);
      textures.push(texture);
      if (textures.length === count) {
        callback(null, textures);
      }
    };
    const texParams = standardMaterialTextureParameters;
    for (let i = 0; i < texParams.length; i++) {
      const path = data[texParams[i]];
      if (path && typeof path === 'string') {
        count++;
        const url = materialAsset.getAbsoluteUrl(path);
        this.loadFromUrl(url, 'texture', onTextureLoaded);
      }
    }
    if (count === 0) {
      callback(null, textures);
    }
  }
  _onTagAdd(tag, asset) {
    this._tags.add(tag, asset);
  }
  _onTagRemove(tag, asset) {
    this._tags.remove(tag, asset);
  }
  _onNameChange(asset, name, nameOld) {
    // remove
    if (this._nameToAsset.has(nameOld)) {
      const items = this._nameToAsset.get(nameOld);
      items.delete(asset);
      if (items.size === 0) {
        this._nameToAsset.delete(nameOld);
      }
    }

    // add
    if (!this._nameToAsset.has(asset.name)) this._nameToAsset.set(asset.name, new Set());
    this._nameToAsset.get(asset.name).add(asset);
  }

  /**
   * Return all Assets that satisfy the search query. Query can be simply a string, or comma
   * separated strings, to have inclusive results of assets that match at least one query. A
   * query that consists of an array of tags can be used to match assets that have each tag of
   * array.
   *
   * @param {...*} query - Name of a tag or array of tags.
   * @returns {Asset[]} A list of all Assets matched query.
   * @example
   * const assets = app.assets.findByTag("level-1");
   * // returns all assets that tagged by `level-1`
   * @example
   * const assets = app.assets.findByTag("level-1", "level-2");
   * // returns all assets that tagged by `level-1` OR `level-2`
   * @example
   * const assets = app.assets.findByTag(["level-1", "monster"]);
   * // returns all assets that tagged by `level-1` AND `monster`
   * @example
   * const assets = app.assets.findByTag(["level-1", "monster"], ["level-2", "monster"]);
   * // returns all assets that tagged by (`level-1` AND `monster`) OR (`level-2` AND `monster`)
   */
  findByTag() {
    return this._tags.find(arguments);
  }

  /**
   * Return all Assets that satisfy a filter callback.
   *
   * @param {FilterAssetCallback} callback - The callback function that is used to filter assets.
   * Return `true` to include an asset in the returned array.
   * @returns {Asset[]} A list of all Assets found.
   * @example
   * const assets = app.assets.filter(asset => asset.name.includes('monster'));
   * console.log(`Found ${assets.length} assets with a name containing 'monster'`);
   */
  filter(callback) {
    return Array.from(this._assets).filter(asset => callback(asset));
  }

  /**
   * Return the first Asset with the specified name and type found in the registry.
   *
   * @param {string} name - The name of the Asset to find.
   * @param {string} [type] - The type of the Asset to find.
   * @returns {Asset|null} A single Asset or null if no Asset is found.
   * @example
   * const asset = app.assets.find("myTextureAsset", "texture");
   */
  find(name, type) {
    const items = this._nameToAsset.get(name);
    if (!items) return null;
    for (const asset of items) {
      if (!type || asset.type === type) {
        return asset;
      }
    }
    return null;
  }

  /**
   * Return all Assets with the specified name and type found in the registry.
   *
   * @param {string} name - The name of the Assets to find.
   * @param {string} [type] - The type of the Assets to find.
   * @returns {Asset[]} A list of all Assets found.
   * @example
   * const assets = app.assets.findAll('brick', 'texture');
   * console.log(`Found ${assets.length} texture assets named 'brick'`);
   */
  findAll(name, type) {
    const items = this._nameToAsset.get(name);
    if (!items) return [];
    const results = Array.from(items);
    if (!type) return results;
    return results.filter(asset => asset.type === type);
  }
}

export { AssetRegistry };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXNzZXQtcmVnaXN0cnkuanMiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9mcmFtZXdvcmsvYXNzZXQvYXNzZXQtcmVnaXN0cnkuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgcGF0aCB9IGZyb20gJy4uLy4uL2NvcmUvcGF0aC5qcyc7XG5pbXBvcnQgeyBEZWJ1ZyB9IGZyb20gJy4uLy4uL2NvcmUvZGVidWcuanMnO1xuaW1wb3J0IHsgRXZlbnRIYW5kbGVyIH0gZnJvbSAnLi4vLi4vY29yZS9ldmVudC1oYW5kbGVyLmpzJztcbmltcG9ydCB7IFRhZ3NDYWNoZSB9IGZyb20gJy4uLy4uL2NvcmUvdGFncy1jYWNoZS5qcyc7XG5cbmltcG9ydCB7IHN0YW5kYXJkTWF0ZXJpYWxUZXh0dXJlUGFyYW1ldGVycyB9IGZyb20gJy4uLy4uL3NjZW5lL21hdGVyaWFscy9zdGFuZGFyZC1tYXRlcmlhbC1wYXJhbWV0ZXJzLmpzJztcblxuaW1wb3J0IHsgc2NyaXB0IH0gZnJvbSAnLi4vc2NyaXB0LmpzJztcblxuaW1wb3J0IHsgQXNzZXQgfSBmcm9tICcuL2Fzc2V0LmpzJztcblxuLyoqXG4gKiBDYWxsYmFjayB1c2VkIGJ5IHtAbGluayBBc3NldFJlZ2lzdHJ5I2ZpbHRlcn0gdG8gZmlsdGVyIGFzc2V0cy5cbiAqXG4gKiBAY2FsbGJhY2sgRmlsdGVyQXNzZXRDYWxsYmFja1xuICogQHBhcmFtIHtBc3NldH0gYXNzZXQgLSBUaGUgY3VycmVudCBhc3NldCB0byBmaWx0ZXIuXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJuIGB0cnVlYCB0byBpbmNsdWRlIGFzc2V0IHRvIHJlc3VsdCBsaXN0LlxuICovXG5cbi8qKlxuICogQ2FsbGJhY2sgdXNlZCBieSB7QGxpbmsgQXNzZXRSZWdpc3RyeSNsb2FkRnJvbVVybH0gYW5kIGNhbGxlZCB3aGVuIGFuIGFzc2V0IGlzIGxvYWRlZCAob3IgYW5cbiAqIGVycm9yIG9jY3VycykuXG4gKlxuICogQGNhbGxiYWNrIExvYWRBc3NldENhbGxiYWNrXG4gKiBAcGFyYW0ge3N0cmluZ3xudWxsfSBlcnIgLSBUaGUgZXJyb3IgbWVzc2FnZSBpcyBudWxsIGlmIG5vIGVycm9ycyB3ZXJlIGVuY291bnRlcmVkLlxuICogQHBhcmFtIHtBc3NldH0gW2Fzc2V0XSAtIFRoZSBsb2FkZWQgYXNzZXQgaWYgbm8gZXJyb3JzIHdlcmUgZW5jb3VudGVyZWQuXG4gKi9cblxuLyoqXG4gKiBDb250YWluZXIgZm9yIGFsbCBhc3NldHMgdGhhdCBhcmUgYXZhaWxhYmxlIHRvIHRoaXMgYXBwbGljYXRpb24uIE5vdGUgdGhhdCBQbGF5Q2FudmFzIHNjcmlwdHNcbiAqIGFyZSBwcm92aWRlZCB3aXRoIGFuIEFzc2V0UmVnaXN0cnkgaW5zdGFuY2UgYXMgYGFwcC5hc3NldHNgLlxuICpcbiAqIEBhdWdtZW50cyBFdmVudEhhbmRsZXJcbiAqL1xuY2xhc3MgQXNzZXRSZWdpc3RyeSBleHRlbmRzIEV2ZW50SGFuZGxlciB7XG4gICAgLyoqXG4gICAgICogQHR5cGUge1NldDxBc3NldD59XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfYXNzZXRzID0gbmV3IFNldCgpO1xuXG4gICAgLyoqXG4gICAgICogQHR5cGUge01hcDxudW1iZXIsIEFzc2V0Pn1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9pZFRvQXNzZXQgPSBuZXcgTWFwKCk7XG5cbiAgICAvKipcbiAgICAgKiBAdHlwZSB7TWFwPHN0cmluZywgQXNzZXQ+fVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX3VybFRvQXNzZXQgPSBuZXcgTWFwKCk7XG5cbiAgICAvKipcbiAgICAgKiBAdHlwZSB7TWFwPHN0cmluZywgU2V0PEFzc2V0Pj59XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfbmFtZVRvQXNzZXQgPSBuZXcgTWFwKCk7XG5cbiAgICAvKipcbiAgICAgKiBJbmRleCBmb3IgbG9va2luZyB1cCBieSB0YWdzLlxuICAgICAqXG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfdGFncyA9IG5ldyBUYWdzQ2FjaGUoJ19pZCcpO1xuXG4gICAgLyoqXG4gICAgICogQSBVUkwgcHJlZml4IHRoYXQgd2lsbCBiZSBhZGRlZCB0byBhbGwgYXNzZXQgbG9hZGluZyByZXF1ZXN0cy5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtzdHJpbmd8bnVsbH1cbiAgICAgKi9cbiAgICBwcmVmaXggPSBudWxsO1xuXG4gICAgLyoqXG4gICAgICogQ3JlYXRlIGFuIGluc3RhbmNlIG9mIGFuIEFzc2V0UmVnaXN0cnkuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi4vaGFuZGxlcnMvbG9hZGVyLmpzJykuUmVzb3VyY2VMb2FkZXJ9IGxvYWRlciAtIFRoZSBSZXNvdXJjZUxvYWRlciB1c2VkIHRvXG4gICAgICogbG9hZCB0aGUgYXNzZXQgZmlsZXMuXG4gICAgICovXG4gICAgY29uc3RydWN0b3IobG9hZGVyKSB7XG4gICAgICAgIHN1cGVyKCk7XG5cbiAgICAgICAgdGhpcy5fbG9hZGVyID0gbG9hZGVyO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEZpcmVkIHdoZW4gYW4gYXNzZXQgY29tcGxldGVzIGxvYWRpbmcuXG4gICAgICpcbiAgICAgKiBAZXZlbnQgQXNzZXRSZWdpc3RyeSNsb2FkXG4gICAgICogQHBhcmFtIHtBc3NldH0gYXNzZXQgLSBUaGUgYXNzZXQgdGhhdCBoYXMganVzdCBsb2FkZWQuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBhcHAuYXNzZXRzLm9uKFwibG9hZFwiLCBmdW5jdGlvbiAoYXNzZXQpIHtcbiAgICAgKiAgICAgY29uc29sZS5sb2coXCJhc3NldCBsb2FkZWQ6IFwiICsgYXNzZXQubmFtZSk7XG4gICAgICogfSk7XG4gICAgICovXG5cbiAgICAvKipcbiAgICAgKiBGaXJlZCB3aGVuIGFuIGFzc2V0IGNvbXBsZXRlcyBsb2FkaW5nLlxuICAgICAqXG4gICAgICogQGV2ZW50IEFzc2V0UmVnaXN0cnkjbG9hZDpbaWRdXG4gICAgICogQHBhcmFtIHtBc3NldH0gYXNzZXQgLSBUaGUgYXNzZXQgdGhhdCBoYXMganVzdCBsb2FkZWQuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBjb25zdCBpZCA9IDEyMzQ1NjtcbiAgICAgKiBjb25zdCBhc3NldCA9IGFwcC5hc3NldHMuZ2V0KGlkKTtcbiAgICAgKiBhcHAuYXNzZXRzLm9uKFwibG9hZDpcIiArIGlkLCBmdW5jdGlvbiAoYXNzZXQpIHtcbiAgICAgKiAgICAgY29uc29sZS5sb2coXCJhc3NldCBsb2FkZWQ6IFwiICsgYXNzZXQubmFtZSk7XG4gICAgICogfSk7XG4gICAgICogYXBwLmFzc2V0cy5sb2FkKGFzc2V0KTtcbiAgICAgKi9cblxuICAgIC8qKlxuICAgICAqIEZpcmVkIHdoZW4gYW4gYXNzZXQgY29tcGxldGVzIGxvYWRpbmcuXG4gICAgICpcbiAgICAgKiBAZXZlbnQgQXNzZXRSZWdpc3RyeSNsb2FkOnVybDpbdXJsXVxuICAgICAqIEBwYXJhbSB7QXNzZXR9IGFzc2V0IC0gVGhlIGFzc2V0IHRoYXQgaGFzIGp1c3QgbG9hZGVkLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogY29uc3QgaWQgPSAxMjM0NTY7XG4gICAgICogY29uc3QgYXNzZXQgPSBhcHAuYXNzZXRzLmdldChpZCk7XG4gICAgICogYXBwLmFzc2V0cy5vbihcImxvYWQ6dXJsOlwiICsgYXNzZXQuZmlsZS51cmwsIGZ1bmN0aW9uIChhc3NldCkge1xuICAgICAqICAgICBjb25zb2xlLmxvZyhcImFzc2V0IGxvYWRlZDogXCIgKyBhc3NldC5uYW1lKTtcbiAgICAgKiB9KTtcbiAgICAgKiBhcHAuYXNzZXRzLmxvYWQoYXNzZXQpO1xuICAgICAqL1xuXG4gICAgLyoqXG4gICAgICogRmlyZWQgd2hlbiBhbiBhc3NldCBpcyBhZGRlZCB0byB0aGUgcmVnaXN0cnkuXG4gICAgICpcbiAgICAgKiBAZXZlbnQgQXNzZXRSZWdpc3RyeSNhZGRcbiAgICAgKiBAcGFyYW0ge0Fzc2V0fSBhc3NldCAtIFRoZSBhc3NldCB0aGF0IHdhcyBhZGRlZC5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGFwcC5hc3NldHMub24oXCJhZGRcIiwgZnVuY3Rpb24gKGFzc2V0KSB7XG4gICAgICogICAgIGNvbnNvbGUubG9nKFwiTmV3IGFzc2V0IGFkZGVkOiBcIiArIGFzc2V0Lm5hbWUpO1xuICAgICAqIH0pO1xuICAgICAqL1xuXG4gICAgLyoqXG4gICAgICogRmlyZWQgd2hlbiBhbiBhc3NldCBpcyBhZGRlZCB0byB0aGUgcmVnaXN0cnkuXG4gICAgICpcbiAgICAgKiBAZXZlbnQgQXNzZXRSZWdpc3RyeSNhZGQ6W2lkXVxuICAgICAqIEBwYXJhbSB7QXNzZXR9IGFzc2V0IC0gVGhlIGFzc2V0IHRoYXQgd2FzIGFkZGVkLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogY29uc3QgaWQgPSAxMjM0NTY7XG4gICAgICogYXBwLmFzc2V0cy5vbihcImFkZDpcIiArIGlkLCBmdW5jdGlvbiAoYXNzZXQpIHtcbiAgICAgKiAgICAgY29uc29sZS5sb2coXCJBc3NldCAxMjM0NTYgbG9hZGVkXCIpO1xuICAgICAqIH0pO1xuICAgICAqL1xuXG4gICAgLyoqXG4gICAgICogRmlyZWQgd2hlbiBhbiBhc3NldCBpcyBhZGRlZCB0byB0aGUgcmVnaXN0cnkuXG4gICAgICpcbiAgICAgKiBAZXZlbnQgQXNzZXRSZWdpc3RyeSNhZGQ6dXJsOlt1cmxdXG4gICAgICogQHBhcmFtIHtBc3NldH0gYXNzZXQgLSBUaGUgYXNzZXQgdGhhdCB3YXMgYWRkZWQuXG4gICAgICovXG5cbiAgICAvKipcbiAgICAgKiBGaXJlZCB3aGVuIGFuIGFzc2V0IGlzIHJlbW92ZWQgZnJvbSB0aGUgcmVnaXN0cnkuXG4gICAgICpcbiAgICAgKiBAZXZlbnQgQXNzZXRSZWdpc3RyeSNyZW1vdmVcbiAgICAgKiBAcGFyYW0ge0Fzc2V0fSBhc3NldCAtIFRoZSBhc3NldCB0aGF0IHdhcyByZW1vdmVkLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogYXBwLmFzc2V0cy5vbihcInJlbW92ZVwiLCBmdW5jdGlvbiAoYXNzZXQpIHtcbiAgICAgKiAgICAgY29uc29sZS5sb2coXCJBc3NldCByZW1vdmVkOiBcIiArIGFzc2V0Lm5hbWUpO1xuICAgICAqIH0pO1xuICAgICAqL1xuXG4gICAgLyoqXG4gICAgICogRmlyZWQgd2hlbiBhbiBhc3NldCBpcyByZW1vdmVkIGZyb20gdGhlIHJlZ2lzdHJ5LlxuICAgICAqXG4gICAgICogQGV2ZW50IEFzc2V0UmVnaXN0cnkjcmVtb3ZlOltpZF1cbiAgICAgKiBAcGFyYW0ge0Fzc2V0fSBhc3NldCAtIFRoZSBhc3NldCB0aGF0IHdhcyByZW1vdmVkLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogY29uc3QgaWQgPSAxMjM0NTY7XG4gICAgICogYXBwLmFzc2V0cy5vbihcInJlbW92ZTpcIiArIGlkLCBmdW5jdGlvbiAoYXNzZXQpIHtcbiAgICAgKiAgICAgY29uc29sZS5sb2coXCJBc3NldCByZW1vdmVkOiBcIiArIGFzc2V0Lm5hbWUpO1xuICAgICAqIH0pO1xuICAgICAqL1xuXG4gICAgLyoqXG4gICAgICogRmlyZWQgd2hlbiBhbiBhc3NldCBpcyByZW1vdmVkIGZyb20gdGhlIHJlZ2lzdHJ5LlxuICAgICAqXG4gICAgICogQGV2ZW50IEFzc2V0UmVnaXN0cnkjcmVtb3ZlOnVybDpbdXJsXVxuICAgICAqIEBwYXJhbSB7QXNzZXR9IGFzc2V0IC0gVGhlIGFzc2V0IHRoYXQgd2FzIHJlbW92ZWQuXG4gICAgICovXG5cbiAgICAvKipcbiAgICAgKiBGaXJlZCB3aGVuIGFuIGVycm9yIG9jY3VycyBkdXJpbmcgYXNzZXQgbG9hZGluZy5cbiAgICAgKlxuICAgICAqIEBldmVudCBBc3NldFJlZ2lzdHJ5I2Vycm9yXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IGVyciAtIFRoZSBlcnJvciBtZXNzYWdlLlxuICAgICAqIEBwYXJhbSB7QXNzZXR9IGFzc2V0IC0gVGhlIGFzc2V0IHRoYXQgZ2VuZXJhdGVkIHRoZSBlcnJvci5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGNvbnN0IGlkID0gMTIzNDU2O1xuICAgICAqIGNvbnN0IGFzc2V0ID0gYXBwLmFzc2V0cy5nZXQoaWQpO1xuICAgICAqIGFwcC5hc3NldHMub24oXCJlcnJvclwiLCBmdW5jdGlvbiAoZXJyLCBhc3NldCkge1xuICAgICAqICAgICBjb25zb2xlLmVycm9yKGVycik7XG4gICAgICogfSk7XG4gICAgICogYXBwLmFzc2V0cy5sb2FkKGFzc2V0KTtcbiAgICAgKi9cblxuICAgIC8qKlxuICAgICAqIEZpcmVkIHdoZW4gYW4gZXJyb3Igb2NjdXJzIGR1cmluZyBhc3NldCBsb2FkaW5nLlxuICAgICAqXG4gICAgICogQGV2ZW50IEFzc2V0UmVnaXN0cnkjZXJyb3I6W2lkXVxuICAgICAqIEBwYXJhbSB7QXNzZXR9IGFzc2V0IC0gVGhlIGFzc2V0IHRoYXQgZ2VuZXJhdGVkIHRoZSBlcnJvci5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGNvbnN0IGlkID0gMTIzNDU2O1xuICAgICAqIGNvbnN0IGFzc2V0ID0gYXBwLmFzc2V0cy5nZXQoaWQpO1xuICAgICAqIGFwcC5hc3NldHMub24oXCJlcnJvcjpcIiArIGlkLCBmdW5jdGlvbiAoZXJyLCBhc3NldCkge1xuICAgICAqICAgICBjb25zb2xlLmVycm9yKGVycik7XG4gICAgICogfSk7XG4gICAgICogYXBwLmFzc2V0cy5sb2FkKGFzc2V0KTtcbiAgICAgKi9cblxuICAgIC8qKlxuICAgICAqIENyZWF0ZSBhIGZpbHRlcmVkIGxpc3Qgb2YgYXNzZXRzIGZyb20gdGhlIHJlZ2lzdHJ5LlxuICAgICAqXG4gICAgICogQHBhcmFtIHtvYmplY3R9IGZpbHRlcnMgLSBQcm9wZXJ0aWVzIHRvIGZpbHRlciBvbiwgY3VycmVudGx5IHN1cHBvcnRzOiAncHJlbG9hZDogdHJ1ZXxmYWxzZScuXG4gICAgICogQHJldHVybnMge0Fzc2V0W119IFRoZSBmaWx0ZXJlZCBsaXN0IG9mIGFzc2V0cy5cbiAgICAgKi9cbiAgICBsaXN0KGZpbHRlcnMgPSB7fSkge1xuICAgICAgICBjb25zdCBhc3NldHMgPSBBcnJheS5mcm9tKHRoaXMuX2Fzc2V0cyk7XG4gICAgICAgIGlmIChmaWx0ZXJzLnByZWxvYWQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgcmV0dXJuIGFzc2V0cy5maWx0ZXIoYXNzZXQgPT4gYXNzZXQucHJlbG9hZCA9PT0gZmlsdGVycy5wcmVsb2FkKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYXNzZXRzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEFkZCBhbiBhc3NldCB0byB0aGUgcmVnaXN0cnkuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge0Fzc2V0fSBhc3NldCAtIFRoZSBhc3NldCB0byBhZGQuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBjb25zdCBhc3NldCA9IG5ldyBwYy5Bc3NldChcIk15IEFzc2V0XCIsIFwidGV4dHVyZVwiLCB7XG4gICAgICogICAgIHVybDogXCIuLi9wYXRoL3RvL2ltYWdlLmpwZ1wiXG4gICAgICogfSk7XG4gICAgICogYXBwLmFzc2V0cy5hZGQoYXNzZXQpO1xuICAgICAqL1xuICAgIGFkZChhc3NldCkge1xuICAgICAgICBpZiAodGhpcy5fYXNzZXRzLmhhcyhhc3NldCkpIHJldHVybjtcblxuICAgICAgICB0aGlzLl9hc3NldHMuYWRkKGFzc2V0KTtcblxuICAgICAgICB0aGlzLl9pZFRvQXNzZXQuc2V0KGFzc2V0LmlkLCBhc3NldCk7XG5cbiAgICAgICAgaWYgKGFzc2V0LmZpbGU/LnVybCkge1xuICAgICAgICAgICAgdGhpcy5fdXJsVG9Bc3NldC5zZXQoYXNzZXQuZmlsZS51cmwsIGFzc2V0KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghdGhpcy5fbmFtZVRvQXNzZXQuaGFzKGFzc2V0Lm5hbWUpKVxuICAgICAgICAgICAgdGhpcy5fbmFtZVRvQXNzZXQuc2V0KGFzc2V0Lm5hbWUsIG5ldyBTZXQoKSk7XG5cbiAgICAgICAgdGhpcy5fbmFtZVRvQXNzZXQuZ2V0KGFzc2V0Lm5hbWUpLmFkZChhc3NldCk7XG5cbiAgICAgICAgYXNzZXQub24oJ25hbWUnLCB0aGlzLl9vbk5hbWVDaGFuZ2UsIHRoaXMpO1xuXG4gICAgICAgIGFzc2V0LnJlZ2lzdHJ5ID0gdGhpcztcblxuICAgICAgICAvLyB0YWdzIGNhY2hlXG4gICAgICAgIHRoaXMuX3RhZ3MuYWRkSXRlbShhc3NldCk7XG4gICAgICAgIGFzc2V0LnRhZ3Mub24oJ2FkZCcsIHRoaXMuX29uVGFnQWRkLCB0aGlzKTtcbiAgICAgICAgYXNzZXQudGFncy5vbigncmVtb3ZlJywgdGhpcy5fb25UYWdSZW1vdmUsIHRoaXMpO1xuXG4gICAgICAgIHRoaXMuZmlyZSgnYWRkJywgYXNzZXQpO1xuICAgICAgICB0aGlzLmZpcmUoJ2FkZDonICsgYXNzZXQuaWQsIGFzc2V0KTtcbiAgICAgICAgaWYgKGFzc2V0LmZpbGU/LnVybCkge1xuICAgICAgICAgICAgdGhpcy5maXJlKCdhZGQ6dXJsOicgKyBhc3NldC5maWxlLnVybCwgYXNzZXQpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGFzc2V0LnByZWxvYWQpXG4gICAgICAgICAgICB0aGlzLmxvYWQoYXNzZXQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJlbW92ZSBhbiBhc3NldCBmcm9tIHRoZSByZWdpc3RyeS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7QXNzZXR9IGFzc2V0IC0gVGhlIGFzc2V0IHRvIHJlbW92ZS5cbiAgICAgKiBAcmV0dXJucyB7Ym9vbGVhbn0gVHJ1ZSBpZiB0aGUgYXNzZXQgd2FzIHN1Y2Nlc3NmdWxseSByZW1vdmVkIGFuZCBmYWxzZSBvdGhlcndpc2UuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBjb25zdCBhc3NldCA9IGFwcC5hc3NldHMuZ2V0KDEwMCk7XG4gICAgICogYXBwLmFzc2V0cy5yZW1vdmUoYXNzZXQpO1xuICAgICAqL1xuICAgIHJlbW92ZShhc3NldCkge1xuICAgICAgICBpZiAoIXRoaXMuX2Fzc2V0cy5oYXMoYXNzZXQpKSByZXR1cm4gZmFsc2U7XG5cbiAgICAgICAgdGhpcy5fYXNzZXRzLmRlbGV0ZShhc3NldCk7XG5cbiAgICAgICAgdGhpcy5faWRUb0Fzc2V0LmRlbGV0ZShhc3NldC5pZCk7XG5cbiAgICAgICAgaWYgKGFzc2V0LmZpbGU/LnVybCkge1xuICAgICAgICAgICAgdGhpcy5fdXJsVG9Bc3NldC5kZWxldGUoYXNzZXQuZmlsZS51cmwpO1xuICAgICAgICB9XG5cbiAgICAgICAgYXNzZXQub2ZmKCduYW1lJywgdGhpcy5fb25OYW1lQ2hhbmdlLCB0aGlzKTtcblxuICAgICAgICBpZiAodGhpcy5fbmFtZVRvQXNzZXQuaGFzKGFzc2V0Lm5hbWUpKSB7XG4gICAgICAgICAgICBjb25zdCBpdGVtcyA9IHRoaXMuX25hbWVUb0Fzc2V0LmdldChhc3NldC5uYW1lKTtcbiAgICAgICAgICAgIGl0ZW1zLmRlbGV0ZShhc3NldCk7XG4gICAgICAgICAgICBpZiAoaXRlbXMuc2l6ZSA9PT0gMCkge1xuICAgICAgICAgICAgICAgIHRoaXMuX25hbWVUb0Fzc2V0LmRlbGV0ZShhc3NldC5uYW1lKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHRhZ3MgY2FjaGVcbiAgICAgICAgdGhpcy5fdGFncy5yZW1vdmVJdGVtKGFzc2V0KTtcbiAgICAgICAgYXNzZXQudGFncy5vZmYoJ2FkZCcsIHRoaXMuX29uVGFnQWRkLCB0aGlzKTtcbiAgICAgICAgYXNzZXQudGFncy5vZmYoJ3JlbW92ZScsIHRoaXMuX29uVGFnUmVtb3ZlLCB0aGlzKTtcblxuICAgICAgICBhc3NldC5maXJlKCdyZW1vdmUnLCBhc3NldCk7XG4gICAgICAgIHRoaXMuZmlyZSgncmVtb3ZlJywgYXNzZXQpO1xuICAgICAgICB0aGlzLmZpcmUoJ3JlbW92ZTonICsgYXNzZXQuaWQsIGFzc2V0KTtcbiAgICAgICAgaWYgKGFzc2V0LmZpbGU/LnVybCkge1xuICAgICAgICAgICAgdGhpcy5maXJlKCdyZW1vdmU6dXJsOicgKyBhc3NldC5maWxlLnVybCwgYXNzZXQpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0cmlldmUgYW4gYXNzZXQgZnJvbSB0aGUgcmVnaXN0cnkgYnkgaXRzIGlkIGZpZWxkLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGlkIC0gVGhlIGlkIG9mIHRoZSBhc3NldCB0byBnZXQuXG4gICAgICogQHJldHVybnMge0Fzc2V0fHVuZGVmaW5lZH0gVGhlIGFzc2V0LlxuICAgICAqIEBleGFtcGxlXG4gICAgICogY29uc3QgYXNzZXQgPSBhcHAuYXNzZXRzLmdldCgxMDApO1xuICAgICAqL1xuICAgIGdldChpZCkge1xuICAgICAgICAvLyBTaW5jZSBzb21lIGFwcHMgaW5jb3JyZWN0bHkgcGFzcyB0aGUgaWQgYXMgYSBzdHJpbmcsIGZvcmNlIGEgY29udmVyc2lvbiB0byBhIG51bWJlclxuICAgICAgICByZXR1cm4gdGhpcy5faWRUb0Fzc2V0LmdldChOdW1iZXIoaWQpKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXRyaWV2ZSBhbiBhc3NldCBmcm9tIHRoZSByZWdpc3RyeSBieSBpdHMgZmlsZSdzIFVSTCBmaWVsZC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSB1cmwgLSBUaGUgdXJsIG9mIHRoZSBhc3NldCB0byBnZXQuXG4gICAgICogQHJldHVybnMge0Fzc2V0fHVuZGVmaW5lZH0gVGhlIGFzc2V0LlxuICAgICAqIEBleGFtcGxlXG4gICAgICogY29uc3QgYXNzZXQgPSBhcHAuYXNzZXRzLmdldEJ5VXJsKFwiLi4vcGF0aC90by9pbWFnZS5qcGdcIik7XG4gICAgICovXG4gICAgZ2V0QnlVcmwodXJsKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl91cmxUb0Fzc2V0LmdldCh1cmwpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIExvYWQgdGhlIGFzc2V0J3MgZmlsZSBmcm9tIGEgcmVtb3RlIHNvdXJjZS4gTGlzdGVuIGZvciBcImxvYWRcIiBldmVudHMgb24gdGhlIGFzc2V0IHRvIGZpbmRcbiAgICAgKiBvdXQgd2hlbiBpdCBpcyBsb2FkZWQuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge0Fzc2V0fSBhc3NldCAtIFRoZSBhc3NldCB0byBsb2FkLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogLy8gbG9hZCBzb21lIGFzc2V0c1xuICAgICAqIGNvbnN0IGFzc2V0c1RvTG9hZCA9IFtcbiAgICAgKiAgICAgYXBwLmFzc2V0cy5maW5kKFwiTXkgQXNzZXRcIiksXG4gICAgICogICAgIGFwcC5hc3NldHMuZmluZChcIkFub3RoZXIgQXNzZXRcIilcbiAgICAgKiBdO1xuICAgICAqIGxldCBjb3VudCA9IDA7XG4gICAgICogYXNzZXRzVG9Mb2FkLmZvckVhY2goZnVuY3Rpb24gKGFzc2V0VG9Mb2FkKSB7XG4gICAgICogICAgIGFzc2V0VG9Mb2FkLnJlYWR5KGZ1bmN0aW9uIChhc3NldCkge1xuICAgICAqICAgICAgICAgY291bnQrKztcbiAgICAgKiAgICAgICAgIGlmIChjb3VudCA9PT0gYXNzZXRzVG9Mb2FkLmxlbmd0aCkge1xuICAgICAqICAgICAgICAgICAgIC8vIGRvbmVcbiAgICAgKiAgICAgICAgIH1cbiAgICAgKiAgICAgfSk7XG4gICAgICogICAgIGFwcC5hc3NldHMubG9hZChhc3NldFRvTG9hZCk7XG4gICAgICogfSk7XG4gICAgICovXG4gICAgbG9hZChhc3NldCkge1xuICAgICAgICAvLyBkbyBub3RoaW5nIGlmIGFzc2V0IGlzIGFscmVhZHkgbG9hZGVkXG4gICAgICAgIC8vIG5vdGU6IGxvdHMgb2YgY29kZSBjYWxscyBhc3NldHMubG9hZCgpIGFzc3VtaW5nIHRoaXMgY2hlY2sgaXMgcHJlc2VudFxuICAgICAgICAvLyBkb24ndCByZW1vdmUgaXQgd2l0aG91dCB1cGRhdGluZyBjYWxscyB0byBhc3NldHMubG9hZCgpIHdpdGggY2hlY2tzIGZvciB0aGUgYXNzZXQubG9hZGVkIHN0YXRlXG4gICAgICAgIGlmIChhc3NldC5sb2FkaW5nIHx8IGFzc2V0LmxvYWRlZCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgZmlsZSA9IGFzc2V0LmZpbGU7XG5cbiAgICAgICAgLy8gb3BlbiBoYXMgY29tcGxldGVkIG9uIHRoZSByZXNvdXJjZVxuICAgICAgICBjb25zdCBfb3BlbmVkID0gKHJlc291cmNlKSA9PiB7XG4gICAgICAgICAgICBpZiAocmVzb3VyY2UgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgICAgICAgICAgIGFzc2V0LnJlc291cmNlcyA9IHJlc291cmNlO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBhc3NldC5yZXNvdXJjZSA9IHJlc291cmNlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBsZXQgaGFuZGxlciBwYXRjaCB0aGUgcmVzb3VyY2VcbiAgICAgICAgICAgIHRoaXMuX2xvYWRlci5wYXRjaChhc3NldCwgdGhpcyk7XG5cbiAgICAgICAgICAgIHRoaXMuZmlyZSgnbG9hZCcsIGFzc2V0KTtcbiAgICAgICAgICAgIHRoaXMuZmlyZSgnbG9hZDonICsgYXNzZXQuaWQsIGFzc2V0KTtcbiAgICAgICAgICAgIGlmIChmaWxlICYmIGZpbGUudXJsKVxuICAgICAgICAgICAgICAgIHRoaXMuZmlyZSgnbG9hZDp1cmw6JyArIGZpbGUudXJsLCBhc3NldCk7XG4gICAgICAgICAgICBhc3NldC5maXJlKCdsb2FkJywgYXNzZXQpO1xuICAgICAgICB9O1xuXG4gICAgICAgIC8vIGxvYWQgaGFzIGNvbXBsZXRlZCBvbiB0aGUgcmVzb3VyY2VcbiAgICAgICAgY29uc3QgX2xvYWRlZCA9IChlcnIsIHJlc291cmNlLCBleHRyYSkgPT4ge1xuICAgICAgICAgICAgYXNzZXQubG9hZGVkID0gdHJ1ZTtcbiAgICAgICAgICAgIGFzc2V0LmxvYWRpbmcgPSBmYWxzZTtcblxuICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICAgIHRoaXMuZmlyZSgnZXJyb3InLCBlcnIsIGFzc2V0KTtcbiAgICAgICAgICAgICAgICB0aGlzLmZpcmUoJ2Vycm9yOicgKyBhc3NldC5pZCwgZXJyLCBhc3NldCk7XG4gICAgICAgICAgICAgICAgYXNzZXQuZmlyZSgnZXJyb3InLCBlcnIsIGFzc2V0KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgaWYgKCFzY3JpcHQubGVnYWN5ICYmIGFzc2V0LnR5cGUgPT09ICdzY3JpcHQnKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGhhbmRsZXIgPSB0aGlzLl9sb2FkZXIuZ2V0SGFuZGxlcignc2NyaXB0Jyk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChoYW5kbGVyLl9jYWNoZVthc3NldC5pZF0gJiYgaGFuZGxlci5fY2FjaGVbYXNzZXQuaWRdLnBhcmVudE5vZGUgPT09IGRvY3VtZW50LmhlYWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHJlbW92ZSBvbGQgZWxlbWVudFxuICAgICAgICAgICAgICAgICAgICAgICAgZG9jdW1lbnQuaGVhZC5yZW1vdmVDaGlsZChoYW5kbGVyLl9jYWNoZVthc3NldC5pZF0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGhhbmRsZXIuX2NhY2hlW2Fzc2V0LmlkXSA9IGV4dHJhO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIF9vcGVuZWQocmVzb3VyY2UpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIGlmIChmaWxlIHx8IGFzc2V0LnR5cGUgPT09ICdjdWJlbWFwJykge1xuICAgICAgICAgICAgLy8gc3RhcnQgbG9hZGluZyB0aGUgcmVzb3VyY2VcbiAgICAgICAgICAgIHRoaXMuZmlyZSgnbG9hZDpzdGFydCcsIGFzc2V0KTtcbiAgICAgICAgICAgIHRoaXMuZmlyZSgnbG9hZDonICsgYXNzZXQuaWQgKyAnOnN0YXJ0JywgYXNzZXQpO1xuXG4gICAgICAgICAgICBhc3NldC5sb2FkaW5nID0gdHJ1ZTtcbiAgICAgICAgICAgIHRoaXMuX2xvYWRlci5sb2FkKGFzc2V0LmdldEZpbGVVcmwoKSwgYXNzZXQudHlwZSwgX2xvYWRlZCwgYXNzZXQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gYXNzZXQgaGFzIG5vIGZpbGUgdG8gbG9hZCwgb3BlbiBpdCBkaXJlY3RseVxuICAgICAgICAgICAgY29uc3QgcmVzb3VyY2UgPSB0aGlzLl9sb2FkZXIub3Blbihhc3NldC50eXBlLCBhc3NldC5kYXRhKTtcbiAgICAgICAgICAgIGFzc2V0LmxvYWRlZCA9IHRydWU7XG4gICAgICAgICAgICBfb3BlbmVkKHJlc291cmNlKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFVzZSB0aGlzIHRvIGxvYWQgYW5kIGNyZWF0ZSBhbiBhc3NldCBpZiB5b3UgZG9uJ3QgaGF2ZSBhc3NldHMgY3JlYXRlZC4gVXN1YWxseSB5b3Ugd291bGRcbiAgICAgKiBvbmx5IHVzZSB0aGlzIGlmIHlvdSBhcmUgbm90IGludGVncmF0ZWQgd2l0aCB0aGUgUGxheUNhbnZhcyBFZGl0b3IuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gdXJsIC0gVGhlIHVybCB0byBsb2FkLlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSB0eXBlIC0gVGhlIHR5cGUgb2YgYXNzZXQgdG8gbG9hZC5cbiAgICAgKiBAcGFyYW0ge0xvYWRBc3NldENhbGxiYWNrfSBjYWxsYmFjayAtIEZ1bmN0aW9uIGNhbGxlZCB3aGVuIGFzc2V0IGlzIGxvYWRlZCwgcGFzc2VkIChlcnIsXG4gICAgICogYXNzZXQpLCB3aGVyZSBlcnIgaXMgbnVsbCBpZiBubyBlcnJvcnMgd2VyZSBlbmNvdW50ZXJlZC5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGFwcC5hc3NldHMubG9hZEZyb21VcmwoXCIuLi9wYXRoL3RvL3RleHR1cmUuanBnXCIsIFwidGV4dHVyZVwiLCBmdW5jdGlvbiAoZXJyLCBhc3NldCkge1xuICAgICAqICAgICBjb25zdCB0ZXh0dXJlID0gYXNzZXQucmVzb3VyY2U7XG4gICAgICogfSk7XG4gICAgICovXG4gICAgbG9hZEZyb21VcmwodXJsLCB0eXBlLCBjYWxsYmFjaykge1xuICAgICAgICB0aGlzLmxvYWRGcm9tVXJsQW5kRmlsZW5hbWUodXJsLCBudWxsLCB0eXBlLCBjYWxsYmFjayk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVXNlIHRoaXMgdG8gbG9hZCBhbmQgY3JlYXRlIGFuIGFzc2V0IHdoZW4gYm90aCB0aGUgVVJMIGFuZCBmaWxlbmFtZSBhcmUgcmVxdWlyZWQuIEZvclxuICAgICAqIGV4YW1wbGUsIHVzZSB0aGlzIGZ1bmN0aW9uIHdoZW4gbG9hZGluZyBCTE9CIGFzc2V0cywgd2hlcmUgdGhlIFVSTCBkb2VzIG5vdCBhZGVxdWF0ZWx5XG4gICAgICogaWRlbnRpZnkgdGhlIGZpbGUuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gdXJsIC0gVGhlIHVybCB0byBsb2FkLlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBmaWxlbmFtZSAtIFRoZSBmaWxlbmFtZSBvZiB0aGUgYXNzZXQgdG8gbG9hZC5cbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gdHlwZSAtIFRoZSB0eXBlIG9mIGFzc2V0IHRvIGxvYWQuXG4gICAgICogQHBhcmFtIHtMb2FkQXNzZXRDYWxsYmFja30gY2FsbGJhY2sgLSBGdW5jdGlvbiBjYWxsZWQgd2hlbiBhc3NldCBpcyBsb2FkZWQsIHBhc3NlZCAoZXJyLFxuICAgICAqIGFzc2V0KSwgd2hlcmUgZXJyIGlzIG51bGwgaWYgbm8gZXJyb3JzIHdlcmUgZW5jb3VudGVyZWQuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBjb25zdCBmaWxlID0gbWFnaWNhbGx5T2J0YWluQUZpbGUoKTtcbiAgICAgKiBhcHAuYXNzZXRzLmxvYWRGcm9tVXJsQW5kRmlsZW5hbWUoVVJMLmNyZWF0ZU9iamVjdFVSTChmaWxlKSwgXCJ0ZXh0dXJlLnBuZ1wiLCBcInRleHR1cmVcIiwgZnVuY3Rpb24gKGVyciwgYXNzZXQpIHtcbiAgICAgKiAgICAgY29uc3QgdGV4dHVyZSA9IGFzc2V0LnJlc291cmNlO1xuICAgICAqIH0pO1xuICAgICAqL1xuICAgIGxvYWRGcm9tVXJsQW5kRmlsZW5hbWUodXJsLCBmaWxlbmFtZSwgdHlwZSwgY2FsbGJhY2spIHtcbiAgICAgICAgY29uc3QgbmFtZSA9IHBhdGguZ2V0QmFzZW5hbWUoZmlsZW5hbWUgfHwgdXJsKTtcblxuICAgICAgICBjb25zdCBmaWxlID0ge1xuICAgICAgICAgICAgZmlsZW5hbWU6IGZpbGVuYW1lIHx8IG5hbWUsXG4gICAgICAgICAgICB1cmw6IHVybFxuICAgICAgICB9O1xuXG4gICAgICAgIGxldCBhc3NldCA9IHRoaXMuZ2V0QnlVcmwodXJsKTtcbiAgICAgICAgaWYgKCFhc3NldCkge1xuICAgICAgICAgICAgYXNzZXQgPSBuZXcgQXNzZXQobmFtZSwgdHlwZSwgZmlsZSk7XG4gICAgICAgICAgICB0aGlzLmFkZChhc3NldCk7XG4gICAgICAgIH0gZWxzZSBpZiAoYXNzZXQubG9hZGVkKSB7XG4gICAgICAgICAgICAvLyBhc3NldCBpcyBhbHJlYWR5IGxvYWRlZFxuICAgICAgICAgICAgY2FsbGJhY2soYXNzZXQubG9hZEZyb21VcmxFcnJvciB8fCBudWxsLCBhc3NldCk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBzdGFydExvYWQgPSAoYXNzZXQpID0+IHtcbiAgICAgICAgICAgIGFzc2V0Lm9uY2UoJ2xvYWQnLCAobG9hZGVkQXNzZXQpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAodHlwZSA9PT0gJ21hdGVyaWFsJykge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9sb2FkVGV4dHVyZXMobG9hZGVkQXNzZXQsIChlcnIsIHRleHR1cmVzKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYWxsYmFjayhlcnIsIGxvYWRlZEFzc2V0KTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2sobnVsbCwgbG9hZGVkQXNzZXQpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgYXNzZXQub25jZSgnZXJyb3InLCAoZXJyKSA9PiB7XG4gICAgICAgICAgICAgICAgLy8gc3RvcmUgdGhlIGVycm9yIG9uIHRoZSBhc3NldCBpbiBjYXNlIHVzZXIgcmVxdWVzdHMgdGhpcyBhc3NldCBhZ2FpblxuICAgICAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5sb2FkRnJvbVVybEVycm9yID0gZXJyO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjYWxsYmFjayhlcnIsIGFzc2V0KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgdGhpcy5sb2FkKGFzc2V0KTtcbiAgICAgICAgfTtcblxuICAgICAgICBpZiAoYXNzZXQucmVzb3VyY2UpIHtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsIGFzc2V0KTtcbiAgICAgICAgfSBlbHNlIGlmICh0eXBlID09PSAnbW9kZWwnKSB7XG4gICAgICAgICAgICB0aGlzLl9sb2FkTW9kZWwoYXNzZXQsIHN0YXJ0TG9hZCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzdGFydExvYWQoYXNzZXQpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gcHJpdmF0ZSBtZXRob2QgdXNlZCBmb3IgZW5naW5lLW9ubHkgbG9hZGluZyBvZiBtb2RlbCBkYXRhXG4gICAgX2xvYWRNb2RlbChtb2RlbEFzc2V0LCBjb250aW51YXRpb24pIHtcbiAgICAgICAgY29uc3QgdXJsID0gbW9kZWxBc3NldC5nZXRGaWxlVXJsKCk7XG4gICAgICAgIGNvbnN0IGV4dCA9IHBhdGguZ2V0RXh0ZW5zaW9uKHVybCk7XG5cbiAgICAgICAgaWYgKGV4dCA9PT0gJy5qc29uJyB8fCBleHQgPT09ICcuZ2xiJykge1xuICAgICAgICAgICAgY29uc3QgZGlyID0gcGF0aC5nZXREaXJlY3RvcnkodXJsKTtcbiAgICAgICAgICAgIGNvbnN0IGJhc2VuYW1lID0gcGF0aC5nZXRCYXNlbmFtZSh1cmwpO1xuXG4gICAgICAgICAgICAvLyBQbGF5Q2FudmFzIG1vZGVsIGZvcm1hdCBzdXBwb3J0cyBtYXRlcmlhbCBtYXBwaW5nIGZpbGVcbiAgICAgICAgICAgIGNvbnN0IG1hcHBpbmdVcmwgPSBwYXRoLmpvaW4oZGlyLCBiYXNlbmFtZS5yZXBsYWNlKGV4dCwgJy5tYXBwaW5nLmpzb24nKSk7XG4gICAgICAgICAgICB0aGlzLl9sb2FkZXIubG9hZChtYXBwaW5nVXJsLCAnanNvbicsIChlcnIsIGRhdGEpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICAgIG1vZGVsQXNzZXQuZGF0YSA9IHsgbWFwcGluZzogW10gfTtcbiAgICAgICAgICAgICAgICAgICAgY29udGludWF0aW9uKG1vZGVsQXNzZXQpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX2xvYWRNYXRlcmlhbHMobW9kZWxBc3NldCwgZGF0YSwgKGUsIG1hdGVyaWFscykgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgbW9kZWxBc3NldC5kYXRhID0gZGF0YTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRpbnVhdGlvbihtb2RlbEFzc2V0KTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBvdGhlciBtb2RlbCBmb3JtYXQgKGUuZy4gb2JqKVxuICAgICAgICAgICAgY29udGludWF0aW9uKG1vZGVsQXNzZXQpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gcHJpdmF0ZSBtZXRob2QgdXNlZCBmb3IgZW5naW5lLW9ubHkgbG9hZGluZyBvZiBtb2RlbCBtYXRlcmlhbHNcbiAgICBfbG9hZE1hdGVyaWFscyhtb2RlbEFzc2V0LCBtYXBwaW5nLCBjYWxsYmFjaykge1xuICAgICAgICBjb25zdCBtYXRlcmlhbHMgPSBbXTtcbiAgICAgICAgbGV0IGNvdW50ID0gMDtcblxuICAgICAgICBjb25zdCBvbk1hdGVyaWFsTG9hZGVkID0gKGVyciwgbWF0ZXJpYWxBc3NldCkgPT4ge1xuICAgICAgICAgICAgLy8gbG9hZCBkZXBlbmRlbnQgdGV4dHVyZXNcbiAgICAgICAgICAgIHRoaXMuX2xvYWRUZXh0dXJlcyhtYXRlcmlhbEFzc2V0LCAoZXJyLCB0ZXh0dXJlcykgPT4ge1xuICAgICAgICAgICAgICAgIG1hdGVyaWFscy5wdXNoKG1hdGVyaWFsQXNzZXQpO1xuICAgICAgICAgICAgICAgIGlmIChtYXRlcmlhbHMubGVuZ3RoID09PSBjb3VudCkge1xuICAgICAgICAgICAgICAgICAgICBjYWxsYmFjayhudWxsLCBtYXRlcmlhbHMpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9O1xuXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbWFwcGluZy5tYXBwaW5nLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBwYXRoID0gbWFwcGluZy5tYXBwaW5nW2ldLnBhdGg7XG4gICAgICAgICAgICBpZiAocGF0aCkge1xuICAgICAgICAgICAgICAgIGNvdW50Kys7XG4gICAgICAgICAgICAgICAgY29uc3QgdXJsID0gbW9kZWxBc3NldC5nZXRBYnNvbHV0ZVVybChwYXRoKTtcbiAgICAgICAgICAgICAgICB0aGlzLmxvYWRGcm9tVXJsKHVybCwgJ21hdGVyaWFsJywgb25NYXRlcmlhbExvYWRlZCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoY291bnQgPT09IDApIHtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsIG1hdGVyaWFscyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBwcml2YXRlIG1ldGhvZCB1c2VkIGZvciBlbmdpbmUtb25seSBsb2FkaW5nIG9mIHRoZSB0ZXh0dXJlcyByZWZlcmVuY2VkIGJ5XG4gICAgLy8gdGhlIG1hdGVyaWFsIGFzc2V0XG4gICAgX2xvYWRUZXh0dXJlcyhtYXRlcmlhbEFzc2V0LCBjYWxsYmFjaykge1xuICAgICAgICBjb25zdCB0ZXh0dXJlcyA9IFtdO1xuICAgICAgICBsZXQgY291bnQgPSAwO1xuXG4gICAgICAgIGNvbnN0IGRhdGEgPSBtYXRlcmlhbEFzc2V0LmRhdGE7XG4gICAgICAgIGlmIChkYXRhLm1hcHBpbmdGb3JtYXQgIT09ICdwYXRoJykge1xuICAgICAgICAgICAgRGVidWcud2FybihgU2tpcHBpbmc6ICR7bWF0ZXJpYWxBc3NldC5uYW1lfSwgbWF0ZXJpYWwgZmlsZXMgbXVzdCBiZSBtYXBwaW5nRm9ybWF0OiBcInBhdGhcIiB0byBiZSBsb2FkZWQgZnJvbSBVUkxgKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsIHRleHR1cmVzKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IG9uVGV4dHVyZUxvYWRlZCA9IChlcnIsIHRleHR1cmUpID0+IHtcbiAgICAgICAgICAgIGlmIChlcnIpIGNvbnNvbGUuZXJyb3IoZXJyKTtcbiAgICAgICAgICAgIHRleHR1cmVzLnB1c2godGV4dHVyZSk7XG4gICAgICAgICAgICBpZiAodGV4dHVyZXMubGVuZ3RoID09PSBjb3VudCkge1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsIHRleHR1cmVzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICBjb25zdCB0ZXhQYXJhbXMgPSBzdGFuZGFyZE1hdGVyaWFsVGV4dHVyZVBhcmFtZXRlcnM7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGV4UGFyYW1zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBwYXRoID0gZGF0YVt0ZXhQYXJhbXNbaV1dO1xuICAgICAgICAgICAgaWYgKHBhdGggJiYgdHlwZW9mIHBhdGggPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgY291bnQrKztcbiAgICAgICAgICAgICAgICBjb25zdCB1cmwgPSBtYXRlcmlhbEFzc2V0LmdldEFic29sdXRlVXJsKHBhdGgpO1xuICAgICAgICAgICAgICAgIHRoaXMubG9hZEZyb21VcmwodXJsLCAndGV4dHVyZScsIG9uVGV4dHVyZUxvYWRlZCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoY291bnQgPT09IDApIHtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsIHRleHR1cmVzKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIF9vblRhZ0FkZCh0YWcsIGFzc2V0KSB7XG4gICAgICAgIHRoaXMuX3RhZ3MuYWRkKHRhZywgYXNzZXQpO1xuICAgIH1cblxuICAgIF9vblRhZ1JlbW92ZSh0YWcsIGFzc2V0KSB7XG4gICAgICAgIHRoaXMuX3RhZ3MucmVtb3ZlKHRhZywgYXNzZXQpO1xuICAgIH1cblxuICAgIF9vbk5hbWVDaGFuZ2UoYXNzZXQsIG5hbWUsIG5hbWVPbGQpIHtcbiAgICAgICAgLy8gcmVtb3ZlXG4gICAgICAgIGlmICh0aGlzLl9uYW1lVG9Bc3NldC5oYXMobmFtZU9sZCkpIHtcbiAgICAgICAgICAgIGNvbnN0IGl0ZW1zID0gdGhpcy5fbmFtZVRvQXNzZXQuZ2V0KG5hbWVPbGQpO1xuICAgICAgICAgICAgaXRlbXMuZGVsZXRlKGFzc2V0KTtcbiAgICAgICAgICAgIGlmIChpdGVtcy5zaXplID09PSAwKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fbmFtZVRvQXNzZXQuZGVsZXRlKG5hbWVPbGQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gYWRkXG4gICAgICAgIGlmICghdGhpcy5fbmFtZVRvQXNzZXQuaGFzKGFzc2V0Lm5hbWUpKVxuICAgICAgICAgICAgdGhpcy5fbmFtZVRvQXNzZXQuc2V0KGFzc2V0Lm5hbWUsIG5ldyBTZXQoKSk7XG5cbiAgICAgICAgdGhpcy5fbmFtZVRvQXNzZXQuZ2V0KGFzc2V0Lm5hbWUpLmFkZChhc3NldCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJuIGFsbCBBc3NldHMgdGhhdCBzYXRpc2Z5IHRoZSBzZWFyY2ggcXVlcnkuIFF1ZXJ5IGNhbiBiZSBzaW1wbHkgYSBzdHJpbmcsIG9yIGNvbW1hXG4gICAgICogc2VwYXJhdGVkIHN0cmluZ3MsIHRvIGhhdmUgaW5jbHVzaXZlIHJlc3VsdHMgb2YgYXNzZXRzIHRoYXQgbWF0Y2ggYXQgbGVhc3Qgb25lIHF1ZXJ5LiBBXG4gICAgICogcXVlcnkgdGhhdCBjb25zaXN0cyBvZiBhbiBhcnJheSBvZiB0YWdzIGNhbiBiZSB1c2VkIHRvIG1hdGNoIGFzc2V0cyB0aGF0IGhhdmUgZWFjaCB0YWcgb2ZcbiAgICAgKiBhcnJheS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7Li4uKn0gcXVlcnkgLSBOYW1lIG9mIGEgdGFnIG9yIGFycmF5IG9mIHRhZ3MuXG4gICAgICogQHJldHVybnMge0Fzc2V0W119IEEgbGlzdCBvZiBhbGwgQXNzZXRzIG1hdGNoZWQgcXVlcnkuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBjb25zdCBhc3NldHMgPSBhcHAuYXNzZXRzLmZpbmRCeVRhZyhcImxldmVsLTFcIik7XG4gICAgICogLy8gcmV0dXJucyBhbGwgYXNzZXRzIHRoYXQgdGFnZ2VkIGJ5IGBsZXZlbC0xYFxuICAgICAqIEBleGFtcGxlXG4gICAgICogY29uc3QgYXNzZXRzID0gYXBwLmFzc2V0cy5maW5kQnlUYWcoXCJsZXZlbC0xXCIsIFwibGV2ZWwtMlwiKTtcbiAgICAgKiAvLyByZXR1cm5zIGFsbCBhc3NldHMgdGhhdCB0YWdnZWQgYnkgYGxldmVsLTFgIE9SIGBsZXZlbC0yYFxuICAgICAqIEBleGFtcGxlXG4gICAgICogY29uc3QgYXNzZXRzID0gYXBwLmFzc2V0cy5maW5kQnlUYWcoW1wibGV2ZWwtMVwiLCBcIm1vbnN0ZXJcIl0pO1xuICAgICAqIC8vIHJldHVybnMgYWxsIGFzc2V0cyB0aGF0IHRhZ2dlZCBieSBgbGV2ZWwtMWAgQU5EIGBtb25zdGVyYFxuICAgICAqIEBleGFtcGxlXG4gICAgICogY29uc3QgYXNzZXRzID0gYXBwLmFzc2V0cy5maW5kQnlUYWcoW1wibGV2ZWwtMVwiLCBcIm1vbnN0ZXJcIl0sIFtcImxldmVsLTJcIiwgXCJtb25zdGVyXCJdKTtcbiAgICAgKiAvLyByZXR1cm5zIGFsbCBhc3NldHMgdGhhdCB0YWdnZWQgYnkgKGBsZXZlbC0xYCBBTkQgYG1vbnN0ZXJgKSBPUiAoYGxldmVsLTJgIEFORCBgbW9uc3RlcmApXG4gICAgICovXG4gICAgZmluZEJ5VGFnKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fdGFncy5maW5kKGFyZ3VtZW50cyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJuIGFsbCBBc3NldHMgdGhhdCBzYXRpc2Z5IGEgZmlsdGVyIGNhbGxiYWNrLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtGaWx0ZXJBc3NldENhbGxiYWNrfSBjYWxsYmFjayAtIFRoZSBjYWxsYmFjayBmdW5jdGlvbiB0aGF0IGlzIHVzZWQgdG8gZmlsdGVyIGFzc2V0cy5cbiAgICAgKiBSZXR1cm4gYHRydWVgIHRvIGluY2x1ZGUgYW4gYXNzZXQgaW4gdGhlIHJldHVybmVkIGFycmF5LlxuICAgICAqIEByZXR1cm5zIHtBc3NldFtdfSBBIGxpc3Qgb2YgYWxsIEFzc2V0cyBmb3VuZC5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGNvbnN0IGFzc2V0cyA9IGFwcC5hc3NldHMuZmlsdGVyKGFzc2V0ID0+IGFzc2V0Lm5hbWUuaW5jbHVkZXMoJ21vbnN0ZXInKSk7XG4gICAgICogY29uc29sZS5sb2coYEZvdW5kICR7YXNzZXRzLmxlbmd0aH0gYXNzZXRzIHdpdGggYSBuYW1lIGNvbnRhaW5pbmcgJ21vbnN0ZXInYCk7XG4gICAgICovXG4gICAgZmlsdGVyKGNhbGxiYWNrKSB7XG4gICAgICAgIHJldHVybiBBcnJheS5mcm9tKHRoaXMuX2Fzc2V0cykuZmlsdGVyKGFzc2V0ID0+IGNhbGxiYWNrKGFzc2V0KSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJuIHRoZSBmaXJzdCBBc3NldCB3aXRoIHRoZSBzcGVjaWZpZWQgbmFtZSBhbmQgdHlwZSBmb3VuZCBpbiB0aGUgcmVnaXN0cnkuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gbmFtZSAtIFRoZSBuYW1lIG9mIHRoZSBBc3NldCB0byBmaW5kLlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBbdHlwZV0gLSBUaGUgdHlwZSBvZiB0aGUgQXNzZXQgdG8gZmluZC5cbiAgICAgKiBAcmV0dXJucyB7QXNzZXR8bnVsbH0gQSBzaW5nbGUgQXNzZXQgb3IgbnVsbCBpZiBubyBBc3NldCBpcyBmb3VuZC5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGNvbnN0IGFzc2V0ID0gYXBwLmFzc2V0cy5maW5kKFwibXlUZXh0dXJlQXNzZXRcIiwgXCJ0ZXh0dXJlXCIpO1xuICAgICAqL1xuICAgIGZpbmQobmFtZSwgdHlwZSkge1xuICAgICAgICBjb25zdCBpdGVtcyA9IHRoaXMuX25hbWVUb0Fzc2V0LmdldChuYW1lKTtcbiAgICAgICAgaWYgKCFpdGVtcykgcmV0dXJuIG51bGw7XG5cbiAgICAgICAgZm9yIChjb25zdCBhc3NldCBvZiBpdGVtcykge1xuICAgICAgICAgICAgaWYgKCF0eXBlIHx8IGFzc2V0LnR5cGUgPT09IHR5cGUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gYXNzZXQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm4gYWxsIEFzc2V0cyB3aXRoIHRoZSBzcGVjaWZpZWQgbmFtZSBhbmQgdHlwZSBmb3VuZCBpbiB0aGUgcmVnaXN0cnkuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gbmFtZSAtIFRoZSBuYW1lIG9mIHRoZSBBc3NldHMgdG8gZmluZC5cbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gW3R5cGVdIC0gVGhlIHR5cGUgb2YgdGhlIEFzc2V0cyB0byBmaW5kLlxuICAgICAqIEByZXR1cm5zIHtBc3NldFtdfSBBIGxpc3Qgb2YgYWxsIEFzc2V0cyBmb3VuZC5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGNvbnN0IGFzc2V0cyA9IGFwcC5hc3NldHMuZmluZEFsbCgnYnJpY2snLCAndGV4dHVyZScpO1xuICAgICAqIGNvbnNvbGUubG9nKGBGb3VuZCAke2Fzc2V0cy5sZW5ndGh9IHRleHR1cmUgYXNzZXRzIG5hbWVkICdicmljaydgKTtcbiAgICAgKi9cbiAgICBmaW5kQWxsKG5hbWUsIHR5cGUpIHtcbiAgICAgICAgY29uc3QgaXRlbXMgPSB0aGlzLl9uYW1lVG9Bc3NldC5nZXQobmFtZSk7XG4gICAgICAgIGlmICghaXRlbXMpIHJldHVybiBbXTtcbiAgICAgICAgY29uc3QgcmVzdWx0cyA9IEFycmF5LmZyb20oaXRlbXMpO1xuICAgICAgICBpZiAoIXR5cGUpIHJldHVybiByZXN1bHRzO1xuICAgICAgICByZXR1cm4gcmVzdWx0cy5maWx0ZXIoYXNzZXQgPT4gYXNzZXQudHlwZSA9PT0gdHlwZSk7XG4gICAgfVxufVxuXG5leHBvcnQgeyBBc3NldFJlZ2lzdHJ5IH07XG4iXSwibmFtZXMiOlsiQXNzZXRSZWdpc3RyeSIsIkV2ZW50SGFuZGxlciIsImNvbnN0cnVjdG9yIiwibG9hZGVyIiwiX2Fzc2V0cyIsIlNldCIsIl9pZFRvQXNzZXQiLCJNYXAiLCJfdXJsVG9Bc3NldCIsIl9uYW1lVG9Bc3NldCIsIl90YWdzIiwiVGFnc0NhY2hlIiwicHJlZml4IiwiX2xvYWRlciIsImxpc3QiLCJmaWx0ZXJzIiwiYXNzZXRzIiwiQXJyYXkiLCJmcm9tIiwicHJlbG9hZCIsInVuZGVmaW5lZCIsImZpbHRlciIsImFzc2V0IiwiYWRkIiwiX2Fzc2V0JGZpbGUiLCJfYXNzZXQkZmlsZTIiLCJoYXMiLCJzZXQiLCJpZCIsImZpbGUiLCJ1cmwiLCJuYW1lIiwiZ2V0Iiwib24iLCJfb25OYW1lQ2hhbmdlIiwicmVnaXN0cnkiLCJhZGRJdGVtIiwidGFncyIsIl9vblRhZ0FkZCIsIl9vblRhZ1JlbW92ZSIsImZpcmUiLCJsb2FkIiwicmVtb3ZlIiwiX2Fzc2V0JGZpbGUzIiwiX2Fzc2V0JGZpbGU0IiwiZGVsZXRlIiwib2ZmIiwiaXRlbXMiLCJzaXplIiwicmVtb3ZlSXRlbSIsIk51bWJlciIsImdldEJ5VXJsIiwibG9hZGluZyIsImxvYWRlZCIsIl9vcGVuZWQiLCJyZXNvdXJjZSIsInJlc291cmNlcyIsInBhdGNoIiwiX2xvYWRlZCIsImVyciIsImV4dHJhIiwic2NyaXB0IiwibGVnYWN5IiwidHlwZSIsImhhbmRsZXIiLCJnZXRIYW5kbGVyIiwiX2NhY2hlIiwicGFyZW50Tm9kZSIsImRvY3VtZW50IiwiaGVhZCIsInJlbW92ZUNoaWxkIiwiZ2V0RmlsZVVybCIsIm9wZW4iLCJkYXRhIiwibG9hZEZyb21VcmwiLCJjYWxsYmFjayIsImxvYWRGcm9tVXJsQW5kRmlsZW5hbWUiLCJmaWxlbmFtZSIsInBhdGgiLCJnZXRCYXNlbmFtZSIsIkFzc2V0IiwibG9hZEZyb21VcmxFcnJvciIsInN0YXJ0TG9hZCIsIm9uY2UiLCJsb2FkZWRBc3NldCIsIl9sb2FkVGV4dHVyZXMiLCJ0ZXh0dXJlcyIsIl9sb2FkTW9kZWwiLCJtb2RlbEFzc2V0IiwiY29udGludWF0aW9uIiwiZXh0IiwiZ2V0RXh0ZW5zaW9uIiwiZGlyIiwiZ2V0RGlyZWN0b3J5IiwiYmFzZW5hbWUiLCJtYXBwaW5nVXJsIiwiam9pbiIsInJlcGxhY2UiLCJtYXBwaW5nIiwiX2xvYWRNYXRlcmlhbHMiLCJlIiwibWF0ZXJpYWxzIiwiY291bnQiLCJvbk1hdGVyaWFsTG9hZGVkIiwibWF0ZXJpYWxBc3NldCIsInB1c2giLCJsZW5ndGgiLCJpIiwiZ2V0QWJzb2x1dGVVcmwiLCJtYXBwaW5nRm9ybWF0IiwiRGVidWciLCJ3YXJuIiwib25UZXh0dXJlTG9hZGVkIiwidGV4dHVyZSIsImNvbnNvbGUiLCJlcnJvciIsInRleFBhcmFtcyIsInN0YW5kYXJkTWF0ZXJpYWxUZXh0dXJlUGFyYW1ldGVycyIsInRhZyIsIm5hbWVPbGQiLCJmaW5kQnlUYWciLCJmaW5kIiwiYXJndW1lbnRzIiwiZmluZEFsbCIsInJlc3VsdHMiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7O0FBV0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxNQUFNQSxhQUFhLFNBQVNDLFlBQVksQ0FBQztBQXVDckM7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0VBQ0lDLFdBQVdBLENBQUNDLE1BQU0sRUFBRTtBQUNoQixJQUFBLEtBQUssRUFBRSxDQUFBO0FBN0NYO0FBQ0o7QUFDQTtBQUNBO0FBSEksSUFBQSxJQUFBLENBSUFDLE9BQU8sR0FBRyxJQUFJQyxHQUFHLEVBQUUsQ0FBQTtBQUVuQjtBQUNKO0FBQ0E7QUFDQTtBQUhJLElBQUEsSUFBQSxDQUlBQyxVQUFVLEdBQUcsSUFBSUMsR0FBRyxFQUFFLENBQUE7QUFFdEI7QUFDSjtBQUNBO0FBQ0E7QUFISSxJQUFBLElBQUEsQ0FJQUMsV0FBVyxHQUFHLElBQUlELEdBQUcsRUFBRSxDQUFBO0FBRXZCO0FBQ0o7QUFDQTtBQUNBO0FBSEksSUFBQSxJQUFBLENBSUFFLFlBQVksR0FBRyxJQUFJRixHQUFHLEVBQUUsQ0FBQTtBQUV4QjtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBSkksSUFBQSxJQUFBLENBS0FHLEtBQUssR0FBRyxJQUFJQyxTQUFTLENB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
