import { Color } from '../core/math/color.js';
import { Mat4 } from '../core/math/mat4.js';
import { Vec3 } from '../core/math/vec3.js';
import { Vec4 } from '../core/math/vec4.js';
import { math } from '../core/math/math.js';
import { Frustum } from '../core/shape/frustum.js';
import { ASPECT_AUTO, LAYERID_WORLD, LAYERID_DEPTH, LAYERID_SKYBOX, LAYERID_UI, LAYERID_IMMEDIATE, PROJECTION_PERSPECTIVE } from './constants.js';

// pre-allocated temp variables
const _deviceCoord = new Vec3();
const _halfSize = new Vec3();
const _point = new Vec3();
const _invViewProjMat = new Mat4();
const _frustumPoints = [new Vec3(), new Vec3(), new Vec3(), new Vec3(), new Vec3(), new Vec3(), new Vec3(), new Vec3()];

/**
 * A camera.
 *
 * @ignore
 */
class Camera {
  constructor() {
    /**
     * @type {import('./shader-pass.js').ShaderPassInfo|null}
     */
    this.shaderPassInfo = void 0;
    this._aspectRatio = 16 / 9;
    this._aspectRatioMode = ASPECT_AUTO;
    this._calculateProjection = null;
    this._calculateTransform = null;
    this._clearColor = new Color(0.75, 0.75, 0.75, 1);
    this._clearColorBuffer = true;
    this._clearDepth = 1;
    this._clearDepthBuffer = true;
    this._clearStencil = 0;
    this._clearStencilBuffer = true;
    this._cullFaces = true;
    this._farClip = 1000;
    this._flipFaces = false;
    this._fov = 45;
    this._frustumCulling = true;
    this._horizontalFov = false;
    this._layers = [LAYERID_WORLD, LAYERID_DEPTH, LAYERID_SKYBOX, LAYERID_UI, LAYERID_IMMEDIATE];
    this._layersSet = new Set(this._layers);
    this._nearClip = 0.1;
    this._node = null;
    this._orthoHeight = 10;
    this._projection = PROJECTION_PERSPECTIVE;
    this._rect = new Vec4(0, 0, 1, 1);
    this._renderTarget = null;
    this._scissorRect = new Vec4(0, 0, 1, 1);
    this._scissorRectClear = false; // by default rect is used when clearing. this allows scissorRect to be used when clearing.
    this._aperture = 16.0;
    this._shutter = 1.0 / 1000.0;
    this._sensitivity = 1000;
    this._projMat = new Mat4();
    this._projMatDirty = true;
    this._projMatSkybox = new Mat4(); // projection matrix used by skybox rendering shader is always perspective
    this._viewMat = new Mat4();
    this._viewMatDirty = true;
    this._viewProjMat = new Mat4();
    this._viewProjMatDirty = true;
    this.frustum = new Frustum();

    // Set by XrManager
    this._xr = null;
    this._xrProperties = {
      horizontalFov: this._horizontalFov,
      fov: this._fov,
      aspectRatio: this._aspectRatio,
      farClip: this._farClip,
      nearClip: this._nearClip
    };
  }

  /**
   * True if the camera clears the full render target. (viewport / scissor are full size)
   */
  get fullSizeClearRect() {
    const rect = this._scissorRectClear ? this.scissorRect : this._rect;
    return rect.x === 0 && rect.y === 0 && rect.z === 1 && rect.w === 1;
  }
  set aspectRatio(newValue) {
    if (this._aspectRatio !== newValue) {
      this._aspectRatio = newValue;
      this._projMatDirty = true;
    }
  }
  get aspectRatio() {
    var _this$xr;
    return (_this$xr = this.xr) != null && _this$xr.active ? this._xrProperties.aspectRatio : this._aspectRatio;
  }
  set aspectRatioMode(newValue) {
    if (this._aspectRatioMode !== newValue) {
      this._aspectRatioMode = newValue;
      this._projMatDirty = true;
    }
  }
  get aspectRatioMode() {
    return this._aspectRatioMode;
  }
  set calculateProjection(newValue) {
    this._calculateProjection = newValue;
    this._projMatDirty = true;
  }
  get calculateProjection() {
    return this._calculateProjection;
  }
  set calculateTransform(newValue) {
    this._calculateTransform = newValue;
  }
  get calculateTransform() {
    return this._calculateTransform;
  }
  set clearColor(newValue) {
    this._clearColor.copy(newValue);
  }
  get clearColor() {
    return this._clearColor;
  }
  set clearColorBuffer(newValue) {
    this._clearColorBuffer = newValue;
  }
  get clearColorBuffer() {
    return this._clearColorBuffer;
  }
  set clearDepth(newValue) {
    this._clearDepth = newValue;
  }
  get clearDepth() {
    return this._clearDepth;
  }
  set clearDepthBuffer(newValue) {
    this._clearDepthBuffer = newValue;
  }
  get clearDepthBuffer() {
    return this._clearDepthBuffer;
  }
  set clearStencil(newValue) {
    this._clearStencil = newValue;
  }
  get clearStencil() {
    return this._clearStencil;
  }
  set clearStencilBuffer(newValue) {
    this._clearStencilBuffer = newValue;
  }
  get clearStencilBuffer() {
    return this._clearStencilBuffer;
  }
  set cullFaces(newValue) {
    this._cullFaces = newValue;
  }
  get cullFaces() {
    return this._cullFaces;
  }
  set farClip(newValue) {
    if (this._farClip !== newValue) {
      this._farClip = newValue;
      this._projMatDirty = true;
    }
  }
  get farClip() {
    var _this$xr2;
    return (_this$xr2 = this.xr) != null && _this$xr2.active ? this._xrProperties.farClip : this._farClip;
  }
  set flipFaces(newValue) {
    this._flipFaces = newValue;
  }
  get flipFaces() {
    return this._flipFaces;
  }
  set fov(newValue) {
    if (this._fov !== newValue) {
      this._fov = newValue;
      this._projMatDirty = true;
    }
  }
  get fov() {
    var _this$xr3;
    return (_this$xr3 = this.xr) != null && _this$xr3.active ? this._xrProperties.fov : this._fov;
  }
  set frustumCulling(newValue) {
    this._frustumCulling = newValue;
  }
  get frustumCulling() {
    return this._frustumCulling;
  }
  set horizontalFov(newValue) {
    if (this._horizontalFov !== newValue) {
      this._horizontalFov = newValue;
      this._projMatDirty = true;
    }
  }
  get horizontalFov() {
    var _this$xr4;
    return (_this$xr4 = this.xr) != null && _this$xr4.active ? this._xrProperties.horizontalFov : this._horizontalFov;
  }
  set layers(newValue) {
    this._layers = newValue.slice(0);
    this._layersSet = new Set(this._layers);
  }
  get layers() {
    return this._layers;
  }
  get layersSet() {
    return this._layersSet;
  }
  set nearClip(newValue) {
    if (this._nearClip !== newValue) {
      this._nearClip = newValue;
      this._projMatDirty = true;
    }
  }
  get nearClip() {
    var _this$xr5;
    return (_this$xr5 = this.xr) != null && _this$xr5.active ? this._xrProperties.nearClip : this._nearClip;
  }
  set node(newValue) {
    this._node = newValue;
  }
  get node() {
    return this._node;
  }
  set orthoHeight(newValue) {
    if (this._orthoHeight !== newValue) {
      this._orthoHeight = newValue;
      this._projMatDirty = true;
    }
  }
  get orthoHeight() {
    return this._orthoHeight;
  }
  set projection(newValue) {
    if (this._projection !== newValue) {
      this._projection = newValue;
      this._projMatDirty = true;
    }
  }
  get projection() {
    return this._projection;
  }
  get projectionMatrix() {
    this._evaluateProjectionMatrix();
    return this._projMat;
  }
  set rect(newValue) {
    this._rect.copy(newValue);
  }
  get rect() {
    return this._rect;
  }
  set renderTarget(newValue) {
    this._renderTarget = newValue;
  }
  get renderTarget() {
    return this._renderTarget;
  }
  set scissorRect(newValue) {
    this._scissorRect.copy(newValue);
  }
  get scissorRect() {
    return this._scissorRect;
  }
  get viewMatrix() {
    if (this._viewMatDirty) {
      const wtm = this._node.getWorldTransform();
      this._viewMat.copy(wtm).invert();
      this._viewMatDirty = false;
    }
    return this._viewMat;
  }
  set aperture(newValue) {
    this._aperture = newValue;
  }
  get aperture() {
    return this._aperture;
  }
  set sensitivity(newValue) {
    this._sensitivity = newValue;
  }
  get sensitivity() {
    return this._sensitivity;
  }
  set shutter(newValue) {
    this._shutter = newValue;
  }
  get shutter() {
    return this._shutter;
  }
  set xr(newValue) {
    if (this._xr !== newValue) {
      this._xr = newValue;
      this._projMatDirty = true;
    }
  }
  get xr() {
    return this._xr;
  }

  /**
   * Creates a duplicate of the camera.
   *
   * @returns {Camera} A cloned Camera.
   */
  clone() {
    return new Camera().copy(this);
  }

  /**
   * Copies one camera to another.
   *
   * @param {Camera} other - Camera to copy.
   * @returns {Camera} Self for chaining.
   */
  copy(other) {
    // We aren't using the getters and setters because there is additional logic
    // around using WebXR in the getters for these properties so that functions
    // like screenToWorld work correctly with other systems like the UI input
    // system
    this._aspectRatio = other._aspectRatio;
    this._farClip = other._farClip;
    this._fov = other._fov;
    this._horizontalFov = other._horizontalFov;
    this._nearClip = other._nearClip;
    this._xrProperties.aspectRatio = other._xrProperties.aspectRatio;
    this._xrProperties.farClip = other._xrProperties.farClip;
    this._xrProperties.fov = other._xrProperties.fov;
    this._xrProperties.horizontalFov = other._xrProperties.horizontalFov;
    this._xrProperties.nearClip = other._xrProperties.nearClip;
    this.aspectRatioMode = other.aspectRatioMode;
    this.calculateProjection = other.calculateProjection;
    this.calculateTransform = other.calculateTransform;
    this.clearColor = other.clearColor;
    this.clearColorBuffer = other.clearColorBuffer;
    this.clearDepth = other.clearDepth;
    this.clearDepthBuffer = other.clearDepthBuffer;
    this.clearStencil = other.clearStencil;
    this.clearStencilBuffer = other.clearStencilBuffer;
    this.cullFaces = other.cullFaces;
    this.flipFaces = other.flipFaces;
    this.frustumCulling = other.frustumCulling;
    this.layers = other.layers;
    this.orthoHeight = other.orthoHeight;
    this.projection = other.projection;
    this.rect = other.rect;
    this.renderTarget = other.renderTarget;
    this.scissorRect = other.scissorRect;
    this.aperture = other.aperture;
    this.shutter = other.shutter;
    this.sensitivity = other.sensitivity;
    this.shaderPassInfo = other.shaderPassInfo;
    this._projMatDirty = true;
    return this;
  }
  _updateViewProjMat() {
    if (this._projMatDirty || this._viewMatDirty || this._viewProjMatDirty) {
      this._viewProjMat.mul2(this.projectionMatrix, this.viewMatrix);
      this._viewProjMatDirty = false;
    }
  }

  /**
   * Convert a point from 3D world space to 2D canvas pixel space.
   *
   * @param {Vec3} worldCoord - The world space coordinate to transform.
   * @param {number} cw - The width of PlayCanvas' canvas element.
   * @param {number} ch - The height of PlayCanvas' canvas element.
   * @param {Vec3} [screenCoord] - 3D vector to receive screen coordinate result.
   * @returns {Vec3} The screen space coordinate.
   */
  worldToScreen(worldCoord, cw, ch, screenCoord = new Vec3()) {
    this._updateViewProjMat();
    this._viewProjMat.transformPoint(worldCoord, screenCoord);

    // calculate w co-coord
    const vpm = this._viewProjMat.data;
    const w = worldCoord.x * vpm[3] + worldCoord.y * vpm[7] + worldCoord.z * vpm[11] + 1 * vpm[15];
    screenCoord.x = (screenCoord.x / w + 1) * 0.5 * cw;
    screenCoord.y = (1 - screenCoord.y / w) * 0.5 * ch;
    return screenCoord;
  }

  /**
   * Convert a point from 2D canvas pixel space to 3D world space.
   *
   * @param {number} x - X coordinate on PlayCanvas' canvas element.
   * @param {number} y - Y coordinate on PlayCanvas' canvas element.
   * @param {number} z - The distance from the camera in world space to create the new point.
   * @param {number} cw - The width of PlayCanvas' canvas element.
   * @param {number} ch - The height of PlayCanvas' canvas element.
   * @param {Vec3} [worldCoord] - 3D vector to receive world coordinate result.
   * @returns {Vec3} The world space coordinate.
   */
  screenToWorld(x, y, z, cw, ch, worldCoord = new Vec3()) {
    // Calculate the screen click as a point on the far plane of the normalized device coordinate 'box' (z=1)
    const range = this.farClip - this.nearClip;
    _deviceCoord.set(x / cw, (ch - y) / ch, z / range);
    _deviceCoord.mulScalar(2);
    _deviceCoord.sub(Vec3.ONE);
    if (this._projection === PROJECTION_PERSPECTIVE) {
      // calculate half width and height at the near clip plane
      Mat4._getPerspectiveHalfSize(_halfSize, this.fov, this.aspectRatio, this.nearClip, this.horizontalFov);

      // scale by normalized screen coordinates
      _halfSize.x *= _deviceCoord.x;
      _halfSize.y *= _deviceCoord.y;

      // transform to world space
      const invView = this._node.getWorldTransform();
      _halfSize.z = -this.nearClip;
      invView.transformPoint(_halfSize, _point);

      // point along camera->_point ray at distance z from the camera
      const cameraPos = this._node.getPosition();
      worldCoord.sub2(_point, cameraPos);
      worldCoord.normalize();
      worldCoord.mulScalar(z);
      worldCoord.add(cameraPos);
    } else {
      this._updateViewProjMat();
      _invViewProjMat.copy(this._viewProjMat).invert();

      // Transform to world space
      _invViewProjMat.transformPoint(_deviceCoord, worldCoord);
    }
    return worldCoord;
  }
  _evaluateProjectionMatrix() {
    if (this._projMatDirty) {
      if (this._projection === PROJECTION_PERSPECTIVE) {
        this._projMat.setPerspective(this.fov, this.aspectRatio, this.nearClip, this.farClip, this.horizontalFov);
        this._projMatSkybox.copy(this._projMat);
      } else {
        const y = this._orthoHeight;
        const x = y * this.aspectRatio;
        this._projMat.setOrtho(-x, x, -y, y, this.nearClip, this.farClip);
        this._projMatSkybox.setPerspective(this.fov, this.aspectRatio, this.nearClip, this.farClip);
      }
      this._projMatDirty = false;
    }
  }
  getProjectionMatrixSkybox() {
    this._evaluateProjectionMatrix();
    return this._projMatSkybox;
  }
  getExposure() {
    const ev100 = Math.log2(this._aperture * this._aperture / this._shutter * 100.0 / this._sensitivity);
    return 1.0 / (Math.pow(2.0, ev100) * 1.2);
  }

  // returns estimated size of the sphere on the screen in range of [0..1]
  // 0 - infinitely small, 1 - full screen or larger
  getScreenSize(sphere) {
    if (this._projection === PROJECTION_PERSPECTIVE) {
      // camera to sphere distance
      const distance = this._node.getPosition().distance(sphere.center);

      // if we're inside the sphere
      if (distance < sphere.radius) {
        return 1;
      }

      // The view-angle of the bounding sphere rendered on screen
      const viewAngle = Math.asin(sphere.radius / distance);

      // This assumes the near clipping plane is at a distance of 1
      const sphereViewHeight = Math.tan(viewAngle);

      // The size of (half) the screen if the near clipping plane is at a distance of 1
      const screenViewHeight = Math.tan(this.fov / 2 * math.DEG_TO_RAD);

      // The ratio of the geometry's screen size compared to the actual size of the screen
      return Math.min(sphereViewHeight / screenViewHeight, 1);
    }

    // ortho
    return math.clamp(sphere.radius / this._orthoHeight, 0, 1);
  }

  /**
   * Returns an array of corners of the frustum of the camera in the local coordinate system of the camera.
   *
   * @param {number} [near] - Near distance for the frustum points. Defaults to the near clip distance of the camera.
   * @param {number} [far] - Far distance for the frustum points. Defaults to the far clip distance of the camera.
   * @returns {Vec3[]} - An array of corners, using a global storage space.
   */
  getFrustumCorners(near = this.nearClip, far = this.farClip) {
    const fov = this.fov * Math.PI / 180.0;
    let y = this._projection === PROJECTION_PERSPECTIVE ? Math.tan(fov / 2.0) * near : this._orthoHeight;
    let x = y * this.aspectRatio;
    const points = _frustumPoints;
    points[0].x = x;
    points[0].y = -y;
    points[0].z = -near;
    points[1].x = x;
    points[1].y = y;
    points[1].z = -near;
    points[2].x = -x;
    points[2].y = y;
    points[2].z = -near;
    points[3].x = -x;
    points[3].y = -y;
    points[3].z = -near;
    if (this._projection === PROJECTION_PERSPECTIVE) {
      y = Math.tan(fov / 2.0) * far;
      x = y * this.aspectRatio;
    }
    points[4].x = x;
    points[4].y = -y;
    points[4].z = -far;
    points[5].x = x;
    points[5].y = y;
    points[5].z = -far;
    points[6].x = -x;
    points[6].y = y;
    points[6].z = -far;
    points[7].x = -x;
    points[7].y = -y;
    points[7].z = -far;
    return points;
  }

  /**
   * Sets XR camera properties that should be derived physical camera in {@link XrManager}.
   *
   * @param {object} [properties] - Properties object.
   * @param {number} [properties.aspectRatio] - Aspect ratio.
   * @param {number} [properties.farClip] - Far clip.
   * @param {number} [properties.fov] - Field of view.
   * @param {boolean} [properties.horizontalFov] - Enable horizontal field of view.
   * @param {number} [properties.nearClip] - Near clip.
   */
  setXrProperties(properties) {
    Object.assign(this._xrProperties, properties);
    this._projMatDirty = true;
  }
}

export { Camera };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2FtZXJhLmpzIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvc2NlbmUvY2FtZXJhLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IENvbG9yIH0gZnJvbSAnLi4vY29yZS9tYXRoL2NvbG9yLmpzJztcbmltcG9ydCB7IE1hdDQgfSBmcm9tICcuLi9jb3JlL21hdGgvbWF0NC5qcyc7XG5pbXBvcnQgeyBWZWMzIH0gZnJvbSAnLi4vY29yZS9tYXRoL3ZlYzMuanMnO1xuaW1wb3J0IHsgVmVjNCB9IGZyb20gJy4uL2NvcmUvbWF0aC92ZWM0LmpzJztcbmltcG9ydCB7IG1hdGggfSBmcm9tICcuLi9jb3JlL21hdGgvbWF0aC5qcyc7XG5cbmltcG9ydCB7IEZydXN0dW0gfSBmcm9tICcuLi9jb3JlL3NoYXBlL2ZydXN0dW0uanMnO1xuXG5pbXBvcnQge1xuICAgIEFTUEVDVF9BVVRPLCBQUk9KRUNUSU9OX1BFUlNQRUNUSVZFLFxuICAgIExBWUVSSURfV09STEQsIExBWUVSSURfREVQVEgsIExBWUVSSURfU0tZQk9YLCBMQVlFUklEX1VJLCBMQVlFUklEX0lNTUVESUFURVxufSBmcm9tICcuL2NvbnN0YW50cy5qcyc7XG5cbi8vIHByZS1hbGxvY2F0ZWQgdGVtcCB2YXJpYWJsZXNcbmNvbnN0IF9kZXZpY2VDb29yZCA9IG5ldyBWZWMzKCk7XG5jb25zdCBfaGFsZlNpemUgPSBuZXcgVmVjMygpO1xuY29uc3QgX3BvaW50ID0gbmV3IFZlYzMoKTtcbmNvbnN0IF9pbnZWaWV3UHJvak1hdCA9IG5ldyBNYXQ0KCk7XG5jb25zdCBfZnJ1c3R1bVBvaW50cyA9IFtuZXcgVmVjMygpLCBuZXcgVmVjMygpLCBuZXcgVmVjMygpLCBuZXcgVmVjMygpLCBuZXcgVmVjMygpLCBuZXcgVmVjMygpLCBuZXcgVmVjMygpLCBuZXcgVmVjMygpXTtcblxuLyoqXG4gKiBBIGNhbWVyYS5cbiAqXG4gKiBAaWdub3JlXG4gKi9cbmNsYXNzIENhbWVyYSB7XG4gICAgLyoqXG4gICAgICogQHR5cGUge2ltcG9ydCgnLi9zaGFkZXItcGFzcy5qcycpLlNoYWRlclBhc3NJbmZvfG51bGx9XG4gICAgICovXG4gICAgc2hhZGVyUGFzc0luZm87XG5cbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgdGhpcy5fYXNwZWN0UmF0aW8gPSAxNiAvIDk7XG4gICAgICAgIHRoaXMuX2FzcGVjdFJhdGlvTW9kZSA9IEFTUEVDVF9BVVRPO1xuICAgICAgICB0aGlzLl9jYWxjdWxhdGVQcm9qZWN0aW9uID0gbnVsbDtcbiAgICAgICAgdGhpcy5fY2FsY3VsYXRlVHJhbnNmb3JtID0gbnVsbDtcbiAgICAgICAgdGhpcy5fY2xlYXJDb2xvciA9IG5ldyBDb2xvcigwLjc1LCAwLjc1LCAwLjc1LCAxKTtcbiAgICAgICAgdGhpcy5fY2xlYXJDb2xvckJ1ZmZlciA9IHRydWU7XG4gICAgICAgIHRoaXMuX2NsZWFyRGVwdGggPSAxO1xuICAgICAgICB0aGlzLl9jbGVhckRlcHRoQnVmZmVyID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5fY2xlYXJTdGVuY2lsID0gMDtcbiAgICAgICAgdGhpcy5fY2xlYXJTdGVuY2lsQnVmZmVyID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5fY3VsbEZhY2VzID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5fZmFyQ2xpcCA9IDEwMDA7XG4gICAgICAgIHRoaXMuX2ZsaXBGYWNlcyA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9mb3YgPSA0NTtcbiAgICAgICAgdGhpcy5fZnJ1c3R1bUN1bGxpbmcgPSB0cnVlO1xuICAgICAgICB0aGlzLl9ob3Jpem9udGFsRm92ID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX2xheWVycyA9IFtMQVlFUklEX1dPUkxELCBMQVlFUklEX0RFUFRILCBMQVlFUklEX1NLWUJPWCwgTEFZRVJJRF9VSSwgTEFZRVJJRF9JTU1FRElBVEVdO1xuICAgICAgICB0aGlzLl9sYXllcnNTZXQgPSBuZXcgU2V0KHRoaXMuX2xheWVycyk7XG4gICAgICAgIHRoaXMuX25lYXJDbGlwID0gMC4xO1xuICAgICAgICB0aGlzLl9ub2RlID0gbnVsbDtcbiAgICAgICAgdGhpcy5fb3J0aG9IZWlnaHQgPSAxMDtcbiAgICAgICAgdGhpcy5fcHJvamVjdGlvbiA9IFBST0pFQ1RJT05fUEVSU1BFQ1RJVkU7XG4gICAgICAgIHRoaXMuX3JlY3QgPSBuZXcgVmVjNCgwLCAwLCAxLCAxKTtcbiAgICAgICAgdGhpcy5fcmVuZGVyVGFyZ2V0ID0gbnVsbDtcbiAgICAgICAgdGhpcy5fc2Npc3NvclJlY3QgPSBuZXcgVmVjNCgwLCAwLCAxLCAxKTtcbiAgICAgICAgdGhpcy5fc2Npc3NvclJlY3RDbGVhciA9IGZhbHNlOyAvLyBieSBkZWZhdWx0IHJlY3QgaXMgdXNlZCB3aGVuIGNsZWFyaW5nLiB0aGlzIGFsbG93cyBzY2lzc29yUmVjdCB0byBiZSB1c2VkIHdoZW4gY2xlYXJpbmcuXG4gICAgICAgIHRoaXMuX2FwZXJ0dXJlID0gMTYuMDtcbiAgICAgICAgdGhpcy5fc2h1dHRlciA9IDEuMCAvIDEwMDAuMDtcbiAgICAgICAgdGhpcy5fc2Vuc2l0aXZpdHkgPSAxMDAwO1xuXG4gICAgICAgIHRoaXMuX3Byb2pNYXQgPSBuZXcgTWF0NCgpO1xuICAgICAgICB0aGlzLl9wcm9qTWF0RGlydHkgPSB0cnVlO1xuICAgICAgICB0aGlzLl9wcm9qTWF0U2t5Ym94ID0gbmV3IE1hdDQoKTsgLy8gcHJvamVjdGlvbiBtYXRyaXggdXNlZCBieSBza3lib3ggcmVuZGVyaW5nIHNoYWRlciBpcyBhbHdheXMgcGVyc3BlY3RpdmVcbiAgICAgICAgdGhpcy5fdmlld01hdCA9IG5ldyBNYXQ0KCk7XG4gICAgICAgIHRoaXMuX3ZpZXdNYXREaXJ0eSA9IHRydWU7XG4gICAgICAgIHRoaXMuX3ZpZXdQcm9qTWF0ID0gbmV3IE1hdDQoKTtcbiAgICAgICAgdGhpcy5fdmlld1Byb2pNYXREaXJ0eSA9IHRydWU7XG5cbiAgICAgICAgdGhpcy5mcnVzdHVtID0gbmV3IEZydXN0dW0oKTtcblxuICAgICAgICAvLyBTZXQgYnkgWHJNYW5hZ2VyXG4gICAgICAgIHRoaXMuX3hyID0gbnVsbDtcbiAgICAgICAgdGhpcy5feHJQcm9wZXJ0aWVzID0ge1xuICAgICAgICAgICAgaG9yaXpvbnRhbEZvdjogdGhpcy5faG9yaXpvbnRhbEZvdixcbiAgICAgICAgICAgIGZvdjogdGhpcy5fZm92LFxuICAgICAgICAgICAgYXNwZWN0UmF0aW86IHRoaXMuX2FzcGVjdFJhdGlvLFxuICAgICAgICAgICAgZmFyQ2xpcDogdGhpcy5fZmFyQ2xpcCxcbiAgICAgICAgICAgIG5lYXJDbGlwOiB0aGlzLl9uZWFyQ2xpcFxuICAgICAgICB9O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRydWUgaWYgdGhlIGNhbWVyYSBjbGVhcnMgdGhlIGZ1bGwgcmVuZGVyIHRhcmdldC4gKHZpZXdwb3J0IC8gc2Npc3NvciBhcmUgZnVsbCBzaXplKVxuICAgICAqL1xuICAgIGdldCBmdWxsU2l6ZUNsZWFyUmVjdCgpIHtcbiAgICAgICAgY29uc3QgcmVjdCA9IHRoaXMuX3NjaXNzb3JSZWN0Q2xlYXIgPyB0aGlzLnNjaXNzb3JSZWN0IDogdGhpcy5fcmVjdDtcbiAgICAgICAgcmV0dXJuIHJlY3QueCA9PT0gMCAmJiByZWN0LnkgPT09IDAgJiYgcmVjdC56ID09PSAxICYmIHJlY3QudyA9PT0gMTtcbiAgICB9XG5cbiAgICBzZXQgYXNwZWN0UmF0aW8obmV3VmFsdWUpIHtcbiAgICAgICAgaWYgKHRoaXMuX2FzcGVjdFJhdGlvICE9PSBuZXdWYWx1ZSkge1xuICAgICAgICAgICAgdGhpcy5fYXNwZWN0UmF0aW8gPSBuZXdWYWx1ZTtcbiAgICAgICAgICAgIHRoaXMuX3Byb2pNYXREaXJ0eSA9IHRydWU7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBnZXQgYXNwZWN0UmF0aW8oKSB7XG4gICAgICAgIHJldHVybiAodGhpcy54cj8uYWN0aXZlKSA/IHRoaXMuX3hyUHJvcGVydGllcy5hc3BlY3RSYXRpbyA6IHRoaXMuX2FzcGVjdFJhdGlvO1xuICAgIH1cblxuICAgIHNldCBhc3BlY3RSYXRpb01vZGUobmV3VmFsdWUpIHtcbiAgICAgICAgaWYgKHRoaXMuX2FzcGVjdFJhdGlvTW9kZSAhPT0gbmV3VmFsdWUpIHtcbiAgICAgICAgICAgIHRoaXMuX2FzcGVjdFJhdGlvTW9kZSA9IG5ld1ZhbHVlO1xuICAgICAgICAgICAgdGhpcy5fcHJvak1hdERpcnR5ID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGdldCBhc3BlY3RSYXRpb01vZGUoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hc3BlY3RSYXRpb01vZGU7XG4gICAgfVxuXG4gICAgc2V0IGNhbGN1bGF0ZVByb2plY3Rpb24obmV3VmFsdWUpIHtcbiAgICAgICAgdGhpcy5fY2FsY3VsYXRlUHJvamVjdGlvbiA9IG5ld1ZhbHVlO1xuICAgICAgICB0aGlzLl9wcm9qTWF0RGlydHkgPSB0cnVlO1xuICAgIH1cblxuICAgIGdldCBjYWxjdWxhdGVQcm9qZWN0aW9uKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fY2FsY3VsYXRlUHJvamVjdGlvbjtcbiAgICB9XG5cbiAgICBzZXQgY2FsY3VsYXRlVHJhbnNmb3JtKG5ld1ZhbHVlKSB7XG4gICAgICAgIHRoaXMuX2NhbGN1bGF0ZVRyYW5zZm9ybSA9IG5ld1ZhbHVlO1xuICAgIH1cblxuICAgIGdldCBjYWxjdWxhdGVUcmFuc2Zvcm0oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9jYWxjdWxhdGVUcmFuc2Zvcm07XG4gICAgfVxuXG4gICAgc2V0IGNsZWFyQ29sb3IobmV3VmFsdWUpIHtcbiAgICAgICAgdGhpcy5fY2xlYXJDb2xvci5jb3B5KG5ld1ZhbHVlKTtcbiAgICB9XG5cbiAgICBnZXQgY2xlYXJDb2xvcigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2NsZWFyQ29sb3I7XG4gICAgfVxuXG4gICAgc2V0IGNsZWFyQ29sb3JCdWZmZXIobmV3VmFsdWUpIHtcbiAgICAgICAgdGhpcy5fY2xlYXJDb2xvckJ1ZmZlciA9IG5ld1ZhbHVlO1xuICAgIH1cblxuICAgIGdldCBjbGVhckNvbG9yQnVmZmVyKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fY2xlYXJDb2xvckJ1ZmZlcjtcbiAgICB9XG5cbiAgICBzZXQgY2xlYXJEZXB0aChuZXdWYWx1ZSkge1xuICAgICAgICB0aGlzLl9jbGVhckRlcHRoID0gbmV3VmFsdWU7XG4gICAgfVxuXG4gICAgZ2V0IGNsZWFyRGVwdGgoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9jbGVhckRlcHRoO1xuICAgIH1cblxuICAgIHNldCBjbGVhckRlcHRoQnVmZmVyKG5ld1ZhbHVlKSB7XG4gICAgICAgIHRoaXMuX2NsZWFyRGVwdGhCdWZmZXIgPSBuZXdWYWx1ZTtcbiAgICB9XG5cbiAgICBnZXQgY2xlYXJEZXB0aEJ1ZmZlcigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2NsZWFyRGVwdGhCdWZmZXI7XG4gICAgfVxuXG4gICAgc2V0IGNsZWFyU3RlbmNpbChuZXdWYWx1ZSkge1xuICAgICAgICB0aGlzLl9jbGVhclN0ZW5jaWwgPSBuZXdWYWx1ZTtcbiAgICB9XG5cbiAgICBnZXQgY2xlYXJTdGVuY2lsKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fY2xlYXJTdGVuY2lsO1xuICAgIH1cblxuICAgIHNldCBjbGVhclN0ZW5jaWxCdWZmZXIobmV3VmFsdWUpIHtcbiAgICAgICAgdGhpcy5fY2xlYXJTdGVuY2lsQnVmZmVyID0gbmV3VmFsdWU7XG4gICAgfVxuXG4gICAgZ2V0IGNsZWFyU3RlbmNpbEJ1ZmZlcigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2NsZWFyU3RlbmNpbEJ1ZmZlcjtcbiAgICB9XG5cbiAgICBzZXQgY3VsbEZhY2VzKG5ld1ZhbHVlKSB7XG4gICAgICAgIHRoaXMuX2N1bGxGYWNlcyA9IG5ld1ZhbHVlO1xuICAgIH1cblxuICAgIGdldCBjdWxsRmFjZXMoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9jdWxsRmFjZXM7XG4gICAgfVxuXG4gICAgc2V0IGZhckNsaXAobmV3VmFsdWUpIHtcbiAgICAgICAgaWYgKHRoaXMuX2ZhckNsaXAgIT09IG5ld1ZhbHVlKSB7XG4gICAgICAgICAgICB0aGlzLl9mYXJDbGlwID0gbmV3VmFsdWU7XG4gICAgICAgICAgICB0aGlzLl9wcm9qTWF0RGlydHkgPSB0cnVlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2V0IGZhckNsaXAoKSB7XG4gICAgICAgIHJldHVybiAodGhpcy54cj8uYWN0aXZlKSA/IHRoaXMuX3hyUHJvcGVydGllcy5mYXJDbGlwIDogdGhpcy5fZmFyQ2xpcDtcbiAgICB9XG5cbiAgICBzZXQgZmxpcEZhY2VzKG5ld1ZhbHVlKSB7XG4gICAgICAgIHRoaXMuX2ZsaXBGYWNlcyA9IG5ld1ZhbHVlO1xuICAgIH1cblxuICAgIGdldCBmbGlwRmFjZXMoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9mbGlwRmFjZXM7XG4gICAgfVxuXG4gICAgc2V0IGZvdihuZXdWYWx1ZSkge1xuICAgICAgICBpZiAodGhpcy5fZm92ICE9PSBuZXdWYWx1ZSkge1xuICAgICAgICAgICAgdGhpcy5fZm92ID0gbmV3VmFsdWU7XG4gICAgICAgICAgICB0aGlzLl9wcm9qTWF0RGlydHkgPSB0cnVlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2V0IGZvdigpIHtcbiAgICAgICAgcmV0dXJuICh0aGlzLnhyPy5hY3RpdmUpID8gdGhpcy5feHJQcm9wZXJ0aWVzLmZvdiA6IHRoaXMuX2ZvdjtcbiAgICB9XG5cbiAgICBzZXQgZnJ1c3R1bUN1bGxpbmcobmV3VmFsdWUpIHtcbiAgICAgICAgdGhpcy5fZnJ1c3R1bUN1bGxpbmcgPSBuZXdWYWx1ZTtcbiAgICB9XG5cbiAgICBnZXQgZnJ1c3R1bUN1bGxpbmcoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9mcnVzdHVtQ3VsbGluZztcbiAgICB9XG5cbiAgICBzZXQgaG9yaXpvbnRhbEZvdihuZXdWYWx1ZSkge1xuICAgICAgICBpZiAodGhpcy5faG9yaXpvbnRhbEZvdiAhPT0gbmV3VmFsdWUpIHtcbiAgICAgICAgICAgIHRoaXMuX2hvcml6b250YWxGb3YgPSBuZXdWYWx1ZTtcbiAgICAgICAgICAgIHRoaXMuX3Byb2pNYXREaXJ0eSA9IHRydWU7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBnZXQgaG9yaXpvbnRhbEZvdigpIHtcbiAgICAgICAgcmV0dXJuICh0aGlzLnhyPy5hY3RpdmUpID8gdGhpcy5feHJQcm9wZXJ0aWVzLmhvcml6b250YWxGb3YgOiB0aGlzLl9ob3Jpem9udGFsRm92O1xuICAgIH1cblxuICAgIHNldCBsYXllcnMobmV3VmFsdWUpIHtcbiAgICAgICAgdGhpcy5fbGF5ZXJzID0gbmV3VmFsdWUuc2xpY2UoMCk7XG4gICAgICAgIHRoaXMuX2xheWVyc1NldCA9IG5ldyBTZXQodGhpcy5fbGF5ZXJzKTtcbiAgICB9XG5cbiAgICBnZXQgbGF5ZXJzKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fbGF5ZXJzO1xuICAgIH1cblxuICAgIGdldCBsYXllcnNTZXQoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9sYXllcnNTZXQ7XG4gICAgfVxuXG4gICAgc2V0IG5lYXJDbGlwKG5ld1ZhbHVlKSB7XG4gICAgICAgIGlmICh0aGlzLl9uZWFyQ2xpcCAhPT0gbmV3VmFsdWUpIHtcbiAgICAgICAgICAgIHRoaXMuX25lYXJDbGlwID0gbmV3VmFsdWU7XG4gICAgICAgICAgICB0aGlzLl9wcm9qTWF0RGlydHkgPSB0cnVlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2V0IG5lYXJDbGlwKCkge1xuICAgICAgICByZXR1cm4gKHRoaXMueHI/LmFjdGl2ZSkgPyB0aGlzLl94clByb3BlcnRpZXMubmVhckNsaXAgOiB0aGlzLl9uZWFyQ2xpcDtcbiAgICB9XG5cbiAgICBzZXQgbm9kZShuZXdWYWx1ZSkge1xuICAgICAgICB0aGlzLl9ub2RlID0gbmV3VmFsdWU7XG4gICAgfVxuXG4gICAgZ2V0IG5vZGUoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9ub2RlO1xuICAgIH1cblxuICAgIHNldCBvcnRob0hlaWdodChuZXdWYWx1ZSkge1xuICAgICAgICBpZiAodGhpcy5fb3J0aG9IZWlnaHQgIT09IG5ld1ZhbHVlKSB7XG4gICAgICAgICAgICB0aGlzLl9vcnRob0hlaWdodCA9IG5ld1ZhbHVlO1xuICAgICAgICAgICAgdGhpcy5fcHJvak1hdERpcnR5ID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGdldCBvcnRob0hlaWdodCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX29ydGhvSGVpZ2h0O1xuICAgIH1cblxuICAgIHNldCBwcm9qZWN0aW9uKG5ld1ZhbHVlKSB7XG4gICAgICAgIGlmICh0aGlzLl9wcm9qZWN0aW9uICE9PSBuZXdWYWx1ZSkge1xuICAgICAgICAgICAgdGhpcy5fcHJvamVjdGlvbiA9IG5ld1ZhbHVlO1xuICAgICAgICAgICAgdGhpcy5fcHJvak1hdERpcnR5ID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGdldCBwcm9qZWN0aW9uKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fcHJvamVjdGlvbjtcbiAgICB9XG5cbiAgICBnZXQgcHJvamVjdGlvbk1hdHJpeCgpIHtcbiAgICAgICAgdGhpcy5fZXZhbHVhdGVQcm9qZWN0aW9uTWF0cml4KCk7XG4gICAgICAgIHJldHVybiB0aGlzLl9wcm9qTWF0O1xuICAgIH1cblxuICAgIHNldCByZWN0KG5ld1ZhbHVlKSB7XG4gICAgICAgIHRoaXMuX3JlY3QuY29weShuZXdWYWx1ZSk7XG4gICAgfVxuXG4gICAgZ2V0IHJlY3QoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9yZWN0O1xuICAgIH1cblxuICAgIHNldCByZW5kZXJUYXJnZXQobmV3VmFsdWUpIHtcbiAgICAgICAgdGhpcy5fcmVuZGVyVGFyZ2V0ID0gbmV3VmFsdWU7XG4gICAgfVxuXG4gICAgZ2V0IHJlbmRlclRhcmdldCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3JlbmRlclRhcmdldDtcbiAgICB9XG5cbiAgICBzZXQgc2Npc3NvclJlY3QobmV3VmFsdWUpIHtcbiAgICAgICAgdGhpcy5fc2Npc3NvclJlY3QuY29weShuZXdWYWx1ZSk7XG4gICAgfVxuXG4gICAgZ2V0IHNjaXNzb3JSZWN0KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fc2Npc3NvclJlY3Q7XG4gICAgfVxuXG4gICAgZ2V0IHZpZXdNYXRyaXgoKSB7XG4gICAgICAgIGlmICh0aGlzLl92aWV3TWF0RGlydHkpIHtcbiAgICAgICAgICAgIGNvbnN0IHd0bSA9IHRoaXMuX25vZGUuZ2V0V29ybGRUcmFuc2Zvcm0oKTtcbiAgICAgICAgICAgIHRoaXMuX3ZpZXdNYXQuY29weSh3dG0pLmludmVydCgpO1xuICAgICAgICAgICAgdGhpcy5fdmlld01hdERpcnR5ID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMuX3ZpZXdNYXQ7XG4gICAgfVxuXG4gICAgc2V0IGFwZXJ0dXJlKG5ld1ZhbHVlKSB7XG4gICAgICAgIHRoaXMuX2FwZXJ0dXJlID0gbmV3VmFsdWU7XG4gICAgfVxuXG4gICAgZ2V0IGFwZXJ0dXJlKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fYXBlcnR1cmU7XG4gICAgfVxuXG4gICAgc2V0IHNlbnNpdGl2aXR5KG5ld1ZhbHVlKSB7XG4gICAgICAgIHRoaXMuX3NlbnNpdGl2aXR5ID0gbmV3VmFsdWU7XG4gICAgfVxuXG4gICAgZ2V0IHNlbnNpdGl2aXR5KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fc2Vuc2l0aXZpdHk7XG4gICAgfVxuXG4gICAgc2V0IHNodXR0ZXIobmV3VmFsdWUpIHtcbiAgICAgICAgdGhpcy5fc2h1dHRlciA9IG5ld1ZhbHVlO1xuICAgIH1cblxuICAgIGdldCBzaHV0dGVyKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fc2h1dHRlcjtcbiAgICB9XG5cbiAgICBzZXQgeHIobmV3VmFsdWUpIHtcbiAgICAgICAgaWYgKHRoaXMuX3hyICE9PSBuZXdWYWx1ZSkge1xuICAgICAgICAgICAgdGhpcy5feHIgPSBuZXdWYWx1ZTtcbiAgICAgICAgICAgIHRoaXMuX3Byb2pNYXREaXJ0eSA9IHRydWU7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBnZXQgeHIoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl94cjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDcmVhdGVzIGEgZHVwbGljYXRlIG9mIHRoZSBjYW1lcmEuXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7Q2FtZXJhfSBBIGNsb25lZCBDYW1lcmEuXG4gICAgICovXG4gICAgY2xvbmUoKSB7XG4gICAgICAgIHJldHVybiBuZXcgQ2FtZXJhKCkuY29weSh0aGlzKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDb3BpZXMgb25lIGNhbWVyYSB0byBhbm90aGVyLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtDYW1lcmF9IG90aGVyIC0gQ2FtZXJhIHRvIGNvcHkuXG4gICAgICogQHJldHVybnMge0NhbWVyYX0gU2VsZiBmb3IgY2hhaW5pbmcuXG4gICAgICovXG4gICAgY29weShvdGhlcikge1xuICAgICAgICAvLyBXZSBhcmVuJ3QgdXNpbmcgdGhlIGdldHRlcnMgYW5kIHNldHRlcnMgYmVjYXVzZSB0aGVyZSBpcyBhZGRpdGlvbmFsIGxvZ2ljXG4gICAgICAgIC8vIGFyb3VuZCB1c2luZyBXZWJYUiBpbiB0aGUgZ2V0dGVycyBmb3IgdGhlc2UgcHJvcGVydGllcyBzbyB0aGF0IGZ1bmN0aW9uc1xuICAgICAgICAvLyBsaWtlIHNjcmVlblRvV29ybGQgd29yayBjb3JyZWN0bHkgd2l0aCBvdGhlciBzeXN0ZW1zIGxpa2UgdGhlIFVJIGlucHV0XG4gICAgICAgIC8vIHN5c3RlbVxuICAgICAgICB0aGlzLl9hc3BlY3RSYXRpbyA9IG90aGVyLl9hc3BlY3RSYXRpbztcbiAgICAgICAgdGhpcy5fZmFyQ2xpcCA9IG90aGVyLl9mYXJDbGlwO1xuICAgICAgICB0aGlzLl9mb3YgPSBvdGhlci5fZm92O1xuICAgICAgICB0aGlzLl9ob3Jpem9udGFsRm92ID0gb3RoZXIuX2hvcml6b250YWxGb3Y7XG4gICAgICAgIHRoaXMuX25lYXJDbGlwID0gb3RoZXIuX25lYXJDbGlwO1xuXG4gICAgICAgIHRoaXMuX3hyUHJvcGVydGllcy5hc3BlY3RSYXRpbyA9IG90aGVyLl94clByb3BlcnRpZXMuYXNwZWN0UmF0aW87XG4gICAgICAgIHRoaXMuX3hyUHJvcGVydGllcy5mYXJDbGlwID0gb3RoZXIuX3hyUHJvcGVydGllcy5mYXJDbGlwO1xuICAgICAgICB0aGlzLl94clByb3BlcnRpZXMuZm92ID0gb3RoZXIuX3hyUHJvcGVydGllcy5mb3Y7XG4gICAgICAgIHRoaXMuX3hyUHJvcGVydGllcy5ob3Jpem9udGFsRm92ID0gb3RoZXIuX3hyUHJvcGVydGllcy5ob3Jpem9udGFsRm92O1xuICAgICAgICB0aGlzLl94clByb3BlcnRpZXMubmVhckNsaXAgPSBvdGhlci5feHJQcm9wZXJ0aWVzLm5lYXJDbGlwO1xuXG4gICAgICAgIHRoaXMuYXNwZWN0UmF0aW9Nb2RlID0gb3RoZXIuYXNwZWN0UmF0aW9Nb2RlO1xuICAgICAgICB0aGlzLmNhbGN1bGF0ZVByb2plY3Rpb24gPSBvdGhlci5jYWxjdWxhdGVQcm9qZWN0aW9uO1xuICAgICAgICB0aGlzLmNhbGN1bGF0ZVRyYW5zZm9ybSA9IG90aGVyLmNhbGN1bGF0ZVRyYW5zZm9ybTtcbiAgICAgICAgdGhpcy5jbGVhckNvbG9yID0gb3RoZXIuY2xlYXJDb2xvcjtcbiAgICAgICAgdGhpcy5jbGVhckNvbG9yQnVmZmVyID0gb3RoZXIuY2xlYXJDb2xvckJ1ZmZlcjtcbiAgICAgICAgdGhpcy5jbGVhckRlcHRoID0gb3RoZXIuY2xlYXJEZXB0aDtcbiAgICAgICAgdGhpcy5jbGVhckRlcHRoQnVmZmVyID0gb3RoZXIuY2xlYXJEZXB0aEJ1ZmZlcjtcbiAgICAgICAgdGhpcy5jbGVhclN0ZW5jaWwgPSBvdGhlci5jbGVhclN0ZW5jaWw7XG4gICAgICAgIHRoaXMuY2xlYXJTdGVuY2lsQnVmZmVyID0gb3RoZXIuY2xlYXJTdGVuY2lsQnVmZmVyO1xuICAgICAgICB0aGlzLmN1bGxGYWNlcyA9IG90aGVyLmN1bGxGYWNlcztcbiAgICAgICAgdGhpcy5mbGlwRmFjZXMgPSBvdGhlci5mbGlwRmFjZXM7XG4gICAgICAgIHRoaXMuZnJ1c3R1bUN1bGxpbmcgPSBvdGhlci5mcnVzdHVtQ3VsbGluZztcbiAgICAgICAgdGhpcy5sYXllcnMgPSBvdGhlci5sYXllcnM7XG4gICAgICAgIHRoaXMub3J0aG9IZWlnaHQgPSBvdGhlci5vcnRob0hlaWdodDtcbiAgICAgICAgdGhpcy5wcm9qZWN0aW9uID0gb3RoZXIucHJvamVjdGlvbjtcbiAgICAgICAgdGhpcy5yZWN0ID0gb3RoZXIucmVjdDtcbiAgICAgICAgdGhpcy5yZW5kZXJUYXJnZXQgPSBvdGhlci5yZW5kZXJUYXJnZXQ7XG4gICAgICAgIHRoaXMuc2Npc3NvclJlY3QgPSBvdGhlci5zY2lzc29yUmVjdDtcbiAgICAgICAgdGhpcy5hcGVydHVyZSA9IG90aGVyLmFwZXJ0dXJlO1xuICAgICAgICB0aGlzLnNodXR0ZXIgPSBvdGhlci5zaHV0dGVyO1xuICAgICAgICB0aGlzLnNlbnNpdGl2aXR5ID0gb3RoZXIuc2Vuc2l0aXZpdHk7XG5cbiAgICAgICAgdGhpcy5zaGFkZXJQYXNzSW5mbyA9IG90aGVyLnNoYWRlclBhc3NJbmZvO1xuXG4gICAgICAgIHRoaXMuX3Byb2pNYXREaXJ0eSA9IHRydWU7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgX3VwZGF0ZVZpZXdQcm9qTWF0KCkge1xuICAgICAgICBpZiAodGhpcy5fcHJvak1hdERpcnR5IHx8IHRoaXMuX3ZpZXdNYXREaXJ0eSB8fCB0aGlzLl92aWV3UHJvak1hdERpcnR5KSB7XG4gICAgICAgICAgICB0aGlzLl92aWV3UHJvak1hdC5tdWwyKHRoaXMucHJvamVjdGlvbk1hdHJpeCwgdGhpcy52aWV3TWF0cml4KTtcbiAgICAgICAgICAgIHRoaXMuX3ZpZXdQcm9qTWF0RGlydHkgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENvbnZlcnQgYSBwb2ludCBmcm9tIDNEIHdvcmxkIHNwYWNlIHRvIDJEIGNhbnZhcyBwaXhlbCBzcGFjZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7VmVjM30gd29ybGRDb29yZCAtIFRoZSB3b3JsZCBzcGFjZSBjb29yZGluYXRlIHRvIHRyYW5zZm9ybS5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gY3cgLSBUaGUgd2lkdGggb2YgUGxheUNhbnZhcycgY2FudmFzIGVsZW1lbnQuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGNoIC0gVGhlIGhlaWdodCBvZiBQbGF5Q2FudmFzJyBjYW52YXMgZWxlbWVudC5cbiAgICAgKiBAcGFyYW0ge1ZlYzN9IFtzY3JlZW5Db29yZF0gLSAzRCB2ZWN0b3IgdG8gcmVjZWl2ZSBzY3JlZW4gY29vcmRpbmF0ZSByZXN1bHQuXG4gICAgICogQHJldHVybnMge1ZlYzN9IFRoZSBzY3JlZW4gc3BhY2UgY29vcmRpbmF0ZS5cbiAgICAgKi9cbiAgICB3b3JsZFRvU2NyZWVuKHdvcmxkQ29vcmQsIGN3LCBjaCwgc2NyZWVuQ29vcmQgPSBuZXcgVmVjMygpKSB7XG4gICAgICAgIHRoaXMuX3VwZGF0ZVZpZXdQcm9qTWF0KCk7XG4gICAgICAgIHRoaXMuX3ZpZXdQcm9qTWF0LnRyYW5zZm9ybVBvaW50KHdvcmxkQ29vcmQsIHNjcmVlbkNvb3JkKTtcblxuICAgICAgICAvLyBjYWxjdWxhdGUgdyBjby1jb29yZFxuICAgICAgICBjb25zdCB2cG0gPSB0aGlzLl92aWV3UHJvak1hdC5kYXRhO1xuICAgICAgICBjb25zdCB3ID0gd29ybGRDb29yZC54ICogdnBtWzNdICtcbiAgICAgICAgICAgICAgICB3b3JsZENvb3JkLnkgKiB2cG1bN10gK1xuICAgICAgICAgICAgICAgIHdvcmxkQ29vcmQueiAqIHZwbVsxMV0gK1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgMSAqIHZwbVsxNV07XG5cbiAgICAgICAgc2NyZWVuQ29vcmQueCA9IChzY3JlZW5Db29yZC54IC8gdyArIDEpICogMC41ICogY3c7XG4gICAgICAgIHNjcmVlbkNvb3JkLnkgPSAoMSAtIHNjcmVlbkNvb3JkLnkgLyB3KSAqIDAuNSAqIGNoO1xuXG4gICAgICAgIHJldHVybiBzY3JlZW5Db29yZDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDb252ZXJ0IGEgcG9pbnQgZnJvbSAyRCBjYW52YXMgcGl4ZWwgc3BhY2UgdG8gM0Qgd29ybGQgc3BhY2UuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge251bWJlcn0geCAtIFggY29vcmRpbmF0ZSBvbiBQbGF5Q2FudmFzJyBjYW52YXMgZWxlbWVudC5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0geSAtIFkgY29vcmRpbmF0ZSBvbiBQbGF5Q2FudmFzJyBjYW52YXMgZWxlbWVudC5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0geiAtIFRoZSBkaXN0YW5jZSBmcm9tIHRoZSBjYW1lcmEgaW4gd29ybGQgc3BhY2UgdG8gY3JlYXRlIHRoZSBuZXcgcG9pbnQuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGN3IC0gVGhlIHdpZHRoIG9mIFBsYXlDYW52YXMnIGNhbnZhcyBlbGVtZW50LlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBjaCAtIFRoZSBoZWlnaHQgb2YgUGxheUNhbnZhcycgY2FudmFzIGVsZW1lbnQuXG4gICAgICogQHBhcmFtIHtWZWMzfSBbd29ybGRDb29yZF0gLSAzRCB2ZWN0b3IgdG8gcmVjZWl2ZSB3b3JsZCBjb29yZGluYXRlIHJlc3VsdC5cbiAgICAgKiBAcmV0dXJucyB7VmVjM30gVGhlIHdvcmxkIHNwYWNlIGNvb3JkaW5hdGUuXG4gICAgICovXG4gICAgc2NyZWVuVG9Xb3JsZCh4LCB5LCB6LCBjdywgY2gsIHdvcmxkQ29vcmQgPSBuZXcgVmVjMygpKSB7XG5cbiAgICAgICAgLy8gQ2FsY3VsYXRlIHRoZSBzY3JlZW4gY2xpY2sgYXMgYSBwb2ludCBvbiB0aGUgZmFyIHBsYW5lIG9mIHRoZSBub3JtYWxpemVkIGRldmljZSBjb29yZGluYXRlICdib3gnICh6PTEpXG4gICAgICAgIGNvbnN0IHJhbmdlID0gdGhpcy5mYXJDbGlwIC0gdGhpcy5uZWFyQ2xpcDtcbiAgICAgICAgX2RldmljZUNvb3JkLnNldCh4IC8gY3csIChjaCAtIHkpIC8gY2gsIHogLyByYW5nZSk7XG4gICAgICAgIF9kZXZpY2VDb29yZC5tdWxTY2FsYXIoMik7XG4gICAgICAgIF9kZXZpY2VDb29yZC5zdWIoVmVjMy5PTkUpO1xuXG4gICAgICAgIGlmICh0aGlzLl9wcm9qZWN0aW9uID09PSBQUk9KRUNUSU9OX1BFUlNQRUNUSVZFKSB7XG5cbiAgICAgICAgICAgIC8vIGNhbGN1bGF0ZSBoYWxmIHdpZHRoIGFuZCBoZWlnaHQgYXQgdGhlIG5lYXIgY2xpcCBwbGFuZVxuICAgICAgICAgICAgTWF0NC5fZ2V0UGVyc3BlY3RpdmVIYWxmU2l6ZShfaGFsZlNpemUsIHRoaXMuZm92LCB0aGlzLmFzcGVjdFJhdGlvLCB0aGlzLm5lYXJDbGlwLCB0aGlzLmhvcml6b250YWxGb3YpO1xuXG4gICAgICAgICAgICAvLyBzY2FsZSBieSBub3JtYWxpemVkIHNjcmVlbiBjb29yZGluYXRlc1xuICAgICAgICAgICAgX2hhbGZTaXplLnggKj0gX2RldmljZUNvb3JkLng7XG4gICAgICAgICAgICBfaGFsZlNpemUueSAqPSBfZGV2aWNlQ29vcmQueTtcblxuICAgICAgICAgICAgLy8gdHJhbnNmb3JtIHRvIHdvcmxkIHNwYWNlXG4gICAgICAgICAgICBjb25zdCBpbnZWaWV3ID0gdGhpcy5fbm9kZS5nZXRXb3JsZFRyYW5zZm9ybSgpO1xuICAgICAgICAgICAgX2hhbGZTaXplLnogPSAtdGhpcy5uZWFyQ2xpcDtcbiAgICAgICAgICAgIGludlZpZXcudHJhbnNmb3JtUG9pbnQoX2hhbGZTaXplLCBfcG9pbnQpO1xuXG4gICAgICAgICAgICAvLyBwb2ludCBhbG9uZyBjYW1lcmEtPl9wb2ludCByYXkgYXQgZGlzdGFuY2UgeiBmcm9tIHRoZSBjYW1lcmFcbiAgICAgICAgICAgIGNvbnN0IGNhbWVyYVBvcyA9IHRoaXMuX25vZGUuZ2V0UG9zaXRpb24oKTtcbiAgICAgICAgICAgIHdvcmxkQ29vcmQuc3ViMihfcG9pbnQsIGNhbWVyYVBvcyk7XG4gICAgICAgICAgICB3b3JsZENvb3JkLm5vcm1hbGl6ZSgpO1xuICAgICAgICAgICAgd29ybGRDb29yZC5tdWxTY2FsYXIoeik7XG4gICAgICAgICAgICB3b3JsZENvb3JkLmFkZChjYW1lcmFQb3MpO1xuXG4gICAgICAgIH0gZWxzZSB7XG5cbiAgICAgICAgICAgIHRoaXMuX3VwZGF0ZVZpZXdQcm9qTWF0KCk7XG4gICAgICAgICAgICBfaW52Vmlld1Byb2pNYXQuY29weSh0aGlzLl92aWV3UHJvak1hdCkuaW52ZXJ0KCk7XG5cbiAgICAgICAgICAgICAgICAvLyBUcmFuc2Zvcm0gdG8gd29ybGQgc3BhY2VcbiAgICAgICAgICAgIF9pbnZWaWV3UHJvak1hdC50cmFuc2Zvcm1Qb2ludChfZGV2aWNlQ29vcmQsIHdvcmxkQ29vcmQpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHdvcmxkQ29vcmQ7XG4gICAgfVxuXG4gICAgX2V2YWx1YXRlUHJvamVjdGlvbk1hdHJpeCgpIHtcbiAgICAgICAgaWYgKHRoaXMuX3Byb2pNYXREaXJ0eSkge1xuICAgICAgICAgICAgaWYgKHRoaXMuX3Byb2plY3Rpb24gPT09IFBST0pFQ1RJT05fUEVSU1BFQ1RJVkUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9wcm9qTWF0LnNldFBlcnNwZWN0aXZlKHRoaXMuZm92LCB0aGlzLmFzcGVjdFJhdGlvLCB0aGlzLm5lYXJDbGlwLCB0aGlzLmZhckNsaXAsIHRoaXMuaG9yaXpvbnRhbEZvdik7XG4gICAgICAgICAgICAgICAgdGhpcy5fcHJvak1hdFNreWJveC5jb3B5KHRoaXMuX3Byb2pNYXQpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zdCB5ID0gdGhpcy5fb3J0aG9IZWlnaHQ7XG4gICAgICAgICAgICAgICAgY29uc3QgeCA9IHkgKiB0aGlzLmFzcGVjdFJhdGlvO1xuICAgICAgICAgICAgICAgIHRoaXMuX3Byb2pNYXQuc2V0T3J0aG8oLXgsIHgsIC15LCB5LCB0aGlzLm5lYXJDbGlwLCB0aGlzLmZhckNsaXApO1xuICAgICAgICAgICAgICAgIHRoaXMuX3Byb2pNYXRTa3lib3guc2V0UGVyc3BlY3RpdmUodGhpcy5mb3YsIHRoaXMuYXNwZWN0UmF0aW8sIHRoaXMubmVhckNsaXAsIHRoaXMuZmFyQ2xpcCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuX3Byb2pNYXREaXJ0eSA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2V0UHJvamVjdGlvbk1hdHJpeFNreWJveCgpIHtcbiAgICAgICAgdGhpcy5fZXZhbHVhdGVQcm9qZWN0aW9uTWF0cml4KCk7XG4gICAgICAgIHJldHVybiB0aGlzLl9wcm9qTWF0U2t5Ym94O1xuICAgIH1cblxuICAgIGdldEV4cG9zdXJlKCkge1xuICAgICAgICBjb25zdCBldjEwMCA9IE1hdGgubG9nMigodGhpcy5fYXBlcnR1cmUgKiB0aGlzLl9hcGVydHVyZSkgLyB0aGlzLl9zaHV0dGVyICogMTAwLjAgLyB0aGlzLl9zZW5zaXRpdml0eSk7XG4gICAgICAgIHJldHVybiAxLjAgLyAoTWF0aC5wb3coMi4wLCBldjEwMCkgKiAxLjIpO1xuICAgIH1cblxuICAgIC8vIHJldHVybnMgZXN0aW1hdGVkIHNpemUgb2YgdGhlIHNwaGVyZSBvbiB0aGUgc2NyZWVuIGluIHJhbmdlIG9mIFswLi4xXVxuICAgIC8vIDAgLSBpbmZpbml0ZWx5IHNtYWxsLCAxIC0gZnVsbCBzY3JlZW4gb3IgbGFyZ2VyXG4gICAgZ2V0U2NyZWVuU2l6ZShzcGhlcmUpIHtcblxuICAgICAgICBpZiAodGhpcy5fcHJvamVjdGlvbiA9PT0gUFJPSkVDVElPTl9QRVJTUEVDVElWRSkge1xuXG4gICAgICAgICAgICAvLyBjYW1lcmEgdG8gc3BoZXJlIGRpc3RhbmNlXG4gICAgICAgICAgICBjb25zdCBkaXN0YW5jZSA9IHRoaXMuX25vZGUuZ2V0UG9zaXRpb24oKS5kaXN0YW5jZShzcGhlcmUuY2VudGVyKTtcblxuICAgICAgICAgICAgLy8gaWYgd2UncmUgaW5zaWRlIHRoZSBzcGhlcmVcbiAgICAgICAgICAgIGlmIChkaXN0YW5jZSA8IHNwaGVyZS5yYWRpdXMpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gMTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gVGhlIHZpZXctYW5nbGUgb2YgdGhlIGJvdW5kaW5nIHNwaGVyZSByZW5kZXJlZCBvbiBzY3JlZW5cbiAgICAgICAgICAgIGNvbnN0IHZpZXdBbmdsZSA9IE1hdGguYXNpbihzcGhlcmUucmFkaXVzIC8gZGlzdGFuY2UpO1xuXG4gICAgICAgICAgICAvLyBUaGlzIGFzc3VtZXMgdGhlIG5lYXIgY2xpcHBpbmcgcGxhbmUgaXMgYXQgYSBkaXN0YW5jZSBvZiAxXG4gICAgICAgICAgICBjb25zdCBzcGhlcmVWaWV3SGVpZ2h0ID0gTWF0aC50YW4odmlld0FuZ2xlKTtcblxuICAgICAgICAgICAgLy8gVGhlIHNpemUgb2YgKGhhbGYpIHRoZSBzY3JlZW4gaWYgdGhlIG5lYXIgY2xpcHBpbmcgcGxhbmUgaXMgYXQgYSBkaXN0YW5jZSBvZiAxXG4gICAgICAgICAgICBjb25zdCBzY3JlZW5WaWV3SGVpZ2h0ID0gTWF0aC50YW4oKHRoaXMuZm92IC8gMikgKiBtYXRoLkRFR19UT19SQUQpO1xuXG4gICAgICAgICAgICAvLyBUaGUgcmF0aW8gb2YgdGhlIGdlb21ldHJ5J3Mgc2NyZWVuIHNpemUgY29tcGFyZWQgdG8gdGhlIGFjdHVhbCBzaXplIG9mIHRoZSBzY3JlZW5cbiAgICAgICAgICAgIHJldHVybiBNYXRoLm1pbihzcGhlcmVWaWV3SGVpZ2h0IC8gc2NyZWVuVmlld0hlaWdodCwgMSk7XG5cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIG9ydGhvXG4gICAgICAgIHJldHVybiBtYXRoLmNsYW1wKHNwaGVyZS5yYWRpdXMgLyB0aGlzLl9vcnRob0hlaWdodCwgMCwgMSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBhbiBhcnJheSBvZiBjb3JuZXJzIG9mIHRoZSBmcnVzdHVtIG9mIHRoZSBjYW1lcmEgaW4gdGhlIGxvY2FsIGNvb3JkaW5hdGUgc3lzdGVtIG9mIHRoZSBjYW1lcmEuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gW25lYXJdIC0gTmVhciBkaXN0YW5jZSBmb3IgdGhlIGZydXN0dW0gcG9pbnRzLiBEZWZhdWx0cyB0byB0aGUgbmVhciBjbGlwIGRpc3RhbmNlIG9mIHRoZSBjYW1lcmEuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFtmYXJdIC0gRmFyIGRpc3RhbmNlIGZvciB0aGUgZnJ1c3R1bSBwb2ludHMuIERlZmF1bHRzIHRvIHRoZSBmYXIgY2xpcCBkaXN0YW5jZSBvZiB0aGUgY2FtZXJhLlxuICAgICAqIEByZXR1cm5zIHtWZWMzW119IC0gQW4gYXJyYXkgb2YgY29ybmVycywgdXNpbmcgYSBnbG9iYWwgc3RvcmFnZSBzcGFjZS5cbiAgICAgKi9cbiAgICBnZXRGcnVzdHVtQ29ybmVycyhuZWFyID0gdGhpcy5uZWFyQ2xpcCwgZmFyID0gdGhpcy5mYXJDbGlwKSB7XG5cbiAgICAgICAgY29uc3QgZm92ID0gdGhpcy5mb3YgKiBNYXRoLlBJIC8gMTgwLjA7XG4gICAgICAgIGxldCB5ID0gdGhpcy5fcHJvamVjdGlvbiA9PT0gUFJPSkVDVElPTl9QRVJTUEVDVElWRSA/IE1hdGgudGFuKGZvdiAvIDIuMCkgKiBuZWFyIDogdGhpcy5fb3J0aG9IZWlnaHQ7XG4gICAgICAgIGxldCB4ID0geSAqIHRoaXMuYXNwZWN0UmF0aW87XG5cbiAgICAgICAgY29uc3QgcG9pbnRzID0gX2ZydXN0dW1Qb2ludHM7XG4gICAgICAgIHBvaW50c1swXS54ID0geDtcbiAgICAgICAgcG9pbnRzWzBdLnkgPSAteTtcbiAgICAgICAgcG9pbnRzWzBdLnogPSAtbmVhcjtcbiAgICAgICAgcG9pbnRzWzFdLnggPSB4O1xuICAgICAgICBwb2ludHNbMV0ueSA9IHk7XG4gICAgICAgIHBvaW50c1sxXS56ID0gLW5lYXI7XG4gICAgICAgIHBvaW50c1syXS54ID0gLXg7XG4gICAgICAgIHBvaW50c1syXS55ID0geTtcbiAgICAgICAgcG9pbnRzWzJdLnogPSAtbmVhcjtcbiAgICAgICAgcG9pbnRzWzNdLnggPSAteDtcbiAgICAgICAgcG9pbnRzWzNdLnkgPSAteTtcbiAgICAgICAgcG9pbnRzWzNdLnogPSAtbmVhcjtcblxuICAgICAgICBpZiAodGhpcy5fcHJvamVjdGlvbiA9PT0gUFJPSkVDVElPTl9QRVJTUEVDVElWRSkge1xuICAgICAgICAgICAgeSA9IE1hdGgudGFuKGZvdiAvIDIuMCkgKiBmYXI7XG4gICAgICAgICAgICB4ID0geSAqIHRoaXMuYXNwZWN0UmF0aW87XG4gICAgICAgIH1cbiAgICAgICAgcG9pbnRzWzRdLnggPSB4O1xuICAgICAgICBwb2ludHNbNF0ueSA9IC15O1xuICAgICAgICBwb2ludHNbNF0ueiA9IC1mYXI7XG4gICAgICAgIHBvaW50c1s1XS54ID0geDtcbiAgICAgICAgcG9pbnRzWzVdLnkgPSB5O1xuICAgICAgICBwb2ludHNbNV0ueiA9IC1mYXI7XG4gICAgICAgIHBvaW50c1s2XS54ID0gLXg7XG4gICAgICAgIHBvaW50c1s2XS55ID0geTtcbiAgICAgICAgcG9pbnRzWzZdLnogPSAtZmFyO1xuICAgICAgICBwb2ludHNbN10ueCA9IC14O1xuICAgICAgICBwb2ludHNbN10ueSA9IC15O1xuICAgICAgICBwb2ludHNbN10ueiA9IC1mYXI7XG5cbiAgICAgICAgcmV0dXJuIHBvaW50cztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIFhSIGNhbWVyYSBwcm9wZXJ0aWVzIHRoYXQgc2hvdWxkIGJlIGRlcml2ZWQgcGh5c2ljYWwgY2FtZXJhIGluIHtAbGluayBYck1hbmFnZXJ9LlxuICAgICAqXG4gICAgICogQHBhcmFtIHtvYmplY3R9IFtwcm9wZXJ0aWVzXSAtIFByb3BlcnRpZXMgb2JqZWN0LlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBbcHJvcGVydGllcy5hc3BlY3RSYXRpb10gLSBBc3BlY3QgcmF0aW8uXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFtwcm9wZXJ0aWVzLmZhckNsaXBdIC0gRmFyIGNsaXAuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFtwcm9wZXJ0aWVzLmZvdl0gLSBGaWVsZCBvZiB2aWV3LlxuICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gW3Byb3BlcnRpZXMuaG9yaXpvbnRhbEZvdl0gLSBFbmFibGUgaG9yaXpvbnRhbCBmaWVsZCBvZiB2aWV3LlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBbcHJvcGVydGllcy5uZWFyQ2xpcF0gLSBOZWFyIGNsaXAuXG4gICAgICovXG4gICAgc2V0WHJQcm9wZXJ0aWVzKHByb3BlcnRpZXMpIHtcbiAgICAgICAgT2JqZWN0LmFzc2lnbih0aGlzLl94clByb3BlcnRpZXMsIHByb3BlcnRpZXMpO1xuICAgICAgICB0aGlzLl9wcm9qTWF0RGlydHkgPSB0cnVlO1xuICAgIH1cbn1cblxuZXhwb3J0IHsgQ2FtZXJhIH07XG4iXSwibmFtZXMiOlsiX2RldmljZUNvb3JkIiwiVmVjMyIsIl9oYWxmU2l6ZSIsIl9wb2ludCIsIl9pbnZWaWV3UHJvak1hdCIsIk1hdDQiLCJfZnJ1c3R1bVBvaW50cyIsIkNhbWVyYSIsImNvbnN0cnVjdG9yIiwic2hhZGVyUGFzc0luZm8iLCJfYXNwZWN0UmF0aW8iLCJfYXNwZWN0UmF0aW9Nb2RlIiwiQVNQRUNUX0FVVE8iLCJfY2FsY3VsYXRlUHJvamVjdGlvbiIsIl9jYWxjdWxhdGVUcmFuc2Zvcm0iLCJfY2xlYXJDb2xvciIsIkNvbG9yIiwiX2NsZWFyQ29sb3JCdWZmZXIiLCJfY2xlYXJEZXB0aCIsIl9jbGVhckRlcHRoQnVmZmVyIiwiX2NsZWFyU3RlbmNpbCIsIl9jbGVhclN0ZW5jaWxCdWZmZXIiLCJfY3VsbEZhY2VzIiwiX2ZhckNsaXAiLCJfZmxpcEZhY2VzIiwiX2ZvdiIsIl9mcnVzdHVtQ3VsbGluZyIsIl9ob3Jpem9udGFsRm92IiwiX2xheWVycyIsIkxBWUVSSURfV09STEQiLCJMQVlFUklEX0RFUFRIIiwiTEFZRVJJRF9TS1lCT1giLCJMQVlFUklEX1VJIiwiTEFZRVJJRF9JTU1FRElBVEUiLCJfbGF5ZXJzU2V0IiwiU2V0IiwiX25lYXJDbGlwIiwiX25vZGUiLCJfb3J0aG9IZWlnaHQiLCJfcHJvamVjdGlvbiIsIlBST0pFQ1RJT05fUEVSU1BFQ1RJVkUiLCJfcmVjdCIsIlZlYzQiLCJfcmVuZGVyVGFyZ2V0IiwiX3NjaXNzb3JSZWN0IiwiX3NjaXNzb3JSZWN0Q2xlYXIiLCJfYXBlcnR1cmUiLCJfc2h1dHRlciIsIl9zZW5zaXRpdml0eSIsIl9wcm9qTWF0IiwiX3Byb2pNYXREaXJ0eSIsIl9wcm9qTWF0U2t5Ym94IiwiX3ZpZXdNYXQiLCJfdmlld01hdERpcnR5IiwiX3ZpZXdQcm9qTWF0IiwiX3ZpZXdQcm9qTWF0RGlydHkiLCJmcnVzdHVtIiwiRnJ1c3R1bSIsIl94ciIsIl94clByb3BlcnRpZXMiLCJob3Jpem9udGFsRm92IiwiZm92IiwiYXNwZWN0UmF0aW8iLCJmYXJDbGlwIiwibmVhckNsaXAiLCJmdWxsU2l6ZUNsZWFyUmVjdCIsInJlY3QiLCJzY2lzc29yUmVjdCIsIngiLCJ5IiwieiIsInciLCJuZXdWYWx1ZSIsIl90aGlzJHhyIiwieHIiLCJhY3RpdmUiLCJhc3BlY3RSYXRpb01vZGUiLCJjYWxjdWxhdGVQcm9qZWN0aW9uIiwiY2FsY3VsYXRlVHJhbnNmb3JtIiwiY2xlYXJDb2xvciIsImNvcHkiLCJjbGVhckNvbG9yQnVmZmVyIiwiY2xlYXJEZXB0aCIsImNsZWFyRGVwdGhCdWZmZXIiLCJjbGVhclN0ZW5jaWwiLCJjbGVhclN0ZW5jaWxCdWZmZXIiLCJjdWxsRmFjZXMiLCJfdGhpcyR4cjIiLCJmbGlwRmFjZXMiLCJfdGhpcyR4cjMiLCJmcnVzdHVtQ3VsbGluZyIsIl90aGlzJHhyNCIsImxheWVycyIsInNsaWNlIiwibGF5ZXJzU2V0IiwiX3RoaXMkeHI1Iiwibm9kZSIsIm9ydGhvSGVpZ2h0IiwicHJvamVjdGlvbiIsInByb2plY3Rpb25NYXRyaXgiLCJfZXZhbHVhdGVQcm9qZWN0aW9uTWF0cml4IiwicmVuZGVyVGFyZ2V0Iiwidmlld01hdHJpeCIsInd0bSIsImdldFdvcmxkVHJhbnNmb3JtIiwiaW52ZXJ0IiwiYXBlcnR1cmUiLCJzZW5zaXRpdml0eSIsInNodXR0ZXIiLCJjbG9uZSIsIm90aGVyIiwiX3VwZGF0ZVZpZXdQcm9qTWF0IiwibXVsMiIsIndvcmxkVG9TY3JlZW4iLCJ3b3JsZENvb3JkIiwiY3ciLCJjaCIsInNjcmVlbkNvb3JkIiwidHJhbnNmb3JtUG9pbnQiLCJ2cG0iLCJkYXRhIiwic2NyZWVuVG9Xb3JsZCIsInJhbmdlIiwic2V0IiwibXVsU2NhbGFyIiwic3ViIiwiT05FIiwiX2dldFBlcnNwZWN0aXZlSGFsZlNpemUiLCJpbnZWaWV3IiwiY2FtZXJhUG9zIiwiZ2V0UG9zaXRpb24iLCJzdWIyIiwibm9ybWFsaXplIiwiYWRkIiwic2V0UGVyc3BlY3RpdmUiLCJzZXRPcnRobyIsImdldFByb2plY3Rpb25NYXRyaXhTa3lib3giLCJnZXRFeHBvc3VyZSIsImV2MTAwIiwiTWF0aCIsImxvZzIiLCJwb3ciLCJnZXRTY3JlZW5TaXplIiwic3BoZXJlIiwiZGlzdGFuY2UiLCJjZW50ZXIiLCJyYWRpdXMiLCJ2aWV3QW5nbGUiLCJhc2luIiwic3BoZXJlVmlld0hlaWdodCIsInRhbiIsInNjcmVlblZpZXdIZWlnaHQiLCJtYXRoIiwiREVHX1RPX1JBRCIsIm1pbiIsImNsYW1wIiwiZ2V0RnJ1c3R1bUNvcm5lcnMiLCJuZWFyIiwiZmFyIiwiUEkiLCJwb2ludHMiLCJzZXRYclByb3BlcnRpZXMiLCJwcm9wZXJ0aWVzIiwiT2JqZWN0IiwiYXNzaWduIl0sIm1hcHBpbmdzIjoiOzs7Ozs7OztBQWFBO0FBQ0EsTUFBTUEsWUFBWSxHQUFHLElBQUlDLElBQUks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
