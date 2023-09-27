import { now } from '../../../core/time.js';
import { math } from '../../../core/math/math.js';
import { Color } from '../../../core/math/color.js';
import { EntityReference } from '../../utils/entity-reference.js';
import { Component } from '../component.js';
import { BUTTON_TRANSITION_MODE_SPRITE_CHANGE, BUTTON_TRANSITION_MODE_TINT } from './constants.js';
import { ELEMENTTYPE_GROUP } from '../element/constants.js';

const VisualState = {
  DEFAULT: 'DEFAULT',
  HOVER: 'HOVER',
  PRESSED: 'PRESSED',
  INACTIVE: 'INACTIVE'
};
const STATES_TO_TINT_NAMES = {};
STATES_TO_TINT_NAMES[VisualState.DEFAULT] = '_defaultTint';
STATES_TO_TINT_NAMES[VisualState.HOVER] = 'hoverTint';
STATES_TO_TINT_NAMES[VisualState.PRESSED] = 'pressedTint';
STATES_TO_TINT_NAMES[VisualState.INACTIVE] = 'inactiveTint';
const STATES_TO_SPRITE_ASSET_NAMES = {};
STATES_TO_SPRITE_ASSET_NAMES[VisualState.DEFAULT] = '_defaultSpriteAsset';
STATES_TO_SPRITE_ASSET_NAMES[VisualState.HOVER] = 'hoverSpriteAsset';
STATES_TO_SPRITE_ASSET_NAMES[VisualState.PRESSED] = 'pressedSpriteAsset';
STATES_TO_SPRITE_ASSET_NAMES[VisualState.INACTIVE] = 'inactiveSpriteAsset';
const STATES_TO_SPRITE_FRAME_NAMES = {};
STATES_TO_SPRITE_FRAME_NAMES[VisualState.DEFAULT] = '_defaultSpriteFrame';
STATES_TO_SPRITE_FRAME_NAMES[VisualState.HOVER] = 'hoverSpriteFrame';
STATES_TO_SPRITE_FRAME_NAMES[VisualState.PRESSED] = 'pressedSpriteFrame';
STATES_TO_SPRITE_FRAME_NAMES[VisualState.INACTIVE] = 'inactiveSpriteFrame';

/**
 * A ButtonComponent enables a group of entities to behave like a button, with different visual
 * states for hover and press interactions.
 *
 * @property {boolean} active If set to false, the button will be visible but will not respond to
 * hover or touch interactions.
 * @property {import('../../entity.js').Entity} imageEntity A reference to the entity to be used as
 * the button background. The entity must have an ImageElement component.
 * @property {import('../../../core/math/vec4.js').Vec4} hitPadding Padding to be used in hit-test
 * calculations. Can be used to expand the bounding box so that the button is easier to tap.
 * @property {number} transitionMode Controls how the button responds when the user hovers over
 * it/presses it.
 * @property {Color} hoverTint Color to be used on the button image when the user hovers over it.
 * @property {Color} pressedTint Color to be used on the button image when the user presses it.
 * @property {Color} inactiveTint Color to be used on the button image when the button is not
 * interactive.
 * @property {number} fadeDuration Duration to be used when fading between tints, in milliseconds.
 * @property {import('../../asset/asset.js').Asset} hoverSpriteAsset Sprite to be used as the
 * button image when the user hovers over it.
 * @property {number} hoverSpriteFrame Frame to be used from the hover sprite.
 * @property {import('../../asset/asset.js').Asset} pressedSpriteAsset Sprite to be used as the
 * button image when the user presses it.
 * @property {number} pressedSpriteFrame Frame to be used from the pressed sprite.
 * @property {import('../../asset/asset.js').Asset} inactiveSpriteAsset Sprite to be used as the
 * button image when the button is not interactive.
 * @property {number} inactiveSpriteFrame Frame to be used from the inactive sprite.
 * @augments Component
 * @category User Interface
 */
class ButtonComponent extends Component {
  /**
   * Create a new ButtonComponent instance.
   *
   * @param {import('./system.js').ButtonComponentSystem} system - The ComponentSystem that
   * created this component.
   * @param {import('../../entity.js').Entity} entity - The entity that this component is
   * attached to.
   */
  constructor(system, entity) {
    super(system, entity);
    this._visualState = VisualState.DEFAULT;
    this._isHovering = false;
    this._hoveringCounter = 0;
    this._isPressed = false;
    this._defaultTint = new Color(1, 1, 1, 1);
    this._defaultSpriteAsset = null;
    this._defaultSpriteFrame = 0;
    this._imageReference = new EntityReference(this, 'imageEntity', {
      'element#gain': this._onImageElementGain,
      'element#lose': this._onImageElementLose,
      'element#set:color': this._onSetColor,
      'element#set:opacity': this._onSetOpacity,
      'element#set:spriteAsset': this._onSetSpriteAsset,
      'element#set:spriteFrame': this._onSetSpriteFrame
    });
    this._toggleLifecycleListeners('on', system);
  }
  _toggleLifecycleListeners(onOrOff, system) {
    this[onOrOff]('set_active', this._onSetActive, this);
    this[onOrOff]('set_transitionMode', this._onSetTransitionMode, this);
    this[onOrOff]('set_hoverTint', this._onSetTransitionValue, this);
    this[onOrOff]('set_pressedTint', this._onSetTransitionValue, this);
    this[onOrOff]('set_inactiveTint', this._onSetTransitionValue, this);
    this[onOrOff]('set_hoverSpriteAsset', this._onSetTransitionValue, this);
    this[onOrOff]('set_hoverSpriteFrame', this._onSetTransitionValue, this);
    this[onOrOff]('set_pressedSpriteAsset', this._onSetTransitionValue, this);
    this[onOrOff]('set_pressedSpriteFrame', this._onSetTransitionValue, this);
    this[onOrOff]('set_inactiveSpriteAsset', this._onSetTransitionValue, this);
    this[onOrOff]('set_inactiveSpriteFrame', this._onSetTransitionValue, this);
    system.app.systems.element[onOrOff]('add', this._onElementComponentAdd, this);
    system.app.systems.element[onOrOff]('beforeremove', this._onElementComponentRemove, this);
  }
  _onSetActive(name, oldValue, newValue) {
    if (oldValue !== newValue) {
      this._updateVisualState();
    }
  }
  _onSetTransitionMode(name, oldValue, newValue) {
    if (oldValue !== newValue) {
      this._cancelTween();
      this._resetToDefaultVisualState(oldValue);
      this._forceReapplyVisualState();
    }
  }
  _onSetTransitionValue(name, oldValue, newValue) {
    if (oldValue !== newValue) {
      this._forceReapplyVisualState();
    }
  }
  _onElementComponentRemove(entity) {
    if (this.entity === entity) {
      this._toggleHitElementListeners('off');
    }
  }
  _onElementComponentAdd(entity) {
    if (this.entity === entity) {
      this._toggleHitElementListeners('on');
    }
  }
  _onImageElementLose() {
    this._cancelTween();
    this._resetToDefaultVisualState(this.transitionMode);
  }
  _onImageElementGain() {
    this._storeDefaultVisualState();
    this._forceReapplyVisualState();
  }
  _toggleHitElementListeners(onOrOff) {
    if (this.entity.element) {
      const isAdding = onOrOff === 'on';

      // Prevent duplicate listeners
      if (isAdding && this._hasHitElementListeners) {
        return;
      }
      this.entity.element[onOrOff]('mouseenter', this._onMouseEnter, this);
      this.entity.element[onOrOff]('mouseleave', this._onMouseLeave, this);
      this.entity.element[onOrOff]('mousedown', this._onMouseDown, this);
      this.entity.element[onOrOff]('mouseup', this._onMouseUp, this);
      this.entity.element[onOrOff]('touchstart', this._onTouchStart, this);
      this.entity.element[onOrOff]('touchend', this._onTouchEnd, this);
      this.entity.element[onOrOff]('touchleave', this._onTouchLeave, this);
      this.entity.element[onOrOff]('touchcancel', this._onTouchCancel, this);
      this.entity.element[onOrOff]('selectstart', this._onSelectStart, this);
      this.entity.element[onOrOff]('selectend', this._onSelectEnd, this);
      this.entity.element[onOrOff]('selectenter', this._onSelectEnter, this);
      this.entity.element[onOrOff]('selectleave', this._onSelectLeave, this);
      this.entity.element[onOrOff]('click', this._onClick, this);
      this._hasHitElementListeners = isAdding;
    }
  }
  _storeDefaultVisualState() {
    // If the element is of group type, all it's visual properties are null
    if (this._imageReference.hasComponent('element')) {
      const element = this._imageReference.entity.element;
      if (element.type !== ELEMENTTYPE_GROUP) {
        this._storeDefaultColor(element.color);
        this._storeDefaultOpacity(element.opacity);
        this._storeDefaultSpriteAsset(element.spriteAsset);
        this._storeDefaultSpriteFrame(element.spriteFrame);
      }
    }
  }
  _storeDefaultColor(color) {
    this._defaultTint.r = color.r;
    this._defaultTint.g = color.g;
    this._defaultTint.b = color.b;
  }
  _storeDefaultOpacity(opacity) {
    this._defaultTint.a = opacity;
  }
  _storeDefaultSpriteAsset(spriteAsset) {
    this._defaultSpriteAsset = spriteAsset;
  }
  _storeDefaultSpriteFrame(spriteFrame) {
    this._defaultSpriteFrame = spriteFrame;
  }
  _onSetColor(color) {
    if (!this._isApplyingTint) {
      this._storeDefaultColor(color);
      this._forceReapplyVisualState();
    }
  }
  _onSetOpacity(opacity) {
    if (!this._isApplyingTint) {
      this._storeDefaultOpacity(opacity);
      this._forceReapplyVisualState();
    }
  }
  _onSetSpriteAsset(spriteAsset) {
    if (!this._isApplyingSprite) {
      this._storeDefaultSpriteAsset(spriteAsset);
      this._forceReapplyVisualState();
    }
  }
  _onSetSpriteFrame(spriteFrame) {
    if (!this._isApplyingSprite) {
      this._storeDefaultSpriteFrame(spriteFrame);
      this._forceReapplyVisualState();
    }
  }
  _onMouseEnter(event) {
    this._isHovering = true;
    this._updateVisualState();
    this._fireIfActive('mouseenter', event);
  }
  _onMouseLeave(event) {
    this._isHovering = false;
    this._isPressed = false;
    this._updateVisualState();
    this._fireIfActive('mouseleave', event);
  }
  _onMouseDown(event) {
    this._isPressed = true;
    this._updateVisualState();
    this._fireIfActive('mousedown', event);
  }
  _onMouseUp(event) {
    this._isPressed = false;
    this._updateVisualState();
    this._fireIfActive('mouseup', event);
  }
  _onTouchStart(event) {
    this._isPressed = true;
    this._updateVisualState();
    this._fireIfActive('touchstart', event);
  }
  _onTouchEnd(event) {
    // The default behavior of the browser is to simulate a series of
    // `mouseenter/down/up` events immediately after the `touchend` event,
    // in order to ensure that websites that don't explicitly listen for
    // touch events will still work on mobile (see https://www.html5rocks.com/en/mobile/touchandmouse/
    // for reference). This leads to an issue whereby buttons will enter
    // the `hover` state on mobile browsers after the `touchend` event is
    // received, instead of going back to the `default` state. Calling
    // preventDefault() here fixes the issue.
    event.event.preventDefault();
    this._isPressed = false;
    this._updateVisualState();
    this._fireIfActive('touchend', event);
  }
  _onTouchLeave(event) {
    this._isPressed = false;
    this._updateVisualState();
    this._fireIfActive('touchleave', event);
  }
  _onTouchCancel(event) {
    this._isPressed = false;
    this._updateVisualState();
    this._fireIfActive('touchcancel', event);
  }
  _onSelectStart(event) {
    this._isPressed = true;
    this._updateVisualState();
    this._fireIfActive('selectstart', event);
  }
  _onSelectEnd(event) {
    this._isPressed = false;
    this._updateVisualState();
    this._fireIfActive('selectend', event);
  }
  _onSelectEnter(event) {
    this._hoveringCounter++;
    if (this._hoveringCounter === 1) {
      this._isHovering = true;
      this._updateVisualState();
    }
    this._fireIfActive('selectenter', event);
  }
  _onSelectLeave(event) {
    this._hoveringCounter--;
    if (this._hoveringCounter === 0) {
      this._isHovering = false;
      this._isPressed = false;
      this._updateVisualState();
    }
    this._fireIfActive('selectleave', event);
  }
  _onClick(event) {
    this._fireIfActive('click', event);
  }
  _fireIfActive(name, event) {
    if (this.data.active) {
      this.fire(name, event);
    }
  }
  _updateVisualState(force) {
    const oldVisualState = this._visualState;
    const newVisualState = this._determineVisualState();
    if ((oldVisualState !== newVisualState || force) && this.enabled) {
      this._visualState = newVisualState;
      if (oldVisualState === VisualState.HOVER) {
        this._fireIfActive('hoverend');
      }
      if (oldVisualState === VisualState.PRESSED) {
        this._fireIfActive('pressedend');
      }
      if (newVisualState === VisualState.HOVER) {
        this._fireIfActive('hoverstart');
      }
      if (newVisualState === VisualState.PRESSED) {
        this._fireIfActive('pressedstart');
      }
      switch (this.transitionMode) {
        case BUTTON_TRANSITION_MODE_TINT:
          {
            const tintName = STATES_TO_TINT_NAMES[this._visualState];
            const tintColor = this[tintName];
            this._applyTint(tintColor);
            break;
          }
        case BUTTON_TRANSITION_MODE_SPRITE_CHANGE:
          {
            const spriteAssetName = STATES_TO_SPRITE_ASSET_NAMES[this._visualState];
            const spriteFrameName = STATES_TO_SPRITE_FRAME_NAMES[this._visualState];
            const spriteAsset = this[spriteAssetName];
            const spriteFrame = this[spriteFrameName];
            this._applySprite(spriteAsset, spriteFrame);
            break;
          }
      }
    }
  }

  // Called when a property changes that mean the visual state must be reapplied,
  // even if the state enum has not changed. Examples of this are when the tint
  // value for one of the states is changed via the editor.
  _forceReapplyVisualState() {
    this._updateVisualState(true);
  }

  // Called before the image entity changes, in order to restore the previous
  // image back to its original tint. Note that this happens immediately, i.e.
  // without any animation.
  _resetToDefaultVisualState(transitionMode) {
    if (this._imageReference.hasComponent('element')) {
      switch (transitionMode) {
        case BUTTON_TRANSITION_MODE_TINT:
          this._cancelTween();
          this._applyTintImmediately(this._defaultTint);
          break;
        case BUTTON_TRANSITION_MODE_SPRITE_CHANGE:
          this._applySprite(this._defaultSpriteAsset, this._defaultSpriteFrame);
          break;
      }
    }
  }
  _determineVisualState() {
    if (!this.active) {
      return VisualState.INACTIVE;
    } else if (this._isPressed) {
      return VisualState.PRESSED;
    } else if (this._isHovering) {
      return VisualState.HOVER;
    }
    return VisualState.DEFAULT;
  }
  _applySprite(spriteAsset, spriteFrame) {
    spriteFrame = spriteFrame || 0;
    if (this._imageReference.hasComponent('element')) {
      this._isApplyingSprite = true;
      if (this._imageReference.entity.element.spriteAsset !== spriteAsset) {
        this._imageReference.entity.element.spriteAsset = spriteAsset;
      }
      if (this._imageReference.entity.element.spriteFrame !== spriteFrame) {
        this._imageReference.entity.element.spriteFrame = spriteFrame;
      }
      this._isApplyingSprite = false;
    }
  }
  _applyTint(tintColor) {
    this._cancelTween();
    if (this.fadeDuration === 0) {
      this._applyTintImmediately(tintColor);
    } else {
      this._applyTintWithTween(tintColor);
    }
  }
  _applyTintImmediately(tintColor) {
    if (!tintColor || !this._imageReference.hasComponent('element') || this._imageReference.entity.element.type === ELEMENTTYPE_GROUP) return;
    const color3 = toColor3(tintColor);
    this._isApplyingTint = true;
    if (!color3.equals(this._imageReference.entity.element.color)) this._imageReference.entity.element.color = color3;
    if (this._imageReference.entity.element.opacity !== tintColor.a) this._imageReference.entity.element.opacity = tintColor.a;
    this._isApplyingTint = false;
  }
  _applyTintWithTween(tintColor) {
    if (!tintColor || !this._imageReference.hasComponent('element') || this._imageReference.entity.element.type === ELEMENTTYPE_GROUP) return;
    const color3 = toColor3(tintColor);
    const color = this._imageReference.entity.element.color;
    const opacity = this._imageReference.entity.element.opacity;
    if (color3.equals(color) && tintColor.a === opacity) return;
    this._tweenInfo = {
      startTime: now(),
      from: new Color(color.r, color.g, color.b, opacity),
      to: tintColor.clone(),
      lerpColor: new Color()
    };
  }
  _updateTintTween() {
    const elapsedTime = now() - this._tweenInfo.startTime;
    let elapsedProportion = this.fadeDuration === 0 ? 1 : elapsedTime / this.fadeDuration;
    elapsedProportion = math.clamp(elapsedProportion, 0, 1);
    if (Math.abs(elapsedProportion - 1) > 1e-5) {
      const lerpColor = this._tweenInfo.lerpColor;
      lerpColor.lerp(this._tweenInfo.from, this._tweenInfo.to, elapsedProportion);
      this._applyTintImmediately(new Color(lerpColor.r, lerpColor.g, lerpColor.b, lerpColor.a));
    } else {
      this._applyTintImmediately(this._tweenInfo.to);
      this._cancelTween();
    }
  }
  _cancelTween() {
    delete this._tweenInfo;
  }
  onUpdate() {
    if (this._tweenInfo) {
      this._updateTintTween();
    }
  }
  onEnable() {
    // Reset input state
    this._isHovering = false;
    this._hoveringCounter = 0;
    this._isPressed = false;
    this._imageReference.onParentComponentEnable();
    this._toggleHitElementListeners('on');
    this._forceReapplyVisualState();
  }
  onDisable() {
    this._toggleHitElementListeners('off');
    this._resetToDefaultVisualState(this.transitionMode);
  }
  onRemove() {
    this._toggleLifecycleListeners('off', this.system);
    this.onDisable();
  }
}
function toColor3(color4) {
  return new Color(color4.r, color4.g, color4.b);
}

export { ButtonComponent };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tcG9uZW50LmpzIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi9zcmMvZnJhbWV3b3JrL2NvbXBvbmVudHMvYnV0dG9uL2NvbXBvbmVudC5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBub3cgfSBmcm9tICcuLi8uLi8uLi9jb3JlL3RpbWUuanMnO1xuXG5pbXBvcnQgeyBtYXRoIH0gZnJvbSAnLi4vLi4vLi4vY29yZS9tYXRoL21hdGguanMnO1xuaW1wb3J0IHsgQ29sb3IgfSBmcm9tICcuLi8uLi8uLi9jb3JlL21hdGgvY29sb3IuanMnO1xuXG5pbXBvcnQgeyBFbnRpdHlSZWZlcmVuY2UgfSBmcm9tICcuLi8uLi91dGlscy9lbnRpdHktcmVmZXJlbmNlLmpzJztcblxuaW1wb3J0IHsgQ29tcG9uZW50IH0gZnJvbSAnLi4vY29tcG9uZW50LmpzJztcblxuaW1wb3J0IHsgQlVUVE9OX1RSQU5TSVRJT05fTU9ERV9TUFJJVEVfQ0hBTkdFLCBCVVRUT05fVFJBTlNJVElPTl9NT0RFX1RJTlQgfSBmcm9tICcuL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBFTEVNRU5UVFlQRV9HUk9VUCB9IGZyb20gJy4uL2VsZW1lbnQvY29uc3RhbnRzLmpzJztcblxuY29uc3QgVmlzdWFsU3RhdGUgPSB7XG4gICAgREVGQVVMVDogJ0RFRkFVTFQnLFxuICAgIEhPVkVSOiAnSE9WRVInLFxuICAgIFBSRVNTRUQ6ICdQUkVTU0VEJyxcbiAgICBJTkFDVElWRTogJ0lOQUNUSVZFJ1xufTtcblxuY29uc3QgU1RBVEVTX1RPX1RJTlRfTkFNRVMgPSB7fTtcblNUQVRFU19UT19USU5UX05BTUVTW1Zpc3VhbFN0YXRlLkRFRkFVTFRdID0gJ19kZWZhdWx0VGludCc7XG5TVEFURVNfVE9fVElOVF9OQU1FU1tWaXN1YWxTdGF0ZS5IT1ZFUl0gPSAnaG92ZXJUaW50JztcblNUQVRFU19UT19USU5UX05BTUVTW1Zpc3VhbFN0YXRlLlBSRVNTRURdID0gJ3ByZXNzZWRUaW50JztcblNUQVRFU19UT19USU5UX05BTUVTW1Zpc3VhbFN0YXRlLklOQUNUSVZFXSA9ICdpbmFjdGl2ZVRpbnQnO1xuXG5jb25zdCBTVEFURVNfVE9fU1BSSVRFX0FTU0VUX05BTUVTID0ge307XG5TVEFURVNfVE9fU1BSSVRFX0FTU0VUX05BTUVTW1Zpc3VhbFN0YXRlLkRFRkFVTFRdID0gJ19kZWZhdWx0U3ByaXRlQXNzZXQnO1xuU1RBVEVTX1RPX1NQUklURV9BU1NFVF9OQU1FU1tWaXN1YWxTdGF0ZS5IT1ZFUl0gPSAnaG92ZXJTcHJpdGVBc3NldCc7XG5TVEFURVNfVE9fU1BSSVRFX0FTU0VUX05BTUVTW1Zpc3VhbFN0YXRlLlBSRVNTRURdID0gJ3ByZXNzZWRTcHJpdGVBc3NldCc7XG5TVEFURVNfVE9fU1BSSVRFX0FTU0VUX05BTUVTW1Zpc3VhbFN0YXRlLklOQUNUSVZFXSA9ICdpbmFjdGl2ZVNwcml0ZUFzc2V0JztcblxuY29uc3QgU1RBVEVTX1RPX1NQUklURV9GUkFNRV9OQU1FUyA9IHt9O1xuU1RBVEVTX1RPX1NQUklURV9GUkFNRV9OQU1FU1tWaXN1YWxTdGF0ZS5ERUZBVUxUXSA9ICdfZGVmYXVsdFNwcml0ZUZyYW1lJztcblNUQVRFU19UT19TUFJJVEVfRlJBTUVfTkFNRVNbVmlzdWFsU3RhdGUuSE9WRVJdID0gJ2hvdmVyU3ByaXRlRnJhbWUnO1xuU1RBVEVTX1RPX1NQUklURV9GUkFNRV9OQU1FU1tWaXN1YWxTdGF0ZS5QUkVTU0VEXSA9ICdwcmVzc2VkU3ByaXRlRnJhbWUnO1xuU1RBVEVTX1RPX1NQUklURV9GUkFNRV9OQU1FU1tWaXN1YWxTdGF0ZS5JTkFDVElWRV0gPSAnaW5hY3RpdmVTcHJpdGVGcmFtZSc7XG5cbi8qKlxuICogQSBCdXR0b25Db21wb25lbnQgZW5hYmxlcyBhIGdyb3VwIG9mIGVudGl0aWVzIHRvIGJlaGF2ZSBsaWtlIGEgYnV0dG9uLCB3aXRoIGRpZmZlcmVudCB2aXN1YWxcbiAqIHN0YXRlcyBmb3IgaG92ZXIgYW5kIHByZXNzIGludGVyYWN0aW9ucy5cbiAqXG4gKiBAcHJvcGVydHkge2Jvb2xlYW59IGFjdGl2ZSBJZiBzZXQgdG8gZmFsc2UsIHRoZSBidXR0b24gd2lsbCBiZSB2aXNpYmxlIGJ1dCB3aWxsIG5vdCByZXNwb25kIHRvXG4gKiBob3ZlciBvciB0b3VjaCBpbnRlcmFjdGlvbnMuXG4gKiBAcHJvcGVydHkge2ltcG9ydCgnLi4vLi4vZW50aXR5LmpzJykuRW50aXR5fSBpbWFnZUVudGl0eSBBIHJlZmVyZW5jZSB0byB0aGUgZW50aXR5IHRvIGJlIHVzZWQgYXNcbiAqIHRoZSBidXR0b24gYmFja2dyb3VuZC4gVGhlIGVudGl0eSBtdXN0IGhhdmUgYW4gSW1hZ2VFbGVtZW50IGNvbXBvbmVudC5cbiAqIEBwcm9wZXJ0eSB7aW1wb3J0KCcuLi8uLi8uLi9jb3JlL21hdGgvdmVjNC5qcycpLlZlYzR9IGhpdFBhZGRpbmcgUGFkZGluZyB0byBiZSB1c2VkIGluIGhpdC10ZXN0XG4gKiBjYWxjdWxhdGlvbnMuIENhbiBiZSB1c2VkIHRvIGV4cGFuZCB0aGUgYm91bmRpbmcgYm94IHNvIHRoYXQgdGhlIGJ1dHRvbiBpcyBlYXNpZXIgdG8gdGFwLlxuICogQHByb3BlcnR5IHtudW1iZXJ9IHRyYW5zaXRpb25Nb2RlIENvbnRyb2xzIGhvdyB0aGUgYnV0dG9uIHJlc3BvbmRzIHdoZW4gdGhlIHVzZXIgaG92ZXJzIG92ZXJcbiAqIGl0L3ByZXNzZXMgaXQuXG4gKiBAcHJvcGVydHkge0NvbG9yfSBob3ZlclRpbnQgQ29sb3IgdG8gYmUgdXNlZCBvbiB0aGUgYnV0dG9uIGltYWdlIHdoZW4gdGhlIHVzZXIgaG92ZXJzIG92ZXIgaXQuXG4gKiBAcHJvcGVydHkge0NvbG9yfSBwcmVzc2VkVGludCBDb2xvciB0byBiZSB1c2VkIG9uIHRoZSBidXR0b24gaW1hZ2Ugd2hlbiB0aGUgdXNlciBwcmVzc2VzIGl0LlxuICogQHByb3BlcnR5IHtDb2xvcn0gaW5hY3RpdmVUaW50IENvbG9yIHRvIGJlIHVzZWQgb24gdGhlIGJ1dHRvbiBpbWFnZSB3aGVuIHRoZSBidXR0b24gaXMgbm90XG4gKiBpbnRlcmFjdGl2ZS5cbiAqIEBwcm9wZXJ0eSB7bnVtYmVyfSBmYWRlRHVyYXRpb24gRHVyYXRpb24gdG8gYmUgdXNlZCB3aGVuIGZhZGluZyBiZXR3ZWVuIHRpbnRzLCBpbiBtaWxsaXNlY29uZHMuXG4gKiBAcHJvcGVydHkge2ltcG9ydCgnLi4vLi4vYXNzZXQvYXNzZXQuanMnKS5Bc3NldH0gaG92ZXJTcHJpdGVBc3NldCBTcHJpdGUgdG8gYmUgdXNlZCBhcyB0aGVcbiAqIGJ1dHRvbiBpbWFnZSB3aGVuIHRoZSB1c2VyIGhvdmVycyBvdmVyIGl0LlxuICogQHByb3BlcnR5IHtudW1iZXJ9IGhvdmVyU3ByaXRlRnJhbWUgRnJhbWUgdG8gYmUgdXNlZCBmcm9tIHRoZSBob3ZlciBzcHJpdGUuXG4gKiBAcHJvcGVydHkge2ltcG9ydCgnLi4vLi4vYXNzZXQvYXNzZXQuanMnKS5Bc3NldH0gcHJlc3NlZFNwcml0ZUFzc2V0IFNwcml0ZSB0byBiZSB1c2VkIGFzIHRoZVxuICogYnV0dG9uIGltYWdlIHdoZW4gdGhlIHVzZXIgcHJlc3NlcyBpdC5cbiAqIEBwcm9wZXJ0eSB7bnVtYmVyfSBwcmVzc2VkU3ByaXRlRnJhbWUgRnJhbWUgdG8gYmUgdXNlZCBmcm9tIHRoZSBwcmVzc2VkIHNwcml0ZS5cbiAqIEBwcm9wZXJ0eSB7aW1wb3J0KCcuLi8uLi9hc3NldC9hc3NldC5qcycpLkFzc2V0fSBpbmFjdGl2ZVNwcml0ZUFzc2V0IFNwcml0ZSB0byBiZSB1c2VkIGFzIHRoZVxuICogYnV0dG9uIGltYWdlIHdoZW4gdGhlIGJ1dHRvbiBpcyBub3QgaW50ZXJhY3RpdmUuXG4gKiBAcHJvcGVydHkge251bWJlcn0gaW5hY3RpdmVTcHJpdGVGcmFtZSBGcmFtZSB0byBiZSB1c2VkIGZyb20gdGhlIGluYWN0aXZlIHNwcml0ZS5cbiAqIEBhdWdtZW50cyBDb21wb25lbnRcbiAqIEBjYXRlZ29yeSBVc2VyIEludGVyZmFjZVxuICovXG5jbGFzcyBCdXR0b25Db21wb25lbnQgZXh0ZW5kcyBDb21wb25lbnQge1xuICAgIC8qKlxuICAgICAqIENyZWF0ZSBhIG5ldyBCdXR0b25Db21wb25lbnQgaW5zdGFuY2UuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi9zeXN0ZW0uanMnKS5CdXR0b25Db21wb25lbnRTeXN0ZW19IHN5c3RlbSAtIFRoZSBDb21wb25lbnRTeXN0ZW0gdGhhdFxuICAgICAqIGNyZWF0ZWQgdGhpcyBjb21wb25lbnQuXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4uLy4uL2VudGl0eS5qcycpLkVudGl0eX0gZW50aXR5IC0gVGhlIGVudGl0eSB0aGF0IHRoaXMgY29tcG9uZW50IGlzXG4gICAgICogYXR0YWNoZWQgdG8uXG4gICAgICovXG4gICAgY29uc3RydWN0b3Ioc3lzdGVtLCBlbnRpdHkpIHtcbiAgICAgICAgc3VwZXIoc3lzdGVtLCBlbnRpdHkpO1xuXG4gICAgICAgIHRoaXMuX3Zpc3VhbFN0YXRlID0gVmlzdWFsU3RhdGUuREVGQVVMVDtcbiAgICAgICAgdGhpcy5faXNIb3ZlcmluZyA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9ob3ZlcmluZ0NvdW50ZXIgPSAwO1xuICAgICAgICB0aGlzLl9pc1ByZXNzZWQgPSBmYWxzZTtcblxuICAgICAgICB0aGlzLl9kZWZhdWx0VGludCA9IG5ldyBDb2xvcigxLCAxLCAxLCAxKTtcbiAgICAgICAgdGhpcy5fZGVmYXVsdFNwcml0ZUFzc2V0ID0gbnVsbDtcbiAgICAgICAgdGhpcy5fZGVmYXVsdFNwcml0ZUZyYW1lID0gMDtcblxuICAgICAgICB0aGlzLl9pbWFnZVJlZmVyZW5jZSA9IG5ldyBFbnRpdHlSZWZlcmVuY2UodGhpcywgJ2ltYWdlRW50aXR5Jywge1xuICAgICAgICAgICAgJ2VsZW1lbnQjZ2Fpbic6IHRoaXMuX29uSW1hZ2VFbGVtZW50R2FpbixcbiAgICAgICAgICAgICdlbGVtZW50I2xvc2UnOiB0aGlzLl9vbkltYWdlRWxlbWVudExvc2UsXG4gICAgICAgICAgICAnZWxlbWVudCNzZXQ6Y29sb3InOiB0aGlzLl9vblNldENvbG9yLFxuICAgICAgICAgICAgJ2VsZW1lbnQjc2V0Om9wYWNpdHknOiB0aGlzLl9vblNldE9wYWNpdHksXG4gICAgICAgICAgICAnZWxlbWVudCNzZXQ6c3ByaXRlQXNzZXQnOiB0aGlzLl9vblNldFNwcml0ZUFzc2V0LFxuICAgICAgICAgICAgJ2VsZW1lbnQjc2V0OnNwcml0ZUZyYW1lJzogdGhpcy5fb25TZXRTcHJpdGVGcmFtZVxuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLl90b2dnbGVMaWZlY3ljbGVMaXN0ZW5lcnMoJ29uJywgc3lzdGVtKTtcbiAgICB9XG5cbiAgICBfdG9nZ2xlTGlmZWN5Y2xlTGlzdGVuZXJzKG9uT3JPZmYsIHN5c3RlbSkge1xuICAgICAgICB0aGlzW29uT3JPZmZdKCdzZXRfYWN0aXZlJywgdGhpcy5fb25TZXRBY3RpdmUsIHRoaXMpO1xuICAgICAgICB0aGlzW29uT3JPZmZdKCdzZXRfdHJhbnNpdGlvbk1vZGUnLCB0aGlzLl9vblNldFRyYW5zaXRpb25Nb2RlLCB0aGlzKTtcbiAgICAgICAgdGhpc1tvbk9yT2ZmXSgnc2V0X2hvdmVyVGludCcsIHRoaXMuX29uU2V0VHJhbnNpdGlvblZhbHVlLCB0aGlzKTtcbiAgICAgICAgdGhpc1tvbk9yT2ZmXSgnc2V0X3ByZXNzZWRUaW50JywgdGhpcy5fb25TZXRUcmFuc2l0aW9uVmFsdWUsIHRoaXMpO1xuICAgICAgICB0aGlzW29uT3JPZmZdKCdzZXRfaW5hY3RpdmVUaW50JywgdGhpcy5fb25TZXRUcmFuc2l0aW9uVmFsdWUsIHRoaXMpO1xuICAgICAgICB0aGlzW29uT3JPZmZdKCdzZXRfaG92ZXJTcHJpdGVBc3NldCcsIHRoaXMuX29uU2V0VHJhbnNpdGlvblZhbHVlLCB0aGlzKTtcbiAgICAgICAgdGhpc1tvbk9yT2ZmXSgnc2V0X2hvdmVyU3ByaXRlRnJhbWUnLCB0aGlzLl9vblNldFRyYW5zaXRpb25WYWx1ZSwgdGhpcyk7XG4gICAgICAgIHRoaXNbb25Pck9mZl0oJ3NldF9wcmVzc2VkU3ByaXRlQXNzZXQnLCB0aGlzLl9vblNldFRyYW5zaXRpb25WYWx1ZSwgdGhpcyk7XG4gICAgICAgIHRoaXNbb25Pck9mZl0oJ3NldF9wcmVzc2VkU3ByaXRlRnJhbWUnLCB0aGlzLl9vblNldFRyYW5zaXRpb25WYWx1ZSwgdGhpcyk7XG4gICAgICAgIHRoaXNbb25Pck9mZl0oJ3NldF9pbmFjdGl2ZVNwcml0ZUFzc2V0JywgdGhpcy5fb25TZXRUcmFuc2l0aW9uVmFsdWUsIHRoaXMpO1xuICAgICAgICB0aGlzW29uT3JPZmZdKCdzZXRfaW5hY3RpdmVTcHJpdGVGcmFtZScsIHRoaXMuX29uU2V0VHJhbnNpdGlvblZhbHVlLCB0aGlzKTtcblxuICAgICAgICBzeXN0ZW0uYXBwLnN5c3RlbXMuZWxlbWVudFtvbk9yT2ZmXSgnYWRkJywgdGhpcy5fb25FbGVtZW50Q29tcG9uZW50QWRkLCB0aGlzKTtcbiAgICAgICAgc3lzdGVtLmFwcC5zeXN0ZW1zLmVsZW1lbnRbb25Pck9mZl0oJ2JlZm9yZXJlbW92ZScsIHRoaXMuX29uRWxlbWVudENvbXBvbmVudFJlbW92ZSwgdGhpcyk7XG4gICAgfVxuXG4gICAgX29uU2V0QWN0aXZlKG5hbWUsIG9sZFZhbHVlLCBuZXdWYWx1ZSkge1xuICAgICAgICBpZiAob2xkVmFsdWUgIT09IG5ld1ZhbHVlKSB7XG4gICAgICAgICAgICB0aGlzLl91cGRhdGVWaXN1YWxTdGF0ZSgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgX29uU2V0VHJhbnNpdGlvbk1vZGUobmFtZSwgb2xkVmFsdWUsIG5ld1ZhbHVlKSB7XG4gICAgICAgIGlmIChvbGRWYWx1ZSAhPT0gbmV3VmFsdWUpIHtcbiAgICAgICAgICAgIHRoaXMuX2NhbmNlbFR3ZWVuKCk7XG4gICAgICAgICAgICB0aGlzLl9yZXNldFRvRGVmYXVsdFZpc3VhbFN0YXRlKG9sZFZhbHVlKTtcbiAgICAgICAgICAgIHRoaXMuX2ZvcmNlUmVhcHBseVZpc3VhbFN0YXRlKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBfb25TZXRUcmFuc2l0aW9uVmFsdWUobmFtZSwgb2xkVmFsdWUsIG5ld1ZhbHVlKSB7XG4gICAgICAgIGlmIChvbGRWYWx1ZSAhPT0gbmV3VmFsdWUpIHtcbiAgICAgICAgICAgIHRoaXMuX2ZvcmNlUmVhcHBseVZpc3VhbFN0YXRlKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBfb25FbGVtZW50Q29tcG9uZW50UmVtb3ZlKGVudGl0eSkge1xuICAgICAgICBpZiAodGhpcy5lbnRpdHkgPT09IGVudGl0eSkge1xuICAgICAgICAgICAgdGhpcy5fdG9nZ2xlSGl0RWxlbWVudExpc3RlbmVycygnb2ZmJyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBfb25FbGVtZW50Q29tcG9uZW50QWRkKGVudGl0eSkge1xuICAgICAgICBpZiAodGhpcy5lbnRpdHkgPT09IGVudGl0eSkge1xuICAgICAgICAgICAgdGhpcy5fdG9nZ2xlSGl0RWxlbWVudExpc3RlbmVycygnb24nKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIF9vbkltYWdlRWxlbWVudExvc2UoKSB7XG4gICAgICAgIHRoaXMuX2NhbmNlbFR3ZWVuKCk7XG4gICAgICAgIHRoaXMuX3Jlc2V0VG9EZWZhdWx0VmlzdWFsU3RhdGUodGhpcy50cmFuc2l0aW9uTW9kZSk7XG4gICAgfVxuXG4gICAgX29uSW1hZ2VFbGVtZW50R2FpbigpIHtcbiAgICAgICAgdGhpcy5fc3RvcmVEZWZhdWx0VmlzdWFsU3RhdGUoKTtcbiAgICAgICAgdGhpcy5fZm9yY2VSZWFwcGx5VmlzdWFsU3RhdGUoKTtcbiAgICB9XG5cbiAgICBfdG9nZ2xlSGl0RWxlbWVudExpc3RlbmVycyhvbk9yT2ZmKSB7XG4gICAgICAgIGlmICh0aGlzLmVudGl0eS5lbGVtZW50KSB7XG4gICAgICAgICAgICBjb25zdCBpc0FkZGluZyA9IChvbk9yT2ZmID09PSAnb24nKTtcblxuICAgICAgICAgICAgLy8gUHJldmVudCBkdXBsaWNhdGUgbGlzdGVuZXJzXG4gICAgICAgICAgICBpZiAoaXNBZGRpbmcgJiYgdGhpcy5faGFzSGl0RWxlbWVudExpc3RlbmVycykge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5lbnRpdHkuZWxlbWVudFtvbk9yT2ZmXSgnbW91c2VlbnRlcicsIHRoaXMuX29uTW91c2VFbnRlciwgdGhpcyk7XG4gICAgICAgICAgICB0aGlzLmVudGl0eS5lbGVtZW50W29uT3JPZmZdKCdtb3VzZWxlYXZlJywgdGhpcy5fb25Nb3VzZUxlYXZlLCB0aGlzKTtcbiAgICAgICAgICAgIHRoaXMuZW50aXR5LmVsZW1lbnRbb25Pck9mZl0oJ21vdXNlZG93bicsIHRoaXMuX29uTW91c2VEb3duLCB0aGlzKTtcbiAgICAgICAgICAgIHRoaXMuZW50aXR5LmVsZW1lbnRbb25Pck9mZl0oJ21vdXNldXAnLCB0aGlzLl9vbk1vdXNlVXAsIHRoaXMpO1xuICAgICAgICAgICAgdGhpcy5lbnRpdHkuZWxlbWVudFtvbk9yT2ZmXSgndG91Y2hzdGFydCcsIHRoaXMuX29uVG91Y2hTdGFydCwgdGhpcyk7XG4gICAgICAgICAgICB0aGlzLmVudGl0eS5lbGVtZW50W29uT3JPZmZdKCd0b3VjaGVuZCcsIHRoaXMuX29uVG91Y2hFbmQsIHRoaXMpO1xuICAgICAgICAgICAgdGhpcy5lbnRpdHkuZWxlbWVudFtvbk9yT2ZmXSgndG91Y2hsZWF2ZScsIHRoaXMuX29uVG91Y2hMZWF2ZSwgdGhpcyk7XG4gICAgICAgICAgICB0aGlzLmVudGl0eS5lbGVtZW50W29uT3JPZmZdKCd0b3VjaGNhbmNlbCcsIHRoaXMuX29uVG91Y2hDYW5jZWwsIHRoaXMpO1xuICAgICAgICAgICAgdGhpcy5lbnRpdHkuZWxlbWVudFtvbk9yT2ZmXSgnc2VsZWN0c3RhcnQnLCB0aGlzLl9vblNlbGVjdFN0YXJ0LCB0aGlzKTtcbiAgICAgICAgICAgIHRoaXMuZW50aXR5LmVsZW1lbnRbb25Pck9mZl0oJ3NlbGVjdGVuZCcsIHRoaXMuX29uU2VsZWN0RW5kLCB0aGlzKTtcbiAgICAgICAgICAgIHRoaXMuZW50aXR5LmVsZW1lbnRbb25Pck9mZl0oJ3NlbGVjdGVudGVyJywgdGhpcy5fb25TZWxlY3RFbnRlciwgdGhpcyk7XG4gICAgICAgICAgICB0aGlzLmVudGl0eS5lbGVtZW50W29uT3JPZmZdKCdzZWxlY3RsZWF2ZScsIHRoaXMuX29uU2VsZWN0TGVhdmUsIHRoaXMpO1xuICAgICAgICAgICAgdGhpcy5lbnRpdHkuZWxlbWVudFtvbk9yT2ZmXSgnY2xpY2snLCB0aGlzLl9vbkNsaWNrLCB0aGlzKTtcblxuICAgICAgICAgICAgdGhpcy5faGFzSGl0RWxlbWVudExpc3RlbmVycyA9IGlzQWRkaW5nO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgX3N0b3JlRGVmYXVsdFZpc3VhbFN0YXRlKCkge1xuICAgICAgICAvLyBJZiB0aGUgZWxlbWVudCBpcyBvZiBncm91cCB0eXBlLCBhbGwgaXQncyB2aXN1YWwgcHJvcGVydGllcyBhcmUgbnVsbFxuICAgICAgICBpZiAodGhpcy5faW1hZ2VSZWZlcmVuY2UuaGFzQ29tcG9uZW50KCdlbGVtZW50JykpIHtcbiAgICAgICAgICAgIGNvbnN0IGVsZW1lbnQgPSB0aGlzLl9pbWFnZVJlZmVyZW5jZS5lbnRpdHkuZWxlbWVudDtcbiAgICAgICAgICAgIGlmIChlbGVtZW50LnR5cGUgIT09IEVMRU1FTlRUWVBFX0dST1VQKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fc3RvcmVEZWZhdWx0Q29sb3IoZWxlbWVudC5jb2xvcik7XG4gICAgICAgICAgICAgICAgdGhpcy5fc3RvcmVEZWZhdWx0T3BhY2l0eShlbGVtZW50Lm9wYWNpdHkpO1xuICAgICAgICAgICAgICAgIHRoaXMuX3N0b3JlRGVmYXVsdFNwcml0ZUFzc2V0KGVsZW1lbnQuc3ByaXRlQXNzZXQpO1xuICAgICAgICAgICAgICAgIHRoaXMuX3N0b3JlRGVmYXVsdFNwcml0ZUZyYW1lKGVsZW1lbnQuc3ByaXRlRnJhbWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgX3N0b3JlRGVmYXVsdENvbG9yKGNvbG9yKSB7XG4gICAgICAgIHRoaXMuX2RlZmF1bHRUaW50LnIgPSBjb2xvci5yO1xuICAgICAgICB0aGlzLl9kZWZhdWx0VGludC5nID0gY29sb3IuZztcbiAgICAgICAgdGhpcy5fZGVmYXVsdFRpbnQuYiA9IGNvbG9yLmI7XG4gICAgfVxuXG4gICAgX3N0b3JlRGVmYXVsdE9wYWNpdHkob3BhY2l0eSkge1xuICAgICAgICB0aGlzLl9kZWZhdWx0VGludC5hID0gb3BhY2l0eTtcbiAgICB9XG5cbiAgICBfc3RvcmVEZWZhdWx0U3ByaXRlQXNzZXQoc3ByaXRlQXNzZXQpIHtcbiAgICAgICAgdGhpcy5fZGVmYXVsdFNwcml0ZUFzc2V0ID0gc3ByaXRlQXNzZXQ7XG4gICAgfVxuXG4gICAgX3N0b3JlRGVmYXVsdFNwcml0ZUZyYW1lKHNwcml0ZUZyYW1lKSB7XG4gICAgICAgIHRoaXMuX2RlZmF1bHRTcHJpdGVGcmFtZSA9IHNwcml0ZUZyYW1lO1xuICAgIH1cblxuICAgIF9vblNldENvbG9yKGNvbG9yKSB7XG4gICAgICAgIGlmICghdGhpcy5faXNBcHBseWluZ1RpbnQpIHtcbiAgICAgICAgICAgIHRoaXMuX3N0b3JlRGVmYXVsdENvbG9yKGNvbG9yKTtcbiAgICAgICAgICAgIHRoaXMuX2ZvcmNlUmVhcHBseVZpc3VhbFN0YXRlKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBfb25TZXRPcGFjaXR5KG9wYWNpdHkpIHtcbiAgICAgICAgaWYgKCF0aGlzLl9pc0FwcGx5aW5nVGludCkge1xuICAgICAgICAgICAgdGhpcy5fc3RvcmVEZWZhdWx0T3BhY2l0eShvcGFjaXR5KTtcbiAgICAgICAgICAgIHRoaXMuX2ZvcmNlUmVhcHBseVZpc3VhbFN0YXRlKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBfb25TZXRTcHJpdGVBc3NldChzcHJpdGVBc3NldCkge1xuICAgICAgICBpZiAoIXRoaXMuX2lzQXBwbHlpbmdTcHJpdGUpIHtcbiAgICAgICAgICAgIHRoaXMuX3N0b3JlRGVmYXVsdFNwcml0ZUFzc2V0KHNwcml0ZUFzc2V0KTtcbiAgICAgICAgICAgIHRoaXMuX2ZvcmNlUmVhcHBseVZpc3VhbFN0YXRlKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBfb25TZXRTcHJpdGVGcmFtZShzcHJpdGVGcmFtZSkge1xuICAgICAgICBpZiAoIXRoaXMuX2lzQXBwbHlpbmdTcHJpdGUpIHtcbiAgICAgICAgICAgIHRoaXMuX3N0b3JlRGVmYXVsdFNwcml0ZUZyYW1lKHNwcml0ZUZyYW1lKTtcbiAgICAgICAgICAgIHRoaXMuX2ZvcmNlUmVhcHBseVZpc3VhbFN0YXRlKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBfb25Nb3VzZUVudGVyKGV2ZW50KSB7XG4gICAgICAgIHRoaXMuX2lzSG92ZXJpbmcgPSB0cnVlO1xuXG4gICAgICAgIHRoaXMuX3VwZGF0ZVZpc3VhbFN0YXRlKCk7XG4gICAgICAgIHRoaXMuX2ZpcmVJZkFjdGl2ZSgnbW91c2VlbnRlcicsIGV2ZW50KTtcbiAgICB9XG5cbiAgICBfb25Nb3VzZUxlYXZlKGV2ZW50KSB7XG4gICAgICAgIHRoaXMuX2lzSG92ZXJpbmcgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5faXNQcmVzc2VkID0gZmFsc2U7XG5cbiAgICAgICAgdGhpcy5fdXBkYXRlVmlzdWFsU3RhdGUoKTtcbiAgICAgICAgdGhpcy5fZmlyZUlmQWN0aXZlKCdtb3VzZWxlYXZlJywgZXZlbnQpO1xuICAgIH1cblxuICAgIF9vbk1vdXNlRG93bihldmVudCkge1xuICAgICAgICB0aGlzLl9pc1ByZXNzZWQgPSB0cnVlO1xuXG4gICAgICAgIHRoaXMuX3VwZGF0ZVZpc3VhbFN0YXRlKCk7XG4gICAgICAgIHRoaXMuX2ZpcmVJZkFjdGl2ZSgnbW91c2Vkb3duJywgZXZlbnQpO1xuICAgIH1cblxuICAgIF9vbk1vdXNlVXAoZXZlbnQpIHtcbiAgICAgICAgdGhpcy5faXNQcmVzc2VkID0gZmFsc2U7XG5cbiAgICAgICAgdGhpcy5fdXBkYXRlVmlzdWFsU3RhdGUoKTtcbiAgICAgICAgdGhpcy5fZmlyZUlmQWN0aXZlKCdtb3VzZXVwJywgZXZlbnQpO1xuICAgIH1cblxuICAgIF9vblRvdWNoU3RhcnQoZXZlbnQpIHtcbiAgICAgICAgdGhpcy5faXNQcmVzc2VkID0gdHJ1ZTtcblxuICAgICAgICB0aGlzLl91cGRhdGVWaXN1YWxTdGF0ZSgpO1xuICAgICAgICB0aGlzLl9maXJlSWZBY3RpdmUoJ3RvdWNoc3RhcnQnLCBldmVudCk7XG4gICAgfVxuXG4gICAgX29uVG91Y2hFbmQoZXZlbnQpIHtcbiAgICAgICAgLy8gVGhlIGRlZmF1bHQgYmVoYXZpb3Igb2YgdGhlIGJyb3dzZXIgaXMgdG8gc2ltdWxhdGUgYSBzZXJpZXMgb2ZcbiAgICAgICAgLy8gYG1vdXNlZW50ZXIvZG93bi91cGAgZXZlbnRzIGltbWVkaWF0ZWx5IGFmdGVyIHRoZSBgdG91Y2hlbmRgIGV2ZW50LFxuICAgICAgICAvLyBpbiBvcmRlciB0byBlbnN1cmUgdGhhdCB3ZWJzaXRlcyB0aGF0IGRvbid0IGV4cGxpY2l0bHkgbGlzdGVuIGZvclxuICAgICAgICAvLyB0b3VjaCBldmVudHMgd2lsbCBzdGlsbCB3b3JrIG9uIG1vYmlsZSAoc2VlIGh0dHBzOi8vd3d3Lmh0bWw1cm9ja3MuY29tL2VuL21vYmlsZS90b3VjaGFuZG1vdXNlL1xuICAgICAgICAvLyBmb3IgcmVmZXJlbmNlKS4gVGhpcyBsZWFkcyB0byBhbiBpc3N1ZSB3aGVyZWJ5IGJ1dHRvbnMgd2lsbCBlbnRlclxuICAgICAgICAvLyB0aGUgYGhvdmVyYCBzdGF0ZSBvbiBtb2JpbGUgYnJvd3NlcnMgYWZ0ZXIgdGhlIGB0b3VjaGVuZGAgZXZlbnQgaXNcbiAgICAgICAgLy8gcmVjZWl2ZWQsIGluc3RlYWQgb2YgZ29pbmcgYmFjayB0byB0aGUgYGRlZmF1bHRgIHN0YXRlLiBDYWxsaW5nXG4gICAgICAgIC8vIHByZXZlbnREZWZhdWx0KCkgaGVyZSBmaXhlcyB0aGUgaXNzdWUuXG4gICAgICAgIGV2ZW50LmV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cbiAgICAgICAgdGhpcy5faXNQcmVzc2VkID0gZmFsc2U7XG5cbiAgICAgICAgdGhpcy5fdXBkYXRlVmlzdWFsU3RhdGUoKTtcbiAgICAgICAgdGhpcy5fZmlyZUlmQWN0aXZlKCd0b3VjaGVuZCcsIGV2ZW50KTtcbiAgICB9XG5cbiAgICBfb25Ub3VjaExlYXZlKGV2ZW50KSB7XG4gICAgICAgIHRoaXMuX2lzUHJlc3NlZCA9IGZhbHNlO1xuXG4gICAgICAgIHRoaXMuX3VwZGF0ZVZpc3VhbFN0YXRlKCk7XG4gICAgICAgIHRoaXMuX2ZpcmVJZkFjdGl2ZSgndG91Y2hsZWF2ZScsIGV2ZW50KTtcbiAgICB9XG5cbiAgICBfb25Ub3VjaENhbmNlbChldmVudCkge1xuICAgICAgICB0aGlzLl9pc1ByZXNzZWQgPSBmYWxzZTtcblxuICAgICAgICB0aGlzLl91cGRhdGVWaXN1YWxTdGF0ZSgpO1xuICAgICAgICB0aGlzLl9maXJlSWZBY3RpdmUoJ3RvdWNoY2FuY2VsJywgZXZlbnQpO1xuICAgIH1cblxuICAgIF9vblNlbGVjdFN0YXJ0KGV2ZW50KSB7XG4gICAgICAgIHRoaXMuX2lzUHJlc3NlZCA9IHRydWU7XG4gICAgICAgIHRoaXMuX3VwZGF0ZVZpc3VhbFN0YXRlKCk7XG4gICAgICAgIHRoaXMuX2ZpcmVJZkFjdGl2ZSgnc2VsZWN0c3RhcnQnLCBldmVudCk7XG4gICAgfVxuXG4gICAgX29uU2VsZWN0RW5kKGV2ZW50KSB7XG4gICAgICAgIHRoaXMuX2lzUHJlc3NlZCA9IGZhbHNlO1xuICAgICAgICB0aGlzLl91cGRhdGVWaXN1YWxTdGF0ZSgpO1xuICAgICAgICB0aGlzLl9maXJlSWZBY3RpdmUoJ3NlbGVjdGVuZCcsIGV2ZW50KTtcbiAgICB9XG5cbiAgICBfb25TZWxlY3RFbnRlcihldmVudCkge1xuICAgICAgICB0aGlzLl9ob3ZlcmluZ0NvdW50ZXIrKztcblxuICAgICAgICBpZiAodGhpcy5faG92ZXJpbmdDb3VudGVyID09PSAxKSB7XG4gICAgICAgICAgICB0aGlzLl9pc0hvdmVyaW5nID0gdHJ1ZTtcbiAgICAgICAgICAgIHRoaXMuX3VwZGF0ZVZpc3VhbFN0YXRlKCk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl9maXJlSWZBY3RpdmUoJ3NlbGVjdGVudGVyJywgZXZlbnQpO1xuICAgIH1cblxuICAgIF9vblNlbGVjdExlYXZlKGV2ZW50KSB7XG4gICAgICAgIHRoaXMuX2hvdmVyaW5nQ291bnRlci0tO1xuXG4gICAgICAgIGlmICh0aGlzLl9ob3ZlcmluZ0NvdW50ZXIgPT09IDApIHtcbiAgICAgICAgICAgIHRoaXMuX2lzSG92ZXJpbmcgPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMuX2lzUHJlc3NlZCA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5fdXBkYXRlVmlzdWFsU3RhdGUoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuX2ZpcmVJZkFjdGl2ZSgnc2VsZWN0bGVhdmUnLCBldmVudCk7XG4gICAgfVxuXG4gICAgX29uQ2xpY2soZXZlbnQpIHtcbiAgICAgICAgdGhpcy5fZmlyZUlmQWN0aXZlKCdjbGljaycsIGV2ZW50KTtcbiAgICB9XG5cbiAgICBfZmlyZUlmQWN0aXZlKG5hbWUsIGV2ZW50KSB7XG4gICAgICAgIGlmICh0aGlzLmRhdGEuYWN0aXZlKSB7XG4gICAgICAgICAgICB0aGlzLmZpcmUobmFtZSwgZXZlbnQpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgX3VwZGF0ZVZpc3VhbFN0YXRlKGZvcmNlKSB7XG4gICAgICAgIGNvbnN0IG9sZFZpc3VhbFN0YXRlID0gdGhpcy5fdmlzdWFsU3RhdGU7XG4gICAgICAgIGNvbnN0IG5ld1Zpc3VhbFN0YXRlID0gdGhpcy5fZGV0ZXJtaW5lVmlzdWFsU3RhdGUoKTtcblxuICAgICAgICBpZiAoKG9sZFZpc3VhbFN0YXRlICE9PSBuZXdWaXN1YWxTdGF0ZSB8fCBmb3JjZSkgJiYgdGhpcy5lbmFibGVkKSB7XG4gICAgICAgICAgICB0aGlzLl92aXN1YWxTdGF0ZSA9IG5ld1Zpc3VhbFN0YXRlO1xuXG4gICAgICAgICAgICBpZiAob2xkVmlzdWFsU3RhdGUgPT09IFZpc3VhbFN0YXRlLkhPVkVSKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fZmlyZUlmQWN0aXZlKCdob3ZlcmVuZCcpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAob2xkVmlzdWFsU3RhdGUgPT09IFZpc3VhbFN0YXRlLlBSRVNTRUQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9maXJlSWZBY3RpdmUoJ3ByZXNzZWRlbmQnKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKG5ld1Zpc3VhbFN0YXRlID09PSBWaXN1YWxTdGF0ZS5IT1ZFUikge1xuICAgICAgICAgICAgICAgIHRoaXMuX2ZpcmVJZkFjdGl2ZSgnaG92ZXJzdGFydCcpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAobmV3VmlzdWFsU3RhdGUgPT09IFZpc3VhbFN0YXRlLlBSRVNTRUQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9maXJlSWZBY3RpdmUoJ3ByZXNzZWRzdGFydCcpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBzd2l0Y2ggKHRoaXMudHJhbnNpdGlvbk1vZGUpIHtcbiAgICAgICAgICAgICAgICBjYXNlIEJVVFRPTl9UUkFOU0lUSU9OX01PREVfVElOVDoge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB0aW50TmFtZSA9IFNUQVRFU19UT19USU5UX05BTUVTW3RoaXMuX3Zpc3VhbFN0YXRlXTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdGludENvbG9yID0gdGhpc1t0aW50TmFtZV07XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX2FwcGx5VGludCh0aW50Q29sb3IpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2FzZSBCVVRUT05fVFJBTlNJVElPTl9NT0RFX1NQUklURV9DSEFOR0U6IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgc3ByaXRlQXNzZXROYW1lID0gU1RBVEVTX1RPX1NQUklURV9BU1NFVF9OQU1FU1t0aGlzLl92aXN1YWxTdGF0ZV07XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHNwcml0ZUZyYW1lTmFtZSA9IFNUQVRFU19UT19TUFJJVEVfRlJBTUVfTkFNRVNbdGhpcy5fdmlzdWFsU3RhdGVdO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBzcHJpdGVBc3NldCA9IHRoaXNbc3ByaXRlQXNzZXROYW1lXTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgc3ByaXRlRnJhbWUgPSB0aGlzW3Nwcml0ZUZyYW1lTmFtZV07XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX2FwcGx5U3ByaXRlKHNwcml0ZUFzc2V0LCBzcHJpdGVGcmFtZSk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIENhbGxlZCB3aGVuIGEgcHJvcGVydHkgY2hhbmdlcyB0aGF0IG1lYW4gdGhlIHZpc3VhbCBzdGF0ZSBtdXN0IGJlIHJlYXBwbGllZCxcbiAgICAvLyBldmVuIGlmIHRoZSBzdGF0ZSBlbnVtIGhhcyBub3QgY2hhbmdlZC4gRXhhbXBsZXMgb2YgdGhpcyBhcmUgd2hlbiB0aGUgdGludFxuICAgIC8vIHZhbHVlIGZvciBvbmUgb2YgdGhlIHN0YXRlcyBpcyBjaGFuZ2VkIHZpYSB0aGUgZWRpdG9yLlxuICAgIF9mb3JjZVJlYXBwbHlWaXN1YWxTdGF0ZSgpIHtcbiAgICAgICAgdGhpcy5fdXBkYXRlVmlzdWFsU3RhdGUodHJ1ZSk7XG4gICAgfVxuXG4gICAgLy8gQ2FsbGVkIGJlZm9yZSB0aGUgaW1hZ2UgZW50aXR5IGNoYW5nZXMsIGluIG9yZGVyIHRvIHJlc3RvcmUgdGhlIHByZXZpb3VzXG4gICAgLy8gaW1hZ2UgYmFjayB0byBpdHMgb3JpZ2luYWwgdGludC4gTm90ZSB0aGF0IHRoaXMgaGFwcGVucyBpbW1lZGlhdGVseSwgaS5lLlxuICAgIC8vIHdpdGhvdXQgYW55IGFuaW1hdGlvbi5cbiAgICBfcmVzZXRUb0RlZmF1bHRWaXN1YWxTdGF0ZSh0cmFuc2l0aW9uTW9kZSkge1xuICAgICAgICBpZiAodGhpcy5faW1hZ2VSZWZlcmVuY2UuaGFzQ29tcG9uZW50KCdlbGVtZW50JykpIHtcbiAgICAgICAgICAgIHN3aXRjaCAodHJhbnNpdGlvbk1vZGUpIHtcbiAgICAgICAgICAgICAgICBjYXNlIEJVVFRPTl9UUkFOU0lUSU9OX01PREVfVElOVDpcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fY2FuY2VsVHdlZW4oKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fYXBwbHlUaW50SW1tZWRpYXRlbHkodGhpcy5fZGVmYXVsdFRpbnQpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgICAgIGNhc2UgQlVUVE9OX1RSQU5TSVRJT05fTU9ERV9TUFJJVEVfQ0hBTkdFOlxuICAgICAgICAgICAgICAgICAgICB0aGlzLl9hcHBseVNwcml0ZSh0aGlzLl9kZWZhdWx0U3ByaXRlQXNzZXQsIHRoaXMuX2RlZmF1bHRTcHJpdGVGcmFtZSk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgX2RldGVybWluZVZpc3VhbFN0YXRlKCkge1xuICAgICAgICBpZiAoIXRoaXMuYWN0aXZlKSB7XG4gICAgICAgICAgICByZXR1cm4gVmlzdWFsU3RhdGUuSU5BQ1RJVkU7XG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5faXNQcmVzc2VkKSB7XG4gICAgICAgICAgICByZXR1cm4gVmlzdWFsU3RhdGUuUFJFU1NFRDtcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLl9pc0hvdmVyaW5nKSB7XG4gICAgICAgICAgICByZXR1cm4gVmlzdWFsU3RhdGUuSE9WRVI7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gVmlzdWFsU3RhdGUuREVGQVVMVDtcbiAgICB9XG5cbiAgICBfYXBwbHlTcHJpdGUoc3ByaXRlQXNzZXQsIHNwcml0ZUZyYW1lKSB7XG4gICAgICAgIHNwcml0ZUZyYW1lID0gc3ByaXRlRnJhbWUgfHwgMDtcblxuICAgICAgICBpZiAodGhpcy5faW1hZ2VSZWZlcmVuY2UuaGFzQ29tcG9uZW50KCdlbGVtZW50JykpIHtcbiAgICAgICAgICAgIHRoaXMuX2lzQXBwbHlpbmdTcHJpdGUgPSB0cnVlO1xuXG4gICAgICAgICAgICBpZiAodGhpcy5faW1hZ2VSZWZlcmVuY2UuZW50aXR5LmVsZW1lbnQuc3ByaXRlQXNzZXQgIT09IHNwcml0ZUFzc2V0KSB7XG4gICAgICAgICAgICAgICAgdGhpcy5faW1hZ2VSZWZlcmVuY2UuZW50aXR5LmVsZW1lbnQuc3ByaXRlQXNzZXQgPSBzcHJpdGVBc3NldDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHRoaXMuX2ltYWdlUmVmZXJlbmNlLmVudGl0eS5lbGVtZW50LnNwcml0ZUZyYW1lICE9PSBzcHJpdGVGcmFtZSkge1xuICAgICAgICAgICAgICAgIHRoaXMuX2ltYWdlUmVmZXJlbmNlLmVudGl0eS5lbGVtZW50LnNwcml0ZUZyYW1lID0gc3ByaXRlRnJhbWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuX2lzQXBwbHlpbmdTcHJpdGUgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIF9hcHBseVRpbnQodGludENvbG9yKSB7XG4gICAgICAgIHRoaXMuX2NhbmNlbFR3ZWVuKCk7XG5cbiAgICAgICAgaWYgKHRoaXMuZmFkZUR1cmF0aW9uID09PSAwKSB7XG4gICAgICAgICAgICB0aGlzLl9hcHBseVRpbnRJbW1lZGlhdGVseSh0aW50Q29sb3IpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5fYXBwbHlUaW50V2l0aFR3ZWVuKHRpbnRDb2xvcik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBfYXBwbHlUaW50SW1tZWRpYXRlbHkodGludENvbG9yKSB7XG4gICAgICAgIGlmICghdGludENvbG9yIHx8ICF0aGlzLl9pbWFnZVJlZmVyZW5jZS5oYXNDb21wb25lbnQoJ2VsZW1lbnQnKSB8fCB0aGlzLl9pbWFnZVJlZmVyZW5jZS5lbnRpdHkuZWxlbWVudC50eXBlID09PSBFTEVNRU5UVFlQRV9HUk9VUClcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICBjb25zdCBjb2xvcjMgPSB0b0NvbG9yMyh0aW50Q29sb3IpO1xuXG4gICAgICAgIHRoaXMuX2lzQXBwbHlpbmdUaW50ID0gdHJ1ZTtcblxuICAgICAgICBpZiAoIWNvbG9yMy5lcXVhbHModGhpcy5faW1hZ2VSZWZlcmVuY2UuZW50aXR5LmVsZW1lbnQuY29sb3IpKVxuICAgICAgICAgICAgdGhpcy5faW1hZ2VSZWZlcmVuY2UuZW50aXR5LmVsZW1lbnQuY29sb3IgPSBjb2xvcjM7XG5cbiAgICAgICAgaWYgKHRoaXMuX2ltYWdlUmVmZXJlbmNlLmVudGl0eS5lbGVtZW50Lm9wYWNpdHkgIT09IHRpbnRDb2xvci5hKVxuICAgICAgICAgICAgdGhpcy5faW1hZ2VSZWZlcmVuY2UuZW50aXR5LmVsZW1lbnQub3BhY2l0eSA9IHRpbnRDb2xvci5hO1xuXG4gICAgICAgIHRoaXMuX2lzQXBwbHlpbmdUaW50ID0gZmFsc2U7XG4gICAgfVxuXG4gICAgX2FwcGx5VGludFdpdGhUd2Vlbih0aW50Q29sb3IpIHtcbiAgICAgICAgaWYgKCF0aW50Q29sb3IgfHwgIXRoaXMuX2ltYWdlUmVmZXJlbmNlLmhhc0NvbXBvbmVudCgnZWxlbWVudCcpIHx8IHRoaXMuX2ltYWdlUmVmZXJlbmNlLmVudGl0eS5lbGVtZW50LnR5cGUgPT09IEVMRU1FTlRUWVBFX0dST1VQKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIGNvbnN0IGNvbG9yMyA9IHRvQ29sb3IzKHRpbnRDb2xvcik7XG4gICAgICAgIGNvbnN0IGNvbG9yID0gdGhpcy5faW1hZ2VSZWZlcmVuY2UuZW50aXR5LmVsZW1lbnQuY29sb3I7XG4gICAgICAgIGNvbnN0IG9wYWNpdHkgPSB0aGlzLl9pbWFnZVJlZmVyZW5jZS5lbnRpdHkuZWxlbWVudC5vcGFjaXR5O1xuXG4gICAgICAgIGlmIChjb2xvcjMuZXF1YWxzKGNvbG9yKSAmJiB0aW50Q29sb3IuYSA9PT0gb3BhY2l0eSlcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICB0aGlzLl90d2VlbkluZm8gPSB7XG4gICAgICAgICAgICBzdGFydFRpbWU6IG5vdygpLFxuICAgICAgICAgICAgZnJvbTogbmV3IENvbG9yKGNvbG9yLnIsIGNvbG9yLmcsIGNvbG9yLmIsIG9wYWNpdHkpLFxuICAgICAgICAgICAgdG86IHRpbnRDb2xvci5jbG9uZSgpLFxuICAgICAgICAgICAgbGVycENvbG9yOiBuZXcgQ29sb3IoKVxuICAgICAgICB9O1xuICAgIH1cblxuICAgIF91cGRhdGVUaW50VHdlZW4oKSB7XG4gICAgICAgIGNvbnN0IGVsYXBzZWRUaW1lID0gbm93KCkgLSB0aGlzLl90d2VlbkluZm8uc3RhcnRUaW1lO1xuICAgICAgICBsZXQgZWxhcHNlZFByb3BvcnRpb24gPSB0aGlzLmZhZGVEdXJhdGlvbiA9PT0gMCA/IDEgOiAoZWxhcHNlZFRpbWUgLyB0aGlzLmZhZGVEdXJhdGlvbik7XG4gICAgICAgIGVsYXBzZWRQcm9wb3J0aW9uID0gbWF0aC5jbGFtcChlbGFwc2VkUHJvcG9ydGlvbiwgMCwgMSk7XG5cbiAgICAgICAgaWYgKE1hdGguYWJzKGVsYXBzZWRQcm9wb3J0aW9uIC0gMSkgPiAxZS01KSB7XG4gICAgICAgICAgICBjb25zdCBsZXJwQ29sb3IgPSB0aGlzLl90d2VlbkluZm8ubGVycENvbG9yO1xuICAgICAgICAgICAgbGVycENvbG9yLmxlcnAodGhpcy5fdHdlZW5JbmZvLmZyb20sIHRoaXMuX3R3ZWVuSW5mby50bywgZWxhcHNlZFByb3BvcnRpb24pO1xuICAgICAgICAgICAgdGhpcy5fYXBwbHlUaW50SW1tZWRpYXRlbHkobmV3IENvbG9yKGxlcnBDb2xvci5yLCBsZXJwQ29sb3IuZywgbGVycENvbG9yLmIsIGxlcnBDb2xvci5hKSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLl9hcHBseVRpbnRJbW1lZGlhdGVseSh0aGlzLl90d2VlbkluZm8udG8pO1xuICAgICAgICAgICAgdGhpcy5fY2FuY2VsVHdlZW4oKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIF9jYW5jZWxUd2VlbigpIHtcbiAgICAgICAgZGVsZXRlIHRoaXMuX3R3ZWVuSW5mbztcbiAgICB9XG5cbiAgICBvblVwZGF0ZSgpIHtcbiAgICAgICAgaWYgKHRoaXMuX3R3ZWVuSW5mbykge1xuICAgICAgICAgICAgdGhpcy5fdXBkYXRlVGludFR3ZWVuKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBvbkVuYWJsZSgpIHtcbiAgICAgICAgLy8gUmVzZXQgaW5wdXQgc3RhdGVcbiAgICAgICAgdGhpcy5faXNIb3ZlcmluZyA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9ob3ZlcmluZ0NvdW50ZXIgPSAwO1xuICAgICAgICB0aGlzLl9pc1ByZXNzZWQgPSBmYWxzZTtcblxuICAgICAgICB0aGlzLl9pbWFnZVJlZmVyZW5jZS5vblBhcmVudENvbXBvbmVudEVuYWJsZSgpO1xuICAgICAgICB0aGlzLl90b2dnbGVIaXRFbGVtZW50TGlzdGVuZXJzKCdvbicpO1xuICAgICAgICB0aGlzLl9mb3JjZVJlYXBwbHlWaXN1YWxTdGF0ZSgpO1xuICAgIH1cblxuICAgIG9uRGlzYWJsZSgpIHtcbiAgICAgICAgdGhpcy5fdG9nZ2xlSGl0RWxlbWVudExpc3RlbmVycygnb2ZmJyk7XG4gICAgICAgIHRoaXMuX3Jlc2V0VG9EZWZhdWx0VmlzdWFsU3RhdGUodGhpcy50cmFuc2l0aW9uTW9kZSk7XG4gICAgfVxuXG4gICAgb25SZW1vdmUoKSB7XG4gICAgICAgIHRoaXMuX3RvZ2dsZUxpZmVjeWNsZUxpc3RlbmVycygnb2ZmJywgdGhpcy5zeXN0ZW0pO1xuICAgICAgICB0aGlzLm9uRGlzYWJsZSgpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gdG9Db2xvcjMoY29sb3I0KSB7XG4gICAgcmV0dXJuIG5ldyBDb2xvcihjb2xvcjQuciwgY29sb3I0LmcsIGNvbG9yNC5iKTtcbn1cblxuLyoqXG4gKiBGaXJlZCB3aGVuIHRoZSBtb3VzZSBpcyBwcmVzc2VkIHdoaWxlIHRoZSBjdXJzb3IgaXMgb24gdGhlIGNvbXBvbmVudC5cbiAqXG4gKiBAZXZlbnQgQnV0dG9uQ29tcG9uZW50I21vdXNlZG93blxuICogQHBhcmFtIHtpbXBvcnQoJy4uLy4uL2lucHV0L2VsZW1lbnQtaW5wdXQuanMnKS5FbGVtZW50TW91c2VFdmVudH0gZXZlbnQgLSBUaGUgZXZlbnQuXG4gKi9cblxuLyoqXG4gKiBGaXJlZCB3aGVuIHRoZSBtb3VzZSBpcyByZWxlYXNlZCB3aGlsZSB0aGUgY3Vyc29yIGlzIG9uIHRoZSBjb21wb25lbnQuXG4gKlxuICogQGV2ZW50IEJ1dHRvbkNvbXBvbmVudCNtb3VzZXVwXG4gKiBAcGFyYW0ge2ltcG9ydCgnLi4vLi4vaW5wdXQvZWxlbWVudC1pbnB1dC5qcycpLkVsZW1lbnRNb3VzZUV2ZW50fSBldmVudCAtIFRoZSBldmVudC5cbiAqL1xuXG4vKipcbiAqIEZpcmVkIHdoZW4gdGhlIG1vdXNlIGN1cnNvciBlbnRlcnMgdGhlIGNvbXBvbmVudC5cbiAqXG4gKiBAZXZlbnQgQnV0dG9uQ29tcG9uZW50I21vdXNlZW50ZXJcbiAqIEBwYXJhbSB7aW1wb3J0KCcuLi8uLi9pbnB1dC9lbGVtZW50LWlucHV0LmpzJykuRWxlbWVudE1vdXNlRXZlbnR9IGV2ZW50IC0gVGhlIGV2ZW50LlxuICovXG5cbi8qKlxuICogRmlyZWQgd2hlbiB0aGUgbW91c2UgY3Vyc29yIGxlYXZlcyB0aGUgY29tcG9uZW50LlxuICpcbiAqIEBldmVudCBCdXR0b25Db21wb25lbnQjbW91c2VsZWF2ZVxuICogQHBhcmFtIHtpbXBvcnQoJy4uLy4uL2lucHV0L2VsZW1lbnQtaW5wdXQuanMnKS5FbGVtZW50TW91c2VFdmVudH0gZXZlbnQgLSBUaGUgZXZlbnQuXG4gKi9cblxuLyoqXG4gKiBGaXJlZCB3aGVuIHRoZSBtb3VzZSBpcyBwcmVzc2VkIGFuZCByZWxlYXNlZCBvbiB0aGUgY29tcG9uZW50IG9yIHdoZW4gYSB0b3VjaCBzdGFydHMgYW5kIGVuZHMgb25cbiAqIHRoZSBjb21wb25lbnQuXG4gKlxuICogQGV2ZW50IEJ1dHRvbkNvbXBvbmVudCNjbGlja1xuICogQHBhcmFtIHtpbXBvcnQoJy4uLy4uL2lucHV0L2VsZW1lbnQtaW5wdXQuanMnKS5FbGVtZW50TW91c2VFdmVudHxpbXBvcnQoJy4uLy4uL2lucHV0L2VsZW1lbnQtaW5wdXQuanMnKS5FbGVtZW50VG91Y2hFdmVudH0gZXZlbnQgLSBUaGUgZXZlbnQuXG4gKi9cblxuLyoqXG4gKiBGaXJlZCB3aGVuIGEgdG91Y2ggc3RhcnRzIG9uIHRoZSBjb21wb25lbnQuXG4gKlxuICogQGV2ZW50IEJ1dHRvbkNvbXBvbmVudCN0b3VjaHN0YXJ0XG4gKiBAcGFyYW0ge2ltcG9ydCgnLi4vLi4vaW5wdXQvZWxlbWVudC1pbnB1dC5qcycpLkVsZW1lbnRUb3VjaEV2ZW50fSBldmVudCAtIFRoZSBldmVudC5cbiAqL1xuXG4vKipcbiAqIEZpcmVkIHdoZW4gYSB0b3VjaCBlbmRzIG9uIHRoZSBjb21wb25lbnQuXG4gKlxuICogQGV2ZW50IEJ1dHRvbkNvbXBvbmVudCN0b3VjaGVuZFxuICogQHBhcmFtIHtpbXBvcnQoJy4uLy4uL2lucHV0L2VsZW1lbnQtaW5wdXQuanMnKS5FbGVtZW50VG91Y2hFdmVudH0gZXZlbnQgLSBUaGUgZXZlbnQuXG4gKi9cblxuLyoqXG4gKiBGaXJlZCB3aGVuIGEgdG91Y2ggaXMgY2FuY2VsZWQgb24gdGhlIGNvbXBvbmVudC5cbiAqXG4gKiBAZXZlbnQgQnV0dG9uQ29tcG9uZW50I3RvdWNoY2FuY2VsXG4gKiBAcGFyYW0ge2ltcG9ydCgnLi4vLi4vaW5wdXQvZWxlbWVudC1pbnB1dC5qcycpLkVsZW1lbnRUb3VjaEV2ZW50fSBldmVudCAtIFRoZSBldmVudC5cbiAqL1xuXG4vKipcbiAqIEZpcmVkIHdoZW4gYSB0b3VjaCBsZWF2ZXMgdGhlIGNvbXBvbmVudC5cbiAqXG4gKiBAZXZlbnQgQnV0dG9uQ29tcG9uZW50I3RvdWNobGVhdmVcbiAqIEBwYXJhbSB7aW1wb3J0KCcuLi8uLi9pbnB1dC9lbGVtZW50LWlucHV0LmpzJykuRWxlbWVudFRvdWNoRXZlbnR9IGV2ZW50IC0gVGhlIGV2ZW50LlxuICovXG5cbi8qKlxuICogRmlyZWQgd2hlbiBhIHhyIHNlbGVjdCBzdGFydHMgb24gdGhlIGNvbXBvbmVudC5cbiAqXG4gKiBAZXZlbnQgQnV0dG9uQ29tcG9uZW50I3NlbGVjdHN0YXJ0XG4gKiBAcGFyYW0ge2ltcG9ydCgnLi4vLi4vaW5wdXQvZWxlbWVudC1pbnB1dC5qcycpLkVsZW1lbnRTZWxlY3RFdmVudH0gZXZlbnQgLSBUaGUgZXZlbnQuXG4gKi9cblxuLyoqXG4gKiBGaXJlZCB3aGVuIGEgeHIgc2VsZWN0IGVuZHMgb24gdGhlIGNvbXBvbmVudC5cbiAqXG4gKiBAZXZlbnQgQnV0dG9uQ29tcG9uZW50I3NlbGVjdGVuZFxuICogQHBhcmFtIHtpbXBvcnQoJy4uLy4uL2lucHV0L2VsZW1lbnQtaW5wdXQuanMnKS5FbGVtZW50U2VsZWN0RXZlbnR9IGV2ZW50IC0gVGhlIGV2ZW50LlxuICovXG5cbi8qKlxuICogRmlyZWQgd2hlbiBhIHhyIHNlbGVjdCBub3cgaG92ZXJpbmcgb3ZlciB0aGUgY29tcG9uZW50LlxuICpcbiAqIEBldmVudCBCdXR0b25Db21wb25lbnQjc2VsZWN0ZW50ZXJcbiAqIEBwYXJhbSB7aW1wb3J0KCcuLi8uLi9pbnB1dC9lbGVtZW50LWlucHV0LmpzJykuRWxlbWVudFNlbGVjdEV2ZW50fSBldmVudCAtIFRoZSBldmVudC5cbiAqL1xuXG4vKipcbiAqIEZpcmVkIHdoZW4gYSB4ciBzZWxlY3Qgbm90IGhvdmVyaW5nIG92ZXIgdGhlIGNvbXBvbmVudC5cbiAqXG4gKiBAZXZlbnQgQnV0dG9uQ29tcG9uZW50I3NlbGVjdGxlYXZlXG4gKiBAcGFyYW0ge2ltcG9ydCgnLi4vLi4vaW5wdXQvZWxlbWVudC1pbnB1dC5qcycpLkVsZW1lbnRTZWxlY3RFdmVudH0gZXZlbnQgLSBUaGUgZXZlbnQuXG4gKi9cblxuLyoqXG4gKiBGaXJlZCB3aGVuIHRoZSBidXR0b24gY2hhbmdlcyBzdGF0ZSB0byBiZSBob3ZlcmVkLlxuICpcbiAqIEBldmVudCBCdXR0b25Db21wb25lbnQjaG92ZXJzdGFydFxuICovXG5cbi8qKlxuICogRmlyZWQgd2hlbiB0aGUgYnV0dG9uIGNoYW5nZXMgc3RhdGUgdG8gYmUgbm90IGhvdmVyZWQuXG4gKlxuICogQGV2ZW50IEJ1dHRvbkNvbXBvbmVudCNob3ZlcmVuZFxuICovXG5cbi8qKlxuICogRmlyZWQgd2hlbiB0aGUgYnV0dG9uIGNoYW5nZXMgc3RhdGUgdG8gYmUgcHJlc3NlZC5cbiAqXG4gKiBAZXZlbnQgQnV0dG9uQ29tcG9uZW50I3ByZXNzZWRzdGFydFxuICovXG5cbi8qKlxuICogRmlyZWQgd2hlbiB0aGUgYnV0dG9uIGNoYW5nZXMgc3RhdGUgdG8gYmUgbm90IHByZXNzZWQuXG4gKlxuICogQGV2ZW50IEJ1dHRvbkNvbXBvbmVudCNwcmVzc2VkZW5kXG4gKi9cblxuZXhwb3J0IHsgQnV0dG9uQ29tcG9uZW50IH07XG4iXSwibmFtZXMiOlsiVmlzdWFsU3RhdGUiLCJERUZBVUxUIiwiSE9WRVIiLCJQUkVTU0VEIiwiSU5BQ1RJVkUiLCJTVEFURVNfVE9fVElOVF9OQU1FUyIsIlNUQVRFU19UT19TUFJJVEVfQVNTRVRfTkFNRVMiLCJTVEFURVNfVE9fU1BSSVRFX0ZSQU1FX05BTUVTIiwiQnV0dG9uQ29tcG9uZW50IiwiQ29tcG9uZW50IiwiY29uc3RydWN0b3IiLCJzeXN0ZW0iLCJlbnRpdHkiLCJfdmlzdWFsU3RhdGUiLCJfaXNIb3ZlcmluZyIsIl9ob3ZlcmluZ0NvdW50ZXIiLCJfaXNQcmVzc2VkIiwiX2RlZmF1bHRUaW50IiwiQ29sb3IiLCJfZGVmYXVsdFNwcml0ZUFzc2V0IiwiX2RlZmF1bHRTcHJpdGVGcmFtZSIsIl9pbWFnZVJlZmVyZW5jZSIsIkVudGl0eVJlZmVyZW5jZSIsIl9vbkltYWdlRWxlbWVudEdhaW4iLCJfb25JbWFnZUVsZW1lbnRMb3NlIiwiX29uU2V0Q29sb3IiLCJfb25TZXRPcGFjaXR5IiwiX29uU2V0U3ByaXRlQXNzZXQiLCJfb25TZXRTcHJpdGVGcmFtZSIsIl90b2dnbGVMaWZlY3ljbGVMaXN0ZW5lcnMiLCJvbk9yT2ZmIiwiX29uU2V0QWN0aXZlIiwiX29uU2V0VHJhbnNpdGlvbk1vZGUiLCJfb25TZXRUcmFuc2l0aW9uVmFsdWUiLCJhcHAiLCJzeXN0ZW1zIiwiZWxlbWVudCIsIl9vbkVsZW1lbnRDb21wb25lbnRBZGQiLCJfb25FbGVtZW50Q29tcG9uZW50UmVtb3ZlIiwibmFtZSIsIm9sZFZhbHVlIiwibmV3VmFsdWUiLCJfdXBkYXRlVmlzdWFsU3RhdGUiLCJfY2FuY2VsVHdlZW4iLCJfcmVzZXRUb0RlZmF1bHRWaXN1YWxTdGF0ZSIsIl9mb3JjZVJlYXBwbHlWaXN1YWxTdGF0ZSIsIl90b2dnbGVIaXRFbGVtZW50TGlzdGVuZXJzIiwidHJhbnNpdGlvbk1vZGUiLCJfc3RvcmVEZWZhdWx0VmlzdWFsU3RhdGUiLCJpc0FkZGluZyIsIl9oYXNIaXRFbGVtZW50TGlzdGVuZXJzIiwiX29uTW91c2VFbnRlciIsIl9vbk1vdXNlTGVhdmUiLCJfb25Nb3VzZURvd24iLCJfb25Nb3VzZVVwIiwiX29uVG91Y2hTdGFydCIsIl9vblRvdWNoRW5kIiwiX29uVG91Y2hMZWF2ZSIsIl9vblRvdWNoQ2FuY2VsIiwiX29uU2VsZWN0U3RhcnQiLCJfb25TZWxlY3RFbmQiLCJfb25TZWxlY3RFbnRlciIsIl9vblNlbGVjdExlYXZlIiwiX29uQ2xpY2siLCJoYXNDb21wb25lbnQiLCJ0eXBlIiwiRUxFTUVOVFRZUEVfR1JPVVAiLCJfc3RvcmVEZWZhdWx0Q29sb3IiLCJjb2xvciIsIl9zdG9yZURlZmF1bHRPcGFjaXR5Iiwib3BhY2l0eSIsIl9zdG9yZURlZmF1bHRTcHJpdGVBc3NldCIsInNwcml0ZUFzc2V0IiwiX3N0b3JlRGVmYXVsdFNwcml0ZUZyYW1lIiwic3ByaXRlRnJhbWUiLCJyIiwiZyIsImIiLCJhIiwiX2lzQXBwbHlpbmdUaW50IiwiX2lzQXBwbHlpbmdTcHJpdGUiLCJldmVudCIsIl9maXJlSWZBY3RpdmUiLCJwcmV2ZW50RGVmYXVsdCIsImRhdGEiLCJhY3RpdmUiLCJmaXJlIiwiZm9yY2UiLCJvbGRWaXN1YWxTdGF0ZSIsIm5ld1Zpc3VhbFN0YXRlIiwiX2RldGVybWluZVZpc3VhbFN0YXRlIiwiZW5hYmxlZCIsIkJVVFRPTl9UUkFOU0lUSU9OX01PREVfVElOVCIsInRpbnROYW1lIiwidGludENvbG9yIiwiX2FwcGx5VGludCIsIkJVVFRPTl9UUkFOU0lUSU9OX01PREVfU1BSSVRFX0NIQU5HRSIsInNwcml0ZUFzc2V0TmFtZSIsInNwcml0ZUZyYW1lTmFtZSIsIl9hcHBseVNwcml0ZSIsIl9hcHBseVRpbnRJbW1lZGlhdGVseSIsImZhZGVEdXJhdGlvbiIsIl9hcHBseVRpbnRXaXRoVHdlZW4iLCJjb2xvcjMiLCJ0b0NvbG9yMyIsImVxdWFscyIsIl90d2VlbkluZm8iLCJzdGFydFRpbWUiLCJub3ciLCJmcm9tIiwidG8iLCJjbG9uZSIsImxlcnBDb2xvciIsIl91cGRhdGVUaW50VHdlZW4iLCJlbGFwc2VkVGltZSIsImVsYXBzZWRQcm9wb3J0aW9uIiwibWF0aCIsImNsYW1wIiwiTWF0aCIsImFicyIsImxlcnAiLCJvblVwZGF0ZSIsIm9uRW5hYmxlIiwib25QYXJlbnRDb21wb25lbnRFbmFibGUiLCJvbkRpc2FibGUiLCJvblJlbW92ZSIsImNvbG9yNCJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7QUFZQSxNQUFNQSxXQUFXLEdBQUc7QUFDaEJDLEVBQUFBLE9BQU8sRUFBRSxTQUFTO0FBQ2xCQyxFQUFBQSxLQUFLLEVBQUUsT0FBTztBQUNkQyxFQUFBQSxPQUFPLEVBQUUsU0FBUztBQUNsQkMsRUFBQUEsUUFBUSxFQUFFLFVBQUE7QUFDZCxDQUFDLENBQUE7QUFFRCxNQUFNQyxvQkFBb0IsR0FBRyxFQUFFLENBQUE7QUFDL0JBLG9CQUFvQixDQUFDTCxXQUFXLENBQUNDLE9BQU8sQ0FBQyxHQUFHLGNBQWMsQ0FBQTtBQUMxREksb0JBQW9CLENBQUNMLFdBQVcsQ0FBQ0UsS0FBSyxDQUFDLEdBQUcsV0FBVyxDQUFBO0FBQ3JERyxvQkFBb0IsQ0FBQ0wsV0FBVyxDQUFDRyxPQUFPLENBQUMsR0FBRyxhQUFhLENBQUE7QUFDekRFLG9CQUFvQixDQUFDTCxXQUFXLENBQUNJLFFBQVEsQ0FBQyxHQUFHLGNBQWMsQ0FBQTtBQUUzRCxNQUFNRSw0QkFBNEIsR0FBRyxFQUFFLENBQUE7QUFDdkNBLDRCQUE0QixDQUFDTixXQUFXLENBQUNDLE9BQU8sQ0FBQyxHQUFHLHFCQUFxQixDQUFBO0FBQ3pFSyw0QkFBNEIsQ0FBQ04sV0FBVyxDQUFDRSxLQUFLLENBQUMsR0FBRyxrQkFBa0IsQ0FBQTtBQUNwRUksNEJBQTRCLENBQUNOLFdBQVcsQ0FBQ0csT0FBTyxDQUFDLEdBQUcsb0JBQW9CLENBQUE7QUFDeEVHLDRCQUE0QixDQUFDTixXQUFXLENBQUNJLFFBQVEsQ0FBQyxHQUFHLHFCQUFxQixDQUFBO0FBRTFFLE1BQU1HLDRCQUE0QixHQUFHLEVBQUUsQ0FBQTtBQUN2Q0EsNEJBQTRCLENBQUNQLFdBQVcsQ0FBQ0MsT0FBTyxDQUFDLEdBQUcscUJBQXFCLENBQUE7QUFDekVNLDRCQUE0QixDQUFDUCxXQUFXLENBQUNFLEtBQUssQ0FBQyxHQUFHLGtCQUFrQixDQUFBO0FBQ3BFSyw0QkFBNEIsQ0FBQ1AsV0FBVyxDQUFDRyxPQUFPLENBQUMsR0FBRyxvQkFBb0IsQ0FBQTtBQUN4RUksNEJBQTRCLENBQUNQLFdBQVcsQ0FBQ0ksUUFBUSxDQUFDLEdBQUcscUJBQXFCLENBQUE7O0FBRTFFO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxNQUFNSSxlQUFlLFNBQVNDLFNBQVMsQ0FBQztBQUNwQztBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0lDLEVBQUFBLFdBQVdBLENBQUNDLE1BQU0sRUFBRUMsTUFBTSxFQUFFO0FBQ3hCLElBQUEsS0FBSyxDQUFDRCxNQUFNLEVBQUVDLE1BQU0sQ0FBQyxDQUFBO0FBRXJCLElBQUEsSUFBSSxDQUFDQyxZQUFZLEdBQUdiLFdBQVcsQ0FBQ0MsT0FBTyxDQUFBO0lBQ3ZDLElBQUksQ0FBQ2EsV0FBVyxHQUFHLEtBQUssQ0FBQTtJQUN4QixJQUFJLENBQUNDLGdCQUFnQixHQUFHLENBQUMsQ0FBQTtJQUN6QixJQUFJLENBQUNDLFVBQVUsR0FBRyxLQUFLLENBQUE7QUFFdkIsSUFBQSxJQUFJLENBQUNDLFlBQVksR0FBRyxJQUFJQyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUE7SUFDekMsSUFBSSxDQUFDQyxtQkFBbUIsR0FBRyxJQUFJLENBQUE7SUFDL0IsSUFBSSxDQUFDQyxtQkFBbUIsR0FBRyxDQUFDLENBQUE7SUFFNUIsSUFBSSxDQUFDQyxlQUFlLEdBQUcsSUFBSUMsZUFBZSxDQUFDLElBQUksRUFBRSxhQUFhLEVBQUU7TUFDNUQsY0FBYyxFQUFFLElBQUksQ0FBQ0MsbUJBQW1CO01BQ3hDLGNBQWMsRUFBRSxJQUFJLENBQUNDLG1CQUFtQjtNQUN4QyxtQkFBbUIsRUFBRSxJQUFJLENBQUNDLFdBQVc7TUFDckMscUJBQXFCLEVBQUUsSUFBSSxDQUFDQyxhQUFhO01BQ3pDLHlCQUF5QixFQUFFLElBQUksQ0FBQ0MsaUJBQWlCO01BQ2pELHlCQUF5QixFQUFFLElBQUksQ0FBQ0MsaUJBQUFBO0FBQ3BDLEtBQUMsQ0FBQyxDQUFBO0FBRUYsSUFBQSxJQUFJLENBQUNDLHlCQUF5QixDQUFDLElBQUksRUFBRWxCLE1BQU0sQ0FBQyxDQUFBO0FBQ2hELEdBQUE7QUFFQWtCLEVBQUFBLHlCQUF5QkEsQ0FBQ0MsT0FBTyxFQUFFbkIsTUFBTSxFQUFFO0lBQ3ZDLElBQUksQ0FBQ21CLE9BQU8sQ0FBQyxDQUFDLFlBQVksRUFBRSxJQUFJLENBQUNDLFlBQVksRUFBRSxJQUFJLENBQUMsQ0FBQTtJQUNwRCxJQUFJLENBQUNELE9BQU8sQ0FBQyxDQUFDLG9CQUFvQixFQUFFLElBQUksQ0FBQ0Usb0JBQW9CLEVBQUUsSUFBSSxDQUFDLENBQUE7SUFDcEUsSUFBSSxDQUFDRixPQUFPLENBQUMsQ0FBQyxlQUFlLEVBQUUsSUFBSSxDQUFDRyxxQkFBcUIsRUFBRSxJQUFJLENBQUMsQ0FBQTtJQUNoRSxJQUFJLENBQUNILE9BQU8sQ0FBQyxDQUFDLGlCQUFpQixFQUFFLElBQUksQ0FBQ0cscUJBQXFCLEVBQUUsSUFBSSxDQUFDLENBQUE7SUFDbEUsSUFBSSxDQUFDSCxPQUFPLENBQUMsQ0FBQyxrQkFBa0IsRUFBRSxJQUFJLENBQUNHLHFCQUFxQixFQUFFLElBQUksQ0FBQyxDQUFBO0lBQ25FLElBQUksQ0FBQ0gsT0FBTyxDQUFDLENBQUMsc0JBQXNCLEVBQUUsSUFBSSxDQUFDRyxxQkFBcUIsRUFBRSxJQUFJLENBQUMsQ0FBQTtJQUN2RSxJQUFJLENBQUNILE9BQU8sQ0FBQyxDQUFDLHNCQUFzQixFQUFFLElBQUksQ0FBQ0cscUJBQXFCLEVBQUUsSUFBSSxDQUFDLENBQUE7SUFDdkUsSUFBSSxDQUFDSCxPQUFPLENBQUMsQ0FBQyx3QkFBd0IsRUFBRSxJQUFJLENBQUNHLHFCQUFxQixFQUFFLElBQUksQ0FBQyxDQUFBO0lBQ3pFLElBQUksQ0FBQ0gsT0FBTyxDQUFDLENBQUMsd0JBQXdCLEVBQUUsSUFBSSxDQUFDRyxxQkFBcUIsRUFBRSxJQUFJLENBQUMsQ0FBQTtJQUN6RSxJQUFJLENBQUNILE9BQU8sQ0FBQyxDQUFDLHlCQUF5QixFQUFFLElBQUksQ0FBQ0cscUJBQXFCLEVBQUUsSUFBSSxDQUFDLENBQUE7SUFDMUUsSUFBSSxDQUFDSCxPQUFPLENBQUMsQ0FBQyx5QkFBeUIsRUFBRSxJQUFJLENBQUNHLHFCQUFxQixFQUFFLElBQUksQ0FBQyxDQUFBO0FBRTFFdEIsSUFBQUEsTUFBTSxDQUFDdUIsR0FBRyxDQUFDQyxPQUFPLENBQUNDLE9BQU8sQ0FBQ04sT0FBTyxDQUFDLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQ08sc0JBQXNCLEVBQUUsSUFBSSxDQUFDLENBQUE7QUFDN0UxQixJQUFBQSxNQUFNLENBQUN1QixHQUFHLENBQUNDLE9BQU8sQ0FBQ0MsT0FBTyxDQUFDTixPQUFPLENBQUMsQ0FBQyxjQUFjLEVBQUUsSUFBSSxDQUFDUSx5QkFBeUIsRUFBRSxJQUFJLENBQUMsQ0FBQTtBQUM3RixHQUFBO0FBRUFQLEVBQUFBLFlBQVlBLENBQUNRLElBQUksRUFBRUMsUUFBUSxFQUFFQyxRQUFRLEVBQUU7SUFDbkMsSUFBSUQsUUFBUSxLQUFLQyxRQUFRLEVBQUU7TUFDdkIsSUFBSSxDQUFDQyxrQkFBa0IsRUFBRSxDQUFBO0FBQzdCLEtBQUE7QUFDSixHQUFBO0FBRUFWLEVBQUFBLG9CQUFvQkEsQ0FBQ08sSUFBSSxFQUFFQyxRQUFRLEVBQUVDLFFBQVEsRUFBRTtJQUMzQyxJQUFJRCxRQUFRLEtBQUtDLFFBQVEsRUFBRTtNQUN2QixJQUFJLENBQUNFLFlBQVksRUFBRSxDQUFBO0FBQ25CLE1BQUEsSUFBSSxDQUFDQywwQkFBMEIsQ0FBQ0osUUFBUSxDQUFDLENBQUE7TUFDekMsSUFBSSxDQUFDSyx3QkFBd0IsRUFBRSxDQUFBO0FBQ25DLEtBQUE7QUFDSixHQUFBO0FBRUFaLEVBQUFBLHFCQUFxQkEsQ0FBQ00sSUFBSSxFQUFFQyxRQUFRLEVBQUVDLFFBQVEsRUFBRTtJQUM1QyxJQUFJRCxRQUFRLEtBQUtDLFFBQVEsRUFBRTtNQUN2QixJQUFJLENBQUNJLHdCQUF3QixFQUFFLENBQUE7QUFDbkMsS0FBQTtBQUNKLEdBQUE7RUFFQVAseUJBQXlCQSxDQUFDMUIsTUFBTSxFQUFFO0FBQzlCLElBQUEsSUFBSSxJQUFJLENBQUNBLE1BQU0sS0FBS0EsTUFBTSxFQUFFO0FBQ3hCLE1BQUEsSUFBSSxDQUFDa0MsMEJBQTBCLENBQUMsS0FBSyxDQUFDLENBQUE7QUFDMUMsS0FBQTtBQUNKLEdBQUE7RUFFQVQsc0JBQXNCQSxDQUFDekIsTUFBTSxFQUFFO0FBQzNCLElBQUEsSUFBSSxJQUFJLENBQUNBLE1BQU0sS0FBS0EsTUFBTSxFQUFFO0FBQ3hCLE1BQUEsSUFBSSxDQUFDa0MsMEJBQTBCLENBQUMsSUFBSSxDQUFDLENBQUE7QUFDekMsS0FBQTtBQUNKLEdBQUE7QUFFQXRCLEVBQUFBLG1CQUFtQkEsR0FBRztJQUNsQixJQUFJLENBQUNtQixZQUFZLEVBQUUsQ0FBQTtBQUNuQixJQUFBLElBQUksQ0FBQ0MsMEJBQTBCLENBQUMsSUFBSSxDQUFDRyxjQUFjLENBQUMsQ0FBQTtBQUN4RCxHQUFBO0FBRUF4QixFQUFBQSxtQkFBbUJBLEdBQUc7SUFDbEIsSUFBSSxDQUFDeUIsd0JBQXdCLEVBQUUsQ0FBQTtJQUMvQixJQUFJLENBQUNILHdCQUF3QixFQUFFLENBQUE7QUFDbkMsR0FBQTtFQUVBQywwQkFBMEJBLENBQUNoQixPQUFPLEVBQUU7QUFDaEMsSUFBQSxJQUFJLElBQUksQ0FBQ2xCLE1BQU0sQ0FBQ3dCLE9BQU8sRUFBRTtBQUNyQixNQUFBLE1BQU1hLFFBQVEsR0FBSW5CLE9BQU8sS0FBSyxJQUFLLENBQUE7O0FBRW5DO0FBQ0EsTUFBQSxJQUFJbUIsUUFBUSxJQUFJLElBQUksQ0FBQ0MsdUJBQXVCLEVBQUU7QUFDMUMsUUFBQSxPQUFBO0FBQ0osT0FBQTtBQUVBLE1BQUEsSUFBSSxDQUFDdEMsTUFBTSxDQUFDd0IsT0FBTyxDQUFDTixPQUFPLENBQUMsQ0FBQyxZQUFZLEVBQUUsSUFBSSxDQUFDcUIsYUFBYSxFQUFFLElBQUksQ0FBQyxDQUFBO0FBQ3BFLE1BQUEsSUFBSSxDQUFDdkMsTUFBTSxDQUFDd0IsT0FBTyxDQUFDTixPQUFPLENBQUMsQ0FBQyxZQUFZLEVBQUUsSUFBSSxDQUFDc0IsYUFBYSxFQUFFLElBQUksQ0FBQyxDQUFBO0FBQ3BFLE1BQUEsSUFBSSxDQUFDeEMsTUFBTSxDQUFDd0IsT0FBTyxDQUFDTixPQUFPLENBQUMsQ0FBQyxXQUFXLEVBQUUsSUFBSSxDQUFDdUIsWUFBWSxFQUFFLElBQUksQ0FBQyxDQUFBO0FBQ2xFLE1BQUEsSUFBSSxDQUFDekMsTUFBTSxDQUFDd0IsT0FBTyxDQUFDTixPQUFPLENBQUMsQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDd0IsVUFBVSxFQUFFLElBQUksQ0FBQyxDQUFBO0FBQzlELE1BQUEsSUFBSSxDQUFDMUMsTUFBTSxDQUFDd0IsT0FBTyxDQUFDTixPQUFPLENBQUMsQ0FBQyxZQUFZLEVBQUUsSUFBSSxDQUFDeUIsYUFBYSxFQUFFLElBQUksQ0FBQyxDQUFBO0FBQ3BFLE1BQUEsSUFBSSxDQUFDM0MsTUFBTSxDQUFDd0IsT0FBTyxDQUFDTixPQUFPLENBQUMsQ0FBQyxVQUFVLEVBQUUsSUFBSSxDQUFDMEIsV0FBVyxFQUFFLElBQUksQ0FBQyxDQUFBO0FBQ2hFLE1BQUEsSUFBSSxDQUFDNUMsTUFBTSxDQUFDd0IsT0FBTyxDQUFDTixPQUFPLENBQUMsQ0FBQyxZQUFZLEVBQUUsSUFBSSxDQUFDMkIsYUFBYSxFQUFFLElBQUksQ0FBQyxDQUFBO0FBQ3BFLE1BQUEsSUFBSSxDQUFDN0MsTUFBTSxDQUFDd0IsT0FBTyxDQUFDTixPQUFPLENBQUMsQ0FBQyxhQUFhLEVBQUUsSUFBSSxDQUFDNEIsY0FBYyxFQUFFLElBQUksQ0FBQyxDQUFBO0FBQ3RFLE1BQUEsSUFBSSxDQUFDOUMsTUFBTSxDQUFDd0IsT0FBTyxDQUFDTixPQUFPLENBQUMsQ0FBQyxhQUFhLEVBQUUsSUFBSSxDQUFDNkIsY0FBYyxFQUFFLElBQUksQ0FBQyxDQUFBO0FBQ3RFLE1BQUEsSUFBSSxDQUFDL0MsTUFBTSxDQUFDd0IsT0FBTyxDQUFDTixPQUFPLENBQUMsQ0FBQyxXQUFXLEVB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
