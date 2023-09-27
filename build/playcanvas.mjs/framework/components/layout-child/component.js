import { Component } from '../component.js';

/**
 * A LayoutChildComponent enables the Entity to control the sizing applied to it by its parent
 * {@link LayoutGroupComponent}.
 *
 * @augments Component
 * @category User Interface
 */
class LayoutChildComponent extends Component {
  /**
   * Create a new LayoutChildComponent.
   *
   * @param {import('./system.js').LayoutChildComponentSystem} system - The ComponentSystem that
   * created this Component.
   * @param {import('../../entity.js').Entity} entity - The Entity that this Component is
   * attached to.
   */
  constructor(system, entity) {
    super(system, entity);

    /** @private */
    this._minWidth = 0;
    /** @private */
    this._minHeight = 0;
    /** @private */
    this._maxWidth = null;
    /** @private */
    this._maxHeight = null;
    /** @private */
    this._fitWidthProportion = 0;
    /** @private */
    this._fitHeightProportion = 0;
    /** @private */
    this._excludeFromLayout = false;
  }

  /**
   * The minimum width the element should be rendered at.
   *
   * @type {number}
   */
  set minWidth(value) {
    if (value !== this._minWidth) {
      this._minWidth = value;
      this.fire('resize');
    }
  }
  get minWidth() {
    return this._minWidth;
  }

  /**
   * The minimum height the element should be rendered at.
   *
   * @type {number}
   */
  set minHeight(value) {
    if (value !== this._minHeight) {
      this._minHeight = value;
      this.fire('resize');
    }
  }
  get minHeight() {
    return this._minHeight;
  }

  /**
   * The maximum width the element should be rendered at.
   *
   * @type {number|null}
   */
  set maxWidth(value) {
    if (value !== this._maxWidth) {
      this._maxWidth = value;
      this.fire('resize');
    }
  }
  get maxWidth() {
    return this._maxWidth;
  }

  /**
   * The maximum height the element should be rendered at.
   *
   * @type {number|null}
   */
  set maxHeight(value) {
    if (value !== this._maxHeight) {
      this._maxHeight = value;
      this.fire('resize');
    }
  }
  get maxHeight() {
    return this._maxHeight;
  }

  /**
   * The amount of additional horizontal space that the element should take up, if necessary to
   * satisfy a Stretch/Shrink fitting calculation. This is specified as a proportion, taking into
   * account the proportion values of other siblings.
   *
   * @type {number}
   */
  set fitWidthProportion(value) {
    if (value !== this._fitWidthProportion) {
      this._fitWidthProportion = value;
      this.fire('resize');
    }
  }
  get fitWidthProportion() {
    return this._fitWidthProportion;
  }

  /**
   * The amount of additional vertical space that the element should take up, if necessary to
   * satisfy a Stretch/Shrink fitting calculation. This is specified as a proportion, taking into
   * account the proportion values of other siblings.
   *
   * @type {number}
   */
  set fitHeightProportion(value) {
    if (value !== this._fitHeightProportion) {
      this._fitHeightProportion = value;
      this.fire('resize');
    }
  }
  get fitHeightProportion() {
    return this._fitHeightProportion;
  }

  /**
   * If set to true, the child will be excluded from all layout calculations.
   *
   * @type {boolean}
   */
  set excludeFromLayout(value) {
    if (value !== this._excludeFromLayout) {
      this._excludeFromLayout = value;
      this.fire('resize');
    }
  }
  get excludeFromLayout() {
    return this._excludeFromLayout;
  }
}

export { LayoutChildComponent };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tcG9uZW50LmpzIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi9zcmMvZnJhbWV3b3JrL2NvbXBvbmVudHMvbGF5b3V0LWNoaWxkL2NvbXBvbmVudC5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBDb21wb25lbnQgfSBmcm9tICcuLi9jb21wb25lbnQuanMnO1xuXG4vKipcbiAqIEEgTGF5b3V0Q2hpbGRDb21wb25lbnQgZW5hYmxlcyB0aGUgRW50aXR5IHRvIGNvbnRyb2wgdGhlIHNpemluZyBhcHBsaWVkIHRvIGl0IGJ5IGl0cyBwYXJlbnRcbiAqIHtAbGluayBMYXlvdXRHcm91cENvbXBvbmVudH0uXG4gKlxuICogQGF1Z21lbnRzIENvbXBvbmVudFxuICogQGNhdGVnb3J5IFVzZXIgSW50ZXJmYWNlXG4gKi9cbmNsYXNzIExheW91dENoaWxkQ29tcG9uZW50IGV4dGVuZHMgQ29tcG9uZW50IHtcbiAgICAvKipcbiAgICAgKiBDcmVhdGUgYSBuZXcgTGF5b3V0Q2hpbGRDb21wb25lbnQuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi9zeXN0ZW0uanMnKS5MYXlvdXRDaGlsZENvbXBvbmVudFN5c3RlbX0gc3lzdGVtIC0gVGhlIENvbXBvbmVudFN5c3RlbSB0aGF0XG4gICAgICogY3JlYXRlZCB0aGlzIENvbXBvbmVudC5cbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi4vLi4vZW50aXR5LmpzJykuRW50aXR5fSBlbnRpdHkgLSBUaGUgRW50aXR5IHRoYXQgdGhpcyBDb21wb25lbnQgaXNcbiAgICAgKiBhdHRhY2hlZCB0by5cbiAgICAgKi9cbiAgICBjb25zdHJ1Y3RvcihzeXN0ZW0sIGVudGl0eSkge1xuICAgICAgICBzdXBlcihzeXN0ZW0sIGVudGl0eSk7XG5cbiAgICAgICAgLyoqIEBwcml2YXRlICovXG4gICAgICAgIHRoaXMuX21pbldpZHRoID0gMDtcbiAgICAgICAgLyoqIEBwcml2YXRlICovXG4gICAgICAgIHRoaXMuX21pbkhlaWdodCA9IDA7XG4gICAgICAgIC8qKiBAcHJpdmF0ZSAqL1xuICAgICAgICB0aGlzLl9tYXhXaWR0aCA9IG51bGw7XG4gICAgICAgIC8qKiBAcHJpdmF0ZSAqL1xuICAgICAgICB0aGlzLl9tYXhIZWlnaHQgPSBudWxsO1xuICAgICAgICAvKiogQHByaXZhdGUgKi9cbiAgICAgICAgdGhpcy5fZml0V2lkdGhQcm9wb3J0aW9uID0gMDtcbiAgICAgICAgLyoqIEBwcml2YXRlICovXG4gICAgICAgIHRoaXMuX2ZpdEhlaWdodFByb3BvcnRpb24gPSAwO1xuICAgICAgICAvKiogQHByaXZhdGUgKi9cbiAgICAgICAgdGhpcy5fZXhjbHVkZUZyb21MYXlvdXQgPSBmYWxzZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUaGUgbWluaW11bSB3aWR0aCB0aGUgZWxlbWVudCBzaG91bGQgYmUgcmVuZGVyZWQgYXQuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqL1xuICAgIHNldCBtaW5XaWR0aCh2YWx1ZSkge1xuICAgICAgICBpZiAodmFsdWUgIT09IHRoaXMuX21pbldpZHRoKSB7XG4gICAgICAgICAgICB0aGlzLl9taW5XaWR0aCA9IHZhbHVlO1xuICAgICAgICAgICAgdGhpcy5maXJlKCdyZXNpemUnKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGdldCBtaW5XaWR0aCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX21pbldpZHRoO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRoZSBtaW5pbXVtIGhlaWdodCB0aGUgZWxlbWVudCBzaG91bGQgYmUgcmVuZGVyZWQgYXQuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqL1xuICAgIHNldCBtaW5IZWlnaHQodmFsdWUpIHtcbiAgICAgICAgaWYgKHZhbHVlICE9PSB0aGlzLl9taW5IZWlnaHQpIHtcbiAgICAgICAgICAgIHRoaXMuX21pbkhlaWdodCA9IHZhbHVlO1xuICAgICAgICAgICAgdGhpcy5maXJlKCdyZXNpemUnKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGdldCBtaW5IZWlnaHQoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9taW5IZWlnaHQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVGhlIG1heGltdW0gd2lkdGggdGhlIGVsZW1lbnQgc2hvdWxkIGJlIHJlbmRlcmVkIGF0LlxuICAgICAqXG4gICAgICogQHR5cGUge251bWJlcnxudWxsfVxuICAgICAqL1xuICAgIHNldCBtYXhXaWR0aCh2YWx1ZSkge1xuICAgICAgICBpZiAodmFsdWUgIT09IHRoaXMuX21heFdpZHRoKSB7XG4gICAgICAgICAgICB0aGlzLl9tYXhXaWR0aCA9IHZhbHVlO1xuICAgICAgICAgICAgdGhpcy5maXJlKCdyZXNpemUnKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGdldCBtYXhXaWR0aCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX21heFdpZHRoO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRoZSBtYXhpbXVtIGhlaWdodCB0aGUgZWxlbWVudCBzaG91bGQgYmUgcmVuZGVyZWQgYXQuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7bnVtYmVyfG51bGx9XG4gICAgICovXG4gICAgc2V0IG1heEhlaWdodCh2YWx1ZSkge1xuICAgICAgICBpZiAodmFsdWUgIT09IHRoaXMuX21heEhlaWdodCkge1xuICAgICAgICAgICAgdGhpcy5fbWF4SGVpZ2h0ID0gdmFsdWU7XG4gICAgICAgICAgICB0aGlzLmZpcmUoJ3Jlc2l6ZScpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2V0IG1heEhlaWdodCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX21heEhlaWdodDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUaGUgYW1vdW50IG9mIGFkZGl0aW9uYWwgaG9yaXpvbnRhbCBzcGFjZSB0aGF0IHRoZSBlbGVtZW50IHNob3VsZCB0YWtlIHVwLCBpZiBuZWNlc3NhcnkgdG9cbiAgICAgKiBzYXRpc2Z5IGEgU3RyZXRjaC9TaHJpbmsgZml0dGluZyBjYWxjdWxhdGlvbi4gVGhpcyBpcyBzcGVjaWZpZWQgYXMgYSBwcm9wb3J0aW9uLCB0YWtpbmcgaW50b1xuICAgICAqIGFjY291bnQgdGhlIHByb3BvcnRpb24gdmFsdWVzIG9mIG90aGVyIHNpYmxpbmdzLlxuICAgICAqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKi9cbiAgICBzZXQgZml0V2lkdGhQcm9wb3J0aW9uKHZhbHVlKSB7XG4gICAgICAgIGlmICh2YWx1ZSAhPT0gdGhpcy5fZml0V2lkdGhQcm9wb3J0aW9uKSB7XG4gICAgICAgICAgICB0aGlzLl9maXRXaWR0aFByb3BvcnRpb24gPSB2YWx1ZTtcbiAgICAgICAgICAgIHRoaXMuZmlyZSgncmVzaXplJyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBnZXQgZml0V2lkdGhQcm9wb3J0aW9uKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fZml0V2lkdGhQcm9wb3J0aW9uO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRoZSBhbW91bnQgb2YgYWRkaXRpb25hbCB2ZXJ0aWNhbCBzcGFjZSB0aGF0IHRoZSBlbGVtZW50IHNob3VsZCB0YWtlIHVwLCBpZiBuZWNlc3NhcnkgdG9cbiAgICAgKiBzYXRpc2Z5IGEgU3RyZXRjaC9TaHJpbmsgZml0dGluZyBjYWxjdWxhdGlvbi4gVGhpcyBpcyBzcGVjaWZpZWQgYXMgYSBwcm9wb3J0aW9uLCB0YWtpbmcgaW50b1xuICAgICAqIGFjY291bnQgdGhlIHByb3BvcnRpb24gdmFsdWVzIG9mIG90aGVyIHNpYmxpbmdzLlxuICAgICAqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKi9cbiAgICBzZXQgZml0SGVpZ2h0UHJvcG9ydGlvbih2YWx1ZSkge1xuICAgICAgICBpZiAodmFsdWUgIT09IHRoaXMuX2ZpdEhlaWdodFByb3BvcnRpb24pIHtcbiAgICAgICAgICAgIHRoaXMuX2ZpdEhlaWdodFByb3BvcnRpb24gPSB2YWx1ZTtcbiAgICAgICAgICAgIHRoaXMuZmlyZSgncmVzaXplJyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBnZXQgZml0SGVpZ2h0UHJvcG9ydGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2ZpdEhlaWdodFByb3BvcnRpb247XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSWYgc2V0IHRvIHRydWUsIHRoZSBjaGlsZCB3aWxsIGJlIGV4Y2x1ZGVkIGZyb20gYWxsIGxheW91dCBjYWxjdWxhdGlvbnMuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICAgKi9cbiAgICBzZXQgZXhjbHVkZUZyb21MYXlvdXQodmFsdWUpIHtcbiAgICAgICAgaWYgKHZhbHVlICE9PSB0aGlzLl9leGNsdWRlRnJvbUxheW91dCkge1xuICAgICAgICAgICAgdGhpcy5fZXhjbHVkZUZyb21MYXlvdXQgPSB2YWx1ZTtcbiAgICAgICAgICAgIHRoaXMuZmlyZSgncmVzaXplJyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBnZXQgZXhjbHVkZUZyb21MYXlvdXQoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9leGNsdWRlRnJvbUxheW91dDtcbiAgICB9XG59XG5cbmV4cG9ydCB7IExheW91dENoaWxkQ29tcG9uZW50IH07XG4iXSwibmFtZXMiOlsiTGF5b3V0Q2hpbGRDb21wb25lbnQiLCJDb21wb25lbnQiLCJjb25zdHJ1Y3RvciIsInN5c3RlbSIsImVudGl0eSIsIl9taW5XaWR0aCIsIl9taW5IZWlnaHQiLCJfbWF4V2lkdGgiLCJfbWF4SGVpZ2h0IiwiX2ZpdFdpZHRoUHJvcG9ydGlvbiIsIl9maXRIZWlnaHRQcm9wb3J0aW9uIiwiX2V4Y2x1ZGVGcm9tTGF5b3V0IiwibWluV2lkdGgiLCJ2YWx1ZSIsImZpcmUiLCJtaW5IZWlnaHQiLCJtYXhXaWR0aCIsIm1heEhlaWdodCIsImZpdFdpZHRoUHJvcG9ydGlvbiIsImZpdEhlaWdodFByb3BvcnRpb24iLCJleGNsdWRlRnJvbUxheW91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
