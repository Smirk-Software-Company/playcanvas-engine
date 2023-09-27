import { Vec3 } from '../math/vec3.js';

/**
 * An infinite ray.
 *
 * @category Math
 */
class Ray {
  /**
   * Creates a new Ray instance. The ray is infinite, starting at a given origin and pointing in
   * a given direction.
   *
   * @param {Vec3} [origin] - The starting point of the ray. The constructor copies
   * this parameter. Defaults to the origin (0, 0, 0).
   * @param {Vec3} [direction] - The direction of the ray. The constructor copies
   * this parameter. Defaults to a direction down the world negative Z axis (0, 0, -1).
   * @example
   * // Create a new ray starting at the position of this entity and pointing down
   * // the entity's negative Z axis
   * const ray = new pc.Ray(this.entity.getPosition(), this.entity.forward);
   */
  constructor(origin, direction) {
    /**
     * The starting point of the ray.
     *
     * @readonly
     * @type {Vec3}
     */
    this.origin = new Vec3();
    /**
     * The direction of the ray.
     *
     * @readonly
     * @type {Vec3}
     */
    this.direction = Vec3.FORWARD.clone();
    if (origin) {
      this.origin.copy(origin);
    }
    if (direction) {
      this.direction.copy(direction);
    }
  }

  /**
   * Sets origin and direction to the supplied vector values.
   *
   * @param {Vec3} origin - The starting point of the ray.
   * @param {Vec3} direction - The direction of the ray.
   * @returns {Ray} Self for chaining.
   */
  set(origin, direction) {
    this.origin.copy(origin);
    this.direction.copy(direction);
    return this;
  }

  /**
   * Copies the contents of a source Ray.
   *
   * @param {Ray} src - The Ray to copy from.
   * @returns {Ray} Self for chaining.
   */
  copy(src) {
    return this.set(src.origin, src.direction);
  }

  /**
   * Returns a clone of the Ray.
   *
   * @returns {this} A duplicate Ray.
   */
  clone() {
    return new this.constructor(this.origin, this.direction);
  }
}

export { Ray };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmF5LmpzIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvY29yZS9zaGFwZS9yYXkuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgVmVjMyB9IGZyb20gJy4uL21hdGgvdmVjMy5qcyc7XG5cbi8qKlxuICogQW4gaW5maW5pdGUgcmF5LlxuICpcbiAqIEBjYXRlZ29yeSBNYXRoXG4gKi9cbmNsYXNzIFJheSB7XG4gICAgLyoqXG4gICAgICogVGhlIHN0YXJ0aW5nIHBvaW50IG9mIHRoZSByYXkuXG4gICAgICpcbiAgICAgKiBAcmVhZG9ubHlcbiAgICAgKiBAdHlwZSB7VmVjM31cbiAgICAgKi9cbiAgICBvcmlnaW4gPSBuZXcgVmVjMygpO1xuXG4gICAgLyoqXG4gICAgICogVGhlIGRpcmVjdGlvbiBvZiB0aGUgcmF5LlxuICAgICAqXG4gICAgICogQHJlYWRvbmx5XG4gICAgICogQHR5cGUge1ZlYzN9XG4gICAgICovXG4gICAgZGlyZWN0aW9uID0gVmVjMy5GT1JXQVJELmNsb25lKCk7XG5cbiAgICAvKipcbiAgICAgKiBDcmVhdGVzIGEgbmV3IFJheSBpbnN0YW5jZS4gVGhlIHJheSBpcyBpbmZpbml0ZSwgc3RhcnRpbmcgYXQgYSBnaXZlbiBvcmlnaW4gYW5kIHBvaW50aW5nIGluXG4gICAgICogYSBnaXZlbiBkaXJlY3Rpb24uXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1ZlYzN9IFtvcmlnaW5dIC0gVGhlIHN0YXJ0aW5nIHBvaW50IG9mIHRoZSByYXkuIFRoZSBjb25zdHJ1Y3RvciBjb3BpZXNcbiAgICAgKiB0aGlzIHBhcmFtZXRlci4gRGVmYXVsdHMgdG8gdGhlIG9yaWdpbiAoMCwgMCwgMCkuXG4gICAgICogQHBhcmFtIHtWZWMzfSBbZGlyZWN0aW9uXSAtIFRoZSBkaXJlY3Rpb24gb2YgdGhlIHJheS4gVGhlIGNvbnN0cnVjdG9yIGNvcGllc1xuICAgICAqIHRoaXMgcGFyYW1ldGVyLiBEZWZhdWx0cyB0byBhIGRpcmVjdGlvbiBkb3duIHRoZSB3b3JsZCBuZWdhdGl2ZSBaIGF4aXMgKDAsIDAsIC0xKS5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIC8vIENyZWF0ZSBhIG5ldyByYXkgc3RhcnRpbmcgYXQgdGhlIHBvc2l0aW9uIG9mIHRoaXMgZW50aXR5IGFuZCBwb2ludGluZyBkb3duXG4gICAgICogLy8gdGhlIGVudGl0eSdzIG5lZ2F0aXZlIFogYXhpc1xuICAgICAqIGNvbnN0IHJheSA9IG5ldyBwYy5SYXkodGhpcy5lbnRpdHkuZ2V0UG9zaXRpb24oKSwgdGhpcy5lbnRpdHkuZm9yd2FyZCk7XG4gICAgICovXG4gICAgY29uc3RydWN0b3Iob3JpZ2luLCBkaXJlY3Rpb24pIHtcbiAgICAgICAgaWYgKG9yaWdpbikge1xuICAgICAgICAgICAgdGhpcy5vcmlnaW4uY29weShvcmlnaW4pO1xuICAgICAgICB9XG4gICAgICAgIGlmIChkaXJlY3Rpb24pIHtcbiAgICAgICAgICAgIHRoaXMuZGlyZWN0aW9uLmNvcHkoZGlyZWN0aW9uKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgb3JpZ2luIGFuZCBkaXJlY3Rpb24gdG8gdGhlIHN1cHBsaWVkIHZlY3RvciB2YWx1ZXMuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1ZlYzN9IG9yaWdpbiAtIFRoZSBzdGFydGluZyBwb2ludCBvZiB0aGUgcmF5LlxuICAgICAqIEBwYXJhbSB7VmVjM30gZGlyZWN0aW9uIC0gVGhlIGRpcmVjdGlvbiBvZiB0aGUgcmF5LlxuICAgICAqIEByZXR1cm5zIHtSYXl9IFNlbGYgZm9yIGNoYWluaW5nLlxuICAgICAqL1xuICAgIHNldChvcmlnaW4sIGRpcmVjdGlvbikge1xuICAgICAgICB0aGlzLm9yaWdpbi5jb3B5KG9yaWdpbik7XG4gICAgICAgIHRoaXMuZGlyZWN0aW9uLmNvcHkoZGlyZWN0aW9uKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ29waWVzIHRoZSBjb250ZW50cyBvZiBhIHNvdXJjZSBSYXkuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1JheX0gc3JjIC0gVGhlIFJheSB0byBjb3B5IGZyb20uXG4gICAgICogQHJldHVybnMge1JheX0gU2VsZiBmb3IgY2hhaW5pbmcuXG4gICAgICovXG4gICAgY29weShzcmMpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2V0KHNyYy5vcmlnaW4sIHNyYy5kaXJlY3Rpb24pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYSBjbG9uZSBvZiB0aGUgUmF5LlxuICAgICAqXG4gICAgICogQHJldHVybnMge3RoaXN9IEEgZHVwbGljYXRlIFJheS5cbiAgICAgKi9cbiAgICBjbG9uZSgpIHtcbiAgICAgICAgcmV0dXJuIG5ldyB0aGlzLmNvbnN0cnVjdG9yKHRoaXMub3JpZ2luLCB0aGlzLmRpcmVjdGlvbik7XG4gICAgfVxufVxuXG5leHBvcnQgeyBSYXkgfTtcbiJdLCJuYW1lcyI6WyJSYXkiLCJjb25zdHJ1Y3RvciIsIm9yaWdpbiIsImRpcmVjdGlvbiIsIlZlYzMiLCJGT1JXQVJEIiwiY2xvbmUiLCJjb3B5Iiwic2V0Iiwic3JjIl0sIm1hcHBpbmdzIjoiOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxNQUFNQSxHQUFHLENBQUM7QUFpQk47QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDSUMsRUFBQUEsV0FBV0EsQ0FBQ0MsTUFBTSxFQUFFQyxTQUFTLEVBQUU7QUE3Qi9CO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUxJLElBQUEsSUFBQSxDQU1BRCxNQUFNLEdBQUcsSUFBSUUsSUFBSSxFQUFFLENBQUE7QUFFbkI7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0lBTEksSUFNQUQsQ0FBQUEsU0FBUyxHQUFHQyxJQUFJLENBQUNDLE9BQU8sQ0FBQ0MsS0FBSyxFQUFFLENBQUE7QUFnQjVCLElBQUEsSUFBSUosTUFBTSxFQUFFO0FBQ1IsTUFBQSxJQUFJLENBQUNBLE1BQU0sQ0FBQ0ssSUFBSSxDQUFDTCxNQUFNLENBQUMsQ0FBQTtBQUM1QixLQUFBO0FBQ0EsSUFBQSxJQUFJQyxTQUFTLEVBQUU7QUFDWCxNQUFBLElBQUksQ0FBQ0EsU0FBUyxDQUFDSSxJQUFJLENBQUNKLFNBQVMsQ0FBQyxDQUFBO0FBQ2xDLEtBQUE7QUFDSixHQUFBOztBQUVBO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0lLLEVBQUFBLEdBQUdBLENBQUNOLE1BQU0sRUFBRUMsU0FBUyxFQUFFO0FBQ25CLElBQUEsSUFBSSxDQUFDRCxNQUFNLENBQUNLLElBQUksQ0FBQ0wsTUFBTSxDQUFDLENBQUE7QUFDeEIsSUFBQSxJQUFJLENBQUNDLFNBQVMsQ0FBQ0ksSUFBSSxDQUFDSixTQUFTLENBQUMsQ0FBQTtBQUM5QixJQUFBLE9BQU8sSUFBSSxDQUFBO0FBQ2YsR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7RUFDSUksSUFBSUEsQ0FBQ0UsR0FBRyxFQUFFO0lBQ04sT0FBTyxJQUFJLENBQUNELEdBQUcsQ0FBQ0MsR0FBRyxDQUFDUCxNQUFNLEVBQUVPLEdBQUcsQ0FBQ04sU0FBUyxDQUFDLENBQUE7QUFDOUMsR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0lHLEVBQUFBLEtBQUtBLEdBQUc7QUFDSixJQUFBLE9BQU8sSUFBSSxJQUFJLENBQUNMLFdBQVcsQ0FBQyxJQUFJLENBQUNDLE1BQU0sRUFBRSxJQUFJLENBQUNDLFNBQVMsQ0FBQyxDQUFBO0FBQzVELEdBQUE7QUFDSjs7OzsifQ==
