import { SceneParser } from './parsers/scene.js';

/**
 * Create a Template resource from raw database data.
 */
class Template {
  /**
   * Create a new Template instance.
   *
   * @param {import('./app-base.js').AppBase} app - The application.
   * @param {object} data - Asset data from the database.
   */
  constructor(app, data) {
    /**
     * @type {import('./app-base.js').AppBase}
     * @private
     */
    this._app = void 0;
    /** @private */
    this._data = void 0;
    /**
     * @type {import('./entity.js').Entity|null}
     * @private
     */
    this._templateRoot = null;
    this._app = app;
    this._data = data;
  }

  /**
   * Create an instance of this template.
   *
   * @returns {import('./entity.js').Entity} The root entity of the created instance.
   */
  instantiate() {
    if (!this._templateRoot) {
      // at first use, after scripts are loaded
      this._parseTemplate();
    }
    return this._templateRoot.clone();
  }

  /** @private */
  _parseTemplate() {
    const parser = new SceneParser(this._app, true);
    this._templateRoot = parser.parse(this._data);
  }
}

export { Template };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVtcGxhdGUuanMiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9mcmFtZXdvcmsvdGVtcGxhdGUuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgU2NlbmVQYXJzZXIgfSBmcm9tICcuL3BhcnNlcnMvc2NlbmUuanMnO1xuXG4vKipcbiAqIENyZWF0ZSBhIFRlbXBsYXRlIHJlc291cmNlIGZyb20gcmF3IGRhdGFiYXNlIGRhdGEuXG4gKi9cbmNsYXNzIFRlbXBsYXRlIHtcbiAgICAvKipcbiAgICAgKiBAdHlwZSB7aW1wb3J0KCcuL2FwcC1iYXNlLmpzJykuQXBwQmFzZX1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9hcHA7XG5cbiAgICAvKiogQHByaXZhdGUgKi9cbiAgICBfZGF0YTtcblxuICAgIC8qKlxuICAgICAqIEB0eXBlIHtpbXBvcnQoJy4vZW50aXR5LmpzJykuRW50aXR5fG51bGx9XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfdGVtcGxhdGVSb290ID0gbnVsbDtcblxuICAgIC8qKlxuICAgICAqIENyZWF0ZSBhIG5ldyBUZW1wbGF0ZSBpbnN0YW5jZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuL2FwcC1iYXNlLmpzJykuQXBwQmFzZX0gYXBwIC0gVGhlIGFwcGxpY2F0aW9uLlxuICAgICAqIEBwYXJhbSB7b2JqZWN0fSBkYXRhIC0gQXNzZXQgZGF0YSBmcm9tIHRoZSBkYXRhYmFzZS5cbiAgICAgKi9cbiAgICBjb25zdHJ1Y3RvcihhcHAsIGRhdGEpIHtcbiAgICAgICAgdGhpcy5fYXBwID0gYXBwO1xuICAgICAgICB0aGlzLl9kYXRhID0gZGF0YTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDcmVhdGUgYW4gaW5zdGFuY2Ugb2YgdGhpcyB0ZW1wbGF0ZS5cbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtpbXBvcnQoJy4vZW50aXR5LmpzJykuRW50aXR5fSBUaGUgcm9vdCBlbnRpdHkgb2YgdGhlIGNyZWF0ZWQgaW5zdGFuY2UuXG4gICAgICovXG4gICAgaW5zdGFudGlhdGUoKSB7XG4gICAgICAgIGlmICghdGhpcy5fdGVtcGxhdGVSb290KSB7IC8vIGF0IGZpcnN0IHVzZSwgYWZ0ZXIgc2NyaXB0cyBhcmUgbG9hZGVkXG4gICAgICAgICAgICB0aGlzLl9wYXJzZVRlbXBsYXRlKCk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdGhpcy5fdGVtcGxhdGVSb290LmNsb25lKCk7XG4gICAgfVxuXG4gICAgLyoqIEBwcml2YXRlICovXG4gICAgX3BhcnNlVGVtcGxhdGUoKSB7XG4gICAgICAgIGNvbnN0IHBhcnNlciA9IG5ldyBTY2VuZVBhcnNlcih0aGlzLl9hcHAsIHRydWUpO1xuXG4gICAgICAgIHRoaXMuX3RlbXBsYXRlUm9vdCA9IHBhcnNlci5wYXJzZSh0aGlzLl9kYXRhKTtcbiAgICB9XG59XG5cbmV4cG9ydCB7IFRlbXBsYXRlIH07XG4iXSwibmFtZXMiOlsiVGVtcGxhdGUiLCJjb25zdHJ1Y3RvciIsImFwcCIsImRhdGEiLCJfYXBwIiwiX2RhdGEiLCJfdGVtcGxhdGVSb290IiwiaW5zdGFudGlhdGUiLCJfcGFyc2VUZW1wbGF0ZSIsImNsb25lIiwicGFyc2VyIiwiU2NlbmVQYXJzZXIiLCJwYXJzZSJdLCJtYXBwaW5ncyI6Ijs7QUFFQTtBQUNBO0FBQ0E7QUFDQSxNQUFNQSxRQUFRLENBQUM7QUFnQlg7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0lDLEVBQUFBLFdBQVdBLENBQUNDLEdBQUcsRUFBRUMsSUFBSSxFQUFFO0FBckJ2QjtBQUNKO0FBQ0E7QUFDQTtBQUhJLElBQUEsSUFBQSxDQUlBQyxJQUFJLEdBQUEsS0FBQSxDQUFBLENBQUE7QUFFSjtBQUFBLElBQUEsSUFBQSxDQUNBQyxLQUFLLEdBQUEsS0FBQSxDQUFBLENBQUE7QUFFTDtBQUNKO0FBQ0E7QUFDQTtJQUhJLElBSUFDLENBQUFBLGFBQWEsR0FBRyxJQUFJLENBQUE7SUFTaEIsSUFBSSxDQUFDRixJQUFJLEdBQUdGLEdBQUcsQ0FBQTtJQUNmLElBQUksQ0FBQ0csS0FBSyxHQUFHRixJQUFJLENBQUE7QUFDckIsR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0lJLEVBQUFBLFdBQVdBLEdBQUc7QUFDVixJQUFBLElBQUksQ0FBQyxJQUFJLENBQUNELGFBQWEsRUFBRTtBQUFFO01BQ3ZCLElBQUksQ0FBQ0UsY0FBYyxFQUFFLENBQUE7QUFDekIsS0FBQTtBQUVBLElBQUEsT0FBTyxJQUFJLENBQUNGLGFBQWEsQ0FBQ0csS0FBSyxFQUFFLENBQUE7QUFDckMsR0FBQTs7QUFFQTtBQUNBRCxFQUFBQSxjQUFjQSxHQUFHO0lBQ2IsTUFBTUUsTUFBTSxHQUFHLElBQUlDLFdBQVcsQ0FBQyxJQUFJLENBQUNQLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQTtJQUUvQyxJQUFJLENBQUNFLGFBQWEsR0FBR0ksTUFBTSxDQUFDRSxLQUFLLENBQUMsSUFBSSxDQUFDUCxLQUFLLENBQUMsQ0FBQTtBQUNqRCxHQUFBO0FBQ0o7Ozs7In0=
