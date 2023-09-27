import { EventHandle } from './event-handle.js';

/**
 * Callback used by {@link EventHandler} functions. Note the callback is limited to 8 arguments.
 *
 * @callback HandleEventCallback
 * @param {*} [arg1] - First argument that is passed from caller.
 * @param {*} [arg2] - Second argument that is passed from caller.
 * @param {*} [arg3] - Third argument that is passed from caller.
 * @param {*} [arg4] - Fourth argument that is passed from caller.
 * @param {*} [arg5] - Fifth argument that is passed from caller.
 * @param {*} [arg6] - Sixth argument that is passed from caller.
 * @param {*} [arg7] - Seventh argument that is passed from caller.
 * @param {*} [arg8] - Eighth argument that is passed from caller.
 */

/**
 * Abstract base class that implements functionality for event handling.
 *
 * ```javascript
 * const obj = new EventHandlerSubclass();
 *
 * // subscribe to an event
 * obj.on('hello', function (str) {
 *     console.log('event hello is fired', str);
 * });
 *
 * // fire event
 * obj.fire('hello', 'world');
 * ```
 */
class EventHandler {
  constructor() {
    /**
     * @type {Map<string,Array<EventHandle>>}
     * @private
     */
    this._callbacks = new Map();
    /**
     * @type {Map<string,Array<EventHandle>>}
     * @private
     */
    this._callbackActive = new Map();
  }
  /**
   * Reinitialize the event handler.
   * @ignore
   */
  initEventHandler() {
    this._callbacks = new Map();
    this._callbackActive = new Map();
  }

  /**
   * Registers a new event handler.
   *
   * @param {string} name - Name of the event to bind the callback to.
   * @param {HandleEventCallback} callback - Function that is called when event is fired. Note
   * the callback is limited to 8 arguments.
   * @param {object} scope - Object to use as 'this' when the event is fired, defaults to
   * current this.
   * @param {boolean} once - If true, the callback will be unbound after being fired once.
   * @returns {EventHandle} Created {@link EventHandle}.
   * @ignore
   */
  _addCallback(name, callback, scope, once) {
    if (!name || typeof name !== 'string' || !callback) console.warn(`EventHandler: subscribing to an event (${name}) with missing arguments`, callback);
    if (!this._callbacks.has(name)) this._callbacks.set(name, []);

    // if we are adding a callback to the list that is executing right now
    // ensure we preserve initial list before modifications
    if (this._callbackActive.has(name)) {
      const callbackActive = this._callbackActive.get(name);
      if (callbackActive && callbackActive === this._callbacks.get(name)) {
        this._callbackActive.set(name, callbackActive.slice());
      }
    }
    const evt = new EventHandle(this, name, callback, scope, once);
    this._callbacks.get(name).push(evt);
    return evt;
  }

  /**
   * Attach an event handler to an event.
   *
   * @param {string} name - Name of the event to bind the callback to.
   * @param {HandleEventCallback} callback - Function that is called when event is fired. Note
   * the callback is limited to 8 arguments.
   * @param {object} [scope] - Object to use as 'this' when the event is fired, defaults to
   * current this.
   * @returns {EventHandle} Can be used for removing event in the future.
   * @example
   * obj.on('test', function (a, b) {
   *     console.log(a + b);
   * });
   * obj.fire('test', 1, 2); // prints 3 to the console
   * @example
   * const evt = obj.on('test', function (a, b) {
   *     console.log(a + b);
   * });
   * // some time later
   * evt.off();
   */
  on(name, callback, scope = this) {
    return this._addCallback(name, callback, scope, false);
  }

  /**
   * Attach an event handler to an event. This handler will be removed after being fired once.
   *
   * @param {string} name - Name of the event to bind the callback to.
   * @param {HandleEventCallback} callback - Function that is called when event is fired. Note
   * the callback is limited to 8 arguments.
   * @param {object} [scope] - Object to use as 'this' when the event is fired, defaults to
   * current this.
   * @returns {EventHandle} - can be used for removing event in the future.
   * @example
   * obj.once('test', function (a, b) {
   *     console.log(a + b);
   * });
   * obj.fire('test', 1, 2); // prints 3 to the console
   * obj.fire('test', 1, 2); // not going to get handled
   */
  once(name, callback, scope = this) {
    return this._addCallback(name, callback, scope, true);
  }

  /**
   * Detach an event handler from an event. If callback is not provided then all callbacks are
   * unbound from the event, if scope is not provided then all events with the callback will be
   * unbound.
   *
   * @param {string} [name] - Name of the event to unbind.
   * @param {HandleEventCallback} [callback] - Function to be unbound.
   * @param {object} [scope] - Scope that was used as the this when the event is fired.
   * @returns {EventHandler} Self for chaining.
   * @example
   * const handler = function () {
   * };
   * obj.on('test', handler);
   *
   * obj.off(); // Removes all events
   * obj.off('test'); // Removes all events called 'test'
   * obj.off('test', handler); // Removes all handler functions, called 'test'
   * obj.off('test', handler, this); // Removes all handler functions, called 'test' with scope this
   */
  off(name, callback, scope) {
    if (name) {
      // if we are removing a callback from the list that is executing right now
      // ensure we preserve initial list before modifications
      if (this._callbackActive.has(name) && this._callbackActive.get(name) === this._callbacks.get(name)) this._callbackActive.set(name, this._callbackActive.get(name).slice());
    } else {
      // if we are removing a callback from any list that is executing right now
      // ensure we preserve these initial lists before modifications
      for (const [key, callbacks] of this._callbackActive) {
        if (!this._callbacks.has(key)) continue;
        if (this._callbacks.get(key) !== callbacks) continue;
        this._callbackActive.set(key, callbacks.slice());
      }
    }
    if (!name) {
      // remove all events
      for (const callbacks of this._callbacks.values()) {
        for (let i = 0; i < callbacks.length; i++) {
          callbacks[i].removed = true;
        }
      }
      this._callbacks.clear();
    } else if (!callback) {
      // remove all events of a specific name
      const callbacks = this._callbacks.get(name);
      if (callbacks) {
        for (let i = 0; i < callbacks.length; i++) {
          callbacks[i].removed = true;
        }
        this._callbacks.delete(name);
      }
    } else {
      const callbacks = this._callbacks.get(name);
      if (!callbacks) return this;
      for (let i = 0; i < callbacks.length; i++) {
        // remove all events with a specific name and a callback
        if (callbacks[i].callback !== callback) continue;

        // could be a specific scope as well
        if (scope && callbacks[i].scope !== scope) continue;
        callbacks[i].removed = true;
        callbacks.splice(i, 1);
        i--;
      }
      if (callbacks.length === 0) this._callbacks.delete(name);
    }
    return this;
  }

  /**
   * Fire an event, all additional arguments are passed on to the event listener.
   *
   * @param {string} name - Name of event to fire.
   * @param {*} [arg1] - First argument that is passed to the event handler.
   * @param {*} [arg2] - Second argument that is passed to the event handler.
   * @param {*} [arg3] - Third argument that is passed to the event handler.
   * @param {*} [arg4] - Fourth argument that is passed to the event handler.
   * @param {*} [arg5] - Fifth argument that is passed to the event handler.
   * @param {*} [arg6] - Sixth argument that is passed to the event handler.
   * @param {*} [arg7] - Seventh argument that is passed to the event handler.
   * @param {*} [arg8] - Eighth argument that is passed to the event handler.
   * @returns {EventHandler} Self for chaining.
   * @example
   * obj.fire('test', 'This is the message');
   */
  fire(name, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8) {
    if (!name) return this;
    const callbacksInitial = this._callbacks.get(name);
    if (!callbacksInitial) return this;
    let callbacks;
    if (!this._callbackActive.has(name)) {
      // when starting callbacks execution ensure we store a list of initial callbacks
      this._callbackActive.set(name, callbacksInitial);
    } else if (this._callbackActive.get(name) !== callbacksInitial) {
      // if we are trying to execute a callback while there is an active execution right now
      // and the active list has been already modified,
      // then we go to an unoptimized path and clone callbacks list to ensure execution consistency
      callbacks = callbacksInitial.slice();
    }

    // eslint-disable-next-line no-unmodified-loop-condition
    for (let i = 0; (callbacks || this._callbackActive.get(name)) && i < (callbacks || this._callbackActive.get(name)).length; i++) {
      const evt = (callbacks || this._callbackActive.get(name))[i];
      if (!evt.callback) continue;
      evt.callback.call(evt.scope, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8);
      if (evt._once) {
        // check that callback still exists because user may have unsubscribed in the event handler
        const existingCallback = this._callbacks.get(name);
        const ind = existingCallback ? existingCallback.indexOf(evt) : -1;
        if (ind !== -1) {
          if (this._callbackActive.get(name) === existingCallback) this._callbackActive.set(name, this._callbackActive.get(name).slice());
          const _callbacks = this._callbacks.get(name);
          if (!_callbacks) continue;
          _callbacks[ind].removed = true;
          _callbacks.splice(ind, 1);
          if (_callbacks.length === 0) this._callbacks.delete(name);
        }
      }
    }
    if (!callbacks) this._callbackActive.delete(name);
    return this;
  }

  /**
   * Test if there are any handlers bound to an event name.
   *
   * @param {string} name - The name of the event to test.
   * @returns {boolean} True if the object has handlers bound to the specified event name.
   * @example
   * obj.on('test', function () { }); // bind an event to 'test'
   * obj.hasEvent('test'); // returns true
   * obj.hasEvent('hello'); // returns false
   */
  hasEvent(name) {
    var _this$_callbacks$get;
    return !!((_this$_callbacks$get = this._callbacks.get(name)) != null && _this$_callbacks$get.length);
  }
}

export { EventHandler };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXZlbnQtaGFuZGxlci5qcyIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL2NvcmUvZXZlbnQtaGFuZGxlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBFdmVudEhhbmRsZSB9IGZyb20gJy4vZXZlbnQtaGFuZGxlLmpzJztcblxuLyoqXG4gKiBDYWxsYmFjayB1c2VkIGJ5IHtAbGluayBFdmVudEhhbmRsZXJ9IGZ1bmN0aW9ucy4gTm90ZSB0aGUgY2FsbGJhY2sgaXMgbGltaXRlZCB0byA4IGFyZ3VtZW50cy5cbiAqXG4gKiBAY2FsbGJhY2sgSGFuZGxlRXZlbnRDYWxsYmFja1xuICogQHBhcmFtIHsqfSBbYXJnMV0gLSBGaXJzdCBhcmd1bWVudCB0aGF0IGlzIHBhc3NlZCBmcm9tIGNhbGxlci5cbiAqIEBwYXJhbSB7Kn0gW2FyZzJdIC0gU2Vjb25kIGFyZ3VtZW50IHRoYXQgaXMgcGFzc2VkIGZyb20gY2FsbGVyLlxuICogQHBhcmFtIHsqfSBbYXJnM10gLSBUaGlyZCBhcmd1bWVudCB0aGF0IGlzIHBhc3NlZCBmcm9tIGNhbGxlci5cbiAqIEBwYXJhbSB7Kn0gW2FyZzRdIC0gRm91cnRoIGFyZ3VtZW50IHRoYXQgaXMgcGFzc2VkIGZyb20gY2FsbGVyLlxuICogQHBhcmFtIHsqfSBbYXJnNV0gLSBGaWZ0aCBhcmd1bWVudCB0aGF0IGlzIHBhc3NlZCBmcm9tIGNhbGxlci5cbiAqIEBwYXJhbSB7Kn0gW2FyZzZdIC0gU2l4dGggYXJndW1lbnQgdGhhdCBpcyBwYXNzZWQgZnJvbSBjYWxsZXIuXG4gKiBAcGFyYW0geyp9IFthcmc3XSAtIFNldmVudGggYXJndW1lbnQgdGhhdCBpcyBwYXNzZWQgZnJvbSBjYWxsZXIuXG4gKiBAcGFyYW0geyp9IFthcmc4XSAtIEVpZ2h0aCBhcmd1bWVudCB0aGF0IGlzIHBhc3NlZCBmcm9tIGNhbGxlci5cbiAqL1xuXG4vKipcbiAqIEFic3RyYWN0IGJhc2UgY2xhc3MgdGhhdCBpbXBsZW1lbnRzIGZ1bmN0aW9uYWxpdHkgZm9yIGV2ZW50IGhhbmRsaW5nLlxuICpcbiAqIGBgYGphdmFzY3JpcHRcbiAqIGNvbnN0IG9iaiA9IG5ldyBFdmVudEhhbmRsZXJTdWJjbGFzcygpO1xuICpcbiAqIC8vIHN1YnNjcmliZSB0byBhbiBldmVudFxuICogb2JqLm9uKCdoZWxsbycsIGZ1bmN0aW9uIChzdHIpIHtcbiAqICAgICBjb25zb2xlLmxvZygnZXZlbnQgaGVsbG8gaXMgZmlyZWQnLCBzdHIpO1xuICogfSk7XG4gKlxuICogLy8gZmlyZSBldmVudFxuICogb2JqLmZpcmUoJ2hlbGxvJywgJ3dvcmxkJyk7XG4gKiBgYGBcbiAqL1xuY2xhc3MgRXZlbnRIYW5kbGVyIHtcbiAgICAvKipcbiAgICAgKiBAdHlwZSB7TWFwPHN0cmluZyxBcnJheTxFdmVudEhhbmRsZT4+fVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX2NhbGxiYWNrcyA9IG5ldyBNYXAoKTtcblxuICAgIC8qKlxuICAgICAqIEB0eXBlIHtNYXA8c3RyaW5nLEFycmF5PEV2ZW50SGFuZGxlPj59XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfY2FsbGJhY2tBY3RpdmUgPSBuZXcgTWFwKCk7XG5cbiAgICAvKipcbiAgICAgKiBSZWluaXRpYWxpemUgdGhlIGV2ZW50IGhhbmRsZXIuXG4gICAgICogQGlnbm9yZVxuICAgICAqL1xuICAgIGluaXRFdmVudEhhbmRsZXIoKSB7XG4gICAgICAgIHRoaXMuX2NhbGxiYWNrcyA9IG5ldyBNYXAoKTtcbiAgICAgICAgdGhpcy5fY2FsbGJhY2tBY3RpdmUgPSBuZXcgTWFwKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVnaXN0ZXJzIGEgbmV3IGV2ZW50IGhhbmRsZXIuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gbmFtZSAtIE5hbWUgb2YgdGhlIGV2ZW50IHRvIGJpbmQgdGhlIGNhbGxiYWNrIHRvLlxuICAgICAqIEBwYXJhbSB7SGFuZGxlRXZlbnRDYWxsYmFja30gY2FsbGJhY2sgLSBGdW5jdGlvbiB0aGF0IGlzIGNhbGxlZCB3aGVuIGV2ZW50IGlzIGZpcmVkLiBOb3RlXG4gICAgICogdGhlIGNhbGxiYWNrIGlzIGxpbWl0ZWQgdG8gOCBhcmd1bWVudHMuXG4gICAgICogQHBhcmFtIHtvYmplY3R9IHNjb3BlIC0gT2JqZWN0IHRvIHVzZSBhcyAndGhpcycgd2hlbiB0aGUgZXZlbnQgaXMgZmlyZWQsIGRlZmF1bHRzIHRvXG4gICAgICogY3VycmVudCB0aGlzLlxuICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gb25jZSAtIElmIHRydWUsIHRoZSBjYWxsYmFjayB3aWxsIGJlIHVuYm91bmQgYWZ0ZXIgYmVpbmcgZmlyZWQgb25jZS5cbiAgICAgKiBAcmV0dXJucyB7RXZlbnRIYW5kbGV9IENyZWF0ZWQge0BsaW5rIEV2ZW50SGFuZGxlfS5cbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgX2FkZENhbGxiYWNrKG5hbWUsIGNhbGxiYWNrLCBzY29wZSwgb25jZSkge1xuICAgICAgICAvLyAjaWYgX0RFQlVHXG4gICAgICAgIGlmICghbmFtZSB8fCB0eXBlb2YgbmFtZSAhPT0gJ3N0cmluZycgfHwgIWNhbGxiYWNrKVxuICAgICAgICAgICAgY29uc29sZS53YXJuKGBFdmVudEhhbmRsZXI6IHN1YnNjcmliaW5nIHRvIGFuIGV2ZW50ICgke25hbWV9KSB3aXRoIG1pc3NpbmcgYXJndW1lbnRzYCwgY2FsbGJhY2spO1xuICAgICAgICAvLyAjZW5kaWZcblxuICAgICAgICBpZiAoIXRoaXMuX2NhbGxiYWNrcy5oYXMobmFtZSkpXG4gICAgICAgICAgICB0aGlzLl9jYWxsYmFja3Muc2V0KG5hbWUsIFtdKTtcblxuICAgICAgICAvLyBpZiB3ZSBhcmUgYWRkaW5nIGEgY2FsbGJhY2sgdG8gdGhlIGxpc3QgdGhhdCBpcyBleGVjdXRpbmcgcmlnaHQgbm93XG4gICAgICAgIC8vIGVuc3VyZSB3ZSBwcmVzZXJ2ZSBpbml0aWFsIGxpc3QgYmVmb3JlIG1vZGlmaWNhdGlvbnNcbiAgICAgICAgaWYgKHRoaXMuX2NhbGxiYWNrQWN0aXZlLmhhcyhuYW1lKSkge1xuICAgICAgICAgICAgY29uc3QgY2FsbGJhY2tBY3RpdmUgPSB0aGlzLl9jYWxsYmFja0FjdGl2ZS5nZXQobmFtZSk7XG4gICAgICAgICAgICBpZiAoY2FsbGJhY2tBY3RpdmUgJiYgY2FsbGJhY2tBY3RpdmUgPT09IHRoaXMuX2NhbGxiYWNrcy5nZXQobmFtZSkpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9jYWxsYmFja0FjdGl2ZS5zZXQobmFtZSwgY2FsbGJhY2tBY3RpdmUuc2xpY2UoKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBldnQgPSBuZXcgRXZlbnRIYW5kbGUodGhpcywgbmFtZSwgY2FsbGJhY2ssIHNjb3BlLCBvbmNlKTtcbiAgICAgICAgdGhpcy5fY2FsbGJhY2tzLmdldChuYW1lKS5wdXNoKGV2dCk7XG4gICAgICAgIHJldHVybiBldnQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQXR0YWNoIGFuIGV2ZW50IGhhbmRsZXIgdG8gYW4gZXZlbnQuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gbmFtZSAtIE5hbWUgb2YgdGhlIGV2ZW50IHRvIGJpbmQgdGhlIGNhbGxiYWNrIHRvLlxuICAgICAqIEBwYXJhbSB7SGFuZGxlRXZlbnRDYWxsYmFja30gY2FsbGJhY2sgLSBGdW5jdGlvbiB0aGF0IGlzIGNhbGxlZCB3aGVuIGV2ZW50IGlzIGZpcmVkLiBOb3RlXG4gICAgICogdGhlIGNhbGxiYWNrIGlzIGxpbWl0ZWQgdG8gOCBhcmd1bWVudHMuXG4gICAgICogQHBhcmFtIHtvYmplY3R9IFtzY29wZV0gLSBPYmplY3QgdG8gdXNlIGFzICd0aGlzJyB3aGVuIHRoZSBldmVudCBpcyBmaXJlZCwgZGVmYXVsdHMgdG9cbiAgICAgKiBjdXJyZW50IHRoaXMuXG4gICAgICogQHJldHVybnMge0V2ZW50SGFuZGxlfSBDYW4gYmUgdXNlZCBmb3IgcmVtb3ZpbmcgZXZlbnQgaW4gdGhlIGZ1dHVyZS5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIG9iai5vbigndGVzdCcsIGZ1bmN0aW9uIChhLCBiKSB7XG4gICAgICogICAgIGNvbnNvbGUubG9nKGEgKyBiKTtcbiAgICAgKiB9KTtcbiAgICAgKiBvYmouZmlyZSgndGVzdCcsIDEsIDIpOyAvLyBwcmludHMgMyB0byB0aGUgY29uc29sZVxuICAgICAqIEBleGFtcGxlXG4gICAgICogY29uc3QgZXZ0ID0gb2JqLm9uKCd0ZXN0JywgZnVuY3Rpb24gKGEsIGIpIHtcbiAgICAgKiAgICAgY29uc29sZS5sb2coYSArIGIpO1xuICAgICAqIH0pO1xuICAgICAqIC8vIHNvbWUgdGltZSBsYXRlclxuICAgICAqIGV2dC5vZmYoKTtcbiAgICAgKi9cbiAgICBvbihuYW1lLCBjYWxsYmFjaywgc2NvcGUgPSB0aGlzKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGRDYWxsYmFjayhuYW1lLCBjYWxsYmFjaywgc2NvcGUsIGZhbHNlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBdHRhY2ggYW4gZXZlbnQgaGFuZGxlciB0byBhbiBldmVudC4gVGhpcyBoYW5kbGVyIHdpbGwgYmUgcmVtb3ZlZCBhZnRlciBiZWluZyBmaXJlZCBvbmNlLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IG5hbWUgLSBOYW1lIG9mIHRoZSBldmVudCB0byBiaW5kIHRoZSBjYWxsYmFjayB0by5cbiAgICAgKiBAcGFyYW0ge0hhbmRsZUV2ZW50Q2FsbGJhY2t9IGNhbGxiYWNrIC0gRnVuY3Rpb24gdGhhdCBpcyBjYWxsZWQgd2hlbiBldmVudCBpcyBmaXJlZC4gTm90ZVxuICAgICAqIHRoZSBjYWxsYmFjayBpcyBsaW1pdGVkIHRvIDggYXJndW1lbnRzLlxuICAgICAqIEBwYXJhbSB7b2JqZWN0fSBbc2NvcGVdIC0gT2JqZWN0IHRvIHVzZSBhcyAndGhpcycgd2hlbiB0aGUgZXZlbnQgaXMgZmlyZWQsIGRlZmF1bHRzIHRvXG4gICAgICogY3VycmVudCB0aGlzLlxuICAgICAqIEByZXR1cm5zIHtFdmVudEhhbmRsZX0gLSBjYW4gYmUgdXNlZCBmb3IgcmVtb3ZpbmcgZXZlbnQgaW4gdGhlIGZ1dHVyZS5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIG9iai5vbmNlKCd0ZXN0JywgZnVuY3Rpb24gKGEsIGIpIHtcbiAgICAgKiAgICAgY29uc29sZS5sb2coYSArIGIpO1xuICAgICAqIH0pO1xuICAgICAqIG9iai5maXJlKCd0ZXN0JywgMSwgMik7IC8vIHByaW50cyAzIHRvIHRoZSBjb25zb2xlXG4gICAgICogb2JqLmZpcmUoJ3Rlc3QnLCAxLCAyKTsgLy8gbm90IGdvaW5nIHRvIGdldCBoYW5kbGVkXG4gICAgICovXG4gICAgb25jZShuYW1lLCBjYWxsYmFjaywgc2NvcGUgPSB0aGlzKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGRDYWxsYmFjayhuYW1lLCBjYWxsYmFjaywgc2NvcGUsIHRydWUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIERldGFjaCBhbiBldmVudCBoYW5kbGVyIGZyb20gYW4gZXZlbnQuIElmIGNhbGxiYWNrIGlzIG5vdCBwcm92aWRlZCB0aGVuIGFsbCBjYWxsYmFja3MgYXJlXG4gICAgICogdW5ib3VuZCBmcm9tIHRoZSBldmVudCwgaWYgc2NvcGUgaXMgbm90IHByb3ZpZGVkIHRoZW4gYWxsIGV2ZW50cyB3aXRoIHRoZSBjYWxsYmFjayB3aWxsIGJlXG4gICAgICogdW5ib3VuZC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBbbmFtZV0gLSBOYW1lIG9mIHRoZSBldmVudCB0byB1bmJpbmQuXG4gICAgICogQHBhcmFtIHtIYW5kbGVFdmVudENhbGxiYWNrfSBbY2FsbGJhY2tdIC0gRnVuY3Rpb24gdG8gYmUgdW5ib3VuZC5cbiAgICAgKiBAcGFyYW0ge29iamVjdH0gW3Njb3BlXSAtIFNjb3BlIHRoYXQgd2FzIHVzZWQgYXMgdGhlIHRoaXMgd2hlbiB0aGUgZXZlbnQgaXMgZmlyZWQuXG4gICAgICogQHJldHVybnMge0V2ZW50SGFuZGxlcn0gU2VsZiBmb3IgY2hhaW5pbmcuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBjb25zdCBoYW5kbGVyID0gZnVuY3Rpb24gKCkge1xuICAgICAqIH07XG4gICAgICogb2JqLm9uKCd0ZXN0JywgaGFuZGxlcik7XG4gICAgICpcbiAgICAgKiBvYmoub2ZmKCk7IC8vIFJlbW92ZXMgYWxsIGV2ZW50c1xuICAgICAqIG9iai5vZmYoJ3Rlc3QnKTsgLy8gUmVtb3ZlcyBhbGwgZXZlbnRzIGNhbGxlZCAndGVzdCdcbiAgICAgKiBvYmoub2ZmKCd0ZXN0JywgaGFuZGxlcik7IC8vIFJlbW92ZXMgYWxsIGhhbmRsZXIgZnVuY3Rpb25zLCBjYWxsZWQgJ3Rlc3QnXG4gICAgICogb2JqLm9mZigndGVzdCcsIGhhbmRsZXIsIHRoaXMpOyAvLyBSZW1vdmVzIGFsbCBoYW5kbGVyIGZ1bmN0aW9ucywgY2FsbGVkICd0ZXN0JyB3aXRoIHNjb3BlIHRoaXNcbiAgICAgKi9cbiAgICBvZmYobmFtZSwgY2FsbGJhY2ssIHNjb3BlKSB7XG4gICAgICAgIGlmIChuYW1lKSB7XG4gICAgICAgICAgICAvLyBpZiB3ZSBhcmUgcmVtb3ZpbmcgYSBjYWxsYmFjayBmcm9tIHRoZSBsaXN0IHRoYXQgaXMgZXhlY3V0aW5nIHJpZ2h0IG5vd1xuICAgICAgICAgICAgLy8gZW5zdXJlIHdlIHByZXNlcnZlIGluaXRpYWwgbGlzdCBiZWZvcmUgbW9kaWZpY2F0aW9uc1xuICAgICAgICAgICAgaWYgKHRoaXMuX2NhbGxiYWNrQWN0aXZlLmhhcyhuYW1lKSAmJiB0aGlzLl9jYWxsYmFja0FjdGl2ZS5nZXQobmFtZSkgPT09IHRoaXMuX2NhbGxiYWNrcy5nZXQobmFtZSkpXG4gICAgICAgICAgICAgICAgdGhpcy5fY2FsbGJhY2tBY3RpdmUuc2V0KG5hbWUsIHRoaXMuX2NhbGxiYWNrQWN0aXZlLmdldChuYW1lKS5zbGljZSgpKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIGlmIHdlIGFyZSByZW1vdmluZyBhIGNhbGxiYWNrIGZyb20gYW55IGxpc3QgdGhhdCBpcyBleGVjdXRpbmcgcmlnaHQgbm93XG4gICAgICAgICAgICAvLyBlbnN1cmUgd2UgcHJlc2VydmUgdGhlc2UgaW5pdGlhbCBsaXN0cyBiZWZvcmUgbW9kaWZpY2F0aW9uc1xuICAgICAgICAgICAgZm9yIChjb25zdCBba2V5LCBjYWxsYmFja3NdIG9mIHRoaXMuX2NhbGxiYWNrQWN0aXZlKSB7XG4gICAgICAgICAgICAgICAgaWYgKCF0aGlzLl9jYWxsYmFja3MuaGFzKGtleSkpXG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuX2NhbGxiYWNrcy5nZXQoa2V5KSAhPT0gY2FsbGJhY2tzKVxuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcblxuICAgICAgICAgICAgICAgIHRoaXMuX2NhbGxiYWNrQWN0aXZlLnNldChrZXksIGNhbGxiYWNrcy5zbGljZSgpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghbmFtZSkge1xuICAgICAgICAgICAgLy8gcmVtb3ZlIGFsbCBldmVudHNcbiAgICAgICAgICAgIGZvciAoY29uc3QgY2FsbGJhY2tzIG9mIHRoaXMuX2NhbGxiYWNrcy52YWx1ZXMoKSkge1xuICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgY2FsbGJhY2tzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrc1tpXS5yZW1vdmVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLl9jYWxsYmFja3MuY2xlYXIoKTtcbiAgICAgICAgfSBlbHNlIGlmICghY2FsbGJhY2spIHtcbiAgICAgICAgICAgIC8vIHJlbW92ZSBhbGwgZXZlbnRzIG9mIGEgc3BlY2lmaWMgbmFtZVxuICAgICAgICAgICAgY29uc3QgY2FsbGJhY2tzID0gdGhpcy5fY2FsbGJhY2tzLmdldChuYW1lKTtcbiAgICAgICAgICAgIGlmIChjYWxsYmFja3MpIHtcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGNhbGxiYWNrcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICBjYWxsYmFja3NbaV0ucmVtb3ZlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRoaXMuX2NhbGxiYWNrcy5kZWxldGUobmFtZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zdCBjYWxsYmFja3MgPSB0aGlzLl9jYWxsYmFja3MuZ2V0KG5hbWUpO1xuICAgICAgICAgICAgaWYgKCFjYWxsYmFja3MpXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG5cbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgY2FsbGJhY2tzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgLy8gcmVtb3ZlIGFsbCBldmVudHMgd2l0aCBhIHNwZWNpZmljIG5hbWUgYW5kIGEgY2FsbGJhY2tcbiAgICAgICAgICAgICAgICBpZiAoY2FsbGJhY2tzW2ldLmNhbGxiYWNrICE9PSBjYWxsYmFjaylcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG5cbiAgICAgICAgICAgICAgICAvLyBjb3VsZCBiZSBhIHNwZWNpZmljIHNjb3BlIGFzIHdlbGxcbiAgICAgICAgICAgICAgICBpZiAoc2NvcGUgJiYgY2FsbGJhY2tzW2ldLnNjb3BlICE9PSBzY29wZSlcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG5cbiAgICAgICAgICAgICAgICBjYWxsYmFja3NbaV0ucmVtb3ZlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2tzLnNwbGljZShpLCAxKTtcbiAgICAgICAgICAgICAgICBpLS07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChjYWxsYmFja3MubGVuZ3RoID09PSAwKVxuICAgICAgICAgICAgICAgIHRoaXMuX2NhbGxiYWNrcy5kZWxldGUobmFtZSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBGaXJlIGFuIGV2ZW50LCBhbGwgYWRkaXRpb25hbCBhcmd1bWVudHMgYXJlIHBhc3NlZCBvbiB0byB0aGUgZXZlbnQgbGlzdGVuZXIuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gbmFtZSAtIE5hbWUgb2YgZXZlbnQgdG8gZmlyZS5cbiAgICAgKiBAcGFyYW0geyp9IFthcmcxXSAtIEZpcnN0IGFyZ3VtZW50IHRoYXQgaXMgcGFzc2VkIHRvIHRoZSBldmVudCBoYW5kbGVyLlxuICAgICAqIEBwYXJhbSB7Kn0gW2FyZzJdIC0gU2Vjb25kIGFyZ3VtZW50IHRoYXQgaXMgcGFzc2VkIHRvIHRoZSBldmVudCBoYW5kbGVyLlxuICAgICAqIEBwYXJhbSB7Kn0gW2FyZzNdIC0gVGhpcmQgYXJndW1lbnQgdGhhdCBpcyBwYXNzZWQgdG8gdGhlIGV2ZW50IGhhbmRsZXIuXG4gICAgICogQHBhcmFtIHsqfSBbYXJnNF0gLSBGb3VydGggYXJndW1lbnQgdGhhdCBpcyBwYXNzZWQgdG8gdGhlIGV2ZW50IGhhbmRsZXIuXG4gICAgICogQHBhcmFtIHsqfSBbYXJnNV0gLSBGaWZ0aCBhcmd1bWVudCB0aGF0IGlzIHBhc3NlZCB0byB0aGUgZXZlbnQgaGFuZGxlci5cbiAgICAgKiBAcGFyYW0geyp9IFthcmc2XSAtIFNpeHRoIGFyZ3VtZW50IHRoYXQgaXMgcGFzc2VkIHRvIHRoZSBldmVudCBoYW5kbGVyLlxuICAgICAqIEBwYXJhbSB7Kn0gW2FyZzddIC0gU2V2ZW50aCBhcmd1bWVudCB0aGF0IGlzIHBhc3NlZCB0byB0aGUgZXZlbnQgaGFuZGxlci5cbiAgICAgKiBAcGFyYW0geyp9IFthcmc4XSAtIEVpZ2h0aCBhcmd1bWVudCB0aGF0IGlzIHBhc3NlZCB0byB0aGUgZXZlbnQgaGFuZGxlci5cbiAgICAgKiBAcmV0dXJucyB7RXZlbnRIYW5kbGVyfSBTZWxmIGZvciBjaGFpbmluZy5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIG9iai5maXJlKCd0ZXN0JywgJ1RoaXMgaXMgdGhlIG1lc3NhZ2UnKTtcbiAgICAgKi9cbiAgICBmaXJlKG5hbWUsIGFyZzEsIGFyZzIsIGFyZzMsIGFyZzQsIGFyZzUsIGFyZzYsIGFyZzcsIGFyZzgpIHtcbiAgICAgICAgaWYgKCFuYW1lKVxuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG5cbiAgICAgICAgY29uc3QgY2FsbGJhY2tzSW5pdGlhbCA9IHRoaXMuX2NhbGxiYWNrcy5nZXQobmFtZSk7XG4gICAgICAgIGlmICghY2FsbGJhY2tzSW5pdGlhbClcbiAgICAgICAgICAgIHJldHVybiB0aGlzO1xuXG4gICAgICAgIGxldCBjYWxsYmFja3M7XG5cbiAgICAgICAgaWYgKCF0aGlzLl9jYWxsYmFja0FjdGl2ZS5oYXMobmFtZSkpIHtcbiAgICAgICAgICAgIC8vIHdoZW4gc3RhcnRpbmcgY2FsbGJhY2tzIGV4ZWN1dGlvbiBlbnN1cmUgd2Ugc3RvcmUgYSBsaXN0IG9mIGluaXRpYWwgY2FsbGJhY2tzXG4gICAgICAgICAgICB0aGlzLl9jYWxsYmFja0FjdGl2ZS5zZXQobmFtZSwgY2FsbGJhY2tzSW5pdGlhbCk7XG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5fY2FsbGJhY2tBY3RpdmUuZ2V0KG5hbWUpICE9PSBjYWxsYmFja3NJbml0aWFsKSB7XG4gICAgICAgICAgICAvLyBpZiB3ZSBhcmUgdHJ5aW5nIHRvIGV4ZWN1dGUgYSBjYWxsYmFjayB3aGlsZSB0aGVyZSBpcyBhbiBhY3RpdmUgZXhlY3V0aW9uIHJpZ2h0IG5vd1xuICAgICAgICAgICAgLy8gYW5kIHRoZSBhY3RpdmUgbGlzdCBoYXMgYmVlbiBhbHJlYWR5IG1vZGlmaWVkLFxuICAgICAgICAgICAgLy8gdGhlbiB3ZSBnbyB0byBhbiB1bm9wdGltaXplZCBwYXRoIGFuZCBjbG9uZSBjYWxsYmFja3MgbGlzdCB0byBlbnN1cmUgZXhlY3V0aW9uIGNvbnNpc3RlbmN5XG4gICAgICAgICAgICBjYWxsYmFja3MgPSBjYWxsYmFja3NJbml0aWFsLnNsaWNlKCk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tdW5tb2RpZmllZC1sb29wLWNvbmRpdGlvblxuICAgICAgICBmb3IgKGxldCBpID0gMDsgKGNhbGxiYWNrcyB8fCB0aGlzLl9jYWxsYmFja0FjdGl2ZS5nZXQobmFtZSkpICYmIChpIDwgKGNhbGxiYWNrcyB8fCB0aGlzLl9jYWxsYmFja0FjdGl2ZS5nZXQobmFtZSkpLmxlbmd0aCk7IGkrKykge1xuICAgICAgICAgICAgY29uc3QgZXZ0ID0gKGNhbGxiYWNrcyB8fCB0aGlzLl9jYWxsYmFja0FjdGl2ZS5nZXQobmFtZSkpW2ldO1xuICAgICAgICAgICAgaWYgKCFldnQuY2FsbGJhY2spIGNvbnRpbnVlO1xuXG4gICAgICAgICAgICBldnQuY2FsbGJhY2suY2FsbChldnQuc2NvcGUsIGFyZzEsIGFyZzIsIGFyZzMsIGFyZzQsIGFyZzUsIGFyZzYsIGFyZzcsIGFyZzgpO1xuXG4gICAgICAgICAgICBpZiAoZXZ0Ll9vbmNlKSB7XG4gICAgICAgICAgICAgICAgLy8gY2hlY2sgdGhhdCBjYWxsYmFjayBzdGlsbCBleGlzdHMgYmVjYXVzZSB1c2VyIG1heSBoYXZlIHVuc3Vic2NyaWJlZCBpbiB0aGUgZXZlbnQgaGFuZGxlclxuICAgICAgICAgICAgICAgIGNvbnN0IGV4aXN0aW5nQ2FsbGJhY2sgPSB0aGlzLl9jYWxsYmFja3MuZ2V0KG5hbWUpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGluZCA9IGV4aXN0aW5nQ2FsbGJhY2sgPyBleGlzdGluZ0NhbGxiYWNrLmluZGV4T2YoZXZ0KSA6IC0xO1xuXG4gICAgICAgICAgICAgICAgaWYgKGluZCAhPT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuX2NhbGxiYWNrQWN0aXZlLmdldChuYW1lKSA9PT0gZXhpc3RpbmdDYWxsYmFjaylcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX2NhbGxiYWNrQWN0aXZlLnNldChuYW1lLCB0aGlzLl9jYWxsYmFja0FjdGl2ZS5nZXQobmFtZSkuc2xpY2UoKSk7XG5cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY2FsbGJhY2tzID0gdGhpcy5fY2FsbGJhY2tzLmdldChuYW1lKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFjYWxsYmFja3MpIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgICAgICBjYWxsYmFja3NbaW5kXS5yZW1vdmVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2tzLnNwbGljZShpbmQsIDEpO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChjYWxsYmFja3MubGVuZ3RoID09PSAwKVxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fY2FsbGJhY2tzLmRlbGV0ZShuYW1lKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIWNhbGxiYWNrcylcbiAgICAgICAgICAgIHRoaXMuX2NhbGxiYWNrQWN0aXZlLmRlbGV0ZShuYW1lKTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUZXN0IGlmIHRoZXJlIGFyZSBhbnkgaGFuZGxlcnMgYm91bmQgdG8gYW4gZXZlbnQgbmFtZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lIC0gVGhlIG5hbWUgb2YgdGhlIGV2ZW50IHRvIHRlc3QuXG4gICAgICogQHJldHVybnMge2Jvb2xlYW59IFRydWUgaWYgdGhlIG9iamVjdCBoYXMgaGFuZGxlcnMgYm91bmQgdG8gdGhlIHNwZWNpZmllZCBldmVudCBuYW1lLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogb2JqLm9uKCd0ZXN0JywgZnVuY3Rpb24gKCkgeyB9KTsgLy8gYmluZCBhbiBldmVudCB0byAndGVzdCdcbiAgICAgKiBvYmouaGFzRXZlbnQoJ3Rlc3QnKTsgLy8gcmV0dXJucyB0cnVlXG4gICAgICogb2JqLmhhc0V2ZW50KCdoZWxsbycpOyAvLyByZXR1cm5zIGZhbHNlXG4gICAgICovXG4gICAgaGFzRXZlbnQobmFtZSkge1xuICAgICAgICByZXR1cm4gISF0aGlzLl9jYWxsYmFja3MuZ2V0KG5hbWUpPy5sZW5ndGg7XG4gICAgfVxufVxuXG5leHBvcnQgeyBFdmVudEhhbmRsZXIgfTtcbiJdLCJuYW1lcyI6WyJFdmVudEhhbmRsZXIiLCJjb25zdHJ1Y3RvciIsIl9jYWxsYmFja3MiLCJNYXAiLCJfY2FsbGJhY2tBY3RpdmUiLCJpbml0RXZlbnRIYW5kbGVyIiwiX2FkZENhbGxiYWNrIiwibmFtZSIsImNhbGxiYWNrIiwic2NvcGUiLCJvbmNlIiwiY29uc29sZSIsIndhcm4iLCJoYXMiLCJzZXQiLCJjYWxsYmFja0FjdGl2ZSIsImdldCIsInNsaWNlIiwiZXZ0IiwiRXZlbnRIYW5kbGUiLCJwdXNoIiwib24iLCJvZmYiLCJrZXkiLCJjYWxsYmFja3MiLCJ2YWx1ZXMiLCJpIiwibGVuZ3RoIiwicmVtb3ZlZCIsImNsZWFyIiwiZGVsZXRlIiwic3BsaWNlIiwiZmlyZSIsImFyZzEiLCJhcmcyIiwiYXJnMyIsImFyZzQiLCJhcmc1IiwiYXJnNiIsImFyZzciLCJhcmc4IiwiY2FsbGJhY2tzSW5pdGlhbCIsImNhbGwiLCJfb25jZSIsImV4aXN0aW5nQ2FsbGJhY2siLCJpbmQiLCJpbmRleE9mIiwiaGFzRXZlbnQiLCJfdGhpcyRfY2FsbGJhY2tzJGdldCJdLCJtYXBwaW5ncyI6Ijs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FB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
