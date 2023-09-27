import { path } from '../../core/path.js';
import { Tags } from '../../core/tags.js';
import { EventHandler } from '../../core/event-handler.js';
import { findAvailableLocale } from '../i18n/utils.js';
import { ABSOLUTE_URL } from './constants.js';
import { AssetFile } from './asset-file.js';
import { getApplication } from '../globals.js';
import { http } from '../../platform/net/http.js';

// auto incrementing number for asset ids
let assetIdCounter = -1;
const VARIANT_SUPPORT = {
  pvr: 'extCompressedTexturePVRTC',
  dxt: 'extCompressedTextureS3TC',
  etc2: 'extCompressedTextureETC',
  etc1: 'extCompressedTextureETC1',
  basis: 'canvas' // dummy, basis is always supported
};

const VARIANT_DEFAULT_PRIORITY = ['pvr', 'dxt', 'etc2', 'etc1', 'basis'];

/**
 * Callback used by {@link Asset#ready} and called when an asset is ready.
 *
 * @callback AssetReadyCallback
 * @param {Asset} asset - The ready asset.
 */

/**
 * An asset record of a file or data resource that can be loaded by the engine. The asset contains
 * four important fields:
 *
 * - `file`: contains the details of a file (filename, url) which contains the resource data, e.g.
 * an image file for a texture asset.
 * - `data`: contains a JSON blob which contains either the resource data for the asset (e.g.
 * material data) or additional data for the file (e.g. material mappings for a model).
 * - `options`: contains a JSON blob with handler-specific load options.
 * - `resource`: contains the final resource when it is loaded. (e.g. a {@link StandardMaterial} or
 * a {@link Texture}).
 *
 * See the {@link AssetRegistry} for details on loading resources from assets.
 *
 * @augments EventHandler
 */
class Asset extends EventHandler {
  /**
   * Create a new Asset record. Generally, Assets are created in the loading process and you
   * won't need to create them by hand.
   *
   * @param {string} name - A non-unique but human-readable name which can be later used to
   * retrieve the asset.
   * @param {string} type - Type of asset. One of ["animation", "audio", "binary", "container",
   * "cubemap", "css", "font", "json", "html", "material", "model", "script", "shader", "sprite",
   * "template", text", "texture", "textureatlas"]
   * @param {object} [file] - Details about the file the asset is made from. At the least must
   * contain the 'url' field. For assets that don't contain file data use null.
   * @param {string} [file.url] - The URL of the resource file that contains the asset data.
   * @param {string} [file.filename] - The filename of the resource file or null if no filename
   * was set (e.g from using {@link AssetRegistry#loadFromUrl}).
   * @param {number} [file.size] - The size of the resource file or null if no size was set
   * (e.g. from using {@link AssetRegistry#loadFromUrl}).
   * @param {string} [file.hash] - The MD5 hash of the resource file data and the Asset data
   * field or null if hash was set (e.g from using {@link AssetRegistry#loadFromUrl}).
   * @param {ArrayBuffer} [file.contents] - Optional file contents. This is faster than wrapping
   * the data in a (base64 encoded) blob. Currently only used by container assets.
   * @param {object|string} [data] - JSON object or string with additional data about the asset.
   * (e.g. for texture and model assets) or contains the asset data itself (e.g. in the case of
   * materials).
   * @param {object} [options] - The asset handler options. For container options see
   * {@link ContainerHandler}.
   * @param {'anonymous'|'use-credentials'|null} [options.crossOrigin] - For use with texture assets
   * that are loaded using the browser. This setting overrides the default crossOrigin specifier.
   * For more details on crossOrigin and its use, see
   * https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement/crossOrigin.
   * @example
   * const asset = new pc.Asset("a texture", "texture", {
   *     url: "http://example.com/my/assets/here/texture.png"
   * });
   */
  constructor(name, type, file, data, options) {
    super();
    this._id = assetIdCounter--;
    this._name = name || '';

    /**
     * The type of the asset. One of ["animation", "audio", "binary", "container", "cubemap",
     * "css", "font", "json", "html", "material", "model", "render", "script", "shader", "sprite",
     * "template", "text", "texture", "textureatlas"]
     *
     * @type {("animation"|"audio"|"binary"|"container"|"cubemap"|"css"|"font"|"json"|"html"|"material"|"model"|"render"|"script"|"shader"|"sprite"|"template"|"text"|"texture"|"textureatlas")}
     */
    this.type = type;

    /**
     * Asset tags. Enables finding of assets by tags using the {@link AssetRegistry#findByTag} method.
     *
     * @type {Tags}
     */
    this.tags = new Tags(this);
    this._preload = false;
    this._file = null;
    this._data = data || {};

    /**
     * Optional JSON data that contains the asset handler options.
     *
     * @type {object}
     */
    this.options = options || {};

    // This is where the loaded resource(s) will be
    this._resources = [];

    // a string-assetId dictionary that maps
    // locale to asset id
    this._i18n = {};

    /**
     * True if the asset has finished attempting to load the resource. It is not guaranteed
     * that the resources are available as there could have been a network error.
     *
     * @type {boolean}
     */
    this.loaded = false;

    /**
     * True if the resource is currently being loaded.
     *
     * @type {boolean}
     */
    this.loading = false;

    /**
     * The asset registry that this Asset belongs to.
     *
     * @type {import('./asset-registry.js').AssetRegistry|null}
     */
    this.registry = null;
    if (file) this.file = file;
  }

  /**
   * Fired when the asset has completed loading.
   *
   * @event Asset#load
   * @param {Asset} asset - The asset that was loaded.
   */

  /**
   * Fired just before the asset unloads the resource. This allows for the opportunity to prepare
   * for an asset that will be unloaded. E.g. Changing the texture of a model to a default before
   * the one it was using is unloaded.
   *
   * @event Asset#unload
   * @param {Asset} asset - The asset that is due to be unloaded.
   */

  /**
   * Fired when the asset is removed from the asset registry.
   *
   * @event Asset#remove
   * @param {Asset} asset - The asset that was removed.
   */

  /**
   * Fired if the asset encounters an error while loading.
   *
   * @event Asset#error
   * @param {string} err - The error message.
   * @param {Asset} asset - The asset that generated the error.
   */

  /**
   * Fired when one of the asset properties `file`, `data`, `resource` or `resources` is changed.
   *
   * @event Asset#change
   * @param {Asset} asset - The asset that was loaded.
   * @param {string} property - The name of the property that changed.
   * @param {*} value - The new property value.
   * @param {*} oldValue - The old property value.
   */

  /**
   * Fired when we add a new localized asset id to the asset.
   *
   * @event Asset#add:localized
   * @param {string} locale - The locale.
   * @param {number} assetId - The asset id we added.
   */

  /**
   * Fired when we remove a localized asset id from the asset.
   *
   * @event Asset#remove:localized
   * @param {string} locale - The locale.
   * @param {number} assetId - The asset id we removed.
   */

  /**
   * The asset id.
   *
   * @type {number}
   */
  set id(value) {
    this._id = value;
  }
  get id() {
    return this._id;
  }

  /**
   * The asset name.
   *
   * @type {string}
   */
  set name(value) {
    if (this._name === value) return;
    const old = this._name;
    this._name = value;
    this.fire('name', this, this._name, old);
  }
  get name() {
    return this._name;
  }

  /**
   * The file details or null if no file.
   *
   * @type {object}
   */
  set file(value) {
    // if value contains variants, choose the correct variant first
    if (value && value.variants && ['texture', 'textureatlas', 'bundle'].indexOf(this.type) !== -1) {
      var _this$registry;
      // search for active variant
      const app = ((_this$registry = this.registry) == null || (_this$registry = _this$registry._loader) == null ? void 0 : _this$registry._app) || getApplication();
      const device = app == null ? void 0 : app.graphicsDevice;
      if (device) {
        for (let i = 0, len = VARIANT_DEFAULT_PRIORITY.length; i < len; i++) {
          const variant = VARIANT_DEFAULT_PRIORITY[i];
          // if the device supports the variant
          if (value.variants[variant] && device[VARIANT_SUPPORT[variant]]) {
            value = value.variants[variant];
            break;
          }

          // if the variant does not exist but the asset is in a bundle
          // and the bundle contain assets with this variant then return the default
          // file for the asset
          if (app.enableBundles) {
            const bundles = app.bundles.listBundlesForAsset(this);
            if (bundles && bundles.find(b => {
              var _b$file;
              return b == null || (_b$file = b.file) == null ? void 0 : _b$file.variants[variant];
            })) {
              break;
            }
          }
        }
      }
    }
    const oldFile = this._file;
    const newFile = value ? new AssetFile(value.url, value.filename, value.hash, value.size, value.opt, value.contents) : null;
    if (!!newFile !== !!oldFile || newFile && !newFile.equals(oldFile)) {
      this._file = newFile;
      this.fire('change', this, 'file', newFile, oldFile);
      this.reload();
    }
  }
  get file() {
    return this._file;
  }

  /**
   * Optional JSON data that contains either the complete resource data. (e.g. in the case of a
   * material) or additional data (e.g. in the case of a model it contains mappings from mesh to
   * material).
   *
   * @type {object}
   */
  set data(value) {
    // fire change event when data changes
    // because the asset might need reloading if that happens
    const old = this._data;
    this._data = value;
    if (value !== old) {
      this.fire('change', this, 'data', value, old);
      if (this.loaded) this.registry._loader.patch(this, this.registry);
    }
  }
  get data() {
    return this._data;
  }

  /**
   * A reference to the resource when the asset is loaded. e.g. a {@link Texture} or a {@link Model}.
   *
   * @type {object}
   */
  set resource(value) {
    const _old = this._resources[0];
    this._resources[0] = value;
    this.fire('change', this, 'resource', value, _old);
  }
  get resource() {
    return this._resources[0];
  }

  /**
   * A reference to the resources of the asset when it's loaded. An asset can hold more runtime
   * resources than one e.g. cubemaps.
   *
   * @type {object[]}
   */
  set resources(value) {
    const _old = this._resources;
    this._resources = value;
    this.fire('change', this, 'resources', value, _old);
  }
  get resources() {
    return this._resources;
  }

  /**
   * If true the asset will be loaded during the preload phase of application set up.
   *
   * @type {boolean}
   */
  set preload(value) {
    value = !!value;
    if (this._preload === value) return;
    this._preload = value;
    if (this._preload && !this.loaded && !this.loading && this.registry) this.registry.load(this);
  }
  get preload() {
    return this._preload;
  }
  set loadFaces(value) {
    value = !!value;
    if (!this.hasOwnProperty('_loadFaces') || value !== this._loadFaces) {
      this._loadFaces = value;

      // the loadFaces property should be part of the asset data block
      // because changing the flag should result in asset patch being invoked.
      // here we must invoke it manually instead.
      if (this.loaded) this.registry._loader.patch(this, this.registry);
    }
  }
  get loadFaces() {
    return this._loadFaces;
  }

  /**
   * Return the URL required to fetch the file for this asset.
   *
   * @returns {string|null} The URL. Returns null if the asset has no associated file.
   * @example
   * const assets = app.assets.find("My Image", "texture");
   * const img = "&lt;img src='" + assets[0].getFileUrl() + "'&gt;";
   */
  getFileUrl() {
    const file = this.file;
    if (!file || !file.url) return null;
    let url = file.url;
    if (this.registry && this.registry.prefix && !ABSOLUTE_URL.test(url)) url = this.registry.prefix + url;

    // add file hash to avoid hard-caching problems
    if (this.type !== 'script' && file.hash) {
      const separator = url.indexOf('?') !== -1 ? '&' : '?';
      url += separator + 't=' + file.hash;
    }
    return url;
  }

  /**
   * Construct an asset URL from this asset's location and a relative path. If the relativePath
   * is a blob or Base64 URI, then return that instead.
   *
   * @param {string} relativePath - The relative path to be concatenated to this asset's base url.
   * @returns {string} Resulting URL of the asset.
   * @ignore
   */
  getAbsoluteUrl(relativePath) {
    if (relativePath.startsWith('blob:') || relativePath.startsWith('data:')) {
      return relativePath;
    }
    const base = path.getDirectory(this.file.url);
    return path.join(base, relativePath);
  }

  /**
   * Returns the asset id of the asset that corresponds to the specified locale.
   *
   * @param {string} locale - The desired locale e.g. Ar-AR.
   * @returns {number} An asset id or null if there is no asset specified for the desired locale.
   * @ignore
   */
  getLocalizedAssetId(locale) {
    // tries to find either the desired locale or a fallback locale
    locale = findAvailableLocale(locale, this._i18n);
    return this._i18n[locale] || null;
  }

  /**
   * Adds a replacement asset id for the specified locale. When the locale in
   * {@link Application#i18n} changes then references to this asset will be replaced with the
   * specified asset id. (Currently only supported by the {@link ElementComponent}).
   *
   * @param {string} locale - The locale e.g. Ar-AR.
   * @param {number} assetId - The asset id.
   * @ignore
   */
  addLocalizedAssetId(locale, assetId) {
    this._i18n[locale] = assetId;
    this.fire('add:localized', locale, assetId);
  }

  /**
   * Removes a localized asset.
   *
   * @param {string} locale - The locale e.g. Ar-AR.
   * @ignore
   */
  removeLocalizedAssetId(locale) {
    const assetId = this._i18n[locale];
    if (assetId) {
      delete this._i18n[locale];
      this.fire('remove:localized', locale, assetId);
    }
  }

  /**
   * Take a callback which is called as soon as the asset is loaded. If the asset is already
   * loaded the callback is called straight away.
   *
   * @param {AssetReadyCallback} callback - The function called when the asset is ready. Passed
   * the (asset) arguments.
   * @param {object} [scope] - Scope object to use when calling the callback.
   * @example
   * const asset = app.assets.find("My Asset");
   * asset.ready(function (asset) {
   *   // asset loaded
   * });
   * app.assets.load(asset);
   */
  ready(callback, scope) {
    scope = scope || this;
    if (this.loaded) {
      callback.call(scope, this);
    } else {
      this.once('load', function (asset) {
        callback.call(scope, asset);
      });
    }
  }
  reload() {
    // no need to be reloaded
    if (this.loaded) {
      this.loaded = false;
      this.registry.load(this);
    }
  }

  /**
   * Destroys the associated resource and marks asset as unloaded.
   *
   * @example
   * const asset = app.assets.find("My Asset");
   * asset.unload();
   * // asset.resource is null
   */
  unload() {
    if (!this.loaded && this._resources.length === 0) return;
    this.fire('unload', this);
    this.registry.fire('unload:' + this.id, this);
    const old = this._resources;

    // clear resources on the asset
    this.resources = [];
    this.loaded = false;

    // remove resource from loader cache
    if (this.file) {
      this.registry._loader.clearCache(this.getFileUrl(), this.type);
    }

    // destroy resources
    for (let i = 0; i < old.length; ++i) {
      const resource = old[i];
      if (resource && resource.destroy) {
        resource.destroy();
      }
    }
  }

  /**
   * Helper function to resolve asset file data and return the contents as an ArrayBuffer. If the
   * asset file contents are present, that is returned. Otherwise the file data is be downloaded
   * via http.
   *
   * @param {string} loadUrl - The URL as passed into the handler
   * @param {import('../handlers/loader.js').ResourceLoaderCallback} callback - The callback
   * function to receive results.
   * @param {Asset} [asset] - The asset
   * @param {number} maxRetries - Number of retries if http download is required
   * @ignore
   */
  static fetchArrayBuffer(loadUrl, callback, asset, maxRetries = 0) {
    var _asset$file;
    if (asset != null && (_asset$file = asset.file) != null && _asset$file.contents) {
      // asset file contents were provided
      setTimeout(() => {
        callback(null, asset.file.contents);
      });
    } else {
      // asset contents must be downloaded
      http.get(loadUrl, {
        cache: true,
        responseType: 'arraybuffer',
        retry: maxRetries > 0,
        maxRetries: maxRetries
      }, callback);
    }
  }
}

export { Asset };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXNzZXQuanMiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9mcmFtZXdvcmsvYXNzZXQvYXNzZXQuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgcGF0aCB9IGZyb20gJy4uLy4uL2NvcmUvcGF0aC5qcyc7XG5pbXBvcnQgeyBUYWdzIH0gZnJvbSAnLi4vLi4vY29yZS90YWdzLmpzJztcblxuaW1wb3J0IHsgRXZlbnRIYW5kbGVyIH0gZnJvbSAnLi4vLi4vY29yZS9ldmVudC1oYW5kbGVyLmpzJztcblxuaW1wb3J0IHsgZmluZEF2YWlsYWJsZUxvY2FsZSB9IGZyb20gJy4uL2kxOG4vdXRpbHMuanMnO1xuXG5pbXBvcnQgeyBBQlNPTFVURV9VUkwgfSBmcm9tICcuL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBBc3NldEZpbGUgfSBmcm9tICcuL2Fzc2V0LWZpbGUuanMnO1xuaW1wb3J0IHsgZ2V0QXBwbGljYXRpb24gfSBmcm9tICcuLi9nbG9iYWxzLmpzJztcbmltcG9ydCB7IGh0dHAgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9uZXQvaHR0cC5qcyc7XG5cbi8vIGF1dG8gaW5jcmVtZW50aW5nIG51bWJlciBmb3IgYXNzZXQgaWRzXG5sZXQgYXNzZXRJZENvdW50ZXIgPSAtMTtcblxuY29uc3QgVkFSSUFOVF9TVVBQT1JUID0ge1xuICAgIHB2cjogJ2V4dENvbXByZXNzZWRUZXh0dXJlUFZSVEMnLFxuICAgIGR4dDogJ2V4dENvbXByZXNzZWRUZXh0dXJlUzNUQycsXG4gICAgZXRjMjogJ2V4dENvbXByZXNzZWRUZXh0dXJlRVRDJyxcbiAgICBldGMxOiAnZXh0Q29tcHJlc3NlZFRleHR1cmVFVEMxJyxcbiAgICBiYXNpczogJ2NhbnZhcycgLy8gZHVtbXksIGJhc2lzIGlzIGFsd2F5cyBzdXBwb3J0ZWRcbn07XG5cbmNvbnN0IFZBUklBTlRfREVGQVVMVF9QUklPUklUWSA9IFsncHZyJywgJ2R4dCcsICdldGMyJywgJ2V0YzEnLCAnYmFzaXMnXTtcblxuLyoqXG4gKiBDYWxsYmFjayB1c2VkIGJ5IHtAbGluayBBc3NldCNyZWFkeX0gYW5kIGNhbGxlZCB3aGVuIGFuIGFzc2V0IGlzIHJlYWR5LlxuICpcbiAqIEBjYWxsYmFjayBBc3NldFJlYWR5Q2FsbGJhY2tcbiAqIEBwYXJhbSB7QXNzZXR9IGFzc2V0IC0gVGhlIHJlYWR5IGFzc2V0LlxuICovXG5cbi8qKlxuICogQW4gYXNzZXQgcmVjb3JkIG9mIGEgZmlsZSBvciBkYXRhIHJlc291cmNlIHRoYXQgY2FuIGJlIGxvYWRlZCBieSB0aGUgZW5naW5lLiBUaGUgYXNzZXQgY29udGFpbnNcbiAqIGZvdXIgaW1wb3J0YW50IGZpZWxkczpcbiAqXG4gKiAtIGBmaWxlYDogY29udGFpbnMgdGhlIGRldGFpbHMgb2YgYSBmaWxlIChmaWxlbmFtZSwgdXJsKSB3aGljaCBjb250YWlucyB0aGUgcmVzb3VyY2UgZGF0YSwgZS5nLlxuICogYW4gaW1hZ2UgZmlsZSBmb3IgYSB0ZXh0dXJlIGFzc2V0LlxuICogLSBgZGF0YWA6IGNvbnRhaW5zIGEgSlNPTiBibG9iIHdoaWNoIGNvbnRhaW5zIGVpdGhlciB0aGUgcmVzb3VyY2UgZGF0YSBmb3IgdGhlIGFzc2V0IChlLmcuXG4gKiBtYXRlcmlhbCBkYXRhKSBvciBhZGRpdGlvbmFsIGRhdGEgZm9yIHRoZSBmaWxlIChlLmcuIG1hdGVyaWFsIG1hcHBpbmdzIGZvciBhIG1vZGVsKS5cbiAqIC0gYG9wdGlvbnNgOiBjb250YWlucyBhIEpTT04gYmxvYiB3aXRoIGhhbmRsZXItc3BlY2lmaWMgbG9hZCBvcHRpb25zLlxuICogLSBgcmVzb3VyY2VgOiBjb250YWlucyB0aGUgZmluYWwgcmVzb3VyY2Ugd2hlbiBpdCBpcyBsb2FkZWQuIChlLmcuIGEge0BsaW5rIFN0YW5kYXJkTWF0ZXJpYWx9IG9yXG4gKiBhIHtAbGluayBUZXh0dXJlfSkuXG4gKlxuICogU2VlIHRoZSB7QGxpbmsgQXNzZXRSZWdpc3RyeX0gZm9yIGRldGFpbHMgb24gbG9hZGluZyByZXNvdXJjZXMgZnJvbSBhc3NldHMuXG4gKlxuICogQGF1Z21lbnRzIEV2ZW50SGFuZGxlclxuICovXG5jbGFzcyBBc3NldCBleHRlbmRzIEV2ZW50SGFuZGxlciB7XG4gICAgLyoqXG4gICAgICogQ3JlYXRlIGEgbmV3IEFzc2V0IHJlY29yZC4gR2VuZXJhbGx5LCBBc3NldHMgYXJlIGNyZWF0ZWQgaW4gdGhlIGxvYWRpbmcgcHJvY2VzcyBhbmQgeW91XG4gICAgICogd29uJ3QgbmVlZCB0byBjcmVhdGUgdGhlbSBieSBoYW5kLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IG5hbWUgLSBBIG5vbi11bmlxdWUgYnV0IGh1bWFuLXJlYWRhYmxlIG5hbWUgd2hpY2ggY2FuIGJlIGxhdGVyIHVzZWQgdG9cbiAgICAgKiByZXRyaWV2ZSB0aGUgYXNzZXQuXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IHR5cGUgLSBUeXBlIG9mIGFzc2V0LiBPbmUgb2YgW1wiYW5pbWF0aW9uXCIsIFwiYXVkaW9cIiwgXCJiaW5hcnlcIiwgXCJjb250YWluZXJcIixcbiAgICAgKiBcImN1YmVtYXBcIiwgXCJjc3NcIiwgXCJmb250XCIsIFwianNvblwiLCBcImh0bWxcIiwgXCJtYXRlcmlhbFwiLCBcIm1vZGVsXCIsIFwic2NyaXB0XCIsIFwic2hhZGVyXCIsIFwic3ByaXRlXCIsXG4gICAgICogXCJ0ZW1wbGF0ZVwiLCB0ZXh0XCIsIFwidGV4dHVyZVwiLCBcInRleHR1cmVhdGxhc1wiXVxuICAgICAqIEBwYXJhbSB7b2JqZWN0fSBbZmlsZV0gLSBEZXRhaWxzIGFib3V0IHRoZSBmaWxlIHRoZSBhc3NldCBpcyBtYWRlIGZyb20uIEF0IHRoZSBsZWFzdCBtdXN0XG4gICAgICogY29udGFpbiB0aGUgJ3VybCcgZmllbGQuIEZvciBhc3NldHMgdGhhdCBkb24ndCBjb250YWluIGZpbGUgZGF0YSB1c2UgbnVsbC5cbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gW2ZpbGUudXJsXSAtIFRoZSBVUkwgb2YgdGhlIHJlc291cmNlIGZpbGUgdGhhdCBjb250YWlucyB0aGUgYXNzZXQgZGF0YS5cbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gW2ZpbGUuZmlsZW5hbWVdIC0gVGhlIGZpbGVuYW1lIG9mIHRoZSByZXNvdXJjZSBmaWxlIG9yIG51bGwgaWYgbm8gZmlsZW5hbWVcbiAgICAgKiB3YXMgc2V0IChlLmcgZnJvbSB1c2luZyB7QGxpbmsgQXNzZXRSZWdpc3RyeSNsb2FkRnJvbVVybH0pLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBbZmlsZS5zaXplXSAtIFRoZSBzaXplIG9mIHRoZSByZXNvdXJjZSBmaWxlIG9yIG51bGwgaWYgbm8gc2l6ZSB3YXMgc2V0XG4gICAgICogKGUuZy4gZnJvbSB1c2luZyB7QGxpbmsgQXNzZXRSZWdpc3RyeSNsb2FkRnJvbVVybH0pLlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBbZmlsZS5oYXNoXSAtIFRoZSBNRDUgaGFzaCBvZiB0aGUgcmVzb3VyY2UgZmlsZSBkYXRhIGFuZCB0aGUgQXNzZXQgZGF0YVxuICAgICAqIGZpZWxkIG9yIG51bGwgaWYgaGFzaCB3YXMgc2V0IChlLmcgZnJvbSB1c2luZyB7QGxpbmsgQXNzZXRSZWdpc3RyeSNsb2FkRnJvbVVybH0pLlxuICAgICAqIEBwYXJhbSB7QXJyYXlCdWZmZXJ9IFtmaWxlLmNvbnRlbnRzXSAtIE9wdGlvbmFsIGZpbGUgY29udGVudHMuIFRoaXMgaXMgZmFzdGVyIHRoYW4gd3JhcHBpbmdcbiAgICAgKiB0aGUgZGF0YSBpbiBhIChiYXNlNjQgZW5jb2RlZCkgYmxvYi4gQ3VycmVudGx5IG9ubHkgdXNlZCBieSBjb250YWluZXIgYXNzZXRzLlxuICAgICAqIEBwYXJhbSB7b2JqZWN0fHN0cmluZ30gW2RhdGFdIC0gSlNPTiBvYmplY3Qgb3Igc3RyaW5nIHdpdGggYWRkaXRpb25hbCBkYXRhIGFib3V0IHRoZSBhc3NldC5cbiAgICAgKiAoZS5nLiBmb3IgdGV4dHVyZSBhbmQgbW9kZWwgYXNzZXRzKSBvciBjb250YWlucyB0aGUgYXNzZXQgZGF0YSBpdHNlbGYgKGUuZy4gaW4gdGhlIGNhc2Ugb2ZcbiAgICAgKiBtYXRlcmlhbHMpLlxuICAgICAqIEBwYXJhbSB7b2JqZWN0fSBbb3B0aW9uc10gLSBUaGUgYXNzZXQgaGFuZGxlciBvcHRpb25zLiBGb3IgY29udGFpbmVyIG9wdGlvbnMgc2VlXG4gICAgICoge0BsaW5rIENvbnRhaW5lckhhbmRsZXJ9LlxuICAgICAqIEBwYXJhbSB7J2Fub255bW91cyd8J3VzZS1jcmVkZW50aWFscyd8bnVsbH0gW29wdGlvbnMuY3Jvc3NPcmlnaW5dIC0gRm9yIHVzZSB3aXRoIHRleHR1cmUgYXNzZXRzXG4gICAgICogdGhhdCBhcmUgbG9hZGVkIHVzaW5nIHRoZSBicm93c2VyLiBUaGlzIHNldHRpbmcgb3ZlcnJpZGVzIHRoZSBkZWZhdWx0IGNyb3NzT3JpZ2luIHNwZWNpZmllci5cbiAgICAgKiBGb3IgbW9yZSBkZXRhaWxzIG9uIGNyb3NzT3JpZ2luIGFuZCBpdHMgdXNlLCBzZWVcbiAgICAgKiBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9BUEkvSFRNTEltYWdlRWxlbWVudC9jcm9zc09yaWdpbi5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGNvbnN0IGFzc2V0ID0gbmV3IHBjLkFzc2V0KFwiYSB0ZXh0dXJlXCIsIFwidGV4dHVyZVwiLCB7XG4gICAgICogICAgIHVybDogXCJodHRwOi8vZXhhbXBsZS5jb20vbXkvYXNzZXRzL2hlcmUvdGV4dHVyZS5wbmdcIlxuICAgICAqIH0pO1xuICAgICAqL1xuICAgIGNvbnN0cnVjdG9yKG5hbWUsIHR5cGUsIGZpbGUsIGRhdGEsIG9wdGlvbnMpIHtcbiAgICAgICAgc3VwZXIoKTtcblxuICAgICAgICB0aGlzLl9pZCA9IGFzc2V0SWRDb3VudGVyLS07XG4gICAgICAgIHRoaXMuX25hbWUgPSBuYW1lIHx8ICcnO1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBUaGUgdHlwZSBvZiB0aGUgYXNzZXQuIE9uZSBvZiBbXCJhbmltYXRpb25cIiwgXCJhdWRpb1wiLCBcImJpbmFyeVwiLCBcImNvbnRhaW5lclwiLCBcImN1YmVtYXBcIixcbiAgICAgICAgICogXCJjc3NcIiwgXCJmb250XCIsIFwianNvblwiLCBcImh0bWxcIiwgXCJtYXRlcmlhbFwiLCBcIm1vZGVsXCIsIFwicmVuZGVyXCIsIFwic2NyaXB0XCIsIFwic2hhZGVyXCIsIFwic3ByaXRlXCIsXG4gICAgICAgICAqIFwidGVtcGxhdGVcIiwgXCJ0ZXh0XCIsIFwidGV4dHVyZVwiLCBcInRleHR1cmVhdGxhc1wiXVxuICAgICAgICAgKlxuICAgICAgICAgKiBAdHlwZSB7KFwiYW5pbWF0aW9uXCJ8XCJhdWRpb1wifFwiYmluYXJ5XCJ8XCJjb250YWluZXJcInxcImN1YmVtYXBcInxcImNzc1wifFwiZm9udFwifFwianNvblwifFwiaHRtbFwifFwibWF0ZXJpYWxcInxcIm1vZGVsXCJ8XCJyZW5kZXJcInxcInNjcmlwdFwifFwic2hhZGVyXCJ8XCJzcHJpdGVcInxcInRlbXBsYXRlXCJ8XCJ0ZXh0XCJ8XCJ0ZXh0dXJlXCJ8XCJ0ZXh0dXJlYXRsYXNcIil9XG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLnR5cGUgPSB0eXBlO1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBBc3NldCB0YWdzLiBFbmFibGVzIGZpbmRpbmcgb2YgYXNzZXRzIGJ5IHRhZ3MgdXNpbmcgdGhlIHtAbGluayBBc3NldFJlZ2lzdHJ5I2ZpbmRCeVRhZ30gbWV0aG9kLlxuICAgICAgICAgKlxuICAgICAgICAgKiBAdHlwZSB7VGFnc31cbiAgICAgICAgICovXG4gICAgICAgIHRoaXMudGFncyA9IG5ldyBUYWdzKHRoaXMpO1xuXG4gICAgICAgIHRoaXMuX3ByZWxvYWQgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fZmlsZSA9IG51bGw7XG4gICAgICAgIHRoaXMuX2RhdGEgPSBkYXRhIHx8IHsgfTtcblxuICAgICAgICAvKipcbiAgICAgICAgICogT3B0aW9uYWwgSlNPTiBkYXRhIHRoYXQgY29udGFpbnMgdGhlIGFzc2V0IGhhbmRsZXIgb3B0aW9ucy5cbiAgICAgICAgICpcbiAgICAgICAgICogQHR5cGUge29iamVjdH1cbiAgICAgICAgICovXG4gICAgICAgIHRoaXMub3B0aW9ucyA9IG9wdGlvbnMgfHwgeyB9O1xuXG4gICAgICAgIC8vIFRoaXMgaXMgd2hlcmUgdGhlIGxvYWRlZCByZXNvdXJjZShzKSB3aWxsIGJlXG4gICAgICAgIHRoaXMuX3Jlc291cmNlcyA9IFtdO1xuXG4gICAgICAgIC8vIGEgc3RyaW5nLWFzc2V0SWQgZGljdGlvbmFyeSB0aGF0IG1hcHNcbiAgICAgICAgLy8gbG9jYWxlIHRvIGFzc2V0IGlkXG4gICAgICAgIHRoaXMuX2kxOG4gPSB7fTtcblxuICAgICAgICAvKipcbiAgICAgICAgICogVHJ1ZSBpZiB0aGUgYXNzZXQgaGFzIGZpbmlzaGVkIGF0dGVtcHRpbmcgdG8gbG9hZCB0aGUgcmVzb3VyY2UuIEl0IGlzIG5vdCBndWFyYW50ZWVkXG4gICAgICAgICAqIHRoYXQgdGhlIHJlc291cmNlcyBhcmUgYXZhaWxhYmxlIGFzIHRoZXJlIGNvdWxkIGhhdmUgYmVlbiBhIG5ldHdvcmsgZXJyb3IuXG4gICAgICAgICAqXG4gICAgICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5sb2FkZWQgPSBmYWxzZTtcblxuICAgICAgICAvKipcbiAgICAgICAgICogVHJ1ZSBpZiB0aGUgcmVzb3VyY2UgaXMgY3VycmVudGx5IGJlaW5nIGxvYWRlZC5cbiAgICAgICAgICpcbiAgICAgICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLmxvYWRpbmcgPSBmYWxzZTtcblxuICAgICAgICAvKipcbiAgICAgICAgICogVGhlIGFzc2V0IHJlZ2lzdHJ5IHRoYXQgdGhpcyBBc3NldCBiZWxvbmdzIHRvLlxuICAgICAgICAgKlxuICAgICAgICAgKiBAdHlwZSB7aW1wb3J0KCcuL2Fzc2V0LXJlZ2lzdHJ5LmpzJykuQXNzZXRSZWdpc3RyeXxudWxsfVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5yZWdpc3RyeSA9IG51bGw7XG5cbiAgICAgICAgaWYgKGZpbGUpIHRoaXMuZmlsZSA9IGZpbGU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRmlyZWQgd2hlbiB0aGUgYXNzZXQgaGFzIGNvbXBsZXRlZCBsb2FkaW5nLlxuICAgICAqXG4gICAgICogQGV2ZW50IEFzc2V0I2xvYWRcbiAgICAgKiBAcGFyYW0ge0Fzc2V0fSBhc3NldCAtIFRoZSBhc3NldCB0aGF0IHdhcyBsb2FkZWQuXG4gICAgICovXG5cbiAgICAvKipcbiAgICAgKiBGaXJlZCBqdXN0IGJlZm9yZSB0aGUgYXNzZXQgdW5sb2FkcyB0aGUgcmVzb3VyY2UuIFRoaXMgYWxsb3dzIGZvciB0aGUgb3Bwb3J0dW5pdHkgdG8gcHJlcGFyZVxuICAgICAqIGZvciBhbiBhc3NldCB0aGF0IHdpbGwgYmUgdW5sb2FkZWQuIEUuZy4gQ2hhbmdpbmcgdGhlIHRleHR1cmUgb2YgYSBtb2RlbCB0byBhIGRlZmF1bHQgYmVmb3JlXG4gICAgICogdGhlIG9uZSBpdCB3YXMgdXNpbmcgaXMgdW5sb2FkZWQuXG4gICAgICpcbiAgICAgKiBAZXZlbnQgQXNzZXQjdW5sb2FkXG4gICAgICogQHBhcmFtIHtBc3NldH0gYXNzZXQgLSBUaGUgYXNzZXQgdGhhdCBpcyBkdWUgdG8gYmUgdW5sb2FkZWQuXG4gICAgICovXG5cbiAgICAvKipcbiAgICAgKiBGaXJlZCB3aGVuIHRoZSBhc3NldCBpcyByZW1vdmVkIGZyb20gdGhlIGFzc2V0IHJlZ2lzdHJ5LlxuICAgICAqXG4gICAgICogQGV2ZW50IEFzc2V0I3JlbW92ZVxuICAgICAqIEBwYXJhbSB7QXNzZXR9IGFzc2V0IC0gVGhlIGFzc2V0IHRoYXQgd2FzIHJlbW92ZWQuXG4gICAgICovXG5cbiAgICAvKipcbiAgICAgKiBGaXJlZCBpZiB0aGUgYXNzZXQgZW5jb3VudGVycyBhbiBlcnJvciB3aGlsZSBsb2FkaW5nLlxuICAgICAqXG4gICAgICogQGV2ZW50IEFzc2V0I2Vycm9yXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IGVyciAtIFRoZSBlcnJvciBtZXNzYWdlLlxuICAgICAqIEBwYXJhbSB7QXNzZXR9IGFzc2V0IC0gVGhlIGFzc2V0IHRoYXQgZ2VuZXJhdGVkIHRoZSBlcnJvci5cbiAgICAgKi9cblxuICAgIC8qKlxuICAgICAqIEZpcmVkIHdoZW4gb25lIG9mIHRoZSBhc3NldCBwcm9wZXJ0aWVzIGBmaWxlYCwgYGRhdGFgLCBgcmVzb3VyY2VgIG9yIGByZXNvdXJjZXNgIGlzIGNoYW5nZWQuXG4gICAgICpcbiAgICAgKiBAZXZlbnQgQXNzZXQjY2hhbmdlXG4gICAgICogQHBhcmFtIHtBc3NldH0gYXNzZXQgLSBUaGUgYXNzZXQgdGhhdCB3YXMgbG9hZGVkLlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBwcm9wZXJ0eSAtIFRoZSBuYW1lIG9mIHRoZSBwcm9wZXJ0eSB0aGF0IGNoYW5nZWQuXG4gICAgICogQHBhcmFtIHsqfSB2YWx1ZSAtIFRoZSBuZXcgcHJvcGVydHkgdmFsdWUuXG4gICAgICogQHBhcmFtIHsqfSBvbGRWYWx1ZSAtIFRoZSBvbGQgcHJvcGVydHkgdmFsdWUuXG4gICAgICovXG5cbiAgICAvKipcbiAgICAgKiBGaXJlZCB3aGVuIHdlIGFkZCBhIG5ldyBsb2NhbGl6ZWQgYXNzZXQgaWQgdG8gdGhlIGFzc2V0LlxuICAgICAqXG4gICAgICogQGV2ZW50IEFzc2V0I2FkZDpsb2NhbGl6ZWRcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gbG9jYWxlIC0gVGhlIGxvY2FsZS5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gYXNzZXRJZCAtIFRoZSBhc3NldCBpZCB3ZSBhZGRlZC5cbiAgICAgKi9cblxuICAgIC8qKlxuICAgICAqIEZpcmVkIHdoZW4gd2UgcmVtb3ZlIGEgbG9jYWxpemVkIGFzc2V0IGlkIGZyb20gdGhlIGFzc2V0LlxuICAgICAqXG4gICAgICogQGV2ZW50IEFzc2V0I3JlbW92ZTpsb2NhbGl6ZWRcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gbG9jYWxlIC0gVGhlIGxvY2FsZS5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gYXNzZXRJZCAtIFRoZSBhc3NldCBpZCB3ZSByZW1vdmVkLlxuICAgICAqL1xuXG4gICAgLyoqXG4gICAgICogVGhlIGFzc2V0IGlkLlxuICAgICAqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKi9cbiAgICBzZXQgaWQodmFsdWUpIHtcbiAgICAgICAgdGhpcy5faWQgPSB2YWx1ZTtcbiAgICB9XG5cbiAgICBnZXQgaWQoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9pZDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUaGUgYXNzZXQgbmFtZS5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtzdHJpbmd9XG4gICAgICovXG4gICAgc2V0IG5hbWUodmFsdWUpIHtcbiAgICAgICAgaWYgKHRoaXMuX25hbWUgPT09IHZhbHVlKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICBjb25zdCBvbGQgPSB0aGlzLl9uYW1lO1xuICAgICAgICB0aGlzLl9uYW1lID0gdmFsdWU7XG4gICAgICAgIHRoaXMuZmlyZSgnbmFtZScsIHRoaXMsIHRoaXMuX25hbWUsIG9sZCk7XG4gICAgfVxuXG4gICAgZ2V0IG5hbWUoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9uYW1lO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRoZSBmaWxlIGRldGFpbHMgb3IgbnVsbCBpZiBubyBmaWxlLlxuICAgICAqXG4gICAgICogQHR5cGUge29iamVjdH1cbiAgICAgKi9cbiAgICBzZXQgZmlsZSh2YWx1ZSkge1xuICAgICAgICAvLyBpZiB2YWx1ZSBjb250YWlucyB2YXJpYW50cywgY2hvb3NlIHRoZSBjb3JyZWN0IHZhcmlhbnQgZmlyc3RcbiAgICAgICAgaWYgKHZhbHVlICYmIHZhbHVlLnZhcmlhbnRzICYmIFsndGV4dHVyZScsICd0ZXh0dXJlYXRsYXMnLCAnYnVuZGxlJ10uaW5kZXhPZih0aGlzLnR5cGUpICE9PSAtMSkge1xuICAgICAgICAgICAgLy8gc2VhcmNoIGZvciBhY3RpdmUgdmFyaWFudFxuICAgICAgICAgICAgY29uc3QgYXBwID0gdGhpcy5yZWdpc3RyeT8uX2xvYWRlcj8uX2FwcCB8fCBnZXRBcHBsaWNhdGlvbigpO1xuICAgICAgICAgICAgY29uc3QgZGV2aWNlID0gYXBwPy5ncmFwaGljc0RldmljZTtcbiAgICAgICAgICAgIGlmIChkZXZpY2UpIHtcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMCwgbGVuID0gVkFSSUFOVF9ERUZBVUxUX1BSSU9SSVRZLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHZhcmlhbnQgPSBWQVJJQU5UX0RFRkFVTFRfUFJJT1JJVFlbaV07XG4gICAgICAgICAgICAgICAgICAgIC8vIGlmIHRoZSBkZXZpY2Ugc3VwcG9ydHMgdGhlIHZhcmlhbnRcbiAgICAgICAgICAgICAgICAgICAgaWYgKHZhbHVlLnZhcmlhbnRzW3ZhcmlhbnRdICYmIGRldmljZVtWQVJJQU5UX1NVUFBPUlRbdmFyaWFudF1dKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZSA9IHZhbHVlLnZhcmlhbnRzW3ZhcmlhbnRdO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAvLyBpZiB0aGUgdmFyaWFudCBkb2VzIG5vdCBleGlzdCBidXQgdGhlIGFzc2V0IGlzIGluIGEgYnVuZGxlXG4gICAgICAgICAgICAgICAgICAgIC8vIGFuZCB0aGUgYnVuZGxlIGNvbnRhaW4gYXNzZXRzIHdpdGggdGhpcyB2YXJpYW50IHRoZW4gcmV0dXJuIHRoZSBkZWZhdWx0XG4gICAgICAgICAgICAgICAgICAgIC8vIGZpbGUgZm9yIHRoZSBhc3NldFxuICAgICAgICAgICAgICAgICAgICBpZiAoYXBwLmVuYWJsZUJ1bmRsZXMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGJ1bmRsZXMgPSBhcHAuYnVuZGxlcy5saXN0QnVuZGxlc0ZvckFzc2V0KHRoaXMpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGJ1bmRsZXMgJiYgYnVuZGxlcy5maW5kKChiKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGI/LmZpbGU/LnZhcmlhbnRzW3ZhcmlhbnRdO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IG9sZEZpbGUgPSB0aGlzLl9maWxlO1xuICAgICAgICBjb25zdCBuZXdGaWxlID0gdmFsdWUgPyBuZXcgQXNzZXRGaWxlKHZhbHVlLnVybCwgdmFsdWUuZmlsZW5hbWUsIHZhbHVlLmhhc2gsIHZhbHVlLnNpemUsIHZhbHVlLm9wdCwgdmFsdWUuY29udGVudHMpIDogbnVsbDtcblxuICAgICAgICBpZiAoISFuZXdGaWxlICE9PSAhIW9sZEZpbGUgfHwgKG5ld0ZpbGUgJiYgIW5ld0ZpbGUuZXF1YWxzKG9sZEZpbGUpKSkge1xuICAgICAgICAgICAgdGhpcy5fZmlsZSA9IG5ld0ZpbGU7XG4gICAgICAgICAgICB0aGlzLmZpcmUoJ2NoYW5nZScsIHRoaXMsICdmaWxlJywgbmV3RmlsZSwgb2xkRmlsZSk7XG4gICAgICAgICAgICB0aGlzLnJlbG9hZCgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2V0IGZpbGUoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9maWxlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE9wdGlvbmFsIEpTT04gZGF0YSB0aGF0IGNvbnRhaW5zIGVpdGhlciB0aGUgY29tcGxldGUgcmVzb3VyY2UgZGF0YS4gKGUuZy4gaW4gdGhlIGNhc2Ugb2YgYVxuICAgICAqIG1hdGVyaWFsKSBvciBhZGRpdGlvbmFsIGRhdGEgKGUuZy4gaW4gdGhlIGNhc2Ugb2YgYSBtb2RlbCBpdCBjb250YWlucyBtYXBwaW5ncyBmcm9tIG1lc2ggdG9cbiAgICAgKiBtYXRlcmlhbCkuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7b2JqZWN0fVxuICAgICAqL1xuICAgIHNldCBkYXRhKHZhbHVlKSB7XG4gICAgICAgIC8vIGZpcmUgY2hhbmdlIGV2ZW50IHdoZW4gZGF0YSBjaGFuZ2VzXG4gICAgICAgIC8vIGJlY2F1c2UgdGhlIGFzc2V0IG1pZ2h0IG5lZWQgcmVsb2FkaW5nIGlmIHRoYXQgaGFwcGVuc1xuICAgICAgICBjb25zdCBvbGQgPSB0aGlzLl9kYXRhO1xuICAgICAgICB0aGlzLl9kYXRhID0gdmFsdWU7XG4gICAgICAgIGlmICh2YWx1ZSAhPT0gb2xkKSB7XG4gICAgICAgICAgICB0aGlzLmZpcmUoJ2NoYW5nZScsIHRoaXMsICdkYXRhJywgdmFsdWUsIG9sZCk7XG5cbiAgICAgICAgICAgIGlmICh0aGlzLmxvYWRlZClcbiAgICAgICAgICAgICAgICB0aGlzLnJlZ2lzdHJ5Ll9sb2FkZXIucGF0Y2godGhpcywgdGhpcy5yZWdpc3RyeSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBnZXQgZGF0YSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2RhdGE7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQSByZWZlcmVuY2UgdG8gdGhlIHJlc291cmNlIHdoZW4gdGhlIGFzc2V0IGlzIGxvYWRlZC4gZS5nLiBhIHtAbGluayBUZXh0dXJlfSBvciBhIHtAbGluayBNb2RlbH0uXG4gICAgICpcbiAgICAgKiBAdHlwZSB7b2JqZWN0fVxuICAgICAqL1xuICAgIHNldCByZXNvdXJjZSh2YWx1ZSkge1xuICAgICAgICBjb25zdCBfb2xkID0gdGhpcy5fcmVzb3VyY2VzWzBdO1xuICAgICAgICB0aGlzLl9yZXNvdXJjZXNbMF0gPSB2YWx1ZTtcbiAgICAgICAgdGhpcy5maXJlKCdjaGFuZ2UnLCB0aGlzLCAncmVzb3VyY2UnLCB2YWx1ZSwgX29sZCk7XG4gICAgfVxuXG4gICAgZ2V0IHJlc291cmNlKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fcmVzb3VyY2VzWzBdO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEEgcmVmZXJlbmNlIHRvIHRoZSByZXNvdXJjZXMgb2YgdGhlIGFzc2V0IHdoZW4gaXQncyBsb2FkZWQuIEFuIGFzc2V0IGNhbiBob2xkIG1vcmUgcnVudGltZVxuICAgICAqIHJlc291cmNlcyB0aGFuIG9uZSBlLmcuIGN1YmVtYXBzLlxuICAgICAqXG4gICAgICogQHR5cGUge29iamVjdFtdfVxuICAgICAqL1xuICAgIHNldCByZXNvdXJjZXModmFsdWUpIHtcbiAgICAgICAgY29uc3QgX29sZCA9IHRoaXMuX3Jlc291cmNlcztcbiAgICAgICAgdGhpcy5fcmVzb3VyY2VzID0gdmFsdWU7XG4gICAgICAgIHRoaXMuZmlyZSgnY2hhbmdlJywgdGhpcywgJ3Jlc291cmNlcycsIHZhbHVlLCBfb2xkKTtcbiAgICB9XG5cbiAgICBnZXQgcmVzb3VyY2VzKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fcmVzb3VyY2VzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIElmIHRydWUgdGhlIGFzc2V0IHdpbGwgYmUgbG9hZGVkIGR1cmluZyB0aGUgcHJlbG9hZCBwaGFzZSBvZiBhcHBsaWNhdGlvbiBzZXQgdXAuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICAgKi9cbiAgICBzZXQgcHJlbG9hZCh2YWx1ZSkge1xuICAgICAgICB2YWx1ZSA9ICEhdmFsdWU7XG4gICAgICAgIGlmICh0aGlzLl9wcmVsb2FkID09PSB2YWx1ZSlcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICB0aGlzLl9wcmVsb2FkID0gdmFsdWU7XG4gICAgICAgIGlmICh0aGlzLl9wcmVsb2FkICYmICF0aGlzLmxvYWRlZCAmJiAhdGhpcy5sb2FkaW5nICYmIHRoaXMucmVnaXN0cnkpXG4gICAgICAgICAgICB0aGlzLnJlZ2lzdHJ5LmxvYWQodGhpcyk7XG4gICAgfVxuXG4gICAgZ2V0IHByZWxvYWQoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9wcmVsb2FkO1xuICAgIH1cblxuICAgIHNldCBsb2FkRmFjZXModmFsdWUpIHtcbiAgICAgICAgdmFsdWUgPSAhIXZhbHVlO1xuICAgICAgICBpZiAoIXRoaXMuaGFzT3duUHJvcGVydHkoJ19sb2FkRmFjZXMnKSB8fCB2YWx1ZSAhPT0gdGhpcy5fbG9hZEZhY2VzKSB7XG4gICAgICAgICAgICB0aGlzLl9sb2FkRmFjZXMgPSB2YWx1ZTtcblxuICAgICAgICAgICAgLy8gdGhlIGxvYWRGYWNlcyBwcm9wZXJ0eSBzaG91bGQgYmUgcGFydCBvZiB0aGUgYXNzZXQgZGF0YSBibG9ja1xuICAgICAgICAgICAgLy8gYmVjYXVzZSBjaGFuZ2luZyB0aGUgZmxhZyBzaG91bGQgcmVzdWx0IGluIGFzc2V0IHBhdGNoIGJlaW5nIGludm9rZWQuXG4gICAgICAgICAgICAvLyBoZXJlIHdlIG11c3QgaW52b2tlIGl0IG1hbnVhbGx5IGluc3RlYWQuXG4gICAgICAgICAgICBpZiAodGhpcy5sb2FkZWQpXG4gICAgICAgICAgICAgICAgdGhpcy5yZWdpc3RyeS5fbG9hZGVyLnBhdGNoKHRoaXMsIHRoaXMucmVnaXN0cnkpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2V0IGxvYWRGYWNlcygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2xvYWRGYWNlcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm4gdGhlIFVSTCByZXF1aXJlZCB0byBmZXRjaCB0aGUgZmlsZSBmb3IgdGhpcyBhc3NldC5cbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtzdHJpbmd8bnVsbH0gVGhlIFVSTC4gUmV0dXJucyBudWxsIGlmIHRoZSBhc3NldCBoYXMgbm8gYXNzb2NpYXRlZCBmaWxlLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogY29uc3QgYXNzZXRzID0gYXBwLmFzc2V0cy5maW5kKFwiTXkgSW1hZ2VcIiwgXCJ0ZXh0dXJlXCIpO1xuICAgICAqIGNvbnN0IGltZyA9IFwiJmx0O2ltZyBzcmM9J1wiICsgYXNzZXRzWzBdLmdldEZpbGVVcmwoKSArIFwiJyZndDtcIjtcbiAgICAgKi9cbiAgICBnZXRGaWxlVXJsKCkge1xuICAgICAgICBjb25zdCBmaWxlID0gdGhpcy5maWxlO1xuXG4gICAgICAgIGlmICghZmlsZSB8fCAhZmlsZS51cmwpXG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcblxuICAgICAgICBsZXQgdXJsID0gZmlsZS51cmw7XG5cbiAgICAgICAgaWYgKHRoaXMucmVnaXN0cnkgJiYgdGhpcy5yZWdpc3RyeS5wcmVmaXggJiYgIUFCU09MVVRFX1VSTC50ZXN0KHVybCkpXG4gICAgICAgICAgICB1cmwgPSB0aGlzLnJlZ2lzdHJ5LnByZWZpeCArIHVybDtcblxuICAgICAgICAvLyBhZGQgZmlsZSBoYXNoIHRvIGF2b2lkIGhhcmQtY2FjaGluZyBwcm9ibGVtc1xuICAgICAgICBpZiAodGhpcy50eXBlICE9PSAnc2NyaXB0JyAmJiBmaWxlLmhhc2gpIHtcbiAgICAgICAgICAgIGNvbnN0IHNlcGFyYXRvciA9IHVybC5pbmRleE9mKCc/JykgIT09IC0xID8gJyYnIDogJz8nO1xuICAgICAgICAgICAgdXJsICs9IHNlcGFyYXRvciArICd0PScgKyBmaWxlLmhhc2g7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdXJsO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENvbnN0cnVjdCBhbiBhc3NldCBVUkwgZnJvbSB0aGlzIGFzc2V0J3MgbG9jYXRpb24gYW5kIGEgcmVsYXRpdmUgcGF0aC4gSWYgdGhlIHJlbGF0aXZlUGF0aFxuICAgICAqIGlzIGEgYmxvYiBvciBCYXNlNjQgVVJJLCB0aGVuIHJldHVybiB0aGF0IGluc3RlYWQuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gcmVsYXRpdmVQYXRoIC0gVGhlIHJlbGF0aXZlIHBhdGggdG8gYmUgY29uY2F0ZW5hdGVkIHRvIHRoaXMgYXNzZXQncyBiYXNlIHVybC5cbiAgICAgKiBAcmV0dXJucyB7c3RyaW5nfSBSZXN1bHRpbmcgVVJMIG9mIHRoZSBhc3NldC5cbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgZ2V0QWJzb2x1dGVVcmwocmVsYXRpdmVQYXRoKSB7XG4gICAgICAgIGlmIChyZWxhdGl2ZVBhdGguc3RhcnRzV2l0aCgnYmxvYjonKSB8fCByZWxhdGl2ZVBhdGguc3RhcnRzV2l0aCgnZGF0YTonKSkge1xuICAgICAgICAgICAgcmV0dXJuIHJlbGF0aXZlUGF0aDtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGJhc2UgPSBwYXRoLmdldERpcmVjdG9yeSh0aGlzLmZpbGUudXJsKTtcbiAgICAgICAgcmV0dXJuIHBhdGguam9pbihiYXNlLCByZWxhdGl2ZVBhdGgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIGFzc2V0IGlkIG9mIHRoZSBhc3NldCB0aGF0IGNvcnJlc3BvbmRzIHRvIHRoZSBzcGVjaWZpZWQgbG9jYWxlLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IGxvY2FsZSAtIFRoZSBkZXNpcmVkIGxvY2FsZSBlLmcuIEFyLUFSLlxuICAgICAqIEByZXR1cm5zIHtudW1iZXJ9IEFuIGFzc2V0IGlkIG9yIG51bGwgaWYgdGhlcmUgaXMgbm8gYXNzZXQgc3BlY2lmaWVkIGZvciB0aGUgZGVzaXJlZCBsb2NhbGUuXG4gICAgICogQGlnbm9yZVxuICAgICAqL1xuICAgIGdldExvY2FsaXplZEFzc2V0SWQobG9jYWxlKSB7XG4gICAgICAgIC8vIHRyaWVzIHRvIGZpbmQgZWl0aGVyIHRoZSBkZXNpcmVkIGxvY2FsZSBvciBhIGZhbGxiYWNrIGxvY2FsZVxuICAgICAgICBsb2NhbGUgPSBmaW5kQXZhaWxhYmxlTG9jYWxlKGxvY2FsZSwgdGhpcy5faTE4bik7XG4gICAgICAgIHJldHVybiB0aGlzLl9pMThuW2xvY2FsZV0gfHwgbnVsbDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBZGRzIGEgcmVwbGFjZW1lbnQgYXNzZXQgaWQgZm9yIHRoZSBzcGVjaWZpZWQgbG9jYWxlLiBXaGVuIHRoZSBsb2NhbGUgaW5cbiAgICAgKiB7QGxpbmsgQXBwbGljYXRpb24jaTE4bn0gY2hhbmdlcyB0aGVuIHJlZmVyZW5jZXMgdG8gdGhpcyBhc3NldCB3aWxsIGJlIHJlcGxhY2VkIHdpdGggdGhlXG4gICAgICogc3BlY2lmaWVkIGFzc2V0IGlkLiAoQ3VycmVudGx5IG9ubHkgc3VwcG9ydGVkIGJ5IHRoZSB7QGxpbmsgRWxlbWVudENvbXBvbmVudH0pLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IGxvY2FsZSAtIFRoZSBsb2NhbGUgZS5nLiBBci1BUi5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gYXNzZXRJZCAtIFRoZSBhc3NldCBpZC5cbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgYWRkTG9jYWxpemVkQXNzZXRJZChsb2NhbGUsIGFzc2V0SWQpIHtcbiAgICAgICAgdGhpcy5faTE4bltsb2NhbGVdID0gYXNzZXRJZDtcbiAgICAgICAgdGhpcy5maXJlKCdhZGQ6bG9jYWxpemVkJywgbG9jYWxlLCBhc3NldElkKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZW1vdmVzIGEgbG9jYWxpemVkIGFzc2V0LlxuICAgICAqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IGxvY2FsZSAtIFRoZSBsb2NhbGUgZS5nLiBBci1BUi5cbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgcmVtb3ZlTG9jYWxpemVkQXNzZXRJZChsb2NhbGUpIHtcbiAgICAgICAgY29uc3QgYXNzZXRJZCA9IHRoaXMuX2kxOG5bbG9jYWxlXTtcbiAgICAgICAgaWYgKGFzc2V0SWQpIHtcbiAgICAgICAgICAgIGRlbGV0ZSB0aGlzLl9pMThuW2xvY2FsZV07XG4gICAgICAgICAgICB0aGlzLmZpcmUoJ3JlbW92ZTpsb2NhbGl6ZWQnLCBsb2NhbGUsIGFzc2V0SWQpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVGFrZSBhIGNhbGxiYWNrIHdoaWNoIGlzIGNhbGxlZCBhcyBzb29uIGFzIHRoZSBhc3NldCBpcyBsb2FkZWQuIElmIHRoZSBhc3NldCBpcyBhbHJlYWR5XG4gICAgICogbG9hZGVkIHRoZSBjYWxsYmFjayBpcyBjYWxsZWQgc3RyYWlnaHQgYXdheS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7QXNzZXRSZWFkeUNhbGxiYWNrfSBjYWxsYmFjayAtIFRoZSBmdW5jdGlvbiBjYWxsZWQgd2hlbiB0aGUgYXNzZXQgaXMgcmVhZHkuIFBhc3NlZFxuICAgICAqIHRoZSAoYXNzZXQpIGFyZ3VtZW50cy5cbiAgICAgKiBAcGFyYW0ge29iamVjdH0gW3Njb3BlXSAtIFNjb3BlIG9iamVjdCB0byB1c2Ugd2hlbiBjYWxsaW5nIHRoZSBjYWxsYmFjay5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGNvbnN0IGFzc2V0ID0gYXBwLmFzc2V0cy5maW5kKFwiTXkgQXNzZXRcIik7XG4gICAgICogYXNzZXQucmVhZHkoZnVuY3Rpb24gKGFzc2V0KSB7XG4gICAgICogICAvLyBhc3NldCBsb2FkZWRcbiAgICAgKiB9KTtcbiAgICAgKiBhcHAuYXNzZXRzLmxvYWQoYXNzZXQpO1xuICAgICAqL1xuICAgIHJlYWR5KGNhbGxiYWNrLCBzY29wZSkge1xuICAgICAgICBzY29wZSA9IHNjb3BlIHx8IHRoaXM7XG5cbiAgICAgICAgaWYgKHRoaXMubG9hZGVkKSB7XG4gICAgICAgICAgICBjYWxsYmFjay5jYWxsKHNjb3BlLCB0aGlzKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMub25jZSgnbG9hZCcsIGZ1bmN0aW9uIChhc3NldCkge1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrLmNhbGwoc2NvcGUsIGFzc2V0KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmVsb2FkKCkge1xuICAgICAgICAvLyBubyBuZWVkIHRvIGJlIHJlbG9hZGVkXG4gICAgICAgIGlmICh0aGlzLmxvYWRlZCkge1xuICAgICAgICAgICAgdGhpcy5sb2FkZWQgPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMucmVnaXN0cnkubG9hZCh0aGlzKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIERlc3Ryb3lzIHRoZSBhc3NvY2lhdGVkIHJlc291cmNlIGFuZCBtYXJrcyBhc3NldCBhcyB1bmxvYWRlZC5cbiAgICAgKlxuICAgICAqIEBleGFtcGxlXG4gICAgICogY29uc3QgYXNzZXQgPSBhcHAuYXNzZXRzLmZpbmQoXCJNeSBBc3NldFwiKTtcbiAgICAgKiBhc3NldC51bmxvYWQoKTtcbiAgICAgKiAvLyBhc3NldC5yZXNvdXJjZSBpcyBudWxsXG4gICAgICovXG4gICAgdW5sb2FkKCkge1xuICAgICAgICBpZiAoIXRoaXMubG9hZGVkICYmIHRoaXMuX3Jlc291cmNlcy5sZW5ndGggPT09IDApXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgdGhpcy5maXJlKCd1bmxvYWQnLCB0aGlzKTtcbiAgICAgICAgdGhpcy5yZWdpc3RyeS5maXJlKCd1bmxvYWQ6JyArIHRoaXMuaWQsIHRoaXMpO1xuXG4gICAgICAgIGNvbnN0IG9sZCA9IHRoaXMuX3Jlc291cmNlcztcblxuICAgICAgICAvLyBjbGVhciByZXNvdXJjZXMgb24gdGhlIGFzc2V0XG4gICAgICAgIHRoaXMucmVzb3VyY2VzID0gW107XG4gICAgICAgIHRoaXMubG9hZGVkID0gZmFsc2U7XG5cbiAgICAgICAgLy8gcmVtb3ZlIHJlc291cmNlIGZyb20gbG9hZGVyIGNhY2hlXG4gICAgICAgIGlmICh0aGlzLmZpbGUpIHtcbiAgICAgICAgICAgIHRoaXMucmVnaXN0cnkuX2xvYWRlci5jbGVhckNhY2hlKHRoaXMuZ2V0RmlsZVVybCgpLCB0aGlzLnR5cGUpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gZGVzdHJveSByZXNvdXJjZXNcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBvbGQubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgICAgIGNvbnN0IHJlc291cmNlID0gb2xkW2ldO1xuICAgICAgICAgICAgaWYgKHJlc291cmNlICYmIHJlc291cmNlLmRlc3Ryb3kpIHtcbiAgICAgICAgICAgICAgICByZXNvdXJjZS5kZXN0cm95KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBIZWxwZXIgZnVuY3Rpb24gdG8gcmVzb2x2ZSBhc3NldCBmaWxlIGRhdGEgYW5kIHJldHVybiB0aGUgY29udGVudHMgYXMgYW4gQXJyYXlCdWZmZXIuIElmIHRoZVxuICAgICAqIGFzc2V0IGZpbGUgY29udGVudHMgYXJlIHByZXNlbnQsIHRoYXQgaXMgcmV0dXJuZWQuIE90aGVyd2lzZSB0aGUgZmlsZSBkYXRhIGlzIGJlIGRvd25sb2FkZWRcbiAgICAgKiB2aWEgaHR0cC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBsb2FkVXJsIC0gVGhlIFVSTCBhcyBwYXNzZWQgaW50byB0aGUgaGFuZGxlclxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuLi9oYW5kbGVycy9sb2FkZXIuanMnKS5SZXNvdXJjZUxvYWRlckNhbGxiYWNrfSBjYWxsYmFjayAtIFRoZSBjYWxsYmFja1xuICAgICAqIGZ1bmN0aW9uIHRvIHJlY2VpdmUgcmVzdWx0cy5cbiAgICAgKiBAcGFyYW0ge0Fzc2V0fSBbYXNzZXRdIC0gVGhlIGFzc2V0XG4gICAgICogQHBhcmFtIHtudW1iZXJ9IG1heFJldHJpZXMgLSBOdW1iZXIgb2YgcmV0cmllcyBpZiBodHRwIGRvd25sb2FkIGlzIHJlcXVpcmVkXG4gICAgICogQGlnbm9yZVxuICAgICAqL1xuICAgIHN0YXRpYyBmZXRjaEFycmF5QnVmZmVyKGxvYWRVcmwsIGNhbGxiYWNrLCBhc3NldCwgbWF4UmV0cmllcyA9IDApIHtcbiAgICAgICAgaWYgKGFzc2V0Py5maWxlPy5jb250ZW50cykge1xuICAgICAgICAgICAgLy8gYXNzZXQgZmlsZSBjb250ZW50cyB3ZXJlIHByb3ZpZGVkXG4gICAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICAgICAgICBjYWxsYmFjayhudWxsLCBhc3NldC5maWxlLmNvbnRlbnRzKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gYXNzZXQgY29udGVudHMgbXVzdCBiZSBkb3dubG9hZGVkXG4gICAgICAgICAgICBodHRwLmdldChsb2FkVXJsLCB7XG4gICAgICAgICAgICAgICAgY2FjaGU6IHRydWUsXG4gICAgICAgICAgICAgICAgcmVzcG9uc2VUeXBlOiAnYXJyYXlidWZmZXInLFxuICAgICAgICAgICAgICAgIHJldHJ5OiBtYXhSZXRyaWVzID4gMCxcbiAgICAgICAgICAgICAgICBtYXhSZXRyaWVzOiBtYXhSZXRyaWVzXG4gICAgICAgICAgICB9LCBjYWxsYmFjayk7XG4gICAgICAgIH1cbiAgICB9XG59XG5cbmV4cG9ydCB7IEFzc2V0IH07XG4iXSwibmFtZXMiOlsiYXNzZXRJZENvdW50ZXIiLCJWQVJJQU5UX1NVUFBPUlQiLCJwdnIiLCJkeHQiLCJldGMyIiwiZXRjMSIsImJhc2lzIiwiVkFSSUFOVF9ERUZBVUxUX1BSSU9SSVRZIiwiQXNzZXQiLCJFdmVudEhhbmRsZXIiLCJjb25zdHJ1Y3RvciIsIm5hbWUiLCJ0eXBlIiwiZmlsZSIsImRhdGEiLCJvcHRpb25zIiwiX2lkIiwiX25hbWUiLCJ0YWdzIiwiVGFncyIsIl9wcmVsb2FkIiwiX2ZpbGUiLCJfZGF0YSIsIl9yZXNvdXJjZXMiLCJfaTE4biIsImxvYWRlZCIsImxvYWRpbmciLCJyZWdpc3RyeSIsImlkIiwidmFsdWUiLCJvbGQiLCJmaXJlIiwidmFyaWFudHMiLCJpbmRleE9mIiwiX3RoaXMkcmVnaXN0cnkiLCJhcHAiLCJfbG9hZGVyIiwiX2FwcCIsImdldEFwcGxpY2F0aW9uIiwiZGV2aWNlIiwiZ3JhcGhpY3NEZXZpY2UiLCJpIiwibGVuIiwibGVuZ3RoIiwidmFyaWFudCIsImVuYWJsZUJ1bmRsZXMiLCJidW5kbGVzIiwibGlzdEJ1bmRsZXNGb3JBc3NldCIsImZpbmQiLCJiIiwiX2IkZmlsZSIsIm9sZEZpbGUiLCJuZXdGaWxlIiwiQXNzZXRGaWxlIiwidXJsIiwiZmlsZW5hbWUiLCJoYXNoIiwic2l6ZSIsIm9wdCIsImNvbnRlbnRzIiwiZXF1YWxzIiwicmVsb2FkIiwicGF0Y2giLCJyZXNvdXJjZSIsIl9vbGQiLCJyZXNvdXJjZXMiLCJwcmVsb2FkIiwibG9hZCIsImxvYWRGYWNlcyIsImhhc093blByb3BlcnR5IiwiX2xvYWRGYWNlcyIsImdldEZpbGVVcmwiLCJwcmVmaXgiLCJBQlNPTFVURV9VUkwiLCJ0ZXN0Iiwic2VwYXJhdG9yIiwiZ2V0QWJzb2x1dGVVcmwiLCJyZWxhdGl2ZVBhdGgiLCJzdGFydHNXaXRoIiwiYmFzZSIsInBhdGgiLCJnZXREaXJlY3RvcnkiLCJqb2luIiwiZ2V0TG9jYWxpemVkQXNzZXRJZCIsImxvY2FsZSIsImZpbmRBdmFpbGFibGVMb2NhbGUiLCJhZGRMb2NhbGl6ZWRBc3NldElkIiwiYXNzZXRJZCIsInJlbW92ZUxvY2FsaXplZEFzc2V0SWQiLCJyZWFkeSIsImNhbGxiYWNrIiwic2NvcGUiLCJjYWxsIiwib25jZSIsImFzc2V0IiwidW5sb2FkIiwiY2xlYXJDYWNoZSIsImRlc3Ryb3kiLCJmZXRjaEFycmF5QnVmZmVyIiwibG9hZFVybCIsIm1heFJldHJpZXMiLCJfYXNzZXQkZmlsZSIsInNldFRpbWVvdXQiLCJodHRwIiwiZ2V0IiwiY2FjaGUiLCJyZXNwb25zZVR5cGUiLCJyZXRyeSJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7O0FBWUE7QUFDQSxJQUFJQSxjQUFjLEdBQUcsQ0FBQyxDQUFDLENBQUE7QUFFdkIsTUFBTUMsZUFBZSxHQUFHO0FBQ3BCQyxFQUFBQSxHQUFHLEVBQUUsMkJBQTJCO0FBQ2hDQyxFQUFBQSxHQUFHLEVBQUUsMEJBQTBCO0FBQy9CQyxFQUFBQSxJQUFJLEVBQUUseUJBQXlCO0FBQy9CQyxFQUFBQSxJQUFJLEVBQUUsMEJBQTBCO0VBQ2hDQyxLQUFLLEVBQUUsUUFBUTtBQUNuQixDQUFDLENBQUE7O0FBRUQsTUFBTUMsd0JBQXdCLEdBQUcsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLENBQUE7O0FBRXhFO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLE1BQU1DLEtBQUssU0FBU0MsWUFBWSxDQUFDO0FBQzdCO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0VBQ0lDLFdBQVdBLENBQUNDLElBQUksRUFBRUMsSUFBSSxFQUFFQyxJQUFJLEVBQUVDLElBQUksRUFBRUMsT0FBTyxFQUFFO0FBQ3pDLElBQUEsS0FBSyxFQUFFLENBQUE7QUFFUCxJQUFBLElBQUksQ0FBQ0MsR0FBRyxHQUFHaEIsY0FBYyxFQUFFLENBQUE7QUFDM0IsSUFBQSxJQUFJLENBQUNpQixLQUFLLEdBQUdOLElBQUksSUFBSSxFQUFFLENBQUE7O0FBRXZCO0FBQ1I7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0lBQ1EsSUFBSSxDQUFDQyxJQUFJLEdBQUdBLElBQUksQ0FBQTs7QUFFaEI7QUFDUjtBQUNBO0FBQ0E7QUFDQTtBQUNRLElBQUEsSUFBSSxDQUFDTSxJQUFJLEdBQUcsSUFBSUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFBO0lBRTFCLElBQUksQ0FBQ0MsUUFBUSxHQUFHLEtBQUssQ0FBQTtJQUNyQixJQUFJLENBQUNDLEtBQUssR0FBRyxJQUFJLENBQUE7QUFDakIsSUFBQSxJQUFJLENBQUNDLEtBQUssR0FBR1IsSUFBSSxJQUFJLEVBQUcsQ0FBQTs7QUFFeEI7QUFDUjtBQUNBO0FBQ0E7QUFDQTtBQUNRLElBQUEsSUFBSSxDQUFDQyxPQUFPLEdBQUdBLE9BQU8sSUFBSSxFQUFHLENBQUE7O0FBRTdCO0lBQ0EsSUFBSSxDQUFDUSxVQUFVLEdBQUcsRUFBRSxDQUFBOztBQUVwQjtBQUNBO0FBQ0EsSUFBQSxJQUFJLENBQUNDLEtBQUssR0FBRyxFQUFFLENBQUE7O0FBRWY7QUFDUjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0lBQ1EsSUFBSSxDQUFDQyxNQUFNLEdBQUcsS0FBSyxDQUFBOztBQUVuQjtBQUNSO0FBQ0E7QUFDQTtBQUNBO0lBQ1EsSUFBSSxDQUFDQyxPQUFPLEdBQUcsS0FBSyxDQUFBOztBQUVwQjtBQUNSO0FBQ0E7QUFDQTtBQUNBO0lBQ1EsSUFBSSxDQUFDQyxRQUFRLEdBQUcsSUFBSSxDQUFBO0FBRXBCLElBQUEsSUFBSWQsSUFBSSxFQUFFLElBQUksQ0FBQ0EsSUFBSSxHQUFHQSxJQUFJLENBQUE7QUFDOUIsR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUk7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFSTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUk7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUk7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVJO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVJO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVJO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7RUFDSSxJQUFJZSxFQUFFQSxDQUFDQyxLQUFLLEVBQUU7SUFDVixJQUFJLENBQUNiLEdBQUcsR0FBR2EsS0FBSyxDQUFBO0FBQ3BCLEdBQUE7RUFFQSxJQUFJRCxFQUFFQSxHQUFHO0lBQ0wsT0FBTyxJQUFJLENBQUNaLEdBQUcsQ0FBQTtBQUNuQixHQUFBOztBQUVBO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7RUFDSSxJQUFJTCxJQUFJQSxDQUFDa0IsS0FBSyxFQUFFO0FBQ1osSUFBQSxJQUFJLElBQUksQ0FBQ1osS0FBSyxLQUFLWSxLQUFLLEVBQ3BCLE9BQUE7QUFDSixJQUFBLE1BQU1DLEdBQUcsR0FBRyxJQUFJLENBQUNiLEtBQUssQ0FBQTtJQUN0QixJQUFJLENBQUNBLEtBQUssR0FBR1ksS0FBSyxDQUFBO0FBQ2xCLElBQUEsSUFBSSxDQUFDRSxJQUFJLENBQUMsTUFBTSxFQUFFLElBQUksRUFBRSxJQUFJLENBQUNkLEtBQUssRUFBRWEsR0FBRyxDQUFDLENBQUE7QUFDNUMsR0FBQTtFQUVBLElBQUluQixJQUFJQSxHQUFHO0lBQ1AsT0FBTyxJQUFJLENBQUNNLEtBQUssQ0FBQTtBQUNyQixHQUFBOztBQUVBO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7RUFDSSxJQUFJSixJQUFJQSxDQUFDZ0IsS0FBSyxFQUFFO0FBQ1o7SUFDQSxJQUFJQSxLQUFLLElBQUlBLEtBQUssQ0FBQ0csUUFBUSxJQUFJLENBQUMsU0FBUyxFQUFFLGNBQWMsRUFBRSxRQUFRLENBQUMsQ0FBQ0MsT0FBTyxDQUFDLElBQUksQ0FBQ3JCLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFO0FBQUEsTUFBQSxJQUFBc0IsY0FBQSxDQUFBO0FBQzVGO01BQ0EsTUFBTUMsR0FBRyxHQUFHLENBQUFELENBQUFBLGNBQUEsT0FBSSxDQUFDUCxRQUFRLGNBQUFPLGNBQUEsR0FBYkEsY0FBQSxDQUFlRSxPQUFPLHFCQUF0QkYsY0FBQSxDQUF3QkcsSUFBSSxLQUFJQyxjQUFjLEVBQUUsQ0FBQTtBQUM1RCxNQUFBLE1BQU1DLE1BQU0sR0FBR0osR0FBRyxJQUFIQSxJQUFBQSxHQUFBQSxLQUFBQSxDQUFBQSxHQUFBQSxHQUFHLENBQUVLLGNBQWMsQ0FBQTtBQUNsQyxNQUFBLElBQUlELE1BQU0sRUFBRTtBQUNSLFFBQUEsS0FBSyxJQUFJRSxDQUFDLEdBQUcsQ0FBQyxFQUFFQyxHQUFHLEdBQUduQyx3QkFBd0IsQ0FBQ29DLE1BQU0sRUFBRUYsQ0FBQyxHQUFHQyxHQUFHLEVBQUVELENBQUMsRUFBRSxFQUFFO0FBQ2pFLFVBQUEsTUFBTUcsT0FBTyxHQUFHckMsd0JBQXdCLENBQUNrQyxDQUFDLENBQUMsQ0FBQTtBQUMzQztBQUNBLFVBQUEsSUFBSVosS0FBSyxDQUFDRyxRQUFRLENBQUNZLE9BQU8sQ0FBQyxJQUFJTCxNQUFNLENBQUN0QyxlQUFlLENBQUMyQyxPQUFPLENBQUMsQ0FBQyxFQUFFO0FBQzdEZixZQUFBQSxLQUFLLEdBQUdBLEtBQUssQ0FBQ0csUUFBUSxDQUFDWSxPQUFPLENBQUMsQ0FBQTtBQUMvQixZQUFBLE1BQUE7QUFDSixXQUFBOztBQUVBO0FBQ0E7QUFDQTtVQUNBLElBQUlULEdBQUcsQ0FBQ1UsYUFBYSxFQUFFO1lBQ25CLE1BQU1DLE9BQU8sR0FBR1gsR0FBRyxDQUFDVyxPQUFPLENBQUNDLG1CQUFtQixDQUFDLElBQUksQ0FBQyxDQUFBO0FBQ3JELFlBQUEsSUFBSUQsT0FBTyxJQUFJQSxPQUFPLENBQUNFLElBQUksQ0FBRUMsQ0FBQyxJQUFLO0FBQUEsY0FBQSxJQUFBQyxPQUFBLENBQUE7QUFDL0IsY0FBQSxPQUFPRCxDQUFDLElBQUEsSUFBQSxJQUFBLENBQUFDLE9BQUEsR0FBREQsQ0FBQyxDQUFFcEMsSUFBSSxLQUFBLElBQUEsR0FBQSxLQUFBLENBQUEsR0FBUHFDLE9BQUEsQ0FBU2xCLFFBQVEsQ0FBQ1ksT0FBTyxDQUFDLENBQUE7QUFDckMsYUFBQyxDQUFDLEVBQUU7QUFDQSxjQUFBLE1BQUE7QUFDSixhQUFBO0FBQ0osV0FBQTtBQUNKLFNBQUE7QUFDSixPQUFBO0FBQ0osS0FBQTtBQUVBLElBQUEsTUFBTU8sT0FBTyxHQUFHLElBQUksQ0FBQzlCLEtBQUssQ0FBQTtBQUMxQixJQUFBLE1BQU0rQixPQUFPLEdBQUd2QixLQUFLLEdBQUcsSUFBSXdCLFNBQVMsQ0FBQ3hCLEtBQUssQ0FBQ3lCLEdBQUcsRUFBRXpCLEtBQUssQ0FBQzBCLFFBQVEsRUFBRTFCLEtBQUssQ0FBQzJCLElBQUksRUFBRTNCLEtBQUssQ0FBQzRCLElBQUksRUFBRTVCLEtBQUssQ0FBQzZCLEdBQUcsRUFBRTdCLEtBQUssQ0FBQzhCLFFBQVEsQ0FBQyxHQUFHLElBQUksQ0FBQTtBQUUxSCxJQUFBLElBQUksQ0FBQyxDQUFDUCxPQUFPLEtBQUssQ0FBQyxDQUFDRCxPQUFPLElBQUtDLE9BQU8sSUFBSSxDQUFDQSxPQUFPLENBQUNRLE1BQU0sQ0FBQ1QsT0FBTyxDQUFFLEVBQUU7TUFDbEUsSUFBSSxDQUFDOUIsS0FBSyxHQUFHK0IsT0FBTyxDQUFBO0FBQ3BCLE1BQUEsSUFBSSxDQUFDckIsSUFBSSxDQUFDLFFBQVEsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFcUIsT0FBTyxFQUFFRCxPQUFPLENBQUMsQ0FBQTtNQUNuRCxJQUFJLENBQUNVLE1BQU0sRUFBRSxDQUFBO0FBQ2pCLEtBQUE7QUFDSixHQUFBO0VBRUEsSUFBSWhELElBQUlBLEdBQUc7SUFDUCxPQUFPLElBQUksQ0FBQ1EsS0FBSyxDQUFBO0FBQ3JCLEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7RUFDSSxJQUFJUCxJQUFJQSxDQUFDZSxLQUFLLEVBQUU7QUFDWjtBQUNBO0FBQ0EsSUFBQSxNQUFNQyxHQUFHLEdBQUcsSUFBSSxDQUFDUixLQUFLLENBQUE7SUFDdEIsSUFBSSxDQUFDQSxLQUFLLEdBQUdPLEtBQUssQ0FBQTtJQUNsQixJQUFJQSxLQUFLLEtBQUtDLEdBQUcsRUFBRTtBQUNmLE1BQUEsSUFBSSxDQUFDQyxJQUFJLENBQUMsUUFBUSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUVGLEtBQUssRUFBRUMsR0FBRyxDQUFDLENBQUE7QUFFN0MsTUFBQSxJQUFJLElBQUksQ0FBQ0wsTUFBTSxFQUNYLElBQUksQ0FBQ0UsUUFBUSxDQUFDUyxPQUFPLENBQUMwQixLQUFLLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQ25DLFFBQVEsQ0FBQyxDQUFBO0FBQ3hELEtBQUE7QUFDSixHQUFBO0VBRUEsSUFBSWIsSUFBSUEsR0FBRztJQUNQLE9BQU8sSUFBSSxDQUFDUSxLQUFLLENBQUE7QUFDckIsR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0VBQ0ksSUFBSXlDLFFBQVFBLENBQUNsQyxLQUFLLEVBQUU7QUFDaEIsSUFBQSxNQUFNbUMsSUFBSSxHQUFHLElBQUksQ0FBQ3pDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQTtBQUMvQixJQUFBLElBQUksQ0FBQ0EsVUFBVSxDQUFDLENBQUMsQ0FBQyxHQUFHTSxLQUFLLENBQUE7QUFDMUIsSUFBQSxJQUFJLENBQUNFLElBQUksQ0FBQyxRQUFRLEVBQUUsSUFBSSxFQUFFLFVBQVUsRUFBRUYsS0FBSyxFQUFFbUMsSUFBSSxDQUFDLENBQUE7QUFDdEQsR0FBQTtFQUVBLElBQUlELFFBQVFBLEdBQUc7QUFDWCxJQUFBLE9BQU8sSUFBSSxDQUFDeEMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFBO0FBQzdCLEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0VBQ0ksSUFBSTBDLFNBQVNBLENBQUNwQyxLQUFLLEVBQUU7QUFDakIsSUFBQSxNQUFNbUMsSUFBSSxHQUFHLElBQUksQ0FBQ3pDLFVBQVUsQ0FBQTtJQUM1QixJQUFJLENBQUNBLFVBQVUsR0FBR00sS0FBSyxDQUFBO0FBQ3ZCLElBQUEsSUFBSSxDQUFDRSxJQUFJLENBQUMsUUFBUSxFQUFFLElBQUksRUFBRSxXQUFXLEVBQUVGLEtBQUssRUFBRW1DLElBQUksQ0FBQyxDQUFBO0FBQ3ZELEdBQUE7RUFFQSxJQUFJQyxTQUFTQSxHQUFHO0lBQ1osT0FBTyxJQUFJLENBQUMxQyxVQUFVLENBQUE7QUFDMUIsR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0VBQ0ksSUFBSTJDLE9BQU9BLENBQUNyQyxLQUFLLEVBQUU7SUFDZkEsS0FBSyxHQUFHLENBQUMsQ0FBQ0EsS0FBSyxDQUFBO0FBQ2YsSUFBQSxJQUFJLElBQUksQ0FBQ1QsUUFBUSxLQUFLUyxLQUFLLEVBQ3ZCLE9BQUE7SUFFSixJQUFJLENBQUNULFFBQVEsR0FBR1MsS0FBSyxDQUFBO0lBQ3JCLElBQUksSUFBSSxDQUFDVCxRQUFRLElBQUksQ0FBQyxJQUFJLENBQUNLLE1BQU0sSUFBSSxDQUFDLElBQUksQ0FBQ0MsT0FBTyxJQUFJLElBQUksQ0FBQ0MsUUFBUSxFQUMvRCxJQUFJLENBQUNBLFFBQVEsQ0FBQ3dDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQTtBQUNoQyxHQUFBO0VBRUEsSUFBSUQsT0FBT0EsR0FBRztJQUNWLE9BQU8sSUFBSSxDQUFDOUMsUUFBUSxDQUFBO0FBQ3hCLEdBQUE7RUFFQSxJQUFJZ0QsU0FBU0EsQ0FBQ3ZDLEtBQUssRUFBRTtJQUNqQkEsS0FBSyxHQUFHLENBQUMsQ0FBQ0EsS0FBSyxDQUFBO0FBQ2YsSUFBQSxJQUFJLENBQUMsSUFBSSxDQUFDd0MsY0FBYyxDQUFDLFlBQVksQ0FBQyxJQUFJeEMsS0FBSyxLQUFLLElBQUksQ0FBQ3lDLFVBQVUsRUFBRTtNQUNqRSxJQUFJLENBQUNBLFVBQVUsR0FBR3pDLEtBQUssQ0FBQTs7QUFFdkI7QUFDQTtBQUNBO0FBQ0EsTUFBQSxJQUFJLElBQUksQ0FBQ0osTUFBTSxFQUNYLElBQUksQ0FBQ0UsUUFBUSxDQUFDUyxPQUFPLENBQUMwQixLQUFLLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQ25DLFFBQVEsQ0FBQyxDQUFBO0FBQ3hELEtBQUE7QUFDSixHQUFBO0VBRUEsSUFBSXlDLFNBQVNBLEdBQUc7SUFDWixPQUFPLElBQUksQ0FBQ0UsVUFBVSxDQUFBO0FBQzFCLEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNJQyxFQUFBQSxVQUFVQSxHQUFHO0FBQ1QsSUFBQSxNQUFNMUQsSUFBSSxHQUFHLElBQUksQ0FBQ0EsSUFBSSxDQUFBO0lBRXRCLElBQUksQ0FBQ0EsSUFBSSxJQUFJLENBQUNBLElBQUksQ0FBQ3lDLEdBQUcsRUFDbEIsT0FBTyxJQUFJLENBQUE7QUFFZixJQUFBLElBQUlBLEdBQUcsR0FBR3pDLElBQUksQ0FBQ3lDLEdBQUcsQ0FBQTtJQUVsQixJQUFJLElBQUksQ0FBQzNCLFFBQVEsSUFBSSxJQUFJLENBQUNBLFFBQVEsQ0FBQzZDLE1BQU0sSUFBSSxDQUFDQyxZQUFZLENBQUNDLElBQUksQ0FBQ3BCLEdBQUcsQ0FBQyxFQUNoRUEsR0FBRyxHQUFHLElBQUksQ0FBQzNCLFFBQVEsQ0FBQzZDLE1BQU0sR0FBR2xCLEdBQUcsQ0FBQTs7QUFFcEM7SUFDQSxJQUFJLElBQUksQ0FBQzFDLElBQUksS0FBSyxRQUFRLElBQUlDLElBQUksQ0FBQzJDLElBQUksRUFBRTtBQUNyQyxNQUFBLE1BQU1tQixTQUFTLEdBQUdyQixHQUFHLENBQUNyQixPQUFPLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsR0FBRyxHQUFHLEdBQUcsQ0FBQTtBQUNyRHFCLE1BQUFBLEdBQUcsSUFBSXFCLFNBQVMsR0FBRyxJQUFJLEdBQUc5RCxJQUFJLENBQUMyQyxJQUFJLENBQUE7QUFDdkMsS0FBQTtBQUVBLElBQUEsT0FBT0YsR0FBRyxDQUFBO0FBQ2QsR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0VBQ0lzQixjQUFjQSxDQUFDQyxZQUFZLEVBQUU7QUFDekIsSUFBQSxJQUFJQSxZQUFZLENBQUNDLFVBQVUsQ0FBQyxPQUFPLENBQUMsSUFBSUQsWUFBWSxDQUFDQyxVQUFVLENBQUMsT0FBTyxDQUFDLEVBQUU7QUFDdEUsTUFBQSxPQUFPRCxZQUFZLENBQUE7QUFDdkIsS0FBQTtJQUVBLE1BQU1FLElBQUksR0FBR0MsSUFBSSxDQUFDQyxZQUFZLENBQUMsSUFBSSxDQUFDcEUsSUFBSSxDQUFDeUMsR0FBRyxDQUFDLENBQUE7QUFDN0MsSUFBQSxPQUFPMEIsSUFBSSxDQUFDRSxJQUFJLENBQUNILElBQUksRUFBRUYsWUFBWSxDQUFDLENBQUE7QUFDeEMsR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtFQUNJTSxtQkFBbUJBLENBQUNDLE1BQU0sRUFBRTtBQUN4QjtJQUNBQSxNQUFNLEdBQUdDLG1CQUFtQixDQUFDRCxNQUFNLEVBQUUsSUFBSSxDQUFDNUQsS0FBSyxDQUFDLENBQUE7QUFDaEQsSUFBQSxPQUFPLElBQUksQ0FBQ0EsS0FBSyxDQUFDNEQsTUFBTSxDQUFDLElBQUksSUFBSSxDQUFBO0FBQ3JDLEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0lFLEVBQUFBLG1CQUFtQkEsQ0FBQ0YsTUFBTSxFQUFFRyxPQUFPLEVBQUU7QUFDakMsSUFBQSxJQUFJLENBQUMvRCxLQUFLLENBQUM0RCxNQUFNLENBQUMsR0FBR0csT0FBTyxDQUFBO0lBQzVCLElBQUksQ0FBQ3hELElBQUksQ0FBQyxlQUFlLEVBQUVxRCxNQUFNLEVBQUVHLE9BQU8sQ0FBQyxDQUFBO0FBQy9DLEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0VBQ0lDLHNCQUFzQkEsQ0FBQ0osTUFBTSxFQUFFO0FBQzNCLElBQUEsTUFBTUcsT0FBTyxHQUFHLElBQUksQ0FBQy9ELEtBQUssQ0FBQzRELE1BQU0sQ0FBQyxDQUFBO0FBQ2xDLElBQUEsSUFBSUcsT0FBTyxFQUFFO0FBQ1QsTUFBQSxPQUFPLElBQUksQ0FBQy9ELEtBQUssQ0FBQzRELE1BQU0sQ0FBQyxDQUFBO01BQ3pCLElBQUksQ0FBQ3JELElBQUksQ0FBQyxrQkFBa0IsRUFBRXFELE1BQU0sRUFBRUcsT0FBTyxDQUFDLENBQUE7QUFDbEQsS0FBQTtBQUNKLEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNJRSxFQUFBQSxLQUFLQSxDQUFDQyxRQUFRLEVBQUVDLEtBQUssRUFBRTtJQUNuQkEsS0FBSyxHQUFHQSxLQUFLLElBQUksSUFBSSxDQUFBO0lBRXJCLElBQUksSUFBSSxDQUFDbEUsTUFBTSxFQUFFO0FBQ2JpRSxNQUFBQSxRQUFRLENBQUNFLElBQUksQ0FBQ0QsS0FBSyxFQUFFLElBQUksQ0FBQyxDQUFBO0FBQzlCLEtBQUMsTUFBTTtBQUNILE1BQUEsSUFBSSxDQUFDRSxJQUFJLENBQUMsTUFBTSxFQUFFLFVBQVVDLEtBQUssRUFBRTtBQUMvQkosUUFBQUEsUUFBUSxDQUFDRSxJQUFJLENBQUNELEtBQUssRUFBRUcsS0FBSyxDQUFDLENBQUE7QUFDL0IsT0FBQyxDQUFDLENBQUE7QUFDTixLQUFBO0FBQ0osR0FBQTtBQUVBakMsRUFBQUEsTUFBTUEsR0FBRztBQUNMO0lBQ0EsSUFBSSxJQUFJLENBQUNwQyxNQUFNLEVBQUU7TUFDYixJQUFJLENBQUNBLE1BQU0sR0FBRyxLQUFLLENBQUE7QUFDbkIsTUFBQSxJQUFJLENBQUNFLFFBQVEsQ0FBQ3dDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQTtBQUM1QixLQUFBO0FBQ0osR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0k0QixFQUFBQSxNQUFNQSxHQUFHO0FBQ0wsSUFBQSxJQUFJLENBQUMsSUFBSSxDQUFDdEUsTUFBTSxJQUFJLElBQUksQ0FBQ0YsVUFBVSxDQUFDb0IsTUFBTSxLQUFLLENBQUMsRUFDNUMsT0FBQTtBQUVKLElBQUEsSUFBSSxDQUFDWixJQUFJLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxDQUFBO0FBQ3pCLElBQUEsSUFBSSxDQUFDSixRQUFRLENBQUNJLElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDSCxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUE7QUFFN0MsSUFBQSxNQUFNRSxHQUFHLEdBQUcsSUFBSSxDQUFDUCxVQUFVLENBQUE7O0FBRTNCO0lBQ0EsSUFBSSxDQUFDMEMsU0FBUyxHQUFHLEVBQUUsQ0FBQTtJQUNuQixJQUFJLENBQUN4QyxNQUFNLEdBQUcsS0FBSyxDQUFBOztBQUVuQjtJQUNBLElBQUksSUFBSSxDQUFDWixJQUFJLEVBQUU7QUFDWCxNQUFBLElBQUksQ0FBQ2MsUUFBUSxDQUFDUyxPQUFPLENBQUM0RCxVQUFVLENBQUMsSUFBSSxDQUFDekIsVUFBVSxFQUFFLEVBQUUsSUFBSSxDQUFDM0QsSUFBSSxDQUFDLENBQUE7QUFDbEUsS0FBQTs7QUFFQTtBQUNBLElBQUEsS0FBSyxJQUFJNkIsQ0FBQyxHQUFHLENBQUMsRUFBRUEsQ0FBQyxHQUFHWCxHQUFHLENBQUNhLE1BQU0sRUFBRSxFQUFFRixDQUFDLEVBQUU7QUFDakMsTUFBQSxNQUFNc0IsUUFBUSxHQUFHakMsR0FBRyxDQUFDVyxDQUFDLENBQUMsQ0FBQTtBQUN2QixNQUFBLElBQUlzQixRQUFRLElBQUlBLFFBQVEsQ0FBQ2tDLE9BQU8sRUFBRTtRQUM5QmxDLFFBQVEsQ0FBQ2tDLE9BQU8sRUFBRSxDQUFBO0FBQ3RCLE9BQUE7QUFDSixLQUFBO0FBQ0osR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7RUFDSSxPQUFPQyxnQkFBZ0JBLENBQUNDLE9BQU8sRUFBRVQsUUFBUSxFQUFFSSxLQUFLLEVBQUVNLFVBQVUsR0FBRyxDQUFDLEVBQUU7QUFBQSxJQUFBLElBQUFDLFdBQUEsQ0FBQTtJQUM5RCxJQUFJUCxLQUFLLElBQUFPLElBQUFBLElBQUFBLENBQUFBLFdBQUEsR0FBTFAsS0FBSyxDQUFFakYsSUFBSSxLQUFYd0YsSUFBQUEsSUFBQUEsV0FBQSxDQUFhMUMsUUFBUSxFQUFFO0FBQ3ZCO0FBQ0EyQyxNQUFBQSxVQUFVLENBQUMsTUFBTTtRQUNiWixRQUFRLENBQUMsSUFBSSxFQUFFSSxLQUFLLENBQUNqRixJQUFJLENBQUM4QyxRQUFRLENBQUMsQ0FBQTtBQUN2QyxPQUFDLENBQUMsQ0FBQTtBQUNOLEtBQUMsTUFBTTtBQUNIO0FBQ0E0QyxNQUFBQSxJQUFJLENBQUNDLEdBQUcsQ0FBQ0wsT0FBTyxFQUFFO0FBQ2RNLFFBQUFBLEtBQUssRUFBRSxJQUFJO0FBQ1hDLFFBQUFBLFlBQVksRUFBRSxhQUFhO1FBQzNCQyxLQUFLLEVBQUVQLFVBQVUsR0FBRyxDQUFDO0FBQ3JCQSxRQUFBQSxVQUFVLEVBQUVBLFVBQUFBO09BQ2YsRUFBRVYsUUFBUSxDQUFDLENBQUE7QUFDaEIsS0FBQTtBQUNKLEdBQUE7QUFDSjs7OzsifQ==
