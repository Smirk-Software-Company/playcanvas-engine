import { Vec3 } from '../math/vec3.js';

/**
 * An infinite plane. Internally it's represented in a parametric equation form:
 * ax + by + cz + distance = 0.
 *
 * @category Math
 */
class Plane {
  /**
   * Create a new Plane instance.
   *
   * @param {Vec3} [normal] - Normal of the plane. The constructor copies this parameter. Defaults
   * to {@link Vec3.UP}.
   * @param {number} [distance] - The distance from the plane to the origin, along its normal.
   * Defaults to 0.
   */
  constructor(normal = Vec3.UP, distance = 0) {
    /**
     * The normal of the plane.
     *
     * @readonly
     * @type {Vec3}
     */
    this.normal = new Vec3();
    /**
     * The distance from the plane to the origin, along its normal.
     *
     * @readonly
     * @type {number}
     */
    this.distance = void 0;
    this.normal.copy(normal);
    this.distance = distance;
  }

  /**
   * Sets the plane based on a specified normal and a point on the plane.
   *
   * @param {Vec3} point - The point on the plane.
   * @param {Vec3} normal - The normal of the plane.
   * @returns {Plane} Self for chaining.
   */
  setFromPointNormal(point, normal) {
    this.normal.copy(normal);
    this.distance = -this.normal.dot(point);
    return this;
  }

  /**
   * Test if the plane intersects between two points.
   *
   * @param {Vec3} start - Start position of line.
   * @param {Vec3} end - End position of line.
   * @param {Vec3} [point] - If there is an intersection, the intersection point will be copied
   * into here.
   * @returns {boolean} True if there is an intersection.
   */
  intersectsLine(start, end, point) {
    const d = this.distance;
    const d0 = this.normal.dot(start) + d;
    const d1 = this.normal.dot(end) + d;
    const t = d0 / (d0 - d1);
    const intersects = t >= 0 && t <= 1;
    if (intersects && point) point.lerp(start, end, t);
    return intersects;
  }

  /**
   * Test if a ray intersects with the infinite plane.
   *
   * @param {import('./ray.js').Ray} ray - Ray to test against (direction must be normalized).
   * @param {Vec3} [point] - If there is an intersection, the intersection point will be copied
   * into here.
   * @returns {boolean} True if there is an intersection.
   */
  intersectsRay(ray, point) {
    const denominator = this.normal.dot(ray.direction);
    if (denominator === 0) return false;
    const t = -(this.normal.dot(ray.origin) + this.distance) / denominator;
    if (t >= 0 && point) {
      point.copy(ray.direction).mulScalar(t).add(ray.origin);
    }
    return t >= 0;
  }

  /**
   * Copies the contents of a source Plane.
   *
   * @param {Plane} src - The Plane to copy from.
   * @returns {Plane} Self for chaining.
   */
  copy(src) {
    this.normal.copy(src.normal);
    this.distance = src.distance;
    return this;
  }

  /**
   * Returns a clone of the Plane.
   *
   * @returns {this} A duplicate Plane.
   */
  clone() {
    /** @type {this} */
    const cstr = this.constructor;
    return new cstr().copy(this);
  }
}

export { Plane };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGxhbmUuanMiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9jb3JlL3NoYXBlL3BsYW5lLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFZlYzMgfSBmcm9tICcuLi9tYXRoL3ZlYzMuanMnO1xuXG4vKipcbiAqIEFuIGluZmluaXRlIHBsYW5lLiBJbnRlcm5hbGx5IGl0J3MgcmVwcmVzZW50ZWQgaW4gYSBwYXJhbWV0cmljIGVxdWF0aW9uIGZvcm06XG4gKiBheCArIGJ5ICsgY3ogKyBkaXN0YW5jZSA9IDAuXG4gKlxuICogQGNhdGVnb3J5IE1hdGhcbiAqL1xuY2xhc3MgUGxhbmUge1xuICAgIC8qKlxuICAgICAqIFRoZSBub3JtYWwgb2YgdGhlIHBsYW5lLlxuICAgICAqXG4gICAgICogQHJlYWRvbmx5XG4gICAgICogQHR5cGUge1ZlYzN9XG4gICAgICovXG4gICAgbm9ybWFsID0gbmV3IFZlYzMoKTtcblxuICAgIC8qKlxuICAgICAqIFRoZSBkaXN0YW5jZSBmcm9tIHRoZSBwbGFuZSB0byB0aGUgb3JpZ2luLCBhbG9uZyBpdHMgbm9ybWFsLlxuICAgICAqXG4gICAgICogQHJlYWRvbmx5XG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKi9cbiAgICBkaXN0YW5jZTtcblxuICAgIC8qKlxuICAgICAqIENyZWF0ZSBhIG5ldyBQbGFuZSBpbnN0YW5jZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7VmVjM30gW25vcm1hbF0gLSBOb3JtYWwgb2YgdGhlIHBsYW5lLiBUaGUgY29uc3RydWN0b3IgY29waWVzIHRoaXMgcGFyYW1ldGVyLiBEZWZhdWx0c1xuICAgICAqIHRvIHtAbGluayBWZWMzLlVQfS5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gW2Rpc3RhbmNlXSAtIFRoZSBkaXN0YW5jZSBmcm9tIHRoZSBwbGFuZSB0byB0aGUgb3JpZ2luLCBhbG9uZyBpdHMgbm9ybWFsLlxuICAgICAqIERlZmF1bHRzIHRvIDAuXG4gICAgICovXG4gICAgY29uc3RydWN0b3Iobm9ybWFsID0gVmVjMy5VUCwgZGlzdGFuY2UgPSAwKSB7XG4gICAgICAgIHRoaXMubm9ybWFsLmNvcHkobm9ybWFsKTtcbiAgICAgICAgdGhpcy5kaXN0YW5jZSA9IGRpc3RhbmNlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIHBsYW5lIGJhc2VkIG9uIGEgc3BlY2lmaWVkIG5vcm1hbCBhbmQgYSBwb2ludCBvbiB0aGUgcGxhbmUuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1ZlYzN9IHBvaW50IC0gVGhlIHBvaW50IG9uIHRoZSBwbGFuZS5cbiAgICAgKiBAcGFyYW0ge1ZlYzN9IG5vcm1hbCAtIFRoZSBub3JtYWwgb2YgdGhlIHBsYW5lLlxuICAgICAqIEByZXR1cm5zIHtQbGFuZX0gU2VsZiBmb3IgY2hhaW5pbmcuXG4gICAgICovXG4gICAgc2V0RnJvbVBvaW50Tm9ybWFsKHBvaW50LCBub3JtYWwpIHtcbiAgICAgICAgdGhpcy5ub3JtYWwuY29weShub3JtYWwpO1xuICAgICAgICB0aGlzLmRpc3RhbmNlID0gLXRoaXMubm9ybWFsLmRvdChwb2ludCk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRlc3QgaWYgdGhlIHBsYW5lIGludGVyc2VjdHMgYmV0d2VlbiB0d28gcG9pbnRzLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtWZWMzfSBzdGFydCAtIFN0YXJ0IHBvc2l0aW9uIG9mIGxpbmUuXG4gICAgICogQHBhcmFtIHtWZWMzfSBlbmQgLSBFbmQgcG9zaXRpb24gb2YgbGluZS5cbiAgICAgKiBAcGFyYW0ge1ZlYzN9IFtwb2ludF0gLSBJZiB0aGVyZSBpcyBhbiBpbnRlcnNlY3Rpb24sIHRoZSBpbnRlcnNlY3Rpb24gcG9pbnQgd2lsbCBiZSBjb3BpZWRcbiAgICAgKiBpbnRvIGhlcmUuXG4gICAgICogQHJldHVybnMge2Jvb2xlYW59IFRydWUgaWYgdGhlcmUgaXMgYW4gaW50ZXJzZWN0aW9uLlxuICAgICAqL1xuICAgIGludGVyc2VjdHNMaW5lKHN0YXJ0LCBlbmQsIHBvaW50KSB7XG4gICAgICAgIGNvbnN0IGQgPSB0aGlzLmRpc3RhbmNlO1xuICAgICAgICBjb25zdCBkMCA9IHRoaXMubm9ybWFsLmRvdChzdGFydCkgKyBkO1xuICAgICAgICBjb25zdCBkMSA9IHRoaXMubm9ybWFsLmRvdChlbmQpICsgZDtcblxuICAgICAgICBjb25zdCB0ID0gZDAgLyAoZDAgLSBkMSk7XG4gICAgICAgIGNvbnN0IGludGVyc2VjdHMgPSB0ID49IDAgJiYgdCA8PSAxO1xuICAgICAgICBpZiAoaW50ZXJzZWN0cyAmJiBwb2ludClcbiAgICAgICAgICAgIHBvaW50LmxlcnAoc3RhcnQsIGVuZCwgdCk7XG5cbiAgICAgICAgcmV0dXJuIGludGVyc2VjdHM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVGVzdCBpZiBhIHJheSBpbnRlcnNlY3RzIHdpdGggdGhlIGluZmluaXRlIHBsYW5lLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4vcmF5LmpzJykuUmF5fSByYXkgLSBSYXkgdG8gdGVzdCBhZ2FpbnN0IChkaXJlY3Rpb24gbXVzdCBiZSBub3JtYWxpemVkKS5cbiAgICAgKiBAcGFyYW0ge1ZlYzN9IFtwb2ludF0gLSBJZiB0aGVyZSBpcyBhbiBpbnRlcnNlY3Rpb24sIHRoZSBpbnRlcnNlY3Rpb24gcG9pbnQgd2lsbCBiZSBjb3BpZWRcbiAgICAgKiBpbnRvIGhlcmUuXG4gICAgICogQHJldHVybnMge2Jvb2xlYW59IFRydWUgaWYgdGhlcmUgaXMgYW4gaW50ZXJzZWN0aW9uLlxuICAgICAqL1xuICAgIGludGVyc2VjdHNSYXkocmF5LCBwb2ludCkge1xuICAgICAgICBjb25zdCBkZW5vbWluYXRvciA9IHRoaXMubm9ybWFsLmRvdChyYXkuZGlyZWN0aW9uKTtcbiAgICAgICAgaWYgKGRlbm9taW5hdG9yID09PSAwKVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuXG4gICAgICAgIGNvbnN0IHQgPSAtKHRoaXMubm9ybWFsLmRvdChyYXkub3JpZ2luKSArIHRoaXMuZGlzdGFuY2UpIC8gZGVub21pbmF0b3I7XG4gICAgICAgIGlmICh0ID49IDAgJiYgcG9pbnQpIHtcbiAgICAgICAgICAgIHBvaW50LmNvcHkocmF5LmRpcmVjdGlvbikubXVsU2NhbGFyKHQpLmFkZChyYXkub3JpZ2luKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0ID49IDA7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ29waWVzIHRoZSBjb250ZW50cyBvZiBhIHNvdXJjZSBQbGFuZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7UGxhbmV9IHNyYyAtIFRoZSBQbGFuZSB0byBjb3B5IGZyb20uXG4gICAgICogQHJldHVybnMge1BsYW5lfSBTZWxmIGZvciBjaGFpbmluZy5cbiAgICAgKi9cbiAgICBjb3B5KHNyYykge1xuICAgICAgICB0aGlzLm5vcm1hbC5jb3B5KHNyYy5ub3JtYWwpO1xuICAgICAgICB0aGlzLmRpc3RhbmNlID0gc3JjLmRpc3RhbmNlO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGEgY2xvbmUgb2YgdGhlIFBsYW5lLlxuICAgICAqXG4gICAgICogQHJldHVybnMge3RoaXN9IEEgZHVwbGljYXRlIFBsYW5lLlxuICAgICAqL1xuICAgIGNsb25lKCkge1xuICAgICAgICAvKiogQHR5cGUge3RoaXN9ICovXG4gICAgICAgIGNvbnN0IGNzdHIgPSB0aGlzLmNvbnN0cnVjdG9yO1xuICAgICAgICByZXR1cm4gbmV3IGNzdHIoKS5jb3B5KHRoaXMpO1xuICAgIH1cbn1cblxuZXhwb3J0IHsgUGxhbmUgfTtcbiJdLCJuYW1lcyI6WyJQbGFuZSIsImNvbnN0cnVjdG9yIiwibm9ybWFsIiwiVmVjMyIsIlVQIiwiZGlzdGFuY2UiLCJjb3B5Iiwic2V0RnJvbVBvaW50Tm9ybWFsIiwicG9pbnQiLCJkb3QiLCJpbnRlcnNlY3RzTGluZSIsInN0YXJ0IiwiZW5kIiwiZCIsImQwIiwiZDEiLCJ0IiwiaW50ZXJzZWN0cyIsImxlcnAiLCJpbnRlcnNlY3RzUmF5IiwicmF5IiwiZGVub21pbmF0b3IiLCJkaXJlY3Rpb24iLCJvcmlnaW4iLCJtdWxTY2FsYXIiLCJhZGQiLCJzcmMiLCJjbG9uZSIsImNzdHIiXSwibWFwcGluZ3MiOiI7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsTUFBTUEsS0FBSyxDQUFDO0FBaUJSO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7RUFDSUMsV0FBV0EsQ0FBQ0MsTUFBTSxHQUFHQyxJQUFJLENBQUNDLEVBQUUsRUFBRUMsUUFBUSxHQUFHLENBQUMsRUFBRTtBQXhCNUM7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBTEksSUFBQSxJQUFBLENBTUFILE1BQU0sR0FBRyxJQUFJQyxJQUFJLEVBQUUsQ0FBQTtBQUVuQjtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFMSSxJQUFBLElBQUEsQ0FNQUUsUUFBUSxHQUFBLEtBQUEsQ0FBQSxDQUFBO0FBV0osSUFBQSxJQUFJLENBQUNILE1BQU0sQ0FBQ0ksSUFBSSxDQUFDSixNQUFNLENBQUMsQ0FBQTtJQUN4QixJQUFJLENBQUNHLFFBQVEsR0FBR0EsUUFBUSxDQUFBO0FBQzVCLEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDSUUsRUFBQUEsa0JBQWtCQSxDQUFDQyxLQUFLLEVBQUVOLE1BQU0sRUFBRTtBQUM5QixJQUFBLElBQUksQ0FBQ0EsTUFBTSxDQUFDSSxJQUFJLENBQUNKLE1BQU0sQ0FBQyxDQUFBO0lBQ3hCLElBQUksQ0FBQ0csUUFBUSxHQUFHLENBQUMsSUFBSSxDQUFDSCxNQUFNLENBQUNPLEdBQUcsQ0FBQ0QsS0FBSyxDQUFDLENBQUE7QUFDdkMsSUFBQSxPQUFPLElBQUksQ0FBQTtBQUNmLEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FB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
