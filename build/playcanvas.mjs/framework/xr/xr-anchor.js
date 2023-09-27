import { EventHandler } from '../../core/event-handler.js';
import { Vec3 } from '../../core/math/vec3.js';
import { Quat } from '../../core/math/quat.js';

/**
 * An anchor keeps track of a position and rotation that is fixed relative to the real world.
 * This allows the application to adjust the location of the virtual objects placed in the
 * scene in a way that helps with maintaining the illusion that the placed objects are really
 * present in the user’s environment.
 *
 * @augments EventHandler
 * @category XR
 */
class XrAnchor extends EventHandler {
  /**
   * @param {import('./xr-anchors.js').XrAnchors} anchors - Anchor manager.
   * @param {object} xrAnchor - native XRAnchor object that is provided by WebXR API
   * @hideconstructor
   */
  constructor(anchors, xrAnchor) {
    super();
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
    this._anchors = anchors;
    this._xrAnchor = xrAnchor;
  }

  /**
   * Fired when an {@link XrAnchor} is destroyed.
   *
   * @event XrAnchor#destroy
   * @example
   * // once anchor is destroyed
   * anchor.once('destroy', function () {
   *     // destroy its related entity
   *     entity.destroy();
   * });
   */

  /**
   * Fired when an {@link XrAnchor}'s position and/or rotation is changed.
   *
   * @event XrAnchor#change
   * @example
   * anchor.on('change', function () {
   *     // anchor has been updated
   *     entity.setPosition(anchor.getPosition());
   *     entity.setRotation(anchor.getRotation());
   * });
   */

  /**
   * Destroy an anchor.
   */
  destroy() {
    if (!this._xrAnchor) return;
    this._anchors._index.delete(this._xrAnchor);
    const ind = this._anchors._list.indexOf(this);
    if (ind !== -1) this._anchors._list.splice(ind, 1);
    this._xrAnchor.delete();
    this._xrAnchor = null;
    this.fire('destroy');
    this._anchors.fire('destroy', this);
  }

  /**
   * @param {*} frame - XRFrame from requestAnimationFrame callback.
   * @ignore
   */
  update(frame) {
    if (!this._xrAnchor) return;
    const pose = frame.getPose(this._xrAnchor.anchorSpace, this._anchors.manager._referenceSpace);
    if (pose) {
      if (this._position.equals(pose.transform.position) && this._rotation.equals(pose.transform.orientation)) return;
      this._position.copy(pose.transform.position);
      this._rotation.copy(pose.transform.orientation);
      this.fire('change');
    }
  }

  /**
   * Get the world space position of an anchor.
   *
   * @returns {Vec3} The world space position of an anchor.
   */
  getPosition() {
    return this._position;
  }

  /**
   * Get the world space rotation of an anchor.
   *
   * @returns {Quat} The world space rotation of an anchor.
   */
  getRotation() {
    return this._rotation;
  }
}

export { XrAnchor };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoieHItYW5jaG9yLmpzIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvZnJhbWV3b3JrL3hyL3hyLWFuY2hvci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBFdmVudEhhbmRsZXIgfSBmcm9tICcuLi8uLi9jb3JlL2V2ZW50LWhhbmRsZXIuanMnO1xuXG5pbXBvcnQgeyBWZWMzIH0gZnJvbSAnLi4vLi4vY29yZS9tYXRoL3ZlYzMuanMnO1xuaW1wb3J0IHsgUXVhdCB9IGZyb20gJy4uLy4uL2NvcmUvbWF0aC9xdWF0LmpzJztcblxuLyoqXG4gKiBBbiBhbmNob3Iga2VlcHMgdHJhY2sgb2YgYSBwb3NpdGlvbiBhbmQgcm90YXRpb24gdGhhdCBpcyBmaXhlZCByZWxhdGl2ZSB0byB0aGUgcmVhbCB3b3JsZC5cbiAqIFRoaXMgYWxsb3dzIHRoZSBhcHBsaWNhdGlvbiB0byBhZGp1c3QgdGhlIGxvY2F0aW9uIG9mIHRoZSB2aXJ0dWFsIG9iamVjdHMgcGxhY2VkIGluIHRoZVxuICogc2NlbmUgaW4gYSB3YXkgdGhhdCBoZWxwcyB3aXRoIG1haW50YWluaW5nIHRoZSBpbGx1c2lvbiB0aGF0IHRoZSBwbGFjZWQgb2JqZWN0cyBhcmUgcmVhbGx5XG4gKiBwcmVzZW50IGluIHRoZSB1c2Vy4oCZcyBlbnZpcm9ubWVudC5cbiAqXG4gKiBAYXVnbWVudHMgRXZlbnRIYW5kbGVyXG4gKiBAY2F0ZWdvcnkgWFJcbiAqL1xuY2xhc3MgWHJBbmNob3IgZXh0ZW5kcyBFdmVudEhhbmRsZXIge1xuICAgIC8qKlxuICAgICAqIEB0eXBlIHtWZWMzfVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX3Bvc2l0aW9uID0gbmV3IFZlYzMoKTtcblxuICAgIC8qKlxuICAgICAqIEB0eXBlIHtRdWF0fVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX3JvdGF0aW9uID0gbmV3IFF1YXQoKTtcblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuL3hyLWFuY2hvcnMuanMnKS5YckFuY2hvcnN9IGFuY2hvcnMgLSBBbmNob3IgbWFuYWdlci5cbiAgICAgKiBAcGFyYW0ge29iamVjdH0geHJBbmNob3IgLSBuYXRpdmUgWFJBbmNob3Igb2JqZWN0IHRoYXQgaXMgcHJvdmlkZWQgYnkgV2ViWFIgQVBJXG4gICAgICogQGhpZGVjb25zdHJ1Y3RvclxuICAgICAqL1xuICAgIGNvbnN0cnVjdG9yKGFuY2hvcnMsIHhyQW5jaG9yKSB7XG4gICAgICAgIHN1cGVyKCk7XG5cbiAgICAgICAgdGhpcy5fYW5jaG9ycyA9IGFuY2hvcnM7XG4gICAgICAgIHRoaXMuX3hyQW5jaG9yID0geHJBbmNob3I7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRmlyZWQgd2hlbiBhbiB7QGxpbmsgWHJBbmNob3J9IGlzIGRlc3Ryb3llZC5cbiAgICAgKlxuICAgICAqIEBldmVudCBYckFuY2hvciNkZXN0cm95XG4gICAgICogQGV4YW1wbGVcbiAgICAgKiAvLyBvbmNlIGFuY2hvciBpcyBkZXN0cm95ZWRcbiAgICAgKiBhbmNob3Iub25jZSgnZGVzdHJveScsIGZ1bmN0aW9uICgpIHtcbiAgICAgKiAgICAgLy8gZGVzdHJveSBpdHMgcmVsYXRlZCBlbnRpdHlcbiAgICAgKiAgICAgZW50aXR5LmRlc3Ryb3koKTtcbiAgICAgKiB9KTtcbiAgICAgKi9cblxuICAgIC8qKlxuICAgICAqIEZpcmVkIHdoZW4gYW4ge0BsaW5rIFhyQW5jaG9yfSdzIHBvc2l0aW9uIGFuZC9vciByb3RhdGlvbiBpcyBjaGFuZ2VkLlxuICAgICAqXG4gICAgICogQGV2ZW50IFhyQW5jaG9yI2NoYW5nZVxuICAgICAqIEBleGFtcGxlXG4gICAgICogYW5jaG9yLm9uKCdjaGFuZ2UnLCBmdW5jdGlvbiAoKSB7XG4gICAgICogICAgIC8vIGFuY2hvciBoYXMgYmVlbiB1cGRhdGVkXG4gICAgICogICAgIGVudGl0eS5zZXRQb3NpdGlvbihhbmNob3IuZ2V0UG9zaXRpb24oKSk7XG4gICAgICogICAgIGVudGl0eS5zZXRSb3RhdGlvbihhbmNob3IuZ2V0Um90YXRpb24oKSk7XG4gICAgICogfSk7XG4gICAgICovXG5cbiAgICAvKipcbiAgICAgKiBEZXN0cm95IGFuIGFuY2hvci5cbiAgICAgKi9cbiAgICBkZXN0cm95KCkge1xuICAgICAgICBpZiAoIXRoaXMuX3hyQW5jaG9yKSByZXR1cm47XG4gICAgICAgIHRoaXMuX2FuY2hvcnMuX2luZGV4LmRlbGV0ZSh0aGlzLl94ckFuY2hvcik7XG5cbiAgICAgICAgY29uc3QgaW5kID0gdGhpcy5fYW5jaG9ycy5fbGlzdC5pbmRleE9mKHRoaXMpO1xuICAgICAgICBpZiAoaW5kICE9PSAtMSkgdGhpcy5fYW5jaG9ycy5fbGlzdC5zcGxpY2UoaW5kLCAxKTtcblxuICAgICAgICB0aGlzLl94ckFuY2hvci5kZWxldGUoKTtcbiAgICAgICAgdGhpcy5feHJBbmNob3IgPSBudWxsO1xuXG4gICAgICAgIHRoaXMuZmlyZSgnZGVzdHJveScpO1xuICAgICAgICB0aGlzLl9hbmNob3JzLmZpcmUoJ2Rlc3Ryb3knLCB0aGlzKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0geyp9IGZyYW1lIC0gWFJGcmFtZSBmcm9tIHJlcXVlc3RBbmltYXRpb25GcmFtZSBjYWxsYmFjay5cbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgdXBkYXRlKGZyYW1lKSB7XG4gICAgICAgIGlmICghdGhpcy5feHJBbmNob3IpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgY29uc3QgcG9zZSA9IGZyYW1lLmdldFBvc2UodGhpcy5feHJBbmNob3IuYW5jaG9yU3BhY2UsIHRoaXMuX2FuY2hvcnMubWFuYWdlci5fcmVmZXJlbmNlU3BhY2UpO1xuICAgICAgICBpZiAocG9zZSkge1xuICAgICAgICAgICAgaWYgKHRoaXMuX3Bvc2l0aW9uLmVxdWFscyhwb3NlLnRyYW5zZm9ybS5wb3NpdGlvbikgJiYgdGhpcy5fcm90YXRpb24uZXF1YWxzKHBvc2UudHJhbnNmb3JtLm9yaWVudGF0aW9uKSlcbiAgICAgICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgICAgIHRoaXMuX3Bvc2l0aW9uLmNvcHkocG9zZS50cmFuc2Zvcm0ucG9zaXRpb24pO1xuICAgICAgICAgICAgdGhpcy5fcm90YXRpb24uY29weShwb3NlLnRyYW5zZm9ybS5vcmllbnRhdGlvbik7XG4gICAgICAgICAgICB0aGlzLmZpcmUoJ2NoYW5nZScpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogR2V0IHRoZSB3b3JsZCBzcGFjZSBwb3NpdGlvbiBvZiBhbiBhbmNob3IuXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7VmVjM30gVGhlIHdvcmxkIHNwYWNlIHBvc2l0aW9uIG9mIGFuIGFuY2hvci5cbiAgICAgKi9cbiAgICBnZXRQb3NpdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3Bvc2l0aW9uO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEdldCB0aGUgd29ybGQgc3BhY2Ugcm90YXRpb24gb2YgYW4gYW5jaG9yLlxuICAgICAqXG4gICAgICogQHJldHVybnMge1F1YXR9IFRoZSB3b3JsZCBzcGFjZSByb3RhdGlvbiBvZiBhbiBhbmNob3IuXG4gICAgICovXG4gICAgZ2V0Um90YXRpb24oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9yb3RhdGlvbjtcbiAgICB9XG59XG5cbmV4cG9ydCB7IFhyQW5jaG9yIH07XG4iXSwibmFtZXMiOlsiWHJBbmNob3IiLCJFdmVudEhhbmRsZXIiLCJjb25zdHJ1Y3RvciIsImFuY2hvcnMiLCJ4ckFuY2hvciIsIl9wb3NpdGlvbiIsIlZlYzMiLCJfcm90YXRpb24iLCJRdWF0IiwiX2FuY2hvcnMiLCJfeHJBbmNob3IiLCJkZXN0cm95IiwiX2luZGV4IiwiZGVsZXRlIiwiaW5kIiwiX2xpc3QiLCJpbmRleE9mIiwic3BsaWNlIiwiZmlyZSIsInVwZGF0ZSIsImZyYW1lIiwicG9zZSIsImdldFBvc2UiLCJhbmNob3JTcGFjZSIsIm1hbmFnZXIiLCJfcmVmZXJlbmNlU3BhY2UiLCJlcXVhbHMiLCJ0cmFuc2Zvcm0iLCJwb3NpdGlvbiIsIm9yaWVudGF0aW9uIiwiY29weSIsImdldFBvc2l0aW9uIiwiZ2V0Um90YXRpb24iXSwibWFwcGluZ3MiOiI7Ozs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxNQUFNQSxRQUFRLFNBQVNDLFlBQVksQ0FBQztBQWFoQztBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0lDLEVBQUFBLFdBQVdBLENBQUNDLE9BQU8sRUFBRUMsUUFBUSxFQUFFO0FBQzNCLElBQUEsS0FBSyxFQUFFLENBQUE7QUFsQlg7QUFDSjtBQUNBO0FBQ0E7QUFISSxJQUFBLElBQUEsQ0FJQUMsU0FBUyxHQUFHLElBQUlDLElBQUksRUFBRSxDQUFBO0FBRXRCO0FBQ0o7QUFDQTtBQUNBO0FBSEksSUFBQSxJQUFBLENBSUFDLFNBQVMsR0FBRyxJQUFJQyxJQUFJLEVBQUUsQ0FBQTtJQVVsQixJQUFJLENBQUNDLFFBQVEsR0FBR04sT0FBTyxDQUFBO0lBQ3ZCLElBQUksQ0FBQ08sU0FBUyxHQUFHTixRQUFRLENBQUE7QUFDN0IsR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVJO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUk7QUFDSjtBQUNBO0FBQ0lPLEVBQUFBLE9BQU9BLEdBQUc7QUFDTixJQUFBLElBQUksQ0FBQyxJQUFJLENBQUNELFNBQVMsRUFBRSxPQUFBO0lBQ3JCLElBQUksQ0FBQ0QsUUFBUSxDQUFDRyxNQUFNLENBQUNDLE1BQU0sQ0FBQyxJQUFJLENBQUNILFNBQVMsQ0FBQyxDQUFBO0lBRTNDLE1BQU1JLEdBQUcsR0FBRyxJQUFJLENBQUNMLFFBQVEsQ0FBQ00sS0FBSyxDQUFDQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUE7QUFDN0MsSUFBQSxJQUFJRixHQUFHLEtBQUssQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDTCxRQUFRLENBQUNNLEtBQUssQ0FBQ0UsTUFBTSxDQUFDSCxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUE7QUFFbEQsSUFBQSxJQUFJLENBQUNKLFNBQVMsQ0FBQ0csTUFBTSxFQUFFLENBQUE7SUFDdkIsSUFBSSxDQUFDSCxTQUFTLEdBQUcsSUFBSSxDQUFBO0FBRXJCLElBQUEsSUFBSSxDQUFDUSxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUE7SUFDcEIsSUFBSSxDQUFDVCxRQUFRLENBQUNTLElBQUksQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLENBQUE7QUFDdkMsR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtFQUNJQyxNQUFNQSxDQUFDQyxLQUFLLEVBQUU7QUFDVixJQUFBLElBQUksQ0FBQyxJQUFJLENBQUNWLFNBQVMsRUFDZixPQUFBO0FBRUosSUFBQSxNQUFNVyxJQUFJLEdBQUdELEtBQUssQ0FBQ0UsT0FBTyxDQUFDLElBQUksQ0FBQ1osU0FBUyxDQUFDYSxXQUFXLEVBQUUsSUFBSSxDQUFDZCxRQUFRLENBQUNlLE9BQU8sQ0FBQ0MsZUFBZSxDQUFDLENBQUE7QUFDN0YsSUFBQSxJQUFJSixJQUFJLEVBQUU7TUFDTixJQUFJLElBQUksQ0FBQ2hCLFNBQVMsQ0FBQ3FCLE1BQU0sQ0FBQ0wsSUFBSSxDQUFDTSxTQUFTLENBQUNDLFFBQVEsQ0FBQyxJQUFJLElBQUksQ0FBQ3JCLFNBQVMsQ0FBQ21CLE1BQU0sQ0FBQ0wsSUFBSSxDQUFDTSxTQUFTLENBQUNFLFdBQVcsQ0FBQyxFQUNuRyxPQUFBO01BRUosSUFBSSxDQUFDeEIsU0FBUyxDQUFDeUIsSUFBSSxDQUFDVCxJQUFJLENBQUNNLFNBQVMsQ0FBQ0MsUUFBUSxDQUFDLENBQUE7TUFDNUMsSUFBSSxDQUFDckIsU0FBUyxDQUFDdUIsSUFBSSxDQUFDVCxJQUFJLENBQUNNLFNBQVMsQ0FBQ0UsV0FBVyxDQUFDLENBQUE7QUFDL0MsTUFBQSxJQUFJLENBQUNYLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQTtBQUN2QixLQUFBO0FBQ0osR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0lhLEVBQUFBLFdBQVdBLEdBQUc7SUFDVixPQUFPLElBQUksQ0FBQzFCLFNBQVMsQ0FBQTtBQUN6QixHQUFBOztBQUVBO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDSTJCLEVBQUFBLFdBQVdBLEdBQUc7SUFDVixPQUFPLElBQUksQ0FBQ3pCLFNBQVMsQ0FBQTtBQUN6QixHQUFBO0FBQ0o7Ozs7In0=
