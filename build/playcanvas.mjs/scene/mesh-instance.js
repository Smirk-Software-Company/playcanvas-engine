import { Debug, DebugHelper } from '../core/debug.js';
import { BoundingBox } from '../core/shape/bounding-box.js';
import { BoundingSphere } from '../core/shape/bounding-sphere.js';
import { BindGroup } from '../platform/graphics/bind-group.js';
import { UniformBuffer } from '../platform/graphics/uniform-buffer.js';
import { MASK_AFFECT_DYNAMIC, SHADERDEF_UV0, SHADERDEF_UV1, SHADERDEF_VCOLOR, SHADERDEF_TANGENTS, LAYER_WORLD, RENDERSTYLE_SOLID, SHADERDEF_NOSHADOW, SHADERDEF_SKIN, SHADERDEF_MORPH_TEXTURE_BASED, SHADERDEF_MORPH_POSITION, SHADERDEF_MORPH_NORMAL, SHADERDEF_SCREENSPACE, SORTKEY_FORWARD, BLEND_NORMAL, BLEND_NONE, SHADERDEF_INSTANCING, MASK_AFFECT_LIGHTMAPPED, MASK_BAKE, SHADERDEF_LM, SHADERDEF_DIRLM, SHADERDEF_LMAMBIENT } from './constants.js';
import { GraphNode } from './graph-node.js';
import { getDefaultMaterial } from './materials/default-material.js';
import { LightmapCache } from './graphics/lightmap-cache.js';

let id = 0;
const _tmpAabb = new BoundingBox();
const _tempBoneAabb = new BoundingBox();
const _tempSphere = new BoundingSphere();
const _meshSet = new Set();

/**
 * Internal data structure used to store data used by hardware instancing.
 *
 * @ignore
 */
class InstancingData {
  /**
   * @param {number} numObjects - The number of objects instanced.
   */
  constructor(numObjects) {
    /** @type {import('../platform/graphics/vertex-buffer.js').VertexBuffer|null} */
    this.vertexBuffer = null;
    this.count = numObjects;
  }
}

/**
 * Internal helper class for storing the shader and related mesh bind group in the shader cache.
 *
 * @ignore
 */
class ShaderInstance {
  constructor() {
    /**
     * A shader.
     *
     * @type {import('../platform/graphics/shader.js').Shader|undefined}
     */
    this.shader = void 0;
    /**
     * A bind group storing mesh uniforms for the shader.
     *
     * @type {BindGroup|null}
     */
    this.bindGroup = null;
  }
  /**
   * Returns the mesh bind group for the shader.
   *
   * @param {import('../platform/graphics/graphics-device.js').GraphicsDevice} device - The
   * graphics device.
   * @returns {BindGroup} - The mesh bind group.
   */
  getBindGroup(device) {
    // create bind group
    if (!this.bindGroup) {
      const shader = this.shader;
      Debug.assert(shader);

      // mesh uniform buffer
      const ubFormat = shader.meshUniformBufferFormat;
      Debug.assert(ubFormat);
      const uniformBuffer = new UniformBuffer(device, ubFormat, false);

      // mesh bind group
      const bindGroupFormat = shader.meshBindGroupFormat;
      Debug.assert(bindGroupFormat);
      this.bindGroup = new BindGroup(device, bindGroupFormat, uniformBuffer);
      DebugHelper.setName(this.bindGroup, `MeshBindGroup_${this.bindGroup.id}`);
    }
    return this.bindGroup;
  }
  destroy() {
    const group = this.bindGroup;
    if (group) {
      var _group$defaultUniform;
      (_group$defaultUniform = group.defaultUniformBuffer) == null ? void 0 : _group$defaultUniform.destroy();
      group.destroy();
      this.bindGroup = null;
    }
  }
}

/**
 * An entry in the shader cache, representing shaders for this mesh instance and a specific shader
 * pass.
 *
 * @ignore
 */
class ShaderCacheEntry {
  constructor() {
    /**
     * The shader instances. Looked up by lightHash, which represents an ordered set of lights.
     *
     * @type {Map<number, ShaderInstance>}
     */
    this.shaderInstances = new Map();
  }
  destroy() {
    this.shaderInstances.forEach(instance => instance.destroy());
    this.shaderInstances.clear();
  }
}

/**
 * Callback used by {@link Layer} to calculate the "sort distance" for a {@link MeshInstance},
 * which determines its place in the render order.
 *
 * @callback CalculateSortDistanceCallback
 * @param {MeshInstance} meshInstance - The mesh instance.
 * @param {import('../core/math/vec3.js').Vec3} cameraPosition - The position of the camera.
 * @param {import('../core/math/vec3.js').Vec3} cameraForward - The forward vector of the camera.
 */

/**
 * An instance of a {@link Mesh}. A single mesh can be referenced by many mesh instances that can
 * have different transforms and materials.
 *
 * @category Graphics
 */
class MeshInstance {
  /**
   * Create a new MeshInstance instance.
   *
   * @param {import('./mesh.js').Mesh} mesh - The graphics mesh to instance.
   * @param {import('./materials/material.js').Material} material - The material to use for this
   * mesh instance.
   * @param {GraphNode} [node] - The graph node defining the transform for this instance. This
   * parameter is optional when used with {@link RenderComponent} and will use the node the
   * component is attached to.
   * @example
   * // Create a mesh instance pointing to a 1x1x1 'cube' mesh
   * const mesh = pc.createBox(graphicsDevice);
   * const material = new pc.StandardMaterial();
   *
   * const meshInstance = new pc.MeshInstance(mesh, material);
   *
   * const entity = new pc.Entity();
   * entity.addComponent('render', {
   *     meshInstances: [meshInstance]
   * });
   *
   * // Add the entity to the scene hierarchy
   * this.app.scene.root.addChild(entity);
   */
  constructor(mesh, material, node = null) {
    /**
     * Enable rendering for this mesh instance. Use visible property to enable/disable
     * rendering without overhead of removing from scene. But note that the mesh instance is
     * still in the hierarchy and still in the draw call list.
     *
     * @type {boolean}
     */
    this.visible = true;
    /**
     * Enable shadow casting for this mesh instance. Use this property to enable/disable
     * shadow casting without overhead of removing from scene. Note that this property does not
     * add the mesh instance to appropriate list of shadow casters on a {@link Layer}, but
     * allows mesh to be skipped from shadow casting while it is in the list already. Defaults to
     * false.
     *
     * @type {boolean}
     */
    this.castShadow = false;
    /**
     * True if the material of the mesh instance is transparent. Optimization to avoid accessing the
     * material. Updated by the material instance itself.
     *
     * @ignore
     */
    this.transparent = false;
    /**
     * @type {import('./materials/material.js').Material|null}
     * @private
     */
    this._material = null;
    /**
     * An array of shader cache entries, indexed by the shader pass constant (SHADER_FORWARD..). The
     * value stores all shaders and bind groups for the shader pass for various light combinations.
     *
     * @type {Array<ShaderCacheEntry|null>}
     * @private
     */
    this._shaderCache = [];
    /** @ignore */
    this.id = id++;
    /**
     * True if the mesh instance is pickable by the {@link Picker}. Defaults to true.
     *
     * @type {boolean}
     * @ignore
     */
    this.pick = true;
    // if first parameter is of GraphNode type, handle previous constructor signature: (node, mesh, material)
    if (mesh instanceof GraphNode) {
      const temp = mesh;
      mesh = material;
      material = node;
      node = temp;
    }
    this._key = [0, 0];

    /**
     * The graph node defining the transform for this instance.
     *
     * @type {GraphNode}
     */
    this.node = node; // The node that defines the transform of the mesh instance
    this._mesh = mesh; // The mesh that this instance renders
    mesh.incRefCount();
    this.material = material; // The material with which to render this instance

    this._shaderDefs = MASK_AFFECT_DYNAMIC << 16; // 2 byte toggles, 2 bytes light mask; Default value is no toggles and mask = pc.MASK_AFFECT_DYNAMIC
    this._shaderDefs |= mesh.vertexBuffer.format.hasUv0 ? SHADERDEF_UV0 : 0;
    this._shaderDefs |= mesh.vertexBuffer.format.hasUv1 ? SHADERDEF_UV1 : 0;
    this._shaderDefs |= mesh.vertexBuffer.format.hasColor ? SHADERDEF_VCOLOR : 0;
    this._shaderDefs |= mesh.vertexBuffer.format.hasTangents ? SHADERDEF_TANGENTS : 0;

    // Render options
    this.layer = LAYER_WORLD; // legacy
    /** @private */
    this._renderStyle = RENDERSTYLE_SOLID;
    this._receiveShadow = true;
    this._screenSpace = false;
    this._noDepthDrawGl1 = false;

    /**
     * Controls whether the mesh instance can be culled by frustum culling
     * ({@link CameraComponent#frustumCulling}). Defaults to true.
     *
     * @type {boolean}
     */
    this.cull = true;
    this._updateAabb = true;
    this._updateAabbFunc = null;
    this._calculateSortDistance = null;

    // 64-bit integer key that defines render order of this mesh instance
    this.updateKey();

    /**
     * @type {import('./skin-instance.js').SkinInstance|null}
     * @private
     */
    this._skinInstance = null;

    /**
     * @type {import('./morph-instance.js').MorphInstance|null}
     * @private
     */
    this._morphInstance = null;
    this.instancingData = null;

    /**
     * @type {BoundingBox|null}
     * @private
     */
    this._customAabb = null;

    // World space AABB
    this.aabb = new BoundingBox();
    this._aabbVer = -1;

    /**
     * Use this value to affect rendering order of mesh instances. Only used when mesh
     * instances are added to a {@link Layer} with {@link Layer#opaqueSortMode} or
     * {@link Layer#transparentSortMode} (depending on the material) set to
     * {@link SORTMODE_MANUAL}.
     *
     * @type {number}
     */
    this.drawOrder = 0;

    /**
     * Read this value in {@link Layer#onPostCull} to determine if the object is actually going
     * to be rendered.
     *
     * @type {boolean}
     */
    this.visibleThisFrame = false;

    // custom function used to customize culling (e.g. for 2D UI elements)
    this.isVisibleFunc = null;
    this.parameters = {};
    this.stencilFront = null;
    this.stencilBack = null;

    // Negative scale batching support
    this.flipFacesFactor = 1;
  }

  /**
   * The render style of the mesh instance. Can be:
   *
   * - {@link RENDERSTYLE_SOLID}
   * - {@link RENDERSTYLE_WIREFRAME}
   * - {@link RENDERSTYLE_POINTS}
   *
   * Defaults to {@link RENDERSTYLE_SOLID}.
   *
   * @type {number}
   */
  set renderStyle(renderStyle) {
    this._renderStyle = renderStyle;
    this.mesh.prepareRenderState(renderStyle);
  }
  get renderStyle() {
    return this._renderStyle;
  }

  /**
   * The graphics mesh being instanced.
   *
   * @type {import('./mesh.js').Mesh}
   */
  set mesh(mesh) {
    if (mesh === this._mesh) return;
    if (this._mesh) {
      this._mesh.decRefCount();
    }
    this._mesh = mesh;
    if (mesh) {
      mesh.incRefCount();
    }
  }
  get mesh() {
    return this._mesh;
  }

  /**
   * The world space axis-aligned bounding box for this mesh instance.
   *
   * @type {BoundingBox}
   */
  set aabb(aabb) {
    this._aabb = aabb;
  }
  get aabb() {
    // use specified world space aabb
    if (!this._updateAabb) {
      return this._aabb;
    }

    // callback function returning world space aabb
    if (this._updateAabbFunc) {
      return this._updateAabbFunc(this._aabb);
    }

    // use local space override aabb if specified
    let localAabb = this._customAabb;
    let toWorldSpace = !!localAabb;

    // otherwise evaluate local aabb
    if (!localAabb) {
      localAabb = _tmpAabb;
      if (this.skinInstance) {
        // Initialize local bone AABBs if needed
        if (!this.mesh.boneAabb) {
          const morphTargets = this._morphInstance ? this._morphInstance.morph._targets : null;
          this.mesh._initBoneAabbs(morphTargets);
        }

        // evaluate local space bounds based on all active bones
        const boneUsed = this.mesh.boneUsed;
        let first = true;
        for (let i = 0; i < this.mesh.boneAabb.length; i++) {
          if (boneUsed[i]) {
            // transform bone AABB by bone matrix
            _tempBoneAabb.setFromTransformedAabb(this.mesh.boneAabb[i], this.skinInstance.matrices[i]);

            // add them up
            if (first) {
              first = false;
              localAabb.center.copy(_tempBoneAabb.center);
              localAabb.halfExtents.copy(_tempBoneAabb.halfExtents);
            } else {
              localAabb.add(_tempBoneAabb);
            }
          }
        }
        toWorldSpace = true;
      } else if (this.node._aabbVer !== this._aabbVer) {
        // local space bounding box - either from mesh or empty
        if (this.mesh) {
          localAabb.center.copy(this.mesh.aabb.center);
          localAabb.halfExtents.copy(this.mesh.aabb.halfExtents);
        } else {
          localAabb.center.set(0, 0, 0);
          localAabb.halfExtents.set(0, 0, 0);
        }

        // update local space bounding box by morph targets
        if (this.mesh && this.mesh.morph) {
          const morphAabb = this.mesh.morph.aabb;
          localAabb._expand(morphAabb.getMin(), morphAabb.getMax());
        }
        toWorldSpace = true;
        this._aabbVer = this.node._aabbVer;
      }
    }

    // store world space bounding box
    if (toWorldSpace) {
      this._aabb.setFromTransformedAabb(localAabb, this.node.getWorldTransform());
    }
    return this._aabb;
  }

  /**
   * Clear the internal shader cache.
   *
   * @ignore
   */
  clearShaders() {
    const shaderCache = this._shaderCache;
    for (let i = 0; i < shaderCache.length; i++) {
      var _shaderCache$i;
      (_shaderCache$i = shaderCache[i]) == null ? void 0 : _shaderCache$i.destroy();
      shaderCache[i] = null;
    }
  }

  /**
   * Returns the shader instance for the specified shader pass and light hash that is compatible
   * with this mesh instance.
   *
   * @param {number} shaderPass - The shader pass index.
   * @param {number} lightHash - The hash value of the lights that are affecting this mesh instance.
   * @param {import('./scene.js').Scene} scene - The scene.
   * @param {import('../platform/graphics/uniform-buffer-format.js').UniformBufferFormat} [viewUniformFormat] - The
   * format of the view uniform buffer.
   * @param {import('../platform/graphics/bind-group-format.js').BindGroupFormat} [viewBindGroupFormat] - The
   * format of the view bind group.
   * @param {any} [sortedLights] - Array of arrays of lights.
   * @returns {ShaderInstance} - the shader instance.
   * @ignore
   */
  getShaderInstance(shaderPass, lightHash, scene, viewUniformFormat, viewBindGroupFormat, sortedLights) {
    let shaderInstance;
    let passEntry = this._shaderCache[shaderPass];
    if (passEntry) {
      shaderInstance = passEntry.shaderInstances.get(lightHash);
    } else {
      passEntry = new ShaderCacheEntry();
      this._shaderCache[shaderPass] = passEntry;
    }

    // cache miss in the shader cache of the mesh instance
    if (!shaderInstance) {
      // get the shader from the material
      const mat = this._material;
      const shaderDefs = this._shaderDefs;
      const variantKey = shaderPass + '_' + shaderDefs + '_' + lightHash;
      shaderInstance = new ShaderInstance();
      shaderInstance.shader = mat.variants.get(variantKey);

      // cache miss in the material variants
      if (!shaderInstance.shader) {
        const shader = mat.getShaderVariant(this.mesh.device, scene, shaderDefs, null, shaderPass, sortedLights, viewUniformFormat, viewBindGroupFormat, this._mesh.vertexBuffer.format);

        // add it to the material variants cache
        mat.variants.set(variantKey, shader);
        shaderInstance.shader = shader;
      }

      // add it to the mesh instance cache
      passEntry.shaderInstances.set(lightHash, shaderInstance);
    }
    return shaderInstance;
  }

  /**
   * The material used by this mesh instance.
   *
   * @type {import('./materials/material.js').Material}
   */
  set material(material) {
    this.clearShaders();
    const prevMat = this._material;

    // Remove the material's reference to this mesh instance
    if (prevMat) {
      prevMat.removeMeshInstanceRef(this);
    }
    this._material = material;
    if (material) {
      // Record that the material is referenced by this mesh instance
      material.addMeshInstanceRef(this);

      // update transparent flag based on material
      this.transparent = material.transparent;
      this.updateKey();
    }
  }
  get material() {
    return this._material;
  }
  set layer(layer) {
    this._layer = layer;
    this.updateKey();
  }
  get layer() {
    return this._layer;
  }
  _updateShaderDefs(shaderDefs) {
    if (shaderDefs !== this._shaderDefs) {
      this._shaderDefs = shaderDefs;
      this.clearShaders();
    }
  }

  /**
   * In some circumstances mesh instances are sorted by a distance calculation to determine their
   * rendering order. Set this callback to override the default distance calculation, which gives
   * the dot product of the camera forward vector and the vector between the camera position and
   * the center of the mesh instance's axis-aligned bounding box. This option can be particularly
   * useful for rendering transparent meshes in a better order than default.
   *
   * @type {CalculateSortDistanceCallback}
   */
  set calculateSortDistance(calculateSortDistance) {
    this._calculateSortDistance = calculateSortDistance;
  }
  get calculateSortDistance() {
    return this._calculateSortDistance;
  }
  set receiveShadow(val) {
    if (this._receiveShadow !== val) {
      this._receiveShadow = val;
      this._updateShaderDefs(val ? this._shaderDefs & ~SHADERDEF_NOSHADOW : this._shaderDefs | SHADERDEF_NOSHADOW);
    }
  }
  get receiveShadow() {
    return this._receiveShadow;
  }

  /**
   * The skin instance managing skinning of this mesh instance, or null if skinning is not used.
   *
   * @type {import('./skin-instance.js').SkinInstance}
   */
  set skinInstance(val) {
    this._skinInstance = val;
    this._updateShaderDefs(val ? this._shaderDefs | SHADERDEF_SKIN : this._shaderDefs & ~SHADERDEF_SKIN);
    this._setupSkinUpdate();
  }
  get skinInstance() {
    return this._skinInstance;
  }

  /**
   * The morph instance managing morphing of this mesh instance, or null if morphing is not used.
   *
   * @type {import('./morph-instance.js').MorphInstance}
   */
  set morphInstance(val) {
    var _this$_morphInstance;
    // release existing
    (_this$_morphInstance = this._morphInstance) == null ? void 0 : _this$_morphInstance.destroy();

    // assign new
    this._morphInstance = val;
    let shaderDefs = this._shaderDefs;
    shaderDefs = val && val.morph.useTextureMorph ? shaderDefs | SHADERDEF_MORPH_TEXTURE_BASED : shaderDefs & ~SHADERDEF_MORPH_TEXTURE_BASED;
    shaderDefs = val && val.morph.morphPositions ? shaderDefs | SHADERDEF_MORPH_POSITION : shaderDefs & ~SHADERDEF_MORPH_POSITION;
    shaderDefs = val && val.morph.morphNormals ? shaderDefs | SHADERDEF_MORPH_NORMAL : shaderDefs & ~SHADERDEF_MORPH_NORMAL;
    this._updateShaderDefs(shaderDefs);
  }
  get morphInstance() {
    return this._morphInstance;
  }
  set screenSpace(val) {
    if (this._screenSpace !== val) {
      this._screenSpace = val;
      this._updateShaderDefs(val ? this._shaderDefs | SHADERDEF_SCREENSPACE : this._shaderDefs & ~SHADERDEF_SCREENSPACE);
    }
  }
  get screenSpace() {
    return this._screenSpace;
  }
  set key(val) {
    this._key[SORTKEY_FORWARD] = val;
  }
  get key() {
    return this._key[SORTKEY_FORWARD];
  }

  /**
   * Mask controlling which {@link LightComponent}s light this mesh instance, which
   * {@link CameraComponent} sees it and in which {@link Layer} it is rendered. Defaults to 1.
   *
   * @type {number}
   */
  set mask(val) {
    const toggles = this._shaderDefs & 0x0000FFFF;
    this._updateShaderDefs(toggles | val << 16);
  }
  get mask() {
    return this._shaderDefs >> 16;
  }

  /**
   * Number of instances when using hardware instancing to render the mesh.
   *
   * @type {number}
   */
  set instancingCount(value) {
    if (this.instancingData) this.instancingData.count = value;
  }
  get instancingCount() {
    return this.instancingData ? this.instancingData.count : 0;
  }
  destroy() {
    var _this$_skinInstance, _this$morphInstance;
    const mesh = this.mesh;
    if (mesh) {
      // this decreases ref count on the mesh
      this.mesh = null;

      // destroy mesh
      if (mesh.refCount < 1) {
        mesh.destroy();
      }
    }

    // release ref counted lightmaps
    this.setRealtimeLightmap(MeshInstance.lightmapParamNames[0], null);
    this.setRealtimeLightmap(MeshInstance.lightmapParamNames[1], null);
    (_this$_skinInstance = this._skinInstance) == null ? void 0 : _this$_skinInstance.destroy();
    this._skinInstance = null;
    (_this$morphInstance = this.morphInstance) == null ? void 0 : _this$morphInstance.destroy();
    this.morphInstance = null;
    this.clearShaders();

    // make sure material clears references to this meshInstance
    this.material = null;
  }

  // shader uniform names for lightmaps

  // generates wireframes for an array of mesh instances
  static _prepareRenderStyleForArray(meshInstances, renderStyle) {
    if (meshInstances) {
      for (let i = 0; i < meshInstances.length; i++) {
        // switch mesh instance to the requested style
        meshInstances[i]._renderStyle = renderStyle;

        // process all unique meshes
        const mesh = meshInstances[i].mesh;
        if (!_meshSet.has(mesh)) {
          _meshSet.add(mesh);
          mesh.prepareRenderState(renderStyle);
        }
      }
      _meshSet.clear();
    }
  }

  // test if meshInstance is visible by camera. It requires the frustum of the camera to be up to date, which forward-renderer
  // takes care of. This function should  not be called elsewhere.
  _isVisible(camera) {
    if (this.visible) {
      // custom visibility method of MeshInstance
      if (this.isVisibleFunc) {
        return this.isVisibleFunc(camera);
      }
      _tempSphere.center = this.aabb.center; // this line evaluates aabb
      _tempSphere.radius = this._aabb.halfExtents.length();
      return camera.frustum.containsSphere(_tempSphere);
    }
    return false;
  }
  updateKey() {
    // render alphatest/atoc after opaque
    const material = this.material;
    const blendType = material.alphaToCoverage || material.alphaTest ? BLEND_NORMAL : material.blendType;

    // Key definition:
    // Bit
    // 31      : sign bit (leave)
    // 27 - 30 : layer
    // 26      : translucency type (opaque/transparent)
    // 25      : unused
    // 0 - 24  : Material ID (if opaque) or 0 (if transparent - will be depth)
    this._key[SORTKEY_FORWARD] = (this.layer & 0x0f) << 27 | (blendType === BLEND_NONE ? 1 : 0) << 26 | (material.id & 0x1ffffff) << 0;
  }

  /**
   * Sets up {@link MeshInstance} to be rendered using Hardware Instancing.
   *
   * @param {import('../platform/graphics/vertex-buffer.js').VertexBuffer|null} vertexBuffer - Vertex buffer to hold per-instance vertex data
   * (usually world matrices). Pass null to turn off hardware instancing.
   */
  setInstancing(vertexBuffer) {
    if (vertexBuffer) {
      this.instancingData = new InstancingData(vertexBuffer.numVertices);
      this.instancingData.vertexBuffer = vertexBuffer;

      // mark vertex buffer as instancing data
      vertexBuffer.format.instancing = true;

      // turn off culling - we do not do per-instance culling, all instances are submitted to GPU
      this.cull = false;
    } else {
      this.instancingData = null;
      this.cull = true;
    }
    this._updateShaderDefs(vertexBuffer ? this._shaderDefs | SHADERDEF_INSTANCING : this._shaderDefs & ~SHADERDEF_INSTANCING);
  }
  ensureMaterial(device) {
    if (!this.material) {
      Debug.warn(`Mesh attached to entity '${this.node.name}' does not have a material, using a default one.`);
      this.material = getDefaultMaterial(device);
    }
  }

  // Parameter management
  clearParameters() {
    this.parameters = {};
  }
  getParameters() {
    return this.parameters;
  }

  /**
   * Retrieves the specified shader parameter from a mesh instance.
   *
   * @param {string} name - The name of the parameter to query.
   * @returns {object} The named parameter.
   */
  getParameter(name) {
    return this.parameters[name];
  }

  /**
   * Sets a shader parameter on a mesh instance. Note that this parameter will take precedence
   * over parameter of the same name if set on Material this mesh instance uses for rendering.
   *
   * @param {string} name - The name of the parameter to set.
   * @param {number|number[]|import('../platform/graphics/texture.js').Texture} data - The value
   * for the specified parameter.
   * @param {number} [passFlags] - Mask describing which passes the material should be included
   * in.
   */
  setParameter(name, data, passFlags = -262141) {
    // note on -262141: All bits set except 2 - 19 range

    if (data === undefined && typeof name === 'object') {
      const uniformObject = name;
      if (uniformObject.length) {
        for (let i = 0; i < uniformObject.length; i++) {
          this.setParameter(uniformObject[i]);
        }
        return;
      }
      name = uniformObject.name;
      data = uniformObject.value;
    }
    const param = this.parameters[name];
    if (param) {
      param.data = data;
      param.passFlags = passFlags;
    } else {
      this.parameters[name] = {
        scopeId: null,
        data: data,
        passFlags: passFlags
      };
    }
  }

  // a wrapper over settings parameter specifically for realtime baked lightmaps. This handles reference counting of lightmaps
  // and releases them when no longer referenced
  setRealtimeLightmap(name, texture) {
    // no change
    const old = this.getParameter(name);
    if (old === texture) return;

    // remove old
    if (old) {
      LightmapCache.decRef(old.data);
    }

    // assign new
    if (texture) {
      LightmapCache.incRef(texture);
      this.setParameter(name, texture);
    } else {
      this.deleteParameter(name);
    }
  }

  /**
   * Deletes a shader parameter on a mesh instance.
   *
   * @param {string} name - The name of the parameter to delete.
   */
  deleteParameter(name) {
    if (this.parameters[name]) {
      delete this.parameters[name];
    }
  }

  // used to apply parameters from this mesh instance into scope of uniforms, called internally by forward-renderer
  setParameters(device, passFlag) {
    const parameters = this.parameters;
    for (const paramName in parameters) {
      const parameter = parameters[paramName];
      if (parameter.passFlags & passFlag) {
        if (!parameter.scopeId) {
          parameter.scopeId = device.scope.resolve(paramName);
        }
        parameter.scopeId.setValue(parameter.data);
      }
    }
  }
  setLightmapped(value) {
    if (value) {
      this.mask = (this.mask | MASK_AFFECT_LIGHTMAPPED) & ~(MASK_AFFECT_DYNAMIC | MASK_BAKE);
    } else {
      this.setRealtimeLightmap(MeshInstance.lightmapParamNames[0], null);
      this.setRealtimeLightmap(MeshInstance.lightmapParamNames[1], null);
      this._shaderDefs &= ~(SHADERDEF_LM | SHADERDEF_DIRLM | SHADERDEF_LMAMBIENT);
      this.mask = (this.mask | MASK_AFFECT_DYNAMIC) & ~(MASK_AFFECT_LIGHTMAPPED | MASK_BAKE);
    }
  }
  setCustomAabb(aabb) {
    if (aabb) {
      // store the override aabb
      if (this._customAabb) {
        this._customAabb.copy(aabb);
      } else {
        this._customAabb = aabb.clone();
      }
    } else {
      // no override, force refresh the actual one
      this._customAabb = null;
      this._aabbVer = -1;
    }
    this._setupSkinUpdate();
  }
  _setupSkinUpdate() {
    // set if bones need to be updated before culling
    if (this._skinInstance) {
      this._skinInstance._updateBeforeCull = !this._customAabb;
    }
  }
}
MeshInstance.lightmapParamNames = ['texture_lightMap', 'texture_dirLightMap'];

export { MeshInstance };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWVzaC1pbnN0YW5jZS5qcyIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL3NjZW5lL21lc2gtaW5zdGFuY2UuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgRGVidWcsIERlYnVnSGVscGVyIH0gZnJvbSAnLi4vY29yZS9kZWJ1Zy5qcyc7XG5cbmltcG9ydCB7IEJvdW5kaW5nQm94IH0gZnJvbSAnLi4vY29yZS9zaGFwZS9ib3VuZGluZy1ib3guanMnO1xuaW1wb3J0IHsgQm91bmRpbmdTcGhlcmUgfSBmcm9tICcuLi9jb3JlL3NoYXBlL2JvdW5kaW5nLXNwaGVyZS5qcyc7XG5cbmltcG9ydCB7IEJpbmRHcm91cCB9IGZyb20gJy4uL3BsYXRmb3JtL2dyYXBoaWNzL2JpbmQtZ3JvdXAuanMnO1xuaW1wb3J0IHsgVW5pZm9ybUJ1ZmZlciB9IGZyb20gJy4uL3BsYXRmb3JtL2dyYXBoaWNzL3VuaWZvcm0tYnVmZmVyLmpzJztcblxuaW1wb3J0IHtcbiAgICBCTEVORF9OT05FLCBCTEVORF9OT1JNQUwsXG4gICAgTEFZRVJfV09STEQsXG4gICAgTUFTS19BRkZFQ1RfRFlOQU1JQywgTUFTS19CQUtFLCBNQVNLX0FGRkVDVF9MSUdIVE1BUFBFRCxcbiAgICBSRU5ERVJTVFlMRV9TT0xJRCxcbiAgICBTSEFERVJERUZfVVYwLCBTSEFERVJERUZfVVYxLCBTSEFERVJERUZfVkNPTE9SLCBTSEFERVJERUZfVEFOR0VOVFMsIFNIQURFUkRFRl9OT1NIQURPVywgU0hBREVSREVGX1NLSU4sXG4gICAgU0hBREVSREVGX1NDUkVFTlNQQUNFLCBTSEFERVJERUZfTU9SUEhfUE9TSVRJT04sIFNIQURFUkRFRl9NT1JQSF9OT1JNQUwsIFNIQURFUkRFRl9NT1JQSF9URVhUVVJFX0JBU0VELFxuICAgIFNIQURFUkRFRl9MTSwgU0hBREVSREVGX0RJUkxNLCBTSEFERVJERUZfTE1BTUJJRU5ULCBTSEFERVJERUZfSU5TVEFOQ0lORyxcbiAgICBTT1JUS0VZX0ZPUldBUkRcbn0gZnJvbSAnLi9jb25zdGFudHMuanMnO1xuXG5pbXBvcnQgeyBHcmFwaE5vZGUgfSBmcm9tICcuL2dyYXBoLW5vZGUuanMnO1xuaW1wb3J0IHsgZ2V0RGVmYXVsdE1hdGVyaWFsIH0gZnJvbSAnLi9tYXRlcmlhbHMvZGVmYXVsdC1tYXRlcmlhbC5qcyc7XG5pbXBvcnQgeyBMaWdodG1hcENhY2hlIH0gZnJvbSAnLi9ncmFwaGljcy9saWdodG1hcC1jYWNoZS5qcyc7XG5cbmxldCBpZCA9IDA7XG5jb25zdCBfdG1wQWFiYiA9IG5ldyBCb3VuZGluZ0JveCgpO1xuY29uc3QgX3RlbXBCb25lQWFiYiA9IG5ldyBCb3VuZGluZ0JveCgpO1xuY29uc3QgX3RlbXBTcGhlcmUgPSBuZXcgQm91bmRpbmdTcGhlcmUoKTtcbmNvbnN0IF9tZXNoU2V0ID0gbmV3IFNldCgpO1xuXG4vKipcbiAqIEludGVybmFsIGRhdGEgc3RydWN0dXJlIHVzZWQgdG8gc3RvcmUgZGF0YSB1c2VkIGJ5IGhhcmR3YXJlIGluc3RhbmNpbmcuXG4gKlxuICogQGlnbm9yZVxuICovXG5jbGFzcyBJbnN0YW5jaW5nRGF0YSB7XG4gICAgLyoqIEB0eXBlIHtpbXBvcnQoJy4uL3BsYXRmb3JtL2dyYXBoaWNzL3ZlcnRleC1idWZmZXIuanMnKS5WZXJ0ZXhCdWZmZXJ8bnVsbH0gKi9cbiAgICB2ZXJ0ZXhCdWZmZXIgPSBudWxsO1xuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IG51bU9iamVjdHMgLSBUaGUgbnVtYmVyIG9mIG9iamVjdHMgaW5zdGFuY2VkLlxuICAgICAqL1xuICAgIGNvbnN0cnVjdG9yKG51bU9iamVjdHMpIHtcbiAgICAgICAgdGhpcy5jb3VudCA9IG51bU9iamVjdHM7XG4gICAgfVxufVxuXG4vKipcbiAqIEludGVybmFsIGhlbHBlciBjbGFzcyBmb3Igc3RvcmluZyB0aGUgc2hhZGVyIGFuZCByZWxhdGVkIG1lc2ggYmluZCBncm91cCBpbiB0aGUgc2hhZGVyIGNhY2hlLlxuICpcbiAqIEBpZ25vcmVcbiAqL1xuY2xhc3MgU2hhZGVySW5zdGFuY2Uge1xuICAgIC8qKlxuICAgICAqIEEgc2hhZGVyLlxuICAgICAqXG4gICAgICogQHR5cGUge2ltcG9ydCgnLi4vcGxhdGZvcm0vZ3JhcGhpY3Mvc2hhZGVyLmpzJykuU2hhZGVyfHVuZGVmaW5lZH1cbiAgICAgKi9cbiAgICBzaGFkZXI7XG5cbiAgICAvKipcbiAgICAgKiBBIGJpbmQgZ3JvdXAgc3RvcmluZyBtZXNoIHVuaWZvcm1zIGZvciB0aGUgc2hhZGVyLlxuICAgICAqXG4gICAgICogQHR5cGUge0JpbmRHcm91cHxudWxsfVxuICAgICAqL1xuICAgIGJpbmRHcm91cCA9IG51bGw7XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBtZXNoIGJpbmQgZ3JvdXAgZm9yIHRoZSBzaGFkZXIuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi4vcGxhdGZvcm0vZ3JhcGhpY3MvZ3JhcGhpY3MtZGV2aWNlLmpzJykuR3JhcGhpY3NEZXZpY2V9IGRldmljZSAtIFRoZVxuICAgICAqIGdyYXBoaWNzIGRldmljZS5cbiAgICAgKiBAcmV0dXJucyB7QmluZEdyb3VwfSAtIFRoZSBtZXNoIGJpbmQgZ3JvdXAuXG4gICAgICovXG4gICAgZ2V0QmluZEdyb3VwKGRldmljZSkge1xuXG4gICAgICAgIC8vIGNyZWF0ZSBiaW5kIGdyb3VwXG4gICAgICAgIGlmICghdGhpcy5iaW5kR3JvdXApIHtcbiAgICAgICAgICAgIGNvbnN0IHNoYWRlciA9IHRoaXMuc2hhZGVyO1xuICAgICAgICAgICAgRGVidWcuYXNzZXJ0KHNoYWRlcik7XG5cbiAgICAgICAgICAgIC8vIG1lc2ggdW5pZm9ybSBidWZmZXJcbiAgICAgICAgICAgIGNvbnN0IHViRm9ybWF0ID0gc2hhZGVyLm1lc2hVbmlmb3JtQnVmZmVyRm9ybWF0O1xuICAgICAgICAgICAgRGVidWcuYXNzZXJ0KHViRm9ybWF0KTtcbiAgICAgICAgICAgIGNvbnN0IHVuaWZvcm1CdWZmZXIgPSBuZXcgVW5pZm9ybUJ1ZmZlcihkZXZpY2UsIHViRm9ybWF0LCBmYWxzZSk7XG5cbiAgICAgICAgICAgIC8vIG1lc2ggYmluZCBncm91cFxuICAgICAgICAgICAgY29uc3QgYmluZEdyb3VwRm9ybWF0ID0gc2hhZGVyLm1lc2hCaW5kR3JvdXBGb3JtYXQ7XG4gICAgICAgICAgICBEZWJ1Zy5hc3NlcnQoYmluZEdyb3VwRm9ybWF0KTtcbiAgICAgICAgICAgIHRoaXMuYmluZEdyb3VwID0gbmV3IEJpbmRHcm91cChkZXZpY2UsIGJpbmRHcm91cEZvcm1hdCwgdW5pZm9ybUJ1ZmZlcik7XG4gICAgICAgICAgICBEZWJ1Z0hlbHBlci5zZXROYW1lKHRoaXMuYmluZEdyb3VwLCBgTWVzaEJpbmRHcm91cF8ke3RoaXMuYmluZEdyb3VwLmlkfWApO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHRoaXMuYmluZEdyb3VwO1xuICAgIH1cblxuICAgIGRlc3Ryb3koKSB7XG4gICAgICAgIGNvbnN0IGdyb3VwID0gdGhpcy5iaW5kR3JvdXA7XG4gICAgICAgIGlmIChncm91cCkge1xuICAgICAgICAgICAgZ3JvdXAuZGVmYXVsdFVuaWZvcm1CdWZmZXI/LmRlc3Ryb3koKTtcbiAgICAgICAgICAgIGdyb3VwLmRlc3Ryb3koKTtcbiAgICAgICAgICAgIHRoaXMuYmluZEdyb3VwID0gbnVsbDtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuLyoqXG4gKiBBbiBlbnRyeSBpbiB0aGUgc2hhZGVyIGNhY2hlLCByZXByZXNlbnRpbmcgc2hhZGVycyBmb3IgdGhpcyBtZXNoIGluc3RhbmNlIGFuZCBhIHNwZWNpZmljIHNoYWRlclxuICogcGFzcy5cbiAqXG4gKiBAaWdub3JlXG4gKi9cbmNsYXNzIFNoYWRlckNhY2hlRW50cnkge1xuICAgIC8qKlxuICAgICAqIFRoZSBzaGFkZXIgaW5zdGFuY2VzLiBMb29rZWQgdXAgYnkgbGlnaHRIYXNoLCB3aGljaCByZXByZXNlbnRzIGFuIG9yZGVyZWQgc2V0IG9mIGxpZ2h0cy5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtNYXA8bnVtYmVyLCBTaGFkZXJJbnN0YW5jZT59XG4gICAgICovXG4gICAgc2hhZGVySW5zdGFuY2VzID0gbmV3IE1hcCgpO1xuXG4gICAgZGVzdHJveSgpIHtcbiAgICAgICAgdGhpcy5zaGFkZXJJbnN0YW5jZXMuZm9yRWFjaChpbnN0YW5jZSA9PiBpbnN0YW5jZS5kZXN0cm95KCkpO1xuICAgICAgICB0aGlzLnNoYWRlckluc3RhbmNlcy5jbGVhcigpO1xuICAgIH1cbn1cblxuLyoqXG4gKiBDYWxsYmFjayB1c2VkIGJ5IHtAbGluayBMYXllcn0gdG8gY2FsY3VsYXRlIHRoZSBcInNvcnQgZGlzdGFuY2VcIiBmb3IgYSB7QGxpbmsgTWVzaEluc3RhbmNlfSxcbiAqIHdoaWNoIGRldGVybWluZXMgaXRzIHBsYWNlIGluIHRoZSByZW5kZXIgb3JkZXIuXG4gKlxuICogQGNhbGxiYWNrIENhbGN1bGF0ZVNvcnREaXN0YW5jZUNhbGxiYWNrXG4gKiBAcGFyYW0ge01lc2hJbnN0YW5jZX0gbWVzaEluc3RhbmNlIC0gVGhlIG1lc2ggaW5zdGFuY2UuXG4gKiBAcGFyYW0ge2ltcG9ydCgnLi4vY29yZS9tYXRoL3ZlYzMuanMnKS5WZWMzfSBjYW1lcmFQb3NpdGlvbiAtIFRoZSBwb3NpdGlvbiBvZiB0aGUgY2FtZXJhLlxuICogQHBhcmFtIHtpbXBvcnQoJy4uL2NvcmUvbWF0aC92ZWMzLmpzJykuVmVjM30gY2FtZXJhRm9yd2FyZCAtIFRoZSBmb3J3YXJkIHZlY3RvciBvZiB0aGUgY2FtZXJhLlxuICovXG5cbi8qKlxuICogQW4gaW5zdGFuY2Ugb2YgYSB7QGxpbmsgTWVzaH0uIEEgc2luZ2xlIG1lc2ggY2FuIGJlIHJlZmVyZW5jZWQgYnkgbWFueSBtZXNoIGluc3RhbmNlcyB0aGF0IGNhblxuICogaGF2ZSBkaWZmZXJlbnQgdHJhbnNmb3JtcyBhbmQgbWF0ZXJpYWxzLlxuICpcbiAqIEBjYXRlZ29yeSBHcmFwaGljc1xuICovXG5jbGFzcyBNZXNoSW5zdGFuY2Uge1xuICAgIC8qKlxuICAgICAqIEVuYWJsZSByZW5kZXJpbmcgZm9yIHRoaXMgbWVzaCBpbnN0YW5jZS4gVXNlIHZpc2libGUgcHJvcGVydHkgdG8gZW5hYmxlL2Rpc2FibGVcbiAgICAgKiByZW5kZXJpbmcgd2l0aG91dCBvdmVyaGVhZCBvZiByZW1vdmluZyBmcm9tIHNjZW5lLiBCdXQgbm90ZSB0aGF0IHRoZSBtZXNoIGluc3RhbmNlIGlzXG4gICAgICogc3RpbGwgaW4gdGhlIGhpZXJhcmNoeSBhbmQgc3RpbGwgaW4gdGhlIGRyYXcgY2FsbCBsaXN0LlxuICAgICAqXG4gICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICovXG4gICAgdmlzaWJsZSA9IHRydWU7XG5cbiAgICAvKipcbiAgICAgKiBFbmFibGUgc2hhZG93IGNhc3RpbmcgZm9yIHRoaXMgbWVzaCBpbnN0YW5jZS4gVXNlIHRoaXMgcHJvcGVydHkgdG8gZW5hYmxlL2Rpc2FibGVcbiAgICAgKiBzaGFkb3cgY2FzdGluZyB3aXRob3V0IG92ZXJoZWFkIG9mIHJlbW92aW5nIGZyb20gc2NlbmUuIE5vdGUgdGhhdCB0aGlzIHByb3BlcnR5IGRvZXMgbm90XG4gICAgICogYWRkIHRoZSBtZXNoIGluc3RhbmNlIHRvIGFwcHJvcHJpYXRlIGxpc3Qgb2Ygc2hhZG93IGNhc3RlcnMgb24gYSB7QGxpbmsgTGF5ZXJ9LCBidXRcbiAgICAgKiBhbGxvd3MgbWVzaCB0byBiZSBza2lwcGVkIGZyb20gc2hhZG93IGNhc3Rpbmcgd2hpbGUgaXQgaXMgaW4gdGhlIGxpc3QgYWxyZWFkeS4gRGVmYXVsdHMgdG9cbiAgICAgKiBmYWxzZS5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAqL1xuICAgIGNhc3RTaGFkb3cgPSBmYWxzZTtcblxuICAgIC8qKlxuICAgICAqIFRydWUgaWYgdGhlIG1hdGVyaWFsIG9mIHRoZSBtZXNoIGluc3RhbmNlIGlzIHRyYW5zcGFyZW50LiBPcHRpbWl6YXRpb24gdG8gYXZvaWQgYWNjZXNzaW5nIHRoZVxuICAgICAqIG1hdGVyaWFsLiBVcGRhdGVkIGJ5IHRoZSBtYXRlcmlhbCBpbnN0YW5jZSBpdHNlbGYuXG4gICAgICpcbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgdHJhbnNwYXJlbnQgPSBmYWxzZTtcblxuICAgIC8qKlxuICAgICAqIEB0eXBlIHtpbXBvcnQoJy4vbWF0ZXJpYWxzL21hdGVyaWFsLmpzJykuTWF0ZXJpYWx8bnVsbH1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9tYXRlcmlhbCA9IG51bGw7XG5cbiAgICAvKipcbiAgICAgKiBBbiBhcnJheSBvZiBzaGFkZXIgY2FjaGUgZW50cmllcywgaW5kZXhlZCBieSB0aGUgc2hhZGVyIHBhc3MgY29uc3RhbnQgKFNIQURFUl9GT1JXQVJELi4pLiBUaGVcbiAgICAgKiB2YWx1ZSBzdG9yZXMgYWxsIHNoYWRlcnMgYW5kIGJpbmQgZ3JvdXBzIGZvciB0aGUgc2hhZGVyIHBhc3MgZm9yIHZhcmlvdXMgbGlnaHQgY29tYmluYXRpb25zLlxuICAgICAqXG4gICAgICogQHR5cGUge0FycmF5PFNoYWRlckNhY2hlRW50cnl8bnVsbD59XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfc2hhZGVyQ2FjaGUgPSBbXTtcblxuICAgIC8qKiBAaWdub3JlICovXG4gICAgaWQgPSBpZCsrO1xuXG4gICAgLyoqXG4gICAgICogVHJ1ZSBpZiB0aGUgbWVzaCBpbnN0YW5jZSBpcyBwaWNrYWJsZSBieSB0aGUge0BsaW5rIFBpY2tlcn0uIERlZmF1bHRzIHRvIHRydWUuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgcGljayA9IHRydWU7XG5cbiAgICAvKipcbiAgICAgKiBDcmVhdGUgYSBuZXcgTWVzaEluc3RhbmNlIGluc3RhbmNlLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4vbWVzaC5qcycpLk1lc2h9IG1lc2ggLSBUaGUgZ3JhcGhpY3MgbWVzaCB0byBpbnN0YW5jZS5cbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi9tYXRlcmlhbHMvbWF0ZXJpYWwuanMnKS5NYXRlcmlhbH0gbWF0ZXJpYWwgLSBUaGUgbWF0ZXJpYWwgdG8gdXNlIGZvciB0aGlzXG4gICAgICogbWVzaCBpbnN0YW5jZS5cbiAgICAgKiBAcGFyYW0ge0dyYXBoTm9kZX0gW25vZGVdIC0gVGhlIGdyYXBoIG5vZGUgZGVmaW5pbmcgdGhlIHRyYW5zZm9ybSBmb3IgdGhpcyBpbnN0YW5jZS4gVGhpc1xuICAgICAqIHBhcmFtZXRlciBpcyBvcHRpb25hbCB3aGVuIHVzZWQgd2l0aCB7QGxpbmsgUmVuZGVyQ29tcG9uZW50fSBhbmQgd2lsbCB1c2UgdGhlIG5vZGUgdGhlXG4gICAgICogY29tcG9uZW50IGlzIGF0dGFjaGVkIHRvLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogLy8gQ3JlYXRlIGEgbWVzaCBpbnN0YW5jZSBwb2ludGluZyB0byBhIDF4MXgxICdjdWJlJyBtZXNoXG4gICAgICogY29uc3QgbWVzaCA9IHBjLmNyZWF0ZUJveChncmFwaGljc0RldmljZSk7XG4gICAgICogY29uc3QgbWF0ZXJpYWwgPSBuZXcgcGMuU3RhbmRhcmRNYXRlcmlhbCgpO1xuICAgICAqXG4gICAgICogY29uc3QgbWVzaEluc3RhbmNlID0gbmV3IHBjLk1lc2hJbnN0YW5jZShtZXNoLCBtYXRlcmlhbCk7XG4gICAgICpcbiAgICAgKiBjb25zdCBlbnRpdHkgPSBuZXcgcGMuRW50aXR5KCk7XG4gICAgICogZW50aXR5LmFkZENvbXBvbmVudCgncmVuZGVyJywge1xuICAgICAqICAgICBtZXNoSW5zdGFuY2VzOiBbbWVzaEluc3RhbmNlXVxuICAgICAqIH0pO1xuICAgICAqXG4gICAgICogLy8gQWRkIHRoZSBlbnRpdHkgdG8gdGhlIHNjZW5lIGhpZXJhcmNoeVxuICAgICAqIHRoaXMuYXBwLnNjZW5lLnJvb3QuYWRkQ2hpbGQoZW50aXR5KTtcbiAgICAgKi9cbiAgICBjb25zdHJ1Y3RvcihtZXNoLCBtYXRlcmlhbCwgbm9kZSA9IG51bGwpIHtcbiAgICAgICAgLy8gaWYgZmlyc3QgcGFyYW1ldGVyIGlzIG9mIEdyYXBoTm9kZSB0eXBlLCBoYW5kbGUgcHJldmlvdXMgY29uc3RydWN0b3Igc2lnbmF0dXJlOiAobm9kZSwgbWVzaCwgbWF0ZXJpYWwpXG4gICAgICAgIGlmIChtZXNoIGluc3RhbmNlb2YgR3JhcGhOb2RlKSB7XG4gICAgICAgICAgICBjb25zdCB0ZW1wID0gbWVzaDtcbiAgICAgICAgICAgIG1lc2ggPSBtYXRlcmlhbDtcbiAgICAgICAgICAgIG1hdGVyaWFsID0gbm9kZTtcbiAgICAgICAgICAgIG5vZGUgPSB0ZW1wO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fa2V5ID0gWzAsIDBdO1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBUaGUgZ3JhcGggbm9kZSBkZWZpbmluZyB0aGUgdHJhbnNmb3JtIGZvciB0aGlzIGluc3RhbmNlLlxuICAgICAgICAgKlxuICAgICAgICAgKiBAdHlwZSB7R3JhcGhOb2RlfVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5ub2RlID0gbm9kZTsgICAgICAgICAgIC8vIFRoZSBub2RlIHRoYXQgZGVmaW5lcyB0aGUgdHJhbnNmb3JtIG9mIHRoZSBtZXNoIGluc3RhbmNlXG4gICAgICAgIHRoaXMuX21lc2ggPSBtZXNoOyAgICAgICAgICAvLyBUaGUgbWVzaCB0aGF0IHRoaXMgaW5zdGFuY2UgcmVuZGVyc1xuICAgICAgICBtZXNoLmluY1JlZkNvdW50KCk7XG4gICAgICAgIHRoaXMubWF0ZXJpYWwgPSBtYXRlcmlhbDsgICAvLyBUaGUgbWF0ZXJpYWwgd2l0aCB3aGljaCB0byByZW5kZXIgdGhpcyBpbnN0YW5jZVxuXG4gICAgICAgIHRoaXMuX3NoYWRlckRlZnMgPSBNQVNLX0FGRkVDVF9EWU5BTUlDIDw8IDE2OyAvLyAyIGJ5dGUgdG9nZ2xlcywgMiBieXRlcyBsaWdodCBtYXNrOyBEZWZhdWx0IHZhbHVlIGlzIG5vIHRvZ2dsZXMgYW5kIG1hc2sgPSBwYy5NQVNLX0FGRkVDVF9EWU5BTUlDXG4gICAgICAgIHRoaXMuX3NoYWRlckRlZnMgfD0gbWVzaC52ZXJ0ZXhCdWZmZXIuZm9ybWF0Lmhhc1V2MCA/IFNIQURFUkRFRl9VVjAgOiAwO1xuICAgICAgICB0aGlzLl9zaGFkZXJEZWZzIHw9IG1lc2gudmVydGV4QnVmZmVyLmZvcm1hdC5oYXNVdjEgPyBTSEFERVJERUZfVVYxIDogMDtcbiAgICAgICAgdGhpcy5fc2hhZGVyRGVmcyB8PSBtZXNoLnZlcnRleEJ1ZmZlci5mb3JtYXQuaGFzQ29sb3IgPyBTSEFERVJERUZfVkNPTE9SIDogMDtcbiAgICAgICAgdGhpcy5fc2hhZGVyRGVmcyB8PSBtZXNoLnZlcnRleEJ1ZmZlci5mb3JtYXQuaGFzVGFuZ2VudHMgPyBTSEFERVJERUZfVEFOR0VOVFMgOiAwO1xuXG4gICAgICAgIC8vIFJlbmRlciBvcHRpb25zXG4gICAgICAgIHRoaXMubGF5ZXIgPSBMQVlFUl9XT1JMRDsgLy8gbGVnYWN5XG4gICAgICAgIC8qKiBAcHJpdmF0ZSAqL1xuICAgICAgICB0aGlzLl9yZW5kZXJTdHlsZSA9IFJFTkRFUlNUWUxFX1NPTElEO1xuICAgICAgICB0aGlzLl9yZWNlaXZlU2hhZG93ID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5fc2NyZWVuU3BhY2UgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fbm9EZXB0aERyYXdHbDEgPSBmYWxzZTtcblxuICAgICAgICAvKipcbiAgICAgICAgICogQ29udHJvbHMgd2hldGhlciB0aGUgbWVzaCBpbnN0YW5jZSBjYW4gYmUgY3VsbGVkIGJ5IGZydXN0dW0gY3VsbGluZ1xuICAgICAgICAgKiAoe0BsaW5rIENhbWVyYUNvbXBvbmVudCNmcnVzdHVtQ3VsbGluZ30pLiBEZWZhdWx0cyB0byB0cnVlLlxuICAgICAgICAgKlxuICAgICAgICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuY3VsbCA9IHRydWU7XG5cbiAgICAgICAgdGhpcy5fdXBkYXRlQWFiYiA9IHRydWU7XG4gICAgICAgIHRoaXMuX3VwZGF0ZUFhYmJGdW5jID0gbnVsbDtcbiAgICAgICAgdGhpcy5fY2FsY3VsYXRlU29ydERpc3RhbmNlID0gbnVsbDtcblxuICAgICAgICAvLyA2NC1iaXQgaW50ZWdlciBrZXkgdGhhdCBkZWZpbmVzIHJlbmRlciBvcmRlciBvZiB0aGlzIG1lc2ggaW5zdGFuY2VcbiAgICAgICAgdGhpcy51cGRhdGVLZXkoKTtcblxuICAgICAgICAvKipcbiAgICAgICAgICogQHR5cGUge2ltcG9ydCgnLi9za2luLWluc3RhbmNlLmpzJykuU2tpbkluc3RhbmNlfG51bGx9XG4gICAgICAgICAqIEBwcml2YXRlXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLl9za2luSW5zdGFuY2UgPSBudWxsO1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAdHlwZSB7aW1wb3J0KCcuL21vcnBoLWluc3RhbmNlLmpzJykuTW9ycGhJbnN0YW5jZXxudWxsfVxuICAgICAgICAgKiBAcHJpdmF0ZVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5fbW9ycGhJbnN0YW5jZSA9IG51bGw7XG5cbiAgICAgICAgdGhpcy5pbnN0YW5jaW5nRGF0YSA9IG51bGw7XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEB0eXBlIHtCb3VuZGluZ0JveHxudWxsfVxuICAgICAgICAgKiBAcHJpdmF0ZVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5fY3VzdG9tQWFiYiA9IG51bGw7XG5cbiAgICAgICAgLy8gV29ybGQgc3BhY2UgQUFCQlxuICAgICAgICB0aGlzLmFhYmIgPSBuZXcgQm91bmRpbmdCb3goKTtcbiAgICAgICAgdGhpcy5fYWFiYlZlciA9IC0xO1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBVc2UgdGhpcyB2YWx1ZSB0byBhZmZlY3QgcmVuZGVyaW5nIG9yZGVyIG9mIG1lc2ggaW5zdGFuY2VzLiBPbmx5IHVzZWQgd2hlbiBtZXNoXG4gICAgICAgICAqIGluc3RhbmNlcyBhcmUgYWRkZWQgdG8gYSB7QGxpbmsgTGF5ZXJ9IHdpdGgge0BsaW5rIExheWVyI29wYXF1ZVNvcnRNb2RlfSBvclxuICAgICAgICAgKiB7QGxpbmsgTGF5ZXIjdHJhbnNwYXJlbnRTb3J0TW9kZX0gKGRlcGVuZGluZyBvbiB0aGUgbWF0ZXJpYWwpIHNldCB0b1xuICAgICAgICAgKiB7QGxpbmsgU09SVE1PREVfTUFOVUFMfS5cbiAgICAgICAgICpcbiAgICAgICAgICogQHR5cGUge251bWJlcn1cbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuZHJhd09yZGVyID0gMDtcblxuICAgICAgICAvKipcbiAgICAgICAgICogUmVhZCB0aGlzIHZhbHVlIGluIHtAbGluayBMYXllciNvblBvc3RDdWxsfSB0byBkZXRlcm1pbmUgaWYgdGhlIG9iamVjdCBpcyBhY3R1YWxseSBnb2luZ1xuICAgICAgICAgKiB0byBiZSByZW5kZXJlZC5cbiAgICAgICAgICpcbiAgICAgICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLnZpc2libGVUaGlzRnJhbWUgPSBmYWxzZTtcblxuICAgICAgICAvLyBjdXN0b20gZnVuY3Rpb24gdXNlZCB0byBjdXN0b21pemUgY3VsbGluZyAoZS5nLiBmb3IgMkQgVUkgZWxlbWVudHMpXG4gICAgICAgIHRoaXMuaXNWaXNpYmxlRnVuYyA9IG51bGw7XG5cbiAgICAgICAgdGhpcy5wYXJhbWV0ZXJzID0ge307XG5cbiAgICAgICAgdGhpcy5zdGVuY2lsRnJvbnQgPSBudWxsO1xuICAgICAgICB0aGlzLnN0ZW5jaWxCYWNrID0gbnVsbDtcblxuICAgICAgICAvLyBOZWdhdGl2ZSBzY2FsZSBiYXRjaGluZyBzdXBwb3J0XG4gICAgICAgIHRoaXMuZmxpcEZhY2VzRmFjdG9yID0gMTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUaGUgcmVuZGVyIHN0eWxlIG9mIHRoZSBtZXNoIGluc3RhbmNlLiBDYW4gYmU6XG4gICAgICpcbiAgICAgKiAtIHtAbGluayBSRU5ERVJTVFlMRV9TT0xJRH1cbiAgICAgKiAtIHtAbGluayBSRU5ERVJTVFlMRV9XSVJFRlJBTUV9XG4gICAgICogLSB7QGxpbmsgUkVOREVSU1RZTEVfUE9JTlRTfVxuICAgICAqXG4gICAgICogRGVmYXVsdHMgdG8ge0BsaW5rIFJFTkRFUlNUWUxFX1NPTElEfS5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtudW1iZXJ9XG4gICAgICovXG4gICAgc2V0IHJlbmRlclN0eWxlKHJlbmRlclN0eWxlKSB7XG4gICAgICAgIHRoaXMuX3JlbmRlclN0eWxlID0gcmVuZGVyU3R5bGU7XG4gICAgICAgIHRoaXMubWVzaC5wcmVwYXJlUmVuZGVyU3RhdGUocmVuZGVyU3R5bGUpO1xuICAgIH1cblxuICAgIGdldCByZW5kZXJTdHlsZSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3JlbmRlclN0eWxlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRoZSBncmFwaGljcyBtZXNoIGJlaW5nIGluc3RhbmNlZC5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtpbXBvcnQoJy4vbWVzaC5qcycpLk1lc2h9XG4gICAgICovXG4gICAgc2V0IG1lc2gobWVzaCkge1xuXG4gICAgICAgIGlmIChtZXNoID09PSB0aGlzLl9tZXNoKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIGlmICh0aGlzLl9tZXNoKSB7XG4gICAgICAgICAgICB0aGlzLl9tZXNoLmRlY1JlZkNvdW50KCk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl9tZXNoID0gbWVzaDtcblxuICAgICAgICBpZiAobWVzaCkge1xuICAgICAgICAgICAgbWVzaC5pbmNSZWZDb3VudCgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2V0IG1lc2goKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9tZXNoO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRoZSB3b3JsZCBzcGFjZSBheGlzLWFsaWduZWQgYm91bmRpbmcgYm94IGZvciB0aGlzIG1lc2ggaW5zdGFuY2UuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7Qm91bmRpbmdCb3h9XG4gICAgICovXG4gICAgc2V0IGFhYmIoYWFiYikge1xuICAgICAgICB0aGlzLl9hYWJiID0gYWFiYjtcbiAgICB9XG5cbiAgICBnZXQgYWFiYigpIHtcbiAgICAgICAgLy8gdXNlIHNwZWNpZmllZCB3b3JsZCBzcGFjZSBhYWJiXG4gICAgICAgIGlmICghdGhpcy5fdXBkYXRlQWFiYikge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2FhYmI7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBjYWxsYmFjayBmdW5jdGlvbiByZXR1cm5pbmcgd29ybGQgc3BhY2UgYWFiYlxuICAgICAgICBpZiAodGhpcy5fdXBkYXRlQWFiYkZ1bmMpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl91cGRhdGVBYWJiRnVuYyh0aGlzLl9hYWJiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHVzZSBsb2NhbCBzcGFjZSBvdmVycmlkZSBhYWJiIGlmIHNwZWNpZmllZFxuICAgICAgICBsZXQgbG9jYWxBYWJiID0gdGhpcy5fY3VzdG9tQWFiYjtcbiAgICAgICAgbGV0IHRvV29ybGRTcGFjZSA9ICEhbG9jYWxBYWJiO1xuXG4gICAgICAgIC8vIG90aGVyd2lzZSBldmFsdWF0ZSBsb2NhbCBhYWJiXG4gICAgICAgIGlmICghbG9jYWxBYWJiKSB7XG5cbiAgICAgICAgICAgIGxvY2FsQWFiYiA9IF90bXBBYWJiO1xuXG4gICAgICAgICAgICBpZiAodGhpcy5za2luSW5zdGFuY2UpIHtcblxuICAgICAgICAgICAgICAgIC8vIEluaXRpYWxpemUgbG9jYWwgYm9uZSBBQUJCcyBpZiBuZWVkZWRcbiAgICAgICAgICAgICAgICBpZiAoIXRoaXMubWVzaC5ib25lQWFiYikge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBtb3JwaFRhcmdldHMgPSB0aGlzLl9tb3JwaEluc3RhbmNlID8gdGhpcy5fbW9ycGhJbnN0YW5jZS5tb3JwaC5fdGFyZ2V0cyA6IG51bGw7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMubWVzaC5faW5pdEJvbmVBYWJicyhtb3JwaFRhcmdldHMpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIGV2YWx1YXRlIGxvY2FsIHNwYWNlIGJvdW5kcyBiYXNlZCBvbiBhbGwgYWN0aXZlIGJvbmVzXG4gICAgICAgICAgICAgICAgY29uc3QgYm9uZVVzZWQgPSB0aGlzLm1lc2guYm9uZVVzZWQ7XG4gICAgICAgICAgICAgICAgbGV0IGZpcnN0ID0gdHJ1ZTtcblxuICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5tZXNoLmJvbmVBYWJiLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChib25lVXNlZFtpXSkge1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyB0cmFuc2Zvcm0gYm9uZSBBQUJCIGJ5IGJvbmUgbWF0cml4XG4gICAgICAgICAgICAgICAgICAgICAgICBfdGVtcEJvbmVBYWJiLnNldEZyb21UcmFuc2Zvcm1lZEFhYmIodGhpcy5tZXNoLmJvbmVBYWJiW2ldLCB0aGlzLnNraW5JbnN0YW5jZS5tYXRyaWNlc1tpXSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGFkZCB0aGVtIHVwXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoZmlyc3QpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmaXJzdCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxvY2FsQWFiYi5jZW50ZXIuY29weShfdGVtcEJvbmVBYWJiLmNlbnRlcik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbG9jYWxBYWJiLmhhbGZFeHRlbnRzLmNvcHkoX3RlbXBCb25lQWFiYi5oYWxmRXh0ZW50cyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxvY2FsQWFiYi5hZGQoX3RlbXBCb25lQWFiYik7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB0b1dvcmxkU3BhY2UgPSB0cnVlO1xuXG4gICAgICAgICAgICB9IGVsc2UgaWYgKHRoaXMubm9kZS5fYWFiYlZlciAhPT0gdGhpcy5fYWFiYlZlcikge1xuXG4gICAgICAgICAgICAgICAgLy8gbG9jYWwgc3BhY2UgYm91bmRpbmcgYm94IC0gZWl0aGVyIGZyb20gbWVzaCBvciBlbXB0eVxuICAgICAgICAgICAgICAgIGlmICh0aGlzLm1lc2gpIHtcbiAgICAgICAgICAgICAgICAgICAgbG9jYWxBYWJiLmNlbnRlci5jb3B5KHRoaXMubWVzaC5hYWJiLmNlbnRlcik7XG4gICAgICAgICAgICAgICAgICAgIGxvY2FsQWFiYi5oYWxmRXh0ZW50cy5jb3B5KHRoaXMubWVzaC5hYWJiLmhhbGZFeHRlbnRzKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBsb2NhbEFhYmIuY2VudGVyLnNldCgwLCAwLCAwKTtcbiAgICAgICAgICAgICAgICAgICAgbG9jYWxBYWJiLmhhbGZFeHRlbnRzLnNldCgwLCAwLCAwKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyB1cGRhdGUgbG9jYWwgc3BhY2UgYm91bmRpbmcgYm94IGJ5IG1vcnBoIHRhcmdldHNcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5tZXNoICYmIHRoaXMubWVzaC5tb3JwaCkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBtb3JwaEFhYmIgPSB0aGlzLm1lc2gubW9ycGguYWFiYjtcbiAgICAgICAgICAgICAgICAgICAgbG9jYWxBYWJiLl9leHBhbmQobW9ycGhBYWJiLmdldE1pbigpLCBtb3JwaEFhYmIuZ2V0TWF4KCkpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHRvV29ybGRTcGFjZSA9IHRydWU7XG4gICAgICAgICAgICAgICAgdGhpcy5fYWFiYlZlciA9IHRoaXMubm9kZS5fYWFiYlZlcjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHN0b3JlIHdvcmxkIHNwYWNlIGJvdW5kaW5nIGJveFxuICAgICAgICBpZiAodG9Xb3JsZFNwYWNlKSB7XG4gICAgICAgICAgICB0aGlzLl9hYWJiLnNldEZyb21UcmFuc2Zvcm1lZEFhYmIobG9jYWxBYWJiLCB0aGlzLm5vZGUuZ2V0V29ybGRUcmFuc2Zvcm0oKSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdGhpcy5fYWFiYjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDbGVhciB0aGUgaW50ZXJuYWwgc2hhZGVyIGNhY2hlLlxuICAgICAqXG4gICAgICogQGlnbm9yZVxuICAgICAqL1xuICAgIGNsZWFyU2hhZGVycygpIHtcbiAgICAgICAgY29uc3Qgc2hhZGVyQ2FjaGUgPSB0aGlzLl9zaGFkZXJDYWNoZTtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzaGFkZXJDYWNoZS5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgc2hhZGVyQ2FjaGVbaV0/LmRlc3Ryb3koKTtcbiAgICAgICAgICAgIHNoYWRlckNhY2hlW2ldID0gbnVsbDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIHNoYWRlciBpbnN0YW5jZSBmb3IgdGhlIHNwZWNpZmllZCBzaGFkZXIgcGFzcyBhbmQgbGlnaHQgaGFzaCB0aGF0IGlzIGNvbXBhdGlibGVcbiAgICAgKiB3aXRoIHRoaXMgbWVzaCBpbnN0YW5jZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBzaGFkZXJQYXNzIC0gVGhlIHNoYWRlciBwYXNzIGluZGV4LlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBsaWdodEhhc2ggLSBUaGUgaGFzaCB2YWx1ZSBvZiB0aGUgbGlnaHRzIHRoYXQgYXJlIGFmZmVjdGluZyB0aGlzIG1lc2ggaW5zdGFuY2UuXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4vc2NlbmUuanMnKS5TY2VuZX0gc2NlbmUgLSBUaGUgc2NlbmUuXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4uL3BsYXRmb3JtL2dyYXBoaWNzL3VuaWZvcm0tYnVmZmVyLWZvcm1hdC5qcycpLlVuaWZvcm1CdWZmZXJGb3JtYXR9IFt2aWV3VW5pZm9ybUZvcm1hdF0gLSBUaGVcbiAgICAgKiBmb3JtYXQgb2YgdGhlIHZpZXcgdW5pZm9ybSBidWZmZXIuXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4uL3BsYXRmb3JtL2dyYXBoaWNzL2JpbmQtZ3JvdXAtZm9ybWF0LmpzJykuQmluZEdyb3VwRm9ybWF0fSBbdmlld0JpbmRHcm91cEZvcm1hdF0gLSBUaGVcbiAgICAgKiBmb3JtYXQgb2YgdGhlIHZpZXcgYmluZCBncm91cC5cbiAgICAgKiBAcGFyYW0ge2FueX0gW3NvcnRlZExpZ2h0c10gLSBBcnJheSBvZiBhcnJheXMgb2YgbGlnaHRzLlxuICAgICAqIEByZXR1cm5zIHtTaGFkZXJJbnN0YW5jZX0gLSB0aGUgc2hhZGVyIGluc3RhbmNlLlxuICAgICAqIEBpZ25vcmVcbiAgICAgKi9cbiAgICBnZXRTaGFkZXJJbnN0YW5jZShzaGFkZXJQYXNzLCBsaWdodEhhc2gsIHNjZW5lLCB2aWV3VW5pZm9ybUZvcm1hdCwgdmlld0JpbmRHcm91cEZvcm1hdCwgc29ydGVkTGlnaHRzKSB7XG5cbiAgICAgICAgbGV0IHNoYWRlckluc3RhbmNlO1xuICAgICAgICBsZXQgcGFzc0VudHJ5ID0gdGhpcy5fc2hhZGVyQ2FjaGVbc2hhZGVyUGFzc107XG4gICAgICAgIGlmIChwYXNzRW50cnkpIHtcbiAgICAgICAgICAgIHNoYWRlckluc3RhbmNlID0gcGFzc0VudHJ5LnNoYWRlckluc3RhbmNlcy5nZXQobGlnaHRIYXNoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHBhc3NFbnRyeSA9IG5ldyBTaGFkZXJDYWNoZUVudHJ5KCk7XG4gICAgICAgICAgICB0aGlzLl9zaGFkZXJDYWNoZVtzaGFkZXJQYXNzXSA9IHBhc3NFbnRyeTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGNhY2hlIG1pc3MgaW4gdGhlIHNoYWRlciBjYWNoZSBvZiB0aGUgbWVzaCBpbnN0YW5jZVxuICAgICAgICBpZiAoIXNoYWRlckluc3RhbmNlKSB7XG5cbiAgICAgICAgICAgIC8vIGdldCB0aGUgc2hhZGVyIGZyb20gdGhlIG1hdGVyaWFsXG4gICAgICAgICAgICBjb25zdCBtYXQgPSB0aGlzLl9tYXRlcmlhbDtcbiAgICAgICAgICAgIGNvbnN0IHNoYWRlckRlZnMgPSB0aGlzLl9zaGFkZXJEZWZzO1xuICAgICAgICAgICAgY29uc3QgdmFyaWFudEtleSA9IHNoYWRlclBhc3MgKyAnXycgKyBzaGFkZXJEZWZzICsgJ18nICsgbGlnaHRIYXNoO1xuICAgICAgICAgICAgc2hhZGVySW5zdGFuY2UgPSBuZXcgU2hhZGVySW5zdGFuY2UoKTtcbiAgICAgICAgICAgIHNoYWRlckluc3RhbmNlLnNoYWRlciA9IG1hdC52YXJpYW50cy5nZXQodmFyaWFudEtleSk7XG5cbiAgICAgICAgICAgIC8vIGNhY2hlIG1pc3MgaW4gdGhlIG1hdGVyaWFsIHZhcmlhbnRzXG4gICAgICAgICAgICBpZiAoIXNoYWRlckluc3RhbmNlLnNoYWRlcikge1xuXG4gICAgICAgICAgICAgICAgY29uc3Qgc2hhZGVyID0gbWF0LmdldFNoYWRlclZhcmlhbnQodGhpcy5tZXNoLmRldmljZSwgc2NlbmUsIHNoYWRlckRlZnMsIG51bGwsIHNoYWRlclBhc3MsIHNvcnRlZExpZ2h0cyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2aWV3VW5pZm9ybUZvcm1hdCwgdmlld0JpbmRHcm91cEZvcm1hdCwgdGhpcy5fbWVzaC52ZXJ0ZXhCdWZmZXIuZm9ybWF0KTtcblxuICAgICAgICAgICAgICAgIC8vIGFkZCBpdCB0byB0aGUgbWF0ZXJpYWwgdmFyaWFudHMgY2FjaGVcbiAgICAgICAgICAgICAgICBtYXQudmFyaWFudHMuc2V0KHZhcmlhbnRLZXksIHNoYWRlcik7XG5cbiAgICAgICAgICAgICAgICBzaGFkZXJJbnN0YW5jZS5zaGFkZXIgPSBzaGFkZXI7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIGFkZCBpdCB0byB0aGUgbWVzaCBpbnN0YW5jZSBjYWNoZVxuICAgICAgICAgICAgcGFzc0VudHJ5LnNoYWRlckluc3RhbmNlcy5zZXQobGlnaHRIYXNoLCBzaGFkZXJJbnN0YW5jZSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gc2hhZGVySW5zdGFuY2U7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVGhlIG1hdGVyaWFsIHVzZWQgYnkgdGhpcyBtZXNoIGluc3RhbmNlLlxuICAgICAqXG4gICAgICogQHR5cGUge2ltcG9ydCgnLi9tYXRlcmlhbHMvbWF0ZXJpYWwuanMnKS5NYXRlcmlhbH1cbiAgICAgKi9cbiAgICBzZXQgbWF0ZXJpYWwobWF0ZXJpYWwpIHtcblxuICAgICAgICB0aGlzLmNsZWFyU2hhZGVycygpO1xuXG4gICAgICAgIGNvbnN0IHByZXZNYXQgPSB0aGlzLl9tYXRlcmlhbDtcblxuICAgICAgICAvLyBSZW1vdmUgdGhlIG1hdGVyaWFsJ3MgcmVmZXJlbmNlIHRvIHRoaXMgbWVzaCBpbnN0YW5jZVxuICAgICAgICBpZiAocHJldk1hdCkge1xuICAgICAgICAgICAgcHJldk1hdC5yZW1vdmVNZXNoSW5zdGFuY2VSZWYodGhpcyk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl9tYXRlcmlhbCA9IG1hdGVyaWFsO1xuXG4gICAgICAgIGlmIChtYXRlcmlhbCkge1xuXG4gICAgICAgICAgICAvLyBSZWNvcmQgdGhhdCB0aGUgbWF0ZXJpYWwgaXMgcmVmZXJlbmNlZCBieSB0aGlzIG1lc2ggaW5zdGFuY2VcbiAgICAgICAgICAgIG1hdGVyaWFsLmFkZE1lc2hJbnN0YW5jZVJlZih0aGlzKTtcblxuICAgICAgICAgICAgLy8gdXBkYXRlIHRyYW5zcGFyZW50IGZsYWcgYmFzZWQgb24gbWF0ZXJpYWxcbiAgICAgICAgICAgIHRoaXMudHJhbnNwYXJlbnQgPSBtYXRlcmlhbC50cmFuc3BhcmVudDtcblxuICAgICAgICAgICAgdGhpcy51cGRhdGVLZXkoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGdldCBtYXRlcmlhbCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX21hdGVyaWFsO1xuICAgIH1cblxuICAgIHNldCBsYXllcihsYXllcikge1xuICAgICAgICB0aGlzLl9sYXllciA9IGxheWVyO1xuICAgICAgICB0aGlzLnVwZGF0ZUtleSgpO1xuICAgIH1cblxuICAgIGdldCBsYXllcigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2xheWVyO1xuICAgIH1cblxuICAgIF91cGRhdGVTaGFkZXJEZWZzKHNoYWRlckRlZnMpIHtcbiAgICAgICAgaWYgKHNoYWRlckRlZnMgIT09IHRoaXMuX3NoYWRlckRlZnMpIHtcbiAgICAgICAgICAgIHRoaXMuX3NoYWRlckRlZnMgPSBzaGFkZXJEZWZzO1xuICAgICAgICAgICAgdGhpcy5jbGVhclNoYWRlcnMoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEluIHNvbWUgY2lyY3Vtc3RhbmNlcyBtZXNoIGluc3RhbmNlcyBhcmUgc29ydGVkIGJ5IGEgZGlzdGFuY2UgY2FsY3VsYXRpb24gdG8gZGV0ZXJtaW5lIHRoZWlyXG4gICAgICogcmVuZGVyaW5nIG9yZGVyLiBTZXQgdGhpcyBjYWxsYmFjayB0byBvdmVycmlkZSB0aGUgZGVmYXVsdCBkaXN0YW5jZSBjYWxjdWxhdGlvbiwgd2hpY2ggZ2l2ZXNcbiAgICAgKiB0aGUgZG90IHByb2R1Y3Qgb2YgdGhlIGNhbWVyYSBmb3J3YXJkIHZlY3RvciBhbmQgdGhlIHZlY3RvciBiZXR3ZWVuIHRoZSBjYW1lcmEgcG9zaXRpb24gYW5kXG4gICAgICogdGhlIGNlbnRlciBvZiB0aGUgbWVzaCBpbnN0YW5jZSdzIGF4aXMtYWxpZ25lZCBib3VuZGluZyBib3guIFRoaXMgb3B0aW9uIGNhbiBiZSBwYXJ0aWN1bGFybHlcbiAgICAgKiB1c2VmdWwgZm9yIHJlbmRlcmluZyB0cmFuc3BhcmVudCBtZXNoZXMgaW4gYSBiZXR0ZXIgb3JkZXIgdGhhbiBkZWZhdWx0LlxuICAgICAqXG4gICAgICogQHR5cGUge0NhbGN1bGF0ZVNvcnREaXN0YW5jZUNhbGxiYWNrfVxuICAgICAqL1xuICAgIHNldCBjYWxjdWxhdGVTb3J0RGlzdGFuY2UoY2FsY3VsYXRlU29ydERpc3RhbmNlKSB7XG4gICAgICAgIHRoaXMuX2NhbGN1bGF0ZVNvcnREaXN0YW5jZSA9IGNhbGN1bGF0ZVNvcnREaXN0YW5jZTtcbiAgICB9XG5cbiAgICBnZXQgY2FsY3VsYXRlU29ydERpc3RhbmNlKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fY2FsY3VsYXRlU29ydERpc3RhbmNlO1xuICAgIH1cblxuICAgIHNldCByZWNlaXZlU2hhZG93KHZhbCkge1xuICAgICAgICBpZiAodGhpcy5fcmVjZWl2ZVNoYWRvdyAhPT0gdmFsKSB7XG4gICAgICAgICAgICB0aGlzLl9yZWNlaXZlU2hhZG93ID0gdmFsO1xuICAgICAgICAgICAgdGhpcy5fdXBkYXRlU2hhZGVyRGVmcyh2YWwgPyAodGhpcy5fc2hhZGVyRGVmcyAmIH5TSEFERVJERUZfTk9TSEFET1cpIDogKHRoaXMuX3NoYWRlckRlZnMgfCBTSEFERVJERUZfTk9TSEFET1cpKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGdldCByZWNlaXZlU2hhZG93KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fcmVjZWl2ZVNoYWRvdztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUaGUgc2tpbiBpbnN0YW5jZSBtYW5hZ2luZyBza2lubmluZyBvZiB0aGlzIG1lc2ggaW5zdGFuY2UsIG9yIG51bGwgaWYgc2tpbm5pbmcgaXMgbm90IHVzZWQuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7aW1wb3J0KCcuL3NraW4taW5zdGFuY2UuanMnKS5Ta2luSW5zdGFuY2V9XG4gICAgICovXG4gICAgc2V0IHNraW5JbnN0YW5jZSh2YWwpIHtcbiAgICAgICAgdGhpcy5fc2tpbkluc3RhbmNlID0gdmFsO1xuICAgICAgICB0aGlzLl91cGRhdGVTaGFkZXJEZWZzKHZhbCA/ICh0aGlzLl9zaGFkZXJEZWZzIHwgU0hBREVSREVGX1NLSU4pIDogKHRoaXMuX3NoYWRlckRlZnMgJiB+U0hBREVSREVGX1NLSU4pKTtcbiAgICAgICAgdGhpcy5fc2V0dXBTa2luVXBkYXRlKCk7XG4gICAgfVxuXG4gICAgZ2V0IHNraW5JbnN0YW5jZSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3NraW5JbnN0YW5jZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUaGUgbW9ycGggaW5zdGFuY2UgbWFuYWdpbmcgbW9ycGhpbmcgb2YgdGhpcyBtZXNoIGluc3RhbmNlLCBvciBudWxsIGlmIG1vcnBoaW5nIGlzIG5vdCB1c2VkLlxuICAgICAqXG4gICAgICogQHR5cGUge2ltcG9ydCgnLi9tb3JwaC1pbnN0YW5jZS5qcycpLk1vcnBoSW5zdGFuY2V9XG4gICAgICovXG4gICAgc2V0IG1vcnBoSW5zdGFuY2UodmFsKSB7XG5cbiAgICAgICAgLy8gcmVsZWFzZSBleGlzdGluZ1xuICAgICAgICB0aGlzLl9tb3JwaEluc3RhbmNlPy5kZXN0cm95KCk7XG5cbiAgICAgICAgLy8gYXNzaWduIG5ld1xuICAgICAgICB0aGlzLl9tb3JwaEluc3RhbmNlID0gdmFsO1xuXG4gICAgICAgIGxldCBzaGFkZXJEZWZzID0gdGhpcy5fc2hhZGVyRGVmcztcbiAgICAgICAgc2hhZGVyRGVmcyA9ICh2YWwgJiYgdmFsLm1vcnBoLnVzZVRleHR1cmVNb3JwaCkgPyAoc2hhZGVyRGVmcyB8IFNIQURFUkRFRl9NT1JQSF9URVhUVVJFX0JBU0VEKSA6IChzaGFkZXJEZWZzICYgflNIQURFUkRFRl9NT1JQSF9URVhUVVJFX0JBU0VEKTtcbiAgICAgICAgc2hhZGVyRGVmcyA9ICh2YWwgJiYgdmFsLm1vcnBoLm1vcnBoUG9zaXRpb25zKSA/IChzaGFkZXJEZWZzIHwgU0hBREVSREVGX01PUlBIX1BPU0lUSU9OKSA6IChzaGFkZXJEZWZzICYgflNIQURFUkRFRl9NT1JQSF9QT1NJVElPTik7XG4gICAgICAgIHNoYWRlckRlZnMgPSAodmFsICYmIHZhbC5tb3JwaC5tb3JwaE5vcm1hbHMpID8gKHNoYWRlckRlZnMgfCBTSEFERVJERUZfTU9SUEhfTk9STUFMKSA6IChzaGFkZXJEZWZzICYgflNIQURFUkRFRl9NT1JQSF9OT1JNQUwpO1xuICAgICAgICB0aGlzLl91cGRhdGVTaGFkZXJEZWZzKHNoYWRlckRlZnMpO1xuICAgIH1cblxuICAgIGdldCBtb3JwaEluc3RhbmNlKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fbW9ycGhJbnN0YW5jZTtcbiAgICB9XG5cbiAgICBzZXQgc2NyZWVuU3BhY2UodmFsKSB7XG4gICAgICAgIGlmICh0aGlzLl9zY3JlZW5TcGFjZSAhPT0gdmFsKSB7XG4gICAgICAgICAgICB0aGlzLl9zY3JlZW5TcGFjZSA9IHZhbDtcbiAgICAgICAgICAgIHRoaXMuX3VwZGF0ZVNoYWRlckRlZnModmFsID8gKHRoaXMuX3NoYWRlckRlZnMgfCBTSEFERVJERUZfU0NSRUVOU1BBQ0UpIDogKHRoaXMuX3NoYWRlckRlZnMgJiB+U0hBREVSREVGX1NDUkVFTlNQQUNFKSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBnZXQgc2NyZWVuU3BhY2UoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9zY3JlZW5TcGFjZTtcbiAgICB9XG5cbiAgICBzZXQga2V5KHZhbCkge1xuICAgICAgICB0aGlzLl9rZXlbU09SVEtFWV9GT1JXQVJEXSA9IHZhbDtcbiAgICB9XG5cbiAgICBnZXQga2V5KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fa2V5W1NPUlRLRVlfRk9SV0FSRF07XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTWFzayBjb250cm9sbGluZyB3aGljaCB7QGxpbmsgTGlnaHRDb21wb25lbnR9cyBsaWdodCB0aGlzIG1lc2ggaW5zdGFuY2UsIHdoaWNoXG4gICAgICoge0BsaW5rIENhbWVyYUNvbXBvbmVudH0gc2VlcyBpdCBhbmQgaW4gd2hpY2gge0BsaW5rIExheWVyfSBpdCBpcyByZW5kZXJlZC4gRGVmYXVsdHMgdG8gMS5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtudW1iZXJ9XG4gICAgICovXG4gICAgc2V0IG1hc2sodmFsKSB7XG4gICAgICAgIGNvbnN0IHRvZ2dsZXMgPSB0aGlzLl9zaGFkZXJEZWZzICYgMHgwMDAwRkZGRjtcbiAgICAgICAgdGhpcy5fdXBkYXRlU2hhZGVyRGVmcyh0b2dnbGVzIHwgKHZhbCA8PCAxNikpO1xuICAgIH1cblxuICAgIGdldCBtYXNrKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fc2hhZGVyRGVmcyA+PiAxNjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBOdW1iZXIgb2YgaW5zdGFuY2VzIHdoZW4gdXNpbmcgaGFyZHdhcmUgaW5zdGFuY2luZyB0byByZW5kZXIgdGhlIG1lc2guXG4gICAgICpcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqL1xuICAgIHNldCBpbnN0YW5jaW5nQ291bnQodmFsdWUpIHtcbiAgICAgICAgaWYgKHRoaXMuaW5zdGFuY2luZ0RhdGEpXG4gICAgICAgICAgICB0aGlzLmluc3RhbmNpbmdEYXRhLmNvdW50ID0gdmFsdWU7XG4gICAgfVxuXG4gICAgZ2V0IGluc3RhbmNpbmdDb3VudCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuaW5zdGFuY2luZ0RhdGEgPyB0aGlzLmluc3RhbmNpbmdEYXRhLmNvdW50IDogMDtcbiAgICB9XG5cbiAgICBkZXN0cm95KCkge1xuXG4gICAgICAgIGNvbnN0IG1lc2ggPSB0aGlzLm1lc2g7XG4gICAgICAgIGlmIChtZXNoKSB7XG5cbiAgICAgICAgICAgIC8vIHRoaXMgZGVjcmVhc2VzIHJlZiBjb3VudCBvbiB0aGUgbWVzaFxuICAgICAgICAgICAgdGhpcy5tZXNoID0gbnVsbDtcblxuICAgICAgICAgICAgLy8gZGVzdHJveSBtZXNoXG4gICAgICAgICAgICBpZiAobWVzaC5yZWZDb3VudCA8IDEpIHtcbiAgICAgICAgICAgICAgICBtZXNoLmRlc3Ryb3koKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHJlbGVhc2UgcmVmIGNvdW50ZWQgbGlnaHRtYXBzXG4gICAgICAgIHRoaXMuc2V0UmVhbHRpbWVMaWdodG1hcChNZXNoSW5zdGFuY2UubGlnaHRtYXBQYXJhbU5hbWVzWzBdLCBudWxsKTtcbiAgICAgICAgdGhpcy5zZXRSZWFsdGltZUxpZ2h0bWFwKE1lc2hJbnN0YW5jZS5saWdodG1hcFBhcmFtTmFtZXNbMV0sIG51bGwpO1xuXG4gICAgICAgIHRoaXMuX3NraW5JbnN0YW5jZT8uZGVzdHJveSgpO1xuICAgICAgICB0aGlzLl9za2luSW5zdGFuY2UgPSBudWxsO1xuXG4gICAgICAgIHRoaXMubW9ycGhJbnN0YW5jZT8uZGVzdHJveSgpO1xuICAgICAgICB0aGlzLm1vcnBoSW5zdGFuY2UgPSBudWxsO1xuXG4gICAgICAgIHRoaXMuY2xlYXJTaGFkZXJzKCk7XG5cbiAgICAgICAgLy8gbWFrZSBzdXJlIG1hdGVyaWFsIGNsZWFycyByZWZlcmVuY2VzIHRvIHRoaXMgbWVzaEluc3RhbmNlXG4gICAgICAgIHRoaXMubWF0ZXJpYWwgPSBudWxsO1xuICAgIH1cblxuICAgIC8vIHNoYWRlciB1bmlmb3JtIG5hbWVzIGZvciBsaWdodG1hcHNcbiAgICBzdGF0aWMgbGlnaHRtYXBQYXJhbU5hbWVzID0gWyd0ZXh0dXJlX2xpZ2h0TWFwJywgJ3RleHR1cmVfZGlyTGlnaHRNYXAnXTtcblxuICAgIC8vIGdlbmVyYXRlcyB3aXJlZnJhbWVzIGZvciBhbiBhcnJheSBvZiBtZXNoIGluc3RhbmNlc1xuICAgIHN0YXRpYyBfcHJlcGFyZVJlbmRlclN0eWxlRm9yQXJyYXkobWVzaEluc3RhbmNlcywgcmVuZGVyU3R5bGUpIHtcblxuICAgICAgICBpZiAobWVzaEluc3RhbmNlcykge1xuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBtZXNoSW5zdGFuY2VzLmxlbmd0aDsgaSsrKSB7XG5cbiAgICAgICAgICAgICAgICAvLyBzd2l0Y2ggbWVzaCBpbnN0YW5jZSB0byB0aGUgcmVxdWVzdGVkIHN0eWxlXG4gICAgICAgICAgICAgICAgbWVzaEluc3RhbmNlc1tpXS5fcmVuZGVyU3R5bGUgPSByZW5kZXJTdHlsZTtcblxuICAgICAgICAgICAgICAgIC8vIHByb2Nlc3MgYWxsIHVuaXF1ZSBtZXNoZXNcbiAgICAgICAgICAgICAgICBjb25zdCBtZXNoID0gbWVzaEluc3RhbmNlc1tpXS5tZXNoO1xuICAgICAgICAgICAgICAgIGlmICghX21lc2hTZXQuaGFzKG1lc2gpKSB7XG4gICAgICAgICAgICAgICAgICAgIF9tZXNoU2V0LmFkZChtZXNoKTtcbiAgICAgICAgICAgICAgICAgICAgbWVzaC5wcmVwYXJlUmVuZGVyU3RhdGUocmVuZGVyU3R5bGUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgX21lc2hTZXQuY2xlYXIoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIHRlc3QgaWYgbWVzaEluc3RhbmNlIGlzIHZpc2libGUgYnkgY2FtZXJhLiBJdCByZXF1aXJlcyB0aGUgZnJ1c3R1bSBvZiB0aGUgY2FtZXJhIHRvIGJlIHVwIHRvIGRhdGUsIHdoaWNoIGZvcndhcmQtcmVuZGVyZXJcbiAgICAvLyB0YWtlcyBjYXJlIG9mLiBUaGlzIGZ1bmN0aW9uIHNob3VsZCAgbm90IGJlIGNhbGxlZCBlbHNld2hlcmUuXG4gICAgX2lzVmlzaWJsZShjYW1lcmEpIHtcblxuICAgICAgICBpZiAodGhpcy52aXNpYmxlKSB7XG5cbiAgICAgICAgICAgIC8vIGN1c3RvbSB2aXNpYmlsaXR5IG1ldGhvZCBvZiBNZXNoSW5zdGFuY2VcbiAgICAgICAgICAgIGlmICh0aGlzLmlzVmlzaWJsZUZ1bmMpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5pc1Zpc2libGVGdW5jKGNhbWVyYSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIF90ZW1wU3BoZXJlLmNlbnRlciA9IHRoaXMuYWFiYi5jZW50ZXI7ICAvLyB0aGlzIGxpbmUgZXZhbHVhdGVzIGFhYmJcbiAgICAgICAgICAgIF90ZW1wU3BoZXJlLnJhZGl1cyA9IHRoaXMuX2FhYmIuaGFsZkV4dGVudHMubGVuZ3RoKCk7XG5cbiAgICAgICAgICAgIHJldHVybiBjYW1lcmEuZnJ1c3R1bS5jb250YWluc1NwaGVyZShfdGVtcFNwaGVyZSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgdXBkYXRlS2V5KCkge1xuXG4gICAgICAgIC8vIHJlbmRlciBhbHBoYXRlc3QvYXRvYyBhZnRlciBvcGFxdWVcbiAgICAgICAgY29uc3QgbWF0ZXJpYWwgPSB0aGlzLm1hdGVyaWFsO1xuICAgICAgICBjb25zdCBibGVuZFR5cGUgPSAobWF0ZXJpYWwuYWxwaGFUb0NvdmVyYWdlIHx8IG1hdGVyaWFsLmFscGhhVGVzdCkgPyBCTEVORF9OT1JNQUwgOiBtYXRlcmlhbC5ibGVuZFR5cGU7XG5cbiAgICAgICAgLy8gS2V5IGRlZmluaXRpb246XG4gICAgICAgIC8vIEJpdFxuICAgICAgICAvLyAzMSAgICAgIDogc2lnbiBiaXQgKGxlYXZlKVxuICAgICAgICAvLyAyNyAtIDMwIDogbGF5ZXJcbiAgICAgICAgLy8gMjYgICAgICA6IHRyYW5zbHVjZW5jeSB0eXBlIChvcGFxdWUvdHJhbnNwYXJlbnQpXG4gICAgICAgIC8vIDI1ICAgICAgOiB1bnVzZWRcbiAgICAgICAgLy8gMCAtIDI0ICA6IE1hdGVyaWFsIElEIChpZiBvcGFxdWUpIG9yIDAgKGlmIHRyYW5zcGFyZW50IC0gd2lsbCBiZSBkZXB0aClcbiAgICAgICAgdGhpcy5fa2V5W1NPUlRLRVlfRk9SV0FSRF0gPVxuICAgICAgICAgICAgKCh0aGlzLmxheWVyICYgMHgwZikgPDwgMjcpIHxcbiAgICAgICAgICAgICgoYmxlbmRUeXBlID09PSBCTEVORF9OT05FID8gMSA6IDApIDw8IDI2KSB8XG4gICAgICAgICAgICAoKG1hdGVyaWFsLmlkICYgMHgxZmZmZmZmKSA8PCAwKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHVwIHtAbGluayBNZXNoSW5zdGFuY2V9IHRvIGJlIHJlbmRlcmVkIHVzaW5nIEhhcmR3YXJlIEluc3RhbmNpbmcuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi4vcGxhdGZvcm0vZ3JhcGhpY3MvdmVydGV4LWJ1ZmZlci5qcycpLlZlcnRleEJ1ZmZlcnxudWxsfSB2ZXJ0ZXhCdWZmZXIgLSBWZXJ0ZXggYnVmZmVyIHRvIGhvbGQgcGVyLWluc3RhbmNlIHZlcnRleCBkYXRhXG4gICAgICogKHVzdWFsbHkgd29ybGQgbWF0cmljZXMpLiBQYXNzIG51bGwgdG8gdHVybiBvZmYgaGFyZHdhcmUgaW5zdGFuY2luZy5cbiAgICAgKi9cbiAgICBzZXRJbnN0YW5jaW5nKHZlcnRleEJ1ZmZlcikge1xuICAgICAgICBpZiAodmVydGV4QnVmZmVyKSB7XG4gICAgICAgICAgICB0aGlzLmluc3RhbmNpbmdEYXRhID0gbmV3IEluc3RhbmNpbmdEYXRhKHZlcnRleEJ1ZmZlci5udW1WZXJ0aWNlcyk7XG4gICAgICAgICAgICB0aGlzLmluc3RhbmNpbmdEYXRhLnZlcnRleEJ1ZmZlciA9IHZlcnRleEJ1ZmZlcjtcblxuICAgICAgICAgICAgLy8gbWFyayB2ZXJ0ZXggYnVmZmVyIGFzIGluc3RhbmNpbmcgZGF0YVxuICAgICAgICAgICAgdmVydGV4QnVmZmVyLmZvcm1hdC5pbnN0YW5jaW5nID0gdHJ1ZTtcblxuICAgICAgICAgICAgLy8gdHVybiBvZmYgY3VsbGluZyAtIHdlIGRvIG5vdCBkbyBwZXItaW5zdGFuY2UgY3VsbGluZywgYWxsIGluc3RhbmNlcyBhcmUgc3VibWl0dGVkIHRvIEdQVVxuICAgICAgICAgICAgdGhpcy5jdWxsID0gZmFsc2U7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmluc3RhbmNpbmdEYXRhID0gbnVsbDtcbiAgICAgICAgICAgIHRoaXMuY3VsbCA9IHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl91cGRhdGVTaGFkZXJEZWZzKHZlcnRleEJ1ZmZlciA/ICh0aGlzLl9zaGFkZXJEZWZzIHwgU0hBREVSREVGX0lOU1RBTkNJTkcpIDogKHRoaXMuX3NoYWRlckRlZnMgJiB+U0hBREVSREVGX0lOU1RBTkNJTkcpKTtcbiAgICB9XG5cbiAgICBlbnN1cmVNYXRlcmlhbChkZXZpY2UpIHtcbiAgICAgICAgaWYgKCF0aGlzLm1hdGVyaWFsKSB7XG4gICAgICAgICAgICBEZWJ1Zy53YXJuKGBNZXNoIGF0dGFjaGVkIHRvIGVudGl0eSAnJHt0aGlzLm5vZGUubmFtZX0nIGRvZXMgbm90IGhhdmUgYSBtYXRlcmlhbCwgdXNpbmcgYSBkZWZhdWx0IG9uZS5gKTtcbiAgICAgICAgICAgIHRoaXMubWF0ZXJpYWwgPSBnZXREZWZhdWx0TWF0ZXJpYWwoZGV2aWNlKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIFBhcmFtZXRlciBtYW5hZ2VtZW50XG4gICAgY2xlYXJQYXJhbWV0ZXJzKCkge1xuICAgICAgICB0aGlzLnBhcmFtZXRlcnMgPSB7fTtcbiAgICB9XG5cbiAgICBnZXRQYXJhbWV0ZXJzKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5wYXJhbWV0ZXJzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHJpZXZlcyB0aGUgc3BlY2lmaWVkIHNoYWRlciBwYXJhbWV0ZXIgZnJvbSBhIG1lc2ggaW5zdGFuY2UuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gbmFtZSAtIFRoZSBuYW1lIG9mIHRoZSBwYXJhbWV0ZXIgdG8gcXVlcnkuXG4gICAgICogQHJldHVybnMge29iamVjdH0gVGhlIG5hbWVkIHBhcmFtZXRlci5cbiAgICAgKi9cbiAgICBnZXRQYXJhbWV0ZXIobmFtZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5wYXJhbWV0ZXJzW25hbWVdO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgYSBzaGFkZXIgcGFyYW1ldGVyIG9uIGEgbWVzaCBpbnN0YW5jZS4gTm90ZSB0aGF0IHRoaXMgcGFyYW1ldGVyIHdpbGwgdGFrZSBwcmVjZWRlbmNlXG4gICAgICogb3ZlciBwYXJhbWV0ZXIgb2YgdGhlIHNhbWUgbmFtZSBpZiBzZXQgb24gTWF0ZXJpYWwgdGhpcyBtZXNoIGluc3RhbmNlIHVzZXMgZm9yIHJlbmRlcmluZy5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lIC0gVGhlIG5hbWUgb2YgdGhlIHBhcmFtZXRlciB0byBzZXQuXG4gICAgICogQHBhcmFtIHtudW1iZXJ8bnVtYmVyW118aW1wb3J0KCcuLi9wbGF0Zm9ybS9ncmFwaGljcy90ZXh0dXJlLmpzJykuVGV4dHVyZX0gZGF0YSAtIFRoZSB2YWx1ZVxuICAgICAqIGZvciB0aGUgc3BlY2lmaWVkIHBhcmFtZXRlci5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gW3Bhc3NGbGFnc10gLSBNYXNrIGRlc2NyaWJpbmcgd2hpY2ggcGFzc2VzIHRoZSBtYXRlcmlhbCBzaG91bGQgYmUgaW5jbHVkZWRcbiAgICAgKiBpbi5cbiAgICAgKi9cbiAgICBzZXRQYXJhbWV0ZXIobmFtZSwgZGF0YSwgcGFzc0ZsYWdzID0gLTI2MjE0MSkge1xuXG4gICAgICAgIC8vIG5vdGUgb24gLTI2MjE0MTogQWxsIGJpdHMgc2V0IGV4Y2VwdCAyIC0gMTkgcmFuZ2VcblxuICAgICAgICBpZiAoZGF0YSA9PT0gdW5kZWZpbmVkICYmIHR5cGVvZiBuYW1lID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgY29uc3QgdW5pZm9ybU9iamVjdCA9IG5hbWU7XG4gICAgICAgICAgICBpZiAodW5pZm9ybU9iamVjdC5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHVuaWZvcm1PYmplY3QubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXRQYXJhbWV0ZXIodW5pZm9ybU9iamVjdFtpXSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIG5hbWUgPSB1bmlmb3JtT2JqZWN0Lm5hbWU7XG4gICAgICAgICAgICBkYXRhID0gdW5pZm9ybU9iamVjdC52YWx1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHBhcmFtID0gdGhpcy5wYXJhbWV0ZXJzW25hbWVdO1xuICAgICAgICBpZiAocGFyYW0pIHtcbiAgICAgICAgICAgIHBhcmFtLmRhdGEgPSBkYXRhO1xuICAgICAgICAgICAgcGFyYW0ucGFzc0ZsYWdzID0gcGFzc0ZsYWdzO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5wYXJhbWV0ZXJzW25hbWVdID0ge1xuICAgICAgICAgICAgICAgIHNjb3BlSWQ6IG51bGwsXG4gICAgICAgICAgICAgICAgZGF0YTogZGF0YSxcbiAgICAgICAgICAgICAgICBwYXNzRmxhZ3M6IHBhc3NGbGFnc1xuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIGEgd3JhcHBlciBvdmVyIHNldHRpbmdzIHBhcmFtZXRlciBzcGVjaWZpY2FsbHkgZm9yIHJlYWx0aW1lIGJha2VkIGxpZ2h0bWFwcy4gVGhpcyBoYW5kbGVzIHJlZmVyZW5jZSBjb3VudGluZyBvZiBsaWdodG1hcHNcbiAgICAvLyBhbmQgcmVsZWFzZXMgdGhlbSB3aGVuIG5vIGxvbmdlciByZWZlcmVuY2VkXG4gICAgc2V0UmVhbHRpbWVMaWdodG1hcChuYW1lLCB0ZXh0dXJlKSB7XG5cbiAgICAgICAgLy8gbm8gY2hhbmdlXG4gICAgICAgIGNvbnN0IG9sZCA9IHRoaXMuZ2V0UGFyYW1ldGVyKG5hbWUpO1xuICAgICAgICBpZiAob2xkID09PSB0ZXh0dXJlKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIC8vIHJlbW92ZSBvbGRcbiAgICAgICAgaWYgKG9sZCkge1xuICAgICAgICAgICAgTGlnaHRtYXBDYWNoZS5kZWNSZWYob2xkLmRhdGEpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gYXNzaWduIG5ld1xuICAgICAgICBpZiAodGV4dHVyZSkge1xuICAgICAgICAgICAgTGlnaHRtYXBDYWNoZS5pbmNSZWYodGV4dHVyZSk7XG4gICAgICAgICAgICB0aGlzLnNldFBhcmFtZXRlcihuYW1lLCB0ZXh0dXJlKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuZGVsZXRlUGFyYW1ldGVyKG5hbWUpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgIC8qKlxuICAgICAgKiBEZWxldGVzIGEgc2hhZGVyIHBhcmFtZXRlciBvbiBhIG1lc2ggaW5zdGFuY2UuXG4gICAgICAqXG4gICAgICAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lIC0gVGhlIG5hbWUgb2YgdGhlIHBhcmFtZXRlciB0byBkZWxldGUuXG4gICAgICAqL1xuICAgIGRlbGV0ZVBhcmFtZXRlcihuYW1lKSB7XG4gICAgICAgIGlmICh0aGlzLnBhcmFtZXRlcnNbbmFtZV0pIHtcbiAgICAgICAgICAgIGRlbGV0ZSB0aGlzLnBhcmFtZXRlcnNbbmFtZV07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyB1c2VkIHRvIGFwcGx5IHBhcmFtZXRlcnMgZnJvbSB0aGlzIG1lc2ggaW5zdGFuY2UgaW50byBzY29wZSBvZiB1bmlmb3JtcywgY2FsbGVkIGludGVybmFsbHkgYnkgZm9yd2FyZC1yZW5kZXJlclxuICAgIHNldFBhcmFtZXRlcnMoZGV2aWNlLCBwYXNzRmxhZykge1xuICAgICAgICBjb25zdCBwYXJhbWV0ZXJzID0gdGhpcy5wYXJhbWV0ZXJzO1xuICAgICAgICBmb3IgKGNvbnN0IHBhcmFtTmFtZSBpbiBwYXJhbWV0ZXJzKSB7XG4gICAgICAgICAgICBjb25zdCBwYXJhbWV0ZXIgPSBwYXJhbWV0ZXJzW3BhcmFtTmFtZV07XG4gICAgICAgICAgICBpZiAocGFyYW1ldGVyLnBhc3NGbGFncyAmIHBhc3NGbGFnKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFwYXJhbWV0ZXIuc2NvcGVJZCkge1xuICAgICAgICAgICAgICAgICAgICBwYXJhbWV0ZXIuc2NvcGVJZCA9IGRldmljZS5zY29wZS5yZXNvbHZlKHBhcmFtTmFtZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHBhcmFtZXRlci5zY29wZUlkLnNldFZhbHVlKHBhcmFtZXRlci5kYXRhKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHNldExpZ2h0bWFwcGVkKHZhbHVlKSB7XG4gICAgICAgIGlmICh2YWx1ZSkge1xuICAgICAgICAgICAgdGhpcy5tYXNrID0gKHRoaXMubWFzayB8IE1BU0tfQUZGRUNUX0xJR0hUTUFQUEVEKSAmIH4oTUFTS19BRkZFQ1RfRFlOQU1JQyB8IE1BU0tfQkFLRSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLnNldFJlYWx0aW1lTGlnaHRtYXAoTWVzaEluc3RhbmNlLmxpZ2h0bWFwUGFyYW1OYW1lc1swXSwgbnVsbCk7XG4gICAgICAgICAgICB0aGlzLnNldFJlYWx0aW1lTGlnaHRtYXAoTWVzaEluc3RhbmNlLmxpZ2h0bWFwUGFyYW1OYW1lc1sxXSwgbnVsbCk7XG4gICAgICAgICAgICB0aGlzLl9zaGFkZXJEZWZzICY9IH4oU0hBREVSREVGX0xNIHwgU0hBREVSREVGX0RJUkxNIHwgU0hBREVSREVGX0xNQU1CSUVOVCk7XG4gICAgICAgICAgICB0aGlzLm1hc2sgPSAodGhpcy5tYXNrIHwgTUFTS19BRkZFQ1RfRFlOQU1JQykgJiB+KE1BU0tfQUZGRUNUX0xJR0hUTUFQUEVEIHwgTUFTS19CQUtFKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHNldEN1c3RvbUFhYmIoYWFiYikge1xuXG4gICAgICAgIGlmIChhYWJiKSB7XG4gICAgICAgICAgICAvLyBzdG9yZSB0aGUgb3ZlcnJpZGUgYWFiYlxuICAgICAgICAgICAgaWYgKHRoaXMuX2N1c3RvbUFhYmIpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9jdXN0b21BYWJiLmNvcHkoYWFiYik7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMuX2N1c3RvbUFhYmIgPSBhYWJiLmNsb25lKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBubyBvdmVycmlkZSwgZm9yY2UgcmVmcmVzaCB0aGUgYWN0dWFsIG9uZVxuICAgICAgICAgICAgdGhpcy5fY3VzdG9tQWFiYiA9IG51bGw7XG4gICAgICAgICAgICB0aGlzLl9hYWJiVmVyID0gLTE7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl9zZXR1cFNraW5VcGRhdGUoKTtcbiAgICB9XG5cbiAgICBfc2V0dXBTa2luVXBkYXRlKCkge1xuXG4gICAgICAgIC8vIHNldCBpZiBib25lcyBuZWVkIHRvIGJlIHVwZGF0ZWQgYmVmb3JlIGN1bGxpbmdcbiAgICAgICAgaWYgKHRoaXMuX3NraW5JbnN0YW5jZSkge1xuICAgICAgICAgICAgdGhpcy5fc2tpbkluc3RhbmNlLl91cGRhdGVCZWZvcmVDdWxsID0gIXRoaXMuX2N1c3RvbUFhYmI7XG4gICAgICAgIH1cbiAgICB9XG59XG5cbmV4cG9ydCB7IE1lc2hJbnN0YW5jZSB9O1xuIl0sIm5hbWVzIjpbImlkIiwiX3RtcEFhYmIiLCJCb3VuZGluZ0JveCIsIl90ZW1wQm9uZUFhYmIiLCJfdGVtcFNwaGVyZSIsIkJvdW5kaW5nU3BoZXJlIiwiX21lc2hTZXQiLCJTZXQiLCJJbnN0YW5jaW5nRGF0YSIsImNvbnN0cnVjdG9yIiwibnVtT2JqZWN0cyIsInZlcnRleEJ1ZmZlciIsImNvdW50IiwiU2hhZGVySW5zdGFuY2UiLCJzaGFkZXIiLCJiaW5kR3JvdXAiLCJnZXRCaW5kR3JvdXAiLCJkZXZpY2UiLCJEZWJ1ZyIsImFzc2VydCIsInViRm9ybWF0IiwibWVzaFVuaWZvcm1CdWZmZXJGb3JtYXQiLCJ1bmlmb3JtQnVmZmVyIiwiVW5pZm9ybUJ1ZmZlciIsImJpbmRHcm91cEZvcm1hdCIsIm1lc2hCaW5kR3JvdXBGb3JtYXQiLCJCaW5kR3JvdXAiLCJEZWJ1Z0hlbHBlciIsInNldE5hbWUiLCJkZXN0cm95IiwiZ3JvdXAiLCJfZ3JvdXAkZGVmYXVsdFVuaWZvcm0iLCJkZWZhdWx0VW5pZm9ybUJ1ZmZlciIsIlNoYWRlckNhY2hlRW50cnkiLCJzaGFkZXJJbnN0YW5jZXMiLCJNYXAiLCJmb3JFYWNoIiwiaW5zdGFuY2UiLCJjbGVhciIsIk1lc2hJbnN0YW5jZSIsIm1lc2giLCJtYXRlcmlhbCIsIm5vZGUiLCJ2aXNpYmxlIiwiY2FzdFNoYWRvdyIsInRyYW5zcGFyZW50IiwiX21hdGVyaWFsIiwiX3NoYWRlckNhY2hlIiwicGljayIsIkdyYXBoTm9kZSIsInRlbXAiLCJfa2V5IiwiX21lc2giLCJpbmNSZWZDb3VudCIsIl9zaGFkZXJEZWZzIiwiTUFTS19BRkZFQ1RfRFlOQU1JQyIsImZvcm1hdCIsImhhc1V2MCIsIlNIQURFUkRFRl9VVjAiLCJoYXNVdjEiLCJTSEFERVJERUZfVVYxIiwiaGFzQ29sb3IiLCJTSEFERVJERUZfVkNPTE9SIiwiaGFzVGFuZ2VudHMiLCJTSEFERVJERUZfVEFOR0VOVFMiLCJsYXllciIsIkxBWUVSX1dPUkxEIiwiX3JlbmRlclN0eWxlIiwiUkVOREVSU1RZTEVfU09MSUQiLCJfcmVjZWl2ZVNoYWRvdyIsIl9zY3JlZW5TcGFjZSIsIl9ub0RlcHRoRHJhd0dsMSIsImN1bGwiLCJfdXBkYXRlQWFiYiIsIl91cGRhdGVBYWJiRnVuYyIsIl9jYWxjdWxhdGVTb3J0RGlzdGFuY2UiLCJ1cGRhdGVLZXkiLCJfc2tpbkluc3RhbmNlIiwiX21vcnBoSW5zdGFuY2UiLCJpbnN0YW5jaW5nRGF0YSIsIl9jdXN0b21BYWJiIiwiYWFiYiIsIl9hYWJiVmVyIiwiZHJhd09yZGVyIiwidmlzaWJsZVRoaXNGcmFtZSIsImlzVmlzaWJsZUZ1bmMiLCJwYXJhbWV0ZXJzIiwic3RlbmNpbEZyb250Iiwic3RlbmNpbEJhY2siLCJmbGlwRmFjZXNGYWN0b3IiLCJyZW5kZXJTdHlsZSIsInByZXBhcmVSZW5kZXJTdGF0ZSIsImRlY1JlZkNvdW50IiwiX2FhYmIiLCJsb2NhbEFhYmIiLCJ0b1dvcmxkU3BhY2UiLCJza2luSW5zdGFuY2UiLCJib25lQWFiYiIsIm1vcnBoVGFyZ2V0cyIsIm1vcnBoIiwiX3RhcmdldHMiLCJfaW5pdEJvbmVBYWJicyIsImJvbmVVc2VkIiwiZmlyc3QiLCJpIiwibGVuZ3RoIiwic2V0RnJvbVRyYW5zZm9ybWVkQWFiYiIsIm1hdHJpY2VzIiwiY2VudGVyIiwiY29weSIsImhhbGZFeHRlbnRzIiwiYWRkIiwic2V0IiwibW9ycGhBYWJiIiwiX2V4cGFuZCIsImdldE1pbiIsImdldE1heCIsImdldFdvcmxkVHJhbnNmb3JtIiwiY2xlYXJTaGFkZXJzIiwic2hhZGVyQ2FjaGUiLCJfc2hhZGVyQ2FjaGUkaSIsImdldFNoYWRlckluc3RhbmNlIiwic2hhZGVyUGFzcyIsImxpZ2h0SGFzaCIsInNjZW5lIiwidmlld1VuaWZvcm1Gb3JtYXQiLCJ2aWV3QmluZEdyb3VwRm9ybWF0Iiwic29ydGVkTGlnaHRzIiwic2hhZGVySW5zdGFuY2UiLCJwYXNzRW50cnkiLCJnZXQiLCJtYXQiLCJzaGFkZXJEZWZzIiwidmFyaWFudEtleSIsInZhcmlhbnRzIiwiZ2V0U2hhZGVyVmFyaWFudCIsInByZXZNYXQiLCJyZW1vdmVNZXNoSW5zdGFuY2VSZWYiLCJhZGRNZXNoSW5zdGFuY2VSZWYiLCJfbGF5ZXIiLCJfdXBkYXRlU2hhZGVyRGVmcyIsImNhbGN1bGF0ZVNvcnREaXN0YW5jZSIsInJlY2VpdmVTaGFkb3ciLCJ2YWwiLCJTSEFERVJERUZfTk9TSEFET1ciLCJTSEFERVJERUZfU0tJTiIsIl9zZXR1cFNraW5VcGRhdGUiLCJtb3JwaEluc3RhbmNlIiwiX3RoaXMkX21vcnBoSW5zdGFuY2UiLCJ1c2VUZXh0dXJlTW9ycGgiLCJTSEFERVJERUZfTU9SUEhfVEVYVFVSRV9CQVNFRCIsIm1vcnBoUG9zaXRpb25zIiwiU0hBREVSREVGX01PUlBIX1BPU0lUSU9OIiwibW9ycGhOb3JtYWxzIiwiU0hBREVSREVGX01PUlBIX05PUk1BTCIsInNjcmVlblNwYWNlIiwiU0hBREVSREVGX1NDUkVFTlNQQUNFIiwia2V5IiwiU09SVEtFWV9GT1JXQVJEIiwibWFzayIsInRvZ2dsZXMiLCJpbnN0YW5jaW5nQ291bnQiLCJ2YWx1ZSIsIl90aGlzJF9za2luSW5zdGFuY2UiLCJfdGhpcyRtb3JwaEluc3RhbmNlIiwicmVmQ291bnQiLCJzZXRSZWFsdGltZUxpZ2h0bWFwIiwibGlnaHRtYXBQYXJhbU5hbWVzIiwiX3ByZXBhcmVSZW5kZXJTdHlsZUZvckFycmF5IiwibWVzaEluc3RhbmNlcyIsImhhcyIsIl9pc1Zpc2libGUiLCJjYW1lcmEiLCJyYWRpdXMiLCJmcnVzdHVtIiwiY29udGFpbnNTcGhlcmUiLCJibGVuZFR5cGUiLCJhbHBoYVRvQ292ZXJhZ2UiLCJhbHBoYVRlc3QiLCJCTEVORF9OT1JNQUwiLCJCTEVORF9OT05FIiwic2V0SW5zdGFuY2luZyIsIm51bVZlcnRpY2VzIiwiaW5zdGFuY2luZyIsIlNIQURFUkRFRl9JTlNUQU5DSU5HIiwiZW5zdXJlTWF0ZXJpYWwiLCJ3YXJuIiwibmFtZSIsImdldERlZmF1bHRNYXRlcmlhbCIsImNsZWFyUGFyYW1ldGVycyIsImdldFBhcmFtZXRlcnMiLCJnZXRQYXJhbWV0ZXIiLCJzZXRQYXJhbWV0ZXIiLCJkYXRhIiwicGFzc0ZsYWdzIiwidW5kZWZpbmVkIiwidW5pZm9ybU9iamVjdCIsInBhcmFtIiwic2NvcGVJZCIsInRleHR1cmUiLCJvbGQiLCJMaWdodG1hcENhY2hlIiwiZGVjUmVmIiwiaW5jUmVmIiwiZGVsZXRlUGFyYW1ldGVyIiwic2V0UGFyYW1ldGVycyIsInBhc3NGbGFnIiwicGFyYW1OYW1lIiwicGFyYW1ldGVyIiwic2NvcGUiLCJyZXNvbHZlIiwic2V0VmFsdWUiLCJzZXRMaWdodG1hcHBlZCIsIk1BU0tfQUZGRUNUX0xJR0hUTUFQUEVEIiwiTUFTS19CQUtFIiwiU0hBREVSREVGX0xNIiwiU0hBREVSREVGX0RJUkxNIiwiU0hBREVSREVGX0xNQU1CSUVOVCIsInNldEN1c3RvbUFhYmIiLCJjbG9uZSIsIl91cGRhdGVCZWZvcmVDdWxsIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7O0FBdUJBLElBQUlBLEVBQUUsR0FBRyxDQUFDLENBQUE7QUFDVixNQUFNQyxRQUFRLEdBQUcsSUFBSUMsV0FBVyxFQUFFLENBQUE7QUFDbEMsTUFBTUMsYUFBYSxHQUFHLElBQUlELFdBQVcsRUFBRSxDQUFBO0FBQ3ZDLE1BQU1FLFdBQVcsR0FBRyxJQUFJQyxjQUFjLEVBQUUsQ0FBQTtBQUN4QyxNQUFNQyxRQUFRLEdBQUcsSUFBSUMsR0FBRyxFQUFFLENBQUE7O0FBRTFCO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxNQUFNQyxjQUFjLENBQUM7QUFJakI7QUFDSjtBQUNBO0VBQ0lDLFdBQVdBLENBQUNDLFVBQVUsRUFBRTtBQU54QjtJQUFBLElBQ0FDLENBQUFBLFlBQVksR0FBRyxJQUFJLENBQUE7SUFNZixJQUFJLENBQUNDLEtBQUssR0FBR0YsVUFBVSxDQUFBO0FBQzNCLEdBQUE7QUFDSixDQUFBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxNQUFNRyxjQUFjLENBQUM7RUFBQUosV0FBQSxHQUFBO0FBQ2pCO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFKSSxJQUFBLElBQUEsQ0FLQUssTUFBTSxHQUFBLEtBQUEsQ0FBQSxDQUFBO0FBRU47QUFDSjtBQUNBO0FBQ0E7QUFDQTtJQUpJLElBS0FDLENBQUFBLFNBQVMsR0FBRyxJQUFJLENBQUE7QUFBQSxHQUFBO0FBRWhCO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0VBQ0lDLFlBQVlBLENBQUNDLE1BQU0sRUFBRTtBQUVqQjtB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
