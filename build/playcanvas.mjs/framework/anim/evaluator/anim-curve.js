/**
 * Animation curve links an input data set to an output data set and defines the interpolation
 * method to use.
 *
 * @category Animation
 */
class AnimCurve {
  /**
   * Create a new animation curve.
   *
   * @param {string[]} paths - Array of path strings identifying the targets of this curve, for
   * example "rootNode.translation".
   * @param {number} input - Index of the curve which specifies the key data.
   * @param {number} output - Index of the curve which specifies the value data.
   * @param {number} interpolation - The interpolation method to use. One of the following:
   *
   * - {@link INTERPOLATION_STEP}
   * - {@link INTERPOLATION_LINEAR}
   * - {@link INTERPOLATION_CUBIC}
   */
  constructor(paths, input, output, interpolation) {
    this._paths = paths;
    this._input = input;
    this._output = output;
    this._interpolation = interpolation;
  }

  /**
   * The list of paths which identify targets of this curve.
   *
   * @type {string[]}
   */
  get paths() {
    return this._paths;
  }

  /**
   * The index of the AnimTrack input which contains the key data for this curve.
   *
   * @type {number}
   */
  get input() {
    return this._input;
  }

  /**
   * The index of the AnimTrack input which contains the key data for this curve.
   *
   * @type {number}
   */
  get output() {
    return this._output;
  }

  /**
   * The interpolation method used by this curve.
   *
   * @type {number}
   */
  get interpolation() {
    return this._interpolation;
  }
}

export { AnimCurve };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYW5pbS1jdXJ2ZS5qcyIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vc3JjL2ZyYW1ld29yay9hbmltL2V2YWx1YXRvci9hbmltLWN1cnZlLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQW5pbWF0aW9uIGN1cnZlIGxpbmtzIGFuIGlucHV0IGRhdGEgc2V0IHRvIGFuIG91dHB1dCBkYXRhIHNldCBhbmQgZGVmaW5lcyB0aGUgaW50ZXJwb2xhdGlvblxuICogbWV0aG9kIHRvIHVzZS5cbiAqXG4gKiBAY2F0ZWdvcnkgQW5pbWF0aW9uXG4gKi9cbmNsYXNzIEFuaW1DdXJ2ZSB7XG4gICAgLyoqXG4gICAgICogQ3JlYXRlIGEgbmV3IGFuaW1hdGlvbiBjdXJ2ZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nW119IHBhdGhzIC0gQXJyYXkgb2YgcGF0aCBzdHJpbmdzIGlkZW50aWZ5aW5nIHRoZSB0YXJnZXRzIG9mIHRoaXMgY3VydmUsIGZvclxuICAgICAqIGV4YW1wbGUgXCJyb290Tm9kZS50cmFuc2xhdGlvblwiLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBpbnB1dCAtIEluZGV4IG9mIHRoZSBjdXJ2ZSB3aGljaCBzcGVjaWZpZXMgdGhlIGtleSBkYXRhLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBvdXRwdXQgLSBJbmRleCBvZiB0aGUgY3VydmUgd2hpY2ggc3BlY2lmaWVzIHRoZSB2YWx1ZSBkYXRhLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBpbnRlcnBvbGF0aW9uIC0gVGhlIGludGVycG9sYXRpb24gbWV0aG9kIHRvIHVzZS4gT25lIG9mIHRoZSBmb2xsb3dpbmc6XG4gICAgICpcbiAgICAgKiAtIHtAbGluayBJTlRFUlBPTEFUSU9OX1NURVB9XG4gICAgICogLSB7QGxpbmsgSU5URVJQT0xBVElPTl9MSU5FQVJ9XG4gICAgICogLSB7QGxpbmsgSU5URVJQT0xBVElPTl9DVUJJQ31cbiAgICAgKi9cbiAgICBjb25zdHJ1Y3RvcihwYXRocywgaW5wdXQsIG91dHB1dCwgaW50ZXJwb2xhdGlvbikge1xuICAgICAgICB0aGlzLl9wYXRocyA9IHBhdGhzO1xuICAgICAgICB0aGlzLl9pbnB1dCA9IGlucHV0O1xuICAgICAgICB0aGlzLl9vdXRwdXQgPSBvdXRwdXQ7XG4gICAgICAgIHRoaXMuX2ludGVycG9sYXRpb24gPSBpbnRlcnBvbGF0aW9uO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRoZSBsaXN0IG9mIHBhdGhzIHdoaWNoIGlkZW50aWZ5IHRhcmdldHMgb2YgdGhpcyBjdXJ2ZS5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtzdHJpbmdbXX1cbiAgICAgKi9cbiAgICBnZXQgcGF0aHMoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9wYXRocztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUaGUgaW5kZXggb2YgdGhlIEFuaW1UcmFjayBpbnB1dCB3aGljaCBjb250YWlucyB0aGUga2V5IGRhdGEgZm9yIHRoaXMgY3VydmUuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqL1xuICAgIGdldCBpbnB1dCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2lucHV0O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRoZSBpbmRleCBvZiB0aGUgQW5pbVRyYWNrIGlucHV0IHdoaWNoIGNvbnRhaW5zIHRoZSBrZXkgZGF0YSBmb3IgdGhpcyBjdXJ2ZS5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtudW1iZXJ9XG4gICAgICovXG4gICAgZ2V0IG91dHB1dCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX291dHB1dDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUaGUgaW50ZXJwb2xhdGlvbiBtZXRob2QgdXNlZCBieSB0aGlzIGN1cnZlLlxuICAgICAqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKi9cbiAgICBnZXQgaW50ZXJwb2xhdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2ludGVycG9sYXRpb247XG4gICAgfVxufVxuXG5leHBvcnQgeyBBbmltQ3VydmUgfTtcbiJdLCJuYW1lcyI6WyJBbmltQ3VydmUiLCJjb25zdHJ1Y3RvciIsInBhdGhzIiwiaW5wdXQiLCJvdXRwdXQiLCJpbnRlcnBvbGF0aW9uIiwiX3BhdGhzIiwiX2lucHV0IiwiX291dHB1dCIsIl9pbnRlcnBvbGF0aW9uIl0sIm1hcHBpbmdzIjoiQUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxNQUFNQSxTQUFTLENBQUM7QUFDWjtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtFQUNJQyxXQUFXQSxDQUFDQyxLQUFLLEVBQUVDLEtBQUssRUFBRUMsTUFBTSxFQUFFQyxhQUFhLEVBQUU7SUFDN0MsSUFBSSxDQUFDQyxNQUFNLEdBQUdKLEtBQUssQ0FBQTtJQUNuQixJQUFJLENBQUNLLE1BQU0sR0FBR0osS0FBSyxDQUFBO0lBQ25CLElBQUksQ0FBQ0ssT0FBTyxHQUFHSixNQUFNLENBQUE7SUFDckIsSUFBSSxDQUFDSyxjQUFjLEdBQUdKLGFBQWEsQ0FBQTtBQUN2QyxHQUFBOztBQUVBO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7RUFDSSxJQUFJSCxLQUFLQSxHQUFHO0lBQ1IsT0FBTyxJQUFJLENBQUNJLE1BQU0sQ0FBQTtBQUN0QixHQUFBOztBQUVBO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7RUFDSSxJQUFJSCxLQUFLQSxHQUFHO0lBQ1IsT0FBTyxJQUFJLENBQUNJLE1BQU0sQ0FBQTtBQUN0QixHQUFBOztBQUVBO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7RUFDSSxJQUFJSCxNQUFNQSxHQUFHO0lBQ1QsT0FBTyxJQUFJLENBQUNJLE9BQU8sQ0FBQTtBQUN2QixHQUFBOztBQUVBO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7RUFDSSxJQUFJSCxhQUFhQSxHQUFHO0lBQ2hCLE9BQU8sSUFBSSxDQUFDSSxjQUFjLENBQUE7QUFDOUIsR0FBQTtBQUNKOzs7OyJ9
