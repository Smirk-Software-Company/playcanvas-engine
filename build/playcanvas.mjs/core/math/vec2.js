import { math } from './math.js';

/**
 * A 2-dimensional vector.
 *
 * @category Math
 */
class Vec2 {
  /**
   * Create a new Vec2 instance.
   *
   * @param {number|number[]} [x] - The x value. Defaults to 0. If x is an array of length 2, the
   * array will be used to populate all components.
   * @param {number} [y] - The y value. Defaults to 0.
   * @example
   * const v = new pc.Vec2(1, 2);
   */
  constructor(x = 0, y = 0) {
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
    if (x.length === 2) {
      this.x = x[0];
      this.y = x[1];
    } else {
      this.x = x;
      this.y = y;
    }
  }

  /**
   * Adds a 2-dimensional vector to another in place.
   *
   * @param {Vec2} rhs - The vector to add to the specified vector.
   * @returns {Vec2} Self for chaining.
   * @example
   * const a = new pc.Vec2(10, 10);
   * const b = new pc.Vec2(20, 20);
   *
   * a.add(b);
   *
   * // Outputs [30, 30]
   * console.log("The result of the addition is: " + a.toString());
   */
  add(rhs) {
    this.x += rhs.x;
    this.y += rhs.y;
    return this;
  }

  /**
   * Adds two 2-dimensional vectors together and returns the result.
   *
   * @param {Vec2} lhs - The first vector operand for the addition.
   * @param {Vec2} rhs - The second vector operand for the addition.
   * @returns {Vec2} Self for chaining.
   * @example
   * const a = new pc.Vec2(10, 10);
   * const b = new pc.Vec2(20, 20);
   * const r = new pc.Vec2();
   *
   * r.add2(a, b);
   * // Outputs [30, 30]
   *
   * console.log("The result of the addition is: " + r.toString());
   */
  add2(lhs, rhs) {
    this.x = lhs.x + rhs.x;
    this.y = lhs.y + rhs.y;
    return this;
  }

  /**
   * Adds a number to each element of a vector.
   *
   * @param {number} scalar - The number to add.
   * @returns {Vec2} Self for chaining.
   * @example
   * const vec = new pc.Vec2(3, 4);
   *
   * vec.addScalar(2);
   *
   * // Outputs [5, 6]
   * console.log("The result of the addition is: " + vec.toString());
   */
  addScalar(scalar) {
    this.x += scalar;
    this.y += scalar;
    return this;
  }

  /**
   * Returns an identical copy of the specified 2-dimensional vector.
   *
   * @returns {this} A 2-dimensional vector containing the result of the cloning.
   * @example
   * const v = new pc.Vec2(10, 20);
   * const vclone = v.clone();
   * console.log("The result of the cloning is: " + vclone.toString());
   */
  clone() {
    /** @type {this} */
    const cstr = this.constructor;
    return new cstr(this.x, this.y);
  }

  /**
   * Copies the contents of a source 2-dimensional vector to a destination 2-dimensional vector.
   *
   * @param {Vec2} rhs - A vector to copy to the specified vector.
   * @returns {Vec2} Self for chaining.
   * @example
   * const src = new pc.Vec2(10, 20);
   * const dst = new pc.Vec2();
   *
   * dst.copy(src);
   *
   * console.log("The two vectors are " + (dst.equals(src) ? "equal" : "different"));
   */
  copy(rhs) {
    this.x = rhs.x;
    this.y = rhs.y;
    return this;
  }

  /**
   * Returns the result of a cross product operation performed on the two specified 2-dimensional
   * vectors.
   *
   * @param {Vec2} rhs - The second 2-dimensional vector operand of the cross product.
   * @returns {number} The cross product of the two vectors.
   * @example
   * const right = new pc.Vec2(1, 0);
   * const up = new pc.Vec2(0, 1);
   * const crossProduct = right.cross(up);
   *
   * // Prints 1
   * console.log("The result of the cross product is: " + crossProduct);
   */
  cross(rhs) {
    return this.x * rhs.y - this.y * rhs.x;
  }

  /**
   * Returns the distance between the two specified 2-dimensional vectors.
   *
   * @param {Vec2} rhs - The second 2-dimensional vector to test.
   * @returns {number} The distance between the two vectors.
   * @example
   * const v1 = new pc.Vec2(5, 10);
   * const v2 = new pc.Vec2(10, 20);
   * const d = v1.distance(v2);
   * console.log("The distance between v1 and v2 is: " + d);
   */
  distance(rhs) {
    const x = this.x - rhs.x;
    const y = this.y - rhs.y;
    return Math.sqrt(x * x + y * y);
  }

  /**
   * Divides a 2-dimensional vector by another in place.
   *
   * @param {Vec2} rhs - The vector to divide the specified vector by.
   * @returns {Vec2} Self for chaining.
   * @example
   * const a = new pc.Vec2(4, 9);
   * const b = new pc.Vec2(2, 3);
   *
   * a.div(b);
   *
   * // Outputs [2, 3]
   * console.log("The result of the division is: " + a.toString());
   */
  div(rhs) {
    this.x /= rhs.x;
    this.y /= rhs.y;
    return this;
  }

  /**
   * Divides one 2-dimensional vector by another and writes the result to the specified vector.
   *
   * @param {Vec2} lhs - The dividend vector (the vector being divided).
   * @param {Vec2} rhs - The divisor vector (the vector dividing the dividend).
   * @returns {Vec2} Self for chaining.
   * @example
   * const a = new pc.Vec2(4, 9);
   * const b = new pc.Vec2(2, 3);
   * const r = new pc.Vec2();
   *
   * r.div2(a, b);
   * // Outputs [2, 3]
   *
   * console.log("The result of the division is: " + r.toString());
   */
  div2(lhs, rhs) {
    this.x = lhs.x / rhs.x;
    this.y = lhs.y / rhs.y;
    return this;
  }

  /**
   * Divides each element of a vector by a number.
   *
   * @param {number} scalar - The number to divide by.
   * @returns {Vec2} Self for chaining.
   * @example
   * const vec = new pc.Vec2(3, 6);
   *
   * vec.divScalar(3);
   *
   * // Outputs [1, 2]
   * console.log("The result of the division is: " + vec.toString());
   */
  divScalar(scalar) {
    this.x /= scalar;
    this.y /= scalar;
    return this;
  }

  /**
   * Returns the result of a dot product operation performed on the two specified 2-dimensional
   * vectors.
   *
   * @param {Vec2} rhs - The second 2-dimensional vector operand of the dot product.
   * @returns {number} The result of the dot product operation.
   * @example
   * const v1 = new pc.Vec2(5, 10);
   * const v2 = new pc.Vec2(10, 20);
   * const v1dotv2 = v1.dot(v2);
   * console.log("The result of the dot product is: " + v1dotv2);
   */
  dot(rhs) {
    return this.x * rhs.x + this.y * rhs.y;
  }

  /**
   * Reports whether two vectors are equal.
   *
   * @param {Vec2} rhs - The vector to compare to the specified vector.
   * @returns {boolean} True if the vectors are equal and false otherwise.
   * @example
   * const a = new pc.Vec2(1, 2);
   * const b = new pc.Vec2(4, 5);
   * console.log("The two vectors are " + (a.equals(b) ? "equal" : "different"));
   */
  equals(rhs) {
    return this.x === rhs.x && this.y === rhs.y;
  }

  /**
   * Returns the magnitude of the specified 2-dimensional vector.
   *
   * @returns {number} The magnitude of the specified 2-dimensional vector.
   * @example
   * const vec = new pc.Vec2(3, 4);
   * const len = vec.length();
   * // Outputs 5
   * console.log("The length of the vector is: " + len);
   */
  length() {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  /**
   * Returns the magnitude squared of the specified 2-dimensional vector.
   *
   * @returns {number} The magnitude of the specified 2-dimensional vector.
   * @example
   * const vec = new pc.Vec2(3, 4);
   * const len = vec.lengthSq();
   * // Outputs 25
   * console.log("The length squared of the vector is: " + len);
   */
  lengthSq() {
    return this.x * this.x + this.y * this.y;
  }

  /**
   * Returns the result of a linear interpolation between two specified 2-dimensional vectors.
   *
   * @param {Vec2} lhs - The 2-dimensional to interpolate from.
   * @param {Vec2} rhs - The 2-dimensional to interpolate to.
   * @param {number} alpha - The value controlling the point of interpolation. Between 0 and 1,
   * the linear interpolant will occur on a straight line between lhs and rhs. Outside of this
   * range, the linear interpolant will occur on a ray extrapolated from this line.
   * @returns {Vec2} Self for chaining.
   * @example
   * const a = new pc.Vec2(0, 0);
   * const b = new pc.Vec2(10, 10);
   * const r = new pc.Vec2();
   *
   * r.lerp(a, b, 0);   // r is equal to a
   * r.lerp(a, b, 0.5); // r is 5, 5
   * r.lerp(a, b, 1);   // r is equal to b
   */
  lerp(lhs, rhs, alpha) {
    this.x = lhs.x + alpha * (rhs.x - lhs.x);
    this.y = lhs.y + alpha * (rhs.y - lhs.y);
    return this;
  }

  /**
   * Multiplies a 2-dimensional vector to another in place.
   *
   * @param {Vec2} rhs - The 2-dimensional vector used as the second multiplicand of the operation.
   * @returns {Vec2} Self for chaining.
   * @example
   * const a = new pc.Vec2(2, 3);
   * const b = new pc.Vec2(4, 5);
   *
   * a.mul(b);
   *
   * // Outputs 8, 15
   * console.log("The result of the multiplication is: " + a.toString());
   */
  mul(rhs) {
    this.x *= rhs.x;
    this.y *= rhs.y;
    return this;
  }

  /**
   * Returns the result of multiplying the specified 2-dimensional vectors together.
   *
   * @param {Vec2} lhs - The 2-dimensional vector used as the first multiplicand of the operation.
   * @param {Vec2} rhs - The 2-dimensional vector used as the second multiplicand of the operation.
   * @returns {Vec2} Self for chaining.
   * @example
   * const a = new pc.Vec2(2, 3);
   * const b = new pc.Vec2(4, 5);
   * const r = new pc.Vec2();
   *
   * r.mul2(a, b);
   *
   * // Outputs 8, 15
   * console.log("The result of the multiplication is: " + r.toString());
   */
  mul2(lhs, rhs) {
    this.x = lhs.x * rhs.x;
    this.y = lhs.y * rhs.y;
    return this;
  }

  /**
   * Multiplies each element of a vector by a number.
   *
   * @param {number} scalar - The number to multiply by.
   * @returns {Vec2} Self for chaining.
   * @example
   * const vec = new pc.Vec2(3, 6);
   *
   * vec.mulScalar(3);
   *
   * // Outputs [9, 18]
   * console.log("The result of the multiplication is: " + vec.toString());
   */
  mulScalar(scalar) {
    this.x *= scalar;
    this.y *= scalar;
    return this;
  }

  /**
   * Returns this 2-dimensional vector converted to a unit vector in place. If the vector has a
   * length of zero, the vector's elements will be set to zero.
   *
   * @param {Vec2} [src] - The vector to normalize. If not set, the operation is done in place.
   * @returns {Vec2} Self for chaining.
   * @example
   * const v = new pc.Vec2(25, 0);
   *
   * v.normalize();
   *
   * // Outputs 1, 0
   * console.log("The result of the vector normalization is: " + v.toString());
   */
  normalize(src = this) {
    const lengthSq = src.x * src.x + src.y * src.y;
    if (lengthSq > 0) {
      const invLength = 1 / Math.sqrt(lengthSq);
      this.x = src.x * invLength;
      this.y = src.y * invLength;
    }
    return this;
  }

  /**
   * Rotate a vector by an angle in degrees.
   *
   * @param {number} degrees - The number to degrees to rotate the vector by.
   * @returns {Vec2} Self for chaining.
   * @example
   * const v = new pc.Vec2(0, 10);
   *
   * v.rotate(45); // rotates by 45 degrees
   *
   * // Outputs [7.071068.., 7.071068..]
   * console.log("Vector after rotation is: " + v.toString());
   */
  rotate(degrees) {
    const angle = Math.atan2(this.x, this.y) + degrees * math.DEG_TO_RAD;
    const len = Math.sqrt(this.x * this.x + this.y * this.y);
    this.x = Math.sin(angle) * len;
    this.y = Math.cos(angle) * len;
    return this;
  }

  /**
   * Returns the angle in degrees of the specified 2-dimensional vector.
   *
   * @returns {number} The angle in degrees of the specified 2-dimensional vector.
   * @example
   * const v = new pc.Vec2(6, 0);
   * const angle = v.angle();
   * // Outputs 90..
   * console.log("The angle of the vector is: " + angle);
   */
  angle() {
    return Math.atan2(this.x, this.y) * math.RAD_TO_DEG;
  }

  /**
   * Returns the shortest Euler angle between two 2-dimensional vectors.
   *
   * @param {Vec2} rhs - The 2-dimensional vector to calculate angle to.
   * @returns {number} The shortest angle in degrees between two 2-dimensional vectors.
   * @example
   * const a = new pc.Vec2(0, 10); // up
   * const b = new pc.Vec2(1, -1); // down-right
   * const angle = a.angleTo(b);
   * // Outputs 135..
   * console.log("The angle between vectors a and b: " + angle);
   */
  angleTo(rhs) {
    return Math.atan2(this.x * rhs.y + this.y * rhs.x, this.x * rhs.x + this.y * rhs.y) * math.RAD_TO_DEG;
  }

  /**
   * Each element is set to the largest integer less than or equal to its value.
   *
   * @param {Vec2} [src] - The vector to floor. If not set, the operation is done in place.
   * @returns {Vec2} Self for chaining.
   */
  floor(src = this) {
    this.x = Math.floor(src.x);
    this.y = Math.floor(src.y);
    return this;
  }

  /**
   * Each element is rounded up to the next largest integer.
   *
   * @param {Vec2} [src] - The vector to ceil. If not set, the operation is done in place.
   * @returns {Vec2} Self for chaining.
   */
  ceil(src = this) {
    this.x = Math.ceil(src.x);
    this.y = Math.ceil(src.y);
    return this;
  }

  /**
   * Each element is rounded up or down to the nearest integer.
   *
   * @param {Vec2} [src] - The vector to round. If not set, the operation is done in place.
   * @returns {Vec2} Self for chaining.
   */
  round(src = this) {
    this.x = Math.round(src.x);
    this.y = Math.round(src.y);
    return this;
  }

  /**
   * Each element is assigned a value from rhs parameter if it is smaller.
   *
   * @param {Vec2} rhs - The 2-dimensional vector used as the source of elements to compare to.
   * @returns {Vec2} Self for chaining.
   */
  min(rhs) {
    if (rhs.x < this.x) this.x = rhs.x;
    if (rhs.y < this.y) this.y = rhs.y;
    return this;
  }

  /**
   * Each element is assigned a value from rhs parameter if it is larger.
   *
   * @param {Vec2} rhs - The 2-dimensional vector used as the source of elements to compare to.
   * @returns {Vec2} Self for chaining.
   */
  max(rhs) {
    if (rhs.x > this.x) this.x = rhs.x;
    if (rhs.y > this.y) this.y = rhs.y;
    return this;
  }

  /**
   * Sets the specified 2-dimensional vector to the supplied numerical values.
   *
   * @param {number} x - The value to set on the first component of the vector.
   * @param {number} y - The value to set on the second component of the vector.
   * @returns {Vec2} Self for chaining.
   * @example
   * const v = new pc.Vec2();
   * v.set(5, 10);
   *
   * // Outputs 5, 10
   * console.log("The result of the vector set is: " + v.toString());
   */
  set(x, y) {
    this.x = x;
    this.y = y;
    return this;
  }

  /**
   * Subtracts a 2-dimensional vector from another in place.
   *
   * @param {Vec2} rhs - The vector to subtract from the specified vector.
   * @returns {Vec2} Self for chaining.
   * @example
   * const a = new pc.Vec2(10, 10);
   * const b = new pc.Vec2(20, 20);
   *
   * a.sub(b);
   *
   * // Outputs [-10, -10]
   * console.log("The result of the subtraction is: " + a.toString());
   */
  sub(rhs) {
    this.x -= rhs.x;
    this.y -= rhs.y;
    return this;
  }

  /**
   * Subtracts two 2-dimensional vectors from one another and returns the result.
   *
   * @param {Vec2} lhs - The first vector operand for the subtraction.
   * @param {Vec2} rhs - The second vector operand for the subtraction.
   * @returns {Vec2} Self for chaining.
   * @example
   * const a = new pc.Vec2(10, 10);
   * const b = new pc.Vec2(20, 20);
   * const r = new pc.Vec2();
   *
   * r.sub2(a, b);
   *
   * // Outputs [-10, -10]
   * console.log("The result of the subtraction is: " + r.toString());
   */
  sub2(lhs, rhs) {
    this.x = lhs.x - rhs.x;
    this.y = lhs.y - rhs.y;
    return this;
  }

  /**
   * Subtracts a number from each element of a vector.
   *
   * @param {number} scalar - The number to subtract.
   * @returns {Vec2} Self for chaining.
   * @example
   * const vec = new pc.Vec2(3, 4);
   *
   * vec.subScalar(2);
   *
   * // Outputs [1, 2]
   * console.log("The result of the subtraction is: " + vec.toString());
   */
  subScalar(scalar) {
    this.x -= scalar;
    this.y -= scalar;
    return this;
  }

  /**
   * Converts the vector to string form.
   *
   * @returns {string} The vector in string form.
   * @example
   * const v = new pc.Vec2(20, 10);
   * // Outputs [20, 10]
   * console.log(v.toString());
   */
  toString() {
    return `[${this.x}, ${this.y}]`;
  }

  /**
   * Calculates the angle between two Vec2's in radians.
   *
   * @param {Vec2} lhs - The first vector operand for the calculation.
   * @param {Vec2} rhs - The second vector operand for the calculation.
   * @returns {number} The calculated angle in radians.
   * @ignore
   */
  static angleRad(lhs, rhs) {
    return Math.atan2(lhs.x * rhs.y - lhs.y * rhs.x, lhs.x * rhs.x + lhs.y * rhs.y);
  }

  /**
   * A constant vector set to [0, 0].
   *
   * @type {Vec2}
   * @readonly
   */
}
Vec2.ZERO = Object.freeze(new Vec2(0, 0));
/**
 * A constant vector set to [1, 1].
 *
 * @type {Vec2}
 * @readonly
 */
Vec2.ONE = Object.freeze(new Vec2(1, 1));
/**
 * A constant vector set to [0, 1].
 *
 * @type {Vec2}
 * @readonly
 */
Vec2.UP = Object.freeze(new Vec2(0, 1));
/**
 * A constant vector set to [0, -1].
 *
 * @type {Vec2}
 * @readonly
 */
Vec2.DOWN = Object.freeze(new Vec2(0, -1));
/**
 * A constant vector set to [1, 0].
 *
 * @type {Vec2}
 * @readonly
 */
Vec2.RIGHT = Object.freeze(new Vec2(1, 0));
/**
 * A constant vector set to [-1, 0].
 *
 * @type {Vec2}
 * @readonly
 */
Vec2.LEFT = Object.freeze(new Vec2(-1, 0));

export { Vec2 };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmVjMi5qcyIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL2NvcmUvbWF0aC92ZWMyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IG1hdGggfSBmcm9tICcuL21hdGguanMnO1xuXG4vKipcbiAqIEEgMi1kaW1lbnNpb25hbCB2ZWN0b3IuXG4gKlxuICogQGNhdGVnb3J5IE1hdGhcbiAqL1xuY2xhc3MgVmVjMiB7XG4gICAgLyoqXG4gICAgICogVGhlIGZpcnN0IGNvbXBvbmVudCBvZiB0aGUgdmVjdG9yLlxuICAgICAqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKi9cbiAgICB4O1xuXG4gICAgLyoqXG4gICAgICogVGhlIHNlY29uZCBjb21wb25lbnQgb2YgdGhlIHZlY3Rvci5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtudW1iZXJ9XG4gICAgICovXG4gICAgeTtcblxuICAgIC8qKlxuICAgICAqIENyZWF0ZSBhIG5ldyBWZWMyIGluc3RhbmNlLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtudW1iZXJ8bnVtYmVyW119IFt4XSAtIFRoZSB4IHZhbHVlLiBEZWZhdWx0cyB0byAwLiBJZiB4IGlzIGFuIGFycmF5IG9mIGxlbmd0aCAyLCB0aGVcbiAgICAgKiBhcnJheSB3aWxsIGJlIHVzZWQgdG8gcG9wdWxhdGUgYWxsIGNvbXBvbmVudHMuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFt5XSAtIFRoZSB5IHZhbHVlLiBEZWZhdWx0cyB0byAwLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogY29uc3QgdiA9IG5ldyBwYy5WZWMyKDEsIDIpO1xuICAgICAqL1xuICAgIGNvbnN0cnVjdG9yKHggPSAwLCB5ID0gMCkge1xuICAgICAgICBpZiAoeC5sZW5ndGggPT09IDIpIHtcbiAgICAgICAgICAgIHRoaXMueCA9IHhbMF07XG4gICAgICAgICAgICB0aGlzLnkgPSB4WzFdO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy54ID0geDtcbiAgICAgICAgICAgIHRoaXMueSA9IHk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBZGRzIGEgMi1kaW1lbnNpb25hbCB2ZWN0b3IgdG8gYW5vdGhlciBpbiBwbGFjZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7VmVjMn0gcmhzIC0gVGhlIHZlY3RvciB0byBhZGQgdG8gdGhlIHNwZWNpZmllZCB2ZWN0b3IuXG4gICAgICogQHJldHVybnMge1ZlYzJ9IFNlbGYgZm9yIGNoYWluaW5nLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogY29uc3QgYSA9IG5ldyBwYy5WZWMyKDEwLCAxMCk7XG4gICAgICogY29uc3QgYiA9IG5ldyBwYy5WZWMyKDIwLCAyMCk7XG4gICAgICpcbiAgICAgKiBhLmFkZChiKTtcbiAgICAgKlxuICAgICAqIC8vIE91dHB1dHMgWzMwLCAzMF1cbiAgICAgKiBjb25zb2xlLmxvZyhcIlRoZSByZXN1bHQgb2YgdGhlIGFkZGl0aW9uIGlzOiBcIiArIGEudG9TdHJpbmcoKSk7XG4gICAgICovXG4gICAgYWRkKHJocykge1xuICAgICAgICB0aGlzLnggKz0gcmhzLng7XG4gICAgICAgIHRoaXMueSArPSByaHMueTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBZGRzIHR3byAyLWRpbWVuc2lvbmFsIHZlY3RvcnMgdG9nZXRoZXIgYW5kIHJldHVybnMgdGhlIHJlc3VsdC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7VmVjMn0gbGhzIC0gVGhlIGZpcnN0IHZlY3RvciBvcGVyYW5kIGZvciB0aGUgYWRkaXRpb24uXG4gICAgICogQHBhcmFtIHtWZWMyfSByaHMgLSBUaGUgc2Vjb25kIHZlY3RvciBvcGVyYW5kIGZvciB0aGUgYWRkaXRpb24uXG4gICAgICogQHJldHVybnMge1ZlYzJ9IFNlbGYgZm9yIGNoYWluaW5nLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogY29uc3QgYSA9IG5ldyBwYy5WZWMyKDEwLCAxMCk7XG4gICAgICogY29uc3QgYiA9IG5ldyBwYy5WZWMyKDIwLCAyMCk7XG4gICAgICogY29uc3QgciA9IG5ldyBwYy5WZWMyKCk7XG4gICAgICpcbiAgICAgKiByLmFkZDIoYSwgYik7XG4gICAgICogLy8gT3V0cHV0cyBbMzAsIDMwXVxuICAgICAqXG4gICAgICogY29uc29sZS5sb2coXCJUaGUgcmVzdWx0IG9mIHRoZSBhZGRpdGlvbiBpczogXCIgKyByLnRvU3RyaW5nKCkpO1xuICAgICAqL1xuICAgIGFkZDIobGhzLCByaHMpIHtcbiAgICAgICAgdGhpcy54ID0gbGhzLnggKyByaHMueDtcbiAgICAgICAgdGhpcy55ID0gbGhzLnkgKyByaHMueTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBZGRzIGEgbnVtYmVyIHRvIGVhY2ggZWxlbWVudCBvZiBhIHZlY3Rvci5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBzY2FsYXIgLSBUaGUgbnVtYmVyIHRvIGFkZC5cbiAgICAgKiBAcmV0dXJucyB7VmVjMn0gU2VsZiBmb3IgY2hhaW5pbmcuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBjb25zdCB2ZWMgPSBuZXcgcGMuVmVjMigzLCA0KTtcbiAgICAgKlxuICAgICAqIHZlYy5hZGRTY2FsYXIoMik7XG4gICAgICpcbiAgICAgKiAvLyBPdXRwdXRzIFs1LCA2XVxuICAgICAqIGNvbnNvbGUubG9nKFwiVGhlIHJlc3VsdCBvZiB0aGUgYWRkaXRpb24gaXM6IFwiICsgdmVjLnRvU3RyaW5nKCkpO1xuICAgICAqL1xuICAgIGFkZFNjYWxhcihzY2FsYXIpIHtcbiAgICAgICAgdGhpcy54ICs9IHNjYWxhcjtcbiAgICAgICAgdGhpcy55ICs9IHNjYWxhcjtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGFuIGlkZW50aWNhbCBjb3B5IG9mIHRoZSBzcGVjaWZpZWQgMi1kaW1lbnNpb25hbCB2ZWN0b3IuXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7dGhpc30gQSAyLWRpbWVuc2lvbmFsIHZlY3RvciBjb250YWluaW5nIHRoZSByZXN1bHQgb2YgdGhlIGNsb25pbmcuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBjb25zdCB2ID0gbmV3IHBjLlZlYzIoMTAsIDIwKTtcbiAgICAgKiBjb25zdCB2Y2xvbmUgPSB2LmNsb25lKCk7XG4gICAgICogY29uc29sZS5sb2coXCJUaGUgcmVzdWx0IG9mIHRoZSBjbG9uaW5nIGlzOiBcIiArIHZjbG9uZS50b1N0cmluZygpKTtcbiAgICAgKi9cbiAgICBjbG9uZSgpIHtcbiAgICAgICAgLyoqIEB0eXBlIHt0aGlzfSAqL1xuICAgICAgICBjb25zdCBjc3RyID0gdGhpcy5jb25zdHJ1Y3RvcjtcbiAgICAgICAgcmV0dXJuIG5ldyBjc3RyKHRoaXMueCwgdGhpcy55KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDb3BpZXMgdGhlIGNvbnRlbnRzIG9mIGEgc291cmNlIDItZGltZW5zaW9uYWwgdmVjdG9yIHRvIGEgZGVzdGluYXRpb24gMi1kaW1lbnNpb25hbCB2ZWN0b3IuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1ZlYzJ9IHJocyAtIEEgdmVjdG9yIHRvIGNvcHkgdG8gdGhlIHNwZWNpZmllZCB2ZWN0b3IuXG4gICAgICogQHJldHVybnMge1ZlYzJ9IFNlbGYgZm9yIGNoYWluaW5nLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogY29uc3Qgc3JjID0gbmV3IHBjLlZlYzIoMTAsIDIwKTtcbiAgICAgKiBjb25zdCBkc3QgPSBuZXcgcGMuVmVjMigpO1xuICAgICAqXG4gICAgICogZHN0LmNvcHkoc3JjKTtcbiAgICAgKlxuICAgICAqIGNvbnNvbGUubG9nKFwiVGhlIHR3byB2ZWN0b3JzIGFyZSBcIiArIChkc3QuZXF1YWxzKHNyYykgPyBcImVxdWFsXCIgOiBcImRpZmZlcmVudFwiKSk7XG4gICAgICovXG4gICAgY29weShyaHMpIHtcbiAgICAgICAgdGhpcy54ID0gcmhzLng7XG4gICAgICAgIHRoaXMueSA9IHJocy55O1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIHJlc3VsdCBvZiBhIGNyb3NzIHByb2R1Y3Qgb3BlcmF0aW9uIHBlcmZvcm1lZCBvbiB0aGUgdHdvIHNwZWNpZmllZCAyLWRpbWVuc2lvbmFsXG4gICAgICogdmVjdG9ycy5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7VmVjMn0gcmhzIC0gVGhlIHNlY29uZCAyLWRpbWVuc2lvbmFsIHZlY3RvciBvcGVyYW5kIG9mIHRoZSBjcm9zcyBwcm9kdWN0LlxuICAgICAqIEByZXR1cm5zIHtudW1iZXJ9IFRoZSBjcm9zcyBwcm9kdWN0IG9mIHRoZSB0d28gdmVjdG9ycy5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGNvbnN0IHJpZ2h0ID0gbmV3IHBjLlZlYzIoMSwgMCk7XG4gICAgICogY29uc3QgdXAgPSBuZXcgcGMuVmVjMigwLCAxKTtcbiAgICAgKiBjb25zdCBjcm9zc1Byb2R1Y3QgPSByaWdodC5jcm9zcyh1cCk7XG4gICAgICpcbiAgICAgKiAvLyBQcmludHMgMVxuICAgICAqIGNvbnNvbGUubG9nKFwiVGhlIHJlc3VsdCBvZiB0aGUgY3Jvc3MgcHJvZHVjdCBpczogXCIgKyBjcm9zc1Byb2R1Y3QpO1xuICAgICAqL1xuICAgIGNyb3NzKHJocykge1xuICAgICAgICByZXR1cm4gdGhpcy54ICogcmhzLnkgLSB0aGlzLnkgKiByaHMueDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBkaXN0YW5jZSBiZXR3ZWVuIHRoZSB0d28gc3BlY2lmaWVkIDItZGltZW5zaW9uYWwgdmVjdG9ycy5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7VmVjMn0gcmhzIC0gVGhlIHNlY29uZCAyLWRpbWVuc2lvbmFsIHZlY3RvciB0byB0ZXN0LlxuICAgICAqIEByZXR1cm5zIHtudW1iZXJ9IFRoZSBkaXN0YW5jZSBiZXR3ZWVuIHRoZSB0d28gdmVjdG9ycy5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGNvbnN0IHYxID0gbmV3IHBjLlZlYzIoNSwgMTApO1xuICAgICAqIGNvbnN0IHYyID0gbmV3IHBjLlZlYzIoMTAsIDIwKTtcbiAgICAgKiBjb25zdCBkID0gdjEuZGlzdGFuY2UodjIpO1xuICAgICAqIGNvbnNvbGUubG9nKFwiVGhlIGRpc3RhbmNlIGJldHdlZW4gdjEgYW5kIHYyIGlzOiBcIiArIGQpO1xuICAgICAqL1xuICAgIGRpc3RhbmNlKHJocykge1xuICAgICAgICBjb25zdCB4ID0gdGhpcy54IC0gcmhzLng7XG4gICAgICAgIGNvbnN0IHkgPSB0aGlzLnkgLSByaHMueTtcbiAgICAgICAgcmV0dXJuIE1hdGguc3FydCh4ICogeCArIHkgKiB5KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBEaXZpZGVzIGEgMi1kaW1lbnNpb25hbCB2ZWN0b3IgYnkgYW5vdGhlciBpbiBwbGFjZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7VmVjMn0gcmhzIC0gVGhlIHZlY3RvciB0byBkaXZpZGUgdGhlIHNwZWNpZmllZCB2ZWN0b3IgYnkuXG4gICAgICogQHJldHVybnMge1ZlYzJ9IFNlbGYgZm9yIGNoYWluaW5nLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogY29uc3QgYSA9IG5ldyBwYy5WZWMyKDQsIDkpO1xuICAgICAqIGNvbnN0IGIgPSBuZXcgcGMuVmVjMigyLCAzKTtcbiAgICAgKlxuICAgICAqIGEuZGl2KGIpO1xuICAgICAqXG4gICAgICogLy8gT3V0cHV0cyBbMiwgM11cbiAgICAgKiBjb25zb2xlLmxvZyhcIlRoZSByZXN1bHQgb2YgdGhlIGRpdmlzaW9uIGlzOiBcIiArIGEudG9TdHJpbmcoKSk7XG4gICAgICovXG4gICAgZGl2KHJocykge1xuICAgICAgICB0aGlzLnggLz0gcmhzLng7XG4gICAgICAgIHRoaXMueSAvPSByaHMueTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBEaXZpZGVzIG9uZSAyLWRpbWVuc2lvbmFsIHZlY3RvciBieSBhbm90aGVyIGFuZCB3cml0ZXMgdGhlIHJlc3VsdCB0byB0aGUgc3BlY2lmaWVkIHZlY3Rvci5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7VmVjMn0gbGhzIC0gVGhlIGRpdmlkZW5kIHZlY3RvciAodGhlIHZlY3RvciBiZWluZyBkaXZpZGVkKS5cbiAgICAgKiBAcGFyYW0ge1ZlYzJ9IHJocyAtIFRoZSBkaXZpc29yIHZlY3RvciAodGhlIHZlY3RvciBkaXZpZGluZyB0aGUgZGl2aWRlbmQpLlxuICAgICAqIEByZXR1cm5zIHtWZWMyfSBTZWxmIGZvciBjaGFpbmluZy5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGNvbnN0IGEgPSBuZXcgcGMuVmVjMig0LCA5KTtcbiAgICAgKiBjb25zdCBiID0gbmV3IHBjLlZlYzIoMiwgMyk7XG4gICAgICogY29uc3QgciA9IG5ldyBwYy5WZWMyKCk7XG4gICAgICpcbiAgICAgKiByLmRpdjIoYSwgYik7XG4gICAgICogLy8gT3V0cHV0cyBbMiwgM11cbiAgICAgKlxuICAgICAqIGNvbnNvbGUubG9nKFwiVGhlIHJlc3VsdCBvZiB0aGUgZGl2aXNpb24gaXM6IFwiICsgci50b1N0cmluZygpKTtcbiAgICAgKi9cbiAgICBkaXYyKGxocywgcmhzKSB7XG4gICAgICAgIHRoaXMueCA9IGxocy54IC8gcmhzLng7XG4gICAgICAgIHRoaXMueSA9IGxocy55IC8gcmhzLnk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRGl2aWRlcyBlYWNoIGVsZW1lbnQgb2YgYSB2ZWN0b3IgYnkgYSBudW1iZXIuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gc2NhbGFyIC0gVGhlIG51bWJlciB0byBkaXZpZGUgYnkuXG4gICAgICogQHJldHVybnMge1ZlYzJ9IFNlbGYgZm9yIGNoYWluaW5nLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogY29uc3QgdmVjID0gbmV3IHBjLlZlYzIoMywgNik7XG4gICAgICpcbiAgICAgKiB2ZWMuZGl2U2NhbGFyKDMpO1xuICAgICAqXG4gICAgICogLy8gT3V0cHV0cyBbMSwgMl1cbiAgICAgKiBjb25zb2xlLmxvZyhcIlRoZSByZXN1bHQgb2YgdGhlIGRpdmlzaW9uIGlzOiBcIiArIHZlYy50b1N0cmluZygpKTtcbiAgICAgKi9cbiAgICBkaXZTY2FsYXIoc2NhbGFyKSB7XG4gICAgICAgIHRoaXMueCAvPSBzY2FsYXI7XG4gICAgICAgIHRoaXMueSAvPSBzY2FsYXI7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgcmVzdWx0IG9mIGEgZG90IHByb2R1Y3Qgb3BlcmF0aW9uIHBlcmZvcm1lZCBvbiB0aGUgdHdvIHNwZWNpZmllZCAyLWRpbWVuc2lvbmFsXG4gICAgICogdmVjdG9ycy5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7VmVjMn0gcmhzIC0gVGhlIHNlY29uZCAyLWRpbWVuc2lvbmFsIHZlY3RvciBvcGVyYW5kIG9mIHRoZSBkb3QgcHJvZHVjdC5cbiAgICAgKiBAcmV0dXJucyB7bnVtYmVyfSBUaGUgcmVzdWx0IG9mIHRoZSBkb3QgcHJvZHVjdCBvcGVyYXRpb24uXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBjb25zdCB2MSA9IG5ldyBwYy5WZWMyKDUsIDEwKTtcbiAgICAgKiBjb25zdCB2MiA9IG5ldyBwYy5WZWMyKDEwLCAyMCk7XG4gICAgICogY29uc3QgdjFkb3R2MiA9IHYxLmRvdCh2Mik7XG4gICAgICogY29uc29sZS5sb2coXCJUaGUgcmVzdWx0IG9mIHRoZSBkb3QgcHJvZHVjdCBpczogXCIgKyB2MWRvdHYyKTtcbiAgICAgKi9cbiAgICBkb3QocmhzKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnggKiByaHMueCArIHRoaXMueSAqIHJocy55O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJlcG9ydHMgd2hldGhlciB0d28gdmVjdG9ycyBhcmUgZXF1YWwuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1ZlYzJ9IHJocyAtIFRoZSB2ZWN0b3IgdG8gY29tcGFyZSB0byB0aGUgc3BlY2lmaWVkIHZlY3Rvci5cbiAgICAgKiBAcmV0dXJucyB7Ym9vbGVhbn0gVHJ1ZSBpZiB0aGUgdmVjdG9ycyBhcmUgZXF1YWwgYW5kIGZhbHNlIG90aGVyd2lzZS5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGNvbnN0IGEgPSBuZXcgcGMuVmVjMigxLCAyKTtcbiAgICAgKiBjb25zdCBiID0gbmV3IHBjLlZlYzIoNCwgNSk7XG4gICAgICogY29uc29sZS5sb2coXCJUaGUgdHdvIHZlY3RvcnMgYXJlIFwiICsgKGEuZXF1YWxzKGIpID8gXCJlcXVhbFwiIDogXCJkaWZmZXJlbnRcIikpO1xuICAgICAqL1xuICAgIGVxdWFscyhyaHMpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMueCA9PT0gcmhzLnggJiYgdGhpcy55ID09PSByaHMueTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBtYWduaXR1ZGUgb2YgdGhlIHNwZWNpZmllZCAyLWRpbWVuc2lvbmFsIHZlY3Rvci5cbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtudW1iZXJ9IFRoZSBtYWduaXR1ZGUgb2YgdGhlIHNwZWNpZmllZCAyLWRpbWVuc2lvbmFsIHZlY3Rvci5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGNvbnN0IHZlYyA9IG5ldyBwYy5WZWMyKDMsIDQpO1xuICAgICAqIGNvbnN0IGxlbiA9IHZlYy5sZW5ndGgoKTtcbiAgICAgKiAvLyBPdXRwdXRzIDVcbiAgICAgKiBjb25zb2xlLmxvZyhcIlRoZSBsZW5ndGggb2YgdGhlIHZlY3RvciBpczogXCIgKyBsZW4pO1xuICAgICAqL1xuICAgIGxlbmd0aCgpIHtcbiAgICAgICAgcmV0dXJuIE1hdGguc3FydCh0aGlzLnggKiB0aGlzLnggKyB0aGlzLnkgKiB0aGlzLnkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIG1hZ25pdHVkZSBzcXVhcmVkIG9mIHRoZSBzcGVjaWZpZWQgMi1kaW1lbnNpb25hbCB2ZWN0b3IuXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7bnVtYmVyfSBUaGUgbWFnbml0dWRlIG9mIHRoZSBzcGVjaWZpZWQgMi1kaW1lbnNpb25hbCB2ZWN0b3IuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBjb25zdCB2ZWMgPSBuZXcgcGMuVmVjMigzLCA0KTtcbiAgICAgKiBjb25zdCBsZW4gPSB2ZWMubGVuZ3RoU3EoKTtcbiAgICAgKiAvLyBPdXRwdXRzIDI1XG4gICAgICogY29uc29sZS5sb2coXCJUaGUgbGVuZ3RoIHNxdWFyZWQgb2YgdGhlIHZlY3RvciBpczogXCIgKyBsZW4pO1xuICAgICAqL1xuICAgIGxlbmd0aFNxKCkge1xuICAgICAgICByZXR1cm4gdGhpcy54ICogdGhpcy54ICsgdGhpcy55ICogdGhpcy55O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIHJlc3VsdCBvZiBhIGxpbmVhciBpbnRlcnBvbGF0aW9uIGJldHdlZW4gdHdvIHNwZWNpZmllZCAyLWRpbWVuc2lvbmFsIHZlY3RvcnMuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1ZlYzJ9IGxocyAtIFRoZSAyLWRpbWVuc2lvbmFsIHRvIGludGVycG9sYXRlIGZyb20uXG4gICAgICogQHBhcmFtIHtWZWMyfSByaHMgLSBUaGUgMi1kaW1lbnNpb25hbCB0byBpbnRlcnBvbGF0ZSB0by5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gYWxwaGEgLSBUaGUgdmFsdWUgY29udHJvbGxpbmcgdGhlIHBvaW50IG9mIGludGVycG9sYXRpb24uIEJldHdlZW4gMCBhbmQgMSxcbiAgICAgKiB0aGUgbGluZWFyIGludGVycG9sYW50IHdpbGwgb2NjdXIgb24gYSBzdHJhaWdodCBsaW5lIGJldHdlZW4gbGhzIGFuZCByaHMuIE91dHNpZGUgb2YgdGhpc1xuICAgICAqIHJhbmdlLCB0aGUgbGluZWFyIGludGVycG9sYW50IHdpbGwgb2NjdXIgb24gYSByYXkgZXh0cmFwb2xhdGVkIGZyb20gdGhpcyBsaW5lLlxuICAgICAqIEByZXR1cm5zIHtWZWMyfSBTZWxmIGZvciBjaGFpbmluZy5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGNvbnN0IGEgPSBuZXcgcGMuVmVjMigwLCAwKTtcbiAgICAgKiBjb25zdCBiID0gbmV3IHBjLlZlYzIoMTAsIDEwKTtcbiAgICAgKiBjb25zdCByID0gbmV3IHBjLlZlYzIoKTtcbiAgICAgKlxuICAgICAqIHIubGVycChhLCBiLCAwKTsgICAvLyByIGlzIGVxdWFsIHRvIGFcbiAgICAgKiByLmxlcnAoYSwgYiwgMC41KTsgLy8gciBpcyA1LCA1XG4gICAgICogci5sZXJwKGEsIGIsIDEpOyAgIC8vIHIgaXMgZXF1YWwgdG8gYlxuICAgICAqL1xuICAgIGxlcnAobGhzLCByaHMsIGFscGhhKSB7XG4gICAgICAgIHRoaXMueCA9IGxocy54ICsgYWxwaGEgKiAocmhzLnggLSBsaHMueCk7XG4gICAgICAgIHRoaXMueSA9IGxocy55ICsgYWxwaGEgKiAocmhzLnkgLSBsaHMueSk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTXVsdGlwbGllcyBhIDItZGltZW5zaW9uYWwgdmVjdG9yIHRvIGFub3RoZXIgaW4gcGxhY2UuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1ZlYzJ9IHJocyAtIFRoZSAyLWRpbWVuc2lvbmFsIHZlY3RvciB1c2VkIGFzIHRoZSBzZWNvbmQgbXVsdGlwbGljYW5kIG9mIHRoZSBvcGVyYXRpb24uXG4gICAgICogQHJldHVybnMge1ZlYzJ9IFNlbGYgZm9yIGNoYWluaW5nLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogY29uc3QgYSA9IG5ldyBwYy5WZWMyKDIsIDMpO1xuICAgICAqIGNvbnN0IGIgPSBuZXcgcGMuVmVjMig0LCA1KTtcbiAgICAgKlxuICAgICAqIGEubXVsKGIpO1xuICAgICAqXG4gICAgICogLy8gT3V0cHV0cyA4LCAxNVxuICAgICAqIGNvbnNvbGUubG9nKFwiVGhlIHJlc3VsdCBvZiB0aGUgbXVsdGlwbGljYXRpb24gaXM6IFwiICsgYS50b1N0cmluZygpKTtcbiAgICAgKi9cbiAgICBtdWwocmhzKSB7XG4gICAgICAgIHRoaXMueCAqPSByaHMueDtcbiAgICAgICAgdGhpcy55ICo9IHJocy55O1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIHJlc3VsdCBvZiBtdWx0aXBseWluZyB0aGUgc3BlY2lmaWVkIDItZGltZW5zaW9uYWwgdmVjdG9ycyB0b2dldGhlci5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7VmVjMn0gbGhzIC0gVGhlIDItZGltZW5zaW9uYWwgdmVjdG9yIHVzZWQgYXMgdGhlIGZpcnN0IG11bHRpcGxpY2FuZCBvZiB0aGUgb3BlcmF0aW9uLlxuICAgICAqIEBwYXJhbSB7VmVjMn0gcmhzIC0gVGhlIDItZGltZW5zaW9uYWwgdmVjdG9yIHVzZWQgYXMgdGhlIHNlY29uZCBtdWx0aXBsaWNhbmQgb2YgdGhlIG9wZXJhdGlvbi5cbiAgICAgKiBAcmV0dXJucyB7VmVjMn0gU2VsZiBmb3IgY2hhaW5pbmcuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBjb25zdCBhID0gbmV3IHBjLlZlYzIoMiwgMyk7XG4gICAgICogY29uc3QgYiA9IG5ldyBwYy5WZWMyKDQsIDUpO1xuICAgICAqIGNvbnN0IHIgPSBuZXcgcGMuVmVjMigpO1xuICAgICAqXG4gICAgICogci5tdWwyKGEsIGIpO1xuICAgICAqXG4gICAgICogLy8gT3V0cHV0cyA4LCAxNVxuICAgICAqIGNvbnNvbGUubG9nKFwiVGhlIHJlc3VsdCBvZiB0aGUgbXVsdGlwbGljYXRpb24gaXM6IFwiICsgci50b1N0cmluZygpKTtcbiAgICAgKi9cbiAgICBtdWwyKGxocywgcmhzKSB7XG4gICAgICAgIHRoaXMueCA9IGxocy54ICogcmhzLng7XG4gICAgICAgIHRoaXMueSA9IGxocy55ICogcmhzLnk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTXVsdGlwbGllcyBlYWNoIGVsZW1lbnQgb2YgYSB2ZWN0b3IgYnkgYSBudW1iZXIuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gc2NhbGFyIC0gVGhlIG51bWJlciB0byBtdWx0aXBseSBieS5cbiAgICAgKiBAcmV0dXJucyB7VmVjMn0gU2VsZiBmb3IgY2hhaW5pbmcuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBjb25zdCB2ZWMgPSBuZXcgcGMuVmVjMigzLCA2KTtcbiAgICAgKlxuICAgICAqIHZlYy5tdWxTY2FsYXIoMyk7XG4gICAgICpcbiAgICAgKiAvLyBPdXRwdXRzIFs5LCAxOF1cbiAgICAgKiBjb25zb2xlLmxvZyhcIlRoZSByZXN1bHQgb2YgdGhlIG11bHRpcGxpY2F0aW9uIGlzOiBcIiArIHZlYy50b1N0cmluZygpKTtcbiAgICAgKi9cbiAgICBtdWxTY2FsYXIoc2NhbGFyKSB7XG4gICAgICAgIHRoaXMueCAqPSBzY2FsYXI7XG4gICAgICAgIHRoaXMueSAqPSBzY2FsYXI7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGlzIDItZGltZW5zaW9uYWwgdmVjdG9yIGNvbnZlcnRlZCB0byBhIHVuaXQgdmVjdG9yIGluIHBsYWNlLiBJZiB0aGUgdmVjdG9yIGhhcyBhXG4gICAgICogbGVuZ3RoIG9mIHplcm8sIHRoZSB2ZWN0b3IncyBlbGVtZW50cyB3aWxsIGJlIHNldCB0byB6ZXJvLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtWZWMyfSBbc3JjXSAtIFRoZSB2ZWN0b3IgdG8gbm9ybWFsaXplLiBJZiBub3Qgc2V0LCB0aGUgb3BlcmF0aW9uIGlzIGRvbmUgaW4gcGxhY2UuXG4gICAgICogQHJldHVybnMge1ZlYzJ9IFNlbGYgZm9yIGNoYWluaW5nLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogY29uc3QgdiA9IG5ldyBwYy5WZWMyKDI1LCAwKTtcbiAgICAgKlxuICAgICAqIHYubm9ybWFsaXplKCk7XG4gICAgICpcbiAgICAgKiAvLyBPdXRwdXRzIDEsIDBcbiAgICAgKiBjb25zb2xlLmxvZyhcIlRoZSByZXN1bHQgb2YgdGhlIHZlY3RvciBub3JtYWxpemF0aW9uIGlzOiBcIiArIHYudG9TdHJpbmcoKSk7XG4gICAgICovXG4gICAgbm9ybWFsaXplKHNyYyA9IHRoaXMpIHtcbiAgICAgICAgY29uc3QgbGVuZ3RoU3EgPSBzcmMueCAqIHNyYy54ICsgc3JjLnkgKiBzcmMueTtcbiAgICAgICAgaWYgKGxlbmd0aFNxID4gMCkge1xuICAgICAgICAgICAgY29uc3QgaW52TGVuZ3RoID0gMSAvIE1hdGguc3FydChsZW5ndGhTcSk7XG4gICAgICAgICAgICB0aGlzLnggPSBzcmMueCAqIGludkxlbmd0aDtcbiAgICAgICAgICAgIHRoaXMueSA9IHNyYy55ICogaW52TGVuZ3RoO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUm90YXRlIGEgdmVjdG9yIGJ5IGFuIGFuZ2xlIGluIGRlZ3JlZXMuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gZGVncmVlcyAtIFRoZSBudW1iZXIgdG8gZGVncmVlcyB0byByb3RhdGUgdGhlIHZlY3RvciBieS5cbiAgICAgKiBAcmV0dXJucyB7VmVjMn0gU2VsZiBmb3IgY2hhaW5pbmcuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBjb25zdCB2ID0gbmV3IHBjLlZlYzIoMCwgMTApO1xuICAgICAqXG4gICAgICogdi5yb3RhdGUoNDUpOyAvLyByb3RhdGVzIGJ5IDQ1IGRlZ3JlZXNcbiAgICAgKlxuICAgICAqIC8vIE91dHB1dHMgWzcuMDcxMDY4Li4sIDcuMDcxMDY4Li5dXG4gICAgICogY29uc29sZS5sb2coXCJWZWN0b3IgYWZ0ZXIgcm90YXRpb24gaXM6IFwiICsgdi50b1N0cmluZygpKTtcbiAgICAgKi9cbiAgICByb3RhdGUoZGVncmVlcykge1xuICAgICAgICBjb25zdCBhbmdsZSA9IE1hdGguYXRhbjIodGhpcy54LCB0aGlzLnkpICsgKGRlZ3JlZXMgKiBtYXRoLkRFR19UT19SQUQpO1xuICAgICAgICBjb25zdCBsZW4gPSBNYXRoLnNxcnQodGhpcy54ICogdGhpcy54ICsgdGhpcy55ICogdGhpcy55KTtcbiAgICAgICAgdGhpcy54ID0gTWF0aC5zaW4oYW5nbGUpICogbGVuO1xuICAgICAgICB0aGlzLnkgPSBNYXRoLmNvcyhhbmdsZSkgKiBsZW47XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIGFuZ2xlIGluIGRlZ3JlZXMgb2YgdGhlIHNwZWNpZmllZCAyLWRpbWVuc2lvbmFsIHZlY3Rvci5cbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtudW1iZXJ9IFRoZSBhbmdsZSBpbiBkZWdyZWVzIG9mIHRoZSBzcGVjaWZpZWQgMi1kaW1lbnNpb25hbCB2ZWN0b3IuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBjb25zdCB2ID0gbmV3IHBjLlZlYzIoNiwgMCk7XG4gICAgICogY29uc3QgYW5nbGUgPSB2LmFuZ2xlKCk7XG4gICAgICogLy8gT3V0cHV0cyA5MC4uXG4gICAgICogY29uc29sZS5sb2coXCJUaGUgYW5nbGUgb2YgdGhlIHZlY3RvciBpczogXCIgKyBhbmdsZSk7XG4gICAgICovXG4gICAgYW5nbGUoKSB7XG4gICAgICAgIHJldHVybiBNYXRoLmF0YW4yKHRoaXMueCwgdGhpcy55KSAqIG1hdGguUkFEX1RPX0RFRztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBzaG9ydGVzdCBFdWxlciBhbmdsZSBiZXR3ZWVuIHR3byAyLWRpbWVuc2lvbmFsIHZlY3RvcnMuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1ZlYzJ9IHJocyAtIFRoZSAyLWRpbWVuc2lvbmFsIHZlY3RvciB0byBjYWxjdWxhdGUgYW5nbGUgdG8uXG4gICAgICogQHJldHVybnMge251bWJlcn0gVGhlIHNob3J0ZXN0IGFuZ2xlIGluIGRlZ3JlZXMgYmV0d2VlbiB0d28gMi1kaW1lbnNpb25hbCB2ZWN0b3JzLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogY29uc3QgYSA9IG5ldyBwYy5WZWMyKDAsIDEwKTsgLy8gdXBcbiAgICAgKiBjb25zdCBiID0gbmV3IHBjLlZlYzIoMSwgLTEpOyAvLyBkb3duLXJpZ2h0XG4gICAgICogY29uc3QgYW5nbGUgPSBhLmFuZ2xlVG8oYik7XG4gICAgICogLy8gT3V0cHV0cyAxMzUuLlxuICAgICAqIGNvbnNvbGUubG9nKFwiVGhlIGFuZ2xlIGJldHdlZW4gdmVjdG9ycyBhIGFuZCBiOiBcIiArIGFuZ2xlKTtcbiAgICAgKi9cbiAgICBhbmdsZVRvKHJocykge1xuICAgICAgICByZXR1cm4gTWF0aC5hdGFuMih0aGlzLnggKiByaHMueSArIHRoaXMueSAqIHJocy54LCB0aGlzLnggKiByaHMueCArIHRoaXMueSAqIHJocy55KSAqIG1hdGguUkFEX1RPX0RFRztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBFYWNoIGVsZW1lbnQgaXMgc2V0IHRvIHRoZSBsYXJnZXN0IGludGVnZXIgbGVzcyB0aGFuIG9yIGVxdWFsIHRvIGl0cyB2YWx1ZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7VmVjMn0gW3NyY10gLSBUaGUgdmVjdG9yIHRvIGZsb29yLiBJZiBub3Qgc2V0LCB0aGUgb3BlcmF0aW9uIGlzIGRvbmUgaW4gcGxhY2UuXG4gICAgICogQHJldHVybnMge1ZlYzJ9IFNlbGYgZm9yIGNoYWluaW5nLlxuICAgICAqL1xuICAgIGZsb29yKHNyYyA9IHRoaXMpIHtcbiAgICAgICAgdGhpcy54ID0gTWF0aC5mbG9vcihzcmMueCk7XG4gICAgICAgIHRoaXMueSA9IE1hdGguZmxvb3Ioc3JjLnkpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBFYWNoIGVsZW1lbnQgaXMgcm91bmRlZCB1cCB0byB0aGUgbmV4dCBsYXJnZXN0IGludGVnZXIuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1ZlYzJ9IFtzcmNdIC0gVGhlIHZlY3RvciB0byBjZWlsLiBJZiBub3Qgc2V0LCB0aGUgb3BlcmF0aW9uIGlzIGRvbmUgaW4gcGxhY2UuXG4gICAgICogQHJldHVybnMge1ZlYzJ9IFNlbGYgZm9yIGNoYWluaW5nLlxuICAgICAqL1xuICAgIGNlaWwoc3JjID0gdGhpcykge1xuICAgICAgICB0aGlzLnggPSBNYXRoLmNlaWwoc3JjLngpO1xuICAgICAgICB0aGlzLnkgPSBNYXRoLmNlaWwoc3JjLnkpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBFYWNoIGVsZW1lbnQgaXMgcm91bmRlZCB1cCBvciBkb3duIHRvIHRoZSBuZWFyZXN0IGludGVnZXIuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1ZlYzJ9IFtzcmNdIC0gVGhlIHZlY3RvciB0byByb3VuZC4gSWYgbm90IHNldCwgdGhlIG9wZXJhdGlvbiBpcyBkb25lIGluIHBsYWNlLlxuICAgICAqIEByZXR1cm5zIHtWZWMyfSBTZWxmIGZvciBjaGFpbmluZy5cbiAgICAgKi9cbiAgICByb3VuZChzcmMgPSB0aGlzKSB7XG4gICAgICAgIHRoaXMueCA9IE1hdGgucm91bmQoc3JjLngpO1xuICAgICAgICB0aGlzLnkgPSBNYXRoLnJvdW5kKHNyYy55KTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRWFjaCBlbGVtZW50IGlzIGFzc2lnbmVkIGEgdmFsdWUgZnJvbSByaHMgcGFyYW1ldGVyIGlmIGl0IGlzIHNtYWxsZXIuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1ZlYzJ9IHJocyAtIFRoZSAyLWRpbWVuc2lvbmFsIHZlY3RvciB1c2VkIGFzIHRoZSBzb3VyY2Ugb2YgZWxlbWVudHMgdG8gY29tcGFyZSB0by5cbiAgICAgKiBAcmV0dXJucyB7VmVjMn0gU2VsZiBmb3IgY2hhaW5pbmcuXG4gICAgICovXG4gICAgbWluKHJocykge1xuICAgICAgICBpZiAocmhzLnggPCB0aGlzLngpIHRoaXMueCA9IHJocy54O1xuICAgICAgICBpZiAocmhzLnkgPCB0aGlzLnkpIHRoaXMueSA9IHJocy55O1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBFYWNoIGVsZW1lbnQgaXMgYXNzaWduZWQgYSB2YWx1ZSBmcm9tIHJocyBwYXJhbWV0ZXIgaWYgaXQgaXMgbGFyZ2VyLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtWZWMyfSByaHMgLSBUaGUgMi1kaW1lbnNpb25hbCB2ZWN0b3IgdXNlZCBhcyB0aGUgc291cmNlIG9mIGVsZW1lbnRzIHRvIGNvbXBhcmUgdG8uXG4gICAgICogQHJldHVybnMge1ZlYzJ9IFNlbGYgZm9yIGNoYWluaW5nLlxuICAgICAqL1xuICAgIG1heChyaHMpIHtcbiAgICAgICAgaWYgKHJocy54ID4gdGhpcy54KSB0aGlzLnggPSByaHMueDtcbiAgICAgICAgaWYgKHJocy55ID4gdGhpcy55KSB0aGlzLnkgPSByaHMueTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyB0aGUgc3BlY2lmaWVkIDItZGltZW5zaW9uYWwgdmVjdG9yIHRvIHRoZSBzdXBwbGllZCBudW1lcmljYWwgdmFsdWVzLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHggLSBUaGUgdmFsdWUgdG8gc2V0IG9uIHRoZSBmaXJzdCBjb21wb25lbnQgb2YgdGhlIHZlY3Rvci5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0geSAtIFRoZSB2YWx1ZSB0byBzZXQgb24gdGhlIHNlY29uZCBjb21wb25lbnQgb2YgdGhlIHZlY3Rvci5cbiAgICAgKiBAcmV0dXJucyB7VmVjMn0gU2VsZiBmb3IgY2hhaW5pbmcuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBjb25zdCB2ID0gbmV3IHBjLlZlYzIoKTtcbiAgICAgKiB2LnNldCg1LCAxMCk7XG4gICAgICpcbiAgICAgKiAvLyBPdXRwdXRzIDUsIDEwXG4gICAgICogY29uc29sZS5sb2coXCJUaGUgcmVzdWx0IG9mIHRoZSB2ZWN0b3Igc2V0IGlzOiBcIiArIHYudG9TdHJpbmcoKSk7XG4gICAgICovXG4gICAgc2V0KHgsIHkpIHtcbiAgICAgICAgdGhpcy54ID0geDtcbiAgICAgICAgdGhpcy55ID0geTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTdWJ0cmFjdHMgYSAyLWRpbWVuc2lvbmFsIHZlY3RvciBmcm9tIGFub3RoZXIgaW4gcGxhY2UuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1ZlYzJ9IHJocyAtIFRoZSB2ZWN0b3IgdG8gc3VidHJhY3QgZnJvbSB0aGUgc3BlY2lmaWVkIHZlY3Rvci5cbiAgICAgKiBAcmV0dXJucyB7VmVjMn0gU2VsZiBmb3IgY2hhaW5pbmcuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBjb25zdCBhID0gbmV3IHBjLlZlYzIoMTAsIDEwKTtcbiAgICAgKiBjb25zdCBiID0gbmV3IHBjLlZlYzIoMjAsIDIwKTtcbiAgICAgKlxuICAgICAqIGEuc3ViKGIpO1xuICAgICAqXG4gICAgICogLy8gT3V0cHV0cyBbLTEwLCAtMTBdXG4gICAgICogY29uc29sZS5sb2coXCJUaGUgcmVzdWx0IG9mIHRoZSBzdWJ0cmFjdGlvbiBpczogXCIgKyBhLnRvU3RyaW5nKCkpO1xuICAgICAqL1xuICAgIHN1YihyaHMpIHtcbiAgICAgICAgdGhpcy54IC09IHJocy54O1xuICAgICAgICB0aGlzLnkgLT0gcmhzLnk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU3VidHJhY3RzIHR3byAyLWRpbWVuc2lvbmFsIHZlY3RvcnMgZnJvbSBvbmUgYW5vdGhlciBhbmQgcmV0dXJucyB0aGUgcmVzdWx0LlxuICAgICAqXG4gICAgICogQHBhcmFtIHtWZWMyfSBsaHMgLSBUaGUgZmlyc3QgdmVjdG9yIG9wZXJhbmQgZm9yIHRoZSBzdWJ0cmFjdGlvbi5cbiAgICAgKiBAcGFyYW0ge1ZlYzJ9IHJocyAtIFRoZSBzZWNvbmQgdmVjdG9yIG9wZXJhbmQgZm9yIHRoZSBzdWJ0cmFjdGlvbi5cbiAgICAgKiBAcmV0dXJucyB7VmVjMn0gU2VsZiBmb3IgY2hhaW5pbmcuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBjb25zdCBhID0gbmV3IHBjLlZlYzIoMTAsIDEwKTtcbiAgICAgKiBjb25zdCBiID0gbmV3IHBjLlZlYzIoMjAsIDIwKTtcbiAgICAgKiBjb25zdCByID0gbmV3IHBjLlZlYzIoKTtcbiAgICAgKlxuICAgICAqIHIuc3ViMihhLCBiKTtcbiAgICAgKlxuICAgICAqIC8vIE91dHB1dHMgWy0xMCwgLTEwXVxuICAgICAqIGNvbnNvbGUubG9nKFwiVGhlIHJlc3VsdCBvZiB0aGUgc3VidHJhY3Rpb24gaXM6IFwiICsgci50b1N0cmluZygpKTtcbiAgICAgKi9cbiAgICBzdWIyKGxocywgcmhzKSB7XG4gICAgICAgIHRoaXMueCA9IGxocy54IC0gcmhzLng7XG4gICAgICAgIHRoaXMueSA9IGxocy55IC0gcmhzLnk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU3VidHJhY3RzIGEgbnVtYmVyIGZyb20gZWFjaCBlbGVtZW50IG9mIGEgdmVjdG9yLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHNjYWxhciAtIFRoZSBudW1iZXIgdG8gc3VidHJhY3QuXG4gICAgICogQHJldHVybnMge1ZlYzJ9IFNlbGYgZm9yIGNoYWluaW5nLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogY29uc3QgdmVjID0gbmV3IHBjLlZlYzIoMywgNCk7XG4gICAgICpcbiAgICAgKiB2ZWMuc3ViU2NhbGFyKDIpO1xuICAgICAqXG4gICAgICogLy8gT3V0cHV0cyBbMSwgMl1cbiAgICAgKiBjb25zb2xlLmxvZyhcIlRoZSByZXN1bHQgb2YgdGhlIHN1YnRyYWN0aW9uIGlzOiBcIiArIHZlYy50b1N0cmluZygpKTtcbiAgICAgKi9cbiAgICBzdWJTY2FsYXIoc2NhbGFyKSB7XG4gICAgICAgIHRoaXMueCAtPSBzY2FsYXI7XG4gICAgICAgIHRoaXMueSAtPSBzY2FsYXI7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ29udmVydHMgdGhlIHZlY3RvciB0byBzdHJpbmcgZm9ybS5cbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtzdHJpbmd9IFRoZSB2ZWN0b3IgaW4gc3RyaW5nIGZvcm0uXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBjb25zdCB2ID0gbmV3IHBjLlZlYzIoMjAsIDEwKTtcbiAgICAgKiAvLyBPdXRwdXRzIFsyMCwgMTBdXG4gICAgICogY29uc29sZS5sb2codi50b1N0cmluZygpKTtcbiAgICAgKi9cbiAgICB0b1N0cmluZygpIHtcbiAgICAgICAgcmV0dXJuIGBbJHt0aGlzLnh9LCAke3RoaXMueX1dYDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDYWxjdWxhdGVzIHRoZSBhbmdsZSBiZXR3ZWVuIHR3byBWZWMyJ3MgaW4gcmFkaWFucy5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7VmVjMn0gbGhzIC0gVGhlIGZpcnN0IHZlY3RvciBvcGVyYW5kIGZvciB0aGUgY2FsY3VsYXRpb24uXG4gICAgICogQHBhcmFtIHtWZWMyfSByaHMgLSBUaGUgc2Vjb25kIHZlY3RvciBvcGVyYW5kIGZvciB0aGUgY2FsY3VsYXRpb24uXG4gICAgICogQHJldHVybnMge251bWJlcn0gVGhlIGNhbGN1bGF0ZWQgYW5nbGUgaW4gcmFkaWFucy5cbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgc3RhdGljIGFuZ2xlUmFkKGxocywgcmhzKSB7XG4gICAgICAgIHJldHVybiBNYXRoLmF0YW4yKGxocy54ICogcmhzLnkgLSBsaHMueSAqIHJocy54LCBsaHMueCAqIHJocy54ICsgbGhzLnkgKiByaHMueSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQSBjb25zdGFudCB2ZWN0b3Igc2V0IHRvIFswLCAwXS5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtWZWMyfVxuICAgICAqIEByZWFkb25seVxuICAgICAqL1xuICAgIHN0YXRpYyBaRVJPID0gT2JqZWN0LmZyZWV6ZShuZXcgVmVjMigwLCAwKSk7XG5cbiAgICAvKipcbiAgICAgKiBBIGNvbnN0YW50IHZlY3RvciBzZXQgdG8gWzEsIDFdLlxuICAgICAqXG4gICAgICogQHR5cGUge1ZlYzJ9XG4gICAgICogQHJlYWRvbmx5XG4gICAgICovXG4gICAgc3RhdGljIE9ORSA9IE9iamVjdC5mcmVlemUobmV3IFZlYzIoMSwgMSkpO1xuXG4gICAgLyoqXG4gICAgICogQSBjb25zdGFudCB2ZWN0b3Igc2V0IHRvIFswLCAxXS5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtWZWMyfVxuICAgICAqIEByZWFkb25seVxuICAgICAqL1xuICAgIHN0YXRpYyBVUCA9IE9iamVjdC5mcmVlemUobmV3IFZlYzIoMCwgMSkpO1xuXG4gICAgLyoqXG4gICAgICogQSBjb25zdGFudCB2ZWN0b3Igc2V0IHRvIFswLCAtMV0uXG4gICAgICpcbiAgICAgKiBAdHlwZSB7VmVjMn1cbiAgICAgKiBAcmVhZG9ubHlcbiAgICAgKi9cbiAgICBzdGF0aWMgRE9XTiA9IE9iamVjdC5mcmVlemUobmV3IFZlYzIoMCwgLTEpKTtcblxuICAgIC8qKlxuICAgICAqIEEgY29uc3RhbnQgdmVjdG9yIHNldCB0byBbMSwgMF0uXG4gICAgICpcbiAgICAgKiBAdHlwZSB7VmVjMn1cbiAgICAgKiBAcmVhZG9ubHlcbiAgICAgKi9cbiAgICBzdGF0aWMgUklHSFQgPSBPYmplY3QuZnJlZXplKG5ldyBWZWMyKDEsIDApKTtcblxuICAgIC8qKlxuICAgICAqIEEgY29uc3RhbnQgdmVjdG9yIHNldCB0byBbLTEsIDBdLlxuICAgICAqXG4gICAgICogQHR5cGUge1ZlYzJ9XG4gICAgICogQHJlYWRvbmx5XG4gICAgICovXG4gICAgc3RhdGljIExFRlQgPSBPYmplY3QuZnJlZXplKG5ldyBWZWMyKC0xLCAwKSk7XG59XG5cbmV4cG9ydCB7IFZlYzIgfTtcbiJdLCJuYW1lcyI6WyJWZWMyIiwiY29uc3RydWN0b3IiLCJ4IiwieSIsImxlbmd0aCIsImFkZCIsInJocyIsImFkZDIiLCJsaHMiLCJhZGRTY2FsYXIiLCJzY2FsYXIiLCJjbG9uZSIsImNzdHIiLCJjb3B5IiwiY3Jvc3MiLCJkaXN0YW5jZSIsIk1hdGgiLCJzcXJ0IiwiZGl2IiwiZGl2MiIsImRpdlNjYWxhciIsImRvdCIsImVxdWFscyIsImxlbmd0aFNxIiwibGVycCIsImFscGhhIiwibXVsIiwibXVsMiIsIm11bFNjYWxhciIsIm5vcm1hbGl6ZSIsInNyYyIsImludkxlbmd0aCIsInJvdGF0ZSIsImRlZ3JlZXMiLCJhbmdsZSIsImF0YW4yIiwibWF0aCIsIkRFR19UT19SQUQiLCJsZW4iLCJzaW4iLCJjb3MiLCJSQURfVE9fREVHIiwiYW5nbGVUbyIsImZsb29yIiwiY2VpbCIsInJvdW5kIiwibWluIiwibWF4Iiwic2V0Iiwic3ViIiwic3ViMiIsInN1YlNjYWxhciIsInRvU3RyaW5nIiwiYW5nbGVSYWQiLCJaRVJPIiwiT2JqZWN0IiwiZnJlZXplIiwiT05FIiwiVVAiLCJET1dOIiwiUklHSFQiLCJMRUZUIl0sIm1hcHBpbmdzIjoiOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxNQUFNQSxJQUFJLENBQUM7QUFlUDtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7RUFDSUMsV0FBV0EsQ0FBQ0MsQ0FBQyxHQUFHLENBQUMsRUFBRUMsQ0FBQyxHQUFHLENBQUMsRUFBRTtBQXZCMUI7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUpJLElBQUEsSUFBQSxDQUtBRCxDQUFDLEdBQUEsS0FBQSxDQUFBLENBQUE7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
