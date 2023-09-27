import { Debug } from '../../../core/debug.js';
import { math } from '../../../core/math/math.js';
import { Color } from '../../../core/math/color.js';
import { Vec2 } from '../../../core/math/vec2.js';
import { Vec4 } from '../../../core/math/vec4.js';
import { LAYERID_WORLD, SPRITE_RENDERMODE_TILED, SPRITE_RENDERMODE_SLICED } from '../../../scene/constants.js';
import { BatchGroup } from '../../../scene/batching/batch-group.js';
import { GraphNode } from '../../../scene/graph-node.js';
import { MeshInstance } from '../../../scene/mesh-instance.js';
import { Model } from '../../../scene/model.js';
import { Component } from '../component.js';
import { SPRITETYPE_SIMPLE, SPRITETYPE_ANIMATED } from './constants.js';
import { SpriteAnimationClip } from './sprite-animation-clip.js';

const PARAM_EMISSIVE_MAP = 'texture_emissiveMap';
const PARAM_OPACITY_MAP = 'texture_opacityMap';
const PARAM_EMISSIVE = 'material_emissive';
const PARAM_OPACITY = 'material_opacity';
const PARAM_INNER_OFFSET = 'innerOffset';
const PARAM_OUTER_SCALE = 'outerScale';
const PARAM_ATLAS_RECT = 'atlasRect';

/**
 * Enables an Entity to render a simple static sprite or sprite animations.
 *
 * @augments Component
 * @category Graphics
 */
class SpriteComponent extends Component {
  /**
   * Create a new SpriteComponent instance.
   *
   * @param {import('./system.js').SpriteComponentSystem} system - The ComponentSystem that
   * created this Component.
   * @param {import('../../entity.js').Entity} entity - The Entity that this Component is
   * attached to.
   */
  constructor(system, entity) {
    super(system, entity);
    this._type = SPRITETYPE_SIMPLE;
    this._material = system.defaultMaterial;
    this._color = new Color(1, 1, 1, 1);
    this._colorUniform = new Float32Array(3);
    this._speed = 1;
    this._flipX = false;
    this._flipY = false;
    this._width = 1;
    this._height = 1;
    this._drawOrder = 0;
    this._layers = [LAYERID_WORLD]; // assign to the default world layer

    // 9-slicing
    this._outerScale = new Vec2(1, 1);
    this._outerScaleUniform = new Float32Array(2);
    this._innerOffset = new Vec4();
    this._innerOffsetUniform = new Float32Array(4);
    this._atlasRect = new Vec4();
    this._atlasRectUniform = new Float32Array(4);

    // batch groups
    this._batchGroupId = -1;
    this._batchGroup = null;

    // node / mesh instance
    this._node = new GraphNode();
    this._model = new Model();
    this._model.graph = this._node;
    this._meshInstance = null;
    entity.addChild(this._model.graph);
    this._model._entity = entity;
    this._updateAabbFunc = this._updateAabb.bind(this);
    this._addedModel = false;

    // animated sprites
    this._autoPlayClip = null;

    /**
     * Dictionary of sprite animation clips.
     *
     * @type {Object<string, SpriteAnimationClip>}
     * @private
     */
    this._clips = {};

    // create default clip for simple sprite type
    this._defaultClip = new SpriteAnimationClip(this, {
      name: this.entity.name,
      fps: 0,
      loop: false,
      spriteAsset: null
    });

    /**
     * The sprite animation clip currently playing.
     *
     * @type {SpriteAnimationClip}
     * @private
     */
    this._currentClip = this._defaultClip;
  }

  /**
   * Fired when an animation clip starts playing.
   *
   * @event SpriteComponent#play
   * @param {SpriteAnimationClip} clip - The clip that started playing.
   */

  /**
   * Fired when an animation clip is paused.
   *
   * @event SpriteComponent#pause
   * @param {SpriteAnimationClip} clip - The clip that was paused.
   */

  /**
   * Fired when an animation clip is resumed.
   *
   * @event SpriteComponent#resume
   * @param {SpriteAnimationClip} clip - The clip that was resumed.
   */

  /**
   * Fired when an animation clip is stopped.
   *
   * @event SpriteComponent#stop
   * @param {SpriteAnimationClip} clip - The clip that was stopped.
   */

  /**
   * Fired when an animation clip stops playing because it reached its ending.
   *
   * @event SpriteComponent#end
   * @param {SpriteAnimationClip} clip - The clip that ended.
   */

  /**
   * Fired when an animation clip reached the end of its current loop.
   *
   * @event SpriteComponent#loop
   * @param {SpriteAnimationClip} clip - The clip.
   */

  /**
   * The type of the SpriteComponent. Can be:
   *
   * - {@link SPRITETYPE_SIMPLE}: The component renders a single frame from a sprite asset.
   * - {@link SPRITETYPE_ANIMATED}: The component can play sprite animation clips.
   *
   * Defaults to {@link SPRITETYPE_SIMPLE}.
   *
   * @type {string}
   */
  set type(value) {
    if (this._type === value) return;
    this._type = value;
    if (this._type === SPRITETYPE_SIMPLE) {
      this.stop();
      this._currentClip = this._defaultClip;
      if (this.enabled && this.entity.enabled) {
        this._currentClip.frame = this.frame;
        if (this._currentClip.sprite) {
          this._showModel();
        } else {
          this._hideModel();
        }
      }
    } else if (this._type === SPRITETYPE_ANIMATED) {
      this.stop();
      if (this._autoPlayClip) {
        this._tryAutoPlay();
      }
      if (this._currentClip && this._currentClip.isPlaying && this.enabled && this.entity.enabled) {
        this._showModel();
      } else {
        this._hideModel();
      }
    }
  }
  get type() {
    return this._type;
  }

  /**
   * The frame counter of the sprite. Specifies which frame from the current sprite asset to
   * render.
   *
   * @type {number}
   */
  set frame(value) {
    this._currentClip.frame = value;
  }
  get frame() {
    return this._currentClip.frame;
  }

  /**
   * The asset id or the {@link Asset} of the sprite to render. Only works for
   * {@link SPRITETYPE_SIMPLE} sprites.
   *
   * @type {number|import('../../asset/asset.js').Asset}
   */
  set spriteAsset(value) {
    this._defaultClip.spriteAsset = value;
  }
  get spriteAsset() {
    return this._defaultClip._spriteAsset;
  }

  /**
   * The current sprite.
   *
   * @type {import('../../../scene/sprite.js').Sprite}
   */
  set sprite(value) {
    this._currentClip.sprite = value;
  }
  get sprite() {
    return this._currentClip.sprite;
  }

  // (private) {pc.Material} material The material used to render a sprite.
  set material(value) {
    this._material = value;
    if (this._meshInstance) {
      this._meshInstance.material = value;
    }
  }
  get material() {
    return this._material;
  }

  /**
   * The color tint of the sprite.
   *
   * @type {Color}
   */
  set color(value) {
    this._color.r = value.r;
    this._color.g = value.g;
    this._color.b = value.b;
    if (this._meshInstance) {
      this._colorUniform[0] = this._color.r;
      this._colorUniform[1] = this._color.g;
      this._colorUniform[2] = this._color.b;
      this._meshInstance.setParameter(PARAM_EMISSIVE, this._colorUniform);
    }
  }
  get color() {
    return this._color;
  }

  /**
   * The opacity of the sprite.
   *
   * @type {number}
   */
  set opacity(value) {
    this._color.a = value;
    if (this._meshInstance) {
      this._meshInstance.setParameter(PARAM_OPACITY, value);
    }
  }
  get opacity() {
    return this._color.a;
  }

  /**
   * A dictionary that contains {@link SpriteAnimationClip}s.
   *
   * @type {Object<string, SpriteAnimationClip>}
   */
  set clips(value) {
    // if value is null remove all clips
    if (!value) {
      for (const name in this._clips) {
        this.removeClip(name);
      }
      return;
    }

    // remove existing clips not in new value
    // and update clips in both objects
    for (const name in this._clips) {
      let found = false;
      for (const key in value) {
        if (value[key].name === name) {
          found = true;
          this._clips[name].fps = value[key].fps;
          this._clips[name].loop = value[key].loop;
          if (value[key].hasOwnProperty('sprite')) {
            this._clips[name].sprite = value[key].sprite;
          } else if (value[key].hasOwnProperty('spriteAsset')) {
            this._clips[name].spriteAsset = value[key].spriteAsset;
          }
          break;
        }
      }
      if (!found) {
        this.removeClip(name);
      }
    }

    // add clips that do not exist
    for (const key in value) {
      if (this._clips[value[key].name]) continue;
      this.addClip(value[key]);
    }

    // auto play clip
    if (this._autoPlayClip) {
      this._tryAutoPlay();
    }

    // if the current clip doesn't have a sprite then hide the model
    if (!this._currentClip || !this._currentClip.sprite) {
      this._hideModel();
    }
  }
  get clips() {
    return this._clips;
  }

  /**
   * The current clip being played.
   *
   * @type {SpriteAnimationClip}
   */
  get currentClip() {
    return this._currentClip;
  }

  /**
   * A global speed modifier used when playing sprite animation clips.
   *
   * @type {number}
   */
  set speed(value) {
    this._speed = value;
  }
  get speed() {
    return this._speed;
  }

  /**
   * Flip the X axis when rendering a sprite.
   *
   * @type {boolean}
   */
  set flipX(value) {
    if (this._flipX === value) return;
    this._flipX = value;
    this._updateTransform();
  }
  get flipX() {
    return this._flipX;
  }

  /**
   * Flip the Y axis when rendering a sprite.
   *
   * @type {boolean}
   */
  set flipY(value) {
    if (this._flipY === value) return;
    this._flipY = value;
    this._updateTransform();
  }
  get flipY() {
    return this._flipY;
  }

  /**
   * The width of the sprite when rendering using 9-Slicing. The width and height are only used
   * when the render mode of the sprite asset is Sliced or Tiled.
   *
   * @type {number}
   */
  set width(value) {
    if (value === this._width) return;
    this._width = value;
    this._outerScale.x = this._width;
    if (this.sprite && (this.sprite.renderMode === SPRITE_RENDERMODE_TILED || this.sprite.renderMode === SPRITE_RENDERMODE_SLICED)) {
      this._updateTransform();
    }
  }
  get width() {
    return this._width;
  }

  /**
   * The height of the sprite when rendering using 9-Slicing. The width and height are only used
   * when the render mode of the sprite asset is Sliced or Tiled.
   *
   * @type {number}
   */
  set height(value) {
    if (value === this._height) return;
    this._height = value;
    this._outerScale.y = this.height;
    if (this.sprite && (this.sprite.renderMode === SPRITE_RENDERMODE_TILED || this.sprite.renderMode === SPRITE_RENDERMODE_SLICED)) {
      this._updateTransform();
    }
  }
  get height() {
    return this._height;
  }

  /**
   * Assign sprite to a specific batch group (see {@link BatchGroup}). Default is -1 (no group).
   *
   * @type {number}
   */
  set batchGroupId(value) {
    if (this._batchGroupId === value) return;
    const prev = this._batchGroupId;
    this._batchGroupId = value;
    if (this.entity.enabled && prev >= 0) {
      var _this$system$app$batc;
      (_this$system$app$batc = this.system.app.batcher) == null ? void 0 : _this$system$app$batc.remove(BatchGroup.SPRITE, prev, this.entity);
    }
    if (this.entity.enabled && value >= 0) {
      var _this$system$app$batc2;
      (_this$system$app$batc2 = this.system.app.batcher) == null ? void 0 : _this$system$app$batc2.insert(BatchGroup.SPRITE, value, this.entity);
    } else {
      // re-add model to scene in case it was removed by batching
      if (prev >= 0) {
        if (this._currentClip && this._currentClip.sprite && this.enabled && this.entity.enabled) {
          this._showModel();
        }
      }
    }
  }
  get batchGroupId() {
    return this._batchGroupId;
  }

  /**
   * The name of the clip to play automatically when the component is enabled and the clip exists.
   *
   * @type {string}
   */
  set autoPlayClip(value) {
    this._autoPlayClip = value instanceof SpriteAnimationClip ? value.name : value;
    this._tryAutoPlay();
  }
  get autoPlayClip() {
    return this._autoPlayClip;
  }

  /**
   * The draw order of the component. A higher value means that the component will be rendered on
   * top of other components in the same layer. This is not used unless the layer's sort order is
   * set to {@link SORTMODE_MANUAL}.
   *
   * @type {number}
   */
  set drawOrder(value) {
    this._drawOrder = value;
    if (this._meshInstance) {
      this._meshInstance.drawOrder = value;
    }
  }
  get drawOrder() {
    return this._drawOrder;
  }

  /**
   * An array of layer IDs ({@link Layer#id}) to which this sprite should belong.
   *
   * @type {number[]}
   */
  set layers(value) {
    if (this._addedModel) {
      this._hideModel();
    }
    this._layers = value;

    // early out
    if (!this._meshInstance) {
      return;
    }
    if (this.enabled && this.entity.enabled) {
      this._showModel();
    }
  }
  get layers() {
    return this._layers;
  }
  get aabb() {
    if (this._meshInstance) {
      return this._meshInstance.aabb;
    }
    return null;
  }
  onEnable() {
    const app = this.system.app;
    const scene = app.scene;
    scene.on('set:layers', this._onLayersChanged, this);
    if (scene.layers) {
      scene.layers.on('add', this._onLayerAdded, this);
      scene.layers.on('remove', this._onLayerRemoved, this);
    }
    this._showModel();
    if (this._autoPlayClip) this._tryAutoPlay();
    if (this._batchGroupId >= 0) {
      var _app$batcher;
      (_app$batcher = app.batcher) == null ? void 0 : _app$batcher.insert(BatchGroup.SPRITE, this._batchGroupId, this.entity);
    }
  }
  onDisable() {
    const app = this.system.app;
    const scene = app.scene;
    scene.off('set:layers', this._onLayersChanged, this);
    if (scene.layers) {
      scene.layers.off('add', this._onLayerAdded, this);
      scene.layers.off('remove', this._onLayerRemoved, this);
    }
    this.stop();
    this._hideModel();
    if (this._batchGroupId >= 0) {
      var _app$batcher2;
      (_app$batcher2 = app.batcher) == null ? void 0 : _app$batcher2.remove(BatchGroup.SPRITE, this._batchGroupId, this.entity);
    }
  }
  onDestroy() {
    var _this$_node;
    this._currentClip = null;
    if (this._defaultClip) {
      this._defaultClip._destroy();
      this._defaultClip = null;
    }
    for (const key in this._clips) {
      this._clips[key]._destroy();
    }
    this._clips = null;
    this._hideModel();
    this._model = null;
    (_this$_node = this._node) == null ? void 0 : _this$_node.remove();
    this._node = null;
    if (this._meshInstance) {
      // make sure we decrease the ref counts materials and meshes
      this._meshInstance.material = null;
      this._meshInstance.mesh = null;
      this._meshInstance = null;
    }
  }
  _showModel() {
    if (this._addedModel) return;
    if (!this._meshInstance) return;
    const meshInstances = [this._meshInstance];
    for (let i = 0, len = this._layers.length; i < len; i++) {
      const layer = this.system.app.scene.layers.getLayerById(this._layers[i]);
      if (layer) {
        layer.addMeshInstances(meshInstances);
      }
    }
    this._addedModel = true;
  }
  _hideModel() {
    if (!this._addedModel || !this._meshInstance) return;
    const meshInstances = [this._meshInstance];
    for (let i = 0, len = this._layers.length; i < len; i++) {
      const layer = this.system.app.scene.layers.getLayerById(this._layers[i]);
      if (layer) {
        layer.removeMeshInstances(meshInstances);
      }
    }
    this._addedModel = false;
  }

  // Set the desired mesh on the mesh instance
  _showFrame(frame) {
    if (!this.sprite) return;
    const mesh = this.sprite.meshes[frame];
    // if mesh is null then hide the mesh instance
    if (!mesh) {
      if (this._meshInstance) {
        this._meshInstance.mesh = null;
        this._meshInstance.visible = false;
      }
      return;
    }
    let material;
    if (this.sprite.renderMode === SPRITE_RENDERMODE_SLICED) {
      material = this.system.default9SlicedMaterialSlicedMode;
    } else if (this.sprite.renderMode === SPRITE_RENDERMODE_TILED) {
      material = this.system.default9SlicedMaterialTiledMode;
    } else {
      material = this.system.defaultMaterial;
    }

    // create mesh instance if it doesn't exist yet
    if (!this._meshInstance) {
      this._meshInstance = new MeshInstance(mesh, this._material, this._node);
      this._meshInstance.castShadow = false;
      this._meshInstance.receiveShadow = false;
      this._meshInstance.drawOrder = this._drawOrder;
      this._model.meshInstances.push(this._meshInstance);

      // set overrides on mesh instance
      this._colorUniform[0] = this._color.r;
      this._colorUniform[1] = this._color.g;
      this._colorUniform[2] = this._color.b;
      this._meshInstance.setParameter(PARAM_EMISSIVE, this._colorUniform);
      this._meshInstance.setParameter(PARAM_OPACITY, this._color.a);

      // now that we created the mesh instance, add the model to the scene
      if (this.enabled && this.entity.enabled) {
        this._showModel();
      }
    }

    // update material
    if (this._meshInstance.material !== material) {
      this._meshInstance.material = material;
    }

    // update mesh
    if (this._meshInstance.mesh !== mesh) {
      this._meshInstance.mesh = mesh;
      this._meshInstance.visible = true;
      // reset aabb
      this._meshInstance._aabbVer = -1;
    }

    // set texture params
    if (this.sprite.atlas && this.sprite.atlas.texture) {
      this._meshInstance.setParameter(PARAM_EMISSIVE_MAP, this.sprite.atlas.texture);
      this._meshInstance.setParameter(PARAM_OPACITY_MAP, this.sprite.atlas.texture);
    } else {
      // no texture so reset texture params
      this._meshInstance.deleteParameter(PARAM_EMISSIVE_MAP);
      this._meshInstance.deleteParameter(PARAM_OPACITY_MAP);
    }

    // for 9-sliced
    if (this.sprite.atlas && (this.sprite.renderMode === SPRITE_RENDERMODE_SLICED || this.sprite.renderMode === SPRITE_RENDERMODE_TILED)) {
      // set custom aabb function
      this._meshInstance._updateAabbFunc = this._updateAabbFunc;

      // calculate inner offset
      const frameData = this.sprite.atlas.frames[this.sprite.frameKeys[frame]];
      if (frameData) {
        const borderWidthScale = 2 / frameData.rect.z;
        const borderHeightScale = 2 / frameData.rect.w;
        this._innerOffset.set(frameData.border.x * borderWidthScale, frameData.border.y * borderHeightScale, frameData.border.z * borderWidthScale, frameData.border.w * borderHeightScale);
        const tex = this.sprite.atlas.texture;
        this._atlasRect.set(frameData.rect.x / tex.width, frameData.rect.y / tex.height, frameData.rect.z / tex.width, frameData.rect.w / tex.height);
      } else {
        this._innerOffset.set(0, 0, 0, 0);
      }

      // set inner offset and atlas rect on mesh instance
      this._innerOffsetUniform[0] = this._innerOffset.x;
      this._innerOffsetUniform[1] = this._innerOffset.y;
      this._innerOffsetUniform[2] = this._innerOffset.z;
      this._innerOffsetUniform[3] = this._innerOffset.w;
      this._meshInstance.setParameter(PARAM_INNER_OFFSET, this._innerOffsetUniform);
      this._atlasRectUniform[0] = this._atlasRect.x;
      this._atlasRectUniform[1] = this._atlasRect.y;
      this._atlasRectUniform[2] = this._atlasRect.z;
      this._atlasRectUniform[3] = this._atlasRect.w;
      this._meshInstance.setParameter(PARAM_ATLAS_RECT, this._atlasRectUniform);
    } else {
      this._meshInstance._updateAabbFunc = null;
    }
    this._updateTransform();
  }
  _updateTransform() {
    // flip
    let scaleX = this.flipX ? -1 : 1;
    let scaleY = this.flipY ? -1 : 1;

    // pivot
    let posX = 0;
    let posY = 0;
    if (this.sprite && (this.sprite.renderMode === SPRITE_RENDERMODE_SLICED || this.sprite.renderMode === SPRITE_RENDERMODE_TILED)) {
      let w = 1;
      let h = 1;
      if (this.sprite.atlas) {
        const frameData = this.sprite.atlas.frames[this.sprite.frameKeys[this.frame]];
        if (frameData) {
          // get frame dimensions
          w = frameData.rect.z;
          h = frameData.rect.w;

          // update pivot
          posX = (0.5 - frameData.pivot.x) * this._width;
          posY = (0.5 - frameData.pivot.y) * this._height;
        }
      }

      // scale: apply PPU
      const scaleMulX = w / this.sprite.pixelsPerUnit;
      const scaleMulY = h / this.sprite.pixelsPerUnit;

      // scale borders if necessary instead of overlapping
      this._outerScale.set(Math.max(this._width, this._innerOffset.x * scaleMulX), Math.max(this._height, this._innerOffset.y * scaleMulY));
      scaleX *= scaleMulX;
      scaleY *= scaleMulY;
      this._outerScale.x /= scaleMulX;
      this._outerScale.y /= scaleMulY;

      // scale: shrinking below 1
      scaleX *= math.clamp(this._width / (this._innerOffset.x * scaleMulX), 0.0001, 1);
      scaleY *= math.clamp(this._height / (this._innerOffset.y * scaleMulY), 0.0001, 1);

      // update outer scale
      if (this._meshInstance) {
        this._outerScaleUniform[0] = this._outerScale.x;
        this._outerScaleUniform[1] = this._outerScale.y;
        this._meshInstance.setParameter(PARAM_OUTER_SCALE, this._outerScaleUniform);
      }
    }

    // scale
    this._node.setLocalScale(scaleX, scaleY, 1);
    // pivot
    this._node.setLocalPosition(posX, posY, 0);
  }

  // updates AABB while 9-slicing
  _updateAabb(aabb) {
    // pivot
    aabb.center.set(0, 0, 0);
    // size
    aabb.halfExtents.set(this._outerScale.x * 0.5, this._outerScale.y * 0.5, 0.001);
    // world transform
    aabb.setFromTransformedAabb(aabb, this._node.getWorldTransform());
    return aabb;
  }
  _tryAutoPlay() {
    if (!this._autoPlayClip) return;
    if (this.type !== SPRITETYPE_ANIMATED) return;
    const clip = this._clips[this._autoPlayClip];
    // if the clip exists and nothing else is playing play it
    if (clip && !clip.isPlaying && (!this._currentClip || !this._currentClip.isPlaying)) {
      if (this.enabled && this.entity.enabled) {
        this.play(clip.name);
      }
    }
  }
  _onLayersChanged(oldComp, newComp) {
    oldComp.off('add', this.onLayerAdded, this);
    oldComp.off('remove', this.onLayerRemoved, this);
    newComp.on('add', this.onLayerAdded, this);
    newComp.on('remove', this.onLayerRemoved, this);
    if (this.enabled && this.entity.enabled) {
      this._showModel();
    }
  }
  _onLayerAdded(layer) {
    const index = this.layers.indexOf(layer.id);
    if (index < 0) return;
    if (this._addedModel && this.enabled && this.entity.enabled && this._meshInstance) {
      layer.addMeshInstances([this._meshInstance]);
    }
  }
  _onLayerRemoved(layer) {
    if (!this._meshInstance) return;
    const index = this.layers.indexOf(layer.id);
    if (index < 0) return;
    layer.removeMeshInstances([this._meshInstance]);
  }
  removeModelFromLayers() {
    for (let i = 0; i < this.layers.length; i++) {
      const layer = this.system.app.scene.layers.getLayerById(this.layers[i]);
      if (!layer) continue;
      layer.removeMeshInstances([this._meshInstance]);
    }
  }

  /**
   * Creates and adds a new {@link SpriteAnimationClip} to the component's clips.
   *
   * @param {object} data - Data for the new animation clip.
   * @param {string} [data.name] - The name of the new animation clip.
   * @param {number} [data.fps] - Frames per second for the animation clip.
   * @param {boolean} [data.loop] - Whether to loop the animation clip.
   * @param {number|import('../../asset/asset.js').Asset} [data.spriteAsset] - The asset id or
   * the {@link Asset} of the sprite that this clip will play.
   * @returns {SpriteAnimationClip} The new clip that was added.
   */
  addClip(data) {
    const clip = new SpriteAnimationClip(this, {
      name: data.name,
      fps: data.fps,
      loop: data.loop,
      spriteAsset: data.spriteAsset
    });
    this._clips[data.name] = clip;
    if (clip.name && clip.name === this._autoPlayClip) this._tryAutoPlay();
    return clip;
  }

  /**
   * Removes a clip by name.
   *
   * @param {string} name - The name of the animation clip to remove.
   */
  removeClip(name) {
    delete this._clips[name];
  }

  /**
   * Get an animation clip by name.
   *
   * @param {string} name - The name of the clip.
   * @returns {SpriteAnimationClip} The clip.
   */
  clip(name) {
    return this._clips[name];
  }

  /**
   * Plays a sprite animation clip by name. If the animation clip is already playing then this
   * will do nothing.
   *
   * @param {string} name - The name of the clip to play.
   * @returns {SpriteAnimationClip} The clip that started playing.
   */
  play(name) {
    const clip = this._clips[name];
    const current = this._currentClip;
    if (current && current !== clip) {
      current._playing = false;
    }
    this._currentClip = clip;
    if (this._currentClip) {
      this._currentClip = clip;
      this._currentClip.play();
    } else {
      Debug.warn(`Trying to play sprite animation ${name} which does not exist.`);
    }
    return clip;
  }

  /**
   * Pauses the current animation clip.
   */
  pause() {
    if (this._currentClip === this._defaultClip) return;
    if (this._currentClip.isPlaying) {
      this._currentClip.pause();
    }
  }

  /**
   * Resumes the current paused animation clip.
   */
  resume() {
    if (this._currentClip === this._defaultClip) return;
    if (this._currentClip.isPaused) {
      this._currentClip.resume();
    }
  }

  /**
   * Stops the current animation clip and resets it to the first frame.
   */
  stop() {
    if (this._currentClip === this._defaultClip) return;
    this._currentClip.stop();
  }
}

export { SpriteComponent };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tcG9uZW50LmpzIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi9zcmMvZnJhbWV3b3JrL2NvbXBvbmVudHMvc3ByaXRlL2NvbXBvbmVudC5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBEZWJ1ZyB9IGZyb20gJy4uLy4uLy4uL2NvcmUvZGVidWcuanMnO1xuXG5pbXBvcnQgeyBtYXRoIH0gZnJvbSAnLi4vLi4vLi4vY29yZS9tYXRoL21hdGguanMnO1xuaW1wb3J0IHsgQ29sb3IgfSBmcm9tICcuLi8uLi8uLi9jb3JlL21hdGgvY29sb3IuanMnO1xuaW1wb3J0IHsgVmVjMiB9IGZyb20gJy4uLy4uLy4uL2NvcmUvbWF0aC92ZWMyLmpzJztcbmltcG9ydCB7IFZlYzQgfSBmcm9tICcuLi8uLi8uLi9jb3JlL21hdGgvdmVjNC5qcyc7XG5cbmltcG9ydCB7XG4gICAgTEFZRVJJRF9XT1JMRCxcbiAgICBTUFJJVEVfUkVOREVSTU9ERV9TTElDRUQsIFNQUklURV9SRU5ERVJNT0RFX1RJTEVEXG59IGZyb20gJy4uLy4uLy4uL3NjZW5lL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBCYXRjaEdyb3VwIH0gZnJvbSAnLi4vLi4vLi4vc2NlbmUvYmF0Y2hpbmcvYmF0Y2gtZ3JvdXAuanMnO1xuaW1wb3J0IHsgR3JhcGhOb2RlIH0gZnJvbSAnLi4vLi4vLi4vc2NlbmUvZ3JhcGgtbm9kZS5qcyc7XG5pbXBvcnQgeyBNZXNoSW5zdGFuY2UgfSBmcm9tICcuLi8uLi8uLi9zY2VuZS9tZXNoLWluc3RhbmNlLmpzJztcbmltcG9ydCB7IE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vc2NlbmUvbW9kZWwuanMnO1xuXG5pbXBvcnQgeyBDb21wb25lbnQgfSBmcm9tICcuLi9jb21wb25lbnQuanMnO1xuXG5pbXBvcnQgeyBTUFJJVEVUWVBFX1NJTVBMRSwgU1BSSVRFVFlQRV9BTklNQVRFRCB9IGZyb20gJy4vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IFNwcml0ZUFuaW1hdGlvbkNsaXAgfSBmcm9tICcuL3Nwcml0ZS1hbmltYXRpb24tY2xpcC5qcyc7XG5cbmNvbnN0IFBBUkFNX0VNSVNTSVZFX01BUCA9ICd0ZXh0dXJlX2VtaXNzaXZlTWFwJztcbmNvbnN0IFBBUkFNX09QQUNJVFlfTUFQID0gJ3RleHR1cmVfb3BhY2l0eU1hcCc7XG5jb25zdCBQQVJBTV9FTUlTU0lWRSA9ICdtYXRlcmlhbF9lbWlzc2l2ZSc7XG5jb25zdCBQQVJBTV9PUEFDSVRZID0gJ21hdGVyaWFsX29wYWNpdHknO1xuY29uc3QgUEFSQU1fSU5ORVJfT0ZGU0VUID0gJ2lubmVyT2Zmc2V0JztcbmNvbnN0IFBBUkFNX09VVEVSX1NDQUxFID0gJ291dGVyU2NhbGUnO1xuY29uc3QgUEFSQU1fQVRMQVNfUkVDVCA9ICdhdGxhc1JlY3QnO1xuXG4vKipcbiAqIEVuYWJsZXMgYW4gRW50aXR5IHRvIHJlbmRlciBhIHNpbXBsZSBzdGF0aWMgc3ByaXRlIG9yIHNwcml0ZSBhbmltYXRpb25zLlxuICpcbiAqIEBhdWdtZW50cyBDb21wb25lbnRcbiAqIEBjYXRlZ29yeSBHcmFwaGljc1xuICovXG5jbGFzcyBTcHJpdGVDb21wb25lbnQgZXh0ZW5kcyBDb21wb25lbnQge1xuICAgIC8qKlxuICAgICAqIENyZWF0ZSBhIG5ldyBTcHJpdGVDb21wb25lbnQgaW5zdGFuY2UuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi9zeXN0ZW0uanMnKS5TcHJpdGVDb21wb25lbnRTeXN0ZW19IHN5c3RlbSAtIFRoZSBDb21wb25lbnRTeXN0ZW0gdGhhdFxuICAgICAqIGNyZWF0ZWQgdGhpcyBDb21wb25lbnQuXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4uLy4uL2VudGl0eS5qcycpLkVudGl0eX0gZW50aXR5IC0gVGhlIEVudGl0eSB0aGF0IHRoaXMgQ29tcG9uZW50IGlzXG4gICAgICogYXR0YWNoZWQgdG8uXG4gICAgICovXG4gICAgY29uc3RydWN0b3Ioc3lzdGVtLCBlbnRpdHkpIHtcbiAgICAgICAgc3VwZXIoc3lzdGVtLCBlbnRpdHkpO1xuXG4gICAgICAgIHRoaXMuX3R5cGUgPSBTUFJJVEVUWVBFX1NJTVBMRTtcbiAgICAgICAgdGhpcy5fbWF0ZXJpYWwgPSBzeXN0ZW0uZGVmYXVsdE1hdGVyaWFsO1xuICAgICAgICB0aGlzLl9jb2xvciA9IG5ldyBDb2xvcigxLCAxLCAxLCAxKTtcbiAgICAgICAgdGhpcy5fY29sb3JVbmlmb3JtID0gbmV3IEZsb2F0MzJBcnJheSgzKTtcbiAgICAgICAgdGhpcy5fc3BlZWQgPSAxO1xuICAgICAgICB0aGlzLl9mbGlwWCA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9mbGlwWSA9IGZhbHNlO1xuICAgICAgICB0aGlzLl93aWR0aCA9IDE7XG4gICAgICAgIHRoaXMuX2hlaWdodCA9IDE7XG5cbiAgICAgICAgdGhpcy5fZHJhd09yZGVyID0gMDtcbiAgICAgICAgdGhpcy5fbGF5ZXJzID0gW0xBWUVSSURfV09STERdOyAvLyBhc3NpZ24gdG8gdGhlIGRlZmF1bHQgd29ybGQgbGF5ZXJcblxuICAgICAgICAvLyA5LXNsaWNpbmdcbiAgICAgICAgdGhpcy5fb3V0ZXJTY2FsZSA9IG5ldyBWZWMyKDEsIDEpO1xuICAgICAgICB0aGlzLl9vdXRlclNjYWxlVW5pZm9ybSA9IG5ldyBGbG9hdDMyQXJyYXkoMik7XG4gICAgICAgIHRoaXMuX2lubmVyT2Zmc2V0ID0gbmV3IFZlYzQoKTtcbiAgICAgICAgdGhpcy5faW5uZXJPZmZzZXRVbmlmb3JtID0gbmV3IEZsb2F0MzJBcnJheSg0KTtcbiAgICAgICAgdGhpcy5fYXRsYXNSZWN0ID0gbmV3IFZlYzQoKTtcbiAgICAgICAgdGhpcy5fYXRsYXNSZWN0VW5pZm9ybSA9IG5ldyBGbG9hdDMyQXJyYXkoNCk7XG5cbiAgICAgICAgLy8gYmF0Y2ggZ3JvdXBzXG4gICAgICAgIHRoaXMuX2JhdGNoR3JvdXBJZCA9IC0xO1xuICAgICAgICB0aGlzLl9iYXRjaEdyb3VwID0gbnVsbDtcblxuICAgICAgICAvLyBub2RlIC8gbWVzaCBpbnN0YW5jZVxuICAgICAgICB0aGlzLl9ub2RlID0gbmV3IEdyYXBoTm9kZSgpO1xuICAgICAgICB0aGlzLl9tb2RlbCA9IG5ldyBNb2RlbCgpO1xuICAgICAgICB0aGlzLl9tb2RlbC5ncmFwaCA9IHRoaXMuX25vZGU7XG4gICAgICAgIHRoaXMuX21lc2hJbnN0YW5jZSA9IG51bGw7XG4gICAgICAgIGVudGl0eS5hZGRDaGlsZCh0aGlzLl9tb2RlbC5ncmFwaCk7XG4gICAgICAgIHRoaXMuX21vZGVsLl9lbnRpdHkgPSBlbnRpdHk7XG4gICAgICAgIHRoaXMuX3VwZGF0ZUFhYmJGdW5jID0gdGhpcy5fdXBkYXRlQWFiYi5iaW5kKHRoaXMpO1xuXG4gICAgICAgIHRoaXMuX2FkZGVkTW9kZWwgPSBmYWxzZTtcblxuICAgICAgICAvLyBhbmltYXRlZCBzcHJpdGVzXG4gICAgICAgIHRoaXMuX2F1dG9QbGF5Q2xpcCA9IG51bGw7XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIERpY3Rpb25hcnkgb2Ygc3ByaXRlIGFuaW1hdGlvbiBjbGlwcy5cbiAgICAgICAgICpcbiAgICAgICAgICogQHR5cGUge09iamVjdDxzdHJpbmcsIFNwcml0ZUFuaW1hdGlvbkNsaXA+fVxuICAgICAgICAgKiBAcHJpdmF0ZVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5fY2xpcHMgPSB7fTtcblxuICAgICAgICAvLyBjcmVhdGUgZGVmYXVsdCBjbGlwIGZvciBzaW1wbGUgc3ByaXRlIHR5cGVcbiAgICAgICAgdGhpcy5fZGVmYXVsdENsaXAgPSBuZXcgU3ByaXRlQW5pbWF0aW9uQ2xpcCh0aGlzLCB7XG4gICAgICAgICAgICBuYW1lOiB0aGlzLmVudGl0eS5uYW1lLFxuICAgICAgICAgICAgZnBzOiAwLFxuICAgICAgICAgICAgbG9vcDogZmFsc2UsXG4gICAgICAgICAgICBzcHJpdGVBc3NldDogbnVsbFxuICAgICAgICB9KTtcblxuICAgICAgICAvKipcbiAgICAgICAgICogVGhlIHNwcml0ZSBhbmltYXRpb24gY2xpcCBjdXJyZW50bHkgcGxheWluZy5cbiAgICAgICAgICpcbiAgICAgICAgICogQHR5cGUge1Nwcml0ZUFuaW1hdGlvbkNsaXB9XG4gICAgICAgICAqIEBwcml2YXRlXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLl9jdXJyZW50Q2xpcCA9IHRoaXMuX2RlZmF1bHRDbGlwO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEZpcmVkIHdoZW4gYW4gYW5pbWF0aW9uIGNsaXAgc3RhcnRzIHBsYXlpbmcuXG4gICAgICpcbiAgICAgKiBAZXZlbnQgU3ByaXRlQ29tcG9uZW50I3BsYXlcbiAgICAgKiBAcGFyYW0ge1Nwcml0ZUFuaW1hdGlvbkNsaXB9IGNsaXAgLSBUaGUgY2xpcCB0aGF0IHN0YXJ0ZWQgcGxheWluZy5cbiAgICAgKi9cblxuICAgIC8qKlxuICAgICAqIEZpcmVkIHdoZW4gYW4gYW5pbWF0aW9uIGNsaXAgaXMgcGF1c2VkLlxuICAgICAqXG4gICAgICogQGV2ZW50IFNwcml0ZUNvbXBvbmVudCNwYXVzZVxuICAgICAqIEBwYXJhbSB7U3ByaXRlQW5pbWF0aW9uQ2xpcH0gY2xpcCAtIFRoZSBjbGlwIHRoYXQgd2FzIHBhdXNlZC5cbiAgICAgKi9cblxuICAgIC8qKlxuICAgICAqIEZpcmVkIHdoZW4gYW4gYW5pbWF0aW9uIGNsaXAgaXMgcmVzdW1lZC5cbiAgICAgKlxuICAgICAqIEBldmVudCBTcHJpdGVDb21wb25lbnQjcmVzdW1lXG4gICAgICogQHBhcmFtIHtTcHJpdGVBbmltYXRpb25DbGlwfSBjbGlwIC0gVGhlIGNsaXAgdGhhdCB3YXMgcmVzdW1lZC5cbiAgICAgKi9cblxuICAgIC8qKlxuICAgICAqIEZpcmVkIHdoZW4gYW4gYW5pbWF0aW9uIGNsaXAgaXMgc3RvcHBlZC5cbiAgICAgKlxuICAgICAqIEBldmVudCBTcHJpdGVDb21wb25lbnQjc3RvcFxuICAgICAqIEBwYXJhbSB7U3ByaXRlQW5pbWF0aW9uQ2xpcH0gY2xpcCAtIFRoZSBjbGlwIHRoYXQgd2FzIHN0b3BwZWQuXG4gICAgICovXG5cbiAgICAvKipcbiAgICAgKiBGaXJlZCB3aGVuIGFuIGFuaW1hdGlvbiBjbGlwIHN0b3BzIHBsYXlpbmcgYmVjYXVzZSBpdCByZWFjaGVkIGl0cyBlbmRpbmcuXG4gICAgICpcbiAgICAgKiBAZXZlbnQgU3ByaXRlQ29tcG9uZW50I2VuZFxuICAgICAqIEBwYXJhbSB7U3ByaXRlQW5pbWF0aW9uQ2xpcH0gY2xpcCAtIFRoZSBjbGlwIHRoYXQgZW5kZWQuXG4gICAgICovXG5cbiAgICAvKipcbiAgICAgKiBGaXJlZCB3aGVuIGFuIGFuaW1hdGlvbiBjbGlwIHJlYWNoZWQgdGhlIGVuZCBvZiBpdHMgY3VycmVudCBsb29wLlxuICAgICAqXG4gICAgICogQGV2ZW50IFNwcml0ZUNvbXBvbmVudCNsb29wXG4gICAgICogQHBhcmFtIHtTcHJpdGVBbmltYXRpb25DbGlwfSBjbGlwIC0gVGhlIGNsaXAuXG4gICAgICovXG5cbiAgICAvKipcbiAgICAgKiBUaGUgdHlwZSBvZiB0aGUgU3ByaXRlQ29tcG9uZW50LiBDYW4gYmU6XG4gICAgICpcbiAgICAgKiAtIHtAbGluayBTUFJJVEVUWVBFX1NJTVBMRX06IFRoZSBjb21wb25lbnQgcmVuZGVycyBhIHNpbmdsZSBmcmFtZSBmcm9tIGEgc3ByaXRlIGFzc2V0LlxuICAgICAqIC0ge0BsaW5rIFNQUklURVRZUEVfQU5JTUFURUR9OiBUaGUgY29tcG9uZW50IGNhbiBwbGF5IHNwcml0ZSBhbmltYXRpb24gY2xpcHMuXG4gICAgICpcbiAgICAgKiBEZWZhdWx0cyB0byB7QGxpbmsgU1BSSVRFVFlQRV9TSU1QTEV9LlxuICAgICAqXG4gICAgICogQHR5cGUge3N0cmluZ31cbiAgICAgKi9cbiAgICBzZXQgdHlwZSh2YWx1ZSkge1xuICAgICAgICBpZiAodGhpcy5fdHlwZSA9PT0gdmFsdWUpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgdGhpcy5fdHlwZSA9IHZhbHVlO1xuICAgICAgICBpZiAodGhpcy5fdHlwZSA9PT0gU1BSSVRFVFlQRV9TSU1QTEUpIHtcbiAgICAgICAgICAgIHRoaXMuc3RvcCgpO1xuICAgICAgICAgICAgdGhpcy5fY3VycmVudENsaXAgPSB0aGlzLl9kZWZhdWx0Q2xpcDtcblxuICAgICAgICAgICAgaWYgKHRoaXMuZW5hYmxlZCAmJiB0aGlzLmVudGl0eS5lbmFibGVkKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fY3VycmVudENsaXAuZnJhbWUgPSB0aGlzLmZyYW1lO1xuXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuX2N1cnJlbnRDbGlwLnNwcml0ZSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9zaG93TW9kZWwoKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9oaWRlTW9kZWwoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLl90eXBlID09PSBTUFJJVEVUWVBFX0FOSU1BVEVEKSB7XG4gICAgICAgICAgICB0aGlzLnN0b3AoKTtcblxuICAgICAgICAgICAgaWYgKHRoaXMuX2F1dG9QbGF5Q2xpcCkge1xuICAgICAgICAgICAgICAgIHRoaXMuX3RyeUF1dG9QbGF5KCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICh0aGlzLl9jdXJyZW50Q2xpcCAmJiB0aGlzLl9jdXJyZW50Q2xpcC5pc1BsYXlpbmcgJiYgdGhpcy5lbmFibGVkICYmIHRoaXMuZW50aXR5LmVuYWJsZWQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9zaG93TW9kZWwoKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5faGlkZU1vZGVsKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBnZXQgdHlwZSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3R5cGU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVGhlIGZyYW1lIGNvdW50ZXIgb2YgdGhlIHNwcml0ZS4gU3BlY2lmaWVzIHdoaWNoIGZyYW1lIGZyb20gdGhlIGN1cnJlbnQgc3ByaXRlIGFzc2V0IHRvXG4gICAgICogcmVuZGVyLlxuICAgICAqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKi9cbiAgICBzZXQgZnJhbWUodmFsdWUpIHtcbiAgICAgICAgdGhpcy5fY3VycmVudENsaXAuZnJhbWUgPSB2YWx1ZTtcbiAgICB9XG5cbiAgICBnZXQgZnJhbWUoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9jdXJyZW50Q2xpcC5mcmFtZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUaGUgYXNzZXQgaWQgb3IgdGhlIHtAbGluayBBc3NldH0gb2YgdGhlIHNwcml0ZSB0byByZW5kZXIuIE9ubHkgd29ya3MgZm9yXG4gICAgICoge0BsaW5rIFNQUklURVRZUEVfU0lNUExFfSBzcHJpdGVzLlxuICAgICAqXG4gICAgICogQHR5cGUge251bWJlcnxpbXBvcnQoJy4uLy4uL2Fzc2V0L2Fzc2V0LmpzJykuQXNzZXR9XG4gICAgICovXG4gICAgc2V0IHNwcml0ZUFzc2V0KHZhbHVlKSB7XG4gICAgICAgIHRoaXMuX2RlZmF1bHRDbGlwLnNwcml0ZUFzc2V0ID0gdmFsdWU7XG4gICAgfVxuXG4gICAgZ2V0IHNwcml0ZUFzc2V0KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fZGVmYXVsdENsaXAuX3Nwcml0ZUFzc2V0O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRoZSBjdXJyZW50IHNwcml0ZS5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtpbXBvcnQoJy4uLy4uLy4uL3NjZW5lL3Nwcml0ZS5qcycpLlNwcml0ZX1cbiAgICAgKi9cbiAgICBzZXQgc3ByaXRlKHZhbHVlKSB7XG4gICAgICAgIHRoaXMuX2N1cnJlbnRDbGlwLnNwcml0ZSA9IHZhbHVlO1xuICAgIH1cblxuICAgIGdldCBzcHJpdGUoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9jdXJyZW50Q2xpcC5zcHJpdGU7XG4gICAgfVxuXG4gICAgLy8gKHByaXZhdGUpIHtwYy5NYXRlcmlhbH0gbWF0ZXJpYWwgVGhlIG1hdGVyaWFsIHVzZWQgdG8gcmVuZGVyIGEgc3ByaXRlLlxuICAgIHNldCBtYXRlcmlhbCh2YWx1ZSkge1xuICAgICAgICB0aGlzLl9tYXRlcmlhbCA9IHZhbHVlO1xuICAgICAgICBpZiAodGhpcy5fbWVzaEluc3RhbmNlKSB7XG4gICAgICAgICAgICB0aGlzLl9tZXNoSW5zdGFuY2UubWF0ZXJpYWwgPSB2YWx1ZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGdldCBtYXRlcmlhbCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX21hdGVyaWFsO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRoZSBjb2xvciB0aW50IG9mIHRoZSBzcHJpdGUuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7Q29sb3J9XG4gICAgICovXG4gICAgc2V0IGNvbG9yKHZhbHVlKSB7XG4gICAgICAgIHRoaXMuX2NvbG9yLnIgPSB2YWx1ZS5yO1xuICAgICAgICB0aGlzLl9jb2xvci5nID0gdmFsdWUuZztcbiAgICAgICAgdGhpcy5fY29sb3IuYiA9IHZhbHVlLmI7XG5cbiAgICAgICAgaWYgKHRoaXMuX21lc2hJbnN0YW5jZSkge1xuICAgICAgICAgICAgdGhpcy5fY29sb3JVbmlmb3JtWzBdID0gdGhpcy5fY29sb3IucjtcbiAgICAgICAgICAgIHRoaXMuX2NvbG9yVW5pZm9ybVsxXSA9IHRoaXMuX2NvbG9yLmc7XG4gICAgICAgICAgICB0aGlzLl9jb2xvclVuaWZvcm1bMl0gPSB0aGlzLl9jb2xvci5iO1xuICAgICAgICAgICAgdGhpcy5fbWVzaEluc3RhbmNlLnNldFBhcmFtZXRlcihQQVJBTV9FTUlTU0lWRSwgdGhpcy5fY29sb3JVbmlmb3JtKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGdldCBjb2xvcigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2NvbG9yO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRoZSBvcGFjaXR5IG9mIHRoZSBzcHJpdGUuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqL1xuICAgIHNldCBvcGFjaXR5KHZhbHVlKSB7XG4gICAgICAgIHRoaXMuX2NvbG9yLmEgPSB2YWx1ZTtcbiAgICAgICAgaWYgKHRoaXMuX21lc2hJbnN0YW5jZSkge1xuICAgICAgICAgICAgdGhpcy5fbWVzaEluc3RhbmNlLnNldFBhcmFtZXRlcihQQVJBTV9PUEFDSVRZLCB2YWx1ZSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBnZXQgb3BhY2l0eSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2NvbG9yLmE7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQSBkaWN0aW9uYXJ5IHRoYXQgY29udGFpbnMge0BsaW5rIFNwcml0ZUFuaW1hdGlvbkNsaXB9cy5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtPYmplY3Q8c3RyaW5nLCBTcHJpdGVBbmltYXRpb25DbGlwPn1cbiAgICAgKi9cbiAgICBzZXQgY2xpcHModmFsdWUpIHtcbiAgICAgICAgLy8gaWYgdmFsdWUgaXMgbnVsbCByZW1vdmUgYWxsIGNsaXBzXG4gICAgICAgIGlmICghdmFsdWUpIHtcbiAgICAgICAgICAgIGZvciAoY29uc3QgbmFtZSBpbiB0aGlzLl9jbGlwcykge1xuICAgICAgICAgICAgICAgIHRoaXMucmVtb3ZlQ2xpcChuYW1lKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHJlbW92ZSBleGlzdGluZyBjbGlwcyBub3QgaW4gbmV3IHZhbHVlXG4gICAgICAgIC8vIGFuZCB1cGRhdGUgY2xpcHMgaW4gYm90aCBvYmplY3RzXG4gICAgICAgIGZvciAoY29uc3QgbmFtZSBpbiB0aGlzLl9jbGlwcykge1xuICAgICAgICAgICAgbGV0IGZvdW5kID0gZmFsc2U7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGtleSBpbiB2YWx1ZSkge1xuICAgICAgICAgICAgICAgIGlmICh2YWx1ZVtrZXldLm5hbWUgPT09IG5hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgZm91bmQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9jbGlwc1tuYW1lXS5mcHMgPSB2YWx1ZVtrZXldLmZwcztcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fY2xpcHNbbmFtZV0ubG9vcCA9IHZhbHVlW2tleV0ubG9vcDtcblxuICAgICAgICAgICAgICAgICAgICBpZiAodmFsdWVba2V5XS5oYXNPd25Qcm9wZXJ0eSgnc3ByaXRlJykpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX2NsaXBzW25hbWVdLnNwcml0ZSA9IHZhbHVlW2tleV0uc3ByaXRlO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHZhbHVlW2tleV0uaGFzT3duUHJvcGVydHkoJ3Nwcml0ZUFzc2V0JykpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX2NsaXBzW25hbWVdLnNwcml0ZUFzc2V0ID0gdmFsdWVba2V5XS5zcHJpdGVBc3NldDtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKCFmb3VuZCkge1xuICAgICAgICAgICAgICAgIHRoaXMucmVtb3ZlQ2xpcChuYW1lKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGFkZCBjbGlwcyB0aGF0IGRvIG5vdCBleGlzdFxuICAgICAgICBmb3IgKGNvbnN0IGtleSBpbiB2YWx1ZSkge1xuICAgICAgICAgICAgaWYgKHRoaXMuX2NsaXBzW3ZhbHVlW2tleV0ubmFtZV0pIGNvbnRpbnVlO1xuXG4gICAgICAgICAgICB0aGlzLmFkZENsaXAodmFsdWVba2V5XSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBhdXRvIHBsYXkgY2xpcFxuICAgICAgICBpZiAodGhpcy5fYXV0b1BsYXlDbGlwKSB7XG4gICAgICAgICAgICB0aGlzLl90cnlBdXRvUGxheSgpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gaWYgdGhlIGN1cnJlbnQgY2xpcCBkb2Vzbid0IGhhdmUgYSBzcHJpdGUgdGhlbiBoaWRlIHRoZSBtb2RlbFxuICAgICAgICBpZiAoIXRoaXMuX2N1cnJlbnRDbGlwIHx8ICF0aGlzLl9jdXJyZW50Q2xpcC5zcHJpdGUpIHtcbiAgICAgICAgICAgIHRoaXMuX2hpZGVNb2RlbCgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2V0IGNsaXBzKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fY2xpcHM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVGhlIGN1cnJlbnQgY2xpcCBiZWluZyBwbGF5ZWQuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7U3ByaXRlQW5pbWF0aW9uQ2xpcH1cbiAgICAgKi9cbiAgICBnZXQgY3VycmVudENsaXAoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9jdXJyZW50Q2xpcDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBIGdsb2JhbCBzcGVlZCBtb2RpZmllciB1c2VkIHdoZW4gcGxheWluZyBzcHJpdGUgYW5pbWF0aW9uIGNsaXBzLlxuICAgICAqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKi9cbiAgICBzZXQgc3BlZWQodmFsdWUpIHtcbiAgICAgICAgdGhpcy5fc3BlZWQgPSB2YWx1ZTtcbiAgICB9XG5cbiAgICBnZXQgc3BlZWQoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9zcGVlZDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBGbGlwIHRoZSBYIGF4aXMgd2hlbiByZW5kZXJpbmcgYSBzcHJpdGUuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICAgKi9cbiAgICBzZXQgZmxpcFgodmFsdWUpIHtcbiAgICAgICAgaWYgKHRoaXMuX2ZsaXBYID09PSB2YWx1ZSkgcmV0dXJuO1xuXG4gICAgICAgIHRoaXMuX2ZsaXBYID0gdmFsdWU7XG4gICAgICAgIHRoaXMuX3VwZGF0ZVRyYW5zZm9ybSgpO1xuICAgIH1cblxuICAgIGdldCBmbGlwWCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2ZsaXBYO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEZsaXAgdGhlIFkgYXhpcyB3aGVuIHJlbmRlcmluZyBhIHNwcml0ZS5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAqL1xuICAgIHNldCBmbGlwWSh2YWx1ZSkge1xuICAgICAgICBpZiAodGhpcy5fZmxpcFkgPT09IHZhbHVlKSByZXR1cm47XG5cbiAgICAgICAgdGhpcy5fZmxpcFkgPSB2YWx1ZTtcbiAgICAgICAgdGhpcy5fdXBkYXRlVHJhbnNmb3JtKCk7XG4gICAgfVxuXG4gICAgZ2V0IGZsaXBZKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fZmxpcFk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVGhlIHdpZHRoIG9mIHRoZSBzcHJpdGUgd2hlbiByZW5kZXJpbmcgdXNpbmcgOS1TbGljaW5nLiBUaGUgd2lkdGggYW5kIGhlaWdodCBhcmUgb25seSB1c2VkXG4gICAgICogd2hlbiB0aGUgcmVuZGVyIG1vZGUgb2YgdGhlIHNwcml0ZSBhc3NldCBpcyBTbGljZWQgb3IgVGlsZWQuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqL1xuICAgIHNldCB3aWR0aCh2YWx1ZSkge1xuICAgICAgICBpZiAodmFsdWUgPT09IHRoaXMuX3dpZHRoKSByZXR1cm47XG5cbiAgICAgICAgdGhpcy5fd2lkdGggPSB2YWx1ZTtcbiAgICAgICAgdGhpcy5fb3V0ZXJTY2FsZS54ID0gdGhpcy5fd2lkdGg7XG5cbiAgICAgICAgaWYgKHRoaXMuc3ByaXRlICYmICh0aGlzLnNwcml0ZS5yZW5kZXJNb2RlID09PSBTUFJJVEVfUkVOREVSTU9ERV9USUxFRCB8fCB0aGlzLnNwcml0ZS5yZW5kZXJNb2RlID09PSBTUFJJVEVfUkVOREVSTU9ERV9TTElDRUQpKSB7XG4gICAgICAgICAgICB0aGlzLl91cGRhdGVUcmFuc2Zvcm0oKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGdldCB3aWR0aCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3dpZHRoO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRoZSBoZWlnaHQgb2YgdGhlIHNwcml0ZSB3aGVuIHJlbmRlcmluZyB1c2luZyA5LVNsaWNpbmcuIFRoZSB3aWR0aCBhbmQgaGVpZ2h0IGFyZSBvbmx5IHVzZWRcbiAgICAgKiB3aGVuIHRoZSByZW5kZXIgbW9kZSBvZiB0aGUgc3ByaXRlIGFzc2V0IGlzIFNsaWNlZCBvciBUaWxlZC5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtudW1iZXJ9XG4gICAgICovXG4gICAgc2V0IGhlaWdodCh2YWx1ZSkge1xuICAgICAgICBpZiAodmFsdWUgPT09IHRoaXMuX2hlaWdodCkgcmV0dXJuO1xuXG4gICAgICAgIHRoaXMuX2hlaWdodCA9IHZhbHVlO1xuICAgICAgICB0aGlzLl9vdXRlclNjYWxlLnkgPSB0aGlzLmhlaWdodDtcblxuICAgICAgICBpZiAodGhpcy5zcHJpdGUgJiYgKHRoaXMuc3ByaXRlLnJlbmRlck1vZGUgPT09IFNQUklURV9SRU5ERVJNT0RFX1RJTEVEIHx8IHRoaXMuc3ByaXRlLnJlbmRlck1vZGUgPT09IFNQUklURV9SRU5ERVJNT0RFX1NMSUNFRCkpIHtcbiAgICAgICAgICAgIHRoaXMuX3VwZGF0ZVRyYW5zZm9ybSgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2V0IGhlaWdodCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2hlaWdodDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBc3NpZ24gc3ByaXRlIHRvIGEgc3BlY2lmaWMgYmF0Y2ggZ3JvdXAgKHNlZSB7QGxpbmsgQmF0Y2hHcm91cH0pLiBEZWZhdWx0IGlzIC0xIChubyBncm91cCkuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqL1xuICAgIHNldCBiYXRjaEdyb3VwSWQodmFsdWUpIHtcbiAgICAgICAgaWYgKHRoaXMuX2JhdGNoR3JvdXBJZCA9PT0gdmFsdWUpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgY29uc3QgcHJldiA9IHRoaXMuX2JhdGNoR3JvdXBJZDtcbiAgICAgICAgdGhpcy5fYmF0Y2hHcm91cElkID0gdmFsdWU7XG5cbiAgICAgICAgaWYgKHRoaXMuZW50aXR5LmVuYWJsZWQgJiYgcHJldiA+PSAwKSB7XG4gICAgICAgICAgICB0aGlzLnN5c3RlbS5hcHAuYmF0Y2hlcj8ucmVtb3ZlKEJhdGNoR3JvdXAuU1BSSVRFLCBwcmV2LCB0aGlzLmVudGl0eSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMuZW50aXR5LmVuYWJsZWQgJiYgdmFsdWUgPj0gMCkge1xuICAgICAgICAgICAgdGhpcy5zeXN0ZW0uYXBwLmJhdGNoZXI/Lmluc2VydChCYXRjaEdyb3VwLlNQUklURSwgdmFsdWUsIHRoaXMuZW50aXR5KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIHJlLWFkZCBtb2RlbCB0byBzY2VuZSBpbiBjYXNlIGl0IHdhcyByZW1vdmVkIGJ5IGJhdGNoaW5nXG4gICAgICAgICAgICBpZiAocHJldiA+PSAwKSB7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuX2N1cnJlbnRDbGlwICYmIHRoaXMuX2N1cnJlbnRDbGlwLnNwcml0ZSAmJiB0aGlzLmVuYWJsZWQgJiYgdGhpcy5lbnRpdHkuZW5hYmxlZCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9zaG93TW9kZWwoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBnZXQgYmF0Y2hHcm91cElkKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fYmF0Y2hHcm91cElkO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRoZSBuYW1lIG9mIHRoZSBjbGlwIHRvIHBsYXkgYXV0b21hdGljYWxseSB3aGVuIHRoZSBjb21wb25lbnQgaXMgZW5hYmxlZCBhbmQgdGhlIGNsaXAgZXhpc3RzLlxuICAgICAqXG4gICAgICogQHR5cGUge3N0cmluZ31cbiAgICAgKi9cbiAgICBzZXQgYXV0b1BsYXlDbGlwKHZhbHVlKSB7XG4gICAgICAgIHRoaXMuX2F1dG9QbGF5Q2xpcCA9IHZhbHVlIGluc3RhbmNlb2YgU3ByaXRlQW5pbWF0aW9uQ2xpcCA/IHZhbHVlLm5hbWUgOiB2YWx1ZTtcbiAgICAgICAgdGhpcy5fdHJ5QXV0b1BsYXkoKTtcbiAgICB9XG5cbiAgICBnZXQgYXV0b1BsYXlDbGlwKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fYXV0b1BsYXlDbGlwO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRoZSBkcmF3IG9yZGVyIG9mIHRoZSBjb21wb25lbnQuIEEgaGlnaGVyIHZhbHVlIG1lYW5zIHRoYXQgdGhlIGNvbXBvbmVudCB3aWxsIGJlIHJlbmRlcmVkIG9uXG4gICAgICogdG9wIG9mIG90aGVyIGNvbXBvbmVudHMgaW4gdGhlIHNhbWUgbGF5ZXIuIFRoaXMgaXMgbm90IHVzZWQgdW5sZXNzIHRoZSBsYXllcidzIHNvcnQgb3JkZXIgaXNcbiAgICAgKiBzZXQgdG8ge0BsaW5rIFNPUlRNT0RFX01BTlVBTH0uXG4gICAgICpcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqL1xuICAgIHNldCBkcmF3T3JkZXIodmFsdWUpIHtcbiAgICAgICAgdGhpcy5fZHJhd09yZGVyID0gdmFsdWU7XG4gICAgICAgIGlmICh0aGlzLl9tZXNoSW5zdGFuY2UpIHtcbiAgICAgICAgICAgIHRoaXMuX21lc2hJbnN0YW5jZS5kcmF3T3JkZXIgPSB2YWx1ZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGdldCBkcmF3T3JkZXIoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9kcmF3T3JkZXI7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQW4gYXJyYXkgb2YgbGF5ZXIgSURzICh7QGxpbmsgTGF5ZXIjaWR9KSB0byB3aGljaCB0aGlzIHNwcml0ZSBzaG91bGQgYmVsb25nLlxuICAgICAqXG4gICAgICogQHR5cGUge251bWJlcltdfVxuICAgICAqL1xuICAgIHNldCBsYXllcnModmFsdWUpIHtcbiAgICAgICAgaWYgKHRoaXMuX2FkZGVkTW9kZWwpIHtcbiAgICAgICAgICAgIHRoaXMuX2hpZGVNb2RlbCgpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fbGF5ZXJzID0gdmFsdWU7XG5cbiAgICAgICAgLy8gZWFybHkgb3V0XG4gICAgICAgIGlmICghdGhpcy5fbWVzaEluc3RhbmNlKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5lbmFibGVkICYmIHRoaXMuZW50aXR5LmVuYWJsZWQpIHtcbiAgICAgICAgICAgIHRoaXMuX3Nob3dNb2RlbCgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2V0IGxheWVycygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2xheWVycztcbiAgICB9XG5cbiAgICBnZXQgYWFiYigpIHtcbiAgICAgICAgaWYgKHRoaXMuX21lc2hJbnN0YW5jZSkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX21lc2hJbnN0YW5jZS5hYWJiO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgb25FbmFibGUoKSB7XG4gICAgICAgIGNvbnN0IGFwcCA9IHRoaXMuc3lzdGVtLmFwcDtcbiAgICAgICAgY29uc3Qgc2NlbmUgPSBhcHAuc2NlbmU7XG5cbiAgICAgICAgc2NlbmUub24oJ3NldDpsYXllcnMnLCB0aGlzLl9vbkxheWVyc0NoYW5nZWQsIHRoaXMpO1xuICAgICAgICBpZiAoc2NlbmUubGF5ZXJzKSB7XG4gICAgICAgICAgICBzY2VuZS5sYXllcnMub24oJ2FkZCcsIHRoaXMuX29uTGF5ZXJBZGRlZCwgdGhpcyk7XG4gICAgICAgICAgICBzY2VuZS5sYXllcnMub24oJ3JlbW92ZScsIHRoaXMuX29uTGF5ZXJSZW1vdmVkLCB0aGlzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuX3Nob3dNb2RlbCgpO1xuICAgICAgICBpZiAodGhpcy5fYXV0b1BsYXlDbGlwKVxuICAgICAgICAgICAgdGhpcy5fdHJ5QXV0b1BsYXkoKTtcblxuICAgICAgICBpZiAodGhpcy5fYmF0Y2hHcm91cElkID49IDApIHtcbiAgICAgICAgICAgIGFwcC5iYXRjaGVyPy5pbnNlcnQoQmF0Y2hHcm91cC5TUFJJVEUsIHRoaXMuX2JhdGNoR3JvdXBJZCwgdGhpcy5lbnRpdHkpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgb25EaXNhYmxlKCkge1xuICAgICAgICBjb25zdCBhcHAgPSB0aGlzLnN5c3RlbS5hcHA7XG4gICAgICAgIGNvbnN0IHNjZW5lID0gYXBwLnNjZW5lO1xuXG4gICAgICAgIHNjZW5lLm9mZignc2V0OmxheWVycycsIHRoaXMuX29uTGF5ZXJzQ2hhbmdlZCwgdGhpcyk7XG4gICAgICAgIGlmIChzY2VuZS5sYXllcnMpIHtcbiAgICAgICAgICAgIHNjZW5lLmxheWVycy5vZmYoJ2FkZCcsIHRoaXMuX29uTGF5ZXJBZGRlZCwgdGhpcyk7XG4gICAgICAgICAgICBzY2VuZS5sYXllcnMub2ZmKCdyZW1vdmUnLCB0aGlzLl9vbkxheWVyUmVtb3ZlZCwgdGhpcyk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnN0b3AoKTtcbiAgICAgICAgdGhpcy5faGlkZU1vZGVsKCk7XG5cblxuICAgICAgICBpZiAodGhpcy5fYmF0Y2hHcm91cElkID49IDApIHtcbiAgICAgICAgICAgIGFwcC5iYXRjaGVyPy5yZW1vdmUoQmF0Y2hHcm91cC5TUFJJVEUsIHRoaXMuX2JhdGNoR3JvdXBJZCwgdGhpcy5lbnRpdHkpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgb25EZXN0cm95KCkge1xuICAgICAgICB0aGlzLl9jdXJyZW50Q2xpcCA9IG51bGw7XG5cbiAgICAgICAgaWYgKHRoaXMuX2RlZmF1bHRDbGlwKSB7XG4gICAgICAgICAgICB0aGlzLl9kZWZhdWx0Q2xpcC5fZGVzdHJveSgpO1xuICAgICAgICAgICAgdGhpcy5fZGVmYXVsdENsaXAgPSBudWxsO1xuICAgICAgICB9XG4gICAgICAgIGZvciAoY29uc3Qga2V5IGluIHRoaXMuX2NsaXBzKSB7XG4gICAgICAgICAgICB0aGlzLl9jbGlwc1trZXldLl9kZXN0cm95KCk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5fY2xpcHMgPSBudWxsO1xuXG4gICAgICAgIHRoaXMuX2hpZGVNb2RlbCgpO1xuICAgICAgICB0aGlzLl9tb2RlbCA9IG51bGw7XG5cbiAgICAgICAgdGhpcy5fbm9kZT8ucmVtb3ZlKCk7XG4gICAgICAgIHRoaXMuX25vZGUgPSBudWxsO1xuXG4gICAgICAgIGlmICh0aGlzLl9tZXNoSW5zdGFuY2UpIHtcbiAgICAgICAgICAgIC8vIG1ha2Ugc3VyZSB3ZSBkZWNyZWFzZSB0aGUgcmVmIGNvdW50cyBtYXRlcmlhbHMgYW5kIG1lc2hlc1xuICAgICAgICAgICAgdGhpcy5fbWVzaEluc3RhbmNlLm1hdGVyaWFsID0gbnVsbDtcbiAgICAgICAgICAgIHRoaXMuX21lc2hJbnN0YW5jZS5tZXNoID0gbnVsbDtcbiAgICAgICAgICAgIHRoaXMuX21lc2hJbnN0YW5jZSA9IG51bGw7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBfc2hvd01vZGVsKCkge1xuICAgICAgICBpZiAodGhpcy5fYWRkZWRNb2RlbCkgcmV0dXJuO1xuICAgICAgICBpZiAoIXRoaXMuX21lc2hJbnN0YW5jZSkgcmV0dXJuO1xuXG4gICAgICAgIGNvbnN0IG1lc2hJbnN0YW5jZXMgPSBbdGhpcy5fbWVzaEluc3RhbmNlXTtcblxuICAgICAgICBmb3IgKGxldCBpID0gMCwgbGVuID0gdGhpcy5fbGF5ZXJzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBsYXllciA9IHRoaXMuc3lzdGVtLmFwcC5zY2VuZS5sYXllcnMuZ2V0TGF5ZXJCeUlkKHRoaXMuX2xheWVyc1tpXSk7XG4gICAgICAgICAgICBpZiAobGF5ZXIpIHtcbiAgICAgICAgICAgICAgICBsYXllci5hZGRNZXNoSW5zdGFuY2VzKG1lc2hJbnN0YW5jZXMpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fYWRkZWRNb2RlbCA9IHRydWU7XG4gICAgfVxuXG4gICAgX2hpZGVNb2RlbCgpIHtcbiAgICAgICAgaWYgKCF0aGlzLl9hZGRlZE1vZGVsIHx8ICF0aGlzLl9tZXNoSW5zdGFuY2UpIHJldHVybjtcblxuICAgICAgICBjb25zdCBtZXNoSW5zdGFuY2VzID0gW3RoaXMuX21lc2hJbnN0YW5jZV07XG5cbiAgICAgICAgZm9yIChsZXQgaSA9IDAsIGxlbiA9IHRoaXMuX2xheWVycy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuICAgICAgICAgICAgY29uc3QgbGF5ZXIgPSB0aGlzLnN5c3RlbS5hcHAuc2NlbmUubGF5ZXJzLmdldExheWVyQnlJZCh0aGlzLl9sYXllcnNbaV0pO1xuICAgICAgICAgICAgaWYgKGxheWVyKSB7XG4gICAgICAgICAgICAgICAgbGF5ZXIucmVtb3ZlTWVzaEluc3RhbmNlcyhtZXNoSW5zdGFuY2VzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuX2FkZGVkTW9kZWwgPSBmYWxzZTtcbiAgICB9XG5cbiAgICAvLyBTZXQgdGhlIGRlc2lyZWQgbWVzaCBvbiB0aGUgbWVzaCBpbnN0YW5jZVxuICAgIF9zaG93RnJhbWUoZnJhbWUpIHtcbiAgICAgICAgaWYgKCF0aGlzLnNwcml0ZSkgcmV0dXJuO1xuXG4gICAgICAgIGNvbnN0IG1lc2ggPSB0aGlzLnNwcml0ZS5tZXNoZXNbZnJhbWVdO1xuICAgICAgICAvLyBpZiBtZXNoIGlzIG51bGwgdGhlbiBoaWRlIHRoZSBtZXNoIGluc3RhbmNlXG4gICAgICAgIGlmICghbWVzaCkge1xuICAgICAgICAgICAgaWYgKHRoaXMuX21lc2hJbnN0YW5jZSkge1xuICAgICAgICAgICAgICAgIHRoaXMuX21lc2hJbnN0YW5jZS5tZXNoID0gbnVsbDtcbiAgICAgICAgICAgICAgICB0aGlzLl9tZXNoSW5zdGFuY2UudmlzaWJsZSA9IGZhbHNlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgbWF0ZXJpYWw7XG4gICAgICAgIGlmICh0aGlzLnNwcml0ZS5yZW5kZXJNb2RlID09PSBTUFJJVEVfUkVOREVSTU9ERV9TTElDRUQpIHtcbiAgICAgICAgICAgIG1hdGVyaWFsID0gdGhpcy5zeXN0ZW0uZGVmYXVsdDlTbGljZWRNYXRlcmlhbFNsaWNlZE1vZGU7XG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5zcHJpdGUucmVuZGVyTW9kZSA9PT0gU1BSSVRFX1JFTkRFUk1PREVfVElMRUQpIHtcbiAgICAgICAgICAgIG1hdGVyaWFsID0gdGhpcy5zeXN0ZW0uZGVmYXVsdDlTbGljZWRNYXRlcmlhbFRpbGVkTW9kZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIG1hdGVyaWFsID0gdGhpcy5zeXN0ZW0uZGVmYXVsdE1hdGVyaWFsO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gY3JlYXRlIG1lc2ggaW5zdGFuY2UgaWYgaXQgZG9lc24ndCBleGlzdCB5ZXRcbiAgICAgICAgaWYgKCF0aGlzLl9tZXNoSW5zdGFuY2UpIHtcbiAgICAgICAgICAgIHRoaXMuX21lc2hJbnN0YW5jZSA9IG5ldyBNZXNoSW5zdGFuY2UobWVzaCwgdGhpcy5fbWF0ZXJpYWwsIHRoaXMuX25vZGUpO1xuICAgICAgICAgICAgdGhpcy5fbWVzaEluc3RhbmNlLmNhc3RTaGFkb3cgPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMuX21lc2hJbnN0YW5jZS5yZWNlaXZlU2hhZG93ID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLl9tZXNoSW5zdGFuY2UuZHJhd09yZGVyID0gdGhpcy5fZHJhd09yZGVyO1xuICAgICAgICAgICAgdGhpcy5fbW9kZWwubWVzaEluc3RhbmNlcy5wdXNoKHRoaXMuX21lc2hJbnN0YW5jZSk7XG5cbiAgICAgICAgICAgIC8vIHNldCBvdmVycmlkZXMgb24gbWVzaCBpbnN0YW5jZVxuICAgICAgICAgICAgdGhpcy5fY29sb3JVbmlmb3JtWzBdID0gdGhpcy5fY29sb3IucjtcbiAgICAgICAgICAgIHRoaXMuX2NvbG9yVW5pZm9ybVsxXSA9IHRoaXMuX2NvbG9yLmc7XG4gICAgICAgICAgICB0aGlzLl9jb2xvclVuaWZvcm1bMl0gPSB0aGlzLl9jb2xvci5iO1xuICAgICAgICAgICAgdGhpcy5fbWVzaEluc3RhbmNlLnNldFBhcmFtZXRlcihQQVJBTV9FTUlTU0lWRSwgdGhpcy5fY29sb3JVbmlmb3JtKTtcbiAgICAgICAgICAgIHRoaXMuX21lc2hJbnN0YW5jZS5zZXRQYXJhbWV0ZXIoUEFSQU1fT1BBQ0lUWSwgdGhpcy5fY29sb3IuYSk7XG5cbiAgICAgICAgICAgIC8vIG5vdyB0aGF0IHdlIGNyZWF0ZWQgdGhlIG1lc2ggaW5zdGFuY2UsIGFkZCB0aGUgbW9kZWwgdG8gdGhlIHNjZW5lXG4gICAgICAgICAgICBpZiAodGhpcy5lbmFibGVkICYmIHRoaXMuZW50aXR5LmVuYWJsZWQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9zaG93TW9kZWwoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHVwZGF0ZSBtYXRlcmlhbFxuICAgICAgICBpZiAodGhpcy5fbWVzaEluc3RhbmNlLm1hdGVyaWFsICE9PSBtYXRlcmlhbCkge1xuICAgICAgICAgICAgdGhpcy5fbWVzaEluc3RhbmNlLm1hdGVyaWFsID0gbWF0ZXJpYWw7XG4gICAgICAgIH1cblxuICAgICAgICAvLyB1cGRhdGUgbWVzaFxuICAgICAgICBpZiAodGhpcy5fbWVzaEluc3RhbmNlLm1lc2ggIT09IG1lc2gpIHtcbiAgICAgICAgICAgIHRoaXMuX21lc2hJbnN0YW5jZS5tZXNoID0gbWVzaDtcbiAgICAgICAgICAgIHRoaXMuX21lc2hJbnN0YW5jZS52aXNpYmxlID0gdHJ1ZTtcbiAgICAgICAgICAgIC8vIHJlc2V0IGFhYmJcbiAgICAgICAgICAgIHRoaXMuX21lc2hJbnN0YW5jZS5fYWFiYlZlciA9IC0xO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gc2V0IHRleHR1cmUgcGFyYW1zXG4gICAgICAgIGlmICh0aGlzLnNwcml0ZS5hdGxhcyAmJiB0aGlzLnNwcml0ZS5hdGxhcy50ZXh0dXJlKSB7XG4gICAgICAgICAgICB0aGlzLl9tZXNoSW5zdGFuY2Uuc2V0UGFyYW1ldGVyKFBBUkFNX0VNSVNTSVZFX01BUCwgdGhpcy5zcHJpdGUuYXRsYXMudGV4dHVyZSk7XG4gICAgICAgICAgICB0aGlzLl9tZXNoSW5zdGFuY2Uuc2V0UGFyYW1ldGVyKFBBUkFNX09QQUNJVFlfTUFQLCB0aGlzLnNwcml0ZS5hdGxhcy50ZXh0dXJlKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIG5vIHRleHR1cmUgc28gcmVzZXQgdGV4dHVyZSBwYXJhbXNcbiAgICAgICAgICAgIHRoaXMuX21lc2hJbnN0YW5jZS5kZWxldGVQYXJhbWV0ZXIoUEFSQU1fRU1JU1NJVkVfTUFQKTtcbiAgICAgICAgICAgIHRoaXMuX21lc2hJbnN0YW5jZS5kZWxldGVQYXJhbWV0ZXIoUEFSQU1fT1BBQ0lUWV9NQVApO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gZm9yIDktc2xpY2VkXG4gICAgICAgIGlmICh0aGlzLnNwcml0ZS5hdGxhcyAmJiAodGhpcy5zcHJpdGUucmVuZGVyTW9kZSA9PT0gU1BSSVRFX1JFTkRFUk1PREVfU0xJQ0VEIHx8IHRoaXMuc3ByaXRlLnJlbmRlck1vZGUgPT09IFNQUklURV9SRU5ERVJNT0RFX1RJTEVEKSkge1xuICAgICAgICAgICAgLy8gc2V0IGN1c3RvbSBhYWJiIGZ1bmN0aW9uXG4gICAgICAgICAgICB0aGlzLl9tZXNoSW5zdGFuY2UuX3VwZGF0ZUFhYmJGdW5jID0gdGhpcy5fdXBkYXRlQWFiYkZ1bmM7XG5cbiAgICAgICAgICAgIC8vIGNhbGN1bGF0ZSBpbm5lciBvZmZzZXRcbiAgICAgICAgICAgIGNvbnN0IGZyYW1lRGF0YSA9IHRoaXMuc3ByaXRlLmF0bGFzLmZyYW1lc1t0aGlzLnNwcml0ZS5mcmFtZUtleXNbZnJhbWVdXTtcbiAgICAgICAgICAgIGlmIChmcmFtZURhdGEpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBib3JkZXJXaWR0aFNjYWxlID0gMiAvIGZyYW1lRGF0YS5yZWN0Lno7XG4gICAgICAgICAgICAgICAgY29uc3QgYm9yZGVySGVpZ2h0U2NhbGUgPSAyIC8gZnJhbWVEYXRhLnJlY3QudztcblxuICAgICAgICAgICAgICAgIHRoaXMuX2lubmVyT2Zmc2V0LnNldChcbiAgICAgICAgICAgICAgICAgICAgZnJhbWVEYXRhLmJvcmRlci54ICogYm9yZGVyV2lkdGhTY2FsZSxcbiAgICAgICAgICAgICAgICAgICAgZnJhbWVEYXRhLmJvcmRlci55ICogYm9yZGVySGVpZ2h0U2NhbGUsXG4gICAgICAgICAgICAgICAgICAgIGZyYW1lRGF0YS5ib3JkZXIueiAqIGJvcmRlcldpZHRoU2NhbGUsXG4gICAgICAgICAgICAgICAgICAgIGZyYW1lRGF0YS5ib3JkZXIudyAqIGJvcmRlckhlaWdodFNjYWxlXG4gICAgICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgICAgIGNvbnN0IHRleCA9IHRoaXMuc3ByaXRlLmF0bGFzLnRleHR1cmU7XG4gICAgICAgICAgICAgICAgdGhpcy5fYXRsYXNSZWN0LnNldChmcmFtZURhdGEucmVjdC54IC8gdGV4LndpZHRoLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZnJhbWVEYXRhLnJlY3QueSAvIHRleC5oZWlnaHQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBmcmFtZURhdGEucmVjdC56IC8gdGV4LndpZHRoLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZnJhbWVEYXRhLnJlY3QudyAvIHRleC5oZWlnaHRcbiAgICAgICAgICAgICAgICApO1xuXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMuX2lubmVyT2Zmc2V0LnNldCgwLCAwLCAwLCAwKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gc2V0IGlubmVyIG9mZnNldCBhbmQgYXRsYXMgcmVjdCBvbiBtZXNoIGluc3RhbmNlXG4gICAgICAgICAgICB0aGlzLl9pbm5lck9mZnNldFVuaWZvcm1bMF0gPSB0aGlzLl9pbm5lck9mZnNldC54O1xuICAgICAgICAgICAgdGhpcy5faW5uZXJPZmZzZXRVbmlmb3JtWzFdID0gdGhpcy5faW5uZXJPZmZzZXQueTtcbiAgICAgICAgICAgIHRoaXMuX2lubmVyT2Zmc2V0VW5pZm9ybVsyXSA9IHRoaXMuX2lubmVyT2Zmc2V0Lno7XG4gICAgICAgICAgICB0aGlzLl9pbm5lck9mZnNldFVuaWZvcm1bM10gPSB0aGlzLl9pbm5lck9mZnNldC53O1xuICAgICAgICAgICAgdGhpcy5fbWVzaEluc3RhbmNlLnNldFBhcmFtZXRlcihQQVJBTV9JTk5FUl9PRkZTRVQsIHRoaXMuX2lubmVyT2Zmc2V0VW5pZm9ybSk7XG4gICAgICAgICAgICB0aGlzLl9hdGxhc1JlY3RVbmlmb3JtWzBdID0gdGhpcy5fYXRsYXNSZWN0Lng7XG4gICAgICAgICAgICB0aGlzLl9hdGxhc1JlY3RVbmlmb3JtWzFdID0gdGhpcy5fYXRsYXNSZWN0Lnk7XG4gICAgICAgICAgICB0aGlzLl9hdGxhc1JlY3RVbmlmb3JtWzJdID0gdGhpcy5fYXRsYXNSZWN0Lno7XG4gICAgICAgICAgICB0aGlzLl9hdGxhc1JlY3RVbmlmb3JtWzNdID0gdGhpcy5fYXRsYXNSZWN0Lnc7XG4gICAgICAgICAgICB0aGlzLl9tZXNoSW5zdGFuY2Uuc2V0UGFyYW1ldGVyKFBBUkFNX0FUTEFTX1JFQ1QsIHRoaXMuX2F0bGFzUmVjdFVuaWZvcm0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5fbWVzaEluc3RhbmNlLl91cGRhdGVBYWJiRnVuYyA9IG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl91cGRhdGVUcmFuc2Zvcm0oKTtcbiAgICB9XG5cbiAgICBfdXBkYXRlVHJhbnNmb3JtKCkge1xuICAgICAgICAvLyBmbGlwXG4gICAgICAgIGxldCBzY2FsZVggPSB0aGlzLmZsaXBYID8gLTEgOiAxO1xuICAgICAgICBsZXQgc2NhbGVZID0gdGhpcy5mbGlwWSA/IC0xIDogMTtcblxuICAgICAgICAvLyBwaXZvdFxuICAgICAgICBsZXQgcG9zWCA9IDA7XG4gICAgICAgIGxldCBwb3NZID0gMDtcblxuICAgICAgICBpZiAodGhpcy5zcHJpdGUgJiYgKHRoaXMuc3ByaXRlLnJlbmRlck1vZGUgPT09IFNQUklURV9SRU5ERVJNT0RFX1NMSUNFRCB8fCB0aGlzLnNwcml0ZS5yZW5kZXJNb2RlID09PSBTUFJJVEVfUkVOREVSTU9ERV9USUxFRCkpIHtcblxuICAgICAgICAgICAgbGV0IHcgPSAxO1xuICAgICAgICAgICAgbGV0IGggPSAxO1xuXG4gICAgICAgICAgICBpZiAodGhpcy5zcHJpdGUuYXRsYXMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBmcmFtZURhdGEgPSB0aGlzLnNwcml0ZS5hdGxhcy5mcmFtZXNbdGhpcy5zcHJpdGUuZnJhbWVLZXlzW3RoaXMuZnJhbWVdXTtcbiAgICAgICAgICAgICAgICBpZiAoZnJhbWVEYXRhKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIGdldCBmcmFtZSBkaW1lbnNpb25zXG4gICAgICAgICAgICAgICAgICAgIHcgPSBmcmFtZURhdGEucmVjdC56O1xuICAgICAgICAgICAgICAgICAgICBoID0gZnJhbWVEYXRhLnJlY3QudztcblxuICAgICAgICAgICAgICAgICAgICAvLyB1cGRhdGUgcGl2b3RcbiAgICAgICAgICAgICAgICAgICAgcG9zWCA9ICgwLjUgLSBmcmFtZURhdGEucGl2b3QueCkgKiB0aGlzLl93aWR0aDtcbiAgICAgICAgICAgICAgICAgICAgcG9zWSA9ICgwLjUgLSBmcmFtZURhdGEucGl2b3QueSkgKiB0aGlzLl9oZWlnaHQ7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBzY2FsZTogYXBwbHkgUFBVXG4gICAgICAgICAgICBjb25zdCBzY2FsZU11bFggPSB3IC8gdGhpcy5zcHJpdGUucGl4ZWxzUGVyVW5pdDtcbiAgICAgICAgICAgIGNvbnN0IHNjYWxlTXVsWSA9IGggLyB0aGlzLnNwcml0ZS5waXhlbHNQZXJVbml0O1xuXG4gICAgICAgICAgICAvLyBzY2FsZSBib3JkZXJzIGlmIG5lY2Vzc2FyeSBpbnN0ZWFkIG9mIG92ZXJsYXBwaW5nXG4gICAgICAgICAgICB0aGlzLl9vdXRlclNjYWxlLnNldChNYXRoLm1heCh0aGlzLl93aWR0aCwgdGhpcy5faW5uZXJPZmZzZXQueCAqIHNjYWxlTXVsWCksIE1hdGgubWF4KHRoaXMuX2hlaWdodCwgdGhpcy5faW5uZXJPZmZzZXQueSAqIHNjYWxlTXVsWSkpO1xuXG4gICAgICAgICAgICBzY2FsZVggKj0gc2NhbGVNdWxYO1xuICAgICAgICAgICAgc2NhbGVZICo9IHNjYWxlTXVsWTtcblxuICAgICAgICAgICAgdGhpcy5fb3V0ZXJTY2FsZS54IC89IHNjYWxlTXVsWDtcbiAgICAgICAgICAgIHRoaXMuX291dGVyU2NhbGUueSAvPSBzY2FsZU11bFk7XG5cbiAgICAgICAgICAgIC8vIHNjYWxlOiBzaHJpbmtpbmcgYmVsb3cgMVxuICAgICAgICAgICAgc2NhbGVYICo9IG1hdGguY2xhbXAodGhpcy5fd2lkdGggLyAodGhpcy5faW5uZXJPZmZzZXQueCAqIHNjYWxlTXVsWCksIDAuMDAwMSwgMSk7XG4gICAgICAgICAgICBzY2FsZVkgKj0gbWF0aC5jbGFtcCh0aGlzLl9oZWlnaHQgLyAodGhpcy5faW5uZXJPZmZzZXQueSAqIHNjYWxlTXVsWSksIDAuMDAwMSwgMSk7XG5cbiAgICAgICAgICAgIC8vIHVwZGF0ZSBvdXRlciBzY2FsZVxuICAgICAgICAgICAgaWYgKHRoaXMuX21lc2hJbnN0YW5jZSkge1xuICAgICAgICAgICAgICAgIHRoaXMuX291dGVyU2NhbGVVbmlmb3JtWzBdID0gdGhpcy5fb3V0ZXJTY2FsZS54O1xuICAgICAgICAgICAgICAgIHRoaXMuX291dGVyU2NhbGVVbmlmb3JtWzFdID0gdGhpcy5fb3V0ZXJTY2FsZS55O1xuICAgICAgICAgICAgICAgIHRoaXMuX21lc2hJbnN0YW5jZS5zZXRQYXJhbWV0ZXIoUEFSQU1fT1VURVJfU0NBTEUsIHRoaXMuX291dGVyU2NhbGVVbmlmb3JtKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHNjYWxlXG4gICAgICAgIHRoaXMuX25vZGUuc2V0TG9jYWxTY2FsZShzY2FsZVgsIHNjYWxlWSwgMSk7XG4gICAgICAgIC8vIHBpdm90XG4gICAgICAgIHRoaXMuX25vZGUuc2V0TG9jYWxQb3NpdGlvbihwb3NYLCBwb3NZLCAwKTtcbiAgICB9XG5cbiAgICAvLyB1cGRhdGVzIEFBQkIgd2hpbGUgOS1zbGljaW5nXG4gICAgX3VwZGF0ZUFhYmIoYWFiYikge1xuICAgICAgICAvLyBwaXZvdFxuICAgICAgICBhYWJiLmNlbnRlci5zZXQoMCwgMCwgMCk7XG4gICAgICAgIC8vIHNpemVcbiAgICAgICAgYWFiYi5oYWxmRXh0ZW50cy5zZXQodGhpcy5fb3V0ZXJTY2FsZS54ICogMC41LCB0aGlzLl9vdXRlclNjYWxlLnkgKiAwLjUsIDAuMDAxKTtcbiAgICAgICAgLy8gd29ybGQgdHJhbnNmb3JtXG4gICAgICAgIGFhYmIuc2V0RnJvbVRyYW5zZm9ybWVkQWFiYihhYWJiLCB0aGlzLl9ub2RlLmdldFdvcmxkVHJhbnNmb3JtKCkpO1xuICAgICAgICByZXR1cm4gYWFiYjtcbiAgICB9XG5cbiAgICBfdHJ5QXV0b1BsYXkoKSB7XG4gICAgICAgIGlmICghdGhpcy5fYXV0b1BsYXlDbGlwKSByZXR1cm47XG4gICAgICAgIGlmICh0aGlzLnR5cGUgIT09IFNQUklURVRZUEVfQU5JTUFURUQpIHJldHVybjtcblxuICAgICAgICBjb25zdCBjbGlwID0gdGhpcy5fY2xpcHNbdGhpcy5fYXV0b1BsYXlDbGlwXTtcbiAgICAgICAgLy8gaWYgdGhlIGNsaXAgZXhpc3RzIGFuZCBub3RoaW5nIGVsc2UgaXMgcGxheWluZyBwbGF5IGl0XG4gICAgICAgIGlmIChjbGlwICYmICFjbGlwLmlzUGxheWluZyAmJiAoIXRoaXMuX2N1cnJlbnRDbGlwIHx8ICF0aGlzLl9jdXJyZW50Q2xpcC5pc1BsYXlpbmcpKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5lbmFibGVkICYmIHRoaXMuZW50aXR5LmVuYWJsZWQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXkoY2xpcC5uYW1lKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIF9vbkxheWVyc0NoYW5nZWQob2xkQ29tcCwgbmV3Q29tcCkge1xuICAgICAgICBvbGRDb21wLm9mZignYWRkJywgdGhpcy5vbkxheWVyQWRkZWQsIHRoaXMpO1xuICAgICAgICBvbGRDb21wLm9mZigncmVtb3ZlJywgdGhpcy5vbkxheWVyUmVtb3ZlZCwgdGhpcyk7XG4gICAgICAgIG5ld0NvbXAub24oJ2FkZCcsIHRoaXMub25MYXllckFkZGVkLCB0aGlzKTtcbiAgICAgICAgbmV3Q29tcC5vbigncmVtb3ZlJywgdGhpcy5vbkxheWVyUmVtb3ZlZCwgdGhpcyk7XG5cbiAgICAgICAgaWYgKHRoaXMuZW5hYmxlZCAmJiB0aGlzLmVudGl0eS5lbmFibGVkKSB7XG4gICAgICAgICAgICB0aGlzLl9zaG93TW9kZWwoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIF9vbkxheWVyQWRkZWQobGF5ZXIpIHtcbiAgICAgICAgY29uc3QgaW5kZXggPSB0aGlzLmxheWVycy5pbmRleE9mKGxheWVyLmlkKTtcbiAgICAgICAgaWYgKGluZGV4IDwgMCkgcmV0dXJuO1xuXG4gICAgICAgIGlmICh0aGlzLl9hZGRlZE1vZGVsICYmIHRoaXMuZW5hYmxlZCAmJiB0aGlzLmVudGl0eS5lbmFibGVkICYmIHRoaXMuX21lc2hJbnN0YW5jZSkge1xuICAgICAgICAgICAgbGF5ZXIuYWRkTWVzaEluc3RhbmNlcyhbdGhpcy5fbWVzaEluc3RhbmNlXSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBfb25MYXllclJlbW92ZWQobGF5ZXIpIHtcbiAgICAgICAgaWYgKCF0aGlzLl9tZXNoSW5zdGFuY2UpIHJldHVybjtcblxuICAgICAgICBjb25zdCBpbmRleCA9IHRoaXMubGF5ZXJzLmluZGV4T2YobGF5ZXIuaWQpO1xuICAgICAgICBpZiAoaW5kZXggPCAwKSByZXR1cm47XG4gICAgICAgIGxheWVyLnJlbW92ZU1lc2hJbnN0YW5jZXMoW3RoaXMuX21lc2hJbnN0YW5jZV0pO1xuICAgIH1cblxuICAgIHJlbW92ZU1vZGVsRnJvbUxheWVycygpIHtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLmxheWVycy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgY29uc3QgbGF5ZXIgPSB0aGlzLnN5c3RlbS5hcHAuc2NlbmUubGF5ZXJzLmdldExheWVyQnlJZCh0aGlzLmxheWVyc1tpXSk7XG4gICAgICAgICAgICBpZiAoIWxheWVyKSBjb250aW51ZTtcbiAgICAgICAgICAgIGxheWVyLnJlbW92ZU1lc2hJbnN0YW5jZXMoW3RoaXMuX21lc2hJbnN0YW5jZV0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ3JlYXRlcyBhbmQgYWRkcyBhIG5ldyB7QGxpbmsgU3ByaXRlQW5pbWF0aW9uQ2xpcH0gdG8gdGhlIGNvbXBvbmVudCdzIGNsaXBzLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtvYmplY3R9IGRhdGEgLSBEYXRhIGZvciB0aGUgbmV3IGFuaW1hdGlvbiBjbGlwLlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBbZGF0YS5uYW1lXSAtIFRoZSBuYW1lIG9mIHRoZSBuZXcgYW5pbWF0aW9uIGNsaXAuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFtkYXRhLmZwc10gLSBGcmFtZXMgcGVyIHNlY29uZCBmb3IgdGhlIGFuaW1hdGlvbiBjbGlwLlxuICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gW2RhdGEubG9vcF0gLSBXaGV0aGVyIHRvIGxvb3AgdGhlIGFuaW1hdGlvbiBjbGlwLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfGltcG9ydCgnLi4vLi4vYXNzZXQvYXNzZXQuanMnKS5Bc3NldH0gW2RhdGEuc3ByaXRlQXNzZXRdIC0gVGhlIGFzc2V0IGlkIG9yXG4gICAgICogdGhlIHtAbGluayBBc3NldH0gb2YgdGhlIHNwcml0ZSB0aGF0IHRoaXMgY2xpcCB3aWxsIHBsYXkuXG4gICAgICogQHJldHVybnMge1Nwcml0ZUFuaW1hdGlvbkNsaXB9IFRoZSBuZXcgY2xpcCB0aGF0IHdhcyBhZGRlZC5cbiAgICAgKi9cbiAgICBhZGRDbGlwKGRhdGEpIHtcbiAgICAgICAgY29uc3QgY2xpcCA9IG5ldyBTcHJpdGVBbmltYXRpb25DbGlwKHRoaXMsIHtcbiAgICAgICAgICAgIG5hbWU6IGRhdGEubmFtZSxcbiAgICAgICAgICAgIGZwczogZGF0YS5mcHMsXG4gICAgICAgICAgICBsb29wOiBkYXRhLmxvb3AsXG4gICAgICAgICAgICBzcHJpdGVBc3NldDogZGF0YS5zcHJpdGVBc3NldFxuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLl9jbGlwc1tkYXRhLm5hbWVdID0gY2xpcDtcblxuICAgICAgICBpZiAoY2xpcC5uYW1lICYmIGNsaXAubmFtZSA9PT0gdGhpcy5fYXV0b1BsYXlDbGlwKVxuICAgICAgICAgICAgdGhpcy5fdHJ5QXV0b1BsYXkoKTtcblxuICAgICAgICByZXR1cm4gY2xpcDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZW1vdmVzIGEgY2xpcCBieSBuYW1lLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IG5hbWUgLSBUaGUgbmFtZSBvZiB0aGUgYW5pbWF0aW9uIGNsaXAgdG8gcmVtb3ZlLlxuICAgICAqL1xuICAgIHJlbW92ZUNsaXAobmFtZSkge1xuICAgICAgICBkZWxldGUgdGhpcy5fY2xpcHNbbmFtZV07XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogR2V0IGFuIGFuaW1hdGlvbiBjbGlwIGJ5IG5hbWUuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gbmFtZSAtIFRoZSBuYW1lIG9mIHRoZSBjbGlwLlxuICAgICAqIEByZXR1cm5zIHtTcHJpdGVBbmltYXRpb25DbGlwfSBUaGUgY2xpcC5cbiAgICAgKi9cbiAgICBjbGlwKG5hbWUpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2NsaXBzW25hbWVdO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFBsYXlzIGEgc3ByaXRlIGFuaW1hdGlvbiBjbGlwIGJ5IG5hbWUuIElmIHRoZSBhbmltYXRpb24gY2xpcCBpcyBhbHJlYWR5IHBsYXlpbmcgdGhlbiB0aGlzXG4gICAgICogd2lsbCBkbyBub3RoaW5nLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IG5hbWUgLSBUaGUgbmFtZSBvZiB0aGUgY2xpcCB0byBwbGF5LlxuICAgICAqIEByZXR1cm5zIHtTcHJpdGVBbmltYXRpb25DbGlwfSBUaGUgY2xpcCB0aGF0IHN0YXJ0ZWQgcGxheWluZy5cbiAgICAgKi9cbiAgICBwbGF5KG5hbWUpIHtcbiAgICAgICAgY29uc3QgY2xpcCA9IHRoaXMuX2NsaXBzW25hbWVdO1xuXG4gICAgICAgIGNvbnN0IGN1cnJlbnQgPSB0aGlzLl9jdXJyZW50Q2xpcDtcbiAgICAgICAgaWYgKGN1cnJlbnQgJiYgY3VycmVudCAhPT0gY2xpcCkge1xuICAgICAgICAgICAgY3VycmVudC5fcGxheWluZyA9IGZhbHNlO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fY3VycmVudENsaXAgPSBjbGlwO1xuXG4gICAgICAgIGlmICh0aGlzLl9jdXJyZW50Q2xpcCkge1xuICAgICAgICAgICAgdGhpcy5fY3VycmVudENsaXAgPSBjbGlwO1xuICAgICAgICAgICAgdGhpcy5fY3VycmVudENsaXAucGxheSgpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgRGVidWcud2FybihgVHJ5aW5nIHRvIHBsYXkgc3ByaXRlIGFuaW1hdGlvbiAke25hbWV9IHdoaWNoIGRvZXMgbm90IGV4aXN0LmApO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGNsaXA7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUGF1c2VzIHRoZSBjdXJyZW50IGFuaW1hdGlvbiBjbGlwLlxuICAgICAqL1xuICAgIHBhdXNlKCkge1xuICAgICAgICBpZiAodGhpcy5fY3VycmVudENsaXAgPT09IHRoaXMuX2RlZmF1bHRDbGlwKSByZXR1cm47XG5cbiAgICAgICAgaWYgKHRoaXMuX2N1cnJlbnRDbGlwLmlzUGxheWluZykge1xuICAgICAgICAgICAgdGhpcy5fY3VycmVudENsaXAucGF1c2UoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJlc3VtZXMgdGhlIGN1cnJlbnQgcGF1c2VkIGFuaW1hdGlvbiBjbGlwLlxuICAgICAqL1xuICAgIHJlc3VtZSgpIHtcbiAgICAgICAgaWYgKHRoaXMuX2N1cnJlbnRDbGlwID09PSB0aGlzLl9kZWZhdWx0Q2xpcCkgcmV0dXJuO1xuXG4gICAgICAgIGlmICh0aGlzLl9jdXJyZW50Q2xpcC5pc1BhdXNlZCkge1xuICAgICAgICAgICAgdGhpcy5fY3VycmVudENsaXAucmVzdW1lKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTdG9wcyB0aGUgY3VycmVudCBhbmltYXRpb24gY2xpcCBhbmQgcmVzZXRzIGl0IHRvIHRoZSBmaXJzdCBmcmFtZS5cbiAgICAgKi9cbiAgICBzdG9wKCkge1xuICAgICAgICBpZiAodGhpcy5fY3VycmVudENsaXAgPT09IHRoaXMuX2RlZmF1bHRDbGlwKSByZXR1cm47XG5cbiAgICAgICAgdGhpcy5fY3VycmVudENsaXAuc3RvcCgpO1xuICAgIH1cbn1cblxuZXhwb3J0IHsgU3ByaXRlQ29tcG9uZW50IH07XG4iXSwibmFtZXMiOlsiUEFSQU1fRU1JU1NJVkVfTUFQIiwiUEFSQU1fT1BBQ0lUWV9NQVAiLCJQQVJBTV9FTUlTU0lWRSIsIlBBUkFNX09QQUNJVFkiLCJQQVJBTV9JTk5FUl9PRkZTRVQiLCJQQVJBTV9PVVRFUl9TQ0FMRSIsIlBBUkFNX0FUTEFTX1JFQ1QiLCJTcHJpdGVDb21wb25lbnQiLCJDb21wb25lbnQiLCJjb25zdHJ1Y3RvciIsInN5c3RlbSIsImVudGl0eSIsIl90eXBlIiwiU1BSSVRFVFlQRV9TSU1QTEUiLCJfbWF0ZXJpYWwiLCJkZWZhdWx0TWF0ZXJpYWwiLCJfY29sb3IiLCJDb2xvciIsIl9jb2xvclVuaWZvcm0iLCJGbG9hdDMyQXJyYXkiLCJfc3BlZWQiLCJfZmxpcFgiLCJfZmxpcFkiLCJfd2lkdGgiLCJfaGVpZ2h0IiwiX2RyYXdPcmRlciIsIl9sYXllcnMiLCJMQVlFUklEX1dPUkxEIiwiX291dGVyU2NhbGUiLCJWZWMyIiwiX291dGVyU2NhbGVVbmlmb3JtIiwiX2lubmVyT2Zmc2V0IiwiVmVjNCIsIl9pbm5lck9mZnNldFVuaWZvcm0iLCJfYXRsYXNSZWN0IiwiX2F0bGFzUmVjdFVuaWZvcm0iLCJfYmF0Y2hHcm91cElkIiwiX2JhdGNoR3JvdXAiLCJfbm9kZSIsIkdyYXBoTm9kZSIsIl9tb2RlbCIsIk1vZGVsIiwiZ3JhcGgiLCJfbWVzaEluc3RhbmNlIiwiYWRkQ2hpbGQiLCJfZW50aXR5IiwiX3VwZGF0ZUFhYmJGdW5jIiwiX3VwZGF0ZUFhYmIiLCJiaW5kIiwiX2FkZGVkTW9kZWwiLCJfYXV0b1BsYXlDbGlwIiwiX2NsaXBzIiwiX2RlZmF1bHRDbGlwIiwiU3ByaXRlQW5pbWF0aW9uQ2xpcCIsIm5hbWUiLCJmcHMiLCJsb29wIiwic3ByaXRlQXNzZXQiLCJfY3VycmVudENsaXAiLCJ0eXBlIiwidmFsdWUiLCJzdG9wIiwiZW5hYmxlZCIsImZyYW1lIiwic3ByaXRlIiwiX3Nob3dNb2RlbCIsIl9oaWRlTW9kZWwiLCJTUFJJVEVUWVBFX0FOSU1BVEVEIiwiX3RyeUF1dG9QbGF5IiwiaXNQbGF5aW5nIiwiX3Nwcml0ZUFzc2V0IiwibWF0ZXJpYWwiLCJjb2xvciIsInIiLCJnIiwiYiIsInNldFBhcmFtZXRlciIsIm9wYWNpdHkiLCJhIiwiY2xpcHMiLCJyZW1vdmVDbGlwIiwiZm91bmQiLCJrZXkiLCJoYXNPd25Qcm9wZXJ0eSIsImFkZENsaXAiLCJjdXJyZW50Q2xpcCIsInNwZWVkIiwiZmxpcFgiLCJfdXBkYXRlVHJhbnNmb3JtIiwiZmxpcFkiLCJ3aWR0aCIsIngiLCJyZW5kZXJNb2RlIiwiU1BSSVRFX1JFTkRFUk1PREVfVElMRUQiLCJTUFJJVEVfUkVOREVSTU9ERV9TTElDRUQiLCJoZWlnaHQiLCJ5IiwiYmF0Y2hHcm91cElkIiwicHJldiIsIl90aGlzJHN5c3RlbSRhcHAkYmF0YyIsImFwcCIsImJhdGNoZXIiLCJyZW1vdmUiLCJCYXRjaEdyb3VwIiwiU1BSSVRFIiwiX3RoaXMkc3lzdGVtJGFwcCRiYXRjMiIsImluc2VydCIsImF1dG9QbGF5Q2xpcCIsImRyYXdPcmRlciIsImxheWVycyIsImFhYmIiLCJvbkVuYWJsZSIsInNjZW5lIiwib24iLCJfb25MYXllcnNDaGFuZ2VkIiwiX29uTGF5ZXJBZGRlZCIsIl9vbkxheWVyUmVtb3ZlZCIsIl9hcHAkYmF0Y2hlciIsIm9uRGlzYWJsZSIsIm9mZiIsIl9hcHAkYmF0Y2hlcjIiLCJvbkRlc3Ryb3kiLCJfdGhpcyRfbm9kZSIsIl9kZXN0cm95IiwibWVzaCIsIm1lc2hJbnN0YW5jZXMiLCJpIiwibGVuIiwibGVuZ3RoIiwibGF5ZXIiLCJnZXRMYXllckJ5SWQiLCJhZGRNZXNoSW5zdGFuY2VzIiwicmVtb3ZlTWVzaEluc3RhbmNlcyIsIl9zaG93RnJhbWUiLCJtZXNoZXMiLCJ2aXNpYmxlIiwiZGVmYXVsdDlTbGljZWRNYXRlcmlhbFNsaWNlZE1vZGUiLCJkZWZhdWx0OVNsaWNlZE1hdGVyaWFsVGlsZWRNb2RlIiwiTWVzaEluc3RhbmNlIiwiY2FzdFNoYWRvdyIsInJlY2VpdmVTaGFkb3ciLCJwdXNoIiwiX2FhYmJWZXIiLCJhdGxhcyIsInRleHR1cmUiLCJkZWxldGVQYXJhbWV0ZXIiLCJmcmFtZURhdGEiLCJmcmFtZXMiLCJmcmFtZUtleXMiLCJib3JkZXJXaWR0aFNjYWxlIiwicmVjdCIsInoiLCJib3JkZXJIZWlnaHRTY2FsZSIsInciLCJzZXQiLCJib3JkZXIiLCJ0ZXgiLCJzY2FsZVgiLCJzY2FsZVkiLCJwb3NYIiwicG9zWSIsImgiLCJwaXZvdCIsInNjYWxlTXVsWCIsInBpeGVsc1BlclVuaXQiLCJzY2FsZU11bFkiLCJNYXRoIiwibWF4IiwibWF0aCIsImNsYW1wIiwic2V0TG9jYWxTY2FsZSIsInNldExvY2FsUG9zaXRpb24iLCJjZW50ZXIiLCJoYWxmRXh0ZW50cyIsInNldEZyb21UcmFuc2Zvcm1lZEFhYmIiLCJnZXRXb3JsZFRyYW5zZm9ybSIsImNsaXAiLCJwbGF5Iiwib2xkQ29tcCIsIm5ld0NvbXAiLCJvbkxheWVyQWRkZWQiLCJvbkxheWVyUmVtb3ZlZCIsImluZGV4IiwiaW5kZXhPZiIsImlkIiwicmVtb3ZlTW9kZWxGcm9tTGF5ZXJzIiwiZGF0YSIsImN1cnJlbnQiLCJfcGxheWluZyIsIkRlYnVnIiwid2FybiIsInBhdXNlIiwicmVzdW1lIiwiaXNQYXVzZWQiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7O0FBcUJBLE1BQU1BLGtCQUFrQixHQUFHLHFCQUFxQixDQUFBO0FBQ2hELE1BQU1DLGlCQUFpQixHQUFHLG9CQUFvQixDQUFBO0FBQzlDLE1BQU1DLGNBQWMsR0FBRyxtQkFBbUIsQ0FBQTtBQUMxQyxNQUFNQyxhQUFhLEdBQUcsa0JBQWtCLENBQUE7QUFDeEMsTUFBTUMsa0JBQWtCLEdBQUcsYUFBYSxDQUFBO0FBQ3hDLE1BQU1DLGlCQUFpQixHQUFHLFlBQVksQ0FBQTtBQUN0QyxNQUFNQyxnQkFBZ0IsR0FBRyxXQUFXLENBQUE7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
