import { Debug } from '../../../core/debug.js';
import { DISTANCE_LINEAR } from '../../../platform/audio/constants.js';
import { Component } from '../component.js';
import { SoundSlot } from './slot.js';

/**
 * The Sound Component controls playback of {@link Sound}s.
 *
 * @augments Component
 * @category Sound
 */
class SoundComponent extends Component {
  /**
   * Create a new Sound Component.
   *
   * @param {import('./system.js').SoundComponentSystem} system - The ComponentSystem that
   * created this component.
   * @param {import('../../entity.js').Entity} entity - The entity that the Component is attached
   * to.
   */
  constructor(system, entity) {
    super(system, entity);

    /** @private */
    this._volume = 1;
    /** @private */
    this._pitch = 1;
    /** @private */
    this._positional = true;
    /** @private */
    this._refDistance = 1;
    /** @private */
    this._maxDistance = 10000;
    /** @private */
    this._rollOffFactor = 1;
    /** @private */
    this._distanceModel = DISTANCE_LINEAR;

    /**
     * @type {Object<string, SoundSlot>}
     * @private
     */
    this._slots = {};

    /** @private */
    this._playingBeforeDisable = {};
  }

  /**
   * Fired when a sound instance starts playing.
   *
   * @event SoundComponent#play
   * @param {SoundSlot} slot - The slot whose instance started playing.
   * @param {import('../../../platform/sound/instance.js').SoundInstance} instance - The instance
   * that started playing.
   */

  /**
   * Fired when a sound instance is paused.
   *
   * @event SoundComponent#pause
   * @param {SoundSlot} slot - The slot whose instance was paused.
   * @param {import('../../../platform/sound/instance.js').SoundInstance} instance - The instance
   * that was paused created to play the sound.
   */

  /**
   * Fired when a sound instance is resumed.
   *
   * @event SoundComponent#resume
   * @param {SoundSlot} slot - The slot whose instance was resumed.
   * @param {import('../../../platform/sound/instance.js').SoundInstance} instance - The instance
   * that was resumed.
   */

  /**
   * Fired when a sound instance is stopped.
   *
   * @event SoundComponent#stop
   * @param {SoundSlot} slot - The slot whose instance was stopped.
   * @param {import('../../../platform/sound/instance.js').SoundInstance} instance - The instance
   * that was stopped.
   */

  /**
   * Fired when a sound instance stops playing because it reached its ending.
   *
   * @event SoundComponent#end
   * @param {SoundSlot} slot - The slot whose instance ended.
   * @param {import('../../../platform/sound/instance.js').SoundInstance} instance - The instance
   * that ended.
   */

  /**
   * Update the specified property on all sound instances.
   *
   * @param {string} property - The name of the SoundInstance property to update.
   * @param {string|number} value - The value to set the property to.
   * @param {boolean} isFactor - True if the value is a factor of the slot property or false
   * if it is an absolute value.
   * @private
   */
  _updateSoundInstances(property, value, isFactor) {
    const slots = this._slots;
    for (const key in slots) {
      const slot = slots[key];
      // only change value of non-overlapping instances
      if (!slot.overlap) {
        const instances = slot.instances;
        for (let i = 0, len = instances.length; i < len; i++) {
          instances[i][property] = isFactor ? slot[property] * value : value;
        }
      }
    }
  }

  /**
   * Determines which algorithm to use to reduce the volume of the sound as it moves away from
   * the listener. Can be:
   *
   * - {@link DISTANCE_LINEAR}
   * - {@link DISTANCE_INVERSE}
   * - {@link DISTANCE_EXPONENTIAL}
   *
   * Defaults to {@link DISTANCE_LINEAR}.
   *
   * @type {string}
   */
  set distanceModel(value) {
    this._distanceModel = value;
    this._updateSoundInstances('distanceModel', value, false);
  }
  get distanceModel() {
    return this._distanceModel;
  }

  /**
   * The maximum distance from the listener at which audio falloff stops. Note the volume of the
   * audio is not 0 after this distance, but just doesn't fall off anymore. Defaults to 10000.
   *
   * @type {number}
   */
  set maxDistance(value) {
    this._maxDistance = value;
    this._updateSoundInstances('maxDistance', value, false);
  }
  get maxDistance() {
    return this._maxDistance;
  }

  /**
   * The reference distance for reducing volume as the sound source moves further from the
   * listener. Defaults to 1.
   *
   * @type {number}
   */
  set refDistance(value) {
    this._refDistance = value;
    this._updateSoundInstances('refDistance', value, false);
  }
  get refDistance() {
    return this._refDistance;
  }

  /**
   * The factor used in the falloff equation. Defaults to 1.
   *
   * @type {number}
   */
  set rollOffFactor(value) {
    this._rollOffFactor = value;
    this._updateSoundInstances('rollOffFactor', value, false);
  }
  get rollOffFactor() {
    return this._rollOffFactor;
  }

  /**
   * The pitch modifier to play the audio with. Must be larger than 0.01. Defaults to 1.
   *
   * @type {number}
   */
  set pitch(value) {
    this._pitch = value;
    this._updateSoundInstances('pitch', value, true);
  }
  get pitch() {
    return this._pitch;
  }

  /**
   * The volume modifier to play the audio with. In range 0-1. Defaults to 1.
   *
   * @type {number}
   */
  set volume(value) {
    this._volume = value;
    this._updateSoundInstances('volume', value, true);
  }
  get volume() {
    return this._volume;
  }

  /**
   * If true the audio will play back at the location of the Entity in space, so the audio will
   * be affected by the position of the {@link AudioListenerComponent}. Defaults to true.
   *
   * @type {boolean}
   */
  set positional(newValue) {
    this._positional = newValue;
    const slots = this._slots;
    for (const key in slots) {
      const slot = slots[key];
      // recreate non overlapping sounds
      if (!slot.overlap) {
        const instances = slot.instances;
        const oldLength = instances.length;

        // When the instance is stopped, it gets removed from the slot.instances array
        // so we are going backwards to compensate for that

        for (let i = oldLength - 1; i >= 0; i--) {
          const isPlaying = instances[i].isPlaying || instances[i].isSuspended;
          const currentTime = instances[i].currentTime;
          if (isPlaying) instances[i].stop();
          const instance = slot._createInstance();
          if (isPlaying) {
            instance.play();
            instance.currentTime = currentTime;
          }
          instances.push(instance);
        }
      }
    }
  }
  get positional() {
    return this._positional;
  }

  /**
   * A dictionary that contains the {@link SoundSlot}s managed by this SoundComponent.
   *
   * @type {Object<string, SoundSlot>}
   */
  set slots(newValue) {
    const oldValue = this._slots;

    // stop previous slots
    if (oldValue) {
      for (const key in oldValue) {
        oldValue[key].stop();
      }
    }
    const slots = {};

    // convert data to slots
    for (const key in newValue) {
      if (!(newValue[key] instanceof SoundSlot)) {
        if (newValue[key].name) {
          slots[newValue[key].name] = new SoundSlot(this, newValue[key].name, newValue[key]);
        }
      } else {
        slots[newValue[key].name] = newValue[key];
      }
    }
    this._slots = slots;

    // call onEnable in order to start autoPlay slots
    if (this.enabled && this.entity.enabled) this.onEnable();
  }
  get slots() {
    return this._slots;
  }
  onEnable() {
    // do not run if running in Editor
    if (this.system._inTools) {
      return;
    }
    const slots = this._slots;
    const playingBeforeDisable = this._playingBeforeDisable;
    for (const key in slots) {
      const slot = slots[key];
      // play if autoPlay is true or
      // if the slot was paused when the component
      // got disabled
      if (slot.autoPlay && slot.isStopped) {
        slot.play();
      } else if (playingBeforeDisable[key]) {
        slot.resume();
      } else if (!slot.isLoaded) {
        // start loading slots
        slot.load();
      }
    }
  }
  onDisable() {
    const slots = this._slots;
    const playingBeforeDisable = {};
    for (const key in slots) {
      // pause non-overlapping sounds
      if (!slots[key].overlap) {
        if (slots[key].isPlaying) {
          slots[key].pause();
          // remember sounds playing when we disable
          // so we can resume them on enable
          playingBeforeDisable[key] = true;
        }
      }
    }
    this._playingBeforeDisable = playingBeforeDisable;
  }
  onRemove() {
    this.off();
  }

  /**
   * Creates a new {@link SoundSlot} with the specified name.
   *
   * @param {string} name - The name of the slot.
   * @param {object} [options] - Settings for the slot.
   * @param {number} [options.volume] - The playback volume, between 0 and 1. Defaults to 1.
   * @param {number} [options.pitch] - The relative pitch. Defaults to 1 (plays at normal pitch).
   * @param {boolean} [options.loop] - If true the sound will restart when it reaches the end.
   * Defaults to false.
   * @param {number} [options.startTime] - The start time from which the sound will start playing.
   * Defaults to 0 to start at the beginning.
   * @param {number} [options.duration] - The duration of the sound that the slot will play
   * starting from startTime. Defaults to `null` which means play to end of the sound.
   * @param {boolean} [options.overlap] - If true then sounds played from slot will be played
   * independently of each other. Otherwise the slot will first stop the current sound before
   * starting the new one. Defaults to false.
   * @param {boolean} [options.autoPlay] - If true the slot will start playing as soon as its
   * audio asset is loaded. Defaults to false.
   * @param {number} [options.asset] - The asset id of the audio asset that is going to be played
   * by this slot.
   * @returns {SoundSlot|null} The new slot or null if the slot already exists.
   * @example
   * // get an asset by id
   * const asset = app.assets.get(10);
   * // add a slot
   * this.entity.sound.addSlot('beep', {
   *     asset: asset
   * });
   * // play
   * this.entity.sound.play('beep');
   */
  addSlot(name, options) {
    const slots = this._slots;
    if (slots[name]) {
      Debug.warn(`A sound slot with name ${name} already exists on Entity ${this.entity.path}`);
      return null;
    }
    const slot = new SoundSlot(this, name, options);
    slots[name] = slot;
    if (slot.autoPlay && this.enabled && this.entity.enabled) {
      slot.play();
    }
    return slot;
  }

  /**
   * Removes the {@link SoundSlot} with the specified name.
   *
   * @param {string} name - The name of the slot.
   * @example
   * // remove a slot called 'beep'
   * this.entity.sound.removeSlot('beep');
   */
  removeSlot(name) {
    const slots = this._slots;
    if (slots[name]) {
      slots[name].stop();
      delete slots[name];
    }
  }

  /**
   * Returns the slot with the specified name.
   *
   * @param {string} name - The name of the slot.
   * @returns {SoundSlot|undefined} The slot.
   * @example
   * // get a slot and set its volume
   * this.entity.sound.slot('beep').volume = 0.5;
   *
   */
  slot(name) {
    return this._slots[name];
  }

  /**
   * Return a property from the slot with the specified name.
   *
   * @param {string} name - The name of the {@link SoundSlot} to look for.
   * @param {string} property - The name of the property to look for.
   * @returns {*} The value from the looked property inside the slot with specified name. May be undefined if slot does not exist.
   * @private
   */
  _getSlotProperty(name, property) {
    if (!this.enabled || !this.entity.enabled) {
      return undefined;
    }
    const slot = this._slots[name];
    if (!slot) {
      Debug.warn(`Trying to get ${property} from sound slot with name ${name} which does not exist`);
      return undefined;
    }
    return slot[property];
  }

  /**
   * Returns true if the slot with the specified name is currently playing.
   *
   * @param {string} name - The name of the {@link SoundSlot} to look for.
   * @returns {boolean} True if the slot with the specified name exists and is currently playing.
   */
  isPlaying(name) {
    return this._getSlotProperty(name, 'isPlaying') || false;
  }

  /**
   * Returns true if the asset of the slot with the specified name is loaded..
   *
   * @param {string} name - The name of the {@link SoundSlot} to look for.
   * @returns {boolean} True if the slot with the specified name exists and its asset is loaded.
   */
  isLoaded(name) {
    return this._getSlotProperty(name, 'isLoaded') || false;
  }

  /**
   * Returns true if the slot with the specified name is currently paused.
   *
   * @param {string} name - The name of the {@link SoundSlot} to look for.
   * @returns {boolean} True if the slot with the specified name exists and is currently paused.
   */
  isPaused(name) {
    return this._getSlotProperty(name, 'isPaused') || false;
  }

  /**
   * Returns true if the slot with the specified name is currently stopped.
   *
   * @param {string} name - The name of the {@link SoundSlot} to look for.
   * @returns {boolean} True if the slot with the specified name exists and is currently stopped.
   */
  isStopped(name) {
    return this._getSlotProperty(name, 'isStopped') || false;
  }

  /**
   * Begins playing the sound slot with the specified name. The slot will restart playing if it
   * is already playing unless the overlap field is true in which case a new sound will be
   * created and played.
   *
   * @param {string} name - The name of the {@link SoundSlot} to play.
   * @returns {import('../../../platform/sound/instance.js').SoundInstance|null} The sound
   * instance that will be played. Returns null if the component or its parent entity is disabled
   * or if the SoundComponent has no slot with the specified name.
   * @example
   * // get asset by id
   * const asset = app.assets.get(10);
   * // create a slot and play it
   * this.entity.sound.addSlot('beep', {
   *     asset: asset
   * });
   * this.entity.sound.play('beep');
   */
  play(name) {
    if (!this.enabled || !this.entity.enabled) {
      return null;
    }
    const slot = this._slots[name];
    if (!slot) {
      Debug.warn(`Trying to play sound slot with name ${name} which does not exist`);
      return null;
    }
    return slot.play();
  }

  /**
   * Pauses playback of the slot with the specified name. If the name is undefined then all slots
   * currently played will be paused. The slots can be resumed by calling {@link SoundComponent#resume}.
   *
   * @param {string} [name] - The name of the slot to pause. Leave undefined to pause everything.
   * @example
   * // pause all sounds
   * this.entity.sound.pause();
   * // pause a specific sound
   * this.entity.sound.pause('beep');
   */
  pause(name) {
    const slots = this._slots;
    if (name) {
      const slot = slots[name];
      if (!slot) {
        Debug.warn(`Trying to pause sound slot with name ${name} which does not exist`);
        return;
      }
      slot.pause();
    } else {
      for (const key in slots) {
        slots[key].pause();
      }
    }
  }

  /**
   * Resumes playback of the sound slot with the specified name if it's paused. If no name is
   * specified all slots will be resumed.
   *
   * @param {string} [name] - The name of the slot to resume. Leave undefined to resume everything.
   * @example
   * // resume all sounds
   * this.entity.sound.resume();
   * // resume a specific sound
   * this.entity.sound.resume('beep');
   */
  resume(name) {
    const slots = this._slots;
    if (name) {
      const slot = slots[name];
      if (!slot) {
        Debug.warn(`Trying to resume sound slot with name ${name} which does not exist`);
        return;
      }
      if (slot.isPaused) {
        slot.resume();
      }
    } else {
      for (const key in slots) {
        slots[key].resume();
      }
    }
  }

  /**
   * Stops playback of the sound slot with the specified name if it's paused. If no name is
   * specified all slots will be stopped.
   *
   * @param {string} [name] - The name of the slot to stop. Leave undefined to stop everything.
   * @example
   * // stop all sounds
   * this.entity.sound.stop();
   * // stop a specific sound
   * this.entity.sound.stop('beep');
   */
  stop(name) {
    const slots = this._slots;
    if (name) {
      const slot = slots[name];
      if (!slot) {
        Debug.warn(`Trying to stop sound slot with name ${name} which does not exist`);
        return;
      }
      slot.stop();
    } else {
      for (const key in slots) {
        slots[key].stop();
      }
    }
  }
}

export { SoundComponent };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tcG9uZW50LmpzIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi9zcmMvZnJhbWV3b3JrL2NvbXBvbmVudHMvc291bmQvY29tcG9uZW50LmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IERlYnVnIH0gZnJvbSAnLi4vLi4vLi4vY29yZS9kZWJ1Zy5qcyc7XG5cbmltcG9ydCB7IERJU1RBTkNFX0xJTkVBUiB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2F1ZGlvL2NvbnN0YW50cy5qcyc7XG5cbmltcG9ydCB7IENvbXBvbmVudCB9IGZyb20gJy4uL2NvbXBvbmVudC5qcyc7XG5cbmltcG9ydCB7IFNvdW5kU2xvdCB9IGZyb20gJy4vc2xvdC5qcyc7XG5cbi8qKlxuICogVGhlIFNvdW5kIENvbXBvbmVudCBjb250cm9scyBwbGF5YmFjayBvZiB7QGxpbmsgU291bmR9cy5cbiAqXG4gKiBAYXVnbWVudHMgQ29tcG9uZW50XG4gKiBAY2F0ZWdvcnkgU291bmRcbiAqL1xuY2xhc3MgU291bmRDb21wb25lbnQgZXh0ZW5kcyBDb21wb25lbnQge1xuICAgIC8qKlxuICAgICAqIENyZWF0ZSBhIG5ldyBTb3VuZCBDb21wb25lbnQuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi9zeXN0ZW0uanMnKS5Tb3VuZENvbXBvbmVudFN5c3RlbX0gc3lzdGVtIC0gVGhlIENvbXBvbmVudFN5c3RlbSB0aGF0XG4gICAgICogY3JlYXRlZCB0aGlzIGNvbXBvbmVudC5cbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi4vLi4vZW50aXR5LmpzJykuRW50aXR5fSBlbnRpdHkgLSBUaGUgZW50aXR5IHRoYXQgdGhlIENvbXBvbmVudCBpcyBhdHRhY2hlZFxuICAgICAqIHRvLlxuICAgICAqL1xuICAgIGNvbnN0cnVjdG9yKHN5c3RlbSwgZW50aXR5KSB7XG4gICAgICAgIHN1cGVyKHN5c3RlbSwgZW50aXR5KTtcblxuICAgICAgICAvKiogQHByaXZhdGUgKi9cbiAgICAgICAgdGhpcy5fdm9sdW1lID0gMTtcbiAgICAgICAgLyoqIEBwcml2YXRlICovXG4gICAgICAgIHRoaXMuX3BpdGNoID0gMTtcbiAgICAgICAgLyoqIEBwcml2YXRlICovXG4gICAgICAgIHRoaXMuX3Bvc2l0aW9uYWwgPSB0cnVlO1xuICAgICAgICAvKiogQHByaXZhdGUgKi9cbiAgICAgICAgdGhpcy5fcmVmRGlzdGFuY2UgPSAxO1xuICAgICAgICAvKiogQHByaXZhdGUgKi9cbiAgICAgICAgdGhpcy5fbWF4RGlzdGFuY2UgPSAxMDAwMDtcbiAgICAgICAgLyoqIEBwcml2YXRlICovXG4gICAgICAgIHRoaXMuX3JvbGxPZmZGYWN0b3IgPSAxO1xuICAgICAgICAvKiogQHByaXZhdGUgKi9cbiAgICAgICAgdGhpcy5fZGlzdGFuY2VNb2RlbCA9IERJU1RBTkNFX0xJTkVBUjtcblxuICAgICAgICAvKipcbiAgICAgICAgICogQHR5cGUge09iamVjdDxzdHJpbmcsIFNvdW5kU2xvdD59XG4gICAgICAgICAqIEBwcml2YXRlXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLl9zbG90cyA9IHt9O1xuXG4gICAgICAgIC8qKiBAcHJpdmF0ZSAqL1xuICAgICAgICB0aGlzLl9wbGF5aW5nQmVmb3JlRGlzYWJsZSA9IHt9O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEZpcmVkIHdoZW4gYSBzb3VuZCBpbnN0YW5jZSBzdGFydHMgcGxheWluZy5cbiAgICAgKlxuICAgICAqIEBldmVudCBTb3VuZENvbXBvbmVudCNwbGF5XG4gICAgICogQHBhcmFtIHtTb3VuZFNsb3R9IHNsb3QgLSBUaGUgc2xvdCB3aG9zZSBpbnN0YW5jZSBzdGFydGVkIHBsYXlpbmcuXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4uLy4uLy4uL3BsYXRmb3JtL3NvdW5kL2luc3RhbmNlLmpzJykuU291bmRJbnN0YW5jZX0gaW5zdGFuY2UgLSBUaGUgaW5zdGFuY2VcbiAgICAgKiB0aGF0IHN0YXJ0ZWQgcGxheWluZy5cbiAgICAgKi9cblxuICAgIC8qKlxuICAgICAqIEZpcmVkIHdoZW4gYSBzb3VuZCBpbnN0YW5jZSBpcyBwYXVzZWQuXG4gICAgICpcbiAgICAgKiBAZXZlbnQgU291bmRDb21wb25lbnQjcGF1c2VcbiAgICAgKiBAcGFyYW0ge1NvdW5kU2xvdH0gc2xvdCAtIFRoZSBzbG90IHdob3NlIGluc3RhbmNlIHdhcyBwYXVzZWQuXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4uLy4uLy4uL3BsYXRmb3JtL3NvdW5kL2luc3RhbmNlLmpzJykuU291bmRJbnN0YW5jZX0gaW5zdGFuY2UgLSBUaGUgaW5zdGFuY2VcbiAgICAgKiB0aGF0IHdhcyBwYXVzZWQgY3JlYXRlZCB0byBwbGF5IHRoZSBzb3VuZC5cbiAgICAgKi9cblxuICAgIC8qKlxuICAgICAqIEZpcmVkIHdoZW4gYSBzb3VuZCBpbnN0YW5jZSBpcyByZXN1bWVkLlxuICAgICAqXG4gICAgICogQGV2ZW50IFNvdW5kQ29tcG9uZW50I3Jlc3VtZVxuICAgICAqIEBwYXJhbSB7U291bmRTbG90fSBzbG90IC0gVGhlIHNsb3Qgd2hvc2UgaW5zdGFuY2Ugd2FzIHJlc3VtZWQuXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4uLy4uLy4uL3BsYXRmb3JtL3NvdW5kL2luc3RhbmNlLmpzJykuU291bmRJbnN0YW5jZX0gaW5zdGFuY2UgLSBUaGUgaW5zdGFuY2VcbiAgICAgKiB0aGF0IHdhcyByZXN1bWVkLlxuICAgICAqL1xuXG4gICAgLyoqXG4gICAgICogRmlyZWQgd2hlbiBhIHNvdW5kIGluc3RhbmNlIGlzIHN0b3BwZWQuXG4gICAgICpcbiAgICAgKiBAZXZlbnQgU291bmRDb21wb25lbnQjc3RvcFxuICAgICAqIEBwYXJhbSB7U291bmRTbG90fSBzbG90IC0gVGhlIHNsb3Qgd2hvc2UgaW5zdGFuY2Ugd2FzIHN0b3BwZWQuXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4uLy4uLy4uL3BsYXRmb3JtL3NvdW5kL2luc3RhbmNlLmpzJykuU291bmRJbnN0YW5jZX0gaW5zdGFuY2UgLSBUaGUgaW5zdGFuY2VcbiAgICAgKiB0aGF0IHdhcyBzdG9wcGVkLlxuICAgICAqL1xuXG4gICAgLyoqXG4gICAgICogRmlyZWQgd2hlbiBhIHNvdW5kIGluc3RhbmNlIHN0b3BzIHBsYXlpbmcgYmVjYXVzZSBpdCByZWFjaGVkIGl0cyBlbmRpbmcuXG4gICAgICpcbiAgICAgKiBAZXZlbnQgU291bmRDb21wb25lbnQjZW5kXG4gICAgICogQHBhcmFtIHtTb3VuZFNsb3R9IHNsb3QgLSBUaGUgc2xvdCB3aG9zZSBpbnN0YW5jZSBlbmRlZC5cbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi4vLi4vLi4vcGxhdGZvcm0vc291bmQvaW5zdGFuY2UuanMnKS5Tb3VuZEluc3RhbmNlfSBpbnN0YW5jZSAtIFRoZSBpbnN0YW5jZVxuICAgICAqIHRoYXQgZW5kZWQuXG4gICAgICovXG5cbiAgICAvKipcbiAgICAgKiBVcGRhdGUgdGhlIHNwZWNpZmllZCBwcm9wZXJ0eSBvbiBhbGwgc291bmQgaW5zdGFuY2VzLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IHByb3BlcnR5IC0gVGhlIG5hbWUgb2YgdGhlIFNvdW5kSW5zdGFuY2UgcHJvcGVydHkgdG8gdXBkYXRlLlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfG51bWJlcn0gdmFsdWUgLSBUaGUgdmFsdWUgdG8gc2V0IHRoZSBwcm9wZXJ0eSB0by5cbiAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IGlzRmFjdG9yIC0gVHJ1ZSBpZiB0aGUgdmFsdWUgaXMgYSBmYWN0b3Igb2YgdGhlIHNsb3QgcHJvcGVydHkgb3IgZmFsc2VcbiAgICAgKiBpZiBpdCBpcyBhbiBhYnNvbHV0ZSB2YWx1ZS5cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF91cGRhdGVTb3VuZEluc3RhbmNlcyhwcm9wZXJ0eSwgdmFsdWUsIGlzRmFjdG9yKSB7XG4gICAgICAgIGNvbnN0IHNsb3RzID0gdGhpcy5fc2xvdHM7XG4gICAgICAgIGZvciAoY29uc3Qga2V5IGluIHNsb3RzKSB7XG4gICAgICAgICAgICBjb25zdCBzbG90ID0gc2xvdHNba2V5XTtcbiAgICAgICAgICAgIC8vIG9ubHkgY2hhbmdlIHZhbHVlIG9mIG5vbi1vdmVybGFwcGluZyBpbnN0YW5jZXNcbiAgICAgICAgICAgIGlmICghc2xvdC5vdmVybGFwKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgaW5zdGFuY2VzID0gc2xvdC5pbnN0YW5jZXM7XG4gICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDAsIGxlbiA9IGluc3RhbmNlcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuICAgICAgICAgICAgICAgICAgICBpbnN0YW5jZXNbaV1bcHJvcGVydHldID0gaXNGYWN0b3IgPyBzbG90W3Byb3BlcnR5XSAqIHZhbHVlIDogdmFsdWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRGV0ZXJtaW5lcyB3aGljaCBhbGdvcml0aG0gdG8gdXNlIHRvIHJlZHVjZSB0aGUgdm9sdW1lIG9mIHRoZSBzb3VuZCBhcyBpdCBtb3ZlcyBhd2F5IGZyb21cbiAgICAgKiB0aGUgbGlzdGVuZXIuIENhbiBiZTpcbiAgICAgKlxuICAgICAqIC0ge0BsaW5rIERJU1RBTkNFX0xJTkVBUn1cbiAgICAgKiAtIHtAbGluayBESVNUQU5DRV9JTlZFUlNFfVxuICAgICAqIC0ge0BsaW5rIERJU1RBTkNFX0VYUE9ORU5USUFMfVxuICAgICAqXG4gICAgICogRGVmYXVsdHMgdG8ge0BsaW5rIERJU1RBTkNFX0xJTkVBUn0uXG4gICAgICpcbiAgICAgKiBAdHlwZSB7c3RyaW5nfVxuICAgICAqL1xuICAgIHNldCBkaXN0YW5jZU1vZGVsKHZhbHVlKSB7XG4gICAgICAgIHRoaXMuX2Rpc3RhbmNlTW9kZWwgPSB2YWx1ZTtcbiAgICAgICAgdGhpcy5fdXBkYXRlU291bmRJbnN0YW5jZXMoJ2Rpc3RhbmNlTW9kZWwnLCB2YWx1ZSwgZmFsc2UpO1xuICAgIH1cblxuICAgIGdldCBkaXN0YW5jZU1vZGVsKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fZGlzdGFuY2VNb2RlbDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUaGUgbWF4aW11bSBkaXN0YW5jZSBmcm9tIHRoZSBsaXN0ZW5lciBhdCB3aGljaCBhdWRpbyBmYWxsb2ZmIHN0b3BzLiBOb3RlIHRoZSB2b2x1bWUgb2YgdGhlXG4gICAgICogYXVkaW8gaXMgbm90IDAgYWZ0ZXIgdGhpcyBkaXN0YW5jZSwgYnV0IGp1c3QgZG9lc24ndCBmYWxsIG9mZiBhbnltb3JlLiBEZWZhdWx0cyB0byAxMDAwMC5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtudW1iZXJ9XG4gICAgICovXG4gICAgc2V0IG1heERpc3RhbmNlKHZhbHVlKSB7XG4gICAgICAgIHRoaXMuX21heERpc3RhbmNlID0gdmFsdWU7XG4gICAgICAgIHRoaXMuX3VwZGF0ZVNvdW5kSW5zdGFuY2VzKCdtYXhEaXN0YW5jZScsIHZhbHVlLCBmYWxzZSk7XG4gICAgfVxuXG4gICAgZ2V0IG1heERpc3RhbmNlKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fbWF4RGlzdGFuY2U7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVGhlIHJlZmVyZW5jZSBkaXN0YW5jZSBmb3IgcmVkdWNpbmcgdm9sdW1lIGFzIHRoZSBzb3VuZCBzb3VyY2UgbW92ZXMgZnVydGhlciBmcm9tIHRoZVxuICAgICAqIGxpc3RlbmVyLiBEZWZhdWx0cyB0byAxLlxuICAgICAqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKi9cbiAgICBzZXQgcmVmRGlzdGFuY2UodmFsdWUpIHtcbiAgICAgICAgdGhpcy5fcmVmRGlzdGFuY2UgPSB2YWx1ZTtcbiAgICAgICAgdGhpcy5fdXBkYXRlU291bmRJbnN0YW5jZXMoJ3JlZkRpc3RhbmNlJywgdmFsdWUsIGZhbHNlKTtcbiAgICB9XG5cbiAgICBnZXQgcmVmRGlzdGFuY2UoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9yZWZEaXN0YW5jZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUaGUgZmFjdG9yIHVzZWQgaW4gdGhlIGZhbGxvZmYgZXF1YXRpb24uIERlZmF1bHRzIHRvIDEuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqL1xuICAgIHNldCByb2xsT2ZmRmFjdG9yKHZhbHVlKSB7XG4gICAgICAgIHRoaXMuX3JvbGxPZmZGYWN0b3IgPSB2YWx1ZTtcbiAgICAgICAgdGhpcy5fdXBkYXRlU291bmRJbnN0YW5jZXMoJ3JvbGxPZmZGYWN0b3InLCB2YWx1ZSwgZmFsc2UpO1xuICAgIH1cblxuICAgIGdldCByb2xsT2ZmRmFjdG9yKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fcm9sbE9mZkZhY3RvcjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUaGUgcGl0Y2ggbW9kaWZpZXIgdG8gcGxheSB0aGUgYXVkaW8gd2l0aC4gTXVzdCBiZSBsYXJnZXIgdGhhbiAwLjAxLiBEZWZhdWx0cyB0byAxLlxuICAgICAqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKi9cbiAgICBzZXQgcGl0Y2godmFsdWUpIHtcbiAgICAgICAgdGhpcy5fcGl0Y2ggPSB2YWx1ZTtcbiAgICAgICAgdGhpcy5fdXBkYXRlU291bmRJbnN0YW5jZXMoJ3BpdGNoJywgdmFsdWUsIHRydWUpO1xuICAgIH1cblxuICAgIGdldCBwaXRjaCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3BpdGNoO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRoZSB2b2x1bWUgbW9kaWZpZXIgdG8gcGxheSB0aGUgYXVkaW8gd2l0aC4gSW4gcmFuZ2UgMC0xLiBEZWZhdWx0cyB0byAxLlxuICAgICAqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKi9cbiAgICBzZXQgdm9sdW1lKHZhbHVlKSB7XG4gICAgICAgIHRoaXMuX3ZvbHVtZSA9IHZhbHVlO1xuICAgICAgICB0aGlzLl91cGRhdGVTb3VuZEluc3RhbmNlcygndm9sdW1lJywgdmFsdWUsIHRydWUpO1xuICAgIH1cblxuICAgIGdldCB2b2x1bWUoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl92b2x1bWU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSWYgdHJ1ZSB0aGUgYXVkaW8gd2lsbCBwbGF5IGJhY2sgYXQgdGhlIGxvY2F0aW9uIG9mIHRoZSBFbnRpdHkgaW4gc3BhY2UsIHNvIHRoZSBhdWRpbyB3aWxsXG4gICAgICogYmUgYWZmZWN0ZWQgYnkgdGhlIHBvc2l0aW9uIG9mIHRoZSB7QGxpbmsgQXVkaW9MaXN0ZW5lckNvbXBvbmVudH0uIERlZmF1bHRzIHRvIHRydWUuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICAgKi9cbiAgICBzZXQgcG9zaXRpb25hbChuZXdWYWx1ZSkge1xuICAgICAgICB0aGlzLl9wb3NpdGlvbmFsID0gbmV3VmFsdWU7XG5cbiAgICAgICAgY29uc3Qgc2xvdHMgPSB0aGlzLl9zbG90cztcbiAgICAgICAgZm9yIChjb25zdCBrZXkgaW4gc2xvdHMpIHtcbiAgICAgICAgICAgIGNvbnN0IHNsb3QgPSBzbG90c1trZXldO1xuICAgICAgICAgICAgLy8gcmVjcmVhdGUgbm9uIG92ZXJsYXBwaW5nIHNvdW5kc1xuICAgICAgICAgICAgaWYgKCFzbG90Lm92ZXJsYXApIHtcbiAgICAgICAgICAgICAgICBjb25zdCBpbnN0YW5jZXMgPSBzbG90Lmluc3RhbmNlcztcbiAgICAgICAgICAgICAgICBjb25zdCBvbGRMZW5ndGggPSBpbnN0YW5jZXMubGVuZ3RoO1xuXG4gICAgICAgICAgICAgICAgLy8gV2hlbiB0aGUgaW5zdGFuY2UgaXMgc3RvcHBlZCwgaXQgZ2V0cyByZW1vdmVkIGZyb20gdGhlIHNsb3QuaW5zdGFuY2VzIGFycmF5XG4gICAgICAgICAgICAgICAgLy8gc28gd2UgYXJlIGdvaW5nIGJhY2t3YXJkcyB0byBjb21wZW5zYXRlIGZvciB0aGF0XG5cbiAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gb2xkTGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaXNQbGF5aW5nID0gaW5zdGFuY2VzW2ldLmlzUGxheWluZyB8fCBpbnN0YW5jZXNbaV0uaXNTdXNwZW5kZWQ7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGN1cnJlbnRUaW1lID0gaW5zdGFuY2VzW2ldLmN1cnJlbnRUaW1lO1xuICAgICAgICAgICAgICAgICAgICBpZiAoaXNQbGF5aW5nKVxuICAgICAgICAgICAgICAgICAgICAgICAgaW5zdGFuY2VzW2ldLnN0b3AoKTtcblxuICAgICAgICAgICAgICAgICAgICBjb25zdCBpbnN0YW5jZSA9IHNsb3QuX2NyZWF0ZUluc3RhbmNlKCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChpc1BsYXlpbmcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGluc3RhbmNlLnBsYXkoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGluc3RhbmNlLmN1cnJlbnRUaW1lID0gY3VycmVudFRpbWU7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBpbnN0YW5jZXMucHVzaChpbnN0YW5jZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2V0IHBvc2l0aW9uYWwoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9wb3NpdGlvbmFsO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEEgZGljdGlvbmFyeSB0aGF0IGNvbnRhaW5zIHRoZSB7QGxpbmsgU291bmRTbG90fXMgbWFuYWdlZCBieSB0aGlzIFNvdW5kQ29tcG9uZW50LlxuICAgICAqXG4gICAgICogQHR5cGUge09iamVjdDxzdHJpbmcsIFNvdW5kU2xvdD59XG4gICAgICovXG4gICAgc2V0IHNsb3RzKG5ld1ZhbHVlKSB7XG4gICAgICAgIGNvbnN0IG9sZFZhbHVlID0gdGhpcy5fc2xvdHM7XG5cbiAgICAgICAgLy8gc3RvcCBwcmV2aW91cyBzbG90c1xuICAgICAgICBpZiAob2xkVmFsdWUpIHtcbiAgICAgICAgICAgIGZvciAoY29uc3Qga2V5IGluIG9sZFZhbHVlKSB7XG4gICAgICAgICAgICAgICAgb2xkVmFsdWVba2V5XS5zdG9wKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBzbG90cyA9IHt9O1xuXG4gICAgICAgIC8vIGNvbnZlcnQgZGF0YSB0byBzbG90c1xuICAgICAgICBmb3IgKGNvbnN0IGtleSBpbiBuZXdWYWx1ZSkge1xuICAgICAgICAgICAgaWYgKCEobmV3VmFsdWVba2V5XSBpbnN0YW5jZW9mIFNvdW5kU2xvdCkpIHtcbiAgICAgICAgICAgICAgICBpZiAobmV3VmFsdWVba2V5XS5uYW1lKSB7XG4gICAgICAgICAgICAgICAgICAgIHNsb3RzW25ld1ZhbHVlW2tleV0ubmFtZV0gPSBuZXcgU291bmRTbG90KHRoaXMsIG5ld1ZhbHVlW2tleV0ubmFtZSwgbmV3VmFsdWVba2V5XSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBzbG90c1tuZXdWYWx1ZVtrZXldLm5hbWVdID0gbmV3VmFsdWVba2V5XTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuX3Nsb3RzID0gc2xvdHM7XG5cbiAgICAgICAgLy8gY2FsbCBvbkVuYWJsZSBpbiBvcmRlciB0byBzdGFydCBhdXRvUGxheSBzbG90c1xuICAgICAgICBpZiAodGhpcy5lbmFibGVkICYmIHRoaXMuZW50aXR5LmVuYWJsZWQpXG4gICAgICAgICAgICB0aGlzLm9uRW5hYmxlKCk7XG4gICAgfVxuXG4gICAgZ2V0IHNsb3RzKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fc2xvdHM7XG4gICAgfVxuXG4gICAgb25FbmFibGUoKSB7XG4gICAgICAgIC8vIGRvIG5vdCBydW4gaWYgcnVubmluZyBpbiBFZGl0b3JcbiAgICAgICAgaWYgKHRoaXMuc3lzdGVtLl9pblRvb2xzKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBzbG90cyA9IHRoaXMuX3Nsb3RzO1xuICAgICAgICBjb25zdCBwbGF5aW5nQmVmb3JlRGlzYWJsZSA9IHRoaXMuX3BsYXlpbmdCZWZvcmVEaXNhYmxlO1xuXG4gICAgICAgIGZvciAoY29uc3Qga2V5IGluIHNsb3RzKSB7XG4gICAgICAgICAgICBjb25zdCBzbG90ID0gc2xvdHNba2V5XTtcbiAgICAgICAgICAgIC8vIHBsYXkgaWYgYXV0b1BsYXkgaXMgdHJ1ZSBvclxuICAgICAgICAgICAgLy8gaWYgdGhlIHNsb3Qgd2FzIHBhdXNlZCB3aGVuIHRoZSBjb21wb25lbnRcbiAgICAgICAgICAgIC8vIGdvdCBkaXNhYmxlZFxuICAgICAgICAgICAgaWYgKHNsb3QuYXV0b1BsYXkgJiYgc2xvdC5pc1N0b3BwZWQpIHtcbiAgICAgICAgICAgICAgICBzbG90LnBsYXkoKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocGxheWluZ0JlZm9yZURpc2FibGVba2V5XSkge1xuICAgICAgICAgICAgICAgIHNsb3QucmVzdW1lKCk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKCFzbG90LmlzTG9hZGVkKSB7XG4gICAgICAgICAgICAgICAgLy8gc3RhcnQgbG9hZGluZyBzbG90c1xuICAgICAgICAgICAgICAgIHNsb3QubG9hZCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgb25EaXNhYmxlKCkge1xuICAgICAgICBjb25zdCBzbG90cyA9IHRoaXMuX3Nsb3RzO1xuICAgICAgICBjb25zdCBwbGF5aW5nQmVmb3JlRGlzYWJsZSA9IHt9O1xuXG4gICAgICAgIGZvciAoY29uc3Qga2V5IGluIHNsb3RzKSB7XG4gICAgICAgICAgICAvLyBwYXVzZSBub24tb3ZlcmxhcHBpbmcgc291bmRzXG4gICAgICAgICAgICBpZiAoIXNsb3RzW2tleV0ub3ZlcmxhcCkge1xuICAgICAgICAgICAgICAgIGlmIChzbG90c1trZXldLmlzUGxheWluZykge1xuICAgICAgICAgICAgICAgICAgICBzbG90c1trZXldLnBhdXNlKCk7XG4gICAgICAgICAgICAgICAgICAgIC8vIHJlbWVtYmVyIHNvdW5kcyBwbGF5aW5nIHdoZW4gd2UgZGlzYWJsZVxuICAgICAgICAgICAgICAgICAgICAvLyBzbyB3ZSBjYW4gcmVzdW1lIHRoZW0gb24gZW5hYmxlXG4gICAgICAgICAgICAgICAgICAgIHBsYXlpbmdCZWZvcmVEaXNhYmxlW2tleV0gPSB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuX3BsYXlpbmdCZWZvcmVEaXNhYmxlID0gcGxheWluZ0JlZm9yZURpc2FibGU7XG4gICAgfVxuXG4gICAgb25SZW1vdmUoKSB7XG4gICAgICAgIHRoaXMub2ZmKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ3JlYXRlcyBhIG5ldyB7QGxpbmsgU291bmRTbG90fSB3aXRoIHRoZSBzcGVjaWZpZWQgbmFtZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lIC0gVGhlIG5hbWUgb2YgdGhlIHNsb3QuXG4gICAgICogQHBhcmFtIHtvYmplY3R9IFtvcHRpb25zXSAtIFNldHRpbmdzIGZvciB0aGUgc2xvdC5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gW29wdGlvbnMudm9sdW1lXSAtIFRoZSBwbGF5YmFjayB2b2x1bWUsIGJldHdlZW4gMCBhbmQgMS4gRGVmYXVsdHMgdG8gMS5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gW29wdGlvbnMucGl0Y2hdIC0gVGhlIHJlbGF0aXZlIHBpdGNoLiBEZWZhdWx0cyB0byAxIChwbGF5cyBhdCBub3JtYWwgcGl0Y2gpLlxuICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gW29wdGlvbnMubG9vcF0gLSBJZiB0cnVlIHRoZSBzb3VuZCB3aWxsIHJlc3RhcnQgd2hlbiBpdCByZWFjaGVzIHRoZSBlbmQuXG4gICAgICogRGVmYXVsdHMgdG8gZmFsc2UuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFtvcHRpb25zLnN0YXJ0VGltZV0gLSBUaGUgc3RhcnQgdGltZSBmcm9tIHdoaWNoIHRoZSBzb3VuZCB3aWxsIHN0YXJ0IHBsYXlpbmcuXG4gICAgICogRGVmYXVsdHMgdG8gMCB0byBzdGFydCBhdCB0aGUgYmVnaW5uaW5nLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBbb3B0aW9ucy5kdXJhdGlvbl0gLSBUaGUgZHVyYXRpb24gb2YgdGhlIHNvdW5kIHRoYXQgdGhlIHNsb3Qgd2lsbCBwbGF5XG4gICAgICogc3RhcnRpbmcgZnJvbSBzdGFydFRpbWUuIERlZmF1bHRzIHRvIGBudWxsYCB3aGljaCBtZWFucyBwbGF5IHRvIGVuZCBvZiB0aGUgc291bmQuXG4gICAgICogQHBhcmFtIHtib29sZWFufSBbb3B0aW9ucy5vdmVybGFwXSAtIElmIHRydWUgdGhlbiBzb3VuZHMgcGxheWVkIGZyb20gc2xvdCB3aWxsIGJlIHBsYXllZFxuICAgICAqIGluZGVwZW5kZW50bHkgb2YgZWFjaCBvdGhlci4gT3RoZXJ3aXNlIHRoZSBzbG90IHdpbGwgZmlyc3Qgc3RvcCB0aGUgY3VycmVudCBzb3VuZCBiZWZvcmVcbiAgICAgKiBzdGFydGluZyB0aGUgbmV3IG9uZS4gRGVmYXVsdHMgdG8gZmFsc2UuXG4gICAgICogQHBhcmFtIHtib29sZWFufSBbb3B0aW9ucy5hdXRvUGxheV0gLSBJZiB0cnVlIHRoZSBzbG90IHdpbGwgc3RhcnQgcGxheWluZyBhcyBzb29uIGFzIGl0c1xuICAgICAqIGF1ZGlvIGFzc2V0IGlzIGxvYWRlZC4gRGVmYXVsdHMgdG8gZmFsc2UuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFtvcHRpb25zLmFzc2V0XSAtIFRoZSBhc3NldCBpZCBvZiB0aGUgYXVkaW8gYXNzZXQgdGhhdCBpcyBnb2luZyB0byBiZSBwbGF5ZWRcbiAgICAgKiBieSB0aGlzIHNsb3QuXG4gICAgICogQHJldHVybnMge1NvdW5kU2xvdHxudWxsfSBUaGUgbmV3IHNsb3Qgb3IgbnVsbCBpZiB0aGUgc2xvdCBhbHJlYWR5IGV4aXN0cy5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIC8vIGdldCBhbiBhc3NldCBieSBpZFxuICAgICAqIGNvbnN0IGFzc2V0ID0gYXBwLmFzc2V0cy5nZXQoMTApO1xuICAgICAqIC8vIGFkZCBhIHNsb3RcbiAgICAgKiB0aGlzLmVudGl0eS5zb3VuZC5hZGRTbG90KCdiZWVwJywge1xuICAgICAqICAgICBhc3NldDogYXNzZXRcbiAgICAgKiB9KTtcbiAgICAgKiAvLyBwbGF5XG4gICAgICogdGhpcy5lbnRpdHkuc291bmQucGxheSgnYmVlcCcpO1xuICAgICAqL1xuICAgIGFkZFNsb3QobmFtZSwgb3B0aW9ucykge1xuICAgICAgICBjb25zdCBzbG90cyA9IHRoaXMuX3Nsb3RzO1xuICAgICAgICBpZiAoc2xvdHNbbmFtZV0pIHtcbiAgICAgICAgICAgIERlYnVnLndhcm4oYEEgc291bmQgc2xvdCB3aXRoIG5hbWUgJHtuYW1lfSBhbHJlYWR5IGV4aXN0cyBvbiBFbnRpdHkgJHt0aGlzLmVudGl0eS5wYXRofWApO1xuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBzbG90ID0gbmV3IFNvdW5kU2xvdCh0aGlzLCBuYW1lLCBvcHRpb25zKTtcbiAgICAgICAgc2xvdHNbbmFtZV0gPSBzbG90O1xuXG4gICAgICAgIGlmIChzbG90LmF1dG9QbGF5ICYmIHRoaXMuZW5hYmxlZCAmJiB0aGlzLmVudGl0eS5lbmFibGVkKSB7XG4gICAgICAgICAgICBzbG90LnBsYXkoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBzbG90O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJlbW92ZXMgdGhlIHtAbGluayBTb3VuZFNsb3R9IHdpdGggdGhlIHNwZWNpZmllZCBuYW1lLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IG5hbWUgLSBUaGUgbmFtZSBvZiB0aGUgc2xvdC5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIC8vIHJlbW92ZSBhIHNsb3QgY2FsbGVkICdiZWVwJ1xuICAgICAqIHRoaXMuZW50aXR5LnNvdW5kLnJlbW92ZVNsb3QoJ2JlZXAnKTtcbiAgICAgKi9cbiAgICByZW1vdmVTbG90KG5hbWUpIHtcbiAgICAgICAgY29uc3Qgc2xvdHMgPSB0aGlzLl9zbG90cztcbiAgICAgICAgaWYgKHNsb3RzW25hbWVdKSB7XG4gICAgICAgICAgICBzbG90c1tuYW1lXS5zdG9wKCk7XG4gICAgICAgICAgICBkZWxldGUgc2xvdHNbbmFtZV07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBzbG90IHdpdGggdGhlIHNwZWNpZmllZCBuYW1lLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IG5hbWUgLSBUaGUgbmFtZSBvZiB0aGUgc2xvdC5cbiAgICAgKiBAcmV0dXJucyB7U291bmRTbG90fHVuZGVmaW5lZH0gVGhlIHNsb3QuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiAvLyBnZXQgYSBzbG90IGFuZCBzZXQgaXRzIHZvbHVtZVxuICAgICAqIHRoaXMuZW50aXR5LnNvdW5kLnNsb3QoJ2JlZXAnKS52b2x1bWUgPSAwLjU7XG4gICAgICpcbiAgICAgKi9cbiAgICBzbG90KG5hbWUpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3Nsb3RzW25hbWVdO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybiBhIHByb3BlcnR5IGZyb20gdGhlIHNsb3Qgd2l0aCB0aGUgc3BlY2lmaWVkIG5hbWUuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gbmFtZSAtIFRoZSBuYW1lIG9mIHRoZSB7QGxpbmsgU291bmRTbG90fSB0byBsb29rIGZvci5cbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gcHJvcGVydHkgLSBUaGUgbmFtZSBvZiB0aGUgcHJvcGVydHkgdG8gbG9vayBmb3IuXG4gICAgICogQHJldHVybnMgeyp9IFRoZSB2YWx1ZSBmcm9tIHRoZSBsb29rZWQgcHJvcGVydHkgaW5zaWRlIHRoZSBzbG90IHdpdGggc3BlY2lmaWVkIG5hbWUuIE1heSBiZSB1bmRlZmluZWQgaWYgc2xvdCBkb2VzIG5vdCBleGlzdC5cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9nZXRTbG90UHJvcGVydHkobmFtZSwgcHJvcGVydHkpIHtcbiAgICAgICAgaWYgKCF0aGlzLmVuYWJsZWQgfHwgIXRoaXMuZW50aXR5LmVuYWJsZWQpIHtcbiAgICAgICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBzbG90ID0gdGhpcy5fc2xvdHNbbmFtZV07XG4gICAgICAgIGlmICghc2xvdCkge1xuICAgICAgICAgICAgRGVidWcud2FybihgVHJ5aW5nIHRvIGdldCAke3Byb3BlcnR5fSBmcm9tIHNvdW5kIHNsb3Qgd2l0aCBuYW1lICR7bmFtZX0gd2hpY2ggZG9lcyBub3QgZXhpc3RgKTtcbiAgICAgICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gc2xvdFtwcm9wZXJ0eV07XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0cnVlIGlmIHRoZSBzbG90IHdpdGggdGhlIHNwZWNpZmllZCBuYW1lIGlzIGN1cnJlbnRseSBwbGF5aW5nLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IG5hbWUgLSBUaGUgbmFtZSBvZiB0aGUge0BsaW5rIFNvdW5kU2xvdH0gdG8gbG9vayBmb3IuXG4gICAgICogQHJldHVybnMge2Jvb2xlYW59IFRydWUgaWYgdGhlIHNsb3Qgd2l0aCB0aGUgc3BlY2lmaWVkIG5hbWUgZXhpc3RzIGFuZCBpcyBjdXJyZW50bHkgcGxheWluZy5cbiAgICAgKi9cbiAgICBpc1BsYXlpbmcobmFtZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5fZ2V0U2xvdFByb3BlcnR5KG5hbWUsICdpc1BsYXlpbmcnKSB8fCBmYWxzZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRydWUgaWYgdGhlIGFzc2V0IG9mIHRoZSBzbG90IHdpdGggdGhlIHNwZWNpZmllZCBuYW1lIGlzIGxvYWRlZC4uXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gbmFtZSAtIFRoZSBuYW1lIG9mIHRoZSB7QGxpbmsgU291bmRTbG90fSB0byBsb29rIGZvci5cbiAgICAgKiBAcmV0dXJucyB7Ym9vbGVhbn0gVHJ1ZSBpZiB0aGUgc2xvdCB3aXRoIHRoZSBzcGVjaWZpZWQgbmFtZSBleGlzdHMgYW5kIGl0cyBhc3NldCBpcyBsb2FkZWQuXG4gICAgICovXG4gICAgaXNMb2FkZWQobmFtZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5fZ2V0U2xvdFByb3BlcnR5KG5hbWUsICdpc0xvYWRlZCcpIHx8IGZhbHNlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdHJ1ZSBpZiB0aGUgc2xvdCB3aXRoIHRoZSBzcGVjaWZpZWQgbmFtZSBpcyBjdXJyZW50bHkgcGF1c2VkLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IG5hbWUgLSBUaGUgbmFtZSBvZiB0aGUge0BsaW5rIFNvdW5kU2xvdH0gdG8gbG9vayBmb3IuXG4gICAgICogQHJldHVybnMge2Jvb2xlYW59IFRydWUgaWYgdGhlIHNsb3Qgd2l0aCB0aGUgc3BlY2lmaWVkIG5hbWUgZXhpc3RzIGFuZCBpcyBjdXJyZW50bHkgcGF1c2VkLlxuICAgICAqL1xuICAgIGlzUGF1c2VkKG5hbWUpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2dldFNsb3RQcm9wZXJ0eShuYW1lLCAnaXNQYXVzZWQnKSB8fCBmYWxzZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRydWUgaWYgdGhlIHNsb3Qgd2l0aCB0aGUgc3BlY2lmaWVkIG5hbWUgaXMgY3VycmVudGx5IHN0b3BwZWQuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gbmFtZSAtIFRoZSBuYW1lIG9mIHRoZSB7QGxpbmsgU291bmRTbG90fSB0byBsb29rIGZvci5cbiAgICAgKiBAcmV0dXJucyB7Ym9vbGVhbn0gVHJ1ZSBpZiB0aGUgc2xvdCB3aXRoIHRoZSBzcGVjaWZpZWQgbmFtZSBleGlzdHMgYW5kIGlzIGN1cnJlbnRseSBzdG9wcGVkLlxuICAgICAqL1xuICAgIGlzU3RvcHBlZChuYW1lKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9nZXRTbG90UHJvcGVydHkobmFtZSwgJ2lzU3RvcHBlZCcpIHx8IGZhbHNlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEJlZ2lucyBwbGF5aW5nIHRoZSBzb3VuZCBzbG90IHdpdGggdGhlIHNwZWNpZmllZCBuYW1lLiBUaGUgc2xvdCB3aWxsIHJlc3RhcnQgcGxheWluZyBpZiBpdFxuICAgICAqIGlzIGFscmVhZHkgcGxheWluZyB1bmxlc3MgdGhlIG92ZXJsYXAgZmllbGQgaXMgdHJ1ZSBpbiB3aGljaCBjYXNlIGEgbmV3IHNvdW5kIHdpbGwgYmVcbiAgICAgKiBjcmVhdGVkIGFuZCBwbGF5ZWQuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gbmFtZSAtIFRoZSBuYW1lIG9mIHRoZSB7QGxpbmsgU291bmRTbG90fSB0byBwbGF5LlxuICAgICAqIEByZXR1cm5zIHtpbXBvcnQoJy4uLy4uLy4uL3BsYXRmb3JtL3NvdW5kL2luc3RhbmNlLmpzJykuU291bmRJbnN0YW5jZXxudWxsfSBUaGUgc291bmRcbiAgICAgKiBpbnN0YW5jZSB0aGF0IHdpbGwgYmUgcGxheWVkLiBSZXR1cm5zIG51bGwgaWYgdGhlIGNvbXBvbmVudCBvciBpdHMgcGFyZW50IGVudGl0eSBpcyBkaXNhYmxlZFxuICAgICAqIG9yIGlmIHRoZSBTb3VuZENvbXBvbmVudCBoYXMgbm8gc2xvdCB3aXRoIHRoZSBzcGVjaWZpZWQgbmFtZS5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIC8vIGdldCBhc3NldCBieSBpZFxuICAgICAqIGNvbnN0IGFzc2V0ID0gYXBwLmFzc2V0cy5nZXQoMTApO1xuICAgICAqIC8vIGNyZWF0ZSBhIHNsb3QgYW5kIHBsYXkgaXRcbiAgICAgKiB0aGlzLmVudGl0eS5zb3VuZC5hZGRTbG90KCdiZWVwJywge1xuICAgICAqICAgICBhc3NldDogYXNzZXRcbiAgICAgKiB9KTtcbiAgICAgKiB0aGlzLmVudGl0eS5zb3VuZC5wbGF5KCdiZWVwJyk7XG4gICAgICovXG4gICAgcGxheShuYW1lKSB7XG4gICAgICAgIGlmICghdGhpcy5lbmFibGVkIHx8ICF0aGlzLmVudGl0eS5lbmFibGVkKSB7XG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHNsb3QgPSB0aGlzLl9zbG90c1tuYW1lXTtcbiAgICAgICAgaWYgKCFzbG90KSB7XG4gICAgICAgICAgICBEZWJ1Zy53YXJuKGBUcnlpbmcgdG8gcGxheSBzb3VuZCBzbG90IHdpdGggbmFtZSAke25hbWV9IHdoaWNoIGRvZXMgbm90IGV4aXN0YCk7XG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBzbG90LnBsYXkoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBQYXVzZXMgcGxheWJhY2sgb2YgdGhlIHNsb3Qgd2l0aCB0aGUgc3BlY2lmaWVkIG5hbWUuIElmIHRoZSBuYW1lIGlzIHVuZGVmaW5lZCB0aGVuIGFsbCBzbG90c1xuICAgICAqIGN1cnJlbnRseSBwbGF5ZWQgd2lsbCBiZSBwYXVzZWQuIFRoZSBzbG90cyBjYW4gYmUgcmVzdW1lZCBieSBjYWxsaW5nIHtAbGluayBTb3VuZENvbXBvbmVudCNyZXN1bWV9LlxuICAgICAqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IFtuYW1lXSAtIFRoZSBuYW1lIG9mIHRoZSBzbG90IHRvIHBhdXNlLiBMZWF2ZSB1bmRlZmluZWQgdG8gcGF1c2UgZXZlcnl0aGluZy5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIC8vIHBhdXNlIGFsbCBzb3VuZHNcbiAgICAgKiB0aGlzLmVudGl0eS5zb3VuZC5wYXVzZSgpO1xuICAgICAqIC8vIHBhdXNlIGEgc3BlY2lmaWMgc291bmRcbiAgICAgKiB0aGlzLmVudGl0eS5zb3VuZC5wYXVzZSgnYmVlcCcpO1xuICAgICAqL1xuICAgIHBhdXNlKG5hbWUpIHtcbiAgICAgICAgY29uc3Qgc2xvdHMgPSB0aGlzLl9zbG90cztcblxuICAgICAgICBpZiAobmFtZSkge1xuICAgICAgICAgICAgY29uc3Qgc2xvdCA9IHNsb3RzW25hbWVdO1xuICAgICAgICAgICAgaWYgKCFzbG90KSB7XG4gICAgICAgICAgICAgICAgRGVidWcud2FybihgVHJ5aW5nIHRvIHBhdXNlIHNvdW5kIHNsb3Qgd2l0aCBuYW1lICR7bmFtZX0gd2hpY2ggZG9lcyBub3QgZXhpc3RgKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHNsb3QucGF1c2UoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGZvciAoY29uc3Qga2V5IGluIHNsb3RzKSB7XG4gICAgICAgICAgICAgICAgc2xvdHNba2V5XS5wYXVzZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVzdW1lcyBwbGF5YmFjayBvZiB0aGUgc291bmQgc2xvdCB3aXRoIHRoZSBzcGVjaWZpZWQgbmFtZSBpZiBpdCdzIHBhdXNlZC4gSWYgbm8gbmFtZSBpc1xuICAgICAqIHNwZWNpZmllZCBhbGwgc2xvdHMgd2lsbCBiZSByZXN1bWVkLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IFtuYW1lXSAtIFRoZSBuYW1lIG9mIHRoZSBzbG90IHRvIHJlc3VtZS4gTGVhdmUgdW5kZWZpbmVkIHRvIHJlc3VtZSBldmVyeXRoaW5nLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogLy8gcmVzdW1lIGFsbCBzb3VuZHNcbiAgICAgKiB0aGlzLmVudGl0eS5zb3VuZC5yZXN1bWUoKTtcbiAgICAgKiAvLyByZXN1bWUgYSBzcGVjaWZpYyBzb3VuZFxuICAgICAqIHRoaXMuZW50aXR5LnNvdW5kLnJlc3VtZSgnYmVlcCcpO1xuICAgICAqL1xuICAgIHJlc3VtZShuYW1lKSB7XG4gICAgICAgIGNvbnN0IHNsb3RzID0gdGhpcy5fc2xvdHM7XG5cbiAgICAgICAgaWYgKG5hbWUpIHtcbiAgICAgICAgICAgIGNvbnN0IHNsb3QgPSBzbG90c1tuYW1lXTtcbiAgICAgICAgICAgIGlmICghc2xvdCkge1xuICAgICAgICAgICAgICAgIERlYnVnLndhcm4oYFRyeWluZyB0byByZXN1bWUgc291bmQgc2xvdCB3aXRoIG5hbWUgJHtuYW1lfSB3aGljaCBkb2VzIG5vdCBleGlzdGApO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHNsb3QuaXNQYXVzZWQpIHtcbiAgICAgICAgICAgICAgICBzbG90LnJlc3VtZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZm9yIChjb25zdCBrZXkgaW4gc2xvdHMpIHtcbiAgICAgICAgICAgICAgICBzbG90c1trZXldLnJlc3VtZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU3RvcHMgcGxheWJhY2sgb2YgdGhlIHNvdW5kIHNsb3Qgd2l0aCB0aGUgc3BlY2lmaWVkIG5hbWUgaWYgaXQncyBwYXVzZWQuIElmIG5vIG5hbWUgaXNcbiAgICAgKiBzcGVjaWZpZWQgYWxsIHNsb3RzIHdpbGwgYmUgc3RvcHBlZC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBbbmFtZV0gLSBUaGUgbmFtZSBvZiB0aGUgc2xvdCB0byBzdG9wLiBMZWF2ZSB1bmRlZmluZWQgdG8gc3RvcCBldmVyeXRoaW5nLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogLy8gc3RvcCBhbGwgc291bmRzXG4gICAgICogdGhpcy5lbnRpdHkuc291bmQuc3RvcCgpO1xuICAgICAqIC8vIHN0b3AgYSBzcGVjaWZpYyBzb3VuZFxuICAgICAqIHRoaXMuZW50aXR5LnNvdW5kLnN0b3AoJ2JlZXAnKTtcbiAgICAgKi9cbiAgICBzdG9wKG5hbWUpIHtcbiAgICAgICAgY29uc3Qgc2xvdHMgPSB0aGlzLl9zbG90cztcblxuICAgICAgICBpZiAobmFtZSkge1xuICAgICAgICAgICAgY29uc3Qgc2xvdCA9IHNsb3RzW25hbWVdO1xuICAgICAgICAgICAgaWYgKCFzbG90KSB7XG4gICAgICAgICAgICAgICAgRGVidWcud2FybihgVHJ5aW5nIHRvIHN0b3Agc291bmQgc2xvdCB3aXRoIG5hbWUgJHtuYW1lfSB3aGljaCBkb2VzIG5vdCBleGlzdGApO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgc2xvdC5zdG9wKCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGtleSBpbiBzbG90cykge1xuICAgICAgICAgICAgICAgIHNsb3RzW2tleV0uc3RvcCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxufVxuXG5leHBvcnQgeyBTb3VuZENvbXBvbmVudCB9O1xuIl0sIm5hbWVzIjpbIlNvdW5kQ29tcG9uZW50IiwiQ29tcG9uZW50IiwiY29uc3RydWN0b3IiLCJzeXN0ZW0iLCJlbnRpdHkiLCJfdm9sdW1lIiwiX3BpdGNoIiwiX3Bvc2l0aW9uYWwiLCJfcmVmRGlzdGFuY2UiLCJfbWF4RGlzdGFuY2UiLCJfcm9sbE9mZkZhY3RvciIsIl9kaXN0YW5jZU1vZGVsIiwiRElTVEFOQ0VfTElORUFSIiwiX3Nsb3RzIiwiX3BsYXlpbmdCZWZvcmVEaXNhYmxlIiwiX3VwZGF0ZVNvdW5kSW5zdGFuY2VzIiwicHJvcGVydHkiLCJ2YWx1ZSIsImlzRmFjdG9yIiwic2xvdHMiLCJrZXkiLCJzbG90Iiwib3ZlcmxhcCIsImluc3RhbmNlcyIsImkiLCJsZW4iLCJsZW5ndGgiLCJkaXN0YW5jZU1vZGVsIiwibWF4RGlzdGFuY2UiLCJyZWZEaXN0YW5jZSIsInJvbGxPZmZGYWN0b3IiLCJwaXRjaCIsInZvbHVtZSIsInBvc2l0aW9uYWwiLCJuZXdWYWx1ZSIsIm9sZExlbmd0aCIsImlzUGxheWluZyIsImlzU3VzcGVuZGVkIiwiY3VycmVudFRpbWUiLCJzdG9wIiwiaW5zdGFuY2UiLCJfY3JlYXRlSW5zdGFuY2UiLCJwbGF5IiwicHVzaCIsIm9sZFZhbHVlIiwiU291bmRTbG90IiwibmFtZSIsImVuYWJsZWQiLCJvbkVuYWJsZSIsIl9pblRvb2xzIiwicGxheWluZ0JlZm9yZURpc2FibGUiLCJhdXRvUGxheSIsImlzU3RvcHBlZCIsInJlc3VtZSIsImlzTG9hZGVkIiwibG9hZCIsIm9uRGlzYWJsZSIsInBhdXNlIiwib25SZW1vdmUiLCJvZmYiLCJhZGRTbG90Iiwib3B0aW9ucyIsIkRlYnVnIiwid2FybiIsInBhdGgiLCJyZW1vdmVTbG90IiwiX2dldFNsb3RQcm9wZXJ0eSIsInVuZGVmaW5lZCIsImlzUGF1c2VkIl0sIm1hcHBpbmdzIjoiOzs7OztBQVFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLE1BQU1BLGNBQWMsU0FBU0MsU0FBUyxDQUFDO0FBQ25DO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDSUMsRUFBQUEsV0FBV0EsQ0FBQ0MsTUFBTSxFQUFFQyxNQUFNLEVBQUU7QUFDeEIsSUFBQSxLQUFLLENBQUNELE1BQU0sRUFBRUMsTUFBTSxDQUFDLENBQUE7O0FBRXJCO0lBQ0EsSUFBSSxDQUFDQyxPQUFPLEdBQUcsQ0FBQyxDQUFBO0FBQ2hCO0lBQ0EsSUFBSSxDQUFDQyxNQUFNLEdBQUcsQ0FBQyxDQUFBO0FBQ2Y7SUFDQSxJQUFJLENBQUNDLFdBQVcsR0FBRyxJQUFJLENBQUE7QUFDdkI7SUFDQSxJQUFJLENBQUNDLFlBQVksR0FBRyxDQUFD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
