import { EventHandler } from '../../core/event-handler.js';
import { Vec3 } from '../../core/math/vec3.js';
import { Quat } from '../../core/math/quat.js';

/**
 * The tracked image interface that is created by the Image Tracking system and is provided as a
 * list from {@link XrImageTracking#images}. It contains information about the tracking state as
 * well as the position and rotation of the tracked image.
 *
 * @augments EventHandler
 * @category XR
 */
class XrTrackedImage extends EventHandler {
  /**
   * The tracked image interface that is created by the Image Tracking system and is provided as
   * a list from {@link XrImageTracking#images}. It contains information about the tracking state
   * as well as the position and rotation of the tracked image.
   *
   * @param {HTMLCanvasElement|HTMLImageElement|SVGImageElement|HTMLVideoElement|Blob|ImageData|ImageBitmap} image - Image
   * that is matching the real world image as closely as possible. Resolution of images should be
   * at least 300x300. High resolution does NOT improve tracking performance. Color of image is
   * irrelevant, so grayscale images can be used. Images with too many geometric features or
   * repeating patterns will reduce tracking stability.
   * @param {number} width - Width (in meters) of image in real world. Providing this value as
   * close to the real value will improve tracking quality.
   * @hideconstructor
   */
  constructor(image, width) {
    super();
    /**
     * @type {HTMLCanvasElement|HTMLImageElement|SVGImageElement|HTMLVideoElement|Blob|ImageData|ImageBitmap}
     * @private
     */
    this._image = void 0;
    /**
     * @type {number}
     * @private
     */
    this._width = void 0;
    /**
     * @type {ImageBitmap|null}
     * @private
     */
    this._bitmap = null;
    /**
     * @type {number}
     * @ignore
     */
    this._measuredWidth = 0;
    /**
     * @type {boolean}
     * @private
     */
    this._trackable = false;
    /**
     * @type {boolean}
     * @private
     */
    this._tracking = false;
    /**
     * @type {boolean}
     * @private
     */
    this._emulated = false;
    /**
     * @type {*}
     * @ignore
     */
    this._pose = null;
    /**
     * @type {Vec3}
     * @private
     */
    this._position = new Vec3();
    /**
     * @type {Quat}
     * @private
     */
    this._rotation = new Quat();
    this._image = image;
    this._width = width;
  }

  /**
   * Fired when image becomes actively tracked.
   *
   * @event XrTrackedImage#tracked
   */

  /**
   * Fired when image is no more actively tracked.
   *
   * @event XrTrackedImage#untracked
   */

  /**
   * Image that is used for tracking.
   *
   * @type {HTMLCanvasElement|HTMLImageElement|SVGImageElement|HTMLVideoElement|Blob|ImageData|ImageBitmap}
   */
  get image() {
    return this._image;
  }

  /**
   * Width that is provided to assist tracking performance. This property can be updated only
   * when the AR session is not running.
   *
   * @type {number}
   */
  set width(value) {
    this._width = value;
  }
  get width() {
    return this._width;
  }

  /**
   * True if image is trackable. A too small resolution or invalid images can be untrackable by
   * the underlying AR system.
   *
   * @type {boolean}
   */
  get trackable() {
    return this._trackable;
  }

  /**
   * True if image is in tracking state and being tracked in real world by the underlying AR
   * system.
   *
   * @type {boolean}
   */
  get tracking() {
    return this._tracking;
  }

  /**
   * True if image was recently tracked but currently is not actively tracked due to inability of
   * identifying the image by the underlying AR system. Position and rotation will be based on
   * the previously known transformation assuming the tracked image has not moved.
   *
   * @type {boolean}
   */
  get emulated() {
    return this._emulated;
  }

  /**
   * @returns {Promise<ImageBitmap>} Promise that resolves to an image bitmap.
   * @ignore
   */
  prepare() {
    if (this._bitmap) {
      return {
        image: this._bitmap,
        widthInMeters: this._width
      };
    }
    return createImageBitmap(this._image).then(bitmap => {
      this._bitmap = bitmap;
      return {
        image: this._bitmap,
        widthInMeters: this._width
      };
    });
  }

  /**
   * Destroys the tracked image.
   *
   * @ignore
   */
  destroy() {
    this._image = null;
    this._pose = null;
    if (this._bitmap) {
      this._bitmap.close();
      this._bitmap = null;
    }
  }

  /**
   * Get the position of the tracked image. The position is the most recent one based on the
   * tracked image state.
   *
   * @returns {Vec3} Position in world space.
   * @example
   * // update entity position to match tracked image position
   * entity.setPosition(trackedImage.getPosition());
   */
  getPosition() {
    if (this._pose) this._position.copy(this._pose.transform.position);
    return this._position;
  }

  /**
   * Get the rotation of the tracked image. The rotation is the most recent based on the tracked
   * image state.
   *
   * @returns {Quat} Rotation in world space.
   * @example
   * // update entity rotation to match tracked image rotation
   * entity.setRotation(trackedImage.getRotation());
   */
  getRotation() {
    if (this._pose) this._rotation.copy(this._pose.transform.orientation);
    return this._rotation;
  }
}

export { XrTrackedImage };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoieHItdHJhY2tlZC1pbWFnZS5qcyIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL2ZyYW1ld29yay94ci94ci10cmFja2VkLWltYWdlLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEV2ZW50SGFuZGxlciB9IGZyb20gJy4uLy4uL2NvcmUvZXZlbnQtaGFuZGxlci5qcyc7XG5pbXBvcnQgeyBWZWMzIH0gZnJvbSAnLi4vLi4vY29yZS9tYXRoL3ZlYzMuanMnO1xuaW1wb3J0IHsgUXVhdCB9IGZyb20gJy4uLy4uL2NvcmUvbWF0aC9xdWF0LmpzJztcblxuLyoqXG4gKiBUaGUgdHJhY2tlZCBpbWFnZSBpbnRlcmZhY2UgdGhhdCBpcyBjcmVhdGVkIGJ5IHRoZSBJbWFnZSBUcmFja2luZyBzeXN0ZW0gYW5kIGlzIHByb3ZpZGVkIGFzIGFcbiAqIGxpc3QgZnJvbSB7QGxpbmsgWHJJbWFnZVRyYWNraW5nI2ltYWdlc30uIEl0IGNvbnRhaW5zIGluZm9ybWF0aW9uIGFib3V0IHRoZSB0cmFja2luZyBzdGF0ZSBhc1xuICogd2VsbCBhcyB0aGUgcG9zaXRpb24gYW5kIHJvdGF0aW9uIG9mIHRoZSB0cmFja2VkIGltYWdlLlxuICpcbiAqIEBhdWdtZW50cyBFdmVudEhhbmRsZXJcbiAqIEBjYXRlZ29yeSBYUlxuICovXG5jbGFzcyBYclRyYWNrZWRJbWFnZSBleHRlbmRzIEV2ZW50SGFuZGxlciB7XG4gICAgLyoqXG4gICAgICogQHR5cGUge0hUTUxDYW52YXNFbGVtZW50fEhUTUxJbWFnZUVsZW1lbnR8U1ZHSW1hZ2VFbGVtZW50fEhUTUxWaWRlb0VsZW1lbnR8QmxvYnxJbWFnZURhdGF8SW1hZ2VCaXRtYXB9XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfaW1hZ2U7XG5cbiAgICAvKipcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX3dpZHRoO1xuXG4gICAgLyoqXG4gICAgICogQHR5cGUge0ltYWdlQml0bWFwfG51bGx9XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfYml0bWFwID0gbnVsbDtcblxuICAgIC8qKlxuICAgICAqIEB0eXBlIHtudW1iZXJ9XG4gICAgICogQGlnbm9yZVxuICAgICAqL1xuICAgIF9tZWFzdXJlZFdpZHRoID0gMDtcblxuICAgIC8qKlxuICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX3RyYWNrYWJsZSA9IGZhbHNlO1xuXG4gICAgLyoqXG4gICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfdHJhY2tpbmcgPSBmYWxzZTtcblxuICAgIC8qKlxuICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX2VtdWxhdGVkID0gZmFsc2U7XG5cbiAgICAvKipcbiAgICAgKiBAdHlwZSB7Kn1cbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgX3Bvc2UgPSBudWxsO1xuXG4gICAgLyoqXG4gICAgICogQHR5cGUge1ZlYzN9XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfcG9zaXRpb24gPSBuZXcgVmVjMygpO1xuXG4gICAgLyoqXG4gICAgICogQHR5cGUge1F1YXR9XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfcm90YXRpb24gPSBuZXcgUXVhdCgpO1xuXG4gICAgLyoqXG4gICAgICogVGhlIHRyYWNrZWQgaW1hZ2UgaW50ZXJmYWNlIHRoYXQgaXMgY3JlYXRlZCBieSB0aGUgSW1hZ2UgVHJhY2tpbmcgc3lzdGVtIGFuZCBpcyBwcm92aWRlZCBhc1xuICAgICAqIGEgbGlzdCBmcm9tIHtAbGluayBYckltYWdlVHJhY2tpbmcjaW1hZ2VzfS4gSXQgY29udGFpbnMgaW5mb3JtYXRpb24gYWJvdXQgdGhlIHRyYWNraW5nIHN0YXRlXG4gICAgICogYXMgd2VsbCBhcyB0aGUgcG9zaXRpb24gYW5kIHJvdGF0aW9uIG9mIHRoZSB0cmFja2VkIGltYWdlLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtIVE1MQ2FudmFzRWxlbWVudHxIVE1MSW1hZ2VFbGVtZW50fFNWR0ltYWdlRWxlbWVudHxIVE1MVmlkZW9FbGVtZW50fEJsb2J8SW1hZ2VEYXRhfEltYWdlQml0bWFwfSBpbWFnZSAtIEltYWdlXG4gICAgICogdGhhdCBpcyBtYXRjaGluZyB0aGUgcmVhbCB3b3JsZCBpbWFnZSBhcyBjbG9zZWx5IGFzIHBvc3NpYmxlLiBSZXNvbHV0aW9uIG9mIGltYWdlcyBzaG91bGQgYmVcbiAgICAgKiBhdCBsZWFzdCAzMDB4MzAwLiBIaWdoIHJlc29sdXRpb24gZG9lcyBOT1QgaW1wcm92ZSB0cmFja2luZyBwZXJmb3JtYW5jZS4gQ29sb3Igb2YgaW1hZ2UgaXNcbiAgICAgKiBpcnJlbGV2YW50LCBzbyBncmF5c2NhbGUgaW1hZ2VzIGNhbiBiZSB1c2VkLiBJbWFnZXMgd2l0aCB0b28gbWFueSBnZW9tZXRyaWMgZmVhdHVyZXMgb3JcbiAgICAgKiByZXBlYXRpbmcgcGF0dGVybnMgd2lsbCByZWR1Y2UgdHJhY2tpbmcgc3RhYmlsaXR5LlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSB3aWR0aCAtIFdpZHRoIChpbiBtZXRlcnMpIG9mIGltYWdlIGluIHJlYWwgd29ybGQuIFByb3ZpZGluZyB0aGlzIHZhbHVlIGFzXG4gICAgICogY2xvc2UgdG8gdGhlIHJlYWwgdmFsdWUgd2lsbCBpbXByb3ZlIHRyYWNraW5nIHF1YWxpdHkuXG4gICAgICogQGhpZGVjb25zdHJ1Y3RvclxuICAgICAqL1xuICAgIGNvbnN0cnVjdG9yKGltYWdlLCB3aWR0aCkge1xuICAgICAgICBzdXBlcigpO1xuXG4gICAgICAgIHRoaXMuX2ltYWdlID0gaW1hZ2U7XG4gICAgICAgIHRoaXMuX3dpZHRoID0gd2lkdGg7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRmlyZWQgd2hlbiBpbWFnZSBiZWNvbWVzIGFjdGl2ZWx5IHRyYWNrZWQuXG4gICAgICpcbiAgICAgKiBAZXZlbnQgWHJUcmFja2VkSW1hZ2UjdHJhY2tlZFxuICAgICAqL1xuXG4gICAgLyoqXG4gICAgICogRmlyZWQgd2hlbiBpbWFnZSBpcyBubyBtb3JlIGFjdGl2ZWx5IHRyYWNrZWQuXG4gICAgICpcbiAgICAgKiBAZXZlbnQgWHJUcmFja2VkSW1hZ2UjdW50cmFja2VkXG4gICAgICovXG5cbiAgICAvKipcbiAgICAgKiBJbWFnZSB0aGF0IGlzIHVzZWQgZm9yIHRyYWNraW5nLlxuICAgICAqXG4gICAgICogQHR5cGUge0hUTUxDYW52YXNFbGVtZW50fEhUTUxJbWFnZUVsZW1lbnR8U1ZHSW1hZ2VFbGVtZW50fEhUTUxWaWRlb0VsZW1lbnR8QmxvYnxJbWFnZURhdGF8SW1hZ2VCaXRtYXB9XG4gICAgICovXG4gICAgZ2V0IGltYWdlKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5faW1hZ2U7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogV2lkdGggdGhhdCBpcyBwcm92aWRlZCB0byBhc3Npc3QgdHJhY2tpbmcgcGVyZm9ybWFuY2UuIFRoaXMgcHJvcGVydHkgY2FuIGJlIHVwZGF0ZWQgb25seVxuICAgICAqIHdoZW4gdGhlIEFSIHNlc3Npb24gaXMgbm90IHJ1bm5pbmcuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqL1xuICAgIHNldCB3aWR0aCh2YWx1ZSkge1xuICAgICAgICB0aGlzLl93aWR0aCA9IHZhbHVlO1xuICAgIH1cblxuICAgIGdldCB3aWR0aCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3dpZHRoO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRydWUgaWYgaW1hZ2UgaXMgdHJhY2thYmxlLiBBIHRvbyBzbWFsbCByZXNvbHV0aW9uIG9yIGludmFsaWQgaW1hZ2VzIGNhbiBiZSB1bnRyYWNrYWJsZSBieVxuICAgICAqIHRoZSB1bmRlcmx5aW5nIEFSIHN5c3RlbS5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAqL1xuICAgIGdldCB0cmFja2FibGUoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl90cmFja2FibGU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVHJ1ZSBpZiBpbWFnZSBpcyBpbiB0cmFja2luZyBzdGF0ZSBhbmQgYmVpbmcgdHJhY2tlZCBpbiByZWFsIHdvcmxkIGJ5IHRoZSB1bmRlcmx5aW5nIEFSXG4gICAgICogc3lzdGVtLlxuICAgICAqXG4gICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICovXG4gICAgZ2V0IHRyYWNraW5nKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fdHJhY2tpbmc7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVHJ1ZSBpZiBpbWFnZSB3YXMgcmVjZW50bHkgdHJhY2tlZCBidXQgY3VycmVudGx5IGlzIG5vdCBhY3RpdmVseSB0cmFja2VkIGR1ZSB0byBpbmFiaWxpdHkgb2ZcbiAgICAgKiBpZGVudGlmeWluZyB0aGUgaW1hZ2UgYnkgdGhlIHVuZGVybHlpbmcgQVIgc3lzdGVtLiBQb3NpdGlvbiBhbmQgcm90YXRpb24gd2lsbCBiZSBiYXNlZCBvblxuICAgICAqIHRoZSBwcmV2aW91c2x5IGtub3duIHRyYW5zZm9ybWF0aW9uIGFzc3VtaW5nIHRoZSB0cmFja2VkIGltYWdlIGhhcyBub3QgbW92ZWQuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICAgKi9cbiAgICBnZXQgZW11bGF0ZWQoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9lbXVsYXRlZDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcmV0dXJucyB7UHJvbWlzZTxJbWFnZUJpdG1hcD59IFByb21pc2UgdGhhdCByZXNvbHZlcyB0byBhbiBpbWFnZSBiaXRtYXAuXG4gICAgICogQGlnbm9yZVxuICAgICAqL1xuICAgIHByZXBhcmUoKSB7XG4gICAgICAgIGlmICh0aGlzLl9iaXRtYXApIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgaW1hZ2U6IHRoaXMuX2JpdG1hcCxcbiAgICAgICAgICAgICAgICB3aWR0aEluTWV0ZXJzOiB0aGlzLl93aWR0aFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBjcmVhdGVJbWFnZUJpdG1hcCh0aGlzLl9pbWFnZSlcbiAgICAgICAgICAgIC50aGVuKChiaXRtYXApID0+IHtcbiAgICAgICAgICAgICAgICB0aGlzLl9iaXRtYXAgPSBiaXRtYXA7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgaW1hZ2U6IHRoaXMuX2JpdG1hcCxcbiAgICAgICAgICAgICAgICAgICAgd2lkdGhJbk1ldGVyczogdGhpcy5fd2lkdGhcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRGVzdHJveXMgdGhlIHRyYWNrZWQgaW1hZ2UuXG4gICAgICpcbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgZGVzdHJveSgpIHtcbiAgICAgICAgdGhpcy5faW1hZ2UgPSBudWxsO1xuICAgICAgICB0aGlzLl9wb3NlID0gbnVsbDtcblxuICAgICAgICBpZiAodGhpcy5fYml0bWFwKSB7XG4gICAgICAgICAgICB0aGlzLl9iaXRtYXAuY2xvc2UoKTtcbiAgICAgICAgICAgIHRoaXMuX2JpdG1hcCA9IG51bGw7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBHZXQgdGhlIHBvc2l0aW9uIG9mIHRoZSB0cmFja2VkIGltYWdlLiBUaGUgcG9zaXRpb24gaXMgdGhlIG1vc3QgcmVjZW50IG9uZSBiYXNlZCBvbiB0aGVcbiAgICAgKiB0cmFja2VkIGltYWdlIHN0YXRlLlxuICAgICAqXG4gICAgICogQHJldHVybnMge1ZlYzN9IFBvc2l0aW9uIGluIHdvcmxkIHNwYWNlLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogLy8gdXBkYXRlIGVudGl0eSBwb3NpdGlvbiB0byBtYXRjaCB0cmFja2VkIGltYWdlIHBvc2l0aW9uXG4gICAgICogZW50aXR5LnNldFBvc2l0aW9uKHRyYWNrZWRJbWFnZS5nZXRQb3NpdGlvbigpKTtcbiAgICAgKi9cbiAgICBnZXRQb3NpdGlvbigpIHtcbiAgICAgICAgaWYgKHRoaXMuX3Bvc2UpIHRoaXMuX3Bvc2l0aW9uLmNvcHkodGhpcy5fcG9zZS50cmFuc2Zvcm0ucG9zaXRpb24pO1xuICAgICAgICByZXR1cm4gdGhpcy5fcG9zaXRpb247XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogR2V0IHRoZSByb3RhdGlvbiBvZiB0aGUgdHJhY2tlZCBpbWFnZS4gVGhlIHJvdGF0aW9uIGlzIHRoZSBtb3N0IHJlY2VudCBiYXNlZCBvbiB0aGUgdHJhY2tlZFxuICAgICAqIGltYWdlIHN0YXRlLlxuICAgICAqXG4gICAgICogQHJldHVybnMge1F1YXR9IFJvdGF0aW9uIGluIHdvcmxkIHNwYWNlLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogLy8gdXBkYXRlIGVudGl0eSByb3RhdGlvbiB0byBtYXRjaCB0cmFja2VkIGltYWdlIHJvdGF0aW9uXG4gICAgICogZW50aXR5LnNldFJvdGF0aW9uKHRyYWNrZWRJbWFnZS5nZXRSb3RhdGlvbigpKTtcbiAgICAgKi9cbiAgICBnZXRSb3RhdGlvbigpIHtcbiAgICAgICAgaWYgKHRoaXMuX3Bvc2UpIHRoaXMuX3JvdGF0aW9uLmNvcHkodGhpcy5fcG9zZS50cmFuc2Zvcm0ub3JpZW50YXRpb24pO1xuICAgICAgICByZXR1cm4gdGhpcy5fcm90YXRpb247XG4gICAgfVxufVxuXG5leHBvcnQgeyBYclRyYWNrZWRJbWFnZSB9O1xuIl0sIm5hbWVzIjpbIlhyVHJhY2tlZEltYWdlIiwiRXZlbnRIYW5kbGVyIiwiY29uc3RydWN0b3IiLCJpbWFnZSIsIndpZHRoIiwiX2ltYWdlIiwiX3dpZHRoIiwiX2JpdG1hcCIsIl9tZWFzdXJlZFdpZHRoIiwiX3RyYWNrYWJsZSIsIl90cmFja2luZyIsIl9lbXVsYXRlZCIsIl9wb3NlIiwiX3Bvc2l0aW9uIiwiVmVjMyIsIl9yb3RhdGlvbiIsIlF1YXQiLCJ2YWx1ZSIsInRyYWNrYWJsZSIsInRyYWNraW5nIiwiZW11bGF0ZWQiLCJwcmVwYXJlIiwid2lkdGhJbk1ldGVycyIsImNyZWF0ZUltYWdlQml0bWFwIiwidGhlbiIsImJpdG1hcCIsImRlc3Ryb3kiLCJjbG9zZSIsImdldFBvc2l0aW9uIiwiY29weSIsInRyYW5zZm9ybSIsInBvc2l0aW9uIiwiZ2V0Um90YXRpb24iLCJvcmllbnRhdGlvbiJdLCJtYXBwaW5ncyI6Ijs7OztBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxNQUFNQSxjQUFjLFNBQVNDLFlBQVksQ0FBQztBQTZEdEM7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNJQyxFQUFBQSxXQUFXQSxDQUFDQyxLQUFLLEVBQUVDLEtBQUssRUFBRTtBQUN0QixJQUFBLEtBQUssRUFBRSxDQUFBO0FBM0VYO0FBQ0o7QUFDQTtBQUNBO0FBSEksSUFBQSxJQUFBLENBSUFDLE1BQU0sR0FBQSxLQUFBLENBQUEsQ0FBQTtBQUVOO0FBQ0o7QUFDQTtBQUNBO0FBSEksSUFBQSxJQUFBLENBSUFDLE1BQU0sR0FBQSxLQUFBLENBQUEsQ0FBQTtBQUVOO0FBQ0o7QUFDQTtBQUNBO0lBSEksSUFJQUMsQ0FBQUEsT0FBTyxHQUFHLElBQUksQ0FBQTtBQUVkO0FBQ0o7QUFDQTtBQUNBO0lBSEksSUFJQUMsQ0FBQUEsY0FBYyxHQUFHLENBQUMsQ0FBQTtBQUVsQjtBQUNKO0FBQ0E7QUFDQTtJQUhJLElBSUFDLENBQUFBLFVBQVUsR0FBRyxLQUFLLENBQUE7QUFFbEI7QUFDSjtBQUNBO0FBQ0E7SUFISSxJQUlBQyxDQUFBQSxTQUFTLEdBQUcsS0FBSyxDQUFBO0FBRWpCO0FBQ0o7QUFDQTtBQUNBO0lBSEksSUFJQUMsQ0FBQUEsU0FBUyxHQUFHLEtBQUssQ0FBQTtBQUVqQjtBQUNKO0FBQ0E7QUFDQTtJ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
