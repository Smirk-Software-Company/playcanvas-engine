import { EventHandler } from '../../core/event-handler.js';
import { Color } from '../../core/math/color.js';
import { Mat4 } from '../../core/math/mat4.js';
import { Quat } from '../../core/math/quat.js';
import { Vec3 } from '../../core/math/vec3.js';
import { XRTYPE_AR } from './constants.js';

const vec3A = new Vec3();
const vec3B = new Vec3();
const mat4A = new Mat4();
const mat4B = new Mat4();

/**
 * Light Estimation provides illumination data from the real world, which is estimated by the
 * underlying AR system. It provides a reflection Cube Map, that represents the reflection
 * estimation from the viewer position. A more simplified approximation of light is provided by L2
 * Spherical Harmonics data. And the most simple level of light estimation is the most prominent
 * directional light, its rotation, intensity and color.
 *
 * @augments EventHandler
 * @category XR
 */
class XrLightEstimation extends EventHandler {
  /**
   * Create a new XrLightEstimation instance.
   *
   * @param {import('./xr-manager.js').XrManager} manager - WebXR Manager.
   * @hideconstructor
   */
  constructor(manager) {
    super();
    /**
     * @type {import('./xr-manager.js').XrManager}
     * @private
     */
    this._manager = void 0;
    /**
     * @type {boolean}
     * @private
     */
    this._supported = false;
    /**
     * @type {boolean}
     * @private
     */
    this._available = false;
    /**
     * @type {boolean}
     * @private
     */
    this._lightProbeRequested = false;
    /**
     * @type {XRLightProbe|null}
     * @private
     */
    this._lightProbe = null;
    /**
     * @type {number}
     * @private
     */
    this._intensity = 0;
    /**
     * @type {Quat}
     * @private
     */
    this._rotation = new Quat();
    /**
     * @type {Color}
     * @private
     */
    this._color = new Color();
    /**
     * @type {Float32Array}
     * @private
     */
    this._sphericalHarmonics = new Float32Array(27);
    this._manager = manager;
    this._manager.on('start', this._onSessionStart, this);
    this._manager.on('end', this._onSessionEnd, this);
  }

  /**
   * Fired when light estimation data becomes available.
   *
   * @event XrLightEstimation#available
   */

  /**
   * Fired when light estimation has failed to start.
   *
   * @event XrLightEstimation#error
   * @param {Error} error - Error object related to failure of light estimation start.
   * @example
   * app.xr.lightEstimation.on('error', function (ex) {
   *     // has failed to start
   * });
   */

  /** @private */
  _onSessionStart() {
    const supported = !!this._manager.session.requestLightProbe;
    if (!supported) return;
    this._supported = true;
  }

  /** @private */
  _onSessionEnd() {
    this._supported = false;
    this._available = false;
    this._lightProbeRequested = false;
    this._lightProbe = null;
  }

  /**
   * Start estimation of illumination data. Availability of such data will come later and an
   * `available` event will be fired. If it failed to start estimation, an `error` event will be
   * fired.
   *
   * @example
   * app.xr.on('start', function () {
   *     if (app.xr.lightEstimation.supported) {
   *         app.xr.lightEstimation.start();
   *     }
   * });
   */
  start() {
    let err;
    if (!this._manager.session) err = new Error('XR session is not running');
    if (!err && this._manager.type !== XRTYPE_AR) err = new Error('XR session type is not AR');
    if (!err && !this._supported) err = new Error('light-estimation is not supported');
    if (!err && this._lightProbe || this._lightProbeRequested) err = new Error('light estimation is already requested');
    if (err) {
      this.fire('error', err);
      return;
    }
    this._lightProbeRequested = true;
    this._manager.session.requestLightProbe().then(lightProbe => {
      const wasRequested = this._lightProbeRequested;
      this._lightProbeRequested = false;
      if (this._manager.active) {
        if (wasRequested) {
          this._lightProbe = lightProbe;
        }
      } else {
        this.fire('error', new Error('XR session is not active'));
      }
    }).catch(ex => {
      this._lightProbeRequested = false;
      this.fire('error', ex);
    });
  }

  /**
   * End estimation of illumination data.
   */
  end() {
    this._lightProbeRequested = false;
    this._lightProbe = null;
    this._available = false;
  }

  /**
   * @param {*} frame - XRFrame from requestAnimationFrame callback.
   * @ignore
   */
  update(frame) {
    if (!this._lightProbe) return;
    const lightEstimate = frame.getLightEstimate(this._lightProbe);
    if (!lightEstimate) return;
    if (!this._available) {
      this._available = true;
      this.fire('available');
    }

    // intensity
    const pli = lightEstimate.primaryLightIntensity;
    this._intensity = Math.max(1.0, Math.max(pli.x, Math.max(pli.y, pli.z)));

    // color
    vec3A.copy(pli).mulScalar(1 / this._intensity);
    this._color.set(vec3A.x, vec3A.y, vec3A.z);

    // rotation
    vec3A.set(0, 0, 0);
    vec3B.copy(lightEstimate.primaryLightDirection);
    mat4A.setLookAt(vec3B, vec3A, Vec3.UP);
    mat4B.setFromAxisAngle(Vec3.RIGHT, 90); // directional light is looking down
    mat4A.mul(mat4B);
    this._rotation.setFromMat4(mat4A);

    // spherical harmonics
    this._sphericalHarmonics.set(lightEstimate.sphericalHarmonicsCoefficients);
  }

  /**
   * True if Light Estimation is supported. This information is available only during an active AR
   * session.
   *
   * @type {boolean}
   */
  get supported() {
    return this._supported;
  }

  /**
   * True if estimated light information is available.
   *
   * @type {boolean}
   * @example
   * if (app.xr.lightEstimation.available) {
   *     entity.light.intensity = app.xr.lightEstimation.intensity;
   * }
   */
  get available() {
    return this._available;
  }

  /**
   * Intensity of what is estimated to be the most prominent directional light. Or null if data
   * is not available.
   *
   * @type {number|null}
   */
  get intensity() {
    return this._available ? this._intensity : null;
  }

  /**
   * Color of what is estimated to be the most prominent directional light. Or null if data is
   * not available.
   *
   * @type {Color|null}
   */
  get color() {
    return this._available ? this._color : null;
  }

  /**
   * Rotation of what is estimated to be the most prominent directional light. Or null if data is
   * not available.
   *
   * @type {Quat|null}
   */
  get rotation() {
    return this._available ? this._rotation : null;
  }

  /**
   * Spherical harmonics coefficients of what is estimated to be the most prominent directional
   * light. Or null if data is not available.
   *
   * @type {Float32Array|null}
   * @ignore
   */
  get sphericalHarmonics() {
    return this._available ? this._sphericalHarmonics : null;
  }
}

export { XrLightEstimation };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoieHItbGlnaHQtZXN0aW1hdGlvbi5qcyIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL2ZyYW1ld29yay94ci94ci1saWdodC1lc3RpbWF0aW9uLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEV2ZW50SGFuZGxlciB9IGZyb20gJy4uLy4uL2NvcmUvZXZlbnQtaGFuZGxlci5qcyc7XG5pbXBvcnQgeyBDb2xvciB9IGZyb20gJy4uLy4uL2NvcmUvbWF0aC9jb2xvci5qcyc7XG5pbXBvcnQgeyBNYXQ0IH0gZnJvbSAnLi4vLi4vY29yZS9tYXRoL21hdDQuanMnO1xuaW1wb3J0IHsgUXVhdCB9IGZyb20gJy4uLy4uL2NvcmUvbWF0aC9xdWF0LmpzJztcbmltcG9ydCB7IFZlYzMgfSBmcm9tICcuLi8uLi9jb3JlL21hdGgvdmVjMy5qcyc7XG5cbmltcG9ydCB7IFhSVFlQRV9BUiB9IGZyb20gJy4vY29uc3RhbnRzLmpzJztcblxuY29uc3QgdmVjM0EgPSBuZXcgVmVjMygpO1xuY29uc3QgdmVjM0IgPSBuZXcgVmVjMygpO1xuY29uc3QgbWF0NEEgPSBuZXcgTWF0NCgpO1xuY29uc3QgbWF0NEIgPSBuZXcgTWF0NCgpO1xuXG4vKipcbiAqIExpZ2h0IEVzdGltYXRpb24gcHJvdmlkZXMgaWxsdW1pbmF0aW9uIGRhdGEgZnJvbSB0aGUgcmVhbCB3b3JsZCwgd2hpY2ggaXMgZXN0aW1hdGVkIGJ5IHRoZVxuICogdW5kZXJseWluZyBBUiBzeXN0ZW0uIEl0IHByb3ZpZGVzIGEgcmVmbGVjdGlvbiBDdWJlIE1hcCwgdGhhdCByZXByZXNlbnRzIHRoZSByZWZsZWN0aW9uXG4gKiBlc3RpbWF0aW9uIGZyb20gdGhlIHZpZXdlciBwb3NpdGlvbi4gQSBtb3JlIHNpbXBsaWZpZWQgYXBwcm94aW1hdGlvbiBvZiBsaWdodCBpcyBwcm92aWRlZCBieSBMMlxuICogU3BoZXJpY2FsIEhhcm1vbmljcyBkYXRhLiBBbmQgdGhlIG1vc3Qgc2ltcGxlIGxldmVsIG9mIGxpZ2h0IGVzdGltYXRpb24gaXMgdGhlIG1vc3QgcHJvbWluZW50XG4gKiBkaXJlY3Rpb25hbCBsaWdodCwgaXRzIHJvdGF0aW9uLCBpbnRlbnNpdHkgYW5kIGNvbG9yLlxuICpcbiAqIEBhdWdtZW50cyBFdmVudEhhbmRsZXJcbiAqIEBjYXRlZ29yeSBYUlxuICovXG5jbGFzcyBYckxpZ2h0RXN0aW1hdGlvbiBleHRlbmRzIEV2ZW50SGFuZGxlciB7XG4gICAgLyoqXG4gICAgICogQHR5cGUge2ltcG9ydCgnLi94ci1tYW5hZ2VyLmpzJykuWHJNYW5hZ2VyfVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX21hbmFnZXI7XG5cbiAgICAvKipcbiAgICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9zdXBwb3J0ZWQgPSBmYWxzZTtcblxuICAgIC8qKlxuICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX2F2YWlsYWJsZSA9IGZhbHNlO1xuXG4gICAgLyoqXG4gICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfbGlnaHRQcm9iZVJlcXVlc3RlZCA9IGZhbHNlO1xuXG4gICAgLyoqXG4gICAgICogQHR5cGUge1hSTGlnaHRQcm9iZXxudWxsfVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX2xpZ2h0UHJvYmUgPSBudWxsO1xuXG4gICAgLyoqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9pbnRlbnNpdHkgPSAwO1xuXG4gICAgLyoqXG4gICAgICogQHR5cGUge1F1YXR9XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfcm90YXRpb24gPSBuZXcgUXVhdCgpO1xuXG4gICAgLyoqXG4gICAgICogQHR5cGUge0NvbG9yfVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX2NvbG9yID0gbmV3IENvbG9yKCk7XG5cbiAgICAvKipcbiAgICAgKiBAdHlwZSB7RmxvYXQzMkFycmF5fVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX3NwaGVyaWNhbEhhcm1vbmljcyA9IG5ldyBGbG9hdDMyQXJyYXkoMjcpO1xuXG4gICAgLyoqXG4gICAgICogQ3JlYXRlIGEgbmV3IFhyTGlnaHRFc3RpbWF0aW9uIGluc3RhbmNlLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4veHItbWFuYWdlci5qcycpLlhyTWFuYWdlcn0gbWFuYWdlciAtIFdlYlhSIE1hbmFnZXIuXG4gICAgICogQGhpZGVjb25zdHJ1Y3RvclxuICAgICAqL1xuICAgIGNvbnN0cnVjdG9yKG1hbmFnZXIpIHtcbiAgICAgICAgc3VwZXIoKTtcblxuICAgICAgICB0aGlzLl9tYW5hZ2VyID0gbWFuYWdlcjtcblxuICAgICAgICB0aGlzLl9tYW5hZ2VyLm9uKCdzdGFydCcsIHRoaXMuX29uU2Vzc2lvblN0YXJ0LCB0aGlzKTtcbiAgICAgICAgdGhpcy5fbWFuYWdlci5vbignZW5kJywgdGhpcy5fb25TZXNzaW9uRW5kLCB0aGlzKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBGaXJlZCB3aGVuIGxpZ2h0IGVzdGltYXRpb24gZGF0YSBiZWNvbWVzIGF2YWlsYWJsZS5cbiAgICAgKlxuICAgICAqIEBldmVudCBYckxpZ2h0RXN0aW1hdGlvbiNhdmFpbGFibGVcbiAgICAgKi9cblxuICAgIC8qKlxuICAgICAqIEZpcmVkIHdoZW4gbGlnaHQgZXN0aW1hdGlvbiBoYXMgZmFpbGVkIHRvIHN0YXJ0LlxuICAgICAqXG4gICAgICogQGV2ZW50IFhyTGlnaHRFc3RpbWF0aW9uI2Vycm9yXG4gICAgICogQHBhcmFtIHtFcnJvcn0gZXJyb3IgLSBFcnJvciBvYmplY3QgcmVsYXRlZCB0byBmYWlsdXJlIG9mIGxpZ2h0IGVzdGltYXRpb24gc3RhcnQuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBhcHAueHIubGlnaHRFc3RpbWF0aW9uLm9uKCdlcnJvcicsIGZ1bmN0aW9uIChleCkge1xuICAgICAqICAgICAvLyBoYXMgZmFpbGVkIHRvIHN0YXJ0XG4gICAgICogfSk7XG4gICAgICovXG5cbiAgICAvKiogQHByaXZhdGUgKi9cbiAgICBfb25TZXNzaW9uU3RhcnQoKSB7XG4gICAgICAgIGNvbnN0IHN1cHBvcnRlZCA9ICEhdGhpcy5fbWFuYWdlci5zZXNzaW9uLnJlcXVlc3RMaWdodFByb2JlO1xuICAgICAgICBpZiAoIXN1cHBvcnRlZCkgcmV0dXJuO1xuICAgICAgICB0aGlzLl9zdXBwb3J0ZWQgPSB0cnVlO1xuICAgIH1cblxuICAgIC8qKiBAcHJpdmF0ZSAqL1xuICAgIF9vblNlc3Npb25FbmQoKSB7XG4gICAgICAgIHRoaXMuX3N1cHBvcnRlZCA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9hdmFpbGFibGUgPSBmYWxzZTtcblxuICAgICAgICB0aGlzLl9saWdodFByb2JlUmVxdWVzdGVkID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX2xpZ2h0UHJvYmUgPSBudWxsO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFN0YXJ0IGVzdGltYXRpb24gb2YgaWxsdW1pbmF0aW9uIGRhdGEuIEF2YWlsYWJpbGl0eSBvZiBzdWNoIGRhdGEgd2lsbCBjb21lIGxhdGVyIGFuZCBhblxuICAgICAqIGBhdmFpbGFibGVgIGV2ZW50IHdpbGwgYmUgZmlyZWQuIElmIGl0IGZhaWxlZCB0byBzdGFydCBlc3RpbWF0aW9uLCBhbiBgZXJyb3JgIGV2ZW50IHdpbGwgYmVcbiAgICAgKiBmaXJlZC5cbiAgICAgKlxuICAgICAqIEBleGFtcGxlXG4gICAgICogYXBwLnhyLm9uKCdzdGFydCcsIGZ1bmN0aW9uICgpIHtcbiAgICAgKiAgICAgaWYgKGFwcC54ci5saWdodEVzdGltYXRpb24uc3VwcG9ydGVkKSB7XG4gICAgICogICAgICAgICBhcHAueHIubGlnaHRFc3RpbWF0aW9uLnN0YXJ0KCk7XG4gICAgICogICAgIH1cbiAgICAgKiB9KTtcbiAgICAgKi9cbiAgICBzdGFydCgpIHtcbiAgICAgICAgbGV0IGVycjtcblxuICAgICAgICBpZiAoIXRoaXMuX21hbmFnZXIuc2Vzc2lvbilcbiAgICAgICAgICAgIGVyciA9IG5ldyBFcnJvcignWFIgc2Vzc2lvbiBpcyBub3QgcnVubmluZycpO1xuXG4gICAgICAgIGlmICghZXJyICYmIHRoaXMuX21hbmFnZXIudHlwZSAhPT0gWFJUWVBFX0FSKVxuICAgICAgICAgICAgZXJyID0gbmV3IEVycm9yKCdYUiBzZXNzaW9uIHR5cGUgaXMgbm90IEFSJyk7XG5cbiAgICAgICAgaWYgKCFlcnIgJiYgIXRoaXMuX3N1cHBvcnRlZClcbiAgICAgICAgICAgIGVyciA9IG5ldyBFcnJvcignbGlnaHQtZXN0aW1hdGlvbiBpcyBub3Qgc3VwcG9ydGVkJyk7XG5cbiAgICAgICAgaWYgKCFlcnIgJiYgdGhpcy5fbGlnaHRQcm9iZSB8fCB0aGlzLl9saWdodFByb2JlUmVxdWVzdGVkKVxuICAgICAgICAgICAgZXJyID0gbmV3IEVycm9yKCdsaWdodCBlc3RpbWF0aW9uIGlzIGFscmVhZHkgcmVxdWVzdGVkJyk7XG5cbiAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgdGhpcy5maXJlKCdlcnJvcicsIGVycik7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl9saWdodFByb2JlUmVxdWVzdGVkID0gdHJ1ZTtcblxuICAgICAgICB0aGlzLl9tYW5hZ2VyLnNlc3Npb24ucmVxdWVzdExpZ2h0UHJvYmUoXG4gICAgICAgICkudGhlbigobGlnaHRQcm9iZSkgPT4ge1xuICAgICAgICAgICAgY29uc3Qgd2FzUmVxdWVzdGVkID0gdGhpcy5fbGlnaHRQcm9iZVJlcXVlc3RlZDtcbiAgICAgICAgICAgIHRoaXMuX2xpZ2h0UHJvYmVSZXF1ZXN0ZWQgPSBmYWxzZTtcblxuICAgICAgICAgICAgaWYgKHRoaXMuX21hbmFnZXIuYWN0aXZlKSB7XG4gICAgICAgICAgICAgICAgaWYgKHdhc1JlcXVlc3RlZCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9saWdodFByb2JlID0gbGlnaHRQcm9iZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMuZmlyZSgnZXJyb3InLCBuZXcgRXJyb3IoJ1hSIHNlc3Npb24gaXMgbm90IGFjdGl2ZScpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSkuY2F0Y2goKGV4KSA9PiB7XG4gICAgICAgICAgICB0aGlzLl9saWdodFByb2JlUmVxdWVzdGVkID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLmZpcmUoJ2Vycm9yJywgZXgpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBFbmQgZXN0aW1hdGlvbiBvZiBpbGx1bWluYXRpb24gZGF0YS5cbiAgICAgKi9cbiAgICBlbmQoKSB7XG4gICAgICAgIHRoaXMuX2xpZ2h0UHJvYmVSZXF1ZXN0ZWQgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fbGlnaHRQcm9iZSA9IG51bGw7XG4gICAgICAgIHRoaXMuX2F2YWlsYWJsZSA9IGZhbHNlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7Kn0gZnJhbWUgLSBYUkZyYW1lIGZyb20gcmVxdWVzdEFuaW1hdGlvbkZyYW1lIGNhbGxiYWNrLlxuICAgICAqIEBpZ25vcmVcbiAgICAgKi9cbiAgICB1cGRhdGUoZnJhbWUpIHtcbiAgICAgICAgaWYgKCF0aGlzLl9saWdodFByb2JlKSByZXR1cm47XG5cbiAgICAgICAgY29uc3QgbGlnaHRFc3RpbWF0ZSA9IGZyYW1lLmdldExpZ2h0RXN0aW1hdGUodGhpcy5fbGlnaHRQcm9iZSk7XG4gICAgICAgIGlmICghbGlnaHRFc3RpbWF0ZSkgcmV0dXJuO1xuXG4gICAgICAgIGlmICghdGhpcy5fYXZhaWxhYmxlKSB7XG4gICAgICAgICAgICB0aGlzLl9hdmFpbGFibGUgPSB0cnVlO1xuICAgICAgICAgICAgdGhpcy5maXJlKCdhdmFpbGFibGUnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGludGVuc2l0eVxuICAgICAgICBjb25zdCBwbGkgPSBsaWdodEVzdGltYXRlLnByaW1hcnlMaWdodEludGVuc2l0eTtcbiAgICAgICAgdGhpcy5faW50ZW5zaXR5ID0gTWF0aC5tYXgoMS4wLCBNYXRoLm1heChwbGkueCwgTWF0aC5tYXgocGxpLnksIHBsaS56KSkpO1xuXG4gICAgICAgIC8vIGNvbG9yXG4gICAgICAgIHZlYzNBLmNvcHkocGxpKS5tdWxTY2FsYXIoMSAvIHRoaXMuX2ludGVuc2l0eSk7XG4gICAgICAgIHRoaXMuX2NvbG9yLnNldCh2ZWMzQS54LCB2ZWMzQS55LCB2ZWMzQS56KTtcblxuICAgICAgICAvLyByb3RhdGlvblxuICAgICAgICB2ZWMzQS5zZXQoMCwgMCwgMCk7XG4gICAgICAgIHZlYzNCLmNvcHkobGlnaHRFc3RpbWF0ZS5wcmltYXJ5TGlnaHREaXJlY3Rpb24pO1xuICAgICAgICBtYXQ0QS5zZXRMb29rQXQodmVjM0IsIHZlYzNBLCBWZWMzLlVQKTtcbiAgICAgICAgbWF0NEIuc2V0RnJvbUF4aXNBbmdsZShWZWMzLlJJR0hULCA5MCk7IC8vIGRpcmVjdGlvbmFsIGxpZ2h0IGlzIGxvb2tpbmcgZG93blxuICAgICAgICBtYXQ0QS5tdWwobWF0NEIpO1xuICAgICAgICB0aGlzLl9yb3RhdGlvbi5zZXRGcm9tTWF0NChtYXQ0QSk7XG5cbiAgICAgICAgLy8gc3BoZXJpY2FsIGhhcm1vbmljc1xuICAgICAgICB0aGlzLl9zcGhlcmljYWxIYXJtb25pY3Muc2V0KGxpZ2h0RXN0aW1hdGUuc3BoZXJpY2FsSGFybW9uaWNzQ29lZmZpY2llbnRzKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUcnVlIGlmIExpZ2h0IEVzdGltYXRpb24gaXMgc3VwcG9ydGVkLiBUaGlzIGluZm9ybWF0aW9uIGlzIGF2YWlsYWJsZSBvbmx5IGR1cmluZyBhbiBhY3RpdmUgQVJcbiAgICAgKiBzZXNzaW9uLlxuICAgICAqXG4gICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICovXG4gICAgZ2V0IHN1cHBvcnRlZCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3N1cHBvcnRlZDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUcnVlIGlmIGVzdGltYXRlZCBsaWdodCBpbmZvcm1hdGlvbiBpcyBhdmFpbGFibGUuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGlmIChhcHAueHIubGlnaHRFc3RpbWF0aW9uLmF2YWlsYWJsZSkge1xuICAgICAqICAgICBlbnRpdHkubGlnaHQuaW50ZW5zaXR5ID0gYXBwLnhyLmxpZ2h0RXN0aW1hdGlvbi5pbnRlbnNpdHk7XG4gICAgICogfVxuICAgICAqL1xuICAgIGdldCBhdmFpbGFibGUoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hdmFpbGFibGU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSW50ZW5zaXR5IG9mIHdoYXQgaXMgZXN0aW1hdGVkIHRvIGJlIHRoZSBtb3N0IHByb21pbmVudCBkaXJlY3Rpb25hbCBsaWdodC4gT3IgbnVsbCBpZiBkYXRhXG4gICAgICogaXMgbm90IGF2YWlsYWJsZS5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtudW1iZXJ8bnVsbH1cbiAgICAgKi9cbiAgICBnZXQgaW50ZW5zaXR5KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fYXZhaWxhYmxlID8gdGhpcy5faW50ZW5zaXR5IDogbnVsbDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDb2xvciBvZiB3aGF0IGlzIGVzdGltYXRlZCB0byBiZSB0aGUgbW9zdCBwcm9taW5lbnQgZGlyZWN0aW9uYWwgbGlnaHQuIE9yIG51bGwgaWYgZGF0YSBpc1xuICAgICAqIG5vdCBhdmFpbGFibGUuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7Q29sb3J8bnVsbH1cbiAgICAgKi9cbiAgICBnZXQgY29sb3IoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hdmFpbGFibGUgPyB0aGlzLl9jb2xvciA6IG51bGw7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUm90YXRpb24gb2Ygd2hhdCBpcyBlc3RpbWF0ZWQgdG8gYmUgdGhlIG1vc3QgcHJvbWluZW50IGRpcmVjdGlvbmFsIGxpZ2h0LiBPciBudWxsIGlmIGRhdGEgaXNcbiAgICAgKiBub3QgYXZhaWxhYmxlLlxuICAgICAqXG4gICAgICogQHR5cGUge1F1YXR8bnVsbH1cbiAgICAgKi9cbiAgICBnZXQgcm90YXRpb24oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hdmFpbGFibGUgPyB0aGlzLl9yb3RhdGlvbiA6IG51bGw7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU3BoZXJpY2FsIGhhcm1vbmljcyBjb2VmZmljaWVudHMgb2Ygd2hhdCBpcyBlc3RpbWF0ZWQgdG8gYmUgdGhlIG1vc3QgcHJvbWluZW50IGRpcmVjdGlvbmFsXG4gICAgICogbGlnaHQuIE9yIG51bGwgaWYgZGF0YSBpcyBub3QgYXZhaWxhYmxlLlxuICAgICAqXG4gICAgICogQHR5cGUge0Zsb2F0MzJBcnJheXxudWxsfVxuICAgICAqIEBpZ25vcmVcbiAgICAgKi9cbiAgICBnZXQgc3BoZXJpY2FsSGFybW9uaWNzKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fYXZhaWxhYmxlID8gdGhpcy5fc3BoZXJpY2FsSGFybW9uaWNzIDogbnVsbDtcbiAgICB9XG59XG5cbmV4cG9ydCB7IFhyTGlnaHRFc3RpbWF0aW9uIH07XG4iXSwibmFtZXMiOlsidmVjM0EiLCJWZWMzIiwidmVjM0IiLCJtYXQ0QSIsIk1hdDQiLCJtYXQ0QiIsIlhyTGlnaHRFc3RpbWF0aW9uIiwiRXZlbnRIYW5kbGVyIiwiY29uc3RydWN0b3IiLCJtYW5hZ2VyIiwiX21hbmFnZXIiLCJfc3VwcG9ydGVkIiwiX2F2YWlsYWJsZSIsIl9saWdodFByb2JlUmVxdWVzdGVkIiwiX2xpZ2h0UHJvYmUiLCJfaW50ZW5zaXR5IiwiX3JvdGF0aW9uIiwiUXVhdCIsIl9jb2xvciIsIkNvbG9yIiwiX3NwaGVyaWNhbEhhcm1vbmljcyIsIkZsb2F0MzJBcnJheSIsIm9uIiwiX29uU2Vzc2lvblN0YXJ0IiwiX29uU2Vzc2lvbkVuZCIsInN1cHBvcnRlZCIsInNlc3Npb24iLCJyZXF1ZXN0TGlnaHRQcm9iZSIsInN0YXJ0IiwiZXJyIiwiRXJyb3IiLCJ0eXBlIiwiWFJUWVBFX0FSIiwiZmlyZSIsInRoZW4iLCJsaWdodFByb2JlIiwid2FzUmVxdWVzdGVkIiwiYWN0aXZlIiwiY2F0Y2giLCJleCIsImVuZCIsInVwZGF0ZSIsImZyYW1lIiwibGlnaHRFc3RpbWF0ZSIsImdldExpZ2h0RXN0aW1hdGUiLCJwbGkiLCJwcmltYXJ5TGlnaHRJbnRlbnNpdHkiLCJNYXRoIiwibWF4IiwieCIsInkiLCJ6IiwiY29weSIsIm11bFNjYWxhciIsInNldCIsInByaW1hcnlMaWdodERpcmVjdGlvbiIsInNldExvb2tBdCIsIlVQIiwic2V0RnJvbUF4aXNBbmdsZSIsIlJJR0hUIiwibXVsIiwic2V0RnJvbU1hdDQiLCJzcGhlcmljYWxIYXJtb25pY3NDb2VmZmljaWVudHMiLCJhdmFpbGFibGUiLCJpbnRlbnNpdHkiLCJjb2xvciIsInJvdGF0aW9uIiwic3BoZXJpY2FsSGFybW9uaWNzIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBUUEsTUFBTUEsS0FBSyxHQUFHLElBQUlDLElBQUksRUFBRSxDQUFBO0FBQ3hCLE1BQU1DLEtBQUssR0FBRyxJQUFJRCxJQUFJLEVBQUUsQ0FBQTtBQUN4QixNQUFNRSxLQUFLLEdBQUcsSUFBSUMsSUFBSSxFQUFFLENBQUE7QUFDeEIsTUFBTUMsS0FBSyxHQUFHLElBQUlELElBQUksRUFBRSxDQUFBOztBQUV4QjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLE1BQU1FLGlCQUFpQixTQUFTQyxZQUFZLENBQUM7QUF1RHpDO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtFQUNJQyxXQUFXQSxDQUFDQyxPQUFPLEVB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
