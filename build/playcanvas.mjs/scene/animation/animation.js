class Key {
  constructor(time, position, rotation, scale) {
    this.time = time;
    this.position = position;
    this.rotation = rotation;
    this.scale = scale;
  }
}

/**
 * A animation node has a name and contains an array of keyframes.
 *
 * @category Animation
 */
class Node {
  /**
   * Create a new Node instance.
   */
  constructor() {
    this._name = '';
    this._keys = [];
  }
}

/**
 * An animation is a sequence of keyframe arrays which map to the nodes of a skeletal hierarchy. It
 * controls how the nodes of the hierarchy are transformed over time.
 *
 * @category Animation
 */
class Animation {
  /**
   * Create a new Animation instance.
   */
  constructor() {
    /**
     * Human-readable name of the animation.
     *
     * @type {string}
     */
    this.name = '';
    /**
     * Duration of the animation in seconds.
     *
     * @type {number}
     */
    this.duration = 0;
    this._nodes = [];
    this._nodeDict = {};
  }

  /**
   * Gets a {@link Node} by name.
   *
   * @param {string} name - The name of the {@link Node}.
   * @returns {Node} The {@link Node} with the specified name.
   */
  getNode(name) {
    return this._nodeDict[name];
  }

  /**
   * Adds a node to the internal nodes array.
   *
   * @param {Node} node - The node to add.
   */
  addNode(node) {
    this._nodes.push(node);
    this._nodeDict[node._name] = node;
  }

  /**
   * A read-only property to get array of animation nodes.
   *
   * @type {Node[]}
   */
  get nodes() {
    return this._nodes;
  }
}

export { Animation, Key, Node };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYW5pbWF0aW9uLmpzIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvc2NlbmUvYW5pbWF0aW9uL2FuaW1hdGlvbi5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJjbGFzcyBLZXkge1xuICAgIGNvbnN0cnVjdG9yKHRpbWUsIHBvc2l0aW9uLCByb3RhdGlvbiwgc2NhbGUpIHtcbiAgICAgICAgdGhpcy50aW1lID0gdGltZTtcbiAgICAgICAgdGhpcy5wb3NpdGlvbiA9IHBvc2l0aW9uO1xuICAgICAgICB0aGlzLnJvdGF0aW9uID0gcm90YXRpb247XG4gICAgICAgIHRoaXMuc2NhbGUgPSBzY2FsZTtcbiAgICB9XG59XG5cbi8qKlxuICogQSBhbmltYXRpb24gbm9kZSBoYXMgYSBuYW1lIGFuZCBjb250YWlucyBhbiBhcnJheSBvZiBrZXlmcmFtZXMuXG4gKlxuICogQGNhdGVnb3J5IEFuaW1hdGlvblxuICovXG5jbGFzcyBOb2RlIHtcbiAgICAvKipcbiAgICAgKiBDcmVhdGUgYSBuZXcgTm9kZSBpbnN0YW5jZS5cbiAgICAgKi9cbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgdGhpcy5fbmFtZSA9ICcnO1xuICAgICAgICB0aGlzLl9rZXlzID0gW107XG4gICAgfVxufVxuXG4vKipcbiAqIEFuIGFuaW1hdGlvbiBpcyBhIHNlcXVlbmNlIG9mIGtleWZyYW1lIGFycmF5cyB3aGljaCBtYXAgdG8gdGhlIG5vZGVzIG9mIGEgc2tlbGV0YWwgaGllcmFyY2h5LiBJdFxuICogY29udHJvbHMgaG93IHRoZSBub2RlcyBvZiB0aGUgaGllcmFyY2h5IGFyZSB0cmFuc2Zvcm1lZCBvdmVyIHRpbWUuXG4gKlxuICogQGNhdGVnb3J5IEFuaW1hdGlvblxuICovXG5jbGFzcyBBbmltYXRpb24ge1xuICAgIC8qKlxuICAgICAqIEh1bWFuLXJlYWRhYmxlIG5hbWUgb2YgdGhlIGFuaW1hdGlvbi5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtzdHJpbmd9XG4gICAgICovXG4gICAgbmFtZSA9ICcnO1xuXG4gICAgLyoqXG4gICAgICogRHVyYXRpb24gb2YgdGhlIGFuaW1hdGlvbiBpbiBzZWNvbmRzLlxuICAgICAqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKi9cbiAgICBkdXJhdGlvbiA9IDA7XG5cbiAgICAvKipcbiAgICAgKiBDcmVhdGUgYSBuZXcgQW5pbWF0aW9uIGluc3RhbmNlLlxuICAgICAqL1xuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICB0aGlzLl9ub2RlcyA9IFtdO1xuICAgICAgICB0aGlzLl9ub2RlRGljdCA9IHt9O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEdldHMgYSB7QGxpbmsgTm9kZX0gYnkgbmFtZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lIC0gVGhlIG5hbWUgb2YgdGhlIHtAbGluayBOb2RlfS5cbiAgICAgKiBAcmV0dXJucyB7Tm9kZX0gVGhlIHtAbGluayBOb2RlfSB3aXRoIHRoZSBzcGVjaWZpZWQgbmFtZS5cbiAgICAgKi9cbiAgICBnZXROb2RlKG5hbWUpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX25vZGVEaWN0W25hbWVdO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEFkZHMgYSBub2RlIHRvIHRoZSBpbnRlcm5hbCBub2RlcyBhcnJheS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7Tm9kZX0gbm9kZSAtIFRoZSBub2RlIHRvIGFkZC5cbiAgICAgKi9cbiAgICBhZGROb2RlKG5vZGUpIHtcbiAgICAgICAgdGhpcy5fbm9kZXMucHVzaChub2RlKTtcbiAgICAgICAgdGhpcy5fbm9kZURpY3Rbbm9kZS5fbmFtZV0gPSBub2RlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEEgcmVhZC1vbmx5IHByb3BlcnR5IHRvIGdldCBhcnJheSBvZiBhbmltYXRpb24gbm9kZXMuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7Tm9kZVtdfVxuICAgICAqL1xuICAgIGdldCBub2RlcygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX25vZGVzO1xuICAgIH1cbn1cblxuZXhwb3J0IHsgQW5pbWF0aW9uLCBLZXksIE5vZGUgfTtcbiJdLCJuYW1lcyI6WyJLZXkiLCJjb25zdHJ1Y3RvciIsInRpbWUiLCJwb3NpdGlvbiIsInJvdGF0aW9uIiwic2NhbGUiLCJOb2RlIiwiX25hbWUiLCJfa2V5cyIsIkFuaW1hdGlvbiIsIm5hbWUiLCJkdXJhdGlvbiIsIl9ub2RlcyIsIl9ub2RlRGljdCIsImdldE5vZGUiLCJhZGROb2RlIiwibm9kZSIsInB1c2giLCJub2RlcyJdLCJtYXBwaW5ncyI6IkFBQUEsTUFBTUEsR0FBRyxDQUFDO0VBQ05DLFdBQVdBLENBQUNDLElBQUksRUFBRUMsUUFBUSxFQUFFQyxRQUFRLEVBQUVDLEtBQUssRUFBRTtJQUN6QyxJQUFJLENBQUNILElBQUksR0FBR0EsSUFBSSxDQUFBO0lBQ2hCLElBQUksQ0FBQ0MsUUFBUSxHQUFHQSxRQUFRLENBQUE7SUFDeEIsSUFBSSxDQUFDQyxRQUFRLEdBQUdBLFFBQVEsQ0FBQTtJQUN4QixJQUFJLENBQUNDLEtBQUssR0FBR0EsS0FBSyxDQUFBO0FBQ3RCLEdBQUE7QUFDSixDQUFBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxNQUFNQyxJQUFJLENBQUM7QUFDUDtBQUNKO0FBQ0E7QUFDSUwsRUFBQUEsV0FBV0EsR0FBRztJQUNWLElBQUksQ0FBQ00sS0FBSyxHQUFHLEVBQUUsQ0FBQTtJQUNmLElBQUksQ0FBQ0MsS0FBSyxHQUFHLEVBQUUsQ0FBQTtBQUNuQixHQUFBO0FBQ0osQ0FBQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxNQUFNQyxTQUFTLENBQUM7QUFlWjtBQUNKO0FBQ0E7QUFDSVIsRUFBQUEsV0FBV0EsR0FBRztBQWpCZDtBQUNKO0FBQ0E7QUFDQTtBQUNBO0lBSkksSUFLQVMsQ0FBQUEsSUFBSSxHQUFHLEVBQUUsQ0FBQTtBQUVUO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7SUFKSSxJQUtBQyxDQUFBQSxRQUFRLEdBQUcsQ0FBQyxDQUFBO0lBTVIsSUFBSSxDQUFDQyxNQUFNLEdBQUcsRUFBRSxDQUFBO0FBQ2hCLElBQUEsSUFBSSxDQUFDQyxTQUFTLEdBQUcsRUFBRSxDQUFBO0FBQ3ZCLEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0VBQ0lDLE9BQU9BLENBQUNKLElBQUksRUFBRTtBQUNWLElBQUEsT0FBTyxJQUFJLENBQUNHLFNBQVMsQ0FBQ0gsSUFBSSxDQUFDLENBQUE7QUFDL0IsR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0VBQ0lLLE9BQU9BLENBQUNDLElBQUksRUFBRTtBQUNWLElBQUEsSUFBSSxDQUFDSixNQUFNLENBQUNLLElBQUksQ0FBQ0QsSUFBSSxDQUFDLENBQUE7SUFDdEIsSUFBSSxDQUFDSCxTQUFTLENBQUNHLElBQUksQ0FBQ1QsS0FBSyxDQUFDLEdBQUdTLElBQUksQ0FBQTtBQUNyQyxHQUFBOztBQUVBO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7RUFDSSxJQUFJRSxLQUFLQSxHQUFHO0lBQ1IsT0FBTyxJQUFJLENBQUNOLE1BQU0sQ0FBQTtBQUN0QixHQUFBO0FBQ0o7Ozs7In0=
