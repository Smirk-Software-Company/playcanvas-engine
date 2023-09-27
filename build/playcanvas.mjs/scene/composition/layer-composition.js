import { TRACEID_RENDER_ACTION } from '../../core/constants.js';
import { Debug } from '../../core/debug.js';
import { Tracing } from '../../core/tracing.js';
import { EventHandler } from '../../core/event-handler.js';
import { sortPriority } from '../../core/sort.js';
import { LAYERID_DEPTH } from '../constants.js';
import { RenderAction } from './render-action.js';

/**
 * Layer Composition is a collection of {@link Layer} that is fed to {@link Scene#layers} to define
 * rendering order.
 *
 * @augments EventHandler
 * @category Graphics
 */
class LayerComposition extends EventHandler {
  /**
   * Create a new layer composition.
   *
   * @param {string} [name] - Optional non-unique name of the layer composition. Defaults to
   * "Untitled" if not specified.
   */
  constructor(name = 'Untitled') {
    super();
    // Composition can hold only 2 sublayers of each layer
    /**
     * A read-only array of {@link Layer} sorted in the order they will be rendered.
     *
     * @type {import('../layer.js').Layer[]}
     */
    this.layerList = [];
    /**
     * A mapping of {@link Layer#id} to {@link Layer}.
     *
     * @type {Map<number, import('../layer.js').Layer>}
     * @ignore
     */
    this.layerIdMap = new Map();
    /**
     * A mapping of {@link Layer#name} to {@link Layer}.
     *
     * @type {Map<string, import('../layer.js').Layer>}
     * @ignore
     */
    this.layerNameMap = new Map();
    /**
     * A read-only array of boolean values, matching {@link LayerComposition#layerList}. True means only
     * semi-transparent objects are rendered, and false means opaque.
     *
     * @type {boolean[]}
     * @ignore
     */
    this.subLayerList = [];
    /**
     * A read-only array of boolean values, matching {@link LayerComposition#layerList}. True means the
     * layer is rendered, false means it's skipped.
     *
     * @type {boolean[]}
     */
    this.subLayerEnabled = [];
    // more granular control on top of layer.enabled (ANDed)
    /**
     * A read-only array of {@link CameraComponent} that can be used during rendering. e.g.
     * Inside {@link Layer#onPreCull}, {@link Layer#onPostCull}, {@link Layer#onPreRender},
     * {@link Layer#onPostRender}.
     *
     * @type {import('../../framework/components/camera/component.js').CameraComponent[]}
     */
    this.cameras = [];
    /**
     * The actual rendering sequence, generated based on layers and cameras
     *
     * @type {RenderAction[]}
     * @ignore
     */
    this._renderActions = [];
    this.name = name;
    this._opaqueOrder = {};
    this._transparentOrder = {};
    this._dirtyCameras = false;
  }
  destroy() {
    // render actions
    this._renderActions.forEach(ra => ra.destroy());
    this._renderActions = null;
  }
  _update() {
    const len = this.layerList.length;

    // if composition dirty flag is not set, test if layers are marked dirty
    if (!this._dirtyCameras) {
      for (let i = 0; i < len; i++) {
        if (this.layerList[i]._dirtyCameras) {
          this._dirtyCameras = true;
          break;
        }
      }
    }
    if (this._dirtyCameras) {
      this._dirtyCameras = false;

      // walk the layers and build an array of unique cameras from all layers
      this.cameras.length = 0;
      for (let i = 0; i < len; i++) {
        const layer = this.layerList[i];
        layer._dirtyCameras = false;

        // for all cameras in the layer
        for (let j = 0; j < layer.cameras.length; j++) {
          const camera = layer.cameras[j];
          const index = this.cameras.indexOf(camera);
          if (index < 0) {
            this.cameras.push(camera);
          }
        }
      }

      // sort cameras by priority
      if (this.cameras.length > 1) {
        sortPriority(this.cameras);
      }

      // render in order of cameras sorted by priority
      let renderActionCount = 0;
      for (let i = 0; i < this.cameras.length; i++) {
        const camera = this.cameras[i];

        // first render action for this camera
        let cameraFirstRenderAction = true;
        const cameraFirstRenderActionIndex = renderActionCount;

        // last render action for the camera
        let lastRenderAction = null;

        // true if post processing stop layer was found for the camera
        let postProcessMarked = false;

        // walk all global sorted list of layers (sublayers) to check if camera renders it
        // this adds both opaque and transparent sublayers if camera renders the layer
        for (let j = 0; j < len; j++) {
          const layer = this.layerList[j];
          const isLayerEnabled = this.subLayerEnabled[j];
          if (layer && isLayerEnabled) {
            // if layer needs to be rendered
            if (layer.cameras.length > 0) {
              // if the camera renders this layer
              if (camera.layers.indexOf(layer.id) >= 0) {

                // if this layer is the stop layer for postprocessing
                if (!postProcessMarked && layer.id === camera.disablePostEffectsLayer) {
                  postProcessMarked = true;

                  // the previously added render action is the last post-processed layer
                  if (lastRenderAction) {
                    // mark it to trigger postprocessing callback
                    lastRenderAction.triggerPostprocess = true;
                  }
                }

                // camera index in the layer array
                const cameraIndex = layer.cameras.indexOf(camera);
                if (cameraIndex >= 0) {
                  // add render action to describe rendering step
                  lastRenderAction = this.addRenderAction(this._renderActions, renderActionCount, layer, j, cameraIndex, cameraFirstRenderAction, postProcessMarked);
                  renderActionCount++;
                  cameraFirstRenderAction = false;
                }
              }
            }
          }
        }

        // if the camera renders any layers.
        if (cameraFirstRenderActionIndex < renderActionCount) {
          // mark the last render action as last one using the camera
          lastRenderAction.lastCameraUse = true;
        }

        // if no render action for this camera was marked for end of postprocessing, mark last one
        if (!postProcessMarked && lastRenderAction) {
          lastRenderAction.triggerPostprocess = true;
        }

        // handle camera stacking if this render action has postprocessing enabled
        if (camera.renderTarget && camera.postEffectsEnabled) {
          // process previous render actions starting with previous camera
          this.propagateRenderTarget(cameraFirstRenderActionIndex - 1, camera);
        }
      }

      // destroy unused render actions
      for (let i = renderActionCount; i < this._renderActions.length; i++) {
        this._renderActions[i].destroy();
      }
      this._renderActions.length = renderActionCount;
      this._logRenderActions();
    }
  }

  // function adds new render action to a list, while trying to limit allocation and reuse already allocated objects
  addRenderAction(renderActions, renderActionIndex, layer, layerIndex, cameraIndex, cameraFirstRenderAction, postProcessMarked) {
    // try and reuse object, otherwise allocate new
    /** @type {RenderAction} */
    let renderAction = renderActions[renderActionIndex];
    if (!renderAction) {
      renderAction = renderActions[renderActionIndex] = new RenderAction();
    }

    // render target from the camera takes precedence over the render target from the layer
    let rt = layer.renderTarget;
    /** @type {import('../../framework/components/camera/component.js').CameraComponent} */
    const camera = layer.cameras[cameraIndex];
    if (camera && camera.renderTarget) {
      if (layer.id !== LAYERID_DEPTH) {
        // ignore depth layer
        rt = camera.renderTarget;
      }
    }

    // was camera and render target combo used already
    let used = false;
    for (let i = renderActionIndex - 1; i >= 0; i--) {
      if (renderActions[i].camera === camera && renderActions[i].renderTarget === rt) {
        used = true;
        break;
      }
    }

    // clear flags - use camera clear flags in the first render action for each camera,
    // or when render target (from layer) was not yet cleared by this camera
    const needsClear = cameraFirstRenderAction || !used;
    let clearColor = needsClear ? camera.clearColorBuffer : false;
    let clearDepth = needsClear ? camera.clearDepthBuffer : false;
    let clearStencil = needsClear ? camera.clearStencilBuffer : false;

    // clear buffers if requested by the layer
    clearColor || (clearColor = layer.clearColorBuffer);
    clearDepth || (clearDepth = layer.clearDepthBuffer);
    clearStencil || (clearStencil = layer.clearStencilBuffer);

    // for cameras with post processing enabled, on layers after post processing has been applied already (so UI and similar),
    // don't render them to render target anymore
    if (postProcessMarked && camera.postEffectsEnabled) {
      rt = null;
    }

    // store the properties - write all as we reuse previously allocated class instances
    renderAction.triggerPostprocess = false;
    renderAction.layerIndex = layerIndex;
    renderAction.layer = layer;
    renderAction.cameraIndex = cameraIndex;
    renderAction.camera = camera;
    renderAction.renderTarget = rt;
    renderAction.clearColor = clearColor;
    renderAction.clearDepth = clearDepth;
    renderAction.clearStencil = clearStencil;
    renderAction.firstCameraUse = cameraFirstRenderAction;
    renderAction.lastCameraUse = false;
    return renderAction;
  }

  // executes when post-processing camera's render actions were created to propagate rendering to
  // render targets to previous camera as needed
  propagateRenderTarget(startIndex, fromCamera) {
    for (let a = startIndex; a >= 0; a--) {
      const ra = this._renderActions[a];
      const layer = this.layerList[ra.layerIndex];

      // if we hit render action with a render target (other than depth layer), that marks the end of camera stack
      // TODO: refactor this as part of depth layer refactoring
      if (ra.renderTarget && layer.id !== LAYERID_DEPTH) {
        break;
      }

      // skip over depth layer
      if (layer.id === LAYERID_DEPTH) {
        continue;
      }

      // camera stack ends when viewport or scissor of the camera changes
      const thisCamera = ra == null ? void 0 : ra.camera.camera;
      if (thisCamera) {
        if (!fromCamera.camera.rect.equals(thisCamera.rect) || !fromCamera.camera.scissorRect.equals(thisCamera.scissorRect)) {
          break;
        }
      }

      // render it to render target
      ra.renderTarget = fromCamera.renderTarget;
    }
  }

  // logs render action and their properties
  _logRenderActions() {
    if (Tracing.get(TRACEID_RENDER_ACTION)) {
      Debug.trace(TRACEID_RENDER_ACTION, 'Render Actions for composition: ' + this.name);
      for (let i = 0; i < this._renderActions.length; i++) {
        const ra = this._renderActions[i];
        const layerIndex = ra.layerIndex;
        const layer = this.layerList[layerIndex];
        const enabled = layer.enabled && this.subLayerEnabled[layerIndex];
        const transparent = this.subLayerList[layerIndex];
        const camera = layer.cameras[ra.cameraIndex];
        const clear = (ra.clearColor ? 'Color ' : '..... ') + (ra.clearDepth ? 'Depth ' : '..... ') + (ra.clearStencil ? 'Stencil' : '.......');
        Debug.trace(TRACEID_RENDER_ACTION, i + (' Cam: ' + (camera ? camera.entity.name : '-')).padEnd(22, ' ') + (' Lay: ' + layer.name).padEnd(22, ' ') + (transparent ? ' TRANSP' : ' OPAQUE') + (enabled ? ' ENABLED ' : ' DISABLED') + (' RT: ' + (ra.renderTarget ? ra.renderTarget.name : '-')).padEnd(30, ' ') + ' Clear: ' + clear + (ra.firstCameraUse ? ' CAM-FIRST' : '') + (ra.lastCameraUse ? ' CAM-LAST' : '') + (ra.triggerPostprocess ? ' POSTPROCESS' : ''));
      }
    }
  }
  _isLayerAdded(layer) {
    const found = this.layerIdMap.get(layer.id) === layer;
    Debug.assert(!found, `Layer is already added: ${layer.name}`);
    return found;
  }
  _isSublayerAdded(layer, transparent) {
    for (let i = 0; i < this.layerList.length; i++) {
      if (this.layerList[i] === layer && this.subLayerList[i] === transparent) {
        Debug.error(`Sublayer ${layer.name}, transparent: ${transparent} is already added.`);
        return true;
      }
    }
    return false;
  }

  // Whole layer API

  /**
   * Adds a layer (both opaque and semi-transparent parts) to the end of the {@link LayerComposition#layerList}.
   *
   * @param {import('../layer.js').Layer} layer - A {@link Layer} to add.
   */
  push(layer) {
    // add both opaque and transparent to the end of the array
    if (this._isLayerAdded(layer)) return;
    this.layerList.push(layer);
    this.layerList.push(layer);
    this._opaqueOrder[layer.id] = this.subLayerList.push(false) - 1;
    this._transparentOrder[layer.id] = this.subLayerList.push(true) - 1;
    this.subLayerEnabled.push(true);
    this.subLayerEnabled.push(true);
    this._updateLayerMaps();
    this._dirtyCameras = true;
    this.fire('add', layer);
  }

  /**
   * Inserts a layer (both opaque and semi-transparent parts) at the chosen index in the
   * {@link LayerComposition#layerList}.
   *
   * @param {import('../layer.js').Layer} layer - A {@link Layer} to add.
   * @param {number} index - Insertion position.
   */
  insert(layer, index) {
    // insert both opaque and transparent at the index
    if (this._isLayerAdded(layer)) return;
    this.layerList.splice(index, 0, layer, layer);
    this.subLayerList.splice(index, 0, false, true);
    const count = this.layerList.length;
    this._updateOpaqueOrder(index, count - 1);
    this._updateTransparentOrder(index, count - 1);
    this.subLayerEnabled.splice(index, 0, true, true);
    this._updateLayerMaps();
    this._dirtyCameras = true;
    this.fire('add', layer);
  }

  /**
   * Removes a layer (both opaque and semi-transparent parts) from {@link LayerComposition#layerList}.
   *
   * @param {import('../layer.js').Layer} layer - A {@link Layer} to remove.
   */
  remove(layer) {
    // remove all occurrences of a layer
    let id = this.layerList.indexOf(layer);
    delete this._opaqueOrder[id];
    delete this._transparentOrder[id];
    while (id >= 0) {
      this.layerList.splice(id, 1);
      this.subLayerList.splice(id, 1);
      this.subLayerEnabled.splice(id, 1);
      id = this.layerList.indexOf(layer);
      this._dirtyCameras = true;
      this.fire('remove', layer);
    }

    // update both orders
    const count = this.layerList.length;
    this._updateOpaqueOrder(0, count - 1);
    this._updateTransparentOrder(0, count - 1);
    this._updateLayerMaps();
  }

  // Sublayer API

  /**
   * Adds part of the layer with opaque (non semi-transparent) objects to the end of the
   * {@link LayerComposition#layerList}.
   *
   * @param {import('../layer.js').Layer} layer - A {@link Layer} to add.
   */
  pushOpaque(layer) {
    // add opaque to the end of the array
    if (this._isSublayerAdded(layer, false)) return;
    this.layerList.push(layer);
    this._opaqueOrder[layer.id] = this.subLayerList.push(false) - 1;
    this.subLayerEnabled.push(true);
    this._updateLayerMaps();
    this._dirtyCameras = true;
    this.fire('add', layer);
  }

  /**
   * Inserts an opaque part of the layer (non semi-transparent mesh instances) at the chosen
   * index in the {@link LayerComposition#layerList}.
   *
   * @param {import('../layer.js').Layer} layer - A {@link Layer} to add.
   * @param {number} index - Insertion position.
   */
  insertOpaque(layer, index) {
    // insert opaque at index
    if (this._isSublayerAdded(layer, false)) return;
    this.layerList.splice(index, 0, layer);
    this.subLayerList.splice(index, 0, false);
    const count = this.subLayerList.length;
    this._updateOpaqueOrder(index, count - 1);
    this.subLayerEnabled.splice(index, 0, true);
    this._updateLayerMaps();
    this._dirtyCameras = true;
    this.fire('add', layer);
  }

  /**
   * Removes an opaque part of the layer (non semi-transparent mesh instances) from
   * {@link LayerComposition#layerList}.
   *
   * @param {import('../layer.js').Layer} layer - A {@link Layer} to remove.
   */
  removeOpaque(layer) {
    // remove opaque occurrences of a layer
    for (let i = 0, len = this.layerList.length; i < len; i++) {
      if (this.layerList[i] === layer && !this.subLayerList[i]) {
        this.layerList.splice(i, 1);
        this.subLayerList.splice(i, 1);
        len--;
        this._updateOpaqueOrder(i, len - 1);
        this.subLayerEnabled.splice(i, 1);
        this._dirtyCameras = true;
        if (this.layerList.indexOf(layer) < 0) {
          this.fire('remove', layer); // no sublayers left
        }

        break;
      }
    }
    this._updateLayerMaps();
  }

  /**
   * Adds part of the layer with semi-transparent objects to the end of the {@link LayerComposition#layerList}.
   *
   * @param {import('../layer.js').Layer} layer - A {@link Layer} to add.
   */
  pushTransparent(layer) {
    // add transparent to the end of the array
    if (this._isSublayerAdded(layer, true)) return;
    this.layerList.push(layer);
    this._transparentOrder[layer.id] = this.subLayerList.push(true) - 1;
    this.subLayerEnabled.push(true);
    this._updateLayerMaps();
    this._dirtyCameras = true;
    this.fire('add', layer);
  }

  /**
   * Inserts a semi-transparent part of the layer at the chosen index in the {@link LayerComposition#layerList}.
   *
   * @param {import('../layer.js').Layer} layer - A {@link Layer} to add.
   * @param {number} index - Insertion position.
   */
  insertTransparent(layer, index) {
    // insert transparent at index
    if (this._isSublayerAdded(layer, true)) return;
    this.layerList.splice(index, 0, layer);
    this.subLayerList.splice(index, 0, true);
    const count = this.subLayerList.length;
    this._updateTransparentOrder(index, count - 1);
    this.subLayerEnabled.splice(index, 0, true);
    this._updateLayerMaps();
    this._dirtyCameras = true;
    this.fire('add', layer);
  }

  /**
   * Removes a transparent part of the layer from {@link LayerComposition#layerList}.
   *
   * @param {import('../layer.js').Layer} layer - A {@link Layer} to remove.
   */
  removeTransparent(layer) {
    // remove transparent occurrences of a layer
    for (let i = 0, len = this.layerList.length; i < len; i++) {
      if (this.layerList[i] === layer && this.subLayerList[i]) {
        this.layerList.splice(i, 1);
        this.subLayerList.splice(i, 1);
        len--;
        this._updateTransparentOrder(i, len - 1);
        this.subLayerEnabled.splice(i, 1);
        this._dirtyCameras = true;
        if (this.layerList.indexOf(layer) < 0) {
          this.fire('remove', layer); // no sublayers left
        }

        break;
      }
    }
    this._updateLayerMaps();
  }
  _getSublayerIndex(layer, transparent) {
    // find sublayer index in the composition array
    let id = this.layerList.indexOf(layer);
    if (id < 0) return -1;
    if (this.subLayerList[id] !== transparent) {
      id = this.layerList.indexOf(layer, id + 1);
      if (id < 0) return -1;
      if (this.subLayerList[id] !== transparent) {
        return -1;
      }
    }
    return id;
  }

  /**
   * Gets index of the opaque part of the supplied layer in the {@link LayerComposition#layerList}.
   *
   * @param {import('../layer.js').Layer} layer - A {@link Layer} to find index of.
   * @returns {number} The index of the opaque part of the specified layer.
   */
  getOpaqueIndex(layer) {
    return this._getSublayerIndex(layer, false);
  }

  /**
   * Gets index of the semi-transparent part of the supplied layer in the {@link LayerComposition#layerList}.
   *
   * @param {import('../layer.js').Layer} layer - A {@link Layer} to find index of.
   * @returns {number} The index of the semi-transparent part of the specified layer.
   */
  getTransparentIndex(layer) {
    return this._getSublayerIndex(layer, true);
  }

  /**
   * Update maps of layer IDs and names to match the layer list.
   *
   * @private
   */
  _updateLayerMaps() {
    this.layerIdMap.clear();
    this.layerNameMap.clear();
    for (let i = 0; i < this.layerList.length; i++) {
      const layer = this.layerList[i];
      this.layerIdMap.set(layer.id, layer);
      this.layerNameMap.set(layer.name, layer);
    }
  }

  /**
   * Finds a layer inside this composition by its ID. Null is returned, if nothing is found.
   *
   * @param {number} id - An ID of the layer to find.
   * @returns {import('../layer.js').Layer|null} The layer corresponding to the specified ID.
   * Returns null if layer is not found.
   */
  getLayerById(id) {
    var _this$layerIdMap$get;
    return (_this$layerIdMap$get = this.layerIdMap.get(id)) != null ? _this$layerIdMap$get : null;
  }

  /**
   * Finds a layer inside this composition by its name. Null is returned, if nothing is found.
   *
   * @param {string} name - The name of the layer to find.
   * @returns {import('../layer.js').Layer|null} The layer corresponding to the specified name.
   * Returns null if layer is not found.
   */
  getLayerByName(name) {
    var _this$layerNameMap$ge;
    return (_this$layerNameMap$ge = this.layerNameMap.get(name)) != null ? _this$layerNameMap$ge : null;
  }
  _updateOpaqueOrder(startIndex, endIndex) {
    for (let i = startIndex; i <= endIndex; i++) {
      if (this.subLayerList[i] === false) {
        this._opaqueOrder[this.layerList[i].id] = i;
      }
    }
  }
  _updateTransparentOrder(startIndex, endIndex) {
    for (let i = startIndex; i <= endIndex; i++) {
      if (this.subLayerList[i] === true) {
        this._transparentOrder[this.layerList[i].id] = i;
      }
    }
  }

  // Used to determine which array of layers has any sublayer that is
  // on top of all the sublayers in the other array. The order is a dictionary
  // of <layerId, index>.
  _sortLayersDescending(layersA, layersB, order) {
    let topLayerA = -1;
    let topLayerB = -1;

    // search for which layer is on top in layersA
    for (let i = 0, len = layersA.length; i < len; i++) {
      const id = layersA[i];
      if (order.hasOwnProperty(id)) {
        topLayerA = Math.max(topLayerA, order[id]);
      }
    }

    // search for which layer is on top in layersB
    for (let i = 0, len = layersB.length; i < len; i++) {
      const id = layersB[i];
      if (order.hasOwnProperty(id)) {
        topLayerB = Math.max(topLayerB, order[id]);
      }
    }

    // if the layers of layersA or layersB do not exist at all
    // in the composition then return early with the other.
    if (topLayerA === -1 && topLayerB !== -1) {
      return 1;
    } else if (topLayerB === -1 && topLayerA !== -1) {
      return -1;
    }

    // sort in descending order since we want
    // the higher order to be first
    return topLayerB - topLayerA;
  }

  /**
   * Used to determine which array of layers has any transparent sublayer that is on top of all
   * the transparent sublayers in the other array.
   *
   * @param {number[]} layersA - IDs of layers.
   * @param {number[]} layersB - IDs of layers.
   * @returns {number} Returns a negative number if any of the transparent sublayers in layersA
   * is on top of all the transparent sublayers in layersB, or a positive number if any of the
   * transparent sublayers in layersB is on top of all the transparent sublayers in layersA, or 0
   * otherwise.
   * @private
   */
  sortTransparentLayers(layersA, layersB) {
    return this._sortLayersDescending(layersA, layersB, this._transparentOrder);
  }

  /**
   * Used to determine which array of layers has any opaque sublayer that is on top of all the
   * opaque sublayers in the other array.
   *
   * @param {number[]} layersA - IDs of layers.
   * @param {number[]} layersB - IDs of layers.
   * @returns {number} Returns a negative number if any of the opaque sublayers in layersA is on
   * top of all the opaque sublayers in layersB, or a positive number if any of the opaque
   * sublayers in layersB is on top of all the opaque sublayers in layersA, or 0 otherwise.
   * @private
   */
  sortOpaqueLayers(layersA, layersB) {
    return this._sortLayersDescending(layersA, layersB, this._opaqueOrder);
  }
}

export { LayerComposition };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGF5ZXItY29tcG9zaXRpb24uanMiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9zY2VuZS9jb21wb3NpdGlvbi9sYXllci1jb21wb3NpdGlvbi5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBUUkFDRUlEX1JFTkRFUl9BQ1RJT04gfSBmcm9tICcuLi8uLi9jb3JlL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBEZWJ1ZyB9IGZyb20gJy4uLy4uL2NvcmUvZGVidWcuanMnO1xuaW1wb3J0IHsgVHJhY2luZyB9IGZyb20gJy4uLy4uL2NvcmUvdHJhY2luZy5qcyc7XG5pbXBvcnQgeyBFdmVudEhhbmRsZXIgfSBmcm9tICcuLi8uLi9jb3JlL2V2ZW50LWhhbmRsZXIuanMnO1xuaW1wb3J0IHsgc29ydFByaW9yaXR5IH0gZnJvbSAnLi4vLi4vY29yZS9zb3J0LmpzJztcbmltcG9ydCB7IExBWUVSSURfREVQVEggfSBmcm9tICcuLi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgUmVuZGVyQWN0aW9uIH0gZnJvbSAnLi9yZW5kZXItYWN0aW9uLmpzJztcblxuLyoqXG4gKiBMYXllciBDb21wb3NpdGlvbiBpcyBhIGNvbGxlY3Rpb24gb2Yge0BsaW5rIExheWVyfSB0aGF0IGlzIGZlZCB0byB7QGxpbmsgU2NlbmUjbGF5ZXJzfSB0byBkZWZpbmVcbiAqIHJlbmRlcmluZyBvcmRlci5cbiAqXG4gKiBAYXVnbWVudHMgRXZlbnRIYW5kbGVyXG4gKiBAY2F0ZWdvcnkgR3JhcGhpY3NcbiAqL1xuY2xhc3MgTGF5ZXJDb21wb3NpdGlvbiBleHRlbmRzIEV2ZW50SGFuZGxlciB7XG4gICAgLy8gQ29tcG9zaXRpb24gY2FuIGhvbGQgb25seSAyIHN1YmxheWVycyBvZiBlYWNoIGxheWVyXG5cbiAgICAvKipcbiAgICAgKiBBIHJlYWQtb25seSBhcnJheSBvZiB7QGxpbmsgTGF5ZXJ9IHNvcnRlZCBpbiB0aGUgb3JkZXIgdGhleSB3aWxsIGJlIHJlbmRlcmVkLlxuICAgICAqXG4gICAgICogQHR5cGUge2ltcG9ydCgnLi4vbGF5ZXIuanMnKS5MYXllcltdfVxuICAgICAqL1xuICAgIGxheWVyTGlzdCA9IFtdO1xuXG4gICAgLyoqXG4gICAgICogQSBtYXBwaW5nIG9mIHtAbGluayBMYXllciNpZH0gdG8ge0BsaW5rIExheWVyfS5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtNYXA8bnVtYmVyLCBpbXBvcnQoJy4uL2xheWVyLmpzJykuTGF5ZXI+fVxuICAgICAqIEBpZ25vcmVcbiAgICAgKi9cbiAgICBsYXllcklkTWFwID0gbmV3IE1hcCgpO1xuXG4gICAgLyoqXG4gICAgICogQSBtYXBwaW5nIG9mIHtAbGluayBMYXllciNuYW1lfSB0byB7QGxpbmsgTGF5ZXJ9LlxuICAgICAqXG4gICAgICogQHR5cGUge01hcDxzdHJpbmcsIGltcG9ydCgnLi4vbGF5ZXIuanMnKS5MYXllcj59XG4gICAgICogQGlnbm9yZVxuICAgICAqL1xuICAgIGxheWVyTmFtZU1hcCA9IG5ldyBNYXAoKTtcblxuICAgIC8qKlxuICAgICAqIEEgcmVhZC1vbmx5IGFycmF5IG9mIGJvb2xlYW4gdmFsdWVzLCBtYXRjaGluZyB7QGxpbmsgTGF5ZXJDb21wb3NpdGlvbiNsYXllckxpc3R9LiBUcnVlIG1lYW5zIG9ubHlcbiAgICAgKiBzZW1pLXRyYW5zcGFyZW50IG9iamVjdHMgYXJlIHJlbmRlcmVkLCBhbmQgZmFsc2UgbWVhbnMgb3BhcXVlLlxuICAgICAqXG4gICAgICogQHR5cGUge2Jvb2xlYW5bXX1cbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgc3ViTGF5ZXJMaXN0ID0gW107XG5cbiAgICAvKipcbiAgICAgKiBBIHJlYWQtb25seSBhcnJheSBvZiBib29sZWFuIHZhbHVlcywgbWF0Y2hpbmcge0BsaW5rIExheWVyQ29tcG9zaXRpb24jbGF5ZXJMaXN0fS4gVHJ1ZSBtZWFucyB0aGVcbiAgICAgKiBsYXllciBpcyByZW5kZXJlZCwgZmFsc2UgbWVhbnMgaXQncyBza2lwcGVkLlxuICAgICAqXG4gICAgICogQHR5cGUge2Jvb2xlYW5bXX1cbiAgICAgKi9cbiAgICBzdWJMYXllckVuYWJsZWQgPSBbXTsgLy8gbW9yZSBncmFudWxhciBjb250cm9sIG9uIHRvcCBvZiBsYXllci5lbmFibGVkIChBTkRlZClcblxuICAgIC8qKlxuICAgICAqIEEgcmVhZC1vbmx5IGFycmF5IG9mIHtAbGluayBDYW1lcmFDb21wb25lbnR9IHRoYXQgY2FuIGJlIHVzZWQgZHVyaW5nIHJlbmRlcmluZy4gZS5nLlxuICAgICAqIEluc2lkZSB7QGxpbmsgTGF5ZXIjb25QcmVDdWxsfSwge0BsaW5rIExheWVyI29uUG9zdEN1bGx9LCB7QGxpbmsgTGF5ZXIjb25QcmVSZW5kZXJ9LFxuICAgICAqIHtAbGluayBMYXllciNvblBvc3RSZW5kZXJ9LlxuICAgICAqXG4gICAgICogQHR5cGUge2ltcG9ydCgnLi4vLi4vZnJhbWV3b3JrL2NvbXBvbmVudHMvY2FtZXJhL2NvbXBvbmVudC5qcycpLkNhbWVyYUNvbXBvbmVudFtdfVxuICAgICAqL1xuICAgIGNhbWVyYXMgPSBbXTtcblxuICAgIC8qKlxuICAgICAqIFRoZSBhY3R1YWwgcmVuZGVyaW5nIHNlcXVlbmNlLCBnZW5lcmF0ZWQgYmFzZWQgb24gbGF5ZXJzIGFuZCBjYW1lcmFzXG4gICAgICpcbiAgICAgKiBAdHlwZSB7UmVuZGVyQWN0aW9uW119XG4gICAgICogQGlnbm9yZVxuICAgICAqL1xuICAgIF9yZW5kZXJBY3Rpb25zID0gW107XG5cbiAgICAvKipcbiAgICAgKiBDcmVhdGUgYSBuZXcgbGF5ZXIgY29tcG9zaXRpb24uXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gW25hbWVdIC0gT3B0aW9uYWwgbm9uLXVuaXF1ZSBuYW1lIG9mIHRoZSBsYXllciBjb21wb3NpdGlvbi4gRGVmYXVsdHMgdG9cbiAgICAgKiBcIlVudGl0bGVkXCIgaWYgbm90IHNwZWNpZmllZC5cbiAgICAgKi9cbiAgICBjb25zdHJ1Y3RvcihuYW1lID0gJ1VudGl0bGVkJykge1xuICAgICAgICBzdXBlcigpO1xuXG4gICAgICAgIHRoaXMubmFtZSA9IG5hbWU7XG5cbiAgICAgICAgdGhpcy5fb3BhcXVlT3JkZXIgPSB7fTtcbiAgICAgICAgdGhpcy5fdHJhbnNwYXJlbnRPcmRlciA9IHt9O1xuXG4gICAgICAgIHRoaXMuX2RpcnR5Q2FtZXJhcyA9IGZhbHNlO1xuICAgIH1cblxuICAgIGRlc3Ryb3koKSB7XG4gICAgICAgIC8vIHJlbmRlciBhY3Rpb25zXG4gICAgICAgIHRoaXMuX3JlbmRlckFjdGlvbnMuZm9yRWFjaChyYSA9PiByYS5kZXN0cm95KCkpO1xuICAgICAgICB0aGlzLl9yZW5kZXJBY3Rpb25zID0gbnVsbDtcbiAgICB9XG5cbiAgICBfdXBkYXRlKCkge1xuICAgICAgICBjb25zdCBsZW4gPSB0aGlzLmxheWVyTGlzdC5sZW5ndGg7XG5cbiAgICAgICAgLy8gaWYgY29tcG9zaXRpb24gZGlydHkgZmxhZyBpcyBub3Qgc2V0LCB0ZXN0IGlmIGxheWVycyBhcmUgbWFya2VkIGRpcnR5XG4gICAgICAgIGlmICghdGhpcy5fZGlydHlDYW1lcmFzKSB7XG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMubGF5ZXJMaXN0W2ldLl9kaXJ0eUNhbWVyYXMpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fZGlydHlDYW1lcmFzID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuX2RpcnR5Q2FtZXJhcykge1xuXG4gICAgICAgICAgICB0aGlzLl9kaXJ0eUNhbWVyYXMgPSBmYWxzZTtcblxuICAgICAgICAgICAgLy8gd2FsayB0aGUgbGF5ZXJzIGFuZCBidWlsZCBhbiBhcnJheSBvZiB1bmlxdWUgY2FtZXJhcyBmcm9tIGFsbCBsYXllcnNcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhcy5sZW5ndGggPSAwO1xuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBsZW47IGkrKykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGxheWVyID0gdGhpcy5sYXllckxpc3RbaV07XG4gICAgICAgICAgICAgICAgbGF5ZXIuX2RpcnR5Q2FtZXJhcyA9IGZhbHNlO1xuXG4gICAgICAgICAgICAgICAgLy8gZm9yIGFsbCBjYW1lcmFzIGluIHRoZSBsYXllclxuICAgICAgICAgICAgICAgIGZvciAobGV0IGogPSAwOyBqIDwgbGF5ZXIuY2FtZXJhcy5sZW5ndGg7IGorKykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBjYW1lcmEgPSBsYXllci5jYW1lcmFzW2pdO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBpbmRleCA9IHRoaXMuY2FtZXJhcy5pbmRleE9mKGNhbWVyYSk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChpbmRleCA8IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhcy5wdXNoKGNhbWVyYSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIHNvcnQgY2FtZXJhcyBieSBwcmlvcml0eVxuICAgICAgICAgICAgaWYgKHRoaXMuY2FtZXJhcy5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgICAgICAgc29ydFByaW9yaXR5KHRoaXMuY2FtZXJhcyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIGNvbGxlY3QgYSBsaXN0IG9mIGxheWVycyB0aGlzIGNhbWVyYSByZW5kZXJzXG4gICAgICAgICAgICBjb25zdCBjYW1lcmFMYXllcnMgPSBbXTtcblxuICAgICAgICAgICAgLy8gcmVuZGVyIGluIG9yZGVyIG9mIGNhbWVyYXMgc29ydGVkIGJ5IHByaW9yaXR5XG4gICAgICAgICAgICBsZXQgcmVuZGVyQWN0aW9uQ291bnQgPSAwO1xuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLmNhbWVyYXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICBjb25zdCBjYW1lcmEgPSB0aGlzLmNhbWVyYXNbaV07XG4gICAgICAgICAgICAgICAgY2FtZXJhTGF5ZXJzLmxlbmd0aCA9IDA7XG5cbiAgICAgICAgICAgICAgICAvLyBmaXJzdCByZW5kZXIgYWN0aW9uIGZvciB0aGlzIGNhbWVyYVxuICAgICAgICAgICAgICAgIGxldCBjYW1lcmFGaXJzdFJlbmRlckFjdGlvbiA9IHRydWU7XG4gICAgICAgICAgICAgICAgY29uc3QgY2FtZXJhRmlyc3RSZW5kZXJBY3Rpb25JbmRleCA9IHJlbmRlckFjdGlvbkNvdW50O1xuXG4gICAgICAgICAgICAgICAgLy8gbGFzdCByZW5kZXIgYWN0aW9uIGZvciB0aGUgY2FtZXJhXG4gICAgICAgICAgICAgICAgbGV0IGxhc3RSZW5kZXJBY3Rpb24gPSBudWxsO1xuXG4gICAgICAgICAgICAgICAgLy8gdHJ1ZSBpZiBwb3N0IHByb2Nlc3Npbmcgc3RvcCBsYXllciB3YXMgZm91bmQgZm9yIHRoZSBjYW1lcmFcbiAgICAgICAgICAgICAgICBsZXQgcG9zdFByb2Nlc3NNYXJrZWQgPSBmYWxzZTtcblxuICAgICAgICAgICAgICAgIC8vIHdhbGsgYWxsIGdsb2JhbCBzb3J0ZWQgbGlzdCBvZiBsYXllcnMgKHN1YmxheWVycykgdG8gY2hlY2sgaWYgY2FtZXJhIHJlbmRlcnMgaXRcbiAgICAgICAgICAgICAgICAvLyB0aGlzIGFkZHMgYm90aCBvcGFxdWUgYW5kIHRyYW5zcGFyZW50IHN1YmxheWVycyBpZiBjYW1lcmEgcmVuZGVycyB0aGUgbGF5ZXJcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBqID0gMDsgaiA8IGxlbjsgaisrKSB7XG5cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbGF5ZXIgPSB0aGlzLmxheWVyTGlzdFtqXTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaXNMYXllckVuYWJsZWQgPSB0aGlzLnN1YkxheWVyRW5hYmxlZFtqXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGxheWVyICYmIGlzTGF5ZXJFbmFibGVkKSB7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGlmIGxheWVyIG5lZWRzIHRvIGJlIHJlbmRlcmVkXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAobGF5ZXIuY2FtZXJhcy5sZW5ndGggPiAwKSB7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBpZiB0aGUgY2FtZXJhIHJlbmRlcnMgdGhpcyBsYXllclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjYW1lcmEubGF5ZXJzLmluZGV4T2YobGF5ZXIuaWQpID49IDApIHtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYW1lcmFMYXllcnMucHVzaChsYXllcik7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gaWYgdGhpcyBsYXllciBpcyB0aGUgc3RvcCBsYXllciBmb3IgcG9zdHByb2Nlc3NpbmdcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFwb3N0UHJvY2Vzc01hcmtlZCAmJiBsYXllci5pZCA9PT0gY2FtZXJhLmRpc2FibGVQb3N0RWZmZWN0c0xheWVyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwb3N0UHJvY2Vzc01hcmtlZCA9IHRydWU7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHRoZSBwcmV2aW91c2x5IGFkZGVkIHJlbmRlciBhY3Rpb24gaXMgdGhlIGxhc3QgcG9zdC1wcm9jZXNzZWQgbGF5ZXJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChsYXN0UmVuZGVyQWN0aW9uKSB7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBtYXJrIGl0IHRvIHRyaWdnZXIgcG9zdHByb2Nlc3NpbmcgY2FsbGJhY2tcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBsYXN0UmVuZGVyQWN0aW9uLnRyaWdnZXJQb3N0cHJvY2VzcyA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBjYW1lcmEgaW5kZXggaW4gdGhlIGxheWVyIGFycmF5XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGNhbWVyYUluZGV4ID0gbGF5ZXIuY2FtZXJhcy5pbmRleE9mKGNhbWVyYSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjYW1lcmFJbmRleCA+PSAwKSB7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGFkZCByZW5kZXIgYWN0aW9uIHRvIGRlc2NyaWJlIHJlbmRlcmluZyBzdGVwXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBsYXN0UmVuZGVyQWN0aW9uID0gdGhpcy5hZGRSZW5kZXJBY3Rpb24odGhpcy5fcmVuZGVyQWN0aW9ucywgcmVuZGVyQWN0aW9uQ291bnQsIGxheWVyLCBqLCBjYW1lcmFJbmRleCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYW1lcmFGaXJzdFJlbmRlckFjdGlvbiwgcG9zdFByb2Nlc3NNYXJrZWQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVuZGVyQWN0aW9uQ291bnQrKztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNhbWVyYUZpcnN0UmVuZGVyQWN0aW9uID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBpZiB0aGUgY2FtZXJhIHJlbmRlcnMgYW55IGxheWVycy5cbiAgICAgICAgICAgICAgICBpZiAoY2FtZXJhRmlyc3RSZW5kZXJBY3Rpb25JbmRleCA8IHJlbmRlckFjdGlvbkNvdW50KSB7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gbWFyayB0aGUgbGFzdCByZW5kZXIgYWN0aW9uIGFzIGxhc3Qgb25lIHVzaW5nIHRoZSBjYW1lcmFcbiAgICAgICAgICAgICAgICAgICAgbGFzdFJlbmRlckFjdGlvbi5sYXN0Q2FtZXJhVXNlID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBpZiBubyByZW5kZXIgYWN0aW9uIGZvciB0aGlzIGNhbWVyYSB3YXMgbWFya2VkIGZvciBlbmQgb2YgcG9zdHByb2Nlc3NpbmcsIG1hcmsgbGFzdCBvbmVcbiAgICAgICAgICAgICAgICBpZiAoIXBvc3RQcm9jZXNzTWFya2VkICYmIGxhc3RSZW5kZXJBY3Rpb24pIHtcbiAgICAgICAgICAgICAgICAgICAgbGFzdFJlbmRlckFjdGlvbi50cmlnZ2VyUG9zdHByb2Nlc3MgPSB0cnVlO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIGhhbmRsZSBjYW1lcmEgc3RhY2tpbmcgaWYgdGhpcyByZW5kZXIgYWN0aW9uIGhhcyBwb3N0cHJvY2Vzc2luZyBlbmFibGVkXG4gICAgICAgICAgICAgICAgaWYgKGNhbWVyYS5yZW5kZXJUYXJnZXQgJiYgY2FtZXJhLnBvc3RFZmZlY3RzRW5hYmxlZCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBwcm9jZXNzIHByZXZpb3VzIHJlbmRlciBhY3Rpb25zIHN0YXJ0aW5nIHdpdGggcHJldmlvdXMgY2FtZXJhXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucHJvcGFnYXRlUmVuZGVyVGFyZ2V0KGNhbWVyYUZpcnN0UmVuZGVyQWN0aW9uSW5kZXggLSAxLCBjYW1lcmEpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gZGVzdHJveSB1bnVzZWQgcmVuZGVyIGFjdGlvbnNcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSByZW5kZXJBY3Rpb25Db3VudDsgaSA8IHRoaXMuX3JlbmRlckFjdGlvbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9yZW5kZXJBY3Rpb25zW2ldLmRlc3Ryb3koKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuX3JlbmRlckFjdGlvbnMubGVuZ3RoID0gcmVuZGVyQWN0aW9uQ291bnQ7XG5cbiAgICAgICAgICAgIHRoaXMuX2xvZ1JlbmRlckFjdGlvbnMoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIGZ1bmN0aW9uIGFkZHMgbmV3IHJlbmRlciBhY3Rpb24gdG8gYSBsaXN0LCB3aGlsZSB0cnlpbmcgdG8gbGltaXQgYWxsb2NhdGlvbiBhbmQgcmV1c2UgYWxyZWFkeSBhbGxvY2F0ZWQgb2JqZWN0c1xuICAgIGFkZFJlbmRlckFjdGlvbihyZW5kZXJBY3Rpb25zLCByZW5kZXJBY3Rpb25JbmRleCwgbGF5ZXIsIGxheWVySW5kZXgsIGNhbWVyYUluZGV4LCBjYW1lcmFGaXJzdFJlbmRlckFjdGlvbiwgcG9zdFByb2Nlc3NNYXJrZWQpIHtcblxuICAgICAgICAvLyB0cnkgYW5kIHJldXNlIG9iamVjdCwgb3RoZXJ3aXNlIGFsbG9jYXRlIG5ld1xuICAgICAgICAvKiogQHR5cGUge1JlbmRlckFjdGlvbn0gKi9cbiAgICAgICAgbGV0IHJlbmRlckFjdGlvbiA9IHJlbmRlckFjdGlvbnNbcmVuZGVyQWN0aW9uSW5kZXhdO1xuICAgICAgICBpZiAoIXJlbmRlckFjdGlvbikge1xuICAgICAgICAgICAgcmVuZGVyQWN0aW9uID0gcmVuZGVyQWN0aW9uc1tyZW5kZXJBY3Rpb25JbmRleF0gPSBuZXcgUmVuZGVyQWN0aW9uKCk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyByZW5kZXIgdGFyZ2V0IGZyb20gdGhlIGNhbWVyYSB0YWtlcyBwcmVjZWRlbmNlIG92ZXIgdGhlIHJlbmRlciB0YXJnZXQgZnJvbSB0aGUgbGF5ZXJcbiAgICAgICAgbGV0IHJ0ID0gbGF5ZXIucmVuZGVyVGFyZ2V0O1xuICAgICAgICAvKiogQHR5cGUge2ltcG9ydCgnLi4vLi4vZnJhbWV3b3JrL2NvbXBvbmVudHMvY2FtZXJhL2NvbXBvbmVudC5qcycpLkNhbWVyYUNvbXBvbmVudH0gKi9cbiAgICAgICAgY29uc3QgY2FtZXJhID0gbGF5ZXIuY2FtZXJhc1tjYW1lcmFJbmRleF07XG4gICAgICAgIGlmIChjYW1lcmEgJiYgY2FtZXJhLnJlbmRlclRhcmdldCkge1xuICAgICAgICAgICAgaWYgKGxheWVyLmlkICE9PSBMQVlFUklEX0RFUFRIKSB7ICAgLy8gaWdub3JlIGRlcHRoIGxheWVyXG4gICAgICAgICAgICAgICAgcnQgPSBjYW1lcmEucmVuZGVyVGFyZ2V0O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gd2FzIGNhbWVyYSBhbmQgcmVuZGVyIHRhcmdldCBjb21ibyB1c2VkIGFscmVhZHlcbiAgICAgICAgbGV0IHVzZWQgPSBmYWxzZTtcbiAgICAgICAgZm9yIChsZXQgaSA9IHJlbmRlckFjdGlvbkluZGV4IC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgICAgICAgIGlmIChyZW5kZXJBY3Rpb25zW2ldLmNhbWVyYSA9PT0gY2FtZXJhICYmIHJlbmRlckFjdGlvbnNbaV0ucmVuZGVyVGFyZ2V0ID09PSBydCkge1xuICAgICAgICAgICAgICAgIHVzZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gY2xlYXIgZmxhZ3MgLSB1c2UgY2FtZXJhIGNsZWFyIGZsYWdzIGluIHRoZSBmaXJzdCByZW5kZXIgYWN0aW9uIGZvciBlYWNoIGNhbWVyYSxcbiAgICAgICAgLy8gb3Igd2hlbiByZW5kZXIgdGFyZ2V0IChmcm9tIGxheWVyKSB3YXMgbm90IHlldCBjbGVhcmVkIGJ5IHRoaXMgY2FtZXJhXG4gICAgICAgIGNvbnN0IG5lZWRzQ2xlYXIgPSBjYW1lcmFGaXJzdFJlbmRlckFjdGlvbiB8fCAhdXNlZDtcbiAgICAgICAgbGV0IGNsZWFyQ29sb3IgPSBuZWVkc0NsZWFyID8gY2FtZXJhLmNsZWFyQ29sb3JCdWZmZXIgOiBmYWxzZTtcbiAgICAgICAgbGV0IGNsZWFyRGVwdGggPSBuZWVkc0NsZWFyID8gY2FtZXJhLmNsZWFyRGVwdGhCdWZmZXIgOiBmYWxzZTtcbiAgICAgICAgbGV0IGNsZWFyU3RlbmNpbCA9IG5lZWRzQ2xlYXIgPyBjYW1lcmEuY2xlYXJTdGVuY2lsQnVmZmVyIDogZmFsc2U7XG5cbiAgICAgICAgLy8gY2xlYXIgYnVmZmVycyBpZiByZXF1ZXN0ZWQgYnkgdGhlIGxheWVyXG4gICAgICAgIGNsZWFyQ29sb3IgfHw9IGxheWVyLmNsZWFyQ29sb3JCdWZmZXI7XG4gICAgICAgIGNsZWFyRGVwdGggfHw9IGxheWVyLmNsZWFyRGVwdGhCdWZmZXI7XG4gICAgICAgIGNsZWFyU3RlbmNpbCB8fD0gbGF5ZXIuY2xlYXJTdGVuY2lsQnVmZmVyO1xuXG4gICAgICAgIC8vIGZvciBjYW1lcmFzIHdpdGggcG9zdCBwcm9jZXNzaW5nIGVuYWJsZWQsIG9uIGxheWVycyBhZnRlciBwb3N0IHByb2Nlc3NpbmcgaGFzIGJlZW4gYXBwbGllZCBhbHJlYWR5IChzbyBVSSBhbmQgc2ltaWxhciksXG4gICAgICAgIC8vIGRvbid0IHJlbmRlciB0aGVtIHRvIHJlbmRlciB0YXJnZXQgYW55bW9yZVxuICAgICAgICBpZiAocG9zdFByb2Nlc3NNYXJrZWQgJiYgY2FtZXJhLnBvc3RFZmZlY3RzRW5hYmxlZCkge1xuICAgICAgICAgICAgcnQgPSBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gc3RvcmUgdGhlIHByb3BlcnRpZXMgLSB3cml0ZSBhbGwgYXMgd2UgcmV1c2UgcHJldmlvdXNseSBhbGxvY2F0ZWQgY2xhc3MgaW5zdGFuY2VzXG4gICAgICAgIHJlbmRlckFjdGlvbi50cmlnZ2VyUG9zdHByb2Nlc3MgPSBmYWxzZTtcbiAgICAgICAgcmVuZGVyQWN0aW9uLmxheWVySW5kZXggPSBsYXllckluZGV4O1xuICAgICAgICByZW5kZXJBY3Rpb24ubGF5ZXIgPSBsYXllcjtcbiAgICAgICAgcmVuZGVyQWN0aW9uLmNhbWVyYUluZGV4ID0gY2FtZXJhSW5kZXg7XG4gICAgICAgIHJlbmRlckFjdGlvbi5jYW1lcmEgPSBjYW1lcmE7XG4gICAgICAgIHJlbmRlckFjdGlvbi5yZW5kZXJUYXJnZXQgPSBydDtcbiAgICAgICAgcmVuZGVyQWN0aW9uLmNsZWFyQ29sb3IgPSBjbGVhckNvbG9yO1xuICAgICAgICByZW5kZXJBY3Rpb24uY2xlYXJEZXB0aCA9IGNsZWFyRGVwdGg7XG4gICAgICAgIHJlbmRlckFjdGlvbi5jbGVhclN0ZW5jaWwgPSBjbGVhclN0ZW5jaWw7XG4gICAgICAgIHJlbmRlckFjdGlvbi5maXJzdENhbWVyYVVzZSA9IGNhbWVyYUZpcnN0UmVuZGVyQWN0aW9uO1xuICAgICAgICByZW5kZXJBY3Rpb24ubGFzdENhbWVyYVVzZSA9IGZhbHNlO1xuXG4gICAgICAgIHJldHVybiByZW5kZXJBY3Rpb247XG4gICAgfVxuXG4gICAgLy8gZXhlY3V0ZXMgd2hlbiBwb3N0LXByb2Nlc3NpbmcgY2FtZXJhJ3MgcmVuZGVyIGFjdGlvbnMgd2VyZSBjcmVhdGVkIHRvIHByb3BhZ2F0ZSByZW5kZXJpbmcgdG9cbiAgICAvLyByZW5kZXIgdGFyZ2V0cyB0byBwcmV2aW91cyBjYW1lcmEgYXMgbmVlZGVkXG4gICAgcHJvcGFnYXRlUmVuZGVyVGFyZ2V0KHN0YXJ0SW5kZXgsIGZyb21DYW1lcmEpIHtcblxuICAgICAgICBmb3IgKGxldCBhID0gc3RhcnRJbmRleDsgYSA+PSAwOyBhLS0pIHtcblxuICAgICAgICAgICAgY29uc3QgcmEgPSB0aGlzLl9yZW5kZXJBY3Rpb25zW2FdO1xuICAgICAgICAgICAgY29uc3QgbGF5ZXIgPSB0aGlzLmxheWVyTGlzdFtyYS5sYXllckluZGV4XTtcblxuICAgICAgICAgICAgLy8gaWYgd2UgaGl0IHJlbmRlciBhY3Rpb24gd2l0aCBhIHJlbmRlciB0YXJnZXQgKG90aGVyIHRoYW4gZGVwdGggbGF5ZXIpLCB0aGF0IG1hcmtzIHRoZSBlbmQgb2YgY2FtZXJhIHN0YWNrXG4gICAgICAgICAgICAvLyBUT0RPOiByZWZhY3RvciB0aGlzIGFzIHBhcnQgb2YgZGVwdGggbGF5ZXIgcmVmYWN0b3JpbmdcbiAgICAgICAgICAgIGlmIChyYS5yZW5kZXJUYXJnZXQgJiYgbGF5ZXIuaWQgIT09IExBWUVSSURfREVQVEgpIHtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gc2tpcCBvdmVyIGRlcHRoIGxheWVyXG4gICAgICAgICAgICBpZiAobGF5ZXIuaWQgPT09IExBWUVSSURfREVQVEgpIHtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gY2FtZXJhIHN0YWNrIGVuZHMgd2hlbiB2aWV3cG9ydCBvciBzY2lzc29yIG9mIHRoZSBjYW1lcmEgY2hhbmdlc1xuICAgICAgICAgICAgY29uc3QgdGhpc0NhbWVyYSA9IHJhPy5jYW1lcmEuY2FtZXJhO1xuICAgICAgICAgICAgaWYgKHRoaXNDYW1lcmEpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWZyb21DYW1lcmEuY2FtZXJhLnJlY3QuZXF1YWxzKHRoaXNDYW1lcmEucmVjdCkgfHwgIWZyb21DYW1lcmEuY2FtZXJhLnNjaXNzb3JSZWN0LmVxdWFscyh0aGlzQ2FtZXJhLnNjaXNzb3JSZWN0KSkge1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIHJlbmRlciBpdCB0byByZW5kZXIgdGFyZ2V0XG4gICAgICAgICAgICByYS5yZW5kZXJUYXJnZXQgPSBmcm9tQ2FtZXJhLnJlbmRlclRhcmdldDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIGxvZ3MgcmVuZGVyIGFjdGlvbiBhbmQgdGhlaXIgcHJvcGVydGllc1xuICAgIF9sb2dSZW5kZXJBY3Rpb25zKCkge1xuXG4gICAgICAgIC8vICNpZiBfREVCVUdcbiAgICAgICAgaWYgKFRyYWNpbmcuZ2V0KFRSQUNFSURfUkVOREVSX0FDVElPTikpIHtcbiAgICAgICAgICAgIERlYnVnLnRyYWNlKFRSQUNFSURfUkVOREVSX0FDVElPTiwgJ1JlbmRlciBBY3Rpb25zIGZvciBjb21wb3NpdGlvbjogJyArIHRoaXMubmFtZSk7XG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuX3JlbmRlckFjdGlvbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICBjb25zdCByYSA9IHRoaXMuX3JlbmRlckFjdGlvbnNbaV07XG4gICAgICAgICAgICAgICAgY29uc3QgbGF5ZXJJbmRleCA9IHJhLmxheWVySW5kZXg7XG4gICAgICAgICAgICAgICAgY29uc3QgbGF5ZXIgPSB0aGlzLmxheWVyTGlzdFtsYXllckluZGV4XTtcbiAgICAgICAgICAgICAgICBjb25zdCBlbmFibGVkID0gbGF5ZXIuZW5hYmxlZCAmJiB0aGlzLnN1YkxheWVyRW5hYmxlZFtsYXllckluZGV4XTtcbiAgICAgICAgICAgICAgICBjb25zdCB0cmFuc3BhcmVudCA9IHRoaXMuc3ViTGF5ZXJMaXN0W2xheWVySW5kZXhdO1xuICAgICAgICAgICAgICAgIGNvbnN0IGNhbWVyYSA9IGxheWVyLmNhbWVyYXNbcmEuY2FtZXJhSW5kZXhdO1xuICAgICAgICAgICAgICAgIGNvbnN0IGNsZWFyID0gKHJhLmNsZWFyQ29sb3IgPyAnQ29sb3IgJyA6ICcuLi4uLiAnKSArIChyYS5jbGVhckRlcHRoID8gJ0RlcHRoICcgOiAnLi4uLi4gJykgKyAocmEuY2xlYXJTdGVuY2lsID8gJ1N0ZW5jaWwnIDogJy4uLi4uLi4nKTtcblxuICAgICAgICAgICAgICAgIERlYnVnLnRyYWNlKFRSQUNFSURfUkVOREVSX0FDVElPTiwgaSArXG4gICAgICAgICAgICAgICAgICAgICgnIENhbTogJyArIChjYW1lcmEgPyBjYW1lcmEuZW50aXR5Lm5hbWUgOiAnLScpKS5wYWRFbmQoMjIsICcgJykgK1xuICAgICAgICAgICAgICAgICAgICAoJyBMYXk6ICcgKyBsYXllci5uYW1lKS5wYWRFbmQoMjIsICcgJykgK1xuICAgICAgICAgICAgICAgICAgICAodHJhbnNwYXJlbnQgPyAnIFRSQU5TUCcgOiAnIE9QQVFVRScpICtcbiAgICAgICAgICAgICAgICAgICAgKGVuYWJsZWQgPyAnIEVOQUJMRUQgJyA6ICcgRElTQUJMRUQnKSArXG4gICAgICAgICAgICAgICAgICAgICgnIFJUOiAnICsgKHJhLnJlbmRlclRhcmdldCA/IHJhLnJlbmRlclRhcmdldC5uYW1lIDogJy0nKSkucGFkRW5kKDMwLCAnICcpICtcbiAgICAgICAgICAgICAgICAgICAgJyBDbGVhcjogJyArIGNsZWFyICtcbiAgICAgICAgICAgICAgICAgICAgKHJhLmZpcnN0Q2FtZXJhVXNlID8gJyBDQU0tRklSU1QnIDogJycpICtcbiAgICAgICAgICAgICAgICAgICAgKHJhLmxhc3RDYW1lcmFVc2UgPyAnIENBTS1MQVNUJyA6ICcnKSArXG4gICAgICAgICAgICAgICAgICAgIChyYS50cmlnZ2VyUG9zdHByb2Nlc3MgPyAnIFBPU1RQUk9DRVNTJyA6ICcnKVxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLy8gI2VuZGlmXG4gICAgfVxuXG4gICAgX2lzTGF5ZXJBZGRlZChsYXllcikge1xuICAgICAgICBjb25zdCBmb3VuZCA9IHRoaXMubGF5ZXJJZE1hcC5nZXQobGF5ZXIuaWQpID09PSBsYXllcjtcbiAgICAgICAgRGVidWcuYXNzZXJ0KCFmb3VuZCwgYExheWVyIGlzIGFscmVhZHkgYWRkZWQ6ICR7bGF5ZXIubmFtZX1gKTtcbiAgICAgICAgcmV0dXJuIGZvdW5kO1xuICAgIH1cblxuICAgIF9pc1N1YmxheWVyQWRkZWQobGF5ZXIsIHRyYW5zcGFyZW50KSB7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5sYXllckxpc3QubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGlmICh0aGlzLmxheWVyTGlzdFtpXSA9PT0gbGF5ZXIgJiYgdGhpcy5zdWJMYXllckxpc3RbaV0gPT09IHRyYW5zcGFyZW50KSB7XG4gICAgICAgICAgICAgICAgRGVidWcuZXJyb3IoYFN1YmxheWVyICR7bGF5ZXIubmFtZX0sIHRyYW5zcGFyZW50OiAke3RyYW5zcGFyZW50fSBpcyBhbHJlYWR5IGFkZGVkLmApO1xuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICAvLyBXaG9sZSBsYXllciBBUElcblxuICAgIC8qKlxuICAgICAqIEFkZHMgYSBsYXllciAoYm90aCBvcGFxdWUgYW5kIHNlbWktdHJhbnNwYXJlbnQgcGFydHMpIHRvIHRoZSBlbmQgb2YgdGhlIHtAbGluayBMYXllckNvbXBvc2l0aW9uI2xheWVyTGlzdH0uXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi4vbGF5ZXIuanMnKS5MYXllcn0gbGF5ZXIgLSBBIHtAbGluayBMYXllcn0gdG8gYWRkLlxuICAgICAqL1xuICAgIHB1c2gobGF5ZXIpIHtcbiAgICAgICAgLy8gYWRkIGJvdGggb3BhcXVlIGFuZCB0cmFuc3BhcmVudCB0byB0aGUgZW5kIG9mIHRoZSBhcnJheVxuICAgICAgICBpZiAodGhpcy5faXNMYXllckFkZGVkKGxheWVyKSkgcmV0dXJuO1xuICAgICAgICB0aGlzLmxheWVyTGlzdC5wdXNoKGxheWVyKTtcbiAgICAgICAgdGhpcy5sYXllckxpc3QucHVzaChsYXllcik7XG4gICAgICAgIHRoaXMuX29wYXF1ZU9yZGVyW2xheWVyLmlkXSA9IHRoaXMuc3ViTGF5ZXJMaXN0LnB1c2goZmFsc2UpIC0gMTtcbiAgICAgICAgdGhpcy5fdHJhbnNwYXJlbnRPcmRlcltsYXllci5pZF0gPSB0aGlzLnN1YkxheWVyTGlzdC5wdXNoKHRydWUpIC0gMTtcbiAgICAgICAgdGhpcy5zdWJMYXllckVuYWJsZWQucHVzaCh0cnVlKTtcbiAgICAgICAgdGhpcy5zdWJMYXllckVuYWJsZWQucHVzaCh0cnVlKTtcblxuICAgICAgICB0aGlzLl91cGRhdGVMYXllck1hcHMoKTtcbiAgICAgICAgdGhpcy5fZGlydHlDYW1lcmFzID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5maXJlKCdhZGQnLCBsYXllcik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSW5zZXJ0cyBhIGxheWVyIChib3RoIG9wYXF1ZSBhbmQgc2VtaS10cmFuc3BhcmVudCBwYXJ0cykgYXQgdGhlIGNob3NlbiBpbmRleCBpbiB0aGVcbiAgICAgKiB7QGxpbmsgTGF5ZXJDb21wb3NpdGlvbiNsYXllckxpc3R9LlxuICAgICAqXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4uL2xheWVyLmpzJykuTGF5ZXJ9IGxheWVyIC0gQSB7QGxpbmsgTGF5ZXJ9IHRvIGFkZC5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gaW5kZXggLSBJbnNlcnRpb24gcG9zaXRpb24uXG4gICAgICovXG4gICAgaW5zZXJ0KGxheWVyLCBpbmRleCkge1xuICAgICAgICAvLyBpbnNlcnQgYm90aCBvcGFxdWUgYW5kIHRyYW5zcGFyZW50IGF0IHRoZSBpbmRleFxuICAgICAgICBpZiAodGhpcy5faXNMYXllckFkZGVkKGxheWVyKSkgcmV0dXJuO1xuICAgICAgICB0aGlzLmxheWVyTGlzdC5zcGxpY2UoaW5kZXgsIDAsIGxheWVyLCBsYXllcik7XG4gICAgICAgIHRoaXMuc3ViTGF5ZXJMaXN0LnNwbGljZShpbmRleCwgMCwgZmFsc2UsIHRydWUpO1xuXG4gICAgICAgIGNvbnN0IGNvdW50ID0gdGhpcy5sYXllckxpc3QubGVuZ3RoO1xuICAgICAgICB0aGlzLl91cGRhdGVPcGFxdWVPcmRlcihpbmRleCwgY291bnQgLSAxKTtcbiAgICAgICAgdGhpcy5fdXBkYXRlVHJhbnNwYXJlbnRPcmRlcihpbmRleCwgY291bnQgLSAxKTtcbiAgICAgICAgdGhpcy5zdWJMYXllckVuYWJsZWQuc3BsaWNlKGluZGV4LCAwLCB0cnVlLCB0cnVlKTtcblxuICAgICAgICB0aGlzLl91cGRhdGVMYXllck1hcHMoKTtcbiAgICAgICAgdGhpcy5fZGlydHlDYW1lcmFzID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5maXJlKCdhZGQnLCBsYXllcik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVtb3ZlcyBhIGxheWVyIChib3RoIG9wYXF1ZSBhbmQgc2VtaS10cmFuc3BhcmVudCBwYXJ0cykgZnJvbSB7QGxpbmsgTGF5ZXJDb21wb3NpdGlvbiNsYXllckxpc3R9LlxuICAgICAqXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4uL2xheWVyLmpzJykuTGF5ZXJ9IGxheWVyIC0gQSB7QGxpbmsgTGF5ZXJ9IHRvIHJlbW92ZS5cbiAgICAgKi9cbiAgICByZW1vdmUobGF5ZXIpIHtcbiAgICAgICAgLy8gcmVtb3ZlIGFsbCBvY2N1cnJlbmNlcyBvZiBhIGxheWVyXG4gICAgICAgIGxldCBpZCA9IHRoaXMubGF5ZXJMaXN0LmluZGV4T2YobGF5ZXIpO1xuXG4gICAgICAgIGRlbGV0ZSB0aGlzLl9vcGFxdWVPcmRlcltpZF07XG4gICAgICAgIGRlbGV0ZSB0aGlzLl90cmFuc3BhcmVudE9yZGVyW2lkXTtcblxuICAgICAgICB3aGlsZSAoaWQgPj0gMCkge1xuICAgICAgICAgICAgdGhpcy5sYXllckxpc3Quc3BsaWNlKGlkLCAxKTtcbiAgICAgICAgICAgIHRoaXMuc3ViTGF5ZXJMaXN0LnNwbGljZShpZCwgMSk7XG4gICAgICAgICAgICB0aGlzLnN1YkxheWVyRW5hYmxlZC5zcGxpY2UoaWQsIDEpO1xuICAgICAgICAgICAgaWQgPSB0aGlzLmxheWVyTGlzdC5pbmRleE9mKGxheWVyKTtcbiAgICAgICAgICAgIHRoaXMuX2RpcnR5Q2FtZXJhcyA9IHRydWU7XG4gICAgICAgICAgICB0aGlzLmZpcmUoJ3JlbW92ZScsIGxheWVyKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHVwZGF0ZSBib3RoIG9yZGVyc1xuICAgICAgICBjb25zdCBjb3VudCA9IHRoaXMubGF5ZXJMaXN0Lmxlbmd0aDtcbiAgICAgICAgdGhpcy5fdXBkYXRlT3BhcXVlT3JkZXIoMCwgY291bnQgLSAxKTtcbiAgICAgICAgdGhpcy5fdXBkYXRlVHJhbnNwYXJlbnRPcmRlcigwLCBjb3VudCAtIDEpO1xuICAgICAgICB0aGlzLl91cGRhdGVMYXllck1hcHMoKTtcbiAgICB9XG5cbiAgICAvLyBTdWJsYXllciBBUElcblxuICAgIC8qKlxuICAgICAqIEFkZHMgcGFydCBvZiB0aGUgbGF5ZXIgd2l0aCBvcGFxdWUgKG5vbiBzZW1pLXRyYW5zcGFyZW50KSBvYmplY3RzIHRvIHRoZSBlbmQgb2YgdGhlXG4gICAgICoge0BsaW5rIExheWVyQ29tcG9zaXRpb24jbGF5ZXJMaXN0fS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuLi9sYXllci5qcycpLkxheWVyfSBsYXllciAtIEEge0BsaW5rIExheWVyfSB0byBhZGQuXG4gICAgICovXG4gICAgcHVzaE9wYXF1ZShsYXllcikge1xuICAgICAgICAvLyBhZGQgb3BhcXVlIHRvIHRoZSBlbmQgb2YgdGhlIGFycmF5XG4gICAgICAgIGlmICh0aGlzLl9pc1N1YmxheWVyQWRkZWQobGF5ZXIsIGZhbHNlKSkgcmV0dXJuO1xuICAgICAgICB0aGlzLmxheWVyTGlzdC5wdXNoKGxheWVyKTtcbiAgICAgICAgdGhpcy5fb3BhcXVlT3JkZXJbbGF5ZXIuaWRdID0gdGhpcy5zdWJMYXllckxpc3QucHVzaChmYWxzZSkgLSAxO1xuICAgICAgICB0aGlzLnN1YkxheWVyRW5hYmxlZC5wdXNoKHRydWUpO1xuXG4gICAgICAgIHRoaXMuX3VwZGF0ZUxheWVyTWFwcygpO1xuICAgICAgICB0aGlzLl9kaXJ0eUNhbWVyYXMgPSB0cnVlO1xuICAgICAgICB0aGlzLmZpcmUoJ2FkZCcsIGxheWVyKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJbnNlcnRzIGFuIG9wYXF1ZSBwYXJ0IG9mIHRoZSBsYXllciAobm9uIHNlbWktdHJhbnNwYXJlbnQgbWVzaCBpbnN0YW5jZXMpIGF0IHRoZSBjaG9zZW5cbiAgICAgKiBpbmRleCBpbiB0aGUge0BsaW5rIExheWVyQ29tcG9zaXRpb24jbGF5ZXJMaXN0fS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuLi9sYXllci5qcycpLkxheWVyfSBsYXllciAtIEEge0BsaW5rIExheWVyfSB0byBhZGQuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGluZGV4IC0gSW5zZXJ0aW9uIHBvc2l0aW9uLlxuICAgICAqL1xuICAgIGluc2VydE9wYXF1ZShsYXllciwgaW5kZXgpIHtcbiAgICAgICAgLy8gaW5zZXJ0IG9wYXF1ZSBhdCBpbmRleFxuICAgICAgICBpZiAodGhpcy5faXNTdWJsYXllckFkZGVkKGxheWVyLCBmYWxzZSkpIHJldHVybjtcbiAgICAgICAgdGhpcy5sYXllckxpc3Quc3BsaWNlKGluZGV4LCAwLCBsYXllcik7XG4gICAgICAgIHRoaXMuc3ViTGF5ZXJMaXN0LnNwbGljZShpbmRleCwgMCwgZmFsc2UpO1xuXG4gICAgICAgIGNvbnN0IGNvdW50ID0gdGhpcy5zdWJMYXllckxpc3QubGVuZ3RoO1xuICAgICAgICB0aGlzLl91cGRhdGVPcGFxdWVPcmRlcihpbmRleCwgY291bnQgLSAxKTtcblxuICAgICAgICB0aGlzLnN1YkxheWVyRW5hYmxlZC5zcGxpY2UoaW5kZXgsIDAsIHRydWUpO1xuXG4gICAgICAgIHRoaXMuX3VwZGF0ZUxheWVyTWFwcygpO1xuICAgICAgICB0aGlzLl9kaXJ0eUNhbWVyYXMgPSB0cnVlO1xuICAgICAgICB0aGlzLmZpcmUoJ2FkZCcsIGxheWVyKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZW1vdmVzIGFuIG9wYXF1ZSBwYXJ0IG9mIHRoZSBsYXllciAobm9uIHNlbWktdHJhbnNwYXJlbnQgbWVzaCBpbnN0YW5jZXMpIGZyb21cbiAgICAgKiB7QGxpbmsgTGF5ZXJDb21wb3NpdGlvbiNsYXllckxpc3R9LlxuICAgICAqXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4uL2xheWVyLmpzJykuTGF5ZXJ9IGxheWVyIC0gQSB7QGxpbmsgTGF5ZXJ9IHRvIHJlbW92ZS5cbiAgICAgKi9cbiAgICByZW1vdmVPcGFxdWUobGF5ZXIpIHtcbiAgICAgICAgLy8gcmVtb3ZlIG9wYXF1ZSBvY2N1cnJlbmNlcyBvZiBhIGxheWVyXG4gICAgICAgIGZvciAobGV0IGkgPSAwLCBsZW4gPSB0aGlzLmxheWVyTGlzdC5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuICAgICAgICAgICAgaWYgKHRoaXMubGF5ZXJMaXN0W2ldID09PSBsYXllciAmJiAhdGhpcy5zdWJMYXllckxpc3RbaV0pIHtcbiAgICAgICAgICAgICAgICB0aGlzLmxheWVyTGlzdC5zcGxpY2UoaSwgMSk7XG4gICAgICAgICAgICAgICAgdGhpcy5zdWJMYXllckxpc3Quc3BsaWNlKGksIDEpO1xuXG4gICAgICAgICAgICAgICAgbGVuLS07XG4gICAgICAgICAgICAgICAgdGhpcy5fdXBkYXRlT3BhcXVlT3JkZXIoaSwgbGVuIC0gMSk7XG5cbiAgICAgICAgICAgICAgICB0aGlzLnN1YkxheWVyRW5hYmxlZC5zcGxpY2UoaSwgMSk7XG4gICAgICAgICAgICAgICAgdGhpcy5fZGlydHlDYW1lcmFzID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5sYXllckxpc3QuaW5kZXhPZihsYXllcikgPCAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZmlyZSgncmVtb3ZlJywgbGF5ZXIpOyAvLyBubyBzdWJsYXllcnMgbGVmdFxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB0aGlzLl91cGRhdGVMYXllck1hcHMoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBZGRzIHBhcnQgb2YgdGhlIGxheWVyIHdpdGggc2VtaS10cmFuc3BhcmVudCBvYmplY3RzIHRvIHRoZSBlbmQgb2YgdGhlIHtAbGluayBMYXllckNvbXBvc2l0aW9uI2xheWVyTGlzdH0uXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi4vbGF5ZXIuanMnKS5MYXllcn0gbGF5ZXIgLSBBIHtAbGluayBMYXllcn0gdG8gYWRkLlxuICAgICAqL1xuICAgIHB1c2hUcmFuc3BhcmVudChsYXllcikge1xuICAgICAgICAvLyBhZGQgdHJhbnNwYXJlbnQgdG8gdGhlIGVuZCBvZiB0aGUgYXJyYXlcbiAgICAgICAgaWYgKHRoaXMuX2lzU3VibGF5ZXJBZGRlZChsYXllciwgdHJ1ZSkpIHJldHVybjtcbiAgICAgICAgdGhpcy5sYXllckxpc3QucHVzaChsYXllcik7XG4gICAgICAgIHRoaXMuX3RyYW5zcGFyZW50T3JkZXJbbGF5ZXIuaWRdID0gdGhpcy5zdWJMYXllckxpc3QucHVzaCh0cnVlKSAtIDE7XG4gICAgICAgIHRoaXMuc3ViTGF5ZXJFbmFibGVkLnB1c2godHJ1ZSk7XG5cbiAgICAgICAgdGhpcy5fdXBkYXRlTGF5ZXJNYXBzKCk7XG4gICAgICAgIHRoaXMuX2RpcnR5Q2FtZXJhcyA9IHRydWU7XG4gICAgICAgIHRoaXMuZmlyZSgnYWRkJywgbGF5ZXIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEluc2VydHMgYSBzZW1pLXRyYW5zcGFyZW50IHBhcnQgb2YgdGhlIGxheWVyIGF0IHRoZSBjaG9zZW4gaW5kZXggaW4gdGhlIHtAbGluayBMYXllckNvbXBvc2l0aW9uI2xheWVyTGlzdH0uXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi4vbGF5ZXIuanMnKS5MYXllcn0gbGF5ZXIgLSBBIHtAbGluayBMYXllcn0gdG8gYWRkLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBpbmRleCAtIEluc2VydGlvbiBwb3NpdGlvbi5cbiAgICAgKi9cbiAgICBpbnNlcnRUcmFuc3BhcmVudChsYXllciwgaW5kZXgpIHtcbiAgICAgICAgLy8gaW5zZXJ0IHRyYW5zcGFyZW50IGF0IGluZGV4XG4gICAgICAgIGlmICh0aGlzLl9pc1N1YmxheWVyQWRkZWQobGF5ZXIsIHRydWUpKSByZXR1cm47XG4gICAgICAgIHRoaXMubGF5ZXJMaXN0LnNwbGljZShpbmRleCwgMCwgbGF5ZXIpO1xuICAgICAgICB0aGlzLnN1YkxheWVyTGlzdC5zcGxpY2UoaW5kZXgsIDAsIHRydWUpO1xuXG4gICAgICAgIGNvbnN0IGNvdW50ID0gdGhpcy5zdWJMYXllckxpc3QubGVuZ3RoO1xuICAgICAgICB0aGlzLl91cGRhdGVUcmFuc3BhcmVudE9yZGVyKGluZGV4LCBjb3VudCAtIDEpO1xuXG4gICAgICAgIHRoaXMuc3ViTGF5ZXJFbmFibGVkLnNwbGljZShpbmRleCwgMCwgdHJ1ZSk7XG5cbiAgICAgICAgdGhpcy5fdXBkYXRlTGF5ZXJNYXBzKCk7XG4gICAgICAgIHRoaXMuX2RpcnR5Q2FtZXJhcyA9IHRydWU7XG4gICAgICAgIHRoaXMuZmlyZSgnYWRkJywgbGF5ZXIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJlbW92ZXMgYSB0cmFuc3BhcmVudCBwYXJ0IG9mIHRoZSBsYXllciBmcm9tIHtAbGluayBMYXllckNvbXBvc2l0aW9uI2xheWVyTGlzdH0uXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi4vbGF5ZXIuanMnKS5MYXllcn0gbGF5ZXIgLSBBIHtAbGluayBMYXllcn0gdG8gcmVtb3ZlLlxuICAgICAqL1xuICAgIHJlbW92ZVRyYW5zcGFyZW50KGxheWVyKSB7XG4gICAgICAgIC8vIHJlbW92ZSB0cmFuc3BhcmVudCBvY2N1cnJlbmNlcyBvZiBhIGxheWVyXG4gICAgICAgIGZvciAobGV0IGkgPSAwLCBsZW4gPSB0aGlzLmxheWVyTGlzdC5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuICAgICAgICAgICAgaWYgKHRoaXMubGF5ZXJMaXN0W2ldID09PSBsYXllciAmJiB0aGlzLnN1YkxheWVyTGlzdFtpXSkge1xuICAgICAgICAgICAgICAgIHRoaXMubGF5ZXJMaXN0LnNwbGljZShpLCAxKTtcbiAgICAgICAgICAgICAgICB0aGlzLnN1YkxheWVyTGlzdC5zcGxpY2UoaSwgMSk7XG5cbiAgICAgICAgICAgICAgICBsZW4tLTtcbiAgICAgICAgICAgICAgICB0aGlzLl91cGRhdGVUcmFuc3BhcmVudE9yZGVyKGksIGxlbiAtIDEpO1xuXG4gICAgICAgICAgICAgICAgdGhpcy5zdWJMYXllckVuYWJsZWQuc3BsaWNlKGksIDEpO1xuICAgICAgICAgICAgICAgIHRoaXMuX2RpcnR5Q2FtZXJhcyA9IHRydWU7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMubGF5ZXJMaXN0LmluZGV4T2YobGF5ZXIpIDwgMCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmZpcmUoJ3JlbW92ZScsIGxheWVyKTsgLy8gbm8gc3VibGF5ZXJzIGxlZnRcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5fdXBkYXRlTGF5ZXJNYXBzKCk7XG4gICAgfVxuXG4gICAgX2dldFN1YmxheWVySW5kZXgobGF5ZXIsIHRyYW5zcGFyZW50KSB7XG4gICAgICAgIC8vIGZpbmQgc3VibGF5ZXIgaW5kZXggaW4gdGhlIGNvbXBvc2l0aW9uIGFycmF5XG4gICAgICAgIGxldCBpZCA9IHRoaXMubGF5ZXJMaXN0LmluZGV4T2YobGF5ZXIpO1xuICAgICAgICBpZiAoaWQgPCAwKSByZXR1cm4gLTE7XG5cbiAgICAgICAgaWYgKHRoaXMuc3ViTGF5ZXJMaXN0W2lkXSAhPT0gdHJhbnNwYXJlbnQpIHtcbiAgICAgICAgICAgIGlkID0gdGhpcy5sYXllckxpc3QuaW5kZXhPZihsYXllciwgaWQgKyAxKTtcbiAgICAgICAgICAgIGlmIChpZCA8IDApIHJldHVybiAtMTtcbiAgICAgICAgICAgIGlmICh0aGlzLnN1YkxheWVyTGlzdFtpZF0gIT09IHRyYW5zcGFyZW50KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIC0xO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBpZDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBHZXRzIGluZGV4IG9mIHRoZSBvcGFxdWUgcGFydCBvZiB0aGUgc3VwcGxpZWQgbGF5ZXIgaW4gdGhlIHtAbGluayBMYXllckNvbXBvc2l0aW9uI2xheWVyTGlzdH0uXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi4vbGF5ZXIuanMnKS5MYXllcn0gbGF5ZXIgLSBBIHtAbGluayBMYXllcn0gdG8gZmluZCBpbmRleCBvZi5cbiAgICAgKiBAcmV0dXJucyB7bnVtYmVyfSBUaGUgaW5kZXggb2YgdGhlIG9wYXF1ZSBwYXJ0IG9mIHRoZSBzcGVjaWZpZWQgbGF5ZXIuXG4gICAgICovXG4gICAgZ2V0T3BhcXVlSW5kZXgobGF5ZXIpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2dldFN1YmxheWVySW5kZXgobGF5ZXIsIGZhbHNlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBHZXRzIGluZGV4IG9mIHRoZSBzZW1pLXRyYW5zcGFyZW50IHBhcnQgb2YgdGhlIHN1cHBsaWVkIGxheWVyIGluIHRoZSB7QGxpbmsgTGF5ZXJDb21wb3NpdGlvbiNsYXllckxpc3R9LlxuICAgICAqXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4uL2xheWVyLmpzJykuTGF5ZXJ9IGxheWVyIC0gQSB7QGxpbmsgTGF5ZXJ9IHRvIGZpbmQgaW5kZXggb2YuXG4gICAgICogQHJldHVybnMge251bWJlcn0gVGhlIGluZGV4IG9mIHRoZSBzZW1pLXRyYW5zcGFyZW50IHBhcnQgb2YgdGhlIHNwZWNpZmllZCBsYXllci5cbiAgICAgKi9cbiAgICBnZXRUcmFuc3BhcmVudEluZGV4KGxheWVyKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9nZXRTdWJsYXllckluZGV4KGxheWVyLCB0cnVlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBVcGRhdGUgbWFwcyBvZiBsYXllciBJRHMgYW5kIG5hbWVzIHRvIG1hdGNoIHRoZSBsYXllciBsaXN0LlxuICAgICAqXG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfdXBkYXRlTGF5ZXJNYXBzKCkge1xuICAgICAgICB0aGlzLmxheWVySWRNYXAuY2xlYXIoKTtcbiAgICAgICAgdGhpcy5sYXllck5hbWVNYXAuY2xlYXIoKTtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLmxheWVyTGlzdC5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgY29uc3QgbGF5ZXIgPSB0aGlzLmxheWVyTGlzdFtpXTtcbiAgICAgICAgICAgIHRoaXMubGF5ZXJJZE1hcC5zZXQobGF5ZXIuaWQsIGxheWVyKTtcbiAgICAgICAgICAgIHRoaXMubGF5ZXJOYW1lTWFwLnNldChsYXllci5uYW1lLCBsYXllcik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBGaW5kcyBhIGxheWVyIGluc2lkZSB0aGlzIGNvbXBvc2l0aW9uIGJ5IGl0cyBJRC4gTnVsbCBpcyByZXR1cm5lZCwgaWYgbm90aGluZyBpcyBmb3VuZC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBpZCAtIEFuIElEIG9mIHRoZSBsYXllciB0byBmaW5kLlxuICAgICAqIEByZXR1cm5zIHtpbXBvcnQoJy4uL2xheWVyLmpzJykuTGF5ZXJ8bnVsbH0gVGhlIGxheWVyIGNvcnJlc3BvbmRpbmcgdG8gdGhlIHNwZWNpZmllZCBJRC5cbiAgICAgKiBSZXR1cm5zIG51bGwgaWYgbGF5ZXIgaXMgbm90IGZvdW5kLlxuICAgICAqL1xuICAgIGdldExheWVyQnlJZChpZCkge1xuICAgICAgICByZXR1cm4gdGhpcy5sYXllcklkTWFwLmdldChpZCkgPz8gbnVsbDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBGaW5kcyBhIGxheWVyIGluc2lkZSB0aGlzIGNvbXBvc2l0aW9uIGJ5IGl0cyBuYW1lLiBOdWxsIGlzIHJldHVybmVkLCBpZiBub3RoaW5nIGlzIGZvdW5kLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IG5hbWUgLSBUaGUgbmFtZSBvZiB0aGUgbGF5ZXIgdG8gZmluZC5cbiAgICAgKiBAcmV0dXJucyB7aW1wb3J0KCcuLi9sYXllci5qcycpLkxheWVyfG51bGx9IFRoZSBsYXllciBjb3JyZXNwb25kaW5nIHRvIHRoZSBzcGVjaWZpZWQgbmFtZS5cbiAgICAgKiBSZXR1cm5zIG51bGwgaWYgbGF5ZXIgaXMgbm90IGZvdW5kLlxuICAgICAqL1xuICAgIGdldExheWVyQnlOYW1lKG5hbWUpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMubGF5ZXJOYW1lTWFwLmdldChuYW1lKSA/PyBudWxsO1xuICAgIH1cblxuICAgIF91cGRhdGVPcGFxdWVPcmRlcihzdGFydEluZGV4LCBlbmRJbmRleCkge1xuICAgICAgICBmb3IgKGxldCBpID0gc3RhcnRJbmRleDsgaSA8PSBlbmRJbmRleDsgaSsrKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5zdWJMYXllckxpc3RbaV0gPT09IGZhbHNlKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fb3BhcXVlT3JkZXJbdGhpcy5sYXllckxpc3RbaV0uaWRdID0gaTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIF91cGRhdGVUcmFuc3BhcmVudE9yZGVyKHN0YXJ0SW5kZXgsIGVuZEluZGV4KSB7XG4gICAgICAgIGZvciAobGV0IGkgPSBzdGFydEluZGV4OyBpIDw9IGVuZEluZGV4OyBpKyspIHtcbiAgICAgICAgICAgIGlmICh0aGlzLnN1YkxheWVyTGlzdFtpXSA9PT0gdHJ1ZSkge1xuICAgICAgICAgICAgICAgIHRoaXMuX3RyYW5zcGFyZW50T3JkZXJbdGhpcy5sYXllckxpc3RbaV0uaWRdID0gaTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIFVzZWQgdG8gZGV0ZXJtaW5lIHdoaWNoIGFycmF5IG9mIGxheWVycyBoYXMgYW55IHN1YmxheWVyIHRoYXQgaXNcbiAgICAvLyBvbiB0b3Agb2YgYWxsIHRoZSBzdWJsYXllcnMgaW4gdGhlIG90aGVyIGFycmF5LiBUaGUgb3JkZXIgaXMgYSBkaWN0aW9uYXJ5XG4gICAgLy8gb2YgPGxheWVySWQsIGluZGV4Pi5cbiAgICBfc29ydExheWVyc0Rlc2NlbmRpbmcobGF5ZXJzQSwgbGF5ZXJzQiwgb3JkZXIpIHtcbiAgICAgICAgbGV0IHRvcExheWVyQSA9IC0xO1xuICAgICAgICBsZXQgdG9wTGF5ZXJCID0gLTE7XG5cbiAgICAgICAgLy8gc2VhcmNoIGZvciB3aGljaCBsYXllciBpcyBvbiB0b3AgaW4gbGF5ZXJzQVxuICAgICAgICBmb3IgKGxldCBpID0gMCwgbGVuID0gbGF5ZXJzQS5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuICAgICAgICAgICAgY29uc3QgaWQgPSBsYXllcnNBW2ldO1xuICAgICAgICAgICAgaWYgKG9yZGVyLmhhc093blByb3BlcnR5KGlkKSkge1xuICAgICAgICAgICAgICAgIHRvcExheWVyQSA9IE1hdGgubWF4KHRvcExheWVyQSwgb3JkZXJbaWRdKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHNlYXJjaCBmb3Igd2hpY2ggbGF5ZXIgaXMgb24gdG9wIGluIGxheWVyc0JcbiAgICAgICAgZm9yIChsZXQgaSA9IDAsIGxlbiA9IGxheWVyc0IubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgICAgIGNvbnN0IGlkID0gbGF5ZXJzQltpXTtcbiAgICAgICAgICAgIGlmIChvcmRlci5oYXNPd25Qcm9wZXJ0eShpZCkpIHtcbiAgICAgICAgICAgICAgICB0b3BMYXllckIgPSBNYXRoLm1heCh0b3BMYXllckIsIG9yZGVyW2lkXSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBpZiB0aGUgbGF5ZXJzIG9mIGxheWVyc0Egb3IgbGF5ZXJzQiBkbyBub3QgZXhpc3QgYXQgYWxsXG4gICAgICAgIC8vIGluIHRoZSBjb21wb3NpdGlvbiB0aGVuIHJldHVybiBlYXJseSB3aXRoIHRoZSBvdGhlci5cbiAgICAgICAgaWYgKHRvcExheWVyQSA9PT0gLTEgJiYgdG9wTGF5ZXJCICE9PSAtMSkge1xuICAgICAgICAgICAgcmV0dXJuIDE7XG4gICAgICAgIH0gZWxzZSBpZiAodG9wTGF5ZXJCID09PSAtMSAmJiB0b3BMYXllckEgIT09IC0xKSB7XG4gICAgICAgICAgICByZXR1cm4gLTE7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBzb3J0IGluIGRlc2NlbmRpbmcgb3JkZXIgc2luY2Ugd2Ugd2FudFxuICAgICAgICAvLyB0aGUgaGlnaGVyIG9yZGVyIHRvIGJlIGZpcnN0XG4gICAgICAgIHJldHVybiB0b3BMYXllckIgLSB0b3BMYXllckE7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVXNlZCB0byBkZXRlcm1pbmUgd2hpY2ggYXJyYXkgb2YgbGF5ZXJzIGhhcyBhbnkgdHJhbnNwYXJlbnQgc3VibGF5ZXIgdGhhdCBpcyBvbiB0b3Agb2YgYWxsXG4gICAgICogdGhlIHRyYW5zcGFyZW50IHN1YmxheWVycyBpbiB0aGUgb3RoZXIgYXJyYXkuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge251bWJlcltdfSBsYXllcnNBIC0gSURzIG9mIGxheWVycy5cbiAgICAgKiBAcGFyYW0ge251bWJlcltdfSBsYXllcnNCIC0gSURzIG9mIGxheWVycy5cbiAgICAgKiBAcmV0dXJucyB7bnVtYmVyfSBSZXR1cm5zIGEgbmVnYXRpdmUgbnVtYmVyIGlmIGFueSBvZiB0aGUgdHJhbnNwYXJlbnQgc3VibGF5ZXJzIGluIGxheWVyc0FcbiAgICAgKiBpcyBvbiB0b3Agb2YgYWxsIHRoZSB0cmFuc3BhcmVudCBzdWJsYXllcnMgaW4gbGF5ZXJzQiwgb3IgYSBwb3NpdGl2ZSBudW1iZXIgaWYgYW55IG9mIHRoZVxuICAgICAqIHRyYW5zcGFyZW50IHN1YmxheWVycyBpbiBsYXllcnNCIGlzIG9uIHRvcCBvZiBhbGwgdGhlIHRyYW5zcGFyZW50IHN1YmxheWVycyBpbiBsYXllcnNBLCBvciAwXG4gICAgICogb3RoZXJ3aXNlLlxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgc29ydFRyYW5zcGFyZW50TGF5ZXJzKGxheWVyc0EsIGxheWVyc0IpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3NvcnRMYXllcnNEZXNjZW5kaW5nKGxheWVyc0EsIGxheWVyc0IsIHRoaXMuX3RyYW5zcGFyZW50T3JkZXIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFVzZWQgdG8gZGV0ZXJtaW5lIHdoaWNoIGFycmF5IG9mIGxheWVycyBoYXMgYW55IG9wYXF1ZSBzdWJsYXllciB0aGF0IGlzIG9uIHRvcCBvZiBhbGwgdGhlXG4gICAgICogb3BhcXVlIHN1YmxheWVycyBpbiB0aGUgb3RoZXIgYXJyYXkuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge251bWJlcltdfSBsYXllcnNBIC0gSURzIG9mIGxheWVycy5cbiAgICAgKiBAcGFyYW0ge251bWJlcltdfSBsYXllcnNCIC0gSURzIG9mIGxheWVycy5cbiAgICAgKiBAcmV0dXJucyB7bnVtYmVyfSBSZXR1cm5zIGEgbmVnYXRpdmUgbnVtYmVyIGlmIGFueSBvZiB0aGUgb3BhcXVlIHN1YmxheWVycyBpbiBsYXllcnNBIGlzIG9uXG4gICAgICogdG9wIG9mIGFsbCB0aGUgb3BhcXVlIHN1YmxheWVycyBpbiBsYXllcnNCLCBvciBhIHBvc2l0aXZlIG51bWJlciBpZiBhbnkgb2YgdGhlIG9wYXF1ZVxuICAgICAqIHN1YmxheWVycyBpbiBsYXllcnNCIGlzIG9uIHRvcCBvZiBhbGwgdGhlIG9wYXF1ZSBzdWJsYXllcnMgaW4gbGF5ZXJzQSwgb3IgMCBvdGhlcndpc2UuXG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBzb3J0T3BhcXVlTGF5ZXJzKGxheWVyc0EsIGxheWVyc0IpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3NvcnRMYXllcnNEZXNjZW5kaW5nKGxheWVyc0EsIGxheWVyc0IsIHRoaXMuX29wYXF1ZU9yZGVyKTtcbiAgICB9XG59XG5cbmV4cG9ydCB7IExheWVyQ29tcG9zaXRpb24gfTtcbiJdLCJuYW1lcyI6WyJMYXllckNvbXBvc2l0aW9uIiwiRXZlbnRIYW5kbGVyIiwiY29uc3RydWN0b3IiLCJuYW1lIiwibGF5ZXJMaXN0IiwibGF5ZXJJZE1hcCIsIk1hcCIsImxheWVyTmFtZU1hcCIsInN1YkxheWVyTGlzdCIsInN1YkxheWVyRW5hYmxlZCIsImNhbWVyYXMiLCJfcmVuZGVyQWN0aW9ucyIsIl9vcGFxdWVPcmRlciIsIl90cmFuc3BhcmVudE9yZGVyIiwiX2RpcnR5Q2FtZXJhcyIsImRlc3Ryb3kiLCJmb3JFYWNoIiwicmEiLCJfdXBkYXRlIiwibGVuIiwibGVuZ3RoIiwiaSIsImxheWVyIiwiaiIsImNhbWVyYSIsImluZGV4IiwiaW5kZXhPZiIsInB1c2giLCJzb3J0UHJpb3JpdHkiLCJyZW5kZXJBY3Rpb25Db3VudCIsImNhbWVyYUZpcnN0UmVuZGVyQWN0aW9uIiwiY2FtZXJhRmlyc3RSZW5kZXJBY3Rpb25JbmRleCIsImxhc3RSZW5kZXJBY3Rpb24iLCJwb3N0UHJvY2Vzc01hcmtlZCIsImlzTGF5ZXJFbmFibGVkIiwibGF5ZXJzIiwiaWQiLCJkaXNhYmxlUG9zdEVmZmVjdHNMYXllciIsInRyaWdnZXJQb3N0cHJvY2VzcyIsImNhbWVyYUluZGV4IiwiYWRkUmVuZGVyQWN0aW9uIiwibGFzdENhbWVyYVVzZSIsInJlbmRlclRhcmdldCIsInBvc3RFZmZlY3RzRW5hYmxlZCIsInByb3BhZ2F0ZVJlbmRlclRhcmdldCIsIl9sb2dSZW5kZXJBY3Rpb25zIiwicmVuZGVyQWN0aW9ucyIsInJlbmRlckFjdGlvbkluZGV4IiwibGF5ZXJJbmRleCIsInJlbmRlckFjdGlvbiIsIlJlbmRlckFjdGlvbiIsInJ0IiwiTEFZRVJJRF9ERVBUSCIsInVzZWQiLCJuZWVkc0NsZWFyIiwiY2xlYXJDb2xvciIsImNsZWFyQ29sb3JCdWZmZXIiLCJjbGVhckRlcHRoIiwiY2xlYXJEZXB0aEJ1ZmZlciIsImNsZWFyU3RlbmNpbCIsImNsZWFyU3RlbmNpbEJ1ZmZlciIsImZpcnN0Q2FtZXJhVXNlIiwic3RhcnRJbmRleCIsImZyb21DYW1lcmEiLCJhIiwidGhpc0NhbWVyYSIsInJlY3QiLCJlcXVhbHMiLCJzY2lzc29yUmVjdCIsIlRyYWNpbmciLCJnZXQiLCJUUkFDRUlEX1JFTkRFUl9BQ1RJT04iLCJEZWJ1ZyIsInRyYWNlIiwiZW5hYmxlZCIsInRyYW5zcGFyZW50IiwiY2xlYXIiLCJlbnRpdHkiLCJwYWRFbmQiLCJfaXNMYXllckFkZGVkIiwiZm91bmQiLCJhc3NlcnQiLCJfaXNTdWJsYXllckFkZGVkIiwiZXJyb3IiLCJfdXBkYXRlTGF5ZXJNYXBzIiwiZmlyZSIsImluc2VydCIsInNwbGljZSIsImNvdW50IiwiX3VwZGF0ZU9wYXF1ZU9yZGVyIiwiX3VwZGF0ZVRyYW5zcGFyZW50T3JkZXIiLCJyZW1vdmUiLCJwdXNoT3BhcXVlIiwiaW5zZXJ0T3BhcXVlIiwicmVtb3ZlT3BhcXVlIiwicHVzaFRyYW5zcGFyZW50IiwiaW5zZXJ0VHJhbnNwYXJlbnQiLCJyZW1vdmVUcmFuc3BhcmVudCIsIl9nZXRTdWJsYXllckluZGV4IiwiZ2V0T3BhcXVlSW5kZXgiLCJnZXRUcmFuc3BhcmVudEluZGV4Iiwic2V0IiwiZ2V0TGF5ZXJCeUlkIiwiX3RoaXMkbGF5ZXJJZE1hcCRnZXQiLCJnZXRMYXllckJ5TmFtZSIsIl90aGlzJGxheWVyTmFtZU1hcCRnZSIsImVuZEluZGV4IiwiX3NvcnRMYXllcnNEZXNjZW5kaW5nIiwibGF5ZXJzQSIsImxheWVyc0IiLCJvcmRlciIsInRvcExheWVyQSIsInRvcExheWVyQiIsImhhc093blByb3BlcnR5IiwiTWF0aCIsIm1heCIsInNvcnRUcmFuc3BhcmVudExheWVycyIsInNvcnRPcGFxdWVMYXllcnMiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7O0FBUUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxNQUFNQSxnQkFBZ0IsU0FBU0MsWUFBWSxDQUFDO0FBNER4QztBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDSUMsRUFBQUEsV0FBV0EsQ0FBQ0MsSUFBSSxHQUFHLFVBQVUsRUFBRTtBQUMzQixJQUFBLEtBQUssRUFBRSxDQUFBO0FBbEVYO0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtJQUpJLElBS0FDLENBQUFBLFNBQVMsR0FBRyxFQUFFLENBQUE7QUFFZDtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFMSSxJQUFBLElBQUEsQ0FNQUMsVUFBVSxHQUFHLElBQUlDLEdBQUcsRUFBRSxDQUFBO0FBRXRCO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUxJLElBQUEsSUFBQSxDQU1BQyxZQUFZLEdBQUcsSUFBSUQsR0FBRyxFQUFFLENBQUE7QUFFeEI7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7SUFOSSxJQU9BRSxDQUFBQSxZQUFZLEdBQUcsRUFBRSxDQUFBO0FBRWpCO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtJQUxJLElBTUFDLENBQUFBLGVBQWUsR0FBRyxFQUFFLENBQUE7QUFBRTtBQUV0QjtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtJQU5JLElBT0FDLENBQUFBLE9BQU8sR0FBRyxFQUFFLENBQUE7QUFFWjtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7SUFMSSxJQU1BQyxDQUFBQSxjQUFjLEdBQUcsRUFBRSxDQUFBO0lBV2YsSUFBSSxDQUFDUixJQUFJLEdB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
