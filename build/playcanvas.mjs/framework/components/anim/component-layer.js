import { Debug } from '../../../core/debug.js';
import { math } from '../../../core/math/math.js';
import { AnimTrack } from '../../anim/evaluator/anim-track.js';
import { AnimTransition } from '../../anim/controller/anim-transition.js';
import { ANIM_LAYER_OVERWRITE } from '../../anim/controller/constants.js';

/**
 * The Anim Component Layer allows managers a single layer of the animation state graph.
 *
 * @category Animation
 */
class AnimComponentLayer {
  /**
   * Create a new AnimComponentLayer instance.
   *
   * @param {string} name - The name of the layer.
   * @param {object} controller - The controller to manage this layers animations.
   * @param {import('./component.js').AnimComponent} component - The component that this layer is
   * a member of.
   * @param {number} [weight] - The weight of this layer. Defaults to 1.
   * @param {string} [blendType] - The blend type of this layer. Defaults to {@link ANIM_LAYER_OVERWRITE}.
   * @param {boolean} [normalizedWeight] - Whether the weight of this layer should be normalized
   * using the total weight of all layers.
   */
  constructor(name, controller, component, weight = 1, blendType = ANIM_LAYER_OVERWRITE, normalizedWeight = true) {
    this._name = name;
    this._controller = controller;
    this._component = component;
    this._weight = weight;
    this._blendType = blendType;
    this._normalizedWeight = normalizedWeight;
    this._mask = null;
    this._blendTime = 0;
    this._blendTimeElapsed = 0;
    this._startingWeight = 0;
    this._targetWeight = 0;
  }

  /**
   * Returns the name of the layer.
   *
   * @type {string}
   */
  get name() {
    return this._name;
  }

  /**
   * Whether this layer is currently playing.
   *
   * @type {string}
   */
  set playing(value) {
    this._controller.playing = value;
  }
  get playing() {
    return this._controller.playing;
  }

  /**
   * Returns true if a state graph has been loaded and all states in the graph have been assigned
   * animation tracks.
   *
   * @type {string}
   */
  get playable() {
    return this._controller.playable;
  }

  /**
   * Returns the currently active state name.
   *
   * @type {string}
   */
  get activeState() {
    return this._controller.activeStateName;
  }

  /**
   * Returns the previously active state name.
   *
   * @type {string}
   */
  get previousState() {
    return this._controller.previousStateName;
  }

  /**
   * Returns the currently active states progress as a value normalized by the states animation
   * duration. Looped animations will return values greater than 1.
   *
   * @type {number}
   */
  get activeStateProgress() {
    return this._controller.activeStateProgress;
  }

  /**
   * Returns the currently active states duration.
   *
   * @type {number}
   */
  get activeStateDuration() {
    return this._controller.activeStateDuration;
  }

  /**
   * The active states time in seconds.
   *
   * @type {number}
   */
  set activeStateCurrentTime(time) {
    const controller = this._controller;
    const layerPlaying = controller.playing;
    controller.playing = true;
    controller.activeStateCurrentTime = time;
    if (!layerPlaying) {
      controller.update(0);
    }
    controller.playing = layerPlaying;
  }
  get activeStateCurrentTime() {
    return this._controller.activeStateCurrentTime;
  }

  /**
   * Returns whether the anim component layer is currently transitioning between states.
   *
   * @type {boolean}
   */
  get transitioning() {
    return this._controller.transitioning;
  }

  /**
   * If the anim component layer is currently transitioning between states, returns the progress.
   * Otherwise returns null.
   *
   * @type {number|null}
   */
  get transitionProgress() {
    if (this.transitioning) {
      return this._controller.transitionProgress;
    }
    return null;
  }

  /**
   * Lists all available states in this layers state graph.
   *
   * @type {string[]}
   */
  get states() {
    return this._controller.states;
  }

  /**
   * The blending weight of this layer. Used when calculating the value of properties that are
   * animated by more than one layer.
   *
   * @type {number}
   */
  set weight(value) {
    this._weight = value;
    this._component.dirtifyTargets();
  }
  get weight() {
    return this._weight;
  }
  set blendType(value) {
    if (value !== this._blendType) {
      this._blendType = value;
      if (this._controller.normalizeWeights) {
        this._component.rebind();
      }
    }
  }
  get blendType() {
    return this._blendType;
  }

  /**
   * A mask of bones which should be animated or ignored by this layer.
   *
   * @type {object}
   * @example
   * entity.anim.baseLayer.mask = {
   *     // include the spine of the current model and all of its children
   *     "path/to/spine": {
   *         children: true
   *     },
   *     // include the hip of the current model but not all of its children
   *     "path/to/hip": true
   * };
   */
  set mask(value) {
    if (this._controller.assignMask(value)) {
      this._component.rebind();
    }
    this._mask = value;
  }
  get mask() {
    return this._mask;
  }

  /**
   * Start playing the animation in the current state.
   *
   * @param {string} [name] - If provided, will begin playing from the start of the state with
   * this name.
   */
  play(name) {
    this._controller.play(name);
  }

  /**
   * Pause the animation in the current state.
   */
  pause() {
    this._controller.pause();
  }

  /**
   * Reset the animation component to its initial state, including all parameters. The system
   * will be paused.
   */
  reset() {
    this._controller.reset();
  }

  /**
   * Rebind any animations in the layer to the currently present components and model of the anim
   * components entity.
   */
  rebind() {
    this._controller.rebind();
  }
  update(dt) {
    if (this._blendTime) {
      if (this._blendTimeElapsed < this._blendTime) {
        this.weight = math.lerp(this._startingWeight, this._targetWeight, this._blendTimeElapsed / this._blendTime);
        this._blendTimeElapsed += dt;
      } else {
        this.weight = this._targetWeight;
        this._blendTime = 0;
        this._blendTimeElapsed = 0;
        this._startingWeight = 0;
        this._targetWeight = 0;
      }
    }
    this._controller.update(dt);
  }

  /**
   * Blend from the current weight value to the provided weight value over a given amount of time.
   *
   * @param {number} weight - The new weight value to blend to.
   * @param {number} time - The duration of the blend in seconds.
   */
  blendToWeight(weight, time) {
    this._startingWeight = this.weight;
    this._targetWeight = weight;
    this._blendTime = Math.max(0, time);
    this._blendTimeElapsed = 0;
  }

  /**
   * Add a mask to this layer.
   *
   * @param {object} [mask] - The mask to assign to the layer. If not provided the current mask
   * in the layer will be removed.
   * @example
   * entity.anim.baseLayer.assignMask({
   *     // include the spine of the current model and all of its children
   *     "path/to/spine": {
   *         children: true
   *     },
   *     // include the hip of the current model but not all of its children
   *     "path/to/hip": true
   * });
   * @ignore
   */
  assignMask(mask) {
    Debug.deprecated('The pc.AnimComponentLayer#assignMask function is now deprecated. Assign masks to the pc.AnimComponentLayer#mask property instead.');
    if (this._controller.assignMask(mask)) {
      this._component.rebind();
    }
    this._mask = mask;
  }

  /**
   * Assigns an animation track to a state or blend tree node in the current graph. If a state
   * for the given nodePath doesn't exist, it will be created. If all states nodes are linked and
   * the {@link AnimComponent#activate} value was set to true then the component will begin
   * playing.
   *
   * @param {string} nodePath - Either the state name or the path to a blend tree node that this
   * animation should be associated with. Each section of a blend tree path is split using a
   * period (`.`) therefore state names should not include this character (e.g "MyStateName" or
   * "MyStateName.BlendTreeNode").
   * @param {object} animTrack - The animation track that will be assigned to this state and
   * played whenever this state is active.
   * @param {number} [speed] - Update the speed of the state you are assigning an animation to.
   * Defaults to 1.
   * @param {boolean} [loop] - Update the loop property of the state you are assigning an
   * animation to. Defaults to true.
   */
  assignAnimation(nodePath, animTrack, speed, loop) {
    if (!(animTrack instanceof AnimTrack)) {
      Debug.error('assignAnimation: animTrack supplied to function was not of type AnimTrack');
      return;
    }
    this._controller.assignAnimation(nodePath, animTrack, speed, loop);
    if (this._controller._transitions.length === 0) {
      this._controller._transitions.push(new AnimTransition({
        from: 'START',
        to: nodePath
      }));
    }
    if (this._component.activate && this._component.playable) {
      this._component.playing = true;
    }
  }

  /**
   * Removes animations from a node in the loaded state graph.
   *
   * @param {string} nodeName - The name of the node that should have its animation tracks removed.
   */
  removeNodeAnimations(nodeName) {
    if (this._controller.removeNodeAnimations(nodeName)) {
      this._component.playing = false;
    }
  }

  /**
   * Returns the asset that is associated with the given state.
   *
   * @param {string} stateName - The name of the state to get the asset for.
   * @returns {import('../../asset/asset.js').Asset} The asset associated with the given state.
   */
  getAnimationAsset(stateName) {
    return this._component.animationAssets[`${this.name}:${stateName}`];
  }

  /**
   * Transition to any state in the current layers graph. Transitions can be instant or take an
   * optional blend time.
   *
   * @param {string} to - The state that this transition will transition to.
   * @param {number} [time] - The duration of the transition in seconds. Defaults to 0.
   * @param {number} [transitionOffset] - If provided, the destination state will begin playing
   * its animation at this time. Given in normalized time, based on the states duration & must be
   * between 0 and 1. Defaults to null.
   */
  transition(to, time = 0, transitionOffset = null) {
    this._controller.updateStateFromTransition(new AnimTransition({
      from: this._controller.activeStateName,
      to,
      time,
      transitionOffset
    }));
  }
}

export { AnimComponentLayer };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tcG9uZW50LWxheWVyLmpzIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi9zcmMvZnJhbWV3b3JrL2NvbXBvbmVudHMvYW5pbS9jb21wb25lbnQtbGF5ZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgRGVidWcgfSBmcm9tICcuLi8uLi8uLi9jb3JlL2RlYnVnLmpzJztcbmltcG9ydCB7IG1hdGggfSBmcm9tICcuLi8uLi8uLi9jb3JlL21hdGgvbWF0aC5qcyc7XG5cbmltcG9ydCB7IEFuaW1UcmFjayB9IGZyb20gJy4uLy4uL2FuaW0vZXZhbHVhdG9yL2FuaW0tdHJhY2suanMnO1xuaW1wb3J0IHsgQW5pbVRyYW5zaXRpb24gfSBmcm9tICcuLi8uLi9hbmltL2NvbnRyb2xsZXIvYW5pbS10cmFuc2l0aW9uLmpzJztcbmltcG9ydCB7IEFOSU1fTEFZRVJfT1ZFUldSSVRFIH0gZnJvbSAnLi4vLi4vYW5pbS9jb250cm9sbGVyL2NvbnN0YW50cy5qcyc7XG5cbi8qKlxuICogVGhlIEFuaW0gQ29tcG9uZW50IExheWVyIGFsbG93cyBtYW5hZ2VycyBhIHNpbmdsZSBsYXllciBvZiB0aGUgYW5pbWF0aW9uIHN0YXRlIGdyYXBoLlxuICpcbiAqIEBjYXRlZ29yeSBBbmltYXRpb25cbiAqL1xuY2xhc3MgQW5pbUNvbXBvbmVudExheWVyIHtcbiAgICAvKipcbiAgICAgKiBDcmVhdGUgYSBuZXcgQW5pbUNvbXBvbmVudExheWVyIGluc3RhbmNlLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IG5hbWUgLSBUaGUgbmFtZSBvZiB0aGUgbGF5ZXIuXG4gICAgICogQHBhcmFtIHtvYmplY3R9IGNvbnRyb2xsZXIgLSBUaGUgY29udHJvbGxlciB0byBtYW5hZ2UgdGhpcyBsYXllcnMgYW5pbWF0aW9ucy5cbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi9jb21wb25lbnQuanMnKS5BbmltQ29tcG9uZW50fSBjb21wb25lbnQgLSBUaGUgY29tcG9uZW50IHRoYXQgdGhpcyBsYXllciBpc1xuICAgICAqIGEgbWVtYmVyIG9mLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBbd2VpZ2h0XSAtIFRoZSB3ZWlnaHQgb2YgdGhpcyBsYXllci4gRGVmYXVsdHMgdG8gMS5cbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gW2JsZW5kVHlwZV0gLSBUaGUgYmxlbmQgdHlwZSBvZiB0aGlzIGxheWVyLiBEZWZhdWx0cyB0byB7QGxpbmsgQU5JTV9MQVlFUl9PVkVSV1JJVEV9LlxuICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gW25vcm1hbGl6ZWRXZWlnaHRdIC0gV2hldGhlciB0aGUgd2VpZ2h0IG9mIHRoaXMgbGF5ZXIgc2hvdWxkIGJlIG5vcm1hbGl6ZWRcbiAgICAgKiB1c2luZyB0aGUgdG90YWwgd2VpZ2h0IG9mIGFsbCBsYXllcnMuXG4gICAgICovXG4gICAgY29uc3RydWN0b3IobmFtZSwgY29udHJvbGxlciwgY29tcG9uZW50LCB3ZWlnaHQgPSAxLCBibGVuZFR5cGUgPSBBTklNX0xBWUVSX09WRVJXUklURSwgbm9ybWFsaXplZFdlaWdodCA9IHRydWUpIHtcbiAgICAgICAgdGhpcy5fbmFtZSA9IG5hbWU7XG4gICAgICAgIHRoaXMuX2NvbnRyb2xsZXIgPSBjb250cm9sbGVyO1xuICAgICAgICB0aGlzLl9jb21wb25lbnQgPSBjb21wb25lbnQ7XG4gICAgICAgIHRoaXMuX3dlaWdodCA9IHdlaWdodDtcbiAgICAgICAgdGhpcy5fYmxlbmRUeXBlID0gYmxlbmRUeXBlO1xuICAgICAgICB0aGlzLl9ub3JtYWxpemVkV2VpZ2h0ID0gbm9ybWFsaXplZFdlaWdodDtcbiAgICAgICAgdGhpcy5fbWFzayA9IG51bGw7XG4gICAgICAgIHRoaXMuX2JsZW5kVGltZSA9IDA7XG4gICAgICAgIHRoaXMuX2JsZW5kVGltZUVsYXBzZWQgPSAwO1xuICAgICAgICB0aGlzLl9zdGFydGluZ1dlaWdodCA9IDA7XG4gICAgICAgIHRoaXMuX3RhcmdldFdlaWdodCA9IDA7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgbmFtZSBvZiB0aGUgbGF5ZXIuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7c3RyaW5nfVxuICAgICAqL1xuICAgIGdldCBuYW1lKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fbmFtZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBXaGV0aGVyIHRoaXMgbGF5ZXIgaXMgY3VycmVudGx5IHBsYXlpbmcuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7c3RyaW5nfVxuICAgICAqL1xuICAgIHNldCBwbGF5aW5nKHZhbHVlKSB7XG4gICAgICAgIHRoaXMuX2NvbnRyb2xsZXIucGxheWluZyA9IHZhbHVlO1xuICAgIH1cblxuICAgIGdldCBwbGF5aW5nKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fY29udHJvbGxlci5wbGF5aW5nO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdHJ1ZSBpZiBhIHN0YXRlIGdyYXBoIGhhcyBiZWVuIGxvYWRlZCBhbmQgYWxsIHN0YXRlcyBpbiB0aGUgZ3JhcGggaGF2ZSBiZWVuIGFzc2lnbmVkXG4gICAgICogYW5pbWF0aW9uIHRyYWNrcy5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtzdHJpbmd9XG4gICAgICovXG4gICAgZ2V0IHBsYXlhYmxlKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fY29udHJvbGxlci5wbGF5YWJsZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBjdXJyZW50bHkgYWN0aXZlIHN0YXRlIG5hbWUuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7c3RyaW5nfVxuICAgICAqL1xuICAgIGdldCBhY3RpdmVTdGF0ZSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2NvbnRyb2xsZXIuYWN0aXZlU3RhdGVOYW1lO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIHByZXZpb3VzbHkgYWN0aXZlIHN0YXRlIG5hbWUuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7c3RyaW5nfVxuICAgICAqL1xuICAgIGdldCBwcmV2aW91c1N0YXRlKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fY29udHJvbGxlci5wcmV2aW91c1N0YXRlTmFtZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBjdXJyZW50bHkgYWN0aXZlIHN0YXRlcyBwcm9ncmVzcyBhcyBhIHZhbHVlIG5vcm1hbGl6ZWQgYnkgdGhlIHN0YXRlcyBhbmltYXRpb25cbiAgICAgKiBkdXJhdGlvbi4gTG9vcGVkIGFuaW1hdGlvbnMgd2lsbCByZXR1cm4gdmFsdWVzIGdyZWF0ZXIgdGhhbiAxLlxuICAgICAqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKi9cbiAgICBnZXQgYWN0aXZlU3RhdGVQcm9ncmVzcygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2NvbnRyb2xsZXIuYWN0aXZlU3RhdGVQcm9ncmVzcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBjdXJyZW50bHkgYWN0aXZlIHN0YXRlcyBkdXJhdGlvbi5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtudW1iZXJ9XG4gICAgICovXG4gICAgZ2V0IGFjdGl2ZVN0YXRlRHVyYXRpb24oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9jb250cm9sbGVyLmFjdGl2ZVN0YXRlRHVyYXRpb247XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVGhlIGFjdGl2ZSBzdGF0ZXMgdGltZSBpbiBzZWNvbmRzLlxuICAgICAqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKi9cbiAgICBzZXQgYWN0aXZlU3RhdGVDdXJyZW50VGltZSh0aW1lKSB7XG4gICAgICAgIGNvbnN0IGNvbnRyb2xsZXIgPSB0aGlzLl9jb250cm9sbGVyO1xuICAgICAgICBjb25zdCBsYXllclBsYXlpbmcgPSBjb250cm9sbGVyLnBsYXlpbmc7XG4gICAgICAgIGNvbnRyb2xsZXIucGxheWluZyA9IHRydWU7XG4gICAgICAgIGNvbnRyb2xsZXIuYWN0aXZlU3RhdGVDdXJyZW50VGltZSA9IHRpbWU7XG4gICAgICAgIGlmICghbGF5ZXJQbGF5aW5nKSB7XG4gICAgICAgICAgICBjb250cm9sbGVyLnVwZGF0ZSgwKTtcbiAgICAgICAgfVxuICAgICAgICBjb250cm9sbGVyLnBsYXlpbmcgPSBsYXllclBsYXlpbmc7XG4gICAgfVxuXG4gICAgZ2V0IGFjdGl2ZVN0YXRlQ3VycmVudFRpbWUoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9jb250cm9sbGVyLmFjdGl2ZVN0YXRlQ3VycmVudFRpbWU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB3aGV0aGVyIHRoZSBhbmltIGNvbXBvbmVudCBsYXllciBpcyBjdXJyZW50bHkgdHJhbnNpdGlvbmluZyBiZXR3ZWVuIHN0YXRlcy5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAqL1xuICAgIGdldCB0cmFuc2l0aW9uaW5nKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fY29udHJvbGxlci50cmFuc2l0aW9uaW5nO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIElmIHRoZSBhbmltIGNvbXBvbmVudCBsYXllciBpcyBjdXJyZW50bHkgdHJhbnNpdGlvbmluZyBiZXR3ZWVuIHN0YXRlcywgcmV0dXJucyB0aGUgcHJvZ3Jlc3MuXG4gICAgICogT3RoZXJ3aXNlIHJldHVybnMgbnVsbC5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtudW1iZXJ8bnVsbH1cbiAgICAgKi9cbiAgICBnZXQgdHJhbnNpdGlvblByb2dyZXNzKCkge1xuICAgICAgICBpZiAodGhpcy50cmFuc2l0aW9uaW5nKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fY29udHJvbGxlci50cmFuc2l0aW9uUHJvZ3Jlc3M7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTGlzdHMgYWxsIGF2YWlsYWJsZSBzdGF0ZXMgaW4gdGhpcyBsYXllcnMgc3RhdGUgZ3JhcGguXG4gICAgICpcbiAgICAgKiBAdHlwZSB7c3RyaW5nW119XG4gICAgICovXG4gICAgZ2V0IHN0YXRlcygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2NvbnRyb2xsZXIuc3RhdGVzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRoZSBibGVuZGluZyB3ZWlnaHQgb2YgdGhpcyBsYXllci4gVXNlZCB3aGVuIGNhbGN1bGF0aW5nIHRoZSB2YWx1ZSBvZiBwcm9wZXJ0aWVzIHRoYXQgYXJlXG4gICAgICogYW5pbWF0ZWQgYnkgbW9yZSB0aGFuIG9uZSBsYXllci5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtudW1iZXJ9XG4gICAgICovXG4gICAgc2V0IHdlaWdodCh2YWx1ZSkge1xuICAgICAgICB0aGlzLl93ZWlnaHQgPSB2YWx1ZTtcbiAgICAgICAgdGhpcy5fY29tcG9uZW50LmRpcnRpZnlUYXJnZXRzKCk7XG4gICAgfVxuXG4gICAgZ2V0IHdlaWdodCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3dlaWdodDtcbiAgICB9XG5cbiAgICBzZXQgYmxlbmRUeXBlKHZhbHVlKSB7XG4gICAgICAgIGlmICh2YWx1ZSAhPT0gdGhpcy5fYmxlbmRUeXBlKSB7XG4gICAgICAgICAgICB0aGlzLl9ibGVuZFR5cGUgPSB2YWx1ZTtcbiAgICAgICAgICAgIGlmICh0aGlzLl9jb250cm9sbGVyLm5vcm1hbGl6ZVdlaWdodHMpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9jb21wb25lbnQucmViaW5kKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBnZXQgYmxlbmRUeXBlKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fYmxlbmRUeXBlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEEgbWFzayBvZiBib25lcyB3aGljaCBzaG91bGQgYmUgYW5pbWF0ZWQgb3IgaWdub3JlZCBieSB0aGlzIGxheWVyLlxuICAgICAqXG4gICAgICogQHR5cGUge29iamVjdH1cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGVudGl0eS5hbmltLmJhc2VMYXllci5tYXNrID0ge1xuICAgICAqICAgICAvLyBpbmNsdWRlIHRoZSBzcGluZSBvZiB0aGUgY3VycmVudCBtb2RlbCBhbmQgYWxsIG9mIGl0cyBjaGlsZHJlblxuICAgICAqICAgICBcInBhdGgvdG8vc3BpbmVcIjoge1xuICAgICAqICAgICAgICAgY2hpbGRyZW46IHRydWVcbiAgICAgKiAgICAgfSxcbiAgICAgKiAgICAgLy8gaW5jbHVkZSB0aGUgaGlwIG9mIHRoZSBjdXJyZW50IG1vZGVsIGJ1dCBub3QgYWxsIG9mIGl0cyBjaGlsZHJlblxuICAgICAqICAgICBcInBhdGgvdG8vaGlwXCI6IHRydWVcbiAgICAgKiB9O1xuICAgICAqL1xuICAgIHNldCBtYXNrKHZhbHVlKSB7XG4gICAgICAgIGlmICh0aGlzLl9jb250cm9sbGVyLmFzc2lnbk1hc2sodmFsdWUpKSB7XG4gICAgICAgICAgICB0aGlzLl9jb21wb25lbnQucmViaW5kKCk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5fbWFzayA9IHZhbHVlO1xuICAgIH1cblxuICAgIGdldCBtYXNrKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fbWFzaztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTdGFydCBwbGF5aW5nIHRoZSBhbmltYXRpb24gaW4gdGhlIGN1cnJlbnQgc3RhdGUuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gW25hbWVdIC0gSWYgcHJvdmlkZWQsIHdpbGwgYmVnaW4gcGxheWluZyBmcm9tIHRoZSBzdGFydCBvZiB0aGUgc3RhdGUgd2l0aFxuICAgICAqIHRoaXMgbmFtZS5cbiAgICAgKi9cbiAgICBwbGF5KG5hbWUpIHtcbiAgICAgICAgdGhpcy5fY29udHJvbGxlci5wbGF5KG5hbWUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFBhdXNlIHRoZSBhbmltYXRpb24gaW4gdGhlIGN1cnJlbnQgc3RhdGUuXG4gICAgICovXG4gICAgcGF1c2UoKSB7XG4gICAgICAgIHRoaXMuX2NvbnRyb2xsZXIucGF1c2UoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXNldCB0aGUgYW5pbWF0aW9uIGNvbXBvbmVudCB0byBpdHMgaW5pdGlhbCBzdGF0ZSwgaW5jbHVkaW5nIGFsbCBwYXJhbWV0ZXJzLiBUaGUgc3lzdGVtXG4gICAgICogd2lsbCBiZSBwYXVzZWQuXG4gICAgICovXG4gICAgcmVzZXQoKSB7XG4gICAgICAgIHRoaXMuX2NvbnRyb2xsZXIucmVzZXQoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZWJpbmQgYW55IGFuaW1hdGlvbnMgaW4gdGhlIGxheWVyIHRvIHRoZSBjdXJyZW50bHkgcHJlc2VudCBjb21wb25lbnRzIGFuZCBtb2RlbCBvZiB0aGUgYW5pbVxuICAgICAqIGNvbXBvbmVudHMgZW50aXR5LlxuICAgICAqL1xuICAgIHJlYmluZCgpIHtcbiAgICAgICAgdGhpcy5fY29udHJvbGxlci5yZWJpbmQoKTtcbiAgICB9XG5cbiAgICB1cGRhdGUoZHQpIHtcbiAgICAgICAgaWYgKHRoaXMuX2JsZW5kVGltZSkge1xuICAgICAgICAgICAgaWYgKHRoaXMuX2JsZW5kVGltZUVsYXBzZWQgPCB0aGlzLl9ibGVuZFRpbWUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLndlaWdodCA9IG1hdGgubGVycCh0aGlzLl9zdGFydGluZ1dlaWdodCwgdGhpcy5fdGFyZ2V0V2VpZ2h0LCB0aGlzLl9ibGVuZFRpbWVFbGFwc2VkIC8gdGhpcy5fYmxlbmRUaW1lKTtcbiAgICAgICAgICAgICAgICB0aGlzLl9ibGVuZFRpbWVFbGFwc2VkICs9IGR0O1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLndlaWdodCA9IHRoaXMuX3RhcmdldFdlaWdodDtcbiAgICAgICAgICAgICAgICB0aGlzLl9ibGVuZFRpbWUgPSAwO1xuICAgICAgICAgICAgICAgIHRoaXMuX2JsZW5kVGltZUVsYXBzZWQgPSAwO1xuICAgICAgICAgICAgICAgIHRoaXMuX3N0YXJ0aW5nV2VpZ2h0ID0gMDtcbiAgICAgICAgICAgICAgICB0aGlzLl90YXJnZXRXZWlnaHQgPSAwO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHRoaXMuX2NvbnRyb2xsZXIudXBkYXRlKGR0KTtcbiAgICB9XG5cblxuICAgIC8qKlxuICAgICAqIEJsZW5kIGZyb20gdGhlIGN1cnJlbnQgd2VpZ2h0IHZhbHVlIHRvIHRoZSBwcm92aWRlZCB3ZWlnaHQgdmFsdWUgb3ZlciBhIGdpdmVuIGFtb3VudCBvZiB0aW1lLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHdlaWdodCAtIFRoZSBuZXcgd2VpZ2h0IHZhbHVlIHRvIGJsZW5kIHRvLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSB0aW1lIC0gVGhlIGR1cmF0aW9uIG9mIHRoZSBibGVuZCBpbiBzZWNvbmRzLlxuICAgICAqL1xuICAgIGJsZW5kVG9XZWlnaHQod2VpZ2h0LCB0aW1lKSB7XG4gICAgICAgIHRoaXMuX3N0YXJ0aW5nV2VpZ2h0ID0gdGhpcy53ZWlnaHQ7XG4gICAgICAgIHRoaXMuX3RhcmdldFdlaWdodCA9IHdlaWdodDtcbiAgICAgICAgdGhpcy5fYmxlbmRUaW1lID0gTWF0aC5tYXgoMCwgdGltZSk7XG4gICAgICAgIHRoaXMuX2JsZW5kVGltZUVsYXBzZWQgPSAwO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEFkZCBhIG1hc2sgdG8gdGhpcyBsYXllci5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7b2JqZWN0fSBbbWFza10gLSBUaGUgbWFzayB0byBhc3NpZ24gdG8gdGhlIGxheWVyLiBJZiBub3QgcHJvdmlkZWQgdGhlIGN1cnJlbnQgbWFza1xuICAgICAqIGluIHRoZSBsYXllciB3aWxsIGJlIHJlbW92ZWQuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBlbnRpdHkuYW5pbS5iYXNlTGF5ZXIuYXNzaWduTWFzayh7XG4gICAgICogICAgIC8vIGluY2x1ZGUgdGhlIHNwaW5lIG9mIHRoZSBjdXJyZW50IG1vZGVsIGFuZCBhbGwgb2YgaXRzIGNoaWxkcmVuXG4gICAgICogICAgIFwicGF0aC90by9zcGluZVwiOiB7XG4gICAgICogICAgICAgICBjaGlsZHJlbjogdHJ1ZVxuICAgICAqICAgICB9LFxuICAgICAqICAgICAvLyBpbmNsdWRlIHRoZSBoaXAgb2YgdGhlIGN1cnJlbnQgbW9kZWwgYnV0IG5vdCBhbGwgb2YgaXRzIGNoaWxkcmVuXG4gICAgICogICAgIFwicGF0aC90by9oaXBcIjogdHJ1ZVxuICAgICAqIH0pO1xuICAgICAqIEBpZ25vcmVcbiAgICAgKi9cbiAgICBhc3NpZ25NYXNrKG1hc2spIHtcbiAgICAgICAgRGVidWcuZGVwcmVjYXRlZCgnVGhlIHBjLkFuaW1Db21wb25lbnRMYXllciNhc3NpZ25NYXNrIGZ1bmN0aW9uIGlzIG5vdyBkZXByZWNhdGVkLiBBc3NpZ24gbWFza3MgdG8gdGhlIHBjLkFuaW1Db21wb25lbnRMYXllciNtYXNrIHByb3BlcnR5IGluc3RlYWQuJyk7XG4gICAgICAgIGlmICh0aGlzLl9jb250cm9sbGVyLmFzc2lnbk1hc2sobWFzaykpIHtcbiAgICAgICAgICAgIHRoaXMuX2NvbXBvbmVudC5yZWJpbmQoKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLl9tYXNrID0gbWFzaztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBc3NpZ25zIGFuIGFuaW1hdGlvbiB0cmFjayB0byBhIHN0YXRlIG9yIGJsZW5kIHRyZWUgbm9kZSBpbiB0aGUgY3VycmVudCBncmFwaC4gSWYgYSBzdGF0ZVxuICAgICAqIGZvciB0aGUgZ2l2ZW4gbm9kZVBhdGggZG9lc24ndCBleGlzdCwgaXQgd2lsbCBiZSBjcmVhdGVkLiBJZiBhbGwgc3RhdGVzIG5vZGVzIGFyZSBsaW5rZWQgYW5kXG4gICAgICogdGhlIHtAbGluayBBbmltQ29tcG9uZW50I2FjdGl2YXRlfSB2YWx1ZSB3YXMgc2V0IHRvIHRydWUgdGhlbiB0aGUgY29tcG9uZW50IHdpbGwgYmVnaW5cbiAgICAgKiBwbGF5aW5nLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IG5vZGVQYXRoIC0gRWl0aGVyIHRoZSBzdGF0ZSBuYW1lIG9yIHRoZSBwYXRoIHRvIGEgYmxlbmQgdHJlZSBub2RlIHRoYXQgdGhpc1xuICAgICAqIGFuaW1hdGlvbiBzaG91bGQgYmUgYXNzb2NpYXRlZCB3aXRoLiBFYWNoIHNlY3Rpb24gb2YgYSBibGVuZCB0cmVlIHBhdGggaXMgc3BsaXQgdXNpbmcgYVxuICAgICAqIHBlcmlvZCAoYC5gKSB0aGVyZWZvcmUgc3RhdGUgbmFtZXMgc2hvdWxkIG5vdCBpbmNsdWRlIHRoaXMgY2hhcmFjdGVyIChlLmcgXCJNeVN0YXRlTmFtZVwiIG9yXG4gICAgICogXCJNeVN0YXRlTmFtZS5CbGVuZFRyZWVOb2RlXCIpLlxuICAgICAqIEBwYXJhbSB7b2JqZWN0fSBhbmltVHJhY2sgLSBUaGUgYW5pbWF0aW9uIHRyYWNrIHRoYXQgd2lsbCBiZSBhc3NpZ25lZCB0byB0aGlzIHN0YXRlIGFuZFxuICAgICAqIHBsYXllZCB3aGVuZXZlciB0aGlzIHN0YXRlIGlzIGFjdGl2ZS5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gW3NwZWVkXSAtIFVwZGF0ZSB0aGUgc3BlZWQgb2YgdGhlIHN0YXRlIHlvdSBhcmUgYXNzaWduaW5nIGFuIGFuaW1hdGlvbiB0by5cbiAgICAgKiBEZWZhdWx0cyB0byAxLlxuICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gW2xvb3BdIC0gVXBkYXRlIHRoZSBsb29wIHByb3BlcnR5IG9mIHRoZSBzdGF0ZSB5b3UgYXJlIGFzc2lnbmluZyBhblxuICAgICAqIGFuaW1hdGlvbiB0by4gRGVmYXVsdHMgdG8gdHJ1ZS5cbiAgICAgKi9cbiAgICBhc3NpZ25BbmltYXRpb24obm9kZVBhdGgsIGFuaW1UcmFjaywgc3BlZWQsIGxvb3ApIHtcbiAgICAgICAgaWYgKCEoYW5pbVRyYWNrIGluc3RhbmNlb2YgQW5pbVRyYWNrKSkge1xuICAgICAgICAgICAgRGVidWcuZXJyb3IoJ2Fzc2lnbkFuaW1hdGlvbjogYW5pbVRyYWNrIHN1cHBsaWVkIHRvIGZ1bmN0aW9uIHdhcyBub3Qgb2YgdHlwZSBBbmltVHJhY2snKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLl9jb250cm9sbGVyLmFzc2lnbkFuaW1hdGlvbihub2RlUGF0aCwgYW5pbVRyYWNrLCBzcGVlZCwgbG9vcCk7XG4gICAgICAgIGlmICh0aGlzLl9jb250cm9sbGVyLl90cmFuc2l0aW9ucy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIHRoaXMuX2NvbnRyb2xsZXIuX3RyYW5zaXRpb25zLnB1c2gobmV3IEFuaW1UcmFuc2l0aW9uKHtcbiAgICAgICAgICAgICAgICBmcm9tOiAnU1RBUlQnLFxuICAgICAgICAgICAgICAgIHRvOiBub2RlUGF0aFxuICAgICAgICAgICAgfSkpO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLl9jb21wb25lbnQuYWN0aXZhdGUgJiYgdGhpcy5fY29tcG9uZW50LnBsYXlhYmxlKSB7XG4gICAgICAgICAgICB0aGlzLl9jb21wb25lbnQucGxheWluZyA9IHRydWU7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZW1vdmVzIGFuaW1hdGlvbnMgZnJvbSBhIG5vZGUgaW4gdGhlIGxvYWRlZCBzdGF0ZSBncmFwaC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBub2RlTmFtZSAtIFRoZSBuYW1lIG9mIHRoZSBub2RlIHRoYXQgc2hvdWxkIGhhdmUgaXRzIGFuaW1hdGlvbiB0cmFja3MgcmVtb3ZlZC5cbiAgICAgKi9cbiAgICByZW1vdmVOb2RlQW5pbWF0aW9ucyhub2RlTmFtZSkge1xuICAgICAgICBpZiAodGhpcy5fY29udHJvbGxlci5yZW1vdmVOb2RlQW5pbWF0aW9ucyhub2RlTmFtZSkpIHtcbiAgICAgICAgICAgIHRoaXMuX2NvbXBvbmVudC5wbGF5aW5nID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBhc3NldCB0aGF0IGlzIGFzc29jaWF0ZWQgd2l0aCB0aGUgZ2l2ZW4gc3RhdGUuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gc3RhdGVOYW1lIC0gVGhlIG5hbWUgb2YgdGhlIHN0YXRlIHRvIGdldCB0aGUgYXNzZXQgZm9yLlxuICAgICAqIEByZXR1cm5zIHtpbXBvcnQoJy4uLy4uL2Fzc2V0L2Fzc2V0LmpzJykuQXNzZXR9IFRoZSBhc3NldCBhc3NvY2lhdGVkIHdpdGggdGhlIGdpdmVuIHN0YXRlLlxuICAgICAqL1xuICAgIGdldEFuaW1hdGlvbkFzc2V0KHN0YXRlTmFtZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5fY29tcG9uZW50LmFuaW1hdGlvbkFzc2V0c1tgJHt0aGlzLm5hbWV9OiR7c3RhdGVOYW1lfWBdO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRyYW5zaXRpb24gdG8gYW55IHN0YXRlIGluIHRoZSBjdXJyZW50IGxheWVycyBncmFwaC4gVHJhbnNpdGlvbnMgY2FuIGJlIGluc3RhbnQgb3IgdGFrZSBhblxuICAgICAqIG9wdGlvbmFsIGJsZW5kIHRpbWUuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gdG8gLSBUaGUgc3RhdGUgdGhhdCB0aGlzIHRyYW5zaXRpb24gd2lsbCB0cmFuc2l0aW9uIHRvLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBbdGltZV0gLSBUaGUgZHVyYXRpb24gb2YgdGhlIHRyYW5zaXRpb24gaW4gc2Vjb25kcy4gRGVmYXVsdHMgdG8gMC5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gW3RyYW5zaXRpb25PZmZzZXRdIC0gSWYgcHJvdmlkZWQsIHRoZSBkZXN0aW5hdGlvbiBzdGF0ZSB3aWxsIGJlZ2luIHBsYXlpbmdcbiAgICAgKiBpdHMgYW5pbWF0aW9uIGF0IHRoaXMgdGltZS4gR2l2ZW4gaW4gbm9ybWFsaXplZCB0aW1lLCBiYXNlZCBvbiB0aGUgc3RhdGVzIGR1cmF0aW9uICYgbXVzdCBiZVxuICAgICAqIGJldHdlZW4gMCBhbmQgMS4gRGVmYXVsdHMgdG8gbnVsbC5cbiAgICAgKi9cbiAgICB0cmFuc2l0aW9uKHRvLCB0aW1lID0gMCwgdHJhbnNpdGlvbk9mZnNldCA9IG51bGwpIHtcbiAgICAgICAgdGhpcy5fY29udHJvbGxlci51cGRhdGVTdGF0ZUZyb21UcmFuc2l0aW9uKG5ldyBBbmltVHJhbnNpdGlvbih7XG4gICAgICAgICAgICBmcm9tOiB0aGlzLl9jb250cm9sbGVyLmFjdGl2ZVN0YXRlTmFtZSxcbiAgICAgICAgICAgIHRvLFxuICAgICAgICAgICAgdGltZSxcbiAgICAgICAgICAgIHRyYW5zaXRpb25PZmZzZXRcbiAgICAgICAgfSkpO1xuICAgIH1cbn1cblxuZXhwb3J0IHsgQW5pbUNvbXBvbmVudExheWVyIH07XG4iXSwibmFtZXMiOlsiQW5pbUNvbXBvbmVudExheWVyIiwiY29uc3RydWN0b3IiLCJuYW1lIiwiY29udHJvbGxlciIsImNvbXBvbmVudCIsIndlaWdodCIsImJsZW5kVHlwZSIsIkFOSU1fTEFZRVJfT1ZFUldSSVRFIiwibm9ybWFsaXplZFdlaWdodCIsIl9uYW1lIiwiX2NvbnRyb2xsZXIiLCJfY29tcG9uZW50IiwiX3dlaWdodCIsIl9ibGVuZFR5cGUiLCJfbm9ybWFsaXplZFdlaWdodCIsIl9tYXNrIiwiX2JsZW5kVGltZSIsIl9ibGVuZFRpbWVFbGFwc2VkIiwiX3N0YXJ0aW5nV2VpZ2h0IiwiX3RhcmdldFdlaWdodCIsInBsYXlpbmciLCJ2YWx1ZSIsInBsYXlhYmxlIiwiYWN0aXZlU3RhdGUiLCJhY3RpdmVTdGF0ZU5hbWUiLCJwcmV2aW91c1N0YXRlIiwicHJldmlvdXNTdGF0ZU5hbWUiLCJhY3RpdmVTdGF0ZVByb2dyZXNzIiwiYWN0aXZlU3RhdGVEdXJhdGlvbiIsImFjdGl2ZVN0YXRlQ3VycmVudFRpbWUiLCJ0aW1lIiwibGF5ZXJQbGF5aW5nIiwidXBkYXRlIiwidHJhbnNpdGlvbmluZyIsInRyYW5zaXRpb25Qcm9ncmVzcyIsInN0YXRlcyIsImRpcnRpZnlUYXJnZXRzIiwibm9ybWFsaXplV2VpZ2h0cyIsInJlYmluZCIsIm1hc2siLCJhc3NpZ25NYXNrIiwicGxheSIsInBhdXNlIiwicmVzZXQiLCJkdCIsIm1hdGgiLCJsZXJwIiwiYmxlbmRUb1dlaWdodCIsIk1hdGgiLCJtYXgiLCJEZWJ1ZyIsImRlcHJlY2F0ZWQiLCJhc3NpZ25BbmltYXRpb24iLCJub2RlUGF0aCIsImFuaW1UcmFjayIsInNwZWVkIiwibG9vcCIsIkFuaW1UcmFjayIsImVycm9yIiwiX3RyYW5zaXRpb25zIiwibGVuZ3RoIiwicHVzaCIsIkFuaW1UcmFuc2l0aW9uIiwiZnJvbSIsInRvIiwiYWN0aXZhdGUiLCJyZW1vdmVOb2RlQW5pbWF0aW9ucyIsIm5vZGVOYW1lIiwiZ2V0QW5pbWF0aW9uQXNzZXQiLCJzdGF0ZU5hbWUiLCJhbmltYXRpb25Bc3NldHMiLCJ0cmFuc2l0aW9uIiwidHJhbnNpdGlvbk9mZnNldCIsInVwZGF0ZVN0YXRlRnJvbVRyYW5zaXRpb24iXSwibWFwcGluZ3MiOiI7Ozs7OztBQU9BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxNQUFNQSxrQkFBa0IsQ0FBQztBQUNyQjtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDSUMsRUFBQUEsV0FBV0EsQ0FBQ0MsSUFBSSxFQUFFQyxVQUFVLEVBQUVDLFNBQVMsRUFBRUMsTUFBTSxHQUFHLENBQUMsRUFBRUMsU0FBUyxHQUFHQyxvQkFBb0IsRUFBRUMsZ0JBQWdCLEdBQUcsSUFBSSxFQUFFO0lBQzVHLElBQUksQ0FBQ0MsS0FBSyxHQUFHUCxJQUFJLENBQUE7SUFDakIsSUFBSSxDQUFDUSxXQUFXLEdBQUdQLFVBQVUsQ0FBQTtJQUM3QixJQUFJLENBQUNRLFVBQVUsR0FBR1AsU0FBUyxDQUFBO0lBQzNCLElBQUksQ0FBQ1EsT0FBTyxHQUFHUCxNQUFNLENBQUE7SUFDckIsSUFB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
