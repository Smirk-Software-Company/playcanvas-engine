import { EventHandler } from '../../../core/event-handler.js';
import { math } from '../../../core/math/math.js';
import { Asset } from '../../asset/asset.js';
import { SPRITE_RENDERMODE_SIMPLE } from '../../../scene/constants.js';

/**
 * Handles playing of sprite animations and loading of relevant sprite assets.
 *
 * @augments EventHandler
 * @category Graphics
 */
class SpriteAnimationClip extends EventHandler {
  /**
   * Create a new SpriteAnimationClip instance.
   *
   * @param {import('./component.js').SpriteComponent} component - The sprite component managing
   * this clip.
   * @param {object} data - Data for the new animation clip.
   * @param {number} [data.fps] - Frames per second for the animation clip.
   * @param {boolean} [data.loop] - Whether to loop the animation clip.
   * @param {string} [data.name] - The name of the new animation clip.
   * @param {number} [data.spriteAsset] - The id of the sprite asset that this clip will play.
   */
  constructor(component, data) {
    super();
    this._component = component;
    this._frame = 0;
    this._sprite = null;
    this._spriteAsset = null;
    this.spriteAsset = data.spriteAsset;
    this.name = data.name;
    this.fps = data.fps || 0;
    this.loop = data.loop || false;
    this._playing = false;
    this._paused = false;
    this._time = 0;
  }

  /**
   * Fired when the clip starts playing.
   *
   * @event SpriteAnimationClip#play
   */

  /**
   * Fired when the clip is paused.
   *
   * @event SpriteAnimationClip#pause
   */

  /**
   * Fired when the clip is resumed.
   *
   * @event SpriteAnimationClip#resume
   */

  /**
   * Fired when the clip is stopped.
   *
   * @event SpriteAnimationClip#stop
   */

  /**
   * Fired when the clip stops playing because it reached its ending.
   *
   * @event SpriteAnimationClip#end
   */

  /**
   * Fired when the clip reached the end of its current loop.
   *
   * @event SpriteAnimationClip#loop
   */

  /**
   * The total duration of the animation in seconds.
   *
   * @type {number}
   */
  get duration() {
    if (this._sprite) {
      const fps = this.fps || Number.MIN_VALUE;
      return this._sprite.frameKeys.length / Math.abs(fps);
    }
    return 0;
  }

  /**
   * The index of the frame of the {@link Sprite} currently being rendered.
   *
   * @type {number}
   */
  set frame(value) {
    this._setFrame(value);

    // update time to start of frame
    const fps = this.fps || Number.MIN_VALUE;
    this._setTime(this._frame / fps);
  }
  get frame() {
    return this._frame;
  }

  /**
   * Whether the animation is currently paused.
   *
   * @type {boolean}
   */
  get isPaused() {
    return this._paused;
  }

  /**
   * Whether the animation is currently playing.
   *
   * @type {boolean}
   */
  get isPlaying() {
    return this._playing;
  }

  /**
   * The current sprite used to play the animation.
   *
   * @type {import('../../../scene/sprite.js').Sprite}
   */
  set sprite(value) {
    if (this._sprite) {
      this._sprite.off('set:meshes', this._onSpriteMeshesChange, this);
      this._sprite.off('set:pixelsPerUnit', this._onSpritePpuChanged, this);
      this._sprite.off('set:atlas', this._onSpriteMeshesChange, this);
      if (this._sprite.atlas) {
        this._sprite.atlas.off('set:texture', this._onSpriteMeshesChange, this);
      }
    }
    this._sprite = value;
    if (this._sprite) {
      this._sprite.on('set:meshes', this._onSpriteMeshesChange, this);
      this._sprite.on('set:pixelsPerUnit', this._onSpritePpuChanged, this);
      this._sprite.on('set:atlas', this._onSpriteMeshesChange, this);
      if (this._sprite.atlas) {
        this._sprite.atlas.on('set:texture', this._onSpriteMeshesChange, this);
      }
    }
    if (this._component.currentClip === this) {
      let mi;

      // if we are clearing the sprite clear old mesh instance parameters
      if (!value || !value.atlas) {
        mi = this._component._meshInstance;
        if (mi) {
          mi.deleteParameter('texture_emissiveMap');
          mi.deleteParameter('texture_opacityMap');
        }
        this._component._hideModel();
      } else {
        // otherwise show sprite

        // update texture
        if (value.atlas.texture) {
          mi = this._component._meshInstance;
          if (mi) {
            mi.setParameter('texture_emissiveMap', value.atlas.texture);
            mi.setParameter('texture_opacityMap', value.atlas.texture);
          }
          if (this._component.enabled && this._component.entity.enabled) {
            this._component._showModel();
          }
        }

        // if we have a time then force update
        // frame based on the time (check if fps is not 0 otherwise time will be Infinity)

        /* eslint-disable no-self-assign */
        if (this.time && this.fps) {
          this.time = this.time;
        } else {
          // if we don't have a time
          // then force update frame counter
          this.frame = this.frame;
        }
        /* eslint-enable no-self-assign */
      }
    }
  }

  get sprite() {
    return this._sprite;
  }

  /**
   * The id of the sprite asset used to play the animation.
   *
   * @type {number}
   */
  set spriteAsset(value) {
    const assets = this._component.system.app.assets;
    let id = value;
    if (value instanceof Asset) {
      id = value.id;
    }
    if (this._spriteAsset !== id) {
      if (this._spriteAsset) {
        // clean old event listeners
        const prev = assets.get(this._spriteAsset);
        if (prev) {
          this._unbindSpriteAsset(prev);
        }
      }
      this._spriteAsset = id;

      // bind sprite asset
      if (this._spriteAsset) {
        const asset = assets.get(this._spriteAsset);
        if (!asset) {
          this.sprite = null;
          assets.on('add:' + this._spriteAsset, this._onSpriteAssetAdded, this);
        } else {
          this._bindSpriteAsset(asset);
        }
      } else {
        this.sprite = null;
      }
    }
  }
  get spriteAsset() {
    return this._spriteAsset;
  }

  /**
   * The current time of the animation in seconds.
   *
   * @type {number}
   */
  set time(value) {
    this._setTime(value);
    if (this._sprite) {
      this.frame = Math.min(this._sprite.frameKeys.length - 1, Math.floor(this._time * Math.abs(this.fps)));
    } else {
      this.frame = 0;
    }
  }
  get time() {
    return this._time;
  }

  // When sprite asset is added bind it
  _onSpriteAssetAdded(asset) {
    this._component.system.app.assets.off('add:' + asset.id, this._onSpriteAssetAdded, this);
    if (this._spriteAsset === asset.id) {
      this._bindSpriteAsset(asset);
    }
  }

  // Hook up event handlers on sprite asset
  _bindSpriteAsset(asset) {
    asset.on('load', this._onSpriteAssetLoad, this);
    asset.on('remove', this._onSpriteAssetRemove, this);
    if (asset.resource) {
      this._onSpriteAssetLoad(asset);
    } else {
      this._component.system.app.assets.load(asset);
    }
  }
  _unbindSpriteAsset(asset) {
    if (!asset) {
      return;
    }
    asset.off('load', this._onSpriteAssetLoad, this);
    asset.off('remove', this._onSpriteAssetRemove, this);

    // unbind atlas
    if (asset.resource && !asset.resource.atlas) {
      this._component.system.app.assets.off('load:' + asset.data.textureAtlasAsset, this._onTextureAtlasLoad, this);
    }
  }

  // When sprite asset is loaded make sure the texture atlas asset is loaded too
  // If so then set the sprite, otherwise wait for the atlas to be loaded first
  _onSpriteAssetLoad(asset) {
    if (!asset.resource) {
      this.sprite = null;
    } else {
      if (!asset.resource.atlas) {
        const atlasAssetId = asset.data.textureAtlasAsset;
        const assets = this._component.system.app.assets;
        assets.off('load:' + atlasAssetId, this._onTextureAtlasLoad, this);
        assets.once('load:' + atlasAssetId, this._onTextureAtlasLoad, this);
      } else {
        this.sprite = asset.resource;
      }
    }
  }

  // When atlas is loaded try to reset the sprite asset
  _onTextureAtlasLoad(atlasAsset) {
    const spriteAsset = this._spriteAsset;
    if (spriteAsset instanceof Asset) {
      this._onSpriteAssetLoad(spriteAsset);
    } else {
      this._onSpriteAssetLoad(this._component.system.app.assets.get(spriteAsset));
    }
  }
  _onSpriteAssetRemove(asset) {
    this.sprite = null;
  }

  // If the meshes are re-created make sure
  // we update them in the mesh instance
  _onSpriteMeshesChange() {
    if (this._component.currentClip === this) {
      this._component._showFrame(this.frame);
    }
  }

  // Update frame if ppu changes for 9-sliced sprites
  _onSpritePpuChanged() {
    if (this._component.currentClip === this) {
      if (this.sprite.renderMode !== SPRITE_RENDERMODE_SIMPLE) {
        this._component._showFrame(this.frame);
      }
    }
  }

  /**
   * Advances the animation, looping if necessary.
   *
   * @param {number} dt - The delta time.
   * @private
   */
  _update(dt) {
    if (this.fps === 0) return;
    if (!this._playing || this._paused || !this._sprite) return;
    const dir = this.fps < 0 ? -1 : 1;
    const time = this._time + dt * this._component.speed * dir;
    const duration = this.duration;
    const end = time > duration || time < 0;
    this._setTime(time);
    let frame = this.frame;
    if (this._sprite) {
      frame = Math.floor(this._sprite.frameKeys.length * this._time / duration);
    } else {
      frame = 0;
    }
    if (frame !== this._frame) {
      this._setFrame(frame);
    }
    if (end) {
      if (this.loop) {
        this.fire('loop');
        this._component.fire('loop', this);
      } else {
        this._playing = false;
        this._paused = false;
        this.fire('end');
        this._component.fire('end', this);
      }
    }
  }
  _setTime(value) {
    this._time = value;
    const duration = this.duration;
    if (this._time < 0) {
      if (this.loop) {
        this._time = this._time % duration + duration;
      } else {
        this._time = 0;
      }
    } else if (this._time > duration) {
      if (this.loop) {
        this._time %= duration;
      } else {
        this._time = duration;
      }
    }
  }
  _setFrame(value) {
    if (this._sprite) {
      // clamp frame
      this._frame = math.clamp(value, 0, this._sprite.frameKeys.length - 1);
    } else {
      this._frame = value;
    }
    if (this._component.currentClip === this) {
      this._component._showFrame(this._frame);
    }
  }
  _destroy() {
    // cleanup events
    if (this._spriteAsset) {
      const assets = this._component.system.app.assets;
      this._unbindSpriteAsset(assets.get(this._spriteAsset));
    }

    // remove sprite
    if (this._sprite) {
      this.sprite = null;
    }

    // remove sprite asset
    if (this._spriteAsset) {
      this.spriteAsset = null;
    }
  }

  /**
   * Plays the animation. If it's already playing then this does nothing.
   */
  play() {
    if (this._playing) return;
    this._playing = true;
    this._paused = false;
    this.frame = 0;
    this.fire('play');
    this._component.fire('play', this);
  }

  /**
   * Pauses the animation.
   */
  pause() {
    if (!this._playing || this._paused) return;
    this._paused = true;
    this.fire('pause');
    this._component.fire('pause', this);
  }

  /**
   * Resumes the paused animation.
   */
  resume() {
    if (!this._paused) return;
    this._paused = false;
    this.fire('resume');
    this._component.fire('resume', this);
  }

  /**
   * Stops the animation and resets the animation to the first frame.
   */
  stop() {
    if (!this._playing) return;
    this._playing = false;
    this._paused = false;
    this._time = 0;
    this.frame = 0;
    this.fire('stop');
    this._component.fire('stop', this);
  }
}

export { SpriteAnimationClip };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3ByaXRlLWFuaW1hdGlvbi1jbGlwLmpzIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi9zcmMvZnJhbWV3b3JrL2NvbXBvbmVudHMvc3ByaXRlL3Nwcml0ZS1hbmltYXRpb24tY2xpcC5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBFdmVudEhhbmRsZXIgfSBmcm9tICcuLi8uLi8uLi9jb3JlL2V2ZW50LWhhbmRsZXIuanMnO1xuXG5pbXBvcnQgeyBtYXRoIH0gZnJvbSAnLi4vLi4vLi4vY29yZS9tYXRoL21hdGguanMnO1xuXG5pbXBvcnQgeyBBc3NldCB9IGZyb20gJy4uLy4uL2Fzc2V0L2Fzc2V0LmpzJztcblxuaW1wb3J0IHsgU1BSSVRFX1JFTkRFUk1PREVfU0lNUExFIH0gZnJvbSAnLi4vLi4vLi4vc2NlbmUvY29uc3RhbnRzLmpzJztcblxuLyoqXG4gKiBIYW5kbGVzIHBsYXlpbmcgb2Ygc3ByaXRlIGFuaW1hdGlvbnMgYW5kIGxvYWRpbmcgb2YgcmVsZXZhbnQgc3ByaXRlIGFzc2V0cy5cbiAqXG4gKiBAYXVnbWVudHMgRXZlbnRIYW5kbGVyXG4gKiBAY2F0ZWdvcnkgR3JhcGhpY3NcbiAqL1xuY2xhc3MgU3ByaXRlQW5pbWF0aW9uQ2xpcCBleHRlbmRzIEV2ZW50SGFuZGxlciB7XG4gICAgLyoqXG4gICAgICogQ3JlYXRlIGEgbmV3IFNwcml0ZUFuaW1hdGlvbkNsaXAgaW5zdGFuY2UuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi9jb21wb25lbnQuanMnKS5TcHJpdGVDb21wb25lbnR9IGNvbXBvbmVudCAtIFRoZSBzcHJpdGUgY29tcG9uZW50IG1hbmFnaW5nXG4gICAgICogdGhpcyBjbGlwLlxuICAgICAqIEBwYXJhbSB7b2JqZWN0fSBkYXRhIC0gRGF0YSBmb3IgdGhlIG5ldyBhbmltYXRpb24gY2xpcC5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gW2RhdGEuZnBzXSAtIEZyYW1lcyBwZXIgc2Vjb25kIGZvciB0aGUgYW5pbWF0aW9uIGNsaXAuXG4gICAgICogQHBhcmFtIHtib29sZWFufSBbZGF0YS5sb29wXSAtIFdoZXRoZXIgdG8gbG9vcCB0aGUgYW5pbWF0aW9uIGNsaXAuXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IFtkYXRhLm5hbWVdIC0gVGhlIG5hbWUgb2YgdGhlIG5ldyBhbmltYXRpb24gY2xpcC5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gW2RhdGEuc3ByaXRlQXNzZXRdIC0gVGhlIGlkIG9mIHRoZSBzcHJpdGUgYXNzZXQgdGhhdCB0aGlzIGNsaXAgd2lsbCBwbGF5LlxuICAgICAqL1xuICAgIGNvbnN0cnVjdG9yKGNvbXBvbmVudCwgZGF0YSkge1xuICAgICAgICBzdXBlcigpO1xuXG4gICAgICAgIHRoaXMuX2NvbXBvbmVudCA9IGNvbXBvbmVudDtcblxuICAgICAgICB0aGlzLl9mcmFtZSA9IDA7XG4gICAgICAgIHRoaXMuX3Nwcml0ZSA9IG51bGw7XG4gICAgICAgIHRoaXMuX3Nwcml0ZUFzc2V0ID0gbnVsbDtcbiAgICAgICAgdGhpcy5zcHJpdGVBc3NldCA9IGRhdGEuc3ByaXRlQXNzZXQ7XG5cbiAgICAgICAgdGhpcy5uYW1lID0gZGF0YS5uYW1lO1xuICAgICAgICB0aGlzLmZwcyA9IGRhdGEuZnBzIHx8IDA7XG4gICAgICAgIHRoaXMubG9vcCA9IGRhdGEubG9vcCB8fCBmYWxzZTtcblxuICAgICAgICB0aGlzLl9wbGF5aW5nID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX3BhdXNlZCA9IGZhbHNlO1xuXG4gICAgICAgIHRoaXMuX3RpbWUgPSAwO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEZpcmVkIHdoZW4gdGhlIGNsaXAgc3RhcnRzIHBsYXlpbmcuXG4gICAgICpcbiAgICAgKiBAZXZlbnQgU3ByaXRlQW5pbWF0aW9uQ2xpcCNwbGF5XG4gICAgICovXG5cbiAgICAvKipcbiAgICAgKiBGaXJlZCB3aGVuIHRoZSBjbGlwIGlzIHBhdXNlZC5cbiAgICAgKlxuICAgICAqIEBldmVudCBTcHJpdGVBbmltYXRpb25DbGlwI3BhdXNlXG4gICAgICovXG5cbiAgICAvKipcbiAgICAgKiBGaXJlZCB3aGVuIHRoZSBjbGlwIGlzIHJlc3VtZWQuXG4gICAgICpcbiAgICAgKiBAZXZlbnQgU3ByaXRlQW5pbWF0aW9uQ2xpcCNyZXN1bWVcbiAgICAgKi9cblxuICAgIC8qKlxuICAgICAqIEZpcmVkIHdoZW4gdGhlIGNsaXAgaXMgc3RvcHBlZC5cbiAgICAgKlxuICAgICAqIEBldmVudCBTcHJpdGVBbmltYXRpb25DbGlwI3N0b3BcbiAgICAgKi9cblxuICAgIC8qKlxuICAgICAqIEZpcmVkIHdoZW4gdGhlIGNsaXAgc3RvcHMgcGxheWluZyBiZWNhdXNlIGl0IHJlYWNoZWQgaXRzIGVuZGluZy5cbiAgICAgKlxuICAgICAqIEBldmVudCBTcHJpdGVBbmltYXRpb25DbGlwI2VuZFxuICAgICAqL1xuXG4gICAgLyoqXG4gICAgICogRmlyZWQgd2hlbiB0aGUgY2xpcCByZWFjaGVkIHRoZSBlbmQgb2YgaXRzIGN1cnJlbnQgbG9vcC5cbiAgICAgKlxuICAgICAqIEBldmVudCBTcHJpdGVBbmltYXRpb25DbGlwI2xvb3BcbiAgICAgKi9cblxuICAgIC8qKlxuICAgICAqIFRoZSB0b3RhbCBkdXJhdGlvbiBvZiB0aGUgYW5pbWF0aW9uIGluIHNlY29uZHMuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqL1xuICAgIGdldCBkdXJhdGlvbigpIHtcbiAgICAgICAgaWYgKHRoaXMuX3Nwcml0ZSkge1xuICAgICAgICAgICAgY29uc3QgZnBzID0gdGhpcy5mcHMgfHwgTnVtYmVyLk1JTl9WQUxVRTtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9zcHJpdGUuZnJhbWVLZXlzLmxlbmd0aCAvIE1hdGguYWJzKGZwcyk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIDA7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVGhlIGluZGV4IG9mIHRoZSBmcmFtZSBvZiB0aGUge0BsaW5rIFNwcml0ZX0gY3VycmVudGx5IGJlaW5nIHJlbmRlcmVkLlxuICAgICAqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKi9cbiAgICBzZXQgZnJhbWUodmFsdWUpIHtcbiAgICAgICAgdGhpcy5fc2V0RnJhbWUodmFsdWUpO1xuXG4gICAgICAgIC8vIHVwZGF0ZSB0aW1lIHRvIHN0YXJ0IG9mIGZyYW1lXG4gICAgICAgIGNvbnN0IGZwcyA9IHRoaXMuZnBzIHx8IE51bWJlci5NSU5fVkFMVUU7XG4gICAgICAgIHRoaXMuX3NldFRpbWUodGhpcy5fZnJhbWUgLyBmcHMpO1xuICAgIH1cblxuICAgIGdldCBmcmFtZSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2ZyYW1lO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFdoZXRoZXIgdGhlIGFuaW1hdGlvbiBpcyBjdXJyZW50bHkgcGF1c2VkLlxuICAgICAqXG4gICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICovXG4gICAgZ2V0IGlzUGF1c2VkKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fcGF1c2VkO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFdoZXRoZXIgdGhlIGFuaW1hdGlvbiBpcyBjdXJyZW50bHkgcGxheWluZy5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAqL1xuICAgIGdldCBpc1BsYXlpbmcoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9wbGF5aW5nO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRoZSBjdXJyZW50IHNwcml0ZSB1c2VkIHRvIHBsYXkgdGhlIGFuaW1hdGlvbi5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtpbXBvcnQoJy4uLy4uLy4uL3NjZW5lL3Nwcml0ZS5qcycpLlNwcml0ZX1cbiAgICAgKi9cbiAgICBzZXQgc3ByaXRlKHZhbHVlKSB7XG4gICAgICAgIGlmICh0aGlzLl9zcHJpdGUpIHtcbiAgICAgICAgICAgIHRoaXMuX3Nwcml0ZS5vZmYoJ3NldDptZXNoZXMnLCB0aGlzLl9vblNwcml0ZU1lc2hlc0NoYW5nZSwgdGhpcyk7XG4gICAgICAgICAgICB0aGlzLl9zcHJpdGUub2ZmKCdzZXQ6cGl4ZWxzUGVyVW5pdCcsIHRoaXMuX29uU3ByaXRlUHB1Q2hhbmdlZCwgdGhpcyk7XG4gICAgICAgICAgICB0aGlzLl9zcHJpdGUub2ZmKCdzZXQ6YXRsYXMnLCB0aGlzLl9vblNwcml0ZU1lc2hlc0NoYW5nZSwgdGhpcyk7XG4gICAgICAgICAgICBpZiAodGhpcy5fc3ByaXRlLmF0bGFzKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fc3ByaXRlLmF0bGFzLm9mZignc2V0OnRleHR1cmUnLCB0aGlzLl9vblNwcml0ZU1lc2hlc0NoYW5nZSwgdGhpcyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl9zcHJpdGUgPSB2YWx1ZTtcblxuICAgICAgICBpZiAodGhpcy5fc3ByaXRlKSB7XG4gICAgICAgICAgICB0aGlzLl9zcHJpdGUub24oJ3NldDptZXNoZXMnLCB0aGlzLl9vblNwcml0ZU1lc2hlc0NoYW5nZSwgdGhpcyk7XG4gICAgICAgICAgICB0aGlzLl9zcHJpdGUub24oJ3NldDpwaXhlbHNQZXJVbml0JywgdGhpcy5fb25TcHJpdGVQcHVDaGFuZ2VkLCB0aGlzKTtcbiAgICAgICAgICAgIHRoaXMuX3Nwcml0ZS5vbignc2V0OmF0bGFzJywgdGhpcy5fb25TcHJpdGVNZXNoZXNDaGFuZ2UsIHRoaXMpO1xuXG4gICAgICAgICAgICBpZiAodGhpcy5fc3ByaXRlLmF0bGFzKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fc3ByaXRlLmF0bGFzLm9uKCdzZXQ6dGV4dHVyZScsIHRoaXMuX29uU3ByaXRlTWVzaGVzQ2hhbmdlLCB0aGlzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLl9jb21wb25lbnQuY3VycmVudENsaXAgPT09IHRoaXMpIHtcbiAgICAgICAgICAgIGxldCBtaTtcblxuICAgICAgICAgICAgLy8gaWYgd2UgYXJlIGNsZWFyaW5nIHRoZSBzcHJpdGUgY2xlYXIgb2xkIG1lc2ggaW5zdGFuY2UgcGFyYW1ldGVyc1xuICAgICAgICAgICAgaWYgKCF2YWx1ZSB8fCAhdmFsdWUuYXRsYXMpIHtcbiAgICAgICAgICAgICAgICBtaSA9IHRoaXMuX2NvbXBvbmVudC5fbWVzaEluc3RhbmNlO1xuICAgICAgICAgICAgICAgIGlmIChtaSkge1xuICAgICAgICAgICAgICAgICAgICBtaS5kZWxldGVQYXJhbWV0ZXIoJ3RleHR1cmVfZW1pc3NpdmVNYXAnKTtcbiAgICAgICAgICAgICAgICAgICAgbWkuZGVsZXRlUGFyYW1ldGVyKCd0ZXh0dXJlX29wYWNpdHlNYXAnKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB0aGlzLl9jb21wb25lbnQuX2hpZGVNb2RlbCgpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBvdGhlcndpc2Ugc2hvdyBzcHJpdGVcblxuICAgICAgICAgICAgICAgIC8vIHVwZGF0ZSB0ZXh0dXJlXG4gICAgICAgICAgICAgICAgaWYgKHZhbHVlLmF0bGFzLnRleHR1cmUpIHtcbiAgICAgICAgICAgICAgICAgICAgbWkgPSB0aGlzLl9jb21wb25lbnQuX21lc2hJbnN0YW5jZTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKG1pKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBtaS5zZXRQYXJhbWV0ZXIoJ3RleHR1cmVfZW1pc3NpdmVNYXAnLCB2YWx1ZS5hdGxhcy50ZXh0dXJlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIG1pLnNldFBhcmFtZXRlcigndGV4dHVyZV9vcGFjaXR5TWFwJywgdmFsdWUuYXRsYXMudGV4dHVyZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5fY29tcG9uZW50LmVuYWJsZWQgJiYgdGhpcy5fY29tcG9uZW50LmVudGl0eS5lbmFibGVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9jb21wb25lbnQuX3Nob3dNb2RlbCgpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gaWYgd2UgaGF2ZSBhIHRpbWUgdGhlbiBmb3JjZSB1cGRhdGVcbiAgICAgICAgICAgICAgICAvLyBmcmFtZSBiYXNlZCBvbiB0aGUgdGltZSAoY2hlY2sgaWYgZnBzIGlzIG5vdCAwIG90aGVyd2lzZSB0aW1lIHdpbGwgYmUgSW5maW5pdHkpXG5cbiAgICAgICAgICAgICAgICAvKiBlc2xpbnQtZGlzYWJsZSBuby1zZWxmLWFzc2lnbiAqL1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLnRpbWUgJiYgdGhpcy5mcHMpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50aW1lID0gdGhpcy50aW1lO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIGlmIHdlIGRvbid0IGhhdmUgYSB0aW1lXG4gICAgICAgICAgICAgICAgICAgIC8vIHRoZW4gZm9yY2UgdXBkYXRlIGZyYW1lIGNvdW50ZXJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5mcmFtZSA9IHRoaXMuZnJhbWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIC8qIGVzbGludC1lbmFibGUgbm8tc2VsZi1hc3NpZ24gKi9cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGdldCBzcHJpdGUoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9zcHJpdGU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVGhlIGlkIG9mIHRoZSBzcHJpdGUgYXNzZXQgdXNlZCB0byBwbGF5IHRoZSBhbmltYXRpb24uXG4gICAgICpcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqL1xuICAgIHNldCBzcHJpdGVBc3NldCh2YWx1ZSkge1xuICAgICAgICBjb25zdCBhc3NldHMgPSB0aGlzLl9jb21wb25lbnQuc3lzdGVtLmFwcC5hc3NldHM7XG4gICAgICAgIGxldCBpZCA9IHZhbHVlO1xuXG4gICAgICAgIGlmICh2YWx1ZSBpbnN0YW5jZW9mIEFzc2V0KSB7XG4gICAgICAgICAgICBpZCA9IHZhbHVlLmlkO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuX3Nwcml0ZUFzc2V0ICE9PSBpZCkge1xuICAgICAgICAgICAgaWYgKHRoaXMuX3Nwcml0ZUFzc2V0KSB7XG4gICAgICAgICAgICAgICAgLy8gY2xlYW4gb2xkIGV2ZW50IGxpc3RlbmVyc1xuICAgICAgICAgICAgICAgIGNvbnN0IHByZXYgPSBhc3NldHMuZ2V0KHRoaXMuX3Nwcml0ZUFzc2V0KTtcbiAgICAgICAgICAgICAgICBpZiAocHJldikge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl91bmJpbmRTcHJpdGVBc3NldChwcmV2KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuX3Nwcml0ZUFzc2V0ID0gaWQ7XG5cbiAgICAgICAgICAgIC8vIGJpbmQgc3ByaXRlIGFzc2V0XG4gICAgICAgICAgICBpZiAodGhpcy5fc3ByaXRlQXNzZXQpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBhc3NldCA9IGFzc2V0cy5nZXQodGhpcy5fc3ByaXRlQXNzZXQpO1xuICAgICAgICAgICAgICAgIGlmICghYXNzZXQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zcHJpdGUgPSBudWxsO1xuICAgICAgICAgICAgICAgICAgICBhc3NldHMub24oJ2FkZDonICsgdGhpcy5fc3ByaXRlQXNzZXQsIHRoaXMuX29uU3ByaXRlQXNzZXRBZGRlZCwgdGhpcyk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fYmluZFNwcml0ZUFzc2V0KGFzc2V0KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMuc3ByaXRlID0gbnVsbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGdldCBzcHJpdGVBc3NldCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3Nwcml0ZUFzc2V0O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRoZSBjdXJyZW50IHRpbWUgb2YgdGhlIGFuaW1hdGlvbiBpbiBzZWNvbmRzLlxuICAgICAqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKi9cbiAgICBzZXQgdGltZSh2YWx1ZSkge1xuICAgICAgICB0aGlzLl9zZXRUaW1lKHZhbHVlKTtcblxuICAgICAgICBpZiAodGhpcy5fc3ByaXRlKSB7XG4gICAgICAgICAgICB0aGlzLmZyYW1lID0gTWF0aC5taW4odGhpcy5fc3ByaXRlLmZyYW1lS2V5cy5sZW5ndGggLSAxLCBNYXRoLmZsb29yKHRoaXMuX3RpbWUgKiBNYXRoLmFicyh0aGlzLmZwcykpKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuZnJhbWUgPSAwO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2V0IHRpbWUoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl90aW1lO1xuICAgIH1cblxuICAgIC8vIFdoZW4gc3ByaXRlIGFzc2V0IGlzIGFkZGVkIGJpbmQgaXRcbiAgICBfb25TcHJpdGVBc3NldEFkZGVkKGFzc2V0KSB7XG4gICAgICAgIHRoaXMuX2NvbXBvbmVudC5zeXN0ZW0uYXBwLmFzc2V0cy5vZmYoJ2FkZDonICsgYXNzZXQuaWQsIHRoaXMuX29uU3ByaXRlQXNzZXRBZGRlZCwgdGhpcyk7XG4gICAgICAgIGlmICh0aGlzLl9zcHJpdGVBc3NldCA9PT0gYXNzZXQuaWQpIHtcbiAgICAgICAgICAgIHRoaXMuX2JpbmRTcHJpdGVBc3NldChhc3NldCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBIb29rIHVwIGV2ZW50IGhhbmRsZXJzIG9uIHNwcml0ZSBhc3NldFxuICAgIF9iaW5kU3ByaXRlQXNzZXQoYXNzZXQpIHtcbiAgICAgICAgYXNzZXQub24oJ2xvYWQnLCB0aGlzLl9vblNwcml0ZUFzc2V0TG9hZCwgdGhpcyk7XG4gICAgICAgIGFzc2V0Lm9uKCdyZW1vdmUnLCB0aGlzLl9vblNwcml0ZUFzc2V0UmVtb3ZlLCB0aGlzKTtcblxuICAgICAgICBpZiAoYXNzZXQucmVzb3VyY2UpIHtcbiAgICAgICAgICAgIHRoaXMuX29uU3ByaXRlQXNzZXRMb2FkKGFzc2V0KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuX2NvbXBvbmVudC5zeXN0ZW0uYXBwLmFzc2V0cy5sb2FkKGFzc2V0KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIF91bmJpbmRTcHJpdGVBc3NldChhc3NldCkge1xuICAgICAgICBpZiAoIWFzc2V0KSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBhc3NldC5vZmYoJ2xvYWQnLCB0aGlzLl9vblNwcml0ZUFzc2V0TG9hZCwgdGhpcyk7XG4gICAgICAgIGFzc2V0Lm9mZigncmVtb3ZlJywgdGhpcy5fb25TcHJpdGVBc3NldFJlbW92ZSwgdGhpcyk7XG5cbiAgICAgICAgLy8gdW5iaW5kIGF0bGFzXG4gICAgICAgIGlmIChhc3NldC5yZXNvdXJjZSAmJiAhYXNzZXQucmVzb3VyY2UuYXRsYXMpIHtcbiAgICAgICAgICAgIHRoaXMuX2NvbXBvbmVudC5zeXN0ZW0uYXBwLmFzc2V0cy5vZmYoJ2xvYWQ6JyArIGFzc2V0LmRhdGEudGV4dHVyZUF0bGFzQXNzZXQsIHRoaXMuX29uVGV4dHVyZUF0bGFzTG9hZCwgdGhpcyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBXaGVuIHNwcml0ZSBhc3NldCBpcyBsb2FkZWQgbWFrZSBzdXJlIHRoZSB0ZXh0dXJlIGF0bGFzIGFzc2V0IGlzIGxvYWRlZCB0b29cbiAgICAvLyBJZiBzbyB0aGVuIHNldCB0aGUgc3ByaXRlLCBvdGhlcndpc2Ugd2FpdCBmb3IgdGhlIGF0bGFzIHRvIGJlIGxvYWRlZCBmaXJzdFxuICAgIF9vblNwcml0ZUFzc2V0TG9hZChhc3NldCkge1xuICAgICAgICBpZiAoIWFzc2V0LnJlc291cmNlKSB7XG4gICAgICAgICAgICB0aGlzLnNwcml0ZSA9IG51bGw7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpZiAoIWFzc2V0LnJlc291cmNlLmF0bGFzKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgYXRsYXNBc3NldElkID0gYXNzZXQuZGF0YS50ZXh0dXJlQXRsYXNBc3NldDtcbiAgICAgICAgICAgICAgICBjb25zdCBhc3NldHMgPSB0aGlzLl9jb21wb25lbnQuc3lzdGVtLmFwcC5hc3NldHM7XG4gICAgICAgICAgICAgICAgYXNzZXRzLm9mZignbG9hZDonICsgYXRsYXNBc3NldElkLCB0aGlzLl9vblRleHR1cmVBdGxhc0xvYWQsIHRoaXMpO1xuICAgICAgICAgICAgICAgIGFzc2V0cy5vbmNlKCdsb2FkOicgKyBhdGxhc0Fzc2V0SWQsIHRoaXMuX29uVGV4dHVyZUF0bGFzTG9hZCwgdGhpcyk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMuc3ByaXRlID0gYXNzZXQucmVzb3VyY2U7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBXaGVuIGF0bGFzIGlzIGxvYWRlZCB0cnkgdG8gcmVzZXQgdGhlIHNwcml0ZSBhc3NldFxuICAgIF9vblRleHR1cmVBdGxhc0xvYWQoYXRsYXNBc3NldCkge1xuICAgICAgICBjb25zdCBzcHJpdGVBc3NldCA9IHRoaXMuX3Nwcml0ZUFzc2V0O1xuICAgICAgICBpZiAoc3ByaXRlQXNzZXQgaW5zdGFuY2VvZiBBc3NldCkge1xuICAgICAgICAgICAgdGhpcy5fb25TcHJpdGVBc3NldExvYWQoc3ByaXRlQXNzZXQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5fb25TcHJpdGVBc3NldExvYWQodGhpcy5fY29tcG9uZW50LnN5c3RlbS5hcHAuYXNzZXRzLmdldChzcHJpdGVBc3NldCkpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgX29uU3ByaXRlQXNzZXRSZW1vdmUoYXNzZXQpIHtcbiAgICAgICAgdGhpcy5zcHJpdGUgPSBudWxsO1xuICAgIH1cblxuICAgIC8vIElmIHRoZSBtZXNoZXMgYXJlIHJlLWNyZWF0ZWQgbWFrZSBzdXJlXG4gICAgLy8gd2UgdXBkYXRlIHRoZW0gaW4gdGhlIG1lc2ggaW5zdGFuY2VcbiAgICBfb25TcHJpdGVNZXNoZXNDaGFuZ2UoKSB7XG4gICAgICAgIGlmICh0aGlzLl9jb21wb25lbnQuY3VycmVudENsaXAgPT09IHRoaXMpIHtcbiAgICAgICAgICAgIHRoaXMuX2NvbXBvbmVudC5fc2hvd0ZyYW1lKHRoaXMuZnJhbWUpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gVXBkYXRlIGZyYW1lIGlmIHBwdSBjaGFuZ2VzIGZvciA5LXNsaWNlZCBzcHJpdGVzXG4gICAgX29uU3ByaXRlUHB1Q2hhbmdlZCgpIHtcbiAgICAgICAgaWYgKHRoaXMuX2NvbXBvbmVudC5jdXJyZW50Q2xpcCA9PT0gdGhpcykge1xuICAgICAgICAgICAgaWYgKHRoaXMuc3ByaXRlLnJlbmRlck1vZGUgIT09IFNQUklURV9SRU5ERVJNT0RFX1NJTVBMRSkge1xuICAgICAgICAgICAgICAgIHRoaXMuX2NvbXBvbmVudC5fc2hvd0ZyYW1lKHRoaXMuZnJhbWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQWR2YW5jZXMgdGhlIGFuaW1hdGlvbiwgbG9vcGluZyBpZiBuZWNlc3NhcnkuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gZHQgLSBUaGUgZGVsdGEgdGltZS5cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF91cGRhdGUoZHQpIHtcbiAgICAgICAgaWYgKHRoaXMuZnBzID09PSAwKSByZXR1cm47XG4gICAgICAgIGlmICghdGhpcy5fcGxheWluZyB8fCB0aGlzLl9wYXVzZWQgfHwgIXRoaXMuX3Nwcml0ZSkgcmV0dXJuO1xuXG4gICAgICAgIGNvbnN0IGRpciA9IHRoaXMuZnBzIDwgMCA/IC0xIDogMTtcbiAgICAgICAgY29uc3QgdGltZSA9IHRoaXMuX3RpbWUgKyBkdCAqIHRoaXMuX2NvbXBvbmVudC5zcGVlZCAqIGRpcjtcbiAgICAgICAgY29uc3QgZHVyYXRpb24gPSB0aGlzLmR1cmF0aW9uO1xuICAgICAgICBjb25zdCBlbmQgPSAodGltZSA+IGR1cmF0aW9uIHx8IHRpbWUgPCAwKTtcblxuICAgICAgICB0aGlzLl9zZXRUaW1lKHRpbWUpO1xuXG4gICAgICAgIGxldCBmcmFtZSA9IHRoaXMuZnJhbWU7XG4gICAgICAgIGlmICh0aGlzLl9zcHJpdGUpIHtcbiAgICAgICAgICAgIGZyYW1lID0gTWF0aC5mbG9vcih0aGlzLl9zcHJpdGUuZnJhbWVLZXlzLmxlbmd0aCAqIHRoaXMuX3RpbWUgLyBkdXJhdGlvbik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBmcmFtZSA9IDA7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoZnJhbWUgIT09IHRoaXMuX2ZyYW1lKSB7XG4gICAgICAgICAgICB0aGlzLl9zZXRGcmFtZShmcmFtZSk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoZW5kKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5sb29wKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5maXJlKCdsb29wJyk7XG4gICAgICAgICAgICAgICAgdGhpcy5fY29tcG9uZW50LmZpcmUoJ2xvb3AnLCB0aGlzKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fcGxheWluZyA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIHRoaXMuX3BhdXNlZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIHRoaXMuZmlyZSgnZW5kJyk7XG4gICAgICAgICAgICAgICAgdGhpcy5fY29tcG9uZW50LmZpcmUoJ2VuZCcsIHRoaXMpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgX3NldFRpbWUodmFsdWUpIHtcbiAgICAgICAgdGhpcy5fdGltZSA9IHZhbHVlO1xuICAgICAgICBjb25zdCBkdXJhdGlvbiA9IHRoaXMuZHVyYXRpb247XG4gICAgICAgIGlmICh0aGlzLl90aW1lIDwgMCkge1xuICAgICAgICAgICAgaWYgKHRoaXMubG9vcCkge1xuICAgICAgICAgICAgICAgIHRoaXMuX3RpbWUgPSB0aGlzLl90aW1lICUgZHVyYXRpb24gKyBkdXJhdGlvbjtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fdGltZSA9IDA7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5fdGltZSA+IGR1cmF0aW9uKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5sb29wKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fdGltZSAlPSBkdXJhdGlvbjtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fdGltZSA9IGR1cmF0aW9uO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgX3NldEZyYW1lKHZhbHVlKSB7XG4gICAgICAgIGlmICh0aGlzLl9zcHJpdGUpIHtcbiAgICAgICAgICAgIC8vIGNsYW1wIGZyYW1lXG4gICAgICAgICAgICB0aGlzLl9mcmFtZSA9IG1hdGguY2xhbXAodmFsdWUsIDAsIHRoaXMuX3Nwcml0ZS5mcmFtZUtleXMubGVuZ3RoIC0gMSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLl9mcmFtZSA9IHZhbHVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuX2NvbXBvbmVudC5jdXJyZW50Q2xpcCA9PT0gdGhpcykge1xuICAgICAgICAgICAgdGhpcy5fY29tcG9uZW50Ll9zaG93RnJhbWUodGhpcy5fZnJhbWUpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgX2Rlc3Ryb3koKSB7XG4gICAgICAgIC8vIGNsZWFudXAgZXZlbnRzXG4gICAgICAgIGlmICh0aGlzLl9zcHJpdGVBc3NldCkge1xuICAgICAgICAgICAgY29uc3QgYXNzZXRzID0gdGhpcy5fY29tcG9uZW50LnN5c3RlbS5hcHAuYXNzZXRzO1xuICAgICAgICAgICAgdGhpcy5fdW5iaW5kU3ByaXRlQXNzZXQoYXNzZXRzLmdldCh0aGlzLl9zcHJpdGVBc3NldCkpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gcmVtb3ZlIHNwcml0ZVxuICAgICAgICBpZiAodGhpcy5fc3ByaXRlKSB7XG4gICAgICAgICAgICB0aGlzLnNwcml0ZSA9IG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICAvLyByZW1vdmUgc3ByaXRlIGFzc2V0XG4gICAgICAgIGlmICh0aGlzLl9zcHJpdGVBc3NldCkge1xuICAgICAgICAgICAgdGhpcy5zcHJpdGVBc3NldCA9IG51bGw7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBQbGF5cyB0aGUgYW5pbWF0aW9uLiBJZiBpdCdzIGFscmVhZHkgcGxheWluZyB0aGVuIHRoaXMgZG9lcyBub3RoaW5nLlxuICAgICAqL1xuICAgIHBsYXkoKSB7XG4gICAgICAgIGlmICh0aGlzLl9wbGF5aW5nKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHRoaXMuX3BsYXlpbmcgPSB0cnVlO1xuICAgICAgICB0aGlzLl9wYXVzZWQgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5mcmFtZSA9IDA7XG5cbiAgICAgICAgdGhpcy5maXJlKCdwbGF5Jyk7XG4gICAgICAgIHRoaXMuX2NvbXBvbmVudC5maXJlKCdwbGF5JywgdGhpcyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUGF1c2VzIHRoZSBhbmltYXRpb24uXG4gICAgICovXG4gICAgcGF1c2UoKSB7XG4gICAgICAgIGlmICghdGhpcy5fcGxheWluZyB8fCB0aGlzLl9wYXVzZWQpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgdGhpcy5fcGF1c2VkID0gdHJ1ZTtcblxuICAgICAgICB0aGlzLmZpcmUoJ3BhdXNlJyk7XG4gICAgICAgIHRoaXMuX2NvbXBvbmVudC5maXJlKCdwYXVzZScsIHRoaXMpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJlc3VtZXMgdGhlIHBhdXNlZCBhbmltYXRpb24uXG4gICAgICovXG4gICAgcmVzdW1lKCkge1xuICAgICAgICBpZiAoIXRoaXMuX3BhdXNlZCkgcmV0dXJuO1xuXG4gICAgICAgIHRoaXMuX3BhdXNlZCA9IGZhbHNlO1xuICAgICAgICB0aGlzLmZpcmUoJ3Jlc3VtZScpO1xuICAgICAgICB0aGlzLl9jb21wb25lbnQuZmlyZSgncmVzdW1lJywgdGhpcyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU3RvcHMgdGhlIGFuaW1hdGlvbiBhbmQgcmVzZXRzIHRoZSBhbmltYXRpb24gdG8gdGhlIGZpcnN0IGZyYW1lLlxuICAgICAqL1xuICAgIHN0b3AoKSB7XG4gICAgICAgIGlmICghdGhpcy5fcGxheWluZykgcmV0dXJuO1xuXG4gICAgICAgIHRoaXMuX3BsYXlpbmcgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fcGF1c2VkID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX3RpbWUgPSAwO1xuICAgICAgICB0aGlzLmZyYW1lID0gMDtcblxuICAgICAgICB0aGlzLmZpcmUoJ3N0b3AnKTtcbiAgICAgICAgdGhpcy5fY29tcG9uZW50LmZpcmUoJ3N0b3AnLCB0aGlzKTtcbiAgICB9XG59XG5cbmV4cG9ydCB7IFNwcml0ZUFuaW1hdGlvbkNsaXAgfTtcbiJdLCJuYW1lcyI6WyJTcHJpdGVBbmltYXRpb25DbGlwIiwiRXZlbnRIYW5kbGVyIiwiY29uc3RydWN0b3IiLCJjb21wb25lbnQiLCJkYXRhIiwiX2NvbXBvbmVudCIsIl9mcmFtZSIsIl9zcHJpdGUiLCJfc3ByaXRlQXNzZXQiLCJzcHJpdGVBc3NldCIsIm5hbWUiLCJmcHMiLCJsb29wIiwiX3BsYXlpbmciLCJfcGF1c2VkIiwiX3RpbWUiLCJkdXJhdGlvbiIsIk51bWJlciIsIk1JTl9WQUxVRSIsImZyYW1lS2V5cyIsImxlbmd0aCIsIk1hdGgiLCJhYnMiLCJmcmFtZSIsInZhbHVlIiwiX3NldEZyYW1lIiwiX3NldFRpbWUiLCJpc1BhdXNlZCIsImlzUGxheWluZyIsInNwcml0ZSIsIm9mZiIsIl9vblNwcml0ZU1lc2hlc0NoYW5nZSIsIl9vblNwcml0ZVBwdUNoYW5nZWQiLCJhdGxhcyIsIm9uIiwiY3VycmVudENsaXAiLCJtaSIsIl9tZXNoSW5zdGFuY2UiLCJkZWxldGVQYXJhbWV0ZXIiLCJfaGlkZU1vZGVsIiwidGV4dHVyZSIsInNldFBhcmFtZXRlciIsImVuYWJsZWQiLCJlbnRpdHkiLCJfc2hvd01vZGVsIiwidGltZSIsImFzc2V0cyIsInN5c3RlbSIsImFwcCIsImlkIiwiQXNzZXQiLCJwcmV2IiwiZ2V0IiwiX3VuYmluZFNwcml0ZUFzc2V0IiwiYXNzZXQiLCJfb25TcHJpdGVBc3NldEFkZGVkIiwiX2JpbmRTcHJpdGVBc3NldCIsIm1pbiIsImZsb29yIiwiX29uU3ByaXRlQXNzZXRMb2FkIiwiX29uU3ByaXRlQXNzZXRSZW1vdmUiLCJyZXNvdXJjZSIsImxvYWQiLCJ0ZXh0dXJlQXRsYXNBc3NldCIsIl9vblRleHR1cmVBdGxhc0xvYWQiLCJhdGxhc0Fzc2V0SWQiLCJvbmNlIiwiYXRsYXNBc3NldCIsIl9zaG93RnJhbWUiLCJyZW5kZXJNb2RlIiwiU1BSSVRFX1JFTkRFUk1PREVfU0lNUExFIiwiX3VwZGF0ZSIsImR0IiwiZGlyIiwic3BlZWQiLCJlbmQiLCJmaXJlIiwibWF0aCIsImNsYW1wIiwiX2Rlc3Ryb3kiLCJwbGF5IiwicGF1c2UiLCJyZXN1bWUiLCJzdG9wIl0sIm1hcHBpbmdzIjoiOzs7OztBQVFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLE1BQU1BLG1CQUFtQixTQUFTQyxZQUFZLENBQUM7QUFDM0M7QUFDSjtB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
