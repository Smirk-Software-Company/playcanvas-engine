import { path } from '../core/path.js';
import { Debug } from '../core/debug.js';
import { ABSOLUTE_URL } from './asset/constants.js';
import { SceneRegistryItem } from './scene-registry-item.js';

/**
 * Callback used by {@link SceneRegistry#loadSceneHierarchy}.
 *
 * @callback LoadHierarchyCallback
 * @param {string|null} err - The error message in the case where the loading or parsing fails.
 * @param {import('./entity.js').Entity} [entity] - The loaded root entity if no errors were encountered.
 */

/**
 * Callback used by {@link SceneRegistry#loadSceneSettings}.
 *
 * @callback LoadSettingsCallback
 * @param {string|null} err - The error message in the case where the loading or parsing fails.
 */

/**
 * Callback used by {@link SceneRegistry#changeScene}.
 *
 * @callback ChangeSceneCallback
 * @param {string|null} err - The error message in the case where the loading or parsing fails.
 * @param {import('./entity.js').Entity} [entity] - The loaded root entity if no errors were encountered.
 */

/**
 * Callback used by {@link SceneRegistry#loadScene}.
 *
 * @callback LoadSceneCallback
 * @param {string|null} err - The error message in the case where the loading or parsing fails.
 * @param {import('./entity.js').Entity} [entity] - The loaded root entity if no errors were encountered.
 */

/**
 * Callback used by {@link SceneRegistry#loadSceneData}.
 *
 * @callback LoadSceneDataCallback
 * @param {string|null} err - The error message in the case where the loading or parsing fails.
 * @param {SceneRegistryItem} [sceneItem] - The scene registry item if no errors were encountered.
 */

/**
 * Container for storing and loading of scenes. An instance of the registry is created on the
 * {@link AppBase} object as {@link AppBase#scenes}.
 *
 * @category Graphics
 */
class SceneRegistry {
  /**
   * Create a new SceneRegistry instance.
   *
   * @param {import('./app-base.js').AppBase} app - The application.
   */
  constructor(app) {
    /**
     * @type {import('./app-base.js').AppBase}
     * @private
     */
    this._app = void 0;
    /**
     * @type {SceneRegistryItem[]}
     * @private
     */
    this._list = [];
    /** @private */
    this._index = {};
    /** @private */
    this._urlIndex = {};
    this._app = app;
  }

  /** @ignore */
  destroy() {
    this._app = null;
  }

  /**
   * Return the list of scene.
   *
   * @returns {SceneRegistryItem[]} All items in the registry.
   */
  list() {
    return this._list;
  }

  /**
   * Add a new item to the scene registry.
   *
   * @param {string} name - The name of the scene.
   * @param {string} url - The url of the scene file.
   * @returns {boolean} Returns true if the scene was successfully added to the registry, false otherwise.
   */
  add(name, url) {
    if (this._index.hasOwnProperty(name)) {
      Debug.warn('pc.SceneRegistry: trying to add more than one scene called: ' + name);
      return false;
    }
    const item = new SceneRegistryItem(name, url);
    const i = this._list.push(item);
    this._index[item.name] = i - 1;
    this._urlIndex[item.url] = i - 1;
    return true;
  }

  /**
   * Find a Scene by name and return the {@link SceneRegistryItem}.
   *
   * @param {string} name - The name of the scene.
   * @returns {SceneRegistryItem|null} The stored data about a scene or null if no scene with
   * that name exists.
   */
  find(name) {
    if (this._index.hasOwnProperty(name)) {
      return this._list[this._index[name]];
    }
    return null;
  }

  /**
   * Find a scene by the URL and return the {@link SceneRegistryItem}.
   *
   * @param {string} url - The URL to search by.
   * @returns {SceneRegistryItem|null} The stored data about a scene or null if no scene with
   * that URL exists.
   */
  findByUrl(url) {
    if (this._urlIndex.hasOwnProperty(url)) {
      return this._list[this._urlIndex[url]];
    }
    return null;
  }

  /**
   * Remove an item from the scene registry.
   *
   * @param {string} name - The name of the scene.
   */
  remove(name) {
    if (this._index.hasOwnProperty(name)) {
      const idx = this._index[name];
      let item = this._list[idx];
      delete this._urlIndex[item.url];
      // remove from index
      delete this._index[name];

      // remove from list
      this._list.splice(idx, 1);

      // refresh index
      for (let i = 0; i < this._list.length; i++) {
        item = this._list[i];
        this._index[item.name] = i;
        this._urlIndex[item.url] = i;
      }
    }
  }

  /**
   * Private function to load scene data with the option to cache. This allows us to retain
   * expected behavior of loadSceneSettings and loadSceneHierarchy where they don't store loaded
   * data which may be undesired behavior with projects that have many scenes.
   *
   * @param {SceneRegistryItem | string} sceneItem - The scene item (which can be found with
   * {@link SceneRegistry#find}, URL of the scene file (e.g."scene_id.json") or name of the scene.
   * @param {boolean} storeInCache - Whether to store the loaded data in the scene item.
   * @param {LoadSceneDataCallback} callback - The function to call after loading,
   * passed (err, sceneItem) where err is null if no errors occurred.
   * @private
   */
  _loadSceneData(sceneItem, storeInCache, callback) {
    const app = this._app;
    // If it's a sceneItem, we want to be able to cache the data that is loaded so we don't do
    // a subsequent http requests on the same scene later

    // If it's just a URL or scene name then attempt to find the scene item in the registry
    // else create a temp SceneRegistryItem to use for this function as the scene may not have
    // been added to the registry
    let url = sceneItem;
    if (typeof sceneItem === 'string') {
      sceneItem = this.findByUrl(url) || this.find(url) || new SceneRegistryItem('Untitled', url);
    }
    url = sceneItem.url;
    if (!url) {
      callback("Cannot find scene to load");
      return;
    }

    // If we have the data already loaded, no need to do another HTTP request
    if (sceneItem.loaded) {
      callback(null, sceneItem);
      return;
    }

    // include asset prefix if present
    if (app.assets && app.assets.prefix && !ABSOLUTE_URL.test(url)) {
      url = path.join(app.assets.prefix, url);
    }
    sceneItem._onLoadedCallbacks.push(callback);
    if (!sceneItem._loading) {
      // Because we need to load scripts before we instance the hierarchy (i.e. before we
      // create script components), split loading into load and open
      const handler = app.loader.getHandler("hierarchy");
      handler.load(url, (err, data) => {
        sceneItem.data = data;
        sceneItem._loading = false;
        for (let i = 0; i < sceneItem._onLoadedCallbacks.length; i++) {
          sceneItem._onLoadedCallbacks[i](err, sceneItem);
        }

        // Remove the data if it's not been requested to store in cache
        if (!storeInCache) {
          sceneItem.data = null;
        }
        sceneItem._onLoadedCallbacks.length = 0;
      });
    }
    sceneItem._loading = true;
  }

  /**
   * Loads and stores the scene data to reduce the number of the network requests when the same
   * scenes are loaded multiple times. Can also be used to load data before calling
   * {@link SceneRegistry#loadSceneHierarchy} and {@link SceneRegistry#loadSceneSettings} to make
   * scene loading quicker for the user.
   *
   * @param {SceneRegistryItem | string} sceneItem - The scene item (which can be found with
   * {@link SceneRegistry#find}, URL of the scene file (e.g."scene_id.json") or name of the scene.
   * @param {LoadSceneDataCallback} callback - The function to call after loading,
   * passed (err, sceneItem) where err is null if no errors occurred.
   * @example
   * const sceneItem = app.scenes.find("Scene Name");
   * app.scenes.loadSceneData(sceneItem, function (err, sceneItem) {
   *     if (err) {
   *         // error
   *     }
   * });
   */
  loadSceneData(sceneItem, callback) {
    this._loadSceneData(sceneItem, true, callback);
  }

  /**
   * Unloads scene data that has been loaded previously using {@link SceneRegistry#loadSceneData}.
   *
   * @param {SceneRegistryItem | string} sceneItem - The scene item (which can be found with
   * {@link SceneRegistry#find} or URL of the scene file. Usually this will be "scene_id.json".
   * @example
   * const sceneItem = app.scenes.find("Scene Name");
   * app.scenes.unloadSceneData(sceneItem);
   */
  unloadSceneData(sceneItem) {
    if (typeof sceneItem === 'string') {
      sceneItem = this.findByUrl(sceneItem);
    }
    if (sceneItem) {
      sceneItem.data = null;
    }
  }
  _loadSceneHierarchy(sceneItem, onBeforeAddHierarchy, callback) {
    this._loadSceneData(sceneItem, false, (err, sceneItem) => {
      if (err) {
        if (callback) {
          callback(err);
        }
        return;
      }
      if (onBeforeAddHierarchy) {
        onBeforeAddHierarchy(sceneItem);
      }
      const app = this._app;

      // called after scripts are preloaded
      const _loaded = () => {
        // Because we need to load scripts before we instance the hierarchy (i.e. before we create script components)
        // Split loading into load and open
        const handler = app.loader.getHandler("hierarchy");
        app.systems.script.preloading = true;
        const entity = handler.open(sceneItem.url, sceneItem.data);
        app.systems.script.preloading = false;

        // clear from cache because this data is modified by entity operations (e.g. destroy)
        app.loader.clearCache(sceneItem.url, "hierarchy");

        // add to hierarchy
        app.root.addChild(entity);

        // initialize components
        app.systems.fire('initialize', entity);
        app.systems.fire('postInitialize', entity);
        app.systems.fire('postPostInitialize', entity);
        if (callback) callback(null, entity);
      };

      // load priority and referenced scripts before opening scene
      app._preloadScripts(sceneItem.data, _loaded);
    });
  }

  /**
   * Load a scene file, create and initialize the Entity hierarchy and add the hierarchy to the
   * application root Entity.
   *
   * @param {SceneRegistryItem | string} sceneItem - The scene item (which can be found with
   * {@link SceneRegistry#find}, URL of the scene file (e.g."scene_id.json") or name of the scene.
   * @param {LoadHierarchyCallback} callback - The function to call after loading,
   * passed (err, entity) where err is null if no errors occurred.
   * @example
   * const sceneItem = app.scenes.find("Scene Name");
   * app.scenes.loadSceneHierarchy(sceneItem, function (err, entity) {
   *     if (!err) {
   *         const e = app.root.find("My New Entity");
   *     } else {
   *         // error
   *     }
   * });
   */
  loadSceneHierarchy(sceneItem, callback) {
    this._loadSceneHierarchy(sceneItem, null, callback);
  }

  /**
   * Load a scene file and apply the scene settings to the current scene.
   *
   * @param {SceneRegistryItem | string} sceneItem - The scene item (which can be found with
   * {@link SceneRegistry#find}, URL of the scene file (e.g."scene_id.json") or name of the scene.
   * @param {LoadSettingsCallback} callback - The function called after the settings
   * are applied. Passed (err) where err is null if no error occurred.
   * @example
   * const sceneItem = app.scenes.find("Scene Name");
   * app.scenes.loadSceneSettings(sceneItem, function (err) {
   *     if (!err) {
   *         // success
   *     } else {
   *         // error
   *     }
   * });
   */
  loadSceneSettings(sceneItem, callback) {
    this._loadSceneData(sceneItem, false, (err, sceneItem) => {
      if (!err) {
        this._app.applySceneSettings(sceneItem.data.settings);
        if (callback) {
          callback(null);
        }
      } else {
        if (callback) {
          callback(err);
        }
      }
    });
  }

  /**
   * Change to a new scene. Calling this function will load the scene data, delete all
   * entities and graph nodes under `app.root` and load the scene settings and hierarchy.
   *
   * @param {SceneRegistryItem | string} sceneItem - The scene item (which can be found with
   * {@link SceneRegistry#find}, URL of the scene file (e.g."scene_id.json") or name of the scene.
   * @param {ChangeSceneCallback} [callback] - The function to call after loading,
   * passed (err, entity) where err is null if no errors occurred.
   * @example
   * app.scenes.changeScene("Scene Name", function (err, entity) {
   *     if (!err) {
   *         // success
   *     } else {
   *         // error
   *     }
   * });
   */
  changeScene(sceneItem, callback) {
    const app = this._app;
    const onBeforeAddHierarchy = sceneItem => {
      // Destroy all nodes on the app.root
      const {
        children
      } = app.root;
      while (children.length) {
        children[0].destroy();
      }
      app.applySceneSettings(sceneItem.data.settings);
    };
    this._loadSceneHierarchy(sceneItem, onBeforeAddHierarchy, callback);
  }

  /**
   * Load the scene hierarchy and scene settings. This is an internal method used by the
   * {@link AppBase}.
   *
   * @param {string} url - The URL of the scene file.
   * @param {LoadSceneCallback} callback - The function called after the settings are
   * applied. Passed (err, scene) where err is null if no error occurred and scene is the
   * {@link Scene}.
   */
  loadScene(url, callback) {
    const app = this._app;
    const handler = app.loader.getHandler("scene");

    // include asset prefix if present
    if (app.assets && app.assets.prefix && !ABSOLUTE_URL.test(url)) {
      url = path.join(app.assets.prefix, url);
    }
    handler.load(url, (err, data) => {
      if (!err) {
        const _loaded = () => {
          // parse and create scene
          app.systems.script.preloading = true;
          const scene = handler.open(url, data);

          // Cache the data as we are loading via URL only
          const sceneItem = this.findByUrl(url);
          if (sceneItem && !sceneItem.loaded) {
            sceneItem.data = data;
          }
          app.systems.script.preloading = false;

          // clear scene from cache because we'll destroy it when we load another one
          // so data will be invalid
          app.loader.clearCache(url, "scene");
          app.loader.patch({
            resource: scene,
            type: "scene"
          }, app.assets);
          app.root.addChild(scene.root);

          // Initialize pack settings
          if (app.systems.rigidbody && typeof Ammo !== 'undefined') {
            app.systems.rigidbody.gravity.set(scene._gravity.x, scene._gravity.y, scene._gravity.z);
          }
          if (callback) {
            callback(null, scene);
          }
        };

        // preload scripts before opening scene
        app._preloadScripts(data, _loaded);
      } else {
        if (callback) {
          callback(err);
        }
      }
    });
  }
}

export { SceneRegistry };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NlbmUtcmVnaXN0cnkuanMiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9mcmFtZXdvcmsvc2NlbmUtcmVnaXN0cnkuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgcGF0aCB9IGZyb20gJy4uL2NvcmUvcGF0aC5qcyc7XG5pbXBvcnQgeyBEZWJ1ZyB9IGZyb20gJy4uL2NvcmUvZGVidWcuanMnO1xuXG5pbXBvcnQgeyBBQlNPTFVURV9VUkwgfSBmcm9tICcuL2Fzc2V0L2NvbnN0YW50cy5qcyc7XG5cbmltcG9ydCB7IFNjZW5lUmVnaXN0cnlJdGVtIH0gZnJvbSAnLi9zY2VuZS1yZWdpc3RyeS1pdGVtLmpzJztcblxuLyoqXG4gKiBDYWxsYmFjayB1c2VkIGJ5IHtAbGluayBTY2VuZVJlZ2lzdHJ5I2xvYWRTY2VuZUhpZXJhcmNoeX0uXG4gKlxuICogQGNhbGxiYWNrIExvYWRIaWVyYXJjaHlDYWxsYmFja1xuICogQHBhcmFtIHtzdHJpbmd8bnVsbH0gZXJyIC0gVGhlIGVycm9yIG1lc3NhZ2UgaW4gdGhlIGNhc2Ugd2hlcmUgdGhlIGxvYWRpbmcgb3IgcGFyc2luZyBmYWlscy5cbiAqIEBwYXJhbSB7aW1wb3J0KCcuL2VudGl0eS5qcycpLkVudGl0eX0gW2VudGl0eV0gLSBUaGUgbG9hZGVkIHJvb3QgZW50aXR5IGlmIG5vIGVycm9ycyB3ZXJlIGVuY291bnRlcmVkLlxuICovXG5cbi8qKlxuICogQ2FsbGJhY2sgdXNlZCBieSB7QGxpbmsgU2NlbmVSZWdpc3RyeSNsb2FkU2NlbmVTZXR0aW5nc30uXG4gKlxuICogQGNhbGxiYWNrIExvYWRTZXR0aW5nc0NhbGxiYWNrXG4gKiBAcGFyYW0ge3N0cmluZ3xudWxsfSBlcnIgLSBUaGUgZXJyb3IgbWVzc2FnZSBpbiB0aGUgY2FzZSB3aGVyZSB0aGUgbG9hZGluZyBvciBwYXJzaW5nIGZhaWxzLlxuICovXG5cbi8qKlxuICogQ2FsbGJhY2sgdXNlZCBieSB7QGxpbmsgU2NlbmVSZWdpc3RyeSNjaGFuZ2VTY2VuZX0uXG4gKlxuICogQGNhbGxiYWNrIENoYW5nZVNjZW5lQ2FsbGJhY2tcbiAqIEBwYXJhbSB7c3RyaW5nfG51bGx9IGVyciAtIFRoZSBlcnJvciBtZXNzYWdlIGluIHRoZSBjYXNlIHdoZXJlIHRoZSBsb2FkaW5nIG9yIHBhcnNpbmcgZmFpbHMuXG4gKiBAcGFyYW0ge2ltcG9ydCgnLi9lbnRpdHkuanMnKS5FbnRpdHl9IFtlbnRpdHldIC0gVGhlIGxvYWRlZCByb290IGVudGl0eSBpZiBubyBlcnJvcnMgd2VyZSBlbmNvdW50ZXJlZC5cbiAqL1xuXG4vKipcbiAqIENhbGxiYWNrIHVzZWQgYnkge0BsaW5rIFNjZW5lUmVnaXN0cnkjbG9hZFNjZW5lfS5cbiAqXG4gKiBAY2FsbGJhY2sgTG9hZFNjZW5lQ2FsbGJhY2tcbiAqIEBwYXJhbSB7c3RyaW5nfG51bGx9IGVyciAtIFRoZSBlcnJvciBtZXNzYWdlIGluIHRoZSBjYXNlIHdoZXJlIHRoZSBsb2FkaW5nIG9yIHBhcnNpbmcgZmFpbHMuXG4gKiBAcGFyYW0ge2ltcG9ydCgnLi9lbnRpdHkuanMnKS5FbnRpdHl9IFtlbnRpdHldIC0gVGhlIGxvYWRlZCByb290IGVudGl0eSBpZiBubyBlcnJvcnMgd2VyZSBlbmNvdW50ZXJlZC5cbiAqL1xuXG4vKipcbiAqIENhbGxiYWNrIHVzZWQgYnkge0BsaW5rIFNjZW5lUmVnaXN0cnkjbG9hZFNjZW5lRGF0YX0uXG4gKlxuICogQGNhbGxiYWNrIExvYWRTY2VuZURhdGFDYWxsYmFja1xuICogQHBhcmFtIHtzdHJpbmd8bnVsbH0gZXJyIC0gVGhlIGVycm9yIG1lc3NhZ2UgaW4gdGhlIGNhc2Ugd2hlcmUgdGhlIGxvYWRpbmcgb3IgcGFyc2luZyBmYWlscy5cbiAqIEBwYXJhbSB7U2NlbmVSZWdpc3RyeUl0ZW19IFtzY2VuZUl0ZW1dIC0gVGhlIHNjZW5lIHJlZ2lzdHJ5IGl0ZW0gaWYgbm8gZXJyb3JzIHdlcmUgZW5jb3VudGVyZWQuXG4gKi9cblxuLyoqXG4gKiBDb250YWluZXIgZm9yIHN0b3JpbmcgYW5kIGxvYWRpbmcgb2Ygc2NlbmVzLiBBbiBpbnN0YW5jZSBvZiB0aGUgcmVnaXN0cnkgaXMgY3JlYXRlZCBvbiB0aGVcbiAqIHtAbGluayBBcHBCYXNlfSBvYmplY3QgYXMge0BsaW5rIEFwcEJhc2Ujc2NlbmVzfS5cbiAqXG4gKiBAY2F0ZWdvcnkgR3JhcGhpY3NcbiAqL1xuY2xhc3MgU2NlbmVSZWdpc3RyeSB7XG4gICAgLyoqXG4gICAgICogQHR5cGUge2ltcG9ydCgnLi9hcHAtYmFzZS5qcycpLkFwcEJhc2V9XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfYXBwO1xuXG4gICAgLyoqXG4gICAgICogQHR5cGUge1NjZW5lUmVnaXN0cnlJdGVtW119XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfbGlzdCA9IFtdO1xuXG4gICAgLyoqIEBwcml2YXRlICovXG4gICAgX2luZGV4ID0ge307XG5cbiAgICAvKiogQHByaXZhdGUgKi9cbiAgICBfdXJsSW5kZXggPSB7fTtcblxuICAgIC8qKlxuICAgICAqIENyZWF0ZSBhIG5ldyBTY2VuZVJlZ2lzdHJ5IGluc3RhbmNlLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4vYXBwLWJhc2UuanMnKS5BcHBCYXNlfSBhcHAgLSBUaGUgYXBwbGljYXRpb24uXG4gICAgICovXG4gICAgY29uc3RydWN0b3IoYXBwKSB7XG4gICAgICAgIHRoaXMuX2FwcCA9IGFwcDtcbiAgICB9XG5cbiAgICAvKiogQGlnbm9yZSAqL1xuICAgIGRlc3Ryb3koKSB7XG4gICAgICAgIHRoaXMuX2FwcCA9IG51bGw7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJuIHRoZSBsaXN0IG9mIHNjZW5lLlxuICAgICAqXG4gICAgICogQHJldHVybnMge1NjZW5lUmVnaXN0cnlJdGVtW119IEFsbCBpdGVtcyBpbiB0aGUgcmVnaXN0cnkuXG4gICAgICovXG4gICAgbGlzdCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2xpc3Q7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQWRkIGEgbmV3IGl0ZW0gdG8gdGhlIHNjZW5lIHJlZ2lzdHJ5LlxuICAgICAqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IG5hbWUgLSBUaGUgbmFtZSBvZiB0aGUgc2NlbmUuXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IHVybCAtIFRoZSB1cmwgb2YgdGhlIHNjZW5lIGZpbGUuXG4gICAgICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgdHJ1ZSBpZiB0aGUgc2NlbmUgd2FzIHN1Y2Nlc3NmdWxseSBhZGRlZCB0byB0aGUgcmVnaXN0cnksIGZhbHNlIG90aGVyd2lzZS5cbiAgICAgKi9cbiAgICBhZGQobmFtZSwgdXJsKSB7XG4gICAgICAgIGlmICh0aGlzLl9pbmRleC5oYXNPd25Qcm9wZXJ0eShuYW1lKSkge1xuICAgICAgICAgICAgRGVidWcud2FybigncGMuU2NlbmVSZWdpc3RyeTogdHJ5aW5nIHRvIGFkZCBtb3JlIHRoYW4gb25lIHNjZW5lIGNhbGxlZDogJyArIG5hbWUpO1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgaXRlbSA9IG5ldyBTY2VuZVJlZ2lzdHJ5SXRlbShuYW1lLCB1cmwpO1xuXG4gICAgICAgIGNvbnN0IGkgPSB0aGlzLl9saXN0LnB1c2goaXRlbSk7XG4gICAgICAgIHRoaXMuX2luZGV4W2l0ZW0ubmFtZV0gPSBpIC0gMTtcbiAgICAgICAgdGhpcy5fdXJsSW5kZXhbaXRlbS51cmxdID0gaSAtIDE7XG5cbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRmluZCBhIFNjZW5lIGJ5IG5hbWUgYW5kIHJldHVybiB0aGUge0BsaW5rIFNjZW5lUmVnaXN0cnlJdGVtfS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lIC0gVGhlIG5hbWUgb2YgdGhlIHNjZW5lLlxuICAgICAqIEByZXR1cm5zIHtTY2VuZVJlZ2lzdHJ5SXRlbXxudWxsfSBUaGUgc3RvcmVkIGRhdGEgYWJvdXQgYSBzY2VuZSBvciBudWxsIGlmIG5vIHNjZW5lIHdpdGhcbiAgICAgKiB0aGF0IG5hbWUgZXhpc3RzLlxuICAgICAqL1xuICAgIGZpbmQobmFtZSkge1xuICAgICAgICBpZiAodGhpcy5faW5kZXguaGFzT3duUHJvcGVydHkobmFtZSkpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9saXN0W3RoaXMuX2luZGV4W25hbWVdXTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEZpbmQgYSBzY2VuZSBieSB0aGUgVVJMIGFuZCByZXR1cm4gdGhlIHtAbGluayBTY2VuZVJlZ2lzdHJ5SXRlbX0uXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gdXJsIC0gVGhlIFVSTCB0byBzZWFyY2ggYnkuXG4gICAgICogQHJldHVybnMge1NjZW5lUmVnaXN0cnlJdGVtfG51bGx9IFRoZSBzdG9yZWQgZGF0YSBhYm91dCBhIHNjZW5lIG9yIG51bGwgaWYgbm8gc2NlbmUgd2l0aFxuICAgICAqIHRoYXQgVVJMIGV4aXN0cy5cbiAgICAgKi9cbiAgICBmaW5kQnlVcmwodXJsKSB7XG4gICAgICAgIGlmICh0aGlzLl91cmxJbmRleC5oYXNPd25Qcm9wZXJ0eSh1cmwpKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fbGlzdFt0aGlzLl91cmxJbmRleFt1cmxdXTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJlbW92ZSBhbiBpdGVtIGZyb20gdGhlIHNjZW5lIHJlZ2lzdHJ5LlxuICAgICAqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IG5hbWUgLSBUaGUgbmFtZSBvZiB0aGUgc2NlbmUuXG4gICAgICovXG4gICAgcmVtb3ZlKG5hbWUpIHtcbiAgICAgICAgaWYgKHRoaXMuX2luZGV4Lmhhc093blByb3BlcnR5KG5hbWUpKSB7XG4gICAgICAgICAgICBjb25zdCBpZHggPSB0aGlzLl9pbmRleFtuYW1lXTtcbiAgICAgICAgICAgIGxldCBpdGVtID0gdGhpcy5fbGlzdFtpZHhdO1xuXG4gICAgICAgICAgICBkZWxldGUgdGhpcy5fdXJsSW5kZXhbaXRlbS51cmxdO1xuICAgICAgICAgICAgLy8gcmVtb3ZlIGZyb20gaW5kZXhcbiAgICAgICAgICAgIGRlbGV0ZSB0aGlzLl9pbmRleFtuYW1lXTtcblxuICAgICAgICAgICAgLy8gcmVtb3ZlIGZyb20gbGlzdFxuICAgICAgICAgICAgdGhpcy5fbGlzdC5zcGxpY2UoaWR4LCAxKTtcblxuICAgICAgICAgICAgLy8gcmVmcmVzaCBpbmRleFxuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLl9saXN0Lmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgaXRlbSA9IHRoaXMuX2xpc3RbaV07XG4gICAgICAgICAgICAgICAgdGhpcy5faW5kZXhbaXRlbS5uYW1lXSA9IGk7XG4gICAgICAgICAgICAgICAgdGhpcy5fdXJsSW5kZXhbaXRlbS51cmxdID0gaTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFByaXZhdGUgZnVuY3Rpb24gdG8gbG9hZCBzY2VuZSBkYXRhIHdpdGggdGhlIG9wdGlvbiB0byBjYWNoZS4gVGhpcyBhbGxvd3MgdXMgdG8gcmV0YWluXG4gICAgICogZXhwZWN0ZWQgYmVoYXZpb3Igb2YgbG9hZFNjZW5lU2V0dGluZ3MgYW5kIGxvYWRTY2VuZUhpZXJhcmNoeSB3aGVyZSB0aGV5IGRvbid0IHN0b3JlIGxvYWRlZFxuICAgICAqIGRhdGEgd2hpY2ggbWF5IGJlIHVuZGVzaXJlZCBiZWhhdmlvciB3aXRoIHByb2plY3RzIHRoYXQgaGF2ZSBtYW55IHNjZW5lcy5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7U2NlbmVSZWdpc3RyeUl0ZW0gfCBzdHJpbmd9IHNjZW5lSXRlbSAtIFRoZSBzY2VuZSBpdGVtICh3aGljaCBjYW4gYmUgZm91bmQgd2l0aFxuICAgICAqIHtAbGluayBTY2VuZVJlZ2lzdHJ5I2ZpbmR9LCBVUkwgb2YgdGhlIHNjZW5lIGZpbGUgKGUuZy5cInNjZW5lX2lkLmpzb25cIikgb3IgbmFtZSBvZiB0aGUgc2NlbmUuXG4gICAgICogQHBhcmFtIHtib29sZWFufSBzdG9yZUluQ2FjaGUgLSBXaGV0aGVyIHRvIHN0b3JlIHRoZSBsb2FkZWQgZGF0YSBpbiB0aGUgc2NlbmUgaXRlbS5cbiAgICAgKiBAcGFyYW0ge0xvYWRTY2VuZURhdGFDYWxsYmFja30gY2FsbGJhY2sgLSBUaGUgZnVuY3Rpb24gdG8gY2FsbCBhZnRlciBsb2FkaW5nLFxuICAgICAqIHBhc3NlZCAoZXJyLCBzY2VuZUl0ZW0pIHdoZXJlIGVyciBpcyBudWxsIGlmIG5vIGVycm9ycyBvY2N1cnJlZC5cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9sb2FkU2NlbmVEYXRhKHNjZW5lSXRlbSwgc3RvcmVJbkNhY2hlLCBjYWxsYmFjaykge1xuICAgICAgICBjb25zdCBhcHAgPSB0aGlzLl9hcHA7XG4gICAgICAgIC8vIElmIGl0J3MgYSBzY2VuZUl0ZW0sIHdlIHdhbnQgdG8gYmUgYWJsZSB0byBjYWNoZSB0aGUgZGF0YSB0aGF0IGlzIGxvYWRlZCBzbyB3ZSBkb24ndCBkb1xuICAgICAgICAvLyBhIHN1YnNlcXVlbnQgaHR0cCByZXF1ZXN0cyBvbiB0aGUgc2FtZSBzY2VuZSBsYXRlclxuXG4gICAgICAgIC8vIElmIGl0J3MganVzdCBhIFVSTCBvciBzY2VuZSBuYW1lIHRoZW4gYXR0ZW1wdCB0byBmaW5kIHRoZSBzY2VuZSBpdGVtIGluIHRoZSByZWdpc3RyeVxuICAgICAgICAvLyBlbHNlIGNyZWF0ZSBhIHRlbXAgU2NlbmVSZWdpc3RyeUl0ZW0gdG8gdXNlIGZvciB0aGlzIGZ1bmN0aW9uIGFzIHRoZSBzY2VuZSBtYXkgbm90IGhhdmVcbiAgICAgICAgLy8gYmVlbiBhZGRlZCB0byB0aGUgcmVnaXN0cnlcbiAgICAgICAgbGV0IHVybCA9IHNjZW5lSXRlbTtcbiAgICAgICAgaWYgKHR5cGVvZiBzY2VuZUl0ZW0gPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICBzY2VuZUl0ZW0gPSB0aGlzLmZpbmRCeVVybCh1cmwpIHx8IHRoaXMuZmluZCh1cmwpIHx8IG5ldyBTY2VuZVJlZ2lzdHJ5SXRlbSgnVW50aXRsZWQnLCB1cmwpO1xuICAgICAgICB9XG5cbiAgICAgICAgdXJsID0gc2NlbmVJdGVtLnVybDtcblxuICAgICAgICBpZiAoIXVybCkge1xuICAgICAgICAgICAgY2FsbGJhY2soXCJDYW5ub3QgZmluZCBzY2VuZSB0byBsb2FkXCIpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gSWYgd2UgaGF2ZSB0aGUgZGF0YSBhbHJlYWR5IGxvYWRlZCwgbm8gbmVlZCB0byBkbyBhbm90aGVyIEhUVFAgcmVxdWVzdFxuICAgICAgICBpZiAoc2NlbmVJdGVtLmxvYWRlZCkge1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCwgc2NlbmVJdGVtKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGluY2x1ZGUgYXNzZXQgcHJlZml4IGlmIHByZXNlbnRcbiAgICAgICAgaWYgKGFwcC5hc3NldHMgJiYgYXBwLmFzc2V0cy5wcmVmaXggJiYgIUFCU09MVVRFX1VSTC50ZXN0KHVybCkpIHtcbiAgICAgICAgICAgIHVybCA9IHBhdGguam9pbihhcHAuYXNzZXRzLnByZWZpeCwgdXJsKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHNjZW5lSXRlbS5fb25Mb2FkZWRDYWxsYmFja3MucHVzaChjYWxsYmFjayk7XG5cbiAgICAgICAgaWYgKCFzY2VuZUl0ZW0uX2xvYWRpbmcpIHtcbiAgICAgICAgICAgIC8vIEJlY2F1c2Ugd2UgbmVlZCB0byBsb2FkIHNjcmlwdHMgYmVmb3JlIHdlIGluc3RhbmNlIHRoZSBoaWVyYXJjaHkgKGkuZS4gYmVmb3JlIHdlXG4gICAgICAgICAgICAvLyBjcmVhdGUgc2NyaXB0IGNvbXBvbmVudHMpLCBzcGxpdCBsb2FkaW5nIGludG8gbG9hZCBhbmQgb3BlblxuICAgICAgICAgICAgY29uc3QgaGFuZGxlciA9IGFwcC5sb2FkZXIuZ2V0SGFuZGxlcihcImhpZXJhcmNoeVwiKTtcblxuICAgICAgICAgICAgaGFuZGxlci5sb2FkKHVybCwgKGVyciwgZGF0YSkgPT4ge1xuICAgICAgICAgICAgICAgIHNjZW5lSXRlbS5kYXRhID0gZGF0YTtcbiAgICAgICAgICAgICAgICBzY2VuZUl0ZW0uX2xvYWRpbmcgPSBmYWxzZTtcblxuICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc2NlbmVJdGVtLl9vbkxvYWRlZENhbGxiYWNrcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICBzY2VuZUl0ZW0uX29uTG9hZGVkQ2FsbGJhY2tzW2ldKGVyciwgc2NlbmVJdGVtKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBSZW1vdmUgdGhlIGRhdGEgaWYgaXQncyBub3QgYmVlbiByZXF1ZXN0ZWQgdG8gc3RvcmUgaW4gY2FjaGVcbiAgICAgICAgICAgICAgICBpZiAoIXN0b3JlSW5DYWNoZSkge1xuICAgICAgICAgICAgICAgICAgICBzY2VuZUl0ZW0uZGF0YSA9IG51bGw7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgc2NlbmVJdGVtLl9vbkxvYWRlZENhbGxiYWNrcy5sZW5ndGggPSAwO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICBzY2VuZUl0ZW0uX2xvYWRpbmcgPSB0cnVlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIExvYWRzIGFuZCBzdG9yZXMgdGhlIHNjZW5lIGRhdGEgdG8gcmVkdWNlIHRoZSBudW1iZXIgb2YgdGhlIG5ldHdvcmsgcmVxdWVzdHMgd2hlbiB0aGUgc2FtZVxuICAgICAqIHNjZW5lcyBhcmUgbG9hZGVkIG11bHRpcGxlIHRpbWVzLiBDYW4gYWxzbyBiZSB1c2VkIHRvIGxvYWQgZGF0YSBiZWZvcmUgY2FsbGluZ1xuICAgICAqIHtAbGluayBTY2VuZVJlZ2lzdHJ5I2xvYWRTY2VuZUhpZXJhcmNoeX0gYW5kIHtAbGluayBTY2VuZVJlZ2lzdHJ5I2xvYWRTY2VuZVNldHRpbmdzfSB0byBtYWtlXG4gICAgICogc2NlbmUgbG9hZGluZyBxdWlja2VyIGZvciB0aGUgdXNlci5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7U2NlbmVSZWdpc3RyeUl0ZW0gfCBzdHJpbmd9IHNjZW5lSXRlbSAtIFRoZSBzY2VuZSBpdGVtICh3aGljaCBjYW4gYmUgZm91bmQgd2l0aFxuICAgICAqIHtAbGluayBTY2VuZVJlZ2lzdHJ5I2ZpbmR9LCBVUkwgb2YgdGhlIHNjZW5lIGZpbGUgKGUuZy5cInNjZW5lX2lkLmpzb25cIikgb3IgbmFtZSBvZiB0aGUgc2NlbmUuXG4gICAgICogQHBhcmFtIHtMb2FkU2NlbmVEYXRhQ2FsbGJhY2t9IGNhbGxiYWNrIC0gVGhlIGZ1bmN0aW9uIHRvIGNhbGwgYWZ0ZXIgbG9hZGluZyxcbiAgICAgKiBwYXNzZWQgKGVyciwgc2NlbmVJdGVtKSB3aGVyZSBlcnIgaXMgbnVsbCBpZiBubyBlcnJvcnMgb2NjdXJyZWQuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBjb25zdCBzY2VuZUl0ZW0gPSBhcHAuc2NlbmVzLmZpbmQoXCJTY2VuZSBOYW1lXCIpO1xuICAgICAqIGFwcC5zY2VuZXMubG9hZFNjZW5lRGF0YShzY2VuZUl0ZW0sIGZ1bmN0aW9uIChlcnIsIHNjZW5lSXRlbSkge1xuICAgICAqICAgICBpZiAoZXJyKSB7XG4gICAgICogICAgICAgICAvLyBlcnJvclxuICAgICAqICAgICB9XG4gICAgICogfSk7XG4gICAgICovXG4gICAgbG9hZFNjZW5lRGF0YShzY2VuZUl0ZW0sIGNhbGxiYWNrKSB7XG4gICAgICAgIHRoaXMuX2xvYWRTY2VuZURhdGEoc2NlbmVJdGVtLCB0cnVlLCBjYWxsYmFjayk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVW5sb2FkcyBzY2VuZSBkYXRhIHRoYXQgaGFzIGJlZW4gbG9hZGVkIHByZXZpb3VzbHkgdXNpbmcge0BsaW5rIFNjZW5lUmVnaXN0cnkjbG9hZFNjZW5lRGF0YX0uXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1NjZW5lUmVnaXN0cnlJdGVtIHwgc3RyaW5nfSBzY2VuZUl0ZW0gLSBUaGUgc2NlbmUgaXRlbSAod2hpY2ggY2FuIGJlIGZvdW5kIHdpdGhcbiAgICAgKiB7QGxpbmsgU2NlbmVSZWdpc3RyeSNmaW5kfSBvciBVUkwgb2YgdGhlIHNjZW5lIGZpbGUuIFVzdWFsbHkgdGhpcyB3aWxsIGJlIFwic2NlbmVfaWQuanNvblwiLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogY29uc3Qgc2NlbmVJdGVtID0gYXBwLnNjZW5lcy5maW5kKFwiU2NlbmUgTmFtZVwiKTtcbiAgICAgKiBhcHAuc2NlbmVzLnVubG9hZFNjZW5lRGF0YShzY2VuZUl0ZW0pO1xuICAgICAqL1xuICAgIHVubG9hZFNjZW5lRGF0YShzY2VuZUl0ZW0pIHtcbiAgICAgICAgaWYgKHR5cGVvZiBzY2VuZUl0ZW0gPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICBzY2VuZUl0ZW0gPSB0aGlzLmZpbmRCeVVybChzY2VuZUl0ZW0pO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHNjZW5lSXRlbSkge1xuICAgICAgICAgICAgc2NlbmVJdGVtLmRhdGEgPSBudWxsO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgX2xvYWRTY2VuZUhpZXJhcmNoeShzY2VuZUl0ZW0sIG9uQmVmb3JlQWRkSGllcmFyY2h5LCBjYWxsYmFjaykge1xuICAgICAgICB0aGlzLl9sb2FkU2NlbmVEYXRhKHNjZW5lSXRlbSwgZmFsc2UsIChlcnIsIHNjZW5lSXRlbSkgPT4ge1xuICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICAgIGlmIChjYWxsYmFjaykge1xuICAgICAgICAgICAgICAgICAgICBjYWxsYmFjayhlcnIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChvbkJlZm9yZUFkZEhpZXJhcmNoeSkge1xuICAgICAgICAgICAgICAgIG9uQmVmb3JlQWRkSGllcmFyY2h5KHNjZW5lSXRlbSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IGFwcCA9IHRoaXMuX2FwcDtcblxuICAgICAgICAgICAgLy8gY2FsbGVkIGFmdGVyIHNjcmlwdHMgYXJlIHByZWxvYWRlZFxuICAgICAgICAgICAgY29uc3QgX2xvYWRlZCA9ICgpID0+IHtcbiAgICAgICAgICAgICAgICAvLyBCZWNhdXNlIHdlIG5lZWQgdG8gbG9hZCBzY3JpcHRzIGJlZm9yZSB3ZSBpbnN0YW5jZSB0aGUgaGllcmFyY2h5IChpLmUuIGJlZm9yZSB3ZSBjcmVhdGUgc2NyaXB0IGNvbXBvbmVudHMpXG4gICAgICAgICAgICAgICAgLy8gU3BsaXQgbG9hZGluZyBpbnRvIGxvYWQgYW5kIG9wZW5cbiAgICAgICAgICAgICAgICBjb25zdCBoYW5kbGVyID0gYXBwLmxvYWRlci5nZXRIYW5kbGVyKFwiaGllcmFyY2h5XCIpO1xuXG4gICAgICAgICAgICAgICAgYXBwLnN5c3RlbXMuc2NyaXB0LnByZWxvYWRpbmcgPSB0cnVlO1xuICAgICAgICAgICAgICAgIGNvbnN0IGVudGl0eSA9IGhhbmRsZXIub3BlbihzY2VuZUl0ZW0udXJsLCBzY2VuZUl0ZW0uZGF0YSk7XG5cbiAgICAgICAgICAgICAgICBhcHAuc3lzdGVtcy5zY3JpcHQucHJlbG9hZGluZyA9IGZhbHNlO1xuXG4gICAgICAgICAgICAgICAgLy8gY2xlYXIgZnJvbSBjYWNoZSBiZWNhdXNlIHRoaXMgZGF0YSBpcyBtb2RpZmllZCBieSBlbnRpdHkgb3BlcmF0aW9ucyAoZS5nLiBkZXN0cm95KVxuICAgICAgICAgICAgICAgIGFwcC5sb2FkZXIuY2xlYXJDYWNoZShzY2VuZUl0ZW0udXJsLCBcImhpZXJhcmNoeVwiKTtcblxuICAgICAgICAgICAgICAgIC8vIGFkZCB0byBoaWVyYXJjaHlcbiAgICAgICAgICAgICAgICBhcHAucm9vdC5hZGRDaGlsZChlbnRpdHkpO1xuXG4gICAgICAgICAgICAgICAgLy8gaW5pdGlhbGl6ZSBjb21wb25lbnRzXG4gICAgICAgICAgICAgICAgYXBwLnN5c3RlbXMuZmlyZSgnaW5pdGlhbGl6ZScsIGVudGl0eSk7XG4gICAgICAgICAgICAgICAgYXBwLnN5c3RlbXMuZmlyZSgncG9zdEluaXRpYWxpemUnLCBlbnRpdHkpO1xuICAgICAgICAgICAgICAgIGFwcC5zeXN0ZW1zLmZpcmUoJ3Bvc3RQb3N0SW5pdGlhbGl6ZScsIGVudGl0eSk7XG5cbiAgICAgICAgICAgICAgICBpZiAoY2FsbGJhY2spIGNhbGxiYWNrKG51bGwsIGVudGl0eSk7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAvLyBsb2FkIHByaW9yaXR5IGFuZCByZWZlcmVuY2VkIHNjcmlwdHMgYmVmb3JlIG9wZW5pbmcgc2NlbmVcbiAgICAgICAgICAgIGFwcC5fcHJlbG9hZFNjcmlwdHMoc2NlbmVJdGVtLmRhdGEsIF9sb2FkZWQpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBMb2FkIGEgc2NlbmUgZmlsZSwgY3JlYXRlIGFuZCBpbml0aWFsaXplIHRoZSBFbnRpdHkgaGllcmFyY2h5IGFuZCBhZGQgdGhlIGhpZXJhcmNoeSB0byB0aGVcbiAgICAgKiBhcHBsaWNhdGlvbiByb290IEVudGl0eS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7U2NlbmVSZWdpc3RyeUl0ZW0gfCBzdHJpbmd9IHNjZW5lSXRlbSAtIFRoZSBzY2VuZSBpdGVtICh3aGljaCBjYW4gYmUgZm91bmQgd2l0aFxuICAgICAqIHtAbGluayBTY2VuZVJlZ2lzdHJ5I2ZpbmR9LCBVUkwgb2YgdGhlIHNjZW5lIGZpbGUgKGUuZy5cInNjZW5lX2lkLmpzb25cIikgb3IgbmFtZSBvZiB0aGUgc2NlbmUuXG4gICAgICogQHBhcmFtIHtMb2FkSGllcmFyY2h5Q2FsbGJhY2t9IGNhbGxiYWNrIC0gVGhlIGZ1bmN0aW9uIHRvIGNhbGwgYWZ0ZXIgbG9hZGluZyxcbiAgICAgKiBwYXNzZWQgKGVyciwgZW50aXR5KSB3aGVyZSBlcnIgaXMgbnVsbCBpZiBubyBlcnJvcnMgb2NjdXJyZWQuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBjb25zdCBzY2VuZUl0ZW0gPSBhcHAuc2NlbmVzLmZpbmQoXCJTY2VuZSBOYW1lXCIpO1xuICAgICAqIGFwcC5zY2VuZXMubG9hZFNjZW5lSGllcmFyY2h5KHNjZW5lSXRlbSwgZnVuY3Rpb24gKGVyciwgZW50aXR5KSB7XG4gICAgICogICAgIGlmICghZXJyKSB7XG4gICAgICogICAgICAgICBjb25zdCBlID0gYXBwLnJvb3QuZmluZChcIk15IE5ldyBFbnRpdHlcIik7XG4gICAgICogICAgIH0gZWxzZSB7XG4gICAgICogICAgICAgICAvLyBlcnJvclxuICAgICAqICAgICB9XG4gICAgICogfSk7XG4gICAgICovXG4gICAgbG9hZFNjZW5lSGllcmFyY2h5KHNjZW5lSXRlbSwgY2FsbGJhY2spIHtcbiAgICAgICAgdGhpcy5fbG9hZFNjZW5lSGllcmFyY2h5KHNjZW5lSXRlbSwgbnVsbCwgY2FsbGJhY2spO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIExvYWQgYSBzY2VuZSBmaWxlIGFuZCBhcHBseSB0aGUgc2NlbmUgc2V0dGluZ3MgdG8gdGhlIGN1cnJlbnQgc2NlbmUuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1NjZW5lUmVnaXN0cnlJdGVtIHwgc3RyaW5nfSBzY2VuZUl0ZW0gLSBUaGUgc2NlbmUgaXRlbSAod2hpY2ggY2FuIGJlIGZvdW5kIHdpdGhcbiAgICAgKiB7QGxpbmsgU2NlbmVSZWdpc3RyeSNmaW5kfSwgVVJMIG9mIHRoZSBzY2VuZSBmaWxlIChlLmcuXCJzY2VuZV9pZC5qc29uXCIpIG9yIG5hbWUgb2YgdGhlIHNjZW5lLlxuICAgICAqIEBwYXJhbSB7TG9hZFNldHRpbmdzQ2FsbGJhY2t9IGNhbGxiYWNrIC0gVGhlIGZ1bmN0aW9uIGNhbGxlZCBhZnRlciB0aGUgc2V0dGluZ3NcbiAgICAgKiBhcmUgYXBwbGllZC4gUGFzc2VkIChlcnIpIHdoZXJlIGVyciBpcyBudWxsIGlmIG5vIGVycm9yIG9jY3VycmVkLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogY29uc3Qgc2NlbmVJdGVtID0gYXBwLnNjZW5lcy5maW5kKFwiU2NlbmUgTmFtZVwiKTtcbiAgICAgKiBhcHAuc2NlbmVzLmxvYWRTY2VuZVNldHRpbmdzKHNjZW5lSXRlbSwgZnVuY3Rpb24gKGVycikge1xuICAgICAqICAgICBpZiAoIWVycikge1xuICAgICAqICAgICAgICAgLy8gc3VjY2Vzc1xuICAgICAqICAgICB9IGVsc2Uge1xuICAgICAqICAgICAgICAgLy8gZXJyb3JcbiAgICAgKiAgICAgfVxuICAgICAqIH0pO1xuICAgICAqL1xuICAgIGxvYWRTY2VuZVNldHRpbmdzKHNjZW5lSXRlbSwgY2FsbGJhY2spIHtcbiAgICAgICAgdGhpcy5fbG9hZFNjZW5lRGF0YShzY2VuZUl0ZW0sIGZhbHNlLCAoZXJyLCBzY2VuZUl0ZW0pID0+IHtcbiAgICAgICAgICAgIGlmICghZXJyKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fYXBwLmFwcGx5U2NlbmVTZXR0aW5ncyhzY2VuZUl0ZW0uZGF0YS5zZXR0aW5ncyk7XG4gICAgICAgICAgICAgICAgaWYgKGNhbGxiYWNrKSB7XG4gICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKG51bGwpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgaWYgKGNhbGxiYWNrKSB7XG4gICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKGVycik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDaGFuZ2UgdG8gYSBuZXcgc2NlbmUuIENhbGxpbmcgdGhpcyBmdW5jdGlvbiB3aWxsIGxvYWQgdGhlIHNjZW5lIGRhdGEsIGRlbGV0ZSBhbGxcbiAgICAgKiBlbnRpdGllcyBhbmQgZ3JhcGggbm9kZXMgdW5kZXIgYGFwcC5yb290YCBhbmQgbG9hZCB0aGUgc2NlbmUgc2V0dGluZ3MgYW5kIGhpZXJhcmNoeS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7U2NlbmVSZWdpc3RyeUl0ZW0gfCBzdHJpbmd9IHNjZW5lSXRlbSAtIFRoZSBzY2VuZSBpdGVtICh3aGljaCBjYW4gYmUgZm91bmQgd2l0aFxuICAgICAqIHtAbGluayBTY2VuZVJlZ2lzdHJ5I2ZpbmR9LCBVUkwgb2YgdGhlIHNjZW5lIGZpbGUgKGUuZy5cInNjZW5lX2lkLmpzb25cIikgb3IgbmFtZSBvZiB0aGUgc2NlbmUuXG4gICAgICogQHBhcmFtIHtDaGFuZ2VTY2VuZUNhbGxiYWNrfSBbY2FsbGJhY2tdIC0gVGhlIGZ1bmN0aW9uIHRvIGNhbGwgYWZ0ZXIgbG9hZGluZyxcbiAgICAgKiBwYXNzZWQgKGVyciwgZW50aXR5KSB3aGVyZSBlcnIgaXMgbnVsbCBpZiBubyBlcnJvcnMgb2NjdXJyZWQuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBhcHAuc2NlbmVzLmNoYW5nZVNjZW5lKFwiU2NlbmUgTmFtZVwiLCBmdW5jdGlvbiAoZXJyLCBlbnRpdHkpIHtcbiAgICAgKiAgICAgaWYgKCFlcnIpIHtcbiAgICAgKiAgICAgICAgIC8vIHN1Y2Nlc3NcbiAgICAgKiAgICAgfSBlbHNlIHtcbiAgICAgKiAgICAgICAgIC8vIGVycm9yXG4gICAgICogICAgIH1cbiAgICAgKiB9KTtcbiAgICAgKi9cbiAgICBjaGFuZ2VTY2VuZShzY2VuZUl0ZW0sIGNhbGxiYWNrKSB7XG4gICAgICAgIGNvbnN0IGFwcCA9IHRoaXMuX2FwcDtcblxuICAgICAgICBjb25zdCBvbkJlZm9yZUFkZEhpZXJhcmNoeSA9IChzY2VuZUl0ZW0pID0+IHtcbiAgICAgICAgICAgIC8vIERlc3Ryb3kgYWxsIG5vZGVzIG9uIHRoZSBhcHAucm9vdFxuICAgICAgICAgICAgY29uc3QgeyBjaGlsZHJlbiB9ID0gYXBwLnJvb3Q7XG4gICAgICAgICAgICB3aGlsZSAoY2hpbGRyZW4ubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgY2hpbGRyZW5bMF0uZGVzdHJveSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYXBwLmFwcGx5U2NlbmVTZXR0aW5ncyhzY2VuZUl0ZW0uZGF0YS5zZXR0aW5ncyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgdGhpcy5fbG9hZFNjZW5lSGllcmFyY2h5KHNjZW5lSXRlbSwgb25CZWZvcmVBZGRIaWVyYXJjaHksIGNhbGxiYWNrKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBMb2FkIHRoZSBzY2VuZSBoaWVyYXJjaHkgYW5kIHNjZW5lIHNldHRpbmdzLiBUaGlzIGlzIGFuIGludGVybmFsIG1ldGhvZCB1c2VkIGJ5IHRoZVxuICAgICAqIHtAbGluayBBcHBCYXNlfS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSB1cmwgLSBUaGUgVVJMIG9mIHRoZSBzY2VuZSBmaWxlLlxuICAgICAqIEBwYXJhbSB7TG9hZFNjZW5lQ2FsbGJhY2t9IGNhbGxiYWNrIC0gVGhlIGZ1bmN0aW9uIGNhbGxlZCBhZnRlciB0aGUgc2V0dGluZ3MgYXJlXG4gICAgICogYXBwbGllZC4gUGFzc2VkIChlcnIsIHNjZW5lKSB3aGVyZSBlcnIgaXMgbnVsbCBpZiBubyBlcnJvciBvY2N1cnJlZCBhbmQgc2NlbmUgaXMgdGhlXG4gICAgICoge0BsaW5rIFNjZW5lfS5cbiAgICAgKi9cbiAgICBsb2FkU2NlbmUodXJsLCBjYWxsYmFjaykge1xuICAgICAgICBjb25zdCBhcHAgPSB0aGlzLl9hcHA7XG5cbiAgICAgICAgY29uc3QgaGFuZGxlciA9IGFwcC5sb2FkZXIuZ2V0SGFuZGxlcihcInNjZW5lXCIpO1xuXG4gICAgICAgIC8vIGluY2x1ZGUgYXNzZXQgcHJlZml4IGlmIHByZXNlbnRcbiAgICAgICAgaWYgKGFwcC5hc3NldHMgJiYgYXBwLmFzc2V0cy5wcmVmaXggJiYgIUFCU09MVVRFX1VSTC50ZXN0KHVybCkpIHtcbiAgICAgICAgICAgIHVybCA9IHBhdGguam9pbihhcHAuYXNzZXRzLnByZWZpeCwgdXJsKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGhhbmRsZXIubG9hZCh1cmwsIChlcnIsIGRhdGEpID0+IHtcbiAgICAgICAgICAgIGlmICghZXJyKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgX2xvYWRlZCA9ICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgLy8gcGFyc2UgYW5kIGNyZWF0ZSBzY2VuZVxuICAgICAgICAgICAgICAgICAgICBhcHAuc3lzdGVtcy5zY3JpcHQucHJlbG9hZGluZyA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHNjZW5lID0gaGFuZGxlci5vcGVuKHVybCwgZGF0YSk7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gQ2FjaGUgdGhlIGRhdGEgYXMgd2UgYXJlIGxvYWRpbmcgdmlhIFVSTCBvbmx5XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHNjZW5lSXRlbSA9IHRoaXMuZmluZEJ5VXJsKHVybCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChzY2VuZUl0ZW0gJiYgIXNjZW5lSXRlbS5sb2FkZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNjZW5lSXRlbS5kYXRhID0gZGF0YTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGFwcC5zeXN0ZW1zLnNjcmlwdC5wcmVsb2FkaW5nID0gZmFsc2U7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gY2xlYXIgc2NlbmUgZnJvbSBjYWNoZSBiZWNhdXNlIHdlJ2xsIGRlc3Ryb3kgaXQgd2hlbiB3ZSBsb2FkIGFub3RoZXIgb25lXG4gICAgICAgICAgICAgICAgICAgIC8vIHNvIGRhdGEgd2lsbCBiZSBpbnZhbGlkXG4gICAgICAgICAgICAgICAgICAgIGFwcC5sb2FkZXIuY2xlYXJDYWNoZSh1cmwsIFwic2NlbmVcIik7XG5cbiAgICAgICAgICAgICAgICAgICAgYXBwLmxvYWRlci5wYXRjaCh7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXNvdXJjZTogc2NlbmUsXG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiBcInNjZW5lXCJcbiAgICAgICAgICAgICAgICAgICAgfSwgYXBwLmFzc2V0cyk7XG5cbiAgICAgICAgICAgICAgICAgICAgYXBwLnJvb3QuYWRkQ2hpbGQoc2NlbmUucm9vdCk7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gSW5pdGlhbGl6ZSBwYWNrIHNldHRpbmdzXG4gICAgICAgICAgICAgICAgICAgIGlmIChhcHAuc3lzdGVtcy5yaWdpZGJvZHkgJiYgdHlwZW9mIEFtbW8gIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhcHAuc3lzdGVtcy5yaWdpZGJvZHkuZ3Jhdml0eS5zZXQoc2NlbmUuX2dyYXZpdHkueCwgc2NlbmUuX2dyYXZpdHkueSwgc2NlbmUuX2dyYXZpdHkueik7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBpZiAoY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsIHNjZW5lKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgICAvLyBwcmVsb2FkIHNjcmlwdHMgYmVmb3JlIG9wZW5pbmcgc2NlbmVcbiAgICAgICAgICAgICAgICBhcHAuX3ByZWxvYWRTY3JpcHRzKGRhdGEsIF9sb2FkZWQpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBpZiAoY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2soZXJyKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cbn1cblxuZXhwb3J0IHsgU2NlbmVSZWdpc3RyeSB9O1xuIl0sIm5hbWVzIjpbIlNjZW5lUmVnaXN0cnkiLCJjb25zdHJ1Y3RvciIsImFwcCIsIl9hcHAiLCJfbGlzdCIsIl9pbmRleCIsIl91cmxJbmRleCIsImRlc3Ryb3kiLCJsaXN0IiwiYWRkIiwibmFtZSIsInVybCIsImhhc093blByb3BlcnR5IiwiRGVidWciLCJ3YXJuIiwiaXRlbSIsIlNjZW5lUmVnaXN0cnlJdGVtIiwiaSIsInB1c2giLCJmaW5kIiwiZmluZEJ5VXJsIiwicmVtb3ZlIiwiaWR4Iiwic3BsaWNlIiwibGVuZ3RoIiwiX2xvYWRTY2VuZURhdGEiLCJzY2VuZUl0ZW0iLCJzdG9yZUluQ2FjaGUiLCJjYWxsYmFjayIsImxvYWRlZCIsImFzc2V0cyIsInByZWZpeCIsIkFCU09MVVRFX1VSTCIsInRlc3QiLCJwYXRoIiwiam9pbiIsIl9vbkxvYWRlZENhbGxiYWNrcyIsIl9sb2FkaW5nIiwiaGFuZGxlciIsImxvYWRlciIsImdldEhhbmRsZXIiLCJsb2FkIiwiZXJyIiwiZGF0YSIsImxvYWRTY2VuZURhdGEiLCJ1bmxvYWRTY2VuZURhdGEiLCJfbG9hZFNjZW5lSGllcmFyY2h5Iiwib25CZWZvcmVBZGRIaWVyYXJjaHkiLCJfbG9hZGVkIiwic3lzdGVtcyIsInNjcmlwdCIsInByZWxvYWRpbmciLCJlbnRpdHkiLCJvcGVuIiwiY2xlYXJDYWNoZSIsInJvb3QiLCJhZGRDaGlsZCIsImZpcmUiLCJfcHJlbG9hZFNjcmlwdHMiLCJsb2FkU2NlbmVIaWVyYXJjaHkiLCJsb2FkU2NlbmVTZXR0aW5ncyIsImFwcGx5U2NlbmVTZXR0aW5ncyIsInNldHRpbmdzIiwiY2hhbmdlU2NlbmUiLCJjaGlsZHJlbiIsImxvYWRTY2VuZSIsInNjZW5lIiwicGF0Y2giLCJyZXNvdXJjZSIsInR5cGUiLCJyaWdpZGJvZHkiLCJBbW1vIiwiZ3Jhdml0eSIsInNldCIsIl9ncmF2aXR5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
