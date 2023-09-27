import { Debug } from '../../core/debug.js';
import { path } from '../../core/path.js';
import { Color } from '../../core/math/color.js';
import { Mat4 } from '../../core/math/mat4.js';
import { math } from '../../core/math/math.js';
import { Vec2 } from '../../core/math/vec2.js';
import { Vec3 } from '../../core/math/vec3.js';
import { BoundingBox } from '../../core/shape/bounding-box.js';
import { CULLFACE_NONE, CULLFACE_BACK, INDEXFORMAT_UINT32, INDEXFORMAT_UINT16, INDEXFORMAT_UINT8, BUFFER_STATIC, FILTER_LINEAR_MIPMAP_LINEAR, FILTER_NEAREST_MIPMAP_LINEAR, FILTER_LINEAR_MIPMAP_NEAREST, FILTER_NEAREST_MIPMAP_NEAREST, FILTER_LINEAR, FILTER_NEAREST, ADDRESS_REPEAT, ADDRESS_MIRRORED_REPEAT, ADDRESS_CLAMP_TO_EDGE, PRIMITIVE_TRIANGLES, PRIMITIVE_TRIFAN, PRIMITIVE_TRISTRIP, PRIMITIVE_LINESTRIP, PRIMITIVE_LINELOOP, PRIMITIVE_LINES, PRIMITIVE_POINTS, SEMANTIC_NORMAL, SEMANTIC_COLOR, TYPE_UINT8, TYPE_UINT16, TYPE_FLOAT32, TYPE_UINT32, TYPE_INT32, TYPE_INT16, TYPE_INT8, SEMANTIC_POSITION, SEMANTIC_TANGENT, SEMANTIC_BLENDINDICES, SEMANTIC_BLENDWEIGHT, SEMANTIC_TEXCOORD0, SEMANTIC_TEXCOORD1, SEMANTIC_TEXCOORD2, SEMANTIC_TEXCOORD3, SEMANTIC_TEXCOORD4, SEMANTIC_TEXCOORD5, SEMANTIC_TEXCOORD6, SEMANTIC_TEXCOORD7, typedArrayTypesByteSize, typedArrayTypes } from '../../platform/graphics/constants.js';
import { IndexBuffer } from '../../platform/graphics/index-buffer.js';
import { Texture } from '../../platform/graphics/texture.js';
import { VertexBuffer } from '../../platform/graphics/vertex-buffer.js';
import { VertexFormat } from '../../platform/graphics/vertex-format.js';
import { http } from '../../platform/net/http.js';
import { SPECOCC_AO, BLEND_NONE, BLEND_NORMAL, PROJECTION_ORTHOGRAPHIC, PROJECTION_PERSPECTIVE, ASPECT_AUTO, LIGHTFALLOFF_INVERSESQUARED, ASPECT_MANUAL } from '../../scene/constants.js';
import { GraphNode } from '../../scene/graph-node.js';
import { Light, lightTypes } from '../../scene/light.js';
import { Mesh } from '../../scene/mesh.js';
import { Morph } from '../../scene/morph.js';
import { MorphTarget } from '../../scene/morph-target.js';
import { calculateNormals } from '../../scene/procedural.js';
import { Render } from '../../scene/render.js';
import { Skin } from '../../scene/skin.js';
import { StandardMaterial } from '../../scene/materials/standard-material.js';
import { Entity } from '../entity.js';
import { INTERPOLATION_LINEAR, INTERPOLATION_CUBIC, INTERPOLATION_STEP } from '../anim/constants.js';
import { AnimCurve } from '../anim/evaluator/anim-curve.js';
import { AnimData } from '../anim/evaluator/anim-data.js';
import { AnimTrack } from '../anim/evaluator/anim-track.js';
import { Asset } from '../asset/asset.js';
import { ABSOLUTE_URL } from '../asset/constants.js';
import { dracoDecode } from './draco-decoder.js';

// resources loaded from GLB file that the parser returns
class GlbResources {
  constructor() {
    this.gltf = void 0;
    this.nodes = void 0;
    this.scenes = void 0;
    this.animations = void 0;
    this.textures = void 0;
    this.materials = void 0;
    this.variants = void 0;
    this.meshVariants = void 0;
    this.meshDefaultMaterials = void 0;
    this.renders = void 0;
    this.skins = void 0;
    this.lights = void 0;
    this.cameras = void 0;
  }
  destroy() {
    // render needs to dec ref meshes
    if (this.renders) {
      this.renders.forEach(render => {
        render.meshes = null;
      });
    }
  }
}
const isDataURI = uri => {
  return /^data:.*,.*$/i.test(uri);
};
const getDataURIMimeType = uri => {
  return uri.substring(uri.indexOf(':') + 1, uri.indexOf(';'));
};
const getNumComponents = accessorType => {
  switch (accessorType) {
    case 'SCALAR':
      return 1;
    case 'VEC2':
      return 2;
    case 'VEC3':
      return 3;
    case 'VEC4':
      return 4;
    case 'MAT2':
      return 4;
    case 'MAT3':
      return 9;
    case 'MAT4':
      return 16;
    default:
      return 3;
  }
};
const getComponentType = componentType => {
  switch (componentType) {
    case 5120:
      return TYPE_INT8;
    case 5121:
      return TYPE_UINT8;
    case 5122:
      return TYPE_INT16;
    case 5123:
      return TYPE_UINT16;
    case 5124:
      return TYPE_INT32;
    case 5125:
      return TYPE_UINT32;
    case 5126:
      return TYPE_FLOAT32;
    default:
      return 0;
  }
};
const getComponentSizeInBytes = componentType => {
  switch (componentType) {
    case 5120:
      return 1;
    // int8
    case 5121:
      return 1;
    // uint8
    case 5122:
      return 2;
    // int16
    case 5123:
      return 2;
    // uint16
    case 5124:
      return 4;
    // int32
    case 5125:
      return 4;
    // uint32
    case 5126:
      return 4;
    // float32
    default:
      return 0;
  }
};
const getComponentDataType = componentType => {
  switch (componentType) {
    case 5120:
      return Int8Array;
    case 5121:
      return Uint8Array;
    case 5122:
      return Int16Array;
    case 5123:
      return Uint16Array;
    case 5124:
      return Int32Array;
    case 5125:
      return Uint32Array;
    case 5126:
      return Float32Array;
    default:
      return null;
  }
};
const gltfToEngineSemanticMap = {
  'POSITION': SEMANTIC_POSITION,
  'NORMAL': SEMANTIC_NORMAL,
  'TANGENT': SEMANTIC_TANGENT,
  'COLOR_0': SEMANTIC_COLOR,
  'JOINTS_0': SEMANTIC_BLENDINDICES,
  'WEIGHTS_0': SEMANTIC_BLENDWEIGHT,
  'TEXCOORD_0': SEMANTIC_TEXCOORD0,
  'TEXCOORD_1': SEMANTIC_TEXCOORD1,
  'TEXCOORD_2': SEMANTIC_TEXCOORD2,
  'TEXCOORD_3': SEMANTIC_TEXCOORD3,
  'TEXCOORD_4': SEMANTIC_TEXCOORD4,
  'TEXCOORD_5': SEMANTIC_TEXCOORD5,
  'TEXCOORD_6': SEMANTIC_TEXCOORD6,
  'TEXCOORD_7': SEMANTIC_TEXCOORD7
};

// order vertexDesc to match the rest of the engine
const attributeOrder = {
  [SEMANTIC_POSITION]: 0,
  [SEMANTIC_NORMAL]: 1,
  [SEMANTIC_TANGENT]: 2,
  [SEMANTIC_COLOR]: 3,
  [SEMANTIC_BLENDINDICES]: 4,
  [SEMANTIC_BLENDWEIGHT]: 5,
  [SEMANTIC_TEXCOORD0]: 6,
  [SEMANTIC_TEXCOORD1]: 7,
  [SEMANTIC_TEXCOORD2]: 8,
  [SEMANTIC_TEXCOORD3]: 9,
  [SEMANTIC_TEXCOORD4]: 10,
  [SEMANTIC_TEXCOORD5]: 11,
  [SEMANTIC_TEXCOORD6]: 12,
  [SEMANTIC_TEXCOORD7]: 13
};

// returns a function for dequantizing the data type
const getDequantizeFunc = srcType => {
  // see https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_mesh_quantization#encoding-quantized-data
  switch (srcType) {
    case TYPE_INT8:
      return x => Math.max(x / 127.0, -1.0);
    case TYPE_UINT8:
      return x => x / 255.0;
    case TYPE_INT16:
      return x => Math.max(x / 32767.0, -1.0);
    case TYPE_UINT16:
      return x => x / 65535.0;
    default:
      return x => x;
  }
};

// dequantize an array of data
const dequantizeArray = (dstArray, srcArray, srcType) => {
  const convFunc = getDequantizeFunc(srcType);
  const len = srcArray.length;
  for (let i = 0; i < len; ++i) {
    dstArray[i] = convFunc(srcArray[i]);
  }
  return dstArray;
};

// get accessor data, making a copy and patching in the case of a sparse accessor
const getAccessorData = (gltfAccessor, bufferViews, flatten = false) => {
  const numComponents = getNumComponents(gltfAccessor.type);
  const dataType = getComponentDataType(gltfAccessor.componentType);
  if (!dataType) {
    return null;
  }
  let result;
  if (gltfAccessor.sparse) {
    // handle sparse data
    const sparse = gltfAccessor.sparse;

    // get indices data
    const indicesAccessor = {
      count: sparse.count,
      type: 'SCALAR'
    };
    const indices = getAccessorData(Object.assign(indicesAccessor, sparse.indices), bufferViews, true);

    // data values data
    const valuesAccessor = {
      count: sparse.count,
      type: gltfAccessor.type,
      componentType: gltfAccessor.componentType
    };
    const values = getAccessorData(Object.assign(valuesAccessor, sparse.values), bufferViews, true);

    // get base data
    if (gltfAccessor.hasOwnProperty('bufferView')) {
      const baseAccessor = {
        bufferView: gltfAccessor.bufferView,
        byteOffset: gltfAccessor.byteOffset,
        componentType: gltfAccessor.componentType,
        count: gltfAccessor.count,
        type: gltfAccessor.type
      };
      // make a copy of the base data since we'll patch the values
      result = getAccessorData(baseAccessor, bufferViews, true).slice();
    } else {
      // there is no base data, create empty 0'd out data
      result = new dataType(gltfAccessor.count * numComponents);
    }
    for (let i = 0; i < sparse.count; ++i) {
      const targetIndex = indices[i];
      for (let j = 0; j < numComponents; ++j) {
        result[targetIndex * numComponents + j] = values[i * numComponents + j];
      }
    }
  } else {
    if (gltfAccessor.hasOwnProperty("bufferView")) {
      const bufferView = bufferViews[gltfAccessor.bufferView];
      if (flatten && bufferView.hasOwnProperty('byteStride')) {
        // flatten stridden data
        const bytesPerElement = numComponents * dataType.BYTES_PER_ELEMENT;
        const storage = new ArrayBuffer(gltfAccessor.count * bytesPerElement);
        const tmpArray = new Uint8Array(storage);
        let dstOffset = 0;
        for (let i = 0; i < gltfAccessor.count; ++i) {
          // no need to add bufferView.byteOffset because accessor takes this into account
          let srcOffset = (gltfAccessor.byteOffset || 0) + i * bufferView.byteStride;
          for (let b = 0; b < bytesPerElement; ++b) {
            tmpArray[dstOffset++] = bufferView[srcOffset++];
          }
        }
        result = new dataType(storage);
      } else {
        result = new dataType(bufferView.buffer, bufferView.byteOffset + (gltfAccessor.byteOffset || 0), gltfAccessor.count * numComponents);
      }
    } else {
      result = new dataType(gltfAccessor.count * numComponents);
    }
  }
  return result;
};

// get accessor data as (unnormalized, unquantized) Float32 data
const getAccessorDataFloat32 = (gltfAccessor, bufferViews) => {
  const data = getAccessorData(gltfAccessor, bufferViews, true);
  if (data instanceof Float32Array || !gltfAccessor.normalized) {
    // if the source data is quantized (say to int16), but not normalized
    // then reading the values of the array is the same whether the values
    // are stored as float32 or int16. so probably no need to convert to
    // float32.
    return data;
  }
  const float32Data = new Float32Array(data.length);
  dequantizeArray(float32Data, data, getComponentType(gltfAccessor.componentType));
  return float32Data;
};

// returns a dequantized bounding box for the accessor
const getAccessorBoundingBox = gltfAccessor => {
  let min = gltfAccessor.min;
  let max = gltfAccessor.max;
  if (!min || !max) {
    return null;
  }
  if (gltfAccessor.normalized) {
    const ctype = getComponentType(gltfAccessor.componentType);
    min = dequantizeArray([], min, ctype);
    max = dequantizeArray([], max, ctype);
  }
  return new BoundingBox(new Vec3((max[0] + min[0]) * 0.5, (max[1] + min[1]) * 0.5, (max[2] + min[2]) * 0.5), new Vec3((max[0] - min[0]) * 0.5, (max[1] - min[1]) * 0.5, (max[2] - min[2]) * 0.5));
};
const getPrimitiveType = primitive => {
  if (!primitive.hasOwnProperty('mode')) {
    return PRIMITIVE_TRIANGLES;
  }
  switch (primitive.mode) {
    case 0:
      return PRIMITIVE_POINTS;
    case 1:
      return PRIMITIVE_LINES;
    case 2:
      return PRIMITIVE_LINELOOP;
    case 3:
      return PRIMITIVE_LINESTRIP;
    case 4:
      return PRIMITIVE_TRIANGLES;
    case 5:
      return PRIMITIVE_TRISTRIP;
    case 6:
      return PRIMITIVE_TRIFAN;
    default:
      return PRIMITIVE_TRIANGLES;
  }
};
const generateIndices = numVertices => {
  const dummyIndices = new Uint16Array(numVertices);
  for (let i = 0; i < numVertices; i++) {
    dummyIndices[i] = i;
  }
  return dummyIndices;
};
const generateNormals = (sourceDesc, indices) => {
  // get positions
  const p = sourceDesc[SEMANTIC_POSITION];
  if (!p || p.components !== 3) {
    return;
  }
  let positions;
  if (p.size !== p.stride) {
    // extract positions which aren't tightly packed
    const srcStride = p.stride / typedArrayTypesByteSize[p.type];
    const src = new typedArrayTypes[p.type](p.buffer, p.offset, p.count * srcStride);
    positions = new typedArrayTypes[p.type](p.count * 3);
    for (let i = 0; i < p.count; ++i) {
      positions[i * 3 + 0] = src[i * srcStride + 0];
      positions[i * 3 + 1] = src[i * srcStride + 1];
      positions[i * 3 + 2] = src[i * srcStride + 2];
    }
  } else {
    // position data is tightly packed so we can use it directly
    positions = new typedArrayTypes[p.type](p.buffer, p.offset, p.count * 3);
  }
  const numVertices = p.count;

  // generate indices if necessary
  if (!indices) {
    indices = generateIndices(numVertices);
  }

  // generate normals
  const normalsTemp = calculateNormals(positions, indices);
  const normals = new Float32Array(normalsTemp.length);
  normals.set(normalsTemp);
  sourceDesc[SEMANTIC_NORMAL] = {
    buffer: normals.buffer,
    size: 12,
    offset: 0,
    stride: 12,
    count: numVertices,
    components: 3,
    type: TYPE_FLOAT32
  };
};
const flipTexCoordVs = vertexBuffer => {
  let i, j;
  const floatOffsets = [];
  const shortOffsets = [];
  const byteOffsets = [];
  for (i = 0; i < vertexBuffer.format.elements.length; ++i) {
    const element = vertexBuffer.format.elements[i];
    if (element.name === SEMANTIC_TEXCOORD0 || element.name === SEMANTIC_TEXCOORD1) {
      switch (element.dataType) {
        case TYPE_FLOAT32:
          floatOffsets.push({
            offset: element.offset / 4 + 1,
            stride: element.stride / 4
          });
          break;
        case TYPE_UINT16:
          shortOffsets.push({
            offset: element.offset / 2 + 1,
            stride: element.stride / 2
          });
          break;
        case TYPE_UINT8:
          byteOffsets.push({
            offset: element.offset + 1,
            stride: element.stride
          });
          break;
      }
    }
  }
  const flip = (offsets, type, one) => {
    const typedArray = new type(vertexBuffer.storage);
    for (i = 0; i < offsets.length; ++i) {
      let index = offsets[i].offset;
      const stride = offsets[i].stride;
      for (j = 0; j < vertexBuffer.numVertices; ++j) {
        typedArray[index] = one - typedArray[index];
        index += stride;
      }
    }
  };
  if (floatOffsets.length > 0) {
    flip(floatOffsets, Float32Array, 1.0);
  }
  if (shortOffsets.length > 0) {
    flip(shortOffsets, Uint16Array, 65535);
  }
  if (byteOffsets.length > 0) {
    flip(byteOffsets, Uint8Array, 255);
  }
};

// given a texture, clone it
// NOTE: CPU-side texture data will be shared but GPU memory will be duplicated
const cloneTexture = texture => {
  const shallowCopyLevels = texture => {
    const result = [];
    for (let mip = 0; mip < texture._levels.length; ++mip) {
      let level = [];
      if (texture.cubemap) {
        for (let face = 0; face < 6; ++face) {
          level.push(texture._levels[mip][face]);
        }
      } else {
        level = texture._levels[mip];
      }
      result.push(level);
    }
    return result;
  };
  const result = new Texture(texture.device, texture); // duplicate texture
  result._levels = shallowCopyLevels(texture); // shallow copy the levels structure
  return result;
};

// given a texture asset, clone it
const cloneTextureAsset = src => {
  const result = new Asset(src.name + '_clone', src.type, src.file, src.data, src.options);
  result.loaded = true;
  result.resource = cloneTexture(src.resource);
  src.registry.add(result);
  return result;
};
const createVertexBufferInternal = (device, sourceDesc, flipV) => {
  const positionDesc = sourceDesc[SEMANTIC_POSITION];
  if (!positionDesc) {
    // ignore meshes without positions
    return null;
  }
  const numVertices = positionDesc.count;

  // generate vertexDesc elements
  const vertexDesc = [];
  for (const semantic in sourceDesc) {
    if (sourceDesc.hasOwnProperty(semantic)) {
      vertexDesc.push({
        semantic: semantic,
        components: sourceDesc[semantic].components,
        type: sourceDesc[semantic].type,
        normalize: !!sourceDesc[semantic].normalize
      });
    }
  }

  // sort vertex elements by engine-ideal order
  vertexDesc.sort((lhs, rhs) => {
    return attributeOrder[lhs.semantic] - attributeOrder[rhs.semantic];
  });
  let i, j, k;
  let source, target, sourceOffset;
  const vertexFormat = new VertexFormat(device, vertexDesc);

  // check whether source data is correctly interleaved
  let isCorrectlyInterleaved = true;
  for (i = 0; i < vertexFormat.elements.length; ++i) {
    target = vertexFormat.elements[i];
    source = sourceDesc[target.name];
    sourceOffset = source.offset - positionDesc.offset;
    if (source.buffer !== positionDesc.buffer || source.stride !== target.stride || source.size !== target.size || sourceOffset !== target.offset) {
      isCorrectlyInterleaved = false;
      break;
    }
  }

  // create vertex buffer
  const vertexBuffer = new VertexBuffer(device, vertexFormat, numVertices, BUFFER_STATIC);
  const vertexData = vertexBuffer.lock();
  const targetArray = new Uint32Array(vertexData);
  let sourceArray;
  if (isCorrectlyInterleaved) {
    // copy data
    sourceArray = new Uint32Array(positionDesc.buffer, positionDesc.offset, numVertices * vertexBuffer.format.size / 4);
    targetArray.set(sourceArray);
  } else {
    let targetStride, sourceStride;
    // copy data and interleave
    for (i = 0; i < vertexBuffer.format.elements.length; ++i) {
      target = vertexBuffer.format.elements[i];
      targetStride = target.stride / 4;
      source = sourceDesc[target.name];
      sourceStride = source.stride / 4;
      // ensure we don't go beyond the end of the arraybuffer when dealing with
      // interlaced vertex formats
      sourceArray = new Uint32Array(source.buffer, source.offset, (source.count - 1) * sourceStride + (source.size + 3) / 4);
      let src = 0;
      let dst = target.offset / 4;
      const kend = Math.floor((source.size + 3) / 4);
      for (j = 0; j < numVertices; ++j) {
        for (k = 0; k < kend; ++k) {
          targetArray[dst + k] = sourceArray[src + k];
        }
        src += sourceStride;
        dst += targetStride;
      }
    }
  }
  if (flipV) {
    flipTexCoordVs(vertexBuffer);
  }
  vertexBuffer.unlock();
  return vertexBuffer;
};
const createVertexBuffer = (device, attributes, indices, accessors, bufferViews, flipV, vertexBufferDict) => {
  // extract list of attributes to use
  const useAttributes = {};
  const attribIds = [];
  for (const attrib in attributes) {
    if (attributes.hasOwnProperty(attrib) && gltfToEngineSemanticMap.hasOwnProperty(attrib)) {
      useAttributes[attrib] = attributes[attrib];

      // build unique id for each attribute in format: Semantic:accessorIndex
      attribIds.push(attrib + ':' + attributes[attrib]);
    }
  }

  // sort unique ids and create unique vertex buffer ID
  attribIds.sort();
  const vbKey = attribIds.join();

  // return already created vertex buffer if identical
  let vb = vertexBufferDict[vbKey];
  if (!vb) {
    // build vertex buffer format desc and source
    const sourceDesc = {};
    for (const attrib in useAttributes) {
      const accessor = accessors[attributes[attrib]];
      const accessorData = getAccessorData(accessor, bufferViews);
      const bufferView = bufferViews[accessor.bufferView];
      const semantic = gltfToEngineSemanticMap[attrib];
      const size = getNumComponents(accessor.type) * getComponentSizeInBytes(accessor.componentType);
      const stride = bufferView && bufferView.hasOwnProperty('byteStride') ? bufferView.byteStride : size;
      sourceDesc[semantic] = {
        buffer: accessorData.buffer,
        size: size,
        offset: accessorData.byteOffset,
        stride: stride,
        count: accessor.count,
        components: getNumComponents(accessor.type),
        type: getComponentType(accessor.componentType),
        normalize: accessor.normalized
      };
    }

    // generate normals if they're missing (this should probably be a user option)
    if (!sourceDesc.hasOwnProperty(SEMANTIC_NORMAL)) {
      generateNormals(sourceDesc, indices);
    }

    // create and store it in the dictionary
    vb = createVertexBufferInternal(device, sourceDesc, flipV);
    vertexBufferDict[vbKey] = vb;
  }
  return vb;
};
const createSkin = (device, gltfSkin, accessors, bufferViews, nodes, glbSkins) => {
  let i, j, bindMatrix;
  const joints = gltfSkin.joints;
  const numJoints = joints.length;
  const ibp = [];
  if (gltfSkin.hasOwnProperty('inverseBindMatrices')) {
    const inverseBindMatrices = gltfSkin.inverseBindMatrices;
    const ibmData = getAccessorData(accessors[inverseBindMatrices], bufferViews, true);
    const ibmValues = [];
    for (i = 0; i < numJoints; i++) {
      for (j = 0; j < 16; j++) {
        ibmValues[j] = ibmData[i * 16 + j];
      }
      bindMatrix = new Mat4();
      bindMatrix.set(ibmValues);
      ibp.push(bindMatrix);
    }
  } else {
    for (i = 0; i < numJoints; i++) {
      bindMatrix = new Mat4();
      ibp.push(bindMatrix);
    }
  }
  const boneNames = [];
  for (i = 0; i < numJoints; i++) {
    boneNames[i] = nodes[joints[i]].name;
  }

  // create a cache key from bone names and see if we have matching skin
  const key = boneNames.join('#');
  let skin = glbSkins.get(key);
  if (!skin) {
    // create the skin and add it to the cache
    skin = new Skin(device, ibp, boneNames);
    glbSkins.set(key, skin);
  }
  return skin;
};
const createDracoMesh = (device, primitive, accessors, bufferViews, meshVariants, meshDefaultMaterials, promises) => {
  var _primitive$extensions;
  // create the mesh
  const result = new Mesh(device);
  result.aabb = getAccessorBoundingBox(accessors[primitive.attributes.POSITION]);

  // create vertex description
  const vertexDesc = [];
  for (const [name, index] of Object.entries(primitive.attributes)) {
    var _accessor$normalized;
    const accessor = accessors[index];
    const semantic = gltfToEngineSemanticMap[name];
    const componentType = getComponentType(accessor.componentType);
    vertexDesc.push({
      semantic: semantic,
      components: getNumComponents(accessor.type),
      type: componentType,
      normalize: (_accessor$normalized = accessor.normalized) != null ? _accessor$normalized : semantic === SEMANTIC_COLOR && (componentType === TYPE_UINT8 || componentType === TYPE_UINT16)
    });
  }
  promises.push(new Promise((resolve, reject) => {
    // decode draco data
    const dracoExt = primitive.extensions.KHR_draco_mesh_compression;
    dracoDecode(bufferViews[dracoExt.bufferView].slice().buffer, (err, decompressedData) => {
      if (err) {
        console.log(err);
        reject(err);
      } else {
        var _primitive$attributes;
        // worker reports order of attributes as array of attribute unique_id
        const order = {};
        for (const [name, index] of Object.entries(dracoExt.attributes)) {
          order[gltfToEngineSemanticMap[name]] = decompressedData.attributes.indexOf(index);
        }

        // order vertexDesc
        vertexDesc.sort((a, b) => {
          return order[a.semantic] - order[b.semantic];
        });

        // draco decompressor will generate normals if they are missing
        if (!((_primitive$attributes = primitive.attributes) != null && _primitive$attributes.NORMAL)) {
          vertexDesc.splice(1, 0, {
            semantic: 'NORMAL',
            components: 3,
            type: TYPE_FLOAT32
          });
        }
        const vertexFormat = new VertexFormat(device, vertexDesc);

        // create vertex buffer
        const numVertices = decompressedData.vertices.byteLength / vertexFormat.size;
        const indexFormat = numVertices <= 65535 ? INDEXFORMAT_UINT16 : INDEXFORMAT_UINT32;
        const numIndices = decompressedData.indices.byteLength / (numVertices <= 65535 ? 2 : 4);
        Debug.call(() => {
          if (numVertices !== accessors[primitive.attributes.POSITION].count) {
            Debug.warn('mesh has invalid vertex count');
          }
          if (numIndices !== accessors[primitive.indices].count) {
            Debug.warn('mesh has invalid index count');
          }
        });
        const vertexBuffer = new VertexBuffer(device, vertexFormat, numVertices, BUFFER_STATIC, decompressedData.vertices);
        const indexBuffer = new IndexBuffer(device, indexFormat, numIndices, BUFFER_STATIC, decompressedData.indices);
        result.vertexBuffer = vertexBuffer;
        result.indexBuffer[0] = indexBuffer;
        result.primitive[0].type = getPrimitiveType(primitive);
        result.primitive[0].base = 0;
        result.primitive[0].count = indexBuffer ? numIndices : numVertices;
        result.primitive[0].indexed = !!indexBuffer;
        resolve();
      }
    });
  }));

  // handle material variants
  if (primitive != null && (_primitive$extensions = primitive.extensions) != null && _primitive$extensions.KHR_materials_variants) {
    const variants = primitive.extensions.KHR_materials_variants;
    const tempMapping = {};
    variants.mappings.forEach(mapping => {
      mapping.variants.forEach(variant => {
        tempMapping[variant] = mapping.material;
      });
    });
    meshVariants[result.id] = tempMapping;
  }
  meshDefaultMaterials[result.id] = primitive.material;
  return result;
};
const createMesh = (device, gltfMesh, accessors, bufferViews, flipV, vertexBufferDict, meshVariants, meshDefaultMaterials, assetOptions, promises) => {
  const meshes = [];
  gltfMesh.primitives.forEach(primitive => {
    var _primitive$extensions2;
    if ((_primitive$extensions2 = primitive.extensions) != null && _primitive$extensions2.KHR_draco_mesh_compression) {
      // handle draco compressed mesh
      meshes.push(createDracoMesh(device, primitive, accessors, bufferViews, meshVariants, meshDefaultMaterials, promises));
    } else {
      // handle uncompressed mesh
      let indices = primitive.hasOwnProperty('indices') ? getAccessorData(accessors[primitive.indices], bufferViews, true) : null;
      const vertexBuffer = createVertexBuffer(device, primitive.attributes, indices, accessors, bufferViews, flipV, vertexBufferDict);
      const primitiveType = getPrimitiveType(primitive);

      // build the mesh
      const mesh = new Mesh(device);
      mesh.vertexBuffer = vertexBuffer;
      mesh.primitive[0].type = primitiveType;
      mesh.primitive[0].base = 0;
      mesh.primitive[0].indexed = indices !== null;

      // index buffer
      if (indices !== null) {
        let indexFormat;
        if (indices instanceof Uint8Array) {
          indexFormat = INDEXFORMAT_UINT8;
        } else if (indices instanceof Uint16Array) {
          indexFormat = INDEXFORMAT_UINT16;
        } else {
          indexFormat = INDEXFORMAT_UINT32;
        }

        // 32bit index buffer is used but not supported
        if (indexFormat === INDEXFORMAT_UINT32 && !device.extUintElement) {
          if (vertexBuffer.numVertices > 0xFFFF) {
            console.warn('Glb file contains 32bit index buffer but these are not supported by this device - it may be rendered incorrectly.');
          }

          // convert to 16bit
          indexFormat = INDEXFORMAT_UINT16;
          indices = new Uint16Array(indices);
        }
        if (indexFormat === INDEXFORMAT_UINT8 && device.isWebGPU) {
          Debug.warn('Glb file contains 8bit index buffer but these are not supported by WebGPU - converting to 16bit.');

          // convert to 16bit
          indexFormat = INDEXFORMAT_UINT16;
          indices = new Uint16Array(indices);
        }
        const indexBuffer = new IndexBuffer(device, indexFormat, indices.length, BUFFER_STATIC, indices);
        mesh.indexBuffer[0] = indexBuffer;
        mesh.primitive[0].count = indices.length;
      } else {
        mesh.primitive[0].count = vertexBuffer.numVertices;
      }
      if (primitive.hasOwnProperty("extensions") && primitive.extensions.hasOwnProperty("KHR_materials_variants")) {
        const variants = primitive.extensions.KHR_materials_variants;
        const tempMapping = {};
        variants.mappings.forEach(mapping => {
          mapping.variants.forEach(variant => {
            tempMapping[variant] = mapping.material;
          });
        });
        meshVariants[mesh.id] = tempMapping;
      }
      meshDefaultMaterials[mesh.id] = primitive.material;
      let accessor = accessors[primitive.attributes.POSITION];
      mesh.aabb = getAccessorBoundingBox(accessor);

      // morph targets
      if (primitive.hasOwnProperty('targets')) {
        const targets = [];
        primitive.targets.forEach((target, index) => {
          const options = {};
          if (target.hasOwnProperty('POSITION')) {
            accessor = accessors[target.POSITION];
            options.deltaPositions = getAccessorDataFloat32(accessor, bufferViews);
            options.deltaPositionsType = TYPE_FLOAT32;
            options.aabb = getAccessorBoundingBox(accessor);
          }
          if (target.hasOwnProperty('NORMAL')) {
            accessor = accessors[target.NORMAL];
            // NOTE: the morph targets can't currently accept quantized normals
            options.deltaNormals = getAccessorDataFloat32(accessor, bufferViews);
            options.deltaNormalsType = TYPE_FLOAT32;
          }

          // name if specified
          if (gltfMesh.hasOwnProperty('extras') && gltfMesh.extras.hasOwnProperty('targetNames')) {
            options.name = gltfMesh.extras.targetNames[index];
          } else {
            options.name = index.toString(10);
          }

          // default weight if specified
          if (gltfMesh.hasOwnProperty('weights')) {
            options.defaultWeight = gltfMesh.weights[index];
          }
          options.preserveData = assetOptions.morphPreserveData;
          targets.push(new MorphTarget(options));
        });
        mesh.morph = new Morph(targets, device, {
          preferHighPrecision: assetOptions.morphPreferHighPrecision
        });
      }
      meshes.push(mesh);
    }
  });
  return meshes;
};
const extractTextureTransform = (source, material, maps) => {
  var _source$extensions;
  let map;
  const texCoord = source.texCoord;
  if (texCoord) {
    for (map = 0; map < maps.length; ++map) {
      material[maps[map] + 'MapUv'] = texCoord;
    }
  }
  const zeros = [0, 0];
  const ones = [1, 1];
  const textureTransform = (_source$extensions = source.extensions) == null ? void 0 : _source$extensions.KHR_texture_transform;
  if (textureTransform) {
    const offset = textureTransform.offset || zeros;
    const scale = textureTransform.scale || ones;
    const rotation = textureTransform.rotation ? -textureTransform.rotation * math.RAD_TO_DEG : 0;
    const tilingVec = new Vec2(scale[0], scale[1]);
    const offsetVec = new Vec2(offset[0], 1.0 - scale[1] - offset[1]);
    for (map = 0; map < maps.length; ++map) {
      material[`${maps[map]}MapTiling`] = tilingVec;
      material[`${maps[map]}MapOffset`] = offsetVec;
      material[`${maps[map]}MapRotation`] = rotation;
    }
  }
};
const extensionPbrSpecGlossiness = (data, material, textures) => {
  let color, texture;
  if (data.hasOwnProperty('diffuseFactor')) {
    color = data.diffuseFactor;
    // Convert from linear space to sRGB space
    material.diffuse.set(Math.pow(color[0], 1 / 2.2), Math.pow(color[1], 1 / 2.2), Math.pow(color[2], 1 / 2.2));
    material.opacity = color[3];
  } else {
    material.diffuse.set(1, 1, 1);
    material.opacity = 1;
  }
  if (data.hasOwnProperty('diffuseTexture')) {
    const diffuseTexture = data.diffuseTexture;
    texture = textures[diffuseTexture.index];
    material.diffuseMap = texture;
    material.diffuseMapChannel = 'rgb';
    material.opacityMap = texture;
    material.opacityMapChannel = 'a';
    extractTextureTransform(diffuseTexture, material, ['diffuse', 'opacity']);
  }
  material.useMetalness = false;
  if (data.hasOwnProperty('specularFactor')) {
    color = data.specularFactor;
    // Convert from linear space to sRGB space
    material.specular.set(Math.pow(color[0], 1 / 2.2), Math.pow(color[1], 1 / 2.2), Math.pow(color[2], 1 / 2.2));
  } else {
    material.specular.set(1, 1, 1);
  }
  if (data.hasOwnProperty('glossinessFactor')) {
    material.gloss = data.glossinessFactor;
  } else {
    material.gloss = 1.0;
  }
  if (data.hasOwnProperty('specularGlossinessTexture')) {
    const specularGlossinessTexture = data.specularGlossinessTexture;
    material.specularEncoding = 'srgb';
    material.specularMap = material.glossMap = textures[specularGlossinessTexture.index];
    material.specularMapChannel = 'rgb';
    material.glossMapChannel = 'a';
    extractTextureTransform(specularGlossinessTexture, material, ['gloss', 'metalness']);
  }
};
const extensionClearCoat = (data, material, textures) => {
  if (data.hasOwnProperty('clearcoatFactor')) {
    material.clearCoat = data.clearcoatFactor * 0.25; // TODO: remove temporary workaround for replicating glTF clear-coat visuals
  } else {
    material.clearCoat = 0;
  }
  if (data.hasOwnProperty('clearcoatTexture')) {
    const clearcoatTexture = data.clearcoatTexture;
    material.clearCoatMap = textures[clearcoatTexture.index];
    material.clearCoatMapChannel = 'r';
    extractTextureTransform(clearcoatTexture, material, ['clearCoat']);
  }
  if (data.hasOwnProperty('clearcoatRoughnessFactor')) {
    material.clearCoatGloss = data.clearcoatRoughnessFactor;
  } else {
    material.clearCoatGloss = 0;
  }
  if (data.hasOwnProperty('clearcoatRoughnessTexture')) {
    const clearcoatRoughnessTexture = data.clearcoatRoughnessTexture;
    material.clearCoatGlossMap = textures[clearcoatRoughnessTexture.index];
    material.clearCoatGlossMapChannel = 'g';
    extractTextureTransform(clearcoatRoughnessTexture, material, ['clearCoatGloss']);
  }
  if (data.hasOwnProperty('clearcoatNormalTexture')) {
    const clearcoatNormalTexture = data.clearcoatNormalTexture;
    material.clearCoatNormalMap = textures[clearcoatNormalTexture.index];
    extractTextureTransform(clearcoatNormalTexture, material, ['clearCoatNormal']);
    if (clearcoatNormalTexture.hasOwnProperty('scale')) {
      material.clearCoatBumpiness = clearcoatNormalTexture.scale;
    }
  }
  material.clearCoatGlossInvert = true;
};
const extensionUnlit = (data, material, textures) => {
  material.useLighting = false;

  // copy diffuse into emissive
  material.emissive.copy(material.diffuse);
  material.emissiveTint = material.diffuseTint;
  material.emissiveMap = material.diffuseMap;
  material.emissiveMapUv = material.diffuseMapUv;
  material.emissiveMapTiling.copy(material.diffuseMapTiling);
  material.emissiveMapOffset.copy(material.diffuseMapOffset);
  material.emissiveMapRotation = material.diffuseMapRotation;
  material.emissiveMapChannel = material.diffuseMapChannel;
  material.emissiveVertexColor = material.diffuseVertexColor;
  material.emissiveVertexColorChannel = material.diffuseVertexColorChannel;

  // disable lighting and skybox
  material.useLighting = false;
  material.useSkybox = false;

  // blank diffuse
  material.diffuse.set(0, 0, 0);
  material.diffuseTint = false;
  material.diffuseMap = null;
  material.diffuseVertexColor = false;
};
const extensionSpecular = (data, material, textures) => {
  material.useMetalnessSpecularColor = true;
  if (data.hasOwnProperty('specularColorTexture')) {
    material.specularEncoding = 'srgb';
    material.specularMap = textures[data.specularColorTexture.index];
    material.specularMapChannel = 'rgb';
    extractTextureTransform(data.specularColorTexture, material, ['specular']);
  }
  if (data.hasOwnProperty('specularColorFactor')) {
    const color = data.specularColorFactor;
    material.specular.set(Math.pow(color[0], 1 / 2.2), Math.pow(color[1], 1 / 2.2), Math.pow(color[2], 1 / 2.2));
  } else {
    material.specular.set(1, 1, 1);
  }
  if (data.hasOwnProperty('specularFactor')) {
    material.specularityFactor = data.specularFactor;
  } else {
    material.specularityFactor = 1;
  }
  if (data.hasOwnProperty('specularTexture')) {
    material.specularityFactorMapChannel = 'a';
    material.specularityFactorMap = textures[data.specularTexture.index];
    extractTextureTransform(data.specularTexture, material, ['specularityFactor']);
  }
};
const extensionIor = (data, material, textures) => {
  if (data.hasOwnProperty('ior')) {
    material.refractionIndex = 1.0 / data.ior;
  }
};
const extensionTransmission = (data, material, textures) => {
  material.blendType = BLEND_NORMAL;
  material.useDynamicRefraction = true;
  if (data.hasOwnProperty('transmissionFactor')) {
    material.refraction = data.transmissionFactor;
  }
  if (data.hasOwnProperty('transmissionTexture')) {
    material.refractionMapChannel = 'r';
    material.refractionMap = textures[data.transmissionTexture.index];
    extractTextureTransform(data.transmissionTexture, material, ['refraction']);
  }
};
const extensionSheen = (data, material, textures) => {
  material.useSheen = true;
  if (data.hasOwnProperty('sheenColorFactor')) {
    const color = data.sheenColorFactor;
    material.sheen.set(Math.pow(color[0], 1 / 2.2), Math.pow(color[1], 1 / 2.2), Math.pow(color[2], 1 / 2.2));
  } else {
    material.sheen.set(1, 1, 1);
  }
  if (data.hasOwnProperty('sheenColorTexture')) {
    material.sheenMap = textures[data.sheenColorTexture.index];
    material.sheenEncoding = 'srgb';
    extractTextureTransform(data.sheenColorTexture, material, ['sheen']);
  }
  if (data.hasOwnProperty('sheenRoughnessFactor')) {
    material.sheenGloss = data.sheenRoughnessFactor;
  } else {
    material.sheenGloss = 0.0;
  }
  if (data.hasOwnProperty('sheenRoughnessTexture')) {
    material.sheenGlossMap = textures[data.sheenRoughnessTexture.index];
    material.sheenGlossMapChannel = 'a';
    extractTextureTransform(data.sheenRoughnessTexture, material, ['sheenGloss']);
  }
  material.sheenGlossInvert = true;
};
const extensionVolume = (data, material, textures) => {
  material.blendType = BLEND_NORMAL;
  material.useDynamicRefraction = true;
  if (data.hasOwnProperty('thicknessFactor')) {
    material.thickness = data.thicknessFactor;
  }
  if (data.hasOwnProperty('thicknessTexture')) {
    material.thicknessMap = textures[data.thicknessTexture.index];
    material.thicknessMapChannel = 'g';
    extractTextureTransform(data.thicknessTexture, material, ['thickness']);
  }
  if (data.hasOwnProperty('attenuationDistance')) {
    material.attenuationDistance = data.attenuationDistance;
  }
  if (data.hasOwnProperty('attenuationColor')) {
    const color = data.attenuationColor;
    material.attenuation.set(Math.pow(color[0], 1 / 2.2), Math.pow(color[1], 1 / 2.2), Math.pow(color[2], 1 / 2.2));
  }
};
const extensionEmissiveStrength = (data, material, textures) => {
  if (data.hasOwnProperty('emissiveStrength')) {
    material.emissiveIntensity = data.emissiveStrength;
  }
};
const extensionIridescence = (data, material, textures) => {
  material.useIridescence = true;
  if (data.hasOwnProperty('iridescenceFactor')) {
    material.iridescence = data.iridescenceFactor;
  }
  if (data.hasOwnProperty('iridescenceTexture')) {
    material.iridescenceMapChannel = 'r';
    material.iridescenceMap = textures[data.iridescenceTexture.index];
    extractTextureTransform(data.iridescenceTexture, material, ['iridescence']);
  }
  if (data.hasOwnProperty('iridescenceIor')) {
    material.iridescenceRefractionIndex = data.iridescenceIor;
  }
  if (data.hasOwnProperty('iridescenceThicknessMinimum')) {
    material.iridescenceThicknessMin = data.iridescenceThicknessMinimum;
  }
  if (data.hasOwnProperty('iridescenceThicknessMaximum')) {
    material.iridescenceThicknessMax = data.iridescenceThicknessMaximum;
  }
  if (data.hasOwnProperty('iridescenceThicknessTexture')) {
    material.iridescenceThicknessMapChannel = 'g';
    material.iridescenceThicknessMap = textures[data.iridescenceThicknessTexture.index];
    extractTextureTransform(data.iridescenceThicknessTexture, material, ['iridescenceThickness']);
  }
};
const createMaterial = (gltfMaterial, textures, flipV) => {
  const material = new StandardMaterial();

  // glTF doesn't define how to occlude specular
  material.occludeSpecular = SPECOCC_AO;
  material.diffuseTint = true;
  material.diffuseVertexColor = true;
  material.specularTint = true;
  material.specularVertexColor = true;
  if (gltfMaterial.hasOwnProperty('name')) {
    material.name = gltfMaterial.name;
  }
  let color, texture;
  if (gltfMaterial.hasOwnProperty('pbrMetallicRoughness')) {
    const pbrData = gltfMaterial.pbrMetallicRoughness;
    if (pbrData.hasOwnProperty('baseColorFactor')) {
      color = pbrData.baseColorFactor;
      // Convert from linear space to sRGB space
      material.diffuse.set(Math.pow(color[0], 1 / 2.2), Math.pow(color[1], 1 / 2.2), Math.pow(color[2], 1 / 2.2));
      material.opacity = color[3];
    } else {
      material.diffuse.set(1, 1, 1);
      material.opacity = 1;
    }
    if (pbrData.hasOwnProperty('baseColorTexture')) {
      const baseColorTexture = pbrData.baseColorTexture;
      texture = textures[baseColorTexture.index];
      material.diffuseMap = texture;
      material.diffuseMapChannel = 'rgb';
      material.opacityMap = texture;
      material.opacityMapChannel = 'a';
      extractTextureTransform(baseColorTexture, material, ['diffuse', 'opacity']);
    }
    material.useMetalness = true;
    material.specular.set(1, 1, 1);
    if (pbrData.hasOwnProperty('metallicFactor')) {
      material.metalness = pbrData.metallicFactor;
    } else {
      material.metalness = 1;
    }
    if (pbrData.hasOwnProperty('roughnessFactor')) {
      material.gloss = pbrData.roughnessFactor;
    } else {
      material.gloss = 1;
    }
    material.glossInvert = true;
    if (pbrData.hasOwnProperty('metallicRoughnessTexture')) {
      const metallicRoughnessTexture = pbrData.metallicRoughnessTexture;
      material.metalnessMap = material.glossMap = textures[metallicRoughnessTexture.index];
      material.metalnessMapChannel = 'b';
      material.glossMapChannel = 'g';
      extractTextureTransform(metallicRoughnessTexture, material, ['gloss', 'metalness']);
    }
  }
  if (gltfMaterial.hasOwnProperty('normalTexture')) {
    const normalTexture = gltfMaterial.normalTexture;
    material.normalMap = textures[normalTexture.index];
    extractTextureTransform(normalTexture, material, ['normal']);
    if (normalTexture.hasOwnProperty('scale')) {
      material.bumpiness = normalTexture.scale;
    }
  }
  if (gltfMaterial.hasOwnProperty('occlusionTexture')) {
    const occlusionTexture = gltfMaterial.occlusionTexture;
    material.aoMap = textures[occlusionTexture.index];
    material.aoMapChannel = 'r';
    extractTextureTransform(occlusionTexture, material, ['ao']);
    // TODO: support 'strength'
  }

  if (gltfMaterial.hasOwnProperty('emissiveFactor')) {
    color = gltfMaterial.emissiveFactor;
    // Convert from linear space to sRGB space
    material.emissive.set(Math.pow(color[0], 1 / 2.2), Math.pow(color[1], 1 / 2.2), Math.pow(color[2], 1 / 2.2));
    material.emissiveTint = true;
  } else {
    material.emissive.set(0, 0, 0);
    material.emissiveTint = false;
  }
  if (gltfMaterial.hasOwnProperty('emissiveTexture')) {
    const emissiveTexture = gltfMaterial.emissiveTexture;
    material.emissiveMap = textures[emissiveTexture.index];
    extractTextureTransform(emissiveTexture, material, ['emissive']);
  }
  if (gltfMaterial.hasOwnProperty('alphaMode')) {
    switch (gltfMaterial.alphaMode) {
      case 'MASK':
        material.blendType = BLEND_NONE;
        if (gltfMaterial.hasOwnProperty('alphaCutoff')) {
          material.alphaTest = gltfMaterial.alphaCutoff;
        } else {
          material.alphaTest = 0.5;
        }
        break;
      case 'BLEND':
        material.blendType = BLEND_NORMAL;
        // note: by default don't write depth on semitransparent materials
        material.depthWrite = false;
        break;
      default:
      case 'OPAQUE':
        material.blendType = BLEND_NONE;
        break;
    }
  } else {
    material.blendType = BLEND_NONE;
  }
  if (gltfMaterial.hasOwnProperty('doubleSided')) {
    material.twoSidedLighting = gltfMaterial.doubleSided;
    material.cull = gltfMaterial.doubleSided ? CULLFACE_NONE : CULLFACE_BACK;
  } else {
    material.twoSidedLighting = false;
    material.cull = CULLFACE_BACK;
  }

  // Provide list of supported extensions and their functions
  const extensions = {
    "KHR_materials_clearcoat": extensionClearCoat,
    "KHR_materials_emissive_strength": extensionEmissiveStrength,
    "KHR_materials_ior": extensionIor,
    "KHR_materials_iridescence": extensionIridescence,
    "KHR_materials_pbrSpecularGlossiness": extensionPbrSpecGlossiness,
    "KHR_materials_sheen": extensionSheen,
    "KHR_materials_specular": extensionSpecular,
    "KHR_materials_transmission": extensionTransmission,
    "KHR_materials_unlit": extensionUnlit,
    "KHR_materials_volume": extensionVolume
  };

  // Handle extensions
  if (gltfMaterial.hasOwnProperty('extensions')) {
    for (const key in gltfMaterial.extensions) {
      const extensionFunc = extensions[key];
      if (extensionFunc !== undefined) {
        extensionFunc(gltfMaterial.extensions[key], material, textures);
      }
    }
  }
  material.update();
  return material;
};

// create the anim structure
const createAnimation = (gltfAnimation, animationIndex, gltfAccessors, bufferViews, nodes, meshes, gltfNodes) => {
  // create animation data block for the accessor
  const createAnimData = gltfAccessor => {
    return new AnimData(getNumComponents(gltfAccessor.type), getAccessorDataFloat32(gltfAccessor, bufferViews));
  };
  const interpMap = {
    'STEP': INTERPOLATION_STEP,
    'LINEAR': INTERPOLATION_LINEAR,
    'CUBICSPLINE': INTERPOLATION_CUBIC
  };

  // Input and output maps reference data by sampler input/output key.
  const inputMap = {};
  const outputMap = {};
  // The curve map stores temporary curve data by sampler index. Each curves input/output value will be resolved to an inputs/outputs array index after all samplers have been processed.
  // Curves and outputs that are deleted from their maps will not be included in the final AnimTrack
  const curveMap = {};
  let outputCounter = 1;
  let i;

  // convert samplers
  for (i = 0; i < gltfAnimation.samplers.length; ++i) {
    const sampler = gltfAnimation.samplers[i];

    // get input data
    if (!inputMap.hasOwnProperty(sampler.input)) {
      inputMap[sampler.input] = createAnimData(gltfAccessors[sampler.input]);
    }

    // get output data
    if (!outputMap.hasOwnProperty(sampler.output)) {
      outputMap[sampler.output] = createAnimData(gltfAccessors[sampler.output]);
    }
    const interpolation = sampler.hasOwnProperty('interpolation') && interpMap.hasOwnProperty(sampler.interpolation) ? interpMap[sampler.interpolation] : INTERPOLATION_LINEAR;

    // create curve
    const curve = {
      paths: [],
      input: sampler.input,
      output: sampler.output,
      interpolation: interpolation
    };
    curveMap[i] = curve;
  }
  const quatArrays = [];
  const transformSchema = {
    'translation': 'localPosition',
    'rotation': 'localRotation',
    'scale': 'localScale'
  };
  const constructNodePath = node => {
    const path = [];
    while (node) {
      path.unshift(node.name);
      node = node.parent;
    }
    return path;
  };

  // All morph targets are included in a single channel of the animation, with all targets output data interleaved with each other.
  // This function splits each morph target out into it a curve with its own output data, allowing us to animate each morph target independently by name.
  const createMorphTargetCurves = (curve, gltfNode, entityPath) => {
    const out = outputMap[curve.output];
    if (!out) {
      Debug.warn(`glb-parser: No output data is available for the morph target curve (${entityPath}/graph/weights). Skipping.`);
      return;
    }

    // names of morph targets
    let targetNames;
    if (meshes && meshes[gltfNode.mesh]) {
      const mesh = meshes[gltfNode.mesh];
      if (mesh.hasOwnProperty('extras') && mesh.extras.hasOwnProperty('targetNames')) {
        targetNames = mesh.extras.targetNames;
      }
    }
    const outData = out.data;
    const morphTargetCount = outData.length / inputMap[curve.input].data.length;
    const keyframeCount = outData.length / morphTargetCount;

    // single array buffer for all keys, 4 bytes per entry
    const singleBufferSize = keyframeCount * 4;
    const buffer = new ArrayBuffer(singleBufferSize * morphTargetCount);
    for (let j = 0; j < morphTargetCount; j++) {
      var _targetNames;
      const morphTargetOutput = new Float32Array(buffer, singleBufferSize * j, keyframeCount);

      // the output data for all morph targets in a single curve is interleaved. We need to retrieve the keyframe output data for a single morph target
      for (let k = 0; k < keyframeCount; k++) {
        morphTargetOutput[k] = outData[k * morphTargetCount + j];
      }
      const output = new AnimData(1, morphTargetOutput);
      const weightName = (_targetNames = targetNames) != null && _targetNames[j] ? `name.${targetNames[j]}` : j;

      // add the individual morph target output data to the outputMap using a negative value key (so as not to clash with sampler.output values)
      outputMap[-outputCounter] = output;
      const morphCurve = {
        paths: [{
          entityPath: entityPath,
          component: 'graph',
          propertyPath: [`weight.${weightName}`]
        }],
        // each morph target curve input can use the same sampler.input from the channel they were all in
        input: curve.input,
        // but each morph target curve should reference its individual output that was just created
        output: -outputCounter,
        interpolation: curve.interpolation
      };
      outputCounter++;
      // add the morph target curve to the curveMap
      curveMap[`morphCurve-${i}-${j}`] = morphCurve;
    }
  };

  // convert anim channels
  for (i = 0; i < gltfAnimation.channels.length; ++i) {
    const channel = gltfAnimation.channels[i];
    const target = channel.target;
    const curve = curveMap[channel.sampler];
    const node = nodes[target.node];
    const gltfNode = gltfNodes[target.node];
    const entityPath = constructNodePath(node);
    if (target.path.startsWith('weights')) {
      createMorphTargetCurves(curve, gltfNode, entityPath);
      // as all individual morph targets in this morph curve have their own curve now, this morph curve should be flagged
      // so it's not included in the final output
      curveMap[channel.sampler].morphCurve = true;
    } else {
      curve.paths.push({
        entityPath: entityPath,
        component: 'graph',
        propertyPath: [transformSchema[target.path]]
      });
    }
  }
  const inputs = [];
  const outputs = [];
  const curves = [];

  // Add each input in the map to the final inputs array. The inputMap should now reference the index of input in the inputs array instead of the input itself.
  for (const inputKey in inputMap) {
    inputs.push(inputMap[inputKey]);
    inputMap[inputKey] = inputs.length - 1;
  }
  // Add each output in the map to the final outputs array. The outputMap should now reference the index of output in the outputs array instead of the output itself.
  for (const outputKey in outputMap) {
    outputs.push(outputMap[outputKey]);
    outputMap[outputKey] = outputs.length - 1;
  }
  // Create an AnimCurve for each curve object in the curveMap. Each curve object's input value should be resolved to the index of the input in the
  // inputs arrays using the inputMap. Likewise for output values.
  for (const curveKey in curveMap) {
    const curveData = curveMap[curveKey];
    // if the curveData contains a morph curve then do not add it to the final curve list as the individual morph target curves are included instead
    if (curveData.morphCurve) {
      continue;
    }
    curves.push(new AnimCurve(curveData.paths, inputMap[curveData.input], outputMap[curveData.output], curveData.interpolation));

    // if this target is a set of quaternion keys, make note of its index so we can perform
    // quaternion-specific processing on it.
    if (curveData.paths.length > 0 && curveData.paths[0].propertyPath[0] === 'localRotation' && curveData.interpolation !== INTERPOLATION_CUBIC) {
      quatArrays.push(curves[curves.length - 1].output);
    }
  }

  // sort the list of array indexes so we can skip dups
  quatArrays.sort();

  // run through the quaternion data arrays flipping quaternion keys
  // that don't fall in the same winding order.
  let prevIndex = null;
  let data;
  for (i = 0; i < quatArrays.length; ++i) {
    const index = quatArrays[i];
    // skip over duplicate array indices
    if (i === 0 || index !== prevIndex) {
      data = outputs[index];
      if (data.components === 4) {
        const d = data.data;
        const len = d.length - 4;
        for (let j = 0; j < len; j += 4) {
          const dp = d[j + 0] * d[j + 4] + d[j + 1] * d[j + 5] + d[j + 2] * d[j + 6] + d[j + 3] * d[j + 7];
          if (dp < 0) {
            d[j + 4] *= -1;
            d[j + 5] *= -1;
            d[j + 6] *= -1;
            d[j + 7] *= -1;
          }
        }
      }
      prevIndex = index;
    }
  }

  // calculate duration of the animation as maximum time value
  let duration = 0;
  for (i = 0; i < inputs.length; i++) {
    data = inputs[i]._data;
    duration = Math.max(duration, data.length === 0 ? 0 : data[data.length - 1]);
  }
  return new AnimTrack(gltfAnimation.hasOwnProperty('name') ? gltfAnimation.name : 'animation_' + animationIndex, duration, inputs, outputs, curves);
};
const tempMat = new Mat4();
const tempVec = new Vec3();
const createNode = (gltfNode, nodeIndex) => {
  const entity = new GraphNode();
  if (gltfNode.hasOwnProperty('name') && gltfNode.name.length > 0) {
    entity.name = gltfNode.name;
  } else {
    entity.name = 'node_' + nodeIndex;
  }

  // Parse transformation properties
  if (gltfNode.hasOwnProperty('matrix')) {
    tempMat.data.set(gltfNode.matrix);
    tempMat.getTranslation(tempVec);
    entity.setLocalPosition(tempVec);
    tempMat.getEulerAngles(tempVec);
    entity.setLocalEulerAngles(tempVec);
    tempMat.getScale(tempVec);
    entity.setLocalScale(tempVec);
  }
  if (gltfNode.hasOwnProperty('rotation')) {
    const r = gltfNode.rotation;
    entity.setLocalRotation(r[0], r[1], r[2], r[3]);
  }
  if (gltfNode.hasOwnProperty('translation')) {
    const t = gltfNode.translation;
    entity.setLocalPosition(t[0], t[1], t[2]);
  }
  if (gltfNode.hasOwnProperty('scale')) {
    const s = gltfNode.scale;
    entity.setLocalScale(s[0], s[1], s[2]);
  }
  return entity;
};

// creates a camera component on the supplied node, and returns it
const createCamera = (gltfCamera, node) => {
  const projection = gltfCamera.type === 'orthographic' ? PROJECTION_ORTHOGRAPHIC : PROJECTION_PERSPECTIVE;
  const gltfProperties = projection === PROJECTION_ORTHOGRAPHIC ? gltfCamera.orthographic : gltfCamera.perspective;
  const componentData = {
    enabled: false,
    projection: projection,
    nearClip: gltfProperties.znear,
    aspectRatioMode: ASPECT_AUTO
  };
  if (gltfProperties.zfar) {
    componentData.farClip = gltfProperties.zfar;
  }
  if (projection === PROJECTION_ORTHOGRAPHIC) {
    componentData.orthoHeight = 0.5 * gltfProperties.ymag;
    if (gltfProperties.ymag) {
      componentData.aspectRatioMode = ASPECT_MANUAL;
      componentData.aspectRatio = gltfProperties.xmag / gltfProperties.ymag;
    }
  } else {
    componentData.fov = gltfProperties.yfov * math.RAD_TO_DEG;
    if (gltfProperties.aspectRatio) {
      componentData.aspectRatioMode = ASPECT_MANUAL;
      componentData.aspectRatio = gltfProperties.aspectRatio;
    }
  }
  const cameraEntity = new Entity(gltfCamera.name);
  cameraEntity.addComponent('camera', componentData);
  return cameraEntity;
};

// creates light component, adds it to the node and returns the created light component
const createLight = (gltfLight, node) => {
  const lightProps = {
    enabled: false,
    type: gltfLight.type === 'point' ? 'omni' : gltfLight.type,
    color: gltfLight.hasOwnProperty('color') ? new Color(gltfLight.color) : Color.WHITE,
    // when range is not defined, infinity should be used - but that is causing infinity in bounds calculations
    range: gltfLight.hasOwnProperty('range') ? gltfLight.range : 9999,
    falloffMode: LIGHTFALLOFF_INVERSESQUARED,
    // TODO: (engine issue #3252) Set intensity to match glTF specification, which uses physically based values:
    // - Omni and spot lights use luminous intensity in candela (lm/sr)
    // - Directional lights use illuminance in lux (lm/m2).
    // Current implementation: clapms specified intensity to 0..2 range
    intensity: gltfLight.hasOwnProperty('intensity') ? math.clamp(gltfLight.intensity, 0, 2) : 1
  };
  if (gltfLight.hasOwnProperty('spot')) {
    lightProps.innerConeAngle = gltfLight.spot.hasOwnProperty('innerConeAngle') ? gltfLight.spot.innerConeAngle * math.RAD_TO_DEG : 0;
    lightProps.outerConeAngle = gltfLight.spot.hasOwnProperty('outerConeAngle') ? gltfLight.spot.outerConeAngle * math.RAD_TO_DEG : Math.PI / 4;
  }

  // glTF stores light already in energy/area, but we need to provide the light with only the energy parameter,
  // so we need the intensities in candela back to lumen
  if (gltfLight.hasOwnProperty("intensity")) {
    lightProps.luminance = gltfLight.intensity * Light.getLightUnitConversion(lightTypes[lightProps.type], lightProps.outerConeAngle, lightProps.innerConeAngle);
  }

  // Rotate to match light orientation in glTF specification
  // Note that this adds a new entity node into the hierarchy that does not exist in the gltf hierarchy
  const lightEntity = new Entity(node.name);
  lightEntity.rotateLocal(90, 0, 0);

  // add component
  lightEntity.addComponent('light', lightProps);
  return lightEntity;
};
const createSkins = (device, gltf, nodes, bufferViews) => {
  if (!gltf.hasOwnProperty('skins') || gltf.skins.length === 0) {
    return [];
  }

  // cache for skins to filter out duplicates
  const glbSkins = new Map();
  return gltf.skins.map(gltfSkin => {
    return createSkin(device, gltfSkin, gltf.accessors, bufferViews, nodes, glbSkins);
  });
};
const createMeshes = (device, gltf, bufferViews, flipV, options) => {
  var _gltf$meshes, _gltf$accessors, _gltf$bufferViews;
  // dictionary of vertex buffers to avoid duplicates
  const vertexBufferDict = {};
  const meshVariants = {};
  const meshDefaultMaterials = {};
  const promises = [];
  const valid = !options.skipMeshes && (gltf == null || (_gltf$meshes = gltf.meshes) == null ? void 0 : _gltf$meshes.length) && (gltf == null || (_gltf$accessors = gltf.accessors) == null ? void 0 : _gltf$accessors.length) && (gltf == null || (_gltf$bufferViews = gltf.bufferViews) == null ? void 0 : _gltf$bufferViews.length);
  const meshes = valid ? gltf.meshes.map(gltfMesh => {
    return createMesh(device, gltfMesh, gltf.accessors, bufferViews, flipV, vertexBufferDict, meshVariants, meshDefaultMaterials, options, promises);
  }) : [];
  return {
    meshes,
    meshVariants,
    meshDefaultMaterials,
    promises
  };
};
const createMaterials = (gltf, textures, options, flipV) => {
  var _options$material, _options$material$pro, _options$material2, _options$material3;
  if (!gltf.hasOwnProperty('materials') || gltf.materials.length === 0) {
    return [];
  }
  const preprocess = options == null || (_options$material = options.material) == null ? void 0 : _options$material.preprocess;
  const process = (_options$material$pro = options == null || (_options$material2 = options.material) == null ? void 0 : _options$material2.process) != null ? _options$material$pro : createMaterial;
  const postprocess = options == null || (_options$material3 = options.material) == null ? void 0 : _options$material3.postprocess;
  return gltf.materials.map(gltfMaterial => {
    if (preprocess) {
      preprocess(gltfMaterial);
    }
    const material = process(gltfMaterial, textures, flipV);
    if (postprocess) {
      postprocess(gltfMaterial, material);
    }
    return material;
  });
};
const createVariants = gltf => {
  if (!gltf.hasOwnProperty("extensions") || !gltf.extensions.hasOwnProperty("KHR_materials_variants")) return null;
  const data = gltf.extensions.KHR_materials_variants.variants;
  const variants = {};
  for (let i = 0; i < data.length; i++) {
    variants[data[i].name] = i;
  }
  return variants;
};
const createAnimations = (gltf, nodes, bufferViews, options) => {
  var _options$animation, _options$animation2;
  if (!gltf.hasOwnProperty('animations') || gltf.animations.length === 0) {
    return [];
  }
  const preprocess = options == null || (_options$animation = options.animation) == null ? void 0 : _options$animation.preprocess;
  const postprocess = options == null || (_options$animation2 = options.animation) == null ? void 0 : _options$animation2.postprocess;
  return gltf.animations.map((gltfAnimation, index) => {
    if (preprocess) {
      preprocess(gltfAnimation);
    }
    const animation = createAnimation(gltfAnimation, index, gltf.accessors, bufferViews, nodes, gltf.meshes, gltf.nodes);
    if (postprocess) {
      postprocess(gltfAnimation, animation);
    }
    return animation;
  });
};
const createNodes = (gltf, options) => {
  var _options$node, _options$node$process, _options$node2, _options$node3;
  if (!gltf.hasOwnProperty('nodes') || gltf.nodes.length === 0) {
    return [];
  }
  const preprocess = options == null || (_options$node = options.node) == null ? void 0 : _options$node.preprocess;
  const process = (_options$node$process = options == null || (_options$node2 = options.node) == null ? void 0 : _options$node2.process) != null ? _options$node$process : createNode;
  const postprocess = options == null || (_options$node3 = options.node) == null ? void 0 : _options$node3.postprocess;
  const nodes = gltf.nodes.map((gltfNode, index) => {
    if (preprocess) {
      preprocess(gltfNode);
    }
    const node = process(gltfNode, index);
    if (postprocess) {
      postprocess(gltfNode, node);
    }
    return node;
  });

  // build node hierarchy
  for (let i = 0; i < gltf.nodes.length; ++i) {
    const gltfNode = gltf.nodes[i];
    if (gltfNode.hasOwnProperty('children')) {
      const parent = nodes[i];
      const uniqueNames = {};
      for (let j = 0; j < gltfNode.children.length; ++j) {
        const child = nodes[gltfNode.children[j]];
        if (!child.parent) {
          if (uniqueNames.hasOwnProperty(child.name)) {
            child.name += uniqueNames[child.name]++;
          } else {
            uniqueNames[child.name] = 1;
          }
          parent.addChild(child);
        }
      }
    }
  }
  return nodes;
};
const createScenes = (gltf, nodes) => {
  var _gltf$scenes$0$nodes;
  const scenes = [];
  const count = gltf.scenes.length;

  // if there's a single scene with a single node in it, don't create wrapper nodes
  if (count === 1 && ((_gltf$scenes$0$nodes = gltf.scenes[0].nodes) == null ? void 0 : _gltf$scenes$0$nodes.length) === 1) {
    const nodeIndex = gltf.scenes[0].nodes[0];
    scenes.push(nodes[nodeIndex]);
  } else {
    // create root node per scene
    for (let i = 0; i < count; i++) {
      const scene = gltf.scenes[i];
      if (scene.nodes) {
        const sceneRoot = new GraphNode(scene.name);
        for (let n = 0; n < scene.nodes.length; n++) {
          const childNode = nodes[scene.nodes[n]];
          sceneRoot.addChild(childNode);
        }
        scenes.push(sceneRoot);
      }
    }
  }
  return scenes;
};
const createCameras = (gltf, nodes, options) => {
  let cameras = null;
  if (gltf.hasOwnProperty('nodes') && gltf.hasOwnProperty('cameras') && gltf.cameras.length > 0) {
    var _options$camera, _options$camera$proce, _options$camera2, _options$camera3;
    const preprocess = options == null || (_options$camera = options.camera) == null ? void 0 : _options$camera.preprocess;
    const process = (_options$camera$proce = options == null || (_options$camera2 = options.camera) == null ? void 0 : _options$camera2.process) != null ? _options$camera$proce : createCamera;
    const postprocess = options == null || (_options$camera3 = options.camera) == null ? void 0 : _options$camera3.postprocess;
    gltf.nodes.forEach((gltfNode, nodeIndex) => {
      if (gltfNode.hasOwnProperty('camera')) {
        const gltfCamera = gltf.cameras[gltfNode.camera];
        if (gltfCamera) {
          if (preprocess) {
            preprocess(gltfCamera);
          }
          const camera = process(gltfCamera, nodes[nodeIndex]);
          if (postprocess) {
            postprocess(gltfCamera, camera);
          }

          // add the camera to node->camera map
          if (camera) {
            if (!cameras) cameras = new Map();
            cameras.set(gltfNode, camera);
          }
        }
      }
    });
  }
  return cameras;
};
const createLights = (gltf, nodes, options) => {
  let lights = null;
  if (gltf.hasOwnProperty('nodes') && gltf.hasOwnProperty('extensions') && gltf.extensions.hasOwnProperty('KHR_lights_punctual') && gltf.extensions.KHR_lights_punctual.hasOwnProperty('lights')) {
    const gltfLights = gltf.extensions.KHR_lights_punctual.lights;
    if (gltfLights.length) {
      var _options$light, _options$light$proces, _options$light2, _options$light3;
      const preprocess = options == null || (_options$light = options.light) == null ? void 0 : _options$light.preprocess;
      const process = (_options$light$proces = options == null || (_options$light2 = options.light) == null ? void 0 : _options$light2.process) != null ? _options$light$proces : createLight;
      const postprocess = options == null || (_options$light3 = options.light) == null ? void 0 : _options$light3.postprocess;

      // handle nodes with lights
      gltf.nodes.forEach((gltfNode, nodeIndex) => {
        if (gltfNode.hasOwnProperty('extensions') && gltfNode.extensions.hasOwnProperty('KHR_lights_punctual') && gltfNode.extensions.KHR_lights_punctual.hasOwnProperty('light')) {
          const lightIndex = gltfNode.extensions.KHR_lights_punctual.light;
          const gltfLight = gltfLights[lightIndex];
          if (gltfLight) {
            if (preprocess) {
              preprocess(gltfLight);
            }
            const light = process(gltfLight, nodes[nodeIndex]);
            if (postprocess) {
              postprocess(gltfLight, light);
            }

            // add the light to node->light map
            if (light) {
              if (!lights) lights = new Map();
              lights.set(gltfNode, light);
            }
          }
        }
      });
    }
  }
  return lights;
};

// link skins to the meshes
const linkSkins = (gltf, renders, skins) => {
  gltf.nodes.forEach(gltfNode => {
    if (gltfNode.hasOwnProperty('mesh') && gltfNode.hasOwnProperty('skin')) {
      const meshGroup = renders[gltfNode.mesh].meshes;
      meshGroup.forEach(mesh => {
        mesh.skin = skins[gltfNode.skin];
      });
    }
  });
};

// create engine resources from the downloaded GLB data
const createResources = async (device, gltf, bufferViews, textures, options) => {
  var _options$global, _options$global2;
  const preprocess = options == null || (_options$global = options.global) == null ? void 0 : _options$global.preprocess;
  const postprocess = options == null || (_options$global2 = options.global) == null ? void 0 : _options$global2.postprocess;
  if (preprocess) {
    preprocess(gltf);
  }

  // The original version of FACT generated incorrectly flipped V texture
  // coordinates. We must compensate by flipping V in this case. Once
  // all models have been re-exported we can remove this flag.
  const flipV = gltf.asset && gltf.asset.generator === 'PlayCanvas';

  // We'd like to remove the flipV code at some point.
  if (flipV) {
    Debug.warn('glTF model may have flipped UVs. Please reconvert.');
  }
  const nodes = createNodes(gltf, options);
  const scenes = createScenes(gltf, nodes);
  const lights = createLights(gltf, nodes, options);
  const cameras = createCameras(gltf, nodes, options);
  const variants = createVariants(gltf);

  // buffer data must have finished loading in order to create meshes and animations
  const bufferViewData = await Promise.all(bufferViews);
  const {
    meshes,
    meshVariants,
    meshDefaultMaterials,
    promises
  } = createMeshes(device, gltf, bufferViewData, flipV, options);
  const animations = createAnimations(gltf, nodes, bufferViewData, options);

  // textures must have finished loading in order to create materials
  const textureAssets = await Promise.all(textures);
  const textureInstances = textureAssets.map(t => t.resource);
  const materials = createMaterials(gltf, textureInstances, options, flipV);
  const skins = createSkins(device, gltf, nodes, bufferViewData);

  // create renders to wrap meshes
  const renders = [];
  for (let i = 0; i < meshes.length; i++) {
    renders[i] = new Render();
    renders[i].meshes = meshes[i];
  }

  // link skins to meshes
  linkSkins(gltf, renders, skins);
  const result = new GlbResources();
  result.gltf = gltf;
  result.nodes = nodes;
  result.scenes = scenes;
  result.animations = animations;
  result.textures = textureAssets;
  result.materials = materials;
  result.variants = variants;
  result.meshVariants = meshVariants;
  result.meshDefaultMaterials = meshDefaultMaterials;
  result.renders = renders;
  result.skins = skins;
  result.lights = lights;
  result.cameras = cameras;
  if (postprocess) {
    postprocess(gltf, result);
  }

  // wait for draco meshes to complete decoding
  await Promise.all(promises);
  return result;
};
const applySampler = (texture, gltfSampler) => {
  const getFilter = (filter, defaultValue) => {
    switch (filter) {
      case 9728:
        return FILTER_NEAREST;
      case 9729:
        return FILTER_LINEAR;
      case 9984:
        return FILTER_NEAREST_MIPMAP_NEAREST;
      case 9985:
        return FILTER_LINEAR_MIPMAP_NEAREST;
      case 9986:
        return FILTER_NEAREST_MIPMAP_LINEAR;
      case 9987:
        return FILTER_LINEAR_MIPMAP_LINEAR;
      default:
        return defaultValue;
    }
  };
  const getWrap = (wrap, defaultValue) => {
    switch (wrap) {
      case 33071:
        return ADDRESS_CLAMP_TO_EDGE;
      case 33648:
        return ADDRESS_MIRRORED_REPEAT;
      case 10497:
        return ADDRESS_REPEAT;
      default:
        return defaultValue;
    }
  };
  if (texture) {
    var _gltfSampler;
    gltfSampler = (_gltfSampler = gltfSampler) != null ? _gltfSampler : {};
    texture.minFilter = getFilter(gltfSampler.minFilter, FILTER_LINEAR_MIPMAP_LINEAR);
    texture.magFilter = getFilter(gltfSampler.magFilter, FILTER_LINEAR);
    texture.addressU = getWrap(gltfSampler.wrapS, ADDRESS_REPEAT);
    texture.addressV = getWrap(gltfSampler.wrapT, ADDRESS_REPEAT);
  }
};
let gltfTextureUniqueId = 0;

// create gltf images. returns an array of promises that resolve to texture assets.
const createImages = (gltf, bufferViews, urlBase, registry, options) => {
  var _options$image, _options$image2, _options$image3;
  if (!gltf.images || gltf.images.length === 0) {
    return [];
  }
  const preprocess = options == null || (_options$image = options.image) == null ? void 0 : _options$image.preprocess;
  const processAsync = options == null || (_options$image2 = options.image) == null ? void 0 : _options$image2.processAsync;
  const postprocess = options == null || (_options$image3 = options.image) == null ? void 0 : _options$image3.postprocess;
  const mimeTypeFileExtensions = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/basis': 'basis',
    'image/ktx': 'ktx',
    'image/ktx2': 'ktx2',
    'image/vnd-ms.dds': 'dds'
  };
  const loadTexture = (gltfImage, url, bufferView, mimeType, options) => {
    return new Promise((resolve, reject) => {
      const continuation = bufferViewData => {
        const name = (gltfImage.name || 'gltf-texture') + '-' + gltfTextureUniqueId++;

        // construct the asset file
        const file = {
          url: url || name
        };
        if (bufferViewData) {
          file.contents = bufferViewData.slice(0).buffer;
        }
        if (mimeType) {
          const extension = mimeTypeFileExtensions[mimeType];
          if (extension) {
            file.filename = file.url + '.' + extension;
          }
        }

        // create and load the asset
        const asset = new Asset(name, 'texture', file, null, options);
        asset.on('load', asset => resolve(asset));
        asset.on('error', err => reject(err));
        registry.add(asset);
        registry.load(asset);
      };
      if (bufferView) {
        bufferView.then(bufferViewData => continuation(bufferViewData));
      } else {
        continuation(null);
      }
    });
  };
  return gltf.images.map((gltfImage, i) => {
    if (preprocess) {
      preprocess(gltfImage);
    }
    let promise;
    if (processAsync) {
      promise = new Promise((resolve, reject) => {
        processAsync(gltfImage, (err, textureAsset) => {
          if (err) reject(err);else resolve(textureAsset);
        });
      });
    } else {
      promise = new Promise(resolve => {
        resolve(null);
      });
    }
    promise = promise.then(textureAsset => {
      if (textureAsset) {
        return textureAsset;
      } else if (gltfImage.hasOwnProperty('uri')) {
        // uri specified
        if (isDataURI(gltfImage.uri)) {
          return loadTexture(gltfImage, gltfImage.uri, null, getDataURIMimeType(gltfImage.uri), null);
        }
        return loadTexture(gltfImage, ABSOLUTE_URL.test(gltfImage.uri) ? gltfImage.uri : path.join(urlBase, gltfImage.uri), null, null, {
          crossOrigin: 'anonymous'
        });
      } else if (gltfImage.hasOwnProperty('bufferView') && gltfImage.hasOwnProperty('mimeType')) {
        // bufferview
        return loadTexture(gltfImage, null, bufferViews[gltfImage.bufferView], gltfImage.mimeType, null);
      }

      // fail
      return Promise.reject(new Error(`Invalid image found in gltf (neither uri or bufferView found). index=${i}`));
    });
    if (postprocess) {
      promise = promise.then(textureAsset => {
        postprocess(gltfImage, textureAsset);
        return textureAsset;
      });
    }
    return promise;
  });
};

// create gltf textures. returns an array of promises that resolve to texture assets.
const createTextures = (gltf, images, options) => {
  var _gltf$images, _gltf$textures, _options$texture, _options$texture2, _options$texture3;
  if (!(gltf != null && (_gltf$images = gltf.images) != null && _gltf$images.length) || !(gltf != null && (_gltf$textures = gltf.textures) != null && _gltf$textures.length)) {
    return [];
  }
  const preprocess = options == null || (_options$texture = options.texture) == null ? void 0 : _options$texture.preprocess;
  const processAsync = options == null || (_options$texture2 = options.texture) == null ? void 0 : _options$texture2.processAsync;
  const postprocess = options == null || (_options$texture3 = options.texture) == null ? void 0 : _options$texture3.postprocess;
  const seenImages = new Set();
  return gltf.textures.map(gltfTexture => {
    if (preprocess) {
      preprocess(gltfTexture);
    }
    let promise;
    if (processAsync) {
      promise = new Promise((resolve, reject) => {
        processAsync(gltfTexture, gltf.images, (err, gltfImageIndex) => {
          if (err) reject(err);else resolve(gltfImageIndex);
        });
      });
    } else {
      promise = new Promise(resolve => {
        resolve(null);
      });
    }
    promise = promise.then(gltfImageIndex => {
      var _ref, _ref2, _gltfImageIndex, _gltfTexture$extensio, _gltfTexture$extensio2;
      // resolve image index
      gltfImageIndex = (_ref = (_ref2 = (_gltfImageIndex = gltfImageIndex) != null ? _gltfImageIndex : gltfTexture == null || (_gltfTexture$extensio = gltfTexture.extensions) == null || (_gltfTexture$extensio = _gltfTexture$extensio.KHR_texture_basisu) == null ? void 0 : _gltfTexture$extensio.source) != null ? _ref2 : gltfTexture == null || (_gltfTexture$extensio2 = gltfTexture.extensions) == null || (_gltfTexture$extensio2 = _gltfTexture$extensio2.EXT_texture_webp) == null ? void 0 : _gltfTexture$extensio2.source) != null ? _ref : gltfTexture.source;
      const cloneAsset = seenImages.has(gltfImageIndex);
      seenImages.add(gltfImageIndex);
      return images[gltfImageIndex].then(imageAsset => {
        var _gltf$samplers;
        const asset = cloneAsset ? cloneTextureAsset(imageAsset) : imageAsset;
        applySampler(asset.resource, ((_gltf$samplers = gltf.samplers) != null ? _gltf$samplers : [])[gltfTexture.sampler]);
        return asset;
      });
    });
    if (postprocess) {
      promise = promise.then(textureAsset => {
        postprocess(gltfTexture, textureAsset);
        return textureAsset;
      });
    }
    return promise;
  });
};

// load gltf buffers. returns an array of promises that resolve to typed arrays.
const loadBuffers = (gltf, binaryChunk, urlBase, options) => {
  var _options$buffer, _options$buffer2, _options$buffer3;
  if (!gltf.buffers || gltf.buffers.length === 0) {
    return [];
  }
  const preprocess = options == null || (_options$buffer = options.buffer) == null ? void 0 : _options$buffer.preprocess;
  const processAsync = options == null || (_options$buffer2 = options.buffer) == null ? void 0 : _options$buffer2.processAsync;
  const postprocess = options == null || (_options$buffer3 = options.buffer) == null ? void 0 : _options$buffer3.postprocess;
  return gltf.buffers.map((gltfBuffer, i) => {
    if (preprocess) {
      preprocess(gltfBuffer);
    }
    let promise;
    if (processAsync) {
      promise = new Promise((resolve, reject) => {
        processAsync(gltfBuffer, (err, arrayBuffer) => {
          if (err) reject(err);else resolve(arrayBuffer);
        });
      });
    } else {
      promise = new Promise(resolve => {
        resolve(null);
      });
    }
    promise = promise.then(arrayBuffer => {
      if (arrayBuffer) {
        return arrayBuffer;
      } else if (gltfBuffer.hasOwnProperty('uri')) {
        if (isDataURI(gltfBuffer.uri)) {
          // convert base64 to raw binary data held in a string
          // doesn't handle URLEncoded DataURIs - see SO answer #6850276 for code that does this
          const byteString = atob(gltfBuffer.uri.split(',')[1]);

          // create a view into the buffer
          const binaryArray = new Uint8Array(byteString.length);

          // set the bytes of the buffer to the correct values
          for (let j = 0; j < byteString.length; j++) {
            binaryArray[j] = byteString.charCodeAt(j);
          }
          return binaryArray;
        }
        return new Promise((resolve, reject) => {
          http.get(ABSOLUTE_URL.test(gltfBuffer.uri) ? gltfBuffer.uri : path.join(urlBase, gltfBuffer.uri), {
            cache: true,
            responseType: 'arraybuffer',
            retry: false
          }, (err, result) => {
            // eslint-disable-line no-loop-func
            if (err) reject(err);else resolve(new Uint8Array(result));
          });
        });
      }

      // glb buffer reference
      return binaryChunk;
    });
    if (postprocess) {
      promise = promise.then(buffer => {
        postprocess(gltf.buffers[i], buffer);
        return buffer;
      });
    }
    return promise;
  });
};

// parse the gltf chunk, returns the gltf json
const parseGltf = (gltfChunk, callback) => {
  const decodeBinaryUtf8 = array => {
    if (typeof TextDecoder !== 'undefined') {
      return new TextDecoder().decode(array);
    }
    let str = '';
    for (let i = 0; i < array.length; i++) {
      str += String.fromCharCode(array[i]);
    }
    return decodeURIComponent(escape(str));
  };
  const gltf = JSON.parse(decodeBinaryUtf8(gltfChunk));

  // check gltf version
  if (gltf.asset && gltf.asset.version && parseFloat(gltf.asset.version) < 2) {
    callback(`Invalid gltf version. Expected version 2.0 or above but found version '${gltf.asset.version}'.`);
    return;
  }

  // check required extensions
  callback(null, gltf);
};

// parse glb data, returns the gltf and binary chunk
const parseGlb = (glbData, callback) => {
  const data = glbData instanceof ArrayBuffer ? new DataView(glbData) : new DataView(glbData.buffer, glbData.byteOffset, glbData.byteLength);

  // read header
  const magic = data.getUint32(0, true);
  const version = data.getUint32(4, true);
  const length = data.getUint32(8, true);
  if (magic !== 0x46546C67) {
    callback('Invalid magic number found in glb header. Expected 0x46546C67, found 0x' + magic.toString(16));
    return;
  }
  if (version !== 2) {
    callback('Invalid version number found in glb header. Expected 2, found ' + version);
    return;
  }
  if (length <= 0 || length > data.byteLength) {
    callback('Invalid length found in glb header. Found ' + length);
    return;
  }

  // read chunks
  const chunks = [];
  let offset = 12;
  while (offset < length) {
    const chunkLength = data.getUint32(offset, true);
    if (offset + chunkLength + 8 > data.byteLength) {
      callback(`Invalid chunk length found in glb. Found ${chunkLength}`);
    }
    const chunkType = data.getUint32(offset + 4, true);
    const chunkData = new Uint8Array(data.buffer, data.byteOffset + offset + 8, chunkLength);
    chunks.push({
      length: chunkLength,
      type: chunkType,
      data: chunkData
    });
    offset += chunkLength + 8;
  }
  if (chunks.length !== 1 && chunks.length !== 2) {
    callback('Invalid number of chunks found in glb file.');
    return;
  }
  if (chunks[0].type !== 0x4E4F534A) {
    callback(`Invalid chunk type found in glb file. Expected 0x4E4F534A, found 0x${chunks[0].type.toString(16)}`);
    return;
  }
  if (chunks.length > 1 && chunks[1].type !== 0x004E4942) {
    callback(`Invalid chunk type found in glb file. Expected 0x004E4942, found 0x${chunks[1].type.toString(16)}`);
    return;
  }
  callback(null, {
    gltfChunk: chunks[0].data,
    binaryChunk: chunks.length === 2 ? chunks[1].data : null
  });
};

// parse the chunk of data, which can be glb or gltf
const parseChunk = (filename, data, callback) => {
  const hasGlbHeader = () => {
    // glb format starts with 'glTF'
    const u8 = new Uint8Array(data);
    return u8[0] === 103 && u8[1] === 108 && u8[2] === 84 && u8[3] === 70;
  };
  if (filename && filename.toLowerCase().endsWith('.glb') || hasGlbHeader()) {
    parseGlb(data, callback);
  } else {
    callback(null, {
      gltfChunk: data,
      binaryChunk: null
    });
  }
};

// create buffer views
const createBufferViews = (gltf, buffers, options) => {
  var _options$bufferView, _options$bufferView2, _options$bufferView3, _gltf$bufferViews2;
  const result = [];
  const preprocess = options == null || (_options$bufferView = options.bufferView) == null ? void 0 : _options$bufferView.preprocess;
  const processAsync = options == null || (_options$bufferView2 = options.bufferView) == null ? void 0 : _options$bufferView2.processAsync;
  const postprocess = options == null || (_options$bufferView3 = options.bufferView) == null ? void 0 : _options$bufferView3.postprocess;

  // handle case of no buffers
  if (!((_gltf$bufferViews2 = gltf.bufferViews) != null && _gltf$bufferViews2.length)) {
    return result;
  }
  for (let i = 0; i < gltf.bufferViews.length; ++i) {
    const gltfBufferView = gltf.bufferViews[i];
    if (preprocess) {
      preprocess(gltfBufferView);
    }
    let promise;
    if (processAsync) {
      promise = new Promise((resolve, reject) => {
        processAsync(gltfBufferView, buffers, (err, result) => {
          if (err) reject(err);else resolve(result);
        });
      });
    } else {
      promise = new Promise(resolve => {
        resolve(null);
      });
    }
    promise = promise.then(buffer => {
      if (buffer) {
        return buffer;
      }

      // convert buffer to typed array
      return buffers[gltfBufferView.buffer].then(buffer => {
        return new Uint8Array(buffer.buffer, buffer.byteOffset + (gltfBufferView.byteOffset || 0), gltfBufferView.byteLength);
      });
    });

    // add a 'byteStride' member to the typed array so we have easy access to it later
    if (gltfBufferView.hasOwnProperty('byteStride')) {
      promise = promise.then(typedArray => {
        typedArray.byteStride = gltfBufferView.byteStride;
        return typedArray;
      });
    }
    if (postprocess) {
      promise = promise.then(typedArray => {
        postprocess(gltfBufferView, typedArray);
        return typedArray;
      });
    }
    result.push(promise);
  }
  return result;
};
class GlbParser {
  // parse the gltf or glb data asynchronously, loading external resources
  static parse(filename, urlBase, data, device, registry, options, callback) {
    // parse the data
    parseChunk(filename, data, (err, chunks) => {
      if (err) {
        callback(err);
        return;
      }

      // parse gltf
      parseGltf(chunks.gltfChunk, (err, gltf) => {
        if (err) {
          callback(err);
          return;
        }
        const buffers = loadBuffers(gltf, chunks.binaryChunk, urlBase, options);
        const bufferViews = createBufferViews(gltf, buffers, options);
        const images = createImages(gltf, bufferViews, urlBase, registry, options);
        const textures = createTextures(gltf, images, options);
        createResources(device, gltf, bufferViews, textures, options).then(result => callback(null, result)).catch(err => callback(err));
      });
    });
  }
  static createDefaultMaterial() {
    return createMaterial({
      name: 'defaultGlbMaterial'
    }, []);
  }
}

export { GlbParser };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2xiLXBhcnNlci5qcyIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL2ZyYW1ld29yay9wYXJzZXJzL2dsYi1wYXJzZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgRGVidWcgfSBmcm9tICcuLi8uLi9jb3JlL2RlYnVnLmpzJztcbmltcG9ydCB7IHBhdGggfSBmcm9tICcuLi8uLi9jb3JlL3BhdGguanMnO1xuaW1wb3J0IHsgQ29sb3IgfSBmcm9tICcuLi8uLi9jb3JlL21hdGgvY29sb3IuanMnO1xuaW1wb3J0IHsgTWF0NCB9IGZyb20gJy4uLy4uL2NvcmUvbWF0aC9tYXQ0LmpzJztcbmltcG9ydCB7IG1hdGggfSBmcm9tICcuLi8uLi9jb3JlL21hdGgvbWF0aC5qcyc7XG5pbXBvcnQgeyBWZWMyIH0gZnJvbSAnLi4vLi4vY29yZS9tYXRoL3ZlYzIuanMnO1xuaW1wb3J0IHsgVmVjMyB9IGZyb20gJy4uLy4uL2NvcmUvbWF0aC92ZWMzLmpzJztcbmltcG9ydCB7IEJvdW5kaW5nQm94IH0gZnJvbSAnLi4vLi4vY29yZS9zaGFwZS9ib3VuZGluZy1ib3guanMnO1xuXG5pbXBvcnQge1xuICAgIHR5cGVkQXJyYXlUeXBlcywgdHlwZWRBcnJheVR5cGVzQnl0ZVNpemUsXG4gICAgQUREUkVTU19DTEFNUF9UT19FREdFLCBBRERSRVNTX01JUlJPUkVEX1JFUEVBVCwgQUREUkVTU19SRVBFQVQsXG4gICAgQlVGRkVSX1NUQVRJQyxcbiAgICBDVUxMRkFDRV9OT05FLCBDVUxMRkFDRV9CQUNLLFxuICAgIEZJTFRFUl9ORUFSRVNULCBGSUxURVJfTElORUFSLCBGSUxURVJfTkVBUkVTVF9NSVBNQVBfTkVBUkVTVCwgRklMVEVSX0xJTkVBUl9NSVBNQVBfTkVBUkVTVCwgRklMVEVSX05FQVJFU1RfTUlQTUFQX0xJTkVBUiwgRklMVEVSX0xJTkVBUl9NSVBNQVBfTElORUFSLFxuICAgIElOREVYRk9STUFUX1VJTlQ4LCBJTkRFWEZPUk1BVF9VSU5UMTYsIElOREVYRk9STUFUX1VJTlQzMixcbiAgICBQUklNSVRJVkVfTElORUxPT1AsIFBSSU1JVElWRV9MSU5FU1RSSVAsIFBSSU1JVElWRV9MSU5FUywgUFJJTUlUSVZFX1BPSU5UUywgUFJJTUlUSVZFX1RSSUFOR0xFUywgUFJJTUlUSVZFX1RSSUZBTiwgUFJJTUlUSVZFX1RSSVNUUklQLFxuICAgIFNFTUFOVElDX1BPU0lUSU9OLCBTRU1BTlRJQ19OT1JNQUwsIFNFTUFOVElDX1RBTkdFTlQsIFNFTUFOVElDX0NPTE9SLCBTRU1BTlRJQ19CTEVORElORElDRVMsIFNFTUFOVElDX0JMRU5EV0VJR0hULFxuICAgIFNFTUFOVElDX1RFWENPT1JEMCwgU0VNQU5USUNfVEVYQ09PUkQxLCBTRU1BTlRJQ19URVhDT09SRDIsIFNFTUFOVElDX1RFWENPT1JEMywgU0VNQU5USUNfVEVYQ09PUkQ0LCBTRU1BTlRJQ19URVhDT09SRDUsIFNFTUFOVElDX1RFWENPT1JENiwgU0VNQU5USUNfVEVYQ09PUkQ3LFxuICAgIFRZUEVfSU5UOCwgVFlQRV9VSU5UOCwgVFlQRV9JTlQxNiwgVFlQRV9VSU5UMTYsIFRZUEVfSU5UMzIsIFRZUEVfVUlOVDMyLCBUWVBFX0ZMT0FUMzJcbn0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vZ3JhcGhpY3MvY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IEluZGV4QnVmZmVyIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vZ3JhcGhpY3MvaW5kZXgtYnVmZmVyLmpzJztcbmltcG9ydCB7IFRleHR1cmUgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9ncmFwaGljcy90ZXh0dXJlLmpzJztcbmltcG9ydCB7IFZlcnRleEJ1ZmZlciB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2dyYXBoaWNzL3ZlcnRleC1idWZmZXIuanMnO1xuaW1wb3J0IHsgVmVydGV4Rm9ybWF0IH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vZ3JhcGhpY3MvdmVydGV4LWZvcm1hdC5qcyc7XG5pbXBvcnQgeyBodHRwIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vbmV0L2h0dHAuanMnO1xuXG5pbXBvcnQge1xuICAgIEJMRU5EX05PTkUsIEJMRU5EX05PUk1BTCwgTElHSFRGQUxMT0ZGX0lOVkVSU0VTUVVBUkVELFxuICAgIFBST0pFQ1RJT05fT1JUSE9HUkFQSElDLCBQUk9KRUNUSU9OX1BFUlNQRUNUSVZFLFxuICAgIEFTUEVDVF9NQU5VQUwsIEFTUEVDVF9BVVRPLCBTUEVDT0NDX0FPXG59IGZyb20gJy4uLy4uL3NjZW5lL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBHcmFwaE5vZGUgfSBmcm9tICcuLi8uLi9zY2VuZS9ncmFwaC1ub2RlLmpzJztcbmltcG9ydCB7IExpZ2h0LCBsaWdodFR5cGVzIH0gZnJvbSAnLi4vLi4vc2NlbmUvbGlnaHQuanMnO1xuaW1wb3J0IHsgTWVzaCB9IGZyb20gJy4uLy4uL3NjZW5lL21lc2guanMnO1xuaW1wb3J0IHsgTW9ycGggfSBmcm9tICcuLi8uLi9zY2VuZS9tb3JwaC5qcyc7XG5pbXBvcnQgeyBNb3JwaFRhcmdldCB9IGZyb20gJy4uLy4uL3NjZW5lL21vcnBoLXRhcmdldC5qcyc7XG5pbXBvcnQgeyBjYWxjdWxhdGVOb3JtYWxzIH0gZnJvbSAnLi4vLi4vc2NlbmUvcHJvY2VkdXJhbC5qcyc7XG5pbXBvcnQgeyBSZW5kZXIgfSBmcm9tICcuLi8uLi9zY2VuZS9yZW5kZXIuanMnO1xuaW1wb3J0IHsgU2tpbiB9IGZyb20gJy4uLy4uL3NjZW5lL3NraW4uanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRNYXRlcmlhbCB9IGZyb20gJy4uLy4uL3NjZW5lL21hdGVyaWFscy9zdGFuZGFyZC1tYXRlcmlhbC5qcyc7XG5cbmltcG9ydCB7IEVudGl0eSB9IGZyb20gJy4uL2VudGl0eS5qcyc7XG5pbXBvcnQgeyBJTlRFUlBPTEFUSU9OX0NVQklDLCBJTlRFUlBPTEFUSU9OX0xJTkVBUiwgSU5URVJQT0xBVElPTl9TVEVQIH0gZnJvbSAnLi4vYW5pbS9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgQW5pbUN1cnZlIH0gZnJvbSAnLi4vYW5pbS9ldmFsdWF0b3IvYW5pbS1jdXJ2ZS5qcyc7XG5pbXBvcnQgeyBBbmltRGF0YSB9IGZyb20gJy4uL2FuaW0vZXZhbHVhdG9yL2FuaW0tZGF0YS5qcyc7XG5pbXBvcnQgeyBBbmltVHJhY2sgfSBmcm9tICcuLi9hbmltL2V2YWx1YXRvci9hbmltLXRyYWNrLmpzJztcbmltcG9ydCB7IEFzc2V0IH0gZnJvbSAnLi4vYXNzZXQvYXNzZXQuanMnO1xuaW1wb3J0IHsgQUJTT0xVVEVfVVJMIH0gZnJvbSAnLi4vYXNzZXQvY29uc3RhbnRzLmpzJztcblxuaW1wb3J0IHsgZHJhY29EZWNvZGUgfSBmcm9tICcuL2RyYWNvLWRlY29kZXIuanMnO1xuXG4vLyByZXNvdXJjZXMgbG9hZGVkIGZyb20gR0xCIGZpbGUgdGhhdCB0aGUgcGFyc2VyIHJldHVybnNcbmNsYXNzIEdsYlJlc291cmNlcyB7XG4gICAgZ2x0ZjtcblxuICAgIG5vZGVzO1xuXG4gICAgc2NlbmVzO1xuXG4gICAgYW5pbWF0aW9ucztcblxuICAgIHRleHR1cmVzO1xuXG4gICAgbWF0ZXJpYWxzO1xuXG4gICAgdmFyaWFudHM7XG5cbiAgICBtZXNoVmFyaWFudHM7XG5cbiAgICBtZXNoRGVmYXVsdE1hdGVyaWFscztcblxuICAgIHJlbmRlcnM7XG5cbiAgICBza2lucztcblxuICAgIGxpZ2h0cztcblxuICAgIGNhbWVyYXM7XG5cbiAgICBkZXN0cm95KCkge1xuICAgICAgICAvLyByZW5kZXIgbmVlZHMgdG8gZGVjIHJlZiBtZXNoZXNcbiAgICAgICAgaWYgKHRoaXMucmVuZGVycykge1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJzLmZvckVhY2goKHJlbmRlcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlbmRlci5tZXNoZXMgPSBudWxsO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG59XG5cbmNvbnN0IGlzRGF0YVVSSSA9ICh1cmkpID0+IHtcbiAgICByZXR1cm4gL15kYXRhOi4qLC4qJC9pLnRlc3QodXJpKTtcbn07XG5cbmNvbnN0IGdldERhdGFVUklNaW1lVHlwZSA9ICh1cmkpID0+IHtcbiAgICByZXR1cm4gdXJpLnN1YnN0cmluZyh1cmkuaW5kZXhPZignOicpICsgMSwgdXJpLmluZGV4T2YoJzsnKSk7XG59O1xuXG5jb25zdCBnZXROdW1Db21wb25lbnRzID0gKGFjY2Vzc29yVHlwZSkgPT4ge1xuICAgIHN3aXRjaCAoYWNjZXNzb3JUeXBlKSB7XG4gICAgICAgIGNhc2UgJ1NDQUxBUic6IHJldHVybiAxO1xuICAgICAgICBjYXNlICdWRUMyJzogcmV0dXJuIDI7XG4gICAgICAgIGNhc2UgJ1ZFQzMnOiByZXR1cm4gMztcbiAgICAgICAgY2FzZSAnVkVDNCc6IHJldHVybiA0O1xuICAgICAgICBjYXNlICdNQVQyJzogcmV0dXJuIDQ7XG4gICAgICAgIGNhc2UgJ01BVDMnOiByZXR1cm4gOTtcbiAgICAgICAgY2FzZSAnTUFUNCc6IHJldHVybiAxNjtcbiAgICAgICAgZGVmYXVsdDogcmV0dXJuIDM7XG4gICAgfVxufTtcblxuY29uc3QgZ2V0Q29tcG9uZW50VHlwZSA9IChjb21wb25lbnRUeXBlKSA9PiB7XG4gICAgc3dpdGNoIChjb21wb25lbnRUeXBlKSB7XG4gICAgICAgIGNhc2UgNTEyMDogcmV0dXJuIFRZUEVfSU5UODtcbiAgICAgICAgY2FzZSA1MTIxOiByZXR1cm4gVFlQRV9VSU5UODtcbiAgICAgICAgY2FzZSA1MTIyOiByZXR1cm4gVFlQRV9JTlQxNjtcbiAgICAgICAgY2FzZSA1MTIzOiByZXR1cm4gVFlQRV9VSU5UMTY7XG4gICAgICAgIGNhc2UgNTEyNDogcmV0dXJuIFRZUEVfSU5UMzI7XG4gICAgICAgIGNhc2UgNTEyNTogcmV0dXJuIFRZUEVfVUlOVDMyO1xuICAgICAgICBjYXNlIDUxMjY6IHJldHVybiBUWVBFX0ZMT0FUMzI7XG4gICAgICAgIGRlZmF1bHQ6IHJldHVybiAwO1xuICAgIH1cbn07XG5cbmNvbnN0IGdldENvbXBvbmVudFNpemVJbkJ5dGVzID0gKGNvbXBvbmVudFR5cGUpID0+IHtcbiAgICBzd2l0Y2ggKGNvbXBvbmVudFR5cGUpIHtcbiAgICAgICAgY2FzZSA1MTIwOiByZXR1cm4gMTsgICAgLy8gaW50OFxuICAgICAgICBjYXNlIDUxMjE6IHJldHVybiAxOyAgICAvLyB1aW50OFxuICAgICAgICBjYXNlIDUxMjI6IHJldHVybiAyOyAgICAvLyBpbnQxNlxuICAgICAgICBjYXNlIDUxMjM6IHJldHVybiAyOyAgICAvLyB1aW50MTZcbiAgICAgICAgY2FzZSA1MTI0OiByZXR1cm4gNDsgICAgLy8gaW50MzJcbiAgICAgICAgY2FzZSA1MTI1OiByZXR1cm4gNDsgICAgLy8gdWludDMyXG4gICAgICAgIGNhc2UgNTEyNjogcmV0dXJuIDQ7ICAgIC8vIGZsb2F0MzJcbiAgICAgICAgZGVmYXVsdDogcmV0dXJuIDA7XG4gICAgfVxufTtcblxuY29uc3QgZ2V0Q29tcG9uZW50RGF0YVR5cGUgPSAoY29tcG9uZW50VHlwZSkgPT4ge1xuICAgIHN3aXRjaCAoY29tcG9uZW50VHlwZSkge1xuICAgICAgICBjYXNlIDUxMjA6IHJldHVybiBJbnQ4QXJyYXk7XG4gICAgICAgIGNhc2UgNTEyMTogcmV0dXJuIFVpbnQ4QXJyYXk7XG4gICAgICAgIGNhc2UgNTEyMjogcmV0dXJuIEludDE2QXJyYXk7XG4gICAgICAgIGNhc2UgNTEyMzogcmV0dXJuIFVpbnQxNkFycmF5O1xuICAgICAgICBjYXNlIDUxMjQ6IHJldHVybiBJbnQzMkFycmF5O1xuICAgICAgICBjYXNlIDUxMjU6IHJldHVybiBVaW50MzJBcnJheTtcbiAgICAgICAgY2FzZSA1MTI2OiByZXR1cm4gRmxvYXQzMkFycmF5O1xuICAgICAgICBkZWZhdWx0OiByZXR1cm4gbnVsbDtcbiAgICB9XG59O1xuXG5jb25zdCBnbHRmVG9FbmdpbmVTZW1hbnRpY01hcCA9IHtcbiAgICAnUE9TSVRJT04nOiBTRU1BTlRJQ19QT1NJVElPTixcbiAgICAnTk9STUFMJzogU0VNQU5USUNfTk9STUFMLFxuICAgICdUQU5HRU5UJzogU0VNQU5USUNfVEFOR0VOVCxcbiAgICAnQ09MT1JfMCc6IFNFTUFOVElDX0NPTE9SLFxuICAgICdKT0lOVFNfMCc6IFNFTUFOVElDX0JMRU5ESU5ESUNFUyxcbiAgICAnV0VJR0hUU18wJzogU0VNQU5USUNfQkxFTkRXRUlHSFQsXG4gICAgJ1RFWENPT1JEXzAnOiBTRU1BTlRJQ19URVhDT09SRDAsXG4gICAgJ1RFWENPT1JEXzEnOiBTRU1BTlRJQ19URVhDT09SRDEsXG4gICAgJ1RFWENPT1JEXzInOiBTRU1BTlRJQ19URVhDT09SRDIsXG4gICAgJ1RFWENPT1JEXzMnOiBTRU1BTlRJQ19URVhDT09SRDMsXG4gICAgJ1RFWENPT1JEXzQnOiBTRU1BTlRJQ19URVhDT09SRDQsXG4gICAgJ1RFWENPT1JEXzUnOiBTRU1BTlRJQ19URVhDT09SRDUsXG4gICAgJ1RFWENPT1JEXzYnOiBTRU1BTlRJQ19URVhDT09SRDYsXG4gICAgJ1RFWENPT1JEXzcnOiBTRU1BTlRJQ19URVhDT09SRDdcbn07XG5cbi8vIG9yZGVyIHZlcnRleERlc2MgdG8gbWF0Y2ggdGhlIHJlc3Qgb2YgdGhlIGVuZ2luZVxuY29uc3QgYXR0cmlidXRlT3JkZXIgPSB7XG4gICAgW1NFTUFOVElDX1BPU0lUSU9OXTogMCxcbiAgICBbU0VNQU5USUNfTk9STUFMXTogMSxcbiAgICBbU0VNQU5USUNfVEFOR0VOVF06IDIsXG4gICAgW1NFTUFOVElDX0NPTE9SXTogMyxcbiAgICBbU0VNQU5USUNfQkxFTkRJTkRJQ0VTXTogNCxcbiAgICBbU0VNQU5USUNfQkxFTkRXRUlHSFRdOiA1LFxuICAgIFtTRU1BTlRJQ19URVhDT09SRDBdOiA2LFxuICAgIFtTRU1BTlRJQ19URVhDT09SRDFdOiA3LFxuICAgIFtTRU1BTlRJQ19URVhDT09SRDJdOiA4LFxuICAgIFtTRU1BTlRJQ19URVhDT09SRDNdOiA5LFxuICAgIFtTRU1BTlRJQ19URVhDT09SRDRdOiAxMCxcbiAgICBbU0VNQU5USUNfVEVYQ09PUkQ1XTogMTEsXG4gICAgW1NFTUFOVElDX1RFWENPT1JENl06IDEyLFxuICAgIFtTRU1BTlRJQ19URVhDT09SRDddOiAxM1xufTtcblxuLy8gcmV0dXJucyBhIGZ1bmN0aW9uIGZvciBkZXF1YW50aXppbmcgdGhlIGRhdGEgdHlwZVxuY29uc3QgZ2V0RGVxdWFudGl6ZUZ1bmMgPSAoc3JjVHlwZSkgPT4ge1xuICAgIC8vIHNlZSBodHRwczovL2dpdGh1Yi5jb20vS2hyb25vc0dyb3VwL2dsVEYvdHJlZS9tYXN0ZXIvZXh0ZW5zaW9ucy8yLjAvS2hyb25vcy9LSFJfbWVzaF9xdWFudGl6YXRpb24jZW5jb2RpbmctcXVhbnRpemVkLWRhdGFcbiAgICBzd2l0Y2ggKHNyY1R5cGUpIHtcbiAgICAgICAgY2FzZSBUWVBFX0lOVDg6IHJldHVybiB4ID0+IE1hdGgubWF4KHggLyAxMjcuMCwgLTEuMCk7XG4gICAgICAgIGNhc2UgVFlQRV9VSU5UODogcmV0dXJuIHggPT4geCAvIDI1NS4wO1xuICAgICAgICBjYXNlIFRZUEVfSU5UMTY6IHJldHVybiB4ID0+IE1hdGgubWF4KHggLyAzMjc2Ny4wLCAtMS4wKTtcbiAgICAgICAgY2FzZSBUWVBFX1VJTlQxNjogcmV0dXJuIHggPT4geCAvIDY1NTM1LjA7XG4gICAgICAgIGRlZmF1bHQ6IHJldHVybiB4ID0+IHg7XG4gICAgfVxufTtcblxuLy8gZGVxdWFudGl6ZSBhbiBhcnJheSBvZiBkYXRhXG5jb25zdCBkZXF1YW50aXplQXJyYXkgPSAoZHN0QXJyYXksIHNyY0FycmF5LCBzcmNUeXBlKSA9PiB7XG4gICAgY29uc3QgY29udkZ1bmMgPSBnZXREZXF1YW50aXplRnVuYyhzcmNUeXBlKTtcbiAgICBjb25zdCBsZW4gPSBzcmNBcnJheS5sZW5ndGg7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBsZW47ICsraSkge1xuICAgICAgICBkc3RBcnJheVtpXSA9IGNvbnZGdW5jKHNyY0FycmF5W2ldKTtcbiAgICB9XG4gICAgcmV0dXJuIGRzdEFycmF5O1xufTtcblxuLy8gZ2V0IGFjY2Vzc29yIGRhdGEsIG1ha2luZyBhIGNvcHkgYW5kIHBhdGNoaW5nIGluIHRoZSBjYXNlIG9mIGEgc3BhcnNlIGFjY2Vzc29yXG5jb25zdCBnZXRBY2Nlc3NvckRhdGEgPSAoZ2x0ZkFjY2Vzc29yLCBidWZmZXJWaWV3cywgZmxhdHRlbiA9IGZhbHNlKSA9PiB7XG4gICAgY29uc3QgbnVtQ29tcG9uZW50cyA9IGdldE51bUNvbXBvbmVudHMoZ2x0ZkFjY2Vzc29yLnR5cGUpO1xuICAgIGNvbnN0IGRhdGFUeXBlID0gZ2V0Q29tcG9uZW50RGF0YVR5cGUoZ2x0ZkFjY2Vzc29yLmNvbXBvbmVudFR5cGUpO1xuICAgIGlmICghZGF0YVR5cGUpIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgbGV0IHJlc3VsdDtcblxuICAgIGlmIChnbHRmQWNjZXNzb3Iuc3BhcnNlKSB7XG4gICAgICAgIC8vIGhhbmRsZSBzcGFyc2UgZGF0YVxuICAgICAgICBjb25zdCBzcGFyc2UgPSBnbHRmQWNjZXNzb3Iuc3BhcnNlO1xuXG4gICAgICAgIC8vIGdldCBpbmRpY2VzIGRhdGFcbiAgICAgICAgY29uc3QgaW5kaWNlc0FjY2Vzc29yID0ge1xuICAgICAgICAgICAgY291bnQ6IHNwYXJzZS5jb3VudCxcbiAgICAgICAgICAgIHR5cGU6ICdTQ0FMQVInXG4gICAgICAgIH07XG4gICAgICAgIGNvbnN0IGluZGljZXMgPSBnZXRBY2Nlc3NvckRhdGEoT2JqZWN0LmFzc2lnbihpbmRpY2VzQWNjZXNzb3IsIHNwYXJzZS5pbmRpY2VzKSwgYnVmZmVyVmlld3MsIHRydWUpO1xuXG4gICAgICAgIC8vIGRhdGEgdmFsdWVzIGRhdGFcbiAgICAgICAgY29uc3QgdmFsdWVzQWNjZXNzb3IgPSB7XG4gICAgICAgICAgICBjb3VudDogc3BhcnNlLmNvdW50LFxuICAgICAgICAgICAgdHlwZTogZ2x0ZkFjY2Vzc29yLnR5cGUsXG4gICAgICAgICAgICBjb21wb25lbnRUeXBlOiBnbHRmQWNjZXNzb3IuY29tcG9uZW50VHlwZVxuICAgICAgICB9O1xuICAgICAgICBjb25zdCB2YWx1ZXMgPSBnZXRBY2Nlc3NvckRhdGEoT2JqZWN0LmFzc2lnbih2YWx1ZXNBY2Nlc3Nvciwgc3BhcnNlLnZhbHVlcyksIGJ1ZmZlclZpZXdzLCB0cnVlKTtcblxuICAgICAgICAvLyBnZXQgYmFzZSBkYXRhXG4gICAgICAgIGlmIChnbHRmQWNjZXNzb3IuaGFzT3duUHJvcGVydHkoJ2J1ZmZlclZpZXcnKSkge1xuICAgICAgICAgICAgY29uc3QgYmFzZUFjY2Vzc29yID0ge1xuICAgICAgICAgICAgICAgIGJ1ZmZlclZpZXc6IGdsdGZBY2Nlc3Nvci5idWZmZXJWaWV3LFxuICAgICAgICAgICAgICAgIGJ5dGVPZmZzZXQ6IGdsdGZBY2Nlc3Nvci5ieXRlT2Zmc2V0LFxuICAgICAgICAgICAgICAgIGNvbXBvbmVudFR5cGU6IGdsdGZBY2Nlc3Nvci5jb21wb25lbnRUeXBlLFxuICAgICAgICAgICAgICAgIGNvdW50OiBnbHRmQWNjZXNzb3IuY291bnQsXG4gICAgICAgICAgICAgICAgdHlwZTogZ2x0ZkFjY2Vzc29yLnR5cGVcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICAvLyBtYWtlIGEgY29weSBvZiB0aGUgYmFzZSBkYXRhIHNpbmNlIHdlJ2xsIHBhdGNoIHRoZSB2YWx1ZXNcbiAgICAgICAgICAgIHJlc3VsdCA9IGdldEFjY2Vzc29yRGF0YShiYXNlQWNjZXNzb3IsIGJ1ZmZlclZpZXdzLCB0cnVlKS5zbGljZSgpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gdGhlcmUgaXMgbm8gYmFzZSBkYXRhLCBjcmVhdGUgZW1wdHkgMCdkIG91dCBkYXRhXG4gICAgICAgICAgICByZXN1bHQgPSBuZXcgZGF0YVR5cGUoZ2x0ZkFjY2Vzc29yLmNvdW50ICogbnVtQ29tcG9uZW50cyk7XG4gICAgICAgIH1cblxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHNwYXJzZS5jb3VudDsgKytpKSB7XG4gICAgICAgICAgICBjb25zdCB0YXJnZXRJbmRleCA9IGluZGljZXNbaV07XG4gICAgICAgICAgICBmb3IgKGxldCBqID0gMDsgaiA8IG51bUNvbXBvbmVudHM7ICsraikge1xuICAgICAgICAgICAgICAgIHJlc3VsdFt0YXJnZXRJbmRleCAqIG51bUNvbXBvbmVudHMgKyBqXSA9IHZhbHVlc1tpICogbnVtQ29tcG9uZW50cyArIGpdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKGdsdGZBY2Nlc3Nvci5oYXNPd25Qcm9wZXJ0eShcImJ1ZmZlclZpZXdcIikpIHtcbiAgICAgICAgICAgIGNvbnN0IGJ1ZmZlclZpZXcgPSBidWZmZXJWaWV3c1tnbHRmQWNjZXNzb3IuYnVmZmVyVmlld107XG4gICAgICAgICAgICBpZiAoZmxhdHRlbiAmJiBidWZmZXJWaWV3Lmhhc093blByb3BlcnR5KCdieXRlU3RyaWRlJykpIHtcbiAgICAgICAgICAgICAgICAvLyBmbGF0dGVuIHN0cmlkZGVuIGRhdGFcbiAgICAgICAgICAgICAgICBjb25zdCBieXRlc1BlckVsZW1lbnQgPSBudW1Db21wb25lbnRzICogZGF0YVR5cGUuQllURVNfUEVSX0VMRU1FTlQ7XG4gICAgICAgICAgICAgICAgY29uc3Qgc3RvcmFnZSA9IG5ldyBBcnJheUJ1ZmZlcihnbHRmQWNjZXNzb3IuY291bnQgKiBieXRlc1BlckVsZW1lbnQpO1xuICAgICAgICAgICAgICAgIGNvbnN0IHRtcEFycmF5ID0gbmV3IFVpbnQ4QXJyYXkoc3RvcmFnZSk7XG5cbiAgICAgICAgICAgICAgICBsZXQgZHN0T2Zmc2V0ID0gMDtcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGdsdGZBY2Nlc3Nvci5jb3VudDsgKytpKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIG5vIG5lZWQgdG8gYWRkIGJ1ZmZlclZpZXcuYnl0ZU9mZnNldCBiZWNhdXNlIGFjY2Vzc29yIHRha2VzIHRoaXMgaW50byBhY2NvdW50XG4gICAgICAgICAgICAgICAgICAgIGxldCBzcmNPZmZzZXQgPSAoZ2x0ZkFjY2Vzc29yLmJ5dGVPZmZzZXQgfHwgMCkgKyBpICogYnVmZmVyVmlldy5ieXRlU3RyaWRlO1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGxldCBiID0gMDsgYiA8IGJ5dGVzUGVyRWxlbWVudDsgKytiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0bXBBcnJheVtkc3RPZmZzZXQrK10gPSBidWZmZXJWaWV3W3NyY09mZnNldCsrXTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJlc3VsdCA9IG5ldyBkYXRhVHlwZShzdG9yYWdlKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0ID0gbmV3IGRhdGFUeXBlKGJ1ZmZlclZpZXcuYnVmZmVyLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBidWZmZXJWaWV3LmJ5dGVPZmZzZXQgKyAoZ2x0ZkFjY2Vzc29yLmJ5dGVPZmZzZXQgfHwgMCksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGdsdGZBY2Nlc3Nvci5jb3VudCAqIG51bUNvbXBvbmVudHMpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmVzdWx0ID0gbmV3IGRhdGFUeXBlKGdsdGZBY2Nlc3Nvci5jb3VudCAqIG51bUNvbXBvbmVudHMpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbi8vIGdldCBhY2Nlc3NvciBkYXRhIGFzICh1bm5vcm1hbGl6ZWQsIHVucXVhbnRpemVkKSBGbG9hdDMyIGRhdGFcbmNvbnN0IGdldEFjY2Vzc29yRGF0YUZsb2F0MzIgPSAoZ2x0ZkFjY2Vzc29yLCBidWZmZXJWaWV3cykgPT4ge1xuICAgIGNvbnN0IGRhdGEgPSBnZXRBY2Nlc3NvckRhdGEoZ2x0ZkFjY2Vzc29yLCBidWZmZXJWaWV3cywgdHJ1ZSk7XG4gICAgaWYgKGRhdGEgaW5zdGFuY2VvZiBGbG9hdDMyQXJyYXkgfHwgIWdsdGZBY2Nlc3Nvci5ub3JtYWxpemVkKSB7XG4gICAgICAgIC8vIGlmIHRoZSBzb3VyY2UgZGF0YSBpcyBxdWFudGl6ZWQgKHNheSB0byBpbnQxNiksIGJ1dCBub3Qgbm9ybWFsaXplZFxuICAgICAgICAvLyB0aGVuIHJlYWRpbmcgdGhlIHZhbHVlcyBvZiB0aGUgYXJyYXkgaXMgdGhlIHNhbWUgd2hldGhlciB0aGUgdmFsdWVzXG4gICAgICAgIC8vIGFyZSBzdG9yZWQgYXMgZmxvYXQzMiBvciBpbnQxNi4gc28gcHJvYmFibHkgbm8gbmVlZCB0byBjb252ZXJ0IHRvXG4gICAgICAgIC8vIGZsb2F0MzIuXG4gICAgICAgIHJldHVybiBkYXRhO1xuICAgIH1cblxuICAgIGNvbnN0IGZsb2F0MzJEYXRhID0gbmV3IEZsb2F0MzJBcnJheShkYXRhLmxlbmd0aCk7XG4gICAgZGVxdWFudGl6ZUFycmF5KGZsb2F0MzJEYXRhLCBkYXRhLCBnZXRDb21wb25lbnRUeXBlKGdsdGZBY2Nlc3Nvci5jb21wb25lbnRUeXBlKSk7XG4gICAgcmV0dXJuIGZsb2F0MzJEYXRhO1xufTtcblxuLy8gcmV0dXJucyBhIGRlcXVhbnRpemVkIGJvdW5kaW5nIGJveCBmb3IgdGhlIGFjY2Vzc29yXG5jb25zdCBnZXRBY2Nlc3NvckJvdW5kaW5nQm94ID0gKGdsdGZBY2Nlc3NvcikgPT4ge1xuICAgIGxldCBtaW4gPSBnbHRmQWNjZXNzb3IubWluO1xuICAgIGxldCBtYXggPSBnbHRmQWNjZXNzb3IubWF4O1xuICAgIGlmICghbWluIHx8ICFtYXgpIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgaWYgKGdsdGZBY2Nlc3Nvci5ub3JtYWxpemVkKSB7XG4gICAgICAgIGNvbnN0IGN0eXBlID0gZ2V0Q29tcG9uZW50VHlwZShnbHRmQWNjZXNzb3IuY29tcG9uZW50VHlwZSk7XG4gICAgICAgIG1pbiA9IGRlcXVhbnRpemVBcnJheShbXSwgbWluLCBjdHlwZSk7XG4gICAgICAgIG1heCA9IGRlcXVhbnRpemVBcnJheShbXSwgbWF4LCBjdHlwZSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIG5ldyBCb3VuZGluZ0JveChcbiAgICAgICAgbmV3IFZlYzMoKG1heFswXSArIG1pblswXSkgKiAwLjUsIChtYXhbMV0gKyBtaW5bMV0pICogMC41LCAobWF4WzJdICsgbWluWzJdKSAqIDAuNSksXG4gICAgICAgIG5ldyBWZWMzKChtYXhbMF0gLSBtaW5bMF0pICogMC41LCAobWF4WzFdIC0gbWluWzFdKSAqIDAuNSwgKG1heFsyXSAtIG1pblsyXSkgKiAwLjUpXG4gICAgKTtcbn07XG5cbmNvbnN0IGdldFByaW1pdGl2ZVR5cGUgPSAocHJpbWl0aXZlKSA9PiB7XG4gICAgaWYgKCFwcmltaXRpdmUuaGFzT3duUHJvcGVydHkoJ21vZGUnKSkge1xuICAgICAgICByZXR1cm4gUFJJTUlUSVZFX1RSSUFOR0xFUztcbiAgICB9XG5cbiAgICBzd2l0Y2ggKHByaW1pdGl2ZS5tb2RlKSB7XG4gICAgICAgIGNhc2UgMDogcmV0dXJuIFBSSU1JVElWRV9QT0lOVFM7XG4gICAgICAgIGNhc2UgMTogcmV0dXJuIFBSSU1JVElWRV9MSU5FUztcbiAgICAgICAgY2FzZSAyOiByZXR1cm4gUFJJTUlUSVZFX0xJTkVMT09QO1xuICAgICAgICBjYXNlIDM6IHJldHVybiBQUklNSVRJVkVfTElORVNUUklQO1xuICAgICAgICBjYXNlIDQ6IHJldHVybiBQUklNSVRJVkVfVFJJQU5HTEVTO1xuICAgICAgICBjYXNlIDU6IHJldHVybiBQUklNSVRJVkVfVFJJU1RSSVA7XG4gICAgICAgIGNhc2UgNjogcmV0dXJuIFBSSU1JVElWRV9UUklGQU47XG4gICAgICAgIGRlZmF1bHQ6IHJldHVybiBQUklNSVRJVkVfVFJJQU5HTEVTO1xuICAgIH1cbn07XG5cbmNvbnN0IGdlbmVyYXRlSW5kaWNlcyA9IChudW1WZXJ0aWNlcykgPT4ge1xuICAgIGNvbnN0IGR1bW15SW5kaWNlcyA9IG5ldyBVaW50MTZBcnJheShudW1WZXJ0aWNlcyk7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBudW1WZXJ0aWNlczsgaSsrKSB7XG4gICAgICAgIGR1bW15SW5kaWNlc1tpXSA9IGk7XG4gICAgfVxuICAgIHJldHVybiBkdW1teUluZGljZXM7XG59O1xuXG5jb25zdCBnZW5lcmF0ZU5vcm1hbHMgPSAoc291cmNlRGVzYywgaW5kaWNlcykgPT4ge1xuICAgIC8vIGdldCBwb3NpdGlvbnNcbiAgICBjb25zdCBwID0gc291cmNlRGVzY1tTRU1BTlRJQ19QT1NJVElPTl07XG4gICAgaWYgKCFwIHx8IHAuY29tcG9uZW50cyAhPT0gMykge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgbGV0IHBvc2l0aW9ucztcbiAgICBpZiAocC5zaXplICE9PSBwLnN0cmlkZSkge1xuICAgICAgICAvLyBleHRyYWN0IHBvc2l0aW9ucyB3aGljaCBhcmVuJ3QgdGlnaHRseSBwYWNrZWRcbiAgICAgICAgY29uc3Qgc3JjU3RyaWRlID0gcC5zdHJpZGUgLyB0eXBlZEFycmF5VHlwZXNCeXRlU2l6ZVtwLnR5cGVdO1xuICAgICAgICBjb25zdCBzcmMgPSBuZXcgdHlwZWRBcnJheVR5cGVzW3AudHlwZV0ocC5idWZmZXIsIHAub2Zmc2V0LCBwLmNvdW50ICogc3JjU3RyaWRlKTtcbiAgICAgICAgcG9zaXRpb25zID0gbmV3IHR5cGVkQXJyYXlUeXBlc1twLnR5cGVdKHAuY291bnQgKiAzKTtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBwLmNvdW50OyArK2kpIHtcbiAgICAgICAgICAgIHBvc2l0aW9uc1tpICogMyArIDBdID0gc3JjW2kgKiBzcmNTdHJpZGUgKyAwXTtcbiAgICAgICAgICAgIHBvc2l0aW9uc1tpICogMyArIDFdID0gc3JjW2kgKiBzcmNTdHJpZGUgKyAxXTtcbiAgICAgICAgICAgIHBvc2l0aW9uc1tpICogMyArIDJdID0gc3JjW2kgKiBzcmNTdHJpZGUgKyAyXTtcbiAgICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIHBvc2l0aW9uIGRhdGEgaXMgdGlnaHRseSBwYWNrZWQgc28gd2UgY2FuIHVzZSBpdCBkaXJlY3RseVxuICAgICAgICBwb3NpdGlvbnMgPSBuZXcgdHlwZWRBcnJheVR5cGVzW3AudHlwZV0ocC5idWZmZXIsIHAub2Zmc2V0LCBwLmNvdW50ICogMyk7XG4gICAgfVxuXG4gICAgY29uc3QgbnVtVmVydGljZXMgPSBwLmNvdW50O1xuXG4gICAgLy8gZ2VuZXJhdGUgaW5kaWNlcyBpZiBuZWNlc3NhcnlcbiAgICBpZiAoIWluZGljZXMpIHtcbiAgICAgICAgaW5kaWNlcyA9IGdlbmVyYXRlSW5kaWNlcyhudW1WZXJ0aWNlcyk7XG4gICAgfVxuXG4gICAgLy8gZ2VuZXJhdGUgbm9ybWFsc1xuICAgIGNvbnN0IG5vcm1hbHNUZW1wID0gY2FsY3VsYXRlTm9ybWFscyhwb3NpdGlvbnMsIGluZGljZXMpO1xuICAgIGNvbnN0IG5vcm1hbHMgPSBuZXcgRmxvYXQzMkFycmF5KG5vcm1hbHNUZW1wLmxlbmd0aCk7XG4gICAgbm9ybWFscy5zZXQobm9ybWFsc1RlbXApO1xuXG4gICAgc291cmNlRGVzY1tTRU1BTlRJQ19OT1JNQUxdID0ge1xuICAgICAgICBidWZmZXI6IG5vcm1hbHMuYnVmZmVyLFxuICAgICAgICBzaXplOiAxMixcbiAgICAgICAgb2Zmc2V0OiAwLFxuICAgICAgICBzdHJpZGU6IDEyLFxuICAgICAgICBjb3VudDogbnVtVmVydGljZXMsXG4gICAgICAgIGNvbXBvbmVudHM6IDMsXG4gICAgICAgIHR5cGU6IFRZUEVfRkxPQVQzMlxuICAgIH07XG59O1xuXG5jb25zdCBmbGlwVGV4Q29vcmRWcyA9ICh2ZXJ0ZXhCdWZmZXIpID0+IHtcbiAgICBsZXQgaSwgajtcblxuICAgIGNvbnN0IGZsb2F0T2Zmc2V0cyA9IFtdO1xuICAgIGNvbnN0IHNob3J0T2Zmc2V0cyA9IFtdO1xuICAgIGNvbnN0IGJ5dGVPZmZzZXRzID0gW107XG4gICAgZm9yIChpID0gMDsgaSA8IHZlcnRleEJ1ZmZlci5mb3JtYXQuZWxlbWVudHMubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgY29uc3QgZWxlbWVudCA9IHZlcnRleEJ1ZmZlci5mb3JtYXQuZWxlbWVudHNbaV07XG4gICAgICAgIGlmIChlbGVtZW50Lm5hbWUgPT09IFNFTUFOVElDX1RFWENPT1JEMCB8fFxuICAgICAgICAgICAgZWxlbWVudC5uYW1lID09PSBTRU1BTlRJQ19URVhDT09SRDEpIHtcbiAgICAgICAgICAgIHN3aXRjaCAoZWxlbWVudC5kYXRhVHlwZSkge1xuICAgICAgICAgICAgICAgIGNhc2UgVFlQRV9GTE9BVDMyOlxuICAgICAgICAgICAgICAgICAgICBmbG9hdE9mZnNldHMucHVzaCh7IG9mZnNldDogZWxlbWVudC5vZmZzZXQgLyA0ICsgMSwgc3RyaWRlOiBlbGVtZW50LnN0cmlkZSAvIDQgfSk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgVFlQRV9VSU5UMTY6XG4gICAgICAgICAgICAgICAgICAgIHNob3J0T2Zmc2V0cy5wdXNoKHsgb2Zmc2V0OiBlbGVtZW50Lm9mZnNldCAvIDIgKyAxLCBzdHJpZGU6IGVsZW1lbnQuc3RyaWRlIC8gMiB9KTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSBUWVBFX1VJTlQ4OlxuICAgICAgICAgICAgICAgICAgICBieXRlT2Zmc2V0cy5wdXNoKHsgb2Zmc2V0OiBlbGVtZW50Lm9mZnNldCArIDEsIHN0cmlkZTogZWxlbWVudC5zdHJpZGUgfSk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgZmxpcCA9IChvZmZzZXRzLCB0eXBlLCBvbmUpID0+IHtcbiAgICAgICAgY29uc3QgdHlwZWRBcnJheSA9IG5ldyB0eXBlKHZlcnRleEJ1ZmZlci5zdG9yYWdlKTtcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IG9mZnNldHMubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgICAgIGxldCBpbmRleCA9IG9mZnNldHNbaV0ub2Zmc2V0O1xuICAgICAgICAgICAgY29uc3Qgc3RyaWRlID0gb2Zmc2V0c1tpXS5zdHJpZGU7XG4gICAgICAgICAgICBmb3IgKGogPSAwOyBqIDwgdmVydGV4QnVmZmVyLm51bVZlcnRpY2VzOyArK2opIHtcbiAgICAgICAgICAgICAgICB0eXBlZEFycmF5W2luZGV4XSA9IG9uZSAtIHR5cGVkQXJyYXlbaW5kZXhdO1xuICAgICAgICAgICAgICAgIGluZGV4ICs9IHN0cmlkZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH07XG5cbiAgICBpZiAoZmxvYXRPZmZzZXRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgZmxpcChmbG9hdE9mZnNldHMsIEZsb2F0MzJBcnJheSwgMS4wKTtcbiAgICB9XG4gICAgaWYgKHNob3J0T2Zmc2V0cy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGZsaXAoc2hvcnRPZmZzZXRzLCBVaW50MTZBcnJheSwgNjU1MzUpO1xuICAgIH1cbiAgICBpZiAoYnl0ZU9mZnNldHMubGVuZ3RoID4gMCkge1xuICAgICAgICBmbGlwKGJ5dGVPZmZzZXRzLCBVaW50OEFycmF5LCAyNTUpO1xuICAgIH1cbn07XG5cbi8vIGdpdmVuIGEgdGV4dHVyZSwgY2xvbmUgaXRcbi8vIE5PVEU6IENQVS1zaWRlIHRleHR1cmUgZGF0YSB3aWxsIGJlIHNoYXJlZCBidXQgR1BVIG1lbW9yeSB3aWxsIGJlIGR1cGxpY2F0ZWRcbmNvbnN0IGNsb25lVGV4dHVyZSA9ICh0ZXh0dXJlKSA9PiB7XG4gICAgY29uc3Qgc2hhbGxvd0NvcHlMZXZlbHMgPSAodGV4dHVyZSkgPT4ge1xuICAgICAgICBjb25zdCByZXN1bHQgPSBbXTtcbiAgICAgICAgZm9yIChsZXQgbWlwID0gMDsgbWlwIDwgdGV4dHVyZS5fbGV2ZWxzLmxlbmd0aDsgKyttaXApIHtcbiAgICAgICAgICAgIGxldCBsZXZlbCA9IFtdO1xuICAgICAgICAgICAgaWYgKHRleHR1cmUuY3ViZW1hcCkge1xuICAgICAgICAgICAgICAgIGZvciAobGV0IGZhY2UgPSAwOyBmYWNlIDwgNjsgKytmYWNlKSB7XG4gICAgICAgICAgICAgICAgICAgIGxldmVsLnB1c2godGV4dHVyZS5fbGV2ZWxzW21pcF1bZmFjZV0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgbGV2ZWwgPSB0ZXh0dXJlLl9sZXZlbHNbbWlwXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJlc3VsdC5wdXNoKGxldmVsKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH07XG5cbiAgICBjb25zdCByZXN1bHQgPSBuZXcgVGV4dHVyZSh0ZXh0dXJlLmRldmljZSwgdGV4dHVyZSk7ICAgLy8gZHVwbGljYXRlIHRleHR1cmVcbiAgICByZXN1bHQuX2xldmVscyA9IHNoYWxsb3dDb3B5TGV2ZWxzKHRleHR1cmUpOyAgICAgICAgICAgIC8vIHNoYWxsb3cgY29weSB0aGUgbGV2ZWxzIHN0cnVjdHVyZVxuICAgIHJldHVybiByZXN1bHQ7XG59O1xuXG4vLyBnaXZlbiBhIHRleHR1cmUgYXNzZXQsIGNsb25lIGl0XG5jb25zdCBjbG9uZVRleHR1cmVBc3NldCA9IChzcmMpID0+IHtcbiAgICBjb25zdCByZXN1bHQgPSBuZXcgQXNzZXQoc3JjLm5hbWUgKyAnX2Nsb25lJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc3JjLnR5cGUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNyYy5maWxlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzcmMuZGF0YSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc3JjLm9wdGlvbnMpO1xuICAgIHJlc3VsdC5sb2FkZWQgPSB0cnVlO1xuICAgIHJlc3VsdC5yZXNvdXJjZSA9IGNsb25lVGV4dHVyZShzcmMucmVzb3VyY2UpO1xuICAgIHNyYy5yZWdpc3RyeS5hZGQocmVzdWx0KTtcbiAgICByZXR1cm4gcmVzdWx0O1xufTtcblxuY29uc3QgY3JlYXRlVmVydGV4QnVmZmVySW50ZXJuYWwgPSAoZGV2aWNlLCBzb3VyY2VEZXNjLCBmbGlwVikgPT4ge1xuICAgIGNvbnN0IHBvc2l0aW9uRGVzYyA9IHNvdXJjZURlc2NbU0VNQU5USUNfUE9TSVRJT05dO1xuICAgIGlmICghcG9zaXRpb25EZXNjKSB7XG4gICAgICAgIC8vIGlnbm9yZSBtZXNoZXMgd2l0aG91dCBwb3NpdGlvbnNcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIGNvbnN0IG51bVZlcnRpY2VzID0gcG9zaXRpb25EZXNjLmNvdW50O1xuXG4gICAgLy8gZ2VuZXJhdGUgdmVydGV4RGVzYyBlbGVtZW50c1xuICAgIGNvbnN0IHZlcnRleERlc2MgPSBbXTtcbiAgICBmb3IgKGNvbnN0IHNlbWFudGljIGluIHNvdXJjZURlc2MpIHtcbiAgICAgICAgaWYgKHNvdXJjZURlc2MuaGFzT3duUHJvcGVydHkoc2VtYW50aWMpKSB7XG4gICAgICAgICAgICB2ZXJ0ZXhEZXNjLnB1c2goe1xuICAgICAgICAgICAgICAgIHNlbWFudGljOiBzZW1hbnRpYyxcbiAgICAgICAgICAgICAgICBjb21wb25lbnRzOiBzb3VyY2VEZXNjW3NlbWFudGljXS5jb21wb25lbnRzLFxuICAgICAgICAgICAgICAgIHR5cGU6IHNvdXJjZURlc2Nbc2VtYW50aWNdLnR5cGUsXG4gICAgICAgICAgICAgICAgbm9ybWFsaXplOiAhIXNvdXJjZURlc2Nbc2VtYW50aWNdLm5vcm1hbGl6ZVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBzb3J0IHZlcnRleCBlbGVtZW50cyBieSBlbmdpbmUtaWRlYWwgb3JkZXJcbiAgICB2ZXJ0ZXhEZXNjLnNvcnQoKGxocywgcmhzKSA9PiB7XG4gICAgICAgIHJldHVybiBhdHRyaWJ1dGVPcmRlcltsaHMuc2VtYW50aWNdIC0gYXR0cmlidXRlT3JkZXJbcmhzLnNlbWFudGljXTtcbiAgICB9KTtcblxuICAgIGxldCBpLCBqLCBrO1xuICAgIGxldCBzb3VyY2UsIHRhcmdldCwgc291cmNlT2Zmc2V0O1xuXG4gICAgY29uc3QgdmVydGV4Rm9ybWF0ID0gbmV3IFZlcnRleEZvcm1hdChkZXZpY2UsIHZlcnRleERlc2MpO1xuXG4gICAgLy8gY2hlY2sgd2hldGhlciBzb3VyY2UgZGF0YSBpcyBjb3JyZWN0bHkgaW50ZXJsZWF2ZWRcbiAgICBsZXQgaXNDb3JyZWN0bHlJbnRlcmxlYXZlZCA9IHRydWU7XG4gICAgZm9yIChpID0gMDsgaSA8IHZlcnRleEZvcm1hdC5lbGVtZW50cy5sZW5ndGg7ICsraSkge1xuICAgICAgICB0YXJnZXQgPSB2ZXJ0ZXhGb3JtYXQuZWxlbWVudHNbaV07XG4gICAgICAgIHNvdXJjZSA9IHNvdXJjZURlc2NbdGFyZ2V0Lm5hbWVdO1xuICAgICAgICBzb3VyY2VPZmZzZXQgPSBzb3VyY2Uub2Zmc2V0IC0gcG9zaXRpb25EZXNjLm9mZnNldDtcbiAgICAgICAgaWYgKChzb3VyY2UuYnVmZmVyICE9PSBwb3NpdGlvbkRlc2MuYnVmZmVyKSB8fFxuICAgICAgICAgICAgKHNvdXJjZS5zdHJpZGUgIT09IHRhcmdldC5zdHJpZGUpIHx8XG4gICAgICAgICAgICAoc291cmNlLnNpemUgIT09IHRhcmdldC5zaXplKSB8fFxuICAgICAgICAgICAgKHNvdXJjZU9mZnNldCAhPT0gdGFyZ2V0Lm9mZnNldCkpIHtcbiAgICAgICAgICAgIGlzQ29ycmVjdGx5SW50ZXJsZWF2ZWQgPSBmYWxzZTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gY3JlYXRlIHZlcnRleCBidWZmZXJcbiAgICBjb25zdCB2ZXJ0ZXhCdWZmZXIgPSBuZXcgVmVydGV4QnVmZmVyKGRldmljZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZlcnRleEZvcm1hdCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG51bVZlcnRpY2VzLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgQlVGRkVSX1NUQVRJQyk7XG5cbiAgICBjb25zdCB2ZXJ0ZXhEYXRhID0gdmVydGV4QnVmZmVyLmxvY2soKTtcbiAgICBjb25zdCB0YXJnZXRBcnJheSA9IG5ldyBVaW50MzJBcnJheSh2ZXJ0ZXhEYXRhKTtcbiAgICBsZXQgc291cmNlQXJyYXk7XG5cbiAgICBpZiAoaXNDb3JyZWN0bHlJbnRlcmxlYXZlZCkge1xuICAgICAgICAvLyBjb3B5IGRhdGFcbiAgICAgICAgc291cmNlQXJyYXkgPSBuZXcgVWludDMyQXJyYXkocG9zaXRpb25EZXNjLmJ1ZmZlcixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcG9zaXRpb25EZXNjLm9mZnNldCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbnVtVmVydGljZXMgKiB2ZXJ0ZXhCdWZmZXIuZm9ybWF0LnNpemUgLyA0KTtcbiAgICAgICAgdGFyZ2V0QXJyYXkuc2V0KHNvdXJjZUFycmF5KTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBsZXQgdGFyZ2V0U3RyaWRlLCBzb3VyY2VTdHJpZGU7XG4gICAgICAgIC8vIGNvcHkgZGF0YSBhbmQgaW50ZXJsZWF2ZVxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgdmVydGV4QnVmZmVyLmZvcm1hdC5lbGVtZW50cy5sZW5ndGg7ICsraSkge1xuICAgICAgICAgICAgdGFyZ2V0ID0gdmVydGV4QnVmZmVyLmZvcm1hdC5lbGVtZW50c1tpXTtcbiAgICAgICAgICAgIHRhcmdldFN0cmlkZSA9IHRhcmdldC5zdHJpZGUgLyA0O1xuXG4gICAgICAgICAgICBzb3VyY2UgPSBzb3VyY2VEZXNjW3RhcmdldC5uYW1lXTtcbiAgICAgICAgICAgIHNvdXJjZVN0cmlkZSA9IHNvdXJjZS5zdHJpZGUgLyA0O1xuICAgICAgICAgICAgLy8gZW5zdXJlIHdlIGRvbid0IGdvIGJleW9uZCB0aGUgZW5kIG9mIHRoZSBhcnJheWJ1ZmZlciB3aGVuIGRlYWxpbmcgd2l0aFxuICAgICAgICAgICAgLy8gaW50ZXJsYWNlZCB2ZXJ0ZXggZm9ybWF0c1xuICAgICAgICAgICAgc291cmNlQXJyYXkgPSBuZXcgVWludDMyQXJyYXkoc291cmNlLmJ1ZmZlciwgc291cmNlLm9mZnNldCwgKHNvdXJjZS5jb3VudCAtIDEpICogc291cmNlU3RyaWRlICsgKHNvdXJjZS5zaXplICsgMykgLyA0KTtcblxuICAgICAgICAgICAgbGV0IHNyYyA9IDA7XG4gICAgICAgICAgICBsZXQgZHN0ID0gdGFyZ2V0Lm9mZnNldCAvIDQ7XG4gICAgICAgICAgICBjb25zdCBrZW5kID0gTWF0aC5mbG9vcigoc291cmNlLnNpemUgKyAzKSAvIDQpO1xuICAgICAgICAgICAgZm9yIChqID0gMDsgaiA8IG51bVZlcnRpY2VzOyArK2opIHtcbiAgICAgICAgICAgICAgICBmb3IgKGsgPSAwOyBrIDwga2VuZDsgKytrKSB7XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldEFycmF5W2RzdCArIGtdID0gc291cmNlQXJyYXlbc3JjICsga107XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHNyYyArPSBzb3VyY2VTdHJpZGU7XG4gICAgICAgICAgICAgICAgZHN0ICs9IHRhcmdldFN0cmlkZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmIChmbGlwVikge1xuICAgICAgICBmbGlwVGV4Q29vcmRWcyh2ZXJ0ZXhCdWZmZXIpO1xuICAgIH1cblxuICAgIHZlcnRleEJ1ZmZlci51bmxvY2soKTtcblxuICAgIHJldHVybiB2ZXJ0ZXhCdWZmZXI7XG59O1xuXG5jb25zdCBjcmVhdGVWZXJ0ZXhCdWZmZXIgPSAoZGV2aWNlLCBhdHRyaWJ1dGVzLCBpbmRpY2VzLCBhY2Nlc3NvcnMsIGJ1ZmZlclZpZXdzLCBmbGlwViwgdmVydGV4QnVmZmVyRGljdCkgPT4ge1xuXG4gICAgLy8gZXh0cmFjdCBsaXN0IG9mIGF0dHJpYnV0ZXMgdG8gdXNlXG4gICAgY29uc3QgdXNlQXR0cmlidXRlcyA9IHt9O1xuICAgIGNvbnN0IGF0dHJpYklkcyA9IFtdO1xuXG4gICAgZm9yIChjb25zdCBhdHRyaWIgaW4gYXR0cmlidXRlcykge1xuICAgICAgICBpZiAoYXR0cmlidXRlcy5oYXNPd25Qcm9wZXJ0eShhdHRyaWIpICYmIGdsdGZUb0VuZ2luZVNlbWFudGljTWFwLmhhc093blByb3BlcnR5KGF0dHJpYikpIHtcbiAgICAgICAgICAgIHVzZUF0dHJpYnV0ZXNbYXR0cmliXSA9IGF0dHJpYnV0ZXNbYXR0cmliXTtcblxuICAgICAgICAgICAgLy8gYnVpbGQgdW5pcXVlIGlkIGZvciBlYWNoIGF0dHJpYnV0ZSBpbiBmb3JtYXQ6IFNlbWFudGljOmFjY2Vzc29ySW5kZXhcbiAgICAgICAgICAgIGF0dHJpYklkcy5wdXNoKGF0dHJpYiArICc6JyArIGF0dHJpYnV0ZXNbYXR0cmliXSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBzb3J0IHVuaXF1ZSBpZHMgYW5kIGNyZWF0ZSB1bmlxdWUgdmVydGV4IGJ1ZmZlciBJRFxuICAgIGF0dHJpYklkcy5zb3J0KCk7XG4gICAgY29uc3QgdmJLZXkgPSBhdHRyaWJJZHMuam9pbigpO1xuXG4gICAgLy8gcmV0dXJuIGFscmVhZHkgY3JlYXRlZCB2ZXJ0ZXggYnVmZmVyIGlmIGlkZW50aWNhbFxuICAgIGxldCB2YiA9IHZlcnRleEJ1ZmZlckRpY3RbdmJLZXldO1xuICAgIGlmICghdmIpIHtcbiAgICAgICAgLy8gYnVpbGQgdmVydGV4IGJ1ZmZlciBmb3JtYXQgZGVzYyBhbmQgc291cmNlXG4gICAgICAgIGNvbnN0IHNvdXJjZURlc2MgPSB7fTtcbiAgICAgICAgZm9yIChjb25zdCBhdHRyaWIgaW4gdXNlQXR0cmlidXRlcykge1xuICAgICAgICAgICAgY29uc3QgYWNjZXNzb3IgPSBhY2Nlc3NvcnNbYXR0cmlidXRlc1thdHRyaWJdXTtcbiAgICAgICAgICAgIGNvbnN0IGFjY2Vzc29yRGF0YSA9IGdldEFjY2Vzc29yRGF0YShhY2Nlc3NvciwgYnVmZmVyVmlld3MpO1xuICAgICAgICAgICAgY29uc3QgYnVmZmVyVmlldyA9IGJ1ZmZlclZpZXdzW2FjY2Vzc29yLmJ1ZmZlclZpZXddO1xuICAgICAgICAgICAgY29uc3Qgc2VtYW50aWMgPSBnbHRmVG9FbmdpbmVTZW1hbnRpY01hcFthdHRyaWJdO1xuICAgICAgICAgICAgY29uc3Qgc2l6ZSA9IGdldE51bUNvbXBvbmVudHMoYWNjZXNzb3IudHlwZSkgKiBnZXRDb21wb25lbnRTaXplSW5CeXRlcyhhY2Nlc3Nvci5jb21wb25lbnRUeXBlKTtcbiAgICAgICAgICAgIGNvbnN0IHN0cmlkZSA9IGJ1ZmZlclZpZXcgJiYgYnVmZmVyVmlldy5oYXNPd25Qcm9wZXJ0eSgnYnl0ZVN0cmlkZScpID8gYnVmZmVyVmlldy5ieXRlU3RyaWRlIDogc2l6ZTtcbiAgICAgICAgICAgIHNvdXJjZURlc2Nbc2VtYW50aWNdID0ge1xuICAgICAgICAgICAgICAgIGJ1ZmZlcjogYWNjZXNzb3JEYXRhLmJ1ZmZlcixcbiAgICAgICAgICAgICAgICBzaXplOiBzaXplLFxuICAgICAgICAgICAgICAgIG9mZnNldDogYWNjZXNzb3JEYXRhLmJ5dGVPZmZzZXQsXG4gICAgICAgICAgICAgICAgc3RyaWRlOiBzdHJpZGUsXG4gICAgICAgICAgICAgICAgY291bnQ6IGFjY2Vzc29yLmNvdW50LFxuICAgICAgICAgICAgICAgIGNvbXBvbmVudHM6IGdldE51bUNvbXBvbmVudHMoYWNjZXNzb3IudHlwZSksXG4gICAgICAgICAgICAgICAgdHlwZTogZ2V0Q29tcG9uZW50VHlwZShhY2Nlc3Nvci5jb21wb25lbnRUeXBlKSxcbiAgICAgICAgICAgICAgICBub3JtYWxpemU6IGFjY2Vzc29yLm5vcm1hbGl6ZWRcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cblxuICAgICAgICAvLyBnZW5lcmF0ZSBub3JtYWxzIGlmIHRoZXkncmUgbWlzc2luZyAodGhpcyBzaG91bGQgcHJvYmFibHkgYmUgYSB1c2VyIG9wdGlvbilcbiAgICAgICAgaWYgKCFzb3VyY2VEZXNjLmhhc093blByb3BlcnR5KFNFTUFOVElDX05PUk1BTCkpIHtcbiAgICAgICAgICAgIGdlbmVyYXRlTm9ybWFscyhzb3VyY2VEZXNjLCBpbmRpY2VzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGNyZWF0ZSBhbmQgc3RvcmUgaXQgaW4gdGhlIGRpY3Rpb25hcnlcbiAgICAgICAgdmIgPSBjcmVhdGVWZXJ0ZXhCdWZmZXJJbnRlcm5hbChkZXZpY2UsIHNvdXJjZURlc2MsIGZsaXBWKTtcbiAgICAgICAgdmVydGV4QnVmZmVyRGljdFt2YktleV0gPSB2YjtcbiAgICB9XG5cbiAgICByZXR1cm4gdmI7XG59O1xuXG5jb25zdCBjcmVhdGVTa2luID0gKGRldmljZSwgZ2x0ZlNraW4sIGFjY2Vzc29ycywgYnVmZmVyVmlld3MsIG5vZGVzLCBnbGJTa2lucykgPT4ge1xuICAgIGxldCBpLCBqLCBiaW5kTWF0cml4O1xuICAgIGNvbnN0IGpvaW50cyA9IGdsdGZTa2luLmpvaW50cztcbiAgICBjb25zdCBudW1Kb2ludHMgPSBqb2ludHMubGVuZ3RoO1xuICAgIGNvbnN0IGlicCA9IFtdO1xuICAgIGlmIChnbHRmU2tpbi5oYXNPd25Qcm9wZXJ0eSgnaW52ZXJzZUJpbmRNYXRyaWNlcycpKSB7XG4gICAgICAgIGNvbnN0IGludmVyc2VCaW5kTWF0cmljZXMgPSBnbHRmU2tpbi5pbnZlcnNlQmluZE1hdHJpY2VzO1xuICAgICAgICBjb25zdCBpYm1EYXRhID0gZ2V0QWNjZXNzb3JEYXRhKGFjY2Vzc29yc1tpbnZlcnNlQmluZE1hdHJpY2VzXSwgYnVmZmVyVmlld3MsIHRydWUpO1xuICAgICAgICBjb25zdCBpYm1WYWx1ZXMgPSBbXTtcblxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgbnVtSm9pbnRzOyBpKyspIHtcbiAgICAgICAgICAgIGZvciAoaiA9IDA7IGogPCAxNjsgaisrKSB7XG4gICAgICAgICAgICAgICAgaWJtVmFsdWVzW2pdID0gaWJtRGF0YVtpICogMTYgKyBqXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGJpbmRNYXRyaXggPSBuZXcgTWF0NCgpO1xuICAgICAgICAgICAgYmluZE1hdHJpeC5zZXQoaWJtVmFsdWVzKTtcbiAgICAgICAgICAgIGlicC5wdXNoKGJpbmRNYXRyaXgpO1xuICAgICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IG51bUpvaW50czsgaSsrKSB7XG4gICAgICAgICAgICBiaW5kTWF0cml4ID0gbmV3IE1hdDQoKTtcbiAgICAgICAgICAgIGlicC5wdXNoKGJpbmRNYXRyaXgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgYm9uZU5hbWVzID0gW107XG4gICAgZm9yIChpID0gMDsgaSA8IG51bUpvaW50czsgaSsrKSB7XG4gICAgICAgIGJvbmVOYW1lc1tpXSA9IG5vZGVzW2pvaW50c1tpXV0ubmFtZTtcbiAgICB9XG5cbiAgICAvLyBjcmVhdGUgYSBjYWNoZSBrZXkgZnJvbSBib25lIG5hbWVzIGFuZCBzZWUgaWYgd2UgaGF2ZSBtYXRjaGluZyBza2luXG4gICAgY29uc3Qga2V5ID0gYm9uZU5hbWVzLmpvaW4oJyMnKTtcbiAgICBsZXQgc2tpbiA9IGdsYlNraW5zLmdldChrZXkpO1xuICAgIGlmICghc2tpbikge1xuXG4gICAgICAgIC8vIGNyZWF0ZSB0aGUgc2tpbiBhbmQgYWRkIGl0IHRvIHRoZSBjYWNoZVxuICAgICAgICBza2luID0gbmV3IFNraW4oZGV2aWNlLCBpYnAsIGJvbmVOYW1lcyk7XG4gICAgICAgIGdsYlNraW5zLnNldChrZXksIHNraW4pO1xuICAgIH1cblxuICAgIHJldHVybiBza2luO1xufTtcblxuY29uc3QgY3JlYXRlRHJhY29NZXNoID0gKGRldmljZSwgcHJpbWl0aXZlLCBhY2Nlc3NvcnMsIGJ1ZmZlclZpZXdzLCBtZXNoVmFyaWFudHMsIG1lc2hEZWZhdWx0TWF0ZXJpYWxzLCBwcm9taXNlcykgPT4ge1xuICAgIC8vIGNyZWF0ZSB0aGUgbWVzaFxuICAgIGNvbnN0IHJlc3VsdCA9IG5ldyBNZXNoKGRldmljZSk7XG4gICAgcmVzdWx0LmFhYmIgPSBnZXRBY2Nlc3NvckJvdW5kaW5nQm94KGFjY2Vzc29yc1twcmltaXRpdmUuYXR0cmlidXRlcy5QT1NJVElPTl0pO1xuXG4gICAgLy8gY3JlYXRlIHZlcnRleCBkZXNjcmlwdGlvblxuICAgIGNvbnN0IHZlcnRleERlc2MgPSBbXTtcbiAgICBmb3IgKGNvbnN0IFtuYW1lLCBpbmRleF0gb2YgT2JqZWN0LmVudHJpZXMocHJpbWl0aXZlLmF0dHJpYnV0ZXMpKSB7XG4gICAgICAgIGNvbnN0IGFjY2Vzc29yID0gYWNjZXNzb3JzW2luZGV4XTtcbiAgICAgICAgY29uc3Qgc2VtYW50aWMgPSBnbHRmVG9FbmdpbmVTZW1hbnRpY01hcFtuYW1lXTtcbiAgICAgICAgY29uc3QgY29tcG9uZW50VHlwZSA9IGdldENvbXBvbmVudFR5cGUoYWNjZXNzb3IuY29tcG9uZW50VHlwZSk7XG5cbiAgICAgICAgdmVydGV4RGVzYy5wdXNoKHtcbiAgICAgICAgICAgIHNlbWFudGljOiBzZW1hbnRpYyxcbiAgICAgICAgICAgIGNvbXBvbmVudHM6IGdldE51bUNvbXBvbmVudHMoYWNjZXNzb3IudHlwZSksXG4gICAgICAgICAgICB0eXBlOiBjb21wb25lbnRUeXBlLFxuICAgICAgICAgICAgbm9ybWFsaXplOiBhY2Nlc3Nvci5ub3JtYWxpemVkID8/IChzZW1hbnRpYyA9PT0gU0VNQU5USUNfQ09MT1IgJiYgKGNvbXBvbmVudFR5cGUgPT09IFRZUEVfVUlOVDggfHwgY29tcG9uZW50VHlwZSA9PT0gVFlQRV9VSU5UMTYpKVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcm9taXNlcy5wdXNoKG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgLy8gZGVjb2RlIGRyYWNvIGRhdGFcbiAgICAgICAgY29uc3QgZHJhY29FeHQgPSBwcmltaXRpdmUuZXh0ZW5zaW9ucy5LSFJfZHJhY29fbWVzaF9jb21wcmVzc2lvbjtcbiAgICAgICAgZHJhY29EZWNvZGUoYnVmZmVyVmlld3NbZHJhY29FeHQuYnVmZmVyVmlld10uc2xpY2UoKS5idWZmZXIsIChlcnIsIGRlY29tcHJlc3NlZERhdGEpID0+IHtcbiAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhlcnIpO1xuICAgICAgICAgICAgICAgIHJlamVjdChlcnIpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyB3b3JrZXIgcmVwb3J0cyBvcmRlciBvZiBhdHRyaWJ1dGVzIGFzIGFycmF5IG9mIGF0dHJpYnV0ZSB1bmlxdWVfaWRcbiAgICAgICAgICAgICAgICBjb25zdCBvcmRlciA9IHsgfTtcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IFtuYW1lLCBpbmRleF0gb2YgT2JqZWN0LmVudHJpZXMoZHJhY29FeHQuYXR0cmlidXRlcykpIHtcbiAgICAgICAgICAgICAgICAgICAgb3JkZXJbZ2x0ZlRvRW5naW5lU2VtYW50aWNNYXBbbmFtZV1dID0gZGVjb21wcmVzc2VkRGF0YS5hdHRyaWJ1dGVzLmluZGV4T2YoaW5kZXgpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIG9yZGVyIHZlcnRleERlc2NcbiAgICAgICAgICAgICAgICB2ZXJ0ZXhEZXNjLnNvcnQoKGEsIGIpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG9yZGVyW2Euc2VtYW50aWNdIC0gb3JkZXJbYi5zZW1hbnRpY107XG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICAvLyBkcmFjbyBkZWNvbXByZXNzb3Igd2lsbCBnZW5lcmF0ZSBub3JtYWxzIGlmIHRoZXkgYXJlIG1pc3NpbmdcbiAgICAgICAgICAgICAgICBpZiAoIXByaW1pdGl2ZS5hdHRyaWJ1dGVzPy5OT1JNQUwpIHtcbiAgICAgICAgICAgICAgICAgICAgdmVydGV4RGVzYy5zcGxpY2UoMSwgMCwge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2VtYW50aWM6ICdOT1JNQUwnLFxuICAgICAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50czogMyxcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6IFRZUEVfRkxPQVQzMlxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBjb25zdCB2ZXJ0ZXhGb3JtYXQgPSBuZXcgVmVydGV4Rm9ybWF0KGRldmljZSwgdmVydGV4RGVzYyk7XG5cbiAgICAgICAgICAgICAgICAvLyBjcmVhdGUgdmVydGV4IGJ1ZmZlclxuICAgICAgICAgICAgICAgIGNvbnN0IG51bVZlcnRpY2VzID0gZGVjb21wcmVzc2VkRGF0YS52ZXJ0aWNlcy5ieXRlTGVuZ3RoIC8gdmVydGV4Rm9ybWF0LnNpemU7XG4gICAgICAgICAgICAgICAgY29uc3QgaW5kZXhGb3JtYXQgPSBudW1WZXJ0aWNlcyA8PSA2NTUzNSA/IElOREVYRk9STUFUX1VJTlQxNiA6IElOREVYRk9STUFUX1VJTlQzMjtcbiAgICAgICAgICAgICAgICBjb25zdCBudW1JbmRpY2VzID0gZGVjb21wcmVzc2VkRGF0YS5pbmRpY2VzLmJ5dGVMZW5ndGggLyAobnVtVmVydGljZXMgPD0gNjU1MzUgPyAyIDogNCk7XG5cbiAgICAgICAgICAgICAgICBEZWJ1Zy5jYWxsKCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKG51bVZlcnRpY2VzICE9PSBhY2Nlc3NvcnNbcHJpbWl0aXZlLmF0dHJpYnV0ZXMuUE9TSVRJT05dLmNvdW50KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBEZWJ1Zy53YXJuKCdtZXNoIGhhcyBpbnZhbGlkIHZlcnRleCBjb3VudCcpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGlmIChudW1JbmRpY2VzICE9PSBhY2Nlc3NvcnNbcHJpbWl0aXZlLmluZGljZXNdLmNvdW50KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBEZWJ1Zy53YXJuKCdtZXNoIGhhcyBpbnZhbGlkIGluZGV4IGNvdW50Jyk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgIGNvbnN0IHZlcnRleEJ1ZmZlciA9IG5ldyBWZXJ0ZXhCdWZmZXIoZGV2aWNlLCB2ZXJ0ZXhGb3JtYXQsIG51bVZlcnRpY2VzLCBCVUZGRVJfU1RBVElDLCBkZWNvbXByZXNzZWREYXRhLnZlcnRpY2VzKTtcbiAgICAgICAgICAgICAgICBjb25zdCBpbmRleEJ1ZmZlciA9IG5ldyBJbmRleEJ1ZmZlcihkZXZpY2UsIGluZGV4Rm9ybWF0LCBudW1JbmRpY2VzLCBCVUZGRVJfU1RBVElDLCBkZWNvbXByZXNzZWREYXRhLmluZGljZXMpO1xuXG4gICAgICAgICAgICAgICAgcmVzdWx0LnZlcnRleEJ1ZmZlciA9IHZlcnRleEJ1ZmZlcjtcbiAgICAgICAgICAgICAgICByZXN1bHQuaW5kZXhCdWZmZXJbMF0gPSBpbmRleEJ1ZmZlcjtcbiAgICAgICAgICAgICAgICByZXN1bHQucHJpbWl0aXZlWzBdLnR5cGUgPSBnZXRQcmltaXRpdmVUeXBlKHByaW1pdGl2ZSk7XG4gICAgICAgICAgICAgICAgcmVzdWx0LnByaW1pdGl2ZVswXS5iYXNlID0gMDtcbiAgICAgICAgICAgICAgICByZXN1bHQucHJpbWl0aXZlWzBdLmNvdW50ID0gaW5kZXhCdWZmZXIgPyBudW1JbmRpY2VzIDogbnVtVmVydGljZXM7XG4gICAgICAgICAgICAgICAgcmVzdWx0LnByaW1pdGl2ZVswXS5pbmRleGVkID0gISFpbmRleEJ1ZmZlcjtcblxuICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfSkpO1xuXG4gICAgLy8gaGFuZGxlIG1hdGVyaWFsIHZhcmlhbnRzXG4gICAgaWYgKHByaW1pdGl2ZT8uZXh0ZW5zaW9ucz8uS0hSX21hdGVyaWFsc192YXJpYW50cykge1xuICAgICAgICBjb25zdCB2YXJpYW50cyA9IHByaW1pdGl2ZS5leHRlbnNpb25zLktIUl9tYXRlcmlhbHNfdmFyaWFudHM7XG4gICAgICAgIGNvbnN0IHRlbXBNYXBwaW5nID0ge307XG4gICAgICAgIHZhcmlhbnRzLm1hcHBpbmdzLmZvckVhY2goKG1hcHBpbmcpID0+IHtcbiAgICAgICAgICAgIG1hcHBpbmcudmFyaWFudHMuZm9yRWFjaCgodmFyaWFudCkgPT4ge1xuICAgICAgICAgICAgICAgIHRlbXBNYXBwaW5nW3ZhcmlhbnRdID0gbWFwcGluZy5tYXRlcmlhbDtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICAgICAgbWVzaFZhcmlhbnRzW3Jlc3VsdC5pZF0gPSB0ZW1wTWFwcGluZztcbiAgICB9XG4gICAgbWVzaERlZmF1bHRNYXRlcmlhbHNbcmVzdWx0LmlkXSA9IHByaW1pdGl2ZS5tYXRlcmlhbDtcblxuICAgIHJldHVybiByZXN1bHQ7XG59O1xuXG5jb25zdCBjcmVhdGVNZXNoID0gKGRldmljZSwgZ2x0Zk1lc2gsIGFjY2Vzc29ycywgYnVmZmVyVmlld3MsIGZsaXBWLCB2ZXJ0ZXhCdWZmZXJEaWN0LCBtZXNoVmFyaWFudHMsIG1lc2hEZWZhdWx0TWF0ZXJpYWxzLCBhc3NldE9wdGlvbnMsIHByb21pc2VzKSA9PiB7XG4gICAgY29uc3QgbWVzaGVzID0gW107XG5cbiAgICBnbHRmTWVzaC5wcmltaXRpdmVzLmZvckVhY2goKHByaW1pdGl2ZSkgPT4ge1xuXG4gICAgICAgIGlmIChwcmltaXRpdmUuZXh0ZW5zaW9ucz8uS0hSX2RyYWNvX21lc2hfY29tcHJlc3Npb24pIHtcbiAgICAgICAgICAgIC8vIGhhbmRsZSBkcmFjbyBjb21wcmVzc2VkIG1lc2hcbiAgICAgICAgICAgIG1lc2hlcy5wdXNoKGNyZWF0ZURyYWNvTWVzaChkZXZpY2UsIHByaW1pdGl2ZSwgYWNjZXNzb3JzLCBidWZmZXJWaWV3cywgbWVzaFZhcmlhbnRzLCBtZXNoRGVmYXVsdE1hdGVyaWFscywgcHJvbWlzZXMpKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIGhhbmRsZSB1bmNvbXByZXNzZWQgbWVzaFxuICAgICAgICAgICAgbGV0IGluZGljZXMgPSBwcmltaXRpdmUuaGFzT3duUHJvcGVydHkoJ2luZGljZXMnKSA/IGdldEFjY2Vzc29yRGF0YShhY2Nlc3NvcnNbcHJpbWl0aXZlLmluZGljZXNdLCBidWZmZXJWaWV3cywgdHJ1ZSkgOiBudWxsO1xuICAgICAgICAgICAgY29uc3QgdmVydGV4QnVmZmVyID0gY3JlYXRlVmVydGV4QnVmZmVyKGRldmljZSwgcHJpbWl0aXZlLmF0dHJpYnV0ZXMsIGluZGljZXMsIGFjY2Vzc29ycywgYnVmZmVyVmlld3MsIGZsaXBWLCB2ZXJ0ZXhCdWZmZXJEaWN0KTtcbiAgICAgICAgICAgIGNvbnN0IHByaW1pdGl2ZVR5cGUgPSBnZXRQcmltaXRpdmVUeXBlKHByaW1pdGl2ZSk7XG5cbiAgICAgICAgICAgIC8vIGJ1aWxkIHRoZSBtZXNoXG4gICAgICAgICAgICBjb25zdCBtZXNoID0gbmV3IE1lc2goZGV2aWNlKTtcbiAgICAgICAgICAgIG1lc2gudmVydGV4QnVmZmVyID0gdmVydGV4QnVmZmVyO1xuICAgICAgICAgICAgbWVzaC5wcmltaXRpdmVbMF0udHlwZSA9IHByaW1pdGl2ZVR5cGU7XG4gICAgICAgICAgICBtZXNoLnByaW1pdGl2ZVswXS5iYXNlID0gMDtcbiAgICAgICAgICAgIG1lc2gucHJpbWl0aXZlWzBdLmluZGV4ZWQgPSAoaW5kaWNlcyAhPT0gbnVsbCk7XG5cbiAgICAgICAgICAgIC8vIGluZGV4IGJ1ZmZlclxuICAgICAgICAgICAgaWYgKGluZGljZXMgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICBsZXQgaW5kZXhGb3JtYXQ7XG4gICAgICAgICAgICAgICAgaWYgKGluZGljZXMgaW5zdGFuY2VvZiBVaW50OEFycmF5KSB7XG4gICAgICAgICAgICAgICAgICAgIGluZGV4Rm9ybWF0ID0gSU5ERVhGT1JNQVRfVUlOVDg7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChpbmRpY2VzIGluc3RhbmNlb2YgVWludDE2QXJyYXkpIHtcbiAgICAgICAgICAgICAgICAgICAgaW5kZXhGb3JtYXQgPSBJTkRFWEZPUk1BVF9VSU5UMTY7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgaW5kZXhGb3JtYXQgPSBJTkRFWEZPUk1BVF9VSU5UMzI7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gMzJiaXQgaW5kZXggYnVmZmVyIGlzIHVzZWQgYnV0IG5vdCBzdXBwb3J0ZWRcbiAgICAgICAgICAgICAgICBpZiAoaW5kZXhGb3JtYXQgPT09IElOREVYRk9STUFUX1VJTlQzMiAmJiAhZGV2aWNlLmV4dFVpbnRFbGVtZW50KSB7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gI2lmIF9ERUJVR1xuICAgICAgICAgICAgICAgICAgICBpZiAodmVydGV4QnVmZmVyLm51bVZlcnRpY2VzID4gMHhGRkZGKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oJ0dsYiBmaWxlIGNvbnRhaW5zIDMyYml0IGluZGV4IGJ1ZmZlciBidXQgdGhlc2UgYXJlIG5vdCBzdXBwb3J0ZWQgYnkgdGhpcyBkZXZpY2UgLSBpdCBtYXkgYmUgcmVuZGVyZWQgaW5jb3JyZWN0bHkuJyk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgLy8gI2VuZGlmXG5cbiAgICAgICAgICAgICAgICAgICAgLy8gY29udmVydCB0byAxNmJpdFxuICAgICAgICAgICAgICAgICAgICBpbmRleEZvcm1hdCA9IElOREVYRk9STUFUX1VJTlQxNjtcbiAgICAgICAgICAgICAgICAgICAgaW5kaWNlcyA9IG5ldyBVaW50MTZBcnJheShpbmRpY2VzKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoaW5kZXhGb3JtYXQgPT09IElOREVYRk9STUFUX1VJTlQ4ICYmIGRldmljZS5pc1dlYkdQVSkge1xuICAgICAgICAgICAgICAgICAgICBEZWJ1Zy53YXJuKCdHbGIgZmlsZSBjb250YWlucyA4Yml0IGluZGV4IGJ1ZmZlciBidXQgdGhlc2UgYXJlIG5vdCBzdXBwb3J0ZWQgYnkgV2ViR1BVIC0gY29udmVydGluZyB0byAxNmJpdC4nKTtcblxuICAgICAgICAgICAgICAgICAgICAvLyBjb252ZXJ0IHRvIDE2Yml0XG4gICAgICAgICAgICAgICAgICAgIGluZGV4Rm9ybWF0ID0gSU5ERVhGT1JNQVRfVUlOVDE2O1xuICAgICAgICAgICAgICAgICAgICBpbmRpY2VzID0gbmV3IFVpbnQxNkFycmF5KGluZGljZXMpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGNvbnN0IGluZGV4QnVmZmVyID0gbmV3IEluZGV4QnVmZmVyKGRldmljZSwgaW5kZXhGb3JtYXQsIGluZGljZXMubGVuZ3RoLCBCVUZGRVJfU1RBVElDLCBpbmRpY2VzKTtcbiAgICAgICAgICAgICAgICBtZXNoLmluZGV4QnVmZmVyWzBdID0gaW5kZXhCdWZmZXI7XG4gICAgICAgICAgICAgICAgbWVzaC5wcmltaXRpdmVbMF0uY291bnQgPSBpbmRpY2VzLmxlbmd0aDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgbWVzaC5wcmltaXRpdmVbMF0uY291bnQgPSB2ZXJ0ZXhCdWZmZXIubnVtVmVydGljZXM7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChwcmltaXRpdmUuaGFzT3duUHJvcGVydHkoXCJleHRlbnNpb25zXCIpICYmIHByaW1pdGl2ZS5leHRlbnNpb25zLmhhc093blByb3BlcnR5KFwiS0hSX21hdGVyaWFsc192YXJpYW50c1wiKSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHZhcmlhbnRzID0gcHJpbWl0aXZlLmV4dGVuc2lvbnMuS0hSX21hdGVyaWFsc192YXJpYW50cztcbiAgICAgICAgICAgICAgICBjb25zdCB0ZW1wTWFwcGluZyA9IHt9O1xuICAgICAgICAgICAgICAgIHZhcmlhbnRzLm1hcHBpbmdzLmZvckVhY2goKG1hcHBpbmcpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgbWFwcGluZy52YXJpYW50cy5mb3JFYWNoKCh2YXJpYW50KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0ZW1wTWFwcGluZ1t2YXJpYW50XSA9IG1hcHBpbmcubWF0ZXJpYWw7XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIG1lc2hWYXJpYW50c1ttZXNoLmlkXSA9IHRlbXBNYXBwaW5nO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBtZXNoRGVmYXVsdE1hdGVyaWFsc1ttZXNoLmlkXSA9IHByaW1pdGl2ZS5tYXRlcmlhbDtcblxuICAgICAgICAgICAgbGV0IGFjY2Vzc29yID0gYWNjZXNzb3JzW3ByaW1pdGl2ZS5hdHRyaWJ1dGVzLlBPU0lUSU9OXTtcbiAgICAgICAgICAgIG1lc2guYWFiYiA9IGdldEFjY2Vzc29yQm91bmRpbmdCb3goYWNjZXNzb3IpO1xuXG4gICAgICAgICAgICAvLyBtb3JwaCB0YXJnZXRzXG4gICAgICAgICAgICBpZiAocHJpbWl0aXZlLmhhc093blByb3BlcnR5KCd0YXJnZXRzJykpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB0YXJnZXRzID0gW107XG5cbiAgICAgICAgICAgICAgICBwcmltaXRpdmUudGFyZ2V0cy5mb3JFYWNoKCh0YXJnZXQsIGluZGV4KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG9wdGlvbnMgPSB7fTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAodGFyZ2V0Lmhhc093blByb3BlcnR5KCdQT1NJVElPTicpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhY2Nlc3NvciA9IGFjY2Vzc29yc1t0YXJnZXQuUE9TSVRJT05dO1xuICAgICAgICAgICAgICAgICAgICAgICAgb3B0aW9ucy5kZWx0YVBvc2l0aW9ucyA9IGdldEFjY2Vzc29yRGF0YUZsb2F0MzIoYWNjZXNzb3IsIGJ1ZmZlclZpZXdzKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIG9wdGlvbnMuZGVsdGFQb3NpdGlvbnNUeXBlID0gVFlQRV9GTE9BVDMyO1xuICAgICAgICAgICAgICAgICAgICAgICAgb3B0aW9ucy5hYWJiID0gZ2V0QWNjZXNzb3JCb3VuZGluZ0JveChhY2Nlc3Nvcik7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBpZiAodGFyZ2V0Lmhhc093blByb3BlcnR5KCdOT1JNQUwnKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgYWNjZXNzb3IgPSBhY2Nlc3NvcnNbdGFyZ2V0Lk5PUk1BTF07XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBOT1RFOiB0aGUgbW9ycGggdGFyZ2V0cyBjYW4ndCBjdXJyZW50bHkgYWNjZXB0IHF1YW50aXplZCBub3JtYWxzXG4gICAgICAgICAgICAgICAgICAgICAgICBvcHRpb25zLmRlbHRhTm9ybWFscyA9IGdldEFjY2Vzc29yRGF0YUZsb2F0MzIoYWNjZXNzb3IsIGJ1ZmZlclZpZXdzKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIG9wdGlvbnMuZGVsdGFOb3JtYWxzVHlwZSA9IFRZUEVfRkxPQVQzMjtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIG5hbWUgaWYgc3BlY2lmaWVkXG4gICAgICAgICAgICAgICAgICAgIGlmIChnbHRmTWVzaC5oYXNPd25Qcm9wZXJ0eSgnZXh0cmFzJykgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgIGdsdGZNZXNoLmV4dHJhcy5oYXNPd25Qcm9wZXJ0eSgndGFyZ2V0TmFtZXMnKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgb3B0aW9ucy5uYW1lID0gZ2x0Zk1lc2guZXh0cmFzLnRhcmdldE5hbWVzW2luZGV4XTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG9wdGlvbnMubmFtZSA9IGluZGV4LnRvU3RyaW5nKDEwKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIGRlZmF1bHQgd2VpZ2h0IGlmIHNwZWNpZmllZFxuICAgICAgICAgICAgICAgICAgICBpZiAoZ2x0Zk1lc2guaGFzT3duUHJvcGVydHkoJ3dlaWdodHMnKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgb3B0aW9ucy5kZWZhdWx0V2VpZ2h0ID0gZ2x0Zk1lc2gud2VpZ2h0c1tpbmRleF07XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBvcHRpb25zLnByZXNlcnZlRGF0YSA9IGFzc2V0T3B0aW9ucy5tb3JwaFByZXNlcnZlRGF0YTtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0cy5wdXNoKG5ldyBNb3JwaFRhcmdldChvcHRpb25zKSk7XG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICBtZXNoLm1vcnBoID0gbmV3IE1vcnBoKHRhcmdldHMsIGRldmljZSwge1xuICAgICAgICAgICAgICAgICAgICBwcmVmZXJIaWdoUHJlY2lzaW9uOiBhc3NldE9wdGlvbnMubW9ycGhQcmVmZXJIaWdoUHJlY2lzaW9uXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBtZXNoZXMucHVzaChtZXNoKTtcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIG1lc2hlcztcbn07XG5cbmNvbnN0IGV4dHJhY3RUZXh0dXJlVHJhbnNmb3JtID0gKHNvdXJjZSwgbWF0ZXJpYWwsIG1hcHMpID0+IHtcbiAgICBsZXQgbWFwO1xuXG4gICAgY29uc3QgdGV4Q29vcmQgPSBzb3VyY2UudGV4Q29vcmQ7XG4gICAgaWYgKHRleENvb3JkKSB7XG4gICAgICAgIGZvciAobWFwID0gMDsgbWFwIDwgbWFwcy5sZW5ndGg7ICsrbWFwKSB7XG4gICAgICAgICAgICBtYXRlcmlhbFttYXBzW21hcF0gKyAnTWFwVXYnXSA9IHRleENvb3JkO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgemVyb3MgPSBbMCwgMF07XG4gICAgY29uc3Qgb25lcyA9IFsxLCAxXTtcbiAgICBjb25zdCB0ZXh0dXJlVHJhbnNmb3JtID0gc291cmNlLmV4dGVuc2lvbnM/LktIUl90ZXh0dXJlX3RyYW5zZm9ybTtcbiAgICBpZiAodGV4dHVyZVRyYW5zZm9ybSkge1xuICAgICAgICBjb25zdCBvZmZzZXQgPSB0ZXh0dXJlVHJhbnNmb3JtLm9mZnNldCB8fCB6ZXJvcztcbiAgICAgICAgY29uc3Qgc2NhbGUgPSB0ZXh0dXJlVHJhbnNmb3JtLnNjYWxlIHx8IG9uZXM7XG4gICAgICAgIGNvbnN0IHJvdGF0aW9uID0gdGV4dHVyZVRyYW5zZm9ybS5yb3RhdGlvbiA/ICgtdGV4dHVyZVRyYW5zZm9ybS5yb3RhdGlvbiAqIG1hdGguUkFEX1RPX0RFRykgOiAwO1xuXG4gICAgICAgIGNvbnN0IHRpbGluZ1ZlYyA9IG5ldyBWZWMyKHNjYWxlWzBdLCBzY2FsZVsxXSk7XG4gICAgICAgIGNvbnN0IG9mZnNldFZlYyA9IG5ldyBWZWMyKG9mZnNldFswXSwgMS4wIC0gc2NhbGVbMV0gLSBvZmZzZXRbMV0pO1xuXG4gICAgICAgIGZvciAobWFwID0gMDsgbWFwIDwgbWFwcy5sZW5ndGg7ICsrbWFwKSB7XG4gICAgICAgICAgICBtYXRlcmlhbFtgJHttYXBzW21hcF19TWFwVGlsaW5nYF0gPSB0aWxpbmdWZWM7XG4gICAgICAgICAgICBtYXRlcmlhbFtgJHttYXBzW21hcF19TWFwT2Zmc2V0YF0gPSBvZmZzZXRWZWM7XG4gICAgICAgICAgICBtYXRlcmlhbFtgJHttYXBzW21hcF19TWFwUm90YXRpb25gXSA9IHJvdGF0aW9uO1xuICAgICAgICB9XG4gICAgfVxufTtcblxuY29uc3QgZXh0ZW5zaW9uUGJyU3BlY0dsb3NzaW5lc3MgPSAoZGF0YSwgbWF0ZXJpYWwsIHRleHR1cmVzKSA9PiB7XG4gICAgbGV0IGNvbG9yLCB0ZXh0dXJlO1xuICAgIGlmIChkYXRhLmhhc093blByb3BlcnR5KCdkaWZmdXNlRmFjdG9yJykpIHtcbiAgICAgICAgY29sb3IgPSBkYXRhLmRpZmZ1c2VGYWN0b3I7XG4gICAgICAgIC8vIENvbnZlcnQgZnJvbSBsaW5lYXIgc3BhY2UgdG8gc1JHQiBzcGFjZVxuICAgICAgICBtYXRlcmlhbC5kaWZmdXNlLnNldChNYXRoLnBvdyhjb2xvclswXSwgMSAvIDIuMiksIE1hdGgucG93KGNvbG9yWzFdLCAxIC8gMi4yKSwgTWF0aC5wb3coY29sb3JbMl0sIDEgLyAyLjIpKTtcbiAgICAgICAgbWF0ZXJpYWwub3BhY2l0eSA9IGNvbG9yWzNdO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIG1hdGVyaWFsLmRpZmZ1c2Uuc2V0KDEsIDEsIDEpO1xuICAgICAgICBtYXRlcmlhbC5vcGFjaXR5ID0gMTtcbiAgICB9XG4gICAgaWYgKGRhdGEuaGFzT3duUHJvcGVydHkoJ2RpZmZ1c2VUZXh0dXJlJykpIHtcbiAgICAgICAgY29uc3QgZGlmZnVzZVRleHR1cmUgPSBkYXRhLmRpZmZ1c2VUZXh0dXJlO1xuICAgICAgICB0ZXh0dXJlID0gdGV4dHVyZXNbZGlmZnVzZVRleHR1cmUuaW5kZXhdO1xuXG4gICAgICAgIG1hdGVyaWFsLmRpZmZ1c2VNYXAgPSB0ZXh0dXJlO1xuICAgICAgICBtYXRlcmlhbC5kaWZmdXNlTWFwQ2hhbm5lbCA9ICdyZ2InO1xuICAgICAgICBtYXRlcmlhbC5vcGFjaXR5TWFwID0gdGV4dHVyZTtcbiAgICAgICAgbWF0ZXJpYWwub3BhY2l0eU1hcENoYW5uZWwgPSAnYSc7XG5cbiAgICAgICAgZXh0cmFjdFRleHR1cmVUcmFuc2Zvcm0oZGlmZnVzZVRleHR1cmUsIG1hdGVyaWFsLCBbJ2RpZmZ1c2UnLCAnb3BhY2l0eSddKTtcbiAgICB9XG4gICAgbWF0ZXJpYWwudXNlTWV0YWxuZXNzID0gZmFsc2U7XG4gICAgaWYgKGRhdGEuaGFzT3duUHJvcGVydHkoJ3NwZWN1bGFyRmFjdG9yJykpIHtcbiAgICAgICAgY29sb3IgPSBkYXRhLnNwZWN1bGFyRmFjdG9yO1xuICAgICAgICAvLyBDb252ZXJ0IGZyb20gbGluZWFyIHNwYWNlIHRvIHNSR0Igc3BhY2VcbiAgICAgICAgbWF0ZXJpYWwuc3BlY3VsYXIuc2V0KE1hdGgucG93KGNvbG9yWzBdLCAxIC8gMi4yKSwgTWF0aC5wb3coY29sb3JbMV0sIDEgLyAyLjIpLCBNYXRoLnBvdyhjb2xvclsyXSwgMSAvIDIuMikpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIG1hdGVyaWFsLnNwZWN1bGFyLnNldCgxLCAxLCAxKTtcbiAgICB9XG4gICAgaWYgKGRhdGEuaGFzT3duUHJvcGVydHkoJ2dsb3NzaW5lc3NGYWN0b3InKSkge1xuICAgICAgICBtYXRlcmlhbC5nbG9zcyA9IGRhdGEuZ2xvc3NpbmVzc0ZhY3RvcjtcbiAgICB9IGVsc2Uge1xuICAgICAgICBtYXRlcmlhbC5nbG9zcyA9IDEuMDtcbiAgICB9XG4gICAgaWYgKGRhdGEuaGFzT3duUHJvcGVydHkoJ3NwZWN1bGFyR2xvc3NpbmVzc1RleHR1cmUnKSkge1xuICAgICAgICBjb25zdCBzcGVjdWxhckdsb3NzaW5lc3NUZXh0dXJlID0gZGF0YS5zcGVjdWxhckdsb3NzaW5lc3NUZXh0dXJlO1xuICAgICAgICBtYXRlcmlhbC5zcGVjdWxhckVuY29kaW5nID0gJ3NyZ2InO1xuICAgICAgICBtYXRlcmlhbC5zcGVjdWxhck1hcCA9IG1hdGVyaWFsLmdsb3NzTWFwID0gdGV4dHVyZXNbc3BlY3VsYXJHbG9zc2luZXNzVGV4dHVyZS5pbmRleF07XG4gICAgICAgIG1hdGVyaWFsLnNwZWN1bGFyTWFwQ2hhbm5lbCA9ICdyZ2InO1xuICAgICAgICBtYXRlcmlhbC5nbG9zc01hcENoYW5uZWwgPSAnYSc7XG5cbiAgICAgICAgZXh0cmFjdFRleHR1cmVUcmFuc2Zvcm0oc3BlY3VsYXJHbG9zc2luZXNzVGV4dHVyZSwgbWF0ZXJpYWwsIFsnZ2xvc3MnLCAnbWV0YWxuZXNzJ10pO1xuICAgIH1cbn07XG5cbmNvbnN0IGV4dGVuc2lvbkNsZWFyQ29hdCA9IChkYXRhLCBtYXRlcmlhbCwgdGV4dHVyZXMpID0+IHtcbiAgICBpZiAoZGF0YS5oYXNPd25Qcm9wZXJ0eSgnY2xlYXJjb2F0RmFjdG9yJykpIHtcbiAgICAgICAgbWF0ZXJpYWwuY2xlYXJDb2F0ID0gZGF0YS5jbGVhcmNvYXRGYWN0b3IgKiAwLjI1OyAvLyBUT0RPOiByZW1vdmUgdGVtcG9yYXJ5IHdvcmthcm91bmQgZm9yIHJlcGxpY2F0aW5nIGdsVEYgY2xlYXItY29hdCB2aXN1YWxzXG4gICAgfSBlbHNlIHtcbiAgICAgICAgbWF0ZXJpYWwuY2xlYXJDb2F0ID0gMDtcbiAgICB9XG4gICAgaWYgKGRhdGEuaGFzT3duUHJvcGVydHkoJ2NsZWFyY29hdFRleHR1cmUnKSkge1xuICAgICAgICBjb25zdCBjbGVhcmNvYXRUZXh0dXJlID0gZGF0YS5jbGVhcmNvYXRUZXh0dXJlO1xuICAgICAgICBtYXRlcmlhbC5jbGVhckNvYXRNYXAgPSB0ZXh0dXJlc1tjbGVhcmNvYXRUZXh0dXJlLmluZGV4XTtcbiAgICAgICAgbWF0ZXJpYWwuY2xlYXJDb2F0TWFwQ2hhbm5lbCA9ICdyJztcblxuICAgICAgICBleHRyYWN0VGV4dHVyZVRyYW5zZm9ybShjbGVhcmNvYXRUZXh0dXJlLCBtYXRlcmlhbCwgWydjbGVhckNvYXQnXSk7XG4gICAgfVxuICAgIGlmIChkYXRhLmhhc093blByb3BlcnR5KCdjbGVhcmNvYXRSb3VnaG5lc3NGYWN0b3InKSkge1xuICAgICAgICBtYXRlcmlhbC5jbGVhckNvYXRHbG9zcyA9IGRhdGEuY2xlYXJjb2F0Um91Z2huZXNzRmFjdG9yO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIG1hdGVyaWFsLmNsZWFyQ29hdEdsb3NzID0gMDtcbiAgICB9XG4gICAgaWYgKGRhdGEuaGFzT3duUHJvcGVydHkoJ2NsZWFyY29hdFJvdWdobmVzc1RleHR1cmUnKSkge1xuICAgICAgICBjb25zdCBjbGVhcmNvYXRSb3VnaG5lc3NUZXh0dXJlID0gZGF0YS5jbGVhcmNvYXRSb3VnaG5lc3NUZXh0dXJlO1xuICAgICAgICBtYXRlcmlhbC5jbGVhckNvYXRHbG9zc01hcCA9IHRleHR1cmVzW2NsZWFyY29hdFJvdWdobmVzc1RleHR1cmUuaW5kZXhdO1xuICAgICAgICBtYXRlcmlhbC5jbGVhckNvYXRHbG9zc01hcENoYW5uZWwgPSAnZyc7XG5cbiAgICAgICAgZXh0cmFjdFRleHR1cmVUcmFuc2Zvcm0oY2xlYXJjb2F0Um91Z2huZXNzVGV4dHVyZSwgbWF0ZXJpYWwsIFsnY2xlYXJDb2F0R2xvc3MnXSk7XG4gICAgfVxuICAgIGlmIChkYXRhLmhhc093blByb3BlcnR5KCdjbGVhcmNvYXROb3JtYWxUZXh0dXJlJykpIHtcbiAgICAgICAgY29uc3QgY2xlYXJjb2F0Tm9ybWFsVGV4dHVyZSA9IGRhdGEuY2xlYXJjb2F0Tm9ybWFsVGV4dHVyZTtcbiAgICAgICAgbWF0ZXJpYWwuY2xlYXJDb2F0Tm9ybWFsTWFwID0gdGV4dHVyZXNbY2xlYXJjb2F0Tm9ybWFsVGV4dHVyZS5pbmRleF07XG5cbiAgICAgICAgZXh0cmFjdFRleHR1cmVUcmFuc2Zvcm0oY2xlYXJjb2F0Tm9ybWFsVGV4dHVyZSwgbWF0ZXJpYWwsIFsnY2xlYXJDb2F0Tm9ybWFsJ10pO1xuXG4gICAgICAgIGlmIChjbGVhcmNvYXROb3JtYWxUZXh0dXJlLmhhc093blByb3BlcnR5KCdzY2FsZScpKSB7XG4gICAgICAgICAgICBtYXRlcmlhbC5jbGVhckNvYXRCdW1waW5lc3MgPSBjbGVhcmNvYXROb3JtYWxUZXh0dXJlLnNjYWxlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgbWF0ZXJpYWwuY2xlYXJDb2F0R2xvc3NJbnZlcnQgPSB0cnVlO1xufTtcblxuY29uc3QgZXh0ZW5zaW9uVW5saXQgPSAoZGF0YSwgbWF0ZXJpYWwsIHRleHR1cmVzKSA9PiB7XG4gICAgbWF0ZXJpYWwudXNlTGlnaHRpbmcgPSBmYWxzZTtcblxuICAgIC8vIGNvcHkgZGlmZnVzZSBpbnRvIGVtaXNzaXZlXG4gICAgbWF0ZXJpYWwuZW1pc3NpdmUuY29weShtYXRlcmlhbC5kaWZmdXNlKTtcbiAgICBtYXRlcmlhbC5lbWlzc2l2ZVRpbnQgPSBtYXRlcmlhbC5kaWZmdXNlVGludDtcbiAgICBtYXRlcmlhbC5lbWlzc2l2ZU1hcCA9IG1hdGVyaWFsLmRpZmZ1c2VNYXA7XG4gICAgbWF0ZXJpYWwuZW1pc3NpdmVNYXBVdiA9IG1hdGVyaWFsLmRpZmZ1c2VNYXBVdjtcbiAgICBtYXRlcmlhbC5lbWlzc2l2ZU1hcFRpbGluZy5jb3B5KG1hdGVyaWFsLmRpZmZ1c2VNYXBUaWxpbmcpO1xuICAgIG1hdGVyaWFsLmVtaXNzaXZlTWFwT2Zmc2V0LmNvcHkobWF0ZXJpYWwuZGlmZnVzZU1hcE9mZnNldCk7XG4gICAgbWF0ZXJpYWwuZW1pc3NpdmVNYXBSb3RhdGlvbiA9IG1hdGVyaWFsLmRpZmZ1c2VNYXBSb3RhdGlvbjtcbiAgICBtYXRlcmlhbC5lbWlzc2l2ZU1hcENoYW5uZWwgPSBtYXRlcmlhbC5kaWZmdXNlTWFwQ2hhbm5lbDtcbiAgICBtYXRlcmlhbC5lbWlzc2l2ZVZlcnRleENvbG9yID0gbWF0ZXJpYWwuZGlmZnVzZVZlcnRleENvbG9yO1xuICAgIG1hdGVyaWFsLmVtaXNzaXZlVmVydGV4Q29sb3JDaGFubmVsID0gbWF0ZXJpYWwuZGlmZnVzZVZlcnRleENvbG9yQ2hhbm5lbDtcblxuICAgIC8vIGRpc2FibGUgbGlnaHRpbmcgYW5kIHNreWJveFxuICAgIG1hdGVyaWFsLnVzZUxpZ2h0aW5nID0gZmFsc2U7XG4gICAgbWF0ZXJpYWwudXNlU2t5Ym94ID0gZmFsc2U7XG5cbiAgICAvLyBibGFuayBkaWZmdXNlXG4gICAgbWF0ZXJpYWwuZGlmZnVzZS5zZXQoMCwgMCwgMCk7XG4gICAgbWF0ZXJpYWwuZGlmZnVzZVRpbnQgPSBmYWxzZTtcbiAgICBtYXRlcmlhbC5kaWZmdXNlTWFwID0gbnVsbDtcbiAgICBtYXRlcmlhbC5kaWZmdXNlVmVydGV4Q29sb3IgPSBmYWxzZTtcbn07XG5cbmNvbnN0IGV4dGVuc2lvblNwZWN1bGFyID0gKGRhdGEsIG1hdGVyaWFsLCB0ZXh0dXJlcykgPT4ge1xuICAgIG1hdGVyaWFsLnVzZU1ldGFsbmVzc1NwZWN1bGFyQ29sb3IgPSB0cnVlO1xuICAgIGlmIChkYXRhLmhhc093blByb3BlcnR5KCdzcGVjdWxhckNvbG9yVGV4dHVyZScpKSB7XG4gICAgICAgIG1hdGVyaWFsLnNwZWN1bGFyRW5jb2RpbmcgPSAnc3JnYic7XG4gICAgICAgIG1hdGVyaWFsLnNwZWN1bGFyTWFwID0gdGV4dHVyZXNbZGF0YS5zcGVjdWxhckNvbG9yVGV4dHVyZS5pbmRleF07XG4gICAgICAgIG1hdGVyaWFsLnNwZWN1bGFyTWFwQ2hhbm5lbCA9ICdyZ2InO1xuXG4gICAgICAgIGV4dHJhY3RUZXh0dXJlVHJhbnNmb3JtKGRhdGEuc3BlY3VsYXJDb2xvclRleHR1cmUsIG1hdGVyaWFsLCBbJ3NwZWN1bGFyJ10pO1xuXG4gICAgfVxuICAgIGlmIChkYXRhLmhhc093blByb3BlcnR5KCdzcGVjdWxhckNvbG9yRmFjdG9yJykpIHtcbiAgICAgICAgY29uc3QgY29sb3IgPSBkYXRhLnNwZWN1bGFyQ29sb3JGYWN0b3I7XG4gICAgICAgIG1hdGVyaWFsLnNwZWN1bGFyLnNldChNYXRoLnBvdyhjb2xvclswXSwgMSAvIDIuMiksIE1hdGgucG93KGNvbG9yWzFdLCAxIC8gMi4yKSwgTWF0aC5wb3coY29sb3JbMl0sIDEgLyAyLjIpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBtYXRlcmlhbC5zcGVjdWxhci5zZXQoMSwgMSwgMSk7XG4gICAgfVxuXG4gICAgaWYgKGRhdGEuaGFzT3duUHJvcGVydHkoJ3NwZWN1bGFyRmFjdG9yJykpIHtcbiAgICAgICAgbWF0ZXJpYWwuc3BlY3VsYXJpdHlGYWN0b3IgPSBkYXRhLnNwZWN1bGFyRmFjdG9yO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIG1hdGVyaWFsLnNwZWN1bGFyaXR5RmFjdG9yID0gMTtcbiAgICB9XG4gICAgaWYgKGRhdGEuaGFzT3duUHJvcGVydHkoJ3NwZWN1bGFyVGV4dHVyZScpKSB7XG4gICAgICAgIG1hdGVyaWFsLnNwZWN1bGFyaXR5RmFjdG9yTWFwQ2hhbm5lbCA9ICdhJztcbiAgICAgICAgbWF0ZXJpYWwuc3BlY3VsYXJpdHlGYWN0b3JNYXAgPSB0ZXh0dXJlc1tkYXRhLnNwZWN1bGFyVGV4dHVyZS5pbmRleF07XG4gICAgICAgIGV4dHJhY3RUZXh0dXJlVHJhbnNmb3JtKGRhdGEuc3BlY3VsYXJUZXh0dXJlLCBtYXRlcmlhbCwgWydzcGVjdWxhcml0eUZhY3RvciddKTtcbiAgICB9XG59O1xuXG5jb25zdCBleHRlbnNpb25Jb3IgPSAoZGF0YSwgbWF0ZXJpYWwsIHRleHR1cmVzKSA9PiB7XG4gICAgaWYgKGRhdGEuaGFzT3duUHJvcGVydHkoJ2lvcicpKSB7XG4gICAgICAgIG1hdGVyaWFsLnJlZnJhY3Rpb25JbmRleCA9IDEuMCAvIGRhdGEuaW9yO1xuICAgIH1cbn07XG5cbmNvbnN0IGV4dGVuc2lvblRyYW5zbWlzc2lvbiA9IChkYXRhLCBtYXRlcmlhbCwgdGV4dHVyZXMpID0+IHtcbiAgICBtYXRlcmlhbC5ibGVuZFR5cGUgPSBCTEVORF9OT1JNQUw7XG4gICAgbWF0ZXJpYWwudXNlRHluYW1pY1JlZnJhY3Rpb24gPSB0cnVlO1xuXG4gICAgaWYgKGRhdGEuaGFzT3duUHJvcGVydHkoJ3RyYW5zbWlzc2lvbkZhY3RvcicpKSB7XG4gICAgICAgIG1hdGVyaWFsLnJlZnJhY3Rpb24gPSBkYXRhLnRyYW5zbWlzc2lvbkZhY3RvcjtcbiAgICB9XG4gICAgaWYgKGRhdGEuaGFzT3duUHJvcGVydHkoJ3RyYW5zbWlzc2lvblRleHR1cmUnKSkge1xuICAgICAgICBtYXRlcmlhbC5yZWZyYWN0aW9uTWFwQ2hhbm5lbCA9ICdyJztcbiAgICAgICAgbWF0ZXJpYWwucmVmcmFjdGlvbk1hcCA9IHRleHR1cmVzW2RhdGEudHJhbnNtaXNzaW9uVGV4dHVyZS5pbmRleF07XG4gICAgICAgIGV4dHJhY3RUZXh0dXJlVHJhbnNmb3JtKGRhdGEudHJhbnNtaXNzaW9uVGV4dHVyZSwgbWF0ZXJpYWwsIFsncmVmcmFjdGlvbiddKTtcbiAgICB9XG59O1xuXG5jb25zdCBleHRlbnNpb25TaGVlbiA9IChkYXRhLCBtYXRlcmlhbCwgdGV4dHVyZXMpID0+IHtcbiAgICBtYXRlcmlhbC51c2VTaGVlbiA9IHRydWU7XG4gICAgaWYgKGRhdGEuaGFzT3duUHJvcGVydHkoJ3NoZWVuQ29sb3JGYWN0b3InKSkge1xuICAgICAgICBjb25zdCBjb2xvciA9IGRhdGEuc2hlZW5Db2xvckZhY3RvcjtcbiAgICAgICAgbWF0ZXJpYWwuc2hlZW4uc2V0KE1hdGgucG93KGNvbG9yWzBdLCAxIC8gMi4yKSwgTWF0aC5wb3coY29sb3JbMV0sIDEgLyAyLjIpLCBNYXRoLnBvdyhjb2xvclsyXSwgMSAvIDIuMikpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIG1hdGVyaWFsLnNoZWVuLnNldCgxLCAxLCAxKTtcbiAgICB9XG4gICAgaWYgKGRhdGEuaGFzT3duUHJvcGVydHkoJ3NoZWVuQ29sb3JUZXh0dXJlJykpIHtcbiAgICAgICAgbWF0ZXJpYWwuc2hlZW5NYXAgPSB0ZXh0dXJlc1tkYXRhLnNoZWVuQ29sb3JUZXh0dXJlLmluZGV4XTtcbiAgICAgICAgbWF0ZXJpYWwuc2hlZW5FbmNvZGluZyA9ICdzcmdiJztcbiAgICAgICAgZXh0cmFjdFRleHR1cmVUcmFuc2Zvcm0oZGF0YS5zaGVlbkNvbG9yVGV4dHVyZSwgbWF0ZXJpYWwsIFsnc2hlZW4nXSk7XG4gICAgfVxuICAgIGlmIChkYXRhLmhhc093blByb3BlcnR5KCdzaGVlblJvdWdobmVzc0ZhY3RvcicpKSB7XG4gICAgICAgIG1hdGVyaWFsLnNoZWVuR2xvc3MgPSBkYXRhLnNoZWVuUm91Z2huZXNzRmFjdG9yO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIG1hdGVyaWFsLnNoZWVuR2xvc3MgPSAwLjA7XG4gICAgfVxuICAgIGlmIChkYXRhLmhhc093blByb3BlcnR5KCdzaGVlblJvdWdobmVzc1RleHR1cmUnKSkge1xuICAgICAgICBtYXRlcmlhbC5zaGVlbkdsb3NzTWFwID0gdGV4dHVyZXNbZGF0YS5zaGVlblJvdWdobmVzc1RleHR1cmUuaW5kZXhdO1xuICAgICAgICBtYXRlcmlhbC5zaGVlbkdsb3NzTWFwQ2hhbm5lbCA9ICdhJztcbiAgICAgICAgZXh0cmFjdFRleHR1cmVUcmFuc2Zvcm0oZGF0YS5zaGVlblJvdWdobmVzc1RleHR1cmUsIG1hdGVyaWFsLCBbJ3NoZWVuR2xvc3MnXSk7XG4gICAgfVxuXG4gICAgbWF0ZXJpYWwuc2hlZW5HbG9zc0ludmVydCA9IHRydWU7XG59O1xuXG5jb25zdCBleHRlbnNpb25Wb2x1bWUgPSAoZGF0YSwgbWF0ZXJpYWwsIHRleHR1cmVzKSA9PiB7XG4gICAgbWF0ZXJpYWwuYmxlbmRUeXBlID0gQkxFTkRfTk9STUFMO1xuICAgIG1hdGVyaWFsLnVzZUR5bmFtaWNSZWZyYWN0aW9uID0gdHJ1ZTtcbiAgICBpZiAoZGF0YS5oYXNPd25Qcm9wZXJ0eSgndGhpY2tuZXNzRmFjdG9yJykpIHtcbiAgICAgICAgbWF0ZXJpYWwudGhpY2tuZXNzID0gZGF0YS50aGlja25lc3NGYWN0b3I7XG4gICAgfVxuICAgIGlmIChkYXRhLmhhc093blByb3BlcnR5KCd0aGlja25lc3NUZXh0dXJlJykpIHtcbiAgICAgICAgbWF0ZXJpYWwudGhpY2tuZXNzTWFwID0gdGV4dHVyZXNbZGF0YS50aGlja25lc3NUZXh0dXJlLmluZGV4XTtcbiAgICAgICAgbWF0ZXJpYWwudGhpY2tuZXNzTWFwQ2hhbm5lbCA9ICdnJztcbiAgICAgICAgZXh0cmFjdFRleHR1cmVUcmFuc2Zvcm0oZGF0YS50aGlja25lc3NUZXh0dXJlLCBtYXRlcmlhbCwgWyd0aGlja25lc3MnXSk7XG4gICAgfVxuICAgIGlmIChkYXRhLmhhc093blByb3BlcnR5KCdhdHRlbnVhdGlvbkRpc3RhbmNlJykpIHtcbiAgICAgICAgbWF0ZXJpYWwuYXR0ZW51YXRpb25EaXN0YW5jZSA9IGRhdGEuYXR0ZW51YXRpb25EaXN0YW5jZTtcbiAgICB9XG4gICAgaWYgKGRhdGEuaGFzT3duUHJvcGVydHkoJ2F0dGVudWF0aW9uQ29sb3InKSkge1xuICAgICAgICBjb25zdCBjb2xvciA9IGRhdGEuYXR0ZW51YXRpb25Db2xvcjtcbiAgICAgICAgbWF0ZXJpYWwuYXR0ZW51YXRpb24uc2V0KE1hdGgucG93KGNvbG9yWzBdLCAxIC8gMi4yKSwgTWF0aC5wb3coY29sb3JbMV0sIDEgLyAyLjIpLCBNYXRoLnBvdyhjb2xvclsyXSwgMSAvIDIuMikpO1xuICAgIH1cbn07XG5cbmNvbnN0IGV4dGVuc2lvbkVtaXNzaXZlU3RyZW5ndGggPSAoZGF0YSwgbWF0ZXJpYWwsIHRleHR1cmVzKSA9PiB7XG4gICAgaWYgKGRhdGEuaGFzT3duUHJvcGVydHkoJ2VtaXNzaXZlU3RyZW5ndGgnKSkge1xuICAgICAgICBtYXRlcmlhbC5lbWlzc2l2ZUludGVuc2l0eSA9IGRhdGEuZW1pc3NpdmVTdHJlbmd0aDtcbiAgICB9XG59O1xuXG5jb25zdCBleHRlbnNpb25JcmlkZXNjZW5jZSA9IChkYXRhLCBtYXRlcmlhbCwgdGV4dHVyZXMpID0+IHtcbiAgICBtYXRlcmlhbC51c2VJcmlkZXNjZW5jZSA9IHRydWU7XG4gICAgaWYgKGRhdGEuaGFzT3duUHJvcGVydHkoJ2lyaWRlc2NlbmNlRmFjdG9yJykpIHtcbiAgICAgICAgbWF0ZXJpYWwuaXJpZGVzY2VuY2UgPSBkYXRhLmlyaWRlc2NlbmNlRmFjdG9yO1xuICAgIH1cbiAgICBpZiAoZGF0YS5oYXNPd25Qcm9wZXJ0eSgnaXJpZGVzY2VuY2VUZXh0dXJlJykpIHtcbiAgICAgICAgbWF0ZXJpYWwuaXJpZGVzY2VuY2VNYXBDaGFubmVsID0gJ3InO1xuICAgICAgICBtYXRlcmlhbC5pcmlkZXNjZW5jZU1hcCA9IHRleHR1cmVzW2RhdGEuaXJpZGVzY2VuY2VUZXh0dXJlLmluZGV4XTtcbiAgICAgICAgZXh0cmFjdFRleHR1cmVUcmFuc2Zvcm0oZGF0YS5pcmlkZXNjZW5jZVRleHR1cmUsIG1hdGVyaWFsLCBbJ2lyaWRlc2NlbmNlJ10pO1xuXG4gICAgfVxuICAgIGlmIChkYXRhLmhhc093blByb3BlcnR5KCdpcmlkZXNjZW5jZUlvcicpKSB7XG4gICAgICAgIG1hdGVyaWFsLmlyaWRlc2NlbmNlUmVmcmFjdGlvbkluZGV4ID0gZGF0YS5pcmlkZXNjZW5jZUlvcjtcbiAgICB9XG4gICAgaWYgKGRhdGEuaGFzT3duUHJvcGVydHkoJ2lyaWRlc2NlbmNlVGhpY2tuZXNzTWluaW11bScpKSB7XG4gICAgICAgIG1hdGVyaWFsLmlyaWRlc2NlbmNlVGhpY2tuZXNzTWluID0gZGF0YS5pcmlkZXNjZW5jZVRoaWNrbmVzc01pbmltdW07XG4gICAgfVxuICAgIGlmIChkYXRhLmhhc093blByb3BlcnR5KCdpcmlkZXNjZW5jZVRoaWNrbmVzc01heGltdW0nKSkge1xuICAgICAgICBtYXRlcmlhbC5pcmlkZXNjZW5jZVRoaWNrbmVzc01heCA9IGRhdGEuaXJpZGVzY2VuY2VUaGlja25lc3NNYXhpbXVtO1xuICAgIH1cbiAgICBpZiAoZGF0YS5oYXNPd25Qcm9wZXJ0eSgnaXJpZGVzY2VuY2VUaGlja25lc3NUZXh0dXJlJykpIHtcbiAgICAgICAgbWF0ZXJpYWwuaXJpZGVzY2VuY2VUaGlja25lc3NNYXBDaGFubmVsID0gJ2cnO1xuICAgICAgICBtYXRlcmlhbC5pcmlkZXNjZW5jZVRoaWNrbmVzc01hcCA9IHRleHR1cmVzW2RhdGEuaXJpZGVzY2VuY2VUaGlja25lc3NUZXh0dXJlLmluZGV4XTtcbiAgICAgICAgZXh0cmFjdFRleHR1cmVUcmFuc2Zvcm0oZGF0YS5pcmlkZXNjZW5jZVRoaWNrbmVzc1RleHR1cmUsIG1hdGVyaWFsLCBbJ2lyaWRlc2NlbmNlVGhpY2tuZXNzJ10pO1xuICAgIH1cbn07XG5cbmNvbnN0IGNyZWF0ZU1hdGVyaWFsID0gKGdsdGZNYXRlcmlhbCwgdGV4dHVyZXMsIGZsaXBWKSA9PiB7XG4gICAgY29uc3QgbWF0ZXJpYWwgPSBuZXcgU3RhbmRhcmRNYXRlcmlhbCgpO1xuXG4gICAgLy8gZ2xURiBkb2Vzbid0IGRlZmluZSBob3cgdG8gb2NjbHVkZSBzcGVjdWxhclxuICAgIG1hdGVyaWFsLm9jY2x1ZGVTcGVjdWxhciA9IFNQRUNPQ0NfQU87XG5cbiAgICBtYXRlcmlhbC5kaWZmdXNlVGludCA9IHRydWU7XG4gICAgbWF0ZXJpYWwuZGlmZnVzZVZlcnRleENvbG9yID0gdHJ1ZTtcblxuICAgIG1hdGVyaWFsLnNwZWN1bGFyVGludCA9IHRydWU7XG4gICAgbWF0ZXJpYWwuc3BlY3VsYXJWZXJ0ZXhDb2xvciA9IHRydWU7XG5cbiAgICBpZiAoZ2x0Zk1hdGVyaWFsLmhhc093blByb3BlcnR5KCduYW1lJykpIHtcbiAgICAgICAgbWF0ZXJpYWwubmFtZSA9IGdsdGZNYXRlcmlhbC5uYW1lO1xuICAgIH1cblxuICAgIGxldCBjb2xvciwgdGV4dHVyZTtcbiAgICBpZiAoZ2x0Zk1hdGVyaWFsLmhhc093blByb3BlcnR5KCdwYnJNZXRhbGxpY1JvdWdobmVzcycpKSB7XG4gICAgICAgIGNvbnN0IHBickRhdGEgPSBnbHRmTWF0ZXJpYWwucGJyTWV0YWxsaWNSb3VnaG5lc3M7XG5cbiAgICAgICAgaWYgKHBickRhdGEuaGFzT3duUHJvcGVydHkoJ2Jhc2VDb2xvckZhY3RvcicpKSB7XG4gICAgICAgICAgICBjb2xvciA9IHBickRhdGEuYmFzZUNvbG9yRmFjdG9yO1xuICAgICAgICAgICAgLy8gQ29udmVydCBmcm9tIGxpbmVhciBzcGFjZSB0byBzUkdCIHNwYWNlXG4gICAgICAgICAgICBtYXRlcmlhbC5kaWZmdXNlLnNldChNYXRoLnBvdyhjb2xvclswXSwgMSAvIDIuMiksIE1hdGgucG93KGNvbG9yWzFdLCAxIC8gMi4yKSwgTWF0aC5wb3coY29sb3JbMl0sIDEgLyAyLjIpKTtcbiAgICAgICAgICAgIG1hdGVyaWFsLm9wYWNpdHkgPSBjb2xvclszXTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIG1hdGVyaWFsLmRpZmZ1c2Uuc2V0KDEsIDEsIDEpO1xuICAgICAgICAgICAgbWF0ZXJpYWwub3BhY2l0eSA9IDE7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHBickRhdGEuaGFzT3duUHJvcGVydHkoJ2Jhc2VDb2xvclRleHR1cmUnKSkge1xuICAgICAgICAgICAgY29uc3QgYmFzZUNvbG9yVGV4dHVyZSA9IHBickRhdGEuYmFzZUNvbG9yVGV4dHVyZTtcbiAgICAgICAgICAgIHRleHR1cmUgPSB0ZXh0dXJlc1tiYXNlQ29sb3JUZXh0dXJlLmluZGV4XTtcblxuICAgICAgICAgICAgbWF0ZXJpYWwuZGlmZnVzZU1hcCA9IHRleHR1cmU7XG4gICAgICAgICAgICBtYXRlcmlhbC5kaWZmdXNlTWFwQ2hhbm5lbCA9ICdyZ2InO1xuICAgICAgICAgICAgbWF0ZXJpYWwub3BhY2l0eU1hcCA9IHRleHR1cmU7XG4gICAgICAgICAgICBtYXRlcmlhbC5vcGFjaXR5TWFwQ2hhbm5lbCA9ICdhJztcblxuICAgICAgICAgICAgZXh0cmFjdFRleHR1cmVUcmFuc2Zvcm0oYmFzZUNvbG9yVGV4dHVyZSwgbWF0ZXJpYWwsIFsnZGlmZnVzZScsICdvcGFjaXR5J10pO1xuICAgICAgICB9XG4gICAgICAgIG1hdGVyaWFsLnVzZU1ldGFsbmVzcyA9IHRydWU7XG4gICAgICAgIG1hdGVyaWFsLnNwZWN1bGFyLnNldCgxLCAxLCAxKTtcbiAgICAgICAgaWYgKHBickRhdGEuaGFzT3duUHJvcGVydHkoJ21ldGFsbGljRmFjdG9yJykpIHtcbiAgICAgICAgICAgIG1hdGVyaWFsLm1ldGFsbmVzcyA9IHBickRhdGEubWV0YWxsaWNGYWN0b3I7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBtYXRlcmlhbC5tZXRhbG5lc3MgPSAxO1xuICAgICAgICB9XG4gICAgICAgIGlmIChwYnJEYXRhLmhhc093blByb3BlcnR5KCdyb3VnaG5lc3NGYWN0b3InKSkge1xuICAgICAgICAgICAgbWF0ZXJpYWwuZ2xvc3MgPSBwYnJEYXRhLnJvdWdobmVzc0ZhY3RvcjtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIG1hdGVyaWFsLmdsb3NzID0gMTtcbiAgICAgICAgfVxuICAgICAgICBtYXRlcmlhbC5nbG9zc0ludmVydCA9IHRydWU7XG4gICAgICAgIGlmIChwYnJEYXRhLmhhc093blByb3BlcnR5KCdtZXRhbGxpY1JvdWdobmVzc1RleHR1cmUnKSkge1xuICAgICAgICAgICAgY29uc3QgbWV0YWxsaWNSb3VnaG5lc3NUZXh0dXJlID0gcGJyRGF0YS5tZXRhbGxpY1JvdWdobmVzc1RleHR1cmU7XG4gICAgICAgICAgICBtYXRlcmlhbC5tZXRhbG5lc3NNYXAgPSBtYXRlcmlhbC5nbG9zc01hcCA9IHRleHR1cmVzW21ldGFsbGljUm91Z2huZXNzVGV4dHVyZS5pbmRleF07XG4gICAgICAgICAgICBtYXRlcmlhbC5tZXRhbG5lc3NNYXBDaGFubmVsID0gJ2InO1xuICAgICAgICAgICAgbWF0ZXJpYWwuZ2xvc3NNYXBDaGFubmVsID0gJ2cnO1xuXG4gICAgICAgICAgICBleHRyYWN0VGV4dHVyZVRyYW5zZm9ybShtZXRhbGxpY1JvdWdobmVzc1RleHR1cmUsIG1hdGVyaWFsLCBbJ2dsb3NzJywgJ21ldGFsbmVzcyddKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmIChnbHRmTWF0ZXJpYWwuaGFzT3duUHJvcGVydHkoJ25vcm1hbFRleHR1cmUnKSkge1xuICAgICAgICBjb25zdCBub3JtYWxUZXh0dXJlID0gZ2x0Zk1hdGVyaWFsLm5vcm1hbFRleHR1cmU7XG4gICAgICAgIG1hdGVyaWFsLm5vcm1hbE1hcCA9IHRleHR1cmVzW25vcm1hbFRleHR1cmUuaW5kZXhdO1xuXG4gICAgICAgIGV4dHJhY3RUZXh0dXJlVHJhbnNmb3JtKG5vcm1hbFRleHR1cmUsIG1hdGVyaWFsLCBbJ25vcm1hbCddKTtcblxuICAgICAgICBpZiAobm9ybWFsVGV4dHVyZS5oYXNPd25Qcm9wZXJ0eSgnc2NhbGUnKSkge1xuICAgICAgICAgICAgbWF0ZXJpYWwuYnVtcGluZXNzID0gbm9ybWFsVGV4dHVyZS5zY2FsZTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBpZiAoZ2x0Zk1hdGVyaWFsLmhhc093blByb3BlcnR5KCdvY2NsdXNpb25UZXh0dXJlJykpIHtcbiAgICAgICAgY29uc3Qgb2NjbHVzaW9uVGV4dHVyZSA9IGdsdGZNYXRlcmlhbC5vY2NsdXNpb25UZXh0dXJlO1xuICAgICAgICBtYXRlcmlhbC5hb01hcCA9IHRleHR1cmVzW29jY2x1c2lvblRleHR1cmUuaW5kZXhdO1xuICAgICAgICBtYXRlcmlhbC5hb01hcENoYW5uZWwgPSAncic7XG5cbiAgICAgICAgZXh0cmFjdFRleHR1cmVUcmFuc2Zvcm0ob2NjbHVzaW9uVGV4dHVyZSwgbWF0ZXJpYWwsIFsnYW8nXSk7XG4gICAgICAgIC8vIFRPRE86IHN1cHBvcnQgJ3N0cmVuZ3RoJ1xuICAgIH1cbiAgICBpZiAoZ2x0Zk1hdGVyaWFsLmhhc093blByb3BlcnR5KCdlbWlzc2l2ZUZhY3RvcicpKSB7XG4gICAgICAgIGNvbG9yID0gZ2x0Zk1hdGVyaWFsLmVtaXNzaXZlRmFjdG9yO1xuICAgICAgICAvLyBDb252ZXJ0IGZyb20gbGluZWFyIHNwYWNlIHRvIHNSR0Igc3BhY2VcbiAgICAgICAgbWF0ZXJpYWwuZW1pc3NpdmUuc2V0KE1hdGgucG93KGNvbG9yWzBdLCAxIC8gMi4yKSwgTWF0aC5wb3coY29sb3JbMV0sIDEgLyAyLjIpLCBNYXRoLnBvdyhjb2xvclsyXSwgMSAvIDIuMikpO1xuICAgICAgICBtYXRlcmlhbC5lbWlzc2l2ZVRpbnQgPSB0cnVlO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIG1hdGVyaWFsLmVtaXNzaXZlLnNldCgwLCAwLCAwKTtcbiAgICAgICAgbWF0ZXJpYWwuZW1pc3NpdmVUaW50ID0gZmFsc2U7XG4gICAgfVxuICAgIGlmIChnbHRmTWF0ZXJpYWwuaGFzT3duUHJvcGVydHkoJ2VtaXNzaXZlVGV4dHVyZScpKSB7XG4gICAgICAgIGNvbnN0IGVtaXNzaXZlVGV4dHVyZSA9IGdsdGZNYXRlcmlhbC5lbWlzc2l2ZVRleHR1cmU7XG4gICAgICAgIG1hdGVyaWFsLmVtaXNzaXZlTWFwID0gdGV4dHVyZXNbZW1pc3NpdmVUZXh0dXJlLmluZGV4XTtcblxuICAgICAgICBleHRyYWN0VGV4dHVyZVRyYW5zZm9ybShlbWlzc2l2ZVRleHR1cmUsIG1hdGVyaWFsLCBbJ2VtaXNzaXZlJ10pO1xuICAgIH1cbiAgICBpZiAoZ2x0Zk1hdGVyaWFsLmhhc093blByb3BlcnR5KCdhbHBoYU1vZGUnKSkge1xuICAgICAgICBzd2l0Y2ggKGdsdGZNYXRlcmlhbC5hbHBoYU1vZGUpIHtcbiAgICAgICAgICAgIGNhc2UgJ01BU0snOlxuICAgICAgICAgICAgICAgIG1hdGVyaWFsLmJsZW5kVHlwZSA9IEJMRU5EX05PTkU7XG4gICAgICAgICAgICAgICAgaWYgKGdsdGZNYXRlcmlhbC5oYXNPd25Qcm9wZXJ0eSgnYWxwaGFDdXRvZmYnKSkge1xuICAgICAgICAgICAgICAgICAgICBtYXRlcmlhbC5hbHBoYVRlc3QgPSBnbHRmTWF0ZXJpYWwuYWxwaGFDdXRvZmY7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgbWF0ZXJpYWwuYWxwaGFUZXN0ID0gMC41O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ0JMRU5EJzpcbiAgICAgICAgICAgICAgICBtYXRlcmlhbC5ibGVuZFR5cGUgPSBCTEVORF9OT1JNQUw7XG4gICAgICAgICAgICAgICAgLy8gbm90ZTogYnkgZGVmYXVsdCBkb24ndCB3cml0ZSBkZXB0aCBvbiBzZW1pdHJhbnNwYXJlbnQgbWF0ZXJpYWxzXG4gICAgICAgICAgICAgICAgbWF0ZXJpYWwuZGVwdGhXcml0ZSA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIGNhc2UgJ09QQVFVRSc6XG4gICAgICAgICAgICAgICAgbWF0ZXJpYWwuYmxlbmRUeXBlID0gQkxFTkRfTk9ORTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAgIG1hdGVyaWFsLmJsZW5kVHlwZSA9IEJMRU5EX05PTkU7XG4gICAgfVxuXG4gICAgaWYgKGdsdGZNYXRlcmlhbC5oYXNPd25Qcm9wZXJ0eSgnZG91YmxlU2lkZWQnKSkge1xuICAgICAgICBtYXRlcmlhbC50d29TaWRlZExpZ2h0aW5nID0gZ2x0Zk1hdGVyaWFsLmRvdWJsZVNpZGVkO1xuICAgICAgICBtYXRlcmlhbC5jdWxsID0gZ2x0Zk1hdGVyaWFsLmRvdWJsZVNpZGVkID8gQ1VMTEZBQ0VfTk9ORSA6IENVTExGQUNFX0JBQ0s7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgbWF0ZXJpYWwudHdvU2lkZWRMaWdodGluZyA9IGZhbHNlO1xuICAgICAgICBtYXRlcmlhbC5jdWxsID0gQ1VMTEZBQ0VfQkFDSztcbiAgICB9XG5cbiAgICAvLyBQcm92aWRlIGxpc3Qgb2Ygc3VwcG9ydGVkIGV4dGVuc2lvbnMgYW5kIHRoZWlyIGZ1bmN0aW9uc1xuICAgIGNvbnN0IGV4dGVuc2lvbnMgPSB7XG4gICAgICAgIFwiS0hSX21hdGVyaWFsc19jbGVhcmNvYXRcIjogZXh0ZW5zaW9uQ2xlYXJDb2F0LFxuICAgICAgICBcIktIUl9tYXRlcmlhbHNfZW1pc3NpdmVfc3RyZW5ndGhcIjogZXh0ZW5zaW9uRW1pc3NpdmVTdHJlbmd0aCxcbiAgICAgICAgXCJLSFJfbWF0ZXJpYWxzX2lvclwiOiBleHRlbnNpb25Jb3IsXG4gICAgICAgIFwiS0hSX21hdGVyaWFsc19pcmlkZXNjZW5jZVwiOiBleHRlbnNpb25JcmlkZXNjZW5jZSxcbiAgICAgICAgXCJLSFJfbWF0ZXJpYWxzX3BiclNwZWN1bGFyR2xvc3NpbmVzc1wiOiBleHRlbnNpb25QYnJTcGVjR2xvc3NpbmVzcyxcbiAgICAgICAgXCJLSFJfbWF0ZXJpYWxzX3NoZWVuXCI6IGV4dGVuc2lvblNoZWVuLFxuICAgICAgICBcIktIUl9tYXRlcmlhbHNfc3BlY3VsYXJcIjogZXh0ZW5zaW9uU3BlY3VsYXIsXG4gICAgICAgIFwiS0hSX21hdGVyaWFsc190cmFuc21pc3Npb25cIjogZXh0ZW5zaW9uVHJhbnNtaXNzaW9uLFxuICAgICAgICBcIktIUl9tYXRlcmlhbHNfdW5saXRcIjogZXh0ZW5zaW9uVW5saXQsXG4gICAgICAgIFwiS0hSX21hdGVyaWFsc192b2x1bWVcIjogZXh0ZW5zaW9uVm9sdW1lXG4gICAgfTtcblxuICAgIC8vIEhhbmRsZSBleHRlbnNpb25zXG4gICAgaWYgKGdsdGZNYXRlcmlhbC5oYXNPd25Qcm9wZXJ0eSgnZXh0ZW5zaW9ucycpKSB7XG4gICAgICAgIGZvciAoY29uc3Qga2V5IGluIGdsdGZNYXRlcmlhbC5leHRlbnNpb25zKSB7XG4gICAgICAgICAgICBjb25zdCBleHRlbnNpb25GdW5jID0gZXh0ZW5zaW9uc1trZXldO1xuICAgICAgICAgICAgaWYgKGV4dGVuc2lvbkZ1bmMgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIGV4dGVuc2lvbkZ1bmMoZ2x0Zk1hdGVyaWFsLmV4dGVuc2lvbnNba2V5XSwgbWF0ZXJpYWwsIHRleHR1cmVzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIG1hdGVyaWFsLnVwZGF0ZSgpO1xuXG4gICAgcmV0dXJuIG1hdGVyaWFsO1xufTtcblxuLy8gY3JlYXRlIHRoZSBhbmltIHN0cnVjdHVyZVxuY29uc3QgY3JlYXRlQW5pbWF0aW9uID0gKGdsdGZBbmltYXRpb24sIGFuaW1hdGlvbkluZGV4LCBnbHRmQWNjZXNzb3JzLCBidWZmZXJWaWV3cywgbm9kZXMsIG1lc2hlcywgZ2x0Zk5vZGVzKSA9PiB7XG5cbiAgICAvLyBjcmVhdGUgYW5pbWF0aW9uIGRhdGEgYmxvY2sgZm9yIHRoZSBhY2Nlc3NvclxuICAgIGNvbnN0IGNyZWF0ZUFuaW1EYXRhID0gKGdsdGZBY2Nlc3NvcikgPT4ge1xuICAgICAgICByZXR1cm4gbmV3IEFuaW1EYXRhKGdldE51bUNvbXBvbmVudHMoZ2x0ZkFjY2Vzc29yLnR5cGUpLCBnZXRBY2Nlc3NvckRhdGFGbG9hdDMyKGdsdGZBY2Nlc3NvciwgYnVmZmVyVmlld3MpKTtcbiAgICB9O1xuXG4gICAgY29uc3QgaW50ZXJwTWFwID0ge1xuICAgICAgICAnU1RFUCc6IElOVEVSUE9MQVRJT05fU1RFUCxcbiAgICAgICAgJ0xJTkVBUic6IElOVEVSUE9MQVRJT05fTElORUFSLFxuICAgICAgICAnQ1VCSUNTUExJTkUnOiBJTlRFUlBPTEFUSU9OX0NVQklDXG4gICAgfTtcblxuICAgIC8vIElucHV0IGFuZCBvdXRwdXQgbWFwcyByZWZlcmVuY2UgZGF0YSBieSBzYW1wbGVyIGlucHV0L291dHB1dCBrZXkuXG4gICAgY29uc3QgaW5wdXRNYXAgPSB7IH07XG4gICAgY29uc3Qgb3V0cHV0TWFwID0geyB9O1xuICAgIC8vIFRoZSBjdXJ2ZSBtYXAgc3RvcmVzIHRlbXBvcmFyeSBjdXJ2ZSBkYXRhIGJ5IHNhbXBsZXIgaW5kZXguIEVhY2ggY3VydmVzIGlucHV0L291dHB1dCB2YWx1ZSB3aWxsIGJlIHJlc29sdmVkIHRvIGFuIGlucHV0cy9vdXRwdXRzIGFycmF5IGluZGV4IGFmdGVyIGFsbCBzYW1wbGVycyBoYXZlIGJlZW4gcHJvY2Vzc2VkLlxuICAgIC8vIEN1cnZlcyBhbmQgb3V0cHV0cyB0aGF0IGFyZSBkZWxldGVkIGZyb20gdGhlaXIgbWFwcyB3aWxsIG5vdCBiZSBpbmNsdWRlZCBpbiB0aGUgZmluYWwgQW5pbVRyYWNrXG4gICAgY29uc3QgY3VydmVNYXAgPSB7IH07XG4gICAgbGV0IG91dHB1dENvdW50ZXIgPSAxO1xuXG4gICAgbGV0IGk7XG5cbiAgICAvLyBjb252ZXJ0IHNhbXBsZXJzXG4gICAgZm9yIChpID0gMDsgaSA8IGdsdGZBbmltYXRpb24uc2FtcGxlcnMubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgY29uc3Qgc2FtcGxlciA9IGdsdGZBbmltYXRpb24uc2FtcGxlcnNbaV07XG5cbiAgICAgICAgLy8gZ2V0IGlucHV0IGRhdGFcbiAgICAgICAgaWYgKCFpbnB1dE1hcC5oYXNPd25Qcm9wZXJ0eShzYW1wbGVyLmlucHV0KSkge1xuICAgICAgICAgICAgaW5wdXRNYXBbc2FtcGxlci5pbnB1dF0gPSBjcmVhdGVBbmltRGF0YShnbHRmQWNjZXNzb3JzW3NhbXBsZXIuaW5wdXRdKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGdldCBvdXRwdXQgZGF0YVxuICAgICAgICBpZiAoIW91dHB1dE1hcC5oYXNPd25Qcm9wZXJ0eShzYW1wbGVyLm91dHB1dCkpIHtcbiAgICAgICAgICAgIG91dHB1dE1hcFtzYW1wbGVyLm91dHB1dF0gPSBjcmVhdGVBbmltRGF0YShnbHRmQWNjZXNzb3JzW3NhbXBsZXIub3V0cHV0XSk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBpbnRlcnBvbGF0aW9uID1cbiAgICAgICAgICAgIHNhbXBsZXIuaGFzT3duUHJvcGVydHkoJ2ludGVycG9sYXRpb24nKSAmJlxuICAgICAgICAgICAgaW50ZXJwTWFwLmhhc093blByb3BlcnR5KHNhbXBsZXIuaW50ZXJwb2xhdGlvbikgP1xuICAgICAgICAgICAgICAgIGludGVycE1hcFtzYW1wbGVyLmludGVycG9sYXRpb25dIDogSU5URVJQT0xBVElPTl9MSU5FQVI7XG5cbiAgICAgICAgLy8gY3JlYXRlIGN1cnZlXG4gICAgICAgIGNvbnN0IGN1cnZlID0ge1xuICAgICAgICAgICAgcGF0aHM6IFtdLFxuICAgICAgICAgICAgaW5wdXQ6IHNhbXBsZXIuaW5wdXQsXG4gICAgICAgICAgICBvdXRwdXQ6IHNhbXBsZXIub3V0cHV0LFxuICAgICAgICAgICAgaW50ZXJwb2xhdGlvbjogaW50ZXJwb2xhdGlvblxuICAgICAgICB9O1xuXG4gICAgICAgIGN1cnZlTWFwW2ldID0gY3VydmU7XG4gICAgfVxuXG4gICAgY29uc3QgcXVhdEFycmF5cyA9IFtdO1xuXG4gICAgY29uc3QgdHJhbnNmb3JtU2NoZW1hID0ge1xuICAgICAgICAndHJhbnNsYXRpb24nOiAnbG9jYWxQb3NpdGlvbicsXG4gICAgICAgICdyb3RhdGlvbic6ICdsb2NhbFJvdGF0aW9uJyxcbiAgICAgICAgJ3NjYWxlJzogJ2xvY2FsU2NhbGUnXG4gICAgfTtcblxuICAgIGNvbnN0IGNvbnN0cnVjdE5vZGVQYXRoID0gKG5vZGUpID0+IHtcbiAgICAgICAgY29uc3QgcGF0aCA9IFtdO1xuICAgICAgICB3aGlsZSAobm9kZSkge1xuICAgICAgICAgICAgcGF0aC51bnNoaWZ0KG5vZGUubmFtZSk7XG4gICAgICAgICAgICBub2RlID0gbm9kZS5wYXJlbnQ7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHBhdGg7XG4gICAgfTtcblxuICAgIC8vIEFsbCBtb3JwaCB0YXJnZXRzIGFyZSBpbmNsdWRlZCBpbiBhIHNpbmdsZSBjaGFubmVsIG9mIHRoZSBhbmltYXRpb24sIHdpdGggYWxsIHRhcmdldHMgb3V0cHV0IGRhdGEgaW50ZXJsZWF2ZWQgd2l0aCBlYWNoIG90aGVyLlxuICAgIC8vIFRoaXMgZnVuY3Rpb24gc3BsaXRzIGVhY2ggbW9ycGggdGFyZ2V0IG91dCBpbnRvIGl0IGEgY3VydmUgd2l0aCBpdHMgb3duIG91dHB1dCBkYXRhLCBhbGxvd2luZyB1cyB0byBhbmltYXRlIGVhY2ggbW9ycGggdGFyZ2V0IGluZGVwZW5kZW50bHkgYnkgbmFtZS5cbiAgICBjb25zdCBjcmVhdGVNb3JwaFRhcmdldEN1cnZlcyA9IChjdXJ2ZSwgZ2x0Zk5vZGUsIGVudGl0eVBhdGgpID0+IHtcbiAgICAgICAgY29uc3Qgb3V0ID0gb3V0cHV0TWFwW2N1cnZlLm91dHB1dF07XG4gICAgICAgIGlmICghb3V0KSB7XG4gICAgICAgICAgICBEZWJ1Zy53YXJuKGBnbGItcGFyc2VyOiBObyBvdXRwdXQgZGF0YSBpcyBhdmFpbGFibGUgZm9yIHRoZSBtb3JwaCB0YXJnZXQgY3VydmUgKCR7ZW50aXR5UGF0aH0vZ3JhcGgvd2VpZ2h0cykuIFNraXBwaW5nLmApO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gbmFtZXMgb2YgbW9ycGggdGFyZ2V0c1xuICAgICAgICBsZXQgdGFyZ2V0TmFtZXM7XG4gICAgICAgIGlmIChtZXNoZXMgJiYgbWVzaGVzW2dsdGZOb2RlLm1lc2hdKSB7XG4gICAgICAgICAgICBjb25zdCBtZXNoID0gbWVzaGVzW2dsdGZOb2RlLm1lc2hdO1xuICAgICAgICAgICAgaWYgKG1lc2guaGFzT3duUHJvcGVydHkoJ2V4dHJhcycpICYmIG1lc2guZXh0cmFzLmhhc093blByb3BlcnR5KCd0YXJnZXROYW1lcycpKSB7XG4gICAgICAgICAgICAgICAgdGFyZ2V0TmFtZXMgPSBtZXNoLmV4dHJhcy50YXJnZXROYW1lcztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IG91dERhdGEgPSBvdXQuZGF0YTtcbiAgICAgICAgY29uc3QgbW9ycGhUYXJnZXRDb3VudCA9IG91dERhdGEubGVuZ3RoIC8gaW5wdXRNYXBbY3VydmUuaW5wdXRdLmRhdGEubGVuZ3RoO1xuICAgICAgICBjb25zdCBrZXlmcmFtZUNvdW50ID0gb3V0RGF0YS5sZW5ndGggLyBtb3JwaFRhcmdldENvdW50O1xuXG4gICAgICAgIC8vIHNpbmdsZSBhcnJheSBidWZmZXIgZm9yIGFsbCBrZXlzLCA0IGJ5dGVzIHBlciBlbnRyeVxuICAgICAgICBjb25zdCBzaW5nbGVCdWZmZXJTaXplID0ga2V5ZnJhbWVDb3VudCAqIDQ7XG4gICAgICAgIGNvbnN0IGJ1ZmZlciA9IG5ldyBBcnJheUJ1ZmZlcihzaW5nbGVCdWZmZXJTaXplICogbW9ycGhUYXJnZXRDb3VudCk7XG5cbiAgICAgICAgZm9yIChsZXQgaiA9IDA7IGogPCBtb3JwaFRhcmdldENvdW50OyBqKyspIHtcbiAgICAgICAgICAgIGNvbnN0IG1vcnBoVGFyZ2V0T3V0cHV0ID0gbmV3IEZsb2F0MzJBcnJheShidWZmZXIsIHNpbmdsZUJ1ZmZlclNpemUgKiBqLCBrZXlmcmFtZUNvdW50KTtcblxuICAgICAgICAgICAgLy8gdGhlIG91dHB1dCBkYXRhIGZvciBhbGwgbW9ycGggdGFyZ2V0cyBpbiBhIHNpbmdsZSBjdXJ2ZSBpcyBpbnRlcmxlYXZlZC4gV2UgbmVlZCB0byByZXRyaWV2ZSB0aGUga2V5ZnJhbWUgb3V0cHV0IGRhdGEgZm9yIGEgc2luZ2xlIG1vcnBoIHRhcmdldFxuICAgICAgICAgICAgZm9yIChsZXQgayA9IDA7IGsgPCBrZXlmcmFtZUNvdW50OyBrKyspIHtcbiAgICAgICAgICAgICAgICBtb3JwaFRhcmdldE91dHB1dFtrXSA9IG91dERhdGFbayAqIG1vcnBoVGFyZ2V0Q291bnQgKyBqXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IG91dHB1dCA9IG5ldyBBbmltRGF0YSgxLCBtb3JwaFRhcmdldE91dHB1dCk7XG4gICAgICAgICAgICBjb25zdCB3ZWlnaHROYW1lID0gdGFyZ2V0TmFtZXM/LltqXSA/IGBuYW1lLiR7dGFyZ2V0TmFtZXNbal19YCA6IGo7XG5cbiAgICAgICAgICAgIC8vIGFkZCB0aGUgaW5kaXZpZHVhbCBtb3JwaCB0YXJnZXQgb3V0cHV0IGRhdGEgdG8gdGhlIG91dHB1dE1hcCB1c2luZyBhIG5lZ2F0aXZlIHZhbHVlIGtleSAoc28gYXMgbm90IHRvIGNsYXNoIHdpdGggc2FtcGxlci5vdXRwdXQgdmFsdWVzKVxuICAgICAgICAgICAgb3V0cHV0TWFwWy1vdXRwdXRDb3VudGVyXSA9IG91dHB1dDtcbiAgICAgICAgICAgIGNvbnN0IG1vcnBoQ3VydmUgPSB7XG4gICAgICAgICAgICAgICAgcGF0aHM6IFt7XG4gICAgICAgICAgICAgICAgICAgIGVudGl0eVBhdGg6IGVudGl0eVBhdGgsXG4gICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudDogJ2dyYXBoJyxcbiAgICAgICAgICAgICAgICAgICAgcHJvcGVydHlQYXRoOiBbYHdlaWdodC4ke3dlaWdodE5hbWV9YF1cbiAgICAgICAgICAgICAgICB9XSxcbiAgICAgICAgICAgICAgICAvLyBlYWNoIG1vcnBoIHRhcmdldCBjdXJ2ZSBpbnB1dCBjYW4gdXNlIHRoZSBzYW1lIHNhbXBsZXIuaW5wdXQgZnJvbSB0aGUgY2hhbm5lbCB0aGV5IHdlcmUgYWxsIGluXG4gICAgICAgICAgICAgICAgaW5wdXQ6IGN1cnZlLmlucHV0LFxuICAgICAgICAgICAgICAgIC8vIGJ1dCBlYWNoIG1vcnBoIHRhcmdldCBjdXJ2ZSBzaG91bGQgcmVmZXJlbmNlIGl0cyBpbmRpdmlkdWFsIG91dHB1dCB0aGF0IHdhcyBqdXN0IGNyZWF0ZWRcbiAgICAgICAgICAgICAgICBvdXRwdXQ6IC1vdXRwdXRDb3VudGVyLFxuICAgICAgICAgICAgICAgIGludGVycG9sYXRpb246IGN1cnZlLmludGVycG9sYXRpb25cbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBvdXRwdXRDb3VudGVyKys7XG4gICAgICAgICAgICAvLyBhZGQgdGhlIG1vcnBoIHRhcmdldCBjdXJ2ZSB0byB0aGUgY3VydmVNYXBcbiAgICAgICAgICAgIGN1cnZlTWFwW2Btb3JwaEN1cnZlLSR7aX0tJHtqfWBdID0gbW9ycGhDdXJ2ZTtcbiAgICAgICAgfVxuICAgIH07XG5cbiAgICAvLyBjb252ZXJ0IGFuaW0gY2hhbm5lbHNcbiAgICBmb3IgKGkgPSAwOyBpIDwgZ2x0ZkFuaW1hdGlvbi5jaGFubmVscy5sZW5ndGg7ICsraSkge1xuICAgICAgICBjb25zdCBjaGFubmVsID0gZ2x0ZkFuaW1hdGlvbi5jaGFubmVsc1tpXTtcbiAgICAgICAgY29uc3QgdGFyZ2V0ID0gY2hhbm5lbC50YXJnZXQ7XG4gICAgICAgIGNvbnN0IGN1cnZlID0gY3VydmVNYXBbY2hhbm5lbC5zYW1wbGVyXTtcblxuICAgICAgICBjb25zdCBub2RlID0gbm9kZXNbdGFyZ2V0Lm5vZGVdO1xuICAgICAgICBjb25zdCBnbHRmTm9kZSA9IGdsdGZOb2Rlc1t0YXJnZXQubm9kZV07XG4gICAgICAgIGNvbnN0IGVudGl0eVBhdGggPSBjb25zdHJ1Y3ROb2RlUGF0aChub2RlKTtcblxuICAgICAgICBpZiAodGFyZ2V0LnBhdGguc3RhcnRzV2l0aCgnd2VpZ2h0cycpKSB7XG4gICAgICAgICAgICBjcmVhdGVNb3JwaFRhcmdldEN1cnZlcyhjdXJ2ZSwgZ2x0Zk5vZGUsIGVudGl0eVBhdGgpO1xuICAgICAgICAgICAgLy8gYXMgYWxsIGluZGl2aWR1YWwgbW9ycGggdGFyZ2V0cyBpbiB0aGlzIG1vcnBoIGN1cnZlIGhhdmUgdGhlaXIgb3duIGN1cnZlIG5vdywgdGhpcyBtb3JwaCBjdXJ2ZSBzaG91bGQgYmUgZmxhZ2dlZFxuICAgICAgICAgICAgLy8gc28gaXQncyBub3QgaW5jbHVkZWQgaW4gdGhlIGZpbmFsIG91dHB1dFxuICAgICAgICAgICAgY3VydmVNYXBbY2hhbm5lbC5zYW1wbGVyXS5tb3JwaEN1cnZlID0gdHJ1ZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGN1cnZlLnBhdGhzLnB1c2goe1xuICAgICAgICAgICAgICAgIGVudGl0eVBhdGg6IGVudGl0eVBhdGgsXG4gICAgICAgICAgICAgICAgY29tcG9uZW50OiAnZ3JhcGgnLFxuICAgICAgICAgICAgICAgIHByb3BlcnR5UGF0aDogW3RyYW5zZm9ybVNjaGVtYVt0YXJnZXQucGF0aF1dXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IGlucHV0cyA9IFtdO1xuICAgIGNvbnN0IG91dHB1dHMgPSBbXTtcbiAgICBjb25zdCBjdXJ2ZXMgPSBbXTtcblxuICAgIC8vIEFkZCBlYWNoIGlucHV0IGluIHRoZSBtYXAgdG8gdGhlIGZpbmFsIGlucHV0cyBhcnJheS4gVGhlIGlucHV0TWFwIHNob3VsZCBub3cgcmVmZXJlbmNlIHRoZSBpbmRleCBvZiBpbnB1dCBpbiB0aGUgaW5wdXRzIGFycmF5IGluc3RlYWQgb2YgdGhlIGlucHV0IGl0c2VsZi5cbiAgICBmb3IgKGNvbnN0IGlucHV0S2V5IGluIGlucHV0TWFwKSB7XG4gICAgICAgIGlucHV0cy5wdXNoKGlucHV0TWFwW2lucHV0S2V5XSk7XG4gICAgICAgIGlucHV0TWFwW2lucHV0S2V5XSA9IGlucHV0cy5sZW5ndGggLSAxO1xuICAgIH1cbiAgICAvLyBBZGQgZWFjaCBvdXRwdXQgaW4gdGhlIG1hcCB0byB0aGUgZmluYWwgb3V0cHV0cyBhcnJheS4gVGhlIG91dHB1dE1hcCBzaG91bGQgbm93IHJlZmVyZW5jZSB0aGUgaW5kZXggb2Ygb3V0cHV0IGluIHRoZSBvdXRwdXRzIGFycmF5IGluc3RlYWQgb2YgdGhlIG91dHB1dCBpdHNlbGYuXG4gICAgZm9yIChjb25zdCBvdXRwdXRLZXkgaW4gb3V0cHV0TWFwKSB7XG4gICAgICAgIG91dHB1dHMucHVzaChvdXRwdXRNYXBbb3V0cHV0S2V5XSk7XG4gICAgICAgIG91dHB1dE1hcFtvdXRwdXRLZXldID0gb3V0cHV0cy5sZW5ndGggLSAxO1xuICAgIH1cbiAgICAvLyBDcmVhdGUgYW4gQW5pbUN1cnZlIGZvciBlYWNoIGN1cnZlIG9iamVjdCBpbiB0aGUgY3VydmVNYXAuIEVhY2ggY3VydmUgb2JqZWN0J3MgaW5wdXQgdmFsdWUgc2hvdWxkIGJlIHJlc29sdmVkIHRvIHRoZSBpbmRleCBvZiB0aGUgaW5wdXQgaW4gdGhlXG4gICAgLy8gaW5wdXRzIGFycmF5cyB1c2luZyB0aGUgaW5wdXRNYXAuIExpa2V3aXNlIGZvciBvdXRwdXQgdmFsdWVzLlxuICAgIGZvciAoY29uc3QgY3VydmVLZXkgaW4gY3VydmVNYXApIHtcbiAgICAgICAgY29uc3QgY3VydmVEYXRhID0gY3VydmVNYXBbY3VydmVLZXldO1xuICAgICAgICAvLyBpZiB0aGUgY3VydmVEYXRhIGNvbnRhaW5zIGEgbW9ycGggY3VydmUgdGhlbiBkbyBub3QgYWRkIGl0IHRvIHRoZSBmaW5hbCBjdXJ2ZSBsaXN0IGFzIHRoZSBpbmRpdmlkdWFsIG1vcnBoIHRhcmdldCBjdXJ2ZXMgYXJlIGluY2x1ZGVkIGluc3RlYWRcbiAgICAgICAgaWYgKGN1cnZlRGF0YS5tb3JwaEN1cnZlKSB7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuICAgICAgICBjdXJ2ZXMucHVzaChuZXcgQW5pbUN1cnZlKFxuICAgICAgICAgICAgY3VydmVEYXRhLnBhdGhzLFxuICAgICAgICAgICAgaW5wdXRNYXBbY3VydmVEYXRhLmlucHV0XSxcbiAgICAgICAgICAgIG91dHB1dE1hcFtjdXJ2ZURhdGEub3V0cHV0XSxcbiAgICAgICAgICAgIGN1cnZlRGF0YS5pbnRlcnBvbGF0aW9uXG4gICAgICAgICkpO1xuXG4gICAgICAgIC8vIGlmIHRoaXMgdGFyZ2V0IGlzIGEgc2V0IG9mIHF1YXRlcm5pb24ga2V5cywgbWFrZSBub3RlIG9mIGl0cyBpbmRleCBzbyB3ZSBjYW4gcGVyZm9ybVxuICAgICAgICAvLyBxdWF0ZXJuaW9uLXNwZWNpZmljIHByb2Nlc3Npbmcgb24gaXQuXG4gICAgICAgIGlmIChjdXJ2ZURhdGEucGF0aHMubGVuZ3RoID4gMCAmJiBjdXJ2ZURhdGEucGF0aHNbMF0ucHJvcGVydHlQYXRoWzBdID09PSAnbG9jYWxSb3RhdGlvbicgJiYgY3VydmVEYXRhLmludGVycG9sYXRpb24gIT09IElOVEVSUE9MQVRJT05fQ1VCSUMpIHtcbiAgICAgICAgICAgIHF1YXRBcnJheXMucHVzaChjdXJ2ZXNbY3VydmVzLmxlbmd0aCAtIDFdLm91dHB1dCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBzb3J0IHRoZSBsaXN0IG9mIGFycmF5IGluZGV4ZXMgc28gd2UgY2FuIHNraXAgZHVwc1xuICAgIHF1YXRBcnJheXMuc29ydCgpO1xuXG4gICAgLy8gcnVuIHRocm91Z2ggdGhlIHF1YXRlcm5pb24gZGF0YSBhcnJheXMgZmxpcHBpbmcgcXVhdGVybmlvbiBrZXlzXG4gICAgLy8gdGhhdCBkb24ndCBmYWxsIGluIHRoZSBzYW1lIHdpbmRpbmcgb3JkZXIuXG4gICAgbGV0IHByZXZJbmRleCA9IG51bGw7XG4gICAgbGV0IGRhdGE7XG4gICAgZm9yIChpID0gMDsgaSA8IHF1YXRBcnJheXMubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgY29uc3QgaW5kZXggPSBxdWF0QXJyYXlzW2ldO1xuICAgICAgICAvLyBza2lwIG92ZXIgZHVwbGljYXRlIGFycmF5IGluZGljZXNcbiAgICAgICAgaWYgKGkgPT09IDAgfHwgaW5kZXggIT09IHByZXZJbmRleCkge1xuICAgICAgICAgICAgZGF0YSA9IG91dHB1dHNbaW5kZXhdO1xuICAgICAgICAgICAgaWYgKGRhdGEuY29tcG9uZW50cyA9PT0gNCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGQgPSBkYXRhLmRhdGE7XG4gICAgICAgICAgICAgICAgY29uc3QgbGVuID0gZC5sZW5ndGggLSA0O1xuICAgICAgICAgICAgICAgIGZvciAobGV0IGogPSAwOyBqIDwgbGVuOyBqICs9IDQpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZHAgPSBkW2ogKyAwXSAqIGRbaiArIDRdICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZFtqICsgMV0gKiBkW2ogKyA1XSArXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRbaiArIDJdICogZFtqICsgNl0gK1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkW2ogKyAzXSAqIGRbaiArIDddO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChkcCA8IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRbaiArIDRdICo9IC0xO1xuICAgICAgICAgICAgICAgICAgICAgICAgZFtqICsgNV0gKj0gLTE7XG4gICAgICAgICAgICAgICAgICAgICAgICBkW2ogKyA2XSAqPSAtMTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRbaiArIDddICo9IC0xO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcHJldkluZGV4ID0gaW5kZXg7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBjYWxjdWxhdGUgZHVyYXRpb24gb2YgdGhlIGFuaW1hdGlvbiBhcyBtYXhpbXVtIHRpbWUgdmFsdWVcbiAgICBsZXQgZHVyYXRpb24gPSAwO1xuICAgIGZvciAoaSA9IDA7IGkgPCBpbnB1dHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgZGF0YSAgPSBpbnB1dHNbaV0uX2RhdGE7XG4gICAgICAgIGR1cmF0aW9uID0gTWF0aC5tYXgoZHVyYXRpb24sIGRhdGEubGVuZ3RoID09PSAwID8gMCA6IGRhdGFbZGF0YS5sZW5ndGggLSAxXSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIG5ldyBBbmltVHJhY2soXG4gICAgICAgIGdsdGZBbmltYXRpb24uaGFzT3duUHJvcGVydHkoJ25hbWUnKSA/IGdsdGZBbmltYXRpb24ubmFtZSA6ICgnYW5pbWF0aW9uXycgKyBhbmltYXRpb25JbmRleCksXG4gICAgICAgIGR1cmF0aW9uLFxuICAgICAgICBpbnB1dHMsXG4gICAgICAgIG91dHB1dHMsXG4gICAgICAgIGN1cnZlcyk7XG59O1xuXG5jb25zdCB0ZW1wTWF0ID0gbmV3IE1hdDQoKTtcbmNvbnN0IHRlbXBWZWMgPSBuZXcgVmVjMygpO1xuXG5jb25zdCBjcmVhdGVOb2RlID0gKGdsdGZOb2RlLCBub2RlSW5kZXgpID0+IHtcbiAgICBjb25zdCBlbnRpdHkgPSBuZXcgR3JhcGhOb2RlKCk7XG5cbiAgICBpZiAoZ2x0Zk5vZGUuaGFzT3duUHJvcGVydHkoJ25hbWUnKSAmJiBnbHRmTm9kZS5uYW1lLmxlbmd0aCA+IDApIHtcbiAgICAgICAgZW50aXR5Lm5hbWUgPSBnbHRmTm9kZS5uYW1lO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIGVudGl0eS5uYW1lID0gJ25vZGVfJyArIG5vZGVJbmRleDtcbiAgICB9XG5cbiAgICAvLyBQYXJzZSB0cmFuc2Zvcm1hdGlvbiBwcm9wZXJ0aWVzXG4gICAgaWYgKGdsdGZOb2RlLmhhc093blByb3BlcnR5KCdtYXRyaXgnKSkge1xuICAgICAgICB0ZW1wTWF0LmRhdGEuc2V0KGdsdGZOb2RlLm1hdHJpeCk7XG4gICAgICAgIHRlbXBNYXQuZ2V0VHJhbnNsYXRpb24odGVtcFZlYyk7XG4gICAgICAgIGVudGl0eS5zZXRMb2NhbFBvc2l0aW9uKHRlbXBWZWMpO1xuICAgICAgICB0ZW1wTWF0LmdldEV1bGVyQW5nbGVzKHRlbXBWZWMpO1xuICAgICAgICBlbnRpdHkuc2V0TG9jYWxFdWxlckFuZ2xlcyh0ZW1wVmVjKTtcbiAgICAgICAgdGVtcE1hdC5nZXRTY2FsZSh0ZW1wVmVjKTtcbiAgICAgICAgZW50aXR5LnNldExvY2FsU2NhbGUodGVtcFZlYyk7XG4gICAgfVxuXG4gICAgaWYgKGdsdGZOb2RlLmhhc093blByb3BlcnR5KCdyb3RhdGlvbicpKSB7XG4gICAgICAgIGNvbnN0IHIgPSBnbHRmTm9kZS5yb3RhdGlvbjtcbiAgICAgICAgZW50aXR5LnNldExvY2FsUm90YXRpb24oclswXSwgclsxXSwgclsyXSwgclszXSk7XG4gICAgfVxuXG4gICAgaWYgKGdsdGZOb2RlLmhhc093blByb3BlcnR5KCd0cmFuc2xhdGlvbicpKSB7XG4gICAgICAgIGNvbnN0IHQgPSBnbHRmTm9kZS50cmFuc2xhdGlvbjtcbiAgICAgICAgZW50aXR5LnNldExvY2FsUG9zaXRpb24odFswXSwgdFsxXSwgdFsyXSk7XG4gICAgfVxuXG4gICAgaWYgKGdsdGZOb2RlLmhhc093blByb3BlcnR5KCdzY2FsZScpKSB7XG4gICAgICAgIGNvbnN0IHMgPSBnbHRmTm9kZS5zY2FsZTtcbiAgICAgICAgZW50aXR5LnNldExvY2FsU2NhbGUoc1swXSwgc1sxXSwgc1syXSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGVudGl0eTtcbn07XG5cbi8vIGNyZWF0ZXMgYSBjYW1lcmEgY29tcG9uZW50IG9uIHRoZSBzdXBwbGllZCBub2RlLCBhbmQgcmV0dXJucyBpdFxuY29uc3QgY3JlYXRlQ2FtZXJhID0gKGdsdGZDYW1lcmEsIG5vZGUpID0+IHtcblxuICAgIGNvbnN0IHByb2plY3Rpb24gPSBnbHRmQ2FtZXJhLnR5cGUgPT09ICdvcnRob2dyYXBoaWMnID8gUFJPSkVDVElPTl9PUlRIT0dSQVBISUMgOiBQUk9KRUNUSU9OX1BFUlNQRUNUSVZFO1xuICAgIGNvbnN0IGdsdGZQcm9wZXJ0aWVzID0gcHJvamVjdGlvbiA9PT0gUFJPSkVDVElPTl9PUlRIT0dSQVBISUMgPyBnbHRmQ2FtZXJhLm9ydGhvZ3JhcGhpYyA6IGdsdGZDYW1lcmEucGVyc3BlY3RpdmU7XG5cbiAgICBjb25zdCBjb21wb25lbnREYXRhID0ge1xuICAgICAgICBlbmFibGVkOiBmYWxzZSxcbiAgICAgICAgcHJvamVjdGlvbjogcHJvamVjdGlvbixcbiAgICAgICAgbmVhckNsaXA6IGdsdGZQcm9wZXJ0aWVzLnpuZWFyLFxuICAgICAgICBhc3BlY3RSYXRpb01vZGU6IEFTUEVDVF9BVVRPXG4gICAgfTtcblxuICAgIGlmIChnbHRmUHJvcGVydGllcy56ZmFyKSB7XG4gICAgICAgIGNvbXBvbmVudERhdGEuZmFyQ2xpcCA9IGdsdGZQcm9wZXJ0aWVzLnpmYXI7XG4gICAgfVxuXG4gICAgaWYgKHByb2plY3Rpb24gPT09IFBST0pFQ1RJT05fT1JUSE9HUkFQSElDKSB7XG4gICAgICAgIGNvbXBvbmVudERhdGEub3J0aG9IZWlnaHQgPSAwLjUgKiBnbHRmUHJvcGVydGllcy55bWFnO1xuICAgICAgICBpZiAoZ2x0ZlByb3BlcnRpZXMueW1hZykge1xuICAgICAgICAgICAgY29tcG9uZW50RGF0YS5hc3BlY3RSYXRpb01vZGUgPSBBU1BFQ1RfTUFOVUFMO1xuICAgICAgICAgICAgY29tcG9uZW50RGF0YS5hc3BlY3RSYXRpbyA9IGdsdGZQcm9wZXJ0aWVzLnhtYWcgLyBnbHRmUHJvcGVydGllcy55bWFnO1xuICAgICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgICAgY29tcG9uZW50RGF0YS5mb3YgPSBnbHRmUHJvcGVydGllcy55Zm92ICogbWF0aC5SQURfVE9fREVHO1xuICAgICAgICBpZiAoZ2x0ZlByb3BlcnRpZXMuYXNwZWN0UmF0aW8pIHtcbiAgICAgICAgICAgIGNvbXBvbmVudERhdGEuYXNwZWN0UmF0aW9Nb2RlID0gQVNQRUNUX01BTlVBTDtcbiAgICAgICAgICAgIGNvbXBvbmVudERhdGEuYXNwZWN0UmF0aW8gPSBnbHRmUHJvcGVydGllcy5hc3BlY3RSYXRpbztcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IGNhbWVyYUVudGl0eSA9IG5ldyBFbnRpdHkoZ2x0ZkNhbWVyYS5uYW1lKTtcbiAgICBjYW1lcmFFbnRpdHkuYWRkQ29tcG9uZW50KCdjYW1lcmEnLCBjb21wb25lbnREYXRhKTtcbiAgICByZXR1cm4gY2FtZXJhRW50aXR5O1xufTtcblxuLy8gY3JlYXRlcyBsaWdodCBjb21wb25lbnQsIGFkZHMgaXQgdG8gdGhlIG5vZGUgYW5kIHJldHVybnMgdGhlIGNyZWF0ZWQgbGlnaHQgY29tcG9uZW50XG5jb25zdCBjcmVhdGVMaWdodCA9IChnbHRmTGlnaHQsIG5vZGUpID0+IHtcblxuICAgIGNvbnN0IGxpZ2h0UHJvcHMgPSB7XG4gICAgICAgIGVuYWJsZWQ6IGZhbHNlLFxuICAgICAgICB0eXBlOiBnbHRmTGlnaHQudHlwZSA9PT0gJ3BvaW50JyA/ICdvbW5pJyA6IGdsdGZMaWdodC50eXBlLFxuICAgICAgICBjb2xvcjogZ2x0ZkxpZ2h0Lmhhc093blByb3BlcnR5KCdjb2xvcicpID8gbmV3IENvbG9yKGdsdGZMaWdodC5jb2xvcikgOiBDb2xvci5XSElURSxcblxuICAgICAgICAvLyB3aGVuIHJhbmdlIGlzIG5vdCBkZWZpbmVkLCBpbmZpbml0eSBzaG91bGQgYmUgdXNlZCAtIGJ1dCB0aGF0IGlzIGNhdXNpbmcgaW5maW5pdHkgaW4gYm91bmRzIGNhbGN1bGF0aW9uc1xuICAgICAgICByYW5nZTogZ2x0ZkxpZ2h0Lmhhc093blByb3BlcnR5KCdyYW5nZScpID8gZ2x0ZkxpZ2h0LnJhbmdlIDogOTk5OSxcblxuICAgICAgICBmYWxsb2ZmTW9kZTogTElHSFRGQUxMT0ZGX0lOVkVSU0VTUVVBUkVELFxuXG4gICAgICAgIC8vIFRPRE86IChlbmdpbmUgaXNzdWUgIzMyNTIpIFNldCBpbnRlbnNpdHkgdG8gbWF0Y2ggZ2xURiBzcGVjaWZpY2F0aW9uLCB3aGljaCB1c2VzIHBoeXNpY2FsbHkgYmFzZWQgdmFsdWVzOlxuICAgICAgICAvLyAtIE9tbmkgYW5kIHNwb3QgbGlnaHRzIHVzZSBsdW1pbm91cyBpbnRlbnNpdHkgaW4gY2FuZGVsYSAobG0vc3IpXG4gICAgICAgIC8vIC0gRGlyZWN0aW9uYWwgbGlnaHRzIHVzZSBpbGx1bWluYW5jZSBpbiBsdXggKGxtL20yKS5cbiAgICAgICAgLy8gQ3VycmVudCBpbXBsZW1lbnRhdGlvbjogY2xhcG1zIHNwZWNpZmllZCBpbnRlbnNpdHkgdG8gMC4uMiByYW5nZVxuICAgICAgICBpbnRlbnNpdHk6IGdsdGZMaWdodC5oYXNPd25Qcm9wZXJ0eSgnaW50ZW5zaXR5JykgPyBtYXRoLmNsYW1wKGdsdGZMaWdodC5pbnRlbnNpdHksIDAsIDIpIDogMVxuICAgIH07XG5cbiAgICBpZiAoZ2x0ZkxpZ2h0Lmhhc093blByb3BlcnR5KCdzcG90JykpIHtcbiAgICAgICAgbGlnaHRQcm9wcy5pbm5lckNvbmVBbmdsZSA9IGdsdGZMaWdodC5zcG90Lmhhc093blByb3BlcnR5KCdpbm5lckNvbmVBbmdsZScpID8gZ2x0ZkxpZ2h0LnNwb3QuaW5uZXJDb25lQW5nbGUgKiBtYXRoLlJBRF9UT19ERUcgOiAwO1xuICAgICAgICBsaWdodFByb3BzLm91dGVyQ29uZUFuZ2xlID0gZ2x0ZkxpZ2h0LnNwb3QuaGFzT3duUHJvcGVydHkoJ291dGVyQ29uZUFuZ2xlJykgPyBnbHRmTGlnaHQuc3BvdC5vdXRlckNvbmVBbmdsZSAqIG1hdGguUkFEX1RPX0RFRyA6IE1hdGguUEkgLyA0O1xuICAgIH1cblxuICAgIC8vIGdsVEYgc3RvcmVzIGxpZ2h0IGFscmVhZHkgaW4gZW5lcmd5L2FyZWEsIGJ1dCB3ZSBuZWVkIHRvIHByb3ZpZGUgdGhlIGxpZ2h0IHdpdGggb25seSB0aGUgZW5lcmd5IHBhcmFtZXRlcixcbiAgICAvLyBzbyB3ZSBuZWVkIHRoZSBpbnRlbnNpdGllcyBpbiBjYW5kZWxhIGJhY2sgdG8gbHVtZW5cbiAgICBpZiAoZ2x0ZkxpZ2h0Lmhhc093blByb3BlcnR5KFwiaW50ZW5zaXR5XCIpKSB7XG4gICAgICAgIGxpZ2h0UHJvcHMubHVtaW5hbmNlID0gZ2x0ZkxpZ2h0LmludGVuc2l0eSAqIExpZ2h0LmdldExpZ2h0VW5pdENvbnZlcnNpb24obGlnaHRUeXBlc1tsaWdodFByb3BzLnR5cGVdLCBsaWdodFByb3BzLm91dGVyQ29uZUFuZ2xlLCBsaWdodFByb3BzLmlubmVyQ29uZUFuZ2xlKTtcbiAgICB9XG5cbiAgICAvLyBSb3RhdGUgdG8gbWF0Y2ggbGlnaHQgb3JpZW50YXRpb24gaW4gZ2xURiBzcGVjaWZpY2F0aW9uXG4gICAgLy8gTm90ZSB0aGF0IHRoaXMgYWRkcyBhIG5ldyBlbnRpdHkgbm9kZSBpbnRvIHRoZSBoaWVyYXJjaHkgdGhhdCBkb2VzIG5vdCBleGlzdCBpbiB0aGUgZ2x0ZiBoaWVyYXJjaHlcbiAgICBjb25zdCBsaWdodEVudGl0eSA9IG5ldyBFbnRpdHkobm9kZS5uYW1lKTtcbiAgICBsaWdodEVudGl0eS5yb3RhdGVMb2NhbCg5MCwgMCwgMCk7XG5cbiAgICAvLyBhZGQgY29tcG9uZW50XG4gICAgbGlnaHRFbnRpdHkuYWRkQ29tcG9uZW50KCdsaWdodCcsIGxpZ2h0UHJvcHMpO1xuICAgIHJldHVybiBsaWdodEVudGl0eTtcbn07XG5cbmNvbnN0IGNyZWF0ZVNraW5zID0gKGRldmljZSwgZ2x0Ziwgbm9kZXMsIGJ1ZmZlclZpZXdzKSA9PiB7XG4gICAgaWYgKCFnbHRmLmhhc093blByb3BlcnR5KCdza2lucycpIHx8IGdsdGYuc2tpbnMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIHJldHVybiBbXTtcbiAgICB9XG5cbiAgICAvLyBjYWNoZSBmb3Igc2tpbnMgdG8gZmlsdGVyIG91dCBkdXBsaWNhdGVzXG4gICAgY29uc3QgZ2xiU2tpbnMgPSBuZXcgTWFwKCk7XG5cbiAgICByZXR1cm4gZ2x0Zi5za2lucy5tYXAoKGdsdGZTa2luKSA9PiB7XG4gICAgICAgIHJldHVybiBjcmVhdGVTa2luKGRldmljZSwgZ2x0ZlNraW4sIGdsdGYuYWNjZXNzb3JzLCBidWZmZXJWaWV3cywgbm9kZXMsIGdsYlNraW5zKTtcbiAgICB9KTtcbn07XG5cbmNvbnN0IGNyZWF0ZU1lc2hlcyA9IChkZXZpY2UsIGdsdGYsIGJ1ZmZlclZpZXdzLCBmbGlwViwgb3B0aW9ucykgPT4ge1xuICAgIC8vIGRpY3Rpb25hcnkgb2YgdmVydGV4IGJ1ZmZlcnMgdG8gYXZvaWQgZHVwbGljYXRlc1xuICAgIGNvbnN0IHZlcnRleEJ1ZmZlckRpY3QgPSB7fTtcbiAgICBjb25zdCBtZXNoVmFyaWFudHMgPSB7fTtcbiAgICBjb25zdCBtZXNoRGVmYXVsdE1hdGVyaWFscyA9IHt9O1xuICAgIGNvbnN0IHByb21pc2VzID0gW107XG5cbiAgICBjb25zdCB2YWxpZCA9ICghb3B0aW9ucy5za2lwTWVzaGVzICYmIGdsdGY/Lm1lc2hlcz8ubGVuZ3RoICYmIGdsdGY/LmFjY2Vzc29ycz8ubGVuZ3RoICYmIGdsdGY/LmJ1ZmZlclZpZXdzPy5sZW5ndGgpO1xuICAgIGNvbnN0IG1lc2hlcyA9IHZhbGlkID8gZ2x0Zi5tZXNoZXMubWFwKChnbHRmTWVzaCkgPT4ge1xuICAgICAgICByZXR1cm4gY3JlYXRlTWVzaChkZXZpY2UsIGdsdGZNZXNoLCBnbHRmLmFjY2Vzc29ycywgYnVmZmVyVmlld3MsIGZsaXBWLCB2ZXJ0ZXhCdWZmZXJEaWN0LCBtZXNoVmFyaWFudHMsIG1lc2hEZWZhdWx0TWF0ZXJpYWxzLCBvcHRpb25zLCBwcm9taXNlcyk7XG4gICAgfSkgOiBbXTtcblxuICAgIHJldHVybiB7XG4gICAgICAgIG1lc2hlcyxcbiAgICAgICAgbWVzaFZhcmlhbnRzLFxuICAgICAgICBtZXNoRGVmYXVsdE1hdGVyaWFscyxcbiAgICAgICAgcHJvbWlzZXNcbiAgICB9O1xufTtcblxuY29uc3QgY3JlYXRlTWF0ZXJpYWxzID0gKGdsdGYsIHRleHR1cmVzLCBvcHRpb25zLCBmbGlwVikgPT4ge1xuICAgIGlmICghZ2x0Zi5oYXNPd25Qcm9wZXJ0eSgnbWF0ZXJpYWxzJykgfHwgZ2x0Zi5tYXRlcmlhbHMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIHJldHVybiBbXTtcbiAgICB9XG5cbiAgICBjb25zdCBwcmVwcm9jZXNzID0gb3B0aW9ucz8ubWF0ZXJpYWw/LnByZXByb2Nlc3M7XG4gICAgY29uc3QgcHJvY2VzcyA9IG9wdGlvbnM/Lm1hdGVyaWFsPy5wcm9jZXNzID8/IGNyZWF0ZU1hdGVyaWFsO1xuICAgIGNvbnN0IHBvc3Rwcm9jZXNzID0gb3B0aW9ucz8ubWF0ZXJpYWw/LnBvc3Rwcm9jZXNzO1xuXG4gICAgcmV0dXJuIGdsdGYubWF0ZXJpYWxzLm1hcCgoZ2x0Zk1hdGVyaWFsKSA9PiB7XG4gICAgICAgIGlmIChwcmVwcm9jZXNzKSB7XG4gICAgICAgICAgICBwcmVwcm9jZXNzKGdsdGZNYXRlcmlhbCk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgbWF0ZXJpYWwgPSBwcm9jZXNzKGdsdGZNYXRlcmlhbCwgdGV4dHVyZXMsIGZsaXBWKTtcbiAgICAgICAgaWYgKHBvc3Rwcm9jZXNzKSB7XG4gICAgICAgICAgICBwb3N0cHJvY2VzcyhnbHRmTWF0ZXJpYWwsIG1hdGVyaWFsKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbWF0ZXJpYWw7XG4gICAgfSk7XG59O1xuXG5jb25zdCBjcmVhdGVWYXJpYW50cyA9IChnbHRmKSA9PiB7XG4gICAgaWYgKCFnbHRmLmhhc093blByb3BlcnR5KFwiZXh0ZW5zaW9uc1wiKSB8fCAhZ2x0Zi5leHRlbnNpb25zLmhhc093blByb3BlcnR5KFwiS0hSX21hdGVyaWFsc192YXJpYW50c1wiKSlcbiAgICAgICAgcmV0dXJuIG51bGw7XG5cbiAgICBjb25zdCBkYXRhID0gZ2x0Zi5leHRlbnNpb25zLktIUl9tYXRlcmlhbHNfdmFyaWFudHMudmFyaWFudHM7XG4gICAgY29uc3QgdmFyaWFudHMgPSB7fTtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGRhdGEubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFyaWFudHNbZGF0YVtpXS5uYW1lXSA9IGk7XG4gICAgfVxuICAgIHJldHVybiB2YXJpYW50cztcbn07XG5cbmNvbnN0IGNyZWF0ZUFuaW1hdGlvbnMgPSAoZ2x0Ziwgbm9kZXMsIGJ1ZmZlclZpZXdzLCBvcHRpb25zKSA9PiB7XG4gICAgaWYgKCFnbHRmLmhhc093blByb3BlcnR5KCdhbmltYXRpb25zJykgfHwgZ2x0Zi5hbmltYXRpb25zLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICByZXR1cm4gW107XG4gICAgfVxuXG4gICAgY29uc3QgcHJlcHJvY2VzcyA9IG9wdGlvbnM/LmFuaW1hdGlvbj8ucHJlcHJvY2VzcztcbiAgICBjb25zdCBwb3N0cHJvY2VzcyA9IG9wdGlvbnM/LmFuaW1hdGlvbj8ucG9zdHByb2Nlc3M7XG5cbiAgICByZXR1cm4gZ2x0Zi5hbmltYXRpb25zLm1hcCgoZ2x0ZkFuaW1hdGlvbiwgaW5kZXgpID0+IHtcbiAgICAgICAgaWYgKHByZXByb2Nlc3MpIHtcbiAgICAgICAgICAgIHByZXByb2Nlc3MoZ2x0ZkFuaW1hdGlvbik7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgYW5pbWF0aW9uID0gY3JlYXRlQW5pbWF0aW9uKGdsdGZBbmltYXRpb24sIGluZGV4LCBnbHRmLmFjY2Vzc29ycywgYnVmZmVyVmlld3MsIG5vZGVzLCBnbHRmLm1lc2hlcywgZ2x0Zi5ub2Rlcyk7XG4gICAgICAgIGlmIChwb3N0cHJvY2Vzcykge1xuICAgICAgICAgICAgcG9zdHByb2Nlc3MoZ2x0ZkFuaW1hdGlvbiwgYW5pbWF0aW9uKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYW5pbWF0aW9uO1xuICAgIH0pO1xufTtcblxuY29uc3QgY3JlYXRlTm9kZXMgPSAoZ2x0Ziwgb3B0aW9ucykgPT4ge1xuICAgIGlmICghZ2x0Zi5oYXNPd25Qcm9wZXJ0eSgnbm9kZXMnKSB8fCBnbHRmLm5vZGVzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICByZXR1cm4gW107XG4gICAgfVxuXG4gICAgY29uc3QgcHJlcHJvY2VzcyA9IG9wdGlvbnM/Lm5vZGU/LnByZXByb2Nlc3M7XG4gICAgY29uc3QgcHJvY2VzcyA9IG9wdGlvbnM/Lm5vZGU/LnByb2Nlc3MgPz8gY3JlYXRlTm9kZTtcbiAgICBjb25zdCBwb3N0cHJvY2VzcyA9IG9wdGlvbnM/Lm5vZGU/LnBvc3Rwcm9jZXNzO1xuXG4gICAgY29uc3Qgbm9kZXMgPSBnbHRmLm5vZGVzLm1hcCgoZ2x0Zk5vZGUsIGluZGV4KSA9PiB7XG4gICAgICAgIGlmIChwcmVwcm9jZXNzKSB7XG4gICAgICAgICAgICBwcmVwcm9jZXNzKGdsdGZOb2RlKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBub2RlID0gcHJvY2VzcyhnbHRmTm9kZSwgaW5kZXgpO1xuICAgICAgICBpZiAocG9zdHByb2Nlc3MpIHtcbiAgICAgICAgICAgIHBvc3Rwcm9jZXNzKGdsdGZOb2RlLCBub2RlKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbm9kZTtcbiAgICB9KTtcblxuICAgIC8vIGJ1aWxkIG5vZGUgaGllcmFyY2h5XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBnbHRmLm5vZGVzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgIGNvbnN0IGdsdGZOb2RlID0gZ2x0Zi5ub2Rlc1tpXTtcbiAgICAgICAgaWYgKGdsdGZOb2RlLmhhc093blByb3BlcnR5KCdjaGlsZHJlbicpKSB7XG4gICAgICAgICAgICBjb25zdCBwYXJlbnQgPSBub2Rlc1tpXTtcbiAgICAgICAgICAgIGNvbnN0IHVuaXF1ZU5hbWVzID0geyB9O1xuICAgICAgICAgICAgZm9yIChsZXQgaiA9IDA7IGogPCBnbHRmTm9kZS5jaGlsZHJlbi5sZW5ndGg7ICsraikge1xuICAgICAgICAgICAgICAgIGNvbnN0IGNoaWxkID0gbm9kZXNbZ2x0Zk5vZGUuY2hpbGRyZW5bal1dO1xuICAgICAgICAgICAgICAgIGlmICghY2hpbGQucGFyZW50KSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICh1bmlxdWVOYW1lcy5oYXNPd25Qcm9wZXJ0eShjaGlsZC5uYW1lKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2hpbGQubmFtZSArPSB1bmlxdWVOYW1lc1tjaGlsZC5uYW1lXSsrO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgdW5pcXVlTmFtZXNbY2hpbGQubmFtZV0gPSAxO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHBhcmVudC5hZGRDaGlsZChjaGlsZCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIG5vZGVzO1xufTtcblxuY29uc3QgY3JlYXRlU2NlbmVzID0gKGdsdGYsIG5vZGVzKSA9PiB7XG4gICAgY29uc3Qgc2NlbmVzID0gW107XG4gICAgY29uc3QgY291bnQgPSBnbHRmLnNjZW5lcy5sZW5ndGg7XG5cbiAgICAvLyBpZiB0aGVyZSdzIGEgc2luZ2xlIHNjZW5lIHdpdGggYSBzaW5nbGUgbm9kZSBpbiBpdCwgZG9uJ3QgY3JlYXRlIHdyYXBwZXIgbm9kZXNcbiAgICBpZiAoY291bnQgPT09IDEgJiYgZ2x0Zi5zY2VuZXNbMF0ubm9kZXM/Lmxlbmd0aCA9PT0gMSkge1xuICAgICAgICBjb25zdCBub2RlSW5kZXggPSBnbHRmLnNjZW5lc1swXS5ub2Rlc1swXTtcbiAgICAgICAgc2NlbmVzLnB1c2gobm9kZXNbbm9kZUluZGV4XSk7XG4gICAgfSBlbHNlIHtcblxuICAgICAgICAvLyBjcmVhdGUgcm9vdCBub2RlIHBlciBzY2VuZVxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGNvdW50OyBpKyspIHtcbiAgICAgICAgICAgIGNvbnN0IHNjZW5lID0gZ2x0Zi5zY2VuZXNbaV07XG4gICAgICAgICAgICBpZiAoc2NlbmUubm9kZXMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBzY2VuZVJvb3QgPSBuZXcgR3JhcGhOb2RlKHNjZW5lLm5hbWUpO1xuICAgICAgICAgICAgICAgIGZvciAobGV0IG4gPSAwOyBuIDwgc2NlbmUubm9kZXMubGVuZ3RoOyBuKyspIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY2hpbGROb2RlID0gbm9kZXNbc2NlbmUubm9kZXNbbl1dO1xuICAgICAgICAgICAgICAgICAgICBzY2VuZVJvb3QuYWRkQ2hpbGQoY2hpbGROb2RlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgc2NlbmVzLnB1c2goc2NlbmVSb290KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBzY2VuZXM7XG59O1xuXG5jb25zdCBjcmVhdGVDYW1lcmFzID0gKGdsdGYsIG5vZGVzLCBvcHRpb25zKSA9PiB7XG5cbiAgICBsZXQgY2FtZXJhcyA9IG51bGw7XG5cbiAgICBpZiAoZ2x0Zi5oYXNPd25Qcm9wZXJ0eSgnbm9kZXMnKSAmJiBnbHRmLmhhc093blByb3BlcnR5KCdjYW1lcmFzJykgJiYgZ2x0Zi5jYW1lcmFzLmxlbmd0aCA+IDApIHtcblxuICAgICAgICBjb25zdCBwcmVwcm9jZXNzID0gb3B0aW9ucz8uY2FtZXJhPy5wcmVwcm9jZXNzO1xuICAgICAgICBjb25zdCBwcm9jZXNzID0gb3B0aW9ucz8uY2FtZXJhPy5wcm9jZXNzID8/IGNyZWF0ZUNhbWVyYTtcbiAgICAgICAgY29uc3QgcG9zdHByb2Nlc3MgPSBvcHRpb25zPy5jYW1lcmE/LnBvc3Rwcm9jZXNzO1xuXG4gICAgICAgIGdsdGYubm9kZXMuZm9yRWFjaCgoZ2x0Zk5vZGUsIG5vZGVJbmRleCkgPT4ge1xuICAgICAgICAgICAgaWYgKGdsdGZOb2RlLmhhc093blByb3BlcnR5KCdjYW1lcmEnKSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGdsdGZDYW1lcmEgPSBnbHRmLmNhbWVyYXNbZ2x0Zk5vZGUuY2FtZXJhXTtcbiAgICAgICAgICAgICAgICBpZiAoZ2x0ZkNhbWVyYSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAocHJlcHJvY2Vzcykge1xuICAgICAgICAgICAgICAgICAgICAgICAgcHJlcHJvY2VzcyhnbHRmQ2FtZXJhKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBjb25zdCBjYW1lcmEgPSBwcm9jZXNzKGdsdGZDYW1lcmEsIG5vZGVzW25vZGVJbmRleF0pO1xuICAgICAgICAgICAgICAgICAgICBpZiAocG9zdHByb2Nlc3MpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHBvc3Rwcm9jZXNzKGdsdGZDYW1lcmEsIGNhbWVyYSk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAvLyBhZGQgdGhlIGNhbWVyYSB0byBub2RlLT5jYW1lcmEgbWFwXG4gICAgICAgICAgICAgICAgICAgIGlmIChjYW1lcmEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghY2FtZXJhcykgY2FtZXJhcyA9IG5ldyBNYXAoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhbWVyYXMuc2V0KGdsdGZOb2RlLCBjYW1lcmEpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICByZXR1cm4gY2FtZXJhcztcbn07XG5cbmNvbnN0IGNyZWF0ZUxpZ2h0cyA9IChnbHRmLCBub2Rlcywgb3B0aW9ucykgPT4ge1xuXG4gICAgbGV0IGxpZ2h0cyA9IG51bGw7XG5cbiAgICBpZiAoZ2x0Zi5oYXNPd25Qcm9wZXJ0eSgnbm9kZXMnKSAmJiBnbHRmLmhhc093blByb3BlcnR5KCdleHRlbnNpb25zJykgJiZcbiAgICAgICAgZ2x0Zi5leHRlbnNpb25zLmhhc093blByb3BlcnR5KCdLSFJfbGlnaHRzX3B1bmN0dWFsJykgJiYgZ2x0Zi5leHRlbnNpb25zLktIUl9saWdodHNfcHVuY3R1YWwuaGFzT3duUHJvcGVydHkoJ2xpZ2h0cycpKSB7XG5cbiAgICAgICAgY29uc3QgZ2x0ZkxpZ2h0cyA9IGdsdGYuZXh0ZW5zaW9ucy5LSFJfbGlnaHRzX3B1bmN0dWFsLmxpZ2h0cztcbiAgICAgICAgaWYgKGdsdGZMaWdodHMubGVuZ3RoKSB7XG5cbiAgICAgICAgICAgIGNvbnN0IHByZXByb2Nlc3MgPSBvcHRpb25zPy5saWdodD8ucHJlcHJvY2VzcztcbiAgICAgICAgICAgIGNvbnN0IHByb2Nlc3MgPSBvcHRpb25zPy5saWdodD8ucHJvY2VzcyA/PyBjcmVhdGVMaWdodDtcbiAgICAgICAgICAgIGNvbnN0IHBvc3Rwcm9jZXNzID0gb3B0aW9ucz8ubGlnaHQ/LnBvc3Rwcm9jZXNzO1xuXG4gICAgICAgICAgICAvLyBoYW5kbGUgbm9kZXMgd2l0aCBsaWdodHNcbiAgICAgICAgICAgIGdsdGYubm9kZXMuZm9yRWFjaCgoZ2x0Zk5vZGUsIG5vZGVJbmRleCkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChnbHRmTm9kZS5oYXNPd25Qcm9wZXJ0eSgnZXh0ZW5zaW9ucycpICYmXG4gICAgICAgICAgICAgICAgICAgIGdsdGZOb2RlLmV4dGVuc2lvbnMuaGFzT3duUHJvcGVydHkoJ0tIUl9saWdodHNfcHVuY3R1YWwnKSAmJlxuICAgICAgICAgICAgICAgICAgICBnbHRmTm9kZS5leHRlbnNpb25zLktIUl9saWdodHNfcHVuY3R1YWwuaGFzT3duUHJvcGVydHkoJ2xpZ2h0JykpIHtcblxuICAgICAgICAgICAgICAgICAgICBjb25zdCBsaWdodEluZGV4ID0gZ2x0Zk5vZGUuZXh0ZW5zaW9ucy5LSFJfbGlnaHRzX3B1bmN0dWFsLmxpZ2h0O1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBnbHRmTGlnaHQgPSBnbHRmTGlnaHRzW2xpZ2h0SW5kZXhdO1xuICAgICAgICAgICAgICAgICAgICBpZiAoZ2x0ZkxpZ2h0KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocHJlcHJvY2Vzcykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByZXByb2Nlc3MoZ2x0ZkxpZ2h0KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGxpZ2h0ID0gcHJvY2VzcyhnbHRmTGlnaHQsIG5vZGVzW25vZGVJbmRleF0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHBvc3Rwcm9jZXNzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcG9zdHByb2Nlc3MoZ2x0ZkxpZ2h0LCBsaWdodCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGFkZCB0aGUgbGlnaHQgdG8gbm9kZS0+bGlnaHQgbWFwXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAobGlnaHQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoIWxpZ2h0cykgbGlnaHRzID0gbmV3IE1hcCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxpZ2h0cy5zZXQoZ2x0Zk5vZGUsIGxpZ2h0KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGxpZ2h0cztcbn07XG5cbi8vIGxpbmsgc2tpbnMgdG8gdGhlIG1lc2hlc1xuY29uc3QgbGlua1NraW5zID0gKGdsdGYsIHJlbmRlcnMsIHNraW5zKSA9PiB7XG4gICAgZ2x0Zi5ub2Rlcy5mb3JFYWNoKChnbHRmTm9kZSkgPT4ge1xuICAgICAgICBpZiAoZ2x0Zk5vZGUuaGFzT3duUHJvcGVydHkoJ21lc2gnKSAmJiBnbHRmTm9kZS5oYXNPd25Qcm9wZXJ0eSgnc2tpbicpKSB7XG4gICAgICAgICAgICBjb25zdCBtZXNoR3JvdXAgPSByZW5kZXJzW2dsdGZOb2RlLm1lc2hdLm1lc2hlcztcbiAgICAgICAgICAgIG1lc2hHcm91cC5mb3JFYWNoKChtZXNoKSA9PiB7XG4gICAgICAgICAgICAgICAgbWVzaC5za2luID0gc2tpbnNbZ2x0Zk5vZGUuc2tpbl07XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH0pO1xufTtcblxuLy8gY3JlYXRlIGVuZ2luZSByZXNvdXJjZXMgZnJvbSB0aGUgZG93bmxvYWRlZCBHTEIgZGF0YVxuY29uc3QgY3JlYXRlUmVzb3VyY2VzID0gYXN5bmMgKGRldmljZSwgZ2x0ZiwgYnVmZmVyVmlld3MsIHRleHR1cmVzLCBvcHRpb25zKSA9PiB7XG4gICAgY29uc3QgcHJlcHJvY2VzcyA9IG9wdGlvbnM/Lmdsb2JhbD8ucHJlcHJvY2VzcztcbiAgICBjb25zdCBwb3N0cHJvY2VzcyA9IG9wdGlvbnM/Lmdsb2JhbD8ucG9zdHByb2Nlc3M7XG5cbiAgICBpZiAocHJlcHJvY2Vzcykge1xuICAgICAgICBwcmVwcm9jZXNzKGdsdGYpO1xuICAgIH1cblxuICAgIC8vIFRoZSBvcmlnaW5hbCB2ZXJzaW9uIG9mIEZBQ1QgZ2VuZXJhdGVkIGluY29ycmVjdGx5IGZsaXBwZWQgViB0ZXh0dXJlXG4gICAgLy8gY29vcmRpbmF0ZXMuIFdlIG11c3QgY29tcGVuc2F0ZSBieSBmbGlwcGluZyBWIGluIHRoaXMgY2FzZS4gT25jZVxuICAgIC8vIGFsbCBtb2RlbHMgaGF2ZSBiZWVuIHJlLWV4cG9ydGVkIHdlIGNhbiByZW1vdmUgdGhpcyBmbGFnLlxuICAgIGNvbnN0IGZsaXBWID0gZ2x0Zi5hc3NldCAmJiBnbHRmLmFzc2V0LmdlbmVyYXRvciA9PT0gJ1BsYXlDYW52YXMnO1xuXG4gICAgLy8gV2UnZCBsaWtlIHRvIHJlbW92ZSB0aGUgZmxpcFYgY29kZSBhdCBzb21lIHBvaW50LlxuICAgIGlmIChmbGlwVikge1xuICAgICAgICBEZWJ1Zy53YXJuKCdnbFRGIG1vZGVsIG1heSBoYXZlIGZsaXBwZWQgVVZzLiBQbGVhc2UgcmVjb252ZXJ0LicpO1xuICAgIH1cblxuICAgIGNvbnN0IG5vZGVzID0gY3JlYXRlTm9kZXMoZ2x0Ziwgb3B0aW9ucyk7XG4gICAgY29uc3Qgc2NlbmVzID0gY3JlYXRlU2NlbmVzKGdsdGYsIG5vZGVzKTtcbiAgICBjb25zdCBsaWdodHMgPSBjcmVhdGVMaWdodHMoZ2x0Ziwgbm9kZXMsIG9wdGlvbnMpO1xuICAgIGNvbnN0IGNhbWVyYXMgPSBjcmVhdGVDYW1lcmFzKGdsdGYsIG5vZGVzLCBvcHRpb25zKTtcbiAgICBjb25zdCB2YXJpYW50cyA9IGNyZWF0ZVZhcmlhbnRzKGdsdGYpO1xuXG4gICAgLy8gYnVmZmVyIGRhdGEgbXVzdCBoYXZlIGZpbmlzaGVkIGxvYWRpbmcgaW4gb3JkZXIgdG8gY3JlYXRlIG1lc2hlcyBhbmQgYW5pbWF0aW9uc1xuICAgIGNvbnN0IGJ1ZmZlclZpZXdEYXRhID0gYXdhaXQgUHJvbWlzZS5hbGwoYnVmZmVyVmlld3MpO1xuICAgIGNvbnN0IHsgbWVzaGVzLCBtZXNoVmFyaWFudHMsIG1lc2hEZWZhdWx0TWF0ZXJpYWxzLCBwcm9taXNlcyB9ID0gY3JlYXRlTWVzaGVzKGRldmljZSwgZ2x0ZiwgYnVmZmVyVmlld0RhdGEsIGZsaXBWLCBvcHRpb25zKTtcbiAgICBjb25zdCBhbmltYXRpb25zID0gY3JlYXRlQW5pbWF0aW9ucyhnbHRmLCBub2RlcywgYnVmZmVyVmlld0RhdGEsIG9wdGlvbnMpO1xuXG4gICAgLy8gdGV4dHVyZXMgbXVzdCBoYXZlIGZpbmlzaGVkIGxvYWRpbmcgaW4gb3JkZXIgdG8gY3JlYXRlIG1hdGVyaWFsc1xuICAgIGNvbnN0IHRleHR1cmVBc3NldHMgPSBhd2FpdCBQcm9taXNlLmFsbCh0ZXh0dXJlcyk7XG4gICAgY29uc3QgdGV4dHVyZUluc3RhbmNlcyA9IHRleHR1cmVBc3NldHMubWFwKHQgPT4gdC5yZXNvdXJjZSk7XG4gICAgY29uc3QgbWF0ZXJpYWxzID0gY3JlYXRlTWF0ZXJpYWxzKGdsdGYsIHRleHR1cmVJbnN0YW5jZXMsIG9wdGlvbnMsIGZsaXBWKTtcbiAgICBjb25zdCBza2lucyA9IGNyZWF0ZVNraW5zKGRldmljZSwgZ2x0Ziwgbm9kZXMsIGJ1ZmZlclZpZXdEYXRhKTtcblxuICAgIC8vIGNyZWF0ZSByZW5kZXJzIHRvIHdyYXAgbWVzaGVzXG4gICAgY29uc3QgcmVuZGVycyA9IFtdO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbWVzaGVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHJlbmRlcnNbaV0gPSBuZXcgUmVuZGVyKCk7XG4gICAgICAgIHJlbmRlcnNbaV0ubWVzaGVzID0gbWVzaGVzW2ldO1xuICAgIH1cblxuICAgIC8vIGxpbmsgc2tpbnMgdG8gbWVzaGVzXG4gICAgbGlua1NraW5zKGdsdGYsIHJlbmRlcnMsIHNraW5zKTtcblxuICAgIGNvbnN0IHJlc3VsdCA9IG5ldyBHbGJSZXNvdXJjZXMoKTtcbiAgICByZXN1bHQuZ2x0ZiA9IGdsdGY7XG4gICAgcmVzdWx0Lm5vZGVzID0gbm9kZXM7XG4gICAgcmVzdWx0LnNjZW5lcyA9IHNjZW5lcztcbiAgICByZXN1bHQuYW5pbWF0aW9ucyA9IGFuaW1hdGlvbnM7XG4gICAgcmVzdWx0LnRleHR1cmVzID0gdGV4dHVyZUFzc2V0cztcbiAgICByZXN1bHQubWF0ZXJpYWxzID0gbWF0ZXJpYWxzO1xuICAgIHJlc3VsdC52YXJpYW50cyA9IHZhcmlhbnRzO1xuICAgIHJlc3VsdC5tZXNoVmFyaWFudHMgPSBtZXNoVmFyaWFudHM7XG4gICAgcmVzdWx0Lm1lc2hEZWZhdWx0TWF0ZXJpYWxzID0gbWVzaERlZmF1bHRNYXRlcmlhbHM7XG4gICAgcmVzdWx0LnJlbmRlcnMgPSByZW5kZXJzO1xuICAgIHJlc3VsdC5za2lucyA9IHNraW5zO1xuICAgIHJlc3VsdC5saWdodHMgPSBsaWdodHM7XG4gICAgcmVzdWx0LmNhbWVyYXMgPSBjYW1lcmFzO1xuXG4gICAgaWYgKHBvc3Rwcm9jZXNzKSB7XG4gICAgICAgIHBvc3Rwcm9jZXNzKGdsdGYsIHJlc3VsdCk7XG4gICAgfVxuXG4gICAgLy8gd2FpdCBmb3IgZHJhY28gbWVzaGVzIHRvIGNvbXBsZXRlIGRlY29kaW5nXG4gICAgYXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuXG4gICAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbmNvbnN0IGFwcGx5U2FtcGxlciA9ICh0ZXh0dXJlLCBnbHRmU2FtcGxlcikgPT4ge1xuICAgIGNvbnN0IGdldEZpbHRlciA9IChmaWx0ZXIsIGRlZmF1bHRWYWx1ZSkgPT4ge1xuICAgICAgICBzd2l0Y2ggKGZpbHRlcikge1xuICAgICAgICAgICAgY2FzZSA5NzI4OiByZXR1cm4gRklMVEVSX05FQVJFU1Q7XG4gICAgICAgICAgICBjYXNlIDk3Mjk6IHJldHVybiBGSUxURVJfTElORUFSO1xuICAgICAgICAgICAgY2FzZSA5OTg0OiByZXR1cm4gRklMVEVSX05FQVJFU1RfTUlQTUFQX05FQVJFU1Q7XG4gICAgICAgICAgICBjYXNlIDk5ODU6IHJldHVybiBGSUxURVJfTElORUFSX01JUE1BUF9ORUFSRVNUO1xuICAgICAgICAgICAgY2FzZSA5OTg2OiByZXR1cm4gRklMVEVSX05FQVJFU1RfTUlQTUFQX0xJTkVBUjtcbiAgICAgICAgICAgIGNhc2UgOTk4NzogcmV0dXJuIEZJTFRFUl9MSU5FQVJfTUlQTUFQX0xJTkVBUjtcbiAgICAgICAgICAgIGRlZmF1bHQ6ICAgcmV0dXJuIGRlZmF1bHRWYWx1ZTtcbiAgICAgICAgfVxuICAgIH07XG5cbiAgICBjb25zdCBnZXRXcmFwID0gKHdyYXAsIGRlZmF1bHRWYWx1ZSkgPT4ge1xuICAgICAgICBzd2l0Y2ggKHdyYXApIHtcbiAgICAgICAgICAgIGNhc2UgMzMwNzE6IHJldHVybiBBRERSRVNTX0NMQU1QX1RPX0VER0U7XG4gICAgICAgICAgICBjYXNlIDMzNjQ4OiByZXR1cm4gQUREUkVTU19NSVJST1JFRF9SRVBFQVQ7XG4gICAgICAgICAgICBjYXNlIDEwNDk3OiByZXR1cm4gQUREUkVTU19SRVBFQVQ7XG4gICAgICAgICAgICBkZWZhdWx0OiAgICByZXR1cm4gZGVmYXVsdFZhbHVlO1xuICAgICAgICB9XG4gICAgfTtcblxuICAgIGlmICh0ZXh0dXJlKSB7XG4gICAgICAgIGdsdGZTYW1wbGVyID0gZ2x0ZlNhbXBsZXIgPz8geyB9O1xuICAgICAgICB0ZXh0dXJlLm1pbkZpbHRlciA9IGdldEZpbHRlcihnbHRmU2FtcGxlci5taW5GaWx0ZXIsIEZJTFRFUl9MSU5FQVJfTUlQTUFQX0xJTkVBUik7XG4gICAgICAgIHRleHR1cmUubWFnRmlsdGVyID0gZ2V0RmlsdGVyKGdsdGZTYW1wbGVyLm1hZ0ZpbHRlciwgRklMVEVSX0xJTkVBUik7XG4gICAgICAgIHRleHR1cmUuYWRkcmVzc1UgPSBnZXRXcmFwKGdsdGZTYW1wbGVyLndyYXBTLCBBRERSRVNTX1JFUEVBVCk7XG4gICAgICAgIHRleHR1cmUuYWRkcmVzc1YgPSBnZXRXcmFwKGdsdGZTYW1wbGVyLndyYXBULCBBRERSRVNTX1JFUEVBVCk7XG4gICAgfVxufTtcblxubGV0IGdsdGZUZXh0dXJlVW5pcXVlSWQgPSAwO1xuXG4vLyBjcmVhdGUgZ2x0ZiBpbWFnZXMuIHJldHVybnMgYW4gYXJyYXkgb2YgcHJvbWlzZXMgdGhhdCByZXNvbHZlIHRvIHRleHR1cmUgYXNzZXRzLlxuY29uc3QgY3JlYXRlSW1hZ2VzID0gKGdsdGYsIGJ1ZmZlclZpZXdzLCB1cmxCYXNlLCByZWdpc3RyeSwgb3B0aW9ucykgPT4ge1xuICAgIGlmICghZ2x0Zi5pbWFnZXMgfHwgZ2x0Zi5pbWFnZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIHJldHVybiBbXTtcbiAgICB9XG5cbiAgICBjb25zdCBwcmVwcm9jZXNzID0gb3B0aW9ucz8uaW1hZ2U/LnByZXByb2Nlc3M7XG4gICAgY29uc3QgcHJvY2Vzc0FzeW5jID0gb3B0aW9ucz8uaW1hZ2U/LnByb2Nlc3NBc3luYztcbiAgICBjb25zdCBwb3N0cHJvY2VzcyA9IG9wdGlvbnM/LmltYWdlPy5wb3N0cHJvY2VzcztcblxuICAgIGNvbnN0IG1pbWVUeXBlRmlsZUV4dGVuc2lvbnMgPSB7XG4gICAgICAgICdpbWFnZS9wbmcnOiAncG5nJyxcbiAgICAgICAgJ2ltYWdlL2pwZWcnOiAnanBnJyxcbiAgICAgICAgJ2ltYWdlL2Jhc2lzJzogJ2Jhc2lzJyxcbiAgICAgICAgJ2ltYWdlL2t0eCc6ICdrdHgnLFxuICAgICAgICAnaW1hZ2Uva3R4Mic6ICdrdHgyJyxcbiAgICAgICAgJ2ltYWdlL3ZuZC1tcy5kZHMnOiAnZGRzJ1xuICAgIH07XG5cbiAgICBjb25zdCBsb2FkVGV4dHVyZSA9IChnbHRmSW1hZ2UsIHVybCwgYnVmZmVyVmlldywgbWltZVR5cGUsIG9wdGlvbnMpID0+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGNvbnRpbnVhdGlvbiA9IChidWZmZXJWaWV3RGF0YSkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IG5hbWUgPSAoZ2x0ZkltYWdlLm5hbWUgfHwgJ2dsdGYtdGV4dHVyZScpICsgJy0nICsgZ2x0ZlRleHR1cmVVbmlxdWVJZCsrO1xuXG4gICAgICAgICAgICAgICAgLy8gY29uc3RydWN0IHRoZSBhc3NldCBmaWxlXG4gICAgICAgICAgICAgICAgY29uc3QgZmlsZSA9IHtcbiAgICAgICAgICAgICAgICAgICAgdXJsOiB1cmwgfHwgbmFtZVxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgaWYgKGJ1ZmZlclZpZXdEYXRhKSB7XG4gICAgICAgICAgICAgICAgICAgIGZpbGUuY29udGVudHMgPSBidWZmZXJWaWV3RGF0YS5zbGljZSgwKS5idWZmZXI7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChtaW1lVHlwZSkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBleHRlbnNpb24gPSBtaW1lVHlwZUZpbGVFeHRlbnNpb25zW21pbWVUeXBlXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGV4dGVuc2lvbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgZmlsZS5maWxlbmFtZSA9IGZpbGUudXJsICsgJy4nICsgZXh0ZW5zaW9uO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gY3JlYXRlIGFuZCBsb2FkIHRoZSBhc3NldFxuICAgICAgICAgICAgICAgIGNvbnN0IGFzc2V0ID0gbmV3IEFzc2V0KG5hbWUsICd0ZXh0dXJlJywgZmlsZSwgbnVsbCwgb3B0aW9ucyk7XG4gICAgICAgICAgICAgICAgYXNzZXQub24oJ2xvYWQnLCBhc3NldCA9PiByZXNvbHZlKGFzc2V0KSk7XG4gICAgICAgICAgICAgICAgYXNzZXQub24oJ2Vycm9yJywgZXJyID0+IHJlamVjdChlcnIpKTtcbiAgICAgICAgICAgICAgICByZWdpc3RyeS5hZGQoYXNzZXQpO1xuICAgICAgICAgICAgICAgIHJlZ2lzdHJ5LmxvYWQoYXNzZXQpO1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgaWYgKGJ1ZmZlclZpZXcpIHtcbiAgICAgICAgICAgICAgICBidWZmZXJWaWV3LnRoZW4oYnVmZmVyVmlld0RhdGEgPT4gY29udGludWF0aW9uKGJ1ZmZlclZpZXdEYXRhKSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbnRpbnVhdGlvbihudWxsKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgIHJldHVybiBnbHRmLmltYWdlcy5tYXAoKGdsdGZJbWFnZSwgaSkgPT4ge1xuICAgICAgICBpZiAocHJlcHJvY2Vzcykge1xuICAgICAgICAgICAgcHJlcHJvY2VzcyhnbHRmSW1hZ2UpO1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IHByb21pc2U7XG5cbiAgICAgICAgaWYgKHByb2Nlc3NBc3luYykge1xuICAgICAgICAgICAgcHJvbWlzZSA9IG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICAgICAgICBwcm9jZXNzQXN5bmMoZ2x0ZkltYWdlLCAoZXJyLCB0ZXh0dXJlQXNzZXQpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGVycilcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlamVjdChlcnIpO1xuICAgICAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHRleHR1cmVBc3NldCk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHByb21pc2UgPSBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUobnVsbCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHByb21pc2UgPSBwcm9taXNlLnRoZW4oKHRleHR1cmVBc3NldCkgPT4ge1xuICAgICAgICAgICAgaWYgKHRleHR1cmVBc3NldCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0ZXh0dXJlQXNzZXQ7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGdsdGZJbWFnZS5oYXNPd25Qcm9wZXJ0eSgndXJpJykpIHtcbiAgICAgICAgICAgICAgICAvLyB1cmkgc3BlY2lmaWVkXG4gICAgICAgICAgICAgICAgaWYgKGlzRGF0YVVSSShnbHRmSW1hZ2UudXJpKSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gbG9hZFRleHR1cmUoZ2x0ZkltYWdlLCBnbHRmSW1hZ2UudXJpLCBudWxsLCBnZXREYXRhVVJJTWltZVR5cGUoZ2x0ZkltYWdlLnVyaSksIG51bGwpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gbG9hZFRleHR1cmUoZ2x0ZkltYWdlLCBBQlNPTFVURV9VUkwudGVzdChnbHRmSW1hZ2UudXJpKSA/IGdsdGZJbWFnZS51cmkgOiBwYXRoLmpvaW4odXJsQmFzZSwgZ2x0ZkltYWdlLnVyaSksIG51bGwsIG51bGwsIHsgY3Jvc3NPcmlnaW46ICdhbm9ueW1vdXMnIH0pO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChnbHRmSW1hZ2UuaGFzT3duUHJvcGVydHkoJ2J1ZmZlclZpZXcnKSAmJiBnbHRmSW1hZ2UuaGFzT3duUHJvcGVydHkoJ21pbWVUeXBlJykpIHtcbiAgICAgICAgICAgICAgICAvLyBidWZmZXJ2aWV3XG4gICAgICAgICAgICAgICAgcmV0dXJuIGxvYWRUZXh0dXJlKGdsdGZJbWFnZSwgbnVsbCwgYnVmZmVyVmlld3NbZ2x0ZkltYWdlLmJ1ZmZlclZpZXddLCBnbHRmSW1hZ2UubWltZVR5cGUsIG51bGwpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBmYWlsXG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKGBJbnZhbGlkIGltYWdlIGZvdW5kIGluIGdsdGYgKG5laXRoZXIgdXJpIG9yIGJ1ZmZlclZpZXcgZm91bmQpLiBpbmRleD0ke2l9YCkpO1xuICAgICAgICB9KTtcblxuICAgICAgICBpZiAocG9zdHByb2Nlc3MpIHtcbiAgICAgICAgICAgIHByb21pc2UgPSBwcm9taXNlLnRoZW4oKHRleHR1cmVBc3NldCkgPT4ge1xuICAgICAgICAgICAgICAgIHBvc3Rwcm9jZXNzKGdsdGZJbWFnZSwgdGV4dHVyZUFzc2V0KTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGV4dHVyZUFzc2V0O1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcHJvbWlzZTtcbiAgICB9KTtcbn07XG5cbi8vIGNyZWF0ZSBnbHRmIHRleHR1cmVzLiByZXR1cm5zIGFuIGFycmF5IG9mIHByb21pc2VzIHRoYXQgcmVzb2x2ZSB0byB0ZXh0dXJlIGFzc2V0cy5cbmNvbnN0IGNyZWF0ZVRleHR1cmVzID0gKGdsdGYsIGltYWdlcywgb3B0aW9ucykgPT4ge1xuXG4gICAgaWYgKCFnbHRmPy5pbWFnZXM/Lmxlbmd0aCB8fCAhZ2x0Zj8udGV4dHVyZXM/Lmxlbmd0aCkge1xuICAgICAgICByZXR1cm4gW107XG4gICAgfVxuXG4gICAgY29uc3QgcHJlcHJvY2VzcyA9IG9wdGlvbnM/LnRleHR1cmU/LnByZXByb2Nlc3M7XG4gICAgY29uc3QgcHJvY2Vzc0FzeW5jID0gb3B0aW9ucz8udGV4dHVyZT8ucHJvY2Vzc0FzeW5jO1xuICAgIGNvbnN0IHBvc3Rwcm9jZXNzID0gb3B0aW9ucz8udGV4dHVyZT8ucG9zdHByb2Nlc3M7XG5cbiAgICBjb25zdCBzZWVuSW1hZ2VzID0gbmV3IFNldCgpO1xuXG4gICAgcmV0dXJuIGdsdGYudGV4dHVyZXMubWFwKChnbHRmVGV4dHVyZSkgPT4ge1xuICAgICAgICBpZiAocHJlcHJvY2Vzcykge1xuICAgICAgICAgICAgcHJlcHJvY2VzcyhnbHRmVGV4dHVyZSk7XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgcHJvbWlzZTtcblxuICAgICAgICBpZiAocHJvY2Vzc0FzeW5jKSB7XG4gICAgICAgICAgICBwcm9taXNlID0gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgICAgIHByb2Nlc3NBc3luYyhnbHRmVGV4dHVyZSwgZ2x0Zi5pbWFnZXMsIChlcnIsIGdsdGZJbWFnZUluZGV4KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChlcnIpXG4gICAgICAgICAgICAgICAgICAgICAgICByZWplY3QoZXJyKTtcbiAgICAgICAgICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShnbHRmSW1hZ2VJbmRleCk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHByb21pc2UgPSBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUobnVsbCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHByb21pc2UgPSBwcm9taXNlLnRoZW4oKGdsdGZJbWFnZUluZGV4KSA9PiB7XG4gICAgICAgICAgICAvLyByZXNvbHZlIGltYWdlIGluZGV4XG4gICAgICAgICAgICBnbHRmSW1hZ2VJbmRleCA9IGdsdGZJbWFnZUluZGV4ID8/XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIGdsdGZUZXh0dXJlPy5leHRlbnNpb25zPy5LSFJfdGV4dHVyZV9iYXNpc3U/LnNvdXJjZSA/P1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICBnbHRmVGV4dHVyZT8uZXh0ZW5zaW9ucz8uRVhUX3RleHR1cmVfd2VicD8uc291cmNlID8/XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIGdsdGZUZXh0dXJlLnNvdXJjZTtcblxuICAgICAgICAgICAgY29uc3QgY2xvbmVBc3NldCA9IHNlZW5JbWFnZXMuaGFzKGdsdGZJbWFnZUluZGV4KTtcbiAgICAgICAgICAgIHNlZW5JbWFnZXMuYWRkKGdsdGZJbWFnZUluZGV4KTtcblxuICAgICAgICAgICAgcmV0dXJuIGltYWdlc1tnbHRmSW1hZ2VJbmRleF0udGhlbigoaW1hZ2VBc3NldCkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGFzc2V0ID0gY2xvbmVBc3NldCA/IGNsb25lVGV4dHVyZUFzc2V0KGltYWdlQXNzZXQpIDogaW1hZ2VBc3NldDtcbiAgICAgICAgICAgICAgICBhcHBseVNhbXBsZXIoYXNzZXQucmVzb3VyY2UsIChnbHRmLnNhbXBsZXJzID8/IFtdKVtnbHRmVGV4dHVyZS5zYW1wbGVyXSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGFzc2V0O1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGlmIChwb3N0cHJvY2Vzcykge1xuICAgICAgICAgICAgcHJvbWlzZSA9IHByb21pc2UudGhlbigodGV4dHVyZUFzc2V0KSA9PiB7XG4gICAgICAgICAgICAgICAgcG9zdHByb2Nlc3MoZ2x0ZlRleHR1cmUsIHRleHR1cmVBc3NldCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRleHR1cmVBc3NldDtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHByb21pc2U7XG4gICAgfSk7XG59O1xuXG4vLyBsb2FkIGdsdGYgYnVmZmVycy4gcmV0dXJucyBhbiBhcnJheSBvZiBwcm9taXNlcyB0aGF0IHJlc29sdmUgdG8gdHlwZWQgYXJyYXlzLlxuY29uc3QgbG9hZEJ1ZmZlcnMgPSAoZ2x0ZiwgYmluYXJ5Q2h1bmssIHVybEJhc2UsIG9wdGlvbnMpID0+IHtcbiAgICBpZiAoIWdsdGYuYnVmZmVycyB8fCBnbHRmLmJ1ZmZlcnMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIHJldHVybiBbXTtcbiAgICB9XG5cbiAgICBjb25zdCBwcmVwcm9jZXNzID0gb3B0aW9ucz8uYnVmZmVyPy5wcmVwcm9jZXNzO1xuICAgIGNvbnN0IHByb2Nlc3NBc3luYyA9IG9wdGlvbnM/LmJ1ZmZlcj8ucHJvY2Vzc0FzeW5jO1xuICAgIGNvbnN0IHBvc3Rwcm9jZXNzID0gb3B0aW9ucz8uYnVmZmVyPy5wb3N0cHJvY2VzcztcblxuICAgIHJldHVybiBnbHRmLmJ1ZmZlcnMubWFwKChnbHRmQnVmZmVyLCBpKSA9PiB7XG4gICAgICAgIGlmIChwcmVwcm9jZXNzKSB7XG4gICAgICAgICAgICBwcmVwcm9jZXNzKGdsdGZCdWZmZXIpO1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IHByb21pc2U7XG5cbiAgICAgICAgaWYgKHByb2Nlc3NBc3luYykge1xuICAgICAgICAgICAgcHJvbWlzZSA9IG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICAgICAgICBwcm9jZXNzQXN5bmMoZ2x0ZkJ1ZmZlciwgKGVyciwgYXJyYXlCdWZmZXIpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGVycilcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlamVjdChlcnIpO1xuICAgICAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKGFycmF5QnVmZmVyKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcHJvbWlzZSA9IG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShudWxsKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgcHJvbWlzZSA9IHByb21pc2UudGhlbigoYXJyYXlCdWZmZXIpID0+IHtcbiAgICAgICAgICAgIGlmIChhcnJheUJ1ZmZlcikge1xuICAgICAgICAgICAgICAgIHJldHVybiBhcnJheUJ1ZmZlcjtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZ2x0ZkJ1ZmZlci5oYXNPd25Qcm9wZXJ0eSgndXJpJykpIHtcbiAgICAgICAgICAgICAgICBpZiAoaXNEYXRhVVJJKGdsdGZCdWZmZXIudXJpKSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBjb252ZXJ0IGJhc2U2NCB0byByYXcgYmluYXJ5IGRhdGEgaGVsZCBpbiBhIHN0cmluZ1xuICAgICAgICAgICAgICAgICAgICAvLyBkb2Vzbid0IGhhbmRsZSBVUkxFbmNvZGVkIERhdGFVUklzIC0gc2VlIFNPIGFuc3dlciAjNjg1MDI3NiBmb3IgY29kZSB0aGF0IGRvZXMgdGhpc1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBieXRlU3RyaW5nID0gYXRvYihnbHRmQnVmZmVyLnVyaS5zcGxpdCgnLCcpWzFdKTtcblxuICAgICAgICAgICAgICAgICAgICAvLyBjcmVhdGUgYSB2aWV3IGludG8gdGhlIGJ1ZmZlclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBiaW5hcnlBcnJheSA9IG5ldyBVaW50OEFycmF5KGJ5dGVTdHJpbmcubGVuZ3RoKTtcblxuICAgICAgICAgICAgICAgICAgICAvLyBzZXQgdGhlIGJ5dGVzIG9mIHRoZSBidWZmZXIgdG8gdGhlIGNvcnJlY3QgdmFsdWVzXG4gICAgICAgICAgICAgICAgICAgIGZvciAobGV0IGogPSAwOyBqIDwgYnl0ZVN0cmluZy5sZW5ndGg7IGorKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgYmluYXJ5QXJyYXlbal0gPSBieXRlU3RyaW5nLmNoYXJDb2RlQXQoaik7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gYmluYXJ5QXJyYXk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaHR0cC5nZXQoXG4gICAgICAgICAgICAgICAgICAgICAgICBBQlNPTFVURV9VUkwudGVzdChnbHRmQnVmZmVyLnVyaSkgPyBnbHRmQnVmZmVyLnVyaSA6IHBhdGguam9pbih1cmxCYXNlLCBnbHRmQnVmZmVyLnVyaSksXG4gICAgICAgICAgICAgICAgICAgICAgICB7IGNhY2hlOiB0cnVlLCByZXNwb25zZVR5cGU6ICdhcnJheWJ1ZmZlcicsIHJldHJ5OiBmYWxzZSB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgKGVyciwgcmVzdWx0KSA9PiB7ICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLWxpbmUgbm8tbG9vcC1mdW5jXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGVycilcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVqZWN0KGVycik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKG5ldyBVaW50OEFycmF5KHJlc3VsdCkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBnbGIgYnVmZmVyIHJlZmVyZW5jZVxuICAgICAgICAgICAgcmV0dXJuIGJpbmFyeUNodW5rO1xuICAgICAgICB9KTtcblxuICAgICAgICBpZiAocG9zdHByb2Nlc3MpIHtcbiAgICAgICAgICAgIHByb21pc2UgPSBwcm9taXNlLnRoZW4oKGJ1ZmZlcikgPT4ge1xuICAgICAgICAgICAgICAgIHBvc3Rwcm9jZXNzKGdsdGYuYnVmZmVyc1tpXSwgYnVmZmVyKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gYnVmZmVyO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcHJvbWlzZTtcbiAgICB9KTtcbn07XG5cbi8vIHBhcnNlIHRoZSBnbHRmIGNodW5rLCByZXR1cm5zIHRoZSBnbHRmIGpzb25cbmNvbnN0IHBhcnNlR2x0ZiA9IChnbHRmQ2h1bmssIGNhbGxiYWNrKSA9PiB7XG4gICAgY29uc3QgZGVjb2RlQmluYXJ5VXRmOCA9IChhcnJheSkgPT4ge1xuICAgICAgICBpZiAodHlwZW9mIFRleHREZWNvZGVyICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBUZXh0RGVjb2RlcigpLmRlY29kZShhcnJheSk7XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgc3RyID0gJyc7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYXJyYXkubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHN0ciArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGFycmF5W2ldKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBkZWNvZGVVUklDb21wb25lbnQoZXNjYXBlKHN0cikpO1xuICAgIH07XG5cbiAgICBjb25zdCBnbHRmID0gSlNPTi5wYXJzZShkZWNvZGVCaW5hcnlVdGY4KGdsdGZDaHVuaykpO1xuXG4gICAgLy8gY2hlY2sgZ2x0ZiB2ZXJzaW9uXG4gICAgaWYgKGdsdGYuYXNzZXQgJiYgZ2x0Zi5hc3NldC52ZXJzaW9uICYmIHBhcnNlRmxvYXQoZ2x0Zi5hc3NldC52ZXJzaW9uKSA8IDIpIHtcbiAgICAgICAgY2FsbGJhY2soYEludmFsaWQgZ2x0ZiB2ZXJzaW9uLiBFeHBlY3RlZCB2ZXJzaW9uIDIuMCBvciBhYm92ZSBidXQgZm91bmQgdmVyc2lvbiAnJHtnbHRmLmFzc2V0LnZlcnNpb259Jy5gKTtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIGNoZWNrIHJlcXVpcmVkIGV4dGVuc2lvbnNcbiAgICBjYWxsYmFjayhudWxsLCBnbHRmKTtcbn07XG5cbi8vIHBhcnNlIGdsYiBkYXRhLCByZXR1cm5zIHRoZSBnbHRmIGFuZCBiaW5hcnkgY2h1bmtcbmNvbnN0IHBhcnNlR2xiID0gKGdsYkRhdGEsIGNhbGxiYWNrKSA9PiB7XG4gICAgY29uc3QgZGF0YSA9IChnbGJEYXRhIGluc3RhbmNlb2YgQXJyYXlCdWZmZXIpID8gbmV3IERhdGFWaWV3KGdsYkRhdGEpIDogbmV3IERhdGFWaWV3KGdsYkRhdGEuYnVmZmVyLCBnbGJEYXRhLmJ5dGVPZmZzZXQsIGdsYkRhdGEuYnl0ZUxlbmd0aCk7XG5cbiAgICAvLyByZWFkIGhlYWRlclxuICAgIGNvbnN0IG1hZ2ljID0gZGF0YS5nZXRVaW50MzIoMCwgdHJ1ZSk7XG4gICAgY29uc3QgdmVyc2lvbiA9IGRhdGEuZ2V0VWludDMyKDQsIHRydWUpO1xuICAgIGNvbnN0IGxlbmd0aCA9IGRhdGEuZ2V0VWludDMyKDgsIHRydWUpO1xuXG4gICAgaWYgKG1hZ2ljICE9PSAweDQ2NTQ2QzY3KSB7XG4gICAgICAgIGNhbGxiYWNrKCdJbnZhbGlkIG1hZ2ljIG51bWJlciBmb3VuZCBpbiBnbGIgaGVhZGVyLiBFeHBlY3RlZCAweDQ2NTQ2QzY3LCBmb3VuZCAweCcgKyBtYWdpYy50b1N0cmluZygxNikpO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKHZlcnNpb24gIT09IDIpIHtcbiAgICAgICAgY2FsbGJhY2soJ0ludmFsaWQgdmVyc2lvbiBudW1iZXIgZm91bmQgaW4gZ2xiIGhlYWRlci4gRXhwZWN0ZWQgMiwgZm91bmQgJyArIHZlcnNpb24pO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKGxlbmd0aCA8PSAwIHx8IGxlbmd0aCA+IGRhdGEuYnl0ZUxlbmd0aCkge1xuICAgICAgICBjYWxsYmFjaygnSW52YWxpZCBsZW5ndGggZm91bmQgaW4gZ2xiIGhlYWRlci4gRm91bmQgJyArIGxlbmd0aCk7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyByZWFkIGNodW5rc1xuICAgIGNvbnN0IGNodW5rcyA9IFtdO1xuICAgIGxldCBvZmZzZXQgPSAxMjtcbiAgICB3aGlsZSAob2Zmc2V0IDwgbGVuZ3RoKSB7XG4gICAgICAgIGNvbnN0IGNodW5rTGVuZ3RoID0gZGF0YS5nZXRVaW50MzIob2Zmc2V0LCB0cnVlKTtcbiAgICAgICAgaWYgKG9mZnNldCArIGNodW5rTGVuZ3RoICsgOCA+IGRhdGEuYnl0ZUxlbmd0aCkge1xuICAgICAgICAgICAgY2FsbGJhY2soYEludmFsaWQgY2h1bmsgbGVuZ3RoIGZvdW5kIGluIGdsYi4gRm91bmQgJHtjaHVua0xlbmd0aH1gKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBjaHVua1R5cGUgPSBkYXRhLmdldFVpbnQzMihvZmZzZXQgKyA0LCB0cnVlKTtcbiAgICAgICAgY29uc3QgY2h1bmtEYXRhID0gbmV3IFVpbnQ4QXJyYXkoZGF0YS5idWZmZXIsIGRhdGEuYnl0ZU9mZnNldCArIG9mZnNldCArIDgsIGNodW5rTGVuZ3RoKTtcbiAgICAgICAgY2h1bmtzLnB1c2goeyBsZW5ndGg6IGNodW5rTGVuZ3RoLCB0eXBlOiBjaHVua1R5cGUsIGRhdGE6IGNodW5rRGF0YSB9KTtcbiAgICAgICAgb2Zmc2V0ICs9IGNodW5rTGVuZ3RoICsgODtcbiAgICB9XG5cbiAgICBpZiAoY2h1bmtzLmxlbmd0aCAhPT0gMSAmJiBjaHVua3MubGVuZ3RoICE9PSAyKSB7XG4gICAgICAgIGNhbGxiYWNrKCdJbnZhbGlkIG51bWJlciBvZiBjaHVua3MgZm91bmQgaW4gZ2xiIGZpbGUuJyk7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAoY2h1bmtzWzBdLnR5cGUgIT09IDB4NEU0RjUzNEEpIHtcbiAgICAgICAgY2FsbGJhY2soYEludmFsaWQgY2h1bmsgdHlwZSBmb3VuZCBpbiBnbGIgZmlsZS4gRXhwZWN0ZWQgMHg0RTRGNTM0QSwgZm91bmQgMHgke2NodW5rc1swXS50eXBlLnRvU3RyaW5nKDE2KX1gKTtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmIChjaHVua3MubGVuZ3RoID4gMSAmJiBjaHVua3NbMV0udHlwZSAhPT0gMHgwMDRFNDk0Mikge1xuICAgICAgICBjYWxsYmFjayhgSW52YWxpZCBjaHVuayB0eXBlIGZvdW5kIGluIGdsYiBmaWxlLiBFeHBlY3RlZCAweDAwNEU0OTQyLCBmb3VuZCAweCR7Y2h1bmtzWzFdLnR5cGUudG9TdHJpbmcoMTYpfWApO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY2FsbGJhY2sobnVsbCwge1xuICAgICAgICBnbHRmQ2h1bms6IGNodW5rc1swXS5kYXRhLFxuICAgICAgICBiaW5hcnlDaHVuazogY2h1bmtzLmxlbmd0aCA9PT0gMiA/IGNodW5rc1sxXS5kYXRhIDogbnVsbFxuICAgIH0pO1xufTtcblxuLy8gcGFyc2UgdGhlIGNodW5rIG9mIGRhdGEsIHdoaWNoIGNhbiBiZSBnbGIgb3IgZ2x0ZlxuY29uc3QgcGFyc2VDaHVuayA9IChmaWxlbmFtZSwgZGF0YSwgY2FsbGJhY2spID0+IHtcbiAgICBjb25zdCBoYXNHbGJIZWFkZXIgPSAoKSA9PiB7XG4gICAgICAgIC8vIGdsYiBmb3JtYXQgc3RhcnRzIHdpdGggJ2dsVEYnXG4gICAgICAgIGNvbnN0IHU4ID0gbmV3IFVpbnQ4QXJyYXkoZGF0YSk7XG4gICAgICAgIHJldHVybiB1OFswXSA9PT0gMTAzICYmIHU4WzFdID09PSAxMDggJiYgdThbMl0gPT09IDg0ICYmIHU4WzNdID09PSA3MDtcbiAgICB9O1xuXG4gICAgaWYgKChmaWxlbmFtZSAmJiBmaWxlbmFtZS50b0xvd2VyQ2FzZSgpLmVuZHNXaXRoKCcuZ2xiJykpIHx8IGhhc0dsYkhlYWRlcigpKSB7XG4gICAgICAgIHBhcnNlR2xiKGRhdGEsIGNhbGxiYWNrKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBjYWxsYmFjayhudWxsLCB7XG4gICAgICAgICAgICBnbHRmQ2h1bms6IGRhdGEsXG4gICAgICAgICAgICBiaW5hcnlDaHVuazogbnVsbFxuICAgICAgICB9KTtcbiAgICB9XG59O1xuXG4vLyBjcmVhdGUgYnVmZmVyIHZpZXdzXG5jb25zdCBjcmVhdGVCdWZmZXJWaWV3cyA9IChnbHRmLCBidWZmZXJzLCBvcHRpb25zKSA9PiB7XG5cbiAgICBjb25zdCByZXN1bHQgPSBbXTtcblxuICAgIGNvbnN0IHByZXByb2Nlc3MgPSBvcHRpb25zPy5idWZmZXJWaWV3Py5wcmVwcm9jZXNzO1xuICAgIGNvbnN0IHByb2Nlc3NBc3luYyA9IG9wdGlvbnM/LmJ1ZmZlclZpZXc/LnByb2Nlc3NBc3luYztcbiAgICBjb25zdCBwb3N0cHJvY2VzcyA9IG9wdGlvbnM/LmJ1ZmZlclZpZXc/LnBvc3Rwcm9jZXNzO1xuXG4gICAgLy8gaGFuZGxlIGNhc2Ugb2Ygbm8gYnVmZmVyc1xuICAgIGlmICghZ2x0Zi5idWZmZXJWaWV3cz8ubGVuZ3RoKSB7XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBnbHRmLmJ1ZmZlclZpZXdzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgIGNvbnN0IGdsdGZCdWZmZXJWaWV3ID0gZ2x0Zi5idWZmZXJWaWV3c1tpXTtcblxuICAgICAgICBpZiAocHJlcHJvY2Vzcykge1xuICAgICAgICAgICAgcHJlcHJvY2VzcyhnbHRmQnVmZmVyVmlldyk7XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgcHJvbWlzZTtcblxuICAgICAgICBpZiAocHJvY2Vzc0FzeW5jKSB7XG4gICAgICAgICAgICBwcm9taXNlID0gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgICAgIHByb2Nlc3NBc3luYyhnbHRmQnVmZmVyVmlldywgYnVmZmVycywgKGVyciwgcmVzdWx0KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChlcnIpXG4gICAgICAgICAgICAgICAgICAgICAgICByZWplY3QoZXJyKTtcbiAgICAgICAgICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwcm9taXNlID0gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG51bGwpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICBwcm9taXNlID0gcHJvbWlzZS50aGVuKChidWZmZXIpID0+IHtcbiAgICAgICAgICAgIGlmIChidWZmZXIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gYnVmZmVyO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBjb252ZXJ0IGJ1ZmZlciB0byB0eXBlZCBhcnJheVxuICAgICAgICAgICAgcmV0dXJuIGJ1ZmZlcnNbZ2x0ZkJ1ZmZlclZpZXcuYnVmZmVyXS50aGVuKChidWZmZXIpID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IFVpbnQ4QXJyYXkoYnVmZmVyLmJ1ZmZlcixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYnVmZmVyLmJ5dGVPZmZzZXQgKyAoZ2x0ZkJ1ZmZlclZpZXcuYnl0ZU9mZnNldCB8fCAwKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZ2x0ZkJ1ZmZlclZpZXcuYnl0ZUxlbmd0aCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gYWRkIGEgJ2J5dGVTdHJpZGUnIG1lbWJlciB0byB0aGUgdHlwZWQgYXJyYXkgc28gd2UgaGF2ZSBlYXN5IGFjY2VzcyB0byBpdCBsYXRlclxuICAgICAgICBpZiAoZ2x0ZkJ1ZmZlclZpZXcuaGFzT3duUHJvcGVydHkoJ2J5dGVTdHJpZGUnKSkge1xuICAgICAgICAgICAgcHJvbWlzZSA9IHByb21pc2UudGhlbigodHlwZWRBcnJheSkgPT4ge1xuICAgICAgICAgICAgICAgIHR5cGVkQXJyYXkuYnl0ZVN0cmlkZSA9IGdsdGZCdWZmZXJWaWV3LmJ5dGVTdHJpZGU7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHR5cGVkQXJyYXk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChwb3N0cHJvY2Vzcykge1xuICAgICAgICAgICAgcHJvbWlzZSA9IHByb21pc2UudGhlbigodHlwZWRBcnJheSkgPT4ge1xuICAgICAgICAgICAgICAgIHBvc3Rwcm9jZXNzKGdsdGZCdWZmZXJWaWV3LCB0eXBlZEFycmF5KTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdHlwZWRBcnJheTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgcmVzdWx0LnB1c2gocHJvbWlzZSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbmNsYXNzIEdsYlBhcnNlciB7XG4gICAgLy8gcGFyc2UgdGhlIGdsdGYgb3IgZ2xiIGRhdGEgYXN5bmNocm9ub3VzbHksIGxvYWRpbmcgZXh0ZXJuYWwgcmVzb3VyY2VzXG4gICAgc3RhdGljIHBhcnNlKGZpbGVuYW1lLCB1cmxCYXNlLCBkYXRhLCBkZXZpY2UsIHJlZ2lzdHJ5LCBvcHRpb25zLCBjYWxsYmFjaykge1xuICAgICAgICAvLyBwYXJzZSB0aGUgZGF0YVxuICAgICAgICBwYXJzZUNodW5rKGZpbGVuYW1lLCBkYXRhLCAoZXJyLCBjaHVua3MpID0+IHtcbiAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgICBjYWxsYmFjayhlcnIpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gcGFyc2UgZ2x0ZlxuICAgICAgICAgICAgcGFyc2VHbHRmKGNodW5rcy5nbHRmQ2h1bmssIChlcnIsIGdsdGYpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKGVycik7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBjb25zdCBidWZmZXJzID0gbG9hZEJ1ZmZlcnMoZ2x0ZiwgY2h1bmtzLmJpbmFyeUNodW5rLCB1cmxCYXNlLCBvcHRpb25zKTtcbiAgICAgICAgICAgICAgICBjb25zdCBidWZmZXJWaWV3cyA9IGNyZWF0ZUJ1ZmZlclZpZXdzKGdsdGYsIGJ1ZmZlcnMsIG9wdGlvbnMpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGltYWdlcyA9IGNyZWF0ZUltYWdlcyhnbHRmLCBidWZmZXJWaWV3cywgdXJsQmFzZSwgcmVnaXN0cnksIG9wdGlvbnMpO1xuICAgICAgICAgICAgICAgIGNvbnN0IHRleHR1cmVzID0gY3JlYXRlVGV4dHVyZXMoZ2x0ZiwgaW1hZ2VzLCBvcHRpb25zKTtcblxuICAgICAgICAgICAgICAgIGNyZWF0ZVJlc291cmNlcyhkZXZpY2UsIGdsdGYsIGJ1ZmZlclZpZXdzLCB0ZXh0dXJlcywgb3B0aW9ucylcbiAgICAgICAgICAgICAgICAgICAgLnRoZW4ocmVzdWx0ID0+IGNhbGxiYWNrKG51bGwsIHJlc3VsdCkpXG4gICAgICAgICAgICAgICAgICAgIC5jYXRjaChlcnIgPT4gY2FsbGJhY2soZXJyKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgc3RhdGljIGNyZWF0ZURlZmF1bHRNYXRlcmlhbCgpIHtcbiAgICAgICAgcmV0dXJuIGNyZWF0ZU1hdGVyaWFsKHtcbiAgICAgICAgICAgIG5hbWU6ICdkZWZhdWx0R2xiTWF0ZXJpYWwnXG4gICAgICAgIH0sIFtdKTtcbiAgICB9XG59XG5cbmV4cG9ydCB7IEdsYlBhcnNlciB9O1xuIl0sIm5hbWVzIjpbIkdsYlJlc291cmNlcyIsImNvbnN0cnVjdG9yIiwiZ2x0ZiIsIm5vZGVzIiwic2NlbmVzIiwiYW5pbWF0aW9ucyIsInRleHR1cmVzIiwibWF0ZXJpYWxzIiwidmFyaWFudHMiLCJtZXNoVmFyaWFudHMiLCJtZXNoRGVmYXVsdE1hdGVyaWFscyIsInJlbmRlcnMiLCJza2lucyIsImxpZ2h0cyIsImNhbWVyYXMiLCJkZXN0cm95IiwiZm9yRWFjaCIsInJlbmRlciIsIm1lc2hlcyIsImlzRGF0YVVSSSIsInVyaSIsInRlc3QiLCJnZXREYXRhVVJJTWltZVR5cGUiLCJzdWJzdHJpbmciLCJpbmRleE9mIiwiZ2V0TnVtQ29tcG9uZW50cyIsImFjY2Vzc29yVHlwZSIsImdldENvbXBvbmVudFR5cGUiLCJjb21wb25lbnRUeXBlIiwiVFlQRV9JTlQ4IiwiVFlQRV9VSU5UOCIsIlRZUEVfSU5UMTYiLCJUWVBFX1VJTlQxNiIsIlRZUEVfSU5UMzIiLCJUWVBFX1VJTlQzMiIsIlRZUEVfRkxPQVQzMiIsImdldENvbXBvbmVudFNpemVJbkJ5dGVzIiwiZ2V0Q29tcG9uZW50RGF0YVR5cGUiLCJJbnQ4QXJyYXkiLCJVaW50OEFycmF5IiwiSW50MTZBcnJheSIsIlVpbnQxNkFycmF5IiwiSW50MzJBcnJheSIsIlVpbnQzMkFycmF5IiwiRmxvYXQzMkFycmF5IiwiZ2x0ZlRvRW5naW5lU2VtYW50aWNNYXAiLCJTRU1BTlRJQ19QT1NJVElPTiIsIlNFTUFOVElDX05PUk1BTCIsIlNFTUFOVElDX1RBTkdFTlQiLCJTRU1BTlRJQ19DT0xPUiIsIlNFTUFOVElDX0JMRU5ESU5ESUNFUyIsIlNFTUFOVElDX0JMRU5EV0VJR0hUIiwiU0VNQU5USUNfVEVYQ09PUkQwIiwiU0VNQU5USUNfVEVYQ09PUkQxIiwiU0VNQU5USUNfVEVYQ09PUkQyIiwiU0VNQU5USUNfVEVYQ09PUkQzIiwiU0VNQU5USUNfVEVYQ09PUkQ0IiwiU0VNQU5USUNfVEVYQ09PUkQ1IiwiU0VNQU5USUNfVEVYQ09PUkQ2IiwiU0VNQU5USUNfVEVYQ09PUkQ3IiwiYXR0cmlidXRlT3JkZXIiLCJnZXREZXF1YW50aXplRnVuYyIsInNyY1R5cGUiLCJ4IiwiTWF0aCIsIm1heCIsImRlcXVhbnRpemVBcnJheSIsImRzdEFycmF5Iiwic3JjQXJyYXkiLCJjb252RnVuYyIsImxlbiIsImxlbmd0aCIsImkiLCJnZXRBY2Nlc3NvckRhdGEiLCJnbHRmQWNjZXNzb3IiLCJidWZmZXJWaWV3cyIsImZsYXR0ZW4iLCJudW1Db21wb25lbnRzIiwidHlwZSIsImRhdGFUeXBlIiwicmVzdWx0Iiwic3BhcnNlIiwiaW5kaWNlc0FjY2Vzc29yIiwiY291bnQiLCJpbmRpY2VzIiwiT2JqZWN0IiwiYXNzaWduIiwidmFsdWVzQWNjZXNzb3IiLCJ2YWx1ZXMiLCJoYXNPd25Qcm9wZXJ0eSIsImJhc2VBY2Nlc3NvciIsImJ1ZmZlclZpZXciLCJieXRlT2Zmc2V0Iiwic2xpY2UiLCJ0YXJnZXRJbmRleCIsImoiLCJieXRlc1BlckVsZW1lbnQiLCJCWVRFU19QRVJfRUxFTUVOVCIsInN0b3JhZ2UiLCJBcnJheUJ1ZmZlciIsInRtcEFycmF5IiwiZHN0T2Zmc2V0Iiwic3JjT2Zmc2V0IiwiYnl0ZVN0cmlkZSIsImIiLCJidWZmZXIiLCJnZXRBY2Nlc3NvckRhdGFGbG9hdDMyIiwiZGF0YSIsIm5vcm1hbGl6ZWQiLCJmbG9hdDMyRGF0YSIsImdldEFjY2Vzc29yQm91bmRpbmdCb3giLCJtaW4iLCJjdHlwZSIsIkJvdW5kaW5nQm94IiwiVmVjMyIsImdldFByaW1pdGl2ZVR5cGUiLCJwcmltaXRpdmUiLCJQUklNSVRJVkVfVFJJQU5HTEVTIiwibW9kZSIsIlBSSU1JVElWRV9QT0lOVFMiLCJQUklNSVRJVkVfTElORVMiLCJQUklNSVRJVkVfTElORUxPT1AiLCJQUklNSVRJVkVfTElORVNUUklQIiwiUFJJTUlUSVZFX1RSSVNUUklQIiwiUFJJTUlUSVZFX1RSSUZBTiIsImdlbmVyYXRlSW5kaWNlcyIsIm51bVZlcnRpY2VzIiwiZHVtbXlJbmRpY2VzIiwiZ2VuZXJhdGVOb3JtYWxzIiwic291cmNlRGVzYyIsInAiLCJjb21wb25lbnRzIiwicG9zaXRpb25zIiwic2l6ZSIsInN0cmlkZSIsInNyY1N0cmlkZSIsInR5cGVkQXJyYXlUeXBlc0J5dGVTaXplIiwic3JjIiwidHlwZWRBcnJheVR5cGVzIiwib2Zmc2V0Iiwibm9ybWFsc1RlbXAiLCJjYWxjdWxhdGVOb3JtYWxzIiwibm9ybWFscyIsInNldCIsImZsaXBUZXhDb29yZFZzIiwidmVydGV4QnVmZmVyIiwiZmxvYXRPZmZzZXRzIiwic2hvcnRPZmZzZXRzIiwiYnl0ZU9mZnNldHMiLCJmb3JtYXQiLCJlbGVtZW50cyIsImVsZW1lbnQiLCJuYW1lIiwicHVzaCIsImZsaXAiLCJvZmZzZXRzIiwib25lIiwidHlwZWRBcnJheSIsImluZGV4IiwiY2xvbmVUZXh0dXJlIiwidGV4dHVyZSIsInNoYWxsb3dDb3B5TGV2ZWxzIiwibWlwIiwiX2xldmVscyIsImxldmVsIiwiY3ViZW1hcCIsImZhY2UiLCJUZXh0dXJlIiwiZGV2aWNlIiwiY2xvbmVUZXh0dXJlQXNzZXQiLCJBc3NldCIsImZpbGUiLCJvcHRpb25zIiwibG9hZGVkIiwicmVzb3VyY2UiLCJyZWdpc3RyeSIsImFkZCIsImNyZWF0ZVZlcnRleEJ1ZmZlckludGVybmFsIiwiZmxpcFYiLCJwb3NpdGlvbkRlc2MiLCJ2ZXJ0ZXhEZXNjIiwic2VtYW50aWMiLCJub3JtYWxpemUiLCJzb3J0IiwibGhzIiwicmhzIiwiayIsInNvdXJjZSIsInRhcmdldCIsInNvdXJjZU9mZnNldCIsInZlcnRleEZvcm1hdCIsIlZlcnRleEZvcm1hdCIsImlzQ29ycmVjdGx5SW50ZXJsZWF2ZWQiLCJWZXJ0ZXhCdWZmZXIiLCJCVUZGRVJfU1RBVElDIiwidmVydGV4RGF0YSIsImxvY2siLCJ0YXJnZXRBcnJheSIsInNvdXJjZUFycmF5IiwidGFyZ2V0U3RyaWRlIiwic291cmNlU3RyaWRlIiwiZHN0Iiwia2VuZCIsImZsb29yIiwidW5sb2NrIiwiY3JlYXRlVmVydGV4QnVmZmVyIiwiYXR0cmlidXRlcyIsImFjY2Vzc29ycyIsInZlcnRleEJ1ZmZlckRpY3QiLCJ1c2VBdHRyaWJ1dGVzIiwiYXR0cmliSWRzIiwiYXR0cmliIiwidmJLZXkiLCJqb2luIiwidmIiLCJhY2Nlc3NvciIsImFjY2Vzc29yRGF0YSIsImNyZWF0ZVNraW4iLCJnbHRmU2tpbiIsImdsYlNraW5zIiwiYmluZE1hdHJpeCIsImpvaW50cyIsIm51bUpvaW50cyIsImlicCIsImludmVyc2VCaW5kTWF0cmljZXMiLCJpYm1EYXRhIiwiaWJtVmFsdWVzIiwiTWF0NCIsImJvbmVOYW1lcyIsImtleSIsInNraW4iLCJnZXQiLCJTa2luIiwiY3JlYXRlRHJhY29NZXNoIiwicHJvbWlzZXMiLCJfcHJpbWl0aXZlJGV4dGVuc2lvbnMiLCJNZXNoIiwiYWFiYiIsIlBPU0lUSU9OIiwiZW50cmllcyIsIl9hY2Nlc3NvciRub3JtYWxpemVkIiwiUHJvbWlzZSIsInJlc29sdmUiLCJyZWplY3QiLCJkcmFjb0V4dCIsImV4dGVuc2lvbnMiLCJLSFJfZHJhY29fbWVzaF9jb21wcmVzc2lvbiIsImRyYWNvRGVjb2RlIiwiZXJyIiwiZGVjb21wcmVzc2VkRGF0YSIsImNvbnNvbGUiLCJsb2ciLCJfcHJpbWl0aXZlJGF0dHJpYnV0ZXMiLCJvcmRlciIsImEiLCJOT1JNQUwiLCJzcGxpY2UiLCJ2ZXJ0aWNlcyIsImJ5dGVMZW5ndGgiLCJpbmRleEZvcm1hdCIsIklOREVYRk9STUFUX1VJTlQxNiIsIklOREVYRk9STUFUX1VJTlQzMiIsIm51bUluZGljZXMiLCJEZWJ1ZyIsImNhbGwiLCJ3YXJuIiwiaW5kZXhCdWZmZXIiLCJJbmRleEJ1ZmZlciIsImJhc2UiLCJpbmRleGVkIiwiS0hSX21hdGVyaWFsc192YXJpYW50cyIsInRlbXBNYXBwaW5nIiwibWFwcGluZ3MiLCJtYXBwaW5nIiwidmFyaWFudCIsIm1hdGVyaWFsIiwiaWQiLCJjcmVhdGVNZXNoIiwiZ2x0Zk1lc2giLCJhc3NldE9wdGlvbnMiLCJwcmltaXRpdmVzIiwiX3ByaW1pdGl2ZSRleHRlbnNpb25zMiIsInByaW1pdGl2ZVR5cGUiLCJtZXNoIiwiSU5ERVhGT1JNQVRfVUlOVDgiLCJleHRVaW50RWxlbWVudCIsImlzV2ViR1BVIiwidGFyZ2V0cyIsImRlbHRhUG9zaXRpb25zIiwiZGVsdGFQb3NpdGlvbnNUeXBlIiwiZGVsdGFOb3JtYWxzIiwiZGVsdGFOb3JtYWxzVHlwZSIsImV4dHJhcyIsInRhcmdldE5hbWVzIiwidG9TdHJpbmciLCJkZWZhdWx0V2VpZ2h0Iiwid2VpZ2h0cyIsInByZXNlcnZlRGF0YSIsIm1vcnBoUHJlc2VydmVEYXRhIiwiTW9ycGhUYXJnZXQiLCJtb3JwaCIsIk1vcnBoIiwicHJlZmVySGlnaFByZWNpc2lvbiIsIm1vcnBoUHJlZmVySGlnaFByZWNpc2lvbiIsImV4dHJhY3RUZXh0dXJlVHJhbnNmb3JtIiwibWFwcyIsIl9zb3VyY2UkZXh0ZW5zaW9ucyIsIm1hcCIsInRleENvb3JkIiwiemVyb3MiLCJvbmVzIiwidGV4dHVyZVRyYW5zZm9ybSIsIktIUl90ZXh0dXJlX3RyYW5zZm9ybSIsInNjYWxlIiwicm90YXRpb24iLCJtYXRoIiwiUkFEX1RPX0RFRyIsInRpbGluZ1ZlYyIsIlZlYzIiLCJvZmZzZXRWZWMiLCJleHRlbnNpb25QYnJTcGVjR2xvc3NpbmVzcyIsImNvbG9yIiwiZGlmZnVzZUZhY3RvciIsImRpZmZ1c2UiLCJwb3ciLCJvcGFjaXR5IiwiZGlmZnVzZVRleHR1cmUiLCJkaWZmdXNlTWFwIiwiZGlmZnVzZU1hcENoYW5uZWwiLCJvcGFjaXR5TWFwIiwib3BhY2l0eU1hcENoYW5uZWwiLCJ1c2VNZXRhbG5lc3MiLCJzcGVjdWxhckZhY3RvciIsInNwZWN1bGFyIiwiZ2xvc3MiLCJnbG9zc2luZXNzRmFjdG9yIiwic3BlY3VsYXJHbG9zc2luZXNzVGV4dHVyZSIsInNwZWN1bGFyRW5jb2RpbmciLCJzcGVjdWxhck1hcCIsImdsb3NzTWFwIiwic3BlY3VsYXJNYXBDaGFubmVsIiwiZ2xvc3NNYXBDaGFubmVsIiwiZXh0ZW5zaW9uQ2xlYXJDb2F0IiwiY2xlYXJDb2F0IiwiY2xlYXJjb2F0RmFjdG9yIiwiY2xlYXJjb2F0VGV4dHVyZSIsImNsZWFyQ29hdE1hcCIsImNsZWFyQ29hdE1hcENoYW5uZWwiLCJjbGVhckNvYXRHbG9zcyIsImNsZWFyY29hdFJvdWdobmVzc0ZhY3RvciIsImNsZWFyY29hdFJvdWdobmVzc1RleHR1cmUiLCJjbGVhckNvYXRHbG9zc01hcCIsImNsZWFyQ29hdEdsb3NzTWFwQ2hhbm5lbCIsImNsZWFyY29hdE5vcm1hbFRleHR1cmUiLCJjbGVhckNvYXROb3JtYWxNYXAiLCJjbGVhckNvYXRCdW1waW5lc3MiLCJjbGVhckNvYXRHbG9zc0ludmVydCIsImV4dGVuc2lvblVubGl0IiwidXNlTGlnaHRpbmciLCJlbWlzc2l2ZSIsImNvcHkiLCJlbWlzc2l2ZVRpbnQiLCJkaWZmdXNlVGludCIsImVtaXNzaXZlTWFwIiwiZW1pc3NpdmVNYXBVdiIsImRpZmZ1c2VNYXBVdiIsImVtaXNzaXZlTWFwVGlsaW5nIiwiZGlmZnVzZU1hcFRpbGluZyIsImVtaXNzaXZlTWFwT2Zmc2V0IiwiZGlmZnVzZU1hcE9mZnNldCIsImVtaXNzaXZlTWFwUm90YXRpb24iLCJkaWZmdXNlTWFwUm90YXRpb24iLCJlbWlzc2l2ZU1hcENoYW5uZWwiLCJlbWlzc2l2ZVZlcnRleENvbG9yIiwiZGlmZnVzZVZlcnRleENvbG9yIiwiZW1pc3NpdmVWZXJ0ZXhDb2xvckNoYW5uZWwiLCJkaWZmdXNlVmVydGV4Q29sb3JDaGFubmVsIiwidXNlU2t5Ym94IiwiZXh0ZW5zaW9uU3BlY3VsYXIiLCJ1c2VNZXRhbG5lc3NTcGVjdWxhckNvbG9yIiwic3BlY3VsYXJDb2xvclRleHR1cmUiLCJzcGVjdWxhckNvbG9yRmFjdG9yIiwic3BlY3VsYXJpdHlGYWN0b3IiLCJzcGVjdWxhcml0eUZhY3Rvck1hcENoYW5uZWwiLCJzcGVjdWxhcml0eUZhY3Rvck1hcCIsInNwZWN1bGFyVGV4dHVyZSIsImV4dGVuc2lvbklvciIsInJlZnJhY3Rpb25JbmRleCIsImlvciIsImV4dGVuc2lvblRyYW5zbWlzc2lvbiIsImJsZW5kVHlwZSIsIkJMRU5EX05PUk1BTCIsInVzZUR5bmFtaWNSZWZyYWN0aW9uIiwicmVmcmFjdGlvbiIsInRyYW5zbWlzc2lvbkZhY3RvciIsInJlZnJhY3Rpb25NYXBDaGFubmVsIiwicmVmcmFjdGlvbk1hcCIsInRyYW5zbWlzc2lvblRleHR1cmUiLCJleHRlbnNpb25TaGVlbiIsInVzZVNoZWVuIiwic2hlZW5Db2xvckZhY3RvciIsInNoZWVuIiwic2hlZW5NYXAiLCJzaGVlbkNvbG9yVGV4dHVyZSIsInNoZWVuRW5jb2RpbmciLCJzaGVlbkdsb3NzIiwic2hlZW5Sb3VnaG5lc3NGYWN0b3IiLCJzaGVlbkdsb3NzTWFwIiwic2hlZW5Sb3VnaG5lc3NUZXh0dXJlIiwic2hlZW5HbG9zc01hcENoYW5uZWwiLCJzaGVlbkdsb3NzSW52ZXJ0IiwiZXh0ZW5zaW9uVm9sdW1lIiwidGhpY2tuZXNzIiwidGhpY2tuZXNzRmFjdG9yIiwidGhpY2tuZXNzTWFwIiwidGhpY2tuZXNzVGV4dHVyZSIsInRoaWNrbmVzc01hcENoYW5uZWwiLCJhdHRlbnVhdGlvbkRpc3RhbmNlIiwiYXR0ZW51YXRpb25Db2xvciIsImF0dGVudWF0aW9uIiwiZXh0ZW5zaW9uRW1pc3NpdmVTdHJlbmd0aCIsImVtaXNzaXZlSW50ZW5zaXR5IiwiZW1pc3NpdmVTdHJlbmd0aCIsImV4dGVuc2lvbklyaWRlc2NlbmNlIiwidXNlSXJpZGVzY2VuY2UiLCJpcmlkZXNjZW5jZSIsImlyaWRlc2NlbmNlRmFjdG9yIiwiaXJpZGVzY2VuY2VNYXBDaGFubmVsIiwiaXJpZGVzY2VuY2VNYXAiLCJpcmlkZXNjZW5jZVRleHR1cmUiLCJpcmlkZXNjZW5jZVJlZnJhY3Rpb25JbmRleCIsImlyaWRlc2NlbmNlSW9yIiwiaXJpZGVzY2VuY2VUaGlja25lc3NNaW4iLCJpcmlkZXNjZW5jZVRoaWNrbmVzc01pbmltdW0iLCJpcmlkZXNjZW5jZVRoaWNrbmVzc01heCIsImlyaWRlc2NlbmNlVGhpY2tuZXNzTWF4aW11bSIsImlyaWRlc2NlbmNlVGhpY2tuZXNzTWFwQ2hhbm5lbCIsImlyaWRlc2NlbmNlVGhpY2tuZXNzTWFwIiwiaXJpZGVzY2VuY2VUaGlja25lc3NUZXh0dXJlIiwiY3JlYXRlTWF0ZXJpYWwiLCJnbHRmTWF0ZXJpYWwiLCJTdGFuZGFyZE1hdGVyaWFsIiwib2NjbHVkZVNwZWN1bGFyIiwiU1BFQ09DQ19BTyIsInNwZWN1bGFyVGludCIsInNwZWN1bGFyVmVydGV4Q29sb3IiLCJwYnJEYXRhIiwicGJyTWV0YWxsaWNSb3VnaG5lc3MiLCJiYXNlQ29sb3JGYWN0b3IiLCJiYXNlQ29sb3JUZXh0dXJlIiwibWV0YWxuZXNzIiwibWV0YWxsaWNGYWN0b3IiLCJyb3VnaG5lc3NGYWN0b3IiLCJnbG9zc0ludmVydCIsIm1ldGFsbGljUm91Z2huZXNzVGV4dHVyZSIsIm1ldGFsbmVzc01hcCIsIm1ldGFsbmVzc01hcENoYW5uZWwiLCJub3JtYWxUZXh0dXJlIiwibm9ybWFsTWFwIiwiYnVtcGluZXNzIiwib2NjbHVzaW9uVGV4dHVyZSIsImFvTWFwIiwiYW9NYXBDaGFubmVsIiwiZW1pc3NpdmVGYWN0b3IiLCJlbWlzc2l2ZVRleHR1cmUiLCJhbHBoYU1vZGUiLCJCTEVORF9OT05FIiwiYWxwaGFUZXN0IiwiYWxwaGFDdXRvZmYiLCJkZXB0aFdyaXRlIiwidHdvU2lkZWRMaWdodGluZyIsImRvdWJsZVNpZGVkIiwiY3VsbCIsIkNVTExGQUNFX05PTkUiLCJDVUxMRkFDRV9CQUNLIiwiZXh0ZW5zaW9uRnVuYyIsInVuZGVmaW5lZCIsInVwZGF0ZSIsImNyZWF0ZUFuaW1hdGlvbiIsImdsdGZBbmltYXRpb24iLCJhbmltYXRpb25JbmRleCIsImdsdGZBY2Nlc3NvcnMiLCJnbHRmTm9kZXMiLCJjcmVhdGVBbmltRGF0YSIsIkFuaW1EYXRhIiwiaW50ZXJwTWFwIiwiSU5URVJQT0xBVElPTl9TVEVQIiwiSU5URVJQT0xBVElPTl9MSU5FQVIiLCJJTlRFUlBPTEFUSU9OX0NVQklDIiwiaW5wdXRNYXAiLCJvdXRwdXRNYXAiLCJjdXJ2ZU1hcCIsIm91dHB1dENvdW50ZXIiLCJzYW1wbGVycyIsInNhbXBsZXIiLCJpbnB1dCIsIm91dHB1dCIsImludGVycG9sYXRpb24iLCJjdXJ2ZSIsInBhdGhzIiwicXVhdEFycmF5cyIsInRyYW5zZm9ybVNjaGVtYSIsImNvbnN0cnVjdE5vZGVQYXRoIiwibm9kZSIsInBhdGgiLCJ1bnNoaWZ0IiwicGFyZW50IiwiY3JlYXRlTW9ycGhUYXJnZXRDdXJ2ZXMiLCJnbHRmTm9kZSIsImVudGl0eVBhdGgiLCJvdXQiLCJvdXREYXRhIiwibW9ycGhUYXJnZXRDb3VudCIsImtleWZyYW1lQ291bnQiLCJzaW5nbGVCdWZmZXJTaXplIiwiX3RhcmdldE5hbWVzIiwibW9ycGhUYXJnZXRPdXRwdXQiLCJ3ZWlnaHROYW1lIiwibW9ycGhDdXJ2ZSIsImNvbXBvbmVudCIsInByb3BlcnR5UGF0aCIsImNoYW5uZWxzIiwiY2hhbm5lbCIsInN0YXJ0c1dpdGgiLCJpbnB1dHMiLCJvdXRwdXRzIiwiY3VydmVzIiwiaW5wdXRLZXkiLCJvdXRwdXRLZXkiLCJjdXJ2ZUtleSIsImN1cnZlRGF0YSIsIkFuaW1DdXJ2ZSIsInByZXZJbmRleCIsImQiLCJkcCIsImR1cmF0aW9uIiwiX2RhdGEiLCJBbmltVHJhY2siLCJ0ZW1wTWF0IiwidGVtcFZlYyIsImNyZWF0ZU5vZGUiLCJub2RlSW5kZXgiLCJlbnRpdHkiLCJHcmFwaE5vZGUiLCJtYXRyaXgiLCJnZXRUcmFuc2xhdGlvbiIsInNldExvY2FsUG9zaXRpb24iLCJnZXRFdWxlckFuZ2xlcyIsInNldExvY2FsRXVsZXJBbmdsZXMiLCJnZXRTY2FsZSIsInNldExvY2FsU2NhbGUiLCJyIiwic2V0TG9jYWxSb3RhdGlvbiIsInQiLCJ0cmFuc2xhdGlvbiIsInMiLCJjcmVhdGVDYW1lcmEiLCJnbHRmQ2FtZXJhIiwicHJvamVjdGlvbiIsIlBST0pFQ1RJT05fT1JUSE9HUkFQSElDIiwiUFJPSkVDVElPTl9QRVJTUEVDVElWRSIsImdsdGZQcm9wZXJ0aWVzIiwib3J0aG9ncmFwaGljIiwicGVyc3BlY3RpdmUiLCJjb21wb25lbnREYXRhIiwiZW5hYmxlZCIsIm5lYXJDbGlwIiwiem5lYXIiLCJhc3BlY3RSYXRpb01vZGUiLCJBU1BFQ1RfQVVUTyIsInpmYXIiLCJmYXJDbGlwIiwib3J0aG9IZWlnaHQiLCJ5bWFnIiwiQVNQRUNUX01BTlVBTCIsImFzcGVjdFJhdGlvIiwieG1hZyIsImZvdiIsInlmb3YiLCJjYW1lcmFFbnRpdHkiLCJFbnRpdHkiLCJhZGRDb21wb25lbnQiLCJjcmVhdGVMaWdodCIsImdsdGZMaWdodCIsImxpZ2h0UHJvcHMiLCJDb2xvciIsIldISVRFIiwicmFuZ2UiLCJmYWxsb2ZmTW9kZSIsIkxJR0hURkFMTE9GRl9JTlZFUlNFU1FVQVJFRCIsImludGVuc2l0eSIsImNsYW1wIiwiaW5uZXJDb25lQW5nbGUiLCJzcG90Iiwib3V0ZXJDb25lQW5nbGUiLCJQSSIsImx1bWluYW5jZSIsIkxpZ2h0IiwiZ2V0TGlnaHRVbml0Q29udmVyc2lvbiIsImxpZ2h0VHlwZXMiLCJsaWdodEVudGl0eSIsInJvdGF0ZUxvY2FsIiwiY3JlYXRlU2tpbnMiLCJNYXAiLCJjcmVhdGVNZXNoZXMiLCJfZ2x0ZiRtZXNoZXMiLCJfZ2x0ZiRhY2Nlc3NvcnMiLCJfZ2x0ZiRidWZmZXJWaWV3cyIsInZhbGlkIiwic2tpcE1lc2hlcyIsImNyZWF0ZU1hdGVyaWFscyIsIl9vcHRpb25zJG1hdGVyaWFsIiwiX29wdGlvbnMkbWF0ZXJpYWwkcHJvIiwiX29wdGlvbnMkbWF0ZXJpYWwyIiwiX29wdGlvbnMkbWF0ZXJpYWwzIiwicHJlcHJvY2VzcyIsInByb2Nlc3MiLCJwb3N0cHJvY2VzcyIsImNyZWF0ZVZhcmlhbnRzIiwiY3JlYXRlQW5pbWF0aW9ucyIsIl9vcHRpb25zJGFuaW1hdGlvbiIsIl9vcHRpb25zJGFuaW1hdGlvbjIiLCJhbmltYXRpb24iLCJjcmVhdGVOb2RlcyIsIl9vcHRpb25zJG5vZGUiLCJfb3B0aW9ucyRub2RlJHByb2Nlc3MiLCJfb3B0aW9ucyRub2RlMiIsIl9vcHRpb25zJG5vZGUzIiwidW5pcXVlTmFtZXMiLCJjaGlsZHJlbiIsImNoaWxkIiwiYWRkQ2hpbGQiLCJjcmVhdGVTY2VuZXMiLCJfZ2x0ZiRzY2VuZXMkMCRub2RlcyIsInNjZW5lIiwic2NlbmVSb290IiwibiIsImNoaWxkTm9kZSIsImNyZWF0ZUNhbWVyYXMiLCJfb3B0aW9ucyRjYW1lcmEiLCJfb3B0aW9ucyRjYW1lcmEkcHJvY2UiLCJfb3B0aW9ucyRjYW1lcmEyIiwiX29wdGlvbnMkY2FtZXJhMyIsImNhbWVyYSIsImNyZWF0ZUxpZ2h0cyIsIktIUl9saWdodHNfcHVuY3R1YWwiLCJnbHRmTGlnaHRzIiwiX29wdGlvbnMkbGlnaHQiLCJfb3B0aW9ucyRsaWdodCRwcm9jZXMiLCJfb3B0aW9ucyRsaWdodDIiLCJfb3B0aW9ucyRsaWdodDMiLCJsaWdodCIsImxpZ2h0SW5kZXgiLCJsaW5rU2tpbnMiLCJtZXNoR3JvdXAiLCJjcmVhdGVSZXNvdXJjZXMiLCJfb3B0aW9ucyRnbG9iYWwiLCJfb3B0aW9ucyRnbG9iYWwyIiwiZ2xvYmFsIiwiYXNzZXQiLCJnZW5lcmF0b3IiLCJidWZmZXJWaWV3RGF0YSIsImFsbCIsInRleHR1cmVBc3NldHMiLCJ0ZXh0dXJlSW5zdGFuY2VzIiwiUmVuZGVyIiwiYXBwbHlTYW1wbGVyIiwiZ2x0ZlNhbXBsZXIiLCJnZXRGaWx0ZXIiLCJmaWx0ZXIiLCJkZWZhdWx0VmFsdWUiLCJGSUxURVJfTkVBUkVTVCIsIkZJTFRFUl9MSU5FQVIiLCJGSUxURVJfTkVBUkVTVF9NSVBNQVBfTkVBUkVTVCIsIkZJTFRFUl9MSU5FQVJfTUlQTUFQX05FQVJFU1QiLCJGSUxURVJfTkVBUkVTVF9NSVBNQVBfTElORUFSIiwiRklMVEVSX0xJTkVBUl9NSVBNQVBfTElORUFSIiwiZ2V0V3JhcCIsIndyYXAiLCJBRERSRVNTX0NMQU1QX1RPX0VER0UiLCJBRERSRVNTX01JUlJPUkVEX1JFUEVBVCIsIkFERFJFU1NfUkVQRUFUIiwiX2dsdGZTYW1wbGVyIiwibWluRmlsdGVyIiwibWFnRmlsdGVyIiwiYWRkcmVzc1UiLCJ3cmFwUyIsImFkZHJlc3NWIiwid3JhcFQiLCJnbHRmVGV4dHVyZVVuaXF1ZUlkIiwiY3JlYXRlSW1hZ2VzIiwidXJsQmFzZSIsIl9vcHRpb25zJGltYWdlIiwiX29wdGlvbnMkaW1hZ2UyIiwiX29wdGlvbnMkaW1hZ2UzIiwiaW1hZ2VzIiwiaW1hZ2UiLCJwcm9jZXNzQXN5bmMiLCJtaW1lVHlwZUZpbGVFeHRlbnNpb25zIiwibG9hZFRleHR1cmUiLCJnbHRmSW1hZ2UiLCJ1cmwiLCJtaW1lVHlwZSIsImNvbnRpbnVhdGlvbiIsImNvbnRlbnRzIiwiZXh0ZW5zaW9uIiwiZmlsZW5hbWUiLCJvbiIsImxvYWQiLCJ0aGVuIiwicHJvbWlzZSIsInRleHR1cmVBc3NldCIsIkFCU09MVVRFX1VSTCIsImNyb3NzT3JpZ2luIiwiRXJyb3IiLCJjcmVhdGVUZXh0dXJlcyIsIl9nbHRmJGltYWdlcyIsIl9nbHRmJHRleHR1cmVzIiwiX29wdGlvbnMkdGV4dHVyZSIsIl9vcHRpb25zJHRleHR1cmUyIiwiX29wdGlvbnMkdGV4dHVyZTMiLCJzZWVuSW1hZ2VzIiwiU2V0IiwiZ2x0ZlRleHR1cmUiLCJnbHRmSW1hZ2VJbmRleCIsIl9yZWYiLCJfcmVmMiIsIl9nbHRmSW1hZ2VJbmRleCIsIl9nbHRmVGV4dHVyZSRleHRlbnNpbyIsIl9nbHRmVGV4dHVyZSRleHRlbnNpbzIiLCJLSFJfdGV4dHVyZV9iYXNpc3UiLCJFWFRfdGV4dHVyZV93ZWJwIiwiY2xvbmVBc3NldCIsImhhcyIsImltYWdlQXNzZXQiLCJfZ2x0ZiRzYW1wbGVycyIsImxvYWRCdWZmZXJzIiwiYmluYXJ5Q2h1bmsiLCJfb3B0aW9ucyRidWZmZXIiLCJfb3B0aW9ucyRidWZmZXIyIiwiX29wdGlvbnMkYnVmZmVyMyIsImJ1ZmZlcnMiLCJnbHRmQnVmZmVyIiwiYXJyYXlCdWZmZXIiLCJieXRlU3RyaW5nIiwiYXRvYiIsInNwbGl0IiwiYmluYXJ5QXJyYXkiLCJjaGFyQ29kZUF0IiwiaHR0cCIsImNhY2hlIiwicmVzcG9uc2VUeXBlIiwicmV0cnkiLCJwYXJzZUdsdGYiLCJnbHRmQ2h1bmsiLCJjYWxsYmFjayIsImRlY29kZUJpbmFyeVV0ZjgiLCJhcnJheSIsIlRleHREZWNvZGVyIiwiZGVjb2RlIiwic3RyIiwiU3RyaW5nIiwiZnJvbUNoYXJDb2RlIiwiZGVjb2RlVVJJQ29tcG9uZW50IiwiZXNjYXBlIiwiSlNPTiIsInBhcnNlIiwidmVyc2lvbiIsInBhcnNlRmxvYXQiLCJwYXJzZUdsYiIsImdsYkRhdGEiLCJEYXRhVmlldyIsIm1hZ2ljIiwiZ2V0VWludDMyIiwiY2h1bmtzIiwiY2h1bmtMZW5ndGgiLCJjaHVua1R5cGUiLCJjaHVua0RhdGEiLCJwYXJzZUNodW5rIiwiaGFzR2xiSGVhZGVyIiwidTgiLCJ0b0xvd2VyQ2FzZSIsImVuZHNXaXRoIiwiY3JlYXRlQnVmZmVyVmlld3MiLCJfb3B0aW9ucyRidWZmZXJWaWV3IiwiX29wdGlvbnMkYnVmZmVyVmlldzIiLCJfb3B0aW9ucyRidWZmZXJWaWV3MyIsIl9nbHRmJGJ1ZmZlclZpZXdzMiIsImdsdGZCdWZmZXJWaWV3IiwiR2xiUGFyc2VyIiwiY2F0Y2giLCJjcmVhdGVEZWZhdWx0TWF0ZXJpYWwiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQW9EQTtBQUNBLE1BQU1BLFlBQVksQ0FBQztFQUFBQyxXQUFBLEdBQUE7QUFBQSxJQUFBLElBQUEsQ0FDZkMsSUFBSSxHQUFBLEtBQUEsQ0FBQSxDQUFBO0FBQUEsSUFBQSxJQUFBLENBRUpDLEtBQUssR0FBQSxLQUFBLENBQUEsQ0FB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
