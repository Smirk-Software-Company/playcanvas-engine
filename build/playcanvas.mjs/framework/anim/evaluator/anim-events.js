/**
 * AnimEvents stores a sorted array of animation events which should fire sequentially during the
 * playback of an pc.AnimTrack.
 *
 * @category Animation
 */
class AnimEvents {
  /**
   * Create a new AnimEvents instance.
   *
   * @param {object[]} events - An array of animation events.
   * @example
   * const events = new pc.AnimEvents([
   *     {
   *         name: 'my_event',
   *         time: 1.3, // given in seconds
   *         // any additional properties added are optional and will be available in the EventHandler callback's event object
   *         myProperty: 'test',
   *         myOtherProperty: true
   *     }
   * ]);
   * animTrack.events = events;
   */
  constructor(events) {
    this._events = [...events];
    this._events.sort((a, b) => a.time - b.time);
  }
  get events() {
    return this._events;
  }
}

export { AnimEvents };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYW5pbS1ldmVudHMuanMiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uL3NyYy9mcmFtZXdvcmsvYW5pbS9ldmFsdWF0b3IvYW5pbS1ldmVudHMuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBBbmltRXZlbnRzIHN0b3JlcyBhIHNvcnRlZCBhcnJheSBvZiBhbmltYXRpb24gZXZlbnRzIHdoaWNoIHNob3VsZCBmaXJlIHNlcXVlbnRpYWxseSBkdXJpbmcgdGhlXG4gKiBwbGF5YmFjayBvZiBhbiBwYy5BbmltVHJhY2suXG4gKlxuICogQGNhdGVnb3J5IEFuaW1hdGlvblxuICovXG5jbGFzcyBBbmltRXZlbnRzIHtcbiAgICAvKipcbiAgICAgKiBDcmVhdGUgYSBuZXcgQW5pbUV2ZW50cyBpbnN0YW5jZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7b2JqZWN0W119IGV2ZW50cyAtIEFuIGFycmF5IG9mIGFuaW1hdGlvbiBldmVudHMuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBjb25zdCBldmVudHMgPSBuZXcgcGMuQW5pbUV2ZW50cyhbXG4gICAgICogICAgIHtcbiAgICAgKiAgICAgICAgIG5hbWU6ICdteV9ldmVudCcsXG4gICAgICogICAgICAgICB0aW1lOiAxLjMsIC8vIGdpdmVuIGluIHNlY29uZHNcbiAgICAgKiAgICAgICAgIC8vIGFueSBhZGRpdGlvbmFsIHByb3BlcnRpZXMgYWRkZWQgYXJlIG9wdGlvbmFsIGFuZCB3aWxsIGJlIGF2YWlsYWJsZSBpbiB0aGUgRXZlbnRIYW5kbGVyIGNhbGxiYWNrJ3MgZXZlbnQgb2JqZWN0XG4gICAgICogICAgICAgICBteVByb3BlcnR5OiAndGVzdCcsXG4gICAgICogICAgICAgICBteU90aGVyUHJvcGVydHk6IHRydWVcbiAgICAgKiAgICAgfVxuICAgICAqIF0pO1xuICAgICAqIGFuaW1UcmFjay5ldmVudHMgPSBldmVudHM7XG4gICAgICovXG4gICAgY29uc3RydWN0b3IoZXZlbnRzKSB7XG4gICAgICAgIHRoaXMuX2V2ZW50cyA9IFsuLi5ldmVudHNdO1xuICAgICAgICB0aGlzLl9ldmVudHMuc29ydCgoYSwgYikgPT4gYS50aW1lIC0gYi50aW1lKTtcbiAgICB9XG5cbiAgICBnZXQgZXZlbnRzKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fZXZlbnRzO1xuICAgIH1cbn1cblxuZXhwb3J0IHsgQW5pbUV2ZW50cyB9O1xuIl0sIm5hbWVzIjpbIkFuaW1FdmVudHMiLCJjb25zdHJ1Y3RvciIsImV2ZW50cyIsIl9ldmVudHMiLCJzb3J0IiwiYSIsImIiLCJ0aW1lIl0sIm1hcHBpbmdzIjoiQUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxNQUFNQSxVQUFVLENBQUM7QUFDYjtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtFQUNJQyxXQUFXQSxDQUFDQyxNQUFNLEVBQUU7QUFDaEIsSUFBQSxJQUFJLENBQUNDLE9BQU8sR0FBRyxDQUFDLEdBQUdELE1BQU0sQ0FBQyxDQUFBO0FBQzFCLElBQUEsSUFBSSxDQUFDQyxPQUFPLENBQUNDLElBQUksQ0FBQyxDQUFDQyxDQUFDLEVBQUVDLENBQUMsS0FBS0QsQ0FBQyxDQUFDRSxJQUFJLEdBQUdELENBQUMsQ0FBQ0MsSUFBSSxDQUFDLENBQUE7QUFDaEQsR0FBQTtFQUVBLElBQUlMLE1BQU1BLEdBQUc7SUFDVCxPQUFPLElBQUksQ0FBQ0MsT0FBTyxDQUFBO0FBQ3ZCLEdBQUE7QUFDSjs7OzsifQ==
