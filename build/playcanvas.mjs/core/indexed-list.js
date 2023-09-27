/**
 * A ordered list-type data structure that can provide item look up by key and can also return a list.
 *
 * @ignore
 */
class IndexedList {
  constructor() {
    /**
     * @type {object[]}
     * @private
     */
    this._list = [];
    /**
     * @type {Object<string, number>}
     * @private
     */
    this._index = {};
  }
  /**
   * Add a new item into the list with a index key.
   *
   * @param {string} key - Key used to look up item in index.
   * @param {object} item - Item to be stored.
   */
  push(key, item) {
    if (this._index[key]) {
      throw Error('Key already in index ' + key);
    }
    const location = this._list.push(item) - 1;
    this._index[key] = location;
  }

  /**
   * Test whether a key has been added to the index.
   *
   * @param {string} key - The key to test.
   * @returns {boolean} Returns true if key is in the index, false if not.
   */
  has(key) {
    return this._index[key] !== undefined;
  }

  /**
   * Return the item indexed by a key.
   *
   * @param {string} key - The key of the item to retrieve.
   * @returns {object|null} The item stored at key. Returns null if key is not in the index.
   */
  get(key) {
    const location = this._index[key];
    if (location !== undefined) {
      return this._list[location];
    }
    return null;
  }

  /**
   * Remove the item indexed by key from the list.
   *
   * @param {string} key - The key at which to remove the item.
   * @returns {boolean} Returns true if the key exists and an item was removed, returns false if
   * no item was removed.
   */
  remove(key) {
    const location = this._index[key];
    if (location !== undefined) {
      this._list.splice(location, 1);
      delete this._index[key];

      // update index
      for (key in this._index) {
        const idx = this._index[key];
        if (idx > location) {
          this._index[key] = idx - 1;
        }
      }
      return true;
    }
    return false;
  }

  /**
   * Returns the list of items.
   *
   * @returns {object[]} The list of items.
   */
  list() {
    return this._list;
  }

  /**
   * Remove all items from the list.
   */
  clear() {
    this._list.length = 0;
    for (const prop in this._index) {
      delete this._index[prop];
    }
  }
}

export { IndexedList };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXhlZC1saXN0LmpzIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvY29yZS9pbmRleGVkLWxpc3QuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBBIG9yZGVyZWQgbGlzdC10eXBlIGRhdGEgc3RydWN0dXJlIHRoYXQgY2FuIHByb3ZpZGUgaXRlbSBsb29rIHVwIGJ5IGtleSBhbmQgY2FuIGFsc28gcmV0dXJuIGEgbGlzdC5cbiAqXG4gKiBAaWdub3JlXG4gKi9cbmNsYXNzIEluZGV4ZWRMaXN0IHtcbiAgICAvKipcbiAgICAgKiBAdHlwZSB7b2JqZWN0W119XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfbGlzdCA9IFtdO1xuXG4gICAgLyoqXG4gICAgICogQHR5cGUge09iamVjdDxzdHJpbmcsIG51bWJlcj59XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfaW5kZXggPSB7fTtcblxuICAgIC8qKlxuICAgICAqIEFkZCBhIG5ldyBpdGVtIGludG8gdGhlIGxpc3Qgd2l0aCBhIGluZGV4IGtleS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBrZXkgLSBLZXkgdXNlZCB0byBsb29rIHVwIGl0ZW0gaW4gaW5kZXguXG4gICAgICogQHBhcmFtIHtvYmplY3R9IGl0ZW0gLSBJdGVtIHRvIGJlIHN0b3JlZC5cbiAgICAgKi9cbiAgICBwdXNoKGtleSwgaXRlbSkge1xuICAgICAgICBpZiAodGhpcy5faW5kZXhba2V5XSkge1xuICAgICAgICAgICAgdGhyb3cgRXJyb3IoJ0tleSBhbHJlYWR5IGluIGluZGV4ICcgKyBrZXkpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGxvY2F0aW9uID0gdGhpcy5fbGlzdC5wdXNoKGl0ZW0pIC0gMTtcbiAgICAgICAgdGhpcy5faW5kZXhba2V5XSA9IGxvY2F0aW9uO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRlc3Qgd2hldGhlciBhIGtleSBoYXMgYmVlbiBhZGRlZCB0byB0aGUgaW5kZXguXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30ga2V5IC0gVGhlIGtleSB0byB0ZXN0LlxuICAgICAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIHRydWUgaWYga2V5IGlzIGluIHRoZSBpbmRleCwgZmFsc2UgaWYgbm90LlxuICAgICAqL1xuICAgIGhhcyhrZXkpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2luZGV4W2tleV0gIT09IHVuZGVmaW5lZDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm4gdGhlIGl0ZW0gaW5kZXhlZCBieSBhIGtleS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBrZXkgLSBUaGUga2V5IG9mIHRoZSBpdGVtIHRvIHJldHJpZXZlLlxuICAgICAqIEByZXR1cm5zIHtvYmplY3R8bnVsbH0gVGhlIGl0ZW0gc3RvcmVkIGF0IGtleS4gUmV0dXJucyBudWxsIGlmIGtleSBpcyBub3QgaW4gdGhlIGluZGV4LlxuICAgICAqL1xuICAgIGdldChrZXkpIHtcbiAgICAgICAgY29uc3QgbG9jYXRpb24gPSB0aGlzLl9pbmRleFtrZXldO1xuICAgICAgICBpZiAobG9jYXRpb24gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2xpc3RbbG9jYXRpb25dO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJlbW92ZSB0aGUgaXRlbSBpbmRleGVkIGJ5IGtleSBmcm9tIHRoZSBsaXN0LlxuICAgICAqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IGtleSAtIFRoZSBrZXkgYXQgd2hpY2ggdG8gcmVtb3ZlIHRoZSBpdGVtLlxuICAgICAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIHRydWUgaWYgdGhlIGtleSBleGlzdHMgYW5kIGFuIGl0ZW0gd2FzIHJlbW92ZWQsIHJldHVybnMgZmFsc2UgaWZcbiAgICAgKiBubyBpdGVtIHdhcyByZW1vdmVkLlxuICAgICAqL1xuICAgIHJlbW92ZShrZXkpIHtcbiAgICAgICAgY29uc3QgbG9jYXRpb24gPSB0aGlzLl9pbmRleFtrZXldO1xuICAgICAgICBpZiAobG9jYXRpb24gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhpcy5fbGlzdC5zcGxpY2UobG9jYXRpb24sIDEpO1xuICAgICAgICAgICAgZGVsZXRlIHRoaXMuX2luZGV4W2tleV07XG5cbiAgICAgICAgICAgIC8vIHVwZGF0ZSBpbmRleFxuICAgICAgICAgICAgZm9yIChrZXkgaW4gdGhpcy5faW5kZXgpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBpZHggPSB0aGlzLl9pbmRleFtrZXldO1xuICAgICAgICAgICAgICAgIGlmIChpZHggPiBsb2NhdGlvbikge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9pbmRleFtrZXldID0gaWR4IC0gMTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBsaXN0IG9mIGl0ZW1zLlxuICAgICAqXG4gICAgICogQHJldHVybnMge29iamVjdFtdfSBUaGUgbGlzdCBvZiBpdGVtcy5cbiAgICAgKi9cbiAgICBsaXN0KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fbGlzdDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZW1vdmUgYWxsIGl0ZW1zIGZyb20gdGhlIGxpc3QuXG4gICAgICovXG4gICAgY2xlYXIoKSB7XG4gICAgICAgIHRoaXMuX2xpc3QubGVuZ3RoID0gMDtcblxuICAgICAgICBmb3IgKGNvbnN0IHByb3AgaW4gdGhpcy5faW5kZXgpIHtcbiAgICAgICAgICAgIGRlbGV0ZSB0aGlzLl9pbmRleFtwcm9wXTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuZXhwb3J0IHsgSW5kZXhlZExpc3QgfTtcbiJdLCJuYW1lcyI6WyJJbmRleGVkTGlzdCIsImNvbnN0cnVjdG9yIiwiX2xpc3QiLCJfaW5kZXgiLCJwdXNoIiwia2V5IiwiaXRlbSIsIkVycm9yIiwibG9jYXRpb24iLCJoYXMiLCJ1bmRlZmluZWQiLCJnZXQiLCJyZW1vdmUiLCJzcGxpY2UiLCJpZHgiLCJsaXN0IiwiY2xlYXIiLCJsZW5ndGgiLCJwcm9wIl0sIm1hcHBpbmdzIjoiQUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsTUFBTUEsV0FBVyxDQUFDO0VBQUFDLFdBQUEsR0FBQTtBQUNkO0FBQ0o7QUFDQTtBQUNBO0lBSEksSUFJQUMsQ0FBQUEsS0FBSyxHQUFHLEVBQUUsQ0FBQTtBQUVWO0FBQ0o7QUFDQTtBQUNBO0lBSEksSUFJQUMsQ0FBQUEsTUFBTSxHQUFHLEVBQUUsQ0FBQTtBQUFBLEdBQUE7QUFFWDtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDSUMsRUFBQUEsSUFBSUEsQ0FBQ0MsR0FBRyxFQUFFQyxJQUFJLEVBQUU7QUFDWixJQUFBLElBQUksSUFBSSxDQUFDSCxNQUFNLENBQUNFLEdBQUcsQ0FBQyxFQUFFO0FBQ2xCLE1BQUEsTUFBTUUsS0FBSyxDQUFDLHVCQUF1QixHQUFHRixHQUFHLENBQUMsQ0FBQTtBQUM5QyxLQUFBO0lBQ0EsTUFBTUcsUUFBUSxHQUFHLElBQUksQ0FBQ04sS0FBSyxDQUFDRSxJQUFJLENBQUNFLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQTtBQUMxQyxJQUFBLElBQUksQ0FBQ0gsTUFBTSxDQUFDRSxHQUFHLENBQUMsR0FBR0csUUFBUSxDQUFBO0FBQy9CLEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0VBQ0lDLEdBQUdBLENBQUNKLEdBQUcsRUFBRTtBQUNMLElBQUEsT0FBTyxJQUFJLENBQUNGLE1BQU0sQ0FBQ0UsR0FBRyxDQUFDLEtBQUtLLFNBQVMsQ0FBQTtBQUN6QyxHQUFBOztBQUVBO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtFQUNJQyxHQUFHQSxDQUFDTixHQUFHLEVBQUU7QUFDTCxJQUFBLE1BQU1HLFFBQVEsR0FBRyxJQUFJLENBQUNMLE1BQU0sQ0FBQ0UsR0FBRyxDQUFDLENBQUE7SUFDakMsSUFBSUcsUUFBUSxLQUFLRSxTQUFTLEVBQUU7QUFDeEIsTUFBQSxPQUFPLElBQUksQ0FBQ1IsS0FBSyxDQUFDTSxRQUFRLENBQUMsQ0FBQTtBQUMvQixLQUFBO0FBQ0EsSUFBQSxPQUFPLElBQUksQ0FBQTtBQUNmLEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7RUFDSUksTUFBTUEsQ0FBQ1AsR0FBRyxFQUFFO0FBQ1IsSUFBQSxNQUFNRyxRQUFRLEdBQUcsSUFBSSxDQUFDTCxNQUFNLENBQUNFLEdBQUcsQ0FBQyxDQUFBO0lBQ2pDLElBQUlHLFFBQVEsS0FBS0UsU0FBUyxFQUFFO01BQ3hCLElBQUksQ0FBQ1IsS0FBSyxDQUFDVyxNQUFNLENBQUNMLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQTtBQUM5QixNQUFBLE9BQU8sSUFBSSxDQUFDTCxNQUFNLENBQUNFLEdBQUcsQ0FBQyxDQUFBOztBQUV2QjtBQUNBLE1BQUEsS0FBS0EsR0FBRyxJQUFJLElBQUksQ0FBQ0YsTUFBTSxFQUFFO0FBQ3JCLFFBQUEsTUFBTVcsR0FBRyxHQUFHLElBQUksQ0FBQ1gsTUFBTSxDQUFDRSxHQUFHLENBQUMsQ0FBQTtRQUM1QixJQUFJUyxHQUFHLEdBQUdOLFFBQVEsRUFBRTtVQUNoQixJQUFJLENBQUNMLE1BQU0sQ0FBQ0UsR0FBRyxDQUFDLEdBQUdTLEdBQUcsR0FBRyxDQUFDLENBQUE7QUFDOUIsU0FBQTtBQUNKLE9BQUE7QUFDQSxNQUFBLE9BQU8sSUFBSSxDQUFBO0FBQ2YsS0FBQTtBQUVBLElBQUEsT0FBTyxLQUFLLENBQUE7QUFDaEIsR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0lDLEVBQUFBLElBQUlBLEdBQUc7SUFDSCxPQUFPLElBQUksQ0FBQ2IsS0FBSyxDQUFBO0FBQ3JCLEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0ljLEVBQUFBLEtBQUtBLEdBQUc7QUFDSixJQUFBLElBQUksQ0FBQ2QsS0FBSyxDQUFDZSxNQUFNLEdBQUcsQ0FBQyxDQUFBO0FBRXJCLElBQUEsS0FBSyxNQUFNQyxJQUFJLElBQUksSUFBSSxDQUFDZixNQUFNLEVBQUU7QUFDNUIsTUFBQSxPQUFPLElBQUksQ0FBQ0EsTUFBTSxDQUFDZSxJQUFJLENBQUMsQ0FBQTtBQUM1QixLQUFBO0FBQ0osR0FBQTtBQUNKOzs7OyJ9
