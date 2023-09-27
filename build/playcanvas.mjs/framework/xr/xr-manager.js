import { Debug } from '../../core/debug.js';
import { EventHandler } from '../../core/event-handler.js';
import { platform } from '../../core/platform.js';
import { Mat3 } from '../../core/math/mat3.js';
import { Mat4 } from '../../core/math/mat4.js';
import { Quat } from '../../core/math/quat.js';
import { Vec3 } from '../../core/math/vec3.js';
import { Vec4 } from '../../core/math/vec4.js';
import { XRTYPE_INLINE, XRTYPE_VR, XRTYPE_AR, XRDEPTHSENSINGUSAGE_CPU, XRDEPTHSENSINGFORMAT_L8A8 } from './constants.js';
import { XrDepthSensing } from './xr-depth-sensing.js';
import { XrDomOverlay } from './xr-dom-overlay.js';
import { XrHitTest } from './xr-hit-test.js';
import { XrImageTracking } from './xr-image-tracking.js';
import { XrInput } from './xr-input.js';
import { XrLightEstimation } from './xr-light-estimation.js';
import { XrPlaneDetection } from './xr-plane-detection.js';
import { XrAnchors } from './xr-anchors.js';

/**
 * Callback used by {@link XrManager#endXr} and {@link XrManager#startXr}.
 *
 * @callback XrErrorCallback
 * @param {Error|null} err - The Error object or null if operation was successful.
 */

/**
 * Manage and update XR session and its states.
 *
 * @augments EventHandler
 * @category XR
 */
class XrManager extends EventHandler {
  /**
   * Create a new XrManager instance.
   *
   * @param {import('../app-base.js').AppBase} app - The main application.
   * @hideconstructor
   */
  constructor(app) {
    super();
    /**
     * @type {import('../app-base.js').AppBase}
     * @ignore
     */
    this.app = void 0;
    /**
     * @type {boolean}
     * @private
     */
    this._supported = platform.browser && !!navigator.xr;
    /**
     * @type {Object<string, boolean>}
     * @private
     */
    this._available = {};
    /**
     * @type {string|null}
     * @private
     */
    this._type = null;
    /**
     * @type {string|null}
     * @private
     */
    this._spaceType = null;
    /**
     * @type {XRSession|null}
     * @private
     */
    this._session = null;
    /**
     * @type {XRWebGLLayer|null}
     * @private
     */
    this._baseLayer = null;
    /**
     * @type {XRReferenceSpace|null}
     * @ignore
     */
    this._referenceSpace = null;
    /**
     * Provides access to depth sensing capabilities.
     *
     * @type {XrDepthSensing}
     * @ignore
     */
    this.depthSensing = void 0;
    /**
     * Provides access to DOM overlay capabilities.
     *
     * @type {XrDomOverlay}
     * @ignore
     */
    this.domOverlay = void 0;
    /**
     * Provides the ability to perform hit tests on the representation of real world geometry
     * of the underlying AR system.
     *
     * @type {XrHitTest}
     */
    this.hitTest = void 0;
    /**
     * Provides access to image tracking capabilities.
     *
     * @type {XrImageTracking}
     * @ignore
     */
    this.imageTracking = void 0;
    /**
     * Provides access to plane detection capabilities.
     *
     * @type {XrPlaneDetection}
     * @ignore
     */
    this.planeDetection = void 0;
    /**
     * Provides access to Input Sources.
     *
     * @type {XrInput}
     */
    this.input = void 0;
    /**
     * Provides access to light estimation capabilities.
     *
     * @type {XrLightEstimation}
     * @ignore
     */
    this.lightEstimation = void 0;
    /**
     * @type {import('../components/camera/component.js').CameraComponent}
     * @private
     */
    this._camera = null;
    /**
     * @type {Array<*>}
     * @ignore
     */
    this.views = [];
    /**
     * @type {Array<*>}
     * @ignore
     */
    this.viewsPool = [];
    /**
     * @type {Vec3}
     * @private
     */
    this._localPosition = new Vec3();
    /**
     * @type {Quat}
     * @private
     */
    this._localRotation = new Quat();
    /**
     * @type {number}
     * @private
     */
    this._depthNear = 0.1;
    /**
     * @type {number}
     * @private
     */
    this._depthFar = 1000;
    /**
     * @type {number}
     * @private
     */
    this._width = 0;
    /**
     * @type {number}
     * @private
     */
    this._height = 0;
    this.app = app;

    // Add all the supported session types
    this._available[XRTYPE_INLINE] = false;
    this._available[XRTYPE_VR] = false;
    this._available[XRTYPE_AR] = false;
    this.depthSensing = new XrDepthSensing(this);
    this.domOverlay = new XrDomOverlay(this);
    this.hitTest = new XrHitTest(this);
    this.imageTracking = new XrImageTracking(this);
    this.planeDetection = new XrPlaneDetection(this);
    this.input = new XrInput(this);
    this.lightEstimation = new XrLightEstimation(this);
    this.anchors = new XrAnchors(this);

    // TODO
    // 1. HMD class with its params
    // 2. Space class
    // 3. Controllers class

    if (this._supported) {
      navigator.xr.addEventListener('devicechange', () => {
        this._deviceAvailabilityCheck();
      });
      this._deviceAvailabilityCheck();
    }
  }

  /**
   * Fired when availability of specific XR type is changed.
   *
   * @event XrManager#available
   * @param {string} type - The session type that has changed availability.
   * @param {boolean} available - True if specified session type is now available.
   * @example
   * app.xr.on('available', function (type, available) {
   *     console.log('"' + type + '" XR session is now ' + (available ? 'available' : 'unavailable'));
   * });
   */

  /**
   * Fired when availability of specific XR type is changed.
   *
   * @event XrManager#available:[type]
   * @param {boolean} available - True if specified session type is now available.
   * @example
   * app.xr.on('available:' + pc.XRTYPE_VR, function (available) {
   *     console.log('Immersive VR session is now ' + (available ? 'available' : 'unavailable'));
   * });
   */

  /**
   * Fired when XR session is started.
   *
   * @event XrManager#start
   * @example
   * app.xr.on('start', function () {
   *     // XR session has started
   * });
   */

  /**
   * Fired when XR session is ended.
   *
   * @event XrManager#end
   * @example
   * app.xr.on('end', function () {
   *     // XR session has ended
   * });
   */

  /**
   * Fired when XR session is updated, providing relevant XRFrame object.
   *
   * @event XrManager#update
   * @param {object} frame - [XRFrame](https://developer.mozilla.org/en-US/docs/Web/API/XRFrame)
   * object that can be used for interfacing directly with WebXR APIs.
   * @example
   * app.xr.on('update', function (frame) {
   *
   * });
   */

  /**
   * Fired when XR session is failed to start or failed to check for session type support.
   *
   * @event XrManager#error
   * @param {Error} error - Error object related to failure of session start or check of session
   * type support.
   * @example
   * app.xr.on('error', function (ex) {
   *     // XR session has failed to start, or failed to check for session type support
   * });
   */

  /**
   * Destroys the XrManager instance.
   *
   * @ignore
   */
  destroy() {
    this.depthSensing.destroy();
    this.depthSensing = null;
  }

  /**
   * Attempts to start XR session for provided {@link CameraComponent} and optionally fires
   * callback when session is created or failed to create. Integrated XR APIs need to be enabled
   * by providing relevant options.
   *
   * @param {import('../components/camera/component.js').CameraComponent} camera - It will be
   * used to render XR session and manipulated based on pose tracking.
   * @param {string} type - Session type. Can be one of the following:
   *
   * - {@link XRTYPE_INLINE}: Inline - always available type of session. It has limited features
   * availability and is rendered into HTML element.
   * - {@link XRTYPE_VR}: Immersive VR - session that provides exclusive access to VR device with
   * best available tracking features.
   * - {@link XRTYPE_AR}: Immersive AR - session that provides exclusive access to VR/AR device
   * that is intended to be blended with real-world environment.
   *
   * @param {string} spaceType - Reference space type. Can be one of the following:
   *
   * - {@link XRSPACE_VIEWER}: Viewer - always supported space with some basic tracking
   * capabilities.
   * - {@link XRSPACE_LOCAL}: Local - represents a tracking space with a native origin near the
   * viewer at the time of creation. It is meant for seated or basic local XR sessions.
   * - {@link XRSPACE_LOCALFLOOR}: Local Floor - represents a tracking space with a native origin
   * at the floor in a safe position for the user to stand. The y axis equals 0 at floor level.
   * Floor level value might be estimated by the underlying platform. It is meant for seated or
   * basic local XR sessions.
   * - {@link XRSPACE_BOUNDEDFLOOR}: Bounded Floor - represents a tracking space with its native
   * origin at the floor, where the user is expected to move within a pre-established boundary.
   * - {@link XRSPACE_UNBOUNDED}: Unbounded - represents a tracking space where the user is
   * expected to move freely around their environment, potentially long distances from their
   * starting point.
   *
   * @param {object} [options] - Object with additional options for XR session initialization.
   * @param {string[]} [options.optionalFeatures] - Optional features for XRSession start. It is
   * used for getting access to additional WebXR spec extensions.
   * @param {boolean} [options.anchors] - Set to true to attempt to enable
   * {@link XrAnchors}.
   * @param {boolean} [options.imageTracking] - Set to true to attempt to enable
   * {@link XrImageTracking}.
   * @param {boolean} [options.planeDetection] - Set to true to attempt to enable
   * {@link XrPlaneDetection}.
   * @param {XrErrorCallback} [options.callback] - Optional callback function called once session
   * is started. The callback has one argument Error - it is null if successfully started XR
   * session.
   * @param {object} [options.depthSensing] - Optional object with depth sensing parameters to
   * attempt to enable {@link XrDepthSensing}.
   * @param {string} [options.depthSensing.usagePreference] - Optional usage preference for depth
   * sensing, can be 'cpu-optimized' or 'gpu-optimized' (XRDEPTHSENSINGUSAGE_*), defaults to
   * 'cpu-optimized'. Most preferred and supported will be chosen by the underlying depth sensing
   * system.
   * @param {string} [options.depthSensing.dataFormatPreference] - Optional data format
   * preference for depth sensing, can be 'luminance-alpha' or 'float32'
   * (XRDEPTHSENSINGFORMAT_*), defaults to 'luminance-alpha'. Most preferred and supported will
   * be chosen by the underlying depth sensing system.
   * @example
   * button.on('click', function () {
   *     app.xr.start(camera, pc.XRTYPE_VR, pc.XRSPACE_LOCALFLOOR);
   * });
   * @example
   * button.on('click', function () {
   *     app.xr.start(camera, pc.XRTYPE_AR, pc.XRSPACE_LOCALFLOOR, {
   *         anchors: true,
   *         imageTracking: true,
   *         depthSensing: { }
   *     });
   * });
   */
  start(camera, type, spaceType, options) {
    let callback = options;
    if (typeof options === 'object') callback = options.callback;
    if (!this._available[type]) {
      if (callback) callback(new Error('XR is not available'));
      return;
    }
    if (this._session) {
      if (callback) callback(new Error('XR session is already started'));
      return;
    }
    this._camera = camera;
    this._camera.camera.xr = this;
    this._type = type;
    this._spaceType = spaceType;
    this._setClipPlanes(camera.nearClip, camera.farClip);

    // TODO
    // makeXRCompatible
    // scenario to test:
    // 1. app is running on integrated GPU
    // 2. XR device is connected, to another GPU
    // 3. probably immersive-vr will fail to be created
    // 4. call makeXRCompatible, very likely will lead to context loss

    const opts = {
      requiredFeatures: [spaceType],
      optionalFeatures: []
    };
    if (type === XRTYPE_AR) {
      opts.optionalFeatures.push('light-estimation');
      opts.optionalFeatures.push('hit-test');
      if (options) {
        if (options.imageTracking && this.imageTracking.supported) opts.optionalFeatures.push('image-tracking');
        if (options.planeDetection) opts.optionalFeatures.push('plane-detection');
      }
      if (this.domOverlay.supported && this.domOverlay.root) {
        opts.optionalFeatures.push('dom-overlay');
        opts.domOverlay = {
          root: this.domOverlay.root
        };
      }
      if (options && options.anchors && this.anchors.supported) {
        opts.optionalFeatures.push('anchors');
      }
      if (options && options.depthSensing && this.depthSensing.supported) {
        opts.optionalFeatures.push('depth-sensing');
        const usagePreference = [XRDEPTHSENSINGUSAGE_CPU];
        const dataFormatPreference = [XRDEPTHSENSINGFORMAT_L8A8];
        if (options.depthSensing.usagePreference) {
          const ind = usagePreference.indexOf(options.depthSensing.usagePreference);
          if (ind !== -1) usagePreference.splice(ind, 1);
          usagePreference.unshift(options.depthSensing.usagePreference);
        }
        if (options.depthSensing.dataFormatPreference) {
          const ind = dataFormatPreference.indexOf(options.depthSensing.dataFormatPreference);
          if (ind !== -1) dataFormatPreference.splice(ind, 1);
          dataFormatPreference.unshift(options.depthSensing.dataFormatPreference);
        }
        opts.depthSensing = {
          usagePreference: usagePreference,
          dataFormatPreference: dataFormatPreference
        };
      }
    } else if (type === XRTYPE_VR) {
      opts.optionalFeatures.push('hand-tracking');
    }
    if (options && options.optionalFeatures) opts.optionalFeatures = opts.optionalFeatures.concat(options.optionalFeatures);
    if (this.imageTracking.supported && this.imageTracking.images.length) {
      this.imageTracking.prepareImages((err, trackedImages) => {
        if (err) {
          if (callback) callback(err);
          this.fire('error', err);
          return;
        }
        if (trackedImages !== null) opts.trackedImages = trackedImages;
        this._onStartOptionsReady(type, spaceType, opts, callback);
      });
    } else {
      this._onStartOptionsReady(type, spaceType, opts, callback);
    }
  }

  /**
   * @param {string} type - Session type.
   * @param {string} spaceType - Reference space type.
   * @param {*} options - Session options.
   * @param {XrErrorCallback} callback - Error callback.
   * @private
   */
  _onStartOptionsReady(type, spaceType, options, callback) {
    navigator.xr.requestSession(type, options).then(session => {
      this._onSessionStart(session, spaceType, callback);
    }).catch(ex => {
      this._camera.camera.xr = null;
      this._camera = null;
      this._type = null;
      this._spaceType = null;
      if (callback) callback(ex);
      this.fire('error', ex);
    });
  }

  /**
   * Attempts to end XR session and optionally fires callback when session is ended or failed to
   * end.
   *
   * @param {XrErrorCallback} [callback] - Optional callback function called once session is
   * started. The callback has one argument Error - it is null if successfully started XR
   * session.
   * @example
   * app.keyboard.on('keydown', function (evt) {
   *     if (evt.key === pc.KEY_ESCAPE && app.xr.active) {
   *         app.xr.end();
   *     }
   * });
   */
  end(callback) {
    if (!this._session) {
      if (callback) callback(new Error('XR Session is not initialized'));
      return;
    }
    if (callback) this.once('end', callback);
    this._session.end();
  }

  /**
   * Check if specific type of session is available.
   *
   * @param {string} type - Session type. Can be one of the following:
   *
   * - {@link XRTYPE_INLINE}: Inline - always available type of session. It has limited features
   * availability and is rendered into HTML element.
   * - {@link XRTYPE_VR}: Immersive VR - session that provides exclusive access to VR device with
   * best available tracking features.
   * - {@link XRTYPE_AR}: Immersive AR - session that provides exclusive access to VR/AR device
   * that is intended to be blended with real-world environment.
   *
   * @example
   * if (app.xr.isAvailable(pc.XRTYPE_VR)) {
   *     // VR is available
   * }
   * @returns {boolean} True if specified session type is available.
   */
  isAvailable(type) {
    return this._available[type];
  }

  /** @private */
  _deviceAvailabilityCheck() {
    for (const key in this._available) {
      this._sessionSupportCheck(key);
    }
  }

  /**
   * @param {string} type - Session type.
   * @private
   */
  _sessionSupportCheck(type) {
    navigator.xr.isSessionSupported(type).then(available => {
      if (this._available[type] === available) return;
      this._available[type] = available;
      this.fire('available', type, available);
      this.fire('available:' + type, available);
    }).catch(ex => {
      this.fire('error', ex);
    });
  }

  /**
   * @param {XRSession} session - XR session.
   * @param {string} spaceType - Space type to request for the session.
   * @param {Function} callback - Callback to call when session is started.
   * @private
   */
  _onSessionStart(session, spaceType, callback) {
    let failed = false;
    this._session = session;
    const onVisibilityChange = () => {
      this.fire('visibility:change', session.visibilityState);
    };
    const onClipPlanesChange = () => {
      this._setClipPlanes(this._camera.nearClip, this._camera.farClip);
    };

    // clean up once session is ended
    const onEnd = () => {
      if (this._camera) {
        this._camera.off('set_nearClip', onClipPlanesChange);
        this._camera.off('set_farClip', onClipPlanesChange);
        this._camera.camera.xr = null;
        this._camera = null;
      }
      session.removeEventListener('end', onEnd);
      session.removeEventListener('visibilitychange', onVisibilityChange);
      if (!failed) this.fire('end');
      this._session = null;
      this._referenceSpace = null;
      this.views = [];
      this._width = 0;
      this._height = 0;
      this._type = null;
      this._spaceType = null;

      // old requestAnimationFrame will never be triggered,
      // so queue up new tick
      this.app.tick();
    };
    session.addEventListener('end', onEnd);
    session.addEventListener('visibilitychange', onVisibilityChange);
    this._camera.on('set_nearClip', onClipPlanesChange);
    this._camera.on('set_farClip', onClipPlanesChange);

    // A framebufferScaleFactor scale of 1 is the full resolution of the display
    // so we need to calculate this based on devicePixelRatio of the dislay and what
    // we've set this in the graphics device
    Debug.assert(window, 'window is needed to scale the XR framebuffer. Are you running XR headless?');
    const framebufferScaleFactor = this.app.graphicsDevice.maxPixelRatio / window.devicePixelRatio;
    this._baseLayer = new XRWebGLLayer(session, this.app.graphicsDevice.gl, {
      alpha: true,
      depth: true,
      stencil: true,
      framebufferScaleFactor: framebufferScaleFactor,
      // request a single-sampled buffer. We allocate multi-sampled buffer internally and resolve to this buffer.
      antialias: false
    });
    session.updateRenderState({
      baseLayer: this._baseLayer,
      depthNear: this._depthNear,
      depthFar: this._depthFar
    });

    // request reference space
    session.requestReferenceSpace(spaceType).then(referenceSpace => {
      this._referenceSpace = referenceSpace;

      // old requestAnimationFrame will never be triggered,
      // so queue up new tick
      this.app.tick();
      if (callback) callback(null);
      this.fire('start');
    }).catch(ex => {
      failed = true;
      session.end();
      if (callback) callback(ex);
      this.fire('error', ex);
    });
  }

  /**
   * @param {number} near - Near plane distance.
   * @param {number} far - Far plane distance.
   * @private
   */
  _setClipPlanes(near, far) {
    if (this._depthNear === near && this._depthFar === far) return;
    this._depthNear = near;
    this._depthFar = far;
    if (!this._session) return;

    // if session is available,
    // queue up render state update
    this._session.updateRenderState({
      depthNear: this._depthNear,
      depthFar: this._depthFar
    });
  }

  /**
   * @param {*} frame - XRFrame from requestAnimationFrame callback.
   *
   * @returns {boolean} True if update was successful, false otherwise.
   * @ignore
   */
  update(frame) {
    if (!this._session) return false;

    // canvas resolution should be set on first frame availability or resolution changes
    const width = frame.session.renderState.baseLayer.framebufferWidth;
    const height = frame.session.renderState.baseLayer.framebufferHeight;
    if (this._width !== width || this._height !== height) {
      this._width = width;
      this._height = height;
      this.app.graphicsDevice.setResolution(width, height);
    }
    const pose = frame.getViewerPose(this._referenceSpace);
    if (!pose) return false;
    const lengthOld = this.views.length;
    const lengthNew = pose.views.length;
    while (lengthNew > this.views.length) {
      let view = this.viewsPool.pop();
      if (!view) {
        view = {
          viewport: new Vec4(),
          projMat: new Mat4(),
          viewMat: new Mat4(),
          viewOffMat: new Mat4(),
          viewInvMat: new Mat4(),
          viewInvOffMat: new Mat4(),
          projViewOffMat: new Mat4(),
          viewMat3: new Mat3(),
          position: new Float32Array(3),
          rotation: new Quat()
        };
      }
      this.views.push(view);
    }
    // remove views from list into pool
    while (lengthNew < this.views.length) {
      this.viewsPool.push(this.views.pop());
    }

    // reset position
    const posePosition = pose.transform.position;
    const poseOrientation = pose.transform.orientation;
    this._localPosition.set(posePosition.x, posePosition.y, posePosition.z);
    this._localRotation.set(poseOrientation.x, poseOrientation.y, poseOrientation.z, poseOrientation.w);
    const layer = frame.session.renderState.baseLayer;
    for (let i = 0; i < pose.views.length; i++) {
      // for each view, calculate matrices
      const viewRaw = pose.views[i];
      const view = this.views[i];
      const viewport = layer.getViewport(viewRaw);
      view.viewport.x = viewport.x;
      view.viewport.y = viewport.y;
      view.viewport.z = viewport.width;
      view.viewport.w = viewport.height;
      view.projMat.set(viewRaw.projectionMatrix);
      view.viewMat.set(viewRaw.transform.inverse.matrix);
      view.viewInvMat.set(viewRaw.transform.matrix);
    }

    // update the camera fov properties only when we had 0 views
    if (lengthOld === 0 && this.views.length > 0) {
      const viewProjMat = new Mat4();
      const view = this.views[0];
      viewProjMat.copy(view.projMat);
      const data = viewProjMat.data;
      const fov = 2.0 * Math.atan(1.0 / data[5]) * 180.0 / Math.PI;
      const aspectRatio = data[5] / data[0];
      const farClip = data[14] / (data[10] + 1);
      const nearClip = data[14] / (data[10] - 1);
      const horizontalFov = false;
      const camera = this._camera.camera;
      camera.setXrProperties({
        aspectRatio,
        farClip,
        fov,
        horizontalFov,
        nearClip
      });
    }

    // position and rotate camera based on calculated vectors
    this._camera.camera._node.setLocalPosition(this._localPosition);
    this._camera.camera._node.setLocalRotation(this._localRotation);
    this.input.update(frame);
    if (this._type === XRTYPE_AR) {
      if (this.hitTest.supported) this.hitTest.update(frame);
      if (this.lightEstimation.supported) this.lightEstimation.update(frame);
      if (this.depthSensing.supported) this.depthSensing.update(frame, pose && pose.views[0]);
      if (this.imageTracking.supported) this.imageTracking.update(frame);
      if (this.anchors.supported) this.anchors.update(frame);
      if (this.planeDetection.supported) this.planeDetection.update(frame);
    }
    this.fire('update', frame);
    return true;
  }

  /**
   * True if XR is supported.
   *
   * @type {boolean}
   */
  get supported() {
    return this._supported;
  }

  /**
   * True if XR session is running.
   *
   * @type {boolean}
   */
  get active() {
    return !!this._session;
  }

  /**
   * Returns type of currently running XR session or null if no session is running. Can be any of
   * XRTYPE_*.
   *
   * @type {string|null}
   */
  get type() {
    return this._type;
  }

  /**
   * Returns reference space type of currently running XR session or null if no session is
   * running. Can be any of XRSPACE_*.
   *
   * @type {string|null}
   */
  get spaceType() {
    return this._spaceType;
  }

  /**
   * Provides access to XRSession of WebXR.
   *
   * @type {object|null}
   */
  get session() {
    return this._session;
  }

  /**
   * Active camera for which XR session is running or null.
   *
   * @type {import('../entity.js').Entity|null}
   */
  get camera() {
    return this._camera ? this._camera.entity : null;
  }

  /**
   * Indicates whether WebXR content is currently visible to the user, and if it is, whether it's
   * the primary focus. Can be 'hidden', 'visible' or 'visible-blurred'.
   *
   * @type {string}
   * @ignore
   */
  get visibilityState() {
    if (!this._session) return null;
    return this._session.visibilityState;
  }
}

export { XrManager };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoieHItbWFuYWdlci5qcyIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL2ZyYW1ld29yay94ci94ci1tYW5hZ2VyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IERlYnVnIH0gZnJvbSBcIi4uLy4uL2NvcmUvZGVidWcuanNcIjtcblxuaW1wb3J0IHsgRXZlbnRIYW5kbGVyIH0gZnJvbSAnLi4vLi4vY29yZS9ldmVudC1oYW5kbGVyLmpzJztcbmltcG9ydCB7IHBsYXRmb3JtIH0gZnJvbSAnLi4vLi4vY29yZS9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBNYXQzIH0gZnJvbSAnLi4vLi4vY29yZS9tYXRoL21hdDMuanMnO1xuaW1wb3J0IHsgTWF0NCB9IGZyb20gJy4uLy4uL2NvcmUvbWF0aC9tYXQ0LmpzJztcbmltcG9ydCB7IFF1YXQgfSBmcm9tICcuLi8uLi9jb3JlL21hdGgvcXVhdC5qcyc7XG5pbXBvcnQgeyBWZWMzIH0gZnJvbSAnLi4vLi4vY29yZS9tYXRoL3ZlYzMuanMnO1xuaW1wb3J0IHsgVmVjNCB9IGZyb20gJy4uLy4uL2NvcmUvbWF0aC92ZWM0LmpzJztcblxuaW1wb3J0IHsgWFJUWVBFX0lOTElORSwgWFJUWVBFX1ZSLCBYUlRZUEVfQVIsIFhSREVQVEhTRU5TSU5HVVNBR0VfQ1BVLCBYUkRFUFRIU0VOU0lOR0ZPUk1BVF9MOEE4IH0gZnJvbSAnLi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgWHJEZXB0aFNlbnNpbmcgfSBmcm9tICcuL3hyLWRlcHRoLXNlbnNpbmcuanMnO1xuaW1wb3J0IHsgWHJEb21PdmVybGF5IH0gZnJvbSAnLi94ci1kb20tb3ZlcmxheS5qcyc7XG5pbXBvcnQgeyBYckhpdFRlc3QgfSBmcm9tICcuL3hyLWhpdC10ZXN0LmpzJztcbmltcG9ydCB7IFhySW1hZ2VUcmFja2luZyB9IGZyb20gJy4veHItaW1hZ2UtdHJhY2tpbmcuanMnO1xuaW1wb3J0IHsgWHJJbnB1dCB9IGZyb20gJy4veHItaW5wdXQuanMnO1xuaW1wb3J0IHsgWHJMaWdodEVzdGltYXRpb24gfSBmcm9tICcuL3hyLWxpZ2h0LWVzdGltYXRpb24uanMnO1xuaW1wb3J0IHsgWHJQbGFuZURldGVjdGlvbiB9IGZyb20gJy4veHItcGxhbmUtZGV0ZWN0aW9uLmpzJztcbmltcG9ydCB7IFhyQW5jaG9ycyB9IGZyb20gJy4veHItYW5jaG9ycy5qcyc7XG5cbi8qKlxuICogQ2FsbGJhY2sgdXNlZCBieSB7QGxpbmsgWHJNYW5hZ2VyI2VuZFhyfSBhbmQge0BsaW5rIFhyTWFuYWdlciNzdGFydFhyfS5cbiAqXG4gKiBAY2FsbGJhY2sgWHJFcnJvckNhbGxiYWNrXG4gKiBAcGFyYW0ge0Vycm9yfG51bGx9IGVyciAtIFRoZSBFcnJvciBvYmplY3Qgb3IgbnVsbCBpZiBvcGVyYXRpb24gd2FzIHN1Y2Nlc3NmdWwuXG4gKi9cblxuLyoqXG4gKiBNYW5hZ2UgYW5kIHVwZGF0ZSBYUiBzZXNzaW9uIGFuZCBpdHMgc3RhdGVzLlxuICpcbiAqIEBhdWdtZW50cyBFdmVudEhhbmRsZXJcbiAqIEBjYXRlZ29yeSBYUlxuICovXG5jbGFzcyBYck1hbmFnZXIgZXh0ZW5kcyBFdmVudEhhbmRsZXIge1xuICAgIC8qKlxuICAgICAqIEB0eXBlIHtpbXBvcnQoJy4uL2FwcC1iYXNlLmpzJykuQXBwQmFzZX1cbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgYXBwO1xuXG4gICAgLyoqXG4gICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfc3VwcG9ydGVkID0gcGxhdGZvcm0uYnJvd3NlciAmJiAhIW5hdmlnYXRvci54cjtcblxuICAgIC8qKlxuICAgICAqIEB0eXBlIHtPYmplY3Q8c3RyaW5nLCBib29sZWFuPn1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9hdmFpbGFibGUgPSB7fTtcblxuICAgIC8qKlxuICAgICAqIEB0eXBlIHtzdHJpbmd8bnVsbH1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF90eXBlID0gbnVsbDtcblxuICAgIC8qKlxuICAgICAqIEB0eXBlIHtzdHJpbmd8bnVsbH1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9zcGFjZVR5cGUgPSBudWxsO1xuXG4gICAgLyoqXG4gICAgICogQHR5cGUge1hSU2Vzc2lvbnxudWxsfVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX3Nlc3Npb24gPSBudWxsO1xuXG4gICAgLyoqXG4gICAgICogQHR5cGUge1hSV2ViR0xMYXllcnxudWxsfVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX2Jhc2VMYXllciA9IG51bGw7XG5cbiAgICAvKipcbiAgICAgKiBAdHlwZSB7WFJSZWZlcmVuY2VTcGFjZXxudWxsfVxuICAgICAqIEBpZ25vcmVcbiAgICAgKi9cbiAgICBfcmVmZXJlbmNlU3BhY2UgPSBudWxsO1xuXG4gICAgLyoqXG4gICAgICogUHJvdmlkZXMgYWNjZXNzIHRvIGRlcHRoIHNlbnNpbmcgY2FwYWJpbGl0aWVzLlxuICAgICAqXG4gICAgICogQHR5cGUge1hyRGVwdGhTZW5zaW5nfVxuICAgICAqIEBpZ25vcmVcbiAgICAgKi9cbiAgICBkZXB0aFNlbnNpbmc7XG5cbiAgICAvKipcbiAgICAgKiBQcm92aWRlcyBhY2Nlc3MgdG8gRE9NIG92ZXJsYXkgY2FwYWJpbGl0aWVzLlxuICAgICAqXG4gICAgICogQHR5cGUge1hyRG9tT3ZlcmxheX1cbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgZG9tT3ZlcmxheTtcblxuICAgIC8qKlxuICAgICAqIFByb3ZpZGVzIHRoZSBhYmlsaXR5IHRvIHBlcmZvcm0gaGl0IHRlc3RzIG9uIHRoZSByZXByZXNlbnRhdGlvbiBvZiByZWFsIHdvcmxkIGdlb21ldHJ5XG4gICAgICogb2YgdGhlIHVuZGVybHlpbmcgQVIgc3lzdGVtLlxuICAgICAqXG4gICAgICogQHR5cGUge1hySGl0VGVzdH1cbiAgICAgKi9cbiAgICBoaXRUZXN0O1xuXG4gICAgLyoqXG4gICAgICogUHJvdmlkZXMgYWNjZXNzIHRvIGltYWdlIHRyYWNraW5nIGNhcGFiaWxpdGllcy5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtYckltYWdlVHJhY2tpbmd9XG4gICAgICogQGlnbm9yZVxuICAgICAqL1xuICAgIGltYWdlVHJhY2tpbmc7XG5cbiAgICAvKipcbiAgICAgKiBQcm92aWRlcyBhY2Nlc3MgdG8gcGxhbmUgZGV0ZWN0aW9uIGNhcGFiaWxpdGllcy5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtYclBsYW5lRGV0ZWN0aW9ufVxuICAgICAqIEBpZ25vcmVcbiAgICAgKi9cbiAgICBwbGFuZURldGVjdGlvbjtcblxuICAgIC8qKlxuICAgICAqIFByb3ZpZGVzIGFjY2VzcyB0byBJbnB1dCBTb3VyY2VzLlxuICAgICAqXG4gICAgICogQHR5cGUge1hySW5wdXR9XG4gICAgICovXG4gICAgaW5wdXQ7XG5cbiAgICAvKipcbiAgICAgKiBQcm92aWRlcyBhY2Nlc3MgdG8gbGlnaHQgZXN0aW1hdGlvbiBjYXBhYmlsaXRpZXMuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7WHJMaWdodEVzdGltYXRpb259XG4gICAgICogQGlnbm9yZVxuICAgICAqL1xuICAgIGxpZ2h0RXN0aW1hdGlvbjtcblxuICAgIC8qKlxuICAgICAqIEB0eXBlIHtpbXBvcnQoJy4uL2NvbXBvbmVudHMvY2FtZXJhL2NvbXBvbmVudC5qcycpLkNhbWVyYUNvbXBvbmVudH1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9jYW1lcmEgPSBudWxsO1xuXG4gICAgLyoqXG4gICAgICogQHR5cGUge0FycmF5PCo+fVxuICAgICAqIEBpZ25vcmVcbiAgICAgKi9cbiAgICB2aWV3cyA9IFtdO1xuXG4gICAgLyoqXG4gICAgICogQHR5cGUge0FycmF5PCo+fVxuICAgICAqIEBpZ25vcmVcbiAgICAgKi9cbiAgICB2aWV3c1Bvb2wgPSBbXTtcblxuICAgIC8qKlxuICAgICAqIEB0eXBlIHtWZWMzfVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX2xvY2FsUG9zaXRpb24gPSBuZXcgVmVjMygpO1xuXG4gICAgLyoqXG4gICAgICogQHR5cGUge1F1YXR9XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfbG9jYWxSb3RhdGlvbiA9IG5ldyBRdWF0KCk7XG5cbiAgICAvKipcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX2RlcHRoTmVhciA9IDAuMTtcblxuICAgIC8qKlxuICAgICAqIEB0eXBlIHtudW1iZXJ9XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfZGVwdGhGYXIgPSAxMDAwO1xuXG4gICAgLyoqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF93aWR0aCA9IDA7XG5cbiAgICAvKipcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX2hlaWdodCA9IDA7XG5cbiAgICAvKipcbiAgICAgKiBDcmVhdGUgYSBuZXcgWHJNYW5hZ2VyIGluc3RhbmNlLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4uL2FwcC1iYXNlLmpzJykuQXBwQmFzZX0gYXBwIC0gVGhlIG1haW4gYXBwbGljYXRpb24uXG4gICAgICogQGhpZGVjb25zdHJ1Y3RvclxuICAgICAqL1xuICAgIGNvbnN0cnVjdG9yKGFwcCkge1xuICAgICAgICBzdXBlcigpO1xuXG4gICAgICAgIHRoaXMuYXBwID0gYXBwO1xuXG4gICAgICAgIC8vIEFkZCBhbGwgdGhlIHN1cHBvcnRlZCBzZXNzaW9uIHR5cGVzXG4gICAgICAgIHRoaXMuX2F2YWlsYWJsZVtYUlRZUEVfSU5MSU5FXSA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9hdmFpbGFibGVbWFJUWVBFX1ZSXSA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9hdmFpbGFibGVbWFJUWVBFX0FSXSA9IGZhbHNlO1xuXG4gICAgICAgIHRoaXMuZGVwdGhTZW5zaW5nID0gbmV3IFhyRGVwdGhTZW5zaW5nKHRoaXMpO1xuICAgICAgICB0aGlzLmRvbU92ZXJsYXkgPSBuZXcgWHJEb21PdmVybGF5KHRoaXMpO1xuICAgICAgICB0aGlzLmhpdFRlc3QgPSBuZXcgWHJIaXRUZXN0KHRoaXMpO1xuICAgICAgICB0aGlzLmltYWdlVHJhY2tpbmcgPSBuZXcgWHJJbWFnZVRyYWNraW5nKHRoaXMpO1xuICAgICAgICB0aGlzLnBsYW5lRGV0ZWN0aW9uID0gbmV3IFhyUGxhbmVEZXRlY3Rpb24odGhpcyk7XG4gICAgICAgIHRoaXMuaW5wdXQgPSBuZXcgWHJJbnB1dCh0aGlzKTtcbiAgICAgICAgdGhpcy5saWdodEVzdGltYXRpb24gPSBuZXcgWHJMaWdodEVzdGltYXRpb24odGhpcyk7XG4gICAgICAgIHRoaXMuYW5jaG9ycyA9IG5ldyBYckFuY2hvcnModGhpcyk7XG5cbiAgICAgICAgLy8gVE9ET1xuICAgICAgICAvLyAxLiBITUQgY2xhc3Mgd2l0aCBpdHMgcGFyYW1zXG4gICAgICAgIC8vIDIuIFNwYWNlIGNsYXNzXG4gICAgICAgIC8vIDMuIENvbnRyb2xsZXJzIGNsYXNzXG5cbiAgICAgICAgaWYgKHRoaXMuX3N1cHBvcnRlZCkge1xuICAgICAgICAgICAgbmF2aWdhdG9yLnhyLmFkZEV2ZW50TGlzdGVuZXIoJ2RldmljZWNoYW5nZScsICgpID0+IHtcbiAgICAgICAgICAgICAgICB0aGlzLl9kZXZpY2VBdmFpbGFiaWxpdHlDaGVjaygpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB0aGlzLl9kZXZpY2VBdmFpbGFiaWxpdHlDaGVjaygpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRmlyZWQgd2hlbiBhdmFpbGFiaWxpdHkgb2Ygc3BlY2lmaWMgWFIgdHlwZSBpcyBjaGFuZ2VkLlxuICAgICAqXG4gICAgICogQGV2ZW50IFhyTWFuYWdlciNhdmFpbGFibGVcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gdHlwZSAtIFRoZSBzZXNzaW9uIHR5cGUgdGhhdCBoYXMgY2hhbmdlZCBhdmFpbGFiaWxpdHkuXG4gICAgICogQHBhcmFtIHtib29sZWFufSBhdmFpbGFibGUgLSBUcnVlIGlmIHNwZWNpZmllZCBzZXNzaW9uIHR5cGUgaXMgbm93IGF2YWlsYWJsZS5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGFwcC54ci5vbignYXZhaWxhYmxlJywgZnVuY3Rpb24gKHR5cGUsIGF2YWlsYWJsZSkge1xuICAgICAqICAgICBjb25zb2xlLmxvZygnXCInICsgdHlwZSArICdcIiBYUiBzZXNzaW9uIGlzIG5vdyAnICsgKGF2YWlsYWJsZSA/ICdhdmFpbGFibGUnIDogJ3VuYXZhaWxhYmxlJykpO1xuICAgICAqIH0pO1xuICAgICAqL1xuXG4gICAgLyoqXG4gICAgICogRmlyZWQgd2hlbiBhdmFpbGFiaWxpdHkgb2Ygc3BlY2lmaWMgWFIgdHlwZSBpcyBjaGFuZ2VkLlxuICAgICAqXG4gICAgICogQGV2ZW50IFhyTWFuYWdlciNhdmFpbGFibGU6W3R5cGVdXG4gICAgICogQHBhcmFtIHtib29sZWFufSBhdmFpbGFibGUgLSBUcnVlIGlmIHNwZWNpZmllZCBzZXNzaW9uIHR5cGUgaXMgbm93IGF2YWlsYWJsZS5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGFwcC54ci5vbignYXZhaWxhYmxlOicgKyBwYy5YUlRZUEVfVlIsIGZ1bmN0aW9uIChhdmFpbGFibGUpIHtcbiAgICAgKiAgICAgY29uc29sZS5sb2coJ0ltbWVyc2l2ZSBWUiBzZXNzaW9uIGlzIG5vdyAnICsgKGF2YWlsYWJsZSA/ICdhdmFpbGFibGUnIDogJ3VuYXZhaWxhYmxlJykpO1xuICAgICAqIH0pO1xuICAgICAqL1xuXG4gICAgLyoqXG4gICAgICogRmlyZWQgd2hlbiBYUiBzZXNzaW9uIGlzIHN0YXJ0ZWQuXG4gICAgICpcbiAgICAgKiBAZXZlbnQgWHJNYW5hZ2VyI3N0YXJ0XG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBhcHAueHIub24oJ3N0YXJ0JywgZnVuY3Rpb24gKCkge1xuICAgICAqICAgICAvLyBYUiBzZXNzaW9uIGhhcyBzdGFydGVkXG4gICAgICogfSk7XG4gICAgICovXG5cbiAgICAvKipcbiAgICAgKiBGaXJlZCB3aGVuIFhSIHNlc3Npb24gaXMgZW5kZWQuXG4gICAgICpcbiAgICAgKiBAZXZlbnQgWHJNYW5hZ2VyI2VuZFxuICAgICAqIEBleGFtcGxlXG4gICAgICogYXBwLnhyLm9uKCdlbmQnLCBmdW5jdGlvbiAoKSB7XG4gICAgICogICAgIC8vIFhSIHNlc3Npb24gaGFzIGVuZGVkXG4gICAgICogfSk7XG4gICAgICovXG5cbiAgICAvKipcbiAgICAgKiBGaXJlZCB3aGVuIFhSIHNlc3Npb24gaXMgdXBkYXRlZCwgcHJvdmlkaW5nIHJlbGV2YW50IFhSRnJhbWUgb2JqZWN0LlxuICAgICAqXG4gICAgICogQGV2ZW50IFhyTWFuYWdlciN1cGRhdGVcbiAgICAgKiBAcGFyYW0ge29iamVjdH0gZnJhbWUgLSBbWFJGcmFtZV0oaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvQVBJL1hSRnJhbWUpXG4gICAgICogb2JqZWN0IHRoYXQgY2FuIGJlIHVzZWQgZm9yIGludGVyZmFjaW5nIGRpcmVjdGx5IHdpdGggV2ViWFIgQVBJcy5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGFwcC54ci5vbigndXBkYXRlJywgZnVuY3Rpb24gKGZyYW1lKSB7XG4gICAgICpcbiAgICAgKiB9KTtcbiAgICAgKi9cblxuICAgIC8qKlxuICAgICAqIEZpcmVkIHdoZW4gWFIgc2Vzc2lvbiBpcyBmYWlsZWQgdG8gc3RhcnQgb3IgZmFpbGVkIHRvIGNoZWNrIGZvciBzZXNzaW9uIHR5cGUgc3VwcG9ydC5cbiAgICAgKlxuICAgICAqIEBldmVudCBYck1hbmFnZXIjZXJyb3JcbiAgICAgKiBAcGFyYW0ge0Vycm9yfSBlcnJvciAtIEVycm9yIG9iamVjdCByZWxhdGVkIHRvIGZhaWx1cmUgb2Ygc2Vzc2lvbiBzdGFydCBvciBjaGVjayBvZiBzZXNzaW9uXG4gICAgICogdHlwZSBzdXBwb3J0LlxuICAgICAqIEBleGFtcGxlXG4gICAgICogYXBwLnhyLm9uKCdlcnJvcicsIGZ1bmN0aW9uIChleCkge1xuICAgICAqICAgICAvLyBYUiBzZXNzaW9uIGhhcyBmYWlsZWQgdG8gc3RhcnQsIG9yIGZhaWxlZCB0byBjaGVjayBmb3Igc2Vzc2lvbiB0eXBlIHN1cHBvcnRcbiAgICAgKiB9KTtcbiAgICAgKi9cblxuICAgIC8qKlxuICAgICAqIERlc3Ryb3lzIHRoZSBYck1hbmFnZXIgaW5zdGFuY2UuXG4gICAgICpcbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgZGVzdHJveSgpIHtcbiAgICAgICAgdGhpcy5kZXB0aFNlbnNpbmcuZGVzdHJveSgpO1xuICAgICAgICB0aGlzLmRlcHRoU2Vuc2luZyA9IG51bGw7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQXR0ZW1wdHMgdG8gc3RhcnQgWFIgc2Vzc2lvbiBmb3IgcHJvdmlkZWQge0BsaW5rIENhbWVyYUNvbXBvbmVudH0gYW5kIG9wdGlvbmFsbHkgZmlyZXNcbiAgICAgKiBjYWxsYmFjayB3aGVuIHNlc3Npb24gaXMgY3JlYXRlZCBvciBmYWlsZWQgdG8gY3JlYXRlLiBJbnRlZ3JhdGVkIFhSIEFQSXMgbmVlZCB0byBiZSBlbmFibGVkXG4gICAgICogYnkgcHJvdmlkaW5nIHJlbGV2YW50IG9wdGlvbnMuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi4vY29tcG9uZW50cy9jYW1lcmEvY29tcG9uZW50LmpzJykuQ2FtZXJhQ29tcG9uZW50fSBjYW1lcmEgLSBJdCB3aWxsIGJlXG4gICAgICogdXNlZCB0byByZW5kZXIgWFIgc2Vzc2lvbiBhbmQgbWFuaXB1bGF0ZWQgYmFzZWQgb24gcG9zZSB0cmFja2luZy5cbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gdHlwZSAtIFNlc3Npb24gdHlwZS4gQ2FuIGJlIG9uZSBvZiB0aGUgZm9sbG93aW5nOlxuICAgICAqXG4gICAgICogLSB7QGxpbmsgWFJUWVBFX0lOTElORX06IElubGluZSAtIGFsd2F5cyBhdmFpbGFibGUgdHlwZSBvZiBzZXNzaW9uLiBJdCBoYXMgbGltaXRlZCBmZWF0dXJlc1xuICAgICAqIGF2YWlsYWJpbGl0eSBhbmQgaXMgcmVuZGVyZWQgaW50byBIVE1MIGVsZW1lbnQuXG4gICAgICogLSB7QGxpbmsgWFJUWVBFX1ZSfTogSW1tZXJzaXZlIFZSIC0gc2Vzc2lvbiB0aGF0IHByb3ZpZGVzIGV4Y2x1c2l2ZSBhY2Nlc3MgdG8gVlIgZGV2aWNlIHdpdGhcbiAgICAgKiBiZXN0IGF2YWlsYWJsZSB0cmFja2luZyBmZWF0dXJlcy5cbiAgICAgKiAtIHtAbGluayBYUlRZUEVfQVJ9OiBJbW1lcnNpdmUgQVIgLSBzZXNzaW9uIHRoYXQgcHJvdmlkZXMgZXhjbHVzaXZlIGFjY2VzcyB0byBWUi9BUiBkZXZpY2VcbiAgICAgKiB0aGF0IGlzIGludGVuZGVkIHRvIGJlIGJsZW5kZWQgd2l0aCByZWFsLXdvcmxkIGVudmlyb25tZW50LlxuICAgICAqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IHNwYWNlVHlwZSAtIFJlZmVyZW5jZSBzcGFjZSB0eXBlLiBDYW4gYmUgb25lIG9mIHRoZSBmb2xsb3dpbmc6XG4gICAgICpcbiAgICAgKiAtIHtAbGluayBYUlNQQUNFX1ZJRVdFUn06IFZpZXdlciAtIGFsd2F5cyBzdXBwb3J0ZWQgc3BhY2Ugd2l0aCBzb21lIGJhc2ljIHRyYWNraW5nXG4gICAgICogY2FwYWJpbGl0aWVzLlxuICAgICAqIC0ge0BsaW5rIFhSU1BBQ0VfTE9DQUx9OiBMb2NhbCAtIHJlcHJlc2VudHMgYSB0cmFja2luZyBzcGFjZSB3aXRoIGEgbmF0aXZlIG9yaWdpbiBuZWFyIHRoZVxuICAgICAqIHZpZXdlciBhdCB0aGUgdGltZSBvZiBjcmVhdGlvbi4gSXQgaXMgbWVhbnQgZm9yIHNlYXRlZCBvciBiYXNpYyBsb2NhbCBYUiBzZXNzaW9ucy5cbiAgICAgKiAtIHtAbGluayBYUlNQQUNFX0xPQ0FMRkxPT1J9OiBMb2NhbCBGbG9vciAtIHJlcHJlc2VudHMgYSB0cmFja2luZyBzcGFjZSB3aXRoIGEgbmF0aXZlIG9yaWdpblxuICAgICAqIGF0IHRoZSBmbG9vciBpbiBhIHNhZmUgcG9zaXRpb24gZm9yIHRoZSB1c2VyIHRvIHN0YW5kLiBUaGUgeSBheGlzIGVxdWFscyAwIGF0IGZsb29yIGxldmVsLlxuICAgICAqIEZsb29yIGxldmVsIHZhbHVlIG1pZ2h0IGJlIGVzdGltYXRlZCBieSB0aGUgdW5kZXJseWluZyBwbGF0Zm9ybS4gSXQgaXMgbWVhbnQgZm9yIHNlYXRlZCBvclxuICAgICAqIGJhc2ljIGxvY2FsIFhSIHNlc3Npb25zLlxuICAgICAqIC0ge0BsaW5rIFhSU1BBQ0VfQk9VTkRFREZMT09SfTogQm91bmRlZCBGbG9vciAtIHJlcHJlc2VudHMgYSB0cmFja2luZyBzcGFjZSB3aXRoIGl0cyBuYXRpdmVcbiAgICAgKiBvcmlnaW4gYXQgdGhlIGZsb29yLCB3aGVyZSB0aGUgdXNlciBpcyBleHBlY3RlZCB0byBtb3ZlIHdpdGhpbiBhIHByZS1lc3RhYmxpc2hlZCBib3VuZGFyeS5cbiAgICAgKiAtIHtAbGluayBYUlNQQUNFX1VOQk9VTkRFRH06IFVuYm91bmRlZCAtIHJlcHJlc2VudHMgYSB0cmFja2luZyBzcGFjZSB3aGVyZSB0aGUgdXNlciBpc1xuICAgICAqIGV4cGVjdGVkIHRvIG1vdmUgZnJlZWx5IGFyb3VuZCB0aGVpciBlbnZpcm9ubWVudCwgcG90ZW50aWFsbHkgbG9uZyBkaXN0YW5jZXMgZnJvbSB0aGVpclxuICAgICAqIHN0YXJ0aW5nIHBvaW50LlxuICAgICAqXG4gICAgICogQHBhcmFtIHtvYmplY3R9IFtvcHRpb25zXSAtIE9iamVjdCB3aXRoIGFkZGl0aW9uYWwgb3B0aW9ucyBmb3IgWFIgc2Vzc2lvbiBpbml0aWFsaXphdGlvbi5cbiAgICAgKiBAcGFyYW0ge3N0cmluZ1tdfSBbb3B0aW9ucy5vcHRpb25hbEZlYXR1cmVzXSAtIE9wdGlvbmFsIGZlYXR1cmVzIGZvciBYUlNlc3Npb24gc3RhcnQuIEl0IGlzXG4gICAgICogdXNlZCBmb3IgZ2V0dGluZyBhY2Nlc3MgdG8gYWRkaXRpb25hbCBXZWJYUiBzcGVjIGV4dGVuc2lvbnMuXG4gICAgICogQHBhcmFtIHtib29sZWFufSBbb3B0aW9ucy5hbmNob3JzXSAtIFNldCB0byB0cnVlIHRvIGF0dGVtcHQgdG8gZW5hYmxlXG4gICAgICoge0BsaW5rIFhyQW5jaG9yc30uXG4gICAgICogQHBhcmFtIHtib29sZWFufSBbb3B0aW9ucy5pbWFnZVRyYWNraW5nXSAtIFNldCB0byB0cnVlIHRvIGF0dGVtcHQgdG8gZW5hYmxlXG4gICAgICoge0BsaW5rIFhySW1hZ2VUcmFja2luZ30uXG4gICAgICogQHBhcmFtIHtib29sZWFufSBbb3B0aW9ucy5wbGFuZURldGVjdGlvbl0gLSBTZXQgdG8gdHJ1ZSB0byBhdHRlbXB0IHRvIGVuYWJsZVxuICAgICAqIHtAbGluayBYclBsYW5lRGV0ZWN0aW9ufS5cbiAgICAgKiBAcGFyYW0ge1hyRXJyb3JDYWxsYmFja30gW29wdGlvbnMuY2FsbGJhY2tdIC0gT3B0aW9uYWwgY2FsbGJhY2sgZnVuY3Rpb24gY2FsbGVkIG9uY2Ugc2Vzc2lvblxuICAgICAqIGlzIHN0YXJ0ZWQuIFRoZSBjYWxsYmFjayBoYXMgb25lIGFyZ3VtZW50IEVycm9yIC0gaXQgaXMgbnVsbCBpZiBzdWNjZXNzZnVsbHkgc3RhcnRlZCBYUlxuICAgICAqIHNlc3Npb24uXG4gICAgICogQHBhcmFtIHtvYmplY3R9IFtvcHRpb25zLmRlcHRoU2Vuc2luZ10gLSBPcHRpb25hbCBvYmplY3Qgd2l0aCBkZXB0aCBzZW5zaW5nIHBhcmFtZXRlcnMgdG9cbiAgICAgKiBhdHRlbXB0IHRvIGVuYWJsZSB7QGxpbmsgWHJEZXB0aFNlbnNpbmd9LlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBbb3B0aW9ucy5kZXB0aFNlbnNpbmcudXNhZ2VQcmVmZXJlbmNlXSAtIE9wdGlvbmFsIHVzYWdlIHByZWZlcmVuY2UgZm9yIGRlcHRoXG4gICAgICogc2Vuc2luZywgY2FuIGJlICdjcHUtb3B0aW1pemVkJyBvciAnZ3B1LW9wdGltaXplZCcgKFhSREVQVEhTRU5TSU5HVVNBR0VfKiksIGRlZmF1bHRzIHRvXG4gICAgICogJ2NwdS1vcHRpbWl6ZWQnLiBNb3N0IHByZWZlcnJlZCBhbmQgc3VwcG9ydGVkIHdpbGwgYmUgY2hvc2VuIGJ5IHRoZSB1bmRlcmx5aW5nIGRlcHRoIHNlbnNpbmdcbiAgICAgKiBzeXN0ZW0uXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IFtvcHRpb25zLmRlcHRoU2Vuc2luZy5kYXRhRm9ybWF0UHJlZmVyZW5jZV0gLSBPcHRpb25hbCBkYXRhIGZvcm1hdFxuICAgICAqIHByZWZlcmVuY2UgZm9yIGRlcHRoIHNlbnNpbmcsIGNhbiBiZSAnbHVtaW5hbmNlLWFscGhhJyBvciAnZmxvYXQzMidcbiAgICAgKiAoWFJERVBUSFNFTlNJTkdGT1JNQVRfKiksIGRlZmF1bHRzIHRvICdsdW1pbmFuY2UtYWxwaGEnLiBNb3N0IHByZWZlcnJlZCBhbmQgc3VwcG9ydGVkIHdpbGxcbiAgICAgKiBiZSBjaG9zZW4gYnkgdGhlIHVuZGVybHlpbmcgZGVwdGggc2Vuc2luZyBzeXN0ZW0uXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBidXR0b24ub24oJ2NsaWNrJywgZnVuY3Rpb24gKCkge1xuICAgICAqICAgICBhcHAueHIuc3RhcnQoY2FtZXJhLCBwYy5YUlRZUEVfVlIsIHBjLlhSU1BBQ0VfTE9DQUxGTE9PUik7XG4gICAgICogfSk7XG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBidXR0b24ub24oJ2NsaWNrJywgZnVuY3Rpb24gKCkge1xuICAgICAqICAgICBhcHAueHIuc3RhcnQoY2FtZXJhLCBwYy5YUlRZUEVfQVIsIHBjLlhSU1BBQ0VfTE9DQUxGTE9PUiwge1xuICAgICAqICAgICAgICAgYW5jaG9yczogdHJ1ZSxcbiAgICAgKiAgICAgICAgIGltYWdlVHJhY2tpbmc6IHRydWUsXG4gICAgICogICAgICAgICBkZXB0aFNlbnNpbmc6IHsgfVxuICAgICAqICAgICB9KTtcbiAgICAgKiB9KTtcbiAgICAgKi9cbiAgICBzdGFydChjYW1lcmEsIHR5cGUsIHNwYWNlVHlwZSwgb3B0aW9ucykge1xuICAgICAgICBsZXQgY2FsbGJhY2sgPSBvcHRpb25zO1xuXG4gICAgICAgIGlmICh0eXBlb2Ygb3B0aW9ucyA9PT0gJ29iamVjdCcpXG4gICAgICAgICAgICBjYWxsYmFjayA9IG9wdGlvbnMuY2FsbGJhY2s7XG5cbiAgICAgICAgaWYgKCF0aGlzLl9hdmFpbGFibGVbdHlwZV0pIHtcbiAgICAgICAgICAgIGlmIChjYWxsYmFjaykgY2FsbGJhY2sobmV3IEVycm9yKCdYUiBpcyBub3QgYXZhaWxhYmxlJykpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuX3Nlc3Npb24pIHtcbiAgICAgICAgICAgIGlmIChjYWxsYmFjaykgY2FsbGJhY2sobmV3IEVycm9yKCdYUiBzZXNzaW9uIGlzIGFscmVhZHkgc3RhcnRlZCcpKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuX2NhbWVyYSA9IGNhbWVyYTtcbiAgICAgICAgdGhpcy5fY2FtZXJhLmNhbWVyYS54ciA9IHRoaXM7XG4gICAgICAgIHRoaXMuX3R5cGUgPSB0eXBlO1xuICAgICAgICB0aGlzLl9zcGFjZVR5cGUgPSBzcGFjZVR5cGU7XG5cbiAgICAgICAgdGhpcy5fc2V0Q2xpcFBsYW5lcyhjYW1lcmEubmVhckNsaXAsIGNhbWVyYS5mYXJDbGlwKTtcblxuICAgICAgICAvLyBUT0RPXG4gICAgICAgIC8vIG1ha2VYUkNvbXBhdGlibGVcbiAgICAgICAgLy8gc2NlbmFyaW8gdG8gdGVzdDpcbiAgICAgICAgLy8gMS4gYXBwIGlzIHJ1bm5pbmcgb24gaW50ZWdyYXRlZCBHUFVcbiAgICAgICAgLy8gMi4gWFIgZGV2aWNlIGlzIGNvbm5lY3RlZCwgdG8gYW5vdGhlciBHUFVcbiAgICAgICAgLy8gMy4gcHJvYmFibHkgaW1tZXJzaXZlLXZyIHdpbGwgZmFpbCB0byBiZSBjcmVhdGVkXG4gICAgICAgIC8vIDQuIGNhbGwgbWFrZVhSQ29tcGF0aWJsZSwgdmVyeSBsaWtlbHkgd2lsbCBsZWFkIHRvIGNvbnRleHQgbG9zc1xuXG4gICAgICAgIGNvbnN0IG9wdHMgPSB7XG4gICAgICAgICAgICByZXF1aXJlZEZlYXR1cmVzOiBbc3BhY2VUeXBlXSxcbiAgICAgICAgICAgIG9wdGlvbmFsRmVhdHVyZXM6IFtdXG4gICAgICAgIH07XG5cbiAgICAgICAgaWYgKHR5cGUgPT09IFhSVFlQRV9BUikge1xuICAgICAgICAgICAgb3B0cy5vcHRpb25hbEZlYXR1cmVzLnB1c2goJ2xpZ2h0LWVzdGltYXRpb24nKTtcbiAgICAgICAgICAgIG9wdHMub3B0aW9uYWxGZWF0dXJlcy5wdXNoKCdoaXQtdGVzdCcpO1xuXG4gICAgICAgICAgICBpZiAob3B0aW9ucykge1xuICAgICAgICAgICAgICAgIGlmIChvcHRpb25zLmltYWdlVHJhY2tpbmcgJiYgdGhpcy5pbWFnZVRyYWNraW5nLnN1cHBvcnRlZClcbiAgICAgICAgICAgICAgICAgICAgb3B0cy5vcHRpb25hbEZlYXR1cmVzLnB1c2goJ2ltYWdlLXRyYWNraW5nJyk7XG5cbiAgICAgICAgICAgICAgICBpZiAob3B0aW9ucy5wbGFuZURldGVjdGlvbilcbiAgICAgICAgICAgICAgICAgICAgb3B0cy5vcHRpb25hbEZlYXR1cmVzLnB1c2goJ3BsYW5lLWRldGVjdGlvbicpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAodGhpcy5kb21PdmVybGF5LnN1cHBvcnRlZCAmJiB0aGlzLmRvbU92ZXJsYXkucm9vdCkge1xuICAgICAgICAgICAgICAgIG9wdHMub3B0aW9uYWxGZWF0dXJlcy5wdXNoKCdkb20tb3ZlcmxheScpO1xuICAgICAgICAgICAgICAgIG9wdHMuZG9tT3ZlcmxheSA9IHsgcm9vdDogdGhpcy5kb21PdmVybGF5LnJvb3QgfTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKG9wdGlvbnMgJiYgb3B0aW9ucy5hbmNob3JzICYmIHRoaXMuYW5jaG9ycy5zdXBwb3J0ZWQpIHtcbiAgICAgICAgICAgICAgICBvcHRzLm9wdGlvbmFsRmVhdHVyZXMucHVzaCgnYW5jaG9ycycpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAob3B0aW9ucyAmJiBvcHRpb25zLmRlcHRoU2Vuc2luZyAmJiB0aGlzLmRlcHRoU2Vuc2luZy5zdXBwb3J0ZWQpIHtcbiAgICAgICAgICAgICAgICBvcHRzLm9wdGlvbmFsRmVhdHVyZXMucHVzaCgnZGVwdGgtc2Vuc2luZycpO1xuXG4gICAgICAgICAgICAgICAgY29uc3QgdXNhZ2VQcmVmZXJlbmNlID0gW1hSREVQVEhTRU5TSU5HVVNBR0VfQ1BVXTtcbiAgICAgICAgICAgICAgICBjb25zdCBkYXRhRm9ybWF0UHJlZmVyZW5jZSA9IFtYUkRFUFRIU0VOU0lOR0ZPUk1BVF9MOEE4XTtcblxuICAgICAgICAgICAgICAgIGlmIChvcHRpb25zLmRlcHRoU2Vuc2luZy51c2FnZVByZWZlcmVuY2UpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaW5kID0gdXNhZ2VQcmVmZXJlbmNlLmluZGV4T2Yob3B0aW9ucy5kZXB0aFNlbnNpbmcudXNhZ2VQcmVmZXJlbmNlKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGluZCAhPT0gLTEpIHVzYWdlUHJlZmVyZW5jZS5zcGxpY2UoaW5kLCAxKTtcbiAgICAgICAgICAgICAgICAgICAgdXNhZ2VQcmVmZXJlbmNlLnVuc2hpZnQob3B0aW9ucy5kZXB0aFNlbnNpbmcudXNhZ2VQcmVmZXJlbmNlKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAob3B0aW9ucy5kZXB0aFNlbnNpbmcuZGF0YUZvcm1hdFByZWZlcmVuY2UpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaW5kID0gZGF0YUZvcm1hdFByZWZlcmVuY2UuaW5kZXhPZihvcHRpb25zLmRlcHRoU2Vuc2luZy5kYXRhRm9ybWF0UHJlZmVyZW5jZSk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChpbmQgIT09IC0xKSBkYXRhRm9ybWF0UHJlZmVyZW5jZS5zcGxpY2UoaW5kLCAxKTtcbiAgICAgICAgICAgICAgICAgICAgZGF0YUZvcm1hdFByZWZlcmVuY2UudW5zaGlmdChvcHRpb25zLmRlcHRoU2Vuc2luZy5kYXRhRm9ybWF0UHJlZmVyZW5jZSk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgb3B0cy5kZXB0aFNlbnNpbmcgPSB7XG4gICAgICAgICAgICAgICAgICAgIHVzYWdlUHJlZmVyZW5jZTogdXNhZ2VQcmVmZXJlbmNlLFxuICAgICAgICAgICAgICAgICAgICBkYXRhRm9ybWF0UHJlZmVyZW5jZTogZGF0YUZvcm1hdFByZWZlcmVuY2VcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKHR5cGUgPT09IFhSVFlQRV9WUikge1xuICAgICAgICAgICAgb3B0cy5vcHRpb25hbEZlYXR1cmVzLnB1c2goJ2hhbmQtdHJhY2tpbmcnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChvcHRpb25zICYmIG9wdGlvbnMub3B0aW9uYWxGZWF0dXJlcylcbiAgICAgICAgICAgIG9wdHMub3B0aW9uYWxGZWF0dXJlcyA9IG9wdHMub3B0aW9uYWxGZWF0dXJlcy5jb25jYXQob3B0aW9ucy5vcHRpb25hbEZlYXR1cmVzKTtcblxuICAgICAgICBpZiAodGhpcy5pbWFnZVRyYWNraW5nLnN1cHBvcnRlZCAmJiB0aGlzLmltYWdlVHJhY2tpbmcuaW1hZ2VzLmxlbmd0aCkge1xuICAgICAgICAgICAgdGhpcy5pbWFnZVRyYWNraW5nLnByZXBhcmVJbWFnZXMoKGVyciwgdHJhY2tlZEltYWdlcykgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNhbGxiYWNrKSBjYWxsYmFjayhlcnIpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmZpcmUoJ2Vycm9yJywgZXJyKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICh0cmFja2VkSW1hZ2VzICE9PSBudWxsKVxuICAgICAgICAgICAgICAgICAgICBvcHRzLnRyYWNrZWRJbWFnZXMgPSB0cmFja2VkSW1hZ2VzO1xuXG4gICAgICAgICAgICAgICAgdGhpcy5fb25TdGFydE9wdGlvbnNSZWFkeSh0eXBlLCBzcGFjZVR5cGUsIG9wdHMsIGNhbGxiYWNrKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5fb25TdGFydE9wdGlvbnNSZWFkeSh0eXBlLCBzcGFjZVR5cGUsIG9wdHMsIGNhbGxiYWNrKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSB0eXBlIC0gU2Vzc2lvbiB0eXBlLlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBzcGFjZVR5cGUgLSBSZWZlcmVuY2Ugc3BhY2UgdHlwZS5cbiAgICAgKiBAcGFyYW0geyp9IG9wdGlvbnMgLSBTZXNzaW9uIG9wdGlvbnMuXG4gICAgICogQHBhcmFtIHtYckVycm9yQ2FsbGJhY2t9IGNhbGxiYWNrIC0gRXJyb3IgY2FsbGJhY2suXG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfb25TdGFydE9wdGlvbnNSZWFkeSh0eXBlLCBzcGFjZVR5cGUsIG9wdGlvbnMsIGNhbGxiYWNrKSB7XG4gICAgICAgIG5hdmlnYXRvci54ci5yZXF1ZXN0U2Vzc2lvbih0eXBlLCBvcHRpb25zKS50aGVuKChzZXNzaW9uKSA9PiB7XG4gICAgICAgICAgICB0aGlzLl9vblNlc3Npb25TdGFydChzZXNzaW9uLCBzcGFjZVR5cGUsIGNhbGxiYWNrKTtcbiAgICAgICAgfSkuY2F0Y2goKGV4KSA9PiB7XG4gICAgICAgICAgICB0aGlzLl9jYW1lcmEuY2FtZXJhLnhyID0gbnVsbDtcbiAgICAgICAgICAgIHRoaXMuX2NhbWVyYSA9IG51bGw7XG4gICAgICAgICAgICB0aGlzLl90eXBlID0gbnVsbDtcbiAgICAgICAgICAgIHRoaXMuX3NwYWNlVHlwZSA9IG51bGw7XG5cbiAgICAgICAgICAgIGlmIChjYWxsYmFjaykgY2FsbGJhY2soZXgpO1xuICAgICAgICAgICAgdGhpcy5maXJlKCdlcnJvcicsIGV4KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQXR0ZW1wdHMgdG8gZW5kIFhSIHNlc3Npb24gYW5kIG9wdGlvbmFsbHkgZmlyZXMgY2FsbGJhY2sgd2hlbiBzZXNzaW9uIGlzIGVuZGVkIG9yIGZhaWxlZCB0b1xuICAgICAqIGVuZC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7WHJFcnJvckNhbGxiYWNrfSBbY2FsbGJhY2tdIC0gT3B0aW9uYWwgY2FsbGJhY2sgZnVuY3Rpb24gY2FsbGVkIG9uY2Ugc2Vzc2lvbiBpc1xuICAgICAqIHN0YXJ0ZWQuIFRoZSBjYWxsYmFjayBoYXMgb25lIGFyZ3VtZW50IEVycm9yIC0gaXQgaXMgbnVsbCBpZiBzdWNjZXNzZnVsbHkgc3RhcnRlZCBYUlxuICAgICAqIHNlc3Npb24uXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBhcHAua2V5Ym9hcmQub24oJ2tleWRvd24nLCBmdW5jdGlvbiAoZXZ0KSB7XG4gICAgICogICAgIGlmIChldnQua2V5ID09PSBwYy5LRVlfRVNDQVBFICYmIGFwcC54ci5hY3RpdmUpIHtcbiAgICAgKiAgICAgICAgIGFwcC54ci5lbmQoKTtcbiAgICAgKiAgICAgfVxuICAgICAqIH0pO1xuICAgICAqL1xuICAgIGVuZChjYWxsYmFjaykge1xuICAgICAgICBpZiAoIXRoaXMuX3Nlc3Npb24pIHtcbiAgICAgICAgICAgIGlmIChjYWxsYmFjaykgY2FsbGJhY2sobmV3IEVycm9yKCdYUiBTZXNzaW9uIGlzIG5vdCBpbml0aWFsaXplZCcpKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChjYWxsYmFjaykgdGhpcy5vbmNlKCdlbmQnLCBjYWxsYmFjayk7XG5cbiAgICAgICAgdGhpcy5fc2Vzc2lvbi5lbmQoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDaGVjayBpZiBzcGVjaWZpYyB0eXBlIG9mIHNlc3Npb24gaXMgYXZhaWxhYmxlLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IHR5cGUgLSBTZXNzaW9uIHR5cGUuIENhbiBiZSBvbmUgb2YgdGhlIGZvbGxvd2luZzpcbiAgICAgKlxuICAgICAqIC0ge0BsaW5rIFhSVFlQRV9JTkxJTkV9OiBJbmxpbmUgLSBhbHdheXMgYXZhaWxhYmxlIHR5cGUgb2Ygc2Vzc2lvbi4gSXQgaGFzIGxpbWl0ZWQgZmVhdHVyZXNcbiAgICAgKiBhdmFpbGFiaWxpdHkgYW5kIGlzIHJlbmRlcmVkIGludG8gSFRNTCBlbGVtZW50LlxuICAgICAqIC0ge0BsaW5rIFhSVFlQRV9WUn06IEltbWVyc2l2ZSBWUiAtIHNlc3Npb24gdGhhdCBwcm92aWRlcyBleGNsdXNpdmUgYWNjZXNzIHRvIFZSIGRldmljZSB3aXRoXG4gICAgICogYmVzdCBhdmFpbGFibGUgdHJhY2tpbmcgZmVhdHVyZXMuXG4gICAgICogLSB7QGxpbmsgWFJUWVBFX0FSfTogSW1tZXJzaXZlIEFSIC0gc2Vzc2lvbiB0aGF0IHByb3ZpZGVzIGV4Y2x1c2l2ZSBhY2Nlc3MgdG8gVlIvQVIgZGV2aWNlXG4gICAgICogdGhhdCBpcyBpbnRlbmRlZCB0byBiZSBibGVuZGVkIHdpdGggcmVhbC13b3JsZCBlbnZpcm9ubWVudC5cbiAgICAgKlxuICAgICAqIEBleGFtcGxlXG4gICAgICogaWYgKGFwcC54ci5pc0F2YWlsYWJsZShwYy5YUlRZUEVfVlIpKSB7XG4gICAgICogICAgIC8vIFZSIGlzIGF2YWlsYWJsZVxuICAgICAqIH1cbiAgICAgKiBAcmV0dXJucyB7Ym9vbGVhbn0gVHJ1ZSBpZiBzcGVjaWZpZWQgc2Vzc2lvbiB0eXBlIGlzIGF2YWlsYWJsZS5cbiAgICAgKi9cbiAgICBpc0F2YWlsYWJsZSh0eXBlKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hdmFpbGFibGVbdHlwZV07XG4gICAgfVxuXG4gICAgLyoqIEBwcml2YXRlICovXG4gICAgX2RldmljZUF2YWlsYWJpbGl0eUNoZWNrKCkge1xuICAgICAgICBmb3IgKGNvbnN0IGtleSBpbiB0aGlzLl9hdmFpbGFibGUpIHtcbiAgICAgICAgICAgIHRoaXMuX3Nlc3Npb25TdXBwb3J0Q2hlY2soa2V5KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSB0eXBlIC0gU2Vzc2lvbiB0eXBlLlxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX3Nlc3Npb25TdXBwb3J0Q2hlY2sodHlwZSkge1xuICAgICAgICBuYXZpZ2F0b3IueHIuaXNTZXNzaW9uU3VwcG9ydGVkKHR5cGUpLnRoZW4oKGF2YWlsYWJsZSkgPT4ge1xuICAgICAgICAgICAgaWYgKHRoaXMuX2F2YWlsYWJsZVt0eXBlXSA9PT0gYXZhaWxhYmxlKVxuICAgICAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICAgICAgdGhpcy5fYXZhaWxhYmxlW3R5cGVdID0gYXZhaWxhYmxlO1xuICAgICAgICAgICAgdGhpcy5maXJlKCdhdmFpbGFibGUnLCB0eXBlLCBhdmFpbGFibGUpO1xuICAgICAgICAgICAgdGhpcy5maXJlKCdhdmFpbGFibGU6JyArIHR5cGUsIGF2YWlsYWJsZSk7XG4gICAgICAgIH0pLmNhdGNoKChleCkgPT4ge1xuICAgICAgICAgICAgdGhpcy5maXJlKCdlcnJvcicsIGV4KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtYUlNlc3Npb259IHNlc3Npb24gLSBYUiBzZXNzaW9uLlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBzcGFjZVR5cGUgLSBTcGFjZSB0eXBlIHRvIHJlcXVlc3QgZm9yIHRoZSBzZXNzaW9uLlxuICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIC0gQ2FsbGJhY2sgdG8gY2FsbCB3aGVuIHNlc3Npb24gaXMgc3RhcnRlZC5cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9vblNlc3Npb25TdGFydChzZXNzaW9uLCBzcGFjZVR5cGUsIGNhbGxiYWNrKSB7XG4gICAgICAgIGxldCBmYWlsZWQgPSBmYWxzZTtcblxuICAgICAgICB0aGlzLl9zZXNzaW9uID0gc2Vzc2lvbjtcblxuICAgICAgICBjb25zdCBvblZpc2liaWxpdHlDaGFuZ2UgPSAoKSA9PiB7XG4gICAgICAgICAgICB0aGlzLmZpcmUoJ3Zpc2liaWxpdHk6Y2hhbmdlJywgc2Vzc2lvbi52aXNpYmlsaXR5U3RhdGUpO1xuICAgICAgICB9O1xuXG4gICAgICAgIGNvbnN0IG9uQ2xpcFBsYW5lc0NoYW5nZSA9ICgpID0+IHtcbiAgICAgICAgICAgIHRoaXMuX3NldENsaXBQbGFuZXModGhpcy5fY2FtZXJhLm5lYXJDbGlwLCB0aGlzLl9jYW1lcmEuZmFyQ2xpcCk7XG4gICAgICAgIH07XG5cbiAgICAgICAgLy8gY2xlYW4gdXAgb25jZSBzZXNzaW9uIGlzIGVuZGVkXG4gICAgICAgIGNvbnN0IG9uRW5kID0gKCkgPT4ge1xuICAgICAgICAgICAgaWYgKHRoaXMuX2NhbWVyYSkge1xuICAgICAgICAgICAgICAgIHRoaXMuX2NhbWVyYS5vZmYoJ3NldF9uZWFyQ2xpcCcsIG9uQ2xpcFBsYW5lc0NoYW5nZSk7XG4gICAgICAgICAgICAgICAgdGhpcy5fY2FtZXJhLm9mZignc2V0X2ZhckNsaXAnLCBvbkNsaXBQbGFuZXNDaGFuZ2UpO1xuICAgICAgICAgICAgICAgIHRoaXMuX2NhbWVyYS5jYW1lcmEueHIgPSBudWxsO1xuICAgICAgICAgICAgICAgIHRoaXMuX2NhbWVyYSA9IG51bGw7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHNlc3Npb24ucmVtb3ZlRXZlbnRMaXN0ZW5lcignZW5kJywgb25FbmQpO1xuICAgICAgICAgICAgc2Vzc2lvbi5yZW1vdmVFdmVudExpc3RlbmVyKCd2aXNpYmlsaXR5Y2hhbmdlJywgb25WaXNpYmlsaXR5Q2hhbmdlKTtcblxuICAgICAgICAgICAgaWYgKCFmYWlsZWQpIHRoaXMuZmlyZSgnZW5kJyk7XG5cbiAgICAgICAgICAgIHRoaXMuX3Nlc3Npb24gPSBudWxsO1xuICAgICAgICAgICAgdGhpcy5fcmVmZXJlbmNlU3BhY2UgPSBudWxsO1xuICAgICAgICAgICAgdGhpcy52aWV3cyA9IFtdO1xuICAgICAgICAgICAgdGhpcy5fd2lkdGggPSAwO1xuICAgICAgICAgICAgdGhpcy5faGVpZ2h0ID0gMDtcbiAgICAgICAgICAgIHRoaXMuX3R5cGUgPSBudWxsO1xuICAgICAgICAgICAgdGhpcy5fc3BhY2VUeXBlID0gbnVsbDtcblxuICAgICAgICAgICAgLy8gb2xkIHJlcXVlc3RBbmltYXRpb25GcmFtZSB3aWxsIG5ldmVyIGJlIHRyaWdnZXJlZCxcbiAgICAgICAgICAgIC8vIHNvIHF1ZXVlIHVwIG5ldyB0aWNrXG4gICAgICAgICAgICB0aGlzLmFwcC50aWNrKCk7XG4gICAgICAgIH07XG5cbiAgICAgICAgc2Vzc2lvbi5hZGRFdmVudExpc3RlbmVyKCdlbmQnLCBvbkVuZCk7XG4gICAgICAgIHNlc3Npb24uYWRkRXZlbnRMaXN0ZW5lcigndmlzaWJpbGl0eWNoYW5nZScsIG9uVmlzaWJpbGl0eUNoYW5nZSk7XG5cbiAgICAgICAgdGhpcy5fY2FtZXJhLm9uKCdzZXRfbmVhckNsaXAnLCBvbkNsaXBQbGFuZXNDaGFuZ2UpO1xuICAgICAgICB0aGlzLl9jYW1lcmEub24oJ3NldF9mYXJDbGlwJywgb25DbGlwUGxhbmVzQ2hhbmdlKTtcblxuICAgICAgICAvLyBBIGZyYW1lYnVmZmVyU2NhbGVGYWN0b3Igc2NhbGUgb2YgMSBpcyB0aGUgZnVsbCByZXNvbHV0aW9uIG9mIHRoZSBkaXNwbGF5XG4gICAgICAgIC8vIHNvIHdlIG5lZWQgdG8gY2FsY3VsYXRlIHRoaXMgYmFzZWQgb24gZGV2aWNlUGl4ZWxSYXRpbyBvZiB0aGUgZGlzbGF5IGFuZCB3aGF0XG4gICAgICAgIC8vIHdlJ3ZlIHNldCB0aGlzIGluIHRoZSBncmFwaGljcyBkZXZpY2VcbiAgICAgICAgRGVidWcuYXNzZXJ0KHdpbmRvdywgJ3dpbmRvdyBpcyBuZWVkZWQgdG8gc2NhbGUgdGhlIFhSIGZyYW1lYnVmZmVyLiBBcmUgeW91IHJ1bm5pbmcgWFIgaGVhZGxlc3M/Jyk7XG4gICAgICAgIGNvbnN0IGZyYW1lYnVmZmVyU2NhbGVGYWN0b3IgPSB0aGlzLmFwcC5ncmFwaGljc0RldmljZS5tYXhQaXhlbFJhdGlvIC8gd2luZG93LmRldmljZVBpeGVsUmF0aW87XG5cbiAgICAgICAgdGhpcy5fYmFzZUxheWVyID0gbmV3IFhSV2ViR0xMYXllcihzZXNzaW9uLCB0aGlzLmFwcC5ncmFwaGljc0RldmljZS5nbCwge1xuICAgICAgICAgICAgYWxwaGE6IHRydWUsXG4gICAgICAgICAgICBkZXB0aDogdHJ1ZSxcbiAgICAgICAgICAgIHN0ZW5jaWw6IHRydWUsXG4gICAgICAgICAgICBmcmFtZWJ1ZmZlclNjYWxlRmFjdG9yOiBmcmFtZWJ1ZmZlclNjYWxlRmFjdG9yLFxuXG4gICAgICAgICAgICAvLyByZXF1ZXN0IGEgc2luZ2xlLXNhbXBsZWQgYnVmZmVyLiBXZSBhbGxvY2F0ZSBtdWx0aS1zYW1wbGVkIGJ1ZmZlciBpbnRlcm5hbGx5IGFuZCByZXNvbHZlIHRvIHRoaXMgYnVmZmVyLlxuICAgICAgICAgICAgYW50aWFsaWFzOiBmYWxzZVxuICAgICAgICB9KTtcblxuICAgICAgICBzZXNzaW9uLnVwZGF0ZVJlbmRlclN0YXRlKHtcbiAgICAgICAgICAgIGJhc2VMYXllcjogdGhpcy5fYmFzZUxheWVyLFxuICAgICAgICAgICAgZGVwdGhOZWFyOiB0aGlzLl9kZXB0aE5lYXIsXG4gICAgICAgICAgICBkZXB0aEZhcjogdGhpcy5fZGVwdGhGYXJcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gcmVxdWVzdCByZWZlcmVuY2Ugc3BhY2VcbiAgICAgICAgc2Vzc2lvbi5yZXF1ZXN0UmVmZXJlbmNlU3BhY2Uoc3BhY2VUeXBlKS50aGVuKChyZWZlcmVuY2VTcGFjZSkgPT4ge1xuICAgICAgICAgICAgdGhpcy5fcmVmZXJlbmNlU3BhY2UgPSByZWZlcmVuY2VTcGFjZTtcblxuICAgICAgICAgICAgLy8gb2xkIHJlcXVlc3RBbmltYXRpb25GcmFtZSB3aWxsIG5ldmVyIGJlIHRyaWdnZXJlZCxcbiAgICAgICAgICAgIC8vIHNvIHF1ZXVlIHVwIG5ldyB0aWNrXG4gICAgICAgICAgICB0aGlzLmFwcC50aWNrKCk7XG5cbiAgICAgICAgICAgIGlmIChjYWxsYmFjaykgY2FsbGJhY2sobnVsbCk7XG4gICAgICAgICAgICB0aGlzLmZpcmUoJ3N0YXJ0Jyk7XG4gICAgICAgIH0pLmNhdGNoKChleCkgPT4ge1xuICAgICAgICAgICAgZmFpbGVkID0gdHJ1ZTtcbiAgICAgICAgICAgIHNlc3Npb24uZW5kKCk7XG4gICAgICAgICAgICBpZiAoY2FsbGJhY2spIGNhbGxiYWNrKGV4KTtcbiAgICAgICAgICAgIHRoaXMuZmlyZSgnZXJyb3InLCBleCk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBuZWFyIC0gTmVhciBwbGFuZSBkaXN0YW5jZS5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gZmFyIC0gRmFyIHBsYW5lIGRpc3RhbmNlLlxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX3NldENsaXBQbGFuZXMobmVhciwgZmFyKSB7XG4gICAgICAgIGlmICh0aGlzLl9kZXB0aE5lYXIgPT09IG5lYXIgJiYgdGhpcy5fZGVwdGhGYXIgPT09IGZhcilcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICB0aGlzLl9kZXB0aE5lYXIgPSBuZWFyO1xuICAgICAgICB0aGlzLl9kZXB0aEZhciA9IGZhcjtcblxuICAgICAgICBpZiAoIXRoaXMuX3Nlc3Npb24pXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgLy8gaWYgc2Vzc2lvbiBpcyBhdmFpbGFibGUsXG4gICAgICAgIC8vIHF1ZXVlIHVwIHJlbmRlciBzdGF0ZSB1cGRhdGVcbiAgICAgICAgdGhpcy5fc2Vzc2lvbi51cGRhdGVSZW5kZXJTdGF0ZSh7XG4gICAgICAgICAgICBkZXB0aE5lYXI6IHRoaXMuX2RlcHRoTmVhcixcbiAgICAgICAgICAgIGRlcHRoRmFyOiB0aGlzLl9kZXB0aEZhclxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0geyp9IGZyYW1lIC0gWFJGcmFtZSBmcm9tIHJlcXVlc3RBbmltYXRpb25GcmFtZSBjYWxsYmFjay5cbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtib29sZWFufSBUcnVlIGlmIHVwZGF0ZSB3YXMgc3VjY2Vzc2Z1bCwgZmFsc2Ugb3RoZXJ3aXNlLlxuICAgICAqIEBpZ25vcmVcbiAgICAgKi9cbiAgICB1cGRhdGUoZnJhbWUpIHtcbiAgICAgICAgaWYgKCF0aGlzLl9zZXNzaW9uKSByZXR1cm4gZmFsc2U7XG5cbiAgICAgICAgLy8gY2FudmFzIHJlc29sdXRpb24gc2hvdWxkIGJlIHNldCBvbiBmaXJzdCBmcmFtZSBhdmFpbGFiaWxpdHkgb3IgcmVzb2x1dGlvbiBjaGFuZ2VzXG4gICAgICAgIGNvbnN0IHdpZHRoID0gZnJhbWUuc2Vzc2lvbi5yZW5kZXJTdGF0ZS5iYXNlTGF5ZXIuZnJhbWVidWZmZXJXaWR0aDtcbiAgICAgICAgY29uc3QgaGVpZ2h0ID0gZnJhbWUuc2Vzc2lvbi5yZW5kZXJTdGF0ZS5iYXNlTGF5ZXIuZnJhbWVidWZmZXJIZWlnaHQ7XG4gICAgICAgIGlmICh0aGlzLl93aWR0aCAhPT0gd2lkdGggfHwgdGhpcy5faGVpZ2h0ICE9PSBoZWlnaHQpIHtcbiAgICAgICAgICAgIHRoaXMuX3dpZHRoID0gd2lkdGg7XG4gICAgICAgICAgICB0aGlzLl9oZWlnaHQgPSBoZWlnaHQ7XG4gICAgICAgICAgICB0aGlzLmFwcC5ncmFwaGljc0RldmljZS5zZXRSZXNvbHV0aW9uKHdpZHRoLCBoZWlnaHQpO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgcG9zZSA9IGZyYW1lLmdldFZpZXdlclBvc2UodGhpcy5fcmVmZXJlbmNlU3BhY2UpO1xuXG4gICAgICAgIGlmICghcG9zZSkgcmV0dXJuIGZhbHNlO1xuXG4gICAgICAgIGNvbnN0IGxlbmd0aE9sZCA9IHRoaXMudmlld3MubGVuZ3RoO1xuICAgICAgICBjb25zdCBsZW5ndGhOZXcgPSBwb3NlLnZpZXdzLmxlbmd0aDtcblxuICAgICAgICB3aGlsZSAobGVuZ3RoTmV3ID4gdGhpcy52aWV3cy5sZW5ndGgpIHtcbiAgICAgICAgICAgIGxldCB2aWV3ID0gdGhpcy52aWV3c1Bvb2wucG9wKCk7XG4gICAgICAgICAgICBpZiAoIXZpZXcpIHtcbiAgICAgICAgICAgICAgICB2aWV3ID0ge1xuICAgICAgICAgICAgICAgICAgICB2aWV3cG9ydDogbmV3IFZlYzQoKSxcbiAgICAgICAgICAgICAgICAgICAgcHJvak1hdDogbmV3IE1hdDQoKSxcbiAgICAgICAgICAgICAgICAgICAgdmlld01hdDogbmV3IE1hdDQoKSxcbiAgICAgICAgICAgICAgICAgICAgdmlld09mZk1hdDogbmV3IE1hdDQoKSxcbiAgICAgICAgICAgICAgICAgICAgdmlld0ludk1hdDogbmV3IE1hdDQoKSxcbiAgICAgICAgICAgICAgICAgICAgdmlld0ludk9mZk1hdDogbmV3IE1hdDQoKSxcbiAgICAgICAgICAgICAgICAgICAgcHJvalZpZXdPZmZNYXQ6IG5ldyBNYXQ0KCksXG4gICAgICAgICAgICAgICAgICAgIHZpZXdNYXQzOiBuZXcgTWF0MygpLFxuICAgICAgICAgICAgICAgICAgICBwb3NpdGlvbjogbmV3IEZsb2F0MzJBcnJheSgzKSxcbiAgICAgICAgICAgICAgICAgICAgcm90YXRpb246IG5ldyBRdWF0KClcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLnZpZXdzLnB1c2godmlldyk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gcmVtb3ZlIHZpZXdzIGZyb20gbGlzdCBpbnRvIHBvb2xcbiAgICAgICAgd2hpbGUgKGxlbmd0aE5ldyA8IHRoaXMudmlld3MubGVuZ3RoKSB7XG4gICAgICAgICAgICB0aGlzLnZpZXdzUG9vbC5wdXNoKHRoaXMudmlld3MucG9wKCkpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gcmVzZXQgcG9zaXRpb25cbiAgICAgICAgY29uc3QgcG9zZVBvc2l0aW9uID0gcG9zZS50cmFuc2Zvcm0ucG9zaXRpb247XG4gICAgICAgIGNvbnN0IHBvc2VPcmllbnRhdGlvbiA9IHBvc2UudHJhbnNmb3JtLm9yaWVudGF0aW9uO1xuICAgICAgICB0aGlzLl9sb2NhbFBvc2l0aW9uLnNldChwb3NlUG9zaXRpb24ueCwgcG9zZVBvc2l0aW9uLnksIHBvc2VQb3NpdGlvbi56KTtcbiAgICAgICAgdGhpcy5fbG9jYWxSb3RhdGlvbi5zZXQocG9zZU9yaWVudGF0aW9uLngsIHBvc2VPcmllbnRhdGlvbi55LCBwb3NlT3JpZW50YXRpb24ueiwgcG9zZU9yaWVudGF0aW9uLncpO1xuXG4gICAgICAgIGNvbnN0IGxheWVyID0gZnJhbWUuc2Vzc2lvbi5yZW5kZXJTdGF0ZS5iYXNlTGF5ZXI7XG5cbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBwb3NlLnZpZXdzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAvLyBmb3IgZWFjaCB2aWV3LCBjYWxjdWxhdGUgbWF0cmljZXNcbiAgICAgICAgICAgIGNvbnN0IHZpZXdSYXcgPSBwb3NlLnZpZXdzW2ldO1xuICAgICAgICAgICAgY29uc3QgdmlldyA9IHRoaXMudmlld3NbaV07XG4gICAgICAgICAgICBjb25zdCB2aWV3cG9ydCA9IGxheWVyLmdldFZpZXdwb3J0KHZpZXdSYXcpO1xuXG4gICAgICAgICAgICB2aWV3LnZpZXdwb3J0LnggPSB2aWV3cG9ydC54O1xuICAgICAgICAgICAgdmlldy52aWV3cG9ydC55ID0gdmlld3BvcnQueTtcbiAgICAgICAgICAgIHZpZXcudmlld3BvcnQueiA9IHZpZXdwb3J0LndpZHRoO1xuICAgICAgICAgICAgdmlldy52aWV3cG9ydC53ID0gdmlld3BvcnQuaGVpZ2h0O1xuXG4gICAgICAgICAgICB2aWV3LnByb2pNYXQuc2V0KHZpZXdSYXcucHJvamVjdGlvbk1hdHJpeCk7XG4gICAgICAgICAgICB2aWV3LnZpZXdNYXQuc2V0KHZpZXdSYXcudHJhbnNmb3JtLmludmVyc2UubWF0cml4KTtcbiAgICAgICAgICAgIHZpZXcudmlld0ludk1hdC5zZXQodmlld1Jhdy50cmFuc2Zvcm0ubWF0cml4KTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHVwZGF0ZSB0aGUgY2FtZXJhIGZvdiBwcm9wZXJ0aWVzIG9ubHkgd2hlbiB3ZSBoYWQgMCB2aWV3c1xuICAgICAgICBpZiAobGVuZ3RoT2xkID09PSAwICYmIHRoaXMudmlld3MubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgY29uc3Qgdmlld1Byb2pNYXQgPSBuZXcgTWF0NCgpO1xuICAgICAgICAgICAgY29uc3QgdmlldyA9IHRoaXMudmlld3NbMF07XG5cbiAgICAgICAgICAgIHZpZXdQcm9qTWF0LmNvcHkodmlldy5wcm9qTWF0KTtcbiAgICAgICAgICAgIGNvbnN0IGRhdGEgPSB2aWV3UHJvak1hdC5kYXRhO1xuXG4gICAgICAgICAgICBjb25zdCBmb3YgPSAoMi4wICogTWF0aC5hdGFuKDEuMCAvIGRhdGFbNV0pICogMTgwLjApIC8gTWF0aC5QSTtcbiAgICAgICAgICAgIGNvbnN0IGFzcGVjdFJhdGlvID0gZGF0YVs1XSAvIGRhdGFbMF07XG4gICAgICAgICAgICBjb25zdCBmYXJDbGlwID0gZGF0YVsxNF0gLyAoZGF0YVsxMF0gKyAxKTtcbiAgICAgICAgICAgIGNvbnN0IG5lYXJDbGlwID0gZGF0YVsxNF0gLyAoZGF0YVsxMF0gLSAxKTtcbiAgICAgICAgICAgIGNvbnN0IGhvcml6b250YWxGb3YgPSBmYWxzZTtcblxuXG4gICAgICAgICAgICBjb25zdCBjYW1lcmEgPSB0aGlzLl9jYW1lcmEuY2FtZXJhO1xuICAgICAgICAgICAgY2FtZXJhLnNldFhyUHJvcGVydGllcyh7XG4gICAgICAgICAgICAgICAgYXNwZWN0UmF0aW8sXG4gICAgICAgICAgICAgICAgZmFyQ2xpcCxcbiAgICAgICAgICAgICAgICBmb3YsXG4gICAgICAgICAgICAgICAgaG9yaXpvbnRhbEZvdixcbiAgICAgICAgICAgICAgICBuZWFyQ2xpcFxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBwb3NpdGlvbiBhbmQgcm90YXRlIGNhbWVyYSBiYXNlZCBvbiBjYWxjdWxhdGVkIHZlY3RvcnNcbiAgICAgICAgdGhpcy5fY2FtZXJhLmNhbWVyYS5fbm9kZS5zZXRMb2NhbFBvc2l0aW9uKHRoaXMuX2xvY2FsUG9zaXRpb24pO1xuICAgICAgICB0aGlzLl9jYW1lcmEuY2FtZXJhLl9ub2RlLnNldExvY2FsUm90YXRpb24odGhpcy5fbG9jYWxSb3RhdGlvbik7XG5cbiAgICAgICAgdGhpcy5pbnB1dC51cGRhdGUoZnJhbWUpO1xuXG4gICAgICAgIGlmICh0aGlzLl90eXBlID09PSBYUlRZUEVfQVIpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLmhpdFRlc3Quc3VwcG9ydGVkKVxuICAgICAgICAgICAgICAgIHRoaXMuaGl0VGVzdC51cGRhdGUoZnJhbWUpO1xuXG4gICAgICAgICAgICBpZiAodGhpcy5saWdodEVzdGltYXRpb24uc3VwcG9ydGVkKVxuICAgICAgICAgICAgICAgIHRoaXMubGlnaHRFc3RpbWF0aW9uLnVwZGF0ZShmcmFtZSk7XG5cbiAgICAgICAgICAgIGlmICh0aGlzLmRlcHRoU2Vuc2luZy5zdXBwb3J0ZWQpXG4gICAgICAgICAgICAgICAgdGhpcy5kZXB0aFNlbnNpbmcudXBkYXRlKGZyYW1lLCBwb3NlICYmIHBvc2Uudmlld3NbMF0pO1xuXG4gICAgICAgICAgICBpZiAodGhpcy5pbWFnZVRyYWNraW5nLnN1cHBvcnRlZClcbiAgICAgICAgICAgICAgICB0aGlzLmltYWdlVHJhY2tpbmcudXBkYXRlKGZyYW1lKTtcblxuICAgICAgICAgICAgaWYgKHRoaXMuYW5jaG9ycy5zdXBwb3J0ZWQpXG4gICAgICAgICAgICAgICAgdGhpcy5hbmNob3JzLnVwZGF0ZShmcmFtZSk7XG5cbiAgICAgICAgICAgIGlmICh0aGlzLnBsYW5lRGV0ZWN0aW9uLnN1cHBvcnRlZClcbiAgICAgICAgICAgICAgICB0aGlzLnBsYW5lRGV0ZWN0aW9uLnVwZGF0ZShmcmFtZSk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmZpcmUoJ3VwZGF0ZScsIGZyYW1lKTtcblxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUcnVlIGlmIFhSIGlzIHN1cHBvcnRlZC5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAqL1xuICAgIGdldCBzdXBwb3J0ZWQoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9zdXBwb3J0ZWQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVHJ1ZSBpZiBYUiBzZXNzaW9uIGlzIHJ1bm5pbmcuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICAgKi9cbiAgICBnZXQgYWN0aXZlKCkge1xuICAgICAgICByZXR1cm4gISF0aGlzLl9zZXNzaW9uO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdHlwZSBvZiBjdXJyZW50bHkgcnVubmluZyBYUiBzZXNzaW9uIG9yIG51bGwgaWYgbm8gc2Vzc2lvbiBpcyBydW5uaW5nLiBDYW4gYmUgYW55IG9mXG4gICAgICogWFJUWVBFXyouXG4gICAgICpcbiAgICAgKiBAdHlwZSB7c3RyaW5nfG51bGx9XG4gICAgICovXG4gICAgZ2V0IHR5cGUoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl90eXBlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgcmVmZXJlbmNlIHNwYWNlIHR5cGUgb2YgY3VycmVudGx5IHJ1bm5pbmcgWFIgc2Vzc2lvbiBvciBudWxsIGlmIG5vIHNlc3Npb24gaXNcbiAgICAgKiBydW5uaW5nLiBDYW4gYmUgYW55IG9mIFhSU1BBQ0VfKi5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtzdHJpbmd8bnVsbH1cbiAgICAgKi9cbiAgICBnZXQgc3BhY2VUeXBlKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fc3BhY2VUeXBlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFByb3ZpZGVzIGFjY2VzcyB0byBYUlNlc3Npb24gb2YgV2ViWFIuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7b2JqZWN0fG51bGx9XG4gICAgICovXG4gICAgZ2V0IHNlc3Npb24oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9zZXNzaW9uO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEFjdGl2ZSBjYW1lcmEgZm9yIHdoaWNoIFhSIHNlc3Npb24gaXMgcnVubmluZyBvciBudWxsLlxuICAgICAqXG4gICAgICogQHR5cGUge2ltcG9ydCgnLi4vZW50aXR5LmpzJykuRW50aXR5fG51bGx9XG4gICAgICovXG4gICAgZ2V0IGNhbWVyYSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2NhbWVyYSA/IHRoaXMuX2NhbWVyYS5lbnRpdHkgOiBudWxsO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEluZGljYXRlcyB3aGV0aGVyIFdlYlhSIGNvbnRlbnQgaXMgY3VycmVudGx5IHZpc2libGUgdG8gdGhlIHVzZXIsIGFuZCBpZiBpdCBpcywgd2hldGhlciBpdCdzXG4gICAgICogdGhlIHByaW1hcnkgZm9jdXMuIENhbiBiZSAnaGlkZGVuJywgJ3Zpc2libGUnIG9yICd2aXNpYmxlLWJsdXJyZWQnLlxuICAgICAqXG4gICAgICogQHR5cGUge3N0cmluZ31cbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgZ2V0IHZpc2liaWxpdHlTdGF0ZSgpIHtcbiAgICAgICAgaWYgKCF0aGlzLl9zZXNzaW9uKVxuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG5cbiAgICAgICAgcmV0dXJuIHRoaXMuX3Nlc3Npb24udmlzaWJpbGl0eVN0YXRlO1xuICAgIH1cbn1cblxuZXhwb3J0IHsgWHJNYW5hZ2VyIH07XG4iXSwibmFtZXMiOlsiWHJNYW5hZ2VyIiwiRXZlbnRIYW5kbGVyIiwiY29uc3RydWN0b3IiLCJhcHAiLCJfc3VwcG9ydGVkIiwicGxhdGZvcm0iLCJicm93c2VyIiwibmF2aWdhdG9yIiwieHIiLCJfYXZhaWxhYmxlIiwiX3R5cGUiLCJfc3BhY2VUeXBlIiwiX3Nlc3Npb24iLCJfYmFzZUxheWVyIiwiX3JlZmVyZW5jZVNwYWNlIiwiZGVwdGhTZW5zaW5nIiwiZG9tT3ZlcmxheSIsImhpdFRlc3QiLCJpbWFnZVRyYWNraW5nIiwicGxhbmVEZXRlY3Rpb24iLCJpbnB1dCIsImxpZ2h0RXN0aW1hdGlvbiIsIl9jYW1lcmEiLCJ2aWV3cyIsInZpZXdzUG9vbCIsIl9sb2NhbFBvc2l0aW9uIiwiVmVjMyIsIl9sb2NhbFJvdGF0aW9uIiwiUXVhdCIsIl9kZXB0aE5lYXIiLCJfZGVwdGhGYXIiLCJfd2lkdGgiLCJfaGVpZ2h0IiwiWFJUWVBFX0lOTElORSIsIlhSVFlQRV9WUiIsIlhSVFlQRV9BUiIsIlhyRGVwdGhTZW5zaW5nIiwiWHJEb21PdmVybGF5IiwiWHJIaXRUZXN0IiwiWHJJbWFnZVRyYWNraW5nIiwiWHJQbGFuZURldGVjdGlvbiIsIlhySW5wdXQiLCJYckxpZ2h0RXN0aW1hdGlvbiIsImFuY2hvcnMiLCJYckFuY2hvcnMiLCJhZGRFdmVudExpc3RlbmVyIiwiX2RldmljZUF2YWlsYWJpbGl0eUNoZWNrIiwiZGVzdHJveSIsInN0YXJ0IiwiY2FtZXJhIiwidHlwZSIsInNwYWNlVHlwZSIsIm9wdGlvbnMiLCJjYWxsYmFjayIsIkVycm9yIiwiX3NldENsaXBQbGFuZXMiLCJuZWFyQ2xpcCIsImZhckNsaXAiLCJvcHRzIiwicmVxdWlyZWRGZWF0dXJlcyIsIm9wdGlvbmFsRmVhdHVyZXMiLCJwdXNoIiwic3VwcG9ydGVkIiwicm9vdCIsInVzYWdlUHJlZmVyZW5jZSIsIlhSREVQVEhTRU5TSU5HVVNBR0VfQ1BVIiwiZGF0YUZvcm1hdFByZWZlcmVuY2UiLCJYUkRFUFRIU0VOU0lOR0ZPUk1BVF9MOEE4IiwiaW5kIiwiaW5kZXhPZiIsInNwbGljZSIsInVuc2hpZnQiLCJjb25jYXQiLCJpbWFnZXMiLCJsZW5ndGgiLCJwcmVwYXJlSW1hZ2VzIiwiZXJyIiwidHJhY2tlZEltYWdlcyIsImZpcmUiLCJfb25TdGFydE9wdGlvbnNSZWFkeSIsInJlcXVlc3RTZXNzaW9uIiwidGhlbiIsInNlc3Npb24iLCJfb25TZXNzaW9uU3RhcnQiLCJjYXRjaCIsImV4IiwiZW5kIiwib25jZSIsImlzQXZhaWxhYmxlIiwia2V5IiwiX3Nlc3Npb25TdXBwb3J0Q2hlY2siLCJpc1Nlc3Npb25TdXBwb3J0ZWQiLCJhdmFpbGFibGUiLCJmYWlsZWQiLCJvblZpc2liaWxpdHlDaGFuZ2UiLCJ2aXNpYmlsaXR5U3RhdGUiLCJvbkNsaXBQbGFuZXNDaGFuZ2UiLCJvbkVuZCIsIm9mZiIsInJlbW92ZUV2ZW50TGlzdGVuZXIiLCJ0aWNrIiwib24iLCJEZWJ1ZyIsImFzc2VydCIsIndpbmRvdyIsImZyYW1lYnVmZmVyU2NhbGVGYWN0b3IiLCJncmFwaGljc0RldmljZSIsIm1heFBpeGVsUmF0aW8iLCJkZXZpY2VQaXhlbFJhdGlvIiwiWFJXZWJHTExheWVyIiwiZ2wiLCJhbHBoYSIsImRlcHRoIiwic3RlbmNpbCIsImFudGlhbGlhcyIsInVwZGF0ZVJlbmRlclN0YXRlIiwiYmFzZUxheWVyIiwiZGVwdGhOZWFyIiwiZGVwdGhGYXIiLCJyZXF1ZXN0UmVmZXJlbmNlU3BhY2UiLCJyZWZlcmVuY2VTcGFjZSIsIm5lYXIiLCJmYXIiLCJ1cGRhdGUiLCJmcmFtZSIsIndpZHRoIiwicmVuZGVyU3RhdGUiLCJmcmFtZWJ1ZmZlcldpZHRoIiwiaGVpZ2h0IiwiZnJhbWVidWZmZXJIZWlnaHQiLCJzZXRSZXNvbHV0aW9uIiwicG9zZSIsImdldFZpZXdlclBvc2UiLCJsZW5ndGhPbGQiLCJsZW5ndGhOZXciLCJ2aWV3IiwicG9wIiwidmlld3BvcnQiLCJWZWM0IiwicHJvak1hdCIsIk1hdDQiLCJ2aWV3TWF0Iiwidmlld09mZk1hdCIsInZpZXdJbnZNYXQiLCJ2aWV3SW52T2ZmTWF0IiwicHJvalZpZXdPZmZNYXQiLCJ2aWV3TWF0MyIsIk1hdDMiLCJwb3NpdGlvbiIsIkZsb2F0MzJBcnJheSIsInJvdGF0aW9uIiwicG9zZVBvc2l0aW9uIiwidHJhbnNmb3JtIiwicG9zZU9yaWVudGF0aW9uIiwib3JpZW50YXRpb24iLCJzZXQiLCJ4IiwieSIsInoiLCJ3IiwibGF5ZXIiLCJpIiwidmlld1JhdyIsImdldFZpZXdwb3J0IiwicHJvamVjdGlvbk1hdHJpeCIsImludmVyc2UiLCJtYXRyaXgiLCJ2aWV3UHJvak1hdCIsImNvcHkiLCJkYXRhIiwiZm92IiwiTWF0aCIsImF0YW4iLCJQSSIsImFzcGVjdFJhdGlvIiwiaG9yaXpvbnRhbEZvdiIsInNldFhyUHJvcGVydGllcyIsIl9ub2RlIiwic2V0TG9jYWxQb3NpdGlvbiIsInNldExvY2FsUm90YXRpb24iLCJhY3RpdmUiLCJlbnRpdHkiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQW9CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsTUFBTUEsU0FBUyxTQUFTQyxZQUFZLENBQUM7QUE4SmpDO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtFQUNJQyxXQUFXQSxDQUFDQyxHQUFHLEVBQUU7QUFDYixJQUFBLEtBQUssRUFBRSxDQUFBO0FBcEtYO0FBQ0o7QUFDQTtBQUNBO0FBSEksSUFBQSxJQUFBLENBSUFBLEdBQUcsR0FBQSxLQUFBLENBQUEsQ0FBQTtBQUVIO0FBQ0o7QUFDQTtBQUNBO0lBSEksSUFJQUMsQ0FBQUEsVUFBVSxHQUFHQyxRQUFR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
