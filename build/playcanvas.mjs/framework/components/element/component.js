import { Debug } from '../../../core/debug.js';
import { TRACE_ID_ELEMENT } from '../../../core/constants.js';
import { Mat4 } from '../../../core/math/mat4.js';
import { Vec2 } from '../../../core/math/vec2.js';
import { Vec3 } from '../../../core/math/vec3.js';
import { Vec4 } from '../../../core/math/vec4.js';
import { FUNC_EQUAL, STENCILOP_INCREMENT, FUNC_ALWAYS, STENCILOP_REPLACE } from '../../../platform/graphics/constants.js';
import { LAYERID_UI } from '../../../scene/constants.js';
import { BatchGroup } from '../../../scene/batching/batch-group.js';
import { StencilParameters } from '../../../platform/graphics/stencil-parameters.js';
import { Entity } from '../../entity.js';
import { Component } from '../component.js';
import { ELEMENTTYPE_GROUP, FITMODE_STRETCH, ELEMENTTYPE_IMAGE, ELEMENTTYPE_TEXT } from './constants.js';
import { ImageElement } from './image-element.js';
import { TextElement } from './text-element.js';

const position = new Vec3();
const invParentWtm = new Mat4();
const vecA = new Vec3();
const vecB = new Vec3();
const matA = new Mat4();
const matB = new Mat4();
const matC = new Mat4();
const matD = new Mat4();

/**
 * ElementComponents are used to construct user interfaces. An ElementComponent's [type](#type)
 * property can be configured in 3 main ways: as a text element, as an image element or as a group
 * element. If the ElementComponent has a {@link ScreenComponent} ancestor in the hierarchy, it
 * will be transformed with respect to the coordinate system of the screen. If there is no
 * {@link ScreenComponent} ancestor, the ElementComponent will be transformed like any other
 * entity.
 *
 * You should never need to use the ElementComponent constructor. To add an ElementComponent to a
 * {@link Entity}, use {@link Entity#addComponent}:
 *
 * ```javascript
 * // Add an element component to an entity with the default options
 * let entity = pc.Entity();
 * entity.addComponent("element"); // This defaults to a 'group' element
 * ```
 *
 * To create a simple text-based element:
 *
 * ```javascript
 * entity.addComponent("element", {
 *     anchor: new pc.Vec4(0.5, 0.5, 0.5, 0.5), // centered anchor
 *     fontAsset: fontAsset,
 *     fontSize: 128,
 *     pivot: new pc.Vec2(0.5, 0.5),            // centered pivot
 *     text: "Hello World!",
 *     type: pc.ELEMENTTYPE_TEXT
 * });
 * ```
 *
 * Once the ElementComponent is added to the entity, you can set and get any of its properties:
 *
 * ```javascript
 * entity.element.color = pc.Color.RED; // Set the element's color to red
 *
 * console.log(entity.element.color);   // Get the element's color and print it
 * ```
 *
 * Relevant 'Engine-only' examples:
 * - [Basic text rendering](http://playcanvas.github.io/#user-interface/text-basic)
 * - [Rendering text outlines](http://playcanvas.github.io/#user-interface/text-outline)
 * - [Adding drop shadows to text](http://playcanvas.github.io/#user-interface/text-drop-shadow)
 * - [Coloring text with markup](http://playcanvas.github.io/#user-interface/text-markup)
 * - [Wrapping text](http://playcanvas.github.io/#user-interface/text-wrap)
 * - [Typewriter text](http://playcanvas.github.io/#user-interface/text-typewriter)
 *
 * @property {import('../../../core/math/color.js').Color} color The color of the image for
 * {@link ELEMENTTYPE_IMAGE} types or the color of the text for {@link ELEMENTTYPE_TEXT} types.
 * @property {number} opacity The opacity of the image for {@link ELEMENTTYPE_IMAGE} types or the
 * text for {@link ELEMENTTYPE_TEXT} types.
 * @property {import('../../../core/math/color.js').Color} outlineColor The text outline effect
 * color and opacity. Only works for {@link ELEMENTTYPE_TEXT} types.
 * @property {number} outlineThickness The width of the text outline effect. Only works for
 * {@link ELEMENTTYPE_TEXT} types.
 * @property {import('../../../core/math/color.js').Color} shadowColor The text shadow effect color
 * and opacity. Only works for {@link ELEMENTTYPE_TEXT} types.
 * @property {Vec2} shadowOffset The text shadow effect shift amount from original text. Only works
 * for {@link ELEMENTTYPE_TEXT} types.
 * @property {boolean} autoWidth Automatically set the width of the component to be the same as the
 * textWidth. Only works for {@link ELEMENTTYPE_TEXT} types.
 * @property {boolean} autoHeight Automatically set the height of the component to be the same as
 * the textHeight. Only works for {@link ELEMENTTYPE_TEXT} types.
 * @property {string} fitMode Set how the content should be fitted and preserve the aspect ratio of
 * the source texture or sprite. Only works for {@link ELEMENTTYPE_IMAGE} types.
 * @property {number} fontAsset The id of the font asset used for rendering the text. Only works
 * for {@link ELEMENTTYPE_TEXT} types.
 * @property {import('../../font/font.js').Font} font The font used for rendering the text. Only
 * works for {@link ELEMENTTYPE_TEXT} types.
 * @property {number} fontSize The size of the font. Only works for {@link ELEMENTTYPE_TEXT} types.
 * @property {boolean} autoFitWidth When true the font size and line height will scale so that the
 * text fits inside the width of the Element. The font size will be scaled between minFontSize and
 * maxFontSize. The value of autoFitWidth will be ignored if autoWidth is true.
 * @property {boolean} autoFitHeight When true the font size and line height will scale so that the
 * text fits inside the height of the Element. The font size will be scaled between minFontSize and
 * maxFontSize. The value of autoFitHeight will be ignored if autoHeight is true.
 * @property {number} minFontSize The minimum size that the font can scale to when autoFitWidth or
 * autoFitHeight are true.
 * @property {number} maxFontSize The maximum size that the font can scale to when autoFitWidth or
 * autoFitHeight are true.
 * @property {number} spacing The spacing between the letters of the text. Only works for
 * {@link ELEMENTTYPE_TEXT} types.
 * @property {number} lineHeight The height of each line of text. Only works for
 * {@link ELEMENTTYPE_TEXT} types.
 * @property {boolean} wrapLines Whether to automatically wrap lines based on the element width.
 * Only works for {@link ELEMENTTYPE_TEXT} types, and when autoWidth is set to false.
 * @property {number} maxLines The maximum number of lines that the Element can wrap to. Any
 * leftover text will be appended to the last line. Set this to null to allow unlimited lines.
 * @property {Vec2} alignment The horizontal and vertical alignment of the text. Values range from
 * 0 to 1 where [0,0] is the bottom left and [1,1] is the top right.  Only works for
 * {@link ELEMENTTYPE_TEXT} types.
 * @property {string} text The text to render. Only works for {@link ELEMENTTYPE_TEXT} types. To
 * override certain text styling properties on a per-character basis, the text can optionally
 * include markup tags contained within square brackets. Supported tags are:
 *
 * 1. `color` - override the element's `color` property. Examples:
 * - `[color="#ff0000"]red text[/color]`
 * - `[color="#00ff00"]green text[/color]`
 * - `[color="#0000ff"]blue text[/color]`
 * 2. `outline` - override the element's `outlineColor` and `outlineThickness` properties. Example:
 * - `[outline color="#ffffff" thickness="0.5"]text[/outline]`
 * 3. `shadow` - override the element's `shadowColor` and `shadowOffset` properties. Examples:
 * - `[shadow color="#ffffff" offset="0.5"]text[/shadow]`
 * - `[shadow color="#000000" offsetX="0.1" offsetY="0.2"]text[/shadow]`
 *
 * Note that markup tags are only processed if the text element's `enableMarkup` property is set to
 * true.
 * @property {string} key The localization key to use to get the localized text from
 * {@link Application#i18n}. Only works for {@link ELEMENTTYPE_TEXT} types.
 * @property {number} textureAsset The id of the texture asset to render. Only works for
 * {@link ELEMENTTYPE_IMAGE} types.
 * @property {import('../../../platform/graphics/texture.js').Texture} texture The texture to
 * render. Only works for {@link ELEMENTTYPE_IMAGE} types.
 * @property {number} spriteAsset The id of the sprite asset to render. Only works for
 * {@link ELEMENTTYPE_IMAGE} types which can render either a texture or a sprite.
 * @property {import('../../../scene/sprite.js').Sprite} sprite The sprite to render. Only works
 * for {@link ELEMENTTYPE_IMAGE} types which can render either a texture or a sprite.
 * @property {number} spriteFrame The frame of the sprite to render. Only works for
 * {@link ELEMENTTYPE_IMAGE} types who have a sprite assigned.
 * @property {number} pixelsPerUnit The number of pixels that map to one PlayCanvas unit. Only
 * works for {@link ELEMENTTYPE_IMAGE} types who have a sliced sprite assigned.
 * @property {number} materialAsset The id of the material asset to use when rendering an image.
 * Only works for {@link ELEMENTTYPE_IMAGE} types.
 * @property {import('../../../scene/materials/material.js').Material} material The material to use
 * when rendering an image. Only works for {@link ELEMENTTYPE_IMAGE} types.
 * @property {Vec4} rect Specifies which region of the texture to use in order to render an image.
 * Values range from 0 to 1 and indicate u, v, width, height. Only works for
 * {@link ELEMENTTYPE_IMAGE} types.
 * @property {boolean} rtlReorder Reorder the text for RTL languages using a function registered
 * by `app.systems.element.registerUnicodeConverter`.
 * @property {boolean} unicodeConverter Convert unicode characters using a function registered by
 * `app.systems.element.registerUnicodeConverter`.
 * @property {boolean} enableMarkup Flag for enabling markup processing. Only works for
 * {@link ELEMENTTYPE_TEXT} types. Defaults to false.
 * @property {number} rangeStart Index of the first character to render. Only works for
 * {@link ELEMENTTYPE_TEXT} types.
 * @property {number} rangeEnd Index of the last character to render. Only works for
 * {@link ELEMENTTYPE_TEXT} types.
 * @property {boolean} mask Switch Image Element into a mask. Masks do not render into the scene,
 * but instead limit child elements to only be rendered where this element is rendered.
 * @augments Component
 * @category User Interface
 */
class ElementComponent extends Component {
  /**
   * Create a new ElementComponent instance.
   *
   * @param {import('./system.js').ElementComponentSystem} system - The ComponentSystem that
   * created this Component.
   * @param {Entity} entity - The Entity that this Component is attached to.
   */
  constructor(system, entity) {
    super(system, entity);

    // set to true by the ElementComponentSystem while
    // the component is being initialized
    this._beingInitialized = false;
    this._anchor = new Vec4();
    this._localAnchor = new Vec4();
    this._pivot = new Vec2();
    this._width = this._calculatedWidth = 32;
    this._height = this._calculatedHeight = 32;
    this._margin = new Vec4(0, 0, -32, -32);

    // the model transform used to render
    this._modelTransform = new Mat4();
    this._screenToWorld = new Mat4();

    // transform that updates local position according to anchor values
    this._anchorTransform = new Mat4();
    this._anchorDirty = true;

    // transforms to calculate screen coordinates
    this._parentWorldTransform = new Mat4();
    this._screenTransform = new Mat4();

    // the corners of the element relative to its screen component.
    // Order is bottom left, bottom right, top right, top left
    this._screenCorners = [new Vec3(), new Vec3(), new Vec3(), new Vec3()];

    // canvas-space corners of the element.
    // Order is bottom left, bottom right, top right, top left
    this._canvasCorners = [new Vec2(), new Vec2(), new Vec2(), new Vec2()];

    // the world-space corners of the element
    // Order is bottom left, bottom right, top right, top left
    this._worldCorners = [new Vec3(), new Vec3(), new Vec3(), new Vec3()];
    this._cornersDirty = true;
    this._canvasCornersDirty = true;
    this._worldCornersDirty = true;
    this.entity.on('insert', this._onInsert, this);
    this._patch();

    /**
     * The Entity with a {@link ScreenComponent} that this component belongs to. This is
     * automatically set when the component is a child of a ScreenComponent.
     *
     * @type {Entity|null}
     */
    this.screen = null;
    this._type = ELEMENTTYPE_GROUP;

    // element types
    this._image = null;
    this._text = null;
    this._group = null;
    this._drawOrder = 0;

    // Fit mode
    this._fitMode = FITMODE_STRETCH;

    // input related
    this._useInput = false;
    this._layers = [LAYERID_UI]; // assign to the default UI layer
    this._addedModels = []; // store models that have been added to layer so we can re-add when layer is changed

    this._batchGroupId = -1;
    this._batchGroup = null;

    //

    this._offsetReadAt = 0;
    this._maskOffset = 0.5;
    this._maskedBy = null; // the entity that is masking this element
  }

  /**
   * Fired when the mouse is pressed while the cursor is on the component. Only fired when
   * useInput is true.
   *
   * @event ElementComponent#mousedown
   * @param {import('../../input/element-input.js').ElementMouseEvent} event - The event.
   */

  /**
   * Fired when the mouse is released while the cursor is on the component. Only fired when
   * useInput is true.
   *
   * @event ElementComponent#mouseup
   * @param {import('../../input/element-input.js').ElementMouseEvent} event - The event.
   */

  /**
   * Fired when the mouse cursor enters the component. Only fired when useInput is true.
   *
   * @event ElementComponent#mouseenter
   * @param {import('../../input/element-input.js').ElementMouseEvent} event - The event.
   */

  /**
   * Fired when the mouse cursor leaves the component. Only fired when useInput is true.
   *
   * @event ElementComponent#mouseleave
   * @param {import('../../input/element-input.js').ElementMouseEvent} event - The event.
   */

  /**
   * Fired when the mouse cursor is moved on the component. Only fired when useInput is true.
   *
   * @event ElementComponent#mousemove
   * @param {import('../../input/element-input.js').ElementMouseEvent} event - The event.
   */

  /**
   * Fired when the mouse wheel is scrolled on the component. Only fired when useInput is true.
   *
   * @event ElementComponent#mousewheel
   * @param {import('../../input/element-input.js').ElementMouseEvent} event - The event.
   */

  /**
   * Fired when the mouse is pressed and released on the component or when a touch starts and
   * ends on the component. Only fired when useInput is true.
   *
   * @event ElementComponent#click
   * @param {import('../../input/element-input.js').ElementMouseEvent|import('../../input/element-input.js').ElementTouchEvent} event - The event.
   */

  /**
   * Fired when a touch starts on the component. Only fired when useInput is true.
   *
   * @event ElementComponent#touchstart
   * @param {import('../../input/element-input.js').ElementTouchEvent} event - The event.
   */

  /**
   * Fired when a touch ends on the component. Only fired when useInput is true.
   *
   * @event ElementComponent#touchend
   * @param {import('../../input/element-input.js').ElementTouchEvent} event - The event.
   */

  /**
   * Fired when a touch moves after it started touching the component. Only fired when useInput
   * is true.
   *
   * @event ElementComponent#touchmove
   * @param {import('../../input/element-input.js').ElementTouchEvent} event - The event.
   */

  /**
   * Fired when a touch is canceled on the component. Only fired when useInput is true.
   *
   * @event ElementComponent#touchcancel
   * @param {import('../../input/element-input.js').ElementTouchEvent} event - The event.
   */

  /**
   * @type {number}
   * @private
   */
  get _absLeft() {
    return this._localAnchor.x + this._margin.x;
  }

  /**
   * @type {number}
   * @private
   */
  get _absRight() {
    return this._localAnchor.z - this._margin.z;
  }

  /**
   * @type {number}
   * @private
   */
  get _absTop() {
    return this._localAnchor.w - this._margin.w;
  }

  /**
   * @type {number}
   * @private
   */
  get _absBottom() {
    return this._localAnchor.y + this._margin.y;
  }

  /**
   * @type {boolean}
   * @private
   */
  get _hasSplitAnchorsX() {
    return Math.abs(this._anchor.x - this._anchor.z) > 0.001;
  }

  /**
   * @type {boolean}
   * @private
   */
  get _hasSplitAnchorsY() {
    return Math.abs(this._anchor.y - this._anchor.w) > 0.001;
  }
  get aabb() {
    if (this._image) return this._image.aabb;
    if (this._text) return this._text.aabb;
    return null;
  }

  /**
   * Specifies where the left, bottom, right and top edges of the component are anchored relative
   * to its parent. Each value ranges from 0 to 1. e.g. a value of [0, 0, 0, 0] means that the
   * element will be anchored to the bottom left of its parent. A value of [1, 1, 1, 1] means it
   * will be anchored to the top right. A split anchor is when the left-right or top-bottom pairs
   * of the anchor are not equal. In that case the component will be resized to cover that entire
   * area. e.g. a value of [0, 0, 1, 1] will make the component resize exactly as its parent.
   *
   * @example
   * pc.app.root.findByName("Inventory").element.anchor = new pc.Vec4(Math.random() * 0.1, 0, 1, 0);
   * @example
   * pc.app.root.findByName("Inventory").element.anchor = [Math.random() * 0.1, 0, 1, 0];
   *
   * @type {Vec4 | number[]}
   */
  set anchor(value) {
    if (value instanceof Vec4) {
      this._anchor.copy(value);
    } else {
      this._anchor.set(...value);
    }
    if (!this.entity._parent && !this.screen) {
      this._calculateLocalAnchors();
    } else {
      this._calculateSize(this._hasSplitAnchorsX, this._hasSplitAnchorsY);
    }
    this._anchorDirty = true;
    if (!this.entity._dirtyLocal) this.entity._dirtifyLocal();
    this.fire('set:anchor', this._anchor);
  }
  get anchor() {
    return this._anchor;
  }

  /**
   * Assign element to a specific batch group (see {@link BatchGroup}). Default is -1 (no group).
   *
   * @type {number}
   */
  set batchGroupId(value) {
    if (this._batchGroupId === value) return;
    if (this.entity.enabled && this._batchGroupId >= 0) {
      var _this$system$app$batc;
      (_this$system$app$batc = this.system.app.batcher) == null ? void 0 : _this$system$app$batc.remove(BatchGroup.ELEMENT, this.batchGroupId, this.entity);
    }
    if (this.entity.enabled && value >= 0) {
      var _this$system$app$batc2;
      (_this$system$app$batc2 = this.system.app.batcher) == null ? void 0 : _this$system$app$batc2.insert(BatchGroup.ELEMENT, value, this.entity);
    }
    if (value < 0 && this._batchGroupId >= 0 && this.enabled && this.entity.enabled) {
      // re-add model to scene, in case it was removed by batching
      if (this._image && this._image._renderable.model) {
        this.addModelToLayers(this._image._renderable.model);
      } else if (this._text && this._text._model) {
        this.addModelToLayers(this._text._model);
      }
    }
    this._batchGroupId = value;
  }
  get batchGroupId() {
    return this._batchGroupId;
  }

  /**
   * The distance from the bottom edge of the anchor. Can be used in combination with a split
   * anchor to make the component's top edge always be 'top' units away from the top.
   *
   * @type {number}
   */
  set bottom(value) {
    this._margin.y = value;
    const p = this.entity.getLocalPosition();
    const wt = this._absTop;
    const wb = this._localAnchor.y + value;
    this._setHeight(wt - wb);
    p.y = value + this._calculatedHeight * this._pivot.y;
    this.entity.setLocalPosition(p);
  }
  get bottom() {
    return this._margin.y;
  }

  /**
   * The width at which the element will be rendered. In most cases this will be the same as
   * `width`. However, in some cases the engine may calculate a different width for the element,
   * such as when the element is under the control of a {@link LayoutGroupComponent}. In these
   * scenarios, `calculatedWidth` may be smaller or larger than the width that was set in the
   * editor.
   *
   * @type {number}
   */
  set calculatedWidth(value) {
    this._setCalculatedWidth(value, true);
  }
  get calculatedWidth() {
    return this._calculatedWidth;
  }

  /**
   * The height at which the element will be rendered. In most cases this will be the same as
   * `height`. However, in some cases the engine may calculate a different height for the element,
   * such as when the element is under the control of a {@link LayoutGroupComponent}. In these
   * scenarios, `calculatedHeight` may be smaller or larger than the height that was set in the
   * editor.
   *
   * @type {number}
   */
  set calculatedHeight(value) {
    this._setCalculatedHeight(value, true);
  }
  get calculatedHeight() {
    return this._calculatedHeight;
  }

  /**
   * An array of 4 {@link Vec2}s that represent the bottom left, bottom right, top right and top
   * left corners of the component in canvas pixels. Only works for screen space element
   * components.
   *
   * @type {Vec2[]}
   */
  get canvasCorners() {
    if (!this._canvasCornersDirty || !this.screen || !this.screen.screen.screenSpace) return this._canvasCorners;
    const device = this.system.app.graphicsDevice;
    const screenCorners = this.screenCorners;
    const sx = device.canvas.clientWidth / device.width;
    const sy = device.canvas.clientHeight / device.height;

    // scale screen corners to canvas size and reverse y
    for (let i = 0; i < 4; i++) {
      this._canvasCorners[i].set(screenCorners[i].x * sx, (device.height - screenCorners[i].y) * sy);
    }
    this._canvasCornersDirty = false;
    return this._canvasCorners;
  }

  /**
   * The draw order of the component. A higher value means that the component will be rendered on
   * top of other components.
   *
   * @type {number}
   */
  set drawOrder(value) {
    let priority = 0;
    if (this.screen) {
      priority = this.screen.screen.priority;
    }
    if (value > 0xFFFFFF) {
      Debug.warn('Element.drawOrder larger than max size of: ' + 0xFFFFFF);
      value = 0xFFFFFF;
    }

    // screen priority is stored in the top 8 bits
    this._drawOrder = (priority << 24) + value;
    this.fire('set:draworder', this._drawOrder);
  }
  get drawOrder() {
    return this._drawOrder;
  }

  /**
   * The height of the element as set in the editor. Note that in some cases this may not reflect
   * the true height at which the element is rendered, such as when the element is under the
   * control of a {@link LayoutGroupComponent}. See `calculatedHeight` in order to ensure you are
   * reading the true height at which the element will be rendered.
   *
   * @type {number}
   */
  set height(value) {
    this._height = value;
    if (!this._hasSplitAnchorsY) {
      this._setCalculatedHeight(value, true);
    }
    this.fire('set:height', this._height);
  }
  get height() {
    return this._height;
  }

  /**
   * An array of layer IDs ({@link Layer#id}) to which this element should belong. Don't push,
   * pop, splice or modify this array, if you want to change it - set a new one instead.
   *
   * @type {number[]}
   */
  set layers(value) {
    if (this._addedModels.length) {
      for (let i = 0; i < this._layers.length; i++) {
        const layer = this.system.app.scene.layers.getLayerById(this._layers[i]);
        if (layer) {
          for (let j = 0; j < this._addedModels.length; j++) {
            layer.removeMeshInstances(this._addedModels[j].meshInstances);
          }
        }
      }
    }
    this._layers = value;
    if (!this.enabled || !this.entity.enabled || !this._addedModels.length) return;
    for (let i = 0; i < this._layers.length; i++) {
      const layer = this.system.app.scene.layers.getLayerById(this._layers[i]);
      if (layer) {
        for (let j = 0; j < this._addedModels.length; j++) {
          layer.addMeshInstances(this._addedModels[j].meshInstances);
        }
      }
    }
  }
  get layers() {
    return this._layers;
  }

  /**
   * The distance from the left edge of the anchor. Can be used in combination with a split
   * anchor to make the component's left edge always be 'left' units away from the left.
   *
   * @type {number}
   */
  set left(value) {
    this._margin.x = value;
    const p = this.entity.getLocalPosition();
    const wr = this._absRight;
    const wl = this._localAnchor.x + value;
    this._setWidth(wr - wl);
    p.x = value + this._calculatedWidth * this._pivot.x;
    this.entity.setLocalPosition(p);
  }
  get left() {
    return this._margin.x;
  }

  /**
   * The distance from the left, bottom, right and top edges of the anchor. For example if we are
   * using a split anchor like [0,0,1,1] and the margin is [0,0,0,0] then the component will be
   * the same width and height as its parent.
   *
   * @type {Vec4}
   */
  set margin(value) {
    this._margin.copy(value);
    this._calculateSize(true, true);
    this.fire('set:margin', this._margin);
  }
  get margin() {
    return this._margin;
  }

  /**
   * Get the entity that is currently masking this element.
   *
   * @type {Entity}
   * @private
   */
  get maskedBy() {
    return this._maskedBy;
  }

  /**
   * The position of the pivot of the component relative to its anchor. Each value ranges from 0
   * to 1 where [0,0] is the bottom left and [1,1] is the top right.
   *
   * @example
   * pc.app.root.findByName("Inventory").element.pivot = [Math.random() * 0.1, Math.random() * 0.1];
   * @example
   * pc.app.root.findByName("Inventory").element.pivot = new pc.Vec2(Math.random() * 0.1, Math.random() * 0.1);
   *
   * @type {Vec2 | number[]}
   */
  set pivot(value) {
    const {
      pivot,
      margin
    } = this;
    const prevX = pivot.x;
    const prevY = pivot.y;
    if (value instanceof Vec2) {
      pivot.copy(value);
    } else {
      pivot.set(...value);
    }
    const mx = margin.x + margin.z;
    const dx = pivot.x - prevX;
    margin.x += mx * dx;
    margin.z -= mx * dx;
    const my = margin.y + margin.w;
    const dy = pivot.y - prevY;
    margin.y += my * dy;
    margin.w -= my * dy;
    this._anchorDirty = true;
    this._cornersDirty = true;
    this._worldCornersDirty = true;
    this._calculateSize(false, false);

    // we need to flag children as dirty too
    // in order for them to update their position
    this._flagChildrenAsDirty();
    this.fire('set:pivot', pivot);
  }
  get pivot() {
    return this._pivot;
  }

  /**
   * The distance from the right edge of the anchor. Can be used in combination with a split
   * anchor to make the component's right edge always be 'right' units away from the right.
   *
   * @type {number}
   */
  set right(value) {
    this._margin.z = value;

    // update width
    const p = this.entity.getLocalPosition();
    const wl = this._absLeft;
    const wr = this._localAnchor.z - value;
    this._setWidth(wr - wl);

    // update position
    p.x = this._localAnchor.z - this._localAnchor.x - value - this._calculatedWidth * (1 - this._pivot.x);
    this.entity.setLocalPosition(p);
  }
  get right() {
    return this._margin.z;
  }

  /**
   * An array of 4 {@link Vec3}s that represent the bottom left, bottom right, top right and top
   * left corners of the component relative to its parent {@link ScreenComponent}.
   *
   * @type {Vec3[]}
   */
  get screenCorners() {
    if (!this._cornersDirty || !this.screen) return this._screenCorners;
    const parentBottomLeft = this.entity.parent && this.entity.parent.element && this.entity.parent.element.screenCorners[0];

    // init corners
    this._screenCorners[0].set(this._absLeft, this._absBottom, 0);
    this._screenCorners[1].set(this._absRight, this._absBottom, 0);
    this._screenCorners[2].set(this._absRight, this._absTop, 0);
    this._screenCorners[3].set(this._absLeft, this._absTop, 0);

    // transform corners to screen space
    const screenSpace = this.screen.screen.screenSpace;
    for (let i = 0; i < 4; i++) {
      this._screenTransform.transformPoint(this._screenCorners[i], this._screenCorners[i]);
      if (screenSpace) this._screenCorners[i].mulScalar(this.screen.screen.scale);
      if (parentBottomLeft) {
        this._screenCorners[i].add(parentBottomLeft);
      }
    }
    this._cornersDirty = false;
    this._canvasCornersDirty = true;
    this._worldCornersDirty = true;
    return this._screenCorners;
  }

  /**
   * The width of the text rendered by the component. Only works for {@link ELEMENTTYPE_TEXT} types.
   *
   * @type {number}
   */
  get textWidth() {
    return this._text ? this._text.width : 0;
  }

  /**
   * The height of the text rendered by the component. Only works for {@link ELEMENTTYPE_TEXT} types.
   *
   * @type {number}
   */
  get textHeight() {
    return this._text ? this._text.height : 0;
  }

  /**
   * The distance from the top edge of the anchor. Can be used in combination with a split anchor
   * to make the component's bottom edge always be 'bottom' units away from the bottom.
   *
   * @type {number}
   */
  set top(value) {
    this._margin.w = value;
    const p = this.entity.getLocalPosition();
    const wb = this._absBottom;
    const wt = this._localAnchor.w - value;
    this._setHeight(wt - wb);
    p.y = this._localAnchor.w - this._localAnchor.y - value - this._calculatedHeight * (1 - this._pivot.y);
    this.entity.setLocalPosition(p);
  }
  get top() {
    return this._margin.w;
  }

  /**
   * The type of the ElementComponent. Can be:
   *
   * - {@link ELEMENTTYPE_GROUP}: The component can be used as a layout mechanism to create groups of
   * ElementComponents e.g. panels.
   * - {@link ELEMENTTYPE_IMAGE}: The component will render an image
   * - {@link ELEMENTTYPE_TEXT}: The component will render text
   *
   * @type {string}
   */
  set type(value) {
    if (value !== this._type) {
      this._type = value;
      if (this._image) {
        this._image.destroy();
        this._image = null;
      }
      if (this._text) {
        this._text.destroy();
        this._text = null;
      }
      if (value === ELEMENTTYPE_IMAGE) {
        this._image = new ImageElement(this);
      } else if (value === ELEMENTTYPE_TEXT) {
        this._text = new TextElement(this);
      }
    }
  }
  get type() {
    return this._type;
  }

  /**
   * If true then the component will receive Mouse or Touch input events.
   *
   * @type {boolean}
   */
  set useInput(value) {
    if (this._useInput === value) return;
    this._useInput = value;
    if (this.system.app.elementInput) {
      if (value) {
        if (this.enabled && this.entity.enabled) {
          this.system.app.elementInput.addElement(this);
        }
      } else {
        this.system.app.elementInput.removeElement(this);
      }
    } else {
      if (this._useInput === true) {
        Debug.warn('Elements will not get any input events because this.system.app.elementInput is not created');
      }
    }
    this.fire('set:useInput', value);
  }
  get useInput() {
    return this._useInput;
  }

  /**
   * Set how the content should be fitted and preserve the aspect ratio of the source texture or sprite.
   * Only works for {@link ELEMENTTYPE_IMAGE} types. Can be:
   *
   * - {@link FITMODE_STRETCH}: Fit the content exactly to Element's bounding box.
   * - {@link FITMODE_CONTAIN}: Fit the content within the Element's bounding box while preserving its Aspect Ratio.
   * - {@link FITMODE_COVER}: Fit the content to cover the entire Element's bounding box while preserving its Aspect Ratio.
   *
   * @type {string}
   */
  set fitMode(value) {
    this._fitMode = value;
    this._calculateSize(true, true);
    if (this._image) {
      this._image.refreshMesh();
    }
  }
  get fitMode() {
    return this._fitMode;
  }

  /**
   * The width of the element as set in the editor. Note that in some cases this may not reflect
   * the true width at which the element is rendered, such as when the element is under the
   * control of a {@link LayoutGroupComponent}. See `calculatedWidth` in order to ensure you are
   * reading the true width at which the element will be rendered.
   *
   * @type {number}
   */
  set width(value) {
    this._width = value;
    if (!this._hasSplitAnchorsX) {
      this._setCalculatedWidth(value, true);
    }
    this.fire('set:width', this._width);
  }
  get width() {
    return this._width;
  }

  /**
   * An array of 4 {@link Vec3}s that represent the bottom left, bottom right, top right and top
   * left corners of the component in world space. Only works for 3D element components.
   *
   * @type {Vec3[]}
   */
  get worldCorners() {
    if (!this._worldCornersDirty) {
      return this._worldCorners;
    }
    if (this.screen) {
      const screenCorners = this.screenCorners;
      if (!this.screen.screen.screenSpace) {
        matA.copy(this.screen.screen._screenMatrix);

        // flip screen matrix along the horizontal axis
        matA.data[13] = -matA.data[13];

        // create transform that brings screen corners to world space
        matA.mul2(this.screen.getWorldTransform(), matA);

        // transform screen corners to world space
        for (let i = 0; i < 4; i++) {
          matA.transformPoint(screenCorners[i], this._worldCorners[i]);
        }
      }
    } else {
      const localPos = this.entity.getLocalPosition();

      // rotate and scale around pivot
      matA.setTranslate(-localPos.x, -localPos.y, -localPos.z);
      matB.setTRS(Vec3.ZERO, this.entity.getLocalRotation(), this.entity.getLocalScale());
      matC.setTranslate(localPos.x, localPos.y, localPos.z);

      // get parent world transform (but use this entity if there is no parent)
      const entity = this.entity.parent ? this.entity.parent : this.entity;
      matD.copy(entity.getWorldTransform());
      matD.mul(matC).mul(matB).mul(matA);

      // bottom left
      vecA.set(localPos.x - this.pivot.x * this.calculatedWidth, localPos.y - this.pivot.y * this.calculatedHeight, localPos.z);
      matD.transformPoint(vecA, this._worldCorners[0]);

      // bottom right
      vecA.set(localPos.x + (1 - this.pivot.x) * this.calculatedWidth, localPos.y - this.pivot.y * this.calculatedHeight, localPos.z);
      matD.transformPoint(vecA, this._worldCorners[1]);

      // top right
      vecA.set(localPos.x + (1 - this.pivot.x) * this.calculatedWidth, localPos.y + (1 - this.pivot.y) * this.calculatedHeight, localPos.z);
      matD.transformPoint(vecA, this._worldCorners[2]);

      // top left
      vecA.set(localPos.x - this.pivot.x * this.calculatedWidth, localPos.y + (1 - this.pivot.y) * this.calculatedHeight, localPos.z);
      matD.transformPoint(vecA, this._worldCorners[3]);
    }
    this._worldCornersDirty = false;
    return this._worldCorners;
  }
  _patch() {
    this.entity._sync = this._sync;
    this.entity.setPosition = this._setPosition;
    this.entity.setLocalPosition = this._setLocalPosition;
  }
  _unpatch() {
    this.entity._sync = Entity.prototype._sync;
    this.entity.setPosition = Entity.prototype.setPosition;
    this.entity.setLocalPosition = Entity.prototype.setLocalPosition;
  }

  /**
   * Patched method for setting the position.
   *
   * @param {number|Vec3} x - The x coordinate or Vec3
   * @param {number} y - The y coordinate
   * @param {number} z - The z coordinate
   * @private
   */
  _setPosition(x, y, z) {
    if (!this.element.screen) {
      Entity.prototype.setPosition.call(this, x, y, z);
      return;
    }
    if (x instanceof Vec3) {
      position.copy(x);
    } else {
      position.set(x, y, z);
    }
    this.getWorldTransform(); // ensure hierarchy is up to date
    invParentWtm.copy(this.element._screenToWorld).invert();
    invParentWtm.transformPoint(position, this.localPosition);
    if (!this._dirtyLocal) this._dirtifyLocal();
  }

  /**
   * Patched method for setting the local position.
   *
   * @param {number|Vec3} x - The x coordinate or Vec3
   * @param {number} y - The y coordinate
   * @param {number} z - The z coordinate
   * @private
   */
  _setLocalPosition(x, y, z) {
    if (x instanceof Vec3) {
      this.localPosition.copy(x);
    } else {
      this.localPosition.set(x, y, z);
    }

    // update margin
    const element = this.element;
    const p = this.localPosition;
    const pvt = element._pivot;
    element._margin.x = p.x - element._calculatedWidth * pvt.x;
    element._margin.z = element._localAnchor.z - element._localAnchor.x - element._calculatedWidth - element._margin.x;
    element._margin.y = p.y - element._calculatedHeight * pvt.y;
    element._margin.w = element._localAnchor.w - element._localAnchor.y - element._calculatedHeight - element._margin.y;
    if (!this._dirtyLocal) this._dirtifyLocal();
  }

  // this method overwrites GraphNode#sync and so operates in scope of the Entity.
  _sync() {
    const element = this.element;
    const screen = element.screen;
    if (screen) {
      if (element._anchorDirty) {
        let resx = 0;
        let resy = 0;
        let px = 0;
        let py = 1;
        if (this._parent && this._parent.element) {
          // use parent rect
          resx = this._parent.element.calculatedWidth;
          resy = this._parent.element.calculatedHeight;
          px = this._parent.element.pivot.x;
          py = this._parent.element.pivot.y;
        } else {
          // use screen rect
          const resolution = screen.screen.resolution;
          resx = resolution.x / screen.screen.scale;
          resy = resolution.y / screen.screen.scale;
        }
        element._anchorTransform.setTranslate(resx * (element.anchor.x - px), -(resy * (py - element.anchor.y)), 0);
        element._anchorDirty = false;
        element._calculateLocalAnchors();
      }

      // if element size is dirty
      // recalculate its size
      // WARNING: Order is important as calculateSize resets dirtyLocal
      // so this needs to run before resetting dirtyLocal to false below
      if (element._sizeDirty) {
        element._calculateSize(false, false);
      }
    }
    if (this._dirtyLocal) {
      this.localTransform.setTRS(this.localPosition, this.localRotation, this.localScale);

      // update margin
      const p = this.localPosition;
      const pvt = element._pivot;
      element._margin.x = p.x - element._calculatedWidth * pvt.x;
      element._margin.z = element._localAnchor.z - element._localAnchor.x - element._calculatedWidth - element._margin.x;
      element._margin.y = p.y - element._calculatedHeight * pvt.y;
      element._margin.w = element._localAnchor.w - element._localAnchor.y - element._calculatedHeight - element._margin.y;
      this._dirtyLocal = false;
    }
    if (!screen) {
      if (this._dirtyWorld) {
        element._cornersDirty = true;
        element._canvasCornersDirty = true;
        element._worldCornersDirty = true;
      }
      Entity.prototype._sync.call(this);
      return;
    }
    if (this._dirtyWorld) {
      if (this._parent === null) {
        this.worldTransform.copy(this.localTransform);
      } else {
        // transform element hierarchy
        if (this._parent.element) {
          element._screenToWorld.mul2(this._parent.element._modelTransform, element._anchorTransform);
        } else {
          element._screenToWorld.copy(element._anchorTransform);
        }
        element._modelTransform.mul2(element._screenToWorld, this.localTransform);
        if (screen) {
          element._screenToWorld.mul2(screen.screen._screenMatrix, element._screenToWorld);
          if (!screen.screen.screenSpace) {
            element._screenToWorld.mul2(screen.worldTransform, element._screenToWorld);
          }
          this.worldTransform.mul2(element._screenToWorld, this.localTransform);

          // update parent world transform
          const parentWorldTransform = element._parentWorldTransform;
          parentWorldTransform.setIdentity();
          const parent = this._parent;
          if (parent && parent.element && parent !== screen) {
            matA.setTRS(Vec3.ZERO, parent.getLocalRotation(), parent.getLocalScale());
            parentWorldTransform.mul2(parent.element._parentWorldTransform, matA);
          }

          // update element transform
          // rotate and scale around pivot
          const depthOffset = vecA;
          depthOffset.set(0, 0, this.localPosition.z);
          const pivotOffset = vecB;
          pivotOffset.set(element._absLeft + element._pivot.x * element.calculatedWidth, element._absBottom + element._pivot.y * element.calculatedHeight, 0);
          matA.setTranslate(-pivotOffset.x, -pivotOffset.y, -pivotOffset.z);
          matB.setTRS(depthOffset, this.getLocalRotation(), this.getLocalScale());
          matC.setTranslate(pivotOffset.x, pivotOffset.y, pivotOffset.z);
          element._screenTransform.mul2(element._parentWorldTransform, matC).mul(matB).mul(matA);
          element._cornersDirty = true;
          element._canvasCornersDirty = true;
          element._worldCornersDirty = true;
        } else {
          this.worldTransform.copy(element._modelTransform);
        }
      }
      this._dirtyWorld = false;
    }
  }
  _onInsert(parent) {
    // when the entity is reparented find a possible new screen and mask

    const result = this._parseUpToScreen();
    this.entity._dirtifyWorld();
    this._updateScreen(result.screen);
    this._dirtifyMask();
  }
  _dirtifyMask() {
    let current = this.entity;
    while (current) {
      // search up the hierarchy until we find an entity which has:
      // - no parent
      // - screen component on parent
      const next = current.parent;
      if ((next === null || next.screen) && current.element) {
        if (!this.system._prerender || !this.system._prerender.length) {
          this.system._prerender = [];
          this.system.app.once('prerender', this._onPrerender, this);
          Debug.trace(TRACE_ID_ELEMENT, 'register prerender');
        }
        const i = this.system._prerender.indexOf(this.entity);
        if (i >= 0) {
          this.system._prerender.splice(i, 1);
        }
        const j = this.system._prerender.indexOf(current);
        if (j < 0) {
          this.system._prerender.push(current);
        }
        Debug.trace(TRACE_ID_ELEMENT, 'set prerender root to: ' + current.name);
      }
      current = next;
    }
  }
  _onPrerender() {
    for (let i = 0; i < this.system._prerender.length; i++) {
      const mask = this.system._prerender[i];
      Debug.trace(TRACE_ID_ELEMENT, 'prerender from: ' + mask.name);

      // prevent call if element has been removed since being added
      if (mask.element) {
        const depth = 1;
        mask.element.syncMask(depth);
      }
    }
    this.system._prerender.length = 0;
  }
  _bindScreen(screen) {
    // Bind the Element to the Screen. We used to subscribe to Screen events here. However,
    // that was very slow when there are thousands of Elements. When the time comes to unbind
    // the Element from the Screen, finding the event callbacks to remove takes a considerable
    // amount of time. So instead, the Screen stores the Element component and calls its
    // functions directly.
    screen._bindElement(this);
  }
  _unbindScreen(screen) {
    screen._unbindElement(this);
  }
  _updateScreen(screen) {
    if (this.screen && this.screen !== screen) {
      this._unbindScreen(this.screen.screen);
    }
    const previousScreen = this.screen;
    this.screen = screen;
    if (this.screen) {
      this._bindScreen(this.screen.screen);
    }
    this._calculateSize(this._hasSplitAnchorsX, this._hasSplitAnchorsY);
    this.fire('set:screen', this.screen, previousScreen);
    this._anchorDirty = true;

    // update all child screens
    const children = this.entity.children;
    for (let i = 0, l = children.length; i < l; i++) {
      if (children[i].element) children[i].element._updateScreen(screen);
    }

    // calculate draw order
    if (this.screen) this.screen.screen.syncDrawOrder();
  }
  syncMask(depth) {
    const result = this._parseUpToScreen();
    this._updateMask(result.mask, depth);
  }

  // set the maskedby property to the entity that is masking this element
  // - set the stencil buffer to check the mask value
  //   so as to only render inside the mask
  //   Note: if this entity is itself a mask the stencil params
  //   will be updated in updateMask to include masking
  _setMaskedBy(mask) {
    const renderableElement = this._image || this._text;
    if (mask) {
      const ref = mask.element._image._maskRef;
      Debug.trace(TRACE_ID_ELEMENT, 'masking: ' + this.entity.name + ' with ' + ref);

      // if this is image or text, set the stencil parameters
      renderableElement == null ? void 0 : renderableElement._setStencil(new StencilParameters({
        ref: ref,
        func: FUNC_EQUAL
      }));
      this._maskedBy = mask;
    } else {
      Debug.trace(TRACE_ID_ELEMENT, 'no masking on: ' + this.entity.name);

      // remove stencil params if this is image or text
      renderableElement == null ? void 0 : renderableElement._setStencil(null);
      this._maskedBy = null;
    }
  }

  // recursively update entity's stencil params
  // to render the correct value into the stencil buffer
  _updateMask(currentMask, depth) {
    if (currentMask) {
      this._setMaskedBy(currentMask);

      // this element is also masking others
      if (this.mask) {
        const ref = currentMask.element._image._maskRef;
        const sp = new StencilParameters({
          ref: ref,
          func: FUNC_EQUAL,
          zpass: STENCILOP_INCREMENT
        });
        this._image._setStencil(sp);
        this._image._maskRef = depth;

        // increment counter to count mask depth
        depth++;
        Debug.trace(TRACE_ID_ELEMENT, 'masking from: ' + this.entity.name + ' with ' + (sp.ref + 1));
        Debug.trace(TRACE_ID_ELEMENT, 'depth++ to: ', depth);
        currentMask = this.entity;
      }

      // recurse through all children
      const children = this.entity.children;
      for (let i = 0, l = children.length; i < l; i++) {
        var _children$i$element;
        (_children$i$element = children[i].element) == null ? void 0 : _children$i$element._updateMask(currentMask, depth);
      }

      // if mask counter was increased, decrement it as we come back up the hierarchy
      if (this.mask) depth--;
    } else {
      // clearing mask
      this._setMaskedBy(null);
      if (this.mask) {
        const sp = new StencilParameters({
          ref: depth,
          func: FUNC_ALWAYS,
          zpass: STENCILOP_REPLACE
        });
        this._image._setStencil(sp);
        this._image._maskRef = depth;

        // increment mask counter to count depth of masks
        depth++;
        Debug.trace(TRACE_ID_ELEMENT, 'masking from: ' + this.entity.name + ' with ' + sp.ref);
        Debug.trace(TRACE_ID_ELEMENT, 'depth++ to: ', depth);
        currentMask = this.entity;
      }

      // recurse through all children
      const children = this.entity.children;
      for (let i = 0, l = children.length; i < l; i++) {
        var _children$i$element2;
        (_children$i$element2 = children[i].element) == null ? void 0 : _children$i$element2._updateMask(currentMask, depth);
      }

      // decrement mask counter as we come back up the hierarchy
      if (this.mask) depth--;
    }
  }

  // search up the parent hierarchy until we reach a screen
  // this screen is the parent screen
  // also searches for masked elements to get the relevant mask
  _parseUpToScreen() {
    const result = {
      screen: null,
      mask: null
    };
    let parent = this.entity._parent;
    while (parent && !parent.screen) {
      if (parent.element && parent.element.mask) {
        // mask entity
        if (!result.mask) result.mask = parent;
      }
      parent = parent.parent;
    }
    if (parent && parent.screen) result.screen = parent;
    return result;
  }
  _onScreenResize(res) {
    this._anchorDirty = true;
    this._cornersDirty = true;
    this._worldCornersDirty = true;
    this._calculateSize(this._hasSplitAnchorsX, this._hasSplitAnchorsY);
    this.fire('screen:set:resolution', res);
  }
  _onScreenSpaceChange() {
    this.fire('screen:set:screenspace', this.screen.screen.screenSpace);
  }
  _onScreenRemove() {
    if (this.screen) {
      if (this.screen._destroying) {
        // If the screen entity is being destroyed, we don't call
        // _updateScreen() as an optimization but we should still
        // set it to null to clean up dangling references
        this.screen = null;
      } else {
        this._updateScreen(null);
      }
    }
  }

  // store pixel positions of anchor relative to current parent resolution
  _calculateLocalAnchors() {
    let resx = 1000;
    let resy = 1000;
    const parent = this.entity._parent;
    if (parent && parent.element) {
      resx = parent.element.calculatedWidth;
      resy = parent.element.calculatedHeight;
    } else if (this.screen) {
      const res = this.screen.screen.resolution;
      const scale = this.screen.screen.scale;
      resx = res.x / scale;
      resy = res.y / scale;
    }
    this._localAnchor.set(this._anchor.x * resx, this._anchor.y * resy, this._anchor.z * resx, this._anchor.w * resy);
  }

  // internal - apply offset x,y to local position and find point in world space
  getOffsetPosition(x, y) {
    const p = this.entity.getLocalPosition().clone();
    p.x += x;
    p.y += y;
    this._screenToWorld.transformPoint(p, p);
    return p;
  }
  onLayersChanged(oldComp, newComp) {
    this.addModelToLayers(this._image ? this._image._renderable.model : this._text._model);
    oldComp.off('add', this.onLayerAdded, this);
    oldComp.off('remove', this.onLayerRemoved, this);
    newComp.on('add', this.onLayerAdded, this);
    newComp.on('remove', this.onLayerRemoved, this);
  }
  onLayerAdded(layer) {
    const index = this.layers.indexOf(layer.id);
    if (index < 0) return;
    if (this._image) {
      layer.addMeshInstances(this._image._renderable.model.meshInstances);
    } else if (this._text) {
      layer.addMeshInstances(this._text._model.meshInstances);
    }
  }
  onLayerRemoved(layer) {
    const index = this.layers.indexOf(layer.id);
    if (index < 0) return;
    if (this._image) {
      layer.removeMeshInstances(this._image._renderable.model.meshInstances);
    } else if (this._text) {
      layer.removeMeshInstances(this._text._model.meshInstances);
    }
  }
  onEnable() {
    if (this._image) this._image.onEnable();
    if (this._text) this._text.onEnable();
    if (this._group) this._group.onEnable();
    if (this.useInput && this.system.app.elementInput) {
      this.system.app.elementInput.addElement(this);
    }
    this.system.app.scene.on('set:layers', this.onLayersChanged, this);
    if (this.system.app.scene.layers) {
      this.system.app.scene.layers.on('add', this.onLayerAdded, this);
      this.system.app.scene.layers.on('remove', this.onLayerRemoved, this);
    }
    if (this._batchGroupId >= 0) {
      var _this$system$app$batc3;
      (_this$system$app$batc3 = this.system.app.batcher) == null ? void 0 : _this$system$app$batc3.insert(BatchGroup.ELEMENT, this.batchGroupId, this.entity);
    }
    this.fire('enableelement');
  }
  onDisable() {
    this.system.app.scene.off('set:layers', this.onLayersChanged, this);
    if (this.system.app.scene.layers) {
      this.system.app.scene.layers.off('add', this.onLayerAdded, this);
      this.system.app.scene.layers.off('remove', this.onLayerRemoved, this);
    }
    if (this._image) this._image.onDisable();
    if (this._text) this._text.onDisable();
    if (this._group) this._group.onDisable();
    if (this.system.app.elementInput && this.useInput) {
      this.system.app.elementInput.removeElement(this);
    }
    if (this._batchGroupId >= 0) {
      var _this$system$app$batc4;
      (_this$system$app$batc4 = this.system.app.batcher) == null ? void 0 : _this$system$app$batc4.remove(BatchGroup.ELEMENT, this.batchGroupId, this.entity);
    }
    this.fire('disableelement');
  }
  onRemove() {
    this.entity.off('insert', this._onInsert, this);
    this._unpatch();
    if (this._image) this._image.destroy();
    if (this._text) this._text.destroy();
    if (this.system.app.elementInput && this.useInput) {
      this.system.app.elementInput.removeElement(this);
    }

    // if there is a screen, update draw-order
    if (this.screen && this.screen.screen) {
      this._unbindScreen(this.screen.screen);
      this.screen.screen.syncDrawOrder();
    }
    this.off();
  }

  /**
   * Recalculates these properties:
   *   - `_localAnchor`
   *   - `width`
   *   - `height`
   *   - Local position is updated if anchors are split
   *
   * Assumes these properties are up to date:
   *   - `_margin`
   *
   * @param {boolean} propagateCalculatedWidth - If true, call `_setWidth` instead
   * of `_setCalculatedWidth`
   * @param {boolean} propagateCalculatedHeight - If true, call `_setHeight` instead
   * of `_setCalculatedHeight`
   * @private
   */
  _calculateSize(propagateCalculatedWidth, propagateCalculatedHeight) {
    // can't calculate if local anchors are wrong
    if (!this.entity._parent && !this.screen) return;
    this._calculateLocalAnchors();
    const newWidth = this._absRight - this._absLeft;
    const newHeight = this._absTop - this._absBottom;
    if (propagateCalculatedWidth) {
      this._setWidth(newWidth);
    } else {
      this._setCalculatedWidth(newWidth, false);
    }
    if (propagateCalculatedHeight) {
      this._setHeight(newHeight);
    } else {
      this._setCalculatedHeight(newHeight, false);
    }
    const p = this.entity.getLocalPosition();
    p.x = this._margin.x + this._calculatedWidth * this._pivot.x;
    p.y = this._margin.y + this._calculatedHeight * this._pivot.y;
    this.entity.setLocalPosition(p);
    this._sizeDirty = false;
  }

  /**
   * Internal set width without updating margin.
   *
   * @param {number} w - The new width.
   * @private
   */
  _setWidth(w) {
    this._width = w;
    this._setCalculatedWidth(w, false);
    this.fire('set:width', this._width);
  }

  /**
   * Internal set height without updating margin.
   *
   * @param {number} h - The new height.
   * @private
   */
  _setHeight(h) {
    this._height = h;
    this._setCalculatedHeight(h, false);
    this.fire('set:height', this._height);
  }

  /**
   * This method sets the calculated width value and optionally updates the margins.
   *
   * @param {number} value - The new calculated width.
   * @param {boolean} updateMargins - Update margins or not.
   * @private
   */
  _setCalculatedWidth(value, updateMargins) {
    if (Math.abs(value - this._calculatedWidth) <= 1e-4) return;
    this._calculatedWidth = value;
    this.entity._dirtifyLocal();
    if (updateMargins) {
      const p = this.entity.getLocalPosition();
      const pvt = this._pivot;
      this._margin.x = p.x - this._calculatedWidth * pvt.x;
      this._margin.z = this._localAnchor.z - this._localAnchor.x - this._calculatedWidth - this._margin.x;
    }
    this._flagChildrenAsDirty();
    this.fire('set:calculatedWidth', this._calculatedWidth);
    this.fire('resize', this._calculatedWidth, this._calculatedHeight);
  }

  /**
   * This method sets the calculated height value and optionally updates the margins.
   *
   * @param {number} value - The new calculated height.
   * @param {boolean} updateMargins - Update margins or not.
   * @private
   */
  _setCalculatedHeight(value, updateMargins) {
    if (Math.abs(value - this._calculatedHeight) <= 1e-4) return;
    this._calculatedHeight = value;
    this.entity._dirtifyLocal();
    if (updateMargins) {
      const p = this.entity.getLocalPosition();
      const pvt = this._pivot;
      this._margin.y = p.y - this._calculatedHeight * pvt.y;
      this._margin.w = this._localAnchor.w - this._localAnchor.y - this._calculatedHeight - this._margin.y;
    }
    this._flagChildrenAsDirty();
    this.fire('set:calculatedHeight', this._calculatedHeight);
    this.fire('resize', this._calculatedWidth, this._calculatedHeight);
  }
  _flagChildrenAsDirty() {
    const c = this.entity._children;
    for (let i = 0, l = c.length; i < l; i++) {
      if (c[i].element) {
        c[i].element._anchorDirty = true;
        c[i].element._sizeDirty = true;
      }
    }
  }
  addModelToLayers(model) {
    this._addedModels.push(model);
    for (let i = 0; i < this.layers.length; i++) {
      const layer = this.system.app.scene.layers.getLayerById(this.layers[i]);
      if (!layer) continue;
      layer.addMeshInstances(model.meshInstances);
    }
  }
  removeModelFromLayers(model) {
    const idx = this._addedModels.indexOf(model);
    if (idx >= 0) {
      this._addedModels.splice(idx, 1);
    }
    for (let i = 0; i < this.layers.length; i++) {
      const layer = this.system.app.scene.layers.getLayerById(this.layers[i]);
      if (!layer) continue;
      layer.removeMeshInstances(model.meshInstances);
    }
  }
  getMaskOffset() {
    // reset offset on new frame
    // we always count offset down from 0.5
    const frame = this.system.app.frame;
    if (this._offsetReadAt !== frame) {
      this._maskOffset = 0.5;
      this._offsetReadAt = frame;
    }
    const mo = this._maskOffset;
    this._maskOffset -= 0.001;
    return mo;
  }
  isVisibleForCamera(camera) {
    let clipL, clipR, clipT, clipB;
    if (this.maskedBy) {
      const corners = this.maskedBy.element.screenCorners;
      clipL = Math.min(Math.min(corners[0].x, corners[1].x), Math.min(corners[2].x, corners[3].x));
      clipR = Math.max(Math.max(corners[0].x, corners[1].x), Math.max(corners[2].x, corners[3].x));
      clipB = Math.min(Math.min(corners[0].y, corners[1].y), Math.min(corners[2].y, corners[3].y));
      clipT = Math.max(Math.max(corners[0].y, corners[1].y), Math.max(corners[2].y, corners[3].y));
    } else {
      const sw = this.system.app.graphicsDevice.width;
      const sh = this.system.app.graphicsDevice.height;
      const cameraWidth = camera._rect.z * sw;
      const cameraHeight = camera._rect.w * sh;
      clipL = camera._rect.x * sw;
      clipR = clipL + cameraWidth;
      clipT = (1 - camera._rect.y) * sh;
      clipB = clipT - cameraHeight;
    }
    const hitCorners = this.screenCorners;
    const left = Math.min(Math.min(hitCorners[0].x, hitCorners[1].x), Math.min(hitCorners[2].x, hitCorners[3].x));
    const right = Math.max(Math.max(hitCorners[0].x, hitCorners[1].x), Math.max(hitCorners[2].x, hitCorners[3].x));
    const bottom = Math.min(Math.min(hitCorners[0].y, hitCorners[1].y), Math.min(hitCorners[2].y, hitCorners[3].y));
    const top = Math.max(Math.max(hitCorners[0].y, hitCorners[1].y), Math.max(hitCorners[2].y, hitCorners[3].y));
    if (right < clipL || left > clipR || bottom > clipT || top < clipB) {
      return false;
    }
    return true;
  }
  _isScreenSpace() {
    if (this.screen && this.screen.screen) {
      return this.screen.screen.screenSpace;
    }
    return false;
  }
  _isScreenCulled() {
    if (this.screen && this.screen.screen) {
      return this.screen.screen.cull;
    }
    return false;
  }
  _dirtyBatch() {
    if (this.batchGroupId !== -1) {
      var _this$system$app$batc5;
      (_this$system$app$batc5 = this.system.app.batcher) == null ? void 0 : _this$system$app$batc5.markGroupDirty(this.batchGroupId);
    }
  }
}
function _define(name) {
  Object.defineProperty(ElementComponent.prototype, name, {
    get: function () {
      if (this._text) {
        return this._text[name];
      } else if (this._image) {
        return this._image[name];
      }
      return null;
    },
    set: function (value) {
      if (this._text) {
        if (this._text[name] !== value) {
          this._dirtyBatch();
        }
        this._text[name] = value;
      } else if (this._image) {
        if (this._image[name] !== value) {
          this._dirtyBatch();
        }
        this._image[name] = value;
      }
    }
  });
}
_define('fontSize');
_define('minFontSize');
_define('maxFontSize');
_define('maxLines');
_define('autoFitWidth');
_define('autoFitHeight');
_define('color');
_define('font');
_define('fontAsset');
_define('spacing');
_define('lineHeight');
_define('wrapLines');
_define('lines');
_define('alignment');
_define('autoWidth');
_define('autoHeight');
_define('rtlReorder');
_define('unicodeConverter');
_define('text');
_define('key');
_define('texture');
_define('textureAsset');
_define('material');
_define('materialAsset');
_define('sprite');
_define('spriteAsset');
_define('spriteFrame');
_define('pixelsPerUnit');
_define('opacity');
_define('rect');
_define('mask');
_define('outlineColor');
_define('outlineThickness');
_define('shadowColor');
_define('shadowOffset');
_define('enableMarkup');
_define('rangeStart');
_define('rangeEnd');

export { ElementComponent };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tcG9uZW50LmpzIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi9zcmMvZnJhbWV3b3JrL2NvbXBvbmVudHMvZWxlbWVudC9jb21wb25lbnQuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgRGVidWcgfSBmcm9tICcuLi8uLi8uLi9jb3JlL2RlYnVnLmpzJztcbmltcG9ydCB7IFRSQUNFX0lEX0VMRU1FTlQgfSBmcm9tICcuLi8uLi8uLi9jb3JlL2NvbnN0YW50cy5qcyc7XG5cbmltcG9ydCB7IE1hdDQgfSBmcm9tICcuLi8uLi8uLi9jb3JlL21hdGgvbWF0NC5qcyc7XG5pbXBvcnQgeyBWZWMyIH0gZnJvbSAnLi4vLi4vLi4vY29yZS9tYXRoL3ZlYzIuanMnO1xuaW1wb3J0IHsgVmVjMyB9IGZyb20gJy4uLy4uLy4uL2NvcmUvbWF0aC92ZWMzLmpzJztcbmltcG9ydCB7IFZlYzQgfSBmcm9tICcuLi8uLi8uLi9jb3JlL21hdGgvdmVjNC5qcyc7XG5cbmltcG9ydCB7IEZVTkNfQUxXQVlTLCBGVU5DX0VRVUFMLCBTVEVOQ0lMT1BfSU5DUkVNRU5ULCBTVEVOQ0lMT1BfUkVQTEFDRSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2dyYXBoaWNzL2NvbnN0YW50cy5qcyc7XG5cbmltcG9ydCB7IExBWUVSSURfVUkgfSBmcm9tICcuLi8uLi8uLi9zY2VuZS9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgQmF0Y2hHcm91cCB9IGZyb20gJy4uLy4uLy4uL3NjZW5lL2JhdGNoaW5nL2JhdGNoLWdyb3VwLmpzJztcbmltcG9ydCB7IFN0ZW5jaWxQYXJhbWV0ZXJzIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZ3JhcGhpY3Mvc3RlbmNpbC1wYXJhbWV0ZXJzLmpzJztcblxuaW1wb3J0IHsgRW50aXR5IH0gZnJvbSAnLi4vLi4vZW50aXR5LmpzJztcblxuaW1wb3J0IHsgQ29tcG9uZW50IH0gZnJvbSAnLi4vY29tcG9uZW50LmpzJztcblxuaW1wb3J0IHsgRUxFTUVOVFRZUEVfR1JPVVAsIEVMRU1FTlRUWVBFX0lNQUdFLCBFTEVNRU5UVFlQRV9URVhULCBGSVRNT0RFX1NUUkVUQ0ggfSBmcm9tICcuL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJbWFnZUVsZW1lbnQgfSBmcm9tICcuL2ltYWdlLWVsZW1lbnQuanMnO1xuaW1wb3J0IHsgVGV4dEVsZW1lbnQgfSBmcm9tICcuL3RleHQtZWxlbWVudC5qcyc7XG5cbmNvbnN0IHBvc2l0aW9uID0gbmV3IFZlYzMoKTtcbmNvbnN0IGludlBhcmVudFd0bSA9IG5ldyBNYXQ0KCk7XG5cbmNvbnN0IHZlY0EgPSBuZXcgVmVjMygpO1xuY29uc3QgdmVjQiA9IG5ldyBWZWMzKCk7XG5jb25zdCBtYXRBID0gbmV3IE1hdDQoKTtcbmNvbnN0IG1hdEIgPSBuZXcgTWF0NCgpO1xuY29uc3QgbWF0QyA9IG5ldyBNYXQ0KCk7XG5jb25zdCBtYXREID0gbmV3IE1hdDQoKTtcblxuLyoqXG4gKiBFbGVtZW50Q29tcG9uZW50cyBhcmUgdXNlZCB0byBjb25zdHJ1Y3QgdXNlciBpbnRlcmZhY2VzLiBBbiBFbGVtZW50Q29tcG9uZW50J3MgW3R5cGVdKCN0eXBlKVxuICogcHJvcGVydHkgY2FuIGJlIGNvbmZpZ3VyZWQgaW4gMyBtYWluIHdheXM6IGFzIGEgdGV4dCBlbGVtZW50LCBhcyBhbiBpbWFnZSBlbGVtZW50IG9yIGFzIGEgZ3JvdXBcbiAqIGVsZW1lbnQuIElmIHRoZSBFbGVtZW50Q29tcG9uZW50IGhhcyBhIHtAbGluayBTY3JlZW5Db21wb25lbnR9IGFuY2VzdG9yIGluIHRoZSBoaWVyYXJjaHksIGl0XG4gKiB3aWxsIGJlIHRyYW5zZm9ybWVkIHdpdGggcmVzcGVjdCB0byB0aGUgY29vcmRpbmF0ZSBzeXN0ZW0gb2YgdGhlIHNjcmVlbi4gSWYgdGhlcmUgaXMgbm9cbiAqIHtAbGluayBTY3JlZW5Db21wb25lbnR9IGFuY2VzdG9yLCB0aGUgRWxlbWVudENvbXBvbmVudCB3aWxsIGJlIHRyYW5zZm9ybWVkIGxpa2UgYW55IG90aGVyXG4gKiBlbnRpdHkuXG4gKlxuICogWW91IHNob3VsZCBuZXZlciBuZWVkIHRvIHVzZSB0aGUgRWxlbWVudENvbXBvbmVudCBjb25zdHJ1Y3Rvci4gVG8gYWRkIGFuIEVsZW1lbnRDb21wb25lbnQgdG8gYVxuICoge0BsaW5rIEVudGl0eX0sIHVzZSB7QGxpbmsgRW50aXR5I2FkZENvbXBvbmVudH06XG4gKlxuICogYGBgamF2YXNjcmlwdFxuICogLy8gQWRkIGFuIGVsZW1lbnQgY29tcG9uZW50IHRvIGFuIGVudGl0eSB3aXRoIHRoZSBkZWZhdWx0IG9wdGlvbnNcbiAqIGxldCBlbnRpdHkgPSBwYy5FbnRpdHkoKTtcbiAqIGVudGl0eS5hZGRDb21wb25lbnQoXCJlbGVtZW50XCIpOyAvLyBUaGlzIGRlZmF1bHRzIHRvIGEgJ2dyb3VwJyBlbGVtZW50XG4gKiBgYGBcbiAqXG4gKiBUbyBjcmVhdGUgYSBzaW1wbGUgdGV4dC1iYXNlZCBlbGVtZW50OlxuICpcbiAqIGBgYGphdmFzY3JpcHRcbiAqIGVudGl0eS5hZGRDb21wb25lbnQoXCJlbGVtZW50XCIsIHtcbiAqICAgICBhbmNob3I6IG5ldyBwYy5WZWM0KDAuNSwgMC41LCAwLjUsIDAuNSksIC8vIGNlbnRlcmVkIGFuY2hvclxuICogICAgIGZvbnRBc3NldDogZm9udEFzc2V0LFxuICogICAgIGZvbnRTaXplOiAxMjgsXG4gKiAgICAgcGl2b3Q6IG5ldyBwYy5WZWMyKDAuNSwgMC41KSwgICAgICAgICAgICAvLyBjZW50ZXJlZCBwaXZvdFxuICogICAgIHRleHQ6IFwiSGVsbG8gV29ybGQhXCIsXG4gKiAgICAgdHlwZTogcGMuRUxFTUVOVFRZUEVfVEVYVFxuICogfSk7XG4gKiBgYGBcbiAqXG4gKiBPbmNlIHRoZSBFbGVtZW50Q29tcG9uZW50IGlzIGFkZGVkIHRvIHRoZSBlbnRpdHksIHlvdSBjYW4gc2V0IGFuZCBnZXQgYW55IG9mIGl0cyBwcm9wZXJ0aWVzOlxuICpcbiAqIGBgYGphdmFzY3JpcHRcbiAqIGVudGl0eS5lbGVtZW50LmNvbG9yID0gcGMuQ29sb3IuUkVEOyAvLyBTZXQgdGhlIGVsZW1lbnQncyBjb2xvciB0byByZWRcbiAqXG4gKiBjb25zb2xlLmxvZyhlbnRpdHkuZWxlbWVudC5jb2xvcik7ICAgLy8gR2V0IHRoZSBlbGVtZW50J3MgY29sb3IgYW5kIHByaW50IGl0XG4gKiBgYGBcbiAqXG4gKiBSZWxldmFudCAnRW5naW5lLW9ubHknIGV4YW1wbGVzOlxuICogLSBbQmFzaWMgdGV4dCByZW5kZXJpbmddKGh0dHA6Ly9wbGF5Y2FudmFzLmdpdGh1Yi5pby8jdXNlci1pbnRlcmZhY2UvdGV4dC1iYXNpYylcbiAqIC0gW1JlbmRlcmluZyB0ZXh0IG91dGxpbmVzXShodHRwOi8vcGxheWNhbnZhcy5naXRodWIuaW8vI3VzZXItaW50ZXJmYWNlL3RleHQtb3V0bGluZSlcbiAqIC0gW0FkZGluZyBkcm9wIHNoYWRvd3MgdG8gdGV4dF0oaHR0cDovL3BsYXljYW52YXMuZ2l0aHViLmlvLyN1c2VyLWludGVyZmFjZS90ZXh0LWRyb3Atc2hhZG93KVxuICogLSBbQ29sb3JpbmcgdGV4dCB3aXRoIG1hcmt1cF0oaHR0cDovL3BsYXljYW52YXMuZ2l0aHViLmlvLyN1c2VyLWludGVyZmFjZS90ZXh0LW1hcmt1cClcbiAqIC0gW1dyYXBwaW5nIHRleHRdKGh0dHA6Ly9wbGF5Y2FudmFzLmdpdGh1Yi5pby8jdXNlci1pbnRlcmZhY2UvdGV4dC13cmFwKVxuICogLSBbVHlwZXdyaXRlciB0ZXh0XShodHRwOi8vcGxheWNhbnZhcy5naXRodWIuaW8vI3VzZXItaW50ZXJmYWNlL3RleHQtdHlwZXdyaXRlcilcbiAqXG4gKiBAcHJvcGVydHkge2ltcG9ydCgnLi4vLi4vLi4vY29yZS9tYXRoL2NvbG9yLmpzJykuQ29sb3J9IGNvbG9yIFRoZSBjb2xvciBvZiB0aGUgaW1hZ2UgZm9yXG4gKiB7QGxpbmsgRUxFTUVOVFRZUEVfSU1BR0V9IHR5cGVzIG9yIHRoZSBjb2xvciBvZiB0aGUgdGV4dCBmb3Ige0BsaW5rIEVMRU1FTlRUWVBFX1RFWFR9IHR5cGVzLlxuICogQHByb3BlcnR5IHtudW1iZXJ9IG9wYWNpdHkgVGhlIG9wYWNpdHkgb2YgdGhlIGltYWdlIGZvciB7QGxpbmsgRUxFTUVOVFRZUEVfSU1BR0V9IHR5cGVzIG9yIHRoZVxuICogdGV4dCBmb3Ige0BsaW5rIEVMRU1FTlRUWVBFX1RFWFR9IHR5cGVzLlxuICogQHByb3BlcnR5IHtpbXBvcnQoJy4uLy4uLy4uL2NvcmUvbWF0aC9jb2xvci5qcycpLkNvbG9yfSBvdXRsaW5lQ29sb3IgVGhlIHRleHQgb3V0bGluZSBlZmZlY3RcbiAqIGNvbG9yIGFuZCBvcGFjaXR5LiBPbmx5IHdvcmtzIGZvciB7QGxpbmsgRUxFTUVOVFRZUEVfVEVYVH0gdHlwZXMuXG4gKiBAcHJvcGVydHkge251bWJlcn0gb3V0bGluZVRoaWNrbmVzcyBUaGUgd2lkdGggb2YgdGhlIHRleHQgb3V0bGluZSBlZmZlY3QuIE9ubHkgd29ya3MgZm9yXG4gKiB7QGxpbmsgRUxFTUVOVFRZUEVfVEVYVH0gdHlwZXMuXG4gKiBAcHJvcGVydHkge2ltcG9ydCgnLi4vLi4vLi4vY29yZS9tYXRoL2NvbG9yLmpzJykuQ29sb3J9IHNoYWRvd0NvbG9yIFRoZSB0ZXh0IHNoYWRvdyBlZmZlY3QgY29sb3JcbiAqIGFuZCBvcGFjaXR5LiBPbmx5IHdvcmtzIGZvciB7QGxpbmsgRUxFTUVOVFRZUEVfVEVYVH0gdHlwZXMuXG4gKiBAcHJvcGVydHkge1ZlYzJ9IHNoYWRvd09mZnNldCBUaGUgdGV4dCBzaGFkb3cgZWZmZWN0IHNoaWZ0IGFtb3VudCBmcm9tIG9yaWdpbmFsIHRleHQuIE9ubHkgd29ya3NcbiAqIGZvciB7QGxpbmsgRUxFTUVOVFRZUEVfVEVYVH0gdHlwZXMuXG4gKiBAcHJvcGVydHkge2Jvb2xlYW59IGF1dG9XaWR0aCBBdXRvbWF0aWNhbGx5IHNldCB0aGUgd2lkdGggb2YgdGhlIGNvbXBvbmVudCB0byBiZSB0aGUgc2FtZSBhcyB0aGVcbiAqIHRleHRXaWR0aC4gT25seSB3b3JrcyBmb3Ige0BsaW5rIEVMRU1FTlRUWVBFX1RFWFR9IHR5cGVzLlxuICogQHByb3BlcnR5IHtib29sZWFufSBhdXRvSGVpZ2h0IEF1dG9tYXRpY2FsbHkgc2V0IHRoZSBoZWlnaHQgb2YgdGhlIGNvbXBvbmVudCB0byBiZSB0aGUgc2FtZSBhc1xuICogdGhlIHRleHRIZWlnaHQuIE9ubHkgd29ya3MgZm9yIHtAbGluayBFTEVNRU5UVFlQRV9URVhUfSB0eXBlcy5cbiAqIEBwcm9wZXJ0eSB7c3RyaW5nfSBmaXRNb2RlIFNldCBob3cgdGhlIGNvbnRlbnQgc2hvdWxkIGJlIGZpdHRlZCBhbmQgcHJlc2VydmUgdGhlIGFzcGVjdCByYXRpbyBvZlxuICogdGhlIHNvdXJjZSB0ZXh0dXJlIG9yIHNwcml0ZS4gT25seSB3b3JrcyBmb3Ige0BsaW5rIEVMRU1FTlRUWVBFX0lNQUdFfSB0eXBlcy5cbiAqIEBwcm9wZXJ0eSB7bnVtYmVyfSBmb250QXNzZXQgVGhlIGlkIG9mIHRoZSBmb250IGFzc2V0IHVzZWQgZm9yIHJlbmRlcmluZyB0aGUgdGV4dC4gT25seSB3b3Jrc1xuICogZm9yIHtAbGluayBFTEVNRU5UVFlQRV9URVhUfSB0eXBlcy5cbiAqIEBwcm9wZXJ0eSB7aW1wb3J0KCcuLi8uLi9mb250L2ZvbnQuanMnKS5Gb250fSBmb250IFRoZSBmb250IHVzZWQgZm9yIHJlbmRlcmluZyB0aGUgdGV4dC4gT25seVxuICogd29ya3MgZm9yIHtAbGluayBFTEVNRU5UVFlQRV9URVhUfSB0eXBlcy5cbiAqIEBwcm9wZXJ0eSB7bnVtYmVyfSBmb250U2l6ZSBUaGUgc2l6ZSBvZiB0aGUgZm9udC4gT25seSB3b3JrcyBmb3Ige0BsaW5rIEVMRU1FTlRUWVBFX1RFWFR9IHR5cGVzLlxuICogQHByb3BlcnR5IHtib29sZWFufSBhdXRvRml0V2lkdGggV2hlbiB0cnVlIHRoZSBmb250IHNpemUgYW5kIGxpbmUgaGVpZ2h0IHdpbGwgc2NhbGUgc28gdGhhdCB0aGVcbiAqIHRleHQgZml0cyBpbnNpZGUgdGhlIHdpZHRoIG9mIHRoZSBFbGVtZW50LiBUaGUgZm9udCBzaXplIHdpbGwgYmUgc2NhbGVkIGJldHdlZW4gbWluRm9udFNpemUgYW5kXG4gKiBtYXhGb250U2l6ZS4gVGhlIHZhbHVlIG9mIGF1dG9GaXRXaWR0aCB3aWxsIGJlIGlnbm9yZWQgaWYgYXV0b1dpZHRoIGlzIHRydWUuXG4gKiBAcHJvcGVydHkge2Jvb2xlYW59IGF1dG9GaXRIZWlnaHQgV2hlbiB0cnVlIHRoZSBmb250IHNpemUgYW5kIGxpbmUgaGVpZ2h0IHdpbGwgc2NhbGUgc28gdGhhdCB0aGVcbiAqIHRleHQgZml0cyBpbnNpZGUgdGhlIGhlaWdodCBvZiB0aGUgRWxlbWVudC4gVGhlIGZvbnQgc2l6ZSB3aWxsIGJlIHNjYWxlZCBiZXR3ZWVuIG1pbkZvbnRTaXplIGFuZFxuICogbWF4Rm9udFNpemUuIFRoZSB2YWx1ZSBvZiBhdXRvRml0SGVpZ2h0IHdpbGwgYmUgaWdub3JlZCBpZiBhdXRvSGVpZ2h0IGlzIHRydWUuXG4gKiBAcHJvcGVydHkge251bWJlcn0gbWluRm9udFNpemUgVGhlIG1pbmltdW0gc2l6ZSB0aGF0IHRoZSBmb250IGNhbiBzY2FsZSB0byB3aGVuIGF1dG9GaXRXaWR0aCBvclxuICogYXV0b0ZpdEhlaWdodCBhcmUgdHJ1ZS5cbiAqIEBwcm9wZXJ0eSB7bnVtYmVyfSBtYXhGb250U2l6ZSBUaGUgbWF4aW11bSBzaXplIHRoYXQgdGhlIGZvbnQgY2FuIHNjYWxlIHRvIHdoZW4gYXV0b0ZpdFdpZHRoIG9yXG4gKiBhdXRvRml0SGVpZ2h0IGFyZSB0cnVlLlxuICogQHByb3BlcnR5IHtudW1iZXJ9IHNwYWNpbmcgVGhlIHNwYWNpbmcgYmV0d2VlbiB0aGUgbGV0dGVycyBvZiB0aGUgdGV4dC4gT25seSB3b3JrcyBmb3JcbiAqIHtAbGluayBFTEVNRU5UVFlQRV9URVhUfSB0eXBlcy5cbiAqIEBwcm9wZXJ0eSB7bnVtYmVyfSBsaW5lSGVpZ2h0IFRoZSBoZWlnaHQgb2YgZWFjaCBsaW5lIG9mIHRleHQuIE9ubHkgd29ya3MgZm9yXG4gKiB7QGxpbmsgRUxFTUVOVFRZUEVfVEVYVH0gdHlwZXMuXG4gKiBAcHJvcGVydHkge2Jvb2xlYW59IHdyYXBMaW5lcyBXaGV0aGVyIHRvIGF1dG9tYXRpY2FsbHkgd3JhcCBsaW5lcyBiYXNlZCBvbiB0aGUgZWxlbWVudCB3aWR0aC5cbiAqIE9ubHkgd29ya3MgZm9yIHtAbGluayBFTEVNRU5UVFlQRV9URVhUfSB0eXBlcywgYW5kIHdoZW4gYXV0b1dpZHRoIGlzIHNldCB0byBmYWxzZS5cbiAqIEBwcm9wZXJ0eSB7bnVtYmVyfSBtYXhMaW5lcyBUaGUgbWF4aW11bSBudW1iZXIgb2YgbGluZXMgdGhhdCB0aGUgRWxlbWVudCBjYW4gd3JhcCB0by4gQW55XG4gKiBsZWZ0b3ZlciB0ZXh0IHdpbGwgYmUgYXBwZW5kZWQgdG8gdGhlIGxhc3QgbGluZS4gU2V0IHRoaXMgdG8gbnVsbCB0byBhbGxvdyB1bmxpbWl0ZWQgbGluZXMuXG4gKiBAcHJvcGVydHkge1ZlYzJ9IGFsaWdubWVudCBUaGUgaG9yaXpvbnRhbCBhbmQgdmVydGljYWwgYWxpZ25tZW50IG9mIHRoZSB0ZXh0LiBWYWx1ZXMgcmFuZ2UgZnJvbVxuICogMCB0byAxIHdoZXJlIFswLDBdIGlzIHRoZSBib3R0b20gbGVmdCBhbmQgWzEsMV0gaXMgdGhlIHRvcCByaWdodC4gIE9ubHkgd29ya3MgZm9yXG4gKiB7QGxpbmsgRUxFTUVOVFRZUEVfVEVYVH0gdHlwZXMuXG4gKiBAcHJvcGVydHkge3N0cmluZ30gdGV4dCBUaGUgdGV4dCB0byByZW5kZXIuIE9ubHkgd29ya3MgZm9yIHtAbGluayBFTEVNRU5UVFlQRV9URVhUfSB0eXBlcy4gVG9cbiAqIG92ZXJyaWRlIGNlcnRhaW4gdGV4dCBzdHlsaW5nIHByb3BlcnRpZXMgb24gYSBwZXItY2hhcmFjdGVyIGJhc2lzLCB0aGUgdGV4dCBjYW4gb3B0aW9uYWxseVxuICogaW5jbHVkZSBtYXJrdXAgdGFncyBjb250YWluZWQgd2l0aGluIHNxdWFyZSBicmFja2V0cy4gU3VwcG9ydGVkIHRhZ3MgYXJlOlxuICpcbiAqIDEuIGBjb2xvcmAgLSBvdmVycmlkZSB0aGUgZWxlbWVudCdzIGBjb2xvcmAgcHJvcGVydHkuIEV4YW1wbGVzOlxuICogLSBgW2NvbG9yPVwiI2ZmMDAwMFwiXXJlZCB0ZXh0Wy9jb2xvcl1gXG4gKiAtIGBbY29sb3I9XCIjMDBmZjAwXCJdZ3JlZW4gdGV4dFsvY29sb3JdYFxuICogLSBgW2NvbG9yPVwiIzAwMDBmZlwiXWJsdWUgdGV4dFsvY29sb3JdYFxuICogMi4gYG91dGxpbmVgIC0gb3ZlcnJpZGUgdGhlIGVsZW1lbnQncyBgb3V0bGluZUNvbG9yYCBhbmQgYG91dGxpbmVUaGlja25lc3NgIHByb3BlcnRpZXMuIEV4YW1wbGU6XG4gKiAtIGBbb3V0bGluZSBjb2xvcj1cIiNmZmZmZmZcIiB0aGlja25lc3M9XCIwLjVcIl10ZXh0Wy9vdXRsaW5lXWBcbiAqIDMuIGBzaGFkb3dgIC0gb3ZlcnJpZGUgdGhlIGVsZW1lbnQncyBgc2hhZG93Q29sb3JgIGFuZCBgc2hhZG93T2Zmc2V0YCBwcm9wZXJ0aWVzLiBFeGFtcGxlczpcbiAqIC0gYFtzaGFkb3cgY29sb3I9XCIjZmZmZmZmXCIgb2Zmc2V0PVwiMC41XCJddGV4dFsvc2hhZG93XWBcbiAqIC0gYFtzaGFkb3cgY29sb3I9XCIjMDAwMDAwXCIgb2Zmc2V0WD1cIjAuMVwiIG9mZnNldFk9XCIwLjJcIl10ZXh0Wy9zaGFkb3ddYFxuICpcbiAqIE5vdGUgdGhhdCBtYXJrdXAgdGFncyBhcmUgb25seSBwcm9jZXNzZWQgaWYgdGhlIHRleHQgZWxlbWVudCdzIGBlbmFibGVNYXJrdXBgIHByb3BlcnR5IGlzIHNldCB0b1xuICogdHJ1ZS5cbiAqIEBwcm9wZXJ0eSB7c3RyaW5nfSBrZXkgVGhlIGxvY2FsaXphdGlvbiBrZXkgdG8gdXNlIHRvIGdldCB0aGUgbG9jYWxpemVkIHRleHQgZnJvbVxuICoge0BsaW5rIEFwcGxpY2F0aW9uI2kxOG59LiBPbmx5IHdvcmtzIGZvciB7QGxpbmsgRUxFTUVOVFRZUEVfVEVYVH0gdHlwZXMuXG4gKiBAcHJvcGVydHkge251bWJlcn0gdGV4dHVyZUFzc2V0IFRoZSBpZCBvZiB0aGUgdGV4dHVyZSBhc3NldCB0byByZW5kZXIuIE9ubHkgd29ya3MgZm9yXG4gKiB7QGxpbmsgRUxFTUVOVFRZUEVfSU1BR0V9IHR5cGVzLlxuICogQHByb3BlcnR5IHtpbXBvcnQoJy4uLy4uLy4uL3BsYXRmb3JtL2dyYXBoaWNzL3RleHR1cmUuanMnKS5UZXh0dXJlfSB0ZXh0dXJlIFRoZSB0ZXh0dXJlIHRvXG4gKiByZW5kZXIuIE9ubHkgd29ya3MgZm9yIHtAbGluayBFTEVNRU5UVFlQRV9JTUFHRX0gdHlwZXMuXG4gKiBAcHJvcGVydHkge251bWJlcn0gc3ByaXRlQXNzZXQgVGhlIGlkIG9mIHRoZSBzcHJpdGUgYXNzZXQgdG8gcmVuZGVyLiBPbmx5IHdvcmtzIGZvclxuICoge0BsaW5rIEVMRU1FTlRUWVBFX0lNQUdFfSB0eXBlcyB3aGljaCBjYW4gcmVuZGVyIGVpdGhlciBhIHRleHR1cmUgb3IgYSBzcHJpdGUuXG4gKiBAcHJvcGVydHkge2ltcG9ydCgnLi4vLi4vLi4vc2NlbmUvc3ByaXRlLmpzJykuU3ByaXRlfSBzcHJpdGUgVGhlIHNwcml0ZSB0byByZW5kZXIuIE9ubHkgd29ya3NcbiAqIGZvciB7QGxpbmsgRUxFTUVOVFRZUEVfSU1BR0V9IHR5cGVzIHdoaWNoIGNhbiByZW5kZXIgZWl0aGVyIGEgdGV4dHVyZSBvciBhIHNwcml0ZS5cbiAqIEBwcm9wZXJ0eSB7bnVtYmVyfSBzcHJpdGVGcmFtZSBUaGUgZnJhbWUgb2YgdGhlIHNwcml0ZSB0byByZW5kZXIuIE9ubHkgd29ya3MgZm9yXG4gKiB7QGxpbmsgRUxFTUVOVFRZUEVfSU1BR0V9IHR5cGVzIHdobyBoYXZlIGEgc3ByaXRlIGFzc2lnbmVkLlxuICogQHByb3BlcnR5IHtudW1iZXJ9IHBpeGVsc1BlclVuaXQgVGhlIG51bWJlciBvZiBwaXhlbHMgdGhhdCBtYXAgdG8gb25lIFBsYXlDYW52YXMgdW5pdC4gT25seVxuICogd29ya3MgZm9yIHtAbGluayBFTEVNRU5UVFlQRV9JTUFHRX0gdHlwZXMgd2hvIGhhdmUgYSBzbGljZWQgc3ByaXRlIGFzc2lnbmVkLlxuICogQHByb3BlcnR5IHtudW1iZXJ9IG1hdGVyaWFsQXNzZXQgVGhlIGlkIG9mIHRoZSBtYXRlcmlhbCBhc3NldCB0byB1c2Ugd2hlbiByZW5kZXJpbmcgYW4gaW1hZ2UuXG4gKiBPbmx5IHdvcmtzIGZvciB7QGxpbmsgRUxFTUVOVFRZUEVfSU1BR0V9IHR5cGVzLlxuICogQHByb3BlcnR5IHtpbXBvcnQoJy4uLy4uLy4uL3NjZW5lL21hdGVyaWFscy9tYXRlcmlhbC5qcycpLk1hdGVyaWFsfSBtYXRlcmlhbCBUaGUgbWF0ZXJpYWwgdG8gdXNlXG4gKiB3aGVuIHJlbmRlcmluZyBhbiBpbWFnZS4gT25seSB3b3JrcyBmb3Ige0BsaW5rIEVMRU1FTlRUWVBFX0lNQUdFfSB0eXBlcy5cbiAqIEBwcm9wZXJ0eSB7VmVjNH0gcmVjdCBTcGVjaWZpZXMgd2hpY2ggcmVnaW9uIG9mIHRoZSB0ZXh0dXJlIHRvIHVzZSBpbiBvcmRlciB0byByZW5kZXIgYW4gaW1hZ2UuXG4gKiBWYWx1ZXMgcmFuZ2UgZnJvbSAwIHRvIDEgYW5kIGluZGljYXRlIHUsIHYsIHdpZHRoLCBoZWlnaHQuIE9ubHkgd29ya3MgZm9yXG4gKiB7QGxpbmsgRUxFTUVOVFRZUEVfSU1BR0V9IHR5cGVzLlxuICogQHByb3BlcnR5IHtib29sZWFufSBydGxSZW9yZGVyIFJlb3JkZXIgdGhlIHRleHQgZm9yIFJUTCBsYW5ndWFnZXMgdXNpbmcgYSBmdW5jdGlvbiByZWdpc3RlcmVkXG4gKiBieSBgYXBwLnN5c3RlbXMuZWxlbWVudC5yZWdpc3RlclVuaWNvZGVDb252ZXJ0ZXJgLlxuICogQHByb3BlcnR5IHtib29sZWFufSB1bmljb2RlQ29udmVydGVyIENvbnZlcnQgdW5pY29kZSBjaGFyYWN0ZXJzIHVzaW5nIGEgZnVuY3Rpb24gcmVnaXN0ZXJlZCBieVxuICogYGFwcC5zeXN0ZW1zLmVsZW1lbnQucmVnaXN0ZXJVbmljb2RlQ29udmVydGVyYC5cbiAqIEBwcm9wZXJ0eSB7Ym9vbGVhbn0gZW5hYmxlTWFya3VwIEZsYWcgZm9yIGVuYWJsaW5nIG1hcmt1cCBwcm9jZXNzaW5nLiBPbmx5IHdvcmtzIGZvclxuICoge0BsaW5rIEVMRU1FTlRUWVBFX1RFWFR9IHR5cGVzLiBEZWZhdWx0cyB0byBmYWxzZS5cbiAqIEBwcm9wZXJ0eSB7bnVtYmVyfSByYW5nZVN0YXJ0IEluZGV4IG9mIHRoZSBmaXJzdCBjaGFyYWN0ZXIgdG8gcmVuZGVyLiBPbmx5IHdvcmtzIGZvclxuICoge0BsaW5rIEVMRU1FTlRUWVBFX1RFWFR9IHR5cGVzLlxuICogQHByb3BlcnR5IHtudW1iZXJ9IHJhbmdlRW5kIEluZGV4IG9mIHRoZSBsYXN0IGNoYXJhY3RlciB0byByZW5kZXIuIE9ubHkgd29ya3MgZm9yXG4gKiB7QGxpbmsgRUxFTUVOVFRZUEVfVEVYVH0gdHlwZXMuXG4gKiBAcHJvcGVydHkge2Jvb2xlYW59IG1hc2sgU3dpdGNoIEltYWdlIEVsZW1lbnQgaW50byBhIG1hc2suIE1hc2tzIGRvIG5vdCByZW5kZXIgaW50byB0aGUgc2NlbmUsXG4gKiBidXQgaW5zdGVhZCBsaW1pdCBjaGlsZCBlbGVtZW50cyB0byBvbmx5IGJlIHJlbmRlcmVkIHdoZXJlIHRoaXMgZWxlbWVudCBpcyByZW5kZXJlZC5cbiAqIEBhdWdtZW50cyBDb21wb25lbnRcbiAqIEBjYXRlZ29yeSBVc2VyIEludGVyZmFjZVxuICovXG5jbGFzcyBFbGVtZW50Q29tcG9uZW50IGV4dGVuZHMgQ29tcG9uZW50IHtcbiAgICAvKipcbiAgICAgKiBDcmVhdGUgYSBuZXcgRWxlbWVudENvbXBvbmVudCBpbnN0YW5jZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuL3N5c3RlbS5qcycpLkVsZW1lbnRDb21wb25lbnRTeXN0ZW19IHN5c3RlbSAtIFRoZSBDb21wb25lbnRTeXN0ZW0gdGhhdFxuICAgICAqIGNyZWF0ZWQgdGhpcyBDb21wb25lbnQuXG4gICAgICogQHBhcmFtIHtFbnRpdHl9IGVudGl0eSAtIFRoZSBFbnRpdHkgdGhhdCB0aGlzIENvbXBvbmVudCBpcyBhdHRhY2hlZCB0by5cbiAgICAgKi9cbiAgICBjb25zdHJ1Y3RvcihzeXN0ZW0sIGVudGl0eSkge1xuICAgICAgICBzdXBlcihzeXN0ZW0sIGVudGl0eSk7XG5cbiAgICAgICAgLy8gc2V0IHRvIHRydWUgYnkgdGhlIEVsZW1lbnRDb21wb25lbnRTeXN0ZW0gd2hpbGVcbiAgICAgICAgLy8gdGhlIGNvbXBvbmVudCBpcyBiZWluZyBpbml0aWFsaXplZFxuICAgICAgICB0aGlzLl9iZWluZ0luaXRpYWxpemVkID0gZmFsc2U7XG5cbiAgICAgICAgdGhpcy5fYW5jaG9yID0gbmV3IFZlYzQoKTtcbiAgICAgICAgdGhpcy5fbG9jYWxBbmNob3IgPSBuZXcgVmVjNCgpO1xuXG4gICAgICAgIHRoaXMuX3Bpdm90ID0gbmV3IFZlYzIoKTtcblxuICAgICAgICB0aGlzLl93aWR0aCA9IHRoaXMuX2NhbGN1bGF0ZWRXaWR0aCA9IDMyO1xuICAgICAgICB0aGlzLl9oZWlnaHQgPSB0aGlzLl9jYWxjdWxhdGVkSGVpZ2h0ID0gMzI7XG5cbiAgICAgICAgdGhpcy5fbWFyZ2luID0gbmV3IFZlYzQoMCwgMCwgLTMyLCAtMzIpO1xuXG4gICAgICAgIC8vIHRoZSBtb2RlbCB0cmFuc2Zvcm0gdXNlZCB0byByZW5kZXJcbiAgICAgICAgdGhpcy5fbW9kZWxUcmFuc2Zvcm0gPSBuZXcgTWF0NCgpO1xuXG4gICAgICAgIHRoaXMuX3NjcmVlblRvV29ybGQgPSBuZXcgTWF0NCgpO1xuXG4gICAgICAgIC8vIHRyYW5zZm9ybSB0aGF0IHVwZGF0ZXMgbG9jYWwgcG9zaXRpb24gYWNjb3JkaW5nIHRvIGFuY2hvciB2YWx1ZXNcbiAgICAgICAgdGhpcy5fYW5jaG9yVHJhbnNmb3JtID0gbmV3IE1hdDQoKTtcblxuICAgICAgICB0aGlzLl9hbmNob3JEaXJ0eSA9IHRydWU7XG5cbiAgICAgICAgLy8gdHJhbnNmb3JtcyB0byBjYWxjdWxhdGUgc2NyZWVuIGNvb3JkaW5hdGVzXG4gICAgICAgIHRoaXMuX3BhcmVudFdvcmxkVHJhbnNmb3JtID0gbmV3IE1hdDQoKTtcbiAgICAgICAgdGhpcy5fc2NyZWVuVHJhbnNmb3JtID0gbmV3IE1hdDQoKTtcblxuICAgICAgICAvLyB0aGUgY29ybmVycyBvZiB0aGUgZWxlbWVudCByZWxhdGl2ZSB0byBpdHMgc2NyZWVuIGNvbXBvbmVudC5cbiAgICAgICAgLy8gT3JkZXIgaXMgYm90dG9tIGxlZnQsIGJvdHRvbSByaWdodCwgdG9wIHJpZ2h0LCB0b3AgbGVmdFxuICAgICAgICB0aGlzLl9zY3JlZW5Db3JuZXJzID0gW25ldyBWZWMzKCksIG5ldyBWZWMzKCksIG5ldyBWZWMzKCksIG5ldyBWZWMzKCldO1xuXG4gICAgICAgIC8vIGNhbnZhcy1zcGFjZSBjb3JuZXJzIG9mIHRoZSBlbGVtZW50LlxuICAgICAgICAvLyBPcmRlciBpcyBib3R0b20gbGVmdCwgYm90dG9tIHJpZ2h0LCB0b3AgcmlnaHQsIHRvcCBsZWZ0XG4gICAgICAgIHRoaXMuX2NhbnZhc0Nvcm5lcnMgPSBbbmV3IFZlYzIoKSwgbmV3IFZlYzIoKSwgbmV3IFZlYzIoKSwgbmV3IFZlYzIoKV07XG5cbiAgICAgICAgLy8gdGhlIHdvcmxkLXNwYWNlIGNvcm5lcnMgb2YgdGhlIGVsZW1lbnRcbiAgICAgICAgLy8gT3JkZXIgaXMgYm90dG9tIGxlZnQsIGJvdHRvbSByaWdodCwgdG9wIHJpZ2h0LCB0b3AgbGVmdFxuICAgICAgICB0aGlzLl93b3JsZENvcm5lcnMgPSBbbmV3IFZlYzMoKSwgbmV3IFZlYzMoKSwgbmV3IFZlYzMoKSwgbmV3IFZlYzMoKV07XG5cbiAgICAgICAgdGhpcy5fY29ybmVyc0RpcnR5ID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5fY2FudmFzQ29ybmVyc0RpcnR5ID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5fd29ybGRDb3JuZXJzRGlydHkgPSB0cnVlO1xuXG4gICAgICAgIHRoaXMuZW50aXR5Lm9uKCdpbnNlcnQnLCB0aGlzLl9vbkluc2VydCwgdGhpcyk7XG5cbiAgICAgICAgdGhpcy5fcGF0Y2goKTtcblxuICAgICAgICAvKipcbiAgICAgICAgICogVGhlIEVudGl0eSB3aXRoIGEge0BsaW5rIFNjcmVlbkNvbXBvbmVudH0gdGhhdCB0aGlzIGNvbXBvbmVudCBiZWxvbmdzIHRvLiBUaGlzIGlzXG4gICAgICAgICAqIGF1dG9tYXRpY2FsbHkgc2V0IHdoZW4gdGhlIGNvbXBvbmVudCBpcyBhIGNoaWxkIG9mIGEgU2NyZWVuQ29tcG9uZW50LlxuICAgICAgICAgKlxuICAgICAgICAgKiBAdHlwZSB7RW50aXR5fG51bGx9XG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLnNjcmVlbiA9IG51bGw7XG5cbiAgICAgICAgdGhpcy5fdHlwZSA9IEVMRU1FTlRUWVBFX0dST1VQO1xuXG4gICAgICAgIC8vIGVsZW1lbnQgdHlwZXNcbiAgICAgICAgdGhpcy5faW1hZ2UgPSBudWxsO1xuICAgICAgICB0aGlzLl90ZXh0ID0gbnVsbDtcbiAgICAgICAgdGhpcy5fZ3JvdXAgPSBudWxsO1xuXG4gICAgICAgIHRoaXMuX2RyYXdPcmRlciA9IDA7XG5cbiAgICAgICAgLy8gRml0IG1vZGVcbiAgICAgICAgdGhpcy5fZml0TW9kZSA9IEZJVE1PREVfU1RSRVRDSDtcblxuICAgICAgICAvLyBpbnB1dCByZWxhdGVkXG4gICAgICAgIHRoaXMuX3VzZUlucHV0ID0gZmFsc2U7XG5cbiAgICAgICAgdGhpcy5fbGF5ZXJzID0gW0xBWUVSSURfVUldOyAvLyBhc3NpZ24gdG8gdGhlIGRlZmF1bHQgVUkgbGF5ZXJcbiAgICAgICAgdGhpcy5fYWRkZWRNb2RlbHMgPSBbXTsgLy8gc3RvcmUgbW9kZWxzIHRoYXQgaGF2ZSBiZWVuIGFkZGVkIHRvIGxheWVyIHNvIHdlIGNhbiByZS1hZGQgd2hlbiBsYXllciBpcyBjaGFuZ2VkXG5cbiAgICAgICAgdGhpcy5fYmF0Y2hHcm91cElkID0gLTE7XG4gICAgICAgIC8vICNpZiBfREVCVUdcbiAgICAgICAgdGhpcy5fYmF0Y2hHcm91cCA9IG51bGw7XG4gICAgICAgIC8vICNlbmRpZlxuICAgICAgICAvL1xuXG4gICAgICAgIHRoaXMuX29mZnNldFJlYWRBdCA9IDA7XG4gICAgICAgIHRoaXMuX21hc2tPZmZzZXQgPSAwLjU7XG4gICAgICAgIHRoaXMuX21hc2tlZEJ5ID0gbnVsbDsgLy8gdGhlIGVudGl0eSB0aGF0IGlzIG1hc2tpbmcgdGhpcyBlbGVtZW50XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRmlyZWQgd2hlbiB0aGUgbW91c2UgaXMgcHJlc3NlZCB3aGlsZSB0aGUgY3Vyc29yIGlzIG9uIHRoZSBjb21wb25lbnQuIE9ubHkgZmlyZWQgd2hlblxuICAgICAqIHVzZUlucHV0IGlzIHRydWUuXG4gICAgICpcbiAgICAgKiBAZXZlbnQgRWxlbWVudENvbXBvbmVudCNtb3VzZWRvd25cbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi4vLi4vaW5wdXQvZWxlbWVudC1pbnB1dC5qcycpLkVsZW1lbnRNb3VzZUV2ZW50fSBldmVudCAtIFRoZSBldmVudC5cbiAgICAgKi9cblxuICAgIC8qKlxuICAgICAqIEZpcmVkIHdoZW4gdGhlIG1vdXNlIGlzIHJlbGVhc2VkIHdoaWxlIHRoZSBjdXJzb3IgaXMgb24gdGhlIGNvbXBvbmVudC4gT25seSBmaXJlZCB3aGVuXG4gICAgICogdXNlSW5wdXQgaXMgdHJ1ZS5cbiAgICAgKlxuICAgICAqIEBldmVudCBFbGVtZW50Q29tcG9uZW50I21vdXNldXBcbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi4vLi4vaW5wdXQvZWxlbWVudC1pbnB1dC5qcycpLkVsZW1lbnRNb3VzZUV2ZW50fSBldmVudCAtIFRoZSBldmVudC5cbiAgICAgKi9cblxuICAgIC8qKlxuICAgICAqIEZpcmVkIHdoZW4gdGhlIG1vdXNlIGN1cnNvciBlbnRlcnMgdGhlIGNvbXBvbmVudC4gT25seSBmaXJlZCB3aGVuIHVzZUlucHV0IGlzIHRydWUuXG4gICAgICpcbiAgICAgKiBAZXZlbnQgRWxlbWVudENvbXBvbmVudCNtb3VzZWVudGVyXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4uLy4uL2lucHV0L2VsZW1lbnQtaW5wdXQuanMnKS5FbGVtZW50TW91c2VFdmVudH0gZXZlbnQgLSBUaGUgZXZlbnQuXG4gICAgICovXG5cbiAgICAvKipcbiAgICAgKiBGaXJlZCB3aGVuIHRoZSBtb3VzZSBjdXJzb3IgbGVhdmVzIHRoZSBjb21wb25lbnQuIE9ubHkgZmlyZWQgd2hlbiB1c2VJbnB1dCBpcyB0cnVlLlxuICAgICAqXG4gICAgICogQGV2ZW50IEVsZW1lbnRDb21wb25lbnQjbW91c2VsZWF2ZVxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuLi8uLi9pbnB1dC9lbGVtZW50LWlucHV0LmpzJykuRWxlbWVudE1vdXNlRXZlbnR9IGV2ZW50IC0gVGhlIGV2ZW50LlxuICAgICAqL1xuXG4gICAgLyoqXG4gICAgICogRmlyZWQgd2hlbiB0aGUgbW91c2UgY3Vyc29yIGlzIG1vdmVkIG9uIHRoZSBjb21wb25lbnQuIE9ubHkgZmlyZWQgd2hlbiB1c2VJbnB1dCBpcyB0cnVlLlxuICAgICAqXG4gICAgICogQGV2ZW50IEVsZW1lbnRDb21wb25lbnQjbW91c2Vtb3ZlXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4uLy4uL2lucHV0L2VsZW1lbnQtaW5wdXQuanMnKS5FbGVtZW50TW91c2VFdmVudH0gZXZlbnQgLSBUaGUgZXZlbnQuXG4gICAgICovXG5cbiAgICAvKipcbiAgICAgKiBGaXJlZCB3aGVuIHRoZSBtb3VzZSB3aGVlbCBpcyBzY3JvbGxlZCBvbiB0aGUgY29tcG9uZW50LiBPbmx5IGZpcmVkIHdoZW4gdXNlSW5wdXQgaXMgdHJ1ZS5cbiAgICAgKlxuICAgICAqIEBldmVudCBFbGVtZW50Q29tcG9uZW50I21vdXNld2hlZWxcbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi4vLi4vaW5wdXQvZWxlbWVudC1pbnB1dC5qcycpLkVsZW1lbnRNb3VzZUV2ZW50fSBldmVudCAtIFRoZSBldmVudC5cbiAgICAgKi9cblxuICAgIC8qKlxuICAgICAqIEZpcmVkIHdoZW4gdGhlIG1vdXNlIGlzIHByZXNzZWQgYW5kIHJlbGVhc2VkIG9uIHRoZSBjb21wb25lbnQgb3Igd2hlbiBhIHRvdWNoIHN0YXJ0cyBhbmRcbiAgICAgKiBlbmRzIG9uIHRoZSBjb21wb25lbnQuIE9ubHkgZmlyZWQgd2hlbiB1c2VJbnB1dCBpcyB0cnVlLlxuICAgICAqXG4gICAgICogQGV2ZW50IEVsZW1lbnRDb21wb25lbnQjY2xpY2tcbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi4vLi4vaW5wdXQvZWxlbWVudC1pbnB1dC5qcycpLkVsZW1lbnRNb3VzZUV2ZW50fGltcG9ydCgnLi4vLi4vaW5wdXQvZWxlbWVudC1pbnB1dC5qcycpLkVsZW1lbnRUb3VjaEV2ZW50fSBldmVudCAtIFRoZSBldmVudC5cbiAgICAgKi9cblxuICAgIC8qKlxuICAgICAqIEZpcmVkIHdoZW4gYSB0b3VjaCBzdGFydHMgb24gdGhlIGNvbXBvbmVudC4gT25seSBmaXJlZCB3aGVuIHVzZUlucHV0IGlzIHRydWUuXG4gICAgICpcbiAgICAgKiBAZXZlbnQgRWxlbWVudENvbXBvbmVudCN0b3VjaHN0YXJ0XG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4uLy4uL2lucHV0L2VsZW1lbnQtaW5wdXQuanMnKS5FbGVtZW50VG91Y2hFdmVudH0gZXZlbnQgLSBUaGUgZXZlbnQuXG4gICAgICovXG5cbiAgICAvKipcbiAgICAgKiBGaXJlZCB3aGVuIGEgdG91Y2ggZW5kcyBvbiB0aGUgY29tcG9uZW50LiBPbmx5IGZpcmVkIHdoZW4gdXNlSW5wdXQgaXMgdHJ1ZS5cbiAgICAgKlxuICAgICAqIEBldmVudCBFbGVtZW50Q29tcG9uZW50I3RvdWNoZW5kXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4uLy4uL2lucHV0L2VsZW1lbnQtaW5wdXQuanMnKS5FbGVtZW50VG91Y2hFdmVudH0gZXZlbnQgLSBUaGUgZXZlbnQuXG4gICAgICovXG5cbiAgICAvKipcbiAgICAgKiBGaXJlZCB3aGVuIGEgdG91Y2ggbW92ZXMgYWZ0ZXIgaXQgc3RhcnRlZCB0b3VjaGluZyB0aGUgY29tcG9uZW50LiBPbmx5IGZpcmVkIHdoZW4gdXNlSW5wdXRcbiAgICAgKiBpcyB0cnVlLlxuICAgICAqXG4gICAgICogQGV2ZW50IEVsZW1lbnRDb21wb25lbnQjdG91Y2htb3ZlXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4uLy4uL2lucHV0L2VsZW1lbnQtaW5wdXQuanMnKS5FbGVtZW50VG91Y2hFdmVudH0gZXZlbnQgLSBUaGUgZXZlbnQuXG4gICAgICovXG5cbiAgICAvKipcbiAgICAgKiBGaXJlZCB3aGVuIGEgdG91Y2ggaXMgY2FuY2VsZWQgb24gdGhlIGNvbXBvbmVudC4gT25seSBmaXJlZCB3aGVuIHVzZUlucHV0IGlzIHRydWUuXG4gICAgICpcbiAgICAgKiBAZXZlbnQgRWxlbWVudENvbXBvbmVudCN0b3VjaGNhbmNlbFxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuLi8uLi9pbnB1dC9lbGVtZW50LWlucHV0LmpzJykuRWxlbWVudFRvdWNoRXZlbnR9IGV2ZW50IC0gVGhlIGV2ZW50LlxuICAgICAqL1xuXG4gICAgLyoqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIGdldCBfYWJzTGVmdCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2xvY2FsQW5jaG9yLnggKyB0aGlzLl9tYXJnaW4ueDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgZ2V0IF9hYnNSaWdodCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2xvY2FsQW5jaG9yLnogLSB0aGlzLl9tYXJnaW4uejtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgZ2V0IF9hYnNUb3AoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9sb2NhbEFuY2hvci53IC0gdGhpcy5fbWFyZ2luLnc7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIGdldCBfYWJzQm90dG9tKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fbG9jYWxBbmNob3IueSArIHRoaXMuX21hcmdpbi55O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgZ2V0IF9oYXNTcGxpdEFuY2hvcnNYKCkge1xuICAgICAgICByZXR1cm4gTWF0aC5hYnModGhpcy5fYW5jaG9yLnggLSB0aGlzLl9hbmNob3IueikgPiAwLjAwMTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIGdldCBfaGFzU3BsaXRBbmNob3JzWSgpIHtcbiAgICAgICAgcmV0dXJuIE1hdGguYWJzKHRoaXMuX2FuY2hvci55IC0gdGhpcy5fYW5jaG9yLncpID4gMC4wMDE7XG4gICAgfVxuXG4gICAgZ2V0IGFhYmIoKSB7XG4gICAgICAgIGlmICh0aGlzLl9pbWFnZSkgcmV0dXJuIHRoaXMuX2ltYWdlLmFhYmI7XG4gICAgICAgIGlmICh0aGlzLl90ZXh0KSByZXR1cm4gdGhpcy5fdGV4dC5hYWJiO1xuXG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNwZWNpZmllcyB3aGVyZSB0aGUgbGVmdCwgYm90dG9tLCByaWdodCBhbmQgdG9wIGVkZ2VzIG9mIHRoZSBjb21wb25lbnQgYXJlIGFuY2hvcmVkIHJlbGF0aXZlXG4gICAgICogdG8gaXRzIHBhcmVudC4gRWFjaCB2YWx1ZSByYW5nZXMgZnJvbSAwIHRvIDEuIGUuZy4gYSB2YWx1ZSBvZiBbMCwgMCwgMCwgMF0gbWVhbnMgdGhhdCB0aGVcbiAgICAgKiBlbGVtZW50IHdpbGwgYmUgYW5jaG9yZWQgdG8gdGhlIGJvdHRvbSBsZWZ0IG9mIGl0cyBwYXJlbnQuIEEgdmFsdWUgb2YgWzEsIDEsIDEsIDFdIG1lYW5zIGl0XG4gICAgICogd2lsbCBiZSBhbmNob3JlZCB0byB0aGUgdG9wIHJpZ2h0LiBBIHNwbGl0IGFuY2hvciBpcyB3aGVuIHRoZSBsZWZ0LXJpZ2h0IG9yIHRvcC1ib3R0b20gcGFpcnNcbiAgICAgKiBvZiB0aGUgYW5jaG9yIGFyZSBub3QgZXF1YWwuIEluIHRoYXQgY2FzZSB0aGUgY29tcG9uZW50IHdpbGwgYmUgcmVzaXplZCB0byBjb3ZlciB0aGF0IGVudGlyZVxuICAgICAqIGFyZWEuIGUuZy4gYSB2YWx1ZSBvZiBbMCwgMCwgMSwgMV0gd2lsbCBtYWtlIHRoZSBjb21wb25lbnQgcmVzaXplIGV4YWN0bHkgYXMgaXRzIHBhcmVudC5cbiAgICAgKlxuICAgICAqIEBleGFtcGxlXG4gICAgICogcGMuYXBwLnJvb3QuZmluZEJ5TmFtZShcIkludmVudG9yeVwiKS5lbGVtZW50LmFuY2hvciA9IG5ldyBwYy5WZWM0KE1hdGgucmFuZG9tKCkgKiAwLjEsIDAsIDEsIDApO1xuICAgICAqIEBleGFtcGxlXG4gICAgICogcGMuYXBwLnJvb3QuZmluZEJ5TmFtZShcIkludmVudG9yeVwiKS5lbGVtZW50LmFuY2hvciA9IFtNYXRoLnJhbmRvbSgpICogMC4xLCAwLCAxLCAwXTtcbiAgICAgKlxuICAgICAqIEB0eXBlIHtWZWM0IHwgbnVtYmVyW119XG4gICAgICovXG4gICAgc2V0IGFuY2hvcih2YWx1ZSkge1xuICAgICAgICBpZiAodmFsdWUgaW5zdGFuY2VvZiBWZWM0KSB7XG4gICAgICAgICAgICB0aGlzLl9hbmNob3IuY29weSh2YWx1ZSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLl9hbmNob3Iuc2V0KC4uLnZhbHVlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghdGhpcy5lbnRpdHkuX3BhcmVudCAmJiAhdGhpcy5zY3JlZW4pIHtcbiAgICAgICAgICAgIHRoaXMuX2NhbGN1bGF0ZUxvY2FsQW5jaG9ycygpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5fY2FsY3VsYXRlU2l6ZSh0aGlzLl9oYXNTcGxpdEFuY2hvcnNYLCB0aGlzLl9oYXNTcGxpdEFuY2hvcnNZKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuX2FuY2hvckRpcnR5ID0gdHJ1ZTtcblxuICAgICAgICBpZiAoIXRoaXMuZW50aXR5Ll9kaXJ0eUxvY2FsKVxuICAgICAgICAgICAgdGhpcy5lbnRpdHkuX2RpcnRpZnlMb2NhbCgpO1xuXG4gICAgICAgIHRoaXMuZmlyZSgnc2V0OmFuY2hvcicsIHRoaXMuX2FuY2hvcik7XG4gICAgfVxuXG4gICAgZ2V0IGFuY2hvcigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FuY2hvcjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBc3NpZ24gZWxlbWVudCB0byBhIHNwZWNpZmljIGJhdGNoIGdyb3VwIChzZWUge0BsaW5rIEJhdGNoR3JvdXB9KS4gRGVmYXVsdCBpcyAtMSAobm8gZ3JvdXApLlxuICAgICAqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKi9cbiAgICBzZXQgYmF0Y2hHcm91cElkKHZhbHVlKSB7XG4gICAgICAgIGlmICh0aGlzLl9iYXRjaEdyb3VwSWQgPT09IHZhbHVlKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIGlmICh0aGlzLmVudGl0eS5lbmFibGVkICYmIHRoaXMuX2JhdGNoR3JvdXBJZCA+PSAwKSB7XG4gICAgICAgICAgICB0aGlzLnN5c3RlbS5hcHAuYmF0Y2hlcj8ucmVtb3ZlKEJhdGNoR3JvdXAuRUxFTUVOVCwgdGhpcy5iYXRjaEdyb3VwSWQsIHRoaXMuZW50aXR5KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLmVudGl0eS5lbmFibGVkICYmIHZhbHVlID49IDApIHtcbiAgICAgICAgICAgIHRoaXMuc3lzdGVtLmFwcC5iYXRjaGVyPy5pbnNlcnQoQmF0Y2hHcm91cC5FTEVNRU5ULCB2YWx1ZSwgdGhpcy5lbnRpdHkpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHZhbHVlIDwgMCAmJiB0aGlzLl9iYXRjaEdyb3VwSWQgPj0gMCAmJiB0aGlzLmVuYWJsZWQgJiYgdGhpcy5lbnRpdHkuZW5hYmxlZCkge1xuICAgICAgICAgICAgLy8gcmUtYWRkIG1vZGVsIHRvIHNjZW5lLCBpbiBjYXNlIGl0IHdhcyByZW1vdmVkIGJ5IGJhdGNoaW5nXG4gICAgICAgICAgICBpZiAodGhpcy5faW1hZ2UgJiYgdGhpcy5faW1hZ2UuX3JlbmRlcmFibGUubW9kZWwpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmFkZE1vZGVsVG9MYXllcnModGhpcy5faW1hZ2UuX3JlbmRlcmFibGUubW9kZWwpO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0aGlzLl90ZXh0ICYmIHRoaXMuX3RleHQuX21vZGVsKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5hZGRNb2RlbFRvTGF5ZXJzKHRoaXMuX3RleHQuX21vZGVsKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuX2JhdGNoR3JvdXBJZCA9IHZhbHVlO1xuICAgIH1cblxuICAgIGdldCBiYXRjaEdyb3VwSWQoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9iYXRjaEdyb3VwSWQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVGhlIGRpc3RhbmNlIGZyb20gdGhlIGJvdHRvbSBlZGdlIG9mIHRoZSBhbmNob3IuIENhbiBiZSB1c2VkIGluIGNvbWJpbmF0aW9uIHdpdGggYSBzcGxpdFxuICAgICAqIGFuY2hvciB0byBtYWtlIHRoZSBjb21wb25lbnQncyB0b3AgZWRnZSBhbHdheXMgYmUgJ3RvcCcgdW5pdHMgYXdheSBmcm9tIHRoZSB0b3AuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqL1xuICAgIHNldCBib3R0b20odmFsdWUpIHtcbiAgICAgICAgdGhpcy5fbWFyZ2luLnkgPSB2YWx1ZTtcbiAgICAgICAgY29uc3QgcCA9IHRoaXMuZW50aXR5LmdldExvY2FsUG9zaXRpb24oKTtcbiAgICAgICAgY29uc3Qgd3QgPSB0aGlzLl9hYnNUb3A7XG4gICAgICAgIGNvbnN0IHdiID0gdGhpcy5fbG9jYWxBbmNob3IueSArIHZhbHVlO1xuICAgICAgICB0aGlzLl9zZXRIZWlnaHQod3QgLSB3Yik7XG5cbiAgICAgICAgcC55ID0gdmFsdWUgKyB0aGlzLl9jYWxjdWxhdGVkSGVpZ2h0ICogdGhpcy5fcGl2b3QueTtcbiAgICAgICAgdGhpcy5lbnRpdHkuc2V0TG9jYWxQb3NpdGlvbihwKTtcbiAgICB9XG5cbiAgICBnZXQgYm90dG9tKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fbWFyZ2luLnk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVGhlIHdpZHRoIGF0IHdoaWNoIHRoZSBlbGVtZW50IHdpbGwgYmUgcmVuZGVyZWQuIEluIG1vc3QgY2FzZXMgdGhpcyB3aWxsIGJlIHRoZSBzYW1lIGFzXG4gICAgICogYHdpZHRoYC4gSG93ZXZlciwgaW4gc29tZSBjYXNlcyB0aGUgZW5naW5lIG1heSBjYWxjdWxhdGUgYSBkaWZmZXJlbnQgd2lkdGggZm9yIHRoZSBlbGVtZW50LFxuICAgICAqIHN1Y2ggYXMgd2hlbiB0aGUgZWxlbWVudCBpcyB1bmRlciB0aGUgY29udHJvbCBvZiBhIHtAbGluayBMYXlvdXRHcm91cENvbXBvbmVudH0uIEluIHRoZXNlXG4gICAgICogc2NlbmFyaW9zLCBgY2FsY3VsYXRlZFdpZHRoYCBtYXkgYmUgc21hbGxlciBvciBsYXJnZXIgdGhhbiB0aGUgd2lkdGggdGhhdCB3YXMgc2V0IGluIHRoZVxuICAgICAqIGVkaXRvci5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtudW1iZXJ9XG4gICAgICovXG4gICAgc2V0IGNhbGN1bGF0ZWRXaWR0aCh2YWx1ZSkge1xuICAgICAgICB0aGlzLl9zZXRDYWxjdWxhdGVkV2lkdGgodmFsdWUsIHRydWUpO1xuICAgIH1cblxuICAgIGdldCBjYWxjdWxhdGVkV2lkdGgoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9jYWxjdWxhdGVkV2lkdGg7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVGhlIGhlaWdodCBhdCB3aGljaCB0aGUgZWxlbWVudCB3aWxsIGJlIHJlbmRlcmVkLiBJbiBtb3N0IGNhc2VzIHRoaXMgd2lsbCBiZSB0aGUgc2FtZSBhc1xuICAgICAqIGBoZWlnaHRgLiBIb3dldmVyLCBpbiBzb21lIGNhc2VzIHRoZSBlbmdpbmUgbWF5IGNhbGN1bGF0ZSBhIGRpZmZlcmVudCBoZWlnaHQgZm9yIHRoZSBlbGVtZW50LFxuICAgICAqIHN1Y2ggYXMgd2hlbiB0aGUgZWxlbWVudCBpcyB1bmRlciB0aGUgY29udHJvbCBvZiBhIHtAbGluayBMYXlvdXRHcm91cENvbXBvbmVudH0uIEluIHRoZXNlXG4gICAgICogc2NlbmFyaW9zLCBgY2FsY3VsYXRlZEhlaWdodGAgbWF5IGJlIHNtYWxsZXIgb3IgbGFyZ2VyIHRoYW4gdGhlIGhlaWdodCB0aGF0IHdhcyBzZXQgaW4gdGhlXG4gICAgICogZWRpdG9yLlxuICAgICAqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKi9cbiAgICBzZXQgY2FsY3VsYXRlZEhlaWdodCh2YWx1ZSkge1xuICAgICAgICB0aGlzLl9zZXRDYWxjdWxhdGVkSGVpZ2h0KHZhbHVlLCB0cnVlKTtcbiAgICB9XG5cbiAgICBnZXQgY2FsY3VsYXRlZEhlaWdodCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2NhbGN1bGF0ZWRIZWlnaHQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQW4gYXJyYXkgb2YgNCB7QGxpbmsgVmVjMn1zIHRoYXQgcmVwcmVzZW50IHRoZSBib3R0b20gbGVmdCwgYm90dG9tIHJpZ2h0LCB0b3AgcmlnaHQgYW5kIHRvcFxuICAgICAqIGxlZnQgY29ybmVycyBvZiB0aGUgY29tcG9uZW50IGluIGNhbnZhcyBwaXhlbHMuIE9ubHkgd29ya3MgZm9yIHNjcmVlbiBzcGFjZSBlbGVtZW50XG4gICAgICogY29tcG9uZW50cy5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtWZWMyW119XG4gICAgICovXG4gICAgZ2V0IGNhbnZhc0Nvcm5lcnMoKSB7XG4gICAgICAgIGlmICghdGhpcy5fY2FudmFzQ29ybmVyc0RpcnR5IHx8ICF0aGlzLnNjcmVlbiB8fCAhdGhpcy5zY3JlZW4uc2NyZWVuLnNjcmVlblNwYWNlKVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2NhbnZhc0Nvcm5lcnM7XG5cbiAgICAgICAgY29uc3QgZGV2aWNlID0gdGhpcy5zeXN0ZW0uYXBwLmdyYXBoaWNzRGV2aWNlO1xuICAgICAgICBjb25zdCBzY3JlZW5Db3JuZXJzID0gdGhpcy5zY3JlZW5Db3JuZXJzO1xuICAgICAgICBjb25zdCBzeCA9IGRldmljZS5jYW52YXMuY2xpZW50V2lkdGggLyBkZXZpY2Uud2lkdGg7XG4gICAgICAgIGNvbnN0IHN5ID0gZGV2aWNlLmNhbnZhcy5jbGllbnRIZWlnaHQgLyBkZXZpY2UuaGVpZ2h0O1xuXG4gICAgICAgIC8vIHNjYWxlIHNjcmVlbiBjb3JuZXJzIHRvIGNhbnZhcyBzaXplIGFuZCByZXZlcnNlIHlcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCA0OyBpKyspIHtcbiAgICAgICAgICAgIHRoaXMuX2NhbnZhc0Nvcm5lcnNbaV0uc2V0KHNjcmVlbkNvcm5lcnNbaV0ueCAqIHN4LCAoZGV2aWNlLmhlaWdodCAtIHNjcmVlbkNvcm5lcnNbaV0ueSkgKiBzeSk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl9jYW52YXNDb3JuZXJzRGlydHkgPSBmYWxzZTtcblxuICAgICAgICByZXR1cm4gdGhpcy5fY2FudmFzQ29ybmVycztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUaGUgZHJhdyBvcmRlciBvZiB0aGUgY29tcG9uZW50LiBBIGhpZ2hlciB2YWx1ZSBtZWFucyB0aGF0IHRoZSBjb21wb25lbnQgd2lsbCBiZSByZW5kZXJlZCBvblxuICAgICAqIHRvcCBvZiBvdGhlciBjb21wb25lbnRzLlxuICAgICAqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKi9cbiAgICBzZXQgZHJhd09yZGVyKHZhbHVlKSB7XG4gICAgICAgIGxldCBwcmlvcml0eSA9IDA7XG4gICAgICAgIGlmICh0aGlzLnNjcmVlbikge1xuICAgICAgICAgICAgcHJpb3JpdHkgPSB0aGlzLnNjcmVlbi5zY3JlZW4ucHJpb3JpdHk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodmFsdWUgPiAweEZGRkZGRikge1xuICAgICAgICAgICAgRGVidWcud2FybignRWxlbWVudC5kcmF3T3JkZXIgbGFyZ2VyIHRoYW4gbWF4IHNpemUgb2Y6ICcgKyAweEZGRkZGRik7XG4gICAgICAgICAgICB2YWx1ZSA9IDB4RkZGRkZGO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gc2NyZWVuIHByaW9yaXR5IGlzIHN0b3JlZCBpbiB0aGUgdG9wIDggYml0c1xuICAgICAgICB0aGlzLl9kcmF3T3JkZXIgPSAocHJpb3JpdHkgPDwgMjQpICsgdmFsdWU7XG4gICAgICAgIHRoaXMuZmlyZSgnc2V0OmRyYXdvcmRlcicsIHRoaXMuX2RyYXdPcmRlcik7XG4gICAgfVxuXG4gICAgZ2V0IGRyYXdPcmRlcigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2RyYXdPcmRlcjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUaGUgaGVpZ2h0IG9mIHRoZSBlbGVtZW50IGFzIHNldCBpbiB0aGUgZWRpdG9yLiBOb3RlIHRoYXQgaW4gc29tZSBjYXNlcyB0aGlzIG1heSBub3QgcmVmbGVjdFxuICAgICAqIHRoZSB0cnVlIGhlaWdodCBhdCB3aGljaCB0aGUgZWxlbWVudCBpcyByZW5kZXJlZCwgc3VjaCBhcyB3aGVuIHRoZSBlbGVtZW50IGlzIHVuZGVyIHRoZVxuICAgICAqIGNvbnRyb2wgb2YgYSB7QGxpbmsgTGF5b3V0R3JvdXBDb21wb25lbnR9LiBTZWUgYGNhbGN1bGF0ZWRIZWlnaHRgIGluIG9yZGVyIHRvIGVuc3VyZSB5b3UgYXJlXG4gICAgICogcmVhZGluZyB0aGUgdHJ1ZSBoZWlnaHQgYXQgd2hpY2ggdGhlIGVsZW1lbnQgd2lsbCBiZSByZW5kZXJlZC5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtudW1iZXJ9XG4gICAgICovXG4gICAgc2V0IGhlaWdodCh2YWx1ZSkge1xuICAgICAgICB0aGlzLl9oZWlnaHQgPSB2YWx1ZTtcblxuICAgICAgICBpZiAoIXRoaXMuX2hhc1NwbGl0QW5jaG9yc1kpIHtcbiAgICAgICAgICAgIHRoaXMuX3NldENhbGN1bGF0ZWRIZWlnaHQodmFsdWUsIHRydWUpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5maXJlKCdzZXQ6aGVpZ2h0JywgdGhpcy5faGVpZ2h0KTtcbiAgICB9XG5cbiAgICBnZXQgaGVpZ2h0KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5faGVpZ2h0O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEFuIGFycmF5IG9mIGxheWVyIElEcyAoe0BsaW5rIExheWVyI2lkfSkgdG8gd2hpY2ggdGhpcyBlbGVtZW50IHNob3VsZCBiZWxvbmcuIERvbid0IHB1c2gsXG4gICAgICogcG9wLCBzcGxpY2Ugb3IgbW9kaWZ5IHRoaXMgYXJyYXksIGlmIHlvdSB3YW50IHRvIGNoYW5nZSBpdCAtIHNldCBhIG5ldyBvbmUgaW5zdGVhZC5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtudW1iZXJbXX1cbiAgICAgKi9cbiAgICBzZXQgbGF5ZXJzKHZhbHVlKSB7XG4gICAgICAgIGlmICh0aGlzLl9hZGRlZE1vZGVscy5sZW5ndGgpIHtcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fbGF5ZXJzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgbGF5ZXIgPSB0aGlzLnN5c3RlbS5hcHAuc2NlbmUubGF5ZXJzLmdldExheWVyQnlJZCh0aGlzLl9sYXllcnNbaV0pO1xuICAgICAgICAgICAgICAgIGlmIChsYXllcikge1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGxldCBqID0gMDsgaiA8IHRoaXMuX2FkZGVkTW9kZWxzLmxlbmd0aDsgaisrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBsYXllci5yZW1vdmVNZXNoSW5zdGFuY2VzKHRoaXMuX2FkZGVkTW9kZWxzW2pdLm1lc2hJbnN0YW5jZXMpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fbGF5ZXJzID0gdmFsdWU7XG5cbiAgICAgICAgaWYgKCF0aGlzLmVuYWJsZWQgfHwgIXRoaXMuZW50aXR5LmVuYWJsZWQgfHwgIXRoaXMuX2FkZGVkTW9kZWxzLmxlbmd0aCkgcmV0dXJuO1xuXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fbGF5ZXJzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBsYXllciA9IHRoaXMuc3lzdGVtLmFwcC5zY2VuZS5sYXllcnMuZ2V0TGF5ZXJCeUlkKHRoaXMuX2xheWVyc1tpXSk7XG4gICAgICAgICAgICBpZiAobGF5ZXIpIHtcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBqID0gMDsgaiA8IHRoaXMuX2FkZGVkTW9kZWxzLmxlbmd0aDsgaisrKSB7XG4gICAgICAgICAgICAgICAgICAgIGxheWVyLmFkZE1lc2hJbnN0YW5jZXModGhpcy5fYWRkZWRNb2RlbHNbal0ubWVzaEluc3RhbmNlcyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2V0IGxheWVycygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2xheWVycztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUaGUgZGlzdGFuY2UgZnJvbSB0aGUgbGVmdCBlZGdlIG9mIHRoZSBhbmNob3IuIENhbiBiZSB1c2VkIGluIGNvbWJpbmF0aW9uIHdpdGggYSBzcGxpdFxuICAgICAqIGFuY2hvciB0byBtYWtlIHRoZSBjb21wb25lbnQncyBsZWZ0IGVkZ2UgYWx3YXlzIGJlICdsZWZ0JyB1bml0cyBhd2F5IGZyb20gdGhlIGxlZnQuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqL1xuICAgIHNldCBsZWZ0KHZhbHVlKSB7XG4gICAgICAgIHRoaXMuX21hcmdpbi54ID0gdmFsdWU7XG4gICAgICAgIGNvbnN0IHAgPSB0aGlzLmVudGl0eS5nZXRMb2NhbFBvc2l0aW9uKCk7XG4gICAgICAgIGNvbnN0IHdyID0gdGhpcy5fYWJzUmlnaHQ7XG4gICAgICAgIGNvbnN0IHdsID0gdGhpcy5fbG9jYWxBbmNob3IueCArIHZhbHVlO1xuICAgICAgICB0aGlzLl9zZXRXaWR0aCh3ciAtIHdsKTtcblxuICAgICAgICBwLnggPSB2YWx1ZSArIHRoaXMuX2NhbGN1bGF0ZWRXaWR0aCAqIHRoaXMuX3Bpdm90Lng7XG4gICAgICAgIHRoaXMuZW50aXR5LnNldExvY2FsUG9zaXRpb24ocCk7XG4gICAgfVxuXG4gICAgZ2V0IGxlZnQoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9tYXJnaW4ueDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUaGUgZGlzdGFuY2UgZnJvbSB0aGUgbGVmdCwgYm90dG9tLCByaWdodCBhbmQgdG9wIGVkZ2VzIG9mIHRoZSBhbmNob3IuIEZvciBleGFtcGxlIGlmIHdlIGFyZVxuICAgICAqIHVzaW5nIGEgc3BsaXQgYW5jaG9yIGxpa2UgWzAsMCwxLDFdIGFuZCB0aGUgbWFyZ2luIGlzIFswLDAsMCwwXSB0aGVuIHRoZSBjb21wb25lbnQgd2lsbCBiZVxuICAgICAqIHRoZSBzYW1lIHdpZHRoIGFuZCBoZWlnaHQgYXMgaXRzIHBhcmVudC5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtWZWM0fVxuICAgICAqL1xuICAgIHNldCBtYXJnaW4odmFsdWUpIHtcbiAgICAgICAgdGhpcy5fbWFyZ2luLmNvcHkodmFsdWUpO1xuICAgICAgICB0aGlzLl9jYWxjdWxhdGVTaXplKHRydWUsIHRydWUpO1xuICAgICAgICB0aGlzLmZpcmUoJ3NldDptYXJnaW4nLCB0aGlzLl9tYXJnaW4pO1xuICAgIH1cblxuICAgIGdldCBtYXJnaW4oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9tYXJnaW47XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogR2V0IHRoZSBlbnRpdHkgdGhhdCBpcyBjdXJyZW50bHkgbWFza2luZyB0aGlzIGVsZW1lbnQuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7RW50aXR5fVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgZ2V0IG1hc2tlZEJ5KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fbWFza2VkQnk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVGhlIHBvc2l0aW9uIG9mIHRoZSBwaXZvdCBvZiB0aGUgY29tcG9uZW50IHJlbGF0aXZlIHRvIGl0cyBhbmNob3IuIEVhY2ggdmFsdWUgcmFuZ2VzIGZyb20gMFxuICAgICAqIHRvIDEgd2hlcmUgWzAsMF0gaXMgdGhlIGJvdHRvbSBsZWZ0IGFuZCBbMSwxXSBpcyB0aGUgdG9wIHJpZ2h0LlxuICAgICAqXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBwYy5hcHAucm9vdC5maW5kQnlOYW1lKFwiSW52ZW50b3J5XCIpLmVsZW1lbnQucGl2b3QgPSBbTWF0aC5yYW5kb20oKSAqIDAuMSwgTWF0aC5yYW5kb20oKSAqIDAuMV07XG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBwYy5hcHAucm9vdC5maW5kQnlOYW1lKFwiSW52ZW50b3J5XCIpLmVsZW1lbnQucGl2b3QgPSBuZXcgcGMuVmVjMihNYXRoLnJhbmRvbSgpICogMC4xLCBNYXRoLnJhbmRvbSgpICogMC4xKTtcbiAgICAgKlxuICAgICAqIEB0eXBlIHtWZWMyIHwgbnVtYmVyW119XG4gICAgICovXG4gICAgc2V0IHBpdm90KHZhbHVlKSB7XG4gICAgICAgIGNvbnN0IHsgcGl2b3QsIG1hcmdpbiB9ID0gdGhpcztcbiAgICAgICAgY29uc3QgcHJldlggPSBwaXZvdC54O1xuICAgICAgICBjb25zdCBwcmV2WSA9IHBpdm90Lnk7XG5cbiAgICAgICAgaWYgKHZhbHVlIGluc3RhbmNlb2YgVmVjMikge1xuICAgICAgICAgICAgcGl2b3QuY29weSh2YWx1ZSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwaXZvdC5zZXQoLi4udmFsdWUpO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgbXggPSBtYXJnaW4ueCArIG1hcmdpbi56O1xuICAgICAgICBjb25zdCBkeCA9IHBpdm90LnggLSBwcmV2WDtcbiAgICAgICAgbWFyZ2luLnggKz0gbXggKiBkeDtcbiAgICAgICAgbWFyZ2luLnogLT0gbXggKiBkeDtcblxuICAgICAgICBjb25zdCBteSA9IG1hcmdpbi55ICsgbWFyZ2luLnc7XG4gICAgICAgIGNvbnN0IGR5ID0gcGl2b3QueSAtIHByZXZZO1xuICAgICAgICBtYXJnaW4ueSArPSBteSAqIGR5O1xuICAgICAgICBtYXJnaW4udyAtPSBteSAqIGR5O1xuXG4gICAgICAgIHRoaXMuX2FuY2hvckRpcnR5ID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5fY29ybmVyc0RpcnR5ID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5fd29ybGRDb3JuZXJzRGlydHkgPSB0cnVlO1xuXG4gICAgICAgIHRoaXMuX2NhbGN1bGF0ZVNpemUoZmFsc2UsIGZhbHNlKTtcblxuICAgICAgICAvLyB3ZSBuZWVkIHRvIGZsYWcgY2hpbGRyZW4gYXMgZGlydHkgdG9vXG4gICAgICAgIC8vIGluIG9yZGVyIGZvciB0aGVtIHRvIHVwZGF0ZSB0aGVpciBwb3NpdGlvblxuICAgICAgICB0aGlzLl9mbGFnQ2hpbGRyZW5Bc0RpcnR5KCk7XG5cbiAgICAgICAgdGhpcy5maXJlKCdzZXQ6cGl2b3QnLCBwaXZvdCk7XG4gICAgfVxuXG4gICAgZ2V0IHBpdm90KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fcGl2b3Q7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVGhlIGRpc3RhbmNlIGZyb20gdGhlIHJpZ2h0IGVkZ2Ugb2YgdGhlIGFuY2hvci4gQ2FuIGJlIHVzZWQgaW4gY29tYmluYXRpb24gd2l0aCBhIHNwbGl0XG4gICAgICogYW5jaG9yIHRvIG1ha2UgdGhlIGNvbXBvbmVudCdzIHJpZ2h0IGVkZ2UgYWx3YXlzIGJlICdyaWdodCcgdW5pdHMgYXdheSBmcm9tIHRoZSByaWdodC5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtudW1iZXJ9XG4gICAgICovXG4gICAgc2V0IHJpZ2h0KHZhbHVlKSB7XG4gICAgICAgIHRoaXMuX21hcmdpbi56ID0gdmFsdWU7XG5cbiAgICAgICAgLy8gdXBkYXRlIHdpZHRoXG4gICAgICAgIGNvbnN0IHAgPSB0aGlzLmVudGl0eS5nZXRMb2NhbFBvc2l0aW9uKCk7XG4gICAgICAgIGNvbnN0IHdsID0gdGhpcy5fYWJzTGVmdDtcbiAgICAgICAgY29uc3Qgd3IgPSB0aGlzLl9sb2NhbEFuY2hvci56IC0gdmFsdWU7XG4gICAgICAgIHRoaXMuX3NldFdpZHRoKHdyIC0gd2wpO1xuXG4gICAgICAgIC8vIHVwZGF0ZSBwb3NpdGlvblxuICAgICAgICBwLnggPSAodGhpcy5fbG9jYWxBbmNob3IueiAtIHRoaXMuX2xvY2FsQW5jaG9yLngpIC0gdmFsdWUgLSAodGhpcy5fY2FsY3VsYXRlZFdpZHRoICogKDEgLSB0aGlzLl9waXZvdC54KSk7XG4gICAgICAgIHRoaXMuZW50aXR5LnNldExvY2FsUG9zaXRpb24ocCk7XG4gICAgfVxuXG4gICAgZ2V0IHJpZ2h0KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fbWFyZ2luLno7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQW4gYXJyYXkgb2YgNCB7QGxpbmsgVmVjM31zIHRoYXQgcmVwcmVzZW50IHRoZSBib3R0b20gbGVmdCwgYm90dG9tIHJpZ2h0LCB0b3AgcmlnaHQgYW5kIHRvcFxuICAgICAqIGxlZnQgY29ybmVycyBvZiB0aGUgY29tcG9uZW50IHJlbGF0aXZlIHRvIGl0cyBwYXJlbnQge0BsaW5rIFNjcmVlbkNvbXBvbmVudH0uXG4gICAgICpcbiAgICAgKiBAdHlwZSB7VmVjM1tdfVxuICAgICAqL1xuICAgIGdldCBzY3JlZW5Db3JuZXJzKCkge1xuICAgICAgICBpZiAoIXRoaXMuX2Nvcm5lcnNEaXJ0eSB8fCAhdGhpcy5zY3JlZW4pXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fc2NyZWVuQ29ybmVycztcblxuICAgICAgICBjb25zdCBwYXJlbnRCb3R0b21MZWZ0ID0gdGhpcy5lbnRpdHkucGFyZW50ICYmIHRoaXMuZW50aXR5LnBhcmVudC5lbGVtZW50ICYmIHRoaXMuZW50aXR5LnBhcmVudC5lbGVtZW50LnNjcmVlbkNvcm5lcnNbMF07XG5cbiAgICAgICAgLy8gaW5pdCBjb3JuZXJzXG4gICAgICAgIHRoaXMuX3NjcmVlbkNvcm5lcnNbMF0uc2V0KHRoaXMuX2Fic0xlZnQsIHRoaXMuX2Fic0JvdHRvbSwgMCk7XG4gICAgICAgIHRoaXMuX3NjcmVlbkNvcm5lcnNbMV0uc2V0KHRoaXMuX2Fic1JpZ2h0LCB0aGlzLl9hYnNCb3R0b20sIDApO1xuICAgICAgICB0aGlzLl9zY3JlZW5Db3JuZXJzWzJdLnNldCh0aGlzLl9hYnNSaWdodCwgdGhpcy5fYWJzVG9wLCAwKTtcbiAgICAgICAgdGhpcy5fc2NyZWVuQ29ybmVyc1szXS5zZXQodGhpcy5fYWJzTGVmdCwgdGhpcy5fYWJzVG9wLCAwKTtcblxuICAgICAgICAvLyB0cmFuc2Zvcm0gY29ybmVycyB0byBzY3JlZW4gc3BhY2VcbiAgICAgICAgY29uc3Qgc2NyZWVuU3BhY2UgPSB0aGlzLnNjcmVlbi5zY3JlZW4uc2NyZWVuU3BhY2U7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgNDsgaSsrKSB7XG4gICAgICAgICAgICB0aGlzLl9zY3JlZW5UcmFuc2Zvcm0udHJhbnNmb3JtUG9pbnQodGhpcy5fc2NyZWVuQ29ybmVyc1tpXSwgdGhpcy5fc2NyZWVuQ29ybmVyc1tpXSk7XG4gICAgICAgICAgICBpZiAoc2NyZWVuU3BhY2UpXG4gICAgICAgICAgICAgICAgdGhpcy5fc2NyZWVuQ29ybmVyc1tpXS5tdWxTY2FsYXIodGhpcy5zY3JlZW4uc2NyZWVuLnNjYWxlKTtcblxuICAgICAgICAgICAgaWYgKHBhcmVudEJvdHRvbUxlZnQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9zY3JlZW5Db3JuZXJzW2ldLmFkZChwYXJlbnRCb3R0b21MZWZ0KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuX2Nvcm5lcnNEaXJ0eSA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9jYW52YXNDb3JuZXJzRGlydHkgPSB0cnVlO1xuICAgICAgICB0aGlzLl93b3JsZENvcm5lcnNEaXJ0eSA9IHRydWU7XG5cbiAgICAgICAgcmV0dXJuIHRoaXMuX3NjcmVlbkNvcm5lcnM7XG5cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUaGUgd2lkdGggb2YgdGhlIHRleHQgcmVuZGVyZWQgYnkgdGhlIGNvbXBvbmVudC4gT25seSB3b3JrcyBmb3Ige0BsaW5rIEVMRU1FTlRUWVBFX1RFWFR9IHR5cGVzLlxuICAgICAqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKi9cbiAgICBnZXQgdGV4dFdpZHRoKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fdGV4dCA/IHRoaXMuX3RleHQud2lkdGggOiAwO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRoZSBoZWlnaHQgb2YgdGhlIHRleHQgcmVuZGVyZWQgYnkgdGhlIGNvbXBvbmVudC4gT25seSB3b3JrcyBmb3Ige0BsaW5rIEVMRU1FTlRUWVBFX1RFWFR9IHR5cGVzLlxuICAgICAqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKi9cbiAgICBnZXQgdGV4dEhlaWdodCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3RleHQgPyB0aGlzLl90ZXh0LmhlaWdodCA6IDA7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVGhlIGRpc3RhbmNlIGZyb20gdGhlIHRvcCBlZGdlIG9mIHRoZSBhbmNob3IuIENhbiBiZSB1c2VkIGluIGNvbWJpbmF0aW9uIHdpdGggYSBzcGxpdCBhbmNob3JcbiAgICAgKiB0byBtYWtlIHRoZSBjb21wb25lbnQncyBib3R0b20gZWRnZSBhbHdheXMgYmUgJ2JvdHRvbScgdW5pdHMgYXdheSBmcm9tIHRoZSBib3R0b20uXG4gICAgICpcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqL1xuICAgIHNldCB0b3AodmFsdWUpIHtcbiAgICAgICAgdGhpcy5fbWFyZ2luLncgPSB2YWx1ZTtcbiAgICAgICAgY29uc3QgcCA9IHRoaXMuZW50aXR5LmdldExvY2FsUG9zaXRpb24oKTtcbiAgICAgICAgY29uc3Qgd2IgPSB0aGlzLl9hYnNCb3R0b207XG4gICAgICAgIGNvbnN0IHd0ID0gdGhpcy5fbG9jYWxBbmNob3IudyAtIHZhbHVlO1xuICAgICAgICB0aGlzLl9zZXRIZWlnaHQod3QgLSB3Yik7XG5cbiAgICAgICAgcC55ID0gKHRoaXMuX2xvY2FsQW5jaG9yLncgLSB0aGlzLl9sb2NhbEFuY2hvci55KSAtIHZhbHVlIC0gdGhpcy5fY2FsY3VsYXRlZEhlaWdodCAqICgxIC0gdGhpcy5fcGl2b3QueSk7XG4gICAgICAgIHRoaXMuZW50aXR5LnNldExvY2FsUG9zaXRpb24ocCk7XG4gICAgfVxuXG4gICAgZ2V0IHRvcCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX21hcmdpbi53O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRoZSB0eXBlIG9mIHRoZSBFbGVtZW50Q29tcG9uZW50LiBDYW4gYmU6XG4gICAgICpcbiAgICAgKiAtIHtAbGluayBFTEVNRU5UVFlQRV9HUk9VUH06IFRoZSBjb21wb25lbnQgY2FuIGJlIHVzZWQgYXMgYSBsYXlvdXQgbWVjaGFuaXNtIHRvIGNyZWF0ZSBncm91cHMgb2ZcbiAgICAgKiBFbGVtZW50Q29tcG9uZW50cyBlLmcuIHBhbmVscy5cbiAgICAgKiAtIHtAbGluayBFTEVNRU5UVFlQRV9JTUFHRX06IFRoZSBjb21wb25lbnQgd2lsbCByZW5kZXIgYW4gaW1hZ2VcbiAgICAgKiAtIHtAbGluayBFTEVNRU5UVFlQRV9URVhUfTogVGhlIGNvbXBvbmVudCB3aWxsIHJlbmRlciB0ZXh0XG4gICAgICpcbiAgICAgKiBAdHlwZSB7c3RyaW5nfVxuICAgICAqL1xuICAgIHNldCB0eXBlKHZhbHVlKSB7XG4gICAgICAgIGlmICh2YWx1ZSAhPT0gdGhpcy5fdHlwZSkge1xuICAgICAgICAgICAgdGhpcy5fdHlwZSA9IHZhbHVlO1xuXG4gICAgICAgICAgICBpZiAodGhpcy5faW1hZ2UpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9pbWFnZS5kZXN0cm95KCk7XG4gICAgICAgICAgICAgICAgdGhpcy5faW1hZ2UgPSBudWxsO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHRoaXMuX3RleHQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl90ZXh0LmRlc3Ryb3koKTtcbiAgICAgICAgICAgICAgICB0aGlzLl90ZXh0ID0gbnVsbDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHZhbHVlID09PSBFTEVNRU5UVFlQRV9JTUFHRSkge1xuICAgICAgICAgICAgICAgIHRoaXMuX2ltYWdlID0gbmV3IEltYWdlRWxlbWVudCh0aGlzKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodmFsdWUgPT09IEVMRU1FTlRUWVBFX1RFWFQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl90ZXh0ID0gbmV3IFRleHRFbGVtZW50KHRoaXMpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2V0IHR5cGUoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl90eXBlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIElmIHRydWUgdGhlbiB0aGUgY29tcG9uZW50IHdpbGwgcmVjZWl2ZSBNb3VzZSBvciBUb3VjaCBpbnB1dCBldmVudHMuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICAgKi9cbiAgICBzZXQgdXNlSW5wdXQodmFsdWUpIHtcbiAgICAgICAgaWYgKHRoaXMuX3VzZUlucHV0ID09PSB2YWx1ZSlcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICB0aGlzLl91c2VJbnB1dCA9IHZhbHVlO1xuXG4gICAgICAgIGlmICh0aGlzLnN5c3RlbS5hcHAuZWxlbWVudElucHV0KSB7XG4gICAgICAgICAgICBpZiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5lbmFibGVkICYmIHRoaXMuZW50aXR5LmVuYWJsZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zeXN0ZW0uYXBwLmVsZW1lbnRJbnB1dC5hZGRFbGVtZW50KHRoaXMpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zeXN0ZW0uYXBwLmVsZW1lbnRJbnB1dC5yZW1vdmVFbGVtZW50KHRoaXMpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaWYgKHRoaXMuX3VzZUlucHV0ID09PSB0cnVlKSB7XG4gICAgICAgICAgICAgICAgRGVidWcud2FybignRWxlbWVudHMgd2lsbCBub3QgZ2V0IGFueSBpbnB1dCBldmVudHMgYmVjYXVzZSB0aGlzLnN5c3RlbS5hcHAuZWxlbWVudElucHV0IGlzIG5vdCBjcmVhdGVkJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmZpcmUoJ3NldDp1c2VJbnB1dCcsIHZhbHVlKTtcbiAgICB9XG5cbiAgICBnZXQgdXNlSW5wdXQoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl91c2VJbnB1dDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXQgaG93IHRoZSBjb250ZW50IHNob3VsZCBiZSBmaXR0ZWQgYW5kIHByZXNlcnZlIHRoZSBhc3BlY3QgcmF0aW8gb2YgdGhlIHNvdXJjZSB0ZXh0dXJlIG9yIHNwcml0ZS5cbiAgICAgKiBPbmx5IHdvcmtzIGZvciB7QGxpbmsgRUxFTUVOVFRZUEVfSU1BR0V9IHR5cGVzLiBDYW4gYmU6XG4gICAgICpcbiAgICAgKiAtIHtAbGluayBGSVRNT0RFX1NUUkVUQ0h9OiBGaXQgdGhlIGNvbnRlbnQgZXhhY3RseSB0byBFbGVtZW50J3MgYm91bmRpbmcgYm94LlxuICAgICAqIC0ge0BsaW5rIEZJVE1PREVfQ09OVEFJTn06IEZpdCB0aGUgY29udGVudCB3aXRoaW4gdGhlIEVsZW1lbnQncyBib3VuZGluZyBib3ggd2hpbGUgcHJlc2VydmluZyBpdHMgQXNwZWN0IFJhdGlvLlxuICAgICAqIC0ge0BsaW5rIEZJVE1PREVfQ09WRVJ9OiBGaXQgdGhlIGNvbnRlbnQgdG8gY292ZXIgdGhlIGVudGlyZSBFbGVtZW50J3MgYm91bmRpbmcgYm94IHdoaWxlIHByZXNlcnZpbmcgaXRzIEFzcGVjdCBSYXRpby5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtzdHJpbmd9XG4gICAgICovXG4gICAgc2V0IGZpdE1vZGUodmFsdWUpIHtcbiAgICAgICAgdGhpcy5fZml0TW9kZSA9IHZhbHVlO1xuICAgICAgICB0aGlzLl9jYWxjdWxhdGVTaXplKHRydWUsIHRydWUpO1xuICAgICAgICBpZiAodGhpcy5faW1hZ2UpIHtcbiAgICAgICAgICAgIHRoaXMuX2ltYWdlLnJlZnJlc2hNZXNoKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBnZXQgZml0TW9kZSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2ZpdE1vZGU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVGhlIHdpZHRoIG9mIHRoZSBlbGVtZW50IGFzIHNldCBpbiB0aGUgZWRpdG9yLiBOb3RlIHRoYXQgaW4gc29tZSBjYXNlcyB0aGlzIG1heSBub3QgcmVmbGVjdFxuICAgICAqIHRoZSB0cnVlIHdpZHRoIGF0IHdoaWNoIHRoZSBlbGVtZW50IGlzIHJlbmRlcmVkLCBzdWNoIGFzIHdoZW4gdGhlIGVsZW1lbnQgaXMgdW5kZXIgdGhlXG4gICAgICogY29udHJvbCBvZiBhIHtAbGluayBMYXlvdXRHcm91cENvbXBvbmVudH0uIFNlZSBgY2FsY3VsYXRlZFdpZHRoYCBpbiBvcmRlciB0byBlbnN1cmUgeW91IGFyZVxuICAgICAqIHJlYWRpbmcgdGhlIHRydWUgd2lkdGggYXQgd2hpY2ggdGhlIGVsZW1lbnQgd2lsbCBiZSByZW5kZXJlZC5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtudW1iZXJ9XG4gICAgICovXG4gICAgc2V0IHdpZHRoKHZhbHVlKSB7XG4gICAgICAgIHRoaXMuX3dpZHRoID0gdmFsdWU7XG5cbiAgICAgICAgaWYgKCF0aGlzLl9oYXNTcGxpdEFuY2hvcnNYKSB7XG4gICAgICAgICAgICB0aGlzLl9zZXRDYWxjdWxhdGVkV2lkdGgodmFsdWUsIHRydWUpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5maXJlKCdzZXQ6d2lkdGgnLCB0aGlzLl93aWR0aCk7XG4gICAgfVxuXG4gICAgZ2V0IHdpZHRoKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fd2lkdGg7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQW4gYXJyYXkgb2YgNCB7QGxpbmsgVmVjM31zIHRoYXQgcmVwcmVzZW50IHRoZSBib3R0b20gbGVmdCwgYm90dG9tIHJpZ2h0LCB0b3AgcmlnaHQgYW5kIHRvcFxuICAgICAqIGxlZnQgY29ybmVycyBvZiB0aGUgY29tcG9uZW50IGluIHdvcmxkIHNwYWNlLiBPbmx5IHdvcmtzIGZvciAzRCBlbGVtZW50IGNvbXBvbmVudHMuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7VmVjM1tdfVxuICAgICAqL1xuICAgIGdldCB3b3JsZENvcm5lcnMoKSB7XG4gICAgICAgIGlmICghdGhpcy5fd29ybGRDb3JuZXJzRGlydHkpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl93b3JsZENvcm5lcnM7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5zY3JlZW4pIHtcbiAgICAgICAgICAgIGNvbnN0IHNjcmVlbkNvcm5lcnMgPSB0aGlzLnNjcmVlbkNvcm5lcnM7XG5cbiAgICAgICAgICAgIGlmICghdGhpcy5zY3JlZW4uc2NyZWVuLnNjcmVlblNwYWNlKSB7XG4gICAgICAgICAgICAgICAgbWF0QS5jb3B5KHRoaXMuc2NyZWVuLnNjcmVlbi5fc2NyZWVuTWF0cml4KTtcblxuICAgICAgICAgICAgICAgIC8vIGZsaXAgc2NyZWVuIG1hdHJpeCBhbG9uZyB0aGUgaG9yaXpvbnRhbCBheGlzXG4gICAgICAgICAgICAgICAgbWF0QS5kYXRhWzEzXSA9IC1tYXRBLmRhdGFbMTNdO1xuXG4gICAgICAgICAgICAgICAgLy8gY3JlYXRlIHRyYW5zZm9ybSB0aGF0IGJyaW5ncyBzY3JlZW4gY29ybmVycyB0byB3b3JsZCBzcGFjZVxuICAgICAgICAgICAgICAgIG1hdEEubXVsMih0aGlzLnNjcmVlbi5nZXRXb3JsZFRyYW5zZm9ybSgpLCBtYXRBKTtcblxuICAgICAgICAgICAgICAgIC8vIHRyYW5zZm9ybSBzY3JlZW4gY29ybmVycyB0byB3b3JsZCBzcGFjZVxuICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgNDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIG1hdEEudHJhbnNmb3JtUG9pbnQoc2NyZWVuQ29ybmVyc1tpXSwgdGhpcy5fd29ybGRDb3JuZXJzW2ldKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zdCBsb2NhbFBvcyA9IHRoaXMuZW50aXR5LmdldExvY2FsUG9zaXRpb24oKTtcblxuICAgICAgICAgICAgLy8gcm90YXRlIGFuZCBzY2FsZSBhcm91bmQgcGl2b3RcbiAgICAgICAgICAgIG1hdEEuc2V0VHJhbnNsYXRlKC1sb2NhbFBvcy54LCAtbG9jYWxQb3MueSwgLWxvY2FsUG9zLnopO1xuICAgICAgICAgICAgbWF0Qi5zZXRUUlMoVmVjMy5aRVJPLCB0aGlzLmVudGl0eS5nZXRMb2NhbFJvdGF0aW9uKCksIHRoaXMuZW50aXR5LmdldExvY2FsU2NhbGUoKSk7XG4gICAgICAgICAgICBtYXRDLnNldFRyYW5zbGF0ZShsb2NhbFBvcy54LCBsb2NhbFBvcy55LCBsb2NhbFBvcy56KTtcblxuICAgICAgICAgICAgLy8gZ2V0IHBhcmVudCB3b3JsZCB0cmFuc2Zvcm0gKGJ1dCB1c2UgdGhpcyBlbnRpdHkgaWYgdGhlcmUgaXMgbm8gcGFyZW50KVxuICAgICAgICAgICAgY29uc3QgZW50aXR5ID0gdGhpcy5lbnRpdHkucGFyZW50ID8gdGhpcy5lbnRpdHkucGFyZW50IDogdGhpcy5lbnRpdHk7XG4gICAgICAgICAgICBtYXRELmNvcHkoZW50aXR5LmdldFdvcmxkVHJhbnNmb3JtKCkpO1xuICAgICAgICAgICAgbWF0RC5tdWwobWF0QykubXVsKG1hdEIpLm11bChtYXRBKTtcblxuICAgICAgICAgICAgLy8gYm90dG9tIGxlZnRcbiAgICAgICAgICAgIHZlY0Euc2V0KGxvY2FsUG9zLnggLSB0aGlzLnBpdm90LnggKiB0aGlzLmNhbGN1bGF0ZWRXaWR0aCwgbG9jYWxQb3MueSAtIHRoaXMucGl2b3QueSAqIHRoaXMuY2FsY3VsYXRlZEhlaWdodCwgbG9jYWxQb3Mueik7XG4gICAgICAgICAgICBtYXRELnRyYW5zZm9ybVBvaW50KHZlY0EsIHRoaXMuX3dvcmxkQ29ybmVyc1swXSk7XG5cbiAgICAgICAgICAgIC8vIGJvdHRvbSByaWdodFxuICAgICAgICAgICAgdmVjQS5zZXQobG9jYWxQb3MueCArICgxIC0gdGhpcy5waXZvdC54KSAqIHRoaXMuY2FsY3VsYXRlZFdpZHRoLCBsb2NhbFBvcy55IC0gdGhpcy5waXZvdC55ICogdGhpcy5jYWxjdWxhdGVkSGVpZ2h0LCBsb2NhbFBvcy56KTtcbiAgICAgICAgICAgIG1hdEQudHJhbnNmb3JtUG9pbnQodmVjQSwgdGhpcy5fd29ybGRDb3JuZXJzWzFdKTtcblxuICAgICAgICAgICAgLy8gdG9wIHJpZ2h0XG4gICAgICAgICAgICB2ZWNBLnNldChsb2NhbFBvcy54ICsgKDEgLSB0aGlzLnBpdm90LngpICogdGhpcy5jYWxjdWxhdGVkV2lkdGgsIGxvY2FsUG9zLnkgKyAoMSAtIHRoaXMucGl2b3QueSkgKiB0aGlzLmNhbGN1bGF0ZWRIZWlnaHQsIGxvY2FsUG9zLnopO1xuICAgICAgICAgICAgbWF0RC50cmFuc2Zvcm1Qb2ludCh2ZWNBLCB0aGlzLl93b3JsZENvcm5lcnNbMl0pO1xuXG4gICAgICAgICAgICAvLyB0b3AgbGVmdFxuICAgICAgICAgICAgdmVjQS5zZXQobG9jYWxQb3MueCAtIHRoaXMucGl2b3QueCAqIHRoaXMuY2FsY3VsYXRlZFdpZHRoLCBsb2NhbFBvcy55ICsgKDEgLSB0aGlzLnBpdm90LnkpICogdGhpcy5jYWxjdWxhdGVkSGVpZ2h0LCBsb2NhbFBvcy56KTtcbiAgICAgICAgICAgIG1hdEQudHJhbnNmb3JtUG9pbnQodmVjQSwgdGhpcy5fd29ybGRDb3JuZXJzWzNdKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuX3dvcmxkQ29ybmVyc0RpcnR5ID0gZmFsc2U7XG5cbiAgICAgICAgcmV0dXJuIHRoaXMuX3dvcmxkQ29ybmVycztcblxuICAgIH1cblxuICAgIF9wYXRjaCgpIHtcbiAgICAgICAgdGhpcy5lbnRpdHkuX3N5bmMgPSB0aGlzLl9zeW5jO1xuICAgICAgICB0aGlzLmVudGl0eS5zZXRQb3NpdGlvbiA9IHRoaXMuX3NldFBvc2l0aW9uO1xuICAgICAgICB0aGlzLmVudGl0eS5zZXRMb2NhbFBvc2l0aW9uID0gdGhpcy5fc2V0TG9jYWxQb3NpdGlvbjtcbiAgICB9XG5cbiAgICBfdW5wYXRjaCgpIHtcbiAgICAgICAgdGhpcy5lbnRpdHkuX3N5bmMgPSBFbnRpdHkucHJvdG90eXBlLl9zeW5jO1xuICAgICAgICB0aGlzLmVudGl0eS5zZXRQb3NpdGlvbiA9IEVudGl0eS5wcm90b3R5cGUuc2V0UG9zaXRpb247XG4gICAgICAgIHRoaXMuZW50aXR5LnNldExvY2FsUG9zaXRpb24gPSBFbnRpdHkucHJvdG90eXBlLnNldExvY2FsUG9zaXRpb247XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUGF0Y2hlZCBtZXRob2QgZm9yIHNldHRpbmcgdGhlIHBvc2l0aW9uLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtudW1iZXJ8VmVjM30geCAtIFRoZSB4IGNvb3JkaW5hdGUgb3IgVmVjM1xuICAgICAqIEBwYXJhbSB7bnVtYmVyfSB5IC0gVGhlIHkgY29vcmRpbmF0ZVxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSB6IC0gVGhlIHogY29vcmRpbmF0ZVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX3NldFBvc2l0aW9uKHgsIHksIHopIHtcbiAgICAgICAgaWYgKCF0aGlzLmVsZW1lbnQuc2NyZWVuKSB7XG4gICAgICAgICAgICBFbnRpdHkucHJvdG90eXBlLnNldFBvc2l0aW9uLmNhbGwodGhpcywgeCwgeSwgeik7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoeCBpbnN0YW5jZW9mIFZlYzMpIHtcbiAgICAgICAgICAgIHBvc2l0aW9uLmNvcHkoeCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwb3NpdGlvbi5zZXQoeCwgeSwgeik7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmdldFdvcmxkVHJhbnNmb3JtKCk7IC8vIGVuc3VyZSBoaWVyYXJjaHkgaXMgdXAgdG8gZGF0ZVxuICAgICAgICBpbnZQYXJlbnRXdG0uY29weSh0aGlzLmVsZW1lbnQuX3NjcmVlblRvV29ybGQpLmludmVydCgpO1xuICAgICAgICBpbnZQYXJlbnRXdG0udHJhbnNmb3JtUG9pbnQocG9zaXRpb24sIHRoaXMubG9jYWxQb3NpdGlvbik7XG5cbiAgICAgICAgaWYgKCF0aGlzLl9kaXJ0eUxvY2FsKVxuICAgICAgICAgICAgdGhpcy5fZGlydGlmeUxvY2FsKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUGF0Y2hlZCBtZXRob2QgZm9yIHNldHRpbmcgdGhlIGxvY2FsIHBvc2l0aW9uLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtudW1iZXJ8VmVjM30geCAtIFRoZSB4IGNvb3JkaW5hdGUgb3IgVmVjM1xuICAgICAqIEBwYXJhbSB7bnVtYmVyfSB5IC0gVGhlIHkgY29vcmRpbmF0ZVxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSB6IC0gVGhlIHogY29vcmRpbmF0ZVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX3NldExvY2FsUG9zaXRpb24oeCwgeSwgeikge1xuICAgICAgICBpZiAoeCBpbnN0YW5jZW9mIFZlYzMpIHtcbiAgICAgICAgICAgIHRoaXMubG9jYWxQb3NpdGlvbi5jb3B5KHgpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5sb2NhbFBvc2l0aW9uLnNldCh4LCB5LCB6KTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHVwZGF0ZSBtYXJnaW5cbiAgICAgICAgY29uc3QgZWxlbWVudCA9IHRoaXMuZWxlbWVudDtcbiAgICAgICAgY29uc3QgcCA9IHRoaXMubG9jYWxQb3NpdGlvbjtcbiAgICAgICAgY29uc3QgcHZ0ID0gZWxlbWVudC5fcGl2b3Q7XG4gICAgICAgIGVsZW1lbnQuX21hcmdpbi54ID0gcC54IC0gZWxlbWVudC5fY2FsY3VsYXRlZFdpZHRoICogcHZ0Lng7XG4gICAgICAgIGVsZW1lbnQuX21hcmdpbi56ID0gKGVsZW1lbnQuX2xvY2FsQW5jaG9yLnogLSBlbGVtZW50Ll9sb2NhbEFuY2hvci54KSAtIGVsZW1lbnQuX2NhbGN1bGF0ZWRXaWR0aCAtIGVsZW1lbnQuX21hcmdpbi54O1xuICAgICAgICBlbGVtZW50Ll9tYXJnaW4ueSA9IHAueSAtIGVsZW1lbnQuX2NhbGN1bGF0ZWRIZWlnaHQgKiBwdnQueTtcbiAgICAgICAgZWxlbWVudC5fbWFyZ2luLncgPSAoZWxlbWVudC5fbG9jYWxBbmNob3IudyAtIGVsZW1lbnQuX2xvY2FsQW5jaG9yLnkpIC0gZWxlbWVudC5fY2FsY3VsYXRlZEhlaWdodCAtIGVsZW1lbnQuX21hcmdpbi55O1xuXG4gICAgICAgIGlmICghdGhpcy5fZGlydHlMb2NhbClcbiAgICAgICAgICAgIHRoaXMuX2RpcnRpZnlMb2NhbCgpO1xuICAgIH1cblxuICAgIC8vIHRoaXMgbWV0aG9kIG92ZXJ3cml0ZXMgR3JhcGhOb2RlI3N5bmMgYW5kIHNvIG9wZXJhdGVzIGluIHNjb3BlIG9mIHRoZSBFbnRpdHkuXG4gICAgX3N5bmMoKSB7XG4gICAgICAgIGNvbnN0IGVsZW1lbnQgPSB0aGlzLmVsZW1lbnQ7XG4gICAgICAgIGNvbnN0IHNjcmVlbiA9IGVsZW1lbnQuc2NyZWVuO1xuXG4gICAgICAgIGlmIChzY3JlZW4pIHtcblxuICAgICAgICAgICAgaWYgKGVsZW1lbnQuX2FuY2hvckRpcnR5KSB7XG4gICAgICAgICAgICAgICAgbGV0IHJlc3ggPSAwO1xuICAgICAgICAgICAgICAgIGxldCByZXN5ID0gMDtcbiAgICAgICAgICAgICAgICBsZXQgcHggPSAwO1xuICAgICAgICAgICAgICAgIGxldCBweSA9IDE7XG5cbiAgICAgICAgICAgICAgICBpZiAodGhpcy5fcGFyZW50ICYmIHRoaXMuX3BhcmVudC5lbGVtZW50KSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIHVzZSBwYXJlbnQgcmVjdFxuICAgICAgICAgICAgICAgICAgICByZXN4ID0gdGhpcy5fcGFyZW50LmVsZW1lbnQuY2FsY3VsYXRlZFdpZHRoO1xuICAgICAgICAgICAgICAgICAgICByZXN5ID0gdGhpcy5fcGFyZW50LmVsZW1lbnQuY2FsY3VsYXRlZEhlaWdodDtcbiAgICAgICAgICAgICAgICAgICAgcHggPSB0aGlzLl9wYXJlbnQuZWxlbWVudC5waXZvdC54O1xuICAgICAgICAgICAgICAgICAgICBweSA9IHRoaXMuX3BhcmVudC5lbGVtZW50LnBpdm90Lnk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gdXNlIHNjcmVlbiByZWN0XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlc29sdXRpb24gPSBzY3JlZW4uc2NyZWVuLnJlc29sdXRpb247XG4gICAgICAgICAgICAgICAgICAgIHJlc3ggPSByZXNvbHV0aW9uLnggLyBzY3JlZW4uc2NyZWVuLnNjYWxlO1xuICAgICAgICAgICAgICAgICAgICByZXN5ID0gcmVzb2x1dGlvbi55IC8gc2NyZWVuLnNjcmVlbi5zY2FsZTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBlbGVtZW50Ll9hbmNob3JUcmFuc2Zvcm0uc2V0VHJhbnNsYXRlKChyZXN4ICogKGVsZW1lbnQuYW5jaG9yLnggLSBweCkpLCAtKHJlc3kgKiAocHkgLSBlbGVtZW50LmFuY2hvci55KSksIDApO1xuICAgICAgICAgICAgICAgIGVsZW1lbnQuX2FuY2hvckRpcnR5ID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgZWxlbWVudC5fY2FsY3VsYXRlTG9jYWxBbmNob3JzKCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIGlmIGVsZW1lbnQgc2l6ZSBpcyBkaXJ0eVxuICAgICAgICAgICAgLy8gcmVjYWxjdWxhdGUgaXRzIHNpemVcbiAgICAgICAgICAgIC8vIFdBUk5JTkc6IE9yZGVyIGlzIGltcG9ydGFudCBhcyBjYWxjdWxhdGVTaXplIHJlc2V0cyBkaXJ0eUxvY2FsXG4gICAgICAgICAgICAvLyBzbyB0aGlzIG5lZWRzIHRvIHJ1biBiZWZvcmUgcmVzZXR0aW5nIGRpcnR5TG9jYWwgdG8gZmFsc2UgYmVsb3dcbiAgICAgICAgICAgIGlmIChlbGVtZW50Ll9zaXplRGlydHkpIHtcbiAgICAgICAgICAgICAgICBlbGVtZW50Ll9jYWxjdWxhdGVTaXplKGZhbHNlLCBmYWxzZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5fZGlydHlMb2NhbCkge1xuICAgICAgICAgICAgdGhpcy5sb2NhbFRyYW5zZm9ybS5zZXRUUlModGhpcy5sb2NhbFBvc2l0aW9uLCB0aGlzLmxvY2FsUm90YXRpb24sIHRoaXMubG9jYWxTY2FsZSk7XG5cbiAgICAgICAgICAgIC8vIHVwZGF0ZSBtYXJnaW5cbiAgICAgICAgICAgIGNvbnN0IHAgPSB0aGlzLmxvY2FsUG9zaXRpb247XG4gICAgICAgICAgICBjb25zdCBwdnQgPSBlbGVtZW50Ll9waXZvdDtcbiAgICAgICAgICAgIGVsZW1lbnQuX21hcmdpbi54ID0gcC54IC0gZWxlbWVudC5fY2FsY3VsYXRlZFdpZHRoICogcHZ0Lng7XG4gICAgICAgICAgICBlbGVtZW50Ll9tYXJnaW4ueiA9IChlbGVtZW50Ll9sb2NhbEFuY2hvci56IC0gZWxlbWVudC5fbG9jYWxBbmNob3IueCkgLSBlbGVtZW50Ll9jYWxjdWxhdGVkV2lkdGggLSBlbGVtZW50Ll9tYXJnaW4ueDtcbiAgICAgICAgICAgIGVsZW1lbnQuX21hcmdpbi55ID0gcC55IC0gZWxlbWVudC5fY2FsY3VsYXRlZEhlaWdodCAqIHB2dC55O1xuICAgICAgICAgICAgZWxlbWVudC5fbWFyZ2luLncgPSAoZWxlbWVudC5fbG9jYWxBbmNob3IudyAtIGVsZW1lbnQuX2xvY2FsQW5jaG9yLnkpIC0gZWxlbWVudC5fY2FsY3VsYXRlZEhlaWdodCAtIGVsZW1lbnQuX21hcmdpbi55O1xuXG4gICAgICAgICAgICB0aGlzLl9kaXJ0eUxvY2FsID0gZmFsc2U7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIXNjcmVlbikge1xuICAgICAgICAgICAgaWYgKHRoaXMuX2RpcnR5V29ybGQpIHtcbiAgICAgICAgICAgICAgICBlbGVtZW50Ll9jb3JuZXJzRGlydHkgPSB0cnVlO1xuICAgICAgICAgICAgICAgIGVsZW1lbnQuX2NhbnZhc0Nvcm5lcnNEaXJ0eSA9IHRydWU7XG4gICAgICAgICAgICAgICAgZWxlbWVudC5fd29ybGRDb3JuZXJzRGlydHkgPSB0cnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBFbnRpdHkucHJvdG90eXBlLl9zeW5jLmNhbGwodGhpcyk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuXG4gICAgICAgIGlmICh0aGlzLl9kaXJ0eVdvcmxkKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5fcGFyZW50ID09PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgdGhpcy53b3JsZFRyYW5zZm9ybS5jb3B5KHRoaXMubG9jYWxUcmFuc2Zvcm0pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyB0cmFuc2Zvcm0gZWxlbWVudCBoaWVyYXJjaHlcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5fcGFyZW50LmVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudC5fc2NyZWVuVG9Xb3JsZC5tdWwyKHRoaXMuX3BhcmVudC5lbGVtZW50Ll9tb2RlbFRyYW5zZm9ybSwgZWxlbWVudC5fYW5jaG9yVHJhbnNmb3JtKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBlbGVtZW50Ll9zY3JlZW5Ub1dvcmxkLmNvcHkoZWxlbWVudC5fYW5jaG9yVHJhbnNmb3JtKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBlbGVtZW50Ll9tb2RlbFRyYW5zZm9ybS5tdWwyKGVsZW1lbnQuX3NjcmVlblRvV29ybGQsIHRoaXMubG9jYWxUcmFuc2Zvcm0pO1xuXG4gICAgICAgICAgICAgICAgaWYgKHNjcmVlbikge1xuICAgICAgICAgICAgICAgICAgICBlbGVtZW50Ll9zY3JlZW5Ub1dvcmxkLm11bDIoc2NyZWVuLnNjcmVlbi5fc2NyZWVuTWF0cml4LCBlbGVtZW50Ll9zY3JlZW5Ub1dvcmxkKTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAoIXNjcmVlbi5zY3JlZW4uc2NyZWVuU3BhY2UpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsZW1lbnQuX3NjcmVlblRvV29ybGQubXVsMihzY3JlZW4ud29ybGRUcmFuc2Zvcm0sIGVsZW1lbnQuX3NjcmVlblRvV29ybGQpO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgdGhpcy53b3JsZFRyYW5zZm9ybS5tdWwyKGVsZW1lbnQuX3NjcmVlblRvV29ybGQsIHRoaXMubG9jYWxUcmFuc2Zvcm0pO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIHVwZGF0ZSBwYXJlbnQgd29ybGQgdHJhbnNmb3JtXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHBhcmVudFdvcmxkVHJhbnNmb3JtID0gZWxlbWVudC5fcGFyZW50V29ybGRUcmFuc2Zvcm07XG4gICAgICAgICAgICAgICAgICAgIHBhcmVudFdvcmxkVHJhbnNmb3JtLnNldElkZW50aXR5KCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHBhcmVudCA9IHRoaXMuX3BhcmVudDtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHBhcmVudCAmJiBwYXJlbnQuZWxlbWVudCAmJiBwYXJlbnQgIT09IHNjcmVlbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgbWF0QS5zZXRUUlMoVmVjMy5aRVJPLCBwYXJlbnQuZ2V0TG9jYWxSb3RhdGlvbigpLCBwYXJlbnQuZ2V0TG9jYWxTY2FsZSgpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhcmVudFdvcmxkVHJhbnNmb3JtLm11bDIocGFyZW50LmVsZW1lbnQuX3BhcmVudFdvcmxkVHJhbnNmb3JtLCBtYXRBKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIHVwZGF0ZSBlbGVtZW50IHRyYW5zZm9ybVxuICAgICAgICAgICAgICAgICAgICAvLyByb3RhdGUgYW5kIHNjYWxlIGFyb3VuZCBwaXZvdFxuICAgICAgICAgICAgICAgICAgICBjb25zdCBkZXB0aE9mZnNldCA9IHZlY0E7XG4gICAgICAgICAgICAgICAgICAgIGRlcHRoT2Zmc2V0LnNldCgwLCAwLCB0aGlzLmxvY2FsUG9zaXRpb24ueik7XG5cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcGl2b3RPZmZzZXQgPSB2ZWNCO1xuICAgICAgICAgICAgICAgICAgICBwaXZvdE9mZnNldC5zZXQoZWxlbWVudC5fYWJzTGVmdCArIGVsZW1lbnQuX3Bpdm90LnggKiBlbGVtZW50LmNhbGN1bGF0ZWRXaWR0aCwgZWxlbWVudC5fYWJzQm90dG9tICsgZWxlbWVudC5fcGl2b3QueSAqIGVsZW1lbnQuY2FsY3VsYXRlZEhlaWdodCwgMCk7XG5cbiAgICAgICAgICAgICAgICAgICAgbWF0QS5zZXRUcmFuc2xhdGUoLXBpdm90T2Zmc2V0LngsIC1waXZvdE9mZnNldC55LCAtcGl2b3RPZmZzZXQueik7XG4gICAgICAgICAgICAgICAgICAgIG1hdEIuc2V0VFJTKGRlcHRoT2Zmc2V0LCB0aGlzLmdldExvY2FsUm90YXRpb24oKSwgdGhpcy5nZXRMb2NhbFNjYWxlKCkpO1xuICAgICAgICAgICAgICAgICAgICBtYXRDLnNldFRyYW5zbGF0ZShwaXZvdE9mZnNldC54LCBwaXZvdE9mZnNldC55LCBwaXZvdE9mZnNldC56KTtcblxuICAgICAgICAgICAgICAgICAgICBlbGVtZW50Ll9zY3JlZW5UcmFuc2Zvcm0ubXVsMihlbGVtZW50Ll9wYXJlbnRXb3JsZFRyYW5zZm9ybSwgbWF0QykubXVsKG1hdEIpLm11bChtYXRBKTtcblxuICAgICAgICAgICAgICAgICAgICBlbGVtZW50Ll9jb3JuZXJzRGlydHkgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICBlbGVtZW50Ll9jYW52YXNDb3JuZXJzRGlydHkgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICBlbGVtZW50Ll93b3JsZENvcm5lcnNEaXJ0eSA9IHRydWU7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy53b3JsZFRyYW5zZm9ybS5jb3B5KGVsZW1lbnQuX21vZGVsVHJhbnNmb3JtKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuX2RpcnR5V29ybGQgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIF9vbkluc2VydChwYXJlbnQpIHtcbiAgICAgICAgLy8gd2hlbiB0aGUgZW50aXR5IGlzIHJlcGFyZW50ZWQgZmluZCBhIHBvc3NpYmxlIG5ldyBzY3JlZW4gYW5kIG1hc2tcblxuICAgICAgICBjb25zdCByZXN1bHQgPSB0aGlzLl9wYXJzZVVwVG9TY3JlZW4oKTtcblxuICAgICAgICB0aGlzLmVudGl0eS5fZGlydGlmeVdvcmxkKCk7XG5cbiAgICAgICAgdGhpcy5fdXBkYXRlU2NyZWVuKHJlc3VsdC5zY3JlZW4pO1xuXG4gICAgICAgIHRoaXMuX2RpcnRpZnlNYXNrKCk7XG4gICAgfVxuXG4gICAgX2RpcnRpZnlNYXNrKCkge1xuICAgICAgICBsZXQgY3VycmVudCA9IHRoaXMuZW50aXR5O1xuICAgICAgICB3aGlsZSAoY3VycmVudCkge1xuICAgICAgICAgICAgLy8gc2VhcmNoIHVwIHRoZSBoaWVyYXJjaHkgdW50aWwgd2UgZmluZCBhbiBlbnRpdHkgd2hpY2ggaGFzOlxuICAgICAgICAgICAgLy8gLSBubyBwYXJlbnRcbiAgICAgICAgICAgIC8vIC0gc2NyZWVuIGNvbXBvbmVudCBvbiBwYXJlbnRcbiAgICAgICAgICAgIGNvbnN0IG5leHQgPSBjdXJyZW50LnBhcmVudDtcbiAgICAgICAgICAgIGlmICgobmV4dCA9PT0gbnVsbCB8fCBuZXh0LnNjcmVlbikgJiYgY3VycmVudC5lbGVtZW50KSB7XG4gICAgICAgICAgICAgICAgaWYgKCF0aGlzLnN5c3RlbS5fcHJlcmVuZGVyIHx8ICF0aGlzLnN5c3RlbS5fcHJlcmVuZGVyLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnN5c3RlbS5fcHJlcmVuZGVyID0gW107XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc3lzdGVtLmFwcC5vbmNlKCdwcmVyZW5kZXInLCB0aGlzLl9vblByZXJlbmRlciwgdGhpcyk7XG5cbiAgICAgICAgICAgICAgICAgICAgRGVidWcudHJhY2UoVFJBQ0VfSURfRUxFTUVOVCwgJ3JlZ2lzdGVyIHByZXJlbmRlcicpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCBpID0gdGhpcy5zeXN0ZW0uX3ByZXJlbmRlci5pbmRleE9mKHRoaXMuZW50aXR5KTtcbiAgICAgICAgICAgICAgICBpZiAoaSA+PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc3lzdGVtLl9wcmVyZW5kZXIuc3BsaWNlKGksIDEpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCBqID0gdGhpcy5zeXN0ZW0uX3ByZXJlbmRlci5pbmRleE9mKGN1cnJlbnQpO1xuICAgICAgICAgICAgICAgIGlmIChqIDwgMCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnN5c3RlbS5fcHJlcmVuZGVyLnB1c2goY3VycmVudCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIERlYnVnLnRyYWNlKFRSQUNFX0lEX0VMRU1FTlQsICdzZXQgcHJlcmVuZGVyIHJvb3QgdG86ICcgKyBjdXJyZW50Lm5hbWUpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjdXJyZW50ID0gbmV4dDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIF9vblByZXJlbmRlcigpIHtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLnN5c3RlbS5fcHJlcmVuZGVyLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBtYXNrID0gdGhpcy5zeXN0ZW0uX3ByZXJlbmRlcltpXTtcbiAgICAgICAgICAgIERlYnVnLnRyYWNlKFRSQUNFX0lEX0VMRU1FTlQsICdwcmVyZW5kZXIgZnJvbTogJyArIG1hc2submFtZSk7XG5cbiAgICAgICAgICAgIC8vIHByZXZlbnQgY2FsbCBpZiBlbGVtZW50IGhhcyBiZWVuIHJlbW92ZWQgc2luY2UgYmVpbmcgYWRkZWRcbiAgICAgICAgICAgIGlmIChtYXNrLmVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBkZXB0aCA9IDE7XG4gICAgICAgICAgICAgICAgbWFzay5lbGVtZW50LnN5bmNNYXNrKGRlcHRoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuc3lzdGVtLl9wcmVyZW5kZXIubGVuZ3RoID0gMDtcbiAgICB9XG5cbiAgICBfYmluZFNjcmVlbihzY3JlZW4pIHtcbiAgICAgICAgLy8gQmluZCB0aGUgRWxlbWVudCB0byB0aGUgU2NyZWVuLiBXZSB1c2VkIHRvIHN1YnNjcmliZSB0byBTY3JlZW4gZXZlbnRzIGhlcmUuIEhvd2V2ZXIsXG4gICAgICAgIC8vIHRoYXQgd2FzIHZlcnkgc2xvdyB3aGVuIHRoZXJlIGFyZSB0aG91c2FuZHMgb2YgRWxlbWVudHMuIFdoZW4gdGhlIHRpbWUgY29tZXMgdG8gdW5iaW5kXG4gICAgICAgIC8vIHRoZSBFbGVtZW50IGZyb20gdGhlIFNjcmVlbiwgZmluZGluZyB0aGUgZXZlbnQgY2FsbGJhY2tzIHRvIHJlbW92ZSB0YWtlcyBhIGNvbnNpZGVyYWJsZVxuICAgICAgICAvLyBhbW91bnQgb2YgdGltZS4gU28gaW5zdGVhZCwgdGhlIFNjcmVlbiBzdG9yZXMgdGhlIEVsZW1lbnQgY29tcG9uZW50IGFuZCBjYWxscyBpdHNcbiAgICAgICAgLy8gZnVuY3Rpb25zIGRpcmVjdGx5LlxuICAgICAgICBzY3JlZW4uX2JpbmRFbGVtZW50KHRoaXMpO1xuICAgIH1cblxuICAgIF91bmJpbmRTY3JlZW4oc2NyZWVuKSB7XG4gICAgICAgIHNjcmVlbi5fdW5iaW5kRWxlbWVudCh0aGlzKTtcbiAgICB9XG5cbiAgICBfdXBkYXRlU2NyZWVuKHNjcmVlbikge1xuICAgICAgICBpZiAodGhpcy5zY3JlZW4gJiYgdGhpcy5zY3JlZW4gIT09IHNjcmVlbikge1xuICAgICAgICAgICAgdGhpcy5fdW5iaW5kU2NyZWVuKHRoaXMuc2NyZWVuLnNjcmVlbik7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBwcmV2aW91c1NjcmVlbiA9IHRoaXMuc2NyZWVuO1xuICAgICAgICB0aGlzLnNjcmVlbiA9IHNjcmVlbjtcbiAgICAgICAgaWYgKHRoaXMuc2NyZWVuKSB7XG4gICAgICAgICAgICB0aGlzLl9iaW5kU2NyZWVuKHRoaXMuc2NyZWVuLnNjcmVlbik7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl9jYWxjdWxhdGVTaXplKHRoaXMuX2hhc1NwbGl0QW5jaG9yc1gsIHRoaXMuX2hhc1NwbGl0QW5jaG9yc1kpO1xuXG4gICAgICAgIHRoaXMuZmlyZSgnc2V0OnNjcmVlbicsIHRoaXMuc2NyZWVuLCBwcmV2aW91c1NjcmVlbik7XG5cbiAgICAgICAgdGhpcy5fYW5jaG9yRGlydHkgPSB0cnVlO1xuXG4gICAgICAgIC8vIHVwZGF0ZSBhbGwgY2hpbGQgc2NyZWVuc1xuICAgICAgICBjb25zdCBjaGlsZHJlbiA9IHRoaXMuZW50aXR5LmNoaWxkcmVuO1xuICAgICAgICBmb3IgKGxldCBpID0gMCwgbCA9IGNoaWxkcmVuLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgICAgICAgICAgaWYgKGNoaWxkcmVuW2ldLmVsZW1lbnQpIGNoaWxkcmVuW2ldLmVsZW1lbnQuX3VwZGF0ZVNjcmVlbihzY3JlZW4pO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gY2FsY3VsYXRlIGRyYXcgb3JkZXJcbiAgICAgICAgaWYgKHRoaXMuc2NyZWVuKSB0aGlzLnNjcmVlbi5zY3JlZW4uc3luY0RyYXdPcmRlcigpO1xuICAgIH1cblxuICAgIHN5bmNNYXNrKGRlcHRoKSB7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IHRoaXMuX3BhcnNlVXBUb1NjcmVlbigpO1xuICAgICAgICB0aGlzLl91cGRhdGVNYXNrKHJlc3VsdC5tYXNrLCBkZXB0aCk7XG4gICAgfVxuXG4gICAgLy8gc2V0IHRoZSBtYXNrZWRieSBwcm9wZXJ0eSB0byB0aGUgZW50aXR5IHRoYXQgaXMgbWFza2luZyB0aGlzIGVsZW1lbnRcbiAgICAvLyAtIHNldCB0aGUgc3RlbmNpbCBidWZmZXIgdG8gY2hlY2sgdGhlIG1hc2sgdmFsdWVcbiAgICAvLyAgIHNvIGFzIHRvIG9ubHkgcmVuZGVyIGluc2lkZSB0aGUgbWFza1xuICAgIC8vICAgTm90ZTogaWYgdGhpcyBlbnRpdHkgaXMgaXRzZWxmIGEgbWFzayB0aGUgc3RlbmNpbCBwYXJhbXNcbiAgICAvLyAgIHdpbGwgYmUgdXBkYXRlZCBpbiB1cGRhdGVNYXNrIHRvIGluY2x1ZGUgbWFza2luZ1xuICAgIF9zZXRNYXNrZWRCeShtYXNrKSB7XG4gICAgICAgIGNvbnN0IHJlbmRlcmFibGVFbGVtZW50ID0gdGhpcy5faW1hZ2UgfHwgdGhpcy5fdGV4dDtcblxuICAgICAgICBpZiAobWFzaykge1xuICAgICAgICAgICAgY29uc3QgcmVmID0gbWFzay5lbGVtZW50Ll9pbWFnZS5fbWFza1JlZjtcbiAgICAgICAgICAgIERlYnVnLnRyYWNlKFRSQUNFX0lEX0VMRU1FTlQsICdtYXNraW5nOiAnICsgdGhpcy5lbnRpdHkubmFtZSArICcgd2l0aCAnICsgcmVmKTtcblxuICAgICAgICAgICAgLy8gaWYgdGhpcyBpcyBpbWFnZSBvciB0ZXh0LCBzZXQgdGhlIHN0ZW5jaWwgcGFyYW1ldGVyc1xuICAgICAgICAgICAgcmVuZGVyYWJsZUVsZW1lbnQ/Ll9zZXRTdGVuY2lsKG5ldyBTdGVuY2lsUGFyYW1ldGVycyh7XG4gICAgICAgICAgICAgICAgcmVmOiByZWYsXG4gICAgICAgICAgICAgICAgZnVuYzogRlVOQ19FUVVBTFxuICAgICAgICAgICAgfSkpO1xuXG4gICAgICAgICAgICB0aGlzLl9tYXNrZWRCeSA9IG1hc2s7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBEZWJ1Zy50cmFjZShUUkFDRV9JRF9FTEVNRU5ULCAnbm8gbWFza2luZyBvbjogJyArIHRoaXMuZW50aXR5Lm5hbWUpO1xuXG4gICAgICAgICAgICAvLyByZW1vdmUgc3RlbmNpbCBwYXJhbXMgaWYgdGhpcyBpcyBpbWFnZSBvciB0ZXh0XG4gICAgICAgICAgICByZW5kZXJhYmxlRWxlbWVudD8uX3NldFN0ZW5jaWwobnVsbCk7XG5cbiAgICAgICAgICAgIHRoaXMuX21hc2tlZEJ5ID0gbnVsbDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIHJlY3Vyc2l2ZWx5IHVwZGF0ZSBlbnRpdHkncyBzdGVuY2lsIHBhcmFtc1xuICAgIC8vIHRvIHJlbmRlciB0aGUgY29ycmVjdCB2YWx1ZSBpbnRvIHRoZSBzdGVuY2lsIGJ1ZmZlclxuICAgIF91cGRhdGVNYXNrKGN1cnJlbnRNYXNrLCBkZXB0aCkge1xuICAgICAgICBpZiAoY3VycmVudE1hc2spIHtcbiAgICAgICAgICAgIHRoaXMuX3NldE1hc2tlZEJ5KGN1cnJlbnRNYXNrKTtcblxuICAgICAgICAgICAgLy8gdGhpcyBlbGVtZW50IGlzIGFsc28gbWFza2luZyBvdGhlcnNcbiAgICAgICAgICAgIGlmICh0aGlzLm1hc2spIHtcbiAgICAgICAgICAgICAgICBjb25zdCByZWYgPSBjdXJyZW50TWFzay5lbGVtZW50Ll9pbWFnZS5fbWFza1JlZjtcbiAgICAgICAgICAgICAgICBjb25zdCBzcCA9IG5ldyBTdGVuY2lsUGFyYW1ldGVycyh7XG4gICAgICAgICAgICAgICAgICAgIHJlZjogcmVmLFxuICAgICAgICAgICAgICAgICAgICBmdW5jOiBGVU5DX0VRVUFMLFxuICAgICAgICAgICAgICAgICAgICB6cGFzczogU1RFTkNJTE9QX0lOQ1JFTUVOVFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHRoaXMuX2ltYWdlLl9zZXRTdGVuY2lsKHNwKTtcbiAgICAgICAgICAgICAgICB0aGlzLl9pbWFnZS5fbWFza1JlZiA9IGRlcHRoO1xuXG4gICAgICAgICAgICAgICAgLy8gaW5jcmVtZW50IGNvdW50ZXIgdG8gY291bnQgbWFzayBkZXB0aFxuICAgICAgICAgICAgICAgIGRlcHRoKys7XG5cbiAgICAgICAgICAgICAgICBEZWJ1Zy50cmFjZShUUkFDRV9JRF9FTEVNRU5ULCAnbWFza2luZyBmcm9tOiAnICsgdGhpcy5lbnRpdHkubmFtZSArICcgd2l0aCAnICsgKHNwLnJlZiArIDEpKTtcbiAgICAgICAgICAgICAgICBEZWJ1Zy50cmFjZShUUkFDRV9JRF9FTEVNRU5ULCAnZGVwdGgrKyB0bzogJywgZGVwdGgpO1xuXG4gICAgICAgICAgICAgICAgY3VycmVudE1hc2sgPSB0aGlzLmVudGl0eTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gcmVjdXJzZSB0aHJvdWdoIGFsbCBjaGlsZHJlblxuICAgICAgICAgICAgY29uc3QgY2hpbGRyZW4gPSB0aGlzLmVudGl0eS5jaGlsZHJlbjtcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwLCBsID0gY2hpbGRyZW4ubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgY2hpbGRyZW5baV0uZWxlbWVudD8uX3VwZGF0ZU1hc2soY3VycmVudE1hc2ssIGRlcHRoKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gaWYgbWFzayBjb3VudGVyIHdhcyBpbmNyZWFzZWQsIGRlY3JlbWVudCBpdCBhcyB3ZSBjb21lIGJhY2sgdXAgdGhlIGhpZXJhcmNoeVxuICAgICAgICAgICAgaWYgKHRoaXMubWFzaykgZGVwdGgtLTtcblxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gY2xlYXJpbmcgbWFza1xuICAgICAgICAgICAgdGhpcy5fc2V0TWFza2VkQnkobnVsbCk7XG5cbiAgICAgICAgICAgIGlmICh0aGlzLm1hc2spIHtcbiAgICAgICAgICAgICAgICBjb25zdCBzcCA9IG5ldyBTdGVuY2lsUGFyYW1ldGVycyh7XG4gICAgICAgICAgICAgICAgICAgIHJlZjogZGVwdGgsXG4gICAgICAgICAgICAgICAgICAgIGZ1bmM6IEZVTkNfQUxXQVlTLFxuICAgICAgICAgICAgICAgICAgICB6cGFzczogU1RFTkNJTE9QX1JFUExBQ0VcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB0aGlzLl9pbWFnZS5fc2V0U3RlbmNpbChzcCk7XG4gICAgICAgICAgICAgICAgdGhpcy5faW1hZ2UuX21hc2tSZWYgPSBkZXB0aDtcblxuICAgICAgICAgICAgICAgIC8vIGluY3JlbWVudCBtYXNrIGNvdW50ZXIgdG8gY291bnQgZGVwdGggb2YgbWFza3NcbiAgICAgICAgICAgICAgICBkZXB0aCsrO1xuXG4gICAgICAgICAgICAgICAgRGVidWcudHJhY2UoVFJBQ0VfSURfRUxFTUVOVCwgJ21hc2tpbmcgZnJvbTogJyArIHRoaXMuZW50aXR5Lm5hbWUgKyAnIHdpdGggJyArIHNwLnJlZik7XG4gICAgICAgICAgICAgICAgRGVidWcudHJhY2UoVFJBQ0VfSURfRUxFTUVOVCwgJ2RlcHRoKysgdG86ICcsIGRlcHRoKTtcblxuICAgICAgICAgICAgICAgIGN1cnJlbnRNYXNrID0gdGhpcy5lbnRpdHk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIHJlY3Vyc2UgdGhyb3VnaCBhbGwgY2hpbGRyZW5cbiAgICAgICAgICAgIGNvbnN0IGNoaWxkcmVuID0gdGhpcy5lbnRpdHkuY2hpbGRyZW47XG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMCwgbCA9IGNoaWxkcmVuLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgICAgICAgICAgICAgIGNoaWxkcmVuW2ldLmVsZW1lbnQ/Ll91cGRhdGVNYXNrKGN1cnJlbnRNYXNrLCBkZXB0aCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIGRlY3JlbWVudCBtYXNrIGNvdW50ZXIgYXMgd2UgY29tZSBiYWNrIHVwIHRoZSBoaWVyYXJjaHlcbiAgICAgICAgICAgIGlmICh0aGlzLm1hc2spIGRlcHRoLS07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBzZWFyY2ggdXAgdGhlIHBhcmVudCBoaWVyYXJjaHkgdW50aWwgd2UgcmVhY2ggYSBzY3JlZW5cbiAgICAvLyB0aGlzIHNjcmVlbiBpcyB0aGUgcGFyZW50IHNjcmVlblxuICAgIC8vIGFsc28gc2VhcmNoZXMgZm9yIG1hc2tlZCBlbGVtZW50cyB0byBnZXQgdGhlIHJlbGV2YW50IG1hc2tcbiAgICBfcGFyc2VVcFRvU2NyZWVuKCkge1xuICAgICAgICBjb25zdCByZXN1bHQgPSB7XG4gICAgICAgICAgICBzY3JlZW46IG51bGwsXG4gICAgICAgICAgICBtYXNrOiBudWxsXG4gICAgICAgIH07XG5cbiAgICAgICAgbGV0IHBhcmVudCA9IHRoaXMuZW50aXR5Ll9wYXJlbnQ7XG5cbiAgICAgICAgd2hpbGUgKHBhcmVudCAmJiAhcGFyZW50LnNjcmVlbikge1xuICAgICAgICAgICAgaWYgKHBhcmVudC5lbGVtZW50ICYmIHBhcmVudC5lbGVtZW50Lm1hc2spIHtcbiAgICAgICAgICAgICAgICAvLyBtYXNrIGVudGl0eVxuICAgICAgICAgICAgICAgIGlmICghcmVzdWx0Lm1hc2spIHJlc3VsdC5tYXNrID0gcGFyZW50O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBwYXJlbnQgPSBwYXJlbnQucGFyZW50O1xuICAgICAgICB9XG4gICAgICAgIGlmIChwYXJlbnQgJiYgcGFyZW50LnNjcmVlbikgcmVzdWx0LnNjcmVlbiA9IHBhcmVudDtcblxuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIF9vblNjcmVlblJlc2l6ZShyZXMpIHtcbiAgICAgICAgdGhpcy5fYW5jaG9yRGlydHkgPSB0cnVlO1xuICAgICAgICB0aGlzLl9jb3JuZXJzRGlydHkgPSB0cnVlO1xuICAgICAgICB0aGlzLl93b3JsZENvcm5lcnNEaXJ0eSA9IHRydWU7XG5cbiAgICAgICAgdGhpcy5fY2FsY3VsYXRlU2l6ZSh0aGlzLl9oYXNTcGxpdEFuY2hvcnNYLCB0aGlzLl9oYXNTcGxpdEFuY2hvcnNZKTtcblxuICAgICAgICB0aGlzLmZpcmUoJ3NjcmVlbjpzZXQ6cmVzb2x1dGlvbicsIHJlcyk7XG4gICAgfVxuXG4gICAgX29uU2NyZWVuU3BhY2VDaGFuZ2UoKSB7XG4gICAgICAgIHRoaXMuZmlyZSgnc2NyZWVuOnNldDpzY3JlZW5zcGFjZScsIHRoaXMuc2NyZWVuLnNjcmVlbi5zY3JlZW5TcGFjZSk7XG4gICAgfVxuXG4gICAgX29uU2NyZWVuUmVtb3ZlKCkge1xuICAgICAgICBpZiAodGhpcy5zY3JlZW4pIHtcbiAgICAgICAgICAgIGlmICh0aGlzLnNjcmVlbi5fZGVzdHJveWluZykge1xuICAgICAgICAgICAgICAgIC8vIElmIHRoZSBzY3JlZW4gZW50aXR5IGlzIGJlaW5nIGRlc3Ryb3llZCwgd2UgZG9uJ3QgY2FsbFxuICAgICAgICAgICAgICAgIC8vIF91cGRhdGVTY3JlZW4oKSBhcyBhbiBvcHRpbWl6YXRpb24gYnV0IHdlIHNob3VsZCBzdGlsbFxuICAgICAgICAgICAgICAgIC8vIHNldCBpdCB0byBudWxsIHRvIGNsZWFuIHVwIGRhbmdsaW5nIHJlZmVyZW5jZXNcbiAgICAgICAgICAgICAgICB0aGlzLnNjcmVlbiA9IG51bGw7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMuX3VwZGF0ZVNjcmVlbihudWxsKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIHN0b3JlIHBpeGVsIHBvc2l0aW9ucyBvZiBhbmNob3IgcmVsYXRpdmUgdG8gY3VycmVudCBwYXJlbnQgcmVzb2x1dGlvblxuICAgIF9jYWxjdWxhdGVMb2NhbEFuY2hvcnMoKSB7XG4gICAgICAgIGxldCByZXN4ID0gMTAwMDtcbiAgICAgICAgbGV0IHJlc3kgPSAxMDAwO1xuICAgICAgICBjb25zdCBwYXJlbnQgPSB0aGlzLmVudGl0eS5fcGFyZW50O1xuICAgICAgICBpZiAocGFyZW50ICYmIHBhcmVudC5lbGVtZW50KSB7XG4gICAgICAgICAgICByZXN4ID0gcGFyZW50LmVsZW1lbnQuY2FsY3VsYXRlZFdpZHRoO1xuICAgICAgICAgICAgcmVzeSA9IHBhcmVudC5lbGVtZW50LmNhbGN1bGF0ZWRIZWlnaHQ7XG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5zY3JlZW4pIHtcbiAgICAgICAgICAgIGNvbnN0IHJlcyA9IHRoaXMuc2NyZWVuLnNjcmVlbi5yZXNvbHV0aW9uO1xuICAgICAgICAgICAgY29uc3Qgc2NhbGUgPSB0aGlzLnNjcmVlbi5zY3JlZW4uc2NhbGU7XG4gICAgICAgICAgICByZXN4ID0gcmVzLnggLyBzY2FsZTtcbiAgICAgICAgICAgIHJlc3kgPSByZXMueSAvIHNjYWxlO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fbG9jYWxBbmNob3Iuc2V0KFxuICAgICAgICAgICAgdGhpcy5fYW5jaG9yLnggKiByZXN4LFxuICAgICAgICAgICAgdGhpcy5fYW5jaG9yLnkgKiByZXN5LFxuICAgICAgICAgICAgdGhpcy5fYW5jaG9yLnogKiByZXN4LFxuICAgICAgICAgICAgdGhpcy5fYW5jaG9yLncgKiByZXN5XG4gICAgICAgICk7XG4gICAgfVxuXG4gICAgLy8gaW50ZXJuYWwgLSBhcHBseSBvZmZzZXQgeCx5IHRvIGxvY2FsIHBvc2l0aW9uIGFuZCBmaW5kIHBvaW50IGluIHdvcmxkIHNwYWNlXG4gICAgZ2V0T2Zmc2V0UG9zaXRpb24oeCwgeSkge1xuICAgICAgICBjb25zdCBwID0gdGhpcy5lbnRpdHkuZ2V0TG9jYWxQb3NpdGlvbigpLmNsb25lKCk7XG5cbiAgICAgICAgcC54ICs9IHg7XG4gICAgICAgIHAueSArPSB5O1xuXG4gICAgICAgIHRoaXMuX3NjcmVlblRvV29ybGQudHJhbnNmb3JtUG9pbnQocCwgcCk7XG5cbiAgICAgICAgcmV0dXJuIHA7XG4gICAgfVxuXG4gICAgb25MYXllcnNDaGFuZ2VkKG9sZENvbXAsIG5ld0NvbXApIHtcbiAgICAgICAgdGhpcy5hZGRNb2RlbFRvTGF5ZXJzKHRoaXMuX2ltYWdlID8gdGhpcy5faW1hZ2UuX3JlbmRlcmFibGUubW9kZWwgOiB0aGlzLl90ZXh0Ll9tb2RlbCk7XG4gICAgICAgIG9sZENvbXAub2ZmKCdhZGQnLCB0aGlzLm9uTGF5ZXJBZGRlZCwgdGhpcyk7XG4gICAgICAgIG9sZENvbXAub2ZmKCdyZW1vdmUnLCB0aGlzLm9uTGF5ZXJSZW1vdmVkLCB0aGlzKTtcbiAgICAgICAgbmV3Q29tcC5vbignYWRkJywgdGhpcy5vbkxheWVyQWRkZWQsIHRoaXMpO1xuICAgICAgICBuZXdDb21wLm9uKCdyZW1vdmUnLCB0aGlzLm9uTGF5ZXJSZW1vdmVkLCB0aGlzKTtcbiAgICB9XG5cbiAgICBvbkxheWVyQWRkZWQobGF5ZXIpIHtcbiAgICAgICAgY29uc3QgaW5kZXggPSB0aGlzLmxheWVycy5pbmRleE9mKGxheWVyLmlkKTtcbiAgICAgICAgaWYgKGluZGV4IDwgMCkgcmV0dXJuO1xuICAgICAgICBpZiAodGhpcy5faW1hZ2UpIHtcbiAgICAgICAgICAgIGxheWVyLmFkZE1lc2hJbnN0YW5jZXModGhpcy5faW1hZ2UuX3JlbmRlcmFibGUubW9kZWwubWVzaEluc3RhbmNlcyk7XG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5fdGV4dCkge1xuICAgICAgICAgICAgbGF5ZXIuYWRkTWVzaEluc3RhbmNlcyh0aGlzLl90ZXh0Ll9tb2RlbC5tZXNoSW5zdGFuY2VzKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIG9uTGF5ZXJSZW1vdmVkKGxheWVyKSB7XG4gICAgICAgIGNvbnN0IGluZGV4ID0gdGhpcy5sYXllcnMuaW5kZXhPZihsYXllci5pZCk7XG4gICAgICAgIGlmIChpbmRleCA8IDApIHJldHVybjtcbiAgICAgICAgaWYgKHRoaXMuX2ltYWdlKSB7XG4gICAgICAgICAgICBsYXllci5yZW1vdmVNZXNoSW5zdGFuY2VzKHRoaXMuX2ltYWdlLl9yZW5kZXJhYmxlLm1vZGVsLm1lc2hJbnN0YW5jZXMpO1xuICAgICAgICB9IGVsc2UgaWYgKHRoaXMuX3RleHQpIHtcbiAgICAgICAgICAgIGxheWVyLnJlbW92ZU1lc2hJbnN0YW5jZXModGhpcy5fdGV4dC5fbW9kZWwubWVzaEluc3RhbmNlcyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBvbkVuYWJsZSgpIHtcbiAgICAgICAgaWYgKHRoaXMuX2ltYWdlKSB0aGlzLl9pbWFnZS5vbkVuYWJsZSgpO1xuICAgICAgICBpZiAodGhpcy5fdGV4dCkgdGhpcy5fdGV4dC5vbkVuYWJsZSgpO1xuICAgICAgICBpZiAodGhpcy5fZ3JvdXApIHRoaXMuX2dyb3VwLm9uRW5hYmxlKCk7XG5cbiAgICAgICAgaWYgKHRoaXMudXNlSW5wdXQgJiYgdGhpcy5zeXN0ZW0uYXBwLmVsZW1lbnRJbnB1dCkge1xuICAgICAgICAgICAgdGhpcy5zeXN0ZW0uYXBwLmVsZW1lbnRJbnB1dC5hZGRFbGVtZW50KHRoaXMpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5zeXN0ZW0uYXBwLnNjZW5lLm9uKCdzZXQ6bGF5ZXJzJywgdGhpcy5vbkxheWVyc0NoYW5nZWQsIHRoaXMpO1xuICAgICAgICBpZiAodGhpcy5zeXN0ZW0uYXBwLnNjZW5lLmxheWVycykge1xuICAgICAgICAgICAgdGhpcy5zeXN0ZW0uYXBwLnNjZW5lLmxheWVycy5vbignYWRkJywgdGhpcy5vbkxheWVyQWRkZWQsIHRoaXMpO1xuICAgICAgICAgICAgdGhpcy5zeXN0ZW0uYXBwLnNjZW5lLmxheWVycy5vbigncmVtb3ZlJywgdGhpcy5vbkxheWVyUmVtb3ZlZCwgdGhpcyk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5fYmF0Y2hHcm91cElkID49IDApIHtcbiAgICAgICAgICAgIHRoaXMuc3lzdGVtLmFwcC5iYXRjaGVyPy5pbnNlcnQoQmF0Y2hHcm91cC5FTEVNRU5ULCB0aGlzLmJhdGNoR3JvdXBJZCwgdGhpcy5lbnRpdHkpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5maXJlKCdlbmFibGVlbGVtZW50Jyk7XG4gICAgfVxuXG4gICAgb25EaXNhYmxlKCkge1xuICAgICAgICB0aGlzLnN5c3RlbS5hcHAuc2NlbmUub2ZmKCdzZXQ6bGF5ZXJzJywgdGhpcy5vbkxheWVyc0NoYW5nZWQsIHRoaXMpO1xuICAgICAgICBpZiAodGhpcy5zeXN0ZW0uYXBwLnNjZW5lLmxheWVycykge1xuICAgICAgICAgICAgdGhpcy5zeXN0ZW0uYXBwLnNjZW5lLmxheWVycy5vZmYoJ2FkZCcsIHRoaXMub25MYXllckFkZGVkLCB0aGlzKTtcbiAgICAgICAgICAgIHRoaXMuc3lzdGVtLmFwcC5zY2VuZS5sYXllcnMub2ZmKCdyZW1vdmUnLCB0aGlzLm9uTGF5ZXJSZW1vdmVkLCB0aGlzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLl9pbWFnZSkgdGhpcy5faW1hZ2Uub25EaXNhYmxlKCk7XG4gICAgICAgIGlmICh0aGlzLl90ZXh0KSB0aGlzLl90ZXh0Lm9uRGlzYWJsZSgpO1xuICAgICAgICBpZiAodGhpcy5fZ3JvdXApIHRoaXMuX2dyb3VwLm9uRGlzYWJsZSgpO1xuXG4gICAgICAgIGlmICh0aGlzLnN5c3RlbS5hcHAuZWxlbWVudElucHV0ICYmIHRoaXMudXNlSW5wdXQpIHtcbiAgICAgICAgICAgIHRoaXMuc3lzdGVtLmFwcC5lbGVtZW50SW5wdXQucmVtb3ZlRWxlbWVudCh0aGlzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLl9iYXRjaEdyb3VwSWQgPj0gMCkge1xuICAgICAgICAgICAgdGhpcy5zeXN0ZW0uYXBwLmJhdGNoZXI/LnJlbW92ZShCYXRjaEdyb3VwLkVMRU1FTlQsIHRoaXMuYmF0Y2hHcm91cElkLCB0aGlzLmVudGl0eSk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmZpcmUoJ2Rpc2FibGVlbGVtZW50Jyk7XG4gICAgfVxuXG4gICAgb25SZW1vdmUoKSB7XG4gICAgICAgIHRoaXMuZW50aXR5Lm9mZignaW5zZXJ0JywgdGhpcy5fb25JbnNlcnQsIHRoaXMpO1xuICAgICAgICB0aGlzLl91bnBhdGNoKCk7XG4gICAgICAgIGlmICh0aGlzLl9pbWFnZSkgdGhpcy5faW1hZ2UuZGVzdHJveSgpO1xuICAgICAgICBpZiAodGhpcy5fdGV4dCkgdGhpcy5fdGV4dC5kZXN0cm95KCk7XG5cbiAgICAgICAgaWYgKHRoaXMuc3lzdGVtLmFwcC5lbGVtZW50SW5wdXQgJiYgdGhpcy51c2VJbnB1dCkge1xuICAgICAgICAgICAgdGhpcy5zeXN0ZW0uYXBwLmVsZW1lbnRJbnB1dC5yZW1vdmVFbGVtZW50KHRoaXMpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gaWYgdGhlcmUgaXMgYSBzY3JlZW4sIHVwZGF0ZSBkcmF3LW9yZGVyXG4gICAgICAgIGlmICh0aGlzLnNjcmVlbiAmJiB0aGlzLnNjcmVlbi5zY3JlZW4pIHtcbiAgICAgICAgICAgIHRoaXMuX3VuYmluZFNjcmVlbih0aGlzLnNjcmVlbi5zY3JlZW4pO1xuICAgICAgICAgICAgdGhpcy5zY3JlZW4uc2NyZWVuLnN5bmNEcmF3T3JkZXIoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMub2ZmKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVjYWxjdWxhdGVzIHRoZXNlIHByb3BlcnRpZXM6XG4gICAgICogICAtIGBfbG9jYWxBbmNob3JgXG4gICAgICogICAtIGB3aWR0aGBcbiAgICAgKiAgIC0gYGhlaWdodGBcbiAgICAgKiAgIC0gTG9jYWwgcG9zaXRpb24gaXMgdXBkYXRlZCBpZiBhbmNob3JzIGFyZSBzcGxpdFxuICAgICAqXG4gICAgICogQXNzdW1lcyB0aGVzZSBwcm9wZXJ0aWVzIGFyZSB1cCB0byBkYXRlOlxuICAgICAqICAgLSBgX21hcmdpbmBcbiAgICAgKlxuICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gcHJvcGFnYXRlQ2FsY3VsYXRlZFdpZHRoIC0gSWYgdHJ1ZSwgY2FsbCBgX3NldFdpZHRoYCBpbnN0ZWFkXG4gICAgICogb2YgYF9zZXRDYWxjdWxhdGVkV2lkdGhgXG4gICAgICogQHBhcmFtIHtib29sZWFufSBwcm9wYWdhdGVDYWxjdWxhdGVkSGVpZ2h0IC0gSWYgdHJ1ZSwgY2FsbCBgX3NldEhlaWdodGAgaW5zdGVhZFxuICAgICAqIG9mIGBfc2V0Q2FsY3VsYXRlZEhlaWdodGBcbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9jYWxjdWxhdGVTaXplKHByb3BhZ2F0ZUNhbGN1bGF0ZWRXaWR0aCwgcHJvcGFnYXRlQ2FsY3VsYXRlZEhlaWdodCkge1xuICAgICAgICAvLyBjYW4ndCBjYWxjdWxhdGUgaWYgbG9jYWwgYW5jaG9ycyBhcmUgd3JvbmdcbiAgICAgICAgaWYgKCF0aGlzLmVudGl0eS5fcGFyZW50ICYmICF0aGlzLnNjcmVlbikgcmV0dXJuO1xuXG4gICAgICAgIHRoaXMuX2NhbGN1bGF0ZUxvY2FsQW5jaG9ycygpO1xuXG4gICAgICAgIGNvbnN0IG5ld1dpZHRoID0gdGhpcy5fYWJzUmlnaHQgLSB0aGlzLl9hYnNMZWZ0O1xuICAgICAgICBjb25zdCBuZXdIZWlnaHQgPSB0aGlzLl9hYnNUb3AgLSB0aGlzLl9hYnNCb3R0b207XG5cbiAgICAgICAgaWYgKHByb3BhZ2F0ZUNhbGN1bGF0ZWRXaWR0aCkge1xuICAgICAgICAgICAgdGhpcy5fc2V0V2lkdGgobmV3V2lkdGgpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5fc2V0Q2FsY3VsYXRlZFdpZHRoKG5ld1dpZHRoLCBmYWxzZSk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocHJvcGFnYXRlQ2FsY3VsYXRlZEhlaWdodCkge1xuICAgICAgICAgICAgdGhpcy5fc2V0SGVpZ2h0KG5ld0hlaWdodCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLl9zZXRDYWxjdWxhdGVkSGVpZ2h0KG5ld0hlaWdodCwgZmFsc2UpO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgcCA9IHRoaXMuZW50aXR5LmdldExvY2FsUG9zaXRpb24oKTtcbiAgICAgICAgcC54ID0gdGhpcy5fbWFyZ2luLnggKyB0aGlzLl9jYWxjdWxhdGVkV2lkdGggKiB0aGlzLl9waXZvdC54O1xuICAgICAgICBwLnkgPSB0aGlzLl9tYXJnaW4ueSArIHRoaXMuX2NhbGN1bGF0ZWRIZWlnaHQgKiB0aGlzLl9waXZvdC55O1xuXG4gICAgICAgIHRoaXMuZW50aXR5LnNldExvY2FsUG9zaXRpb24ocCk7XG5cbiAgICAgICAgdGhpcy5fc2l6ZURpcnR5ID0gZmFsc2U7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSW50ZXJuYWwgc2V0IHdpZHRoIHdpdGhvdXQgdXBkYXRpbmcgbWFyZ2luLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHcgLSBUaGUgbmV3IHdpZHRoLlxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX3NldFdpZHRoKHcpIHtcbiAgICAgICAgdGhpcy5fd2lkdGggPSB3O1xuICAgICAgICB0aGlzLl9zZXRDYWxjdWxhdGVkV2lkdGgodywgZmFsc2UpO1xuXG4gICAgICAgIHRoaXMuZmlyZSgnc2V0OndpZHRoJywgdGhpcy5fd2lkdGgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEludGVybmFsIHNldCBoZWlnaHQgd2l0aG91dCB1cGRhdGluZyBtYXJnaW4uXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gaCAtIFRoZSBuZXcgaGVpZ2h0LlxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX3NldEhlaWdodChoKSB7XG4gICAgICAgIHRoaXMuX2hlaWdodCA9IGg7XG4gICAgICAgIHRoaXMuX3NldENhbGN1bGF0ZWRIZWlnaHQoaCwgZmFsc2UpO1xuXG4gICAgICAgIHRoaXMuZmlyZSgnc2V0OmhlaWdodCcsIHRoaXMuX2hlaWdodCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVGhpcyBtZXRob2Qgc2V0cyB0aGUgY2FsY3VsYXRlZCB3aWR0aCB2YWx1ZSBhbmQgb3B0aW9uYWxseSB1cGRhdGVzIHRoZSBtYXJnaW5zLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHZhbHVlIC0gVGhlIG5ldyBjYWxjdWxhdGVkIHdpZHRoLlxuICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gdXBkYXRlTWFyZ2lucyAtIFVwZGF0ZSBtYXJnaW5zIG9yIG5vdC5cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9zZXRDYWxjdWxhdGVkV2lkdGgodmFsdWUsIHVwZGF0ZU1hcmdpbnMpIHtcbiAgICAgICAgaWYgKE1hdGguYWJzKHZhbHVlIC0gdGhpcy5fY2FsY3VsYXRlZFdpZHRoKSA8PSAxZS00KVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHRoaXMuX2NhbGN1bGF0ZWRXaWR0aCA9IHZhbHVlO1xuICAgICAgICB0aGlzLmVudGl0eS5fZGlydGlmeUxvY2FsKCk7XG5cbiAgICAgICAgaWYgKHVwZGF0ZU1hcmdpbnMpIHtcbiAgICAgICAgICAgIGNvbnN0IHAgPSB0aGlzLmVudGl0eS5nZXRMb2NhbFBvc2l0aW9uKCk7XG4gICAgICAgICAgICBjb25zdCBwdnQgPSB0aGlzLl9waXZvdDtcbiAgICAgICAgICAgIHRoaXMuX21hcmdpbi54ID0gcC54IC0gdGhpcy5fY2FsY3VsYXRlZFdpZHRoICogcHZ0Lng7XG4gICAgICAgICAgICB0aGlzLl9tYXJnaW4ueiA9ICh0aGlzLl9sb2NhbEFuY2hvci56IC0gdGhpcy5fbG9jYWxBbmNob3IueCkgLSB0aGlzLl9jYWxjdWxhdGVkV2lkdGggLSB0aGlzLl9tYXJnaW4ueDtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuX2ZsYWdDaGlsZHJlbkFzRGlydHkoKTtcbiAgICAgICAgdGhpcy5maXJlKCdzZXQ6Y2FsY3VsYXRlZFdpZHRoJywgdGhpcy5fY2FsY3VsYXRlZFdpZHRoKTtcbiAgICAgICAgdGhpcy5maXJlKCdyZXNpemUnLCB0aGlzLl9jYWxjdWxhdGVkV2lkdGgsIHRoaXMuX2NhbGN1bGF0ZWRIZWlnaHQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRoaXMgbWV0aG9kIHNldHMgdGhlIGNhbGN1bGF0ZWQgaGVpZ2h0IHZhbHVlIGFuZCBvcHRpb25hbGx5IHVwZGF0ZXMgdGhlIG1hcmdpbnMuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gdmFsdWUgLSBUaGUgbmV3IGNhbGN1bGF0ZWQgaGVpZ2h0LlxuICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gdXBkYXRlTWFyZ2lucyAtIFVwZGF0ZSBtYXJnaW5zIG9yIG5vdC5cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9zZXRDYWxjdWxhdGVkSGVpZ2h0KHZhbHVlLCB1cGRhdGVNYXJnaW5zKSB7XG4gICAgICAgIGlmIChNYXRoLmFicyh2YWx1ZSAtIHRoaXMuX2NhbGN1bGF0ZWRIZWlnaHQpIDw9IDFlLTQpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgdGhpcy5fY2FsY3VsYXRlZEhlaWdodCA9IHZhbHVlO1xuICAgICAgICB0aGlzLmVudGl0eS5fZGlydGlmeUxvY2FsKCk7XG5cbiAgICAgICAgaWYgKHVwZGF0ZU1hcmdpbnMpIHtcbiAgICAgICAgICAgIGNvbnN0IHAgPSB0aGlzLmVudGl0eS5nZXRMb2NhbFBvc2l0aW9uKCk7XG4gICAgICAgICAgICBjb25zdCBwdnQgPSB0aGlzLl9waXZvdDtcbiAgICAgICAgICAgIHRoaXMuX21hcmdpbi55ID0gcC55IC0gdGhpcy5fY2FsY3VsYXRlZEhlaWdodCAqIHB2dC55O1xuICAgICAgICAgICAgdGhpcy5fbWFyZ2luLncgPSAodGhpcy5fbG9jYWxBbmNob3IudyAtIHRoaXMuX2xvY2FsQW5jaG9yLnkpIC0gdGhpcy5fY2FsY3VsYXRlZEhlaWdodCAtIHRoaXMuX21hcmdpbi55O1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fZmxhZ0NoaWxkcmVuQXNEaXJ0eSgpO1xuICAgICAgICB0aGlzLmZpcmUoJ3NldDpjYWxjdWxhdGVkSGVpZ2h0JywgdGhpcy5fY2FsY3VsYXRlZEhlaWdodCk7XG4gICAgICAgIHRoaXMuZmlyZSgncmVzaXplJywgdGhpcy5fY2FsY3VsYXRlZFdpZHRoLCB0aGlzLl9jYWxjdWxhdGVkSGVpZ2h0KTtcbiAgICB9XG5cbiAgICBfZmxhZ0NoaWxkcmVuQXNEaXJ0eSgpIHtcbiAgICAgICAgY29uc3QgYyA9IHRoaXMuZW50aXR5Ll9jaGlsZHJlbjtcbiAgICAgICAgZm9yIChsZXQgaSA9IDAsIGwgPSBjLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgICAgICAgICAgaWYgKGNbaV0uZWxlbWVudCkge1xuICAgICAgICAgICAgICAgIGNbaV0uZWxlbWVudC5fYW5jaG9yRGlydHkgPSB0cnVlO1xuICAgICAgICAgICAgICAgIGNbaV0uZWxlbWVudC5fc2l6ZURpcnR5ID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGFkZE1vZGVsVG9MYXllcnMobW9kZWwpIHtcbiAgICAgICAgdGhpcy5fYWRkZWRNb2RlbHMucHVzaChtb2RlbCk7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5sYXllcnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGNvbnN0IGxheWVyID0gdGhpcy5zeXN0ZW0uYXBwLnNjZW5lLmxheWVycy5nZXRMYXllckJ5SWQodGhpcy5sYXllcnNbaV0pO1xuICAgICAgICAgICAgaWYgKCFsYXllcikgY29udGludWU7XG4gICAgICAgICAgICBsYXllci5hZGRNZXNoSW5zdGFuY2VzKG1vZGVsLm1lc2hJbnN0YW5jZXMpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmVtb3ZlTW9kZWxGcm9tTGF5ZXJzKG1vZGVsKSB7XG4gICAgICAgIGNvbnN0IGlkeCA9IHRoaXMuX2FkZGVkTW9kZWxzLmluZGV4T2YobW9kZWwpO1xuICAgICAgICBpZiAoaWR4ID49IDApIHtcbiAgICAgICAgICAgIHRoaXMuX2FkZGVkTW9kZWxzLnNwbGljZShpZHgsIDEpO1xuICAgICAgICB9XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5sYXllcnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGNvbnN0IGxheWVyID0gdGhpcy5zeXN0ZW0uYXBwLnNjZW5lLmxheWVycy5nZXRMYXllckJ5SWQodGhpcy5sYXllcnNbaV0pO1xuICAgICAgICAgICAgaWYgKCFsYXllcikgY29udGludWU7XG4gICAgICAgICAgICBsYXllci5yZW1vdmVNZXNoSW5zdGFuY2VzKG1vZGVsLm1lc2hJbnN0YW5jZXMpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2V0TWFza09mZnNldCgpIHtcbiAgICAgICAgLy8gcmVzZXQgb2Zmc2V0IG9uIG5ldyBmcmFtZVxuICAgICAgICAvLyB3ZSBhbHdheXMgY291bnQgb2Zmc2V0IGRvd24gZnJvbSAwLjVcbiAgICAgICAgY29uc3QgZnJhbWUgPSB0aGlzLnN5c3RlbS5hcHAuZnJhbWU7XG4gICAgICAgIGlmICh0aGlzLl9vZmZzZXRSZWFkQXQgIT09IGZyYW1lKSB7XG4gICAgICAgICAgICB0aGlzLl9tYXNrT2Zmc2V0ID0gMC41O1xuICAgICAgICAgICAgdGhpcy5fb2Zmc2V0UmVhZEF0ID0gZnJhbWU7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgbW8gPSB0aGlzLl9tYXNrT2Zmc2V0O1xuICAgICAgICB0aGlzLl9tYXNrT2Zmc2V0IC09IDAuMDAxO1xuICAgICAgICByZXR1cm4gbW87XG4gICAgfVxuXG4gICAgaXNWaXNpYmxlRm9yQ2FtZXJhKGNhbWVyYSkge1xuICAgICAgICBsZXQgY2xpcEwsIGNsaXBSLCBjbGlwVCwgY2xpcEI7XG5cbiAgICAgICAgaWYgKHRoaXMubWFza2VkQnkpIHtcbiAgICAgICAgICAgIGNvbnN0IGNvcm5lcnMgPSB0aGlzLm1hc2tlZEJ5LmVsZW1lbnQuc2NyZWVuQ29ybmVycztcblxuICAgICAgICAgICAgY2xpcEwgPSBNYXRoLm1pbihNYXRoLm1pbihjb3JuZXJzWzBdLngsIGNvcm5lcnNbMV0ueCksIE1hdGgubWluKGNvcm5lcnNbMl0ueCwgY29ybmVyc1szXS54KSk7XG4gICAgICAgICAgICBjbGlwUiA9IE1hdGgubWF4KE1hdGgubWF4KGNvcm5lcnNbMF0ueCwgY29ybmVyc1sxXS54KSwgTWF0aC5tYXgoY29ybmVyc1syXS54LCBjb3JuZXJzWzNdLngpKTtcbiAgICAgICAgICAgIGNsaXBCID0gTWF0aC5taW4oTWF0aC5taW4oY29ybmVyc1swXS55LCBjb3JuZXJzWzFdLnkpLCBNYXRoLm1pbihjb3JuZXJzWzJdLnksIGNvcm5lcnNbM10ueSkpO1xuICAgICAgICAgICAgY2xpcFQgPSBNYXRoLm1heChNYXRoLm1heChjb3JuZXJzWzBdLnksIGNvcm5lcnNbMV0ueSksIE1hdGgubWF4KGNvcm5lcnNbMl0ueSwgY29ybmVyc1szXS55KSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zdCBzdyA9IHRoaXMuc3lzdGVtLmFwcC5ncmFwaGljc0RldmljZS53aWR0aDtcbiAgICAgICAgICAgIGNvbnN0IHNoID0gdGhpcy5zeXN0ZW0uYXBwLmdyYXBoaWNzRGV2aWNlLmhlaWdodDtcblxuICAgICAgICAgICAgY29uc3QgY2FtZXJhV2lkdGggPSBjYW1lcmEuX3JlY3QueiAqIHN3O1xuICAgICAgICAgICAgY29uc3QgY2FtZXJhSGVpZ2h0ID0gY2FtZXJhLl9yZWN0LncgKiBzaDtcbiAgICAgICAgICAgIGNsaXBMID0gY2FtZXJhLl9yZWN0LnggKiBzdztcbiAgICAgICAgICAgIGNsaXBSID0gY2xpcEwgKyBjYW1lcmFXaWR0aDtcbiAgICAgICAgICAgIGNsaXBUID0gKDEgLSBjYW1lcmEuX3JlY3QueSkgKiBzaDtcbiAgICAgICAgICAgIGNsaXBCID0gY2xpcFQgLSBjYW1lcmFIZWlnaHQ7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBoaXRDb3JuZXJzID0gdGhpcy5zY3JlZW5Db3JuZXJzO1xuXG4gICAgICAgIGNvbnN0IGxlZnQgPSBNYXRoLm1pbihNYXRoLm1pbihoaXRDb3JuZXJzWzBdLngsIGhpdENvcm5lcnNbMV0ueCksIE1hdGgubWluKGhpdENvcm5lcnNbMl0ueCwgaGl0Q29ybmVyc1szXS54KSk7XG4gICAgICAgIGNvbnN0IHJpZ2h0ID0gTWF0aC5tYXgoTWF0aC5tYXgoaGl0Q29ybmVyc1swXS54LCBoaXRDb3JuZXJzWzFdLngpLCBNYXRoLm1heChoaXRDb3JuZXJzWzJdLngsIGhpdENvcm5lcnNbM10ueCkpO1xuICAgICAgICBjb25zdCBib3R0b20gPSBNYXRoLm1pbihNYXRoLm1pbihoaXRDb3JuZXJzWzBdLnksIGhpdENvcm5lcnNbMV0ueSksIE1hdGgubWluKGhpdENvcm5lcnNbMl0ueSwgaGl0Q29ybmVyc1szXS55KSk7XG4gICAgICAgIGNvbnN0IHRvcCA9IE1hdGgubWF4KE1hdGgubWF4KGhpdENvcm5lcnNbMF0ueSwgaGl0Q29ybmVyc1sxXS55KSwgTWF0aC5tYXgoaGl0Q29ybmVyc1syXS55LCBoaXRDb3JuZXJzWzNdLnkpKTtcblxuICAgICAgICBpZiAocmlnaHQgPCBjbGlwTCB8fFxuICAgICAgICAgICAgbGVmdCA+IGNsaXBSIHx8XG4gICAgICAgICAgICBib3R0b20gPiBjbGlwVCB8fFxuICAgICAgICAgICAgdG9wIDwgY2xpcEIpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIF9pc1NjcmVlblNwYWNlKCkge1xuICAgICAgICBpZiAodGhpcy5zY3JlZW4gJiYgdGhpcy5zY3JlZW4uc2NyZWVuKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5zY3JlZW4uc2NyZWVuLnNjcmVlblNwYWNlO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIF9pc1NjcmVlbkN1bGxlZCgpIHtcbiAgICAgICAgaWYgKHRoaXMuc2NyZWVuICYmIHRoaXMuc2NyZWVuLnNjcmVlbikge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuc2NyZWVuLnNjcmVlbi5jdWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIF9kaXJ0eUJhdGNoKCkge1xuICAgICAgICBpZiAodGhpcy5iYXRjaEdyb3VwSWQgIT09IC0xKSB7XG4gICAgICAgICAgICB0aGlzLnN5c3RlbS5hcHAuYmF0Y2hlcj8ubWFya0dyb3VwRGlydHkodGhpcy5iYXRjaEdyb3VwSWQpO1xuICAgICAgICB9XG4gICAgfVxufVxuXG5mdW5jdGlvbiBfZGVmaW5lKG5hbWUpIHtcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkoRWxlbWVudENvbXBvbmVudC5wcm90b3R5cGUsIG5hbWUsIHtcbiAgICAgICAgZ2V0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5fdGV4dCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLl90ZXh0W25hbWVdO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0aGlzLl9pbWFnZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLl9pbWFnZVtuYW1lXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9LFxuICAgICAgICBzZXQ6IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgaWYgKHRoaXMuX3RleHQpIHtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5fdGV4dFtuYW1lXSAhPT0gdmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fZGlydHlCYXRjaCgpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHRoaXMuX3RleHRbbmFtZV0gPSB2YWx1ZTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodGhpcy5faW1hZ2UpIHtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5faW1hZ2VbbmFtZV0gIT09IHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX2RpcnR5QmF0Y2goKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB0aGlzLl9pbWFnZVtuYW1lXSA9IHZhbHVlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSk7XG59XG5cbl9kZWZpbmUoJ2ZvbnRTaXplJyk7XG5fZGVmaW5lKCdtaW5Gb250U2l6ZScpO1xuX2RlZmluZSgnbWF4Rm9udFNpemUnKTtcbl9kZWZpbmUoJ21heExpbmVzJyk7XG5fZGVmaW5lKCdhdXRvRml0V2lkdGgnKTtcbl9kZWZpbmUoJ2F1dG9GaXRIZWlnaHQnKTtcbl9kZWZpbmUoJ2NvbG9yJyk7XG5fZGVmaW5lKCdmb250Jyk7XG5fZGVmaW5lKCdmb250QXNzZXQnKTtcbl9kZWZpbmUoJ3NwYWNpbmcnKTtcbl9kZWZpbmUoJ2xpbmVIZWlnaHQnKTtcbl9kZWZpbmUoJ3dyYXBMaW5lcycpO1xuX2RlZmluZSgnbGluZXMnKTtcbl9kZWZpbmUoJ2FsaWdubWVudCcpO1xuX2RlZmluZSgnYXV0b1dpZHRoJyk7XG5fZGVmaW5lKCdhdXRvSGVpZ2h0Jyk7XG5fZGVmaW5lKCdydGxSZW9yZGVyJyk7XG5fZGVmaW5lKCd1bmljb2RlQ29udmVydGVyJyk7XG5fZGVmaW5lKCd0ZXh0Jyk7XG5fZGVmaW5lKCdrZXknKTtcbl9kZWZpbmUoJ3RleHR1cmUnKTtcbl9kZWZpbmUoJ3RleHR1cmVBc3NldCcpO1xuX2RlZmluZSgnbWF0ZXJpYWwnKTtcbl9kZWZpbmUoJ21hdGVyaWFsQXNzZXQnKTtcbl9kZWZpbmUoJ3Nwcml0ZScpO1xuX2RlZmluZSgnc3ByaXRlQXNzZXQnKTtcbl9kZWZpbmUoJ3Nwcml0ZUZyYW1lJyk7XG5fZGVmaW5lKCdwaXhlbHNQZXJVbml0Jyk7XG5fZGVmaW5lKCdvcGFjaXR5Jyk7XG5fZGVmaW5lKCdyZWN0Jyk7XG5fZGVmaW5lKCdtYXNrJyk7XG5fZGVmaW5lKCdvdXRsaW5lQ29sb3InKTtcbl9kZWZpbmUoJ291dGxpbmVUaGlja25lc3MnKTtcbl9kZWZpbmUoJ3NoYWRvd0NvbG9yJyk7XG5fZGVmaW5lKCdzaGFkb3dPZmZzZXQnKTtcbl9kZWZpbmUoJ2VuYWJsZU1hcmt1cCcpO1xuX2RlZmluZSgncmFuZ2VTdGFydCcpO1xuX2RlZmluZSgncmFuZ2VFbmQnKTtcblxuZXhwb3J0IHsgRWxlbWVudENvbXBvbmVudCB9O1xuIl0sIm5hbWVzIjpbInBvc2l0aW9uIiwiVmVjMyIsImludlBhcmVudFd0bSIsIk1hdDQiLCJ2ZWNBIiwidmVjQiIsIm1hdEEiLCJtYXRCIiwibWF0QyIsIm1hdEQiLCJFbGVtZW50Q29tcG9uZW50IiwiQ29tcG9uZW50IiwiY29uc3RydWN0b3IiLCJzeXN0ZW0iLCJlbnRpdHkiLCJfYmVpbmdJbml0aWFsaXplZCIsIl9hbmNob3IiLCJWZWM0IiwiX2xvY2FsQW5jaG9yIiwiX3Bpdm90IiwiVmVjMiIsIl93aWR0aCIsIl9jYWxjdWxhdGVkV2lkdGgiLCJfaGVpZ2h0IiwiX2NhbGN1bGF0ZWRIZWlnaHQiLCJfbWFyZ2luIiwiX21vZGVsVHJhbnNmb3JtIiwiX3NjcmVlblRvV29ybGQiLCJfYW5jaG9yVHJhbnNmb3JtIiwiX2FuY2hvckRpcnR5IiwiX3BhcmVudFdvcmxkVHJhbnNmb3JtIiwiX3NjcmVlblRyYW5zZm9ybSIsIl9zY3JlZW5Db3JuZXJzIiwiX2NhbnZhc0Nvcm5lcnMiLCJfd29ybGRDb3JuZXJzIiwiX2Nvcm5lcnNEaXJ0eSIsIl9jYW52YXNDb3JuZXJzRGlydHkiLCJfd29ybGRDb3JuZXJzRGlydHkiLCJvbiIsIl9vbkluc2VydCIsIl9wYXRjaCIsInNjcmVlbiIsIl90eXBlIiwiRUxFTUVOVFRZUEVfR1JPVVAiLCJfaW1hZ2UiLCJfdGV4dCIsIl9ncm91cCIsIl9kcmF3T3JkZXIiLCJfZml0TW9kZSIsIkZJVE1PREVfU1RSRVRDSCIsIl91c2VJbnB1dCIsIl9sYXllcnMiLCJMQVlFUklEX1VJIiwiX2FkZGVkTW9kZWxzIiwiX2JhdGNoR3JvdXBJZCIsIl9iYXRjaEdyb3VwIiwiX29mZnNldFJlYWRBdCIsIl9tYXNrT2Zmc2V0IiwiX21hc2tlZEJ5IiwiX2Fic0xlZnQiLCJ4IiwiX2Fic1JpZ2h0IiwieiIsIl9hYnNUb3AiLCJ3IiwiX2Fic0JvdHRvbSIsInkiLCJfaGFzU3BsaXRBbmNob3JzWCIsIk1hdGgiLCJhYnMiLCJfaGFzU3BsaXRBbmNob3JzWSIsImFhYmIiLCJhbmNob3IiLCJ2YWx1ZSIsImNvcHkiLCJzZXQiLCJfcGFyZW50IiwiX2NhbGN1bGF0ZUxvY2FsQW5jaG9ycyIsIl9jYWxjdWxhdGVTaXplIiwiX2RpcnR5TG9jYWwiLCJfZGlydGlmeUxvY2FsIiwiZmlyZSIsImJhdGNoR3JvdXBJZCIsImVuYWJsZWQiLCJfdGhpcyRzeXN0ZW0kYXBwJGJhdGMiLCJhcHAiLCJiYXRjaGVyIiwicmVtb3ZlIiwiQmF0Y2hHcm91cCIsIkVMRU1FTlQiLCJfdGhpcyRzeXN0ZW0kYXBwJGJhdGMyIiwiaW5zZXJ0IiwiX3JlbmRlcmFibGUiLCJtb2RlbCIsImFkZE1vZGVsVG9MYXllcnMiLCJfbW9kZWwiLCJib3R0b20iLCJwIiwiZ2V0TG9jYWxQb3NpdGlvbiIsInd0Iiwid2IiLCJfc2V0SGVpZ2h0Iiwic2V0TG9jYWxQb3NpdGlvbiIsImNhbGN1bGF0ZWRXaWR0aCIsIl9zZXRDYWxjdWxhdGVkV2lkdGgiLCJjYWxjdWxhdGVkSGVpZ2h0IiwiX3NldENhbGN1bGF0ZWRIZWlnaHQiLCJjYW52YXNDb3JuZXJzIiwic2NyZWVuU3BhY2UiLCJkZXZpY2UiLCJncmFwaGljc0RldmljZSIsInNjcmVlbkNvcm5lcnMiLCJzeCIsImNhbnZhcyIsImNsaWVudFdpZHRoIiwid2lkdGgiLCJzeSIsImNsaWVudEhlaWdodCIsImhlaWdodCIsImkiLCJkcmF3T3JkZXIiLCJwcmlvcml0eSIsIkRlYnVnIiwid2FybiIsImxheWVycyIsImxlbmd0aCIsImxheWVyIiwic2NlbmUiLCJnZXRMYXllckJ5SWQiLCJqIiwicmVtb3ZlTWVzaEluc3RhbmNlcyIsIm1lc2hJbnN0YW5jZXMiLCJhZGRNZXNoSW5zdGFuY2VzIiwibGVmdCIsIndyIiwid2wiLCJfc2V0V2lkdGgiLCJtYXJnaW4iLCJtYXNrZWRCeSIsInBpdm90IiwicHJldlgiLCJwcmV2WSIsIm14IiwiZHgiLCJteSIsImR5IiwiX2ZsYWdDaGlsZHJlbkFzRGlydHkiLCJyaWdodCIsInBhcmVudEJvdHRvbUxlZnQiLCJwYXJlbnQiLCJlbGVtZW50IiwidHJhbnNmb3JtUG9pbnQiLCJtdWxTY2FsYXIiLCJzY2FsZSIsImFkZCIsInRleHRXaWR0aCIsInRleHRIZWlnaHQiLCJ0b3AiLCJ0eXBlIiwiZGVzdHJveSIsIkVMRU1FTlRUWVBFX0lNQUdFIiwiSW1hZ2VFbGVtZW50IiwiRUxFTUVOVFRZUEVfVEVYVCIsIlRleHRFbGVtZW50IiwidXNlSW5wdXQiLCJlbGVtZW50SW5wdXQiLCJhZGRFbGVtZW50IiwicmVtb3ZlRWxlbWVudCIsImZpdE1vZGUiLCJyZWZyZXNoTWVzaCIsIndvcmxkQ29ybmVycyIsIl9zY3JlZW5NYXRyaXgiLCJkYXRhIiwibXVsMiIsImdldFdvcmxkVHJhbnNmb3JtIiwibG9jYWxQb3MiLCJzZXRUcmFuc2xhdGUiLCJzZXRUUlMiLCJaRVJPIiwiZ2V0TG9jYWxSb3RhdGlvbiIsImdldExvY2FsU2NhbGUiLCJtdWwiLCJfc3luYyIsInNldFBvc2l0aW9uIiwiX3NldFBvc2l0aW9uIiwiX3NldExvY2FsUG9zaXRpb24iLCJfdW5wYXRjaCIsIkVudGl0eSIsInByb3RvdHlwZSIsImNhbGwiLCJpbnZlcnQiLCJsb2NhbFBvc2l0aW9uIiwicHZ0IiwicmVzeCIsInJlc3kiLCJweCIsInB5IiwicmVzb2x1dGlvbiIsIl9zaXplRGlydHkiLCJsb2NhbFRyYW5zZm9ybSIsImxvY2FsUm90YXRpb24iLCJsb2NhbFNjYWxlIiwiX2RpcnR5V29ybGQiLCJ3b3JsZFRyYW5zZm9ybSIsInBhcmVudFdvcmxkVHJhbnNmb3JtIiwic2V0SWRlbnRpdHkiLCJkZXB0aE9mZnNldCIsInBpdm90T2Zmc2V0IiwicmVzdWx0IiwiX3BhcnNlVXBUb1NjcmVlbiIsIl9kaXJ0aWZ5V29ybGQiLCJfdXBkYXRlU2NyZWVuIiwiX2RpcnRpZnlNYXNrIiwiY3VycmVudCIsIm5leHQiLCJfcHJlcmVuZGVyIiwib25jZSIsIl9vblByZXJlbmRlciIsInRyYWNlIiwiVFJBQ0VfSURfRUxFTUVOVCIsImluZGV4T2YiLCJzcGxpY2UiLCJwdXNoIiwibmFtZSIsIm1hc2siLCJkZXB0aCIsInN5bmNNYXNrIiwiX2JpbmRTY3JlZW4iLCJfYmluZEVsZW1lbnQiLCJfdW5iaW5kU2NyZWVuIiwiX3VuYmluZEVsZW1lbnQiLCJwcmV2aW91c1NjcmVlbiIsImNoaWxkcmVuIiwibCIsInN5bmNEcmF3T3JkZXIiLCJfdXBkYXRlTWFzayIsIl9zZXRNYXNrZWRCeSIsInJlbmRlcmFibGVFbGVtZW50IiwicmVmIiwiX21hc2tSZWYiLCJfc2V0U3RlbmNpbCIsIlN0ZW5jaWxQYXJhbWV0ZXJzIiwiZnVuYyIsIkZVTkNfRVFVQUwiLCJjdXJyZW50TWFzayIsInNwIiwienBhc3MiLCJTVEVOQ0lMT1BfSU5DUkVNRU5UIiwiX2NoaWxkcmVuJGkkZWxlbWVudCIsIkZVTkNfQUxXQVlTIiwiU1RFTkNJTE9QX1JFUExBQ0UiLCJfY2hpbGRyZW4kaSRlbGVtZW50MiIsIl9vblNjcmVlblJlc2l6ZSIsInJlcyIsIl9vblNjcmVlblNwYWNlQ2hhbmdlIiwiX29uU2NyZWVuUmVtb3ZlIiwiX2Rlc3Ryb3lpbmciLCJnZXRPZmZzZXRQb3NpdGlvbiIsImNsb25lIiwib25MYXllcnNDaGFuZ2VkIiwib2xkQ29tcCIsIm5ld0NvbXAiLCJvZmYiLCJvbkxheWVyQWRkZWQiLCJvbkxheWVyUmVtb3ZlZCIsImluZGV4IiwiaWQiLCJvbkVuYWJsZSIsIl90aGlzJHN5c3RlbSRhcHAkYmF0YzMiLCJvbkRpc2FibGUiLCJfdGhpcyRzeXN0ZW0kYXBwJGJhdGM0Iiwib25SZW1vdmUiLCJwcm9wYWdhdGVDYWxjdWxhdGVkV2lkdGgiLCJwcm9wYWdhdGVDYWxjdWxhdGVkSGVpZ2h0IiwibmV3V2lkdGgiLCJuZXdIZWlnaHQiLCJoIiwidXBkYXRlTWFyZ2lucyIsImMiLCJfY2hpbGRyZW4iLCJyZW1vdmVNb2RlbEZyb21MYXllcnMiLCJpZHgiLCJnZXRNYXNrT2Zmc2V0IiwiZnJhbWUiLCJtbyIsImlzVmlzaWJsZUZvckNhbWVyYSIsImNhbWVyYSIsImNsaXBMIiwiY2xpcFIiLCJjbGlwVCIsImNsaXBCIiwiY29ybmVycyIsIm1pbiIsIm1heCIsInN3Iiwic2giLCJjYW1lcmFXaWR0aCIsIl9yZWN0IiwiY2FtZXJhSGVpZ2h0IiwiaGl0Q29ybmVycyIsIl9pc1NjcmVlblNwYWNlIiwiX2lzU2NyZWVuQ3VsbGVkIiwiY3VsbCIsIl9kaXJ0eUJhdGNoIiwiX3RoaXMkc3lzdGVtJGFwcCRiYXRjNSIsIm1hcmtHcm91cERpcnR5IiwiX2RlZmluZSIsIk9iamVjdCIsImRlZmluZVByb3BlcnR5IiwiZ2V0Il0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7O0FBc0JBLE1BQU1BLFFBQVEsR0FBRyxJQUFJQyxJQUFJLEVBQUUsQ0FBQTtBQUMzQixNQUFNQyxZQUFZLEdBQUcsSUFBSUMsSUFBSSxFQUFFLENBQUE7QUFFL0IsTUFBTUMsSUFBSSxHQUFHLElBQUlILElBQUksRUFBRSxDQUFBO0FBQ3ZCLE1BQU1JLElBQUksR0FBRyxJQUFJSixJQUFJLEVBQUUsQ0FBQTtBQUN2QixNQUFNSyxJQUFJLEdBQUcsSUFBSUgsSUFBSSxFQUFFLENBQUE7QUFDdkIsTUFBTUksSUFBSSxHQUFHLElBQUlKLElBQUksRUFBRSxDQUFBO0FBQ3ZCLE1BQU1LLElBQUksR0FBRyxJQUFJTCxJQUFJLEVBQUUsQ0FBQTtBQUN2QixNQUFNTSxJQUFJLEdBQUcsSUFBSU4sSUFBSSxFQUFFLENBQUE7O0FBRXZCO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNB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
