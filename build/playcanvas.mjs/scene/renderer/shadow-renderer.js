import { Debug } from '../../core/debug.js';
import { now } from '../../core/time.js';
import { Color } from '../../core/math/color.js';
import { Mat4 } from '../../core/math/mat4.js';
import { Vec3 } from '../../core/math/vec3.js';
import { Vec4 } from '../../core/math/vec4.js';
import { UNIFORMTYPE_MAT4, UNIFORM_BUFFER_DEFAULT_SLOT_NAME, SHADERSTAGE_VERTEX, SHADERSTAGE_FRAGMENT } from '../../platform/graphics/constants.js';
import { DebugGraphics } from '../../platform/graphics/debug-graphics.js';
import { drawQuadWithShader } from '../graphics/quad-render-utils.js';
import { SHADOW_VSM8, SHADOW_VSM32, SHADOW_PCF5, SHADOW_PCF1, SHADOW_PCF3, LIGHTTYPE_OMNI, LIGHTTYPE_DIRECTIONAL, SORTKEY_DEPTH, SHADOWUPDATE_NONE, SHADOWUPDATE_THISFRAME, BLUR_GAUSSIAN, SHADER_SHADOW } from '../constants.js';
import { ShaderPass } from '../shader-pass.js';
import { shaderChunks } from '../shader-lib/chunks/chunks.js';
import { createShaderFromCode } from '../shader-lib/utils.js';
import { LightCamera } from './light-camera.js';
import { UniformBufferFormat, UniformFormat } from '../../platform/graphics/uniform-buffer-format.js';
import { BindGroupFormat, BindBufferFormat } from '../../platform/graphics/bind-group-format.js';
import { BlendState } from '../../platform/graphics/blend-state.js';
import { DepthState } from '../../platform/graphics/depth-state.js';

function gauss(x, sigma) {
  return Math.exp(-(x * x) / (2.0 * sigma * sigma));
}
function gaussWeights(kernelSize) {
  const sigma = (kernelSize - 1) / (2 * 3);
  const halfWidth = (kernelSize - 1) * 0.5;
  const values = new Array(kernelSize);
  let sum = 0.0;
  for (let i = 0; i < kernelSize; ++i) {
    values[i] = gauss(i - halfWidth, sigma);
    sum += values[i];
  }
  for (let i = 0; i < kernelSize; ++i) {
    values[i] /= sum;
  }
  return values;
}
const tempSet = new Set();
const shadowCamView = new Mat4();
const shadowCamViewProj = new Mat4();
const pixelOffset = new Float32Array(2);
const blurScissorRect = new Vec4(1, 1, 0, 0);
const viewportMatrix = new Mat4();

/**
 * @ignore
 */
class ShadowRenderer {
  /**
   * @param {import('./renderer.js').Renderer} renderer - The renderer.
   * @param {import('../lighting/light-texture-atlas.js').LightTextureAtlas} lightTextureAtlas - The
   * shadow map atlas.
   */
  constructor(renderer, lightTextureAtlas) {
    /**
     * A cache of shadow passes. First index is looked up by light type, second by shadow type.
     *
     * @type {import('../shader-pass.js').ShaderPassInfo[][]}
     * @private
     */
    this.shadowPassCache = [];
    this.device = renderer.device;

    /** @type {import('./renderer.js').Renderer} */
    this.renderer = renderer;

    /** @type {import('../lighting/light-texture-atlas.js').LightTextureAtlas} */
    this.lightTextureAtlas = lightTextureAtlas;
    const scope = this.device.scope;
    this.polygonOffsetId = scope.resolve('polygonOffset');
    this.polygonOffset = new Float32Array(2);

    // VSM
    this.sourceId = scope.resolve('source');
    this.pixelOffsetId = scope.resolve('pixelOffset');
    this.weightId = scope.resolve('weight[0]');
    this.blurVsmShaderCode = [shaderChunks.blurVSMPS, '#define GAUSS\n' + shaderChunks.blurVSMPS];
    const packed = '#define PACKED\n';
    this.blurPackedVsmShaderCode = [packed + this.blurVsmShaderCode[0], packed + this.blurVsmShaderCode[1]];

    // cache for vsm blur shaders
    this.blurVsmShader = [{}, {}];
    this.blurPackedVsmShader = [{}, {}];
    this.blurVsmWeights = {};

    // uniforms
    this.shadowMapLightRadiusId = scope.resolve('light_radius');

    // view bind group format with its uniform buffer format
    this.viewUniformFormat = null;
    this.viewBindGroupFormat = null;

    // blend states
    this.blendStateWrite = new BlendState();
    this.blendStateNoWrite = new BlendState();
    this.blendStateNoWrite.setColorWrite(false, false, false, false);
  }

  // creates shadow camera for a light and sets up its constant properties
  static createShadowCamera(device, shadowType, type, face) {
    const shadowCam = LightCamera.create('ShadowCamera', type, face);

    // don't clear the color buffer if rendering a depth map
    if (shadowType >= SHADOW_VSM8 && shadowType <= SHADOW_VSM32) {
      shadowCam.clearColor = new Color(0, 0, 0, 0);
    } else {
      shadowCam.clearColor = new Color(1, 1, 1, 1);
    }
    shadowCam.clearDepthBuffer = true;
    shadowCam.clearStencilBuffer = false;
    return shadowCam;
  }
  static setShadowCameraSettings(shadowCam, device, shadowType, type, isClustered) {
    // normal omni shadows on webgl2 encode depth in RGBA8 and do manual PCF sampling
    // clustered omni shadows on webgl2 use depth format and hardware PCF sampling
    let hwPcf = shadowType === SHADOW_PCF5 || (shadowType === SHADOW_PCF1 || shadowType === SHADOW_PCF3) && device.supportsDepthShadow;
    if (type === LIGHTTYPE_OMNI && !isClustered) {
      hwPcf = false;
    }
    shadowCam.clearColorBuffer = !hwPcf;
  }
  _cullShadowCastersInternal(meshInstances, visible, camera) {
    const numInstances = meshInstances.length;
    for (let i = 0; i < numInstances; i++) {
      const meshInstance = meshInstances[i];
      if (meshInstance.castShadow) {
        if (!meshInstance.cull || meshInstance._isVisible(camera)) {
          meshInstance.visibleThisFrame = true;
          visible.push(meshInstance);
        }
      }
    }
  }

  /**
   * Culls the list of shadow casters used by the light by the camera, storing visible mesh
   * instances in the specified array.
   * @param {import('../composition/layer-composition.js').LayerComposition} comp - The layer
   * composition used as a source of shadow casters, if those are not provided directly.
   * @param {import('../light.js').Light} light - The light.
   * @param {import('../mesh-instance.js').MeshInstance[]} visible - The array to store visible
   * mesh instances in.
   * @param {import('../camera.js').Camera} camera - The camera.
   * @param {import('../mesh-instance.js').MeshInstance[]} [casters] - Optional array of mesh
   * instances to use as casters.
   * @ignore
   */
  cullShadowCasters(comp, light, visible, camera, casters) {
    visible.length = 0;

    // if the casters are supplied, use them
    if (casters) {
      this._cullShadowCastersInternal(casters, visible, camera);
    } else {
      // otherwise, get them from the layer composition

      // for each layer
      const layers = comp.layerList;
      const len = layers.length;
      for (let i = 0; i < len; i++) {
        const layer = layers[i];
        if (layer._lightsSet.has(light)) {
          // layer can be in the list two times (opaque, transp), add casters only one time
          if (!tempSet.has(layer)) {
            tempSet.add(layer);
            this._cullShadowCastersInternal(layer.shadowCasters, visible, camera);
          }
        }
      }
      tempSet.clear();
    }

    // this sorts the shadow casters by the shader id
    visible.sort(this.renderer.sortCompareDepth);
  }
  setupRenderState(device, light) {
    const isClustered = this.renderer.scene.clusteredLightingEnabled;

    // depth bias
    if (device.webgl2 || device.isWebGPU) {
      if (light._type === LIGHTTYPE_OMNI && !isClustered) {
        device.setDepthBias(false);
      } else {
        device.setDepthBias(true);
        device.setDepthBiasValues(light.shadowBias * -1000.0, light.shadowBias * -1000.0);
      }
    } else if (device.extStandardDerivatives) {
      if (light._type === LIGHTTYPE_OMNI) {
        this.polygonOffset[0] = 0;
        this.polygonOffset[1] = 0;
        this.polygonOffsetId.setValue(this.polygonOffset);
      } else {
        this.polygonOffset[0] = light.shadowBias * -1000.0;
        this.polygonOffset[1] = light.shadowBias * -1000.0;
        this.polygonOffsetId.setValue(this.polygonOffset);
      }
    }

    // Set standard shadowmap states
    const gpuOrGl2 = device.webgl2 || device.isWebGPU;
    const useShadowSampler = isClustered ? light._isPcf && gpuOrGl2 :
    // both spot and omni light are using shadow sampler on webgl2 when clustered
    light._isPcf && gpuOrGl2 && light._type !== LIGHTTYPE_OMNI; // for non-clustered, point light is using depth encoded in color buffer (should change to shadow sampler)

    device.setBlendState(useShadowSampler ? this.blendStateNoWrite : this.blendStateWrite);
    device.setDepthState(DepthState.DEFAULT);
    device.setStencilState(null, null);
  }
  restoreRenderState(device) {
    if (device.webgl2 || device.isWebGPU) {
      device.setDepthBias(false);
    } else if (device.extStandardDerivatives) {
      this.polygonOffset[0] = 0;
      this.polygonOffset[1] = 0;
      this.polygonOffsetId.setValue(this.polygonOffset);
    }
  }
  dispatchUniforms(light, shadowCam, lightRenderData, face) {
    const shadowCamNode = shadowCam._node;

    // position / range
    if (light._type !== LIGHTTYPE_DIRECTIONAL) {
      this.renderer.dispatchViewPos(shadowCamNode.getPosition());
      this.shadowMapLightRadiusId.setValue(light.attenuationEnd);
    }

    // view-projection shadow matrix
    shadowCamView.setTRS(shadowCamNode.getPosition(), shadowCamNode.getRotation(), Vec3.ONE).invert();
    shadowCamViewProj.mul2(shadowCam.projectionMatrix, shadowCamView);

    // viewport handling
    const rectViewport = lightRenderData.shadowViewport;
    shadowCam.rect = rectViewport;
    shadowCam.scissorRect = lightRenderData.shadowScissor;
    viewportMatrix.setViewport(rectViewport.x, rectViewport.y, rectViewport.z, rectViewport.w);
    lightRenderData.shadowMatrix.mul2(viewportMatrix, shadowCamViewProj);
    if (light._type === LIGHTTYPE_DIRECTIONAL) {
      // copy matrix to shadow cascade palette
      light._shadowMatrixPalette.set(lightRenderData.shadowMatrix.data, face * 16);
    }
  }
  getShadowPass(light) {
    var _this$shadowPassCache;
    // get shader pass from cache for this light type and shadow type
    const lightType = light._type;
    const shadowType = light._shadowType;
    let shadowPassInfo = (_this$shadowPassCache = this.shadowPassCache[lightType]) == null ? void 0 : _this$shadowPassCache[shadowType];
    if (!shadowPassInfo) {
      // new shader pass if not in cache
      const shadowPassName = `ShadowPass_${lightType}_${shadowType}`;
      shadowPassInfo = ShaderPass.get(this.device).allocate(shadowPassName, {
        isShadow: true,
        lightType: lightType,
        shadowType: shadowType
      });

      // add it to the cache
      if (!this.shadowPassCache[lightType]) this.shadowPassCache[lightType] = [];
      this.shadowPassCache[lightType][shadowType] = shadowPassInfo;
    }
    return shadowPassInfo.index;
  }

  /**
   * @param {import('../mesh-instance.js').MeshInstance[]} visibleCasters - Visible mesh
   * instances.
   * @param {import('../light.js').Light} light - The light.
   */
  submitCasters(visibleCasters, light) {
    const device = this.device;
    const renderer = this.renderer;
    const scene = renderer.scene;
    const passFlags = 1 << SHADER_SHADOW;
    const shadowPass = this.getShadowPass(light);

    // TODO: Similarly to forward renderer, a shader creation part of this loop should be split into a separate loop,
    // and endShaderBatch should be called at its end

    // Render
    const count = visibleCasters.length;
    for (let i = 0; i < count; i++) {
      const meshInstance = visibleCasters[i];
      const mesh = meshInstance.mesh;
      meshInstance.ensureMaterial(device);
      const material = meshInstance.material;

      // set basic material states/parameters
      renderer.setBaseConstants(device, material);
      renderer.setSkinning(device, meshInstance);
      if (material.dirty) {
        material.updateUniforms(device, scene);
        material.dirty = false;
      }
      if (material.chunks) {
        renderer.setupCullMode(true, 1, meshInstance);

        // Uniforms I (shadow): material
        material.setParameters(device);

        // Uniforms II (shadow): meshInstance overrides
        meshInstance.setParameters(device, passFlags);
      }
      const shaderInstance = meshInstance.getShaderInstance(shadowPass, 0, scene, this.viewUniformFormat, this.viewBindGroupFormat);
      const shadowShader = shaderInstance.shader;
      Debug.assert(shadowShader, `no shader for pass ${shadowPass}`, material);

      // sort shadow casters by shader
      meshInstance._key[SORTKEY_DEPTH] = shadowShader.id;
      if (!shadowShader.failed && !device.setShader(shadowShader)) {
        Debug.error(`Error compiling shadow shader for material=${material.name} pass=${shadowPass}`, material);
      }

      // set buffers
      renderer.setVertexBuffers(device, mesh);
      renderer.setMorphing(device, meshInstance.morphInstance);
      this.renderer.setupMeshUniformBuffers(shaderInstance, meshInstance);
      const style = meshInstance.renderStyle;
      device.setIndexBuffer(mesh.indexBuffer[style]);

      // draw
      renderer.drawInstance(device, meshInstance, mesh, style);
      renderer._shadowDrawCalls++;
    }
  }
  needsShadowRendering(light) {
    const needs = light.enabled && light.castShadows && light.shadowUpdateMode !== SHADOWUPDATE_NONE && light.visibleThisFrame;
    if (light.shadowUpdateMode === SHADOWUPDATE_THISFRAME) {
      light.shadowUpdateMode = SHADOWUPDATE_NONE;
    }
    if (needs) {
      this.renderer._shadowMapUpdates += light.numShadowFaces;
    }
    return needs;
  }
  getLightRenderData(light, camera, face) {
    // directional shadows are per camera, so get appropriate render data
    return light.getRenderData(light._type === LIGHTTYPE_DIRECTIONAL ? camera : null, face);
  }
  setupRenderPass(renderPass, shadowCamera, clearRenderTarget) {
    const rt = shadowCamera.renderTarget;
    renderPass.init(rt);
    renderPass.depthStencilOps.clearDepthValue = 1;
    renderPass.depthStencilOps.clearDepth = clearRenderTarget;

    // if rendering to depth buffer
    if (rt.depthBuffer) {
      renderPass.depthStencilOps.storeDepth = true;
    } else {
      // rendering to color buffer

      renderPass.colorOps.clearValue.copy(shadowCamera.clearColor);
      renderPass.colorOps.clear = clearRenderTarget;
      renderPass.depthStencilOps.storeDepth = false;
    }

    // not sampling dynamically generated cubemaps
    renderPass.requiresCubemaps = false;
  }

  // prepares render target / render target settings to allow render pass to be set up
  prepareFace(light, camera, face) {
    const type = light._type;
    const shadowType = light._shadowType;
    const isClustered = this.renderer.scene.clusteredLightingEnabled;
    const lightRenderData = this.getLightRenderData(light, camera, face);
    const shadowCam = lightRenderData.shadowCamera;

    // camera clear setting
    // Note: when clustered lighting is the only lighting type, this code can be moved to createShadowCamera function
    ShadowRenderer.setShadowCameraSettings(shadowCam, this.device, shadowType, type, isClustered);

    // assign render target for the face
    const renderTargetIndex = type === LIGHTTYPE_DIRECTIONAL ? 0 : face;
    shadowCam.renderTarget = light._shadowMap.renderTargets[renderTargetIndex];
    return shadowCam;
  }
  renderFace(light, camera, face, clear, insideRenderPass = true) {
    const device = this.device;
    const shadowMapStartTime = now();
    DebugGraphics.pushGpuMarker(device, `SHADOW ${light._node.name} FACE ${face}`);
    const lightRenderData = this.getLightRenderData(light, camera, face);
    const shadowCam = lightRenderData.shadowCamera;
    this.dispatchUniforms(light, shadowCam, lightRenderData, face);
    const rt = shadowCam.renderTarget;
    const renderer = this.renderer;
    renderer.setCameraUniforms(shadowCam, rt);
    if (device.supportsUniformBuffers) {
      renderer.setupViewUniformBuffers(lightRenderData.viewBindGroups, this.viewUniformFormat, this.viewBindGroupFormat, 1);
    }
    if (insideRenderPass) {
      renderer.setupViewport(shadowCam, rt);

      // clear here is used to clear a viewport inside render target.
      if (clear) {
        renderer.clear(shadowCam);
      }
    } else {
      // this is only used by lightmapper, till it's converted to render passes
      renderer.clearView(shadowCam, rt, true, false);
    }
    this.setupRenderState(device, light);

    // render mesh instances
    this.submitCasters(lightRenderData.visibleCasters, light);
    this.restoreRenderState(device);
    DebugGraphics.popGpuMarker(device);
    renderer._shadowMapTime += now() - shadowMapStartTime;
  }
  render(light, camera, insideRenderPass = true) {
    if (this.needsShadowRendering(light)) {
      const faceCount = light.numShadowFaces;

      // render faces
      for (let face = 0; face < faceCount; face++) {
        this.prepareFace(light, camera, face);
        this.renderFace(light, camera, face, true, insideRenderPass);
      }

      // apply vsm
      this.renderVsm(light, camera);
    }
  }
  renderVsm(light, camera) {
    // VSM blur if light supports vsm (directional and spot in general)
    if (light._isVsm && light._vsmBlurSize > 1) {
      // in clustered mode, only directional light can be vms
      const isClustered = this.renderer.scene.clusteredLightingEnabled;
      if (!isClustered || light._type === LIGHTTYPE_DIRECTIONAL) {
        this.applyVsmBlur(light, camera);
      }
    }
  }
  getVsmBlurShader(isVsm8, blurMode, filterSize) {
    let blurShader = (isVsm8 ? this.blurPackedVsmShader : this.blurVsmShader)[blurMode][filterSize];
    if (!blurShader) {
      this.blurVsmWeights[filterSize] = gaussWeights(filterSize);
      const blurVS = shaderChunks.fullscreenQuadVS;
      let blurFS = '#define SAMPLES ' + filterSize + '\n';
      if (isVsm8) {
        blurFS += this.blurPackedVsmShaderCode[blurMode];
      } else {
        blurFS += this.blurVsmShaderCode[blurMode];
      }
      const blurShaderName = 'blurVsm' + blurMode + '' + filterSize + '' + isVsm8;
      blurShader = createShaderFromCode(this.device, blurVS, blurFS, blurShaderName);
      if (isVsm8) {
        this.blurPackedVsmShader[blurMode][filterSize] = blurShader;
      } else {
        this.blurVsmShader[blurMode][filterSize] = blurShader;
      }
    }
    return blurShader;
  }
  applyVsmBlur(light, camera) {
    const device = this.device;
    DebugGraphics.pushGpuMarker(device, `VSM ${light._node.name}`);

    // render state
    device.setBlendState(BlendState.NOBLEND);
    const lightRenderData = light.getRenderData(light._type === LIGHTTYPE_DIRECTIONAL ? camera : null, 0);
    const shadowCam = lightRenderData.shadowCamera;
    const origShadowMap = shadowCam.renderTarget;

    // temporary render target for blurring
    // TODO: this is probably not optimal and shadow map could have depth buffer on in addition to color buffer,
    // and for blurring only one buffer is needed.
    const tempShadowMap = this.renderer.shadowMapCache.get(device, light);
    const tempRt = tempShadowMap.renderTargets[0];
    const isVsm8 = light._shadowType === SHADOW_VSM8;
    const blurMode = light.vsmBlurMode;
    const filterSize = light._vsmBlurSize;
    const blurShader = this.getVsmBlurShader(isVsm8, blurMode, filterSize);
    blurScissorRect.z = light._shadowResolution - 2;
    blurScissorRect.w = blurScissorRect.z;

    // Blur horizontal
    this.sourceId.setValue(origShadowMap.colorBuffer);
    pixelOffset[0] = 1 / light._shadowResolution;
    pixelOffset[1] = 0;
    this.pixelOffsetId.setValue(pixelOffset);
    if (blurMode === BLUR_GAUSSIAN) this.weightId.setValue(this.blurVsmWeights[filterSize]);
    drawQuadWithShader(device, tempRt, blurShader, null, blurScissorRect);

    // Blur vertical
    this.sourceId.setValue(tempRt.colorBuffer);
    pixelOffset[1] = pixelOffset[0];
    pixelOffset[0] = 0;
    this.pixelOffsetId.setValue(pixelOffset);
    drawQuadWithShader(device, origShadowMap, blurShader, null, blurScissorRect);

    // return the temporary shadow map back to the cache
    this.renderer.shadowMapCache.add(light, tempShadowMap);
    DebugGraphics.popGpuMarker(device);
  }
  initViewBindGroupFormat() {
    if (this.device.supportsUniformBuffers && !this.viewUniformFormat) {
      // format of the view uniform buffer
      this.viewUniformFormat = new UniformBufferFormat(this.device, [new UniformFormat("matrix_viewProjection", UNIFORMTYPE_MAT4)]);

      // format of the view bind group - contains single uniform buffer, and no textures
      this.viewBindGroupFormat = new BindGroupFormat(this.device, [new BindBufferFormat(UNIFORM_BUFFER_DEFAULT_SLOT_NAME, SHADERSTAGE_VERTEX | SHADERSTAGE_FRAGMENT)], []);
    }
  }
  frameUpdate() {
    this.initViewBindGroupFormat();
  }
}

export { ShadowRenderer };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2hhZG93LXJlbmRlcmVyLmpzIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvc2NlbmUvcmVuZGVyZXIvc2hhZG93LXJlbmRlcmVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IERlYnVnIH0gZnJvbSAnLi4vLi4vY29yZS9kZWJ1Zy5qcyc7XG5pbXBvcnQgeyBub3cgfSBmcm9tICcuLi8uLi9jb3JlL3RpbWUuanMnO1xuaW1wb3J0IHsgQ29sb3IgfSBmcm9tICcuLi8uLi9jb3JlL21hdGgvY29sb3IuanMnO1xuaW1wb3J0IHsgTWF0NCB9IGZyb20gJy4uLy4uL2NvcmUvbWF0aC9tYXQ0LmpzJztcbmltcG9ydCB7IFZlYzMgfSBmcm9tICcuLi8uLi9jb3JlL21hdGgvdmVjMy5qcyc7XG5pbXBvcnQgeyBWZWM0IH0gZnJvbSAnLi4vLi4vY29yZS9tYXRoL3ZlYzQuanMnO1xuXG5pbXBvcnQgeyBTSEFERVJTVEFHRV9GUkFHTUVOVCwgU0hBREVSU1RBR0VfVkVSVEVYLCBVTklGT1JNVFlQRV9NQVQ0LCBVTklGT1JNX0JVRkZFUl9ERUZBVUxUX1NMT1RfTkFNRSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2dyYXBoaWNzL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBEZWJ1Z0dyYXBoaWNzIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vZ3JhcGhpY3MvZGVidWctZ3JhcGhpY3MuanMnO1xuaW1wb3J0IHsgZHJhd1F1YWRXaXRoU2hhZGVyIH0gZnJvbSAnLi4vZ3JhcGhpY3MvcXVhZC1yZW5kZXItdXRpbHMuanMnO1xuXG5pbXBvcnQge1xuICAgIEJMVVJfR0FVU1NJQU4sXG4gICAgTElHSFRUWVBFX0RJUkVDVElPTkFMLCBMSUdIVFRZUEVfT01OSSxcbiAgICBTSEFERVJfU0hBRE9XLFxuICAgIFNIQURPV19QQ0YxLCBTSEFET1dfUENGMywgU0hBRE9XX1BDRjUsIFNIQURPV19WU004LCBTSEFET1dfVlNNMzIsXG4gICAgU0hBRE9XVVBEQVRFX05PTkUsIFNIQURPV1VQREFURV9USElTRlJBTUUsXG4gICAgU09SVEtFWV9ERVBUSFxufSBmcm9tICcuLi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgU2hhZGVyUGFzcyB9IGZyb20gJy4uL3NoYWRlci1wYXNzLmpzJztcbmltcG9ydCB7IHNoYWRlckNodW5rcyB9IGZyb20gJy4uL3NoYWRlci1saWIvY2h1bmtzL2NodW5rcy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVTaGFkZXJGcm9tQ29kZSB9IGZyb20gJy4uL3NoYWRlci1saWIvdXRpbHMuanMnO1xuaW1wb3J0IHsgTGlnaHRDYW1lcmEgfSBmcm9tICcuL2xpZ2h0LWNhbWVyYS5qcyc7XG5pbXBvcnQgeyBVbmlmb3JtQnVmZmVyRm9ybWF0LCBVbmlmb3JtRm9ybWF0IH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vZ3JhcGhpY3MvdW5pZm9ybS1idWZmZXItZm9ybWF0LmpzJztcbmltcG9ydCB7IEJpbmRCdWZmZXJGb3JtYXQsIEJpbmRHcm91cEZvcm1hdCB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2dyYXBoaWNzL2JpbmQtZ3JvdXAtZm9ybWF0LmpzJztcbmltcG9ydCB7IEJsZW5kU3RhdGUgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9ncmFwaGljcy9ibGVuZC1zdGF0ZS5qcyc7XG5pbXBvcnQgeyBEZXB0aFN0YXRlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vZ3JhcGhpY3MvZGVwdGgtc3RhdGUuanMnO1xuXG5mdW5jdGlvbiBnYXVzcyh4LCBzaWdtYSkge1xuICAgIHJldHVybiBNYXRoLmV4cCgtKHggKiB4KSAvICgyLjAgKiBzaWdtYSAqIHNpZ21hKSk7XG59XG5cbmZ1bmN0aW9uIGdhdXNzV2VpZ2h0cyhrZXJuZWxTaXplKSB7XG4gICAgY29uc3Qgc2lnbWEgPSAoa2VybmVsU2l6ZSAtIDEpIC8gKDIgKiAzKTtcblxuICAgIGNvbnN0IGhhbGZXaWR0aCA9IChrZXJuZWxTaXplIC0gMSkgKiAwLjU7XG4gICAgY29uc3QgdmFsdWVzID0gbmV3IEFycmF5KGtlcm5lbFNpemUpO1xuICAgIGxldCBzdW0gPSAwLjA7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBrZXJuZWxTaXplOyArK2kpIHtcbiAgICAgICAgdmFsdWVzW2ldID0gZ2F1c3MoaSAtIGhhbGZXaWR0aCwgc2lnbWEpO1xuICAgICAgICBzdW0gKz0gdmFsdWVzW2ldO1xuICAgIH1cblxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwga2VybmVsU2l6ZTsgKytpKSB7XG4gICAgICAgIHZhbHVlc1tpXSAvPSBzdW07XG4gICAgfVxuICAgIHJldHVybiB2YWx1ZXM7XG59XG5cbmNvbnN0IHRlbXBTZXQgPSBuZXcgU2V0KCk7XG5jb25zdCBzaGFkb3dDYW1WaWV3ID0gbmV3IE1hdDQoKTtcbmNvbnN0IHNoYWRvd0NhbVZpZXdQcm9qID0gbmV3IE1hdDQoKTtcbmNvbnN0IHBpeGVsT2Zmc2V0ID0gbmV3IEZsb2F0MzJBcnJheSgyKTtcbmNvbnN0IGJsdXJTY2lzc29yUmVjdCA9IG5ldyBWZWM0KDEsIDEsIDAsIDApO1xuY29uc3Qgdmlld3BvcnRNYXRyaXggPSBuZXcgTWF0NCgpO1xuXG4vKipcbiAqIEBpZ25vcmVcbiAqL1xuY2xhc3MgU2hhZG93UmVuZGVyZXIge1xuICAgIC8qKlxuICAgICAqIEEgY2FjaGUgb2Ygc2hhZG93IHBhc3Nlcy4gRmlyc3QgaW5kZXggaXMgbG9va2VkIHVwIGJ5IGxpZ2h0IHR5cGUsIHNlY29uZCBieSBzaGFkb3cgdHlwZS5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtpbXBvcnQoJy4uL3NoYWRlci1wYXNzLmpzJykuU2hhZGVyUGFzc0luZm9bXVtdfVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgc2hhZG93UGFzc0NhY2hlID0gW107XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi9yZW5kZXJlci5qcycpLlJlbmRlcmVyfSByZW5kZXJlciAtIFRoZSByZW5kZXJlci5cbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi4vbGlnaHRpbmcvbGlnaHQtdGV4dHVyZS1hdGxhcy5qcycpLkxpZ2h0VGV4dHVyZUF0bGFzfSBsaWdodFRleHR1cmVBdGxhcyAtIFRoZVxuICAgICAqIHNoYWRvdyBtYXAgYXRsYXMuXG4gICAgICovXG4gICAgY29uc3RydWN0b3IocmVuZGVyZXIsIGxpZ2h0VGV4dHVyZUF0bGFzKSB7XG4gICAgICAgIHRoaXMuZGV2aWNlID0gcmVuZGVyZXIuZGV2aWNlO1xuXG4gICAgICAgIC8qKiBAdHlwZSB7aW1wb3J0KCcuL3JlbmRlcmVyLmpzJykuUmVuZGVyZXJ9ICovXG4gICAgICAgIHRoaXMucmVuZGVyZXIgPSByZW5kZXJlcjtcblxuICAgICAgICAvKiogQHR5cGUge2ltcG9ydCgnLi4vbGlnaHRpbmcvbGlnaHQtdGV4dHVyZS1hdGxhcy5qcycpLkxpZ2h0VGV4dHVyZUF0bGFzfSAqL1xuICAgICAgICB0aGlzLmxpZ2h0VGV4dHVyZUF0bGFzID0gbGlnaHRUZXh0dXJlQXRsYXM7XG5cbiAgICAgICAgY29uc3Qgc2NvcGUgPSB0aGlzLmRldmljZS5zY29wZTtcblxuICAgICAgICB0aGlzLnBvbHlnb25PZmZzZXRJZCA9IHNjb3BlLnJlc29sdmUoJ3BvbHlnb25PZmZzZXQnKTtcbiAgICAgICAgdGhpcy5wb2x5Z29uT2Zmc2V0ID0gbmV3IEZsb2F0MzJBcnJheSgyKTtcblxuICAgICAgICAvLyBWU01cbiAgICAgICAgdGhpcy5zb3VyY2VJZCA9IHNjb3BlLnJlc29sdmUoJ3NvdXJjZScpO1xuICAgICAgICB0aGlzLnBpeGVsT2Zmc2V0SWQgPSBzY29wZS5yZXNvbHZlKCdwaXhlbE9mZnNldCcpO1xuICAgICAgICB0aGlzLndlaWdodElkID0gc2NvcGUucmVzb2x2ZSgnd2VpZ2h0WzBdJyk7XG4gICAgICAgIHRoaXMuYmx1clZzbVNoYWRlckNvZGUgPSBbc2hhZGVyQ2h1bmtzLmJsdXJWU01QUywgJyNkZWZpbmUgR0FVU1NcXG4nICsgc2hhZGVyQ2h1bmtzLmJsdXJWU01QU107XG4gICAgICAgIGNvbnN0IHBhY2tlZCA9ICcjZGVmaW5lIFBBQ0tFRFxcbic7XG4gICAgICAgIHRoaXMuYmx1clBhY2tlZFZzbVNoYWRlckNvZGUgPSBbcGFja2VkICsgdGhpcy5ibHVyVnNtU2hhZGVyQ29kZVswXSwgcGFja2VkICsgdGhpcy5ibHVyVnNtU2hhZGVyQ29kZVsxXV07XG5cbiAgICAgICAgLy8gY2FjaGUgZm9yIHZzbSBibHVyIHNoYWRlcnNcbiAgICAgICAgdGhpcy5ibHVyVnNtU2hhZGVyID0gW3t9LCB7fV07XG4gICAgICAgIHRoaXMuYmx1clBhY2tlZFZzbVNoYWRlciA9IFt7fSwge31dO1xuXG4gICAgICAgIHRoaXMuYmx1clZzbVdlaWdodHMgPSB7fTtcblxuICAgICAgICAvLyB1bmlmb3Jtc1xuICAgICAgICB0aGlzLnNoYWRvd01hcExpZ2h0UmFkaXVzSWQgPSBzY29wZS5yZXNvbHZlKCdsaWdodF9yYWRpdXMnKTtcblxuICAgICAgICAvLyB2aWV3IGJpbmQgZ3JvdXAgZm9ybWF0IHdpdGggaXRzIHVuaWZvcm0gYnVmZmVyIGZvcm1hdFxuICAgICAgICB0aGlzLnZpZXdVbmlmb3JtRm9ybWF0ID0gbnVsbDtcbiAgICAgICAgdGhpcy52aWV3QmluZEdyb3VwRm9ybWF0ID0gbnVsbDtcblxuICAgICAgICAvLyBibGVuZCBzdGF0ZXNcbiAgICAgICAgdGhpcy5ibGVuZFN0YXRlV3JpdGUgPSBuZXcgQmxlbmRTdGF0ZSgpO1xuICAgICAgICB0aGlzLmJsZW5kU3RhdGVOb1dyaXRlID0gbmV3IEJsZW5kU3RhdGUoKTtcbiAgICAgICAgdGhpcy5ibGVuZFN0YXRlTm9Xcml0ZS5zZXRDb2xvcldyaXRlKGZhbHNlLCBmYWxzZSwgZmFsc2UsIGZhbHNlKTtcbiAgICB9XG5cbiAgICAvLyBjcmVhdGVzIHNoYWRvdyBjYW1lcmEgZm9yIGEgbGlnaHQgYW5kIHNldHMgdXAgaXRzIGNvbnN0YW50IHByb3BlcnRpZXNcbiAgICBzdGF0aWMgY3JlYXRlU2hhZG93Q2FtZXJhKGRldmljZSwgc2hhZG93VHlwZSwgdHlwZSwgZmFjZSkge1xuXG4gICAgICAgIGNvbnN0IHNoYWRvd0NhbSA9IExpZ2h0Q2FtZXJhLmNyZWF0ZSgnU2hhZG93Q2FtZXJhJywgdHlwZSwgZmFjZSk7XG5cbiAgICAgICAgLy8gZG9uJ3QgY2xlYXIgdGhlIGNvbG9yIGJ1ZmZlciBpZiByZW5kZXJpbmcgYSBkZXB0aCBtYXBcbiAgICAgICAgaWYgKHNoYWRvd1R5cGUgPj0gU0hBRE9XX1ZTTTggJiYgc2hhZG93VHlwZSA8PSBTSEFET1dfVlNNMzIpIHtcbiAgICAgICAgICAgIHNoYWRvd0NhbS5jbGVhckNvbG9yID0gbmV3IENvbG9yKDAsIDAsIDAsIDApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc2hhZG93Q2FtLmNsZWFyQ29sb3IgPSBuZXcgQ29sb3IoMSwgMSwgMSwgMSk7XG4gICAgICAgIH1cblxuICAgICAgICBzaGFkb3dDYW0uY2xlYXJEZXB0aEJ1ZmZlciA9IHRydWU7XG4gICAgICAgIHNoYWRvd0NhbS5jbGVhclN0ZW5jaWxCdWZmZXIgPSBmYWxzZTtcblxuICAgICAgICByZXR1cm4gc2hhZG93Q2FtO1xuICAgIH1cblxuICAgIHN0YXRpYyBzZXRTaGFkb3dDYW1lcmFTZXR0aW5ncyhzaGFkb3dDYW0sIGRldmljZSwgc2hhZG93VHlwZSwgdHlwZSwgaXNDbHVzdGVyZWQpIHtcblxuICAgICAgICAvLyBub3JtYWwgb21uaSBzaGFkb3dzIG9uIHdlYmdsMiBlbmNvZGUgZGVwdGggaW4gUkdCQTggYW5kIGRvIG1hbnVhbCBQQ0Ygc2FtcGxpbmdcbiAgICAgICAgLy8gY2x1c3RlcmVkIG9tbmkgc2hhZG93cyBvbiB3ZWJnbDIgdXNlIGRlcHRoIGZvcm1hdCBhbmQgaGFyZHdhcmUgUENGIHNhbXBsaW5nXG4gICAgICAgIGxldCBod1BjZiA9IHNoYWRvd1R5cGUgPT09IFNIQURPV19QQ0Y1IHx8ICgoc2hhZG93VHlwZSA9PT0gU0hBRE9XX1BDRjEgfHwgc2hhZG93VHlwZSA9PT0gU0hBRE9XX1BDRjMpICYmIGRldmljZS5zdXBwb3J0c0RlcHRoU2hhZG93KTtcbiAgICAgICAgaWYgKHR5cGUgPT09IExJR0hUVFlQRV9PTU5JICYmICFpc0NsdXN0ZXJlZCkge1xuICAgICAgICAgICAgaHdQY2YgPSBmYWxzZTtcbiAgICAgICAgfVxuXG4gICAgICAgIHNoYWRvd0NhbS5jbGVhckNvbG9yQnVmZmVyID0gIWh3UGNmO1xuICAgIH1cblxuICAgIF9jdWxsU2hhZG93Q2FzdGVyc0ludGVybmFsKG1lc2hJbnN0YW5jZXMsIHZpc2libGUsIGNhbWVyYSkge1xuXG4gICAgICAgIGNvbnN0IG51bUluc3RhbmNlcyA9IG1lc2hJbnN0YW5jZXMubGVuZ3RoO1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG51bUluc3RhbmNlczsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBtZXNoSW5zdGFuY2UgPSBtZXNoSW5zdGFuY2VzW2ldO1xuXG4gICAgICAgICAgICBpZiAobWVzaEluc3RhbmNlLmNhc3RTaGFkb3cpIHtcbiAgICAgICAgICAgICAgICBpZiAoIW1lc2hJbnN0YW5jZS5jdWxsIHx8IG1lc2hJbnN0YW5jZS5faXNWaXNpYmxlKGNhbWVyYSkpIHtcbiAgICAgICAgICAgICAgICAgICAgbWVzaEluc3RhbmNlLnZpc2libGVUaGlzRnJhbWUgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB2aXNpYmxlLnB1c2gobWVzaEluc3RhbmNlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDdWxscyB0aGUgbGlzdCBvZiBzaGFkb3cgY2FzdGVycyB1c2VkIGJ5IHRoZSBsaWdodCBieSB0aGUgY2FtZXJhLCBzdG9yaW5nIHZpc2libGUgbWVzaFxuICAgICAqIGluc3RhbmNlcyBpbiB0aGUgc3BlY2lmaWVkIGFycmF5LlxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuLi9jb21wb3NpdGlvbi9sYXllci1jb21wb3NpdGlvbi5qcycpLkxheWVyQ29tcG9zaXRpb259IGNvbXAgLSBUaGUgbGF5ZXJcbiAgICAgKiBjb21wb3NpdGlvbiB1c2VkIGFzIGEgc291cmNlIG9mIHNoYWRvdyBjYXN0ZXJzLCBpZiB0aG9zZSBhcmUgbm90IHByb3ZpZGVkIGRpcmVjdGx5LlxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuLi9saWdodC5qcycpLkxpZ2h0fSBsaWdodCAtIFRoZSBsaWdodC5cbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi4vbWVzaC1pbnN0YW5jZS5qcycpLk1lc2hJbnN0YW5jZVtdfSB2aXNpYmxlIC0gVGhlIGFycmF5IHRvIHN0b3JlIHZpc2libGVcbiAgICAgKiBtZXNoIGluc3RhbmNlcyBpbi5cbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi4vY2FtZXJhLmpzJykuQ2FtZXJhfSBjYW1lcmEgLSBUaGUgY2FtZXJhLlxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuLi9tZXNoLWluc3RhbmNlLmpzJykuTWVzaEluc3RhbmNlW119IFtjYXN0ZXJzXSAtIE9wdGlvbmFsIGFycmF5IG9mIG1lc2hcbiAgICAgKiBpbnN0YW5jZXMgdG8gdXNlIGFzIGNhc3RlcnMuXG4gICAgICogQGlnbm9yZVxuICAgICAqL1xuICAgIGN1bGxTaGFkb3dDYXN0ZXJzKGNvbXAsIGxpZ2h0LCB2aXNpYmxlLCBjYW1lcmEsIGNhc3RlcnMpIHtcblxuICAgICAgICB2aXNpYmxlLmxlbmd0aCA9IDA7XG5cbiAgICAgICAgLy8gaWYgdGhlIGNhc3RlcnMgYXJlIHN1cHBsaWVkLCB1c2UgdGhlbVxuICAgICAgICBpZiAoY2FzdGVycykge1xuXG4gICAgICAgICAgICB0aGlzLl9jdWxsU2hhZG93Q2FzdGVyc0ludGVybmFsKGNhc3RlcnMsIHZpc2libGUsIGNhbWVyYSk7XG5cbiAgICAgICAgfSBlbHNlIHsgICAgLy8gb3RoZXJ3aXNlLCBnZXQgdGhlbSBmcm9tIHRoZSBsYXllciBjb21wb3NpdGlvblxuXG4gICAgICAgICAgICAvLyBmb3IgZWFjaCBsYXllclxuICAgICAgICAgICAgY29uc3QgbGF5ZXJzID0gY29tcC5sYXllckxpc3Q7XG4gICAgICAgICAgICBjb25zdCBsZW4gPSBsYXllcnMubGVuZ3RoO1xuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBsZW47IGkrKykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGxheWVyID0gbGF5ZXJzW2ldO1xuICAgICAgICAgICAgICAgIGlmIChsYXllci5fbGlnaHRzU2V0LmhhcyhsaWdodCkpIHtcblxuICAgICAgICAgICAgICAgICAgICAvLyBsYXllciBjYW4gYmUgaW4gdGhlIGxpc3QgdHdvIHRpbWVzIChvcGFxdWUsIHRyYW5zcCksIGFkZCBjYXN0ZXJzIG9ubHkgb25lIHRpbWVcbiAgICAgICAgICAgICAgICAgICAgaWYgKCF0ZW1wU2V0LmhhcyhsYXllcikpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRlbXBTZXQuYWRkKGxheWVyKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fY3VsbFNoYWRvd0Nhc3RlcnNJbnRlcm5hbChsYXllci5zaGFkb3dDYXN0ZXJzLCB2aXNpYmxlLCBjYW1lcmEpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0ZW1wU2V0LmNsZWFyKCk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyB0aGlzIHNvcnRzIHRoZSBzaGFkb3cgY2FzdGVycyBieSB0aGUgc2hhZGVyIGlkXG4gICAgICAgIHZpc2libGUuc29ydCh0aGlzLnJlbmRlcmVyLnNvcnRDb21wYXJlRGVwdGgpO1xuICAgIH1cblxuICAgIHNldHVwUmVuZGVyU3RhdGUoZGV2aWNlLCBsaWdodCkge1xuXG4gICAgICAgIGNvbnN0IGlzQ2x1c3RlcmVkID0gdGhpcy5yZW5kZXJlci5zY2VuZS5jbHVzdGVyZWRMaWdodGluZ0VuYWJsZWQ7XG5cbiAgICAgICAgLy8gZGVwdGggYmlhc1xuICAgICAgICBpZiAoZGV2aWNlLndlYmdsMiB8fCBkZXZpY2UuaXNXZWJHUFUpIHtcbiAgICAgICAgICAgIGlmIChsaWdodC5fdHlwZSA9PT0gTElHSFRUWVBFX09NTkkgJiYgIWlzQ2x1c3RlcmVkKSB7XG4gICAgICAgICAgICAgICAgZGV2aWNlLnNldERlcHRoQmlhcyhmYWxzZSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGRldmljZS5zZXREZXB0aEJpYXModHJ1ZSk7XG4gICAgICAgICAgICAgICAgZGV2aWNlLnNldERlcHRoQmlhc1ZhbHVlcyhsaWdodC5zaGFkb3dCaWFzICogLTEwMDAuMCwgbGlnaHQuc2hhZG93QmlhcyAqIC0xMDAwLjApO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKGRldmljZS5leHRTdGFuZGFyZERlcml2YXRpdmVzKSB7XG4gICAgICAgICAgICBpZiAobGlnaHQuX3R5cGUgPT09IExJR0hUVFlQRV9PTU5JKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5wb2x5Z29uT2Zmc2V0WzBdID0gMDtcbiAgICAgICAgICAgICAgICB0aGlzLnBvbHlnb25PZmZzZXRbMV0gPSAwO1xuICAgICAgICAgICAgICAgIHRoaXMucG9seWdvbk9mZnNldElkLnNldFZhbHVlKHRoaXMucG9seWdvbk9mZnNldCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMucG9seWdvbk9mZnNldFswXSA9IGxpZ2h0LnNoYWRvd0JpYXMgKiAtMTAwMC4wO1xuICAgICAgICAgICAgICAgIHRoaXMucG9seWdvbk9mZnNldFsxXSA9IGxpZ2h0LnNoYWRvd0JpYXMgKiAtMTAwMC4wO1xuICAgICAgICAgICAgICAgIHRoaXMucG9seWdvbk9mZnNldElkLnNldFZhbHVlKHRoaXMucG9seWdvbk9mZnNldCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBTZXQgc3RhbmRhcmQgc2hhZG93bWFwIHN0YXRlc1xuICAgICAgICBjb25zdCBncHVPckdsMiA9IGRldmljZS53ZWJnbDIgfHwgZGV2aWNlLmlzV2ViR1BVO1xuICAgICAgICBjb25zdCB1c2VTaGFkb3dTYW1wbGVyID0gaXNDbHVzdGVyZWQgP1xuICAgICAgICAgICAgbGlnaHQuX2lzUGNmICYmIGdwdU9yR2wyIDogICAgIC8vIGJvdGggc3BvdCBhbmQgb21uaSBsaWdodCBhcmUgdXNpbmcgc2hhZG93IHNhbXBsZXIgb24gd2ViZ2wyIHdoZW4gY2x1c3RlcmVkXG4gICAgICAgICAgICBsaWdodC5faXNQY2YgJiYgZ3B1T3JHbDIgJiYgbGlnaHQuX3R5cGUgIT09IExJR0hUVFlQRV9PTU5JOyAgICAvLyBmb3Igbm9uLWNsdXN0ZXJlZCwgcG9pbnQgbGlnaHQgaXMgdXNpbmcgZGVwdGggZW5jb2RlZCBpbiBjb2xvciBidWZmZXIgKHNob3VsZCBjaGFuZ2UgdG8gc2hhZG93IHNhbXBsZXIpXG5cbiAgICAgICAgZGV2aWNlLnNldEJsZW5kU3RhdGUodXNlU2hhZG93U2FtcGxlciA/IHRoaXMuYmxlbmRTdGF0ZU5vV3JpdGUgOiB0aGlzLmJsZW5kU3RhdGVXcml0ZSk7XG4gICAgICAgIGRldmljZS5zZXREZXB0aFN0YXRlKERlcHRoU3RhdGUuREVGQVVMVCk7XG4gICAgICAgIGRldmljZS5zZXRTdGVuY2lsU3RhdGUobnVsbCwgbnVsbCk7XG4gICAgfVxuXG4gICAgcmVzdG9yZVJlbmRlclN0YXRlKGRldmljZSkge1xuXG4gICAgICAgIGlmIChkZXZpY2Uud2ViZ2wyIHx8IGRldmljZS5pc1dlYkdQVSkge1xuICAgICAgICAgICAgZGV2aWNlLnNldERlcHRoQmlhcyhmYWxzZSk7XG4gICAgICAgIH0gZWxzZSBpZiAoZGV2aWNlLmV4dFN0YW5kYXJkRGVyaXZhdGl2ZXMpIHtcbiAgICAgICAgICAgIHRoaXMucG9seWdvbk9mZnNldFswXSA9IDA7XG4gICAgICAgICAgICB0aGlzLnBvbHlnb25PZmZzZXRbMV0gPSAwO1xuICAgICAgICAgICAgdGhpcy5wb2x5Z29uT2Zmc2V0SWQuc2V0VmFsdWUodGhpcy5wb2x5Z29uT2Zmc2V0KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGRpc3BhdGNoVW5pZm9ybXMobGlnaHQsIHNoYWRvd0NhbSwgbGlnaHRSZW5kZXJEYXRhLCBmYWNlKSB7XG5cbiAgICAgICAgY29uc3Qgc2hhZG93Q2FtTm9kZSA9IHNoYWRvd0NhbS5fbm9kZTtcblxuICAgICAgICAvLyBwb3NpdGlvbiAvIHJhbmdlXG4gICAgICAgIGlmIChsaWdodC5fdHlwZSAhPT0gTElHSFRUWVBFX0RJUkVDVElPTkFMKSB7XG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLmRpc3BhdGNoVmlld1BvcyhzaGFkb3dDYW1Ob2RlLmdldFBvc2l0aW9uKCkpO1xuICAgICAgICAgICAgdGhpcy5zaGFkb3dNYXBMaWdodFJhZGl1c0lkLnNldFZhbHVlKGxpZ2h0LmF0dGVudWF0aW9uRW5kKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHZpZXctcHJvamVjdGlvbiBzaGFkb3cgbWF0cml4XG4gICAgICAgIHNoYWRvd0NhbVZpZXcuc2V0VFJTKHNoYWRvd0NhbU5vZGUuZ2V0UG9zaXRpb24oKSwgc2hhZG93Q2FtTm9kZS5nZXRSb3RhdGlvbigpLCBWZWMzLk9ORSkuaW52ZXJ0KCk7XG4gICAgICAgIHNoYWRvd0NhbVZpZXdQcm9qLm11bDIoc2hhZG93Q2FtLnByb2plY3Rpb25NYXRyaXgsIHNoYWRvd0NhbVZpZXcpO1xuXG4gICAgICAgIC8vIHZpZXdwb3J0IGhhbmRsaW5nXG4gICAgICAgIGNvbnN0IHJlY3RWaWV3cG9ydCA9IGxpZ2h0UmVuZGVyRGF0YS5zaGFkb3dWaWV3cG9ydDtcbiAgICAgICAgc2hhZG93Q2FtLnJlY3QgPSByZWN0Vmlld3BvcnQ7XG4gICAgICAgIHNoYWRvd0NhbS5zY2lzc29yUmVjdCA9IGxpZ2h0UmVuZGVyRGF0YS5zaGFkb3dTY2lzc29yO1xuXG4gICAgICAgIHZpZXdwb3J0TWF0cml4LnNldFZpZXdwb3J0KHJlY3RWaWV3cG9ydC54LCByZWN0Vmlld3BvcnQueSwgcmVjdFZpZXdwb3J0LnosIHJlY3RWaWV3cG9ydC53KTtcbiAgICAgICAgbGlnaHRSZW5kZXJEYXRhLnNoYWRvd01hdHJpeC5tdWwyKHZpZXdwb3J0TWF0cml4LCBzaGFkb3dDYW1WaWV3UHJvaik7XG5cbiAgICAgICAgaWYgKGxpZ2h0Ll90eXBlID09PSBMSUdIVFRZUEVfRElSRUNUSU9OQUwpIHtcbiAgICAgICAgICAgIC8vIGNvcHkgbWF0cml4IHRvIHNoYWRvdyBjYXNjYWRlIHBhbGV0dGVcbiAgICAgICAgICAgIGxpZ2h0Ll9zaGFkb3dNYXRyaXhQYWxldHRlLnNldChsaWdodFJlbmRlckRhdGEuc2hhZG93TWF0cml4LmRhdGEsIGZhY2UgKiAxNik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBnZXRTaGFkb3dQYXNzKGxpZ2h0KSB7XG5cbiAgICAgICAgLy8gZ2V0IHNoYWRlciBwYXNzIGZyb20gY2FjaGUgZm9yIHRoaXMgbGlnaHQgdHlwZSBhbmQgc2hhZG93IHR5cGVcbiAgICAgICAgY29uc3QgbGlnaHRUeXBlID0gbGlnaHQuX3R5cGU7XG4gICAgICAgIGNvbnN0IHNoYWRvd1R5cGUgPSBsaWdodC5fc2hhZG93VHlwZTtcbiAgICAgICAgbGV0IHNoYWRvd1Bhc3NJbmZvID0gdGhpcy5zaGFkb3dQYXNzQ2FjaGVbbGlnaHRUeXBlXT8uW3NoYWRvd1R5cGVdO1xuICAgICAgICBpZiAoIXNoYWRvd1Bhc3NJbmZvKSB7XG5cbiAgICAgICAgICAgIC8vIG5ldyBzaGFkZXIgcGFzcyBpZiBub3QgaW4gY2FjaGVcbiAgICAgICAgICAgIGNvbnN0IHNoYWRvd1Bhc3NOYW1lID0gYFNoYWRvd1Bhc3NfJHtsaWdodFR5cGV9XyR7c2hhZG93VHlwZX1gO1xuICAgICAgICAgICAgc2hhZG93UGFzc0luZm8gPSBTaGFkZXJQYXNzLmdldCh0aGlzLmRldmljZSkuYWxsb2NhdGUoc2hhZG93UGFzc05hbWUsIHtcbiAgICAgICAgICAgICAgICBpc1NoYWRvdzogdHJ1ZSxcbiAgICAgICAgICAgICAgICBsaWdodFR5cGU6IGxpZ2h0VHlwZSxcbiAgICAgICAgICAgICAgICBzaGFkb3dUeXBlOiBzaGFkb3dUeXBlXG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8gYWRkIGl0IHRvIHRoZSBjYWNoZVxuICAgICAgICAgICAgaWYgKCF0aGlzLnNoYWRvd1Bhc3NDYWNoZVtsaWdodFR5cGVdKVxuICAgICAgICAgICAgICAgIHRoaXMuc2hhZG93UGFzc0NhY2hlW2xpZ2h0VHlwZV0gPSBbXTtcbiAgICAgICAgICAgIHRoaXMuc2hhZG93UGFzc0NhY2hlW2xpZ2h0VHlwZV1bc2hhZG93VHlwZV0gPSBzaGFkb3dQYXNzSW5mbztcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBzaGFkb3dQYXNzSW5mby5pbmRleDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi4vbWVzaC1pbnN0YW5jZS5qcycpLk1lc2hJbnN0YW5jZVtdfSB2aXNpYmxlQ2FzdGVycyAtIFZpc2libGUgbWVzaFxuICAgICAqIGluc3RhbmNlcy5cbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi4vbGlnaHQuanMnKS5MaWdodH0gbGlnaHQgLSBUaGUgbGlnaHQuXG4gICAgICovXG4gICAgc3VibWl0Q2FzdGVycyh2aXNpYmxlQ2FzdGVycywgbGlnaHQpIHtcblxuICAgICAgICBjb25zdCBkZXZpY2UgPSB0aGlzLmRldmljZTtcbiAgICAgICAgY29uc3QgcmVuZGVyZXIgPSB0aGlzLnJlbmRlcmVyO1xuICAgICAgICBjb25zdCBzY2VuZSA9IHJlbmRlcmVyLnNjZW5lO1xuICAgICAgICBjb25zdCBwYXNzRmxhZ3MgPSAxIDw8IFNIQURFUl9TSEFET1c7XG4gICAgICAgIGNvbnN0IHNoYWRvd1Bhc3MgPSB0aGlzLmdldFNoYWRvd1Bhc3MobGlnaHQpO1xuXG4gICAgICAgIC8vIFRPRE86IFNpbWlsYXJseSB0byBmb3J3YXJkIHJlbmRlcmVyLCBhIHNoYWRlciBjcmVhdGlvbiBwYXJ0IG9mIHRoaXMgbG9vcCBzaG91bGQgYmUgc3BsaXQgaW50byBhIHNlcGFyYXRlIGxvb3AsXG4gICAgICAgIC8vIGFuZCBlbmRTaGFkZXJCYXRjaCBzaG91bGQgYmUgY2FsbGVkIGF0IGl0cyBlbmRcblxuICAgICAgICAvLyBSZW5kZXJcbiAgICAgICAgY29uc3QgY291bnQgPSB2aXNpYmxlQ2FzdGVycy5sZW5ndGg7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgY291bnQ7IGkrKykge1xuICAgICAgICAgICAgY29uc3QgbWVzaEluc3RhbmNlID0gdmlzaWJsZUNhc3RlcnNbaV07XG4gICAgICAgICAgICBjb25zdCBtZXNoID0gbWVzaEluc3RhbmNlLm1lc2g7XG5cbiAgICAgICAgICAgIG1lc2hJbnN0YW5jZS5lbnN1cmVNYXRlcmlhbChkZXZpY2UpO1xuICAgICAgICAgICAgY29uc3QgbWF0ZXJpYWwgPSBtZXNoSW5zdGFuY2UubWF0ZXJpYWw7XG5cbiAgICAgICAgICAgIC8vIHNldCBiYXNpYyBtYXRlcmlhbCBzdGF0ZXMvcGFyYW1ldGVyc1xuICAgICAgICAgICAgcmVuZGVyZXIuc2V0QmFzZUNvbnN0YW50cyhkZXZpY2UsIG1hdGVyaWFsKTtcbiAgICAgICAgICAgIHJlbmRlcmVyLnNldFNraW5uaW5nKGRldmljZSwgbWVzaEluc3RhbmNlKTtcblxuICAgICAgICAgICAgaWYgKG1hdGVyaWFsLmRpcnR5KSB7XG4gICAgICAgICAgICAgICAgbWF0ZXJpYWwudXBkYXRlVW5pZm9ybXMoZGV2aWNlLCBzY2VuZSk7XG4gICAgICAgICAgICAgICAgbWF0ZXJpYWwuZGlydHkgPSBmYWxzZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKG1hdGVyaWFsLmNodW5rcykge1xuXG4gICAgICAgICAgICAgICAgcmVuZGVyZXIuc2V0dXBDdWxsTW9kZSh0cnVlLCAxLCBtZXNoSW5zdGFuY2UpO1xuXG4gICAgICAgICAgICAgICAgLy8gVW5pZm9ybXMgSSAoc2hhZG93KTogbWF0ZXJpYWxcbiAgICAgICAgICAgICAgICBtYXRlcmlhbC5zZXRQYXJhbWV0ZXJzKGRldmljZSk7XG5cbiAgICAgICAgICAgICAgICAvLyBVbmlmb3JtcyBJSSAoc2hhZG93KTogbWVzaEluc3RhbmNlIG92ZXJyaWRlc1xuICAgICAgICAgICAgICAgIG1lc2hJbnN0YW5jZS5zZXRQYXJhbWV0ZXJzKGRldmljZSwgcGFzc0ZsYWdzKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3Qgc2hhZGVySW5zdGFuY2UgPSBtZXNoSW5zdGFuY2UuZ2V0U2hhZGVySW5zdGFuY2Uoc2hhZG93UGFzcywgMCwgc2NlbmUsIHRoaXMudmlld1VuaWZvcm1Gb3JtYXQsIHRoaXMudmlld0JpbmRHcm91cEZvcm1hdCk7XG4gICAgICAgICAgICBjb25zdCBzaGFkb3dTaGFkZXIgPSBzaGFkZXJJbnN0YW5jZS5zaGFkZXI7XG4gICAgICAgICAgICBEZWJ1Zy5hc3NlcnQoc2hhZG93U2hhZGVyLCBgbm8gc2hhZGVyIGZvciBwYXNzICR7c2hhZG93UGFzc31gLCBtYXRlcmlhbCk7XG5cbiAgICAgICAgICAgIC8vIHNvcnQgc2hhZG93IGNhc3RlcnMgYnkgc2hhZGVyXG4gICAgICAgICAgICBtZXNoSW5zdGFuY2UuX2tleVtTT1JUS0VZX0RFUFRIXSA9IHNoYWRvd1NoYWRlci5pZDtcblxuICAgICAgICAgICAgaWYgKCFzaGFkb3dTaGFkZXIuZmFpbGVkICYmICFkZXZpY2Uuc2V0U2hhZGVyKHNoYWRvd1NoYWRlcikpIHtcbiAgICAgICAgICAgICAgICBEZWJ1Zy5lcnJvcihgRXJyb3IgY29tcGlsaW5nIHNoYWRvdyBzaGFkZXIgZm9yIG1hdGVyaWFsPSR7bWF0ZXJpYWwubmFtZX0gcGFzcz0ke3NoYWRvd1Bhc3N9YCwgbWF0ZXJpYWwpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBzZXQgYnVmZmVyc1xuICAgICAgICAgICAgcmVuZGVyZXIuc2V0VmVydGV4QnVmZmVycyhkZXZpY2UsIG1lc2gpO1xuICAgICAgICAgICAgcmVuZGVyZXIuc2V0TW9ycGhpbmcoZGV2aWNlLCBtZXNoSW5zdGFuY2UubW9ycGhJbnN0YW5jZSk7XG5cbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuc2V0dXBNZXNoVW5pZm9ybUJ1ZmZlcnMoc2hhZGVySW5zdGFuY2UsIG1lc2hJbnN0YW5jZSk7XG5cbiAgICAgICAgICAgIGNvbnN0IHN0eWxlID0gbWVzaEluc3RhbmNlLnJlbmRlclN0eWxlO1xuICAgICAgICAgICAgZGV2aWNlLnNldEluZGV4QnVmZmVyKG1lc2guaW5kZXhCdWZmZXJbc3R5bGVdKTtcblxuICAgICAgICAgICAgLy8gZHJhd1xuICAgICAgICAgICAgcmVuZGVyZXIuZHJhd0luc3RhbmNlKGRldmljZSwgbWVzaEluc3RhbmNlLCBtZXNoLCBzdHlsZSk7XG4gICAgICAgICAgICByZW5kZXJlci5fc2hhZG93RHJhd0NhbGxzKys7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBuZWVkc1NoYWRvd1JlbmRlcmluZyhsaWdodCkge1xuXG4gICAgICAgIGNvbnN0IG5lZWRzID0gbGlnaHQuZW5hYmxlZCAmJiBsaWdodC5jYXN0U2hhZG93cyAmJiBsaWdodC5zaGFkb3dVcGRhdGVNb2RlICE9PSBTSEFET1dVUERBVEVfTk9ORSAmJiBsaWdodC52aXNpYmxlVGhpc0ZyYW1lO1xuXG4gICAgICAgIGlmIChsaWdodC5zaGFkb3dVcGRhdGVNb2RlID09PSBTSEFET1dVUERBVEVfVEhJU0ZSQU1FKSB7XG4gICAgICAgICAgICBsaWdodC5zaGFkb3dVcGRhdGVNb2RlID0gU0hBRE9XVVBEQVRFX05PTkU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAobmVlZHMpIHtcbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuX3NoYWRvd01hcFVwZGF0ZXMgKz0gbGlnaHQubnVtU2hhZG93RmFjZXM7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gbmVlZHM7XG4gICAgfVxuXG4gICAgZ2V0TGlnaHRSZW5kZXJEYXRhKGxpZ2h0LCBjYW1lcmEsIGZhY2UpIHtcbiAgICAgICAgLy8gZGlyZWN0aW9uYWwgc2hhZG93cyBhcmUgcGVyIGNhbWVyYSwgc28gZ2V0IGFwcHJvcHJpYXRlIHJlbmRlciBkYXRhXG4gICAgICAgIHJldHVybiBsaWdodC5nZXRSZW5kZXJEYXRhKGxpZ2h0Ll90eXBlID09PSBMSUdIVFRZUEVfRElSRUNUSU9OQUwgPyBjYW1lcmEgOiBudWxsLCBmYWNlKTtcbiAgICB9XG5cbiAgICBzZXR1cFJlbmRlclBhc3MocmVuZGVyUGFzcywgc2hhZG93Q2FtZXJhLCBjbGVhclJlbmRlclRhcmdldCkge1xuXG4gICAgICAgIGNvbnN0IHJ0ID0gc2hhZG93Q2FtZXJhLnJlbmRlclRhcmdldDtcbiAgICAgICAgcmVuZGVyUGFzcy5pbml0KHJ0KTtcblxuICAgICAgICByZW5kZXJQYXNzLmRlcHRoU3RlbmNpbE9wcy5jbGVhckRlcHRoVmFsdWUgPSAxO1xuICAgICAgICByZW5kZXJQYXNzLmRlcHRoU3RlbmNpbE9wcy5jbGVhckRlcHRoID0gY2xlYXJSZW5kZXJUYXJnZXQ7XG5cbiAgICAgICAgLy8gaWYgcmVuZGVyaW5nIHRvIGRlcHRoIGJ1ZmZlclxuICAgICAgICBpZiAocnQuZGVwdGhCdWZmZXIpIHtcblxuICAgICAgICAgICAgcmVuZGVyUGFzcy5kZXB0aFN0ZW5jaWxPcHMuc3RvcmVEZXB0aCA9IHRydWU7XG5cbiAgICAgICAgfSBlbHNlIHsgLy8gcmVuZGVyaW5nIHRvIGNvbG9yIGJ1ZmZlclxuXG4gICAgICAgICAgICByZW5kZXJQYXNzLmNvbG9yT3BzLmNsZWFyVmFsdWUuY29weShzaGFkb3dDYW1lcmEuY2xlYXJDb2xvcik7XG4gICAgICAgICAgICByZW5kZXJQYXNzLmNvbG9yT3BzLmNsZWFyID0gY2xlYXJSZW5kZXJUYXJnZXQ7XG4gICAgICAgICAgICByZW5kZXJQYXNzLmRlcHRoU3RlbmNpbE9wcy5zdG9yZURlcHRoID0gZmFsc2U7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBub3Qgc2FtcGxpbmcgZHluYW1pY2FsbHkgZ2VuZXJhdGVkIGN1YmVtYXBzXG4gICAgICAgIHJlbmRlclBhc3MucmVxdWlyZXNDdWJlbWFwcyA9IGZhbHNlO1xuICAgIH1cblxuICAgIC8vIHByZXBhcmVzIHJlbmRlciB0YXJnZXQgLyByZW5kZXIgdGFyZ2V0IHNldHRpbmdzIHRvIGFsbG93IHJlbmRlciBwYXNzIHRvIGJlIHNldCB1cFxuICAgIHByZXBhcmVGYWNlKGxpZ2h0LCBjYW1lcmEsIGZhY2UpIHtcblxuICAgICAgICBjb25zdCB0eXBlID0gbGlnaHQuX3R5cGU7XG4gICAgICAgIGNvbnN0IHNoYWRvd1R5cGUgPSBsaWdodC5fc2hhZG93VHlwZTtcbiAgICAgICAgY29uc3QgaXNDbHVzdGVyZWQgPSB0aGlzLnJlbmRlcmVyLnNjZW5lLmNsdXN0ZXJlZExpZ2h0aW5nRW5hYmxlZDtcblxuICAgICAgICBjb25zdCBsaWdodFJlbmRlckRhdGEgPSB0aGlzLmdldExpZ2h0UmVuZGVyRGF0YShsaWdodCwgY2FtZXJhLCBmYWNlKTtcbiAgICAgICAgY29uc3Qgc2hhZG93Q2FtID0gbGlnaHRSZW5kZXJEYXRhLnNoYWRvd0NhbWVyYTtcblxuICAgICAgICAvLyBjYW1lcmEgY2xlYXIgc2V0dGluZ1xuICAgICAgICAvLyBOb3RlOiB3aGVuIGNsdXN0ZXJlZCBsaWdodGluZyBpcyB0aGUgb25seSBsaWdodGluZyB0eXBlLCB0aGlzIGNvZGUgY2FuIGJlIG1vdmVkIHRvIGNyZWF0ZVNoYWRvd0NhbWVyYSBmdW5jdGlvblxuICAgICAgICBTaGFkb3dSZW5kZXJlci5zZXRTaGFkb3dDYW1lcmFTZXR0aW5ncyhzaGFkb3dDYW0sIHRoaXMuZGV2aWNlLCBzaGFkb3dUeXBlLCB0eXBlLCBpc0NsdXN0ZXJlZCk7XG5cbiAgICAgICAgLy8gYXNzaWduIHJlbmRlciB0YXJnZXQgZm9yIHRoZSBmYWNlXG4gICAgICAgIGNvbnN0IHJlbmRlclRhcmdldEluZGV4ID0gdHlwZSA9PT0gTElHSFRUWVBFX0RJUkVDVElPTkFMID8gMCA6IGZhY2U7XG4gICAgICAgIHNoYWRvd0NhbS5yZW5kZXJUYXJnZXQgPSBsaWdodC5fc2hhZG93TWFwLnJlbmRlclRhcmdldHNbcmVuZGVyVGFyZ2V0SW5kZXhdO1xuXG4gICAgICAgIHJldHVybiBzaGFkb3dDYW07XG4gICAgfVxuXG4gICAgcmVuZGVyRmFjZShsaWdodCwgY2FtZXJhLCBmYWNlLCBjbGVhciwgaW5zaWRlUmVuZGVyUGFzcyA9IHRydWUpIHtcblxuICAgICAgICBjb25zdCBkZXZpY2UgPSB0aGlzLmRldmljZTtcblxuICAgICAgICAvLyAjaWYgX1BST0ZJTEVSXG4gICAgICAgIGNvbnN0IHNoYWRvd01hcFN0YXJ0VGltZSA9IG5vdygpO1xuICAgICAgICAvLyAjZW5kaWZcblxuICAgICAgICBEZWJ1Z0dyYXBoaWNzLnB1c2hHcHVNYXJrZXIoZGV2aWNlLCBgU0hBRE9XICR7bGlnaHQuX25vZGUubmFtZX0gRkFDRSAke2ZhY2V9YCk7XG5cbiAgICAgICAgY29uc3QgbGlnaHRSZW5kZXJEYXRhID0gdGhpcy5nZXRMaWdodFJlbmRlckRhdGEobGlnaHQsIGNhbWVyYSwgZmFjZSk7XG4gICAgICAgIGNvbnN0IHNoYWRvd0NhbSA9IGxpZ2h0UmVuZGVyRGF0YS5zaGFkb3dDYW1lcmE7XG5cbiAgICAgICAgdGhpcy5kaXNwYXRjaFVuaWZvcm1zKGxpZ2h0LCBzaGFkb3dDYW0sIGxpZ2h0UmVuZGVyRGF0YSwgZmFjZSk7XG5cbiAgICAgICAgY29uc3QgcnQgPSBzaGFkb3dDYW0ucmVuZGVyVGFyZ2V0O1xuICAgICAgICBjb25zdCByZW5kZXJlciA9IHRoaXMucmVuZGVyZXI7XG4gICAgICAgIHJlbmRlcmVyLnNldENhbWVyYVVuaWZvcm1zKHNoYWRvd0NhbSwgcnQpO1xuICAgICAgICBpZiAoZGV2aWNlLnN1cHBvcnRzVW5pZm9ybUJ1ZmZlcnMpIHtcbiAgICAgICAgICAgIHJlbmRlcmVyLnNldHVwVmlld1VuaWZvcm1CdWZmZXJzKGxpZ2h0UmVuZGVyRGF0YS52aWV3QmluZEdyb3VwcywgdGhpcy52aWV3VW5pZm9ybUZvcm1hdCwgdGhpcy52aWV3QmluZEdyb3VwRm9ybWF0LCAxKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChpbnNpZGVSZW5kZXJQYXNzKSB7XG4gICAgICAgICAgICByZW5kZXJlci5zZXR1cFZpZXdwb3J0KHNoYWRvd0NhbSwgcnQpO1xuXG4gICAgICAgICAgICAvLyBjbGVhciBoZXJlIGlzIHVzZWQgdG8gY2xlYXIgYSB2aWV3cG9ydCBpbnNpZGUgcmVuZGVyIHRhcmdldC5cbiAgICAgICAgICAgIGlmIChjbGVhcikge1xuICAgICAgICAgICAgICAgIHJlbmRlcmVyLmNsZWFyKHNoYWRvd0NhbSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG5cbiAgICAgICAgICAgIC8vIHRoaXMgaXMgb25seSB1c2VkIGJ5IGxpZ2h0bWFwcGVyLCB0aWxsIGl0J3MgY29udmVydGVkIHRvIHJlbmRlciBwYXNzZXNcbiAgICAgICAgICAgIHJlbmRlcmVyLmNsZWFyVmlldyhzaGFkb3dDYW0sIHJ0LCB0cnVlLCBmYWxzZSk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnNldHVwUmVuZGVyU3RhdGUoZGV2aWNlLCBsaWdodCk7XG5cbiAgICAgICAgLy8gcmVuZGVyIG1lc2ggaW5zdGFuY2VzXG4gICAgICAgIHRoaXMuc3VibWl0Q2FzdGVycyhsaWdodFJlbmRlckRhdGEudmlzaWJsZUNhc3RlcnMsIGxpZ2h0KTtcblxuICAgICAgICB0aGlzLnJlc3RvcmVSZW5kZXJTdGF0ZShkZXZpY2UpO1xuXG4gICAgICAgIERlYnVnR3JhcGhpY3MucG9wR3B1TWFya2VyKGRldmljZSk7XG5cbiAgICAgICAgLy8gI2lmIF9QUk9GSUxFUlxuICAgICAgICByZW5kZXJlci5fc2hhZG93TWFwVGltZSArPSBub3coKSAtIHNoYWRvd01hcFN0YXJ0VGltZTtcbiAgICAgICAgLy8gI2VuZGlmXG4gICAgfVxuXG4gICAgcmVuZGVyKGxpZ2h0LCBjYW1lcmEsIGluc2lkZVJlbmRlclBhc3MgPSB0cnVlKSB7XG5cbiAgICAgICAgaWYgKHRoaXMubmVlZHNTaGFkb3dSZW5kZXJpbmcobGlnaHQpKSB7XG4gICAgICAgICAgICBjb25zdCBmYWNlQ291bnQgPSBsaWdodC5udW1TaGFkb3dGYWNlcztcblxuICAgICAgICAgICAgLy8gcmVuZGVyIGZhY2VzXG4gICAgICAgICAgICBmb3IgKGxldCBmYWNlID0gMDsgZmFjZSA8IGZhY2VDb3VudDsgZmFjZSsrKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5wcmVwYXJlRmFjZShsaWdodCwgY2FtZXJhLCBmYWNlKTtcbiAgICAgICAgICAgICAgICB0aGlzLnJlbmRlckZhY2UobGlnaHQsIGNhbWVyYSwgZmFjZSwgdHJ1ZSwgaW5zaWRlUmVuZGVyUGFzcyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIGFwcGx5IHZzbVxuICAgICAgICAgICAgdGhpcy5yZW5kZXJWc20obGlnaHQsIGNhbWVyYSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZW5kZXJWc20obGlnaHQsIGNhbWVyYSkge1xuXG4gICAgICAgIC8vIFZTTSBibHVyIGlmIGxpZ2h0IHN1cHBvcnRzIHZzbSAoZGlyZWN0aW9uYWwgYW5kIHNwb3QgaW4gZ2VuZXJhbClcbiAgICAgICAgaWYgKGxpZ2h0Ll9pc1ZzbSAmJiBsaWdodC5fdnNtQmx1clNpemUgPiAxKSB7XG5cbiAgICAgICAgICAgIC8vIGluIGNsdXN0ZXJlZCBtb2RlLCBvbmx5IGRpcmVjdGlvbmFsIGxpZ2h0IGNhbiBiZSB2bXNcbiAgICAgICAgICAgIGNvbnN0IGlzQ2x1c3RlcmVkID0gdGhpcy5yZW5kZXJlci5zY2VuZS5jbHVzdGVyZWRMaWdodGluZ0VuYWJsZWQ7XG4gICAgICAgICAgICBpZiAoIWlzQ2x1c3RlcmVkIHx8IGxpZ2h0Ll90eXBlID09PSBMSUdIVFRZUEVfRElSRUNUSU9OQUwpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmFwcGx5VnNtQmx1cihsaWdodCwgY2FtZXJhKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGdldFZzbUJsdXJTaGFkZXIoaXNWc204LCBibHVyTW9kZSwgZmlsdGVyU2l6ZSkge1xuXG4gICAgICAgIGxldCBibHVyU2hhZGVyID0gKGlzVnNtOCA/IHRoaXMuYmx1clBhY2tlZFZzbVNoYWRlciA6IHRoaXMuYmx1clZzbVNoYWRlcilbYmx1ck1vZGVdW2ZpbHRlclNpemVdO1xuICAgICAgICBpZiAoIWJsdXJTaGFkZXIpIHtcbiAgICAgICAgICAgIHRoaXMuYmx1clZzbVdlaWdodHNbZmlsdGVyU2l6ZV0gPSBnYXVzc1dlaWdodHMoZmlsdGVyU2l6ZSk7XG5cbiAgICAgICAgICAgIGNvbnN0IGJsdXJWUyA9IHNoYWRlckNodW5rcy5mdWxsc2NyZWVuUXVhZFZTO1xuICAgICAgICAgICAgbGV0IGJsdXJGUyA9ICcjZGVmaW5lIFNBTVBMRVMgJyArIGZpbHRlclNpemUgKyAnXFxuJztcbiAgICAgICAgICAgIGlmIChpc1ZzbTgpIHtcbiAgICAgICAgICAgICAgICBibHVyRlMgKz0gdGhpcy5ibHVyUGFja2VkVnNtU2hhZGVyQ29kZVtibHVyTW9kZV07XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGJsdXJGUyArPSB0aGlzLmJsdXJWc21TaGFkZXJDb2RlW2JsdXJNb2RlXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGJsdXJTaGFkZXJOYW1lID0gJ2JsdXJWc20nICsgYmx1ck1vZGUgKyAnJyArIGZpbHRlclNpemUgKyAnJyArIGlzVnNtODtcbiAgICAgICAgICAgIGJsdXJTaGFkZXIgPSBjcmVhdGVTaGFkZXJGcm9tQ29kZSh0aGlzLmRldmljZSwgYmx1clZTLCBibHVyRlMsIGJsdXJTaGFkZXJOYW1lKTtcblxuICAgICAgICAgICAgaWYgKGlzVnNtOCkge1xuICAgICAgICAgICAgICAgIHRoaXMuYmx1clBhY2tlZFZzbVNoYWRlcltibHVyTW9kZV1bZmlsdGVyU2l6ZV0gPSBibHVyU2hhZGVyO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLmJsdXJWc21TaGFkZXJbYmx1ck1vZGVdW2ZpbHRlclNpemVdID0gYmx1clNoYWRlcjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBibHVyU2hhZGVyO1xuICAgIH1cblxuICAgIGFwcGx5VnNtQmx1cihsaWdodCwgY2FtZXJhKSB7XG5cbiAgICAgICAgY29uc3QgZGV2aWNlID0gdGhpcy5kZXZpY2U7XG5cbiAgICAgICAgRGVidWdHcmFwaGljcy5wdXNoR3B1TWFya2VyKGRldmljZSwgYFZTTSAke2xpZ2h0Ll9ub2RlLm5hbWV9YCk7XG5cbiAgICAgICAgLy8gcmVuZGVyIHN0YXRlXG4gICAgICAgIGRldmljZS5zZXRCbGVuZFN0YXRlKEJsZW5kU3RhdGUuTk9CTEVORCk7XG5cbiAgICAgICAgY29uc3QgbGlnaHRSZW5kZXJEYXRhID0gbGlnaHQuZ2V0UmVuZGVyRGF0YShsaWdodC5fdHlwZSA9PT0gTElHSFRUWVBFX0RJUkVDVElPTkFMID8gY2FtZXJhIDogbnVsbCwgMCk7XG4gICAgICAgIGNvbnN0IHNoYWRvd0NhbSA9IGxpZ2h0UmVuZGVyRGF0YS5zaGFkb3dDYW1lcmE7XG4gICAgICAgIGNvbnN0IG9yaWdTaGFkb3dNYXAgPSBzaGFkb3dDYW0ucmVuZGVyVGFyZ2V0O1xuXG4gICAgICAgIC8vIHRlbXBvcmFyeSByZW5kZXIgdGFyZ2V0IGZvciBibHVycmluZ1xuICAgICAgICAvLyBUT0RPOiB0aGlzIGlzIHByb2JhYmx5IG5vdCBvcHRpbWFsIGFuZCBzaGFkb3cgbWFwIGNvdWxkIGhhdmUgZGVwdGggYnVmZmVyIG9uIGluIGFkZGl0aW9uIHRvIGNvbG9yIGJ1ZmZlcixcbiAgICAgICAgLy8gYW5kIGZvciBibHVycmluZyBvbmx5IG9uZSBidWZmZXIgaXMgbmVlZGVkLlxuICAgICAgICBjb25zdCB0ZW1wU2hhZG93TWFwID0gdGhpcy5yZW5kZXJlci5zaGFkb3dNYXBDYWNoZS5nZXQoZGV2aWNlLCBsaWdodCk7XG4gICAgICAgIGNvbnN0IHRlbXBSdCA9IHRlbXBTaGFkb3dNYXAucmVuZGVyVGFyZ2V0c1swXTtcblxuICAgICAgICBjb25zdCBpc1ZzbTggPSBsaWdodC5fc2hhZG93VHlwZSA9PT0gU0hBRE9XX1ZTTTg7XG4gICAgICAgIGNvbnN0IGJsdXJNb2RlID0gbGlnaHQudnNtQmx1ck1vZGU7XG4gICAgICAgIGNvbnN0IGZpbHRlclNpemUgPSBsaWdodC5fdnNtQmx1clNpemU7XG4gICAgICAgIGNvbnN0IGJsdXJTaGFkZXIgPSB0aGlzLmdldFZzbUJsdXJTaGFkZXIoaXNWc204LCBibHVyTW9kZSwgZmlsdGVyU2l6ZSk7XG5cbiAgICAgICAgYmx1clNjaXNzb3JSZWN0LnogPSBsaWdodC5fc2hhZG93UmVzb2x1dGlvbiAtIDI7XG4gICAgICAgIGJsdXJTY2lzc29yUmVjdC53ID0gYmx1clNjaXNzb3JSZWN0Lno7XG5cbiAgICAgICAgLy8gQmx1ciBob3Jpem9udGFsXG4gICAgICAgIHRoaXMuc291cmNlSWQuc2V0VmFsdWUob3JpZ1NoYWRvd01hcC5jb2xvckJ1ZmZlcik7XG4gICAgICAgIHBpeGVsT2Zmc2V0WzBdID0gMSAvIGxpZ2h0Ll9zaGFkb3dSZXNvbHV0aW9uO1xuICAgICAgICBwaXhlbE9mZnNldFsxXSA9IDA7XG4gICAgICAgIHRoaXMucGl4ZWxPZmZzZXRJZC5zZXRWYWx1ZShwaXhlbE9mZnNldCk7XG4gICAgICAgIGlmIChibHVyTW9kZSA9PT0gQkxVUl9HQVVTU0lBTikgdGhpcy53ZWlnaHRJZC5zZXRWYWx1ZSh0aGlzLmJsdXJWc21XZWlnaHRzW2ZpbHRlclNpemVdKTtcbiAgICAgICAgZHJhd1F1YWRXaXRoU2hhZGVyKGRldmljZSwgdGVtcFJ0LCBibHVyU2hhZGVyLCBudWxsLCBibHVyU2Npc3NvclJlY3QpO1xuXG4gICAgICAgIC8vIEJsdXIgdmVydGljYWxcbiAgICAgICAgdGhpcy5zb3VyY2VJZC5zZXRWYWx1ZSh0ZW1wUnQuY29sb3JCdWZmZXIpO1xuICAgICAgICBwaXhlbE9mZnNldFsxXSA9IHBpeGVsT2Zmc2V0WzBdO1xuICAgICAgICBwaXhlbE9mZnNldFswXSA9IDA7XG4gICAgICAgIHRoaXMucGl4ZWxPZmZzZXRJZC5zZXRWYWx1ZShwaXhlbE9mZnNldCk7XG4gICAgICAgIGRyYXdRdWFkV2l0aFNoYWRlcihkZXZpY2UsIG9yaWdTaGFkb3dNYXAsIGJsdXJTaGFkZXIsIG51bGwsIGJsdXJTY2lzc29yUmVjdCk7XG5cbiAgICAgICAgLy8gcmV0dXJuIHRoZSB0ZW1wb3Jhcnkgc2hhZG93IG1hcCBiYWNrIHRvIHRoZSBjYWNoZVxuICAgICAgICB0aGlzLnJlbmRlcmVyLnNoYWRvd01hcENhY2hlLmFkZChsaWdodCwgdGVtcFNoYWRvd01hcCk7XG5cbiAgICAgICAgRGVidWdHcmFwaGljcy5wb3BHcHVNYXJrZXIoZGV2aWNlKTtcbiAgICB9XG5cbiAgICBpbml0Vmlld0JpbmRHcm91cEZvcm1hdCgpIHtcblxuICAgICAgICBpZiAodGhpcy5kZXZpY2Uuc3VwcG9ydHNVbmlmb3JtQnVmZmVycyAmJiAhdGhpcy52aWV3VW5pZm9ybUZvcm1hdCkge1xuXG4gICAgICAgICAgICAvLyBmb3JtYXQgb2YgdGhlIHZpZXcgdW5pZm9ybSBidWZmZXJcbiAgICAgICAgICAgIHRoaXMudmlld1VuaWZvcm1Gb3JtYXQgPSBuZXcgVW5pZm9ybUJ1ZmZlckZvcm1hdCh0aGlzLmRldmljZSwgW1xuICAgICAgICAgICAgICAgIG5ldyBVbmlmb3JtRm9ybWF0KFwibWF0cml4X3ZpZXdQcm9qZWN0aW9uXCIsIFVOSUZPUk1UWVBFX01BVDQpXG4gICAgICAgICAgICBdKTtcblxuICAgICAgICAgICAgLy8gZm9ybWF0IG9mIHRoZSB2aWV3IGJpbmQgZ3JvdXAgLSBjb250YWlucyBzaW5nbGUgdW5pZm9ybSBidWZmZXIsIGFuZCBubyB0ZXh0dXJlc1xuICAgICAgICAgICAgdGhpcy52aWV3QmluZEdyb3VwRm9ybWF0ID0gbmV3IEJpbmRHcm91cEZvcm1hdCh0aGlzLmRldmljZSwgW1xuICAgICAgICAgICAgICAgIG5ldyBCaW5kQnVmZmVyRm9ybWF0KFVOSUZPUk1fQlVGRkVSX0RFRkFVTFRfU0xPVF9OQU1FLCBTSEFERVJTVEFHRV9WRVJURVggfCBTSEFERVJTVEFHRV9GUkFHTUVOVClcbiAgICAgICAgICAgIF0sIFtcbiAgICAgICAgICAgIF0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnJhbWVVcGRhdGUoKSB7XG4gICAgICAgIHRoaXMuaW5pdFZpZXdCaW5kR3JvdXBGb3JtYXQoKTtcbiAgICB9XG59XG5cbmV4cG9ydCB7IFNoYWRvd1JlbmRlcmVyIH07XG4iXSwibmFtZXMiOlsiZ2F1c3MiLCJ4Iiwic2lnbWEiLCJNYXRoIiwiZXhwIiwiZ2F1c3NXZWlnaHRzIiwia2VybmVsU2l6ZSIsImhhbGZXaWR0aCIsInZhbHVlcyIsIkFycmF5Iiwic3VtIiwiaSIsInRlbXBTZXQiLCJTZXQiLCJzaGFkb3dDYW1WaWV3IiwiTWF0NCIsInNoYWRvd0NhbVZpZXdQcm9qIiwicGl4ZWxPZmZzZXQiLCJGbG9hdDMyQXJyYXkiLCJibHVyU2Npc3NvclJlY3QiLCJWZWM0Iiwidmlld3BvcnRNYXRyaXgiLCJTaGFkb3dSZW5kZXJlciIsImNvbnN0cnVjdG9yIiwicmVuZGVyZXIiLCJsaWdodFRleHR1cmVBdGxhcyIsInNoYWRvd1Bhc3NDYWNoZSIsImRldmljZSIsInNjb3BlIiwicG9seWdvbk9mZnNldElkIiwicmVzb2x2ZSIsInBvbHlnb25PZmZzZXQiLCJzb3VyY2VJZCIsInBpeGVsT2Zmc2V0SWQiLCJ3ZWlnaHRJZCIsImJsdXJWc21TaGFkZXJDb2RlIiwic2hhZGVyQ2h1bmtzIiwiYmx1clZTTVBTIiwicGFja2VkIiwiYmx1clBhY2tlZFZzbVNoYWRlckNvZGUiLCJibHVyVnNtU2hhZGVyIiwiYmx1clBhY2tlZFZzbVNoYWRlciIsImJsdXJWc21XZWlnaHRzIiwic2hhZG93TWFwTGlnaHRSYWRpdXNJZCIsInZpZXdVbmlmb3JtRm9ybWF0Iiwidmlld0JpbmRHcm91cEZvcm1hdCIsImJsZW5kU3RhdGVXcml0ZSIsIkJsZW5kU3RhdGUiLCJibGVuZFN0YXRlTm9Xcml0ZSIsInNldENvbG9yV3JpdGUiLCJjcmVhdGVTaGFkb3dDYW1lcmEiLCJzaGFkb3dUeXBlIiwidHlwZSIsImZhY2UiLCJzaGFkb3dDYW0iLCJMaWdodENhbWVyYSIsImNyZWF0ZSIsIlNIQURPV19WU004IiwiU0hBRE9XX1ZTTTMyIiwiY2xlYXJDb2xvciIsIkNvbG9yIiwiY2xlYXJEZXB0aEJ1ZmZlciIsImNsZWFyU3RlbmNpbEJ1ZmZlciIsInNldFNoYWRvd0NhbWVyYVNldHRpbmdzIiwiaXNDbHVzdGVyZWQiLCJod1BjZiIsIlNIQURPV19QQ0Y1IiwiU0hBRE9XX1BDRjEiLCJTSEFET1dfUENGMyIsInN1cHBvcnRzRGVwdGhTaGFkb3ciLCJMSUdIVFRZUEVfT01OSSIsImNsZWFyQ29sb3JCdWZmZXIiLCJfY3VsbFNoYWRvd0Nhc3RlcnNJbnRlcm5hbCIsIm1lc2hJbnN0YW5jZXMiLCJ2aXNpYmxlIiwiY2FtZXJhIiwibnVtSW5zdGFuY2VzIiwibGVuZ3RoIiwibWVzaEluc3RhbmNlIiwiY2FzdFNoYWRvdyIsImN1bGwiLCJfaXNWaXNpYmxlIiwidmlzaWJsZVRoaXNGcmFtZSIsInB1c2giLCJjdWxsU2hhZG93Q2FzdGVycyIsImNvbXAiLCJsaWdodCIsImNhc3RlcnMiLCJsYXllcnMiLCJsYXllckxpc3QiLCJsZW4iLCJsYXllciIsIl9saWdodHNTZXQiLCJoYXMiLCJhZGQiLCJzaGFkb3dDYXN0ZXJzIiwiY2xlYXIiLCJzb3J0Iiwic29ydENvbXBhcmVEZXB0aCIsInNldHVwUmVuZGVyU3RhdGUiLCJzY2VuZSIsImNsdXN0ZXJlZExpZ2h0aW5nRW5hYmxlZCIsIndlYmdsMiIsImlzV2ViR1BVIiwiX3R5cGUiLCJzZXREZXB0aEJpYXMiLCJzZXREZXB0aEJpYXNWYWx1ZXMiLCJzaGFkb3dCaWFzIiwiZXh0U3RhbmRhcmREZXJpdmF0aXZlcyIsInNldFZhbHVlIiwiZ3B1T3JHbDIiLCJ1c2VTaGFkb3dTYW1wbGVyIiwiX2lzUGNmIiwic2V0QmxlbmRTdGF0ZSIsInNldERlcHRoU3RhdGUiLCJEZXB0aFN0YXRlIiwiREVGQVVMVCIsInNldFN0ZW5jaWxTdGF0ZSIsInJlc3RvcmVSZW5kZXJTdGF0ZSIsImRpc3BhdGNoVW5pZm9ybXMiLCJsaWdodFJlbmRlckRhdGEiLCJzaGFkb3dDYW1Ob2RlIiwiX25vZGUiLCJMSUdIVFRZUEVfRElSRUNUSU9OQUwiLCJkaXNwYXRjaFZpZXdQb3MiLCJnZXRQb3NpdGlvbiIsImF0dGVudWF0aW9uRW5kIiwic2V0VFJTIiwiZ2V0Um90YXRpb24iLCJWZWMzIiwiT05FIiwiaW52ZXJ0IiwibXVsMiIsInByb2plY3Rpb25NYXRyaXgiLCJyZWN0Vmlld3BvcnQiLCJzaGFkb3dWaWV3cG9ydCIsInJlY3QiLCJzY2lzc29yUmVjdCIsInNoYWRvd1NjaXNzb3IiLCJzZXRWaWV3cG9ydCIsInkiLCJ6IiwidyIsInNoYWRvd01hdHJpeCIsIl9zaGFkb3dNYXRyaXhQYWxldHRlIiwic2V0IiwiZGF0YSIsImdldFNoYWRvd1Bhc3MiLCJfdGhpcyRzaGFkb3dQYXNzQ2FjaGUiLCJsaWdodFR5cGUiLCJfc2hhZG93VHlwZSIsInNoYWRvd1Bhc3NJbmZvIiwic2hhZG93UGFzc05hbWUiLCJTaGFkZXJQYXNzIiwiZ2V0IiwiYWxsb2NhdGUiLCJpc1NoYWRvdyIsImluZGV4Iiwic3VibWl0Q2FzdGVycyIsInZpc2libGVDYXN0ZXJzIiwicGFzc0ZsYWdzIiwiU0hBREVSX1NIQURPVyIsInNoYWRvd1Bhc3MiLCJjb3VudCIsIm1lc2giLCJlbnN1cmVNYXRlcmlhbCIsIm1hdGVyaWFsIiwic2V0QmFzZUNvbnN0YW50cyIsInNldFNraW5uaW5nIiwiZGlydHkiLCJ1cGRhdGVVbmlmb3JtcyIsImNodW5rcyIsInNldHVwQ3VsbE1vZGUiLCJzZXRQYXJhbWV0ZXJzIiwic2hhZGVySW5zdGFuY2UiLCJnZXRTaGFkZXJJbnN0YW5jZSIsInNoYWRvd1NoYWRlciIsInNoYWRlciIsIkRlYnVnIiwiYXNzZXJ0IiwiX2tleSIsIlNPUlRLRVlfREVQVEgiLCJpZCIsImZhaWxlZCIsInNldFNoYWRlciIsImVycm9yIiwibmFtZSIsInNldFZlcnRleEJ1ZmZlcnMiLCJzZXRNb3JwaGluZyIsIm1vcnBoSW5zdGFuY2UiLCJzZXR1cE1lc2hVbmlmb3JtQnVmZmVycyIsInN0eWxlIiwicmVuZGVyU3R5bGUiLCJzZXRJbmRleEJ1ZmZlciIsImluZGV4QnVmZmVyIiwiZHJhd0luc3RhbmNlIiwiX3NoYWRvd0RyYXdDYWxscyIsIm5lZWRzU2hhZG93UmVuZGVyaW5nIiwibmVlZHMiLCJlbmFibGVkIiwiY2FzdFNoYWRvd3MiLCJzaGFkb3dVcGRhdGVNb2RlIiwiU0hBRE9XVVBEQVRFX05PTkUiLCJTSEFET1dVUERBVEVfVEhJU0ZSQU1FIiwiX3NoYWRvd01hcFVwZGF0ZXMiLCJudW1TaGFkb3dGYWNlcyIsImdldExpZ2h0UmVuZGVyRGF0YSIsImdldFJlbmRlckRhdGEiLCJzZXR1cFJlbmRlclBhc3MiLCJyZW5kZXJQYXNzIiwic2hhZG93Q2FtZXJhIiwiY2xlYXJSZW5kZXJUYXJnZXQiLCJydCIsInJlbmRlclRhcmdldCIsImluaXQiLCJkZXB0aFN0ZW5jaWxPcHMiLCJjbGVhckRlcHRoVmFsdWUiLCJjbGVhckRlcHRoIiwiZGVwdGhCdWZmZXIiLCJzdG9yZURlcHRoIiwiY29sb3JPcHMiLCJjbGVhclZhbHVlIiwiY29weSIsInJlcXVpcmVzQ3ViZW1hcHMiLCJwcmVwYXJlRmFjZSIsInJlbmRlclRhcmdldEluZGV4IiwiX3NoYWRvd01hcCIsInJlbmRlclRhcmdldHMiLCJyZW5kZXJGYWNlIiwiaW5zaWRlUmVuZGVyUGFzcyIsInNoYWRvd01hcFN0YXJ0VGltZSIsIm5vdyIsIkRlYnVnR3JhcGhpY3MiLCJwdXNoR3B1TWFya2VyIiwic2V0Q2FtZXJhVW5pZm9ybXMiLCJzdXBwb3J0c1VuaWZvcm1CdWZmZXJzIiwic2V0dXBWaWV3VW5pZm9ybUJ1ZmZlcnMiLCJ2aWV3QmluZEdyb3VwcyIsInNldHVwVmlld3BvcnQiLCJjbGVhclZpZXciLCJwb3BHcHVNYXJrZXIiLCJfc2hhZG93TWFwVGltZSIsInJlbmRlciIsImZhY2VDb3VudCIsInJlbmRlclZzbSIsIl9pc1ZzbSIsIl92c21CbHVyU2l6ZSIsImFwcGx5VnNtQmx1ciIsImdldFZzbUJsdXJTaGFkZXIiLCJpc1ZzbTgiLCJibHVyTW9kZSIsImZpbHRlclNpemUiLCJibHVyU2hhZGVyIiwiYmx1clZTIiwiZnVsbHNjcmVlblF1YWRWUyIsImJsdXJGUyIsImJsdXJTaGFkZXJOYW1lIiwiY3JlYXRlU2hhZGVyRnJvbUNvZGUiLCJOT0JMRU5EIiwib3JpZ1NoYWRvd01hcCIsInRlbXBTaGFkb3dNYXAiLCJzaGFkb3dNYXBDYWNoZSIsInRlbXBSdCIsInZzbUJsdXJNb2RlIiwiX3NoYWRvd1Jlc29sdXRpb24iLCJjb2xvckJ1ZmZlciIsIkJMVVJfR0FVU1NJQU4iLCJkcmF3UXVhZFdpdGhTaGFkZXIiLCJpbml0Vmlld0JpbmRHcm91cEZvcm1hdCIsIlVuaWZvcm1CdWZmZXJGb3JtYXQiLCJVbmlmb3JtRm9ybWF0IiwiVU5JRk9STVRZUEVfTUFUNCIsIkJpbmRHcm91cEZvcm1hdCIsIkJpbmRCdWZmZXJGb3JtYXQiLCJVTklGT1JNX0JVRkZFUl9ERUZBVUxUX1NMT1RfTkFNRSIsIlNIQURFUlNUQUdFX1ZFUlRFWCIsIlNIQURFUlNUQUdFX0ZSQUdNRU5UIiwiZnJhbWVVcGRhdGUiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUE0QkEsU0FBU0EsS0FBS0EsQ0FBQ0MsQ0FBQyxFQUFFQyxLQUFLLEVBQUU7QUFDckIsRUFBQSxPQUFPQyxJQUFJLENBQUNDLEdBQUcsQ0FBQyxFQUFFSCxDQUFDLEdBQUdBLENBQUMsQ0FBQyxJQUFJLEdBQUcsR0FBR0MsS0FBSyxHQUFHQSxLQUFLLENBQUMsQ0FBQyxDQUFBO0FBQ3JELENBQUE7QUFFQSxTQUFTRyxZQUFZQSxDQUFDQyxVQUFVLEVBQUU7RUFDOUIsTUFBTUosS0FBSyxHQUFHLENBQUNJLFVBQVUsR0FBRyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFBO0FBRXhDLEVBQUEsTUFBTUMsU0FBUyxHQUFHLENBQUNELFVBQVUsR0FBRyxDQUFDLElBQUks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
