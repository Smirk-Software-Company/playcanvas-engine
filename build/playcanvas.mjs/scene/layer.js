import { Debug } from '../core/debug.js';
import { hash32Fnv1a } from '../core/hash.js';
import { SORTMODE_MATERIALMESH, SORTMODE_BACK2FRONT, SHADER_FORWARD, LIGHTTYPE_DIRECTIONAL, LAYER_FX, SORTMODE_NONE, SORTMODE_CUSTOM, SORTMODE_FRONT2BACK, SORTKEY_FORWARD } from './constants.js';
import { Material } from './materials/material.js';

function sortManual(drawCallA, drawCallB) {
  return drawCallA.drawOrder - drawCallB.drawOrder;
}
function sortMaterialMesh(drawCallA, drawCallB) {
  const keyA = drawCallA._key[SORTKEY_FORWARD];
  const keyB = drawCallB._key[SORTKEY_FORWARD];
  if (keyA === keyB && drawCallA.mesh && drawCallB.mesh) {
    return drawCallB.mesh.id - drawCallA.mesh.id;
  }
  return keyB - keyA;
}
function sortBackToFront(drawCallA, drawCallB) {
  return drawCallB.zdist - drawCallA.zdist;
}
function sortFrontToBack(drawCallA, drawCallB) {
  return drawCallA.zdist - drawCallB.zdist;
}
const sortCallbacks = [null, sortManual, sortMaterialMesh, sortBackToFront, sortFrontToBack];

// Layers
let layerCounter = 0;
const lightKeys = [];
const _tempMaterials = new Set();
class CulledInstances {
  constructor() {
    /**
     * Visible opaque mesh instances.
     *
     * @type {import('./mesh-instance.js').MeshInstance[]}
     */
    this.opaque = [];
    /**
     * Visible transparent mesh instances.
     *
     * @type {import('./mesh-instance.js').MeshInstance[]}
     */
    this.transparent = [];
  }
}

/**
 * A Layer represents a renderable subset of the scene. It can contain a list of mesh instances,
 * lights and cameras, their render settings and also defines custom callbacks before, after or
 * during rendering. Layers are organized inside {@link LayerComposition} in a desired order.
 *
 * @category Graphics
 */
class Layer {
  /**
   * Create a new Layer instance.
   *
   * @param {object} options - Object for passing optional arguments. These arguments are the
   * same as properties of the Layer.
   */
  constructor(options = {}) {
    var _options$enabled, _options$opaqueSortMo, _options$transparentS, _options$shaderPass;
    /**
     * Mesh instances assigned to this layer.
     *
     * @type {import('./mesh-instance.js').MeshInstance[]}
     * @ignore
     */
    this.meshInstances = [];
    /**
     * Mesh instances assigned to this layer, stored in a set.
     *
     * @type {Set<import('./mesh-instance.js').MeshInstance>}
     * @ignore
     */
    this.meshInstancesSet = new Set();
    /**
     * Shadow casting instances assigned to this layer.
     *
     * @type {import('./mesh-instance.js').MeshInstance[]}
     * @ignore
     */
    this.shadowCasters = [];
    /**
     * Shadow casting instances assigned to this layer, stored in a set.
     *
     * @type {Set<import('./mesh-instance.js').MeshInstance>}
     * @ignore
     */
    this.shadowCastersSet = new Set();
    /**
     * Visible (culled) mesh instances assigned to this layer. Looked up by the Camera.
     *
     * @type {WeakMap<import('./camera.js').Camera, CulledInstances>}
     * @private
     */
    this._visibleInstances = new WeakMap();
    /**
     * All lights assigned to a layer.
     *
     * @type {import('./light.js').Light[]}
     * @private
     */
    this._lights = [];
    /**
     * All lights assigned to a layer stored in a set.
     *
     * @type {Set<import('./light.js').Light>}
     * @private
     */
    this._lightsSet = new Set();
    /**
     * Set of light used by clustered lighting (omni and spot, but no directional).
     *
     * @type {Set<import('./light.js').Light>}
     * @private
     */
    this._clusteredLightsSet = new Set();
    /**
     * Lights separated by light type. Lights in the individual arrays are sorted by the key,
     * to match their order in _lightIdHash, so that their order matches the order expected by the
     * generated shader code.
     *
     * @type {import('./light.js').Light[][]}
     * @private
     */
    this._splitLights = [[], [], []];
    /**
     * True if _splitLights needs to be updated, which means if lights were added or removed from
     * the layer, or their key changed.
     *
     * @type {boolean}
     * @private
     */
    this._splitLightsDirty = true;
    /**
     * True if the objects rendered on the layer require light cube (emitters with lighting do).
     *
     * @type {boolean}
     */
    this.requiresLightCube = false;
    if (options.id !== undefined) {
      /**
       * A unique ID of the layer. Layer IDs are stored inside {@link ModelComponent#layers},
       * {@link RenderComponent#layers}, {@link CameraComponent#layers},
       * {@link LightComponent#layers} and {@link ElementComponent#layers} instead of names.
       * Can be used in {@link LayerComposition#getLayerById}.
       *
       * @type {number}
       */
      this.id = options.id;
      layerCounter = Math.max(this.id + 1, layerCounter);
    } else {
      this.id = layerCounter++;
    }

    /**
     * Name of the layer. Can be used in {@link LayerComposition#getLayerByName}.
     *
     * @type {string}
     */
    this.name = options.name;

    /**
     * @type {boolean}
     * @private
     */
    this._enabled = (_options$enabled = options.enabled) != null ? _options$enabled : true;
    /**
     * @type {number}
     * @private
     */
    this._refCounter = this._enabled ? 1 : 0;

    /**
     * Defines the method used for sorting opaque (that is, not semi-transparent) mesh
     * instances before rendering. Can be:
     *
     * - {@link SORTMODE_NONE}
     * - {@link SORTMODE_MANUAL}
     * - {@link SORTMODE_MATERIALMESH}
     * - {@link SORTMODE_BACK2FRONT}
     * - {@link SORTMODE_FRONT2BACK}
     *
     * Defaults to {@link SORTMODE_MATERIALMESH}.
     *
     * @type {number}
     */
    this.opaqueSortMode = (_options$opaqueSortMo = options.opaqueSortMode) != null ? _options$opaqueSortMo : SORTMODE_MATERIALMESH;

    /**
     * Defines the method used for sorting semi-transparent mesh instances before rendering. Can be:
     *
     * - {@link SORTMODE_NONE}
     * - {@link SORTMODE_MANUAL}
     * - {@link SORTMODE_MATERIALMESH}
     * - {@link SORTMODE_BACK2FRONT}
     * - {@link SORTMODE_FRONT2BACK}
     *
     * Defaults to {@link SORTMODE_BACK2FRONT}.
     *
     * @type {number}
     */
    this.transparentSortMode = (_options$transparentS = options.transparentSortMode) != null ? _options$transparentS : SORTMODE_BACK2FRONT;
    if (options.renderTarget) {
      this.renderTarget = options.renderTarget;
    }

    /**
     * A type of shader to use during rendering. Possible values are:
     *
     * - {@link SHADER_FORWARD}
     * - {@link SHADER_FORWARDHDR}
     * - {@link SHADER_DEPTH}
     * - Your own custom value. Should be in 19 - 31 range. Use {@link StandardMaterial#onUpdateShader}
     * to apply shader modifications based on this value.
     *
     * Defaults to {@link SHADER_FORWARD}.
     *
     * @type {number}
     */
    this.shaderPass = (_options$shaderPass = options.shaderPass) != null ? _options$shaderPass : SHADER_FORWARD;

    // clear flags
    /**
     * @type {boolean}
     * @private
     */
    this._clearColorBuffer = !!options.clearColorBuffer;

    /**
     * @type {boolean}
     * @private
     */
    this._clearDepthBuffer = !!options.clearDepthBuffer;

    /**
     * @type {boolean}
     * @private
     */
    this._clearStencilBuffer = !!options.clearStencilBuffer;

    /**
     * Custom function that is called before visibility culling is performed for this layer.
     * Useful, for example, if you want to modify camera projection while still using the same
     * camera and make frustum culling work correctly with it (see
     * {@link CameraComponent#calculateTransform} and {@link CameraComponent#calculateProjection}).
     * This function will receive camera index as the only argument. You can get the actual
     * camera being used by looking up {@link LayerComposition#cameras} with this index.
     *
     * @type {Function}
     */
    this.onPreCull = options.onPreCull;
    /**
     * Custom function that is called before this layer is rendered. Useful, for example, for
     * reacting on screen size changes. This function is called before the first occurrence of
     * this layer in {@link LayerComposition}. It will receive camera index as the only
     * argument. You can get the actual camera being used by looking up
     * {@link LayerComposition#cameras} with this index.
     *
     * @type {Function}
     */
    this.onPreRender = options.onPreRender;
    /**
     * Custom function that is called before opaque mesh instances (not semi-transparent) in
     * this layer are rendered. This function will receive camera index as the only argument.
     * You can get the actual camera being used by looking up {@link LayerComposition#cameras}
     * with this index.
     *
     * @type {Function}
     */
    this.onPreRenderOpaque = options.onPreRenderOpaque;
    /**
     * Custom function that is called before semi-transparent mesh instances in this layer are
     * rendered. This function will receive camera index as the only argument. You can get the
     * actual camera being used by looking up {@link LayerComposition#cameras} with this index.
     *
     * @type {Function}
     */
    this.onPreRenderTransparent = options.onPreRenderTransparent;

    /**
     * Custom function that is called after visibility culling is performed for this layer.
     * Useful for reverting changes done in {@link Layer#onPreCull} and determining final mesh
     * instance visibility (see {@link MeshInstance#visibleThisFrame}). This function will
     * receive camera index as the only argument. You can get the actual camera being used by
     * looking up {@link LayerComposition#cameras} with this index.
     *
     * @type {Function}
     */
    this.onPostCull = options.onPostCull;
    /**
     * Custom function that is called after this layer is rendered. Useful to revert changes
     * made in {@link Layer#onPreRender}. This function is called after the last occurrence of this
     * layer in {@link LayerComposition}. It will receive camera index as the only argument.
     * You can get the actual camera being used by looking up {@link LayerComposition#cameras}
     * with this index.
     *
     * @type {Function}
     */
    this.onPostRender = options.onPostRender;
    /**
     * Custom function that is called after opaque mesh instances (not semi-transparent) in
     * this layer are rendered. This function will receive camera index as the only argument.
     * You can get the actual camera being used by looking up {@link LayerComposition#cameras}
     * with this index.
     *
     * @type {Function}
     */
    this.onPostRenderOpaque = options.onPostRenderOpaque;
    /**
     * Custom function that is called after semi-transparent mesh instances in this layer are
     * rendered. This function will receive camera index as the only argument. You can get the
     * actual camera being used by looking up {@link LayerComposition#cameras} with this index.
     *
     * @type {Function}
     */
    this.onPostRenderTransparent = options.onPostRenderTransparent;

    /**
     * Custom function that is called before every mesh instance in this layer is rendered. It
     * is not recommended to set this function when rendering many objects every frame due to
     * performance reasons.
     *
     * @type {Function}
     */
    this.onDrawCall = options.onDrawCall;
    /**
     * Custom function that is called after the layer has been enabled. This happens when:
     *
     * - The layer is created with {@link Layer#enabled} set to true (which is the default value).
     * - {@link Layer#enabled} was changed from false to true
     * - {@link Layer#incrementCounter} was called and incremented the counter above zero.
     *
     * Useful for allocating resources this layer will use (e.g. creating render targets).
     *
     * @type {Function}
     */
    this.onEnable = options.onEnable;
    /**
     * Custom function that is called after the layer has been disabled. This happens when:
     *
     * - {@link Layer#enabled} was changed from true to false
     * - {@link Layer#decrementCounter} was called and set the counter to zero.
     *
     * @type {Function}
     */
    this.onDisable = options.onDisable;
    if (this._enabled && this.onEnable) {
      this.onEnable();
    }

    /**
     * Make this layer render the same mesh instances that another layer does instead of having
     * its own mesh instance list. Both layers must share cameras. Frustum culling is only
     * performed for one layer. Useful for rendering multiple passes using different shaders.
     *
     * @type {Layer}
     */
    this.layerReference = options.layerReference; // should use the same camera

    /**
     * @type {Function|null}
     * @ignore
     */
    this.customSortCallback = null;
    /**
     * @type {Function|null}
     * @ignore
     */
    this.customCalculateSortValues = null;

    /**
     * @type {import('../framework/components/camera/component.js').CameraComponent[]}
     * @ignore
     */
    this.cameras = [];
    this._dirtyCameras = false;

    // light hash based on the light keys
    this._lightHash = 0;
    this._lightHashDirty = false;

    // light hash based on light ids
    this._lightIdHash = 0;
    this._lightIdHashDirty = false;
    this.skipRenderAfter = Number.MAX_VALUE;
    this._skipRenderCounter = 0;
    this._renderTime = 0;
    this._forwardDrawCalls = 0;
    this._shadowDrawCalls = 0; // deprecated, not useful on a layer anymore, could be moved to camera

    this._shaderVersion = -1;
  }

  /**
   * Enable the layer. Disabled layers are skipped. Defaults to true.
   *
   * @type {boolean}
   */
  set enabled(val) {
    if (val !== this._enabled) {
      this._enabled = val;
      if (val) {
        this.incrementCounter();
        if (this.onEnable) this.onEnable();
      } else {
        this.decrementCounter();
        if (this.onDisable) this.onDisable();
      }
    }
  }
  get enabled() {
    return this._enabled;
  }

  /**
   * If true, the camera will clear the color buffer when it renders this layer.
   *
   * @type {boolean}
   */
  set clearColorBuffer(val) {
    this._clearColorBuffer = val;
    this._dirtyCameras = true;
  }
  get clearColorBuffer() {
    return this._clearColorBuffer;
  }

  /**
   * If true, the camera will clear the depth buffer when it renders this layer.
   *
   * @type {boolean}
   */
  set clearDepthBuffer(val) {
    this._clearDepthBuffer = val;
    this._dirtyCameras = true;
  }
  get clearDepthBuffer() {
    return this._clearDepthBuffer;
  }

  /**
   * If true, the camera will clear the stencil buffer when it renders this layer.
   *
   * @type {boolean}
   */
  set clearStencilBuffer(val) {
    this._clearStencilBuffer = val;
    this._dirtyCameras = true;
  }
  get clearStencilBuffer() {
    return this._clearStencilBuffer;
  }

  /**
   * True if the layer contains omni or spot lights
   *
   * @type {boolean}
   * @ignore
   */
  get hasClusteredLights() {
    return this._clusteredLightsSet.size > 0;
  }

  /**
   * Returns lights used by clustered lighting in a set.
   *
   * @type {Set<import('./light.js').Light>}
   * @ignore
   */
  get clusteredLightsSet() {
    return this._clusteredLightsSet;
  }

  /**
   * Increments the usage counter of this layer. By default, layers are created with counter set
   * to 1 (if {@link Layer.enabled} is true) or 0 (if it was false). Incrementing the counter
   * from 0 to 1 will enable the layer and call {@link Layer.onEnable}. Use this function to
   * "subscribe" multiple effects to the same layer. For example, if the layer is used to render
   * a reflection texture which is used by 2 mirrors, then each mirror can call this function
   * when visible and {@link Layer.decrementCounter} if invisible. In such case the reflection
   * texture won't be updated, when there is nothing to use it, saving performance.
   *
   * @ignore
   */
  incrementCounter() {
    if (this._refCounter === 0) {
      this._enabled = true;
      if (this.onEnable) this.onEnable();
    }
    this._refCounter++;
  }

  /**
   * Decrements the usage counter of this layer. Decrementing the counter from 1 to 0 will
   * disable the layer and call {@link Layer.onDisable}. See {@link Layer#incrementCounter} for
   * more details.
   *
   * @ignore
   */
  decrementCounter() {
    if (this._refCounter === 1) {
      this._enabled = false;
      if (this.onDisable) this.onDisable();
    } else if (this._refCounter === 0) {
      Debug.warn('Trying to decrement layer counter below 0');
      return;
    }
    this._refCounter--;
  }

  /**
   * Adds an array of mesh instances to this layer.
   *
   * @param {import('./mesh-instance.js').MeshInstance[]} meshInstances - Array of
   * {@link MeshInstance}.
   * @param {boolean} [skipShadowCasters] - Set it to true if you don't want these mesh instances
   * to cast shadows in this layer. Defaults to false.
   */
  addMeshInstances(meshInstances, skipShadowCasters) {
    const destMeshInstances = this.meshInstances;
    const destMeshInstancesSet = this.meshInstancesSet;

    // add mesh instances to the layer's array and the set
    for (let i = 0; i < meshInstances.length; i++) {
      const mi = meshInstances[i];
      if (!destMeshInstancesSet.has(mi)) {
        destMeshInstances.push(mi);
        destMeshInstancesSet.add(mi);
        _tempMaterials.add(mi.material);
      }
    }

    // shadow casters
    if (!skipShadowCasters) {
      this.addShadowCasters(meshInstances);
    }

    // clear old shader variants if necessary
    if (_tempMaterials.size > 0) {
      const sceneShaderVer = this._shaderVersion;
      _tempMaterials.forEach(mat => {
        if (sceneShaderVer >= 0 && mat._shaderVersion !== sceneShaderVer) {
          // skip this for materials not using variants
          if (mat.getShaderVariant !== Material.prototype.getShaderVariant) {
            // clear shader variants on the material and also on mesh instances that use it
            mat.clearVariants();
          }
          mat._shaderVersion = sceneShaderVer;
        }
      });
      _tempMaterials.clear();
    }
  }

  /**
   * Removes multiple mesh instances from this layer.
   *
   * @param {import('./mesh-instance.js').MeshInstance[]} meshInstances - Array of
   * {@link MeshInstance}. If they were added to this layer, they will be removed.
   * @param {boolean} [skipShadowCasters] - Set it to true if you want to still cast shadows from
   * removed mesh instances or if they never did cast shadows before. Defaults to false.
   */
  removeMeshInstances(meshInstances, skipShadowCasters) {
    const destMeshInstances = this.meshInstances;
    const destMeshInstancesSet = this.meshInstancesSet;

    // mesh instances
    for (let i = 0; i < meshInstances.length; i++) {
      const mi = meshInstances[i];

      // remove from mesh instances list
      if (destMeshInstancesSet.has(mi)) {
        destMeshInstancesSet.delete(mi);
        const j = destMeshInstances.indexOf(mi);
        if (j >= 0) {
          destMeshInstances.splice(j, 1);
        }
      }
    }

    // shadow casters
    if (!skipShadowCasters) {
      this.removeShadowCasters(meshInstances);
    }
  }

  /**
   * Adds an array of mesh instances to this layer, but only as shadow casters (they will not be
   * rendered anywhere, but only cast shadows on other objects).
   *
   * @param {import('./mesh-instance.js').MeshInstance[]} meshInstances - Array of
   * {@link MeshInstance}.
   */
  addShadowCasters(meshInstances) {
    const shadowCasters = this.shadowCasters;
    const shadowCastersSet = this.shadowCastersSet;
    for (let i = 0; i < meshInstances.length; i++) {
      const mi = meshInstances[i];
      if (mi.castShadow && !shadowCastersSet.has(mi)) {
        shadowCastersSet.add(mi);
        shadowCasters.push(mi);
      }
    }
  }

  /**
   * Removes multiple mesh instances from the shadow casters list of this layer, meaning they
   * will stop casting shadows.
   *
   * @param {import('./mesh-instance.js').MeshInstance[]} meshInstances - Array of
   * {@link MeshInstance}. If they were added to this layer, they will be removed.
   */
  removeShadowCasters(meshInstances) {
    const shadowCasters = this.shadowCasters;
    const shadowCastersSet = this.shadowCastersSet;
    for (let i = 0; i < meshInstances.length; i++) {
      const mi = meshInstances[i];
      if (shadowCastersSet.has(mi)) {
        shadowCastersSet.delete(mi);
        const j = shadowCasters.indexOf(mi);
        if (j >= 0) {
          shadowCasters.splice(j, 1);
        }
      }
    }
  }

  /**
   * Removes all mesh instances from this layer.
   *
   * @param {boolean} [skipShadowCasters] - Set it to true if you want to continue the existing mesh
   * instances to cast shadows. Defaults to false, which removes shadow casters as well.
   */
  clearMeshInstances(skipShadowCasters = false) {
    this.meshInstances.length = 0;
    this.meshInstancesSet.clear();
    if (!skipShadowCasters) {
      this.shadowCasters.length = 0;
      this.shadowCastersSet.clear();
    }
  }
  markLightsDirty() {
    this._lightHashDirty = true;
    this._lightIdHashDirty = true;
    this._splitLightsDirty = true;
  }

  /**
   * Adds a light to this layer.
   *
   * @param {import('../framework/components/light/component.js').LightComponent} light - A
   * {@link LightComponent}.
   */
  addLight(light) {
    // if the light is not in the layer already
    const l = light.light;
    if (!this._lightsSet.has(l)) {
      this._lightsSet.add(l);
      this._lights.push(l);
      this.markLightsDirty();
    }
    if (l.type !== LIGHTTYPE_DIRECTIONAL) {
      this._clusteredLightsSet.add(l);
    }
  }

  /**
   * Removes a light from this layer.
   *
   * @param {import('../framework/components/light/component.js').LightComponent} light - A
   * {@link LightComponent}.
   */
  removeLight(light) {
    const l = light.light;
    if (this._lightsSet.has(l)) {
      this._lightsSet.delete(l);
      this._lights.splice(this._lights.indexOf(l), 1);
      this.markLightsDirty();
    }
    if (l.type !== LIGHTTYPE_DIRECTIONAL) {
      this._clusteredLightsSet.delete(l);
    }
  }

  /**
   * Removes all lights from this layer.
   */
  clearLights() {
    // notify lights
    this._lightsSet.forEach(light => light.removeLayer(this));
    this._lightsSet.clear();
    this._clusteredLightsSet.clear();
    this._lights.length = 0;
    this.markLightsDirty();
  }
  get splitLights() {
    if (this._splitLightsDirty) {
      this._splitLightsDirty = false;
      const splitLights = this._splitLights;
      for (let i = 0; i < splitLights.length; i++) splitLights[i].length = 0;
      const lights = this._lights;
      for (let i = 0; i < lights.length; i++) {
        const light = lights[i];
        if (light.enabled) {
          splitLights[light._type].push(light);
        }
      }

      // sort the lights by their key, as the order of lights is used to generate shader generation key,
      // and this avoids new shaders being generated when lights are reordered
      for (let i = 0; i < splitLights.length; i++) splitLights[i].sort((a, b) => a.key - b.key);
    }
    return this._splitLights;
  }
  evaluateLightHash(localLights, directionalLights, useIds) {
    let hash = 0;

    // select local/directional lights based on request
    const lights = this._lights;
    for (let i = 0; i < lights.length; i++) {
      const isLocalLight = lights[i].type !== LIGHTTYPE_DIRECTIONAL;
      if (localLights && isLocalLight || directionalLights && !isLocalLight) {
        lightKeys.push(useIds ? lights[i].id : lights[i].key);
      }
    }
    if (lightKeys.length > 0) {
      // sort the keys to make sure the hash is the same for the same set of lights
      lightKeys.sort();
      hash = hash32Fnv1a(lightKeys);
      lightKeys.length = 0;
    }
    return hash;
  }
  getLightHash(isClustered) {
    if (this._lightHashDirty) {
      this._lightHashDirty = false;

      // Generate hash to check if layers have the same set of lights independent of their order.
      // Always use directional lights. Additionally use local lights if clustered lighting is disabled.
      // (only directional lights affect the shader generation for clustered lighting)
      this._lightHash = this.evaluateLightHash(!isClustered, true, false);
    }
    return this._lightHash;
  }

  // This is only used in clustered lighting mode
  getLightIdHash() {
    if (this._lightIdHashDirty) {
      this._lightIdHashDirty = false;

      // Generate hash based on Ids of lights sorted by ids, to check if the layers have the same set of lights
      // Only use local lights (directional lights are not used for clustered lighting)
      this._lightIdHash = this.evaluateLightHash(true, false, true);
    }
    return this._lightIdHash;
  }

  /**
   * Adds a camera to this layer.
   *
   * @param {import('../framework/components/camera/component.js').CameraComponent} camera - A
   * {@link CameraComponent}.
   */
  addCamera(camera) {
    if (this.cameras.indexOf(camera) >= 0) return;
    this.cameras.push(camera);
    this._dirtyCameras = true;
  }

  /**
   * Removes a camera from this layer.
   *
   * @param {import('../framework/components/camera/component.js').CameraComponent} camera - A
   * {@link CameraComponent}.
   */
  removeCamera(camera) {
    const index = this.cameras.indexOf(camera);
    if (index >= 0) {
      this.cameras.splice(index, 1);
      this._dirtyCameras = true;
    }
  }

  /**
   * Removes all cameras from this layer.
   */
  clearCameras() {
    this.cameras.length = 0;
    this._dirtyCameras = true;
  }

  /**
   * @param {import('./mesh-instance.js').MeshInstance[]} drawCalls - Array of mesh instances.
   * @param {number} drawCallsCount - Number of mesh instances.
   * @param {import('../core/math/vec3.js').Vec3} camPos - Camera position.
   * @param {import('../core/math/vec3.js').Vec3} camFwd - Camera forward vector.
   * @private
   */
  _calculateSortDistances(drawCalls, drawCallsCount, camPos, camFwd) {
    for (let i = 0; i < drawCallsCount; i++) {
      const drawCall = drawCalls[i];
      if (drawCall.layer <= LAYER_FX) continue; // Only alpha sort mesh instances in the main world (backwards comp)
      if (drawCall.calculateSortDistance) {
        drawCall.zdist = drawCall.calculateSortDistance(drawCall, camPos, camFwd);
        continue;
      }
      const meshPos = drawCall.aabb.center;
      const tempx = meshPos.x - camPos.x;
      const tempy = meshPos.y - camPos.y;
      const tempz = meshPos.z - camPos.z;
      drawCall.zdist = tempx * camFwd.x + tempy * camFwd.y + tempz * camFwd.z;
    }
  }

  /**
   * Get access to culled mesh instances for the provided camera.
   *
   * @param {import('./camera.js').Camera} camera - The camera.
   * @returns {CulledInstances} The culled mesh instances.
   * @ignore
   */
  getCulledInstances(camera) {
    let instances = this._visibleInstances.get(camera);
    if (!instances) {
      instances = new CulledInstances();
      this._visibleInstances.set(camera, instances);
    }
    return instances;
  }

  /**
   * @param {import('./camera.js').Camera} camera - The camera to sort the visible mesh instances
   * for.
   * @param {boolean} transparent - True if transparent sorting should be used.
   * @ignore
   */
  sortVisible(camera, transparent) {
    const sortMode = transparent ? this.transparentSortMode : this.opaqueSortMode;
    if (sortMode === SORTMODE_NONE) return;
    const culledInstances = this.getCulledInstances(camera);
    const instances = transparent ? culledInstances.transparent : culledInstances.opaque;
    const cameraNode = camera.node;
    if (sortMode === SORTMODE_CUSTOM) {
      const sortPos = cameraNode.getPosition();
      const sortDir = cameraNode.forward;
      if (this.customCalculateSortValues) {
        this.customCalculateSortValues(instances, instances.length, sortPos, sortDir);
      }
      if (this.customSortCallback) {
        instances.sort(this.customSortCallback);
      }
    } else {
      if (sortMode === SORTMODE_BACK2FRONT || sortMode === SORTMODE_FRONT2BACK) {
        const sortPos = cameraNode.getPosition();
        const sortDir = cameraNode.forward;
        this._calculateSortDistances(instances, instances.length, sortPos, sortDir);
      }
      instances.sort(sortCallbacks[sortMode]);
    }
  }
}

export { CulledInstances, Layer };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGF5ZXIuanMiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9zY2VuZS9sYXllci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBEZWJ1ZyB9IGZyb20gJy4uL2NvcmUvZGVidWcuanMnO1xuaW1wb3J0IHsgaGFzaDMyRm52MWEgfSBmcm9tICcuLi9jb3JlL2hhc2guanMnO1xuXG5pbXBvcnQge1xuICAgIExJR0hUVFlQRV9ESVJFQ1RJT05BTCxcbiAgICBMQVlFUl9GWCxcbiAgICBTSEFERVJfRk9SV0FSRCxcbiAgICBTT1JUS0VZX0ZPUldBUkQsXG4gICAgU09SVE1PREVfQkFDSzJGUk9OVCwgU09SVE1PREVfQ1VTVE9NLCBTT1JUTU9ERV9GUk9OVDJCQUNLLCBTT1JUTU9ERV9NQVRFUklBTE1FU0gsIFNPUlRNT0RFX05PTkVcbn0gZnJvbSAnLi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgTWF0ZXJpYWwgfSBmcm9tICcuL21hdGVyaWFscy9tYXRlcmlhbC5qcyc7XG5cbmZ1bmN0aW9uIHNvcnRNYW51YWwoZHJhd0NhbGxBLCBkcmF3Q2FsbEIpIHtcbiAgICByZXR1cm4gZHJhd0NhbGxBLmRyYXdPcmRlciAtIGRyYXdDYWxsQi5kcmF3T3JkZXI7XG59XG5cbmZ1bmN0aW9uIHNvcnRNYXRlcmlhbE1lc2goZHJhd0NhbGxBLCBkcmF3Q2FsbEIpIHtcbiAgICBjb25zdCBrZXlBID0gZHJhd0NhbGxBLl9rZXlbU09SVEtFWV9GT1JXQVJEXTtcbiAgICBjb25zdCBrZXlCID0gZHJhd0NhbGxCLl9rZXlbU09SVEtFWV9GT1JXQVJEXTtcbiAgICBpZiAoa2V5QSA9PT0ga2V5QiAmJiBkcmF3Q2FsbEEubWVzaCAmJiBkcmF3Q2FsbEIubWVzaCkge1xuICAgICAgICByZXR1cm4gZHJhd0NhbGxCLm1lc2guaWQgLSBkcmF3Q2FsbEEubWVzaC5pZDtcbiAgICB9XG4gICAgcmV0dXJuIGtleUIgLSBrZXlBO1xufVxuXG5mdW5jdGlvbiBzb3J0QmFja1RvRnJvbnQoZHJhd0NhbGxBLCBkcmF3Q2FsbEIpIHtcbiAgICByZXR1cm4gZHJhd0NhbGxCLnpkaXN0IC0gZHJhd0NhbGxBLnpkaXN0O1xufVxuXG5mdW5jdGlvbiBzb3J0RnJvbnRUb0JhY2soZHJhd0NhbGxBLCBkcmF3Q2FsbEIpIHtcbiAgICByZXR1cm4gZHJhd0NhbGxBLnpkaXN0IC0gZHJhd0NhbGxCLnpkaXN0O1xufVxuXG5jb25zdCBzb3J0Q2FsbGJhY2tzID0gW251bGwsIHNvcnRNYW51YWwsIHNvcnRNYXRlcmlhbE1lc2gsIHNvcnRCYWNrVG9Gcm9udCwgc29ydEZyb250VG9CYWNrXTtcblxuLy8gTGF5ZXJzXG5sZXQgbGF5ZXJDb3VudGVyID0gMDtcblxuY29uc3QgbGlnaHRLZXlzID0gW107XG5jb25zdCBfdGVtcE1hdGVyaWFscyA9IG5ldyBTZXQoKTtcblxuY2xhc3MgQ3VsbGVkSW5zdGFuY2VzIHtcbiAgICAvKipcbiAgICAgKiBWaXNpYmxlIG9wYXF1ZSBtZXNoIGluc3RhbmNlcy5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtpbXBvcnQoJy4vbWVzaC1pbnN0YW5jZS5qcycpLk1lc2hJbnN0YW5jZVtdfVxuICAgICAqL1xuICAgIG9wYXF1ZSA9IFtdO1xuXG4gICAgLyoqXG4gICAgICogVmlzaWJsZSB0cmFuc3BhcmVudCBtZXNoIGluc3RhbmNlcy5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtpbXBvcnQoJy4vbWVzaC1pbnN0YW5jZS5qcycpLk1lc2hJbnN0YW5jZVtdfVxuICAgICAqL1xuICAgIHRyYW5zcGFyZW50ID0gW107XG59XG5cbi8qKlxuICogQSBMYXllciByZXByZXNlbnRzIGEgcmVuZGVyYWJsZSBzdWJzZXQgb2YgdGhlIHNjZW5lLiBJdCBjYW4gY29udGFpbiBhIGxpc3Qgb2YgbWVzaCBpbnN0YW5jZXMsXG4gKiBsaWdodHMgYW5kIGNhbWVyYXMsIHRoZWlyIHJlbmRlciBzZXR0aW5ncyBhbmQgYWxzbyBkZWZpbmVzIGN1c3RvbSBjYWxsYmFja3MgYmVmb3JlLCBhZnRlciBvclxuICogZHVyaW5nIHJlbmRlcmluZy4gTGF5ZXJzIGFyZSBvcmdhbml6ZWQgaW5zaWRlIHtAbGluayBMYXllckNvbXBvc2l0aW9ufSBpbiBhIGRlc2lyZWQgb3JkZXIuXG4gKlxuICogQGNhdGVnb3J5IEdyYXBoaWNzXG4gKi9cbmNsYXNzIExheWVyIHtcbiAgICAvKipcbiAgICAgKiBNZXNoIGluc3RhbmNlcyBhc3NpZ25lZCB0byB0aGlzIGxheWVyLlxuICAgICAqXG4gICAgICogQHR5cGUge2ltcG9ydCgnLi9tZXNoLWluc3RhbmNlLmpzJykuTWVzaEluc3RhbmNlW119XG4gICAgICogQGlnbm9yZVxuICAgICAqL1xuICAgIG1lc2hJbnN0YW5jZXMgPSBbXTtcblxuICAgIC8qKlxuICAgICAqIE1lc2ggaW5zdGFuY2VzIGFzc2lnbmVkIHRvIHRoaXMgbGF5ZXIsIHN0b3JlZCBpbiBhIHNldC5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtTZXQ8aW1wb3J0KCcuL21lc2gtaW5zdGFuY2UuanMnKS5NZXNoSW5zdGFuY2U+fVxuICAgICAqIEBpZ25vcmVcbiAgICAgKi9cbiAgICBtZXNoSW5zdGFuY2VzU2V0ID0gbmV3IFNldCgpO1xuXG4gICAgLyoqXG4gICAgICogU2hhZG93IGNhc3RpbmcgaW5zdGFuY2VzIGFzc2lnbmVkIHRvIHRoaXMgbGF5ZXIuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7aW1wb3J0KCcuL21lc2gtaW5zdGFuY2UuanMnKS5NZXNoSW5zdGFuY2VbXX1cbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgc2hhZG93Q2FzdGVycyA9IFtdO1xuXG4gICAgLyoqXG4gICAgICogU2hhZG93IGNhc3RpbmcgaW5zdGFuY2VzIGFzc2lnbmVkIHRvIHRoaXMgbGF5ZXIsIHN0b3JlZCBpbiBhIHNldC5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtTZXQ8aW1wb3J0KCcuL21lc2gtaW5zdGFuY2UuanMnKS5NZXNoSW5zdGFuY2U+fVxuICAgICAqIEBpZ25vcmVcbiAgICAgKi9cbiAgICBzaGFkb3dDYXN0ZXJzU2V0ID0gbmV3IFNldCgpO1xuXG4gICAgLyoqXG4gICAgICogVmlzaWJsZSAoY3VsbGVkKSBtZXNoIGluc3RhbmNlcyBhc3NpZ25lZCB0byB0aGlzIGxheWVyLiBMb29rZWQgdXAgYnkgdGhlIENhbWVyYS5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtXZWFrTWFwPGltcG9ydCgnLi9jYW1lcmEuanMnKS5DYW1lcmEsIEN1bGxlZEluc3RhbmNlcz59XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfdmlzaWJsZUluc3RhbmNlcyA9IG5ldyBXZWFrTWFwKCk7XG5cbiAgICAvKipcbiAgICAgKiBBbGwgbGlnaHRzIGFzc2lnbmVkIHRvIGEgbGF5ZXIuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7aW1wb3J0KCcuL2xpZ2h0LmpzJykuTGlnaHRbXX1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9saWdodHMgPSBbXTtcblxuICAgIC8qKlxuICAgICAqIEFsbCBsaWdodHMgYXNzaWduZWQgdG8gYSBsYXllciBzdG9yZWQgaW4gYSBzZXQuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7U2V0PGltcG9ydCgnLi9saWdodC5qcycpLkxpZ2h0Pn1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuXG4gICAgX2xpZ2h0c1NldCA9IG5ldyBTZXQoKTtcblxuICAgIC8qKlxuICAgICAqIFNldCBvZiBsaWdodCB1c2VkIGJ5IGNsdXN0ZXJlZCBsaWdodGluZyAob21uaSBhbmQgc3BvdCwgYnV0IG5vIGRpcmVjdGlvbmFsKS5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtTZXQ8aW1wb3J0KCcuL2xpZ2h0LmpzJykuTGlnaHQ+fVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX2NsdXN0ZXJlZExpZ2h0c1NldCA9IG5ldyBTZXQoKTtcblxuICAgIC8qKlxuICAgICAqIExpZ2h0cyBzZXBhcmF0ZWQgYnkgbGlnaHQgdHlwZS4gTGlnaHRzIGluIHRoZSBpbmRpdmlkdWFsIGFycmF5cyBhcmUgc29ydGVkIGJ5IHRoZSBrZXksXG4gICAgICogdG8gbWF0Y2ggdGhlaXIgb3JkZXIgaW4gX2xpZ2h0SWRIYXNoLCBzbyB0aGF0IHRoZWlyIG9yZGVyIG1hdGNoZXMgdGhlIG9yZGVyIGV4cGVjdGVkIGJ5IHRoZVxuICAgICAqIGdlbmVyYXRlZCBzaGFkZXIgY29kZS5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtpbXBvcnQoJy4vbGlnaHQuanMnKS5MaWdodFtdW119XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfc3BsaXRMaWdodHMgPSBbW10sIFtdLCBbXV07XG5cbiAgICAvKipcbiAgICAgKiBUcnVlIGlmIF9zcGxpdExpZ2h0cyBuZWVkcyB0byBiZSB1cGRhdGVkLCB3aGljaCBtZWFucyBpZiBsaWdodHMgd2VyZSBhZGRlZCBvciByZW1vdmVkIGZyb21cbiAgICAgKiB0aGUgbGF5ZXIsIG9yIHRoZWlyIGtleSBjaGFuZ2VkLlxuICAgICAqXG4gICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfc3BsaXRMaWdodHNEaXJ0eSA9IHRydWU7XG5cbiAgICAvKipcbiAgICAgKiBUcnVlIGlmIHRoZSBvYmplY3RzIHJlbmRlcmVkIG9uIHRoZSBsYXllciByZXF1aXJlIGxpZ2h0IGN1YmUgKGVtaXR0ZXJzIHdpdGggbGlnaHRpbmcgZG8pLlxuICAgICAqXG4gICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICovXG4gICAgcmVxdWlyZXNMaWdodEN1YmUgPSBmYWxzZTtcblxuICAgIC8qKlxuICAgICAqIENyZWF0ZSBhIG5ldyBMYXllciBpbnN0YW5jZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7b2JqZWN0fSBvcHRpb25zIC0gT2JqZWN0IGZvciBwYXNzaW5nIG9wdGlvbmFsIGFyZ3VtZW50cy4gVGhlc2UgYXJndW1lbnRzIGFyZSB0aGVcbiAgICAgKiBzYW1lIGFzIHByb3BlcnRpZXMgb2YgdGhlIExheWVyLlxuICAgICAqL1xuICAgIGNvbnN0cnVjdG9yKG9wdGlvbnMgPSB7fSkge1xuXG4gICAgICAgIGlmIChvcHRpb25zLmlkICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIC8qKlxuICAgICAgICAgICAgICogQSB1bmlxdWUgSUQgb2YgdGhlIGxheWVyLiBMYXllciBJRHMgYXJlIHN0b3JlZCBpbnNpZGUge0BsaW5rIE1vZGVsQ29tcG9uZW50I2xheWVyc30sXG4gICAgICAgICAgICAgKiB7QGxpbmsgUmVuZGVyQ29tcG9uZW50I2xheWVyc30sIHtAbGluayBDYW1lcmFDb21wb25lbnQjbGF5ZXJzfSxcbiAgICAgICAgICAgICAqIHtAbGluayBMaWdodENvbXBvbmVudCNsYXllcnN9IGFuZCB7QGxpbmsgRWxlbWVudENvbXBvbmVudCNsYXllcnN9IGluc3RlYWQgb2YgbmFtZXMuXG4gICAgICAgICAgICAgKiBDYW4gYmUgdXNlZCBpbiB7QGxpbmsgTGF5ZXJDb21wb3NpdGlvbiNnZXRMYXllckJ5SWR9LlxuICAgICAgICAgICAgICpcbiAgICAgICAgICAgICAqIEB0eXBlIHtudW1iZXJ9XG4gICAgICAgICAgICAgKi9cbiAgICAgICAgICAgIHRoaXMuaWQgPSBvcHRpb25zLmlkO1xuICAgICAgICAgICAgbGF5ZXJDb3VudGVyID0gTWF0aC5tYXgodGhpcy5pZCArIDEsIGxheWVyQ291bnRlcik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmlkID0gbGF5ZXJDb3VudGVyKys7XG4gICAgICAgIH1cblxuICAgICAgICAvKipcbiAgICAgICAgICogTmFtZSBvZiB0aGUgbGF5ZXIuIENhbiBiZSB1c2VkIGluIHtAbGluayBMYXllckNvbXBvc2l0aW9uI2dldExheWVyQnlOYW1lfS5cbiAgICAgICAgICpcbiAgICAgICAgICogQHR5cGUge3N0cmluZ31cbiAgICAgICAgICovXG4gICAgICAgIHRoaXMubmFtZSA9IG9wdGlvbnMubmFtZTtcblxuICAgICAgICAvKipcbiAgICAgICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICAgICAqIEBwcml2YXRlXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLl9lbmFibGVkID0gb3B0aW9ucy5lbmFibGVkID8/IHRydWU7XG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAgICAgKiBAcHJpdmF0ZVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5fcmVmQ291bnRlciA9IHRoaXMuX2VuYWJsZWQgPyAxIDogMDtcblxuICAgICAgICAvKipcbiAgICAgICAgICogRGVmaW5lcyB0aGUgbWV0aG9kIHVzZWQgZm9yIHNvcnRpbmcgb3BhcXVlICh0aGF0IGlzLCBub3Qgc2VtaS10cmFuc3BhcmVudCkgbWVzaFxuICAgICAgICAgKiBpbnN0YW5jZXMgYmVmb3JlIHJlbmRlcmluZy4gQ2FuIGJlOlxuICAgICAgICAgKlxuICAgICAgICAgKiAtIHtAbGluayBTT1JUTU9ERV9OT05FfVxuICAgICAgICAgKiAtIHtAbGluayBTT1JUTU9ERV9NQU5VQUx9XG4gICAgICAgICAqIC0ge0BsaW5rIFNPUlRNT0RFX01BVEVSSUFMTUVTSH1cbiAgICAgICAgICogLSB7QGxpbmsgU09SVE1PREVfQkFDSzJGUk9OVH1cbiAgICAgICAgICogLSB7QGxpbmsgU09SVE1PREVfRlJPTlQyQkFDS31cbiAgICAgICAgICpcbiAgICAgICAgICogRGVmYXVsdHMgdG8ge0BsaW5rIFNPUlRNT0RFX01BVEVSSUFMTUVTSH0uXG4gICAgICAgICAqXG4gICAgICAgICAqIEB0eXBlIHtudW1iZXJ9XG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLm9wYXF1ZVNvcnRNb2RlID0gb3B0aW9ucy5vcGFxdWVTb3J0TW9kZSA/PyBTT1JUTU9ERV9NQVRFUklBTE1FU0g7XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIERlZmluZXMgdGhlIG1ldGhvZCB1c2VkIGZvciBzb3J0aW5nIHNlbWktdHJhbnNwYXJlbnQgbWVzaCBpbnN0YW5jZXMgYmVmb3JlIHJlbmRlcmluZy4gQ2FuIGJlOlxuICAgICAgICAgKlxuICAgICAgICAgKiAtIHtAbGluayBTT1JUTU9ERV9OT05FfVxuICAgICAgICAgKiAtIHtAbGluayBTT1JUTU9ERV9NQU5VQUx9XG4gICAgICAgICAqIC0ge0BsaW5rIFNPUlRNT0RFX01BVEVSSUFMTUVTSH1cbiAgICAgICAgICogLSB7QGxpbmsgU09SVE1PREVfQkFDSzJGUk9OVH1cbiAgICAgICAgICogLSB7QGxpbmsgU09SVE1PREVfRlJPTlQyQkFDS31cbiAgICAgICAgICpcbiAgICAgICAgICogRGVmYXVsdHMgdG8ge0BsaW5rIFNPUlRNT0RFX0JBQ0syRlJPTlR9LlxuICAgICAgICAgKlxuICAgICAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy50cmFuc3BhcmVudFNvcnRNb2RlID0gb3B0aW9ucy50cmFuc3BhcmVudFNvcnRNb2RlID8/IFNPUlRNT0RFX0JBQ0syRlJPTlQ7XG5cbiAgICAgICAgaWYgKG9wdGlvbnMucmVuZGVyVGFyZ2V0KSB7XG4gICAgICAgICAgICB0aGlzLnJlbmRlclRhcmdldCA9IG9wdGlvbnMucmVuZGVyVGFyZ2V0O1xuICAgICAgICB9XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEEgdHlwZSBvZiBzaGFkZXIgdG8gdXNlIGR1cmluZyByZW5kZXJpbmcuIFBvc3NpYmxlIHZhbHVlcyBhcmU6XG4gICAgICAgICAqXG4gICAgICAgICAqIC0ge0BsaW5rIFNIQURFUl9GT1JXQVJEfVxuICAgICAgICAgKiAtIHtAbGluayBTSEFERVJfRk9SV0FSREhEUn1cbiAgICAgICAgICogLSB7QGxpbmsgU0hBREVSX0RFUFRIfVxuICAgICAgICAgKiAtIFlvdXIgb3duIGN1c3RvbSB2YWx1ZS4gU2hvdWxkIGJlIGluIDE5IC0gMzEgcmFuZ2UuIFVzZSB7QGxpbmsgU3RhbmRhcmRNYXRlcmlhbCNvblVwZGF0ZVNoYWRlcn1cbiAgICAgICAgICogdG8gYXBwbHkgc2hhZGVyIG1vZGlmaWNhdGlvbnMgYmFzZWQgb24gdGhpcyB2YWx1ZS5cbiAgICAgICAgICpcbiAgICAgICAgICogRGVmYXVsdHMgdG8ge0BsaW5rIFNIQURFUl9GT1JXQVJEfS5cbiAgICAgICAgICpcbiAgICAgICAgICogQHR5cGUge251bWJlcn1cbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuc2hhZGVyUGFzcyA9IG9wdGlvbnMuc2hhZGVyUGFzcyA/PyBTSEFERVJfRk9SV0FSRDtcblxuICAgICAgICAvLyBjbGVhciBmbGFnc1xuICAgICAgICAvKipcbiAgICAgICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICAgICAqIEBwcml2YXRlXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLl9jbGVhckNvbG9yQnVmZmVyID0gISFvcHRpb25zLmNsZWFyQ29sb3JCdWZmZXI7XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAgICAgKiBAcHJpdmF0ZVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5fY2xlYXJEZXB0aEJ1ZmZlciA9ICEhb3B0aW9ucy5jbGVhckRlcHRoQnVmZmVyO1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICAgICAgICogQHByaXZhdGVcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuX2NsZWFyU3RlbmNpbEJ1ZmZlciA9ICEhb3B0aW9ucy5jbGVhclN0ZW5jaWxCdWZmZXI7XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEN1c3RvbSBmdW5jdGlvbiB0aGF0IGlzIGNhbGxlZCBiZWZvcmUgdmlzaWJpbGl0eSBjdWxsaW5nIGlzIHBlcmZvcm1lZCBmb3IgdGhpcyBsYXllci5cbiAgICAgICAgICogVXNlZnVsLCBmb3IgZXhhbXBsZSwgaWYgeW91IHdhbnQgdG8gbW9kaWZ5IGNhbWVyYSBwcm9qZWN0aW9uIHdoaWxlIHN0aWxsIHVzaW5nIHRoZSBzYW1lXG4gICAgICAgICAqIGNhbWVyYSBhbmQgbWFrZSBmcnVzdHVtIGN1bGxpbmcgd29yayBjb3JyZWN0bHkgd2l0aCBpdCAoc2VlXG4gICAgICAgICAqIHtAbGluayBDYW1lcmFDb21wb25lbnQjY2FsY3VsYXRlVHJhbnNmb3JtfSBhbmQge0BsaW5rIENhbWVyYUNvbXBvbmVudCNjYWxjdWxhdGVQcm9qZWN0aW9ufSkuXG4gICAgICAgICAqIFRoaXMgZnVuY3Rpb24gd2lsbCByZWNlaXZlIGNhbWVyYSBpbmRleCBhcyB0aGUgb25seSBhcmd1bWVudC4gWW91IGNhbiBnZXQgdGhlIGFjdHVhbFxuICAgICAgICAgKiBjYW1lcmEgYmVpbmcgdXNlZCBieSBsb29raW5nIHVwIHtAbGluayBMYXllckNvbXBvc2l0aW9uI2NhbWVyYXN9IHdpdGggdGhpcyBpbmRleC5cbiAgICAgICAgICpcbiAgICAgICAgICogQHR5cGUge0Z1bmN0aW9ufVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5vblByZUN1bGwgPSBvcHRpb25zLm9uUHJlQ3VsbDtcbiAgICAgICAgLyoqXG4gICAgICAgICAqIEN1c3RvbSBmdW5jdGlvbiB0aGF0IGlzIGNhbGxlZCBiZWZvcmUgdGhpcyBsYXllciBpcyByZW5kZXJlZC4gVXNlZnVsLCBmb3IgZXhhbXBsZSwgZm9yXG4gICAgICAgICAqIHJlYWN0aW5nIG9uIHNjcmVlbiBzaXplIGNoYW5nZXMuIFRoaXMgZnVuY3Rpb24gaXMgY2FsbGVkIGJlZm9yZSB0aGUgZmlyc3Qgb2NjdXJyZW5jZSBvZlxuICAgICAgICAgKiB0aGlzIGxheWVyIGluIHtAbGluayBMYXllckNvbXBvc2l0aW9ufS4gSXQgd2lsbCByZWNlaXZlIGNhbWVyYSBpbmRleCBhcyB0aGUgb25seVxuICAgICAgICAgKiBhcmd1bWVudC4gWW91IGNhbiBnZXQgdGhlIGFjdHVhbCBjYW1lcmEgYmVpbmcgdXNlZCBieSBsb29raW5nIHVwXG4gICAgICAgICAqIHtAbGluayBMYXllckNvbXBvc2l0aW9uI2NhbWVyYXN9IHdpdGggdGhpcyBpbmRleC5cbiAgICAgICAgICpcbiAgICAgICAgICogQHR5cGUge0Z1bmN0aW9ufVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5vblByZVJlbmRlciA9IG9wdGlvbnMub25QcmVSZW5kZXI7XG4gICAgICAgIC8qKlxuICAgICAgICAgKiBDdXN0b20gZnVuY3Rpb24gdGhhdCBpcyBjYWxsZWQgYmVmb3JlIG9wYXF1ZSBtZXNoIGluc3RhbmNlcyAobm90IHNlbWktdHJhbnNwYXJlbnQpIGluXG4gICAgICAgICAqIHRoaXMgbGF5ZXIgYXJlIHJlbmRlcmVkLiBUaGlzIGZ1bmN0aW9uIHdpbGwgcmVjZWl2ZSBjYW1lcmEgaW5kZXggYXMgdGhlIG9ubHkgYXJndW1lbnQuXG4gICAgICAgICAqIFlvdSBjYW4gZ2V0IHRoZSBhY3R1YWwgY2FtZXJhIGJlaW5nIHVzZWQgYnkgbG9va2luZyB1cCB7QGxpbmsgTGF5ZXJDb21wb3NpdGlvbiNjYW1lcmFzfVxuICAgICAgICAgKiB3aXRoIHRoaXMgaW5kZXguXG4gICAgICAgICAqXG4gICAgICAgICAqIEB0eXBlIHtGdW5jdGlvbn1cbiAgICAgICAgICovXG4gICAgICAgIHRoaXMub25QcmVSZW5kZXJPcGFxdWUgPSBvcHRpb25zLm9uUHJlUmVuZGVyT3BhcXVlO1xuICAgICAgICAvKipcbiAgICAgICAgICogQ3VzdG9tIGZ1bmN0aW9uIHRoYXQgaXMgY2FsbGVkIGJlZm9yZSBzZW1pLXRyYW5zcGFyZW50IG1lc2ggaW5zdGFuY2VzIGluIHRoaXMgbGF5ZXIgYXJlXG4gICAgICAgICAqIHJlbmRlcmVkLiBUaGlzIGZ1bmN0aW9uIHdpbGwgcmVjZWl2ZSBjYW1lcmEgaW5kZXggYXMgdGhlIG9ubHkgYXJndW1lbnQuIFlvdSBjYW4gZ2V0IHRoZVxuICAgICAgICAgKiBhY3R1YWwgY2FtZXJhIGJlaW5nIHVzZWQgYnkgbG9va2luZyB1cCB7QGxpbmsgTGF5ZXJDb21wb3NpdGlvbiNjYW1lcmFzfSB3aXRoIHRoaXMgaW5kZXguXG4gICAgICAgICAqXG4gICAgICAgICAqIEB0eXBlIHtGdW5jdGlvbn1cbiAgICAgICAgICovXG4gICAgICAgIHRoaXMub25QcmVSZW5kZXJUcmFuc3BhcmVudCA9IG9wdGlvbnMub25QcmVSZW5kZXJUcmFuc3BhcmVudDtcblxuICAgICAgICAvKipcbiAgICAgICAgICogQ3VzdG9tIGZ1bmN0aW9uIHRoYXQgaXMgY2FsbGVkIGFmdGVyIHZpc2liaWxpdHkgY3VsbGluZyBpcyBwZXJmb3JtZWQgZm9yIHRoaXMgbGF5ZXIuXG4gICAgICAgICAqIFVzZWZ1bCBmb3IgcmV2ZXJ0aW5nIGNoYW5nZXMgZG9uZSBpbiB7QGxpbmsgTGF5ZXIjb25QcmVDdWxsfSBhbmQgZGV0ZXJtaW5pbmcgZmluYWwgbWVzaFxuICAgICAgICAgKiBpbnN0YW5jZSB2aXNpYmlsaXR5IChzZWUge0BsaW5rIE1lc2hJbnN0YW5jZSN2aXNpYmxlVGhpc0ZyYW1lfSkuIFRoaXMgZnVuY3Rpb24gd2lsbFxuICAgICAgICAgKiByZWNlaXZlIGNhbWVyYSBpbmRleCBhcyB0aGUgb25seSBhcmd1bWVudC4gWW91IGNhbiBnZXQgdGhlIGFjdHVhbCBjYW1lcmEgYmVpbmcgdXNlZCBieVxuICAgICAgICAgKiBsb29raW5nIHVwIHtAbGluayBMYXllckNvbXBvc2l0aW9uI2NhbWVyYXN9IHdpdGggdGhpcyBpbmRleC5cbiAgICAgICAgICpcbiAgICAgICAgICogQHR5cGUge0Z1bmN0aW9ufVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5vblBvc3RDdWxsID0gb3B0aW9ucy5vblBvc3RDdWxsO1xuICAgICAgICAvKipcbiAgICAgICAgICogQ3VzdG9tIGZ1bmN0aW9uIHRoYXQgaXMgY2FsbGVkIGFmdGVyIHRoaXMgbGF5ZXIgaXMgcmVuZGVyZWQuIFVzZWZ1bCB0byByZXZlcnQgY2hhbmdlc1xuICAgICAgICAgKiBtYWRlIGluIHtAbGluayBMYXllciNvblByZVJlbmRlcn0uIFRoaXMgZnVuY3Rpb24gaXMgY2FsbGVkIGFmdGVyIHRoZSBsYXN0IG9jY3VycmVuY2Ugb2YgdGhpc1xuICAgICAgICAgKiBsYXllciBpbiB7QGxpbmsgTGF5ZXJDb21wb3NpdGlvbn0uIEl0IHdpbGwgcmVjZWl2ZSBjYW1lcmEgaW5kZXggYXMgdGhlIG9ubHkgYXJndW1lbnQuXG4gICAgICAgICAqIFlvdSBjYW4gZ2V0IHRoZSBhY3R1YWwgY2FtZXJhIGJlaW5nIHVzZWQgYnkgbG9va2luZyB1cCB7QGxpbmsgTGF5ZXJDb21wb3NpdGlvbiNjYW1lcmFzfVxuICAgICAgICAgKiB3aXRoIHRoaXMgaW5kZXguXG4gICAgICAgICAqXG4gICAgICAgICAqIEB0eXBlIHtGdW5jdGlvbn1cbiAgICAgICAgICovXG4gICAgICAgIHRoaXMub25Qb3N0UmVuZGVyID0gb3B0aW9ucy5vblBvc3RSZW5kZXI7XG4gICAgICAgIC8qKlxuICAgICAgICAgKiBDdXN0b20gZnVuY3Rpb24gdGhhdCBpcyBjYWxsZWQgYWZ0ZXIgb3BhcXVlIG1lc2ggaW5zdGFuY2VzIChub3Qgc2VtaS10cmFuc3BhcmVudCkgaW5cbiAgICAgICAgICogdGhpcyBsYXllciBhcmUgcmVuZGVyZWQuIFRoaXMgZnVuY3Rpb24gd2lsbCByZWNlaXZlIGNhbWVyYSBpbmRleCBhcyB0aGUgb25seSBhcmd1bWVudC5cbiAgICAgICAgICogWW91IGNhbiBnZXQgdGhlIGFjdHVhbCBjYW1lcmEgYmVpbmcgdXNlZCBieSBsb29raW5nIHVwIHtAbGluayBMYXllckNvbXBvc2l0aW9uI2NhbWVyYXN9XG4gICAgICAgICAqIHdpdGggdGhpcyBpbmRleC5cbiAgICAgICAgICpcbiAgICAgICAgICogQHR5cGUge0Z1bmN0aW9ufVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5vblBvc3RSZW5kZXJPcGFxdWUgPSBvcHRpb25zLm9uUG9zdFJlbmRlck9wYXF1ZTtcbiAgICAgICAgLyoqXG4gICAgICAgICAqIEN1c3RvbSBmdW5jdGlvbiB0aGF0IGlzIGNhbGxlZCBhZnRlciBzZW1pLXRyYW5zcGFyZW50IG1lc2ggaW5zdGFuY2VzIGluIHRoaXMgbGF5ZXIgYXJlXG4gICAgICAgICAqIHJlbmRlcmVkLiBUaGlzIGZ1bmN0aW9uIHdpbGwgcmVjZWl2ZSBjYW1lcmEgaW5kZXggYXMgdGhlIG9ubHkgYXJndW1lbnQuIFlvdSBjYW4gZ2V0IHRoZVxuICAgICAgICAgKiBhY3R1YWwgY2FtZXJhIGJlaW5nIHVzZWQgYnkgbG9va2luZyB1cCB7QGxpbmsgTGF5ZXJDb21wb3NpdGlvbiNjYW1lcmFzfSB3aXRoIHRoaXMgaW5kZXguXG4gICAgICAgICAqXG4gICAgICAgICAqIEB0eXBlIHtGdW5jdGlvbn1cbiAgICAgICAgICovXG4gICAgICAgIHRoaXMub25Qb3N0UmVuZGVyVHJhbnNwYXJlbnQgPSBvcHRpb25zLm9uUG9zdFJlbmRlclRyYW5zcGFyZW50O1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBDdXN0b20gZnVuY3Rpb24gdGhhdCBpcyBjYWxsZWQgYmVmb3JlIGV2ZXJ5IG1lc2ggaW5zdGFuY2UgaW4gdGhpcyBsYXllciBpcyByZW5kZXJlZC4gSXRcbiAgICAgICAgICogaXMgbm90IHJlY29tbWVuZGVkIHRvIHNldCB0aGlzIGZ1bmN0aW9uIHdoZW4gcmVuZGVyaW5nIG1hbnkgb2JqZWN0cyBldmVyeSBmcmFtZSBkdWUgdG9cbiAgICAgICAgICogcGVyZm9ybWFuY2UgcmVhc29ucy5cbiAgICAgICAgICpcbiAgICAgICAgICogQHR5cGUge0Z1bmN0aW9ufVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5vbkRyYXdDYWxsID0gb3B0aW9ucy5vbkRyYXdDYWxsO1xuICAgICAgICAvKipcbiAgICAgICAgICogQ3VzdG9tIGZ1bmN0aW9uIHRoYXQgaXMgY2FsbGVkIGFmdGVyIHRoZSBsYXllciBoYXMgYmVlbiBlbmFibGVkLiBUaGlzIGhhcHBlbnMgd2hlbjpcbiAgICAgICAgICpcbiAgICAgICAgICogLSBUaGUgbGF5ZXIgaXMgY3JlYXRlZCB3aXRoIHtAbGluayBMYXllciNlbmFibGVkfSBzZXQgdG8gdHJ1ZSAod2hpY2ggaXMgdGhlIGRlZmF1bHQgdmFsdWUpLlxuICAgICAgICAgKiAtIHtAbGluayBMYXllciNlbmFibGVkfSB3YXMgY2hhbmdlZCBmcm9tIGZhbHNlIHRvIHRydWVcbiAgICAgICAgICogLSB7QGxpbmsgTGF5ZXIjaW5jcmVtZW50Q291bnRlcn0gd2FzIGNhbGxlZCBhbmQgaW5jcmVtZW50ZWQgdGhlIGNvdW50ZXIgYWJvdmUgemVyby5cbiAgICAgICAgICpcbiAgICAgICAgICogVXNlZnVsIGZvciBhbGxvY2F0aW5nIHJlc291cmNlcyB0aGlzIGxheWVyIHdpbGwgdXNlIChlLmcuIGNyZWF0aW5nIHJlbmRlciB0YXJnZXRzKS5cbiAgICAgICAgICpcbiAgICAgICAgICogQHR5cGUge0Z1bmN0aW9ufVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5vbkVuYWJsZSA9IG9wdGlvbnMub25FbmFibGU7XG4gICAgICAgIC8qKlxuICAgICAgICAgKiBDdXN0b20gZnVuY3Rpb24gdGhhdCBpcyBjYWxsZWQgYWZ0ZXIgdGhlIGxheWVyIGhhcyBiZWVuIGRpc2FibGVkLiBUaGlzIGhhcHBlbnMgd2hlbjpcbiAgICAgICAgICpcbiAgICAgICAgICogLSB7QGxpbmsgTGF5ZXIjZW5hYmxlZH0gd2FzIGNoYW5nZWQgZnJvbSB0cnVlIHRvIGZhbHNlXG4gICAgICAgICAqIC0ge0BsaW5rIExheWVyI2RlY3JlbWVudENvdW50ZXJ9IHdhcyBjYWxsZWQgYW5kIHNldCB0aGUgY291bnRlciB0byB6ZXJvLlxuICAgICAgICAgKlxuICAgICAgICAgKiBAdHlwZSB7RnVuY3Rpb259XG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLm9uRGlzYWJsZSA9IG9wdGlvbnMub25EaXNhYmxlO1xuXG4gICAgICAgIGlmICh0aGlzLl9lbmFibGVkICYmIHRoaXMub25FbmFibGUpIHtcbiAgICAgICAgICAgIHRoaXMub25FbmFibGUoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBNYWtlIHRoaXMgbGF5ZXIgcmVuZGVyIHRoZSBzYW1lIG1lc2ggaW5zdGFuY2VzIHRoYXQgYW5vdGhlciBsYXllciBkb2VzIGluc3RlYWQgb2YgaGF2aW5nXG4gICAgICAgICAqIGl0cyBvd24gbWVzaCBpbnN0YW5jZSBsaXN0LiBCb3RoIGxheWVycyBtdXN0IHNoYXJlIGNhbWVyYXMuIEZydXN0dW0gY3VsbGluZyBpcyBvbmx5XG4gICAgICAgICAqIHBlcmZvcm1lZCBmb3Igb25lIGxheWVyLiBVc2VmdWwgZm9yIHJlbmRlcmluZyBtdWx0aXBsZSBwYXNzZXMgdXNpbmcgZGlmZmVyZW50IHNoYWRlcnMuXG4gICAgICAgICAqXG4gICAgICAgICAqIEB0eXBlIHtMYXllcn1cbiAgICAgICAgICovXG4gICAgICAgIHRoaXMubGF5ZXJSZWZlcmVuY2UgPSBvcHRpb25zLmxheWVyUmVmZXJlbmNlOyAvLyBzaG91bGQgdXNlIHRoZSBzYW1lIGNhbWVyYVxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAdHlwZSB7RnVuY3Rpb258bnVsbH1cbiAgICAgICAgICogQGlnbm9yZVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5jdXN0b21Tb3J0Q2FsbGJhY2sgPSBudWxsO1xuICAgICAgICAvKipcbiAgICAgICAgICogQHR5cGUge0Z1bmN0aW9ufG51bGx9XG4gICAgICAgICAqIEBpZ25vcmVcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuY3VzdG9tQ2FsY3VsYXRlU29ydFZhbHVlcyA9IG51bGw7XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEB0eXBlIHtpbXBvcnQoJy4uL2ZyYW1ld29yay9jb21wb25lbnRzL2NhbWVyYS9jb21wb25lbnQuanMnKS5DYW1lcmFDb21wb25lbnRbXX1cbiAgICAgICAgICogQGlnbm9yZVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5jYW1lcmFzID0gW107XG5cbiAgICAgICAgdGhpcy5fZGlydHlDYW1lcmFzID0gZmFsc2U7XG5cbiAgICAgICAgLy8gbGlnaHQgaGFzaCBiYXNlZCBvbiB0aGUgbGlnaHQga2V5c1xuICAgICAgICB0aGlzLl9saWdodEhhc2ggPSAwO1xuICAgICAgICB0aGlzLl9saWdodEhhc2hEaXJ0eSA9IGZhbHNlO1xuXG4gICAgICAgIC8vIGxpZ2h0IGhhc2ggYmFzZWQgb24gbGlnaHQgaWRzXG4gICAgICAgIHRoaXMuX2xpZ2h0SWRIYXNoID0gMDtcbiAgICAgICAgdGhpcy5fbGlnaHRJZEhhc2hEaXJ0eSA9IGZhbHNlO1xuXG4gICAgICAgIC8vICNpZiBfUFJPRklMRVJcbiAgICAgICAgdGhpcy5za2lwUmVuZGVyQWZ0ZXIgPSBOdW1iZXIuTUFYX1ZBTFVFO1xuICAgICAgICB0aGlzLl9za2lwUmVuZGVyQ291bnRlciA9IDA7XG5cbiAgICAgICAgdGhpcy5fcmVuZGVyVGltZSA9IDA7XG4gICAgICAgIHRoaXMuX2ZvcndhcmREcmF3Q2FsbHMgPSAwO1xuICAgICAgICB0aGlzLl9zaGFkb3dEcmF3Q2FsbHMgPSAwOyAgLy8gZGVwcmVjYXRlZCwgbm90IHVzZWZ1bCBvbiBhIGxheWVyIGFueW1vcmUsIGNvdWxkIGJlIG1vdmVkIHRvIGNhbWVyYVxuICAgICAgICAvLyAjZW5kaWZcblxuICAgICAgICB0aGlzLl9zaGFkZXJWZXJzaW9uID0gLTE7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRW5hYmxlIHRoZSBsYXllci4gRGlzYWJsZWQgbGF5ZXJzIGFyZSBza2lwcGVkLiBEZWZhdWx0cyB0byB0cnVlLlxuICAgICAqXG4gICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICovXG4gICAgc2V0IGVuYWJsZWQodmFsKSB7XG4gICAgICAgIGlmICh2YWwgIT09IHRoaXMuX2VuYWJsZWQpIHtcbiAgICAgICAgICAgIHRoaXMuX2VuYWJsZWQgPSB2YWw7XG4gICAgICAgICAgICBpZiAodmFsKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5pbmNyZW1lbnRDb3VudGVyKCk7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMub25FbmFibGUpIHRoaXMub25FbmFibGUoKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5kZWNyZW1lbnRDb3VudGVyKCk7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMub25EaXNhYmxlKSB0aGlzLm9uRGlzYWJsZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2V0IGVuYWJsZWQoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9lbmFibGVkO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIElmIHRydWUsIHRoZSBjYW1lcmEgd2lsbCBjbGVhciB0aGUgY29sb3IgYnVmZmVyIHdoZW4gaXQgcmVuZGVycyB0aGlzIGxheWVyLlxuICAgICAqXG4gICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICovXG4gICAgc2V0IGNsZWFyQ29sb3JCdWZmZXIodmFsKSB7XG4gICAgICAgIHRoaXMuX2NsZWFyQ29sb3JCdWZmZXIgPSB2YWw7XG4gICAgICAgIHRoaXMuX2RpcnR5Q2FtZXJhcyA9IHRydWU7XG4gICAgfVxuXG4gICAgZ2V0IGNsZWFyQ29sb3JCdWZmZXIoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9jbGVhckNvbG9yQnVmZmVyO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIElmIHRydWUsIHRoZSBjYW1lcmEgd2lsbCBjbGVhciB0aGUgZGVwdGggYnVmZmVyIHdoZW4gaXQgcmVuZGVycyB0aGlzIGxheWVyLlxuICAgICAqXG4gICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICovXG4gICAgc2V0IGNsZWFyRGVwdGhCdWZmZXIodmFsKSB7XG4gICAgICAgIHRoaXMuX2NsZWFyRGVwdGhCdWZmZXIgPSB2YWw7XG4gICAgICAgIHRoaXMuX2RpcnR5Q2FtZXJhcyA9IHRydWU7XG4gICAgfVxuXG4gICAgZ2V0IGNsZWFyRGVwdGhCdWZmZXIoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9jbGVhckRlcHRoQnVmZmVyO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIElmIHRydWUsIHRoZSBjYW1lcmEgd2lsbCBjbGVhciB0aGUgc3RlbmNpbCBidWZmZXIgd2hlbiBpdCByZW5kZXJzIHRoaXMgbGF5ZXIuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICAgKi9cbiAgICBzZXQgY2xlYXJTdGVuY2lsQnVmZmVyKHZhbCkge1xuICAgICAgICB0aGlzLl9jbGVhclN0ZW5jaWxCdWZmZXIgPSB2YWw7XG4gICAgICAgIHRoaXMuX2RpcnR5Q2FtZXJhcyA9IHRydWU7XG4gICAgfVxuXG4gICAgZ2V0IGNsZWFyU3RlbmNpbEJ1ZmZlcigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2NsZWFyU3RlbmNpbEJ1ZmZlcjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUcnVlIGlmIHRoZSBsYXllciBjb250YWlucyBvbW5pIG9yIHNwb3QgbGlnaHRzXG4gICAgICpcbiAgICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgZ2V0IGhhc0NsdXN0ZXJlZExpZ2h0cygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2NsdXN0ZXJlZExpZ2h0c1NldC5zaXplID4gMDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGxpZ2h0cyB1c2VkIGJ5IGNsdXN0ZXJlZCBsaWdodGluZyBpbiBhIHNldC5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtTZXQ8aW1wb3J0KCcuL2xpZ2h0LmpzJykuTGlnaHQ+fVxuICAgICAqIEBpZ25vcmVcbiAgICAgKi9cbiAgICBnZXQgY2x1c3RlcmVkTGlnaHRzU2V0KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fY2x1c3RlcmVkTGlnaHRzU2V0O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEluY3JlbWVudHMgdGhlIHVzYWdlIGNvdW50ZXIgb2YgdGhpcyBsYXllci4gQnkgZGVmYXVsdCwgbGF5ZXJzIGFyZSBjcmVhdGVkIHdpdGggY291bnRlciBzZXRcbiAgICAgKiB0byAxIChpZiB7QGxpbmsgTGF5ZXIuZW5hYmxlZH0gaXMgdHJ1ZSkgb3IgMCAoaWYgaXQgd2FzIGZhbHNlKS4gSW5jcmVtZW50aW5nIHRoZSBjb3VudGVyXG4gICAgICogZnJvbSAwIHRvIDEgd2lsbCBlbmFibGUgdGhlIGxheWVyIGFuZCBjYWxsIHtAbGluayBMYXllci5vbkVuYWJsZX0uIFVzZSB0aGlzIGZ1bmN0aW9uIHRvXG4gICAgICogXCJzdWJzY3JpYmVcIiBtdWx0aXBsZSBlZmZlY3RzIHRvIHRoZSBzYW1lIGxheWVyLiBGb3IgZXhhbXBsZSwgaWYgdGhlIGxheWVyIGlzIHVzZWQgdG8gcmVuZGVyXG4gICAgICogYSByZWZsZWN0aW9uIHRleHR1cmUgd2hpY2ggaXMgdXNlZCBieSAyIG1pcnJvcnMsIHRoZW4gZWFjaCBtaXJyb3IgY2FuIGNhbGwgdGhpcyBmdW5jdGlvblxuICAgICAqIHdoZW4gdmlzaWJsZSBhbmQge0BsaW5rIExheWVyLmRlY3JlbWVudENvdW50ZXJ9IGlmIGludmlzaWJsZS4gSW4gc3VjaCBjYXNlIHRoZSByZWZsZWN0aW9uXG4gICAgICogdGV4dHVyZSB3b24ndCBiZSB1cGRhdGVkLCB3aGVuIHRoZXJlIGlzIG5vdGhpbmcgdG8gdXNlIGl0LCBzYXZpbmcgcGVyZm9ybWFuY2UuXG4gICAgICpcbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgaW5jcmVtZW50Q291bnRlcigpIHtcbiAgICAgICAgaWYgKHRoaXMuX3JlZkNvdW50ZXIgPT09IDApIHtcbiAgICAgICAgICAgIHRoaXMuX2VuYWJsZWQgPSB0cnVlO1xuICAgICAgICAgICAgaWYgKHRoaXMub25FbmFibGUpIHRoaXMub25FbmFibGUoKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLl9yZWZDb3VudGVyKys7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRGVjcmVtZW50cyB0aGUgdXNhZ2UgY291bnRlciBvZiB0aGlzIGxheWVyLiBEZWNyZW1lbnRpbmcgdGhlIGNvdW50ZXIgZnJvbSAxIHRvIDAgd2lsbFxuICAgICAqIGRpc2FibGUgdGhlIGxheWVyIGFuZCBjYWxsIHtAbGluayBMYXllci5vbkRpc2FibGV9LiBTZWUge0BsaW5rIExheWVyI2luY3JlbWVudENvdW50ZXJ9IGZvclxuICAgICAqIG1vcmUgZGV0YWlscy5cbiAgICAgKlxuICAgICAqIEBpZ25vcmVcbiAgICAgKi9cbiAgICBkZWNyZW1lbnRDb3VudGVyKCkge1xuICAgICAgICBpZiAodGhpcy5fcmVmQ291bnRlciA9PT0gMSkge1xuICAgICAgICAgICAgdGhpcy5fZW5hYmxlZCA9IGZhbHNlO1xuICAgICAgICAgICAgaWYgKHRoaXMub25EaXNhYmxlKSB0aGlzLm9uRGlzYWJsZSgpO1xuXG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5fcmVmQ291bnRlciA9PT0gMCkge1xuICAgICAgICAgICAgRGVidWcud2FybignVHJ5aW5nIHRvIGRlY3JlbWVudCBsYXllciBjb3VudGVyIGJlbG93IDAnKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLl9yZWZDb3VudGVyLS07XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQWRkcyBhbiBhcnJheSBvZiBtZXNoIGluc3RhbmNlcyB0byB0aGlzIGxheWVyLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4vbWVzaC1pbnN0YW5jZS5qcycpLk1lc2hJbnN0YW5jZVtdfSBtZXNoSW5zdGFuY2VzIC0gQXJyYXkgb2ZcbiAgICAgKiB7QGxpbmsgTWVzaEluc3RhbmNlfS5cbiAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IFtza2lwU2hhZG93Q2FzdGVyc10gLSBTZXQgaXQgdG8gdHJ1ZSBpZiB5b3UgZG9uJ3Qgd2FudCB0aGVzZSBtZXNoIGluc3RhbmNlc1xuICAgICAqIHRvIGNhc3Qgc2hhZG93cyBpbiB0aGlzIGxheWVyLiBEZWZhdWx0cyB0byBmYWxzZS5cbiAgICAgKi9cbiAgICBhZGRNZXNoSW5zdGFuY2VzKG1lc2hJbnN0YW5jZXMsIHNraXBTaGFkb3dDYXN0ZXJzKSB7XG5cbiAgICAgICAgY29uc3QgZGVzdE1lc2hJbnN0YW5jZXMgPSB0aGlzLm1lc2hJbnN0YW5jZXM7XG4gICAgICAgIGNvbnN0IGRlc3RNZXNoSW5zdGFuY2VzU2V0ID0gdGhpcy5tZXNoSW5zdGFuY2VzU2V0O1xuXG4gICAgICAgIC8vIGFkZCBtZXNoIGluc3RhbmNlcyB0byB0aGUgbGF5ZXIncyBhcnJheSBhbmQgdGhlIHNldFxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG1lc2hJbnN0YW5jZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGNvbnN0IG1pID0gbWVzaEluc3RhbmNlc1tpXTtcbiAgICAgICAgICAgIGlmICghZGVzdE1lc2hJbnN0YW5jZXNTZXQuaGFzKG1pKSkge1xuICAgICAgICAgICAgICAgIGRlc3RNZXNoSW5zdGFuY2VzLnB1c2gobWkpO1xuICAgICAgICAgICAgICAgIGRlc3RNZXNoSW5zdGFuY2VzU2V0LmFkZChtaSk7XG4gICAgICAgICAgICAgICAgX3RlbXBNYXRlcmlhbHMuYWRkKG1pLm1hdGVyaWFsKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHNoYWRvdyBjYXN0ZXJzXG4gICAgICAgIGlmICghc2tpcFNoYWRvd0Nhc3RlcnMpIHtcbiAgICAgICAgICAgIHRoaXMuYWRkU2hhZG93Q2FzdGVycyhtZXNoSW5zdGFuY2VzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGNsZWFyIG9sZCBzaGFkZXIgdmFyaWFudHMgaWYgbmVjZXNzYXJ5XG4gICAgICAgIGlmIChfdGVtcE1hdGVyaWFscy5zaXplID4gMCkge1xuICAgICAgICAgICAgY29uc3Qgc2NlbmVTaGFkZXJWZXIgPSB0aGlzLl9zaGFkZXJWZXJzaW9uO1xuICAgICAgICAgICAgX3RlbXBNYXRlcmlhbHMuZm9yRWFjaCgobWF0KSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKHNjZW5lU2hhZGVyVmVyID49IDAgJiYgbWF0Ll9zaGFkZXJWZXJzaW9uICE9PSBzY2VuZVNoYWRlclZlcikgIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gc2tpcCB0aGlzIGZvciBtYXRlcmlhbHMgbm90IHVzaW5nIHZhcmlhbnRzXG4gICAgICAgICAgICAgICAgICAgIGlmIChtYXQuZ2V0U2hhZGVyVmFyaWFudCAhPT0gTWF0ZXJpYWwucHJvdG90eXBlLmdldFNoYWRlclZhcmlhbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGNsZWFyIHNoYWRlciB2YXJpYW50cyBvbiB0aGUgbWF0ZXJpYWwgYW5kIGFsc28gb24gbWVzaCBpbnN0YW5jZXMgdGhhdCB1c2UgaXRcbiAgICAgICAgICAgICAgICAgICAgICAgIG1hdC5jbGVhclZhcmlhbnRzKCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgbWF0Ll9zaGFkZXJWZXJzaW9uID0gc2NlbmVTaGFkZXJWZXI7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBfdGVtcE1hdGVyaWFscy5jbGVhcigpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVtb3ZlcyBtdWx0aXBsZSBtZXNoIGluc3RhbmNlcyBmcm9tIHRoaXMgbGF5ZXIuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi9tZXNoLWluc3RhbmNlLmpzJykuTWVzaEluc3RhbmNlW119IG1lc2hJbnN0YW5jZXMgLSBBcnJheSBvZlxuICAgICAqIHtAbGluayBNZXNoSW5zdGFuY2V9LiBJZiB0aGV5IHdlcmUgYWRkZWQgdG8gdGhpcyBsYXllciwgdGhleSB3aWxsIGJlIHJlbW92ZWQuXG4gICAgICogQHBhcmFtIHtib29sZWFufSBbc2tpcFNoYWRvd0Nhc3RlcnNdIC0gU2V0IGl0IHRvIHRydWUgaWYgeW91IHdhbnQgdG8gc3RpbGwgY2FzdCBzaGFkb3dzIGZyb21cbiAgICAgKiByZW1vdmVkIG1lc2ggaW5zdGFuY2VzIG9yIGlmIHRoZXkgbmV2ZXIgZGlkIGNhc3Qgc2hhZG93cyBiZWZvcmUuIERlZmF1bHRzIHRvIGZhbHNlLlxuICAgICAqL1xuICAgIHJlbW92ZU1lc2hJbnN0YW5jZXMobWVzaEluc3RhbmNlcywgc2tpcFNoYWRvd0Nhc3RlcnMpIHtcblxuICAgICAgICBjb25zdCBkZXN0TWVzaEluc3RhbmNlcyA9IHRoaXMubWVzaEluc3RhbmNlcztcbiAgICAgICAgY29uc3QgZGVzdE1lc2hJbnN0YW5jZXNTZXQgPSB0aGlzLm1lc2hJbnN0YW5jZXNTZXQ7XG5cbiAgICAgICAgLy8gbWVzaCBpbnN0YW5jZXNcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBtZXNoSW5zdGFuY2VzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBtaSA9IG1lc2hJbnN0YW5jZXNbaV07XG5cbiAgICAgICAgICAgIC8vIHJlbW92ZSBmcm9tIG1lc2ggaW5zdGFuY2VzIGxpc3RcbiAgICAgICAgICAgIGlmIChkZXN0TWVzaEluc3RhbmNlc1NldC5oYXMobWkpKSB7XG4gICAgICAgICAgICAgICAgZGVzdE1lc2hJbnN0YW5jZXNTZXQuZGVsZXRlKG1pKTtcbiAgICAgICAgICAgICAgICBjb25zdCBqID0gZGVzdE1lc2hJbnN0YW5jZXMuaW5kZXhPZihtaSk7XG4gICAgICAgICAgICAgICAgaWYgKGogPj0gMCkge1xuICAgICAgICAgICAgICAgICAgICBkZXN0TWVzaEluc3RhbmNlcy5zcGxpY2UoaiwgMSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gc2hhZG93IGNhc3RlcnNcbiAgICAgICAgaWYgKCFza2lwU2hhZG93Q2FzdGVycykge1xuICAgICAgICAgICAgdGhpcy5yZW1vdmVTaGFkb3dDYXN0ZXJzKG1lc2hJbnN0YW5jZXMpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQWRkcyBhbiBhcnJheSBvZiBtZXNoIGluc3RhbmNlcyB0byB0aGlzIGxheWVyLCBidXQgb25seSBhcyBzaGFkb3cgY2FzdGVycyAodGhleSB3aWxsIG5vdCBiZVxuICAgICAqIHJlbmRlcmVkIGFueXdoZXJlLCBidXQgb25seSBjYXN0IHNoYWRvd3Mgb24gb3RoZXIgb2JqZWN0cykuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi9tZXNoLWluc3RhbmNlLmpzJykuTWVzaEluc3RhbmNlW119IG1lc2hJbnN0YW5jZXMgLSBBcnJheSBvZlxuICAgICAqIHtAbGluayBNZXNoSW5zdGFuY2V9LlxuICAgICAqL1xuICAgIGFkZFNoYWRvd0Nhc3RlcnMobWVzaEluc3RhbmNlcykge1xuICAgICAgICBjb25zdCBzaGFkb3dDYXN0ZXJzID0gdGhpcy5zaGFkb3dDYXN0ZXJzO1xuICAgICAgICBjb25zdCBzaGFkb3dDYXN0ZXJzU2V0ID0gdGhpcy5zaGFkb3dDYXN0ZXJzU2V0O1xuXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbWVzaEluc3RhbmNlcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgY29uc3QgbWkgPSBtZXNoSW5zdGFuY2VzW2ldO1xuICAgICAgICAgICAgaWYgKG1pLmNhc3RTaGFkb3cgJiYgIXNoYWRvd0Nhc3RlcnNTZXQuaGFzKG1pKSkge1xuICAgICAgICAgICAgICAgIHNoYWRvd0Nhc3RlcnNTZXQuYWRkKG1pKTtcbiAgICAgICAgICAgICAgICBzaGFkb3dDYXN0ZXJzLnB1c2gobWkpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVtb3ZlcyBtdWx0aXBsZSBtZXNoIGluc3RhbmNlcyBmcm9tIHRoZSBzaGFkb3cgY2FzdGVycyBsaXN0IG9mIHRoaXMgbGF5ZXIsIG1lYW5pbmcgdGhleVxuICAgICAqIHdpbGwgc3RvcCBjYXN0aW5nIHNoYWRvd3MuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi9tZXNoLWluc3RhbmNlLmpzJykuTWVzaEluc3RhbmNlW119IG1lc2hJbnN0YW5jZXMgLSBBcnJheSBvZlxuICAgICAqIHtAbGluayBNZXNoSW5zdGFuY2V9LiBJZiB0aGV5IHdlcmUgYWRkZWQgdG8gdGhpcyBsYXllciwgdGhleSB3aWxsIGJlIHJlbW92ZWQuXG4gICAgICovXG4gICAgcmVtb3ZlU2hhZG93Q2FzdGVycyhtZXNoSW5zdGFuY2VzKSB7XG4gICAgICAgIGNvbnN0IHNoYWRvd0Nhc3RlcnMgPSB0aGlzLnNoYWRvd0Nhc3RlcnM7XG4gICAgICAgIGNvbnN0IHNoYWRvd0Nhc3RlcnNTZXQgPSB0aGlzLnNoYWRvd0Nhc3RlcnNTZXQ7XG5cbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBtZXNoSW5zdGFuY2VzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBtaSA9IG1lc2hJbnN0YW5jZXNbaV07XG4gICAgICAgICAgICBpZiAoc2hhZG93Q2FzdGVyc1NldC5oYXMobWkpKSB7XG4gICAgICAgICAgICAgICAgc2hhZG93Q2FzdGVyc1NldC5kZWxldGUobWkpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGogPSBzaGFkb3dDYXN0ZXJzLmluZGV4T2YobWkpO1xuICAgICAgICAgICAgICAgIGlmIChqID49IDApIHtcbiAgICAgICAgICAgICAgICAgICAgc2hhZG93Q2FzdGVycy5zcGxpY2UoaiwgMSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVtb3ZlcyBhbGwgbWVzaCBpbnN0YW5jZXMgZnJvbSB0aGlzIGxheWVyLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtib29sZWFufSBbc2tpcFNoYWRvd0Nhc3RlcnNdIC0gU2V0IGl0IHRvIHRydWUgaWYgeW91IHdhbnQgdG8gY29udGludWUgdGhlIGV4aXN0aW5nIG1lc2hcbiAgICAgKiBpbnN0YW5jZXMgdG8gY2FzdCBzaGFkb3dzLiBEZWZhdWx0cyB0byBmYWxzZSwgd2hpY2ggcmVtb3ZlcyBzaGFkb3cgY2FzdGVycyBhcyB3ZWxsLlxuICAgICAqL1xuICAgIGNsZWFyTWVzaEluc3RhbmNlcyhza2lwU2hhZG93Q2FzdGVycyA9IGZhbHNlKSB7XG4gICAgICAgIHRoaXMubWVzaEluc3RhbmNlcy5sZW5ndGggPSAwO1xuICAgICAgICB0aGlzLm1lc2hJbnN0YW5jZXNTZXQuY2xlYXIoKTtcblxuICAgICAgICBpZiAoIXNraXBTaGFkb3dDYXN0ZXJzKSB7XG4gICAgICAgICAgICB0aGlzLnNoYWRvd0Nhc3RlcnMubGVuZ3RoID0gMDtcbiAgICAgICAgICAgIHRoaXMuc2hhZG93Q2FzdGVyc1NldC5jbGVhcigpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgbWFya0xpZ2h0c0RpcnR5KCkge1xuICAgICAgICB0aGlzLl9saWdodEhhc2hEaXJ0eSA9IHRydWU7XG4gICAgICAgIHRoaXMuX2xpZ2h0SWRIYXNoRGlydHkgPSB0cnVlO1xuICAgICAgICB0aGlzLl9zcGxpdExpZ2h0c0RpcnR5ID0gdHJ1ZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBZGRzIGEgbGlnaHQgdG8gdGhpcyBsYXllci5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuLi9mcmFtZXdvcmsvY29tcG9uZW50cy9saWdodC9jb21wb25lbnQuanMnKS5MaWdodENvbXBvbmVudH0gbGlnaHQgLSBBXG4gICAgICoge0BsaW5rIExpZ2h0Q29tcG9uZW50fS5cbiAgICAgKi9cbiAgICBhZGRMaWdodChsaWdodCkge1xuXG4gICAgICAgIC8vIGlmIHRoZSBsaWdodCBpcyBub3QgaW4gdGhlIGxheWVyIGFscmVhZHlcbiAgICAgICAgY29uc3QgbCA9IGxpZ2h0LmxpZ2h0O1xuICAgICAgICBpZiAoIXRoaXMuX2xpZ2h0c1NldC5oYXMobCkpIHtcbiAgICAgICAgICAgIHRoaXMuX2xpZ2h0c1NldC5hZGQobCk7XG5cbiAgICAgICAgICAgIHRoaXMuX2xpZ2h0cy5wdXNoKGwpO1xuICAgICAgICAgICAgdGhpcy5tYXJrTGlnaHRzRGlydHkoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChsLnR5cGUgIT09IExJR0hUVFlQRV9ESVJFQ1RJT05BTCkge1xuICAgICAgICAgICAgdGhpcy5fY2x1c3RlcmVkTGlnaHRzU2V0LmFkZChsKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJlbW92ZXMgYSBsaWdodCBmcm9tIHRoaXMgbGF5ZXIuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi4vZnJhbWV3b3JrL2NvbXBvbmVudHMvbGlnaHQvY29tcG9uZW50LmpzJykuTGlnaHRDb21wb25lbnR9IGxpZ2h0IC0gQVxuICAgICAqIHtAbGluayBMaWdodENvbXBvbmVudH0uXG4gICAgICovXG4gICAgcmVtb3ZlTGlnaHQobGlnaHQpIHtcblxuICAgICAgICBjb25zdCBsID0gbGlnaHQubGlnaHQ7XG4gICAgICAgIGlmICh0aGlzLl9saWdodHNTZXQuaGFzKGwpKSB7XG4gICAgICAgICAgICB0aGlzLl9saWdodHNTZXQuZGVsZXRlKGwpO1xuXG4gICAgICAgICAgICB0aGlzLl9saWdodHMuc3BsaWNlKHRoaXMuX2xpZ2h0cy5pbmRleE9mKGwpLCAxKTtcbiAgICAgICAgICAgIHRoaXMubWFya0xpZ2h0c0RpcnR5KCk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAobC50eXBlICE9PSBMSUdIVFRZUEVfRElSRUNUSU9OQUwpIHtcbiAgICAgICAgICAgIHRoaXMuX2NsdXN0ZXJlZExpZ2h0c1NldC5kZWxldGUobCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZW1vdmVzIGFsbCBsaWdodHMgZnJvbSB0aGlzIGxheWVyLlxuICAgICAqL1xuICAgIGNsZWFyTGlnaHRzKCkge1xuXG4gICAgICAgIC8vIG5vdGlmeSBsaWdodHNcbiAgICAgICAgdGhpcy5fbGlnaHRzU2V0LmZvckVhY2gobGlnaHQgPT4gbGlnaHQucmVtb3ZlTGF5ZXIodGhpcykpO1xuXG4gICAgICAgIHRoaXMuX2xpZ2h0c1NldC5jbGVhcigpO1xuICAgICAgICB0aGlzLl9jbHVzdGVyZWRMaWdodHNTZXQuY2xlYXIoKTtcbiAgICAgICAgdGhpcy5fbGlnaHRzLmxlbmd0aCA9IDA7XG4gICAgICAgIHRoaXMubWFya0xpZ2h0c0RpcnR5KCk7XG4gICAgfVxuXG4gICAgZ2V0IHNwbGl0TGlnaHRzKCkge1xuXG4gICAgICAgIGlmICh0aGlzLl9zcGxpdExpZ2h0c0RpcnR5KSB7XG4gICAgICAgICAgICB0aGlzLl9zcGxpdExpZ2h0c0RpcnR5ID0gZmFsc2U7XG5cbiAgICAgICAgICAgIGNvbnN0IHNwbGl0TGlnaHRzID0gdGhpcy5fc3BsaXRMaWdodHM7XG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHNwbGl0TGlnaHRzLmxlbmd0aDsgaSsrKVxuICAgICAgICAgICAgICAgIHNwbGl0TGlnaHRzW2ldLmxlbmd0aCA9IDA7XG5cbiAgICAgICAgICAgIGNvbnN0IGxpZ2h0cyA9IHRoaXMuX2xpZ2h0cztcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbGlnaHRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgbGlnaHQgPSBsaWdodHNbaV07XG4gICAgICAgICAgICAgICAgaWYgKGxpZ2h0LmVuYWJsZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgc3BsaXRMaWdodHNbbGlnaHQuX3R5cGVdLnB1c2gobGlnaHQpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gc29ydCB0aGUgbGlnaHRzIGJ5IHRoZWlyIGtleSwgYXMgdGhlIG9yZGVyIG9mIGxpZ2h0cyBpcyB1c2VkIHRvIGdlbmVyYXRlIHNoYWRlciBnZW5lcmF0aW9uIGtleSxcbiAgICAgICAgICAgIC8vIGFuZCB0aGlzIGF2b2lkcyBuZXcgc2hhZGVycyBiZWluZyBnZW5lcmF0ZWQgd2hlbiBsaWdodHMgYXJlIHJlb3JkZXJlZFxuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzcGxpdExpZ2h0cy5sZW5ndGg7IGkrKylcbiAgICAgICAgICAgICAgICBzcGxpdExpZ2h0c1tpXS5zb3J0KChhLCBiKSA9PiBhLmtleSAtIGIua2V5KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0aGlzLl9zcGxpdExpZ2h0cztcbiAgICB9XG5cbiAgICBldmFsdWF0ZUxpZ2h0SGFzaChsb2NhbExpZ2h0cywgZGlyZWN0aW9uYWxMaWdodHMsIHVzZUlkcykge1xuXG4gICAgICAgIGxldCBoYXNoID0gMDtcblxuICAgICAgICAvLyBzZWxlY3QgbG9jYWwvZGlyZWN0aW9uYWwgbGlnaHRzIGJhc2VkIG9uIHJlcXVlc3RcbiAgICAgICAgY29uc3QgbGlnaHRzID0gdGhpcy5fbGlnaHRzO1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGxpZ2h0cy5sZW5ndGg7IGkrKykge1xuXG4gICAgICAgICAgICBjb25zdCBpc0xvY2FsTGlnaHQgPSBsaWdodHNbaV0udHlwZSAhPT0gTElHSFRUWVBFX0RJUkVDVElPTkFMO1xuXG4gICAgICAgICAgICBpZiAoKGxvY2FsTGlnaHRzICYmIGlzTG9jYWxMaWdodCkgfHwgKGRpcmVjdGlvbmFsTGlnaHRzICYmICFpc0xvY2FsTGlnaHQpKSB7XG4gICAgICAgICAgICAgICAgbGlnaHRLZXlzLnB1c2godXNlSWRzID8gbGlnaHRzW2ldLmlkIDogbGlnaHRzW2ldLmtleSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAobGlnaHRLZXlzLmxlbmd0aCA+IDApIHtcblxuICAgICAgICAgICAgLy8gc29ydCB0aGUga2V5cyB0byBtYWtlIHN1cmUgdGhlIGhhc2ggaXMgdGhlIHNhbWUgZm9yIHRoZSBzYW1lIHNldCBvZiBsaWdodHNcbiAgICAgICAgICAgIGxpZ2h0S2V5cy5zb3J0KCk7XG5cbiAgICAgICAgICAgIGhhc2ggPSBoYXNoMzJGbnYxYShsaWdodEtleXMpO1xuICAgICAgICAgICAgbGlnaHRLZXlzLmxlbmd0aCA9IDA7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gaGFzaDtcbiAgICB9XG5cblxuICAgIGdldExpZ2h0SGFzaChpc0NsdXN0ZXJlZCkge1xuICAgICAgICBpZiAodGhpcy5fbGlnaHRIYXNoRGlydHkpIHtcbiAgICAgICAgICAgIHRoaXMuX2xpZ2h0SGFzaERpcnR5ID0gZmFsc2U7XG5cbiAgICAgICAgICAgIC8vIEdlbmVyYXRlIGhhc2ggdG8gY2hlY2sgaWYgbGF5ZXJzIGhhdmUgdGhlIHNhbWUgc2V0IG9mIGxpZ2h0cyBpbmRlcGVuZGVudCBvZiB0aGVpciBvcmRlci5cbiAgICAgICAgICAgIC8vIEFsd2F5cyB1c2UgZGlyZWN0aW9uYWwgbGlnaHRzLiBBZGRpdGlvbmFsbHkgdXNlIGxvY2FsIGxpZ2h0cyBpZiBjbHVzdGVyZWQgbGlnaHRpbmcgaXMgZGlzYWJsZWQuXG4gICAgICAgICAgICAvLyAob25seSBkaXJlY3Rpb25hbCBsaWdodHMgYWZmZWN0IHRoZSBzaGFkZXIgZ2VuZXJhdGlvbiBmb3IgY2x1c3RlcmVkIGxpZ2h0aW5nKVxuICAgICAgICAgICAgdGhpcy5fbGlnaHRIYXNoID0gdGhpcy5ldmFsdWF0ZUxpZ2h0SGFzaCghaXNDbHVzdGVyZWQsIHRydWUsIGZhbHNlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0aGlzLl9saWdodEhhc2g7XG4gICAgfVxuXG4gICAgLy8gVGhpcyBpcyBvbmx5IHVzZWQgaW4gY2x1c3RlcmVkIGxpZ2h0aW5nIG1vZGVcbiAgICBnZXRMaWdodElkSGFzaCgpIHtcbiAgICAgICAgaWYgKHRoaXMuX2xpZ2h0SWRIYXNoRGlydHkpIHtcbiAgICAgICAgICAgIHRoaXMuX2xpZ2h0SWRIYXNoRGlydHkgPSBmYWxzZTtcblxuICAgICAgICAgICAgLy8gR2VuZXJhdGUgaGFzaCBiYXNlZCBvbiBJZHMgb2YgbGlnaHRzIHNvcnRlZCBieSBpZHMsIHRvIGNoZWNrIGlmIHRoZSBsYXllcnMgaGF2ZSB0aGUgc2FtZSBzZXQgb2YgbGlnaHRzXG4gICAgICAgICAgICAvLyBPbmx5IHVzZSBsb2NhbCBsaWdodHMgKGRpcmVjdGlvbmFsIGxpZ2h0cyBhcmUgbm90IHVzZWQgZm9yIGNsdXN0ZXJlZCBsaWdodGluZylcbiAgICAgICAgICAgIHRoaXMuX2xpZ2h0SWRIYXNoID0gdGhpcy5ldmFsdWF0ZUxpZ2h0SGFzaCh0cnVlLCBmYWxzZSwgdHJ1ZSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdGhpcy5fbGlnaHRJZEhhc2g7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQWRkcyBhIGNhbWVyYSB0byB0aGlzIGxheWVyLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4uL2ZyYW1ld29yay9jb21wb25lbnRzL2NhbWVyYS9jb21wb25lbnQuanMnKS5DYW1lcmFDb21wb25lbnR9IGNhbWVyYSAtIEFcbiAgICAgKiB7QGxpbmsgQ2FtZXJhQ29tcG9uZW50fS5cbiAgICAgKi9cbiAgICBhZGRDYW1lcmEoY2FtZXJhKSB7XG4gICAgICAgIGlmICh0aGlzLmNhbWVyYXMuaW5kZXhPZihjYW1lcmEpID49IDApIHJldHVybjtcbiAgICAgICAgdGhpcy5jYW1lcmFzLnB1c2goY2FtZXJhKTtcbiAgICAgICAgdGhpcy5fZGlydHlDYW1lcmFzID0gdHJ1ZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZW1vdmVzIGEgY2FtZXJhIGZyb20gdGhpcyBsYXllci5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuLi9mcmFtZXdvcmsvY29tcG9uZW50cy9jYW1lcmEvY29tcG9uZW50LmpzJykuQ2FtZXJhQ29tcG9uZW50fSBjYW1lcmEgLSBBXG4gICAgICoge0BsaW5rIENhbWVyYUNvbXBvbmVudH0uXG4gICAgICovXG4gICAgcmVtb3ZlQ2FtZXJhKGNhbWVyYSkge1xuICAgICAgICBjb25zdCBpbmRleCA9IHRoaXMuY2FtZXJhcy5pbmRleE9mKGNhbWVyYSk7XG4gICAgICAgIGlmIChpbmRleCA+PSAwKSB7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYXMuc3BsaWNlKGluZGV4LCAxKTtcbiAgICAgICAgICAgIHRoaXMuX2RpcnR5Q2FtZXJhcyA9IHRydWU7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZW1vdmVzIGFsbCBjYW1lcmFzIGZyb20gdGhpcyBsYXllci5cbiAgICAgKi9cbiAgICBjbGVhckNhbWVyYXMoKSB7XG4gICAgICAgIHRoaXMuY2FtZXJhcy5sZW5ndGggPSAwO1xuICAgICAgICB0aGlzLl9kaXJ0eUNhbWVyYXMgPSB0cnVlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuL21lc2gtaW5zdGFuY2UuanMnKS5NZXNoSW5zdGFuY2VbXX0gZHJhd0NhbGxzIC0gQXJyYXkgb2YgbWVzaCBpbnN0YW5jZXMuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGRyYXdDYWxsc0NvdW50IC0gTnVtYmVyIG9mIG1lc2ggaW5zdGFuY2VzLlxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuLi9jb3JlL21hdGgvdmVjMy5qcycpLlZlYzN9IGNhbVBvcyAtIENhbWVyYSBwb3NpdGlvbi5cbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi4vY29yZS9tYXRoL3ZlYzMuanMnKS5WZWMzfSBjYW1Gd2QgLSBDYW1lcmEgZm9yd2FyZCB2ZWN0b3IuXG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfY2FsY3VsYXRlU29ydERpc3RhbmNlcyhkcmF3Q2FsbHMsIGRyYXdDYWxsc0NvdW50LCBjYW1Qb3MsIGNhbUZ3ZCkge1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGRyYXdDYWxsc0NvdW50OyBpKyspIHtcbiAgICAgICAgICAgIGNvbnN0IGRyYXdDYWxsID0gZHJhd0NhbGxzW2ldO1xuICAgICAgICAgICAgaWYgKGRyYXdDYWxsLmxheWVyIDw9IExBWUVSX0ZYKSBjb250aW51ZTsgLy8gT25seSBhbHBoYSBzb3J0IG1lc2ggaW5zdGFuY2VzIGluIHRoZSBtYWluIHdvcmxkIChiYWNrd2FyZHMgY29tcClcbiAgICAgICAgICAgIGlmIChkcmF3Q2FsbC5jYWxjdWxhdGVTb3J0RGlzdGFuY2UpIHtcbiAgICAgICAgICAgICAgICBkcmF3Q2FsbC56ZGlzdCA9IGRyYXdDYWxsLmNhbGN1bGF0ZVNvcnREaXN0YW5jZShkcmF3Q2FsbCwgY2FtUG9zLCBjYW1Gd2QpO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgbWVzaFBvcyA9IGRyYXdDYWxsLmFhYmIuY2VudGVyO1xuICAgICAgICAgICAgY29uc3QgdGVtcHggPSBtZXNoUG9zLnggLSBjYW1Qb3MueDtcbiAgICAgICAgICAgIGNvbnN0IHRlbXB5ID0gbWVzaFBvcy55IC0gY2FtUG9zLnk7XG4gICAgICAgICAgICBjb25zdCB0ZW1weiA9IG1lc2hQb3MueiAtIGNhbVBvcy56O1xuICAgICAgICAgICAgZHJhd0NhbGwuemRpc3QgPSB0ZW1weCAqIGNhbUZ3ZC54ICsgdGVtcHkgKiBjYW1Gd2QueSArIHRlbXB6ICogY2FtRndkLno7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBHZXQgYWNjZXNzIHRvIGN1bGxlZCBtZXNoIGluc3RhbmNlcyBmb3IgdGhlIHByb3ZpZGVkIGNhbWVyYS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuL2NhbWVyYS5qcycpLkNhbWVyYX0gY2FtZXJhIC0gVGhlIGNhbWVyYS5cbiAgICAgKiBAcmV0dXJucyB7Q3VsbGVkSW5zdGFuY2VzfSBUaGUgY3VsbGVkIG1lc2ggaW5zdGFuY2VzLlxuICAgICAqIEBpZ25vcmVcbiAgICAgKi9cbiAgICBnZXRDdWxsZWRJbnN0YW5jZXMoY2FtZXJhKSB7XG4gICAgICAgIGxldCBpbnN0YW5jZXMgPSB0aGlzLl92aXNpYmxlSW5zdGFuY2VzLmdldChjYW1lcmEpO1xuICAgICAgICBpZiAoIWluc3RhbmNlcykge1xuICAgICAgICAgICAgaW5zdGFuY2VzID0gbmV3IEN1bGxlZEluc3RhbmNlcygpO1xuICAgICAgICAgICAgdGhpcy5fdmlzaWJsZUluc3RhbmNlcy5zZXQoY2FtZXJhLCBpbnN0YW5jZXMpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBpbnN0YW5jZXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4vY2FtZXJhLmpzJykuQ2FtZXJhfSBjYW1lcmEgLSBUaGUgY2FtZXJhIHRvIHNvcnQgdGhlIHZpc2libGUgbWVzaCBpbnN0YW5jZXNcbiAgICAgKiBmb3IuXG4gICAgICogQHBhcmFtIHtib29sZWFufSB0cmFuc3BhcmVudCAtIFRydWUgaWYgdHJhbnNwYXJlbnQgc29ydGluZyBzaG91bGQgYmUgdXNlZC5cbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgc29ydFZpc2libGUoY2FtZXJhLCB0cmFuc3BhcmVudCkge1xuICAgICAgICBjb25zdCBzb3J0TW9kZSA9IHRyYW5zcGFyZW50ID8gdGhpcy50cmFuc3BhcmVudFNvcnRNb2RlIDogdGhpcy5vcGFxdWVTb3J0TW9kZTtcbiAgICAgICAgaWYgKHNvcnRNb2RlID09PSBTT1JUTU9ERV9OT05FKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIGNvbnN0IGN1bGxlZEluc3RhbmNlcyA9IHRoaXMuZ2V0Q3VsbGVkSW5zdGFuY2VzKGNhbWVyYSk7XG4gICAgICAgIGNvbnN0IGluc3RhbmNlcyA9IHRyYW5zcGFyZW50ID8gY3VsbGVkSW5zdGFuY2VzLnRyYW5zcGFyZW50IDogY3VsbGVkSW5zdGFuY2VzLm9wYXF1ZTtcbiAgICAgICAgY29uc3QgY2FtZXJhTm9kZSA9IGNhbWVyYS5ub2RlO1xuXG4gICAgICAgIGlmIChzb3J0TW9kZSA9PT0gU09SVE1PREVfQ1VTVE9NKSB7XG4gICAgICAgICAgICBjb25zdCBzb3J0UG9zID0gY2FtZXJhTm9kZS5nZXRQb3NpdGlvbigpO1xuICAgICAgICAgICAgY29uc3Qgc29ydERpciA9IGNhbWVyYU5vZGUuZm9yd2FyZDtcbiAgICAgICAgICAgIGlmICh0aGlzLmN1c3RvbUNhbGN1bGF0ZVNvcnRWYWx1ZXMpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmN1c3RvbUNhbGN1bGF0ZVNvcnRWYWx1ZXMoaW5zdGFuY2VzLCBpbnN0YW5jZXMubGVuZ3RoLCBzb3J0UG9zLCBzb3J0RGlyKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHRoaXMuY3VzdG9tU29ydENhbGxiYWNrKSB7XG4gICAgICAgICAgICAgICAgaW5zdGFuY2VzLnNvcnQodGhpcy5jdXN0b21Tb3J0Q2FsbGJhY2spO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaWYgKHNvcnRNb2RlID09PSBTT1JUTU9ERV9CQUNLMkZST05UIHx8IHNvcnRNb2RlID09PSBTT1JUTU9ERV9GUk9OVDJCQUNLKSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgc29ydFBvcyA9IGNhbWVyYU5vZGUuZ2V0UG9zaXRpb24oKTtcbiAgICAgICAgICAgICAgICBjb25zdCBzb3J0RGlyID0gY2FtZXJhTm9kZS5mb3J3YXJkO1xuICAgICAgICAgICAgICAgIHRoaXMuX2NhbGN1bGF0ZVNvcnREaXN0YW5jZXMoaW5zdGFuY2VzLCBpbnN0YW5jZXMubGVuZ3RoLCBzb3J0UG9zLCBzb3J0RGlyKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaW5zdGFuY2VzLnNvcnQoc29ydENhbGxiYWNrc1tzb3J0TW9kZV0pO1xuICAgICAgICB9XG4gICAgfVxufVxuXG5leHBvcnQgeyBMYXllciwgQ3VsbGVkSW5zdGFuY2VzIH07XG4iXSwibmFtZXMiOlsic29ydE1hbnVhbCIsImRyYXdDYWxsQSIsImRyYXdDYWxsQiIsImRyYXdPcmRlciIsInNvcnRNYXRlcmlhbE1lc2giLCJrZXlBIiwiX2tleSIsIlNPUlRLRVlfRk9SV0FSRCIsImtleUIiLCJtZXNoIiwiaWQiLCJzb3J0QmFja1RvRnJvbnQiLCJ6ZGlzdCIsInNvcnRGcm9udFRvQmFjayIsInNvcnRDYWxsYmFja3MiLCJsYXllckNvdW50ZXIiLCJsaWdodEtleXMiLCJfdGVtcE1hdGVyaWFscyIsIlNldCIsIkN1bGxlZEluc3RhbmNlcyIsImNvbnN0cnVjdG9yIiwib3BhcXVlIiwidHJhbnNwYXJlbnQiLCJMYXllciIsIm9wdGlvbnMiLCJfb3B0aW9ucyRlbmFibGVkIiwiX29wdGlvbnMkb3BhcXVlU29ydE1vIiwiX29wdGlvbnMkdHJhbnNwYXJlbnRTIiwiX29wdGlvbnMkc2hhZGVyUGFzcyIsIm1lc2hJbnN0YW5jZXMiLCJtZXNoSW5zdGFuY2VzU2V0Iiwic2hhZG93Q2FzdGVycyIsInNoYWRvd0Nhc3RlcnNTZXQiLCJfdmlzaWJsZUluc3RhbmNlcyIsIldlYWtNYXAiLCJfbGlnaHRzIiwiX2xpZ2h0c1NldCIsIl9jbHVzdGVyZWRMaWdodHNTZXQiLCJfc3BsaXRMaWdodHMiLCJfc3BsaXRMaWdodHNEaXJ0eSIsInJlcXVpcmVzTGlnaHRDdWJlIiwidW5kZWZpbmVkIiwiTWF0aCIsIm1heCIsIm5hbWUiLCJfZW5hYmxlZCIsImVuYWJsZWQiLCJfcmVmQ291bnRlciIsIm9wYXF1ZVNvcnRNb2RlIiwiU09SVE1PREVfTUFURVJJQUxNRVNIIiwidHJhbnNwYXJlbnRTb3J0TW9kZSIsIlNPUlRNT0RFX0JBQ0syRlJPTlQiLCJyZW5kZXJUYXJnZXQiLCJzaGFkZXJQYXNzIiwiU0hBREVSX0ZPUldBUkQiLCJfY2xlYXJDb2xvckJ1ZmZlciIsImNsZWFyQ29sb3JCdWZmZXIiLCJfY2xlYXJEZXB0aEJ1ZmZlciIsImNsZWFyRGVwdGhCdWZmZXIiLCJfY2xlYXJTdGVuY2lsQnVmZmVyIiwiY2xlYXJTdGVuY2lsQnVmZmVyIiwib25QcmVDdWxsIiwib25QcmVSZW5kZXIiLCJvblByZVJlbmRlck9wYXF1ZSIsIm9uUHJlUmVuZGVyVHJhbnNwYXJlbnQiLCJvblBvc3RDdWxsIiwib25Qb3N0UmVuZGVyIiwib25Qb3N0UmVuZGVyT3BhcXVlIiwib25Qb3N0UmVuZGVyVHJhbnNwYXJlbnQiLCJvbkRyYXdDYWxsIiwib25FbmFibGUiLCJvbkRpc2FibGUiLCJsYXllclJlZmVyZW5jZSIsImN1c3RvbVNvcnRDYWxsYmFjayIsImN1c3RvbUNhbGN1bGF0ZVNvcnRWYWx1ZXMiLCJjYW1lcmFzIiwiX2RpcnR5Q2FtZXJhcyIsIl9saWdodEhhc2giLCJfbGlnaHRIYXNoRGlydHkiLCJfbGlnaHRJZEhhc2giLCJfbGlnaHRJZEhhc2hEaXJ0eSIsInNraXBSZW5kZXJBZnRlciIsIk51bWJlciIsIk1BWF9WQUxVRSIsIl9za2lwUmVuZGVyQ291bnRlciIsIl9yZW5kZXJUaW1lIiwiX2ZvcndhcmREcmF3Q2FsbHMiLCJfc2hhZG93RHJhd0NhbGxzIiwiX3NoYWRlclZlcnNpb24iLCJ2YWwiLCJpbmNyZW1lbnRDb3VudGVyIiwiZGVjcmVtZW50Q291bnRlciIsImhhc0NsdXN0ZXJlZExpZ2h0cyIsInNpemUiLCJjbHVzdGVyZWRMaWdodHNTZXQiLCJEZWJ1ZyIsIndhcm4iLCJhZGRNZXNoSW5zdGFuY2VzIiwic2tpcFNoYWRvd0Nhc3RlcnMiLCJkZXN0TWVzaEluc3RhbmNlcyIsImRlc3RNZXNoSW5zdGFuY2VzU2V0IiwiaSIsImxlbmd0aCIsIm1pIiwiaGFzIiwicHVzaCIsImFkZCIsIm1hdGVyaWFsIiwiYWRkU2hhZG93Q2FzdGVycyIsInNjZW5lU2hhZGVyVmVyIiwiZm9yRWFjaCIsIm1hdCIsImdldFNoYWRlclZhcmlhbnQiLCJNYXRlcmlhbCIsInByb3RvdHlwZSIsImNsZWFyVmFyaWFudHMiLCJjbGVhciIsInJlbW92ZU1lc2hJbnN0YW5jZXMiLCJkZWxldGUiLCJqIiwiaW5kZXhPZiIsInNwbGljZSIsInJlbW92ZVNoYWRvd0Nhc3RlcnMiLCJjYXN0U2hhZG93IiwiY2xlYXJNZXNoSW5zdGFuY2VzIiwibWFya0xpZ2h0c0RpcnR5IiwiYWRkTGlnaHQiLCJsaWdodCIsImwiLCJ0eXBlIiwiTElHSFRUWVBFX0RJUkVDVElPTkFMIiwicmVtb3ZlTGlnaHQiLCJjbGVhckxpZ2h0cyIsInJlbW92ZUxheWVyIiwic3BsaXRMaWdodHMiLCJsaWdodHMiLCJfdHlwZSIsInNvcnQiLCJhIiwiYiIsImtleSIsImV2YWx1YXRlTGlnaHRIYXNoIiwibG9jYWxMaWdodHMiLCJkaXJlY3Rpb25hbExpZ2h0cyIsInVzZUlkcyIsImhhc2giLCJpc0xvY2FsTGlnaHQiLCJoYXNoMzJGbnYxYSIsImdldExpZ2h0SGFzaCIsImlzQ2x1c3RlcmVkIiwiZ2V0TGlnaHRJZEhhc2giLCJhZGRDYW1lcmEiLCJjYW1lcmEiLCJyZW1vdmVDYW1lcmEiLCJpbmRleCIsImNsZWFyQ2FtZXJhcyIsIl9jYWxjdWxhdGVTb3J0RGlzdGFuY2VzIiwiZHJhd0NhbGxzIiwiZHJhd0NhbGxzQ291bnQiLCJjYW1Qb3MiLCJjYW1Gd2QiLCJkcmF3Q2FsbCIsImxheWVyIiwiTEFZRVJfRlgiLCJjYWxjdWxhdGVTb3J0RGlzdGFuY2UiLCJtZXNoUG9zIiwiYWFiYiIsImNlbnRlciIsInRlbXB4IiwieCIsInRlbXB5IiwieSIsInRlbXB6IiwieiIsImdldEN1bGxlZEluc3RhbmNlcyIsImluc3RhbmNlcyIsImdldCIsInNldCIsInNvcnRWaXNpYmxlIiwic29ydE1vZGUiLCJTT1JUTU9ERV9OT05FIiwiY3VsbGVkSW5zdGFuY2VzIiwiY2FtZXJhTm9kZSIsIm5vZGUiLCJTT1JUTU9ERV9DVVNUT00iLCJzb3J0UG9zIiwiZ2V0UG9zaXRpb24iLCJzb3J0RGlyIiwiZm9yd2FyZCIsIlNPUlRNT0RFX0ZST05UMkJBQ0siXSwibWFwcGluZ3MiOiI7Ozs7O0FBWUEsU0FBU0EsVUFBVUEsQ0FBQ0MsU0FBUyxFQUFFQyxTQUFTLEVBQUU7QUFDdEMsRUFBQSxPQUFPRCxTQUFTLENBQUNFLFNBQVMsR0FBR0QsU0FBUyxDQUFDQyxTQUFTLENBQUE7QUFDcEQsQ0FBQTtBQUVBLFNBQVNDLGdCQUFnQkEsQ0FBQ0gsU0FBUyxFQUFFQyxTQUFTLEVBQUU7QUFDNUMsRUFBQSxNQUFNRyxJQUFJLEdBQUdKLFNBQVMsQ0FBQ0ssSUFBSSxDQUFDQyxlQUFlLENBQUMsQ0FBQTtBQUM1QyxFQUFBLE1BQU1DLElBQUksR0FBR04sU0FBUyxDQUFDSSxJQUFJLENBQUNDLGVBQWUsQ0FBQyxDQUFBO0VBQzVDLElBQUlGLElBQUksS0FBS0csSUFBSSxJQUFJUCxTQUFTLENBQUNRLElBQUksSUFBSVAsU0FBUyxDQUFDTyxJQUFJLEVB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
