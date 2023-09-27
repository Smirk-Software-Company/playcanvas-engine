import { math } from './math.js';
import { Vec2 } from './vec2.js';
import { Vec3 } from './vec3.js';
import { Vec4 } from './vec4.js';

const _halfSize = new Vec2();
const x = new Vec3();
const y = new Vec3();
const z = new Vec3();
const scale = new Vec3();

/**
 * A 4x4 matrix.
 *
 * @category Math
 */
class Mat4 {
  /**
   * Create a new Mat4 instance. It is initialized to the identity matrix.
   */
  constructor() {
    /**
     * Matrix elements in the form of a flat array.
     *
     * @type {Float32Array}
     */
    this.data = new Float32Array(16);
    // Create an identity matrix. Note that a new Float32Array has all elements set
    // to zero by default, so we only need to set the relevant elements to one.
    this.data[0] = this.data[5] = this.data[10] = this.data[15] = 1;
  }

  // Static function which evaluates perspective projection matrix half size at the near plane
  static _getPerspectiveHalfSize(halfSize, fov, aspect, znear, fovIsHorizontal) {
    if (fovIsHorizontal) {
      halfSize.x = znear * Math.tan(fov * Math.PI / 360);
      halfSize.y = halfSize.x / aspect;
    } else {
      halfSize.y = znear * Math.tan(fov * Math.PI / 360);
      halfSize.x = halfSize.y * aspect;
    }
  }

  /**
   * Adds the specified 4x4 matrices together and stores the result in the current instance.
   *
   * @param {Mat4} lhs - The 4x4 matrix used as the first operand of the addition.
   * @param {Mat4} rhs - The 4x4 matrix used as the second operand of the addition.
   * @returns {Mat4} Self for chaining.
   * @example
   * const m = new pc.Mat4();
   *
   * m.add2(pc.Mat4.IDENTITY, pc.Mat4.ONE);
   *
   * console.log("The result of the addition is: " + m.toString());
   */
  add2(lhs, rhs) {
    const a = lhs.data,
      b = rhs.data,
      r = this.data;
    r[0] = a[0] + b[0];
    r[1] = a[1] + b[1];
    r[2] = a[2] + b[2];
    r[3] = a[3] + b[3];
    r[4] = a[4] + b[4];
    r[5] = a[5] + b[5];
    r[6] = a[6] + b[6];
    r[7] = a[7] + b[7];
    r[8] = a[8] + b[8];
    r[9] = a[9] + b[9];
    r[10] = a[10] + b[10];
    r[11] = a[11] + b[11];
    r[12] = a[12] + b[12];
    r[13] = a[13] + b[13];
    r[14] = a[14] + b[14];
    r[15] = a[15] + b[15];
    return this;
  }

  /**
   * Adds the specified 4x4 matrix to the current instance.
   *
   * @param {Mat4} rhs - The 4x4 matrix used as the second operand of the addition.
   * @returns {Mat4} Self for chaining.
   * @example
   * const m = new pc.Mat4();
   *
   * m.add(pc.Mat4.ONE);
   *
   * console.log("The result of the addition is: " + m.toString());
   */
  add(rhs) {
    return this.add2(this, rhs);
  }

  /**
   * Creates a duplicate of the specified matrix.
   *
   * @returns {this} A duplicate matrix.
   * @example
   * const src = new pc.Mat4().setFromEulerAngles(10, 20, 30);
   * const dst = src.clone();
   * console.log("The two matrices are " + (src.equals(dst) ? "equal" : "different"));
   */
  clone() {
    /** @type {this} */
    const cstr = this.constructor;
    return new cstr().copy(this);
  }

  /**
   * Copies the contents of a source 4x4 matrix to a destination 4x4 matrix.
   *
   * @param {Mat4} rhs - A 4x4 matrix to be copied.
   * @returns {Mat4} Self for chaining.
   * @example
   * const src = new pc.Mat4().setFromEulerAngles(10, 20, 30);
   * const dst = new pc.Mat4();
   * dst.copy(src);
   * console.log("The two matrices are " + (src.equals(dst) ? "equal" : "different"));
   */
  copy(rhs) {
    const src = rhs.data,
      dst = this.data;
    dst[0] = src[0];
    dst[1] = src[1];
    dst[2] = src[2];
    dst[3] = src[3];
    dst[4] = src[4];
    dst[5] = src[5];
    dst[6] = src[6];
    dst[7] = src[7];
    dst[8] = src[8];
    dst[9] = src[9];
    dst[10] = src[10];
    dst[11] = src[11];
    dst[12] = src[12];
    dst[13] = src[13];
    dst[14] = src[14];
    dst[15] = src[15];
    return this;
  }

  /**
   * Reports whether two matrices are equal.
   *
   * @param {Mat4} rhs - The other matrix.
   * @returns {boolean} True if the matrices are equal and false otherwise.
   * @example
   * const a = new pc.Mat4().setFromEulerAngles(10, 20, 30);
   * const b = new pc.Mat4();
   * console.log("The two matrices are " + (a.equals(b) ? "equal" : "different"));
   */
  equals(rhs) {
    const l = this.data,
      r = rhs.data;
    return l[0] === r[0] && l[1] === r[1] && l[2] === r[2] && l[3] === r[3] && l[4] === r[4] && l[5] === r[5] && l[6] === r[6] && l[7] === r[7] && l[8] === r[8] && l[9] === r[9] && l[10] === r[10] && l[11] === r[11] && l[12] === r[12] && l[13] === r[13] && l[14] === r[14] && l[15] === r[15];
  }

  /**
   * Reports whether the specified matrix is the identity matrix.
   *
   * @returns {boolean} True if the matrix is identity and false otherwise.
   * @example
   * const m = new pc.Mat4();
   * console.log("The matrix is " + (m.isIdentity() ? "identity" : "not identity"));
   */
  isIdentity() {
    const m = this.data;
    return m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 0 && m[4] === 0 && m[5] === 1 && m[6] === 0 && m[7] === 0 && m[8] === 0 && m[9] === 0 && m[10] === 1 && m[11] === 0 && m[12] === 0 && m[13] === 0 && m[14] === 0 && m[15] === 1;
  }

  /**
   * Multiplies the specified 4x4 matrices together and stores the result in the current
   * instance.
   *
   * @param {Mat4} lhs - The 4x4 matrix used as the first multiplicand of the operation.
   * @param {Mat4} rhs - The 4x4 matrix used as the second multiplicand of the operation.
   * @returns {Mat4} Self for chaining.
   * @example
   * const a = new pc.Mat4().setFromEulerAngles(10, 20, 30);
   * const b = new pc.Mat4().setFromAxisAngle(pc.Vec3.UP, 180);
   * const r = new pc.Mat4();
   *
   * // r = a * b
   * r.mul2(a, b);
   *
   * console.log("The result of the multiplication is: " + r.toString());
   */
  mul2(lhs, rhs) {
    const a = lhs.data;
    const b = rhs.data;
    const r = this.data;
    const a00 = a[0];
    const a01 = a[1];
    const a02 = a[2];
    const a03 = a[3];
    const a10 = a[4];
    const a11 = a[5];
    const a12 = a[6];
    const a13 = a[7];
    const a20 = a[8];
    const a21 = a[9];
    const a22 = a[10];
    const a23 = a[11];
    const a30 = a[12];
    const a31 = a[13];
    const a32 = a[14];
    const a33 = a[15];
    let b0, b1, b2, b3;
    b0 = b[0];
    b1 = b[1];
    b2 = b[2];
    b3 = b[3];
    r[0] = a00 * b0 + a10 * b1 + a20 * b2 + a30 * b3;
    r[1] = a01 * b0 + a11 * b1 + a21 * b2 + a31 * b3;
    r[2] = a02 * b0 + a12 * b1 + a22 * b2 + a32 * b3;
    r[3] = a03 * b0 + a13 * b1 + a23 * b2 + a33 * b3;
    b0 = b[4];
    b1 = b[5];
    b2 = b[6];
    b3 = b[7];
    r[4] = a00 * b0 + a10 * b1 + a20 * b2 + a30 * b3;
    r[5] = a01 * b0 + a11 * b1 + a21 * b2 + a31 * b3;
    r[6] = a02 * b0 + a12 * b1 + a22 * b2 + a32 * b3;
    r[7] = a03 * b0 + a13 * b1 + a23 * b2 + a33 * b3;
    b0 = b[8];
    b1 = b[9];
    b2 = b[10];
    b3 = b[11];
    r[8] = a00 * b0 + a10 * b1 + a20 * b2 + a30 * b3;
    r[9] = a01 * b0 + a11 * b1 + a21 * b2 + a31 * b3;
    r[10] = a02 * b0 + a12 * b1 + a22 * b2 + a32 * b3;
    r[11] = a03 * b0 + a13 * b1 + a23 * b2 + a33 * b3;
    b0 = b[12];
    b1 = b[13];
    b2 = b[14];
    b3 = b[15];
    r[12] = a00 * b0 + a10 * b1 + a20 * b2 + a30 * b3;
    r[13] = a01 * b0 + a11 * b1 + a21 * b2 + a31 * b3;
    r[14] = a02 * b0 + a12 * b1 + a22 * b2 + a32 * b3;
    r[15] = a03 * b0 + a13 * b1 + a23 * b2 + a33 * b3;
    return this;
  }

  /**
   * Multiplies the specified 4x4 matrices together and stores the result in the current
   * instance. This function assumes the matrices are affine transformation matrices, where the
   * upper left 3x3 elements are a rotation matrix, and the bottom left 3 elements are
   * translation. The rightmost column is assumed to be [0, 0, 0, 1]. The parameters are not
   * verified to be in the expected format. This function is faster than general
   * {@link Mat4#mul2}.
   *
   * @param {Mat4} lhs - The affine transformation 4x4 matrix used as the first multiplicand of
   * the operation.
   * @param {Mat4} rhs - The affine transformation 4x4 matrix used as the second multiplicand of
   * the operation.
   * @returns {Mat4} Self for chaining.
   */
  mulAffine2(lhs, rhs) {
    const a = lhs.data;
    const b = rhs.data;
    const r = this.data;
    const a00 = a[0];
    const a01 = a[1];
    const a02 = a[2];
    const a10 = a[4];
    const a11 = a[5];
    const a12 = a[6];
    const a20 = a[8];
    const a21 = a[9];
    const a22 = a[10];
    const a30 = a[12];
    const a31 = a[13];
    const a32 = a[14];
    let b0, b1, b2;
    b0 = b[0];
    b1 = b[1];
    b2 = b[2];
    r[0] = a00 * b0 + a10 * b1 + a20 * b2;
    r[1] = a01 * b0 + a11 * b1 + a21 * b2;
    r[2] = a02 * b0 + a12 * b1 + a22 * b2;
    r[3] = 0;
    b0 = b[4];
    b1 = b[5];
    b2 = b[6];
    r[4] = a00 * b0 + a10 * b1 + a20 * b2;
    r[5] = a01 * b0 + a11 * b1 + a21 * b2;
    r[6] = a02 * b0 + a12 * b1 + a22 * b2;
    r[7] = 0;
    b0 = b[8];
    b1 = b[9];
    b2 = b[10];
    r[8] = a00 * b0 + a10 * b1 + a20 * b2;
    r[9] = a01 * b0 + a11 * b1 + a21 * b2;
    r[10] = a02 * b0 + a12 * b1 + a22 * b2;
    r[11] = 0;
    b0 = b[12];
    b1 = b[13];
    b2 = b[14];
    r[12] = a00 * b0 + a10 * b1 + a20 * b2 + a30;
    r[13] = a01 * b0 + a11 * b1 + a21 * b2 + a31;
    r[14] = a02 * b0 + a12 * b1 + a22 * b2 + a32;
    r[15] = 1;
    return this;
  }

  /**
   * Multiplies the current instance by the specified 4x4 matrix.
   *
   * @param {Mat4} rhs - The 4x4 matrix used as the second multiplicand of the operation.
   * @returns {Mat4} Self for chaining.
   * @example
   * const a = new pc.Mat4().setFromEulerAngles(10, 20, 30);
   * const b = new pc.Mat4().setFromAxisAngle(pc.Vec3.UP, 180);
   *
   * // a = a * b
   * a.mul(b);
   *
   * console.log("The result of the multiplication is: " + a.toString());
   */
  mul(rhs) {
    return this.mul2(this, rhs);
  }

  /**
   * Transforms a 3-dimensional point by a 4x4 matrix.
   *
   * @param {Vec3} vec - The 3-dimensional point to be transformed.
   * @param {Vec3} [res] - An optional 3-dimensional point to receive the result of the
   * transformation.
   * @returns {Vec3} The input point v transformed by the current instance.
   * @example
   * // Create a 3-dimensional point
   * const v = new pc.Vec3(1, 2, 3);
   *
   * // Create a 4x4 rotation matrix
   * const m = new pc.Mat4().setFromEulerAngles(10, 20, 30);
   *
   * const tv = m.transformPoint(v);
   */
  transformPoint(vec, res = new Vec3()) {
    const m = this.data;
    const x = vec.x;
    const y = vec.y;
    const z = vec.z;
    res.x = x * m[0] + y * m[4] + z * m[8] + m[12];
    res.y = x * m[1] + y * m[5] + z * m[9] + m[13];
    res.z = x * m[2] + y * m[6] + z * m[10] + m[14];
    return res;
  }

  /**
   * Transforms a 3-dimensional vector by a 4x4 matrix.
   *
   * @param {Vec3} vec - The 3-dimensional vector to be transformed.
   * @param {Vec3} [res] - An optional 3-dimensional vector to receive the result of the
   * transformation.
   * @returns {Vec3} The input vector v transformed by the current instance.
   * @example
   * // Create a 3-dimensional vector
   * const v = new pc.Vec3(1, 2, 3);
   *
   * // Create a 4x4 rotation matrix
   * const m = new pc.Mat4().setFromEulerAngles(10, 20, 30);
   *
   * const tv = m.transformVector(v);
   */
  transformVector(vec, res = new Vec3()) {
    const m = this.data;
    const x = vec.x;
    const y = vec.y;
    const z = vec.z;
    res.x = x * m[0] + y * m[4] + z * m[8];
    res.y = x * m[1] + y * m[5] + z * m[9];
    res.z = x * m[2] + y * m[6] + z * m[10];
    return res;
  }

  /**
   * Transforms a 4-dimensional vector by a 4x4 matrix.
   *
   * @param {Vec4} vec - The 4-dimensional vector to be transformed.
   * @param {Vec4} [res] - An optional 4-dimensional vector to receive the result of the
   * transformation.
   * @returns {Vec4} The input vector v transformed by the current instance.
   * @example
   * // Create an input 4-dimensional vector
   * const v = new pc.Vec4(1, 2, 3, 4);
   *
   * // Create an output 4-dimensional vector
   * const result = new pc.Vec4();
   *
   * // Create a 4x4 rotation matrix
   * const m = new pc.Mat4().setFromEulerAngles(10, 20, 30);
   *
   * m.transformVec4(v, result);
   */
  transformVec4(vec, res = new Vec4()) {
    const m = this.data;
    const x = vec.x;
    const y = vec.y;
    const z = vec.z;
    const w = vec.w;
    res.x = x * m[0] + y * m[4] + z * m[8] + w * m[12];
    res.y = x * m[1] + y * m[5] + z * m[9] + w * m[13];
    res.z = x * m[2] + y * m[6] + z * m[10] + w * m[14];
    res.w = x * m[3] + y * m[7] + z * m[11] + w * m[15];
    return res;
  }

  /**
   * Sets the specified matrix to a viewing matrix derived from an eye point, a target point and
   * an up vector. The matrix maps the target point to the negative z-axis and the eye point to
   * the origin, so that when you use a typical projection matrix, the center of the scene maps
   * to the center of the viewport. Similarly, the direction described by the up vector projected
   * onto the viewing plane is mapped to the positive y-axis so that it points upward in the
   * viewport. The up vector must not be parallel to the line of sight from the eye to the
   * reference point.
   *
   * @param {Vec3} position - 3-d vector holding view position.
   * @param {Vec3} target - 3-d vector holding reference point.
   * @param {Vec3} up - 3-d vector holding the up direction.
   * @returns {Mat4} Self for chaining.
   * @example
   * const position = new pc.Vec3(10, 10, 10);
   * const target = new pc.Vec3(0, 0, 0);
   * const up = new pc.Vec3(0, 1, 0);
   * const m = new pc.Mat4().setLookAt(position, target, up);
   */
  setLookAt(position, target, up) {
    z.sub2(position, target).normalize();
    y.copy(up).normalize();
    x.cross(y, z).normalize();
    y.cross(z, x);
    const r = this.data;
    r[0] = x.x;
    r[1] = x.y;
    r[2] = x.z;
    r[3] = 0;
    r[4] = y.x;
    r[5] = y.y;
    r[6] = y.z;
    r[7] = 0;
    r[8] = z.x;
    r[9] = z.y;
    r[10] = z.z;
    r[11] = 0;
    r[12] = position.x;
    r[13] = position.y;
    r[14] = position.z;
    r[15] = 1;
    return this;
  }

  /**
   * Sets the specified matrix to a perspective projection matrix. The function's parameters
   * define the shape of a frustum.
   *
   * @param {number} left - The x-coordinate for the left edge of the camera's projection plane
   * in eye space.
   * @param {number} right - The x-coordinate for the right edge of the camera's projection plane
   * in eye space.
   * @param {number} bottom - The y-coordinate for the bottom edge of the camera's projection
   * plane in eye space.
   * @param {number} top - The y-coordinate for the top edge of the camera's projection plane in
   * eye space.
   * @param {number} znear - The near clip plane in eye coordinates.
   * @param {number} zfar - The far clip plane in eye coordinates.
   * @returns {Mat4} Self for chaining.
   * @example
   * // Create a 4x4 perspective projection matrix
   * const f = pc.Mat4().setFrustum(-2, 2, -1, 1, 1, 1000);
   * @ignore
   */
  setFrustum(left, right, bottom, top, znear, zfar) {
    const temp1 = 2 * znear;
    const temp2 = right - left;
    const temp3 = top - bottom;
    const temp4 = zfar - znear;
    const r = this.data;
    r[0] = temp1 / temp2;
    r[1] = 0;
    r[2] = 0;
    r[3] = 0;
    r[4] = 0;
    r[5] = temp1 / temp3;
    r[6] = 0;
    r[7] = 0;
    r[8] = (right + left) / temp2;
    r[9] = (top + bottom) / temp3;
    r[10] = (-zfar - znear) / temp4;
    r[11] = -1;
    r[12] = 0;
    r[13] = 0;
    r[14] = -temp1 * zfar / temp4;
    r[15] = 0;
    return this;
  }

  /**
   * Sets the specified matrix to a perspective projection matrix. The function's parameters
   * define the shape of a frustum.
   *
   * @param {number} fov - The frustum's field of view in degrees. The fovIsHorizontal parameter
   * controls whether this is a vertical or horizontal field of view. By default, it's a vertical
   * field of view.
   * @param {number} aspect - The aspect ratio of the frustum's projection plane
   * (width / height).
   * @param {number} znear - The near clip plane in eye coordinates.
   * @param {number} zfar - The far clip plane in eye coordinates.
   * @param {boolean} [fovIsHorizontal] - Set to true to treat the fov as horizontal (x-axis) and
   * false for vertical (y-axis). Defaults to false.
   * @returns {Mat4} Self for chaining.
   * @example
   * // Create a 4x4 perspective projection matrix
   * const persp = pc.Mat4().setPerspective(45, 16 / 9, 1, 1000);
   */
  setPerspective(fov, aspect, znear, zfar, fovIsHorizontal) {
    Mat4._getPerspectiveHalfSize(_halfSize, fov, aspect, znear, fovIsHorizontal);
    return this.setFrustum(-_halfSize.x, _halfSize.x, -_halfSize.y, _halfSize.y, znear, zfar);
  }

  /**
   * Sets the specified matrix to an orthographic projection matrix. The function's parameters
   * define the shape of a cuboid-shaped frustum.
   *
   * @param {number} left - The x-coordinate for the left edge of the camera's projection plane
   * in eye space.
   * @param {number} right - The x-coordinate for the right edge of the camera's projection plane
   * in eye space.
   * @param {number} bottom - The y-coordinate for the bottom edge of the camera's projection
   * plane in eye space.
   * @param {number} top - The y-coordinate for the top edge of the camera's projection plane in
   * eye space.
   * @param {number} near - The near clip plane in eye coordinates.
   * @param {number} far - The far clip plane in eye coordinates.
   * @returns {Mat4} Self for chaining.
   * @example
   * // Create a 4x4 orthographic projection matrix
   * const ortho = pc.Mat4().ortho(-2, 2, -2, 2, 1, 1000);
   */
  setOrtho(left, right, bottom, top, near, far) {
    const r = this.data;
    r[0] = 2 / (right - left);
    r[1] = 0;
    r[2] = 0;
    r[3] = 0;
    r[4] = 0;
    r[5] = 2 / (top - bottom);
    r[6] = 0;
    r[7] = 0;
    r[8] = 0;
    r[9] = 0;
    r[10] = -2 / (far - near);
    r[11] = 0;
    r[12] = -(right + left) / (right - left);
    r[13] = -(top + bottom) / (top - bottom);
    r[14] = -(far + near) / (far - near);
    r[15] = 1;
    return this;
  }

  /**
   * Sets the specified matrix to a rotation matrix equivalent to a rotation around an axis. The
   * axis must be normalized (unit length) and the angle must be specified in degrees.
   *
   * @param {Vec3} axis - The normalized axis vector around which to rotate.
   * @param {number} angle - The angle of rotation in degrees.
   * @returns {Mat4} Self for chaining.
   * @example
   * // Create a 4x4 rotation matrix
   * const rm = new pc.Mat4().setFromAxisAngle(pc.Vec3.UP, 90);
   */
  setFromAxisAngle(axis, angle) {
    angle *= math.DEG_TO_RAD;
    const x = axis.x;
    const y = axis.y;
    const z = axis.z;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const t = 1 - c;
    const tx = t * x;
    const ty = t * y;
    const m = this.data;
    m[0] = tx * x + c;
    m[1] = tx * y + s * z;
    m[2] = tx * z - s * y;
    m[3] = 0;
    m[4] = tx * y - s * z;
    m[5] = ty * y + c;
    m[6] = ty * z + s * x;
    m[7] = 0;
    m[8] = tx * z + s * y;
    m[9] = ty * z - x * s;
    m[10] = t * z * z + c;
    m[11] = 0;
    m[12] = 0;
    m[13] = 0;
    m[14] = 0;
    m[15] = 1;
    return this;
  }

  /**
   * Sets the specified matrix to a translation matrix.
   *
   * @param {number} x - The x-component of the translation.
   * @param {number} y - The y-component of the translation.
   * @param {number} z - The z-component of the translation.
   * @returns {Mat4} Self for chaining.
   * @example
   * // Create a 4x4 translation matrix
   * const tm = new pc.Mat4().setTranslate(10, 10, 10);
   * @ignore
   */
  setTranslate(x, y, z) {
    const m = this.data;
    m[0] = 1;
    m[1] = 0;
    m[2] = 0;
    m[3] = 0;
    m[4] = 0;
    m[5] = 1;
    m[6] = 0;
    m[7] = 0;
    m[8] = 0;
    m[9] = 0;
    m[10] = 1;
    m[11] = 0;
    m[12] = x;
    m[13] = y;
    m[14] = z;
    m[15] = 1;
    return this;
  }

  /**
   * Sets the specified matrix to a scale matrix.
   *
   * @param {number} x - The x-component of the scale.
   * @param {number} y - The y-component of the scale.
   * @param {number} z - The z-component of the scale.
   * @returns {Mat4} Self for chaining.
   * @example
   * // Create a 4x4 scale matrix
   * const sm = new pc.Mat4().setScale(10, 10, 10);
   * @ignore
   */
  setScale(x, y, z) {
    const m = this.data;
    m[0] = x;
    m[1] = 0;
    m[2] = 0;
    m[3] = 0;
    m[4] = 0;
    m[5] = y;
    m[6] = 0;
    m[7] = 0;
    m[8] = 0;
    m[9] = 0;
    m[10] = z;
    m[11] = 0;
    m[12] = 0;
    m[13] = 0;
    m[14] = 0;
    m[15] = 1;
    return this;
  }

  /**
   * Sets the specified matrix to a matrix transforming a normalized view volume (in range of
   * -1 .. 1) to their position inside a viewport (in range of 0 .. 1). This encapsulates a
   * scaling to the size of the viewport and a translation to the position of the viewport.
   *
   * @param {number} x - The x-component of the position of the viewport (in 0..1 range).
   * @param {number} y - The y-component of the position of the viewport (in 0..1 range).
   * @param {number} width - The width of the viewport (in 0..1 range).
   * @param {number} height - The height of the viewport (in 0..1 range).
   * @returns {Mat4} Self for chaining.
   * @example
   * // Create a 4x4 viewport matrix which scales normalized view volume to full texture viewport
   * const vm = new pc.Mat4().setViewport(0, 0, 1, 1);
   * @ignore
   */
  setViewport(x, y, width, height) {
    const m = this.data;
    m[0] = width * 0.5;
    m[1] = 0;
    m[2] = 0;
    m[3] = 0;
    m[4] = 0;
    m[5] = height * 0.5;
    m[6] = 0;
    m[7] = 0;
    m[8] = 0;
    m[9] = 0;
    m[10] = 0.5;
    m[11] = 0;
    m[12] = x + width * 0.5;
    m[13] = y + height * 0.5;
    m[14] = 0.5;
    m[15] = 1;
    return this;
  }

  /**
   * Sets the matrix to a reflection matrix, which can be used as a mirror transformation by the
   * plane.
   *
   * @param {Vec3} normal - The normal of the plane to reflect by.
   * @param {number} distance - The distance of plane to reflect by.
   * @returns {Mat4} Self for chaining.
   */
  setReflection(normal, distance) {
    const a = normal.x;
    const b = normal.y;
    const c = normal.z;
    const data = this.data;
    data[0] = 1.0 - 2 * a * a;
    data[1] = -2 * a * b;
    data[2] = -2 * a * c;
    data[3] = 0;
    data[4] = -2 * a * b;
    data[5] = 1.0 - 2 * b * b;
    data[6] = -2 * b * c;
    data[7] = 0;
    data[8] = -2 * a * c;
    data[9] = -2 * b * c;
    data[10] = 1.0 - 2 * c * c;
    data[11] = 0;
    data[12] = -2 * a * distance;
    data[13] = -2 * b * distance;
    data[14] = -2 * c * distance;
    data[15] = 1;
    return this;
  }

  /**
   * Sets the matrix to the inverse of a source matrix.
   *
   * @param {Mat4} [src] - The matrix to invert. If not set, the matrix is inverted in-place.
   * @returns {Mat4} Self for chaining.
   * @example
   * // Create a 4x4 rotation matrix of 180 degrees around the y-axis
   * const rot = new pc.Mat4().setFromAxisAngle(pc.Vec3.UP, 180);
   *
   * // Invert in place
   * rot.invert();
   */
  invert(src = this) {
    const s = src.data;
    const a00 = s[0];
    const a01 = s[1];
    const a02 = s[2];
    const a03 = s[3];
    const a10 = s[4];
    const a11 = s[5];
    const a12 = s[6];
    const a13 = s[7];
    const a20 = s[8];
    const a21 = s[9];
    const a22 = s[10];
    const a23 = s[11];
    const a30 = s[12];
    const a31 = s[13];
    const a32 = s[14];
    const a33 = s[15];
    const b00 = a00 * a11 - a01 * a10;
    const b01 = a00 * a12 - a02 * a10;
    const b02 = a00 * a13 - a03 * a10;
    const b03 = a01 * a12 - a02 * a11;
    const b04 = a01 * a13 - a03 * a11;
    const b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30;
    const b07 = a20 * a32 - a22 * a30;
    const b08 = a20 * a33 - a23 * a30;
    const b09 = a21 * a32 - a22 * a31;
    const b10 = a21 * a33 - a23 * a31;
    const b11 = a22 * a33 - a23 * a32;
    const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (det === 0) {
      this.setIdentity();
    } else {
      const invDet = 1 / det;
      const t = this.data;
      t[0] = (a11 * b11 - a12 * b10 + a13 * b09) * invDet;
      t[1] = (-a01 * b11 + a02 * b10 - a03 * b09) * invDet;
      t[2] = (a31 * b05 - a32 * b04 + a33 * b03) * invDet;
      t[3] = (-a21 * b05 + a22 * b04 - a23 * b03) * invDet;
      t[4] = (-a10 * b11 + a12 * b08 - a13 * b07) * invDet;
      t[5] = (a00 * b11 - a02 * b08 + a03 * b07) * invDet;
      t[6] = (-a30 * b05 + a32 * b02 - a33 * b01) * invDet;
      t[7] = (a20 * b05 - a22 * b02 + a23 * b01) * invDet;
      t[8] = (a10 * b10 - a11 * b08 + a13 * b06) * invDet;
      t[9] = (-a00 * b10 + a01 * b08 - a03 * b06) * invDet;
      t[10] = (a30 * b04 - a31 * b02 + a33 * b00) * invDet;
      t[11] = (-a20 * b04 + a21 * b02 - a23 * b00) * invDet;
      t[12] = (-a10 * b09 + a11 * b07 - a12 * b06) * invDet;
      t[13] = (a00 * b09 - a01 * b07 + a02 * b06) * invDet;
      t[14] = (-a30 * b03 + a31 * b01 - a32 * b00) * invDet;
      t[15] = (a20 * b03 - a21 * b01 + a22 * b00) * invDet;
    }
    return this;
  }

  /**
   * Sets matrix data from an array.
   *
   * @param {number[]} src - Source array. Must have 16 values.
   * @returns {Mat4} Self for chaining.
   */
  set(src) {
    const dst = this.data;
    dst[0] = src[0];
    dst[1] = src[1];
    dst[2] = src[2];
    dst[3] = src[3];
    dst[4] = src[4];
    dst[5] = src[5];
    dst[6] = src[6];
    dst[7] = src[7];
    dst[8] = src[8];
    dst[9] = src[9];
    dst[10] = src[10];
    dst[11] = src[11];
    dst[12] = src[12];
    dst[13] = src[13];
    dst[14] = src[14];
    dst[15] = src[15];
    return this;
  }

  /**
   * Sets the specified matrix to the identity matrix.
   *
   * @returns {Mat4} Self for chaining.
   * @example
   * m.setIdentity();
   * console.log("The matrix is " + (m.isIdentity() ? "identity" : "not identity"));
   */
  setIdentity() {
    const m = this.data;
    m[0] = 1;
    m[1] = 0;
    m[2] = 0;
    m[3] = 0;
    m[4] = 0;
    m[5] = 1;
    m[6] = 0;
    m[7] = 0;
    m[8] = 0;
    m[9] = 0;
    m[10] = 1;
    m[11] = 0;
    m[12] = 0;
    m[13] = 0;
    m[14] = 0;
    m[15] = 1;
    return this;
  }

  /**
   * Sets the specified matrix to the concatenation of a translation, a quaternion rotation and a
   * scale.
   *
   * @param {Vec3} t - A 3-d vector translation.
   * @param {import('./quat.js').Quat} r - A quaternion rotation.
   * @param {Vec3} s - A 3-d vector scale.
   * @returns {Mat4} Self for chaining.
   * @example
   * const t = new pc.Vec3(10, 20, 30);
   * const r = new pc.Quat();
   * const s = new pc.Vec3(2, 2, 2);
   *
   * const m = new pc.Mat4();
   * m.setTRS(t, r, s);
   */
  setTRS(t, r, s) {
    const qx = r.x;
    const qy = r.y;
    const qz = r.z;
    const qw = r.w;
    const sx = s.x;
    const sy = s.y;
    const sz = s.z;
    const x2 = qx + qx;
    const y2 = qy + qy;
    const z2 = qz + qz;
    const xx = qx * x2;
    const xy = qx * y2;
    const xz = qx * z2;
    const yy = qy * y2;
    const yz = qy * z2;
    const zz = qz * z2;
    const wx = qw * x2;
    const wy = qw * y2;
    const wz = qw * z2;
    const m = this.data;
    m[0] = (1 - (yy + zz)) * sx;
    m[1] = (xy + wz) * sx;
    m[2] = (xz - wy) * sx;
    m[3] = 0;
    m[4] = (xy - wz) * sy;
    m[5] = (1 - (xx + zz)) * sy;
    m[6] = (yz + wx) * sy;
    m[7] = 0;
    m[8] = (xz + wy) * sz;
    m[9] = (yz - wx) * sz;
    m[10] = (1 - (xx + yy)) * sz;
    m[11] = 0;
    m[12] = t.x;
    m[13] = t.y;
    m[14] = t.z;
    m[15] = 1;
    return this;
  }

  /**
   * Sets the matrix to the transpose of a source matrix.
   *
   * @param {Mat4} [src] - The matrix to transpose. If not set, the matrix is transposed in-place.
   * @returns {Mat4} Self for chaining.
   * @example
   * const m = new pc.Mat4();
   *
   * // Transpose in place
   * m.transpose();
   */
  transpose(src = this) {
    const s = src.data;
    const t = this.data;
    if (s === t) {
      let tmp;
      tmp = s[1];
      t[1] = s[4];
      t[4] = tmp;
      tmp = s[2];
      t[2] = s[8];
      t[8] = tmp;
      tmp = s[3];
      t[3] = s[12];
      t[12] = tmp;
      tmp = s[6];
      t[6] = s[9];
      t[9] = tmp;
      tmp = s[7];
      t[7] = s[13];
      t[13] = tmp;
      tmp = s[11];
      t[11] = s[14];
      t[14] = tmp;
    } else {
      t[0] = s[0];
      t[1] = s[4];
      t[2] = s[8];
      t[3] = s[12];
      t[4] = s[1];
      t[5] = s[5];
      t[6] = s[9];
      t[7] = s[13];
      t[8] = s[2];
      t[9] = s[6];
      t[10] = s[10];
      t[11] = s[14];
      t[12] = s[3];
      t[13] = s[7];
      t[14] = s[11];
      t[15] = s[15];
    }
    return this;
  }

  /**
   * Extracts the translational component from the specified 4x4 matrix.
   *
   * @param {Vec3} [t] - The vector to receive the translation of the matrix.
   * @returns {Vec3} The translation of the specified 4x4 matrix.
   * @example
   * // Create a 4x4 matrix
   * const m = new pc.Mat4();
   *
   * // Query the translation component
   * const t = new pc.Vec3();
   * m.getTranslation(t);
   */
  getTranslation(t = new Vec3()) {
    return t.set(this.data[12], this.data[13], this.data[14]);
  }

  /**
   * Extracts the x-axis from the specified 4x4 matrix.
   *
   * @param {Vec3} [x] - The vector to receive the x axis of the matrix.
   * @returns {Vec3} The x-axis of the specified 4x4 matrix.
   * @example
   * // Create a 4x4 matrix
   * const m = new pc.Mat4();
   *
   * // Query the x-axis component
   * const x = new pc.Vec3();
   * m.getX(x);
   */
  getX(x = new Vec3()) {
    return x.set(this.data[0], this.data[1], this.data[2]);
  }

  /**
   * Extracts the y-axis from the specified 4x4 matrix.
   *
   * @param {Vec3} [y] - The vector to receive the y axis of the matrix.
   * @returns {Vec3} The y-axis of the specified 4x4 matrix.
   * @example
   * // Create a 4x4 matrix
   * const m = new pc.Mat4();
   *
   * // Query the y-axis component
   * const y = new pc.Vec3();
   * m.getY(y);
   */
  getY(y = new Vec3()) {
    return y.set(this.data[4], this.data[5], this.data[6]);
  }

  /**
   * Extracts the z-axis from the specified 4x4 matrix.
   *
   * @param {Vec3} [z] - The vector to receive the z axis of the matrix.
   * @returns {Vec3} The z-axis of the specified 4x4 matrix.
   * @example
   * // Create a 4x4 matrix
   * const m = new pc.Mat4();
   *
   * // Query the z-axis component
   * const z = new pc.Vec3();
   * m.getZ(z);
   */
  getZ(z = new Vec3()) {
    return z.set(this.data[8], this.data[9], this.data[10]);
  }

  /**
   * Extracts the scale component from the specified 4x4 matrix.
   *
   * @param {Vec3} [scale] - Vector to receive the scale.
   * @returns {Vec3} The scale in X, Y and Z of the specified 4x4 matrix.
   * @example
   * // Query the scale component
   * const scale = m.getScale();
   */
  getScale(scale = new Vec3()) {
    this.getX(x);
    this.getY(y);
    this.getZ(z);
    scale.set(x.length(), y.length(), z.length());
    return scale;
  }

  /**
   * -1 if the the matrix has an odd number of negative scales (mirrored); 1 otherwise.
   *
   * @type {number}
   * @ignore
   */
  get scaleSign() {
    this.getX(x);
    this.getY(y);
    this.getZ(z);
    x.cross(x, y);
    return x.dot(z) < 0 ? -1 : 1;
  }

  /**
   * Sets the specified matrix to a rotation matrix defined by Euler angles. The Euler angles are
   * specified in XYZ order and in degrees.
   *
   * @param {number} ex - Angle to rotate around X axis in degrees.
   * @param {number} ey - Angle to rotate around Y axis in degrees.
   * @param {number} ez - Angle to rotate around Z axis in degrees.
   * @returns {Mat4} Self for chaining.
   * @example
   * const m = new pc.Mat4();
   * m.setFromEulerAngles(45, 90, 180);
   */
  setFromEulerAngles(ex, ey, ez) {
    // http://en.wikipedia.org/wiki/Rotation_matrix#Conversion_from_and_to_axis-angle
    // The 3D space is right-handed, so the rotation around each axis will be counterclockwise
    // for an observer placed so that the axis goes in his or her direction (Right-hand rule).
    ex *= math.DEG_TO_RAD;
    ey *= math.DEG_TO_RAD;
    ez *= math.DEG_TO_RAD;

    // Solution taken from http://en.wikipedia.org/wiki/Euler_angles#Matrix_orientation
    const s1 = Math.sin(-ex);
    const c1 = Math.cos(-ex);
    const s2 = Math.sin(-ey);
    const c2 = Math.cos(-ey);
    const s3 = Math.sin(-ez);
    const c3 = Math.cos(-ez);
    const m = this.data;

    // Set rotation elements
    m[0] = c2 * c3;
    m[1] = -c2 * s3;
    m[2] = s2;
    m[3] = 0;
    m[4] = c1 * s3 + c3 * s1 * s2;
    m[5] = c1 * c3 - s1 * s2 * s3;
    m[6] = -c2 * s1;
    m[7] = 0;
    m[8] = s1 * s3 - c1 * c3 * s2;
    m[9] = c3 * s1 + c1 * s2 * s3;
    m[10] = c1 * c2;
    m[11] = 0;
    m[12] = 0;
    m[13] = 0;
    m[14] = 0;
    m[15] = 1;
    return this;
  }

  /**
   * Extracts the Euler angles equivalent to the rotational portion of the specified matrix. The
   * returned Euler angles are in XYZ order an in degrees.
   *
   * @param {Vec3} [eulers] - A 3-d vector to receive the Euler angles.
   * @returns {Vec3} A 3-d vector containing the Euler angles.
   * @example
   * // Create a 4x4 rotation matrix of 45 degrees around the y-axis
   * const m = new pc.Mat4().setFromAxisAngle(pc.Vec3.UP, 45);
   *
   * const eulers = m.getEulerAngles();
   */
  getEulerAngles(eulers = new Vec3()) {
    this.getScale(scale);
    const sx = scale.x;
    const sy = scale.y;
    const sz = scale.z;
    if (sx === 0 || sy === 0 || sz === 0) return eulers.set(0, 0, 0);
    const m = this.data;
    const y = Math.asin(-m[2] / sx);
    const halfPi = Math.PI * 0.5;
    let x, z;
    if (y < halfPi) {
      if (y > -halfPi) {
        x = Math.atan2(m[6] / sy, m[10] / sz);
        z = Math.atan2(m[1] / sx, m[0] / sx);
      } else {
        // Not a unique solution
        z = 0;
        x = -Math.atan2(m[4] / sy, m[5] / sy);
      }
    } else {
      // Not a unique solution
      z = 0;
      x = Math.atan2(m[4] / sy, m[5] / sy);
    }
    return eulers.set(x, y, z).mulScalar(math.RAD_TO_DEG);
  }

  /**
   * Converts the specified matrix to string form.
   *
   * @returns {string} The matrix in string form.
   * @example
   * const m = new pc.Mat4();
   * // Outputs [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
   * console.log(m.toString());
   */
  toString() {
    return '[' + this.data.join(', ') + ']';
  }

  /**
   * A constant matrix set to the identity.
   *
   * @type {Mat4}
   * @readonly
   */
}
Mat4.IDENTITY = Object.freeze(new Mat4());
/**
 * A constant matrix with all elements set to 0.
 *
 * @type {Mat4}
 * @readonly
 */
Mat4.ZERO = Object.freeze(new Mat4().set([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));

export { Mat4 };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWF0NC5qcyIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL2NvcmUvbWF0aC9tYXQ0LmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IG1hdGggfSBmcm9tICcuL21hdGguanMnO1xuaW1wb3J0IHsgVmVjMiB9IGZyb20gJy4vdmVjMi5qcyc7XG5pbXBvcnQgeyBWZWMzIH0gZnJvbSAnLi92ZWMzLmpzJztcbmltcG9ydCB7IFZlYzQgfSBmcm9tICcuL3ZlYzQuanMnO1xuXG5jb25zdCBfaGFsZlNpemUgPSBuZXcgVmVjMigpO1xuY29uc3QgeCA9IG5ldyBWZWMzKCk7XG5jb25zdCB5ID0gbmV3IFZlYzMoKTtcbmNvbnN0IHogPSBuZXcgVmVjMygpO1xuY29uc3Qgc2NhbGUgPSBuZXcgVmVjMygpO1xuXG4vKipcbiAqIEEgNHg0IG1hdHJpeC5cbiAqXG4gKiBAY2F0ZWdvcnkgTWF0aFxuICovXG5jbGFzcyBNYXQ0IHtcbiAgICAvKipcbiAgICAgKiBNYXRyaXggZWxlbWVudHMgaW4gdGhlIGZvcm0gb2YgYSBmbGF0IGFycmF5LlxuICAgICAqXG4gICAgICogQHR5cGUge0Zsb2F0MzJBcnJheX1cbiAgICAgKi9cbiAgICBkYXRhID0gbmV3IEZsb2F0MzJBcnJheSgxNik7XG5cbiAgICAvKipcbiAgICAgKiBDcmVhdGUgYSBuZXcgTWF0NCBpbnN0YW5jZS4gSXQgaXMgaW5pdGlhbGl6ZWQgdG8gdGhlIGlkZW50aXR5IG1hdHJpeC5cbiAgICAgKi9cbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgLy8gQ3JlYXRlIGFuIGlkZW50aXR5IG1hdHJpeC4gTm90ZSB0aGF0IGEgbmV3IEZsb2F0MzJBcnJheSBoYXMgYWxsIGVsZW1lbnRzIHNldFxuICAgICAgICAvLyB0byB6ZXJvIGJ5IGRlZmF1bHQsIHNvIHdlIG9ubHkgbmVlZCB0byBzZXQgdGhlIHJlbGV2YW50IGVsZW1lbnRzIHRvIG9uZS5cbiAgICAgICAgdGhpcy5kYXRhWzBdID0gdGhpcy5kYXRhWzVdID0gdGhpcy5kYXRhWzEwXSA9IHRoaXMuZGF0YVsxNV0gPSAxO1xuICAgIH1cblxuICAgIC8vIFN0YXRpYyBmdW5jdGlvbiB3aGljaCBldmFsdWF0ZXMgcGVyc3BlY3RpdmUgcHJvamVjdGlvbiBtYXRyaXggaGFsZiBzaXplIGF0IHRoZSBuZWFyIHBsYW5lXG4gICAgc3RhdGljIF9nZXRQZXJzcGVjdGl2ZUhhbGZTaXplKGhhbGZTaXplLCBmb3YsIGFzcGVjdCwgem5lYXIsIGZvdklzSG9yaXpvbnRhbCkge1xuICAgICAgICBpZiAoZm92SXNIb3Jpem9udGFsKSB7XG4gICAgICAgICAgICBoYWxmU2l6ZS54ID0gem5lYXIgKiBNYXRoLnRhbihmb3YgKiBNYXRoLlBJIC8gMzYwKTtcbiAgICAgICAgICAgIGhhbGZTaXplLnkgPSBoYWxmU2l6ZS54IC8gYXNwZWN0O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaGFsZlNpemUueSA9IHpuZWFyICogTWF0aC50YW4oZm92ICogTWF0aC5QSSAvIDM2MCk7XG4gICAgICAgICAgICBoYWxmU2l6ZS54ID0gaGFsZlNpemUueSAqIGFzcGVjdDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEFkZHMgdGhlIHNwZWNpZmllZCA0eDQgbWF0cmljZXMgdG9nZXRoZXIgYW5kIHN0b3JlcyB0aGUgcmVzdWx0IGluIHRoZSBjdXJyZW50IGluc3RhbmNlLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtNYXQ0fSBsaHMgLSBUaGUgNHg0IG1hdHJpeCB1c2VkIGFzIHRoZSBmaXJzdCBvcGVyYW5kIG9mIHRoZSBhZGRpdGlvbi5cbiAgICAgKiBAcGFyYW0ge01hdDR9IHJocyAtIFRoZSA0eDQgbWF0cml4IHVzZWQgYXMgdGhlIHNlY29uZCBvcGVyYW5kIG9mIHRoZSBhZGRpdGlvbi5cbiAgICAgKiBAcmV0dXJucyB7TWF0NH0gU2VsZiBmb3IgY2hhaW5pbmcuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBjb25zdCBtID0gbmV3IHBjLk1hdDQoKTtcbiAgICAgKlxuICAgICAqIG0uYWRkMihwYy5NYXQ0LklERU5USVRZLCBwYy5NYXQ0Lk9ORSk7XG4gICAgICpcbiAgICAgKiBjb25zb2xlLmxvZyhcIlRoZSByZXN1bHQgb2YgdGhlIGFkZGl0aW9uIGlzOiBcIiArIG0udG9TdHJpbmcoKSk7XG4gICAgICovXG4gICAgYWRkMihsaHMsIHJocykge1xuICAgICAgICBjb25zdCBhID0gbGhzLmRhdGEsXG4gICAgICAgICAgICBiID0gcmhzLmRhdGEsXG4gICAgICAgICAgICByID0gdGhpcy5kYXRhO1xuXG4gICAgICAgIHJbMF0gPSBhWzBdICsgYlswXTtcbiAgICAgICAgclsxXSA9IGFbMV0gKyBiWzFdO1xuICAgICAgICByWzJdID0gYVsyXSArIGJbMl07XG4gICAgICAgIHJbM10gPSBhWzNdICsgYlszXTtcbiAgICAgICAgcls0XSA9IGFbNF0gKyBiWzRdO1xuICAgICAgICByWzVdID0gYVs1XSArIGJbNV07XG4gICAgICAgIHJbNl0gPSBhWzZdICsgYls2XTtcbiAgICAgICAgcls3XSA9IGFbN10gKyBiWzddO1xuICAgICAgICByWzhdID0gYVs4XSArIGJbOF07XG4gICAgICAgIHJbOV0gPSBhWzldICsgYls5XTtcbiAgICAgICAgclsxMF0gPSBhWzEwXSArIGJbMTBdO1xuICAgICAgICByWzExXSA9IGFbMTFdICsgYlsxMV07XG4gICAgICAgIHJbMTJdID0gYVsxMl0gKyBiWzEyXTtcbiAgICAgICAgclsxM10gPSBhWzEzXSArIGJbMTNdO1xuICAgICAgICByWzE0XSA9IGFbMTRdICsgYlsxNF07XG4gICAgICAgIHJbMTVdID0gYVsxNV0gKyBiWzE1XTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBZGRzIHRoZSBzcGVjaWZpZWQgNHg0IG1hdHJpeCB0byB0aGUgY3VycmVudCBpbnN0YW5jZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7TWF0NH0gcmhzIC0gVGhlIDR4NCBtYXRyaXggdXNlZCBhcyB0aGUgc2Vjb25kIG9wZXJhbmQgb2YgdGhlIGFkZGl0aW9uLlxuICAgICAqIEByZXR1cm5zIHtNYXQ0fSBTZWxmIGZvciBjaGFpbmluZy5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGNvbnN0IG0gPSBuZXcgcGMuTWF0NCgpO1xuICAgICAqXG4gICAgICogbS5hZGQocGMuTWF0NC5PTkUpO1xuICAgICAqXG4gICAgICogY29uc29sZS5sb2coXCJUaGUgcmVzdWx0IG9mIHRoZSBhZGRpdGlvbiBpczogXCIgKyBtLnRvU3RyaW5nKCkpO1xuICAgICAqL1xuICAgIGFkZChyaHMpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuYWRkMih0aGlzLCByaHMpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENyZWF0ZXMgYSBkdXBsaWNhdGUgb2YgdGhlIHNwZWNpZmllZCBtYXRyaXguXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7dGhpc30gQSBkdXBsaWNhdGUgbWF0cml4LlxuICAgICAqIEBleGFtcGxlXG4gICAgICogY29uc3Qgc3JjID0gbmV3IHBjLk1hdDQoKS5zZXRGcm9tRXVsZXJBbmdsZXMoMTAsIDIwLCAzMCk7XG4gICAgICogY29uc3QgZHN0ID0gc3JjLmNsb25lKCk7XG4gICAgICogY29uc29sZS5sb2coXCJUaGUgdHdvIG1hdHJpY2VzIGFyZSBcIiArIChzcmMuZXF1YWxzKGRzdCkgPyBcImVxdWFsXCIgOiBcImRpZmZlcmVudFwiKSk7XG4gICAgICovXG4gICAgY2xvbmUoKSB7XG4gICAgICAgIC8qKiBAdHlwZSB7dGhpc30gKi9cbiAgICAgICAgY29uc3QgY3N0ciA9IHRoaXMuY29uc3RydWN0b3I7XG4gICAgICAgIHJldHVybiBuZXcgY3N0cigpLmNvcHkodGhpcyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ29waWVzIHRoZSBjb250ZW50cyBvZiBhIHNvdXJjZSA0eDQgbWF0cml4IHRvIGEgZGVzdGluYXRpb24gNHg0IG1hdHJpeC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7TWF0NH0gcmhzIC0gQSA0eDQgbWF0cml4IHRvIGJlIGNvcGllZC5cbiAgICAgKiBAcmV0dXJucyB7TWF0NH0gU2VsZiBmb3IgY2hhaW5pbmcuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBjb25zdCBzcmMgPSBuZXcgcGMuTWF0NCgpLnNldEZyb21FdWxlckFuZ2xlcygxMCwgMjAsIDMwKTtcbiAgICAgKiBjb25zdCBkc3QgPSBuZXcgcGMuTWF0NCgpO1xuICAgICAqIGRzdC5jb3B5KHNyYyk7XG4gICAgICogY29uc29sZS5sb2coXCJUaGUgdHdvIG1hdHJpY2VzIGFyZSBcIiArIChzcmMuZXF1YWxzKGRzdCkgPyBcImVxdWFsXCIgOiBcImRpZmZlcmVudFwiKSk7XG4gICAgICovXG4gICAgY29weShyaHMpIHtcbiAgICAgICAgY29uc3Qgc3JjID0gcmhzLmRhdGEsXG4gICAgICAgICAgICBkc3QgPSB0aGlzLmRhdGE7XG5cbiAgICAgICAgZHN0WzBdID0gc3JjWzBdO1xuICAgICAgICBkc3RbMV0gPSBzcmNbMV07XG4gICAgICAgIGRzdFsyXSA9IHNyY1syXTtcbiAgICAgICAgZHN0WzNdID0gc3JjWzNdO1xuICAgICAgICBkc3RbNF0gPSBzcmNbNF07XG4gICAgICAgIGRzdFs1XSA9IHNyY1s1XTtcbiAgICAgICAgZHN0WzZdID0gc3JjWzZdO1xuICAgICAgICBkc3RbN10gPSBzcmNbN107XG4gICAgICAgIGRzdFs4XSA9IHNyY1s4XTtcbiAgICAgICAgZHN0WzldID0gc3JjWzldO1xuICAgICAgICBkc3RbMTBdID0gc3JjWzEwXTtcbiAgICAgICAgZHN0WzExXSA9IHNyY1sxMV07XG4gICAgICAgIGRzdFsxMl0gPSBzcmNbMTJdO1xuICAgICAgICBkc3RbMTNdID0gc3JjWzEzXTtcbiAgICAgICAgZHN0WzE0XSA9IHNyY1sxNF07XG4gICAgICAgIGRzdFsxNV0gPSBzcmNbMTVdO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJlcG9ydHMgd2hldGhlciB0d28gbWF0cmljZXMgYXJlIGVxdWFsLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtNYXQ0fSByaHMgLSBUaGUgb3RoZXIgbWF0cml4LlxuICAgICAqIEByZXR1cm5zIHtib29sZWFufSBUcnVlIGlmIHRoZSBtYXRyaWNlcyBhcmUgZXF1YWwgYW5kIGZhbHNlIG90aGVyd2lzZS5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGNvbnN0IGEgPSBuZXcgcGMuTWF0NCgpLnNldEZyb21FdWxlckFuZ2xlcygxMCwgMjAsIDMwKTtcbiAgICAgKiBjb25zdCBiID0gbmV3IHBjLk1hdDQoKTtcbiAgICAgKiBjb25zb2xlLmxvZyhcIlRoZSB0d28gbWF0cmljZXMgYXJlIFwiICsgKGEuZXF1YWxzKGIpID8gXCJlcXVhbFwiIDogXCJkaWZmZXJlbnRcIikpO1xuICAgICAqL1xuICAgIGVxdWFscyhyaHMpIHtcbiAgICAgICAgY29uc3QgbCA9IHRoaXMuZGF0YSxcbiAgICAgICAgICAgIHIgPSByaHMuZGF0YTtcblxuICAgICAgICByZXR1cm4gKChsWzBdID09PSByWzBdKSAmJlxuICAgICAgICAgICAgICAgIChsWzFdID09PSByWzFdKSAmJlxuICAgICAgICAgICAgICAgIChsWzJdID09PSByWzJdKSAmJlxuICAgICAgICAgICAgICAgIChsWzNdID09PSByWzNdKSAmJlxuICAgICAgICAgICAgICAgIChsWzRdID09PSByWzRdKSAmJlxuICAgICAgICAgICAgICAgIChsWzVdID09PSByWzVdKSAmJlxuICAgICAgICAgICAgICAgIChsWzZdID09PSByWzZdKSAmJlxuICAgICAgICAgICAgICAgIChsWzddID09PSByWzddKSAmJlxuICAgICAgICAgICAgICAgIChsWzhdID09PSByWzhdKSAmJlxuICAgICAgICAgICAgICAgIChsWzldID09PSByWzldKSAmJlxuICAgICAgICAgICAgICAgIChsWzEwXSA9PT0gclsxMF0pICYmXG4gICAgICAgICAgICAgICAgKGxbMTFdID09PSByWzExXSkgJiZcbiAgICAgICAgICAgICAgICAobFsxMl0gPT09IHJbMTJdKSAmJlxuICAgICAgICAgICAgICAgIChsWzEzXSA9PT0gclsxM10pICYmXG4gICAgICAgICAgICAgICAgKGxbMTRdID09PSByWzE0XSkgJiZcbiAgICAgICAgICAgICAgICAobFsxNV0gPT09IHJbMTVdKSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVwb3J0cyB3aGV0aGVyIHRoZSBzcGVjaWZpZWQgbWF0cml4IGlzIHRoZSBpZGVudGl0eSBtYXRyaXguXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7Ym9vbGVhbn0gVHJ1ZSBpZiB0aGUgbWF0cml4IGlzIGlkZW50aXR5IGFuZCBmYWxzZSBvdGhlcndpc2UuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBjb25zdCBtID0gbmV3IHBjLk1hdDQoKTtcbiAgICAgKiBjb25zb2xlLmxvZyhcIlRoZSBtYXRyaXggaXMgXCIgKyAobS5pc0lkZW50aXR5KCkgPyBcImlkZW50aXR5XCIgOiBcIm5vdCBpZGVudGl0eVwiKSk7XG4gICAgICovXG4gICAgaXNJZGVudGl0eSgpIHtcbiAgICAgICAgY29uc3QgbSA9IHRoaXMuZGF0YTtcblxuICAgICAgICByZXR1cm4gKChtWzBdID09PSAxKSAmJlxuICAgICAgICAgICAgICAgIChtWzFdID09PSAwKSAmJlxuICAgICAgICAgICAgICAgIChtWzJdID09PSAwKSAmJlxuICAgICAgICAgICAgICAgIChtWzNdID09PSAwKSAmJlxuICAgICAgICAgICAgICAgIChtWzRdID09PSAwKSAmJlxuICAgICAgICAgICAgICAgIChtWzVdID09PSAxKSAmJlxuICAgICAgICAgICAgICAgIChtWzZdID09PSAwKSAmJlxuICAgICAgICAgICAgICAgIChtWzddID09PSAwKSAmJlxuICAgICAgICAgICAgICAgIChtWzhdID09PSAwKSAmJlxuICAgICAgICAgICAgICAgIChtWzldID09PSAwKSAmJlxuICAgICAgICAgICAgICAgIChtWzEwXSA9PT0gMSkgJiZcbiAgICAgICAgICAgICAgICAobVsxMV0gPT09IDApICYmXG4gICAgICAgICAgICAgICAgKG1bMTJdID09PSAwKSAmJlxuICAgICAgICAgICAgICAgIChtWzEzXSA9PT0gMCkgJiZcbiAgICAgICAgICAgICAgICAobVsxNF0gPT09IDApICYmXG4gICAgICAgICAgICAgICAgKG1bMTVdID09PSAxKSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTXVsdGlwbGllcyB0aGUgc3BlY2lmaWVkIDR4NCBtYXRyaWNlcyB0b2dldGhlciBhbmQgc3RvcmVzIHRoZSByZXN1bHQgaW4gdGhlIGN1cnJlbnRcbiAgICAgKiBpbnN0YW5jZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7TWF0NH0gbGhzIC0gVGhlIDR4NCBtYXRyaXggdXNlZCBhcyB0aGUgZmlyc3QgbXVsdGlwbGljYW5kIG9mIHRoZSBvcGVyYXRpb24uXG4gICAgICogQHBhcmFtIHtNYXQ0fSByaHMgLSBUaGUgNHg0IG1hdHJpeCB1c2VkIGFzIHRoZSBzZWNvbmQgbXVsdGlwbGljYW5kIG9mIHRoZSBvcGVyYXRpb24uXG4gICAgICogQHJldHVybnMge01hdDR9IFNlbGYgZm9yIGNoYWluaW5nLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogY29uc3QgYSA9IG5ldyBwYy5NYXQ0KCkuc2V0RnJvbUV1bGVyQW5nbGVzKDEwLCAyMCwgMzApO1xuICAgICAqIGNvbnN0IGIgPSBuZXcgcGMuTWF0NCgpLnNldEZyb21BeGlzQW5nbGUocGMuVmVjMy5VUCwgMTgwKTtcbiAgICAgKiBjb25zdCByID0gbmV3IHBjLk1hdDQoKTtcbiAgICAgKlxuICAgICAqIC8vIHIgPSBhICogYlxuICAgICAqIHIubXVsMihhLCBiKTtcbiAgICAgKlxuICAgICAqIGNvbnNvbGUubG9nKFwiVGhlIHJlc3VsdCBvZiB0aGUgbXVsdGlwbGljYXRpb24gaXM6IFwiICsgci50b1N0cmluZygpKTtcbiAgICAgKi9cbiAgICBtdWwyKGxocywgcmhzKSB7XG4gICAgICAgIGNvbnN0IGEgPSBsaHMuZGF0YTtcbiAgICAgICAgY29uc3QgYiA9IHJocy5kYXRhO1xuICAgICAgICBjb25zdCByID0gdGhpcy5kYXRhO1xuXG4gICAgICAgIGNvbnN0IGEwMCA9IGFbMF07XG4gICAgICAgIGNvbnN0IGEwMSA9IGFbMV07XG4gICAgICAgIGNvbnN0IGEwMiA9IGFbMl07XG4gICAgICAgIGNvbnN0IGEwMyA9IGFbM107XG4gICAgICAgIGNvbnN0IGExMCA9IGFbNF07XG4gICAgICAgIGNvbnN0IGExMSA9IGFbNV07XG4gICAgICAgIGNvbnN0IGExMiA9IGFbNl07XG4gICAgICAgIGNvbnN0IGExMyA9IGFbN107XG4gICAgICAgIGNvbnN0IGEyMCA9IGFbOF07XG4gICAgICAgIGNvbnN0IGEyMSA9IGFbOV07XG4gICAgICAgIGNvbnN0IGEyMiA9IGFbMTBdO1xuICAgICAgICBjb25zdCBhMjMgPSBhWzExXTtcbiAgICAgICAgY29uc3QgYTMwID0gYVsxMl07XG4gICAgICAgIGNvbnN0IGEzMSA9IGFbMTNdO1xuICAgICAgICBjb25zdCBhMzIgPSBhWzE0XTtcbiAgICAgICAgY29uc3QgYTMzID0gYVsxNV07XG5cbiAgICAgICAgbGV0IGIwLCBiMSwgYjIsIGIzO1xuXG4gICAgICAgIGIwID0gYlswXTtcbiAgICAgICAgYjEgPSBiWzFdO1xuICAgICAgICBiMiA9IGJbMl07XG4gICAgICAgIGIzID0gYlszXTtcbiAgICAgICAgclswXSAgPSBhMDAgKiBiMCArIGExMCAqIGIxICsgYTIwICogYjIgKyBhMzAgKiBiMztcbiAgICAgICAgclsxXSAgPSBhMDEgKiBiMCArIGExMSAqIGIxICsgYTIxICogYjIgKyBhMzEgKiBiMztcbiAgICAgICAgclsyXSAgPSBhMDIgKiBiMCArIGExMiAqIGIxICsgYTIyICogYjIgKyBhMzIgKiBiMztcbiAgICAgICAgclszXSAgPSBhMDMgKiBiMCArIGExMyAqIGIxICsgYTIzICogYjIgKyBhMzMgKiBiMztcblxuICAgICAgICBiMCA9IGJbNF07XG4gICAgICAgIGIxID0gYls1XTtcbiAgICAgICAgYjIgPSBiWzZdO1xuICAgICAgICBiMyA9IGJbN107XG4gICAgICAgIHJbNF0gID0gYTAwICogYjAgKyBhMTAgKiBiMSArIGEyMCAqIGIyICsgYTMwICogYjM7XG4gICAgICAgIHJbNV0gID0gYTAxICogYjAgKyBhMTEgKiBiMSArIGEyMSAqIGIyICsgYTMxICogYjM7XG4gICAgICAgIHJbNl0gID0gYTAyICogYjAgKyBhMTIgKiBiMSArIGEyMiAqIGIyICsgYTMyICogYjM7XG4gICAgICAgIHJbN10gID0gYTAzICogYjAgKyBhMTMgKiBiMSArIGEyMyAqIGIyICsgYTMzICogYjM7XG5cbiAgICAgICAgYjAgPSBiWzhdO1xuICAgICAgICBiMSA9IGJbOV07XG4gICAgICAgIGIyID0gYlsxMF07XG4gICAgICAgIGIzID0gYlsxMV07XG4gICAgICAgIHJbOF0gID0gYTAwICogYjAgKyBhMTAgKiBiMSArIGEyMCAqIGIyICsgYTMwICogYjM7XG4gICAgICAgIHJbOV0gID0gYTAxICogYjAgKyBhMTEgKiBiMSArIGEyMSAqIGIyICsgYTMxICogYjM7XG4gICAgICAgIHJbMTBdID0gYTAyICogYjAgKyBhMTIgKiBiMSArIGEyMiAqIGIyICsgYTMyICogYjM7XG4gICAgICAgIHJbMTFdID0gYTAzICogYjAgKyBhMTMgKiBiMSArIGEyMyAqIGIyICsgYTMzICogYjM7XG5cbiAgICAgICAgYjAgPSBiWzEyXTtcbiAgICAgICAgYjEgPSBiWzEzXTtcbiAgICAgICAgYjIgPSBiWzE0XTtcbiAgICAgICAgYjMgPSBiWzE1XTtcbiAgICAgICAgclsxMl0gPSBhMDAgKiBiMCArIGExMCAqIGIxICsgYTIwICogYjIgKyBhMzAgKiBiMztcbiAgICAgICAgclsxM10gPSBhMDEgKiBiMCArIGExMSAqIGIxICsgYTIxICogYjIgKyBhMzEgKiBiMztcbiAgICAgICAgclsxNF0gPSBhMDIgKiBiMCArIGExMiAqIGIxICsgYTIyICogYjIgKyBhMzIgKiBiMztcbiAgICAgICAgclsxNV0gPSBhMDMgKiBiMCArIGExMyAqIGIxICsgYTIzICogYjIgKyBhMzMgKiBiMztcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNdWx0aXBsaWVzIHRoZSBzcGVjaWZpZWQgNHg0IG1hdHJpY2VzIHRvZ2V0aGVyIGFuZCBzdG9yZXMgdGhlIHJlc3VsdCBpbiB0aGUgY3VycmVudFxuICAgICAqIGluc3RhbmNlLiBUaGlzIGZ1bmN0aW9uIGFzc3VtZXMgdGhlIG1hdHJpY2VzIGFyZSBhZmZpbmUgdHJhbnNmb3JtYXRpb24gbWF0cmljZXMsIHdoZXJlIHRoZVxuICAgICAqIHVwcGVyIGxlZnQgM3gzIGVsZW1lbnRzIGFyZSBhIHJvdGF0aW9uIG1hdHJpeCwgYW5kIHRoZSBib3R0b20gbGVmdCAzIGVsZW1lbnRzIGFyZVxuICAgICAqIHRyYW5zbGF0aW9uLiBUaGUgcmlnaHRtb3N0IGNvbHVtbiBpcyBhc3N1bWVkIHRvIGJlIFswLCAwLCAwLCAxXS4gVGhlIHBhcmFtZXRlcnMgYXJlIG5vdFxuICAgICAqIHZlcmlmaWVkIHRvIGJlIGluIHRoZSBleHBlY3RlZCBmb3JtYXQuIFRoaXMgZnVuY3Rpb24gaXMgZmFzdGVyIHRoYW4gZ2VuZXJhbFxuICAgICAqIHtAbGluayBNYXQ0I211bDJ9LlxuICAgICAqXG4gICAgICogQHBhcmFtIHtNYXQ0fSBsaHMgLSBUaGUgYWZmaW5lIHRyYW5zZm9ybWF0aW9uIDR4NCBtYXRyaXggdXNlZCBhcyB0aGUgZmlyc3QgbXVsdGlwbGljYW5kIG9mXG4gICAgICogdGhlIG9wZXJhdGlvbi5cbiAgICAgKiBAcGFyYW0ge01hdDR9IHJocyAtIFRoZSBhZmZpbmUgdHJhbnNmb3JtYXRpb24gNHg0IG1hdHJpeCB1c2VkIGFzIHRoZSBzZWNvbmQgbXVsdGlwbGljYW5kIG9mXG4gICAgICogdGhlIG9wZXJhdGlvbi5cbiAgICAgKiBAcmV0dXJucyB7TWF0NH0gU2VsZiBmb3IgY2hhaW5pbmcuXG4gICAgICovXG4gICAgbXVsQWZmaW5lMihsaHMsIHJocykge1xuICAgICAgICBjb25zdCBhID0gbGhzLmRhdGE7XG4gICAgICAgIGNvbnN0IGIgPSByaHMuZGF0YTtcbiAgICAgICAgY29uc3QgciA9IHRoaXMuZGF0YTtcblxuICAgICAgICBjb25zdCBhMDAgPSBhWzBdO1xuICAgICAgICBjb25zdCBhMDEgPSBhWzFdO1xuICAgICAgICBjb25zdCBhMDIgPSBhWzJdO1xuICAgICAgICBjb25zdCBhMTAgPSBhWzRdO1xuICAgICAgICBjb25zdCBhMTEgPSBhWzVdO1xuICAgICAgICBjb25zdCBhMTIgPSBhWzZdO1xuICAgICAgICBjb25zdCBhMjAgPSBhWzhdO1xuICAgICAgICBjb25zdCBhMjEgPSBhWzldO1xuICAgICAgICBjb25zdCBhMjIgPSBhWzEwXTtcbiAgICAgICAgY29uc3QgYTMwID0gYVsxMl07XG4gICAgICAgIGNvbnN0IGEzMSA9IGFbMTNdO1xuICAgICAgICBjb25zdCBhMzIgPSBhWzE0XTtcblxuICAgICAgICBsZXQgYjAsIGIxLCBiMjtcblxuICAgICAgICBiMCA9IGJbMF07XG4gICAgICAgIGIxID0gYlsxXTtcbiAgICAgICAgYjIgPSBiWzJdO1xuICAgICAgICByWzBdICA9IGEwMCAqIGIwICsgYTEwICogYjEgKyBhMjAgKiBiMjtcbiAgICAgICAgclsxXSAgPSBhMDEgKiBiMCArIGExMSAqIGIxICsgYTIxICogYjI7XG4gICAgICAgIHJbMl0gID0gYTAyICogYjAgKyBhMTIgKiBiMSArIGEyMiAqIGIyO1xuICAgICAgICByWzNdID0gMDtcblxuICAgICAgICBiMCA9IGJbNF07XG4gICAgICAgIGIxID0gYls1XTtcbiAgICAgICAgYjIgPSBiWzZdO1xuICAgICAgICByWzRdICA9IGEwMCAqIGIwICsgYTEwICogYjEgKyBhMjAgKiBiMjtcbiAgICAgICAgcls1XSAgPSBhMDEgKiBiMCArIGExMSAqIGIxICsgYTIxICogYjI7XG4gICAgICAgIHJbNl0gID0gYTAyICogYjAgKyBhMTIgKiBiMSArIGEyMiAqIGIyO1xuICAgICAgICByWzddID0gMDtcblxuICAgICAgICBiMCA9IGJbOF07XG4gICAgICAgIGIxID0gYls5XTtcbiAgICAgICAgYjIgPSBiWzEwXTtcbiAgICAgICAgcls4XSAgPSBhMDAgKiBiMCArIGExMCAqIGIxICsgYTIwICogYjI7XG4gICAgICAgIHJbOV0gID0gYTAxICogYjAgKyBhMTEgKiBiMSArIGEyMSAqIGIyO1xuICAgICAgICByWzEwXSA9IGEwMiAqIGIwICsgYTEyICogYjEgKyBhMjIgKiBiMjtcbiAgICAgICAgclsxMV0gPSAwO1xuXG4gICAgICAgIGIwID0gYlsxMl07XG4gICAgICAgIGIxID0gYlsxM107XG4gICAgICAgIGIyID0gYlsxNF07XG4gICAgICAgIHJbMTJdID0gYTAwICogYjAgKyBhMTAgKiBiMSArIGEyMCAqIGIyICsgYTMwO1xuICAgICAgICByWzEzXSA9IGEwMSAqIGIwICsgYTExICogYjEgKyBhMjEgKiBiMiArIGEzMTtcbiAgICAgICAgclsxNF0gPSBhMDIgKiBiMCArIGExMiAqIGIxICsgYTIyICogYjIgKyBhMzI7XG4gICAgICAgIHJbMTVdID0gMTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNdWx0aXBsaWVzIHRoZSBjdXJyZW50IGluc3RhbmNlIGJ5IHRoZSBzcGVjaWZpZWQgNHg0IG1hdHJpeC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7TWF0NH0gcmhzIC0gVGhlIDR4NCBtYXRyaXggdXNlZCBhcyB0aGUgc2Vjb25kIG11bHRpcGxpY2FuZCBvZiB0aGUgb3BlcmF0aW9uLlxuICAgICAqIEByZXR1cm5zIHtNYXQ0fSBTZWxmIGZvciBjaGFpbmluZy5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGNvbnN0IGEgPSBuZXcgcGMuTWF0NCgpLnNldEZyb21FdWxlckFuZ2xlcygxMCwgMjAsIDMwKTtcbiAgICAgKiBjb25zdCBiID0gbmV3IHBjLk1hdDQoKS5zZXRGcm9tQXhpc0FuZ2xlKHBjLlZlYzMuVVAsIDE4MCk7XG4gICAgICpcbiAgICAgKiAvLyBhID0gYSAqIGJcbiAgICAgKiBhLm11bChiKTtcbiAgICAgKlxuICAgICAqIGNvbnNvbGUubG9nKFwiVGhlIHJlc3VsdCBvZiB0aGUgbXVsdGlwbGljYXRpb24gaXM6IFwiICsgYS50b1N0cmluZygpKTtcbiAgICAgKi9cbiAgICBtdWwocmhzKSB7XG4gICAgICAgIHJldHVybiB0aGlzLm11bDIodGhpcywgcmhzKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUcmFuc2Zvcm1zIGEgMy1kaW1lbnNpb25hbCBwb2ludCBieSBhIDR4NCBtYXRyaXguXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1ZlYzN9IHZlYyAtIFRoZSAzLWRpbWVuc2lvbmFsIHBvaW50IHRvIGJlIHRyYW5zZm9ybWVkLlxuICAgICAqIEBwYXJhbSB7VmVjM30gW3Jlc10gLSBBbiBvcHRpb25hbCAzLWRpbWVuc2lvbmFsIHBvaW50IHRvIHJlY2VpdmUgdGhlIHJlc3VsdCBvZiB0aGVcbiAgICAgKiB0cmFuc2Zvcm1hdGlvbi5cbiAgICAgKiBAcmV0dXJucyB7VmVjM30gVGhlIGlucHV0IHBvaW50IHYgdHJhbnNmb3JtZWQgYnkgdGhlIGN1cnJlbnQgaW5zdGFuY2UuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiAvLyBDcmVhdGUgYSAzLWRpbWVuc2lvbmFsIHBvaW50XG4gICAgICogY29uc3QgdiA9IG5ldyBwYy5WZWMzKDEsIDIsIDMpO1xuICAgICAqXG4gICAgICogLy8gQ3JlYXRlIGEgNHg0IHJvdGF0aW9uIG1hdHJpeFxuICAgICAqIGNvbnN0IG0gPSBuZXcgcGMuTWF0NCgpLnNldEZyb21FdWxlckFuZ2xlcygxMCwgMjAsIDMwKTtcbiAgICAgKlxuICAgICAqIGNvbnN0IHR2ID0gbS50cmFuc2Zvcm1Qb2ludCh2KTtcbiAgICAgKi9cbiAgICB0cmFuc2Zvcm1Qb2ludCh2ZWMsIHJlcyA9IG5ldyBWZWMzKCkpIHtcbiAgICAgICAgY29uc3QgbSA9IHRoaXMuZGF0YTtcblxuICAgICAgICBjb25zdCB4ID0gdmVjLng7XG4gICAgICAgIGNvbnN0IHkgPSB2ZWMueTtcbiAgICAgICAgY29uc3QgeiA9IHZlYy56O1xuXG4gICAgICAgIHJlcy54ID0geCAqIG1bMF0gKyB5ICogbVs0XSArIHogKiBtWzhdICsgbVsxMl07XG4gICAgICAgIHJlcy55ID0geCAqIG1bMV0gKyB5ICogbVs1XSArIHogKiBtWzldICsgbVsxM107XG4gICAgICAgIHJlcy56ID0geCAqIG1bMl0gKyB5ICogbVs2XSArIHogKiBtWzEwXSArIG1bMTRdO1xuXG4gICAgICAgIHJldHVybiByZXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVHJhbnNmb3JtcyBhIDMtZGltZW5zaW9uYWwgdmVjdG9yIGJ5IGEgNHg0IG1hdHJpeC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7VmVjM30gdmVjIC0gVGhlIDMtZGltZW5zaW9uYWwgdmVjdG9yIHRvIGJlIHRyYW5zZm9ybWVkLlxuICAgICAqIEBwYXJhbSB7VmVjM30gW3Jlc10gLSBBbiBvcHRpb25hbCAzLWRpbWVuc2lvbmFsIHZlY3RvciB0byByZWNlaXZlIHRoZSByZXN1bHQgb2YgdGhlXG4gICAgICogdHJhbnNmb3JtYXRpb24uXG4gICAgICogQHJldHVybnMge1ZlYzN9IFRoZSBpbnB1dCB2ZWN0b3IgdiB0cmFuc2Zvcm1lZCBieSB0aGUgY3VycmVudCBpbnN0YW5jZS5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIC8vIENyZWF0ZSBhIDMtZGltZW5zaW9uYWwgdmVjdG9yXG4gICAgICogY29uc3QgdiA9IG5ldyBwYy5WZWMzKDEsIDIsIDMpO1xuICAgICAqXG4gICAgICogLy8gQ3JlYXRlIGEgNHg0IHJvdGF0aW9uIG1hdHJpeFxuICAgICAqIGNvbnN0IG0gPSBuZXcgcGMuTWF0NCgpLnNldEZyb21FdWxlckFuZ2xlcygxMCwgMjAsIDMwKTtcbiAgICAgKlxuICAgICAqIGNvbnN0IHR2ID0gbS50cmFuc2Zvcm1WZWN0b3Iodik7XG4gICAgICovXG4gICAgdHJhbnNmb3JtVmVjdG9yKHZlYywgcmVzID0gbmV3IFZlYzMoKSkge1xuICAgICAgICBjb25zdCBtID0gdGhpcy5kYXRhO1xuXG4gICAgICAgIGNvbnN0IHggPSB2ZWMueDtcbiAgICAgICAgY29uc3QgeSA9IHZlYy55O1xuICAgICAgICBjb25zdCB6ID0gdmVjLno7XG5cbiAgICAgICAgcmVzLnggPSB4ICogbVswXSArIHkgKiBtWzRdICsgeiAqIG1bOF07XG4gICAgICAgIHJlcy55ID0geCAqIG1bMV0gKyB5ICogbVs1XSArIHogKiBtWzldO1xuICAgICAgICByZXMueiA9IHggKiBtWzJdICsgeSAqIG1bNl0gKyB6ICogbVsxMF07XG5cbiAgICAgICAgcmV0dXJuIHJlcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUcmFuc2Zvcm1zIGEgNC1kaW1lbnNpb25hbCB2ZWN0b3IgYnkgYSA0eDQgbWF0cml4LlxuICAgICAqXG4gICAgICogQHBhcmFtIHtWZWM0fSB2ZWMgLSBUaGUgNC1kaW1lbnNpb25hbCB2ZWN0b3IgdG8gYmUgdHJhbnNmb3JtZWQuXG4gICAgICogQHBhcmFtIHtWZWM0fSBbcmVzXSAtIEFuIG9wdGlvbmFsIDQtZGltZW5zaW9uYWwgdmVjdG9yIHRvIHJlY2VpdmUgdGhlIHJlc3VsdCBvZiB0aGVcbiAgICAgKiB0cmFuc2Zvcm1hdGlvbi5cbiAgICAgKiBAcmV0dXJucyB7VmVjNH0gVGhlIGlucHV0IHZlY3RvciB2IHRyYW5zZm9ybWVkIGJ5IHRoZSBjdXJyZW50IGluc3RhbmNlLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogLy8gQ3JlYXRlIGFuIGlucHV0IDQtZGltZW5zaW9uYWwgdmVjdG9yXG4gICAgICogY29uc3QgdiA9IG5ldyBwYy5WZWM0KDEsIDIsIDMsIDQpO1xuICAgICAqXG4gICAgICogLy8gQ3JlYXRlIGFuIG91dHB1dCA0LWRpbWVuc2lvbmFsIHZlY3RvclxuICAgICAqIGNvbnN0IHJlc3VsdCA9IG5ldyBwYy5WZWM0KCk7XG4gICAgICpcbiAgICAgKiAvLyBDcmVhdGUgYSA0eDQgcm90YXRpb24gbWF0cml4XG4gICAgICogY29uc3QgbSA9IG5ldyBwYy5NYXQ0KCkuc2V0RnJvbUV1bGVyQW5nbGVzKDEwLCAyMCwgMzApO1xuICAgICAqXG4gICAgICogbS50cmFuc2Zvcm1WZWM0KHYsIHJlc3VsdCk7XG4gICAgICovXG4gICAgdHJhbnNmb3JtVmVjNCh2ZWMsIHJlcyA9IG5ldyBWZWM0KCkpIHtcbiAgICAgICAgY29uc3QgbSA9IHRoaXMuZGF0YTtcblxuICAgICAgICBjb25zdCB4ID0gdmVjLng7XG4gICAgICAgIGNvbnN0IHkgPSB2ZWMueTtcbiAgICAgICAgY29uc3QgeiA9IHZlYy56O1xuICAgICAgICBjb25zdCB3ID0gdmVjLnc7XG5cbiAgICAgICAgcmVzLnggPSB4ICogbVswXSArIHkgKiBtWzRdICsgeiAqIG1bOF0gKyB3ICogbVsxMl07XG4gICAgICAgIHJlcy55ID0geCAqIG1bMV0gKyB5ICogbVs1XSArIHogKiBtWzldICsgdyAqIG1bMTNdO1xuICAgICAgICByZXMueiA9IHggKiBtWzJdICsgeSAqIG1bNl0gKyB6ICogbVsxMF0gKyB3ICogbVsxNF07XG4gICAgICAgIHJlcy53ID0geCAqIG1bM10gKyB5ICogbVs3XSArIHogKiBtWzExXSArIHcgKiBtWzE1XTtcblxuICAgICAgICByZXR1cm4gcmVzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIHNwZWNpZmllZCBtYXRyaXggdG8gYSB2aWV3aW5nIG1hdHJpeCBkZXJpdmVkIGZyb20gYW4gZXllIHBvaW50LCBhIHRhcmdldCBwb2ludCBhbmRcbiAgICAgKiBhbiB1cCB2ZWN0b3IuIFRoZSBtYXRyaXggbWFwcyB0aGUgdGFyZ2V0IHBvaW50IHRvIHRoZSBuZWdhdGl2ZSB6LWF4aXMgYW5kIHRoZSBleWUgcG9pbnQgdG9cbiAgICAgKiB0aGUgb3JpZ2luLCBzbyB0aGF0IHdoZW4geW91IHVzZSBhIHR5cGljYWwgcHJvamVjdGlvbiBtYXRyaXgsIHRoZSBjZW50ZXIgb2YgdGhlIHNjZW5lIG1hcHNcbiAgICAgKiB0byB0aGUgY2VudGVyIG9mIHRoZSB2aWV3cG9ydC4gU2ltaWxhcmx5LCB0aGUgZGlyZWN0aW9uIGRlc2NyaWJlZCBieSB0aGUgdXAgdmVjdG9yIHByb2plY3RlZFxuICAgICAqIG9udG8gdGhlIHZpZXdpbmcgcGxhbmUgaXMgbWFwcGVkIHRvIHRoZSBwb3NpdGl2ZSB5LWF4aXMgc28gdGhhdCBpdCBwb2ludHMgdXB3YXJkIGluIHRoZVxuICAgICAqIHZpZXdwb3J0LiBUaGUgdXAgdmVjdG9yIG11c3Qgbm90IGJlIHBhcmFsbGVsIHRvIHRoZSBsaW5lIG9mIHNpZ2h0IGZyb20gdGhlIGV5ZSB0byB0aGVcbiAgICAgKiByZWZlcmVuY2UgcG9pbnQuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1ZlYzN9IHBvc2l0aW9uIC0gMy1kIHZlY3RvciBob2xkaW5nIHZpZXcgcG9zaXRpb24uXG4gICAgICogQHBhcmFtIHtWZWMzfSB0YXJnZXQgLSAzLWQgdmVjdG9yIGhvbGRpbmcgcmVmZXJlbmNlIHBvaW50LlxuICAgICAqIEBwYXJhbSB7VmVjM30gdXAgLSAzLWQgdmVjdG9yIGhvbGRpbmcgdGhlIHVwIGRpcmVjdGlvbi5cbiAgICAgKiBAcmV0dXJucyB7TWF0NH0gU2VsZiBmb3IgY2hhaW5pbmcuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBjb25zdCBwb3NpdGlvbiA9IG5ldyBwYy5WZWMzKDEwLCAxMCwgMTApO1xuICAgICAqIGNvbnN0IHRhcmdldCA9IG5ldyBwYy5WZWMzKDAsIDAsIDApO1xuICAgICAqIGNvbnN0IHVwID0gbmV3IHBjLlZlYzMoMCwgMSwgMCk7XG4gICAgICogY29uc3QgbSA9IG5ldyBwYy5NYXQ0KCkuc2V0TG9va0F0KHBvc2l0aW9uLCB0YXJnZXQsIHVwKTtcbiAgICAgKi9cbiAgICBzZXRMb29rQXQocG9zaXRpb24sIHRhcmdldCwgdXApIHtcbiAgICAgICAgei5zdWIyKHBvc2l0aW9uLCB0YXJnZXQpLm5vcm1hbGl6ZSgpO1xuICAgICAgICB5LmNvcHkodXApLm5vcm1hbGl6ZSgpO1xuICAgICAgICB4LmNyb3NzKHksIHopLm5vcm1hbGl6ZSgpO1xuICAgICAgICB5LmNyb3NzKHosIHgpO1xuXG4gICAgICAgIGNvbnN0IHIgPSB0aGlzLmRhdGE7XG5cbiAgICAgICAgclswXSAgPSB4Lng7XG4gICAgICAgIHJbMV0gID0geC55O1xuICAgICAgICByWzJdICA9IHguejtcbiAgICAgICAgclszXSAgPSAwO1xuICAgICAgICByWzRdICA9IHkueDtcbiAgICAgICAgcls1XSAgPSB5Lnk7XG4gICAgICAgIHJbNl0gID0geS56O1xuICAgICAgICByWzddICA9IDA7XG4gICAgICAgIHJbOF0gID0gei54O1xuICAgICAgICByWzldICA9IHoueTtcbiAgICAgICAgclsxMF0gPSB6Lno7XG4gICAgICAgIHJbMTFdID0gMDtcbiAgICAgICAgclsxMl0gPSBwb3NpdGlvbi54O1xuICAgICAgICByWzEzXSA9IHBvc2l0aW9uLnk7XG4gICAgICAgIHJbMTRdID0gcG9zaXRpb24uejtcbiAgICAgICAgclsxNV0gPSAxO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIHNwZWNpZmllZCBtYXRyaXggdG8gYSBwZXJzcGVjdGl2ZSBwcm9qZWN0aW9uIG1hdHJpeC4gVGhlIGZ1bmN0aW9uJ3MgcGFyYW1ldGVyc1xuICAgICAqIGRlZmluZSB0aGUgc2hhcGUgb2YgYSBmcnVzdHVtLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGxlZnQgLSBUaGUgeC1jb29yZGluYXRlIGZvciB0aGUgbGVmdCBlZGdlIG9mIHRoZSBjYW1lcmEncyBwcm9qZWN0aW9uIHBsYW5lXG4gICAgICogaW4gZXllIHNwYWNlLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSByaWdodCAtIFRoZSB4LWNvb3JkaW5hdGUgZm9yIHRoZSByaWdodCBlZGdlIG9mIHRoZSBjYW1lcmEncyBwcm9qZWN0aW9uIHBsYW5lXG4gICAgICogaW4gZXllIHNwYWNlLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBib3R0b20gLSBUaGUgeS1jb29yZGluYXRlIGZvciB0aGUgYm90dG9tIGVkZ2Ugb2YgdGhlIGNhbWVyYSdzIHByb2plY3Rpb25cbiAgICAgKiBwbGFuZSBpbiBleWUgc3BhY2UuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHRvcCAtIFRoZSB5LWNvb3JkaW5hdGUgZm9yIHRoZSB0b3AgZWRnZSBvZiB0aGUgY2FtZXJhJ3MgcHJvamVjdGlvbiBwbGFuZSBpblxuICAgICAqIGV5ZSBzcGFjZS5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gem5lYXIgLSBUaGUgbmVhciBjbGlwIHBsYW5lIGluIGV5ZSBjb29yZGluYXRlcy5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gemZhciAtIFRoZSBmYXIgY2xpcCBwbGFuZSBpbiBleWUgY29vcmRpbmF0ZXMuXG4gICAgICogQHJldHVybnMge01hdDR9IFNlbGYgZm9yIGNoYWluaW5nLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogLy8gQ3JlYXRlIGEgNHg0IHBlcnNwZWN0aXZlIHByb2plY3Rpb24gbWF0cml4XG4gICAgICogY29uc3QgZiA9IHBjLk1hdDQoKS5zZXRGcnVzdHVtKC0yLCAyLCAtMSwgMSwgMSwgMTAwMCk7XG4gICAgICogQGlnbm9yZVxuICAgICAqL1xuICAgIHNldEZydXN0dW0obGVmdCwgcmlnaHQsIGJvdHRvbSwgdG9wLCB6bmVhciwgemZhcikge1xuICAgICAgICBjb25zdCB0ZW1wMSA9IDIgKiB6bmVhcjtcbiAgICAgICAgY29uc3QgdGVtcDIgPSByaWdodCAtIGxlZnQ7XG4gICAgICAgIGNvbnN0IHRlbXAzID0gdG9wIC0gYm90dG9tO1xuICAgICAgICBjb25zdCB0ZW1wNCA9IHpmYXIgLSB6bmVhcjtcblxuICAgICAgICBjb25zdCByID0gdGhpcy5kYXRhO1xuICAgICAgICByWzBdID0gdGVtcDEgLyB0ZW1wMjtcbiAgICAgICAgclsxXSA9IDA7XG4gICAgICAgIHJbMl0gPSAwO1xuICAgICAgICByWzNdID0gMDtcbiAgICAgICAgcls0XSA9IDA7XG4gICAgICAgIHJbNV0gPSB0ZW1wMSAvIHRlbXAzO1xuICAgICAgICByWzZdID0gMDtcbiAgICAgICAgcls3XSA9IDA7XG4gICAgICAgIHJbOF0gPSAocmlnaHQgKyBsZWZ0KSAvIHRlbXAyO1xuICAgICAgICByWzldID0gKHRvcCArIGJvdHRvbSkgLyB0ZW1wMztcbiAgICAgICAgclsxMF0gPSAoLXpmYXIgLSB6bmVhcikgLyB0ZW1wNDtcbiAgICAgICAgclsxMV0gPSAtMTtcbiAgICAgICAgclsxMl0gPSAwO1xuICAgICAgICByWzEzXSA9IDA7XG4gICAgICAgIHJbMTRdID0gKC10ZW1wMSAqIHpmYXIpIC8gdGVtcDQ7XG4gICAgICAgIHJbMTVdID0gMDtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHRoZSBzcGVjaWZpZWQgbWF0cml4IHRvIGEgcGVyc3BlY3RpdmUgcHJvamVjdGlvbiBtYXRyaXguIFRoZSBmdW5jdGlvbidzIHBhcmFtZXRlcnNcbiAgICAgKiBkZWZpbmUgdGhlIHNoYXBlIG9mIGEgZnJ1c3R1bS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBmb3YgLSBUaGUgZnJ1c3R1bSdzIGZpZWxkIG9mIHZpZXcgaW4gZGVncmVlcy4gVGhlIGZvdklzSG9yaXpvbnRhbCBwYXJhbWV0ZXJcbiAgICAgKiBjb250cm9scyB3aGV0aGVyIHRoaXMgaXMgYSB2ZXJ0aWNhbCBvciBob3Jpem9udGFsIGZpZWxkIG9mIHZpZXcuIEJ5IGRlZmF1bHQsIGl0J3MgYSB2ZXJ0aWNhbFxuICAgICAqIGZpZWxkIG9mIHZpZXcuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGFzcGVjdCAtIFRoZSBhc3BlY3QgcmF0aW8gb2YgdGhlIGZydXN0dW0ncyBwcm9qZWN0aW9uIHBsYW5lXG4gICAgICogKHdpZHRoIC8gaGVpZ2h0KS5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gem5lYXIgLSBUaGUgbmVhciBjbGlwIHBsYW5lIGluIGV5ZSBjb29yZGluYXRlcy5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gemZhciAtIFRoZSBmYXIgY2xpcCBwbGFuZSBpbiBleWUgY29vcmRpbmF0ZXMuXG4gICAgICogQHBhcmFtIHtib29sZWFufSBbZm92SXNIb3Jpem9udGFsXSAtIFNldCB0byB0cnVlIHRvIHRyZWF0IHRoZSBmb3YgYXMgaG9yaXpvbnRhbCAoeC1heGlzKSBhbmRcbiAgICAgKiBmYWxzZSBmb3IgdmVydGljYWwgKHktYXhpcykuIERlZmF1bHRzIHRvIGZhbHNlLlxuICAgICAqIEByZXR1cm5zIHtNYXQ0fSBTZWxmIGZvciBjaGFpbmluZy5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIC8vIENyZWF0ZSBhIDR4NCBwZXJzcGVjdGl2ZSBwcm9qZWN0aW9uIG1hdHJpeFxuICAgICAqIGNvbnN0IHBlcnNwID0gcGMuTWF0NCgpLnNldFBlcnNwZWN0aXZlKDQ1LCAxNiAvIDksIDEsIDEwMDApO1xuICAgICAqL1xuICAgIHNldFBlcnNwZWN0aXZlKGZvdiwgYXNwZWN0LCB6bmVhciwgemZhciwgZm92SXNIb3Jpem9udGFsKSB7XG4gICAgICAgIE1hdDQuX2dldFBlcnNwZWN0aXZlSGFsZlNpemUoX2hhbGZTaXplLCBmb3YsIGFzcGVjdCwgem5lYXIsIGZvdklzSG9yaXpvbnRhbCk7XG4gICAgICAgIHJldHVybiB0aGlzLnNldEZydXN0dW0oLV9oYWxmU2l6ZS54LCBfaGFsZlNpemUueCwgLV9oYWxmU2l6ZS55LCBfaGFsZlNpemUueSwgem5lYXIsIHpmYXIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIHNwZWNpZmllZCBtYXRyaXggdG8gYW4gb3J0aG9ncmFwaGljIHByb2plY3Rpb24gbWF0cml4LiBUaGUgZnVuY3Rpb24ncyBwYXJhbWV0ZXJzXG4gICAgICogZGVmaW5lIHRoZSBzaGFwZSBvZiBhIGN1Ym9pZC1zaGFwZWQgZnJ1c3R1bS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBsZWZ0IC0gVGhlIHgtY29vcmRpbmF0ZSBmb3IgdGhlIGxlZnQgZWRnZSBvZiB0aGUgY2FtZXJhJ3MgcHJvamVjdGlvbiBwbGFuZVxuICAgICAqIGluIGV5ZSBzcGFjZS5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gcmlnaHQgLSBUaGUgeC1jb29yZGluYXRlIGZvciB0aGUgcmlnaHQgZWRnZSBvZiB0aGUgY2FtZXJhJ3MgcHJvamVjdGlvbiBwbGFuZVxuICAgICAqIGluIGV5ZSBzcGFjZS5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gYm90dG9tIC0gVGhlIHktY29vcmRpbmF0ZSBmb3IgdGhlIGJvdHRvbSBlZGdlIG9mIHRoZSBjYW1lcmEncyBwcm9qZWN0aW9uXG4gICAgICogcGxhbmUgaW4gZXllIHNwYWNlLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSB0b3AgLSBUaGUgeS1jb29yZGluYXRlIGZvciB0aGUgdG9wIGVkZ2Ugb2YgdGhlIGNhbWVyYSdzIHByb2plY3Rpb24gcGxhbmUgaW5cbiAgICAgKiBleWUgc3BhY2UuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IG5lYXIgLSBUaGUgbmVhciBjbGlwIHBsYW5lIGluIGV5ZSBjb29yZGluYXRlcy5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gZmFyIC0gVGhlIGZhciBjbGlwIHBsYW5lIGluIGV5ZSBjb29yZGluYXRlcy5cbiAgICAgKiBAcmV0dXJucyB7TWF0NH0gU2VsZiBmb3IgY2hhaW5pbmcuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiAvLyBDcmVhdGUgYSA0eDQgb3J0aG9ncmFwaGljIHByb2plY3Rpb24gbWF0cml4XG4gICAgICogY29uc3Qgb3J0aG8gPSBwYy5NYXQ0KCkub3J0aG8oLTIsIDIsIC0yLCAyLCAxLCAxMDAwKTtcbiAgICAgKi9cbiAgICBzZXRPcnRobyhsZWZ0LCByaWdodCwgYm90dG9tLCB0b3AsIG5lYXIsIGZhcikge1xuICAgICAgICBjb25zdCByID0gdGhpcy5kYXRhO1xuXG4gICAgICAgIHJbMF0gPSAyIC8gKHJpZ2h0IC0gbGVmdCk7XG4gICAgICAgIHJbMV0gPSAwO1xuICAgICAgICByWzJdID0gMDtcbiAgICAgICAgclszXSA9IDA7XG4gICAgICAgIHJbNF0gPSAwO1xuICAgICAgICByWzVdID0gMiAvICh0b3AgLSBib3R0b20pO1xuICAgICAgICByWzZdID0gMDtcbiAgICAgICAgcls3XSA9IDA7XG4gICAgICAgIHJbOF0gPSAwO1xuICAgICAgICByWzldID0gMDtcbiAgICAgICAgclsxMF0gPSAtMiAvIChmYXIgLSBuZWFyKTtcbiAgICAgICAgclsxMV0gPSAwO1xuICAgICAgICByWzEyXSA9IC0ocmlnaHQgKyBsZWZ0KSAvIChyaWdodCAtIGxlZnQpO1xuICAgICAgICByWzEzXSA9IC0odG9wICsgYm90dG9tKSAvICh0b3AgLSBib3R0b20pO1xuICAgICAgICByWzE0XSA9IC0oZmFyICsgbmVhcikgLyAoZmFyIC0gbmVhcik7XG4gICAgICAgIHJbMTVdID0gMTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHRoZSBzcGVjaWZpZWQgbWF0cml4IHRvIGEgcm90YXRpb24gbWF0cml4IGVxdWl2YWxlbnQgdG8gYSByb3RhdGlvbiBhcm91bmQgYW4gYXhpcy4gVGhlXG4gICAgICogYXhpcyBtdXN0IGJlIG5vcm1hbGl6ZWQgKHVuaXQgbGVuZ3RoKSBhbmQgdGhlIGFuZ2xlIG11c3QgYmUgc3BlY2lmaWVkIGluIGRlZ3JlZXMuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1ZlYzN9IGF4aXMgLSBUaGUgbm9ybWFsaXplZCBheGlzIHZlY3RvciBhcm91bmQgd2hpY2ggdG8gcm90YXRlLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBhbmdsZSAtIFRoZSBhbmdsZSBvZiByb3RhdGlvbiBpbiBkZWdyZWVzLlxuICAgICAqIEByZXR1cm5zIHtNYXQ0fSBTZWxmIGZvciBjaGFpbmluZy5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIC8vIENyZWF0ZSBhIDR4NCByb3RhdGlvbiBtYXRyaXhcbiAgICAgKiBjb25zdCBybSA9IG5ldyBwYy5NYXQ0KCkuc2V0RnJvbUF4aXNBbmdsZShwYy5WZWMzLlVQLCA5MCk7XG4gICAgICovXG4gICAgc2V0RnJvbUF4aXNBbmdsZShheGlzLCBhbmdsZSkge1xuICAgICAgICBhbmdsZSAqPSBtYXRoLkRFR19UT19SQUQ7XG5cbiAgICAgICAgY29uc3QgeCA9IGF4aXMueDtcbiAgICAgICAgY29uc3QgeSA9IGF4aXMueTtcbiAgICAgICAgY29uc3QgeiA9IGF4aXMuejtcbiAgICAgICAgY29uc3QgYyA9IE1hdGguY29zKGFuZ2xlKTtcbiAgICAgICAgY29uc3QgcyA9IE1hdGguc2luKGFuZ2xlKTtcbiAgICAgICAgY29uc3QgdCA9IDEgLSBjO1xuICAgICAgICBjb25zdCB0eCA9IHQgKiB4O1xuICAgICAgICBjb25zdCB0eSA9IHQgKiB5O1xuICAgICAgICBjb25zdCBtID0gdGhpcy5kYXRhO1xuXG4gICAgICAgIG1bMF0gPSB0eCAqIHggKyBjO1xuICAgICAgICBtWzFdID0gdHggKiB5ICsgcyAqIHo7XG4gICAgICAgIG1bMl0gPSB0eCAqIHogLSBzICogeTtcbiAgICAgICAgbVszXSA9IDA7XG4gICAgICAgIG1bNF0gPSB0eCAqIHkgLSBzICogejtcbiAgICAgICAgbVs1XSA9IHR5ICogeSArIGM7XG4gICAgICAgIG1bNl0gPSB0eSAqIHogKyBzICogeDtcbiAgICAgICAgbVs3XSA9IDA7XG4gICAgICAgIG1bOF0gPSB0eCAqIHogKyBzICogeTtcbiAgICAgICAgbVs5XSA9IHR5ICogeiAtIHggKiBzO1xuICAgICAgICBtWzEwXSA9IHQgKiB6ICogeiArIGM7XG4gICAgICAgIG1bMTFdID0gMDtcbiAgICAgICAgbVsxMl0gPSAwO1xuICAgICAgICBtWzEzXSA9IDA7XG4gICAgICAgIG1bMTRdID0gMDtcbiAgICAgICAgbVsxNV0gPSAxO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIHNwZWNpZmllZCBtYXRyaXggdG8gYSB0cmFuc2xhdGlvbiBtYXRyaXguXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge251bWJlcn0geCAtIFRoZSB4LWNvbXBvbmVudCBvZiB0aGUgdHJhbnNsYXRpb24uXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHkgLSBUaGUgeS1jb21wb25lbnQgb2YgdGhlIHRyYW5zbGF0aW9uLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSB6IC0gVGhlIHotY29tcG9uZW50IG9mIHRoZSB0cmFuc2xhdGlvbi5cbiAgICAgKiBAcmV0dXJucyB7TWF0NH0gU2VsZiBmb3IgY2hhaW5pbmcuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiAvLyBDcmVhdGUgYSA0eDQgdHJhbnNsYXRpb24gbWF0cml4XG4gICAgICogY29uc3QgdG0gPSBuZXcgcGMuTWF0NCgpLnNldFRyYW5zbGF0ZSgxMCwgMTAsIDEwKTtcbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgc2V0VHJhbnNsYXRlKHgsIHksIHopIHtcbiAgICAgICAgY29uc3QgbSA9IHRoaXMuZGF0YTtcblxuICAgICAgICBtWzBdID0gMTtcbiAgICAgICAgbVsxXSA9IDA7XG4gICAgICAgIG1bMl0gPSAwO1xuICAgICAgICBtWzNdID0gMDtcbiAgICAgICAgbVs0XSA9IDA7XG4gICAgICAgIG1bNV0gPSAxO1xuICAgICAgICBtWzZdID0gMDtcbiAgICAgICAgbVs3XSA9IDA7XG4gICAgICAgIG1bOF0gPSAwO1xuICAgICAgICBtWzldID0gMDtcbiAgICAgICAgbVsxMF0gPSAxO1xuICAgICAgICBtWzExXSA9IDA7XG4gICAgICAgIG1bMTJdID0geDtcbiAgICAgICAgbVsxM10gPSB5O1xuICAgICAgICBtWzE0XSA9IHo7XG4gICAgICAgIG1bMTVdID0gMTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHRoZSBzcGVjaWZpZWQgbWF0cml4IHRvIGEgc2NhbGUgbWF0cml4LlxuICAgICAqXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHggLSBUaGUgeC1jb21wb25lbnQgb2YgdGhlIHNjYWxlLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSB5IC0gVGhlIHktY29tcG9uZW50IG9mIHRoZSBzY2FsZS5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0geiAtIFRoZSB6LWNvbXBvbmVudCBvZiB0aGUgc2NhbGUuXG4gICAgICogQHJldHVybnMge01hdDR9IFNlbGYgZm9yIGNoYWluaW5nLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogLy8gQ3JlYXRlIGEgNHg0IHNjYWxlIG1hdHJpeFxuICAgICAqIGNvbnN0IHNtID0gbmV3IHBjLk1hdDQoKS5zZXRTY2FsZSgxMCwgMTAsIDEwKTtcbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgc2V0U2NhbGUoeCwgeSwgeikge1xuICAgICAgICBjb25zdCBtID0gdGhpcy5kYXRhO1xuXG4gICAgICAgIG1bMF0gPSB4O1xuICAgICAgICBtWzFdID0gMDtcbiAgICAgICAgbVsyXSA9IDA7XG4gICAgICAgIG1bM10gPSAwO1xuICAgICAgICBtWzRdID0gMDtcbiAgICAgICAgbVs1XSA9IHk7XG4gICAgICAgIG1bNl0gPSAwO1xuICAgICAgICBtWzddID0gMDtcbiAgICAgICAgbVs4XSA9IDA7XG4gICAgICAgIG1bOV0gPSAwO1xuICAgICAgICBtWzEwXSA9IHo7XG4gICAgICAgIG1bMTFdID0gMDtcbiAgICAgICAgbVsxMl0gPSAwO1xuICAgICAgICBtWzEzXSA9IDA7XG4gICAgICAgIG1bMTRdID0gMDtcbiAgICAgICAgbVsxNV0gPSAxO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIHNwZWNpZmllZCBtYXRyaXggdG8gYSBtYXRyaXggdHJhbnNmb3JtaW5nIGEgbm9ybWFsaXplZCB2aWV3IHZvbHVtZSAoaW4gcmFuZ2Ugb2ZcbiAgICAgKiAtMSAuLiAxKSB0byB0aGVpciBwb3NpdGlvbiBpbnNpZGUgYSB2aWV3cG9ydCAoaW4gcmFuZ2Ugb2YgMCAuLiAxKS4gVGhpcyBlbmNhcHN1bGF0ZXMgYVxuICAgICAqIHNjYWxpbmcgdG8gdGhlIHNpemUgb2YgdGhlIHZpZXdwb3J0IGFuZCBhIHRyYW5zbGF0aW9uIHRvIHRoZSBwb3NpdGlvbiBvZiB0aGUgdmlld3BvcnQuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge251bWJlcn0geCAtIFRoZSB4LWNvbXBvbmVudCBvZiB0aGUgcG9zaXRpb24gb2YgdGhlIHZpZXdwb3J0IChpbiAwLi4xIHJhbmdlKS5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0geSAtIFRoZSB5LWNvbXBvbmVudCBvZiB0aGUgcG9zaXRpb24gb2YgdGhlIHZpZXdwb3J0IChpbiAwLi4xIHJhbmdlKS5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gd2lkdGggLSBUaGUgd2lkdGggb2YgdGhlIHZpZXdwb3J0IChpbiAwLi4xIHJhbmdlKS5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gaGVpZ2h0IC0gVGhlIGhlaWdodCBvZiB0aGUgdmlld3BvcnQgKGluIDAuLjEgcmFuZ2UpLlxuICAgICAqIEByZXR1cm5zIHtNYXQ0fSBTZWxmIGZvciBjaGFpbmluZy5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIC8vIENyZWF0ZSBhIDR4NCB2aWV3cG9ydCBtYXRyaXggd2hpY2ggc2NhbGVzIG5vcm1hbGl6ZWQgdmlldyB2b2x1bWUgdG8gZnVsbCB0ZXh0dXJlIHZpZXdwb3J0XG4gICAgICogY29uc3Qgdm0gPSBuZXcgcGMuTWF0NCgpLnNldFZpZXdwb3J0KDAsIDAsIDEsIDEpO1xuICAgICAqIEBpZ25vcmVcbiAgICAgKi9cbiAgICBzZXRWaWV3cG9ydCh4LCB5LCB3aWR0aCwgaGVpZ2h0KSB7XG4gICAgICAgIGNvbnN0IG0gPSB0aGlzLmRhdGE7XG5cbiAgICAgICAgbVswXSA9IHdpZHRoICogMC41O1xuICAgICAgICBtWzFdID0gMDtcbiAgICAgICAgbVsyXSA9IDA7XG4gICAgICAgIG1bM10gPSAwO1xuICAgICAgICBtWzRdID0gMDtcbiAgICAgICAgbVs1XSA9IGhlaWdodCAqIDAuNTtcbiAgICAgICAgbVs2XSA9IDA7XG4gICAgICAgIG1bN10gPSAwO1xuICAgICAgICBtWzhdID0gMDtcbiAgICAgICAgbVs5XSA9IDA7XG4gICAgICAgIG1bMTBdID0gMC41O1xuICAgICAgICBtWzExXSA9IDA7XG4gICAgICAgIG1bMTJdID0geCArIHdpZHRoICogMC41O1xuICAgICAgICBtWzEzXSA9IHkgKyBoZWlnaHQgKiAwLjU7XG4gICAgICAgIG1bMTRdID0gMC41O1xuICAgICAgICBtWzE1XSA9IDE7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyB0aGUgbWF0cml4IHRvIGEgcmVmbGVjdGlvbiBtYXRyaXgsIHdoaWNoIGNhbiBiZSB1c2VkIGFzIGEgbWlycm9yIHRyYW5zZm9ybWF0aW9uIGJ5IHRoZVxuICAgICAqIHBsYW5lLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtWZWMzfSBub3JtYWwgLSBUaGUgbm9ybWFsIG9mIHRoZSBwbGFuZSB0byByZWZsZWN0IGJ5LlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBkaXN0YW5jZSAtIFRoZSBkaXN0YW5jZSBvZiBwbGFuZSB0byByZWZsZWN0IGJ5LlxuICAgICAqIEByZXR1cm5zIHtNYXQ0fSBTZWxmIGZvciBjaGFpbmluZy5cbiAgICAgKi9cbiAgICBzZXRSZWZsZWN0aW9uKG5vcm1hbCwgZGlzdGFuY2UpIHtcblxuICAgICAgICBjb25zdCBhID0gbm9ybWFsLng7XG4gICAgICAgIGNvbnN0IGIgPSBub3JtYWwueTtcbiAgICAgICAgY29uc3QgYyA9IG5vcm1hbC56O1xuICAgICAgICBjb25zdCBkYXRhID0gdGhpcy5kYXRhO1xuXG4gICAgICAgIGRhdGFbMF0gPSAxLjAgLSAyICogYSAqIGE7XG4gICAgICAgIGRhdGFbMV0gPSAtMiAqIGEgKiBiO1xuICAgICAgICBkYXRhWzJdID0gLTIgKiBhICogYztcbiAgICAgICAgZGF0YVszXSA9IDA7XG4gICAgICAgIGRhdGFbNF0gPSAtMiAqIGEgKiBiO1xuICAgICAgICBkYXRhWzVdID0gMS4wIC0gMiAqIGIgKiBiO1xuICAgICAgICBkYXRhWzZdID0gLTIgKiBiICogYztcbiAgICAgICAgZGF0YVs3XSA9IDA7XG4gICAgICAgIGRhdGFbOF0gPSAtMiAqIGEgKiBjO1xuICAgICAgICBkYXRhWzldID0gLTIgKiBiICogYztcbiAgICAgICAgZGF0YVsxMF0gPSAxLjAgLSAyICogYyAqIGM7XG4gICAgICAgIGRhdGFbMTFdID0gMDtcbiAgICAgICAgZGF0YVsxMl0gPSAtMiAqIGEgKiBkaXN0YW5jZTtcbiAgICAgICAgZGF0YVsxM10gPSAtMiAqIGIgKiBkaXN0YW5jZTtcbiAgICAgICAgZGF0YVsxNF0gPSAtMiAqIGMgKiBkaXN0YW5jZTtcbiAgICAgICAgZGF0YVsxNV0gPSAxO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIG1hdHJpeCB0byB0aGUgaW52ZXJzZSBvZiBhIHNvdXJjZSBtYXRyaXguXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge01hdDR9IFtzcmNdIC0gVGhlIG1hdHJpeCB0byBpbnZlcnQuIElmIG5vdCBzZXQsIHRoZSBtYXRyaXggaXMgaW52ZXJ0ZWQgaW4tcGxhY2UuXG4gICAgICogQHJldHVybnMge01hdDR9IFNlbGYgZm9yIGNoYWluaW5nLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogLy8gQ3JlYXRlIGEgNHg0IHJvdGF0aW9uIG1hdHJpeCBvZiAxODAgZGVncmVlcyBhcm91bmQgdGhlIHktYXhpc1xuICAgICAqIGNvbnN0IHJvdCA9IG5ldyBwYy5NYXQ0KCkuc2V0RnJvbUF4aXNBbmdsZShwYy5WZWMzLlVQLCAxODApO1xuICAgICAqXG4gICAgICogLy8gSW52ZXJ0IGluIHBsYWNlXG4gICAgICogcm90LmludmVydCgpO1xuICAgICAqL1xuICAgIGludmVydChzcmMgPSB0aGlzKSB7XG4gICAgICAgIGNvbnN0IHMgPSBzcmMuZGF0YTtcblxuICAgICAgICBjb25zdCBhMDAgPSBzWzBdO1xuICAgICAgICBjb25zdCBhMDEgPSBzWzFdO1xuICAgICAgICBjb25zdCBhMDIgPSBzWzJdO1xuICAgICAgICBjb25zdCBhMDMgPSBzWzNdO1xuICAgICAgICBjb25zdCBhMTAgPSBzWzRdO1xuICAgICAgICBjb25zdCBhMTEgPSBzWzVdO1xuICAgICAgICBjb25zdCBhMTIgPSBzWzZdO1xuICAgICAgICBjb25zdCBhMTMgPSBzWzddO1xuICAgICAgICBjb25zdCBhMjAgPSBzWzhdO1xuICAgICAgICBjb25zdCBhMjEgPSBzWzldO1xuICAgICAgICBjb25zdCBhMjIgPSBzWzEwXTtcbiAgICAgICAgY29uc3QgYTIzID0gc1sxMV07XG4gICAgICAgIGNvbnN0IGEzMCA9IHNbMTJdO1xuICAgICAgICBjb25zdCBhMzEgPSBzWzEzXTtcbiAgICAgICAgY29uc3QgYTMyID0gc1sxNF07XG4gICAgICAgIGNvbnN0IGEzMyA9IHNbMTVdO1xuXG4gICAgICAgIGNvbnN0IGIwMCA9IGEwMCAqIGExMSAtIGEwMSAqIGExMDtcbiAgICAgICAgY29uc3QgYjAxID0gYTAwICogYTEyIC0gYTAyICogYTEwO1xuICAgICAgICBjb25zdCBiMDIgPSBhMDAgKiBhMTMgLSBhMDMgKiBhMTA7XG4gICAgICAgIGNvbnN0IGIwMyA9IGEwMSAqIGExMiAtIGEwMiAqIGExMTtcbiAgICAgICAgY29uc3QgYjA0ID0gYTAxICogYTEzIC0gYTAzICogYTExO1xuICAgICAgICBjb25zdCBiMDUgPSBhMDIgKiBhMTMgLSBhMDMgKiBhMTI7XG4gICAgICAgIGNvbnN0IGIwNiA9IGEyMCAqIGEzMSAtIGEyMSAqIGEzMDtcbiAgICAgICAgY29uc3QgYjA3ID0gYTIwICogYTMyIC0gYTIyICogYTMwO1xuICAgICAgICBjb25zdCBiMDggPSBhMjAgKiBhMzMgLSBhMjMgKiBhMzA7XG4gICAgICAgIGNvbnN0IGIwOSA9IGEyMSAqIGEzMiAtIGEyMiAqIGEzMTtcbiAgICAgICAgY29uc3QgYjEwID0gYTIxICogYTMzIC0gYTIzICogYTMxO1xuICAgICAgICBjb25zdCBiMTEgPSBhMjIgKiBhMzMgLSBhMjMgKiBhMzI7XG5cbiAgICAgICAgY29uc3QgZGV0ID0gKGIwMCAqIGIxMSAtIGIwMSAqIGIxMCArIGIwMiAqIGIwOSArIGIwMyAqIGIwOCAtIGIwNCAqIGIwNyArIGIwNSAqIGIwNik7XG4gICAgICAgIGlmIChkZXQgPT09IDApIHtcbiAgICAgICAgICAgIHRoaXMuc2V0SWRlbnRpdHkoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IGludkRldCA9IDEgLyBkZXQ7XG4gICAgICAgICAgICBjb25zdCB0ID0gdGhpcy5kYXRhO1xuXG4gICAgICAgICAgICB0WzBdID0gKGExMSAqIGIxMSAtIGExMiAqIGIxMCArIGExMyAqIGIwOSkgKiBpbnZEZXQ7XG4gICAgICAgICAgICB0WzFdID0gKC1hMDEgKiBiMTEgKyBhMDIgKiBiMTAgLSBhMDMgKiBiMDkpICogaW52RGV0O1xuICAgICAgICAgICAgdFsyXSA9IChhMzEgKiBiMDUgLSBhMzIgKiBiMDQgKyBhMzMgKiBiMDMpICogaW52RGV0O1xuICAgICAgICAgICAgdFszXSA9ICgtYTIxICogYjA1ICsgYTIyICogYjA0IC0gYTIzICogYjAzKSAqIGludkRldDtcbiAgICAgICAgICAgIHRbNF0gPSAoLWExMCAqIGIxMSArIGExMiAqIGIwOCAtIGExMyAqIGIwNykgKiBpbnZEZXQ7XG4gICAgICAgICAgICB0WzVdID0gKGEwMCAqIGIxMSAtIGEwMiAqIGIwOCArIGEwMyAqIGIwNykgKiBpbnZEZXQ7XG4gICAgICAgICAgICB0WzZdID0gKC1hMzAgKiBiMDUgKyBhMzIgKiBiMDIgLSBhMzMgKiBiMDEpICogaW52RGV0O1xuICAgICAgICAgICAgdFs3XSA9IChhMjAgKiBiMDUgLSBhMjIgKiBiMDIgKyBhMjMgKiBiMDEpICogaW52RGV0O1xuICAgICAgICAgICAgdFs4XSA9IChhMTAgKiBiMTAgLSBhMTEgKiBiMDggKyBhMTMgKiBiMDYpICogaW52RGV0O1xuICAgICAgICAgICAgdFs5XSA9ICgtYTAwICogYjEwICsgYTAxICogYjA4IC0gYTAzICogYjA2KSAqIGludkRldDtcbiAgICAgICAgICAgIHRbMTBdID0gKGEzMCAqIGIwNCAtIGEzMSAqIGIwMiArIGEzMyAqIGIwMCkgKiBpbnZEZXQ7XG4gICAgICAgICAgICB0WzExXSA9ICgtYTIwICogYjA0ICsgYTIxICogYjAyIC0gYTIzICogYjAwKSAqIGludkRldDtcbiAgICAgICAgICAgIHRbMTJdID0gKC1hMTAgKiBiMDkgKyBhMTEgKiBiMDcgLSBhMTIgKiBiMDYpICogaW52RGV0O1xuICAgICAgICAgICAgdFsxM10gPSAoYTAwICogYjA5IC0gYTAxICogYjA3ICsgYTAyICogYjA2KSAqIGludkRldDtcbiAgICAgICAgICAgIHRbMTRdID0gKC1hMzAgKiBiMDMgKyBhMzEgKiBiMDEgLSBhMzIgKiBiMDApICogaW52RGV0O1xuICAgICAgICAgICAgdFsxNV0gPSAoYTIwICogYjAzIC0gYTIxICogYjAxICsgYTIyICogYjAwKSAqIGludkRldDtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgbWF0cml4IGRhdGEgZnJvbSBhbiBhcnJheS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7bnVtYmVyW119IHNyYyAtIFNvdXJjZSBhcnJheS4gTXVzdCBoYXZlIDE2IHZhbHVlcy5cbiAgICAgKiBAcmV0dXJucyB7TWF0NH0gU2VsZiBmb3IgY2hhaW5pbmcuXG4gICAgICovXG4gICAgc2V0KHNyYykge1xuICAgICAgICBjb25zdCBkc3QgPSB0aGlzLmRhdGE7XG5cbiAgICAgICAgZHN0WzBdID0gc3JjWzBdO1xuICAgICAgICBkc3RbMV0gPSBzcmNbMV07XG4gICAgICAgIGRzdFsyXSA9IHNyY1syXTtcbiAgICAgICAgZHN0WzNdID0gc3JjWzNdO1xuICAgICAgICBkc3RbNF0gPSBzcmNbNF07XG4gICAgICAgIGRzdFs1XSA9IHNyY1s1XTtcbiAgICAgICAgZHN0WzZdID0gc3JjWzZdO1xuICAgICAgICBkc3RbN10gPSBzcmNbN107XG4gICAgICAgIGRzdFs4XSA9IHNyY1s4XTtcbiAgICAgICAgZHN0WzldID0gc3JjWzldO1xuICAgICAgICBkc3RbMTBdID0gc3JjWzEwXTtcbiAgICAgICAgZHN0WzExXSA9IHNyY1sxMV07XG4gICAgICAgIGRzdFsxMl0gPSBzcmNbMTJdO1xuICAgICAgICBkc3RbMTNdID0gc3JjWzEzXTtcbiAgICAgICAgZHN0WzE0XSA9IHNyY1sxNF07XG4gICAgICAgIGRzdFsxNV0gPSBzcmNbMTVdO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIHNwZWNpZmllZCBtYXRyaXggdG8gdGhlIGlkZW50aXR5IG1hdHJpeC5cbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtNYXQ0fSBTZWxmIGZvciBjaGFpbmluZy5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIG0uc2V0SWRlbnRpdHkoKTtcbiAgICAgKiBjb25zb2xlLmxvZyhcIlRoZSBtYXRyaXggaXMgXCIgKyAobS5pc0lkZW50aXR5KCkgPyBcImlkZW50aXR5XCIgOiBcIm5vdCBpZGVudGl0eVwiKSk7XG4gICAgICovXG4gICAgc2V0SWRlbnRpdHkoKSB7XG4gICAgICAgIGNvbnN0IG0gPSB0aGlzLmRhdGE7XG5cbiAgICAgICAgbVswXSA9IDE7XG4gICAgICAgIG1bMV0gPSAwO1xuICAgICAgICBtWzJdID0gMDtcbiAgICAgICAgbVszXSA9IDA7XG4gICAgICAgIG1bNF0gPSAwO1xuICAgICAgICBtWzVdID0gMTtcbiAgICAgICAgbVs2XSA9IDA7XG4gICAgICAgIG1bN10gPSAwO1xuICAgICAgICBtWzhdID0gMDtcbiAgICAgICAgbVs5XSA9IDA7XG4gICAgICAgIG1bMTBdID0gMTtcbiAgICAgICAgbVsxMV0gPSAwO1xuICAgICAgICBtWzEyXSA9IDA7XG4gICAgICAgIG1bMTNdID0gMDtcbiAgICAgICAgbVsxNF0gPSAwO1xuICAgICAgICBtWzE1XSA9IDE7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyB0aGUgc3BlY2lmaWVkIG1hdHJpeCB0byB0aGUgY29uY2F0ZW5hdGlvbiBvZiBhIHRyYW5zbGF0aW9uLCBhIHF1YXRlcm5pb24gcm90YXRpb24gYW5kIGFcbiAgICAgKiBzY2FsZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7VmVjM30gdCAtIEEgMy1kIHZlY3RvciB0cmFuc2xhdGlvbi5cbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi9xdWF0LmpzJykuUXVhdH0gciAtIEEgcXVhdGVybmlvbiByb3RhdGlvbi5cbiAgICAgKiBAcGFyYW0ge1ZlYzN9IHMgLSBBIDMtZCB2ZWN0b3Igc2NhbGUuXG4gICAgICogQHJldHVybnMge01hdDR9IFNlbGYgZm9yIGNoYWluaW5nLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogY29uc3QgdCA9IG5ldyBwYy5WZWMzKDEwLCAyMCwgMzApO1xuICAgICAqIGNvbnN0IHIgPSBuZXcgcGMuUXVhdCgpO1xuICAgICAqIGNvbnN0IHMgPSBuZXcgcGMuVmVjMygyLCAyLCAyKTtcbiAgICAgKlxuICAgICAqIGNvbnN0IG0gPSBuZXcgcGMuTWF0NCgpO1xuICAgICAqIG0uc2V0VFJTKHQsIHIsIHMpO1xuICAgICAqL1xuICAgIHNldFRSUyh0LCByLCBzKSB7XG4gICAgICAgIGNvbnN0IHF4ID0gci54O1xuICAgICAgICBjb25zdCBxeSA9IHIueTtcbiAgICAgICAgY29uc3QgcXogPSByLno7XG4gICAgICAgIGNvbnN0IHF3ID0gci53O1xuXG4gICAgICAgIGNvbnN0IHN4ID0gcy54O1xuICAgICAgICBjb25zdCBzeSA9IHMueTtcbiAgICAgICAgY29uc3Qgc3ogPSBzLno7XG5cbiAgICAgICAgY29uc3QgeDIgPSBxeCArIHF4O1xuICAgICAgICBjb25zdCB5MiA9IHF5ICsgcXk7XG4gICAgICAgIGNvbnN0IHoyID0gcXogKyBxejtcbiAgICAgICAgY29uc3QgeHggPSBxeCAqIHgyO1xuICAgICAgICBjb25zdCB4eSA9IHF4ICogeTI7XG4gICAgICAgIGNvbnN0IHh6ID0gcXggKiB6MjtcbiAgICAgICAgY29uc3QgeXkgPSBxeSAqIHkyO1xuICAgICAgICBjb25zdCB5eiA9IHF5ICogejI7XG4gICAgICAgIGNvbnN0IHp6ID0gcXogKiB6MjtcbiAgICAgICAgY29uc3Qgd3ggPSBxdyAqIHgyO1xuICAgICAgICBjb25zdCB3eSA9IHF3ICogeTI7XG4gICAgICAgIGNvbnN0IHd6ID0gcXcgKiB6MjtcblxuICAgICAgICBjb25zdCBtID0gdGhpcy5kYXRhO1xuXG4gICAgICAgIG1bMF0gPSAoMSAtICh5eSArIHp6KSkgKiBzeDtcbiAgICAgICAgbVsxXSA9ICh4eSArIHd6KSAqIHN4O1xuICAgICAgICBtWzJdID0gKHh6IC0gd3kpICogc3g7XG4gICAgICAgIG1bM10gPSAwO1xuXG4gICAgICAgIG1bNF0gPSAoeHkgLSB3eikgKiBzeTtcbiAgICAgICAgbVs1XSA9ICgxIC0gKHh4ICsgenopKSAqIHN5O1xuICAgICAgICBtWzZdID0gKHl6ICsgd3gpICogc3k7XG4gICAgICAgIG1bN10gPSAwO1xuXG4gICAgICAgIG1bOF0gPSAoeHogKyB3eSkgKiBzejtcbiAgICAgICAgbVs5XSA9ICh5eiAtIHd4KSAqIHN6O1xuICAgICAgICBtWzEwXSA9ICgxIC0gKHh4ICsgeXkpKSAqIHN6O1xuICAgICAgICBtWzExXSA9IDA7XG5cbiAgICAgICAgbVsxMl0gPSB0Lng7XG4gICAgICAgIG1bMTNdID0gdC55O1xuICAgICAgICBtWzE0XSA9IHQuejtcbiAgICAgICAgbVsxNV0gPSAxO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIG1hdHJpeCB0byB0aGUgdHJhbnNwb3NlIG9mIGEgc291cmNlIG1hdHJpeC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7TWF0NH0gW3NyY10gLSBUaGUgbWF0cml4IHRvIHRyYW5zcG9zZS4gSWYgbm90IHNldCwgdGhlIG1hdHJpeCBpcyB0cmFuc3Bvc2VkIGluLXBsYWNlLlxuICAgICAqIEByZXR1cm5zIHtNYXQ0fSBTZWxmIGZvciBjaGFpbmluZy5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGNvbnN0IG0gPSBuZXcgcGMuTWF0NCgpO1xuICAgICAqXG4gICAgICogLy8gVHJhbnNwb3NlIGluIHBsYWNlXG4gICAgICogbS50cmFuc3Bvc2UoKTtcbiAgICAgKi9cbiAgICB0cmFuc3Bvc2Uoc3JjID0gdGhpcykge1xuICAgICAgICBjb25zdCBzID0gc3JjLmRhdGE7XG4gICAgICAgIGNvbnN0IHQgPSB0aGlzLmRhdGE7XG5cbiAgICAgICAgaWYgKHMgPT09IHQpIHtcbiAgICAgICAgICAgIGxldCB0bXA7XG5cbiAgICAgICAgICAgIHRtcCA9IHNbMV07XG4gICAgICAgICAgICB0WzFdID0gc1s0XTtcbiAgICAgICAgICAgIHRbNF0gPSB0bXA7XG5cbiAgICAgICAgICAgIHRtcCA9IHNbMl07XG4gICAgICAgICAgICB0WzJdID0gc1s4XTtcbiAgICAgICAgICAgIHRbOF0gPSB0bXA7XG5cbiAgICAgICAgICAgIHRtcCA9IHNbM107XG4gICAgICAgICAgICB0WzNdID0gc1sxMl07XG4gICAgICAgICAgICB0WzEyXSA9IHRtcDtcblxuICAgICAgICAgICAgdG1wID0gc1s2XTtcbiAgICAgICAgICAgIHRbNl0gPSBzWzldO1xuICAgICAgICAgICAgdFs5XSA9IHRtcDtcblxuICAgICAgICAgICAgdG1wID0gc1s3XTtcbiAgICAgICAgICAgIHRbN10gPSBzWzEzXTtcbiAgICAgICAgICAgIHRbMTNdID0gdG1wO1xuXG4gICAgICAgICAgICB0bXAgPSBzWzExXTtcbiAgICAgICAgICAgIHRbMTFdID0gc1sxNF07XG4gICAgICAgICAgICB0WzE0XSA9IHRtcDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRbMF0gPSBzWzBdO1xuICAgICAgICAgICAgdFsxXSA9IHNbNF07XG4gICAgICAgICAgICB0WzJdID0gc1s4XTtcbiAgICAgICAgICAgIHRbM10gPSBzWzEyXTtcbiAgICAgICAgICAgIHRbNF0gPSBzWzFdO1xuICAgICAgICAgICAgdFs1XSA9IHNbNV07XG4gICAgICAgICAgICB0WzZdID0gc1s5XTtcbiAgICAgICAgICAgIHRbN10gPSBzWzEzXTtcbiAgICAgICAgICAgIHRbOF0gPSBzWzJdO1xuICAgICAgICAgICAgdFs5XSA9IHNbNl07XG4gICAgICAgICAgICB0WzEwXSA9IHNbMTBdO1xuICAgICAgICAgICAgdFsxMV0gPSBzWzE0XTtcbiAgICAgICAgICAgIHRbMTJdID0gc1szXTtcbiAgICAgICAgICAgIHRbMTNdID0gc1s3XTtcbiAgICAgICAgICAgIHRbMTRdID0gc1sxMV07XG4gICAgICAgICAgICB0WzE1XSA9IHNbMTVdO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRXh0cmFjdHMgdGhlIHRyYW5zbGF0aW9uYWwgY29tcG9uZW50IGZyb20gdGhlIHNwZWNpZmllZCA0eDQgbWF0cml4LlxuICAgICAqXG4gICAgICogQHBhcmFtIHtWZWMzfSBbdF0gLSBUaGUgdmVjdG9yIHRvIHJlY2VpdmUgdGhlIHRyYW5zbGF0aW9uIG9mIHRoZSBtYXRyaXguXG4gICAgICogQHJldHVybnMge1ZlYzN9IFRoZSB0cmFuc2xhdGlvbiBvZiB0aGUgc3BlY2lmaWVkIDR4NCBtYXRyaXguXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiAvLyBDcmVhdGUgYSA0eDQgbWF0cml4XG4gICAgICogY29uc3QgbSA9IG5ldyBwYy5NYXQ0KCk7XG4gICAgICpcbiAgICAgKiAvLyBRdWVyeSB0aGUgdHJhbnNsYXRpb24gY29tcG9uZW50XG4gICAgICogY29uc3QgdCA9IG5ldyBwYy5WZWMzKCk7XG4gICAgICogbS5nZXRUcmFuc2xhdGlvbih0KTtcbiAgICAgKi9cbiAgICBnZXRUcmFuc2xhdGlvbih0ID0gbmV3IFZlYzMoKSkge1xuICAgICAgICByZXR1cm4gdC5zZXQodGhpcy5kYXRhWzEyXSwgdGhpcy5kYXRhWzEzXSwgdGhpcy5kYXRhWzE0XSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRXh0cmFjdHMgdGhlIHgtYXhpcyBmcm9tIHRoZSBzcGVjaWZpZWQgNHg0IG1hdHJpeC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7VmVjM30gW3hdIC0gVGhlIHZlY3RvciB0byByZWNlaXZlIHRoZSB4IGF4aXMgb2YgdGhlIG1hdHJpeC5cbiAgICAgKiBAcmV0dXJucyB7VmVjM30gVGhlIHgtYXhpcyBvZiB0aGUgc3BlY2lmaWVkIDR4NCBtYXRyaXguXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiAvLyBDcmVhdGUgYSA0eDQgbWF0cml4XG4gICAgICogY29uc3QgbSA9IG5ldyBwYy5NYXQ0KCk7XG4gICAgICpcbiAgICAgKiAvLyBRdWVyeSB0aGUgeC1heGlzIGNvbXBvbmVudFxuICAgICAqIGNvbnN0IHggPSBuZXcgcGMuVmVjMygpO1xuICAgICAqIG0uZ2V0WCh4KTtcbiAgICAgKi9cbiAgICBnZXRYKHggPSBuZXcgVmVjMygpKSB7XG4gICAgICAgIHJldHVybiB4LnNldCh0aGlzLmRhdGFbMF0sIHRoaXMuZGF0YVsxXSwgdGhpcy5kYXRhWzJdKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBFeHRyYWN0cyB0aGUgeS1heGlzIGZyb20gdGhlIHNwZWNpZmllZCA0eDQgbWF0cml4LlxuICAgICAqXG4gICAgICogQHBhcmFtIHtWZWMzfSBbeV0gLSBUaGUgdmVjdG9yIHRvIHJlY2VpdmUgdGhlIHkgYXhpcyBvZiB0aGUgbWF0cml4LlxuICAgICAqIEByZXR1cm5zIHtWZWMzfSBUaGUgeS1heGlzIG9mIHRoZSBzcGVjaWZpZWQgNHg0IG1hdHJpeC5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIC8vIENyZWF0ZSBhIDR4NCBtYXRyaXhcbiAgICAgKiBjb25zdCBtID0gbmV3IHBjLk1hdDQoKTtcbiAgICAgKlxuICAgICAqIC8vIFF1ZXJ5IHRoZSB5LWF4aXMgY29tcG9uZW50XG4gICAgICogY29uc3QgeSA9IG5ldyBwYy5WZWMzKCk7XG4gICAgICogbS5nZXRZKHkpO1xuICAgICAqL1xuICAgIGdldFkoeSA9IG5ldyBWZWMzKCkpIHtcbiAgICAgICAgcmV0dXJuIHkuc2V0KHRoaXMuZGF0YVs0XSwgdGhpcy5kYXRhWzVdLCB0aGlzLmRhdGFbNl0pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEV4dHJhY3RzIHRoZSB6LWF4aXMgZnJvbSB0aGUgc3BlY2lmaWVkIDR4NCBtYXRyaXguXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1ZlYzN9IFt6XSAtIFRoZSB2ZWN0b3IgdG8gcmVjZWl2ZSB0aGUgeiBheGlzIG9mIHRoZSBtYXRyaXguXG4gICAgICogQHJldHVybnMge1ZlYzN9IFRoZSB6LWF4aXMgb2YgdGhlIHNwZWNpZmllZCA0eDQgbWF0cml4LlxuICAgICAqIEBleGFtcGxlXG4gICAgICogLy8gQ3JlYXRlIGEgNHg0IG1hdHJpeFxuICAgICAqIGNvbnN0IG0gPSBuZXcgcGMuTWF0NCgpO1xuICAgICAqXG4gICAgICogLy8gUXVlcnkgdGhlIHotYXhpcyBjb21wb25lbnRcbiAgICAgKiBjb25zdCB6ID0gbmV3IHBjLlZlYzMoKTtcbiAgICAgKiBtLmdldFooeik7XG4gICAgICovXG4gICAgZ2V0Wih6ID0gbmV3IFZlYzMoKSkge1xuICAgICAgICByZXR1cm4gei5zZXQodGhpcy5kYXRhWzhdLCB0aGlzLmRhdGFbOV0sIHRoaXMuZGF0YVsxMF0pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEV4dHJhY3RzIHRoZSBzY2FsZSBjb21wb25lbnQgZnJvbSB0aGUgc3BlY2lmaWVkIDR4NCBtYXRyaXguXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1ZlYzN9IFtzY2FsZV0gLSBWZWN0b3IgdG8gcmVjZWl2ZSB0aGUgc2NhbGUuXG4gICAgICogQHJldHVybnMge1ZlYzN9IFRoZSBzY2FsZSBpbiBYLCBZIGFuZCBaIG9mIHRoZSBzcGVjaWZpZWQgNHg0IG1hdHJpeC5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIC8vIFF1ZXJ5IHRoZSBzY2FsZSBjb21wb25lbnRcbiAgICAgKiBjb25zdCBzY2FsZSA9IG0uZ2V0U2NhbGUoKTtcbiAgICAgKi9cbiAgICBnZXRTY2FsZShzY2FsZSA9IG5ldyBWZWMzKCkpIHtcbiAgICAgICAgdGhpcy5nZXRYKHgpO1xuICAgICAgICB0aGlzLmdldFkoeSk7XG4gICAgICAgIHRoaXMuZ2V0Wih6KTtcbiAgICAgICAgc2NhbGUuc2V0KHgubGVuZ3RoKCksIHkubGVuZ3RoKCksIHoubGVuZ3RoKCkpO1xuXG4gICAgICAgIHJldHVybiBzY2FsZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiAtMSBpZiB0aGUgdGhlIG1hdHJpeCBoYXMgYW4gb2RkIG51bWJlciBvZiBuZWdhdGl2ZSBzY2FsZXMgKG1pcnJvcmVkKTsgMSBvdGhlcndpc2UuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqIEBpZ25vcmVcbiAgICAgKi9cbiAgICBnZXQgc2NhbGVTaWduKCkge1xuICAgICAgICB0aGlzLmdldFgoeCk7XG4gICAgICAgIHRoaXMuZ2V0WSh5KTtcbiAgICAgICAgdGhpcy5nZXRaKHopO1xuICAgICAgICB4LmNyb3NzKHgsIHkpO1xuICAgICAgICByZXR1cm4geC5kb3QoeikgPCAwID8gLTEgOiAxO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIHNwZWNpZmllZCBtYXRyaXggdG8gYSByb3RhdGlvbiBtYXRyaXggZGVmaW5lZCBieSBFdWxlciBhbmdsZXMuIFRoZSBFdWxlciBhbmdsZXMgYXJlXG4gICAgICogc3BlY2lmaWVkIGluIFhZWiBvcmRlciBhbmQgaW4gZGVncmVlcy5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBleCAtIEFuZ2xlIHRvIHJvdGF0ZSBhcm91bmQgWCBheGlzIGluIGRlZ3JlZXMuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGV5IC0gQW5nbGUgdG8gcm90YXRlIGFyb3VuZCBZIGF4aXMgaW4gZGVncmVlcy5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gZXogLSBBbmdsZSB0byByb3RhdGUgYXJvdW5kIFogYXhpcyBpbiBkZWdyZWVzLlxuICAgICAqIEByZXR1cm5zIHtNYXQ0fSBTZWxmIGZvciBjaGFpbmluZy5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGNvbnN0IG0gPSBuZXcgcGMuTWF0NCgpO1xuICAgICAqIG0uc2V0RnJvbUV1bGVyQW5nbGVzKDQ1LCA5MCwgMTgwKTtcbiAgICAgKi9cbiAgICBzZXRGcm9tRXVsZXJBbmdsZXMoZXgsIGV5LCBleikge1xuICAgICAgICAvLyBodHRwOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL1JvdGF0aW9uX21hdHJpeCNDb252ZXJzaW9uX2Zyb21fYW5kX3RvX2F4aXMtYW5nbGVcbiAgICAgICAgLy8gVGhlIDNEIHNwYWNlIGlzIHJpZ2h0LWhhbmRlZCwgc28gdGhlIHJvdGF0aW9uIGFyb3VuZCBlYWNoIGF4aXMgd2lsbCBiZSBjb3VudGVyY2xvY2t3aXNlXG4gICAgICAgIC8vIGZvciBhbiBvYnNlcnZlciBwbGFjZWQgc28gdGhhdCB0aGUgYXhpcyBnb2VzIGluIGhpcyBvciBoZXIgZGlyZWN0aW9uIChSaWdodC1oYW5kIHJ1bGUpLlxuICAgICAgICBleCAqPSBtYXRoLkRFR19UT19SQUQ7XG4gICAgICAgIGV5ICo9IG1hdGguREVHX1RPX1JBRDtcbiAgICAgICAgZXogKj0gbWF0aC5ERUdfVE9fUkFEO1xuXG4gICAgICAgIC8vIFNvbHV0aW9uIHRha2VuIGZyb20gaHR0cDovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9FdWxlcl9hbmdsZXMjTWF0cml4X29yaWVudGF0aW9uXG4gICAgICAgIGNvbnN0IHMxID0gTWF0aC5zaW4oLWV4KTtcbiAgICAgICAgY29uc3QgYzEgPSBNYXRoLmNvcygtZXgpO1xuICAgICAgICBjb25zdCBzMiA9IE1hdGguc2luKC1leSk7XG4gICAgICAgIGNvbnN0IGMyID0gTWF0aC5jb3MoLWV5KTtcbiAgICAgICAgY29uc3QgczMgPSBNYXRoLnNpbigtZXopO1xuICAgICAgICBjb25zdCBjMyA9IE1hdGguY29zKC1leik7XG5cbiAgICAgICAgY29uc3QgbSA9IHRoaXMuZGF0YTtcblxuICAgICAgICAvLyBTZXQgcm90YXRpb24gZWxlbWVudHNcbiAgICAgICAgbVswXSA9IGMyICogYzM7XG4gICAgICAgIG1bMV0gPSAtYzIgKiBzMztcbiAgICAgICAgbVsyXSA9IHMyO1xuICAgICAgICBtWzNdID0gMDtcblxuICAgICAgICBtWzRdID0gYzEgKiBzMyArIGMzICogczEgKiBzMjtcbiAgICAgICAgbVs1XSA9IGMxICogYzMgLSBzMSAqIHMyICogczM7XG4gICAgICAgIG1bNl0gPSAtYzIgKiBzMTtcbiAgICAgICAgbVs3XSA9IDA7XG5cbiAgICAgICAgbVs4XSA9IHMxICogczMgLSBjMSAqIGMzICogczI7XG4gICAgICAgIG1bOV0gPSBjMyAqIHMxICsgYzEgKiBzMiAqIHMzO1xuICAgICAgICBtWzEwXSA9IGMxICogYzI7XG4gICAgICAgIG1bMTFdID0gMDtcblxuICAgICAgICBtWzEyXSA9IDA7XG4gICAgICAgIG1bMTNdID0gMDtcbiAgICAgICAgbVsxNF0gPSAwO1xuICAgICAgICBtWzE1XSA9IDE7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRXh0cmFjdHMgdGhlIEV1bGVyIGFuZ2xlcyBlcXVpdmFsZW50IHRvIHRoZSByb3RhdGlvbmFsIHBvcnRpb24gb2YgdGhlIHNwZWNpZmllZCBtYXRyaXguIFRoZVxuICAgICAqIHJldHVybmVkIEV1bGVyIGFuZ2xlcyBhcmUgaW4gWFlaIG9yZGVyIGFuIGluIGRlZ3JlZXMuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1ZlYzN9IFtldWxlcnNdIC0gQSAzLWQgdmVjdG9yIHRvIHJlY2VpdmUgdGhlIEV1bGVyIGFuZ2xlcy5cbiAgICAgKiBAcmV0dXJucyB7VmVjM30gQSAzLWQgdmVjdG9yIGNvbnRhaW5pbmcgdGhlIEV1bGVyIGFuZ2xlcy5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIC8vIENyZWF0ZSBhIDR4NCByb3RhdGlvbiBtYXRyaXggb2YgNDUgZGVncmVlcyBhcm91bmQgdGhlIHktYXhpc1xuICAgICAqIGNvbnN0IG0gPSBuZXcgcGMuTWF0NCgpLnNldEZyb21BeGlzQW5nbGUocGMuVmVjMy5VUCwgNDUpO1xuICAgICAqXG4gICAgICogY29uc3QgZXVsZXJzID0gbS5nZXRFdWxlckFuZ2xlcygpO1xuICAgICAqL1xuICAgIGdldEV1bGVyQW5nbGVzKGV1bGVycyA9IG5ldyBWZWMzKCkpIHtcbiAgICAgICAgdGhpcy5nZXRTY2FsZShzY2FsZSk7XG4gICAgICAgIGNvbnN0IHN4ID0gc2NhbGUueDtcbiAgICAgICAgY29uc3Qgc3kgPSBzY2FsZS55O1xuICAgICAgICBjb25zdCBzeiA9IHNjYWxlLno7XG5cbiAgICAgICAgaWYgKHN4ID09PSAwIHx8IHN5ID09PSAwIHx8IHN6ID09PSAwKVxuICAgICAgICAgICAgcmV0dXJuIGV1bGVycy5zZXQoMCwgMCwgMCk7XG5cbiAgICAgICAgY29uc3QgbSA9IHRoaXMuZGF0YTtcblxuICAgICAgICBjb25zdCB5ID0gTWF0aC5hc2luKC1tWzJdIC8gc3gpO1xuICAgICAgICBjb25zdCBoYWxmUGkgPSBNYXRoLlBJICogMC41O1xuXG4gICAgICAgIGxldCB4LCB6O1xuXG4gICAgICAgIGlmICh5IDwgaGFsZlBpKSB7XG4gICAgICAgICAgICBpZiAoeSA+IC1oYWxmUGkpIHtcbiAgICAgICAgICAgICAgICB4ID0gTWF0aC5hdGFuMihtWzZdIC8gc3ksIG1bMTBdIC8gc3opO1xuICAgICAgICAgICAgICAgIHogPSBNYXRoLmF0YW4yKG1bMV0gLyBzeCwgbVswXSAvIHN4KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gTm90IGEgdW5pcXVlIHNvbHV0aW9uXG4gICAgICAgICAgICAgICAgeiA9IDA7XG4gICAgICAgICAgICAgICAgeCA9IC1NYXRoLmF0YW4yKG1bNF0gLyBzeSwgbVs1XSAvIHN5KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIE5vdCBhIHVuaXF1ZSBzb2x1dGlvblxuICAgICAgICAgICAgeiA9IDA7XG4gICAgICAgICAgICB4ID0gTWF0aC5hdGFuMihtWzRdIC8gc3ksIG1bNV0gLyBzeSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gZXVsZXJzLnNldCh4LCB5LCB6KS5tdWxTY2FsYXIobWF0aC5SQURfVE9fREVHKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDb252ZXJ0cyB0aGUgc3BlY2lmaWVkIG1hdHJpeCB0byBzdHJpbmcgZm9ybS5cbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtzdHJpbmd9IFRoZSBtYXRyaXggaW4gc3RyaW5nIGZvcm0uXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBjb25zdCBtID0gbmV3IHBjLk1hdDQoKTtcbiAgICAgKiAvLyBPdXRwdXRzIFsxLCAwLCAwLCAwLCAwLCAxLCAwLCAwLCAwLCAwLCAxLCAwLCAwLCAwLCAwLCAxXVxuICAgICAqIGNvbnNvbGUubG9nKG0udG9TdHJpbmcoKSk7XG4gICAgICovXG4gICAgdG9TdHJpbmcoKSB7XG4gICAgICAgIHJldHVybiAnWycgKyB0aGlzLmRhdGEuam9pbignLCAnKSArICddJztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBIGNvbnN0YW50IG1hdHJpeCBzZXQgdG8gdGhlIGlkZW50aXR5LlxuICAgICAqXG4gICAgICogQHR5cGUge01hdDR9XG4gICAgICogQHJlYWRvbmx5XG4gICAgICovXG4gICAgc3RhdGljIElERU5USVRZID0gT2JqZWN0LmZyZWV6ZShuZXcgTWF0NCgpKTtcblxuICAgIC8qKlxuICAgICAqIEEgY29uc3RhbnQgbWF0cml4IHdpdGggYWxsIGVsZW1lbnRzIHNldCB0byAwLlxuICAgICAqXG4gICAgICogQHR5cGUge01hdDR9XG4gICAgICogQHJlYWRvbmx5XG4gICAgICovXG4gICAgc3RhdGljIFpFUk8gPSBPYmplY3QuZnJlZXplKG5ldyBNYXQ0KCkuc2V0KFswLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwXSkpO1xufVxuXG5leHBvcnQgeyBNYXQ0IH07XG4iXSwibmFtZXMiOlsiX2hhbGZTaXplIiwiVmVjMiIsIngiLCJWZWMzIiwieSIsInoiLCJzY2FsZSIsIk1hdDQiLCJjb25zdHJ1Y3RvciIsImRhdGEiLCJGbG9hdDMyQXJyYXkiLCJfZ2V0UGVyc3BlY3RpdmVIYWxmU2l6ZSIsImhhbGZTaXplIiwiZm92IiwiYXNwZWN0Iiwiem5lYXIiLCJmb3ZJc0hvcml6b250YWwiLCJNYXRoIiwidGFuIiwiUEkiLCJhZGQyIiwibGhzIiwicmhzIiwiYSIsImIiLCJyIiwiYWRkIiwiY2xvbmUiLCJjc3RyIiwiY29weSIsInNyYyIsImRzdCIsImVxdWFscyIsImwiLCJpc0lkZW50aXR5IiwibSIsIm11bDIiLCJhMDAiLCJhMDEiLCJhMDIiLCJhMDMiLCJhMTAiLCJhMTEiLCJhMTIiLCJhMTMiLCJhMjAiLCJhMjEiLCJhMjIiLCJhMjMiLCJhMzAiLCJhMzEiLCJhMzIiLCJhMzMiLCJiMCIsImIxIiwiYjIiLCJiMyIsIm11bEFmZmluZTIiLCJtdWwiLCJ0cmFuc2Zvcm1Qb2ludCIsInZlYyIsInJlcyIsInRyYW5zZm9ybVZlY3RvciIsInRyYW5zZm9ybVZlYzQiLCJWZWM0IiwidyIsInNldExvb2tBdCIsInBvc2l0aW9uIiwidGFyZ2V0IiwidXAiLCJzdWIyIiwibm9ybWFsaXplIiwiY3Jvc3MiLCJzZXRGcnVzdHVtIiwibGVmdCIsInJpZ2h0IiwiYm90dG9tIiwidG9wIiwiemZhciIsInRlbXAxIiwidGVtcDIiLCJ0ZW1wMyIsInRlbXA0Iiwic2V0UGVyc3BlY3RpdmUiLCJzZXRPcnRobyIsIm5lYXIiLCJmYXIiLCJzZXRGcm9tQXhpc0FuZ2xlIiwiYXhpcyIsImFuZ2xlIiwibWF0aCIsIkRFR19UT19SQUQiLCJjIiwiY29zIiwicyIsInNpbiIsInQiLCJ0eCIsInR5Iiwic2V0VHJhbnNsYXRlIiwic2V0U2NhbGUiLCJzZXRWaWV3cG9ydCIsIndpZHRoIiwiaGVpZ2h0Iiwic2V0UmVmbGVjdGlvbiIsIm5vcm1hbCIsImRpc3RhbmNlIiwiaW52ZXJ0IiwiYjAwIiwiYjAxIiwiYjAyIiwiYjAzIiwiYjA0IiwiYjA1IiwiYjA2IiwiYjA3IiwiYjA4IiwiYjA5IiwiYjEwIiwiYjExIiwiZGV0Iiwic2V0SWRlbnRpdHkiLCJpbnZEZXQiLCJzZXQiLCJzZXRUUlMiLCJxeCIsInF5IiwicXoiLCJxdyIsInN4Iiwic3kiLCJzeiIsIngyIiwieTIiLCJ6MiIsInh4IiwieHkiLCJ4eiIsInl5IiwieXoiLCJ6eiIsInd4Iiwid3kiLCJ3eiIsInRyYW5zcG9zZSIsInRtcCIsImdldFRyYW5zbGF0aW9uIiwiZ2V0WCIsImdldFkiLCJnZXRaIiwiZ2V0U2NhbGUiLCJsZW5ndGgiLCJzY2FsZVNpZ24iLCJkb3QiLCJzZXRGcm9tRXVsZXJBbmdsZXMiLCJleCIsImV5IiwiZXoiLCJzMSIsImMxIiwiczIiLCJjMiIsInMzIiwiYzMiLCJnZXRFdWxlckFuZ2xlcyIsImV1bGVycyIsImFzaW4iLCJoYWxmUGkiLCJhdGFuMiIsIm11bFNjYWxhciIsIlJBRF9UT19ERUciLCJ0b1N0cmluZyIsImpvaW4iLCJJREVOVElUWSIsIk9iamVjdCIsImZyZWV6ZSIsIlpFUk8iXSwibWFwcGluZ3MiOiI7Ozs7O0FBS0EsTUFBTUEsU0FBUyxHQUFHLElBQUlDLElBQUksRUFBRSxDQUFBO0FBQzVCLE1BQU1DLENBQUMsR0FBRyxJQUFJQyxJQUFJLEVBQUUsQ0FBQTtBQUNwQixNQUFNQyxDQUFDLEdBQUcsSUFBSUQsSUFBSSxFQUFFLENBQUE7QUFDcEIsTUFBTUUsQ0FBQyxHQUFHLElBQUlGLElBQUksRUFBRSxDQUFBO0FBQ3BCLE1BQU1HLEtBQUssR0FBRyxJQUFJSCxJQUFJ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QUFDLENBQUMsQ0FBQyxDQUFDLENBQUE7QUFDbEJDLElBQUFBLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBR0YsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUE7QUFDbEJDLElBQUFBLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBR0YsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUE7QUFDbEJDLElBQUFBLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBR0YsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFHQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUE7QUFDckJDLElBQUFBLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBR0YsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFHQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUE7QUFDckJDLElBQUFBLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBR0YsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFHQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUE7QUFDckJDLElBQUFBLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBR0YsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFHQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUE7QUFDckJDLElBQUFBLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBR0YsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFHQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUE7QUFDckJDLElBQUFBLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBR0YsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFHQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUE7QUFFckIsSUFBQSxPQUFPLElBQUksQ0FBQTtBQUNmLEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0VBQ0lFLEdBQUdBLENBQUNKLEdBQUcsRUFBRTtBQUNMLElBQUEsT0FBTyxJQUFJLENBQUNGLElBQUksQ0FBQyxJQUFJLEVBQUVFLEdBQUcsQ0FBQyxDQUFBO0FBQy9CLEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0lLLEVBQUFBLEtBQUtBLEdBQUc7QUFDSjtBQUNBLElBQUEsTUFBTUMsSUFBSSxHQUFHLElBQUksQ0FBQ3BCLFdBQVcsQ0FBQTtJQUM3QixPQUFPLElBQUlvQixJQUFJLEVBQUUsQ0FBQ0MsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFBO0FBQ2hDLEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtFQUNJQSxJQUFJQSxDQUFDUCxHQUFHLEVBQUU7QUFDTixJQUFBLE1BQU1RLEdBQUcsR0FBR1IsR0FBRyxDQUFDYixJQUFJO01BQ2hCc0IsR0FBRyxHQUFHLElBQUksQ0FBQ3RCLElBQUksQ0FBQTtBQUVuQnNCLElBQUFBLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBR0QsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFBO0FBQ2ZDLElBQUFBLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBR0QsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFBO0FBQ2ZDLElBQUFBLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBR0QsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFBO0FBQ2ZDLElBQUFBLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBR0QsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFBO0FBQ2ZDLElBQUFBLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBR0QsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFBO0FBQ2ZDLElBQUFBLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBR0QsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFBO0FBQ2ZDLElBQUFBLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBR0QsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFBO0FBQ2ZDLElBQUFBLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBR0QsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFBO0FBQ2ZDLElBQUFBLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBR0QsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFBO0FBQ2ZDLElBQUFBLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBR0QsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFBO0FBQ2ZDLElBQUFBLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBR0QsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFBO0FBQ2pCQyxJQUFBQSxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUdELEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQTtBQUNqQkMsSUFBQUEsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHRCxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUE7QUFDakJDLElBQUFBLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBR0QsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFBO0FBQ2pCQyxJQUFBQSxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUdELEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQTtBQUNqQkMsSUFBQUEsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHRCxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUE7QUFFakIsSUFBQSxPQUFPLElBQUksQ0FBQTtBQUNmLEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7RUFDSUUsTUFBTUEsQ0FBQ1YsR0FBRyxFQUFFO0FBQ1IsSUFBQSxNQUFNVyxDQUFDLEdBQUcsSUFBSSxDQUFDeEIsSUFBSTtNQUNmZ0IsQ0FBQyxHQUFHSCxHQUFHLENBQUNiLElBQUksQ0FBQTtBQUVoQixJQUFBLE9BQVN3QixDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUtSLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFDYlEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLUixDQUFDLENBQUMsQ0FBQyxDQUFFLElBQ2RRLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBS1IsQ0FBQyxDQUFDLENBQUMsQ0FBRSxJQUNkUSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUtSLENBQUMsQ0FBQyxDQUFDLENBQUUsSUFDZFEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLUixDQUFDLENBQUMsQ0FBQyxDQUFFLElBQ2RRLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBS1IsQ0FBQyxDQUFDLENBQUMsQ0FBRSxJQUNkUSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUtSLENBQUMsQ0FBQyxDQUFDLENBQUUsSUFDZFEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLUixDQUFDLENBQUMsQ0FBQyxDQUFFLElBQ2RRLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBS1IsQ0FBQyxDQUFDLENBQUMsQ0FBRSxJQUNkUSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUtSLENBQUMsQ0FBQyxDQUFDLENBQUUsSUFDZFEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxLQUFLUixDQUFDLENBQUMsRUFBRSxDQUFFLElBQ2hCUSxDQUFDLENBQUMsRUFBRSxDQUFDLEtBQUtSLENBQUMsQ0FBQyxFQUFFLENBQUUsSUFDaEJRLENBQUMsQ0FBQyxFQUFFLENBQUMsS0FBS1IsQ0FBQyxDQUFDLEVBQUUsQ0FBRSxJQUNoQlEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxLQUFLUixDQUFDLENBQUMsRUFBRSxDQUFFLElBQ2hCUSxDQUFDLENBQUMsRUFBRSxDQUFDLEtBQUtSLENBQUMsQ0FBQyxFQUFFLENBQUUsSUFDaEJRLENBQUMsQ0FBQyxFQUFFLENBQUMsS0FBS1IsQ0FBQyxDQUFDLEVBQUUsQ0FBRSxDQUFBO0FBQzdCLEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNJUyxFQUFBQSxVQUFVQSxHQUFHO0FBQ1QsSUFBQSxNQUFNQyxDQUFDLEdBQUcsSUFBSSxDQUFDMUIsSUFBSSxDQUFBO0lBRW5CLE9BQVMwQixDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUNWQSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBRSxJQUNYQSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBRSxJQUNYQSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBRSxJQUNYQSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBRSxJQUNYQSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBRSxJQUNYQSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBRSxJQUNYQSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBRSxJQUNYQSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBRSxJQUNYQSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBRSxJQUNYQSxDQUFDLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBRSxJQUNaQSxDQUFDLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBRSxJQUNaQSxDQUFDLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBRSxJQUNaQSxDQUFDLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBRSxJQUNaQSxDQUFDLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBRSxJQUNaQSxDQUFDLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBRSxDQUFBO0FBQ3pCLEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNJQyxFQUFBQSxJQUFJQSxDQUFDZixHQUFHLEVBQUVDLEdBQUcsRUFBRTtBQUNYLElBQUEsTUFBTUMsQ0FBQyxHQUFHRixHQUFHLENBQUNaLElBQUksQ0FBQTtBQUNsQixJQUFBLE1BQU1lLENBQUMsR0FBR0YsR0FBRyxDQUFDYixJQUFJLENBQUE7QUFDbEIsSUFBQSxNQUFNZ0IsQ0FBQyxHQUFHLElBQUksQ0FBQ2hCLElBQUksQ0FBQTtBQUVuQixJQUFBLE1BQU00QixHQUFHLEdBQUdkLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQTtBQUNoQixJQUFBLE1BQU1lLEdBQUcsR0FBR2YsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFBO0FBQ2hCLElBQUEsTUFBTWdCLEdBQUcsR0FBR2hCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQTtBQUNoQixJQUFBLE1BQU1pQixHQUFHLEdBQUdqQixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUE7QUFDaEIsSUFBQSxNQUFNa0IsR0FBRyxHQUFHbEIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFBO0FBQ2hCLElBQUEsTUFBTW1CLEdBQUcsR0FBR25CLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQTtBQUNoQixJQUFBLE1BQU1vQixHQUFHLEdBQUdwQixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUE7QUFDaEIsSUFBQSxNQUFNcUIsR0FBRyxHQUFHckIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFBO0FBQ2hCLElBQUEsTUFBTXNCLEdBQUcsR0FBR3RCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQTtBQUNoQixJQUFBLE1BQU11QixHQUFHLEdBQUd2QixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUE7QUFDaEIsSUFBQSxNQUFNd0IsR0FBRyxHQUFHeEIsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFBO0FBQ2pCLElBQUEsTUFBTXlCLEdBQUcsR0FBR3pCLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQTtBQUNqQixJQUFBLE1BQU0wQixHQUFHLEdBQUcxQixDQUFDLENBQUMsRUFBRSxDQUFDLENBQUE7QUFDakIsSUFBQSxNQUFNMkIsR0FBRyxHQUFHM0IsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFBO0FBQ2pCLElBQUEsTUFBTTRCLEdBQUcsR0FBRzVCLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQTtBQUNqQixJQUFBLE1BQU02QixHQUFHLEdBQUc3QixDQUFDLENBQUMsRUFBRSxDQUFDLENBQUE7QUFFakIsSUFBQSxJQUFJOEIsRUFBRSxFQUFFQyxFQUFFLEVBQUVDLEVBQUUsRUFBRUMsRUFBRSxDQUFBO0FBRWxCSCxJQUFBQSxFQUFFLEdBQUc3QixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUE7QUFDVDhCLElBQUFBLEVBQUUsR0FBRzlCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQTtBQUNUK0IsSUFBQUEsRUFBRSxHQUFHL0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFBO0FBQ1RnQyxJQUFBQSxFQUFFLEdBQUdoQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUE7QUFDVEMsSUFBQUEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFJWSxHQUFHLEdBQUdnQixFQUFFLEdBQUdaLEdBQUcsR0FBR2EsRUFBRSxHQUFHVCxHQUFHLEdBQUdVLEVBQUUsR0FBR04sR0FBRyxHQUFHTyxFQUFFLENBQUE7QUFDakQvQixJQUFBQSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUlhLEdBQUcsR0FBR2UsRUFBRSxHQUFHWCxHQUFHLEdBQUdZLEVBQUUsR0FBR1IsR0FBRyxHQUFHUyxFQUFFLEdBQUdMLEdBQUcsR0FBR00sRUFBRSxDQUFBO0FBQ2pEL0IsSUFBQUEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFJYyxHQUFHLEdBQUdjLEVBQUUsR0FBR1YsR0FBRyxHQUFHVyxFQUFFLEdBQUdQLEdBQUcsR0FBR1EsRUFBRSxHQUFHSixHQUFHLEdBQUdLLEVBQUUsQ0FBQTtBQUNqRC9CLElBQUFBLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBSWUsR0FBRyxHQUFHYSxFQUFFLEdBQUdULEdBQUcsR0FBR1UsRUFBRSxHQUFHTixHQUFHLEdBQUdPLEVBQUUsR0FBR0gsR0FBRyxHQUFHSSxFQUFFLENBQUE7QUFFakRILElBQUFBLEVBQUUsR0FBRzdCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQTtBQUNUOEIsSUFBQUEsRUFBRSxHQUFHOUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFBO0FBQ1QrQixJQUFBQSxFQUFFLEdBQUcvQixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUE7QUFDVGdDLElBQUFBLEVBQUUsR0FBR2hDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQTtBQUNUQyxJQUFBQSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUlZLEdBQUcsR0FBR2dCLEVBQUUsR0FBR1osR0FBRyxHQUFHYSxFQUFFLEdBQUdULEdBQUcsR0FBR1UsRUFBRSxHQUFHTixHQUFHLEdBQUdPLEVBQUUsQ0FBQTtBQUNqRC9CLElBQUFBLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBSWEsR0FBRyxHQUFHZSxFQUFFLEdBQUdYLEdBQUcsR0FBR1ksRUFBRSxHQUFHUixHQUFHLEdBQUdTLEVBQUUsR0FBR0wsR0FBRyxHQUFHTSxFQUFFLENBQUE7QUFDakQvQixJQUFBQSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUljLEdBQUcsR0FBR2MsRUFBRSxHQUFHVixHQUFHLEdBQUdXLEVBQUUsR0FBR1AsR0FBRyxHQUFHUSxFQUFFLEdBQUdKLEdBQUcsR0FBR0ssRUFBRSxDQUFBO0FBQ2pEL0IsSUFBQUEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFJZSxHQUFHLEdBQUdhLEVBQUUsR0FBR1QsR0FBRyxHQUFHVSxFQUFFLEdBQUdOLEdBQUcsR0FBR08sRUFBRSxHQUFHSCxHQUFHLEdBQUdJLEVBQUUsQ0FBQTtBQUVqREgsSUFBQUEsRUFBRSxHQUFHN0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFBO0FBQ1Q4QixJQUFBQSxFQUFFLEdBQUc5QixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUE7QUFDVCtCLElBQUFBLEVBQUUsR0FBRy9CLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQTtBQUNWZ0MsSUFBQUEsRUFBRSxHQUFHaEMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFBO0FBQ1ZDLElBQUFBLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBSVksR0FBRyxHQUFHZ0IsRUFBRSxHQUFHWixHQUFHLEdBQUdhLEVBQUUsR0FBR1QsR0FBRyxHQUFHVSxFQUFFLEdBQUdOLEdBQUcsR0FBR08sRUFBRSxDQUFBO0FBQ2pEL0IsSUFBQUEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFJYSxHQUFHLEdBQUdlLEVBQUUsR0FBR1gsR0FBRyxHQUFHWSxFQUFFLEdBQUdSLEdBQUcsR0FBR1MsRUFBRSxHQUFHTCxHQUFHLEdBQUdNLEVBQUUsQ0FBQTtBQUNqRC9CLElBQUFBLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBR2MsR0FBRyxHQUFHYyxFQUFFLEdBQUdWLEdBQUcsR0FBR1csRUFBRSxHQUFHUCxHQUFHLEdBQUdRLEVBQUUsR0FBR0osR0FBRyxHQUFHSyxFQUFFLENBQUE7QUFDakQvQixJQUFBQSxDQUFDLENBQUMsRUFBRSxDQUFDLEdBQUdlLEdBQUcsR0FBR2EsRUFBRSxHQUFHVCxHQUFHLEdBQUdVLEVBQUUsR0FBR04sR0FBRyxHQUFHTyxFQUFFLEdBQUdILEdBQUcsR0FBR0ksRUFBRSxDQUFBO0FBRWpESCxJQUFBQSxFQUFFLEdBQUc3QixDQUFDLENBQUMsRUFBRSxDQUFDLENBQUE7QUFDVjhCLElBQUFBLEVBQUUsR0FBRzlCLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQTtBQUNWK0IsSUFBQUEsRUFBRSxHQUFHL0IsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFBO0FBQ1ZnQyxJQUFBQSxFQUFFLEdBQUdoQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUE7QUFDVkMsSUFBQUEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFHWSxHQUFHLEdBQUdnQixFQUFFLEdBQUdaLEdBQUcsR0FBR2EsRUFBRSxHQUFHVCxHQUFHLEdBQUdVLEVBQUUsR0FBR04sR0FBRyxHQUFHTyxFQUFFLENBQUE7QUFDakQvQixJQUFBQSxDQUFDLENBQUMsRUFBRSxDQUFDLEdBQUdhLEdBQUcsR0FBR2UsRUFBRSxHQUFHWCxHQUFHLEdBQUdZLEVBQUUsR0FBR1IsR0FBRyxHQUFHUyxFQUFFLEdBQUdMLEdBQUcsR0FBR00sRUFBRSxDQUFBO0FBQ2pEL0IsSUFBQUEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFHYyxHQUFHLEdBQUdjLEVBQUUsR0FBR1YsR0FBRyxHQUFHVyxFQUFFLEdBQUdQLEdBQUcsR0FBR1EsRUFBRSxHQUFHSixHQUFHLEdBQUdLLEVBQUUsQ0FBQTtBQUNqRC9CLElBQUFBLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBR2UsR0FBRyxHQUFHYSxFQUFFLEdBQUdULEdBQUcsR0FBR1UsRUFBRSxHQUFHTixHQUFHLEdBQUdPLEVBQUUsR0FBR0gsR0FBRyxHQUFHSSxFQUFFLENBQUE7QUFFakQsSUFBQSxPQUFPLElBQUksQ0FBQTtBQUNmLEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNJQyxFQUFBQSxVQUFVQSxDQUFDcEMsR0FBRyxFQUFFQyxHQUFHLEVBQUU7QUFDakIsSUFBQSxNQUFNQyxDQUFDLEdBQUdGLEdBQUcsQ0FBQ1osSUFBSSxDQUFBO0FBQ2xCLElBQUEsTUFBTWUsQ0FBQyxHQUFHRixHQUFHLENBQUNiLElBQUksQ0FBQTtBQUNsQixJQUFBLE1BQU1nQixDQUFDLEdBQUcsSUFBSSxDQUFDaEIsSUFBSSxDQUFBO0FBRW5CLElBQUEsTUFBTTRCLEdBQUcsR0FBR2QsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFBO0FBQ2hCLElBQUEsTUFBTWUsR0FBRyxHQUFHZixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUE7QUFDaEIsSUFBQSxNQUFNZ0IsR0FBRyxHQUFHaEIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFBO0FBQ2hCLElBQUEsTUFBTWtCLEdBQUcsR0FBR2xCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQTtBQUNoQixJQUFBLE1BQU1tQixHQUFHLEdBQUduQixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUE7QUFDaEIsSUFBQSxNQUFNb0IsR0FBRyxHQUFHcEIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFBO0FBQ2hCLElBQUEsTUFBTXNCLEdBQUcsR0FBR3RCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQTtBQUNoQixJQUFBLE1BQU11QixHQUFHLEdBQUd2QixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUE7QUFDaEIsSUFBQSxNQUFNd0IsR0FBRyxHQUFHeEIsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFBO0FBQ2pCLElBQUEsTUFBTTBCLEdBQUcsR0FBRzFCLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQTtBQUNqQixJQUFBLE1BQU0yQixHQUFHLEdBQUczQixDQUFDLENBQUMsRUFBRSxDQUFDLENBQUE7QUFDakIsSUFBQSxNQUFNNEIsR0FBRyxHQUFHNUIsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFBO0FBRWpCLElBQUEsSUFBSThCLEVBQUUsRUFBRUMsRUFBRSxFQUFFQyxFQUFFLENBQUE7QUFFZEYsSUFBQUEsRUFBRSxHQUFHN0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFBO0FBQ1Q4QixJQUFBQSxFQUFFLEdBQUc5QixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUE7QUFDVCtCLElBQUFBLEVBQUUsR0FBRy9CLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQTtBQUNUQyxJQUFBQSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUlZLEdBQUcsR0FBR2dCLEVBQUUsR0FBR1osR0FBRyxHQUFHYSxFQUFFLEdBQUdULEdBQUcsR0FBR1UsRUFBRSxDQUFBO0FBQ3RDOUIsSUFBQUEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFJYSxHQUFHLEdBQUdlLEVBQUUsR0FBR1gsR0FBRyxHQUFHWSxFQUFFLEdBQUdSLEdBQUcsR0FBR1MsRUFBRSxDQUFBO0FBQ3RDOUIsSUFBQUEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFJYyxHQUFHLEdBQUdjLEVBQUUsR0FBR1YsR0FBRyxHQUFHVyxFQUFFLEdBQUdQLEdBQUcsR0FBR1EsRUFBRSxDQUFBO0FBQ3RDOUIsSUFBQUEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQTtBQUVSNEIsSUFBQUEsRUFBRSxHQUFHN0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFBO0FBQ1Q4QixJQUFBQSxFQUFFLEdBQUc5QixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUE7QUFDVCtCLElBQUFBLEVBQUUsR0FBRy9CLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQTtBQUNUQyxJQUFBQSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUlZLEdBQUcsR0FBR2dCLEVBQUUsR0FBR1osR0FBRyxHQUFHYSxFQUFFLEdBQUdULEdBQUcsR0FBR1UsRUFBRSxDQUFBO0FBQ3RDOUIsSUFBQUEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFJYSxHQUFHLEdBQUdlLEVBQUUsR0FBR1gsR0FBRyxHQUFHWSxFQUFFLEdBQUdSLEdBQUcsR0FBR1MsRUFBRSxDQUFBO0FBQ3RDOUIsSUFBQUEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFJYyxHQUFHLEdBQUdjLEVBQUUsR0FBR1YsR0FBRyxHQUFHVyxFQUFFLEdBQUdQLEdBQUcsR0FBR1EsRUFBRSxDQUFBO0FBQ3RDOUIsSUFBQUEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQTtBQUVSNEIsSUFBQUEsRUFBRSxHQUFHN0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFBO0FBQ1Q4QixJQUFBQSxFQUFFLEdBQUc5QixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUE7QUFDVCtCLElBQUFBLEVBQUUsR0FBRy9CLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQTtBQUNWQyxJQUFBQSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUlZLEdBQUcsR0FBR2dCLEVBQUUsR0FBR1osR0FBRyxHQUFHYSxFQUFFLEdBQUdULEdBQUcsR0FBR1UsRUFBRSxDQUFBO0FBQ3RDOUIsSUFBQUEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFJYSxHQUFHLEdBQUdlLEVBQUUsR0FBR1gsR0FBRyxHQUFHWSxFQUFFLEdBQUdSLEdBQUcsR0FBR1MsRUFBRSxDQUFBO0FBQ3RDOUIsSUFBQUEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFHYyxHQUFHLEdBQUdjLEVBQUUsR0FBR1YsR0FBRyxHQUFHVyxFQUFFLEdBQUdQLEdBQUcsR0FBR1EsRUFBRSxDQUFBO0FBQ3RDOUIsSUFBQUEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQTtBQUVUNEIsSUFBQUEsRUFBRSxHQUFHN0IsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFBO0FBQ1Y4QixJQUFBQSxFQUFFLEdBQUc5QixDQUFDLENBQUMsRUFBRSxDQUFDLENBQUE7QUFDVitCLElBQUFBLEVBQUUsR0FBRy9CLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQTtBQUNWQyxJQUFBQSxDQUFDLENBQUMsRUFBRSxDQUFDLEdBQUdZLEdBQUcsR0FBR2dCLEVBQUUsR0FBR1osR0FBRyxHQUFHYSxFQUFFLEdBQUdULEdBQUcsR0FBR1UsRUFBRSxHQUFHTixHQUFHLENBQUE7QUFDNUN4QixJQUFBQSxDQUFDLENBQUMsRUFBRSxDQUFDLEdBQUdhLEdBQUcsR0FBR2UsRUFBRSxHQUFHWCxHQUFHLEdBQUdZLEVBQUUsR0FBR1IsR0FBRyxHQUFHUyxFQUFFLEdBQUdMLEdBQUcsQ0FBQTtBQUM1Q3pCLElBQUFBLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBR2MsR0FBRyxHQUFHYyxFQUFFLEdBQUdWLEdBQUcsR0FBR1csRUFBRSxHQUFHUCxHQUFHLEdBQUdRLEVBQUUsR0FBR0osR0FBRyxDQUFBO0FBQzVDMUIsSUFBQUEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQTtBQUVULElBQUEsT0FBTyxJQUFJLENBQUE7QUFDZixHQUFBOztBQUVBO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7RUFDSWlDLEdBQUdBLENBQUNwQyxHQUFHLEVBQUU7QUFDTCxJQUFBLE9BQU8sSUFBSSxDQUFDYyxJQUFJLENBQUMsSUFBSSxFQUFFZCxHQUFHLENBQUMsQ0FBQTtBQUMvQixHQUFBOztBQUVBO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0VBQ0lxQyxjQUFjQSxDQUFDQyxHQUFHLEVBQUVDLEdBQUcsR0FBRyxJQUFJMUQsSUFBSSxFQUFFLEVBQUU7QUFDbEMsSUFBQSxNQUFNZ0MsQ0FBQyxHQUFHLElBQUksQ0FBQzFCLElBQUksQ0FBQTtBQUVuQixJQUFBLE1BQU1QLENBQUMsR0FBRzBELEdBQUcsQ0FBQzFELENBQUMsQ0FBQTtBQUNmLElBQUEsTUFBTUUsQ0FBQyxHQUFHd0QsR0FBRyxDQUFDeEQsQ0FBQyxDQUFBO0FBQ2YsSUFBQSxNQUFNQyxDQUFDLEdBQUd1RCxHQUFHLENBQUN2RCxDQUFDLENBQUE7SUFFZndELEdBQUcsQ0FBQzNELENBQUMsR0FBR0EsQ0FBQyxHQUFHaUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHL0IsQ0FBQyxHQUFHK0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHOUIsQ0FBQyxHQUFHOEIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHQSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUE7SUFDOUMwQixHQUFHLENBQUN6RCxDQUFDLEdBQUdGLENBQUMsR0FBR2lDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRy9CLENBQUMsR0FBRytCLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRzlCLENBQUMsR0FBRzhCLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBR0EsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFBO0lBQzlDMEIsR0FBRyxDQUFDeEQsQ0FBQyxHQUFHSCxDQUFDLEdBQUdpQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcvQixDQUFDLEdBQUcrQixDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUc5QixDQUFDLEdBQUc4QixDQUFDLENBQUMsRUFBRSxDQUFDLEdBQUdBLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQTtBQUUvQyxJQUFBLE9BQU8wQixHQUFHLENBQUE7QUFDZCxHQUFBOztBQUVBO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0VBQ0lDLGVBQWVBLENBQUNGLEdBQUcsRUFBRUMsR0FBRyxHQUFHLElBQUkxRCxJQUFJLEVBQUUsRUFBRTtBQUNuQyxJQUFBLE1BQU1nQyxDQUFDLEdBQUcsSUFBSSxDQUFDMUIsSUFBSSxDQUFBO0FBRW5CLElBQUEsTUFBTVAsQ0FBQyxHQUFHMEQsR0FBRyxDQUFDMUQsQ0FBQyxDQUFBO0FBQ2YsSUFBQSxNQUFNRSxDQUFDLEdBQUd3RCxHQUFHLENBQUN4RCxDQUFDLENBQUE7QUFDZixJQUFBLE1BQU1DLENBQUMsR0FBR3VELEdBQUcsQ0FBQ3ZELENBQUMsQ0FBQTtJQUVmd0QsR0FBRyxDQUFDM0QsQ0FBQyxHQUFHQSxDQUFDLEdBQUdpQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcvQixDQUFDLEdBQUcrQixDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUc5QixDQUFDLEdBQUc4QixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUE7SUFDdEMwQixHQUFHLENBQUN6RCxDQUFDLEdBQUdGLENBQUMsR0FBR2lDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRy9CLENBQUMsR0FBRytCLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRzlCLENBQUMsR0FBRzhCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQTtJQUN0QzBCLEdBQUcsQ0FBQ3hELENBQUMsR0FBR0gsQ0FBQyxHQUFHaUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHL0IsQ0FBQyxHQUFHK0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHOUIsQ0FBQyxHQUFHOEIsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFBO0FBRXZDLElBQUEsT0FBTzBCLEdBQUcsQ0FBQTtBQUNkLEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7RUFDSUUsYUFBYUEsQ0FBQ0gsR0FBRyxFQUFFQyxHQUFHLEdBQUcsSUFBSUcsSUFBSSxFQUFFLEVBQUU7QUFDakMsSUFBQSxNQUFNN0IsQ0FBQyxHQUFHLElBQUksQ0FBQzFCLElBQUksQ0FBQTtBQUVuQixJQUFBLE1BQU1QLENBQUMsR0FBRzBELEdBQUcsQ0FBQzFELENBQUMsQ0FBQTtBQUNmLElBQUEsTUFBTUUsQ0FBQyxHQUFHd0QsR0FBRyxDQUFDeEQsQ0FBQyxDQUFBO0FBQ2YsSUFBQSxNQUFNQyxDQUFDLEdBQUd1RCxHQUFHLENBQUN2RCxDQUFDLENBQUE7QUFDZixJQUFBLE1BQU00RCxDQUFDLEdBQUdMLEdBQUcsQ0FBQ0ssQ0FBQyxDQUFBO0FBRWZKLElBQUFBLEdBQUcsQ0FBQzNELENBQUMsR0FBR0EsQ0FBQyxHQUFHaUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHL0IsQ0FBQyxHQUFHK0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHOUIsQ0FBQyxHQUFHOEIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHOEIsQ0FBQyxHQUFHOUIsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFBO0FBQ2xEMEIsSUFBQUEsR0FBRyxDQUFDekQsQ0FBQyxHQUFHRixDQUFDLEdBQUdpQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcvQixDQUFDLEdBQUcrQixDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUc5QixDQUFDLEdBQUc4QixDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUc4QixDQUFDLEdBQUc5QixDQUFDLENBQUMsRUFBRSxDQUFDLENBQUE7QUFDbEQwQixJQUFBQSxHQUFHLENBQUN4RCxDQUFDLEdBQUdILENBQUMsR0FBR2lDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRy9CLENBQUMsR0FBRytCLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRzlCLENBQUMsR0FBRzhCLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBRzhCLENBQUMsR0FBRzlCLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQTtBQUNuRDBCLElBQUFBLEdBQUcsQ0FBQ0ksQ0FBQyxHQUFHL0QsQ0FBQyxHQUFHaUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHL0IsQ0FBQyxHQUFHK0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHOUIsQ0FBQyxHQUFHOEIsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFHOEIsQ0FBQyxHQUFHOUIsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFBO0FBRW5ELElBQUEsT0FBTzBCLEdBQUcsQ0FBQTtBQUNkLEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDSUssRUFBQUEsU0FBU0EsQ0FBQ0MsUUFBUSxFQUFFQyxNQUFNLEVBQUVDLEVBQUUsRUFBRTtJQUM1QmhFLENBQUMsQ0FBQ2lFLElBQUksQ0FBQ0gsUUFBUSxFQUFFQyxNQUFNLENBQUMsQ0FBQ0csU0FBUyxFQUFFLENBQUE7SUFDcENuRSxDQUFDLENBQUN5QixJQUFJLENBQUN3QyxFQUFFLENBQUMsQ0FBQ0UsU0FBUyxFQUFFLENBQUE7SUFDdEJyRSxDQUFDLENBQUNzRSxLQUFLLENBQUNwRSxDQUFDLEVBQUVDLENBQUMsQ0FBQyxDQUFDa0UsU0FBUyxFQUFFLENBQUE7QUFDekJuRSxJQUFBQSxDQUFDLENBQUNvRSxLQUFLLENBQUNuRSxDQUFDLEVBQUVILENBQUMsQ0FBQyxDQUFBO0FBRWIsSUFBQSxNQUFNdUIsQ0FBQyxHQUFHLElBQUksQ0FBQ2hCLElBQUksQ0FBQTtBQUVuQmdCLElBQUFBLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBSXZCLENBQUMsQ0FBQ0EsQ0FBQyxDQUFBO0FBQ1h1QixJQUFBQSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUl2QixDQUFDLENBQUNFLENBQUMsQ0FBQTtBQUNYcUIsSUFBQUEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFJdkIsQ0FBQyxDQUFDRyxDQUFDLENBQUE7QUFDWG9CLElBQUFBLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBSSxDQUFDLENBQUE7QUFDVEEsSUFBQUEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFJckIsQ0FBQyxDQUFDRixDQUFDLENBQUE7QUFDWHVCLElBQUFBLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBSXJCLENBQUMsQ0FBQ0EsQ0FBQyxDQUFBO0FBQ1hxQixJQUFBQSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUlyQixDQUFDLENBQUNDLENBQUMsQ0FBQTtBQUNYb0IsSUFBQUEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFJLENBQUMsQ0FBQTtBQUNUQSxJQUFBQSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUlwQixDQUFDLENBQUNILENBQUMsQ0FBQTtBQUNYdUIsSUFBQUEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFJcEIsQ0FBQyxDQUFDRCxDQUFDLENBQUE7QUFDWHFCLElBQUFBLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBR3BCLENBQUMsQ0FBQ0EsQ0FBQyxDQUFBO0FBQ1hvQixJQUFBQSxDQUFDLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFBO0FBQ1RBLElBQUFBLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBRzBDLFFBQVEsQ0FBQ2pFLENBQUMsQ0FBQTtBQUNsQnVCLElBQUFBLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBRzBDLFFBQVEsQ0FBQy9ELENBQUMsQ0FBQTtBQUNsQnFCLElBQUFBLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBRzBDLFFBQVEsQ0FBQzlELENBQUMsQ0FBQTtBQUNsQm9CLElBQUFBLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUE7QUFFVCxJQUFBLE9BQU8sSUFBSSxDQUFBO0FBQ2YsR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0lnRCxFQUFBQSxVQUFVQSxDQUFDQyxJQUFJLEVBQUVDLEtBQUssRUFBRUMsTUFBTSxFQUFFQyxHQUFHLEVBQUU5RCxLQUFLLEVBQUUrRCxJQUFJLEVBQUU7QUFDOUMsSUFBQSxNQUFNQyxLQUFLLEdBQUcsQ0FBQyxHQUFHaEUsS0FBSyxDQUFBO0FBQ3ZCLElBQUEsTUFBTWlFLEtBQUssR0FBR0wsS0FBSyxHQUFHRCxJQUFJLENBQUE7QUFDMUIsSUFBQSxNQUFNTyxLQUFLLEdBQUdKLEdBQUcsR0FBR0QsTUFBTSxDQUFBO0FBQzFCLElBQUEsTUFBTU0sS0FBSyxHQUFHSixJQUFJLEdBQUcvRCxLQUFLLENBQUE7QUFFMUIsSUFBQSxNQUFNVSxDQUFDLEdBQUcsSUFBSSxDQUFDaEIsSUFBSSxDQUFBO0FBQ25CZ0IsSUFBQUEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHc0QsS0FBSyxHQUFHQyxLQUFLLENBQUE7QUFDcEJ2RCxJQUFBQSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFBO0FBQ1JBLElBQUFBLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUE7QUFDUkEsSUFBQUEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQTtBQUNSQSxJQUFBQSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFBO0FBQ1JBLElBQUFBLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBR3NELEtBQUssR0FBR0UsS0FBSyxDQUFBO0FBQ3BCeEQsSUFBQUEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQTtBQUNSQSxJQUFBQSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFBO0lBQ1JBLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDa0QsS0FBSyxHQUFHRCxJQUFJLElBQUlNLEtBQUssQ0FBQTtJQUM3QnZELENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDb0QsR0FBRyxHQUFHRCxNQUFNLElBQUlLLEtBQUssQ0FBQTtJQUM3QnhELENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUNxRCxJQUFJLEdBQUcvRCxLQUFLLElBQUltRSxLQUFLLENBQUE7QUFDL0J6RCxJQUFBQSxDQUFDLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUE7QUFDVkEsSUFBQUEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQTtBQUNUQSxJQUFBQSxDQUFDLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFBO0lBQ1RBLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBSSxDQUFDc0QsS0FBSyxHQUFHRCxJQUFJLEdBQUlJLEtBQUssQ0FBQTtBQUMvQnpELElBQUFBLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUE7QUFFVCxJQUFBLE9BQU8sSUFBSSxDQUFBO0FBQ2YsR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7RUFDSTBELGNBQWNBLENBQUN0RSxHQUFHLEVBQUVDLE1BQU0sRUFBRUMsS0FBSyxFQUFFK0QsSUFBSSxFQUFFOUQsZUFBZSxFQUFFO0FBQ3REVCxJQUFBQSxJQUFJLENBQUNJLHVCQUF1QixDQUFDWCxTQUFTLEVBQUVhLEdBQUcsRUFBRUMsTUFBTSxFQUFFQyxLQUFLLEVBQUVDLGVBQWUsQ0FBQyxDQUFBO0lBQzVFLE9BQU8sSUFBSSxDQUFDeUQsVUFBVSxDQUFDLENBQUN6RSxTQUFTLENBQUNFLENBQUMsRUFBRUYsU0FBUyxDQUFDRSxDQUFDLEVBQUUsQ0FBQ0YsU0FBUyxDQUFDSSxDQUFDLEVBQUVKLFNBQVMsQ0FBQ0ksQ0FBQyxFQUFFVyxLQUFLLEVBQUUrRCxJQUFJLENBQUMsQ0FBQTtBQUM3RixHQUFBOztBQUVBO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0lNLEVBQUFBLFFBQVFBLENBQUNWLElBQUksRUFBRUMsS0FBSyxFQUFFQyxNQUFNLEVBQUVDLEdBQUcsRUFBRVEsSUFBSSxFQUFFQyxHQUFHLEVBQUU7QUFDMUMsSUFBQSxNQUFNN0QsQ0FBQyxHQUFHLElBQUksQ0FBQ2hCLElBQUksQ0FBQTtJQUVuQmdCLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLElBQUlrRCxLQUFLLEdBQUdELElBQUksQ0FBQyxDQUFBO0FBQ3pCakQsSUFBQUEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQTtBQUNSQSxJQUFBQSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFBO0FBQ1JBLElBQUFBLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUE7QUFDUkEsSUFBQUEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQTtJQUNSQSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxJQUFJb0QsR0FBRyxHQUFHRCxNQUFNLENBQUMsQ0FBQTtBQUN6Qm5ELElBQUFBLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUE7QUFDUkEsSUFBQUEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQTtBQUNSQSxJQUFBQSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFBO0FBQ1JBLElBQUFBLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUE7SUFDUkEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJNkQsR0FBRyxHQUFHRCxJQUFJLENBQUMsQ0FBQTtBQUN6QjVELElBQUFBLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUE7QUFDVEEsSUFBQUEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEVBQUVrRCxLQUFLLEdBQUdELElBQUksQ0FBQyxJQUFJQyxLQUFLLEdBQUdELElBQUksQ0FBQyxDQUFBO0FBQ3hDakQsSUFBQUEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEVBQUVvRCxHQUFHLEdBQUdELE1BQU0sQ0FBQyxJQUFJQyxHQUFHLEdBQUdELE1BQU0sQ0FBQyxDQUFBO0FBQ3hDbkQsSUFBQUEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEVBQUU2RCxHQUFHLEdBQUdELElBQUksQ0FBQyxJQUFJQyxHQUFHLEdBQUdELElBQUksQ0FBQyxDQUFBO0FBQ3BDNUQsSUFBQUEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQTtBQUVULElBQUEsT0FBTyxJQUFJLENBQUE7QUFDZixHQUFBOztBQUVBO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDSThELEVBQUFBLGdCQUFnQkEsQ0FBQ0MsSUFBSSxFQUFFQyxLQUFLLEVBQUU7SUFDMUJBLEtBQUssSUFBSUMsSUFBSSxDQUFDQyxVQUFVLENBQUE7QUFFeEIsSUFBQSxNQUFNekYsQ0FBQyxHQUFHc0YsSUFBSSxDQUFDdEYsQ0FBQyxDQUFBO0FBQ2hCLElBQUEsTUFBTUUsQ0FBQyxHQUFHb0YsSUFBSSxDQUFDcEYsQ0FBQyxDQUFBO0FBQ2hCLElBQUEsTUFBTUMsQ0FBQyxHQUFHbUYsSUFBSSxDQUFDbkYsQ0FBQyxDQUFBO0FBQ2hCLElBQUEsTUFBTXVGLENBQUMsR0FBRzNFLElBQUksQ0FBQzRFLEdBQUcsQ0FBQ0osS0FBSyxDQUFDLENBQUE7QUFDekIsSUFBQSxNQUFNSyxDQUFDLEdBQUc3RSxJQUFJLENBQUM4RSxHQUFHLENBQUNOLEtBQUssQ0FBQyxDQUFBO0FBQ3pCLElBQUEsTUFBTU8sQ0FBQyxHQUFHLENBQUMsR0FBR0osQ0FBQyxDQUFBO0FBQ2YsSUFBQSxNQUFNSyxFQUFFLEdBQUdELENBQUMsR0FBRzlGLENBQUMsQ0FBQTtBQUNoQixJQUFBLE1BQU1nRyxFQUFFLEdBQUdGLENBQUMsR0FBRzVGLENBQUMsQ0FBQTtBQUNoQixJQUFBLE1BQU0rQixDQUFDLEdBQUcsSUFBSSxDQUFDMUIsSUFBSSxDQUFBO0lBRW5CMEIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHOEQsRUFBRSxHQUFHL0YsQ0FBQyxHQUFHMEYsQ0FBQyxDQUFBO0lBQ2pCekQsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHOEQsRUFBRSxHQUFHN0YsQ0FBQyxHQUFHMEYsQ0FBQyxHQUFHekYsQ0FBQyxDQUFBO0lBQ3JCOEIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHOEQsRUFBRSxHQUFHNUYsQ0FBQyxHQUFHeUYsQ0FBQyxHQUFHMUYsQ0FBQyxDQUFBO0FBQ3JCK0IsSUFBQUEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQTtJQUNSQSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUc4RCxFQUFFLEdBQUc3RixDQUFDLEdBQUcwRixDQUFDLEdBQUd6RixDQUFDLENBQUE7SUFDckI4QixDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcrRCxFQUFFLEdBQUc5RixDQUFDLEdBQUd3RixDQUFDLENBQUE7SUFDakJ6RCxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcrRCxFQUFFLEdBQUc3RixDQUFDLEdBQUd5RixDQUFDLEdBQUc1RixDQUFDLENBQUE7QUFDckJpQyxJQUFBQSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFBO0lBQ1JBLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRzhELEVBQUUsR0FBRzVGLENBQUMsR0FBR3lGLENBQUMsR0FBRzFGLENBQUMsQ0FBQTtJQUNyQitCLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRytELEVBQUUsR0FBRzdGLENBQUMsR0FBR0gsQ0FBQyxHQUFHNEYsQ0FBQyxDQUFBO0lBQ3JCM0QsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFHNkQsQ0FBQyxHQUFHM0YsQ0FBQyxHQUFHQSxDQUFDLEdBQUd1RixDQUFDLENBQUE7QUFDckJ6RCxJQUFBQSxDQUFDLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFBO0FBQ1RBLElBQUFBLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUE7QUFDVEEsSUFBQUEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQTtBQUNUQSxJQUFBQSxDQUFDLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFBO0FBQ1RBLElBQUFBLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUE7QUFFVCxJQUFBLE9BQU8sSUFBSSxDQUFBO0FBQ2YsR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDSWdFLEVBQUFBLFlBQVlBLENBQUNqRyxDQUFDLEVBQUVFLENBQUMsRUFBRUMsQ0FBQyxFQUFFO0FBQ2xCLElBQUEsTUFBTThCLENBQUMsR0FBRyxJQUFJLENBQUMxQixJQUFJLENBQUE7QUFFbkIwQixJQUFBQSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFBO0FBQ1JBLElBQUFBLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUE7QUFDUkEsSUFBQUEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQTtBQUNSQSxJQUFBQSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFBO0FBQ1JBLElBQUFBLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUE7QUFDUkEsSUFBQUEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQTtBQUNSQSxJQUFBQSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFBO0FBQ1JBLElBQUFBLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUE7QUFDUkEsSUFBQUEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQTtBQUNSQSxJQUFBQSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFBO0FBQ1JBLElBQUFBLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUE7QUFDVEEsSUFBQUEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQTtBQUNUQSxJQUFBQSxDQUFDLENBQUMsRUFBRSxDQUFDLEdBQUdqQyxDQUFDLENBQUE7QUFDVGlDLElBQUFBLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBRy9CLENBQUMsQ0FBQTtBQUNUK0IsSUFBQUEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFHOUIsQ0FBQyxDQUFBO0FBQ1Q4QixJQUFBQSxDQUFDLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFBO0FBRVQsSUFBQSxPQUFPLElBQUksQ0FBQTtBQUNmLEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0lpRSxFQUFBQSxRQUFRQSxDQUFDbEcsQ0FBQyxFQUFFRSxDQUFDLEVBQUVDLENBQUMsRUFBRTtBQUNkLElBQUEsTUFBTThCLENBQUMsR0FBRyxJQUFJLENBQUMxQixJQUFJLENBQUE7QUFFbkIwQixJQUFBQSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUdqQyxDQUFDLENBQUE7QUFDUmlDLElBQUFBLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUE7QUFDUkEsSUFBQUEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQTtBQUNSQSxJQUFBQSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFBO0FBQ1JBLElBQUFBLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUE7QUFDUkEsSUFBQUEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHL0IsQ0FBQyxDQUFBO0FBQ1IrQixJQUFBQSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFBO0FBQ1JBLElBQUFBLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUE7QUFDUkEsSUFBQUEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQTtBQUNSQSxJQUFBQSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFBO0FBQ1JBLElBQUFBLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBRzlCLENBQUMsQ0FBQTtBQUNUOEIsSUFBQUEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQTtBQUNUQSxJQUFBQSxDQUFDLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFBO0FBQ1RBLElBQUFBLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUE7QUFDVEEsSUFBQUEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQTtBQUNUQSxJQUFBQSxDQUFDLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFBO0FBRVQsSUFBQSxPQUFPLElBQUksQ0FBQTtBQUNmLEdBQUE7O0FBRUE7QUFDSjtB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LENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQTtBQUNSQSxJQUFBQSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFBO0FBQ1JBLElBQUFBLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUE7QUFDUkEsSUFBQUEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQTtBQUNSQSxJQUFBQSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFBO0FBQ1JBLElBQUFBLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUE7QUFDUkEsSUFBQUEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQTtBQUNSQSxJQUFBQSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFBO0FBQ1JBLElBQUFBLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUE7QUFDVEEsSUFBQUEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQTtBQUNUQSxJQUFBQSxDQUFDLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFBO0FBQ1RBLElBQUFBLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUE7QUFDVEEsSUFBQUEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQTtBQUNUQSxJQUFBQSxDQUFDLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFBO0FBRVQsSUFBQSxPQUFPLElBQUksQ0FBQTtBQUNmLEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDSXlGLEVBQUFBLE1BQU1BLENBQUM1QixDQUFDLEVBQUV2RSxDQUFDLEVBQUVxRSxDQUFDLEVBQUU7QUFDWixJQUFBLE1BQU0rQixFQUFFLEdBQUdwRyxDQUFDLENBQUN2QixDQUFDLENBQUE7QUFDZCxJQUFBLE1BQU00SCxFQUFFLEdBQUdyRyxDQUFDLENB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QUdGLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQTtBQUNaRSxNQUFBQSxDQUFDLENBQUMsRUFBRSxDQUFDLEdBQUdpRCxHQUFHLENBQUE7QUFFWEEsTUFBQUEsR0FBRyxHQUFHbkQsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFBO0FBQ1ZFLE1BQUFBLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBR0YsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFBO0FBQ1hFLE1BQUFBLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBR2lELEdBQUcsQ0FBQTtBQUVWQSxNQUFBQSxHQUFHLEdBQUduRCxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUE7QUFDVkUsTUFBQUEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHRixDQUFDLENBQUMsRUFBRSxDQUFDLENBQUE7QUFDWkUsTUFBQUEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFHaUQsR0FBRyxDQUFBO0FBRVhBLE1BQUFBLEdBQUcsR0FBR25ELENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQTtBQUNYRSxNQUFBQSxDQUFDLENBQUMsRUFBRSxDQUFDLEdBQUdGLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQTtBQUNiRSxNQUFBQSxDQUFDLENBQUMsRUFBRSxDQUFDLEdBQUdpRCxHQUFHLENBQUE7QUFDZixLQUFDLE1BQU07QUFDSGpELE1BQUFBLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBR0YsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFBO0FBQ1hFLE1BQUFBLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBR0YsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFBO0FBQ1hFLE1BQUFBLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBR0YsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFBO0FBQ1hFLE1BQUFBLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBR0YsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFBO0FBQ1pFLE1BQUFBLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBR0YsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFBO0FBQ1hFLE1BQUFBLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBR0YsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFBO0FBQ1hFLE1BQUFBLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBR0YsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFBO0FBQ1hFLE1BQUFBLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBR0YsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFBO0FBQ1pFLE1BQUFBLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBR0YsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFBO0FBQ1hFLE1BQUFBLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBR0YsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFBO0FBQ1hFLE1BQUFBLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBR0YsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFBO0FBQ2JFLE1BQUFBLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBR0YsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFBO0FBQ2JFLE1BQUFBLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBR0YsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFBO0FBQ1pFLE1BQUFBLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBR0YsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFBO0FBQ1pFLE1BQUFBLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBR0YsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFBO0FBQ2JFLE1BQUFBLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBR0YsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFBO0FBQ2pCLEtBQUE7QUFFQSxJQUFBLE9BQU8sSUFBSSxDQUFBO0FBQ2YsR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNJb0QsRUFBQUEsY0FBY0EsQ0FBQ2xELENBQUMsR0FBRyxJQUFJN0YsSUFBSSxFQUFFLEVBQUU7SUFDM0IsT0FBTzZGLENBQUMsQ0FBQzJCLEdBQUcsQ0FBQyxJQUFJLENBQUNsSCxJQUFJLENBQUMsRUFBRSxDQUFDLEVBQUUsSUFBSSxDQUFDQSxJQUFJLENBQUMsRUFBRSxDQUFDLEVBQUUsSUFBSSxDQUFDQSxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQTtBQUM3RCxHQUFBOztBQUVBO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0kwSSxFQUFBQSxJQUFJQSxDQUFDakosQ0FBQyxHQUFHLElBQUlDLElBQUksRUFBRSxFQUFFO0lBQ2pCLE9BQU9ELENBQUMsQ0FBQ3lILEdBQUcsQ0FBQyxJQUFJLENBQUNsSCxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDQSxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDQSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQTtBQUMxRCxHQUFBOztBQUVBO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0kySSxFQUFBQSxJQUFJQSxDQUFDaEosQ0FBQyxHQUFHLElBQUlELElBQUksRUFBRSxFQUFFO0lBQ2pCLE9BQU9DLENBQUMsQ0FBQ3VILEdBQUcsQ0FBQyxJQUFJLENBQUNsSCxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDQSxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDQSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQTtBQUMxRCxHQUFBOztBQUVBO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0k0SSxFQUFBQSxJQUFJQSxDQUFDaEosQ0FBQyxHQUFHLElBQUlGLElBQUksRUFBRSxFQUFFO0lBQ2pCLE9BQU9FLENBQUMsQ0FBQ3NILEdBQUcsQ0FBQyxJQUFJLENBQUNsSCxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDQSxJQUFJLENBQUMsQ0FBQyxD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QUFFLEVBQUU5RixDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUc4RixFQUFFLENBQUMsQ0FBQTtBQUN4QyxPQUFDLE1BQU07QUFDSDtBQUNBNUgsUUFBQUEsQ0FBQyxHQUFHLENBQUMsQ0FBQTtBQUNMSCxRQUFBQSxDQUFDLEdBQUcsQ0FBQ2UsSUFBSSxDQUFDdUosS0FBSyxDQUFDckksQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHK0YsRUFBRSxFQUFFL0YsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHK0YsRUFBRSxDQUFDLENBQUE7QUFDekMsT0FBQTtBQUNKLEtBQUMsTUFBTTtBQUNIO0FBQ0E3SCxNQUFBQSxDQUFDLEdBQUcsQ0FBQyxDQUFBO0FBQ0xILE1BQUFBLENBQUMsR0FBR2UsSUFBSSxDQUFDdUosS0FBSyxDQUFDckksQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHK0YsRUFBRSxFQUFFL0YsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHK0YsRUFBRSxDQUFDLENBQUE7QUFDeEMsS0FBQTtBQUVBLElBQUEsT0FBT21DLE1BQU0sQ0FBQzFDLEdBQUcsQ0FBQ3pILENBQUMsRUFBRUUsQ0FBQyxFQUFFQyxDQUFDLENBQUMsQ0FBQ29LLFNBQVMsQ0FBQy9FLElBQUksQ0FBQ2dGLFVBQVUsQ0FBQyxDQUFBO0FBQ3pELEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0lDLEVBQUFBLFFBQVFBLEdBQUc7SUFDUCxPQUFPLEdBQUcsR0FBRyxJQUFJLENBQUNsSyxJQUFJLENBQUNtSyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsR0FBRyxDQUFBO0FBQzNDLEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBVUEsQ0FBQTtBQXp3Q01ySyxJQUFJLENBZ3dDQ3NLLFFBQVEsR0FBR0MsTUFBTSxDQUFDQyxNQUFNLENBQUMsSUFBSXhLLElBQUksRUFBRSxDQUFDLENBQUE7QUFFM0M7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBdndDTUEsSUFBSSxDQXd3Q0N5SyxJQUFJLEdBQUdGLE1BQU0sQ0FBQ0MsTUFBTSxDQUFDLElBQUl4SyxJQUFJLEVBQUUsQ0FBQ29ILEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7Ozs7In0=
