import { Debug } from '../../../core/debug.js';
import { math } from '../../../core/math/math.js';
import { Vec2 } from '../../../core/math/vec2.js';
import { Vec3 } from '../../../core/math/vec3.js';
import { ORIENTATION_HORIZONTAL, ORIENTATION_VERTICAL } from '../../../scene/constants.js';
import { EntityReference } from '../../utils/entity-reference.js';
import { ElementDragHelper } from '../element/element-drag-helper.js';
import { SCROLL_MODE_INFINITE, SCROLL_MODE_BOUNCE, SCROLL_MODE_CLAMP, SCROLLBAR_VISIBILITY_SHOW_WHEN_REQUIRED, SCROLLBAR_VISIBILITY_SHOW_ALWAYS } from './constants.js';
import { Component } from '../component.js';
import { EVENT_MOUSEWHEEL } from '../../../platform/input/constants.js';

const _tempScrollValue = new Vec2();

/**
 * A ScrollViewComponent enables a group of entities to behave like a masked scrolling area, with
 * optional horizontal and vertical scroll bars.
 *
 * @property {boolean} horizontal Whether to enable horizontal scrolling.
 * @property {boolean} vertical Whether to enable vertical scrolling.
 * @property {number} scrollMode Specifies how the scroll view should behave when the user scrolls
 * past the end of the content. Modes are defined as follows:
 *
 * - {@link SCROLL_MODE_CLAMP}: Content does not scroll any further than its bounds.
 * - {@link SCROLL_MODE_BOUNCE}: Content scrolls past its bounds and then gently bounces back.
 * - {@link SCROLL_MODE_INFINITE}: Content can scroll forever.
 *
 * @property {number} bounceAmount Controls how far the content should move before bouncing back.
 * @property {number} friction Controls how freely the content should move if thrown, i.e. By
 * flicking on a phone or by flinging the scroll wheel on a mouse. A value of 1 means that content
 * will stop immediately; 0 means that content will continue moving forever (or until the bounds of
 * the content are reached, depending on the scrollMode).
 * @property {boolean} useMouseWheel Whether to use mouse wheel for scrolling (horizontally and
 * vertically).
 * @property {Vec2} mouseWheelSensitivity Mouse wheel horizontal and vertical sensitivity. Only
 * used if useMouseWheel is set. Setting a direction to 0 will disable mouse wheel scrolling in
 * that direction. 1 is a default sensitivity that is considered to feel good. The values can be
 * set higher or lower than 1 to tune the sensitivity. Defaults to [1, 1].
 * @property {number} horizontalScrollbarVisibility Controls whether the horizontal scrollbar
 * should be visible all the time, or only visible when the content exceeds the size of the
 * viewport.
 * @property {number} verticalScrollbarVisibility Controls whether the vertical scrollbar should be
 * visible all the time, or only visible when the content exceeds the size of the viewport.
 * @property {import('../../entity.js').Entity} viewportEntity The entity to be used as the masked
 * viewport area, within which the content will scroll. This entity must have an ElementGroup
 * component.
 * @property {import('../../entity.js').Entity} contentEntity The entity which contains the
 * scrolling content itself. This entity must have an Element component.
 * @property {import('../../entity.js').Entity} horizontalScrollbarEntity The entity to be used as
 * the vertical scrollbar. This entity must have a Scrollbar component.
 * @property {import('../../entity.js').Entity} verticalScrollbarEntity The entity to be used as
 * the vertical scrollbar. This entity must have a Scrollbar component.
 * @augments Component
 * @category User Interface
 */
class ScrollViewComponent extends Component {
  /**
   * Create a new ScrollViewComponent.
   *
   * @param {import('./system.js').ScrollViewComponentSystem} system - The ComponentSystem that
   * created this Component.
   * @param {import('../../entity.js').Entity} entity - The Entity that this Component is
   * attached to.
   */
  constructor(system, entity) {
    super(system, entity);
    this._viewportReference = new EntityReference(this, 'viewportEntity', {
      'element#gain': this._onViewportElementGain,
      'element#resize': this._onSetContentOrViewportSize
    });
    this._contentReference = new EntityReference(this, 'contentEntity', {
      'element#gain': this._onContentElementGain,
      'element#lose': this._onContentElementLose,
      'element#resize': this._onSetContentOrViewportSize
    });
    this._scrollbarUpdateFlags = {};
    this._scrollbarReferences = {};
    this._scrollbarReferences[ORIENTATION_HORIZONTAL] = new EntityReference(this, 'horizontalScrollbarEntity', {
      'scrollbar#set:value': this._onSetHorizontalScrollbarValue,
      'scrollbar#gain': this._onHorizontalScrollbarGain
    });
    this._scrollbarReferences[ORIENTATION_VERTICAL] = new EntityReference(this, 'verticalScrollbarEntity', {
      'scrollbar#set:value': this._onSetVerticalScrollbarValue,
      'scrollbar#gain': this._onVerticalScrollbarGain
    });
    this._prevContentSizes = {};
    this._prevContentSizes[ORIENTATION_HORIZONTAL] = null;
    this._prevContentSizes[ORIENTATION_VERTICAL] = null;
    this._scroll = new Vec2();
    this._velocity = new Vec3();
    this._dragStartPosition = new Vec3();
    this._disabledContentInput = false;
    this._disabledContentInputEntities = [];
    this._toggleLifecycleListeners('on', system);
    this._toggleElementListeners('on');
  }

  /**
   * Fired whenever the scroll position changes.
   *
   * @event ScrollViewComponent#set:scroll
   * @param {Vec2} scrollPosition - Horizontal and vertical scroll values in the range 0...1.
   */

  /**
   * @param {string} onOrOff - 'on' or 'off'.
   * @param {import('./system.js').ScrollViewComponentSystem} system - The ComponentSystem that
   * created this Component.
   * @private
   */
  _toggleLifecycleListeners(onOrOff, system) {
    this[onOrOff]('set_horizontal', this._onSetHorizontalScrollingEnabled, this);
    this[onOrOff]('set_vertical', this._onSetVerticalScrollingEnabled, this);
    system.app.systems.element[onOrOff]('add', this._onElementComponentAdd, this);
    system.app.systems.element[onOrOff]('beforeremove', this._onElementComponentRemove, this);
  }

  /**
   * @param {string} onOrOff - 'on' or 'off'.
   * @private
   */
  _toggleElementListeners(onOrOff) {
    if (this.entity.element) {
      if (onOrOff === 'on' && this._hasElementListeners) {
        return;
      }
      this.entity.element[onOrOff]('resize', this._onSetContentOrViewportSize, this);
      this.entity.element[onOrOff](EVENT_MOUSEWHEEL, this._onMouseWheel, this);
      this._hasElementListeners = onOrOff === 'on';
    }
  }
  _onElementComponentAdd(entity) {
    if (this.entity === entity) {
      this._toggleElementListeners('on');
    }
  }
  _onElementComponentRemove(entity) {
    if (this.entity === entity) {
      this._toggleElementListeners('off');
    }
  }
  _onViewportElementGain() {
    this._syncAll();
  }
  _onContentElementGain() {
    this._destroyDragHelper();
    this._contentDragHelper = new ElementDragHelper(this._contentReference.entity.element);
    this._contentDragHelper.on('drag:start', this._onContentDragStart, this);
    this._contentDragHelper.on('drag:end', this._onContentDragEnd, this);
    this._contentDragHelper.on('drag:move', this._onContentDragMove, this);
    this._prevContentSizes[ORIENTATION_HORIZONTAL] = null;
    this._prevContentSizes[ORIENTATION_VERTICAL] = null;
    this._syncAll();
  }
  _onContentElementLose() {
    this._destroyDragHelper();
  }
  _onContentDragStart() {
    if (this._contentReference.entity && this.enabled && this.entity.enabled) {
      this._dragStartPosition.copy(this._contentReference.entity.getLocalPosition());
    }
  }
  _onContentDragEnd() {
    this._prevContentDragPosition = null;
    this._enableContentInput();
  }
  _onContentDragMove(position) {
    if (this._contentReference.entity && this.enabled && this.entity.enabled) {
      this._wasDragged = true;
      this._setScrollFromContentPosition(position);
      this._setVelocityFromContentPositionDelta(position);

      // if we haven't already, when scrolling starts
      // disable input on all child elements
      if (!this._disabledContentInput) {
        // Disable input events on content after we've moved past a threshold value
        const dx = position.x - this._dragStartPosition.x;
        const dy = position.y - this._dragStartPosition.y;
        if (Math.abs(dx) > this.dragThreshold || Math.abs(dy) > this.dragThreshold) {
          this._disableContentInput();
        }
      }
    }
  }
  _onSetContentOrViewportSize() {
    this._syncAll();
  }
  _onSetHorizontalScrollbarValue(scrollValueX) {
    if (!this._scrollbarUpdateFlags[ORIENTATION_HORIZONTAL] && this.enabled && this.entity.enabled) {
      this._onSetScroll(scrollValueX, null);
    }
  }
  _onSetVerticalScrollbarValue(scrollValueY) {
    if (!this._scrollbarUpdateFlags[ORIENTATION_VERTICAL] && this.enabled && this.entity.enabled) {
      this._onSetScroll(null, scrollValueY);
    }
  }
  _onSetHorizontalScrollingEnabled() {
    this._syncScrollbarEnabledState(ORIENTATION_HORIZONTAL);
  }
  _onSetVerticalScrollingEnabled() {
    this._syncScrollbarEnabledState(ORIENTATION_VERTICAL);
  }
  _onHorizontalScrollbarGain() {
    this._syncScrollbarEnabledState(ORIENTATION_HORIZONTAL);
    this._syncScrollbarPosition(ORIENTATION_HORIZONTAL);
  }
  _onVerticalScrollbarGain() {
    this._syncScrollbarEnabledState(ORIENTATION_VERTICAL);
    this._syncScrollbarPosition(ORIENTATION_VERTICAL);
  }
  _onSetScroll(x, y, resetVelocity) {
    if (resetVelocity !== false) {
      this._velocity.set(0, 0, 0);
    }
    const xChanged = this._updateAxis(x, 'x', ORIENTATION_HORIZONTAL);
    const yChanged = this._updateAxis(y, 'y', ORIENTATION_VERTICAL);
    if (xChanged || yChanged) {
      this.fire('set:scroll', this._scroll);
    }
  }
  _updateAxis(scrollValue, axis, orientation) {
    const hasChanged = scrollValue !== null && Math.abs(scrollValue - this._scroll[axis]) > 1e-5;

    // always update if dragging because drag helper directly updates the entity position
    // always update if scrollValue === 0 because it will be clamped to 0
    // if viewport is larger than content and position could be moved by drag helper but
    // hasChanged will never be true
    if (hasChanged || this._isDragging() || scrollValue === 0) {
      this._scroll[axis] = this._determineNewScrollValue(scrollValue, axis, orientation);
      this._syncContentPosition(orientation);
      this._syncScrollbarPosition(orientation);
    }
    return hasChanged;
  }
  _determineNewScrollValue(scrollValue, axis, orientation) {
    // If scrolling is disabled for the selected orientation, force the
    // scroll position to remain at the current value
    if (!this._getScrollingEnabled(orientation)) {
      return this._scroll[axis];
    }
    switch (this.scrollMode) {
      case SCROLL_MODE_CLAMP:
        return math.clamp(scrollValue, 0, this._getMaxScrollValue(orientation));
      case SCROLL_MODE_BOUNCE:
        this._setVelocityFromOvershoot(scrollValue, axis, orientation);
        return scrollValue;
      case SCROLL_MODE_INFINITE:
        return scrollValue;
      default:
        console.warn('Unhandled scroll mode:' + this.scrollMode);
        return scrollValue;
    }
  }
  _syncAll() {
    this._syncContentPosition(ORIENTATION_HORIZONTAL);
    this._syncContentPosition(ORIENTATION_VERTICAL);
    this._syncScrollbarPosition(ORIENTATION_HORIZONTAL);
    this._syncScrollbarPosition(ORIENTATION_VERTICAL);
    this._syncScrollbarEnabledState(ORIENTATION_HORIZONTAL);
    this._syncScrollbarEnabledState(ORIENTATION_VERTICAL);
  }
  _syncContentPosition(orientation) {
    const axis = this._getAxis(orientation);
    const sign = this._getSign(orientation);
    const contentEntity = this._contentReference.entity;
    if (contentEntity) {
      const prevContentSize = this._prevContentSizes[orientation];
      const currContentSize = this._getContentSize(orientation);

      // If the content size has changed, adjust the scroll value so that the content will
      // stay in the same place from the user's perspective.
      if (prevContentSize !== null && Math.abs(prevContentSize - currContentSize) > 1e-4) {
        const prevMaxOffset = this._getMaxOffset(orientation, prevContentSize);
        const currMaxOffset = this._getMaxOffset(orientation, currContentSize);
        if (currMaxOffset === 0) {
          this._scroll[axis] = 1;
        } else {
          this._scroll[axis] = math.clamp(this._scroll[axis] * prevMaxOffset / currMaxOffset, 0, 1);
        }
      }
      const offset = this._scroll[axis] * this._getMaxOffset(orientation);
      const contentPosition = contentEntity.getLocalPosition();
      contentPosition[axis] = offset * sign;
      contentEntity.setLocalPosition(contentPosition);
      this._prevContentSizes[orientation] = currContentSize;
    }
  }
  _syncScrollbarPosition(orientation) {
    const axis = this._getAxis(orientation);
    const scrollbarEntity = this._scrollbarReferences[orientation].entity;
    if (scrollbarEntity && scrollbarEntity.scrollbar) {
      // Setting the value of the scrollbar will fire a 'set:value' event, which in turn
      // will call the _onSetHorizontalScrollbarValue/_onSetVerticalScrollbarValue handlers
      // and cause a cycle. To avoid this we keep track of the fact that we're in the process
      // of updating the scrollbar value.
      this._scrollbarUpdateFlags[orientation] = true;
      scrollbarEntity.scrollbar.value = this._scroll[axis];
      scrollbarEntity.scrollbar.handleSize = this._getScrollbarHandleSize(axis, orientation);
      this._scrollbarUpdateFlags[orientation] = false;
    }
  }

  // Toggles the scrollbar entities themselves to be enabled/disabled based
  // on whether the user has enabled horizontal/vertical scrolling on the
  // scroll view.
  _syncScrollbarEnabledState(orientation) {
    const entity = this._scrollbarReferences[orientation].entity;
    if (entity) {
      const isScrollingEnabled = this._getScrollingEnabled(orientation);
      const requestedVisibility = this._getScrollbarVisibility(orientation);
      switch (requestedVisibility) {
        case SCROLLBAR_VISIBILITY_SHOW_ALWAYS:
          entity.enabled = isScrollingEnabled;
          return;
        case SCROLLBAR_VISIBILITY_SHOW_WHEN_REQUIRED:
          entity.enabled = isScrollingEnabled && this._contentIsLargerThanViewport(orientation);
          return;
        default:
          console.warn('Unhandled scrollbar visibility:' + requestedVisibility);
          entity.enabled = isScrollingEnabled;
      }
    }
  }
  _contentIsLargerThanViewport(orientation) {
    return this._getContentSize(orientation) > this._getViewportSize(orientation);
  }
  _contentPositionToScrollValue(contentPosition) {
    const maxOffsetH = this._getMaxOffset(ORIENTATION_HORIZONTAL);
    const maxOffsetV = this._getMaxOffset(ORIENTATION_VERTICAL);
    if (maxOffsetH === 0) {
      _tempScrollValue.x = 0;
    } else {
      _tempScrollValue.x = contentPosition.x / maxOffsetH;
    }
    if (maxOffsetV === 0) {
      _tempScrollValue.y = 0;
    } else {
      _tempScrollValue.y = contentPosition.y / -maxOffsetV;
    }
    return _tempScrollValue;
  }
  _getMaxOffset(orientation, contentSize) {
    contentSize = contentSize === undefined ? this._getContentSize(orientation) : contentSize;
    const viewportSize = this._getViewportSize(orientation);
    if (contentSize < viewportSize) {
      return -this._getViewportSize(orientation);
    }
    return viewportSize - contentSize;
  }
  _getMaxScrollValue(orientation) {
    return this._contentIsLargerThanViewport(orientation) ? 1 : 0;
  }
  _getScrollbarHandleSize(axis, orientation) {
    const viewportSize = this._getViewportSize(orientation);
    const contentSize = this._getContentSize(orientation);
    if (Math.abs(contentSize) < 0.001) {
      return 1;
    }
    const handleSize = Math.min(viewportSize / contentSize, 1);
    const overshoot = this._toOvershoot(this._scroll[axis], orientation);
    if (overshoot === 0) {
      return handleSize;
    }

    // Scale the handle down when the content has been dragged past the bounds
    return handleSize / (1 + Math.abs(overshoot));
  }
  _getViewportSize(orientation) {
    return this._getSize(orientation, this._viewportReference);
  }
  _getContentSize(orientation) {
    return this._getSize(orientation, this._contentReference);
  }
  _getSize(orientation, entityReference) {
    if (entityReference.entity && entityReference.entity.element) {
      return entityReference.entity.element[this._getCalculatedDimension(orientation)];
    }
    return 0;
  }
  _getScrollingEnabled(orientation) {
    if (orientation === ORIENTATION_HORIZONTAL) {
      return this.horizontal;
    } else if (orientation === ORIENTATION_VERTICAL) {
      return this.vertical;
    }
    Debug.warn(`Unrecognized orientation: ${orientation}`);
    return undefined;
  }
  _getScrollbarVisibility(orientation) {
    if (orientation === ORIENTATION_HORIZONTAL) {
      return this.horizontalScrollbarVisibility;
    } else if (orientation === ORIENTATION_VERTICAL) {
      return this.verticalScrollbarVisibility;
    }
    Debug.warn(`Unrecognized orientation: ${orientation}`);
    return undefined;
  }
  _getSign(orientation) {
    return orientation === ORIENTATION_HORIZONTAL ? 1 : -1;
  }
  _getAxis(orientation) {
    return orientation === ORIENTATION_HORIZONTAL ? 'x' : 'y';
  }
  _getCalculatedDimension(orientation) {
    return orientation === ORIENTATION_HORIZONTAL ? 'calculatedWidth' : 'calculatedHeight';
  }
  _destroyDragHelper() {
    if (this._contentDragHelper) {
      this._contentDragHelper.destroy();
    }
  }
  onUpdate() {
    if (this._contentReference.entity) {
      this._updateVelocity();
      this._syncScrollbarEnabledState(ORIENTATION_HORIZONTAL);
      this._syncScrollbarEnabledState(ORIENTATION_VERTICAL);
    }
  }
  _updateVelocity() {
    if (!this._isDragging()) {
      if (this.scrollMode === SCROLL_MODE_BOUNCE) {
        if (this._hasOvershoot('x', ORIENTATION_HORIZONTAL)) {
          this._setVelocityFromOvershoot(this.scroll.x, 'x', ORIENTATION_HORIZONTAL);
        }
        if (this._hasOvershoot('y', ORIENTATION_VERTICAL)) {
          this._setVelocityFromOvershoot(this.scroll.y, 'y', ORIENTATION_VERTICAL);
        }
      }
      if (Math.abs(this._velocity.x) > 1e-4 || Math.abs(this._velocity.y) > 1e-4) {
        const position = this._contentReference.entity.getLocalPosition();
        position.x += this._velocity.x;
        position.y += this._velocity.y;
        this._contentReference.entity.setLocalPosition(position);
        this._setScrollFromContentPosition(position);
      }
      this._velocity.x *= 1 - this.friction;
      this._velocity.y *= 1 - this.friction;
    }
  }
  _hasOvershoot(axis, orientation) {
    return Math.abs(this._toOvershoot(this.scroll[axis], orientation)) > 0.001;
  }
  _toOvershoot(scrollValue, orientation) {
    const maxScrollValue = this._getMaxScrollValue(orientation);
    if (scrollValue < 0) {
      return scrollValue;
    } else if (scrollValue > maxScrollValue) {
      return scrollValue - maxScrollValue;
    }
    return 0;
  }
  _setVelocityFromOvershoot(scrollValue, axis, orientation) {
    const overshootValue = this._toOvershoot(scrollValue, orientation);
    const overshootPixels = overshootValue * this._getMaxOffset(orientation) * this._getSign(orientation);
    if (Math.abs(overshootPixels) > 0) {
      // 50 here is just a magic number – it seems to give us a range of useful
      // range of bounceAmount values, so that 0.1 is similar to the iOS bounce
      // feel, 1.0 is much slower, etc. The + 1 means that when bounceAmount is
      // 0, the content will just snap back immediately instead of moving gradually.
      this._velocity[axis] = -overshootPixels / (this.bounceAmount * 50 + 1);
    }
  }
  _setVelocityFromContentPositionDelta(position) {
    if (this._prevContentDragPosition) {
      this._velocity.sub2(position, this._prevContentDragPosition);
      this._prevContentDragPosition.copy(position);
    } else {
      this._velocity.set(0, 0, 0);
      this._prevContentDragPosition = position.clone();
    }
  }
  _setScrollFromContentPosition(position) {
    let scrollValue = this._contentPositionToScrollValue(position);
    if (this._isDragging()) {
      scrollValue = this._applyScrollValueTension(scrollValue);
    }
    this._onSetScroll(scrollValue.x, scrollValue.y, false);
  }

  // Create nice tension effect when dragging past the extents of the viewport
  _applyScrollValueTension(scrollValue) {
    const factor = 1;
    let max = this._getMaxScrollValue(ORIENTATION_HORIZONTAL);
    let overshoot = this._toOvershoot(scrollValue.x, ORIENTATION_HORIZONTAL);
    if (overshoot > 0) {
      scrollValue.x = max + factor * Math.log10(1 + overshoot);
    } else if (overshoot < 0) {
      scrollValue.x = -factor * Math.log10(1 - overshoot);
    }
    max = this._getMaxScrollValue(ORIENTATION_VERTICAL);
    overshoot = this._toOvershoot(scrollValue.y, ORIENTATION_VERTICAL);
    if (overshoot > 0) {
      scrollValue.y = max + factor * Math.log10(1 + overshoot);
    } else if (overshoot < 0) {
      scrollValue.y = -factor * Math.log10(1 - overshoot);
    }
    return scrollValue;
  }
  _isDragging() {
    return this._contentDragHelper && this._contentDragHelper.isDragging;
  }
  _setScrollbarComponentsEnabled(enabled) {
    if (this._scrollbarReferences[ORIENTATION_HORIZONTAL].hasComponent('scrollbar')) {
      this._scrollbarReferences[ORIENTATION_HORIZONTAL].entity.scrollbar.enabled = enabled;
    }
    if (this._scrollbarReferences[ORIENTATION_VERTICAL].hasComponent('scrollbar')) {
      this._scrollbarReferences[ORIENTATION_VERTICAL].entity.scrollbar.enabled = enabled;
    }
  }
  _setContentDraggingEnabled(enabled) {
    if (this._contentDragHelper) {
      this._contentDragHelper.enabled = enabled;
    }
  }
  _onMouseWheel(event) {
    if (this.useMouseWheel) {
      const wheelEvent = event.event;

      // wheelEvent's delta variables are screen space, so they need to be normalized first
      const normalizedDeltaX = wheelEvent.deltaX / this._contentReference.entity.element.calculatedWidth * this.mouseWheelSensitivity.x;
      const normalizedDeltaY = wheelEvent.deltaY / this._contentReference.entity.element.calculatedHeight * this.mouseWheelSensitivity.y;

      // update scroll positions, clamping to [0, maxScrollValue] to always prevent over-shooting
      const scrollX = math.clamp(this._scroll.x + normalizedDeltaX, 0, this._getMaxScrollValue(ORIENTATION_HORIZONTAL));
      const scrollY = math.clamp(this._scroll.y + normalizedDeltaY, 0, this._getMaxScrollValue(ORIENTATION_VERTICAL));
      this.scroll = new Vec2(scrollX, scrollY);
    }
  }

  // re-enable useInput flag on any descendant that was disabled
  _enableContentInput() {
    while (this._disabledContentInputEntities.length) {
      const e = this._disabledContentInputEntities.pop();
      if (e.element) {
        e.element.useInput = true;
      }
    }
    this._disabledContentInput = false;
  }

  // disable useInput flag on all descendants of this contentEntity
  _disableContentInput() {
    const _disableInput = e => {
      if (e.element && e.element.useInput) {
        this._disabledContentInputEntities.push(e);
        e.element.useInput = false;
      }
      const children = e.children;
      for (let i = 0, l = children.length; i < l; i++) {
        _disableInput(children[i]);
      }
    };
    const contentEntity = this._contentReference.entity;
    if (contentEntity) {
      // disable input recursively for all children of the content entity
      const children = contentEntity.children;
      for (let i = 0, l = children.length; i < l; i++) {
        _disableInput(children[i]);
      }
    }
    this._disabledContentInput = true;
  }
  onEnable() {
    this._viewportReference.onParentComponentEnable();
    this._contentReference.onParentComponentEnable();
    this._scrollbarReferences[ORIENTATION_HORIZONTAL].onParentComponentEnable();
    this._scrollbarReferences[ORIENTATION_VERTICAL].onParentComponentEnable();
    this._setScrollbarComponentsEnabled(true);
    this._setContentDraggingEnabled(true);
    this._syncAll();
  }
  onDisable() {
    this._setScrollbarComponentsEnabled(false);
    this._setContentDraggingEnabled(false);
  }
  onRemove() {
    this._toggleLifecycleListeners('off', this.system);
    this._toggleElementListeners('off');
    this._destroyDragHelper();
  }
  set scroll(value) {
    this._onSetScroll(value.x, value.y);
  }
  get scroll() {
    return this._scroll;
  }
}

export { ScrollViewComponent };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tcG9uZW50LmpzIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi9zcmMvZnJhbWV3b3JrL2NvbXBvbmVudHMvc2Nyb2xsLXZpZXcvY29tcG9uZW50LmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IERlYnVnIH0gZnJvbSAnLi4vLi4vLi4vY29yZS9kZWJ1Zy5qcyc7XG5cbmltcG9ydCB7IG1hdGggfSBmcm9tICcuLi8uLi8uLi9jb3JlL21hdGgvbWF0aC5qcyc7XG5pbXBvcnQgeyBWZWMyIH0gZnJvbSAnLi4vLi4vLi4vY29yZS9tYXRoL3ZlYzIuanMnO1xuaW1wb3J0IHsgVmVjMyB9IGZyb20gJy4uLy4uLy4uL2NvcmUvbWF0aC92ZWMzLmpzJztcblxuaW1wb3J0IHsgT1JJRU5UQVRJT05fSE9SSVpPTlRBTCwgT1JJRU5UQVRJT05fVkVSVElDQUwgfSBmcm9tICcuLi8uLi8uLi9zY2VuZS9jb25zdGFudHMuanMnO1xuXG5pbXBvcnQgeyBFbnRpdHlSZWZlcmVuY2UgfSBmcm9tICcuLi8uLi91dGlscy9lbnRpdHktcmVmZXJlbmNlLmpzJztcblxuaW1wb3J0IHsgRWxlbWVudERyYWdIZWxwZXIgfSBmcm9tICcuLi9lbGVtZW50L2VsZW1lbnQtZHJhZy1oZWxwZXIuanMnO1xuXG5pbXBvcnQgeyBTQ1JPTExfTU9ERV9CT1VOQ0UsIFNDUk9MTF9NT0RFX0NMQU1QLCBTQ1JPTExfTU9ERV9JTkZJTklURSwgU0NST0xMQkFSX1ZJU0lCSUxJVFlfU0hPV19BTFdBWVMsIFNDUk9MTEJBUl9WSVNJQklMSVRZX1NIT1dfV0hFTl9SRVFVSVJFRCB9IGZyb20gJy4vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IENvbXBvbmVudCB9IGZyb20gJy4uL2NvbXBvbmVudC5qcyc7XG5pbXBvcnQgeyBFVkVOVF9NT1VTRVdIRUVMIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vaW5wdXQvY29uc3RhbnRzLmpzJztcblxuY29uc3QgX3RlbXBTY3JvbGxWYWx1ZSA9IG5ldyBWZWMyKCk7XG5cbi8qKlxuICogQSBTY3JvbGxWaWV3Q29tcG9uZW50IGVuYWJsZXMgYSBncm91cCBvZiBlbnRpdGllcyB0byBiZWhhdmUgbGlrZSBhIG1hc2tlZCBzY3JvbGxpbmcgYXJlYSwgd2l0aFxuICogb3B0aW9uYWwgaG9yaXpvbnRhbCBhbmQgdmVydGljYWwgc2Nyb2xsIGJhcnMuXG4gKlxuICogQHByb3BlcnR5IHtib29sZWFufSBob3Jpem9udGFsIFdoZXRoZXIgdG8gZW5hYmxlIGhvcml6b250YWwgc2Nyb2xsaW5nLlxuICogQHByb3BlcnR5IHtib29sZWFufSB2ZXJ0aWNhbCBXaGV0aGVyIHRvIGVuYWJsZSB2ZXJ0aWNhbCBzY3JvbGxpbmcuXG4gKiBAcHJvcGVydHkge251bWJlcn0gc2Nyb2xsTW9kZSBTcGVjaWZpZXMgaG93IHRoZSBzY3JvbGwgdmlldyBzaG91bGQgYmVoYXZlIHdoZW4gdGhlIHVzZXIgc2Nyb2xsc1xuICogcGFzdCB0aGUgZW5kIG9mIHRoZSBjb250ZW50LiBNb2RlcyBhcmUgZGVmaW5lZCBhcyBmb2xsb3dzOlxuICpcbiAqIC0ge0BsaW5rIFNDUk9MTF9NT0RFX0NMQU1QfTogQ29udGVudCBkb2VzIG5vdCBzY3JvbGwgYW55IGZ1cnRoZXIgdGhhbiBpdHMgYm91bmRzLlxuICogLSB7QGxpbmsgU0NST0xMX01PREVfQk9VTkNFfTogQ29udGVudCBzY3JvbGxzIHBhc3QgaXRzIGJvdW5kcyBhbmQgdGhlbiBnZW50bHkgYm91bmNlcyBiYWNrLlxuICogLSB7QGxpbmsgU0NST0xMX01PREVfSU5GSU5JVEV9OiBDb250ZW50IGNhbiBzY3JvbGwgZm9yZXZlci5cbiAqXG4gKiBAcHJvcGVydHkge251bWJlcn0gYm91bmNlQW1vdW50IENvbnRyb2xzIGhvdyBmYXIgdGhlIGNvbnRlbnQgc2hvdWxkIG1vdmUgYmVmb3JlIGJvdW5jaW5nIGJhY2suXG4gKiBAcHJvcGVydHkge251bWJlcn0gZnJpY3Rpb24gQ29udHJvbHMgaG93IGZyZWVseSB0aGUgY29udGVudCBzaG91bGQgbW92ZSBpZiB0aHJvd24sIGkuZS4gQnlcbiAqIGZsaWNraW5nIG9uIGEgcGhvbmUgb3IgYnkgZmxpbmdpbmcgdGhlIHNjcm9sbCB3aGVlbCBvbiBhIG1vdXNlLiBBIHZhbHVlIG9mIDEgbWVhbnMgdGhhdCBjb250ZW50XG4gKiB3aWxsIHN0b3AgaW1tZWRpYXRlbHk7IDAgbWVhbnMgdGhhdCBjb250ZW50IHdpbGwgY29udGludWUgbW92aW5nIGZvcmV2ZXIgKG9yIHVudGlsIHRoZSBib3VuZHMgb2ZcbiAqIHRoZSBjb250ZW50IGFyZSByZWFjaGVkLCBkZXBlbmRpbmcgb24gdGhlIHNjcm9sbE1vZGUpLlxuICogQHByb3BlcnR5IHtib29sZWFufSB1c2VNb3VzZVdoZWVsIFdoZXRoZXIgdG8gdXNlIG1vdXNlIHdoZWVsIGZvciBzY3JvbGxpbmcgKGhvcml6b250YWxseSBhbmRcbiAqIHZlcnRpY2FsbHkpLlxuICogQHByb3BlcnR5IHtWZWMyfSBtb3VzZVdoZWVsU2Vuc2l0aXZpdHkgTW91c2Ugd2hlZWwgaG9yaXpvbnRhbCBhbmQgdmVydGljYWwgc2Vuc2l0aXZpdHkuIE9ubHlcbiAqIHVzZWQgaWYgdXNlTW91c2VXaGVlbCBpcyBzZXQuIFNldHRpbmcgYSBkaXJlY3Rpb24gdG8gMCB3aWxsIGRpc2FibGUgbW91c2Ugd2hlZWwgc2Nyb2xsaW5nIGluXG4gKiB0aGF0IGRpcmVjdGlvbi4gMSBpcyBhIGRlZmF1bHQgc2Vuc2l0aXZpdHkgdGhhdCBpcyBjb25zaWRlcmVkIHRvIGZlZWwgZ29vZC4gVGhlIHZhbHVlcyBjYW4gYmVcbiAqIHNldCBoaWdoZXIgb3IgbG93ZXIgdGhhbiAxIHRvIHR1bmUgdGhlIHNlbnNpdGl2aXR5LiBEZWZhdWx0cyB0byBbMSwgMV0uXG4gKiBAcHJvcGVydHkge251bWJlcn0gaG9yaXpvbnRhbFNjcm9sbGJhclZpc2liaWxpdHkgQ29udHJvbHMgd2hldGhlciB0aGUgaG9yaXpvbnRhbCBzY3JvbGxiYXJcbiAqIHNob3VsZCBiZSB2aXNpYmxlIGFsbCB0aGUgdGltZSwgb3Igb25seSB2aXNpYmxlIHdoZW4gdGhlIGNvbnRlbnQgZXhjZWVkcyB0aGUgc2l6ZSBvZiB0aGVcbiAqIHZpZXdwb3J0LlxuICogQHByb3BlcnR5IHtudW1iZXJ9IHZlcnRpY2FsU2Nyb2xsYmFyVmlzaWJpbGl0eSBDb250cm9scyB3aGV0aGVyIHRoZSB2ZXJ0aWNhbCBzY3JvbGxiYXIgc2hvdWxkIGJlXG4gKiB2aXNpYmxlIGFsbCB0aGUgdGltZSwgb3Igb25seSB2aXNpYmxlIHdoZW4gdGhlIGNvbnRlbnQgZXhjZWVkcyB0aGUgc2l6ZSBvZiB0aGUgdmlld3BvcnQuXG4gKiBAcHJvcGVydHkge2ltcG9ydCgnLi4vLi4vZW50aXR5LmpzJykuRW50aXR5fSB2aWV3cG9ydEVudGl0eSBUaGUgZW50aXR5IHRvIGJlIHVzZWQgYXMgdGhlIG1hc2tlZFxuICogdmlld3BvcnQgYXJlYSwgd2l0aGluIHdoaWNoIHRoZSBjb250ZW50IHdpbGwgc2Nyb2xsLiBUaGlzIGVudGl0eSBtdXN0IGhhdmUgYW4gRWxlbWVudEdyb3VwXG4gKiBjb21wb25lbnQuXG4gKiBAcHJvcGVydHkge2ltcG9ydCgnLi4vLi4vZW50aXR5LmpzJykuRW50aXR5fSBjb250ZW50RW50aXR5IFRoZSBlbnRpdHkgd2hpY2ggY29udGFpbnMgdGhlXG4gKiBzY3JvbGxpbmcgY29udGVudCBpdHNlbGYuIFRoaXMgZW50aXR5IG11c3QgaGF2ZSBhbiBFbGVtZW50IGNvbXBvbmVudC5cbiAqIEBwcm9wZXJ0eSB7aW1wb3J0KCcuLi8uLi9lbnRpdHkuanMnKS5FbnRpdHl9IGhvcml6b250YWxTY3JvbGxiYXJFbnRpdHkgVGhlIGVudGl0eSB0byBiZSB1c2VkIGFzXG4gKiB0aGUgdmVydGljYWwgc2Nyb2xsYmFyLiBUaGlzIGVudGl0eSBtdXN0IGhhdmUgYSBTY3JvbGxiYXIgY29tcG9uZW50LlxuICogQHByb3BlcnR5IHtpbXBvcnQoJy4uLy4uL2VudGl0eS5qcycpLkVudGl0eX0gdmVydGljYWxTY3JvbGxiYXJFbnRpdHkgVGhlIGVudGl0eSB0byBiZSB1c2VkIGFzXG4gKiB0aGUgdmVydGljYWwgc2Nyb2xsYmFyLiBUaGlzIGVudGl0eSBtdXN0IGhhdmUgYSBTY3JvbGxiYXIgY29tcG9uZW50LlxuICogQGF1Z21lbnRzIENvbXBvbmVudFxuICogQGNhdGVnb3J5IFVzZXIgSW50ZXJmYWNlXG4gKi9cbmNsYXNzIFNjcm9sbFZpZXdDb21wb25lbnQgZXh0ZW5kcyBDb21wb25lbnQge1xuICAgIC8qKlxuICAgICAqIENyZWF0ZSBhIG5ldyBTY3JvbGxWaWV3Q29tcG9uZW50LlxuICAgICAqXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4vc3lzdGVtLmpzJykuU2Nyb2xsVmlld0NvbXBvbmVudFN5c3RlbX0gc3lzdGVtIC0gVGhlIENvbXBvbmVudFN5c3RlbSB0aGF0XG4gICAgICogY3JlYXRlZCB0aGlzIENvbXBvbmVudC5cbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi4vLi4vZW50aXR5LmpzJykuRW50aXR5fSBlbnRpdHkgLSBUaGUgRW50aXR5IHRoYXQgdGhpcyBDb21wb25lbnQgaXNcbiAgICAgKiBhdHRhY2hlZCB0by5cbiAgICAgKi9cbiAgICBjb25zdHJ1Y3RvcihzeXN0ZW0sIGVudGl0eSkge1xuICAgICAgICBzdXBlcihzeXN0ZW0sIGVudGl0eSk7XG5cbiAgICAgICAgdGhpcy5fdmlld3BvcnRSZWZlcmVuY2UgPSBuZXcgRW50aXR5UmVmZXJlbmNlKHRoaXMsICd2aWV3cG9ydEVudGl0eScsIHtcbiAgICAgICAgICAgICdlbGVtZW50I2dhaW4nOiB0aGlzLl9vblZpZXdwb3J0RWxlbWVudEdhaW4sXG4gICAgICAgICAgICAnZWxlbWVudCNyZXNpemUnOiB0aGlzLl9vblNldENvbnRlbnRPclZpZXdwb3J0U2l6ZVxuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLl9jb250ZW50UmVmZXJlbmNlID0gbmV3IEVudGl0eVJlZmVyZW5jZSh0aGlzLCAnY29udGVudEVudGl0eScsIHtcbiAgICAgICAgICAgICdlbGVtZW50I2dhaW4nOiB0aGlzLl9vbkNvbnRlbnRFbGVtZW50R2FpbixcbiAgICAgICAgICAgICdlbGVtZW50I2xvc2UnOiB0aGlzLl9vbkNvbnRlbnRFbGVtZW50TG9zZSxcbiAgICAgICAgICAgICdlbGVtZW50I3Jlc2l6ZSc6IHRoaXMuX29uU2V0Q29udGVudE9yVmlld3BvcnRTaXplXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRoaXMuX3Njcm9sbGJhclVwZGF0ZUZsYWdzID0ge307XG4gICAgICAgIHRoaXMuX3Njcm9sbGJhclJlZmVyZW5jZXMgPSB7fTtcbiAgICAgICAgdGhpcy5fc2Nyb2xsYmFyUmVmZXJlbmNlc1tPUklFTlRBVElPTl9IT1JJWk9OVEFMXSA9IG5ldyBFbnRpdHlSZWZlcmVuY2UodGhpcywgJ2hvcml6b250YWxTY3JvbGxiYXJFbnRpdHknLCB7XG4gICAgICAgICAgICAnc2Nyb2xsYmFyI3NldDp2YWx1ZSc6IHRoaXMuX29uU2V0SG9yaXpvbnRhbFNjcm9sbGJhclZhbHVlLFxuICAgICAgICAgICAgJ3Njcm9sbGJhciNnYWluJzogdGhpcy5fb25Ib3Jpem9udGFsU2Nyb2xsYmFyR2FpblxuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5fc2Nyb2xsYmFyUmVmZXJlbmNlc1tPUklFTlRBVElPTl9WRVJUSUNBTF0gPSBuZXcgRW50aXR5UmVmZXJlbmNlKHRoaXMsICd2ZXJ0aWNhbFNjcm9sbGJhckVudGl0eScsIHtcbiAgICAgICAgICAgICdzY3JvbGxiYXIjc2V0OnZhbHVlJzogdGhpcy5fb25TZXRWZXJ0aWNhbFNjcm9sbGJhclZhbHVlLFxuICAgICAgICAgICAgJ3Njcm9sbGJhciNnYWluJzogdGhpcy5fb25WZXJ0aWNhbFNjcm9sbGJhckdhaW5cbiAgICAgICAgfSk7XG5cbiAgICAgICAgdGhpcy5fcHJldkNvbnRlbnRTaXplcyA9IHt9O1xuICAgICAgICB0aGlzLl9wcmV2Q29udGVudFNpemVzW09SSUVOVEFUSU9OX0hPUklaT05UQUxdID0gbnVsbDtcbiAgICAgICAgdGhpcy5fcHJldkNvbnRlbnRTaXplc1tPUklFTlRBVElPTl9WRVJUSUNBTF0gPSBudWxsO1xuXG4gICAgICAgIHRoaXMuX3Njcm9sbCA9IG5ldyBWZWMyKCk7XG4gICAgICAgIHRoaXMuX3ZlbG9jaXR5ID0gbmV3IFZlYzMoKTtcblxuICAgICAgICB0aGlzLl9kcmFnU3RhcnRQb3NpdGlvbiA9IG5ldyBWZWMzKCk7XG4gICAgICAgIHRoaXMuX2Rpc2FibGVkQ29udGVudElucHV0ID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX2Rpc2FibGVkQ29udGVudElucHV0RW50aXRpZXMgPSBbXTtcblxuICAgICAgICB0aGlzLl90b2dnbGVMaWZlY3ljbGVMaXN0ZW5lcnMoJ29uJywgc3lzdGVtKTtcbiAgICAgICAgdGhpcy5fdG9nZ2xlRWxlbWVudExpc3RlbmVycygnb24nKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBGaXJlZCB3aGVuZXZlciB0aGUgc2Nyb2xsIHBvc2l0aW9uIGNoYW5nZXMuXG4gICAgICpcbiAgICAgKiBAZXZlbnQgU2Nyb2xsVmlld0NvbXBvbmVudCNzZXQ6c2Nyb2xsXG4gICAgICogQHBhcmFtIHtWZWMyfSBzY3JvbGxQb3NpdGlvbiAtIEhvcml6b250YWwgYW5kIHZlcnRpY2FsIHNjcm9sbCB2YWx1ZXMgaW4gdGhlIHJhbmdlIDAuLi4xLlxuICAgICAqL1xuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IG9uT3JPZmYgLSAnb24nIG9yICdvZmYnLlxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuL3N5c3RlbS5qcycpLlNjcm9sbFZpZXdDb21wb25lbnRTeXN0ZW19IHN5c3RlbSAtIFRoZSBDb21wb25lbnRTeXN0ZW0gdGhhdFxuICAgICAqIGNyZWF0ZWQgdGhpcyBDb21wb25lbnQuXG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfdG9nZ2xlTGlmZWN5Y2xlTGlzdGVuZXJzKG9uT3JPZmYsIHN5c3RlbSkge1xuICAgICAgICB0aGlzW29uT3JPZmZdKCdzZXRfaG9yaXpvbnRhbCcsIHRoaXMuX29uU2V0SG9yaXpvbnRhbFNjcm9sbGluZ0VuYWJsZWQsIHRoaXMpO1xuICAgICAgICB0aGlzW29uT3JPZmZdKCdzZXRfdmVydGljYWwnLCB0aGlzLl9vblNldFZlcnRpY2FsU2Nyb2xsaW5nRW5hYmxlZCwgdGhpcyk7XG5cbiAgICAgICAgc3lzdGVtLmFwcC5zeXN0ZW1zLmVsZW1lbnRbb25Pck9mZl0oJ2FkZCcsIHRoaXMuX29uRWxlbWVudENvbXBvbmVudEFkZCwgdGhpcyk7XG4gICAgICAgIHN5c3RlbS5hcHAuc3lzdGVtcy5lbGVtZW50W29uT3JPZmZdKCdiZWZvcmVyZW1vdmUnLCB0aGlzLl9vbkVsZW1lbnRDb21wb25lbnRSZW1vdmUsIHRoaXMpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBvbk9yT2ZmIC0gJ29uJyBvciAnb2ZmJy5cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF90b2dnbGVFbGVtZW50TGlzdGVuZXJzKG9uT3JPZmYpIHtcbiAgICAgICAgaWYgKHRoaXMuZW50aXR5LmVsZW1lbnQpIHtcbiAgICAgICAgICAgIGlmIChvbk9yT2ZmID09PSAnb24nICYmIHRoaXMuX2hhc0VsZW1lbnRMaXN0ZW5lcnMpIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuZW50aXR5LmVsZW1lbnRbb25Pck9mZl0oJ3Jlc2l6ZScsIHRoaXMuX29uU2V0Q29udGVudE9yVmlld3BvcnRTaXplLCB0aGlzKTtcbiAgICAgICAgICAgIHRoaXMuZW50aXR5LmVsZW1lbnRbb25Pck9mZl0oRVZFTlRfTU9VU0VXSEVFTCwgdGhpcy5fb25Nb3VzZVdoZWVsLCB0aGlzKTtcblxuICAgICAgICAgICAgdGhpcy5faGFzRWxlbWVudExpc3RlbmVycyA9IChvbk9yT2ZmID09PSAnb24nKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIF9vbkVsZW1lbnRDb21wb25lbnRBZGQoZW50aXR5KSB7XG4gICAgICAgIGlmICh0aGlzLmVudGl0eSA9PT0gZW50aXR5KSB7XG4gICAgICAgICAgICB0aGlzLl90b2dnbGVFbGVtZW50TGlzdGVuZXJzKCdvbicpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgX29uRWxlbWVudENvbXBvbmVudFJlbW92ZShlbnRpdHkpIHtcbiAgICAgICAgaWYgKHRoaXMuZW50aXR5ID09PSBlbnRpdHkpIHtcbiAgICAgICAgICAgIHRoaXMuX3RvZ2dsZUVsZW1lbnRMaXN0ZW5lcnMoJ29mZicpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgX29uVmlld3BvcnRFbGVtZW50R2FpbigpIHtcbiAgICAgICAgdGhpcy5fc3luY0FsbCgpO1xuICAgIH1cblxuICAgIF9vbkNvbnRlbnRFbGVtZW50R2FpbigpIHtcbiAgICAgICAgdGhpcy5fZGVzdHJveURyYWdIZWxwZXIoKTtcbiAgICAgICAgdGhpcy5fY29udGVudERyYWdIZWxwZXIgPSBuZXcgRWxlbWVudERyYWdIZWxwZXIodGhpcy5fY29udGVudFJlZmVyZW5jZS5lbnRpdHkuZWxlbWVudCk7XG4gICAgICAgIHRoaXMuX2NvbnRlbnREcmFnSGVscGVyLm9uKCdkcmFnOnN0YXJ0JywgdGhpcy5fb25Db250ZW50RHJhZ1N0YXJ0LCB0aGlzKTtcbiAgICAgICAgdGhpcy5fY29udGVudERyYWdIZWxwZXIub24oJ2RyYWc6ZW5kJywgdGhpcy5fb25Db250ZW50RHJhZ0VuZCwgdGhpcyk7XG4gICAgICAgIHRoaXMuX2NvbnRlbnREcmFnSGVscGVyLm9uKCdkcmFnOm1vdmUnLCB0aGlzLl9vbkNvbnRlbnREcmFnTW92ZSwgdGhpcyk7XG5cbiAgICAgICAgdGhpcy5fcHJldkNvbnRlbnRTaXplc1tPUklFTlRBVElPTl9IT1JJWk9OVEFMXSA9IG51bGw7XG4gICAgICAgIHRoaXMuX3ByZXZDb250ZW50U2l6ZXNbT1JJRU5UQVRJT05fVkVSVElDQUxdID0gbnVsbDtcblxuICAgICAgICB0aGlzLl9zeW5jQWxsKCk7XG4gICAgfVxuXG4gICAgX29uQ29udGVudEVsZW1lbnRMb3NlKCkge1xuICAgICAgICB0aGlzLl9kZXN0cm95RHJhZ0hlbHBlcigpO1xuICAgIH1cblxuICAgIF9vbkNvbnRlbnREcmFnU3RhcnQoKSB7XG4gICAgICAgIGlmICh0aGlzLl9jb250ZW50UmVmZXJlbmNlLmVudGl0eSAmJiB0aGlzLmVuYWJsZWQgJiYgdGhpcy5lbnRpdHkuZW5hYmxlZCkge1xuICAgICAgICAgICAgdGhpcy5fZHJhZ1N0YXJ0UG9zaXRpb24uY29weSh0aGlzLl9jb250ZW50UmVmZXJlbmNlLmVudGl0eS5nZXRMb2NhbFBvc2l0aW9uKCkpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgX29uQ29udGVudERyYWdFbmQoKSB7XG4gICAgICAgIHRoaXMuX3ByZXZDb250ZW50RHJhZ1Bvc2l0aW9uID0gbnVsbDtcbiAgICAgICAgdGhpcy5fZW5hYmxlQ29udGVudElucHV0KCk7XG4gICAgfVxuXG4gICAgX29uQ29udGVudERyYWdNb3ZlKHBvc2l0aW9uKSB7XG4gICAgICAgIGlmICh0aGlzLl9jb250ZW50UmVmZXJlbmNlLmVudGl0eSAmJiB0aGlzLmVuYWJsZWQgJiYgdGhpcy5lbnRpdHkuZW5hYmxlZCkge1xuICAgICAgICAgICAgdGhpcy5fd2FzRHJhZ2dlZCA9IHRydWU7XG4gICAgICAgICAgICB0aGlzLl9zZXRTY3JvbGxGcm9tQ29udGVudFBvc2l0aW9uKHBvc2l0aW9uKTtcbiAgICAgICAgICAgIHRoaXMuX3NldFZlbG9jaXR5RnJvbUNvbnRlbnRQb3NpdGlvbkRlbHRhKHBvc2l0aW9uKTtcblxuICAgICAgICAgICAgLy8gaWYgd2UgaGF2ZW4ndCBhbHJlYWR5LCB3aGVuIHNjcm9sbGluZyBzdGFydHNcbiAgICAgICAgICAgIC8vIGRpc2FibGUgaW5wdXQgb24gYWxsIGNoaWxkIGVsZW1lbnRzXG4gICAgICAgICAgICBpZiAoIXRoaXMuX2Rpc2FibGVkQ29udGVudElucHV0KSB7XG5cbiAgICAgICAgICAgICAgICAvLyBEaXNhYmxlIGlucHV0IGV2ZW50cyBvbiBjb250ZW50IGFmdGVyIHdlJ3ZlIG1vdmVkIHBhc3QgYSB0aHJlc2hvbGQgdmFsdWVcbiAgICAgICAgICAgICAgICBjb25zdCBkeCA9IChwb3NpdGlvbi54IC0gdGhpcy5fZHJhZ1N0YXJ0UG9zaXRpb24ueCk7XG4gICAgICAgICAgICAgICAgY29uc3QgZHkgPSAocG9zaXRpb24ueSAtIHRoaXMuX2RyYWdTdGFydFBvc2l0aW9uLnkpO1xuXG4gICAgICAgICAgICAgICAgaWYgKE1hdGguYWJzKGR4KSA+IHRoaXMuZHJhZ1RocmVzaG9sZCB8fFxuICAgICAgICAgICAgICAgICAgICBNYXRoLmFicyhkeSkgPiB0aGlzLmRyYWdUaHJlc2hvbGQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fZGlzYWJsZUNvbnRlbnRJbnB1dCgpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgX29uU2V0Q29udGVudE9yVmlld3BvcnRTaXplKCkge1xuICAgICAgICB0aGlzLl9zeW5jQWxsKCk7XG4gICAgfVxuXG4gICAgX29uU2V0SG9yaXpvbnRhbFNjcm9sbGJhclZhbHVlKHNjcm9sbFZhbHVlWCkge1xuICAgICAgICBpZiAoIXRoaXMuX3Njcm9sbGJhclVwZGF0ZUZsYWdzW09SSUVOVEFUSU9OX0hPUklaT05UQUxdICYmIHRoaXMuZW5hYmxlZCAmJiB0aGlzLmVudGl0eS5lbmFibGVkKSB7XG4gICAgICAgICAgICB0aGlzLl9vblNldFNjcm9sbChzY3JvbGxWYWx1ZVgsIG51bGwpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgX29uU2V0VmVydGljYWxTY3JvbGxiYXJWYWx1ZShzY3JvbGxWYWx1ZVkpIHtcbiAgICAgICAgaWYgKCF0aGlzLl9zY3JvbGxiYXJVcGRhdGVGbGFnc1tPUklFTlRBVElPTl9WRVJUSUNBTF0gJiYgdGhpcy5lbmFibGVkICYmIHRoaXMuZW50aXR5LmVuYWJsZWQpIHtcbiAgICAgICAgICAgIHRoaXMuX29uU2V0U2Nyb2xsKG51bGwsIHNjcm9sbFZhbHVlWSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBfb25TZXRIb3Jpem9udGFsU2Nyb2xsaW5nRW5hYmxlZCgpIHtcbiAgICAgICAgdGhpcy5fc3luY1Njcm9sbGJhckVuYWJsZWRTdGF0ZShPUklFTlRBVElPTl9IT1JJWk9OVEFMKTtcbiAgICB9XG5cbiAgICBfb25TZXRWZXJ0aWNhbFNjcm9sbGluZ0VuYWJsZWQoKSB7XG4gICAgICAgIHRoaXMuX3N5bmNTY3JvbGxiYXJFbmFibGVkU3RhdGUoT1JJRU5UQVRJT05fVkVSVElDQUwpO1xuICAgIH1cblxuICAgIF9vbkhvcml6b250YWxTY3JvbGxiYXJHYWluKCkge1xuICAgICAgICB0aGlzLl9zeW5jU2Nyb2xsYmFyRW5hYmxlZFN0YXRlKE9SSUVOVEFUSU9OX0hPUklaT05UQUwpO1xuICAgICAgICB0aGlzLl9zeW5jU2Nyb2xsYmFyUG9zaXRpb24oT1JJRU5UQVRJT05fSE9SSVpPTlRBTCk7XG4gICAgfVxuXG4gICAgX29uVmVydGljYWxTY3JvbGxiYXJHYWluKCkge1xuICAgICAgICB0aGlzLl9zeW5jU2Nyb2xsYmFyRW5hYmxlZFN0YXRlKE9SSUVOVEFUSU9OX1ZFUlRJQ0FMKTtcbiAgICAgICAgdGhpcy5fc3luY1Njcm9sbGJhclBvc2l0aW9uKE9SSUVOVEFUSU9OX1ZFUlRJQ0FMKTtcbiAgICB9XG5cbiAgICBfb25TZXRTY3JvbGwoeCwgeSwgcmVzZXRWZWxvY2l0eSkge1xuICAgICAgICBpZiAocmVzZXRWZWxvY2l0eSAhPT0gZmFsc2UpIHtcbiAgICAgICAgICAgIHRoaXMuX3ZlbG9jaXR5LnNldCgwLCAwLCAwKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHhDaGFuZ2VkID0gdGhpcy5fdXBkYXRlQXhpcyh4LCAneCcsIE9SSUVOVEFUSU9OX0hPUklaT05UQUwpO1xuICAgICAgICBjb25zdCB5Q2hhbmdlZCA9IHRoaXMuX3VwZGF0ZUF4aXMoeSwgJ3knLCBPUklFTlRBVElPTl9WRVJUSUNBTCk7XG5cbiAgICAgICAgaWYgKHhDaGFuZ2VkIHx8IHlDaGFuZ2VkKSB7XG4gICAgICAgICAgICB0aGlzLmZpcmUoJ3NldDpzY3JvbGwnLCB0aGlzLl9zY3JvbGwpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgX3VwZGF0ZUF4aXMoc2Nyb2xsVmFsdWUsIGF4aXMsIG9yaWVudGF0aW9uKSB7XG4gICAgICAgIGNvbnN0IGhhc0NoYW5nZWQgPSAoc2Nyb2xsVmFsdWUgIT09IG51bGwgJiYgTWF0aC5hYnMoc2Nyb2xsVmFsdWUgLSB0aGlzLl9zY3JvbGxbYXhpc10pID4gMWUtNSk7XG5cbiAgICAgICAgLy8gYWx3YXlzIHVwZGF0ZSBpZiBkcmFnZ2luZyBiZWNhdXNlIGRyYWcgaGVscGVyIGRpcmVjdGx5IHVwZGF0ZXMgdGhlIGVudGl0eSBwb3NpdGlvblxuICAgICAgICAvLyBhbHdheXMgdXBkYXRlIGlmIHNjcm9sbFZhbHVlID09PSAwIGJlY2F1c2UgaXQgd2lsbCBiZSBjbGFtcGVkIHRvIDBcbiAgICAgICAgLy8gaWYgdmlld3BvcnQgaXMgbGFyZ2VyIHRoYW4gY29udGVudCBhbmQgcG9zaXRpb24gY291bGQgYmUgbW92ZWQgYnkgZHJhZyBoZWxwZXIgYnV0XG4gICAgICAgIC8vIGhhc0NoYW5nZWQgd2lsbCBuZXZlciBiZSB0cnVlXG4gICAgICAgIGlmIChoYXNDaGFuZ2VkIHx8IHRoaXMuX2lzRHJhZ2dpbmcoKSB8fCBzY3JvbGxWYWx1ZSA9PT0gMCkge1xuICAgICAgICAgICAgdGhpcy5fc2Nyb2xsW2F4aXNdID0gdGhpcy5fZGV0ZXJtaW5lTmV3U2Nyb2xsVmFsdWUoc2Nyb2xsVmFsdWUsIGF4aXMsIG9yaWVudGF0aW9uKTtcbiAgICAgICAgICAgIHRoaXMuX3N5bmNDb250ZW50UG9zaXRpb24ob3JpZW50YXRpb24pO1xuICAgICAgICAgICAgdGhpcy5fc3luY1Njcm9sbGJhclBvc2l0aW9uKG9yaWVudGF0aW9uKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBoYXNDaGFuZ2VkO1xuICAgIH1cblxuICAgIF9kZXRlcm1pbmVOZXdTY3JvbGxWYWx1ZShzY3JvbGxWYWx1ZSwgYXhpcywgb3JpZW50YXRpb24pIHtcbiAgICAgICAgLy8gSWYgc2Nyb2xsaW5nIGlzIGRpc2FibGVkIGZvciB0aGUgc2VsZWN0ZWQgb3JpZW50YXRpb24sIGZvcmNlIHRoZVxuICAgICAgICAvLyBzY3JvbGwgcG9zaXRpb24gdG8gcmVtYWluIGF0IHRoZSBjdXJyZW50IHZhbHVlXG4gICAgICAgIGlmICghdGhpcy5fZ2V0U2Nyb2xsaW5nRW5hYmxlZChvcmllbnRhdGlvbikpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9zY3JvbGxbYXhpc107XG4gICAgICAgIH1cblxuICAgICAgICBzd2l0Y2ggKHRoaXMuc2Nyb2xsTW9kZSkge1xuICAgICAgICAgICAgY2FzZSBTQ1JPTExfTU9ERV9DTEFNUDpcbiAgICAgICAgICAgICAgICByZXR1cm4gbWF0aC5jbGFtcChzY3JvbGxWYWx1ZSwgMCwgdGhpcy5fZ2V0TWF4U2Nyb2xsVmFsdWUob3JpZW50YXRpb24pKTtcblxuICAgICAgICAgICAgY2FzZSBTQ1JPTExfTU9ERV9CT1VOQ0U6XG4gICAgICAgICAgICAgICAgdGhpcy5fc2V0VmVsb2NpdHlGcm9tT3ZlcnNob290KHNjcm9sbFZhbHVlLCBheGlzLCBvcmllbnRhdGlvbik7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNjcm9sbFZhbHVlO1xuXG4gICAgICAgICAgICBjYXNlIFNDUk9MTF9NT0RFX0lORklOSVRFOlxuICAgICAgICAgICAgICAgIHJldHVybiBzY3JvbGxWYWx1ZTtcblxuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oJ1VuaGFuZGxlZCBzY3JvbGwgbW9kZTonICsgdGhpcy5zY3JvbGxNb2RlKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gc2Nyb2xsVmFsdWU7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBfc3luY0FsbCgpIHtcbiAgICAgICAgdGhpcy5fc3luY0NvbnRlbnRQb3NpdGlvbihPUklFTlRBVElPTl9IT1JJWk9OVEFMKTtcbiAgICAgICAgdGhpcy5fc3luY0NvbnRlbnRQb3NpdGlvbihPUklFTlRBVElPTl9WRVJUSUNBTCk7XG4gICAgICAgIHRoaXMuX3N5bmNTY3JvbGxiYXJQb3NpdGlvbihPUklFTlRBVElPTl9IT1JJWk9OVEFMKTtcbiAgICAgICAgdGhpcy5fc3luY1Njcm9sbGJhclBvc2l0aW9uKE9SSUVOVEFUSU9OX1ZFUlRJQ0FMKTtcbiAgICAgICAgdGhpcy5fc3luY1Njcm9sbGJhckVuYWJsZWRTdGF0ZShPUklFTlRBVElPTl9IT1JJWk9OVEFMKTtcbiAgICAgICAgdGhpcy5fc3luY1Njcm9sbGJhckVuYWJsZWRTdGF0ZShPUklFTlRBVElPTl9WRVJUSUNBTCk7XG4gICAgfVxuXG4gICAgX3N5bmNDb250ZW50UG9zaXRpb24ob3JpZW50YXRpb24pIHtcbiAgICAgICAgY29uc3QgYXhpcyA9IHRoaXMuX2dldEF4aXMob3JpZW50YXRpb24pO1xuICAgICAgICBjb25zdCBzaWduID0gdGhpcy5fZ2V0U2lnbihvcmllbnRhdGlvbik7XG4gICAgICAgIGNvbnN0IGNvbnRlbnRFbnRpdHkgPSB0aGlzLl9jb250ZW50UmVmZXJlbmNlLmVudGl0eTtcblxuICAgICAgICBpZiAoY29udGVudEVudGl0eSkge1xuICAgICAgICAgICAgY29uc3QgcHJldkNvbnRlbnRTaXplID0gdGhpcy5fcHJldkNvbnRlbnRTaXplc1tvcmllbnRhdGlvbl07XG4gICAgICAgICAgICBjb25zdCBjdXJyQ29udGVudFNpemUgPSB0aGlzLl9nZXRDb250ZW50U2l6ZShvcmllbnRhdGlvbik7XG5cbiAgICAgICAgICAgIC8vIElmIHRoZSBjb250ZW50IHNpemUgaGFzIGNoYW5nZWQsIGFkanVzdCB0aGUgc2Nyb2xsIHZhbHVlIHNvIHRoYXQgdGhlIGNvbnRlbnQgd2lsbFxuICAgICAgICAgICAgLy8gc3RheSBpbiB0aGUgc2FtZSBwbGFjZSBmcm9tIHRoZSB1c2VyJ3MgcGVyc3BlY3RpdmUuXG4gICAgICAgICAgICBpZiAocHJldkNvbnRlbnRTaXplICE9PSBudWxsICYmIE1hdGguYWJzKHByZXZDb250ZW50U2l6ZSAtIGN1cnJDb250ZW50U2l6ZSkgPiAxZS00KSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcHJldk1heE9mZnNldCA9IHRoaXMuX2dldE1heE9mZnNldChvcmllbnRhdGlvbiwgcHJldkNvbnRlbnRTaXplKTtcbiAgICAgICAgICAgICAgICBjb25zdCBjdXJyTWF4T2Zmc2V0ID0gdGhpcy5fZ2V0TWF4T2Zmc2V0KG9yaWVudGF0aW9uLCBjdXJyQ29udGVudFNpemUpO1xuICAgICAgICAgICAgICAgIGlmIChjdXJyTWF4T2Zmc2V0ID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3Njcm9sbFtheGlzXSA9IDE7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fc2Nyb2xsW2F4aXNdID0gbWF0aC5jbGFtcCh0aGlzLl9zY3JvbGxbYXhpc10gKiBwcmV2TWF4T2Zmc2V0IC8gY3Vyck1heE9mZnNldCwgMCwgMSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBvZmZzZXQgPSB0aGlzLl9zY3JvbGxbYXhpc10gKiB0aGlzLl9nZXRNYXhPZmZzZXQob3JpZW50YXRpb24pO1xuICAgICAgICAgICAgY29uc3QgY29udGVudFBvc2l0aW9uID0gY29udGVudEVudGl0eS5nZXRMb2NhbFBvc2l0aW9uKCk7XG4gICAgICAgICAgICBjb250ZW50UG9zaXRpb25bYXhpc10gPSBvZmZzZXQgKiBzaWduO1xuXG4gICAgICAgICAgICBjb250ZW50RW50aXR5LnNldExvY2FsUG9zaXRpb24oY29udGVudFBvc2l0aW9uKTtcblxuICAgICAgICAgICAgdGhpcy5fcHJldkNvbnRlbnRTaXplc1tvcmllbnRhdGlvbl0gPSBjdXJyQ29udGVudFNpemU7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBfc3luY1Njcm9sbGJhclBvc2l0aW9uKG9yaWVudGF0aW9uKSB7XG4gICAgICAgIGNvbnN0IGF4aXMgPSB0aGlzLl9nZXRBeGlzKG9yaWVudGF0aW9uKTtcbiAgICAgICAgY29uc3Qgc2Nyb2xsYmFyRW50aXR5ID0gdGhpcy5fc2Nyb2xsYmFyUmVmZXJlbmNlc1tvcmllbnRhdGlvbl0uZW50aXR5O1xuXG4gICAgICAgIGlmIChzY3JvbGxiYXJFbnRpdHkgJiYgc2Nyb2xsYmFyRW50aXR5LnNjcm9sbGJhcikge1xuICAgICAgICAgICAgLy8gU2V0dGluZyB0aGUgdmFsdWUgb2YgdGhlIHNjcm9sbGJhciB3aWxsIGZpcmUgYSAnc2V0OnZhbHVlJyBldmVudCwgd2hpY2ggaW4gdHVyblxuICAgICAgICAgICAgLy8gd2lsbCBjYWxsIHRoZSBfb25TZXRIb3Jpem9udGFsU2Nyb2xsYmFyVmFsdWUvX29uU2V0VmVydGljYWxTY3JvbGxiYXJWYWx1ZSBoYW5kbGVyc1xuICAgICAgICAgICAgLy8gYW5kIGNhdXNlIGEgY3ljbGUuIFRvIGF2b2lkIHRoaXMgd2Uga2VlcCB0cmFjayBvZiB0aGUgZmFjdCB0aGF0IHdlJ3JlIGluIHRoZSBwcm9jZXNzXG4gICAgICAgICAgICAvLyBvZiB1cGRhdGluZyB0aGUgc2Nyb2xsYmFyIHZhbHVlLlxuICAgICAgICAgICAgdGhpcy5fc2Nyb2xsYmFyVXBkYXRlRmxhZ3Nbb3JpZW50YXRpb25dID0gdHJ1ZTtcbiAgICAgICAgICAgIHNjcm9sbGJhckVudGl0eS5zY3JvbGxiYXIudmFsdWUgPSB0aGlzLl9zY3JvbGxbYXhpc107XG4gICAgICAgICAgICBzY3JvbGxiYXJFbnRpdHkuc2Nyb2xsYmFyLmhhbmRsZVNpemUgPSB0aGlzLl9nZXRTY3JvbGxiYXJIYW5kbGVTaXplKGF4aXMsIG9yaWVudGF0aW9uKTtcbiAgICAgICAgICAgIHRoaXMuX3Njcm9sbGJhclVwZGF0ZUZsYWdzW29yaWVudGF0aW9uXSA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gVG9nZ2xlcyB0aGUgc2Nyb2xsYmFyIGVudGl0aWVzIHRoZW1zZWx2ZXMgdG8gYmUgZW5hYmxlZC9kaXNhYmxlZCBiYXNlZFxuICAgIC8vIG9uIHdoZXRoZXIgdGhlIHVzZXIgaGFzIGVuYWJsZWQgaG9yaXpvbnRhbC92ZXJ0aWNhbCBzY3JvbGxpbmcgb24gdGhlXG4gICAgLy8gc2Nyb2xsIHZpZXcuXG4gICAgX3N5bmNTY3JvbGxiYXJFbmFibGVkU3RhdGUob3JpZW50YXRpb24pIHtcbiAgICAgICAgY29uc3QgZW50aXR5ID0gdGhpcy5fc2Nyb2xsYmFyUmVmZXJlbmNlc1tvcmllbnRhdGlvbl0uZW50aXR5O1xuXG4gICAgICAgIGlmIChlbnRpdHkpIHtcbiAgICAgICAgICAgIGNvbnN0IGlzU2Nyb2xsaW5nRW5hYmxlZCA9IHRoaXMuX2dldFNjcm9sbGluZ0VuYWJsZWQob3JpZW50YXRpb24pO1xuICAgICAgICAgICAgY29uc3QgcmVxdWVzdGVkVmlzaWJpbGl0eSA9IHRoaXMuX2dldFNjcm9sbGJhclZpc2liaWxpdHkob3JpZW50YXRpb24pO1xuXG4gICAgICAgICAgICBzd2l0Y2ggKHJlcXVlc3RlZFZpc2liaWxpdHkpIHtcbiAgICAgICAgICAgICAgICBjYXNlIFNDUk9MTEJBUl9WSVNJQklMSVRZX1NIT1dfQUxXQVlTOlxuICAgICAgICAgICAgICAgICAgICBlbnRpdHkuZW5hYmxlZCA9IGlzU2Nyb2xsaW5nRW5hYmxlZDtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgICAgICAgICAgY2FzZSBTQ1JPTExCQVJfVklTSUJJTElUWV9TSE9XX1dIRU5fUkVRVUlSRUQ6XG4gICAgICAgICAgICAgICAgICAgIGVudGl0eS5lbmFibGVkID0gaXNTY3JvbGxpbmdFbmFibGVkICYmIHRoaXMuX2NvbnRlbnRJc0xhcmdlclRoYW5WaWV3cG9ydChvcmllbnRhdGlvbik7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybignVW5oYW5kbGVkIHNjcm9sbGJhciB2aXNpYmlsaXR5OicgKyByZXF1ZXN0ZWRWaXNpYmlsaXR5KTtcbiAgICAgICAgICAgICAgICAgICAgZW50aXR5LmVuYWJsZWQgPSBpc1Njcm9sbGluZ0VuYWJsZWQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBfY29udGVudElzTGFyZ2VyVGhhblZpZXdwb3J0KG9yaWVudGF0aW9uKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9nZXRDb250ZW50U2l6ZShvcmllbnRhdGlvbikgPiB0aGlzLl9nZXRWaWV3cG9ydFNpemUob3JpZW50YXRpb24pO1xuICAgIH1cblxuICAgIF9jb250ZW50UG9zaXRpb25Ub1Njcm9sbFZhbHVlKGNvbnRlbnRQb3NpdGlvbikge1xuICAgICAgICBjb25zdCBtYXhPZmZzZXRIID0gdGhpcy5fZ2V0TWF4T2Zmc2V0KE9SSUVOVEFUSU9OX0hPUklaT05UQUwpO1xuICAgICAgICBjb25zdCBtYXhPZmZzZXRWID0gdGhpcy5fZ2V0TWF4T2Zmc2V0KE9SSUVOVEFUSU9OX1ZFUlRJQ0FMKTtcblxuICAgICAgICBpZiAobWF4T2Zmc2V0SCA9PT0gMCkge1xuICAgICAgICAgICAgX3RlbXBTY3JvbGxWYWx1ZS54ID0gMDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIF90ZW1wU2Nyb2xsVmFsdWUueCA9IGNvbnRlbnRQb3NpdGlvbi54IC8gbWF4T2Zmc2V0SDtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChtYXhPZmZzZXRWID09PSAwKSB7XG4gICAgICAgICAgICBfdGVtcFNjcm9sbFZhbHVlLnkgPSAwO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgX3RlbXBTY3JvbGxWYWx1ZS55ID0gY29udGVudFBvc2l0aW9uLnkgLyAtbWF4T2Zmc2V0VjtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBfdGVtcFNjcm9sbFZhbHVlO1xuICAgIH1cblxuICAgIF9nZXRNYXhPZmZzZXQob3JpZW50YXRpb24sIGNvbnRlbnRTaXplKSB7XG4gICAgICAgIGNvbnRlbnRTaXplID0gY29udGVudFNpemUgPT09IHVuZGVmaW5lZCA/IHRoaXMuX2dldENvbnRlbnRTaXplKG9yaWVudGF0aW9uKSA6IGNvbnRlbnRTaXplO1xuXG4gICAgICAgIGNvbnN0IHZpZXdwb3J0U2l6ZSA9IHRoaXMuX2dldFZpZXdwb3J0U2l6ZShvcmllbnRhdGlvbik7XG5cbiAgICAgICAgaWYgKGNvbnRlbnRTaXplIDwgdmlld3BvcnRTaXplKSB7XG4gICAgICAgICAgICByZXR1cm4gLXRoaXMuX2dldFZpZXdwb3J0U2l6ZShvcmllbnRhdGlvbik7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdmlld3BvcnRTaXplIC0gY29udGVudFNpemU7XG4gICAgfVxuXG4gICAgX2dldE1heFNjcm9sbFZhbHVlKG9yaWVudGF0aW9uKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9jb250ZW50SXNMYXJnZXJUaGFuVmlld3BvcnQob3JpZW50YXRpb24pID8gMSA6IDA7XG4gICAgfVxuXG4gICAgX2dldFNjcm9sbGJhckhhbmRsZVNpemUoYXhpcywgb3JpZW50YXRpb24pIHtcbiAgICAgICAgY29uc3Qgdmlld3BvcnRTaXplID0gdGhpcy5fZ2V0Vmlld3BvcnRTaXplKG9yaWVudGF0aW9uKTtcbiAgICAgICAgY29uc3QgY29udGVudFNpemUgPSB0aGlzLl9nZXRDb250ZW50U2l6ZShvcmllbnRhdGlvbik7XG5cbiAgICAgICAgaWYgKE1hdGguYWJzKGNvbnRlbnRTaXplKSA8IDAuMDAxKSB7XG4gICAgICAgICAgICByZXR1cm4gMTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGhhbmRsZVNpemUgPSBNYXRoLm1pbih2aWV3cG9ydFNpemUgLyBjb250ZW50U2l6ZSwgMSk7XG4gICAgICAgIGNvbnN0IG92ZXJzaG9vdCA9IHRoaXMuX3RvT3ZlcnNob290KHRoaXMuX3Njcm9sbFtheGlzXSwgb3JpZW50YXRpb24pO1xuXG4gICAgICAgIGlmIChvdmVyc2hvb3QgPT09IDApIHtcbiAgICAgICAgICAgIHJldHVybiBoYW5kbGVTaXplO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gU2NhbGUgdGhlIGhhbmRsZSBkb3duIHdoZW4gdGhlIGNvbnRlbnQgaGFzIGJlZW4gZHJhZ2dlZCBwYXN0IHRoZSBib3VuZHNcbiAgICAgICAgcmV0dXJuIGhhbmRsZVNpemUgLyAoMSArIE1hdGguYWJzKG92ZXJzaG9vdCkpO1xuICAgIH1cblxuICAgIF9nZXRWaWV3cG9ydFNpemUob3JpZW50YXRpb24pIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2dldFNpemUob3JpZW50YXRpb24sIHRoaXMuX3ZpZXdwb3J0UmVmZXJlbmNlKTtcbiAgICB9XG5cbiAgICBfZ2V0Q29udGVudFNpemUob3JpZW50YXRpb24pIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2dldFNpemUob3JpZW50YXRpb24sIHRoaXMuX2NvbnRlbnRSZWZlcmVuY2UpO1xuICAgIH1cblxuICAgIF9nZXRTaXplKG9yaWVudGF0aW9uLCBlbnRpdHlSZWZlcmVuY2UpIHtcbiAgICAgICAgaWYgKGVudGl0eVJlZmVyZW5jZS5lbnRpdHkgJiYgZW50aXR5UmVmZXJlbmNlLmVudGl0eS5lbGVtZW50KSB7XG4gICAgICAgICAgICByZXR1cm4gZW50aXR5UmVmZXJlbmNlLmVudGl0eS5lbGVtZW50W3RoaXMuX2dldENhbGN1bGF0ZWREaW1lbnNpb24ob3JpZW50YXRpb24pXTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiAwO1xuICAgIH1cblxuICAgIF9nZXRTY3JvbGxpbmdFbmFibGVkKG9yaWVudGF0aW9uKSB7XG4gICAgICAgIGlmIChvcmllbnRhdGlvbiA9PT0gT1JJRU5UQVRJT05fSE9SSVpPTlRBTCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuaG9yaXpvbnRhbDtcbiAgICAgICAgfSBlbHNlIGlmIChvcmllbnRhdGlvbiA9PT0gT1JJRU5UQVRJT05fVkVSVElDQUwpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnZlcnRpY2FsO1xuICAgICAgICB9XG5cbiAgICAgICAgRGVidWcud2FybihgVW5yZWNvZ25pemVkIG9yaWVudGF0aW9uOiAke29yaWVudGF0aW9ufWApO1xuICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cblxuICAgIF9nZXRTY3JvbGxiYXJWaXNpYmlsaXR5KG9yaWVudGF0aW9uKSB7XG4gICAgICAgIGlmIChvcmllbnRhdGlvbiA9PT0gT1JJRU5UQVRJT05fSE9SSVpPTlRBTCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuaG9yaXpvbnRhbFNjcm9sbGJhclZpc2liaWxpdHk7XG4gICAgICAgIH0gZWxzZSBpZiAob3JpZW50YXRpb24gPT09IE9SSUVOVEFUSU9OX1ZFUlRJQ0FMKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy52ZXJ0aWNhbFNjcm9sbGJhclZpc2liaWxpdHk7XG4gICAgICAgIH1cblxuICAgICAgICBEZWJ1Zy53YXJuKGBVbnJlY29nbml6ZWQgb3JpZW50YXRpb246ICR7b3JpZW50YXRpb259YCk7XG4gICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuXG4gICAgX2dldFNpZ24ob3JpZW50YXRpb24pIHtcbiAgICAgICAgcmV0dXJuIG9yaWVudGF0aW9uID09PSBPUklFTlRBVElPTl9IT1JJWk9OVEFMID8gMSA6IC0xO1xuICAgIH1cblxuICAgIF9nZXRBeGlzKG9yaWVudGF0aW9uKSB7XG4gICAgICAgIHJldHVybiBvcmllbnRhdGlvbiA9PT0gT1JJRU5UQVRJT05fSE9SSVpPTlRBTCA/ICd4JyA6ICd5JztcbiAgICB9XG5cbiAgICBfZ2V0Q2FsY3VsYXRlZERpbWVuc2lvbihvcmllbnRhdGlvbikge1xuICAgICAgICByZXR1cm4gb3JpZW50YXRpb24gPT09IE9SSUVOVEFUSU9OX0hPUklaT05UQUwgPyAnY2FsY3VsYXRlZFdpZHRoJyA6ICdjYWxjdWxhdGVkSGVpZ2h0JztcbiAgICB9XG5cbiAgICBfZGVzdHJveURyYWdIZWxwZXIoKSB7XG4gICAgICAgIGlmICh0aGlzLl9jb250ZW50RHJhZ0hlbHBlcikge1xuICAgICAgICAgICAgdGhpcy5fY29udGVudERyYWdIZWxwZXIuZGVzdHJveSgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgb25VcGRhdGUoKSB7XG4gICAgICAgIGlmICh0aGlzLl9jb250ZW50UmVmZXJlbmNlLmVudGl0eSkge1xuICAgICAgICAgICAgdGhpcy5fdXBkYXRlVmVsb2NpdHkoKTtcbiAgICAgICAgICAgIHRoaXMuX3N5bmNTY3JvbGxiYXJFbmFibGVkU3RhdGUoT1JJRU5UQVRJT05fSE9SSVpPTlRBTCk7XG4gICAgICAgICAgICB0aGlzLl9zeW5jU2Nyb2xsYmFyRW5hYmxlZFN0YXRlKE9SSUVOVEFUSU9OX1ZFUlRJQ0FMKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIF91cGRhdGVWZWxvY2l0eSgpIHtcbiAgICAgICAgaWYgKCF0aGlzLl9pc0RyYWdnaW5nKCkpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLnNjcm9sbE1vZGUgPT09IFNDUk9MTF9NT0RFX0JPVU5DRSkge1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLl9oYXNPdmVyc2hvb3QoJ3gnLCBPUklFTlRBVElPTl9IT1JJWk9OVEFMKSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9zZXRWZWxvY2l0eUZyb21PdmVyc2hvb3QodGhpcy5zY3JvbGwueCwgJ3gnLCBPUklFTlRBVElPTl9IT1JJWk9OVEFMKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAodGhpcy5faGFzT3ZlcnNob290KCd5JywgT1JJRU5UQVRJT05fVkVSVElDQUwpKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3NldFZlbG9jaXR5RnJvbU92ZXJzaG9vdCh0aGlzLnNjcm9sbC55LCAneScsIE9SSUVOVEFUSU9OX1ZFUlRJQ0FMKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChNYXRoLmFicyh0aGlzLl92ZWxvY2l0eS54KSA+IDFlLTQgfHwgTWF0aC5hYnModGhpcy5fdmVsb2NpdHkueSkgPiAxZS00KSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcG9zaXRpb24gPSB0aGlzLl9jb250ZW50UmVmZXJlbmNlLmVudGl0eS5nZXRMb2NhbFBvc2l0aW9uKCk7XG4gICAgICAgICAgICAgICAgcG9zaXRpb24ueCArPSB0aGlzLl92ZWxvY2l0eS54O1xuICAgICAgICAgICAgICAgIHBvc2l0aW9uLnkgKz0gdGhpcy5fdmVsb2NpdHkueTtcbiAgICAgICAgICAgICAgICB0aGlzLl9jb250ZW50UmVmZXJlbmNlLmVudGl0eS5zZXRMb2NhbFBvc2l0aW9uKHBvc2l0aW9uKTtcblxuICAgICAgICAgICAgICAgIHRoaXMuX3NldFNjcm9sbEZyb21Db250ZW50UG9zaXRpb24ocG9zaXRpb24pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLl92ZWxvY2l0eS54ICo9ICgxIC0gdGhpcy5mcmljdGlvbik7XG4gICAgICAgICAgICB0aGlzLl92ZWxvY2l0eS55ICo9ICgxIC0gdGhpcy5mcmljdGlvbik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBfaGFzT3ZlcnNob290KGF4aXMsIG9yaWVudGF0aW9uKSB7XG4gICAgICAgIHJldHVybiBNYXRoLmFicyh0aGlzLl90b092ZXJzaG9vdCh0aGlzLnNjcm9sbFtheGlzXSwgb3JpZW50YXRpb24pKSA+IDAuMDAxO1xuICAgIH1cblxuICAgIF90b092ZXJzaG9vdChzY3JvbGxWYWx1ZSwgb3JpZW50YXRpb24pIHtcbiAgICAgICAgY29uc3QgbWF4U2Nyb2xsVmFsdWUgPSB0aGlzLl9nZXRNYXhTY3JvbGxWYWx1ZShvcmllbnRhdGlvbik7XG5cbiAgICAgICAgaWYgKHNjcm9sbFZhbHVlIDwgMCkge1xuICAgICAgICAgICAgcmV0dXJuIHNjcm9sbFZhbHVlO1xuICAgICAgICB9IGVsc2UgaWYgKHNjcm9sbFZhbHVlID4gbWF4U2Nyb2xsVmFsdWUpIHtcbiAgICAgICAgICAgIHJldHVybiBzY3JvbGxWYWx1ZSAtIG1heFNjcm9sbFZhbHVlO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIDA7XG4gICAgfVxuXG4gICAgX3NldFZlbG9jaXR5RnJvbU92ZXJzaG9vdChzY3JvbGxWYWx1ZSwgYXhpcywgb3JpZW50YXRpb24pIHtcbiAgICAgICAgY29uc3Qgb3ZlcnNob290VmFsdWUgPSB0aGlzLl90b092ZXJzaG9vdChzY3JvbGxWYWx1ZSwgb3JpZW50YXRpb24pO1xuICAgICAgICBjb25zdCBvdmVyc2hvb3RQaXhlbHMgPSBvdmVyc2hvb3RWYWx1ZSAqIHRoaXMuX2dldE1heE9mZnNldChvcmllbnRhdGlvbikgKiB0aGlzLl9nZXRTaWduKG9yaWVudGF0aW9uKTtcblxuICAgICAgICBpZiAoTWF0aC5hYnMob3ZlcnNob290UGl4ZWxzKSA+IDApIHtcbiAgICAgICAgICAgIC8vIDUwIGhlcmUgaXMganVzdCBhIG1hZ2ljIG51bWJlciDigJMgaXQgc2VlbXMgdG8gZ2l2ZSB1cyBhIHJhbmdlIG9mIHVzZWZ1bFxuICAgICAgICAgICAgLy8gcmFuZ2Ugb2YgYm91bmNlQW1vdW50IHZhbHVlcywgc28gdGhhdCAwLjEgaXMgc2ltaWxhciB0byB0aGUgaU9TIGJvdW5jZVxuICAgICAgICAgICAgLy8gZmVlbCwgMS4wIGlzIG11Y2ggc2xvd2VyLCBldGMuIFRoZSArIDEgbWVhbnMgdGhhdCB3aGVuIGJvdW5jZUFtb3VudCBpc1xuICAgICAgICAgICAgLy8gMCwgdGhlIGNvbnRlbnQgd2lsbCBqdXN0IHNuYXAgYmFjayBpbW1lZGlhdGVseSBpbnN0ZWFkIG9mIG1vdmluZyBncmFkdWFsbHkuXG4gICAgICAgICAgICB0aGlzLl92ZWxvY2l0eVtheGlzXSA9IC1vdmVyc2hvb3RQaXhlbHMgLyAodGhpcy5ib3VuY2VBbW91bnQgKiA1MCArIDEpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgX3NldFZlbG9jaXR5RnJvbUNvbnRlbnRQb3NpdGlvbkRlbHRhKHBvc2l0aW9uKSB7XG4gICAgICAgIGlmICh0aGlzLl9wcmV2Q29udGVudERyYWdQb3NpdGlvbikge1xuICAgICAgICAgICAgdGhpcy5fdmVsb2NpdHkuc3ViMihwb3NpdGlvbiwgdGhpcy5fcHJldkNvbnRlbnREcmFnUG9zaXRpb24pO1xuICAgICAgICAgICAgdGhpcy5fcHJldkNvbnRlbnREcmFnUG9zaXRpb24uY29weShwb3NpdGlvbik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLl92ZWxvY2l0eS5zZXQoMCwgMCwgMCk7XG4gICAgICAgICAgICB0aGlzLl9wcmV2Q29udGVudERyYWdQb3NpdGlvbiA9IHBvc2l0aW9uLmNsb25lKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBfc2V0U2Nyb2xsRnJvbUNvbnRlbnRQb3NpdGlvbihwb3NpdGlvbikge1xuICAgICAgICBsZXQgc2Nyb2xsVmFsdWUgPSB0aGlzLl9jb250ZW50UG9zaXRpb25Ub1Njcm9sbFZhbHVlKHBvc2l0aW9uKTtcblxuICAgICAgICBpZiAodGhpcy5faXNEcmFnZ2luZygpKSB7XG4gICAgICAgICAgICBzY3JvbGxWYWx1ZSA9IHRoaXMuX2FwcGx5U2Nyb2xsVmFsdWVUZW5zaW9uKHNjcm9sbFZhbHVlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuX29uU2V0U2Nyb2xsKHNjcm9sbFZhbHVlLngsIHNjcm9sbFZhbHVlLnksIGZhbHNlKTtcbiAgICB9XG5cbiAgICAvLyBDcmVhdGUgbmljZSB0ZW5zaW9uIGVmZmVjdCB3aGVuIGRyYWdnaW5nIHBhc3QgdGhlIGV4dGVudHMgb2YgdGhlIHZpZXdwb3J0XG4gICAgX2FwcGx5U2Nyb2xsVmFsdWVUZW5zaW9uKHNjcm9sbFZhbHVlKSB7XG4gICAgICAgIGNvbnN0IGZhY3RvciA9IDE7XG5cbiAgICAgICAgbGV0IG1heCA9IHRoaXMuX2dldE1heFNjcm9sbFZhbHVlKE9SSUVOVEFUSU9OX0hPUklaT05UQUwpO1xuICAgICAgICBsZXQgb3ZlcnNob290ID0gdGhpcy5fdG9PdmVyc2hvb3Qoc2Nyb2xsVmFsdWUueCwgT1JJRU5UQVRJT05fSE9SSVpPTlRBTCk7XG4gICAgICAgIGlmIChvdmVyc2hvb3QgPiAwKSB7XG4gICAgICAgICAgICBzY3JvbGxWYWx1ZS54ID0gbWF4ICsgZmFjdG9yICogTWF0aC5sb2cxMCgxICsgb3ZlcnNob290KTtcbiAgICAgICAgfSBlbHNlIGlmIChvdmVyc2hvb3QgPCAwKSB7XG4gICAgICAgICAgICBzY3JvbGxWYWx1ZS54ID0gLWZhY3RvciAqIE1hdGgubG9nMTAoMSAtIG92ZXJzaG9vdCk7XG4gICAgICAgIH1cblxuICAgICAgICBtYXggPSB0aGlzLl9nZXRNYXhTY3JvbGxWYWx1ZShPUklFTlRBVElPTl9WRVJUSUNBTCk7XG4gICAgICAgIG92ZXJzaG9vdCA9IHRoaXMuX3RvT3ZlcnNob290KHNjcm9sbFZhbHVlLnksIE9SSUVOVEFUSU9OX1ZFUlRJQ0FMKTtcblxuICAgICAgICBpZiAob3ZlcnNob290ID4gMCkge1xuICAgICAgICAgICAgc2Nyb2xsVmFsdWUueSA9IG1heCArIGZhY3RvciAqIE1hdGgubG9nMTAoMSArIG92ZXJzaG9vdCk7XG4gICAgICAgIH0gZWxzZSBpZiAob3ZlcnNob290IDwgMCkge1xuICAgICAgICAgICAgc2Nyb2xsVmFsdWUueSA9IC1mYWN0b3IgKiBNYXRoLmxvZzEwKDEgLSBvdmVyc2hvb3QpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHNjcm9sbFZhbHVlO1xuICAgIH1cblxuICAgIF9pc0RyYWdnaW5nKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fY29udGVudERyYWdIZWxwZXIgJiYgdGhpcy5fY29udGVudERyYWdIZWxwZXIuaXNEcmFnZ2luZztcbiAgICB9XG5cbiAgICBfc2V0U2Nyb2xsYmFyQ29tcG9uZW50c0VuYWJsZWQoZW5hYmxlZCkge1xuICAgICAgICBpZiAodGhpcy5fc2Nyb2xsYmFyUmVmZXJlbmNlc1tPUklFTlRBVElPTl9IT1JJWk9OVEFMXS5oYXNDb21wb25lbnQoJ3Njcm9sbGJhcicpKSB7XG4gICAgICAgICAgICB0aGlzLl9zY3JvbGxiYXJSZWZlcmVuY2VzW09SSUVOVEFUSU9OX0hPUklaT05UQUxdLmVudGl0eS5zY3JvbGxiYXIuZW5hYmxlZCA9IGVuYWJsZWQ7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5fc2Nyb2xsYmFyUmVmZXJlbmNlc1tPUklFTlRBVElPTl9WRVJUSUNBTF0uaGFzQ29tcG9uZW50KCdzY3JvbGxiYXInKSkge1xuICAgICAgICAgICAgdGhpcy5fc2Nyb2xsYmFyUmVmZXJlbmNlc1tPUklFTlRBVElPTl9WRVJUSUNBTF0uZW50aXR5LnNjcm9sbGJhci5lbmFibGVkID0gZW5hYmxlZDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIF9zZXRDb250ZW50RHJhZ2dpbmdFbmFibGVkKGVuYWJsZWQpIHtcbiAgICAgICAgaWYgKHRoaXMuX2NvbnRlbnREcmFnSGVscGVyKSB7XG4gICAgICAgICAgICB0aGlzLl9jb250ZW50RHJhZ0hlbHBlci5lbmFibGVkID0gZW5hYmxlZDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIF9vbk1vdXNlV2hlZWwoZXZlbnQpIHtcbiAgICAgICAgaWYgKHRoaXMudXNlTW91c2VXaGVlbCkge1xuICAgICAgICAgICAgY29uc3Qgd2hlZWxFdmVudCA9IGV2ZW50LmV2ZW50O1xuXG4gICAgICAgICAgICAvLyB3aGVlbEV2ZW50J3MgZGVsdGEgdmFyaWFibGVzIGFyZSBzY3JlZW4gc3BhY2UsIHNvIHRoZXkgbmVlZCB0byBiZSBub3JtYWxpemVkIGZpcnN0XG4gICAgICAgICAgICBjb25zdCBub3JtYWxpemVkRGVsdGFYID0gKHdoZWVsRXZlbnQuZGVsdGFYIC8gdGhpcy5fY29udGVudFJlZmVyZW5jZS5lbnRpdHkuZWxlbWVudC5jYWxjdWxhdGVkV2lkdGgpICogdGhpcy5tb3VzZVdoZWVsU2Vuc2l0aXZpdHkueDtcbiAgICAgICAgICAgIGNvbnN0IG5vcm1hbGl6ZWREZWx0YVkgPSAod2hlZWxFdmVudC5kZWx0YVkgLyB0aGlzLl9jb250ZW50UmVmZXJlbmNlLmVudGl0eS5lbGVtZW50LmNhbGN1bGF0ZWRIZWlnaHQpICogdGhpcy5tb3VzZVdoZWVsU2Vuc2l0aXZpdHkueTtcblxuICAgICAgICAgICAgLy8gdXBkYXRlIHNjcm9sbCBwb3NpdGlvbnMsIGNsYW1waW5nIHRvIFswLCBtYXhTY3JvbGxWYWx1ZV0gdG8gYWx3YXlzIHByZXZlbnQgb3Zlci1zaG9vdGluZ1xuICAgICAgICAgICAgY29uc3Qgc2Nyb2xsWCA9IG1hdGguY2xhbXAodGhpcy5fc2Nyb2xsLnggKyBub3JtYWxpemVkRGVsdGFYLCAwLCB0aGlzLl9nZXRNYXhTY3JvbGxWYWx1ZShPUklFTlRBVElPTl9IT1JJWk9OVEFMKSk7XG4gICAgICAgICAgICBjb25zdCBzY3JvbGxZID0gbWF0aC5jbGFtcCh0aGlzLl9zY3JvbGwueSArIG5vcm1hbGl6ZWREZWx0YVksIDAsIHRoaXMuX2dldE1heFNjcm9sbFZhbHVlKE9SSUVOVEFUSU9OX1ZFUlRJQ0FMKSk7XG5cbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsID0gbmV3IFZlYzIoc2Nyb2xsWCwgc2Nyb2xsWSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyByZS1lbmFibGUgdXNlSW5wdXQgZmxhZyBvbiBhbnkgZGVzY2VuZGFudCB0aGF0IHdhcyBkaXNhYmxlZFxuICAgIF9lbmFibGVDb250ZW50SW5wdXQoKSB7XG4gICAgICAgIHdoaWxlICh0aGlzLl9kaXNhYmxlZENvbnRlbnRJbnB1dEVudGl0aWVzLmxlbmd0aCkge1xuICAgICAgICAgICAgY29uc3QgZSA9IHRoaXMuX2Rpc2FibGVkQ29udGVudElucHV0RW50aXRpZXMucG9wKCk7XG4gICAgICAgICAgICBpZiAoZS5lbGVtZW50KSB7XG4gICAgICAgICAgICAgICAgZS5lbGVtZW50LnVzZUlucHV0ID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuX2Rpc2FibGVkQ29udGVudElucHV0ID0gZmFsc2U7XG4gICAgfVxuXG4gICAgLy8gZGlzYWJsZSB1c2VJbnB1dCBmbGFnIG9uIGFsbCBkZXNjZW5kYW50cyBvZiB0aGlzIGNvbnRlbnRFbnRpdHlcbiAgICBfZGlzYWJsZUNvbnRlbnRJbnB1dCgpIHtcbiAgICAgICAgY29uc3QgX2Rpc2FibGVJbnB1dCA9IChlKSA9PiB7XG4gICAgICAgICAgICBpZiAoZS5lbGVtZW50ICYmIGUuZWxlbWVudC51c2VJbnB1dCkge1xuICAgICAgICAgICAgICAgIHRoaXMuX2Rpc2FibGVkQ29udGVudElucHV0RW50aXRpZXMucHVzaChlKTtcbiAgICAgICAgICAgICAgICBlLmVsZW1lbnQudXNlSW5wdXQgPSBmYWxzZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgY2hpbGRyZW4gPSBlLmNoaWxkcmVuO1xuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDAsIGwgPSBjaGlsZHJlbi5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgICAgICAgICBfZGlzYWJsZUlucHV0KGNoaWxkcmVuW2ldKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICBjb25zdCBjb250ZW50RW50aXR5ID0gdGhpcy5fY29udGVudFJlZmVyZW5jZS5lbnRpdHk7XG4gICAgICAgIGlmIChjb250ZW50RW50aXR5KSB7XG4gICAgICAgICAgICAvLyBkaXNhYmxlIGlucHV0IHJlY3Vyc2l2ZWx5IGZvciBhbGwgY2hpbGRyZW4gb2YgdGhlIGNvbnRlbnQgZW50aXR5XG4gICAgICAgICAgICBjb25zdCBjaGlsZHJlbiA9IGNvbnRlbnRFbnRpdHkuY2hpbGRyZW47XG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMCwgbCA9IGNoaWxkcmVuLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgICAgICAgICAgICAgIF9kaXNhYmxlSW5wdXQoY2hpbGRyZW5baV0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fZGlzYWJsZWRDb250ZW50SW5wdXQgPSB0cnVlO1xuICAgIH1cblxuICAgIG9uRW5hYmxlKCkge1xuICAgICAgICB0aGlzLl92aWV3cG9ydFJlZmVyZW5jZS5vblBhcmVudENvbXBvbmVudEVuYWJsZSgpO1xuICAgICAgICB0aGlzLl9jb250ZW50UmVmZXJlbmNlLm9uUGFyZW50Q29tcG9uZW50RW5hYmxlKCk7XG4gICAgICAgIHRoaXMuX3Njcm9sbGJhclJlZmVyZW5jZXNbT1JJRU5UQVRJT05fSE9SSVpPTlRBTF0ub25QYXJlbnRDb21wb25lbnRFbmFibGUoKTtcbiAgICAgICAgdGhpcy5fc2Nyb2xsYmFyUmVmZXJlbmNlc1tPUklFTlRBVElPTl9WRVJUSUNBTF0ub25QYXJlbnRDb21wb25lbnRFbmFibGUoKTtcbiAgICAgICAgdGhpcy5fc2V0U2Nyb2xsYmFyQ29tcG9uZW50c0VuYWJsZWQodHJ1ZSk7XG4gICAgICAgIHRoaXMuX3NldENvbnRlbnREcmFnZ2luZ0VuYWJsZWQodHJ1ZSk7XG5cbiAgICAgICAgdGhpcy5fc3luY0FsbCgpO1xuICAgIH1cblxuICAgIG9uRGlzYWJsZSgpIHtcbiAgICAgICAgdGhpcy5fc2V0U2Nyb2xsYmFyQ29tcG9uZW50c0VuYWJsZWQoZmFsc2UpO1xuICAgICAgICB0aGlzLl9zZXRDb250ZW50RHJhZ2dpbmdFbmFibGVkKGZhbHNlKTtcbiAgICB9XG5cbiAgICBvblJlbW92ZSgpIHtcbiAgICAgICAgdGhpcy5fdG9nZ2xlTGlmZWN5Y2xlTGlzdGVuZXJzKCdvZmYnLCB0aGlzLnN5c3RlbSk7XG4gICAgICAgIHRoaXMuX3RvZ2dsZUVsZW1lbnRMaXN0ZW5lcnMoJ29mZicpO1xuICAgICAgICB0aGlzLl9kZXN0cm95RHJhZ0hlbHBlcigpO1xuICAgIH1cblxuICAgIHNldCBzY3JvbGwodmFsdWUpIHtcbiAgICAgICAgdGhpcy5fb25TZXRTY3JvbGwodmFsdWUueCwgdmFsdWUueSk7XG4gICAgfVxuXG4gICAgZ2V0IHNjcm9sbCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3Njcm9sbDtcbiAgICB9XG59XG5cbmV4cG9ydCB7IFNjcm9sbFZpZXdDb21wb25lbnQgfTtcbiJdLCJuYW1lcyI6WyJfdGVtcFNjcm9sbFZhbHVlIiwiVmVjMiIsIlNjcm9sbFZpZXdDb21wb25lbnQiLCJDb21wb25lbnQiLCJjb25zdHJ1Y3RvciIsInN5c3RlbSIsImVudGl0eSIsIl92aWV3cG9ydFJlZmVyZW5jZSIsIkVudGl0eVJlZmVyZW5jZSIsIl9vblZpZXdwb3J0RWxlbWVudEdhaW4iLCJfb25TZXRDb250ZW50T3JWaWV3cG9ydFNpemUiLCJfY29udGVudFJlZmVyZW5jZSIsIl9vbkNvbnRlbnRFbGVtZW50R2FpbiIsIl9vbkNvbnRlbnRFbGVtZW50TG9zZSIsIl9zY3JvbGxiYXJVcGRhdGVGbGFncyIsIl9zY3JvbGxiYXJSZWZlcmVuY2VzIiwiT1JJRU5UQVRJT05fSE9SSVpPTlRBTCIsIl9vblNldEhvcml6b250YWxTY3JvbGxiYXJWYWx1ZSIsIl9vbkhvcml6b250YWxTY3JvbGxiYXJHYWluIiwiT1JJRU5UQVRJT05fVkVSVElDQUwiLCJfb25TZXRWZXJ0aWNhbFNjcm9sbGJhclZhbHVlIiwiX29uVmVydGljYWxTY3JvbGxiYXJHYWluIiwiX3ByZXZDb250ZW50U2l6ZXMiLCJfc2Nyb2xsIiwiX3ZlbG9jaXR5IiwiVmVjMyIsIl9kcmFnU3RhcnRQb3NpdGlvbiIsIl9kaXNhYmxlZENvbnRlbnRJbnB1dCIsIl9kaXNhYmxlZENvbnRlbnRJbnB1dEVudGl0aWVzIiwiX3RvZ2dsZUxpZmVjeWNsZUxpc3RlbmVycyIsIl90b2dnbGVFbGVtZW50TGlzdGVuZXJzIiwib25Pck9mZiIsIl9vblNldEhvcml6b250YWxTY3JvbGxpbmdFbmFibGVkIiwiX29uU2V0VmVydGljYWxTY3JvbGxpbmdFbmFibGVkIiwiYXBwIiwic3lzdGVtcyIsImVsZW1lbnQiLCJfb25FbGVtZW50Q29tcG9uZW50QWRkIiwiX29uRWxlbWVudENvbXBvbmVudFJlbW92ZSIsIl9oYXNFbGVtZW50TGlzdGVuZXJzIiwiRVZFTlRfTU9VU0VXSEVFTCIsIl9vbk1vdXNlV2hlZWwiLCJfc3luY0FsbCIsIl9kZXN0cm95RHJhZ0hlbHBlciIsIl9jb250ZW50RHJhZ0hlbHBlciIsIkVsZW1lbnREcmFnSGVscGVyIiwib24iLCJfb25Db250ZW50RHJhZ1N0YXJ0IiwiX29uQ29udGVudERyYWdFbmQiLCJfb25Db250ZW50RHJhZ01vdmUiLCJlbmFibGVkIiwiY29weSIsImdldExvY2FsUG9zaXRpb24iLCJfcHJldkNvbnRlbnREcmFnUG9zaXRpb24iLCJfZW5hYmxlQ29udGVudElucHV0IiwicG9zaXRpb24iLCJfd2FzRHJhZ2dlZCIsIl9zZXRTY3JvbGxGcm9tQ29udGVudFBvc2l0aW9uIiwiX3NldFZlbG9jaXR5RnJvbUNvbnRlbnRQb3NpdGlvbkRlbHRhIiwiZHgiLCJ4IiwiZHkiLCJ5IiwiTWF0aCIsImFicyIsImRyYWdUaHJlc2hvbGQiLCJfZGlzYWJsZUNvbnRlbnRJbnB1dCIsInNjcm9sbFZhbHVlWCIsIl9vblNldFNjcm9sbCIsInNjcm9sbFZhbHVlWSIsIl9zeW5jU2Nyb2xsYmFyRW5hYmxlZFN0YXRlIiwiX3N5bmNTY3JvbGxiYXJQb3NpdGlvbiIsInJlc2V0VmVsb2NpdHkiLCJzZXQiLCJ4Q2hhbmdlZCIsIl91cGRhdGVBeGlzIiwieUNoYW5nZWQiLCJmaXJlIiwic2Nyb2xsVmFsdWUiLCJheGlzIiwib3JpZW50YXRpb24iLCJoYXNDaGFuZ2VkIiwiX2lzRHJhZ2dpbmciLCJfZGV0ZXJtaW5lTmV3U2Nyb2xsVmFsdWUiLCJfc3luY0NvbnRlbnRQb3NpdGlvbiIsIl9nZXRTY3JvbGxpbmdFbmFibGVkIiwic2Nyb2xsTW9kZSIsIlNDUk9MTF9NT0RFX0NMQU1QIiwibWF0aCIsImNsYW1wIiwiX2dldE1heFNjcm9sbFZhbHVlIiwiU0NST0xMX01PREVfQk9VTkNFIiwiX3NldFZlbG9jaXR5RnJvbU92ZXJzaG9vdCIsIlNDUk9MTF9NT0RFX0lORklOSVRFIiwiY29uc29sZSIsIndhcm4iLCJfZ2V0QXhpcyIsInNpZ24iLCJfZ2V0U2lnbiIsImNvbnRlbnRFbnRpdHkiLCJwcmV2Q29udGVudFNpemUiLCJjdXJyQ29udGVudFNpemUiLCJfZ2V0Q29udGVudFNpemUiLCJwcmV2TWF4T2Zmc2V0IiwiX2dldE1heE9mZnNldCIsImN1cnJNYXhPZmZzZXQiLCJvZmZzZXQiLCJjb250ZW50UG9zaXRpb24iLCJzZXRMb2NhbFBvc2l0aW9uIiwic2Nyb2xsYmFyRW50aXR5Iiwic2Nyb2xsYmFyIiwidmFsdWUiLCJoYW5kbGVTaXplIiwiX2dldFNjcm9sbGJhckhhbmRsZVNpemUiLCJpc1Njcm9sbGluZ0VuYWJsZWQiLCJyZXF1ZXN0ZWRWaXNpYmlsaXR5IiwiX2dldFNjcm9sbGJhclZpc2liaWxpdHkiLCJTQ1JPTExCQVJfVklTSUJJTElUWV9TSE9XX0FMV0FZUyIsIlNDUk9MTEJBUl9WSVNJQklMSVRZX1NIT1dfV0hFTl9SRVFVSVJFRCIsIl9jb250ZW50SXNMYXJnZXJUaGFuVmlld3BvcnQiLCJfZ2V0Vmlld3BvcnRTaXplIiwiX2NvbnRlbnRQb3NpdGlvblRvU2Nyb2xsVmFsdWUiLCJtYXhPZmZzZXRIIiwibWF4T2Zmc2V0ViIsImNvbnRlbnRTaXplIiwidW5kZWZpbmVkIiwidmlld3BvcnRTaXplIiwibWluIiwib3ZlcnNob290IiwiX3RvT3ZlcnNob290IiwiX2dldFNpemUiLCJlbnRpdHlSZWZlcmVuY2UiLCJfZ2V0Q2FsY3VsYXRlZERpbWVuc2lvbiIsImhvcml6b250YWwiLCJ2ZXJ0aWNhbCIsIkRlYnVnIiwiaG9yaXpvbnRhbFNjcm9sbGJhclZpc2liaWxpdHkiLCJ2ZXJ0aWNhbFNjcm9sbGJhclZpc2liaWxpdHkiLCJkZXN0cm95Iiwib25VcGRhdGUiLCJfdXBkYXRlVmVsb2NpdHkiLCJfaGFzT3ZlcnNob290Iiwic2Nyb2xsIiwiZnJpY3Rpb24iLCJtYXhTY3JvbGxWYWx1ZSIsIm92ZXJzaG9vdFZhbHVlIiwib3ZlcnNob290UGl4ZWxzIiwiYm91bmNlQW1vdW50Iiwic3ViMiIsImNsb25lIiwiX2FwcGx5U2Nyb2xsVmFsdWVUZW5zaW9uIiwiZmFjdG9yIiwibWF4IiwibG9nMTAiLCJpc0RyYWdnaW5nIiwiX3NldFNjcm9sbGJhckNvbXBvbmVudHNFbmFibGVkIiwiaGFzQ29tcG9uZW50IiwiX3NldENvbnRlbnREcmFnZ2luZ0VuYWJsZWQiLCJldmVudCIsInVzZU1vdXNlV2hlZWwiLCJ3aGVlbEV2ZW50Iiwibm9ybWFsaXplZERlbHRhWCIsImRlbHRhWCIsImNhbGN1bGF0ZWRXaWR0aCIsIm1vdXNlV2hlZWxTZW5zaXRpdml0eSIsIm5vcm1hbGl6ZWREZWx0YVkiLCJkZWx0YVkiLCJjYWxjdWxhdGVkSGVpZ2h0Iiwic2Nyb2xsWCIsInNjcm9sbFkiLCJsZW5ndGgiLCJlIiwicG9wIiwidXNlSW5wdXQiLCJfZGlzYWJsZUlucHV0IiwicHVzaCIsImNoaWxkcmVuIiwiaSIsImwiLCJvbkVuYWJsZSIsIm9uUGFyZW50Q29tcG9uZW50RW5hYmxlIiwib25EaXNhYmxlIiwib25SZW1vdmUiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7O0FBZ0JBLE1BQU1BLGdCQUFnQixHQUFHLElBQUlDLElBQUksRUFBRSxDQUFBOztBQUVuQztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsTUFBTUMsbUJBQW1CLFNBQVNDLFNBQVMsQ0FBQztBQUN4QztBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0lDLEVBQUFBLFdBQVdBLENBQUNDLE1BQU0sRUFBRUMsTUFBTSxFQUFFO0FBQ3hCLElBQUEsS0FBSyxDQUFD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
