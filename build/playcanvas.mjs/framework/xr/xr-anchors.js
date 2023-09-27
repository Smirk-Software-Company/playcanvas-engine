import { EventHandler } from '../../core/event-handler.js';
import { platform } from '../../core/platform.js';
import { XrAnchor } from './xr-anchor.js';

/**
 * Callback used by {@link XrAnchors#create}.
 *
 * @callback XrAnchorCreate
 * @param {Error|null} err - The Error object if failed to create an anchor or null.
 * @param {XrAnchor|null} anchor - The anchor that is tracked against real world geometry.
 */

/**
 * Anchors provide an ability to specify a point in the world that needs to be updated to
 * correctly reflect the evolving understanding of the world by the underlying AR system,
 * such that the anchor remains aligned with the same place in the physical world.
 * Anchors tend to persist better relative to the real world, especially during a longer
 * session with lots of movement.
 *
 * ```javascript
 * app.xr.start(camera, pc.XRTYPE_AR, pc.XRSPACE_LOCALFLOOR, {
 *     anchors: true
 * });
 * ```
 * @augments EventHandler
 * @category XR
 */
class XrAnchors extends EventHandler {
  /**
   * @param {import('./xr-manager.js').XrManager} manager - WebXR Manager.
   * @hideconstructor
   */
  constructor(manager) {
    super();
    /**
     * @type {boolean}
     * @private
     */
    this._supported = platform.browser && !!window.XRAnchor;
    /**
     * List of anchor creation requests.
     *
     * @type {Array<object>}
     * @private
     */
    this._creationQueue = [];
    /**
     * Index of XrAnchors, with XRAnchor (native handle) used as a key.
     *
     * @type {Map<XRAnchor,XrAnchor>}
     * @ignore
     */
    this._index = new Map();
    /**
     * @type {Array<XrAnchor>}
     * @ignore
     */
    this._list = [];
    /**
     * Map of callbacks to XRAnchors so that we can call its callback once
     * an anchor is updated with a pose for the first time.
     *
     * @type {Map<XrAnchor,XrAnchorCreate>}
     * @private
     */
    this._callbacksAnchors = new Map();
    this.manager = manager;
    if (this._supported) {
      this.manager.on('end', this._onSessionEnd, this);
    }
  }

  /**
   * Fired when anchor failed to be created.
   *
   * @event XrAnchors#error
   * @param {Error} error - Error object related to a failure of anchors.
   */

  /**
   * Fired when a new {@link XrAnchor} is added.
   *
   * @event XrAnchors#add
   * @param {XrAnchor} anchor - Anchor that has been added.
   * @example
   * app.xr.anchors.on('add', function (anchor) {
   *     // new anchor is added
   * });
   */

  /**
   * Fired when an {@link XrAnchor} is destroyed.
   *
   * @event XrAnchors#destroy
   * @param {XrAnchor} anchor - Anchor that has been destroyed.
   * @example
   * app.xr.anchors.on('destroy', function (anchor) {
   *     // anchor that is destroyed
   * });
   */

  /** @private */
  _onSessionEnd() {
    // clear anchor creation queue
    for (let i = 0; i < this._creationQueue.length; i++) {
      if (!this._creationQueue[i].callback) continue;
      this._creationQueue[i].callback(new Error('session ended'), null);
    }
    this._creationQueue.length = 0;

    // destroy all anchors
    if (this._list) {
      let i = this._list.length;
      while (i--) {
        this._list[i].destroy();
      }
      this._list.length = 0;
    }
  }

  /**
   * Create anchor with position, rotation and a callback.
   *
   * @param {import('../../core/math/vec3.js').Vec3} position - Position for an anchor.
   * @param {import('../../core/math/quat.js').Quat} [rotation] - Rotation for an anchor.
   * @param {XrAnchorCreate} [callback] - Callback to fire when anchor was created or failed to be created.
   * @example
   * app.xr.anchors.create(position, rotation, function (err, anchor) {
   *     if (!err) {
   *         // new anchor has been created
   *     }
   * });
   */
  create(position, rotation, callback) {
    this._creationQueue.push({
      transform: new XRRigidTransform(position, rotation),
      // eslint-disable-line no-undef
      callback: callback
    });
  }

  /**
   * @param {*} frame - XRFrame from requestAnimationFrame callback.
   * @ignore
   */
  update(frame) {
    // check if need to create anchors
    if (this._creationQueue.length) {
      for (let i = 0; i < this._creationQueue.length; i++) {
        const request = this._creationQueue[i];
        frame.createAnchor(request.transform, this.manager._referenceSpace).then(xrAnchor => {
          if (request.callback) this._callbacksAnchors.set(xrAnchor, request.callback);
        }).catch(ex => {
          if (request.callback) request.callback(ex, null);
          this.fire('error', ex);
        });
      }
      this._creationQueue.length = 0;
    }

    // check if destroyed
    for (const [xrAnchor, anchor] of this._index) {
      if (frame.trackedAnchors.has(xrAnchor)) continue;
      anchor.destroy();
    }

    // update existing anchors
    for (let i = 0; i < this._list.length; i++) {
      this._list[i].update(frame);
    }

    // check if added
    for (const xrAnchor of frame.trackedAnchors) {
      if (this._index.has(xrAnchor)) continue;
      try {
        const tmp = xrAnchor.anchorSpace; // eslint-disable-line no-unused-vars
      } catch (ex) {
        // if anchorSpace is not available, then anchor is invalid
        // and should not be created
        continue;
      }
      const anchor = new XrAnchor(this, xrAnchor);
      this._index.set(xrAnchor, anchor);
      this._list.push(anchor);
      anchor.update(frame);
      const callback = this._callbacksAnchors.get(xrAnchor);
      if (callback) {
        this._callbacksAnchors.delete(xrAnchor);
        callback(null, anchor);
      }
      this.fire('add', anchor);
    }
  }

  /**
   * True if Anchors are supported.
   *
   * @type {boolean}
   */
  get supported() {
    return this._supported;
  }

  /**
   * List of available {@link XrAnchor}s.
   *
   * @type {Array<XrAnchor>}
   */
  get list() {
    return this._list;
  }
}

export { XrAnchors };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoieHItYW5jaG9ycy5qcyIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL2ZyYW1ld29yay94ci94ci1hbmNob3JzLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEV2ZW50SGFuZGxlciB9IGZyb20gJy4uLy4uL2NvcmUvZXZlbnQtaGFuZGxlci5qcyc7XG5pbXBvcnQgeyBwbGF0Zm9ybSB9IGZyb20gJy4uLy4uL2NvcmUvcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgWHJBbmNob3IgfSBmcm9tICcuL3hyLWFuY2hvci5qcyc7XG5cbi8qKlxuICogQ2FsbGJhY2sgdXNlZCBieSB7QGxpbmsgWHJBbmNob3JzI2NyZWF0ZX0uXG4gKlxuICogQGNhbGxiYWNrIFhyQW5jaG9yQ3JlYXRlXG4gKiBAcGFyYW0ge0Vycm9yfG51bGx9IGVyciAtIFRoZSBFcnJvciBvYmplY3QgaWYgZmFpbGVkIHRvIGNyZWF0ZSBhbiBhbmNob3Igb3IgbnVsbC5cbiAqIEBwYXJhbSB7WHJBbmNob3J8bnVsbH0gYW5jaG9yIC0gVGhlIGFuY2hvciB0aGF0IGlzIHRyYWNrZWQgYWdhaW5zdCByZWFsIHdvcmxkIGdlb21ldHJ5LlxuICovXG5cbi8qKlxuICogQW5jaG9ycyBwcm92aWRlIGFuIGFiaWxpdHkgdG8gc3BlY2lmeSBhIHBvaW50IGluIHRoZSB3b3JsZCB0aGF0IG5lZWRzIHRvIGJlIHVwZGF0ZWQgdG9cbiAqIGNvcnJlY3RseSByZWZsZWN0IHRoZSBldm9sdmluZyB1bmRlcnN0YW5kaW5nIG9mIHRoZSB3b3JsZCBieSB0aGUgdW5kZXJseWluZyBBUiBzeXN0ZW0sXG4gKiBzdWNoIHRoYXQgdGhlIGFuY2hvciByZW1haW5zIGFsaWduZWQgd2l0aCB0aGUgc2FtZSBwbGFjZSBpbiB0aGUgcGh5c2ljYWwgd29ybGQuXG4gKiBBbmNob3JzIHRlbmQgdG8gcGVyc2lzdCBiZXR0ZXIgcmVsYXRpdmUgdG8gdGhlIHJlYWwgd29ybGQsIGVzcGVjaWFsbHkgZHVyaW5nIGEgbG9uZ2VyXG4gKiBzZXNzaW9uIHdpdGggbG90cyBvZiBtb3ZlbWVudC5cbiAqXG4gKiBgYGBqYXZhc2NyaXB0XG4gKiBhcHAueHIuc3RhcnQoY2FtZXJhLCBwYy5YUlRZUEVfQVIsIHBjLlhSU1BBQ0VfTE9DQUxGTE9PUiwge1xuICogICAgIGFuY2hvcnM6IHRydWVcbiAqIH0pO1xuICogYGBgXG4gKiBAYXVnbWVudHMgRXZlbnRIYW5kbGVyXG4gKiBAY2F0ZWdvcnkgWFJcbiAqL1xuY2xhc3MgWHJBbmNob3JzIGV4dGVuZHMgRXZlbnRIYW5kbGVyIHtcbiAgICAvKipcbiAgICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9zdXBwb3J0ZWQgPSBwbGF0Zm9ybS5icm93c2VyICYmICEhd2luZG93LlhSQW5jaG9yO1xuXG4gICAgLyoqXG4gICAgICogTGlzdCBvZiBhbmNob3IgY3JlYXRpb24gcmVxdWVzdHMuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7QXJyYXk8b2JqZWN0Pn1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9jcmVhdGlvblF1ZXVlID0gW107XG5cbiAgICAvKipcbiAgICAgKiBJbmRleCBvZiBYckFuY2hvcnMsIHdpdGggWFJBbmNob3IgKG5hdGl2ZSBoYW5kbGUpIHVzZWQgYXMgYSBrZXkuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7TWFwPFhSQW5jaG9yLFhyQW5jaG9yPn1cbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgX2luZGV4ID0gbmV3IE1hcCgpO1xuXG4gICAgLyoqXG4gICAgICogQHR5cGUge0FycmF5PFhyQW5jaG9yPn1cbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgX2xpc3QgPSBbXTtcblxuICAgIC8qKlxuICAgICAqIE1hcCBvZiBjYWxsYmFja3MgdG8gWFJBbmNob3JzIHNvIHRoYXQgd2UgY2FuIGNhbGwgaXRzIGNhbGxiYWNrIG9uY2VcbiAgICAgKiBhbiBhbmNob3IgaXMgdXBkYXRlZCB3aXRoIGEgcG9zZSBmb3IgdGhlIGZpcnN0IHRpbWUuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7TWFwPFhyQW5jaG9yLFhyQW5jaG9yQ3JlYXRlPn1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9jYWxsYmFja3NBbmNob3JzID0gbmV3IE1hcCgpO1xuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4veHItbWFuYWdlci5qcycpLlhyTWFuYWdlcn0gbWFuYWdlciAtIFdlYlhSIE1hbmFnZXIuXG4gICAgICogQGhpZGVjb25zdHJ1Y3RvclxuICAgICAqL1xuICAgIGNvbnN0cnVjdG9yKG1hbmFnZXIpIHtcbiAgICAgICAgc3VwZXIoKTtcblxuICAgICAgICB0aGlzLm1hbmFnZXIgPSBtYW5hZ2VyO1xuXG4gICAgICAgIGlmICh0aGlzLl9zdXBwb3J0ZWQpIHtcbiAgICAgICAgICAgIHRoaXMubWFuYWdlci5vbignZW5kJywgdGhpcy5fb25TZXNzaW9uRW5kLCB0aGlzKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEZpcmVkIHdoZW4gYW5jaG9yIGZhaWxlZCB0byBiZSBjcmVhdGVkLlxuICAgICAqXG4gICAgICogQGV2ZW50IFhyQW5jaG9ycyNlcnJvclxuICAgICAqIEBwYXJhbSB7RXJyb3J9IGVycm9yIC0gRXJyb3Igb2JqZWN0IHJlbGF0ZWQgdG8gYSBmYWlsdXJlIG9mIGFuY2hvcnMuXG4gICAgICovXG5cbiAgICAvKipcbiAgICAgKiBGaXJlZCB3aGVuIGEgbmV3IHtAbGluayBYckFuY2hvcn0gaXMgYWRkZWQuXG4gICAgICpcbiAgICAgKiBAZXZlbnQgWHJBbmNob3JzI2FkZFxuICAgICAqIEBwYXJhbSB7WHJBbmNob3J9IGFuY2hvciAtIEFuY2hvciB0aGF0IGhhcyBiZWVuIGFkZGVkLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogYXBwLnhyLmFuY2hvcnMub24oJ2FkZCcsIGZ1bmN0aW9uIChhbmNob3IpIHtcbiAgICAgKiAgICAgLy8gbmV3IGFuY2hvciBpcyBhZGRlZFxuICAgICAqIH0pO1xuICAgICAqL1xuXG4gICAgLyoqXG4gICAgICogRmlyZWQgd2hlbiBhbiB7QGxpbmsgWHJBbmNob3J9IGlzIGRlc3Ryb3llZC5cbiAgICAgKlxuICAgICAqIEBldmVudCBYckFuY2hvcnMjZGVzdHJveVxuICAgICAqIEBwYXJhbSB7WHJBbmNob3J9IGFuY2hvciAtIEFuY2hvciB0aGF0IGhhcyBiZWVuIGRlc3Ryb3llZC5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGFwcC54ci5hbmNob3JzLm9uKCdkZXN0cm95JywgZnVuY3Rpb24gKGFuY2hvcikge1xuICAgICAqICAgICAvLyBhbmNob3IgdGhhdCBpcyBkZXN0cm95ZWRcbiAgICAgKiB9KTtcbiAgICAgKi9cblxuICAgIC8qKiBAcHJpdmF0ZSAqL1xuICAgIF9vblNlc3Npb25FbmQoKSB7XG4gICAgICAgIC8vIGNsZWFyIGFuY2hvciBjcmVhdGlvbiBxdWV1ZVxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuX2NyZWF0aW9uUXVldWUubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGlmICghdGhpcy5fY3JlYXRpb25RdWV1ZVtpXS5jYWxsYmFjaylcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcblxuICAgICAgICAgICAgdGhpcy5fY3JlYXRpb25RdWV1ZVtpXS5jYWxsYmFjayhuZXcgRXJyb3IoJ3Nlc3Npb24gZW5kZWQnKSwgbnVsbCk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5fY3JlYXRpb25RdWV1ZS5sZW5ndGggPSAwO1xuXG4gICAgICAgIC8vIGRlc3Ryb3kgYWxsIGFuY2hvcnNcbiAgICAgICAgaWYgKHRoaXMuX2xpc3QpIHtcbiAgICAgICAgICAgIGxldCBpID0gdGhpcy5fbGlzdC5sZW5ndGg7XG4gICAgICAgICAgICB3aGlsZSAoaS0tKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fbGlzdFtpXS5kZXN0cm95KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLl9saXN0Lmxlbmd0aCA9IDA7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDcmVhdGUgYW5jaG9yIHdpdGggcG9zaXRpb24sIHJvdGF0aW9uIGFuZCBhIGNhbGxiYWNrLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4uLy4uL2NvcmUvbWF0aC92ZWMzLmpzJykuVmVjM30gcG9zaXRpb24gLSBQb3NpdGlvbiBmb3IgYW4gYW5jaG9yLlxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuLi8uLi9jb3JlL21hdGgvcXVhdC5qcycpLlF1YXR9IFtyb3RhdGlvbl0gLSBSb3RhdGlvbiBmb3IgYW4gYW5jaG9yLlxuICAgICAqIEBwYXJhbSB7WHJBbmNob3JDcmVhdGV9IFtjYWxsYmFja10gLSBDYWxsYmFjayB0byBmaXJlIHdoZW4gYW5jaG9yIHdhcyBjcmVhdGVkIG9yIGZhaWxlZCB0byBiZSBjcmVhdGVkLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogYXBwLnhyLmFuY2hvcnMuY3JlYXRlKHBvc2l0aW9uLCByb3RhdGlvbiwgZnVuY3Rpb24gKGVyciwgYW5jaG9yKSB7XG4gICAgICogICAgIGlmICghZXJyKSB7XG4gICAgICogICAgICAgICAvLyBuZXcgYW5jaG9yIGhhcyBiZWVuIGNyZWF0ZWRcbiAgICAgKiAgICAgfVxuICAgICAqIH0pO1xuICAgICAqL1xuICAgIGNyZWF0ZShwb3NpdGlvbiwgcm90YXRpb24sIGNhbGxiYWNrKSB7XG4gICAgICAgIHRoaXMuX2NyZWF0aW9uUXVldWUucHVzaCh7XG4gICAgICAgICAgICB0cmFuc2Zvcm06IG5ldyBYUlJpZ2lkVHJhbnNmb3JtKHBvc2l0aW9uLCByb3RhdGlvbiksIC8vIGVzbGludC1kaXNhYmxlLWxpbmUgbm8tdW5kZWZcbiAgICAgICAgICAgIGNhbGxiYWNrOiBjYWxsYmFja1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0geyp9IGZyYW1lIC0gWFJGcmFtZSBmcm9tIHJlcXVlc3RBbmltYXRpb25GcmFtZSBjYWxsYmFjay5cbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgdXBkYXRlKGZyYW1lKSB7XG4gICAgICAgIC8vIGNoZWNrIGlmIG5lZWQgdG8gY3JlYXRlIGFuY2hvcnNcbiAgICAgICAgaWYgKHRoaXMuX2NyZWF0aW9uUXVldWUubGVuZ3RoKSB7XG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuX2NyZWF0aW9uUXVldWUubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICBjb25zdCByZXF1ZXN0ID0gdGhpcy5fY3JlYXRpb25RdWV1ZVtpXTtcblxuICAgICAgICAgICAgICAgIGZyYW1lLmNyZWF0ZUFuY2hvcihyZXF1ZXN0LnRyYW5zZm9ybSwgdGhpcy5tYW5hZ2VyLl9yZWZlcmVuY2VTcGFjZSlcbiAgICAgICAgICAgICAgICAgICAgLnRoZW4oKHhyQW5jaG9yKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocmVxdWVzdC5jYWxsYmFjaylcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9jYWxsYmFja3NBbmNob3JzLnNldCh4ckFuY2hvciwgcmVxdWVzdC5jYWxsYmFjayk7XG4gICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICAgIC5jYXRjaCgoZXgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChyZXF1ZXN0LmNhbGxiYWNrKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlcXVlc3QuY2FsbGJhY2soZXgsIG51bGwpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmZpcmUoJ2Vycm9yJywgZXgpO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5fY3JlYXRpb25RdWV1ZS5sZW5ndGggPSAwO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gY2hlY2sgaWYgZGVzdHJveWVkXG4gICAgICAgIGZvciAoY29uc3QgW3hyQW5jaG9yLCBhbmNob3JdIG9mIHRoaXMuX2luZGV4KSB7XG4gICAgICAgICAgICBpZiAoZnJhbWUudHJhY2tlZEFuY2hvcnMuaGFzKHhyQW5jaG9yKSlcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcblxuICAgICAgICAgICAgYW5jaG9yLmRlc3Ryb3koKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHVwZGF0ZSBleGlzdGluZyBhbmNob3JzXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fbGlzdC5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgdGhpcy5fbGlzdFtpXS51cGRhdGUoZnJhbWUpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gY2hlY2sgaWYgYWRkZWRcbiAgICAgICAgZm9yIChjb25zdCB4ckFuY2hvciBvZiBmcmFtZS50cmFja2VkQW5jaG9ycykge1xuICAgICAgICAgICAgaWYgKHRoaXMuX2luZGV4Lmhhcyh4ckFuY2hvcikpXG4gICAgICAgICAgICAgICAgY29udGludWU7XG5cbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdG1wID0geHJBbmNob3IuYW5jaG9yU3BhY2U7IC8vIGVzbGludC1kaXNhYmxlLWxpbmUgbm8tdW51c2VkLXZhcnNcbiAgICAgICAgICAgIH0gY2F0Y2ggKGV4KSB7XG4gICAgICAgICAgICAgICAgLy8gaWYgYW5jaG9yU3BhY2UgaXMgbm90IGF2YWlsYWJsZSwgdGhlbiBhbmNob3IgaXMgaW52YWxpZFxuICAgICAgICAgICAgICAgIC8vIGFuZCBzaG91bGQgbm90IGJlIGNyZWF0ZWRcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgYW5jaG9yID0gbmV3IFhyQW5jaG9yKHRoaXMsIHhyQW5jaG9yKTtcbiAgICAgICAgICAgIHRoaXMuX2luZGV4LnNldCh4ckFuY2hvciwgYW5jaG9yKTtcbiAgICAgICAgICAgIHRoaXMuX2xpc3QucHVzaChhbmNob3IpO1xuICAgICAgICAgICAgYW5jaG9yLnVwZGF0ZShmcmFtZSk7XG5cbiAgICAgICAgICAgIGNvbnN0IGNhbGxiYWNrID0gdGhpcy5fY2FsbGJhY2tzQW5jaG9ycy5nZXQoeHJBbmNob3IpO1xuICAgICAgICAgICAgaWYgKGNhbGxiYWNrKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fY2FsbGJhY2tzQW5jaG9ycy5kZWxldGUoeHJBbmNob3IpO1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsIGFuY2hvcik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuZmlyZSgnYWRkJywgYW5jaG9yKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRydWUgaWYgQW5jaG9ycyBhcmUgc3VwcG9ydGVkLlxuICAgICAqXG4gICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICovXG4gICAgZ2V0IHN1cHBvcnRlZCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3N1cHBvcnRlZDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBMaXN0IG9mIGF2YWlsYWJsZSB7QGxpbmsgWHJBbmNob3J9cy5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtBcnJheTxYckFuY2hvcj59XG4gICAgICovXG4gICAgZ2V0IGxpc3QoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9saXN0O1xuICAgIH1cbn1cblxuZXhwb3J0IHsgWHJBbmNob3JzIH07XG4iXSwibmFtZXMiOlsiWHJBbmNob3JzIiwiRXZlbnRIYW5kbGVyIiwiY29uc3RydWN0b3IiLCJtYW5hZ2VyIiwiX3N1cHBvcnRlZCIsInBsYXRmb3JtIiwiYnJvd3NlciIsIndpbmRvdyIsIlhSQW5jaG9yIiwiX2NyZWF0aW9uUXVldWUiLCJfaW5kZXgiLCJNYXAiLCJfbGlzdCIsIl9jYWxsYmFja3NBbmNob3JzIiwib24iLCJfb25TZXNzaW9uRW5kIiwiaSIsImxlbmd0aCIsImNhbGxiYWNrIiwiRXJyb3IiLCJkZXN0cm95IiwiY3JlYXRlIiwicG9zaXRpb24iLCJyb3RhdGlvbiIsInB1c2giLCJ0cmFuc2Zvcm0iLCJYUlJpZ2lkVHJhbnNmb3JtIiwidXBkYXRlIiwiZnJhbWUiLCJyZXF1ZXN0IiwiY3JlYXRlQW5jaG9yIiwiX3JlZmVyZW5jZVNwYWNlIiwidGhlbiIsInhyQW5jaG9yIiwic2V0IiwiY2F0Y2giLCJleCIsImZpcmUiLCJhbmNob3IiLCJ0cmFja2VkQW5jaG9ycyIsImhhcyIsInRtcCIsImFuY2hvclNwYWNlIiwiWHJBbmNob3IiLCJnZXQiLCJkZWxldGUiLCJzdXBwb3J0ZWQiLCJsaXN0Il0sIm1hcHBpbmdzIjoiOzs7O0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsTUFBTUEsU0FBUyxTQUFTQyxZQUFZLENBQUM7QUFzQ2pDO0FBQ0o7QUFDQTtBQUNBO0VBQ0lDLFdBQVdBLENBQUNDLE9BQU8sRUFBRTtBQUNqQixJQUFBLEtBQUssRUFBRSxDQUFBO0FBMUNYO0FBQ0o7QUFDQTtBQUNBO0lBSEksSUFJQUMsQ0FBQUEsVUFBVSxHQUFHQyxRQUFRLENBQUNDLE9BQU8sSUFBSSxDQUFDLENBQUNDLE1BQU0sQ0FBQ0MsUUFBUSxDQUFBO0FBRWxEO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtJQUxJLElBTUFDLENBQUFBLGNBQWMsR0FBRyxFQUFFLENBQUE7QUFFbkI7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBTEksSUFBQSxJQUFBLENBTUFDLE1BQU0sR0FBRyxJQUFJQyxHQUFHLEVBQUUsQ0FBQTtBQUVsQjtBQUNKO0FBQ0E7QUFDQTtJQUhJLElBSUFDLENBQUFBLEtBQUssR0FBRyxFQUFFLENBQUE7QUFFVjtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQU5JLElBQUEsSUFBQSxDQU9BQyxpQkFBaUIsR0FBRyxJQUFJ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
