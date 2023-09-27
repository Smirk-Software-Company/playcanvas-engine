import { Debug } from '../../core/debug.js';
import { now } from '../../core/time.js';
import { Color } from '../../core/math/color.js';
import { math } from '../../core/math/math.js';
import { Vec3 } from '../../core/math/vec3.js';
import { BoundingBox } from '../../core/shape/bounding-box.js';
import { PIXELFORMAT_RGBA8, TEXTURETYPE_RGBM, CHUNKAPI_1_65, CULLFACE_NONE, TEXHINT_LIGHTMAP, TEXTURETYPE_DEFAULT, FILTER_NEAREST, ADDRESS_CLAMP_TO_EDGE, FILTER_LINEAR } from '../../platform/graphics/constants.js';
import { DebugGraphics } from '../../platform/graphics/debug-graphics.js';
import { RenderTarget } from '../../platform/graphics/render-target.js';
import { drawQuadWithShader } from '../../scene/graphics/quad-render-utils.js';
import { Texture } from '../../platform/graphics/texture.js';
import { MeshInstance } from '../../scene/mesh-instance.js';
import { LightingParams } from '../../scene/lighting/lighting-params.js';
import { WorldClusters } from '../../scene/lighting/world-clusters.js';
import { shaderChunks } from '../../scene/shader-lib/chunks/chunks.js';
import { shaderChunksLightmapper } from '../../scene/shader-lib/chunks/chunks-lightmapper.js';
import { PROJECTION_ORTHOGRAPHIC, MASK_AFFECT_LIGHTMAPPED, BAKE_COLORDIR, MASK_BAKE, MASK_AFFECT_DYNAMIC, LIGHTTYPE_DIRECTIONAL, SHADOWUPDATE_REALTIME, SHADOWUPDATE_THISFRAME, FOG_NONE, LIGHTTYPE_SPOT, PROJECTION_PERSPECTIVE, LIGHTTYPE_OMNI, SHADER_FORWARDHDR, SHADERDEF_LM, SHADERDEF_DIRLM, SHADERDEF_LMAMBIENT } from '../../scene/constants.js';
import { Camera } from '../../scene/camera.js';
import { GraphNode } from '../../scene/graph-node.js';
import { StandardMaterial } from '../../scene/materials/standard-material.js';
import { BakeLightSimple } from './bake-light-simple.js';
import { BakeLightAmbient } from './bake-light-ambient.js';
import { BakeMeshNode } from './bake-mesh-node.js';
import { LightmapCache } from '../../scene/graphics/lightmap-cache.js';
import { LightmapFilters } from './lightmap-filters.js';
import { BlendState } from '../../platform/graphics/blend-state.js';
import { DepthState } from '../../platform/graphics/depth-state.js';

const MAX_LIGHTMAP_SIZE = 2048;
const PASS_COLOR = 0;
const PASS_DIR = 1;
const tempVec = new Vec3();

/**
 * The lightmapper is used to bake scene lights into textures.
 *
 * @category Graphics
 */
class Lightmapper {
  /**
   * Create a new Lightmapper instance.
   *
   * @param {import('../../platform/graphics/graphics-device.js').GraphicsDevice} device - The
   * graphics device used by the lightmapper.
   * @param {import('../entity.js').Entity} root - The root entity of the scene.
   * @param {import('../../scene/scene.js').Scene} scene - The scene to lightmap.
   * @param {import('../../scene/renderer/forward-renderer.js').ForwardRenderer} renderer - The
   * renderer.
   * @param {import('../asset/asset-registry.js').AssetRegistry} assets - Registry of assets to
   * lightmap.
   * @hideconstructor
   */
  constructor(device, root, scene, renderer, assets) {
    this.device = device;
    this.root = root;
    this.scene = scene;
    this.renderer = renderer;
    this.assets = assets;
    this.shadowMapCache = renderer.shadowMapCache;
    this._tempSet = new Set();
    this._initCalled = false;

    // internal materials used by baking
    this.passMaterials = [];
    this.ambientAOMaterial = null;
    this.fog = '';
    this.ambientLight = new Color();

    // dictionary of spare render targets with color buffer for each used size
    this.renderTargets = new Map();
    this.stats = {
      renderPasses: 0,
      lightmapCount: 0,
      totalRenderTime: 0,
      forwardTime: 0,
      fboTime: 0,
      shadowMapTime: 0,
      compileTime: 0,
      shadersLinked: 0
    };
  }
  destroy() {
    // release reference to the texture
    LightmapCache.decRef(this.blackTex);
    this.blackTex = null;

    // destroy all lightmaps
    LightmapCache.destroy();
    this.device = null;
    this.root = null;
    this.scene = null;
    this.renderer = null;
    this.assets = null;
  }
  initBake(device) {
    // only initialize one time
    if (!this._initCalled) {
      this._initCalled = true;

      // lightmap filtering shaders
      this.lightmapFilters = new LightmapFilters(device);

      // shader related
      this.constantBakeDir = device.scope.resolve('bakeDir');
      this.materials = [];

      // small black texture
      this.blackTex = new Texture(this.device, {
        width: 4,
        height: 4,
        format: PIXELFORMAT_RGBA8,
        type: TEXTURETYPE_RGBM,
        name: 'lightmapBlack'
      });

      // incref black texture in the cache to avoid it being destroyed
      LightmapCache.incRef(this.blackTex);

      // camera used for baking
      const camera = new Camera();
      camera.clearColor.set(0, 0, 0, 0);
      camera.clearColorBuffer = true;
      camera.clearDepthBuffer = false;
      camera.clearStencilBuffer = false;
      camera.frustumCulling = false;
      camera.projection = PROJECTION_ORTHOGRAPHIC;
      camera.aspectRatio = 1;
      camera.node = new GraphNode();
      this.camera = camera;
    }

    // create light cluster structure
    if (this.scene.clusteredLightingEnabled) {
      // create light params, and base most parameters on the lighting params of the scene
      const lightingParams = new LightingParams(device.supportsAreaLights, device.maxTextureSize, () => {});
      this.lightingParams = lightingParams;
      const srcParams = this.scene.lighting;
      lightingParams.shadowsEnabled = srcParams.shadowsEnabled;
      lightingParams.shadowAtlasResolution = srcParams.shadowAtlasResolution;
      lightingParams.cookiesEnabled = srcParams.cookiesEnabled;
      lightingParams.cookieAtlasResolution = srcParams.cookieAtlasResolution;
      lightingParams.areaLightsEnabled = srcParams.areaLightsEnabled;

      // some custom lightmapping params - we bake single light a time
      lightingParams.cells = new Vec3(3, 3, 3);
      lightingParams.maxLightsPerCell = 4;
      this.worldClusters = new WorldClusters(device);
      this.worldClusters.name = 'ClusterLightmapper';
    }
  }
  finishBake(bakeNodes) {
    this.materials = [];
    function destroyRT(rt) {
      // this can cause ref count to be 0 and texture destroyed
      LightmapCache.decRef(rt.colorBuffer);

      // destroy render target itself
      rt.destroy();
    }

    // spare render targets including color buffer
    this.renderTargets.forEach(rt => {
      destroyRT(rt);
    });
    this.renderTargets.clear();

    // destroy render targets from nodes (but not color buffer)
    bakeNodes.forEach(node => {
      node.renderTargets.forEach(rt => {
        destroyRT(rt);
      });
      node.renderTargets.length = 0;
    });

    // this shader is only valid for specific brightness and contrast values, dispose it
    this.ambientAOMaterial = null;

    // delete light cluster
    if (this.worldClusters) {
      this.worldClusters.destroy();
      this.worldClusters = null;
    }
  }
  createMaterialForPass(device, scene, pass, addAmbient) {
    const material = new StandardMaterial();
    material.name = `lmMaterial-pass:${pass}-ambient:${addAmbient}`;
    material.chunks.APIVersion = CHUNKAPI_1_65;
    material.chunks.transformVS = '#define UV1LAYOUT\n' + shaderChunks.transformVS; // draw UV1

    if (pass === PASS_COLOR) {
      let bakeLmEndChunk = shaderChunksLightmapper.bakeLmEndPS; // encode to RGBM
      if (addAmbient) {
        // diffuse light stores accumulated AO, apply contrast and brightness to it
        // and multiply ambient light color by the AO
        bakeLmEndChunk = `
                    dDiffuseLight = ((dDiffuseLight - 0.5) * max(${scene.ambientBakeOcclusionContrast.toFixed(1)} + 1.0, 0.0)) + 0.5;
                    dDiffuseLight += vec3(${scene.ambientBakeOcclusionBrightness.toFixed(1)});
                    dDiffuseLight = saturate(dDiffuseLight);
                    dDiffuseLight *= dAmbientLight;
                ` + bakeLmEndChunk;
      } else {
        material.ambient = new Color(0, 0, 0); // don't bake ambient
        material.ambientTint = true;
      }
      material.chunks.basePS = shaderChunks.basePS + (scene.lightmapPixelFormat === PIXELFORMAT_RGBA8 ? '\n#define LIGHTMAP_RGBM\n' : '');
      material.chunks.endPS = bakeLmEndChunk;
      material.lightMap = this.blackTex;
    } else {
      material.chunks.basePS = shaderChunks.basePS + '\nuniform sampler2D texture_dirLightMap;\nuniform float bakeDir;\n';
      material.chunks.endPS = shaderChunksLightmapper.bakeDirLmEndPS;
    }

    // avoid writing unrelated things to alpha
    material.chunks.outputAlphaPS = '\n';
    material.chunks.outputAlphaOpaquePS = '\n';
    material.chunks.outputAlphaPremulPS = '\n';
    material.cull = CULLFACE_NONE;
    material.forceUv1 = true; // provide data to xformUv1
    material.update();
    return material;
  }
  createMaterials(device, scene, passCount) {
    for (let pass = 0; pass < passCount; pass++) {
      if (!this.passMaterials[pass]) {
        this.passMaterials[pass] = this.createMaterialForPass(device, scene, pass, false);
      }
    }

    // material used on last render of ambient light to multiply accumulated AO in lightmap by ambient light
    if (!this.ambientAOMaterial) {
      this.ambientAOMaterial = this.createMaterialForPass(device, scene, 0, true);
      this.ambientAOMaterial.onUpdateShader = function (options) {
        // mark LM as without ambient, to add it
        options.litOptions.lightMapWithoutAmbient = true;
        // don't add ambient to diffuse directly but keep it separate, to allow AO to be multiplied in
        options.litOptions.separateAmbient = true;
        return options;
      };
    }
  }
  createTexture(size, name) {
    return new Texture(this.device, {
      profilerHint: TEXHINT_LIGHTMAP,
      width: size,
      height: size,
      format: this.scene.lightmapPixelFormat,
      mipmaps: false,
      type: this.scene.lightmapPixelFormat === PIXELFORMAT_RGBA8 ? TEXTURETYPE_RGBM : TEXTURETYPE_DEFAULT,
      minFilter: FILTER_NEAREST,
      magFilter: FILTER_NEAREST,
      addressU: ADDRESS_CLAMP_TO_EDGE,
      addressV: ADDRESS_CLAMP_TO_EDGE,
      name: name
    });
  }

  // recursively walk the hierarchy of nodes starting at the specified node
  // collect all nodes that need to be lightmapped to bakeNodes array
  // collect all nodes with geometry to allNodes array
  collectModels(node, bakeNodes, allNodes) {
    var _node$model, _node$model2, _node$render;
    if (!node.enabled) return;

    // mesh instances from model component
    let meshInstances;
    if ((_node$model = node.model) != null && _node$model.model && (_node$model2 = node.model) != null && _node$model2.enabled) {
      if (allNodes) allNodes.push(new BakeMeshNode(node));
      if (node.model.lightmapped) {
        if (bakeNodes) {
          meshInstances = node.model.model.meshInstances;
        }
      }
    }

    // mesh instances from render component
    if ((_node$render = node.render) != null && _node$render.enabled) {
      if (allNodes) allNodes.push(new BakeMeshNode(node));
      if (node.render.lightmapped) {
        if (bakeNodes) {
          meshInstances = node.render.meshInstances;
        }
      }
    }
    if (meshInstances) {
      let hasUv1 = true;
      for (let i = 0; i < meshInstances.length; i++) {
        if (!meshInstances[i].mesh.vertexBuffer.format.hasUv1) {
          Debug.log(`Lightmapper - node [${node.name}] contains meshes without required uv1, excluding it from baking.`);
          hasUv1 = false;
          break;
        }
      }
      if (hasUv1) {
        const notInstancedMeshInstances = [];
        for (let i = 0; i < meshInstances.length; i++) {
          const mesh = meshInstances[i].mesh;

          // is this mesh an instance of already used mesh in this node
          if (this._tempSet.has(mesh)) {
            // collect each instance (object with shared VB) as separate "node"
            bakeNodes.push(new BakeMeshNode(node, [meshInstances[i]]));
          } else {
            notInstancedMeshInstances.push(meshInstances[i]);
          }
          this._tempSet.add(mesh);
        }
        this._tempSet.clear();

        // collect all non-shared objects as one "node"
        if (notInstancedMeshInstances.length > 0) {
          bakeNodes.push(new BakeMeshNode(node, notInstancedMeshInstances));
        }
      }
    }
    for (let i = 0; i < node._children.length; i++) {
      this.collectModels(node._children[i], bakeNodes, allNodes);
    }
  }

  // prepare all meshInstances that cast shadows into lightmaps
  prepareShadowCasters(nodes) {
    const casters = [];
    for (let n = 0; n < nodes.length; n++) {
      const component = nodes[n].component;
      component.castShadows = component.castShadowsLightmap;
      if (component.castShadowsLightmap) {
        const meshes = nodes[n].meshInstances;
        for (let i = 0; i < meshes.length; i++) {
          meshes[i].visibleThisFrame = true;
          casters.push(meshes[i]);
        }
      }
    }
    return casters;
  }

  // updates world transform for nodes
  updateTransforms(nodes) {
    for (let i = 0; i < nodes.length; i++) {
      const meshInstances = nodes[i].meshInstances;
      for (let j = 0; j < meshInstances.length; j++) {
        meshInstances[j].node.getWorldTransform();
      }
    }
  }

  // Note: this function is also called by the Editor to display estimated LM size in the inspector,
  // do not change its signature.
  calculateLightmapSize(node) {
    let data;
    const sizeMult = this.scene.lightmapSizeMultiplier || 16;
    const scale = tempVec;
    let srcArea, lightmapSizeMultiplier;
    if (node.model) {
      lightmapSizeMultiplier = node.model.lightmapSizeMultiplier;
      if (node.model.asset) {
        data = this.assets.get(node.model.asset).data;
        if (data.area) {
          srcArea = data.area;
        }
      } else if (node.model._area) {
        data = node.model;
        if (data._area) {
          srcArea = data._area;
        }
      }
    } else if (node.render) {
      lightmapSizeMultiplier = node.render.lightmapSizeMultiplier;
      if (node.render.type !== 'asset') {
        if (node.render._area) {
          data = node.render;
          if (data._area) {
            srcArea = data._area;
          }
        }
      }
    }

    // copy area
    const area = {
      x: 1,
      y: 1,
      z: 1,
      uv: 1
    };
    if (srcArea) {
      area.x = srcArea.x;
      area.y = srcArea.y;
      area.z = srcArea.z;
      area.uv = srcArea.uv;
    }
    const areaMult = lightmapSizeMultiplier || 1;
    area.x *= areaMult;
    area.y *= areaMult;
    area.z *= areaMult;

    // bounds of the component
    const component = node.render || node.model;
    const bounds = this.computeNodeBounds(component.meshInstances);

    // total area in the lightmap is based on the world space bounds of the mesh
    scale.copy(bounds.halfExtents);
    let totalArea = area.x * scale.y * scale.z + area.y * scale.x * scale.z + area.z * scale.x * scale.y;
    totalArea /= area.uv;
    totalArea = Math.sqrt(totalArea);
    const lightmapSize = Math.min(math.nextPowerOfTwo(totalArea * sizeMult), this.scene.lightmapMaxResolution || MAX_LIGHTMAP_SIZE);
    return lightmapSize;
  }
  setLightmapping(nodes, value, passCount, shaderDefs) {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const meshInstances = node.meshInstances;
      for (let j = 0; j < meshInstances.length; j++) {
        const meshInstance = meshInstances[j];
        meshInstance.setLightmapped(value);
        if (value) {
          if (shaderDefs) {
            meshInstance._shaderDefs |= shaderDefs;
          }

          // only lights that affect lightmapped objects are used on this mesh now that it is baked
          meshInstance.mask = MASK_AFFECT_LIGHTMAPPED;

          // textures
          for (let pass = 0; pass < passCount; pass++) {
            const tex = node.renderTargets[pass].colorBuffer;
            tex.minFilter = FILTER_LINEAR;
            tex.magFilter = FILTER_LINEAR;
            meshInstance.setRealtimeLightmap(MeshInstance.lightmapParamNames[pass], tex);
          }
        }
      }
    }
  }

  /**
   * Generates and applies the lightmaps.
   *
   * @param {import('../entity.js').Entity[]|null} nodes - An array of entities (with model or
   * render components) to render lightmaps for. If not supplied, the entire scene will be baked.
   * @param {number} [mode] - Baking mode. Can be:
   *
   * - {@link BAKE_COLOR}: single color lightmap
   * - {@link BAKE_COLORDIR}: single color lightmap + dominant light direction (used for
   * bump/specular)
   *
   * Only lights with bakeDir=true will be used for generating the dominant light direction.
   * Defaults to {@link BAKE_COLORDIR}.
   */
  bake(nodes, mode = BAKE_COLORDIR) {
    const device = this.device;
    if (device.isWebGPU) {
      Debug.warnOnce('Lightmapper is not supported on WebGPU, skipping.');
      return;
    }
    const startTime = now();

    // update skybox
    this.scene._updateSky(device);
    device.fire('lightmapper:start', {
      timestamp: startTime,
      target: this
    });
    this.stats.renderPasses = 0;
    this.stats.shadowMapTime = 0;
    this.stats.forwardTime = 0;
    const startShaders = device._shaderStats.linked;
    const startFboTime = device._renderTargetCreationTime;
    const startCompileTime = device._shaderStats.compileTime;

    // BakeMeshNode objects for baking
    const bakeNodes = [];

    // all BakeMeshNode objects
    const allNodes = [];

    // collect nodes / meshInstances for baking
    if (nodes) {
      // collect nodes for baking based on specified list of nodes
      for (let i = 0; i < nodes.length; i++) {
        this.collectModels(nodes[i], bakeNodes, null);
      }

      // collect all nodes from the scene
      this.collectModels(this.root, null, allNodes);
    } else {
      // collect nodes from the root of the scene
      this.collectModels(this.root, bakeNodes, allNodes);
    }
    DebugGraphics.pushGpuMarker(this.device, 'LMBake');

    // bake nodes
    if (bakeNodes.length > 0) {
      this.renderer.shadowRenderer.frameUpdate();

      // disable lightmapping
      const passCount = mode === BAKE_COLORDIR ? 2 : 1;
      this.setLightmapping(bakeNodes, false, passCount);
      this.initBake(device);
      this.bakeInternal(passCount, bakeNodes, allNodes);

      // Enable new lightmaps
      let shaderDefs = SHADERDEF_LM;
      if (mode === BAKE_COLORDIR) {
        shaderDefs |= SHADERDEF_DIRLM;
      }

      // mark lightmap as containing ambient lighting
      if (this.scene.ambientBake) {
        shaderDefs |= SHADERDEF_LMAMBIENT;
      }
      this.setLightmapping(bakeNodes, true, passCount, shaderDefs);

      // clean up memory
      this.finishBake(bakeNodes);
    }
    DebugGraphics.popGpuMarker(this.device);
    const nowTime = now();
    this.stats.totalRenderTime = nowTime - startTime;
    this.stats.shadersLinked = device._shaderStats.linked - startShaders;
    this.stats.compileTime = device._shaderStats.compileTime - startCompileTime;
    this.stats.fboTime = device._renderTargetCreationTime - startFboTime;
    this.stats.lightmapCount = bakeNodes.length;
    device.fire('lightmapper:end', {
      timestamp: nowTime,
      target: this
    });
  }

  // this allocates lightmap textures and render targets.
  allocateTextures(bakeNodes, passCount) {
    for (let i = 0; i < bakeNodes.length; i++) {
      // required lightmap size
      const bakeNode = bakeNodes[i];
      const size = this.calculateLightmapSize(bakeNode.node);

      // texture and render target for each pass, stored per node
      for (let pass = 0; pass < passCount; pass++) {
        const tex = this.createTexture(size, 'lightmapper_lightmap_' + i);
        LightmapCache.incRef(tex);
        bakeNode.renderTargets[pass] = new RenderTarget({
          colorBuffer: tex,
          depth: false
        });
      }

      // single temporary render target of each size
      if (!this.renderTargets.has(size)) {
        const tex = this.createTexture(size, 'lightmapper_temp_lightmap_' + size);
        LightmapCache.incRef(tex);
        this.renderTargets.set(size, new RenderTarget({
          colorBuffer: tex,
          depth: false
        }));
      }
    }
  }
  prepareLightsToBake(layerComposition, allLights, bakeLights) {
    // ambient light
    if (this.scene.ambientBake) {
      const ambientLight = new BakeLightAmbient(this.scene);
      bakeLights.push(ambientLight);
    }

    // scene lights
    const sceneLights = this.renderer.lights;
    for (let i = 0; i < sceneLights.length; i++) {
      const light = sceneLights[i];

      // store all lights and their original settings we need to temporarily modify
      const bakeLight = new BakeLightSimple(this.scene, light);
      allLights.push(bakeLight);

      // bake light
      if (light.enabled && (light.mask & MASK_BAKE) !== 0) {
        light.mask = MASK_BAKE | MASK_AFFECT_LIGHTMAPPED | MASK_AFFECT_DYNAMIC;
        light.shadowUpdateMode = light.type === LIGHTTYPE_DIRECTIONAL ? SHADOWUPDATE_REALTIME : SHADOWUPDATE_THISFRAME;
        bakeLights.push(bakeLight);
      }
    }

    // sort bake lights by type to minimize shader switches
    bakeLights.sort();
  }
  restoreLights(allLights) {
    for (let i = 0; i < allLights.length; i++) {
      allLights[i].restore();
    }
  }
  setupScene() {
    // backup
    this.fog = this.scene.fog;
    this.ambientLight.copy(this.scene.ambientLight);

    // set up scene
    this.scene.fog = FOG_NONE;

    // if not baking ambient, set it to black
    if (!this.scene.ambientBake) {
      this.scene.ambientLight.set(0, 0, 0);
    }

    // apply scene settings
    this.renderer.setSceneConstants();
  }
  restoreScene() {
    this.scene.fog = this.fog;
    this.scene.ambientLight.copy(this.ambientLight);
  }

  // compute bounding box for a single node
  computeNodeBounds(meshInstances) {
    const bounds = new BoundingBox();
    if (meshInstances.length > 0) {
      bounds.copy(meshInstances[0].aabb);
      for (let m = 1; m < meshInstances.length; m++) {
        bounds.add(meshInstances[m].aabb);
      }
    }
    return bounds;
  }

  // compute bounding box for each node
  computeNodesBounds(nodes) {
    for (let i = 0; i < nodes.length; i++) {
      const meshInstances = nodes[i].meshInstances;
      nodes[i].bounds = this.computeNodeBounds(meshInstances);
    }
  }

  // compute compound bounding box for an array of mesh instances
  computeBounds(meshInstances) {
    const bounds = new BoundingBox();
    for (let i = 0; i < meshInstances.length; i++) {
      bounds.copy(meshInstances[0].aabb);
      for (let m = 1; m < meshInstances.length; m++) {
        bounds.add(meshInstances[m].aabb);
      }
    }
    return bounds;
  }
  backupMaterials(meshInstances) {
    for (let i = 0; i < meshInstances.length; i++) {
      this.materials[i] = meshInstances[i].material;
    }
  }
  restoreMaterials(meshInstances) {
    for (let i = 0; i < meshInstances.length; i++) {
      meshInstances[i].material = this.materials[i];
    }
  }
  lightCameraPrepare(device, bakeLight) {
    const light = bakeLight.light;
    let shadowCam;

    // only prepare camera for spot light, other cameras need to be adjusted per cubemap face / per node later
    if (light.type === LIGHTTYPE_SPOT) {
      const lightRenderData = light.getRenderData(null, 0);
      shadowCam = lightRenderData.shadowCamera;
      shadowCam._node.setPosition(light._node.getPosition());
      shadowCam._node.setRotation(light._node.getRotation());
      shadowCam._node.rotateLocal(-90, 0, 0);
      shadowCam.projection = PROJECTION_PERSPECTIVE;
      shadowCam.nearClip = light.attenuationEnd / 1000;
      shadowCam.farClip = light.attenuationEnd;
      shadowCam.aspectRatio = 1;
      shadowCam.fov = light._outerConeAngle * 2;
      this.renderer.updateCameraFrustum(shadowCam);
    }
    return shadowCam;
  }

  // prepares camera / frustum of the light for rendering the bakeNode
  // returns true if light affects the bakeNode
  lightCameraPrepareAndCull(bakeLight, bakeNode, shadowCam, casterBounds) {
    const light = bakeLight.light;
    let lightAffectsNode = true;
    if (light.type === LIGHTTYPE_DIRECTIONAL) {
      // tweak directional light camera to fully see all casters and they are fully inside the frustum
      tempVec.copy(casterBounds.center);
      tempVec.y += casterBounds.halfExtents.y;
      this.camera.node.setPosition(tempVec);
      this.camera.node.setEulerAngles(-90, 0, 0);
      this.camera.nearClip = 0;
      this.camera.farClip = casterBounds.halfExtents.y * 2;
      const frustumSize = Math.max(casterBounds.halfExtents.x, casterBounds.halfExtents.z);
      this.camera.orthoHeight = frustumSize;
    } else {
      // for other light types, test if light affects the node
      if (!bakeLight.lightBounds.intersects(bakeNode.bounds)) {
        lightAffectsNode = false;
      }
    }

    // per meshInstance culling for spot light only
    // (omni lights cull per face later, directional lights don't cull)
    if (light.type === LIGHTTYPE_SPOT) {
      let nodeVisible = false;
      const meshInstances = bakeNode.meshInstances;
      for (let i = 0; i < meshInstances.length; i++) {
        if (meshInstances[i]._isVisible(shadowCam)) {
          nodeVisible = true;
          break;
        }
      }
      if (!nodeVisible) {
        lightAffectsNode = false;
      }
    }
    return lightAffectsNode;
  }

  // set up light array for a single light
  setupLightArray(lightArray, light) {
    lightArray[LIGHTTYPE_DIRECTIONAL].length = 0;
    lightArray[LIGHTTYPE_OMNI].length = 0;
    lightArray[LIGHTTYPE_SPOT].length = 0;
    lightArray[light.type][0] = light;
    light.visibleThisFrame = true;
  }
  renderShadowMap(comp, shadowMapRendered, casters, bakeLight) {
    const light = bakeLight.light;
    const isClustered = this.scene.clusteredLightingEnabled;
    if (!shadowMapRendered && light.castShadows) {
      // allocate shadow map from the cache to avoid per light allocation
      if (!light.shadowMap && !isClustered) {
        light.shadowMap = this.shadowMapCache.get(this.device, light);
      }
      if (light.type === LIGHTTYPE_DIRECTIONAL) {
        this.renderer._shadowRendererDirectional.cull(light, comp, this.camera, casters);
      } else {
        this.renderer._shadowRendererLocal.cull(light, comp, casters);
      }
      const insideRenderPass = false;
      this.renderer.shadowRenderer.render(light, this.camera, insideRenderPass);
    }
    return true;
  }
  postprocessTextures(device, bakeNodes, passCount) {
    const numDilates2x = 1; // 1 or 2 dilates (depending on filter being enabled)
    const dilateShader = this.lightmapFilters.shaderDilate;

    // bilateral denoise filter - runs as a first pass, before dilate
    const filterLightmap = this.scene.lightmapFilterEnabled;
    if (filterLightmap) {
      this.lightmapFilters.prepareDenoise(this.scene.lightmapFilterRange, this.scene.lightmapFilterSmoothness);
    }
    device.setBlendState(BlendState.NOBLEND);
    device.setDepthState(DepthState.NODEPTH);
    device.setStencilState(null, null);
    for (let node = 0; node < bakeNodes.length; node++) {
      const bakeNode = bakeNodes[node];
      DebugGraphics.pushGpuMarker(this.device, `LMPost:${node}`);
      for (let pass = 0; pass < passCount; pass++) {
        const nodeRT = bakeNode.renderTargets[pass];
        const lightmap = nodeRT.colorBuffer;
        const tempRT = this.renderTargets.get(lightmap.width);
        const tempTex = tempRT.colorBuffer;
        this.lightmapFilters.prepare(lightmap.width, lightmap.height);

        // bounce dilate between textures, execute denoise on the first pass
        for (let i = 0; i < numDilates2x; i++) {
          this.lightmapFilters.setSourceTexture(lightmap);
          const bilateralFilterEnabled = filterLightmap && pass === 0 && i === 0;
          drawQuadWithShader(device, tempRT, bilateralFilterEnabled ? this.lightmapFilters.shaderDenoise : dilateShader);
          this.lightmapFilters.setSourceTexture(tempTex);
          drawQuadWithShader(device, nodeRT, dilateShader);
        }
      }
      DebugGraphics.popGpuMarker(this.device);
    }
  }
  bakeInternal(passCount, bakeNodes, allNodes) {
    const scene = this.scene;
    const comp = scene.layers;
    const device = this.device;
    const clusteredLightingEnabled = scene.clusteredLightingEnabled;
    this.createMaterials(device, scene, passCount);
    this.setupScene();

    // update layer composition
    comp._update();

    // compute bounding boxes for nodes
    this.computeNodesBounds(bakeNodes);

    // Calculate lightmap sizes and allocate textures
    this.allocateTextures(bakeNodes, passCount);

    // Collect bakeable lights, and also keep allLights along with their properties we change to restore them later
    this.renderer.collectLights(comp);
    const allLights = [],
      bakeLights = [];
    this.prepareLightsToBake(comp, allLights, bakeLights);

    // update transforms
    this.updateTransforms(allNodes);

    // get all meshInstances that cast shadows into lightmap and set them up for realtime shadow casting
    const casters = this.prepareShadowCasters(allNodes);

    // update skinned and morphed meshes
    this.renderer.updateCpuSkinMatrices(casters);
    this.renderer.gpuUpdate(casters);

    // compound bounding box for all casters, used to compute shared directional light shadow
    const casterBounds = this.computeBounds(casters);
    let i, j, rcv, m;

    // Prepare models
    for (i = 0; i < bakeNodes.length; i++) {
      const bakeNode = bakeNodes[i];
      rcv = bakeNode.meshInstances;
      for (j = 0; j < rcv.length; j++) {
        // patch meshInstance
        m = rcv[j];
        m.setLightmapped(false);
        m.mask = MASK_BAKE; // only affected by LM lights

        // patch material
        m.setRealtimeLightmap(MeshInstance.lightmapParamNames[0], m.material.lightMap ? m.material.lightMap : this.blackTex);
        m.setRealtimeLightmap(MeshInstance.lightmapParamNames[1], this.blackTex);
      }
    }

    // Disable all bakeable lights
    for (j = 0; j < bakeLights.length; j++) {
      bakeLights[j].light.enabled = false;
    }
    const lightArray = [[], [], []];
    let pass, node;
    let shadersUpdatedOn1stPass = false;

    // Accumulate lights into RGBM textures
    for (i = 0; i < bakeLights.length; i++) {
      const bakeLight = bakeLights[i];
      const isAmbientLight = bakeLight instanceof BakeLightAmbient;
      const isDirectional = bakeLight.light.type === LIGHTTYPE_DIRECTIONAL;

      // light can be baked using many virtual lights to create soft effect
      let numVirtualLights = bakeLight.numVirtualLights;

      // direction baking is not currently compatible with virtual lights, as we end up with no valid direction in lights penumbra
      if (passCount > 1 && numVirtualLights > 1 && bakeLight.light.bakeDir) {
        numVirtualLights = 1;
        Debug.warn('Lightmapper\'s BAKE_COLORDIR mode is not compatible with Light\'s bakeNumSamples larger than one. Forcing it to one.');
      }
      for (let virtualLightIndex = 0; virtualLightIndex < numVirtualLights; virtualLightIndex++) {
        DebugGraphics.pushGpuMarker(device, `Light:${bakeLight.light._node.name}:${virtualLightIndex}`);

        // prepare virtual light
        if (numVirtualLights > 1) {
          bakeLight.prepareVirtualLight(virtualLightIndex, numVirtualLights);
        }
        bakeLight.startBake();
        let shadowMapRendered = false;
        const shadowCam = this.lightCameraPrepare(device, bakeLight);
        for (node = 0; node < bakeNodes.length; node++) {
          const bakeNode = bakeNodes[node];
          rcv = bakeNode.meshInstances;
          const lightAffectsNode = this.lightCameraPrepareAndCull(bakeLight, bakeNode, shadowCam, casterBounds);
          if (!lightAffectsNode) {
            continue;
          }
          this.setupLightArray(lightArray, bakeLight.light);
          const clusterLights = isDirectional ? [] : [bakeLight.light];
          if (clusteredLightingEnabled) {
            this.renderer.lightTextureAtlas.update(clusterLights, this.lightingParams);
          }

          // render light shadow map needs to be rendered
          shadowMapRendered = this.renderShadowMap(comp, shadowMapRendered, casters, bakeLight);
          if (clusteredLightingEnabled) {
            this.worldClusters.update(clusterLights, this.scene.gammaCorrection, this.lightingParams);
          }

          // Store original materials
          this.backupMaterials(rcv);
          for (pass = 0; pass < passCount; pass++) {
            // only bake first virtual light for pass 1, as it does not handle overlapping lights
            if (pass > 0 && virtualLightIndex > 0) {
              break;
            }

            // don't bake ambient light in pass 1, as there's no main direction
            if (isAmbientLight && pass > 0) {
              break;
            }
            DebugGraphics.pushGpuMarker(device, `LMPass:${pass}`);

            // lightmap size
            const nodeRT = bakeNode.renderTargets[pass];
            const lightmapSize = bakeNode.renderTargets[pass].colorBuffer.width;

            // get matching temp render target to render to
            const tempRT = this.renderTargets.get(lightmapSize);
            const tempTex = tempRT.colorBuffer;
            if (pass === 0) {
              shadersUpdatedOn1stPass = scene.updateShaders;
            } else if (shadersUpdatedOn1stPass) {
              scene.updateShaders = true;
            }
            let passMaterial = this.passMaterials[pass];
            if (isAmbientLight) {
              // for last virtual light of ambient light, multiply accumulated AO lightmap with ambient light
              const lastVirtualLightForPass = virtualLightIndex + 1 === numVirtualLights;
              if (lastVirtualLightForPass && pass === 0) {
                passMaterial = this.ambientAOMaterial;
              }
            }

            // set up material for baking a pass
            for (j = 0; j < rcv.length; j++) {
              rcv[j].material = passMaterial;
            }

            // update shader
            this.renderer.updateShaders(rcv);

            // ping-ponging output
            this.renderer.setCamera(this.camera, tempRT, true);
            if (pass === PASS_DIR) {
              this.constantBakeDir.setValue(bakeLight.light.bakeDir ? 1 : 0);
            }

            // prepare clustered lighting
            if (clusteredLightingEnabled) {
              this.worldClusters.activate();
            }
            this.renderer._forwardTime = 0;
            this.renderer._shadowMapTime = 0;
            this.renderer.renderForward(this.camera, rcv, lightArray, SHADER_FORWARDHDR);
            device.updateEnd();
            this.stats.shadowMapTime += this.renderer._shadowMapTime;
            this.stats.forwardTime += this.renderer._forwardTime;
            this.stats.renderPasses++;

            // temp render target now has lightmap, store it for the node
            bakeNode.renderTargets[pass] = tempRT;

            // and release previous lightmap into temp render target pool
            this.renderTargets.set(lightmapSize, nodeRT);
            for (j = 0; j < rcv.length; j++) {
              m = rcv[j];
              m.setRealtimeLightmap(MeshInstance.lightmapParamNames[pass], tempTex); // ping-ponging input
              m._shaderDefs |= SHADERDEF_LM; // force using LM even if material doesn't have it
            }

            DebugGraphics.popGpuMarker(device);
          }

          // Revert to original materials
          this.restoreMaterials(rcv);
        }
        bakeLight.endBake(this.shadowMapCache);
        DebugGraphics.popGpuMarker(device);
      }
    }
    this.postprocessTextures(device, bakeNodes, passCount);

    // restore changes
    for (node = 0; node < allNodes.length; node++) {
      allNodes[node].restore();
    }
    this.restoreLights(allLights);
    this.restoreScene();

    // empty cache to minimize persistent memory use .. if some cached textures are needed,
    // they will be allocated again as needed
    if (!clusteredLightingEnabled) {
      this.shadowMapCache.clear();
    }
  }
}

export { Lightmapper };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGlnaHRtYXBwZXIuanMiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9mcmFtZXdvcmsvbGlnaHRtYXBwZXIvbGlnaHRtYXBwZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgRGVidWcgfSBmcm9tICcuLi8uLi9jb3JlL2RlYnVnLmpzJztcbmltcG9ydCB7IG5vdyB9IGZyb20gJy4uLy4uL2NvcmUvdGltZS5qcyc7XG5pbXBvcnQgeyBDb2xvciB9IGZyb20gJy4uLy4uL2NvcmUvbWF0aC9jb2xvci5qcyc7XG5pbXBvcnQgeyBtYXRoIH0gZnJvbSAnLi4vLi4vY29yZS9tYXRoL21hdGguanMnO1xuaW1wb3J0IHsgVmVjMyB9IGZyb20gJy4uLy4uL2NvcmUvbWF0aC92ZWMzLmpzJztcbmltcG9ydCB7IEJvdW5kaW5nQm94IH0gZnJvbSAnLi4vLi4vY29yZS9zaGFwZS9ib3VuZGluZy1ib3guanMnO1xuXG5pbXBvcnQge1xuICAgIEFERFJFU1NfQ0xBTVBfVE9fRURHRSxcbiAgICBDSFVOS0FQSV8xXzY1LFxuICAgIENVTExGQUNFX05PTkUsXG4gICAgRklMVEVSX0xJTkVBUiwgRklMVEVSX05FQVJFU1QsXG4gICAgUElYRUxGT1JNQVRfUkdCQTgsXG4gICAgVEVYSElOVF9MSUdIVE1BUCxcbiAgICBURVhUVVJFVFlQRV9ERUZBVUxULCBURVhUVVJFVFlQRV9SR0JNXG59IGZyb20gJy4uLy4uL3BsYXRmb3JtL2dyYXBoaWNzL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBEZWJ1Z0dyYXBoaWNzIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vZ3JhcGhpY3MvZGVidWctZ3JhcGhpY3MuanMnO1xuaW1wb3J0IHsgUmVuZGVyVGFyZ2V0IH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vZ3JhcGhpY3MvcmVuZGVyLXRhcmdldC5qcyc7XG5pbXBvcnQgeyBkcmF3UXVhZFdpdGhTaGFkZXIgfSBmcm9tICcuLi8uLi9zY2VuZS9ncmFwaGljcy9xdWFkLXJlbmRlci11dGlscy5qcyc7XG5pbXBvcnQgeyBUZXh0dXJlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vZ3JhcGhpY3MvdGV4dHVyZS5qcyc7XG5cbmltcG9ydCB7IE1lc2hJbnN0YW5jZSB9IGZyb20gJy4uLy4uL3NjZW5lL21lc2gtaW5zdGFuY2UuanMnO1xuaW1wb3J0IHsgTGlnaHRpbmdQYXJhbXMgfSBmcm9tICcuLi8uLi9zY2VuZS9saWdodGluZy9saWdodGluZy1wYXJhbXMuanMnO1xuaW1wb3J0IHsgV29ybGRDbHVzdGVycyB9IGZyb20gJy4uLy4uL3NjZW5lL2xpZ2h0aW5nL3dvcmxkLWNsdXN0ZXJzLmpzJztcbmltcG9ydCB7IHNoYWRlckNodW5rcyB9IGZyb20gJy4uLy4uL3NjZW5lL3NoYWRlci1saWIvY2h1bmtzL2NodW5rcy5qcyc7XG5pbXBvcnQgeyBzaGFkZXJDaHVua3NMaWdodG1hcHBlciB9IGZyb20gJy4uLy4uL3NjZW5lL3NoYWRlci1saWIvY2h1bmtzL2NodW5rcy1saWdodG1hcHBlci5qcyc7XG5cbmltcG9ydCB7XG4gICAgQkFLRV9DT0xPUkRJUixcbiAgICBGT0dfTk9ORSxcbiAgICBMSUdIVFRZUEVfRElSRUNUSU9OQUwsIExJR0hUVFlQRV9PTU5JLCBMSUdIVFRZUEVfU1BPVCxcbiAgICBQUk9KRUNUSU9OX09SVEhPR1JBUEhJQywgUFJPSkVDVElPTl9QRVJTUEVDVElWRSxcbiAgICBTSEFERVJfRk9SV0FSREhEUixcbiAgICBTSEFERVJERUZfRElSTE0sIFNIQURFUkRFRl9MTSwgU0hBREVSREVGX0xNQU1CSUVOVCxcbiAgICBNQVNLX0JBS0UsIE1BU0tfQUZGRUNUX0xJR0hUTUFQUEVELCBNQVNLX0FGRkVDVF9EWU5BTUlDLFxuICAgIFNIQURPV1VQREFURV9SRUFMVElNRSwgU0hBRE9XVVBEQVRFX1RISVNGUkFNRVxufSBmcm9tICcuLi8uLi9zY2VuZS9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgQ2FtZXJhIH0gZnJvbSAnLi4vLi4vc2NlbmUvY2FtZXJhLmpzJztcbmltcG9ydCB7IEdyYXBoTm9kZSB9IGZyb20gJy4uLy4uL3NjZW5lL2dyYXBoLW5vZGUuanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRNYXRlcmlhbCB9IGZyb20gJy4uLy4uL3NjZW5lL21hdGVyaWFscy9zdGFuZGFyZC1tYXRlcmlhbC5qcyc7XG5cbmltcG9ydCB7IEJha2VMaWdodFNpbXBsZSB9IGZyb20gJy4vYmFrZS1saWdodC1zaW1wbGUuanMnO1xuaW1wb3J0IHsgQmFrZUxpZ2h0QW1iaWVudCB9IGZyb20gJy4vYmFrZS1saWdodC1hbWJpZW50LmpzJztcbmltcG9ydCB7IEJha2VNZXNoTm9kZSB9IGZyb20gJy4vYmFrZS1tZXNoLW5vZGUuanMnO1xuaW1wb3J0IHsgTGlnaHRtYXBDYWNoZSB9IGZyb20gJy4uLy4uL3NjZW5lL2dyYXBoaWNzL2xpZ2h0bWFwLWNhY2hlLmpzJztcbmltcG9ydCB7IExpZ2h0bWFwRmlsdGVycyB9IGZyb20gJy4vbGlnaHRtYXAtZmlsdGVycy5qcyc7XG5pbXBvcnQgeyBCbGVuZFN0YXRlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vZ3JhcGhpY3MvYmxlbmQtc3RhdGUuanMnO1xuaW1wb3J0IHsgRGVwdGhTdGF0ZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2dyYXBoaWNzL2RlcHRoLXN0YXRlLmpzJztcblxuY29uc3QgTUFYX0xJR0hUTUFQX1NJWkUgPSAyMDQ4O1xuXG5jb25zdCBQQVNTX0NPTE9SID0gMDtcbmNvbnN0IFBBU1NfRElSID0gMTtcblxuY29uc3QgdGVtcFZlYyA9IG5ldyBWZWMzKCk7XG5cbi8qKlxuICogVGhlIGxpZ2h0bWFwcGVyIGlzIHVzZWQgdG8gYmFrZSBzY2VuZSBsaWdodHMgaW50byB0ZXh0dXJlcy5cbiAqXG4gKiBAY2F0ZWdvcnkgR3JhcGhpY3NcbiAqL1xuY2xhc3MgTGlnaHRtYXBwZXIge1xuICAgIC8qKlxuICAgICAqIENyZWF0ZSBhIG5ldyBMaWdodG1hcHBlciBpbnN0YW5jZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuLi8uLi9wbGF0Zm9ybS9ncmFwaGljcy9ncmFwaGljcy1kZXZpY2UuanMnKS5HcmFwaGljc0RldmljZX0gZGV2aWNlIC0gVGhlXG4gICAgICogZ3JhcGhpY3MgZGV2aWNlIHVzZWQgYnkgdGhlIGxpZ2h0bWFwcGVyLlxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuLi9lbnRpdHkuanMnKS5FbnRpdHl9IHJvb3QgLSBUaGUgcm9vdCBlbnRpdHkgb2YgdGhlIHNjZW5lLlxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuLi8uLi9zY2VuZS9zY2VuZS5qcycpLlNjZW5lfSBzY2VuZSAtIFRoZSBzY2VuZSB0byBsaWdodG1hcC5cbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi4vLi4vc2NlbmUvcmVuZGVyZXIvZm9yd2FyZC1yZW5kZXJlci5qcycpLkZvcndhcmRSZW5kZXJlcn0gcmVuZGVyZXIgLSBUaGVcbiAgICAgKiByZW5kZXJlci5cbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi4vYXNzZXQvYXNzZXQtcmVnaXN0cnkuanMnKS5Bc3NldFJlZ2lzdHJ5fSBhc3NldHMgLSBSZWdpc3RyeSBvZiBhc3NldHMgdG9cbiAgICAgKiBsaWdodG1hcC5cbiAgICAgKiBAaGlkZWNvbnN0cnVjdG9yXG4gICAgICovXG4gICAgY29uc3RydWN0b3IoZGV2aWNlLCByb290LCBzY2VuZSwgcmVuZGVyZXIsIGFzc2V0cykge1xuICAgICAgICB0aGlzLmRldmljZSA9IGRldmljZTtcbiAgICAgICAgdGhpcy5yb290ID0gcm9vdDtcbiAgICAgICAgdGhpcy5zY2VuZSA9IHNjZW5lO1xuICAgICAgICB0aGlzLnJlbmRlcmVyID0gcmVuZGVyZXI7XG4gICAgICAgIHRoaXMuYXNzZXRzID0gYXNzZXRzO1xuICAgICAgICB0aGlzLnNoYWRvd01hcENhY2hlID0gcmVuZGVyZXIuc2hhZG93TWFwQ2FjaGU7XG5cbiAgICAgICAgdGhpcy5fdGVtcFNldCA9IG5ldyBTZXQoKTtcbiAgICAgICAgdGhpcy5faW5pdENhbGxlZCA9IGZhbHNlO1xuXG4gICAgICAgIC8vIGludGVybmFsIG1hdGVyaWFscyB1c2VkIGJ5IGJha2luZ1xuICAgICAgICB0aGlzLnBhc3NNYXRlcmlhbHMgPSBbXTtcbiAgICAgICAgdGhpcy5hbWJpZW50QU9NYXRlcmlhbCA9IG51bGw7XG5cbiAgICAgICAgdGhpcy5mb2cgPSAnJztcbiAgICAgICAgdGhpcy5hbWJpZW50TGlnaHQgPSBuZXcgQ29sb3IoKTtcblxuICAgICAgICAvLyBkaWN0aW9uYXJ5IG9mIHNwYXJlIHJlbmRlciB0YXJnZXRzIHdpdGggY29sb3IgYnVmZmVyIGZvciBlYWNoIHVzZWQgc2l6ZVxuICAgICAgICB0aGlzLnJlbmRlclRhcmdldHMgPSBuZXcgTWFwKCk7XG5cbiAgICAgICAgdGhpcy5zdGF0cyA9IHtcbiAgICAgICAgICAgIHJlbmRlclBhc3NlczogMCxcbiAgICAgICAgICAgIGxpZ2h0bWFwQ291bnQ6IDAsXG4gICAgICAgICAgICB0b3RhbFJlbmRlclRpbWU6IDAsXG4gICAgICAgICAgICBmb3J3YXJkVGltZTogMCxcbiAgICAgICAgICAgIGZib1RpbWU6IDAsXG4gICAgICAgICAgICBzaGFkb3dNYXBUaW1lOiAwLFxuICAgICAgICAgICAgY29tcGlsZVRpbWU6IDAsXG4gICAgICAgICAgICBzaGFkZXJzTGlua2VkOiAwXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgZGVzdHJveSgpIHtcblxuICAgICAgICAvLyByZWxlYXNlIHJlZmVyZW5jZSB0byB0aGUgdGV4dHVyZVxuICAgICAgICBMaWdodG1hcENhY2hlLmRlY1JlZih0aGlzLmJsYWNrVGV4KTtcbiAgICAgICAgdGhpcy5ibGFja1RleCA9IG51bGw7XG5cbiAgICAgICAgLy8gZGVzdHJveSBhbGwgbGlnaHRtYXBzXG4gICAgICAgIExpZ2h0bWFwQ2FjaGUuZGVzdHJveSgpO1xuXG4gICAgICAgIHRoaXMuZGV2aWNlID0gbnVsbDtcbiAgICAgICAgdGhpcy5yb290ID0gbnVsbDtcbiAgICAgICAgdGhpcy5zY2VuZSA9IG51bGw7XG4gICAgICAgIHRoaXMucmVuZGVyZXIgPSBudWxsO1xuICAgICAgICB0aGlzLmFzc2V0cyA9IG51bGw7XG4gICAgfVxuXG4gICAgaW5pdEJha2UoZGV2aWNlKSB7XG5cbiAgICAgICAgLy8gb25seSBpbml0aWFsaXplIG9uZSB0aW1lXG4gICAgICAgIGlmICghdGhpcy5faW5pdENhbGxlZCkge1xuICAgICAgICAgICAgdGhpcy5faW5pdENhbGxlZCA9IHRydWU7XG5cbiAgICAgICAgICAgIC8vIGxpZ2h0bWFwIGZpbHRlcmluZyBzaGFkZXJzXG4gICAgICAgICAgICB0aGlzLmxpZ2h0bWFwRmlsdGVycyA9IG5ldyBMaWdodG1hcEZpbHRlcnMoZGV2aWNlKTtcblxuICAgICAgICAgICAgLy8gc2hhZGVyIHJlbGF0ZWRcbiAgICAgICAgICAgIHRoaXMuY29uc3RhbnRCYWtlRGlyID0gZGV2aWNlLnNjb3BlLnJlc29sdmUoJ2Jha2VEaXInKTtcbiAgICAgICAgICAgIHRoaXMubWF0ZXJpYWxzID0gW107XG5cbiAgICAgICAgICAgIC8vIHNtYWxsIGJsYWNrIHRleHR1cmVcbiAgICAgICAgICAgIHRoaXMuYmxhY2tUZXggPSBuZXcgVGV4dHVyZSh0aGlzLmRldmljZSwge1xuICAgICAgICAgICAgICAgIHdpZHRoOiA0LFxuICAgICAgICAgICAgICAgIGhlaWdodDogNCxcbiAgICAgICAgICAgICAgICBmb3JtYXQ6IFBJWEVMRk9STUFUX1JHQkE4LFxuICAgICAgICAgICAgICAgIHR5cGU6IFRFWFRVUkVUWVBFX1JHQk0sXG4gICAgICAgICAgICAgICAgbmFtZTogJ2xpZ2h0bWFwQmxhY2snXG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8gaW5jcmVmIGJsYWNrIHRleHR1cmUgaW4gdGhlIGNhY2hlIHRvIGF2b2lkIGl0IGJlaW5nIGRlc3Ryb3llZFxuICAgICAgICAgICAgTGlnaHRtYXBDYWNoZS5pbmNSZWYodGhpcy5ibGFja1RleCk7XG5cbiAgICAgICAgICAgIC8vIGNhbWVyYSB1c2VkIGZvciBiYWtpbmdcbiAgICAgICAgICAgIGNvbnN0IGNhbWVyYSA9IG5ldyBDYW1lcmEoKTtcbiAgICAgICAgICAgIGNhbWVyYS5jbGVhckNvbG9yLnNldCgwLCAwLCAwLCAwKTtcbiAgICAgICAgICAgIGNhbWVyYS5jbGVhckNvbG9yQnVmZmVyID0gdHJ1ZTtcbiAgICAgICAgICAgIGNhbWVyYS5jbGVhckRlcHRoQnVmZmVyID0gZmFsc2U7XG4gICAgICAgICAgICBjYW1lcmEuY2xlYXJTdGVuY2lsQnVmZmVyID0gZmFsc2U7XG4gICAgICAgICAgICBjYW1lcmEuZnJ1c3R1bUN1bGxpbmcgPSBmYWxzZTtcbiAgICAgICAgICAgIGNhbWVyYS5wcm9qZWN0aW9uID0gUFJPSkVDVElPTl9PUlRIT0dSQVBISUM7XG4gICAgICAgICAgICBjYW1lcmEuYXNwZWN0UmF0aW8gPSAxO1xuICAgICAgICAgICAgY2FtZXJhLm5vZGUgPSBuZXcgR3JhcGhOb2RlKCk7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYSA9IGNhbWVyYTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGNyZWF0ZSBsaWdodCBjbHVzdGVyIHN0cnVjdHVyZVxuICAgICAgICBpZiAodGhpcy5zY2VuZS5jbHVzdGVyZWRMaWdodGluZ0VuYWJsZWQpIHtcblxuICAgICAgICAgICAgLy8gY3JlYXRlIGxpZ2h0IHBhcmFtcywgYW5kIGJhc2UgbW9zdCBwYXJhbWV0ZXJzIG9uIHRoZSBsaWdodGluZyBwYXJhbXMgb2YgdGhlIHNjZW5lXG4gICAgICAgICAgICBjb25zdCBsaWdodGluZ1BhcmFtcyA9IG5ldyBMaWdodGluZ1BhcmFtcyhkZXZpY2Uuc3VwcG9ydHNBcmVhTGlnaHRzLCBkZXZpY2UubWF4VGV4dHVyZVNpemUsICgpID0+IHt9KTtcbiAgICAgICAgICAgIHRoaXMubGlnaHRpbmdQYXJhbXMgPSBsaWdodGluZ1BhcmFtcztcblxuICAgICAgICAgICAgY29uc3Qgc3JjUGFyYW1zID0gdGhpcy5zY2VuZS5saWdodGluZztcbiAgICAgICAgICAgIGxpZ2h0aW5nUGFyYW1zLnNoYWRvd3NFbmFibGVkID0gc3JjUGFyYW1zLnNoYWRvd3NFbmFibGVkO1xuICAgICAgICAgICAgbGlnaHRpbmdQYXJhbXMuc2hhZG93QXRsYXNSZXNvbHV0aW9uID0gc3JjUGFyYW1zLnNoYWRvd0F0bGFzUmVzb2x1dGlvbjtcblxuICAgICAgICAgICAgbGlnaHRpbmdQYXJhbXMuY29va2llc0VuYWJsZWQgPSBzcmNQYXJhbXMuY29va2llc0VuYWJsZWQ7XG4gICAgICAgICAgICBsaWdodGluZ1BhcmFtcy5jb29raWVBdGxhc1Jlc29sdXRpb24gPSBzcmNQYXJhbXMuY29va2llQXRsYXNSZXNvbHV0aW9uO1xuXG4gICAgICAgICAgICBsaWdodGluZ1BhcmFtcy5hcmVhTGlnaHRzRW5hYmxlZCA9IHNyY1BhcmFtcy5hcmVhTGlnaHRzRW5hYmxlZDtcblxuICAgICAgICAgICAgLy8gc29tZSBjdXN0b20gbGlnaHRtYXBwaW5nIHBhcmFtcyAtIHdlIGJha2Ugc2luZ2xlIGxpZ2h0IGEgdGltZVxuICAgICAgICAgICAgbGlnaHRpbmdQYXJhbXMuY2VsbHMgPSBuZXcgVmVjMygzLCAzLCAzKTtcbiAgICAgICAgICAgIGxpZ2h0aW5nUGFyYW1zLm1heExpZ2h0c1BlckNlbGwgPSA0O1xuXG4gICAgICAgICAgICB0aGlzLndvcmxkQ2x1c3RlcnMgPSBuZXcgV29ybGRDbHVzdGVycyhkZXZpY2UpO1xuICAgICAgICAgICAgdGhpcy53b3JsZENsdXN0ZXJzLm5hbWUgPSAnQ2x1c3RlckxpZ2h0bWFwcGVyJztcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZpbmlzaEJha2UoYmFrZU5vZGVzKSB7XG5cbiAgICAgICAgdGhpcy5tYXRlcmlhbHMgPSBbXTtcblxuICAgICAgICBmdW5jdGlvbiBkZXN0cm95UlQocnQpIHtcbiAgICAgICAgICAgIC8vIHRoaXMgY2FuIGNhdXNlIHJlZiBjb3VudCB0byBiZSAwIGFuZCB0ZXh0dXJlIGRlc3Ryb3llZFxuICAgICAgICAgICAgTGlnaHRtYXBDYWNoZS5kZWNSZWYocnQuY29sb3JCdWZmZXIpO1xuXG4gICAgICAgICAgICAvLyBkZXN0cm95IHJlbmRlciB0YXJnZXQgaXRzZWxmXG4gICAgICAgICAgICBydC5kZXN0cm95KCk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBzcGFyZSByZW5kZXIgdGFyZ2V0cyBpbmNsdWRpbmcgY29sb3IgYnVmZmVyXG4gICAgICAgIHRoaXMucmVuZGVyVGFyZ2V0cy5mb3JFYWNoKChydCkgPT4ge1xuICAgICAgICAgICAgZGVzdHJveVJUKHJ0KTtcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMucmVuZGVyVGFyZ2V0cy5jbGVhcigpO1xuXG4gICAgICAgIC8vIGRlc3Ryb3kgcmVuZGVyIHRhcmdldHMgZnJvbSBub2RlcyAoYnV0IG5vdCBjb2xvciBidWZmZXIpXG4gICAgICAgIGJha2VOb2Rlcy5mb3JFYWNoKChub2RlKSA9PiB7XG4gICAgICAgICAgICBub2RlLnJlbmRlclRhcmdldHMuZm9yRWFjaCgocnQpID0+IHtcbiAgICAgICAgICAgICAgICBkZXN0cm95UlQocnQpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBub2RlLnJlbmRlclRhcmdldHMubGVuZ3RoID0gMDtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gdGhpcyBzaGFkZXIgaXMgb25seSB2YWxpZCBmb3Igc3BlY2lmaWMgYnJpZ2h0bmVzcyBhbmQgY29udHJhc3QgdmFsdWVzLCBkaXNwb3NlIGl0XG4gICAgICAgIHRoaXMuYW1iaWVudEFPTWF0ZXJpYWwgPSBudWxsO1xuXG4gICAgICAgIC8vIGRlbGV0ZSBsaWdodCBjbHVzdGVyXG4gICAgICAgIGlmICh0aGlzLndvcmxkQ2x1c3RlcnMpIHtcbiAgICAgICAgICAgIHRoaXMud29ybGRDbHVzdGVycy5kZXN0cm95KCk7XG4gICAgICAgICAgICB0aGlzLndvcmxkQ2x1c3RlcnMgPSBudWxsO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgY3JlYXRlTWF0ZXJpYWxGb3JQYXNzKGRldmljZSwgc2NlbmUsIHBhc3MsIGFkZEFtYmllbnQpIHtcbiAgICAgICAgY29uc3QgbWF0ZXJpYWwgPSBuZXcgU3RhbmRhcmRNYXRlcmlhbCgpO1xuICAgICAgICBtYXRlcmlhbC5uYW1lID0gYGxtTWF0ZXJpYWwtcGFzczoke3Bhc3N9LWFtYmllbnQ6JHthZGRBbWJpZW50fWA7XG4gICAgICAgIG1hdGVyaWFsLmNodW5rcy5BUElWZXJzaW9uID0gQ0hVTktBUElfMV82NTtcbiAgICAgICAgbWF0ZXJpYWwuY2h1bmtzLnRyYW5zZm9ybVZTID0gJyNkZWZpbmUgVVYxTEFZT1VUXFxuJyArIHNoYWRlckNodW5rcy50cmFuc2Zvcm1WUzsgLy8gZHJhdyBVVjFcblxuICAgICAgICBpZiAocGFzcyA9PT0gUEFTU19DT0xPUikge1xuICAgICAgICAgICAgbGV0IGJha2VMbUVuZENodW5rID0gc2hhZGVyQ2h1bmtzTGlnaHRtYXBwZXIuYmFrZUxtRW5kUFM7IC8vIGVuY29kZSB0byBSR0JNXG4gICAgICAgICAgICBpZiAoYWRkQW1iaWVudCkge1xuICAgICAgICAgICAgICAgIC8vIGRpZmZ1c2UgbGlnaHQgc3RvcmVzIGFjY3VtdWxhdGVkIEFPLCBhcHBseSBjb250cmFzdCBhbmQgYnJpZ2h0bmVzcyB0byBpdFxuICAgICAgICAgICAgICAgIC8vIGFuZCBtdWx0aXBseSBhbWJpZW50IGxpZ2h0IGNvbG9yIGJ5IHRoZSBBT1xuICAgICAgICAgICAgICAgIGJha2VMbUVuZENodW5rID0gYFxuICAgICAgICAgICAgICAgICAgICBkRGlmZnVzZUxpZ2h0ID0gKChkRGlmZnVzZUxpZ2h0IC0gMC41KSAqIG1heCgke3NjZW5lLmFtYmllbnRCYWtlT2NjbHVzaW9uQ29udHJhc3QudG9GaXhlZCgxKX0gKyAxLjAsIDAuMCkpICsgMC41O1xuICAgICAgICAgICAgICAgICAgICBkRGlmZnVzZUxpZ2h0ICs9IHZlYzMoJHtzY2VuZS5hbWJpZW50QmFrZU9jY2x1c2lvbkJyaWdodG5lc3MudG9GaXhlZCgxKX0pO1xuICAgICAgICAgICAgICAgICAgICBkRGlmZnVzZUxpZ2h0ID0gc2F0dXJhdGUoZERpZmZ1c2VMaWdodCk7XG4gICAgICAgICAgICAgICAgICAgIGREaWZmdXNlTGlnaHQgKj0gZEFtYmllbnRMaWdodDtcbiAgICAgICAgICAgICAgICBgICsgYmFrZUxtRW5kQ2h1bms7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIG1hdGVyaWFsLmFtYmllbnQgPSBuZXcgQ29sb3IoMCwgMCwgMCk7ICAgIC8vIGRvbid0IGJha2UgYW1iaWVudFxuICAgICAgICAgICAgICAgIG1hdGVyaWFsLmFtYmllbnRUaW50ID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIG1hdGVyaWFsLmNodW5rcy5iYXNlUFMgPSBzaGFkZXJDaHVua3MuYmFzZVBTICsgKHNjZW5lLmxpZ2h0bWFwUGl4ZWxGb3JtYXQgPT09IFBJWEVMRk9STUFUX1JHQkE4ID8gJ1xcbiNkZWZpbmUgTElHSFRNQVBfUkdCTVxcbicgOiAnJyk7XG4gICAgICAgICAgICBtYXRlcmlhbC5jaHVua3MuZW5kUFMgPSBiYWtlTG1FbmRDaHVuaztcbiAgICAgICAgICAgIG1hdGVyaWFsLmxpZ2h0TWFwID0gdGhpcy5ibGFja1RleDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIG1hdGVyaWFsLmNodW5rcy5iYXNlUFMgPSBzaGFkZXJDaHVua3MuYmFzZVBTICsgJ1xcbnVuaWZvcm0gc2FtcGxlcjJEIHRleHR1cmVfZGlyTGlnaHRNYXA7XFxudW5pZm9ybSBmbG9hdCBiYWtlRGlyO1xcbic7XG4gICAgICAgICAgICBtYXRlcmlhbC5jaHVua3MuZW5kUFMgPSBzaGFkZXJDaHVua3NMaWdodG1hcHBlci5iYWtlRGlyTG1FbmRQUztcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGF2b2lkIHdyaXRpbmcgdW5yZWxhdGVkIHRoaW5ncyB0byBhbHBoYVxuICAgICAgICBtYXRlcmlhbC5jaHVua3Mub3V0cHV0QWxwaGFQUyA9ICdcXG4nO1xuICAgICAgICBtYXRlcmlhbC5jaHVua3Mub3V0cHV0QWxwaGFPcGFxdWVQUyA9ICdcXG4nO1xuICAgICAgICBtYXRlcmlhbC5jaHVua3Mub3V0cHV0QWxwaGFQcmVtdWxQUyA9ICdcXG4nO1xuICAgICAgICBtYXRlcmlhbC5jdWxsID0gQ1VMTEZBQ0VfTk9ORTtcbiAgICAgICAgbWF0ZXJpYWwuZm9yY2VVdjEgPSB0cnVlOyAvLyBwcm92aWRlIGRhdGEgdG8geGZvcm1VdjFcbiAgICAgICAgbWF0ZXJpYWwudXBkYXRlKCk7XG5cbiAgICAgICAgcmV0dXJuIG1hdGVyaWFsO1xuICAgIH1cblxuICAgIGNyZWF0ZU1hdGVyaWFscyhkZXZpY2UsIHNjZW5lLCBwYXNzQ291bnQpIHtcbiAgICAgICAgZm9yIChsZXQgcGFzcyA9IDA7IHBhc3MgPCBwYXNzQ291bnQ7IHBhc3MrKykge1xuICAgICAgICAgICAgaWYgKCF0aGlzLnBhc3NNYXRlcmlhbHNbcGFzc10pIHtcbiAgICAgICAgICAgICAgICB0aGlzLnBhc3NNYXRlcmlhbHNbcGFzc10gPSB0aGlzLmNyZWF0ZU1hdGVyaWFsRm9yUGFzcyhkZXZpY2UsIHNjZW5lLCBwYXNzLCBmYWxzZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBtYXRlcmlhbCB1c2VkIG9uIGxhc3QgcmVuZGVyIG9mIGFtYmllbnQgbGlnaHQgdG8gbXVsdGlwbHkgYWNjdW11bGF0ZWQgQU8gaW4gbGlnaHRtYXAgYnkgYW1iaWVudCBsaWdodFxuICAgICAgICBpZiAoIXRoaXMuYW1iaWVudEFPTWF0ZXJpYWwpIHtcbiAgICAgICAgICAgIHRoaXMuYW1iaWVudEFPTWF0ZXJpYWwgPSB0aGlzLmNyZWF0ZU1hdGVyaWFsRm9yUGFzcyhkZXZpY2UsIHNjZW5lLCAwLCB0cnVlKTtcbiAgICAgICAgICAgIHRoaXMuYW1iaWVudEFPTWF0ZXJpYWwub25VcGRhdGVTaGFkZXIgPSBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICAgICAgICAgIC8vIG1hcmsgTE0gYXMgd2l0aG91dCBhbWJpZW50LCB0byBhZGQgaXRcbiAgICAgICAgICAgICAgICBvcHRpb25zLmxpdE9wdGlvbnMubGlnaHRNYXBXaXRob3V0QW1iaWVudCA9IHRydWU7XG4gICAgICAgICAgICAgICAgLy8gZG9uJ3QgYWRkIGFtYmllbnQgdG8gZGlmZnVzZSBkaXJlY3RseSBidXQga2VlcCBpdCBzZXBhcmF0ZSwgdG8gYWxsb3cgQU8gdG8gYmUgbXVsdGlwbGllZCBpblxuICAgICAgICAgICAgICAgIG9wdGlvbnMubGl0T3B0aW9ucy5zZXBhcmF0ZUFtYmllbnQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIHJldHVybiBvcHRpb25zO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGNyZWF0ZVRleHR1cmUoc2l6ZSwgbmFtZSkge1xuICAgICAgICByZXR1cm4gbmV3IFRleHR1cmUodGhpcy5kZXZpY2UsIHtcbiAgICAgICAgICAgIC8vICNpZiBfUFJPRklMRVJcbiAgICAgICAgICAgIHByb2ZpbGVySGludDogVEVYSElOVF9MSUdIVE1BUCxcbiAgICAgICAgICAgIC8vICNlbmRpZlxuICAgICAgICAgICAgd2lkdGg6IHNpemUsXG4gICAgICAgICAgICBoZWlnaHQ6IHNpemUsXG4gICAgICAgICAgICBmb3JtYXQ6IHRoaXMuc2NlbmUubGlnaHRtYXBQaXhlbEZvcm1hdCxcbiAgICAgICAgICAgIG1pcG1hcHM6IGZhbHNlLFxuICAgICAgICAgICAgdHlwZTogdGhpcy5zY2VuZS5saWdodG1hcFBpeGVsRm9ybWF0ID09PSBQSVhFTEZPUk1BVF9SR0JBOCA/IFRFWFRVUkVUWVBFX1JHQk0gOiBURVhUVVJFVFlQRV9ERUZBVUxULFxuICAgICAgICAgICAgbWluRmlsdGVyOiBGSUxURVJfTkVBUkVTVCxcbiAgICAgICAgICAgIG1hZ0ZpbHRlcjogRklMVEVSX05FQVJFU1QsXG4gICAgICAgICAgICBhZGRyZXNzVTogQUREUkVTU19DTEFNUF9UT19FREdFLFxuICAgICAgICAgICAgYWRkcmVzc1Y6IEFERFJFU1NfQ0xBTVBfVE9fRURHRSxcbiAgICAgICAgICAgIG5hbWU6IG5hbWVcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gcmVjdXJzaXZlbHkgd2FsayB0aGUgaGllcmFyY2h5IG9mIG5vZGVzIHN0YXJ0aW5nIGF0IHRoZSBzcGVjaWZpZWQgbm9kZVxuICAgIC8vIGNvbGxlY3QgYWxsIG5vZGVzIHRoYXQgbmVlZCB0byBiZSBsaWdodG1hcHBlZCB0byBiYWtlTm9kZXMgYXJyYXlcbiAgICAvLyBjb2xsZWN0IGFsbCBub2RlcyB3aXRoIGdlb21ldHJ5IHRvIGFsbE5vZGVzIGFycmF5XG4gICAgY29sbGVjdE1vZGVscyhub2RlLCBiYWtlTm9kZXMsIGFsbE5vZGVzKSB7XG4gICAgICAgIGlmICghbm9kZS5lbmFibGVkKSByZXR1cm47XG5cbiAgICAgICAgLy8gbWVzaCBpbnN0YW5jZXMgZnJvbSBtb2RlbCBjb21wb25lbnRcbiAgICAgICAgbGV0IG1lc2hJbnN0YW5jZXM7XG4gICAgICAgIGlmIChub2RlLm1vZGVsPy5tb2RlbCAmJiBub2RlLm1vZGVsPy5lbmFibGVkKSB7XG4gICAgICAgICAgICBpZiAoYWxsTm9kZXMpIGFsbE5vZGVzLnB1c2gobmV3IEJha2VNZXNoTm9kZShub2RlKSk7XG4gICAgICAgICAgICBpZiAobm9kZS5tb2RlbC5saWdodG1hcHBlZCkge1xuICAgICAgICAgICAgICAgIGlmIChiYWtlTm9kZXMpIHtcbiAgICAgICAgICAgICAgICAgICAgbWVzaEluc3RhbmNlcyA9IG5vZGUubW9kZWwubW9kZWwubWVzaEluc3RhbmNlcztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBtZXNoIGluc3RhbmNlcyBmcm9tIHJlbmRlciBjb21wb25lbnRcbiAgICAgICAgaWYgKG5vZGUucmVuZGVyPy5lbmFibGVkKSB7XG4gICAgICAgICAgICBpZiAoYWxsTm9kZXMpIGFsbE5vZGVzLnB1c2gobmV3IEJha2VNZXNoTm9kZShub2RlKSk7XG4gICAgICAgICAgICBpZiAobm9kZS5yZW5kZXIubGlnaHRtYXBwZWQpIHtcbiAgICAgICAgICAgICAgICBpZiAoYmFrZU5vZGVzKSB7XG4gICAgICAgICAgICAgICAgICAgIG1lc2hJbnN0YW5jZXMgPSBub2RlLnJlbmRlci5tZXNoSW5zdGFuY2VzO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChtZXNoSW5zdGFuY2VzKSB7XG4gICAgICAgICAgICBsZXQgaGFzVXYxID0gdHJ1ZTtcblxuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBtZXNoSW5zdGFuY2VzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFtZXNoSW5zdGFuY2VzW2ldLm1lc2gudmVydGV4QnVmZmVyLmZvcm1hdC5oYXNVdjEpIHtcbiAgICAgICAgICAgICAgICAgICAgRGVidWcubG9nKGBMaWdodG1hcHBlciAtIG5vZGUgWyR7bm9kZS5uYW1lfV0gY29udGFpbnMgbWVzaGVzIHdpdGhvdXQgcmVxdWlyZWQgdXYxLCBleGNsdWRpbmcgaXQgZnJvbSBiYWtpbmcuYCk7XG4gICAgICAgICAgICAgICAgICAgIGhhc1V2MSA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChoYXNVdjEpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBub3RJbnN0YW5jZWRNZXNoSW5zdGFuY2VzID0gW107XG4gICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBtZXNoSW5zdGFuY2VzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG1lc2ggPSBtZXNoSW5zdGFuY2VzW2ldLm1lc2g7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gaXMgdGhpcyBtZXNoIGFuIGluc3RhbmNlIG9mIGFscmVhZHkgdXNlZCBtZXNoIGluIHRoaXMgbm9kZVxuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5fdGVtcFNldC5oYXMobWVzaCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGNvbGxlY3QgZWFjaCBpbnN0YW5jZSAob2JqZWN0IHdpdGggc2hhcmVkIFZCKSBhcyBzZXBhcmF0ZSBcIm5vZGVcIlxuICAgICAgICAgICAgICAgICAgICAgICAgYmFrZU5vZGVzLnB1c2gobmV3IEJha2VNZXNoTm9kZShub2RlLCBbbWVzaEluc3RhbmNlc1tpXV0pKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG5vdEluc3RhbmNlZE1lc2hJbnN0YW5jZXMucHVzaChtZXNoSW5zdGFuY2VzW2ldKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB0aGlzLl90ZW1wU2V0LmFkZChtZXNoKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB0aGlzLl90ZW1wU2V0LmNsZWFyKCk7XG5cbiAgICAgICAgICAgICAgICAvLyBjb2xsZWN0IGFsbCBub24tc2hhcmVkIG9iamVjdHMgYXMgb25lIFwibm9kZVwiXG4gICAgICAgICAgICAgICAgaWYgKG5vdEluc3RhbmNlZE1lc2hJbnN0YW5jZXMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICBiYWtlTm9kZXMucHVzaChuZXcgQmFrZU1lc2hOb2RlKG5vZGUsIG5vdEluc3RhbmNlZE1lc2hJbnN0YW5jZXMpKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG5vZGUuX2NoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB0aGlzLmNvbGxlY3RNb2RlbHMobm9kZS5fY2hpbGRyZW5baV0sIGJha2VOb2RlcywgYWxsTm9kZXMpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gcHJlcGFyZSBhbGwgbWVzaEluc3RhbmNlcyB0aGF0IGNhc3Qgc2hhZG93cyBpbnRvIGxpZ2h0bWFwc1xuICAgIHByZXBhcmVTaGFkb3dDYXN0ZXJzKG5vZGVzKSB7XG5cbiAgICAgICAgY29uc3QgY2FzdGVycyA9IFtdO1xuICAgICAgICBmb3IgKGxldCBuID0gMDsgbiA8IG5vZGVzLmxlbmd0aDsgbisrKSB7XG4gICAgICAgICAgICBjb25zdCBjb21wb25lbnQgPSBub2Rlc1tuXS5jb21wb25lbnQ7XG5cbiAgICAgICAgICAgIGNvbXBvbmVudC5jYXN0U2hhZG93cyA9IGNvbXBvbmVudC5jYXN0U2hhZG93c0xpZ2h0bWFwO1xuICAgICAgICAgICAgaWYgKGNvbXBvbmVudC5jYXN0U2hhZG93c0xpZ2h0bWFwKSB7XG5cbiAgICAgICAgICAgICAgICBjb25zdCBtZXNoZXMgPSBub2Rlc1tuXS5tZXNoSW5zdGFuY2VzO1xuICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbWVzaGVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIG1lc2hlc1tpXS52aXNpYmxlVGhpc0ZyYW1lID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgY2FzdGVycy5wdXNoKG1lc2hlc1tpXSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGNhc3RlcnM7XG4gICAgfVxuXG4gICAgLy8gdXBkYXRlcyB3b3JsZCB0cmFuc2Zvcm0gZm9yIG5vZGVzXG4gICAgdXBkYXRlVHJhbnNmb3Jtcyhub2Rlcykge1xuXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbm9kZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGNvbnN0IG1lc2hJbnN0YW5jZXMgPSBub2Rlc1tpXS5tZXNoSW5zdGFuY2VzO1xuICAgICAgICAgICAgZm9yIChsZXQgaiA9IDA7IGogPCBtZXNoSW5zdGFuY2VzLmxlbmd0aDsgaisrKSB7XG4gICAgICAgICAgICAgICAgbWVzaEluc3RhbmNlc1tqXS5ub2RlLmdldFdvcmxkVHJhbnNmb3JtKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBOb3RlOiB0aGlzIGZ1bmN0aW9uIGlzIGFsc28gY2FsbGVkIGJ5IHRoZSBFZGl0b3IgdG8gZGlzcGxheSBlc3RpbWF0ZWQgTE0gc2l6ZSBpbiB0aGUgaW5zcGVjdG9yLFxuICAgIC8vIGRvIG5vdCBjaGFuZ2UgaXRzIHNpZ25hdHVyZS5cbiAgICBjYWxjdWxhdGVMaWdodG1hcFNpemUobm9kZSkge1xuICAgICAgICBsZXQgZGF0YTtcbiAgICAgICAgY29uc3Qgc2l6ZU11bHQgPSB0aGlzLnNjZW5lLmxpZ2h0bWFwU2l6ZU11bHRpcGxpZXIgfHwgMTY7XG4gICAgICAgIGNvbnN0IHNjYWxlID0gdGVtcFZlYztcblxuICAgICAgICBsZXQgc3JjQXJlYSwgbGlnaHRtYXBTaXplTXVsdGlwbGllcjtcblxuICAgICAgICBpZiAobm9kZS5tb2RlbCkge1xuICAgICAgICAgICAgbGlnaHRtYXBTaXplTXVsdGlwbGllciA9IG5vZGUubW9kZWwubGlnaHRtYXBTaXplTXVsdGlwbGllcjtcbiAgICAgICAgICAgIGlmIChub2RlLm1vZGVsLmFzc2V0KSB7XG4gICAgICAgICAgICAgICAgZGF0YSA9IHRoaXMuYXNzZXRzLmdldChub2RlLm1vZGVsLmFzc2V0KS5kYXRhO1xuICAgICAgICAgICAgICAgIGlmIChkYXRhLmFyZWEpIHtcbiAgICAgICAgICAgICAgICAgICAgc3JjQXJlYSA9IGRhdGEuYXJlYTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2UgaWYgKG5vZGUubW9kZWwuX2FyZWEpIHtcbiAgICAgICAgICAgICAgICBkYXRhID0gbm9kZS5tb2RlbDtcbiAgICAgICAgICAgICAgICBpZiAoZGF0YS5fYXJlYSkge1xuICAgICAgICAgICAgICAgICAgICBzcmNBcmVhID0gZGF0YS5fYXJlYTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAobm9kZS5yZW5kZXIpIHtcbiAgICAgICAgICAgIGxpZ2h0bWFwU2l6ZU11bHRpcGxpZXIgPSBub2RlLnJlbmRlci5saWdodG1hcFNpemVNdWx0aXBsaWVyO1xuICAgICAgICAgICAgaWYgKG5vZGUucmVuZGVyLnR5cGUgIT09ICdhc3NldCcpIHtcbiAgICAgICAgICAgICAgICBpZiAobm9kZS5yZW5kZXIuX2FyZWEpIHtcbiAgICAgICAgICAgICAgICAgICAgZGF0YSA9IG5vZGUucmVuZGVyO1xuICAgICAgICAgICAgICAgICAgICBpZiAoZGF0YS5fYXJlYSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgc3JjQXJlYSA9IGRhdGEuX2FyZWE7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBjb3B5IGFyZWFcbiAgICAgICAgY29uc3QgYXJlYSA9IHsgeDogMSwgeTogMSwgejogMSwgdXY6IDEgfTtcbiAgICAgICAgaWYgKHNyY0FyZWEpIHtcbiAgICAgICAgICAgIGFyZWEueCA9IHNyY0FyZWEueDtcbiAgICAgICAgICAgIGFyZWEueSA9IHNyY0FyZWEueTtcbiAgICAgICAgICAgIGFyZWEueiA9IHNyY0FyZWEuejtcbiAgICAgICAgICAgIGFyZWEudXYgPSBzcmNBcmVhLnV2O1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgYXJlYU11bHQgPSBsaWdodG1hcFNpemVNdWx0aXBsaWVyIHx8IDE7XG4gICAgICAgIGFyZWEueCAqPSBhcmVhTXVsdDtcbiAgICAgICAgYXJlYS55ICo9IGFyZWFNdWx0O1xuICAgICAgICBhcmVhLnogKj0gYXJlYU11bHQ7XG5cbiAgICAgICAgLy8gYm91bmRzIG9mIHRoZSBjb21wb25lbnRcbiAgICAgICAgY29uc3QgY29tcG9uZW50ID0gbm9kZS5yZW5kZXIgfHwgbm9kZS5tb2RlbDtcbiAgICAgICAgY29uc3QgYm91bmRzID0gdGhpcy5jb21wdXRlTm9kZUJvdW5kcyhjb21wb25lbnQubWVzaEluc3RhbmNlcyk7XG5cbiAgICAgICAgLy8gdG90YWwgYXJlYSBpbiB0aGUgbGlnaHRtYXAgaXMgYmFzZWQgb24gdGhlIHdvcmxkIHNwYWNlIGJvdW5kcyBvZiB0aGUgbWVzaFxuICAgICAgICBzY2FsZS5jb3B5KGJvdW5kcy5oYWxmRXh0ZW50cyk7XG4gICAgICAgIGxldCB0b3RhbEFyZWEgPSBhcmVhLnggKiBzY2FsZS55ICogc2NhbGUueiArXG4gICAgICAgICAgICAgICAgICAgICAgICBhcmVhLnkgKiBzY2FsZS54ICogc2NhbGUueiArXG4gICAgICAgICAgICAgICAgICAgICAgICBhcmVhLnogKiBzY2FsZS54ICogc2NhbGUueTtcbiAgICAgICAgdG90YWxBcmVhIC89IGFyZWEudXY7XG4gICAgICAgIHRvdGFsQXJlYSA9IE1hdGguc3FydCh0b3RhbEFyZWEpO1xuXG4gICAgICAgIGNvbnN0IGxpZ2h0bWFwU2l6ZSA9IE1hdGgubWluKG1hdGgubmV4dFBvd2VyT2ZUd28odG90YWxBcmVhICogc2l6ZU11bHQpLCB0aGlzLnNjZW5lLmxpZ2h0bWFwTWF4UmVzb2x1dGlvbiB8fCBNQVhfTElHSFRNQVBfU0laRSk7XG5cbiAgICAgICAgcmV0dXJuIGxpZ2h0bWFwU2l6ZTtcbiAgICB9XG5cbiAgICBzZXRMaWdodG1hcHBpbmcobm9kZXMsIHZhbHVlLCBwYXNzQ291bnQsIHNoYWRlckRlZnMpIHtcblxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG5vZGVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBub2RlID0gbm9kZXNbaV07XG4gICAgICAgICAgICBjb25zdCBtZXNoSW5zdGFuY2VzID0gbm9kZS5tZXNoSW5zdGFuY2VzO1xuXG4gICAgICAgICAgICBmb3IgKGxldCBqID0gMDsgaiA8IG1lc2hJbnN0YW5jZXMubGVuZ3RoOyBqKyspIHtcblxuICAgICAgICAgICAgICAgIGNvbnN0IG1lc2hJbnN0YW5jZSA9IG1lc2hJbnN0YW5jZXNbal07XG4gICAgICAgICAgICAgICAgbWVzaEluc3RhbmNlLnNldExpZ2h0bWFwcGVkKHZhbHVlKTtcblxuICAgICAgICAgICAgICAgIGlmICh2YWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoc2hhZGVyRGVmcykge1xuICAgICAgICAgICAgICAgICAgICAgICAgbWVzaEluc3RhbmNlLl9zaGFkZXJEZWZzIHw9IHNoYWRlckRlZnM7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAvLyBvbmx5IGxpZ2h0cyB0aGF0IGFmZmVjdCBsaWdodG1hcHBlZCBvYmplY3RzIGFyZSB1c2VkIG9uIHRoaXMgbWVzaCBub3cgdGhhdCBpdCBpcyBiYWtlZFxuICAgICAgICAgICAgICAgICAgICBtZXNoSW5zdGFuY2UubWFzayA9IE1BU0tfQUZGRUNUX0xJR0hUTUFQUEVEO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIHRleHR1cmVzXG4gICAgICAgICAgICAgICAgICAgIGZvciAobGV0IHBhc3MgPSAwOyBwYXNzIDwgcGFzc0NvdW50OyBwYXNzKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHRleCA9IG5vZGUucmVuZGVyVGFyZ2V0c1twYXNzXS5jb2xvckJ1ZmZlcjtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRleC5taW5GaWx0ZXIgPSBGSUxURVJfTElORUFSO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGV4Lm1hZ0ZpbHRlciA9IEZJTFRFUl9MSU5FQVI7XG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNoSW5zdGFuY2Uuc2V0UmVhbHRpbWVMaWdodG1hcChNZXNoSW5zdGFuY2UubGlnaHRtYXBQYXJhbU5hbWVzW3Bhc3NdLCB0ZXgpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogR2VuZXJhdGVzIGFuZCBhcHBsaWVzIHRoZSBsaWdodG1hcHMuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi4vZW50aXR5LmpzJykuRW50aXR5W118bnVsbH0gbm9kZXMgLSBBbiBhcnJheSBvZiBlbnRpdGllcyAod2l0aCBtb2RlbCBvclxuICAgICAqIHJlbmRlciBjb21wb25lbnRzKSB0byByZW5kZXIgbGlnaHRtYXBzIGZvci4gSWYgbm90IHN1cHBsaWVkLCB0aGUgZW50aXJlIHNjZW5lIHdpbGwgYmUgYmFrZWQuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFttb2RlXSAtIEJha2luZyBtb2RlLiBDYW4gYmU6XG4gICAgICpcbiAgICAgKiAtIHtAbGluayBCQUtFX0NPTE9SfTogc2luZ2xlIGNvbG9yIGxpZ2h0bWFwXG4gICAgICogLSB7QGxpbmsgQkFLRV9DT0xPUkRJUn06IHNpbmdsZSBjb2xvciBsaWdodG1hcCArIGRvbWluYW50IGxpZ2h0IGRpcmVjdGlvbiAodXNlZCBmb3JcbiAgICAgKiBidW1wL3NwZWN1bGFyKVxuICAgICAqXG4gICAgICogT25seSBsaWdodHMgd2l0aCBiYWtlRGlyPXRydWUgd2lsbCBiZSB1c2VkIGZvciBnZW5lcmF0aW5nIHRoZSBkb21pbmFudCBsaWdodCBkaXJlY3Rpb24uXG4gICAgICogRGVmYXVsdHMgdG8ge0BsaW5rIEJBS0VfQ09MT1JESVJ9LlxuICAgICAqL1xuICAgIGJha2Uobm9kZXMsIG1vZGUgPSBCQUtFX0NPTE9SRElSKSB7XG5cbiAgICAgICAgY29uc3QgZGV2aWNlID0gdGhpcy5kZXZpY2U7XG4gICAgICAgIGlmIChkZXZpY2UuaXNXZWJHUFUpIHtcbiAgICAgICAgICAgIERlYnVnLndhcm5PbmNlKCdMaWdodG1hcHBlciBpcyBub3Qgc3VwcG9ydGVkIG9uIFdlYkdQVSwgc2tpcHBpbmcuJyk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBzdGFydFRpbWUgPSBub3coKTtcblxuICAgICAgICAvLyB1cGRhdGUgc2t5Ym94XG4gICAgICAgIHRoaXMuc2NlbmUuX3VwZGF0ZVNreShkZXZpY2UpO1xuXG4gICAgICAgIC8vICNpZiBfUFJPRklMRVJcbiAgICAgICAgZGV2aWNlLmZpcmUoJ2xpZ2h0bWFwcGVyOnN0YXJ0Jywge1xuICAgICAgICAgICAgdGltZXN0YW1wOiBzdGFydFRpbWUsXG4gICAgICAgICAgICB0YXJnZXQ6IHRoaXNcbiAgICAgICAgfSk7XG4gICAgICAgIC8vICNlbmRpZlxuXG4gICAgICAgIHRoaXMuc3RhdHMucmVuZGVyUGFzc2VzID0gMDtcbiAgICAgICAgdGhpcy5zdGF0cy5zaGFkb3dNYXBUaW1lID0gMDtcbiAgICAgICAgdGhpcy5zdGF0cy5mb3J3YXJkVGltZSA9IDA7XG4gICAgICAgIGNvbnN0IHN0YXJ0U2hhZGVycyA9IGRldmljZS5fc2hhZGVyU3RhdHMubGlua2VkO1xuICAgICAgICBjb25zdCBzdGFydEZib1RpbWUgPSBkZXZpY2UuX3JlbmRlclRhcmdldENyZWF0aW9uVGltZTtcbiAgICAgICAgY29uc3Qgc3RhcnRDb21waWxlVGltZSA9IGRldmljZS5fc2hhZGVyU3RhdHMuY29tcGlsZVRpbWU7XG5cbiAgICAgICAgLy8gQmFrZU1lc2hOb2RlIG9iamVjdHMgZm9yIGJha2luZ1xuICAgICAgICBjb25zdCBiYWtlTm9kZXMgPSBbXTtcblxuICAgICAgICAvLyBhbGwgQmFrZU1lc2hOb2RlIG9iamVjdHNcbiAgICAgICAgY29uc3QgYWxsTm9kZXMgPSBbXTtcblxuICAgICAgICAvLyBjb2xsZWN0IG5vZGVzIC8gbWVzaEluc3RhbmNlcyBmb3IgYmFraW5nXG4gICAgICAgIGlmIChub2Rlcykge1xuXG4gICAgICAgICAgICAvLyBjb2xsZWN0IG5vZGVzIGZvciBiYWtpbmcgYmFzZWQgb24gc3BlY2lmaWVkIGxpc3Qgb2Ygbm9kZXNcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbm9kZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICB0aGlzLmNvbGxlY3RNb2RlbHMobm9kZXNbaV0sIGJha2VOb2RlcywgbnVsbCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIGNvbGxlY3QgYWxsIG5vZGVzIGZyb20gdGhlIHNjZW5lXG4gICAgICAgICAgICB0aGlzLmNvbGxlY3RNb2RlbHModGhpcy5yb290LCBudWxsLCBhbGxOb2Rlcyk7XG5cbiAgICAgICAgfSBlbHNlIHtcblxuICAgICAgICAgICAgLy8gY29sbGVjdCBub2RlcyBmcm9tIHRoZSByb290IG9mIHRoZSBzY2VuZVxuICAgICAgICAgICAgdGhpcy5jb2xsZWN0TW9kZWxzKHRoaXMucm9vdCwgYmFrZU5vZGVzLCBhbGxOb2Rlcyk7XG5cbiAgICAgICAgfVxuXG4gICAgICAgIERlYnVnR3JhcGhpY3MucHVzaEdwdU1hcmtlcih0aGlzLmRldmljZSwgJ0xNQmFrZScpO1xuXG4gICAgICAgIC8vIGJha2Ugbm9kZXNcbiAgICAgICAgaWYgKGJha2VOb2Rlcy5sZW5ndGggPiAwKSB7XG5cbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuc2hhZG93UmVuZGVyZXIuZnJhbWVVcGRhdGUoKTtcblxuICAgICAgICAgICAgLy8gZGlzYWJsZSBsaWdodG1hcHBpbmdcbiAgICAgICAgICAgIGNvbnN0IHBhc3NDb3VudCA9IG1vZGUgPT09IEJBS0VfQ09MT1JESVIgPyAyIDogMTtcbiAgICAgICAgICAgIHRoaXMuc2V0TGlnaHRtYXBwaW5nKGJha2VOb2RlcywgZmFsc2UsIHBhc3NDb3VudCk7XG5cbiAgICAgICAgICAgIHRoaXMuaW5pdEJha2UoZGV2aWNlKTtcbiAgICAgICAgICAgIHRoaXMuYmFrZUludGVybmFsKHBhc3NDb3VudCwgYmFrZU5vZGVzLCBhbGxOb2Rlcyk7XG5cbiAgICAgICAgICAgIC8vIEVuYWJsZSBuZXcgbGlnaHRtYXBzXG4gICAgICAgICAgICBsZXQgc2hhZGVyRGVmcyA9IFNIQURFUkRFRl9MTTtcblxuICAgICAgICAgICAgaWYgKG1vZGUgPT09IEJBS0VfQ09MT1JESVIpIHtcbiAgICAgICAgICAgICAgICBzaGFkZXJEZWZzIHw9IFNIQURFUkRFRl9ESVJMTTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gbWFyayBsaWdodG1hcCBhcyBjb250YWluaW5nIGFtYmllbnQgbGlnaHRpbmdcbiAgICAgICAgICAgIGlmICh0aGlzLnNjZW5lLmFtYmllbnRCYWtlKSB7XG4gICAgICAgICAgICAgICAgc2hhZGVyRGVmcyB8PSBTSEFERVJERUZfTE1BTUJJRU5UO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5zZXRMaWdodG1hcHBpbmcoYmFrZU5vZGVzLCB0cnVlLCBwYXNzQ291bnQsIHNoYWRlckRlZnMpO1xuXG4gICAgICAgICAgICAvLyBjbGVhbiB1cCBtZW1vcnlcbiAgICAgICAgICAgIHRoaXMuZmluaXNoQmFrZShiYWtlTm9kZXMpO1xuICAgICAgICB9XG5cbiAgICAgICAgRGVidWdHcmFwaGljcy5wb3BHcHVNYXJrZXIodGhpcy5kZXZpY2UpO1xuXG4gICAgICAgIGNvbnN0IG5vd1RpbWUgPSBub3coKTtcbiAgICAgICAgdGhpcy5zdGF0cy50b3RhbFJlbmRlclRpbWUgPSBub3dUaW1lIC0gc3RhcnRUaW1lO1xuICAgICAgICB0aGlzLnN0YXRzLnNoYWRlcnNMaW5rZWQgPSBkZXZpY2UuX3NoYWRlclN0YXRzLmxpbmtlZCAtIHN0YXJ0U2hhZGVycztcbiAgICAgICAgdGhpcy5zdGF0cy5jb21waWxlVGltZSA9IGRldmljZS5fc2hhZGVyU3RhdHMuY29tcGlsZVRpbWUgLSBzdGFydENvbXBpbGVUaW1lO1xuICAgICAgICB0aGlzLnN0YXRzLmZib1RpbWUgPSBkZXZpY2UuX3JlbmRlclRhcmdldENyZWF0aW9uVGltZSAtIHN0YXJ0RmJvVGltZTtcbiAgICAgICAgdGhpcy5zdGF0cy5saWdodG1hcENvdW50ID0gYmFrZU5vZGVzLmxlbmd0aDtcblxuICAgICAgICAvLyAjaWYgX1BST0ZJTEVSXG4gICAgICAgIGRldmljZS5maXJlKCdsaWdodG1hcHBlcjplbmQnLCB7XG4gICAgICAgICAgICB0aW1lc3RhbXA6IG5vd1RpbWUsXG4gICAgICAgICAgICB0YXJnZXQ6IHRoaXNcbiAgICAgICAgfSk7XG4gICAgICAgIC8vICNlbmRpZlxuICAgIH1cblxuICAgIC8vIHRoaXMgYWxsb2NhdGVzIGxpZ2h0bWFwIHRleHR1cmVzIGFuZCByZW5kZXIgdGFyZ2V0cy5cbiAgICBhbGxvY2F0ZVRleHR1cmVzKGJha2VOb2RlcywgcGFzc0NvdW50KSB7XG5cbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBiYWtlTm9kZXMubGVuZ3RoOyBpKyspIHtcblxuICAgICAgICAgICAgLy8gcmVxdWlyZWQgbGlnaHRtYXAgc2l6ZVxuICAgICAgICAgICAgY29uc3QgYmFrZU5vZGUgPSBiYWtlTm9kZXNbaV07XG4gICAgICAgICAgICBjb25zdCBzaXplID0gdGhpcy5jYWxjdWxhdGVMaWdodG1hcFNpemUoYmFrZU5vZGUubm9kZSk7XG5cbiAgICAgICAgICAgIC8vIHRleHR1cmUgYW5kIHJlbmRlciB0YXJnZXQgZm9yIGVhY2ggcGFzcywgc3RvcmVkIHBlciBub2RlXG4gICAgICAgICAgICBmb3IgKGxldCBwYXNzID0gMDsgcGFzcyA8IHBhc3NDb3VudDsgcGFzcysrKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdGV4ID0gdGhpcy5jcmVhdGVUZXh0dXJlKHNpemUsICgnbGlnaHRtYXBwZXJfbGlnaHRtYXBfJyArIGkpKTtcbiAgICAgICAgICAgICAgICBMaWdodG1hcENhY2hlLmluY1JlZih0ZXgpO1xuICAgICAgICAgICAgICAgIGJha2VOb2RlLnJlbmRlclRhcmdldHNbcGFzc10gPSBuZXcgUmVuZGVyVGFyZ2V0KHtcbiAgICAgICAgICAgICAgICAgICAgY29sb3JCdWZmZXI6IHRleCxcbiAgICAgICAgICAgICAgICAgICAgZGVwdGg6IGZhbHNlXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIHNpbmdsZSB0ZW1wb3JhcnkgcmVuZGVyIHRhcmdldCBvZiBlYWNoIHNpemVcbiAgICAgICAgICAgIGlmICghdGhpcy5yZW5kZXJUYXJnZXRzLmhhcyhzaXplKSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHRleCA9IHRoaXMuY3JlYXRlVGV4dHVyZShzaXplLCAoJ2xpZ2h0bWFwcGVyX3RlbXBfbGlnaHRtYXBfJyArIHNpemUpKTtcbiAgICAgICAgICAgICAgICBMaWdodG1hcENhY2hlLmluY1JlZih0ZXgpO1xuICAgICAgICAgICAgICAgIHRoaXMucmVuZGVyVGFyZ2V0cy5zZXQoc2l6ZSwgbmV3IFJlbmRlclRhcmdldCh7XG4gICAgICAgICAgICAgICAgICAgIGNvbG9yQnVmZmVyOiB0ZXgsXG4gICAgICAgICAgICAgICAgICAgIGRlcHRoOiBmYWxzZVxuICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByZXBhcmVMaWdodHNUb0Jha2UobGF5ZXJDb21wb3NpdGlvbiwgYWxsTGlnaHRzLCBiYWtlTGlnaHRzKSB7XG5cbiAgICAgICAgLy8gYW1iaWVudCBsaWdodFxuICAgICAgICBpZiAodGhpcy5zY2VuZS5hbWJpZW50QmFrZSkge1xuICAgICAgICAgICAgY29uc3QgYW1iaWVudExpZ2h0ID0gbmV3IEJha2VMaWdodEFtYmllbnQodGhpcy5zY2VuZSk7XG4gICAgICAgICAgICBiYWtlTGlnaHRzLnB1c2goYW1iaWVudExpZ2h0KTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHNjZW5lIGxpZ2h0c1xuICAgICAgICBjb25zdCBzY2VuZUxpZ2h0cyA9IHRoaXMucmVuZGVyZXIubGlnaHRzO1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHNjZW5lTGlnaHRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBsaWdodCA9IHNjZW5lTGlnaHRzW2ldO1xuXG4gICAgICAgICAgICAvLyBzdG9yZSBhbGwgbGlnaHRzIGFuZCB0aGVpciBvcmlnaW5hbCBzZXR0aW5ncyB3ZSBuZWVkIHRvIHRlbXBvcmFyaWx5IG1vZGlmeVxuICAgICAgICAgICAgY29uc3QgYmFrZUxpZ2h0ID0gbmV3IEJha2VMaWdodFNpbXBsZSh0aGlzLnNjZW5lLCBsaWdodCk7XG4gICAgICAgICAgICBhbGxMaWdodHMucHVzaChiYWtlTGlnaHQpO1xuXG4gICAgICAgICAgICAvLyBiYWtlIGxpZ2h0XG4gICAgICAgICAgICBpZiAobGlnaHQuZW5hYmxlZCAmJiAobGlnaHQubWFzayAmIE1BU0tfQkFLRSkgIT09IDApIHtcbiAgICAgICAgICAgICAgICBsaWdodC5tYXNrID0gTUFTS19CQUtFIHwgTUFTS19BRkZFQ1RfTElHSFRNQVBQRUQgfCBNQVNLX0FGRkVDVF9EWU5BTUlDO1xuICAgICAgICAgICAgICAgIGxpZ2h0LnNoYWRvd1VwZGF0ZU1vZGUgPSBsaWdodC50eXBlID09PSBMSUdIVFRZUEVfRElSRUNUSU9OQUwgPyBTSEFET1dVUERBVEVfUkVBTFRJTUUgOiBTSEFET1dVUERBVEVfVEhJU0ZSQU1FO1xuICAgICAgICAgICAgICAgIGJha2VMaWdodHMucHVzaChiYWtlTGlnaHQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gc29ydCBiYWtlIGxpZ2h0cyBieSB0eXBlIHRvIG1pbmltaXplIHNoYWRlciBzd2l0Y2hlc1xuICAgICAgICBiYWtlTGlnaHRzLnNvcnQoKTtcbiAgICB9XG5cbiAgICByZXN0b3JlTGlnaHRzKGFsbExpZ2h0cykge1xuXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYWxsTGlnaHRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBhbGxMaWdodHNbaV0ucmVzdG9yZSgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgc2V0dXBTY2VuZSgpIHtcblxuICAgICAgICAvLyBiYWNrdXBcbiAgICAgICAgdGhpcy5mb2cgPSB0aGlzLnNjZW5lLmZvZztcbiAgICAgICAgdGhpcy5hbWJpZW50TGlnaHQuY29weSh0aGlzLnNjZW5lLmFtYmllbnRMaWdodCk7XG5cbiAgICAgICAgLy8gc2V0IHVwIHNjZW5lXG4gICAgICAgIHRoaXMuc2NlbmUuZm9nID0gRk9HX05PTkU7XG5cbiAgICAgICAgLy8gaWYgbm90IGJha2luZyBhbWJpZW50LCBzZXQgaXQgdG8gYmxhY2tcbiAgICAgICAgaWYgKCF0aGlzLnNjZW5lLmFtYmllbnRCYWtlKSB7XG4gICAgICAgICAgICB0aGlzLnNjZW5lLmFtYmllbnRMaWdodC5zZXQoMCwgMCwgMCk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBhcHBseSBzY2VuZSBzZXR0aW5nc1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFNjZW5lQ29uc3RhbnRzKCk7XG4gICAgfVxuXG4gICAgcmVzdG9yZVNjZW5lKCkge1xuXG4gICAgICAgIHRoaXMuc2NlbmUuZm9nID0gdGhpcy5mb2c7XG4gICAgICAgIHRoaXMuc2NlbmUuYW1iaWVudExpZ2h0LmNvcHkodGhpcy5hbWJpZW50TGlnaHQpO1xuICAgIH1cblxuICAgIC8vIGNvbXB1dGUgYm91bmRpbmcgYm94IGZvciBhIHNpbmdsZSBub2RlXG4gICAgY29tcHV0ZU5vZGVCb3VuZHMobWVzaEluc3RhbmNlcykge1xuXG4gICAgICAgIGNvbnN0IGJvdW5kcyA9IG5ldyBCb3VuZGluZ0JveCgpO1xuXG4gICAgICAgIGlmIChtZXNoSW5zdGFuY2VzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGJvdW5kcy5jb3B5KG1lc2hJbnN0YW5jZXNbMF0uYWFiYik7XG4gICAgICAgICAgICBmb3IgKGxldCBtID0gMTsgbSA8IG1lc2hJbnN0YW5jZXMubGVuZ3RoOyBtKyspIHtcbiAgICAgICAgICAgICAgICBib3VuZHMuYWRkKG1lc2hJbnN0YW5jZXNbbV0uYWFiYik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gYm91bmRzO1xuICAgIH1cblxuICAgIC8vIGNvbXB1dGUgYm91bmRpbmcgYm94IGZvciBlYWNoIG5vZGVcbiAgICBjb21wdXRlTm9kZXNCb3VuZHMobm9kZXMpIHtcblxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG5vZGVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBtZXNoSW5zdGFuY2VzID0gbm9kZXNbaV0ubWVzaEluc3RhbmNlcztcbiAgICAgICAgICAgIG5vZGVzW2ldLmJvdW5kcyA9IHRoaXMuY29tcHV0ZU5vZGVCb3VuZHMobWVzaEluc3RhbmNlcyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBjb21wdXRlIGNvbXBvdW5kIGJvdW5kaW5nIGJveCBmb3IgYW4gYXJyYXkgb2YgbWVzaCBpbnN0YW5jZXNcbiAgICBjb21wdXRlQm91bmRzKG1lc2hJbnN0YW5jZXMpIHtcblxuICAgICAgICBjb25zdCBib3VuZHMgPSBuZXcgQm91bmRpbmdCb3goKTtcblxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG1lc2hJbnN0YW5jZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGJvdW5kcy5jb3B5KG1lc2hJbnN0YW5jZXNbMF0uYWFiYik7XG4gICAgICAgICAgICBmb3IgKGxldCBtID0gMTsgbSA8IG1lc2hJbnN0YW5jZXMubGVuZ3RoOyBtKyspIHtcbiAgICAgICAgICAgICAgICBib3VuZHMuYWRkKG1lc2hJbnN0YW5jZXNbbV0uYWFiYik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gYm91bmRzO1xuICAgIH1cblxuICAgIGJhY2t1cE1hdGVyaWFscyhtZXNoSW5zdGFuY2VzKSB7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbWVzaEluc3RhbmNlcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgdGhpcy5tYXRlcmlhbHNbaV0gPSBtZXNoSW5zdGFuY2VzW2ldLm1hdGVyaWFsO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmVzdG9yZU1hdGVyaWFscyhtZXNoSW5zdGFuY2VzKSB7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbWVzaEluc3RhbmNlcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgbWVzaEluc3RhbmNlc1tpXS5tYXRlcmlhbCA9IHRoaXMubWF0ZXJpYWxzW2ldO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgbGlnaHRDYW1lcmFQcmVwYXJlKGRldmljZSwgYmFrZUxpZ2h0KSB7XG5cbiAgICAgICAgY29uc3QgbGlnaHQgPSBiYWtlTGlnaHQubGlnaHQ7XG4gICAgICAgIGxldCBzaGFkb3dDYW07XG5cbiAgICAgICAgLy8gb25seSBwcmVwYXJlIGNhbWVyYSBmb3Igc3BvdCBsaWdodCwgb3RoZXIgY2FtZXJhcyBuZWVkIHRvIGJlIGFkanVzdGVkIHBlciBjdWJlbWFwIGZhY2UgLyBwZXIgbm9kZSBsYXRlclxuICAgICAgICBpZiAobGlnaHQudHlwZSA9PT0gTElHSFRUWVBFX1NQT1QpIHtcblxuICAgICAgICAgICAgY29uc3QgbGlnaHRSZW5kZXJEYXRhID0gbGlnaHQuZ2V0UmVuZGVyRGF0YShudWxsLCAwKTtcbiAgICAgICAgICAgIHNoYWRvd0NhbSA9IGxpZ2h0UmVuZGVyRGF0YS5zaGFkb3dDYW1lcmE7XG5cbiAgICAgICAgICAgIHNoYWRvd0NhbS5fbm9kZS5zZXRQb3NpdGlvbihsaWdodC5fbm9kZS5nZXRQb3NpdGlvbigpKTtcbiAgICAgICAgICAgIHNoYWRvd0NhbS5fbm9kZS5zZXRSb3RhdGlvbihsaWdodC5fbm9kZS5nZXRSb3RhdGlvbigpKTtcbiAgICAgICAgICAgIHNoYWRvd0NhbS5fbm9kZS5yb3RhdGVMb2NhbCgtOTAsIDAsIDApO1xuXG4gICAgICAgICAgICBzaGFkb3dDYW0ucHJvamVjdGlvbiA9IFBST0pFQ1RJT05fUEVSU1BFQ1RJVkU7XG4gICAgICAgICAgICBzaGFkb3dDYW0ubmVhckNsaXAgPSBsaWdodC5hdHRlbnVhdGlvbkVuZCAvIDEwMDA7XG4gICAgICAgICAgICBzaGFkb3dDYW0uZmFyQ2xpcCA9IGxpZ2h0LmF0dGVudWF0aW9uRW5kO1xuICAgICAgICAgICAgc2hhZG93Q2FtLmFzcGVjdFJhdGlvID0gMTtcbiAgICAgICAgICAgIHNoYWRvd0NhbS5mb3YgPSBsaWdodC5fb3V0ZXJDb25lQW5nbGUgKiAyO1xuXG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnVwZGF0ZUNhbWVyYUZydXN0dW0oc2hhZG93Q2FtKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gc2hhZG93Q2FtO1xuICAgIH1cblxuICAgIC8vIHByZXBhcmVzIGNhbWVyYSAvIGZydXN0dW0gb2YgdGhlIGxpZ2h0IGZvciByZW5kZXJpbmcgdGhlIGJha2VOb2RlXG4gICAgLy8gcmV0dXJucyB0cnVlIGlmIGxpZ2h0IGFmZmVjdHMgdGhlIGJha2VOb2RlXG4gICAgbGlnaHRDYW1lcmFQcmVwYXJlQW5kQ3VsbChiYWtlTGlnaHQsIGJha2VOb2RlLCBzaGFkb3dDYW0sIGNhc3RlckJvdW5kcykge1xuXG4gICAgICAgIGNvbnN0IGxpZ2h0ID0gYmFrZUxpZ2h0LmxpZ2h0O1xuICAgICAgICBsZXQgbGlnaHRBZmZlY3RzTm9kZSA9IHRydWU7XG5cbiAgICAgICAgaWYgKGxpZ2h0LnR5cGUgPT09IExJR0hUVFlQRV9ESVJFQ1RJT05BTCkge1xuXG4gICAgICAgICAgICAvLyB0d2VhayBkaXJlY3Rpb25hbCBsaWdodCBjYW1lcmEgdG8gZnVsbHkgc2VlIGFsbCBjYXN0ZXJzIGFuZCB0aGV5IGFyZSBmdWxseSBpbnNpZGUgdGhlIGZydXN0dW1cbiAgICAgICAgICAgIHRlbXBWZWMuY29weShjYXN0ZXJCb3VuZHMuY2VudGVyKTtcbiAgICAgICAgICAgIHRlbXBWZWMueSArPSBjYXN0ZXJCb3VuZHMuaGFsZkV4dGVudHMueTtcblxuICAgICAgICAgICAgdGhpcy5jYW1lcmEubm9kZS5zZXRQb3NpdGlvbih0ZW1wVmVjKTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLm5vZGUuc2V0RXVsZXJBbmdsZXMoLTkwLCAwLCAwKTtcblxuICAgICAgICAgICAgdGhpcy5jYW1lcmEubmVhckNsaXAgPSAwO1xuICAgICAgICAgICAgdGhpcy5jYW1lcmEuZmFyQ2xpcCA9IGNhc3RlckJvdW5kcy5oYWxmRXh0ZW50cy55ICogMjtcblxuICAgICAgICAgICAgY29uc3QgZnJ1c3R1bVNpemUgPSBNYXRoLm1heChjYXN0ZXJCb3VuZHMuaGFsZkV4dGVudHMueCwgY2FzdGVyQm91bmRzLmhhbGZFeHRlbnRzLnopO1xuICAgICAgICAgICAgdGhpcy5jYW1lcmEub3J0aG9IZWlnaHQgPSBmcnVzdHVtU2l6ZTtcblxuICAgICAgICB9IGVsc2Uge1xuXG4gICAgICAgICAgICAvLyBmb3Igb3RoZXIgbGlnaHQgdHlwZXMsIHRlc3QgaWYgbGlnaHQgYWZmZWN0cyB0aGUgbm9kZVxuICAgICAgICAgICAgaWYgKCFiYWtlTGlnaHQubGlnaHRCb3VuZHMuaW50ZXJzZWN0cyhiYWtlTm9kZS5ib3VuZHMpKSB7XG4gICAgICAgICAgICAgICAgbGlnaHRBZmZlY3RzTm9kZSA9IGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gcGVyIG1lc2hJbnN0YW5jZSBjdWxsaW5nIGZvciBzcG90IGxpZ2h0IG9ubHlcbiAgICAgICAgLy8gKG9tbmkgbGlnaHRzIGN1bGwgcGVyIGZhY2UgbGF0ZXIsIGRpcmVjdGlvbmFsIGxpZ2h0cyBkb24ndCBjdWxsKVxuICAgICAgICBpZiAobGlnaHQudHlwZSA9PT0gTElHSFRUWVBFX1NQT1QpIHtcbiAgICAgICAgICAgIGxldCBub2RlVmlzaWJsZSA9IGZhbHNlO1xuXG4gICAgICAgICAgICBjb25zdCBtZXNoSW5zdGFuY2VzID0gYmFrZU5vZGUubWVzaEluc3RhbmNlcztcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbWVzaEluc3RhbmNlcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIGlmIChtZXNoSW5zdGFuY2VzW2ldLl9pc1Zpc2libGUoc2hhZG93Q2FtKSkge1xuICAgICAgICAgICAgICAgICAgICBub2RlVmlzaWJsZSA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghbm9kZVZpc2libGUpIHtcbiAgICAgICAgICAgICAgICBsaWdodEFmZmVjdHNOb2RlID0gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gbGlnaHRBZmZlY3RzTm9kZTtcbiAgICB9XG5cbiAgICAvLyBzZXQgdXAgbGlnaHQgYXJyYXkgZm9yIGEgc2luZ2xlIGxpZ2h0XG4gICAgc2V0dXBMaWdodEFycmF5KGxpZ2h0QXJyYXksIGxpZ2h0KSB7XG5cbiAgICAgICAgbGlnaHRBcnJheVtMSUdIVFRZUEVfRElSRUNUSU9OQUxdLmxlbmd0aCA9IDA7XG4gICAgICAgIGxpZ2h0QXJyYXlbTElHSFRUWVBFX09NTkldLmxlbmd0aCA9IDA7XG4gICAgICAgIGxpZ2h0QXJyYXlbTElHSFRUWVBFX1NQT1RdLmxlbmd0aCA9IDA7XG5cbiAgICAgICAgbGlnaHRBcnJheVtsaWdodC50eXBlXVswXSA9IGxpZ2h0O1xuICAgICAgICBsaWdodC52aXNpYmxlVGhpc0ZyYW1lID0gdHJ1ZTtcbiAgICB9XG5cbiAgICByZW5kZXJTaGFkb3dNYXAoY29tcCwgc2hhZG93TWFwUmVuZGVyZWQsIGNhc3RlcnMsIGJha2VMaWdodCkge1xuXG4gICAgICAgIGNvbnN0IGxpZ2h0ID0gYmFrZUxpZ2h0LmxpZ2h0O1xuICAgICAgICBjb25zdCBpc0NsdXN0ZXJlZCA9IHRoaXMuc2NlbmUuY2x1c3RlcmVkTGlnaHRpbmdFbmFibGVkO1xuXG4gICAgICAgIGlmICghc2hhZG93TWFwUmVuZGVyZWQgJiYgbGlnaHQuY2FzdFNoYWRvd3MpIHtcblxuICAgICAgICAgICAgLy8gYWxsb2NhdGUgc2hhZG93IG1hcCBmcm9tIHRoZSBjYWNoZSB0byBhdm9pZCBwZXIgbGlnaHQgYWxsb2NhdGlvblxuICAgICAgICAgICAgaWYgKCFsaWdodC5zaGFkb3dNYXAgJiYgIWlzQ2x1c3RlcmVkKSB7XG4gICAgICAgICAgICAgICAgbGlnaHQuc2hhZG93TWFwID0gdGhpcy5zaGFkb3dNYXBDYWNoZS5nZXQodGhpcy5kZXZpY2UsIGxpZ2h0KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGxpZ2h0LnR5cGUgPT09IExJR0hUVFlQRV9ESVJFQ1RJT05BTCkge1xuICAgICAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuX3NoYWRvd1JlbmRlcmVyRGlyZWN0aW9uYWwuY3VsbChsaWdodCwgY29tcCwgdGhpcy5jYW1lcmEsIGNhc3RlcnMpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLnJlbmRlcmVyLl9zaGFkb3dSZW5kZXJlckxvY2FsLmN1bGwobGlnaHQsIGNvbXAsIGNhc3RlcnMpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBpbnNpZGVSZW5kZXJQYXNzID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnNoYWRvd1JlbmRlcmVyLnJlbmRlcihsaWdodCwgdGhpcy5jYW1lcmEsIGluc2lkZVJlbmRlclBhc3MpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgcG9zdHByb2Nlc3NUZXh0dXJlcyhkZXZpY2UsIGJha2VOb2RlcywgcGFzc0NvdW50KSB7XG5cbiAgICAgICAgY29uc3QgbnVtRGlsYXRlczJ4ID0gMTsgLy8gMSBvciAyIGRpbGF0ZXMgKGRlcGVuZGluZyBvbiBmaWx0ZXIgYmVpbmcgZW5hYmxlZClcbiAgICAgICAgY29uc3QgZGlsYXRlU2hhZGVyID0gdGhpcy5saWdodG1hcEZpbHRlcnMuc2hhZGVyRGlsYXRlO1xuXG4gICAgICAgIC8vIGJpbGF0ZXJhbCBkZW5vaXNlIGZpbHRlciAtIHJ1bnMgYXMgYSBmaXJzdCBwYXNzLCBiZWZvcmUgZGlsYXRlXG4gICAgICAgIGNvbnN0IGZpbHRlckxpZ2h0bWFwID0gdGhpcy5zY2VuZS5saWdodG1hcEZpbHRlckVuYWJsZWQ7XG4gICAgICAgIGlmIChmaWx0ZXJMaWdodG1hcCkge1xuICAgICAgICAgICAgdGhpcy5saWdodG1hcEZpbHRlcnMucHJlcGFyZURlbm9pc2UodGhpcy5zY2VuZS5saWdodG1hcEZpbHRlclJhbmdlLCB0aGlzLnNjZW5lLmxpZ2h0bWFwRmlsdGVyU21vb3RobmVzcyk7XG4gICAgICAgIH1cblxuICAgICAgICBkZXZpY2Uuc2V0QmxlbmRTdGF0ZShCbGVuZFN0YXRlLk5PQkxFTkQpO1xuICAgICAgICBkZXZpY2Uuc2V0RGVwdGhTdGF0ZShEZXB0aFN0YXRlLk5PREVQVEgpO1xuICAgICAgICBkZXZpY2Uuc2V0U3RlbmNpbFN0YXRlKG51bGwsIG51bGwpO1xuXG4gICAgICAgIGZvciAobGV0IG5vZGUgPSAwOyBub2RlIDwgYmFrZU5vZGVzLmxlbmd0aDsgbm9kZSsrKSB7XG4gICAgICAgICAgICBjb25zdCBiYWtlTm9kZSA9IGJha2VOb2Rlc1tub2RlXTtcblxuICAgICAgICAgICAgRGVidWdHcmFwaGljcy5wdXNoR3B1TWFya2VyKHRoaXMuZGV2aWNlLCBgTE1Qb3N0OiR7bm9kZX1gKTtcblxuICAgICAgICAgICAgZm9yIChsZXQgcGFzcyA9IDA7IHBhc3MgPCBwYXNzQ291bnQ7IHBhc3MrKykge1xuXG4gICAgICAgICAgICAgICAgY29uc3Qgbm9kZVJUID0gYmFrZU5vZGUucmVuZGVyVGFyZ2V0c1twYXNzXTtcbiAgICAgICAgICAgICAgICBjb25zdCBsaWdodG1hcCA9IG5vZGVSVC5jb2xvckJ1ZmZlcjtcblxuICAgICAgICAgICAgICAgIGNvbnN0IHRlbXBSVCA9IHRoaXMucmVuZGVyVGFyZ2V0cy5nZXQobGlnaHRtYXAud2lkdGgpO1xuICAgICAgICAgICAgICAgIGNvbnN0IHRlbXBUZXggPSB0ZW1wUlQuY29sb3JCdWZmZXI7XG5cbiAgICAgICAgICAgICAgICB0aGlzLmxpZ2h0bWFwRmlsdGVycy5wcmVwYXJlKGxpZ2h0bWFwLndpZHRoLCBsaWdodG1hcC5oZWlnaHQpO1xuXG4gICAgICAgICAgICAgICAgLy8gYm91bmNlIGRpbGF0ZSBiZXR3ZWVuIHRleHR1cmVzLCBleGVjdXRlIGRlbm9pc2Ugb24gdGhlIGZpcnN0IHBhc3NcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG51bURpbGF0ZXMyeDsgaSsrKSB7XG5cbiAgICAgICAgICAgICAgICAgICAgdGhpcy5saWdodG1hcEZpbHRlcnMuc2V0U291cmNlVGV4dHVyZShsaWdodG1hcCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGJpbGF0ZXJhbEZpbHRlckVuYWJsZWQgPSBmaWx0ZXJMaWdodG1hcCAmJiBwYXNzID09PSAwICYmIGkgPT09IDA7XG4gICAgICAgICAgICAgICAgICAgIGRyYXdRdWFkV2l0aFNoYWRlcihkZXZpY2UsIHRlbXBSVCwgYmlsYXRlcmFsRmlsdGVyRW5hYmxlZCA/IHRoaXMubGlnaHRtYXBGaWx0ZXJzLnNoYWRlckRlbm9pc2UgOiBkaWxhdGVTaGFkZXIpO1xuXG4gICAgICAgICAgICAgICAgICAgIHRoaXMubGlnaHRtYXBGaWx0ZXJzLnNldFNvdXJjZVRleHR1cmUodGVtcFRleCk7XG4gICAgICAgICAgICAgICAgICAgIGRyYXdRdWFkV2l0aFNoYWRlcihkZXZpY2UsIG5vZGVSVCwgZGlsYXRlU2hhZGVyKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIERlYnVnR3JhcGhpY3MucG9wR3B1TWFya2VyKHRoaXMuZGV2aWNlKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGJha2VJbnRlcm5hbChwYXNzQ291bnQsIGJha2VOb2RlcywgYWxsTm9kZXMpIHtcblxuICAgICAgICBjb25zdCBzY2VuZSA9IHRoaXMuc2NlbmU7XG4gICAgICAgIGNvbnN0IGNvbXAgPSBzY2VuZS5sYXllcnM7XG4gICAgICAgIGNvbnN0IGRldmljZSA9IHRoaXMuZGV2aWNlO1xuICAgICAgICBjb25zdCBjbHVzdGVyZWRMaWdodGluZ0VuYWJsZWQgPSBzY2VuZS5jbHVzdGVyZWRMaWdodGluZ0VuYWJsZWQ7XG5cbiAgICAgICAgdGhpcy5jcmVhdGVNYXRlcmlhbHMoZGV2aWNlLCBzY2VuZSwgcGFzc0NvdW50KTtcbiAgICAgICAgdGhpcy5zZXR1cFNjZW5lKCk7XG5cbiAgICAgICAgLy8gdXBkYXRlIGxheWVyIGNvbXBvc2l0aW9uXG4gICAgICAgIGNvbXAuX3VwZGF0ZSgpO1xuXG4gICAgICAgIC8vIGNvbXB1dGUgYm91bmRpbmcgYm94ZXMgZm9yIG5vZGVzXG4gICAgICAgIHRoaXMuY29tcHV0ZU5vZGVzQm91bmRzKGJha2VOb2Rlcyk7XG5cbiAgICAgICAgLy8gQ2FsY3VsYXRlIGxpZ2h0bWFwIHNpemVzIGFuZCBhbGxvY2F0ZSB0ZXh0dXJlc1xuICAgICAgICB0aGlzLmFsbG9jYXRlVGV4dHVyZXMoYmFrZU5vZGVzLCBwYXNzQ291bnQpO1xuXG4gICAgICAgIC8vIENvbGxlY3QgYmFrZWFibGUgbGlnaHRzLCBhbmQgYWxzbyBrZWVwIGFsbExpZ2h0cyBhbG9uZyB3aXRoIHRoZWlyIHByb3BlcnRpZXMgd2UgY2hhbmdlIHRvIHJlc3RvcmUgdGhlbSBsYXRlclxuICAgICAgICB0aGlzLnJlbmRlcmVyLmNvbGxlY3RMaWdodHMoY29tcCk7XG4gICAgICAgIGNvbnN0IGFsbExpZ2h0cyA9IFtdLCBiYWtlTGlnaHRzID0gW107XG4gICAgICAgIHRoaXMucHJlcGFyZUxpZ2h0c1RvQmFrZShjb21wLCBhbGxMaWdodHMsIGJha2VMaWdodHMpO1xuXG4gICAgICAgIC8vIHVwZGF0ZSB0cmFuc2Zvcm1zXG4gICAgICAgIHRoaXMudXBkYXRlVHJhbnNmb3JtcyhhbGxOb2Rlcyk7XG5cbiAgICAgICAgLy8gZ2V0IGFsbCBtZXNoSW5zdGFuY2VzIHRoYXQgY2FzdCBzaGFkb3dzIGludG8gbGlnaHRtYXAgYW5kIHNldCB0aGVtIHVwIGZvciByZWFsdGltZSBzaGFkb3cgY2FzdGluZ1xuICAgICAgICBjb25zdCBjYXN0ZXJzID0gdGhpcy5wcmVwYXJlU2hhZG93Q2FzdGVycyhhbGxOb2Rlcyk7XG5cbiAgICAgICAgLy8gdXBkYXRlIHNraW5uZWQgYW5kIG1vcnBoZWQgbWVzaGVzXG4gICAgICAgIHRoaXMucmVuZGVyZXIudXBkYXRlQ3B1U2tpbk1hdHJpY2VzKGNhc3RlcnMpO1xuICAgICAgICB0aGlzLnJlbmRlcmVyLmdwdVVwZGF0ZShjYXN0ZXJzKTtcblxuICAgICAgICAvLyBjb21wb3VuZCBib3VuZGluZyBib3ggZm9yIGFsbCBjYXN0ZXJzLCB1c2VkIHRvIGNvbXB1dGUgc2hhcmVkIGRpcmVjdGlvbmFsIGxpZ2h0IHNoYWRvd1xuICAgICAgICBjb25zdCBjYXN0ZXJCb3VuZHMgPSB0aGlzLmNvbXB1dGVCb3VuZHMoY2FzdGVycyk7XG5cbiAgICAgICAgbGV0IGksIGosIHJjdiwgbTtcblxuICAgICAgICAvLyBQcmVwYXJlIG1vZGVsc1xuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgYmFrZU5vZGVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBiYWtlTm9kZSA9IGJha2VOb2Rlc1tpXTtcbiAgICAgICAgICAgIHJjdiA9IGJha2VOb2RlLm1lc2hJbnN0YW5jZXM7XG5cbiAgICAgICAgICAgIGZvciAoaiA9IDA7IGogPCByY3YubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICAgICAgICAvLyBwYXRjaCBtZXNoSW5zdGFuY2VcbiAgICAgICAgICAgICAgICBtID0gcmN2W2pdO1xuXG4gICAgICAgICAgICAgICAgbS5zZXRMaWdodG1hcHBlZChmYWxzZSk7XG4gICAgICAgICAgICAgICAgbS5tYXNrID0gTUFTS19CQUtFOyAvLyBvbmx5IGFmZmVjdGVkIGJ5IExNIGxpZ2h0c1xuXG4gICAgICAgICAgICAgICAgLy8gcGF0Y2ggbWF0ZXJpYWxcbiAgICAgICAgICAgICAgICBtLnNldFJlYWx0aW1lTGlnaHRtYXAoTWVzaEluc3RhbmNlLmxpZ2h0bWFwUGFyYW1OYW1lc1swXSwgbS5tYXRlcmlhbC5saWdodE1hcCA/IG0ubWF0ZXJpYWwubGlnaHRNYXAgOiB0aGlzLmJsYWNrVGV4KTtcbiAgICAgICAgICAgICAgICBtLnNldFJlYWx0aW1lTGlnaHRtYXAoTWVzaEluc3RhbmNlLmxpZ2h0bWFwUGFyYW1OYW1lc1sxXSwgdGhpcy5ibGFja1RleCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBEaXNhYmxlIGFsbCBiYWtlYWJsZSBsaWdodHNcbiAgICAgICAgZm9yIChqID0gMDsgaiA8IGJha2VMaWdodHMubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICAgIGJha2VMaWdodHNbal0ubGlnaHQuZW5hYmxlZCA9IGZhbHNlO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgbGlnaHRBcnJheSA9IFtbXSwgW10sIFtdXTtcbiAgICAgICAgbGV0IHBhc3MsIG5vZGU7XG4gICAgICAgIGxldCBzaGFkZXJzVXBkYXRlZE9uMXN0UGFzcyA9IGZhbHNlO1xuXG4gICAgICAgIC8vIEFjY3VtdWxhdGUgbGlnaHRzIGludG8gUkdCTSB0ZXh0dXJlc1xuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgYmFrZUxpZ2h0cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgY29uc3QgYmFrZUxpZ2h0ID0gYmFrZUxpZ2h0c1tpXTtcbiAgICAgICAgICAgIGNvbnN0IGlzQW1iaWVudExpZ2h0ID0gYmFrZUxpZ2h0IGluc3RhbmNlb2YgQmFrZUxpZ2h0QW1iaWVudDtcbiAgICAgICAgICAgIGNvbnN0IGlzRGlyZWN0aW9uYWwgPSBiYWtlTGlnaHQubGlnaHQudHlwZSA9PT0gTElHSFRUWVBFX0RJUkVDVElPTkFMO1xuXG4gICAgICAgICAgICAvLyBsaWdodCBjYW4gYmUgYmFrZWQgdXNpbmcgbWFueSB2aXJ0dWFsIGxpZ2h0cyB0byBjcmVhdGUgc29mdCBlZmZlY3RcbiAgICAgICAgICAgIGxldCBudW1WaXJ0dWFsTGlnaHRzID0gYmFrZUxpZ2h0Lm51bVZpcnR1YWxMaWdodHM7XG5cbiAgICAgICAgICAgIC8vIGRpcmVjdGlvbiBiYWtpbmcgaXMgbm90IGN1cnJlbnRseSBjb21wYXRpYmxlIHdpdGggdmlydHVhbCBsaWdodHMsIGFzIHdlIGVuZCB1cCB3aXRoIG5vIHZhbGlkIGRpcmVjdGlvbiBpbiBsaWdodHMgcGVudW1icmFcbiAgICAgICAgICAgIGlmIChwYXNzQ291bnQgPiAxICYmIG51bVZpcnR1YWxMaWdodHMgPiAxICYmIGJha2VMaWdodC5saWdodC5iYWtlRGlyKSB7XG4gICAgICAgICAgICAgICAgbnVtVmlydHVhbExpZ2h0cyA9IDE7XG4gICAgICAgICAgICAgICAgRGVidWcud2FybignTGlnaHRtYXBwZXJcXCdzIEJBS0VfQ09MT1JESVIgbW9kZSBpcyBub3QgY29tcGF0aWJsZSB3aXRoIExpZ2h0XFwncyBiYWtlTnVtU2FtcGxlcyBsYXJnZXIgdGhhbiBvbmUuIEZvcmNpbmcgaXQgdG8gb25lLicpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmb3IgKGxldCB2aXJ0dWFsTGlnaHRJbmRleCA9IDA7IHZpcnR1YWxMaWdodEluZGV4IDwgbnVtVmlydHVhbExpZ2h0czsgdmlydHVhbExpZ2h0SW5kZXgrKykge1xuXG4gICAgICAgICAgICAgICAgRGVidWdHcmFwaGljcy5wdXNoR3B1TWFya2VyKGRldmljZSwgYExpZ2h0OiR7YmFrZUxpZ2h0LmxpZ2h0Ll9ub2RlLm5hbWV9OiR7dmlydHVhbExpZ2h0SW5kZXh9YCk7XG5cbiAgICAgICAgICAgICAgICAvLyBwcmVwYXJlIHZpcnR1YWwgbGlnaHRcbiAgICAgICAgICAgICAgICBpZiAobnVtVmlydHVhbExpZ2h0cyA+IDEpIHtcbiAgICAgICAgICAgICAgICAgICAgYmFrZUxpZ2h0LnByZXBhcmVWaXJ0dWFsTGlnaHQodmlydHVhbExpZ2h0SW5kZXgsIG51bVZpcnR1YWxMaWdodHMpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGJha2VMaWdodC5zdGFydEJha2UoKTtcbiAgICAgICAgICAgICAgICBsZXQgc2hhZG93TWFwUmVuZGVyZWQgPSBmYWxzZTtcblxuICAgICAgICAgICAgICAgIGNvbnN0IHNoYWRvd0NhbSA9IHRoaXMubGlnaHRDYW1lcmFQcmVwYXJlKGRldmljZSwgYmFrZUxpZ2h0KTtcblxuICAgICAgICAgICAgICAgIGZvciAobm9kZSA9IDA7IG5vZGUgPCBiYWtlTm9kZXMubGVuZ3RoOyBub2RlKyspIHtcblxuICAgICAgICAgICAgICAgICAgICBjb25zdCBiYWtlTm9kZSA9IGJha2VOb2Rlc1tub2RlXTtcbiAgICAgICAgICAgICAgICAgICAgcmN2ID0gYmFrZU5vZGUubWVzaEluc3RhbmNlcztcblxuICAgICAgICAgICAgICAgICAgICBjb25zdCBsaWdodEFmZmVjdHNOb2RlID0gdGhpcy5saWdodENhbWVyYVByZXBhcmVBbmRDdWxsKGJha2VMaWdodCwgYmFrZU5vZGUsIHNoYWRvd0NhbSwgY2FzdGVyQm91bmRzKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFsaWdodEFmZmVjdHNOb2RlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0dXBMaWdodEFycmF5KGxpZ2h0QXJyYXksIGJha2VMaWdodC5saWdodCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNsdXN0ZXJMaWdodHMgPSBpc0RpcmVjdGlvbmFsID8gW10gOiBbYmFrZUxpZ2h0LmxpZ2h0XTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAoY2x1c3RlcmVkTGlnaHRpbmdFbmFibGVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnJlbmRlcmVyLmxpZ2h0VGV4dHVyZUF0bGFzLnVwZGF0ZShjbHVzdGVyTGlnaHRzLCB0aGlzLmxpZ2h0aW5nUGFyYW1zKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIHJlbmRlciBsaWdodCBzaGFkb3cgbWFwIG5lZWRzIHRvIGJlIHJlbmRlcmVkXG4gICAgICAgICAgICAgICAgICAgIHNoYWRvd01hcFJlbmRlcmVkID0gdGhpcy5yZW5kZXJTaGFkb3dNYXAoY29tcCwgc2hhZG93TWFwUmVuZGVyZWQsIGNhc3RlcnMsIGJha2VMaWdodCk7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGNsdXN0ZXJlZExpZ2h0aW5nRW5hYmxlZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy53b3JsZENsdXN0ZXJzLnVwZGF0ZShjbHVzdGVyTGlnaHRzLCB0aGlzLnNjZW5lLmdhbW1hQ29ycmVjdGlvbiwgdGhpcy5saWdodGluZ1BhcmFtcyk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAvLyBTdG9yZSBvcmlnaW5hbCBtYXRlcmlhbHNcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5iYWNrdXBNYXRlcmlhbHMocmN2KTtcblxuICAgICAgICAgICAgICAgICAgICBmb3IgKHBhc3MgPSAwOyBwYXNzIDwgcGFzc0NvdW50OyBwYXNzKyspIHtcblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gb25seSBiYWtlIGZpcnN0IHZpcnR1YWwgbGlnaHQgZm9yIHBhc3MgMSwgYXMgaXQgZG9lcyBub3QgaGFuZGxlIG92ZXJsYXBwaW5nIGxpZ2h0c1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHBhc3MgPiAwICYmIHZpcnR1YWxMaWdodEluZGV4ID4gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBkb24ndCBiYWtlIGFtYmllbnQgbGlnaHQgaW4gcGFzcyAxLCBhcyB0aGVyZSdzIG5vIG1haW4gZGlyZWN0aW9uXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoaXNBbWJpZW50TGlnaHQgJiYgcGFzcyA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgRGVidWdHcmFwaGljcy5wdXNoR3B1TWFya2VyKGRldmljZSwgYExNUGFzczoke3Bhc3N9YCk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGxpZ2h0bWFwIHNpemVcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG5vZGVSVCA9IGJha2VOb2RlLnJlbmRlclRhcmdldHNbcGFzc107XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBsaWdodG1hcFNpemUgPSBiYWtlTm9kZS5yZW5kZXJUYXJnZXRzW3Bhc3NdLmNvbG9yQnVmZmVyLndpZHRoO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBnZXQgbWF0Y2hpbmcgdGVtcCByZW5kZXIgdGFyZ2V0IHRvIHJlbmRlciB0b1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgdGVtcFJUID0gdGhpcy5yZW5kZXJUYXJnZXRzLmdldChsaWdodG1hcFNpemUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgdGVtcFRleCA9IHRlbXBSVC5jb2xvckJ1ZmZlcjtcblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHBhc3MgPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzaGFkZXJzVXBkYXRlZE9uMXN0UGFzcyA9IHNjZW5lLnVwZGF0ZVNoYWRlcnM7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHNoYWRlcnNVcGRhdGVkT24xc3RQYXNzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2NlbmUudXBkYXRlU2hhZGVycyA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCBwYXNzTWF0ZXJpYWwgPSB0aGlzLnBhc3NNYXRlcmlhbHNbcGFzc107XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoaXNBbWJpZW50TGlnaHQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBmb3IgbGFzdCB2aXJ0dWFsIGxpZ2h0IG9mIGFtYmllbnQgbGlnaHQsIG11bHRpcGx5IGFjY3VtdWxhdGVkIEFPIGxpZ2h0bWFwIHdpdGggYW1iaWVudCBsaWdodFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGxhc3RWaXJ0dWFsTGlnaHRGb3JQYXNzID0gdmlydHVhbExpZ2h0SW5kZXggKyAxID09PSBudW1WaXJ0dWFsTGlnaHRzO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChsYXN0VmlydHVhbExpZ2h0Rm9yUGFzcyAmJiBwYXNzID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBhc3NNYXRlcmlhbCA9IHRoaXMuYW1iaWVudEFPTWF0ZXJpYWw7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBzZXQgdXAgbWF0ZXJpYWwgZm9yIGJha2luZyBhIHBhc3NcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvciAoaiA9IDA7IGogPCByY3YubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByY3Zbal0ubWF0ZXJpYWwgPSBwYXNzTWF0ZXJpYWw7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHVwZGF0ZSBzaGFkZXJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucmVuZGVyZXIudXBkYXRlU2hhZGVycyhyY3YpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBwaW5nLXBvbmdpbmcgb3V0cHV0XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnNldENhbWVyYSh0aGlzLmNhbWVyYSwgdGVtcFJULCB0cnVlKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHBhc3MgPT09IFBBU1NfRElSKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5jb25zdGFudEJha2VEaXIuc2V0VmFsdWUoYmFrZUxpZ2h0LmxpZ2h0LmJha2VEaXIgPyAxIDogMCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHByZXBhcmUgY2x1c3RlcmVkIGxpZ2h0aW5nXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoY2x1c3RlcmVkTGlnaHRpbmdFbmFibGVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy53b3JsZENsdXN0ZXJzLmFjdGl2YXRlKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuX2ZvcndhcmRUaW1lID0gMDtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuX3NoYWRvd01hcFRpbWUgPSAwO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnJlbmRlckZvcndhcmQodGhpcy5jYW1lcmEsIHJjdiwgbGlnaHRBcnJheSwgU0hBREVSX0ZPUldBUkRIRFIpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBkZXZpY2UudXBkYXRlRW5kKCk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vICNpZiBfUFJPRklMRVJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc3RhdHMuc2hhZG93TWFwVGltZSArPSB0aGlzLnJlbmRlcmVyLl9zaGFkb3dNYXBUaW1lO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zdGF0cy5mb3J3YXJkVGltZSArPSB0aGlzLnJlbmRlcmVyLl9mb3J3YXJkVGltZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc3RhdHMucmVuZGVyUGFzc2VzKys7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyAjZW5kaWZcblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gdGVtcCByZW5kZXIgdGFyZ2V0IG5vdyBoYXMgbGlnaHRtYXAsIHN0b3JlIGl0IGZvciB0aGUgbm9kZVxuICAgICAgICAgICAgICAgICAgICAgICAgYmFrZU5vZGUucmVuZGVyVGFyZ2V0c1twYXNzXSA9IHRlbXBSVDtcblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gYW5kIHJlbGVhc2UgcHJldmlvdXMgbGlnaHRtYXAgaW50byB0ZW1wIHJlbmRlciB0YXJnZXQgcG9vbFxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJUYXJnZXRzLnNldChsaWdodG1hcFNpemUsIG5vZGVSVCk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGZvciAoaiA9IDA7IGogPCByY3YubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtID0gcmN2W2pdO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG0uc2V0UmVhbHRpbWVMaWdodG1hcChNZXNoSW5zdGFuY2UubGlnaHRtYXBQYXJhbU5hbWVzW3Bhc3NdLCB0ZW1wVGV4KTsgLy8gcGluZy1wb25naW5nIGlucHV0XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbS5fc2hhZGVyRGVmcyB8PSBTSEFERVJERUZfTE07IC8vIGZvcmNlIHVzaW5nIExNIGV2ZW4gaWYgbWF0ZXJpYWwgZG9lc24ndCBoYXZlIGl0XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIERlYnVnR3JhcGhpY3MucG9wR3B1TWFya2VyKGRldmljZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAvLyBSZXZlcnQgdG8gb3JpZ2luYWwgbWF0ZXJpYWxzXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucmVzdG9yZU1hdGVyaWFscyhyY3YpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGJha2VMaWdodC5lbmRCYWtlKHRoaXMuc2hhZG93TWFwQ2FjaGUpO1xuXG4gICAgICAgICAgICAgICAgRGVidWdHcmFwaGljcy5wb3BHcHVNYXJrZXIoZGV2aWNlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMucG9zdHByb2Nlc3NUZXh0dXJlcyhkZXZpY2UsIGJha2VOb2RlcywgcGFzc0NvdW50KTtcblxuICAgICAgICAvLyByZXN0b3JlIGNoYW5nZXNcbiAgICAgICAgZm9yIChub2RlID0gMDsgbm9kZSA8IGFsbE5vZGVzLmxlbmd0aDsgbm9kZSsrKSB7XG4gICAgICAgICAgICBhbGxOb2Rlc1tub2RlXS5yZXN0b3JlKCk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnJlc3RvcmVMaWdodHMoYWxsTGlnaHRzKTtcbiAgICAgICAgdGhpcy5yZXN0b3JlU2NlbmUoKTtcblxuICAgICAgICAvLyBlbXB0eSBjYWNoZSB0byBtaW5pbWl6ZSBwZXJzaXN0ZW50IG1lbW9yeSB1c2UgLi4gaWYgc29tZSBjYWNoZWQgdGV4dHVyZXMgYXJlIG5lZWRlZCxcbiAgICAgICAgLy8gdGhleSB3aWxsIGJlIGFsbG9jYXRlZCBhZ2FpbiBhcyBuZWVkZWRcbiAgICAgICAgaWYgKCFjbHVzdGVyZWRMaWdodGluZ0VuYWJsZWQpIHtcbiAgICAgICAgICAgIHRoaXMuc2hhZG93TWFwQ2FjaGUuY2xlYXIoKTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuZXhwb3J0IHsgTGlnaHRtYXBwZXIgfTtcbiJdLCJuYW1lcyI6WyJNQVhfTElHSFRNQVBfU0laRSIsIlBBU1NfQ09MT1IiLCJQQVNTX0RJUiIsInRlbXBWZWMiLCJWZWMzIiwiTGlnaHRtYXBwZXIiLCJjb25zdHJ1Y3RvciIsImRldmljZSIsInJvb3QiLCJzY2VuZSIsInJlbmRlcmVyIiwiYXNzZXRzIiwic2hhZG93TWFwQ2FjaGUiLCJfdGVtcFNldCIsIlNldCIsIl9pbml0Q2FsbGVkIiwicGFzc01hdGVyaWFscyIsImFtYmllbnRBT01hdGVyaWFsIiwiZm9nIiwiYW1iaWVudExpZ2h0IiwiQ29sb3IiLCJyZW5kZXJUYXJnZXRzIiwiTWFwIiwic3RhdHMiLCJyZW5kZXJQYXNzZXMiLCJsaWdodG1hcENvdW50IiwidG90YWxSZW5kZXJUaW1lIiwiZm9yd2FyZFRpbWUiLCJmYm9UaW1lIiwic2hhZG93TWFwVGltZSIsImNvbXBpbGVUaW1lIiwic2hhZGVyc0xpbmtlZCIsImRlc3Ryb3kiLCJMaWdodG1hcENhY2hlIiwiZGVjUmVmIiwiYmxhY2tUZXgiLCJpbml0QmFrZSIsImxpZ2h0bWFwRmlsdGVycyIsIkxpZ2h0bWFwRmlsdGVycyIsImNvbnN0YW50QmFrZURpciIsInNjb3BlIiwicmVzb2x2ZSIsIm1hdGVyaWFscyIsIlRleHR1cmUiLCJ3aWR0aCIsImhlaWdodCIsImZvcm1hdCIsIlBJWEVMRk9STUFUX1JHQkE4IiwidHlwZSIsIlRFWFRVUkVUWVBFX1JHQk0iLCJuYW1lIiwiaW5jUmVmIiwiY2FtZXJhIiwiQ2FtZXJhIiwiY2xlYXJDb2xvciIsInNldCIsImNsZWFyQ29sb3JCdWZmZXIiLCJjbGVhckRlcHRoQnVmZmVyIiwiY2xlYXJTdGVuY2lsQnVmZmVyIiwiZnJ1c3R1bUN1bGxpbmciLCJwcm9qZWN0aW9uIiwiUFJPSkVDVElPTl9PUlRIT0dSQVBISUMiLCJhc3BlY3RSYXRpbyIsIm5vZGUiLCJHcmFwaE5vZGUiLCJjbHVzdGVyZWRMaWdodGluZ0VuYWJsZWQiLCJsaWdodGluZ1BhcmFtcyIsIkxpZ2h0aW5nUGFyYW1zIiwic3VwcG9ydHNBcmVhTGlnaHRzIiwibWF4VGV4dHVyZVNpemUiLCJzcmNQYXJhbXMiLCJsaWdodGluZyIsInNoYWRvd3NFbmFibGVkIiwic2hhZG93QXRsYXNSZXNvbHV0aW9uIiwiY29va2llc0VuYWJsZWQiLCJjb29raWVBdGxhc1Jlc29sdXRpb24iLCJhcmVhTGlnaHRzRW5hYmxlZCIsImNlbGxzIiwibWF4TGlnaHRzUGVyQ2VsbCIsIndvcmxkQ2x1c3RlcnMiLCJXb3JsZENsdXN0ZXJzIiwiZmluaXNoQmFrZSIsImJha2VOb2RlcyIsImRlc3Ryb3lSVCIsInJ0IiwiY29sb3JCdWZmZXIiLCJmb3JFYWNoIiwiY2xlYXIiLCJsZW5ndGgiLCJjcmVhdGVNYXRlcmlhbEZvclBhc3MiLCJwYXNzIiwiYWRkQW1iaWVudCIsIm1hdGVyaWFsIiwiU3RhbmRhcmRNYXRlcmlhbCIsImNodW5rcyIsIkFQSVZlcnNpb24iLCJDSFVOS0FQSV8xXzY1IiwidHJhbnNmb3JtVlMiLCJzaGFkZXJDaHVua3MiLCJiYWtlTG1FbmRDaHVuayIsInNoYWRlckNodW5rc0xpZ2h0bWFwcGVyIiwiYmFrZUxtRW5kUFMiLCJhbWJpZW50QmFrZU9jY2x1c2lvbkNvbnRyYXN0IiwidG9GaXhlZCIsImFtYmllbnRCYWtlT2NjbHVzaW9uQnJpZ2h0bmVzcyIsImFtYmllbnQiLCJhbWJpZW50VGludCIsImJhc2VQUyIsImxpZ2h0bWFwUGl4ZWxGb3JtYXQiLCJlbmRQUyIsImxpZ2h0TWFwIiwiYmFrZURpckxtRW5kUFMiLCJvdXRwdXRBbHBoYVBTIiwib3V0cHV0QWxwaGFPcGFxdWVQUyIsIm91dHB1dEFscGhhUHJlbXVsUFMiLCJjdWxsIiwiQ1VMTEZBQ0VfTk9ORSIsImZvcmNlVXYxIiwidXBkYXRlIiwiY3JlYXRlTWF0ZXJpYWxzIiwicGFzc0NvdW50Iiwib25VcGRhdGVTaGFkZXIiLCJvcHRpb25zIiwibGl0T3B0aW9ucyIsImxpZ2h0TWFwV2l0aG91dEFtYmllbnQiLCJzZXBhcmF0ZUFtYmllbnQiLCJjcmVhdGVUZXh0dXJlIiwic2l6ZSIsInByb2ZpbGVySGludCIsIlRFWEhJTlRfTElHSFRNQVAiLCJtaXBtYXBzIiwiVEVYVFVSRVRZUEVfREVGQVVMVCIsIm1pbkZpbHRlciIsIkZJTFRFUl9ORUFSRVNUIiwibWFnRmlsdGVyIiwiYWRkcmVzc1UiLCJBRERSRVNTX0NMQU1QX1RPX0VER0UiLCJhZGRyZXNzViIsImNvbGxlY3RNb2RlbHMiLCJhbGxOb2RlcyIsIl9ub2RlJG1vZGVsIiwiX25vZGUkbW9kZWwyIiwiX25vZGUkcmVuZGVyIiwiZW5hYmxlZCIsIm1lc2hJbnN0YW5jZXMiLCJtb2RlbCIsInB1c2giLCJCYWtlTWVzaE5vZGUiLCJsaWdodG1hcHBlZCIsInJlbmRlciIsImhhc1V2MSIsImkiLCJtZXNoIiwidmVydGV4QnVmZmVyIiwiRGVidWciLCJsb2ciLCJub3RJbnN0YW5jZWRNZXNoSW5zdGFuY2VzIiwiaGFzIiwiYWRkIiwiX2NoaWxkcmVuIiwicHJlcGFyZVNoYWRvd0Nhc3RlcnMiLCJub2RlcyIsImNhc3RlcnMiLCJuIiwiY29tcG9uZW50IiwiY2FzdFNoYWRvd3MiLCJjYXN0U2hhZG93c0xpZ2h0bWFwIiwibWVzaGVzIiwidmlzaWJsZVRoaXNGcmFtZSIsInVwZGF0ZVRyYW5zZm9ybXMiLCJqIiwiZ2V0V29ybGRUcmFuc2Zvcm0iLCJjYWxjdWxhdGVMaWdodG1hcFNpemUiLCJkYXRhIiwic2l6ZU11bHQiLCJsaWdodG1hcFNpemVNdWx0aXBsaWVyIiwic2NhbGUiLCJzcmNBcmVhIiwiYXNzZXQiLCJnZXQiLCJhcmVhIiwiX2FyZWEiLCJ4IiwieSIsInoiLCJ1diIsImFyZWFNdWx0IiwiYm91bmRzIiwiY29tcHV0ZU5vZGVCb3VuZHMiLCJjb3B5IiwiaGFsZkV4dGVudHMiLCJ0b3RhbEFyZWEiLCJNYXRoIiwic3FydCIsImxpZ2h0bWFwU2l6ZSIsIm1pbiIsIm1hdGgiLCJuZXh0UG93ZXJPZlR3byIsImxpZ2h0bWFwTWF4UmVzb2x1dGlvbiIsInNldExpZ2h0bWFwcGluZyIsInZhbHVlIiwic2hhZGVyRGVmcyIsIm1lc2hJbnN0YW5jZSIsInNldExpZ2h0bWFwcGVkIiwiX3NoYWRlckRlZnMiLCJtYXNrIiwiTUFTS19BRkZFQ1RfTElHSFRNQVBQRUQiLCJ0ZXgiLCJGSUxURVJfTElORUFSIiwic2V0UmVhbHRpbWVMaWdodG1hcCIsIk1lc2hJbnN0YW5jZSIsImxpZ2h0bWFwUGFyYW1OYW1lcyIsImJha2UiLCJtb2RlIiwiQkFLRV9DT0xPUkRJUiIsImlzV2ViR1BVIiwid2Fybk9uY2UiLCJzdGFydFRpbWUiLCJub3ciLCJfdXBkYXRlU2t5IiwiZmlyZSIsInRpbWVzdGFtcCIsInRhcmdldCIsInN0YXJ0U2hhZGVycyIsIl9zaGFkZXJTdGF0cyIsImxpbmtlZCIsInN0YXJ0RmJvVGltZSIsIl9yZW5kZXJUYXJnZXRDcmVhdGlvblRpbWUiLCJzdGFydENvbXBpbGVUaW1lIiwiRGVidWdHcmFwaGljcyIsInB1c2hHcHVNYXJrZXIiLCJzaGFkb3dSZW5kZXJlciIsImZyYW1lVXBkYXRlIiwiYmFrZUludGVybmFsIiwiU0hBREVSREVGX0xNIiwiU0hBREVSREVGX0RJUkxNIiwiYW1iaWVudEJha2UiLCJTSEFERVJERUZfTE1BTUJJRU5UIiwicG9wR3B1TWFya2VyIiwibm93VGltZSIsImFsbG9jYXRlVGV4dHVyZXMiLCJiYWtlTm9kZSIsIlJlbmRlclRhcmdldCIsImRlcHRoIiwicHJlcGFyZUxpZ2h0c1RvQmFrZSIsImxheWVyQ29tcG9zaXRpb24iLCJhbGxMaWdodHMiLCJiYWtlTGlnaHRzIiwiQmFrZUxpZ2h0QW1iaWVudCIsInNjZW5lTGlnaHRzIiwibGlnaHRzIiwibGlnaHQiLCJiYWtlTGlnaHQiLCJCYWtlTGlnaHRTaW1wbGUiLCJNQVNLX0JBS0UiLCJNQVNLX0FGRkVDVF9EWU5BTUlDIiwic2hhZG93VXBkYXRlTW9kZSIsIkxJR0hUVFlQRV9ESVJFQ1RJT05BTCIsIlNIQURPV1VQREFURV9SRUFMVElNRSIsIlNIQURPV1VQREFURV9USElTRlJBTUUiLCJzb3J0IiwicmVzdG9yZUxpZ2h0cyIsInJlc3RvcmUiLCJzZXR1cFNjZW5lIiwiRk9HX05PTkUiLCJzZXRTY2VuZUNvbnN0YW50cyIsInJlc3RvcmVTY2VuZSIsIkJvdW5kaW5nQm94IiwiYWFiYiIsIm0iLCJjb21wdXRlTm9kZXNCb3VuZHMiLCJjb21wdXRlQm91bmRzIiwiYmFja3VwTWF0ZXJpYWxzIiwicmVzdG9yZU1hdGVyaWFscyIsImxpZ2h0Q2FtZXJhUHJlcGFyZSIsInNoYWRvd0NhbSIsIkxJR0hUVFlQRV9TUE9UIiwibGlnaHRSZW5kZXJEYXRhIiwiZ2V0UmVuZGVyRGF0YSIsInNoYWRvd0NhbWVyYSIsIl9ub2RlIiwic2V0UG9zaXRpb24iLCJnZXRQb3NpdGlvbiIsInNldFJvdGF0aW9uIiwiZ2V0Um90YXRpb24iLCJyb3RhdGVMb2NhbCIsIlBST0pFQ1RJT05fUEVSU1BFQ1RJVkUiLCJuZWFyQ2xpcCIsImF0dGVudWF0aW9uRW5kIiwiZmFyQ2xpcCIsImZvdiIsIl9vdXRlckNvbmVBbmdsZSIsInVwZGF0ZUNhbWVyYUZydXN0dW0iLCJsaWdodENhbWVyYVByZXBhcmVBbmRDdWxsIiwiY2FzdGVyQm91bmRzIiwibGlnaHRBZmZlY3RzTm9kZSIsImNlbnRlciIsInNldEV1bGVyQW5nbGVzIiwiZnJ1c3R1bVNpemUiLCJtYXgiLCJvcnRob0hlaWdodCIsImxpZ2h0Qm91bmRzIiwiaW50ZXJzZWN0cyIsIm5vZGVWaXNpYmxlIiwiX2lzVmlzaWJsZSIsInNldHVwTGlnaHRBcnJheSIsImxpZ2h0QXJyYXkiLCJMSUdIVFRZUEVfT01OSSIsInJlbmRlclNoYWRvd01hcCIsImNvbXAiLCJzaGFkb3dNYXBSZW5kZXJlZCIsImlzQ2x1c3RlcmVkIiwic2hhZG93TWFwIiwiX3NoYWRvd1JlbmRlcmVyRGlyZWN0aW9uYWwiLCJfc2hhZG93UmVuZGVyZXJMb2NhbCIsImluc2lkZVJlbmRlclBhc3MiLCJwb3N0cHJvY2Vzc1RleHR1cmVzIiwibnVtRGlsYXRlczJ4IiwiZGlsYXRlU2hhZGVyIiwic2hhZGVyRGlsYXRlIiwiZmlsdGVyTGlnaHRtYXAiLCJsaWdodG1hcEZpbHRlckVuYWJsZWQiLCJwcmVwYXJlRGVub2lzZSIsImxpZ2h0bWFwRmlsdGVyUmFuZ2UiLCJsaWdodG1hcEZpbHRlclNtb290aG5lc3MiLCJzZXRCbGVuZFN0YXRlIiwiQmxlbmRTdGF0ZSIsIk5PQkxFTkQiLCJzZXREZXB0aFN0YXRlIiwiRGVwdGhTdGF0ZSIsIk5PREVQVEgiLCJzZXRTdGVuY2lsU3RhdGUiLCJub2RlUlQiLCJsaWdodG1hcCIsInRlbXBSVCIsInRlbXBUZXgiLCJwcmVwYXJlIiwic2V0U291cmNlVGV4dHVyZSIsImJpbGF0ZXJhbEZpbHRlckVuYWJsZWQiLCJkcmF3UXVhZFdpdGhTaGFkZXIiLCJzaGFkZXJEZW5vaXNlIiwibGF5ZXJzIiwiX3VwZGF0ZSIsImNvbGxlY3RMaWdodHMiLCJ1cGRhdGVDcHVTa2luTWF0cmljZXMiLCJncHVVcGRhdGUiLCJyY3YiLCJzaGFkZXJzVXBkYXRlZE9uMXN0UGFzcyIsImlzQW1iaWVudExpZ2h0IiwiaXNEaXJlY3Rpb25hbCIsIm51bVZpcnR1YWxMaWdodHMiLCJiYWtlRGlyIiwid2FybiIsInZpcnR1YWxMaWdodEluZGV4IiwicHJlcGFyZVZpcnR1YWxMaWdodCIsInN0YXJ0QmFrZSIsImNsdXN0ZXJMaWdodHMiLCJsaWdodFRleHR1cmVBdGxhcyIsImdhbW1hQ29ycmVjdGlvbiIsInVwZGF0ZVNoYWRlcnMiLCJwYXNzTWF0ZXJpYWwiLCJsYXN0VmlydHVhbExpZ2h0Rm9yUGFzcyIsInNldENhbWVyYSIsInNldFZhbHVlIiwiYWN0aXZhdGUiLCJfZm9yd2FyZFRpbWUiLCJfc2hhZG93TWFwVGltZSIsInJlbmRlckZvcndhcmQiLCJTSEFERVJfRk9SV0FSREhEUiIsInVwZGF0ZUVuZCIsImVuZEJha2UiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFpREEsTUFBTUEsaUJBQWlCLEdBQUcsSUFBSSxDQUFBO0FBRTlCLE1BQU1DLFVBQVUsR0FBRyxDQUFDLENBQUE7QUFDcEIsTUFBTUMsUUFBUSxHQUFHLENBQUMsQ0FBQTtBQUVsQixNQUFNQyxPQUFPLEdBQUcsSUFBSUMsSUFBSSxFQUFFLENBQUE7O0FBRTFCO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxNQUFNQyxXQUFXLENBQUM7QUFDZDtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtB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
