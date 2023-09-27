/**
 * Item to be stored in the {@link SceneRegistry}.
 *
 * @category Graphics
 */
class SceneRegistryItem {
  /**
   * Creates a new SceneRegistryItem instance.
   *
   * @param {string} name - The name of the scene.
   * @param {string} url - The url of the scene file.
   */
  constructor(name, url) {
    /**
     * The name of the scene.
     *
     * @type {string}
     */
    this.name = void 0;
    /**
     * The url of the scene file.
     *
     * @type {string}
     */
    this.url = void 0;
    /** @ignore */
    this.data = null;
    /** @private */
    this._loading = false;
    /** @private */
    this._onLoadedCallbacks = [];
    this.name = name;
    this.url = url;
  }

  /**
   * Returns true if the scene data has loaded.
   *
   * @type {boolean}
   */
  get loaded() {
    return !!this.data;
  }

  /**
   * Returns true if the scene data is still being loaded.
   *
   * @type {boolean}
   */
  get loading() {
    return this._loading;
  }
}

export { SceneRegistryItem };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NlbmUtcmVnaXN0cnktaXRlbS5qcyIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL2ZyYW1ld29yay9zY2VuZS1yZWdpc3RyeS1pdGVtLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogSXRlbSB0byBiZSBzdG9yZWQgaW4gdGhlIHtAbGluayBTY2VuZVJlZ2lzdHJ5fS5cbiAqXG4gKiBAY2F0ZWdvcnkgR3JhcGhpY3NcbiAqL1xuY2xhc3MgU2NlbmVSZWdpc3RyeUl0ZW0ge1xuICAgIC8qKlxuICAgICAqIFRoZSBuYW1lIG9mIHRoZSBzY2VuZS5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtzdHJpbmd9XG4gICAgICovXG4gICAgbmFtZTtcblxuICAgIC8qKlxuICAgICAqIFRoZSB1cmwgb2YgdGhlIHNjZW5lIGZpbGUuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7c3RyaW5nfVxuICAgICAqL1xuICAgIHVybDtcblxuICAgIC8qKiBAaWdub3JlICovXG4gICAgZGF0YSA9IG51bGw7XG5cbiAgICAvKiogQHByaXZhdGUgKi9cbiAgICBfbG9hZGluZyA9IGZhbHNlO1xuXG4gICAgLyoqIEBwcml2YXRlICovXG4gICAgX29uTG9hZGVkQ2FsbGJhY2tzID0gW107XG5cbiAgICAvKipcbiAgICAgKiBDcmVhdGVzIGEgbmV3IFNjZW5lUmVnaXN0cnlJdGVtIGluc3RhbmNlLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IG5hbWUgLSBUaGUgbmFtZSBvZiB0aGUgc2NlbmUuXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IHVybCAtIFRoZSB1cmwgb2YgdGhlIHNjZW5lIGZpbGUuXG4gICAgICovXG4gICAgY29uc3RydWN0b3IobmFtZSwgdXJsKSB7XG4gICAgICAgIHRoaXMubmFtZSA9IG5hbWU7XG4gICAgICAgIHRoaXMudXJsID0gdXJsO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdHJ1ZSBpZiB0aGUgc2NlbmUgZGF0YSBoYXMgbG9hZGVkLlxuICAgICAqXG4gICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICovXG4gICAgZ2V0IGxvYWRlZCgpIHtcbiAgICAgICAgcmV0dXJuICEhdGhpcy5kYXRhO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdHJ1ZSBpZiB0aGUgc2NlbmUgZGF0YSBpcyBzdGlsbCBiZWluZyBsb2FkZWQuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICAgKi9cbiAgICBnZXQgbG9hZGluZygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2xvYWRpbmc7XG4gICAgfVxufVxuXG5leHBvcnQgeyBTY2VuZVJlZ2lzdHJ5SXRlbSB9O1xuIl0sIm5hbWVzIjpbIlNjZW5lUmVnaXN0cnlJdGVtIiwiY29uc3RydWN0b3IiLCJuYW1lIiwidXJsIiwiZGF0YSIsIl9sb2FkaW5nIiwiX29uTG9hZGVkQ2FsbGJhY2tzIiwibG9hZGVkIiwibG9hZGluZyJdLCJtYXBwaW5ncyI6IkFBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLE1BQU1BLGlCQUFpQixDQUFDO0FBd0JwQjtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDSUMsRUFBQUEsV0FBV0EsQ0FBQ0MsSUFBSSxFQUFFQyxHQUFHLEVBQUU7QUE3QnZCO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFKSSxJQUFBLElBQUEsQ0FLQUQsSUFBSSxHQUFBLEtBQUEsQ0FBQSxDQUFBO0FBRUo7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUpJLElBQUEsSUFBQSxDQUtBQyxHQUFHLEdBQUEsS0FBQSxDQUFBLENBQUE7QUFFSDtJQUFBLElBQ0FDLENBQUFBLElBQUksR0FBRyxJQUFJLENBQUE7QUFFWDtJQUFBLElBQ0FDLENBQUFBLFFBQVEsR0FBRyxLQUFLLENBQUE7QUFFaEI7SUFBQSxJQUNBQyxDQUFBQSxrQkFBa0IsR0FBRyxFQUFFLENBQUE7SUFTbkIsSUFBSSxDQUFDSixJQUFJLEdBQUdBLElBQUksQ0FBQTtJQUNoQixJQUFJLENBQUNDLEdBQUcsR0FBR0EsR0FBRyxDQUFBO0FBQ2xCLEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtFQUNJLElBQUlJLE1BQU1BLEdBQUc7QUFDVCxJQUFBLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQ0gsSUFBSSxDQUFBO0FBQ3RCLEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtFQUNJLElBQUlJLE9BQU9BLEdBQUc7SUFDVixPQUFPLElBQUksQ0FBQ0gsUUFBUSxDQUFBO0FBQ3hCLEdBQUE7QUFDSjs7OzsifQ==
