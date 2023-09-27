/**
 * 3-dimensional vector.
 *
 * @category Math
 */
class Vec3 {
  /**
   * Creates a new Vec3 object.
   *
   * @param {number|number[]} [x] - The x value. Defaults to 0. If x is an array of length 3, the
   * array will be used to populate all components.
   * @param {number} [y] - The y value. Defaults to 0.
   * @param {number} [z] - The z value. Defaults to 0.
   * @example
   * const v = new pc.Vec3(1, 2, 3);
   */
  constructor(x = 0, y = 0, z = 0) {
    /**
     * The first component of the vector.
     *
     * @type {number}
     */
    this.x = void 0;
    /**
     * The second component of the vector.
     *
     * @type {number}
     */
    this.y = void 0;
    /**
     * The third component of the vector.
     *
     * @type {number}
     */
    this.z = void 0;
    if (x.length === 3) {
      this.x = x[0];
      this.y = x[1];
      this.z = x[2];
    } else {
      this.x = x;
      this.y = y;
      this.z = z;
    }
  }

  /**
   * Adds a 3-dimensional vector to another in place.
   *
   * @param {Vec3} rhs - The vector to add to the specified vector.
   * @returns {Vec3} Self for chaining.
   * @example
   * const a = new pc.Vec3(10, 10, 10);
   * const b = new pc.Vec3(20, 20, 20);
   *
   * a.add(b);
   *
   * // Outputs [30, 30, 30]
   * console.log("The result of the addition is: " + a.toString());
   */
  add(rhs) {
    this.x += rhs.x;
    this.y += rhs.y;
    this.z += rhs.z;
    return this;
  }

  /**
   * Adds two 3-dimensional vectors together and returns the result.
   *
   * @param {Vec3} lhs - The first vector operand for the addition.
   * @param {Vec3} rhs - The second vector operand for the addition.
   * @returns {Vec3} Self for chaining.
   * @example
   * const a = new pc.Vec3(10, 10, 10);
   * const b = new pc.Vec3(20, 20, 20);
   * const r = new pc.Vec3();
   *
   * r.add2(a, b);
   * // Outputs [30, 30, 30]
   *
   * console.log("The result of the addition is: " + r.toString());
   */
  add2(lhs, rhs) {
    this.x = lhs.x + rhs.x;
    this.y = lhs.y + rhs.y;
    this.z = lhs.z + rhs.z;
    return this;
  }

  /**
   * Adds a number to each element of a vector.
   *
   * @param {number} scalar - The number to add.
   * @returns {Vec3} Self for chaining.
   * @example
   * const vec = new pc.Vec3(3, 4, 5);
   *
   * vec.addScalar(2);
   *
   * // Outputs [5, 6, 7]
   * console.log("The result of the addition is: " + vec.toString());
   */
  addScalar(scalar) {
    this.x += scalar;
    this.y += scalar;
    this.z += scalar;
    return this;
  }

  /**
   * Returns an identical copy of the specified 3-dimensional vector.
   *
   * @returns {this} A 3-dimensional vector containing the result of the cloning.
   * @example
   * const v = new pc.Vec3(10, 20, 30);
   * const vclone = v.clone();
   * console.log("The result of the cloning is: " + vclone.toString());
   */
  clone() {
    /** @type {this} */
    const cstr = this.constructor;
    return new cstr(this.x, this.y, this.z);
  }

  /**
   * Copies the contents of a source 3-dimensional vector to a destination 3-dimensional vector.
   *
   * @param {Vec3} rhs - A vector to copy to the specified vector.
   * @returns {Vec3} Self for chaining.
   * @example
   * const src = new pc.Vec3(10, 20, 30);
   * const dst = new pc.Vec3();
   *
   * dst.copy(src);
   *
   * console.log("The two vectors are " + (dst.equals(src) ? "equal" : "different"));
   */
  copy(rhs) {
    this.x = rhs.x;
    this.y = rhs.y;
    this.z = rhs.z;
    return this;
  }

  /**
   * Returns the result of a cross product operation performed on the two specified 3-dimensional
   * vectors.
   *
   * @param {Vec3} lhs - The first 3-dimensional vector operand of the cross product.
   * @param {Vec3} rhs - The second 3-dimensional vector operand of the cross product.
   * @returns {Vec3} Self for chaining.
   * @example
   * const back = new pc.Vec3().cross(pc.Vec3.RIGHT, pc.Vec3.UP);
   *
   * // Prints the Z axis (i.e. [0, 0, 1])
   * console.log("The result of the cross product is: " + back.toString());
   */
  cross(lhs, rhs) {
    // Create temporary variables in case lhs or rhs are 'this'
    const lx = lhs.x;
    const ly = lhs.y;
    const lz = lhs.z;
    const rx = rhs.x;
    const ry = rhs.y;
    const rz = rhs.z;
    this.x = ly * rz - ry * lz;
    this.y = lz * rx - rz * lx;
    this.z = lx * ry - rx * ly;
    return this;
  }

  /**
   * Returns the distance between the two specified 3-dimensional vectors.
   *
   * @param {Vec3} rhs - The second 3-dimensional vector to test.
   * @returns {number} The distance between the two vectors.
   * @example
   * const v1 = new pc.Vec3(5, 10, 20);
   * const v2 = new pc.Vec3(10, 20, 40);
   * const d = v1.distance(v2);
   * console.log("The distance between v1 and v2 is: " + d);
   */
  distance(rhs) {
    const x = this.x - rhs.x;
    const y = this.y - rhs.y;
    const z = this.z - rhs.z;
    return Math.sqrt(x * x + y * y + z * z);
  }

  /**
   * Divides a 3-dimensional vector by another in place.
   *
   * @param {Vec3} rhs - The vector to divide the specified vector by.
   * @returns {Vec3} Self for chaining.
   * @example
   * const a = new pc.Vec3(4, 9, 16);
   * const b = new pc.Vec3(2, 3, 4);
   *
   * a.div(b);
   *
   * // Outputs [2, 3, 4]
   * console.log("The result of the division is: " + a.toString());
   */
  div(rhs) {
    this.x /= rhs.x;
    this.y /= rhs.y;
    this.z /= rhs.z;
    return this;
  }

  /**
   * Divides one 3-dimensional vector by another and writes the result to the specified vector.
   *
   * @param {Vec3} lhs - The dividend vector (the vector being divided).
   * @param {Vec3} rhs - The divisor vector (the vector dividing the dividend).
   * @returns {Vec3} Self for chaining.
   * @example
   * const a = new pc.Vec3(4, 9, 16);
   * const b = new pc.Vec3(2, 3, 4);
   * const r = new pc.Vec3();
   *
   * r.div2(a, b);
   * // Outputs [2, 3, 4]
   *
   * console.log("The result of the division is: " + r.toString());
   */
  div2(lhs, rhs) {
    this.x = lhs.x / rhs.x;
    this.y = lhs.y / rhs.y;
    this.z = lhs.z / rhs.z;
    return this;
  }

  /**
   * Divides each element of a vector by a number.
   *
   * @param {number} scalar - The number to divide by.
   * @returns {Vec3} Self for chaining.
   * @example
   * const vec = new pc.Vec3(3, 6, 9);
   *
   * vec.divScalar(3);
   *
   * // Outputs [1, 2, 3]
   * console.log("The result of the division is: " + vec.toString());
   */
  divScalar(scalar) {
    this.x /= scalar;
    this.y /= scalar;
    this.z /= scalar;
    return this;
  }

  /**
   * Returns the result of a dot product operation performed on the two specified 3-dimensional
   * vectors.
   *
   * @param {Vec3} rhs - The second 3-dimensional vector operand of the dot product.
   * @returns {number} The result of the dot product operation.
   * @example
   * const v1 = new pc.Vec3(5, 10, 20);
   * const v2 = new pc.Vec3(10, 20, 40);
   * const v1dotv2 = v1.dot(v2);
   * console.log("The result of the dot product is: " + v1dotv2);
   */
  dot(rhs) {
    return this.x * rhs.x + this.y * rhs.y + this.z * rhs.z;
  }

  /**
   * Reports whether two vectors are equal.
   *
   * @param {Vec3} rhs - The vector to compare to the specified vector.
   * @returns {boolean} True if the vectors are equal and false otherwise.
   * @example
   * const a = new pc.Vec3(1, 2, 3);
   * const b = new pc.Vec3(4, 5, 6);
   * console.log("The two vectors are " + (a.equals(b) ? "equal" : "different"));
   */
  equals(rhs) {
    return this.x === rhs.x && this.y === rhs.y && this.z === rhs.z;
  }

  /**
   * Returns the magnitude of the specified 3-dimensional vector.
   *
   * @returns {number} The magnitude of the specified 3-dimensional vector.
   * @example
   * const vec = new pc.Vec3(3, 4, 0);
   * const len = vec.length();
   * // Outputs 5
   * console.log("The length of the vector is: " + len);
   */
  length() {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
  }

  /**
   * Returns the magnitude squared of the specified 3-dimensional vector.
   *
   * @returns {number} The magnitude of the specified 3-dimensional vector.
   * @example
   * const vec = new pc.Vec3(3, 4, 0);
   * const len = vec.lengthSq();
   * // Outputs 25
   * console.log("The length squared of the vector is: " + len);
   */
  lengthSq() {
    return this.x * this.x + this.y * this.y + this.z * this.z;
  }

  /**
   * Returns the result of a linear interpolation between two specified 3-dimensional vectors.
   *
   * @param {Vec3} lhs - The 3-dimensional to interpolate from.
   * @param {Vec3} rhs - The 3-dimensional to interpolate to.
   * @param {number} alpha - The value controlling the point of interpolation. Between 0 and 1,
   * the linear interpolant will occur on a straight line between lhs and rhs. Outside of this
   * range, the linear interpolant will occur on a ray extrapolated from this line.
   * @returns {Vec3} Self for chaining.
   * @example
   * const a = new pc.Vec3(0, 0, 0);
   * const b = new pc.Vec3(10, 10, 10);
   * const r = new pc.Vec3();
   *
   * r.lerp(a, b, 0);   // r is equal to a
   * r.lerp(a, b, 0.5); // r is 5, 5, 5
   * r.lerp(a, b, 1);   // r is equal to b
   */
  lerp(lhs, rhs, alpha) {
    this.x = lhs.x + alpha * (rhs.x - lhs.x);
    this.y = lhs.y + alpha * (rhs.y - lhs.y);
    this.z = lhs.z + alpha * (rhs.z - lhs.z);
    return this;
  }

  /**
   * Multiplies a 3-dimensional vector to another in place.
   *
   * @param {Vec3} rhs - The 3-dimensional vector used as the second multiplicand of the operation.
   * @returns {Vec3} Self for chaining.
   * @example
   * const a = new pc.Vec3(2, 3, 4);
   * const b = new pc.Vec3(4, 5, 6);
   *
   * a.mul(b);
   *
   * // Outputs 8, 15, 24
   * console.log("The result of the multiplication is: " + a.toString());
   */
  mul(rhs) {
    this.x *= rhs.x;
    this.y *= rhs.y;
    this.z *= rhs.z;
    return this;
  }

  /**
   * Returns the result of multiplying the specified 3-dimensional vectors together.
   *
   * @param {Vec3} lhs - The 3-dimensional vector used as the first multiplicand of the operation.
   * @param {Vec3} rhs - The 3-dimensional vector used as the second multiplicand of the operation.
   * @returns {Vec3} Self for chaining.
   * @example
   * const a = new pc.Vec3(2, 3, 4);
   * const b = new pc.Vec3(4, 5, 6);
   * const r = new pc.Vec3();
   *
   * r.mul2(a, b);
   *
   * // Outputs 8, 15, 24
   * console.log("The result of the multiplication is: " + r.toString());
   */
  mul2(lhs, rhs) {
    this.x = lhs.x * rhs.x;
    this.y = lhs.y * rhs.y;
    this.z = lhs.z * rhs.z;
    return this;
  }

  /**
   * Multiplies each element of a vector by a number.
   *
   * @param {number} scalar - The number to multiply by.
   * @returns {Vec3} Self for chaining.
   * @example
   * const vec = new pc.Vec3(3, 6, 9);
   *
   * vec.mulScalar(3);
   *
   * // Outputs [9, 18, 27]
   * console.log("The result of the multiplication is: " + vec.toString());
   */
  mulScalar(scalar) {
    this.x *= scalar;
    this.y *= scalar;
    this.z *= scalar;
    return this;
  }

  /**
   * Returns this 3-dimensional vector converted to a unit vector in place. If the vector has a
   * length of zero, the vector's elements will be set to zero.
   *
   * @param {Vec3} [src] - The vector to normalize. If not set, the operation is done in place.
   * @returns {Vec3} Self for chaining.
   * @example
   * const v = new pc.Vec3(25, 0, 0);
   *
   * v.normalize();
   *
   * // Outputs 1, 0, 0
   * console.log("The result of the vector normalization is: " + v.toString());
   */
  normalize(src = this) {
    const lengthSq = src.x * src.x + src.y * src.y + src.z * src.z;
    if (lengthSq > 0) {
      const invLength = 1 / Math.sqrt(lengthSq);
      this.x = src.x * invLength;
      this.y = src.y * invLength;
      this.z = src.z * invLength;
    }
    return this;
  }

  /**
   * Each element is set to the largest integer less than or equal to its value.
   *
   * @param {Vec3} [src] - The vector to floor. If not set, the operation is done in place.
   * @returns {Vec3} Self for chaining.
   */
  floor(src = this) {
    this.x = Math.floor(src.x);
    this.y = Math.floor(src.y);
    this.z = Math.floor(src.z);
    return this;
  }

  /**
   * Each element is rounded up to the next largest integer.
   *
   * @param {Vec3} [src] - The vector to ceil. If not set, the operation is done in place.
   * @returns {Vec3} Self for chaining.
   */
  ceil(src = this) {
    this.x = Math.ceil(src.x);
    this.y = Math.ceil(src.y);
    this.z = Math.ceil(src.z);
    return this;
  }

  /**
   * Each element is rounded up or down to the nearest integer.
   *
   * @param {Vec3} [src] - The vector to round. If not set, the operation is done in place.
   * @returns {Vec3} Self for chaining.
   */
  round(src = this) {
    this.x = Math.round(src.x);
    this.y = Math.round(src.y);
    this.z = Math.round(src.z);
    return this;
  }

  /**
   * Each element is assigned a value from rhs parameter if it is smaller.
   *
   * @param {Vec3} rhs - The 3-dimensional vector used as the source of elements to compare to.
   * @returns {Vec3} Self for chaining.
   */
  min(rhs) {
    if (rhs.x < this.x) this.x = rhs.x;
    if (rhs.y < this.y) this.y = rhs.y;
    if (rhs.z < this.z) this.z = rhs.z;
    return this;
  }

  /**
   * Each element is assigned a value from rhs parameter if it is larger.
   *
   * @param {Vec3} rhs - The 3-dimensional vector used as the source of elements to compare to.
   * @returns {Vec3} Self for chaining.
   */
  max(rhs) {
    if (rhs.x > this.x) this.x = rhs.x;
    if (rhs.y > this.y) this.y = rhs.y;
    if (rhs.z > this.z) this.z = rhs.z;
    return this;
  }

  /**
   * Projects this 3-dimensional vector onto the specified vector.
   *
   * @param {Vec3} rhs - The vector onto which the original vector will be projected on.
   * @returns {Vec3} Self for chaining.
   * @example
   * const v = new pc.Vec3(5, 5, 5);
   * const normal = new pc.Vec3(1, 0, 0);
   *
   * v.project(normal);
   *
   * // Outputs 5, 0, 0
   * console.log("The result of the vector projection is: " + v.toString());
   */
  project(rhs) {
    const a_dot_b = this.x * rhs.x + this.y * rhs.y + this.z * rhs.z;
    const b_dot_b = rhs.x * rhs.x + rhs.y * rhs.y + rhs.z * rhs.z;
    const s = a_dot_b / b_dot_b;
    this.x = rhs.x * s;
    this.y = rhs.y * s;
    this.z = rhs.z * s;
    return this;
  }

  /**
   * Sets the specified 3-dimensional vector to the supplied numerical values.
   *
   * @param {number} x - The value to set on the first component of the vector.
   * @param {number} y - The value to set on the second component of the vector.
   * @param {number} z - The value to set on the third component of the vector.
   * @returns {Vec3} Self for chaining.
   * @example
   * const v = new pc.Vec3();
   * v.set(5, 10, 20);
   *
   * // Outputs 5, 10, 20
   * console.log("The result of the vector set is: " + v.toString());
   */
  set(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  /**
   * Subtracts a 3-dimensional vector from another in place.
   *
   * @param {Vec3} rhs - The vector to subtract from the specified vector.
   * @returns {Vec3} Self for chaining.
   * @example
   * const a = new pc.Vec3(10, 10, 10);
   * const b = new pc.Vec3(20, 20, 20);
   *
   * a.sub(b);
   *
   * // Outputs [-10, -10, -10]
   * console.log("The result of the subtraction is: " + a.toString());
   */
  sub(rhs) {
    this.x -= rhs.x;
    this.y -= rhs.y;
    this.z -= rhs.z;
    return this;
  }

  /**
   * Subtracts two 3-dimensional vectors from one another and returns the result.
   *
   * @param {Vec3} lhs - The first vector operand for the subtraction.
   * @param {Vec3} rhs - The second vector operand for the subtraction.
   * @returns {Vec3} Self for chaining.
   * @example
   * const a = new pc.Vec3(10, 10, 10);
   * const b = new pc.Vec3(20, 20, 20);
   * const r = new pc.Vec3();
   *
   * r.sub2(a, b);
   *
   * // Outputs [-10, -10, -10]
   * console.log("The result of the subtraction is: " + r.toString());
   */
  sub2(lhs, rhs) {
    this.x = lhs.x - rhs.x;
    this.y = lhs.y - rhs.y;
    this.z = lhs.z - rhs.z;
    return this;
  }

  /**
   * Subtracts a number from each element of a vector.
   *
   * @param {number} scalar - The number to subtract.
   * @returns {Vec3} Self for chaining.
   * @example
   * const vec = new pc.Vec3(3, 4, 5);
   *
   * vec.subScalar(2);
   *
   * // Outputs [1, 2, 3]
   * console.log("The result of the subtraction is: " + vec.toString());
   */
  subScalar(scalar) {
    this.x -= scalar;
    this.y -= scalar;
    this.z -= scalar;
    return this;
  }

  /**
   * Converts the vector to string form.
   *
   * @returns {string} The vector in string form.
   * @example
   * const v = new pc.Vec3(20, 10, 5);
   * // Outputs [20, 10, 5]
   * console.log(v.toString());
   */
  toString() {
    return `[${this.x}, ${this.y}, ${this.z}]`;
  }

  /**
   * A constant vector set to [0, 0, 0].
   *
   * @type {Vec3}
   * @readonly
   */
}
Vec3.ZERO = Object.freeze(new Vec3(0, 0, 0));
/**
 * A constant vector set to [1, 1, 1].
 *
 * @type {Vec3}
 * @readonly
 */
Vec3.ONE = Object.freeze(new Vec3(1, 1, 1));
/**
 * A constant vector set to [0, 1, 0].
 *
 * @type {Vec3}
 * @readonly
 */
Vec3.UP = Object.freeze(new Vec3(0, 1, 0));
/**
 * A constant vector set to [0, -1, 0].
 *
 * @type {Vec3}
 * @readonly
 */
Vec3.DOWN = Object.freeze(new Vec3(0, -1, 0));
/**
 * A constant vector set to [1, 0, 0].
 *
 * @type {Vec3}
 * @readonly
 */
Vec3.RIGHT = Object.freeze(new Vec3(1, 0, 0));
/**
 * A constant vector set to [-1, 0, 0].
 *
 * @type {Vec3}
 * @readonly
 */
Vec3.LEFT = Object.freeze(new Vec3(-1, 0, 0));
/**
 * A constant vector set to [0, 0, -1].
 *
 * @type {Vec3}
 * @readonly
 */
Vec3.FORWARD = Object.freeze(new Vec3(0, 0, -1));
/**
 * A constant vector set to [0, 0, 1].
 *
 * @type {Vec3}
 * @readonly
 */
Vec3.BACK = Object.freeze(new Vec3(0, 0, 1));

export { Vec3 };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmVjMy5qcyIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL2NvcmUvbWF0aC92ZWMzLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogMy1kaW1lbnNpb25hbCB2ZWN0b3IuXG4gKlxuICogQGNhdGVnb3J5IE1hdGhcbiAqL1xuY2xhc3MgVmVjMyB7XG4gICAgLyoqXG4gICAgICogVGhlIGZpcnN0IGNvbXBvbmVudCBvZiB0aGUgdmVjdG9yLlxuICAgICAqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKi9cbiAgICB4O1xuXG4gICAgLyoqXG4gICAgICogVGhlIHNlY29uZCBjb21wb25lbnQgb2YgdGhlIHZlY3Rvci5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtudW1iZXJ9XG4gICAgICovXG4gICAgeTtcblxuICAgIC8qKlxuICAgICAqIFRoZSB0aGlyZCBjb21wb25lbnQgb2YgdGhlIHZlY3Rvci5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtudW1iZXJ9XG4gICAgICovXG4gICAgejtcblxuICAgIC8qKlxuICAgICAqIENyZWF0ZXMgYSBuZXcgVmVjMyBvYmplY3QuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge251bWJlcnxudW1iZXJbXX0gW3hdIC0gVGhlIHggdmFsdWUuIERlZmF1bHRzIHRvIDAuIElmIHggaXMgYW4gYXJyYXkgb2YgbGVuZ3RoIDMsIHRoZVxuICAgICAqIGFycmF5IHdpbGwgYmUgdXNlZCB0byBwb3B1bGF0ZSBhbGwgY29tcG9uZW50cy5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gW3ldIC0gVGhlIHkgdmFsdWUuIERlZmF1bHRzIHRvIDAuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFt6XSAtIFRoZSB6IHZhbHVlLiBEZWZhdWx0cyB0byAwLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogY29uc3QgdiA9IG5ldyBwYy5WZWMzKDEsIDIsIDMpO1xuICAgICAqL1xuICAgIGNvbnN0cnVjdG9yKHggPSAwLCB5ID0gMCwgeiA9IDApIHtcbiAgICAgICAgaWYgKHgubGVuZ3RoID09PSAzKSB7XG4gICAgICAgICAgICB0aGlzLnggPSB4WzBdO1xuICAgICAgICAgICAgdGhpcy55ID0geFsxXTtcbiAgICAgICAgICAgIHRoaXMueiA9IHhbMl07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLnggPSB4O1xuICAgICAgICAgICAgdGhpcy55ID0geTtcbiAgICAgICAgICAgIHRoaXMueiA9IHo7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBZGRzIGEgMy1kaW1lbnNpb25hbCB2ZWN0b3IgdG8gYW5vdGhlciBpbiBwbGFjZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7VmVjM30gcmhzIC0gVGhlIHZlY3RvciB0byBhZGQgdG8gdGhlIHNwZWNpZmllZCB2ZWN0b3IuXG4gICAgICogQHJldHVybnMge1ZlYzN9IFNlbGYgZm9yIGNoYWluaW5nLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogY29uc3QgYSA9IG5ldyBwYy5WZWMzKDEwLCAxMCwgMTApO1xuICAgICAqIGNvbnN0IGIgPSBuZXcgcGMuVmVjMygyMCwgMjAsIDIwKTtcbiAgICAgKlxuICAgICAqIGEuYWRkKGIpO1xuICAgICAqXG4gICAgICogLy8gT3V0cHV0cyBbMzAsIDMwLCAzMF1cbiAgICAgKiBjb25zb2xlLmxvZyhcIlRoZSByZXN1bHQgb2YgdGhlIGFkZGl0aW9uIGlzOiBcIiArIGEudG9TdHJpbmcoKSk7XG4gICAgICovXG4gICAgYWRkKHJocykge1xuICAgICAgICB0aGlzLnggKz0gcmhzLng7XG4gICAgICAgIHRoaXMueSArPSByaHMueTtcbiAgICAgICAgdGhpcy56ICs9IHJocy56O1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEFkZHMgdHdvIDMtZGltZW5zaW9uYWwgdmVjdG9ycyB0b2dldGhlciBhbmQgcmV0dXJucyB0aGUgcmVzdWx0LlxuICAgICAqXG4gICAgICogQHBhcmFtIHtWZWMzfSBsaHMgLSBUaGUgZmlyc3QgdmVjdG9yIG9wZXJhbmQgZm9yIHRoZSBhZGRpdGlvbi5cbiAgICAgKiBAcGFyYW0ge1ZlYzN9IHJocyAtIFRoZSBzZWNvbmQgdmVjdG9yIG9wZXJhbmQgZm9yIHRoZSBhZGRpdGlvbi5cbiAgICAgKiBAcmV0dXJucyB7VmVjM30gU2VsZiBmb3IgY2hhaW5pbmcuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBjb25zdCBhID0gbmV3IHBjLlZlYzMoMTAsIDEwLCAxMCk7XG4gICAgICogY29uc3QgYiA9IG5ldyBwYy5WZWMzKDIwLCAyMCwgMjApO1xuICAgICAqIGNvbnN0IHIgPSBuZXcgcGMuVmVjMygpO1xuICAgICAqXG4gICAgICogci5hZGQyKGEsIGIpO1xuICAgICAqIC8vIE91dHB1dHMgWzMwLCAzMCwgMzBdXG4gICAgICpcbiAgICAgKiBjb25zb2xlLmxvZyhcIlRoZSByZXN1bHQgb2YgdGhlIGFkZGl0aW9uIGlzOiBcIiArIHIudG9TdHJpbmcoKSk7XG4gICAgICovXG4gICAgYWRkMihsaHMsIHJocykge1xuICAgICAgICB0aGlzLnggPSBsaHMueCArIHJocy54O1xuICAgICAgICB0aGlzLnkgPSBsaHMueSArIHJocy55O1xuICAgICAgICB0aGlzLnogPSBsaHMueiArIHJocy56O1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEFkZHMgYSBudW1iZXIgdG8gZWFjaCBlbGVtZW50IG9mIGEgdmVjdG9yLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHNjYWxhciAtIFRoZSBudW1iZXIgdG8gYWRkLlxuICAgICAqIEByZXR1cm5zIHtWZWMzfSBTZWxmIGZvciBjaGFpbmluZy5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGNvbnN0IHZlYyA9IG5ldyBwYy5WZWMzKDMsIDQsIDUpO1xuICAgICAqXG4gICAgICogdmVjLmFkZFNjYWxhcigyKTtcbiAgICAgKlxuICAgICAqIC8vIE91dHB1dHMgWzUsIDYsIDddXG4gICAgICogY29uc29sZS5sb2coXCJUaGUgcmVzdWx0IG9mIHRoZSBhZGRpdGlvbiBpczogXCIgKyB2ZWMudG9TdHJpbmcoKSk7XG4gICAgICovXG4gICAgYWRkU2NhbGFyKHNjYWxhcikge1xuICAgICAgICB0aGlzLnggKz0gc2NhbGFyO1xuICAgICAgICB0aGlzLnkgKz0gc2NhbGFyO1xuICAgICAgICB0aGlzLnogKz0gc2NhbGFyO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYW4gaWRlbnRpY2FsIGNvcHkgb2YgdGhlIHNwZWNpZmllZCAzLWRpbWVuc2lvbmFsIHZlY3Rvci5cbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHt0aGlzfSBBIDMtZGltZW5zaW9uYWwgdmVjdG9yIGNvbnRhaW5pbmcgdGhlIHJlc3VsdCBvZiB0aGUgY2xvbmluZy5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGNvbnN0IHYgPSBuZXcgcGMuVmVjMygxMCwgMjAsIDMwKTtcbiAgICAgKiBjb25zdCB2Y2xvbmUgPSB2LmNsb25lKCk7XG4gICAgICogY29uc29sZS5sb2coXCJUaGUgcmVzdWx0IG9mIHRoZSBjbG9uaW5nIGlzOiBcIiArIHZjbG9uZS50b1N0cmluZygpKTtcbiAgICAgKi9cbiAgICBjbG9uZSgpIHtcbiAgICAgICAgLyoqIEB0eXBlIHt0aGlzfSAqL1xuICAgICAgICBjb25zdCBjc3RyID0gdGhpcy5jb25zdHJ1Y3RvcjtcbiAgICAgICAgcmV0dXJuIG5ldyBjc3RyKHRoaXMueCwgdGhpcy55LCB0aGlzLnopO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENvcGllcyB0aGUgY29udGVudHMgb2YgYSBzb3VyY2UgMy1kaW1lbnNpb25hbCB2ZWN0b3IgdG8gYSBkZXN0aW5hdGlvbiAzLWRpbWVuc2lvbmFsIHZlY3Rvci5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7VmVjM30gcmhzIC0gQSB2ZWN0b3IgdG8gY29weSB0byB0aGUgc3BlY2lmaWVkIHZlY3Rvci5cbiAgICAgKiBAcmV0dXJucyB7VmVjM30gU2VsZiBmb3IgY2hhaW5pbmcuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBjb25zdCBzcmMgPSBuZXcgcGMuVmVjMygxMCwgMjAsIDMwKTtcbiAgICAgKiBjb25zdCBkc3QgPSBuZXcgcGMuVmVjMygpO1xuICAgICAqXG4gICAgICogZHN0LmNvcHkoc3JjKTtcbiAgICAgKlxuICAgICAqIGNvbnNvbGUubG9nKFwiVGhlIHR3byB2ZWN0b3JzIGFyZSBcIiArIChkc3QuZXF1YWxzKHNyYykgPyBcImVxdWFsXCIgOiBcImRpZmZlcmVudFwiKSk7XG4gICAgICovXG4gICAgY29weShyaHMpIHtcbiAgICAgICAgdGhpcy54ID0gcmhzLng7XG4gICAgICAgIHRoaXMueSA9IHJocy55O1xuICAgICAgICB0aGlzLnogPSByaHMuejtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSByZXN1bHQgb2YgYSBjcm9zcyBwcm9kdWN0IG9wZXJhdGlvbiBwZXJmb3JtZWQgb24gdGhlIHR3byBzcGVjaWZpZWQgMy1kaW1lbnNpb25hbFxuICAgICAqIHZlY3RvcnMuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1ZlYzN9IGxocyAtIFRoZSBmaXJzdCAzLWRpbWVuc2lvbmFsIHZlY3RvciBvcGVyYW5kIG9mIHRoZSBjcm9zcyBwcm9kdWN0LlxuICAgICAqIEBwYXJhbSB7VmVjM30gcmhzIC0gVGhlIHNlY29uZCAzLWRpbWVuc2lvbmFsIHZlY3RvciBvcGVyYW5kIG9mIHRoZSBjcm9zcyBwcm9kdWN0LlxuICAgICAqIEByZXR1cm5zIHtWZWMzfSBTZWxmIGZvciBjaGFpbmluZy5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGNvbnN0IGJhY2sgPSBuZXcgcGMuVmVjMygpLmNyb3NzKHBjLlZlYzMuUklHSFQsIHBjLlZlYzMuVVApO1xuICAgICAqXG4gICAgICogLy8gUHJpbnRzIHRoZSBaIGF4aXMgKGkuZS4gWzAsIDAsIDFdKVxuICAgICAqIGNvbnNvbGUubG9nKFwiVGhlIHJlc3VsdCBvZiB0aGUgY3Jvc3MgcHJvZHVjdCBpczogXCIgKyBiYWNrLnRvU3RyaW5nKCkpO1xuICAgICAqL1xuICAgIGNyb3NzKGxocywgcmhzKSB7XG4gICAgICAgIC8vIENyZWF0ZSB0ZW1wb3JhcnkgdmFyaWFibGVzIGluIGNhc2UgbGhzIG9yIHJocyBhcmUgJ3RoaXMnXG4gICAgICAgIGNvbnN0IGx4ID0gbGhzLng7XG4gICAgICAgIGNvbnN0IGx5ID0gbGhzLnk7XG4gICAgICAgIGNvbnN0IGx6ID0gbGhzLno7XG4gICAgICAgIGNvbnN0IHJ4ID0gcmhzLng7XG4gICAgICAgIGNvbnN0IHJ5ID0gcmhzLnk7XG4gICAgICAgIGNvbnN0IHJ6ID0gcmhzLno7XG5cbiAgICAgICAgdGhpcy54ID0gbHkgKiByeiAtIHJ5ICogbHo7XG4gICAgICAgIHRoaXMueSA9IGx6ICogcnggLSByeiAqIGx4O1xuICAgICAgICB0aGlzLnogPSBseCAqIHJ5IC0gcnggKiBseTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBkaXN0YW5jZSBiZXR3ZWVuIHRoZSB0d28gc3BlY2lmaWVkIDMtZGltZW5zaW9uYWwgdmVjdG9ycy5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7VmVjM30gcmhzIC0gVGhlIHNlY29uZCAzLWRpbWVuc2lvbmFsIHZlY3RvciB0byB0ZXN0LlxuICAgICAqIEByZXR1cm5zIHtudW1iZXJ9IFRoZSBkaXN0YW5jZSBiZXR3ZWVuIHRoZSB0d28gdmVjdG9ycy5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGNvbnN0IHYxID0gbmV3IHBjLlZlYzMoNSwgMTAsIDIwKTtcbiAgICAgKiBjb25zdCB2MiA9IG5ldyBwYy5WZWMzKDEwLCAyMCwgNDApO1xuICAgICAqIGNvbnN0IGQgPSB2MS5kaXN0YW5jZSh2Mik7XG4gICAgICogY29uc29sZS5sb2coXCJUaGUgZGlzdGFuY2UgYmV0d2VlbiB2MSBhbmQgdjIgaXM6IFwiICsgZCk7XG4gICAgICovXG4gICAgZGlzdGFuY2UocmhzKSB7XG4gICAgICAgIGNvbnN0IHggPSB0aGlzLnggLSByaHMueDtcbiAgICAgICAgY29uc3QgeSA9IHRoaXMueSAtIHJocy55O1xuICAgICAgICBjb25zdCB6ID0gdGhpcy56IC0gcmhzLno7XG4gICAgICAgIHJldHVybiBNYXRoLnNxcnQoeCAqIHggKyB5ICogeSArIHogKiB6KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBEaXZpZGVzIGEgMy1kaW1lbnNpb25hbCB2ZWN0b3IgYnkgYW5vdGhlciBpbiBwbGFjZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7VmVjM30gcmhzIC0gVGhlIHZlY3RvciB0byBkaXZpZGUgdGhlIHNwZWNpZmllZCB2ZWN0b3IgYnkuXG4gICAgICogQHJldHVybnMge1ZlYzN9IFNlbGYgZm9yIGNoYWluaW5nLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogY29uc3QgYSA9IG5ldyBwYy5WZWMzKDQsIDksIDE2KTtcbiAgICAgKiBjb25zdCBiID0gbmV3IHBjLlZlYzMoMiwgMywgNCk7XG4gICAgICpcbiAgICAgKiBhLmRpdihiKTtcbiAgICAgKlxuICAgICAqIC8vIE91dHB1dHMgWzIsIDMsIDRdXG4gICAgICogY29uc29sZS5sb2coXCJUaGUgcmVzdWx0IG9mIHRoZSBkaXZpc2lvbiBpczogXCIgKyBhLnRvU3RyaW5nKCkpO1xuICAgICAqL1xuICAgIGRpdihyaHMpIHtcbiAgICAgICAgdGhpcy54IC89IHJocy54O1xuICAgICAgICB0aGlzLnkgLz0gcmhzLnk7XG4gICAgICAgIHRoaXMueiAvPSByaHMuejtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBEaXZpZGVzIG9uZSAzLWRpbWVuc2lvbmFsIHZlY3RvciBieSBhbm90aGVyIGFuZCB3cml0ZXMgdGhlIHJlc3VsdCB0byB0aGUgc3BlY2lmaWVkIHZlY3Rvci5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7VmVjM30gbGhzIC0gVGhlIGRpdmlkZW5kIHZlY3RvciAodGhlIHZlY3RvciBiZWluZyBkaXZpZGVkKS5cbiAgICAgKiBAcGFyYW0ge1ZlYzN9IHJocyAtIFRoZSBkaXZpc29yIHZlY3RvciAodGhlIHZlY3RvciBkaXZpZGluZyB0aGUgZGl2aWRlbmQpLlxuICAgICAqIEByZXR1cm5zIHtWZWMzfSBTZWxmIGZvciBjaGFpbmluZy5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGNvbnN0IGEgPSBuZXcgcGMuVmVjMyg0LCA5LCAxNik7XG4gICAgICogY29uc3QgYiA9IG5ldyBwYy5WZWMzKDIsIDMsIDQpO1xuICAgICAqIGNvbnN0IHIgPSBuZXcgcGMuVmVjMygpO1xuICAgICAqXG4gICAgICogci5kaXYyKGEsIGIpO1xuICAgICAqIC8vIE91dHB1dHMgWzIsIDMsIDRdXG4gICAgICpcbiAgICAgKiBjb25zb2xlLmxvZyhcIlRoZSByZXN1bHQgb2YgdGhlIGRpdmlzaW9uIGlzOiBcIiArIHIudG9TdHJpbmcoKSk7XG4gICAgICovXG4gICAgZGl2MihsaHMsIHJocykge1xuICAgICAgICB0aGlzLnggPSBsaHMueCAvIHJocy54O1xuICAgICAgICB0aGlzLnkgPSBsaHMueSAvIHJocy55O1xuICAgICAgICB0aGlzLnogPSBsaHMueiAvIHJocy56O1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIERpdmlkZXMgZWFjaCBlbGVtZW50IG9mIGEgdmVjdG9yIGJ5IGEgbnVtYmVyLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHNjYWxhciAtIFRoZSBudW1iZXIgdG8gZGl2aWRlIGJ5LlxuICAgICAqIEByZXR1cm5zIHtWZWMzfSBTZWxmIGZvciBjaGFpbmluZy5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGNvbnN0IHZlYyA9IG5ldyBwYy5WZWMzKDMsIDYsIDkpO1xuICAgICAqXG4gICAgICogdmVjLmRpdlNjYWxhcigzKTtcbiAgICAgKlxuICAgICAqIC8vIE91dHB1dHMgWzEsIDIsIDNdXG4gICAgICogY29uc29sZS5sb2coXCJUaGUgcmVzdWx0IG9mIHRoZSBkaXZpc2lvbiBpczogXCIgKyB2ZWMudG9TdHJpbmcoKSk7XG4gICAgICovXG4gICAgZGl2U2NhbGFyKHNjYWxhcikge1xuICAgICAgICB0aGlzLnggLz0gc2NhbGFyO1xuICAgICAgICB0aGlzLnkgLz0gc2NhbGFyO1xuICAgICAgICB0aGlzLnogLz0gc2NhbGFyO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIHJlc3VsdCBvZiBhIGRvdCBwcm9kdWN0IG9wZXJhdGlvbiBwZXJmb3JtZWQgb24gdGhlIHR3byBzcGVjaWZpZWQgMy1kaW1lbnNpb25hbFxuICAgICAqIHZlY3RvcnMuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1ZlYzN9IHJocyAtIFRoZSBzZWNvbmQgMy1kaW1lbnNpb25hbCB2ZWN0b3Igb3BlcmFuZCBvZiB0aGUgZG90IHByb2R1Y3QuXG4gICAgICogQHJldHVybnMge251bWJlcn0gVGhlIHJlc3VsdCBvZiB0aGUgZG90IHByb2R1Y3Qgb3BlcmF0aW9uLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogY29uc3QgdjEgPSBuZXcgcGMuVmVjMyg1LCAxMCwgMjApO1xuICAgICAqIGNvbnN0IHYyID0gbmV3IHBjLlZlYzMoMTAsIDIwLCA0MCk7XG4gICAgICogY29uc3QgdjFkb3R2MiA9IHYxLmRvdCh2Mik7XG4gICAgICogY29uc29sZS5sb2coXCJUaGUgcmVzdWx0IG9mIHRoZSBkb3QgcHJvZHVjdCBpczogXCIgKyB2MWRvdHYyKTtcbiAgICAgKi9cbiAgICBkb3QocmhzKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnggKiByaHMueCArIHRoaXMueSAqIHJocy55ICsgdGhpcy56ICogcmhzLno7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVwb3J0cyB3aGV0aGVyIHR3byB2ZWN0b3JzIGFyZSBlcXVhbC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7VmVjM30gcmhzIC0gVGhlIHZlY3RvciB0byBjb21wYXJlIHRvIHRoZSBzcGVjaWZpZWQgdmVjdG9yLlxuICAgICAqIEByZXR1cm5zIHtib29sZWFufSBUcnVlIGlmIHRoZSB2ZWN0b3JzIGFyZSBlcXVhbCBhbmQgZmFsc2Ugb3RoZXJ3aXNlLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogY29uc3QgYSA9IG5ldyBwYy5WZWMzKDEsIDIsIDMpO1xuICAgICAqIGNvbnN0IGIgPSBuZXcgcGMuVmVjMyg0LCA1LCA2KTtcbiAgICAgKiBjb25zb2xlLmxvZyhcIlRoZSB0d28gdmVjdG9ycyBhcmUgXCIgKyAoYS5lcXVhbHMoYikgPyBcImVxdWFsXCIgOiBcImRpZmZlcmVudFwiKSk7XG4gICAgICovXG4gICAgZXF1YWxzKHJocykge1xuICAgICAgICByZXR1cm4gdGhpcy54ID09PSByaHMueCAmJiB0aGlzLnkgPT09IHJocy55ICYmIHRoaXMueiA9PT0gcmhzLno7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgbWFnbml0dWRlIG9mIHRoZSBzcGVjaWZpZWQgMy1kaW1lbnNpb25hbCB2ZWN0b3IuXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7bnVtYmVyfSBUaGUgbWFnbml0dWRlIG9mIHRoZSBzcGVjaWZpZWQgMy1kaW1lbnNpb25hbCB2ZWN0b3IuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBjb25zdCB2ZWMgPSBuZXcgcGMuVmVjMygzLCA0LCAwKTtcbiAgICAgKiBjb25zdCBsZW4gPSB2ZWMubGVuZ3RoKCk7XG4gICAgICogLy8gT3V0cHV0cyA1XG4gICAgICogY29uc29sZS5sb2coXCJUaGUgbGVuZ3RoIG9mIHRoZSB2ZWN0b3IgaXM6IFwiICsgbGVuKTtcbiAgICAgKi9cbiAgICBsZW5ndGgoKSB7XG4gICAgICAgIHJldHVybiBNYXRoLnNxcnQodGhpcy54ICogdGhpcy54ICsgdGhpcy55ICogdGhpcy55ICsgdGhpcy56ICogdGhpcy56KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBtYWduaXR1ZGUgc3F1YXJlZCBvZiB0aGUgc3BlY2lmaWVkIDMtZGltZW5zaW9uYWwgdmVjdG9yLlxuICAgICAqXG4gICAgICogQHJldHVybnMge251bWJlcn0gVGhlIG1hZ25pdHVkZSBvZiB0aGUgc3BlY2lmaWVkIDMtZGltZW5zaW9uYWwgdmVjdG9yLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogY29uc3QgdmVjID0gbmV3IHBjLlZlYzMoMywgNCwgMCk7XG4gICAgICogY29uc3QgbGVuID0gdmVjLmxlbmd0aFNxKCk7XG4gICAgICogLy8gT3V0cHV0cyAyNVxuICAgICAqIGNvbnNvbGUubG9nKFwiVGhlIGxlbmd0aCBzcXVhcmVkIG9mIHRoZSB2ZWN0b3IgaXM6IFwiICsgbGVuKTtcbiAgICAgKi9cbiAgICBsZW5ndGhTcSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMueCAqIHRoaXMueCArIHRoaXMueSAqIHRoaXMueSArIHRoaXMueiAqIHRoaXMuejtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSByZXN1bHQgb2YgYSBsaW5lYXIgaW50ZXJwb2xhdGlvbiBiZXR3ZWVuIHR3byBzcGVjaWZpZWQgMy1kaW1lbnNpb25hbCB2ZWN0b3JzLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtWZWMzfSBsaHMgLSBUaGUgMy1kaW1lbnNpb25hbCB0byBpbnRlcnBvbGF0ZSBmcm9tLlxuICAgICAqIEBwYXJhbSB7VmVjM30gcmhzIC0gVGhlIDMtZGltZW5zaW9uYWwgdG8gaW50ZXJwb2xhdGUgdG8uXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGFscGhhIC0gVGhlIHZhbHVlIGNvbnRyb2xsaW5nIHRoZSBwb2ludCBvZiBpbnRlcnBvbGF0aW9uLiBCZXR3ZWVuIDAgYW5kIDEsXG4gICAgICogdGhlIGxpbmVhciBpbnRlcnBvbGFudCB3aWxsIG9jY3VyIG9uIGEgc3RyYWlnaHQgbGluZSBiZXR3ZWVuIGxocyBhbmQgcmhzLiBPdXRzaWRlIG9mIHRoaXNcbiAgICAgKiByYW5nZSwgdGhlIGxpbmVhciBpbnRlcnBvbGFudCB3aWxsIG9jY3VyIG9uIGEgcmF5IGV4dHJhcG9sYXRlZCBmcm9tIHRoaXMgbGluZS5cbiAgICAgKiBAcmV0dXJucyB7VmVjM30gU2VsZiBmb3IgY2hhaW5pbmcuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBjb25zdCBhID0gbmV3IHBjLlZlYzMoMCwgMCwgMCk7XG4gICAgICogY29uc3QgYiA9IG5ldyBwYy5WZWMzKDEwLCAxMCwgMTApO1xuICAgICAqIGNvbnN0IHIgPSBuZXcgcGMuVmVjMygpO1xuICAgICAqXG4gICAgICogci5sZXJwKGEsIGIsIDApOyAgIC8vIHIgaXMgZXF1YWwgdG8gYVxuICAgICAqIHIubGVycChhLCBiLCAwLjUpOyAvLyByIGlzIDUsIDUsIDVcbiAgICAgKiByLmxlcnAoYSwgYiwgMSk7ICAgLy8gciBpcyBlcXVhbCB0byBiXG4gICAgICovXG4gICAgbGVycChsaHMsIHJocywgYWxwaGEpIHtcbiAgICAgICAgdGhpcy54ID0gbGhzLnggKyBhbHBoYSAqIChyaHMueCAtIGxocy54KTtcbiAgICAgICAgdGhpcy55ID0gbGhzLnkgKyBhbHBoYSAqIChyaHMueSAtIGxocy55KTtcbiAgICAgICAgdGhpcy56ID0gbGhzLnogKyBhbHBoYSAqIChyaHMueiAtIGxocy56KTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNdWx0aXBsaWVzIGEgMy1kaW1lbnNpb25hbCB2ZWN0b3IgdG8gYW5vdGhlciBpbiBwbGFjZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7VmVjM30gcmhzIC0gVGhlIDMtZGltZW5zaW9uYWwgdmVjdG9yIHVzZWQgYXMgdGhlIHNlY29uZCBtdWx0aXBsaWNhbmQgb2YgdGhlIG9wZXJhdGlvbi5cbiAgICAgKiBAcmV0dXJucyB7VmVjM30gU2VsZiBmb3IgY2hhaW5pbmcuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBjb25zdCBhID0gbmV3IHBjLlZlYzMoMiwgMywgNCk7XG4gICAgICogY29uc3QgYiA9IG5ldyBwYy5WZWMzKDQsIDUsIDYpO1xuICAgICAqXG4gICAgICogYS5tdWwoYik7XG4gICAgICpcbiAgICAgKiAvLyBPdXRwdXRzIDgsIDE1LCAyNFxuICAgICAqIGNvbnNvbGUubG9nKFwiVGhlIHJlc3VsdCBvZiB0aGUgbXVsdGlwbGljYXRpb24gaXM6IFwiICsgYS50b1N0cmluZygpKTtcbiAgICAgKi9cbiAgICBtdWwocmhzKSB7XG4gICAgICAgIHRoaXMueCAqPSByaHMueDtcbiAgICAgICAgdGhpcy55ICo9IHJocy55O1xuICAgICAgICB0aGlzLnogKj0gcmhzLno7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgcmVzdWx0IG9mIG11bHRpcGx5aW5nIHRoZSBzcGVjaWZpZWQgMy1kaW1lbnNpb25hbCB2ZWN0b3JzIHRvZ2V0aGVyLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtWZWMzfSBsaHMgLSBUaGUgMy1kaW1lbnNpb25hbCB2ZWN0b3IgdXNlZCBhcyB0aGUgZmlyc3QgbXVsdGlwbGljYW5kIG9mIHRoZSBvcGVyYXRpb24uXG4gICAgICogQHBhcmFtIHtWZWMzfSByaHMgLSBUaGUgMy1kaW1lbnNpb25hbCB2ZWN0b3IgdXNlZCBhcyB0aGUgc2Vjb25kIG11bHRpcGxpY2FuZCBvZiB0aGUgb3BlcmF0aW9uLlxuICAgICAqIEByZXR1cm5zIHtWZWMzfSBTZWxmIGZvciBjaGFpbmluZy5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGNvbnN0IGEgPSBuZXcgcGMuVmVjMygyLCAzLCA0KTtcbiAgICAgKiBjb25zdCBiID0gbmV3IHBjLlZlYzMoNCwgNSwgNik7XG4gICAgICogY29uc3QgciA9IG5ldyBwYy5WZWMzKCk7XG4gICAgICpcbiAgICAgKiByLm11bDIoYSwgYik7XG4gICAgICpcbiAgICAgKiAvLyBPdXRwdXRzIDgsIDE1LCAyNFxuICAgICAqIGNvbnNvbGUubG9nKFwiVGhlIHJlc3VsdCBvZiB0aGUgbXVsdGlwbGljYXRpb24gaXM6IFwiICsgci50b1N0cmluZygpKTtcbiAgICAgKi9cbiAgICBtdWwyKGxocywgcmhzKSB7XG4gICAgICAgIHRoaXMueCA9IGxocy54ICogcmhzLng7XG4gICAgICAgIHRoaXMueSA9IGxocy55ICogcmhzLnk7XG4gICAgICAgIHRoaXMueiA9IGxocy56ICogcmhzLno7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTXVsdGlwbGllcyBlYWNoIGVsZW1lbnQgb2YgYSB2ZWN0b3IgYnkgYSBudW1iZXIuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gc2NhbGFyIC0gVGhlIG51bWJlciB0byBtdWx0aXBseSBieS5cbiAgICAgKiBAcmV0dXJucyB7VmVjM30gU2VsZiBmb3IgY2hhaW5pbmcuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBjb25zdCB2ZWMgPSBuZXcgcGMuVmVjMygzLCA2LCA5KTtcbiAgICAgKlxuICAgICAqIHZlYy5tdWxTY2FsYXIoMyk7XG4gICAgICpcbiAgICAgKiAvLyBPdXRwdXRzIFs5LCAxOCwgMjddXG4gICAgICogY29uc29sZS5sb2coXCJUaGUgcmVzdWx0IG9mIHRoZSBtdWx0aXBsaWNhdGlvbiBpczogXCIgKyB2ZWMudG9TdHJpbmcoKSk7XG4gICAgICovXG4gICAgbXVsU2NhbGFyKHNjYWxhcikge1xuICAgICAgICB0aGlzLnggKj0gc2NhbGFyO1xuICAgICAgICB0aGlzLnkgKj0gc2NhbGFyO1xuICAgICAgICB0aGlzLnogKj0gc2NhbGFyO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhpcyAzLWRpbWVuc2lvbmFsIHZlY3RvciBjb252ZXJ0ZWQgdG8gYSB1bml0IHZlY3RvciBpbiBwbGFjZS4gSWYgdGhlIHZlY3RvciBoYXMgYVxuICAgICAqIGxlbmd0aCBvZiB6ZXJvLCB0aGUgdmVjdG9yJ3MgZWxlbWVudHMgd2lsbCBiZSBzZXQgdG8gemVyby5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7VmVjM30gW3NyY10gLSBUaGUgdmVjdG9yIHRvIG5vcm1hbGl6ZS4gSWYgbm90IHNldCwgdGhlIG9wZXJhdGlvbiBpcyBkb25lIGluIHBsYWNlLlxuICAgICAqIEByZXR1cm5zIHtWZWMzfSBTZWxmIGZvciBjaGFpbmluZy5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGNvbnN0IHYgPSBuZXcgcGMuVmVjMygyNSwgMCwgMCk7XG4gICAgICpcbiAgICAgKiB2Lm5vcm1hbGl6ZSgpO1xuICAgICAqXG4gICAgICogLy8gT3V0cHV0cyAxLCAwLCAwXG4gICAgICogY29uc29sZS5sb2coXCJUaGUgcmVzdWx0IG9mIHRoZSB2ZWN0b3Igbm9ybWFsaXphdGlvbiBpczogXCIgKyB2LnRvU3RyaW5nKCkpO1xuICAgICAqL1xuICAgIG5vcm1hbGl6ZShzcmMgPSB0aGlzKSB7XG4gICAgICAgIGNvbnN0IGxlbmd0aFNxID0gc3JjLnggKiBzcmMueCArIHNyYy55ICogc3JjLnkgKyBzcmMueiAqIHNyYy56O1xuICAgICAgICBpZiAobGVuZ3RoU3EgPiAwKSB7XG4gICAgICAgICAgICBjb25zdCBpbnZMZW5ndGggPSAxIC8gTWF0aC5zcXJ0KGxlbmd0aFNxKTtcbiAgICAgICAgICAgIHRoaXMueCA9IHNyYy54ICogaW52TGVuZ3RoO1xuICAgICAgICAgICAgdGhpcy55ID0gc3JjLnkgKiBpbnZMZW5ndGg7XG4gICAgICAgICAgICB0aGlzLnogPSBzcmMueiAqIGludkxlbmd0aDtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEVhY2ggZWxlbWVudCBpcyBzZXQgdG8gdGhlIGxhcmdlc3QgaW50ZWdlciBsZXNzIHRoYW4gb3IgZXF1YWwgdG8gaXRzIHZhbHVlLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtWZWMzfSBbc3JjXSAtIFRoZSB2ZWN0b3IgdG8gZmxvb3IuIElmIG5vdCBzZXQsIHRoZSBvcGVyYXRpb24gaXMgZG9uZSBpbiBwbGFjZS5cbiAgICAgKiBAcmV0dXJucyB7VmVjM30gU2VsZiBmb3IgY2hhaW5pbmcuXG4gICAgICovXG4gICAgZmxvb3Ioc3JjID0gdGhpcykge1xuICAgICAgICB0aGlzLnggPSBNYXRoLmZsb29yKHNyYy54KTtcbiAgICAgICAgdGhpcy55ID0gTWF0aC5mbG9vcihzcmMueSk7XG4gICAgICAgIHRoaXMueiA9IE1hdGguZmxvb3Ioc3JjLnopO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBFYWNoIGVsZW1lbnQgaXMgcm91bmRlZCB1cCB0byB0aGUgbmV4dCBsYXJnZXN0IGludGVnZXIuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1ZlYzN9IFtzcmNdIC0gVGhlIHZlY3RvciB0byBjZWlsLiBJZiBub3Qgc2V0LCB0aGUgb3BlcmF0aW9uIGlzIGRvbmUgaW4gcGxhY2UuXG4gICAgICogQHJldHVybnMge1ZlYzN9IFNlbGYgZm9yIGNoYWluaW5nLlxuICAgICAqL1xuICAgIGNlaWwoc3JjID0gdGhpcykge1xuICAgICAgICB0aGlzLnggPSBNYXRoLmNlaWwoc3JjLngpO1xuICAgICAgICB0aGlzLnkgPSBNYXRoLmNlaWwoc3JjLnkpO1xuICAgICAgICB0aGlzLnogPSBNYXRoLmNlaWwoc3JjLnopO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBFYWNoIGVsZW1lbnQgaXMgcm91bmRlZCB1cCBvciBkb3duIHRvIHRoZSBuZWFyZXN0IGludGVnZXIuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1ZlYzN9IFtzcmNdIC0gVGhlIHZlY3RvciB0byByb3VuZC4gSWYgbm90IHNldCwgdGhlIG9wZXJhdGlvbiBpcyBkb25lIGluIHBsYWNlLlxuICAgICAqIEByZXR1cm5zIHtWZWMzfSBTZWxmIGZvciBjaGFpbmluZy5cbiAgICAgKi9cbiAgICByb3VuZChzcmMgPSB0aGlzKSB7XG4gICAgICAgIHRoaXMueCA9IE1hdGgucm91bmQoc3JjLngpO1xuICAgICAgICB0aGlzLnkgPSBNYXRoLnJvdW5kKHNyYy55KTtcbiAgICAgICAgdGhpcy56ID0gTWF0aC5yb3VuZChzcmMueik7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEVhY2ggZWxlbWVudCBpcyBhc3NpZ25lZCBhIHZhbHVlIGZyb20gcmhzIHBhcmFtZXRlciBpZiBpdCBpcyBzbWFsbGVyLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtWZWMzfSByaHMgLSBUaGUgMy1kaW1lbnNpb25hbCB2ZWN0b3IgdXNlZCBhcyB0aGUgc291cmNlIG9mIGVsZW1lbnRzIHRvIGNvbXBhcmUgdG8uXG4gICAgICogQHJldHVybnMge1ZlYzN9IFNlbGYgZm9yIGNoYWluaW5nLlxuICAgICAqL1xuICAgIG1pbihyaHMpIHtcbiAgICAgICAgaWYgKHJocy54IDwgdGhpcy54KSB0aGlzLnggPSByaHMueDtcbiAgICAgICAgaWYgKHJocy55IDwgdGhpcy55KSB0aGlzLnkgPSByaHMueTtcbiAgICAgICAgaWYgKHJocy56IDwgdGhpcy56KSB0aGlzLnogPSByaHMuejtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRWFjaCBlbGVtZW50IGlzIGFzc2lnbmVkIGEgdmFsdWUgZnJvbSByaHMgcGFyYW1ldGVyIGlmIGl0IGlzIGxhcmdlci5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7VmVjM30gcmhzIC0gVGhlIDMtZGltZW5zaW9uYWwgdmVjdG9yIHVzZWQgYXMgdGhlIHNvdXJjZSBvZiBlbGVtZW50cyB0byBjb21wYXJlIHRvLlxuICAgICAqIEByZXR1cm5zIHtWZWMzfSBTZWxmIGZvciBjaGFpbmluZy5cbiAgICAgKi9cbiAgICBtYXgocmhzKSB7XG4gICAgICAgIGlmIChyaHMueCA+IHRoaXMueCkgdGhpcy54ID0gcmhzLng7XG4gICAgICAgIGlmIChyaHMueSA+IHRoaXMueSkgdGhpcy55ID0gcmhzLnk7XG4gICAgICAgIGlmIChyaHMueiA+IHRoaXMueikgdGhpcy56ID0gcmhzLno7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFByb2plY3RzIHRoaXMgMy1kaW1lbnNpb25hbCB2ZWN0b3Igb250byB0aGUgc3BlY2lmaWVkIHZlY3Rvci5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7VmVjM30gcmhzIC0gVGhlIHZlY3RvciBvbnRvIHdoaWNoIHRoZSBvcmlnaW5hbCB2ZWN0b3Igd2lsbCBiZSBwcm9qZWN0ZWQgb24uXG4gICAgICogQHJldHVybnMge1ZlYzN9IFNlbGYgZm9yIGNoYWluaW5nLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogY29uc3QgdiA9IG5ldyBwYy5WZWMzKDUsIDUsIDUpO1xuICAgICAqIGNvbnN0IG5vcm1hbCA9IG5ldyBwYy5WZWMzKDEsIDAsIDApO1xuICAgICAqXG4gICAgICogdi5wcm9qZWN0KG5vcm1hbCk7XG4gICAgICpcbiAgICAgKiAvLyBPdXRwdXRzIDUsIDAsIDBcbiAgICAgKiBjb25zb2xlLmxvZyhcIlRoZSByZXN1bHQgb2YgdGhlIHZlY3RvciBwcm9qZWN0aW9uIGlzOiBcIiArIHYudG9TdHJpbmcoKSk7XG4gICAgICovXG4gICAgcHJvamVjdChyaHMpIHtcbiAgICAgICAgY29uc3QgYV9kb3RfYiA9IHRoaXMueCAqIHJocy54ICsgdGhpcy55ICogcmhzLnkgKyB0aGlzLnogKiByaHMuejtcbiAgICAgICAgY29uc3QgYl9kb3RfYiA9IHJocy54ICogcmhzLnggKyByaHMueSAqIHJocy55ICsgcmhzLnogKiByaHMuejtcbiAgICAgICAgY29uc3QgcyA9IGFfZG90X2IgLyBiX2RvdF9iO1xuICAgICAgICB0aGlzLnggPSByaHMueCAqIHM7XG4gICAgICAgIHRoaXMueSA9IHJocy55ICogcztcbiAgICAgICAgdGhpcy56ID0gcmhzLnogKiBzO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHRoZSBzcGVjaWZpZWQgMy1kaW1lbnNpb25hbCB2ZWN0b3IgdG8gdGhlIHN1cHBsaWVkIG51bWVyaWNhbCB2YWx1ZXMuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge251bWJlcn0geCAtIFRoZSB2YWx1ZSB0byBzZXQgb24gdGhlIGZpcnN0IGNvbXBvbmVudCBvZiB0aGUgdmVjdG9yLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSB5IC0gVGhlIHZhbHVlIHRvIHNldCBvbiB0aGUgc2Vjb25kIGNvbXBvbmVudCBvZiB0aGUgdmVjdG9yLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSB6IC0gVGhlIHZhbHVlIHRvIHNldCBvbiB0aGUgdGhpcmQgY29tcG9uZW50IG9mIHRoZSB2ZWN0b3IuXG4gICAgICogQHJldHVybnMge1ZlYzN9IFNlbGYgZm9yIGNoYWluaW5nLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogY29uc3QgdiA9IG5ldyBwYy5WZWMzKCk7XG4gICAgICogdi5zZXQoNSwgMTAsIDIwKTtcbiAgICAgKlxuICAgICAqIC8vIE91dHB1dHMgNSwgMTAsIDIwXG4gICAgICogY29uc29sZS5sb2coXCJUaGUgcmVzdWx0IG9mIHRoZSB2ZWN0b3Igc2V0IGlzOiBcIiArIHYudG9TdHJpbmcoKSk7XG4gICAgICovXG4gICAgc2V0KHgsIHksIHopIHtcbiAgICAgICAgdGhpcy54ID0geDtcbiAgICAgICAgdGhpcy55ID0geTtcbiAgICAgICAgdGhpcy56ID0gejtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTdWJ0cmFjdHMgYSAzLWRpbWVuc2lvbmFsIHZlY3RvciBmcm9tIGFub3RoZXIgaW4gcGxhY2UuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1ZlYzN9IHJocyAtIFRoZSB2ZWN0b3IgdG8gc3VidHJhY3QgZnJvbSB0aGUgc3BlY2lmaWVkIHZlY3Rvci5cbiAgICAgKiBAcmV0dXJucyB7VmVjM30gU2VsZiBmb3IgY2hhaW5pbmcuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBjb25zdCBhID0gbmV3IHBjLlZlYzMoMTAsIDEwLCAxMCk7XG4gICAgICogY29uc3QgYiA9IG5ldyBwYy5WZWMzKDIwLCAyMCwgMjApO1xuICAgICAqXG4gICAgICogYS5zdWIoYik7XG4gICAgICpcbiAgICAgKiAvLyBPdXRwdXRzIFstMTAsIC0xMCwgLTEwXVxuICAgICAqIGNvbnNvbGUubG9nKFwiVGhlIHJlc3VsdCBvZiB0aGUgc3VidHJhY3Rpb24gaXM6IFwiICsgYS50b1N0cmluZygpKTtcbiAgICAgKi9cbiAgICBzdWIocmhzKSB7XG4gICAgICAgIHRoaXMueCAtPSByaHMueDtcbiAgICAgICAgdGhpcy55IC09IHJocy55O1xuICAgICAgICB0aGlzLnogLT0gcmhzLno7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU3VidHJhY3RzIHR3byAzLWRpbWVuc2lvbmFsIHZlY3RvcnMgZnJvbSBvbmUgYW5vdGhlciBhbmQgcmV0dXJucyB0aGUgcmVzdWx0LlxuICAgICAqXG4gICAgICogQHBhcmFtIHtWZWMzfSBsaHMgLSBUaGUgZmlyc3QgdmVjdG9yIG9wZXJhbmQgZm9yIHRoZSBzdWJ0cmFjdGlvbi5cbiAgICAgKiBAcGFyYW0ge1ZlYzN9IHJocyAtIFRoZSBzZWNvbmQgdmVjdG9yIG9wZXJhbmQgZm9yIHRoZSBzdWJ0cmFjdGlvbi5cbiAgICAgKiBAcmV0dXJucyB7VmVjM30gU2VsZiBmb3IgY2hhaW5pbmcuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBjb25zdCBhID0gbmV3IHBjLlZlYzMoMTAsIDEwLCAxMCk7XG4gICAgICogY29uc3QgYiA9IG5ldyBwYy5WZWMzKDIwLCAyMCwgMjApO1xuICAgICAqIGNvbnN0IHIgPSBuZXcgcGMuVmVjMygpO1xuICAgICAqXG4gICAgICogci5zdWIyKGEsIGIpO1xuICAgICAqXG4gICAgICogLy8gT3V0cHV0cyBbLTEwLCAtMTAsIC0xMF1cbiAgICAgKiBjb25zb2xlLmxvZyhcIlRoZSByZXN1bHQgb2YgdGhlIHN1YnRyYWN0aW9uIGlzOiBcIiArIHIudG9TdHJpbmcoKSk7XG4gICAgICovXG4gICAgc3ViMihsaHMsIHJocykge1xuICAgICAgICB0aGlzLnggPSBsaHMueCAtIHJocy54O1xuICAgICAgICB0aGlzLnkgPSBsaHMueSAtIHJocy55O1xuICAgICAgICB0aGlzLnogPSBsaHMueiAtIHJocy56O1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFN1YnRyYWN0cyBhIG51bWJlciBmcm9tIGVhY2ggZWxlbWVudCBvZiBhIHZlY3Rvci5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBzY2FsYXIgLSBUaGUgbnVtYmVyIHRvIHN1YnRyYWN0LlxuICAgICAqIEByZXR1cm5zIHtWZWMzfSBTZWxmIGZvciBjaGFpbmluZy5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGNvbnN0IHZlYyA9IG5ldyBwYy5WZWMzKDMsIDQsIDUpO1xuICAgICAqXG4gICAgICogdmVjLnN1YlNjYWxhcigyKTtcbiAgICAgKlxuICAgICAqIC8vIE91dHB1dHMgWzEsIDIsIDNdXG4gICAgICogY29uc29sZS5sb2coXCJUaGUgcmVzdWx0IG9mIHRoZSBzdWJ0cmFjdGlvbiBpczogXCIgKyB2ZWMudG9TdHJpbmcoKSk7XG4gICAgICovXG4gICAgc3ViU2NhbGFyKHNjYWxhcikge1xuICAgICAgICB0aGlzLnggLT0gc2NhbGFyO1xuICAgICAgICB0aGlzLnkgLT0gc2NhbGFyO1xuICAgICAgICB0aGlzLnogLT0gc2NhbGFyO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENvbnZlcnRzIHRoZSB2ZWN0b3IgdG8gc3RyaW5nIGZvcm0uXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7c3RyaW5nfSBUaGUgdmVjdG9yIGluIHN0cmluZyBmb3JtLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogY29uc3QgdiA9IG5ldyBwYy5WZWMzKDIwLCAxMCwgNSk7XG4gICAgICogLy8gT3V0cHV0cyBbMjAsIDEwLCA1XVxuICAgICAqIGNvbnNvbGUubG9nKHYudG9TdHJpbmcoKSk7XG4gICAgICovXG4gICAgdG9TdHJpbmcoKSB7XG4gICAgICAgIHJldHVybiBgWyR7dGhpcy54fSwgJHt0aGlzLnl9LCAke3RoaXMuen1dYDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBIGNvbnN0YW50IHZlY3RvciBzZXQgdG8gWzAsIDAsIDBdLlxuICAgICAqXG4gICAgICogQHR5cGUge1ZlYzN9XG4gICAgICogQHJlYWRvbmx5XG4gICAgICovXG4gICAgc3RhdGljIFpFUk8gPSBPYmplY3QuZnJlZXplKG5ldyBWZWMzKDAsIDAsIDApKTtcblxuICAgIC8qKlxuICAgICAqIEEgY29uc3RhbnQgdmVjdG9yIHNldCB0byBbMSwgMSwgMV0uXG4gICAgICpcbiAgICAgKiBAdHlwZSB7VmVjM31cbiAgICAgKiBAcmVhZG9ubHlcbiAgICAgKi9cbiAgICBzdGF0aWMgT05FID0gT2JqZWN0LmZyZWV6ZShuZXcgVmVjMygxLCAxLCAxKSk7XG5cbiAgICAvKipcbiAgICAgKiBBIGNvbnN0YW50IHZlY3RvciBzZXQgdG8gWzAsIDEsIDBdLlxuICAgICAqXG4gICAgICogQHR5cGUge1ZlYzN9XG4gICAgICogQHJlYWRvbmx5XG4gICAgICovXG4gICAgc3RhdGljIFVQID0gT2JqZWN0LmZyZWV6ZShuZXcgVmVjMygwLCAxLCAwKSk7XG5cbiAgICAvKipcbiAgICAgKiBBIGNvbnN0YW50IHZlY3RvciBzZXQgdG8gWzAsIC0xLCAwXS5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtWZWMzfVxuICAgICAqIEByZWFkb25seVxuICAgICAqL1xuICAgIHN0YXRpYyBET1dOID0gT2JqZWN0LmZyZWV6ZShuZXcgVmVjMygwLCAtMSwgMCkpO1xuXG4gICAgLyoqXG4gICAgICogQSBjb25zdGFudCB2ZWN0b3Igc2V0IHRvIFsxLCAwLCAwXS5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtWZWMzfVxuICAgICAqIEByZWFkb25seVxuICAgICAqL1xuICAgIHN0YXRpYyBSSUdIVCA9IE9iamVjdC5mcmVlemUobmV3IFZlYzMoMSwgMCwgMCkpO1xuXG4gICAgLyoqXG4gICAgICogQSBjb25zdGFudCB2ZWN0b3Igc2V0IHRvIFstMSwgMCwgMF0uXG4gICAgICpcbiAgICAgKiBAdHlwZSB7VmVjM31cbiAgICAgKiBAcmVhZG9ubHlcbiAgICAgKi9cbiAgICBzdGF0aWMgTEVGVCA9IE9iamVjdC5mcmVlemUobmV3IFZlYzMoLTEsIDAsIDApKTtcblxuICAgIC8qKlxuICAgICAqIEEgY29uc3RhbnQgdmVjdG9yIHNldCB0byBbMCwgMCwgLTFdLlxuICAgICAqXG4gICAgICogQHR5cGUge1ZlYzN9XG4gICAgICogQHJlYWRvbmx5XG4gICAgICovXG4gICAgc3RhdGljIEZPUldBUkQgPSBPYmplY3QuZnJlZXplKG5ldyBWZWMzKDAsIDAsIC0xKSk7XG5cbiAgICAvKipcbiAgICAgKiBBIGNvbnN0YW50IHZlY3RvciBzZXQgdG8gWzAsIDAsIDFdLlxuICAgICAqXG4gICAgICogQHR5cGUge1ZlYzN9XG4gICAgICogQHJlYWRvbmx5XG4gICAgICovXG4gICAgc3RhdGljIEJBQ0sgPSBPYmplY3QuZnJlZXplKG5ldyBWZWMzKDAsIDAsIDEpKTtcbn1cblxuZXhwb3J0IHsgVmVjMyB9O1xuIl0sIm5hbWVzIjpbIlZlYzMiLCJjb25zdHJ1Y3RvciIsIngiLCJ5IiwieiIsImxlbmd0aCIsImFkZCIsInJocyIsImFkZDIiLCJsaHMiLCJhZGRTY2FsYXIiLCJzY2FsYXIiLCJjbG9uZSIsImNzdHIiLCJjb3B5IiwiY3Jvc3MiLCJseCIsImx5IiwibHoiLCJyeCIsInJ5IiwicnoiLCJkaXN0YW5jZSIsIk1hdGgiLCJzcXJ0IiwiZGl2IiwiZGl2MiIsImRpdlNjYWxhciIsImRvdCIsImVxdWFscyIsImxlbmd0aFNxIiwibGVycCIsImFscGhhIiwibXVsIiwibXVsMiIsIm11bFNjYWxhciIsIm5vcm1hbGl6ZSIsInNyYyIsImludkxlbmd0aCIsImZsb29yIiwiY2VpbCIsInJvdW5kIiwibWluIiwibWF4IiwicHJvamVjdCIsImFfZG90X2IiLCJiX2RvdF9iIiwicyIsInNldCIsInN1YiIsInN1YjIiLCJzdWJTY2FsYXIiLCJ0b1N0cmluZyIsIlpFUk8iLCJPYmplY3QiLCJmcmVlemUiLCJPTkUiLCJVUCIsIkRPV04iLCJSSUdIVCIsIkxFRlQiLCJGT1JXQVJEIiwiQkFDSyJdLCJtYXBwaW5ncyI6IkFBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLE1BQU1BLElBQUksQ0FBQztBQXNCUDtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNJQyxFQUFBQSxXQUFXQSxDQUFDQyxDQUFDLEdBQUcsQ0FBQyxFQUFFQyxDQUFDLEdBQUcsQ0FBQyxFQUFFQyxDQUFDLEdBQUcsQ0FBQyxFQUFFO0FBL0JqQztBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBSkksSUFBQSxJQUFBLENBS0FGLENBQUMsR0FBQSxLQUFBLENBQUEsQ0FBQTtBQUVEO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFKSSxJQUFBLElBQUEsQ0FLQUMsQ0FBQyxHQUFBLEtBQUEsQ0FBQSxDQUFBO0FBRUQ7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUpJLElBQUEsSUFBQSxDQUtBQyxDQUFDLEdBQUEsS0FBQSxDQUFBLENBQUE7QUFhRyxJQUFBLElBQUlGLENBQUMsQ0FBQ0csTUFBTSxLQUFLLENBQUMsRUFBRTtBQUNoQixNQUFBLElBQUksQ0FBQ0gsQ0FBQyxHQUFHQSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUE7QUFDYixNQUFBLElBQUksQ0FBQ0MsQ0FBQyxHQUFHRCxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUE7QUFDYixNQUFBLElBQUksQ0FB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
