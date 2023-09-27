/**
 * A 4-dimensional vector.
 *
 * @category Math
 */
class Vec4 {
  /**
   * Creates a new Vec4 object.
   *
   * @param {number|number[]} [x] - The x value. Defaults to 0. If x is an array of length 4, the
   * array will be used to populate all components.
   * @param {number} [y] - The y value. Defaults to 0.
   * @param {number} [z] - The z value. Defaults to 0.
   * @param {number} [w] - The w value. Defaults to 0.
   * @example
   * const v = new pc.Vec4(1, 2, 3, 4);
   */
  constructor(x = 0, y = 0, z = 0, w = 0) {
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
    /**
     * The fourth component of the vector.
     *
     * @type {number}
     */
    this.w = void 0;
    if (x.length === 4) {
      this.x = x[0];
      this.y = x[1];
      this.z = x[2];
      this.w = x[3];
    } else {
      this.x = x;
      this.y = y;
      this.z = z;
      this.w = w;
    }
  }

  /**
   * Adds a 4-dimensional vector to another in place.
   *
   * @param {Vec4} rhs - The vector to add to the specified vector.
   * @returns {Vec4} Self for chaining.
   * @example
   * const a = new pc.Vec4(10, 10, 10, 10);
   * const b = new pc.Vec4(20, 20, 20, 20);
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
    this.w += rhs.w;
    return this;
  }

  /**
   * Adds two 4-dimensional vectors together and returns the result.
   *
   * @param {Vec4} lhs - The first vector operand for the addition.
   * @param {Vec4} rhs - The second vector operand for the addition.
   * @returns {Vec4} Self for chaining.
   * @example
   * const a = new pc.Vec4(10, 10, 10, 10);
   * const b = new pc.Vec4(20, 20, 20, 20);
   * const r = new pc.Vec4();
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
    this.w = lhs.w + rhs.w;
    return this;
  }

  /**
   * Adds a number to each element of a vector.
   *
   * @param {number} scalar - The number to add.
   * @returns {Vec4} Self for chaining.
   * @example
   * const vec = new pc.Vec4(3, 4, 5, 6);
   *
   * vec.addScalar(2);
   *
   * // Outputs [5, 6, 7, 8]
   * console.log("The result of the addition is: " + vec.toString());
   */
  addScalar(scalar) {
    this.x += scalar;
    this.y += scalar;
    this.z += scalar;
    this.w += scalar;
    return this;
  }

  /**
   * Returns an identical copy of the specified 4-dimensional vector.
   *
   * @returns {this} A 4-dimensional vector containing the result of the cloning.
   * @example
   * const v = new pc.Vec4(10, 20, 30, 40);
   * const vclone = v.clone();
   * console.log("The result of the cloning is: " + vclone.toString());
   */
  clone() {
    /** @type {this} */
    const cstr = this.constructor;
    return new cstr(this.x, this.y, this.z, this.w);
  }

  /**
   * Copies the contents of a source 4-dimensional vector to a destination 4-dimensional vector.
   *
   * @param {Vec4} rhs - A vector to copy to the specified vector.
   * @returns {Vec4} Self for chaining.
   * @example
   * const src = new pc.Vec4(10, 20, 30, 40);
   * const dst = new pc.Vec4();
   *
   * dst.copy(src);
   *
   * console.log("The two vectors are " + (dst.equals(src) ? "equal" : "different"));
   */
  copy(rhs) {
    this.x = rhs.x;
    this.y = rhs.y;
    this.z = rhs.z;
    this.w = rhs.w;
    return this;
  }

  /**
   * Divides a 4-dimensional vector by another in place.
   *
   * @param {Vec4} rhs - The vector to divide the specified vector by.
   * @returns {Vec4} Self for chaining.
   * @example
   * const a = new pc.Vec4(4, 9, 16, 25);
   * const b = new pc.Vec4(2, 3, 4, 5);
   *
   * a.div(b);
   *
   * // Outputs [2, 3, 4, 5]
   * console.log("The result of the division is: " + a.toString());
   */
  div(rhs) {
    this.x /= rhs.x;
    this.y /= rhs.y;
    this.z /= rhs.z;
    this.w /= rhs.w;
    return this;
  }

  /**
   * Divides one 4-dimensional vector by another and writes the result to the specified vector.
   *
   * @param {Vec4} lhs - The dividend vector (the vector being divided).
   * @param {Vec4} rhs - The divisor vector (the vector dividing the dividend).
   * @returns {Vec4} Self for chaining.
   * @example
   * const a = new pc.Vec4(4, 9, 16, 25);
   * const b = new pc.Vec4(2, 3, 4, 5);
   * const r = new pc.Vec4();
   *
   * r.div2(a, b);
   * // Outputs [2, 3, 4, 5]
   *
   * console.log("The result of the division is: " + r.toString());
   */
  div2(lhs, rhs) {
    this.x = lhs.x / rhs.x;
    this.y = lhs.y / rhs.y;
    this.z = lhs.z / rhs.z;
    this.w = lhs.w / rhs.w;
    return this;
  }

  /**
   * Divides each element of a vector by a number.
   *
   * @param {number} scalar - The number to divide by.
   * @returns {Vec4} Self for chaining.
   * @example
   * const vec = new pc.Vec4(3, 6, 9, 12);
   *
   * vec.divScalar(3);
   *
   * // Outputs [1, 2, 3, 4]
   * console.log("The result of the division is: " + vec.toString());
   */
  divScalar(scalar) {
    this.x /= scalar;
    this.y /= scalar;
    this.z /= scalar;
    this.w /= scalar;
    return this;
  }

  /**
   * Returns the result of a dot product operation performed on the two specified 4-dimensional
   * vectors.
   *
   * @param {Vec4} rhs - The second 4-dimensional vector operand of the dot product.
   * @returns {number} The result of the dot product operation.
   * @example
   * const v1 = new pc.Vec4(5, 10, 20, 40);
   * const v2 = new pc.Vec4(10, 20, 40, 80);
   * const v1dotv2 = v1.dot(v2);
   * console.log("The result of the dot product is: " + v1dotv2);
   */
  dot(rhs) {
    return this.x * rhs.x + this.y * rhs.y + this.z * rhs.z + this.w * rhs.w;
  }

  /**
   * Reports whether two vectors are equal.
   *
   * @param {Vec4} rhs - The vector to compare to the specified vector.
   * @returns {boolean} True if the vectors are equal and false otherwise.
   * @example
   * const a = new pc.Vec4(1, 2, 3, 4);
   * const b = new pc.Vec4(5, 6, 7, 8);
   * console.log("The two vectors are " + (a.equals(b) ? "equal" : "different"));
   */
  equals(rhs) {
    return this.x === rhs.x && this.y === rhs.y && this.z === rhs.z && this.w === rhs.w;
  }

  /**
   * Returns the magnitude of the specified 4-dimensional vector.
   *
   * @returns {number} The magnitude of the specified 4-dimensional vector.
   * @example
   * const vec = new pc.Vec4(3, 4, 0, 0);
   * const len = vec.length();
   * // Outputs 5
   * console.log("The length of the vector is: " + len);
   */
  length() {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w);
  }

  /**
   * Returns the magnitude squared of the specified 4-dimensional vector.
   *
   * @returns {number} The magnitude of the specified 4-dimensional vector.
   * @example
   * const vec = new pc.Vec4(3, 4, 0);
   * const len = vec.lengthSq();
   * // Outputs 25
   * console.log("The length squared of the vector is: " + len);
   */
  lengthSq() {
    return this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w;
  }

  /**
   * Returns the result of a linear interpolation between two specified 4-dimensional vectors.
   *
   * @param {Vec4} lhs - The 4-dimensional to interpolate from.
   * @param {Vec4} rhs - The 4-dimensional to interpolate to.
   * @param {number} alpha - The value controlling the point of interpolation. Between 0 and 1,
   * the linear interpolant will occur on a straight line between lhs and rhs. Outside of this
   * range, the linear interpolant will occur on a ray extrapolated from this line.
   * @returns {Vec4} Self for chaining.
   * @example
   * const a = new pc.Vec4(0, 0, 0, 0);
   * const b = new pc.Vec4(10, 10, 10, 10);
   * const r = new pc.Vec4();
   *
   * r.lerp(a, b, 0);   // r is equal to a
   * r.lerp(a, b, 0.5); // r is 5, 5, 5, 5
   * r.lerp(a, b, 1);   // r is equal to b
   */
  lerp(lhs, rhs, alpha) {
    this.x = lhs.x + alpha * (rhs.x - lhs.x);
    this.y = lhs.y + alpha * (rhs.y - lhs.y);
    this.z = lhs.z + alpha * (rhs.z - lhs.z);
    this.w = lhs.w + alpha * (rhs.w - lhs.w);
    return this;
  }

  /**
   * Multiplies a 4-dimensional vector to another in place.
   *
   * @param {Vec4} rhs - The 4-dimensional vector used as the second multiplicand of the operation.
   * @returns {Vec4} Self for chaining.
   * @example
   * const a = new pc.Vec4(2, 3, 4, 5);
   * const b = new pc.Vec4(4, 5, 6, 7);
   *
   * a.mul(b);
   *
   * // Outputs 8, 15, 24, 35
   * console.log("The result of the multiplication is: " + a.toString());
   */
  mul(rhs) {
    this.x *= rhs.x;
    this.y *= rhs.y;
    this.z *= rhs.z;
    this.w *= rhs.w;
    return this;
  }

  /**
   * Returns the result of multiplying the specified 4-dimensional vectors together.
   *
   * @param {Vec4} lhs - The 4-dimensional vector used as the first multiplicand of the operation.
   * @param {Vec4} rhs - The 4-dimensional vector used as the second multiplicand of the operation.
   * @returns {Vec4} Self for chaining.
   * @example
   * const a = new pc.Vec4(2, 3, 4, 5);
   * const b = new pc.Vec4(4, 5, 6, 7);
   * const r = new pc.Vec4();
   *
   * r.mul2(a, b);
   *
   * // Outputs 8, 15, 24, 35
   * console.log("The result of the multiplication is: " + r.toString());
   */
  mul2(lhs, rhs) {
    this.x = lhs.x * rhs.x;
    this.y = lhs.y * rhs.y;
    this.z = lhs.z * rhs.z;
    this.w = lhs.w * rhs.w;
    return this;
  }

  /**
   * Multiplies each element of a vector by a number.
   *
   * @param {number} scalar - The number to multiply by.
   * @returns {Vec4} Self for chaining.
   * @example
   * const vec = new pc.Vec4(3, 6, 9, 12);
   *
   * vec.mulScalar(3);
   *
   * // Outputs [9, 18, 27, 36]
   * console.log("The result of the multiplication is: " + vec.toString());
   */
  mulScalar(scalar) {
    this.x *= scalar;
    this.y *= scalar;
    this.z *= scalar;
    this.w *= scalar;
    return this;
  }

  /**
   * Returns this 4-dimensional vector converted to a unit vector in place. If the vector has a
   * length of zero, the vector's elements will be set to zero.
   *
   * @param {Vec4} [src] - The vector to normalize. If not set, the operation is done in place.
   * @returns {Vec4} Self for chaining.
   * @example
   * const v = new pc.Vec4(25, 0, 0, 0);
   *
   * v.normalize();
   *
   * // Outputs 1, 0, 0, 0
   * console.log("The result of the vector normalization is: " + v.toString());
   */
  normalize(src = this) {
    const lengthSq = src.x * src.x + src.y * src.y + src.z * src.z + src.w * src.w;
    if (lengthSq > 0) {
      const invLength = 1 / Math.sqrt(lengthSq);
      this.x = src.x * invLength;
      this.y = src.y * invLength;
      this.z = src.z * invLength;
      this.w = src.w * invLength;
    }
    return this;
  }

  /**
   * Each element is set to the largest integer less than or equal to its value.
   *
   * @param {Vec4} [src] - The vector to floor. If not set, the operation is done in place.
   * @returns {Vec4} Self for chaining.
   */
  floor(src = this) {
    this.x = Math.floor(src.x);
    this.y = Math.floor(src.y);
    this.z = Math.floor(src.z);
    this.w = Math.floor(src.w);
    return this;
  }

  /**
   * Each element is rounded up to the next largest integer.
   *
   * @param {Vec4} [src] - The vector to ceil. If not set, the operation is done in place.
   * @returns {Vec4} Self for chaining.
   */
  ceil(src = this) {
    this.x = Math.ceil(src.x);
    this.y = Math.ceil(src.y);
    this.z = Math.ceil(src.z);
    this.w = Math.ceil(src.w);
    return this;
  }

  /**
   * Each element is rounded up or down to the nearest integer.
   *
   * @param {Vec4} [src] - The vector to round. If not set, the operation is done in place.
   * @returns {Vec4} Self for chaining.
   */
  round(src = this) {
    this.x = Math.round(src.x);
    this.y = Math.round(src.y);
    this.z = Math.round(src.z);
    this.w = Math.round(src.w);
    return this;
  }

  /**
   * Each element is assigned a value from rhs parameter if it is smaller.
   *
   * @param {Vec4} rhs - The 4-dimensional vector used as the source of elements to compare to.
   * @returns {Vec4} Self for chaining.
   */
  min(rhs) {
    if (rhs.x < this.x) this.x = rhs.x;
    if (rhs.y < this.y) this.y = rhs.y;
    if (rhs.z < this.z) this.z = rhs.z;
    if (rhs.w < this.w) this.w = rhs.w;
    return this;
  }

  /**
   * Each element is assigned a value from rhs parameter if it is larger.
   *
   * @param {Vec4} rhs - The 4-dimensional vector used as the source of elements to compare to.
   * @returns {Vec4} Self for chaining.
   */
  max(rhs) {
    if (rhs.x > this.x) this.x = rhs.x;
    if (rhs.y > this.y) this.y = rhs.y;
    if (rhs.z > this.z) this.z = rhs.z;
    if (rhs.w > this.w) this.w = rhs.w;
    return this;
  }

  /**
   * Sets the specified 4-dimensional vector to the supplied numerical values.
   *
   * @param {number} x - The value to set on the first component of the vector.
   * @param {number} y - The value to set on the second component of the vector.
   * @param {number} z - The value to set on the third component of the vector.
   * @param {number} w - The value to set on the fourth component of the vector.
   * @returns {Vec4} Self for chaining.
   * @example
   * const v = new pc.Vec4();
   * v.set(5, 10, 20, 40);
   *
   * // Outputs 5, 10, 20, 40
   * console.log("The result of the vector set is: " + v.toString());
   */
  set(x, y, z, w) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
    return this;
  }

  /**
   * Subtracts a 4-dimensional vector from another in place.
   *
   * @param {Vec4} rhs - The vector to add to the specified vector.
   * @returns {Vec4} Self for chaining.
   * @example
   * const a = new pc.Vec4(10, 10, 10, 10);
   * const b = new pc.Vec4(20, 20, 20, 20);
   *
   * a.sub(b);
   *
   * // Outputs [-10, -10, -10, -10]
   * console.log("The result of the subtraction is: " + a.toString());
   */
  sub(rhs) {
    this.x -= rhs.x;
    this.y -= rhs.y;
    this.z -= rhs.z;
    this.w -= rhs.w;
    return this;
  }

  /**
   * Subtracts two 4-dimensional vectors from one another and returns the result.
   *
   * @param {Vec4} lhs - The first vector operand for the subtraction.
   * @param {Vec4} rhs - The second vector operand for the subtraction.
   * @returns {Vec4} Self for chaining.
   * @example
   * const a = new pc.Vec4(10, 10, 10, 10);
   * const b = new pc.Vec4(20, 20, 20, 20);
   * const r = new pc.Vec4();
   *
   * r.sub2(a, b);
   *
   * // Outputs [-10, -10, -10, -10]
   * console.log("The result of the subtraction is: " + r.toString());
   */
  sub2(lhs, rhs) {
    this.x = lhs.x - rhs.x;
    this.y = lhs.y - rhs.y;
    this.z = lhs.z - rhs.z;
    this.w = lhs.w - rhs.w;
    return this;
  }

  /**
   * Subtracts a number from each element of a vector.
   *
   * @param {number} scalar - The number to subtract.
   * @returns {Vec4} Self for chaining.
   * @example
   * const vec = new pc.Vec4(3, 4, 5, 6);
   *
   * vec.subScalar(2);
   *
   * // Outputs [1, 2, 3, 4]
   * console.log("The result of the subtraction is: " + vec.toString());
   */
  subScalar(scalar) {
    this.x -= scalar;
    this.y -= scalar;
    this.z -= scalar;
    this.w -= scalar;
    return this;
  }

  /**
   * Converts the vector to string form.
   *
   * @returns {string} The vector in string form.
   * @example
   * const v = new pc.Vec4(20, 10, 5, 0);
   * // Outputs [20, 10, 5, 0]
   * console.log(v.toString());
   */
  toString() {
    return `[${this.x}, ${this.y}, ${this.z}, ${this.w}]`;
  }

  /**
   * A constant vector set to [0, 0, 0, 0].
   *
   * @type {Vec4}
   * @readonly
   */
}
Vec4.ZERO = Object.freeze(new Vec4(0, 0, 0, 0));
/**
 * A constant vector set to [1, 1, 1, 1].
 *
 * @type {Vec4}
 * @readonly
 */
Vec4.ONE = Object.freeze(new Vec4(1, 1, 1, 1));

export { Vec4 };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmVjNC5qcyIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL2NvcmUvbWF0aC92ZWM0LmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQSA0LWRpbWVuc2lvbmFsIHZlY3Rvci5cbiAqXG4gKiBAY2F0ZWdvcnkgTWF0aFxuICovXG5jbGFzcyBWZWM0IHtcbiAgICAvKipcbiAgICAgKiBUaGUgZmlyc3QgY29tcG9uZW50IG9mIHRoZSB2ZWN0b3IuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqL1xuICAgIHg7XG5cbiAgICAvKipcbiAgICAgKiBUaGUgc2Vjb25kIGNvbXBvbmVudCBvZiB0aGUgdmVjdG9yLlxuICAgICAqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKi9cbiAgICB5O1xuXG4gICAgLyoqXG4gICAgICogVGhlIHRoaXJkIGNvbXBvbmVudCBvZiB0aGUgdmVjdG9yLlxuICAgICAqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKi9cbiAgICB6O1xuXG4gICAgLyoqXG4gICAgICogVGhlIGZvdXJ0aCBjb21wb25lbnQgb2YgdGhlIHZlY3Rvci5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtudW1iZXJ9XG4gICAgICovXG4gICAgdztcblxuICAgIC8qKlxuICAgICAqIENyZWF0ZXMgYSBuZXcgVmVjNCBvYmplY3QuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge251bWJlcnxudW1iZXJbXX0gW3hdIC0gVGhlIHggdmFsdWUuIERlZmF1bHRzIHRvIDAuIElmIHggaXMgYW4gYXJyYXkgb2YgbGVuZ3RoIDQsIHRoZVxuICAgICAqIGFycmF5IHdpbGwgYmUgdXNlZCB0byBwb3B1bGF0ZSBhbGwgY29tcG9uZW50cy5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gW3ldIC0gVGhlIHkgdmFsdWUuIERlZmF1bHRzIHRvIDAuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFt6XSAtIFRoZSB6IHZhbHVlLiBEZWZhdWx0cyB0byAwLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBbd10gLSBUaGUgdyB2YWx1ZS4gRGVmYXVsdHMgdG8gMC5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGNvbnN0IHYgPSBuZXcgcGMuVmVjNCgxLCAyLCAzLCA0KTtcbiAgICAgKi9cbiAgICBjb25zdHJ1Y3Rvcih4ID0gMCwgeSA9IDAsIHogPSAwLCB3ID0gMCkge1xuICAgICAgICBpZiAoeC5sZW5ndGggPT09IDQpIHtcbiAgICAgICAgICAgIHRoaXMueCA9IHhbMF07XG4gICAgICAgICAgICB0aGlzLnkgPSB4WzFdO1xuICAgICAgICAgICAgdGhpcy56ID0geFsyXTtcbiAgICAgICAgICAgIHRoaXMudyA9IHhbM107XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLnggPSB4O1xuICAgICAgICAgICAgdGhpcy55ID0geTtcbiAgICAgICAgICAgIHRoaXMueiA9IHo7XG4gICAgICAgICAgICB0aGlzLncgPSB3O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQWRkcyBhIDQtZGltZW5zaW9uYWwgdmVjdG9yIHRvIGFub3RoZXIgaW4gcGxhY2UuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1ZlYzR9IHJocyAtIFRoZSB2ZWN0b3IgdG8gYWRkIHRvIHRoZSBzcGVjaWZpZWQgdmVjdG9yLlxuICAgICAqIEByZXR1cm5zIHtWZWM0fSBTZWxmIGZvciBjaGFpbmluZy5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGNvbnN0IGEgPSBuZXcgcGMuVmVjNCgxMCwgMTAsIDEwLCAxMCk7XG4gICAgICogY29uc3QgYiA9IG5ldyBwYy5WZWM0KDIwLCAyMCwgMjAsIDIwKTtcbiAgICAgKlxuICAgICAqIGEuYWRkKGIpO1xuICAgICAqXG4gICAgICogLy8gT3V0cHV0cyBbMzAsIDMwLCAzMF1cbiAgICAgKiBjb25zb2xlLmxvZyhcIlRoZSByZXN1bHQgb2YgdGhlIGFkZGl0aW9uIGlzOiBcIiArIGEudG9TdHJpbmcoKSk7XG4gICAgICovXG4gICAgYWRkKHJocykge1xuICAgICAgICB0aGlzLnggKz0gcmhzLng7XG4gICAgICAgIHRoaXMueSArPSByaHMueTtcbiAgICAgICAgdGhpcy56ICs9IHJocy56O1xuICAgICAgICB0aGlzLncgKz0gcmhzLnc7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQWRkcyB0d28gNC1kaW1lbnNpb25hbCB2ZWN0b3JzIHRvZ2V0aGVyIGFuZCByZXR1cm5zIHRoZSByZXN1bHQuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1ZlYzR9IGxocyAtIFRoZSBmaXJzdCB2ZWN0b3Igb3BlcmFuZCBmb3IgdGhlIGFkZGl0aW9uLlxuICAgICAqIEBwYXJhbSB7VmVjNH0gcmhzIC0gVGhlIHNlY29uZCB2ZWN0b3Igb3BlcmFuZCBmb3IgdGhlIGFkZGl0aW9uLlxuICAgICAqIEByZXR1cm5zIHtWZWM0fSBTZWxmIGZvciBjaGFpbmluZy5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGNvbnN0IGEgPSBuZXcgcGMuVmVjNCgxMCwgMTAsIDEwLCAxMCk7XG4gICAgICogY29uc3QgYiA9IG5ldyBwYy5WZWM0KDIwLCAyMCwgMjAsIDIwKTtcbiAgICAgKiBjb25zdCByID0gbmV3IHBjLlZlYzQoKTtcbiAgICAgKlxuICAgICAqIHIuYWRkMihhLCBiKTtcbiAgICAgKiAvLyBPdXRwdXRzIFszMCwgMzAsIDMwXVxuICAgICAqXG4gICAgICogY29uc29sZS5sb2coXCJUaGUgcmVzdWx0IG9mIHRoZSBhZGRpdGlvbiBpczogXCIgKyByLnRvU3RyaW5nKCkpO1xuICAgICAqL1xuICAgIGFkZDIobGhzLCByaHMpIHtcbiAgICAgICAgdGhpcy54ID0gbGhzLnggKyByaHMueDtcbiAgICAgICAgdGhpcy55ID0gbGhzLnkgKyByaHMueTtcbiAgICAgICAgdGhpcy56ID0gbGhzLnogKyByaHMuejtcbiAgICAgICAgdGhpcy53ID0gbGhzLncgKyByaHMudztcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBZGRzIGEgbnVtYmVyIHRvIGVhY2ggZWxlbWVudCBvZiBhIHZlY3Rvci5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBzY2FsYXIgLSBUaGUgbnVtYmVyIHRvIGFkZC5cbiAgICAgKiBAcmV0dXJucyB7VmVjNH0gU2VsZiBmb3IgY2hhaW5pbmcuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBjb25zdCB2ZWMgPSBuZXcgcGMuVmVjNCgzLCA0LCA1LCA2KTtcbiAgICAgKlxuICAgICAqIHZlYy5hZGRTY2FsYXIoMik7XG4gICAgICpcbiAgICAgKiAvLyBPdXRwdXRzIFs1LCA2LCA3LCA4XVxuICAgICAqIGNvbnNvbGUubG9nKFwiVGhlIHJlc3VsdCBvZiB0aGUgYWRkaXRpb24gaXM6IFwiICsgdmVjLnRvU3RyaW5nKCkpO1xuICAgICAqL1xuICAgIGFkZFNjYWxhcihzY2FsYXIpIHtcbiAgICAgICAgdGhpcy54ICs9IHNjYWxhcjtcbiAgICAgICAgdGhpcy55ICs9IHNjYWxhcjtcbiAgICAgICAgdGhpcy56ICs9IHNjYWxhcjtcbiAgICAgICAgdGhpcy53ICs9IHNjYWxhcjtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGFuIGlkZW50aWNhbCBjb3B5IG9mIHRoZSBzcGVjaWZpZWQgNC1kaW1lbnNpb25hbCB2ZWN0b3IuXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7dGhpc30gQSA0LWRpbWVuc2lvbmFsIHZlY3RvciBjb250YWluaW5nIHRoZSByZXN1bHQgb2YgdGhlIGNsb25pbmcuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBjb25zdCB2ID0gbmV3IHBjLlZlYzQoMTAsIDIwLCAzMCwgNDApO1xuICAgICAqIGNvbnN0IHZjbG9uZSA9IHYuY2xvbmUoKTtcbiAgICAgKiBjb25zb2xlLmxvZyhcIlRoZSByZXN1bHQgb2YgdGhlIGNsb25pbmcgaXM6IFwiICsgdmNsb25lLnRvU3RyaW5nKCkpO1xuICAgICAqL1xuICAgIGNsb25lKCkge1xuICAgICAgICAvKiogQHR5cGUge3RoaXN9ICovXG4gICAgICAgIGNvbnN0IGNzdHIgPSB0aGlzLmNvbnN0cnVjdG9yO1xuICAgICAgICByZXR1cm4gbmV3IGNzdHIodGhpcy54LCB0aGlzLnksIHRoaXMueiwgdGhpcy53KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDb3BpZXMgdGhlIGNvbnRlbnRzIG9mIGEgc291cmNlIDQtZGltZW5zaW9uYWwgdmVjdG9yIHRvIGEgZGVzdGluYXRpb24gNC1kaW1lbnNpb25hbCB2ZWN0b3IuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1ZlYzR9IHJocyAtIEEgdmVjdG9yIHRvIGNvcHkgdG8gdGhlIHNwZWNpZmllZCB2ZWN0b3IuXG4gICAgICogQHJldHVybnMge1ZlYzR9IFNlbGYgZm9yIGNoYWluaW5nLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogY29uc3Qgc3JjID0gbmV3IHBjLlZlYzQoMTAsIDIwLCAzMCwgNDApO1xuICAgICAqIGNvbnN0IGRzdCA9IG5ldyBwYy5WZWM0KCk7XG4gICAgICpcbiAgICAgKiBkc3QuY29weShzcmMpO1xuICAgICAqXG4gICAgICogY29uc29sZS5sb2coXCJUaGUgdHdvIHZlY3RvcnMgYXJlIFwiICsgKGRzdC5lcXVhbHMoc3JjKSA/IFwiZXF1YWxcIiA6IFwiZGlmZmVyZW50XCIpKTtcbiAgICAgKi9cbiAgICBjb3B5KHJocykge1xuICAgICAgICB0aGlzLnggPSByaHMueDtcbiAgICAgICAgdGhpcy55ID0gcmhzLnk7XG4gICAgICAgIHRoaXMueiA9IHJocy56O1xuICAgICAgICB0aGlzLncgPSByaHMudztcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBEaXZpZGVzIGEgNC1kaW1lbnNpb25hbCB2ZWN0b3IgYnkgYW5vdGhlciBpbiBwbGFjZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7VmVjNH0gcmhzIC0gVGhlIHZlY3RvciB0byBkaXZpZGUgdGhlIHNwZWNpZmllZCB2ZWN0b3IgYnkuXG4gICAgICogQHJldHVybnMge1ZlYzR9IFNlbGYgZm9yIGNoYWluaW5nLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogY29uc3QgYSA9IG5ldyBwYy5WZWM0KDQsIDksIDE2LCAyNSk7XG4gICAgICogY29uc3QgYiA9IG5ldyBwYy5WZWM0KDIsIDMsIDQsIDUpO1xuICAgICAqXG4gICAgICogYS5kaXYoYik7XG4gICAgICpcbiAgICAgKiAvLyBPdXRwdXRzIFsyLCAzLCA0LCA1XVxuICAgICAqIGNvbnNvbGUubG9nKFwiVGhlIHJlc3VsdCBvZiB0aGUgZGl2aXNpb24gaXM6IFwiICsgYS50b1N0cmluZygpKTtcbiAgICAgKi9cbiAgICBkaXYocmhzKSB7XG4gICAgICAgIHRoaXMueCAvPSByaHMueDtcbiAgICAgICAgdGhpcy55IC89IHJocy55O1xuICAgICAgICB0aGlzLnogLz0gcmhzLno7XG4gICAgICAgIHRoaXMudyAvPSByaHMudztcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBEaXZpZGVzIG9uZSA0LWRpbWVuc2lvbmFsIHZlY3RvciBieSBhbm90aGVyIGFuZCB3cml0ZXMgdGhlIHJlc3VsdCB0byB0aGUgc3BlY2lmaWVkIHZlY3Rvci5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7VmVjNH0gbGhzIC0gVGhlIGRpdmlkZW5kIHZlY3RvciAodGhlIHZlY3RvciBiZWluZyBkaXZpZGVkKS5cbiAgICAgKiBAcGFyYW0ge1ZlYzR9IHJocyAtIFRoZSBkaXZpc29yIHZlY3RvciAodGhlIHZlY3RvciBkaXZpZGluZyB0aGUgZGl2aWRlbmQpLlxuICAgICAqIEByZXR1cm5zIHtWZWM0fSBTZWxmIGZvciBjaGFpbmluZy5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGNvbnN0IGEgPSBuZXcgcGMuVmVjNCg0LCA5LCAxNiwgMjUpO1xuICAgICAqIGNvbnN0IGIgPSBuZXcgcGMuVmVjNCgyLCAzLCA0LCA1KTtcbiAgICAgKiBjb25zdCByID0gbmV3IHBjLlZlYzQoKTtcbiAgICAgKlxuICAgICAqIHIuZGl2MihhLCBiKTtcbiAgICAgKiAvLyBPdXRwdXRzIFsyLCAzLCA0LCA1XVxuICAgICAqXG4gICAgICogY29uc29sZS5sb2coXCJUaGUgcmVzdWx0IG9mIHRoZSBkaXZpc2lvbiBpczogXCIgKyByLnRvU3RyaW5nKCkpO1xuICAgICAqL1xuICAgIGRpdjIobGhzLCByaHMpIHtcbiAgICAgICAgdGhpcy54ID0gbGhzLnggLyByaHMueDtcbiAgICAgICAgdGhpcy55ID0gbGhzLnkgLyByaHMueTtcbiAgICAgICAgdGhpcy56ID0gbGhzLnogLyByaHMuejtcbiAgICAgICAgdGhpcy53ID0gbGhzLncgLyByaHMudztcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBEaXZpZGVzIGVhY2ggZWxlbWVudCBvZiBhIHZlY3RvciBieSBhIG51bWJlci5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBzY2FsYXIgLSBUaGUgbnVtYmVyIHRvIGRpdmlkZSBieS5cbiAgICAgKiBAcmV0dXJucyB7VmVjNH0gU2VsZiBmb3IgY2hhaW5pbmcuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBjb25zdCB2ZWMgPSBuZXcgcGMuVmVjNCgzLCA2LCA5LCAxMik7XG4gICAgICpcbiAgICAgKiB2ZWMuZGl2U2NhbGFyKDMpO1xuICAgICAqXG4gICAgICogLy8gT3V0cHV0cyBbMSwgMiwgMywgNF1cbiAgICAgKiBjb25zb2xlLmxvZyhcIlRoZSByZXN1bHQgb2YgdGhlIGRpdmlzaW9uIGlzOiBcIiArIHZlYy50b1N0cmluZygpKTtcbiAgICAgKi9cbiAgICBkaXZTY2FsYXIoc2NhbGFyKSB7XG4gICAgICAgIHRoaXMueCAvPSBzY2FsYXI7XG4gICAgICAgIHRoaXMueSAvPSBzY2FsYXI7XG4gICAgICAgIHRoaXMueiAvPSBzY2FsYXI7XG4gICAgICAgIHRoaXMudyAvPSBzY2FsYXI7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgcmVzdWx0IG9mIGEgZG90IHByb2R1Y3Qgb3BlcmF0aW9uIHBlcmZvcm1lZCBvbiB0aGUgdHdvIHNwZWNpZmllZCA0LWRpbWVuc2lvbmFsXG4gICAgICogdmVjdG9ycy5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7VmVjNH0gcmhzIC0gVGhlIHNlY29uZCA0LWRpbWVuc2lvbmFsIHZlY3RvciBvcGVyYW5kIG9mIHRoZSBkb3QgcHJvZHVjdC5cbiAgICAgKiBAcmV0dXJucyB7bnVtYmVyfSBUaGUgcmVzdWx0IG9mIHRoZSBkb3QgcHJvZHVjdCBvcGVyYXRpb24uXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBjb25zdCB2MSA9IG5ldyBwYy5WZWM0KDUsIDEwLCAyMCwgNDApO1xuICAgICAqIGNvbnN0IHYyID0gbmV3IHBjLlZlYzQoMTAsIDIwLCA0MCwgODApO1xuICAgICAqIGNvbnN0IHYxZG90djIgPSB2MS5kb3QodjIpO1xuICAgICAqIGNvbnNvbGUubG9nKFwiVGhlIHJlc3VsdCBvZiB0aGUgZG90IHByb2R1Y3QgaXM6IFwiICsgdjFkb3R2Mik7XG4gICAgICovXG4gICAgZG90KHJocykge1xuICAgICAgICByZXR1cm4gdGhpcy54ICogcmhzLnggKyB0aGlzLnkgKiByaHMueSArIHRoaXMueiAqIHJocy56ICsgdGhpcy53ICogcmhzLnc7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVwb3J0cyB3aGV0aGVyIHR3byB2ZWN0b3JzIGFyZSBlcXVhbC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7VmVjNH0gcmhzIC0gVGhlIHZlY3RvciB0byBjb21wYXJlIHRvIHRoZSBzcGVjaWZpZWQgdmVjdG9yLlxuICAgICAqIEByZXR1cm5zIHtib29sZWFufSBUcnVlIGlmIHRoZSB2ZWN0b3JzIGFyZSBlcXVhbCBhbmQgZmFsc2Ugb3RoZXJ3aXNlLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogY29uc3QgYSA9IG5ldyBwYy5WZWM0KDEsIDIsIDMsIDQpO1xuICAgICAqIGNvbnN0IGIgPSBuZXcgcGMuVmVjNCg1LCA2LCA3LCA4KTtcbiAgICAgKiBjb25zb2xlLmxvZyhcIlRoZSB0d28gdmVjdG9ycyBhcmUgXCIgKyAoYS5lcXVhbHMoYikgPyBcImVxdWFsXCIgOiBcImRpZmZlcmVudFwiKSk7XG4gICAgICovXG4gICAgZXF1YWxzKHJocykge1xuICAgICAgICByZXR1cm4gdGhpcy54ID09PSByaHMueCAmJiB0aGlzLnkgPT09IHJocy55ICYmIHRoaXMueiA9PT0gcmhzLnogJiYgdGhpcy53ID09PSByaHMudztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBtYWduaXR1ZGUgb2YgdGhlIHNwZWNpZmllZCA0LWRpbWVuc2lvbmFsIHZlY3Rvci5cbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtudW1iZXJ9IFRoZSBtYWduaXR1ZGUgb2YgdGhlIHNwZWNpZmllZCA0LWRpbWVuc2lvbmFsIHZlY3Rvci5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGNvbnN0IHZlYyA9IG5ldyBwYy5WZWM0KDMsIDQsIDAsIDApO1xuICAgICAqIGNvbnN0IGxlbiA9IHZlYy5sZW5ndGgoKTtcbiAgICAgKiAvLyBPdXRwdXRzIDVcbiAgICAgKiBjb25zb2xlLmxvZyhcIlRoZSBsZW5ndGggb2YgdGhlIHZlY3RvciBpczogXCIgKyBsZW4pO1xuICAgICAqL1xuICAgIGxlbmd0aCgpIHtcbiAgICAgICAgcmV0dXJuIE1hdGguc3FydCh0aGlzLnggKiB0aGlzLnggKyB0aGlzLnkgKiB0aGlzLnkgKyB0aGlzLnogKiB0aGlzLnogKyB0aGlzLncgKiB0aGlzLncpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIG1hZ25pdHVkZSBzcXVhcmVkIG9mIHRoZSBzcGVjaWZpZWQgNC1kaW1lbnNpb25hbCB2ZWN0b3IuXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7bnVtYmVyfSBUaGUgbWFnbml0dWRlIG9mIHRoZSBzcGVjaWZpZWQgNC1kaW1lbnNpb25hbCB2ZWN0b3IuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBjb25zdCB2ZWMgPSBuZXcgcGMuVmVjNCgzLCA0LCAwKTtcbiAgICAgKiBjb25zdCBsZW4gPSB2ZWMubGVuZ3RoU3EoKTtcbiAgICAgKiAvLyBPdXRwdXRzIDI1XG4gICAgICogY29uc29sZS5sb2coXCJUaGUgbGVuZ3RoIHNxdWFyZWQgb2YgdGhlIHZlY3RvciBpczogXCIgKyBsZW4pO1xuICAgICAqL1xuICAgIGxlbmd0aFNxKCkge1xuICAgICAgICByZXR1cm4gdGhpcy54ICogdGhpcy54ICsgdGhpcy55ICogdGhpcy55ICsgdGhpcy56ICogdGhpcy56ICsgdGhpcy53ICogdGhpcy53O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIHJlc3VsdCBvZiBhIGxpbmVhciBpbnRlcnBvbGF0aW9uIGJldHdlZW4gdHdvIHNwZWNpZmllZCA0LWRpbWVuc2lvbmFsIHZlY3RvcnMuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1ZlYzR9IGxocyAtIFRoZSA0LWRpbWVuc2lvbmFsIHRvIGludGVycG9sYXRlIGZyb20uXG4gICAgICogQHBhcmFtIHtWZWM0fSByaHMgLSBUaGUgNC1kaW1lbnNpb25hbCB0byBpbnRlcnBvbGF0ZSB0by5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gYWxwaGEgLSBUaGUgdmFsdWUgY29udHJvbGxpbmcgdGhlIHBvaW50IG9mIGludGVycG9sYXRpb24uIEJldHdlZW4gMCBhbmQgMSxcbiAgICAgKiB0aGUgbGluZWFyIGludGVycG9sYW50IHdpbGwgb2NjdXIgb24gYSBzdHJhaWdodCBsaW5lIGJldHdlZW4gbGhzIGFuZCByaHMuIE91dHNpZGUgb2YgdGhpc1xuICAgICAqIHJhbmdlLCB0aGUgbGluZWFyIGludGVycG9sYW50IHdpbGwgb2NjdXIgb24gYSByYXkgZXh0cmFwb2xhdGVkIGZyb20gdGhpcyBsaW5lLlxuICAgICAqIEByZXR1cm5zIHtWZWM0fSBTZWxmIGZvciBjaGFpbmluZy5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGNvbnN0IGEgPSBuZXcgcGMuVmVjNCgwLCAwLCAwLCAwKTtcbiAgICAgKiBjb25zdCBiID0gbmV3IHBjLlZlYzQoMTAsIDEwLCAxMCwgMTApO1xuICAgICAqIGNvbnN0IHIgPSBuZXcgcGMuVmVjNCgpO1xuICAgICAqXG4gICAgICogci5sZXJwKGEsIGIsIDApOyAgIC8vIHIgaXMgZXF1YWwgdG8gYVxuICAgICAqIHIubGVycChhLCBiLCAwLjUpOyAvLyByIGlzIDUsIDUsIDUsIDVcbiAgICAgKiByLmxlcnAoYSwgYiwgMSk7ICAgLy8gciBpcyBlcXVhbCB0byBiXG4gICAgICovXG4gICAgbGVycChsaHMsIHJocywgYWxwaGEpIHtcbiAgICAgICAgdGhpcy54ID0gbGhzLnggKyBhbHBoYSAqIChyaHMueCAtIGxocy54KTtcbiAgICAgICAgdGhpcy55ID0gbGhzLnkgKyBhbHBoYSAqIChyaHMueSAtIGxocy55KTtcbiAgICAgICAgdGhpcy56ID0gbGhzLnogKyBhbHBoYSAqIChyaHMueiAtIGxocy56KTtcbiAgICAgICAgdGhpcy53ID0gbGhzLncgKyBhbHBoYSAqIChyaHMudyAtIGxocy53KTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNdWx0aXBsaWVzIGEgNC1kaW1lbnNpb25hbCB2ZWN0b3IgdG8gYW5vdGhlciBpbiBwbGFjZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7VmVjNH0gcmhzIC0gVGhlIDQtZGltZW5zaW9uYWwgdmVjdG9yIHVzZWQgYXMgdGhlIHNlY29uZCBtdWx0aXBsaWNhbmQgb2YgdGhlIG9wZXJhdGlvbi5cbiAgICAgKiBAcmV0dXJucyB7VmVjNH0gU2VsZiBmb3IgY2hhaW5pbmcuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBjb25zdCBhID0gbmV3IHBjLlZlYzQoMiwgMywgNCwgNSk7XG4gICAgICogY29uc3QgYiA9IG5ldyBwYy5WZWM0KDQsIDUsIDYsIDcpO1xuICAgICAqXG4gICAgICogYS5tdWwoYik7XG4gICAgICpcbiAgICAgKiAvLyBPdXRwdXRzIDgsIDE1LCAyNCwgMzVcbiAgICAgKiBjb25zb2xlLmxvZyhcIlRoZSByZXN1bHQgb2YgdGhlIG11bHRpcGxpY2F0aW9uIGlzOiBcIiArIGEudG9TdHJpbmcoKSk7XG4gICAgICovXG4gICAgbXVsKHJocykge1xuICAgICAgICB0aGlzLnggKj0gcmhzLng7XG4gICAgICAgIHRoaXMueSAqPSByaHMueTtcbiAgICAgICAgdGhpcy56ICo9IHJocy56O1xuICAgICAgICB0aGlzLncgKj0gcmhzLnc7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgcmVzdWx0IG9mIG11bHRpcGx5aW5nIHRoZSBzcGVjaWZpZWQgNC1kaW1lbnNpb25hbCB2ZWN0b3JzIHRvZ2V0aGVyLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtWZWM0fSBsaHMgLSBUaGUgNC1kaW1lbnNpb25hbCB2ZWN0b3IgdXNlZCBhcyB0aGUgZmlyc3QgbXVsdGlwbGljYW5kIG9mIHRoZSBvcGVyYXRpb24uXG4gICAgICogQHBhcmFtIHtWZWM0fSByaHMgLSBUaGUgNC1kaW1lbnNpb25hbCB2ZWN0b3IgdXNlZCBhcyB0aGUgc2Vjb25kIG11bHRpcGxpY2FuZCBvZiB0aGUgb3BlcmF0aW9uLlxuICAgICAqIEByZXR1cm5zIHtWZWM0fSBTZWxmIGZvciBjaGFpbmluZy5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGNvbnN0IGEgPSBuZXcgcGMuVmVjNCgyLCAzLCA0LCA1KTtcbiAgICAgKiBjb25zdCBiID0gbmV3IHBjLlZlYzQoNCwgNSwgNiwgNyk7XG4gICAgICogY29uc3QgciA9IG5ldyBwYy5WZWM0KCk7XG4gICAgICpcbiAgICAgKiByLm11bDIoYSwgYik7XG4gICAgICpcbiAgICAgKiAvLyBPdXRwdXRzIDgsIDE1LCAyNCwgMzVcbiAgICAgKiBjb25zb2xlLmxvZyhcIlRoZSByZXN1bHQgb2YgdGhlIG11bHRpcGxpY2F0aW9uIGlzOiBcIiArIHIudG9TdHJpbmcoKSk7XG4gICAgICovXG4gICAgbXVsMihsaHMsIHJocykge1xuICAgICAgICB0aGlzLnggPSBsaHMueCAqIHJocy54O1xuICAgICAgICB0aGlzLnkgPSBsaHMueSAqIHJocy55O1xuICAgICAgICB0aGlzLnogPSBsaHMueiAqIHJocy56O1xuICAgICAgICB0aGlzLncgPSBsaHMudyAqIHJocy53O1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE11bHRpcGxpZXMgZWFjaCBlbGVtZW50IG9mIGEgdmVjdG9yIGJ5IGEgbnVtYmVyLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHNjYWxhciAtIFRoZSBudW1iZXIgdG8gbXVsdGlwbHkgYnkuXG4gICAgICogQHJldHVybnMge1ZlYzR9IFNlbGYgZm9yIGNoYWluaW5nLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogY29uc3QgdmVjID0gbmV3IHBjLlZlYzQoMywgNiwgOSwgMTIpO1xuICAgICAqXG4gICAgICogdmVjLm11bFNjYWxhcigzKTtcbiAgICAgKlxuICAgICAqIC8vIE91dHB1dHMgWzksIDE4LCAyNywgMzZdXG4gICAgICogY29uc29sZS5sb2coXCJUaGUgcmVzdWx0IG9mIHRoZSBtdWx0aXBsaWNhdGlvbiBpczogXCIgKyB2ZWMudG9TdHJpbmcoKSk7XG4gICAgICovXG4gICAgbXVsU2NhbGFyKHNjYWxhcikge1xuICAgICAgICB0aGlzLnggKj0gc2NhbGFyO1xuICAgICAgICB0aGlzLnkgKj0gc2NhbGFyO1xuICAgICAgICB0aGlzLnogKj0gc2NhbGFyO1xuICAgICAgICB0aGlzLncgKj0gc2NhbGFyO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhpcyA0LWRpbWVuc2lvbmFsIHZlY3RvciBjb252ZXJ0ZWQgdG8gYSB1bml0IHZlY3RvciBpbiBwbGFjZS4gSWYgdGhlIHZlY3RvciBoYXMgYVxuICAgICAqIGxlbmd0aCBvZiB6ZXJvLCB0aGUgdmVjdG9yJ3MgZWxlbWVudHMgd2lsbCBiZSBzZXQgdG8gemVyby5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7VmVjNH0gW3NyY10gLSBUaGUgdmVjdG9yIHRvIG5vcm1hbGl6ZS4gSWYgbm90IHNldCwgdGhlIG9wZXJhdGlvbiBpcyBkb25lIGluIHBsYWNlLlxuICAgICAqIEByZXR1cm5zIHtWZWM0fSBTZWxmIGZvciBjaGFpbmluZy5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGNvbnN0IHYgPSBuZXcgcGMuVmVjNCgyNSwgMCwgMCwgMCk7XG4gICAgICpcbiAgICAgKiB2Lm5vcm1hbGl6ZSgpO1xuICAgICAqXG4gICAgICogLy8gT3V0cHV0cyAxLCAwLCAwLCAwXG4gICAgICogY29uc29sZS5sb2coXCJUaGUgcmVzdWx0IG9mIHRoZSB2ZWN0b3Igbm9ybWFsaXphdGlvbiBpczogXCIgKyB2LnRvU3RyaW5nKCkpO1xuICAgICAqL1xuICAgIG5vcm1hbGl6ZShzcmMgPSB0aGlzKSB7XG4gICAgICAgIGNvbnN0IGxlbmd0aFNxID0gc3JjLnggKiBzcmMueCArIHNyYy55ICogc3JjLnkgKyBzcmMueiAqIHNyYy56ICsgc3JjLncgKiBzcmMudztcbiAgICAgICAgaWYgKGxlbmd0aFNxID4gMCkge1xuICAgICAgICAgICAgY29uc3QgaW52TGVuZ3RoID0gMSAvIE1hdGguc3FydChsZW5ndGhTcSk7XG4gICAgICAgICAgICB0aGlzLnggPSBzcmMueCAqIGludkxlbmd0aDtcbiAgICAgICAgICAgIHRoaXMueSA9IHNyYy55ICogaW52TGVuZ3RoO1xuICAgICAgICAgICAgdGhpcy56ID0gc3JjLnogKiBpbnZMZW5ndGg7XG4gICAgICAgICAgICB0aGlzLncgPSBzcmMudyAqIGludkxlbmd0aDtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEVhY2ggZWxlbWVudCBpcyBzZXQgdG8gdGhlIGxhcmdlc3QgaW50ZWdlciBsZXNzIHRoYW4gb3IgZXF1YWwgdG8gaXRzIHZhbHVlLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtWZWM0fSBbc3JjXSAtIFRoZSB2ZWN0b3IgdG8gZmxvb3IuIElmIG5vdCBzZXQsIHRoZSBvcGVyYXRpb24gaXMgZG9uZSBpbiBwbGFjZS5cbiAgICAgKiBAcmV0dXJucyB7VmVjNH0gU2VsZiBmb3IgY2hhaW5pbmcuXG4gICAgICovXG4gICAgZmxvb3Ioc3JjID0gdGhpcykge1xuICAgICAgICB0aGlzLnggPSBNYXRoLmZsb29yKHNyYy54KTtcbiAgICAgICAgdGhpcy55ID0gTWF0aC5mbG9vcihzcmMueSk7XG4gICAgICAgIHRoaXMueiA9IE1hdGguZmxvb3Ioc3JjLnopO1xuICAgICAgICB0aGlzLncgPSBNYXRoLmZsb29yKHNyYy53KTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRWFjaCBlbGVtZW50IGlzIHJvdW5kZWQgdXAgdG8gdGhlIG5leHQgbGFyZ2VzdCBpbnRlZ2VyLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtWZWM0fSBbc3JjXSAtIFRoZSB2ZWN0b3IgdG8gY2VpbC4gSWYgbm90IHNldCwgdGhlIG9wZXJhdGlvbiBpcyBkb25lIGluIHBsYWNlLlxuICAgICAqIEByZXR1cm5zIHtWZWM0fSBTZWxmIGZvciBjaGFpbmluZy5cbiAgICAgKi9cbiAgICBjZWlsKHNyYyA9IHRoaXMpIHtcbiAgICAgICAgdGhpcy54ID0gTWF0aC5jZWlsKHNyYy54KTtcbiAgICAgICAgdGhpcy55ID0gTWF0aC5jZWlsKHNyYy55KTtcbiAgICAgICAgdGhpcy56ID0gTWF0aC5jZWlsKHNyYy56KTtcbiAgICAgICAgdGhpcy53ID0gTWF0aC5jZWlsKHNyYy53KTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRWFjaCBlbGVtZW50IGlzIHJvdW5kZWQgdXAgb3IgZG93biB0byB0aGUgbmVhcmVzdCBpbnRlZ2VyLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtWZWM0fSBbc3JjXSAtIFRoZSB2ZWN0b3IgdG8gcm91bmQuIElmIG5vdCBzZXQsIHRoZSBvcGVyYXRpb24gaXMgZG9uZSBpbiBwbGFjZS5cbiAgICAgKiBAcmV0dXJucyB7VmVjNH0gU2VsZiBmb3IgY2hhaW5pbmcuXG4gICAgICovXG4gICAgcm91bmQoc3JjID0gdGhpcykge1xuICAgICAgICB0aGlzLnggPSBNYXRoLnJvdW5kKHNyYy54KTtcbiAgICAgICAgdGhpcy55ID0gTWF0aC5yb3VuZChzcmMueSk7XG4gICAgICAgIHRoaXMueiA9IE1hdGgucm91bmQoc3JjLnopO1xuICAgICAgICB0aGlzLncgPSBNYXRoLnJvdW5kKHNyYy53KTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRWFjaCBlbGVtZW50IGlzIGFzc2lnbmVkIGEgdmFsdWUgZnJvbSByaHMgcGFyYW1ldGVyIGlmIGl0IGlzIHNtYWxsZXIuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1ZlYzR9IHJocyAtIFRoZSA0LWRpbWVuc2lvbmFsIHZlY3RvciB1c2VkIGFzIHRoZSBzb3VyY2Ugb2YgZWxlbWVudHMgdG8gY29tcGFyZSB0by5cbiAgICAgKiBAcmV0dXJucyB7VmVjNH0gU2VsZiBmb3IgY2hhaW5pbmcuXG4gICAgICovXG4gICAgbWluKHJocykge1xuICAgICAgICBpZiAocmhzLnggPCB0aGlzLngpIHRoaXMueCA9IHJocy54O1xuICAgICAgICBpZiAocmhzLnkgPCB0aGlzLnkpIHRoaXMueSA9IHJocy55O1xuICAgICAgICBpZiAocmhzLnogPCB0aGlzLnopIHRoaXMueiA9IHJocy56O1xuICAgICAgICBpZiAocmhzLncgPCB0aGlzLncpIHRoaXMudyA9IHJocy53O1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBFYWNoIGVsZW1lbnQgaXMgYXNzaWduZWQgYSB2YWx1ZSBmcm9tIHJocyBwYXJhbWV0ZXIgaWYgaXQgaXMgbGFyZ2VyLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtWZWM0fSByaHMgLSBUaGUgNC1kaW1lbnNpb25hbCB2ZWN0b3IgdXNlZCBhcyB0aGUgc291cmNlIG9mIGVsZW1lbnRzIHRvIGNvbXBhcmUgdG8uXG4gICAgICogQHJldHVybnMge1ZlYzR9IFNlbGYgZm9yIGNoYWluaW5nLlxuICAgICAqL1xuICAgIG1heChyaHMpIHtcbiAgICAgICAgaWYgKHJocy54ID4gdGhpcy54KSB0aGlzLnggPSByaHMueDtcbiAgICAgICAgaWYgKHJocy55ID4gdGhpcy55KSB0aGlzLnkgPSByaHMueTtcbiAgICAgICAgaWYgKHJocy56ID4gdGhpcy56KSB0aGlzLnogPSByaHMuejtcbiAgICAgICAgaWYgKHJocy53ID4gdGhpcy53KSB0aGlzLncgPSByaHMudztcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyB0aGUgc3BlY2lmaWVkIDQtZGltZW5zaW9uYWwgdmVjdG9yIHRvIHRoZSBzdXBwbGllZCBudW1lcmljYWwgdmFsdWVzLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHggLSBUaGUgdmFsdWUgdG8gc2V0IG9uIHRoZSBmaXJzdCBjb21wb25lbnQgb2YgdGhlIHZlY3Rvci5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0geSAtIFRoZSB2YWx1ZSB0byBzZXQgb24gdGhlIHNlY29uZCBjb21wb25lbnQgb2YgdGhlIHZlY3Rvci5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0geiAtIFRoZSB2YWx1ZSB0byBzZXQgb24gdGhlIHRoaXJkIGNvbXBvbmVudCBvZiB0aGUgdmVjdG9yLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSB3IC0gVGhlIHZhbHVlIHRvIHNldCBvbiB0aGUgZm91cnRoIGNvbXBvbmVudCBvZiB0aGUgdmVjdG9yLlxuICAgICAqIEByZXR1cm5zIHtWZWM0fSBTZWxmIGZvciBjaGFpbmluZy5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGNvbnN0IHYgPSBuZXcgcGMuVmVjNCgpO1xuICAgICAqIHYuc2V0KDUsIDEwLCAyMCwgNDApO1xuICAgICAqXG4gICAgICogLy8gT3V0cHV0cyA1LCAxMCwgMjAsIDQwXG4gICAgICogY29uc29sZS5sb2coXCJUaGUgcmVzdWx0IG9mIHRoZSB2ZWN0b3Igc2V0IGlzOiBcIiArIHYudG9TdHJpbmcoKSk7XG4gICAgICovXG4gICAgc2V0KHgsIHksIHosIHcpIHtcbiAgICAgICAgdGhpcy54ID0geDtcbiAgICAgICAgdGhpcy55ID0geTtcbiAgICAgICAgdGhpcy56ID0gejtcbiAgICAgICAgdGhpcy53ID0gdztcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTdWJ0cmFjdHMgYSA0LWRpbWVuc2lvbmFsIHZlY3RvciBmcm9tIGFub3RoZXIgaW4gcGxhY2UuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1ZlYzR9IHJocyAtIFRoZSB2ZWN0b3IgdG8gYWRkIHRvIHRoZSBzcGVjaWZpZWQgdmVjdG9yLlxuICAgICAqIEByZXR1cm5zIHtWZWM0fSBTZWxmIGZvciBjaGFpbmluZy5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGNvbnN0IGEgPSBuZXcgcGMuVmVjNCgxMCwgMTAsIDEwLCAxMCk7XG4gICAgICogY29uc3QgYiA9IG5ldyBwYy5WZWM0KDIwLCAyMCwgMjAsIDIwKTtcbiAgICAgKlxuICAgICAqIGEuc3ViKGIpO1xuICAgICAqXG4gICAgICogLy8gT3V0cHV0cyBbLTEwLCAtMTAsIC0xMCwgLTEwXVxuICAgICAqIGNvbnNvbGUubG9nKFwiVGhlIHJlc3VsdCBvZiB0aGUgc3VidHJhY3Rpb24gaXM6IFwiICsgYS50b1N0cmluZygpKTtcbiAgICAgKi9cbiAgICBzdWIocmhzKSB7XG4gICAgICAgIHRoaXMueCAtPSByaHMueDtcbiAgICAgICAgdGhpcy55IC09IHJocy55O1xuICAgICAgICB0aGlzLnogLT0gcmhzLno7XG4gICAgICAgIHRoaXMudyAtPSByaHMudztcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTdWJ0cmFjdHMgdHdvIDQtZGltZW5zaW9uYWwgdmVjdG9ycyBmcm9tIG9uZSBhbm90aGVyIGFuZCByZXR1cm5zIHRoZSByZXN1bHQuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1ZlYzR9IGxocyAtIFRoZSBmaXJzdCB2ZWN0b3Igb3BlcmFuZCBmb3IgdGhlIHN1YnRyYWN0aW9uLlxuICAgICAqIEBwYXJhbSB7VmVjNH0gcmhzIC0gVGhlIHNlY29uZCB2ZWN0b3Igb3BlcmFuZCBmb3IgdGhlIHN1YnRyYWN0aW9uLlxuICAgICAqIEByZXR1cm5zIHtWZWM0fSBTZWxmIGZvciBjaGFpbmluZy5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGNvbnN0IGEgPSBuZXcgcGMuVmVjNCgxMCwgMTAsIDEwLCAxMCk7XG4gICAgICogY29uc3QgYiA9IG5ldyBwYy5WZWM0KDIwLCAyMCwgMjAsIDIwKTtcbiAgICAgKiBjb25zdCByID0gbmV3IHBjLlZlYzQoKTtcbiAgICAgKlxuICAgICAqIHIuc3ViMihhLCBiKTtcbiAgICAgKlxuICAgICAqIC8vIE91dHB1dHMgWy0xMCwgLTEwLCAtMTAsIC0xMF1cbiAgICAgKiBjb25zb2xlLmxvZyhcIlRoZSByZXN1bHQgb2YgdGhlIHN1YnRyYWN0aW9uIGlzOiBcIiArIHIudG9TdHJpbmcoKSk7XG4gICAgICovXG4gICAgc3ViMihsaHMsIHJocykge1xuICAgICAgICB0aGlzLnggPSBsaHMueCAtIHJocy54O1xuICAgICAgICB0aGlzLnkgPSBsaHMueSAtIHJocy55O1xuICAgICAgICB0aGlzLnogPSBsaHMueiAtIHJocy56O1xuICAgICAgICB0aGlzLncgPSBsaHMudyAtIHJocy53O1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFN1YnRyYWN0cyBhIG51bWJlciBmcm9tIGVhY2ggZWxlbWVudCBvZiBhIHZlY3Rvci5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBzY2FsYXIgLSBUaGUgbnVtYmVyIHRvIHN1YnRyYWN0LlxuICAgICAqIEByZXR1cm5zIHtWZWM0fSBTZWxmIGZvciBjaGFpbmluZy5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGNvbnN0IHZlYyA9IG5ldyBwYy5WZWM0KDMsIDQsIDUsIDYpO1xuICAgICAqXG4gICAgICogdmVjLnN1YlNjYWxhcigyKTtcbiAgICAgKlxuICAgICAqIC8vIE91dHB1dHMgWzEsIDIsIDMsIDRdXG4gICAgICogY29uc29sZS5sb2coXCJUaGUgcmVzdWx0IG9mIHRoZSBzdWJ0cmFjdGlvbiBpczogXCIgKyB2ZWMudG9TdHJpbmcoKSk7XG4gICAgICovXG4gICAgc3ViU2NhbGFyKHNjYWxhcikge1xuICAgICAgICB0aGlzLnggLT0gc2NhbGFyO1xuICAgICAgICB0aGlzLnkgLT0gc2NhbGFyO1xuICAgICAgICB0aGlzLnogLT0gc2NhbGFyO1xuICAgICAgICB0aGlzLncgLT0gc2NhbGFyO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENvbnZlcnRzIHRoZSB2ZWN0b3IgdG8gc3RyaW5nIGZvcm0uXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7c3RyaW5nfSBUaGUgdmVjdG9yIGluIHN0cmluZyBmb3JtLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogY29uc3QgdiA9IG5ldyBwYy5WZWM0KDIwLCAxMCwgNSwgMCk7XG4gICAgICogLy8gT3V0cHV0cyBbMjAsIDEwLCA1LCAwXVxuICAgICAqIGNvbnNvbGUubG9nKHYudG9TdHJpbmcoKSk7XG4gICAgICovXG4gICAgdG9TdHJpbmcoKSB7XG4gICAgICAgIHJldHVybiBgWyR7dGhpcy54fSwgJHt0aGlzLnl9LCAke3RoaXMuen0sICR7dGhpcy53fV1gO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEEgY29uc3RhbnQgdmVjdG9yIHNldCB0byBbMCwgMCwgMCwgMF0uXG4gICAgICpcbiAgICAgKiBAdHlwZSB7VmVjNH1cbiAgICAgKiBAcmVhZG9ubHlcbiAgICAgKi9cbiAgICBzdGF0aWMgWkVSTyA9IE9iamVjdC5mcmVlemUobmV3IFZlYzQoMCwgMCwgMCwgMCkpO1xuXG4gICAgLyoqXG4gICAgICogQSBjb25zdGFudCB2ZWN0b3Igc2V0IHRvIFsxLCAxLCAxLCAxXS5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtWZWM0fVxuICAgICAqIEByZWFkb25seVxuICAgICAqL1xuICAgIHN0YXRpYyBPTkUgPSBPYmplY3QuZnJlZXplKG5ldyBWZWM0KDEsIDEsIDEsIDEpKTtcbn1cblxuZXhwb3J0IHsgVmVjNCB9O1xuIl0sIm5hbWVzIjpbIlZlYzQiLCJjb25zdHJ1Y3RvciIsIngiLCJ5IiwieiIsInciLCJsZW5ndGgiLCJhZGQiLCJyaHMiLCJhZGQyIiwibGhzIiwiYWRkU2NhbGFyIiwic2NhbGFyIiwiY2xvbmUiLCJjc3RyIiwiY29weSIsImRpdiIsImRpdjIiLCJkaXZTY2FsYXIiLCJkb3QiLCJlcXVhbHMiLCJNYXRoIiwic3FydCIsImxlbmd0aFNxIiwibGVycCIsImFscGhhIiwibXVsIiwibXVsMiIsIm11bFNjYWxhciIsIm5vcm1hbGl6ZSIsInNyYyIsImludkxlbmd0aCIsImZsb29yIiwiY2VpbCIsInJvdW5kIiwibWluIiwibWF4Iiwic2V0Iiwic3ViIiwic3ViMiIsInN1YlNjYWxhciIsInRvU3RyaW5nIiwiWkVSTyIsIk9iamVjdCIsImZyZWV6ZSIsIk9ORSJdLCJtYXBwaW5ncyI6IkFBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLE1BQU1BLElBQUksQ0FBQztBQTZCUDtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0lDLEVBQUFBLFdBQVdBLENBQUNDLENBQUMsR0FBRyxDQUFDLEVB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
