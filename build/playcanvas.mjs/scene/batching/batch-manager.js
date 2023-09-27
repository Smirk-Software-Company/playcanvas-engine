import { Debug } from '../../core/debug.js';
import { now } from '../../core/time.js';
import { Mat3 } from '../../core/math/mat3.js';
import { Vec3 } from '../../core/math/vec3.js';
import { BoundingBox } from '../../core/shape/bounding-box.js';
import { PRIMITIVE_TRIFAN, PRIMITIVE_TRISTRIP, SEMANTIC_BLENDINDICES, TYPE_FLOAT32, typedArrayTypes, typedArrayTypesByteSize, SEMANTIC_POSITION, SEMANTIC_NORMAL, SEMANTIC_TANGENT, typedArrayIndexFormats, PRIMITIVE_TRIANGLES } from '../../platform/graphics/constants.js';
import { SPRITE_RENDERMODE_SIMPLE } from '../constants.js';
import { Mesh } from '../mesh.js';
import { MeshInstance } from '../mesh-instance.js';
import { shaderChunks } from '../shader-lib/chunks/chunks.js';
import { Batch } from './batch.js';
import { BatchGroup } from './batch-group.js';
import { SkinBatchInstance } from './skin-batch-instance.js';

function paramsIdentical(a, b) {
  if (a && !b) return false;
  if (!a && b) return false;
  a = a.data;
  b = b.data;
  if (a === b) return true;
  if (a instanceof Float32Array && b instanceof Float32Array) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }
  return false;
}
function equalParamSets(params1, params2) {
  for (const param in params1) {
    // compare A -> B
    if (params1.hasOwnProperty(param) && !paramsIdentical(params1[param], params2[param])) return false;
  }
  for (const param in params2) {
    // compare B -> A
    if (params2.hasOwnProperty(param) && !paramsIdentical(params2[param], params1[param])) return false;
  }
  return true;
}
const _triFanIndices = [0, 1, 3, 2, 3, 1];
const _triStripIndices = [0, 1, 3, 0, 3, 2];
const mat3 = new Mat3();
function getScaleSign(mi) {
  return mi.node.worldTransform.scaleSign;
}

/**
 * Glues many mesh instances into a single one for better performance.
 *
 * @category Graphics
 */
class BatchManager {
  /**
   * Create a new BatchManager instance.
   *
   * @param {import('../../platform/graphics/graphics-device.js').GraphicsDevice} device - The
   * graphics device used by the batch manager.
   * @param {import('../../framework/entity.js').Entity} root - The entity under which batched
   * models are added.
   * @param {import('../scene.js').Scene} scene - The scene that the batch manager affects.
   */
  constructor(device, root, scene) {
    this.device = device;
    this.rootNode = root;
    this.scene = scene;
    this._init = false;
    this._batchGroups = {};
    this._batchGroupCounter = 0;
    this._batchList = [];
    this._dirtyGroups = [];
    this._stats = {
      createTime: 0,
      updateLastFrameTime: 0
    };
  }
  destroy() {
    this.device = null;
    this.rootNode = null;
    this.scene = null;
    this._batchGroups = {};
    this._batchList = [];
    this._dirtyGroups = [];
  }

  /**
   * Adds new global batch group.
   *
   * @param {string} name - Custom name.
   * @param {boolean} dynamic - Is this batch group dynamic? Will these objects move/rotate/scale
   * after being batched?
   * @param {number} maxAabbSize - Maximum size of any dimension of a bounding box around batched
   * objects.
   * {@link BatchManager#prepare} will split objects into local groups based on this size.
   * @param {number} [id] - Optional custom unique id for the group (will be generated
   * automatically otherwise).
   * @param {number[]} [layers] - Optional layer ID array. Default is [{@link LAYERID_WORLD}].
   * The whole batch group will belong to these layers. Layers of source models will be ignored.
   * @returns {BatchGroup} Group object.
   */
  addGroup(name, dynamic, maxAabbSize, id, layers) {
    if (id === undefined) {
      id = this._batchGroupCounter;
      this._batchGroupCounter++;
    }
    if (this._batchGroups[id]) {
      Debug.error(`Batch group with id ${id} already exists.`);
      return undefined;
    }
    const group = new BatchGroup(id, name, dynamic, maxAabbSize, layers);
    this._batchGroups[id] = group;
    return group;
  }

  /**
   * Remove global batch group by id. Note, this traverses the entire scene graph and clears the
   * batch group id from all components.
   *
   * @param {number} id - Batch Group ID.
   */
  removeGroup(id) {
    if (!this._batchGroups[id]) {
      Debug.error(`Batch group with id ${id} doesn't exist.`);
      return;
    }

    // delete batches with matching id
    const newBatchList = [];
    for (let i = 0; i < this._batchList.length; i++) {
      if (this._batchList[i].batchGroupId === id) {
        this.destroyBatch(this._batchList[i]);
      } else {
        newBatchList.push(this._batchList[i]);
      }
    }
    this._batchList = newBatchList;
    this._removeModelsFromBatchGroup(this.rootNode, id);
    delete this._batchGroups[id];
  }

  /**
   * Mark a specific batch group as dirty. Dirty groups are re-batched before the next frame is
   * rendered. Note, re-batching a group is a potentially expensive operation.
   *
   * @param {number} id - Batch Group ID to mark as dirty.
   */
  markGroupDirty(id) {
    if (this._dirtyGroups.indexOf(id) < 0) {
      this._dirtyGroups.push(id);
    }
  }

  /**
   * Retrieves a {@link BatchGroup} object with a corresponding name, if it exists, or null
   * otherwise.
   *
   * @param {string} name - Name.
   * @returns {BatchGroup|null} The batch group matching the name or null if not found.
   */
  getGroupByName(name) {
    const groups = this._batchGroups;
    for (const group in groups) {
      if (!groups.hasOwnProperty(group)) continue;
      if (groups[group].name === name) {
        return groups[group];
      }
    }
    return null;
  }

  /**
   * Return a list of all {@link Batch} objects that belong to the Batch Group supplied.
   *
   * @param {number} batchGroupId - The id of the batch group.
   * @returns {Batch[]} A list of batches that are used to render the batch group.
   * @private
   */
  getBatches(batchGroupId) {
    const results = [];
    const len = this._batchList.length;
    for (let i = 0; i < len; i++) {
      const batch = this._batchList[i];
      if (batch.batchGroupId === batchGroupId) {
        results.push(batch);
      }
    }
    return results;
  }

  // traverse full hierarchy and clear the batch group id from all model, element and sprite components
  _removeModelsFromBatchGroup(node, id) {
    if (!node.enabled) return;
    if (node.model && node.model.batchGroupId === id) {
      node.model.batchGroupId = -1;
    }
    if (node.render && node.render.batchGroupId === id) {
      node.render.batchGroupId = -1;
    }
    if (node.element && node.element.batchGroupId === id) {
      node.element.batchGroupId = -1;
    }
    if (node.sprite && node.sprite.batchGroupId === id) {
      node.sprite.batchGroupId = -1;
    }
    for (let i = 0; i < node._children.length; i++) {
      this._removeModelsFromBatchGroup(node._children[i], id);
    }
  }
  insert(type, groupId, node) {
    const group = this._batchGroups[groupId];
    Debug.assert(group, `Invalid batch ${groupId} insertion`);
    if (group) {
      if (group._obj[type].indexOf(node) < 0) {
        group._obj[type].push(node);
        this.markGroupDirty(groupId);
      }
    }
  }
  remove(type, groupId, node) {
    const group = this._batchGroups[groupId];
    Debug.assert(group, `Invalid batch ${groupId} insertion`);
    if (group) {
      const idx = group._obj[type].indexOf(node);
      if (idx >= 0) {
        group._obj[type].splice(idx, 1);
        this.markGroupDirty(groupId);
      }
    }
  }
  _extractRender(node, arr, group, groupMeshInstances) {
    if (node.render) {
      arr = groupMeshInstances[node.render.batchGroupId] = arr.concat(node.render.meshInstances);
      node.render.removeFromLayers();
    }
    return arr;
  }
  _extractModel(node, arr, group, groupMeshInstances) {
    if (node.model && node.model.model) {
      arr = groupMeshInstances[node.model.batchGroupId] = arr.concat(node.model.meshInstances);
      node.model.removeModelFromLayers();
      node.model._batchGroup = group;
    }
    return arr;
  }
  _extractElement(node, arr, group) {
    if (!node.element) return;
    let valid = false;
    if (node.element._text && node.element._text._model.meshInstances.length > 0) {
      arr.push(node.element._text._model.meshInstances[0]);
      node.element.removeModelFromLayers(node.element._text._model);
      valid = true;
    } else if (node.element._image) {
      arr.push(node.element._image._renderable.meshInstance);
      node.element.removeModelFromLayers(node.element._image._renderable.model);
      if (node.element._image._renderable.unmaskMeshInstance) {
        arr.push(node.element._image._renderable.unmaskMeshInstance);
        if (!node.element._image._renderable.unmaskMeshInstance.stencilFront || !node.element._image._renderable.unmaskMeshInstance.stencilBack) {
          node.element._dirtifyMask();
          node.element._onPrerender();
        }
      }
      valid = true;
    }
    if (valid) {
      group._ui = true;
      node.element._batchGroup = group;
    }
  }

  // traverse scene hierarchy down from `node` and collect all components that are marked
  // with a batch group id. Remove from layers any models that these components contains.
  // Fill the `groupMeshInstances` with all the mesh instances to be included in the batch groups,
  // indexed by batch group id.
  _collectAndRemoveMeshInstances(groupMeshInstances, groupIds) {
    for (let g = 0; g < groupIds.length; g++) {
      const id = groupIds[g];
      const group = this._batchGroups[id];
      if (!group) continue;
      let arr = groupMeshInstances[id];
      if (!arr) arr = groupMeshInstances[id] = [];
      for (let m = 0; m < group._obj.model.length; m++) {
        arr = this._extractModel(group._obj.model[m], arr, group, groupMeshInstances);
      }
      for (let r = 0; r < group._obj.render.length; r++) {
        arr = this._extractRender(group._obj.render[r], arr, group, groupMeshInstances);
      }
      for (let e = 0; e < group._obj.element.length; e++) {
        this._extractElement(group._obj.element[e], arr, group);
      }
      for (let s = 0; s < group._obj.sprite.length; s++) {
        const node = group._obj.sprite[s];
        if (node.sprite && node.sprite._meshInstance && (group.dynamic || node.sprite.sprite._renderMode === SPRITE_RENDERMODE_SIMPLE)) {
          arr.push(node.sprite._meshInstance);
          node.sprite.removeModelFromLayers();
          group._sprite = true;
          node.sprite._batchGroup = group;
        }
      }
    }
  }

  /**
   * Destroys all batches and creates new based on scene models. Hides original models. Called by
   * engine automatically on app start, and if batchGroupIds on models are changed.
   *
   * @param {number[]} [groupIds] - Optional array of batch group IDs to update. Otherwise all
   * groups are updated.
   */
  generate(groupIds) {
    const groupMeshInstances = {};
    if (!groupIds) {
      // Full scene
      groupIds = Object.keys(this._batchGroups);
    }

    // delete old batches with matching batchGroupId
    const newBatchList = [];
    for (let i = 0; i < this._batchList.length; i++) {
      if (groupIds.indexOf(this._batchList[i].batchGroupId) < 0) {
        newBatchList.push(this._batchList[i]);
        continue;
      }
      this.destroyBatch(this._batchList[i]);
    }
    this._batchList = newBatchList;

    // collect
    this._collectAndRemoveMeshInstances(groupMeshInstances, groupIds);
    if (groupIds === this._dirtyGroups) {
      this._dirtyGroups.length = 0;
    } else {
      const newDirtyGroups = [];
      for (let i = 0; i < this._dirtyGroups.length; i++) {
        if (groupIds.indexOf(this._dirtyGroups[i]) < 0) newDirtyGroups.push(this._dirtyGroups[i]);
      }
      this._dirtyGroups = newDirtyGroups;
    }
    let group, lists, groupData, batch;
    for (const groupId in groupMeshInstances) {
      if (!groupMeshInstances.hasOwnProperty(groupId)) continue;
      group = groupMeshInstances[groupId];
      groupData = this._batchGroups[groupId];
      if (!groupData) {
        Debug.error(`batch group ${groupId} not found`);
        continue;
      }
      lists = this.prepare(group, groupData.dynamic, groupData.maxAabbSize, groupData._ui || groupData._sprite);
      for (let i = 0; i < lists.length; i++) {
        batch = this.create(lists[i], groupData.dynamic, parseInt(groupId, 10));
        if (batch) {
          batch.addToLayers(this.scene, groupData.layers);
        }
      }
    }
  }

  /**
   * Takes a list of mesh instances to be batched and sorts them into lists one for each draw
   * call. The input list will be split, if:
   *
   * - Mesh instances use different materials.
   * - Mesh instances have different parameters (e.g. lightmaps or static lights).
   * - Mesh instances have different shader defines (shadow receiving, being aligned to screen
   * space, etc).
   * - Too many vertices for a single batch (65535 is maximum).
   * - Too many instances for a single batch (hardware-dependent, expect 128 on low-end and 1024
   * on high-end).
   * - Bounding box of a batch is larger than maxAabbSize in any dimension.
   *
   * @param {MeshInstance[]} meshInstances - Input list of mesh instances
   * @param {boolean} dynamic - Are we preparing for a dynamic batch? Instance count will matter
   * then (otherwise not).
   * @param {number} maxAabbSize - Maximum size of any dimension of a bounding box around batched
   * objects.
   * @param {boolean} translucent - Are we batching UI elements or sprites
   * This is useful to keep a balance between the number of draw calls and the number of drawn
   * triangles, because smaller batches can be hidden when not visible in camera.
   * @returns {MeshInstance[][]} An array of arrays of mesh instances, each valid to pass to
   * {@link BatchManager#create}.
   */
  prepare(meshInstances, dynamic, maxAabbSize = Number.POSITIVE_INFINITY, translucent) {
    if (meshInstances.length === 0) return [];
    const halfMaxAabbSize = maxAabbSize * 0.5;
    const maxInstanceCount = this.device.supportsBoneTextures ? 1024 : this.device.boneLimit;

    // maximum number of vertices that can be used in batch depends on 32bit index buffer support (do this for non-indexed as well,
    // as in some cases (UI elements) non-indexed geometry gets batched into indexed)
    const maxNumVertices = this.device.extUintElement ? 0xffffffff : 0xffff;
    const aabb = new BoundingBox();
    const testAabb = new BoundingBox();
    let skipTranslucentAabb = null;
    let sf;
    const lists = [];
    let j = 0;
    if (translucent) {
      meshInstances.sort(function (a, b) {
        return a.drawOrder - b.drawOrder;
      });
    }
    let meshInstancesLeftA = meshInstances;
    let meshInstancesLeftB;
    const skipMesh = translucent ? function (mi) {
      if (skipTranslucentAabb) {
        skipTranslucentAabb.add(mi.aabb);
      } else {
        skipTranslucentAabb = mi.aabb.clone();
      }
      meshInstancesLeftB.push(mi);
    } : function (mi) {
      meshInstancesLeftB.push(mi);
    };
    while (meshInstancesLeftA.length > 0) {
      lists[j] = [meshInstancesLeftA[0]];
      meshInstancesLeftB = [];
      const material = meshInstancesLeftA[0].material;
      const layer = meshInstancesLeftA[0].layer;
      const defs = meshInstancesLeftA[0]._shaderDefs;
      const params = meshInstancesLeftA[0].parameters;
      const stencil = meshInstancesLeftA[0].stencilFront;
      let vertCount = meshInstancesLeftA[0].mesh.vertexBuffer.getNumVertices();
      const drawOrder = meshInstancesLeftA[0].drawOrder;
      aabb.copy(meshInstancesLeftA[0].aabb);
      const scaleSign = getScaleSign(meshInstancesLeftA[0]);
      const vertexFormatBatchingHash = meshInstancesLeftA[0].mesh.vertexBuffer.format.batchingHash;
      const indexed = meshInstancesLeftA[0].mesh.primitive[0].indexed;
      skipTranslucentAabb = null;
      for (let i = 1; i < meshInstancesLeftA.length; i++) {
        const mi = meshInstancesLeftA[i];

        // Split by instance number
        if (dynamic && lists[j].length >= maxInstanceCount) {
          meshInstancesLeftB = meshInstancesLeftB.concat(meshInstancesLeftA.slice(i));
          break;
        }

        // Split by material, layer (legacy), vertex format & index compatibility, shader defines, static source, vert count, overlapping UI
        if (material !== mi.material || layer !== mi.layer || vertexFormatBatchingHash !== mi.mesh.vertexBuffer.format.batchingHash || indexed !== mi.mesh.primitive[0].indexed || defs !== mi._shaderDefs || vertCount + mi.mesh.vertexBuffer.getNumVertices() > maxNumVertices) {
          skipMesh(mi);
          continue;
        }
        // Split by AABB
        testAabb.copy(aabb);
        testAabb.add(mi.aabb);
        if (testAabb.halfExtents.x > halfMaxAabbSize || testAabb.halfExtents.y > halfMaxAabbSize || testAabb.halfExtents.z > halfMaxAabbSize) {
          skipMesh(mi);
          continue;
        }
        // Split stencil mask (UI elements), both front and back expected to be the same
        if (stencil) {
          if (!(sf = mi.stencilFront) || stencil.func !== sf.func || stencil.zpass !== sf.zpass) {
            skipMesh(mi);
            continue;
          }
        }
        // Split by negative scale
        if (scaleSign !== getScaleSign(mi)) {
          skipMesh(mi);
          continue;
        }

        // Split by parameters
        if (!equalParamSets(params, mi.parameters)) {
          skipMesh(mi);
          continue;
        }
        if (translucent && skipTranslucentAabb && skipTranslucentAabb.intersects(mi.aabb) && mi.drawOrder !== drawOrder) {
          skipMesh(mi);
          continue;
        }
        aabb.add(mi.aabb);
        vertCount += mi.mesh.vertexBuffer.getNumVertices();
        lists[j].push(mi);
      }
      j++;
      meshInstancesLeftA = meshInstancesLeftB;
    }
    return lists;
  }
  collectBatchedMeshData(meshInstances, dynamic) {
    let streams = null;
    let batchNumVerts = 0;
    let batchNumIndices = 0;
    let material = null;
    for (let i = 0; i < meshInstances.length; i++) {
      if (meshInstances[i].visible) {
        // vertex counts
        const mesh = meshInstances[i].mesh;
        const numVerts = mesh.vertexBuffer.numVertices;
        batchNumVerts += numVerts;

        // index count
        if (mesh.primitive[0].indexed) {
          batchNumIndices += mesh.primitive[0].count;
        } else {
          // special case of fan / strip non-indexed primitive used by UI
          const primitiveType = mesh.primitive[0].type;
          if (primitiveType === PRIMITIVE_TRIFAN || primitiveType === PRIMITIVE_TRISTRIP) {
            if (mesh.primitive[0].count === 4) batchNumIndices += 6;
          }
        }

        // if first mesh
        if (!streams) {
          // material
          material = meshInstances[i].material;

          // collect used vertex buffer semantic information from first mesh (they all match)
          streams = {};
          const elems = mesh.vertexBuffer.format.elements;
          for (let j = 0; j < elems.length; j++) {
            const semantic = elems[j].name;
            streams[semantic] = {
              numComponents: elems[j].numComponents,
              dataType: elems[j].dataType,
              normalize: elems[j].normalize,
              count: 0
            };
          }

          // for dynamic meshes we need bone indices
          if (dynamic) {
            streams[SEMANTIC_BLENDINDICES] = {
              numComponents: 1,
              dataType: TYPE_FLOAT32,
              normalize: false,
              count: 0
            };
          }
        }
      }
    }
    return {
      streams: streams,
      batchNumVerts: batchNumVerts,
      batchNumIndices: batchNumIndices,
      material: material
    };
  }

  /**
   * Takes a mesh instance list that has been prepared by {@link BatchManager#prepare}, and
   * returns a {@link Batch} object. This method assumes that all mesh instances provided can be
   * rendered in a single draw call.
   *
   * @param {MeshInstance[]} meshInstances - Input list of mesh instances.
   * @param {boolean} dynamic - Is it a static or dynamic batch? Will objects be transformed
   * after batching?
   * @param {number} [batchGroupId] - Link this batch to a specific batch group. This is done
   * automatically with default batches.
   * @returns {Batch} The resulting batch object.
   */
  create(meshInstances, dynamic, batchGroupId) {
    const time = now();
    if (!this._init) {
      const boneLimit = '#define BONE_LIMIT ' + this.device.getBoneLimit() + '\n';
      this.transformVS = boneLimit + '#define DYNAMICBATCH\n' + shaderChunks.transformVS;
      this.skinTexVS = shaderChunks.skinBatchTexVS;
      this.skinConstVS = shaderChunks.skinBatchConstVS;
      this.vertexFormats = {};
      this._init = true;
    }
    let stream = null;
    let semantic;
    let mesh, numVerts;
    let batch = null;

    // find out vertex streams and counts
    const batchData = this.collectBatchedMeshData(meshInstances, dynamic);

    // if anything to batch
    if (batchData.streams) {
      const streams = batchData.streams;
      let material = batchData.material;
      const batchNumVerts = batchData.batchNumVerts;
      const batchNumIndices = batchData.batchNumIndices;
      batch = new Batch(meshInstances, dynamic, batchGroupId);
      this._batchList.push(batch);
      let indexBase, numIndices, indexData;
      let verticesOffset = 0;
      let indexOffset = 0;
      let transform;
      const vec = new Vec3();

      // allocate indices
      const indexArrayType = batchNumVerts <= 0xffff ? Uint16Array : Uint32Array;
      const indices = new indexArrayType(batchNumIndices);

      // allocate typed arrays to store final vertex stream data
      for (semantic in streams) {
        stream = streams[semantic];
        stream.typeArrayType = typedArrayTypes[stream.dataType];
        stream.elementByteSize = typedArrayTypesByteSize[stream.dataType];
        stream.buffer = new stream.typeArrayType(batchNumVerts * stream.numComponents);
      }

      // build vertex and index data for final mesh
      for (let i = 0; i < meshInstances.length; i++) {
        if (!meshInstances[i].visible) continue;
        mesh = meshInstances[i].mesh;
        numVerts = mesh.vertexBuffer.numVertices;

        // matrix to transform vertices to world space for static batching
        if (!dynamic) {
          transform = meshInstances[i].node.getWorldTransform();
        }
        for (semantic in streams) {
          if (semantic !== SEMANTIC_BLENDINDICES) {
            stream = streams[semantic];

            // get vertex stream to typed view subarray
            const subarray = new stream.typeArrayType(stream.buffer.buffer, stream.elementByteSize * stream.count);
            const totalComponents = mesh.getVertexStream(semantic, subarray) * stream.numComponents;
            stream.count += totalComponents;

            // transform position, normal and tangent to world space
            if (!dynamic && stream.numComponents >= 3) {
              if (semantic === SEMANTIC_POSITION) {
                for (let j = 0; j < totalComponents; j += stream.numComponents) {
                  vec.set(subarray[j], subarray[j + 1], subarray[j + 2]);
                  transform.transformPoint(vec, vec);
                  subarray[j] = vec.x;
                  subarray[j + 1] = vec.y;
                  subarray[j + 2] = vec.z;
                }
              } else if (semantic === SEMANTIC_NORMAL || semantic === SEMANTIC_TANGENT) {
                // handle non-uniform scale by using transposed inverse matrix to transform vectors
                mat3.invertMat4(transform).transpose();
                for (let j = 0; j < totalComponents; j += stream.numComponents) {
                  vec.set(subarray[j], subarray[j + 1], subarray[j + 2]);
                  mat3.transformVector(vec, vec);
                  subarray[j] = vec.x;
                  subarray[j + 1] = vec.y;
                  subarray[j + 2] = vec.z;
                }
              }
            }
          }
        }

        // bone index is mesh index
        if (dynamic) {
          stream = streams[SEMANTIC_BLENDINDICES];
          for (let j = 0; j < numVerts; j++) stream.buffer[stream.count++] = i;
        }

        // index buffer
        if (mesh.primitive[0].indexed) {
          indexBase = mesh.primitive[0].base;
          numIndices = mesh.primitive[0].count;

          // source index buffer data mapped to its format
          const srcFormat = mesh.indexBuffer[0].getFormat();
          indexData = new typedArrayIndexFormats[srcFormat](mesh.indexBuffer[0].storage);
        } else {
          // non-indexed

          const primitiveType = mesh.primitive[0].type;
          if (primitiveType === PRIMITIVE_TRIFAN || primitiveType === PRIMITIVE_TRISTRIP) {
            if (mesh.primitive[0].count === 4) {
              indexBase = 0;
              numIndices = 6;
              indexData = primitiveType === PRIMITIVE_TRIFAN ? _triFanIndices : _triStripIndices;
            } else {
              numIndices = 0;
              continue;
            }
          }
        }
        for (let j = 0; j < numIndices; j++) {
          indices[j + indexOffset] = indexData[indexBase + j] + verticesOffset;
        }
        indexOffset += numIndices;
        verticesOffset += numVerts;
      }

      // Create mesh
      mesh = new Mesh(this.device);
      for (semantic in streams) {
        stream = streams[semantic];
        mesh.setVertexStream(semantic, stream.buffer, stream.numComponents, undefined, stream.dataType, stream.normalize);
      }
      if (indices.length > 0) mesh.setIndices(indices);
      mesh.update(PRIMITIVE_TRIANGLES, false);

      // Patch the material
      if (dynamic) {
        material = material.clone();
        material.chunks.transformVS = this.transformVS;
        material.chunks.skinTexVS = this.skinTexVS;
        material.chunks.skinConstVS = this.skinConstVS;
        material.update();
      }

      // Create meshInstance
      const meshInstance = new MeshInstance(mesh, material, this.rootNode);
      meshInstance.castShadow = batch.origMeshInstances[0].castShadow;
      meshInstance.parameters = batch.origMeshInstances[0].parameters;
      meshInstance.layer = batch.origMeshInstances[0].layer;
      meshInstance._shaderDefs = batch.origMeshInstances[0]._shaderDefs;

      // meshInstance culling - don't cull UI elements, as they use custom culling Component.isVisibleForCamera
      meshInstance.cull = batch.origMeshInstances[0].cull;
      const batchGroup = this._batchGroups[batchGroupId];
      if (batchGroup && batchGroup._ui) meshInstance.cull = false;
      if (dynamic) {
        // Create skinInstance
        const nodes = [];
        for (let i = 0; i < batch.origMeshInstances.length; i++) {
          nodes.push(batch.origMeshInstances[i].node);
        }
        meshInstance.skinInstance = new SkinBatchInstance(this.device, nodes, this.rootNode);
      }

      // disable aabb update, gets updated manually by batcher
      meshInstance._updateAabb = false;
      meshInstance.drawOrder = batch.origMeshInstances[0].drawOrder;
      meshInstance.stencilFront = batch.origMeshInstances[0].stencilFront;
      meshInstance.stencilBack = batch.origMeshInstances[0].stencilBack;
      meshInstance.flipFacesFactor = getScaleSign(batch.origMeshInstances[0]);
      meshInstance.castShadow = batch.origMeshInstances[0].castShadow;
      batch.meshInstance = meshInstance;
      batch.updateBoundingBox();
    }
    this._stats.createTime += now() - time;
    return batch;
  }

  /**
   * Updates bounding boxes for all dynamic batches. Called automatically.
   *
   * @ignore
   */
  updateAll() {
    // TODO: only call when needed. Applies to skinning matrices as well

    if (this._dirtyGroups.length > 0) {
      this.generate(this._dirtyGroups);
    }
    const time = now();
    for (let i = 0; i < this._batchList.length; i++) {
      if (!this._batchList[i].dynamic) continue;
      this._batchList[i].updateBoundingBox();
    }
    this._stats.updateLastFrameTime = now() - time;
  }

  /**
   * Clones a batch. This method doesn't rebuild batch geometry, but only creates a new model and
   * batch objects, linked to different source mesh instances.
   *
   * @param {Batch} batch - A batch object.
   * @param {MeshInstance[]} clonedMeshInstances - New mesh instances.
   * @returns {Batch} New batch object.
   */
  clone(batch, clonedMeshInstances) {
    const batch2 = new Batch(clonedMeshInstances, batch.dynamic, batch.batchGroupId);
    this._batchList.push(batch2);
    const nodes = [];
    for (let i = 0; i < clonedMeshInstances.length; i++) {
      nodes.push(clonedMeshInstances[i].node);
    }
    batch2.meshInstance = new MeshInstance(batch.meshInstance.mesh, batch.meshInstance.material, batch.meshInstance.node);
    batch2.meshInstance._updateAabb = false;
    batch2.meshInstance.parameters = clonedMeshInstances[0].parameters;
    batch2.meshInstance.cull = clonedMeshInstances[0].cull;
    batch2.meshInstance.layer = clonedMeshInstances[0].layer;
    if (batch.dynamic) {
      batch2.meshInstance.skinInstance = new SkinBatchInstance(this.device, nodes, this.rootNode);
    }
    batch2.meshInstance.castShadow = batch.meshInstance.castShadow;
    batch2.meshInstance._shader = batch.meshInstance._shader.slice();
    batch2.meshInstance.castShadow = batch.meshInstance.castShadow;
    return batch2;
  }

  /**
   * Removes the batch model from all layers and destroys it.
   *
   * @param {Batch} batch - A batch object.
   * @private
   */
  destroyBatch(batch) {
    batch.destroy(this.scene, this._batchGroups[batch.batchGroupId].layers);
  }
}

export { BatchManager };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmF0Y2gtbWFuYWdlci5qcyIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL3NjZW5lL2JhdGNoaW5nL2JhdGNoLW1hbmFnZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgRGVidWcgfSBmcm9tICcuLi8uLi9jb3JlL2RlYnVnLmpzJztcbmltcG9ydCB7IG5vdyB9IGZyb20gJy4uLy4uL2NvcmUvdGltZS5qcyc7XG5pbXBvcnQgeyBNYXQzIH0gZnJvbSAnLi4vLi4vY29yZS9tYXRoL21hdDMuanMnO1xuaW1wb3J0IHsgVmVjMyB9IGZyb20gJy4uLy4uL2NvcmUvbWF0aC92ZWMzLmpzJztcbmltcG9ydCB7IEJvdW5kaW5nQm94IH0gZnJvbSAnLi4vLi4vY29yZS9zaGFwZS9ib3VuZGluZy1ib3guanMnO1xuXG5pbXBvcnQge1xuICAgIFBSSU1JVElWRV9UUklBTkdMRVMsIFBSSU1JVElWRV9UUklGQU4sIFBSSU1JVElWRV9UUklTVFJJUCxcbiAgICBTRU1BTlRJQ19QT1NJVElPTiwgU0VNQU5USUNfTk9STUFMLCBTRU1BTlRJQ19UQU5HRU5ULCBTRU1BTlRJQ19CTEVORElORElDRVMsXG4gICAgVFlQRV9GTE9BVDMyLFxuICAgIHR5cGVkQXJyYXlJbmRleEZvcm1hdHMsIHR5cGVkQXJyYXlUeXBlcywgdHlwZWRBcnJheVR5cGVzQnl0ZVNpemVcbn0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vZ3JhcGhpY3MvY29uc3RhbnRzLmpzJztcblxuaW1wb3J0IHsgU1BSSVRFX1JFTkRFUk1PREVfU0lNUExFIH0gZnJvbSAnLi4vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IE1lc2ggfSBmcm9tICcuLi9tZXNoLmpzJztcbmltcG9ydCB7IE1lc2hJbnN0YW5jZSB9IGZyb20gJy4uL21lc2gtaW5zdGFuY2UuanMnO1xuaW1wb3J0IHsgc2hhZGVyQ2h1bmtzIH0gZnJvbSAnLi4vc2hhZGVyLWxpYi9jaHVua3MvY2h1bmtzLmpzJztcbmltcG9ydCB7IEJhdGNoIH0gZnJvbSAnLi9iYXRjaC5qcyc7XG5pbXBvcnQgeyBCYXRjaEdyb3VwIH0gZnJvbSAnLi9iYXRjaC1ncm91cC5qcyc7XG5pbXBvcnQgeyBTa2luQmF0Y2hJbnN0YW5jZSB9IGZyb20gJy4vc2tpbi1iYXRjaC1pbnN0YW5jZS5qcyc7XG5cbmZ1bmN0aW9uIHBhcmFtc0lkZW50aWNhbChhLCBiKSB7XG4gICAgaWYgKGEgJiYgIWIpIHJldHVybiBmYWxzZTtcbiAgICBpZiAoIWEgJiYgYikgcmV0dXJuIGZhbHNlO1xuICAgIGEgPSBhLmRhdGE7XG4gICAgYiA9IGIuZGF0YTtcbiAgICBpZiAoYSA9PT0gYikgcmV0dXJuIHRydWU7XG4gICAgaWYgKGEgaW5zdGFuY2VvZiBGbG9hdDMyQXJyYXkgJiYgYiBpbnN0YW5jZW9mIEZsb2F0MzJBcnJheSkge1xuICAgICAgICBpZiAoYS5sZW5ndGggIT09IGIubGVuZ3RoKSByZXR1cm4gZmFsc2U7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYS5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgaWYgKGFbaV0gIT09IGJbaV0pIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xufVxuXG5mdW5jdGlvbiBlcXVhbFBhcmFtU2V0cyhwYXJhbXMxLCBwYXJhbXMyKSB7XG4gICAgZm9yIChjb25zdCBwYXJhbSBpbiBwYXJhbXMxKSB7IC8vIGNvbXBhcmUgQSAtPiBCXG4gICAgICAgIGlmIChwYXJhbXMxLmhhc093blByb3BlcnR5KHBhcmFtKSAmJiAhcGFyYW1zSWRlbnRpY2FsKHBhcmFtczFbcGFyYW1dLCBwYXJhbXMyW3BhcmFtXSkpXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGZvciAoY29uc3QgcGFyYW0gaW4gcGFyYW1zMikgeyAvLyBjb21wYXJlIEIgLT4gQVxuICAgICAgICBpZiAocGFyYW1zMi5oYXNPd25Qcm9wZXJ0eShwYXJhbSkgJiYgIXBhcmFtc0lkZW50aWNhbChwYXJhbXMyW3BhcmFtXSwgcGFyYW1zMVtwYXJhbV0pKVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICByZXR1cm4gdHJ1ZTtcbn1cblxuY29uc3QgX3RyaUZhbkluZGljZXMgPSBbMCwgMSwgMywgMiwgMywgMV07XG5jb25zdCBfdHJpU3RyaXBJbmRpY2VzID0gWzAsIDEsIDMsIDAsIDMsIDJdO1xuXG5jb25zdCBtYXQzID0gbmV3IE1hdDMoKTtcblxuZnVuY3Rpb24gZ2V0U2NhbGVTaWduKG1pKSB7XG4gICAgcmV0dXJuIG1pLm5vZGUud29ybGRUcmFuc2Zvcm0uc2NhbGVTaWduO1xufVxuXG4vKipcbiAqIEdsdWVzIG1hbnkgbWVzaCBpbnN0YW5jZXMgaW50byBhIHNpbmdsZSBvbmUgZm9yIGJldHRlciBwZXJmb3JtYW5jZS5cbiAqXG4gKiBAY2F0ZWdvcnkgR3JhcGhpY3NcbiAqL1xuY2xhc3MgQmF0Y2hNYW5hZ2VyIHtcbiAgICAvKipcbiAgICAgKiBDcmVhdGUgYSBuZXcgQmF0Y2hNYW5hZ2VyIGluc3RhbmNlLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4uLy4uL3BsYXRmb3JtL2dyYXBoaWNzL2dyYXBoaWNzLWRldmljZS5qcycpLkdyYXBoaWNzRGV2aWNlfSBkZXZpY2UgLSBUaGVcbiAgICAgKiBncmFwaGljcyBkZXZpY2UgdXNlZCBieSB0aGUgYmF0Y2ggbWFuYWdlci5cbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi4vLi4vZnJhbWV3b3JrL2VudGl0eS5qcycpLkVudGl0eX0gcm9vdCAtIFRoZSBlbnRpdHkgdW5kZXIgd2hpY2ggYmF0Y2hlZFxuICAgICAqIG1vZGVscyBhcmUgYWRkZWQuXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4uL3NjZW5lLmpzJykuU2NlbmV9IHNjZW5lIC0gVGhlIHNjZW5lIHRoYXQgdGhlIGJhdGNoIG1hbmFnZXIgYWZmZWN0cy5cbiAgICAgKi9cbiAgICBjb25zdHJ1Y3RvcihkZXZpY2UsIHJvb3QsIHNjZW5lKSB7XG4gICAgICAgIHRoaXMuZGV2aWNlID0gZGV2aWNlO1xuICAgICAgICB0aGlzLnJvb3ROb2RlID0gcm9vdDtcbiAgICAgICAgdGhpcy5zY2VuZSA9IHNjZW5lO1xuICAgICAgICB0aGlzLl9pbml0ID0gZmFsc2U7XG5cbiAgICAgICAgdGhpcy5fYmF0Y2hHcm91cHMgPSB7fTtcbiAgICAgICAgdGhpcy5fYmF0Y2hHcm91cENvdW50ZXIgPSAwO1xuICAgICAgICB0aGlzLl9iYXRjaExpc3QgPSBbXTtcbiAgICAgICAgdGhpcy5fZGlydHlHcm91cHMgPSBbXTtcblxuICAgICAgICAvLyAjaWYgX1BST0ZJTEVSXG4gICAgICAgIHRoaXMuX3N0YXRzID0ge1xuICAgICAgICAgICAgY3JlYXRlVGltZTogMCxcbiAgICAgICAgICAgIHVwZGF0ZUxhc3RGcmFtZVRpbWU6IDBcbiAgICAgICAgfTtcbiAgICAgICAgLy8gI2VuZGlmXG4gICAgfVxuXG4gICAgZGVzdHJveSgpIHtcbiAgICAgICAgdGhpcy5kZXZpY2UgPSBudWxsO1xuICAgICAgICB0aGlzLnJvb3ROb2RlID0gbnVsbDtcbiAgICAgICAgdGhpcy5zY2VuZSA9IG51bGw7XG4gICAgICAgIHRoaXMuX2JhdGNoR3JvdXBzID0ge307XG4gICAgICAgIHRoaXMuX2JhdGNoTGlzdCA9IFtdO1xuICAgICAgICB0aGlzLl9kaXJ0eUdyb3VwcyA9IFtdO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEFkZHMgbmV3IGdsb2JhbCBiYXRjaCBncm91cC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lIC0gQ3VzdG9tIG5hbWUuXG4gICAgICogQHBhcmFtIHtib29sZWFufSBkeW5hbWljIC0gSXMgdGhpcyBiYXRjaCBncm91cCBkeW5hbWljPyBXaWxsIHRoZXNlIG9iamVjdHMgbW92ZS9yb3RhdGUvc2NhbGVcbiAgICAgKiBhZnRlciBiZWluZyBiYXRjaGVkP1xuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBtYXhBYWJiU2l6ZSAtIE1heGltdW0gc2l6ZSBvZiBhbnkgZGltZW5zaW9uIG9mIGEgYm91bmRpbmcgYm94IGFyb3VuZCBiYXRjaGVkXG4gICAgICogb2JqZWN0cy5cbiAgICAgKiB7QGxpbmsgQmF0Y2hNYW5hZ2VyI3ByZXBhcmV9IHdpbGwgc3BsaXQgb2JqZWN0cyBpbnRvIGxvY2FsIGdyb3VwcyBiYXNlZCBvbiB0aGlzIHNpemUuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFtpZF0gLSBPcHRpb25hbCBjdXN0b20gdW5pcXVlIGlkIGZvciB0aGUgZ3JvdXAgKHdpbGwgYmUgZ2VuZXJhdGVkXG4gICAgICogYXV0b21hdGljYWxseSBvdGhlcndpc2UpLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyW119IFtsYXllcnNdIC0gT3B0aW9uYWwgbGF5ZXIgSUQgYXJyYXkuIERlZmF1bHQgaXMgW3tAbGluayBMQVlFUklEX1dPUkxEfV0uXG4gICAgICogVGhlIHdob2xlIGJhdGNoIGdyb3VwIHdpbGwgYmVsb25nIHRvIHRoZXNlIGxheWVycy4gTGF5ZXJzIG9mIHNvdXJjZSBtb2RlbHMgd2lsbCBiZSBpZ25vcmVkLlxuICAgICAqIEByZXR1cm5zIHtCYXRjaEdyb3VwfSBHcm91cCBvYmplY3QuXG4gICAgICovXG4gICAgYWRkR3JvdXAobmFtZSwgZHluYW1pYywgbWF4QWFiYlNpemUsIGlkLCBsYXllcnMpIHtcbiAgICAgICAgaWYgKGlkID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGlkID0gdGhpcy5fYmF0Y2hHcm91cENvdW50ZXI7XG4gICAgICAgICAgICB0aGlzLl9iYXRjaEdyb3VwQ291bnRlcisrO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuX2JhdGNoR3JvdXBzW2lkXSkge1xuICAgICAgICAgICAgRGVidWcuZXJyb3IoYEJhdGNoIGdyb3VwIHdpdGggaWQgJHtpZH0gYWxyZWFkeSBleGlzdHMuYCk7XG4gICAgICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgZ3JvdXAgPSBuZXcgQmF0Y2hHcm91cChpZCwgbmFtZSwgZHluYW1pYywgbWF4QWFiYlNpemUsIGxheWVycyk7XG4gICAgICAgIHRoaXMuX2JhdGNoR3JvdXBzW2lkXSA9IGdyb3VwO1xuXG4gICAgICAgIHJldHVybiBncm91cDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZW1vdmUgZ2xvYmFsIGJhdGNoIGdyb3VwIGJ5IGlkLiBOb3RlLCB0aGlzIHRyYXZlcnNlcyB0aGUgZW50aXJlIHNjZW5lIGdyYXBoIGFuZCBjbGVhcnMgdGhlXG4gICAgICogYmF0Y2ggZ3JvdXAgaWQgZnJvbSBhbGwgY29tcG9uZW50cy5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBpZCAtIEJhdGNoIEdyb3VwIElELlxuICAgICAqL1xuICAgIHJlbW92ZUdyb3VwKGlkKSB7XG4gICAgICAgIGlmICghdGhpcy5fYmF0Y2hHcm91cHNbaWRdKSB7XG4gICAgICAgICAgICBEZWJ1Zy5lcnJvcihgQmF0Y2ggZ3JvdXAgd2l0aCBpZCAke2lkfSBkb2Vzbid0IGV4aXN0LmApO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gZGVsZXRlIGJhdGNoZXMgd2l0aCBtYXRjaGluZyBpZFxuICAgICAgICBjb25zdCBuZXdCYXRjaExpc3QgPSBbXTtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLl9iYXRjaExpc3QubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGlmICh0aGlzLl9iYXRjaExpc3RbaV0uYmF0Y2hHcm91cElkID09PSBpZCkge1xuICAgICAgICAgICAgICAgIHRoaXMuZGVzdHJveUJhdGNoKHRoaXMuX2JhdGNoTGlzdFtpXSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIG5ld0JhdGNoTGlzdC5wdXNoKHRoaXMuX2JhdGNoTGlzdFtpXSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5fYmF0Y2hMaXN0ID0gbmV3QmF0Y2hMaXN0O1xuICAgICAgICB0aGlzLl9yZW1vdmVNb2RlbHNGcm9tQmF0Y2hHcm91cCh0aGlzLnJvb3ROb2RlLCBpZCk7XG5cbiAgICAgICAgZGVsZXRlIHRoaXMuX2JhdGNoR3JvdXBzW2lkXTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNYXJrIGEgc3BlY2lmaWMgYmF0Y2ggZ3JvdXAgYXMgZGlydHkuIERpcnR5IGdyb3VwcyBhcmUgcmUtYmF0Y2hlZCBiZWZvcmUgdGhlIG5leHQgZnJhbWUgaXNcbiAgICAgKiByZW5kZXJlZC4gTm90ZSwgcmUtYmF0Y2hpbmcgYSBncm91cCBpcyBhIHBvdGVudGlhbGx5IGV4cGVuc2l2ZSBvcGVyYXRpb24uXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gaWQgLSBCYXRjaCBHcm91cCBJRCB0byBtYXJrIGFzIGRpcnR5LlxuICAgICAqL1xuICAgIG1hcmtHcm91cERpcnR5KGlkKSB7XG4gICAgICAgIGlmICh0aGlzLl9kaXJ0eUdyb3Vwcy5pbmRleE9mKGlkKSA8IDApIHtcbiAgICAgICAgICAgIHRoaXMuX2RpcnR5R3JvdXBzLnB1c2goaWQpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0cmlldmVzIGEge0BsaW5rIEJhdGNoR3JvdXB9IG9iamVjdCB3aXRoIGEgY29ycmVzcG9uZGluZyBuYW1lLCBpZiBpdCBleGlzdHMsIG9yIG51bGxcbiAgICAgKiBvdGhlcndpc2UuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gbmFtZSAtIE5hbWUuXG4gICAgICogQHJldHVybnMge0JhdGNoR3JvdXB8bnVsbH0gVGhlIGJhdGNoIGdyb3VwIG1hdGNoaW5nIHRoZSBuYW1lIG9yIG51bGwgaWYgbm90IGZvdW5kLlxuICAgICAqL1xuICAgIGdldEdyb3VwQnlOYW1lKG5hbWUpIHtcbiAgICAgICAgY29uc3QgZ3JvdXBzID0gdGhpcy5fYmF0Y2hHcm91cHM7XG4gICAgICAgIGZvciAoY29uc3QgZ3JvdXAgaW4gZ3JvdXBzKSB7XG4gICAgICAgICAgICBpZiAoIWdyb3Vwcy5oYXNPd25Qcm9wZXJ0eShncm91cCkpIGNvbnRpbnVlO1xuICAgICAgICAgICAgaWYgKGdyb3Vwc1tncm91cF0ubmFtZSA9PT0gbmFtZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBncm91cHNbZ3JvdXBdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybiBhIGxpc3Qgb2YgYWxsIHtAbGluayBCYXRjaH0gb2JqZWN0cyB0aGF0IGJlbG9uZyB0byB0aGUgQmF0Y2ggR3JvdXAgc3VwcGxpZWQuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gYmF0Y2hHcm91cElkIC0gVGhlIGlkIG9mIHRoZSBiYXRjaCBncm91cC5cbiAgICAgKiBAcmV0dXJucyB7QmF0Y2hbXX0gQSBsaXN0IG9mIGJhdGNoZXMgdGhhdCBhcmUgdXNlZCB0byByZW5kZXIgdGhlIGJhdGNoIGdyb3VwLlxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgZ2V0QmF0Y2hlcyhiYXRjaEdyb3VwSWQpIHtcbiAgICAgICAgY29uc3QgcmVzdWx0cyA9IFtdO1xuICAgICAgICBjb25zdCBsZW4gPSB0aGlzLl9iYXRjaExpc3QubGVuZ3RoO1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBiYXRjaCA9IHRoaXMuX2JhdGNoTGlzdFtpXTtcbiAgICAgICAgICAgIGlmIChiYXRjaC5iYXRjaEdyb3VwSWQgPT09IGJhdGNoR3JvdXBJZCkge1xuICAgICAgICAgICAgICAgIHJlc3VsdHMucHVzaChiYXRjaCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcmVzdWx0cztcbiAgICB9XG5cbiAgICAvLyB0cmF2ZXJzZSBmdWxsIGhpZXJhcmNoeSBhbmQgY2xlYXIgdGhlIGJhdGNoIGdyb3VwIGlkIGZyb20gYWxsIG1vZGVsLCBlbGVtZW50IGFuZCBzcHJpdGUgY29tcG9uZW50c1xuICAgIF9yZW1vdmVNb2RlbHNGcm9tQmF0Y2hHcm91cChub2RlLCBpZCkge1xuICAgICAgICBpZiAoIW5vZGUuZW5hYmxlZCkgcmV0dXJuO1xuXG4gICAgICAgIGlmIChub2RlLm1vZGVsICYmIG5vZGUubW9kZWwuYmF0Y2hHcm91cElkID09PSBpZCkge1xuICAgICAgICAgICAgbm9kZS5tb2RlbC5iYXRjaEdyb3VwSWQgPSAtMTtcbiAgICAgICAgfVxuICAgICAgICBpZiAobm9kZS5yZW5kZXIgJiYgbm9kZS5yZW5kZXIuYmF0Y2hHcm91cElkID09PSBpZCkge1xuICAgICAgICAgICAgbm9kZS5yZW5kZXIuYmF0Y2hHcm91cElkID0gLTE7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKG5vZGUuZWxlbWVudCAmJiBub2RlLmVsZW1lbnQuYmF0Y2hHcm91cElkID09PSBpZCkge1xuICAgICAgICAgICAgbm9kZS5lbGVtZW50LmJhdGNoR3JvdXBJZCA9IC0xO1xuICAgICAgICB9XG4gICAgICAgIGlmIChub2RlLnNwcml0ZSAmJiBub2RlLnNwcml0ZS5iYXRjaEdyb3VwSWQgPT09IGlkKSB7XG4gICAgICAgICAgICBub2RlLnNwcml0ZS5iYXRjaEdyb3VwSWQgPSAtMTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbm9kZS5fY2hpbGRyZW4ubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHRoaXMuX3JlbW92ZU1vZGVsc0Zyb21CYXRjaEdyb3VwKG5vZGUuX2NoaWxkcmVuW2ldLCBpZCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpbnNlcnQodHlwZSwgZ3JvdXBJZCwgbm9kZSkge1xuICAgICAgICBjb25zdCBncm91cCA9IHRoaXMuX2JhdGNoR3JvdXBzW2dyb3VwSWRdO1xuICAgICAgICBEZWJ1Zy5hc3NlcnQoZ3JvdXAsIGBJbnZhbGlkIGJhdGNoICR7Z3JvdXBJZH0gaW5zZXJ0aW9uYCk7XG5cbiAgICAgICAgaWYgKGdyb3VwKSB7XG4gICAgICAgICAgICBpZiAoZ3JvdXAuX29ialt0eXBlXS5pbmRleE9mKG5vZGUpIDwgMCkge1xuICAgICAgICAgICAgICAgIGdyb3VwLl9vYmpbdHlwZV0ucHVzaChub2RlKTtcbiAgICAgICAgICAgICAgICB0aGlzLm1hcmtHcm91cERpcnR5KGdyb3VwSWQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmVtb3ZlKHR5cGUsIGdyb3VwSWQsIG5vZGUpIHtcbiAgICAgICAgY29uc3QgZ3JvdXAgPSB0aGlzLl9iYXRjaEdyb3Vwc1tncm91cElkXTtcbiAgICAgICAgRGVidWcuYXNzZXJ0KGdyb3VwLCBgSW52YWxpZCBiYXRjaCAke2dyb3VwSWR9IGluc2VydGlvbmApO1xuXG4gICAgICAgIGlmIChncm91cCkge1xuICAgICAgICAgICAgY29uc3QgaWR4ID0gZ3JvdXAuX29ialt0eXBlXS5pbmRleE9mKG5vZGUpO1xuICAgICAgICAgICAgaWYgKGlkeCA+PSAwKSB7XG4gICAgICAgICAgICAgICAgZ3JvdXAuX29ialt0eXBlXS5zcGxpY2UoaWR4LCAxKTtcbiAgICAgICAgICAgICAgICB0aGlzLm1hcmtHcm91cERpcnR5KGdyb3VwSWQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgX2V4dHJhY3RSZW5kZXIobm9kZSwgYXJyLCBncm91cCwgZ3JvdXBNZXNoSW5zdGFuY2VzKSB7XG4gICAgICAgIGlmIChub2RlLnJlbmRlcikge1xuICAgICAgICAgICAgYXJyID0gZ3JvdXBNZXNoSW5zdGFuY2VzW25vZGUucmVuZGVyLmJhdGNoR3JvdXBJZF0gPSBhcnIuY29uY2F0KG5vZGUucmVuZGVyLm1lc2hJbnN0YW5jZXMpO1xuICAgICAgICAgICAgbm9kZS5yZW5kZXIucmVtb3ZlRnJvbUxheWVycygpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGFycjtcbiAgICB9XG5cbiAgICBfZXh0cmFjdE1vZGVsKG5vZGUsIGFyciwgZ3JvdXAsIGdyb3VwTWVzaEluc3RhbmNlcykge1xuICAgICAgICBpZiAobm9kZS5tb2RlbCAmJiBub2RlLm1vZGVsLm1vZGVsKSB7XG4gICAgICAgICAgICBhcnIgPSBncm91cE1lc2hJbnN0YW5jZXNbbm9kZS5tb2RlbC5iYXRjaEdyb3VwSWRdID0gYXJyLmNvbmNhdChub2RlLm1vZGVsLm1lc2hJbnN0YW5jZXMpO1xuICAgICAgICAgICAgbm9kZS5tb2RlbC5yZW1vdmVNb2RlbEZyb21MYXllcnMoKTtcblxuICAgICAgICAgICAgLy8gI2lmIF9ERUJVR1xuICAgICAgICAgICAgbm9kZS5tb2RlbC5fYmF0Y2hHcm91cCA9IGdyb3VwO1xuICAgICAgICAgICAgLy8gI2VuZGlmXG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gYXJyO1xuICAgIH1cblxuICAgIF9leHRyYWN0RWxlbWVudChub2RlLCBhcnIsIGdyb3VwKSB7XG4gICAgICAgIGlmICghbm9kZS5lbGVtZW50KSByZXR1cm47XG4gICAgICAgIGxldCB2YWxpZCA9IGZhbHNlO1xuICAgICAgICBpZiAobm9kZS5lbGVtZW50Ll90ZXh0ICYmIG5vZGUuZWxlbWVudC5fdGV4dC5fbW9kZWwubWVzaEluc3RhbmNlcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBhcnIucHVzaChub2RlLmVsZW1lbnQuX3RleHQuX21vZGVsLm1lc2hJbnN0YW5jZXNbMF0pO1xuICAgICAgICAgICAgbm9kZS5lbGVtZW50LnJlbW92ZU1vZGVsRnJvbUxheWVycyhub2RlLmVsZW1lbnQuX3RleHQuX21vZGVsKTtcblxuICAgICAgICAgICAgdmFsaWQgPSB0cnVlO1xuICAgICAgICB9IGVsc2UgaWYgKG5vZGUuZWxlbWVudC5faW1hZ2UpIHtcbiAgICAgICAgICAgIGFyci5wdXNoKG5vZGUuZWxlbWVudC5faW1hZ2UuX3JlbmRlcmFibGUubWVzaEluc3RhbmNlKTtcbiAgICAgICAgICAgIG5vZGUuZWxlbWVudC5yZW1vdmVNb2RlbEZyb21MYXllcnMobm9kZS5lbGVtZW50Ll9pbWFnZS5fcmVuZGVyYWJsZS5tb2RlbCk7XG5cbiAgICAgICAgICAgIGlmIChub2RlLmVsZW1lbnQuX2ltYWdlLl9yZW5kZXJhYmxlLnVubWFza01lc2hJbnN0YW5jZSkge1xuICAgICAgICAgICAgICAgIGFyci5wdXNoKG5vZGUuZWxlbWVudC5faW1hZ2UuX3JlbmRlcmFibGUudW5tYXNrTWVzaEluc3RhbmNlKTtcbiAgICAgICAgICAgICAgICBpZiAoIW5vZGUuZWxlbWVudC5faW1hZ2UuX3JlbmRlcmFibGUudW5tYXNrTWVzaEluc3RhbmNlLnN0ZW5jaWxGcm9udCB8fFxuICAgICAgICAgICAgICAgICAgICAhbm9kZS5lbGVtZW50Ll9pbWFnZS5fcmVuZGVyYWJsZS51bm1hc2tNZXNoSW5zdGFuY2Uuc3RlbmNpbEJhY2spIHtcbiAgICAgICAgICAgICAgICAgICAgbm9kZS5lbGVtZW50Ll9kaXJ0aWZ5TWFzaygpO1xuICAgICAgICAgICAgICAgICAgICBub2RlLmVsZW1lbnQuX29uUHJlcmVuZGVyKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YWxpZCA9IHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodmFsaWQpIHtcbiAgICAgICAgICAgIGdyb3VwLl91aSA9IHRydWU7XG4gICAgICAgICAgICAvLyAjaWYgX0RFQlVHXG4gICAgICAgICAgICBub2RlLmVsZW1lbnQuX2JhdGNoR3JvdXAgPSBncm91cDtcbiAgICAgICAgICAgIC8vICNlbmRpZlxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gdHJhdmVyc2Ugc2NlbmUgaGllcmFyY2h5IGRvd24gZnJvbSBgbm9kZWAgYW5kIGNvbGxlY3QgYWxsIGNvbXBvbmVudHMgdGhhdCBhcmUgbWFya2VkXG4gICAgLy8gd2l0aCBhIGJhdGNoIGdyb3VwIGlkLiBSZW1vdmUgZnJvbSBsYXllcnMgYW55IG1vZGVscyB0aGF0IHRoZXNlIGNvbXBvbmVudHMgY29udGFpbnMuXG4gICAgLy8gRmlsbCB0aGUgYGdyb3VwTWVzaEluc3RhbmNlc2Agd2l0aCBhbGwgdGhlIG1lc2ggaW5zdGFuY2VzIHRvIGJlIGluY2x1ZGVkIGluIHRoZSBiYXRjaCBncm91cHMsXG4gICAgLy8gaW5kZXhlZCBieSBiYXRjaCBncm91cCBpZC5cbiAgICBfY29sbGVjdEFuZFJlbW92ZU1lc2hJbnN0YW5jZXMoZ3JvdXBNZXNoSW5zdGFuY2VzLCBncm91cElkcykge1xuICAgICAgICBmb3IgKGxldCBnID0gMDsgZyA8IGdyb3VwSWRzLmxlbmd0aDsgZysrKSB7XG4gICAgICAgICAgICBjb25zdCBpZCA9IGdyb3VwSWRzW2ddO1xuICAgICAgICAgICAgY29uc3QgZ3JvdXAgPSB0aGlzLl9iYXRjaEdyb3Vwc1tpZF07XG4gICAgICAgICAgICBpZiAoIWdyb3VwKSBjb250aW51ZTtcbiAgICAgICAgICAgIGxldCBhcnIgPSBncm91cE1lc2hJbnN0YW5jZXNbaWRdO1xuICAgICAgICAgICAgaWYgKCFhcnIpIGFyciA9IGdyb3VwTWVzaEluc3RhbmNlc1tpZF0gPSBbXTtcblxuICAgICAgICAgICAgZm9yIChsZXQgbSA9IDA7IG0gPCBncm91cC5fb2JqLm1vZGVsLmxlbmd0aDsgbSsrKSB7XG4gICAgICAgICAgICAgICAgYXJyID0gdGhpcy5fZXh0cmFjdE1vZGVsKGdyb3VwLl9vYmoubW9kZWxbbV0sIGFyciwgZ3JvdXAsIGdyb3VwTWVzaEluc3RhbmNlcyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZvciAobGV0IHIgPSAwOyByIDwgZ3JvdXAuX29iai5yZW5kZXIubGVuZ3RoOyByKyspIHtcbiAgICAgICAgICAgICAgICBhcnIgPSB0aGlzLl9leHRyYWN0UmVuZGVyKGdyb3VwLl9vYmoucmVuZGVyW3JdLCBhcnIsIGdyb3VwLCBncm91cE1lc2hJbnN0YW5jZXMpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmb3IgKGxldCBlID0gMDsgZSA8IGdyb3VwLl9vYmouZWxlbWVudC5sZW5ndGg7IGUrKykge1xuICAgICAgICAgICAgICAgIHRoaXMuX2V4dHJhY3RFbGVtZW50KGdyb3VwLl9vYmouZWxlbWVudFtlXSwgYXJyLCBncm91cCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZvciAobGV0IHMgPSAwOyBzIDwgZ3JvdXAuX29iai5zcHJpdGUubGVuZ3RoOyBzKyspIHtcbiAgICAgICAgICAgICAgICBjb25zdCBub2RlID0gZ3JvdXAuX29iai5zcHJpdGVbc107XG4gICAgICAgICAgICAgICAgaWYgKG5vZGUuc3ByaXRlICYmIG5vZGUuc3ByaXRlLl9tZXNoSW5zdGFuY2UgJiZcbiAgICAgICAgICAgICAgICAgICAgKGdyb3VwLmR5bmFtaWMgfHwgbm9kZS5zcHJpdGUuc3ByaXRlLl9yZW5kZXJNb2RlID09PSBTUFJJVEVfUkVOREVSTU9ERV9TSU1QTEUpKSB7XG4gICAgICAgICAgICAgICAgICAgIGFyci5wdXNoKG5vZGUuc3ByaXRlLl9tZXNoSW5zdGFuY2UpO1xuICAgICAgICAgICAgICAgICAgICBub2RlLnNwcml0ZS5yZW1vdmVNb2RlbEZyb21MYXllcnMoKTtcbiAgICAgICAgICAgICAgICAgICAgZ3JvdXAuX3Nwcml0ZSA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIG5vZGUuc3ByaXRlLl9iYXRjaEdyb3VwID0gZ3JvdXA7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRGVzdHJveXMgYWxsIGJhdGNoZXMgYW5kIGNyZWF0ZXMgbmV3IGJhc2VkIG9uIHNjZW5lIG1vZGVscy4gSGlkZXMgb3JpZ2luYWwgbW9kZWxzLiBDYWxsZWQgYnlcbiAgICAgKiBlbmdpbmUgYXV0b21hdGljYWxseSBvbiBhcHAgc3RhcnQsIGFuZCBpZiBiYXRjaEdyb3VwSWRzIG9uIG1vZGVscyBhcmUgY2hhbmdlZC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7bnVtYmVyW119IFtncm91cElkc10gLSBPcHRpb25hbCBhcnJheSBvZiBiYXRjaCBncm91cCBJRHMgdG8gdXBkYXRlLiBPdGhlcndpc2UgYWxsXG4gICAgICogZ3JvdXBzIGFyZSB1cGRhdGVkLlxuICAgICAqL1xuICAgIGdlbmVyYXRlKGdyb3VwSWRzKSB7XG4gICAgICAgIGNvbnN0IGdyb3VwTWVzaEluc3RhbmNlcyA9IHt9O1xuXG4gICAgICAgIGlmICghZ3JvdXBJZHMpIHtcbiAgICAgICAgICAgIC8vIEZ1bGwgc2NlbmVcbiAgICAgICAgICAgIGdyb3VwSWRzID0gT2JqZWN0LmtleXModGhpcy5fYmF0Y2hHcm91cHMpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gZGVsZXRlIG9sZCBiYXRjaGVzIHdpdGggbWF0Y2hpbmcgYmF0Y2hHcm91cElkXG4gICAgICAgIGNvbnN0IG5ld0JhdGNoTGlzdCA9IFtdO1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuX2JhdGNoTGlzdC5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgaWYgKGdyb3VwSWRzLmluZGV4T2YodGhpcy5fYmF0Y2hMaXN0W2ldLmJhdGNoR3JvdXBJZCkgPCAwKSB7XG4gICAgICAgICAgICAgICAgbmV3QmF0Y2hMaXN0LnB1c2godGhpcy5fYmF0Y2hMaXN0W2ldKTtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuZGVzdHJveUJhdGNoKHRoaXMuX2JhdGNoTGlzdFtpXSk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5fYmF0Y2hMaXN0ID0gbmV3QmF0Y2hMaXN0O1xuXG4gICAgICAgIC8vIGNvbGxlY3RcbiAgICAgICAgdGhpcy5fY29sbGVjdEFuZFJlbW92ZU1lc2hJbnN0YW5jZXMoZ3JvdXBNZXNoSW5zdGFuY2VzLCBncm91cElkcyk7XG5cbiAgICAgICAgaWYgKGdyb3VwSWRzID09PSB0aGlzLl9kaXJ0eUdyb3Vwcykge1xuICAgICAgICAgICAgdGhpcy5fZGlydHlHcm91cHMubGVuZ3RoID0gMDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IG5ld0RpcnR5R3JvdXBzID0gW107XG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuX2RpcnR5R3JvdXBzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgaWYgKGdyb3VwSWRzLmluZGV4T2YodGhpcy5fZGlydHlHcm91cHNbaV0pIDwgMCkgbmV3RGlydHlHcm91cHMucHVzaCh0aGlzLl9kaXJ0eUdyb3Vwc1tpXSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLl9kaXJ0eUdyb3VwcyA9IG5ld0RpcnR5R3JvdXBzO1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IGdyb3VwLCBsaXN0cywgZ3JvdXBEYXRhLCBiYXRjaDtcbiAgICAgICAgZm9yIChjb25zdCBncm91cElkIGluIGdyb3VwTWVzaEluc3RhbmNlcykge1xuICAgICAgICAgICAgaWYgKCFncm91cE1lc2hJbnN0YW5jZXMuaGFzT3duUHJvcGVydHkoZ3JvdXBJZCkpIGNvbnRpbnVlO1xuICAgICAgICAgICAgZ3JvdXAgPSBncm91cE1lc2hJbnN0YW5jZXNbZ3JvdXBJZF07XG5cbiAgICAgICAgICAgIGdyb3VwRGF0YSA9IHRoaXMuX2JhdGNoR3JvdXBzW2dyb3VwSWRdO1xuICAgICAgICAgICAgaWYgKCFncm91cERhdGEpIHtcbiAgICAgICAgICAgICAgICBEZWJ1Zy5lcnJvcihgYmF0Y2ggZ3JvdXAgJHtncm91cElkfSBub3QgZm91bmRgKTtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgbGlzdHMgPSB0aGlzLnByZXBhcmUoZ3JvdXAsIGdyb3VwRGF0YS5keW5hbWljLCBncm91cERhdGEubWF4QWFiYlNpemUsIGdyb3VwRGF0YS5fdWkgfHwgZ3JvdXBEYXRhLl9zcHJpdGUpO1xuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBsaXN0cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIGJhdGNoID0gdGhpcy5jcmVhdGUobGlzdHNbaV0sIGdyb3VwRGF0YS5keW5hbWljLCBwYXJzZUludChncm91cElkLCAxMCkpO1xuICAgICAgICAgICAgICAgIGlmIChiYXRjaCkge1xuICAgICAgICAgICAgICAgICAgICBiYXRjaC5hZGRUb0xheWVycyh0aGlzLnNjZW5lLCBncm91cERhdGEubGF5ZXJzKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIC8qKlxuICAgICAqIFRha2VzIGEgbGlzdCBvZiBtZXNoIGluc3RhbmNlcyB0byBiZSBiYXRjaGVkIGFuZCBzb3J0cyB0aGVtIGludG8gbGlzdHMgb25lIGZvciBlYWNoIGRyYXdcbiAgICAgKiBjYWxsLiBUaGUgaW5wdXQgbGlzdCB3aWxsIGJlIHNwbGl0LCBpZjpcbiAgICAgKlxuICAgICAqIC0gTWVzaCBpbnN0YW5jZXMgdXNlIGRpZmZlcmVudCBtYXRlcmlhbHMuXG4gICAgICogLSBNZXNoIGluc3RhbmNlcyBoYXZlIGRpZmZlcmVudCBwYXJhbWV0ZXJzIChlLmcuIGxpZ2h0bWFwcyBvciBzdGF0aWMgbGlnaHRzKS5cbiAgICAgKiAtIE1lc2ggaW5zdGFuY2VzIGhhdmUgZGlmZmVyZW50IHNoYWRlciBkZWZpbmVzIChzaGFkb3cgcmVjZWl2aW5nLCBiZWluZyBhbGlnbmVkIHRvIHNjcmVlblxuICAgICAqIHNwYWNlLCBldGMpLlxuICAgICAqIC0gVG9vIG1hbnkgdmVydGljZXMgZm9yIGEgc2luZ2xlIGJhdGNoICg2NTUzNSBpcyBtYXhpbXVtKS5cbiAgICAgKiAtIFRvbyBtYW55IGluc3RhbmNlcyBmb3IgYSBzaW5nbGUgYmF0Y2ggKGhhcmR3YXJlLWRlcGVuZGVudCwgZXhwZWN0IDEyOCBvbiBsb3ctZW5kIGFuZCAxMDI0XG4gICAgICogb24gaGlnaC1lbmQpLlxuICAgICAqIC0gQm91bmRpbmcgYm94IG9mIGEgYmF0Y2ggaXMgbGFyZ2VyIHRoYW4gbWF4QWFiYlNpemUgaW4gYW55IGRpbWVuc2lvbi5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7TWVzaEluc3RhbmNlW119IG1lc2hJbnN0YW5jZXMgLSBJbnB1dCBsaXN0IG9mIG1lc2ggaW5zdGFuY2VzXG4gICAgICogQHBhcmFtIHtib29sZWFufSBkeW5hbWljIC0gQXJlIHdlIHByZXBhcmluZyBmb3IgYSBkeW5hbWljIGJhdGNoPyBJbnN0YW5jZSBjb3VudCB3aWxsIG1hdHRlclxuICAgICAqIHRoZW4gKG90aGVyd2lzZSBub3QpLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBtYXhBYWJiU2l6ZSAtIE1heGltdW0gc2l6ZSBvZiBhbnkgZGltZW5zaW9uIG9mIGEgYm91bmRpbmcgYm94IGFyb3VuZCBiYXRjaGVkXG4gICAgICogb2JqZWN0cy5cbiAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IHRyYW5zbHVjZW50IC0gQXJlIHdlIGJhdGNoaW5nIFVJIGVsZW1lbnRzIG9yIHNwcml0ZXNcbiAgICAgKiBUaGlzIGlzIHVzZWZ1bCB0byBrZWVwIGEgYmFsYW5jZSBiZXR3ZWVuIHRoZSBudW1iZXIgb2YgZHJhdyBjYWxscyBhbmQgdGhlIG51bWJlciBvZiBkcmF3blxuICAgICAqIHRyaWFuZ2xlcywgYmVjYXVzZSBzbWFsbGVyIGJhdGNoZXMgY2FuIGJlIGhpZGRlbiB3aGVuIG5vdCB2aXNpYmxlIGluIGNhbWVyYS5cbiAgICAgKiBAcmV0dXJucyB7TWVzaEluc3RhbmNlW11bXX0gQW4gYXJyYXkgb2YgYXJyYXlzIG9mIG1lc2ggaW5zdGFuY2VzLCBlYWNoIHZhbGlkIHRvIHBhc3MgdG9cbiAgICAgKiB7QGxpbmsgQmF0Y2hNYW5hZ2VyI2NyZWF0ZX0uXG4gICAgICovXG4gICAgcHJlcGFyZShtZXNoSW5zdGFuY2VzLCBkeW5hbWljLCBtYXhBYWJiU2l6ZSA9IE51bWJlci5QT1NJVElWRV9JTkZJTklUWSwgdHJhbnNsdWNlbnQpIHtcbiAgICAgICAgaWYgKG1lc2hJbnN0YW5jZXMubGVuZ3RoID09PSAwKSByZXR1cm4gW107XG4gICAgICAgIGNvbnN0IGhhbGZNYXhBYWJiU2l6ZSA9IG1heEFhYmJTaXplICogMC41O1xuICAgICAgICBjb25zdCBtYXhJbnN0YW5jZUNvdW50ID0gdGhpcy5kZXZpY2Uuc3VwcG9ydHNCb25lVGV4dHVyZXMgPyAxMDI0IDogdGhpcy5kZXZpY2UuYm9uZUxpbWl0O1xuXG4gICAgICAgIC8vIG1heGltdW0gbnVtYmVyIG9mIHZlcnRpY2VzIHRoYXQgY2FuIGJlIHVzZWQgaW4gYmF0Y2ggZGVwZW5kcyBvbiAzMmJpdCBpbmRleCBidWZmZXIgc3VwcG9ydCAoZG8gdGhpcyBmb3Igbm9uLWluZGV4ZWQgYXMgd2VsbCxcbiAgICAgICAgLy8gYXMgaW4gc29tZSBjYXNlcyAoVUkgZWxlbWVudHMpIG5vbi1pbmRleGVkIGdlb21ldHJ5IGdldHMgYmF0Y2hlZCBpbnRvIGluZGV4ZWQpXG4gICAgICAgIGNvbnN0IG1heE51bVZlcnRpY2VzID0gdGhpcy5kZXZpY2UuZXh0VWludEVsZW1lbnQgPyAweGZmZmZmZmZmIDogMHhmZmZmO1xuXG4gICAgICAgIGNvbnN0IGFhYmIgPSBuZXcgQm91bmRpbmdCb3goKTtcbiAgICAgICAgY29uc3QgdGVzdEFhYmIgPSBuZXcgQm91bmRpbmdCb3goKTtcbiAgICAgICAgbGV0IHNraXBUcmFuc2x1Y2VudEFhYmIgPSBudWxsO1xuICAgICAgICBsZXQgc2Y7XG5cbiAgICAgICAgY29uc3QgbGlzdHMgPSBbXTtcbiAgICAgICAgbGV0IGogPSAwO1xuICAgICAgICBpZiAodHJhbnNsdWNlbnQpIHtcbiAgICAgICAgICAgIG1lc2hJbnN0YW5jZXMuc29ydChmdW5jdGlvbiAoYSwgYikge1xuICAgICAgICAgICAgICAgIHJldHVybiBhLmRyYXdPcmRlciAtIGIuZHJhd09yZGVyO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgbGV0IG1lc2hJbnN0YW5jZXNMZWZ0QSA9IG1lc2hJbnN0YW5jZXM7XG4gICAgICAgIGxldCBtZXNoSW5zdGFuY2VzTGVmdEI7XG5cbiAgICAgICAgY29uc3Qgc2tpcE1lc2ggPSB0cmFuc2x1Y2VudCA/IGZ1bmN0aW9uIChtaSkge1xuICAgICAgICAgICAgaWYgKHNraXBUcmFuc2x1Y2VudEFhYmIpIHtcbiAgICAgICAgICAgICAgICBza2lwVHJhbnNsdWNlbnRBYWJiLmFkZChtaS5hYWJiKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgc2tpcFRyYW5zbHVjZW50QWFiYiA9IG1pLmFhYmIuY2xvbmUoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIG1lc2hJbnN0YW5jZXNMZWZ0Qi5wdXNoKG1pKTtcbiAgICAgICAgfSA6IGZ1bmN0aW9uIChtaSkge1xuICAgICAgICAgICAgbWVzaEluc3RhbmNlc0xlZnRCLnB1c2gobWkpO1xuICAgICAgICB9O1xuXG4gICAgICAgIHdoaWxlIChtZXNoSW5zdGFuY2VzTGVmdEEubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgbGlzdHNbal0gPSBbbWVzaEluc3RhbmNlc0xlZnRBWzBdXTtcbiAgICAgICAgICAgIG1lc2hJbnN0YW5jZXNMZWZ0QiA9IFtdO1xuICAgICAgICAgICAgY29uc3QgbWF0ZXJpYWwgPSBtZXNoSW5zdGFuY2VzTGVmdEFbMF0ubWF0ZXJpYWw7XG4gICAgICAgICAgICBjb25zdCBsYXllciA9IG1lc2hJbnN0YW5jZXNMZWZ0QVswXS5sYXllcjtcbiAgICAgICAgICAgIGNvbnN0IGRlZnMgPSBtZXNoSW5zdGFuY2VzTGVmdEFbMF0uX3NoYWRlckRlZnM7XG4gICAgICAgICAgICBjb25zdCBwYXJhbXMgPSBtZXNoSW5zdGFuY2VzTGVmdEFbMF0ucGFyYW1ldGVycztcbiAgICAgICAgICAgIGNvbnN0IHN0ZW5jaWwgPSBtZXNoSW5zdGFuY2VzTGVmdEFbMF0uc3RlbmNpbEZyb250O1xuICAgICAgICAgICAgbGV0IHZlcnRDb3VudCA9IG1lc2hJbnN0YW5jZXNMZWZ0QVswXS5tZXNoLnZlcnRleEJ1ZmZlci5nZXROdW1WZXJ0aWNlcygpO1xuICAgICAgICAgICAgY29uc3QgZHJhd09yZGVyID0gbWVzaEluc3RhbmNlc0xlZnRBWzBdLmRyYXdPcmRlcjtcbiAgICAgICAgICAgIGFhYmIuY29weShtZXNoSW5zdGFuY2VzTGVmdEFbMF0uYWFiYik7XG4gICAgICAgICAgICBjb25zdCBzY2FsZVNpZ24gPSBnZXRTY2FsZVNpZ24obWVzaEluc3RhbmNlc0xlZnRBWzBdKTtcbiAgICAgICAgICAgIGNvbnN0IHZlcnRleEZvcm1hdEJhdGNoaW5nSGFzaCA9IG1lc2hJbnN0YW5jZXNMZWZ0QVswXS5tZXNoLnZlcnRleEJ1ZmZlci5mb3JtYXQuYmF0Y2hpbmdIYXNoO1xuICAgICAgICAgICAgY29uc3QgaW5kZXhlZCA9IG1lc2hJbnN0YW5jZXNMZWZ0QVswXS5tZXNoLnByaW1pdGl2ZVswXS5pbmRleGVkO1xuICAgICAgICAgICAgc2tpcFRyYW5zbHVjZW50QWFiYiA9IG51bGw7XG5cbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAxOyBpIDwgbWVzaEluc3RhbmNlc0xlZnRBLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgbWkgPSBtZXNoSW5zdGFuY2VzTGVmdEFbaV07XG5cbiAgICAgICAgICAgICAgICAvLyBTcGxpdCBieSBpbnN0YW5jZSBudW1iZXJcbiAgICAgICAgICAgICAgICBpZiAoZHluYW1pYyAmJiBsaXN0c1tqXS5sZW5ndGggPj0gbWF4SW5zdGFuY2VDb3VudCkge1xuICAgICAgICAgICAgICAgICAgICBtZXNoSW5zdGFuY2VzTGVmdEIgPSBtZXNoSW5zdGFuY2VzTGVmdEIuY29uY2F0KG1lc2hJbnN0YW5jZXNMZWZ0QS5zbGljZShpKSk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIFNwbGl0IGJ5IG1hdGVyaWFsLCBsYXllciAobGVnYWN5KSwgdmVydGV4IGZvcm1hdCAmIGluZGV4IGNvbXBhdGliaWxpdHksIHNoYWRlciBkZWZpbmVzLCBzdGF0aWMgc291cmNlLCB2ZXJ0IGNvdW50LCBvdmVybGFwcGluZyBVSVxuICAgICAgICAgICAgICAgIGlmICgobWF0ZXJpYWwgIT09IG1pLm1hdGVyaWFsKSB8fFxuICAgICAgICAgICAgICAgICAgICAobGF5ZXIgIT09IG1pLmxheWVyKSB8fFxuICAgICAgICAgICAgICAgICAgICAodmVydGV4Rm9ybWF0QmF0Y2hpbmdIYXNoICE9PSBtaS5tZXNoLnZlcnRleEJ1ZmZlci5mb3JtYXQuYmF0Y2hpbmdIYXNoKSB8fFxuICAgICAgICAgICAgICAgICAgICAoaW5kZXhlZCAhPT0gbWkubWVzaC5wcmltaXRpdmVbMF0uaW5kZXhlZCkgfHxcbiAgICAgICAgICAgICAgICAgICAgKGRlZnMgIT09IG1pLl9zaGFkZXJEZWZzKSB8fFxuICAgICAgICAgICAgICAgICAgICAodmVydENvdW50ICsgbWkubWVzaC52ZXJ0ZXhCdWZmZXIuZ2V0TnVtVmVydGljZXMoKSA+IG1heE51bVZlcnRpY2VzKSkge1xuICAgICAgICAgICAgICAgICAgICBza2lwTWVzaChtaSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAvLyBTcGxpdCBieSBBQUJCXG4gICAgICAgICAgICAgICAgdGVzdEFhYmIuY29weShhYWJiKTtcbiAgICAgICAgICAgICAgICB0ZXN0QWFiYi5hZGQobWkuYWFiYik7XG4gICAgICAgICAgICAgICAgaWYgKHRlc3RBYWJiLmhhbGZFeHRlbnRzLnggPiBoYWxmTWF4QWFiYlNpemUgfHxcbiAgICAgICAgICAgICAgICAgICAgdGVzdEFhYmIuaGFsZkV4dGVudHMueSA+IGhhbGZNYXhBYWJiU2l6ZSB8fFxuICAgICAgICAgICAgICAgICAgICB0ZXN0QWFiYi5oYWxmRXh0ZW50cy56ID4gaGFsZk1heEFhYmJTaXplKSB7XG4gICAgICAgICAgICAgICAgICAgIHNraXBNZXNoKG1pKTtcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIC8vIFNwbGl0IHN0ZW5jaWwgbWFzayAoVUkgZWxlbWVudHMpLCBib3RoIGZyb250IGFuZCBiYWNrIGV4cGVjdGVkIHRvIGJlIHRoZSBzYW1lXG4gICAgICAgICAgICAgICAgaWYgKHN0ZW5jaWwpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCEoc2YgPSBtaS5zdGVuY2lsRnJvbnQpIHx8IHN0ZW5jaWwuZnVuYyAhPT0gc2YuZnVuYyB8fCBzdGVuY2lsLnpwYXNzICE9PSBzZi56cGFzcykge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2tpcE1lc2gobWkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgLy8gU3BsaXQgYnkgbmVnYXRpdmUgc2NhbGVcbiAgICAgICAgICAgICAgICBpZiAoc2NhbGVTaWduICE9PSBnZXRTY2FsZVNpZ24obWkpKSB7XG4gICAgICAgICAgICAgICAgICAgIHNraXBNZXNoKG1pKTtcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gU3BsaXQgYnkgcGFyYW1ldGVyc1xuICAgICAgICAgICAgICAgIGlmICghZXF1YWxQYXJhbVNldHMocGFyYW1zLCBtaS5wYXJhbWV0ZXJzKSkge1xuICAgICAgICAgICAgICAgICAgICBza2lwTWVzaChtaSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICh0cmFuc2x1Y2VudCAmJiBza2lwVHJhbnNsdWNlbnRBYWJiICYmIHNraXBUcmFuc2x1Y2VudEFhYmIuaW50ZXJzZWN0cyhtaS5hYWJiKSAmJiBtaS5kcmF3T3JkZXIgIT09IGRyYXdPcmRlcikge1xuICAgICAgICAgICAgICAgICAgICBza2lwTWVzaChtaSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGFhYmIuYWRkKG1pLmFhYmIpO1xuICAgICAgICAgICAgICAgIHZlcnRDb3VudCArPSBtaS5tZXNoLnZlcnRleEJ1ZmZlci5nZXROdW1WZXJ0aWNlcygpO1xuICAgICAgICAgICAgICAgIGxpc3RzW2pdLnB1c2gobWkpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBqKys7XG4gICAgICAgICAgICBtZXNoSW5zdGFuY2VzTGVmdEEgPSBtZXNoSW5zdGFuY2VzTGVmdEI7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gbGlzdHM7XG4gICAgfVxuXG4gICAgY29sbGVjdEJhdGNoZWRNZXNoRGF0YShtZXNoSW5zdGFuY2VzLCBkeW5hbWljKSB7XG5cbiAgICAgICAgbGV0IHN0cmVhbXMgPSBudWxsO1xuICAgICAgICBsZXQgYmF0Y2hOdW1WZXJ0cyA9IDA7XG4gICAgICAgIGxldCBiYXRjaE51bUluZGljZXMgPSAwO1xuICAgICAgICBsZXQgbWF0ZXJpYWwgPSBudWxsO1xuXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbWVzaEluc3RhbmNlcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgaWYgKG1lc2hJbnN0YW5jZXNbaV0udmlzaWJsZSkge1xuXG4gICAgICAgICAgICAgICAgLy8gdmVydGV4IGNvdW50c1xuICAgICAgICAgICAgICAgIGNvbnN0IG1lc2ggPSBtZXNoSW5zdGFuY2VzW2ldLm1lc2g7XG4gICAgICAgICAgICAgICAgY29uc3QgbnVtVmVydHMgPSBtZXNoLnZlcnRleEJ1ZmZlci5udW1WZXJ0aWNlcztcbiAgICAgICAgICAgICAgICBiYXRjaE51bVZlcnRzICs9IG51bVZlcnRzO1xuXG4gICAgICAgICAgICAgICAgLy8gaW5kZXggY291bnRcbiAgICAgICAgICAgICAgICBpZiAobWVzaC5wcmltaXRpdmVbMF0uaW5kZXhlZCkge1xuICAgICAgICAgICAgICAgICAgICBiYXRjaE51bUluZGljZXMgKz0gbWVzaC5wcmltaXRpdmVbMF0uY291bnQ7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gc3BlY2lhbCBjYXNlIG9mIGZhbiAvIHN0cmlwIG5vbi1pbmRleGVkIHByaW1pdGl2ZSB1c2VkIGJ5IFVJXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHByaW1pdGl2ZVR5cGUgPSBtZXNoLnByaW1pdGl2ZVswXS50eXBlO1xuICAgICAgICAgICAgICAgICAgICBpZiAocHJpbWl0aXZlVHlwZSA9PT0gUFJJTUlUSVZFX1RSSUZBTiB8fCBwcmltaXRpdmVUeXBlID09PSBQUklNSVRJVkVfVFJJU1RSSVApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChtZXNoLnByaW1pdGl2ZVswXS5jb3VudCA9PT0gNClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBiYXRjaE51bUluZGljZXMgKz0gNjtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIGlmIGZpcnN0IG1lc2hcbiAgICAgICAgICAgICAgICBpZiAoIXN0cmVhbXMpIHtcblxuICAgICAgICAgICAgICAgICAgICAvLyBtYXRlcmlhbFxuICAgICAgICAgICAgICAgICAgICBtYXRlcmlhbCA9IG1lc2hJbnN0YW5jZXNbaV0ubWF0ZXJpYWw7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gY29sbGVjdCB1c2VkIHZlcnRleCBidWZmZXIgc2VtYW50aWMgaW5mb3JtYXRpb24gZnJvbSBmaXJzdCBtZXNoICh0aGV5IGFsbCBtYXRjaClcbiAgICAgICAgICAgICAgICAgICAgc3RyZWFtcyA9IHt9O1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBlbGVtcyA9IG1lc2gudmVydGV4QnVmZmVyLmZvcm1hdC5lbGVtZW50cztcbiAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgaiA9IDA7IGogPCBlbGVtcy5sZW5ndGg7IGorKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgc2VtYW50aWMgPSBlbGVtc1tqXS5uYW1lO1xuICAgICAgICAgICAgICAgICAgICAgICAgc3RyZWFtc1tzZW1hbnRpY10gPSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbnVtQ29tcG9uZW50czogZWxlbXNbal0ubnVtQ29tcG9uZW50cyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkYXRhVHlwZTogZWxlbXNbal0uZGF0YVR5cGUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbm9ybWFsaXplOiBlbGVtc1tqXS5ub3JtYWxpemUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY291bnQ6IDBcbiAgICAgICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAvLyBmb3IgZHluYW1pYyBtZXNoZXMgd2UgbmVlZCBib25lIGluZGljZXNcbiAgICAgICAgICAgICAgICAgICAgaWYgKGR5bmFtaWMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0cmVhbXNbU0VNQU5USUNfQkxFTkRJTkRJQ0VTXSA9IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBudW1Db21wb25lbnRzOiAxLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRhdGFUeXBlOiBUWVBFX0ZMT0FUMzIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbm9ybWFsaXplOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb3VudDogMFxuICAgICAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBzdHJlYW1zOiBzdHJlYW1zLFxuICAgICAgICAgICAgYmF0Y2hOdW1WZXJ0czogYmF0Y2hOdW1WZXJ0cyxcbiAgICAgICAgICAgIGJhdGNoTnVtSW5kaWNlczogYmF0Y2hOdW1JbmRpY2VzLFxuICAgICAgICAgICAgbWF0ZXJpYWw6IG1hdGVyaWFsXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVGFrZXMgYSBtZXNoIGluc3RhbmNlIGxpc3QgdGhhdCBoYXMgYmVlbiBwcmVwYXJlZCBieSB7QGxpbmsgQmF0Y2hNYW5hZ2VyI3ByZXBhcmV9LCBhbmRcbiAgICAgKiByZXR1cm5zIGEge0BsaW5rIEJhdGNofSBvYmplY3QuIFRoaXMgbWV0aG9kIGFzc3VtZXMgdGhhdCBhbGwgbWVzaCBpbnN0YW5jZXMgcHJvdmlkZWQgY2FuIGJlXG4gICAgICogcmVuZGVyZWQgaW4gYSBzaW5nbGUgZHJhdyBjYWxsLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtNZXNoSW5zdGFuY2VbXX0gbWVzaEluc3RhbmNlcyAtIElucHV0IGxpc3Qgb2YgbWVzaCBpbnN0YW5jZXMuXG4gICAgICogQHBhcmFtIHtib29sZWFufSBkeW5hbWljIC0gSXMgaXQgYSBzdGF0aWMgb3IgZHluYW1pYyBiYXRjaD8gV2lsbCBvYmplY3RzIGJlIHRyYW5zZm9ybWVkXG4gICAgICogYWZ0ZXIgYmF0Y2hpbmc/XG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFtiYXRjaEdyb3VwSWRdIC0gTGluayB0aGlzIGJhdGNoIHRvIGEgc3BlY2lmaWMgYmF0Y2ggZ3JvdXAuIFRoaXMgaXMgZG9uZVxuICAgICAqIGF1dG9tYXRpY2FsbHkgd2l0aCBkZWZhdWx0IGJhdGNoZXMuXG4gICAgICogQHJldHVybnMge0JhdGNofSBUaGUgcmVzdWx0aW5nIGJhdGNoIG9iamVjdC5cbiAgICAgKi9cbiAgICBjcmVhdGUobWVzaEluc3RhbmNlcywgZHluYW1pYywgYmF0Y2hHcm91cElkKSB7XG5cbiAgICAgICAgLy8gI2lmIF9QUk9GSUxFUlxuICAgICAgICBjb25zdCB0aW1lID0gbm93KCk7XG4gICAgICAgIC8vICNlbmRpZlxuXG4gICAgICAgIGlmICghdGhpcy5faW5pdCkge1xuICAgICAgICAgICAgY29uc3QgYm9uZUxpbWl0ID0gJyNkZWZpbmUgQk9ORV9MSU1JVCAnICsgdGhpcy5kZXZpY2UuZ2V0Qm9uZUxpbWl0KCkgKyAnXFxuJztcbiAgICAgICAgICAgIHRoaXMudHJhbnNmb3JtVlMgPSBib25lTGltaXQgKyAnI2RlZmluZSBEWU5BTUlDQkFUQ0hcXG4nICsgc2hhZGVyQ2h1bmtzLnRyYW5zZm9ybVZTO1xuICAgICAgICAgICAgdGhpcy5za2luVGV4VlMgPSBzaGFkZXJDaHVua3Muc2tpbkJhdGNoVGV4VlM7XG4gICAgICAgICAgICB0aGlzLnNraW5Db25zdFZTID0gc2hhZGVyQ2h1bmtzLnNraW5CYXRjaENvbnN0VlM7XG4gICAgICAgICAgICB0aGlzLnZlcnRleEZvcm1hdHMgPSB7fTtcbiAgICAgICAgICAgIHRoaXMuX2luaXQgPSB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IHN0cmVhbSA9IG51bGw7XG4gICAgICAgIGxldCBzZW1hbnRpYztcbiAgICAgICAgbGV0IG1lc2gsIG51bVZlcnRzO1xuICAgICAgICBsZXQgYmF0Y2ggPSBudWxsO1xuXG4gICAgICAgIC8vIGZpbmQgb3V0IHZlcnRleCBzdHJlYW1zIGFuZCBjb3VudHNcbiAgICAgICAgY29uc3QgYmF0Y2hEYXRhID0gdGhpcy5jb2xsZWN0QmF0Y2hlZE1lc2hEYXRhKG1lc2hJbnN0YW5jZXMsIGR5bmFtaWMpO1xuXG4gICAgICAgIC8vIGlmIGFueXRoaW5nIHRvIGJhdGNoXG4gICAgICAgIGlmIChiYXRjaERhdGEuc3RyZWFtcykge1xuXG4gICAgICAgICAgICBjb25zdCBzdHJlYW1zID0gYmF0Y2hEYXRhLnN0cmVhbXM7XG4gICAgICAgICAgICBsZXQgbWF0ZXJpYWwgPSBiYXRjaERhdGEubWF0ZXJpYWw7XG4gICAgICAgICAgICBjb25zdCBiYXRjaE51bVZlcnRzID0gYmF0Y2hEYXRhLmJhdGNoTnVtVmVydHM7XG4gICAgICAgICAgICBjb25zdCBiYXRjaE51bUluZGljZXMgPSBiYXRjaERhdGEuYmF0Y2hOdW1JbmRpY2VzO1xuXG4gICAgICAgICAgICBiYXRjaCA9IG5ldyBCYXRjaChtZXNoSW5zdGFuY2VzLCBkeW5hbWljLCBiYXRjaEdyb3VwSWQpO1xuICAgICAgICAgICAgdGhpcy5fYmF0Y2hMaXN0LnB1c2goYmF0Y2gpO1xuXG4gICAgICAgICAgICBsZXQgaW5kZXhCYXNlLCBudW1JbmRpY2VzLCBpbmRleERhdGE7XG4gICAgICAgICAgICBsZXQgdmVydGljZXNPZmZzZXQgPSAwO1xuICAgICAgICAgICAgbGV0IGluZGV4T2Zmc2V0ID0gMDtcbiAgICAgICAgICAgIGxldCB0cmFuc2Zvcm07XG4gICAgICAgICAgICBjb25zdCB2ZWMgPSBuZXcgVmVjMygpO1xuXG4gICAgICAgICAgICAvLyBhbGxvY2F0ZSBpbmRpY2VzXG4gICAgICAgICAgICBjb25zdCBpbmRleEFycmF5VHlwZSA9IGJhdGNoTnVtVmVydHMgPD0gMHhmZmZmID8gVWludDE2QXJyYXkgOiBVaW50MzJBcnJheTtcbiAgICAgICAgICAgIGNvbnN0IGluZGljZXMgPSBuZXcgaW5kZXhBcnJheVR5cGUoYmF0Y2hOdW1JbmRpY2VzKTtcblxuICAgICAgICAgICAgLy8gYWxsb2NhdGUgdHlwZWQgYXJyYXlzIHRvIHN0b3JlIGZpbmFsIHZlcnRleCBzdHJlYW0gZGF0YVxuICAgICAgICAgICAgZm9yIChzZW1hbnRpYyBpbiBzdHJlYW1zKSB7XG4gICAgICAgICAgICAgICAgc3RyZWFtID0gc3RyZWFtc1tzZW1hbnRpY107XG4gICAgICAgICAgICAgICAgc3RyZWFtLnR5cGVBcnJheVR5cGUgPSB0eXBlZEFycmF5VHlwZXNbc3RyZWFtLmRhdGFUeXBlXTtcbiAgICAgICAgICAgICAgICBzdHJlYW0uZWxlbWVudEJ5dGVTaXplID0gdHlwZWRBcnJheVR5cGVzQnl0ZVNpemVbc3RyZWFtLmRhdGFUeXBlXTtcbiAgICAgICAgICAgICAgICBzdHJlYW0uYnVmZmVyID0gbmV3IHN0cmVhbS50eXBlQXJyYXlUeXBlKGJhdGNoTnVtVmVydHMgKiBzdHJlYW0ubnVtQ29tcG9uZW50cyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIGJ1aWxkIHZlcnRleCBhbmQgaW5kZXggZGF0YSBmb3IgZmluYWwgbWVzaFxuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBtZXNoSW5zdGFuY2VzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFtZXNoSW5zdGFuY2VzW2ldLnZpc2libGUpXG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuXG4gICAgICAgICAgICAgICAgbWVzaCA9IG1lc2hJbnN0YW5jZXNbaV0ubWVzaDtcbiAgICAgICAgICAgICAgICBudW1WZXJ0cyA9IG1lc2gudmVydGV4QnVmZmVyLm51bVZlcnRpY2VzO1xuXG4gICAgICAgICAgICAgICAgLy8gbWF0cml4IHRvIHRyYW5zZm9ybSB2ZXJ0aWNlcyB0byB3b3JsZCBzcGFjZSBmb3Igc3RhdGljIGJhdGNoaW5nXG4gICAgICAgICAgICAgICAgaWYgKCFkeW5hbWljKSB7XG4gICAgICAgICAgICAgICAgICAgIHRyYW5zZm9ybSA9IG1lc2hJbnN0YW5jZXNbaV0ubm9kZS5nZXRXb3JsZFRyYW5zZm9ybSgpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGZvciAoc2VtYW50aWMgaW4gc3RyZWFtcykge1xuICAgICAgICAgICAgICAgICAgICBpZiAoc2VtYW50aWMgIT09IFNFTUFOVElDX0JMRU5ESU5ESUNFUykge1xuICAgICAgICAgICAgICAgICAgICAgICAgc3RyZWFtID0gc3RyZWFtc1tzZW1hbnRpY107XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGdldCB2ZXJ0ZXggc3RyZWFtIHRvIHR5cGVkIHZpZXcgc3ViYXJyYXlcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHN1YmFycmF5ID0gbmV3IHN0cmVhbS50eXBlQXJyYXlUeXBlKHN0cmVhbS5idWZmZXIuYnVmZmVyLCBzdHJlYW0uZWxlbWVudEJ5dGVTaXplICogc3RyZWFtLmNvdW50KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHRvdGFsQ29tcG9uZW50cyA9IG1lc2guZ2V0VmVydGV4U3RyZWFtKHNlbWFudGljLCBzdWJhcnJheSkgKiBzdHJlYW0ubnVtQ29tcG9uZW50cztcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0cmVhbS5jb3VudCArPSB0b3RhbENvbXBvbmVudHM7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHRyYW5zZm9ybSBwb3NpdGlvbiwgbm9ybWFsIGFuZCB0YW5nZW50IHRvIHdvcmxkIHNwYWNlXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIWR5bmFtaWMgJiYgc3RyZWFtLm51bUNvbXBvbmVudHMgPj0gMykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChzZW1hbnRpYyA9PT0gU0VNQU5USUNfUE9TSVRJT04pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgaiA9IDA7IGogPCB0b3RhbENvbXBvbmVudHM7IGogKz0gc3RyZWFtLm51bUNvbXBvbmVudHMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZlYy5zZXQoc3ViYXJyYXlbal0sIHN1YmFycmF5W2ogKyAxXSwgc3ViYXJyYXlbaiArIDJdKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRyYW5zZm9ybS50cmFuc2Zvcm1Qb2ludCh2ZWMsIHZlYyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdWJhcnJheVtqXSA9IHZlYy54O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc3ViYXJyYXlbaiArIDFdID0gdmVjLnk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdWJhcnJheVtqICsgMl0gPSB2ZWMuejtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoc2VtYW50aWMgPT09IFNFTUFOVElDX05PUk1BTCB8fCBzZW1hbnRpYyA9PT0gU0VNQU5USUNfVEFOR0VOVCkge1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGhhbmRsZSBub24tdW5pZm9ybSBzY2FsZSBieSB1c2luZyB0cmFuc3Bvc2VkIGludmVyc2UgbWF0cml4IHRvIHRyYW5zZm9ybSB2ZWN0b3JzXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1hdDMuaW52ZXJ0TWF0NCh0cmFuc2Zvcm0pLnRyYW5zcG9zZSgpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZvciAobGV0IGogPSAwOyBqIDwgdG90YWxDb21wb25lbnRzOyBqICs9IHN0cmVhbS5udW1Db21wb25lbnRzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2ZWMuc2V0KHN1YmFycmF5W2pdLCBzdWJhcnJheVtqICsgMV0sIHN1YmFycmF5W2ogKyAyXSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtYXQzLnRyYW5zZm9ybVZlY3Rvcih2ZWMsIHZlYyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdWJhcnJheVtqXSA9IHZlYy54O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc3ViYXJyYXlbaiArIDFdID0gdmVjLnk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdWJhcnJheVtqICsgMl0gPSB2ZWMuejtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIGJvbmUgaW5kZXggaXMgbWVzaCBpbmRleFxuICAgICAgICAgICAgICAgIGlmIChkeW5hbWljKSB7XG4gICAgICAgICAgICAgICAgICAgIHN0cmVhbSA9IHN0cmVhbXNbU0VNQU5USUNfQkxFTkRJTkRJQ0VTXTtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgaiA9IDA7IGogPCBudW1WZXJ0czsgaisrKVxuICAgICAgICAgICAgICAgICAgICAgICAgc3RyZWFtLmJ1ZmZlcltzdHJlYW0uY291bnQrK10gPSBpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIGluZGV4IGJ1ZmZlclxuICAgICAgICAgICAgICAgIGlmIChtZXNoLnByaW1pdGl2ZVswXS5pbmRleGVkKSB7XG4gICAgICAgICAgICAgICAgICAgIGluZGV4QmFzZSA9IG1lc2gucHJpbWl0aXZlWzBdLmJhc2U7XG4gICAgICAgICAgICAgICAgICAgIG51bUluZGljZXMgPSBtZXNoLnByaW1pdGl2ZVswXS5jb3VudDtcblxuICAgICAgICAgICAgICAgICAgICAvLyBzb3VyY2UgaW5kZXggYnVmZmVyIGRhdGEgbWFwcGVkIHRvIGl0cyBmb3JtYXRcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgc3JjRm9ybWF0ID0gbWVzaC5pbmRleEJ1ZmZlclswXS5nZXRGb3JtYXQoKTtcbiAgICAgICAgICAgICAgICAgICAgaW5kZXhEYXRhID0gbmV3IHR5cGVkQXJyYXlJbmRleEZvcm1hdHNbc3JjRm9ybWF0XShtZXNoLmluZGV4QnVmZmVyWzBdLnN0b3JhZ2UpO1xuXG4gICAgICAgICAgICAgICAgfSBlbHNlIHsgLy8gbm9uLWluZGV4ZWRcblxuICAgICAgICAgICAgICAgICAgICBjb25zdCBwcmltaXRpdmVUeXBlID0gbWVzaC5wcmltaXRpdmVbMF0udHlwZTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHByaW1pdGl2ZVR5cGUgPT09IFBSSU1JVElWRV9UUklGQU4gfHwgcHJpbWl0aXZlVHlwZSA9PT0gUFJJTUlUSVZFX1RSSVNUUklQKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAobWVzaC5wcmltaXRpdmVbMF0uY291bnQgPT09IDQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpbmRleEJhc2UgPSAwO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG51bUluZGljZXMgPSA2O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGluZGV4RGF0YSA9IHByaW1pdGl2ZVR5cGUgPT09IFBSSU1JVElWRV9UUklGQU4gPyBfdHJpRmFuSW5kaWNlcyA6IF90cmlTdHJpcEluZGljZXM7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG51bUluZGljZXMgPSAwO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgZm9yIChsZXQgaiA9IDA7IGogPCBudW1JbmRpY2VzOyBqKyspIHtcbiAgICAgICAgICAgICAgICAgICAgaW5kaWNlc1tqICsgaW5kZXhPZmZzZXRdID0gaW5kZXhEYXRhW2luZGV4QmFzZSArIGpdICsgdmVydGljZXNPZmZzZXQ7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaW5kZXhPZmZzZXQgKz0gbnVtSW5kaWNlcztcbiAgICAgICAgICAgICAgICB2ZXJ0aWNlc09mZnNldCArPSBudW1WZXJ0cztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gQ3JlYXRlIG1lc2hcbiAgICAgICAgICAgIG1lc2ggPSBuZXcgTWVzaCh0aGlzLmRldmljZSk7XG4gICAgICAgICAgICBmb3IgKHNlbWFudGljIGluIHN0cmVhbXMpIHtcbiAgICAgICAgICAgICAgICBzdHJlYW0gPSBzdHJlYW1zW3NlbWFudGljXTtcbiAgICAgICAgICAgICAgICBtZXNoLnNldFZlcnRleFN0cmVhbShzZW1hbnRpYywgc3RyZWFtLmJ1ZmZlciwgc3RyZWFtLm51bUNvbXBvbmVudHMsIHVuZGVmaW5lZCwgc3RyZWFtLmRhdGFUeXBlLCBzdHJlYW0ubm9ybWFsaXplKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGluZGljZXMubGVuZ3RoID4gMClcbiAgICAgICAgICAgICAgICBtZXNoLnNldEluZGljZXMoaW5kaWNlcyk7XG5cbiAgICAgICAgICAgIG1lc2gudXBkYXRlKFBSSU1JVElWRV9UUklBTkdMRVMsIGZhbHNlKTtcblxuICAgICAgICAgICAgLy8gUGF0Y2ggdGhlIG1hdGVyaWFsXG4gICAgICAgICAgICBpZiAoZHluYW1pYykge1xuICAgICAgICAgICAgICAgIG1hdGVyaWFsID0gbWF0ZXJpYWwuY2xvbmUoKTtcbiAgICAgICAgICAgICAgICBtYXRlcmlhbC5jaHVua3MudHJhbnNmb3JtVlMgPSB0aGlzLnRyYW5zZm9ybVZTO1xuICAgICAgICAgICAgICAgIG1hdGVyaWFsLmNodW5rcy5za2luVGV4VlMgPSB0aGlzLnNraW5UZXhWUztcbiAgICAgICAgICAgICAgICBtYXRlcmlhbC5jaHVua3Muc2tpbkNvbnN0VlMgPSB0aGlzLnNraW5Db25zdFZTO1xuICAgICAgICAgICAgICAgIG1hdGVyaWFsLnVwZGF0ZSgpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBDcmVhdGUgbWVzaEluc3RhbmNlXG4gICAgICAgICAgICBjb25zdCBtZXNoSW5zdGFuY2UgPSBuZXcgTWVzaEluc3RhbmNlKG1lc2gsIG1hdGVyaWFsLCB0aGlzLnJvb3ROb2RlKTtcbiAgICAgICAgICAgIG1lc2hJbnN0YW5jZS5jYXN0U2hhZG93ID0gYmF0Y2gub3JpZ01lc2hJbnN0YW5jZXNbMF0uY2FzdFNoYWRvdztcbiAgICAgICAgICAgIG1lc2hJbnN0YW5jZS5wYXJhbWV0ZXJzID0gYmF0Y2gub3JpZ01lc2hJbnN0YW5jZXNbMF0ucGFyYW1ldGVycztcbiAgICAgICAgICAgIG1lc2hJbnN0YW5jZS5sYXllciA9IGJhdGNoLm9yaWdNZXNoSW5zdGFuY2VzWzBdLmxheWVyO1xuICAgICAgICAgICAgbWVzaEluc3RhbmNlLl9zaGFkZXJEZWZzID0gYmF0Y2gub3JpZ01lc2hJbnN0YW5jZXNbMF0uX3NoYWRlckRlZnM7XG5cbiAgICAgICAgICAgIC8vIG1lc2hJbnN0YW5jZSBjdWxsaW5nIC0gZG9uJ3QgY3VsbCBVSSBlbGVtZW50cywgYXMgdGhleSB1c2UgY3VzdG9tIGN1bGxpbmcgQ29tcG9uZW50LmlzVmlzaWJsZUZvckNhbWVyYVxuICAgICAgICAgICAgbWVzaEluc3RhbmNlLmN1bGwgPSBiYXRjaC5vcmlnTWVzaEluc3RhbmNlc1swXS5jdWxsO1xuICAgICAgICAgICAgY29uc3QgYmF0Y2hHcm91cCA9IHRoaXMuX2JhdGNoR3JvdXBzW2JhdGNoR3JvdXBJZF07XG4gICAgICAgICAgICBpZiAoYmF0Y2hHcm91cCAmJiBiYXRjaEdyb3VwLl91aSlcbiAgICAgICAgICAgICAgICBtZXNoSW5zdGFuY2UuY3VsbCA9IGZhbHNlO1xuXG4gICAgICAgICAgICBpZiAoZHluYW1pYykge1xuICAgICAgICAgICAgICAgIC8vIENyZWF0ZSBza2luSW5zdGFuY2VcbiAgICAgICAgICAgICAgICBjb25zdCBub2RlcyA9IFtdO1xuICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYmF0Y2gub3JpZ01lc2hJbnN0YW5jZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgbm9kZXMucHVzaChiYXRjaC5vcmlnTWVzaEluc3RhbmNlc1tpXS5ub2RlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgbWVzaEluc3RhbmNlLnNraW5JbnN0YW5jZSA9IG5ldyBTa2luQmF0Y2hJbnN0YW5jZSh0aGlzLmRldmljZSwgbm9kZXMsIHRoaXMucm9vdE5vZGUpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBkaXNhYmxlIGFhYmIgdXBkYXRlLCBnZXRzIHVwZGF0ZWQgbWFudWFsbHkgYnkgYmF0Y2hlclxuICAgICAgICAgICAgbWVzaEluc3RhbmNlLl91cGRhdGVBYWJiID0gZmFsc2U7XG5cbiAgICAgICAgICAgIG1lc2hJbnN0YW5jZS5kcmF3T3JkZXIgPSBiYXRjaC5vcmlnTWVzaEluc3RhbmNlc1swXS5kcmF3T3JkZXI7XG4gICAgICAgICAgICBtZXNoSW5zdGFuY2Uuc3RlbmNpbEZyb250ID0gYmF0Y2gub3JpZ01lc2hJbnN0YW5jZXNbMF0uc3RlbmNpbEZyb250O1xuICAgICAgICAgICAgbWVzaEluc3RhbmNlLnN0ZW5jaWxCYWNrID0gYmF0Y2gub3JpZ01lc2hJbnN0YW5jZXNbMF0uc3RlbmNpbEJhY2s7XG4gICAgICAgICAgICBtZXNoSW5zdGFuY2UuZmxpcEZhY2VzRmFjdG9yID0gZ2V0U2NhbGVTaWduKGJhdGNoLm9yaWdNZXNoSW5zdGFuY2VzWzBdKTtcbiAgICAgICAgICAgIG1lc2hJbnN0YW5jZS5jYXN0U2hhZG93ID0gYmF0Y2gub3JpZ01lc2hJbnN0YW5jZXNbMF0uY2FzdFNoYWRvdztcblxuICAgICAgICAgICAgYmF0Y2gubWVzaEluc3RhbmNlID0gbWVzaEluc3RhbmNlO1xuICAgICAgICAgICAgYmF0Y2gudXBkYXRlQm91bmRpbmdCb3goKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vICNpZiBfUFJPRklMRVJcbiAgICAgICAgdGhpcy5fc3RhdHMuY3JlYXRlVGltZSArPSBub3coKSAtIHRpbWU7XG4gICAgICAgIC8vICNlbmRpZlxuXG4gICAgICAgIHJldHVybiBiYXRjaDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBVcGRhdGVzIGJvdW5kaW5nIGJveGVzIGZvciBhbGwgZHluYW1pYyBiYXRjaGVzLiBDYWxsZWQgYXV0b21hdGljYWxseS5cbiAgICAgKlxuICAgICAqIEBpZ25vcmVcbiAgICAgKi9cbiAgICB1cGRhdGVBbGwoKSB7XG4gICAgICAgIC8vIFRPRE86IG9ubHkgY2FsbCB3aGVuIG5lZWRlZC4gQXBwbGllcyB0byBza2lubmluZyBtYXRyaWNlcyBhcyB3ZWxsXG5cbiAgICAgICAgaWYgKHRoaXMuX2RpcnR5R3JvdXBzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIHRoaXMuZ2VuZXJhdGUodGhpcy5fZGlydHlHcm91cHMpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gI2lmIF9QUk9GSUxFUlxuICAgICAgICBjb25zdCB0aW1lID0gbm93KCk7XG4gICAgICAgIC8vICNlbmRpZlxuXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fYmF0Y2hMaXN0Lmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBpZiAoIXRoaXMuX2JhdGNoTGlzdFtpXS5keW5hbWljKSBjb250aW51ZTtcbiAgICAgICAgICAgIHRoaXMuX2JhdGNoTGlzdFtpXS51cGRhdGVCb3VuZGluZ0JveCgpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gI2lmIF9QUk9GSUxFUlxuICAgICAgICB0aGlzLl9zdGF0cy51cGRhdGVMYXN0RnJhbWVUaW1lID0gbm93KCkgLSB0aW1lO1xuICAgICAgICAvLyAjZW5kaWZcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDbG9uZXMgYSBiYXRjaC4gVGhpcyBtZXRob2QgZG9lc24ndCByZWJ1aWxkIGJhdGNoIGdlb21ldHJ5LCBidXQgb25seSBjcmVhdGVzIGEgbmV3IG1vZGVsIGFuZFxuICAgICAqIGJhdGNoIG9iamVjdHMsIGxpbmtlZCB0byBkaWZmZXJlbnQgc291cmNlIG1lc2ggaW5zdGFuY2VzLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtCYXRjaH0gYmF0Y2ggLSBBIGJhdGNoIG9iamVjdC5cbiAgICAgKiBAcGFyYW0ge01lc2hJbnN0YW5jZVtdfSBjbG9uZWRNZXNoSW5zdGFuY2VzIC0gTmV3IG1lc2ggaW5zdGFuY2VzLlxuICAgICAqIEByZXR1cm5zIHtCYXRjaH0gTmV3IGJhdGNoIG9iamVjdC5cbiAgICAgKi9cbiAgICBjbG9uZShiYXRjaCwgY2xvbmVkTWVzaEluc3RhbmNlcykge1xuICAgICAgICBjb25zdCBiYXRjaDIgPSBuZXcgQmF0Y2goY2xvbmVkTWVzaEluc3RhbmNlcywgYmF0Y2guZHluYW1pYywgYmF0Y2guYmF0Y2hHcm91cElkKTtcbiAgICAgICAgdGhpcy5fYmF0Y2hMaXN0LnB1c2goYmF0Y2gyKTtcblxuICAgICAgICBjb25zdCBub2RlcyA9IFtdO1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGNsb25lZE1lc2hJbnN0YW5jZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIG5vZGVzLnB1c2goY2xvbmVkTWVzaEluc3RhbmNlc1tpXS5ub2RlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGJhdGNoMi5tZXNoSW5zdGFuY2UgPSBuZXcgTWVzaEluc3RhbmNlKGJhdGNoLm1lc2hJbnN0YW5jZS5tZXNoLCBiYXRjaC5tZXNoSW5zdGFuY2UubWF0ZXJpYWwsIGJhdGNoLm1lc2hJbnN0YW5jZS5ub2RlKTtcbiAgICAgICAgYmF0Y2gyLm1lc2hJbnN0YW5jZS5fdXBkYXRlQWFiYiA9IGZhbHNlO1xuICAgICAgICBiYXRjaDIubWVzaEluc3RhbmNlLnBhcmFtZXRlcnMgPSBjbG9uZWRNZXNoSW5zdGFuY2VzWzBdLnBhcmFtZXRlcnM7XG4gICAgICAgIGJhdGNoMi5tZXNoSW5zdGFuY2UuY3VsbCA9IGNsb25lZE1lc2hJbnN0YW5jZXNbMF0uY3VsbDtcbiAgICAgICAgYmF0Y2gyLm1lc2hJbnN0YW5jZS5sYXllciA9IGNsb25lZE1lc2hJbnN0YW5jZXNbMF0ubGF5ZXI7XG5cbiAgICAgICAgaWYgKGJhdGNoLmR5bmFtaWMpIHtcbiAgICAgICAgICAgIGJhdGNoMi5tZXNoSW5zdGFuY2Uuc2tpbkluc3RhbmNlID0gbmV3IFNraW5CYXRjaEluc3RhbmNlKHRoaXMuZGV2aWNlLCBub2RlcywgdGhpcy5yb290Tm9kZSk7XG4gICAgICAgIH1cblxuICAgICAgICBiYXRjaDIubWVzaEluc3RhbmNlLmNhc3RTaGFkb3cgPSBiYXRjaC5tZXNoSW5zdGFuY2UuY2FzdFNoYWRvdztcbiAgICAgICAgYmF0Y2gyLm1lc2hJbnN0YW5jZS5fc2hhZGVyID0gYmF0Y2gubWVzaEluc3RhbmNlLl9zaGFkZXIuc2xpY2UoKTtcblxuICAgICAgICBiYXRjaDIubWVzaEluc3RhbmNlLmNhc3RTaGFkb3cgPSBiYXRjaC5tZXNoSW5zdGFuY2UuY2FzdFNoYWRvdztcblxuICAgICAgICByZXR1cm4gYmF0Y2gyO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJlbW92ZXMgdGhlIGJhdGNoIG1vZGVsIGZyb20gYWxsIGxheWVycyBhbmQgZGVzdHJveXMgaXQuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge0JhdGNofSBiYXRjaCAtIEEgYmF0Y2ggb2JqZWN0LlxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgZGVzdHJveUJhdGNoKGJhdGNoKSB7XG4gICAgICAgIGJhdGNoLmRlc3Ryb3kodGhpcy5zY2VuZSwgdGhpcy5fYmF0Y2hHcm91cHNbYmF0Y2guYmF0Y2hHcm91cElkXS5sYXllcnMpO1xuICAgIH1cbn1cblxuZXhwb3J0IHsgQmF0Y2hNYW5hZ2VyIH07XG4iXSwibmFtZXMiOlsicGFyYW1zSWRlbnRpY2FsIiwiYSIsImIiLCJkYXRhIiwiRmxvYXQzMkFycmF5IiwibGVuZ3RoIiwiaSIsImVxdWFsUGFyYW1TZXRzIiwicGFyYW1zMSIsInBhcmFtczIiLCJwYXJhbSIsImhhc093blByb3BlcnR5IiwiX3RyaUZhbkluZGljZXMiLCJfdHJpU3RyaXBJbmRpY2VzIiwibWF0MyIsIk1hdDMiLCJnZXRTY2FsZVNpZ24iLCJtaSIsIm5vZGUiLCJ3b3JsZFRyYW5zZm9ybSIsInNjYWxlU2lnbiIsIkJhdGNoTWFuYWdlciIsImNvbnN0cnVjdG9yIiwiZGV2aWNlIiwicm9vdCIsInNjZW5lIiwicm9vdE5vZGUiLCJfaW5pdCIsIl9iYXRjaEdyb3VwcyIsIl9iYXRjaEdyb3VwQ291bnRlciIsIl9iYXRjaExpc3QiLCJfZGlydHlHcm91cHMiLCJfc3RhdHMiLCJjcmVhdGVUaW1lIiwidXBkYXRlTGFzdEZyYW1lVGltZSIsImRlc3Ryb3kiLCJhZGRHcm91cCIsIm5hbWUiLCJkeW5hbWljIiwibWF4QWFiYlNpemUiLCJpZCIsImxheWVycyIsInVuZGVmaW5lZCIsIkRlYnVnIiwiZXJyb3IiLCJncm91cCIsIkJhdGNoR3JvdXAiLCJyZW1vdmVHcm91cCIsIm5ld0JhdGNoTGlzdCIsImJhdGNoR3JvdXBJZCIsImRlc3Ryb3lCYXRjaCIsInB1c2giLCJfcmVtb3ZlTW9kZWxzRnJvbUJhdGNoR3JvdXAiLCJtYXJrR3JvdXBEaXJ0eSIsImluZGV4T2YiLCJnZXRHcm91cEJ5TmFtZSIsImdyb3VwcyIsImdldEJhdGNoZXMiLCJyZXN1bHRzIiwibGVuIiwiYmF0Y2giLCJlbmFibGVkIiwibW9kZWwiLCJyZW5kZXIiLCJlbGVtZW50Iiwic3ByaXRlIiwiX2NoaWxkcmVuIiwiaW5zZXJ0IiwidHlwZSIsImdyb3VwSWQiLCJhc3NlcnQiLCJfb2JqIiwicmVtb3ZlIiwiaWR4Iiwic3BsaWNlIiwiX2V4dHJhY3RSZW5kZXIiLCJhcnIiLCJncm91cE1lc2hJbnN0YW5jZXMiLCJjb25jYXQiLCJtZXNoSW5zdGFuY2VzIiwicmVtb3ZlRnJvbUxheWVycyIsIl9leHRyYWN0TW9kZWwiLCJyZW1vdmVNb2RlbEZyb21MYXllcnMiLCJfYmF0Y2hHcm91cCIsIl9leHRyYWN0RWxlbWVudCIsInZhbGlkIiwiX3RleHQiLCJfbW9kZWwiLCJfaW1hZ2UiLCJfcmVuZGVyYWJsZSIsIm1lc2hJbnN0YW5jZSIsInVubWFza01lc2hJbnN0YW5jZSIsInN0ZW5jaWxGcm9udCIsInN0ZW5jaWxCYWNrIiwiX2RpcnRpZnlNYXNrIiwiX29uUHJlcmVuZGVyIiwiX3VpIiwiX2NvbGxlY3RBbmRSZW1vdmVNZXNoSW5zdGFuY2VzIiwiZ3JvdXBJZHMiLCJnIiwibSIsInIiLCJlIiwicyIsIl9tZXNoSW5zdGFuY2UiLCJfcmVuZGVyTW9kZSIsIlNQUklURV9SRU5ERVJNT0RFX1NJTVBMRSIsIl9zcHJpdGUiLCJnZW5lcmF0ZSIsIk9iamVjdCIsImtleXMiLCJuZXdEaXJ0eUdyb3VwcyIsImxpc3RzIiwiZ3JvdXBEYXRhIiwicHJlcGFyZSIsImNyZWF0ZSIsInBhcnNlSW50IiwiYWRkVG9MYXllcnMiLCJOdW1iZXIiLCJQT1NJVElWRV9JTkZJTklUWSIsInRyYW5zbHVjZW50IiwiaGFsZk1heEFhYmJTaXplIiwibWF4SW5zdGFuY2VDb3VudCIsInN1cHBvcnRzQm9uZVRleHR1cmVzIiwiYm9uZUxpbWl0IiwibWF4TnVtVmVydGljZXMiLCJleHRVaW50RWxlbWVudCIsImFhYmIiLCJCb3VuZGluZ0JveCIsInRlc3RBYWJiIiwic2tpcFRyYW5zbHVjZW50QWFiYiIsInNmIiwiaiIsInNvcnQiLCJkcmF3T3JkZXIiLCJtZXNoSW5zdGFuY2VzTGVmdEEiLCJtZXNoSW5zdGFuY2VzTGVmdEIiLCJza2lwTWVzaCIsImFkZCIsImNsb25lIiwibWF0ZXJpYWwiLCJsYXllciIsImRlZnMiLCJfc2hhZGVyRGVmcyIsInBhcmFtcyIsInBhcmFtZXRlcnMiLCJzdGVuY2lsIiwidmVydENvdW50IiwibWVzaCIsInZlcnRleEJ1ZmZlciIsImdldE51bVZlcnRpY2VzIiwiY29weSIsInZlcnRleEZvcm1hdEJhdGNoaW5nSGFzaCIsImZvcm1hdCIsImJhdGNoaW5nSGFzaCIsImluZGV4ZWQiLCJwcmltaXRpdmUiLCJzbGljZSIsImhhbGZFeHRlbnRzIiwieCIsInkiLCJ6IiwiZnVuYyIsInpwYXNzIiwiaW50ZXJzZWN0cyIsImNvbGxlY3RCYXRjaGVkTWVzaERhdGEiLCJzdHJlYW1zIiwiYmF0Y2hOdW1WZXJ0cyIsImJhdGNoTnVtSW5kaWNlcyIsInZpc2libGUiLCJudW1WZXJ0cyIsIm51bVZlcnRpY2VzIiwiY291bnQiLCJwcmltaXRpdmVUeXBlIiwiUFJJTUlUSVZFX1RSSUZBTiIsIlBSSU1JVElWRV9UUklTVFJJUCIsImVsZW1zIiwiZWxlbWVudHMiLCJzZW1hbnRpYyIsIm51bUNvbXBvbmVudHMiLCJkYXRhVHlwZSIsIm5vcm1hbGl6ZSIsIlNFTUFOVElDX0JMRU5ESU5ESUNFUyIsIlRZUEVfRkxPQVQzMiIsInRpbWUiLCJub3ciLCJnZXRCb25lTGltaXQiLCJ0cmFuc2Zvcm1WUyIsInNoYWRlckNodW5rcyIsInNraW5UZXhWUyIsInNraW5CYXRjaFRleFZTIiwic2tpbkNvbnN0VlMiLCJza2luQmF0Y2hDb25zdFZTIiwidmVydGV4Rm9ybWF0cyIsInN0cmVhbSIsImJhdGNoRGF0YSIsIkJhdGNoIiwiaW5kZXhCYXNlIiwibnVtSW5kaWNlcyIsImluZGV4RGF0YSIsInZlcnRpY2VzT2Zmc2V0IiwiaW5kZXhPZmZzZXQiLCJ0cmFuc2Zvcm0iLCJ2ZWMiLCJWZWMzIiwiaW5kZXhBcnJheVR5cGUiLCJVaW50MTZBcnJheSIsIlVpbnQzMkFycmF5IiwiaW5kaWNlcyIsInR5cGVBcnJheVR5cGUiLCJ0eXBlZEFycmF5VHlwZXMiLCJlbGVtZW50Qnl0ZVNpemUiLCJ0eXBlZEFycmF5VHlwZXNCeXRlU2l6ZSIsImJ1ZmZlciIsImdldFdvcmxkVHJhbnNmb3JtIiwic3ViYXJyYXkiLCJ0b3RhbENvbXBvbmVudHMiLCJnZXRWZXJ0ZXhTdHJlYW0iLCJTRU1BTlRJQ19QT1NJVElPTiIsInNldCIsInRyYW5zZm9ybVBvaW50IiwiU0VNQU5USUNfTk9STUFMIiwiU0VNQU5USUNfVEFOR0VOVCIsImludmVydE1hdDQiLCJ0cmFuc3Bvc2UiLCJ0cmFuc2Zvcm1WZWN0b3IiLCJiYXNlIiwic3JjRm9ybWF0IiwiaW5kZXhCdWZmZXIiLCJnZXRGb3JtYXQiLCJ0eXBlZEFycmF5SW5kZXhGb3JtYXRzIiwic3RvcmFnZSIsIk1lc2giLCJzZXRWZXJ0ZXhTdHJlYW0iLCJzZXRJbmRpY2VzIiwidXBkYXRlIiwiUFJJTUlUSVZFX1RSSUFOR0xFUyIsImNodW5rcyIsIk1lc2hJbnN0YW5jZSIsImNhc3RTaGFkb3ciLCJvcmlnTWVzaEluc3RhbmNlcyIsImN1bGwiLCJiYXRjaEdyb3VwIiwibm9kZXMiLCJza2luSW5zdGFuY2UiLCJTa2luQmF0Y2hJbnN0YW5jZSIsIl91cGRhdGVBYWJiIiwiZmxpcEZhY2VzRmFjdG9yIiwidXBkYXRlQm91bmRpbmdCb3giLCJ1cGRhdGVBbGwiLCJjbG9uZWRNZXNoSW5zdGFuY2VzIiwiYmF0Y2gyIiwiX3NoYWRlciJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7QUFxQkEsU0FBU0EsZUFBZUEsQ0FBQ0MsQ0FBQyxFQUFFQyxDQUFDLEVBQUU7QUFDM0IsRUFBQSxJQUFJRCxDQUFDLElBQUksQ0FBQ0MsQ0FBQyxFQUFFLE9BQU8sS0FBSyxDQUFBO0FBQ3pCLEVBQUEsSUFBSSxDQUFDRCxDQUFDLElBQUlDLENBQUMsRUFBRSxPQUFPLEtBQUssQ0FBQTtFQUN6QkQsQ0FBQyxHQUFHQSxDQUFDLENBQUNFLElBQUksQ0FBQTtFQUNWRCxDQUFDLEdBQUdBLENBQUMsQ0FBQ0MsSUFBSSxDQUFBO0FBQ1YsRUFBQSxJQUFJRixDQUFDLEtBQUtDLENBQUMsRUFBRSxPQUFPLElBQUksQ0FBQTtBQUN4QixFQUFBLElBQUlELENBQUMsWUFBWUcsWUFBWSxJQUFJRixDQUFDLFlBQVlFLFlBQVksRUFBRTtJQUN4RCxJQUFJSCxDQUFDLENBQUNJLE1BQU0sS0FBS0gsQ0FBQyxDQUFDRyxNQUFNLEVBQUUsT0FBTyxLQUFLLENBQUE7QUFDdkMsSUFBQSxLQUFLLElBQUlDLENBQUMsR0FBRyxDQUFDLEVBQUVBLENBQUMsR0FBR0wsQ0FBQyxDQUFDSSxNQUFNLEVBQUVDLENBQUMsRUFBRSxFQUFFO01BQy9CLElBQUlMLENBQUMsQ0FBQ0ssQ0FBQyxDQUFDLEtBQUtKLENBQUMsQ0FBQ0ksQ0FBQyxDQUFDLEVBQUUsT0FBTyxLQUFLLENBQUE7QUFDbkMsS0FBQTtBQUNBLElBQUEsT0FBTyxJQUFJLENB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
