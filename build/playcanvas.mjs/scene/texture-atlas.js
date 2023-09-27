import { EventHandler } from '../core/event-handler.js';

/**
 * A TextureAtlas contains a number of frames from a texture. Each frame defines a region in a
 * texture. The TextureAtlas is referenced by {@link Sprite}s.
 *
 * @augments EventHandler
 * @category Graphics
 */
class TextureAtlas extends EventHandler {
  /**
   * Create a new TextureAtlas instance.
   *
   * @example
   * const atlas = new pc.TextureAtlas();
   * atlas.frames = {
   *     '0': {
   *         // rect has u, v, width and height in pixels
   *         rect: new pc.Vec4(0, 0, 256, 256),
   *         // pivot has x, y values between 0-1 which define the point
   *         // within the frame around which rotation and scale is calculated
   *         pivot: new pc.Vec2(0.5, 0.5),
   *         // border has left, bottom, right and top in pixels defining regions for 9-slicing
   *         border: new pc.Vec4(5, 5, 5, 5)
   *     },
   *     '1': {
   *         rect: new pc.Vec4(256, 0, 256, 256),
   *         pivot: new pc.Vec2(0.5, 0.5),
   *         border: new pc.Vec4(5, 5, 5, 5)
   *     }
   * };
   */
  constructor() {
    super();

    /**
     * @type {import('../platform/graphics/texture.js').Texture}
     * @private
     */
    this._texture = null;
    /**
     * @type {object}
     * @private
     */
    this._frames = null;
  }

  /**
   * The texture used by the atlas.
   *
   * @type {import('../platform/graphics/texture.js').Texture}
   */
  set texture(value) {
    this._texture = value;
    this.fire('set:texture', value);
  }
  get texture() {
    return this._texture;
  }

  /**
   * Contains frames which define portions of the texture atlas.
   *
   * @type {object}
   */
  set frames(value) {
    this._frames = value;
    this.fire('set:frames', value);
  }
  get frames() {
    return this._frames;
  }

  /**
   * Set a new frame in the texture atlas.
   *
   * @param {string} key - The key of the frame.
   * @param {object} data - The properties of the frame.
   * @param {import('../core/math/vec4.js').Vec4} data.rect - The u, v, width, height properties
   * of the frame in pixels.
   * @param {import('../core/math/vec2.js').Vec2} data.pivot - The pivot of the frame - values
   * are between 0-1.
   * @param {import('../core/math/vec4.js').Vec4} data.border - The border of the frame for
   * 9-slicing. Values are ordered as follows: left, bottom, right, top border in pixels.
   * @example
   * atlas.setFrame('1', {
   *     rect: new pc.Vec4(0, 0, 128, 128),
   *     pivot: new pc.Vec2(0.5, 0.5),
   *     border: new pc.Vec4(5, 5, 5, 5)
   * });
   */
  setFrame(key, data) {
    let frame = this._frames[key];
    if (!frame) {
      frame = {
        rect: data.rect.clone(),
        pivot: data.pivot.clone(),
        border: data.border.clone()
      };
      this._frames[key] = frame;
    } else {
      frame.rect.copy(data.rect);
      frame.pivot.copy(data.pivot);
      frame.border.copy(data.border);
    }
    this.fire('set:frame', key.toString(), frame);
  }

  /**
   * Removes a frame from the texture atlas.
   *
   * @param {string} key - The key of the frame.
   * @example
   * atlas.removeFrame('1');
   */
  removeFrame(key) {
    const frame = this._frames[key];
    if (frame) {
      delete this._frames[key];
      this.fire('remove:frame', key.toString(), frame);
    }
  }

  /**
   * Free up the underlying texture owned by the atlas.
   */
  destroy() {
    if (this._texture) {
      this._texture.destroy();
    }
  }
}

export { TextureAtlas };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGV4dHVyZS1hdGxhcy5qcyIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL3NjZW5lL3RleHR1cmUtYXRsYXMuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgRXZlbnRIYW5kbGVyIH0gZnJvbSAnLi4vY29yZS9ldmVudC1oYW5kbGVyLmpzJztcblxuLyoqXG4gKiBBIFRleHR1cmVBdGxhcyBjb250YWlucyBhIG51bWJlciBvZiBmcmFtZXMgZnJvbSBhIHRleHR1cmUuIEVhY2ggZnJhbWUgZGVmaW5lcyBhIHJlZ2lvbiBpbiBhXG4gKiB0ZXh0dXJlLiBUaGUgVGV4dHVyZUF0bGFzIGlzIHJlZmVyZW5jZWQgYnkge0BsaW5rIFNwcml0ZX1zLlxuICpcbiAqIEBhdWdtZW50cyBFdmVudEhhbmRsZXJcbiAqIEBjYXRlZ29yeSBHcmFwaGljc1xuICovXG5jbGFzcyBUZXh0dXJlQXRsYXMgZXh0ZW5kcyBFdmVudEhhbmRsZXIge1xuICAgIC8qKlxuICAgICAqIENyZWF0ZSBhIG5ldyBUZXh0dXJlQXRsYXMgaW5zdGFuY2UuXG4gICAgICpcbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGNvbnN0IGF0bGFzID0gbmV3IHBjLlRleHR1cmVBdGxhcygpO1xuICAgICAqIGF0bGFzLmZyYW1lcyA9IHtcbiAgICAgKiAgICAgJzAnOiB7XG4gICAgICogICAgICAgICAvLyByZWN0IGhhcyB1LCB2LCB3aWR0aCBhbmQgaGVpZ2h0IGluIHBpeGVsc1xuICAgICAqICAgICAgICAgcmVjdDogbmV3IHBjLlZlYzQoMCwgMCwgMjU2LCAyNTYpLFxuICAgICAqICAgICAgICAgLy8gcGl2b3QgaGFzIHgsIHkgdmFsdWVzIGJldHdlZW4gMC0xIHdoaWNoIGRlZmluZSB0aGUgcG9pbnRcbiAgICAgKiAgICAgICAgIC8vIHdpdGhpbiB0aGUgZnJhbWUgYXJvdW5kIHdoaWNoIHJvdGF0aW9uIGFuZCBzY2FsZSBpcyBjYWxjdWxhdGVkXG4gICAgICogICAgICAgICBwaXZvdDogbmV3IHBjLlZlYzIoMC41LCAwLjUpLFxuICAgICAqICAgICAgICAgLy8gYm9yZGVyIGhhcyBsZWZ0LCBib3R0b20sIHJpZ2h0IGFuZCB0b3AgaW4gcGl4ZWxzIGRlZmluaW5nIHJlZ2lvbnMgZm9yIDktc2xpY2luZ1xuICAgICAqICAgICAgICAgYm9yZGVyOiBuZXcgcGMuVmVjNCg1LCA1LCA1LCA1KVxuICAgICAqICAgICB9LFxuICAgICAqICAgICAnMSc6IHtcbiAgICAgKiAgICAgICAgIHJlY3Q6IG5ldyBwYy5WZWM0KDI1NiwgMCwgMjU2LCAyNTYpLFxuICAgICAqICAgICAgICAgcGl2b3Q6IG5ldyBwYy5WZWMyKDAuNSwgMC41KSxcbiAgICAgKiAgICAgICAgIGJvcmRlcjogbmV3IHBjLlZlYzQoNSwgNSwgNSwgNSlcbiAgICAgKiAgICAgfVxuICAgICAqIH07XG4gICAgICovXG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIHN1cGVyKCk7XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEB0eXBlIHtpbXBvcnQoJy4uL3BsYXRmb3JtL2dyYXBoaWNzL3RleHR1cmUuanMnKS5UZXh0dXJlfVxuICAgICAgICAgKiBAcHJpdmF0ZVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5fdGV4dHVyZSA9IG51bGw7XG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAdHlwZSB7b2JqZWN0fVxuICAgICAgICAgKiBAcHJpdmF0ZVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5fZnJhbWVzID0gbnVsbDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUaGUgdGV4dHVyZSB1c2VkIGJ5IHRoZSBhdGxhcy5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtpbXBvcnQoJy4uL3BsYXRmb3JtL2dyYXBoaWNzL3RleHR1cmUuanMnKS5UZXh0dXJlfVxuICAgICAqL1xuICAgIHNldCB0ZXh0dXJlKHZhbHVlKSB7XG4gICAgICAgIHRoaXMuX3RleHR1cmUgPSB2YWx1ZTtcbiAgICAgICAgdGhpcy5maXJlKCdzZXQ6dGV4dHVyZScsIHZhbHVlKTtcbiAgICB9XG5cbiAgICBnZXQgdGV4dHVyZSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3RleHR1cmU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ29udGFpbnMgZnJhbWVzIHdoaWNoIGRlZmluZSBwb3J0aW9ucyBvZiB0aGUgdGV4dHVyZSBhdGxhcy5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtvYmplY3R9XG4gICAgICovXG4gICAgc2V0IGZyYW1lcyh2YWx1ZSkge1xuICAgICAgICB0aGlzLl9mcmFtZXMgPSB2YWx1ZTtcbiAgICAgICAgdGhpcy5maXJlKCdzZXQ6ZnJhbWVzJywgdmFsdWUpO1xuICAgIH1cblxuICAgIGdldCBmcmFtZXMoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9mcmFtZXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0IGEgbmV3IGZyYW1lIGluIHRoZSB0ZXh0dXJlIGF0bGFzLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IGtleSAtIFRoZSBrZXkgb2YgdGhlIGZyYW1lLlxuICAgICAqIEBwYXJhbSB7b2JqZWN0fSBkYXRhIC0gVGhlIHByb3BlcnRpZXMgb2YgdGhlIGZyYW1lLlxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuLi9jb3JlL21hdGgvdmVjNC5qcycpLlZlYzR9IGRhdGEucmVjdCAtIFRoZSB1LCB2LCB3aWR0aCwgaGVpZ2h0IHByb3BlcnRpZXNcbiAgICAgKiBvZiB0aGUgZnJhbWUgaW4gcGl4ZWxzLlxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuLi9jb3JlL21hdGgvdmVjMi5qcycpLlZlYzJ9IGRhdGEucGl2b3QgLSBUaGUgcGl2b3Qgb2YgdGhlIGZyYW1lIC0gdmFsdWVzXG4gICAgICogYXJlIGJldHdlZW4gMC0xLlxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuLi9jb3JlL21hdGgvdmVjNC5qcycpLlZlYzR9IGRhdGEuYm9yZGVyIC0gVGhlIGJvcmRlciBvZiB0aGUgZnJhbWUgZm9yXG4gICAgICogOS1zbGljaW5nLiBWYWx1ZXMgYXJlIG9yZGVyZWQgYXMgZm9sbG93czogbGVmdCwgYm90dG9tLCByaWdodCwgdG9wIGJvcmRlciBpbiBwaXhlbHMuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBhdGxhcy5zZXRGcmFtZSgnMScsIHtcbiAgICAgKiAgICAgcmVjdDogbmV3IHBjLlZlYzQoMCwgMCwgMTI4LCAxMjgpLFxuICAgICAqICAgICBwaXZvdDogbmV3IHBjLlZlYzIoMC41LCAwLjUpLFxuICAgICAqICAgICBib3JkZXI6IG5ldyBwYy5WZWM0KDUsIDUsIDUsIDUpXG4gICAgICogfSk7XG4gICAgICovXG4gICAgc2V0RnJhbWUoa2V5LCBkYXRhKSB7XG4gICAgICAgIGxldCBmcmFtZSA9IHRoaXMuX2ZyYW1lc1trZXldO1xuICAgICAgICBpZiAoIWZyYW1lKSB7XG4gICAgICAgICAgICBmcmFtZSA9IHtcbiAgICAgICAgICAgICAgICByZWN0OiBkYXRhLnJlY3QuY2xvbmUoKSxcbiAgICAgICAgICAgICAgICBwaXZvdDogZGF0YS5waXZvdC5jbG9uZSgpLFxuICAgICAgICAgICAgICAgIGJvcmRlcjogZGF0YS5ib3JkZXIuY2xvbmUoKVxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIHRoaXMuX2ZyYW1lc1trZXldID0gZnJhbWU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBmcmFtZS5yZWN0LmNvcHkoZGF0YS5yZWN0KTtcbiAgICAgICAgICAgIGZyYW1lLnBpdm90LmNvcHkoZGF0YS5waXZvdCk7XG4gICAgICAgICAgICBmcmFtZS5ib3JkZXIuY29weShkYXRhLmJvcmRlcik7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmZpcmUoJ3NldDpmcmFtZScsIGtleS50b1N0cmluZygpLCBmcmFtZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVtb3ZlcyBhIGZyYW1lIGZyb20gdGhlIHRleHR1cmUgYXRsYXMuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30ga2V5IC0gVGhlIGtleSBvZiB0aGUgZnJhbWUuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBhdGxhcy5yZW1vdmVGcmFtZSgnMScpO1xuICAgICAqL1xuICAgIHJlbW92ZUZyYW1lKGtleSkge1xuICAgICAgICBjb25zdCBmcmFtZSA9IHRoaXMuX2ZyYW1lc1trZXldO1xuICAgICAgICBpZiAoZnJhbWUpIHtcbiAgICAgICAgICAgIGRlbGV0ZSB0aGlzLl9mcmFtZXNba2V5XTtcbiAgICAgICAgICAgIHRoaXMuZmlyZSgncmVtb3ZlOmZyYW1lJywga2V5LnRvU3RyaW5nKCksIGZyYW1lKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEZyZWUgdXAgdGhlIHVuZGVybHlpbmcgdGV4dHVyZSBvd25lZCBieSB0aGUgYXRsYXMuXG4gICAgICovXG4gICAgZGVzdHJveSgpIHtcbiAgICAgICAgaWYgKHRoaXMuX3RleHR1cmUpIHtcbiAgICAgICAgICAgIHRoaXMuX3RleHR1cmUuZGVzdHJveSgpO1xuICAgICAgICB9XG4gICAgfVxufVxuXG5leHBvcnQgeyBUZXh0dXJlQXRsYXMgfTtcbiJdLCJuYW1lcyI6WyJUZXh0dXJlQXRsYXMiLCJFdmVudEhhbmRsZXIiLCJjb25zdHJ1Y3RvciIsIl90ZXh0dXJlIiwiX2ZyYW1lcyIsInRleHR1cmUiLCJ2YWx1ZSIsImZpcmUiLCJmcmFtZXMiLCJzZXRGcmFtZSIsImtleSIsImRhdGEiLCJmcmFtZSIsInJlY3QiLCJjbG9uZSIsInBpdm90IiwiYm9yZGVyIiwiY29weSIsInRvU3RyaW5nIiwicmVtb3ZlRnJhbWUiLCJkZXN0cm95Il0sIm1hcHBpbmdzIjoiOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsTUFBTUEsWUFBWSxTQUFTQyxZQUFZLENBQUM7QUFDcEM7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7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
