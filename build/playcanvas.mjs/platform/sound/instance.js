import { EventHandler } from '../../core/event-handler.js';
import { math } from '../../core/math/math.js';
import { hasAudioContext } from '../audio/capabilities.js';

const STATE_PLAYING = 0;
const STATE_PAUSED = 1;
const STATE_STOPPED = 2;

/**
 * Return time % duration but always return a number instead of NaN when duration is 0.
 *
 * @param {number} time - The time.
 * @param {number} duration - The duration.
 * @returns {number} The time % duration.
 * @ignore
 */
function capTime(time, duration) {
  return time % duration || 0;
}

/**
 * A SoundInstance plays a {@link Sound}.
 *
 * @augments EventHandler
 * @category Sound
 */
class SoundInstance extends EventHandler {
  /**
   * Create a new SoundInstance instance.
   *
   * @param {import('./manager.js').SoundManager} manager - The sound manager.
   * @param {import('./sound.js').Sound} sound - The sound to play.
   * @param {object} options - Options for the instance.
   * @param {number} [options.volume] - The playback volume, between 0 and 1. Defaults to 1.
   * @param {number} [options.pitch] - The relative pitch. Defaults to 1 (plays at normal pitch).
   * @param {boolean} [options.loop] - Whether the sound should loop when it reaches the end or
   * not. Defaults to false.
   * @param {number} [options.startTime] - The time from which the playback will start in
   * seconds. Default is 0 to start at the beginning. Defaults to 0.
   * @param {number} [options.duration] - The total time after the startTime in seconds when
   * playback will stop or restart if loop is true. Defaults to 0.
   * @param {Function} [options.onPlay] - Function called when the instance starts playing.
   * @param {Function} [options.onPause] - Function called when the instance is paused.
   * @param {Function} [options.onResume] - Function called when the instance is resumed.
   * @param {Function} [options.onStop] - Function called when the instance is stopped.
   * @param {Function} [options.onEnd] - Function called when the instance ends.
   */
  constructor(manager, sound, options) {
    super();

    /**
     * @type {import('./manager.js').SoundManager}
     * @private
     */
    /**
     * Gets the source that plays the sound resource. If the Web Audio API is not supported the
     * type of source is [Audio](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/audio).
     * Source is only available after calling play.
     *
     * @type {AudioBufferSourceNode}
     */
    this.source = null;
    this._manager = manager;

    /**
     * @type {number}
     * @private
     */
    this._volume = options.volume !== undefined ? math.clamp(Number(options.volume) || 0, 0, 1) : 1;

    /**
     * @type {number}
     * @private
     */
    this._pitch = options.pitch !== undefined ? Math.max(0.01, Number(options.pitch) || 0) : 1;

    /**
     * @type {boolean}
     * @private
     */
    this._loop = !!(options.loop !== undefined ? options.loop : false);

    /**
     * @type {import('./sound.js').Sound}
     * @private
     */
    this._sound = sound;

    /**
     * Start at 'stopped'.
     *
     * @type {number}
     * @private
     */
    this._state = STATE_STOPPED;

    /**
     * True if the manager was suspended.
     *
     * @type {boolean}
     * @private
     */
    this._suspended = false;

    /**
     * Greater than 0 if we want to suspend the event handled to the 'onended' event.
     * When an 'onended' event is suspended, this counter is decremented by 1.
     * When a future 'onended' event is to be suspended, this counter is incremented by 1.
     *
     * @type {number}
     * @private
     */
    this._suspendEndEvent = 0;

    /**
     * True if we want to suspend firing instance events.
     *
     * @type {boolean}
     * @private
     */
    this._suspendInstanceEvents = false;

    /**
     * If true then the instance will start playing its source when its created.
     *
     * @type {boolean}
     * @private
     */
    this._playWhenLoaded = true;

    /**
     * @type {number}
     * @private
     */
    this._startTime = Math.max(0, Number(options.startTime) || 0);

    /**
     * @type {number}
     * @private
     */
    this._duration = Math.max(0, Number(options.duration) || 0);

    /**
     * @type {number|null}
     * @private
     */
    this._startOffset = null;

    // external event handlers
    /** @private */
    this._onPlayCallback = options.onPlay;
    /** @private */
    this._onPauseCallback = options.onPause;
    /** @private */
    this._onResumeCallback = options.onResume;
    /** @private */
    this._onStopCallback = options.onStop;
    /** @private */
    this._onEndCallback = options.onEnd;
    if (hasAudioContext()) {
      /**
       * @type {number}
       * @private
       */
      this._startedAt = 0;

      /**
       * Manually keep track of the playback position because the Web Audio API does not
       * provide a way to do this accurately if the playbackRate is not 1.
       *
       * @type {number}
       * @private
       */
      this._currentTime = 0;

      /**
       * @type {number}
       * @private
       */
      this._currentOffset = 0;

      /**
       * The input node is the one that is connected to the source.
       *
       * @type {AudioNode|null}
       * @private
       */
      this._inputNode = null;

      /**
       * The connected node is the one that is connected to the destination (speakers). Any
       * external nodes will be connected to this node.
       *
       * @type {AudioNode|null}
       * @private
       */
      this._connectorNode = null;

      /**
       * The first external node set by a user.
       *
       * @type {AudioNode|null}
       * @private
       */
      this._firstNode = null;

      /**
       * The last external node set by a user.
       *
       * @type {AudioNode|null}
       * @private
       */
      this._lastNode = null;

      /**
       * Set to true if a play() request was issued when the AudioContext was still suspended,
       * and will therefore wait until it is resumed to play the audio.
       *
       * @type {boolean}
       * @private
       */
      this._waitingContextSuspension = false;
      this._initializeNodes();

      /** @private */
      this._endedHandler = this._onEnded.bind(this);
    } else {
      /** @private */
      this._isReady = false;

      /** @private */
      this._loadedMetadataHandler = this._onLoadedMetadata.bind(this);
      /** @private */
      this._timeUpdateHandler = this._onTimeUpdate.bind(this);
      /** @private */
      this._endedHandler = this._onEnded.bind(this);
      this._createSource();
    }
  }

  /**
   * Fired when the instance starts playing its source.
   *
   * @event SoundInstance#play
   */

  /**
   * Fired when the instance is paused.
   *
   * @event SoundInstance#pause
   */

  /**
   * Fired when the instance is resumed.
   *
   * @event SoundInstance#resume
   */

  /**
   * Fired when the instance is stopped.
   *
   * @event SoundInstance#stop
   */

  /**
   * Fired when the sound currently played by the instance ends.
   *
   * @event SoundInstance#end
   */

  /**
   * Gets or sets the current time of the sound that is playing. If the value provided is bigger
   * than the duration of the instance it will wrap from the beginning.
   *
   * @type {number}
   */
  set currentTime(value) {
    if (value < 0) return;
    if (this._state === STATE_PLAYING) {
      const suspend = this._suspendInstanceEvents;
      this._suspendInstanceEvents = true;

      // stop first which will set _startOffset to null
      this.stop();

      // set _startOffset and play
      this._startOffset = value;
      this.play();
      this._suspendInstanceEvents = suspend;
    } else {
      // set _startOffset which will be used when the instance will start playing
      this._startOffset = value;
      // set _currentTime
      this._currentTime = value;
    }
  }
  get currentTime() {
    // if the user has set the currentTime and we have not used it yet
    // then just return that
    if (this._startOffset !== null) {
      return this._startOffset;
    }

    // if the sound is paused return the currentTime calculated when
    // pause() was called
    if (this._state === STATE_PAUSED) {
      return this._currentTime;
    }

    // if the sound is stopped or we don't have a source
    // return 0
    if (this._state === STATE_STOPPED || !this.source) {
      return 0;
    }

    // recalculate current time
    this._updateCurrentTime();
    return this._currentTime;
  }

  /**
   * The duration of the sound that the instance will play starting from startTime.
   *
   * @type {number}
   */
  set duration(value) {
    this._duration = Math.max(0, Number(value) || 0);

    // restart
    const isPlaying = this._state === STATE_PLAYING;
    this.stop();
    if (isPlaying) {
      this.play();
    }
  }
  get duration() {
    if (!this._sound) {
      return 0;
    }
    if (this._duration) {
      return capTime(this._duration, this._sound.duration);
    }
    return this._sound.duration;
  }

  /**
   * Returns true if the instance is currently paused.
   *
   * @type {boolean}
   */
  get isPaused() {
    return this._state === STATE_PAUSED;
  }

  /**
   * Returns true if the instance is currently playing.
   *
   * @type {boolean}
   */
  get isPlaying() {
    return this._state === STATE_PLAYING;
  }

  /**
   * Returns true if the instance is currently stopped.
   *
   * @type {boolean}
   */
  get isStopped() {
    return this._state === STATE_STOPPED;
  }

  /**
   * Returns true if the instance is currently suspended because the window is not focused.
   *
   * @type {boolean}
   */
  get isSuspended() {
    return this._suspended;
  }

  /**
   * If true the instance will restart when it finishes playing.
   *
   * @type {boolean}
   */
  set loop(value) {
    this._loop = !!value;
    if (this.source) {
      this.source.loop = this._loop;
    }
  }
  get loop() {
    return this._loop;
  }

  /**
   * The pitch modifier to play the sound with. Must be larger than 0.01.
   *
   * @type {number}
   */
  set pitch(pitch) {
    // set offset to current time so that
    // we calculate the rest of the time with the new pitch
    // from now on
    this._currentOffset = this.currentTime;
    this._startedAt = this._manager.context.currentTime;
    this._pitch = Math.max(Number(pitch) || 0, 0.01);
    if (this.source) {
      this.source.playbackRate.value = this._pitch;
    }
  }
  get pitch() {
    return this._pitch;
  }

  /**
   * The sound resource that the instance will play.
   *
   * @type {import('./sound.js').Sound}
   */
  set sound(value) {
    this._sound = value;
    if (this._state !== STATE_STOPPED) {
      this.stop();
    } else {
      this._createSource();
    }
  }
  get sound() {
    return this._sound;
  }

  /**
   * The start time from which the sound will start playing.
   *
   * @type {number}
   */
  set startTime(value) {
    this._startTime = Math.max(0, Number(value) || 0);

    // restart
    const isPlaying = this._state === STATE_PLAYING;
    this.stop();
    if (isPlaying) {
      this.play();
    }
  }
  get startTime() {
    return this._startTime;
  }

  /**
   * The volume modifier to play the sound with. In range 0-1.
   *
   * @type {number}
   */
  set volume(volume) {
    volume = math.clamp(volume, 0, 1);
    this._volume = volume;
    if (this.gain) {
      this.gain.gain.value = volume * this._manager.volume;
    }
  }
  get volume() {
    return this._volume;
  }

  /** @private */
  _onPlay() {
    this.fire('play');
    if (this._onPlayCallback) this._onPlayCallback(this);
  }

  /** @private */
  _onPause() {
    this.fire('pause');
    if (this._onPauseCallback) this._onPauseCallback(this);
  }

  /** @private */
  _onResume() {
    this.fire('resume');
    if (this._onResumeCallback) this._onResumeCallback(this);
  }

  /** @private */
  _onStop() {
    this.fire('stop');
    if (this._onStopCallback) this._onStopCallback(this);
  }

  /** @private */
  _onEnded() {
    // the callback is not fired synchronously
    // so only decrement _suspendEndEvent when the
    // callback is fired
    if (this._suspendEndEvent > 0) {
      this._suspendEndEvent--;
      return;
    }
    this.fire('end');
    if (this._onEndCallback) this._onEndCallback(this);
    this.stop();
  }

  /**
   * Handle the manager's 'volumechange' event.
   *
   * @private
   */
  _onManagerVolumeChange() {
    this.volume = this._volume;
  }

  /**
   * Handle the manager's 'suspend' event.
   *
   * @private
   */
  _onManagerSuspend() {
    if (this._state === STATE_PLAYING && !this._suspended) {
      this._suspended = true;
      this.pause();
    }
  }

  /**
   * Handle the manager's 'resume' event.
   *
   * @private
   */
  _onManagerResume() {
    if (this._suspended) {
      this._suspended = false;
      this.resume();
    }
  }

  /**
   * Creates internal audio nodes and connects them.
   *
   * @private
   */
  _initializeNodes() {
    // create gain node for volume control
    this.gain = this._manager.context.createGain();
    this._inputNode = this.gain;
    // the gain node is also the connector node for 2D sound instances
    this._connectorNode = this.gain;
    this._connectorNode.connect(this._manager.context.destination);
  }

  /**
   * Attempt to begin playback the sound.
   * If the AudioContext is suspended, the audio will only start once it's resumed.
   * If the sound is already playing, this will restart the sound.
   *
   * @returns {boolean} True if the sound was started immediately.
   */
  play() {
    if (this._state !== STATE_STOPPED) {
      this.stop();
    }
    // set state to playing
    this._state = STATE_PLAYING;
    // no need for this anymore
    this._playWhenLoaded = false;

    // play() was already issued but hasn't actually started yet
    if (this._waitingContextSuspension) {
      return false;
    }

    // manager is suspended so audio cannot start now - wait for manager to resume
    if (this._manager.suspended) {
      this._manager.once('resume', this._playAudioImmediate, this);
      this._waitingContextSuspension = true;
      return false;
    }
    this._playAudioImmediate();
    return true;
  }

  /**
   * Immediately play the sound.
   * This method assumes the AudioContext is ready (not suspended or locked).
   *
   * @private
   */
  _playAudioImmediate() {
    this._waitingContextSuspension = false;

    // between play() and the manager being ready to play, a stop() or pause() call was made
    if (this._state !== STATE_PLAYING) {
      return;
    }
    if (!this.source) {
      this._createSource();
    }

    // calculate start offset
    let offset = capTime(this._startOffset, this.duration);
    offset = capTime(this._startTime + offset, this._sound.duration);
    // reset start offset now that we started the sound
    this._startOffset = null;

    // start source with specified offset and duration
    if (this._duration) {
      this.source.start(0, offset, this._duration);
    } else {
      this.source.start(0, offset);
    }

    // reset times
    this._startedAt = this._manager.context.currentTime;
    this._currentTime = 0;
    this._currentOffset = offset;

    // Initialize volume and loop - note moved to be after start() because of Chrome bug
    this.volume = this._volume;
    this.loop = this._loop;
    this.pitch = this._pitch;

    // handle suspend events / volumechange events
    this._manager.on('volumechange', this._onManagerVolumeChange, this);
    this._manager.on('suspend', this._onManagerSuspend, this);
    this._manager.on('resume', this._onManagerResume, this);
    this._manager.on('destroy', this._onManagerDestroy, this);
    if (!this._suspendInstanceEvents) {
      this._onPlay();
    }
  }

  /**
   * Pauses playback of sound. Call resume() to resume playback from the same position.
   *
   * @returns {boolean} Returns true if the sound was paused.
   */
  pause() {
    // no need for this anymore
    this._playWhenLoaded = false;
    if (this._state !== STATE_PLAYING) return false;

    // set state to paused
    this._state = STATE_PAUSED;

    // play() was issued but hasn't actually started yet.
    if (this._waitingContextSuspension) {
      return true;
    }

    // store current time
    this._updateCurrentTime();

    // Stop the source and re-create it because we cannot reuse the same source.
    // Suspend the end event as we are manually stopping the source
    this._suspendEndEvent++;
    this.source.stop(0);
    this.source = null;

    // reset user-set start offset
    this._startOffset = null;
    if (!this._suspendInstanceEvents) this._onPause();
    return true;
  }

  /**
   * Resumes playback of the sound. Playback resumes at the point that the audio was paused.
   *
   * @returns {boolean} Returns true if the sound was resumed.
   */
  resume() {
    if (this._state !== STATE_PAUSED) {
      return false;
    }

    // start at point where sound was paused
    let offset = this.currentTime;

    // set state back to playing
    this._state = STATE_PLAYING;

    // play() was issued but hasn't actually started yet
    if (this._waitingContextSuspension) {
      return true;
    }
    if (!this.source) {
      this._createSource();
    }

    // if the user set the 'currentTime' property while the sound
    // was paused then use that as the offset instead
    if (this._startOffset !== null) {
      offset = capTime(this._startOffset, this.duration);
      offset = capTime(this._startTime + offset, this._sound.duration);

      // reset offset
      this._startOffset = null;
    }

    // start source
    if (this._duration) {
      this.source.start(0, offset, this._duration);
    } else {
      this.source.start(0, offset);
    }
    this._startedAt = this._manager.context.currentTime;
    this._currentOffset = offset;

    // Initialize parameters
    this.volume = this._volume;
    this.loop = this._loop;
    this.pitch = this._pitch;
    this._playWhenLoaded = false;
    if (!this._suspendInstanceEvents) this._onResume();
    return true;
  }

  /**
   * Stops playback of sound. Calling play() again will restart playback from the beginning of
   * the sound.
   *
   * @returns {boolean} Returns true if the sound was stopped.
   */
  stop() {
    this._playWhenLoaded = false;
    if (this._state === STATE_STOPPED) return false;

    // set state to stopped
    const wasPlaying = this._state === STATE_PLAYING;
    this._state = STATE_STOPPED;

    // play() was issued but hasn't actually started yet
    if (this._waitingContextSuspension) {
      return true;
    }

    // unsubscribe from manager events
    this._manager.off('volumechange', this._onManagerVolumeChange, this);
    this._manager.off('suspend', this._onManagerSuspend, this);
    this._manager.off('resume', this._onManagerResume, this);
    this._manager.off('destroy', this._onManagerDestroy, this);

    // reset stored times
    this._startedAt = 0;
    this._currentTime = 0;
    this._currentOffset = 0;
    this._startOffset = null;
    this._suspendEndEvent++;
    if (wasPlaying && this.source) {
      this.source.stop(0);
    }
    this.source = null;
    if (!this._suspendInstanceEvents) this._onStop();
    return true;
  }

  /**
   * Connects external Web Audio API nodes. You need to pass the first node of the node graph
   * that you created externally and the last node of that graph. The first node will be
   * connected to the audio source and the last node will be connected to the destination of the
   * AudioContext (e.g. speakers). Requires Web Audio API support.
   *
   * @param {AudioNode} firstNode - The first node that will be connected to the audio source of sound instances.
   * @param {AudioNode} [lastNode] - The last node that will be connected to the destination of the AudioContext.
   * If unspecified then the firstNode will be connected to the destination instead.
   * @example
   * const context = app.systems.sound.context;
   * const analyzer = context.createAnalyzer();
   * const distortion = context.createWaveShaper();
   * const filter = context.createBiquadFilter();
   * analyzer.connect(distortion);
   * distortion.connect(filter);
   * instance.setExternalNodes(analyzer, filter);
   */
  setExternalNodes(firstNode, lastNode) {
    if (!firstNode) {
      console.error('The firstNode must be a valid Audio Node');
      return;
    }
    if (!lastNode) {
      lastNode = firstNode;
    }

    // connections are:
    // source -> inputNode -> connectorNode -> [firstNode -> ... -> lastNode] -> speakers

    const speakers = this._manager.context.destination;
    if (this._firstNode !== firstNode) {
      if (this._firstNode) {
        // if firstNode already exists means the connector node
        // is connected to it so disconnect it
        this._connectorNode.disconnect(this._firstNode);
      } else {
        // if firstNode does not exist means that its connected
        // to the speakers so disconnect it
        this._connectorNode.disconnect(speakers);
      }

      // set first node and connect with connector node
      this._firstNode = firstNode;
      this._connectorNode.connect(firstNode);
    }
    if (this._lastNode !== lastNode) {
      if (this._lastNode) {
        // if last node exists means it's connected to the speakers so disconnect it
        this._lastNode.disconnect(speakers);
      }

      // set last node and connect with speakers
      this._lastNode = lastNode;
      this._lastNode.connect(speakers);
    }
  }

  /**
   * Clears any external nodes set by {@link SoundInstance#setExternalNodes}.
   */
  clearExternalNodes() {
    const speakers = this._manager.context.destination;

    // break existing connections
    if (this._firstNode) {
      this._connectorNode.disconnect(this._firstNode);
      this._firstNode = null;
    }
    if (this._lastNode) {
      this._lastNode.disconnect(speakers);
      this._lastNode = null;
    }

    // reset connect to speakers
    this._connectorNode.connect(speakers);
  }

  /**
   * Gets any external nodes set by {@link SoundInstance#setExternalNodes}.
   *
   * @returns {AudioNode[]} Returns an array that contains the two nodes set by
   * {@link SoundInstance#setExternalNodes}.
   */
  getExternalNodes() {
    return [this._firstNode, this._lastNode];
  }

  /**
   * Creates the source for the instance.
   *
   * @returns {AudioBufferSourceNode|null} Returns the created source or null if the sound
   * instance has no {@link Sound} associated with it.
   * @private
   */
  _createSource() {
    if (!this._sound) {
      return null;
    }
    const context = this._manager.context;
    if (this._sound.buffer) {
      this.source = context.createBufferSource();
      this.source.buffer = this._sound.buffer;

      // Connect up the nodes
      this.source.connect(this._inputNode);

      // set events
      this.source.onended = this._endedHandler;

      // set loopStart and loopEnd so that the source starts and ends at the correct user-set times
      this.source.loopStart = capTime(this._startTime, this.source.buffer.duration);
      if (this._duration) {
        this.source.loopEnd = Math.max(this.source.loopStart, capTime(this._startTime + this._duration, this.source.buffer.duration));
      }
    }
    return this.source;
  }

  /**
   * Sets the current time taking into account the time the instance started playing, the current
   * pitch and the current time offset.
   *
   * @private
   */
  _updateCurrentTime() {
    this._currentTime = capTime((this._manager.context.currentTime - this._startedAt) * this._pitch + this._currentOffset, this.duration);
  }

  /**
   * Handle the manager's 'destroy' event.
   *
   * @private
   */
  _onManagerDestroy() {
    if (this.source && this._state === STATE_PLAYING) {
      this.source.stop(0);
      this.source = null;
    }
  }
}
if (!hasAudioContext()) {
  Object.assign(SoundInstance.prototype, {
    play: function () {
      if (this._state !== STATE_STOPPED) {
        this.stop();
      }
      if (!this.source) {
        if (!this._createSource()) {
          return false;
        }
      }
      this.volume = this._volume;
      this.pitch = this._pitch;
      this.loop = this._loop;
      this.source.play();
      this._state = STATE_PLAYING;
      this._playWhenLoaded = false;
      this._manager.on('volumechange', this._onManagerVolumeChange, this);
      this._manager.on('suspend', this._onManagerSuspend, this);
      this._manager.on('resume', this._onManagerResume, this);
      this._manager.on('destroy', this._onManagerDestroy, this);

      // suspend immediately if manager is suspended
      if (this._manager.suspended) this._onManagerSuspend();
      if (!this._suspendInstanceEvents) this._onPlay();
      return true;
    },
    pause: function () {
      if (!this.source || this._state !== STATE_PLAYING) return false;
      this._suspendEndEvent++;
      this.source.pause();
      this._playWhenLoaded = false;
      this._state = STATE_PAUSED;
      this._startOffset = null;
      if (!this._suspendInstanceEvents) this._onPause();
      return true;
    },
    resume: function () {
      if (!this.source || this._state !== STATE_PAUSED) return false;
      this._state = STATE_PLAYING;
      this._playWhenLoaded = false;
      if (this.source.paused) {
        this.source.play();
        if (!this._suspendInstanceEvents) this._onResume();
      }
      return true;
    },
    stop: function () {
      if (!this.source || this._state === STATE_STOPPED) return false;
      this._manager.off('volumechange', this._onManagerVolumeChange, this);
      this._manager.off('suspend', this._onManagerSuspend, this);
      this._manager.off('resume', this._onManagerResume, this);
      this._manager.off('destroy', this._onManagerDestroy, this);
      this._suspendEndEvent++;
      this.source.pause();
      this._playWhenLoaded = false;
      this._state = STATE_STOPPED;
      this._startOffset = null;
      if (!this._suspendInstanceEvents) this._onStop();
      return true;
    },
    setExternalNodes: function () {
      // not supported
    },
    clearExternalNodes: function () {
      // not supported
    },
    getExternalNodes: function () {
      // not supported but return same type of result
      return [null, null];
    },
    // Sets start time after loadedmetadata is fired which is required by most browsers
    _onLoadedMetadata: function () {
      this.source.removeEventListener('loadedmetadata', this._loadedMetadataHandler);
      this._isReady = true;

      // calculate start time for source
      let offset = capTime(this._startOffset, this.duration);
      offset = capTime(this._startTime + offset, this._sound.duration);
      // reset currentTime
      this._startOffset = null;

      // set offset on source
      this.source.currentTime = offset;
    },
    _createSource: function () {
      if (this._sound && this._sound.audio) {
        this._isReady = false;
        this.source = this._sound.audio.cloneNode(true);

        // set events
        this.source.addEventListener('loadedmetadata', this._loadedMetadataHandler);
        this.source.addEventListener('timeupdate', this._timeUpdateHandler);
        this.source.onended = this._endedHandler;
      }
      return this.source;
    },
    // called every time the 'currentTime' is changed
    _onTimeUpdate: function () {
      if (!this._duration) return;

      // if the currentTime passes the end then if looping go back to the beginning
      // otherwise manually stop
      if (this.source.currentTime > capTime(this._startTime + this._duration, this.source.duration)) {
        if (this.loop) {
          this.source.currentTime = capTime(this._startTime, this.source.duration);
        } else {
          // remove listener to prevent multiple calls
          this.source.removeEventListener('timeupdate', this._timeUpdateHandler);
          this.source.pause();

          // call this manually because it doesn't work in all browsers in this case
          this._onEnded();
        }
      }
    },
    _onManagerDestroy: function () {
      if (this.source) {
        this.source.pause();
      }
    }
  });
  Object.defineProperty(SoundInstance.prototype, 'volume', {
    get: function () {
      return this._volume;
    },
    set: function (volume) {
      volume = math.clamp(volume, 0, 1);
      this._volume = volume;
      if (this.source) {
        this.source.volume = volume * this._manager.volume;
      }
    }
  });
  Object.defineProperty(SoundInstance.prototype, 'pitch', {
    get: function () {
      return this._pitch;
    },
    set: function (pitch) {
      this._pitch = Math.max(Number(pitch) || 0, 0.01);
      if (this.source) {
        this.source.playbackRate = this._pitch;
      }
    }
  });
  Object.defineProperty(SoundInstance.prototype, 'sound', {
    get: function () {
      return this._sound;
    },
    set: function (value) {
      this.stop();
      this._sound = value;
    }
  });
  Object.defineProperty(SoundInstance.prototype, 'currentTime', {
    get: function () {
      if (this._startOffset !== null) {
        return this._startOffset;
      }
      if (this._state === STATE_STOPPED || !this.source) {
        return 0;
      }
      return this.source.currentTime - this._startTime;
    },
    set: function (value) {
      if (value < 0) return;
      this._startOffset = value;
      if (this.source && this._isReady) {
        this.source.currentTime = capTime(this._startTime + capTime(value, this.duration), this._sound.duration);
        this._startOffset = null;
      }
    }
  });
}

export { SoundInstance };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5zdGFuY2UuanMiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9wbGF0Zm9ybS9zb3VuZC9pbnN0YW5jZS5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBFdmVudEhhbmRsZXIgfSBmcm9tICcuLi8uLi9jb3JlL2V2ZW50LWhhbmRsZXIuanMnO1xuXG5pbXBvcnQgeyBtYXRoIH0gZnJvbSAnLi4vLi4vY29yZS9tYXRoL21hdGguanMnO1xuXG5pbXBvcnQgeyBoYXNBdWRpb0NvbnRleHQgfSBmcm9tICcuLi9hdWRpby9jYXBhYmlsaXRpZXMuanMnO1xuXG5jb25zdCBTVEFURV9QTEFZSU5HID0gMDtcbmNvbnN0IFNUQVRFX1BBVVNFRCA9IDE7XG5jb25zdCBTVEFURV9TVE9QUEVEID0gMjtcblxuLyoqXG4gKiBSZXR1cm4gdGltZSAlIGR1cmF0aW9uIGJ1dCBhbHdheXMgcmV0dXJuIGEgbnVtYmVyIGluc3RlYWQgb2YgTmFOIHdoZW4gZHVyYXRpb24gaXMgMC5cbiAqXG4gKiBAcGFyYW0ge251bWJlcn0gdGltZSAtIFRoZSB0aW1lLlxuICogQHBhcmFtIHtudW1iZXJ9IGR1cmF0aW9uIC0gVGhlIGR1cmF0aW9uLlxuICogQHJldHVybnMge251bWJlcn0gVGhlIHRpbWUgJSBkdXJhdGlvbi5cbiAqIEBpZ25vcmVcbiAqL1xuZnVuY3Rpb24gY2FwVGltZSh0aW1lLCBkdXJhdGlvbikge1xuICAgIHJldHVybiAodGltZSAlIGR1cmF0aW9uKSB8fCAwO1xufVxuXG4vKipcbiAqIEEgU291bmRJbnN0YW5jZSBwbGF5cyBhIHtAbGluayBTb3VuZH0uXG4gKlxuICogQGF1Z21lbnRzIEV2ZW50SGFuZGxlclxuICogQGNhdGVnb3J5IFNvdW5kXG4gKi9cbmNsYXNzIFNvdW5kSW5zdGFuY2UgZXh0ZW5kcyBFdmVudEhhbmRsZXIge1xuICAgIC8qKlxuICAgICAqIEdldHMgdGhlIHNvdXJjZSB0aGF0IHBsYXlzIHRoZSBzb3VuZCByZXNvdXJjZS4gSWYgdGhlIFdlYiBBdWRpbyBBUEkgaXMgbm90IHN1cHBvcnRlZCB0aGVcbiAgICAgKiB0eXBlIG9mIHNvdXJjZSBpcyBbQXVkaW9dKGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0hUTUwvRWxlbWVudC9hdWRpbykuXG4gICAgICogU291cmNlIGlzIG9ubHkgYXZhaWxhYmxlIGFmdGVyIGNhbGxpbmcgcGxheS5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtBdWRpb0J1ZmZlclNvdXJjZU5vZGV9XG4gICAgICovXG4gICAgc291cmNlID0gbnVsbDtcblxuICAgIC8qKlxuICAgICAqIENyZWF0ZSBhIG5ldyBTb3VuZEluc3RhbmNlIGluc3RhbmNlLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4vbWFuYWdlci5qcycpLlNvdW5kTWFuYWdlcn0gbWFuYWdlciAtIFRoZSBzb3VuZCBtYW5hZ2VyLlxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuL3NvdW5kLmpzJykuU291bmR9IHNvdW5kIC0gVGhlIHNvdW5kIHRvIHBsYXkuXG4gICAgICogQHBhcmFtIHtvYmplY3R9IG9wdGlvbnMgLSBPcHRpb25zIGZvciB0aGUgaW5zdGFuY2UuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFtvcHRpb25zLnZvbHVtZV0gLSBUaGUgcGxheWJhY2sgdm9sdW1lLCBiZXR3ZWVuIDAgYW5kIDEuIERlZmF1bHRzIHRvIDEuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFtvcHRpb25zLnBpdGNoXSAtIFRoZSByZWxhdGl2ZSBwaXRjaC4gRGVmYXVsdHMgdG8gMSAocGxheXMgYXQgbm9ybWFsIHBpdGNoKS5cbiAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IFtvcHRpb25zLmxvb3BdIC0gV2hldGhlciB0aGUgc291bmQgc2hvdWxkIGxvb3Agd2hlbiBpdCByZWFjaGVzIHRoZSBlbmQgb3JcbiAgICAgKiBub3QuIERlZmF1bHRzIHRvIGZhbHNlLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBbb3B0aW9ucy5zdGFydFRpbWVdIC0gVGhlIHRpbWUgZnJvbSB3aGljaCB0aGUgcGxheWJhY2sgd2lsbCBzdGFydCBpblxuICAgICAqIHNlY29uZHMuIERlZmF1bHQgaXMgMCB0byBzdGFydCBhdCB0aGUgYmVnaW5uaW5nLiBEZWZhdWx0cyB0byAwLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBbb3B0aW9ucy5kdXJhdGlvbl0gLSBUaGUgdG90YWwgdGltZSBhZnRlciB0aGUgc3RhcnRUaW1lIGluIHNlY29uZHMgd2hlblxuICAgICAqIHBsYXliYWNrIHdpbGwgc3RvcCBvciByZXN0YXJ0IGlmIGxvb3AgaXMgdHJ1ZS4gRGVmYXVsdHMgdG8gMC5cbiAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBbb3B0aW9ucy5vblBsYXldIC0gRnVuY3Rpb24gY2FsbGVkIHdoZW4gdGhlIGluc3RhbmNlIHN0YXJ0cyBwbGF5aW5nLlxuICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IFtvcHRpb25zLm9uUGF1c2VdIC0gRnVuY3Rpb24gY2FsbGVkIHdoZW4gdGhlIGluc3RhbmNlIGlzIHBhdXNlZC5cbiAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBbb3B0aW9ucy5vblJlc3VtZV0gLSBGdW5jdGlvbiBjYWxsZWQgd2hlbiB0aGUgaW5zdGFuY2UgaXMgcmVzdW1lZC5cbiAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBbb3B0aW9ucy5vblN0b3BdIC0gRnVuY3Rpb24gY2FsbGVkIHdoZW4gdGhlIGluc3RhbmNlIGlzIHN0b3BwZWQuXG4gICAgICogQHBhcmFtIHtGdW5jdGlvbn0gW29wdGlvbnMub25FbmRdIC0gRnVuY3Rpb24gY2FsbGVkIHdoZW4gdGhlIGluc3RhbmNlIGVuZHMuXG4gICAgICovXG4gICAgY29uc3RydWN0b3IobWFuYWdlciwgc291bmQsIG9wdGlvbnMpIHtcbiAgICAgICAgc3VwZXIoKTtcblxuICAgICAgICAvKipcbiAgICAgICAgICogQHR5cGUge2ltcG9ydCgnLi9tYW5hZ2VyLmpzJykuU291bmRNYW5hZ2VyfVxuICAgICAgICAgKiBAcHJpdmF0ZVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5fbWFuYWdlciA9IG1hbmFnZXI7XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEB0eXBlIHtudW1iZXJ9XG4gICAgICAgICAqIEBwcml2YXRlXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLl92b2x1bWUgPSBvcHRpb25zLnZvbHVtZSAhPT0gdW5kZWZpbmVkID8gbWF0aC5jbGFtcChOdW1iZXIob3B0aW9ucy52b2x1bWUpIHx8IDAsIDAsIDEpIDogMTtcblxuICAgICAgICAvKipcbiAgICAgICAgICogQHR5cGUge251bWJlcn1cbiAgICAgICAgICogQHByaXZhdGVcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuX3BpdGNoID0gb3B0aW9ucy5waXRjaCAhPT0gdW5kZWZpbmVkID8gTWF0aC5tYXgoMC4wMSwgTnVtYmVyKG9wdGlvbnMucGl0Y2gpIHx8IDApIDogMTtcblxuICAgICAgICAvKipcbiAgICAgICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICAgICAqIEBwcml2YXRlXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLl9sb29wID0gISEob3B0aW9ucy5sb29wICE9PSB1bmRlZmluZWQgPyBvcHRpb25zLmxvb3AgOiBmYWxzZSk7XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEB0eXBlIHtpbXBvcnQoJy4vc291bmQuanMnKS5Tb3VuZH1cbiAgICAgICAgICogQHByaXZhdGVcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuX3NvdW5kID0gc291bmQ7XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIFN0YXJ0IGF0ICdzdG9wcGVkJy5cbiAgICAgICAgICpcbiAgICAgICAgICogQHR5cGUge251bWJlcn1cbiAgICAgICAgICogQHByaXZhdGVcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuX3N0YXRlID0gU1RBVEVfU1RPUFBFRDtcblxuICAgICAgICAvKipcbiAgICAgICAgICogVHJ1ZSBpZiB0aGUgbWFuYWdlciB3YXMgc3VzcGVuZGVkLlxuICAgICAgICAgKlxuICAgICAgICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICAgICAgICogQHByaXZhdGVcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuX3N1c3BlbmRlZCA9IGZhbHNlO1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBHcmVhdGVyIHRoYW4gMCBpZiB3ZSB3YW50IHRvIHN1c3BlbmQgdGhlIGV2ZW50IGhhbmRsZWQgdG8gdGhlICdvbmVuZGVkJyBldmVudC5cbiAgICAgICAgICogV2hlbiBhbiAnb25lbmRlZCcgZXZlbnQgaXMgc3VzcGVuZGVkLCB0aGlzIGNvdW50ZXIgaXMgZGVjcmVtZW50ZWQgYnkgMS5cbiAgICAgICAgICogV2hlbiBhIGZ1dHVyZSAnb25lbmRlZCcgZXZlbnQgaXMgdG8gYmUgc3VzcGVuZGVkLCB0aGlzIGNvdW50ZXIgaXMgaW5jcmVtZW50ZWQgYnkgMS5cbiAgICAgICAgICpcbiAgICAgICAgICogQHR5cGUge251bWJlcn1cbiAgICAgICAgICogQHByaXZhdGVcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuX3N1c3BlbmRFbmRFdmVudCA9IDA7XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIFRydWUgaWYgd2Ugd2FudCB0byBzdXNwZW5kIGZpcmluZyBpbnN0YW5jZSBldmVudHMuXG4gICAgICAgICAqXG4gICAgICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAgICAgKiBAcHJpdmF0ZVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5fc3VzcGVuZEluc3RhbmNlRXZlbnRzID0gZmFsc2U7XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIElmIHRydWUgdGhlbiB0aGUgaW5zdGFuY2Ugd2lsbCBzdGFydCBwbGF5aW5nIGl0cyBzb3VyY2Ugd2hlbiBpdHMgY3JlYXRlZC5cbiAgICAgICAgICpcbiAgICAgICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICAgICAqIEBwcml2YXRlXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLl9wbGF5V2hlbkxvYWRlZCA9IHRydWU7XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEB0eXBlIHtudW1iZXJ9XG4gICAgICAgICAqIEBwcml2YXRlXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLl9zdGFydFRpbWUgPSBNYXRoLm1heCgwLCBOdW1iZXIob3B0aW9ucy5zdGFydFRpbWUpIHx8IDApO1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAgICAgKiBAcHJpdmF0ZVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5fZHVyYXRpb24gPSBNYXRoLm1heCgwLCBOdW1iZXIob3B0aW9ucy5kdXJhdGlvbikgfHwgMCk7XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEB0eXBlIHtudW1iZXJ8bnVsbH1cbiAgICAgICAgICogQHByaXZhdGVcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuX3N0YXJ0T2Zmc2V0ID0gbnVsbDtcblxuICAgICAgICAvLyBleHRlcm5hbCBldmVudCBoYW5kbGVyc1xuICAgICAgICAvKiogQHByaXZhdGUgKi9cbiAgICAgICAgdGhpcy5fb25QbGF5Q2FsbGJhY2sgPSBvcHRpb25zLm9uUGxheTtcbiAgICAgICAgLyoqIEBwcml2YXRlICovXG4gICAgICAgIHRoaXMuX29uUGF1c2VDYWxsYmFjayA9IG9wdGlvbnMub25QYXVzZTtcbiAgICAgICAgLyoqIEBwcml2YXRlICovXG4gICAgICAgIHRoaXMuX29uUmVzdW1lQ2FsbGJhY2sgPSBvcHRpb25zLm9uUmVzdW1lO1xuICAgICAgICAvKiogQHByaXZhdGUgKi9cbiAgICAgICAgdGhpcy5fb25TdG9wQ2FsbGJhY2sgPSBvcHRpb25zLm9uU3RvcDtcbiAgICAgICAgLyoqIEBwcml2YXRlICovXG4gICAgICAgIHRoaXMuX29uRW5kQ2FsbGJhY2sgPSBvcHRpb25zLm9uRW5kO1xuXG4gICAgICAgIGlmIChoYXNBdWRpb0NvbnRleHQoKSkge1xuICAgICAgICAgICAgLyoqXG4gICAgICAgICAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAgICAgICAgICogQHByaXZhdGVcbiAgICAgICAgICAgICAqL1xuICAgICAgICAgICAgdGhpcy5fc3RhcnRlZEF0ID0gMDtcblxuICAgICAgICAgICAgLyoqXG4gICAgICAgICAgICAgKiBNYW51YWxseSBrZWVwIHRyYWNrIG9mIHRoZSBwbGF5YmFjayBwb3NpdGlvbiBiZWNhdXNlIHRoZSBXZWIgQXVkaW8gQVBJIGRvZXMgbm90XG4gICAgICAgICAgICAgKiBwcm92aWRlIGEgd2F5IHRvIGRvIHRoaXMgYWNjdXJhdGVseSBpZiB0aGUgcGxheWJhY2tSYXRlIGlzIG5vdCAxLlxuICAgICAgICAgICAgICpcbiAgICAgICAgICAgICAqIEB0eXBlIHtudW1iZXJ9XG4gICAgICAgICAgICAgKiBAcHJpdmF0ZVxuICAgICAgICAgICAgICovXG4gICAgICAgICAgICB0aGlzLl9jdXJyZW50VGltZSA9IDA7XG5cbiAgICAgICAgICAgIC8qKlxuICAgICAgICAgICAgICogQHR5cGUge251bWJlcn1cbiAgICAgICAgICAgICAqIEBwcml2YXRlXG4gICAgICAgICAgICAgKi9cbiAgICAgICAgICAgIHRoaXMuX2N1cnJlbnRPZmZzZXQgPSAwO1xuXG4gICAgICAgICAgICAvKipcbiAgICAgICAgICAgICAqIFRoZSBpbnB1dCBub2RlIGlzIHRoZSBvbmUgdGhhdCBpcyBjb25uZWN0ZWQgdG8gdGhlIHNvdXJjZS5cbiAgICAgICAgICAgICAqXG4gICAgICAgICAgICAgKiBAdHlwZSB7QXVkaW9Ob2RlfG51bGx9XG4gICAgICAgICAgICAgKiBAcHJpdmF0ZVxuICAgICAgICAgICAgICovXG4gICAgICAgICAgICB0aGlzLl9pbnB1dE5vZGUgPSBudWxsO1xuXG4gICAgICAgICAgICAvKipcbiAgICAgICAgICAgICAqIFRoZSBjb25uZWN0ZWQgbm9kZSBpcyB0aGUgb25lIHRoYXQgaXMgY29ubmVjdGVkIHRvIHRoZSBkZXN0aW5hdGlvbiAoc3BlYWtlcnMpLiBBbnlcbiAgICAgICAgICAgICAqIGV4dGVybmFsIG5vZGVzIHdpbGwgYmUgY29ubmVjdGVkIHRvIHRoaXMgbm9kZS5cbiAgICAgICAgICAgICAqXG4gICAgICAgICAgICAgKiBAdHlwZSB7QXVkaW9Ob2RlfG51bGx9XG4gICAgICAgICAgICAgKiBAcHJpdmF0ZVxuICAgICAgICAgICAgICovXG4gICAgICAgICAgICB0aGlzLl9jb25uZWN0b3JOb2RlID0gbnVsbDtcblxuICAgICAgICAgICAgLyoqXG4gICAgICAgICAgICAgKiBUaGUgZmlyc3QgZXh0ZXJuYWwgbm9kZSBzZXQgYnkgYSB1c2VyLlxuICAgICAgICAgICAgICpcbiAgICAgICAgICAgICAqIEB0eXBlIHtBdWRpb05vZGV8bnVsbH1cbiAgICAgICAgICAgICAqIEBwcml2YXRlXG4gICAgICAgICAgICAgKi9cbiAgICAgICAgICAgIHRoaXMuX2ZpcnN0Tm9kZSA9IG51bGw7XG5cbiAgICAgICAgICAgIC8qKlxuICAgICAgICAgICAgICogVGhlIGxhc3QgZXh0ZXJuYWwgbm9kZSBzZXQgYnkgYSB1c2VyLlxuICAgICAgICAgICAgICpcbiAgICAgICAgICAgICAqIEB0eXBlIHtBdWRpb05vZGV8bnVsbH1cbiAgICAgICAgICAgICAqIEBwcml2YXRlXG4gICAgICAgICAgICAgKi9cbiAgICAgICAgICAgIHRoaXMuX2xhc3ROb2RlID0gbnVsbDtcblxuICAgICAgICAgICAgLyoqXG4gICAgICAgICAgICAgKiBTZXQgdG8gdHJ1ZSBpZiBhIHBsYXkoKSByZXF1ZXN0IHdhcyBpc3N1ZWQgd2hlbiB0aGUgQXVkaW9Db250ZXh0IHdhcyBzdGlsbCBzdXNwZW5kZWQsXG4gICAgICAgICAgICAgKiBhbmQgd2lsbCB0aGVyZWZvcmUgd2FpdCB1bnRpbCBpdCBpcyByZXN1bWVkIHRvIHBsYXkgdGhlIGF1ZGlvLlxuICAgICAgICAgICAgICpcbiAgICAgICAgICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAgICAgICAgICogQHByaXZhdGVcbiAgICAgICAgICAgICAqL1xuICAgICAgICAgICAgdGhpcy5fd2FpdGluZ0NvbnRleHRTdXNwZW5zaW9uID0gZmFsc2U7XG5cbiAgICAgICAgICAgIHRoaXMuX2luaXRpYWxpemVOb2RlcygpO1xuXG4gICAgICAgICAgICAvKiogQHByaXZhdGUgKi9cbiAgICAgICAgICAgIHRoaXMuX2VuZGVkSGFuZGxlciA9IHRoaXMuX29uRW5kZWQuYmluZCh0aGlzKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8qKiBAcHJpdmF0ZSAqL1xuICAgICAgICAgICAgdGhpcy5faXNSZWFkeSA9IGZhbHNlO1xuXG4gICAgICAgICAgICAvKiogQHByaXZhdGUgKi9cbiAgICAgICAgICAgIHRoaXMuX2xvYWRlZE1ldGFkYXRhSGFuZGxlciA9IHRoaXMuX29uTG9hZGVkTWV0YWRhdGEuYmluZCh0aGlzKTtcbiAgICAgICAgICAgIC8qKiBAcHJpdmF0ZSAqL1xuICAgICAgICAgICAgdGhpcy5fdGltZVVwZGF0ZUhhbmRsZXIgPSB0aGlzLl9vblRpbWVVcGRhdGUuYmluZCh0aGlzKTtcbiAgICAgICAgICAgIC8qKiBAcHJpdmF0ZSAqL1xuICAgICAgICAgICAgdGhpcy5fZW5kZWRIYW5kbGVyID0gdGhpcy5fb25FbmRlZC5iaW5kKHRoaXMpO1xuXG4gICAgICAgICAgICB0aGlzLl9jcmVhdGVTb3VyY2UoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEZpcmVkIHdoZW4gdGhlIGluc3RhbmNlIHN0YXJ0cyBwbGF5aW5nIGl0cyBzb3VyY2UuXG4gICAgICpcbiAgICAgKiBAZXZlbnQgU291bmRJbnN0YW5jZSNwbGF5XG4gICAgICovXG5cbiAgICAvKipcbiAgICAgKiBGaXJlZCB3aGVuIHRoZSBpbnN0YW5jZSBpcyBwYXVzZWQuXG4gICAgICpcbiAgICAgKiBAZXZlbnQgU291bmRJbnN0YW5jZSNwYXVzZVxuICAgICAqL1xuXG4gICAgLyoqXG4gICAgICogRmlyZWQgd2hlbiB0aGUgaW5zdGFuY2UgaXMgcmVzdW1lZC5cbiAgICAgKlxuICAgICAqIEBldmVudCBTb3VuZEluc3RhbmNlI3Jlc3VtZVxuICAgICAqL1xuXG4gICAgLyoqXG4gICAgICogRmlyZWQgd2hlbiB0aGUgaW5zdGFuY2UgaXMgc3RvcHBlZC5cbiAgICAgKlxuICAgICAqIEBldmVudCBTb3VuZEluc3RhbmNlI3N0b3BcbiAgICAgKi9cblxuICAgIC8qKlxuICAgICAqIEZpcmVkIHdoZW4gdGhlIHNvdW5kIGN1cnJlbnRseSBwbGF5ZWQgYnkgdGhlIGluc3RhbmNlIGVuZHMuXG4gICAgICpcbiAgICAgKiBAZXZlbnQgU291bmRJbnN0YW5jZSNlbmRcbiAgICAgKi9cblxuICAgIC8qKlxuICAgICAqIEdldHMgb3Igc2V0cyB0aGUgY3VycmVudCB0aW1lIG9mIHRoZSBzb3VuZCB0aGF0IGlzIHBsYXlpbmcuIElmIHRoZSB2YWx1ZSBwcm92aWRlZCBpcyBiaWdnZXJcbiAgICAgKiB0aGFuIHRoZSBkdXJhdGlvbiBvZiB0aGUgaW5zdGFuY2UgaXQgd2lsbCB3cmFwIGZyb20gdGhlIGJlZ2lubmluZy5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtudW1iZXJ9XG4gICAgICovXG4gICAgc2V0IGN1cnJlbnRUaW1lKHZhbHVlKSB7XG4gICAgICAgIGlmICh2YWx1ZSA8IDApIHJldHVybjtcblxuICAgICAgICBpZiAodGhpcy5fc3RhdGUgPT09IFNUQVRFX1BMQVlJTkcpIHtcbiAgICAgICAgICAgIGNvbnN0IHN1c3BlbmQgPSB0aGlzLl9zdXNwZW5kSW5zdGFuY2VFdmVudHM7XG4gICAgICAgICAgICB0aGlzLl9zdXNwZW5kSW5zdGFuY2VFdmVudHMgPSB0cnVlO1xuXG4gICAgICAgICAgICAvLyBzdG9wIGZpcnN0IHdoaWNoIHdpbGwgc2V0IF9zdGFydE9mZnNldCB0byBudWxsXG4gICAgICAgICAgICB0aGlzLnN0b3AoKTtcblxuICAgICAgICAgICAgLy8gc2V0IF9zdGFydE9mZnNldCBhbmQgcGxheVxuICAgICAgICAgICAgdGhpcy5fc3RhcnRPZmZzZXQgPSB2YWx1ZTtcbiAgICAgICAgICAgIHRoaXMucGxheSgpO1xuICAgICAgICAgICAgdGhpcy5fc3VzcGVuZEluc3RhbmNlRXZlbnRzID0gc3VzcGVuZDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIHNldCBfc3RhcnRPZmZzZXQgd2hpY2ggd2lsbCBiZSB1c2VkIHdoZW4gdGhlIGluc3RhbmNlIHdpbGwgc3RhcnQgcGxheWluZ1xuICAgICAgICAgICAgdGhpcy5fc3RhcnRPZmZzZXQgPSB2YWx1ZTtcbiAgICAgICAgICAgIC8vIHNldCBfY3VycmVudFRpbWVcbiAgICAgICAgICAgIHRoaXMuX2N1cnJlbnRUaW1lID0gdmFsdWU7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBnZXQgY3VycmVudFRpbWUoKSB7XG4gICAgICAgIC8vIGlmIHRoZSB1c2VyIGhhcyBzZXQgdGhlIGN1cnJlbnRUaW1lIGFuZCB3ZSBoYXZlIG5vdCB1c2VkIGl0IHlldFxuICAgICAgICAvLyB0aGVuIGp1c3QgcmV0dXJuIHRoYXRcbiAgICAgICAgaWYgKHRoaXMuX3N0YXJ0T2Zmc2V0ICE9PSBudWxsKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fc3RhcnRPZmZzZXQ7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBpZiB0aGUgc291bmQgaXMgcGF1c2VkIHJldHVybiB0aGUgY3VycmVudFRpbWUgY2FsY3VsYXRlZCB3aGVuXG4gICAgICAgIC8vIHBhdXNlKCkgd2FzIGNhbGxlZFxuICAgICAgICBpZiAodGhpcy5fc3RhdGUgPT09IFNUQVRFX1BBVVNFRCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2N1cnJlbnRUaW1lO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gaWYgdGhlIHNvdW5kIGlzIHN0b3BwZWQgb3Igd2UgZG9uJ3QgaGF2ZSBhIHNvdXJjZVxuICAgICAgICAvLyByZXR1cm4gMFxuICAgICAgICBpZiAodGhpcy5fc3RhdGUgPT09IFNUQVRFX1NUT1BQRUQgfHwgIXRoaXMuc291cmNlKSB7XG4gICAgICAgICAgICByZXR1cm4gMDtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHJlY2FsY3VsYXRlIGN1cnJlbnQgdGltZVxuICAgICAgICB0aGlzLl91cGRhdGVDdXJyZW50VGltZSgpO1xuICAgICAgICByZXR1cm4gdGhpcy5fY3VycmVudFRpbWU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVGhlIGR1cmF0aW9uIG9mIHRoZSBzb3VuZCB0aGF0IHRoZSBpbnN0YW5jZSB3aWxsIHBsYXkgc3RhcnRpbmcgZnJvbSBzdGFydFRpbWUuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqL1xuICAgIHNldCBkdXJhdGlvbih2YWx1ZSkge1xuICAgICAgICB0aGlzLl9kdXJhdGlvbiA9IE1hdGgubWF4KDAsIE51bWJlcih2YWx1ZSkgfHwgMCk7XG5cbiAgICAgICAgLy8gcmVzdGFydFxuICAgICAgICBjb25zdCBpc1BsYXlpbmcgPSB0aGlzLl9zdGF0ZSA9PT0gU1RBVEVfUExBWUlORztcbiAgICAgICAgdGhpcy5zdG9wKCk7XG4gICAgICAgIGlmIChpc1BsYXlpbmcpIHtcbiAgICAgICAgICAgIHRoaXMucGxheSgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2V0IGR1cmF0aW9uKCkge1xuICAgICAgICBpZiAoIXRoaXMuX3NvdW5kKSB7XG4gICAgICAgICAgICByZXR1cm4gMDtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5fZHVyYXRpb24pIHtcbiAgICAgICAgICAgIHJldHVybiBjYXBUaW1lKHRoaXMuX2R1cmF0aW9uLCB0aGlzLl9zb3VuZC5kdXJhdGlvbik7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMuX3NvdW5kLmR1cmF0aW9uO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdHJ1ZSBpZiB0aGUgaW5zdGFuY2UgaXMgY3VycmVudGx5IHBhdXNlZC5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAqL1xuICAgIGdldCBpc1BhdXNlZCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3N0YXRlID09PSBTVEFURV9QQVVTRUQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0cnVlIGlmIHRoZSBpbnN0YW5jZSBpcyBjdXJyZW50bHkgcGxheWluZy5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAqL1xuICAgIGdldCBpc1BsYXlpbmcoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9zdGF0ZSA9PT0gU1RBVEVfUExBWUlORztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRydWUgaWYgdGhlIGluc3RhbmNlIGlzIGN1cnJlbnRseSBzdG9wcGVkLlxuICAgICAqXG4gICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICovXG4gICAgZ2V0IGlzU3RvcHBlZCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3N0YXRlID09PSBTVEFURV9TVE9QUEVEO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdHJ1ZSBpZiB0aGUgaW5zdGFuY2UgaXMgY3VycmVudGx5IHN1c3BlbmRlZCBiZWNhdXNlIHRoZSB3aW5kb3cgaXMgbm90IGZvY3VzZWQuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICAgKi9cbiAgICBnZXQgaXNTdXNwZW5kZWQoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9zdXNwZW5kZWQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSWYgdHJ1ZSB0aGUgaW5zdGFuY2Ugd2lsbCByZXN0YXJ0IHdoZW4gaXQgZmluaXNoZXMgcGxheWluZy5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAqL1xuICAgIHNldCBsb29wKHZhbHVlKSB7XG4gICAgICAgIHRoaXMuX2xvb3AgPSAhIXZhbHVlO1xuICAgICAgICBpZiAodGhpcy5zb3VyY2UpIHtcbiAgICAgICAgICAgIHRoaXMuc291cmNlLmxvb3AgPSB0aGlzLl9sb29wO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2V0IGxvb3AoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9sb29wO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRoZSBwaXRjaCBtb2RpZmllciB0byBwbGF5IHRoZSBzb3VuZCB3aXRoLiBNdXN0IGJlIGxhcmdlciB0aGFuIDAuMDEuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqL1xuICAgIHNldCBwaXRjaChwaXRjaCkge1xuICAgICAgICAvLyBzZXQgb2Zmc2V0IHRvIGN1cnJlbnQgdGltZSBzbyB0aGF0XG4gICAgICAgIC8vIHdlIGNhbGN1bGF0ZSB0aGUgcmVzdCBvZiB0aGUgdGltZSB3aXRoIHRoZSBuZXcgcGl0Y2hcbiAgICAgICAgLy8gZnJvbSBub3cgb25cbiAgICAgICAgdGhpcy5fY3VycmVudE9mZnNldCA9IHRoaXMuY3VycmVudFRpbWU7XG4gICAgICAgIHRoaXMuX3N0YXJ0ZWRBdCA9IHRoaXMuX21hbmFnZXIuY29udGV4dC5jdXJyZW50VGltZTtcblxuICAgICAgICB0aGlzLl9waXRjaCA9IE1hdGgubWF4KE51bWJlcihwaXRjaCkgfHwgMCwgMC4wMSk7XG4gICAgICAgIGlmICh0aGlzLnNvdXJjZSkge1xuICAgICAgICAgICAgdGhpcy5zb3VyY2UucGxheWJhY2tSYXRlLnZhbHVlID0gdGhpcy5fcGl0Y2g7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBnZXQgcGl0Y2goKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9waXRjaDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUaGUgc291bmQgcmVzb3VyY2UgdGhhdCB0aGUgaW5zdGFuY2Ugd2lsbCBwbGF5LlxuICAgICAqXG4gICAgICogQHR5cGUge2ltcG9ydCgnLi9zb3VuZC5qcycpLlNvdW5kfVxuICAgICAqL1xuICAgIHNldCBzb3VuZCh2YWx1ZSkge1xuICAgICAgICB0aGlzLl9zb3VuZCA9IHZhbHVlO1xuXG4gICAgICAgIGlmICh0aGlzLl9zdGF0ZSAhPT0gU1RBVEVfU1RPUFBFRCkge1xuICAgICAgICAgICAgdGhpcy5zdG9wKCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLl9jcmVhdGVTb3VyY2UoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGdldCBzb3VuZCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3NvdW5kO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRoZSBzdGFydCB0aW1lIGZyb20gd2hpY2ggdGhlIHNvdW5kIHdpbGwgc3RhcnQgcGxheWluZy5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtudW1iZXJ9XG4gICAgICovXG4gICAgc2V0IHN0YXJ0VGltZSh2YWx1ZSkge1xuICAgICAgICB0aGlzLl9zdGFydFRpbWUgPSBNYXRoLm1heCgwLCBOdW1iZXIodmFsdWUpIHx8IDApO1xuXG4gICAgICAgIC8vIHJlc3RhcnRcbiAgICAgICAgY29uc3QgaXNQbGF5aW5nID0gdGhpcy5fc3RhdGUgPT09IFNUQVRFX1BMQVlJTkc7XG4gICAgICAgIHRoaXMuc3RvcCgpO1xuICAgICAgICBpZiAoaXNQbGF5aW5nKSB7XG4gICAgICAgICAgICB0aGlzLnBsYXkoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGdldCBzdGFydFRpbWUoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9zdGFydFRpbWU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVGhlIHZvbHVtZSBtb2RpZmllciB0byBwbGF5IHRoZSBzb3VuZCB3aXRoLiBJbiByYW5nZSAwLTEuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqL1xuICAgIHNldCB2b2x1bWUodm9sdW1lKSB7XG4gICAgICAgIHZvbHVtZSA9IG1hdGguY2xhbXAodm9sdW1lLCAwLCAxKTtcbiAgICAgICAgdGhpcy5fdm9sdW1lID0gdm9sdW1lO1xuICAgICAgICBpZiAodGhpcy5nYWluKSB7XG4gICAgICAgICAgICB0aGlzLmdhaW4uZ2Fpbi52YWx1ZSA9IHZvbHVtZSAqIHRoaXMuX21hbmFnZXIudm9sdW1lO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2V0IHZvbHVtZSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3ZvbHVtZTtcbiAgICB9XG5cbiAgICAvKiogQHByaXZhdGUgKi9cbiAgICBfb25QbGF5KCkge1xuICAgICAgICB0aGlzLmZpcmUoJ3BsYXknKTtcblxuICAgICAgICBpZiAodGhpcy5fb25QbGF5Q2FsbGJhY2spXG4gICAgICAgICAgICB0aGlzLl9vblBsYXlDYWxsYmFjayh0aGlzKTtcbiAgICB9XG5cbiAgICAvKiogQHByaXZhdGUgKi9cbiAgICBfb25QYXVzZSgpIHtcbiAgICAgICAgdGhpcy5maXJlKCdwYXVzZScpO1xuXG4gICAgICAgIGlmICh0aGlzLl9vblBhdXNlQ2FsbGJhY2spXG4gICAgICAgICAgICB0aGlzLl9vblBhdXNlQ2FsbGJhY2sodGhpcyk7XG4gICAgfVxuXG4gICAgLyoqIEBwcml2YXRlICovXG4gICAgX29uUmVzdW1lKCkge1xuICAgICAgICB0aGlzLmZpcmUoJ3Jlc3VtZScpO1xuXG4gICAgICAgIGlmICh0aGlzLl9vblJlc3VtZUNhbGxiYWNrKVxuICAgICAgICAgICAgdGhpcy5fb25SZXN1bWVDYWxsYmFjayh0aGlzKTtcbiAgICB9XG5cbiAgICAvKiogQHByaXZhdGUgKi9cbiAgICBfb25TdG9wKCkge1xuICAgICAgICB0aGlzLmZpcmUoJ3N0b3AnKTtcblxuICAgICAgICBpZiAodGhpcy5fb25TdG9wQ2FsbGJhY2spXG4gICAgICAgICAgICB0aGlzLl9vblN0b3BDYWxsYmFjayh0aGlzKTtcbiAgICB9XG5cbiAgICAvKiogQHByaXZhdGUgKi9cbiAgICBfb25FbmRlZCgpIHtcbiAgICAgICAgLy8gdGhlIGNhbGxiYWNrIGlzIG5vdCBmaXJlZCBzeW5jaHJvbm91c2x5XG4gICAgICAgIC8vIHNvIG9ubHkgZGVjcmVtZW50IF9zdXNwZW5kRW5kRXZlbnQgd2hlbiB0aGVcbiAgICAgICAgLy8gY2FsbGJhY2sgaXMgZmlyZWRcbiAgICAgICAgaWYgKHRoaXMuX3N1c3BlbmRFbmRFdmVudCA+IDApIHtcbiAgICAgICAgICAgIHRoaXMuX3N1c3BlbmRFbmRFdmVudC0tO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5maXJlKCdlbmQnKTtcblxuICAgICAgICBpZiAodGhpcy5fb25FbmRDYWxsYmFjaylcbiAgICAgICAgICAgIHRoaXMuX29uRW5kQ2FsbGJhY2sodGhpcyk7XG5cbiAgICAgICAgdGhpcy5zdG9wKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSGFuZGxlIHRoZSBtYW5hZ2VyJ3MgJ3ZvbHVtZWNoYW5nZScgZXZlbnQuXG4gICAgICpcbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9vbk1hbmFnZXJWb2x1bWVDaGFuZ2UoKSB7XG4gICAgICAgIHRoaXMudm9sdW1lID0gdGhpcy5fdm9sdW1lO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEhhbmRsZSB0aGUgbWFuYWdlcidzICdzdXNwZW5kJyBldmVudC5cbiAgICAgKlxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX29uTWFuYWdlclN1c3BlbmQoKSB7XG4gICAgICAgIGlmICh0aGlzLl9zdGF0ZSA9PT0gU1RBVEVfUExBWUlORyAmJiAhdGhpcy5fc3VzcGVuZGVkKSB7XG4gICAgICAgICAgICB0aGlzLl9zdXNwZW5kZWQgPSB0cnVlO1xuICAgICAgICAgICAgdGhpcy5wYXVzZSgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSGFuZGxlIHRoZSBtYW5hZ2VyJ3MgJ3Jlc3VtZScgZXZlbnQuXG4gICAgICpcbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9vbk1hbmFnZXJSZXN1bWUoKSB7XG4gICAgICAgIGlmICh0aGlzLl9zdXNwZW5kZWQpIHtcbiAgICAgICAgICAgIHRoaXMuX3N1c3BlbmRlZCA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5yZXN1bWUoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENyZWF0ZXMgaW50ZXJuYWwgYXVkaW8gbm9kZXMgYW5kIGNvbm5lY3RzIHRoZW0uXG4gICAgICpcbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9pbml0aWFsaXplTm9kZXMoKSB7XG4gICAgICAgIC8vIGNyZWF0ZSBnYWluIG5vZGUgZm9yIHZvbHVtZSBjb250cm9sXG4gICAgICAgIHRoaXMuZ2FpbiA9IHRoaXMuX21hbmFnZXIuY29udGV4dC5jcmVhdGVHYWluKCk7XG4gICAgICAgIHRoaXMuX2lucHV0Tm9kZSA9IHRoaXMuZ2FpbjtcbiAgICAgICAgLy8gdGhlIGdhaW4gbm9kZSBpcyBhbHNvIHRoZSBjb25uZWN0b3Igbm9kZSBmb3IgMkQgc291bmQgaW5zdGFuY2VzXG4gICAgICAgIHRoaXMuX2Nvbm5lY3Rvck5vZGUgPSB0aGlzLmdhaW47XG4gICAgICAgIHRoaXMuX2Nvbm5lY3Rvck5vZGUuY29ubmVjdCh0aGlzLl9tYW5hZ2VyLmNvbnRleHQuZGVzdGluYXRpb24pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEF0dGVtcHQgdG8gYmVnaW4gcGxheWJhY2sgdGhlIHNvdW5kLlxuICAgICAqIElmIHRoZSBBdWRpb0NvbnRleHQgaXMgc3VzcGVuZGVkLCB0aGUgYXVkaW8gd2lsbCBvbmx5IHN0YXJ0IG9uY2UgaXQncyByZXN1bWVkLlxuICAgICAqIElmIHRoZSBzb3VuZCBpcyBhbHJlYWR5IHBsYXlpbmcsIHRoaXMgd2lsbCByZXN0YXJ0IHRoZSBzb3VuZC5cbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtib29sZWFufSBUcnVlIGlmIHRoZSBzb3VuZCB3YXMgc3RhcnRlZCBpbW1lZGlhdGVseS5cbiAgICAgKi9cbiAgICBwbGF5KCkge1xuICAgICAgICBpZiAodGhpcy5fc3RhdGUgIT09IFNUQVRFX1NUT1BQRUQpIHtcbiAgICAgICAgICAgIHRoaXMuc3RvcCgpO1xuICAgICAgICB9XG4gICAgICAgIC8vIHNldCBzdGF0ZSB0byBwbGF5aW5nXG4gICAgICAgIHRoaXMuX3N0YXRlID0gU1RBVEVfUExBWUlORztcbiAgICAgICAgLy8gbm8gbmVlZCBmb3IgdGhpcyBhbnltb3JlXG4gICAgICAgIHRoaXMuX3BsYXlXaGVuTG9hZGVkID0gZmFsc2U7XG5cbiAgICAgICAgLy8gcGxheSgpIHdhcyBhbHJlYWR5IGlzc3VlZCBidXQgaGFzbid0IGFjdHVhbGx5IHN0YXJ0ZWQgeWV0XG4gICAgICAgIGlmICh0aGlzLl93YWl0aW5nQ29udGV4dFN1c3BlbnNpb24pIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIG1hbmFnZXIgaXMgc3VzcGVuZGVkIHNvIGF1ZGlvIGNhbm5vdCBzdGFydCBub3cgLSB3YWl0IGZvciBtYW5hZ2VyIHRvIHJlc3VtZVxuICAgICAgICBpZiAodGhpcy5fbWFuYWdlci5zdXNwZW5kZWQpIHtcbiAgICAgICAgICAgIHRoaXMuX21hbmFnZXIub25jZSgncmVzdW1lJywgdGhpcy5fcGxheUF1ZGlvSW1tZWRpYXRlLCB0aGlzKTtcbiAgICAgICAgICAgIHRoaXMuX3dhaXRpbmdDb250ZXh0U3VzcGVuc2lvbiA9IHRydWU7XG5cbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuX3BsYXlBdWRpb0ltbWVkaWF0ZSgpO1xuXG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEltbWVkaWF0ZWx5IHBsYXkgdGhlIHNvdW5kLlxuICAgICAqIFRoaXMgbWV0aG9kIGFzc3VtZXMgdGhlIEF1ZGlvQ29udGV4dCBpcyByZWFkeSAobm90IHN1c3BlbmRlZCBvciBsb2NrZWQpLlxuICAgICAqXG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfcGxheUF1ZGlvSW1tZWRpYXRlKCkge1xuICAgICAgICB0aGlzLl93YWl0aW5nQ29udGV4dFN1c3BlbnNpb24gPSBmYWxzZTtcblxuICAgICAgICAvLyBiZXR3ZWVuIHBsYXkoKSBhbmQgdGhlIG1hbmFnZXIgYmVpbmcgcmVhZHkgdG8gcGxheSwgYSBzdG9wKCkgb3IgcGF1c2UoKSBjYWxsIHdhcyBtYWRlXG4gICAgICAgIGlmICh0aGlzLl9zdGF0ZSAhPT0gU1RBVEVfUExBWUlORykge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCF0aGlzLnNvdXJjZSkge1xuICAgICAgICAgICAgdGhpcy5fY3JlYXRlU291cmNlKCk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBjYWxjdWxhdGUgc3RhcnQgb2Zmc2V0XG4gICAgICAgIGxldCBvZmZzZXQgPSBjYXBUaW1lKHRoaXMuX3N0YXJ0T2Zmc2V0LCB0aGlzLmR1cmF0aW9uKTtcbiAgICAgICAgb2Zmc2V0ID0gY2FwVGltZSh0aGlzLl9zdGFydFRpbWUgKyBvZmZzZXQsIHRoaXMuX3NvdW5kLmR1cmF0aW9uKTtcbiAgICAgICAgLy8gcmVzZXQgc3RhcnQgb2Zmc2V0IG5vdyB0aGF0IHdlIHN0YXJ0ZWQgdGhlIHNvdW5kXG4gICAgICAgIHRoaXMuX3N0YXJ0T2Zmc2V0ID0gbnVsbDtcblxuICAgICAgICAvLyBzdGFydCBzb3VyY2Ugd2l0aCBzcGVjaWZpZWQgb2Zmc2V0IGFuZCBkdXJhdGlvblxuICAgICAgICBpZiAodGhpcy5fZHVyYXRpb24pIHtcbiAgICAgICAgICAgIHRoaXMuc291cmNlLnN0YXJ0KDAsIG9mZnNldCwgdGhpcy5fZHVyYXRpb24pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5zb3VyY2Uuc3RhcnQoMCwgb2Zmc2V0KTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHJlc2V0IHRpbWVzXG4gICAgICAgIHRoaXMuX3N0YXJ0ZWRBdCA9IHRoaXMuX21hbmFnZXIuY29udGV4dC5jdXJyZW50VGltZTtcbiAgICAgICAgdGhpcy5fY3VycmVudFRpbWUgPSAwO1xuICAgICAgICB0aGlzLl9jdXJyZW50T2Zmc2V0ID0gb2Zmc2V0O1xuXG4gICAgICAgIC8vIEluaXRpYWxpemUgdm9sdW1lIGFuZCBsb29wIC0gbm90ZSBtb3ZlZCB0byBiZSBhZnRlciBzdGFydCgpIGJlY2F1c2Ugb2YgQ2hyb21lIGJ1Z1xuICAgICAgICB0aGlzLnZvbHVtZSA9IHRoaXMuX3ZvbHVtZTtcbiAgICAgICAgdGhpcy5sb29wID0gdGhpcy5fbG9vcDtcbiAgICAgICAgdGhpcy5waXRjaCA9IHRoaXMuX3BpdGNoO1xuXG4gICAgICAgIC8vIGhhbmRsZSBzdXNwZW5kIGV2ZW50cyAvIHZvbHVtZWNoYW5nZSBldmVudHNcbiAgICAgICAgdGhpcy5fbWFuYWdlci5vbigndm9sdW1lY2hhbmdlJywgdGhpcy5fb25NYW5hZ2VyVm9sdW1lQ2hhbmdlLCB0aGlzKTtcbiAgICAgICAgdGhpcy5fbWFuYWdlci5vbignc3VzcGVuZCcsIHRoaXMuX29uTWFuYWdlclN1c3BlbmQsIHRoaXMpO1xuICAgICAgICB0aGlzLl9tYW5hZ2VyLm9uKCdyZXN1bWUnLCB0aGlzLl9vbk1hbmFnZXJSZXN1bWUsIHRoaXMpO1xuICAgICAgICB0aGlzLl9tYW5hZ2VyLm9uKCdkZXN0cm95JywgdGhpcy5fb25NYW5hZ2VyRGVzdHJveSwgdGhpcyk7XG5cbiAgICAgICAgaWYgKCF0aGlzLl9zdXNwZW5kSW5zdGFuY2VFdmVudHMpIHtcbiAgICAgICAgICAgIHRoaXMuX29uUGxheSgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUGF1c2VzIHBsYXliYWNrIG9mIHNvdW5kLiBDYWxsIHJlc3VtZSgpIHRvIHJlc3VtZSBwbGF5YmFjayBmcm9tIHRoZSBzYW1lIHBvc2l0aW9uLlxuICAgICAqXG4gICAgICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgdHJ1ZSBpZiB0aGUgc291bmQgd2FzIHBhdXNlZC5cbiAgICAgKi9cbiAgICBwYXVzZSgpIHtcbiAgICAgICAgLy8gbm8gbmVlZCBmb3IgdGhpcyBhbnltb3JlXG4gICAgICAgIHRoaXMuX3BsYXlXaGVuTG9hZGVkID0gZmFsc2U7XG5cbiAgICAgICAgaWYgKHRoaXMuX3N0YXRlICE9PSBTVEFURV9QTEFZSU5HKVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuXG4gICAgICAgIC8vIHNldCBzdGF0ZSB0byBwYXVzZWRcbiAgICAgICAgdGhpcy5fc3RhdGUgPSBTVEFURV9QQVVTRUQ7XG5cbiAgICAgICAgLy8gcGxheSgpIHdhcyBpc3N1ZWQgYnV0IGhhc24ndCBhY3R1YWxseSBzdGFydGVkIHlldC5cbiAgICAgICAgaWYgKHRoaXMuX3dhaXRpbmdDb250ZXh0U3VzcGVuc2lvbikge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBzdG9yZSBjdXJyZW50IHRpbWVcbiAgICAgICAgdGhpcy5fdXBkYXRlQ3VycmVudFRpbWUoKTtcblxuICAgICAgICAvLyBTdG9wIHRoZSBzb3VyY2UgYW5kIHJlLWNyZWF0ZSBpdCBiZWNhdXNlIHdlIGNhbm5vdCByZXVzZSB0aGUgc2FtZSBzb3VyY2UuXG4gICAgICAgIC8vIFN1c3BlbmQgdGhlIGVuZCBldmVudCBhcyB3ZSBhcmUgbWFudWFsbHkgc3RvcHBpbmcgdGhlIHNvdXJjZVxuICAgICAgICB0aGlzLl9zdXNwZW5kRW5kRXZlbnQrKztcbiAgICAgICAgdGhpcy5zb3VyY2Uuc3RvcCgwKTtcbiAgICAgICAgdGhpcy5zb3VyY2UgPSBudWxsO1xuXG4gICAgICAgIC8vIHJlc2V0IHVzZXItc2V0IHN0YXJ0IG9mZnNldFxuICAgICAgICB0aGlzLl9zdGFydE9mZnNldCA9IG51bGw7XG5cbiAgICAgICAgaWYgKCF0aGlzLl9zdXNwZW5kSW5zdGFuY2VFdmVudHMpXG4gICAgICAgICAgICB0aGlzLl9vblBhdXNlKCk7XG5cbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVzdW1lcyBwbGF5YmFjayBvZiB0aGUgc291bmQuIFBsYXliYWNrIHJlc3VtZXMgYXQgdGhlIHBvaW50IHRoYXQgdGhlIGF1ZGlvIHdhcyBwYXVzZWQuXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyB0cnVlIGlmIHRoZSBzb3VuZCB3YXMgcmVzdW1lZC5cbiAgICAgKi9cbiAgICByZXN1bWUoKSB7XG4gICAgICAgIGlmICh0aGlzLl9zdGF0ZSAhPT0gU1RBVEVfUEFVU0VEKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBzdGFydCBhdCBwb2ludCB3aGVyZSBzb3VuZCB3YXMgcGF1c2VkXG4gICAgICAgIGxldCBvZmZzZXQgPSB0aGlzLmN1cnJlbnRUaW1lO1xuXG4gICAgICAgIC8vIHNldCBzdGF0ZSBiYWNrIHRvIHBsYXlpbmdcbiAgICAgICAgdGhpcy5fc3RhdGUgPSBTVEFURV9QTEFZSU5HO1xuXG4gICAgICAgIC8vIHBsYXkoKSB3YXMgaXNzdWVkIGJ1dCBoYXNuJ3QgYWN0dWFsbHkgc3RhcnRlZCB5ZXRcbiAgICAgICAgaWYgKHRoaXMuX3dhaXRpbmdDb250ZXh0U3VzcGVuc2lvbikge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIXRoaXMuc291cmNlKSB7XG4gICAgICAgICAgICB0aGlzLl9jcmVhdGVTb3VyY2UoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGlmIHRoZSB1c2VyIHNldCB0aGUgJ2N1cnJlbnRUaW1lJyBwcm9wZXJ0eSB3aGlsZSB0aGUgc291bmRcbiAgICAgICAgLy8gd2FzIHBhdXNlZCB0aGVuIHVzZSB0aGF0IGFzIHRoZSBvZmZzZXQgaW5zdGVhZFxuICAgICAgICBpZiAodGhpcy5fc3RhcnRPZmZzZXQgIT09IG51bGwpIHtcbiAgICAgICAgICAgIG9mZnNldCA9IGNhcFRpbWUodGhpcy5fc3RhcnRPZmZzZXQsIHRoaXMuZHVyYXRpb24pO1xuICAgICAgICAgICAgb2Zmc2V0ID0gY2FwVGltZSh0aGlzLl9zdGFydFRpbWUgKyBvZmZzZXQsIHRoaXMuX3NvdW5kLmR1cmF0aW9uKTtcblxuICAgICAgICAgICAgLy8gcmVzZXQgb2Zmc2V0XG4gICAgICAgICAgICB0aGlzLl9zdGFydE9mZnNldCA9IG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBzdGFydCBzb3VyY2VcbiAgICAgICAgaWYgKHRoaXMuX2R1cmF0aW9uKSB7XG4gICAgICAgICAgICB0aGlzLnNvdXJjZS5zdGFydCgwLCBvZmZzZXQsIHRoaXMuX2R1cmF0aW9uKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuc291cmNlLnN0YXJ0KDAsIG9mZnNldCk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl9zdGFydGVkQXQgPSB0aGlzLl9tYW5hZ2VyLmNvbnRleHQuY3VycmVudFRpbWU7XG4gICAgICAgIHRoaXMuX2N1cnJlbnRPZmZzZXQgPSBvZmZzZXQ7XG5cbiAgICAgICAgLy8gSW5pdGlhbGl6ZSBwYXJhbWV0ZXJzXG4gICAgICAgIHRoaXMudm9sdW1lID0gdGhpcy5fdm9sdW1lO1xuICAgICAgICB0aGlzLmxvb3AgPSB0aGlzLl9sb29wO1xuICAgICAgICB0aGlzLnBpdGNoID0gdGhpcy5fcGl0Y2g7XG4gICAgICAgIHRoaXMuX3BsYXlXaGVuTG9hZGVkID0gZmFsc2U7XG5cbiAgICAgICAgaWYgKCF0aGlzLl9zdXNwZW5kSW5zdGFuY2VFdmVudHMpXG4gICAgICAgICAgICB0aGlzLl9vblJlc3VtZSgpO1xuXG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFN0b3BzIHBsYXliYWNrIG9mIHNvdW5kLiBDYWxsaW5nIHBsYXkoKSBhZ2FpbiB3aWxsIHJlc3RhcnQgcGxheWJhY2sgZnJvbSB0aGUgYmVnaW5uaW5nIG9mXG4gICAgICogdGhlIHNvdW5kLlxuICAgICAqXG4gICAgICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgdHJ1ZSBpZiB0aGUgc291bmQgd2FzIHN0b3BwZWQuXG4gICAgICovXG4gICAgc3RvcCgpIHtcbiAgICAgICAgdGhpcy5fcGxheVdoZW5Mb2FkZWQgPSBmYWxzZTtcblxuICAgICAgICBpZiAodGhpcy5fc3RhdGUgPT09IFNUQVRFX1NUT1BQRUQpXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG5cbiAgICAgICAgLy8gc2V0IHN0YXRlIHRvIHN0b3BwZWRcbiAgICAgICAgY29uc3Qgd2FzUGxheWluZyA9IHRoaXMuX3N0YXRlID09PSBTVEFURV9QTEFZSU5HO1xuICAgICAgICB0aGlzLl9zdGF0ZSA9IFNUQVRFX1NUT1BQRUQ7XG5cbiAgICAgICAgLy8gcGxheSgpIHdhcyBpc3N1ZWQgYnV0IGhhc24ndCBhY3R1YWxseSBzdGFydGVkIHlldFxuICAgICAgICBpZiAodGhpcy5fd2FpdGluZ0NvbnRleHRTdXNwZW5zaW9uKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHVuc3Vic2NyaWJlIGZyb20gbWFuYWdlciBldmVudHNcbiAgICAgICAgdGhpcy5fbWFuYWdlci5vZmYoJ3ZvbHVtZWNoYW5nZScsIHRoaXMuX29uTWFuYWdlclZvbHVtZUNoYW5nZSwgdGhpcyk7XG4gICAgICAgIHRoaXMuX21hbmFnZXIub2ZmKCdzdXNwZW5kJywgdGhpcy5fb25NYW5hZ2VyU3VzcGVuZCwgdGhpcyk7XG4gICAgICAgIHRoaXMuX21hbmFnZXIub2ZmKCdyZXN1bWUnLCB0aGlzLl9vbk1hbmFnZXJSZXN1bWUsIHRoaXMpO1xuICAgICAgICB0aGlzLl9tYW5hZ2VyLm9mZignZGVzdHJveScsIHRoaXMuX29uTWFuYWdlckRlc3Ryb3ksIHRoaXMpO1xuXG4gICAgICAgIC8vIHJlc2V0IHN0b3JlZCB0aW1lc1xuICAgICAgICB0aGlzLl9zdGFydGVkQXQgPSAwO1xuICAgICAgICB0aGlzLl9jdXJyZW50VGltZSA9IDA7XG4gICAgICAgIHRoaXMuX2N1cnJlbnRPZmZzZXQgPSAwO1xuXG4gICAgICAgIHRoaXMuX3N0YXJ0T2Zmc2V0ID0gbnVsbDtcblxuICAgICAgICB0aGlzLl9zdXNwZW5kRW5kRXZlbnQrKztcbiAgICAgICAgaWYgKHdhc1BsYXlpbmcgJiYgdGhpcy5zb3VyY2UpIHtcbiAgICAgICAgICAgIHRoaXMuc291cmNlLnN0b3AoMCk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5zb3VyY2UgPSBudWxsO1xuXG4gICAgICAgIGlmICghdGhpcy5fc3VzcGVuZEluc3RhbmNlRXZlbnRzKVxuICAgICAgICAgICAgdGhpcy5fb25TdG9wKCk7XG5cbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ29ubmVjdHMgZXh0ZXJuYWwgV2ViIEF1ZGlvIEFQSSBub2Rlcy4gWW91IG5lZWQgdG8gcGFzcyB0aGUgZmlyc3Qgbm9kZSBvZiB0aGUgbm9kZSBncmFwaFxuICAgICAqIHRoYXQgeW91IGNyZWF0ZWQgZXh0ZXJuYWxseSBhbmQgdGhlIGxhc3Qgbm9kZSBvZiB0aGF0IGdyYXBoLiBUaGUgZmlyc3Qgbm9kZSB3aWxsIGJlXG4gICAgICogY29ubmVjdGVkIHRvIHRoZSBhdWRpbyBzb3VyY2UgYW5kIHRoZSBsYXN0IG5vZGUgd2lsbCBiZSBjb25uZWN0ZWQgdG8gdGhlIGRlc3RpbmF0aW9uIG9mIHRoZVxuICAgICAqIEF1ZGlvQ29udGV4dCAoZS5nLiBzcGVha2VycykuIFJlcXVpcmVzIFdlYiBBdWRpbyBBUEkgc3VwcG9ydC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7QXVkaW9Ob2RlfSBmaXJzdE5vZGUgLSBUaGUgZmlyc3Qgbm9kZSB0aGF0IHdpbGwgYmUgY29ubmVjdGVkIHRvIHRoZSBhdWRpbyBzb3VyY2Ugb2Ygc291bmQgaW5zdGFuY2VzLlxuICAgICAqIEBwYXJhbSB7QXVkaW9Ob2RlfSBbbGFzdE5vZGVdIC0gVGhlIGxhc3Qgbm9kZSB0aGF0IHdpbGwgYmUgY29ubmVjdGVkIHRvIHRoZSBkZXN0aW5hdGlvbiBvZiB0aGUgQXVkaW9Db250ZXh0LlxuICAgICAqIElmIHVuc3BlY2lmaWVkIHRoZW4gdGhlIGZpcnN0Tm9kZSB3aWxsIGJlIGNvbm5lY3RlZCB0byB0aGUgZGVzdGluYXRpb24gaW5zdGVhZC5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGNvbnN0IGNvbnRleHQgPSBhcHAuc3lzdGVtcy5zb3VuZC5jb250ZXh0O1xuICAgICAqIGNvbnN0IGFuYWx5emVyID0gY29udGV4dC5jcmVhdGVBbmFseXplcigpO1xuICAgICAqIGNvbnN0IGRpc3RvcnRpb24gPSBjb250ZXh0LmNyZWF0ZVdhdmVTaGFwZXIoKTtcbiAgICAgKiBjb25zdCBmaWx0ZXIgPSBjb250ZXh0LmNyZWF0ZUJpcXVhZEZpbHRlcigpO1xuICAgICAqIGFuYWx5emVyLmNvbm5lY3QoZGlzdG9ydGlvbik7XG4gICAgICogZGlzdG9ydGlvbi5jb25uZWN0KGZpbHRlcik7XG4gICAgICogaW5zdGFuY2Uuc2V0RXh0ZXJuYWxOb2RlcyhhbmFseXplciwgZmlsdGVyKTtcbiAgICAgKi9cbiAgICBzZXRFeHRlcm5hbE5vZGVzKGZpcnN0Tm9kZSwgbGFzdE5vZGUpIHtcbiAgICAgICAgaWYgKCFmaXJzdE5vZGUpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ1RoZSBmaXJzdE5vZGUgbXVzdCBiZSBhIHZhbGlkIEF1ZGlvIE5vZGUnKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghbGFzdE5vZGUpIHtcbiAgICAgICAgICAgIGxhc3ROb2RlID0gZmlyc3ROb2RlO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gY29ubmVjdGlvbnMgYXJlOlxuICAgICAgICAvLyBzb3VyY2UgLT4gaW5wdXROb2RlIC0+IGNvbm5lY3Rvck5vZGUgLT4gW2ZpcnN0Tm9kZSAtPiAuLi4gLT4gbGFzdE5vZGVdIC0+IHNwZWFrZXJzXG5cbiAgICAgICAgY29uc3Qgc3BlYWtlcnMgPSB0aGlzLl9tYW5hZ2VyLmNvbnRleHQuZGVzdGluYXRpb247XG5cbiAgICAgICAgaWYgKHRoaXMuX2ZpcnN0Tm9kZSAhPT0gZmlyc3ROb2RlKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5fZmlyc3ROb2RlKSB7XG4gICAgICAgICAgICAgICAgLy8gaWYgZmlyc3ROb2RlIGFscmVhZHkgZXhpc3RzIG1lYW5zIHRoZSBjb25uZWN0b3Igbm9kZVxuICAgICAgICAgICAgICAgIC8vIGlzIGNvbm5lY3RlZCB0byBpdCBzbyBkaXNjb25uZWN0IGl0XG4gICAgICAgICAgICAgICAgdGhpcy5fY29ubmVjdG9yTm9kZS5kaXNjb25uZWN0KHRoaXMuX2ZpcnN0Tm9kZSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIGlmIGZpcnN0Tm9kZSBkb2VzIG5vdCBleGlzdCBtZWFucyB0aGF0IGl0cyBjb25uZWN0ZWRcbiAgICAgICAgICAgICAgICAvLyB0byB0aGUgc3BlYWtlcnMgc28gZGlzY29ubmVjdCBpdFxuICAgICAgICAgICAgICAgIHRoaXMuX2Nvbm5lY3Rvck5vZGUuZGlzY29ubmVjdChzcGVha2Vycyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIHNldCBmaXJzdCBub2RlIGFuZCBjb25uZWN0IHdpdGggY29ubmVjdG9yIG5vZGVcbiAgICAgICAgICAgIHRoaXMuX2ZpcnN0Tm9kZSA9IGZpcnN0Tm9kZTtcbiAgICAgICAgICAgIHRoaXMuX2Nvbm5lY3Rvck5vZGUuY29ubmVjdChmaXJzdE5vZGUpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuX2xhc3ROb2RlICE9PSBsYXN0Tm9kZSkge1xuICAgICAgICAgICAgaWYgKHRoaXMuX2xhc3ROb2RlKSB7XG4gICAgICAgICAgICAgICAgLy8gaWYgbGFzdCBub2RlIGV4aXN0cyBtZWFucyBpdCdzIGNvbm5lY3RlZCB0byB0aGUgc3BlYWtlcnMgc28gZGlzY29ubmVjdCBpdFxuICAgICAgICAgICAgICAgIHRoaXMuX2xhc3ROb2RlLmRpc2Nvbm5lY3Qoc3BlYWtlcnMpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBzZXQgbGFzdCBub2RlIGFuZCBjb25uZWN0IHdpdGggc3BlYWtlcnNcbiAgICAgICAgICAgIHRoaXMuX2xhc3ROb2RlID0gbGFzdE5vZGU7XG4gICAgICAgICAgICB0aGlzLl9sYXN0Tm9kZS5jb25uZWN0KHNwZWFrZXJzKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENsZWFycyBhbnkgZXh0ZXJuYWwgbm9kZXMgc2V0IGJ5IHtAbGluayBTb3VuZEluc3RhbmNlI3NldEV4dGVybmFsTm9kZXN9LlxuICAgICAqL1xuICAgIGNsZWFyRXh0ZXJuYWxOb2RlcygpIHtcbiAgICAgICAgY29uc3Qgc3BlYWtlcnMgPSB0aGlzLl9tYW5hZ2VyLmNvbnRleHQuZGVzdGluYXRpb247XG5cbiAgICAgICAgLy8gYnJlYWsgZXhpc3RpbmcgY29ubmVjdGlvbnNcbiAgICAgICAgaWYgKHRoaXMuX2ZpcnN0Tm9kZSkge1xuICAgICAgICAgICAgdGhpcy5fY29ubmVjdG9yTm9kZS5kaXNjb25uZWN0KHRoaXMuX2ZpcnN0Tm9kZSk7XG4gICAgICAgICAgICB0aGlzLl9maXJzdE5vZGUgPSBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuX2xhc3ROb2RlKSB7XG4gICAgICAgICAgICB0aGlzLl9sYXN0Tm9kZS5kaXNjb25uZWN0KHNwZWFrZXJzKTtcbiAgICAgICAgICAgIHRoaXMuX2xhc3ROb2RlID0gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHJlc2V0IGNvbm5lY3QgdG8gc3BlYWtlcnNcbiAgICAgICAgdGhpcy5fY29ubmVjdG9yTm9kZS5jb25uZWN0KHNwZWFrZXJzKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBHZXRzIGFueSBleHRlcm5hbCBub2RlcyBzZXQgYnkge0BsaW5rIFNvdW5kSW5zdGFuY2Ujc2V0RXh0ZXJuYWxOb2Rlc30uXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7QXVkaW9Ob2RlW119IFJldHVybnMgYW4gYXJyYXkgdGhhdCBjb250YWlucyB0aGUgdHdvIG5vZGVzIHNldCBieVxuICAgICAqIHtAbGluayBTb3VuZEluc3RhbmNlI3NldEV4dGVybmFsTm9kZXN9LlxuICAgICAqL1xuICAgIGdldEV4dGVybmFsTm9kZXMoKSB7XG4gICAgICAgIHJldHVybiBbdGhpcy5fZmlyc3ROb2RlLCB0aGlzLl9sYXN0Tm9kZV07XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ3JlYXRlcyB0aGUgc291cmNlIGZvciB0aGUgaW5zdGFuY2UuXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7QXVkaW9CdWZmZXJTb3VyY2VOb2RlfG51bGx9IFJldHVybnMgdGhlIGNyZWF0ZWQgc291cmNlIG9yIG51bGwgaWYgdGhlIHNvdW5kXG4gICAgICogaW5zdGFuY2UgaGFzIG5vIHtAbGluayBTb3VuZH0gYXNzb2NpYXRlZCB3aXRoIGl0LlxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX2NyZWF0ZVNvdXJjZSgpIHtcbiAgICAgICAgaWYgKCF0aGlzLl9zb3VuZCkge1xuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBjb250ZXh0ID0gdGhpcy5fbWFuYWdlci5jb250ZXh0O1xuXG4gICAgICAgIGlmICh0aGlzLl9zb3VuZC5idWZmZXIpIHtcbiAgICAgICAgICAgIHRoaXMuc291cmNlID0gY29udGV4dC5jcmVhdGVCdWZmZXJTb3VyY2UoKTtcbiAgICAgICAgICAgIHRoaXMuc291cmNlLmJ1ZmZlciA9IHRoaXMuX3NvdW5kLmJ1ZmZlcjtcblxuICAgICAgICAgICAgLy8gQ29ubmVjdCB1cCB0aGUgbm9kZXNcbiAgICAgICAgICAgIHRoaXMuc291cmNlLmNvbm5lY3QodGhpcy5faW5wdXROb2RlKTtcblxuICAgICAgICAgICAgLy8gc2V0IGV2ZW50c1xuICAgICAgICAgICAgdGhpcy5zb3VyY2Uub25lbmRlZCA9IHRoaXMuX2VuZGVkSGFuZGxlcjtcblxuICAgICAgICAgICAgLy8gc2V0IGxvb3BTdGFydCBhbmQgbG9vcEVuZCBzbyB0aGF0IHRoZSBzb3VyY2Ugc3RhcnRzIGFuZCBlbmRzIGF0IHRoZSBjb3JyZWN0IHVzZXItc2V0IHRpbWVzXG4gICAgICAgICAgICB0aGlzLnNvdXJjZS5sb29wU3RhcnQgPSBjYXBUaW1lKHRoaXMuX3N0YXJ0VGltZSwgdGhpcy5zb3VyY2UuYnVmZmVyLmR1cmF0aW9uKTtcbiAgICAgICAgICAgIGlmICh0aGlzLl9kdXJhdGlvbikge1xuICAgICAgICAgICAgICAgIHRoaXMuc291cmNlLmxvb3BFbmQgPSBNYXRoLm1heCh0aGlzLnNvdXJjZS5sb29wU3RhcnQsIGNhcFRpbWUodGhpcy5fc3RhcnRUaW1lICsgdGhpcy5fZHVyYXRpb24sIHRoaXMuc291cmNlLmJ1ZmZlci5kdXJhdGlvbikpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHRoaXMuc291cmNlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIGN1cnJlbnQgdGltZSB0YWtpbmcgaW50byBhY2NvdW50IHRoZSB0aW1lIHRoZSBpbnN0YW5jZSBzdGFydGVkIHBsYXlpbmcsIHRoZSBjdXJyZW50XG4gICAgICogcGl0Y2ggYW5kIHRoZSBjdXJyZW50IHRpbWUgb2Zmc2V0LlxuICAgICAqXG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfdXBkYXRlQ3VycmVudFRpbWUoKSB7XG4gICAgICAgIHRoaXMuX2N1cnJlbnRUaW1lID0gY2FwVGltZSgodGhpcy5fbWFuYWdlci5jb250ZXh0LmN1cnJlbnRUaW1lIC0gdGhpcy5fc3RhcnRlZEF0KSAqIHRoaXMuX3BpdGNoICsgdGhpcy5fY3VycmVudE9mZnNldCwgdGhpcy5kdXJhdGlvbik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSGFuZGxlIHRoZSBtYW5hZ2VyJ3MgJ2Rlc3Ryb3knIGV2ZW50LlxuICAgICAqXG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfb25NYW5hZ2VyRGVzdHJveSgpIHtcbiAgICAgICAgaWYgKHRoaXMuc291cmNlICYmIHRoaXMuX3N0YXRlID09PSBTVEFURV9QTEFZSU5HKSB7XG4gICAgICAgICAgICB0aGlzLnNvdXJjZS5zdG9wKDApO1xuICAgICAgICAgICAgdGhpcy5zb3VyY2UgPSBudWxsO1xuICAgICAgICB9XG4gICAgfVxufVxuXG5pZiAoIWhhc0F1ZGlvQ29udGV4dCgpKSB7XG4gICAgT2JqZWN0LmFzc2lnbihTb3VuZEluc3RhbmNlLnByb3RvdHlwZSwge1xuICAgICAgICBwbGF5OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5fc3RhdGUgIT09IFNUQVRFX1NUT1BQRUQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnN0b3AoKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKCF0aGlzLnNvdXJjZSkge1xuICAgICAgICAgICAgICAgIGlmICghdGhpcy5fY3JlYXRlU291cmNlKCkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy52b2x1bWUgPSB0aGlzLl92b2x1bWU7XG4gICAgICAgICAgICB0aGlzLnBpdGNoID0gdGhpcy5fcGl0Y2g7XG4gICAgICAgICAgICB0aGlzLmxvb3AgPSB0aGlzLl9sb29wO1xuXG4gICAgICAgICAgICB0aGlzLnNvdXJjZS5wbGF5KCk7XG4gICAgICAgICAgICB0aGlzLl9zdGF0ZSA9IFNUQVRFX1BMQVlJTkc7XG4gICAgICAgICAgICB0aGlzLl9wbGF5V2hlbkxvYWRlZCA9IGZhbHNlO1xuXG4gICAgICAgICAgICB0aGlzLl9tYW5hZ2VyLm9uKCd2b2x1bWVjaGFuZ2UnLCB0aGlzLl9vbk1hbmFnZXJWb2x1bWVDaGFuZ2UsIHRoaXMpO1xuICAgICAgICAgICAgdGhpcy5fbWFuYWdlci5vbignc3VzcGVuZCcsIHRoaXMuX29uTWFuYWdlclN1c3BlbmQsIHRoaXMpO1xuICAgICAgICAgICAgdGhpcy5fbWFuYWdlci5vbigncmVzdW1lJywgdGhpcy5fb25NYW5hZ2VyUmVzdW1lLCB0aGlzKTtcbiAgICAgICAgICAgIHRoaXMuX21hbmFnZXIub24oJ2Rlc3Ryb3knLCB0aGlzLl9vbk1hbmFnZXJEZXN0cm95LCB0aGlzKTtcblxuICAgICAgICAgICAgLy8gc3VzcGVuZCBpbW1lZGlhdGVseSBpZiBtYW5hZ2VyIGlzIHN1c3BlbmRlZFxuICAgICAgICAgICAgaWYgKHRoaXMuX21hbmFnZXIuc3VzcGVuZGVkKVxuICAgICAgICAgICAgICAgIHRoaXMuX29uTWFuYWdlclN1c3BlbmQoKTtcblxuICAgICAgICAgICAgaWYgKCF0aGlzLl9zdXNwZW5kSW5zdGFuY2VFdmVudHMpXG4gICAgICAgICAgICAgICAgdGhpcy5fb25QbGF5KCk7XG5cbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuXG4gICAgICAgIH0sXG5cbiAgICAgICAgcGF1c2U6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGlmICghdGhpcy5zb3VyY2UgfHwgdGhpcy5fc3RhdGUgIT09IFNUQVRFX1BMQVlJTkcpXG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuXG4gICAgICAgICAgICB0aGlzLl9zdXNwZW5kRW5kRXZlbnQrKztcbiAgICAgICAgICAgIHRoaXMuc291cmNlLnBhdXNlKCk7XG4gICAgICAgICAgICB0aGlzLl9wbGF5V2hlbkxvYWRlZCA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5fc3RhdGUgPSBTVEFURV9QQVVTRUQ7XG4gICAgICAgICAgICB0aGlzLl9zdGFydE9mZnNldCA9IG51bGw7XG5cbiAgICAgICAgICAgIGlmICghdGhpcy5fc3VzcGVuZEluc3RhbmNlRXZlbnRzKVxuICAgICAgICAgICAgICAgIHRoaXMuX29uUGF1c2UoKTtcblxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH0sXG5cbiAgICAgICAgcmVzdW1lOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBpZiAoIXRoaXMuc291cmNlIHx8IHRoaXMuX3N0YXRlICE9PSBTVEFURV9QQVVTRUQpXG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuXG4gICAgICAgICAgICB0aGlzLl9zdGF0ZSA9IFNUQVRFX1BMQVlJTkc7XG4gICAgICAgICAgICB0aGlzLl9wbGF5V2hlbkxvYWRlZCA9IGZhbHNlO1xuICAgICAgICAgICAgaWYgKHRoaXMuc291cmNlLnBhdXNlZCkge1xuICAgICAgICAgICAgICAgIHRoaXMuc291cmNlLnBsYXkoKTtcblxuICAgICAgICAgICAgICAgIGlmICghdGhpcy5fc3VzcGVuZEluc3RhbmNlRXZlbnRzKVxuICAgICAgICAgICAgICAgICAgICB0aGlzLl9vblJlc3VtZSgpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfSxcblxuICAgICAgICBzdG9wOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBpZiAoIXRoaXMuc291cmNlIHx8IHRoaXMuX3N0YXRlID09PSBTVEFURV9TVE9QUEVEKVxuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcblxuICAgICAgICAgICAgdGhpcy5fbWFuYWdlci5vZmYoJ3ZvbHVtZWNoYW5nZScsIHRoaXMuX29uTWFuYWdlclZvbHVtZUNoYW5nZSwgdGhpcyk7XG4gICAgICAgICAgICB0aGlzLl9tYW5hZ2VyLm9mZignc3VzcGVuZCcsIHRoaXMuX29uTWFuYWdlclN1c3BlbmQsIHRoaXMpO1xuICAgICAgICAgICAgdGhpcy5fbWFuYWdlci5vZmYoJ3Jlc3VtZScsIHRoaXMuX29uTWFuYWdlclJlc3VtZSwgdGhpcyk7XG4gICAgICAgICAgICB0aGlzLl9tYW5hZ2VyLm9mZignZGVzdHJveScsIHRoaXMuX29uTWFuYWdlckRlc3Ryb3ksIHRoaXMpO1xuXG4gICAgICAgICAgICB0aGlzLl9zdXNwZW5kRW5kRXZlbnQrKztcbiAgICAgICAgICAgIHRoaXMuc291cmNlLnBhdXNlKCk7XG4gICAgICAgICAgICB0aGlzLl9wbGF5V2hlbkxvYWRlZCA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5fc3RhdGUgPSBTVEFURV9TVE9QUEVEO1xuICAgICAgICAgICAgdGhpcy5fc3RhcnRPZmZzZXQgPSBudWxsO1xuXG4gICAgICAgICAgICBpZiAoIXRoaXMuX3N1c3BlbmRJbnN0YW5jZUV2ZW50cylcbiAgICAgICAgICAgICAgICB0aGlzLl9vblN0b3AoKTtcblxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH0sXG5cbiAgICAgICAgc2V0RXh0ZXJuYWxOb2RlczogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgLy8gbm90IHN1cHBvcnRlZFxuICAgICAgICB9LFxuXG4gICAgICAgIGNsZWFyRXh0ZXJuYWxOb2RlczogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgLy8gbm90IHN1cHBvcnRlZFxuICAgICAgICB9LFxuXG4gICAgICAgIGdldEV4dGVybmFsTm9kZXM6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIC8vIG5vdCBzdXBwb3J0ZWQgYnV0IHJldHVybiBzYW1lIHR5cGUgb2YgcmVzdWx0XG4gICAgICAgICAgICByZXR1cm4gW251bGwsIG51bGxdO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8vIFNldHMgc3RhcnQgdGltZSBhZnRlciBsb2FkZWRtZXRhZGF0YSBpcyBmaXJlZCB3aGljaCBpcyByZXF1aXJlZCBieSBtb3N0IGJyb3dzZXJzXG4gICAgICAgIF9vbkxvYWRlZE1ldGFkYXRhOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB0aGlzLnNvdXJjZS5yZW1vdmVFdmVudExpc3RlbmVyKCdsb2FkZWRtZXRhZGF0YScsIHRoaXMuX2xvYWRlZE1ldGFkYXRhSGFuZGxlcik7XG5cbiAgICAgICAgICAgIHRoaXMuX2lzUmVhZHkgPSB0cnVlO1xuXG4gICAgICAgICAgICAvLyBjYWxjdWxhdGUgc3RhcnQgdGltZSBmb3Igc291cmNlXG4gICAgICAgICAgICBsZXQgb2Zmc2V0ID0gY2FwVGltZSh0aGlzLl9zdGFydE9mZnNldCwgdGhpcy5kdXJhdGlvbik7XG4gICAgICAgICAgICBvZmZzZXQgPSBjYXBUaW1lKHRoaXMuX3N0YXJ0VGltZSArIG9mZnNldCwgdGhpcy5fc291bmQuZHVyYXRpb24pO1xuICAgICAgICAgICAgLy8gcmVzZXQgY3VycmVudFRpbWVcbiAgICAgICAgICAgIHRoaXMuX3N0YXJ0T2Zmc2V0ID0gbnVsbDtcblxuICAgICAgICAgICAgLy8gc2V0IG9mZnNldCBvbiBzb3VyY2VcbiAgICAgICAgICAgIHRoaXMuc291cmNlLmN1cnJlbnRUaW1lID0gb2Zmc2V0O1xuICAgICAgICB9LFxuXG4gICAgICAgIF9jcmVhdGVTb3VyY2U6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLl9zb3VuZCAmJiB0aGlzLl9zb3VuZC5hdWRpbykge1xuXG4gICAgICAgICAgICAgICAgdGhpcy5faXNSZWFkeSA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIHRoaXMuc291cmNlID0gdGhpcy5fc291bmQuYXVkaW8uY2xvbmVOb2RlKHRydWUpO1xuXG4gICAgICAgICAgICAgICAgLy8gc2V0IGV2ZW50c1xuICAgICAgICAgICAgICAgIHRoaXMuc291cmNlLmFkZEV2ZW50TGlzdGVuZXIoJ2xvYWRlZG1ldGFkYXRhJywgdGhpcy5fbG9hZGVkTWV0YWRhdGFIYW5kbGVyKTtcbiAgICAgICAgICAgICAgICB0aGlzLnNvdXJjZS5hZGRFdmVudExpc3RlbmVyKCd0aW1ldXBkYXRlJywgdGhpcy5fdGltZVVwZGF0ZUhhbmRsZXIpO1xuICAgICAgICAgICAgICAgIHRoaXMuc291cmNlLm9uZW5kZWQgPSB0aGlzLl9lbmRlZEhhbmRsZXI7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiB0aGlzLnNvdXJjZTtcbiAgICAgICAgfSxcblxuICAgICAgICAvLyBjYWxsZWQgZXZlcnkgdGltZSB0aGUgJ2N1cnJlbnRUaW1lJyBpcyBjaGFuZ2VkXG4gICAgICAgIF9vblRpbWVVcGRhdGU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGlmICghdGhpcy5fZHVyYXRpb24pXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgICAgICAvLyBpZiB0aGUgY3VycmVudFRpbWUgcGFzc2VzIHRoZSBlbmQgdGhlbiBpZiBsb29waW5nIGdvIGJhY2sgdG8gdGhlIGJlZ2lubmluZ1xuICAgICAgICAgICAgLy8gb3RoZXJ3aXNlIG1hbnVhbGx5IHN0b3BcbiAgICAgICAgICAgIGlmICh0aGlzLnNvdXJjZS5jdXJyZW50VGltZSA+IGNhcFRpbWUodGhpcy5fc3RhcnRUaW1lICsgdGhpcy5fZHVyYXRpb24sIHRoaXMuc291cmNlLmR1cmF0aW9uKSkge1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLmxvb3ApIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zb3VyY2UuY3VycmVudFRpbWUgPSBjYXBUaW1lKHRoaXMuX3N0YXJ0VGltZSwgdGhpcy5zb3VyY2UuZHVyYXRpb24pO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIHJlbW92ZSBsaXN0ZW5lciB0byBwcmV2ZW50IG11bHRpcGxlIGNhbGxzXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc291cmNlLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3RpbWV1cGRhdGUnLCB0aGlzLl90aW1lVXBkYXRlSGFuZGxlcik7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc291cmNlLnBhdXNlKCk7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gY2FsbCB0aGlzIG1hbnVhbGx5IGJlY2F1c2UgaXQgZG9lc24ndCB3b3JrIGluIGFsbCBicm93c2VycyBpbiB0aGlzIGNhc2VcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fb25FbmRlZCgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICBfb25NYW5hZ2VyRGVzdHJveTogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgaWYgKHRoaXMuc291cmNlKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zb3VyY2UucGF1c2UoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KFNvdW5kSW5zdGFuY2UucHJvdG90eXBlLCAndm9sdW1lJywge1xuICAgICAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl92b2x1bWU7XG4gICAgICAgIH0sXG5cbiAgICAgICAgc2V0OiBmdW5jdGlvbiAodm9sdW1lKSB7XG4gICAgICAgICAgICB2b2x1bWUgPSBtYXRoLmNsYW1wKHZvbHVtZSwgMCwgMSk7XG4gICAgICAgICAgICB0aGlzLl92b2x1bWUgPSB2b2x1bWU7XG4gICAgICAgICAgICBpZiAodGhpcy5zb3VyY2UpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNvdXJjZS52b2x1bWUgPSB2b2x1bWUgKiB0aGlzLl9tYW5hZ2VyLnZvbHVtZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KFNvdW5kSW5zdGFuY2UucHJvdG90eXBlLCAncGl0Y2gnLCB7XG4gICAgICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3BpdGNoO1xuICAgICAgICB9LFxuXG4gICAgICAgIHNldDogZnVuY3Rpb24gKHBpdGNoKSB7XG4gICAgICAgICAgICB0aGlzLl9waXRjaCA9IE1hdGgubWF4KE51bWJlcihwaXRjaCkgfHwgMCwgMC4wMSk7XG4gICAgICAgICAgICBpZiAodGhpcy5zb3VyY2UpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNvdXJjZS5wbGF5YmFja1JhdGUgPSB0aGlzLl9waXRjaDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KFNvdW5kSW5zdGFuY2UucHJvdG90eXBlLCAnc291bmQnLCB7XG4gICAgICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3NvdW5kO1xuICAgICAgICB9LFxuXG4gICAgICAgIHNldDogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICB0aGlzLnN0b3AoKTtcbiAgICAgICAgICAgIHRoaXMuX3NvdW5kID0gdmFsdWU7XG4gICAgICAgIH1cbiAgICB9KTtcblxuXG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KFNvdW5kSW5zdGFuY2UucHJvdG90eXBlLCAnY3VycmVudFRpbWUnLCB7XG4gICAgICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgaWYgKHRoaXMuX3N0YXJ0T2Zmc2V0ICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3N0YXJ0T2Zmc2V0O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAodGhpcy5fc3RhdGUgPT09IFNUQVRFX1NUT1BQRUQgfHwgIXRoaXMuc291cmNlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIDA7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiB0aGlzLnNvdXJjZS5jdXJyZW50VGltZSAtIHRoaXMuX3N0YXJ0VGltZTtcbiAgICAgICAgfSxcblxuICAgICAgICBzZXQ6IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgaWYgKHZhbHVlIDwgMCkgcmV0dXJuO1xuXG4gICAgICAgICAgICB0aGlzLl9zdGFydE9mZnNldCA9IHZhbHVlO1xuICAgICAgICAgICAgaWYgKHRoaXMuc291cmNlICYmIHRoaXMuX2lzUmVhZHkpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNvdXJjZS5jdXJyZW50VGltZSA9IGNhcFRpbWUodGhpcy5fc3RhcnRUaW1lICsgY2FwVGltZSh2YWx1ZSwgdGhpcy5kdXJhdGlvbiksIHRoaXMuX3NvdW5kLmR1cmF0aW9uKTtcbiAgICAgICAgICAgICAgICB0aGlzLl9zdGFydE9mZnNldCA9IG51bGw7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9KTtcbn1cblxuZXhwb3J0IHsgU291bmRJbnN0YW5jZSB9O1xuIl0sIm5hbWVzIjpbIlNUQVRFX1BMQVlJTkciLCJTVEFURV9QQVVTRUQiLCJTVEFURV9TVE9QUEVEIiwiY2FwVGltZSIsInRpbWUiLCJkdXJhdGlvbiIsIlNvdW5kSW5zdGFuY2UiLCJFdmVudEhhbmRsZXIiLCJjb25zdHJ1Y3RvciIsIm1hbmFnZXIiLCJzb3VuZCIsIm9wdGlvbnMiLCJzb3VyY2UiLCJfbWFuYWdlciIsIl92b2x1bWUiLCJ2b2x1bWUiLCJ1bmRlZmluZWQiLCJtYXRoIiwiY2xhbXAiLCJOdW1iZXIiLCJfcGl0Y2giLCJwaXRjaCIsIk1hdGgiLCJtYXgiLCJfbG9vcCIsImxvb3AiLCJfc291bmQiLCJfc3RhdGUiLCJfc3VzcGVuZGVkIiwiX3N1c3BlbmRFbmRFdmVudCIsIl9zdXNwZW5kSW5zdGFuY2VFdmVudHMiLCJfcGxheVdoZW5Mb2FkZWQiLCJfc3RhcnRUaW1lIiwic3RhcnRUaW1lIiwiX2R1cmF0aW9uIiwiX3N0YXJ0T2Zmc2V0IiwiX29uUGxheUNhbGxiYWNrIiwib25QbGF5IiwiX29uUGF1c2VDYWxsYmFjayIsIm9uUGF1c2UiLCJfb25SZXN1bWVDYWxsYmFjayIsIm9uUmVzdW1lIiwiX29uU3RvcENhbGxiYWNrIiwib25TdG9wIiwiX29uRW5kQ2FsbGJhY2siLCJvbkVuZCIsImhhc0F1ZGlvQ29udGV4dCIsIl9zdGFydGVkQXQiLCJfY3VycmVudFRpbWUiLCJfY3VycmVudE9mZnNldCIsIl9pbnB1dE5vZGUiLCJfY29ubmVjdG9yTm9kZSIsIl9maXJzdE5vZGUiLCJfbGFzdE5vZGUiLCJfd2FpdGluZ0NvbnRleHRTdXNwZW5zaW9uIiwiX2luaXRpYWxpemVOb2RlcyIsIl9lbmRlZEhhbmRsZXIiLCJfb25FbmRlZCIsImJpbmQiLCJfaXNSZWFkeSIsIl9sb2FkZWRNZXRhZGF0YUhhbmRsZXIiLCJfb25Mb2FkZWRNZXRhZGF0YSIsIl90aW1lVXBkYXRlSGFuZGxlciIsIl9vblRpbWVVcGRhdGUiLCJfY3JlYXRlU291cmNlIiwiY3VycmVudFRpbWUiLCJ2YWx1ZSIsInN1c3BlbmQiLCJzdG9wIiwicGxheSIsIl91cGRhdGVDdXJyZW50VGltZSIsImlzUGxheWluZyIsImlzUGF1c2VkIiwiaXNTdG9wcGVkIiwiaXNTdXNwZW5kZWQiLCJjb250ZXh0IiwicGxheWJhY2tSYXRlIiwiZ2FpbiIsIl9vblBsYXkiLCJmaXJlIiwiX29uUGF1c2UiLCJfb25SZXN1bWUiLCJfb25TdG9wIiwiX29uTWFuYWdlclZvbHVtZUNoYW5nZSIsIl9vbk1hbmFnZXJTdXNwZW5kIiwicGF1c2UiLCJfb25NYW5hZ2VyUmVzdW1lIiwicmVzdW1lIiwiY3JlYXRlR2FpbiIsImNvbm5lY3QiLCJkZXN0aW5hdGlvbiIsInN1c3BlbmRlZCIsIm9uY2UiLCJfcGxheUF1ZGlvSW1tZWRpYXRlIiwib2Zmc2V0Iiwic3RhcnQiLCJvbiIsIl9vbk1hbmFnZXJEZXN0cm95Iiwid2FzUGxheWluZyIsIm9mZiIsInNldEV4dGVybmFsTm9kZXMiLCJmaXJzdE5vZGUiLCJsYXN0Tm9kZSIsImNvbnNvbGUiLCJlcnJvciIsInNwZWFrZXJzIiwiZGlzY29ubmVjdCIsImNsZWFyRXh0ZXJuYWxOb2RlcyIsImdldEV4dGVybmFsTm9kZXMiLCJidWZmZXIiLCJjcmVhdGVCdWZmZXJTb3VyY2UiLCJvbmVuZGVkIiwibG9vcFN0YXJ0IiwibG9vcEVuZCIsIk9iamVjdCIsImFzc2lnbiIsInByb3RvdHlwZSIsInBhdXNlZCIsInJlbW92ZUV2ZW50TGlzdGVuZXIiLCJhdWRpbyIsImNsb25lTm9kZSIsImFkZEV2ZW50TGlzdGVuZXIiLCJkZWZpbmVQcm9wZXJ0eSIsImdldCIsInNldCJdLCJtYXBwaW5ncyI6Ijs7OztBQU1BLE1BQU1BLGFBQWEsR0FBRyxDQUFDLENBQUE7QUFDdkIsTUFBTUMsWUFB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
