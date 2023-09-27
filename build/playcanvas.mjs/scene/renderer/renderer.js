import { Debug, DebugHelper } from '../../core/debug.js';
import { now } from '../../core/time.js';
import { Vec3 } from '../../core/math/vec3.js';
import { Mat3 } from '../../core/math/mat3.js';
import { Mat4 } from '../../core/math/mat4.js';
import { BoundingSphere } from '../../core/shape/bounding-sphere.js';
import { SORTKEY_FORWARD, SORTKEY_DEPTH, VIEW_CENTER, PROJECTION_ORTHOGRAPHIC, LIGHTTYPE_DIRECTIONAL, MASK_AFFECT_DYNAMIC, MASK_AFFECT_LIGHTMAPPED, MASK_BAKE, SHADOWUPDATE_NONE, SHADOWUPDATE_THISFRAME } from '../constants.js';
import { LightTextureAtlas } from '../lighting/light-texture-atlas.js';
import { Material } from '../materials/material.js';
import { LightCube } from '../graphics/light-cube.js';
import { CLEARFLAG_COLOR, CLEARFLAG_DEPTH, CLEARFLAG_STENCIL, CULLFACE_FRONT, CULLFACE_BACK, CULLFACE_NONE, UNIFORMTYPE_MAT4, UNIFORMTYPE_MAT3, UNIFORMTYPE_VEC3, UNIFORMTYPE_FLOAT, UNIFORMTYPE_VEC2, UNIFORMTYPE_INT, BINDGROUP_VIEW, BINDGROUP_MESH, SEMANTIC_ATTR, UNIFORM_BUFFER_DEFAULT_SLOT_NAME, SHADERSTAGE_VERTEX, SHADERSTAGE_FRAGMENT, TEXTUREDIMENSION_2D, SAMPLETYPE_UNFILTERABLE_FLOAT, SAMPLETYPE_DEPTH, SAMPLETYPE_FLOAT } from '../../platform/graphics/constants.js';
import { DebugGraphics } from '../../platform/graphics/debug-graphics.js';
import { UniformBuffer } from '../../platform/graphics/uniform-buffer.js';
import { BindGroup } from '../../platform/graphics/bind-group.js';
import { UniformFormat, UniformBufferFormat } from '../../platform/graphics/uniform-buffer-format.js';
import { BindGroupFormat, BindBufferFormat, BindTextureFormat } from '../../platform/graphics/bind-group-format.js';
import { ShadowMapCache } from './shadow-map-cache.js';
import { ShadowRendererLocal } from './shadow-renderer-local.js';
import { ShadowRendererDirectional } from './shadow-renderer-directional.js';
import { CookieRenderer } from './cookie-renderer.js';
import { ShadowRenderer } from './shadow-renderer.js';
import { WorldClustersAllocator } from './world-clusters-allocator.js';

let _skinUpdateIndex = 0;
const boneTextureSize = [0, 0, 0, 0];
const viewProjMat = new Mat4();
const viewInvMat = new Mat4();
const viewMat = new Mat4();
const viewMat3 = new Mat3();
const tempSphere = new BoundingSphere();
const _flipYMat = new Mat4().setScale(1, -1, 1);
const _tempLightSet = new Set();
const _tempLayerSet = new Set();

// Converts a projection matrix in OpenGL style (depth range of -1..1) to a DirectX style (depth range of 0..1).
const _fixProjRangeMat = new Mat4().set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0.5, 0, 0, 0, 0.5, 1]);
const _tempProjMat0 = new Mat4();
const _tempProjMat1 = new Mat4();
const _tempProjMat2 = new Mat4();
const _tempProjMat3 = new Mat4();
const _tempSet = new Set();
const _tempMeshInstances = [];
const _tempMeshInstancesSkinned = [];

/**
 * The base renderer functionality to allow implementation of specialized renderers.
 *
 * @ignore
 */
class Renderer {
  /**
   * Create a new instance.
   *
   * @param {import('../../platform/graphics/graphics-device.js').GraphicsDevice} graphicsDevice - The
   * graphics device used by the renderer.
   */
  constructor(graphicsDevice) {
    /** @type {boolean} */
    this.clustersDebugRendered = false;
    /**
     * A set of visible mesh instances which need further processing before being rendered, e.g.
     * skinning or morphing. Extracted during culling.
     *
     * @type {Set<import('../mesh-instance.js').MeshInstance>}
     * @private
     */
    this.processingMeshInstances = new Set();
    /**
     * @type {WorldClustersAllocator}
     * @ignore
     */
    this.worldClustersAllocator = void 0;
    /**
     * A list of all unique lights in the layer composition.
     *
     * @type {import('../light.js').Light[]}
     */
    this.lights = [];
    /**
     * A list of all unique local lights (spot & omni) in the layer composition.
     *
     * @type {import('../light.js').Light[]}
     */
    this.localLights = [];
    this.device = graphicsDevice;

    /** @type {import('../scene.js').Scene|null} */
    this.scene = null;

    // TODO: allocate only when the scene has clustered lighting enabled
    this.worldClustersAllocator = new WorldClustersAllocator(graphicsDevice);

    // texture atlas managing shadow map / cookie texture atlassing for omni and spot lights
    this.lightTextureAtlas = new LightTextureAtlas(graphicsDevice);

    // shadows
    this.shadowMapCache = new ShadowMapCache();
    this.shadowRenderer = new ShadowRenderer(this, this.lightTextureAtlas);
    this._shadowRendererLocal = new ShadowRendererLocal(this, this.shadowRenderer);
    this._shadowRendererDirectional = new ShadowRendererDirectional(this, this.shadowRenderer);

    // cookies
    this._cookieRenderer = new CookieRenderer(graphicsDevice, this.lightTextureAtlas);

    // view bind group format with its uniform buffer format
    this.viewUniformFormat = null;
    this.viewBindGroupFormat = null;

    // timing
    this._skinTime = 0;
    this._morphTime = 0;
    this._cullTime = 0;
    this._shadowMapTime = 0;
    this._lightClustersTime = 0;
    this._layerCompositionUpdateTime = 0;

    // stats
    this._shadowDrawCalls = 0;
    this._skinDrawCalls = 0;
    this._instancedDrawCalls = 0;
    this._shadowMapUpdates = 0;
    this._numDrawCallsCulled = 0;
    this._camerasRendered = 0;
    this._lightClusters = 0;

    // Uniforms
    const scope = graphicsDevice.scope;
    this.boneTextureId = scope.resolve('texture_poseMap');
    this.boneTextureSizeId = scope.resolve('texture_poseMapSize');
    this.poseMatrixId = scope.resolve('matrix_pose[0]');
    this.modelMatrixId = scope.resolve('matrix_model');
    this.normalMatrixId = scope.resolve('matrix_normal');
    this.viewInvId = scope.resolve('matrix_viewInverse');
    this.viewPos = new Float32Array(3);
    this.viewPosId = scope.resolve('view_position');
    this.projId = scope.resolve('matrix_projection');
    this.projSkyboxId = scope.resolve('matrix_projectionSkybox');
    this.viewId = scope.resolve('matrix_view');
    this.viewId3 = scope.resolve('matrix_view3');
    this.viewProjId = scope.resolve('matrix_viewProjection');
    this.flipYId = scope.resolve('projectionFlipY');
    this.tbnBasis = scope.resolve('tbnBasis');
    this.nearClipId = scope.resolve('camera_near');
    this.farClipId = scope.resolve('camera_far');
    this.cameraParams = new Float32Array(4);
    this.cameraParamsId = scope.resolve('camera_params');
    this.alphaTestId = scope.resolve('alpha_ref');
    this.opacityMapId = scope.resolve('texture_opacityMap');
    this.exposureId = scope.resolve('exposure');
    this.twoSidedLightingNegScaleFactorId = scope.resolve('twoSidedLightingNegScaleFactor');
    this.twoSidedLightingNegScaleFactorId.setValue(0);
    this.morphWeightsA = scope.resolve('morph_weights_a');
    this.morphWeightsB = scope.resolve('morph_weights_b');
    this.morphPositionTex = scope.resolve('morphPositionTex');
    this.morphNormalTex = scope.resolve('morphNormalTex');
    this.morphTexParams = scope.resolve('morph_tex_params');

    // a single instance of light cube
    this.lightCube = new LightCube();
    this.constantLightCube = scope.resolve('lightCube[0]');
  }
  destroy() {
    this.shadowRenderer = null;
    this._shadowRendererLocal = null;
    this._shadowRendererDirectional = null;
    this.shadowMapCache.destroy();
    this.shadowMapCache = null;
    this._cookieRenderer.destroy();
    this._cookieRenderer = null;
    this.lightTextureAtlas.destroy();
    this.lightTextureAtlas = null;
  }
  sortCompare(drawCallA, drawCallB) {
    if (drawCallA.layer === drawCallB.layer) {
      if (drawCallA.drawOrder && drawCallB.drawOrder) {
        return drawCallA.drawOrder - drawCallB.drawOrder;
      } else if (drawCallA.zdist && drawCallB.zdist) {
        return drawCallB.zdist - drawCallA.zdist; // back to front
      } else if (drawCallA.zdist2 && drawCallB.zdist2) {
        return drawCallA.zdist2 - drawCallB.zdist2; // front to back
      }
    }

    return drawCallB._key[SORTKEY_FORWARD] - drawCallA._key[SORTKEY_FORWARD];
  }
  sortCompareMesh(drawCallA, drawCallB) {
    if (drawCallA.layer === drawCallB.layer) {
      if (drawCallA.drawOrder && drawCallB.drawOrder) {
        return drawCallA.drawOrder - drawCallB.drawOrder;
      } else if (drawCallA.zdist && drawCallB.zdist) {
        return drawCallB.zdist - drawCallA.zdist; // back to front
      }
    }

    const keyA = drawCallA._key[SORTKEY_FORWARD];
    const keyB = drawCallB._key[SORTKEY_FORWARD];
    if (keyA === keyB && drawCallA.mesh && drawCallB.mesh) {
      return drawCallB.mesh.id - drawCallA.mesh.id;
    }
    return keyB - keyA;
  }
  sortCompareDepth(drawCallA, drawCallB) {
    const keyA = drawCallA._key[SORTKEY_DEPTH];
    const keyB = drawCallB._key[SORTKEY_DEPTH];
    if (keyA === keyB && drawCallA.mesh && drawCallB.mesh) {
      return drawCallB.mesh.id - drawCallA.mesh.id;
    }
    return keyB - keyA;
  }

  /**
   * Set up the viewport and the scissor for camera rendering.
   *
   * @param {import('../camera.js').Camera} camera - The camera containing the viewport
   * information.
   * @param {import('../../platform/graphics/render-target.js').RenderTarget} [renderTarget] - The
   * render target. NULL for the default one.
   */
  setupViewport(camera, renderTarget) {
    const device = this.device;
    DebugGraphics.pushGpuMarker(device, 'SETUP-VIEWPORT');
    const pixelWidth = renderTarget ? renderTarget.width : device.width;
    const pixelHeight = renderTarget ? renderTarget.height : device.height;
    const rect = camera.rect;
    let x = Math.floor(rect.x * pixelWidth);
    let y = Math.floor(rect.y * pixelHeight);
    let w = Math.floor(rect.z * pixelWidth);
    let h = Math.floor(rect.w * pixelHeight);
    device.setViewport(x, y, w, h);

    // use viewport rectangle by default. Use scissor rectangle when required.
    if (camera._scissorRectClear) {
      const scissorRect = camera.scissorRect;
      x = Math.floor(scissorRect.x * pixelWidth);
      y = Math.floor(scissorRect.y * pixelHeight);
      w = Math.floor(scissorRect.z * pixelWidth);
      h = Math.floor(scissorRect.w * pixelHeight);
    }
    device.setScissor(x, y, w, h);
    DebugGraphics.popGpuMarker(device);
  }
  setCameraUniforms(camera, target) {
    // flipping proj matrix
    const flipY = target == null ? void 0 : target.flipY;
    let viewCount = 1;
    if (camera.xr && camera.xr.session) {
      let transform;
      const parent = camera._node.parent;
      if (parent) transform = parent.getWorldTransform();
      const views = camera.xr.views;
      viewCount = views.length;
      for (let v = 0; v < viewCount; v++) {
        const view = views[v];
        if (parent) {
          view.viewInvOffMat.mul2(transform, view.viewInvMat);
          view.viewOffMat.copy(view.viewInvOffMat).invert();
        } else {
          view.viewInvOffMat.copy(view.viewInvMat);
          view.viewOffMat.copy(view.viewMat);
        }
        view.viewMat3.setFromMat4(view.viewOffMat);
        view.projViewOffMat.mul2(view.projMat, view.viewOffMat);
        view.position[0] = view.viewInvOffMat.data[12];
        view.position[1] = view.viewInvOffMat.data[13];
        view.position[2] = view.viewInvOffMat.data[14];
        camera.frustum.setFromMat4(view.projViewOffMat);
      }
    } else {
      // Projection Matrix
      let projMat = camera.projectionMatrix;
      if (camera.calculateProjection) {
        camera.calculateProjection(projMat, VIEW_CENTER);
      }
      let projMatSkybox = camera.getProjectionMatrixSkybox();

      // flip projection matrices
      if (flipY) {
        projMat = _tempProjMat0.mul2(_flipYMat, projMat);
        projMatSkybox = _tempProjMat1.mul2(_flipYMat, projMatSkybox);
      }

      // update depth range of projection matrices (-1..1 to 0..1)
      if (this.device.isWebGPU) {
        projMat = _tempProjMat2.mul2(_fixProjRangeMat, projMat);
        projMatSkybox = _tempProjMat3.mul2(_fixProjRangeMat, projMatSkybox);
      }
      this.projId.setValue(projMat.data);
      this.projSkyboxId.setValue(projMatSkybox.data);

      // ViewInverse Matrix
      if (camera.calculateTransform) {
        camera.calculateTransform(viewInvMat, VIEW_CENTER);
      } else {
        const pos = camera._node.getPosition();
        const rot = camera._node.getRotation();
        viewInvMat.setTRS(pos, rot, Vec3.ONE);
      }
      this.viewInvId.setValue(viewInvMat.data);

      // View Matrix
      viewMat.copy(viewInvMat).invert();
      this.viewId.setValue(viewMat.data);

      // View 3x3
      viewMat3.setFromMat4(viewMat);
      this.viewId3.setValue(viewMat3.data);

      // ViewProjection Matrix
      viewProjMat.mul2(projMat, viewMat);
      this.viewProjId.setValue(viewProjMat.data);
      this.flipYId.setValue(flipY ? -1 : 1);

      // View Position (world space)
      this.dispatchViewPos(camera._node.getPosition());
      camera.frustum.setFromMat4(viewProjMat);
    }
    this.tbnBasis.setValue(flipY ? -1 : 1);

    // Near and far clip values
    const n = camera._nearClip;
    const f = camera._farClip;
    this.nearClipId.setValue(n);
    this.farClipId.setValue(f);

    // camera params
    this.cameraParams[0] = 1 / f;
    this.cameraParams[1] = f;
    this.cameraParams[2] = n;
    this.cameraParams[3] = camera.projection === PROJECTION_ORTHOGRAPHIC ? 1 : 0;
    this.cameraParamsId.setValue(this.cameraParams);

    // exposure
    this.exposureId.setValue(this.scene.physicalUnits ? camera.getExposure() : this.scene.exposure);
    return viewCount;
  }

  /**
   * Clears the active render target. If the viewport is already set up, only its area is cleared.
   *
   * @param {import('../camera.js').Camera} camera - The camera supplying the value to clear to.
   * @param {boolean} [clearColor] - True if the color buffer should be cleared. Uses the value
   * from the camra if not supplied.
   * @param {boolean} [clearDepth] - True if the depth buffer should be cleared. Uses the value
   * from the camra if not supplied.
   * @param {boolean} [clearStencil] - True if the stencil buffer should be cleared. Uses the
   * value from the camra if not supplied.
   */
  clear(camera, clearColor, clearDepth, clearStencil) {
    const flags = ((clearColor != null ? clearColor : camera._clearColorBuffer) ? CLEARFLAG_COLOR : 0) | ((clearDepth != null ? clearDepth : camera._clearDepthBuffer) ? CLEARFLAG_DEPTH : 0) | ((clearStencil != null ? clearStencil : camera._clearStencilBuffer) ? CLEARFLAG_STENCIL : 0);
    if (flags) {
      const device = this.device;
      DebugGraphics.pushGpuMarker(device, 'CLEAR');
      device.clear({
        color: [camera._clearColor.r, camera._clearColor.g, camera._clearColor.b, camera._clearColor.a],
        depth: camera._clearDepth,
        stencil: camera._clearStencil,
        flags: flags
      });
      DebugGraphics.popGpuMarker(device);
    }
  }

  // make sure colorWrite is set to true to all channels, if you want to fully clear the target
  // TODO: this function is only used from outside of forward renderer, and should be deprecated
  // when the functionality moves to the render passes. Note that Editor uses it as well.
  setCamera(camera, target, clear, renderAction = null) {
    this.setCameraUniforms(camera, target);
    this.clearView(camera, target, clear, false);
  }

  // TODO: this is currently used by the lightmapper and the Editor,
  // and will be removed when those call are removed.
  clearView(camera, target, clear, forceWrite) {
    const device = this.device;
    DebugGraphics.pushGpuMarker(device, 'CLEAR-VIEW');
    device.setRenderTarget(target);
    device.updateBegin();
    if (forceWrite) {
      device.setColorWrite(true, true, true, true);
      device.setDepthWrite(true);
    }
    this.setupViewport(camera, target);
    if (clear) {
      // use camera clear options if any
      const options = camera._clearOptions;
      device.clear(options ? options : {
        color: [camera._clearColor.r, camera._clearColor.g, camera._clearColor.b, camera._clearColor.a],
        depth: camera._clearDepth,
        flags: (camera._clearColorBuffer ? CLEARFLAG_COLOR : 0) | (camera._clearDepthBuffer ? CLEARFLAG_DEPTH : 0) | (camera._clearStencilBuffer ? CLEARFLAG_STENCIL : 0),
        stencil: camera._clearStencil
      });
    }
    DebugGraphics.popGpuMarker(device);
  }
  setupCullMode(cullFaces, flipFactor, drawCall) {
    const material = drawCall.material;
    let mode = CULLFACE_NONE;
    if (cullFaces) {
      let flipFaces = 1;
      if (material.cull === CULLFACE_FRONT || material.cull === CULLFACE_BACK) {
        flipFaces = flipFactor * drawCall.flipFacesFactor * drawCall.node.worldScaleSign;
      }
      if (flipFaces < 0) {
        mode = material.cull === CULLFACE_FRONT ? CULLFACE_BACK : CULLFACE_FRONT;
      } else {
        mode = material.cull;
      }
    }
    this.device.setCullMode(mode);
    if (mode === CULLFACE_NONE && material.cull === CULLFACE_NONE) {
      this.twoSidedLightingNegScaleFactorId.setValue(drawCall.node.worldScaleSign);
    }
  }
  updateCameraFrustum(camera) {
    if (camera.xr && camera.xr.views.length) {
      // calculate frustum based on XR view
      const view = camera.xr.views[0];
      viewProjMat.mul2(view.projMat, view.viewOffMat);
      camera.frustum.setFromMat4(viewProjMat);
      return;
    }
    const projMat = camera.projectionMatrix;
    if (camera.calculateProjection) {
      camera.calculateProjection(projMat, VIEW_CENTER);
    }
    if (camera.calculateTransform) {
      camera.calculateTransform(viewInvMat, VIEW_CENTER);
    } else {
      const pos = camera._node.getPosition();
      const rot = camera._node.getRotation();
      viewInvMat.setTRS(pos, rot, Vec3.ONE);
      this.viewInvId.setValue(viewInvMat.data);
    }
    viewMat.copy(viewInvMat).invert();
    viewProjMat.mul2(projMat, viewMat);
    camera.frustum.setFromMat4(viewProjMat);
  }
  setBaseConstants(device, material) {
    // Cull mode
    device.setCullMode(material.cull);

    // Alpha test
    if (material.opacityMap) {
      this.opacityMapId.setValue(material.opacityMap);
    }
    if (material.opacityMap || material.alphaTest > 0) {
      this.alphaTestId.setValue(material.alphaTest);
    }
  }
  updateCpuSkinMatrices(drawCalls) {
    _skinUpdateIndex++;
    const drawCallsCount = drawCalls.length;
    if (drawCallsCount === 0) return;
    const skinTime = now();
    for (let i = 0; i < drawCallsCount; i++) {
      const si = drawCalls[i].skinInstance;
      if (si) {
        si.updateMatrices(drawCalls[i].node, _skinUpdateIndex);
        si._dirty = true;
      }
    }
    this._skinTime += now() - skinTime;
  }

  /**
   * Update skin matrices ahead of rendering.
   *
   * @param {import('../mesh-instance.js').MeshInstance[]|Set<import('../mesh-instance.js').MeshInstance>} drawCalls - MeshInstances
   * containing skinInstance.
   * @ignore
   */
  updateGpuSkinMatrices(drawCalls) {
    const skinTime = now();
    for (const drawCall of drawCalls) {
      const skin = drawCall.skinInstance;
      if (skin && skin._dirty) {
        skin.updateMatrixPalette(drawCall.node, _skinUpdateIndex);
        skin._dirty = false;
      }
    }
    this._skinTime += now() - skinTime;
  }

  /**
   * Update morphing ahead of rendering.
   *
   * @param {import('../mesh-instance.js').MeshInstance[]|Set<import('../mesh-instance.js').MeshInstance>} drawCalls - MeshInstances
   * containing morphInstance.
   * @ignore
   */
  updateMorphing(drawCalls) {
    const morphTime = now();
    for (const drawCall of drawCalls) {
      const morphInst = drawCall.morphInstance;
      if (morphInst && morphInst._dirty) {
        morphInst.update();
      }
    }
    this._morphTime += now() - morphTime;
  }

  /**
   * Update draw calls ahead of rendering.
   *
   * @param {import('../mesh-instance.js').MeshInstance[]|Set<import('../mesh-instance.js').MeshInstance>} drawCalls - MeshInstances
   * requiring updates.
   * @ignore
   */
  gpuUpdate(drawCalls) {
    // Note that drawCalls can be either a Set or an Array and contains mesh instances
    // that are visible in this frame
    this.updateGpuSkinMatrices(drawCalls);
    this.updateMorphing(drawCalls);
  }
  setVertexBuffers(device, mesh) {
    // main vertex buffer
    device.setVertexBuffer(mesh.vertexBuffer);
  }
  setMorphing(device, morphInstance) {
    if (morphInstance) {
      if (morphInstance.morph.useTextureMorph) {
        // vertex buffer with vertex ids
        device.setVertexBuffer(morphInstance.morph.vertexBufferIds);

        // textures
        this.morphPositionTex.setValue(morphInstance.texturePositions);
        this.morphNormalTex.setValue(morphInstance.textureNormals);

        // texture params
        this.morphTexParams.setValue(morphInstance._textureParams);
      } else {
        // vertex attributes based morphing

        for (let t = 0; t < morphInstance._activeVertexBuffers.length; t++) {
          const vb = morphInstance._activeVertexBuffers[t];
          if (vb) {
            // patch semantic for the buffer to current ATTR slot (using ATTR8 - ATTR15 range)
            const semantic = SEMANTIC_ATTR + (t + 8);
            vb.format.elements[0].name = semantic;
            vb.format.elements[0].scopeId = device.scope.resolve(semantic);
            vb.format.update();
            device.setVertexBuffer(vb);
          }
        }

        // set all 8 weights
        this.morphWeightsA.setValue(morphInstance._shaderMorphWeightsA);
        this.morphWeightsB.setValue(morphInstance._shaderMorphWeightsB);
      }
    }
  }
  setSkinning(device, meshInstance) {
    if (meshInstance.skinInstance) {
      this._skinDrawCalls++;
      if (device.supportsBoneTextures) {
        const boneTexture = meshInstance.skinInstance.boneTexture;
        this.boneTextureId.setValue(boneTexture);
        boneTextureSize[0] = boneTexture.width;
        boneTextureSize[1] = boneTexture.height;
        boneTextureSize[2] = 1.0 / boneTexture.width;
        boneTextureSize[3] = 1.0 / boneTexture.height;
        this.boneTextureSizeId.setValue(boneTextureSize);
      } else {
        this.poseMatrixId.setValue(meshInstance.skinInstance.matrixPalette);
      }
    }
  }

  // sets Vec3 camera position uniform
  dispatchViewPos(position) {
    const vp = this.viewPos; // note that this reuses an array
    vp[0] = position.x;
    vp[1] = position.y;
    vp[2] = position.z;
    this.viewPosId.setValue(vp);
  }
  initViewBindGroupFormat(isClustered) {
    if (this.device.supportsUniformBuffers && !this.viewUniformFormat) {
      // format of the view uniform buffer
      const uniforms = [new UniformFormat("matrix_viewProjection", UNIFORMTYPE_MAT4), new UniformFormat("cubeMapRotationMatrix", UNIFORMTYPE_MAT3), new UniformFormat("view_position", UNIFORMTYPE_VEC3), new UniformFormat("skyboxIntensity", UNIFORMTYPE_FLOAT), new UniformFormat("exposure", UNIFORMTYPE_FLOAT), new UniformFormat("textureBias", UNIFORMTYPE_FLOAT)];
      if (isClustered) {
        uniforms.push(...[new UniformFormat("clusterCellsCountByBoundsSize", UNIFORMTYPE_VEC3), new UniformFormat("clusterTextureSize", UNIFORMTYPE_VEC3), new UniformFormat("clusterBoundsMin", UNIFORMTYPE_VEC3), new UniformFormat("clusterBoundsDelta", UNIFORMTYPE_VEC3), new UniformFormat("clusterCellsDot", UNIFORMTYPE_VEC3), new UniformFormat("clusterCellsMax", UNIFORMTYPE_VEC3), new UniformFormat("clusterCompressionLimit0", UNIFORMTYPE_VEC2), new UniformFormat("shadowAtlasParams", UNIFORMTYPE_VEC2), new UniformFormat("clusterMaxCells", UNIFORMTYPE_INT), new UniformFormat("clusterSkip", UNIFORMTYPE_FLOAT)]);
      }
      this.viewUniformFormat = new UniformBufferFormat(this.device, uniforms);

      // format of the view bind group - contains single uniform buffer, and some textures
      const buffers = [new BindBufferFormat(UNIFORM_BUFFER_DEFAULT_SLOT_NAME, SHADERSTAGE_VERTEX | SHADERSTAGE_FRAGMENT)];
      const textures = [new BindTextureFormat('lightsTextureFloat', SHADERSTAGE_FRAGMENT, TEXTUREDIMENSION_2D, SAMPLETYPE_UNFILTERABLE_FLOAT), new BindTextureFormat('lightsTexture8', SHADERSTAGE_FRAGMENT, TEXTUREDIMENSION_2D, SAMPLETYPE_UNFILTERABLE_FLOAT), new BindTextureFormat('shadowAtlasTexture', SHADERSTAGE_FRAGMENT, TEXTUREDIMENSION_2D, SAMPLETYPE_DEPTH), new BindTextureFormat('cookieAtlasTexture', SHADERSTAGE_FRAGMENT, TEXTUREDIMENSION_2D, SAMPLETYPE_FLOAT), new BindTextureFormat('areaLightsLutTex1', SHADERSTAGE_FRAGMENT, TEXTUREDIMENSION_2D, SAMPLETYPE_FLOAT), new BindTextureFormat('areaLightsLutTex2', SHADERSTAGE_FRAGMENT, TEXTUREDIMENSION_2D, SAMPLETYPE_FLOAT)];
      if (isClustered) {
        textures.push(...[new BindTextureFormat('clusterWorldTexture', SHADERSTAGE_FRAGMENT, TEXTUREDIMENSION_2D, SAMPLETYPE_UNFILTERABLE_FLOAT)]);
      }
      this.viewBindGroupFormat = new BindGroupFormat(this.device, buffers, textures);
    }
  }
  setupViewUniformBuffers(viewBindGroups, viewUniformFormat, viewBindGroupFormat, viewCount) {
    Debug.assert(Array.isArray(viewBindGroups), "viewBindGroups must be an array");
    const device = this.device;
    Debug.assert(viewCount === 1, "This code does not handle the viewCount yet");
    while (viewBindGroups.length < viewCount) {
      const ub = new UniformBuffer(device, viewUniformFormat, false);
      const bg = new BindGroup(device, viewBindGroupFormat, ub);
      DebugHelper.setName(bg, `ViewBindGroup_${bg.id}`);
      viewBindGroups.push(bg);
    }

    // update view bind group / uniforms
    const viewBindGroup = viewBindGroups[0];
    viewBindGroup.defaultUniformBuffer.update();
    viewBindGroup.update();

    // TODO; this needs to be moved to drawInstance functions to handle XR
    device.setBindGroup(BINDGROUP_VIEW, viewBindGroup);
  }
  setupMeshUniformBuffers(shaderInstance, meshInstance) {
    const device = this.device;
    if (device.supportsUniformBuffers) {
      // TODO: model matrix setup is part of the drawInstance call, but with uniform buffer it's needed
      // earlier here. This needs to be refactored for multi-view anyways.
      this.modelMatrixId.setValue(meshInstance.node.worldTransform.data);
      this.normalMatrixId.setValue(meshInstance.node.normalMatrix.data);

      // update mesh bind group / uniform buffer
      const meshBindGroup = shaderInstance.getBindGroup(device);
      meshBindGroup.defaultUniformBuffer.update();
      meshBindGroup.update();
      device.setBindGroup(BINDGROUP_MESH, meshBindGroup);
    }
  }
  drawInstance(device, meshInstance, mesh, style, normal) {
    DebugGraphics.pushGpuMarker(device, meshInstance.node.name);
    const instancingData = meshInstance.instancingData;
    if (instancingData) {
      if (instancingData.count > 0) {
        this._instancedDrawCalls++;
        device.setVertexBuffer(instancingData.vertexBuffer);
        device.draw(mesh.primitive[style], instancingData.count);
      }
    } else {
      const modelMatrix = meshInstance.node.worldTransform;
      this.modelMatrixId.setValue(modelMatrix.data);
      if (normal) {
        this.normalMatrixId.setValue(meshInstance.node.normalMatrix.data);
      }
      device.draw(mesh.primitive[style]);
    }
    DebugGraphics.popGpuMarker(device);
  }

  // used for stereo
  drawInstance2(device, meshInstance, mesh, style) {
    DebugGraphics.pushGpuMarker(device, meshInstance.node.name);
    const instancingData = meshInstance.instancingData;
    if (instancingData) {
      if (instancingData.count > 0) {
        this._instancedDrawCalls++;
        device.draw(mesh.primitive[style], instancingData.count, true);
      }
    } else {
      // matrices are already set
      device.draw(mesh.primitive[style], undefined, true);
    }
    DebugGraphics.popGpuMarker(device);
  }

  /**
   * @param {import('../camera.js').Camera} camera - The camera used for culling.
   * @param {import('../mesh-instance.js').MeshInstance[]} drawCalls - Draw calls to cull.
   * @param {import('../layer.js').CulledInstances} culledInstances - Stores culled instances.
   */
  cull(camera, drawCalls, culledInstances) {
    const cullTime = now();
    const opaque = culledInstances.opaque;
    opaque.length = 0;
    const transparent = culledInstances.transparent;
    transparent.length = 0;
    const doCull = camera.frustumCulling;
    const count = drawCalls.length;
    for (let i = 0; i < count; i++) {
      const drawCall = drawCalls[i];
      if (drawCall.visible) {
        const visible = !doCull || !drawCall.cull || drawCall._isVisible(camera);
        if (visible) {
          drawCall.visibleThisFrame = true;

          // sort mesh instance into the right bucket based on its transparency
          const bucket = drawCall.transparent ? transparent : opaque;
          bucket.push(drawCall);
          if (drawCall.skinInstance || drawCall.morphInstance) this.processingMeshInstances.add(drawCall);
        }
      }
    }
    this._cullTime += now() - cullTime;
    this._numDrawCallsCulled += doCull ? count : 0;
  }
  collectLights(comp) {
    // build a list and of all unique lights from all layers
    this.lights.length = 0;
    this.localLights.length = 0;

    // stats
    const stats = this.scene._stats;
    stats.dynamicLights = 0;
    stats.bakedLights = 0;
    const count = comp.layerList.length;
    for (let i = 0; i < count; i++) {
      const layer = comp.layerList[i];

      // layer can be in the list two times (opaque, transp), process it only one time
      if (!_tempLayerSet.has(layer)) {
        _tempLayerSet.add(layer);
        const lights = layer._lights;
        for (let j = 0; j < lights.length; j++) {
          const light = lights[j];

          // add new light
          if (!_tempLightSet.has(light)) {
            _tempLightSet.add(light);
            this.lights.push(light);
            if (light._type !== LIGHTTYPE_DIRECTIONAL) {
              this.localLights.push(light);
            }

            // if affects dynamic or baked objects in real-time
            if (light.mask & MASK_AFFECT_DYNAMIC || light.mask & MASK_AFFECT_LIGHTMAPPED) {
              stats.dynamicLights++;
            }

            // bake lights
            if (light.mask & MASK_BAKE) {
              stats.bakedLights++;
            }
          }
        }
      }
    }
    stats.lights = this.lights.length;
    _tempLightSet.clear();
    _tempLayerSet.clear();
  }
  cullLights(camera, lights) {
    const clusteredLightingEnabled = this.scene.clusteredLightingEnabled;
    const physicalUnits = this.scene.physicalUnits;
    for (let i = 0; i < lights.length; i++) {
      const light = lights[i];
      if (light.enabled) {
        // directional lights are marked visible at the start of the frame
        if (light._type !== LIGHTTYPE_DIRECTIONAL) {
          light.getBoundingSphere(tempSphere);
          if (camera.frustum.containsSphere(tempSphere)) {
            light.visibleThisFrame = true;
            light.usePhysicalUnits = physicalUnits;

            // maximum screen area taken by the light
            const screenSize = camera.getScreenSize(tempSphere);
            light.maxScreenSize = Math.max(light.maxScreenSize, screenSize);
          } else {
            // if shadow casting light does not have shadow map allocated, mark it visible to allocate shadow map
            // Note: This won't be needed when clustered shadows are used, but at the moment even culled out lights
            // are used for rendering, and need shadow map to be allocated
            // TODO: delete this code when clusteredLightingEnabled is being removed and is on by default.
            if (!clusteredLightingEnabled) {
              if (light.castShadows && !light.shadowMap) {
                light.visibleThisFrame = true;
              }
            }
          }
        } else {
          light.usePhysicalUnits = this.scene.physicalUnits;
        }
      }
    }
  }

  /**
   * Shadow map culling for directional and visible local lights
   * visible meshInstances are collected into light._renderData, and are marked as visible
   * for directional lights also shadow camera matrix is set up
   *
   * @param {import('../composition/layer-composition.js').LayerComposition} comp - The layer
   * composition.
   */
  cullShadowmaps(comp) {
    const isClustered = this.scene.clusteredLightingEnabled;

    // shadow casters culling for local (point and spot) lights
    for (let i = 0; i < this.localLights.length; i++) {
      const light = this.localLights[i];
      if (light._type !== LIGHTTYPE_DIRECTIONAL) {
        if (isClustered) {
          // if atlas slot is reassigned, make sure to update the shadow map, including the culling
          if (light.atlasSlotUpdated && light.shadowUpdateMode === SHADOWUPDATE_NONE) {
            light.shadowUpdateMode = SHADOWUPDATE_THISFRAME;
          }
        } else {
          // force rendering shadow at least once to allocate the shadow map needed by the shaders
          if (light.shadowUpdateMode === SHADOWUPDATE_NONE && light.castShadows) {
            if (!light.getRenderData(null, 0).shadowCamera.renderTarget) {
              light.shadowUpdateMode = SHADOWUPDATE_THISFRAME;
            }
          }
        }
        if (light.visibleThisFrame && light.castShadows && light.shadowUpdateMode !== SHADOWUPDATE_NONE) {
          this._shadowRendererLocal.cull(light, comp);
        }
      }
    }

    // shadow casters culling for directional lights
    const renderActions = comp._renderActions;
    for (let i = 0; i < renderActions.length; i++) {
      const renderAction = renderActions[i];
      renderAction.directionalLights.length = 0;
      const camera = renderAction.camera.camera;

      // first use of each camera renders directional shadows
      if (renderAction.firstCameraUse) {
        // get directional lights from all layers of the camera
        const cameraLayers = camera.layers;
        for (let l = 0; l < cameraLayers.length; l++) {
          const cameraLayer = comp.getLayerById(cameraLayers[l]);
          if (cameraLayer) {
            const layerDirLights = cameraLayer.splitLights[LIGHTTYPE_DIRECTIONAL];
            for (let j = 0; j < layerDirLights.length; j++) {
              const light = layerDirLights[j];

              // unique shadow casting lights
              if (light.castShadows && !_tempSet.has(light)) {
                _tempSet.add(light);
                renderAction.directionalLights.push(light);

                // frustum culling for the directional shadow when rendering the camera
                this._shadowRendererDirectional.cull(light, comp, camera);
              }
            }
          }
        }
        _tempSet.clear();
      }
    }
  }

  /**
   * visibility culling of lights, meshInstances, shadows casters
   * Also applies meshInstance.visible
   *
   * @param {import('../composition/layer-composition.js').LayerComposition} comp - The layer
   * composition.
   */
  cullComposition(comp) {
    const cullTime = now();
    this.processingMeshInstances.clear();
    const renderActions = comp._renderActions;
    for (let i = 0; i < renderActions.length; i++) {
      /** @type {import('../composition/render-action.js').RenderAction} */
      const renderAction = renderActions[i];

      // layer
      const layerIndex = renderAction.layerIndex;
      /** @type {import('../layer.js').Layer} */
      const layer = comp.layerList[layerIndex];
      if (!layer.enabled || !comp.subLayerEnabled[layerIndex]) continue;

      // camera
      const cameraPass = renderAction.cameraIndex;
      /** @type {import('../../framework/components/camera/component.js').CameraComponent} */
      const camera = layer.cameras[cameraPass];
      if (camera) {
        camera.frameUpdate(renderAction.renderTarget);

        // update camera and frustum once
        if (renderAction.firstCameraUse) {
          this.updateCameraFrustum(camera.camera);
          this._camerasRendered++;
        }

        // cull each layer's non-directional lights once with each camera
        // lights aren't collected anywhere, but marked as visible
        this.cullLights(camera.camera, layer._lights);

        // cull mesh instances
        layer.onPreCull == null ? void 0 : layer.onPreCull(cameraPass);
        const culledInstances = layer.getCulledInstances(camera.camera);
        const drawCalls = layer.meshInstances;
        this.cull(camera.camera, drawCalls, culledInstances);
        layer.onPostCull == null ? void 0 : layer.onPostCull(cameraPass);
      }
    }

    // update shadow / cookie atlas allocation for the visible lights. Update it after the ligthts were culled,
    // but before shadow maps were culling, as it might force some 'update once' shadows to cull.
    if (this.scene.clusteredLightingEnabled) {
      this.updateLightTextureAtlas();
    }

    // cull shadow casters for all lights
    this.cullShadowmaps(comp);
    this._cullTime += now() - cullTime;
  }

  /**
   * @param {import('../mesh-instance.js').MeshInstance[]} drawCalls - Mesh instances.
   * @param {boolean} onlyLitShaders - Limits the update to shaders affected by lighting.
   */
  updateShaders(drawCalls, onlyLitShaders) {
    const count = drawCalls.length;
    for (let i = 0; i < count; i++) {
      const mat = drawCalls[i].material;
      if (mat) {
        // material not processed yet
        if (!_tempSet.has(mat)) {
          _tempSet.add(mat);

          // skip this for materials not using variants
          if (mat.getShaderVariant !== Material.prototype.getShaderVariant) {
            if (onlyLitShaders) {
              // skip materials not using lighting
              if (!mat.useLighting || mat.emitter && !mat.emitter.lighting) continue;
            }

            // clear shader variants on the material and also on mesh instances that use it
            mat.clearVariants();
          }
        }
      }
    }

    // keep temp set empty
    _tempSet.clear();
  }
  renderCookies(lights) {
    this._cookieRenderer.render(lights);
  }

  /**
   * @param {import('../composition/layer-composition.js').LayerComposition} comp - The layer
   * composition to update.
   */
  beginFrame(comp) {
    const scene = this.scene;
    const updateShaders = scene.updateShaders;
    let totalMeshInstances = 0;
    const layers = comp.layerList;
    const layerCount = layers.length;
    for (let i = 0; i < layerCount; i++) {
      const layer = layers[i];
      const meshInstances = layer.meshInstances;
      const count = meshInstances.length;
      totalMeshInstances += count;
      for (let j = 0; j < count; j++) {
        const meshInst = meshInstances[j];

        // clear visibility
        meshInst.visibleThisFrame = false;

        // collect all mesh instances if we need to update their shaders. Note that there could
        // be duplicates, which is not a problem for the shader updates, so we do not filter them out.
        if (updateShaders) {
          _tempMeshInstances.push(meshInst);
        }

        // collect skinned mesh instances
        if (meshInst.skinInstance) {
          _tempMeshInstancesSkinned.push(meshInst);
        }
      }
    }
    scene._stats.meshInstances = totalMeshInstances;

    // update shaders if needed
    if (updateShaders) {
      const onlyLitShaders = !scene.updateShaders;
      this.updateShaders(_tempMeshInstances, onlyLitShaders);
      scene.updateShaders = false;
      scene._shaderVersion++;
    }

    // Update all skin matrices to properly cull skinned objects (but don't update rendering data yet)
    this.updateCpuSkinMatrices(_tempMeshInstancesSkinned);

    // clear light arrays
    _tempMeshInstances.length = 0;
    _tempMeshInstancesSkinned.length = 0;

    // clear light visibility
    const lights = this.lights;
    const lightCount = lights.length;
    for (let i = 0; i < lightCount; i++) {
      lights[i].beginFrame();
    }
  }

  /**
   * @param {import('../composition/layer-composition.js').LayerComposition} comp - The layer
   * composition.
   */
  updateLightTextureAtlas() {
    this.lightTextureAtlas.update(this.localLights, this.scene.lighting);
  }

  /**
   * @param {import('../composition/layer-composition.js').LayerComposition} comp - The layer
   * composition.
   */
  updateClusters(comp) {
    const startTime = now();
    const renderActions = comp._renderActions;
    this.worldClustersAllocator.update(renderActions, this.scene.gammaCorrection, this.scene.lighting);
    this._lightClustersTime += now() - startTime;
    this._lightClusters = this.worldClustersAllocator.count;
  }

  /**
   * Updates the layer composition for rendering.
   *
   * @param {import('../composition/layer-composition.js').LayerComposition} comp - The layer
   * composition to update.
   * @param {boolean} clusteredLightingEnabled - True if clustered lighting is enabled.
   * @ignore
   */
  updateLayerComposition(comp, clusteredLightingEnabled) {
    const layerCompositionUpdateTime = now();
    const len = comp.layerList.length;
    for (let i = 0; i < len; i++) {
      comp.layerList[i]._postRenderCounter = 0;
    }
    const scene = this.scene;
    const shaderVersion = scene._shaderVersion;
    for (let i = 0; i < len; i++) {
      const layer = comp.layerList[i];
      layer._shaderVersion = shaderVersion;
      layer._skipRenderCounter = 0;
      layer._forwardDrawCalls = 0;
      layer._shadowDrawCalls = 0;
      layer._renderTime = 0;
      layer._preRenderCalledForCameras = 0;
      layer._postRenderCalledForCameras = 0;
      const transparent = comp.subLayerList[i];
      if (transparent) {
        layer._postRenderCounter |= 2;
      } else {
        layer._postRenderCounter |= 1;
      }
      layer._postRenderCounterMax = layer._postRenderCounter;
    }

    // update composition
    comp._update();
    this._layerCompositionUpdateTime += now() - layerCompositionUpdateTime;
  }
  frameUpdate() {
    this.clustersDebugRendered = false;
    this.initViewBindGroupFormat(this.scene.clusteredLightingEnabled);
  }
}

export { Renderer };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVuZGVyZXIuanMiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9zY2VuZS9yZW5kZXJlci9yZW5kZXJlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBEZWJ1ZywgRGVidWdIZWxwZXIgfSBmcm9tICcuLi8uLi9jb3JlL2RlYnVnLmpzJztcbmltcG9ydCB7IG5vdyB9IGZyb20gJy4uLy4uL2NvcmUvdGltZS5qcyc7XG5pbXBvcnQgeyBWZWMzIH0gZnJvbSAnLi4vLi4vY29yZS9tYXRoL3ZlYzMuanMnO1xuaW1wb3J0IHsgTWF0MyB9IGZyb20gJy4uLy4uL2NvcmUvbWF0aC9tYXQzLmpzJztcbmltcG9ydCB7IE1hdDQgfSBmcm9tICcuLi8uLi9jb3JlL21hdGgvbWF0NC5qcyc7XG5pbXBvcnQgeyBCb3VuZGluZ1NwaGVyZSB9IGZyb20gJy4uLy4uL2NvcmUvc2hhcGUvYm91bmRpbmctc3BoZXJlLmpzJztcblxuaW1wb3J0IHtcbiAgICBTT1JUS0VZX0RFUFRILCBTT1JUS0VZX0ZPUldBUkQsXG4gICAgVklFV19DRU5URVIsIFBST0pFQ1RJT05fT1JUSE9HUkFQSElDLFxuICAgIExJR0hUVFlQRV9ESVJFQ1RJT05BTCwgTUFTS19BRkZFQ1RfRFlOQU1JQywgTUFTS19BRkZFQ1RfTElHSFRNQVBQRUQsIE1BU0tfQkFLRSxcbiAgICBTSEFET1dVUERBVEVfTk9ORSwgU0hBRE9XVVBEQVRFX1RISVNGUkFNRVxufSBmcm9tICcuLi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgTGlnaHRUZXh0dXJlQXRsYXMgfSBmcm9tICcuLi9saWdodGluZy9saWdodC10ZXh0dXJlLWF0bGFzLmpzJztcbmltcG9ydCB7IE1hdGVyaWFsIH0gZnJvbSAnLi4vbWF0ZXJpYWxzL21hdGVyaWFsLmpzJztcbmltcG9ydCB7IExpZ2h0Q3ViZSB9IGZyb20gJy4uL2dyYXBoaWNzL2xpZ2h0LWN1YmUuanMnO1xuXG5pbXBvcnQge1xuICAgIENMRUFSRkxBR19DT0xPUiwgQ0xFQVJGTEFHX0RFUFRILCBDTEVBUkZMQUdfU1RFTkNJTCxcbiAgICBCSU5ER1JPVVBfTUVTSCwgQklOREdST1VQX1ZJRVcsIFVOSUZPUk1fQlVGRkVSX0RFRkFVTFRfU0xPVF9OQU1FLFxuICAgIFVOSUZPUk1UWVBFX01BVDQsIFVOSUZPUk1UWVBFX01BVDMsIFVOSUZPUk1UWVBFX1ZFQzMsIFVOSUZPUk1UWVBFX1ZFQzIsIFVOSUZPUk1UWVBFX0ZMT0FULCBVTklGT1JNVFlQRV9JTlQsXG4gICAgU0hBREVSU1RBR0VfVkVSVEVYLCBTSEFERVJTVEFHRV9GUkFHTUVOVCxcbiAgICBTRU1BTlRJQ19BVFRSLFxuICAgIENVTExGQUNFX0JBQ0ssIENVTExGQUNFX0ZST05ULCBDVUxMRkFDRV9OT05FLFxuICAgIFRFWFRVUkVESU1FTlNJT05fMkQsIFNBTVBMRVRZUEVfVU5GSUxURVJBQkxFX0ZMT0FULCBTQU1QTEVUWVBFX0ZMT0FULCBTQU1QTEVUWVBFX0RFUFRIXG59IGZyb20gJy4uLy4uL3BsYXRmb3JtL2dyYXBoaWNzL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBEZWJ1Z0dyYXBoaWNzIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vZ3JhcGhpY3MvZGVidWctZ3JhcGhpY3MuanMnO1xuaW1wb3J0IHsgVW5pZm9ybUJ1ZmZlciB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2dyYXBoaWNzL3VuaWZvcm0tYnVmZmVyLmpzJztcbmltcG9ydCB7IEJpbmRHcm91cCB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2dyYXBoaWNzL2JpbmQtZ3JvdXAuanMnO1xuaW1wb3J0IHsgVW5pZm9ybUZvcm1hdCwgVW5pZm9ybUJ1ZmZlckZvcm1hdCB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2dyYXBoaWNzL3VuaWZvcm0tYnVmZmVyLWZvcm1hdC5qcyc7XG5pbXBvcnQgeyBCaW5kR3JvdXBGb3JtYXQsIEJpbmRCdWZmZXJGb3JtYXQsIEJpbmRUZXh0dXJlRm9ybWF0IH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vZ3JhcGhpY3MvYmluZC1ncm91cC1mb3JtYXQuanMnO1xuXG5pbXBvcnQgeyBTaGFkb3dNYXBDYWNoZSB9IGZyb20gJy4vc2hhZG93LW1hcC1jYWNoZS5qcyc7XG5pbXBvcnQgeyBTaGFkb3dSZW5kZXJlckxvY2FsIH0gZnJvbSAnLi9zaGFkb3ctcmVuZGVyZXItbG9jYWwuanMnO1xuaW1wb3J0IHsgU2hhZG93UmVuZGVyZXJEaXJlY3Rpb25hbCB9IGZyb20gJy4vc2hhZG93LXJlbmRlcmVyLWRpcmVjdGlvbmFsLmpzJztcbmltcG9ydCB7IENvb2tpZVJlbmRlcmVyIH0gZnJvbSAnLi9jb29raWUtcmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgU2hhZG93UmVuZGVyZXIgfSBmcm9tICcuL3NoYWRvdy1yZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBXb3JsZENsdXN0ZXJzQWxsb2NhdG9yIH0gZnJvbSAnLi93b3JsZC1jbHVzdGVycy1hbGxvY2F0b3IuanMnO1xuXG5sZXQgX3NraW5VcGRhdGVJbmRleCA9IDA7XG5jb25zdCBib25lVGV4dHVyZVNpemUgPSBbMCwgMCwgMCwgMF07XG5jb25zdCB2aWV3UHJvak1hdCA9IG5ldyBNYXQ0KCk7XG5jb25zdCB2aWV3SW52TWF0ID0gbmV3IE1hdDQoKTtcbmNvbnN0IHZpZXdNYXQgPSBuZXcgTWF0NCgpO1xuY29uc3Qgdmlld01hdDMgPSBuZXcgTWF0MygpO1xuY29uc3QgdGVtcFNwaGVyZSA9IG5ldyBCb3VuZGluZ1NwaGVyZSgpO1xuY29uc3QgX2ZsaXBZTWF0ID0gbmV3IE1hdDQoKS5zZXRTY2FsZSgxLCAtMSwgMSk7XG5jb25zdCBfdGVtcExpZ2h0U2V0ID0gbmV3IFNldCgpO1xuY29uc3QgX3RlbXBMYXllclNldCA9IG5ldyBTZXQoKTtcblxuLy8gQ29udmVydHMgYSBwcm9qZWN0aW9uIG1hdHJpeCBpbiBPcGVuR0wgc3R5bGUgKGRlcHRoIHJhbmdlIG9mIC0xLi4xKSB0byBhIERpcmVjdFggc3R5bGUgKGRlcHRoIHJhbmdlIG9mIDAuLjEpLlxuY29uc3QgX2ZpeFByb2pSYW5nZU1hdCA9IG5ldyBNYXQ0KCkuc2V0KFtcbiAgICAxLCAwLCAwLCAwLFxuICAgIDAsIDEsIDAsIDAsXG4gICAgMCwgMCwgMC41LCAwLFxuICAgIDAsIDAsIDAuNSwgMVxuXSk7XG5cbmNvbnN0IF90ZW1wUHJvak1hdDAgPSBuZXcgTWF0NCgpO1xuY29uc3QgX3RlbXBQcm9qTWF0MSA9IG5ldyBNYXQ0KCk7XG5jb25zdCBfdGVtcFByb2pNYXQyID0gbmV3IE1hdDQoKTtcbmNvbnN0IF90ZW1wUHJvak1hdDMgPSBuZXcgTWF0NCgpO1xuY29uc3QgX3RlbXBTZXQgPSBuZXcgU2V0KCk7XG5cbmNvbnN0IF90ZW1wTWVzaEluc3RhbmNlcyA9IFtdO1xuY29uc3QgX3RlbXBNZXNoSW5zdGFuY2VzU2tpbm5lZCA9IFtdO1xuXG4vKipcbiAqIFRoZSBiYXNlIHJlbmRlcmVyIGZ1bmN0aW9uYWxpdHkgdG8gYWxsb3cgaW1wbGVtZW50YXRpb24gb2Ygc3BlY2lhbGl6ZWQgcmVuZGVyZXJzLlxuICpcbiAqIEBpZ25vcmVcbiAqL1xuY2xhc3MgUmVuZGVyZXIge1xuICAgIC8qKiBAdHlwZSB7Ym9vbGVhbn0gKi9cbiAgICBjbHVzdGVyc0RlYnVnUmVuZGVyZWQgPSBmYWxzZTtcblxuICAgIC8qKlxuICAgICAqIEEgc2V0IG9mIHZpc2libGUgbWVzaCBpbnN0YW5jZXMgd2hpY2ggbmVlZCBmdXJ0aGVyIHByb2Nlc3NpbmcgYmVmb3JlIGJlaW5nIHJlbmRlcmVkLCBlLmcuXG4gICAgICogc2tpbm5pbmcgb3IgbW9ycGhpbmcuIEV4dHJhY3RlZCBkdXJpbmcgY3VsbGluZy5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtTZXQ8aW1wb3J0KCcuLi9tZXNoLWluc3RhbmNlLmpzJykuTWVzaEluc3RhbmNlPn1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIHByb2Nlc3NpbmdNZXNoSW5zdGFuY2VzID0gbmV3IFNldCgpO1xuXG4gICAgLyoqXG4gICAgICogQHR5cGUge1dvcmxkQ2x1c3RlcnNBbGxvY2F0b3J9XG4gICAgICogQGlnbm9yZVxuICAgICAqL1xuICAgIHdvcmxkQ2x1c3RlcnNBbGxvY2F0b3I7XG5cbiAgICAvKipcbiAgICAgKiBBIGxpc3Qgb2YgYWxsIHVuaXF1ZSBsaWdodHMgaW4gdGhlIGxheWVyIGNvbXBvc2l0aW9uLlxuICAgICAqXG4gICAgICogQHR5cGUge2ltcG9ydCgnLi4vbGlnaHQuanMnKS5MaWdodFtdfVxuICAgICAqL1xuICAgIGxpZ2h0cyA9IFtdO1xuXG4gICAgLyoqXG4gICAgICogQSBsaXN0IG9mIGFsbCB1bmlxdWUgbG9jYWwgbGlnaHRzIChzcG90ICYgb21uaSkgaW4gdGhlIGxheWVyIGNvbXBvc2l0aW9uLlxuICAgICAqXG4gICAgICogQHR5cGUge2ltcG9ydCgnLi4vbGlnaHQuanMnKS5MaWdodFtdfVxuICAgICAqL1xuICAgIGxvY2FsTGlnaHRzID0gW107XG5cbiAgICAvKipcbiAgICAgKiBDcmVhdGUgYSBuZXcgaW5zdGFuY2UuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi4vLi4vcGxhdGZvcm0vZ3JhcGhpY3MvZ3JhcGhpY3MtZGV2aWNlLmpzJykuR3JhcGhpY3NEZXZpY2V9IGdyYXBoaWNzRGV2aWNlIC0gVGhlXG4gICAgICogZ3JhcGhpY3MgZGV2aWNlIHVzZWQgYnkgdGhlIHJlbmRlcmVyLlxuICAgICAqL1xuICAgIGNvbnN0cnVjdG9yKGdyYXBoaWNzRGV2aWNlKSB7XG4gICAgICAgIHRoaXMuZGV2aWNlID0gZ3JhcGhpY3NEZXZpY2U7XG5cbiAgICAgICAgLyoqIEB0eXBlIHtpbXBvcnQoJy4uL3NjZW5lLmpzJykuU2NlbmV8bnVsbH0gKi9cbiAgICAgICAgdGhpcy5zY2VuZSA9IG51bGw7XG5cbiAgICAgICAgLy8gVE9ETzogYWxsb2NhdGUgb25seSB3aGVuIHRoZSBzY2VuZSBoYXMgY2x1c3RlcmVkIGxpZ2h0aW5nIGVuYWJsZWRcbiAgICAgICAgdGhpcy53b3JsZENsdXN0ZXJzQWxsb2NhdG9yID0gbmV3IFdvcmxkQ2x1c3RlcnNBbGxvY2F0b3IoZ3JhcGhpY3NEZXZpY2UpO1xuXG4gICAgICAgIC8vIHRleHR1cmUgYXRsYXMgbWFuYWdpbmcgc2hhZG93IG1hcCAvIGNvb2tpZSB0ZXh0dXJlIGF0bGFzc2luZyBmb3Igb21uaSBhbmQgc3BvdCBsaWdodHNcbiAgICAgICAgdGhpcy5saWdodFRleHR1cmVBdGxhcyA9IG5ldyBMaWdodFRleHR1cmVBdGxhcyhncmFwaGljc0RldmljZSk7XG5cbiAgICAgICAgLy8gc2hhZG93c1xuICAgICAgICB0aGlzLnNoYWRvd01hcENhY2hlID0gbmV3IFNoYWRvd01hcENhY2hlKCk7XG4gICAgICAgIHRoaXMuc2hhZG93UmVuZGVyZXIgPSBuZXcgU2hhZG93UmVuZGVyZXIodGhpcywgdGhpcy5saWdodFRleHR1cmVBdGxhcyk7XG4gICAgICAgIHRoaXMuX3NoYWRvd1JlbmRlcmVyTG9jYWwgPSBuZXcgU2hhZG93UmVuZGVyZXJMb2NhbCh0aGlzLCB0aGlzLnNoYWRvd1JlbmRlcmVyKTtcbiAgICAgICAgdGhpcy5fc2hhZG93UmVuZGVyZXJEaXJlY3Rpb25hbCA9IG5ldyBTaGFkb3dSZW5kZXJlckRpcmVjdGlvbmFsKHRoaXMsIHRoaXMuc2hhZG93UmVuZGVyZXIpO1xuXG4gICAgICAgIC8vIGNvb2tpZXNcbiAgICAgICAgdGhpcy5fY29va2llUmVuZGVyZXIgPSBuZXcgQ29va2llUmVuZGVyZXIoZ3JhcGhpY3NEZXZpY2UsIHRoaXMubGlnaHRUZXh0dXJlQXRsYXMpO1xuXG4gICAgICAgIC8vIHZpZXcgYmluZCBncm91cCBmb3JtYXQgd2l0aCBpdHMgdW5pZm9ybSBidWZmZXIgZm9ybWF0XG4gICAgICAgIHRoaXMudmlld1VuaWZvcm1Gb3JtYXQgPSBudWxsO1xuICAgICAgICB0aGlzLnZpZXdCaW5kR3JvdXBGb3JtYXQgPSBudWxsO1xuXG4gICAgICAgIC8vIHRpbWluZ1xuICAgICAgICB0aGlzLl9za2luVGltZSA9IDA7XG4gICAgICAgIHRoaXMuX21vcnBoVGltZSA9IDA7XG4gICAgICAgIHRoaXMuX2N1bGxUaW1lID0gMDtcbiAgICAgICAgdGhpcy5fc2hhZG93TWFwVGltZSA9IDA7XG4gICAgICAgIHRoaXMuX2xpZ2h0Q2x1c3RlcnNUaW1lID0gMDtcbiAgICAgICAgdGhpcy5fbGF5ZXJDb21wb3NpdGlvblVwZGF0ZVRpbWUgPSAwO1xuXG4gICAgICAgIC8vIHN0YXRzXG4gICAgICAgIHRoaXMuX3NoYWRvd0RyYXdDYWxscyA9IDA7XG4gICAgICAgIHRoaXMuX3NraW5EcmF3Q2FsbHMgPSAwO1xuICAgICAgICB0aGlzLl9pbnN0YW5jZWREcmF3Q2FsbHMgPSAwO1xuICAgICAgICB0aGlzLl9zaGFkb3dNYXBVcGRhdGVzID0gMDtcbiAgICAgICAgdGhpcy5fbnVtRHJhd0NhbGxzQ3VsbGVkID0gMDtcbiAgICAgICAgdGhpcy5fY2FtZXJhc1JlbmRlcmVkID0gMDtcbiAgICAgICAgdGhpcy5fbGlnaHRDbHVzdGVycyA9IDA7XG5cbiAgICAgICAgLy8gVW5pZm9ybXNcbiAgICAgICAgY29uc3Qgc2NvcGUgPSBncmFwaGljc0RldmljZS5zY29wZTtcbiAgICAgICAgdGhpcy5ib25lVGV4dHVyZUlkID0gc2NvcGUucmVzb2x2ZSgndGV4dHVyZV9wb3NlTWFwJyk7XG4gICAgICAgIHRoaXMuYm9uZVRleHR1cmVTaXplSWQgPSBzY29wZS5yZXNvbHZlKCd0ZXh0dXJlX3Bvc2VNYXBTaXplJyk7XG4gICAgICAgIHRoaXMucG9zZU1hdHJpeElkID0gc2NvcGUucmVzb2x2ZSgnbWF0cml4X3Bvc2VbMF0nKTtcblxuICAgICAgICB0aGlzLm1vZGVsTWF0cml4SWQgPSBzY29wZS5yZXNvbHZlKCdtYXRyaXhfbW9kZWwnKTtcbiAgICAgICAgdGhpcy5ub3JtYWxNYXRyaXhJZCA9IHNjb3BlLnJlc29sdmUoJ21hdHJpeF9ub3JtYWwnKTtcbiAgICAgICAgdGhpcy52aWV3SW52SWQgPSBzY29wZS5yZXNvbHZlKCdtYXRyaXhfdmlld0ludmVyc2UnKTtcbiAgICAgICAgdGhpcy52aWV3UG9zID0gbmV3IEZsb2F0MzJBcnJheSgzKTtcbiAgICAgICAgdGhpcy52aWV3UG9zSWQgPSBzY29wZS5yZXNvbHZlKCd2aWV3X3Bvc2l0aW9uJyk7XG4gICAgICAgIHRoaXMucHJvaklkID0gc2NvcGUucmVzb2x2ZSgnbWF0cml4X3Byb2plY3Rpb24nKTtcbiAgICAgICAgdGhpcy5wcm9qU2t5Ym94SWQgPSBzY29wZS5yZXNvbHZlKCdtYXRyaXhfcHJvamVjdGlvblNreWJveCcpO1xuICAgICAgICB0aGlzLnZpZXdJZCA9IHNjb3BlLnJlc29sdmUoJ21hdHJpeF92aWV3Jyk7XG4gICAgICAgIHRoaXMudmlld0lkMyA9IHNjb3BlLnJlc29sdmUoJ21hdHJpeF92aWV3MycpO1xuICAgICAgICB0aGlzLnZpZXdQcm9qSWQgPSBzY29wZS5yZXNvbHZlKCdtYXRyaXhfdmlld1Byb2plY3Rpb24nKTtcbiAgICAgICAgdGhpcy5mbGlwWUlkID0gc2NvcGUucmVzb2x2ZSgncHJvamVjdGlvbkZsaXBZJyk7XG4gICAgICAgIHRoaXMudGJuQmFzaXMgPSBzY29wZS5yZXNvbHZlKCd0Ym5CYXNpcycpO1xuICAgICAgICB0aGlzLm5lYXJDbGlwSWQgPSBzY29wZS5yZXNvbHZlKCdjYW1lcmFfbmVhcicpO1xuICAgICAgICB0aGlzLmZhckNsaXBJZCA9IHNjb3BlLnJlc29sdmUoJ2NhbWVyYV9mYXInKTtcbiAgICAgICAgdGhpcy5jYW1lcmFQYXJhbXMgPSBuZXcgRmxvYXQzMkFycmF5KDQpO1xuICAgICAgICB0aGlzLmNhbWVyYVBhcmFtc0lkID0gc2NvcGUucmVzb2x2ZSgnY2FtZXJhX3BhcmFtcycpO1xuXG4gICAgICAgIHRoaXMuYWxwaGFUZXN0SWQgPSBzY29wZS5yZXNvbHZlKCdhbHBoYV9yZWYnKTtcbiAgICAgICAgdGhpcy5vcGFjaXR5TWFwSWQgPSBzY29wZS5yZXNvbHZlKCd0ZXh0dXJlX29wYWNpdHlNYXAnKTtcblxuICAgICAgICB0aGlzLmV4cG9zdXJlSWQgPSBzY29wZS5yZXNvbHZlKCdleHBvc3VyZScpO1xuICAgICAgICB0aGlzLnR3b1NpZGVkTGlnaHRpbmdOZWdTY2FsZUZhY3RvcklkID0gc2NvcGUucmVzb2x2ZSgndHdvU2lkZWRMaWdodGluZ05lZ1NjYWxlRmFjdG9yJyk7XG4gICAgICAgIHRoaXMudHdvU2lkZWRMaWdodGluZ05lZ1NjYWxlRmFjdG9ySWQuc2V0VmFsdWUoMCk7XG5cbiAgICAgICAgdGhpcy5tb3JwaFdlaWdodHNBID0gc2NvcGUucmVzb2x2ZSgnbW9ycGhfd2VpZ2h0c19hJyk7XG4gICAgICAgIHRoaXMubW9ycGhXZWlnaHRzQiA9IHNjb3BlLnJlc29sdmUoJ21vcnBoX3dlaWdodHNfYicpO1xuICAgICAgICB0aGlzLm1vcnBoUG9zaXRpb25UZXggPSBzY29wZS5yZXNvbHZlKCdtb3JwaFBvc2l0aW9uVGV4Jyk7XG4gICAgICAgIHRoaXMubW9ycGhOb3JtYWxUZXggPSBzY29wZS5yZXNvbHZlKCdtb3JwaE5vcm1hbFRleCcpO1xuICAgICAgICB0aGlzLm1vcnBoVGV4UGFyYW1zID0gc2NvcGUucmVzb2x2ZSgnbW9ycGhfdGV4X3BhcmFtcycpO1xuXG4gICAgICAgIC8vIGEgc2luZ2xlIGluc3RhbmNlIG9mIGxpZ2h0IGN1YmVcbiAgICAgICAgdGhpcy5saWdodEN1YmUgPSBuZXcgTGlnaHRDdWJlKCk7XG4gICAgICAgIHRoaXMuY29uc3RhbnRMaWdodEN1YmUgPSBzY29wZS5yZXNvbHZlKCdsaWdodEN1YmVbMF0nKTtcbiAgICB9XG5cbiAgICBkZXN0cm95KCkge1xuICAgICAgICB0aGlzLnNoYWRvd1JlbmRlcmVyID0gbnVsbDtcbiAgICAgICAgdGhpcy5fc2hhZG93UmVuZGVyZXJMb2NhbCA9IG51bGw7XG4gICAgICAgIHRoaXMuX3NoYWRvd1JlbmRlcmVyRGlyZWN0aW9uYWwgPSBudWxsO1xuXG4gICAgICAgIHRoaXMuc2hhZG93TWFwQ2FjaGUuZGVzdHJveSgpO1xuICAgICAgICB0aGlzLnNoYWRvd01hcENhY2hlID0gbnVsbDtcblxuICAgICAgICB0aGlzLl9jb29raWVSZW5kZXJlci5kZXN0cm95KCk7XG4gICAgICAgIHRoaXMuX2Nvb2tpZVJlbmRlcmVyID0gbnVsbDtcblxuICAgICAgICB0aGlzLmxpZ2h0VGV4dHVyZUF0bGFzLmRlc3Ryb3koKTtcbiAgICAgICAgdGhpcy5saWdodFRleHR1cmVBdGxhcyA9IG51bGw7XG4gICAgfVxuXG4gICAgc29ydENvbXBhcmUoZHJhd0NhbGxBLCBkcmF3Q2FsbEIpIHtcbiAgICAgICAgaWYgKGRyYXdDYWxsQS5sYXllciA9PT0gZHJhd0NhbGxCLmxheWVyKSB7XG4gICAgICAgICAgICBpZiAoZHJhd0NhbGxBLmRyYXdPcmRlciAmJiBkcmF3Q2FsbEIuZHJhd09yZGVyKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGRyYXdDYWxsQS5kcmF3T3JkZXIgLSBkcmF3Q2FsbEIuZHJhd09yZGVyO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChkcmF3Q2FsbEEuemRpc3QgJiYgZHJhd0NhbGxCLnpkaXN0KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGRyYXdDYWxsQi56ZGlzdCAtIGRyYXdDYWxsQS56ZGlzdDsgLy8gYmFjayB0byBmcm9udFxuICAgICAgICAgICAgfSBlbHNlIGlmIChkcmF3Q2FsbEEuemRpc3QyICYmIGRyYXdDYWxsQi56ZGlzdDIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZHJhd0NhbGxBLnpkaXN0MiAtIGRyYXdDYWxsQi56ZGlzdDI7IC8vIGZyb250IHRvIGJhY2tcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBkcmF3Q2FsbEIuX2tleVtTT1JUS0VZX0ZPUldBUkRdIC0gZHJhd0NhbGxBLl9rZXlbU09SVEtFWV9GT1JXQVJEXTtcbiAgICB9XG5cbiAgICBzb3J0Q29tcGFyZU1lc2goZHJhd0NhbGxBLCBkcmF3Q2FsbEIpIHtcbiAgICAgICAgaWYgKGRyYXdDYWxsQS5sYXllciA9PT0gZHJhd0NhbGxCLmxheWVyKSB7XG4gICAgICAgICAgICBpZiAoZHJhd0NhbGxBLmRyYXdPcmRlciAmJiBkcmF3Q2FsbEIuZHJhd09yZGVyKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGRyYXdDYWxsQS5kcmF3T3JkZXIgLSBkcmF3Q2FsbEIuZHJhd09yZGVyO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChkcmF3Q2FsbEEuemRpc3QgJiYgZHJhd0NhbGxCLnpkaXN0KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGRyYXdDYWxsQi56ZGlzdCAtIGRyYXdDYWxsQS56ZGlzdDsgLy8gYmFjayB0byBmcm9udFxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgY29uc3Qga2V5QSA9IGRyYXdDYWxsQS5fa2V5W1NPUlRLRVlfRk9SV0FSRF07XG4gICAgICAgIGNvbnN0IGtleUIgPSBkcmF3Q2FsbEIuX2tleVtTT1JUS0VZX0ZPUldBUkRdO1xuXG4gICAgICAgIGlmIChrZXlBID09PSBrZXlCICYmIGRyYXdDYWxsQS5tZXNoICYmIGRyYXdDYWxsQi5tZXNoKSB7XG4gICAgICAgICAgICByZXR1cm4gZHJhd0NhbGxCLm1lc2guaWQgLSBkcmF3Q2FsbEEubWVzaC5pZDtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBrZXlCIC0ga2V5QTtcbiAgICB9XG5cbiAgICBzb3J0Q29tcGFyZURlcHRoKGRyYXdDYWxsQSwgZHJhd0NhbGxCKSB7XG4gICAgICAgIGNvbnN0IGtleUEgPSBkcmF3Q2FsbEEuX2tleVtTT1JUS0VZX0RFUFRIXTtcbiAgICAgICAgY29uc3Qga2V5QiA9IGRyYXdDYWxsQi5fa2V5W1NPUlRLRVlfREVQVEhdO1xuXG4gICAgICAgIGlmIChrZXlBID09PSBrZXlCICYmIGRyYXdDYWxsQS5tZXNoICYmIGRyYXdDYWxsQi5tZXNoKSB7XG4gICAgICAgICAgICByZXR1cm4gZHJhd0NhbGxCLm1lc2guaWQgLSBkcmF3Q2FsbEEubWVzaC5pZDtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBrZXlCIC0ga2V5QTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXQgdXAgdGhlIHZpZXdwb3J0IGFuZCB0aGUgc2Npc3NvciBmb3IgY2FtZXJhIHJlbmRlcmluZy5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuLi9jYW1lcmEuanMnKS5DYW1lcmF9IGNhbWVyYSAtIFRoZSBjYW1lcmEgY29udGFpbmluZyB0aGUgdmlld3BvcnRcbiAgICAgKiBpbmZvcm1hdGlvbi5cbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi4vLi4vcGxhdGZvcm0vZ3JhcGhpY3MvcmVuZGVyLXRhcmdldC5qcycpLlJlbmRlclRhcmdldH0gW3JlbmRlclRhcmdldF0gLSBUaGVcbiAgICAgKiByZW5kZXIgdGFyZ2V0LiBOVUxMIGZvciB0aGUgZGVmYXVsdCBvbmUuXG4gICAgICovXG4gICAgc2V0dXBWaWV3cG9ydChjYW1lcmEsIHJlbmRlclRhcmdldCkge1xuXG4gICAgICAgIGNvbnN0IGRldmljZSA9IHRoaXMuZGV2aWNlO1xuICAgICAgICBEZWJ1Z0dyYXBoaWNzLnB1c2hHcHVNYXJrZXIoZGV2aWNlLCAnU0VUVVAtVklFV1BPUlQnKTtcblxuICAgICAgICBjb25zdCBwaXhlbFdpZHRoID0gcmVuZGVyVGFyZ2V0ID8gcmVuZGVyVGFyZ2V0LndpZHRoIDogZGV2aWNlLndpZHRoO1xuICAgICAgICBjb25zdCBwaXhlbEhlaWdodCA9IHJlbmRlclRhcmdldCA/IHJlbmRlclRhcmdldC5oZWlnaHQgOiBkZXZpY2UuaGVpZ2h0O1xuXG4gICAgICAgIGNvbnN0IHJlY3QgPSBjYW1lcmEucmVjdDtcbiAgICAgICAgbGV0IHggPSBNYXRoLmZsb29yKHJlY3QueCAqIHBpeGVsV2lkdGgpO1xuICAgICAgICBsZXQgeSA9IE1hdGguZmxvb3IocmVjdC55ICogcGl4ZWxIZWlnaHQpO1xuICAgICAgICBsZXQgdyA9IE1hdGguZmxvb3IocmVjdC56ICogcGl4ZWxXaWR0aCk7XG4gICAgICAgIGxldCBoID0gTWF0aC5mbG9vcihyZWN0LncgKiBwaXhlbEhlaWdodCk7XG4gICAgICAgIGRldmljZS5zZXRWaWV3cG9ydCh4LCB5LCB3LCBoKTtcblxuICAgICAgICAvLyB1c2Ugdmlld3BvcnQgcmVjdGFuZ2xlIGJ5IGRlZmF1bHQuIFVzZSBzY2lzc29yIHJlY3RhbmdsZSB3aGVuIHJlcXVpcmVkLlxuICAgICAgICBpZiAoY2FtZXJhLl9zY2lzc29yUmVjdENsZWFyKSB7XG4gICAgICAgICAgICBjb25zdCBzY2lzc29yUmVjdCA9IGNhbWVyYS5zY2lzc29yUmVjdDtcbiAgICAgICAgICAgIHggPSBNYXRoLmZsb29yKHNjaXNzb3JSZWN0LnggKiBwaXhlbFdpZHRoKTtcbiAgICAgICAgICAgIHkgPSBNYXRoLmZsb29yKHNjaXNzb3JSZWN0LnkgKiBwaXhlbEhlaWdodCk7XG4gICAgICAgICAgICB3ID0gTWF0aC5mbG9vcihzY2lzc29yUmVjdC56ICogcGl4ZWxXaWR0aCk7XG4gICAgICAgICAgICBoID0gTWF0aC5mbG9vcihzY2lzc29yUmVjdC53ICogcGl4ZWxIZWlnaHQpO1xuICAgICAgICB9XG4gICAgICAgIGRldmljZS5zZXRTY2lzc29yKHgsIHksIHcsIGgpO1xuXG4gICAgICAgIERlYnVnR3JhcGhpY3MucG9wR3B1TWFya2VyKGRldmljZSk7XG4gICAgfVxuXG4gICAgc2V0Q2FtZXJhVW5pZm9ybXMoY2FtZXJhLCB0YXJnZXQpIHtcblxuICAgICAgICAvLyBmbGlwcGluZyBwcm9qIG1hdHJpeFxuICAgICAgICBjb25zdCBmbGlwWSA9IHRhcmdldD8uZmxpcFk7XG5cbiAgICAgICAgbGV0IHZpZXdDb3VudCA9IDE7XG4gICAgICAgIGlmIChjYW1lcmEueHIgJiYgY2FtZXJhLnhyLnNlc3Npb24pIHtcbiAgICAgICAgICAgIGxldCB0cmFuc2Zvcm07XG4gICAgICAgICAgICBjb25zdCBwYXJlbnQgPSBjYW1lcmEuX25vZGUucGFyZW50O1xuICAgICAgICAgICAgaWYgKHBhcmVudClcbiAgICAgICAgICAgICAgICB0cmFuc2Zvcm0gPSBwYXJlbnQuZ2V0V29ybGRUcmFuc2Zvcm0oKTtcblxuICAgICAgICAgICAgY29uc3Qgdmlld3MgPSBjYW1lcmEueHIudmlld3M7XG4gICAgICAgICAgICB2aWV3Q291bnQgPSB2aWV3cy5sZW5ndGg7XG4gICAgICAgICAgICBmb3IgKGxldCB2ID0gMDsgdiA8IHZpZXdDb3VudDsgdisrKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdmlldyA9IHZpZXdzW3ZdO1xuXG4gICAgICAgICAgICAgICAgaWYgKHBhcmVudCkge1xuICAgICAgICAgICAgICAgICAgICB2aWV3LnZpZXdJbnZPZmZNYXQubXVsMih0cmFuc2Zvcm0sIHZpZXcudmlld0ludk1hdCk7XG4gICAgICAgICAgICAgICAgICAgIHZpZXcudmlld09mZk1hdC5jb3B5KHZpZXcudmlld0ludk9mZk1hdCkuaW52ZXJ0KCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgdmlldy52aWV3SW52T2ZmTWF0LmNvcHkodmlldy52aWV3SW52TWF0KTtcbiAgICAgICAgICAgICAgICAgICAgdmlldy52aWV3T2ZmTWF0LmNvcHkodmlldy52aWV3TWF0KTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB2aWV3LnZpZXdNYXQzLnNldEZyb21NYXQ0KHZpZXcudmlld09mZk1hdCk7XG4gICAgICAgICAgICAgICAgdmlldy5wcm9qVmlld09mZk1hdC5tdWwyKHZpZXcucHJvak1hdCwgdmlldy52aWV3T2ZmTWF0KTtcblxuICAgICAgICAgICAgICAgIHZpZXcucG9zaXRpb25bMF0gPSB2aWV3LnZpZXdJbnZPZmZNYXQuZGF0YVsxMl07XG4gICAgICAgICAgICAgICAgdmlldy5wb3NpdGlvblsxXSA9IHZpZXcudmlld0ludk9mZk1hdC5kYXRhWzEzXTtcbiAgICAgICAgICAgICAgICB2aWV3LnBvc2l0aW9uWzJdID0gdmlldy52aWV3SW52T2ZmTWF0LmRhdGFbMTRdO1xuXG4gICAgICAgICAgICAgICAgY2FtZXJhLmZydXN0dW0uc2V0RnJvbU1hdDQodmlldy5wcm9qVmlld09mZk1hdCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG5cbiAgICAgICAgICAgIC8vIFByb2plY3Rpb24gTWF0cml4XG4gICAgICAgICAgICBsZXQgcHJvak1hdCA9IGNhbWVyYS5wcm9qZWN0aW9uTWF0cml4O1xuICAgICAgICAgICAgaWYgKGNhbWVyYS5jYWxjdWxhdGVQcm9qZWN0aW9uKSB7XG4gICAgICAgICAgICAgICAgY2FtZXJhLmNhbGN1bGF0ZVByb2plY3Rpb24ocHJvak1hdCwgVklFV19DRU5URVIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbGV0IHByb2pNYXRTa3lib3ggPSBjYW1lcmEuZ2V0UHJvamVjdGlvbk1hdHJpeFNreWJveCgpO1xuXG4gICAgICAgICAgICAvLyBmbGlwIHByb2plY3Rpb24gbWF0cmljZXNcbiAgICAgICAgICAgIGlmIChmbGlwWSkge1xuICAgICAgICAgICAgICAgIHByb2pNYXQgPSBfdGVtcFByb2pNYXQwLm11bDIoX2ZsaXBZTWF0LCBwcm9qTWF0KTtcbiAgICAgICAgICAgICAgICBwcm9qTWF0U2t5Ym94ID0gX3RlbXBQcm9qTWF0MS5tdWwyKF9mbGlwWU1hdCwgcHJvak1hdFNreWJveCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIHVwZGF0ZSBkZXB0aCByYW5nZSBvZiBwcm9qZWN0aW9uIG1hdHJpY2VzICgtMS4uMSB0byAwLi4xKVxuICAgICAgICAgICAgaWYgKHRoaXMuZGV2aWNlLmlzV2ViR1BVKSB7XG4gICAgICAgICAgICAgICAgcHJvak1hdCA9IF90ZW1wUHJvak1hdDIubXVsMihfZml4UHJvalJhbmdlTWF0LCBwcm9qTWF0KTtcbiAgICAgICAgICAgICAgICBwcm9qTWF0U2t5Ym94ID0gX3RlbXBQcm9qTWF0My5tdWwyKF9maXhQcm9qUmFuZ2VNYXQsIHByb2pNYXRTa3lib3gpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLnByb2pJZC5zZXRWYWx1ZShwcm9qTWF0LmRhdGEpO1xuICAgICAgICAgICAgdGhpcy5wcm9qU2t5Ym94SWQuc2V0VmFsdWUocHJvak1hdFNreWJveC5kYXRhKTtcblxuICAgICAgICAgICAgLy8gVmlld0ludmVyc2UgTWF0cml4XG4gICAgICAgICAgICBpZiAoY2FtZXJhLmNhbGN1bGF0ZVRyYW5zZm9ybSkge1xuICAgICAgICAgICAgICAgIGNhbWVyYS5jYWxjdWxhdGVUcmFuc2Zvcm0odmlld0ludk1hdCwgVklFV19DRU5URVIpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zdCBwb3MgPSBjYW1lcmEuX25vZGUuZ2V0UG9zaXRpb24oKTtcbiAgICAgICAgICAgICAgICBjb25zdCByb3QgPSBjYW1lcmEuX25vZGUuZ2V0Um90YXRpb24oKTtcbiAgICAgICAgICAgICAgICB2aWV3SW52TWF0LnNldFRSUyhwb3MsIHJvdCwgVmVjMy5PTkUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy52aWV3SW52SWQuc2V0VmFsdWUodmlld0ludk1hdC5kYXRhKTtcblxuICAgICAgICAgICAgLy8gVmlldyBNYXRyaXhcbiAgICAgICAgICAgIHZpZXdNYXQuY29weSh2aWV3SW52TWF0KS5pbnZlcnQoKTtcbiAgICAgICAgICAgIHRoaXMudmlld0lkLnNldFZhbHVlKHZpZXdNYXQuZGF0YSk7XG5cbiAgICAgICAgICAgIC8vIFZpZXcgM3gzXG4gICAgICAgICAgICB2aWV3TWF0My5zZXRGcm9tTWF0NCh2aWV3TWF0KTtcbiAgICAgICAgICAgIHRoaXMudmlld0lkMy5zZXRWYWx1ZSh2aWV3TWF0My5kYXRhKTtcblxuICAgICAgICAgICAgLy8gVmlld1Byb2plY3Rpb24gTWF0cml4XG4gICAgICAgICAgICB2aWV3UHJvak1hdC5tdWwyKHByb2pNYXQsIHZpZXdNYXQpO1xuICAgICAgICAgICAgdGhpcy52aWV3UHJvaklkLnNldFZhbHVlKHZpZXdQcm9qTWF0LmRhdGEpO1xuXG4gICAgICAgICAgICB0aGlzLmZsaXBZSWQuc2V0VmFsdWUoZmxpcFkgPyAtMSA6IDEpO1xuXG4gICAgICAgICAgICAvLyBWaWV3IFBvc2l0aW9uICh3b3JsZCBzcGFjZSlcbiAgICAgICAgICAgIHRoaXMuZGlzcGF0Y2hWaWV3UG9zKGNhbWVyYS5fbm9kZS5nZXRQb3NpdGlvbigpKTtcblxuICAgICAgICAgICAgY2FtZXJhLmZydXN0dW0uc2V0RnJvbU1hdDQodmlld1Byb2pNYXQpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy50Ym5CYXNpcy5zZXRWYWx1ZShmbGlwWSA/IC0xIDogMSk7XG5cbiAgICAgICAgLy8gTmVhciBhbmQgZmFyIGNsaXAgdmFsdWVzXG4gICAgICAgIGNvbnN0IG4gPSBjYW1lcmEuX25lYXJDbGlwO1xuICAgICAgICBjb25zdCBmID0gY2FtZXJhLl9mYXJDbGlwO1xuICAgICAgICB0aGlzLm5lYXJDbGlwSWQuc2V0VmFsdWUobik7XG4gICAgICAgIHRoaXMuZmFyQ2xpcElkLnNldFZhbHVlKGYpO1xuXG4gICAgICAgIC8vIGNhbWVyYSBwYXJhbXNcbiAgICAgICAgdGhpcy5jYW1lcmFQYXJhbXNbMF0gPSAxIC8gZjtcbiAgICAgICAgdGhpcy5jYW1lcmFQYXJhbXNbMV0gPSBmO1xuICAgICAgICB0aGlzLmNhbWVyYVBhcmFtc1syXSA9IG47XG4gICAgICAgIHRoaXMuY2FtZXJhUGFyYW1zWzNdID0gY2FtZXJhLnByb2plY3Rpb24gPT09IFBST0pFQ1RJT05fT1JUSE9HUkFQSElDID8gMSA6IDA7XG4gICAgICAgIHRoaXMuY2FtZXJhUGFyYW1zSWQuc2V0VmFsdWUodGhpcy5jYW1lcmFQYXJhbXMpO1xuXG4gICAgICAgIC8vIGV4cG9zdXJlXG4gICAgICAgIHRoaXMuZXhwb3N1cmVJZC5zZXRWYWx1ZSh0aGlzLnNjZW5lLnBoeXNpY2FsVW5pdHMgPyBjYW1lcmEuZ2V0RXhwb3N1cmUoKSA6IHRoaXMuc2NlbmUuZXhwb3N1cmUpO1xuXG4gICAgICAgIHJldHVybiB2aWV3Q291bnQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ2xlYXJzIHRoZSBhY3RpdmUgcmVuZGVyIHRhcmdldC4gSWYgdGhlIHZpZXdwb3J0IGlzIGFscmVhZHkgc2V0IHVwLCBvbmx5IGl0cyBhcmVhIGlzIGNsZWFyZWQuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi4vY2FtZXJhLmpzJykuQ2FtZXJhfSBjYW1lcmEgLSBUaGUgY2FtZXJhIHN1cHBseWluZyB0aGUgdmFsdWUgdG8gY2xlYXIgdG8uXG4gICAgICogQHBhcmFtIHtib29sZWFufSBbY2xlYXJDb2xvcl0gLSBUcnVlIGlmIHRoZSBjb2xvciBidWZmZXIgc2hvdWxkIGJlIGNsZWFyZWQuIFVzZXMgdGhlIHZhbHVlXG4gICAgICogZnJvbSB0aGUgY2FtcmEgaWYgbm90IHN1cHBsaWVkLlxuICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gW2NsZWFyRGVwdGhdIC0gVHJ1ZSBpZiB0aGUgZGVwdGggYnVmZmVyIHNob3VsZCBiZSBjbGVhcmVkLiBVc2VzIHRoZSB2YWx1ZVxuICAgICAqIGZyb20gdGhlIGNhbXJhIGlmIG5vdCBzdXBwbGllZC5cbiAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IFtjbGVhclN0ZW5jaWxdIC0gVHJ1ZSBpZiB0aGUgc3RlbmNpbCBidWZmZXIgc2hvdWxkIGJlIGNsZWFyZWQuIFVzZXMgdGhlXG4gICAgICogdmFsdWUgZnJvbSB0aGUgY2FtcmEgaWYgbm90IHN1cHBsaWVkLlxuICAgICAqL1xuICAgIGNsZWFyKGNhbWVyYSwgY2xlYXJDb2xvciwgY2xlYXJEZXB0aCwgY2xlYXJTdGVuY2lsKSB7XG5cbiAgICAgICAgY29uc3QgZmxhZ3MgPSAoKGNsZWFyQ29sb3IgPz8gY2FtZXJhLl9jbGVhckNvbG9yQnVmZmVyKSA/IENMRUFSRkxBR19DT0xPUiA6IDApIHxcbiAgICAgICAgICAgICAgICAgICAgICAoKGNsZWFyRGVwdGggPz8gY2FtZXJhLl9jbGVhckRlcHRoQnVmZmVyKSA/IENMRUFSRkxBR19ERVBUSCA6IDApIHxcbiAgICAgICAgICAgICAgICAgICAgICAoKGNsZWFyU3RlbmNpbCA/PyBjYW1lcmEuX2NsZWFyU3RlbmNpbEJ1ZmZlcikgPyBDTEVBUkZMQUdfU1RFTkNJTCA6IDApO1xuXG4gICAgICAgIGlmIChmbGFncykge1xuICAgICAgICAgICAgY29uc3QgZGV2aWNlID0gdGhpcy5kZXZpY2U7XG4gICAgICAgICAgICBEZWJ1Z0dyYXBoaWNzLnB1c2hHcHVNYXJrZXIoZGV2aWNlLCAnQ0xFQVInKTtcblxuICAgICAgICAgICAgZGV2aWNlLmNsZWFyKHtcbiAgICAgICAgICAgICAgICBjb2xvcjogW2NhbWVyYS5fY2xlYXJDb2xvci5yLCBjYW1lcmEuX2NsZWFyQ29sb3IuZywgY2FtZXJhLl9jbGVhckNvbG9yLmIsIGNhbWVyYS5fY2xlYXJDb2xvci5hXSxcbiAgICAgICAgICAgICAgICBkZXB0aDogY2FtZXJhLl9jbGVhckRlcHRoLFxuICAgICAgICAgICAgICAgIHN0ZW5jaWw6IGNhbWVyYS5fY2xlYXJTdGVuY2lsLFxuICAgICAgICAgICAgICAgIGZsYWdzOiBmbGFnc1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIERlYnVnR3JhcGhpY3MucG9wR3B1TWFya2VyKGRldmljZSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBtYWtlIHN1cmUgY29sb3JXcml0ZSBpcyBzZXQgdG8gdHJ1ZSB0byBhbGwgY2hhbm5lbHMsIGlmIHlvdSB3YW50IHRvIGZ1bGx5IGNsZWFyIHRoZSB0YXJnZXRcbiAgICAvLyBUT0RPOiB0aGlzIGZ1bmN0aW9uIGlzIG9ubHkgdXNlZCBmcm9tIG91dHNpZGUgb2YgZm9yd2FyZCByZW5kZXJlciwgYW5kIHNob3VsZCBiZSBkZXByZWNhdGVkXG4gICAgLy8gd2hlbiB0aGUgZnVuY3Rpb25hbGl0eSBtb3ZlcyB0byB0aGUgcmVuZGVyIHBhc3Nlcy4gTm90ZSB0aGF0IEVkaXRvciB1c2VzIGl0IGFzIHdlbGwuXG4gICAgc2V0Q2FtZXJhKGNhbWVyYSwgdGFyZ2V0LCBjbGVhciwgcmVuZGVyQWN0aW9uID0gbnVsbCkge1xuXG4gICAgICAgIHRoaXMuc2V0Q2FtZXJhVW5pZm9ybXMoY2FtZXJhLCB0YXJnZXQpO1xuICAgICAgICB0aGlzLmNsZWFyVmlldyhjYW1lcmEsIHRhcmdldCwgY2xlYXIsIGZhbHNlKTtcbiAgICB9XG5cbiAgICAvLyBUT0RPOiB0aGlzIGlzIGN1cnJlbnRseSB1c2VkIGJ5IHRoZSBsaWdodG1hcHBlciBhbmQgdGhlIEVkaXRvcixcbiAgICAvLyBhbmQgd2lsbCBiZSByZW1vdmVkIHdoZW4gdGhvc2UgY2FsbCBhcmUgcmVtb3ZlZC5cbiAgICBjbGVhclZpZXcoY2FtZXJhLCB0YXJnZXQsIGNsZWFyLCBmb3JjZVdyaXRlKSB7XG5cbiAgICAgICAgY29uc3QgZGV2aWNlID0gdGhpcy5kZXZpY2U7XG4gICAgICAgIERlYnVnR3JhcGhpY3MucHVzaEdwdU1hcmtlcihkZXZpY2UsICdDTEVBUi1WSUVXJyk7XG5cbiAgICAgICAgZGV2aWNlLnNldFJlbmRlclRhcmdldCh0YXJnZXQpO1xuICAgICAgICBkZXZpY2UudXBkYXRlQmVnaW4oKTtcblxuICAgICAgICBpZiAoZm9yY2VXcml0ZSkge1xuICAgICAgICAgICAgZGV2aWNlLnNldENvbG9yV3JpdGUodHJ1ZSwgdHJ1ZSwgdHJ1ZSwgdHJ1ZSk7XG4gICAgICAgICAgICBkZXZpY2Uuc2V0RGVwdGhXcml0ZSh0cnVlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuc2V0dXBWaWV3cG9ydChjYW1lcmEsIHRhcmdldCk7XG5cbiAgICAgICAgaWYgKGNsZWFyKSB7XG5cbiAgICAgICAgICAgIC8vIHVzZSBjYW1lcmEgY2xlYXIgb3B0aW9ucyBpZiBhbnlcbiAgICAgICAgICAgIGNvbnN0IG9wdGlvbnMgPSBjYW1lcmEuX2NsZWFyT3B0aW9ucztcbiAgICAgICAgICAgIGRldmljZS5jbGVhcihvcHRpb25zID8gb3B0aW9ucyA6IHtcbiAgICAgICAgICAgICAgICBjb2xvcjogW2NhbWVyYS5fY2xlYXJDb2xvci5yLCBjYW1lcmEuX2NsZWFyQ29sb3IuZywgY2FtZXJhLl9jbGVhckNvbG9yLmIsIGNhbWVyYS5fY2xlYXJDb2xvci5hXSxcbiAgICAgICAgICAgICAgICBkZXB0aDogY2FtZXJhLl9jbGVhckRlcHRoLFxuICAgICAgICAgICAgICAgIGZsYWdzOiAoY2FtZXJhLl9jbGVhckNvbG9yQnVmZmVyID8gQ0xFQVJGTEFHX0NPTE9SIDogMCkgfFxuICAgICAgICAgICAgICAgICAgICAgICAoY2FtZXJhLl9jbGVhckRlcHRoQnVmZmVyID8gQ0xFQVJGTEFHX0RFUFRIIDogMCkgfFxuICAgICAgICAgICAgICAgICAgICAgICAoY2FtZXJhLl9jbGVhclN0ZW5jaWxCdWZmZXIgPyBDTEVBUkZMQUdfU1RFTkNJTCA6IDApLFxuICAgICAgICAgICAgICAgIHN0ZW5jaWw6IGNhbWVyYS5fY2xlYXJTdGVuY2lsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIERlYnVnR3JhcGhpY3MucG9wR3B1TWFya2VyKGRldmljZSk7XG4gICAgfVxuXG4gICAgc2V0dXBDdWxsTW9kZShjdWxsRmFjZXMsIGZsaXBGYWN0b3IsIGRyYXdDYWxsKSB7XG4gICAgICAgIGNvbnN0IG1hdGVyaWFsID0gZHJhd0NhbGwubWF0ZXJpYWw7XG4gICAgICAgIGxldCBtb2RlID0gQ1VMTEZBQ0VfTk9ORTtcbiAgICAgICAgaWYgKGN1bGxGYWNlcykge1xuICAgICAgICAgICAgbGV0IGZsaXBGYWNlcyA9IDE7XG5cbiAgICAgICAgICAgIGlmIChtYXRlcmlhbC5jdWxsID09PSBDVUxMRkFDRV9GUk9OVCB8fCBtYXRlcmlhbC5jdWxsID09PSBDVUxMRkFDRV9CQUNLKSB7XG4gICAgICAgICAgICAgICAgZmxpcEZhY2VzID0gZmxpcEZhY3RvciAqIGRyYXdDYWxsLmZsaXBGYWNlc0ZhY3RvciAqIGRyYXdDYWxsLm5vZGUud29ybGRTY2FsZVNpZ247XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChmbGlwRmFjZXMgPCAwKSB7XG4gICAgICAgICAgICAgICAgbW9kZSA9IG1hdGVyaWFsLmN1bGwgPT09IENVTExGQUNFX0ZST05UID8gQ1VMTEZBQ0VfQkFDSyA6IENVTExGQUNFX0ZST05UO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBtb2RlID0gbWF0ZXJpYWwuY3VsbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB0aGlzLmRldmljZS5zZXRDdWxsTW9kZShtb2RlKTtcblxuICAgICAgICBpZiAobW9kZSA9PT0gQ1VMTEZBQ0VfTk9ORSAmJiBtYXRlcmlhbC5jdWxsID09PSBDVUxMRkFDRV9OT05FKSB7XG4gICAgICAgICAgICB0aGlzLnR3b1NpZGVkTGlnaHRpbmdOZWdTY2FsZUZhY3RvcklkLnNldFZhbHVlKGRyYXdDYWxsLm5vZGUud29ybGRTY2FsZVNpZ24pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgdXBkYXRlQ2FtZXJhRnJ1c3R1bShjYW1lcmEpIHtcblxuICAgICAgICBpZiAoY2FtZXJhLnhyICYmIGNhbWVyYS54ci52aWV3cy5sZW5ndGgpIHtcbiAgICAgICAgICAgIC8vIGNhbGN1bGF0ZSBmcnVzdHVtIGJhc2VkIG9uIFhSIHZpZXdcbiAgICAgICAgICAgIGNvbnN0IHZpZXcgPSBjYW1lcmEueHIudmlld3NbMF07XG4gICAgICAgICAgICB2aWV3UHJvak1hdC5tdWwyKHZpZXcucHJvak1hdCwgdmlldy52aWV3T2ZmTWF0KTtcbiAgICAgICAgICAgIGNhbWVyYS5mcnVzdHVtLnNldEZyb21NYXQ0KHZpZXdQcm9qTWF0KTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHByb2pNYXQgPSBjYW1lcmEucHJvamVjdGlvbk1hdHJpeDtcbiAgICAgICAgaWYgKGNhbWVyYS5jYWxjdWxhdGVQcm9qZWN0aW9uKSB7XG4gICAgICAgICAgICBjYW1lcmEuY2FsY3VsYXRlUHJvamVjdGlvbihwcm9qTWF0LCBWSUVXX0NFTlRFUik7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoY2FtZXJhLmNhbGN1bGF0ZVRyYW5zZm9ybSkge1xuICAgICAgICAgICAgY2FtZXJhLmNhbGN1bGF0ZVRyYW5zZm9ybSh2aWV3SW52TWF0LCBWSUVXX0NFTlRFUik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zdCBwb3MgPSBjYW1lcmEuX25vZGUuZ2V0UG9zaXRpb24oKTtcbiAgICAgICAgICAgIGNvbnN0IHJvdCA9IGNhbWVyYS5fbm9kZS5nZXRSb3RhdGlvbigpO1xuICAgICAgICAgICAgdmlld0ludk1hdC5zZXRUUlMocG9zLCByb3QsIFZlYzMuT05FKTtcbiAgICAgICAgICAgIHRoaXMudmlld0ludklkLnNldFZhbHVlKHZpZXdJbnZNYXQuZGF0YSk7XG4gICAgICAgIH1cbiAgICAgICAgdmlld01hdC5jb3B5KHZpZXdJbnZNYXQpLmludmVydCgpO1xuXG4gICAgICAgIHZpZXdQcm9qTWF0Lm11bDIocHJvak1hdCwgdmlld01hdCk7XG4gICAgICAgIGNhbWVyYS5mcnVzdHVtLnNldEZyb21NYXQ0KHZpZXdQcm9qTWF0KTtcbiAgICB9XG5cbiAgICBzZXRCYXNlQ29uc3RhbnRzKGRldmljZSwgbWF0ZXJpYWwpIHtcblxuICAgICAgICAvLyBDdWxsIG1vZGVcbiAgICAgICAgZGV2aWNlLnNldEN1bGxNb2RlKG1hdGVyaWFsLmN1bGwpO1xuXG4gICAgICAgIC8vIEFscGhhIHRlc3RcbiAgICAgICAgaWYgKG1hdGVyaWFsLm9wYWNpdHlNYXApIHtcbiAgICAgICAgICAgIHRoaXMub3BhY2l0eU1hcElkLnNldFZhbHVlKG1hdGVyaWFsLm9wYWNpdHlNYXApO1xuICAgICAgICB9XG4gICAgICAgIGlmIChtYXRlcmlhbC5vcGFjaXR5TWFwIHx8IG1hdGVyaWFsLmFscGhhVGVzdCA+IDApIHtcbiAgICAgICAgICAgIHRoaXMuYWxwaGFUZXN0SWQuc2V0VmFsdWUobWF0ZXJpYWwuYWxwaGFUZXN0KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHVwZGF0ZUNwdVNraW5NYXRyaWNlcyhkcmF3Q2FsbHMpIHtcblxuICAgICAgICBfc2tpblVwZGF0ZUluZGV4Kys7XG5cbiAgICAgICAgY29uc3QgZHJhd0NhbGxzQ291bnQgPSBkcmF3Q2FsbHMubGVuZ3RoO1xuICAgICAgICBpZiAoZHJhd0NhbGxzQ291bnQgPT09IDApIHJldHVybjtcblxuICAgICAgICAvLyAjaWYgX1BST0ZJTEVSXG4gICAgICAgIGNvbnN0IHNraW5UaW1lID0gbm93KCk7XG4gICAgICAgIC8vICNlbmRpZlxuXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZHJhd0NhbGxzQ291bnQ7IGkrKykge1xuICAgICAgICAgICAgY29uc3Qgc2kgPSBkcmF3Q2FsbHNbaV0uc2tpbkluc3RhbmNlO1xuICAgICAgICAgICAgaWYgKHNpKSB7XG4gICAgICAgICAgICAgICAgc2kudXBkYXRlTWF0cmljZXMoZHJhd0NhbGxzW2ldLm5vZGUsIF9za2luVXBkYXRlSW5kZXgpO1xuICAgICAgICAgICAgICAgIHNpLl9kaXJ0eSA9IHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyAjaWYgX1BST0ZJTEVSXG4gICAgICAgIHRoaXMuX3NraW5UaW1lICs9IG5vdygpIC0gc2tpblRpbWU7XG4gICAgICAgIC8vICNlbmRpZlxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFVwZGF0ZSBza2luIG1hdHJpY2VzIGFoZWFkIG9mIHJlbmRlcmluZy5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuLi9tZXNoLWluc3RhbmNlLmpzJykuTWVzaEluc3RhbmNlW118U2V0PGltcG9ydCgnLi4vbWVzaC1pbnN0YW5jZS5qcycpLk1lc2hJbnN0YW5jZT59IGRyYXdDYWxscyAtIE1lc2hJbnN0YW5jZXNcbiAgICAgKiBjb250YWluaW5nIHNraW5JbnN0YW5jZS5cbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgdXBkYXRlR3B1U2tpbk1hdHJpY2VzKGRyYXdDYWxscykge1xuICAgICAgICAvLyAjaWYgX1BST0ZJTEVSXG4gICAgICAgIGNvbnN0IHNraW5UaW1lID0gbm93KCk7XG4gICAgICAgIC8vICNlbmRpZlxuXG4gICAgICAgIGZvciAoY29uc3QgZHJhd0NhbGwgb2YgZHJhd0NhbGxzKSB7XG4gICAgICAgICAgICBjb25zdCBza2luID0gZHJhd0NhbGwuc2tpbkluc3RhbmNlO1xuXG4gICAgICAgICAgICBpZiAoc2tpbiAmJiBza2luLl9kaXJ0eSkge1xuICAgICAgICAgICAgICAgIHNraW4udXBkYXRlTWF0cml4UGFsZXR0ZShkcmF3Q2FsbC5ub2RlLCBfc2tpblVwZGF0ZUluZGV4KTtcbiAgICAgICAgICAgICAgICBza2luLl9kaXJ0eSA9IGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gI2lmIF9QUk9GSUxFUlxuICAgICAgICB0aGlzLl9za2luVGltZSArPSBub3coKSAtIHNraW5UaW1lO1xuICAgICAgICAvLyAjZW5kaWZcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBVcGRhdGUgbW9ycGhpbmcgYWhlYWQgb2YgcmVuZGVyaW5nLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4uL21lc2gtaW5zdGFuY2UuanMnKS5NZXNoSW5zdGFuY2VbXXxTZXQ8aW1wb3J0KCcuLi9tZXNoLWluc3RhbmNlLmpzJykuTWVzaEluc3RhbmNlPn0gZHJhd0NhbGxzIC0gTWVzaEluc3RhbmNlc1xuICAgICAqIGNvbnRhaW5pbmcgbW9ycGhJbnN0YW5jZS5cbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgdXBkYXRlTW9ycGhpbmcoZHJhd0NhbGxzKSB7XG4gICAgICAgIC8vICNpZiBfUFJPRklMRVJcbiAgICAgICAgY29uc3QgbW9ycGhUaW1lID0gbm93KCk7XG4gICAgICAgIC8vICNlbmRpZlxuXG4gICAgICAgIGZvciAoY29uc3QgZHJhd0NhbGwgb2YgZHJhd0NhbGxzKSB7XG4gICAgICAgICAgICBjb25zdCBtb3JwaEluc3QgPSBkcmF3Q2FsbC5tb3JwaEluc3RhbmNlO1xuICAgICAgICAgICAgaWYgKG1vcnBoSW5zdCAmJiBtb3JwaEluc3QuX2RpcnR5KSB7XG4gICAgICAgICAgICAgICAgbW9ycGhJbnN0LnVwZGF0ZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gI2lmIF9QUk9GSUxFUlxuICAgICAgICB0aGlzLl9tb3JwaFRpbWUgKz0gbm93KCkgLSBtb3JwaFRpbWU7XG4gICAgICAgIC8vICNlbmRpZlxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFVwZGF0ZSBkcmF3IGNhbGxzIGFoZWFkIG9mIHJlbmRlcmluZy5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuLi9tZXNoLWluc3RhbmNlLmpzJykuTWVzaEluc3RhbmNlW118U2V0PGltcG9ydCgnLi4vbWVzaC1pbnN0YW5jZS5qcycpLk1lc2hJbnN0YW5jZT59IGRyYXdDYWxscyAtIE1lc2hJbnN0YW5jZXNcbiAgICAgKiByZXF1aXJpbmcgdXBkYXRlcy5cbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgZ3B1VXBkYXRlKGRyYXdDYWxscykge1xuICAgICAgICAvLyBOb3RlIHRoYXQgZHJhd0NhbGxzIGNhbiBiZSBlaXRoZXIgYSBTZXQgb3IgYW4gQXJyYXkgYW5kIGNvbnRhaW5zIG1lc2ggaW5zdGFuY2VzXG4gICAgICAgIC8vIHRoYXQgYXJlIHZpc2libGUgaW4gdGhpcyBmcmFtZVxuICAgICAgICB0aGlzLnVwZGF0ZUdwdVNraW5NYXRyaWNlcyhkcmF3Q2FsbHMpO1xuICAgICAgICB0aGlzLnVwZGF0ZU1vcnBoaW5nKGRyYXdDYWxscyk7XG4gICAgfVxuXG4gICAgc2V0VmVydGV4QnVmZmVycyhkZXZpY2UsIG1lc2gpIHtcblxuICAgICAgICAvLyBtYWluIHZlcnRleCBidWZmZXJcbiAgICAgICAgZGV2aWNlLnNldFZlcnRleEJ1ZmZlcihtZXNoLnZlcnRleEJ1ZmZlcik7XG4gICAgfVxuXG4gICAgc2V0TW9ycGhpbmcoZGV2aWNlLCBtb3JwaEluc3RhbmNlKSB7XG5cbiAgICAgICAgaWYgKG1vcnBoSW5zdGFuY2UpIHtcblxuICAgICAgICAgICAgaWYgKG1vcnBoSW5zdGFuY2UubW9ycGgudXNlVGV4dHVyZU1vcnBoKSB7XG5cbiAgICAgICAgICAgICAgICAvLyB2ZXJ0ZXggYnVmZmVyIHdpdGggdmVydGV4IGlkc1xuICAgICAgICAgICAgICAgIGRldmljZS5zZXRWZXJ0ZXhCdWZmZXIobW9ycGhJbnN0YW5jZS5tb3JwaC52ZXJ0ZXhCdWZmZXJJZHMpO1xuXG4gICAgICAgICAgICAgICAgLy8gdGV4dHVyZXNcbiAgICAgICAgICAgICAgICB0aGlzLm1vcnBoUG9zaXRpb25UZXguc2V0VmFsdWUobW9ycGhJbnN0YW5jZS50ZXh0dXJlUG9zaXRpb25zKTtcbiAgICAgICAgICAgICAgICB0aGlzLm1vcnBoTm9ybWFsVGV4LnNldFZhbHVlKG1vcnBoSW5zdGFuY2UudGV4dHVyZU5vcm1hbHMpO1xuXG4gICAgICAgICAgICAgICAgLy8gdGV4dHVyZSBwYXJhbXNcbiAgICAgICAgICAgICAgICB0aGlzLm1vcnBoVGV4UGFyYW1zLnNldFZhbHVlKG1vcnBoSW5zdGFuY2UuX3RleHR1cmVQYXJhbXMpO1xuXG4gICAgICAgICAgICB9IGVsc2UgeyAgICAvLyB2ZXJ0ZXggYXR0cmlidXRlcyBiYXNlZCBtb3JwaGluZ1xuXG4gICAgICAgICAgICAgICAgZm9yIChsZXQgdCA9IDA7IHQgPCBtb3JwaEluc3RhbmNlLl9hY3RpdmVWZXJ0ZXhCdWZmZXJzLmxlbmd0aDsgdCsrKSB7XG5cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdmIgPSBtb3JwaEluc3RhbmNlLl9hY3RpdmVWZXJ0ZXhCdWZmZXJzW3RdO1xuICAgICAgICAgICAgICAgICAgICBpZiAodmIpIHtcblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gcGF0Y2ggc2VtYW50aWMgZm9yIHRoZSBidWZmZXIgdG8gY3VycmVudCBBVFRSIHNsb3QgKHVzaW5nIEFUVFI4IC0gQVRUUjE1IHJhbmdlKVxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgc2VtYW50aWMgPSBTRU1BTlRJQ19BVFRSICsgKHQgKyA4KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZiLmZvcm1hdC5lbGVtZW50c1swXS5uYW1lID0gc2VtYW50aWM7XG4gICAgICAgICAgICAgICAgICAgICAgICB2Yi5mb3JtYXQuZWxlbWVudHNbMF0uc2NvcGVJZCA9IGRldmljZS5zY29wZS5yZXNvbHZlKHNlbWFudGljKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZiLmZvcm1hdC51cGRhdGUoKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgZGV2aWNlLnNldFZlcnRleEJ1ZmZlcih2Yik7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBzZXQgYWxsIDggd2VpZ2h0c1xuICAgICAgICAgICAgICAgIHRoaXMubW9ycGhXZWlnaHRzQS5zZXRWYWx1ZShtb3JwaEluc3RhbmNlLl9zaGFkZXJNb3JwaFdlaWdodHNBKTtcbiAgICAgICAgICAgICAgICB0aGlzLm1vcnBoV2VpZ2h0c0Iuc2V0VmFsdWUobW9ycGhJbnN0YW5jZS5fc2hhZGVyTW9ycGhXZWlnaHRzQik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBzZXRTa2lubmluZyhkZXZpY2UsIG1lc2hJbnN0YW5jZSkge1xuICAgICAgICBpZiAobWVzaEluc3RhbmNlLnNraW5JbnN0YW5jZSkge1xuICAgICAgICAgICAgdGhpcy5fc2tpbkRyYXdDYWxscysrO1xuICAgICAgICAgICAgaWYgKGRldmljZS5zdXBwb3J0c0JvbmVUZXh0dXJlcykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGJvbmVUZXh0dXJlID0gbWVzaEluc3RhbmNlLnNraW5JbnN0YW5jZS5ib25lVGV4dHVyZTtcbiAgICAgICAgICAgICAgICB0aGlzLmJvbmVUZXh0dXJlSWQuc2V0VmFsdWUoYm9uZVRleHR1cmUpO1xuICAgICAgICAgICAgICAgIGJvbmVUZXh0dXJlU2l6ZVswXSA9IGJvbmVUZXh0dXJlLndpZHRoO1xuICAgICAgICAgICAgICAgIGJvbmVUZXh0dXJlU2l6ZVsxXSA9IGJvbmVUZXh0dXJlLmhlaWdodDtcbiAgICAgICAgICAgICAgICBib25lVGV4dHVyZVNpemVbMl0gPSAxLjAgLyBib25lVGV4dHVyZS53aWR0aDtcbiAgICAgICAgICAgICAgICBib25lVGV4dHVyZVNpemVbM10gPSAxLjAgLyBib25lVGV4dHVyZS5oZWlnaHQ7XG4gICAgICAgICAgICAgICAgdGhpcy5ib25lVGV4dHVyZVNpemVJZC5zZXRWYWx1ZShib25lVGV4dHVyZVNpemUpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLnBvc2VNYXRyaXhJZC5zZXRWYWx1ZShtZXNoSW5zdGFuY2Uuc2tpbkluc3RhbmNlLm1hdHJpeFBhbGV0dGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gc2V0cyBWZWMzIGNhbWVyYSBwb3NpdGlvbiB1bmlmb3JtXG4gICAgZGlzcGF0Y2hWaWV3UG9zKHBvc2l0aW9uKSB7XG4gICAgICAgIGNvbnN0IHZwID0gdGhpcy52aWV3UG9zOyAgICAvLyBub3RlIHRoYXQgdGhpcyByZXVzZXMgYW4gYXJyYXlcbiAgICAgICAgdnBbMF0gPSBwb3NpdGlvbi54O1xuICAgICAgICB2cFsxXSA9IHBvc2l0aW9uLnk7XG4gICAgICAgIHZwWzJdID0gcG9zaXRpb24uejtcbiAgICAgICAgdGhpcy52aWV3UG9zSWQuc2V0VmFsdWUodnApO1xuICAgIH1cblxuICAgIGluaXRWaWV3QmluZEdyb3VwRm9ybWF0KGlzQ2x1c3RlcmVkKSB7XG5cbiAgICAgICAgaWYgKHRoaXMuZGV2aWNlLnN1cHBvcnRzVW5pZm9ybUJ1ZmZlcnMgJiYgIXRoaXMudmlld1VuaWZvcm1Gb3JtYXQpIHtcblxuICAgICAgICAgICAgLy8gZm9ybWF0IG9mIHRoZSB2aWV3IHVuaWZvcm0gYnVmZmVyXG4gICAgICAgICAgICBjb25zdCB1bmlmb3JtcyA9IFtcbiAgICAgICAgICAgICAgICBuZXcgVW5pZm9ybUZvcm1hdChcIm1hdHJpeF92aWV3UHJvamVjdGlvblwiLCBVTklGT1JNVFlQRV9NQVQ0KSxcbiAgICAgICAgICAgICAgICBuZXcgVW5pZm9ybUZvcm1hdChcImN1YmVNYXBSb3RhdGlvbk1hdHJpeFwiLCBVTklGT1JNVFlQRV9NQVQzKSxcbiAgICAgICAgICAgICAgICBuZXcgVW5pZm9ybUZvcm1hdChcInZpZXdfcG9zaXRpb25cIiwgVU5JRk9STVRZUEVfVkVDMyksXG4gICAgICAgICAgICAgICAgbmV3IFVuaWZvcm1Gb3JtYXQoXCJza3lib3hJbnRlbnNpdHlcIiwgVU5JRk9STVRZUEVfRkxPQVQpLFxuICAgICAgICAgICAgICAgIG5ldyBVbmlmb3JtRm9ybWF0KFwiZXhwb3N1cmVcIiwgVU5JRk9STVRZUEVfRkxPQVQpLFxuICAgICAgICAgICAgICAgIG5ldyBVbmlmb3JtRm9ybWF0KFwidGV4dHVyZUJpYXNcIiwgVU5JRk9STVRZUEVfRkxPQVQpXG4gICAgICAgICAgICBdO1xuXG4gICAgICAgICAgICBpZiAoaXNDbHVzdGVyZWQpIHtcbiAgICAgICAgICAgICAgICB1bmlmb3Jtcy5wdXNoKC4uLltcbiAgICAgICAgICAgICAgICAgICAgbmV3IFVuaWZvcm1Gb3JtYXQoXCJjbHVzdGVyQ2VsbHNDb3VudEJ5Qm91bmRzU2l6ZVwiLCBVTklGT1JNVFlQRV9WRUMzKSxcbiAgICAgICAgICAgICAgICAgICAgbmV3IFVuaWZvcm1Gb3JtYXQoXCJjbHVzdGVyVGV4dHVyZVNpemVcIiwgVU5JRk9STVRZUEVfVkVDMyksXG4gICAgICAgICAgICAgICAgICAgIG5ldyBVbmlmb3JtRm9ybWF0KFwiY2x1c3RlckJvdW5kc01pblwiLCBVTklGT1JNVFlQRV9WRUMzKSxcbiAgICAgICAgICAgICAgICAgICAgbmV3IFVuaWZvcm1Gb3JtYXQoXCJjbHVzdGVyQm91bmRzRGVsdGFcIiwgVU5JRk9STVRZUEVfVkVDMyksXG4gICAgICAgICAgICAgICAgICAgIG5ldyBVbmlmb3JtRm9ybWF0KFwiY2x1c3RlckNlbGxzRG90XCIsIFVOSUZPUk1UWVBFX1ZFQzMpLFxuICAgICAgICAgICAgICAgICAgICBuZXcgVW5pZm9ybUZvcm1hdChcImNsdXN0ZXJDZWxsc01heFwiLCBVTklGT1JNVFlQRV9WRUMzKSxcbiAgICAgICAgICAgICAgICAgICAgbmV3IFVuaWZvcm1Gb3JtYXQoXCJjbHVzdGVyQ29tcHJlc3Npb25MaW1pdDBcIiwgVU5JRk9STVRZUEVfVkVDMiksXG4gICAgICAgICAgICAgICAgICAgIG5ldyBVbmlmb3JtRm9ybWF0KFwic2hhZG93QXRsYXNQYXJhbXNcIiwgVU5JRk9STVRZUEVfVkVDMiksXG4gICAgICAgICAgICAgICAgICAgIG5ldyBVbmlmb3JtRm9ybWF0KFwiY2x1c3Rlck1heENlbGxzXCIsIFVOSUZPUk1UWVBFX0lOVCksXG4gICAgICAgICAgICAgICAgICAgIG5ldyBVbmlmb3JtRm9ybWF0KFwiY2x1c3RlclNraXBcIiwgVU5JRk9STVRZUEVfRkxPQVQpXG4gICAgICAgICAgICAgICAgXSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMudmlld1VuaWZvcm1Gb3JtYXQgPSBuZXcgVW5pZm9ybUJ1ZmZlckZvcm1hdCh0aGlzLmRldmljZSwgdW5pZm9ybXMpO1xuXG4gICAgICAgICAgICAvLyBmb3JtYXQgb2YgdGhlIHZpZXcgYmluZCBncm91cCAtIGNvbnRhaW5zIHNpbmdsZSB1bmlmb3JtIGJ1ZmZlciwgYW5kIHNvbWUgdGV4dHVyZXNcbiAgICAgICAgICAgIGNvbnN0IGJ1ZmZlcnMgPSBbXG4gICAgICAgICAgICAgICAgbmV3IEJpbmRCdWZmZXJGb3JtYXQoVU5JRk9STV9CVUZGRVJfREVGQVVMVF9TTE9UX05BTUUsIFNIQURFUlNUQUdFX1ZFUlRFWCB8IFNIQURFUlNUQUdFX0ZSQUdNRU5UKVxuICAgICAgICAgICAgXTtcblxuICAgICAgICAgICAgY29uc3QgdGV4dHVyZXMgPSBbXG4gICAgICAgICAgICAgICAgbmV3IEJpbmRUZXh0dXJlRm9ybWF0KCdsaWdodHNUZXh0dXJlRmxvYXQnLCBTSEFERVJTVEFHRV9GUkFHTUVOVCwgVEVYVFVSRURJTUVOU0lPTl8yRCwgU0FNUExFVFlQRV9VTkZJTFRFUkFCTEVfRkxPQVQpLFxuICAgICAgICAgICAgICAgIG5ldyBCaW5kVGV4dHVyZUZvcm1hdCgnbGlnaHRzVGV4dHVyZTgnLCBTSEFERVJTVEFHRV9GUkFHTUVOVCwgVEVYVFVSRURJTUVOU0lPTl8yRCwgU0FNUExFVFlQRV9VTkZJTFRFUkFCTEVfRkxPQVQpLFxuICAgICAgICAgICAgICAgIG5ldyBCaW5kVGV4dHVyZUZvcm1hdCgnc2hhZG93QXRsYXNUZXh0dXJlJywgU0hBREVSU1RBR0VfRlJBR01FTlQsIFRFWFRVUkVESU1FTlNJT05fMkQsIFNBTVBMRVRZUEVfREVQVEgpLFxuICAgICAgICAgICAgICAgIG5ldyBCaW5kVGV4dHVyZUZvcm1hdCgnY29va2llQXRsYXNUZXh0dXJlJywgU0hBREVSU1RBR0VfRlJBR01FTlQsIFRFWFRVUkVESU1FTlNJT05fMkQsIFNBTVBMRVRZUEVfRkxPQVQpLFxuXG4gICAgICAgICAgICAgICAgbmV3IEJpbmRUZXh0dXJlRm9ybWF0KCdhcmVhTGlnaHRzTHV0VGV4MScsIFNIQURFUlNUQUdFX0ZSQUdNRU5ULCBURVhUVVJFRElNRU5TSU9OXzJELCBTQU1QTEVUWVBFX0ZMT0FUKSxcbiAgICAgICAgICAgICAgICBuZXcgQmluZFRleHR1cmVGb3JtYXQoJ2FyZWFMaWdodHNMdXRUZXgyJywgU0hBREVSU1RBR0VfRlJBR01FTlQsIFRFWFRVUkVESU1FTlNJT05fMkQsIFNBTVBMRVRZUEVfRkxPQVQpXG4gICAgICAgICAgICBdO1xuXG4gICAgICAgICAgICBpZiAoaXNDbHVzdGVyZWQpIHtcbiAgICAgICAgICAgICAgICB0ZXh0dXJlcy5wdXNoKC4uLltcbiAgICAgICAgICAgICAgICAgICAgbmV3IEJpbmRUZXh0dXJlRm9ybWF0KCdjbHVzdGVyV29ybGRUZXh0dXJlJywgU0hBREVSU1RBR0VfRlJBR01FTlQsIFRFWFRVUkVESU1FTlNJT05fMkQsIFNBTVBMRVRZUEVfVU5GSUxURVJBQkxFX0ZMT0FUKVxuICAgICAgICAgICAgICAgIF0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLnZpZXdCaW5kR3JvdXBGb3JtYXQgPSBuZXcgQmluZEdyb3VwRm9ybWF0KHRoaXMuZGV2aWNlLCBidWZmZXJzLCB0ZXh0dXJlcyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBzZXR1cFZpZXdVbmlmb3JtQnVmZmVycyh2aWV3QmluZEdyb3Vwcywgdmlld1VuaWZvcm1Gb3JtYXQsIHZpZXdCaW5kR3JvdXBGb3JtYXQsIHZpZXdDb3VudCkge1xuXG4gICAgICAgIERlYnVnLmFzc2VydChBcnJheS5pc0FycmF5KHZpZXdCaW5kR3JvdXBzKSwgXCJ2aWV3QmluZEdyb3VwcyBtdXN0IGJlIGFuIGFycmF5XCIpO1xuXG4gICAgICAgIGNvbnN0IGRldmljZSA9IHRoaXMuZGV2aWNlO1xuICAgICAgICBEZWJ1Zy5hc3NlcnQodmlld0NvdW50ID09PSAxLCBcIlRoaXMgY29kZSBkb2VzIG5vdCBoYW5kbGUgdGhlIHZpZXdDb3VudCB5ZXRcIik7XG5cbiAgICAgICAgd2hpbGUgKHZpZXdCaW5kR3JvdXBzLmxlbmd0aCA8IHZpZXdDb3VudCkge1xuICAgICAgICAgICAgY29uc3QgdWIgPSBuZXcgVW5pZm9ybUJ1ZmZlcihkZXZpY2UsIHZpZXdVbmlmb3JtRm9ybWF0LCBmYWxzZSk7XG4gICAgICAgICAgICBjb25zdCBiZyA9IG5ldyBCaW5kR3JvdXAoZGV2aWNlLCB2aWV3QmluZEdyb3VwRm9ybWF0LCB1Yik7XG4gICAgICAgICAgICBEZWJ1Z0hlbHBlci5zZXROYW1lKGJnLCBgVmlld0JpbmRHcm91cF8ke2JnLmlkfWApO1xuICAgICAgICAgICAgdmlld0JpbmRHcm91cHMucHVzaChiZyk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyB1cGRhdGUgdmlldyBiaW5kIGdyb3VwIC8gdW5pZm9ybXNcbiAgICAgICAgY29uc3Qgdmlld0JpbmRHcm91cCA9IHZpZXdCaW5kR3JvdXBzWzBdO1xuICAgICAgICB2aWV3QmluZEdyb3VwLmRlZmF1bHRVbmlmb3JtQnVmZmVyLnVwZGF0ZSgpO1xuICAgICAgICB2aWV3QmluZEdyb3VwLnVwZGF0ZSgpO1xuXG4gICAgICAgIC8vIFRPRE87IHRoaXMgbmVlZHMgdG8gYmUgbW92ZWQgdG8gZHJhd0luc3RhbmNlIGZ1bmN0aW9ucyB0byBoYW5kbGUgWFJcbiAgICAgICAgZGV2aWNlLnNldEJpbmRHcm91cChCSU5ER1JPVVBfVklFVywgdmlld0JpbmRHcm91cCk7XG4gICAgfVxuXG4gICAgc2V0dXBNZXNoVW5pZm9ybUJ1ZmZlcnMoc2hhZGVySW5zdGFuY2UsIG1lc2hJbnN0YW5jZSkge1xuXG4gICAgICAgIGNvbnN0IGRldmljZSA9IHRoaXMuZGV2aWNlO1xuICAgICAgICBpZiAoZGV2aWNlLnN1cHBvcnRzVW5pZm9ybUJ1ZmZlcnMpIHtcblxuICAgICAgICAgICAgLy8gVE9ETzogbW9kZWwgbWF0cml4IHNldHVwIGlzIHBhcnQgb2YgdGhlIGRyYXdJbnN0YW5jZSBjYWxsLCBidXQgd2l0aCB1bmlmb3JtIGJ1ZmZlciBpdCdzIG5lZWRlZFxuICAgICAgICAgICAgLy8gZWFybGllciBoZXJlLiBUaGlzIG5lZWRzIHRvIGJlIHJlZmFjdG9yZWQgZm9yIG11bHRpLXZpZXcgYW55d2F5cy5cbiAgICAgICAgICAgIHRoaXMubW9kZWxNYXRyaXhJZC5zZXRWYWx1ZShtZXNoSW5zdGFuY2Uubm9kZS53b3JsZFRyYW5zZm9ybS5kYXRhKTtcbiAgICAgICAgICAgIHRoaXMubm9ybWFsTWF0cml4SWQuc2V0VmFsdWUobWVzaEluc3RhbmNlLm5vZGUubm9ybWFsTWF0cml4LmRhdGEpO1xuXG4gICAgICAgICAgICAvLyB1cGRhdGUgbWVzaCBiaW5kIGdyb3VwIC8gdW5pZm9ybSBidWZmZXJcbiAgICAgICAgICAgIGNvbnN0IG1lc2hCaW5kR3JvdXAgPSBzaGFkZXJJbnN0YW5jZS5nZXRCaW5kR3JvdXAoZGV2aWNlKTtcblxuICAgICAgICAgICAgbWVzaEJpbmRHcm91cC5kZWZhdWx0VW5pZm9ybUJ1ZmZlci51cGRhdGUoKTtcbiAgICAgICAgICAgIG1lc2hCaW5kR3JvdXAudXBkYXRlKCk7XG4gICAgICAgICAgICBkZXZpY2Uuc2V0QmluZEdyb3VwKEJJTkRHUk9VUF9NRVNILCBtZXNoQmluZEdyb3VwKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGRyYXdJbnN0YW5jZShkZXZpY2UsIG1lc2hJbnN0YW5jZSwgbWVzaCwgc3R5bGUsIG5vcm1hbCkge1xuXG4gICAgICAgIERlYnVnR3JhcGhpY3MucHVzaEdwdU1hcmtlcihkZXZpY2UsIG1lc2hJbnN0YW5jZS5ub2RlLm5hbWUpO1xuXG4gICAgICAgIGNvbnN0IGluc3RhbmNpbmdEYXRhID0gbWVzaEluc3RhbmNlLmluc3RhbmNpbmdEYXRhO1xuICAgICAgICBpZiAoaW5zdGFuY2luZ0RhdGEpIHtcbiAgICAgICAgICAgIGlmIChpbnN0YW5jaW5nRGF0YS5jb3VudCA+IDApIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9pbnN0YW5jZWREcmF3Q2FsbHMrKztcbiAgICAgICAgICAgICAgICBkZXZpY2Uuc2V0VmVydGV4QnVmZmVyKGluc3RhbmNpbmdEYXRhLnZlcnRleEJ1ZmZlcik7XG4gICAgICAgICAgICAgICAgZGV2aWNlLmRyYXcobWVzaC5wcmltaXRpdmVbc3R5bGVdLCBpbnN0YW5jaW5nRGF0YS5jb3VudCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zdCBtb2RlbE1hdHJpeCA9IG1lc2hJbnN0YW5jZS5ub2RlLndvcmxkVHJhbnNmb3JtO1xuICAgICAgICAgICAgdGhpcy5tb2RlbE1hdHJpeElkLnNldFZhbHVlKG1vZGVsTWF0cml4LmRhdGEpO1xuXG4gICAgICAgICAgICBpZiAobm9ybWFsKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5ub3JtYWxNYXRyaXhJZC5zZXRWYWx1ZShtZXNoSW5zdGFuY2Uubm9kZS5ub3JtYWxNYXRyaXguZGF0YSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGRldmljZS5kcmF3KG1lc2gucHJpbWl0aXZlW3N0eWxlXSk7XG4gICAgICAgIH1cblxuICAgICAgICBEZWJ1Z0dyYXBoaWNzLnBvcEdwdU1hcmtlcihkZXZpY2UpO1xuICAgIH1cblxuICAgIC8vIHVzZWQgZm9yIHN0ZXJlb1xuICAgIGRyYXdJbnN0YW5jZTIoZGV2aWNlLCBtZXNoSW5zdGFuY2UsIG1lc2gsIHN0eWxlKSB7XG5cbiAgICAgICAgRGVidWdHcmFwaGljcy5wdXNoR3B1TWFya2VyKGRldmljZSwgbWVzaEluc3RhbmNlLm5vZGUubmFtZSk7XG5cbiAgICAgICAgY29uc3QgaW5zdGFuY2luZ0RhdGEgPSBtZXNoSW5zdGFuY2UuaW5zdGFuY2luZ0RhdGE7XG4gICAgICAgIGlmIChpbnN0YW5jaW5nRGF0YSkge1xuICAgICAgICAgICAgaWYgKGluc3RhbmNpbmdEYXRhLmNvdW50ID4gMCkge1xuICAgICAgICAgICAgICAgIHRoaXMuX2luc3RhbmNlZERyYXdDYWxscysrO1xuICAgICAgICAgICAgICAgIGRldmljZS5kcmF3KG1lc2gucHJpbWl0aXZlW3N0eWxlXSwgaW5zdGFuY2luZ0RhdGEuY291bnQsIHRydWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gbWF0cmljZXMgYXJlIGFscmVhZHkgc2V0XG4gICAgICAgICAgICBkZXZpY2UuZHJhdyhtZXNoLnByaW1pdGl2ZVtzdHlsZV0sIHVuZGVmaW5lZCwgdHJ1ZSk7XG4gICAgICAgIH1cblxuICAgICAgICBEZWJ1Z0dyYXBoaWNzLnBvcEdwdU1hcmtlcihkZXZpY2UpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuLi9jYW1lcmEuanMnKS5DYW1lcmF9IGNhbWVyYSAtIFRoZSBjYW1lcmEgdXNlZCBmb3IgY3VsbGluZy5cbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi4vbWVzaC1pbnN0YW5jZS5qcycpLk1lc2hJbnN0YW5jZVtdfSBkcmF3Q2FsbHMgLSBEcmF3IGNhbGxzIHRvIGN1bGwuXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4uL2xheWVyLmpzJykuQ3VsbGVkSW5zdGFuY2VzfSBjdWxsZWRJbnN0YW5jZXMgLSBTdG9yZXMgY3VsbGVkIGluc3RhbmNlcy5cbiAgICAgKi9cbiAgICBjdWxsKGNhbWVyYSwgZHJhd0NhbGxzLCBjdWxsZWRJbnN0YW5jZXMpIHtcbiAgICAgICAgLy8gI2lmIF9QUk9GSUxFUlxuICAgICAgICBjb25zdCBjdWxsVGltZSA9IG5vdygpO1xuICAgICAgICAvLyAjZW5kaWZcblxuICAgICAgICBjb25zdCBvcGFxdWUgPSBjdWxsZWRJbnN0YW5jZXMub3BhcXVlO1xuICAgICAgICBvcGFxdWUubGVuZ3RoID0gMDtcbiAgICAgICAgY29uc3QgdHJhbnNwYXJlbnQgPSBjdWxsZWRJbnN0YW5jZXMudHJhbnNwYXJlbnQ7XG4gICAgICAgIHRyYW5zcGFyZW50Lmxlbmd0aCA9IDA7XG5cbiAgICAgICAgY29uc3QgZG9DdWxsID0gY2FtZXJhLmZydXN0dW1DdWxsaW5nO1xuICAgICAgICBjb25zdCBjb3VudCA9IGRyYXdDYWxscy5sZW5ndGg7XG5cbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjb3VudDsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBkcmF3Q2FsbCA9IGRyYXdDYWxsc1tpXTtcbiAgICAgICAgICAgIGlmIChkcmF3Q2FsbC52aXNpYmxlKSB7XG5cbiAgICAgICAgICAgICAgICBjb25zdCB2aXNpYmxlID0gIWRvQ3VsbCB8fCAhZHJhd0NhbGwuY3VsbCB8fCBkcmF3Q2FsbC5faXNWaXNpYmxlKGNhbWVyYSk7XG4gICAgICAgICAgICAgICAgaWYgKHZpc2libGUpIHtcbiAgICAgICAgICAgICAgICAgICAgZHJhd0NhbGwudmlzaWJsZVRoaXNGcmFtZSA9IHRydWU7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gc29ydCBtZXNoIGluc3RhbmNlIGludG8gdGhlIHJpZ2h0IGJ1Y2tldCBiYXNlZCBvbiBpdHMgdHJhbnNwYXJlbmN5XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGJ1Y2tldCA9IGRyYXdDYWxsLnRyYW5zcGFyZW50ID8gdHJhbnNwYXJlbnQgOiBvcGFxdWU7XG4gICAgICAgICAgICAgICAgICAgIGJ1Y2tldC5wdXNoKGRyYXdDYWxsKTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAoZHJhd0NhbGwuc2tpbkluc3RhbmNlIHx8IGRyYXdDYWxsLm1vcnBoSW5zdGFuY2UpXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnByb2Nlc3NpbmdNZXNoSW5zdGFuY2VzLmFkZChkcmF3Q2FsbCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gI2lmIF9QUk9GSUxFUlxuICAgICAgICB0aGlzLl9jdWxsVGltZSArPSBub3coKSAtIGN1bGxUaW1lO1xuICAgICAgICB0aGlzLl9udW1EcmF3Q2FsbHNDdWxsZWQgKz0gZG9DdWxsID8gY291bnQgOiAwO1xuICAgICAgICAvLyAjZW5kaWZcbiAgICB9XG5cbiAgICBjb2xsZWN0TGlnaHRzKGNvbXApIHtcblxuICAgICAgICAvLyBidWlsZCBhIGxpc3QgYW5kIG9mIGFsbCB1bmlxdWUgbGlnaHRzIGZyb20gYWxsIGxheWVyc1xuICAgICAgICB0aGlzLmxpZ2h0cy5sZW5ndGggPSAwO1xuICAgICAgICB0aGlzLmxvY2FsTGlnaHRzLmxlbmd0aCA9IDA7XG5cbiAgICAgICAgLy8gc3RhdHNcbiAgICAgICAgY29uc3Qgc3RhdHMgPSB0aGlzLnNjZW5lLl9zdGF0cztcblxuICAgICAgICAvLyAjaWYgX1BST0ZJTEVSXG5cbiAgICAgICAgc3RhdHMuZHluYW1pY0xpZ2h0cyA9IDA7XG4gICAgICAgIHN0YXRzLmJha2VkTGlnaHRzID0gMDtcblxuICAgICAgICAvLyAjZW5kaWZcblxuICAgICAgICBjb25zdCBjb3VudCA9IGNvbXAubGF5ZXJMaXN0Lmxlbmd0aDtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjb3VudDsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBsYXllciA9IGNvbXAubGF5ZXJMaXN0W2ldO1xuXG4gICAgICAgICAgICAvLyBsYXllciBjYW4gYmUgaW4gdGhlIGxpc3QgdHdvIHRpbWVzIChvcGFxdWUsIHRyYW5zcCksIHByb2Nlc3MgaXQgb25seSBvbmUgdGltZVxuICAgICAgICAgICAgaWYgKCFfdGVtcExheWVyU2V0LmhhcyhsYXllcikpIHtcbiAgICAgICAgICAgICAgICBfdGVtcExheWVyU2V0LmFkZChsYXllcik7XG5cbiAgICAgICAgICAgICAgICBjb25zdCBsaWdodHMgPSBsYXllci5fbGlnaHRzO1xuICAgICAgICAgICAgICAgIGZvciAobGV0IGogPSAwOyBqIDwgbGlnaHRzLmxlbmd0aDsgaisrKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGxpZ2h0ID0gbGlnaHRzW2pdO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIGFkZCBuZXcgbGlnaHRcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFfdGVtcExpZ2h0U2V0LmhhcyhsaWdodCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIF90ZW1wTGlnaHRTZXQuYWRkKGxpZ2h0KTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5saWdodHMucHVzaChsaWdodCk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChsaWdodC5fdHlwZSAhPT0gTElHSFRUWVBFX0RJUkVDVElPTkFMKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5sb2NhbExpZ2h0cy5wdXNoKGxpZ2h0KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gI2lmIF9QUk9GSUxFUlxuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBpZiBhZmZlY3RzIGR5bmFtaWMgb3IgYmFrZWQgb2JqZWN0cyBpbiByZWFsLXRpbWVcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICgobGlnaHQubWFzayAmIE1BU0tfQUZGRUNUX0RZTkFNSUMpIHx8IChsaWdodC5tYXNrICYgTUFTS19BRkZFQ1RfTElHSFRNQVBQRUQpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc3RhdHMuZHluYW1pY0xpZ2h0cysrO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBiYWtlIGxpZ2h0c1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGxpZ2h0Lm1hc2sgJiBNQVNLX0JBS0UpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGF0cy5iYWtlZExpZ2h0cysrO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyAjZW5kaWZcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHN0YXRzLmxpZ2h0cyA9IHRoaXMubGlnaHRzLmxlbmd0aDtcblxuICAgICAgICBfdGVtcExpZ2h0U2V0LmNsZWFyKCk7XG4gICAgICAgIF90ZW1wTGF5ZXJTZXQuY2xlYXIoKTtcbiAgICB9XG5cbiAgICBjdWxsTGlnaHRzKGNhbWVyYSwgbGlnaHRzKSB7XG5cbiAgICAgICAgY29uc3QgY2x1c3RlcmVkTGlnaHRpbmdFbmFibGVkID0gdGhpcy5zY2VuZS5jbHVzdGVyZWRMaWdodGluZ0VuYWJsZWQ7XG4gICAgICAgIGNvbnN0IHBoeXNpY2FsVW5pdHMgPSB0aGlzLnNjZW5lLnBoeXNpY2FsVW5pdHM7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbGlnaHRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBsaWdodCA9IGxpZ2h0c1tpXTtcblxuICAgICAgICAgICAgaWYgKGxpZ2h0LmVuYWJsZWQpIHtcbiAgICAgICAgICAgICAgICAvLyBkaXJlY3Rpb25hbCBsaWdodHMgYXJlIG1hcmtlZCB2aXNpYmxlIGF0IHRoZSBzdGFydCBvZiB0aGUgZnJhbWVcbiAgICAgICAgICAgICAgICBpZiAobGlnaHQuX3R5cGUgIT09IExJR0hUVFlQRV9ESVJFQ1RJT05BTCkge1xuICAgICAgICAgICAgICAgICAgICBsaWdodC5nZXRCb3VuZGluZ1NwaGVyZSh0ZW1wU3BoZXJlKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNhbWVyYS5mcnVzdHVtLmNvbnRhaW5zU3BoZXJlKHRlbXBTcGhlcmUpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBsaWdodC52aXNpYmxlVGhpc0ZyYW1lID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxpZ2h0LnVzZVBoeXNpY2FsVW5pdHMgPSBwaHlzaWNhbFVuaXRzO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBtYXhpbXVtIHNjcmVlbiBhcmVhIHRha2VuIGJ5IHRoZSBsaWdodFxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgc2NyZWVuU2l6ZSA9IGNhbWVyYS5nZXRTY3JlZW5TaXplKHRlbXBTcGhlcmUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgbGlnaHQubWF4U2NyZWVuU2l6ZSA9IE1hdGgubWF4KGxpZ2h0Lm1heFNjcmVlblNpemUsIHNjcmVlblNpemUpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gaWYgc2hhZG93IGNhc3RpbmcgbGlnaHQgZG9lcyBub3QgaGF2ZSBzaGFkb3cgbWFwIGFsbG9jYXRlZCwgbWFyayBpdCB2aXNpYmxlIHRvIGFsbG9jYXRlIHNoYWRvdyBtYXBcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIE5vdGU6IFRoaXMgd29uJ3QgYmUgbmVlZGVkIHdoZW4gY2x1c3RlcmVkIHNoYWRvd3MgYXJlIHVzZWQsIGJ1dCBhdCB0aGUgbW9tZW50IGV2ZW4gY3VsbGVkIG91dCBsaWdodHNcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGFyZSB1c2VkIGZvciByZW5kZXJpbmcsIGFuZCBuZWVkIHNoYWRvdyBtYXAgdG8gYmUgYWxsb2NhdGVkXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBUT0RPOiBkZWxldGUgdGhpcyBjb2RlIHdoZW4gY2x1c3RlcmVkTGlnaHRpbmdFbmFibGVkIGlzIGJlaW5nIHJlbW92ZWQgYW5kIGlzIG9uIGJ5IGRlZmF1bHQuXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIWNsdXN0ZXJlZExpZ2h0aW5nRW5hYmxlZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChsaWdodC5jYXN0U2hhZG93cyAmJiAhbGlnaHQuc2hhZG93TWFwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxpZ2h0LnZpc2libGVUaGlzRnJhbWUgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGxpZ2h0LnVzZVBoeXNpY2FsVW5pdHMgPSB0aGlzLnNjZW5lLnBoeXNpY2FsVW5pdHM7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2hhZG93IG1hcCBjdWxsaW5nIGZvciBkaXJlY3Rpb25hbCBhbmQgdmlzaWJsZSBsb2NhbCBsaWdodHNcbiAgICAgKiB2aXNpYmxlIG1lc2hJbnN0YW5jZXMgYXJlIGNvbGxlY3RlZCBpbnRvIGxpZ2h0Ll9yZW5kZXJEYXRhLCBhbmQgYXJlIG1hcmtlZCBhcyB2aXNpYmxlXG4gICAgICogZm9yIGRpcmVjdGlvbmFsIGxpZ2h0cyBhbHNvIHNoYWRvdyBjYW1lcmEgbWF0cml4IGlzIHNldCB1cFxuICAgICAqXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4uL2NvbXBvc2l0aW9uL2xheWVyLWNvbXBvc2l0aW9uLmpzJykuTGF5ZXJDb21wb3NpdGlvbn0gY29tcCAtIFRoZSBsYXllclxuICAgICAqIGNvbXBvc2l0aW9uLlxuICAgICAqL1xuICAgIGN1bGxTaGFkb3dtYXBzKGNvbXApIHtcblxuICAgICAgICBjb25zdCBpc0NsdXN0ZXJlZCA9IHRoaXMuc2NlbmUuY2x1c3RlcmVkTGlnaHRpbmdFbmFibGVkO1xuXG4gICAgICAgIC8vIHNoYWRvdyBjYXN0ZXJzIGN1bGxpbmcgZm9yIGxvY2FsIChwb2ludCBhbmQgc3BvdCkgbGlnaHRzXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5sb2NhbExpZ2h0cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgY29uc3QgbGlnaHQgPSB0aGlzLmxvY2FsTGlnaHRzW2ldO1xuICAgICAgICAgICAgaWYgKGxpZ2h0Ll90eXBlICE9PSBMSUdIVFRZUEVfRElSRUNUSU9OQUwpIHtcblxuICAgICAgICAgICAgICAgIGlmIChpc0NsdXN0ZXJlZCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBpZiBhdGxhcyBzbG90IGlzIHJlYXNzaWduZWQsIG1ha2Ugc3VyZSB0byB1cGRhdGUgdGhlIHNoYWRvdyBtYXAsIGluY2x1ZGluZyB0aGUgY3VsbGluZ1xuICAgICAgICAgICAgICAgICAgICBpZiAobGlnaHQuYXRsYXNTbG90VXBkYXRlZCAmJiBsaWdodC5zaGFkb3dVcGRhdGVNb2RlID09PSBTSEFET1dVUERBVEVfTk9ORSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgbGlnaHQuc2hhZG93VXBkYXRlTW9kZSA9IFNIQURPV1VQREFURV9USElTRlJBTUU7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIGZvcmNlIHJlbmRlcmluZyBzaGFkb3cgYXQgbGVhc3Qgb25jZSB0byBhbGxvY2F0ZSB0aGUgc2hhZG93IG1hcCBuZWVkZWQgYnkgdGhlIHNoYWRlcnNcbiAgICAgICAgICAgICAgICAgICAgaWYgKGxpZ2h0LnNoYWRvd1VwZGF0ZU1vZGUgPT09IFNIQURPV1VQREFURV9OT05FICYmIGxpZ2h0LmNhc3RTaGFkb3dzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIWxpZ2h0LmdldFJlbmRlckRhdGEobnVsbCwgMCkuc2hhZG93Q2FtZXJhLnJlbmRlclRhcmdldCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxpZ2h0LnNoYWRvd1VwZGF0ZU1vZGUgPSBTSEFET1dVUERBVEVfVEhJU0ZSQU1FO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKGxpZ2h0LnZpc2libGVUaGlzRnJhbWUgJiYgbGlnaHQuY2FzdFNoYWRvd3MgJiYgbGlnaHQuc2hhZG93VXBkYXRlTW9kZSAhPT0gU0hBRE9XVVBEQVRFX05PTkUpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fc2hhZG93UmVuZGVyZXJMb2NhbC5jdWxsKGxpZ2h0LCBjb21wKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBzaGFkb3cgY2FzdGVycyBjdWxsaW5nIGZvciBkaXJlY3Rpb25hbCBsaWdodHNcbiAgICAgICAgY29uc3QgcmVuZGVyQWN0aW9ucyA9IGNvbXAuX3JlbmRlckFjdGlvbnM7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcmVuZGVyQWN0aW9ucy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgY29uc3QgcmVuZGVyQWN0aW9uID0gcmVuZGVyQWN0aW9uc1tpXTtcbiAgICAgICAgICAgIHJlbmRlckFjdGlvbi5kaXJlY3Rpb25hbExpZ2h0cy5sZW5ndGggPSAwO1xuICAgICAgICAgICAgY29uc3QgY2FtZXJhID0gcmVuZGVyQWN0aW9uLmNhbWVyYS5jYW1lcmE7XG5cbiAgICAgICAgICAgIC8vIGZpcnN0IHVzZSBvZiBlYWNoIGNhbWVyYSByZW5kZXJzIGRpcmVjdGlvbmFsIHNoYWRvd3NcbiAgICAgICAgICAgIGlmIChyZW5kZXJBY3Rpb24uZmlyc3RDYW1lcmFVc2UpICB7XG5cbiAgICAgICAgICAgICAgICAvLyBnZXQgZGlyZWN0aW9uYWwgbGlnaHRzIGZyb20gYWxsIGxheWVycyBvZiB0aGUgY2FtZXJhXG4gICAgICAgICAgICAgICAgY29uc3QgY2FtZXJhTGF5ZXJzID0gY2FtZXJhLmxheWVycztcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBsID0gMDsgbCA8IGNhbWVyYUxheWVycy5sZW5ndGg7IGwrKykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBjYW1lcmFMYXllciA9IGNvbXAuZ2V0TGF5ZXJCeUlkKGNhbWVyYUxheWVyc1tsXSk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChjYW1lcmFMYXllcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbGF5ZXJEaXJMaWdodHMgPSBjYW1lcmFMYXllci5zcGxpdExpZ2h0c1tMSUdIVFRZUEVfRElSRUNUSU9OQUxdO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGxldCBqID0gMDsgaiA8IGxheWVyRGlyTGlnaHRzLmxlbmd0aDsgaisrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbGlnaHQgPSBsYXllckRpckxpZ2h0c1tqXTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHVuaXF1ZSBzaGFkb3cgY2FzdGluZyBsaWdodHNcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAobGlnaHQuY2FzdFNoYWRvd3MgJiYgIV90ZW1wU2V0LmhhcyhsaWdodCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgX3RlbXBTZXQuYWRkKGxpZ2h0KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVuZGVyQWN0aW9uLmRpcmVjdGlvbmFsTGlnaHRzLnB1c2gobGlnaHQpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGZydXN0dW0gY3VsbGluZyBmb3IgdGhlIGRpcmVjdGlvbmFsIHNoYWRvdyB3aGVuIHJlbmRlcmluZyB0aGUgY2FtZXJhXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3NoYWRvd1JlbmRlcmVyRGlyZWN0aW9uYWwuY3VsbChsaWdodCwgY29tcCwgY2FtZXJhKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBfdGVtcFNldC5jbGVhcigpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogdmlzaWJpbGl0eSBjdWxsaW5nIG9mIGxpZ2h0cywgbWVzaEluc3RhbmNlcywgc2hhZG93cyBjYXN0ZXJzXG4gICAgICogQWxzbyBhcHBsaWVzIG1lc2hJbnN0YW5jZS52aXNpYmxlXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi4vY29tcG9zaXRpb24vbGF5ZXItY29tcG9zaXRpb24uanMnKS5MYXllckNvbXBvc2l0aW9ufSBjb21wIC0gVGhlIGxheWVyXG4gICAgICogY29tcG9zaXRpb24uXG4gICAgICovXG4gICAgY3VsbENvbXBvc2l0aW9uKGNvbXApIHtcblxuICAgICAgICAvLyAjaWYgX1BST0ZJTEVSXG4gICAgICAgIGNvbnN0IGN1bGxUaW1lID0gbm93KCk7XG4gICAgICAgIC8vICNlbmRpZlxuXG4gICAgICAgIHRoaXMucHJvY2Vzc2luZ01lc2hJbnN0YW5jZXMuY2xlYXIoKTtcblxuICAgICAgICBjb25zdCByZW5kZXJBY3Rpb25zID0gY29tcC5fcmVuZGVyQWN0aW9ucztcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCByZW5kZXJBY3Rpb25zLmxlbmd0aDsgaSsrKSB7XG5cbiAgICAgICAgICAgIC8qKiBAdHlwZSB7aW1wb3J0KCcuLi9jb21wb3NpdGlvbi9yZW5kZXItYWN0aW9uLmpzJykuUmVuZGVyQWN0aW9ufSAqL1xuICAgICAgICAgICAgY29uc3QgcmVuZGVyQWN0aW9uID0gcmVuZGVyQWN0aW9uc1tpXTtcblxuICAgICAgICAgICAgLy8gbGF5ZXJcbiAgICAgICAgICAgIGNvbnN0IGxheWVySW5kZXggPSByZW5kZXJBY3Rpb24ubGF5ZXJJbmRleDtcbiAgICAgICAgICAgIC8qKiBAdHlwZSB7aW1wb3J0KCcuLi9sYXllci5qcycpLkxheWVyfSAqL1xuICAgICAgICAgICAgY29uc3QgbGF5ZXIgPSBjb21wLmxheWVyTGlzdFtsYXllckluZGV4XTtcbiAgICAgICAgICAgIGlmICghbGF5ZXIuZW5hYmxlZCB8fCAhY29tcC5zdWJMYXllckVuYWJsZWRbbGF5ZXJJbmRleF0pIGNvbnRpbnVlO1xuXG4gICAgICAgICAgICAvLyBjYW1lcmFcbiAgICAgICAgICAgIGNvbnN0IGNhbWVyYVBhc3MgPSByZW5kZXJBY3Rpb24uY2FtZXJhSW5kZXg7XG4gICAgICAgICAgICAvKiogQHR5cGUge2ltcG9ydCgnLi4vLi4vZnJhbWV3b3JrL2NvbXBvbmVudHMvY2FtZXJhL2NvbXBvbmVudC5qcycpLkNhbWVyYUNvbXBvbmVudH0gKi9cbiAgICAgICAgICAgIGNvbnN0IGNhbWVyYSA9IGxheWVyLmNhbWVyYXNbY2FtZXJhUGFzc107XG5cbiAgICAgICAgICAgIGlmIChjYW1lcmEpIHtcblxuICAgICAgICAgICAgICAgIGNhbWVyYS5mcmFtZVVwZGF0ZShyZW5kZXJBY3Rpb24ucmVuZGVyVGFyZ2V0KTtcblxuICAgICAgICAgICAgICAgIC8vIHVwZGF0ZSBjYW1lcmEgYW5kIGZydXN0dW0gb25jZVxuICAgICAgICAgICAgICAgIGlmIChyZW5kZXJBY3Rpb24uZmlyc3RDYW1lcmFVc2UpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy51cGRhdGVDYW1lcmFGcnVzdHVtKGNhbWVyYS5jYW1lcmEpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9jYW1lcmFzUmVuZGVyZWQrKztcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBjdWxsIGVhY2ggbGF5ZXIncyBub24tZGlyZWN0aW9uYWwgbGlnaHRzIG9uY2Ugd2l0aCBlYWNoIGNhbWVyYVxuICAgICAgICAgICAgICAgIC8vIGxpZ2h0cyBhcmVuJ3QgY29sbGVjdGVkIGFueXdoZXJlLCBidXQgbWFya2VkIGFzIHZpc2libGVcbiAgICAgICAgICAgICAgICB0aGlzLmN1bGxMaWdodHMoY2FtZXJhLmNhbWVyYSwgbGF5ZXIuX2xpZ2h0cyk7XG5cbiAgICAgICAgICAgICAgICAvLyBjdWxsIG1lc2ggaW5zdGFuY2VzXG4gICAgICAgICAgICAgICAgbGF5ZXIub25QcmVDdWxsPy4oY2FtZXJhUGFzcyk7XG5cbiAgICAgICAgICAgICAgICBjb25zdCBjdWxsZWRJbnN0YW5jZXMgPSBsYXllci5nZXRDdWxsZWRJbnN0YW5jZXMoY2FtZXJhLmNhbWVyYSk7XG4gICAgICAgICAgICAgICAgY29uc3QgZHJhd0NhbGxzID0gbGF5ZXIubWVzaEluc3RhbmNlcztcbiAgICAgICAgICAgICAgICB0aGlzLmN1bGwoY2FtZXJhLmNhbWVyYSwgZHJhd0NhbGxzLCBjdWxsZWRJbnN0YW5jZXMpO1xuXG4gICAgICAgICAgICAgICAgbGF5ZXIub25Qb3N0Q3VsbD8uKGNhbWVyYVBhc3MpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gdXBkYXRlIHNoYWRvdyAvIGNvb2tpZSBhdGxhcyBhbGxvY2F0aW9uIGZvciB0aGUgdmlzaWJsZSBsaWdodHMuIFVwZGF0ZSBpdCBhZnRlciB0aGUgbGlndGh0cyB3ZXJlIGN1bGxlZCxcbiAgICAgICAgLy8gYnV0IGJlZm9yZSBzaGFkb3cgbWFwcyB3ZXJlIGN1bGxpbmcsIGFzIGl0IG1pZ2h0IGZvcmNlIHNvbWUgJ3VwZGF0ZSBvbmNlJyBzaGFkb3dzIHRvIGN1bGwuXG4gICAgICAgIGlmICh0aGlzLnNjZW5lLmNsdXN0ZXJlZExpZ2h0aW5nRW5hYmxlZCkge1xuICAgICAgICAgICAgdGhpcy51cGRhdGVMaWdodFRleHR1cmVBdGxhcygpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gY3VsbCBzaGFkb3cgY2FzdGVycyBmb3IgYWxsIGxpZ2h0c1xuICAgICAgICB0aGlzLmN1bGxTaGFkb3dtYXBzKGNvbXApO1xuXG4gICAgICAgIC8vICNpZiBfUFJPRklMRVJcbiAgICAgICAgdGhpcy5fY3VsbFRpbWUgKz0gbm93KCkgLSBjdWxsVGltZTtcbiAgICAgICAgLy8gI2VuZGlmXG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4uL21lc2gtaW5zdGFuY2UuanMnKS5NZXNoSW5zdGFuY2VbXX0gZHJhd0NhbGxzIC0gTWVzaCBpbnN0YW5jZXMuXG4gICAgICogQHBhcmFtIHtib29sZWFufSBvbmx5TGl0U2hhZGVycyAtIExpbWl0cyB0aGUgdXBkYXRlIHRvIHNoYWRlcnMgYWZmZWN0ZWQgYnkgbGlnaHRpbmcuXG4gICAgICovXG4gICAgdXBkYXRlU2hhZGVycyhkcmF3Q2FsbHMsIG9ubHlMaXRTaGFkZXJzKSB7XG4gICAgICAgIGNvbnN0IGNvdW50ID0gZHJhd0NhbGxzLmxlbmd0aDtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjb3VudDsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBtYXQgPSBkcmF3Q2FsbHNbaV0ubWF0ZXJpYWw7XG4gICAgICAgICAgICBpZiAobWF0KSB7XG4gICAgICAgICAgICAgICAgLy8gbWF0ZXJpYWwgbm90IHByb2Nlc3NlZCB5ZXRcbiAgICAgICAgICAgICAgICBpZiAoIV90ZW1wU2V0LmhhcyhtYXQpKSB7XG4gICAgICAgICAgICAgICAgICAgIF90ZW1wU2V0LmFkZChtYXQpO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIHNraXAgdGhpcyBmb3IgbWF0ZXJpYWxzIG5vdCB1c2luZyB2YXJpYW50c1xuICAgICAgICAgICAgICAgICAgICBpZiAobWF0LmdldFNoYWRlclZhcmlhbnQgIT09IE1hdGVyaWFsLnByb3RvdHlwZS5nZXRTaGFkZXJWYXJpYW50KSB7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChvbmx5TGl0U2hhZGVycykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHNraXAgbWF0ZXJpYWxzIG5vdCB1c2luZyBsaWdodGluZ1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghbWF0LnVzZUxpZ2h0aW5nIHx8IChtYXQuZW1pdHRlciAmJiAhbWF0LmVtaXR0ZXIubGlnaHRpbmcpKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gY2xlYXIgc2hhZGVyIHZhcmlhbnRzIG9uIHRoZSBtYXRlcmlhbCBhbmQgYWxzbyBvbiBtZXNoIGluc3RhbmNlcyB0aGF0IHVzZSBpdFxuICAgICAgICAgICAgICAgICAgICAgICAgbWF0LmNsZWFyVmFyaWFudHMoKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGtlZXAgdGVtcCBzZXQgZW1wdHlcbiAgICAgICAgX3RlbXBTZXQuY2xlYXIoKTtcbiAgICB9XG5cbiAgICByZW5kZXJDb29raWVzKGxpZ2h0cykge1xuICAgICAgICB0aGlzLl9jb29raWVSZW5kZXJlci5yZW5kZXIobGlnaHRzKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi4vY29tcG9zaXRpb24vbGF5ZXItY29tcG9zaXRpb24uanMnKS5MYXllckNvbXBvc2l0aW9ufSBjb21wIC0gVGhlIGxheWVyXG4gICAgICogY29tcG9zaXRpb24gdG8gdXBkYXRlLlxuICAgICAqL1xuICAgIGJlZ2luRnJhbWUoY29tcCkge1xuXG4gICAgICAgIGNvbnN0IHNjZW5lID0gdGhpcy5zY2VuZTtcbiAgICAgICAgY29uc3QgdXBkYXRlU2hhZGVycyA9IHNjZW5lLnVwZGF0ZVNoYWRlcnM7XG5cbiAgICAgICAgbGV0IHRvdGFsTWVzaEluc3RhbmNlcyA9IDA7XG4gICAgICAgIGNvbnN0IGxheWVycyA9IGNvbXAubGF5ZXJMaXN0O1xuICAgICAgICBjb25zdCBsYXllckNvdW50ID0gbGF5ZXJzLmxlbmd0aDtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBsYXllckNvdW50OyBpKyspIHtcbiAgICAgICAgICAgIGNvbnN0IGxheWVyID0gbGF5ZXJzW2ldO1xuXG4gICAgICAgICAgICBjb25zdCBtZXNoSW5zdGFuY2VzID0gbGF5ZXIubWVzaEluc3RhbmNlcztcbiAgICAgICAgICAgIGNvbnN0IGNvdW50ID0gbWVzaEluc3RhbmNlcy5sZW5ndGg7XG4gICAgICAgICAgICB0b3RhbE1lc2hJbnN0YW5jZXMgKz0gY291bnQ7XG5cbiAgICAgICAgICAgIGZvciAobGV0IGogPSAwOyBqIDwgY291bnQ7IGorKykge1xuICAgICAgICAgICAgICAgIGNvbnN0IG1lc2hJbnN0ID0gbWVzaEluc3RhbmNlc1tqXTtcblxuICAgICAgICAgICAgICAgIC8vIGNsZWFyIHZpc2liaWxpdHlcbiAgICAgICAgICAgICAgICBtZXNoSW5zdC52aXNpYmxlVGhpc0ZyYW1lID0gZmFsc2U7XG5cbiAgICAgICAgICAgICAgICAvLyBjb2xsZWN0IGFsbCBtZXNoIGluc3RhbmNlcyBpZiB3ZSBuZWVkIHRvIHVwZGF0ZSB0aGVpciBzaGFkZXJzLiBOb3RlIHRoYXQgdGhlcmUgY291bGRcbiAgICAgICAgICAgICAgICAvLyBiZSBkdXBsaWNhdGVzLCB3aGljaCBpcyBub3QgYSBwcm9ibGVtIGZvciB0aGUgc2hhZGVyIHVwZGF0ZXMsIHNvIHdlIGRvIG5vdCBmaWx0ZXIgdGhlbSBvdXQuXG4gICAgICAgICAgICAgICAgaWYgKHVwZGF0ZVNoYWRlcnMpIHtcbiAgICAgICAgICAgICAgICAgICAgX3RlbXBNZXNoSW5zdGFuY2VzLnB1c2gobWVzaEluc3QpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIGNvbGxlY3Qgc2tpbm5lZCBtZXNoIGluc3RhbmNlc1xuICAgICAgICAgICAgICAgIGlmIChtZXNoSW5zdC5za2luSW5zdGFuY2UpIHtcbiAgICAgICAgICAgICAgICAgICAgX3RlbXBNZXNoSW5zdGFuY2VzU2tpbm5lZC5wdXNoKG1lc2hJbnN0KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyAjaWYgX1BST0ZJTEVSXG4gICAgICAgIHNjZW5lLl9zdGF0cy5tZXNoSW5zdGFuY2VzID0gdG90YWxNZXNoSW5zdGFuY2VzO1xuICAgICAgICAvLyAjZW5kaWZcblxuICAgICAgICAvLyB1cGRhdGUgc2hhZGVycyBpZiBuZWVkZWRcbiAgICAgICAgaWYgKHVwZGF0ZVNoYWRlcnMpIHtcbiAgICAgICAgICAgIGNvbnN0IG9ubHlMaXRTaGFkZXJzID0gIXNjZW5lLnVwZGF0ZVNoYWRlcnM7XG4gICAgICAgICAgICB0aGlzLnVwZGF0ZVNoYWRlcnMoX3RlbXBNZXNoSW5zdGFuY2VzLCBvbmx5TGl0U2hhZGVycyk7XG4gICAgICAgICAgICBzY2VuZS51cGRhdGVTaGFkZXJzID0gZmFsc2U7XG4gICAgICAgICAgICBzY2VuZS5fc2hhZGVyVmVyc2lvbisrO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gVXBkYXRlIGFsbCBza2luIG1hdHJpY2VzIHRvIHByb3Blcmx5IGN1bGwgc2tpbm5lZCBvYmplY3RzIChidXQgZG9uJ3QgdXBkYXRlIHJlbmRlcmluZyBkYXRhIHlldClcbiAgICAgICAgdGhpcy51cGRhdGVDcHVTa2luTWF0cmljZXMoX3RlbXBNZXNoSW5zdGFuY2VzU2tpbm5lZCk7XG5cbiAgICAgICAgLy8gY2xlYXIgbGlnaHQgYXJyYXlzXG4gICAgICAgIF90ZW1wTWVzaEluc3RhbmNlcy5sZW5ndGggPSAwO1xuICAgICAgICBfdGVtcE1lc2hJbnN0YW5jZXNTa2lubmVkLmxlbmd0aCA9IDA7XG5cbiAgICAgICAgLy8gY2xlYXIgbGlnaHQgdmlzaWJpbGl0eVxuICAgICAgICBjb25zdCBsaWdodHMgPSB0aGlzLmxpZ2h0cztcbiAgICAgICAgY29uc3QgbGlnaHRDb3VudCA9IGxpZ2h0cy5sZW5ndGg7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbGlnaHRDb3VudDsgaSsrKSB7XG4gICAgICAgICAgICBsaWdodHNbaV0uYmVnaW5GcmFtZSgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4uL2NvbXBvc2l0aW9uL2xheWVyLWNvbXBvc2l0aW9uLmpzJykuTGF5ZXJDb21wb3NpdGlvbn0gY29tcCAtIFRoZSBsYXllclxuICAgICAqIGNvbXBvc2l0aW9uLlxuICAgICAqL1xuICAgIHVwZGF0ZUxpZ2h0VGV4dHVyZUF0bGFzKCkge1xuICAgICAgICB0aGlzLmxpZ2h0VGV4dHVyZUF0bGFzLnVwZGF0ZSh0aGlzLmxvY2FsTGlnaHRzLCB0aGlzLnNjZW5lLmxpZ2h0aW5nKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi4vY29tcG9zaXRpb24vbGF5ZXItY29tcG9zaXRpb24uanMnKS5MYXllckNvbXBvc2l0aW9ufSBjb21wIC0gVGhlIGxheWVyXG4gICAgICogY29tcG9zaXRpb24uXG4gICAgICovXG4gICAgdXBkYXRlQ2x1c3RlcnMoY29tcCkge1xuXG4gICAgICAgIC8vICNpZiBfUFJPRklMRVJcbiAgICAgICAgY29uc3Qgc3RhcnRUaW1lID0gbm93KCk7XG4gICAgICAgIC8vICNlbmRpZlxuXG4gICAgICAgIGNvbnN0IHJlbmRlckFjdGlvbnMgPSBjb21wLl9yZW5kZXJBY3Rpb25zO1xuICAgICAgICB0aGlzLndvcmxkQ2x1c3RlcnNBbGxvY2F0b3IudXBkYXRlKHJlbmRlckFjdGlvbnMsIHRoaXMuc2NlbmUuZ2FtbWFDb3JyZWN0aW9uLCB0aGlzLnNjZW5lLmxpZ2h0aW5nKTtcblxuICAgICAgICAvLyAjaWYgX1BST0ZJTEVSXG4gICAgICAgIHRoaXMuX2xpZ2h0Q2x1c3RlcnNUaW1lICs9IG5vdygpIC0gc3RhcnRUaW1lO1xuICAgICAgICB0aGlzLl9saWdodENsdXN0ZXJzID0gdGhpcy53b3JsZENsdXN0ZXJzQWxsb2NhdG9yLmNvdW50O1xuICAgICAgICAvLyAjZW5kaWZcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBVcGRhdGVzIHRoZSBsYXllciBjb21wb3NpdGlvbiBmb3IgcmVuZGVyaW5nLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4uL2NvbXBvc2l0aW9uL2xheWVyLWNvbXBvc2l0aW9uLmpzJykuTGF5ZXJDb21wb3NpdGlvbn0gY29tcCAtIFRoZSBsYXllclxuICAgICAqIGNvbXBvc2l0aW9uIHRvIHVwZGF0ZS5cbiAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IGNsdXN0ZXJlZExpZ2h0aW5nRW5hYmxlZCAtIFRydWUgaWYgY2x1c3RlcmVkIGxpZ2h0aW5nIGlzIGVuYWJsZWQuXG4gICAgICogQGlnbm9yZVxuICAgICAqL1xuICAgIHVwZGF0ZUxheWVyQ29tcG9zaXRpb24oY29tcCwgY2x1c3RlcmVkTGlnaHRpbmdFbmFibGVkKSB7XG5cbiAgICAgICAgLy8gI2lmIF9QUk9GSUxFUlxuICAgICAgICBjb25zdCBsYXllckNvbXBvc2l0aW9uVXBkYXRlVGltZSA9IG5vdygpO1xuICAgICAgICAvLyAjZW5kaWZcblxuICAgICAgICBjb25zdCBsZW4gPSBjb21wLmxheWVyTGlzdC5sZW5ndGg7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgICAgIGNvbXAubGF5ZXJMaXN0W2ldLl9wb3N0UmVuZGVyQ291bnRlciA9IDA7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBzY2VuZSA9IHRoaXMuc2NlbmU7XG4gICAgICAgIGNvbnN0IHNoYWRlclZlcnNpb24gPSBzY2VuZS5fc2hhZGVyVmVyc2lvbjtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBsZW47IGkrKykge1xuICAgICAgICAgICAgY29uc3QgbGF5ZXIgPSBjb21wLmxheWVyTGlzdFtpXTtcbiAgICAgICAgICAgIGxheWVyLl9zaGFkZXJWZXJzaW9uID0gc2hhZGVyVmVyc2lvbjtcbiAgICAgICAgICAgIC8vICNpZiBfUFJPRklMRVJcbiAgICAgICAgICAgIGxheWVyLl9za2lwUmVuZGVyQ291bnRlciA9IDA7XG4gICAgICAgICAgICBsYXllci5fZm9yd2FyZERyYXdDYWxscyA9IDA7XG4gICAgICAgICAgICBsYXllci5fc2hhZG93RHJhd0NhbGxzID0gMDtcbiAgICAgICAgICAgIGxheWVyLl9yZW5kZXJUaW1lID0gMDtcbiAgICAgICAgICAgIC8vICNlbmRpZlxuXG4gICAgICAgICAgICBsYXllci5fcHJlUmVuZGVyQ2FsbGVkRm9yQ2FtZXJhcyA9IDA7XG4gICAgICAgICAgICBsYXllci5fcG9zdFJlbmRlckNhbGxlZEZvckNhbWVyYXMgPSAwO1xuICAgICAgICAgICAgY29uc3QgdHJhbnNwYXJlbnQgPSBjb21wLnN1YkxheWVyTGlzdFtpXTtcbiAgICAgICAgICAgIGlmICh0cmFuc3BhcmVudCkge1xuICAgICAgICAgICAgICAgIGxheWVyLl9wb3N0UmVuZGVyQ291bnRlciB8PSAyO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBsYXllci5fcG9zdFJlbmRlckNvdW50ZXIgfD0gMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGxheWVyLl9wb3N0UmVuZGVyQ291bnRlck1heCA9IGxheWVyLl9wb3N0UmVuZGVyQ291bnRlcjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHVwZGF0ZSBjb21wb3NpdGlvblxuICAgICAgICBjb21wLl91cGRhdGUoKTtcblxuICAgICAgICAvLyAjaWYgX1BST0ZJTEVSXG4gICAgICAgIHRoaXMuX2xheWVyQ29tcG9zaXRpb25VcGRhdGVUaW1lICs9IG5vdygpIC0gbGF5ZXJDb21wb3NpdGlvblVwZGF0ZVRpbWU7XG4gICAgICAgIC8vICNlbmRpZlxuICAgIH1cblxuICAgIGZyYW1lVXBkYXRlKCkge1xuXG4gICAgICAgIHRoaXMuY2x1c3RlcnNEZWJ1Z1JlbmRlcmVkID0gZmFsc2U7XG5cbiAgICAgICAgdGhpcy5pbml0Vmlld0JpbmRHcm91cEZvcm1hdCh0aGlzLnNjZW5lLmNsdXN0ZXJlZExpZ2h0aW5nRW5hYmxlZCk7XG4gICAgfVxufVxuXG5leHBvcnQgeyBSZW5kZXJlciB9O1xuIl0sIm5hbWVzIjpbIl9za2luVXBkYXRlSW5kZXgiLCJib25lVGV4dHVyZVNpemUiLCJ2aWV3UHJvak1hdCIsIk1hdDQiLCJ2aWV3SW52TWF0Iiwidmlld01hdCIsInZpZXdNYXQzIiwiTWF0MyIsInRlbXBTcGhlcmUiLCJCb3VuZGluZ1NwaGVyZSIsIl9mbGlwWU1hdCIsInNldFNjYWxlIiwiX3RlbXBMaWdodFNldCIsIlNldCIsIl90ZW1wTGF5ZXJTZXQiLCJfZml4UHJvalJhbmdlTWF0Iiwic2V0IiwiX3RlbXBQcm9qTWF0MCIsIl90ZW1wUHJvak1hdDEiLCJfdGVtcFByb2pNYXQyIiwiX3RlbXBQcm9qTWF0MyIsIl90ZW1wU2V0IiwiX3RlbXBNZXNoSW5zdGFuY2VzIiwiX3RlbXBNZXNoSW5zdGFuY2VzU2tpbm5lZCIsIlJlbmRlcmVyIiwiY29uc3RydWN0b3IiLCJncmFwaGljc0RldmljZSIsImNsdXN0ZXJzRGVidWdSZW5kZXJlZCIsInByb2Nlc3NpbmdNZXNoSW5zdGFuY2VzIiwid29ybGRDbHVzdGVyc0FsbG9jYXRvciIsImxpZ2h0cyIsImxvY2FsTGlnaHRzIiwiZGV2aWNlIiwic2NlbmUiLCJXb3JsZENsdXN0ZXJzQWxsb2NhdG9yIiwibGlnaHRUZXh0dXJlQXRsYXMiLCJMaWdodFRleHR1cmVBdGxhcyIsInNoYWRvd01hcENhY2hlIiwiU2hhZG93TWFwQ2FjaGUiLCJzaGFkb3dSZW5kZXJlciIsIlNoYWRvd1JlbmRlcmVyIiwiX3NoYWRvd1JlbmRlcmVyTG9jYWwiLCJTaGFkb3dSZW5kZXJlckxvY2FsIiwiX3NoYWRvd1JlbmRlcmVyRGlyZWN0aW9uYWwiLCJTaGFkb3dSZW5kZXJlckRpcmVjdGlvbmFsIiwiX2Nvb2tpZVJlbmRlcmVyIiwiQ29va2llUmVuZGVyZXIiLCJ2aWV3VW5pZm9ybUZvcm1hdCIsInZpZXdCaW5kR3JvdXBGb3JtYXQiLCJfc2tpblRpbWUiLCJfbW9ycGhUaW1lIiwiX2N1bGxUaW1lIiwiX3NoYWRvd01hcFRpbWUiLCJfbGlnaHRDbHVzdGVyc1RpbWUiLCJfbGF5ZXJDb21wb3NpdGlvblVwZGF0ZVRpbWUiLCJfc2hhZG93RHJhd0NhbGxzIiwiX3NraW5EcmF3Q2FsbHMiLCJfaW5zdGFuY2VkRHJhd0NhbGxzIiwiX3NoYWRvd01hcFVwZGF0ZXMiLCJfbnVtRHJhd0NhbGxzQ3VsbGVkIiwiX2NhbWVyYXNSZW5kZXJlZCIsIl9saWdodENsdXN0ZXJzIiwic2NvcGUiLCJib25lVGV4dHVyZUlkIiwicmVzb2x2ZSIsImJvbmVUZXh0dXJlU2l6ZUlkIiwicG9zZU1hdHJpeElkIiwibW9kZWxNYXRyaXhJZCIsIm5vcm1hbE1hdHJpeElkIiwidmlld0ludklkIiwidmlld1BvcyIsIkZsb2F0MzJBcnJheSIsInZpZXdQb3NJZCIsInByb2pJZCIsInByb2pTa3lib3hJZCIsInZpZXdJZCIsInZpZXdJZDMiLCJ2aWV3UHJvaklkIiwiZmxpcFlJZCIsInRibkJhc2lzIiwibmVhckNsaXBJZCIsImZhckNsaXBJZCIsImNhbWVyYVBhcmFtcyIsImNhbWVyYVBhcmFtc0lkIiwiYWxwaGFUZXN0SWQiLCJvcGFjaXR5TWFwSWQiLCJleHBvc3VyZUlkIiwidHdvU2lkZWRMaWdodGluZ05lZ1NjYWxlRmFjdG9ySWQiLCJzZXRWYWx1ZSIsIm1vcnBoV2VpZ2h0c0EiLCJtb3JwaFdlaWdodHNCIiwibW9ycGhQb3NpdGlvblRleCIsIm1vcnBoTm9ybWFsVGV4IiwibW9ycGhUZXhQYXJhbXMiLCJsaWdodEN1YmUiLCJMaWdodEN1YmUiLCJjb25zdGFudExpZ2h0Q3ViZSIsImRlc3Ryb3kiLCJzb3J0Q29tcGFyZSIsImRyYXdDYWxsQSIsImRyYXdDYWxsQiIsImxheWVyIiwiZHJhd09yZGVyIiwiemRpc3QiLCJ6ZGlzdDIiLCJfa2V5IiwiU09SVEtFWV9GT1JXQVJEIiwic29ydENvbXBhcmVNZXNoIiwia2V5QSIsImtleUIiLCJtZXNoIiwiaWQiLCJzb3J0Q29tcGFyZURlcHRoIiwiU09SVEtFWV9ERVBUSCIsInNldHVwVmlld3BvcnQiLCJjYW1lcmEiLCJyZW5kZXJUYXJnZXQiLCJEZWJ1Z0dyYXBoaWNzIiwicHVzaEdwdU1hcmtlciIsInBpeGVsV2lkdGgiLCJ3aWR0aCIsInBpeGVsSGVpZ2h0IiwiaGVpZ2h0IiwicmVjdCIsIngiLCJNYXRoIiwiZmxvb3IiLCJ5IiwidyIsInoiLCJoIiwic2V0Vmlld3BvcnQiLCJfc2Npc3NvclJlY3RDbGVhciIsInNjaXNzb3JSZWN0Iiwic2V0U2Npc3NvciIsInBvcEdwdU1hcmtlciIsInNldENhbWVyYVVuaWZvcm1zIiwidGFyZ2V0IiwiZmxpcFkiLCJ2aWV3Q291bnQiLCJ4ciIsInNlc3Npb24iLCJ0cmFuc2Zvcm0iLCJwYXJlbnQiLCJfbm9kZSIsImdldFdvcmxkVHJhbnNmb3JtIiwidmlld3MiLCJsZW5ndGgiLCJ2IiwidmlldyIsInZpZXdJbnZPZmZNYXQiLCJtdWwyIiwidmlld09mZk1hdCIsImNvcHkiLCJpbnZlcnQiLCJzZXRGcm9tTWF0NCIsInByb2pWaWV3T2ZmTWF0IiwicHJvak1hdCIsInBvc2l0aW9uIiwiZGF0YSIsImZydXN0dW0iLCJwcm9qZWN0aW9uTWF0cml4IiwiY2FsY3VsYXRlUHJvamVjdGlvbiIsIlZJRVdfQ0VOVEVSIiwicHJvak1hdFNreWJveCIsImdldFByb2plY3Rpb25NYXRyaXhTa3lib3giLCJpc1dlYkdQVSIsImNhbGN1bGF0ZVRyYW5zZm9ybSIsInBvcyIsImdldFBvc2l0aW9uIiwicm90IiwiZ2V0Um90YXRpb24iLCJzZXRUUlMiLCJWZWMzIiwiT05FIiwiZGlzcGF0Y2hWaWV3UG9zIiwibiIsIl9uZWFyQ2xpcCIsImYiLCJfZmFyQ2xpcCIsInByb2plY3Rpb24iLCJQUk9KRUNUSU9OX09SVEhPR1JBUEhJQyIsInBoeXNpY2FsVW5pdHMiLCJnZXRFeHBvc3VyZSIsImV4cG9zdXJlIiwiY2xlYXIiLCJjbGVhckNvbG9yIiwiY2xlYXJEZXB0aCIsImNsZWFyU3RlbmNpbCIsImZsYWdzIiwiX2NsZWFyQ29sb3JCdWZmZXIiLCJDTEVBUkZMQUdfQ09MT1IiLCJfY2xlYXJEZXB0aEJ1ZmZlciIsIkNMRUFSRkxBR19ERVBUSCIsIl9jbGVhclN0ZW5jaWxCdWZmZXIiLCJDTEVBUkZMQUdfU1RFTkNJTCIsImNvbG9yIiwiX2NsZWFyQ29sb3IiLCJyIiwiZyIsImIiLCJhIiwiZGVwdGgiLCJfY2xlYXJEZXB0aCIsInN0ZW5jaWwiLCJfY2xlYXJTdGVuY2lsIiwic2V0Q2FtZXJhIiwicmVuZGVyQWN0aW9uIiwiY2xlYXJWaWV3IiwiZm9yY2VXcml0ZSIsInNldFJlbmRlclRhcmdldCIsInVwZGF0ZUJlZ2luIiwic2V0Q29sb3JXcml0ZSIsInNldERlcHRoV3JpdGUiLCJvcHRpb25zIiwiX2NsZWFyT3B0aW9ucyIsInNldHVwQ3VsbE1vZGUiLCJjdWxsRmFjZXMiLCJmbGlwRmFjdG9yIiwiZHJhd0NhbGwiLCJtYXRlcmlhbCIsIm1vZGUiLCJDVUxMRkFDRV9OT05FIiwiZmxpcEZhY2VzIiwiY3VsbCIsIkNVTExGQUNFX0ZST05UIiwiQ1VMTEZBQ0VfQkFDSyIsImZsaXBGYWNlc0ZhY3RvciIsIm5vZGUiLCJ3b3JsZFNjYWxlU2lnbiIsInNldEN1bGxNb2RlIiwidXBkYXRlQ2FtZXJhRnJ1c3R1bSIsInNldEJhc2VDb25zdGFudHMiLCJvcGFjaXR5TWFwIiwiYWxwaGFUZXN0IiwidXBkYXRlQ3B1U2tpbk1hdHJpY2VzIiwiZHJhd0NhbGxzIiwiZHJhd0NhbGxzQ291bnQiLCJza2luVGltZSIsIm5vdyIsImkiLCJzaSIsInNraW5JbnN0YW5jZSIsInVwZGF0ZU1hdHJpY2VzIiwiX2RpcnR5IiwidXBkYXRlR3B1U2tpbk1hdHJpY2VzIiwic2tpbiIsInVwZGF0ZU1hdHJpeFBhbGV0dGUiLCJ1cGRhdGVNb3JwaGluZyIsIm1vcnBoVGltZSIsIm1vcnBoSW5zdCIsIm1vcnBoSW5zdGFuY2UiLCJ1cGRhdGUiLCJncHVVcGRhdGUiLCJzZXRWZXJ0ZXhCdWZmZXJzIiwic2V0VmVydGV4QnVmZmVyIiwidmVydGV4QnVmZmVyIiwic2V0TW9ycGhpbmciLCJtb3JwaCIsInVzZVRleHR1cmVNb3JwaCIsInZlcnRleEJ1ZmZlcklkcyIsInRleHR1cmVQb3NpdGlvbnMiLCJ0ZXh0dXJlTm9ybWFscyIsIl90ZXh0dXJlUGFyYW1zIiwidCIsIl9hY3RpdmVWZXJ0ZXhCdWZmZXJzIiwidmIiLCJzZW1hbnRpYyIsIlNFTUFOVElDX0FUVFIiLCJmb3JtYXQiLCJlbGVtZW50cyIsIm5hbWUiLCJzY29wZUlkIiwiX3NoYWRlck1vcnBoV2VpZ2h0c0EiLCJfc2hhZGVyTW9ycGhXZWlnaHRzQiIsInNldFNraW5uaW5nIiwibWVzaEluc3RhbmNlIiwic3VwcG9ydHNCb25lVGV4dHVyZXMiLCJib25lVGV4dHVyZSIsIm1hdHJpeFBhbGV0dGUiLCJ2cCIsImluaXRWaWV3QmluZEdyb3VwRm9ybWF0IiwiaXNDbHVzdGVyZWQiLCJzdXBwb3J0c1VuaWZvcm1CdWZmZXJzIiwidW5pZm9ybXMiLCJVbmlmb3JtRm9ybWF0IiwiVU5JRk9STVRZUEVfTUFUNCIsIlVOSUZPUk1UWVBFX01BVDMiLCJVTklGT1JNVFlQRV9WRUMzIiwiVU5JRk9STVRZUEVfRkxPQVQiLCJwdXNoIiwiVU5JRk9STVRZUEVfVkVDMiIsIlVOSUZPUk1UWVBFX0lOVCIsIlVuaWZvcm1CdWZmZXJGb3JtYXQiLCJidWZmZXJzIiwiQmluZEJ1ZmZlckZvcm1hdCIsIlVOSUZPUk1fQlVGRkVSX0RFRkFVTFRfU0xPVF9OQU1FIiwiU0hBREVSU1RBR0VfVkVSVEVYIiwiU0hBREVSU1RBR0VfRlJBR01FTlQiLCJ0ZXh0dXJlcyIsIkJpbmRUZXh0dXJlRm9ybWF0IiwiVEVYVFVSRURJTUVOU0lPTl8yRCIsIlNBTVBMRVRZUEVfVU5GSUxURVJBQkxFX0ZMT0FUIiwiU0FNUExFVFlQRV9ERVBUSCIsIlNBTVBMRVRZUEVfRkxPQVQiLCJCaW5kR3JvdXBGb3JtYXQiLCJzZXR1cFZpZXdVbmlmb3JtQnVmZmVycyIsInZpZXdCaW5kR3JvdXBzIiwiRGVidWciLCJhc3NlcnQiLCJBcnJheSIsImlzQXJyYXkiLCJ1YiIsIlVuaWZvcm1CdWZmZXIiLCJiZyIsIkJpbmRHcm91cCIsIkRlYnVnSGVscGVyIiwic2V0TmFtZSIsInZpZXdCaW5kR3JvdXAiLCJkZWZhdWx0VW5pZm9ybUJ1ZmZlciIsInNldEJpbmRHcm91cCIsIkJJTkRHUk9VUF9WSUVXIiwic2V0dXBNZXNoVW5pZm9ybUJ1ZmZlcnMiLCJzaGFkZXJJbnN0YW5jZSIsIndvcmxkVHJhbnNmb3JtIiwibm9ybWFsTWF0cml4IiwibWVzaEJpbmRHcm91cCIsImdldEJpbmRHcm91cCIsIkJJTkRHUk9VUF9NRVNIIiwiZHJhd0luc3RhbmNlIiwic3R5bGUiLCJub3JtYWwiLCJpbnN0YW5jaW5nRGF0YSIsImNvdW50IiwiZHJhdyIsInByaW1pdGl2ZSIsIm1vZGVsTWF0cml4IiwiZHJhd0luc3RhbmNlMiIsInVuZGVmaW5lZCIsImN1bGxlZEluc3RhbmNlcyIsImN1bGxUaW1lIiwib3BhcXVlIiwidHJhbnNwYXJlbnQiLCJkb0N1bGwiLCJmcnVzdHVtQ3VsbGluZyIsInZpc2libGUiLCJfaXNWaXNpYmxlIiwidmlzaWJsZVRoaXNGcmFtZSIsImJ1Y2tldCIsImFkZCIsImNvbGxlY3RMaWdodHMiLCJjb21wIiwic3RhdHMiLCJfc3RhdHMiLCJkeW5hbWljTGlnaHRzIiwiYmFrZWRMaWdodHMiLCJsYXllckxpc3QiLCJoYXMiLCJfbGlnaHRzIiwiaiIsImxpZ2h0IiwiX3R5cGUiLCJMSUdIVFRZUEVfRElSRUNUSU9OQUwiLCJtYXNrIiwiTUFTS19BRkZFQ1RfRFlOQU1JQyIsIk1BU0tfQUZGRUNUX0xJR0hUTUFQUEVEIiwiTUFTS19CQUtFIiwiY3VsbExpZ2h0cyIsImNsdXN0ZXJlZExpZ2h0aW5nRW5hYmxlZCIsImVuYWJsZWQiLCJnZXRCb3VuZGluZ1NwaGVyZSIsImNvbnRhaW5zU3BoZXJlIiwidXNlUGh5c2ljYWxVbml0cyIsInNjcmVlblNpemUiLCJnZXRTY3JlZW5TaXplIiwibWF4U2NyZWVuU2l6ZSIsIm1heCIsImNhc3RTaGFkb3dzIiwic2hhZG93TWFwIiwiY3VsbFNoYWRvd21hcHMiLCJhdGxhc1Nsb3RVcGRhdGVkIiwic2hhZG93VXBkYXRlTW9kZSIsIlNIQURPV1VQREFURV9OT05FIiwiU0hBRE9XVVBEQVRFX1RISVNGUkFNRSIsImdldFJlbmRlckRhdGEiLCJzaGFkb3dDYW1lcmEiLCJyZW5kZXJBY3Rpb25zIiwiX3JlbmRlckFjdGlvbnMiLCJkaXJlY3Rpb25hbExpZ2h0cyIsImZpcnN0Q2FtZXJhVXNlIiwiY2FtZXJhTGF5ZXJzIiwibGF5ZXJzIiwibCIsImNhbWVyYUxheWVyIiwiZ2V0TGF5ZXJCeUlkIiwibGF5ZXJEaXJMaWdodHMiLCJzcGxpdExpZ2h0cyIsImN1bGxDb21wb3NpdGlvbiIsImxheWVySW5kZXgiLCJzdWJMYXllckVuYWJsZWQiLCJjYW1lcmFQYXNzIiwiY2FtZXJhSW5kZXgiLCJjYW1lcmFzIiwiZnJhbWVVcGRhdGUiLCJvblByZUN1bGwiLCJnZXRDdWxsZWRJbnN0YW5jZXMiLCJtZXNoSW5zdGFuY2VzIiwib25Qb3N0Q3VsbCIsInVwZGF0ZUxpZ2h0VGV4dHVyZUF0bGFzIiwidXBkYXRlU2hhZGVycyIsIm9ubHlMaXRTaGFkZXJzIiwibWF0IiwiZ2V0U2hhZGVyVmFyaWFudCIsIk1hdGVyaWFsIiwicHJvdG90eXBlIiwidXNlTGlnaHRpbmciLCJlbWl0dGVyIiwibGlnaHRpbmciLCJjbGVhclZhcmlhbnRzIiwicmVuZGVyQ29va2llcyIsInJlbmRlciIsImJlZ2luRnJhbWUiLCJ0b3RhbE1lc2hJbnN0YW5jZXMiLCJsYXllckNvdW50IiwibWVzaEluc3QiLCJfc2hhZGVyVmVyc2lvbiIsImxpZ2h0Q291bnQiLCJ1cGRhdGVDbHVzdGVycyIsInN0YXJ0VGltZSIsImdhbW1hQ29ycmVjdGlvbiIsInVwZGF0ZUxheWVyQ29tcG9zaXRpb24iLCJsYXllckNvbXBvc2l0aW9uVXBkYXRlVGltZSIsImxlbiIsIl9wb3N0UmVuZGVyQ291bnRlciIsInNoYWRlclZlcnNpb24iLCJfc2tpcFJlbmRlckNvdW50ZXIiLCJfZm9yd2FyZERyYXdDYWxscyIsIl9yZW5kZXJUaW1lIiwiX3ByZVJlbmRlckNhbGxlZEZvckNhbWVyYXMiLCJfcG9zdFJlbmRlckNhbGxlZEZvckNhbWVyYXMiLCJzdWJMYXllckxpc3QiLCJfcG9zdFJlbmRlckNvdW50ZXJNYXgiLCJfdXBkYXRlIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQXVDQSxJQUFJQSxnQkFBZ0IsR0FBRyxDQUFDLENBQUE7QUFDeEIsTUFBTUMsZUFBZSxHQUFHLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUE7QUFDcEMsTUFBTUMsV0FBVyxHQUFHLElBQUlDLElBQUksRUFBRSxDQUFBO0FBQzlCLE1BQU1DLFVBQVUsR0FBRyxJQUFJRCxJQUFJLEVBQUUsQ0FBQTtBQUM3QixNQUFNRSxPQUFPLEdBQUcsSUFBSUYsSUFBSSxFQUFFLENBQUE7QUFDMUIsTUFBTUcsUUFBUSxHQUFHLElBQUlDLElBQUksRUFBRSxDQUFBO0FBQzNCLE1BQU1DLFVBQVUsR0FBRyxJQUFJQyxjQUFjLEVBQUUsQ0FBQTtBQUN2QyxNQUFNQyxTQUFTLEdBQUcsSUFBSVAsSUFBSSxFQUFFLENBQUNRLFFBQVEsQ0FBQyxDQUFDLEVBQUUs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
