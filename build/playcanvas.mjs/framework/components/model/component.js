import { Debug } from '../../../core/debug.js';
import { LAYERID_WORLD } from '../../../scene/constants.js';
import { BatchGroup } from '../../../scene/batching/batch-group.js';
import { GraphNode } from '../../../scene/graph-node.js';
import { MeshInstance } from '../../../scene/mesh-instance.js';
import { Model } from '../../../scene/model.js';
import { getShapePrimitive } from '../../../scene/procedural.js';
import { Asset } from '../../asset/asset.js';
import { Component } from '../component.js';

/**
 * Enables an Entity to render a model or a primitive shape. This Component attaches additional
 * model geometry in to the scene graph below the Entity.
 *
 * @augments Component
 * @category Graphics
 */
class ModelComponent extends Component {
  /**
   * Create a new ModelComponent instance.
   *
   * @param {import('./system.js').ModelComponentSystem} system - The ComponentSystem that
   * created this Component.
   * @param {import('../../entity.js').Entity} entity - The Entity that this Component is
   * attached to.
   */
  constructor(system, entity) {
    super(system, entity);
    /**
     * @type {string}
     * @private
     */
    this._type = 'asset';
    /**
     * @type {Asset|number|null}
     * @private
     */
    this._asset = null;
    /**
     * @type {Model|null}
     * @private
     */
    this._model = null;
    /**
     * @type {Object<string, number>}
     * @private
     */
    this._mapping = {};
    /**
     * @type {boolean}
     * @private
     */
    this._castShadows = true;
    /**
     * @type {boolean}
     * @private
     */
    this._receiveShadows = true;
    /**
     * @type {Asset|number|null}
     * @private
     */
    this._materialAsset = null;
    /**
     * @type {import('../../../scene/materials/material.js').Material}
     * @private
     */
    this._material = void 0;
    /**
     * @type {boolean}
     * @private
     */
    this._castShadowsLightmap = true;
    /**
     * @type {boolean}
     * @private
     */
    this._lightmapped = false;
    /**
     * @type {number}
     * @private
     */
    this._lightmapSizeMultiplier = 1;
    /**
     * Mark meshes as non-movable (optimization).
     *
     * @type {boolean}
     */
    this.isStatic = false;
    /**
     * @type {number[]}
     * @private
     */
    this._layers = [LAYERID_WORLD];
    // assign to the default world layer
    /**
     * @type {number}
     * @private
     */
    this._batchGroupId = -1;
    /**
     * @type {import('../../../core/shape/bounding-box.js').BoundingBox|null}
     * @private
     */
    this._customAabb = null;
    this._area = null;
    this._materialEvents = null;
    /**
     * @type {boolean}
     * @private
     */
    this._clonedModel = false;
    this._batchGroup = null;
    this._material = system.defaultMaterial;

    // handle events when the entity is directly (or indirectly as a child of sub-hierarchy) added or removed from the parent
    entity.on('remove', this.onRemoveChild, this);
    entity.on('removehierarchy', this.onRemoveChild, this);
    entity.on('insert', this.onInsertChild, this);
    entity.on('inserthierarchy', this.onInsertChild, this);
  }

  /**
   * An array of meshInstances contained in the component's model. If model is not set or loaded
   * for component it will return null.
   *
   * @type {MeshInstance[]|null}
   */
  set meshInstances(value) {
    if (!this._model) return;
    this._model.meshInstances = value;
  }
  get meshInstances() {
    if (!this._model) return null;
    return this._model.meshInstances;
  }

  /**
   * If set, the object space bounding box is used as a bounding box for visibility culling of
   * attached mesh instances. This is an optimization, allowing oversized bounding box to be
   * specified for skinned characters in order to avoid per frame bounding box computations based
   * on bone positions.
   *
   * @type {import('../../../core/shape/bounding-box.js').BoundingBox|null}
   */
  set customAabb(value) {
    this._customAabb = value;

    // set it on meshInstances
    if (this._model) {
      const mi = this._model.meshInstances;
      if (mi) {
        for (let i = 0; i < mi.length; i++) {
          mi[i].setCustomAabb(this._customAabb);
        }
      }
    }
  }
  get customAabb() {
    return this._customAabb;
  }

  /**
   * The type of the model. Can be:
   *
   * - "asset": The component will render a model asset
   * - "box": The component will render a box (1 unit in each dimension)
   * - "capsule": The component will render a capsule (radius 0.5, height 2)
   * - "cone": The component will render a cone (radius 0.5, height 1)
   * - "cylinder": The component will render a cylinder (radius 0.5, height 1)
   * - "plane": The component will render a plane (1 unit in each dimension)
   * - "sphere": The component will render a sphere (radius 0.5)
   * - "torus": The component will render a torus (tubeRadius: 0.2, ringRadius: 0.3)
   *
   * @type {string}
   */
  set type(value) {
    if (this._type === value) return;
    this._area = null;
    this._type = value;
    if (value === 'asset') {
      if (this._asset !== null) {
        this._bindModelAsset(this._asset);
      } else {
        this.model = null;
      }
    } else {
      // get / create mesh of type
      const primData = getShapePrimitive(this.system.app.graphicsDevice, value);
      this._area = primData.area;
      const mesh = primData.mesh;
      const node = new GraphNode();
      const model = new Model();
      model.graph = node;
      model.meshInstances = [new MeshInstance(mesh, this._material, node)];
      this.model = model;
      this._asset = null;
    }
  }
  get type() {
    return this._type;
  }

  /**
   * The asset for the model (only applies to models of type 'asset') can also be an asset id.
   *
   * @type {Asset|number|null}
   */
  set asset(value) {
    const assets = this.system.app.assets;
    let _id = value;
    if (value instanceof Asset) {
      _id = value.id;
    }
    if (this._asset !== _id) {
      if (this._asset) {
        // remove previous asset
        assets.off('add:' + this._asset, this._onModelAssetAdded, this);
        const _prev = assets.get(this._asset);
        if (_prev) {
          this._unbindModelAsset(_prev);
        }
      }
      this._asset = _id;
      if (this._asset) {
        const asset = assets.get(this._asset);
        if (!asset) {
          this.model = null;
          assets.on('add:' + this._asset, this._onModelAssetAdded, this);
        } else {
          this._bindModelAsset(asset);
        }
      } else {
        this.model = null;
      }
    }
  }
  get asset() {
    return this._asset;
  }

  /**
   * The model that is added to the scene graph. It can be not set or loaded, so will return null.
   *
   * @type {Model}
   */
  set model(value) {
    if (this._model === value) return;

    // return if the model has been flagged as immutable
    if (value && value._immutable) {
      Debug.error('Invalid attempt to assign a model to multiple ModelComponents');
      return;
    }
    if (this._model) {
      this._model._immutable = false;
      this.removeModelFromLayers();
      this._model.getGraph().destroy();
      delete this._model._entity;
      if (this._clonedModel) {
        this._model.destroy();
        this._clonedModel = false;
      }
    }
    this._model = value;
    if (this._model) {
      // flag the model as being assigned to a component
      this._model._immutable = true;
      const meshInstances = this._model.meshInstances;
      for (let i = 0; i < meshInstances.length; i++) {
        meshInstances[i].castShadow = this._castShadows;
        meshInstances[i].receiveShadow = this._receiveShadows;
        meshInstances[i].setCustomAabb(this._customAabb);
      }
      this.lightmapped = this._lightmapped; // update meshInstances

      this.entity.addChild(this._model.graph);
      if (this.enabled && this.entity.enabled) {
        this.addModelToLayers();
      }

      // Store the entity that owns this model
      this._model._entity = this.entity;

      // Update any animation component
      if (this.entity.animation) this.entity.animation.setModel(this._model);

      // Update any anim component
      if (this.entity.anim) {
        this.entity.anim.rebind();
      }
      // trigger event handler to load mapping
      // for new model
      if (this.type === 'asset') {
        this.mapping = this._mapping;
      } else {
        this._unsetMaterialEvents();
      }
    }
  }
  get model() {
    return this._model;
  }

  /**
   * If true, this model will be lightmapped after using lightmapper.bake().
   *
   * @type {boolean}
   */
  set lightmapped(value) {
    if (value !== this._lightmapped) {
      this._lightmapped = value;
      if (this._model) {
        const mi = this._model.meshInstances;
        for (let i = 0; i < mi.length; i++) {
          mi[i].setLightmapped(value);
        }
      }
    }
  }
  get lightmapped() {
    return this._lightmapped;
  }

  /**
   * If true, this model will cast shadows for lights that have shadow casting enabled.
   *
   * @type {boolean}
   */
  set castShadows(value) {
    if (this._castShadows === value) return;
    const model = this._model;
    if (model) {
      const layers = this.layers;
      const scene = this.system.app.scene;
      if (this._castShadows && !value) {
        for (let i = 0; i < layers.length; i++) {
          const layer = this.system.app.scene.layers.getLayerById(this.layers[i]);
          if (!layer) continue;
          layer.removeShadowCasters(model.meshInstances);
        }
      }
      const meshInstances = model.meshInstances;
      for (let i = 0; i < meshInstances.length; i++) {
        meshInstances[i].castShadow = value;
      }
      if (!this._castShadows && value) {
        for (let i = 0; i < layers.length; i++) {
          const layer = scene.layers.getLayerById(layers[i]);
          if (!layer) continue;
          layer.addShadowCasters(model.meshInstances);
        }
      }
    }
    this._castShadows = value;
  }
  get castShadows() {
    return this._castShadows;
  }

  /**
   * If true, shadows will be cast on this model.
   *
   * @type {boolean}
   */
  set receiveShadows(value) {
    if (this._receiveShadows === value) return;
    this._receiveShadows = value;
    if (this._model) {
      const meshInstances = this._model.meshInstances;
      for (let i = 0, len = meshInstances.length; i < len; i++) {
        meshInstances[i].receiveShadow = value;
      }
    }
  }
  get receiveShadows() {
    return this._receiveShadows;
  }

  /**
   * If true, this model will cast shadows when rendering lightmaps.
   *
   * @type {boolean}
   */
  set castShadowsLightmap(value) {
    this._castShadowsLightmap = value;
  }
  get castShadowsLightmap() {
    return this._castShadowsLightmap;
  }

  /**
   * Lightmap resolution multiplier.
   *
   * @type {number}
   */
  set lightmapSizeMultiplier(value) {
    this._lightmapSizeMultiplier = value;
  }
  get lightmapSizeMultiplier() {
    return this._lightmapSizeMultiplier;
  }

  /**
   * An array of layer IDs ({@link Layer#id}) to which this model should belong. Don't push, pop,
   * splice or modify this array, if you want to change it - set a new one instead.
   *
   * @type {number[]}
   */
  set layers(value) {
    const layers = this.system.app.scene.layers;
    if (this.meshInstances) {
      // remove all mesh instances from old layers
      for (let i = 0; i < this._layers.length; i++) {
        const layer = layers.getLayerById(this._layers[i]);
        if (!layer) continue;
        layer.removeMeshInstances(this.meshInstances);
      }
    }

    // set the layer list
    this._layers.length = 0;
    for (let i = 0; i < value.length; i++) {
      this._layers[i] = value[i];
    }

    // don't add into layers until we're enabled
    if (!this.enabled || !this.entity.enabled || !this.meshInstances) return;

    // add all mesh instances to new layers
    for (let i = 0; i < this._layers.length; i++) {
      const layer = layers.getLayerById(this._layers[i]);
      if (!layer) continue;
      layer.addMeshInstances(this.meshInstances);
    }
  }
  get layers() {
    return this._layers;
  }

  /**
   * Assign model to a specific batch group (see {@link BatchGroup}). Default is -1 (no group).
   *
   * @type {number}
   */
  set batchGroupId(value) {
    if (this._batchGroupId === value) return;
    if (this.entity.enabled && this._batchGroupId >= 0) {
      var _this$system$app$batc;
      (_this$system$app$batc = this.system.app.batcher) == null ? void 0 : _this$system$app$batc.remove(BatchGroup.MODEL, this.batchGroupId, this.entity);
    }
    if (this.entity.enabled && value >= 0) {
      var _this$system$app$batc2;
      (_this$system$app$batc2 = this.system.app.batcher) == null ? void 0 : _this$system$app$batc2.insert(BatchGroup.MODEL, value, this.entity);
    }
    if (value < 0 && this._batchGroupId >= 0 && this.enabled && this.entity.enabled) {
      // re-add model to scene, in case it was removed by batching
      this.addModelToLayers();
    }
    this._batchGroupId = value;
  }
  get batchGroupId() {
    return this._batchGroupId;
  }

  /**
   * The material {@link Asset} that will be used to render the model (not used on models of type
   * 'asset').
   *
   * @type {Asset|number|null}
   */
  set materialAsset(value) {
    let _id = value;
    if (value instanceof Asset) {
      _id = value.id;
    }
    const assets = this.system.app.assets;
    if (_id !== this._materialAsset) {
      if (this._materialAsset) {
        assets.off('add:' + this._materialAsset, this._onMaterialAssetAdd, this);
        const _prev = assets.get(this._materialAsset);
        if (_prev) {
          this._unbindMaterialAsset(_prev);
        }
      }
      this._materialAsset = _id;
      if (this._materialAsset) {
        const asset = assets.get(this._materialAsset);
        if (!asset) {
          this._setMaterial(this.system.defaultMaterial);
          assets.on('add:' + this._materialAsset, this._onMaterialAssetAdd, this);
        } else {
          this._bindMaterialAsset(asset);
        }
      } else {
        this._setMaterial(this.system.defaultMaterial);
      }
    }
  }
  get materialAsset() {
    return this._materialAsset;
  }

  /**
   * The material {@link Material} that will be used to render the model (not used on models of
   * type 'asset').
   *
   * @type {import('../../../scene/materials/material.js').Material}
   */
  set material(value) {
    if (this._material === value) return;
    this.materialAsset = null;
    this._setMaterial(value);
  }
  get material() {
    return this._material;
  }

  /**
   * A dictionary that holds material overrides for each mesh instance. Only applies to model
   * components of type 'asset'. The mapping contains pairs of mesh instance index - material
   * asset id.
   *
   * @type {Object<string, number>}
   */
  set mapping(value) {
    if (this._type !== 'asset') return;

    // unsubscribe from old events
    this._unsetMaterialEvents();

    // can't have a null mapping
    if (!value) value = {};
    this._mapping = value;
    if (!this._model) return;
    const meshInstances = this._model.meshInstances;
    const modelAsset = this.asset ? this.system.app.assets.get(this.asset) : null;
    const assetMapping = modelAsset ? modelAsset.data.mapping : null;
    let asset = null;
    for (let i = 0, len = meshInstances.length; i < len; i++) {
      if (value[i] !== undefined) {
        if (value[i]) {
          asset = this.system.app.assets.get(value[i]);
          this._loadAndSetMeshInstanceMaterial(asset, meshInstances[i], i);
        } else {
          meshInstances[i].material = this.system.defaultMaterial;
        }
      } else if (assetMapping) {
        if (assetMapping[i] && (assetMapping[i].material || assetMapping[i].path)) {
          if (assetMapping[i].material !== undefined) {
            asset = this.system.app.assets.get(assetMapping[i].material);
          } else if (assetMapping[i].path !== undefined) {
            const url = this._getMaterialAssetUrl(assetMapping[i].path);
            if (url) {
              asset = this.system.app.assets.getByUrl(url);
            }
          }
          this._loadAndSetMeshInstanceMaterial(asset, meshInstances[i], i);
        } else {
          meshInstances[i].material = this.system.defaultMaterial;
        }
      }
    }
  }
  get mapping() {
    return this._mapping;
  }
  addModelToLayers() {
    const layers = this.system.app.scene.layers;
    for (let i = 0; i < this._layers.length; i++) {
      const layer = layers.getLayerById(this._layers[i]);
      if (layer) {
        layer.addMeshInstances(this.meshInstances);
      }
    }
  }
  removeModelFromLayers() {
    const layers = this.system.app.scene.layers;
    for (let i = 0; i < this._layers.length; i++) {
      const layer = layers.getLayerById(this._layers[i]);
      if (!layer) continue;
      layer.removeMeshInstances(this.meshInstances);
    }
  }
  onRemoveChild() {
    if (this._model) this.removeModelFromLayers();
  }
  onInsertChild() {
    if (this._model && this.enabled && this.entity.enabled) this.addModelToLayers();
  }
  onRemove() {
    this.asset = null;
    this.model = null;
    this.materialAsset = null;
    this._unsetMaterialEvents();
    this.entity.off('remove', this.onRemoveChild, this);
    this.entity.off('insert', this.onInsertChild, this);
  }

  /**
   * @param {import('../../../scene/composition/layer-composition.js').LayerComposition} oldComp - The
   * old layer composition.
   * @param {import('../../../scene/composition/layer-composition.js').LayerComposition} newComp - The
   * new layer composition.
   * @private
   */
  onLayersChanged(oldComp, newComp) {
    this.addModelToLayers();
    oldComp.off('add', this.onLayerAdded, this);
    oldComp.off('remove', this.onLayerRemoved, this);
    newComp.on('add', this.onLayerAdded, this);
    newComp.on('remove', this.onLayerRemoved, this);
  }

  /**
   * @param {import('../../../scene/layer.js').Layer} layer - The layer that was added.
   * @private
   */
  onLayerAdded(layer) {
    const index = this.layers.indexOf(layer.id);
    if (index < 0) return;
    layer.addMeshInstances(this.meshInstances);
  }

  /**
   * @param {import('../../../scene/layer.js').Layer} layer - The layer that was removed.
   * @private
   */
  onLayerRemoved(layer) {
    const index = this.layers.indexOf(layer.id);
    if (index < 0) return;
    layer.removeMeshInstances(this.meshInstances);
  }

  /**
   * @param {number} index - The index of the mesh instance.
   * @param {string} event - The event name.
   * @param {number} id - The asset id.
   * @param {*} handler - The handler function to be bound to the specified event.
   * @private
   */
  _setMaterialEvent(index, event, id, handler) {
    const evt = event + ':' + id;
    this.system.app.assets.on(evt, handler, this);
    if (!this._materialEvents) this._materialEvents = [];
    if (!this._materialEvents[index]) this._materialEvents[index] = {};
    this._materialEvents[index][evt] = {
      id: id,
      handler: handler
    };
  }

  /** @private */
  _unsetMaterialEvents() {
    const assets = this.system.app.assets;
    const events = this._materialEvents;
    if (!events) return;
    for (let i = 0, len = events.length; i < len; i++) {
      if (!events[i]) continue;
      const evt = events[i];
      for (const key in evt) {
        assets.off(key, evt[key].handler, this);
      }
    }
    this._materialEvents = null;
  }

  /**
   * @param {string} idOrPath - The asset id or path.
   * @returns {Asset|null} The asset.
   * @private
   */
  _getAssetByIdOrPath(idOrPath) {
    let asset = null;
    const isPath = isNaN(parseInt(idOrPath, 10));

    // get asset by id or url
    if (!isPath) {
      asset = this.system.app.assets.get(idOrPath);
    } else if (this.asset) {
      const url = this._getMaterialAssetUrl(idOrPath);
      if (url) asset = this.system.app.assets.getByUrl(url);
    }
    return asset;
  }

  /**
   * @param {string} path - The path of the model asset.
   * @returns {string|null} The model asset URL or null if the asset is not in the registry.
   * @private
   */
  _getMaterialAssetUrl(path) {
    if (!this.asset) return null;
    const modelAsset = this.system.app.assets.get(this.asset);
    return modelAsset ? modelAsset.getAbsoluteUrl(path) : null;
  }

  /**
   * @param {Asset} materialAsset -The material asset to load.
   * @param {MeshInstance} meshInstance - The mesh instance to assign the material to.
   * @param {number} index - The index of the mesh instance.
   * @private
   */
  _loadAndSetMeshInstanceMaterial(materialAsset, meshInstance, index) {
    const assets = this.system.app.assets;
    if (!materialAsset) return;
    if (materialAsset.resource) {
      meshInstance.material = materialAsset.resource;
      this._setMaterialEvent(index, 'remove', materialAsset.id, function () {
        meshInstance.material = this.system.defaultMaterial;
      });
    } else {
      this._setMaterialEvent(index, 'load', materialAsset.id, function (asset) {
        meshInstance.material = asset.resource;
        this._setMaterialEvent(index, 'remove', materialAsset.id, function () {
          meshInstance.material = this.system.defaultMaterial;
        });
      });
      if (this.enabled && this.entity.enabled) assets.load(materialAsset);
    }
  }
  onEnable() {
    const app = this.system.app;
    const scene = app.scene;
    scene.on('set:layers', this.onLayersChanged, this);
    if (scene.layers) {
      scene.layers.on('add', this.onLayerAdded, this);
      scene.layers.on('remove', this.onLayerRemoved, this);
    }
    const isAsset = this._type === 'asset';
    let asset;
    if (this._model) {
      this.addModelToLayers();
    } else if (isAsset && this._asset) {
      // bind and load model asset if necessary
      asset = app.assets.get(this._asset);
      if (asset && asset.resource !== this._model) {
        this._bindModelAsset(asset);
      }
    }
    if (this._materialAsset) {
      // bind and load material asset if necessary
      asset = app.assets.get(this._materialAsset);
      if (asset && asset.resource !== this._material) {
        this._bindMaterialAsset(asset);
      }
    }
    if (isAsset) {
      // bind mapped assets
      // TODO: replace
      if (this._mapping) {
        for (const index in this._mapping) {
          if (this._mapping[index]) {
            asset = this._getAssetByIdOrPath(this._mapping[index]);
            if (asset && !asset.resource) {
              app.assets.load(asset);
            }
          }
        }
      }
    }
    if (this._batchGroupId >= 0) {
      var _app$batcher;
      (_app$batcher = app.batcher) == null ? void 0 : _app$batcher.insert(BatchGroup.MODEL, this.batchGroupId, this.entity);
    }
  }
  onDisable() {
    const app = this.system.app;
    const scene = app.scene;
    scene.off('set:layers', this.onLayersChanged, this);
    if (scene.layers) {
      scene.layers.off('add', this.onLayerAdded, this);
      scene.layers.off('remove', this.onLayerRemoved, this);
    }
    if (this._batchGroupId >= 0) {
      var _app$batcher2;
      (_app$batcher2 = app.batcher) == null ? void 0 : _app$batcher2.remove(BatchGroup.MODEL, this.batchGroupId, this.entity);
    }
    if (this._model) {
      this.removeModelFromLayers();
    }
  }

  /**
   * Stop rendering model without removing it from the scene hierarchy. This method sets the
   * {@link MeshInstance#visible} property of every MeshInstance in the model to false Note, this
   * does not remove the model or mesh instances from the scene hierarchy or draw call list. So
   * the model component still incurs some CPU overhead.
   *
   * @example
   * this.timer = 0;
   * this.visible = true;
   * // ...
   * // blink model every 0.1 seconds
   * this.timer += dt;
   * if (this.timer > 0.1) {
   *     if (!this.visible) {
   *         this.entity.model.show();
   *         this.visible = true;
   *     } else {
   *         this.entity.model.hide();
   *         this.visible = false;
   *     }
   *     this.timer = 0;
   * }
   */
  hide() {
    if (this._model) {
      const instances = this._model.meshInstances;
      for (let i = 0, l = instances.length; i < l; i++) {
        instances[i].visible = false;
      }
    }
  }

  /**
   * Enable rendering of the model if hidden using {@link ModelComponent#hide}. This method sets
   * all the {@link MeshInstance#visible} property on all mesh instances to true.
   */
  show() {
    if (this._model) {
      const instances = this._model.meshInstances;
      for (let i = 0, l = instances.length; i < l; i++) {
        instances[i].visible = true;
      }
    }
  }

  /**
   * @param {Asset} asset - The material asset to bind events to.
   * @private
   */
  _bindMaterialAsset(asset) {
    asset.on('load', this._onMaterialAssetLoad, this);
    asset.on('unload', this._onMaterialAssetUnload, this);
    asset.on('remove', this._onMaterialAssetRemove, this);
    asset.on('change', this._onMaterialAssetChange, this);
    if (asset.resource) {
      this._onMaterialAssetLoad(asset);
    } else {
      // don't trigger an asset load unless the component is enabled
      if (!this.enabled || !this.entity.enabled) return;
      this.system.app.assets.load(asset);
    }
  }

  /**
   * @param {Asset} asset - The material asset to unbind events from.
   * @private
   */
  _unbindMaterialAsset(asset) {
    asset.off('load', this._onMaterialAssetLoad, this);
    asset.off('unload', this._onMaterialAssetUnload, this);
    asset.off('remove', this._onMaterialAssetRemove, this);
    asset.off('change', this._onMaterialAssetChange, this);
  }

  /**
   * @param {Asset} asset - The material asset on which an asset add event has been fired.
   * @private
   */
  _onMaterialAssetAdd(asset) {
    this.system.app.assets.off('add:' + asset.id, this._onMaterialAssetAdd, this);
    if (this._materialAsset === asset.id) {
      this._bindMaterialAsset(asset);
    }
  }

  /**
   * @param {Asset} asset - The material asset on which an asset load event has been fired.
   * @private
   */
  _onMaterialAssetLoad(asset) {
    this._setMaterial(asset.resource);
  }

  /**
   * @param {Asset} asset - The material asset on which an asset unload event has been fired.
   * @private
   */
  _onMaterialAssetUnload(asset) {
    this._setMaterial(this.system.defaultMaterial);
  }

  /**
   * @param {Asset} asset - The material asset on which an asset remove event has been fired.
   * @private
   */
  _onMaterialAssetRemove(asset) {
    this._onMaterialAssetUnload(asset);
  }

  /**
   * @param {Asset} asset - The material asset on which an asset change event has been fired.
   * @private
   */
  _onMaterialAssetChange(asset) {}

  /**
   * @param {Asset} asset - The model asset to bind events to.
   * @private
   */
  _bindModelAsset(asset) {
    this._unbindModelAsset(asset);
    asset.on('load', this._onModelAssetLoad, this);
    asset.on('unload', this._onModelAssetUnload, this);
    asset.on('change', this._onModelAssetChange, this);
    asset.on('remove', this._onModelAssetRemove, this);
    if (asset.resource) {
      this._onModelAssetLoad(asset);
    } else {
      // don't trigger an asset load unless the component is enabled
      if (!this.enabled || !this.entity.enabled) return;
      this.system.app.assets.load(asset);
    }
  }

  /**
   * @param {Asset} asset - The model asset to unbind events from.
   * @private
   */
  _unbindModelAsset(asset) {
    asset.off('load', this._onModelAssetLoad, this);
    asset.off('unload', this._onModelAssetUnload, this);
    asset.off('change', this._onModelAssetChange, this);
    asset.off('remove', this._onModelAssetRemove, this);
  }

  /**
   * @param {Asset} asset - The model asset on which an asset add event has been fired.
   * @private
   */
  _onModelAssetAdded(asset) {
    this.system.app.assets.off('add:' + asset.id, this._onModelAssetAdded, this);
    if (asset.id === this._asset) {
      this._bindModelAsset(asset);
    }
  }

  /**
   * @param {Asset} asset - The model asset on which an asset load event has been fired.
   * @private
   */
  _onModelAssetLoad(asset) {
    this.model = asset.resource.clone();
    this._clonedModel = true;
  }

  /**
   * @param {Asset} asset - The model asset on which an asset unload event has been fired.
   * @private
   */
  _onModelAssetUnload(asset) {
    this.model = null;
  }

  /**
   * @param {Asset} asset - The model asset on which an asset change event has been fired.
   * @param {string} attr - The attribute that was changed.
   * @param {*} _new - The new value of the attribute.
   * @param {*} _old - The old value of the attribute.
   * @private
   */
  _onModelAssetChange(asset, attr, _new, _old) {
    if (attr === 'data') {
      this.mapping = this._mapping;
    }
  }

  /**
   * @param {Asset} asset - The model asset on which an asset remove event has been fired.
   * @private
   */
  _onModelAssetRemove(asset) {
    this.model = null;
  }

  /**
   * @param {import('../../../scene/materials/material.js').Material} material - The material to
   * be set.
   * @private
   */
  _setMaterial(material) {
    if (this._material === material) return;
    this._material = material;
    const model = this._model;
    if (model && this._type !== 'asset') {
      const meshInstances = model.meshInstances;
      for (let i = 0, len = meshInstances.length; i < len; i++) {
        meshInstances[i].material = material;
      }
    }
  }
}

export { ModelComponent };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tcG9uZW50LmpzIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi9zcmMvZnJhbWV3b3JrL2NvbXBvbmVudHMvbW9kZWwvY29tcG9uZW50LmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IERlYnVnIH0gZnJvbSAnLi4vLi4vLi4vY29yZS9kZWJ1Zy5qcyc7XG5pbXBvcnQge1xuICAgIExBWUVSSURfV09STERcbn0gZnJvbSAnLi4vLi4vLi4vc2NlbmUvY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IEJhdGNoR3JvdXAgfSBmcm9tICcuLi8uLi8uLi9zY2VuZS9iYXRjaGluZy9iYXRjaC1ncm91cC5qcyc7XG5pbXBvcnQgeyBHcmFwaE5vZGUgfSBmcm9tICcuLi8uLi8uLi9zY2VuZS9ncmFwaC1ub2RlLmpzJztcbmltcG9ydCB7IE1lc2hJbnN0YW5jZSB9IGZyb20gJy4uLy4uLy4uL3NjZW5lL21lc2gtaW5zdGFuY2UuanMnO1xuaW1wb3J0IHsgTW9kZWwgfSBmcm9tICcuLi8uLi8uLi9zY2VuZS9tb2RlbC5qcyc7XG5pbXBvcnQgeyBnZXRTaGFwZVByaW1pdGl2ZSB9IGZyb20gJy4uLy4uLy4uL3NjZW5lL3Byb2NlZHVyYWwuanMnO1xuXG5pbXBvcnQgeyBBc3NldCB9IGZyb20gJy4uLy4uL2Fzc2V0L2Fzc2V0LmpzJztcblxuaW1wb3J0IHsgQ29tcG9uZW50IH0gZnJvbSAnLi4vY29tcG9uZW50LmpzJztcblxuLyoqXG4gKiBFbmFibGVzIGFuIEVudGl0eSB0byByZW5kZXIgYSBtb2RlbCBvciBhIHByaW1pdGl2ZSBzaGFwZS4gVGhpcyBDb21wb25lbnQgYXR0YWNoZXMgYWRkaXRpb25hbFxuICogbW9kZWwgZ2VvbWV0cnkgaW4gdG8gdGhlIHNjZW5lIGdyYXBoIGJlbG93IHRoZSBFbnRpdHkuXG4gKlxuICogQGF1Z21lbnRzIENvbXBvbmVudFxuICogQGNhdGVnb3J5IEdyYXBoaWNzXG4gKi9cbmNsYXNzIE1vZGVsQ29tcG9uZW50IGV4dGVuZHMgQ29tcG9uZW50IHtcbiAgICAvKipcbiAgICAgKiBAdHlwZSB7c3RyaW5nfVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX3R5cGUgPSAnYXNzZXQnO1xuXG4gICAgLyoqXG4gICAgICogQHR5cGUge0Fzc2V0fG51bWJlcnxudWxsfVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX2Fzc2V0ID0gbnVsbDtcblxuICAgIC8qKlxuICAgICAqIEB0eXBlIHtNb2RlbHxudWxsfVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX21vZGVsID0gbnVsbDtcblxuICAgIC8qKlxuICAgICAqIEB0eXBlIHtPYmplY3Q8c3RyaW5nLCBudW1iZXI+fVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX21hcHBpbmcgPSB7fTtcblxuICAgIC8qKlxuICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX2Nhc3RTaGFkb3dzID0gdHJ1ZTtcblxuICAgIC8qKlxuICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX3JlY2VpdmVTaGFkb3dzID0gdHJ1ZTtcblxuICAgIC8qKlxuICAgICAqIEB0eXBlIHtBc3NldHxudW1iZXJ8bnVsbH1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9tYXRlcmlhbEFzc2V0ID0gbnVsbDtcblxuICAgIC8qKlxuICAgICAqIEB0eXBlIHtpbXBvcnQoJy4uLy4uLy4uL3NjZW5lL21hdGVyaWFscy9tYXRlcmlhbC5qcycpLk1hdGVyaWFsfVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX21hdGVyaWFsO1xuXG4gICAgLyoqXG4gICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfY2FzdFNoYWRvd3NMaWdodG1hcCA9IHRydWU7XG5cbiAgICAvKipcbiAgICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9saWdodG1hcHBlZCA9IGZhbHNlO1xuXG4gICAgLyoqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9saWdodG1hcFNpemVNdWx0aXBsaWVyID0gMTtcblxuICAgIC8qKlxuICAgICAqIE1hcmsgbWVzaGVzIGFzIG5vbi1tb3ZhYmxlIChvcHRpbWl6YXRpb24pLlxuICAgICAqXG4gICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICovXG4gICAgaXNTdGF0aWMgPSBmYWxzZTtcblxuICAgIC8qKlxuICAgICAqIEB0eXBlIHtudW1iZXJbXX1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9sYXllcnMgPSBbTEFZRVJJRF9XT1JMRF07IC8vIGFzc2lnbiB0byB0aGUgZGVmYXVsdCB3b3JsZCBsYXllclxuXG4gICAgLyoqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9iYXRjaEdyb3VwSWQgPSAtMTtcblxuICAgIC8qKlxuICAgICAqIEB0eXBlIHtpbXBvcnQoJy4uLy4uLy4uL2NvcmUvc2hhcGUvYm91bmRpbmctYm94LmpzJykuQm91bmRpbmdCb3h8bnVsbH1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9jdXN0b21BYWJiID0gbnVsbDtcblxuICAgIF9hcmVhID0gbnVsbDtcblxuICAgIF9tYXRlcmlhbEV2ZW50cyA9IG51bGw7XG5cbiAgICAvKipcbiAgICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9jbG9uZWRNb2RlbCA9IGZhbHNlO1xuXG4gICAgLy8gI2lmIF9ERUJVR1xuICAgIF9iYXRjaEdyb3VwID0gbnVsbDtcbiAgICAvLyAjZW5kaWZcblxuICAgIC8qKlxuICAgICAqIENyZWF0ZSBhIG5ldyBNb2RlbENvbXBvbmVudCBpbnN0YW5jZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuL3N5c3RlbS5qcycpLk1vZGVsQ29tcG9uZW50U3lzdGVtfSBzeXN0ZW0gLSBUaGUgQ29tcG9uZW50U3lzdGVtIHRoYXRcbiAgICAgKiBjcmVhdGVkIHRoaXMgQ29tcG9uZW50LlxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuLi8uLi9lbnRpdHkuanMnKS5FbnRpdHl9IGVudGl0eSAtIFRoZSBFbnRpdHkgdGhhdCB0aGlzIENvbXBvbmVudCBpc1xuICAgICAqIGF0dGFjaGVkIHRvLlxuICAgICAqL1xuICAgIGNvbnN0cnVjdG9yKHN5c3RlbSwgZW50aXR5KSB7XG4gICAgICAgIHN1cGVyKHN5c3RlbSwgZW50aXR5KTtcblxuICAgICAgICB0aGlzLl9tYXRlcmlhbCA9IHN5c3RlbS5kZWZhdWx0TWF0ZXJpYWw7XG5cbiAgICAgICAgLy8gaGFuZGxlIGV2ZW50cyB3aGVuIHRoZSBlbnRpdHkgaXMgZGlyZWN0bHkgKG9yIGluZGlyZWN0bHkgYXMgYSBjaGlsZCBvZiBzdWItaGllcmFyY2h5KSBhZGRlZCBvciByZW1vdmVkIGZyb20gdGhlIHBhcmVudFxuICAgICAgICBlbnRpdHkub24oJ3JlbW92ZScsIHRoaXMub25SZW1vdmVDaGlsZCwgdGhpcyk7XG4gICAgICAgIGVudGl0eS5vbigncmVtb3ZlaGllcmFyY2h5JywgdGhpcy5vblJlbW92ZUNoaWxkLCB0aGlzKTtcbiAgICAgICAgZW50aXR5Lm9uKCdpbnNlcnQnLCB0aGlzLm9uSW5zZXJ0Q2hpbGQsIHRoaXMpO1xuICAgICAgICBlbnRpdHkub24oJ2luc2VydGhpZXJhcmNoeScsIHRoaXMub25JbnNlcnRDaGlsZCwgdGhpcyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQW4gYXJyYXkgb2YgbWVzaEluc3RhbmNlcyBjb250YWluZWQgaW4gdGhlIGNvbXBvbmVudCdzIG1vZGVsLiBJZiBtb2RlbCBpcyBub3Qgc2V0IG9yIGxvYWRlZFxuICAgICAqIGZvciBjb21wb25lbnQgaXQgd2lsbCByZXR1cm4gbnVsbC5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtNZXNoSW5zdGFuY2VbXXxudWxsfVxuICAgICAqL1xuICAgIHNldCBtZXNoSW5zdGFuY2VzKHZhbHVlKSB7XG4gICAgICAgIGlmICghdGhpcy5fbW9kZWwpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgdGhpcy5fbW9kZWwubWVzaEluc3RhbmNlcyA9IHZhbHVlO1xuICAgIH1cblxuICAgIGdldCBtZXNoSW5zdGFuY2VzKCkge1xuICAgICAgICBpZiAoIXRoaXMuX21vZGVsKVxuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG5cbiAgICAgICAgcmV0dXJuIHRoaXMuX21vZGVsLm1lc2hJbnN0YW5jZXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSWYgc2V0LCB0aGUgb2JqZWN0IHNwYWNlIGJvdW5kaW5nIGJveCBpcyB1c2VkIGFzIGEgYm91bmRpbmcgYm94IGZvciB2aXNpYmlsaXR5IGN1bGxpbmcgb2ZcbiAgICAgKiBhdHRhY2hlZCBtZXNoIGluc3RhbmNlcy4gVGhpcyBpcyBhbiBvcHRpbWl6YXRpb24sIGFsbG93aW5nIG92ZXJzaXplZCBib3VuZGluZyBib3ggdG8gYmVcbiAgICAgKiBzcGVjaWZpZWQgZm9yIHNraW5uZWQgY2hhcmFjdGVycyBpbiBvcmRlciB0byBhdm9pZCBwZXIgZnJhbWUgYm91bmRpbmcgYm94IGNvbXB1dGF0aW9ucyBiYXNlZFxuICAgICAqIG9uIGJvbmUgcG9zaXRpb25zLlxuICAgICAqXG4gICAgICogQHR5cGUge2ltcG9ydCgnLi4vLi4vLi4vY29yZS9zaGFwZS9ib3VuZGluZy1ib3guanMnKS5Cb3VuZGluZ0JveHxudWxsfVxuICAgICAqL1xuICAgIHNldCBjdXN0b21BYWJiKHZhbHVlKSB7XG4gICAgICAgIHRoaXMuX2N1c3RvbUFhYmIgPSB2YWx1ZTtcblxuICAgICAgICAvLyBzZXQgaXQgb24gbWVzaEluc3RhbmNlc1xuICAgICAgICBpZiAodGhpcy5fbW9kZWwpIHtcbiAgICAgICAgICAgIGNvbnN0IG1pID0gdGhpcy5fbW9kZWwubWVzaEluc3RhbmNlcztcbiAgICAgICAgICAgIGlmIChtaSkge1xuICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbWkubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgbWlbaV0uc2V0Q3VzdG9tQWFiYih0aGlzLl9jdXN0b21BYWJiKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBnZXQgY3VzdG9tQWFiYigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2N1c3RvbUFhYmI7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVGhlIHR5cGUgb2YgdGhlIG1vZGVsLiBDYW4gYmU6XG4gICAgICpcbiAgICAgKiAtIFwiYXNzZXRcIjogVGhlIGNvbXBvbmVudCB3aWxsIHJlbmRlciBhIG1vZGVsIGFzc2V0XG4gICAgICogLSBcImJveFwiOiBUaGUgY29tcG9uZW50IHdpbGwgcmVuZGVyIGEgYm94ICgxIHVuaXQgaW4gZWFjaCBkaW1lbnNpb24pXG4gICAgICogLSBcImNhcHN1bGVcIjogVGhlIGNvbXBvbmVudCB3aWxsIHJlbmRlciBhIGNhcHN1bGUgKHJhZGl1cyAwLjUsIGhlaWdodCAyKVxuICAgICAqIC0gXCJjb25lXCI6IFRoZSBjb21wb25lbnQgd2lsbCByZW5kZXIgYSBjb25lIChyYWRpdXMgMC41LCBoZWlnaHQgMSlcbiAgICAgKiAtIFwiY3lsaW5kZXJcIjogVGhlIGNvbXBvbmVudCB3aWxsIHJlbmRlciBhIGN5bGluZGVyIChyYWRpdXMgMC41LCBoZWlnaHQgMSlcbiAgICAgKiAtIFwicGxhbmVcIjogVGhlIGNvbXBvbmVudCB3aWxsIHJlbmRlciBhIHBsYW5lICgxIHVuaXQgaW4gZWFjaCBkaW1lbnNpb24pXG4gICAgICogLSBcInNwaGVyZVwiOiBUaGUgY29tcG9uZW50IHdpbGwgcmVuZGVyIGEgc3BoZXJlIChyYWRpdXMgMC41KVxuICAgICAqIC0gXCJ0b3J1c1wiOiBUaGUgY29tcG9uZW50IHdpbGwgcmVuZGVyIGEgdG9ydXMgKHR1YmVSYWRpdXM6IDAuMiwgcmluZ1JhZGl1czogMC4zKVxuICAgICAqXG4gICAgICogQHR5cGUge3N0cmluZ31cbiAgICAgKi9cbiAgICBzZXQgdHlwZSh2YWx1ZSkge1xuICAgICAgICBpZiAodGhpcy5fdHlwZSA9PT0gdmFsdWUpIHJldHVybjtcblxuICAgICAgICB0aGlzLl9hcmVhID0gbnVsbDtcblxuICAgICAgICB0aGlzLl90eXBlID0gdmFsdWU7XG5cbiAgICAgICAgaWYgKHZhbHVlID09PSAnYXNzZXQnKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5fYXNzZXQgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9iaW5kTW9kZWxBc3NldCh0aGlzLl9hc3NldCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMubW9kZWwgPSBudWxsO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuXG4gICAgICAgICAgICAvLyBnZXQgLyBjcmVhdGUgbWVzaCBvZiB0eXBlXG4gICAgICAgICAgICBjb25zdCBwcmltRGF0YSA9IGdldFNoYXBlUHJpbWl0aXZlKHRoaXMuc3lzdGVtLmFwcC5ncmFwaGljc0RldmljZSwgdmFsdWUpO1xuICAgICAgICAgICAgdGhpcy5fYXJlYSA9IHByaW1EYXRhLmFyZWE7XG4gICAgICAgICAgICBjb25zdCBtZXNoID0gcHJpbURhdGEubWVzaDtcblxuICAgICAgICAgICAgY29uc3Qgbm9kZSA9IG5ldyBHcmFwaE5vZGUoKTtcbiAgICAgICAgICAgIGNvbnN0IG1vZGVsID0gbmV3IE1vZGVsKCk7XG4gICAgICAgICAgICBtb2RlbC5ncmFwaCA9IG5vZGU7XG5cbiAgICAgICAgICAgIG1vZGVsLm1lc2hJbnN0YW5jZXMgPSBbbmV3IE1lc2hJbnN0YW5jZShtZXNoLCB0aGlzLl9tYXRlcmlhbCwgbm9kZSldO1xuXG4gICAgICAgICAgICB0aGlzLm1vZGVsID0gbW9kZWw7XG4gICAgICAgICAgICB0aGlzLl9hc3NldCA9IG51bGw7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBnZXQgdHlwZSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3R5cGU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVGhlIGFzc2V0IGZvciB0aGUgbW9kZWwgKG9ubHkgYXBwbGllcyB0byBtb2RlbHMgb2YgdHlwZSAnYXNzZXQnKSBjYW4gYWxzbyBiZSBhbiBhc3NldCBpZC5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtBc3NldHxudW1iZXJ8bnVsbH1cbiAgICAgKi9cbiAgICBzZXQgYXNzZXQodmFsdWUpIHtcbiAgICAgICAgY29uc3QgYXNzZXRzID0gdGhpcy5zeXN0ZW0uYXBwLmFzc2V0cztcbiAgICAgICAgbGV0IF9pZCA9IHZhbHVlO1xuXG4gICAgICAgIGlmICh2YWx1ZSBpbnN0YW5jZW9mIEFzc2V0KSB7XG4gICAgICAgICAgICBfaWQgPSB2YWx1ZS5pZDtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLl9hc3NldCAhPT0gX2lkKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5fYXNzZXQpIHtcbiAgICAgICAgICAgICAgICAvLyByZW1vdmUgcHJldmlvdXMgYXNzZXRcbiAgICAgICAgICAgICAgICBhc3NldHMub2ZmKCdhZGQ6JyArIHRoaXMuX2Fzc2V0LCB0aGlzLl9vbk1vZGVsQXNzZXRBZGRlZCwgdGhpcyk7XG4gICAgICAgICAgICAgICAgY29uc3QgX3ByZXYgPSBhc3NldHMuZ2V0KHRoaXMuX2Fzc2V0KTtcbiAgICAgICAgICAgICAgICBpZiAoX3ByZXYpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fdW5iaW5kTW9kZWxBc3NldChfcHJldik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLl9hc3NldCA9IF9pZDtcblxuICAgICAgICAgICAgaWYgKHRoaXMuX2Fzc2V0KSB7XG4gICAgICAgICAgICAgICAgY29uc3QgYXNzZXQgPSBhc3NldHMuZ2V0KHRoaXMuX2Fzc2V0KTtcbiAgICAgICAgICAgICAgICBpZiAoIWFzc2V0KSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMubW9kZWwgPSBudWxsO1xuICAgICAgICAgICAgICAgICAgICBhc3NldHMub24oJ2FkZDonICsgdGhpcy5fYXNzZXQsIHRoaXMuX29uTW9kZWxBc3NldEFkZGVkLCB0aGlzKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9iaW5kTW9kZWxBc3NldChhc3NldCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLm1vZGVsID0gbnVsbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGdldCBhc3NldCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2Fzc2V0O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRoZSBtb2RlbCB0aGF0IGlzIGFkZGVkIHRvIHRoZSBzY2VuZSBncmFwaC4gSXQgY2FuIGJlIG5vdCBzZXQgb3IgbG9hZGVkLCBzbyB3aWxsIHJldHVybiBudWxsLlxuICAgICAqXG4gICAgICogQHR5cGUge01vZGVsfVxuICAgICAqL1xuICAgIHNldCBtb2RlbCh2YWx1ZSkge1xuICAgICAgICBpZiAodGhpcy5fbW9kZWwgPT09IHZhbHVlKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIC8vIHJldHVybiBpZiB0aGUgbW9kZWwgaGFzIGJlZW4gZmxhZ2dlZCBhcyBpbW11dGFibGVcbiAgICAgICAgaWYgKHZhbHVlICYmIHZhbHVlLl9pbW11dGFibGUpIHtcbiAgICAgICAgICAgIERlYnVnLmVycm9yKCdJbnZhbGlkIGF0dGVtcHQgdG8gYXNzaWduIGEgbW9kZWwgdG8gbXVsdGlwbGUgTW9kZWxDb21wb25lbnRzJyk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5fbW9kZWwpIHtcbiAgICAgICAgICAgIHRoaXMuX21vZGVsLl9pbW11dGFibGUgPSBmYWxzZTtcblxuICAgICAgICAgICAgdGhpcy5yZW1vdmVNb2RlbEZyb21MYXllcnMoKTtcbiAgICAgICAgICAgIHRoaXMuX21vZGVsLmdldEdyYXBoKCkuZGVzdHJveSgpO1xuICAgICAgICAgICAgZGVsZXRlIHRoaXMuX21vZGVsLl9lbnRpdHk7XG5cbiAgICAgICAgICAgIGlmICh0aGlzLl9jbG9uZWRNb2RlbCkge1xuICAgICAgICAgICAgICAgIHRoaXMuX21vZGVsLmRlc3Ryb3koKTtcbiAgICAgICAgICAgICAgICB0aGlzLl9jbG9uZWRNb2RlbCA9IGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fbW9kZWwgPSB2YWx1ZTtcblxuICAgICAgICBpZiAodGhpcy5fbW9kZWwpIHtcbiAgICAgICAgICAgIC8vIGZsYWcgdGhlIG1vZGVsIGFzIGJlaW5nIGFzc2lnbmVkIHRvIGEgY29tcG9uZW50XG4gICAgICAgICAgICB0aGlzLl9tb2RlbC5faW1tdXRhYmxlID0gdHJ1ZTtcblxuICAgICAgICAgICAgY29uc3QgbWVzaEluc3RhbmNlcyA9IHRoaXMuX21vZGVsLm1lc2hJbnN0YW5jZXM7XG5cbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbWVzaEluc3RhbmNlcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIG1lc2hJbnN0YW5jZXNbaV0uY2FzdFNoYWRvdyA9IHRoaXMuX2Nhc3RTaGFkb3dzO1xuICAgICAgICAgICAgICAgIG1lc2hJbnN0YW5jZXNbaV0ucmVjZWl2ZVNoYWRvdyA9IHRoaXMuX3JlY2VpdmVTaGFkb3dzO1xuICAgICAgICAgICAgICAgIG1lc2hJbnN0YW5jZXNbaV0uc2V0Q3VzdG9tQWFiYih0aGlzLl9jdXN0b21BYWJiKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5saWdodG1hcHBlZCA9IHRoaXMuX2xpZ2h0bWFwcGVkOyAvLyB1cGRhdGUgbWVzaEluc3RhbmNlc1xuXG4gICAgICAgICAgICB0aGlzLmVudGl0eS5hZGRDaGlsZCh0aGlzLl9tb2RlbC5ncmFwaCk7XG5cbiAgICAgICAgICAgIGlmICh0aGlzLmVuYWJsZWQgJiYgdGhpcy5lbnRpdHkuZW5hYmxlZCkge1xuICAgICAgICAgICAgICAgIHRoaXMuYWRkTW9kZWxUb0xheWVycygpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBTdG9yZSB0aGUgZW50aXR5IHRoYXQgb3ducyB0aGlzIG1vZGVsXG4gICAgICAgICAgICB0aGlzLl9tb2RlbC5fZW50aXR5ID0gdGhpcy5lbnRpdHk7XG5cbiAgICAgICAgICAgIC8vIFVwZGF0ZSBhbnkgYW5pbWF0aW9uIGNvbXBvbmVudFxuICAgICAgICAgICAgaWYgKHRoaXMuZW50aXR5LmFuaW1hdGlvbilcbiAgICAgICAgICAgICAgICB0aGlzLmVudGl0eS5hbmltYXRpb24uc2V0TW9kZWwodGhpcy5fbW9kZWwpO1xuXG4gICAgICAgICAgICAvLyBVcGRhdGUgYW55IGFuaW0gY29tcG9uZW50XG4gICAgICAgICAgICBpZiAodGhpcy5lbnRpdHkuYW5pbSkge1xuICAgICAgICAgICAgICAgIHRoaXMuZW50aXR5LmFuaW0ucmViaW5kKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyB0cmlnZ2VyIGV2ZW50IGhhbmRsZXIgdG8gbG9hZCBtYXBwaW5nXG4gICAgICAgICAgICAvLyBmb3IgbmV3IG1vZGVsXG4gICAgICAgICAgICBpZiAodGhpcy50eXBlID09PSAnYXNzZXQnKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5tYXBwaW5nID0gdGhpcy5fbWFwcGluZztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fdW5zZXRNYXRlcmlhbEV2ZW50cygpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2V0IG1vZGVsKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fbW9kZWw7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSWYgdHJ1ZSwgdGhpcyBtb2RlbCB3aWxsIGJlIGxpZ2h0bWFwcGVkIGFmdGVyIHVzaW5nIGxpZ2h0bWFwcGVyLmJha2UoKS5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAqL1xuICAgIHNldCBsaWdodG1hcHBlZCh2YWx1ZSkge1xuICAgICAgICBpZiAodmFsdWUgIT09IHRoaXMuX2xpZ2h0bWFwcGVkKSB7XG5cbiAgICAgICAgICAgIHRoaXMuX2xpZ2h0bWFwcGVkID0gdmFsdWU7XG5cbiAgICAgICAgICAgIGlmICh0aGlzLl9tb2RlbCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IG1pID0gdGhpcy5fbW9kZWwubWVzaEluc3RhbmNlcztcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG1pLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIG1pW2ldLnNldExpZ2h0bWFwcGVkKHZhbHVlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBnZXQgbGlnaHRtYXBwZWQoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9saWdodG1hcHBlZDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJZiB0cnVlLCB0aGlzIG1vZGVsIHdpbGwgY2FzdCBzaGFkb3dzIGZvciBsaWdodHMgdGhhdCBoYXZlIHNoYWRvdyBjYXN0aW5nIGVuYWJsZWQuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICAgKi9cbiAgICBzZXQgY2FzdFNoYWRvd3ModmFsdWUpIHtcbiAgICAgICAgaWYgKHRoaXMuX2Nhc3RTaGFkb3dzID09PSB2YWx1ZSkgcmV0dXJuO1xuXG4gICAgICAgIGNvbnN0IG1vZGVsID0gdGhpcy5fbW9kZWw7XG5cbiAgICAgICAgaWYgKG1vZGVsKSB7XG4gICAgICAgICAgICBjb25zdCBsYXllcnMgPSB0aGlzLmxheWVycztcbiAgICAgICAgICAgIGNvbnN0IHNjZW5lID0gdGhpcy5zeXN0ZW0uYXBwLnNjZW5lO1xuICAgICAgICAgICAgaWYgKHRoaXMuX2Nhc3RTaGFkb3dzICYmICF2YWx1ZSkge1xuICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbGF5ZXJzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGxheWVyID0gdGhpcy5zeXN0ZW0uYXBwLnNjZW5lLmxheWVycy5nZXRMYXllckJ5SWQodGhpcy5sYXllcnNbaV0pO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIWxheWVyKSBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgICAgbGF5ZXIucmVtb3ZlU2hhZG93Q2FzdGVycyhtb2RlbC5tZXNoSW5zdGFuY2VzKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IG1lc2hJbnN0YW5jZXMgPSBtb2RlbC5tZXNoSW5zdGFuY2VzO1xuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBtZXNoSW5zdGFuY2VzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgbWVzaEluc3RhbmNlc1tpXS5jYXN0U2hhZG93ID0gdmFsdWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICghdGhpcy5fY2FzdFNoYWRvd3MgJiYgdmFsdWUpIHtcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGxheWVycy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBsYXllciA9IHNjZW5lLmxheWVycy5nZXRMYXllckJ5SWQobGF5ZXJzW2ldKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFsYXllcikgY29udGludWU7XG4gICAgICAgICAgICAgICAgICAgIGxheWVyLmFkZFNoYWRvd0Nhc3RlcnMobW9kZWwubWVzaEluc3RhbmNlcyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fY2FzdFNoYWRvd3MgPSB2YWx1ZTtcbiAgICB9XG5cbiAgICBnZXQgY2FzdFNoYWRvd3MoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9jYXN0U2hhZG93cztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJZiB0cnVlLCBzaGFkb3dzIHdpbGwgYmUgY2FzdCBvbiB0aGlzIG1vZGVsLlxuICAgICAqXG4gICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICovXG4gICAgc2V0IHJlY2VpdmVTaGFkb3dzKHZhbHVlKSB7XG4gICAgICAgIGlmICh0aGlzLl9yZWNlaXZlU2hhZG93cyA9PT0gdmFsdWUpIHJldHVybjtcblxuICAgICAgICB0aGlzLl9yZWNlaXZlU2hhZG93cyA9IHZhbHVlO1xuXG4gICAgICAgIGlmICh0aGlzLl9tb2RlbCkge1xuICAgICAgICAgICAgY29uc3QgbWVzaEluc3RhbmNlcyA9IHRoaXMuX21vZGVsLm1lc2hJbnN0YW5jZXM7XG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMCwgbGVuID0gbWVzaEluc3RhbmNlcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuICAgICAgICAgICAgICAgIG1lc2hJbnN0YW5jZXNbaV0ucmVjZWl2ZVNoYWRvdyA9IHZhbHVlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2V0IHJlY2VpdmVTaGFkb3dzKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fcmVjZWl2ZVNoYWRvd3M7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSWYgdHJ1ZSwgdGhpcyBtb2RlbCB3aWxsIGNhc3Qgc2hhZG93cyB3aGVuIHJlbmRlcmluZyBsaWdodG1hcHMuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICAgKi9cbiAgICBzZXQgY2FzdFNoYWRvd3NMaWdodG1hcCh2YWx1ZSkge1xuICAgICAgICB0aGlzLl9jYXN0U2hhZG93c0xpZ2h0bWFwID0gdmFsdWU7XG4gICAgfVxuXG4gICAgZ2V0IGNhc3RTaGFkb3dzTGlnaHRtYXAoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9jYXN0U2hhZG93c0xpZ2h0bWFwO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIExpZ2h0bWFwIHJlc29sdXRpb24gbXVsdGlwbGllci5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtudW1iZXJ9XG4gICAgICovXG4gICAgc2V0IGxpZ2h0bWFwU2l6ZU11bHRpcGxpZXIodmFsdWUpIHtcbiAgICAgICAgdGhpcy5fbGlnaHRtYXBTaXplTXVsdGlwbGllciA9IHZhbHVlO1xuICAgIH1cblxuICAgIGdldCBsaWdodG1hcFNpemVNdWx0aXBsaWVyKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fbGlnaHRtYXBTaXplTXVsdGlwbGllcjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBbiBhcnJheSBvZiBsYXllciBJRHMgKHtAbGluayBMYXllciNpZH0pIHRvIHdoaWNoIHRoaXMgbW9kZWwgc2hvdWxkIGJlbG9uZy4gRG9uJ3QgcHVzaCwgcG9wLFxuICAgICAqIHNwbGljZSBvciBtb2RpZnkgdGhpcyBhcnJheSwgaWYgeW91IHdhbnQgdG8gY2hhbmdlIGl0IC0gc2V0IGEgbmV3IG9uZSBpbnN0ZWFkLlxuICAgICAqXG4gICAgICogQHR5cGUge251bWJlcltdfVxuICAgICAqL1xuICAgIHNldCBsYXllcnModmFsdWUpIHtcbiAgICAgICAgY29uc3QgbGF5ZXJzID0gdGhpcy5zeXN0ZW0uYXBwLnNjZW5lLmxheWVycztcblxuICAgICAgICBpZiAodGhpcy5tZXNoSW5zdGFuY2VzKSB7XG4gICAgICAgICAgICAvLyByZW1vdmUgYWxsIG1lc2ggaW5zdGFuY2VzIGZyb20gb2xkIGxheWVyc1xuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLl9sYXllcnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICBjb25zdCBsYXllciA9IGxheWVycy5nZXRMYXllckJ5SWQodGhpcy5fbGF5ZXJzW2ldKTtcbiAgICAgICAgICAgICAgICBpZiAoIWxheWVyKSBjb250aW51ZTtcbiAgICAgICAgICAgICAgICBsYXllci5yZW1vdmVNZXNoSW5zdGFuY2VzKHRoaXMubWVzaEluc3RhbmNlcyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBzZXQgdGhlIGxheWVyIGxpc3RcbiAgICAgICAgdGhpcy5fbGF5ZXJzLmxlbmd0aCA9IDA7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdmFsdWUubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHRoaXMuX2xheWVyc1tpXSA9IHZhbHVlW2ldO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gZG9uJ3QgYWRkIGludG8gbGF5ZXJzIHVudGlsIHdlJ3JlIGVuYWJsZWRcbiAgICAgICAgaWYgKCF0aGlzLmVuYWJsZWQgfHwgIXRoaXMuZW50aXR5LmVuYWJsZWQgfHwgIXRoaXMubWVzaEluc3RhbmNlcykgcmV0dXJuO1xuXG4gICAgICAgIC8vIGFkZCBhbGwgbWVzaCBpbnN0YW5jZXMgdG8gbmV3IGxheWVyc1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuX2xheWVycy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgY29uc3QgbGF5ZXIgPSBsYXllcnMuZ2V0TGF5ZXJCeUlkKHRoaXMuX2xheWVyc1tpXSk7XG4gICAgICAgICAgICBpZiAoIWxheWVyKSBjb250aW51ZTtcbiAgICAgICAgICAgIGxheWVyLmFkZE1lc2hJbnN0YW5jZXModGhpcy5tZXNoSW5zdGFuY2VzKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGdldCBsYXllcnMoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9sYXllcnM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQXNzaWduIG1vZGVsIHRvIGEgc3BlY2lmaWMgYmF0Y2ggZ3JvdXAgKHNlZSB7QGxpbmsgQmF0Y2hHcm91cH0pLiBEZWZhdWx0IGlzIC0xIChubyBncm91cCkuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqL1xuICAgIHNldCBiYXRjaEdyb3VwSWQodmFsdWUpIHtcbiAgICAgICAgaWYgKHRoaXMuX2JhdGNoR3JvdXBJZCA9PT0gdmFsdWUpIHJldHVybjtcblxuICAgICAgICBpZiAodGhpcy5lbnRpdHkuZW5hYmxlZCAmJiB0aGlzLl9iYXRjaEdyb3VwSWQgPj0gMCkge1xuICAgICAgICAgICAgdGhpcy5zeXN0ZW0uYXBwLmJhdGNoZXI/LnJlbW92ZShCYXRjaEdyb3VwLk1PREVMLCB0aGlzLmJhdGNoR3JvdXBJZCwgdGhpcy5lbnRpdHkpO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLmVudGl0eS5lbmFibGVkICYmIHZhbHVlID49IDApIHtcbiAgICAgICAgICAgIHRoaXMuc3lzdGVtLmFwcC5iYXRjaGVyPy5pbnNlcnQoQmF0Y2hHcm91cC5NT0RFTCwgdmFsdWUsIHRoaXMuZW50aXR5KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh2YWx1ZSA8IDAgJiYgdGhpcy5fYmF0Y2hHcm91cElkID49IDAgJiYgdGhpcy5lbmFibGVkICYmIHRoaXMuZW50aXR5LmVuYWJsZWQpIHtcbiAgICAgICAgICAgIC8vIHJlLWFkZCBtb2RlbCB0byBzY2VuZSwgaW4gY2FzZSBpdCB3YXMgcmVtb3ZlZCBieSBiYXRjaGluZ1xuICAgICAgICAgICAgdGhpcy5hZGRNb2RlbFRvTGF5ZXJzKCk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl9iYXRjaEdyb3VwSWQgPSB2YWx1ZTtcbiAgICB9XG5cbiAgICBnZXQgYmF0Y2hHcm91cElkKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fYmF0Y2hHcm91cElkO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRoZSBtYXRlcmlhbCB7QGxpbmsgQXNzZXR9IHRoYXQgd2lsbCBiZSB1c2VkIHRvIHJlbmRlciB0aGUgbW9kZWwgKG5vdCB1c2VkIG9uIG1vZGVscyBvZiB0eXBlXG4gICAgICogJ2Fzc2V0JykuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7QXNzZXR8bnVtYmVyfG51bGx9XG4gICAgICovXG4gICAgc2V0IG1hdGVyaWFsQXNzZXQodmFsdWUpIHtcbiAgICAgICAgbGV0IF9pZCA9IHZhbHVlO1xuICAgICAgICBpZiAodmFsdWUgaW5zdGFuY2VvZiBBc3NldCkge1xuICAgICAgICAgICAgX2lkID0gdmFsdWUuaWQ7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBhc3NldHMgPSB0aGlzLnN5c3RlbS5hcHAuYXNzZXRzO1xuXG4gICAgICAgIGlmIChfaWQgIT09IHRoaXMuX21hdGVyaWFsQXNzZXQpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLl9tYXRlcmlhbEFzc2V0KSB7XG4gICAgICAgICAgICAgICAgYXNzZXRzLm9mZignYWRkOicgKyB0aGlzLl9tYXRlcmlhbEFzc2V0LCB0aGlzLl9vbk1hdGVyaWFsQXNzZXRBZGQsIHRoaXMpO1xuICAgICAgICAgICAgICAgIGNvbnN0IF9wcmV2ID0gYXNzZXRzLmdldCh0aGlzLl9tYXRlcmlhbEFzc2V0KTtcbiAgICAgICAgICAgICAgICBpZiAoX3ByZXYpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fdW5iaW5kTWF0ZXJpYWxBc3NldChfcHJldik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLl9tYXRlcmlhbEFzc2V0ID0gX2lkO1xuXG4gICAgICAgICAgICBpZiAodGhpcy5fbWF0ZXJpYWxBc3NldCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGFzc2V0ID0gYXNzZXRzLmdldCh0aGlzLl9tYXRlcmlhbEFzc2V0KTtcbiAgICAgICAgICAgICAgICBpZiAoIWFzc2V0KSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3NldE1hdGVyaWFsKHRoaXMuc3lzdGVtLmRlZmF1bHRNYXRlcmlhbCk7XG4gICAgICAgICAgICAgICAgICAgIGFzc2V0cy5vbignYWRkOicgKyB0aGlzLl9tYXRlcmlhbEFzc2V0LCB0aGlzLl9vbk1hdGVyaWFsQXNzZXRBZGQsIHRoaXMpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX2JpbmRNYXRlcmlhbEFzc2V0KGFzc2V0KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMuX3NldE1hdGVyaWFsKHRoaXMuc3lzdGVtLmRlZmF1bHRNYXRlcmlhbCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBnZXQgbWF0ZXJpYWxBc3NldCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX21hdGVyaWFsQXNzZXQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVGhlIG1hdGVyaWFsIHtAbGluayBNYXRlcmlhbH0gdGhhdCB3aWxsIGJlIHVzZWQgdG8gcmVuZGVyIHRoZSBtb2RlbCAobm90IHVzZWQgb24gbW9kZWxzIG9mXG4gICAgICogdHlwZSAnYXNzZXQnKS5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtpbXBvcnQoJy4uLy4uLy4uL3NjZW5lL21hdGVyaWFscy9tYXRlcmlhbC5qcycpLk1hdGVyaWFsfVxuICAgICAqL1xuICAgIHNldCBtYXRlcmlhbCh2YWx1ZSkge1xuICAgICAgICBpZiAodGhpcy5fbWF0ZXJpYWwgPT09IHZhbHVlKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHRoaXMubWF0ZXJpYWxBc3NldCA9IG51bGw7XG5cbiAgICAgICAgdGhpcy5fc2V0TWF0ZXJpYWwodmFsdWUpO1xuICAgIH1cblxuICAgIGdldCBtYXRlcmlhbCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX21hdGVyaWFsO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEEgZGljdGlvbmFyeSB0aGF0IGhvbGRzIG1hdGVyaWFsIG92ZXJyaWRlcyBmb3IgZWFjaCBtZXNoIGluc3RhbmNlLiBPbmx5IGFwcGxpZXMgdG8gbW9kZWxcbiAgICAgKiBjb21wb25lbnRzIG9mIHR5cGUgJ2Fzc2V0Jy4gVGhlIG1hcHBpbmcgY29udGFpbnMgcGFpcnMgb2YgbWVzaCBpbnN0YW5jZSBpbmRleCAtIG1hdGVyaWFsXG4gICAgICogYXNzZXQgaWQuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7T2JqZWN0PHN0cmluZywgbnVtYmVyPn1cbiAgICAgKi9cbiAgICBzZXQgbWFwcGluZyh2YWx1ZSkge1xuICAgICAgICBpZiAodGhpcy5fdHlwZSAhPT0gJ2Fzc2V0JylcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICAvLyB1bnN1YnNjcmliZSBmcm9tIG9sZCBldmVudHNcbiAgICAgICAgdGhpcy5fdW5zZXRNYXRlcmlhbEV2ZW50cygpO1xuXG4gICAgICAgIC8vIGNhbid0IGhhdmUgYSBudWxsIG1hcHBpbmdcbiAgICAgICAgaWYgKCF2YWx1ZSlcbiAgICAgICAgICAgIHZhbHVlID0ge307XG5cbiAgICAgICAgdGhpcy5fbWFwcGluZyA9IHZhbHVlO1xuXG4gICAgICAgIGlmICghdGhpcy5fbW9kZWwpIHJldHVybjtcblxuICAgICAgICBjb25zdCBtZXNoSW5zdGFuY2VzID0gdGhpcy5fbW9kZWwubWVzaEluc3RhbmNlcztcbiAgICAgICAgY29uc3QgbW9kZWxBc3NldCA9IHRoaXMuYXNzZXQgPyB0aGlzLnN5c3RlbS5hcHAuYXNzZXRzLmdldCh0aGlzLmFzc2V0KSA6IG51bGw7XG4gICAgICAgIGNvbnN0IGFzc2V0TWFwcGluZyA9IG1vZGVsQXNzZXQgPyBtb2RlbEFzc2V0LmRhdGEubWFwcGluZyA6IG51bGw7XG4gICAgICAgIGxldCBhc3NldCA9IG51bGw7XG5cbiAgICAgICAgZm9yIChsZXQgaSA9IDAsIGxlbiA9IG1lc2hJbnN0YW5jZXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgICAgIGlmICh2YWx1ZVtpXSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgaWYgKHZhbHVlW2ldKSB7XG4gICAgICAgICAgICAgICAgICAgIGFzc2V0ID0gdGhpcy5zeXN0ZW0uYXBwLmFzc2V0cy5nZXQodmFsdWVbaV0pO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9sb2FkQW5kU2V0TWVzaEluc3RhbmNlTWF0ZXJpYWwoYXNzZXQsIG1lc2hJbnN0YW5jZXNbaV0sIGkpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIG1lc2hJbnN0YW5jZXNbaV0ubWF0ZXJpYWwgPSB0aGlzLnN5c3RlbS5kZWZhdWx0TWF0ZXJpYWw7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIGlmIChhc3NldE1hcHBpbmcpIHtcbiAgICAgICAgICAgICAgICBpZiAoYXNzZXRNYXBwaW5nW2ldICYmIChhc3NldE1hcHBpbmdbaV0ubWF0ZXJpYWwgfHwgYXNzZXRNYXBwaW5nW2ldLnBhdGgpKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChhc3NldE1hcHBpbmdbaV0ubWF0ZXJpYWwgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXNzZXQgPSB0aGlzLnN5c3RlbS5hcHAuYXNzZXRzLmdldChhc3NldE1hcHBpbmdbaV0ubWF0ZXJpYWwpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGFzc2V0TWFwcGluZ1tpXS5wYXRoICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHVybCA9IHRoaXMuX2dldE1hdGVyaWFsQXNzZXRVcmwoYXNzZXRNYXBwaW5nW2ldLnBhdGgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHVybCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFzc2V0ID0gdGhpcy5zeXN0ZW0uYXBwLmFzc2V0cy5nZXRCeVVybCh1cmwpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX2xvYWRBbmRTZXRNZXNoSW5zdGFuY2VNYXRlcmlhbChhc3NldCwgbWVzaEluc3RhbmNlc1tpXSwgaSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgbWVzaEluc3RhbmNlc1tpXS5tYXRlcmlhbCA9IHRoaXMuc3lzdGVtLmRlZmF1bHRNYXRlcmlhbDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBnZXQgbWFwcGluZygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX21hcHBpbmc7XG4gICAgfVxuXG4gICAgYWRkTW9kZWxUb0xheWVycygpIHtcbiAgICAgICAgY29uc3QgbGF5ZXJzID0gdGhpcy5zeXN0ZW0uYXBwLnNjZW5lLmxheWVycztcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLl9sYXllcnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGNvbnN0IGxheWVyID0gbGF5ZXJzLmdldExheWVyQnlJZCh0aGlzLl9sYXllcnNbaV0pO1xuICAgICAgICAgICAgaWYgKGxheWVyKSB7XG4gICAgICAgICAgICAgICAgbGF5ZXIuYWRkTWVzaEluc3RhbmNlcyh0aGlzLm1lc2hJbnN0YW5jZXMpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmVtb3ZlTW9kZWxGcm9tTGF5ZXJzKCkge1xuICAgICAgICBjb25zdCBsYXllcnMgPSB0aGlzLnN5c3RlbS5hcHAuc2NlbmUubGF5ZXJzO1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuX2xheWVycy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgY29uc3QgbGF5ZXIgPSBsYXllcnMuZ2V0TGF5ZXJCeUlkKHRoaXMuX2xheWVyc1tpXSk7XG4gICAgICAgICAgICBpZiAoIWxheWVyKSBjb250aW51ZTtcbiAgICAgICAgICAgIGxheWVyLnJlbW92ZU1lc2hJbnN0YW5jZXModGhpcy5tZXNoSW5zdGFuY2VzKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIG9uUmVtb3ZlQ2hpbGQoKSB7XG4gICAgICAgIGlmICh0aGlzLl9tb2RlbClcbiAgICAgICAgICAgIHRoaXMucmVtb3ZlTW9kZWxGcm9tTGF5ZXJzKCk7XG4gICAgfVxuXG4gICAgb25JbnNlcnRDaGlsZCgpIHtcbiAgICAgICAgaWYgKHRoaXMuX21vZGVsICYmIHRoaXMuZW5hYmxlZCAmJiB0aGlzLmVudGl0eS5lbmFibGVkKVxuICAgICAgICAgICAgdGhpcy5hZGRNb2RlbFRvTGF5ZXJzKCk7XG4gICAgfVxuXG4gICAgb25SZW1vdmUoKSB7XG4gICAgICAgIHRoaXMuYXNzZXQgPSBudWxsO1xuICAgICAgICB0aGlzLm1vZGVsID0gbnVsbDtcbiAgICAgICAgdGhpcy5tYXRlcmlhbEFzc2V0ID0gbnVsbDtcbiAgICAgICAgdGhpcy5fdW5zZXRNYXRlcmlhbEV2ZW50cygpO1xuXG4gICAgICAgIHRoaXMuZW50aXR5Lm9mZigncmVtb3ZlJywgdGhpcy5vblJlbW92ZUNoaWxkLCB0aGlzKTtcbiAgICAgICAgdGhpcy5lbnRpdHkub2ZmKCdpbnNlcnQnLCB0aGlzLm9uSW5zZXJ0Q2hpbGQsIHRoaXMpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuLi8uLi8uLi9zY2VuZS9jb21wb3NpdGlvbi9sYXllci1jb21wb3NpdGlvbi5qcycpLkxheWVyQ29tcG9zaXRpb259IG9sZENvbXAgLSBUaGVcbiAgICAgKiBvbGQgbGF5ZXIgY29tcG9zaXRpb24uXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4uLy4uLy4uL3NjZW5lL2NvbXBvc2l0aW9uL2xheWVyLWNvbXBvc2l0aW9uLmpzJykuTGF5ZXJDb21wb3NpdGlvbn0gbmV3Q29tcCAtIFRoZVxuICAgICAqIG5ldyBsYXllciBjb21wb3NpdGlvbi5cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIG9uTGF5ZXJzQ2hhbmdlZChvbGRDb21wLCBuZXdDb21wKSB7XG4gICAgICAgIHRoaXMuYWRkTW9kZWxUb0xheWVycygpO1xuICAgICAgICBvbGRDb21wLm9mZignYWRkJywgdGhpcy5vbkxheWVyQWRkZWQsIHRoaXMpO1xuICAgICAgICBvbGRDb21wLm9mZigncmVtb3ZlJywgdGhpcy5vbkxheWVyUmVtb3ZlZCwgdGhpcyk7XG4gICAgICAgIG5ld0NvbXAub24oJ2FkZCcsIHRoaXMub25MYXllckFkZGVkLCB0aGlzKTtcbiAgICAgICAgbmV3Q29tcC5vbigncmVtb3ZlJywgdGhpcy5vbkxheWVyUmVtb3ZlZCwgdGhpcyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4uLy4uLy4uL3NjZW5lL2xheWVyLmpzJykuTGF5ZXJ9IGxheWVyIC0gVGhlIGxheWVyIHRoYXQgd2FzIGFkZGVkLlxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgb25MYXllckFkZGVkKGxheWVyKSB7XG4gICAgICAgIGNvbnN0IGluZGV4ID0gdGhpcy5sYXllcnMuaW5kZXhPZihsYXllci5pZCk7XG4gICAgICAgIGlmIChpbmRleCA8IDApIHJldHVybjtcbiAgICAgICAgbGF5ZXIuYWRkTWVzaEluc3RhbmNlcyh0aGlzLm1lc2hJbnN0YW5jZXMpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuLi8uLi8uLi9zY2VuZS9sYXllci5qcycpLkxheWVyfSBsYXllciAtIFRoZSBsYXllciB0aGF0IHdhcyByZW1vdmVkLlxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgb25MYXllclJlbW92ZWQobGF5ZXIpIHtcbiAgICAgICAgY29uc3QgaW5kZXggPSB0aGlzLmxheWVycy5pbmRleE9mKGxheWVyLmlkKTtcbiAgICAgICAgaWYgKGluZGV4IDwgMCkgcmV0dXJuO1xuICAgICAgICBsYXllci5yZW1vdmVNZXNoSW5zdGFuY2VzKHRoaXMubWVzaEluc3RhbmNlcyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGluZGV4IC0gVGhlIGluZGV4IG9mIHRoZSBtZXNoIGluc3RhbmNlLlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBldmVudCAtIFRoZSBldmVudCBuYW1lLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBpZCAtIFRoZSBhc3NldCBpZC5cbiAgICAgKiBAcGFyYW0geyp9IGhhbmRsZXIgLSBUaGUgaGFuZGxlciBmdW5jdGlvbiB0byBiZSBib3VuZCB0byB0aGUgc3BlY2lmaWVkIGV2ZW50LlxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX3NldE1hdGVyaWFsRXZlbnQoaW5kZXgsIGV2ZW50LCBpZCwgaGFuZGxlcikge1xuICAgICAgICBjb25zdCBldnQgPSBldmVudCArICc6JyArIGlkO1xuICAgICAgICB0aGlzLnN5c3RlbS5hcHAuYXNzZXRzLm9uKGV2dCwgaGFuZGxlciwgdGhpcyk7XG5cbiAgICAgICAgaWYgKCF0aGlzLl9tYXRlcmlhbEV2ZW50cylcbiAgICAgICAgICAgIHRoaXMuX21hdGVyaWFsRXZlbnRzID0gW107XG5cbiAgICAgICAgaWYgKCF0aGlzLl9tYXRlcmlhbEV2ZW50c1tpbmRleF0pXG4gICAgICAgICAgICB0aGlzLl9tYXRlcmlhbEV2ZW50c1tpbmRleF0gPSB7IH07XG5cbiAgICAgICAgdGhpcy5fbWF0ZXJpYWxFdmVudHNbaW5kZXhdW2V2dF0gPSB7XG4gICAgICAgICAgICBpZDogaWQsXG4gICAgICAgICAgICBoYW5kbGVyOiBoYW5kbGVyXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgLyoqIEBwcml2YXRlICovXG4gICAgX3Vuc2V0TWF0ZXJpYWxFdmVudHMoKSB7XG4gICAgICAgIGNvbnN0IGFzc2V0cyA9IHRoaXMuc3lzdGVtLmFwcC5hc3NldHM7XG4gICAgICAgIGNvbnN0IGV2ZW50cyA9IHRoaXMuX21hdGVyaWFsRXZlbnRzO1xuICAgICAgICBpZiAoIWV2ZW50cylcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICBmb3IgKGxldCBpID0gMCwgbGVuID0gZXZlbnRzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgICAgICBpZiAoIWV2ZW50c1tpXSkgY29udGludWU7XG4gICAgICAgICAgICBjb25zdCBldnQgPSBldmVudHNbaV07XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGtleSBpbiBldnQpIHtcbiAgICAgICAgICAgICAgICBhc3NldHMub2ZmKGtleSwgZXZ0W2tleV0uaGFuZGxlciwgdGhpcyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl9tYXRlcmlhbEV2ZW50cyA9IG51bGw7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IGlkT3JQYXRoIC0gVGhlIGFzc2V0IGlkIG9yIHBhdGguXG4gICAgICogQHJldHVybnMge0Fzc2V0fG51bGx9IFRoZSBhc3NldC5cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9nZXRBc3NldEJ5SWRPclBhdGgoaWRPclBhdGgpIHtcbiAgICAgICAgbGV0IGFzc2V0ID0gbnVsbDtcbiAgICAgICAgY29uc3QgaXNQYXRoID0gaXNOYU4ocGFyc2VJbnQoaWRPclBhdGgsIDEwKSk7XG5cbiAgICAgICAgLy8gZ2V0IGFzc2V0IGJ5IGlkIG9yIHVybFxuICAgICAgICBpZiAoIWlzUGF0aCkge1xuICAgICAgICAgICAgYXNzZXQgPSB0aGlzLnN5c3RlbS5hcHAuYXNzZXRzLmdldChpZE9yUGF0aCk7XG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5hc3NldCkge1xuICAgICAgICAgICAgY29uc3QgdXJsID0gdGhpcy5fZ2V0TWF0ZXJpYWxBc3NldFVybChpZE9yUGF0aCk7XG4gICAgICAgICAgICBpZiAodXJsKVxuICAgICAgICAgICAgICAgIGFzc2V0ID0gdGhpcy5zeXN0ZW0uYXBwLmFzc2V0cy5nZXRCeVVybCh1cmwpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGFzc2V0O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBwYXRoIC0gVGhlIHBhdGggb2YgdGhlIG1vZGVsIGFzc2V0LlxuICAgICAqIEByZXR1cm5zIHtzdHJpbmd8bnVsbH0gVGhlIG1vZGVsIGFzc2V0IFVSTCBvciBudWxsIGlmIHRoZSBhc3NldCBpcyBub3QgaW4gdGhlIHJlZ2lzdHJ5LlxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX2dldE1hdGVyaWFsQXNzZXRVcmwocGF0aCkge1xuICAgICAgICBpZiAoIXRoaXMuYXNzZXQpIHJldHVybiBudWxsO1xuXG4gICAgICAgIGNvbnN0IG1vZGVsQXNzZXQgPSB0aGlzLnN5c3RlbS5hcHAuYXNzZXRzLmdldCh0aGlzLmFzc2V0KTtcblxuICAgICAgICByZXR1cm4gbW9kZWxBc3NldCA/IG1vZGVsQXNzZXQuZ2V0QWJzb2x1dGVVcmwocGF0aCkgOiBudWxsO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7QXNzZXR9IG1hdGVyaWFsQXNzZXQgLVRoZSBtYXRlcmlhbCBhc3NldCB0byBsb2FkLlxuICAgICAqIEBwYXJhbSB7TWVzaEluc3RhbmNlfSBtZXNoSW5zdGFuY2UgLSBUaGUgbWVzaCBpbnN0YW5jZSB0byBhc3NpZ24gdGhlIG1hdGVyaWFsIHRvLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBpbmRleCAtIFRoZSBpbmRleCBvZiB0aGUgbWVzaCBpbnN0YW5jZS5cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9sb2FkQW5kU2V0TWVzaEluc3RhbmNlTWF0ZXJpYWwobWF0ZXJpYWxBc3NldCwgbWVzaEluc3RhbmNlLCBpbmRleCkge1xuICAgICAgICBjb25zdCBhc3NldHMgPSB0aGlzLnN5c3RlbS5hcHAuYXNzZXRzO1xuXG4gICAgICAgIGlmICghbWF0ZXJpYWxBc3NldClcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICBpZiAobWF0ZXJpYWxBc3NldC5yZXNvdXJjZSkge1xuICAgICAgICAgICAgbWVzaEluc3RhbmNlLm1hdGVyaWFsID0gbWF0ZXJpYWxBc3NldC5yZXNvdXJjZTtcblxuICAgICAgICAgICAgdGhpcy5fc2V0TWF0ZXJpYWxFdmVudChpbmRleCwgJ3JlbW92ZScsIG1hdGVyaWFsQXNzZXQuaWQsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBtZXNoSW5zdGFuY2UubWF0ZXJpYWwgPSB0aGlzLnN5c3RlbS5kZWZhdWx0TWF0ZXJpYWw7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuX3NldE1hdGVyaWFsRXZlbnQoaW5kZXgsICdsb2FkJywgbWF0ZXJpYWxBc3NldC5pZCwgZnVuY3Rpb24gKGFzc2V0KSB7XG4gICAgICAgICAgICAgICAgbWVzaEluc3RhbmNlLm1hdGVyaWFsID0gYXNzZXQucmVzb3VyY2U7XG5cbiAgICAgICAgICAgICAgICB0aGlzLl9zZXRNYXRlcmlhbEV2ZW50KGluZGV4LCAncmVtb3ZlJywgbWF0ZXJpYWxBc3NldC5pZCwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICBtZXNoSW5zdGFuY2UubWF0ZXJpYWwgPSB0aGlzLnN5c3RlbS5kZWZhdWx0TWF0ZXJpYWw7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgaWYgKHRoaXMuZW5hYmxlZCAmJiB0aGlzLmVudGl0eS5lbmFibGVkKVxuICAgICAgICAgICAgICAgIGFzc2V0cy5sb2FkKG1hdGVyaWFsQXNzZXQpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgb25FbmFibGUoKSB7XG4gICAgICAgIGNvbnN0IGFwcCA9IHRoaXMuc3lzdGVtLmFwcDtcbiAgICAgICAgY29uc3Qgc2NlbmUgPSBhcHAuc2NlbmU7XG5cbiAgICAgICAgc2NlbmUub24oJ3NldDpsYXllcnMnLCB0aGlzLm9uTGF5ZXJzQ2hhbmdlZCwgdGhpcyk7XG4gICAgICAgIGlmIChzY2VuZS5sYXllcnMpIHtcbiAgICAgICAgICAgIHNjZW5lLmxheWVycy5vbignYWRkJywgdGhpcy5vbkxheWVyQWRkZWQsIHRoaXMpO1xuICAgICAgICAgICAgc2NlbmUubGF5ZXJzLm9uKCdyZW1vdmUnLCB0aGlzLm9uTGF5ZXJSZW1vdmVkLCB0aGlzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGlzQXNzZXQgPSAodGhpcy5fdHlwZSA9PT0gJ2Fzc2V0Jyk7XG5cbiAgICAgICAgbGV0IGFzc2V0O1xuICAgICAgICBpZiAodGhpcy5fbW9kZWwpIHtcbiAgICAgICAgICAgIHRoaXMuYWRkTW9kZWxUb0xheWVycygpO1xuICAgICAgICB9IGVsc2UgaWYgKGlzQXNzZXQgJiYgdGhpcy5fYXNzZXQpIHtcbiAgICAgICAgICAgIC8vIGJpbmQgYW5kIGxvYWQgbW9kZWwgYXNzZXQgaWYgbmVjZXNzYXJ5XG4gICAgICAgICAgICBhc3NldCA9IGFwcC5hc3NldHMuZ2V0KHRoaXMuX2Fzc2V0KTtcbiAgICAgICAgICAgIGlmIChhc3NldCAmJiBhc3NldC5yZXNvdXJjZSAhPT0gdGhpcy5fbW9kZWwpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9iaW5kTW9kZWxBc3NldChhc3NldCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5fbWF0ZXJpYWxBc3NldCkge1xuICAgICAgICAgICAgLy8gYmluZCBhbmQgbG9hZCBtYXRlcmlhbCBhc3NldCBpZiBuZWNlc3NhcnlcbiAgICAgICAgICAgIGFzc2V0ID0gYXBwLmFzc2V0cy5nZXQodGhpcy5fbWF0ZXJpYWxBc3NldCk7XG4gICAgICAgICAgICBpZiAoYXNzZXQgJiYgYXNzZXQucmVzb3VyY2UgIT09IHRoaXMuX21hdGVyaWFsKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fYmluZE1hdGVyaWFsQXNzZXQoYXNzZXQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGlzQXNzZXQpIHtcbiAgICAgICAgICAgIC8vIGJpbmQgbWFwcGVkIGFzc2V0c1xuICAgICAgICAgICAgLy8gVE9ETzogcmVwbGFjZVxuICAgICAgICAgICAgaWYgKHRoaXMuX21hcHBpbmcpIHtcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGluZGV4IGluIHRoaXMuX21hcHBpbmcpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuX21hcHBpbmdbaW5kZXhdKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhc3NldCA9IHRoaXMuX2dldEFzc2V0QnlJZE9yUGF0aCh0aGlzLl9tYXBwaW5nW2luZGV4XSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoYXNzZXQgJiYgIWFzc2V0LnJlc291cmNlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYXBwLmFzc2V0cy5sb2FkKGFzc2V0KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLl9iYXRjaEdyb3VwSWQgPj0gMCkge1xuICAgICAgICAgICAgYXBwLmJhdGNoZXI/Lmluc2VydChCYXRjaEdyb3VwLk1PREVMLCB0aGlzLmJhdGNoR3JvdXBJZCwgdGhpcy5lbnRpdHkpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgb25EaXNhYmxlKCkge1xuICAgICAgICBjb25zdCBhcHAgPSB0aGlzLnN5c3RlbS5hcHA7XG4gICAgICAgIGNvbnN0IHNjZW5lID0gYXBwLnNjZW5lO1xuXG4gICAgICAgIHNjZW5lLm9mZignc2V0OmxheWVycycsIHRoaXMub25MYXllcnNDaGFuZ2VkLCB0aGlzKTtcbiAgICAgICAgaWYgKHNjZW5lLmxheWVycykge1xuICAgICAgICAgICAgc2NlbmUubGF5ZXJzLm9mZignYWRkJywgdGhpcy5vbkxheWVyQWRkZWQsIHRoaXMpO1xuICAgICAgICAgICAgc2NlbmUubGF5ZXJzLm9mZigncmVtb3ZlJywgdGhpcy5vbkxheWVyUmVtb3ZlZCwgdGhpcyk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5fYmF0Y2hHcm91cElkID49IDApIHtcbiAgICAgICAgICAgIGFwcC5iYXRjaGVyPy5yZW1vdmUoQmF0Y2hHcm91cC5NT0RFTCwgdGhpcy5iYXRjaEdyb3VwSWQsIHRoaXMuZW50aXR5KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLl9tb2RlbCkge1xuICAgICAgICAgICAgdGhpcy5yZW1vdmVNb2RlbEZyb21MYXllcnMoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFN0b3AgcmVuZGVyaW5nIG1vZGVsIHdpdGhvdXQgcmVtb3ZpbmcgaXQgZnJvbSB0aGUgc2NlbmUgaGllcmFyY2h5LiBUaGlzIG1ldGhvZCBzZXRzIHRoZVxuICAgICAqIHtAbGluayBNZXNoSW5zdGFuY2UjdmlzaWJsZX0gcHJvcGVydHkgb2YgZXZlcnkgTWVzaEluc3RhbmNlIGluIHRoZSBtb2RlbCB0byBmYWxzZSBOb3RlLCB0aGlzXG4gICAgICogZG9lcyBub3QgcmVtb3ZlIHRoZSBtb2RlbCBvciBtZXNoIGluc3RhbmNlcyBmcm9tIHRoZSBzY2VuZSBoaWVyYXJjaHkgb3IgZHJhdyBjYWxsIGxpc3QuIFNvXG4gICAgICogdGhlIG1vZGVsIGNvbXBvbmVudCBzdGlsbCBpbmN1cnMgc29tZSBDUFUgb3ZlcmhlYWQuXG4gICAgICpcbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIHRoaXMudGltZXIgPSAwO1xuICAgICAqIHRoaXMudmlzaWJsZSA9IHRydWU7XG4gICAgICogLy8gLi4uXG4gICAgICogLy8gYmxpbmsgbW9kZWwgZXZlcnkgMC4xIHNlY29uZHNcbiAgICAgKiB0aGlzLnRpbWVyICs9IGR0O1xuICAgICAqIGlmICh0aGlzLnRpbWVyID4gMC4xKSB7XG4gICAgICogICAgIGlmICghdGhpcy52aXNpYmxlKSB7XG4gICAgICogICAgICAgICB0aGlzLmVudGl0eS5tb2RlbC5zaG93KCk7XG4gICAgICogICAgICAgICB0aGlzLnZpc2libGUgPSB0cnVlO1xuICAgICAqICAgICB9IGVsc2Uge1xuICAgICAqICAgICAgICAgdGhpcy5lbnRpdHkubW9kZWwuaGlkZSgpO1xuICAgICAqICAgICAgICAgdGhpcy52aXNpYmxlID0gZmFsc2U7XG4gICAgICogICAgIH1cbiAgICAgKiAgICAgdGhpcy50aW1lciA9IDA7XG4gICAgICogfVxuICAgICAqL1xuICAgIGhpZGUoKSB7XG4gICAgICAgIGlmICh0aGlzLl9tb2RlbCkge1xuICAgICAgICAgICAgY29uc3QgaW5zdGFuY2VzID0gdGhpcy5fbW9kZWwubWVzaEluc3RhbmNlcztcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwLCBsID0gaW5zdGFuY2VzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgICAgICAgICAgICAgIGluc3RhbmNlc1tpXS52aXNpYmxlID0gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBFbmFibGUgcmVuZGVyaW5nIG9mIHRoZSBtb2RlbCBpZiBoaWRkZW4gdXNpbmcge0BsaW5rIE1vZGVsQ29tcG9uZW50I2hpZGV9LiBUaGlzIG1ldGhvZCBzZXRzXG4gICAgICogYWxsIHRoZSB7QGxpbmsgTWVzaEluc3RhbmNlI3Zpc2libGV9IHByb3BlcnR5IG9uIGFsbCBtZXNoIGluc3RhbmNlcyB0byB0cnVlLlxuICAgICAqL1xuICAgIHNob3coKSB7XG4gICAgICAgIGlmICh0aGlzLl9tb2RlbCkge1xuICAgICAgICAgICAgY29uc3QgaW5zdGFuY2VzID0gdGhpcy5fbW9kZWwubWVzaEluc3RhbmNlcztcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwLCBsID0gaW5zdGFuY2VzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgICAgICAgICAgICAgIGluc3RhbmNlc1tpXS52aXNpYmxlID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7QXNzZXR9IGFzc2V0IC0gVGhlIG1hdGVyaWFsIGFzc2V0IHRvIGJpbmQgZXZlbnRzIHRvLlxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX2JpbmRNYXRlcmlhbEFzc2V0KGFzc2V0KSB7XG4gICAgICAgIGFzc2V0Lm9uKCdsb2FkJywgdGhpcy5fb25NYXRlcmlhbEFzc2V0TG9hZCwgdGhpcyk7XG4gICAgICAgIGFzc2V0Lm9uKCd1bmxvYWQnLCB0aGlzLl9vbk1hdGVyaWFsQXNzZXRVbmxvYWQsIHRoaXMpO1xuICAgICAgICBhc3NldC5vbigncmVtb3ZlJywgdGhpcy5fb25NYXRlcmlhbEFzc2V0UmVtb3ZlLCB0aGlzKTtcbiAgICAgICAgYXNzZXQub24oJ2NoYW5nZScsIHRoaXMuX29uTWF0ZXJpYWxBc3NldENoYW5nZSwgdGhpcyk7XG5cbiAgICAgICAgaWYgKGFzc2V0LnJlc291cmNlKSB7XG4gICAgICAgICAgICB0aGlzLl9vbk1hdGVyaWFsQXNzZXRMb2FkKGFzc2V0KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIGRvbid0IHRyaWdnZXIgYW4gYXNzZXQgbG9hZCB1bmxlc3MgdGhlIGNvbXBvbmVudCBpcyBlbmFibGVkXG4gICAgICAgICAgICBpZiAoIXRoaXMuZW5hYmxlZCB8fCAhdGhpcy5lbnRpdHkuZW5hYmxlZCkgcmV0dXJuO1xuICAgICAgICAgICAgdGhpcy5zeXN0ZW0uYXBwLmFzc2V0cy5sb2FkKGFzc2V0KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7QXNzZXR9IGFzc2V0IC0gVGhlIG1hdGVyaWFsIGFzc2V0IHRvIHVuYmluZCBldmVudHMgZnJvbS5cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF91bmJpbmRNYXRlcmlhbEFzc2V0KGFzc2V0KSB7XG4gICAgICAgIGFzc2V0Lm9mZignbG9hZCcsIHRoaXMuX29uTWF0ZXJpYWxBc3NldExvYWQsIHRoaXMpO1xuICAgICAgICBhc3NldC5vZmYoJ3VubG9hZCcsIHRoaXMuX29uTWF0ZXJpYWxBc3NldFVubG9hZCwgdGhpcyk7XG4gICAgICAgIGFzc2V0Lm9mZigncmVtb3ZlJywgdGhpcy5fb25NYXRlcmlhbEFzc2V0UmVtb3ZlLCB0aGlzKTtcbiAgICAgICAgYXNzZXQub2ZmKCdjaGFuZ2UnLCB0aGlzLl9vbk1hdGVyaWFsQXNzZXRDaGFuZ2UsIHRoaXMpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7QXNzZXR9IGFzc2V0IC0gVGhlIG1hdGVyaWFsIGFzc2V0IG9uIHdoaWNoIGFuIGFzc2V0IGFkZCBldmVudCBoYXMgYmVlbiBmaXJlZC5cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9vbk1hdGVyaWFsQXNzZXRBZGQoYXNzZXQpIHtcbiAgICAgICAgdGhpcy5zeXN0ZW0uYXBwLmFzc2V0cy5vZmYoJ2FkZDonICsgYXNzZXQuaWQsIHRoaXMuX29uTWF0ZXJpYWxBc3NldEFkZCwgdGhpcyk7XG4gICAgICAgIGlmICh0aGlzLl9tYXRlcmlhbEFzc2V0ID09PSBhc3NldC5pZCkge1xuICAgICAgICAgICAgdGhpcy5fYmluZE1hdGVyaWFsQXNzZXQoYXNzZXQpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtBc3NldH0gYXNzZXQgLSBUaGUgbWF0ZXJpYWwgYXNzZXQgb24gd2hpY2ggYW4gYXNzZXQgbG9hZCBldmVudCBoYXMgYmVlbiBmaXJlZC5cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9vbk1hdGVyaWFsQXNzZXRMb2FkKGFzc2V0KSB7XG4gICAgICAgIHRoaXMuX3NldE1hdGVyaWFsKGFzc2V0LnJlc291cmNlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0ge0Fzc2V0fSBhc3NldCAtIFRoZSBtYXRlcmlhbCBhc3NldCBvbiB3aGljaCBhbiBhc3NldCB1bmxvYWQgZXZlbnQgaGFzIGJlZW4gZmlyZWQuXG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfb25NYXRlcmlhbEFzc2V0VW5sb2FkKGFzc2V0KSB7XG4gICAgICAgIHRoaXMuX3NldE1hdGVyaWFsKHRoaXMuc3lzdGVtLmRlZmF1bHRNYXRlcmlhbCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtBc3NldH0gYXNzZXQgLSBUaGUgbWF0ZXJpYWwgYXNzZXQgb24gd2hpY2ggYW4gYXNzZXQgcmVtb3ZlIGV2ZW50IGhhcyBiZWVuIGZpcmVkLlxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX29uTWF0ZXJpYWxBc3NldFJlbW92ZShhc3NldCkge1xuICAgICAgICB0aGlzLl9vbk1hdGVyaWFsQXNzZXRVbmxvYWQoYXNzZXQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7QXNzZXR9IGFzc2V0IC0gVGhlIG1hdGVyaWFsIGFzc2V0IG9uIHdoaWNoIGFuIGFzc2V0IGNoYW5nZSBldmVudCBoYXMgYmVlbiBmaXJlZC5cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9vbk1hdGVyaWFsQXNzZXRDaGFuZ2UoYXNzZXQpIHtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0ge0Fzc2V0fSBhc3NldCAtIFRoZSBtb2RlbCBhc3NldCB0byBiaW5kIGV2ZW50cyB0by5cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9iaW5kTW9kZWxBc3NldChhc3NldCkge1xuICAgICAgICB0aGlzLl91bmJpbmRNb2RlbEFzc2V0KGFzc2V0KTtcblxuICAgICAgICBhc3NldC5vbignbG9hZCcsIHRoaXMuX29uTW9kZWxBc3NldExvYWQsIHRoaXMpO1xuICAgICAgICBhc3NldC5vbigndW5sb2FkJywgdGhpcy5fb25Nb2RlbEFzc2V0VW5sb2FkLCB0aGlzKTtcbiAgICAgICAgYXNzZXQub24oJ2NoYW5nZScsIHRoaXMuX29uTW9kZWxBc3NldENoYW5nZSwgdGhpcyk7XG4gICAgICAgIGFzc2V0Lm9uKCdyZW1vdmUnLCB0aGlzLl9vbk1vZGVsQXNzZXRSZW1vdmUsIHRoaXMpO1xuXG4gICAgICAgIGlmIChhc3NldC5yZXNvdXJjZSkge1xuICAgICAgICAgICAgdGhpcy5fb25Nb2RlbEFzc2V0TG9hZChhc3NldCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBkb24ndCB0cmlnZ2VyIGFuIGFzc2V0IGxvYWQgdW5sZXNzIHRoZSBjb21wb25lbnQgaXMgZW5hYmxlZFxuICAgICAgICAgICAgaWYgKCF0aGlzLmVuYWJsZWQgfHwgIXRoaXMuZW50aXR5LmVuYWJsZWQpIHJldHVybjtcblxuICAgICAgICAgICAgdGhpcy5zeXN0ZW0uYXBwLmFzc2V0cy5sb2FkKGFzc2V0KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7QXNzZXR9IGFzc2V0IC0gVGhlIG1vZGVsIGFzc2V0IHRvIHVuYmluZCBldmVudHMgZnJvbS5cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF91bmJpbmRNb2RlbEFzc2V0KGFzc2V0KSB7XG4gICAgICAgIGFzc2V0Lm9mZignbG9hZCcsIHRoaXMuX29uTW9kZWxBc3NldExvYWQsIHRoaXMpO1xuICAgICAgICBhc3NldC5vZmYoJ3VubG9hZCcsIHRoaXMuX29uTW9kZWxBc3NldFVubG9hZCwgdGhpcyk7XG4gICAgICAgIGFzc2V0Lm9mZignY2hhbmdlJywgdGhpcy5fb25Nb2RlbEFzc2V0Q2hhbmdlLCB0aGlzKTtcbiAgICAgICAgYXNzZXQub2ZmKCdyZW1vdmUnLCB0aGlzLl9vbk1vZGVsQXNzZXRSZW1vdmUsIHRoaXMpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7QXNzZXR9IGFzc2V0IC0gVGhlIG1vZGVsIGFzc2V0IG9uIHdoaWNoIGFuIGFzc2V0IGFkZCBldmVudCBoYXMgYmVlbiBmaXJlZC5cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9vbk1vZGVsQXNzZXRBZGRlZChhc3NldCkge1xuICAgICAgICB0aGlzLnN5c3RlbS5hcHAuYXNzZXRzLm9mZignYWRkOicgKyBhc3NldC5pZCwgdGhpcy5fb25Nb2RlbEFzc2V0QWRkZWQsIHRoaXMpO1xuICAgICAgICBpZiAoYXNzZXQuaWQgPT09IHRoaXMuX2Fzc2V0KSB7XG4gICAgICAgICAgICB0aGlzLl9iaW5kTW9kZWxBc3NldChhc3NldCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0ge0Fzc2V0fSBhc3NldCAtIFRoZSBtb2RlbCBhc3NldCBvbiB3aGljaCBhbiBhc3NldCBsb2FkIGV2ZW50IGhhcyBiZWVuIGZpcmVkLlxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX29uTW9kZWxBc3NldExvYWQoYXNzZXQpIHtcbiAgICAgICAgdGhpcy5tb2RlbCA9IGFzc2V0LnJlc291cmNlLmNsb25lKCk7XG4gICAgICAgIHRoaXMuX2Nsb25lZE1vZGVsID0gdHJ1ZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0ge0Fzc2V0fSBhc3NldCAtIFRoZSBtb2RlbCBhc3NldCBvbiB3aGljaCBhbiBhc3NldCB1bmxvYWQgZXZlbnQgaGFzIGJlZW4gZmlyZWQuXG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfb25Nb2RlbEFzc2V0VW5sb2FkKGFzc2V0KSB7XG4gICAgICAgIHRoaXMubW9kZWwgPSBudWxsO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7QXNzZXR9IGFzc2V0IC0gVGhlIG1vZGVsIGFzc2V0IG9uIHdoaWNoIGFuIGFzc2V0IGNoYW5nZSBldmVudCBoYXMgYmVlbiBmaXJlZC5cbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gYXR0ciAtIFRoZSBhdHRyaWJ1dGUgdGhhdCB3YXMgY2hhbmdlZC5cbiAgICAgKiBAcGFyYW0geyp9IF9uZXcgLSBUaGUgbmV3IHZhbHVlIG9mIHRoZSBhdHRyaWJ1dGUuXG4gICAgICogQHBhcmFtIHsqfSBfb2xkIC0gVGhlIG9sZCB2YWx1ZSBvZiB0aGUgYXR0cmlidXRlLlxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX29uTW9kZWxBc3NldENoYW5nZShhc3NldCwgYXR0ciwgX25ldywgX29sZCkge1xuICAgICAgICBpZiAoYXR0ciA9PT0gJ2RhdGEnKSB7XG4gICAgICAgICAgICB0aGlzLm1hcHBpbmcgPSB0aGlzLl9tYXBwaW5nO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtBc3NldH0gYXNzZXQgLSBUaGUgbW9kZWwgYXNzZXQgb24gd2hpY2ggYW4gYXNzZXQgcmVtb3ZlIGV2ZW50IGhhcyBiZWVuIGZpcmVkLlxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX29uTW9kZWxBc3NldFJlbW92ZShhc3NldCkge1xuICAgICAgICB0aGlzLm1vZGVsID0gbnVsbDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi4vLi4vLi4vc2NlbmUvbWF0ZXJpYWxzL21hdGVyaWFsLmpzJykuTWF0ZXJpYWx9IG1hdGVyaWFsIC0gVGhlIG1hdGVyaWFsIHRvXG4gICAgICogYmUgc2V0LlxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX3NldE1hdGVyaWFsKG1hdGVyaWFsKSB7XG4gICAgICAgIGlmICh0aGlzLl9tYXRlcmlhbCA9PT0gbWF0ZXJpYWwpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgdGhpcy5fbWF0ZXJpYWwgPSBtYXRlcmlhbDtcblxuICAgICAgICBjb25zdCBtb2RlbCA9IHRoaXMuX21vZGVsO1xuICAgICAgICBpZiAobW9kZWwgJiYgdGhpcy5fdHlwZSAhPT0gJ2Fzc2V0Jykge1xuICAgICAgICAgICAgY29uc3QgbWVzaEluc3RhbmNlcyA9IG1vZGVsLm1lc2hJbnN0YW5jZXM7XG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMCwgbGVuID0gbWVzaEluc3RhbmNlcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuICAgICAgICAgICAgICAgIG1lc2hJbnN0YW5jZXNbaV0ubWF0ZXJpYWwgPSBtYXRlcmlhbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbn1cblxuZXhwb3J0IHsgTW9kZWxDb21wb25lbnQgfTtcbiJdLCJuYW1lcyI6WyJNb2RlbENvbXBvbmVudCIsIkNvbXBvbmVudCIsImNvbnN0cnVjdG9yIiwic3lzdGVtIiwiZW50aXR5IiwiX3R5cGUiLCJfYXNzZXQiLCJfbW9kZWwiLCJfbWFwcGluZyIsIl9jYXN0U2hhZG93cyIsIl9yZWNlaXZlU2hhZG93cyIsIl9tYXRlcmlhbEFzc2V0IiwiX21hdGVyaWFsIiwiX2Nhc3RTaGFkb3dzTGlnaHRtYXAiLCJfbGlnaHRtYXBwZWQiLCJfbGlnaHRtYXBTaXplTXVsdGlwbGllciIsImlzU3RhdGljIiwiX2xheWVycyIsIkxBWUVSSURfV09STEQiLCJfYmF0Y2hHcm91cElkIiwiX2N1c3RvbUFhYmIiLCJfYXJlYSIsIl9tYXRlcmlhbEV2ZW50cyIsIl9jbG9uZWRNb2RlbCIsIl9iYXRjaEdyb3VwIiwiZGVmYXVsdE1hdGVyaWFsIiwib24iLCJvblJlbW92ZUNoaWxkIiwib25JbnNlcnRDaGlsZCIsIm1lc2hJbnN0YW5jZXMiLCJ2YWx1ZSIsImN1c3RvbUFhYmIiLCJtaSIsImkiLCJsZW5ndGgiLCJzZXRDdXN0b21BYWJiIiwidHlwZSIsIl9iaW5kTW9kZWxBc3NldCIsIm1vZGVsIiwicHJpbURhdGEiLCJnZXRTaGFwZVByaW1pdGl2ZSIsImFwcCIsImdyYXBoaWNzRGV2aWNlIiwiYXJlYSIsIm1lc2giLCJub2RlIiwiR3JhcGhOb2RlIiwiTW9kZWwiLCJncmFwaCIsIk1lc2hJbnN0YW5jZSIsImFzc2V0IiwiYXNzZXRzIiwiX2lkIiwiQXNzZXQiLCJpZCIsIm9mZiIsIl9vbk1vZGVsQXNzZXRBZGRlZCIsIl9wcmV2IiwiZ2V0IiwiX3VuYmluZE1vZGVsQXNzZXQiLCJfaW1tdXRhYmxlIiwiRGVidWciLCJlcnJvciIsInJlbW92ZU1vZGVsRnJvbUxheWVycyIsImdldEdyYXBoIiwiZGVzdHJveSIsIl9lbnRpdHkiLCJjYXN0U2hhZG93IiwicmVjZWl2ZVNoYWRvdyIsImxpZ2h0bWFwcGVkIiwiYWRkQ2hpbGQiLCJlbmFibGVkIiwiYWRkTW9kZWxUb0xheWVycyIsImFuaW1hdGlvbiIsInNldE1vZGVsIiwiYW5pbSIsInJlYmluZCIsIm1hcHBpbmciLCJfdW5zZXRNYXRlcmlhbEV2ZW50cyIsInNldExpZ2h0bWFwcGVkIiwiY2FzdFNoYWRvd3MiLCJsYXllcnMiLCJzY2VuZSIsImxheWVyIiwiZ2V0TGF5ZXJCeUlkIiwicmVtb3ZlU2hhZG93Q2FzdGVycyIsImFkZFNoYWRvd0Nhc3RlcnMiLCJyZWNlaXZlU2hhZG93cyIsImxlbiIsImNhc3RTaGFkb3dzTGlnaHRtYXAiLCJsaWdodG1hcFNpemVNdWx0aXBsaWVyIiwicmVtb3ZlTWVzaEluc3RhbmNlcyIsImFkZE1lc2hJbnN0YW5jZXMiLCJiYXRjaEdyb3VwSWQiLCJfdGhpcyRzeXN0ZW0kYXBwJGJhdGMiLCJiYXRjaGVyIiwicmVtb3ZlIiwiQmF0Y2hHcm91cCIsIk1PREVMIiwiX3RoaXMkc3lzdGVtJGFwcCRiYXRjMiIsImluc2VydCIsIm1hdGVyaWFsQXNzZXQiLCJfb25NYXRlcmlhbEFzc2V0QWRkIiwiX3VuYmluZE1hdGVyaWFsQXNzZXQiLCJfc2V0TWF0ZXJpYWwiLCJfYmluZE1hdGVyaWFsQXNzZXQiLCJtYXRlcmlhbCIsIm1vZGVsQXNzZXQiLCJhc3NldE1hcHBpbmciLCJkYXRhIiwidW5kZWZpbmVkIiwiX2xvYWRBbmRTZXRNZXNoSW5zdGFuY2VNYXRlcmlhbCIsInBhdGgiLCJ1cmwiLCJfZ2V0TWF0ZXJpYWxBc3NldFVybCIsImdldEJ5VXJsIiwib25SZW1vdmUiLCJvbkxheWVyc0NoYW5nZWQiLCJvbGRDb21wIiwibmV3Q29tcCIsIm9uTGF5ZXJBZGRlZCIsIm9uTGF5ZXJSZW1vdmVkIiwiaW5kZXgiLCJpbmRleE9mIiwiX3NldE1hdGVyaWFsRXZlbnQiLCJldmVudCIsImhhbmRsZXIiLCJldnQiLCJldmVudHMiLCJrZXkiLCJfZ2V0QXNzZXRCeUlkT3JQYXRoIiwiaWRPclBhdGgiLCJpc1BhdGgiLCJpc05hTiIsInBhcnNlSW50IiwiZ2V0QWJzb2x1dGVVcmwiLCJtZXNoSW5zdGFuY2UiLCJyZXNvdXJjZSIsImxvYWQiLCJvbkVuYWJsZSIsImlzQXNzZXQiLCJfYXBwJGJhdGNoZXIiLCJvbkRpc2FibGUiLCJfYXBwJGJhdGNoZXIyIiwiaGlkZSIsImluc3RhbmNlcyIsImwiLCJ2aXNpYmxlIiwic2hvdyIsIl9vbk1hdGVyaWFsQXNzZXRMb2FkIiwiX29uTWF0ZXJpYWxBc3NldFVubG9hZCIsIl9vbk1hdGVyaWFsQXNzZXRSZW1vdmUiLCJfb25NYXRlcmlhbEFzc2V0Q2hhbmdlIiwiX29uTW9kZWxBc3NldExvYWQiLCJfb25Nb2RlbEFzc2V0VW5sb2FkIiwiX29uTW9kZWxBc3NldENoYW5nZSIsIl9vbk1vZGVsQXNzZXRSZW1vdmUiLCJjbG9uZSIsImF0dHIiLCJfbmV3IiwiX29sZCJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7OztBQWNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsTUFBTUEsY0FBYyxTQUFTQyxTQUFTLENBQUM7QUEwR25DO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDSUMsRUFBQUEsV0FBV0EsQ0FBQ0MsTUFBTSxFQUFFQyxNQUFNLEVBQUU7QUFDeEIsSUFBQSxLQUFLLENBQUNELE1BQU0sRUFBRUMsTUFBTSxDQUFDLENBQUE7QUFsSHpCO0FBQ0o7QUFDQTtBQUNBO0lBSEksSUFJQUMsQ0FBQUEsS0FBSyxHQUFHLE9BQU8sQ0FBQTtBQUVmO0FBQ0o7QUFDQTtBQUNBO0lBSEksSUFJQUMsQ0FBQUEsTUFBTSxHQUFHLElBQUksQ0FBQTtBQUViO0FBQ0o7QUFDQTtBQUNBO0lBSEksSUFJQUMsQ0FBQUEsTUFBTSxHQUFHLElBQUksQ0FBQTtBQUViO0FBQ0o7QUFDQTtBQUNBO0lBSEksSUFJQUMsQ0FBQUEsUUFBUSxHQUFHLEVBQUUsQ0FBQTtBQUViO0FB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
