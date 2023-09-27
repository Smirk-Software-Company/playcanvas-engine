import { Debug } from '../../core/debug.js';
import { now } from '../../core/time.js';
import { Curve } from '../../core/math/curve.js';
import { CurveSet } from '../../core/math/curve-set.js';
import { Mat4 } from '../../core/math/mat4.js';
import { math } from '../../core/math/math.js';
import { Quat } from '../../core/math/quat.js';
import { Vec3 } from '../../core/math/vec3.js';
import { BoundingBox } from '../../core/shape/bounding-box.js';
import { FILTER_LINEAR, PRIMITIVE_TRIANGLES, CULLFACE_NONE, BUFFER_DYNAMIC, INDEXFORMAT_UINT16, SEMANTIC_ATTR0, TYPE_FLOAT32, SEMANTIC_ATTR1, SEMANTIC_ATTR2, SEMANTIC_ATTR3, SEMANTIC_ATTR4, SEMANTIC_TEXCOORD0, ADDRESS_CLAMP_TO_EDGE, PIXELFORMAT_RGBA8, PIXELFORMAT_RGBA32F, FILTER_NEAREST } from '../../platform/graphics/constants.js';
import { DeviceCache } from '../../platform/graphics/device-cache.js';
import { IndexBuffer } from '../../platform/graphics/index-buffer.js';
import { RenderTarget } from '../../platform/graphics/render-target.js';
import { Texture } from '../../platform/graphics/texture.js';
import { VertexBuffer } from '../../platform/graphics/vertex-buffer.js';
import { VertexFormat } from '../../platform/graphics/vertex-format.js';
import { ShaderProcessorOptions } from '../../platform/graphics/shader-processor-options.js';
import { EMITTERSHAPE_BOX, PARTICLESORT_NONE, SHADER_FORWARD, PARTICLEORIENTATION_SCREEN, PARTICLEORIENTATION_WORLD, PARTICLEMODE_GPU, BLEND_NORMAL } from '../constants.js';
import { Mesh } from '../mesh.js';
import { MeshInstance } from '../mesh-instance.js';
import { Material } from '../materials/material.js';
import { getProgramLibrary } from '../shader-lib/get-program-library.js';
import { createShaderFromCode } from '../shader-lib/utils.js';
import { shaderChunks } from '../shader-lib/chunks/chunks.js';
import { particle } from '../shader-lib/programs/particle.js';
import { ParticleCPUUpdater } from './cpu-updater.js';
import { ParticleGPUUpdater } from './gpu-updater.js';

const particleVerts = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
function _createTexture(device, width, height, pixelData, format = PIXELFORMAT_RGBA32F, mult8Bit, filter) {
  let mipFilter = FILTER_NEAREST;
  if (filter && format === PIXELFORMAT_RGBA8) mipFilter = FILTER_LINEAR;
  const texture = new Texture(device, {
    width: width,
    height: height,
    format: format,
    cubemap: false,
    mipmaps: false,
    minFilter: mipFilter,
    magFilter: mipFilter,
    addressU: ADDRESS_CLAMP_TO_EDGE,
    addressV: ADDRESS_CLAMP_TO_EDGE,
    name: 'ParticleSystemTexture'
  });
  const pixels = texture.lock();
  if (format === PIXELFORMAT_RGBA8) {
    const temp = new Uint8Array(pixelData.length);
    for (let i = 0; i < pixelData.length; i++) {
      temp[i] = pixelData[i] * mult8Bit * 255;
    }
    pixelData = temp;
  }
  pixels.set(pixelData);
  texture.unlock();
  return texture;
}
function saturate(x) {
  return Math.max(Math.min(x, 1), 0);
}
const default0Curve = new Curve([0, 0, 1, 0]);
const default1Curve = new Curve([0, 1, 1, 1]);
const default0Curve3 = new CurveSet([0, 0, 1, 0], [0, 0, 1, 0], [0, 0, 1, 0]);
const default1Curve3 = new CurveSet([0, 1, 1, 1], [0, 1, 1, 1], [0, 1, 1, 1]);
let particleTexHeight = 2;
const particleTexChannels = 4; // there is a duplicate in cpu updater

const extentsInnerRatioUniform = new Float32Array(3);
const spawnMatrix = new Mat4();
const tmpVec3 = new Vec3();
const bMin = new Vec3();
const bMax = new Vec3();
let setPropertyTarget;
let setPropertyOptions;
function setProperty(pName, defaultVal) {
  if (setPropertyOptions[pName] !== undefined && setPropertyOptions[pName] !== null) {
    setPropertyTarget[pName] = setPropertyOptions[pName];
  } else {
    setPropertyTarget[pName] = defaultVal;
  }
}
function pack3NFloats(a, b, c) {
  const packed = a * 255 << 16 | b * 255 << 8 | c * 255;
  return packed / (1 << 24);
}
function packTextureXYZ_NXYZ(qXYZ, qXYZ2) {
  const num = qXYZ.length / 3;
  const colors = new Array(num * 4);
  for (let i = 0; i < num; i++) {
    colors[i * 4] = qXYZ[i * 3];
    colors[i * 4 + 1] = qXYZ[i * 3 + 1];
    colors[i * 4 + 2] = qXYZ[i * 3 + 2];
    colors[i * 4 + 3] = pack3NFloats(qXYZ2[i * 3], qXYZ2[i * 3 + 1], qXYZ2[i * 3 + 2]);
  }
  return colors;
}
function packTextureRGBA(qRGB, qA) {
  const colors = new Array(qA.length * 4);
  for (let i = 0; i < qA.length; i++) {
    colors[i * 4] = qRGB[i * 3];
    colors[i * 4 + 1] = qRGB[i * 3 + 1];
    colors[i * 4 + 2] = qRGB[i * 3 + 2];
    colors[i * 4 + 3] = qA[i];
  }
  return colors;
}
function packTexture5Floats(qA, qB, qC, qD, qE) {
  const colors = new Array(qA.length * 4);
  for (let i = 0; i < qA.length; i++) {
    colors[i * 4] = qA[i];
    colors[i * 4 + 1] = qB[i];
    colors[i * 4 + 2] = 0;
    colors[i * 4 + 3] = pack3NFloats(qC[i], qD[i], qE[i]);
  }
  return colors;
}
function packTexture2Floats(qA, qB) {
  const colors = new Array(qA.length * 4);
  for (let i = 0; i < qA.length; i++) {
    colors[i * 4] = qA[i];
    colors[i * 4 + 1] = qB[i];
    colors[i * 4 + 2] = 0;
    colors[i * 4 + 3] = 0;
  }
  return colors;
}
function calcEndTime(emitter) {
  const interval = Math.max(emitter.rate, emitter.rate2) * emitter.numParticles + emitter.lifetime;
  return Date.now() + interval * 1000;
}
function subGraph(A, B) {
  const r = new Float32Array(A.length);
  for (let i = 0; i < A.length; i++) {
    r[i] = A[i] - B[i];
  }
  return r;
}
function maxUnsignedGraphValue(A, outUMax) {
  const chans = outUMax.length;
  const values = A.length / chans;
  for (let i = 0; i < values; i++) {
    for (let j = 0; j < chans; j++) {
      const a = Math.abs(A[i * chans + j]);
      outUMax[j] = Math.max(outUMax[j], a);
    }
  }
}
function normalizeGraph(A, uMax) {
  const chans = uMax.length;
  const values = A.length / chans;
  for (let i = 0; i < values; i++) {
    for (let j = 0; j < chans; j++) {
      A[i * chans + j] /= uMax[j] === 0 ? 1 : uMax[j];
      A[i * chans + j] *= 0.5;
      A[i * chans + j] += 0.5;
    }
  }
}
function divGraphFrom2Curves(curve1, curve2, outUMax) {
  const sub = subGraph(curve2, curve1);
  maxUnsignedGraphValue(sub, outUMax);
  normalizeGraph(sub, outUMax);
  return sub;
}

// a device cache storing default parameter texture for the emitter
const particleEmitterDeviceCache = new DeviceCache();
class ParticleEmitter {
  constructor(graphicsDevice, options) {
    this.graphicsDevice = graphicsDevice;
    const gd = graphicsDevice;
    const precision = 32;
    this.precision = precision;
    this._addTimeTime = 0;

    // Global system parameters
    setPropertyTarget = this;
    setPropertyOptions = options;
    setProperty('numParticles', 1); // Amount of particles allocated (max particles = max GL texture width at this moment)

    if (this.numParticles > graphicsDevice.maxTextureSize) {
      Debug.warn(`WARNING: can't create more than ${graphicsDevice.maxTextureSize} particles on this device.`);
      this.numParticles = graphicsDevice.maxTextureSize;
    }
    setProperty('rate', 1); // Emission rate
    setProperty('rate2', this.rate);
    setProperty('lifetime', 50); // Particle lifetime
    setProperty('emitterExtents', new Vec3(0, 0, 0)); // Spawn point divergence
    setProperty('emitterExtentsInner', new Vec3(0, 0, 0)); // Volume inside emitterExtents to exclude from regeneration
    setProperty('emitterRadius', 0);
    setProperty('emitterRadiusInner', 0); // Same as ExtentsInner but for spherical volume
    setProperty('emitterShape', EMITTERSHAPE_BOX);
    setProperty('initialVelocity', 1);
    setProperty('wrap', false);
    setProperty('localSpace', false);
    setProperty('screenSpace', false);
    setProperty('wrapBounds', null);
    setProperty('colorMap', this.defaultParamTexture);
    setProperty('normalMap', null);
    setProperty('loop', true);
    setProperty('preWarm', false);
    setProperty('sort', PARTICLESORT_NONE); // Sorting mode: 0 = none, 1 = by distance, 2 = by life, 3 = by -life;  Forces CPU mode if not 0
    setProperty('mode', PARTICLEMODE_GPU);
    setProperty('scene', null);
    setProperty('lighting', false);
    setProperty('halfLambert', false);
    setProperty('intensity', 1.0);
    setProperty('stretch', 0.0);
    setProperty('alignToMotion', false);
    setProperty('depthSoftening', 0);
    setProperty('mesh', null); // Mesh to be used as particle. Vertex buffer is supposed to hold vertex position in first 3 floats of each vertex
    // Leave undefined to use simple quads
    setProperty('particleNormal', new Vec3(0, 1, 0));
    setProperty('orientation', PARTICLEORIENTATION_SCREEN);
    setProperty('depthWrite', false);
    setProperty('noFog', false);
    setProperty('blendType', BLEND_NORMAL);
    setProperty('node', null);
    setProperty('startAngle', 0);
    setProperty('startAngle2', this.startAngle);
    setProperty('animTilesX', 1);
    setProperty('animTilesY', 1);
    setProperty('animStartFrame', 0);
    setProperty('animNumFrames', 1);
    setProperty('animNumAnimations', 1);
    setProperty('animIndex', 0);
    setProperty('randomizeAnimIndex', false);
    setProperty('animSpeed', 1);
    setProperty('animLoop', true);
    this._gpuUpdater = new ParticleGPUUpdater(this, gd);
    this._cpuUpdater = new ParticleCPUUpdater(this);
    this.emitterPosUniform = new Float32Array(3);
    this.wrapBoundsUniform = new Float32Array(3);
    this.emitterScaleUniform = new Float32Array([1, 1, 1]);

    // Time-dependent parameters
    setProperty('colorGraph', default1Curve3);
    setProperty('colorGraph2', this.colorGraph);
    setProperty('scaleGraph', default1Curve);
    setProperty('scaleGraph2', this.scaleGraph);
    setProperty('alphaGraph', default1Curve);
    setProperty('alphaGraph2', this.alphaGraph);
    setProperty('localVelocityGraph', default0Curve3);
    setProperty('localVelocityGraph2', this.localVelocityGraph);
    setProperty('velocityGraph', default0Curve3);
    setProperty('velocityGraph2', this.velocityGraph);
    setProperty('rotationSpeedGraph', default0Curve);
    setProperty('rotationSpeedGraph2', this.rotationSpeedGraph);
    setProperty('radialSpeedGraph', default0Curve);
    setProperty('radialSpeedGraph2', this.radialSpeedGraph);
    this.animTilesParams = new Float32Array(2);
    this.animParams = new Float32Array(4);
    this.animIndexParams = new Float32Array(2);
    this.internalTex0 = null;
    this.internalTex1 = null;
    this.internalTex2 = null;
    this.colorParam = null;
    this.vbToSort = null;
    this.vbOld = null;
    this.particleDistance = null;
    this.camera = null;
    this.swapTex = false;
    this.useMesh = true;
    this.useCpu = !graphicsDevice.supportsGpuParticles;
    this.pack8 = true;
    this.localBounds = new BoundingBox();
    this.worldBoundsNoTrail = new BoundingBox();
    this.worldBoundsTrail = [new BoundingBox(), new BoundingBox()];
    this.worldBounds = new BoundingBox();
    this.worldBoundsSize = new Vec3();
    this.prevWorldBoundsSize = new Vec3();
    this.prevWorldBoundsCenter = new Vec3();
    this.prevEmitterExtents = this.emitterExtents;
    this.prevEmitterRadius = this.emitterRadius;
    this.worldBoundsMul = new Vec3();
    this.worldBoundsAdd = new Vec3();
    this.timeToSwitchBounds = 0;
    // this.prevPos = new Vec3();

    this.shaderParticleUpdateRespawn = null;
    this.shaderParticleUpdateNoRespawn = null;
    this.shaderParticleUpdateOnStop = null;
    this.numParticleVerts = 0;
    this.numParticleIndices = 0;
    this.material = null;
    this.meshInstance = null;
    this.drawOrder = 0;
    this.seed = Math.random();
    this.fixedTimeStep = 1.0 / 60;
    this.maxSubSteps = 10;
    this.simTime = 0;
    this.simTimeTotal = 0;
    this.beenReset = false;
    this._layer = null;
    this.rebuild();
  }
  get defaultParamTexture() {
    Debug.assert(this.graphicsDevice);
    return particleEmitterDeviceCache.get(this.graphicsDevice, () => {
      const resolution = 16;
      const centerPoint = resolution * 0.5 + 0.5;
      const dtex = new Float32Array(resolution * resolution * 4);
      for (let y = 0; y < resolution; y++) {
        for (let x = 0; x < resolution; x++) {
          const xgrad = x + 1 - centerPoint;
          const ygrad = y + 1 - centerPoint;
          const c = saturate(1 - saturate(Math.sqrt(xgrad * xgrad + ygrad * ygrad) / resolution) - 0.5);
          const p = y * resolution + x;
          dtex[p * 4] = 1;
          dtex[p * 4 + 1] = 1;
          dtex[p * 4 + 2] = 1;
          dtex[p * 4 + 3] = c;
        }
      }
      const texture = _createTexture(this.graphicsDevice, resolution, resolution, dtex, PIXELFORMAT_RGBA8, 1.0, true);
      texture.minFilter = FILTER_LINEAR;
      texture.magFilter = FILTER_LINEAR;
      return texture;
    });
  }
  onChangeCamera() {
    this.regenShader();
    this.resetMaterial();
  }
  calculateBoundsMad() {
    this.worldBoundsMul.x = 1.0 / this.worldBoundsSize.x;
    this.worldBoundsMul.y = 1.0 / this.worldBoundsSize.y;
    this.worldBoundsMul.z = 1.0 / this.worldBoundsSize.z;
    this.worldBoundsAdd.copy(this.worldBounds.center).mul(this.worldBoundsMul).mulScalar(-1);
    this.worldBoundsAdd.x += 0.5;
    this.worldBoundsAdd.y += 0.5;
    this.worldBoundsAdd.z += 0.5;
  }
  calculateWorldBounds() {
    if (!this.node) return;
    this.prevWorldBoundsSize.copy(this.worldBoundsSize);
    this.prevWorldBoundsCenter.copy(this.worldBounds.center);
    if (!this.useCpu) {
      let recalculateLocalBounds = false;
      if (this.emitterShape === EMITTERSHAPE_BOX) {
        recalculateLocalBounds = !this.emitterExtents.equals(this.prevEmitterExtents);
      } else {
        recalculateLocalBounds = !(this.emitterRadius === this.prevEmitterRadius);
      }
      if (recalculateLocalBounds) {
        this.calculateLocalBounds();
      }
    }
    const nodeWT = this.node.getWorldTransform();
    if (this.localSpace) {
      this.worldBoundsNoTrail.copy(this.localBounds);
    } else {
      this.worldBoundsNoTrail.setFromTransformedAabb(this.localBounds, nodeWT);
    }
    this.worldBoundsTrail[0].add(this.worldBoundsNoTrail);
    this.worldBoundsTrail[1].add(this.worldBoundsNoTrail);
    const now = this.simTimeTotal;
    if (now >= this.timeToSwitchBounds) {
      this.worldBoundsTrail[0].copy(this.worldBoundsTrail[1]);
      this.worldBoundsTrail[1].copy(this.worldBoundsNoTrail);
      this.timeToSwitchBounds = now + this.lifetime;
    }
    this.worldBounds.copy(this.worldBoundsTrail[0]);
    this.worldBoundsSize.copy(this.worldBounds.halfExtents).mulScalar(2);
    if (this.localSpace) {
      this.meshInstance.aabb.setFromTransformedAabb(this.worldBounds, nodeWT);
      this.meshInstance.mesh.aabb.setFromTransformedAabb(this.worldBounds, nodeWT);
    } else {
      this.meshInstance.aabb.copy(this.worldBounds);
      this.meshInstance.mesh.aabb.copy(this.worldBounds);
    }
    this.meshInstance._aabbVer = 1 - this.meshInstance._aabbVer;
    if (this.pack8) this.calculateBoundsMad();
  }
  resetWorldBounds() {
    if (!this.node) return;
    this.worldBoundsNoTrail.setFromTransformedAabb(this.localBounds, this.localSpace ? Mat4.IDENTITY : this.node.getWorldTransform());
    this.worldBoundsTrail[0].copy(this.worldBoundsNoTrail);
    this.worldBoundsTrail[1].copy(this.worldBoundsNoTrail);
    this.worldBounds.copy(this.worldBoundsTrail[0]);
    this.worldBoundsSize.copy(this.worldBounds.halfExtents).mulScalar(2);
    this.prevWorldBoundsSize.copy(this.worldBoundsSize);
    this.prevWorldBoundsCenter.copy(this.worldBounds.center);
    this.simTimeTotal = 0;
    this.timeToSwitchBounds = 0;
  }
  calculateLocalBounds() {
    let minx = Number.MAX_VALUE;
    let miny = Number.MAX_VALUE;
    let minz = Number.MAX_VALUE;
    let maxx = -Number.MAX_VALUE;
    let maxy = -Number.MAX_VALUE;
    let maxz = -Number.MAX_VALUE;
    let maxR = 0;
    let maxScale = 0;
    const stepWeight = this.lifetime / this.precision;
    const wVels = [this.qVelocity, this.qVelocity2];
    const lVels = [this.qLocalVelocity, this.qLocalVelocity2];
    const accumX = [0, 0];
    const accumY = [0, 0];
    const accumZ = [0, 0];
    const accumR = [0, 0];
    const accumW = [0, 0];
    let x, y, z;
    for (let i = 0; i < this.precision + 1; i++) {
      // take extra step to prevent position glitches
      const index = Math.min(i, this.precision - 1);
      for (let j = 0; j < 2; j++) {
        x = lVels[j][index * 3 + 0] * stepWeight + accumX[j];
        y = lVels[j][index * 3 + 1] * stepWeight + accumY[j];
        z = lVels[j][index * 3 + 2] * stepWeight + accumZ[j];
        minx = Math.min(x, minx);
        miny = Math.min(y, miny);
        minz = Math.min(z, minz);
        maxx = Math.max(x, maxx);
        maxy = Math.max(y, maxy);
        maxz = Math.max(z, maxz);
        accumX[j] = x;
        accumY[j] = y;
        accumZ[j] = z;
      }
      for (let j = 0; j < 2; j++) {
        accumW[j] += stepWeight * Math.sqrt(wVels[j][index * 3 + 0] * wVels[j][index * 3 + 0] + wVels[j][index * 3 + 1] * wVels[j][index * 3 + 1] + wVels[j][index * 3 + 2] * wVels[j][index * 3 + 2]);
      }
      accumR[0] += this.qRadialSpeed[index] * stepWeight;
      accumR[1] += this.qRadialSpeed2[index] * stepWeight;
      maxR = Math.max(maxR, Math.max(Math.abs(accumR[0]), Math.abs(accumR[1])));
      maxScale = Math.max(maxScale, this.qScale[index]);
    }
    if (this.emitterShape === EMITTERSHAPE_BOX) {
      x = this.emitterExtents.x * 0.5;
      y = this.emitterExtents.y * 0.5;
      z = this.emitterExtents.z * 0.5;
    } else {
      x = this.emitterRadius;
      y = this.emitterRadius;
      z = this.emitterRadius;
    }
    const w = Math.max(accumW[0], accumW[1]);
    bMin.x = minx - maxScale - x - maxR - w;
    bMin.y = miny - maxScale - y - maxR - w;
    bMin.z = minz - maxScale - z - maxR - w;
    bMax.x = maxx + maxScale + x + maxR + w;
    bMax.y = maxy + maxScale + y + maxR + w;
    bMax.z = maxz + maxScale + z + maxR + w;
    this.localBounds.setMinMax(bMin, bMax);
  }
  rebuild() {
    const gd = this.graphicsDevice;
    if (this.colorMap === null) this.colorMap = this.defaultParamTexture;
    this.spawnBounds = this.emitterShape === EMITTERSHAPE_BOX ? this.emitterExtents : this.emitterRadius;
    this.useCpu = this.useCpu || this.sort > PARTICLESORT_NONE ||
    // force CPU if desirable by user or sorting is enabled
    gd.maxVertexTextures <= 1 ||
    // force CPU if can't use enough vertex textures
    gd.fragmentUniformsCount < 64 ||
    // force CPU if can't use many uniforms; TODO: change to more realistic value (this one is iphone's)
    gd.forceCpuParticles || !gd.extTextureFloat; // no float texture extension

    this._destroyResources();
    this.pack8 = (this.pack8 || !gd.textureFloatRenderable) && !this.useCpu;
    particleTexHeight = this.useCpu || this.pack8 ? 4 : 2;
    this.useMesh = false;
    if (this.mesh) {
      const totalVertCount = this.numParticles * this.mesh.vertexBuffer.numVertices;
      if (totalVertCount > 65535) {
        Debug.warn('WARNING: particle system can\'t render mesh particles because numParticles * numVertices is more than 65k. Reverting to quad particles.');
      } else {
        this.useMesh = true;
      }
    }
    this.numParticlesPot = math.nextPowerOfTwo(this.numParticles);
    this.rebuildGraphs();
    this.calculateLocalBounds();
    this.resetWorldBounds();
    if (this.node) {
      // this.prevPos.copy(this.node.getPosition());
      this.worldBounds.setFromTransformedAabb(this.localBounds, this.localSpace ? Mat4.IDENTITY : this.node.getWorldTransform());
      this.worldBoundsTrail[0].copy(this.worldBounds);
      this.worldBoundsTrail[1].copy(this.worldBounds);
      this.worldBoundsSize.copy(this.worldBounds.halfExtents).mulScalar(2);
      this.prevWorldBoundsSize.copy(this.worldBoundsSize);
      this.prevWorldBoundsCenter.copy(this.worldBounds.center);
      if (this.pack8) this.calculateBoundsMad();
    }

    // Dynamic simulation data
    this.vbToSort = new Array(this.numParticles);
    for (let iSort = 0; iSort < this.numParticles; iSort++) this.vbToSort[iSort] = [0, 0];
    this.particleDistance = new Float32Array(this.numParticles);
    this._gpuUpdater.randomize();
    this.particleTex = new Float32Array(this.numParticlesPot * particleTexHeight * particleTexChannels);
    const emitterPos = this.node === null || this.localSpace ? Vec3.ZERO : this.node.getPosition();
    if (this.emitterShape === EMITTERSHAPE_BOX) {
      if (this.node === null || this.localSpace) {
        spawnMatrix.setTRS(Vec3.ZERO, Quat.IDENTITY, this.spawnBounds);
      } else {
        spawnMatrix.setTRS(Vec3.ZERO, this.node.getRotation(), tmpVec3.copy(this.spawnBounds).mul(this.node.localScale));
      }
      extentsInnerRatioUniform[0] = this.emitterExtents.x !== 0 ? this.emitterExtentsInner.x / this.emitterExtents.x : 0;
      extentsInnerRatioUniform[1] = this.emitterExtents.y !== 0 ? this.emitterExtentsInner.y / this.emitterExtents.y : 0;
      extentsInnerRatioUniform[2] = this.emitterExtents.z !== 0 ? this.emitterExtentsInner.z / this.emitterExtents.z : 0;
    }
    for (let i = 0; i < this.numParticles; i++) {
      this._cpuUpdater.calcSpawnPosition(this.particleTex, spawnMatrix, extentsInnerRatioUniform, emitterPos, i);
      if (this.useCpu) this.particleTex[i * particleTexChannels + 3 + this.numParticlesPot * 2 * particleTexChannels] = 1; // hide/show
    }

    this.particleTexStart = new Float32Array(this.numParticlesPot * particleTexHeight * particleTexChannels);
    for (let i = 0; i < this.particleTexStart.length; i++) {
      this.particleTexStart[i] = this.particleTex[i];
    }
    if (!this.useCpu) {
      if (this.pack8) {
        this.particleTexIN = _createTexture(gd, this.numParticlesPot, particleTexHeight, this.particleTex, PIXELFORMAT_RGBA8, 1, false);
        this.particleTexOUT = _createTexture(gd, this.numParticlesPot, particleTexHeight, this.particleTex, PIXELFORMAT_RGBA8, 1, false);
        this.particleTexStart = _createTexture(gd, this.numParticlesPot, particleTexHeight, this.particleTexStart, PIXELFORMAT_RGBA8, 1, false);
      } else {
        this.particleTexIN = _createTexture(gd, this.numParticlesPot, particleTexHeight, this.particleTex);
        this.particleTexOUT = _createTexture(gd, this.numParticlesPot, particleTexHeight, this.particleTex);
        this.particleTexStart = _createTexture(gd, this.numParticlesPot, particleTexHeight, this.particleTexStart);
      }
      this.rtParticleTexIN = new RenderTarget({
        colorBuffer: this.particleTexIN,
        depth: false
      });
      this.rtParticleTexOUT = new RenderTarget({
        colorBuffer: this.particleTexOUT,
        depth: false
      });
      this.swapTex = false;
    }
    const shaderCodeStart = (this.localSpace ? '#define LOCAL_SPACE\n' : '') + shaderChunks.particleUpdaterInitPS + (this.pack8 ? shaderChunks.particleInputRgba8PS + shaderChunks.particleOutputRgba8PS : shaderChunks.particleInputFloatPS + shaderChunks.particleOutputFloatPS) + (this.emitterShape === EMITTERSHAPE_BOX ? shaderChunks.particleUpdaterAABBPS : shaderChunks.particleUpdaterSpherePS) + shaderChunks.particleUpdaterStartPS;
    const shaderCodeRespawn = shaderCodeStart + shaderChunks.particleUpdaterRespawnPS + shaderChunks.particleUpdaterEndPS;
    const shaderCodeNoRespawn = shaderCodeStart + shaderChunks.particleUpdaterNoRespawnPS + shaderChunks.particleUpdaterEndPS;
    const shaderCodeOnStop = shaderCodeStart + shaderChunks.particleUpdaterOnStopPS + shaderChunks.particleUpdaterEndPS;

    // Note: createShaderFromCode can return a shader from the cache (not a new shader) so we *should not* delete these shaders
    // when the particle emitter is destroyed
    const params = this.emitterShape + '' + this.pack8 + '' + this.localSpace;
    this.shaderParticleUpdateRespawn = createShaderFromCode(gd, shaderChunks.fullscreenQuadVS, shaderCodeRespawn, 'fsQuad0' + params);
    this.shaderParticleUpdateNoRespawn = createShaderFromCode(gd, shaderChunks.fullscreenQuadVS, shaderCodeNoRespawn, 'fsQuad1' + params);
    this.shaderParticleUpdateOnStop = createShaderFromCode(gd, shaderChunks.fullscreenQuadVS, shaderCodeOnStop, 'fsQuad2' + params);
    this.numParticleVerts = this.useMesh ? this.mesh.vertexBuffer.numVertices : 4;
    this.numParticleIndices = this.useMesh ? this.mesh.indexBuffer[0].numIndices : 6;
    this._allocate(this.numParticles);
    const mesh = new Mesh(gd);
    mesh.vertexBuffer = this.vertexBuffer;
    mesh.indexBuffer[0] = this.indexBuffer;
    mesh.primitive[0].type = PRIMITIVE_TRIANGLES;
    mesh.primitive[0].base = 0;
    mesh.primitive[0].count = this.numParticles * this.numParticleIndices;
    mesh.primitive[0].indexed = true;
    this.material = new Material();
    this.material.name = this.node.name;
    this.material.cull = CULLFACE_NONE;
    this.material.alphaWrite = false;
    this.material.blendType = this.blendType;
    this.material.depthWrite = this.depthWrite;
    this.material.emitter = this;
    this.regenShader();
    this.resetMaterial();
    const wasVisible = this.meshInstance ? this.meshInstance.visible : true;
    this.meshInstance = new MeshInstance(mesh, this.material, this.node);
    this.meshInstance.pick = false;
    this.meshInstance.updateKey(); // shouldn't be here?
    this.meshInstance.cull = true;
    this.meshInstance._noDepthDrawGl1 = true;
    if (this.localSpace) {
      this.meshInstance.aabb.setFromTransformedAabb(this.worldBounds, this.node.getWorldTransform());
    } else {
      this.meshInstance.aabb.copy(this.worldBounds);
    }
    this.meshInstance._updateAabb = false;
    this.meshInstance.visible = wasVisible;
    this._initializeTextures();
    this.resetTime();
    this.addTime(0, false); // fill dynamic textures and constants with initial data
    if (this.preWarm) this.prewarm(this.lifetime);
  }
  _isAnimated() {
    return this.animNumFrames >= 1 && (this.animTilesX > 1 || this.animTilesY > 1) && (this.colorMap && this.colorMap !== this.defaultParamTexture || this.normalMap);
  }
  rebuildGraphs() {
    const precision = this.precision;
    const gd = this.graphicsDevice;
    this.qLocalVelocity = this.localVelocityGraph.quantize(precision);
    this.qVelocity = this.velocityGraph.quantize(precision);
    this.qColor = this.colorGraph.quantizeClamped(precision, 0, 1);
    this.qRotSpeed = this.rotationSpeedGraph.quantize(precision);
    this.qScale = this.scaleGraph.quantize(precision);
    this.qAlpha = this.alphaGraph.quantize(precision);
    this.qRadialSpeed = this.radialSpeedGraph.quantize(precision);
    this.qLocalVelocity2 = this.localVelocityGraph2.quantize(precision);
    this.qVelocity2 = this.velocityGraph2.quantize(precision);
    this.qColor2 = this.colorGraph2.quantizeClamped(precision, 0, 1);
    this.qRotSpeed2 = this.rotationSpeedGraph2.quantize(precision);
    this.qScale2 = this.scaleGraph2.quantize(precision);
    this.qAlpha2 = this.alphaGraph2.quantize(precision);
    this.qRadialSpeed2 = this.radialSpeedGraph2.quantize(precision);
    for (let i = 0; i < precision; i++) {
      this.qRotSpeed[i] *= math.DEG_TO_RAD;
      this.qRotSpeed2[i] *= math.DEG_TO_RAD;
    }
    this.localVelocityUMax = new Float32Array(3);
    this.velocityUMax = new Float32Array(3);
    this.colorUMax = new Float32Array(3);
    this.rotSpeedUMax = [0];
    this.scaleUMax = [0];
    this.alphaUMax = [0];
    this.radialSpeedUMax = [0];
    this.qLocalVelocityDiv = divGraphFrom2Curves(this.qLocalVelocity, this.qLocalVelocity2, this.localVelocityUMax);
    this.qVelocityDiv = divGraphFrom2Curves(this.qVelocity, this.qVelocity2, this.velocityUMax);
    this.qColorDiv = divGraphFrom2Curves(this.qColor, this.qColor2, this.colorUMax);
    this.qRotSpeedDiv = divGraphFrom2Curves(this.qRotSpeed, this.qRotSpeed2, this.rotSpeedUMax);
    this.qScaleDiv = divGraphFrom2Curves(this.qScale, this.qScale2, this.scaleUMax);
    this.qAlphaDiv = divGraphFrom2Curves(this.qAlpha, this.qAlpha2, this.alphaUMax);
    this.qRadialSpeedDiv = divGraphFrom2Curves(this.qRadialSpeed, this.qRadialSpeed2, this.radialSpeedUMax);
    if (this.pack8) {
      const umax = [0, 0, 0];
      maxUnsignedGraphValue(this.qVelocity, umax);
      const umax2 = [0, 0, 0];
      maxUnsignedGraphValue(this.qVelocity2, umax2);
      const lumax = [0, 0, 0];
      maxUnsignedGraphValue(this.qLocalVelocity, lumax);
      const lumax2 = [0, 0, 0];
      maxUnsignedGraphValue(this.qLocalVelocity2, lumax2);
      const rumax = [0];
      maxUnsignedGraphValue(this.qRadialSpeed, rumax);
      const rumax2 = [0];
      maxUnsignedGraphValue(this.qRadialSpeed2, rumax2);
      let maxVel = Math.max(umax[0], umax2[0]);
      maxVel = Math.max(maxVel, umax[1]);
      maxVel = Math.max(maxVel, umax2[1]);
      maxVel = Math.max(maxVel, umax[2]);
      maxVel = Math.max(maxVel, umax2[2]);
      let lmaxVel = Math.max(lumax[0], lumax2[0]);
      lmaxVel = Math.max(lmaxVel, lumax[1]);
      lmaxVel = Math.max(lmaxVel, lumax2[1]);
      lmaxVel = Math.max(lmaxVel, lumax[2]);
      lmaxVel = Math.max(lmaxVel, lumax2[2]);
      const maxRad = Math.max(rumax[0], rumax2[0]);
      this.maxVel = maxVel + lmaxVel + maxRad;
    }
    if (!this.useCpu) {
      this.internalTex0 = _createTexture(gd, precision, 1, packTextureXYZ_NXYZ(this.qLocalVelocity, this.qLocalVelocityDiv));
      this.internalTex1 = _createTexture(gd, precision, 1, packTextureXYZ_NXYZ(this.qVelocity, this.qVelocityDiv));
      this.internalTex2 = _createTexture(gd, precision, 1, packTexture5Floats(this.qRotSpeed, this.qScale, this.qScaleDiv, this.qRotSpeedDiv, this.qAlphaDiv));
      this.internalTex3 = _createTexture(gd, precision, 1, packTexture2Floats(this.qRadialSpeed, this.qRadialSpeedDiv));
    }
    this.colorParam = _createTexture(gd, precision, 1, packTextureRGBA(this.qColor, this.qAlpha), PIXELFORMAT_RGBA8, 1.0, true);
  }
  _initializeTextures() {
    if (this.colorMap) {
      this.material.setParameter('colorMap', this.colorMap);
      if (this.lighting && this.normalMap) {
        this.material.setParameter('normalMap', this.normalMap);
      }
    }
  }
  regenShader() {
    const programLib = getProgramLibrary(this.graphicsDevice);
    programLib.register('particle', particle);
    const hasNormal = this.normalMap !== null;
    this.normalOption = 0;
    if (this.lighting) {
      this.normalOption = hasNormal ? 2 : 1;
    }
    // getShaderVariant is also called by pc.Scene when all shaders need to be updated
    this.material.getShaderVariant = function (dev, sc, defs, unused, pass, sortedLights, viewUniformFormat, viewBindGroupFormat) {
      // The app works like this:
      // 1. Emitter init
      // 2. Update. No camera is assigned to emitters
      // 3. Render; activeCamera = camera; shader init
      // 4. Update. activeCamera is set to emitters
      // -----
      // The problem with 1st frame render is that we init the shader without having any camera set to emitter -
      // so wrong shader is being compiled.
      // To fix it, we need to check activeCamera!=emitter.camera in shader init too
      if (this.emitter.scene) {
        if (this.emitter.camera !== this.emitter.scene._activeCamera) {
          this.emitter.camera = this.emitter.scene._activeCamera;
          this.emitter.onChangeCamera();
        }
      }

      // set by Editor if running inside editor
      const inTools = this.emitter.inTools;
      const processingOptions = new ShaderProcessorOptions(viewUniformFormat, viewBindGroupFormat);
      const shader = programLib.getProgram('particle', {
        pass: SHADER_FORWARD,
        useCpu: this.emitter.useCpu,
        normal: this.emitter.normalOption,
        halflambert: this.emitter.halfLambert,
        stretch: this.emitter.stretch,
        alignToMotion: this.emitter.alignToMotion,
        soft: this.emitter.depthSoftening,
        mesh: this.emitter.useMesh,
        gamma: this.emitter.scene ? this.emitter.scene.gammaCorrection : 0,
        toneMap: this.emitter.scene ? this.emitter.scene.toneMapping : 0,
        fog: this.emitter.scene && !this.emitter.noFog ? this.emitter.scene.fog : 'none',
        wrap: this.emitter.wrap && this.emitter.wrapBounds,
        localSpace: this.emitter.localSpace,
        // in Editor, screen space particles (children of 2D Screen) are still rendered in 3d space
        screenSpace: inTools ? false : this.emitter.screenSpace,
        blend: this.blendType,
        animTex: this.emitter._isAnimated(),
        animTexLoop: this.emitter.animLoop,
        pack8: this.emitter.pack8,
        customFace: this.emitter.orientation !== PARTICLEORIENTATION_SCREEN
      }, processingOptions);
      return shader;
    };
    this.material.shader = this.material.getShaderVariant();
  }
  resetMaterial() {
    const material = this.material;
    material.setParameter('stretch', this.stretch);
    if (this._isAnimated()) {
      material.setParameter('animTexTilesParams', this.animTilesParams);
      material.setParameter('animTexParams', this.animParams);
      material.setParameter('animTexIndexParams', this.animIndexParams);
    }
    material.setParameter('colorMult', this.intensity);
    if (!this.useCpu) {
      material.setParameter('internalTex0', this.internalTex0);
      material.setParameter('internalTex1', this.internalTex1);
      material.setParameter('internalTex2', this.internalTex2);
      material.setParameter('internalTex3', this.internalTex3);
    }
    material.setParameter('colorParam', this.colorParam);
    material.setParameter('numParticles', this.numParticles);
    material.setParameter('numParticlesPot', this.numParticlesPot);
    material.setParameter('lifetime', this.lifetime);
    material.setParameter('rate', this.rate);
    material.setParameter('rateDiv', this.rate2 - this.rate);
    material.setParameter('seed', this.seed);
    material.setParameter('scaleDivMult', this.scaleUMax[0]);
    material.setParameter('alphaDivMult', this.alphaUMax[0]);
    material.setParameter('radialSpeedDivMult', this.radialSpeedUMax[0]);
    material.setParameter('graphNumSamples', this.precision);
    material.setParameter('graphSampleSize', 1.0 / this.precision);
    material.setParameter('emitterScale', new Float32Array([1, 1, 1]));
    if (this.pack8) {
      this._gpuUpdater._setInputBounds();
      material.setParameter('inBoundsSize', this._gpuUpdater.inBoundsSizeUniform);
      material.setParameter('inBoundsCenter', this._gpuUpdater.inBoundsCenterUniform);
      material.setParameter('maxVel', this.maxVel);
    }
    if (this.wrap && this.wrapBounds) {
      this.wrapBoundsUniform[0] = this.wrapBounds.x;
      this.wrapBoundsUniform[1] = this.wrapBounds.y;
      this.wrapBoundsUniform[2] = this.wrapBounds.z;
      material.setParameter('wrapBounds', this.wrapBoundsUniform);
    }
    if (this.colorMap) {
      material.setParameter('colorMap', this.colorMap);
    }
    if (this.lighting) {
      if (this.normalMap) {
        material.setParameter('normalMap', this.normalMap);
      }
    }
    if (this.depthSoftening > 0) {
      material.setParameter('softening', 1.0 / (this.depthSoftening * this.depthSoftening * 100)); // remap to more perceptually linear
    }

    if (this.stretch > 0.0) material.cull = CULLFACE_NONE;
    this._compParticleFaceParams();
  }
  _compParticleFaceParams() {
    let tangent, binormal;
    if (this.orientation === PARTICLEORIENTATION_SCREEN) {
      tangent = new Float32Array([1, 0, 0]);
      binormal = new Float32Array([0, 0, 1]);
    } else {
      let n;
      if (this.orientation === PARTICLEORIENTATION_WORLD) {
        n = this.particleNormal.normalize();
      } else {
        const emitterMat = this.node === null ? Mat4.IDENTITY : this.node.getWorldTransform();
        n = emitterMat.transformVector(this.particleNormal).normalize();
      }
      const t = new Vec3(1, 0, 0);
      if (Math.abs(t.dot(n)) === 1) t.set(0, 0, 1);
      const b = new Vec3().cross(n, t).normalize();
      t.cross(b, n).normalize();
      tangent = new Float32Array([t.x, t.y, t.z]);
      binormal = new Float32Array([b.x, b.y, b.z]);
    }
    this.material.setParameter('faceTangent', tangent);
    this.material.setParameter('faceBinorm', binormal);
  }

  // Declares vertex format, creates VB and IB
  _allocate(numParticles) {
    const psysVertCount = numParticles * this.numParticleVerts;
    const psysIndexCount = numParticles * this.numParticleIndices;
    if (this.vertexBuffer === undefined || this.vertexBuffer.getNumVertices() !== psysVertCount) {
      // Create the particle vertex format
      if (!this.useCpu) {
        // GPU: XYZ = quad vertex position; W = INT: particle ID, FRAC: random factor
        const elements = [{
          semantic: SEMANTIC_ATTR0,
          components: 4,
          type: TYPE_FLOAT32
        }];
        if (this.useMesh) {
          elements.push({
            semantic: SEMANTIC_ATTR1,
            components: 2,
            type: TYPE_FLOAT32
          });
        }
        const particleFormat = new VertexFormat(this.graphicsDevice, elements);
        this.vertexBuffer = new VertexBuffer(this.graphicsDevice, particleFormat, psysVertCount, BUFFER_DYNAMIC);
        this.indexBuffer = new IndexBuffer(this.graphicsDevice, INDEXFORMAT_UINT16, psysIndexCount);
      } else {
        const elements = [{
          semantic: SEMANTIC_ATTR0,
          components: 4,
          type: TYPE_FLOAT32
        }, {
          semantic: SEMANTIC_ATTR1,
          components: 4,
          type: TYPE_FLOAT32
        }, {
          semantic: SEMANTIC_ATTR2,
          components: 4,
          type: TYPE_FLOAT32
        }, {
          semantic: SEMANTIC_ATTR3,
          components: 1,
          type: TYPE_FLOAT32
        }, {
          semantic: SEMANTIC_ATTR4,
          components: this.useMesh ? 4 : 2,
          type: TYPE_FLOAT32
        }];
        const particleFormat = new VertexFormat(this.graphicsDevice, elements);
        this.vertexBuffer = new VertexBuffer(this.graphicsDevice, particleFormat, psysVertCount, BUFFER_DYNAMIC);
        this.indexBuffer = new IndexBuffer(this.graphicsDevice, INDEXFORMAT_UINT16, psysIndexCount);
      }

      // Fill the vertex buffer
      const data = new Float32Array(this.vertexBuffer.lock());
      let meshData, stride, texCoordOffset;
      if (this.useMesh) {
        meshData = new Float32Array(this.mesh.vertexBuffer.lock());
        stride = meshData.length / this.mesh.vertexBuffer.numVertices;
        for (let elem = 0; elem < this.mesh.vertexBuffer.format.elements.length; elem++) {
          if (this.mesh.vertexBuffer.format.elements[elem].name === SEMANTIC_TEXCOORD0) {
            texCoordOffset = this.mesh.vertexBuffer.format.elements[elem].offset / 4;
            break;
          }
        }
      }
      for (let i = 0; i < psysVertCount; i++) {
        const id = Math.floor(i / this.numParticleVerts);
        if (!this.useMesh) {
          const vertID = i % 4;
          data[i * 4] = particleVerts[vertID][0];
          data[i * 4 + 1] = particleVerts[vertID][1];
          data[i * 4 + 2] = 0;
          data[i * 4 + 3] = id;
        } else {
          const vert = i % this.numParticleVerts;
          data[i * 6] = meshData[vert * stride];
          data[i * 6 + 1] = meshData[vert * stride + 1];
          data[i * 6 + 2] = meshData[vert * stride + 2];
          data[i * 6 + 3] = id;
          data[i * 6 + 4] = meshData[vert * stride + texCoordOffset + 0];
          data[i * 6 + 5] = 1.0 - meshData[vert * stride + texCoordOffset + 1];
        }
      }
      if (this.useCpu) {
        this.vbCPU = new Float32Array(data);
        this.vbOld = new Float32Array(this.vbCPU.length);
      }
      this.vertexBuffer.unlock();
      if (this.useMesh) {
        this.mesh.vertexBuffer.unlock();
      }

      // Fill the index buffer
      let dst = 0;
      const indices = new Uint16Array(this.indexBuffer.lock());
      if (this.useMesh) meshData = new Uint16Array(this.mesh.indexBuffer[0].lock());
      for (let i = 0; i < numParticles; i++) {
        if (!this.useMesh) {
          const baseIndex = i * 4;
          indices[dst++] = baseIndex;
          indices[dst++] = baseIndex + 1;
          indices[dst++] = baseIndex + 2;
          indices[dst++] = baseIndex;
          indices[dst++] = baseIndex + 2;
          indices[dst++] = baseIndex + 3;
        } else {
          for (let j = 0; j < this.numParticleIndices; j++) {
            indices[i * this.numParticleIndices + j] = meshData[j] + i * this.numParticleVerts;
          }
        }
      }
      this.indexBuffer.unlock();
      if (this.useMesh) this.mesh.indexBuffer[0].unlock();
    }
  }
  reset() {
    this.beenReset = true;
    this.seed = Math.random();
    this.material.setParameter('seed', this.seed);
    if (this.useCpu) {
      for (let i = 0; i < this.particleTexStart.length; i++) {
        this.particleTex[i] = this.particleTexStart[i];
      }
    } else {
      this._initializeTextures();
    }
    this.resetWorldBounds();
    this.resetTime();
    const origLoop = this.loop;
    this.loop = true;
    this.addTime(0, false);
    this.loop = origLoop;
    if (this.preWarm) {
      this.prewarm(this.lifetime);
    }
  }
  prewarm(time) {
    const lifetimeFraction = time / this.lifetime;
    const iterations = Math.min(Math.floor(lifetimeFraction * this.precision), this.precision);
    const stepDelta = time / iterations;
    for (let i = 0; i < iterations; i++) {
      this.addTime(stepDelta, false);
    }
  }
  resetTime() {
    this.endTime = calcEndTime(this);
  }
  finishFrame() {
    if (this.useCpu) this.vertexBuffer.unlock();
  }
  addTime(delta, isOnStop) {
    const device = this.graphicsDevice;
    const startTime = now();
    this.simTimeTotal += delta;
    this.calculateWorldBounds();
    if (this._isAnimated()) {
      const tilesParams = this.animTilesParams;
      tilesParams[0] = 1.0 / this.animTilesX; // animTexTilesParams.x
      tilesParams[1] = 1.0 / this.animTilesY; // animTexTilesParams.y

      const params = this.animParams;
      params[0] = this.animStartFrame; // animTexParams.x
      params[1] = this.animNumFrames * this.animSpeed; // animTexParams.y
      params[2] = this.animNumFrames - 1; // animTexParams.z
      params[3] = this.animNumAnimations - 1; // animTexParams.w

      const animIndexParams = this.animIndexParams;
      animIndexParams[0] = this.animIndex; // animTexIndexParams.x
      animIndexParams[1] = this.randomizeAnimIndex; // animTexIndexParams.y
    }

    if (this.scene) {
      if (this.camera !== this.scene._activeCamera) {
        this.camera = this.scene._activeCamera;
        this.onChangeCamera();
      }
    }
    if (this.emitterShape === EMITTERSHAPE_BOX) {
      extentsInnerRatioUniform[0] = this.emitterExtents.x !== 0 ? this.emitterExtentsInner.x / this.emitterExtents.x : 0;
      extentsInnerRatioUniform[1] = this.emitterExtents.y !== 0 ? this.emitterExtentsInner.y / this.emitterExtents.y : 0;
      extentsInnerRatioUniform[2] = this.emitterExtents.z !== 0 ? this.emitterExtentsInner.z / this.emitterExtents.z : 0;
      if (this.meshInstance.node === null) {
        spawnMatrix.setTRS(Vec3.ZERO, Quat.IDENTITY, this.emitterExtents);
      } else {
        spawnMatrix.setTRS(Vec3.ZERO, this.meshInstance.node.getRotation(), tmpVec3.copy(this.emitterExtents).mul(this.meshInstance.node.localScale));
      }
    }
    let emitterPos;
    const emitterScale = this.meshInstance.node === null ? Vec3.ONE : this.meshInstance.node.localScale;
    this.emitterScaleUniform[0] = emitterScale.x;
    this.emitterScaleUniform[1] = emitterScale.y;
    this.emitterScaleUniform[2] = emitterScale.z;
    this.material.setParameter('emitterScale', this.emitterScaleUniform);
    if (this.localSpace && this.meshInstance.node) {
      emitterPos = this.meshInstance.node.getPosition();
      this.emitterPosUniform[0] = emitterPos.x;
      this.emitterPosUniform[1] = emitterPos.y;
      this.emitterPosUniform[2] = emitterPos.z;
      this.material.setParameter('emitterPos', this.emitterPosUniform);
    }
    this._compParticleFaceParams();
    if (!this.useCpu) {
      this._gpuUpdater.update(device, spawnMatrix, extentsInnerRatioUniform, delta, isOnStop);
    } else {
      const data = new Float32Array(this.vertexBuffer.lock());
      this._cpuUpdater.update(data, this.vbToSort, this.particleTex, spawnMatrix, extentsInnerRatioUniform, emitterPos, delta, isOnStop);
      // this.vertexBuffer.unlock();
    }

    if (!this.loop) {
      if (Date.now() > this.endTime) {
        if (this.onFinished) this.onFinished();
        this.meshInstance.visible = false;
      }
    }
    if (this.meshInstance) {
      this.meshInstance.drawOrder = this.drawOrder;
    }
    this._addTimeTime += now() - startTime;
  }
  _destroyResources() {
    if (this.particleTexIN) {
      this.particleTexIN.destroy();
      this.particleTexIN = null;
    }
    if (this.particleTexOUT) {
      this.particleTexOUT.destroy();
      this.particleTexOUT = null;
    }
    if (this.particleTexStart && this.particleTexStart.destroy) {
      this.particleTexStart.destroy();
      this.particleTexStart = null;
    }
    if (this.rtParticleTexIN) {
      this.rtParticleTexIN.destroy();
      this.rtParticleTexIN = null;
    }
    if (this.rtParticleTexOUT) {
      this.rtParticleTexOUT.destroy();
      this.rtParticleTexOUT = null;
    }
    if (this.internalTex0) {
      this.internalTex0.destroy();
      this.internalTex0 = null;
    }
    if (this.internalTex1) {
      this.internalTex1.destroy();
      this.internalTex1 = null;
    }
    if (this.internalTex2) {
      this.internalTex2.destroy();
      this.internalTex2 = null;
    }
    if (this.internalTex3) {
      this.internalTex3.destroy();
      this.internalTex3 = null;
    }
    if (this.colorParam) {
      this.colorParam.destroy();
      this.colorParam = null;
    }
    if (this.vertexBuffer) {
      this.vertexBuffer.destroy();
      this.vertexBuffer = undefined; // we are testing if vb is undefined in some code, no idea why
    }

    if (this.indexBuffer) {
      this.indexBuffer.destroy();
      this.indexBuffer = undefined;
    }
    if (this.material) {
      this.material.destroy();
      this.material = null;
    }

    // note: shaders should not be destroyed as they could be shared between emitters
  }

  destroy() {
    this.camera = null;
    this._destroyResources();
  }
}

export { ParticleEmitter };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGFydGljbGUtZW1pdHRlci5qcyIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL3NjZW5lL3BhcnRpY2xlLXN5c3RlbS9wYXJ0aWNsZS1lbWl0dGVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IERlYnVnIH0gZnJvbSAnLi4vLi4vY29yZS9kZWJ1Zy5qcyc7XG5pbXBvcnQgeyBub3cgfSBmcm9tICcuLi8uLi9jb3JlL3RpbWUuanMnO1xuaW1wb3J0IHsgQ3VydmUgfSBmcm9tICcuLi8uLi9jb3JlL21hdGgvY3VydmUuanMnO1xuaW1wb3J0IHsgQ3VydmVTZXQgfSBmcm9tICcuLi8uLi9jb3JlL21hdGgvY3VydmUtc2V0LmpzJztcbmltcG9ydCB7IE1hdDQgfSBmcm9tICcuLi8uLi9jb3JlL21hdGgvbWF0NC5qcyc7XG5pbXBvcnQgeyBtYXRoIH0gZnJvbSAnLi4vLi4vY29yZS9tYXRoL21hdGguanMnO1xuaW1wb3J0IHsgUXVhdCB9IGZyb20gJy4uLy4uL2NvcmUvbWF0aC9xdWF0LmpzJztcbmltcG9ydCB7IFZlYzMgfSBmcm9tICcuLi8uLi9jb3JlL21hdGgvdmVjMy5qcyc7XG5pbXBvcnQgeyBCb3VuZGluZ0JveCB9IGZyb20gJy4uLy4uL2NvcmUvc2hhcGUvYm91bmRpbmctYm94LmpzJztcblxuaW1wb3J0IHtcbiAgICBBRERSRVNTX0NMQU1QX1RPX0VER0UsXG4gICAgQlVGRkVSX0RZTkFNSUMsXG4gICAgQ1VMTEZBQ0VfTk9ORSxcbiAgICBGSUxURVJfTElORUFSLCBGSUxURVJfTkVBUkVTVCxcbiAgICBJTkRFWEZPUk1BVF9VSU5UMTYsXG4gICAgUElYRUxGT1JNQVRfUkdCQTgsIFBJWEVMRk9STUFUX1JHQkEzMkYsXG4gICAgUFJJTUlUSVZFX1RSSUFOR0xFUyxcbiAgICBTRU1BTlRJQ19BVFRSMCwgU0VNQU5USUNfQVRUUjEsIFNFTUFOVElDX0FUVFIyLCBTRU1BTlRJQ19BVFRSMywgU0VNQU5USUNfQVRUUjQsIFNFTUFOVElDX1RFWENPT1JEMCxcbiAgICBUWVBFX0ZMT0FUMzJcbn0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vZ3JhcGhpY3MvY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IERldmljZUNhY2hlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vZ3JhcGhpY3MvZGV2aWNlLWNhY2hlLmpzJztcbmltcG9ydCB7IEluZGV4QnVmZmVyIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vZ3JhcGhpY3MvaW5kZXgtYnVmZmVyLmpzJztcbmltcG9ydCB7IFJlbmRlclRhcmdldCB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2dyYXBoaWNzL3JlbmRlci10YXJnZXQuanMnO1xuaW1wb3J0IHsgVGV4dHVyZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2dyYXBoaWNzL3RleHR1cmUuanMnO1xuaW1wb3J0IHsgVmVydGV4QnVmZmVyIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vZ3JhcGhpY3MvdmVydGV4LWJ1ZmZlci5qcyc7XG5pbXBvcnQgeyBWZXJ0ZXhGb3JtYXQgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9ncmFwaGljcy92ZXJ0ZXgtZm9ybWF0LmpzJztcbmltcG9ydCB7IFNoYWRlclByb2Nlc3Nvck9wdGlvbnMgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9ncmFwaGljcy9zaGFkZXItcHJvY2Vzc29yLW9wdGlvbnMuanMnO1xuXG5pbXBvcnQge1xuICAgIEJMRU5EX05PUk1BTCxcbiAgICBFTUlUVEVSU0hBUEVfQk9YLFxuICAgIFBBUlRJQ0xFTU9ERV9HUFUsXG4gICAgUEFSVElDTEVPUklFTlRBVElPTl9TQ1JFRU4sIFBBUlRJQ0xFT1JJRU5UQVRJT05fV09STEQsXG4gICAgUEFSVElDTEVTT1JUX05PTkUsXG4gICAgU0hBREVSX0ZPUldBUkRcbn0gZnJvbSAnLi4vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IE1lc2ggfSBmcm9tICcuLi9tZXNoLmpzJztcbmltcG9ydCB7IE1lc2hJbnN0YW5jZSB9IGZyb20gJy4uL21lc2gtaW5zdGFuY2UuanMnO1xuaW1wb3J0IHsgTWF0ZXJpYWwgfSBmcm9tICcuLi9tYXRlcmlhbHMvbWF0ZXJpYWwuanMnO1xuaW1wb3J0IHsgZ2V0UHJvZ3JhbUxpYnJhcnkgfSBmcm9tICcuLi9zaGFkZXItbGliL2dldC1wcm9ncmFtLWxpYnJhcnkuanMnO1xuaW1wb3J0IHsgY3JlYXRlU2hhZGVyRnJvbUNvZGUgfSBmcm9tICcuLi9zaGFkZXItbGliL3V0aWxzLmpzJztcbmltcG9ydCB7IHNoYWRlckNodW5rcyB9IGZyb20gJy4uL3NoYWRlci1saWIvY2h1bmtzL2NodW5rcy5qcyc7XG5pbXBvcnQgeyBwYXJ0aWNsZSB9IGZyb20gJy4uL3NoYWRlci1saWIvcHJvZ3JhbXMvcGFydGljbGUuanMnO1xuaW1wb3J0IHsgUGFydGljbGVDUFVVcGRhdGVyIH0gZnJvbSAnLi9jcHUtdXBkYXRlci5qcyc7XG5pbXBvcnQgeyBQYXJ0aWNsZUdQVVVwZGF0ZXIgfSBmcm9tICcuL2dwdS11cGRhdGVyLmpzJztcblxuY29uc3QgcGFydGljbGVWZXJ0cyA9IFtcbiAgICBbLTEsIC0xXSxcbiAgICBbMSwgLTFdLFxuICAgIFsxLCAxXSxcbiAgICBbLTEsIDFdXG5dO1xuXG5mdW5jdGlvbiBfY3JlYXRlVGV4dHVyZShkZXZpY2UsIHdpZHRoLCBoZWlnaHQsIHBpeGVsRGF0YSwgZm9ybWF0ID0gUElYRUxGT1JNQVRfUkdCQTMyRiwgbXVsdDhCaXQsIGZpbHRlcikge1xuXG4gICAgbGV0IG1pcEZpbHRlciA9IEZJTFRFUl9ORUFSRVNUO1xuICAgIGlmIChmaWx0ZXIgJiYgZm9ybWF0ID09PSBQSVhFTEZPUk1BVF9SR0JBOClcbiAgICAgICAgbWlwRmlsdGVyID0gRklMVEVSX0xJTkVBUjtcblxuICAgIGNvbnN0IHRleHR1cmUgPSBuZXcgVGV4dHVyZShkZXZpY2UsIHtcbiAgICAgICAgd2lkdGg6IHdpZHRoLFxuICAgICAgICBoZWlnaHQ6IGhlaWdodCxcbiAgICAgICAgZm9ybWF0OiBmb3JtYXQsXG4gICAgICAgIGN1YmVtYXA6IGZhbHNlLFxuICAgICAgICBtaXBtYXBzOiBmYWxzZSxcbiAgICAgICAgbWluRmlsdGVyOiBtaXBGaWx0ZXIsXG4gICAgICAgIG1hZ0ZpbHRlcjogbWlwRmlsdGVyLFxuICAgICAgICBhZGRyZXNzVTogQUREUkVTU19DTEFNUF9UT19FREdFLFxuICAgICAgICBhZGRyZXNzVjogQUREUkVTU19DTEFNUF9UT19FREdFLFxuICAgICAgICBuYW1lOiAnUGFydGljbGVTeXN0ZW1UZXh0dXJlJ1xuICAgIH0pO1xuXG4gICAgY29uc3QgcGl4ZWxzID0gdGV4dHVyZS5sb2NrKCk7XG5cbiAgICBpZiAoZm9ybWF0ID09PSBQSVhFTEZPUk1BVF9SR0JBOCkge1xuICAgICAgICBjb25zdCB0ZW1wID0gbmV3IFVpbnQ4QXJyYXkocGl4ZWxEYXRhLmxlbmd0aCk7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcGl4ZWxEYXRhLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB0ZW1wW2ldID0gcGl4ZWxEYXRhW2ldICogbXVsdDhCaXQgKiAyNTU7XG4gICAgICAgIH1cbiAgICAgICAgcGl4ZWxEYXRhID0gdGVtcDtcbiAgICB9XG5cbiAgICBwaXhlbHMuc2V0KHBpeGVsRGF0YSk7XG5cbiAgICB0ZXh0dXJlLnVubG9jaygpO1xuXG4gICAgcmV0dXJuIHRleHR1cmU7XG59XG5cbmZ1bmN0aW9uIHNhdHVyYXRlKHgpIHtcbiAgICByZXR1cm4gTWF0aC5tYXgoTWF0aC5taW4oeCwgMSksIDApO1xufVxuXG5jb25zdCBkZWZhdWx0MEN1cnZlID0gbmV3IEN1cnZlKFswLCAwLCAxLCAwXSk7XG5jb25zdCBkZWZhdWx0MUN1cnZlID0gbmV3IEN1cnZlKFswLCAxLCAxLCAxXSk7XG5jb25zdCBkZWZhdWx0MEN1cnZlMyA9IG5ldyBDdXJ2ZVNldChbMCwgMCwgMSwgMF0sIFswLCAwLCAxLCAwXSwgWzAsIDAsIDEsIDBdKTtcbmNvbnN0IGRlZmF1bHQxQ3VydmUzID0gbmV3IEN1cnZlU2V0KFswLCAxLCAxLCAxXSwgWzAsIDEsIDEsIDFdLCBbMCwgMSwgMSwgMV0pO1xuXG5sZXQgcGFydGljbGVUZXhIZWlnaHQgPSAyO1xuY29uc3QgcGFydGljbGVUZXhDaGFubmVscyA9IDQ7IC8vIHRoZXJlIGlzIGEgZHVwbGljYXRlIGluIGNwdSB1cGRhdGVyXG5cbmNvbnN0IGV4dGVudHNJbm5lclJhdGlvVW5pZm9ybSA9IG5ldyBGbG9hdDMyQXJyYXkoMyk7XG5jb25zdCBzcGF3bk1hdHJpeCA9IG5ldyBNYXQ0KCk7XG5cbmNvbnN0IHRtcFZlYzMgPSBuZXcgVmVjMygpO1xuY29uc3QgYk1pbiA9IG5ldyBWZWMzKCk7XG5jb25zdCBiTWF4ID0gbmV3IFZlYzMoKTtcblxubGV0IHNldFByb3BlcnR5VGFyZ2V0O1xubGV0IHNldFByb3BlcnR5T3B0aW9ucztcblxuZnVuY3Rpb24gc2V0UHJvcGVydHkocE5hbWUsIGRlZmF1bHRWYWwpIHtcbiAgICBpZiAoc2V0UHJvcGVydHlPcHRpb25zW3BOYW1lXSAhPT0gdW5kZWZpbmVkICYmIHNldFByb3BlcnR5T3B0aW9uc1twTmFtZV0gIT09IG51bGwpIHtcbiAgICAgICAgc2V0UHJvcGVydHlUYXJnZXRbcE5hbWVdID0gc2V0UHJvcGVydHlPcHRpb25zW3BOYW1lXTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBzZXRQcm9wZXJ0eVRhcmdldFtwTmFtZV0gPSBkZWZhdWx0VmFsO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gcGFjazNORmxvYXRzKGEsIGIsIGMpIHtcbiAgICBjb25zdCBwYWNrZWQgPSAoKGEgKiAyNTUpIDw8IDE2KSB8ICgoYiAqIDI1NSkgPDwgOCkgfCAoYyAqIDI1NSk7XG4gICAgcmV0dXJuIChwYWNrZWQpIC8gKDEgPDwgMjQpO1xufVxuXG5mdW5jdGlvbiBwYWNrVGV4dHVyZVhZWl9OWFlaKHFYWVosIHFYWVoyKSB7XG4gICAgY29uc3QgbnVtID0gcVhZWi5sZW5ndGggLyAzO1xuICAgIGNvbnN0IGNvbG9ycyA9IG5ldyBBcnJheShudW0gKiA0KTtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IG51bTsgaSsrKSB7XG4gICAgICAgIGNvbG9yc1tpICogNF0gPSBxWFlaW2kgKiAzXTtcbiAgICAgICAgY29sb3JzW2kgKiA0ICsgMV0gPSBxWFlaW2kgKiAzICsgMV07XG4gICAgICAgIGNvbG9yc1tpICogNCArIDJdID0gcVhZWltpICogMyArIDJdO1xuXG4gICAgICAgIGNvbG9yc1tpICogNCArIDNdID0gcGFjazNORmxvYXRzKHFYWVoyW2kgKiAzXSwgcVhZWjJbaSAqIDMgKyAxXSwgcVhZWjJbaSAqIDMgKyAyXSk7XG4gICAgfVxuICAgIHJldHVybiBjb2xvcnM7XG59XG5cbmZ1bmN0aW9uIHBhY2tUZXh0dXJlUkdCQShxUkdCLCBxQSkge1xuICAgIGNvbnN0IGNvbG9ycyA9IG5ldyBBcnJheShxQS5sZW5ndGggKiA0KTtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHFBLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGNvbG9yc1tpICogNF0gPSBxUkdCW2kgKiAzXTtcbiAgICAgICAgY29sb3JzW2kgKiA0ICsgMV0gPSBxUkdCW2kgKiAzICsgMV07XG4gICAgICAgIGNvbG9yc1tpICogNCArIDJdID0gcVJHQltpICogMyArIDJdO1xuXG4gICAgICAgIGNvbG9yc1tpICogNCArIDNdID0gcUFbaV07XG4gICAgfVxuICAgIHJldHVybiBjb2xvcnM7XG59XG5cbmZ1bmN0aW9uIHBhY2tUZXh0dXJlNUZsb2F0cyhxQSwgcUIsIHFDLCBxRCwgcUUpIHtcbiAgICBjb25zdCBjb2xvcnMgPSBuZXcgQXJyYXkocUEubGVuZ3RoICogNCk7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBxQS5sZW5ndGg7IGkrKykge1xuICAgICAgICBjb2xvcnNbaSAqIDRdID0gcUFbaV07XG4gICAgICAgIGNvbG9yc1tpICogNCArIDFdID0gcUJbaV07XG4gICAgICAgIGNvbG9yc1tpICogNCArIDJdID0gMDtcblxuICAgICAgICBjb2xvcnNbaSAqIDQgKyAzXSA9IHBhY2szTkZsb2F0cyhxQ1tpXSwgcURbaV0sIHFFW2ldKTtcbiAgICB9XG4gICAgcmV0dXJuIGNvbG9ycztcbn1cblxuZnVuY3Rpb24gcGFja1RleHR1cmUyRmxvYXRzKHFBLCBxQikge1xuICAgIGNvbnN0IGNvbG9ycyA9IG5ldyBBcnJheShxQS5sZW5ndGggKiA0KTtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHFBLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGNvbG9yc1tpICogNF0gPSBxQVtpXTtcbiAgICAgICAgY29sb3JzW2kgKiA0ICsgMV0gPSBxQltpXTtcbiAgICAgICAgY29sb3JzW2kgKiA0ICsgMl0gPSAwO1xuICAgICAgICBjb2xvcnNbaSAqIDQgKyAzXSA9IDA7XG4gICAgfVxuICAgIHJldHVybiBjb2xvcnM7XG59XG5cbmZ1bmN0aW9uIGNhbGNFbmRUaW1lKGVtaXR0ZXIpIHtcbiAgICBjb25zdCBpbnRlcnZhbCA9IChNYXRoLm1heChlbWl0dGVyLnJhdGUsIGVtaXR0ZXIucmF0ZTIpICogZW1pdHRlci5udW1QYXJ0aWNsZXMgKyBlbWl0dGVyLmxpZmV0aW1lKTtcbiAgICByZXR1cm4gRGF0ZS5ub3coKSArIGludGVydmFsICogMTAwMDtcbn1cblxuZnVuY3Rpb24gc3ViR3JhcGgoQSwgQikge1xuICAgIGNvbnN0IHIgPSBuZXcgRmxvYXQzMkFycmF5KEEubGVuZ3RoKTtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IEEubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgcltpXSA9IEFbaV0gLSBCW2ldO1xuICAgIH1cbiAgICByZXR1cm4gcjtcbn1cblxuZnVuY3Rpb24gbWF4VW5zaWduZWRHcmFwaFZhbHVlKEEsIG91dFVNYXgpIHtcbiAgICBjb25zdCBjaGFucyA9IG91dFVNYXgubGVuZ3RoO1xuICAgIGNvbnN0IHZhbHVlcyA9IEEubGVuZ3RoIC8gY2hhbnM7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCB2YWx1ZXM7IGkrKykge1xuICAgICAgICBmb3IgKGxldCBqID0gMDsgaiA8IGNoYW5zOyBqKyspIHtcbiAgICAgICAgICAgIGNvbnN0IGEgPSBNYXRoLmFicyhBW2kgKiBjaGFucyArIGpdKTtcbiAgICAgICAgICAgIG91dFVNYXhbal0gPSBNYXRoLm1heChvdXRVTWF4W2pdLCBhKTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuZnVuY3Rpb24gbm9ybWFsaXplR3JhcGgoQSwgdU1heCkge1xuICAgIGNvbnN0IGNoYW5zID0gdU1heC5sZW5ndGg7XG4gICAgY29uc3QgdmFsdWVzID0gQS5sZW5ndGggLyBjaGFucztcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHZhbHVlczsgaSsrKSB7XG4gICAgICAgIGZvciAobGV0IGogPSAwOyBqIDwgY2hhbnM7IGorKykge1xuICAgICAgICAgICAgQVtpICogY2hhbnMgKyBqXSAvPSAodU1heFtqXSA9PT0gMCA/IDEgOiB1TWF4W2pdKTtcbiAgICAgICAgICAgIEFbaSAqIGNoYW5zICsgal0gKj0gMC41O1xuICAgICAgICAgICAgQVtpICogY2hhbnMgKyBqXSArPSAwLjU7XG4gICAgICAgIH1cbiAgICB9XG59XG5cbmZ1bmN0aW9uIGRpdkdyYXBoRnJvbTJDdXJ2ZXMoY3VydmUxLCBjdXJ2ZTIsIG91dFVNYXgpIHtcbiAgICBjb25zdCBzdWIgPSBzdWJHcmFwaChjdXJ2ZTIsIGN1cnZlMSk7XG4gICAgbWF4VW5zaWduZWRHcmFwaFZhbHVlKHN1Yiwgb3V0VU1heCk7XG4gICAgbm9ybWFsaXplR3JhcGgoc3ViLCBvdXRVTWF4KTtcbiAgICByZXR1cm4gc3ViO1xufVxuXG4vLyBhIGRldmljZSBjYWNoZSBzdG9yaW5nIGRlZmF1bHQgcGFyYW1ldGVyIHRleHR1cmUgZm9yIHRoZSBlbWl0dGVyXG5jb25zdCBwYXJ0aWNsZUVtaXR0ZXJEZXZpY2VDYWNoZSA9IG5ldyBEZXZpY2VDYWNoZSgpO1xuXG5jbGFzcyBQYXJ0aWNsZUVtaXR0ZXIge1xuICAgIGNvbnN0cnVjdG9yKGdyYXBoaWNzRGV2aWNlLCBvcHRpb25zKSB7XG4gICAgICAgIHRoaXMuZ3JhcGhpY3NEZXZpY2UgPSBncmFwaGljc0RldmljZTtcbiAgICAgICAgY29uc3QgZ2QgPSBncmFwaGljc0RldmljZTtcbiAgICAgICAgY29uc3QgcHJlY2lzaW9uID0gMzI7XG4gICAgICAgIHRoaXMucHJlY2lzaW9uID0gcHJlY2lzaW9uO1xuXG4gICAgICAgIHRoaXMuX2FkZFRpbWVUaW1lID0gMDtcblxuICAgICAgICAvLyBHbG9iYWwgc3lzdGVtIHBhcmFtZXRlcnNcbiAgICAgICAgc2V0UHJvcGVydHlUYXJnZXQgPSB0aGlzO1xuICAgICAgICBzZXRQcm9wZXJ0eU9wdGlvbnMgPSBvcHRpb25zO1xuICAgICAgICBzZXRQcm9wZXJ0eSgnbnVtUGFydGljbGVzJywgMSk7ICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBBbW91bnQgb2YgcGFydGljbGVzIGFsbG9jYXRlZCAobWF4IHBhcnRpY2xlcyA9IG1heCBHTCB0ZXh0dXJlIHdpZHRoIGF0IHRoaXMgbW9tZW50KVxuXG4gICAgICAgIGlmICh0aGlzLm51bVBhcnRpY2xlcyA+IGdyYXBoaWNzRGV2aWNlLm1heFRleHR1cmVTaXplKSB7XG4gICAgICAgICAgICBEZWJ1Zy53YXJuKGBXQVJOSU5HOiBjYW4ndCBjcmVhdGUgbW9yZSB0aGFuICR7Z3JhcGhpY3NEZXZpY2UubWF4VGV4dHVyZVNpemV9IHBhcnRpY2xlcyBvbiB0aGlzIGRldmljZS5gKTtcbiAgICAgICAgICAgIHRoaXMubnVtUGFydGljbGVzID0gZ3JhcGhpY3NEZXZpY2UubWF4VGV4dHVyZVNpemU7XG4gICAgICAgIH1cblxuICAgICAgICBzZXRQcm9wZXJ0eSgncmF0ZScsIDEpOyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBFbWlzc2lvbiByYXRlXG4gICAgICAgIHNldFByb3BlcnR5KCdyYXRlMicsIHRoaXMucmF0ZSk7XG4gICAgICAgIHNldFByb3BlcnR5KCdsaWZldGltZScsIDUwKTsgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIFBhcnRpY2xlIGxpZmV0aW1lXG4gICAgICAgIHNldFByb3BlcnR5KCdlbWl0dGVyRXh0ZW50cycsIG5ldyBWZWMzKDAsIDAsIDApKTsgICAgICAgIC8vIFNwYXduIHBvaW50IGRpdmVyZ2VuY2VcbiAgICAgICAgc2V0UHJvcGVydHkoJ2VtaXR0ZXJFeHRlbnRzSW5uZXInLCBuZXcgVmVjMygwLCAwLCAwKSk7ICAgLy8gVm9sdW1lIGluc2lkZSBlbWl0dGVyRXh0ZW50cyB0byBleGNsdWRlIGZyb20gcmVnZW5lcmF0aW9uXG4gICAgICAgIHNldFByb3BlcnR5KCdlbWl0dGVyUmFkaXVzJywgMCk7XG4gICAgICAgIHNldFByb3BlcnR5KCdlbWl0dGVyUmFkaXVzSW5uZXInLCAwKTsgICAgICAgICAgICAgICAgICAgICAgIC8vIFNhbWUgYXMgRXh0ZW50c0lubmVyIGJ1dCBmb3Igc3BoZXJpY2FsIHZvbHVtZVxuICAgICAgICBzZXRQcm9wZXJ0eSgnZW1pdHRlclNoYXBlJywgRU1JVFRFUlNIQVBFX0JPWCk7XG4gICAgICAgIHNldFByb3BlcnR5KCdpbml0aWFsVmVsb2NpdHknLCAxKTtcbiAgICAgICAgc2V0UHJvcGVydHkoJ3dyYXAnLCBmYWxzZSk7XG4gICAgICAgIHNldFByb3BlcnR5KCdsb2NhbFNwYWNlJywgZmFsc2UpO1xuICAgICAgICBzZXRQcm9wZXJ0eSgnc2NyZWVuU3BhY2UnLCBmYWxzZSk7XG4gICAgICAgIHNldFByb3BlcnR5KCd3cmFwQm91bmRzJywgbnVsbCk7XG4gICAgICAgIHNldFByb3BlcnR5KCdjb2xvck1hcCcsIHRoaXMuZGVmYXVsdFBhcmFtVGV4dHVyZSk7XG4gICAgICAgIHNldFByb3BlcnR5KCdub3JtYWxNYXAnLCBudWxsKTtcbiAgICAgICAgc2V0UHJvcGVydHkoJ2xvb3AnLCB0cnVlKTtcbiAgICAgICAgc2V0UHJvcGVydHkoJ3ByZVdhcm0nLCBmYWxzZSk7XG4gICAgICAgIHNldFByb3BlcnR5KCdzb3J0JywgUEFSVElDTEVTT1JUX05PTkUpOyAvLyBTb3J0aW5nIG1vZGU6IDAgPSBub25lLCAxID0gYnkgZGlzdGFuY2UsIDIgPSBieSBsaWZlLCAzID0gYnkgLWxpZmU7ICBGb3JjZXMgQ1BVIG1vZGUgaWYgbm90IDBcbiAgICAgICAgc2V0UHJvcGVydHkoJ21vZGUnLCBQQVJUSUNMRU1PREVfR1BVKTtcbiAgICAgICAgc2V0UHJvcGVydHkoJ3NjZW5lJywgbnVsbCk7XG4gICAgICAgIHNldFByb3BlcnR5KCdsaWdodGluZycsIGZhbHNlKTtcbiAgICAgICAgc2V0UHJvcGVydHkoJ2hhbGZMYW1iZXJ0JywgZmFsc2UpO1xuICAgICAgICBzZXRQcm9wZXJ0eSgnaW50ZW5zaXR5JywgMS4wKTtcbiAgICAgICAgc2V0UHJvcGVydHkoJ3N0cmV0Y2gnLCAwLjApO1xuICAgICAgICBzZXRQcm9wZXJ0eSgnYWxpZ25Ub01vdGlvbicsIGZhbHNlKTtcbiAgICAgICAgc2V0UHJvcGVydHkoJ2RlcHRoU29mdGVuaW5nJywgMCk7XG4gICAgICAgIHNldFByb3BlcnR5KCdtZXNoJywgbnVsbCk7ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gTWVzaCB0byBiZSB1c2VkIGFzIHBhcnRpY2xlLiBWZXJ0ZXggYnVmZmVyIGlzIHN1cHBvc2VkIHRvIGhvbGQgdmVydGV4IHBvc2l0aW9uIGluIGZpcnN0IDMgZmxvYXRzIG9mIGVhY2ggdmVydGV4XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gTGVhdmUgdW5kZWZpbmVkIHRvIHVzZSBzaW1wbGUgcXVhZHNcbiAgICAgICAgc2V0UHJvcGVydHkoJ3BhcnRpY2xlTm9ybWFsJywgbmV3IFZlYzMoMCwgMSwgMCkpO1xuICAgICAgICBzZXRQcm9wZXJ0eSgnb3JpZW50YXRpb24nLCBQQVJUSUNMRU9SSUVOVEFUSU9OX1NDUkVFTik7XG5cbiAgICAgICAgc2V0UHJvcGVydHkoJ2RlcHRoV3JpdGUnLCBmYWxzZSk7XG4gICAgICAgIHNldFByb3BlcnR5KCdub0ZvZycsIGZhbHNlKTtcbiAgICAgICAgc2V0UHJvcGVydHkoJ2JsZW5kVHlwZScsIEJMRU5EX05PUk1BTCk7XG4gICAgICAgIHNldFByb3BlcnR5KCdub2RlJywgbnVsbCk7XG4gICAgICAgIHNldFByb3BlcnR5KCdzdGFydEFuZ2xlJywgMCk7XG4gICAgICAgIHNldFByb3BlcnR5KCdzdGFydEFuZ2xlMicsIHRoaXMuc3RhcnRBbmdsZSk7XG5cbiAgICAgICAgc2V0UHJvcGVydHkoJ2FuaW1UaWxlc1gnLCAxKTtcbiAgICAgICAgc2V0UHJvcGVydHkoJ2FuaW1UaWxlc1knLCAxKTtcbiAgICAgICAgc2V0UHJvcGVydHkoJ2FuaW1TdGFydEZyYW1lJywgMCk7XG4gICAgICAgIHNldFByb3BlcnR5KCdhbmltTnVtRnJhbWVzJywgMSk7XG4gICAgICAgIHNldFByb3BlcnR5KCdhbmltTnVtQW5pbWF0aW9ucycsIDEpO1xuICAgICAgICBzZXRQcm9wZXJ0eSgnYW5pbUluZGV4JywgMCk7XG4gICAgICAgIHNldFByb3BlcnR5KCdyYW5kb21pemVBbmltSW5kZXgnLCBmYWxzZSk7XG4gICAgICAgIHNldFByb3BlcnR5KCdhbmltU3BlZWQnLCAxKTtcbiAgICAgICAgc2V0UHJvcGVydHkoJ2FuaW1Mb29wJywgdHJ1ZSk7XG5cbiAgICAgICAgdGhpcy5fZ3B1VXBkYXRlciA9IG5ldyBQYXJ0aWNsZUdQVVVwZGF0ZXIodGhpcywgZ2QpO1xuICAgICAgICB0aGlzLl9jcHVVcGRhdGVyID0gbmV3IFBhcnRpY2xlQ1BVVXBkYXRlcih0aGlzKTtcblxuICAgICAgICB0aGlzLmVtaXR0ZXJQb3NVbmlmb3JtID0gbmV3IEZsb2F0MzJBcnJheSgzKTtcbiAgICAgICAgdGhpcy53cmFwQm91bmRzVW5pZm9ybSA9IG5ldyBGbG9hdDMyQXJyYXkoMyk7XG4gICAgICAgIHRoaXMuZW1pdHRlclNjYWxlVW5pZm9ybSA9IG5ldyBGbG9hdDMyQXJyYXkoWzEsIDEsIDFdKTtcblxuICAgICAgICAvLyBUaW1lLWRlcGVuZGVudCBwYXJhbWV0ZXJzXG4gICAgICAgIHNldFByb3BlcnR5KCdjb2xvckdyYXBoJywgZGVmYXVsdDFDdXJ2ZTMpO1xuICAgICAgICBzZXRQcm9wZXJ0eSgnY29sb3JHcmFwaDInLCB0aGlzLmNvbG9yR3JhcGgpO1xuXG4gICAgICAgIHNldFByb3BlcnR5KCdzY2FsZUdyYXBoJywgZGVmYXVsdDFDdXJ2ZSk7XG4gICAgICAgIHNldFByb3BlcnR5KCdzY2FsZUdyYXBoMicsIHRoaXMuc2NhbGVHcmFwaCk7XG5cbiAgICAgICAgc2V0UHJvcGVydHkoJ2FscGhhR3JhcGgnLCBkZWZhdWx0MUN1cnZlKTtcbiAgICAgICAgc2V0UHJvcGVydHkoJ2FscGhhR3JhcGgyJywgdGhpcy5hbHBoYUdyYXBoKTtcblxuICAgICAgICBzZXRQcm9wZXJ0eSgnbG9jYWxWZWxvY2l0eUdyYXBoJywgZGVmYXVsdDBDdXJ2ZTMpO1xuICAgICAgICBzZXRQcm9wZXJ0eSgnbG9jYWxWZWxvY2l0eUdyYXBoMicsIHRoaXMubG9jYWxWZWxvY2l0eUdyYXBoKTtcblxuICAgICAgICBzZXRQcm9wZXJ0eSgndmVsb2NpdHlHcmFwaCcsIGRlZmF1bHQwQ3VydmUzKTtcbiAgICAgICAgc2V0UHJvcGVydHkoJ3ZlbG9jaXR5R3JhcGgyJywgdGhpcy52ZWxvY2l0eUdyYXBoKTtcblxuICAgICAgICBzZXRQcm9wZXJ0eSgncm90YXRpb25TcGVlZEdyYXBoJywgZGVmYXVsdDBDdXJ2ZSk7XG4gICAgICAgIHNldFByb3BlcnR5KCdyb3RhdGlvblNwZWVkR3JhcGgyJywgdGhpcy5yb3RhdGlvblNwZWVkR3JhcGgpO1xuXG4gICAgICAgIHNldFByb3BlcnR5KCdyYWRpYWxTcGVlZEdyYXBoJywgZGVmYXVsdDBDdXJ2ZSk7XG4gICAgICAgIHNldFByb3BlcnR5KCdyYWRpYWxTcGVlZEdyYXBoMicsIHRoaXMucmFkaWFsU3BlZWRHcmFwaCk7XG5cbiAgICAgICAgdGhpcy5hbmltVGlsZXNQYXJhbXMgPSBuZXcgRmxvYXQzMkFycmF5KDIpO1xuICAgICAgICB0aGlzLmFuaW1QYXJhbXMgPSBuZXcgRmxvYXQzMkFycmF5KDQpO1xuICAgICAgICB0aGlzLmFuaW1JbmRleFBhcmFtcyA9IG5ldyBGbG9hdDMyQXJyYXkoMik7XG5cbiAgICAgICAgdGhpcy5pbnRlcm5hbFRleDAgPSBudWxsO1xuICAgICAgICB0aGlzLmludGVybmFsVGV4MSA9IG51bGw7XG4gICAgICAgIHRoaXMuaW50ZXJuYWxUZXgyID0gbnVsbDtcbiAgICAgICAgdGhpcy5jb2xvclBhcmFtID0gbnVsbDtcblxuICAgICAgICB0aGlzLnZiVG9Tb3J0ID0gbnVsbDtcbiAgICAgICAgdGhpcy52Yk9sZCA9IG51bGw7XG4gICAgICAgIHRoaXMucGFydGljbGVEaXN0YW5jZSA9IG51bGw7XG5cbiAgICAgICAgdGhpcy5jYW1lcmEgPSBudWxsO1xuXG4gICAgICAgIHRoaXMuc3dhcFRleCA9IGZhbHNlO1xuICAgICAgICB0aGlzLnVzZU1lc2ggPSB0cnVlO1xuICAgICAgICB0aGlzLnVzZUNwdSA9ICFncmFwaGljc0RldmljZS5zdXBwb3J0c0dwdVBhcnRpY2xlcztcblxuICAgICAgICB0aGlzLnBhY2s4ID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5sb2NhbEJvdW5kcyA9IG5ldyBCb3VuZGluZ0JveCgpO1xuICAgICAgICB0aGlzLndvcmxkQm91bmRzTm9UcmFpbCA9IG5ldyBCb3VuZGluZ0JveCgpO1xuICAgICAgICB0aGlzLndvcmxkQm91bmRzVHJhaWwgPSBbbmV3IEJvdW5kaW5nQm94KCksIG5ldyBCb3VuZGluZ0JveCgpXTtcbiAgICAgICAgdGhpcy53b3JsZEJvdW5kcyA9IG5ldyBCb3VuZGluZ0JveCgpO1xuXG4gICAgICAgIHRoaXMud29ybGRCb3VuZHNTaXplID0gbmV3IFZlYzMoKTtcblxuICAgICAgICB0aGlzLnByZXZXb3JsZEJvdW5kc1NpemUgPSBuZXcgVmVjMygpO1xuICAgICAgICB0aGlzLnByZXZXb3JsZEJvdW5kc0NlbnRlciA9IG5ldyBWZWMzKCk7XG4gICAgICAgIHRoaXMucHJldkVtaXR0ZXJFeHRlbnRzID0gdGhpcy5lbWl0dGVyRXh0ZW50cztcbiAgICAgICAgdGhpcy5wcmV2RW1pdHRlclJhZGl1cyA9IHRoaXMuZW1pdHRlclJhZGl1cztcbiAgICAgICAgdGhpcy53b3JsZEJvdW5kc011bCA9IG5ldyBWZWMzKCk7XG4gICAgICAgIHRoaXMud29ybGRCb3VuZHNBZGQgPSBuZXcgVmVjMygpO1xuICAgICAgICB0aGlzLnRpbWVUb1N3aXRjaEJvdW5kcyA9IDA7XG4gICAgICAgIC8vIHRoaXMucHJldlBvcyA9IG5ldyBWZWMzKCk7XG5cbiAgICAgICAgdGhpcy5zaGFkZXJQYXJ0aWNsZVVwZGF0ZVJlc3Bhd24gPSBudWxsO1xuICAgICAgICB0aGlzLnNoYWRlclBhcnRpY2xlVXBkYXRlTm9SZXNwYXduID0gbnVsbDtcbiAgICAgICAgdGhpcy5zaGFkZXJQYXJ0aWNsZVVwZGF0ZU9uU3RvcCA9IG51bGw7XG5cbiAgICAgICAgdGhpcy5udW1QYXJ0aWNsZVZlcnRzID0gMDtcbiAgICAgICAgdGhpcy5udW1QYXJ0aWNsZUluZGljZXMgPSAwO1xuXG4gICAgICAgIHRoaXMubWF0ZXJpYWwgPSBudWxsO1xuICAgICAgICB0aGlzLm1lc2hJbnN0YW5jZSA9IG51bGw7XG4gICAgICAgIHRoaXMuZHJhd09yZGVyID0gMDtcblxuICAgICAgICB0aGlzLnNlZWQgPSBNYXRoLnJhbmRvbSgpO1xuXG4gICAgICAgIHRoaXMuZml4ZWRUaW1lU3RlcCA9IDEuMCAvIDYwO1xuICAgICAgICB0aGlzLm1heFN1YlN0ZXBzID0gMTA7XG4gICAgICAgIHRoaXMuc2ltVGltZSA9IDA7XG4gICAgICAgIHRoaXMuc2ltVGltZVRvdGFsID0gMDtcblxuICAgICAgICB0aGlzLmJlZW5SZXNldCA9IGZhbHNlO1xuXG4gICAgICAgIHRoaXMuX2xheWVyID0gbnVsbDtcblxuICAgICAgICB0aGlzLnJlYnVpbGQoKTtcbiAgICB9XG5cbiAgICBnZXQgZGVmYXVsdFBhcmFtVGV4dHVyZSgpIHtcbiAgICAgICAgRGVidWcuYXNzZXJ0KHRoaXMuZ3JhcGhpY3NEZXZpY2UpO1xuICAgICAgICByZXR1cm4gcGFydGljbGVFbWl0dGVyRGV2aWNlQ2FjaGUuZ2V0KHRoaXMuZ3JhcGhpY3NEZXZpY2UsICgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHJlc29sdXRpb24gPSAxNjtcbiAgICAgICAgICAgIGNvbnN0IGNlbnRlclBvaW50ID0gcmVzb2x1dGlvbiAqIDAuNSArIDAuNTtcbiAgICAgICAgICAgIGNvbnN0IGR0ZXggPSBuZXcgRmxvYXQzMkFycmF5KHJlc29sdXRpb24gKiByZXNvbHV0aW9uICogNCk7XG4gICAgICAgICAgICBmb3IgKGxldCB5ID0gMDsgeSA8IHJlc29sdXRpb247IHkrKykge1xuICAgICAgICAgICAgICAgIGZvciAobGV0IHggPSAwOyB4IDwgcmVzb2x1dGlvbjsgeCsrKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHhncmFkID0gKHggKyAxKSAtIGNlbnRlclBvaW50O1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB5Z3JhZCA9ICh5ICsgMSkgLSBjZW50ZXJQb2ludDtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYyA9IHNhdHVyYXRlKCgxIC0gc2F0dXJhdGUoTWF0aC5zcXJ0KHhncmFkICogeGdyYWQgKyB5Z3JhZCAqIHlncmFkKSAvIHJlc29sdXRpb24pKSAtIDAuNSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHAgPSB5ICogcmVzb2x1dGlvbiArIHg7XG4gICAgICAgICAgICAgICAgICAgIGR0ZXhbcCAqIDRdID0gICAgIDE7XG4gICAgICAgICAgICAgICAgICAgIGR0ZXhbcCAqIDQgKyAxXSA9IDE7XG4gICAgICAgICAgICAgICAgICAgIGR0ZXhbcCAqIDQgKyAyXSA9IDE7XG4gICAgICAgICAgICAgICAgICAgIGR0ZXhbcCAqIDQgKyAzXSA9IGM7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCB0ZXh0dXJlID0gX2NyZWF0ZVRleHR1cmUodGhpcy5ncmFwaGljc0RldmljZSwgcmVzb2x1dGlvbiwgcmVzb2x1dGlvbiwgZHRleCwgUElYRUxGT1JNQVRfUkdCQTgsIDEuMCwgdHJ1ZSk7XG4gICAgICAgICAgICB0ZXh0dXJlLm1pbkZpbHRlciA9IEZJTFRFUl9MSU5FQVI7XG4gICAgICAgICAgICB0ZXh0dXJlLm1hZ0ZpbHRlciA9IEZJTFRFUl9MSU5FQVI7XG4gICAgICAgICAgICByZXR1cm4gdGV4dHVyZTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgb25DaGFuZ2VDYW1lcmEoKSB7XG4gICAgICAgIHRoaXMucmVnZW5TaGFkZXIoKTtcbiAgICAgICAgdGhpcy5yZXNldE1hdGVyaWFsKCk7XG4gICAgfVxuXG4gICAgY2FsY3VsYXRlQm91bmRzTWFkKCkge1xuICAgICAgICB0aGlzLndvcmxkQm91bmRzTXVsLnggPSAxLjAgLyB0aGlzLndvcmxkQm91bmRzU2l6ZS54O1xuICAgICAgICB0aGlzLndvcmxkQm91bmRzTXVsLnkgPSAxLjAgLyB0aGlzLndvcmxkQm91bmRzU2l6ZS55O1xuICAgICAgICB0aGlzLndvcmxkQm91bmRzTXVsLnogPSAxLjAgLyB0aGlzLndvcmxkQm91bmRzU2l6ZS56O1xuXG4gICAgICAgIHRoaXMud29ybGRCb3VuZHNBZGQuY29weSh0aGlzLndvcmxkQm91bmRzLmNlbnRlcikubXVsKHRoaXMud29ybGRCb3VuZHNNdWwpLm11bFNjYWxhcigtMSk7XG4gICAgICAgIHRoaXMud29ybGRCb3VuZHNBZGQueCArPSAwLjU7XG4gICAgICAgIHRoaXMud29ybGRCb3VuZHNBZGQueSArPSAwLjU7XG4gICAgICAgIHRoaXMud29ybGRCb3VuZHNBZGQueiArPSAwLjU7XG4gICAgfVxuXG4gICAgY2FsY3VsYXRlV29ybGRCb3VuZHMoKSB7XG4gICAgICAgIGlmICghdGhpcy5ub2RlKSByZXR1cm47XG5cbiAgICAgICAgdGhpcy5wcmV2V29ybGRCb3VuZHNTaXplLmNvcHkodGhpcy53b3JsZEJvdW5kc1NpemUpO1xuICAgICAgICB0aGlzLnByZXZXb3JsZEJvdW5kc0NlbnRlci5jb3B5KHRoaXMud29ybGRCb3VuZHMuY2VudGVyKTtcblxuICAgICAgICBpZiAoIXRoaXMudXNlQ3B1KSB7XG4gICAgICAgICAgICBsZXQgcmVjYWxjdWxhdGVMb2NhbEJvdW5kcyA9IGZhbHNlO1xuICAgICAgICAgICAgaWYgKHRoaXMuZW1pdHRlclNoYXBlID09PSBFTUlUVEVSU0hBUEVfQk9YKSB7XG4gICAgICAgICAgICAgICAgcmVjYWxjdWxhdGVMb2NhbEJvdW5kcyA9ICF0aGlzLmVtaXR0ZXJFeHRlbnRzLmVxdWFscyh0aGlzLnByZXZFbWl0dGVyRXh0ZW50cyk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJlY2FsY3VsYXRlTG9jYWxCb3VuZHMgPSAhKHRoaXMuZW1pdHRlclJhZGl1cyA9PT0gdGhpcy5wcmV2RW1pdHRlclJhZGl1cyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocmVjYWxjdWxhdGVMb2NhbEJvdW5kcykge1xuICAgICAgICAgICAgICAgIHRoaXMuY2FsY3VsYXRlTG9jYWxCb3VuZHMoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG5cbiAgICAgICAgY29uc3Qgbm9kZVdUID0gdGhpcy5ub2RlLmdldFdvcmxkVHJhbnNmb3JtKCk7XG4gICAgICAgIGlmICh0aGlzLmxvY2FsU3BhY2UpIHtcbiAgICAgICAgICAgIHRoaXMud29ybGRCb3VuZHNOb1RyYWlsLmNvcHkodGhpcy5sb2NhbEJvdW5kcyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLndvcmxkQm91bmRzTm9UcmFpbC5zZXRGcm9tVHJhbnNmb3JtZWRBYWJiKHRoaXMubG9jYWxCb3VuZHMsIG5vZGVXVCk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLndvcmxkQm91bmRzVHJhaWxbMF0uYWRkKHRoaXMud29ybGRCb3VuZHNOb1RyYWlsKTtcbiAgICAgICAgdGhpcy53b3JsZEJvdW5kc1RyYWlsWzFdLmFkZCh0aGlzLndvcmxkQm91bmRzTm9UcmFpbCk7XG5cbiAgICAgICAgY29uc3Qgbm93ID0gdGhpcy5zaW1UaW1lVG90YWw7XG4gICAgICAgIGlmIChub3cgPj0gdGhpcy50aW1lVG9Td2l0Y2hCb3VuZHMpIHtcbiAgICAgICAgICAgIHRoaXMud29ybGRCb3VuZHNUcmFpbFswXS5jb3B5KHRoaXMud29ybGRCb3VuZHNUcmFpbFsxXSk7XG4gICAgICAgICAgICB0aGlzLndvcmxkQm91bmRzVHJhaWxbMV0uY29weSh0aGlzLndvcmxkQm91bmRzTm9UcmFpbCk7XG4gICAgICAgICAgICB0aGlzLnRpbWVUb1N3aXRjaEJvdW5kcyA9IG5vdyArIHRoaXMubGlmZXRpbWU7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLndvcmxkQm91bmRzLmNvcHkodGhpcy53b3JsZEJvdW5kc1RyYWlsWzBdKTtcblxuICAgICAgICB0aGlzLndvcmxkQm91bmRzU2l6ZS5jb3B5KHRoaXMud29ybGRCb3VuZHMuaGFsZkV4dGVudHMpLm11bFNjYWxhcigyKTtcblxuICAgICAgICBpZiAodGhpcy5sb2NhbFNwYWNlKSB7XG4gICAgICAgICAgICB0aGlzLm1lc2hJbnN0YW5jZS5hYWJiLnNldEZyb21UcmFuc2Zvcm1lZEFhYmIodGhpcy53b3JsZEJvdW5kcywgbm9kZVdUKTtcbiAgICAgICAgICAgIHRoaXMubWVzaEluc3RhbmNlLm1lc2guYWFiYi5zZXRGcm9tVHJhbnNmb3JtZWRBYWJiKHRoaXMud29ybGRCb3VuZHMsIG5vZGVXVCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLm1lc2hJbnN0YW5jZS5hYWJiLmNvcHkodGhpcy53b3JsZEJvdW5kcyk7XG4gICAgICAgICAgICB0aGlzLm1lc2hJbnN0YW5jZS5tZXNoLmFhYmIuY29weSh0aGlzLndvcmxkQm91bmRzKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLm1lc2hJbnN0YW5jZS5fYWFiYlZlciA9IDEgLSB0aGlzLm1lc2hJbnN0YW5jZS5fYWFiYlZlcjtcblxuICAgICAgICBpZiAodGhpcy5wYWNrOCkgdGhpcy5jYWxjdWxhdGVCb3VuZHNNYWQoKTtcbiAgICB9XG5cbiAgICByZXNldFdvcmxkQm91bmRzKCkge1xuICAgICAgICBpZiAoIXRoaXMubm9kZSkgcmV0dXJuO1xuXG4gICAgICAgIHRoaXMud29ybGRCb3VuZHNOb1RyYWlsLnNldEZyb21UcmFuc2Zvcm1lZEFhYmIoXG4gICAgICAgICAgICB0aGlzLmxvY2FsQm91bmRzLCB0aGlzLmxvY2FsU3BhY2UgPyBNYXQ0LklERU5USVRZIDogdGhpcy5ub2RlLmdldFdvcmxkVHJhbnNmb3JtKCkpO1xuXG4gICAgICAgIHRoaXMud29ybGRCb3VuZHNUcmFpbFswXS5jb3B5KHRoaXMud29ybGRCb3VuZHNOb1RyYWlsKTtcbiAgICAgICAgdGhpcy53b3JsZEJvdW5kc1RyYWlsWzFdLmNvcHkodGhpcy53b3JsZEJvdW5kc05vVHJhaWwpO1xuXG4gICAgICAgIHRoaXMud29ybGRCb3VuZHMuY29weSh0aGlzLndvcmxkQm91bmRzVHJhaWxbMF0pO1xuICAgICAgICB0aGlzLndvcmxkQm91bmRzU2l6ZS5jb3B5KHRoaXMud29ybGRCb3VuZHMuaGFsZkV4dGVudHMpLm11bFNjYWxhcigyKTtcblxuICAgICAgICB0aGlzLnByZXZXb3JsZEJvdW5kc1NpemUuY29weSh0aGlzLndvcmxkQm91bmRzU2l6ZSk7XG4gICAgICAgIHRoaXMucHJldldvcmxkQm91bmRzQ2VudGVyLmNvcHkodGhpcy53b3JsZEJvdW5kcy5jZW50ZXIpO1xuXG4gICAgICAgIHRoaXMuc2ltVGltZVRvdGFsID0gMDtcbiAgICAgICAgdGhpcy50aW1lVG9Td2l0Y2hCb3VuZHMgPSAwO1xuICAgIH1cblxuICAgIGNhbGN1bGF0ZUxvY2FsQm91bmRzKCkge1xuICAgICAgICBsZXQgbWlueCA9IE51bWJlci5NQVhfVkFMVUU7XG4gICAgICAgIGxldCBtaW55ID0gTnVtYmVyLk1BWF9WQUxVRTtcbiAgICAgICAgbGV0IG1pbnogPSBOdW1iZXIuTUFYX1ZBTFVFO1xuICAgICAgICBsZXQgbWF4eCA9IC1OdW1iZXIuTUFYX1ZBTFVFO1xuICAgICAgICBsZXQgbWF4eSA9IC1OdW1iZXIuTUFYX1ZBTFVFO1xuICAgICAgICBsZXQgbWF4eiA9IC1OdW1iZXIuTUFYX1ZBTFVFO1xuICAgICAgICBsZXQgbWF4UiA9IDA7XG4gICAgICAgIGxldCBtYXhTY2FsZSA9IDA7XG4gICAgICAgIGNvbnN0IHN0ZXBXZWlnaHQgPSB0aGlzLmxpZmV0aW1lIC8gdGhpcy5wcmVjaXNpb247XG4gICAgICAgIGNvbnN0IHdWZWxzID0gW3RoaXMucVZlbG9jaXR5LCB0aGlzLnFWZWxvY2l0eTJdO1xuICAgICAgICBjb25zdCBsVmVscyA9IFt0aGlzLnFMb2NhbFZlbG9jaXR5LCB0aGlzLnFMb2NhbFZlbG9jaXR5Ml07XG4gICAgICAgIGNvbnN0IGFjY3VtWCA9IFswLCAwXTtcbiAgICAgICAgY29uc3QgYWNjdW1ZID0gWzAsIDBdO1xuICAgICAgICBjb25zdCBhY2N1bVogPSBbMCwgMF07XG4gICAgICAgIGNvbnN0IGFjY3VtUiA9IFswLCAwXTtcbiAgICAgICAgY29uc3QgYWNjdW1XID0gWzAsIDBdO1xuICAgICAgICBsZXQgeCwgeSwgejtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLnByZWNpc2lvbiArIDE7IGkrKykgeyAvLyB0YWtlIGV4dHJhIHN0ZXAgdG8gcHJldmVudCBwb3NpdGlvbiBnbGl0Y2hlc1xuICAgICAgICAgICAgY29uc3QgaW5kZXggPSBNYXRoLm1pbihpLCB0aGlzLnByZWNpc2lvbiAtIDEpO1xuICAgICAgICAgICAgZm9yIChsZXQgaiA9IDA7IGogPCAyOyBqKyspIHtcbiAgICAgICAgICAgICAgICB4ID0gbFZlbHNbal1baW5kZXggKiAzICsgMF0gKiBzdGVwV2VpZ2h0ICsgYWNjdW1YW2pdO1xuICAgICAgICAgICAgICAgIHkgPSBsVmVsc1tqXVtpbmRleCAqIDMgKyAxXSAqIHN0ZXBXZWlnaHQgKyBhY2N1bVlbal07XG4gICAgICAgICAgICAgICAgeiA9IGxWZWxzW2pdW2luZGV4ICogMyArIDJdICogc3RlcFdlaWdodCArIGFjY3VtWltqXTtcblxuICAgICAgICAgICAgICAgIG1pbnggPSBNYXRoLm1pbih4LCBtaW54KTtcbiAgICAgICAgICAgICAgICBtaW55ID0gTWF0aC5taW4oeSwgbWlueSk7XG4gICAgICAgICAgICAgICAgbWlueiA9IE1hdGgubWluKHosIG1pbnopO1xuICAgICAgICAgICAgICAgIG1heHggPSBNYXRoLm1heCh4LCBtYXh4KTtcbiAgICAgICAgICAgICAgICBtYXh5ID0gTWF0aC5tYXgoeSwgbWF4eSk7XG4gICAgICAgICAgICAgICAgbWF4eiA9IE1hdGgubWF4KHosIG1heHopO1xuXG4gICAgICAgICAgICAgICAgYWNjdW1YW2pdID0geDtcbiAgICAgICAgICAgICAgICBhY2N1bVlbal0gPSB5O1xuICAgICAgICAgICAgICAgIGFjY3VtWltqXSA9IHo7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBmb3IgKGxldCBqID0gMDsgaiA8IDI7IGorKykge1xuICAgICAgICAgICAgICAgIGFjY3VtV1tqXSArPSBzdGVwV2VpZ2h0ICogTWF0aC5zcXJ0KFxuICAgICAgICAgICAgICAgICAgICB3VmVsc1tqXVtpbmRleCAqIDMgKyAwXSAqIHdWZWxzW2pdW2luZGV4ICogMyArIDBdICtcbiAgICAgICAgICAgICAgICAgICAgd1ZlbHNbal1baW5kZXggKiAzICsgMV0gKiB3VmVsc1tqXVtpbmRleCAqIDMgKyAxXSArXG4gICAgICAgICAgICAgICAgICAgIHdWZWxzW2pdW2luZGV4ICogMyArIDJdICogd1ZlbHNbal1baW5kZXggKiAzICsgMl0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBhY2N1bVJbMF0gKz0gdGhpcy5xUmFkaWFsU3BlZWRbaW5kZXhdICogc3RlcFdlaWdodDtcbiAgICAgICAgICAgIGFjY3VtUlsxXSArPSB0aGlzLnFSYWRpYWxTcGVlZDJbaW5kZXhdICogc3RlcFdlaWdodDtcbiAgICAgICAgICAgIG1heFIgPSBNYXRoLm1heChtYXhSLCBNYXRoLm1heChNYXRoLmFicyhhY2N1bVJbMF0pLCBNYXRoLmFicyhhY2N1bVJbMV0pKSk7XG5cbiAgICAgICAgICAgIG1heFNjYWxlID0gTWF0aC5tYXgobWF4U2NhbGUsIHRoaXMucVNjYWxlW2luZGV4XSk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5lbWl0dGVyU2hhcGUgPT09IEVNSVRURVJTSEFQRV9CT1gpIHtcbiAgICAgICAgICAgIHggPSB0aGlzLmVtaXR0ZXJFeHRlbnRzLnggKiAwLjU7XG4gICAgICAgICAgICB5ID0gdGhpcy5lbWl0dGVyRXh0ZW50cy55ICogMC41O1xuICAgICAgICAgICAgeiA9IHRoaXMuZW1pdHRlckV4dGVudHMueiAqIDAuNTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHggPSB0aGlzLmVtaXR0ZXJSYWRpdXM7XG4gICAgICAgICAgICB5ID0gdGhpcy5lbWl0dGVyUmFkaXVzO1xuICAgICAgICAgICAgeiA9IHRoaXMuZW1pdHRlclJhZGl1cztcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHcgPSBNYXRoLm1heChhY2N1bVdbMF0sIGFjY3VtV1sxXSk7XG4gICAgICAgIGJNaW4ueCA9IG1pbnggLSBtYXhTY2FsZSAtIHggLSBtYXhSIC0gdztcbiAgICAgICAgYk1pbi55ID0gbWlueSAtIG1heFNjYWxlIC0geSAtIG1heFIgLSB3O1xuICAgICAgICBiTWluLnogPSBtaW56IC0gbWF4U2NhbGUgLSB6IC0gbWF4UiAtIHc7XG4gICAgICAgIGJNYXgueCA9IG1heHggKyBtYXhTY2FsZSArIHggKyBtYXhSICsgdztcbiAgICAgICAgYk1heC55ID0gbWF4eSArIG1heFNjYWxlICsgeSArIG1heFIgKyB3O1xuICAgICAgICBiTWF4LnogPSBtYXh6ICsgbWF4U2NhbGUgKyB6ICsgbWF4UiArIHc7XG4gICAgICAgIHRoaXMubG9jYWxCb3VuZHMuc2V0TWluTWF4KGJNaW4sIGJNYXgpO1xuICAgIH1cblxuICAgIHJlYnVpbGQoKSB7XG4gICAgICAgIGNvbnN0IGdkID0gdGhpcy5ncmFwaGljc0RldmljZTtcblxuICAgICAgICBpZiAodGhpcy5jb2xvck1hcCA9PT0gbnVsbCkgdGhpcy5jb2xvck1hcCA9IHRoaXMuZGVmYXVsdFBhcmFtVGV4dHVyZTtcblxuICAgICAgICB0aGlzLnNwYXduQm91bmRzID0gdGhpcy5lbWl0dGVyU2hhcGUgPT09IEVNSVRURVJTSEFQRV9CT1ggPyB0aGlzLmVtaXR0ZXJFeHRlbnRzIDogdGhpcy5lbWl0dGVyUmFkaXVzO1xuXG4gICAgICAgIHRoaXMudXNlQ3B1ID0gdGhpcy51c2VDcHUgfHwgdGhpcy5zb3J0ID4gUEFSVElDTEVTT1JUX05PTkUgfHwgIC8vIGZvcmNlIENQVSBpZiBkZXNpcmFibGUgYnkgdXNlciBvciBzb3J0aW5nIGlzIGVuYWJsZWRcbiAgICAgICAgZ2QubWF4VmVydGV4VGV4dHVyZXMgPD0gMSB8fCAvLyBmb3JjZSBDUFUgaWYgY2FuJ3QgdXNlIGVub3VnaCB2ZXJ0ZXggdGV4dHVyZXNcbiAgICAgICAgZ2QuZnJhZ21lbnRVbmlmb3Jtc0NvdW50IDwgNjQgfHwgLy8gZm9yY2UgQ1BVIGlmIGNhbid0IHVzZSBtYW55IHVuaWZvcm1zOyBUT0RPOiBjaGFuZ2UgdG8gbW9yZSByZWFsaXN0aWMgdmFsdWUgKHRoaXMgb25lIGlzIGlwaG9uZSdzKVxuICAgICAgICBnZC5mb3JjZUNwdVBhcnRpY2xlcyB8fFxuICAgICAgICAhZ2QuZXh0VGV4dHVyZUZsb2F0OyAvLyBubyBmbG9hdCB0ZXh0dXJlIGV4dGVuc2lvblxuXG4gICAgICAgIHRoaXMuX2Rlc3Ryb3lSZXNvdXJjZXMoKTtcblxuICAgICAgICB0aGlzLnBhY2s4ID0gKHRoaXMucGFjazggfHwgIWdkLnRleHR1cmVGbG9hdFJlbmRlcmFibGUpICYmICF0aGlzLnVzZUNwdTtcblxuICAgICAgICBwYXJ0aWNsZVRleEhlaWdodCA9ICh0aGlzLnVzZUNwdSB8fCB0aGlzLnBhY2s4KSA/IDQgOiAyO1xuXG4gICAgICAgIHRoaXMudXNlTWVzaCA9IGZhbHNlO1xuICAgICAgICBpZiAodGhpcy5tZXNoKSB7XG4gICAgICAgICAgICBjb25zdCB0b3RhbFZlcnRDb3VudCA9IHRoaXMubnVtUGFydGljbGVzICogdGhpcy5tZXNoLnZlcnRleEJ1ZmZlci5udW1WZXJ0aWNlcztcbiAgICAgICAgICAgIGlmICh0b3RhbFZlcnRDb3VudCA+IDY1NTM1KSB7XG4gICAgICAgICAgICAgICAgRGVidWcud2FybignV0FSTklORzogcGFydGljbGUgc3lzdGVtIGNhblxcJ3QgcmVuZGVyIG1lc2ggcGFydGljbGVzIGJlY2F1c2UgbnVtUGFydGljbGVzICogbnVtVmVydGljZXMgaXMgbW9yZSB0aGFuIDY1ay4gUmV2ZXJ0aW5nIHRvIHF1YWQgcGFydGljbGVzLicpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLnVzZU1lc2ggPSB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5udW1QYXJ0aWNsZXNQb3QgPSBtYXRoLm5leHRQb3dlck9mVHdvKHRoaXMubnVtUGFydGljbGVzKTtcbiAgICAgICAgdGhpcy5yZWJ1aWxkR3JhcGhzKCk7XG4gICAgICAgIHRoaXMuY2FsY3VsYXRlTG9jYWxCb3VuZHMoKTtcbiAgICAgICAgdGhpcy5yZXNldFdvcmxkQm91bmRzKCk7XG5cbiAgICAgICAgaWYgKHRoaXMubm9kZSkge1xuICAgICAgICAgICAgLy8gdGhpcy5wcmV2UG9zLmNvcHkodGhpcy5ub2RlLmdldFBvc2l0aW9uKCkpO1xuICAgICAgICAgICAgdGhpcy53b3JsZEJvdW5kcy5zZXRGcm9tVHJhbnNmb3JtZWRBYWJiKFxuICAgICAgICAgICAgICAgIHRoaXMubG9jYWxCb3VuZHMsIHRoaXMubG9jYWxTcGFjZSA/IE1hdDQuSURFTlRJVFkgOiB0aGlzLm5vZGUuZ2V0V29ybGRUcmFuc2Zvcm0oKSk7XG5cbiAgICAgICAgICAgIHRoaXMud29ybGRCb3VuZHNUcmFpbFswXS5jb3B5KHRoaXMud29ybGRCb3VuZHMpO1xuICAgICAgICAgICAgdGhpcy53b3JsZEJvdW5kc1RyYWlsWzFdLmNvcHkodGhpcy53b3JsZEJvdW5kcyk7XG5cbiAgICAgICAgICAgIHRoaXMud29ybGRCb3VuZHNTaXplLmNvcHkodGhpcy53b3JsZEJvdW5kcy5oYWxmRXh0ZW50cykubXVsU2NhbGFyKDIpO1xuICAgICAgICAgICAgdGhpcy5wcmV2V29ybGRCb3VuZHNTaXplLmNvcHkodGhpcy53b3JsZEJvdW5kc1NpemUpO1xuICAgICAgICAgICAgdGhpcy5wcmV2V29ybGRCb3VuZHNDZW50ZXIuY29weSh0aGlzLndvcmxkQm91bmRzLmNlbnRlcik7XG4gICAgICAgICAgICBpZiAodGhpcy5wYWNrOCkgdGhpcy5jYWxjdWxhdGVCb3VuZHNNYWQoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIER5bmFtaWMgc2ltdWxhdGlvbiBkYXRhXG4gICAgICAgIHRoaXMudmJUb1NvcnQgPSBuZXcgQXJyYXkodGhpcy5udW1QYXJ0aWNsZXMpO1xuICAgICAgICBmb3IgKGxldCBpU29ydCA9IDA7IGlTb3J0IDwgdGhpcy5udW1QYXJ0aWNsZXM7IGlTb3J0KyspIHRoaXMudmJUb1NvcnRbaVNvcnRdID0gWzAsIDBdO1xuICAgICAgICB0aGlzLnBhcnRpY2xlRGlzdGFuY2UgPSBuZXcgRmxvYXQzMkFycmF5KHRoaXMubnVtUGFydGljbGVzKTtcblxuICAgICAgICB0aGlzLl9ncHVVcGRhdGVyLnJhbmRvbWl6ZSgpO1xuXG4gICAgICAgIHRoaXMucGFydGljbGVUZXggPSBuZXcgRmxvYXQzMkFycmF5KHRoaXMubnVtUGFydGljbGVzUG90ICogcGFydGljbGVUZXhIZWlnaHQgKiBwYXJ0aWNsZVRleENoYW5uZWxzKTtcbiAgICAgICAgY29uc3QgZW1pdHRlclBvcyA9ICh0aGlzLm5vZGUgPT09IG51bGwgfHwgdGhpcy5sb2NhbFNwYWNlKSA/IFZlYzMuWkVSTyA6IHRoaXMubm9kZS5nZXRQb3NpdGlvbigpO1xuICAgICAgICBpZiAodGhpcy5lbWl0dGVyU2hhcGUgPT09IEVNSVRURVJTSEFQRV9CT1gpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLm5vZGUgPT09IG51bGwgfHwgdGhpcy5sb2NhbFNwYWNlKSB7XG4gICAgICAgICAgICAgICAgc3Bhd25NYXRyaXguc2V0VFJTKFZlYzMuWkVSTywgUXVhdC5JREVOVElUWSwgdGhpcy5zcGF3bkJvdW5kcyk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHNwYXduTWF0cml4LnNldFRSUyhWZWMzLlpFUk8sIHRoaXMubm9kZS5nZXRSb3RhdGlvbigpLCB0bXBWZWMzLmNvcHkodGhpcy5zcGF3bkJvdW5kcykubXVsKHRoaXMubm9kZS5sb2NhbFNjYWxlKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBleHRlbnRzSW5uZXJSYXRpb1VuaWZvcm1bMF0gPSB0aGlzLmVtaXR0ZXJFeHRlbnRzLnggIT09IDAgPyB0aGlzLmVtaXR0ZXJFeHRlbnRzSW5uZXIueCAvIHRoaXMuZW1pdHRlckV4dGVudHMueCA6IDA7XG4gICAgICAgICAgICBleHRlbnRzSW5uZXJSYXRpb1VuaWZvcm1bMV0gPSB0aGlzLmVtaXR0ZXJFeHRlbnRzLnkgIT09IDAgPyB0aGlzLmVtaXR0ZXJFeHRlbnRzSW5uZXIueSAvIHRoaXMuZW1pdHRlckV4dGVudHMueSA6IDA7XG4gICAgICAgICAgICBleHRlbnRzSW5uZXJSYXRpb1VuaWZvcm1bMl0gPSB0aGlzLmVtaXR0ZXJFeHRlbnRzLnogIT09IDAgPyB0aGlzLmVtaXR0ZXJFeHRlbnRzSW5uZXIueiAvIHRoaXMuZW1pdHRlckV4dGVudHMueiA6IDA7XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLm51bVBhcnRpY2xlczsgaSsrKSB7XG4gICAgICAgICAgICB0aGlzLl9jcHVVcGRhdGVyLmNhbGNTcGF3blBvc2l0aW9uKHRoaXMucGFydGljbGVUZXgsIHNwYXduTWF0cml4LCBleHRlbnRzSW5uZXJSYXRpb1VuaWZvcm0sIGVtaXR0ZXJQb3MsIGkpO1xuICAgICAgICAgICAgaWYgKHRoaXMudXNlQ3B1KSB0aGlzLnBhcnRpY2xlVGV4W2kgKiBwYXJ0aWNsZVRleENoYW5uZWxzICsgMyArIHRoaXMubnVtUGFydGljbGVzUG90ICogMiAqIHBhcnRpY2xlVGV4Q2hhbm5lbHNdID0gMTsgLy8gaGlkZS9zaG93XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnBhcnRpY2xlVGV4U3RhcnQgPSBuZXcgRmxvYXQzMkFycmF5KHRoaXMubnVtUGFydGljbGVzUG90ICogcGFydGljbGVUZXhIZWlnaHQgKiBwYXJ0aWNsZVRleENoYW5uZWxzKTtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLnBhcnRpY2xlVGV4U3RhcnQubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHRoaXMucGFydGljbGVUZXhTdGFydFtpXSA9IHRoaXMucGFydGljbGVUZXhbaV07XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIXRoaXMudXNlQ3B1KSB7XG4gICAgICAgICAgICBpZiAodGhpcy5wYWNrOCkge1xuICAgICAgICAgICAgICAgIHRoaXMucGFydGljbGVUZXhJTiA9IF9jcmVhdGVUZXh0dXJlKGdkLCB0aGlzLm51bVBhcnRpY2xlc1BvdCwgcGFydGljbGVUZXhIZWlnaHQsIHRoaXMucGFydGljbGVUZXgsIFBJWEVMRk9STUFUX1JHQkE4LCAxLCBmYWxzZSk7XG4gICAgICAgICAgICAgICAgdGhpcy5wYXJ0aWNsZVRleE9VVCA9IF9jcmVhdGVUZXh0dXJlKGdkLCB0aGlzLm51bVBhcnRpY2xlc1BvdCwgcGFydGljbGVUZXhIZWlnaHQsIHRoaXMucGFydGljbGVUZXgsIFBJWEVMRk9STUFUX1JHQkE4LCAxLCBmYWxzZSk7XG4gICAgICAgICAgICAgICAgdGhpcy5wYXJ0aWNsZVRleFN0YXJ0ID0gX2NyZWF0ZVRleHR1cmUoZ2QsIHRoaXMubnVtUGFydGljbGVzUG90LCBwYXJ0aWNsZVRleEhlaWdodCwgdGhpcy5wYXJ0aWNsZVRleFN0YXJ0LCBQSVhFTEZPUk1BVF9SR0JBOCwgMSwgZmFsc2UpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLnBhcnRpY2xlVGV4SU4gPSBfY3JlYXRlVGV4dHVyZShnZCwgdGhpcy5udW1QYXJ0aWNsZXNQb3QsIHBhcnRpY2xlVGV4SGVpZ2h0LCB0aGlzLnBhcnRpY2xlVGV4KTtcbiAgICAgICAgICAgICAgICB0aGlzLnBhcnRpY2xlVGV4T1VUID0gX2NyZWF0ZVRleHR1cmUoZ2QsIHRoaXMubnVtUGFydGljbGVzUG90LCBwYXJ0aWNsZVRleEhlaWdodCwgdGhpcy5wYXJ0aWNsZVRleCk7XG4gICAgICAgICAgICAgICAgdGhpcy5wYXJ0aWNsZVRleFN0YXJ0ID0gX2NyZWF0ZVRleHR1cmUoZ2QsIHRoaXMubnVtUGFydGljbGVzUG90LCBwYXJ0aWNsZVRleEhlaWdodCwgdGhpcy5wYXJ0aWNsZVRleFN0YXJ0KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5ydFBhcnRpY2xlVGV4SU4gPSBuZXcgUmVuZGVyVGFyZ2V0KHtcbiAgICAgICAgICAgICAgICBjb2xvckJ1ZmZlcjogdGhpcy5wYXJ0aWNsZVRleElOLFxuICAgICAgICAgICAgICAgIGRlcHRoOiBmYWxzZVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB0aGlzLnJ0UGFydGljbGVUZXhPVVQgPSBuZXcgUmVuZGVyVGFyZ2V0KHtcbiAgICAgICAgICAgICAgICBjb2xvckJ1ZmZlcjogdGhpcy5wYXJ0aWNsZVRleE9VVCxcbiAgICAgICAgICAgICAgICBkZXB0aDogZmFsc2VcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgdGhpcy5zd2FwVGV4ID0gZmFsc2U7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBzaGFkZXJDb2RlU3RhcnQgPSAodGhpcy5sb2NhbFNwYWNlID8gJyNkZWZpbmUgTE9DQUxfU1BBQ0VcXG4nIDogJycpICsgc2hhZGVyQ2h1bmtzLnBhcnRpY2xlVXBkYXRlckluaXRQUyArXG4gICAgICAgICh0aGlzLnBhY2s4ID8gKHNoYWRlckNodW5rcy5wYXJ0aWNsZUlucHV0UmdiYThQUyArIHNoYWRlckNodW5rcy5wYXJ0aWNsZU91dHB1dFJnYmE4UFMpIDpcbiAgICAgICAgICAgIChzaGFkZXJDaHVua3MucGFydGljbGVJbnB1dEZsb2F0UFMgKyBzaGFkZXJDaHVua3MucGFydGljbGVPdXRwdXRGbG9hdFBTKSkgK1xuICAgICAgICAodGhpcy5lbWl0dGVyU2hhcGUgPT09IEVNSVRURVJTSEFQRV9CT1ggPyBzaGFkZXJDaHVua3MucGFydGljbGVVcGRhdGVyQUFCQlBTIDogc2hhZGVyQ2h1bmtzLnBhcnRpY2xlVXBkYXRlclNwaGVyZVBTKSArXG4gICAgICAgIHNoYWRlckNodW5rcy5wYXJ0aWNsZVVwZGF0ZXJTdGFydFBTO1xuICAgICAgICBjb25zdCBzaGFkZXJDb2RlUmVzcGF3biA9IHNoYWRlckNvZGVTdGFydCArIHNoYWRlckNodW5rcy5wYXJ0aWNsZVVwZGF0ZXJSZXNwYXduUFMgKyBzaGFkZXJDaHVua3MucGFydGljbGVVcGRhdGVyRW5kUFM7XG4gICAgICAgIGNvbnN0IHNoYWRlckNvZGVOb1Jlc3Bhd24gPSBzaGFkZXJDb2RlU3RhcnQgKyBzaGFkZXJDaHVua3MucGFydGljbGVVcGRhdGVyTm9SZXNwYXduUFMgKyBzaGFkZXJDaHVua3MucGFydGljbGVVcGRhdGVyRW5kUFM7XG4gICAgICAgIGNvbnN0IHNoYWRlckNvZGVPblN0b3AgPSBzaGFkZXJDb2RlU3RhcnQgKyBzaGFkZXJDaHVua3MucGFydGljbGVVcGRhdGVyT25TdG9wUFMgKyBzaGFkZXJDaHVua3MucGFydGljbGVVcGRhdGVyRW5kUFM7XG5cbiAgICAgICAgLy8gTm90ZTogY3JlYXRlU2hhZGVyRnJvbUNvZGUgY2FuIHJldHVybiBhIHNoYWRlciBmcm9tIHRoZSBjYWNoZSAobm90IGEgbmV3IHNoYWRlcikgc28gd2UgKnNob3VsZCBub3QqIGRlbGV0ZSB0aGVzZSBzaGFkZXJzXG4gICAgICAgIC8vIHdoZW4gdGhlIHBhcnRpY2xlIGVtaXR0ZXIgaXMgZGVzdHJveWVkXG4gICAgICAgIGNvbnN0IHBhcmFtcyA9IHRoaXMuZW1pdHRlclNoYXBlICsgJycgKyB0aGlzLnBhY2s4ICsgJycgKyB0aGlzLmxvY2FsU3BhY2U7XG4gICAgICAgIHRoaXMuc2hhZGVyUGFydGljbGVVcGRhdGVSZXNwYXduID0gY3JlYXRlU2hhZGVyRnJvbUNvZGUoZ2QsIHNoYWRlckNodW5rcy5mdWxsc2NyZWVuUXVhZFZTLCBzaGFkZXJDb2RlUmVzcGF3biwgJ2ZzUXVhZDAnICsgcGFyYW1zKTtcbiAgICAgICAgdGhpcy5zaGFkZXJQYXJ0aWNsZVVwZGF0ZU5vUmVzcGF3biA9IGNyZWF0ZVNoYWRlckZyb21Db2RlKGdkLCBzaGFkZXJDaHVua3MuZnVsbHNjcmVlblF1YWRWUywgc2hhZGVyQ29kZU5vUmVzcGF3biwgJ2ZzUXVhZDEnICsgcGFyYW1zKTtcbiAgICAgICAgdGhpcy5zaGFkZXJQYXJ0aWNsZVVwZGF0ZU9uU3RvcCA9IGNyZWF0ZVNoYWRlckZyb21Db2RlKGdkLCBzaGFkZXJDaHVua3MuZnVsbHNjcmVlblF1YWRWUywgc2hhZGVyQ29kZU9uU3RvcCwgJ2ZzUXVhZDInICsgcGFyYW1zKTtcblxuICAgICAgICB0aGlzLm51bVBhcnRpY2xlVmVydHMgPSB0aGlzLnVzZU1lc2ggPyB0aGlzLm1lc2gudmVydGV4QnVmZmVyLm51bVZlcnRpY2VzIDogNDtcbiAgICAgICAgdGhpcy5udW1QYXJ0aWNsZUluZGljZXMgPSB0aGlzLnVzZU1lc2ggPyB0aGlzLm1lc2guaW5kZXhCdWZmZXJbMF0ubnVtSW5kaWNlcyA6IDY7XG4gICAgICAgIHRoaXMuX2FsbG9jYXRlKHRoaXMubnVtUGFydGljbGVzKTtcblxuICAgICAgICBjb25zdCBtZXNoID0gbmV3IE1lc2goZ2QpO1xuICAgICAgICBtZXNoLnZlcnRleEJ1ZmZlciA9IHRoaXMudmVydGV4QnVmZmVyO1xuICAgICAgICBtZXNoLmluZGV4QnVmZmVyWzBdID0gdGhpcy5pbmRleEJ1ZmZlcjtcbiAgICAgICAgbWVzaC5wcmltaXRpdmVbMF0udHlwZSA9IFBSSU1JVElWRV9UUklBTkdMRVM7XG4gICAgICAgIG1lc2gucHJpbWl0aXZlWzBdLmJhc2UgPSAwO1xuICAgICAgICBtZXNoLnByaW1pdGl2ZVswXS5jb3VudCA9ICh0aGlzLm51bVBhcnRpY2xlcyAqIHRoaXMubnVtUGFydGljbGVJbmRpY2VzKTtcbiAgICAgICAgbWVzaC5wcmltaXRpdmVbMF0uaW5kZXhlZCA9IHRydWU7XG5cbiAgICAgICAgdGhpcy5tYXRlcmlhbCA9IG5ldyBNYXRlcmlhbCgpO1xuICAgICAgICB0aGlzLm1hdGVyaWFsLm5hbWUgPSB0aGlzLm5vZGUubmFtZTtcbiAgICAgICAgdGhpcy5tYXRlcmlhbC5jdWxsID0gQ1VMTEZBQ0VfTk9ORTtcbiAgICAgICAgdGhpcy5tYXRlcmlhbC5hbHBoYVdyaXRlID0gZmFsc2U7XG4gICAgICAgIHRoaXMubWF0ZXJpYWwuYmxlbmRUeXBlID0gdGhpcy5ibGVuZFR5cGU7XG5cbiAgICAgICAgdGhpcy5tYXRlcmlhbC5kZXB0aFdyaXRlID0gdGhpcy5kZXB0aFdyaXRlO1xuICAgICAgICB0aGlzLm1hdGVyaWFsLmVtaXR0ZXIgPSB0aGlzO1xuXG4gICAgICAgIHRoaXMucmVnZW5TaGFkZXIoKTtcbiAgICAgICAgdGhpcy5yZXNldE1hdGVyaWFsKCk7XG5cbiAgICAgICAgY29uc3Qgd2FzVmlzaWJsZSA9IHRoaXMubWVzaEluc3RhbmNlID8gdGhpcy5tZXNoSW5zdGFuY2UudmlzaWJsZSA6IHRydWU7XG4gICAgICAgIHRoaXMubWVzaEluc3RhbmNlID0gbmV3IE1lc2hJbnN0YW5jZShtZXNoLCB0aGlzLm1hdGVyaWFsLCB0aGlzLm5vZGUpO1xuICAgICAgICB0aGlzLm1lc2hJbnN0YW5jZS5waWNrID0gZmFsc2U7XG4gICAgICAgIHRoaXMubWVzaEluc3RhbmNlLnVwZGF0ZUtleSgpOyAvLyBzaG91bGRuJ3QgYmUgaGVyZT9cbiAgICAgICAgdGhpcy5tZXNoSW5zdGFuY2UuY3VsbCA9IHRydWU7XG4gICAgICAgIHRoaXMubWVzaEluc3RhbmNlLl9ub0RlcHRoRHJhd0dsMSA9IHRydWU7XG4gICAgICAgIGlmICh0aGlzLmxvY2FsU3BhY2UpIHtcbiAgICAgICAgICAgIHRoaXMubWVzaEluc3RhbmNlLmFhYmIuc2V0RnJvbVRyYW5zZm9ybWVkQWFiYih0aGlzLndvcmxkQm91bmRzLCB0aGlzLm5vZGUuZ2V0V29ybGRUcmFuc2Zvcm0oKSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLm1lc2hJbnN0YW5jZS5hYWJiLmNvcHkodGhpcy53b3JsZEJvdW5kcyk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5tZXNoSW5zdGFuY2UuX3VwZGF0ZUFhYmIgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5tZXNoSW5zdGFuY2UudmlzaWJsZSA9IHdhc1Zpc2libGU7XG5cbiAgICAgICAgdGhpcy5faW5pdGlhbGl6ZVRleHR1cmVzKCk7XG5cbiAgICAgICAgdGhpcy5yZXNldFRpbWUoKTtcblxuICAgICAgICB0aGlzLmFkZFRpbWUoMCwgZmFsc2UpOyAvLyBmaWxsIGR5bmFtaWMgdGV4dHVyZXMgYW5kIGNvbnN0YW50cyB3aXRoIGluaXRpYWwgZGF0YVxuICAgICAgICBpZiAodGhpcy5wcmVXYXJtKSB0aGlzLnByZXdhcm0odGhpcy5saWZldGltZSk7XG4gICAgfVxuXG4gICAgX2lzQW5pbWF0ZWQoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmFuaW1OdW1GcmFtZXMgPj0gMSAmJlxuICAgICAgICAgICAgICAgKHRoaXMuYW5pbVRpbGVzWCA+IDEgfHwgdGhpcy5hbmltVGlsZXNZID4gMSkgJiZcbiAgICAgICAgICAgICAgICh0aGlzLmNvbG9yTWFwICYmIHRoaXMuY29sb3JNYXAgIT09IHRoaXMuZGVmYXVsdFBhcmFtVGV4dHVyZSB8fCB0aGlzLm5vcm1hbE1hcCk7XG4gICAgfVxuXG4gICAgcmVidWlsZEdyYXBocygpIHtcbiAgICAgICAgY29uc3QgcHJlY2lzaW9uID0gdGhpcy5wcmVjaXNpb247XG4gICAgICAgIGNvbnN0IGdkID0gdGhpcy5ncmFwaGljc0RldmljZTtcblxuICAgICAgICB0aGlzLnFMb2NhbFZlbG9jaXR5ID0gdGhpcy5sb2NhbFZlbG9jaXR5R3JhcGgucXVhbnRpemUocHJlY2lzaW9uKTtcbiAgICAgICAgdGhpcy5xVmVsb2NpdHkgPSB0aGlzLnZlbG9jaXR5R3JhcGgucXVhbnRpemUocHJlY2lzaW9uKTtcbiAgICAgICAgdGhpcy5xQ29sb3IgPSAgICAgICAgIHRoaXMuY29sb3JHcmFwaC5xdWFudGl6ZUNsYW1wZWQocHJlY2lzaW9uLCAwLCAxKTtcbiAgICAgICAgdGhpcy5xUm90U3BlZWQgPSAgICAgIHRoaXMucm90YXRpb25TcGVlZEdyYXBoLnF1YW50aXplKHByZWNpc2lvbik7XG4gICAgICAgIHRoaXMucVNjYWxlID0gICAgICAgICB0aGlzLnNjYWxlR3JhcGgucXVhbnRpemUocHJlY2lzaW9uKTtcbiAgICAgICAgdGhpcy5xQWxwaGEgPSAgICAgICAgIHRoaXMuYWxwaGFHcmFwaC5xdWFudGl6ZShwcmVjaXNpb24pO1xuICAgICAgICB0aGlzLnFSYWRpYWxTcGVlZCA9ICAgdGhpcy5yYWRpYWxTcGVlZEdyYXBoLnF1YW50aXplKHByZWNpc2lvbik7XG5cbiAgICAgICAgdGhpcy5xTG9jYWxWZWxvY2l0eTIgPSB0aGlzLmxvY2FsVmVsb2NpdHlHcmFwaDIucXVhbnRpemUocHJlY2lzaW9uKTtcbiAgICAgICAgdGhpcy5xVmVsb2NpdHkyID0gICAgICB0aGlzLnZlbG9jaXR5R3JhcGgyLnF1YW50aXplKHByZWNpc2lvbik7XG4gICAgICAgIHRoaXMucUNvbG9yMiA9ICAgICAgICAgdGhpcy5jb2xvckdyYXBoMi5xdWFudGl6ZUNsYW1wZWQocHJlY2lzaW9uLCAwLCAxKTtcbiAgICAgICAgdGhpcy5xUm90U3BlZWQyID0gICAgICB0aGlzLnJvdGF0aW9uU3BlZWRHcmFwaDIucXVhbnRpemUocHJlY2lzaW9uKTtcbiAgICAgICAgdGhpcy5xU2NhbGUyID0gICAgICAgICB0aGlzLnNjYWxlR3JhcGgyLnF1YW50aXplKHByZWNpc2lvbik7XG4gICAgICAgIHRoaXMucUFscGhhMiA9ICAgICAgICAgdGhpcy5hbHBoYUdyYXBoMi5xdWFudGl6ZShwcmVjaXNpb24pO1xuICAgICAgICB0aGlzLnFSYWRpYWxTcGVlZDIgPSAgIHRoaXMucmFkaWFsU3BlZWRHcmFwaDIucXVhbnRpemUocHJlY2lzaW9uKTtcblxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHByZWNpc2lvbjsgaSsrKSB7XG4gICAgICAgICAgICB0aGlzLnFSb3RTcGVlZFtpXSAqPSBtYXRoLkRFR19UT19SQUQ7XG4gICAgICAgICAgICB0aGlzLnFSb3RTcGVlZDJbaV0gKj0gbWF0aC5ERUdfVE9fUkFEO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5sb2NhbFZlbG9jaXR5VU1heCA9IG5ldyBGbG9hdDMyQXJyYXkoMyk7XG4gICAgICAgIHRoaXMudmVsb2NpdHlVTWF4ID0gbmV3IEZsb2F0MzJBcnJheSgzKTtcbiAgICAgICAgdGhpcy5jb2xvclVNYXggPSBuZXcgRmxvYXQzMkFycmF5KDMpO1xuICAgICAgICB0aGlzLnJvdFNwZWVkVU1heCA9IFswXTtcbiAgICAgICAgdGhpcy5zY2FsZVVNYXggPSAgICBbMF07XG4gICAgICAgIHRoaXMuYWxwaGFVTWF4ID0gICAgWzBdO1xuICAgICAgICB0aGlzLnJhZGlhbFNwZWVkVU1heCA9IFswXTtcbiAgICAgICAgdGhpcy5xTG9jYWxWZWxvY2l0eURpdiA9IGRpdkdyYXBoRnJvbTJDdXJ2ZXModGhpcy5xTG9jYWxWZWxvY2l0eSwgdGhpcy5xTG9jYWxWZWxvY2l0eTIsIHRoaXMubG9jYWxWZWxvY2l0eVVNYXgpO1xuICAgICAgICB0aGlzLnFWZWxvY2l0eURpdiA9ICAgICAgZGl2R3JhcGhGcm9tMkN1cnZlcyh0aGlzLnFWZWxvY2l0eSwgdGhpcy5xVmVsb2NpdHkyLCB0aGlzLnZlbG9jaXR5VU1heCk7XG4gICAgICAgIHRoaXMucUNvbG9yRGl2ID0gICAgICAgICBkaXZHcmFwaEZyb20yQ3VydmVzKHRoaXMucUNvbG9yLCB0aGlzLnFDb2xvcjIsIHRoaXMuY29sb3JVTWF4KTtcbiAgICAgICAgdGhpcy5xUm90U3BlZWREaXYgPSAgICAgIGRpdkdyYXBoRnJvbTJDdXJ2ZXModGhpcy5xUm90U3BlZWQsIHRoaXMucVJvdFNwZWVkMiwgdGhpcy5yb3RTcGVlZFVNYXgpO1xuICAgICAgICB0aGlzLnFTY2FsZURpdiA9ICAgICAgICAgZGl2R3JhcGhGcm9tMkN1cnZlcyh0aGlzLnFTY2FsZSwgdGhpcy5xU2NhbGUyLCB0aGlzLnNjYWxlVU1heCk7XG4gICAgICAgIHRoaXMucUFscGhhRGl2ID0gICAgICAgICBkaXZHcmFwaEZyb20yQ3VydmVzKHRoaXMucUFscGhhLCB0aGlzLnFBbHBoYTIsIHRoaXMuYWxwaGFVTWF4KTtcbiAgICAgICAgdGhpcy5xUmFkaWFsU3BlZWREaXYgPSAgIGRpdkdyYXBoRnJvbTJDdXJ2ZXModGhpcy5xUmFkaWFsU3BlZWQsIHRoaXMucVJhZGlhbFNwZWVkMiwgdGhpcy5yYWRpYWxTcGVlZFVNYXgpO1xuXG4gICAgICAgIGlmICh0aGlzLnBhY2s4KSB7XG4gICAgICAgICAgICBjb25zdCB1bWF4ID0gWzAsIDAsIDBdO1xuICAgICAgICAgICAgbWF4VW5zaWduZWRHcmFwaFZhbHVlKHRoaXMucVZlbG9jaXR5LCB1bWF4KTtcbiAgICAgICAgICAgIGNvbnN0IHVtYXgyID0gWzAsIDAsIDBdO1xuICAgICAgICAgICAgbWF4VW5zaWduZWRHcmFwaFZhbHVlKHRoaXMucVZlbG9jaXR5MiwgdW1heDIpO1xuXG4gICAgICAgICAgICBjb25zdCBsdW1heCA9IFswLCAwLCAwXTtcbiAgICAgICAgICAgIG1heFVuc2lnbmVkR3JhcGhWYWx1ZSh0aGlzLnFMb2NhbFZlbG9jaXR5LCBsdW1heCk7XG4gICAgICAgICAgICBjb25zdCBsdW1heDIgPSBbMCwgMCwgMF07XG4gICAgICAgICAgICBtYXhVbnNpZ25lZEdyYXBoVmFsdWUodGhpcy5xTG9jYWxWZWxvY2l0eTIsIGx1bWF4Mik7XG5cbiAgICAgICAgICAgIGNvbnN0IHJ1bWF4ID0gWzBdO1xuICAgICAgICAgICAgbWF4VW5zaWduZWRHcmFwaFZhbHVlKHRoaXMucVJhZGlhbFNwZWVkLCBydW1heCk7XG4gICAgICAgICAgICBjb25zdCBydW1heDIgPSBbMF07XG4gICAgICAgICAgICBtYXhVbnNpZ25lZEdyYXBoVmFsdWUodGhpcy5xUmFkaWFsU3BlZWQyLCBydW1heDIpO1xuXG4gICAgICAgICAgICBsZXQgbWF4VmVsID0gTWF0aC5tYXgodW1heFswXSwgdW1heDJbMF0pO1xuICAgICAgICAgICAgbWF4VmVsID0gTWF0aC5tYXgobWF4VmVsLCB1bWF4WzFdKTtcbiAgICAgICAgICAgIG1heFZlbCA9IE1hdGgubWF4KG1heFZlbCwgdW1heDJbMV0pO1xuICAgICAgICAgICAgbWF4VmVsID0gTWF0aC5tYXgobWF4VmVsLCB1bWF4WzJdKTtcbiAgICAgICAgICAgIG1heFZlbCA9IE1hdGgubWF4KG1heFZlbCwgdW1heDJbMl0pO1xuXG4gICAgICAgICAgICBsZXQgbG1heFZlbCA9IE1hdGgubWF4KGx1bWF4WzBdLCBsdW1heDJbMF0pO1xuICAgICAgICAgICAgbG1heFZlbCA9IE1hdGgubWF4KGxtYXhWZWwsIGx1bWF4WzFdKTtcbiAgICAgICAgICAgIGxtYXhWZWwgPSBNYXRoLm1heChsbWF4VmVsLCBsdW1heDJbMV0pO1xuICAgICAgICAgICAgbG1heFZlbCA9IE1hdGgubWF4KGxtYXhWZWwsIGx1bWF4WzJdKTtcbiAgICAgICAgICAgIGxtYXhWZWwgPSBNYXRoLm1heChsbWF4VmVsLCBsdW1heDJbMl0pO1xuXG4gICAgICAgICAgICBjb25zdCBtYXhSYWQgPSBNYXRoLm1heChydW1heFswXSwgcnVtYXgyWzBdKTtcblxuICAgICAgICAgICAgdGhpcy5tYXhWZWwgPSBtYXhWZWwgKyBsbWF4VmVsICsgbWF4UmFkO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCF0aGlzLnVzZUNwdSkge1xuICAgICAgICAgICAgdGhpcy5pbnRlcm5hbFRleDAgPSBfY3JlYXRlVGV4dHVyZShnZCwgcHJlY2lzaW9uLCAxLCBwYWNrVGV4dHVyZVhZWl9OWFlaKHRoaXMucUxvY2FsVmVsb2NpdHksIHRoaXMucUxvY2FsVmVsb2NpdHlEaXYpKTtcbiAgICAgICAgICAgIHRoaXMuaW50ZXJuYWxUZXgxID0gX2NyZWF0ZVRleHR1cmUoZ2QsIHByZWNpc2lvbiwgMSwgcGFja1RleHR1cmVYWVpfTlhZWih0aGlzLnFWZWxvY2l0eSwgdGhpcy5xVmVsb2NpdHlEaXYpKTtcbiAgICAgICAgICAgIHRoaXMuaW50ZXJuYWxUZXgyID0gX2NyZWF0ZVRleHR1cmUoZ2QsIHByZWNpc2lvbiwgMSwgcGFja1RleHR1cmU1RmxvYXRzKHRoaXMucVJvdFNwZWVkLCB0aGlzLnFTY2FsZSwgdGhpcy5xU2NhbGVEaXYsIHRoaXMucVJvdFNwZWVkRGl2LCB0aGlzLnFBbHBoYURpdikpO1xuICAgICAgICAgICAgdGhpcy5pbnRlcm5hbFRleDMgPSBfY3JlYXRlVGV4dHVyZShnZCwgcHJlY2lzaW9uLCAxLCBwYWNrVGV4dHVyZTJGbG9hdHModGhpcy5xUmFkaWFsU3BlZWQsIHRoaXMucVJhZGlhbFNwZWVkRGl2KSk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5jb2xvclBhcmFtID0gX2NyZWF0ZVRleHR1cmUoZ2QsIHByZWNpc2lvbiwgMSwgcGFja1RleHR1cmVSR0JBKHRoaXMucUNvbG9yLCB0aGlzLnFBbHBoYSksIFBJWEVMRk9STUFUX1JHQkE4LCAxLjAsIHRydWUpO1xuICAgIH1cblxuICAgIF9pbml0aWFsaXplVGV4dHVyZXMoKSB7XG4gICAgICAgIGlmICh0aGlzLmNvbG9yTWFwKSB7XG4gICAgICAgICAgICB0aGlzLm1hdGVyaWFsLnNldFBhcmFtZXRlcignY29sb3JNYXAnLCB0aGlzLmNvbG9yTWFwKTtcbiAgICAgICAgICAgIGlmICh0aGlzLmxpZ2h0aW5nICYmIHRoaXMubm9ybWFsTWFwKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5tYXRlcmlhbC5zZXRQYXJhbWV0ZXIoJ25vcm1hbE1hcCcsIHRoaXMubm9ybWFsTWFwKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJlZ2VuU2hhZGVyKCkge1xuICAgICAgICBjb25zdCBwcm9ncmFtTGliID0gZ2V0UHJvZ3JhbUxpYnJhcnkodGhpcy5ncmFwaGljc0RldmljZSk7XG4gICAgICAgIHByb2dyYW1MaWIucmVnaXN0ZXIoJ3BhcnRpY2xlJywgcGFydGljbGUpO1xuXG4gICAgICAgIGNvbnN0IGhhc05vcm1hbCA9ICh0aGlzLm5vcm1hbE1hcCAhPT0gbnVsbCk7XG4gICAgICAgIHRoaXMubm9ybWFsT3B0aW9uID0gMDtcbiAgICAgICAgaWYgKHRoaXMubGlnaHRpbmcpIHtcbiAgICAgICAgICAgIHRoaXMubm9ybWFsT3B0aW9uID0gaGFzTm9ybWFsID8gMiA6IDE7XG4gICAgICAgIH1cbiAgICAgICAgLy8gZ2V0U2hhZGVyVmFyaWFudCBpcyBhbHNvIGNhbGxlZCBieSBwYy5TY2VuZSB3aGVuIGFsbCBzaGFkZXJzIG5lZWQgdG8gYmUgdXBkYXRlZFxuICAgICAgICB0aGlzLm1hdGVyaWFsLmdldFNoYWRlclZhcmlhbnQgPSBmdW5jdGlvbiAoZGV2LCBzYywgZGVmcywgdW51c2VkLCBwYXNzLCBzb3J0ZWRMaWdodHMsIHZpZXdVbmlmb3JtRm9ybWF0LCB2aWV3QmluZEdyb3VwRm9ybWF0KSB7XG5cbiAgICAgICAgICAgIC8vIFRoZSBhcHAgd29ya3MgbGlrZSB0aGlzOlxuICAgICAgICAgICAgLy8gMS4gRW1pdHRlciBpbml0XG4gICAgICAgICAgICAvLyAyLiBVcGRhdGUuIE5vIGNhbWVyYSBpcyBhc3NpZ25lZCB0byBlbWl0dGVyc1xuICAgICAgICAgICAgLy8gMy4gUmVuZGVyOyBhY3RpdmVDYW1lcmEgPSBjYW1lcmE7IHNoYWRlciBpbml0XG4gICAgICAgICAgICAvLyA0LiBVcGRhdGUuIGFjdGl2ZUNhbWVyYSBpcyBzZXQgdG8gZW1pdHRlcnNcbiAgICAgICAgICAgIC8vIC0tLS0tXG4gICAgICAgICAgICAvLyBUaGUgcHJvYmxlbSB3aXRoIDFzdCBmcmFtZSByZW5kZXIgaXMgdGhhdCB3ZSBpbml0IHRoZSBzaGFkZXIgd2l0aG91dCBoYXZpbmcgYW55IGNhbWVyYSBzZXQgdG8gZW1pdHRlciAtXG4gICAgICAgICAgICAvLyBzbyB3cm9uZyBzaGFkZXIgaXMgYmVpbmcgY29tcGlsZWQuXG4gICAgICAgICAgICAvLyBUbyBmaXggaXQsIHdlIG5lZWQgdG8gY2hlY2sgYWN0aXZlQ2FtZXJhIT1lbWl0dGVyLmNhbWVyYSBpbiBzaGFkZXIgaW5pdCB0b29cbiAgICAgICAgICAgIGlmICh0aGlzLmVtaXR0ZXIuc2NlbmUpIHtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5lbWl0dGVyLmNhbWVyYSAhPT0gdGhpcy5lbWl0dGVyLnNjZW5lLl9hY3RpdmVDYW1lcmEpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5lbWl0dGVyLmNhbWVyYSA9IHRoaXMuZW1pdHRlci5zY2VuZS5fYWN0aXZlQ2FtZXJhO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmVtaXR0ZXIub25DaGFuZ2VDYW1lcmEoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIHNldCBieSBFZGl0b3IgaWYgcnVubmluZyBpbnNpZGUgZWRpdG9yXG4gICAgICAgICAgICBjb25zdCBpblRvb2xzID0gdGhpcy5lbWl0dGVyLmluVG9vbHM7XG4gICAgICAgICAgICBjb25zdCBwcm9jZXNzaW5nT3B0aW9ucyA9IG5ldyBTaGFkZXJQcm9jZXNzb3JPcHRpb25zKHZpZXdVbmlmb3JtRm9ybWF0LCB2aWV3QmluZEdyb3VwRm9ybWF0KTtcblxuICAgICAgICAgICAgY29uc3Qgc2hhZGVyID0gcHJvZ3JhbUxpYi5nZXRQcm9ncmFtKCdwYXJ0aWNsZScsIHtcbiAgICAgICAgICAgICAgICBwYXNzOiBTSEFERVJfRk9SV0FSRCxcbiAgICAgICAgICAgICAgICB1c2VDcHU6IHRoaXMuZW1pdHRlci51c2VDcHUsXG4gICAgICAgICAgICAgICAgbm9ybWFsOiB0aGlzLmVtaXR0ZXIubm9ybWFsT3B0aW9uLFxuICAgICAgICAgICAgICAgIGhhbGZsYW1iZXJ0OiB0aGlzLmVtaXR0ZXIuaGFsZkxhbWJlcnQsXG4gICAgICAgICAgICAgICAgc3RyZXRjaDogdGhpcy5lbWl0dGVyLnN0cmV0Y2gsXG4gICAgICAgICAgICAgICAgYWxpZ25Ub01vdGlvbjogdGhpcy5lbWl0dGVyLmFsaWduVG9Nb3Rpb24sXG4gICAgICAgICAgICAgICAgc29mdDogdGhpcy5lbWl0dGVyLmRlcHRoU29mdGVuaW5nLFxuICAgICAgICAgICAgICAgIG1lc2g6IHRoaXMuZW1pdHRlci51c2VNZXNoLFxuICAgICAgICAgICAgICAgIGdhbW1hOiB0aGlzLmVtaXR0ZXIuc2NlbmUgPyB0aGlzLmVtaXR0ZXIuc2NlbmUuZ2FtbWFDb3JyZWN0aW9uIDogMCxcbiAgICAgICAgICAgICAgICB0b25lTWFwOiB0aGlzLmVtaXR0ZXIuc2NlbmUgPyB0aGlzLmVtaXR0ZXIuc2NlbmUudG9uZU1hcHBpbmcgOiAwLFxuICAgICAgICAgICAgICAgIGZvZzogKHRoaXMuZW1pdHRlci5zY2VuZSAmJiAhdGhpcy5lbWl0dGVyLm5vRm9nKSA/IHRoaXMuZW1pdHRlci5zY2VuZS5mb2cgOiAnbm9uZScsXG4gICAgICAgICAgICAgICAgd3JhcDogdGhpcy5lbWl0dGVyLndyYXAgJiYgdGhpcy5lbWl0dGVyLndyYXBCb3VuZHMsXG4gICAgICAgICAgICAgICAgbG9jYWxTcGFjZTogdGhpcy5lbWl0dGVyLmxvY2FsU3BhY2UsXG5cbiAgICAgICAgICAgICAgICAvLyBpbiBFZGl0b3IsIHNjcmVlbiBzcGFjZSBwYXJ0aWNsZXMgKGNoaWxkcmVuIG9mIDJEIFNjcmVlbikgYXJlIHN0aWxsIHJlbmRlcmVkIGluIDNkIHNwYWNlXG4gICAgICAgICAgICAgICAgc2NyZWVuU3BhY2U6IGluVG9vbHMgPyBmYWxzZSA6IHRoaXMuZW1pdHRlci5zY3JlZW5TcGFjZSxcblxuICAgICAgICAgICAgICAgIGJsZW5kOiB0aGlzLmJsZW5kVHlwZSxcbiAgICAgICAgICAgICAgICBhbmltVGV4OiB0aGlzLmVtaXR0ZXIuX2lzQW5pbWF0ZWQoKSxcbiAgICAgICAgICAgICAgICBhbmltVGV4TG9vcDogdGhpcy5lbWl0dGVyLmFuaW1Mb29wLFxuICAgICAgICAgICAgICAgIHBhY2s4OiB0aGlzLmVtaXR0ZXIucGFjazgsXG4gICAgICAgICAgICAgICAgY3VzdG9tRmFjZTogdGhpcy5lbWl0dGVyLm9yaWVudGF0aW9uICE9PSBQQVJUSUNMRU9SSUVOVEFUSU9OX1NDUkVFTlxuICAgICAgICAgICAgfSwgcHJvY2Vzc2luZ09wdGlvbnMpO1xuXG4gICAgICAgICAgICByZXR1cm4gc2hhZGVyO1xuICAgICAgICB9O1xuICAgICAgICB0aGlzLm1hdGVyaWFsLnNoYWRlciA9IHRoaXMubWF0ZXJpYWwuZ2V0U2hhZGVyVmFyaWFudCgpO1xuICAgIH1cblxuICAgIHJlc2V0TWF0ZXJpYWwoKSB7XG4gICAgICAgIGNvbnN0IG1hdGVyaWFsID0gdGhpcy5tYXRlcmlhbDtcblxuICAgICAgICBtYXRlcmlhbC5zZXRQYXJhbWV0ZXIoJ3N0cmV0Y2gnLCB0aGlzLnN0cmV0Y2gpO1xuICAgICAgICBpZiAodGhpcy5faXNBbmltYXRlZCgpKSB7XG4gICAgICAgICAgICBtYXRlcmlhbC5zZXRQYXJhbWV0ZXIoJ2FuaW1UZXhUaWxlc1BhcmFtcycsIHRoaXMuYW5pbVRpbGVzUGFyYW1zKTtcbiAgICAgICAgICAgIG1hdGVyaWFsLnNldFBhcmFtZXRlcignYW5pbVRleFBhcmFtcycsIHRoaXMuYW5pbVBhcmFtcyk7XG4gICAgICAgICAgICBtYXRlcmlhbC5zZXRQYXJhbWV0ZXIoJ2FuaW1UZXhJbmRleFBhcmFtcycsIHRoaXMuYW5pbUluZGV4UGFyYW1zKTtcbiAgICAgICAgfVxuICAgICAgICBtYXRlcmlhbC5zZXRQYXJhbWV0ZXIoJ2NvbG9yTXVsdCcsIHRoaXMuaW50ZW5zaXR5KTtcbiAgICAgICAgaWYgKCF0aGlzLnVzZUNwdSkge1xuICAgICAgICAgICAgbWF0ZXJpYWwuc2V0UGFyYW1ldGVyKCdpbnRlcm5hbFRleDAnLCB0aGlzLmludGVybmFsVGV4MCk7XG4gICAgICAgICAgICBtYXRlcmlhbC5zZXRQYXJhbWV0ZXIoJ2ludGVybmFsVGV4MScsIHRoaXMuaW50ZXJuYWxUZXgxKTtcbiAgICAgICAgICAgIG1hdGVyaWFsLnNldFBhcmFtZXRlcignaW50ZXJuYWxUZXgyJywgdGhpcy5pbnRlcm5hbFRleDIpO1xuICAgICAgICAgICAgbWF0ZXJpYWwuc2V0UGFyYW1ldGVyKCdpbnRlcm5hbFRleDMnLCB0aGlzLmludGVybmFsVGV4Myk7XG4gICAgICAgIH1cbiAgICAgICAgbWF0ZXJpYWwuc2V0UGFyYW1ldGVyKCdjb2xvclBhcmFtJywgdGhpcy5jb2xvclBhcmFtKTtcblxuICAgICAgICBtYXRlcmlhbC5zZXRQYXJhbWV0ZXIoJ251bVBhcnRpY2xlcycsIHRoaXMubnVtUGFydGljbGVzKTtcbiAgICAgICAgbWF0ZXJpYWwuc2V0UGFyYW1ldGVyKCdudW1QYXJ0aWNsZXNQb3QnLCB0aGlzLm51bVBhcnRpY2xlc1BvdCk7XG4gICAgICAgIG1hdGVyaWFsLnNldFBhcmFtZXRlcignbGlmZXRpbWUnLCB0aGlzLmxpZmV0aW1lKTtcbiAgICAgICAgbWF0ZXJpYWwuc2V0UGFyYW1ldGVyKCdyYXRlJywgdGhpcy5yYXRlKTtcbiAgICAgICAgbWF0ZXJpYWwuc2V0UGFyYW1ldGVyKCdyYXRlRGl2JywgdGhpcy5yYXRlMiAtIHRoaXMucmF0ZSk7XG4gICAgICAgIG1hdGVyaWFsLnNldFBhcmFtZXRlcignc2VlZCcsIHRoaXMuc2VlZCk7XG4gICAgICAgIG1hdGVyaWFsLnNldFBhcmFtZXRlcignc2NhbGVEaXZNdWx0JywgdGhpcy5zY2FsZVVNYXhbMF0pO1xuICAgICAgICBtYXRlcmlhbC5zZXRQYXJhbWV0ZXIoJ2FscGhhRGl2TXVsdCcsIHRoaXMuYWxwaGFVTWF4WzBdKTtcbiAgICAgICAgbWF0ZXJpYWwuc2V0UGFyYW1ldGVyKCdyYWRpYWxTcGVlZERpdk11bHQnLCB0aGlzLnJhZGlhbFNwZWVkVU1heFswXSk7XG4gICAgICAgIG1hdGVyaWFsLnNldFBhcmFtZXRlcignZ3JhcGhOdW1TYW1wbGVzJywgdGhpcy5wcmVjaXNpb24pO1xuICAgICAgICBtYXRlcmlhbC5zZXRQYXJhbWV0ZXIoJ2dyYXBoU2FtcGxlU2l6ZScsIDEuMCAvIHRoaXMucHJlY2lzaW9uKTtcbiAgICAgICAgbWF0ZXJpYWwuc2V0UGFyYW1ldGVyKCdlbWl0dGVyU2NhbGUnLCBuZXcgRmxvYXQzMkFycmF5KFsxLCAxLCAxXSkpO1xuXG4gICAgICAgIGlmICh0aGlzLnBhY2s4KSB7XG4gICAgICAgICAgICB0aGlzLl9ncHVVcGRhdGVyLl9zZXRJbnB1dEJvdW5kcygpO1xuICAgICAgICAgICAgbWF0ZXJpYWwuc2V0UGFyYW1ldGVyKCdpbkJvdW5kc1NpemUnLCB0aGlzLl9ncHVVcGRhdGVyLmluQm91bmRzU2l6ZVVuaWZvcm0pO1xuICAgICAgICAgICAgbWF0ZXJpYWwuc2V0UGFyYW1ldGVyKCdpbkJvdW5kc0NlbnRlcicsIHRoaXMuX2dwdVVwZGF0ZXIuaW5Cb3VuZHNDZW50ZXJVbmlmb3JtKTtcbiAgICAgICAgICAgIG1hdGVyaWFsLnNldFBhcmFtZXRlcignbWF4VmVsJywgdGhpcy5tYXhWZWwpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMud3JhcCAmJiB0aGlzLndyYXBCb3VuZHMpIHtcbiAgICAgICAgICAgIHRoaXMud3JhcEJvdW5kc1VuaWZvcm1bMF0gPSB0aGlzLndyYXBCb3VuZHMueDtcbiAgICAgICAgICAgIHRoaXMud3JhcEJvdW5kc1VuaWZvcm1bMV0gPSB0aGlzLndyYXBCb3VuZHMueTtcbiAgICAgICAgICAgIHRoaXMud3JhcEJvdW5kc1VuaWZvcm1bMl0gPSB0aGlzLndyYXBCb3VuZHMuejtcbiAgICAgICAgICAgIG1hdGVyaWFsLnNldFBhcmFtZXRlcignd3JhcEJvdW5kcycsIHRoaXMud3JhcEJvdW5kc1VuaWZvcm0pO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuY29sb3JNYXApIHtcbiAgICAgICAgICAgIG1hdGVyaWFsLnNldFBhcmFtZXRlcignY29sb3JNYXAnLCB0aGlzLmNvbG9yTWFwKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLmxpZ2h0aW5nKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5ub3JtYWxNYXApIHtcbiAgICAgICAgICAgICAgICBtYXRlcmlhbC5zZXRQYXJhbWV0ZXIoJ25vcm1hbE1hcCcsIHRoaXMubm9ybWFsTWFwKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5kZXB0aFNvZnRlbmluZyA+IDApIHtcbiAgICAgICAgICAgIG1hdGVyaWFsLnNldFBhcmFtZXRlcignc29mdGVuaW5nJywgMS4wIC8gKHRoaXMuZGVwdGhTb2Z0ZW5pbmcgKiB0aGlzLmRlcHRoU29mdGVuaW5nICogMTAwKSk7IC8vIHJlbWFwIHRvIG1vcmUgcGVyY2VwdHVhbGx5IGxpbmVhclxuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLnN0cmV0Y2ggPiAwLjApIG1hdGVyaWFsLmN1bGwgPSBDVUxMRkFDRV9OT05FO1xuXG4gICAgICAgIHRoaXMuX2NvbXBQYXJ0aWNsZUZhY2VQYXJhbXMoKTtcbiAgICB9XG5cbiAgICBfY29tcFBhcnRpY2xlRmFjZVBhcmFtcygpIHtcbiAgICAgICAgbGV0IHRhbmdlbnQsIGJpbm9ybWFsO1xuICAgICAgICBpZiAodGhpcy5vcmllbnRhdGlvbiA9PT0gUEFSVElDTEVPUklFTlRBVElPTl9TQ1JFRU4pIHtcbiAgICAgICAgICAgIHRhbmdlbnQgPSBuZXcgRmxvYXQzMkFycmF5KFsxLCAwLCAwXSk7XG4gICAgICAgICAgICBiaW5vcm1hbCA9IG5ldyBGbG9hdDMyQXJyYXkoWzAsIDAsIDFdKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGxldCBuO1xuICAgICAgICAgICAgaWYgKHRoaXMub3JpZW50YXRpb24gPT09IFBBUlRJQ0xFT1JJRU5UQVRJT05fV09STEQpIHtcbiAgICAgICAgICAgICAgICBuID0gdGhpcy5wYXJ0aWNsZU5vcm1hbC5ub3JtYWxpemUoKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZW1pdHRlck1hdCA9IHRoaXMubm9kZSA9PT0gbnVsbCA/XG4gICAgICAgICAgICAgICAgICAgIE1hdDQuSURFTlRJVFkgOiB0aGlzLm5vZGUuZ2V0V29ybGRUcmFuc2Zvcm0oKTtcbiAgICAgICAgICAgICAgICBuID0gZW1pdHRlck1hdC50cmFuc2Zvcm1WZWN0b3IodGhpcy5wYXJ0aWNsZU5vcm1hbCkubm9ybWFsaXplKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCB0ID0gbmV3IFZlYzMoMSwgMCwgMCk7XG4gICAgICAgICAgICBpZiAoTWF0aC5hYnModC5kb3QobikpID09PSAxKVxuICAgICAgICAgICAgICAgIHQuc2V0KDAsIDAsIDEpO1xuICAgICAgICAgICAgY29uc3QgYiA9IG5ldyBWZWMzKCkuY3Jvc3MobiwgdCkubm9ybWFsaXplKCk7XG4gICAgICAgICAgICB0LmNyb3NzKGIsIG4pLm5vcm1hbGl6ZSgpO1xuICAgICAgICAgICAgdGFuZ2VudCA9IG5ldyBGbG9hdDMyQXJyYXkoW3QueCwgdC55LCB0LnpdKTtcbiAgICAgICAgICAgIGJpbm9ybWFsID0gbmV3IEZsb2F0MzJBcnJheShbYi54LCBiLnksIGIuel0pO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMubWF0ZXJpYWwuc2V0UGFyYW1ldGVyKCdmYWNlVGFuZ2VudCcsIHRhbmdlbnQpO1xuICAgICAgICB0aGlzLm1hdGVyaWFsLnNldFBhcmFtZXRlcignZmFjZUJpbm9ybScsIGJpbm9ybWFsKTtcbiAgICB9XG5cbiAgICAvLyBEZWNsYXJlcyB2ZXJ0ZXggZm9ybWF0LCBjcmVhdGVzIFZCIGFuZCBJQlxuICAgIF9hbGxvY2F0ZShudW1QYXJ0aWNsZXMpIHtcbiAgICAgICAgY29uc3QgcHN5c1ZlcnRDb3VudCA9IG51bVBhcnRpY2xlcyAqIHRoaXMubnVtUGFydGljbGVWZXJ0cztcbiAgICAgICAgY29uc3QgcHN5c0luZGV4Q291bnQgPSBudW1QYXJ0aWNsZXMgKiB0aGlzLm51bVBhcnRpY2xlSW5kaWNlcztcblxuICAgICAgICBpZiAoKHRoaXMudmVydGV4QnVmZmVyID09PSB1bmRlZmluZWQpIHx8ICh0aGlzLnZlcnRleEJ1ZmZlci5nZXROdW1WZXJ0aWNlcygpICE9PSBwc3lzVmVydENvdW50KSkge1xuICAgICAgICAgICAgLy8gQ3JlYXRlIHRoZSBwYXJ0aWNsZSB2ZXJ0ZXggZm9ybWF0XG4gICAgICAgICAgICBpZiAoIXRoaXMudXNlQ3B1KSB7XG4gICAgICAgICAgICAgICAgLy8gR1BVOiBYWVogPSBxdWFkIHZlcnRleCBwb3NpdGlvbjsgVyA9IElOVDogcGFydGljbGUgSUQsIEZSQUM6IHJhbmRvbSBmYWN0b3JcbiAgICAgICAgICAgICAgICBjb25zdCBlbGVtZW50cyA9IFt7XG4gICAgICAgICAgICAgICAgICAgIHNlbWFudGljOiBTRU1BTlRJQ19BVFRSMCxcbiAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50czogNCxcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogVFlQRV9GTE9BVDMyXG4gICAgICAgICAgICAgICAgfV07XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMudXNlTWVzaCkge1xuICAgICAgICAgICAgICAgICAgICBlbGVtZW50cy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbWFudGljOiBTRU1BTlRJQ19BVFRSMSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudHM6IDIsXG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiBUWVBFX0ZMT0FUMzJcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnN0IHBhcnRpY2xlRm9ybWF0ID0gbmV3IFZlcnRleEZvcm1hdCh0aGlzLmdyYXBoaWNzRGV2aWNlLCBlbGVtZW50cyk7XG5cbiAgICAgICAgICAgICAgICB0aGlzLnZlcnRleEJ1ZmZlciA9IG5ldyBWZXJ0ZXhCdWZmZXIodGhpcy5ncmFwaGljc0RldmljZSwgcGFydGljbGVGb3JtYXQsIHBzeXNWZXJ0Q291bnQsIEJVRkZFUl9EWU5BTUlDKTtcbiAgICAgICAgICAgICAgICB0aGlzLmluZGV4QnVmZmVyID0gbmV3IEluZGV4QnVmZmVyKHRoaXMuZ3JhcGhpY3NEZXZpY2UsIElOREVYRk9STUFUX1VJTlQxNiwgcHN5c0luZGV4Q291bnQpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zdCBlbGVtZW50cyA9IFt7XG4gICAgICAgICAgICAgICAgICAgIHNlbWFudGljOiBTRU1BTlRJQ19BVFRSMCxcbiAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50czogNCxcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogVFlQRV9GTE9BVDMyXG4gICAgICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgICAgICBzZW1hbnRpYzogU0VNQU5USUNfQVRUUjEsXG4gICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudHM6IDQsXG4gICAgICAgICAgICAgICAgICAgIHR5cGU6IFRZUEVfRkxPQVQzMlxuICAgICAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICAgICAgc2VtYW50aWM6IFNFTUFOVElDX0FUVFIyLFxuICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRzOiA0LFxuICAgICAgICAgICAgICAgICAgICB0eXBlOiBUWVBFX0ZMT0FUMzJcbiAgICAgICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgICAgIHNlbWFudGljOiBTRU1BTlRJQ19BVFRSMyxcbiAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50czogMSxcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogVFlQRV9GTE9BVDMyXG4gICAgICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgICAgICBzZW1hbnRpYzogU0VNQU5USUNfQVRUUjQsXG4gICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudHM6IHRoaXMudXNlTWVzaCA/IDQgOiAyLFxuICAgICAgICAgICAgICAgICAgICB0eXBlOiBUWVBFX0ZMT0FUMzJcbiAgICAgICAgICAgICAgICB9XTtcbiAgICAgICAgICAgICAgICBjb25zdCBwYXJ0aWNsZUZvcm1hdCA9IG5ldyBWZXJ0ZXhGb3JtYXQodGhpcy5ncmFwaGljc0RldmljZSwgZWxlbWVudHMpO1xuXG4gICAgICAgICAgICAgICAgdGhpcy52ZXJ0ZXhCdWZmZXIgPSBuZXcgVmVydGV4QnVmZmVyKHRoaXMuZ3JhcGhpY3NEZXZpY2UsIHBhcnRpY2xlRm9ybWF0LCBwc3lzVmVydENvdW50LCBCVUZGRVJfRFlOQU1JQyk7XG4gICAgICAgICAgICAgICAgdGhpcy5pbmRleEJ1ZmZlciA9IG5ldyBJbmRleEJ1ZmZlcih0aGlzLmdyYXBoaWNzRGV2aWNlLCBJTkRFWEZPUk1BVF9VSU5UMTYsIHBzeXNJbmRleENvdW50KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gRmlsbCB0aGUgdmVydGV4IGJ1ZmZlclxuICAgICAgICAgICAgY29uc3QgZGF0YSA9IG5ldyBGbG9hdDMyQXJyYXkodGhpcy52ZXJ0ZXhCdWZmZXIubG9jaygpKTtcbiAgICAgICAgICAgIGxldCBtZXNoRGF0YSwgc3RyaWRlLCB0ZXhDb29yZE9mZnNldDtcbiAgICAgICAgICAgIGlmICh0aGlzLnVzZU1lc2gpIHtcbiAgICAgICAgICAgICAgICBtZXNoRGF0YSA9IG5ldyBGbG9hdDMyQXJyYXkodGhpcy5tZXNoLnZlcnRleEJ1ZmZlci5sb2NrKCkpO1xuICAgICAgICAgICAgICAgIHN0cmlkZSA9IG1lc2hEYXRhLmxlbmd0aCAvIHRoaXMubWVzaC52ZXJ0ZXhCdWZmZXIubnVtVmVydGljZXM7XG4gICAgICAgICAgICAgICAgZm9yIChsZXQgZWxlbSA9IDA7IGVsZW0gPCB0aGlzLm1lc2gudmVydGV4QnVmZmVyLmZvcm1hdC5lbGVtZW50cy5sZW5ndGg7IGVsZW0rKykge1xuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5tZXNoLnZlcnRleEJ1ZmZlci5mb3JtYXQuZWxlbWVudHNbZWxlbV0ubmFtZSA9PT0gU0VNQU5USUNfVEVYQ09PUkQwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0ZXhDb29yZE9mZnNldCA9IHRoaXMubWVzaC52ZXJ0ZXhCdWZmZXIuZm9ybWF0LmVsZW1lbnRzW2VsZW1dLm9mZnNldCAvIDQ7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBwc3lzVmVydENvdW50OyBpKyspIHtcbiAgICAgICAgICAgICAgICBjb25zdCBpZCA9IE1hdGguZmxvb3IoaSAvIHRoaXMubnVtUGFydGljbGVWZXJ0cyk7XG4gICAgICAgICAgICAgICAgaWYgKCF0aGlzLnVzZU1lc2gpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdmVydElEID0gaSAlIDQ7XG4gICAgICAgICAgICAgICAgICAgIGRhdGFbaSAqIDRdID0gcGFydGljbGVWZXJ0c1t2ZXJ0SURdWzBdO1xuICAgICAgICAgICAgICAgICAgICBkYXRhW2kgKiA0ICsgMV0gPSBwYXJ0aWNsZVZlcnRzW3ZlcnRJRF1bMV07XG4gICAgICAgICAgICAgICAgICAgIGRhdGFbaSAqIDQgKyAyXSA9IDA7XG4gICAgICAgICAgICAgICAgICAgIGRhdGFbaSAqIDQgKyAzXSA9IGlkO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHZlcnQgPSBpICUgdGhpcy5udW1QYXJ0aWNsZVZlcnRzO1xuICAgICAgICAgICAgICAgICAgICBkYXRhW2kgKiA2XSA9IG1lc2hEYXRhW3ZlcnQgKiBzdHJpZGVdO1xuICAgICAgICAgICAgICAgICAgICBkYXRhW2kgKiA2ICsgMV0gPSBtZXNoRGF0YVt2ZXJ0ICogc3RyaWRlICsgMV07XG4gICAgICAgICAgICAgICAgICAgIGRhdGFbaSAqIDYgKyAyXSA9IG1lc2hEYXRhW3ZlcnQgKiBzdHJpZGUgKyAyXTtcbiAgICAgICAgICAgICAgICAgICAgZGF0YVtpICogNiArIDNdID0gaWQ7XG4gICAgICAgICAgICAgICAgICAgIGRhdGFbaSAqIDYgKyA0XSA9IG1lc2hEYXRhW3ZlcnQgKiBzdHJpZGUgKyB0ZXhDb29yZE9mZnNldCArIDBdO1xuICAgICAgICAgICAgICAgICAgICBkYXRhW2kgKiA2ICsgNV0gPSAxLjAgLSBtZXNoRGF0YVt2ZXJ0ICogc3RyaWRlICsgdGV4Q29vcmRPZmZzZXQgKyAxXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICh0aGlzLnVzZUNwdSkge1xuICAgICAgICAgICAgICAgIHRoaXMudmJDUFUgPSBuZXcgRmxvYXQzMkFycmF5KGRhdGEpO1xuICAgICAgICAgICAgICAgIHRoaXMudmJPbGQgPSBuZXcgRmxvYXQzMkFycmF5KHRoaXMudmJDUFUubGVuZ3RoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMudmVydGV4QnVmZmVyLnVubG9jaygpO1xuICAgICAgICAgICAgaWYgKHRoaXMudXNlTWVzaCkge1xuICAgICAgICAgICAgICAgIHRoaXMubWVzaC52ZXJ0ZXhCdWZmZXIudW5sb2NrKCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIEZpbGwgdGhlIGluZGV4IGJ1ZmZlclxuICAgICAgICAgICAgbGV0IGRzdCA9IDA7XG4gICAgICAgICAgICBjb25zdCBpbmRpY2VzID0gbmV3IFVpbnQxNkFycmF5KHRoaXMuaW5kZXhCdWZmZXIubG9jaygpKTtcbiAgICAgICAgICAgIGlmICh0aGlzLnVzZU1lc2gpIG1lc2hEYXRhID0gbmV3IFVpbnQxNkFycmF5KHRoaXMubWVzaC5pbmRleEJ1ZmZlclswXS5sb2NrKCkpO1xuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBudW1QYXJ0aWNsZXM7IGkrKykge1xuICAgICAgICAgICAgICAgIGlmICghdGhpcy51c2VNZXNoKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGJhc2VJbmRleCA9IGkgKiA0O1xuICAgICAgICAgICAgICAgICAgICBpbmRpY2VzW2RzdCsrXSA9IGJhc2VJbmRleDtcbiAgICAgICAgICAgICAgICAgICAgaW5kaWNlc1tkc3QrK10gPSBiYXNlSW5kZXggKyAxO1xuICAgICAgICAgICAgICAgICAgICBpbmRpY2VzW2RzdCsrXSA9IGJhc2VJbmRleCArIDI7XG4gICAgICAgICAgICAgICAgICAgIGluZGljZXNbZHN0KytdID0gYmFzZUluZGV4O1xuICAgICAgICAgICAgICAgICAgICBpbmRpY2VzW2RzdCsrXSA9IGJhc2VJbmRleCArIDI7XG4gICAgICAgICAgICAgICAgICAgIGluZGljZXNbZHN0KytdID0gYmFzZUluZGV4ICsgMztcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGxldCBqID0gMDsgaiA8IHRoaXMubnVtUGFydGljbGVJbmRpY2VzOyBqKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGluZGljZXNbaSAqIHRoaXMubnVtUGFydGljbGVJbmRpY2VzICsgal0gPSBtZXNoRGF0YVtqXSArIGkgKiB0aGlzLm51bVBhcnRpY2xlVmVydHM7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmluZGV4QnVmZmVyLnVubG9jaygpO1xuICAgICAgICAgICAgaWYgKHRoaXMudXNlTWVzaCkgdGhpcy5tZXNoLmluZGV4QnVmZmVyWzBdLnVubG9jaygpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmVzZXQoKSB7XG4gICAgICAgIHRoaXMuYmVlblJlc2V0ID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5zZWVkID0gTWF0aC5yYW5kb20oKTtcbiAgICAgICAgdGhpcy5tYXRlcmlhbC5zZXRQYXJhbWV0ZXIoJ3NlZWQnLCB0aGlzLnNlZWQpO1xuICAgICAgICBpZiAodGhpcy51c2VDcHUpIHtcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5wYXJ0aWNsZVRleFN0YXJ0Lmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5wYXJ0aWNsZVRleFtpXSA9IHRoaXMucGFydGljbGVUZXhTdGFydFtpXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuX2luaXRpYWxpemVUZXh0dXJlcygpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMucmVzZXRXb3JsZEJvdW5kcygpO1xuICAgICAgICB0aGlzLnJlc2V0VGltZSgpO1xuICAgICAgICBjb25zdCBvcmlnTG9vcCA9IHRoaXMubG9vcDtcbiAgICAgICAgdGhpcy5sb29wID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5hZGRUaW1lKDAsIGZhbHNlKTtcbiAgICAgICAgdGhpcy5sb29wID0gb3JpZ0xvb3A7XG4gICAgICAgIGlmICh0aGlzLnByZVdhcm0pIHtcbiAgICAgICAgICAgIHRoaXMucHJld2FybSh0aGlzLmxpZmV0aW1lKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByZXdhcm0odGltZSkge1xuICAgICAgICBjb25zdCBsaWZldGltZUZyYWN0aW9uID0gdGltZSAvIHRoaXMubGlmZXRpbWU7XG4gICAgICAgIGNvbnN0IGl0ZXJhdGlvbnMgPSBNYXRoLm1pbihNYXRoLmZsb29yKGxpZmV0aW1lRnJhY3Rpb24gKiB0aGlzLnByZWNpc2lvbiksIHRoaXMucHJlY2lzaW9uKTtcbiAgICAgICAgY29uc3Qgc3RlcERlbHRhID0gdGltZSAvIGl0ZXJhdGlvbnM7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgaXRlcmF0aW9uczsgaSsrKSB7XG4gICAgICAgICAgICB0aGlzLmFkZFRpbWUoc3RlcERlbHRhLCBmYWxzZSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXNldFRpbWUoKSB7XG4gICAgICAgIHRoaXMuZW5kVGltZSA9IGNhbGNFbmRUaW1lKHRoaXMpO1xuICAgIH1cblxuICAgIGZpbmlzaEZyYW1lKCkge1xuICAgICAgICBpZiAodGhpcy51c2VDcHUpIHRoaXMudmVydGV4QnVmZmVyLnVubG9jaygpO1xuICAgIH1cblxuICAgIGFkZFRpbWUoZGVsdGEsIGlzT25TdG9wKSB7XG4gICAgICAgIGNvbnN0IGRldmljZSA9IHRoaXMuZ3JhcGhpY3NEZXZpY2U7XG5cbiAgICAgICAgLy8gI2lmIF9QUk9GSUxFUlxuICAgICAgICBjb25zdCBzdGFydFRpbWUgPSBub3coKTtcbiAgICAgICAgLy8gI2VuZGlmXG5cbiAgICAgICAgdGhpcy5zaW1UaW1lVG90YWwgKz0gZGVsdGE7XG5cbiAgICAgICAgdGhpcy5jYWxjdWxhdGVXb3JsZEJvdW5kcygpO1xuXG4gICAgICAgIGlmICh0aGlzLl9pc0FuaW1hdGVkKCkpIHtcbiAgICAgICAgICAgIGNvbnN0IHRpbGVzUGFyYW1zID0gdGhpcy5hbmltVGlsZXNQYXJhbXM7XG4gICAgICAgICAgICB0aWxlc1BhcmFtc1swXSA9IDEuMCAvIHRoaXMuYW5pbVRpbGVzWDsgLy8gYW5pbVRleFRpbGVzUGFyYW1zLnhcbiAgICAgICAgICAgIHRpbGVzUGFyYW1zWzFdID0gMS4wIC8gdGhpcy5hbmltVGlsZXNZOyAvLyBhbmltVGV4VGlsZXNQYXJhbXMueVxuXG4gICAgICAgICAgICBjb25zdCBwYXJhbXMgPSB0aGlzLmFuaW1QYXJhbXM7XG4gICAgICAgICAgICBwYXJhbXNbMF0gPSB0aGlzLmFuaW1TdGFydEZyYW1lOyAvLyBhbmltVGV4UGFyYW1zLnhcbiAgICAgICAgICAgIHBhcmFtc1sxXSA9IHRoaXMuYW5pbU51bUZyYW1lcyAqIHRoaXMuYW5pbVNwZWVkOyAvLyBhbmltVGV4UGFyYW1zLnlcbiAgICAgICAgICAgIHBhcmFtc1syXSA9IHRoaXMuYW5pbU51bUZyYW1lcyAtIDE7IC8vIGFuaW1UZXhQYXJhbXMuelxuICAgICAgICAgICAgcGFyYW1zWzNdID0gdGhpcy5hbmltTnVtQW5pbWF0aW9ucyAtIDE7IC8vIGFuaW1UZXhQYXJhbXMud1xuXG4gICAgICAgICAgICBjb25zdCBhbmltSW5kZXhQYXJhbXMgPSB0aGlzLmFuaW1JbmRleFBhcmFtcztcbiAgICAgICAgICAgIGFuaW1JbmRleFBhcmFtc1swXSA9IHRoaXMuYW5pbUluZGV4OyAvLyBhbmltVGV4SW5kZXhQYXJhbXMueFxuICAgICAgICAgICAgYW5pbUluZGV4UGFyYW1zWzFdID0gdGhpcy5yYW5kb21pemVBbmltSW5kZXg7IC8vIGFuaW1UZXhJbmRleFBhcmFtcy55XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5zY2VuZSkge1xuICAgICAgICAgICAgaWYgKHRoaXMuY2FtZXJhICE9PSB0aGlzLnNjZW5lLl9hY3RpdmVDYW1lcmEpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmNhbWVyYSA9IHRoaXMuc2NlbmUuX2FjdGl2ZUNhbWVyYTtcbiAgICAgICAgICAgICAgICB0aGlzLm9uQ2hhbmdlQ2FtZXJhKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5lbWl0dGVyU2hhcGUgPT09IEVNSVRURVJTSEFQRV9CT1gpIHtcbiAgICAgICAgICAgIGV4dGVudHNJbm5lclJhdGlvVW5pZm9ybVswXSA9IHRoaXMuZW1pdHRlckV4dGVudHMueCAhPT0gMCA/IHRoaXMuZW1pdHRlckV4dGVudHNJbm5lci54IC8gdGhpcy5lbWl0dGVyRXh0ZW50cy54IDogMDtcbiAgICAgICAgICAgIGV4dGVudHNJbm5lclJhdGlvVW5pZm9ybVsxXSA9IHRoaXMuZW1pdHRlckV4dGVudHMueSAhPT0gMCA/IHRoaXMuZW1pdHRlckV4dGVudHNJbm5lci55IC8gdGhpcy5lbWl0dGVyRXh0ZW50cy55IDogMDtcbiAgICAgICAgICAgIGV4dGVudHNJbm5lclJhdGlvVW5pZm9ybVsyXSA9IHRoaXMuZW1pdHRlckV4dGVudHMueiAhPT0gMCA/IHRoaXMuZW1pdHRlckV4dGVudHNJbm5lci56IC8gdGhpcy5lbWl0dGVyRXh0ZW50cy56IDogMDtcbiAgICAgICAgICAgIGlmICh0aGlzLm1lc2hJbnN0YW5jZS5ub2RlID09PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgc3Bhd25NYXRyaXguc2V0VFJTKFZlYzMuWkVSTywgUXVhdC5JREVOVElUWSwgdGhpcy5lbWl0dGVyRXh0ZW50cyk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHNwYXduTWF0cml4LnNldFRSUyhWZWMzLlpFUk8sIHRoaXMubWVzaEluc3RhbmNlLm5vZGUuZ2V0Um90YXRpb24oKSwgdG1wVmVjMy5jb3B5KHRoaXMuZW1pdHRlckV4dGVudHMpLm11bCh0aGlzLm1lc2hJbnN0YW5jZS5ub2RlLmxvY2FsU2NhbGUpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGxldCBlbWl0dGVyUG9zO1xuICAgICAgICBjb25zdCBlbWl0dGVyU2NhbGUgPSB0aGlzLm1lc2hJbnN0YW5jZS5ub2RlID09PSBudWxsID8gVmVjMy5PTkUgOiB0aGlzLm1lc2hJbnN0YW5jZS5ub2RlLmxvY2FsU2NhbGU7XG4gICAgICAgIHRoaXMuZW1pdHRlclNjYWxlVW5pZm9ybVswXSA9IGVtaXR0ZXJTY2FsZS54O1xuICAgICAgICB0aGlzLmVtaXR0ZXJTY2FsZVVuaWZvcm1bMV0gPSBlbWl0dGVyU2NhbGUueTtcbiAgICAgICAgdGhpcy5lbWl0dGVyU2NhbGVVbmlmb3JtWzJdID0gZW1pdHRlclNjYWxlLno7XG4gICAgICAgIHRoaXMubWF0ZXJpYWwuc2V0UGFyYW1ldGVyKCdlbWl0dGVyU2NhbGUnLCB0aGlzLmVtaXR0ZXJTY2FsZVVuaWZvcm0pO1xuICAgICAgICBpZiAodGhpcy5sb2NhbFNwYWNlICYmIHRoaXMubWVzaEluc3RhbmNlLm5vZGUpIHtcbiAgICAgICAgICAgIGVtaXR0ZXJQb3MgPSB0aGlzLm1lc2hJbnN0YW5jZS5ub2RlLmdldFBvc2l0aW9uKCk7XG4gICAgICAgICAgICB0aGlzLmVtaXR0ZXJQb3NVbmlmb3JtWzBdID0gZW1pdHRlclBvcy54O1xuICAgICAgICAgICAgdGhpcy5lbWl0dGVyUG9zVW5pZm9ybVsxXSA9IGVtaXR0ZXJQb3MueTtcbiAgICAgICAgICAgIHRoaXMuZW1pdHRlclBvc1VuaWZvcm1bMl0gPSBlbWl0dGVyUG9zLno7XG4gICAgICAgICAgICB0aGlzLm1hdGVyaWFsLnNldFBhcmFtZXRlcignZW1pdHRlclBvcycsIHRoaXMuZW1pdHRlclBvc1VuaWZvcm0pO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fY29tcFBhcnRpY2xlRmFjZVBhcmFtcygpO1xuXG4gICAgICAgIGlmICghdGhpcy51c2VDcHUpIHtcbiAgICAgICAgICAgIHRoaXMuX2dwdVVwZGF0ZXIudXBkYXRlKGRldmljZSwgc3Bhd25NYXRyaXgsIGV4dGVudHNJbm5lclJhdGlvVW5pZm9ybSwgZGVsdGEsIGlzT25TdG9wKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IGRhdGEgPSBuZXcgRmxvYXQzMkFycmF5KHRoaXMudmVydGV4QnVmZmVyLmxvY2soKSk7XG4gICAgICAgICAgICB0aGlzLl9jcHVVcGRhdGVyLnVwZGF0ZShkYXRhLCB0aGlzLnZiVG9Tb3J0LCB0aGlzLnBhcnRpY2xlVGV4LCBzcGF3bk1hdHJpeCwgZXh0ZW50c0lubmVyUmF0aW9Vbmlmb3JtLCBlbWl0dGVyUG9zLCBkZWx0YSwgaXNPblN0b3ApO1xuICAgICAgICAgICAgLy8gdGhpcy52ZXJ0ZXhCdWZmZXIudW5sb2NrKCk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIXRoaXMubG9vcCkge1xuICAgICAgICAgICAgaWYgKERhdGUubm93KCkgPiB0aGlzLmVuZFRpbWUpIHtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5vbkZpbmlzaGVkKSB0aGlzLm9uRmluaXNoZWQoKTtcbiAgICAgICAgICAgICAgICB0aGlzLm1lc2hJbnN0YW5jZS52aXNpYmxlID0gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5tZXNoSW5zdGFuY2UpIHtcbiAgICAgICAgICAgIHRoaXMubWVzaEluc3RhbmNlLmRyYXdPcmRlciA9IHRoaXMuZHJhd09yZGVyO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gI2lmIF9QUk9GSUxFUlxuICAgICAgICB0aGlzLl9hZGRUaW1lVGltZSArPSBub3coKSAtIHN0YXJ0VGltZTtcbiAgICAgICAgLy8gI2VuZGlmXG4gICAgfVxuXG4gICAgX2Rlc3Ryb3lSZXNvdXJjZXMoKSB7XG4gICAgICAgIGlmICh0aGlzLnBhcnRpY2xlVGV4SU4pIHtcbiAgICAgICAgICAgIHRoaXMucGFydGljbGVUZXhJTi5kZXN0cm95KCk7XG4gICAgICAgICAgICB0aGlzLnBhcnRpY2xlVGV4SU4gPSBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMucGFydGljbGVUZXhPVVQpIHtcbiAgICAgICAgICAgIHRoaXMucGFydGljbGVUZXhPVVQuZGVzdHJveSgpO1xuICAgICAgICAgICAgdGhpcy5wYXJ0aWNsZVRleE9VVCA9IG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5wYXJ0aWNsZVRleFN0YXJ0ICYmIHRoaXMucGFydGljbGVUZXhTdGFydC5kZXN0cm95KSB7XG4gICAgICAgICAgICB0aGlzLnBhcnRpY2xlVGV4U3RhcnQuZGVzdHJveSgpO1xuICAgICAgICAgICAgdGhpcy5wYXJ0aWNsZVRleFN0YXJ0ID0gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLnJ0UGFydGljbGVUZXhJTikge1xuICAgICAgICAgICAgdGhpcy5ydFBhcnRpY2xlVGV4SU4uZGVzdHJveSgpO1xuICAgICAgICAgICAgdGhpcy5ydFBhcnRpY2xlVGV4SU4gPSBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMucnRQYXJ0aWNsZVRleE9VVCkge1xuICAgICAgICAgICAgdGhpcy5ydFBhcnRpY2xlVGV4T1VULmRlc3Ryb3koKTtcbiAgICAgICAgICAgIHRoaXMucnRQYXJ0aWNsZVRleE9VVCA9IG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5pbnRlcm5hbFRleDApIHtcbiAgICAgICAgICAgIHRoaXMuaW50ZXJuYWxUZXgwLmRlc3Ryb3koKTtcbiAgICAgICAgICAgIHRoaXMuaW50ZXJuYWxUZXgwID0gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLmludGVybmFsVGV4MSkge1xuICAgICAgICAgICAgdGhpcy5pbnRlcm5hbFRleDEuZGVzdHJveSgpO1xuICAgICAgICAgICAgdGhpcy5pbnRlcm5hbFRleDEgPSBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuaW50ZXJuYWxUZXgyKSB7XG4gICAgICAgICAgICB0aGlzLmludGVybmFsVGV4Mi5kZXN0cm95KCk7XG4gICAgICAgICAgICB0aGlzLmludGVybmFsVGV4MiA9IG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5pbnRlcm5hbFRleDMpIHtcbiAgICAgICAgICAgIHRoaXMuaW50ZXJuYWxUZXgzLmRlc3Ryb3koKTtcbiAgICAgICAgICAgIHRoaXMuaW50ZXJuYWxUZXgzID0gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLmNvbG9yUGFyYW0pIHtcbiAgICAgICAgICAgIHRoaXMuY29sb3JQYXJhbS5kZXN0cm95KCk7XG4gICAgICAgICAgICB0aGlzLmNvbG9yUGFyYW0gPSBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMudmVydGV4QnVmZmVyKSB7XG4gICAgICAgICAgICB0aGlzLnZlcnRleEJ1ZmZlci5kZXN0cm95KCk7XG4gICAgICAgICAgICB0aGlzLnZlcnRleEJ1ZmZlciA9IHVuZGVmaW5lZDsgLy8gd2UgYXJlIHRlc3RpbmcgaWYgdmIgaXMgdW5kZWZpbmVkIGluIHNvbWUgY29kZSwgbm8gaWRlYSB3aHlcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLmluZGV4QnVmZmVyKSB7XG4gICAgICAgICAgICB0aGlzLmluZGV4QnVmZmVyLmRlc3Ryb3koKTtcbiAgICAgICAgICAgIHRoaXMuaW5kZXhCdWZmZXIgPSB1bmRlZmluZWQ7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5tYXRlcmlhbCkge1xuICAgICAgICAgICAgdGhpcy5tYXRlcmlhbC5kZXN0cm95KCk7XG4gICAgICAgICAgICB0aGlzLm1hdGVyaWFsID0gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIG5vdGU6IHNoYWRlcnMgc2hvdWxkIG5vdCBiZSBkZXN0cm95ZWQgYXMgdGhleSBjb3VsZCBiZSBzaGFyZWQgYmV0d2VlbiBlbWl0dGVyc1xuICAgIH1cblxuICAgIGRlc3Ryb3koKSB7XG4gICAgICAgIHRoaXMuY2FtZXJhID0gbnVsbDtcblxuICAgICAgICB0aGlzLl9kZXN0cm95UmVzb3VyY2VzKCk7XG4gICAgfVxufVxuXG5leHBvcnQgeyBQYXJ0aWNsZUVtaXR0ZXIgfTtcbiJdLCJuYW1lcyI6WyJwYXJ0aWNsZVZlcnRzIiwiX2NyZWF0ZVRleHR1cmUiLCJkZXZpY2UiLCJ3aWR0aCIsImhlaWdodCIsInBpeGVsRGF0YSIsImZvcm1hdCIsIlBJWEVMRk9STUFUX1JHQkEzMkYiLCJtdWx0OEJpdCIsImZpbHRlciIsIm1pcEZpbHRlciIsIkZJTFRFUl9ORUFSRVNUIiwiUElYRUxGT1JNQVRfUkdCQTgiLCJGSUxURVJfTElORUFSIiwidGV4dHVyZSIsIlRleHR1cmUiLCJjdWJlbWFwIiwibWlwbWFwcyIsIm1pbkZpbHRlciIsIm1hZ0ZpbHRlciIsImFkZHJlc3NVIiwiQUREUkVTU19DTEFNUF9UT19FREdFIiwiYWRkcmVzc1YiLCJuYW1lIiwicGl4ZWxzIiwibG9jayIsInRlbXAiLCJVaW50OEFycmF5IiwibGVuZ3RoIiwiaSIsInNldCIsInVubG9jayIsInNhdHVyYXRlIiwieCIsIk1hdGgiLCJtYXgiLCJtaW4iLCJkZWZhdWx0MEN1cnZlIiwiQ3VydmUiLCJkZWZhdWx0MUN1cnZlIiwiZGVmYXVsdDBDdXJ2ZTMiLCJDdXJ2ZVNldCIsImRlZmF1bHQxQ3VydmUzIiwicGFydGljbGVUZXhIZWlnaHQiLCJwYXJ0aWNsZVRleENoYW5uZWxzIiwiZXh0ZW50c0lubmVyUmF0aW9Vbmlmb3JtIiwiRmxvYXQzMkFycmF5Iiwic3Bhd25NYXRyaXgiLCJNYXQ0IiwidG1wVmVjMyIsIlZlYzMiLCJiTWluIiwiYk1heCIsInNldFByb3BlcnR5VGFyZ2V0Iiwic2V0UHJvcGVydHlPcHRpb25zIiwic2V0UHJvcGVydHkiLCJwTmFtZSIsImRlZmF1bHRWYWwiLCJ1bmRlZmluZWQiLCJwYWNrM05GbG9hdHMiLCJhIiwiYiIsImMiLCJwYWNrZWQiLCJwYWNrVGV4dHVyZVhZWl9OWFlaIiwicVhZWiIsInFYWVoyIiwibnVtIiwiY29sb3JzIiwiQXJyYXkiLCJwYWNrVGV4dHVyZVJHQkEiLCJxUkdCIiwicUEiLCJwYWNrVGV4dHVyZTVGbG9hdHMiLCJxQiIsInFDIiwicUQiLCJxRSIsInBhY2tUZXh0dXJlMkZsb2F0cyIsImNhbGNFbmRUaW1lIiwiZW1pdHRlciIsImludGVydmFsIiwicmF0ZSIsInJhdGUyIiwibnVtUGFydGljbGVzIiwibGlmZXRpbWUiLCJEYXRlIiwibm93Iiwic3ViR3JhcGgiLCJBIiwiQiIsInIiLCJtYXhVbnNpZ25lZEdyYXBoVmFsdWUiLCJvdXRVTWF4IiwiY2hhbnMiLCJ2YWx1ZXMiLCJqIiwiYWJzIiwibm9ybWFsaXplR3JhcGgiLCJ1TWF4IiwiZGl2R3JhcGhGcm9tMkN1cnZlcyIsImN1cnZlMSIsImN1cnZlMiIsInN1YiIsInBhcnRpY2xlRW1pdHRlckRldmljZUNhY2hlIiwiRGV2aWNlQ2FjaGUiLCJQYXJ0aWNsZUVtaXR0ZXIiLCJjb25zdHJ1Y3RvciIsImdyYXBoaWNzRGV2aWNlIiwib3B0aW9ucyIsImdkIiwicHJlY2lzaW9uIiwiX2FkZFRpbWVUaW1lIiwibWF4VGV4dHVyZVNpemUiLCJEZWJ1ZyIsIndhcm4iLCJFTUlUVEVSU0hBUEVfQk9YIiwiZGVmYXVsdFBhcmFtVGV4dHVyZSIsIlBBUlRJQ0xFU09SVF9OT05FIiwiUEFSVElDTEVNT0RFX0dQVSIsIlBBUlRJQ0xFT1JJRU5UQVRJT05fU0NSRUVOIiwiQkxFTkRfTk9STUFMIiwic3RhcnRBbmdsZSIsIl9ncHVVcGRhdGVyIiwiUGFydGljbGVHUFVVcGRhdGVyIiwiX2NwdVVwZGF0ZXIiLCJQYXJ0aWNsZUNQVVVwZGF0ZXIiLCJlbWl0dGVyUG9zVW5pZm9ybSIsIndyYXBCb3VuZHNVbmlmb3JtIiwiZW1pdHRlclNjYWxlVW5pZm9ybSIsImNvbG9yR3JhcGgiLCJzY2FsZUdyYXBoIiwiYWxwaGFHcmFwaCIsImxvY2FsVmVsb2NpdHlHcmFwaCIsInZlbG9jaXR5R3JhcGgiLCJyb3RhdGlvblNwZWVkR3JhcGgiLCJyYWRpYWxTcGVlZEdyYXBoIiwiYW5pbVRpbGVzUGFyYW1zIiwiYW5pbVBhcmFtcyIsImFuaW1JbmRleFBhcmFtcyIsImludGVybmFsVGV4MCIsImludGVybmFsVGV4MSIsImludGVybmFsVGV4MiIsImNvbG9yUGFyYW0iLCJ2YlRvU29ydCIsInZiT2xkIiwicGFydGljbGVEaXN0YW5jZSIsImNhbWVyYSIsInN3YXBUZXgiLCJ1c2VNZXNoIiwidXNlQ3B1Iiwic3VwcG9ydHNHcHVQYXJ0aWNsZXMiLCJwYWNrOCIsImxvY2FsQm91bmRzIiwiQm91bmRpbmdCb3giLCJ3b3JsZEJvdW5kc05vVHJhaWwiLCJ3b3JsZEJvdW5kc1RyYWlsIiwid29ybGRCb3VuZHMiLCJ3b3JsZEJvdW5kc1NpemUiLCJwcmV2V29ybGRCb3VuZHNTaXplIiwicHJldldvcmxkQm91bmRzQ2VudGVyIiwicHJldkVtaXR0ZXJFeHRlbnRzIiwiZW1pdHRlckV4dGVudHMiLCJwcmV2RW1pdHRlclJhZGl1cyIsImVtaXR0ZXJSYWRpdXMiLCJ3b3JsZEJvdW5kc011bCIsIndvcmxkQm91bmRzQWRkIiwidGltZVRvU3dpdGNoQm91bmRzIiwic2hhZGVyUGFydGljbGVVcGRhdGVSZXNwYXduIiwic2hhZGVyUGFydGljbGVVcGRhdGVOb1Jlc3Bhd24iLCJzaGFkZXJQYXJ0aWNsZVVwZGF0ZU9uU3RvcCIsIm51bVBhcnRpY2xlVmVydHMiLCJudW1QYXJ0aWNsZUluZGljZXMiLCJtYXRlcmlhbCIsIm1lc2hJbnN0YW5jZSIsImRyYXdPcmRlciIsInNlZWQiLCJyYW5kb20iLCJmaXhlZFRpbWVTdGVwIiwibWF4U3ViU3RlcHMiLCJzaW1UaW1lIiwic2ltVGltZVRvdGFsIiwiYmVlblJlc2V0IiwiX2xheWVyIiwicmVidWlsZCIsImFzc2VydCIsImdldCIsInJlc29sdXRpb24iLCJjZW50ZXJQb2ludCIsImR0ZXgiLCJ5IiwieGdyYWQiLCJ5Z3JhZCIsInNxcnQiLCJwIiwib25DaGFuZ2VDYW1lcmEiLCJyZWdlblNoYWRlciIsInJlc2V0TWF0ZXJpYWwiLCJjYWxjdWxhdGVCb3VuZHNNYWQiLCJ6IiwiY29weSIsImNlbnRlciIsIm11bCIsIm11bFNjYWxhciIsImNhbGN1bGF0ZVdvcmxkQm91bmRzIiwibm9kZSIsInJlY2FsY3VsYXRlTG9jYWxCb3VuZHMiLCJlbWl0dGVyU2hhcGUiLCJlcXVhbHMiLCJjYWxjdWxhdGVMb2NhbEJvdW5kcyIsIm5vZGVXVCIsImdldFdvcmxkVHJhbnNmb3JtIiwibG9jYWxTcGFjZSIsInNldEZyb21UcmFuc2Zvcm1lZEFhYmIiLCJhZGQiLCJoYWxmRXh0ZW50cyIsImFhYmIiLCJtZXNoIiwiX2FhYmJWZXIiLCJyZXNldFdvcmxkQm91bmRzIiwiSURFTlRJVFkiLCJtaW54IiwiTnVtYmVyIiwiTUFYX1ZBTFVFIiwibWlueSIsIm1pbnoiLCJtYXh4IiwibWF4eSIsIm1heHoiLCJtYXhSIiwibWF4U2NhbGUiLCJzdGVwV2VpZ2h0Iiwid1ZlbHMiLCJxVmVsb2NpdHkiLCJxVmVsb2NpdHkyIiwibFZlbHMiLCJxTG9jYWxWZWxvY2l0eSIsInFMb2NhbFZlbG9jaXR5MiIsImFjY3VtWCIsImFjY3VtWSIsImFjY3VtWiIsImFjY3VtUiIsImFjY3VtVyIsImluZGV4IiwicVJhZGlhbFNwZWVkIiwicVJhZGlhbFNwZWVkMiIsInFTY2FsZSIsInciLCJzZXRNaW5NYXgiLCJjb2xvck1hcCIsInNwYXduQm91bmRzIiwic29ydCIsIm1heFZlcnRleFRleHR1cmVzIiwiZnJhZ21lbnRVbmlmb3Jtc0NvdW50IiwiZm9yY2VDcHVQYXJ0aWNsZXMiLCJleHRUZXh0dXJlRmxvYXQiLCJfZGVzdHJveVJlc291cmNlcyIsInRleHR1cmVGbG9hdFJlbmRlcmFibGUiLCJ0b3RhbFZlcnRDb3VudCIsInZlcnRleEJ1ZmZlciIsIm51bVZlcnRpY2VzIiwibnVtUGFydGljbGVzUG90IiwibWF0aCIsIm5leHRQb3dlck9mVHdvIiwicmVidWlsZEdyYXBocyIsImlTb3J0IiwicmFuZG9taXplIiwicGFydGljbGVUZXgiLCJlbWl0dGVyUG9zIiwiWkVSTyIsImdldFBvc2l0aW9uIiwic2V0VFJTIiwiUXVhdCIsImdldFJvdGF0aW9uIiwibG9jYWxTY2FsZSIsImVtaXR0ZXJFeHRlbnRzSW5uZXIiLCJjYWxjU3Bhd25Qb3NpdGlvbiIsInBhcnRpY2xlVGV4U3RhcnQiLCJwYXJ0aWNsZVRleElOIiwicGFydGljbGVUZXhPVVQiLCJydFBhcnRpY2xlVGV4SU4iLCJSZW5kZXJUYXJnZXQiLCJjb2xvckJ1ZmZlciIsImRlcHRoIiwicnRQYXJ0aWNsZVRleE9VVCIsInNoYWRlckNvZGVTdGFydCIsInNoYWRlckNodW5rcyIsInBhcnRpY2xlVXBkYXRlckluaXRQUyIsInBhcnRpY2xlSW5wdXRSZ2JhOFBTIiwicGFydGljbGVPdXRwdXRSZ2JhOFBTIiwicGFydGljbGVJbnB1dEZsb2F0UFMiLCJwYXJ0aWNsZU91dHB1dEZsb2F0UFMiLCJwYXJ0aWNsZVVwZGF0ZXJBQUJCUFMiLCJwYXJ0aWNsZVVwZGF0ZXJTcGhlcmVQUyIsInBhcnRpY2xlVXBkYXRlclN0YXJ0UFMiLCJzaGFkZXJDb2RlUmVzcGF3biIsInBhcnRpY2xlVXBkYXRlclJlc3Bhd25QUyIsInBhcnRpY2xlVXBkYXRlckVuZFBTIiwic2hhZGVyQ29kZU5vUmVzcGF3biIsInBhcnRpY2xlVXBkYXRlck5vUmVzcGF3blBTIiwic2hhZGVyQ29kZU9uU3RvcCIsInBhcnRpY2xlVXBkYXRlck9uU3RvcFBTIiwicGFyYW1zIiwiY3JlYXRlU2hhZGVyRnJvbUNvZGUiLCJmdWxsc2NyZWVuUXVhZFZTIiwiaW5kZXhCdWZmZXIiLCJudW1JbmRpY2VzIiwiX2FsbG9jYXRlIiwiTWVzaCIsInByaW1pdGl2ZSIsInR5cGUiLCJQUklNSVRJVkVfVFJJQU5HTEVTIiwiYmFzZSIsImNvdW50IiwiaW5kZXhlZCIsIk1hdGVyaWFsIiwiY3VsbCIsIkNVTExGQUNFX05PTkUiLCJhbHBoYVdyaXRlIiwiYmxlbmRUeXBlIiwiZGVwdGhXcml0ZSIsIndhc1Zpc2libGUiLCJ2aXNpYmxlIiwiTWVzaEluc3RhbmNlIiwicGljayIsInVwZGF0ZUtleSIsIl9ub0RlcHRoRHJhd0dsMSIsIl91cGRhdGVBYWJiIiwiX2luaXRpYWxpemVUZXh0dXJlcyIsInJlc2V0VGltZSIsImFkZFRpbWUiLCJwcmVXYXJtIiwicHJld2FybSIsIl9pc0FuaW1hdGVkIiwiYW5pbU51bUZyYW1lcyIsImFuaW1UaWxlc1giLCJhbmltVGlsZXNZIiwibm9ybWFsTWFwIiwicXVhbnRpemUiLCJxQ29sb3IiLCJxdWFudGl6ZUNsYW1wZWQiLCJxUm90U3BlZWQiLCJxQWxwaGEiLCJsb2NhbFZlbG9jaXR5R3JhcGgyIiwidmVsb2NpdHlHcmFwaDIiLCJxQ29sb3IyIiwiY29sb3JHcmFwaDIiLCJxUm90U3BlZWQyIiwicm90YXRpb25TcGVlZEdyYXBoMiIsInFTY2FsZTIiLCJzY2FsZUdyYXBoMiIsInFBbHBoYTIiLCJhbHBoYUdyYXBoMiIsInJhZGlhbFNwZWVkR3JhcGgyIiwiREVHX1RPX1JBRCIsImxvY2FsVmVsb2NpdHlVTWF4IiwidmVsb2NpdHlVTWF4IiwiY29sb3JVTWF4Iiwicm90U3BlZWRVTWF4Iiwic2NhbGVVTWF4IiwiYWxwaGFVTWF4IiwicmFkaWFsU3BlZWRVTWF4IiwicUxvY2FsVmVsb2NpdHlEaXYiLCJxVmVsb2NpdHlEaXYiLCJxQ29sb3JEaXYiLCJxUm90U3BlZWREaXYiLCJxU2NhbGVEaXYiLCJxQWxwaGFEaXYiLCJxUmFkaWFsU3BlZWREaXYiLCJ1bWF4IiwidW1heDIiLCJsdW1heCIsImx1bWF4MiIsInJ1bWF4IiwicnVtYXgyIiwibWF4VmVsIiwibG1heFZlbCIsIm1heFJhZCIsImludGVybmFsVGV4MyIsInNldFBhcmFtZXRlciIsImxpZ2h0aW5nIiwicHJvZ3JhbUxpYiIsImdldFByb2dyYW1MaWJyYXJ5IiwicmVnaXN0ZXIiLCJwYXJ0aWNsZSIsImhhc05vcm1hbCIsIm5vcm1hbE9wdGlvbiIsImdldFNoYWRlclZhcmlhbnQiLCJkZXYiLCJzYyIsImRlZnMiLCJ1bnVzZWQiLCJwYXNzIiwic29ydGVkTGlnaHRzIiwidmlld1VuaWZvcm1Gb3JtYXQiLCJ2aWV3QmluZEdyb3VwRm9ybWF0Iiwic2NlbmUiLCJfYWN0aXZlQ2FtZXJhIiwiaW5Ub29scyIsInByb2Nlc3NpbmdPcHRpb25zIiwiU2hhZGVyUHJvY2Vzc29yT3B0aW9ucyIsInNoYWRlciIsImdldFByb2dyYW0iLCJTSEFERVJfRk9SV0FSRCIsIm5vcm1hbCIsImhhbGZsYW1iZXJ0IiwiaGFsZkxhbWJlcnQiLCJzdHJldGNoIiwiYWxpZ25Ub01vdGlvbiIsInNvZnQiLCJkZXB0aFNvZnRlbmluZyIsImdhbW1hIiwiZ2FtbWFDb3JyZWN0aW9uIiwidG9uZU1hcCIsInRvbmVNYXBwaW5nIiwiZm9nIiwibm9Gb2ciLCJ3cmFwIiwid3JhcEJvdW5kcyIsInNjcmVlblNwYWNlIiwiYmxlbmQiLCJhbmltVGV4IiwiYW5pbVRleExvb3AiLCJhbmltTG9vcCIsImN1c3RvbUZhY2UiLCJvcmllbnRhdGlvbiIsImludGVuc2l0eSIsIl9zZXRJbnB1dEJvdW5kcyIsImluQm91bmRzU2l6ZVVuaWZvcm0iLCJpbkJvdW5kc0NlbnRlclVuaWZvcm0iLCJfY29tcFBhcnRpY2xlRmFjZVBhcmFtcyIsInRhbmdlbnQiLCJiaW5vcm1hbCIsIm4iLCJQQVJUSUNMRU9SSUVOVEFUSU9OX1dPUkxEIiwicGFydGljbGVOb3JtYWwiLCJub3JtYWxpemUiLCJlbWl0dGVyTWF0IiwidHJhbnNmb3JtVmVjdG9yIiwidCIsImRvdCIsImNyb3NzIiwicHN5c1ZlcnRDb3VudCIsInBzeXNJbmRleENvdW50IiwiZ2V0TnVtVmVydGljZXMiLCJlbGVtZW50cyIsInNlbWFudGljIiwiU0VNQU5USUNfQVRUUjAiLCJjb21wb25lbnRzIiwiVFlQRV9GTE9BVDMyIiwicHVzaCIsIlNFTUFOVElDX0FUVFIxIiwicGFydGljbGVGb3JtYXQiLCJWZXJ0ZXhGb3JtYXQiLCJWZXJ0ZXhCdWZmZXIiLCJCVUZGRVJfRFlOQU1JQyIsIkluZGV4QnVmZmVyIiwiSU5ERVhGT1JNQVRfVUlOVDE2IiwiU0VNQU5USUNfQVRUUjIiLCJTRU1BTlRJQ19BVFRSMyIsIlNFTUFOVElDX0FUVFI0IiwiZGF0YSIsIm1lc2hEYXRhIiwic3RyaWRlIiwidGV4Q29vcmRPZmZzZXQiLCJlbGVtIiwiU0VNQU5USUNfVEVYQ09PUkQwIiwib2Zmc2V0IiwiaWQiLCJmbG9vciIsInZlcnRJRCIsInZlcnQiLCJ2YkNQVSIsImRzdCIsImluZGljZXMiLCJVaW50MTZBcnJheSIsImJhc2VJbmRleCIsInJlc2V0Iiwib3JpZ0xvb3AiLCJsb29wIiwidGltZSIsImxpZmV0aW1lRnJhY3Rpb24iLCJpdGVyYXRpb25zIiwic3RlcERlbHRhIiwiZW5kVGltZSIsImZpbmlzaEZyYW1lIiwiZGVsdGEiLCJpc09uU3RvcCIsInN0YXJ0VGltZSIsInRpbGVzUGFyYW1zIiwiYW5pbVN0YXJ0RnJhbWUiLCJhbmltU3BlZWQiLCJhbmltTnVtQW5pbWF0aW9ucyIsImFuaW1JbmRleCIsInJhbmRvbWl6ZUFuaW1JbmRleCIsImVtaXR0ZXJTY2FsZSIsIk9ORSIsInVwZGF0ZSIsIm9uRmluaXNoZWQiLCJkZXN0cm95Il0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBK0NBLE1BQU1BLGFBQWEsR0FBRyxDQUNsQixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQ1IsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFDUCxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFDTixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUNWLENBQUE7QUFFRCxTQUFTQyxjQUFjQSxDQUFDQyxNQUFNLEVBQUVDLEtBQUssRUFBRUMsTUFBTSxFQUFFQyxTQUFTLEVBQUVDLE1BQU0sR0FBR0MsbUJBQW1CLEVBQUVDLFFBQVEsRUFBRUMsTUFBTSxFQUFFO0VBRXRHLElBQUlDLFNBQVMsR0FBR0MsY0FBYyxDQUFBO0VBQzlCLElBQUlGLE1BQU0sSUFBSUgsTUFBTSxLQUFLTSxpQkFBaUIsRUFDdENGLFNBQVMsR0FBR0csYUFBYSxDQUFBO0FBRTdCLEVBQUEsTUFBTUMsT0FBTyxHQUFHLElBQUlDLE9BQU8sQ0FBQ2IsTUFBTSxFQUFFO0FBQ2hDQyxJQUFBQSxLQUFLLEVBQUVBLEtBQUs7QUFDWkMsSUFBQUEsTUFBTSxFQUFFQSxNQUFNO0FBQ2RFLElBQUFBLE1BQU0sRUFBRUEsTUFBTTtBQUNkVSxJQUFBQSxPQUFPLEVBQUUsS0FBSztBQUNkQyxJQUFBQSxPQUFPLEVBQUUsS0FBSztBQUNkQyxJQUFBQSxTQUFTLEVBQUVSLFNBQVM7QUFDcEJTLElBQUFBLFNBQVMsRUFBRVQsU0FBUztBQUNwQlUsSUFBQUEsUUFBUSxFQUFFQyxxQkFBcUI7QUFDL0JDLElBQUFBLFFBQVEsRUFBRUQscUJBQXFCO0FBQy9CRSxJQUFBQSxJQUFJLEVBQUUsdUJBQUE7QUFDVixHQUFDLENBQUMsQ0FBQTtBQUVGLEVBQUEsTUFBTUMsTUFBTSxHQUFHVixP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
