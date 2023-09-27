import { EventHandler } from '../../core/event-handler.js';
import { platform } from '../../core/platform.js';
import { Mat4 } from '../../core/math/mat4.js';
import { PIXELFORMAT_LA8, ADDRESS_CLAMP_TO_EDGE, FILTER_LINEAR } from '../../platform/graphics/constants.js';
import { Texture } from '../../platform/graphics/texture.js';
import { XRDEPTHSENSINGUSAGE_CPU, XRDEPTHSENSINGUSAGE_GPU } from './constants.js';

/**
 * Depth Sensing provides depth information which is reconstructed using the underlying AR system.
 * It provides the ability to query depth values (CPU path) or access a depth texture (GPU path).
 * Depth information can be used (not limited to) for reconstructing real world geometry, virtual
 * object placement, occlusion of virtual objects by real world geometry and more.
 *
 * ```javascript
 * // CPU path
 * const depthSensing = app.xr.depthSensing;
 * if (depthSensing.available) {
 *     // get depth in the middle of the screen, value is in meters
 *     const depth = depthSensing.getDepth(depthSensing.width / 2, depthSensing.height / 2);
 * }
 * ```
 *
 * ```javascript
 * // GPU path, attaching texture to material
 * material.diffuseMap = depthSensing.texture;
 * material.setParameter('matrix_depth_uv', depthSensing.uvMatrix.data);
 * material.setParameter('depth_raw_to_meters', depthSensing.rawValueToMeters);
 * material.update();
 *
 * // update UV transformation matrix on depth texture resize
 * depthSensing.on('resize', function () {
 *     material.setParameter('matrix_depth_uv', depthSensing.uvMatrix.data);
 *     material.setParameter('depth_raw_to_meters', depthSensing.rawValueToMeters);
 * });
 * ```
 *
 * ```javascript
 * // GLSL shader to unpack depth texture
 * varying vec2 vUv0;
 *
 * uniform sampler2D texture_depthSensingMap;
 * uniform mat4 matrix_depth_uv;
 * uniform float depth_raw_to_meters;
 *
 * void main(void) {
 *     // transform UVs using depth matrix
 *     vec2 texCoord = (matrix_depth_uv * vec4(vUv0.xy, 0.0, 1.0)).xy;
 *
 *     // get luminance alpha components from depth texture
 *     vec2 packedDepth = texture2D(texture_depthSensingMap, texCoord).ra;
 *
 *     // unpack into single value in millimeters
 *     float depth = dot(packedDepth, vec2(255.0, 256.0 * 255.0)) * depth_raw_to_meters; // m
 *
 *     // normalize: 0m to 8m distance
 *     depth = min(depth / 8.0, 1.0); // 0..1 = 0..8
 *
 *     // paint scene from black to white based on distance
 *     gl_FragColor = vec4(depth, depth, depth, 1.0);
 * }
 * ```
 *
 * @augments EventHandler
 * @category XR
 */
class XrDepthSensing extends EventHandler {
  /**
   * Create a new XrDepthSensing instance.
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
    this._available = false;
    /**
     * @type {XRCPUDepthInformation|null}
     * @private
     */
    this._depthInfoCpu = null;
    /**
     * @type {XRCPUDepthInformation|null}
     * @private
     */
    this._depthInfoGpu = null;
    /**
     * @type {string|null}
     * @private
     */
    this._usage = null;
    /**
     * @type {string|null}
     * @private
     */
    this._dataFormat = null;
    /**
     * @type {boolean}
     * @private
     */
    this._matrixDirty = false;
    /**
     * @type {Mat4}
     * @private
     */
    this._matrix = new Mat4();
    /**
     * @type {Uint8Array}
     * @private
     */
    this._emptyBuffer = new Uint8Array(32);
    /**
     * @type {Uint8Array|null}
     * @private
     */
    this._depthBuffer = null;
    /**
     * @type {Texture}
     * @private
     */
    this._texture = void 0;
    this._manager = manager;

    // TODO: data format can be different
    this._texture = new Texture(this._manager.app.graphicsDevice, {
      format: PIXELFORMAT_LA8,
      mipmaps: false,
      addressU: ADDRESS_CLAMP_TO_EDGE,
      addressV: ADDRESS_CLAMP_TO_EDGE,
      minFilter: FILTER_LINEAR,
      magFilter: FILTER_LINEAR,
      name: 'XRDepthSensing'
    });
    if (this.supported) {
      this._manager.on('start', this._onSessionStart, this);
      this._manager.on('end', this._onSessionEnd, this);
    }
  }

  /**
   * Fired when depth sensing data becomes available.
   *
   * @event XrDepthSensing#available
   */

  /**
   * Fired when depth sensing data becomes unavailable.
   *
   * @event XrDepthSensing#unavailable
   */

  /**
   * Fired when the depth sensing texture been resized. The {@link XrDepthSensing#uvMatrix} needs
   * to be updated for relevant shaders.
   *
   * @event XrDepthSensing#resize
   * @param {number} width - The new width of the depth texture in pixels.
   * @param {number} height - The new height of the depth texture in pixels.
   * @example
   * depthSensing.on('resize', function () {
   *     material.setParameter('matrix_depth_uv', depthSensing.uvMatrix);
   * });
   */

  /** @ignore */
  destroy() {
    this._texture.destroy();
    this._texture = null;
  }

  /** @private */
  _onSessionStart() {
    const session = this._manager.session;
    try {
      this._usage = session.depthUsage;
      this._dataFormat = session.depthDataFormat;
    } catch (ex) {
      this._usage = null;
      this._dataFormat = null;
      this._available = false;
      this.fire('error', ex);
    }
  }

  /** @private */
  _onSessionEnd() {
    this._depthInfoCpu = null;
    this._depthInfoGpu = null;
    this._usage = null;
    this._dataFormat = null;
    if (this._available) {
      this._available = false;
      this.fire('unavailable');
    }
    this._depthBuffer = null;
    this._texture._width = 4;
    this._texture._height = 4;
    this._texture._levels[0] = this._emptyBuffer;
    this._texture.upload();
  }

  /** @private */
  _updateTexture() {
    const depthInfo = this._depthInfoCpu || this._depthInfoGpu;
    if (depthInfo) {
      let resized = false;

      // changed resolution
      if (depthInfo.width !== this._texture.width || depthInfo.height !== this._texture.height) {
        this._texture._width = depthInfo.width;
        this._texture._height = depthInfo.height;
        this._matrixDirty = true;
        resized = true;
      }
      if (this._depthInfoCpu) {
        const dataBuffer = this._depthInfoCpu.data;
        this._depthBuffer = new Uint8Array(dataBuffer);
        this._texture._levels[0] = this._depthBuffer;
        this._texture.upload();
      } else if (this._depthInfoGpu) {
        this._texture._levels[0] = this._depthInfoGpu.texture;
        this._texture.upload();
      }
      if (resized) this.fire('resize', depthInfo.width, depthInfo.height);
    } else if (this._depthBuffer) {
      // depth info not available anymore
      this._depthBuffer = null;
      this._texture._width = 4;
      this._texture._height = 4;
      this._texture._levels[0] = this._emptyBuffer;
      this._texture.upload();
    }
  }

  /**
   * @param {*} frame - XRFrame from requestAnimationFrame callback.
   * @param {*} view - First XRView of viewer XRPose.
   * @ignore
   */
  update(frame, view) {
    if (!this._usage) return;
    let depthInfoCpu = null;
    let depthInfoGpu = null;
    if (this._usage === XRDEPTHSENSINGUSAGE_CPU && view) {
      depthInfoCpu = frame.getDepthInformation(view);
    } else if (this._usage === XRDEPTHSENSINGUSAGE_GPU && view) {
      depthInfoGpu = frame.getDepthInformation(view);
    }
    if (this._depthInfoCpu && !depthInfoCpu || !this._depthInfoCpu && depthInfoCpu || this.depthInfoGpu && !depthInfoGpu || !this._depthInfoGpu && depthInfoGpu) {
      this._matrixDirty = true;
    }
    this._depthInfoCpu = depthInfoCpu;
    this._depthInfoGpu = depthInfoGpu;
    this._updateTexture();
    if (this._matrixDirty) {
      this._matrixDirty = false;
      const depthInfo = this._depthInfoCpu || this._depthInfoGpu;
      if (depthInfo) {
        this._matrix.data.set(depthInfo.normDepthBufferFromNormView.matrix);
      } else {
        this._matrix.setIdentity();
      }
    }
    if ((this._depthInfoCpu || this._depthInfoGpu) && !this._available) {
      this._available = true;
      this.fire('available');
    } else if (!this._depthInfoCpu && !this._depthInfoGpu && this._available) {
      this._available = false;
      this.fire('unavailable');
    }
  }

  /**
   * Get depth value from depth information in meters. UV is in range of 0..1, with origin in
   * top-left corner of a texture.
   *
   * @param {number} u - U coordinate of pixel in depth texture, which is in range from 0.0 to
   * 1.0 (left to right).
   * @param {number} v - V coordinate of pixel in depth texture, which is in range from 0.0 to
   * 1.0 (top to bottom).
   * @returns {number|null} Depth in meters or null if depth information is currently not
   * available.
   * @example
   * const depth = app.xr.depthSensing.getDepth(u, v);
   * if (depth !== null) {
   *     // depth in meters
   * }
   */
  getDepth(u, v) {
    // TODO
    // GPU usage

    if (!this._depthInfoCpu) return null;
    return this._depthInfoCpu.getDepthInMeters(u, v);
  }

  /**
   * True if Depth Sensing is supported.
   *
   * @type {boolean}
   */
  get supported() {
    return platform.browser && !!window.XRDepthInformation;
  }

  /**
   * True if depth sensing information is available.
   *
   * @type {boolean}
   * @example
   * if (app.xr.depthSensing.available) {
   *     const depth = app.xr.depthSensing.getDepth(x, y);
   * }
   */
  get available() {
    return this._available;
  }

  /**
   * Whether the usage is CPU or GPU.
   *
   * @type {string}
   * @ignore
   */
  get usage() {
    return this._usage;
  }

  /**
   * The depth sensing data format.
   *
   * @type {string}
   * @ignore
   */
  get dataFormat() {
    return this._dataFormat;
  }

  /**
   * Width of depth texture or 0 if not available.
   *
   * @type {number}
   */
  get width() {
    const depthInfo = this._depthInfoCpu || this._depthInfoGpu;
    return depthInfo && depthInfo.width || 0;
  }

  /**
   * Height of depth texture or 0 if not available.
   *
   * @type {number}
   */
  get height() {
    const depthInfo = this._depthInfoCpu || this._depthInfoGpu;
    return depthInfo && depthInfo.height || 0;
  }

  /* eslint-disable jsdoc/check-examples */
  /**
   * Texture that contains packed depth information. The format of this texture is
   * {@link PIXELFORMAT_LA8}. It is UV transformed based on the underlying AR system which can
   * be normalized using {@link XrDepthSensing#uvMatrix}.
   *
   * @type {Texture}
   * @example
   * material.diffuseMap = depthSensing.texture;
   * @example
   * // GLSL shader to unpack depth texture
   * varying vec2 vUv0;
   *
   * uniform sampler2D texture_depthSensingMap;
   * uniform mat4 matrix_depth_uv;
   * uniform float depth_raw_to_meters;
   *
   * void main(void) {
   *     // transform UVs using depth matrix
   *     vec2 texCoord = (matrix_depth_uv * vec4(vUv0.xy, 0.0, 1.0)).xy;
   *
   *     // get luminance alpha components from depth texture
   *     vec2 packedDepth = texture2D(texture_depthSensingMap, texCoord).ra;
   *
   *     // unpack into single value in millimeters
   *     float depth = dot(packedDepth, vec2(255.0, 256.0 * 255.0)) * depth_raw_to_meters; // m
   *
   *     // normalize: 0m to 8m distance
   *     depth = min(depth / 8.0, 1.0); // 0..1 = 0m..8m
   *
   *     // paint scene from black to white based on distance
   *     gl_FragColor = vec4(depth, depth, depth, 1.0);
   * }
   */
  get texture() {
    return this._texture;
  }
  /* eslint-enable jsdoc/check-examples */

  /**
   * 4x4 matrix that should be used to transform depth texture UVs to normalized UVs in a shader.
   * It is updated when the depth texture is resized. Refer to {@link XrDepthSensing#resize}.
   *
   * @type {Mat4}
   * @example
   * material.setParameter('matrix_depth_uv', depthSensing.uvMatrix.data);
   */
  get uvMatrix() {
    return this._matrix;
  }

  /**
   * Multiply this coefficient number by raw depth value to get depth in meters.
   *
   * @type {number}
   * @example
   * material.setParameter('depth_raw_to_meters', depthSensing.rawValueToMeters);
   */
  get rawValueToMeters() {
    const depthInfo = this._depthInfoCpu || this._depthInfoGpu;
    return depthInfo && depthInfo.rawValueToMeters || 0;
  }
}

export { XrDepthSensing };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoieHItZGVwdGgtc2Vuc2luZy5qcyIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL2ZyYW1ld29yay94ci94ci1kZXB0aC1zZW5zaW5nLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEV2ZW50SGFuZGxlciB9IGZyb20gJy4uLy4uL2NvcmUvZXZlbnQtaGFuZGxlci5qcyc7XG5pbXBvcnQgeyBwbGF0Zm9ybSB9IGZyb20gJy4uLy4uL2NvcmUvcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgTWF0NCB9IGZyb20gJy4uLy4uL2NvcmUvbWF0aC9tYXQ0LmpzJztcblxuaW1wb3J0IHsgQUREUkVTU19DTEFNUF9UT19FREdFLCBQSVhFTEZPUk1BVF9MQTgsIEZJTFRFUl9MSU5FQVIgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9ncmFwaGljcy9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgVGV4dHVyZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2dyYXBoaWNzL3RleHR1cmUuanMnO1xuXG5pbXBvcnQgeyBYUkRFUFRIU0VOU0lOR1VTQUdFX0NQVSwgWFJERVBUSFNFTlNJTkdVU0FHRV9HUFUgfSBmcm9tICcuL2NvbnN0YW50cy5qcyc7XG5cbi8qKlxuICogRGVwdGggU2Vuc2luZyBwcm92aWRlcyBkZXB0aCBpbmZvcm1hdGlvbiB3aGljaCBpcyByZWNvbnN0cnVjdGVkIHVzaW5nIHRoZSB1bmRlcmx5aW5nIEFSIHN5c3RlbS5cbiAqIEl0IHByb3ZpZGVzIHRoZSBhYmlsaXR5IHRvIHF1ZXJ5IGRlcHRoIHZhbHVlcyAoQ1BVIHBhdGgpIG9yIGFjY2VzcyBhIGRlcHRoIHRleHR1cmUgKEdQVSBwYXRoKS5cbiAqIERlcHRoIGluZm9ybWF0aW9uIGNhbiBiZSB1c2VkIChub3QgbGltaXRlZCB0bykgZm9yIHJlY29uc3RydWN0aW5nIHJlYWwgd29ybGQgZ2VvbWV0cnksIHZpcnR1YWxcbiAqIG9iamVjdCBwbGFjZW1lbnQsIG9jY2x1c2lvbiBvZiB2aXJ0dWFsIG9iamVjdHMgYnkgcmVhbCB3b3JsZCBnZW9tZXRyeSBhbmQgbW9yZS5cbiAqXG4gKiBgYGBqYXZhc2NyaXB0XG4gKiAvLyBDUFUgcGF0aFxuICogY29uc3QgZGVwdGhTZW5zaW5nID0gYXBwLnhyLmRlcHRoU2Vuc2luZztcbiAqIGlmIChkZXB0aFNlbnNpbmcuYXZhaWxhYmxlKSB7XG4gKiAgICAgLy8gZ2V0IGRlcHRoIGluIHRoZSBtaWRkbGUgb2YgdGhlIHNjcmVlbiwgdmFsdWUgaXMgaW4gbWV0ZXJzXG4gKiAgICAgY29uc3QgZGVwdGggPSBkZXB0aFNlbnNpbmcuZ2V0RGVwdGgoZGVwdGhTZW5zaW5nLndpZHRoIC8gMiwgZGVwdGhTZW5zaW5nLmhlaWdodCAvIDIpO1xuICogfVxuICogYGBgXG4gKlxuICogYGBgamF2YXNjcmlwdFxuICogLy8gR1BVIHBhdGgsIGF0dGFjaGluZyB0ZXh0dXJlIHRvIG1hdGVyaWFsXG4gKiBtYXRlcmlhbC5kaWZmdXNlTWFwID0gZGVwdGhTZW5zaW5nLnRleHR1cmU7XG4gKiBtYXRlcmlhbC5zZXRQYXJhbWV0ZXIoJ21hdHJpeF9kZXB0aF91dicsIGRlcHRoU2Vuc2luZy51dk1hdHJpeC5kYXRhKTtcbiAqIG1hdGVyaWFsLnNldFBhcmFtZXRlcignZGVwdGhfcmF3X3RvX21ldGVycycsIGRlcHRoU2Vuc2luZy5yYXdWYWx1ZVRvTWV0ZXJzKTtcbiAqIG1hdGVyaWFsLnVwZGF0ZSgpO1xuICpcbiAqIC8vIHVwZGF0ZSBVViB0cmFuc2Zvcm1hdGlvbiBtYXRyaXggb24gZGVwdGggdGV4dHVyZSByZXNpemVcbiAqIGRlcHRoU2Vuc2luZy5vbigncmVzaXplJywgZnVuY3Rpb24gKCkge1xuICogICAgIG1hdGVyaWFsLnNldFBhcmFtZXRlcignbWF0cml4X2RlcHRoX3V2JywgZGVwdGhTZW5zaW5nLnV2TWF0cml4LmRhdGEpO1xuICogICAgIG1hdGVyaWFsLnNldFBhcmFtZXRlcignZGVwdGhfcmF3X3RvX21ldGVycycsIGRlcHRoU2Vuc2luZy5yYXdWYWx1ZVRvTWV0ZXJzKTtcbiAqIH0pO1xuICogYGBgXG4gKlxuICogYGBgamF2YXNjcmlwdFxuICogLy8gR0xTTCBzaGFkZXIgdG8gdW5wYWNrIGRlcHRoIHRleHR1cmVcbiAqIHZhcnlpbmcgdmVjMiB2VXYwO1xuICpcbiAqIHVuaWZvcm0gc2FtcGxlcjJEIHRleHR1cmVfZGVwdGhTZW5zaW5nTWFwO1xuICogdW5pZm9ybSBtYXQ0IG1hdHJpeF9kZXB0aF91djtcbiAqIHVuaWZvcm0gZmxvYXQgZGVwdGhfcmF3X3RvX21ldGVycztcbiAqXG4gKiB2b2lkIG1haW4odm9pZCkge1xuICogICAgIC8vIHRyYW5zZm9ybSBVVnMgdXNpbmcgZGVwdGggbWF0cml4XG4gKiAgICAgdmVjMiB0ZXhDb29yZCA9IChtYXRyaXhfZGVwdGhfdXYgKiB2ZWM0KHZVdjAueHksIDAuMCwgMS4wKSkueHk7XG4gKlxuICogICAgIC8vIGdldCBsdW1pbmFuY2UgYWxwaGEgY29tcG9uZW50cyBmcm9tIGRlcHRoIHRleHR1cmVcbiAqICAgICB2ZWMyIHBhY2tlZERlcHRoID0gdGV4dHVyZTJEKHRleHR1cmVfZGVwdGhTZW5zaW5nTWFwLCB0ZXhDb29yZCkucmE7XG4gKlxuICogICAgIC8vIHVucGFjayBpbnRvIHNpbmdsZSB2YWx1ZSBpbiBtaWxsaW1ldGVyc1xuICogICAgIGZsb2F0IGRlcHRoID0gZG90KHBhY2tlZERlcHRoLCB2ZWMyKDI1NS4wLCAyNTYuMCAqIDI1NS4wKSkgKiBkZXB0aF9yYXdfdG9fbWV0ZXJzOyAvLyBtXG4gKlxuICogICAgIC8vIG5vcm1hbGl6ZTogMG0gdG8gOG0gZGlzdGFuY2VcbiAqICAgICBkZXB0aCA9IG1pbihkZXB0aCAvIDguMCwgMS4wKTsgLy8gMC4uMSA9IDAuLjhcbiAqXG4gKiAgICAgLy8gcGFpbnQgc2NlbmUgZnJvbSBibGFjayB0byB3aGl0ZSBiYXNlZCBvbiBkaXN0YW5jZVxuICogICAgIGdsX0ZyYWdDb2xvciA9IHZlYzQoZGVwdGgsIGRlcHRoLCBkZXB0aCwgMS4wKTtcbiAqIH1cbiAqIGBgYFxuICpcbiAqIEBhdWdtZW50cyBFdmVudEhhbmRsZXJcbiAqIEBjYXRlZ29yeSBYUlxuICovXG5jbGFzcyBYckRlcHRoU2Vuc2luZyBleHRlbmRzIEV2ZW50SGFuZGxlciB7XG4gICAgLyoqXG4gICAgICogQHR5cGUge2ltcG9ydCgnLi94ci1tYW5hZ2VyLmpzJykuWHJNYW5hZ2VyfVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX21hbmFnZXI7XG5cbiAgICAgLyoqXG4gICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAgKiBAcHJpdmF0ZVxuICAgICAgKi9cbiAgICBfYXZhaWxhYmxlID0gZmFsc2U7XG5cbiAgICAvKipcbiAgICAgKiBAdHlwZSB7WFJDUFVEZXB0aEluZm9ybWF0aW9ufG51bGx9XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfZGVwdGhJbmZvQ3B1ID0gbnVsbDtcblxuICAgIC8qKlxuICAgICAqIEB0eXBlIHtYUkNQVURlcHRoSW5mb3JtYXRpb258bnVsbH1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9kZXB0aEluZm9HcHUgPSBudWxsO1xuXG4gICAgLyoqXG4gICAgICogQHR5cGUge3N0cmluZ3xudWxsfVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX3VzYWdlID0gbnVsbDtcblxuICAgIC8qKlxuICAgICAqIEB0eXBlIHtzdHJpbmd8bnVsbH1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9kYXRhRm9ybWF0ID0gbnVsbDtcblxuICAgIC8qKlxuICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX21hdHJpeERpcnR5ID0gZmFsc2U7XG5cbiAgICAvKipcbiAgICAgKiBAdHlwZSB7TWF0NH1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9tYXRyaXggPSBuZXcgTWF0NCgpO1xuXG4gICAgLyoqXG4gICAgICogQHR5cGUge1VpbnQ4QXJyYXl9XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfZW1wdHlCdWZmZXIgPSBuZXcgVWludDhBcnJheSgzMik7XG5cbiAgICAvKipcbiAgICAgKiBAdHlwZSB7VWludDhBcnJheXxudWxsfVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX2RlcHRoQnVmZmVyID0gbnVsbDtcblxuICAgIC8qKlxuICAgICAqIEB0eXBlIHtUZXh0dXJlfVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX3RleHR1cmU7XG5cbiAgICAvKipcbiAgICAgKiBDcmVhdGUgYSBuZXcgWHJEZXB0aFNlbnNpbmcgaW5zdGFuY2UuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi94ci1tYW5hZ2VyLmpzJykuWHJNYW5hZ2VyfSBtYW5hZ2VyIC0gV2ViWFIgTWFuYWdlci5cbiAgICAgKiBAaGlkZWNvbnN0cnVjdG9yXG4gICAgICovXG4gICAgY29uc3RydWN0b3IobWFuYWdlcikge1xuICAgICAgICBzdXBlcigpO1xuXG4gICAgICAgIHRoaXMuX21hbmFnZXIgPSBtYW5hZ2VyO1xuXG4gICAgICAgIC8vIFRPRE86IGRhdGEgZm9ybWF0IGNhbiBiZSBkaWZmZXJlbnRcbiAgICAgICAgdGhpcy5fdGV4dHVyZSA9IG5ldyBUZXh0dXJlKHRoaXMuX21hbmFnZXIuYXBwLmdyYXBoaWNzRGV2aWNlLCB7XG4gICAgICAgICAgICBmb3JtYXQ6IFBJWEVMRk9STUFUX0xBOCxcbiAgICAgICAgICAgIG1pcG1hcHM6IGZhbHNlLFxuICAgICAgICAgICAgYWRkcmVzc1U6IEFERFJFU1NfQ0xBTVBfVE9fRURHRSxcbiAgICAgICAgICAgIGFkZHJlc3NWOiBBRERSRVNTX0NMQU1QX1RPX0VER0UsXG4gICAgICAgICAgICBtaW5GaWx0ZXI6IEZJTFRFUl9MSU5FQVIsXG4gICAgICAgICAgICBtYWdGaWx0ZXI6IEZJTFRFUl9MSU5FQVIsXG4gICAgICAgICAgICBuYW1lOiAnWFJEZXB0aFNlbnNpbmcnXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGlmICh0aGlzLnN1cHBvcnRlZCkge1xuICAgICAgICAgICAgdGhpcy5fbWFuYWdlci5vbignc3RhcnQnLCB0aGlzLl9vblNlc3Npb25TdGFydCwgdGhpcyk7XG4gICAgICAgICAgICB0aGlzLl9tYW5hZ2VyLm9uKCdlbmQnLCB0aGlzLl9vblNlc3Npb25FbmQsIHRoaXMpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRmlyZWQgd2hlbiBkZXB0aCBzZW5zaW5nIGRhdGEgYmVjb21lcyBhdmFpbGFibGUuXG4gICAgICpcbiAgICAgKiBAZXZlbnQgWHJEZXB0aFNlbnNpbmcjYXZhaWxhYmxlXG4gICAgICovXG5cbiAgICAvKipcbiAgICAgKiBGaXJlZCB3aGVuIGRlcHRoIHNlbnNpbmcgZGF0YSBiZWNvbWVzIHVuYXZhaWxhYmxlLlxuICAgICAqXG4gICAgICogQGV2ZW50IFhyRGVwdGhTZW5zaW5nI3VuYXZhaWxhYmxlXG4gICAgICovXG5cbiAgICAvKipcbiAgICAgKiBGaXJlZCB3aGVuIHRoZSBkZXB0aCBzZW5zaW5nIHRleHR1cmUgYmVlbiByZXNpemVkLiBUaGUge0BsaW5rIFhyRGVwdGhTZW5zaW5nI3V2TWF0cml4fSBuZWVkc1xuICAgICAqIHRvIGJlIHVwZGF0ZWQgZm9yIHJlbGV2YW50IHNoYWRlcnMuXG4gICAgICpcbiAgICAgKiBAZXZlbnQgWHJEZXB0aFNlbnNpbmcjcmVzaXplXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHdpZHRoIC0gVGhlIG5ldyB3aWR0aCBvZiB0aGUgZGVwdGggdGV4dHVyZSBpbiBwaXhlbHMuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGhlaWdodCAtIFRoZSBuZXcgaGVpZ2h0IG9mIHRoZSBkZXB0aCB0ZXh0dXJlIGluIHBpeGVscy5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGRlcHRoU2Vuc2luZy5vbigncmVzaXplJywgZnVuY3Rpb24gKCkge1xuICAgICAqICAgICBtYXRlcmlhbC5zZXRQYXJhbWV0ZXIoJ21hdHJpeF9kZXB0aF91dicsIGRlcHRoU2Vuc2luZy51dk1hdHJpeCk7XG4gICAgICogfSk7XG4gICAgICovXG5cbiAgICAvKiogQGlnbm9yZSAqL1xuICAgIGRlc3Ryb3koKSB7XG4gICAgICAgIHRoaXMuX3RleHR1cmUuZGVzdHJveSgpO1xuICAgICAgICB0aGlzLl90ZXh0dXJlID0gbnVsbDtcbiAgICB9XG5cbiAgICAvKiogQHByaXZhdGUgKi9cbiAgICBfb25TZXNzaW9uU3RhcnQoKSB7XG4gICAgICAgIGNvbnN0IHNlc3Npb24gPSB0aGlzLl9tYW5hZ2VyLnNlc3Npb247XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHRoaXMuX3VzYWdlID0gc2Vzc2lvbi5kZXB0aFVzYWdlO1xuICAgICAgICAgICAgdGhpcy5fZGF0YUZvcm1hdCA9IHNlc3Npb24uZGVwdGhEYXRhRm9ybWF0O1xuICAgICAgICB9IGNhdGNoIChleCkge1xuICAgICAgICAgICAgdGhpcy5fdXNhZ2UgPSBudWxsO1xuICAgICAgICAgICAgdGhpcy5fZGF0YUZvcm1hdCA9IG51bGw7XG4gICAgICAgICAgICB0aGlzLl9hdmFpbGFibGUgPSBmYWxzZTtcblxuICAgICAgICAgICAgdGhpcy5maXJlKCdlcnJvcicsIGV4KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKiBAcHJpdmF0ZSAqL1xuICAgIF9vblNlc3Npb25FbmQoKSB7XG4gICAgICAgIHRoaXMuX2RlcHRoSW5mb0NwdSA9IG51bGw7XG4gICAgICAgIHRoaXMuX2RlcHRoSW5mb0dwdSA9IG51bGw7XG5cbiAgICAgICAgdGhpcy5fdXNhZ2UgPSBudWxsO1xuICAgICAgICB0aGlzLl9kYXRhRm9ybWF0ID0gbnVsbDtcblxuICAgICAgICBpZiAodGhpcy5fYXZhaWxhYmxlKSB7XG4gICAgICAgICAgICB0aGlzLl9hdmFpbGFibGUgPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMuZmlyZSgndW5hdmFpbGFibGUnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuX2RlcHRoQnVmZmVyID0gbnVsbDtcbiAgICAgICAgdGhpcy5fdGV4dHVyZS5fd2lkdGggPSA0O1xuICAgICAgICB0aGlzLl90ZXh0dXJlLl9oZWlnaHQgPSA0O1xuICAgICAgICB0aGlzLl90ZXh0dXJlLl9sZXZlbHNbMF0gPSB0aGlzLl9lbXB0eUJ1ZmZlcjtcbiAgICAgICAgdGhpcy5fdGV4dHVyZS51cGxvYWQoKTtcbiAgICB9XG5cbiAgICAvKiogQHByaXZhdGUgKi9cbiAgICBfdXBkYXRlVGV4dHVyZSgpIHtcbiAgICAgICAgY29uc3QgZGVwdGhJbmZvID0gdGhpcy5fZGVwdGhJbmZvQ3B1IHx8IHRoaXMuX2RlcHRoSW5mb0dwdTtcblxuICAgICAgICBpZiAoZGVwdGhJbmZvKSB7XG4gICAgICAgICAgICBsZXQgcmVzaXplZCA9IGZhbHNlO1xuXG4gICAgICAgICAgICAvLyBjaGFuZ2VkIHJlc29sdXRpb25cbiAgICAgICAgICAgIGlmIChkZXB0aEluZm8ud2lkdGggIT09IHRoaXMuX3RleHR1cmUud2lkdGggfHwgZGVwdGhJbmZvLmhlaWdodCAhPT0gdGhpcy5fdGV4dHVyZS5oZWlnaHQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl90ZXh0dXJlLl93aWR0aCA9IGRlcHRoSW5mby53aWR0aDtcbiAgICAgICAgICAgICAgICB0aGlzLl90ZXh0dXJlLl9oZWlnaHQgPSBkZXB0aEluZm8uaGVpZ2h0O1xuICAgICAgICAgICAgICAgIHRoaXMuX21hdHJpeERpcnR5ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICByZXNpemVkID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHRoaXMuX2RlcHRoSW5mb0NwdSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGRhdGFCdWZmZXIgPSB0aGlzLl9kZXB0aEluZm9DcHUuZGF0YTtcbiAgICAgICAgICAgICAgICB0aGlzLl9kZXB0aEJ1ZmZlciA9IG5ldyBVaW50OEFycmF5KGRhdGFCdWZmZXIpO1xuICAgICAgICAgICAgICAgIHRoaXMuX3RleHR1cmUuX2xldmVsc1swXSA9IHRoaXMuX2RlcHRoQnVmZmVyO1xuICAgICAgICAgICAgICAgIHRoaXMuX3RleHR1cmUudXBsb2FkKCk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHRoaXMuX2RlcHRoSW5mb0dwdSkge1xuICAgICAgICAgICAgICAgIHRoaXMuX3RleHR1cmUuX2xldmVsc1swXSA9IHRoaXMuX2RlcHRoSW5mb0dwdS50ZXh0dXJlO1xuICAgICAgICAgICAgICAgIHRoaXMuX3RleHR1cmUudXBsb2FkKCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChyZXNpemVkKSB0aGlzLmZpcmUoJ3Jlc2l6ZScsIGRlcHRoSW5mby53aWR0aCwgZGVwdGhJbmZvLmhlaWdodCk7XG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5fZGVwdGhCdWZmZXIpIHtcbiAgICAgICAgICAgIC8vIGRlcHRoIGluZm8gbm90IGF2YWlsYWJsZSBhbnltb3JlXG4gICAgICAgICAgICB0aGlzLl9kZXB0aEJ1ZmZlciA9IG51bGw7XG4gICAgICAgICAgICB0aGlzLl90ZXh0dXJlLl93aWR0aCA9IDQ7XG4gICAgICAgICAgICB0aGlzLl90ZXh0dXJlLl9oZWlnaHQgPSA0O1xuICAgICAgICAgICAgdGhpcy5fdGV4dHVyZS5fbGV2ZWxzWzBdID0gdGhpcy5fZW1wdHlCdWZmZXI7XG4gICAgICAgICAgICB0aGlzLl90ZXh0dXJlLnVwbG9hZCgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHsqfSBmcmFtZSAtIFhSRnJhbWUgZnJvbSByZXF1ZXN0QW5pbWF0aW9uRnJhbWUgY2FsbGJhY2suXG4gICAgICogQHBhcmFtIHsqfSB2aWV3IC0gRmlyc3QgWFJWaWV3IG9mIHZpZXdlciBYUlBvc2UuXG4gICAgICogQGlnbm9yZVxuICAgICAqL1xuICAgIHVwZGF0ZShmcmFtZSwgdmlldykge1xuICAgICAgICBpZiAoIXRoaXMuX3VzYWdlKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIGxldCBkZXB0aEluZm9DcHUgPSBudWxsO1xuICAgICAgICBsZXQgZGVwdGhJbmZvR3B1ID0gbnVsbDtcbiAgICAgICAgaWYgKHRoaXMuX3VzYWdlID09PSBYUkRFUFRIU0VOU0lOR1VTQUdFX0NQVSAmJiB2aWV3KSB7XG4gICAgICAgICAgICBkZXB0aEluZm9DcHUgPSBmcmFtZS5nZXREZXB0aEluZm9ybWF0aW9uKHZpZXcpO1xuICAgICAgICB9IGVsc2UgaWYgKHRoaXMuX3VzYWdlID09PSBYUkRFUFRIU0VOU0lOR1VTQUdFX0dQVSAmJiB2aWV3KSB7XG4gICAgICAgICAgICBkZXB0aEluZm9HcHUgPSBmcmFtZS5nZXREZXB0aEluZm9ybWF0aW9uKHZpZXcpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCh0aGlzLl9kZXB0aEluZm9DcHUgJiYgIWRlcHRoSW5mb0NwdSkgfHwgKCF0aGlzLl9kZXB0aEluZm9DcHUgJiYgZGVwdGhJbmZvQ3B1KSB8fCAodGhpcy5kZXB0aEluZm9HcHUgJiYgIWRlcHRoSW5mb0dwdSkgfHwgKCF0aGlzLl9kZXB0aEluZm9HcHUgJiYgZGVwdGhJbmZvR3B1KSkge1xuICAgICAgICAgICAgdGhpcy5fbWF0cml4RGlydHkgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuX2RlcHRoSW5mb0NwdSA9IGRlcHRoSW5mb0NwdTtcbiAgICAgICAgdGhpcy5fZGVwdGhJbmZvR3B1ID0gZGVwdGhJbmZvR3B1O1xuXG4gICAgICAgIHRoaXMuX3VwZGF0ZVRleHR1cmUoKTtcblxuICAgICAgICBpZiAodGhpcy5fbWF0cml4RGlydHkpIHtcbiAgICAgICAgICAgIHRoaXMuX21hdHJpeERpcnR5ID0gZmFsc2U7XG5cbiAgICAgICAgICAgIGNvbnN0IGRlcHRoSW5mbyA9IHRoaXMuX2RlcHRoSW5mb0NwdSB8fCB0aGlzLl9kZXB0aEluZm9HcHU7XG5cbiAgICAgICAgICAgIGlmIChkZXB0aEluZm8pIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9tYXRyaXguZGF0YS5zZXQoZGVwdGhJbmZvLm5vcm1EZXB0aEJ1ZmZlckZyb21Ob3JtVmlldy5tYXRyaXgpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9tYXRyaXguc2V0SWRlbnRpdHkoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICgodGhpcy5fZGVwdGhJbmZvQ3B1IHx8IHRoaXMuX2RlcHRoSW5mb0dwdSkgJiYgIXRoaXMuX2F2YWlsYWJsZSkge1xuICAgICAgICAgICAgdGhpcy5fYXZhaWxhYmxlID0gdHJ1ZTtcbiAgICAgICAgICAgIHRoaXMuZmlyZSgnYXZhaWxhYmxlJyk7XG4gICAgICAgIH0gZWxzZSBpZiAoIXRoaXMuX2RlcHRoSW5mb0NwdSAmJiAhdGhpcy5fZGVwdGhJbmZvR3B1ICYmIHRoaXMuX2F2YWlsYWJsZSkge1xuICAgICAgICAgICAgdGhpcy5fYXZhaWxhYmxlID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLmZpcmUoJ3VuYXZhaWxhYmxlJyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBHZXQgZGVwdGggdmFsdWUgZnJvbSBkZXB0aCBpbmZvcm1hdGlvbiBpbiBtZXRlcnMuIFVWIGlzIGluIHJhbmdlIG9mIDAuLjEsIHdpdGggb3JpZ2luIGluXG4gICAgICogdG9wLWxlZnQgY29ybmVyIG9mIGEgdGV4dHVyZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSB1IC0gVSBjb29yZGluYXRlIG9mIHBpeGVsIGluIGRlcHRoIHRleHR1cmUsIHdoaWNoIGlzIGluIHJhbmdlIGZyb20gMC4wIHRvXG4gICAgICogMS4wIChsZWZ0IHRvIHJpZ2h0KS5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gdiAtIFYgY29vcmRpbmF0ZSBvZiBwaXhlbCBpbiBkZXB0aCB0ZXh0dXJlLCB3aGljaCBpcyBpbiByYW5nZSBmcm9tIDAuMCB0b1xuICAgICAqIDEuMCAodG9wIHRvIGJvdHRvbSkuXG4gICAgICogQHJldHVybnMge251bWJlcnxudWxsfSBEZXB0aCBpbiBtZXRlcnMgb3IgbnVsbCBpZiBkZXB0aCBpbmZvcm1hdGlvbiBpcyBjdXJyZW50bHkgbm90XG4gICAgICogYXZhaWxhYmxlLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogY29uc3QgZGVwdGggPSBhcHAueHIuZGVwdGhTZW5zaW5nLmdldERlcHRoKHUsIHYpO1xuICAgICAqIGlmIChkZXB0aCAhPT0gbnVsbCkge1xuICAgICAqICAgICAvLyBkZXB0aCBpbiBtZXRlcnNcbiAgICAgKiB9XG4gICAgICovXG4gICAgZ2V0RGVwdGgodSwgdikge1xuICAgICAgICAvLyBUT0RPXG4gICAgICAgIC8vIEdQVSB1c2FnZVxuXG4gICAgICAgIGlmICghdGhpcy5fZGVwdGhJbmZvQ3B1KVxuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG5cbiAgICAgICAgcmV0dXJuIHRoaXMuX2RlcHRoSW5mb0NwdS5nZXREZXB0aEluTWV0ZXJzKHUsIHYpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRydWUgaWYgRGVwdGggU2Vuc2luZyBpcyBzdXBwb3J0ZWQuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICAgKi9cbiAgICBnZXQgc3VwcG9ydGVkKCkge1xuICAgICAgICByZXR1cm4gcGxhdGZvcm0uYnJvd3NlciAmJiAhIXdpbmRvdy5YUkRlcHRoSW5mb3JtYXRpb247XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVHJ1ZSBpZiBkZXB0aCBzZW5zaW5nIGluZm9ybWF0aW9uIGlzIGF2YWlsYWJsZS5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAqIEBleGFtcGxlXG4gICAgICogaWYgKGFwcC54ci5kZXB0aFNlbnNpbmcuYXZhaWxhYmxlKSB7XG4gICAgICogICAgIGNvbnN0IGRlcHRoID0gYXBwLnhyLmRlcHRoU2Vuc2luZy5nZXREZXB0aCh4LCB5KTtcbiAgICAgKiB9XG4gICAgICovXG4gICAgZ2V0IGF2YWlsYWJsZSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2F2YWlsYWJsZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBXaGV0aGVyIHRoZSB1c2FnZSBpcyBDUFUgb3IgR1BVLlxuICAgICAqXG4gICAgICogQHR5cGUge3N0cmluZ31cbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgZ2V0IHVzYWdlKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fdXNhZ2U7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVGhlIGRlcHRoIHNlbnNpbmcgZGF0YSBmb3JtYXQuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7c3RyaW5nfVxuICAgICAqIEBpZ25vcmVcbiAgICAgKi9cbiAgICBnZXQgZGF0YUZvcm1hdCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2RhdGFGb3JtYXQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogV2lkdGggb2YgZGVwdGggdGV4dHVyZSBvciAwIGlmIG5vdCBhdmFpbGFibGUuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqL1xuICAgIGdldCB3aWR0aCgpIHtcbiAgICAgICAgY29uc3QgZGVwdGhJbmZvID0gdGhpcy5fZGVwdGhJbmZvQ3B1IHx8IHRoaXMuX2RlcHRoSW5mb0dwdTtcbiAgICAgICAgcmV0dXJuIGRlcHRoSW5mbyAmJiBkZXB0aEluZm8ud2lkdGggfHwgMDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBIZWlnaHQgb2YgZGVwdGggdGV4dHVyZSBvciAwIGlmIG5vdCBhdmFpbGFibGUuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqL1xuICAgIGdldCBoZWlnaHQoKSB7XG4gICAgICAgIGNvbnN0IGRlcHRoSW5mbyA9IHRoaXMuX2RlcHRoSW5mb0NwdSB8fCB0aGlzLl9kZXB0aEluZm9HcHU7XG4gICAgICAgIHJldHVybiBkZXB0aEluZm8gJiYgZGVwdGhJbmZvLmhlaWdodCB8fCAwO1xuICAgIH1cblxuICAgIC8qIGVzbGludC1kaXNhYmxlIGpzZG9jL2NoZWNrLWV4YW1wbGVzICovXG4gICAgLyoqXG4gICAgICogVGV4dHVyZSB0aGF0IGNvbnRhaW5zIHBhY2tlZCBkZXB0aCBpbmZvcm1hdGlvbi4gVGhlIGZvcm1hdCBvZiB0aGlzIHRleHR1cmUgaXNcbiAgICAgKiB7QGxpbmsgUElYRUxGT1JNQVRfTEE4fS4gSXQgaXMgVVYgdHJhbnNmb3JtZWQgYmFzZWQgb24gdGhlIHVuZGVybHlpbmcgQVIgc3lzdGVtIHdoaWNoIGNhblxuICAgICAqIGJlIG5vcm1hbGl6ZWQgdXNpbmcge0BsaW5rIFhyRGVwdGhTZW5zaW5nI3V2TWF0cml4fS5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtUZXh0dXJlfVxuICAgICAqIEBleGFtcGxlXG4gICAgICogbWF0ZXJpYWwuZGlmZnVzZU1hcCA9IGRlcHRoU2Vuc2luZy50ZXh0dXJlO1xuICAgICAqIEBleGFtcGxlXG4gICAgICogLy8gR0xTTCBzaGFkZXIgdG8gdW5wYWNrIGRlcHRoIHRleHR1cmVcbiAgICAgKiB2YXJ5aW5nIHZlYzIgdlV2MDtcbiAgICAgKlxuICAgICAqIHVuaWZvcm0gc2FtcGxlcjJEIHRleHR1cmVfZGVwdGhTZW5zaW5nTWFwO1xuICAgICAqIHVuaWZvcm0gbWF0NCBtYXRyaXhfZGVwdGhfdXY7XG4gICAgICogdW5pZm9ybSBmbG9hdCBkZXB0aF9yYXdfdG9fbWV0ZXJzO1xuICAgICAqXG4gICAgICogdm9pZCBtYWluKHZvaWQpIHtcbiAgICAgKiAgICAgLy8gdHJhbnNmb3JtIFVWcyB1c2luZyBkZXB0aCBtYXRyaXhcbiAgICAgKiAgICAgdmVjMiB0ZXhDb29yZCA9IChtYXRyaXhfZGVwdGhfdXYgKiB2ZWM0KHZVdjAueHksIDAuMCwgMS4wKSkueHk7XG4gICAgICpcbiAgICAgKiAgICAgLy8gZ2V0IGx1bWluYW5jZSBhbHBoYSBjb21wb25lbnRzIGZyb20gZGVwdGggdGV4dHVyZVxuICAgICAqICAgICB2ZWMyIHBhY2tlZERlcHRoID0gdGV4dHVyZTJEKHRleHR1cmVfZGVwdGhTZW5zaW5nTWFwLCB0ZXhDb29yZCkucmE7XG4gICAgICpcbiAgICAgKiAgICAgLy8gdW5wYWNrIGludG8gc2luZ2xlIHZhbHVlIGluIG1pbGxpbWV0ZXJzXG4gICAgICogICAgIGZsb2F0IGRlcHRoID0gZG90KHBhY2tlZERlcHRoLCB2ZWMyKDI1NS4wLCAyNTYuMCAqIDI1NS4wKSkgKiBkZXB0aF9yYXdfdG9fbWV0ZXJzOyAvLyBtXG4gICAgICpcbiAgICAgKiAgICAgLy8gbm9ybWFsaXplOiAwbSB0byA4bSBkaXN0YW5jZVxuICAgICAqICAgICBkZXB0aCA9IG1pbihkZXB0aCAvIDguMCwgMS4wKTsgLy8gMC4uMSA9IDBtLi44bVxuICAgICAqXG4gICAgICogICAgIC8vIHBhaW50IHNjZW5lIGZyb20gYmxhY2sgdG8gd2hpdGUgYmFzZWQgb24gZGlzdGFuY2VcbiAgICAgKiAgICAgZ2xfRnJhZ0NvbG9yID0gdmVjNChkZXB0aCwgZGVwdGgsIGRlcHRoLCAxLjApO1xuICAgICAqIH1cbiAgICAgKi9cbiAgICBnZXQgdGV4dHVyZSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3RleHR1cmU7XG4gICAgfVxuICAgIC8qIGVzbGludC1lbmFibGUganNkb2MvY2hlY2stZXhhbXBsZXMgKi9cblxuICAgIC8qKlxuICAgICAqIDR4NCBtYXRyaXggdGhhdCBzaG91bGQgYmUgdXNlZCB0byB0cmFuc2Zvcm0gZGVwdGggdGV4dHVyZSBVVnMgdG8gbm9ybWFsaXplZCBVVnMgaW4gYSBzaGFkZXIuXG4gICAgICogSXQgaXMgdXBkYXRlZCB3aGVuIHRoZSBkZXB0aCB0ZXh0dXJlIGlzIHJlc2l6ZWQuIFJlZmVyIHRvIHtAbGluayBYckRlcHRoU2Vuc2luZyNyZXNpemV9LlxuICAgICAqXG4gICAgICogQHR5cGUge01hdDR9XG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBtYXRlcmlhbC5zZXRQYXJhbWV0ZXIoJ21hdHJpeF9kZXB0aF91dicsIGRlcHRoU2Vuc2luZy51dk1hdHJpeC5kYXRhKTtcbiAgICAgKi9cbiAgICBnZXQgdXZNYXRyaXgoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9tYXRyaXg7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTXVsdGlwbHkgdGhpcyBjb2VmZmljaWVudCBudW1iZXIgYnkgcmF3IGRlcHRoIHZhbHVlIHRvIGdldCBkZXB0aCBpbiBtZXRlcnMuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqIEBleGFtcGxlXG4gICAgICogbWF0ZXJpYWwuc2V0UGFyYW1ldGVyKCdkZXB0aF9yYXdfdG9fbWV0ZXJzJywgZGVwdGhTZW5zaW5nLnJhd1ZhbHVlVG9NZXRlcnMpO1xuICAgICAqL1xuICAgIGdldCByYXdWYWx1ZVRvTWV0ZXJzKCkge1xuICAgICAgICBjb25zdCBkZXB0aEluZm8gPSB0aGlzLl9kZXB0aEluZm9DcHUgfHwgdGhpcy5fZGVwdGhJbmZvR3B1O1xuICAgICAgICByZXR1cm4gZGVwdGhJbmZvICYmIGRlcHRoSW5mby5yYXdWYWx1ZVRvTWV0ZXJzIHx8IDA7XG4gICAgfVxufVxuXG5leHBvcnQgeyBYckRlcHRoU2Vuc2luZyB9O1xuIl0sIm5hbWVzIjpbIlhyRGVwdGhTZW5zaW5nIiwiRXZlbnRIYW5kbGVyIiwiY29uc3RydWN0b3IiLCJtYW5hZ2VyIiwiX21hbmFnZXIiLCJfYXZhaWxhYmxlIiwiX2RlcHRoSW5mb0NwdSIsIl9kZXB0aEluZm9HcHUiLCJfdXNhZ2UiLCJfZGF0YUZvcm1hdCIsIl9tYXRyaXhEaXJ0eSIsIl9tYXRyaXgiLCJNYXQ0IiwiX2VtcHR5QnVmZmVyIiwiVWludDhBcnJheSIsIl9kZXB0aEJ1ZmZlciIsIl90ZXh0dXJlIiwiVGV4dHVyZSIsImFwcCIsImdyYXBoaWNzRGV2aWNlIiwiZm9ybWF0IiwiUElYRUxGT1JNQVRfTEE4IiwibWlwbWFwcyIsImFkZHJlc3NVIiwiQUREUkVTU19DTEFNUF9UT19FREdFIiwiYWRkcmVzc1YiLCJtaW5GaWx0ZXIiLCJGSUxURVJfTElORUFSIiwibWFnRmlsdGVyIiwibmFtZSIsInN1cHBvcnRlZCIsIm9uIiwiX29uU2Vzc2lvblN0YXJ0IiwiX29uU2Vzc2lvbkVuZCIsImRlc3Ryb3kiLCJzZXNzaW9uIiwiZGVwdGhVc2FnZSIsImRlcHRoRGF0YUZvcm1hdCIsImV4IiwiZmlyZSIsIl93aWR0aCIsIl9oZWlnaHQiLCJfbGV2ZWxzIiwidXBsb2FkIiwiX3VwZGF0ZVRleHR1cmUiLCJkZXB0aEluZm8iLCJyZXNpemVkIiwid2lkdGgiLCJoZWlnaHQiLCJkYXRhQnVmZmVyIiwiZGF0YSIsInRleHR1cmUiLCJ1cGRhdGUiLCJmcmFtZSIsInZpZXciLCJkZXB0aEluZm9DcHUiLCJkZXB0aEluZm9HcHUiLCJYUkRFUFRIU0VOU0lOR1VTQUdFX0NQVSIsImdldERlcHRoSW5mb3JtYXRpb24iLCJYUkRFUFRIU0VOU0lOR1VTQUdFX0dQVSIsInNldCIsIm5vcm1EZXB0aEJ1ZmZlckZyb21Ob3JtVmlldyIsIm1hdHJpeCIsInNldElkZW50aXR5IiwiZ2V0RGVwdGgiLCJ1IiwidiIsImdldERlcHRoSW5NZXRlcnMiLCJwbGF0Zm9ybSIsImJyb3dzZXIiLCJ3aW5kb3ciLCJYUkRlcHRoSW5mb3JtYXRpb24iLCJhdmFpbGFibGUiLCJ1c2FnZSIsImRhdGFGb3JtYXQiLCJ1dk1hdHJpeCIsInJhd1ZhbHVlVG9NZXRlcnMiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFTQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLE1BQU1BLGNBQWMsU0FBU0MsWUFB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
