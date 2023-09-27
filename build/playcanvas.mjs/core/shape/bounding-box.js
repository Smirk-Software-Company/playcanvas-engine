import { Debug } from '../debug.js';
import { Vec3 } from '../math/vec3.js';

const tmpVecA = new Vec3();
const tmpVecB = new Vec3();
const tmpVecC = new Vec3();
const tmpVecD = new Vec3();
const tmpVecE = new Vec3();

/**
 * Axis-Aligned Bounding Box.
 *
 * @category Math
 */
class BoundingBox {
  /**
   * Create a new BoundingBox instance. The bounding box is axis-aligned.
   *
   * @param {Vec3} [center] - Center of box. The constructor takes a reference of this parameter.
   * @param {Vec3} [halfExtents] - Half the distance across the box in each axis. The constructor
   * takes a reference of this parameter. Defaults to 0.5 on each axis.
   */
  constructor(center = new Vec3(), halfExtents = new Vec3(0.5, 0.5, 0.5)) {
    /**
     * Center of box.
     *
     * @type {Vec3}
     */
    this.center = void 0;
    /**
     * Half the distance across the box in each axis.
     *
     * @type {Vec3}
     */
    this.halfExtents = void 0;
    /**
     * @type {Vec3}
     * @private
     */
    this._min = new Vec3();
    /**
     * @type {Vec3}
     * @private
     */
    this._max = new Vec3();
    Debug.assert(!Object.isFrozen(center), 'The constructor of \'BoundingBox\' does not accept a constant (frozen) object as a \'center\' parameter');
    Debug.assert(!Object.isFrozen(halfExtents), 'The constructor of \'BoundingBox\' does not accept a constant (frozen) object as a \'halfExtents\' parameter');
    this.center = center;
    this.halfExtents = halfExtents;
  }

  /**
   * Combines two bounding boxes into one, enclosing both.
   *
   * @param {BoundingBox} other - Bounding box to add.
   */
  add(other) {
    const tc = this.center;
    const tcx = tc.x;
    const tcy = tc.y;
    const tcz = tc.z;
    const th = this.halfExtents;
    const thx = th.x;
    const thy = th.y;
    const thz = th.z;
    let tminx = tcx - thx;
    let tmaxx = tcx + thx;
    let tminy = tcy - thy;
    let tmaxy = tcy + thy;
    let tminz = tcz - thz;
    let tmaxz = tcz + thz;
    const oc = other.center;
    const ocx = oc.x;
    const ocy = oc.y;
    const ocz = oc.z;
    const oh = other.halfExtents;
    const ohx = oh.x;
    const ohy = oh.y;
    const ohz = oh.z;
    const ominx = ocx - ohx;
    const omaxx = ocx + ohx;
    const ominy = ocy - ohy;
    const omaxy = ocy + ohy;
    const ominz = ocz - ohz;
    const omaxz = ocz + ohz;
    if (ominx < tminx) tminx = ominx;
    if (omaxx > tmaxx) tmaxx = omaxx;
    if (ominy < tminy) tminy = ominy;
    if (omaxy > tmaxy) tmaxy = omaxy;
    if (ominz < tminz) tminz = ominz;
    if (omaxz > tmaxz) tmaxz = omaxz;
    tc.x = (tminx + tmaxx) * 0.5;
    tc.y = (tminy + tmaxy) * 0.5;
    tc.z = (tminz + tmaxz) * 0.5;
    th.x = (tmaxx - tminx) * 0.5;
    th.y = (tmaxy - tminy) * 0.5;
    th.z = (tmaxz - tminz) * 0.5;
  }

  /**
   * Copies the contents of a source AABB.
   *
   * @param {BoundingBox} src - The AABB to copy from.
   */
  copy(src) {
    this.center.copy(src.center);
    this.halfExtents.copy(src.halfExtents);
  }

  /**
   * Returns a clone of the AABB.
   *
   * @returns {BoundingBox} A duplicate AABB.
   */
  clone() {
    return new BoundingBox(this.center.clone(), this.halfExtents.clone());
  }

  /**
   * Test whether two axis-aligned bounding boxes intersect.
   *
   * @param {BoundingBox} other - Bounding box to test against.
   * @returns {boolean} True if there is an intersection.
   */
  intersects(other) {
    const aMax = this.getMax();
    const aMin = this.getMin();
    const bMax = other.getMax();
    const bMin = other.getMin();
    return aMin.x <= bMax.x && aMax.x >= bMin.x && aMin.y <= bMax.y && aMax.y >= bMin.y && aMin.z <= bMax.z && aMax.z >= bMin.z;
  }
  _intersectsRay(ray, point) {
    const tMin = tmpVecA.copy(this.getMin()).sub(ray.origin);
    const tMax = tmpVecB.copy(this.getMax()).sub(ray.origin);
    const dir = ray.direction;

    // Ensure that we are not dividing it by zero
    if (dir.x === 0) {
      tMin.x = tMin.x < 0 ? -Number.MAX_VALUE : Number.MAX_VALUE;
      tMax.x = tMax.x < 0 ? -Number.MAX_VALUE : Number.MAX_VALUE;
    } else {
      tMin.x /= dir.x;
      tMax.x /= dir.x;
    }
    if (dir.y === 0) {
      tMin.y = tMin.y < 0 ? -Number.MAX_VALUE : Number.MAX_VALUE;
      tMax.y = tMax.y < 0 ? -Number.MAX_VALUE : Number.MAX_VALUE;
    } else {
      tMin.y /= dir.y;
      tMax.y /= dir.y;
    }
    if (dir.z === 0) {
      tMin.z = tMin.z < 0 ? -Number.MAX_VALUE : Number.MAX_VALUE;
      tMax.z = tMax.z < 0 ? -Number.MAX_VALUE : Number.MAX_VALUE;
    } else {
      tMin.z /= dir.z;
      tMax.z /= dir.z;
    }
    const realMin = tmpVecC.set(Math.min(tMin.x, tMax.x), Math.min(tMin.y, tMax.y), Math.min(tMin.z, tMax.z));
    const realMax = tmpVecD.set(Math.max(tMin.x, tMax.x), Math.max(tMin.y, tMax.y), Math.max(tMin.z, tMax.z));
    const minMax = Math.min(Math.min(realMax.x, realMax.y), realMax.z);
    const maxMin = Math.max(Math.max(realMin.x, realMin.y), realMin.z);
    const intersects = minMax >= maxMin && maxMin >= 0;
    if (intersects) point.copy(ray.direction).mulScalar(maxMin).add(ray.origin);
    return intersects;
  }
  _fastIntersectsRay(ray) {
    const diff = tmpVecA;
    const cross = tmpVecB;
    const prod = tmpVecC;
    const absDiff = tmpVecD;
    const absDir = tmpVecE;
    const rayDir = ray.direction;
    diff.sub2(ray.origin, this.center);
    absDiff.set(Math.abs(diff.x), Math.abs(diff.y), Math.abs(diff.z));
    prod.mul2(diff, rayDir);
    if (absDiff.x > this.halfExtents.x && prod.x >= 0) return false;
    if (absDiff.y > this.halfExtents.y && prod.y >= 0) return false;
    if (absDiff.z > this.halfExtents.z && prod.z >= 0) return false;
    absDir.set(Math.abs(rayDir.x), Math.abs(rayDir.y), Math.abs(rayDir.z));
    cross.cross(rayDir, diff);
    cross.set(Math.abs(cross.x), Math.abs(cross.y), Math.abs(cross.z));
    if (cross.x > this.halfExtents.y * absDir.z + this.halfExtents.z * absDir.y) return false;
    if (cross.y > this.halfExtents.x * absDir.z + this.halfExtents.z * absDir.x) return false;
    if (cross.z > this.halfExtents.x * absDir.y + this.halfExtents.y * absDir.x) return false;
    return true;
  }

  /**
   * Test if a ray intersects with the AABB.
   *
   * @param {import('./ray.js').Ray} ray - Ray to test against (direction must be normalized).
   * @param {Vec3} [point] - If there is an intersection, the intersection point will be copied
   * into here.
   * @returns {boolean} True if there is an intersection.
   */
  intersectsRay(ray, point) {
    if (point) {
      return this._intersectsRay(ray, point);
    }
    return this._fastIntersectsRay(ray);
  }

  /**
   * Sets the minimum and maximum corner of the AABB. Using this function is faster than
   * assigning min and max separately.
   *
   * @param {Vec3} min - The minimum corner of the AABB.
   * @param {Vec3} max - The maximum corner of the AABB.
   */
  setMinMax(min, max) {
    this.center.add2(max, min).mulScalar(0.5);
    this.halfExtents.sub2(max, min).mulScalar(0.5);
  }

  /**
   * Return the minimum corner of the AABB.
   *
   * @returns {Vec3} Minimum corner.
   */
  getMin() {
    return this._min.copy(this.center).sub(this.halfExtents);
  }

  /**
   * Return the maximum corner of the AABB.
   *
   * @returns {Vec3} Maximum corner.
   */
  getMax() {
    return this._max.copy(this.center).add(this.halfExtents);
  }

  /**
   * Test if a point is inside a AABB.
   *
   * @param {Vec3} point - Point to test.
   * @returns {boolean} True if the point is inside the AABB and false otherwise.
   */
  containsPoint(point) {
    const min = this.getMin();
    const max = this.getMax();
    if (point.x < min.x || point.x > max.x || point.y < min.y || point.y > max.y || point.z < min.z || point.z > max.z) {
      return false;
    }
    return true;
  }

  /**
   * Set an AABB to enclose the specified AABB if it were to be transformed by the specified 4x4
   * matrix.
   *
   * @param {BoundingBox} aabb - Box to transform and enclose.
   * @param {import('../math/mat4.js').Mat4} m - Transformation matrix to apply to source AABB.
   * @param {boolean} ignoreScale - If true is specified, a scale from the matrix is ignored. Defaults to false.
   */
  setFromTransformedAabb(aabb, m, ignoreScale = false) {
    const ac = aabb.center;
    const ar = aabb.halfExtents;
    const d = m.data;
    let mx0 = d[0];
    let mx1 = d[4];
    let mx2 = d[8];
    let my0 = d[1];
    let my1 = d[5];
    let my2 = d[9];
    let mz0 = d[2];
    let mz1 = d[6];
    let mz2 = d[10];

    // renormalize axis if scale is to be ignored
    if (ignoreScale) {
      let lengthSq = mx0 * mx0 + mx1 * mx1 + mx2 * mx2;
      if (lengthSq > 0) {
        const invLength = 1 / Math.sqrt(lengthSq);
        mx0 *= invLength;
        mx1 *= invLength;
        mx2 *= invLength;
      }
      lengthSq = my0 * my0 + my1 * my1 + my2 * my2;
      if (lengthSq > 0) {
        const invLength = 1 / Math.sqrt(lengthSq);
        my0 *= invLength;
        my1 *= invLength;
        my2 *= invLength;
      }
      lengthSq = mz0 * mz0 + mz1 * mz1 + mz2 * mz2;
      if (lengthSq > 0) {
        const invLength = 1 / Math.sqrt(lengthSq);
        mz0 *= invLength;
        mz1 *= invLength;
        mz2 *= invLength;
      }
    }
    this.center.set(d[12] + mx0 * ac.x + mx1 * ac.y + mx2 * ac.z, d[13] + my0 * ac.x + my1 * ac.y + my2 * ac.z, d[14] + mz0 * ac.x + mz1 * ac.y + mz2 * ac.z);
    this.halfExtents.set(Math.abs(mx0) * ar.x + Math.abs(mx1) * ar.y + Math.abs(mx2) * ar.z, Math.abs(my0) * ar.x + Math.abs(my1) * ar.y + Math.abs(my2) * ar.z, Math.abs(mz0) * ar.x + Math.abs(mz1) * ar.y + Math.abs(mz2) * ar.z);
  }

  /**
   * Compute the min and max bounding values to encapsulate all specified vertices.
   *
   * @param {number[]|Float32Array} vertices - The vertices used to compute the new size for the
   * AABB.
   * @param {Vec3} min - Stored computed min value.
   * @param {Vec3} max - Stored computed max value.
   * @param {number} [numVerts] - Number of vertices to use from the beginning of vertices array.
   * All vertices are used if not specified.
   */
  static computeMinMax(vertices, min, max, numVerts = vertices.length / 3) {
    if (numVerts > 0) {
      let minx = vertices[0];
      let miny = vertices[1];
      let minz = vertices[2];
      let maxx = minx;
      let maxy = miny;
      let maxz = minz;
      const n = numVerts * 3;
      for (let i = 3; i < n; i += 3) {
        const x = vertices[i];
        const y = vertices[i + 1];
        const z = vertices[i + 2];
        if (x < minx) minx = x;
        if (y < miny) miny = y;
        if (z < minz) minz = z;
        if (x > maxx) maxx = x;
        if (y > maxy) maxy = y;
        if (z > maxz) maxz = z;
      }
      min.set(minx, miny, minz);
      max.set(maxx, maxy, maxz);
    }
  }

  /**
   * Compute the size of the AABB to encapsulate all specified vertices.
   *
   * @param {number[]|Float32Array} vertices - The vertices used to compute the new size for the
   * AABB.
   * @param {number} [numVerts] - Number of vertices to use from the beginning of vertices array.
   * All vertices are used if not specified.
   */
  compute(vertices, numVerts) {
    BoundingBox.computeMinMax(vertices, tmpVecA, tmpVecB, numVerts);
    this.setMinMax(tmpVecA, tmpVecB);
  }

  /**
   * Test if a Bounding Sphere is overlapping, enveloping, or inside this AABB.
   *
   * @param {import('./bounding-sphere.js').BoundingSphere} sphere - Bounding Sphere to test.
   * @returns {boolean} True if the Bounding Sphere is overlapping, enveloping, or inside the
   * AABB and false otherwise.
   */
  intersectsBoundingSphere(sphere) {
    const sq = this._distanceToBoundingSphereSq(sphere);
    if (sq <= sphere.radius * sphere.radius) {
      return true;
    }
    return false;
  }
  _distanceToBoundingSphereSq(sphere) {
    const boxMin = this.getMin();
    const boxMax = this.getMax();
    let sq = 0;
    const axis = ['x', 'y', 'z'];
    for (let i = 0; i < 3; ++i) {
      let out = 0;
      const pn = sphere.center[axis[i]];
      const bMin = boxMin[axis[i]];
      const bMax = boxMax[axis[i]];
      let val = 0;
      if (pn < bMin) {
        val = bMin - pn;
        out += val * val;
      }
      if (pn > bMax) {
        val = pn - bMax;
        out += val * val;
      }
      sq += out;
    }
    return sq;
  }
  _expand(expandMin, expandMax) {
    tmpVecA.add2(this.getMin(), expandMin);
    tmpVecB.add2(this.getMax(), expandMax);
    this.setMinMax(tmpVecA, tmpVecB);
  }
}

export { BoundingBox };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYm91bmRpbmctYm94LmpzIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvY29yZS9zaGFwZS9ib3VuZGluZy1ib3guanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgRGVidWcgfSBmcm9tICcuLi9kZWJ1Zy5qcyc7XG5pbXBvcnQgeyBWZWMzIH0gZnJvbSAnLi4vbWF0aC92ZWMzLmpzJztcblxuY29uc3QgdG1wVmVjQSA9IG5ldyBWZWMzKCk7XG5jb25zdCB0bXBWZWNCID0gbmV3IFZlYzMoKTtcbmNvbnN0IHRtcFZlY0MgPSBuZXcgVmVjMygpO1xuY29uc3QgdG1wVmVjRCA9IG5ldyBWZWMzKCk7XG5jb25zdCB0bXBWZWNFID0gbmV3IFZlYzMoKTtcblxuLyoqXG4gKiBBeGlzLUFsaWduZWQgQm91bmRpbmcgQm94LlxuICpcbiAqIEBjYXRlZ29yeSBNYXRoXG4gKi9cbmNsYXNzIEJvdW5kaW5nQm94IHtcbiAgICAvKipcbiAgICAgKiBDZW50ZXIgb2YgYm94LlxuICAgICAqXG4gICAgICogQHR5cGUge1ZlYzN9XG4gICAgICovXG4gICAgY2VudGVyO1xuXG4gICAgLyoqXG4gICAgICogSGFsZiB0aGUgZGlzdGFuY2UgYWNyb3NzIHRoZSBib3ggaW4gZWFjaCBheGlzLlxuICAgICAqXG4gICAgICogQHR5cGUge1ZlYzN9XG4gICAgICovXG4gICAgaGFsZkV4dGVudHM7XG5cbiAgICAvKipcbiAgICAgKiBAdHlwZSB7VmVjM31cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9taW4gPSBuZXcgVmVjMygpO1xuXG4gICAgLyoqXG4gICAgICogQHR5cGUge1ZlYzN9XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfbWF4ID0gbmV3IFZlYzMoKTtcblxuICAgIC8qKlxuICAgICAqIENyZWF0ZSBhIG5ldyBCb3VuZGluZ0JveCBpbnN0YW5jZS4gVGhlIGJvdW5kaW5nIGJveCBpcyBheGlzLWFsaWduZWQuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1ZlYzN9IFtjZW50ZXJdIC0gQ2VudGVyIG9mIGJveC4gVGhlIGNvbnN0cnVjdG9yIHRha2VzIGEgcmVmZXJlbmNlIG9mIHRoaXMgcGFyYW1ldGVyLlxuICAgICAqIEBwYXJhbSB7VmVjM30gW2hhbGZFeHRlbnRzXSAtIEhhbGYgdGhlIGRpc3RhbmNlIGFjcm9zcyB0aGUgYm94IGluIGVhY2ggYXhpcy4gVGhlIGNvbnN0cnVjdG9yXG4gICAgICogdGFrZXMgYSByZWZlcmVuY2Ugb2YgdGhpcyBwYXJhbWV0ZXIuIERlZmF1bHRzIHRvIDAuNSBvbiBlYWNoIGF4aXMuXG4gICAgICovXG4gICAgY29uc3RydWN0b3IoY2VudGVyID0gbmV3IFZlYzMoKSwgaGFsZkV4dGVudHMgPSBuZXcgVmVjMygwLjUsIDAuNSwgMC41KSkge1xuICAgICAgICBEZWJ1Zy5hc3NlcnQoIU9iamVjdC5pc0Zyb3plbihjZW50ZXIpLCAnVGhlIGNvbnN0cnVjdG9yIG9mIFxcJ0JvdW5kaW5nQm94XFwnIGRvZXMgbm90IGFjY2VwdCBhIGNvbnN0YW50IChmcm96ZW4pIG9iamVjdCBhcyBhIFxcJ2NlbnRlclxcJyBwYXJhbWV0ZXInKTtcbiAgICAgICAgRGVidWcuYXNzZXJ0KCFPYmplY3QuaXNGcm96ZW4oaGFsZkV4dGVudHMpLCAnVGhlIGNvbnN0cnVjdG9yIG9mIFxcJ0JvdW5kaW5nQm94XFwnIGRvZXMgbm90IGFjY2VwdCBhIGNvbnN0YW50IChmcm96ZW4pIG9iamVjdCBhcyBhIFxcJ2hhbGZFeHRlbnRzXFwnIHBhcmFtZXRlcicpO1xuXG4gICAgICAgIHRoaXMuY2VudGVyID0gY2VudGVyO1xuICAgICAgICB0aGlzLmhhbGZFeHRlbnRzID0gaGFsZkV4dGVudHM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ29tYmluZXMgdHdvIGJvdW5kaW5nIGJveGVzIGludG8gb25lLCBlbmNsb3NpbmcgYm90aC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7Qm91bmRpbmdCb3h9IG90aGVyIC0gQm91bmRpbmcgYm94IHRvIGFkZC5cbiAgICAgKi9cbiAgICBhZGQob3RoZXIpIHtcbiAgICAgICAgY29uc3QgdGMgPSB0aGlzLmNlbnRlcjtcbiAgICAgICAgY29uc3QgdGN4ID0gdGMueDtcbiAgICAgICAgY29uc3QgdGN5ID0gdGMueTtcbiAgICAgICAgY29uc3QgdGN6ID0gdGMuejtcbiAgICAgICAgY29uc3QgdGggPSB0aGlzLmhhbGZFeHRlbnRzO1xuICAgICAgICBjb25zdCB0aHggPSB0aC54O1xuICAgICAgICBjb25zdCB0aHkgPSB0aC55O1xuICAgICAgICBjb25zdCB0aHogPSB0aC56O1xuICAgICAgICBsZXQgdG1pbnggPSB0Y3ggLSB0aHg7XG4gICAgICAgIGxldCB0bWF4eCA9IHRjeCArIHRoeDtcbiAgICAgICAgbGV0IHRtaW55ID0gdGN5IC0gdGh5O1xuICAgICAgICBsZXQgdG1heHkgPSB0Y3kgKyB0aHk7XG4gICAgICAgIGxldCB0bWlueiA9IHRjeiAtIHRoejtcbiAgICAgICAgbGV0IHRtYXh6ID0gdGN6ICsgdGh6O1xuXG4gICAgICAgIGNvbnN0IG9jID0gb3RoZXIuY2VudGVyO1xuICAgICAgICBjb25zdCBvY3ggPSBvYy54O1xuICAgICAgICBjb25zdCBvY3kgPSBvYy55O1xuICAgICAgICBjb25zdCBvY3ogPSBvYy56O1xuICAgICAgICBjb25zdCBvaCA9IG90aGVyLmhhbGZFeHRlbnRzO1xuICAgICAgICBjb25zdCBvaHggPSBvaC54O1xuICAgICAgICBjb25zdCBvaHkgPSBvaC55O1xuICAgICAgICBjb25zdCBvaHogPSBvaC56O1xuICAgICAgICBjb25zdCBvbWlueCA9IG9jeCAtIG9oeDtcbiAgICAgICAgY29uc3Qgb21heHggPSBvY3ggKyBvaHg7XG4gICAgICAgIGNvbnN0IG9taW55ID0gb2N5IC0gb2h5O1xuICAgICAgICBjb25zdCBvbWF4eSA9IG9jeSArIG9oeTtcbiAgICAgICAgY29uc3Qgb21pbnogPSBvY3ogLSBvaHo7XG4gICAgICAgIGNvbnN0IG9tYXh6ID0gb2N6ICsgb2h6O1xuXG4gICAgICAgIGlmIChvbWlueCA8IHRtaW54KSB0bWlueCA9IG9taW54O1xuICAgICAgICBpZiAob21heHggPiB0bWF4eCkgdG1heHggPSBvbWF4eDtcbiAgICAgICAgaWYgKG9taW55IDwgdG1pbnkpIHRtaW55ID0gb21pbnk7XG4gICAgICAgIGlmIChvbWF4eSA+IHRtYXh5KSB0bWF4eSA9IG9tYXh5O1xuICAgICAgICBpZiAob21pbnogPCB0bWlueikgdG1pbnogPSBvbWluejtcbiAgICAgICAgaWYgKG9tYXh6ID4gdG1heHopIHRtYXh6ID0gb21heHo7XG5cbiAgICAgICAgdGMueCA9ICh0bWlueCArIHRtYXh4KSAqIDAuNTtcbiAgICAgICAgdGMueSA9ICh0bWlueSArIHRtYXh5KSAqIDAuNTtcbiAgICAgICAgdGMueiA9ICh0bWlueiArIHRtYXh6KSAqIDAuNTtcbiAgICAgICAgdGgueCA9ICh0bWF4eCAtIHRtaW54KSAqIDAuNTtcbiAgICAgICAgdGgueSA9ICh0bWF4eSAtIHRtaW55KSAqIDAuNTtcbiAgICAgICAgdGgueiA9ICh0bWF4eiAtIHRtaW56KSAqIDAuNTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDb3BpZXMgdGhlIGNvbnRlbnRzIG9mIGEgc291cmNlIEFBQkIuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge0JvdW5kaW5nQm94fSBzcmMgLSBUaGUgQUFCQiB0byBjb3B5IGZyb20uXG4gICAgICovXG4gICAgY29weShzcmMpIHtcbiAgICAgICAgdGhpcy5jZW50ZXIuY29weShzcmMuY2VudGVyKTtcbiAgICAgICAgdGhpcy5oYWxmRXh0ZW50cy5jb3B5KHNyYy5oYWxmRXh0ZW50cyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBhIGNsb25lIG9mIHRoZSBBQUJCLlxuICAgICAqXG4gICAgICogQHJldHVybnMge0JvdW5kaW5nQm94fSBBIGR1cGxpY2F0ZSBBQUJCLlxuICAgICAqL1xuICAgIGNsb25lKCkge1xuICAgICAgICByZXR1cm4gbmV3IEJvdW5kaW5nQm94KHRoaXMuY2VudGVyLmNsb25lKCksIHRoaXMuaGFsZkV4dGVudHMuY2xvbmUoKSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVGVzdCB3aGV0aGVyIHR3byBheGlzLWFsaWduZWQgYm91bmRpbmcgYm94ZXMgaW50ZXJzZWN0LlxuICAgICAqXG4gICAgICogQHBhcmFtIHtCb3VuZGluZ0JveH0gb3RoZXIgLSBCb3VuZGluZyBib3ggdG8gdGVzdCBhZ2FpbnN0LlxuICAgICAqIEByZXR1cm5zIHtib29sZWFufSBUcnVlIGlmIHRoZXJlIGlzIGFuIGludGVyc2VjdGlvbi5cbiAgICAgKi9cbiAgICBpbnRlcnNlY3RzKG90aGVyKSB7XG4gICAgICAgIGNvbnN0IGFNYXggPSB0aGlzLmdldE1heCgpO1xuICAgICAgICBjb25zdCBhTWluID0gdGhpcy5nZXRNaW4oKTtcbiAgICAgICAgY29uc3QgYk1heCA9IG90aGVyLmdldE1heCgpO1xuICAgICAgICBjb25zdCBiTWluID0gb3RoZXIuZ2V0TWluKCk7XG5cbiAgICAgICAgcmV0dXJuIChhTWluLnggPD0gYk1heC54KSAmJiAoYU1heC54ID49IGJNaW4ueCkgJiZcbiAgICAgICAgICAgICAgIChhTWluLnkgPD0gYk1heC55KSAmJiAoYU1heC55ID49IGJNaW4ueSkgJiZcbiAgICAgICAgICAgICAgIChhTWluLnogPD0gYk1heC56KSAmJiAoYU1heC56ID49IGJNaW4ueik7XG4gICAgfVxuXG4gICAgX2ludGVyc2VjdHNSYXkocmF5LCBwb2ludCkge1xuICAgICAgICBjb25zdCB0TWluID0gdG1wVmVjQS5jb3B5KHRoaXMuZ2V0TWluKCkpLnN1YihyYXkub3JpZ2luKTtcbiAgICAgICAgY29uc3QgdE1heCA9IHRtcFZlY0IuY29weSh0aGlzLmdldE1heCgpKS5zdWIocmF5Lm9yaWdpbik7XG4gICAgICAgIGNvbnN0IGRpciA9IHJheS5kaXJlY3Rpb247XG5cbiAgICAgICAgLy8gRW5zdXJlIHRoYXQgd2UgYXJlIG5vdCBkaXZpZGluZyBpdCBieSB6ZXJvXG4gICAgICAgIGlmIChkaXIueCA9PT0gMCkge1xuICAgICAgICAgICAgdE1pbi54ID0gdE1pbi54IDwgMCA/IC1OdW1iZXIuTUFYX1ZBTFVFIDogTnVtYmVyLk1BWF9WQUxVRTtcbiAgICAgICAgICAgIHRNYXgueCA9IHRNYXgueCA8IDAgPyAtTnVtYmVyLk1BWF9WQUxVRSA6IE51bWJlci5NQVhfVkFMVUU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0TWluLnggLz0gZGlyLng7XG4gICAgICAgICAgICB0TWF4LnggLz0gZGlyLng7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGRpci55ID09PSAwKSB7XG4gICAgICAgICAgICB0TWluLnkgPSB0TWluLnkgPCAwID8gLU51bWJlci5NQVhfVkFMVUUgOiBOdW1iZXIuTUFYX1ZBTFVFO1xuICAgICAgICAgICAgdE1heC55ID0gdE1heC55IDwgMCA/IC1OdW1iZXIuTUFYX1ZBTFVFIDogTnVtYmVyLk1BWF9WQUxVRTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRNaW4ueSAvPSBkaXIueTtcbiAgICAgICAgICAgIHRNYXgueSAvPSBkaXIueTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoZGlyLnogPT09IDApIHtcbiAgICAgICAgICAgIHRNaW4ueiA9IHRNaW4ueiA8IDAgPyAtTnVtYmVyLk1BWF9WQUxVRSA6IE51bWJlci5NQVhfVkFMVUU7XG4gICAgICAgICAgICB0TWF4LnogPSB0TWF4LnogPCAwID8gLU51bWJlci5NQVhfVkFMVUUgOiBOdW1iZXIuTUFYX1ZBTFVFO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdE1pbi56IC89IGRpci56O1xuICAgICAgICAgICAgdE1heC56IC89IGRpci56O1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgcmVhbE1pbiA9IHRtcFZlY0Muc2V0KE1hdGgubWluKHRNaW4ueCwgdE1heC54KSwgTWF0aC5taW4odE1pbi55LCB0TWF4LnkpLCBNYXRoLm1pbih0TWluLnosIHRNYXgueikpO1xuICAgICAgICBjb25zdCByZWFsTWF4ID0gdG1wVmVjRC5zZXQoTWF0aC5tYXgodE1pbi54LCB0TWF4LngpLCBNYXRoLm1heCh0TWluLnksIHRNYXgueSksIE1hdGgubWF4KHRNaW4ueiwgdE1heC56KSk7XG5cbiAgICAgICAgY29uc3QgbWluTWF4ID0gTWF0aC5taW4oTWF0aC5taW4ocmVhbE1heC54LCByZWFsTWF4LnkpLCByZWFsTWF4LnopO1xuICAgICAgICBjb25zdCBtYXhNaW4gPSBNYXRoLm1heChNYXRoLm1heChyZWFsTWluLngsIHJlYWxNaW4ueSksIHJlYWxNaW4ueik7XG5cbiAgICAgICAgY29uc3QgaW50ZXJzZWN0cyA9IG1pbk1heCA+PSBtYXhNaW4gJiYgbWF4TWluID49IDA7XG5cbiAgICAgICAgaWYgKGludGVyc2VjdHMpXG4gICAgICAgICAgICBwb2ludC5jb3B5KHJheS5kaXJlY3Rpb24pLm11bFNjYWxhcihtYXhNaW4pLmFkZChyYXkub3JpZ2luKTtcblxuICAgICAgICByZXR1cm4gaW50ZXJzZWN0cztcbiAgICB9XG5cbiAgICBfZmFzdEludGVyc2VjdHNSYXkocmF5KSB7XG4gICAgICAgIGNvbnN0IGRpZmYgPSB0bXBWZWNBO1xuICAgICAgICBjb25zdCBjcm9zcyA9IHRtcFZlY0I7XG4gICAgICAgIGNvbnN0IHByb2QgPSB0bXBWZWNDO1xuICAgICAgICBjb25zdCBhYnNEaWZmID0gdG1wVmVjRDtcbiAgICAgICAgY29uc3QgYWJzRGlyID0gdG1wVmVjRTtcbiAgICAgICAgY29uc3QgcmF5RGlyID0gcmF5LmRpcmVjdGlvbjtcblxuICAgICAgICBkaWZmLnN1YjIocmF5Lm9yaWdpbiwgdGhpcy5jZW50ZXIpO1xuICAgICAgICBhYnNEaWZmLnNldChNYXRoLmFicyhkaWZmLngpLCBNYXRoLmFicyhkaWZmLnkpLCBNYXRoLmFicyhkaWZmLnopKTtcblxuICAgICAgICBwcm9kLm11bDIoZGlmZiwgcmF5RGlyKTtcblxuICAgICAgICBpZiAoYWJzRGlmZi54ID4gdGhpcy5oYWxmRXh0ZW50cy54ICYmIHByb2QueCA+PSAwKVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuXG4gICAgICAgIGlmIChhYnNEaWZmLnkgPiB0aGlzLmhhbGZFeHRlbnRzLnkgJiYgcHJvZC55ID49IDApXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG5cbiAgICAgICAgaWYgKGFic0RpZmYueiA+IHRoaXMuaGFsZkV4dGVudHMueiAmJiBwcm9kLnogPj0gMClcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcblxuICAgICAgICBhYnNEaXIuc2V0KE1hdGguYWJzKHJheURpci54KSwgTWF0aC5hYnMocmF5RGlyLnkpLCBNYXRoLmFicyhyYXlEaXIueikpO1xuICAgICAgICBjcm9zcy5jcm9zcyhyYXlEaXIsIGRpZmYpO1xuICAgICAgICBjcm9zcy5zZXQoTWF0aC5hYnMoY3Jvc3MueCksIE1hdGguYWJzKGNyb3NzLnkpLCBNYXRoLmFicyhjcm9zcy56KSk7XG5cbiAgICAgICAgaWYgKGNyb3NzLnggPiB0aGlzLmhhbGZFeHRlbnRzLnkgKiBhYnNEaXIueiArIHRoaXMuaGFsZkV4dGVudHMueiAqIGFic0Rpci55KVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuXG4gICAgICAgIGlmIChjcm9zcy55ID4gdGhpcy5oYWxmRXh0ZW50cy54ICogYWJzRGlyLnogKyB0aGlzLmhhbGZFeHRlbnRzLnogKiBhYnNEaXIueClcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcblxuICAgICAgICBpZiAoY3Jvc3MueiA+IHRoaXMuaGFsZkV4dGVudHMueCAqIGFic0Rpci55ICsgdGhpcy5oYWxmRXh0ZW50cy55ICogYWJzRGlyLngpXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG5cbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVGVzdCBpZiBhIHJheSBpbnRlcnNlY3RzIHdpdGggdGhlIEFBQkIuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi9yYXkuanMnKS5SYXl9IHJheSAtIFJheSB0byB0ZXN0IGFnYWluc3QgKGRpcmVjdGlvbiBtdXN0IGJlIG5vcm1hbGl6ZWQpLlxuICAgICAqIEBwYXJhbSB7VmVjM30gW3BvaW50XSAtIElmIHRoZXJlIGlzIGFuIGludGVyc2VjdGlvbiwgdGhlIGludGVyc2VjdGlvbiBwb2ludCB3aWxsIGJlIGNvcGllZFxuICAgICAqIGludG8gaGVyZS5cbiAgICAgKiBAcmV0dXJucyB7Ym9vbGVhbn0gVHJ1ZSBpZiB0aGVyZSBpcyBhbiBpbnRlcnNlY3Rpb24uXG4gICAgICovXG4gICAgaW50ZXJzZWN0c1JheShyYXksIHBvaW50KSB7XG4gICAgICAgIGlmIChwb2ludCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2ludGVyc2VjdHNSYXkocmF5LCBwb2ludCk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdGhpcy5fZmFzdEludGVyc2VjdHNSYXkocmF5KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHRoZSBtaW5pbXVtIGFuZCBtYXhpbXVtIGNvcm5lciBvZiB0aGUgQUFCQi4gVXNpbmcgdGhpcyBmdW5jdGlvbiBpcyBmYXN0ZXIgdGhhblxuICAgICAqIGFzc2lnbmluZyBtaW4gYW5kIG1heCBzZXBhcmF0ZWx5LlxuICAgICAqXG4gICAgICogQHBhcmFtIHtWZWMzfSBtaW4gLSBUaGUgbWluaW11bSBjb3JuZXIgb2YgdGhlIEFBQkIuXG4gICAgICogQHBhcmFtIHtWZWMzfSBtYXggLSBUaGUgbWF4aW11bSBjb3JuZXIgb2YgdGhlIEFBQkIuXG4gICAgICovXG4gICAgc2V0TWluTWF4KG1pbiwgbWF4KSB7XG4gICAgICAgIHRoaXMuY2VudGVyLmFkZDIobWF4LCBtaW4pLm11bFNjYWxhcigwLjUpO1xuICAgICAgICB0aGlzLmhhbGZFeHRlbnRzLnN1YjIobWF4LCBtaW4pLm11bFNjYWxhcigwLjUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybiB0aGUgbWluaW11bSBjb3JuZXIgb2YgdGhlIEFBQkIuXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7VmVjM30gTWluaW11bSBjb3JuZXIuXG4gICAgICovXG4gICAgZ2V0TWluKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fbWluLmNvcHkodGhpcy5jZW50ZXIpLnN1Yih0aGlzLmhhbGZFeHRlbnRzKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm4gdGhlIG1heGltdW0gY29ybmVyIG9mIHRoZSBBQUJCLlxuICAgICAqXG4gICAgICogQHJldHVybnMge1ZlYzN9IE1heGltdW0gY29ybmVyLlxuICAgICAqL1xuICAgIGdldE1heCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX21heC5jb3B5KHRoaXMuY2VudGVyKS5hZGQodGhpcy5oYWxmRXh0ZW50cyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVGVzdCBpZiBhIHBvaW50IGlzIGluc2lkZSBhIEFBQkIuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1ZlYzN9IHBvaW50IC0gUG9pbnQgdG8gdGVzdC5cbiAgICAgKiBAcmV0dXJucyB7Ym9vbGVhbn0gVHJ1ZSBpZiB0aGUgcG9pbnQgaXMgaW5zaWRlIHRoZSBBQUJCIGFuZCBmYWxzZSBvdGhlcndpc2UuXG4gICAgICovXG4gICAgY29udGFpbnNQb2ludChwb2ludCkge1xuICAgICAgICBjb25zdCBtaW4gPSB0aGlzLmdldE1pbigpO1xuICAgICAgICBjb25zdCBtYXggPSB0aGlzLmdldE1heCgpO1xuXG4gICAgICAgIGlmIChwb2ludC54IDwgbWluLnggfHwgcG9pbnQueCA+IG1heC54IHx8XG4gICAgICAgICAgICBwb2ludC55IDwgbWluLnkgfHwgcG9pbnQueSA+IG1heC55IHx8XG4gICAgICAgICAgICBwb2ludC56IDwgbWluLnogfHwgcG9pbnQueiA+IG1heC56KSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXQgYW4gQUFCQiB0byBlbmNsb3NlIHRoZSBzcGVjaWZpZWQgQUFCQiBpZiBpdCB3ZXJlIHRvIGJlIHRyYW5zZm9ybWVkIGJ5IHRoZSBzcGVjaWZpZWQgNHg0XG4gICAgICogbWF0cml4LlxuICAgICAqXG4gICAgICogQHBhcmFtIHtCb3VuZGluZ0JveH0gYWFiYiAtIEJveCB0byB0cmFuc2Zvcm0gYW5kIGVuY2xvc2UuXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4uL21hdGgvbWF0NC5qcycpLk1hdDR9IG0gLSBUcmFuc2Zvcm1hdGlvbiBtYXRyaXggdG8gYXBwbHkgdG8gc291cmNlIEFBQkIuXG4gICAgICogQHBhcmFtIHtib29sZWFufSBpZ25vcmVTY2FsZSAtIElmIHRydWUgaXMgc3BlY2lmaWVkLCBhIHNjYWxlIGZyb20gdGhlIG1hdHJpeCBpcyBpZ25vcmVkLiBEZWZhdWx0cyB0byBmYWxzZS5cbiAgICAgKi9cbiAgICBzZXRGcm9tVHJhbnNmb3JtZWRBYWJiKGFhYmIsIG0sIGlnbm9yZVNjYWxlID0gZmFsc2UpIHtcbiAgICAgICAgY29uc3QgYWMgPSBhYWJiLmNlbnRlcjtcbiAgICAgICAgY29uc3QgYXIgPSBhYWJiLmhhbGZFeHRlbnRzO1xuXG4gICAgICAgIGNvbnN0IGQgPSBtLmRhdGE7XG4gICAgICAgIGxldCBteDAgPSBkWzBdO1xuICAgICAgICBsZXQgbXgxID0gZFs0XTtcbiAgICAgICAgbGV0IG14MiA9IGRbOF07XG4gICAgICAgIGxldCBteTAgPSBkWzFdO1xuICAgICAgICBsZXQgbXkxID0gZFs1XTtcbiAgICAgICAgbGV0IG15MiA9IGRbOV07XG4gICAgICAgIGxldCBtejAgPSBkWzJdO1xuICAgICAgICBsZXQgbXoxID0gZFs2XTtcbiAgICAgICAgbGV0IG16MiA9IGRbMTBdO1xuXG4gICAgICAgIC8vIHJlbm9ybWFsaXplIGF4aXMgaWYgc2NhbGUgaXMgdG8gYmUgaWdub3JlZFxuICAgICAgICBpZiAoaWdub3JlU2NhbGUpIHtcbiAgICAgICAgICAgIGxldCBsZW5ndGhTcSA9IG14MCAqIG14MCArIG14MSAqIG14MSArIG14MiAqIG14MjtcbiAgICAgICAgICAgIGlmIChsZW5ndGhTcSA+IDApIHtcbiAgICAgICAgICAgICAgICBjb25zdCBpbnZMZW5ndGggPSAxIC8gTWF0aC5zcXJ0KGxlbmd0aFNxKTtcbiAgICAgICAgICAgICAgICBteDAgKj0gaW52TGVuZ3RoO1xuICAgICAgICAgICAgICAgIG14MSAqPSBpbnZMZW5ndGg7XG4gICAgICAgICAgICAgICAgbXgyICo9IGludkxlbmd0aDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgbGVuZ3RoU3EgPSBteTAgKiBteTAgKyBteTEgKiBteTEgKyBteTIgKiBteTI7XG4gICAgICAgICAgICBpZiAobGVuZ3RoU3EgPiAwKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgaW52TGVuZ3RoID0gMSAvIE1hdGguc3FydChsZW5ndGhTcSk7XG4gICAgICAgICAgICAgICAgbXkwICo9IGludkxlbmd0aDtcbiAgICAgICAgICAgICAgICBteTEgKj0gaW52TGVuZ3RoO1xuICAgICAgICAgICAgICAgIG15MiAqPSBpbnZMZW5ndGg7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGxlbmd0aFNxID0gbXowICogbXowICsgbXoxICogbXoxICsgbXoyICogbXoyO1xuICAgICAgICAgICAgaWYgKGxlbmd0aFNxID4gMCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGludkxlbmd0aCA9IDEgLyBNYXRoLnNxcnQobGVuZ3RoU3EpO1xuICAgICAgICAgICAgICAgIG16MCAqPSBpbnZMZW5ndGg7XG4gICAgICAgICAgICAgICAgbXoxICo9IGludkxlbmd0aDtcbiAgICAgICAgICAgICAgICBtejIgKj0gaW52TGVuZ3RoO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5jZW50ZXIuc2V0KFxuICAgICAgICAgICAgZFsxMl0gKyBteDAgKiBhYy54ICsgbXgxICogYWMueSArIG14MiAqIGFjLnosXG4gICAgICAgICAgICBkWzEzXSArIG15MCAqIGFjLnggKyBteTEgKiBhYy55ICsgbXkyICogYWMueixcbiAgICAgICAgICAgIGRbMTRdICsgbXowICogYWMueCArIG16MSAqIGFjLnkgKyBtejIgKiBhYy56XG4gICAgICAgICk7XG5cbiAgICAgICAgdGhpcy5oYWxmRXh0ZW50cy5zZXQoXG4gICAgICAgICAgICBNYXRoLmFicyhteDApICogYXIueCArIE1hdGguYWJzKG14MSkgKiBhci55ICsgTWF0aC5hYnMobXgyKSAqIGFyLnosXG4gICAgICAgICAgICBNYXRoLmFicyhteTApICogYXIueCArIE1hdGguYWJzKG15MSkgKiBhci55ICsgTWF0aC5hYnMobXkyKSAqIGFyLnosXG4gICAgICAgICAgICBNYXRoLmFicyhtejApICogYXIueCArIE1hdGguYWJzKG16MSkgKiBhci55ICsgTWF0aC5hYnMobXoyKSAqIGFyLnpcbiAgICAgICAgKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDb21wdXRlIHRoZSBtaW4gYW5kIG1heCBib3VuZGluZyB2YWx1ZXMgdG8gZW5jYXBzdWxhdGUgYWxsIHNwZWNpZmllZCB2ZXJ0aWNlcy5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7bnVtYmVyW118RmxvYXQzMkFycmF5fSB2ZXJ0aWNlcyAtIFRoZSB2ZXJ0aWNlcyB1c2VkIHRvIGNvbXB1dGUgdGhlIG5ldyBzaXplIGZvciB0aGVcbiAgICAgKiBBQUJCLlxuICAgICAqIEBwYXJhbSB7VmVjM30gbWluIC0gU3RvcmVkIGNvbXB1dGVkIG1pbiB2YWx1ZS5cbiAgICAgKiBAcGFyYW0ge1ZlYzN9IG1heCAtIFN0b3JlZCBjb21wdXRlZCBtYXggdmFsdWUuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFtudW1WZXJ0c10gLSBOdW1iZXIgb2YgdmVydGljZXMgdG8gdXNlIGZyb20gdGhlIGJlZ2lubmluZyBvZiB2ZXJ0aWNlcyBhcnJheS5cbiAgICAgKiBBbGwgdmVydGljZXMgYXJlIHVzZWQgaWYgbm90IHNwZWNpZmllZC5cbiAgICAgKi9cbiAgICBzdGF0aWMgY29tcHV0ZU1pbk1heCh2ZXJ0aWNlcywgbWluLCBtYXgsIG51bVZlcnRzID0gdmVydGljZXMubGVuZ3RoIC8gMykge1xuICAgICAgICBpZiAobnVtVmVydHMgPiAwKSB7XG4gICAgICAgICAgICBsZXQgbWlueCA9IHZlcnRpY2VzWzBdO1xuICAgICAgICAgICAgbGV0IG1pbnkgPSB2ZXJ0aWNlc1sxXTtcbiAgICAgICAgICAgIGxldCBtaW56ID0gdmVydGljZXNbMl07XG4gICAgICAgICAgICBsZXQgbWF4eCA9IG1pbng7XG4gICAgICAgICAgICBsZXQgbWF4eSA9IG1pbnk7XG4gICAgICAgICAgICBsZXQgbWF4eiA9IG1pbno7XG4gICAgICAgICAgICBjb25zdCBuID0gbnVtVmVydHMgKiAzO1xuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDM7IGkgPCBuOyBpICs9IDMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB4ID0gdmVydGljZXNbaV07XG4gICAgICAgICAgICAgICAgY29uc3QgeSA9IHZlcnRpY2VzW2kgKyAxXTtcbiAgICAgICAgICAgICAgICBjb25zdCB6ID0gdmVydGljZXNbaSArIDJdO1xuICAgICAgICAgICAgICAgIGlmICh4IDwgbWlueCkgbWlueCA9IHg7XG4gICAgICAgICAgICAgICAgaWYgKHkgPCBtaW55KSBtaW55ID0geTtcbiAgICAgICAgICAgICAgICBpZiAoeiA8IG1pbnopIG1pbnogPSB6O1xuICAgICAgICAgICAgICAgIGlmICh4ID4gbWF4eCkgbWF4eCA9IHg7XG4gICAgICAgICAgICAgICAgaWYgKHkgPiBtYXh5KSBtYXh5ID0geTtcbiAgICAgICAgICAgICAgICBpZiAoeiA+IG1heHopIG1heHogPSB6O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbWluLnNldChtaW54LCBtaW55LCBtaW56KTtcbiAgICAgICAgICAgIG1heC5zZXQobWF4eCwgbWF4eSwgbWF4eik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDb21wdXRlIHRoZSBzaXplIG9mIHRoZSBBQUJCIHRvIGVuY2Fwc3VsYXRlIGFsbCBzcGVjaWZpZWQgdmVydGljZXMuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge251bWJlcltdfEZsb2F0MzJBcnJheX0gdmVydGljZXMgLSBUaGUgdmVydGljZXMgdXNlZCB0byBjb21wdXRlIHRoZSBuZXcgc2l6ZSBmb3IgdGhlXG4gICAgICogQUFCQi5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gW251bVZlcnRzXSAtIE51bWJlciBvZiB2ZXJ0aWNlcyB0byB1c2UgZnJvbSB0aGUgYmVnaW5uaW5nIG9mIHZlcnRpY2VzIGFycmF5LlxuICAgICAqIEFsbCB2ZXJ0aWNlcyBhcmUgdXNlZCBpZiBub3Qgc3BlY2lmaWVkLlxuICAgICAqL1xuICAgIGNvbXB1dGUodmVydGljZXMsIG51bVZlcnRzKSB7XG4gICAgICAgIEJvdW5kaW5nQm94LmNvbXB1dGVNaW5NYXgodmVydGljZXMsIHRtcFZlY0EsIHRtcFZlY0IsIG51bVZlcnRzKTtcbiAgICAgICAgdGhpcy5zZXRNaW5NYXgodG1wVmVjQSwgdG1wVmVjQik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVGVzdCBpZiBhIEJvdW5kaW5nIFNwaGVyZSBpcyBvdmVybGFwcGluZywgZW52ZWxvcGluZywgb3IgaW5zaWRlIHRoaXMgQUFCQi5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuL2JvdW5kaW5nLXNwaGVyZS5qcycpLkJvdW5kaW5nU3BoZXJlfSBzcGhlcmUgLSBCb3VuZGluZyBTcGhlcmUgdG8gdGVzdC5cbiAgICAgKiBAcmV0dXJucyB7Ym9vbGVhbn0gVHJ1ZSBpZiB0aGUgQm91bmRpbmcgU3BoZXJlIGlzIG92ZXJsYXBwaW5nLCBlbnZlbG9waW5nLCBvciBpbnNpZGUgdGhlXG4gICAgICogQUFCQiBhbmQgZmFsc2Ugb3RoZXJ3aXNlLlxuICAgICAqL1xuICAgIGludGVyc2VjdHNCb3VuZGluZ1NwaGVyZShzcGhlcmUpIHtcbiAgICAgICAgY29uc3Qgc3EgPSB0aGlzLl9kaXN0YW5jZVRvQm91bmRpbmdTcGhlcmVTcShzcGhlcmUpO1xuICAgICAgICBpZiAoc3EgPD0gc3BoZXJlLnJhZGl1cyAqIHNwaGVyZS5yYWRpdXMpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIF9kaXN0YW5jZVRvQm91bmRpbmdTcGhlcmVTcShzcGhlcmUpIHtcbiAgICAgICAgY29uc3QgYm94TWluID0gdGhpcy5nZXRNaW4oKTtcbiAgICAgICAgY29uc3QgYm94TWF4ID0gdGhpcy5nZXRNYXgoKTtcblxuICAgICAgICBsZXQgc3EgPSAwO1xuICAgICAgICBjb25zdCBheGlzID0gWyd4JywgJ3knLCAneiddO1xuXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgMzsgKytpKSB7XG4gICAgICAgICAgICBsZXQgb3V0ID0gMDtcbiAgICAgICAgICAgIGNvbnN0IHBuID0gc3BoZXJlLmNlbnRlcltheGlzW2ldXTtcbiAgICAgICAgICAgIGNvbnN0IGJNaW4gPSBib3hNaW5bYXhpc1tpXV07XG4gICAgICAgICAgICBjb25zdCBiTWF4ID0gYm94TWF4W2F4aXNbaV1dO1xuICAgICAgICAgICAgbGV0IHZhbCA9IDA7XG5cbiAgICAgICAgICAgIGlmIChwbiA8IGJNaW4pIHtcbiAgICAgICAgICAgICAgICB2YWwgPSAoYk1pbiAtIHBuKTtcbiAgICAgICAgICAgICAgICBvdXQgKz0gdmFsICogdmFsO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAocG4gPiBiTWF4KSB7XG4gICAgICAgICAgICAgICAgdmFsID0gKHBuIC0gYk1heCk7XG4gICAgICAgICAgICAgICAgb3V0ICs9IHZhbCAqIHZhbDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgc3EgKz0gb3V0O1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHNxO1xuICAgIH1cblxuICAgIF9leHBhbmQoZXhwYW5kTWluLCBleHBhbmRNYXgpIHtcbiAgICAgICAgdG1wVmVjQS5hZGQyKHRoaXMuZ2V0TWluKCksIGV4cGFuZE1pbik7XG4gICAgICAgIHRtcFZlY0IuYWRkMih0aGlzLmdldE1heCgpLCBleHBhbmRNYXgpO1xuICAgICAgICB0aGlzLnNldE1pbk1heCh0bXBWZWNBLCB0bXBWZWNCKTtcbiAgICB9XG59XG5cbmV4cG9ydCB7IEJvdW5kaW5nQm94IH07XG4iXSwibmFtZXMiOlsidG1wVmVjQSIsIlZlYzMiLCJ0bXBWZWNCIiwidG1wVmVjQyIsInRtcFZlY0QiLCJ0bXBWZWNFIiwiQm91bmRpbmdCb3giLCJjb25zdHJ1Y3RvciIsImNlbnRlciIsImhhbGZFeHRlbnRzIiwiX21pbiIsIl9tYXgiLCJEZWJ1ZyIsImFzc2VydCIsIk9iamVjdCIsImlzRnJvemVuIiwiYWRkIiwib3RoZXIiLCJ0YyIsInRjeCIsIngiLCJ0Y3kiLCJ5IiwidGN6IiwieiIsInRoIiwidGh4IiwidGh5IiwidGh6IiwidG1pbngiLCJ0bWF4eCIsInRtaW55IiwidG1heHkiLCJ0bWlueiIsInRtYXh6Iiwib2MiLCJvY3giLCJvY3kiLCJvY3oiLCJvaCIsIm9oeCIsIm9oeSIsIm9oeiIsIm9taW54Iiwib21heHgiLCJvbWlueSIsIm9tYXh5Iiwib21pbnoiLCJvbWF4eiIsImNvcHkiLCJzcmMiLCJjbG9uZSIsImludGVyc2VjdHMiLCJhTWF4IiwiZ2V0TWF4IiwiYU1pbiIsImdldE1pbiIsImJNYXgiLCJiTWluIiwiX2ludGVyc2VjdHNSYXkiLCJyYXkiLCJwb2ludCIsInRNaW4iLCJzdWIiLCJvcmlnaW4iLCJ0TWF4IiwiZGlyIiwiZGlyZWN0aW9uIiwiTnVtYmVyIiwiTUFYX1ZBTFVFIiwicmVhbE1pbiIsInNldCIsIk1hdGgiLCJtaW4iLCJyZWFsTWF4IiwibWF4IiwibWluTWF4IiwibWF4TWluIiwibXVsU2NhbGFyIiwiX2Zhc3RJbnRlcnNlY3RzUmF5IiwiZGlmZiIsImNyb3NzIiwicHJvZCIsImFic0RpZmYiLCJhYnNEaXIiLCJyYXlEaXIiLCJzdWIyIiwiYWJzIiwibXVsMiIsImludGVyc2VjdHNSYXkiLCJzZXRNaW5NYXgiLCJhZGQyIiwiY29udGFpbnNQb2ludCIsInNldEZyb21UcmFuc2Zvcm1lZEFhYmIiLCJhYWJiIiwibSIsImlnbm9yZVNjYWxlIiwiYWMiLCJhciIsImQiLCJkYXRhIiwibXgwIiwibXgxIiwibXgyIiwibXkwIiwibXkxIiwibXkyIiwibXowIiwibXoxIiwibXoyIiwibGVuZ3RoU3EiLCJpbnZMZW5ndGgiLCJzcXJ0IiwiY29tcHV0ZU1pbk1heCIsInZlcnRpY2VzIiwibnVtVmVydHMiLCJsZW5ndGgiLCJtaW54IiwibWlueSIsIm1pbnoiLCJtYXh4IiwibWF4eSIsIm1heHoiLCJuIiwiaSIsImNvbXB1dGUiLCJpbnRlcnNlY3RzQm91bmRpbmdTcGhlcmUiLCJzcGhlcmUiLCJzcSIsIl9kaXN0YW5jZVRvQm91bmRpbmdTcGhlcmVTcSIsInJhZGl1cyIsImJveE1pbiIsImJveE1heCIsImF4aXMiLCJvdXQiLCJwbiIsInZhbCIsIl9leHBhbmQiLCJleHBhbmRNaW4iLCJleHBhbmRNYXgiXSwibWFwcGluZ3MiOiI7OztBQUdBLE1BQU1BLE9BQU8sR0FBRyxJQUFJQyxJQUFJLEVBQUUsQ0FBQTtBQUMxQixNQUFNQyxPQUFPLEdBQUcsSUFBSUQsSUFBSSxFQUFFLENBQUE7QUFDMUIsTUFBTUUsT0FBTyxHQUFHLElBQUlGLElBQUksRUFBRSxDQUFBO0FBQzFCLE1BQU1HLE9BQU8sR0FBRyxJQUFJSCxJQUFJLEVBQUUsQ0FBQTtBQUMxQixNQUFNSSxPQUFPLEdBQUcsSUFBSUosSUFBSSxFQUFFLENBQUE7O0FBRTFCO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxNQUFNSyxXQUFXLENBQUM7QUEyQmQ7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDSUMsRUFBQUEsV0FBV0EsQ0FBQ0MsTUFBTSxHQUFHLElBQUlQLElBQUksRUFBRSxFQUFFUSxXQUFXLEdBQUcsSUFBSVIsSUFBSSxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLEVBQUU7QUFqQ3hFO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFKSSxJQUFBLElBQUEsQ0FLQU8sTUFBTSxHQUFBLEtBQUEsQ0FBQSxDQUFBO0FBRU47QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUpJLElBQUEsSUFBQSxDQUtBQyxXQUFXLEdBQUEsS0FBQSxDQUFBLENBQUE7QUFFWDtBQUNKO0FBQ0E7QUFDQTtBQUhJLElBQUEsSUFBQSxDQUlBQyxJQUFJLEdBQUcsSUFBSVQsSUFBSSxFQUFFLENBQUE7QUFFakI7QUFDSjtBQUNBO0FBQ0E7QUFISSxJQUFBLElBQUEsQ0FJQVUsSUFBSSxHQUFHLElBQUlWLElBQUksRUFBRSxDQUFBO0FBVWJXLElBQUFBLEtBQUssQ0FBQ0MsTUFBTSxDQUFDLENBQUNDLE1BQU0sQ0FBQ0MsUUFBUSxDQUFDUCxNQUFNLENBQUMsRUFBRSx5R0FBeUcsQ0FBQyxDQUFBO0FBQ2pKSSxJQUFBQSxLQUFLLENBQUNDLE1BQU0sQ0FBQyxDQUFDQyxNQUFNLENBQUNDLFFBQVEsQ0FBQ04sV0FBVyxDQUFDLEVBQUUsOEdBQThHLENBQUMsQ0FBQTtJQUUzSixJQUFJLENBQUNELE1BQU0sR0FBR0EsTUFBTSxDQUFBO0lBQ3BCLElBQUksQ0FBQ0MsV0FBVyxHQUFHQSxXQUFXLENBQUE7QUFDbEMsR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0VBQ0lPLEdBQUdBLENBQUNDLEtBQUssRUFBRTtBQUNQLElBQUEsTUFBTUMsRUFBRSxHQUFHLElBQUksQ0FBQ1YsTUFBTSxDQUFBO0FBQ3RCLElBQUEsTUFBTVcsR0FBRyxHQUFHRCxFQUFFLENBQUNFLENBQUMsQ0FBQTtBQUNoQixJQUFBLE1BQU1DLEdBQUcsR0FBR0gsRUFBRSxDQUFDSSxDQUFDLENBQUE7QUFDaEIsSUFBQSxNQUFNQyxHQUFHLEdBQUdMLEVBQUUsQ0FBQ00sQ0FBQyxDQUFBO0FBQ2hCLElBQUEsTUFBTUMsRUFBRSxHQUFHLElBQUksQ0FBQ2hCLFdBQVcsQ0FBQTtBQUMzQixJQUFBLE1BQU1pQixHQUFHLEdBQUdELEVBQUUsQ0FBQ0wsQ0FBQyxDQUFBO0FBQ2hCLElBQUEsTUFBTU8sR0FBRyxHQUFHRixFQUFFLENBQUNILENBQUMsQ0FBQTtBQUNoQixJQUFBLE1BQU1NLEdBQUcsR0FBR0gsRUFBRSxDQUFDRCxDQUFDLENBQUE7QUFDaEIsSUFBQSxJQUFJSyxLQUFLLEdBQUdWLEdBQUcsR0FBR08sR0FBRyxDQUFBO0FBQ3JCLElBQUEsSUFBSUksS0FBSyxHQUFHWCxHQUFHLEdBQUdPLEdBQUcsQ0FBQTtBQUNyQixJQUFBLElBQUlLLEtBQUssR0FBR1YsR0FBRyxHQUFHTSxHQUFHLENBQUE7QUFDckIsSUFBQSxJQUFJSyxLQUFLLEdBQUdYLEdBQUcsR0FBR00sR0FBRyxDQUFBO0FBQ3JCLElBQUEsSUFBSU0sS0FBSyxHQUFHVixHQUFHLEdBQUdLLEdBQUcsQ0FBQTtBQUNyQixJQUFBLElBQUlNLEtBQUssR0FBR1gsR0FBRyxHQUFHSyxHQUFHLENBQUE7QUFFckIsSUFBQSxNQUFNTyxFQUFFLEdBQUdsQixLQUFLLENBQUNULE1BQU0sQ0FBQTtBQUN2QixJQUFBLE1BQU00QixHQUFHLEdBQUdELEVBQUUsQ0FBQ2YsQ0FBQyxDQUFBO0FBQ2hCLElBQUEsTUFBTWlCLEdBQUcsR0FBR0YsRUFBRSxDQUFDYixDQUFDLENBQUE7QUFDaEIsSUFBQSxNQUFNZ0IsR0FBRyxHQUFHSCxFQUFFLENBQUNYLENBQUMsQ0FBQTtBQUNoQixJQUFBLE1BQU1lLEVBQUUsR0FBR3RCLEtBQUssQ0FBQ1IsV0FBVyxDQUFBO0FBQzVCLElBQUEsTUFBTStCLEdBQUcsR0FBR0QsRUFBRSxDQUFDbkIsQ0FBQyxDQUFBO0FBQ2hCLElBQUEsTUFBTXFCLEdBQUcsR0FBR0YsRUFBRSxDQUFDakIsQ0FBQyxDQUFBO0FBQ2hCLElBQUEsTUFBTW9CLEdBQUcsR0FBR0gsRUFBRSxDQUFDZixDQUFDLENBQUE7QUFDaEIsSUFBQSxNQUFNbUIsS0FBSyxHQUFHUCxHQUFHLEdBQUdJLEdBQUcsQ0FBQTtBQUN2QixJQUFBLE1BQU1JLEtBQUssR0FBR1IsR0FBRyxHQUFHSSxHQUFHLENBQUE7QUFDdkIsSUFBQSxNQUFNSyxLQUFLLEdBQUdSLEdBQUcsR0FBR0ksR0FBRyxDQUFBO0FBQ3ZCLElBQUEsTUFBTUssS0FBSyxHQUFHVCxHQUFHLEdBQUdJLEdBQUcsQ0FBQTtBQUN2QixJQUFBLE1BQU1NLEtBQUssR0FBR1QsR0FBRyxHQUFHSSxHQUFHLENBQUE7QUFDdkIsSUFBQSxNQUFNTSxLQUFLLEdBQUdWLEdBQUcsR0FBR0ksR0FBRyxDQUFBO0FBRXZCLElBQUEsSUFBSUMsS0FBSyxHQUFHZCxLQUFLLEVBQUVBLEtBQUssR0FBR2MsS0FBSyxDQUFBO0FBQ2hDLElBQUEsSUFBSUMsS0FBSyxHQUFHZCxLQUFLLEVBQUVBLEtBQUssR0FBR2MsS0FBSyxDQUFBO0FBQ2hDLElBQUEsSUFBSUMsS0FBSyxHQUFHZCxLQUFLLEVBQUVBLEtBQUssR0FBR2MsS0FBSyxDQUFBO0FBQ2hDLElBQUEsSUFBSUMsS0FBSyxHQUFHZCxLQUFLLEVBQUVBLEtBQUssR0FBR2MsS0FBSyxDQUFBO0FBQ2hDLElBQUEsSUFBSUMsS0FBSyxHQUFHZCxLQUFLLEVBQUVBLEtBQUssR0FBR2MsS0FBSyxDQUFBO0FBQ2hDLElBQUEsSUFBSUMsS0FBSyxHQUFHZCxLQUFLLEVBQUVBLEtBQUssR0FBR2MsS0FBSyxDQUFBO0lBRWhDOUIsRUFBRSxDQUFDRSxDQUFDLEdBQUcsQ0FBQ1MsS0FBSyxHQUFHQyxLQUFLLElBQUksR0FBRyxDQUFBO0lBQzVCWixFQUFFLENBQUNJLENBQUMsR0FBRyxDQUFDUyxLQUFLLEdBQUdDLEtBQUssSUFBSSxHQUFHLENBQUE7SUFDNUJkLEVBQUUsQ0FBQ00sQ0FBQyxHQUFHLENBQUNTLEtBQUssR0FBR0MsS0FBSyxJQUFJLEdBQUcsQ0FBQTtJQUM1QlQsRUFBRSxDQUFDTCxDQUFDLEdBQUcsQ0FBQ1UsS0FBSyxHQUFHRCxLQUFLLElBQUksR0FBRyxDQUFBO0lBQzVCSixFQUFFLENBQUNI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
