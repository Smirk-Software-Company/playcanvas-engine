import { EventHandler } from '../../core/event-handler.js';
import { Mat4 } from '../../core/math/mat4.js';
import { Quat } from '../../core/math/quat.js';
import { Vec3 } from '../../core/math/vec3.js';
import { Ray } from '../../core/shape/ray.js';
import { XrHand } from './xr-hand.js';

const quat = new Quat();
let ids = 0;

/**
 * Represents XR input source, which is any input mechanism which allows the user to perform
 * targeted actions in the same virtual space as the viewer. Example XR input sources include, but
 * are not limited to, handheld controllers, optically tracked hands, and gaze-based input methods
 * that operate on the viewer's pose.
 *
 * @augments EventHandler
 * @category XR
 */
class XrInputSource extends EventHandler {
  /**
   * Create a new XrInputSource instance.
   *
   * @param {import('./xr-manager.js').XrManager} manager - WebXR Manager.
   * @param {*} xrInputSource - [XRInputSource](https://developer.mozilla.org/en-US/docs/Web/API/XRInputSource)
   * object that is created by WebXR API.
   * @hideconstructor
   */
  constructor(manager, xrInputSource) {
    super();
    /**
     * @type {number}
     * @private
     */
    this._id = void 0;
    /**
     * @type {import('./xr-manager.js').XrManager}
     * @private
     */
    this._manager = void 0;
    /**
     * @type {XRInputSource}
     * @private
     */
    this._xrInputSource = void 0;
    /**
     * @type {Ray}
     * @private
     */
    this._ray = new Ray();
    /**
     * @type {Ray}
     * @private
     */
    this._rayLocal = new Ray();
    /**
     * @type {boolean}
     * @private
     */
    this._grip = false;
    /**
     * @type {XrHand}
     * @private
     */
    this._hand = null;
    /**
     * @type {Mat4|null}
     * @private
     */
    this._localTransform = null;
    /**
     * @type {Mat4|null}
     * @private
     */
    this._worldTransform = null;
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
    /**
     * @type {Mat4|null}
     * @private
     */
    this._localPosition = null;
    /**
     * @type {Mat4|null}
     * @private
     */
    this._localRotation = null;
    /**
     * @type {boolean}
     * @private
     */
    this._dirtyLocal = true;
    /**
     * @type {boolean}
     * @private
     */
    this._dirtyRay = false;
    /**
     * @type {boolean}
     * @private
     */
    this._selecting = false;
    /**
     * @type {boolean}
     * @private
     */
    this._squeezing = false;
    /**
     * @type {boolean}
     * @private
     */
    this._elementInput = true;
    /**
     * @type {import('../entity.js').Entity|null}
     * @private
     */
    this._elementEntity = null;
    /**
     * @type {import('./xr-hit-test-source.js').XrHitTestSource[]}
     * @private
     */
    this._hitTestSources = [];
    this._id = ++ids;
    this._manager = manager;
    this._xrInputSource = xrInputSource;
    if (xrInputSource.hand) this._hand = new XrHand(this);
  }

  /**
   * Fired when {@link XrInputSource} is removed.
   *
   * @event XrInputSource#remove
   * @example
   * inputSource.once('remove', function () {
   *     // input source is not available anymore
   * });
   */

  /**
   * Fired when input source has triggered primary action. This could be pressing a trigger
   * button, or touching a screen.
   *
   * @event XrInputSource#select
   * @param {object} evt - XRInputSourceEvent event data from WebXR API.
   * @example
   * const ray = new pc.Ray();
   * inputSource.on('select', function (evt) {
   *     ray.set(inputSource.getOrigin(), inputSource.getDirection());
   *     if (obj.intersectsRay(ray)) {
   *         // selected an object with input source
   *     }
   * });
   */

  /**
   * Fired when input source has started to trigger primary action.
   *
   * @event XrInputSource#selectstart
   * @param {object} evt - XRInputSourceEvent event data from WebXR API.
   */

  /**
   * Fired when input source has ended triggering primary action.
   *
   * @event XrInputSource#selectend
   * @param {object} evt - XRInputSourceEvent event data from WebXR API.
   */

  /**
   * Fired when input source has triggered squeeze action. This is associated with "grabbing"
   * action on the controllers.
   *
   * @event XrInputSource#squeeze
   * @param {object} evt - XRInputSourceEvent event data from WebXR API.
   */

  /**
   * Fired when input source has started to trigger squeeze action.
   *
   * @event XrInputSource#squeezestart
   * @param {object} evt - XRInputSourceEvent event data from WebXR API.
   * @example
   * inputSource.on('squeezestart', function (evt) {
   *     if (obj.containsPoint(inputSource.getPosition())) {
   *         // grabbed an object
   *     }
   * });
   */

  /**
   * Fired when input source has ended triggering squeeze action.
   *
   * @event XrInputSource#squeezeend
   * @param {object} evt - XRInputSourceEvent event data from WebXR API.
   */

  /**
   * Fired when new {@link XrHitTestSource} is added to the input source.
   *
   * @event XrInputSource#hittest:add
   * @param {import('./xr-hit-test-source.js').XrHitTestSource} hitTestSource - Hit test source
   * that has been added.
   * @example
   * inputSource.on('hittest:add', function (hitTestSource) {
   *     // new hit test source is added
   * });
   */

  /**
   * Fired when {@link XrHitTestSource} is removed to the the input source.
   *
   * @event XrInputSource#hittest:remove
   * @param {import('./xr-hit-test-source.js').XrHitTestSource} hitTestSource - Hit test source
   * that has been removed.
   * @example
   * inputSource.on('remove', function (hitTestSource) {
   *     // hit test source is removed
   * });
   */

  /**
   * Fired when hit test source receives new results. It provides transform information that
   * tries to match real world picked geometry.
   *
   * @event XrInputSource#hittest:result
   * @param {import('./xr-hit-test-source.js').XrHitTestSource} hitTestSource - Hit test source
   * that produced the hit result.
   * @param {Vec3} position - Position of hit test.
   * @param {Quat} rotation - Rotation of hit test.
   * @example
   * inputSource.on('hittest:result', function (hitTestSource, position, rotation) {
   *     target.setPosition(position);
   *     target.setRotation(rotation);
   * });
   */

  /**
   * Unique number associated with instance of input source. Same physical devices when
   * reconnected will not share this ID.
   *
   * @type {number}
   */
  get id() {
    return this._id;
  }

  /**
   * XRInputSource object that is associated with this input source.
   *
   * @type {object}
   */
  get inputSource() {
    return this._xrInputSource;
  }

  /**
   * Type of ray Input Device is based on. Can be one of the following:
   *
   * - {@link XRTARGETRAY_GAZE}: Gaze - indicates the target ray will originate at the viewer and
   * follow the direction it is facing. This is commonly referred to as a "gaze input" device in
   * the context of head-mounted displays.
   * - {@link XRTARGETRAY_SCREEN}: Screen - indicates that the input source was an interaction
   * with the canvas element associated with an inline session's output context, such as a mouse
   * click or touch event.
   * - {@link XRTARGETRAY_POINTER}: Tracked Pointer - indicates that the target ray originates
   * from either a handheld device or other hand-tracking mechanism and represents that the user
   * is using their hands or the held device for pointing.
   *
   * @type {string}
   */
  get targetRayMode() {
    return this._xrInputSource.targetRayMode;
  }

  /**
   * Describes which hand input source is associated with. Can be one of the following:
   *
   * - {@link XRHAND_NONE}: None - input source is not meant to be held in hands.
   * - {@link XRHAND_LEFT}: Left - indicates that input source is meant to be held in left hand.
   * - {@link XRHAND_RIGHT}: Right - indicates that input source is meant to be held in right
   * hand.
   *
   * @type {string}
   */
  get handedness() {
    return this._xrInputSource.handedness;
  }

  /**
   * List of input profile names indicating both the preferred visual representation and behavior
   * of the input source.
   *
   * @type {string[]}
   */
  get profiles() {
    return this._xrInputSource.profiles;
  }

  /**
   * If input source can be held, then it will have node with its world transformation, that can
   * be used to position and rotate virtual joysticks based on it.
   *
   * @type {boolean}
   */
  get grip() {
    return this._grip;
  }

  /**
   * If input source is a tracked hand, then it will point to {@link XrHand} otherwise it is
   * null.
   *
   * @type {XrHand|null}
   */
  get hand() {
    return this._hand;
  }

  /**
   * If input source has buttons, triggers, thumbstick or touchpad, then this object provides
   * access to its states.
   *
   * @type {Gamepad|null}
   */
  get gamepad() {
    return this._xrInputSource.gamepad || null;
  }

  /**
   * True if input source is in active primary action between selectstart and selectend events.
   *
   * @type {boolean}
   */
  get selecting() {
    return this._selecting;
  }

  /**
   * True if input source is in active squeeze action between squeezestart and squeezeend events.
   *
   * @type {boolean}
   */
  get squeezing() {
    return this._squeezing;
  }

  /**
   * Set to true to allow input source to interact with Element components. Defaults to true.
   *
   * @type {boolean}
   */
  set elementInput(value) {
    if (this._elementInput === value) return;
    this._elementInput = value;
    if (!this._elementInput) this._elementEntity = null;
  }
  get elementInput() {
    return this._elementInput;
  }

  /**
   * If {@link XrInputSource#elementInput} is true, this property will hold entity with Element
   * component at which this input source is hovering, or null if not hovering over any element.
   *
   * @type {import('../entity.js').Entity|null}
   */
  get elementEntity() {
    return this._elementEntity;
  }

  /**
   * List of active {@link XrHitTestSource} instances created by this input source.
   *
   * @type {import('./xr-hit-test-source.js').XrHitTestSource[]}
   */
  get hitTestSources() {
    return this._hitTestSources;
  }

  /**
   * @param {*} frame - XRFrame from requestAnimationFrame callback.
   * @ignore
   */
  update(frame) {
    // hand
    if (this._hand) {
      this._hand.update(frame);
    } else {
      // grip
      if (this._xrInputSource.gripSpace) {
        const gripPose = frame.getPose(this._xrInputSource.gripSpace, this._manager._referenceSpace);
        if (gripPose) {
          if (!this._grip) {
            this._grip = true;
            this._localTransform = new Mat4();
            this._worldTransform = new Mat4();
            this._localPosition = new Vec3();
            this._localRotation = new Quat();
          }
          this._dirtyLocal = true;
          this._localPosition.copy(gripPose.transform.position);
          this._localRotation.copy(gripPose.transform.orientation);
        }
      }

      // ray
      const targetRayPose = frame.getPose(this._xrInputSource.targetRaySpace, this._manager._referenceSpace);
      if (targetRayPose) {
        this._dirtyRay = true;
        this._rayLocal.origin.copy(targetRayPose.transform.position);
        this._rayLocal.direction.set(0, 0, -1);
        quat.copy(targetRayPose.transform.orientation);
        quat.transformVector(this._rayLocal.direction, this._rayLocal.direction);
      }
    }
  }

  /** @private */
  _updateTransforms() {
    if (this._dirtyLocal) {
      this._dirtyLocal = false;
      this._localTransform.setTRS(this._localPosition, this._localRotation, Vec3.ONE);
    }
    const parent = this._manager.camera.parent;
    if (parent) {
      this._worldTransform.mul2(parent.getWorldTransform(), this._localTransform);
    } else {
      this._worldTransform.copy(this._localTransform);
    }
  }

  /** @private */
  _updateRayTransforms() {
    const dirty = this._dirtyRay;
    this._dirtyRay = false;
    const parent = this._manager.camera.parent;
    if (parent) {
      const parentTransform = this._manager.camera.parent.getWorldTransform();
      parentTransform.getTranslation(this._position);
      this._rotation.setFromMat4(parentTransform);
      this._rotation.transformVector(this._rayLocal.origin, this._ray.origin);
      this._ray.origin.add(this._position);
      this._rotation.transformVector(this._rayLocal.direction, this._ray.direction);
    } else if (dirty) {
      this._ray.origin.copy(this._rayLocal.origin);
      this._ray.direction.copy(this._rayLocal.direction);
    }
  }

  /**
   * Get the world space position of input source if it is handheld ({@link XrInputSource#grip}
   * is true). Otherwise it will return null.
   *
   * @returns {Vec3|null} The world space position of handheld input source.
   */
  getPosition() {
    if (!this._position) return null;
    this._updateTransforms();
    this._worldTransform.getTranslation(this._position);
    return this._position;
  }

  /**
   * Get the local space position of input source if it is handheld ({@link XrInputSource#grip}
   * is true). Local space is relative to parent of the XR camera. Otherwise it will return null.
   *
   * @returns {Vec3|null} The world space position of handheld input source.
   */
  getLocalPosition() {
    return this._localPosition;
  }

  /**
   * Get the world space rotation of input source if it is handheld ({@link XrInputSource#grip}
   * is true). Otherwise it will return null.
   *
   * @returns {Quat|null} The world space rotation of handheld input source.
   */
  getRotation() {
    if (!this._rotation) return null;
    this._updateTransforms();
    this._rotation.setFromMat4(this._worldTransform);
    return this._rotation;
  }

  /**
   * Get the local space rotation of input source if it is handheld ({@link XrInputSource#grip}
   * is true). Local space is relative to parent of the XR camera. Otherwise it will return null.
   *
   * @returns {Vec3|null} The world space rotation of handheld input source.
   */
  getLocalRotation() {
    return this._localRotation;
  }

  /**
   * Get the world space origin of input source ray.
   *
   * @returns {Vec3} The world space origin of input source ray.
   */
  getOrigin() {
    this._updateRayTransforms();
    return this._ray.origin;
  }

  /**
   * Get the world space direction of input source ray.
   *
   * @returns {Vec3} The world space direction of input source ray.
   */
  getDirection() {
    this._updateRayTransforms();
    return this._ray.direction;
  }

  /**
   * Attempts to start hit test source based on this input source.
   *
   * @param {object} [options] - Object for passing optional arguments.
   * @param {string[]} [options.entityTypes] - Optional list of underlying entity types against
   * which hit tests will be performed. Defaults to [ {@link XRTRACKABLE_PLANE} ]. Can be any
   * combination of the following:
   *
   * - {@link XRTRACKABLE_POINT}: Point - indicates that the hit test results will be computed
   * based on the feature points detected by the underlying Augmented Reality system.
   * - {@link XRTRACKABLE_PLANE}: Plane - indicates that the hit test results will be computed
   * based on the planes detected by the underlying Augmented Reality system.
   * - {@link XRTRACKABLE_MESH}: Mesh - indicates that the hit test results will be computed
   * based on the meshes detected by the underlying Augmented Reality system.
   *
   * @param {Ray} [options.offsetRay] - Optional ray by which hit test ray can be offset.
   * @param {import('./xr-hit-test.js').XrHitTestStartCallback} [options.callback] - Optional
   * callback function called once hit test source is created or failed.
   * @example
   * app.xr.input.on('add', function (inputSource) {
   *     inputSource.hitTestStart({
   *         callback: function (err, hitTestSource) {
   *             if (err) return;
   *             hitTestSource.on('result', function (position, rotation) {
   *                 // position and rotation of hit test result
   *                 // that will be created from touch on mobile devices
   *             });
   *         }
   *     });
   * });
   */
  hitTestStart(options = {}) {
    options.profile = this._xrInputSource.profiles[0];
    const callback = options.callback;
    options.callback = (err, hitTestSource) => {
      if (hitTestSource) this.onHitTestSourceAdd(hitTestSource);
      if (callback) callback(err, hitTestSource);
    };
    this._manager.hitTest.start(options);
  }

  /**
   * @param {import('./xr-hit-test-source.js').XrHitTestSource} hitTestSource - Hit test source
   * to be added.
   * @private
   */
  onHitTestSourceAdd(hitTestSource) {
    this._hitTestSources.push(hitTestSource);
    this.fire('hittest:add', hitTestSource);
    hitTestSource.on('result', function (position, rotation, inputSource) {
      if (inputSource !== this) return;
      this.fire('hittest:result', hitTestSource, position, rotation);
    }, this);
    hitTestSource.once('remove', function () {
      this.onHitTestSourceRemove(hitTestSource);
      this.fire('hittest:remove', hitTestSource);
    }, this);
  }

  /**
   * @param {import('./xr-hit-test-source.js').XrHitTestSource} hitTestSource - Hit test source
   * to be removed.
   * @private
   */
  onHitTestSourceRemove(hitTestSource) {
    const ind = this._hitTestSources.indexOf(hitTestSource);
    if (ind !== -1) this._hitTestSources.splice(ind, 1);
  }
}

export { XrInputSource };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoieHItaW5wdXQtc291cmNlLmpzIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvZnJhbWV3b3JrL3hyL3hyLWlucHV0LXNvdXJjZS5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBFdmVudEhhbmRsZXIgfSBmcm9tICcuLi8uLi9jb3JlL2V2ZW50LWhhbmRsZXIuanMnO1xuaW1wb3J0IHsgTWF0NCB9IGZyb20gJy4uLy4uL2NvcmUvbWF0aC9tYXQ0LmpzJztcbmltcG9ydCB7IFF1YXQgfSBmcm9tICcuLi8uLi9jb3JlL21hdGgvcXVhdC5qcyc7XG5pbXBvcnQgeyBWZWMzIH0gZnJvbSAnLi4vLi4vY29yZS9tYXRoL3ZlYzMuanMnO1xuaW1wb3J0IHsgUmF5IH0gZnJvbSAnLi4vLi4vY29yZS9zaGFwZS9yYXkuanMnO1xuXG5pbXBvcnQgeyBYckhhbmQgfSBmcm9tICcuL3hyLWhhbmQuanMnO1xuXG5jb25zdCBxdWF0ID0gbmV3IFF1YXQoKTtcbmxldCBpZHMgPSAwO1xuXG4vKipcbiAqIFJlcHJlc2VudHMgWFIgaW5wdXQgc291cmNlLCB3aGljaCBpcyBhbnkgaW5wdXQgbWVjaGFuaXNtIHdoaWNoIGFsbG93cyB0aGUgdXNlciB0byBwZXJmb3JtXG4gKiB0YXJnZXRlZCBhY3Rpb25zIGluIHRoZSBzYW1lIHZpcnR1YWwgc3BhY2UgYXMgdGhlIHZpZXdlci4gRXhhbXBsZSBYUiBpbnB1dCBzb3VyY2VzIGluY2x1ZGUsIGJ1dFxuICogYXJlIG5vdCBsaW1pdGVkIHRvLCBoYW5kaGVsZCBjb250cm9sbGVycywgb3B0aWNhbGx5IHRyYWNrZWQgaGFuZHMsIGFuZCBnYXplLWJhc2VkIGlucHV0IG1ldGhvZHNcbiAqIHRoYXQgb3BlcmF0ZSBvbiB0aGUgdmlld2VyJ3MgcG9zZS5cbiAqXG4gKiBAYXVnbWVudHMgRXZlbnRIYW5kbGVyXG4gKiBAY2F0ZWdvcnkgWFJcbiAqL1xuY2xhc3MgWHJJbnB1dFNvdXJjZSBleHRlbmRzIEV2ZW50SGFuZGxlciB7XG4gICAgLyoqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9pZDtcblxuICAgIC8qKlxuICAgICAqIEB0eXBlIHtpbXBvcnQoJy4veHItbWFuYWdlci5qcycpLlhyTWFuYWdlcn1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9tYW5hZ2VyO1xuXG4gICAgLyoqXG4gICAgICogQHR5cGUge1hSSW5wdXRTb3VyY2V9XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfeHJJbnB1dFNvdXJjZTtcblxuICAgIC8qKlxuICAgICAqIEB0eXBlIHtSYXl9XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfcmF5ID0gbmV3IFJheSgpO1xuXG4gICAgLyoqXG4gICAgICogQHR5cGUge1JheX1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9yYXlMb2NhbCA9IG5ldyBSYXkoKTtcblxuICAgIC8qKlxuICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX2dyaXAgPSBmYWxzZTtcblxuICAgIC8qKlxuICAgICAqIEB0eXBlIHtYckhhbmR9XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfaGFuZCA9IG51bGw7XG5cbiAgICAvKipcbiAgICAgKiBAdHlwZSB7TWF0NHxudWxsfVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX2xvY2FsVHJhbnNmb3JtID0gbnVsbDtcblxuICAgIC8qKlxuICAgICAqIEB0eXBlIHtNYXQ0fG51bGx9XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfd29ybGRUcmFuc2Zvcm0gPSBudWxsO1xuXG4gICAgLyoqXG4gICAgICogQHR5cGUge1ZlYzN9XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfcG9zaXRpb24gPSBuZXcgVmVjMygpO1xuXG4gICAgLyoqXG4gICAgICogQHR5cGUge1F1YXR9XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfcm90YXRpb24gPSBuZXcgUXVhdCgpO1xuXG4gICAgLyoqXG4gICAgICogQHR5cGUge01hdDR8bnVsbH1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9sb2NhbFBvc2l0aW9uID0gbnVsbDtcblxuICAgIC8qKlxuICAgICAqIEB0eXBlIHtNYXQ0fG51bGx9XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfbG9jYWxSb3RhdGlvbiA9IG51bGw7XG5cbiAgICAvKipcbiAgICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9kaXJ0eUxvY2FsID0gdHJ1ZTtcblxuICAgIC8qKlxuICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX2RpcnR5UmF5ID0gZmFsc2U7XG5cbiAgICAvKipcbiAgICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9zZWxlY3RpbmcgPSBmYWxzZTtcblxuICAgIC8qKlxuICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX3NxdWVlemluZyA9IGZhbHNlO1xuXG4gICAgLyoqXG4gICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfZWxlbWVudElucHV0ID0gdHJ1ZTtcblxuICAgIC8qKlxuICAgICAqIEB0eXBlIHtpbXBvcnQoJy4uL2VudGl0eS5qcycpLkVudGl0eXxudWxsfVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX2VsZW1lbnRFbnRpdHkgPSBudWxsO1xuXG4gICAgLyoqXG4gICAgICogQHR5cGUge2ltcG9ydCgnLi94ci1oaXQtdGVzdC1zb3VyY2UuanMnKS5YckhpdFRlc3RTb3VyY2VbXX1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9oaXRUZXN0U291cmNlcyA9IFtdO1xuXG4gICAgLyoqXG4gICAgICogQ3JlYXRlIGEgbmV3IFhySW5wdXRTb3VyY2UgaW5zdGFuY2UuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi94ci1tYW5hZ2VyLmpzJykuWHJNYW5hZ2VyfSBtYW5hZ2VyIC0gV2ViWFIgTWFuYWdlci5cbiAgICAgKiBAcGFyYW0geyp9IHhySW5wdXRTb3VyY2UgLSBbWFJJbnB1dFNvdXJjZV0oaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvQVBJL1hSSW5wdXRTb3VyY2UpXG4gICAgICogb2JqZWN0IHRoYXQgaXMgY3JlYXRlZCBieSBXZWJYUiBBUEkuXG4gICAgICogQGhpZGVjb25zdHJ1Y3RvclxuICAgICAqL1xuICAgIGNvbnN0cnVjdG9yKG1hbmFnZXIsIHhySW5wdXRTb3VyY2UpIHtcbiAgICAgICAgc3VwZXIoKTtcblxuICAgICAgICB0aGlzLl9pZCA9ICsraWRzO1xuXG4gICAgICAgIHRoaXMuX21hbmFnZXIgPSBtYW5hZ2VyO1xuICAgICAgICB0aGlzLl94cklucHV0U291cmNlID0geHJJbnB1dFNvdXJjZTtcblxuICAgICAgICBpZiAoeHJJbnB1dFNvdXJjZS5oYW5kKVxuICAgICAgICAgICAgdGhpcy5faGFuZCA9IG5ldyBYckhhbmQodGhpcyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRmlyZWQgd2hlbiB7QGxpbmsgWHJJbnB1dFNvdXJjZX0gaXMgcmVtb3ZlZC5cbiAgICAgKlxuICAgICAqIEBldmVudCBYcklucHV0U291cmNlI3JlbW92ZVxuICAgICAqIEBleGFtcGxlXG4gICAgICogaW5wdXRTb3VyY2Uub25jZSgncmVtb3ZlJywgZnVuY3Rpb24gKCkge1xuICAgICAqICAgICAvLyBpbnB1dCBzb3VyY2UgaXMgbm90IGF2YWlsYWJsZSBhbnltb3JlXG4gICAgICogfSk7XG4gICAgICovXG5cbiAgICAvKipcbiAgICAgKiBGaXJlZCB3aGVuIGlucHV0IHNvdXJjZSBoYXMgdHJpZ2dlcmVkIHByaW1hcnkgYWN0aW9uLiBUaGlzIGNvdWxkIGJlIHByZXNzaW5nIGEgdHJpZ2dlclxuICAgICAqIGJ1dHRvbiwgb3IgdG91Y2hpbmcgYSBzY3JlZW4uXG4gICAgICpcbiAgICAgKiBAZXZlbnQgWHJJbnB1dFNvdXJjZSNzZWxlY3RcbiAgICAgKiBAcGFyYW0ge29iamVjdH0gZXZ0IC0gWFJJbnB1dFNvdXJjZUV2ZW50IGV2ZW50IGRhdGEgZnJvbSBXZWJYUiBBUEkuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBjb25zdCByYXkgPSBuZXcgcGMuUmF5KCk7XG4gICAgICogaW5wdXRTb3VyY2Uub24oJ3NlbGVjdCcsIGZ1bmN0aW9uIChldnQpIHtcbiAgICAgKiAgICAgcmF5LnNldChpbnB1dFNvdXJjZS5nZXRPcmlnaW4oKSwgaW5wdXRTb3VyY2UuZ2V0RGlyZWN0aW9uKCkpO1xuICAgICAqICAgICBpZiAob2JqLmludGVyc2VjdHNSYXkocmF5KSkge1xuICAgICAqICAgICAgICAgLy8gc2VsZWN0ZWQgYW4gb2JqZWN0IHdpdGggaW5wdXQgc291cmNlXG4gICAgICogICAgIH1cbiAgICAgKiB9KTtcbiAgICAgKi9cblxuICAgIC8qKlxuICAgICAqIEZpcmVkIHdoZW4gaW5wdXQgc291cmNlIGhhcyBzdGFydGVkIHRvIHRyaWdnZXIgcHJpbWFyeSBhY3Rpb24uXG4gICAgICpcbiAgICAgKiBAZXZlbnQgWHJJbnB1dFNvdXJjZSNzZWxlY3RzdGFydFxuICAgICAqIEBwYXJhbSB7b2JqZWN0fSBldnQgLSBYUklucHV0U291cmNlRXZlbnQgZXZlbnQgZGF0YSBmcm9tIFdlYlhSIEFQSS5cbiAgICAgKi9cblxuICAgIC8qKlxuICAgICAqIEZpcmVkIHdoZW4gaW5wdXQgc291cmNlIGhhcyBlbmRlZCB0cmlnZ2VyaW5nIHByaW1hcnkgYWN0aW9uLlxuICAgICAqXG4gICAgICogQGV2ZW50IFhySW5wdXRTb3VyY2Ujc2VsZWN0ZW5kXG4gICAgICogQHBhcmFtIHtvYmplY3R9IGV2dCAtIFhSSW5wdXRTb3VyY2VFdmVudCBldmVudCBkYXRhIGZyb20gV2ViWFIgQVBJLlxuICAgICAqL1xuXG4gICAgLyoqXG4gICAgICogRmlyZWQgd2hlbiBpbnB1dCBzb3VyY2UgaGFzIHRyaWdnZXJlZCBzcXVlZXplIGFjdGlvbi4gVGhpcyBpcyBhc3NvY2lhdGVkIHdpdGggXCJncmFiYmluZ1wiXG4gICAgICogYWN0aW9uIG9uIHRoZSBjb250cm9sbGVycy5cbiAgICAgKlxuICAgICAqIEBldmVudCBYcklucHV0U291cmNlI3NxdWVlemVcbiAgICAgKiBAcGFyYW0ge29iamVjdH0gZXZ0IC0gWFJJbnB1dFNvdXJjZUV2ZW50IGV2ZW50IGRhdGEgZnJvbSBXZWJYUiBBUEkuXG4gICAgICovXG5cbiAgICAvKipcbiAgICAgKiBGaXJlZCB3aGVuIGlucHV0IHNvdXJjZSBoYXMgc3RhcnRlZCB0byB0cmlnZ2VyIHNxdWVlemUgYWN0aW9uLlxuICAgICAqXG4gICAgICogQGV2ZW50IFhySW5wdXRTb3VyY2Ujc3F1ZWV6ZXN0YXJ0XG4gICAgICogQHBhcmFtIHtvYmplY3R9IGV2dCAtIFhSSW5wdXRTb3VyY2VFdmVudCBldmVudCBkYXRhIGZyb20gV2ViWFIgQVBJLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogaW5wdXRTb3VyY2Uub24oJ3NxdWVlemVzdGFydCcsIGZ1bmN0aW9uIChldnQpIHtcbiAgICAgKiAgICAgaWYgKG9iai5jb250YWluc1BvaW50KGlucHV0U291cmNlLmdldFBvc2l0aW9uKCkpKSB7XG4gICAgICogICAgICAgICAvLyBncmFiYmVkIGFuIG9iamVjdFxuICAgICAqICAgICB9XG4gICAgICogfSk7XG4gICAgICovXG5cbiAgICAvKipcbiAgICAgKiBGaXJlZCB3aGVuIGlucHV0IHNvdXJjZSBoYXMgZW5kZWQgdHJpZ2dlcmluZyBzcXVlZXplIGFjdGlvbi5cbiAgICAgKlxuICAgICAqIEBldmVudCBYcklucHV0U291cmNlI3NxdWVlemVlbmRcbiAgICAgKiBAcGFyYW0ge29iamVjdH0gZXZ0IC0gWFJJbnB1dFNvdXJjZUV2ZW50IGV2ZW50IGRhdGEgZnJvbSBXZWJYUiBBUEkuXG4gICAgICovXG5cbiAgICAvKipcbiAgICAgKiBGaXJlZCB3aGVuIG5ldyB7QGxpbmsgWHJIaXRUZXN0U291cmNlfSBpcyBhZGRlZCB0byB0aGUgaW5wdXQgc291cmNlLlxuICAgICAqXG4gICAgICogQGV2ZW50IFhySW5wdXRTb3VyY2UjaGl0dGVzdDphZGRcbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi94ci1oaXQtdGVzdC1zb3VyY2UuanMnKS5YckhpdFRlc3RTb3VyY2V9IGhpdFRlc3RTb3VyY2UgLSBIaXQgdGVzdCBzb3VyY2VcbiAgICAgKiB0aGF0IGhhcyBiZWVuIGFkZGVkLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogaW5wdXRTb3VyY2Uub24oJ2hpdHRlc3Q6YWRkJywgZnVuY3Rpb24gKGhpdFRlc3RTb3VyY2UpIHtcbiAgICAgKiAgICAgLy8gbmV3IGhpdCB0ZXN0IHNvdXJjZSBpcyBhZGRlZFxuICAgICAqIH0pO1xuICAgICAqL1xuXG4gICAgLyoqXG4gICAgICogRmlyZWQgd2hlbiB7QGxpbmsgWHJIaXRUZXN0U291cmNlfSBpcyByZW1vdmVkIHRvIHRoZSB0aGUgaW5wdXQgc291cmNlLlxuICAgICAqXG4gICAgICogQGV2ZW50IFhySW5wdXRTb3VyY2UjaGl0dGVzdDpyZW1vdmVcbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi94ci1oaXQtdGVzdC1zb3VyY2UuanMnKS5YckhpdFRlc3RTb3VyY2V9IGhpdFRlc3RTb3VyY2UgLSBIaXQgdGVzdCBzb3VyY2VcbiAgICAgKiB0aGF0IGhhcyBiZWVuIHJlbW92ZWQuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBpbnB1dFNvdXJjZS5vbigncmVtb3ZlJywgZnVuY3Rpb24gKGhpdFRlc3RTb3VyY2UpIHtcbiAgICAgKiAgICAgLy8gaGl0IHRlc3Qgc291cmNlIGlzIHJlbW92ZWRcbiAgICAgKiB9KTtcbiAgICAgKi9cblxuICAgIC8qKlxuICAgICAqIEZpcmVkIHdoZW4gaGl0IHRlc3Qgc291cmNlIHJlY2VpdmVzIG5ldyByZXN1bHRzLiBJdCBwcm92aWRlcyB0cmFuc2Zvcm0gaW5mb3JtYXRpb24gdGhhdFxuICAgICAqIHRyaWVzIHRvIG1hdGNoIHJlYWwgd29ybGQgcGlja2VkIGdlb21ldHJ5LlxuICAgICAqXG4gICAgICogQGV2ZW50IFhySW5wdXRTb3VyY2UjaGl0dGVzdDpyZXN1bHRcbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi94ci1oaXQtdGVzdC1zb3VyY2UuanMnKS5YckhpdFRlc3RTb3VyY2V9IGhpdFRlc3RTb3VyY2UgLSBIaXQgdGVzdCBzb3VyY2VcbiAgICAgKiB0aGF0IHByb2R1Y2VkIHRoZSBoaXQgcmVzdWx0LlxuICAgICAqIEBwYXJhbSB7VmVjM30gcG9zaXRpb24gLSBQb3NpdGlvbiBvZiBoaXQgdGVzdC5cbiAgICAgKiBAcGFyYW0ge1F1YXR9IHJvdGF0aW9uIC0gUm90YXRpb24gb2YgaGl0IHRlc3QuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBpbnB1dFNvdXJjZS5vbignaGl0dGVzdDpyZXN1bHQnLCBmdW5jdGlvbiAoaGl0VGVzdFNvdXJjZSwgcG9zaXRpb24sIHJvdGF0aW9uKSB7XG4gICAgICogICAgIHRhcmdldC5zZXRQb3NpdGlvbihwb3NpdGlvbik7XG4gICAgICogICAgIHRhcmdldC5zZXRSb3RhdGlvbihyb3RhdGlvbik7XG4gICAgICogfSk7XG4gICAgICovXG5cbiAgICAvKipcbiAgICAgKiBVbmlxdWUgbnVtYmVyIGFzc29jaWF0ZWQgd2l0aCBpbnN0YW5jZSBvZiBpbnB1dCBzb3VyY2UuIFNhbWUgcGh5c2ljYWwgZGV2aWNlcyB3aGVuXG4gICAgICogcmVjb25uZWN0ZWQgd2lsbCBub3Qgc2hhcmUgdGhpcyBJRC5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtudW1iZXJ9XG4gICAgICovXG4gICAgZ2V0IGlkKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5faWQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogWFJJbnB1dFNvdXJjZSBvYmplY3QgdGhhdCBpcyBhc3NvY2lhdGVkIHdpdGggdGhpcyBpbnB1dCBzb3VyY2UuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7b2JqZWN0fVxuICAgICAqL1xuICAgIGdldCBpbnB1dFNvdXJjZSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3hySW5wdXRTb3VyY2U7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVHlwZSBvZiByYXkgSW5wdXQgRGV2aWNlIGlzIGJhc2VkIG9uLiBDYW4gYmUgb25lIG9mIHRoZSBmb2xsb3dpbmc6XG4gICAgICpcbiAgICAgKiAtIHtAbGluayBYUlRBUkdFVFJBWV9HQVpFfTogR2F6ZSAtIGluZGljYXRlcyB0aGUgdGFyZ2V0IHJheSB3aWxsIG9yaWdpbmF0ZSBhdCB0aGUgdmlld2VyIGFuZFxuICAgICAqIGZvbGxvdyB0aGUgZGlyZWN0aW9uIGl0IGlzIGZhY2luZy4gVGhpcyBpcyBjb21tb25seSByZWZlcnJlZCB0byBhcyBhIFwiZ2F6ZSBpbnB1dFwiIGRldmljZSBpblxuICAgICAqIHRoZSBjb250ZXh0IG9mIGhlYWQtbW91bnRlZCBkaXNwbGF5cy5cbiAgICAgKiAtIHtAbGluayBYUlRBUkdFVFJBWV9TQ1JFRU59OiBTY3JlZW4gLSBpbmRpY2F0ZXMgdGhhdCB0aGUgaW5wdXQgc291cmNlIHdhcyBhbiBpbnRlcmFjdGlvblxuICAgICAqIHdpdGggdGhlIGNhbnZhcyBlbGVtZW50IGFzc29jaWF0ZWQgd2l0aCBhbiBpbmxpbmUgc2Vzc2lvbidzIG91dHB1dCBjb250ZXh0LCBzdWNoIGFzIGEgbW91c2VcbiAgICAgKiBjbGljayBvciB0b3VjaCBldmVudC5cbiAgICAgKiAtIHtAbGluayBYUlRBUkdFVFJBWV9QT0lOVEVSfTogVHJhY2tlZCBQb2ludGVyIC0gaW5kaWNhdGVzIHRoYXQgdGhlIHRhcmdldCByYXkgb3JpZ2luYXRlc1xuICAgICAqIGZyb20gZWl0aGVyIGEgaGFuZGhlbGQgZGV2aWNlIG9yIG90aGVyIGhhbmQtdHJhY2tpbmcgbWVjaGFuaXNtIGFuZCByZXByZXNlbnRzIHRoYXQgdGhlIHVzZXJcbiAgICAgKiBpcyB1c2luZyB0aGVpciBoYW5kcyBvciB0aGUgaGVsZCBkZXZpY2UgZm9yIHBvaW50aW5nLlxuICAgICAqXG4gICAgICogQHR5cGUge3N0cmluZ31cbiAgICAgKi9cbiAgICBnZXQgdGFyZ2V0UmF5TW9kZSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3hySW5wdXRTb3VyY2UudGFyZ2V0UmF5TW9kZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBEZXNjcmliZXMgd2hpY2ggaGFuZCBpbnB1dCBzb3VyY2UgaXMgYXNzb2NpYXRlZCB3aXRoLiBDYW4gYmUgb25lIG9mIHRoZSBmb2xsb3dpbmc6XG4gICAgICpcbiAgICAgKiAtIHtAbGluayBYUkhBTkRfTk9ORX06IE5vbmUgLSBpbnB1dCBzb3VyY2UgaXMgbm90IG1lYW50IHRvIGJlIGhlbGQgaW4gaGFuZHMuXG4gICAgICogLSB7QGxpbmsgWFJIQU5EX0xFRlR9OiBMZWZ0IC0gaW5kaWNhdGVzIHRoYXQgaW5wdXQgc291cmNlIGlzIG1lYW50IHRvIGJlIGhlbGQgaW4gbGVmdCBoYW5kLlxuICAgICAqIC0ge0BsaW5rIFhSSEFORF9SSUdIVH06IFJpZ2h0IC0gaW5kaWNhdGVzIHRoYXQgaW5wdXQgc291cmNlIGlzIG1lYW50IHRvIGJlIGhlbGQgaW4gcmlnaHRcbiAgICAgKiBoYW5kLlxuICAgICAqXG4gICAgICogQHR5cGUge3N0cmluZ31cbiAgICAgKi9cbiAgICBnZXQgaGFuZGVkbmVzcygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3hySW5wdXRTb3VyY2UuaGFuZGVkbmVzcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBMaXN0IG9mIGlucHV0IHByb2ZpbGUgbmFtZXMgaW5kaWNhdGluZyBib3RoIHRoZSBwcmVmZXJyZWQgdmlzdWFsIHJlcHJlc2VudGF0aW9uIGFuZCBiZWhhdmlvclxuICAgICAqIG9mIHRoZSBpbnB1dCBzb3VyY2UuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7c3RyaW5nW119XG4gICAgICovXG4gICAgZ2V0IHByb2ZpbGVzKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5feHJJbnB1dFNvdXJjZS5wcm9maWxlcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJZiBpbnB1dCBzb3VyY2UgY2FuIGJlIGhlbGQsIHRoZW4gaXQgd2lsbCBoYXZlIG5vZGUgd2l0aCBpdHMgd29ybGQgdHJhbnNmb3JtYXRpb24sIHRoYXQgY2FuXG4gICAgICogYmUgdXNlZCB0byBwb3NpdGlvbiBhbmQgcm90YXRlIHZpcnR1YWwgam95c3RpY2tzIGJhc2VkIG9uIGl0LlxuICAgICAqXG4gICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICovXG4gICAgZ2V0IGdyaXAoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9ncmlwO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIElmIGlucHV0IHNvdXJjZSBpcyBhIHRyYWNrZWQgaGFuZCwgdGhlbiBpdCB3aWxsIHBvaW50IHRvIHtAbGluayBYckhhbmR9IG90aGVyd2lzZSBpdCBpc1xuICAgICAqIG51bGwuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7WHJIYW5kfG51bGx9XG4gICAgICovXG4gICAgZ2V0IGhhbmQoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9oYW5kO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIElmIGlucHV0IHNvdXJjZSBoYXMgYnV0dG9ucywgdHJpZ2dlcnMsIHRodW1ic3RpY2sgb3IgdG91Y2hwYWQsIHRoZW4gdGhpcyBvYmplY3QgcHJvdmlkZXNcbiAgICAgKiBhY2Nlc3MgdG8gaXRzIHN0YXRlcy5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtHYW1lcGFkfG51bGx9XG4gICAgICovXG4gICAgZ2V0IGdhbWVwYWQoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl94cklucHV0U291cmNlLmdhbWVwYWQgfHwgbnVsbDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUcnVlIGlmIGlucHV0IHNvdXJjZSBpcyBpbiBhY3RpdmUgcHJpbWFyeSBhY3Rpb24gYmV0d2VlbiBzZWxlY3RzdGFydCBhbmQgc2VsZWN0ZW5kIGV2ZW50cy5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAqL1xuICAgIGdldCBzZWxlY3RpbmcoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9zZWxlY3Rpbmc7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVHJ1ZSBpZiBpbnB1dCBzb3VyY2UgaXMgaW4gYWN0aXZlIHNxdWVlemUgYWN0aW9uIGJldHdlZW4gc3F1ZWV6ZXN0YXJ0IGFuZCBzcXVlZXplZW5kIGV2ZW50cy5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAqL1xuICAgIGdldCBzcXVlZXppbmcoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9zcXVlZXppbmc7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0IHRvIHRydWUgdG8gYWxsb3cgaW5wdXQgc291cmNlIHRvIGludGVyYWN0IHdpdGggRWxlbWVudCBjb21wb25lbnRzLiBEZWZhdWx0cyB0byB0cnVlLlxuICAgICAqXG4gICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICovXG4gICAgc2V0IGVsZW1lbnRJbnB1dCh2YWx1ZSkge1xuICAgICAgICBpZiAodGhpcy5fZWxlbWVudElucHV0ID09PSB2YWx1ZSlcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICB0aGlzLl9lbGVtZW50SW5wdXQgPSB2YWx1ZTtcblxuICAgICAgICBpZiAoIXRoaXMuX2VsZW1lbnRJbnB1dClcbiAgICAgICAgICAgIHRoaXMuX2VsZW1lbnRFbnRpdHkgPSBudWxsO1xuICAgIH1cblxuICAgIGdldCBlbGVtZW50SW5wdXQoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9lbGVtZW50SW5wdXQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSWYge0BsaW5rIFhySW5wdXRTb3VyY2UjZWxlbWVudElucHV0fSBpcyB0cnVlLCB0aGlzIHByb3BlcnR5IHdpbGwgaG9sZCBlbnRpdHkgd2l0aCBFbGVtZW50XG4gICAgICogY29tcG9uZW50IGF0IHdoaWNoIHRoaXMgaW5wdXQgc291cmNlIGlzIGhvdmVyaW5nLCBvciBudWxsIGlmIG5vdCBob3ZlcmluZyBvdmVyIGFueSBlbGVtZW50LlxuICAgICAqXG4gICAgICogQHR5cGUge2ltcG9ydCgnLi4vZW50aXR5LmpzJykuRW50aXR5fG51bGx9XG4gICAgICovXG4gICAgZ2V0IGVsZW1lbnRFbnRpdHkoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9lbGVtZW50RW50aXR5O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIExpc3Qgb2YgYWN0aXZlIHtAbGluayBYckhpdFRlc3RTb3VyY2V9IGluc3RhbmNlcyBjcmVhdGVkIGJ5IHRoaXMgaW5wdXQgc291cmNlLlxuICAgICAqXG4gICAgICogQHR5cGUge2ltcG9ydCgnLi94ci1oaXQtdGVzdC1zb3VyY2UuanMnKS5YckhpdFRlc3RTb3VyY2VbXX1cbiAgICAgKi9cbiAgICBnZXQgaGl0VGVzdFNvdXJjZXMoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9oaXRUZXN0U291cmNlcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0geyp9IGZyYW1lIC0gWFJGcmFtZSBmcm9tIHJlcXVlc3RBbmltYXRpb25GcmFtZSBjYWxsYmFjay5cbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgdXBkYXRlKGZyYW1lKSB7XG4gICAgICAgIC8vIGhhbmRcbiAgICAgICAgaWYgKHRoaXMuX2hhbmQpIHtcbiAgICAgICAgICAgIHRoaXMuX2hhbmQudXBkYXRlKGZyYW1lKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIGdyaXBcbiAgICAgICAgICAgIGlmICh0aGlzLl94cklucHV0U291cmNlLmdyaXBTcGFjZSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGdyaXBQb3NlID0gZnJhbWUuZ2V0UG9zZSh0aGlzLl94cklucHV0U291cmNlLmdyaXBTcGFjZSwgdGhpcy5fbWFuYWdlci5fcmVmZXJlbmNlU3BhY2UpO1xuICAgICAgICAgICAgICAgIGlmIChncmlwUG9zZSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoIXRoaXMuX2dyaXApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX2dyaXAgPSB0cnVlO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9sb2NhbFRyYW5zZm9ybSA9IG5ldyBNYXQ0KCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl93b3JsZFRyYW5zZm9ybSA9IG5ldyBNYXQ0KCk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX2xvY2FsUG9zaXRpb24gPSBuZXcgVmVjMygpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbG9jYWxSb3RhdGlvbiA9IG5ldyBRdWF0KCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fZGlydHlMb2NhbCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX2xvY2FsUG9zaXRpb24uY29weShncmlwUG9zZS50cmFuc2Zvcm0ucG9zaXRpb24pO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9sb2NhbFJvdGF0aW9uLmNvcHkoZ3JpcFBvc2UudHJhbnNmb3JtLm9yaWVudGF0aW9uKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIHJheVxuICAgICAgICAgICAgY29uc3QgdGFyZ2V0UmF5UG9zZSA9IGZyYW1lLmdldFBvc2UodGhpcy5feHJJbnB1dFNvdXJjZS50YXJnZXRSYXlTcGFjZSwgdGhpcy5fbWFuYWdlci5fcmVmZXJlbmNlU3BhY2UpO1xuICAgICAgICAgICAgaWYgKHRhcmdldFJheVBvc2UpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9kaXJ0eVJheSA9IHRydWU7XG4gICAgICAgICAgICAgICAgdGhpcy5fcmF5TG9jYWwub3JpZ2luLmNvcHkodGFyZ2V0UmF5UG9zZS50cmFuc2Zvcm0ucG9zaXRpb24pO1xuICAgICAgICAgICAgICAgIHRoaXMuX3JheUxvY2FsLmRpcmVjdGlvbi5zZXQoMCwgMCwgLTEpO1xuICAgICAgICAgICAgICAgIHF1YXQuY29weSh0YXJnZXRSYXlQb3NlLnRyYW5zZm9ybS5vcmllbnRhdGlvbik7XG4gICAgICAgICAgICAgICAgcXVhdC50cmFuc2Zvcm1WZWN0b3IodGhpcy5fcmF5TG9jYWwuZGlyZWN0aW9uLCB0aGlzLl9yYXlMb2NhbC5kaXJlY3Rpb24pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqIEBwcml2YXRlICovXG4gICAgX3VwZGF0ZVRyYW5zZm9ybXMoKSB7XG4gICAgICAgIGlmICh0aGlzLl9kaXJ0eUxvY2FsKSB7XG4gICAgICAgICAgICB0aGlzLl9kaXJ0eUxvY2FsID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLl9sb2NhbFRyYW5zZm9ybS5zZXRUUlModGhpcy5fbG9jYWxQb3NpdGlvbiwgdGhpcy5fbG9jYWxSb3RhdGlvbiwgVmVjMy5PTkUpO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgcGFyZW50ID0gdGhpcy5fbWFuYWdlci5jYW1lcmEucGFyZW50O1xuICAgICAgICBpZiAocGFyZW50KSB7XG4gICAgICAgICAgICB0aGlzLl93b3JsZFRyYW5zZm9ybS5tdWwyKHBhcmVudC5nZXRXb3JsZFRyYW5zZm9ybSgpLCB0aGlzLl9sb2NhbFRyYW5zZm9ybSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLl93b3JsZFRyYW5zZm9ybS5jb3B5KHRoaXMuX2xvY2FsVHJhbnNmb3JtKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKiBAcHJpdmF0ZSAqL1xuICAgIF91cGRhdGVSYXlUcmFuc2Zvcm1zKCkge1xuICAgICAgICBjb25zdCBkaXJ0eSA9IHRoaXMuX2RpcnR5UmF5O1xuICAgICAgICB0aGlzLl9kaXJ0eVJheSA9IGZhbHNlO1xuXG4gICAgICAgIGNvbnN0IHBhcmVudCA9IHRoaXMuX21hbmFnZXIuY2FtZXJhLnBhcmVudDtcbiAgICAgICAgaWYgKHBhcmVudCkge1xuICAgICAgICAgICAgY29uc3QgcGFyZW50VHJhbnNmb3JtID0gdGhpcy5fbWFuYWdlci5jYW1lcmEucGFyZW50LmdldFdvcmxkVHJhbnNmb3JtKCk7XG5cbiAgICAgICAgICAgIHBhcmVudFRyYW5zZm9ybS5nZXRUcmFuc2xhdGlvbih0aGlzLl9wb3NpdGlvbik7XG4gICAgICAgICAgICB0aGlzLl9yb3RhdGlvbi5zZXRGcm9tTWF0NChwYXJlbnRUcmFuc2Zvcm0pO1xuXG4gICAgICAgICAgICB0aGlzLl9yb3RhdGlvbi50cmFuc2Zvcm1WZWN0b3IodGhpcy5fcmF5TG9jYWwub3JpZ2luLCB0aGlzLl9yYXkub3JpZ2luKTtcbiAgICAgICAgICAgIHRoaXMuX3JheS5vcmlnaW4uYWRkKHRoaXMuX3Bvc2l0aW9uKTtcbiAgICAgICAgICAgIHRoaXMuX3JvdGF0aW9uLnRyYW5zZm9ybVZlY3Rvcih0aGlzLl9yYXlMb2NhbC5kaXJlY3Rpb24sIHRoaXMuX3JheS5kaXJlY3Rpb24pO1xuICAgICAgICB9IGVsc2UgaWYgKGRpcnR5KSB7XG4gICAgICAgICAgICB0aGlzLl9yYXkub3JpZ2luLmNvcHkodGhpcy5fcmF5TG9jYWwub3JpZ2luKTtcbiAgICAgICAgICAgIHRoaXMuX3JheS5kaXJlY3Rpb24uY29weSh0aGlzLl9yYXlMb2NhbC5kaXJlY3Rpb24pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogR2V0IHRoZSB3b3JsZCBzcGFjZSBwb3NpdGlvbiBvZiBpbnB1dCBzb3VyY2UgaWYgaXQgaXMgaGFuZGhlbGQgKHtAbGluayBYcklucHV0U291cmNlI2dyaXB9XG4gICAgICogaXMgdHJ1ZSkuIE90aGVyd2lzZSBpdCB3aWxsIHJldHVybiBudWxsLlxuICAgICAqXG4gICAgICogQHJldHVybnMge1ZlYzN8bnVsbH0gVGhlIHdvcmxkIHNwYWNlIHBvc2l0aW9uIG9mIGhhbmRoZWxkIGlucHV0IHNvdXJjZS5cbiAgICAgKi9cbiAgICBnZXRQb3NpdGlvbigpIHtcbiAgICAgICAgaWYgKCF0aGlzLl9wb3NpdGlvbikgcmV0dXJuIG51bGw7XG5cbiAgICAgICAgdGhpcy5fdXBkYXRlVHJhbnNmb3JtcygpO1xuICAgICAgICB0aGlzLl93b3JsZFRyYW5zZm9ybS5nZXRUcmFuc2xhdGlvbih0aGlzLl9wb3NpdGlvbik7XG5cbiAgICAgICAgcmV0dXJuIHRoaXMuX3Bvc2l0aW9uO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEdldCB0aGUgbG9jYWwgc3BhY2UgcG9zaXRpb24gb2YgaW5wdXQgc291cmNlIGlmIGl0IGlzIGhhbmRoZWxkICh7QGxpbmsgWHJJbnB1dFNvdXJjZSNncmlwfVxuICAgICAqIGlzIHRydWUpLiBMb2NhbCBzcGFjZSBpcyByZWxhdGl2ZSB0byBwYXJlbnQgb2YgdGhlIFhSIGNhbWVyYS4gT3RoZXJ3aXNlIGl0IHdpbGwgcmV0dXJuIG51bGwuXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7VmVjM3xudWxsfSBUaGUgd29ybGQgc3BhY2UgcG9zaXRpb24gb2YgaGFuZGhlbGQgaW5wdXQgc291cmNlLlxuICAgICAqL1xuICAgIGdldExvY2FsUG9zaXRpb24oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9sb2NhbFBvc2l0aW9uO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEdldCB0aGUgd29ybGQgc3BhY2Ugcm90YXRpb24gb2YgaW5wdXQgc291cmNlIGlmIGl0IGlzIGhhbmRoZWxkICh7QGxpbmsgWHJJbnB1dFNvdXJjZSNncmlwfVxuICAgICAqIGlzIHRydWUpLiBPdGhlcndpc2UgaXQgd2lsbCByZXR1cm4gbnVsbC5cbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtRdWF0fG51bGx9IFRoZSB3b3JsZCBzcGFjZSByb3RhdGlvbiBvZiBoYW5kaGVsZCBpbnB1dCBzb3VyY2UuXG4gICAgICovXG4gICAgZ2V0Um90YXRpb24oKSB7XG4gICAgICAgIGlmICghdGhpcy5fcm90YXRpb24pIHJldHVybiBudWxsO1xuXG4gICAgICAgIHRoaXMuX3VwZGF0ZVRyYW5zZm9ybXMoKTtcbiAgICAgICAgdGhpcy5fcm90YXRpb24uc2V0RnJvbU1hdDQodGhpcy5fd29ybGRUcmFuc2Zvcm0pO1xuXG4gICAgICAgIHJldHVybiB0aGlzLl9yb3RhdGlvbjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBHZXQgdGhlIGxvY2FsIHNwYWNlIHJvdGF0aW9uIG9mIGlucHV0IHNvdXJjZSBpZiBpdCBpcyBoYW5kaGVsZCAoe0BsaW5rIFhySW5wdXRTb3VyY2UjZ3JpcH1cbiAgICAgKiBpcyB0cnVlKS4gTG9jYWwgc3BhY2UgaXMgcmVsYXRpdmUgdG8gcGFyZW50IG9mIHRoZSBYUiBjYW1lcmEuIE90aGVyd2lzZSBpdCB3aWxsIHJldHVybiBudWxsLlxuICAgICAqXG4gICAgICogQHJldHVybnMge1ZlYzN8bnVsbH0gVGhlIHdvcmxkIHNwYWNlIHJvdGF0aW9uIG9mIGhhbmRoZWxkIGlucHV0IHNvdXJjZS5cbiAgICAgKi9cbiAgICBnZXRMb2NhbFJvdGF0aW9uKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fbG9jYWxSb3RhdGlvbjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBHZXQgdGhlIHdvcmxkIHNwYWNlIG9yaWdpbiBvZiBpbnB1dCBzb3VyY2UgcmF5LlxuICAgICAqXG4gICAgICogQHJldHVybnMge1ZlYzN9IFRoZSB3b3JsZCBzcGFjZSBvcmlnaW4gb2YgaW5wdXQgc291cmNlIHJheS5cbiAgICAgKi9cbiAgICBnZXRPcmlnaW4oKSB7XG4gICAgICAgIHRoaXMuX3VwZGF0ZVJheVRyYW5zZm9ybXMoKTtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3JheS5vcmlnaW47XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogR2V0IHRoZSB3b3JsZCBzcGFjZSBkaXJlY3Rpb24gb2YgaW5wdXQgc291cmNlIHJheS5cbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtWZWMzfSBUaGUgd29ybGQgc3BhY2UgZGlyZWN0aW9uIG9mIGlucHV0IHNvdXJjZSByYXkuXG4gICAgICovXG4gICAgZ2V0RGlyZWN0aW9uKCkge1xuICAgICAgICB0aGlzLl91cGRhdGVSYXlUcmFuc2Zvcm1zKCk7XG4gICAgICAgIHJldHVybiB0aGlzLl9yYXkuZGlyZWN0aW9uO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEF0dGVtcHRzIHRvIHN0YXJ0IGhpdCB0ZXN0IHNvdXJjZSBiYXNlZCBvbiB0aGlzIGlucHV0IHNvdXJjZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7b2JqZWN0fSBbb3B0aW9uc10gLSBPYmplY3QgZm9yIHBhc3Npbmcgb3B0aW9uYWwgYXJndW1lbnRzLlxuICAgICAqIEBwYXJhbSB7c3RyaW5nW119IFtvcHRpb25zLmVudGl0eVR5cGVzXSAtIE9wdGlvbmFsIGxpc3Qgb2YgdW5kZXJseWluZyBlbnRpdHkgdHlwZXMgYWdhaW5zdFxuICAgICAqIHdoaWNoIGhpdCB0ZXN0cyB3aWxsIGJlIHBlcmZvcm1lZC4gRGVmYXVsdHMgdG8gWyB7QGxpbmsgWFJUUkFDS0FCTEVfUExBTkV9IF0uIENhbiBiZSBhbnlcbiAgICAgKiBjb21iaW5hdGlvbiBvZiB0aGUgZm9sbG93aW5nOlxuICAgICAqXG4gICAgICogLSB7QGxpbmsgWFJUUkFDS0FCTEVfUE9JTlR9OiBQb2ludCAtIGluZGljYXRlcyB0aGF0IHRoZSBoaXQgdGVzdCByZXN1bHRzIHdpbGwgYmUgY29tcHV0ZWRcbiAgICAgKiBiYXNlZCBvbiB0aGUgZmVhdHVyZSBwb2ludHMgZGV0ZWN0ZWQgYnkgdGhlIHVuZGVybHlpbmcgQXVnbWVudGVkIFJlYWxpdHkgc3lzdGVtLlxuICAgICAqIC0ge0BsaW5rIFhSVFJBQ0tBQkxFX1BMQU5FfTogUGxhbmUgLSBpbmRpY2F0ZXMgdGhhdCB0aGUgaGl0IHRlc3QgcmVzdWx0cyB3aWxsIGJlIGNvbXB1dGVkXG4gICAgICogYmFzZWQgb24gdGhlIHBsYW5lcyBkZXRlY3RlZCBieSB0aGUgdW5kZXJseWluZyBBdWdtZW50ZWQgUmVhbGl0eSBzeXN0ZW0uXG4gICAgICogLSB7QGxpbmsgWFJUUkFDS0FCTEVfTUVTSH06IE1lc2ggLSBpbmRpY2F0ZXMgdGhhdCB0aGUgaGl0IHRlc3QgcmVzdWx0cyB3aWxsIGJlIGNvbXB1dGVkXG4gICAgICogYmFzZWQgb24gdGhlIG1lc2hlcyBkZXRlY3RlZCBieSB0aGUgdW5kZXJseWluZyBBdWdtZW50ZWQgUmVhbGl0eSBzeXN0ZW0uXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1JheX0gW29wdGlvbnMub2Zmc2V0UmF5XSAtIE9wdGlvbmFsIHJheSBieSB3aGljaCBoaXQgdGVzdCByYXkgY2FuIGJlIG9mZnNldC5cbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi94ci1oaXQtdGVzdC5qcycpLlhySGl0VGVzdFN0YXJ0Q2FsbGJhY2t9IFtvcHRpb25zLmNhbGxiYWNrXSAtIE9wdGlvbmFsXG4gICAgICogY2FsbGJhY2sgZnVuY3Rpb24gY2FsbGVkIG9uY2UgaGl0IHRlc3Qgc291cmNlIGlzIGNyZWF0ZWQgb3IgZmFpbGVkLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogYXBwLnhyLmlucHV0Lm9uKCdhZGQnLCBmdW5jdGlvbiAoaW5wdXRTb3VyY2UpIHtcbiAgICAgKiAgICAgaW5wdXRTb3VyY2UuaGl0VGVzdFN0YXJ0KHtcbiAgICAgKiAgICAgICAgIGNhbGxiYWNrOiBmdW5jdGlvbiAoZXJyLCBoaXRUZXN0U291cmNlKSB7XG4gICAgICogICAgICAgICAgICAgaWYgKGVycikgcmV0dXJuO1xuICAgICAqICAgICAgICAgICAgIGhpdFRlc3RTb3VyY2Uub24oJ3Jlc3VsdCcsIGZ1bmN0aW9uIChwb3NpdGlvbiwgcm90YXRpb24pIHtcbiAgICAgKiAgICAgICAgICAgICAgICAgLy8gcG9zaXRpb24gYW5kIHJvdGF0aW9uIG9mIGhpdCB0ZXN0IHJlc3VsdFxuICAgICAqICAgICAgICAgICAgICAgICAvLyB0aGF0IHdpbGwgYmUgY3JlYXRlZCBmcm9tIHRvdWNoIG9uIG1vYmlsZSBkZXZpY2VzXG4gICAgICogICAgICAgICAgICAgfSk7XG4gICAgICogICAgICAgICB9XG4gICAgICogICAgIH0pO1xuICAgICAqIH0pO1xuICAgICAqL1xuICAgIGhpdFRlc3RTdGFydChvcHRpb25zID0ge30pIHtcbiAgICAgICAgb3B0aW9ucy5wcm9maWxlID0gdGhpcy5feHJJbnB1dFNvdXJjZS5wcm9maWxlc1swXTtcblxuICAgICAgICBjb25zdCBjYWxsYmFjayA9IG9wdGlvbnMuY2FsbGJhY2s7XG4gICAgICAgIG9wdGlvbnMuY2FsbGJhY2sgPSAoZXJyLCBoaXRUZXN0U291cmNlKSA9PiB7XG4gICAgICAgICAgICBpZiAoaGl0VGVzdFNvdXJjZSkgdGhpcy5vbkhpdFRlc3RTb3VyY2VBZGQoaGl0VGVzdFNvdXJjZSk7XG4gICAgICAgICAgICBpZiAoY2FsbGJhY2spIGNhbGxiYWNrKGVyciwgaGl0VGVzdFNvdXJjZSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgdGhpcy5fbWFuYWdlci5oaXRUZXN0LnN0YXJ0KG9wdGlvbnMpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuL3hyLWhpdC10ZXN0LXNvdXJjZS5qcycpLlhySGl0VGVzdFNvdXJjZX0gaGl0VGVzdFNvdXJjZSAtIEhpdCB0ZXN0IHNvdXJjZVxuICAgICAqIHRvIGJlIGFkZGVkLlxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgb25IaXRUZXN0U291cmNlQWRkKGhpdFRlc3RTb3VyY2UpIHtcbiAgICAgICAgdGhpcy5faGl0VGVzdFNvdXJjZXMucHVzaChoaXRUZXN0U291cmNlKTtcblxuICAgICAgICB0aGlzLmZpcmUoJ2hpdHRlc3Q6YWRkJywgaGl0VGVzdFNvdXJjZSk7XG5cbiAgICAgICAgaGl0VGVzdFNvdXJjZS5vbigncmVzdWx0JywgZnVuY3Rpb24gKHBvc2l0aW9uLCByb3RhdGlvbiwgaW5wdXRTb3VyY2UpIHtcbiAgICAgICAgICAgIGlmIChpbnB1dFNvdXJjZSAhPT0gdGhpcylcbiAgICAgICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgICAgIHRoaXMuZmlyZSgnaGl0dGVzdDpyZXN1bHQnLCBoaXRUZXN0U291cmNlLCBwb3NpdGlvbiwgcm90YXRpb24pO1xuICAgICAgICB9LCB0aGlzKTtcbiAgICAgICAgaGl0VGVzdFNvdXJjZS5vbmNlKCdyZW1vdmUnLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB0aGlzLm9uSGl0VGVzdFNvdXJjZVJlbW92ZShoaXRUZXN0U291cmNlKTtcbiAgICAgICAgICAgIHRoaXMuZmlyZSgnaGl0dGVzdDpyZW1vdmUnLCBoaXRUZXN0U291cmNlKTtcbiAgICAgICAgfSwgdGhpcyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4veHItaGl0LXRlc3Qtc291cmNlLmpzJykuWHJIaXRUZXN0U291cmNlfSBoaXRUZXN0U291cmNlIC0gSGl0IHRlc3Qgc291cmNlXG4gICAgICogdG8gYmUgcmVtb3ZlZC5cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIG9uSGl0VGVzdFNvdXJjZVJlbW92ZShoaXRUZXN0U291cmNlKSB7XG4gICAgICAgIGNvbnN0IGluZCA9IHRoaXMuX2hpdFRlc3RTb3VyY2VzLmluZGV4T2YoaGl0VGVzdFNvdXJjZSk7XG4gICAgICAgIGlmIChpbmQgIT09IC0xKSB0aGlzLl9oaXRUZXN0U291cmNlcy5zcGxpY2UoaW5kLCAxKTtcbiAgICB9XG59XG5cbmV4cG9ydCB7IFhySW5wdXRTb3VyY2UgfTtcbiJdLCJuYW1lcyI6WyJxdWF0IiwiUXVhdCIsImlkcyIsIlhySW5wdXRTb3VyY2UiLCJFdmVudEhhbmRsZXIiLCJjb25zdHJ1Y3RvciIsIm1hbmFnZXIiLCJ4cklucHV0U291cmNlIiwiX2lkIiwiX21hbmFnZXIiLCJfeHJJbnB1dFNvdXJjZSIsIl9yYXkiLCJSYXkiLCJfcmF5TG9jYWwiLCJfZ3JpcCIsIl9oYW5kIiwiX2xvY2FsVHJhbnNmb3JtIiwiX3dvcmxkVHJhbnNmb3JtIiwiX3Bvc2l0aW9uIiwiVmVjMyIsIl9yb3RhdGlvbiIsIl9sb2NhbFBvc2l0aW9uIiwiX2xvY2FsUm90YXRpb24iLCJfZGlydHlMb2NhbCIsIl9kaXJ0eVJheSIsIl9zZWxlY3RpbmciLCJfc3F1ZWV6aW5nIiwiX2VsZW1lbnRJbnB1dCIsIl9lbGVtZW50RW50aXR5IiwiX2hpdFRlc3RTb3VyY2VzIiwiaGFuZCIsIlhySGFuZCIsImlkIiwiaW5wdXRTb3VyY2UiLCJ0YXJnZXRSYXlNb2RlIiwiaGFuZGVkbmVzcyIsInByb2ZpbGVzIiwiZ3JpcCIsImdhbWVwYWQiLCJzZWxlY3RpbmciLCJzcXVlZXppbmciLCJlbGVtZW50SW5wdXQiLCJ2YWx1ZSIsImVsZW1lbnRFbnRpdHkiLCJoaXRUZXN0U291cmNlcyIsInVwZGF0ZSIsImZyYW1lIiwiZ3JpcFNwYWNlIiwiZ3JpcFBvc2UiLCJnZXRQb3NlIiwiX3JlZmVyZW5jZVNwYWNlIiwiTWF0NCIsImNvcHkiLCJ0cmFuc2Zvcm0iLCJwb3NpdGlvbiIsIm9yaWVudGF0aW9uIiwidGFyZ2V0UmF5UG9zZSIsInRhcmdldFJheVNwYWNlIiwib3JpZ2luIiwiZGlyZWN0aW9uIiwic2V0IiwidHJhbnNmb3JtVmVjdG9yIiwiX3VwZGF0ZVRyYW5zZm9ybXMiLCJzZXRUUlMiLCJPTkUiLCJwYXJlbnQiLCJjYW1lcmEiLCJtdWwyIiwiZ2V0V29ybGRUcmFuc2Zvcm0iLCJfdXBkYXRlUmF5VHJhbnNmb3JtcyIsImRpcnR5IiwicGFyZW50VHJhbnNmb3JtIiwiZ2V0VHJhbnNsYXRpb24iLCJzZXRGcm9tTWF0NCIsImFkZCIsImdldFBvc2l0aW9uIiwiZ2V0TG9jYWxQb3NpdGlvbiIsImdldFJvdGF0aW9uIiwiZ2V0TG9jYWxSb3RhdGlvbiIsImdldE9yaWdpbiIsImdldERpcmVjdGlvbiIsImhpdFRlc3RTdGFydCIsIm9wdGlvbnMiLCJwcm9maWxlIiwiY2FsbGJhY2siLCJlcnIiLCJoaXRUZXN0U291cmNlIiwib25IaXRUZXN0U291cmNlQWRkIiwiaGl0VGVzdCIsInN0YXJ0IiwicHVzaCIsImZpcmUiLCJvbiIsInJvdGF0aW9uIiwib25jZSIsIm9uSGl0VGVzdFNvdXJjZVJlbW92ZSIsImluZCIsImluZGV4T2YiLCJzcGxpY2UiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFRQSxNQUFNQSxJQUFJLEdBQUcsSUFBSUMsSUFBSSxFQUFFLENBQUE7QUFDdkIsSUFBSUMsR0FBRyxHQUFHLENBQUMsQ0FBQTs7QUFFWDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxNQUFNQyxhQUFhLFNBQVNDLFlBQVksQ0FBQztBQXlIckM7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNJQyxFQUFBQSxXQUFXQSxDQUFDQyxPQUFPLEVBQUVDLGFBQWEsRUFBRTtBQUNoQyxJQUFBLEtBQUssRUFBRSxDQUFBO0FBaklYO0FBQ0o7QUFDQTtBQUNBO0FBSEksSUFBQSxJQUFBLENBSUFDLEdBQUcsR0FBQSxLQUFBLENBQUEsQ0FBQTtBQUVIO0FBQ0o7QUFDQTtBQUNBO0FBSEksSUFBQSxJQUFBLENBSUFDLFFBQVEsR0FBQSxLQUFBLENBQUEsQ0FBQTtBQUVSO0FBQ0o7QUFDQTtBQUNBO0FBSEksSUFBQSxJQUFBLENBSUFDLGNBQWMsR0FBQSxLQUFBLENBQUEsQ0FBQTtBQUVkO0FBQ0o7QUFDQTtBQUNBO0FBSEksSUFBQSxJQUFBLENBSUFDLElBQUksR0FBRyxJQUFJQyxHQUFHLEVBQUUsQ0FBQTtBQUVoQjtBQUNKO0FBQ0E7QUFDQTtBQUhJLElBQUEsSUFBQSxDQUlBQyxTQUFTLEdBQUcsSUFBSUQsR0FBRyxFQUFFLENBQUE7QUFFckI7QUFDSjtBQUNBO0FBQ0E7SUFISSxJQUlBRSxDQUFBQSxLQUFLLEdBQUcsS0FBSyxDQUFBO0FBRWI7QUFDSjtBQUNBO0FBQ0E7SUFISSxJQUlBQyxDQUFBQSxLQUFLLEdBQUcsSUFBSSxDQUFBO0FBRVo7QUFDSjtBQUNBO0FBQ0E7SUFISSxJ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
