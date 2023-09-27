import { now } from '../../core/time.js';
import { Debug, DebugHelper } from '../../core/debug.js';
import { Vec3 } from '../../core/math/vec3.js';
import { Color } from '../../core/math/color.js';
import { DebugGraphics } from '../../platform/graphics/debug-graphics.js';
import { RenderPass } from '../../platform/graphics/render-pass.js';
import { LIGHTSHAPE_PUNCTUAL, LIGHTTYPE_OMNI, LIGHTTYPE_SPOT, LIGHTTYPE_DIRECTIONAL, FOG_NONE, FOG_LINEAR, LAYERID_DEPTH } from '../constants.js';
import { Renderer } from './renderer.js';
import { LightCamera } from './light-camera.js';
import { WorldClustersDebug } from '../lighting/world-clusters-debug.js';
import { SceneGrab } from '../graphics/scene-grab.js';
import { BlendState } from '../../platform/graphics/blend-state.js';

const webgl1DepthClearColor = new Color(254.0 / 255, 254.0 / 255, 254.0 / 255, 254.0 / 255);
const _drawCallList = {
  drawCalls: [],
  shaderInstances: [],
  isNewMaterial: [],
  lightMaskChanged: [],
  clear: function () {
    this.drawCalls.length = 0;
    this.shaderInstances.length = 0;
    this.isNewMaterial.length = 0;
    this.lightMaskChanged.length = 0;
  }
};
function vogelDiskPrecalculationSamples(numSamples) {
  const samples = [];
  for (let i = 0; i < numSamples; ++i) {
    const r = Math.sqrt(i + 0.5) / Math.sqrt(numSamples);
    samples.push(r);
  }
  return samples;
}
function vogelSpherePrecalculationSamples(numSamples) {
  const samples = [];
  for (let i = 0; i < numSamples; i++) {
    const weight = i / numSamples;
    const radius = Math.sqrt(1.0 - weight * weight);
    samples.push(radius);
  }
  return samples;
}

/**
 * The forward renderer renders {@link Scene}s.
 *
 * @ignore
 */
class ForwardRenderer extends Renderer {
  /**
   * Create a new ForwardRenderer instance.
   *
   * @param {import('../../platform/graphics/graphics-device.js').GraphicsDevice} graphicsDevice - The
   * graphics device used by the renderer.
   */
  constructor(graphicsDevice) {
    super(graphicsDevice);
    const device = this.device;
    this._forwardDrawCalls = 0;
    this._materialSwitches = 0;
    this._depthMapTime = 0;
    this._forwardTime = 0;
    this._sortTime = 0;

    // Uniforms
    const scope = device.scope;
    this.fogColorId = scope.resolve('fog_color');
    this.fogStartId = scope.resolve('fog_start');
    this.fogEndId = scope.resolve('fog_end');
    this.fogDensityId = scope.resolve('fog_density');
    this.ambientId = scope.resolve('light_globalAmbient');
    this.skyboxIntensityId = scope.resolve('skyboxIntensity');
    this.cubeMapRotationMatrixId = scope.resolve('cubeMapRotationMatrix');
    this.pcssDiskSamplesId = scope.resolve('pcssDiskSamples[0]');
    this.pcssSphereSamplesId = scope.resolve('pcssSphereSamples[0]');
    this.lightColorId = [];
    this.lightDir = [];
    this.lightDirId = [];
    this.lightShadowMapId = [];
    this.lightShadowMatrixId = [];
    this.lightShadowParamsId = [];
    this.lightShadowIntensity = [];
    this.lightRadiusId = [];
    this.lightPos = [];
    this.lightPosId = [];
    this.lightWidth = [];
    this.lightWidthId = [];
    this.lightHeight = [];
    this.lightHeightId = [];
    this.lightInAngleId = [];
    this.lightOutAngleId = [];
    this.lightCookieId = [];
    this.lightCookieIntId = [];
    this.lightCookieMatrixId = [];
    this.lightCookieOffsetId = [];
    this.lightShadowSearchAreaId = [];
    this.lightCameraParamsId = [];

    // shadow cascades
    this.shadowMatrixPaletteId = [];
    this.shadowCascadeDistancesId = [];
    this.shadowCascadeCountId = [];
    this.screenSizeId = scope.resolve('uScreenSize');
    this._screenSize = new Float32Array(4);
    this.fogColor = new Float32Array(3);
    this.ambientColor = new Float32Array(3);
    this.pcssDiskSamples = vogelDiskPrecalculationSamples(16);
    this.pcssSphereSamples = vogelSpherePrecalculationSamples(16);
  }
  destroy() {
    super.destroy();
  }

  // Static properties used by the Profiler in the Editor's Launch Page

  /**
   * @param {import('../scene.js').Scene} scene - The scene.
   */
  dispatchGlobalLights(scene) {
    this.ambientColor[0] = scene.ambientLight.r;
    this.ambientColor[1] = scene.ambientLight.g;
    this.ambientColor[2] = scene.ambientLight.b;
    if (scene.gammaCorrection) {
      for (let i = 0; i < 3; i++) {
        this.ambientColor[i] = Math.pow(this.ambientColor[i], 2.2);
      }
    }
    if (scene.physicalUnits) {
      for (let i = 0; i < 3; i++) {
        this.ambientColor[i] *= scene.ambientLuminance;
      }
    }
    this.ambientId.setValue(this.ambientColor);
    this.skyboxIntensityId.setValue(scene.physicalUnits ? scene.skyboxLuminance : scene.skyboxIntensity);
    this.cubeMapRotationMatrixId.setValue(scene._skyboxRotationMat3.data);
  }
  _resolveLight(scope, i) {
    const light = 'light' + i;
    this.lightColorId[i] = scope.resolve(light + '_color');
    this.lightDir[i] = new Float32Array(3);
    this.lightDirId[i] = scope.resolve(light + '_direction');
    this.lightShadowMapId[i] = scope.resolve(light + '_shadowMap');
    this.lightShadowMatrixId[i] = scope.resolve(light + '_shadowMatrix');
    this.lightShadowParamsId[i] = scope.resolve(light + '_shadowParams');
    this.lightShadowIntensity[i] = scope.resolve(light + '_shadowIntensity');
    this.lightShadowSearchAreaId[i] = scope.resolve(light + '_shadowSearchArea');
    this.lightRadiusId[i] = scope.resolve(light + '_radius');
    this.lightPos[i] = new Float32Array(3);
    this.lightPosId[i] = scope.resolve(light + '_position');
    this.lightWidth[i] = new Float32Array(3);
    this.lightWidthId[i] = scope.resolve(light + '_halfWidth');
    this.lightHeight[i] = new Float32Array(3);
    this.lightHeightId[i] = scope.resolve(light + '_halfHeight');
    this.lightInAngleId[i] = scope.resolve(light + '_innerConeAngle');
    this.lightOutAngleId[i] = scope.resolve(light + '_outerConeAngle');
    this.lightCookieId[i] = scope.resolve(light + '_cookie');
    this.lightCookieIntId[i] = scope.resolve(light + '_cookieIntensity');
    this.lightCookieMatrixId[i] = scope.resolve(light + '_cookieMatrix');
    this.lightCookieOffsetId[i] = scope.resolve(light + '_cookieOffset');
    this.lightCameraParamsId[i] = scope.resolve(light + '_cameraParams');

    // shadow cascades
    this.shadowMatrixPaletteId[i] = scope.resolve(light + '_shadowMatrixPalette[0]');
    this.shadowCascadeDistancesId[i] = scope.resolve(light + '_shadowCascadeDistances[0]');
    this.shadowCascadeCountId[i] = scope.resolve(light + '_shadowCascadeCount');
  }
  setLTCDirectionalLight(wtm, cnt, dir, campos, far) {
    this.lightPos[cnt][0] = campos.x - dir.x * far;
    this.lightPos[cnt][1] = campos.y - dir.y * far;
    this.lightPos[cnt][2] = campos.z - dir.z * far;
    this.lightPosId[cnt].setValue(this.lightPos[cnt]);
    const hWidth = wtm.transformVector(new Vec3(-0.5, 0, 0));
    this.lightWidth[cnt][0] = hWidth.x * far;
    this.lightWidth[cnt][1] = hWidth.y * far;
    this.lightWidth[cnt][2] = hWidth.z * far;
    this.lightWidthId[cnt].setValue(this.lightWidth[cnt]);
    const hHeight = wtm.transformVector(new Vec3(0, 0, 0.5));
    this.lightHeight[cnt][0] = hHeight.x * far;
    this.lightHeight[cnt][1] = hHeight.y * far;
    this.lightHeight[cnt][2] = hHeight.z * far;
    this.lightHeightId[cnt].setValue(this.lightHeight[cnt]);
  }
  dispatchDirectLights(dirs, scene, mask, camera) {
    let cnt = 0;
    const scope = this.device.scope;
    for (let i = 0; i < dirs.length; i++) {
      if (!(dirs[i].mask & mask)) continue;
      const directional = dirs[i];
      const wtm = directional._node.getWorldTransform();
      if (!this.lightColorId[cnt]) {
        this._resolveLight(scope, cnt);
      }
      this.lightColorId[cnt].setValue(scene.gammaCorrection ? directional._linearFinalColor : directional._finalColor);

      // Directional lights shine down the negative Y axis
      wtm.getY(directional._direction).mulScalar(-1);
      directional._direction.normalize();
      this.lightDir[cnt][0] = directional._direction.x;
      this.lightDir[cnt][1] = directional._direction.y;
      this.lightDir[cnt][2] = directional._direction.z;
      this.lightDirId[cnt].setValue(this.lightDir[cnt]);
      if (directional.shape !== LIGHTSHAPE_PUNCTUAL) {
        // non-punctual shape - NB directional area light specular is approximated by putting the area light at the far clip
        this.setLTCDirectionalLight(wtm, cnt, directional._direction, camera._node.getPosition(), camera.farClip);
      }
      if (directional.castShadows) {
        const lightRenderData = directional.getRenderData(camera, 0);
        const biases = directional._getUniformBiasValues(lightRenderData);
        this.lightShadowMapId[cnt].setValue(lightRenderData.shadowBuffer);
        this.lightShadowMatrixId[cnt].setValue(lightRenderData.shadowMatrix.data);
        this.shadowMatrixPaletteId[cnt].setValue(directional._shadowMatrixPalette);
        this.shadowCascadeDistancesId[cnt].setValue(directional._shadowCascadeDistances);
        this.shadowCascadeCountId[cnt].setValue(directional.numCascades);
        this.lightShadowIntensity[cnt].setValue(directional.shadowIntensity);
        const projectionCompensation = 50.0 / lightRenderData.projectionCompensation;
        const pixelsPerMeter = directional.penumbraSize / lightRenderData.shadowCamera.renderTarget.width;
        this.lightShadowSearchAreaId[cnt].setValue(pixelsPerMeter * projectionCompensation);
        const cameraParams = directional._shadowCameraParams;
        cameraParams.length = 4;
        cameraParams[0] = lightRenderData.depthRangeCompensation;
        cameraParams[1] = lightRenderData.shadowCamera._farClip;
        cameraParams[2] = lightRenderData.shadowCamera._nearClip;
        cameraParams[3] = 1;
        this.lightCameraParamsId[cnt].setValue(cameraParams);
        const params = directional._shadowRenderParams;
        params.length = 4;
        params[0] = directional._shadowResolution; // Note: this needs to change for non-square shadow maps (2 cascades). Currently square is used
        params[1] = biases.normalBias;
        params[2] = biases.bias;
        params[3] = 0;
        this.lightShadowParamsId[cnt].setValue(params);
      }
      cnt++;
    }
    return cnt;
  }
  setLTCPositionalLight(wtm, cnt) {
    const hWidth = wtm.transformVector(new Vec3(-0.5, 0, 0));
    this.lightWidth[cnt][0] = hWidth.x;
    this.lightWidth[cnt][1] = hWidth.y;
    this.lightWidth[cnt][2] = hWidth.z;
    this.lightWidthId[cnt].setValue(this.lightWidth[cnt]);
    const hHeight = wtm.transformVector(new Vec3(0, 0, 0.5));
    this.lightHeight[cnt][0] = hHeight.x;
    this.lightHeight[cnt][1] = hHeight.y;
    this.lightHeight[cnt][2] = hHeight.z;
    this.lightHeightId[cnt].setValue(this.lightHeight[cnt]);
  }
  dispatchOmniLight(scene, scope, omni, cnt) {
    const wtm = omni._node.getWorldTransform();
    if (!this.lightColorId[cnt]) {
      this._resolveLight(scope, cnt);
    }
    this.lightRadiusId[cnt].setValue(omni.attenuationEnd);
    this.lightColorId[cnt].setValue(scene.gammaCorrection ? omni._linearFinalColor : omni._finalColor);
    wtm.getTranslation(omni._position);
    this.lightPos[cnt][0] = omni._position.x;
    this.lightPos[cnt][1] = omni._position.y;
    this.lightPos[cnt][2] = omni._position.z;
    this.lightPosId[cnt].setValue(this.lightPos[cnt]);
    if (omni.shape !== LIGHTSHAPE_PUNCTUAL) {
      // non-punctual shape
      this.setLTCPositionalLight(wtm, cnt);
    }
    if (omni.castShadows) {
      // shadow map
      const lightRenderData = omni.getRenderData(null, 0);
      this.lightShadowMapId[cnt].setValue(lightRenderData.shadowBuffer);
      const biases = omni._getUniformBiasValues(lightRenderData);
      const params = omni._shadowRenderParams;
      params.length = 4;
      params[0] = omni._shadowResolution;
      params[1] = biases.normalBias;
      params[2] = biases.bias;
      params[3] = 1.0 / omni.attenuationEnd;
      this.lightShadowParamsId[cnt].setValue(params);
      this.lightShadowIntensity[cnt].setValue(omni.shadowIntensity);
      const pixelsPerMeter = omni.penumbraSize / lightRenderData.shadowCamera.renderTarget.width;
      this.lightShadowSearchAreaId[cnt].setValue(pixelsPerMeter);
      const cameraParams = omni._shadowCameraParams;
      cameraParams.length = 4;
      cameraParams[0] = lightRenderData.depthRangeCompensation;
      cameraParams[1] = lightRenderData.shadowCamera._farClip;
      cameraParams[2] = lightRenderData.shadowCamera._nearClip;
      cameraParams[3] = 0;
      this.lightCameraParamsId[cnt].setValue(cameraParams);
    }
    if (omni._cookie) {
      this.lightCookieId[cnt].setValue(omni._cookie);
      this.lightShadowMatrixId[cnt].setValue(wtm.data);
      this.lightCookieIntId[cnt].setValue(omni.cookieIntensity);
    }
  }
  dispatchSpotLight(scene, scope, spot, cnt) {
    const wtm = spot._node.getWorldTransform();
    if (!this.lightColorId[cnt]) {
      this._resolveLight(scope, cnt);
    }
    this.lightInAngleId[cnt].setValue(spot._innerConeAngleCos);
    this.lightOutAngleId[cnt].setValue(spot._outerConeAngleCos);
    this.lightRadiusId[cnt].setValue(spot.attenuationEnd);
    this.lightColorId[cnt].setValue(scene.gammaCorrection ? spot._linearFinalColor : spot._finalColor);
    wtm.getTranslation(spot._position);
    this.lightPos[cnt][0] = spot._position.x;
    this.lightPos[cnt][1] = spot._position.y;
    this.lightPos[cnt][2] = spot._position.z;
    this.lightPosId[cnt].setValue(this.lightPos[cnt]);
    if (spot.shape !== LIGHTSHAPE_PUNCTUAL) {
      // non-punctual shape
      this.setLTCPositionalLight(wtm, cnt);
    }

    // Spots shine down the negative Y axis
    wtm.getY(spot._direction).mulScalar(-1);
    spot._direction.normalize();
    this.lightDir[cnt][0] = spot._direction.x;
    this.lightDir[cnt][1] = spot._direction.y;
    this.lightDir[cnt][2] = spot._direction.z;
    this.lightDirId[cnt].setValue(this.lightDir[cnt]);
    if (spot.castShadows) {
      // shadow map
      const lightRenderData = spot.getRenderData(null, 0);
      this.lightShadowMapId[cnt].setValue(lightRenderData.shadowBuffer);
      this.lightShadowMatrixId[cnt].setValue(lightRenderData.shadowMatrix.data);
      const biases = spot._getUniformBiasValues(lightRenderData);
      const params = spot._shadowRenderParams;
      params.length = 4;
      params[0] = spot._shadowResolution;
      params[1] = biases.normalBias;
      params[2] = biases.bias;
      params[3] = 1.0 / spot.attenuationEnd;
      this.lightShadowParamsId[cnt].setValue(params);
      this.lightShadowIntensity[cnt].setValue(spot.shadowIntensity);
      const pixelsPerMeter = spot.penumbraSize / lightRenderData.shadowCamera.renderTarget.width;
      const fov = lightRenderData.shadowCamera._fov * Math.PI / 180.0;
      const fovRatio = 1.0 / Math.tan(fov / 2.0);
      this.lightShadowSearchAreaId[cnt].setValue(pixelsPerMeter * fovRatio);
      const cameraParams = spot._shadowCameraParams;
      cameraParams.length = 4;
      cameraParams[0] = lightRenderData.depthRangeCompensation;
      cameraParams[1] = lightRenderData.shadowCamera._farClip;
      cameraParams[2] = lightRenderData.shadowCamera._nearClip;
      cameraParams[3] = 0;
      this.lightCameraParamsId[cnt].setValue(cameraParams);
    }
    if (spot._cookie) {
      // if shadow is not rendered, we need to evaluate light projection matrix
      if (!spot.castShadows) {
        const cookieMatrix = LightCamera.evalSpotCookieMatrix(spot);
        this.lightShadowMatrixId[cnt].setValue(cookieMatrix.data);
      }
      this.lightCookieId[cnt].setValue(spot._cookie);
      this.lightCookieIntId[cnt].setValue(spot.cookieIntensity);
      if (spot._cookieTransform) {
        spot._cookieTransformUniform[0] = spot._cookieTransform.x;
        spot._cookieTransformUniform[1] = spot._cookieTransform.y;
        spot._cookieTransformUniform[2] = spot._cookieTransform.z;
        spot._cookieTransformUniform[3] = spot._cookieTransform.w;
        this.lightCookieMatrixId[cnt].setValue(spot._cookieTransformUniform);
        spot._cookieOffsetUniform[0] = spot._cookieOffset.x;
        spot._cookieOffsetUniform[1] = spot._cookieOffset.y;
        this.lightCookieOffsetId[cnt].setValue(spot._cookieOffsetUniform);
      }
    }
  }
  dispatchLocalLights(sortedLights, scene, mask, usedDirLights) {
    let cnt = usedDirLights;
    const scope = this.device.scope;
    const omnis = sortedLights[LIGHTTYPE_OMNI];
    const numOmnis = omnis.length;
    for (let i = 0; i < numOmnis; i++) {
      const omni = omnis[i];
      if (!(omni.mask & mask)) continue;
      this.dispatchOmniLight(scene, scope, omni, cnt);
      cnt++;
    }
    const spts = sortedLights[LIGHTTYPE_SPOT];
    const numSpts = spts.length;
    for (let i = 0; i < numSpts; i++) {
      const spot = spts[i];
      if (!(spot.mask & mask)) continue;
      this.dispatchSpotLight(scene, scope, spot, cnt);
      cnt++;
    }
  }

  // execute first pass over draw calls, in order to update materials / shaders
  renderForwardPrepareMaterials(camera, drawCalls, sortedLights, layer, pass) {
    var _layer$getLightHash;
    const addCall = (drawCall, shaderInstance, isNewMaterial, lightMaskChanged) => {
      _drawCallList.drawCalls.push(drawCall);
      _drawCallList.shaderInstances.push(shaderInstance);
      _drawCallList.isNewMaterial.push(isNewMaterial);
      _drawCallList.lightMaskChanged.push(lightMaskChanged);
    };

    // start with empty arrays
    _drawCallList.clear();
    const device = this.device;
    const scene = this.scene;
    const clusteredLightingEnabled = scene.clusteredLightingEnabled;
    const lightHash = (_layer$getLightHash = layer == null ? void 0 : layer.getLightHash(clusteredLightingEnabled)) != null ? _layer$getLightHash : 0;
    let prevMaterial = null,
      prevObjDefs,
      prevLightMask;
    const drawCallsCount = drawCalls.length;
    for (let i = 0; i < drawCallsCount; i++) {
      /** @type {import('../mesh-instance.js').MeshInstance} */
      const drawCall = drawCalls[i];
      if (camera === ForwardRenderer.skipRenderCamera) {
        if (ForwardRenderer._skipRenderCounter >= ForwardRenderer.skipRenderAfter) continue;
        ForwardRenderer._skipRenderCounter++;
      }
      if (layer) {
        if (layer._skipRenderCounter >= layer.skipRenderAfter) continue;
        layer._skipRenderCounter++;
      }
      drawCall.ensureMaterial(device);
      const material = drawCall.material;
      const objDefs = drawCall._shaderDefs;
      const lightMask = drawCall.mask;
      if (material && material === prevMaterial && objDefs !== prevObjDefs) {
        prevMaterial = null; // force change shader if the object uses a different variant of the same material
      }

      if (material !== prevMaterial) {
        this._materialSwitches++;
        material._scene = scene;
        if (material.dirty) {
          material.updateUniforms(device, scene);
          material.dirty = false;
        }
      }

      // marker to allow us to see the source node for shader alloc
      DebugGraphics.pushGpuMarker(device, `Node: ${drawCall.node.name}`);
      const shaderInstance = drawCall.getShaderInstance(pass, lightHash, scene, this.viewUniformFormat, this.viewBindGroupFormat, sortedLights);
      DebugGraphics.popGpuMarker(device);
      addCall(drawCall, shaderInstance, material !== prevMaterial, !prevMaterial || lightMask !== prevLightMask);
      prevMaterial = material;
      prevObjDefs = objDefs;
      prevLightMask = lightMask;
    }

    // process the batch of shaders created here
    device.endShaderBatch == null ? void 0 : device.endShaderBatch();
    return _drawCallList;
  }
  renderForwardInternal(camera, preparedCalls, sortedLights, pass, drawCallback, flipFaces) {
    const device = this.device;
    const scene = this.scene;
    const passFlag = 1 << pass;
    const flipFactor = flipFaces ? -1 : 1;
    const clusteredLightingEnabled = this.scene.clusteredLightingEnabled;

    // Render the scene
    let skipMaterial = false;
    const preparedCallsCount = preparedCalls.drawCalls.length;
    for (let i = 0; i < preparedCallsCount; i++) {
      var _drawCall$stencilFron, _drawCall$stencilBack;
      const drawCall = preparedCalls.drawCalls[i];

      // We have a mesh instance
      const newMaterial = preparedCalls.isNewMaterial[i];
      const lightMaskChanged = preparedCalls.lightMaskChanged[i];
      const shaderInstance = preparedCalls.shaderInstances[i];
      const material = drawCall.material;
      const objDefs = drawCall._shaderDefs;
      const lightMask = drawCall.mask;
      if (newMaterial) {
        const shader = shaderInstance.shader;
        if (!shader.failed && !device.setShader(shader)) {
          Debug.error(`Error compiling shader [${shader.label}] for material=${material.name} pass=${pass} objDefs=${objDefs}`, material);
        }

        // skip rendering with the material if shader failed
        skipMaterial = shader.failed;
        if (skipMaterial) break;
        DebugGraphics.pushGpuMarker(device, `Material: ${material.name}`);

        // Uniforms I: material
        material.setParameters(device);
        if (lightMaskChanged) {
          const usedDirLights = this.dispatchDirectLights(sortedLights[LIGHTTYPE_DIRECTIONAL], scene, lightMask, camera);
          if (!clusteredLightingEnabled) {
            this.dispatchLocalLights(sortedLights, scene, lightMask, usedDirLights);
          }
        }
        this.alphaTestId.setValue(material.alphaTest);
        device.setBlendState(material.blendState);
        device.setDepthState(material.depthState);
        device.setAlphaToCoverage(material.alphaToCoverage);
        if (material.depthBias || material.slopeDepthBias) {
          device.setDepthBias(true);
          device.setDepthBiasValues(material.depthBias, material.slopeDepthBias);
        } else {
          device.setDepthBias(false);
        }
        DebugGraphics.popGpuMarker(device);
      }
      DebugGraphics.pushGpuMarker(device, `Node: ${drawCall.node.name}`);
      this.setupCullMode(camera._cullFaces, flipFactor, drawCall);
      const stencilFront = (_drawCall$stencilFron = drawCall.stencilFront) != null ? _drawCall$stencilFron : material.stencilFront;
      const stencilBack = (_drawCall$stencilBack = drawCall.stencilBack) != null ? _drawCall$stencilBack : material.stencilBack;
      device.setStencilState(stencilFront, stencilBack);
      const mesh = drawCall.mesh;

      // Uniforms II: meshInstance overrides
      drawCall.setParameters(device, passFlag);
      this.setVertexBuffers(device, mesh);
      this.setMorphing(device, drawCall.morphInstance);
      this.setSkinning(device, drawCall);
      this.setupMeshUniformBuffers(shaderInstance, drawCall);
      const style = drawCall.renderStyle;
      device.setIndexBuffer(mesh.indexBuffer[style]);
      drawCallback == null ? void 0 : drawCallback(drawCall, i);
      if (camera.xr && camera.xr.session && camera.xr.views.length) {
        const views = camera.xr.views;
        for (let v = 0; v < views.length; v++) {
          const view = views[v];
          device.setViewport(view.viewport.x, view.viewport.y, view.viewport.z, view.viewport.w);
          this.projId.setValue(view.projMat.data);
          this.projSkyboxId.setValue(view.projMat.data);
          this.viewId.setValue(view.viewOffMat.data);
          this.viewInvId.setValue(view.viewInvOffMat.data);
          this.viewId3.setValue(view.viewMat3.data);
          this.viewProjId.setValue(view.projViewOffMat.data);
          this.viewPosId.setValue(view.position);
          if (v === 0) {
            this.drawInstance(device, drawCall, mesh, style, true);
          } else {
            this.drawInstance2(device, drawCall, mesh, style);
          }
          this._forwardDrawCalls++;
        }
      } else {
        this.drawInstance(device, drawCall, mesh, style, true);
        this._forwardDrawCalls++;
      }

      // Unset meshInstance overrides back to material values if next draw call will use the same material
      if (i < preparedCallsCount - 1 && !preparedCalls.isNewMaterial[i + 1]) {
        material.setParameters(device, drawCall.parameters);
      }
      DebugGraphics.popGpuMarker(device);
    }
  }
  renderForward(camera, allDrawCalls, sortedLights, pass, drawCallback, layer, flipFaces) {
    const forwardStartTime = now();

    // run first pass over draw calls and handle material / shader updates
    const preparedCalls = this.renderForwardPrepareMaterials(camera, allDrawCalls, sortedLights, layer, pass);

    // render mesh instances
    this.renderForwardInternal(camera, preparedCalls, sortedLights, pass, drawCallback, flipFaces);
    _drawCallList.clear();
    this._forwardTime += now() - forwardStartTime;
  }
  setSceneConstants() {
    const scene = this.scene;

    // Set up ambient/exposure
    this.dispatchGlobalLights(scene);

    // Set up the fog
    if (scene.fog !== FOG_NONE) {
      this.fogColor[0] = scene.fogColor.r;
      this.fogColor[1] = scene.fogColor.g;
      this.fogColor[2] = scene.fogColor.b;
      if (scene.gammaCorrection) {
        for (let i = 0; i < 3; i++) {
          this.fogColor[i] = Math.pow(this.fogColor[i], 2.2);
        }
      }
      this.fogColorId.setValue(this.fogColor);
      if (scene.fog === FOG_LINEAR) {
        this.fogStartId.setValue(scene.fogStart);
        this.fogEndId.setValue(scene.fogEnd);
      } else {
        this.fogDensityId.setValue(scene.fogDensity);
      }
    }

    // Set up screen size // should be RT size?
    const device = this.device;
    this._screenSize[0] = device.width;
    this._screenSize[1] = device.height;
    this._screenSize[2] = 1 / device.width;
    this._screenSize[3] = 1 / device.height;
    this.screenSizeId.setValue(this._screenSize);
    this.pcssDiskSamplesId.setValue(this.pcssDiskSamples);
    this.pcssSphereSamplesId.setValue(this.pcssSphereSamples);
  }

  /**
   * Builds a frame graph for the rendering of the whole frame.
   *
   * @param {import('../frame-graph.js').FrameGraph} frameGraph - The frame-graph that is built.
   * @param {import('../composition/layer-composition.js').LayerComposition} layerComposition - The
   * layer composition used to build the frame graph.
   * @ignore
   */
  buildFrameGraph(frameGraph, layerComposition) {
    const clusteredLightingEnabled = this.scene.clusteredLightingEnabled;
    frameGraph.reset();
    this.update(layerComposition);

    // clustered lighting render passes
    if (clusteredLightingEnabled) {
      // cookies
      {
        const renderPass = new RenderPass(this.device, () => {
          // render cookies for all local visible lights
          if (this.scene.lighting.cookiesEnabled) {
            this.renderCookies(this.lights);
          }
        });
        renderPass.requiresCubemaps = false;
        DebugHelper.setName(renderPass, 'ClusteredCookies');
        frameGraph.addRenderPass(renderPass);
      }

      // local shadows - these are shared by all cameras (not entirely correctly)
      {
        const renderPass = new RenderPass(this.device);
        DebugHelper.setName(renderPass, 'ClusteredLocalShadows');
        renderPass.requiresCubemaps = false;
        frameGraph.addRenderPass(renderPass);

        // render shadows only when needed
        if (this.scene.lighting.shadowsEnabled) {
          this._shadowRendererLocal.prepareClusteredRenderPass(renderPass, this.localLights);
        }

        // update clusters all the time
        renderPass._after = () => {
          this.updateClusters(layerComposition);
        };
      }
    } else {
      // non-clustered local shadows - these are shared by all cameras (not entirely correctly)
      this._shadowRendererLocal.buildNonClusteredRenderPasses(frameGraph, this.localLights);
    }

    // main passes
    let startIndex = 0;
    let newStart = true;
    let renderTarget = null;
    const renderActions = layerComposition._renderActions;
    for (let i = startIndex; i < renderActions.length; i++) {
      const renderAction = renderActions[i];
      const layer = layerComposition.layerList[renderAction.layerIndex];
      const camera = layer.cameras[renderAction.cameraIndex];

      // skip disabled layers
      if (!renderAction.isLayerEnabled(layerComposition)) {
        continue;
      }
      const isDepthLayer = layer.id === LAYERID_DEPTH;
      const isGrabPass = isDepthLayer && (camera.renderSceneColorMap || camera.renderSceneDepthMap);

      // directional shadows get re-rendered for each camera
      if (renderAction.hasDirectionalShadowLights && camera) {
        this._shadowRendererDirectional.buildFrameGraph(frameGraph, renderAction.directionalLights, camera);
      }

      // start of block of render actions rendering to the same render target
      if (newStart) {
        newStart = false;
        startIndex = i;
        renderTarget = renderAction.renderTarget;
      }

      // find the next enabled render action
      let nextIndex = i + 1;
      while (renderActions[nextIndex] && !renderActions[nextIndex].isLayerEnabled(layerComposition)) {
        nextIndex++;
      }

      // info about the next render action
      const nextRenderAction = renderActions[nextIndex];
      const isNextLayerDepth = nextRenderAction ? layerComposition.layerList[nextRenderAction.layerIndex].id === LAYERID_DEPTH : false;
      const isNextLayerGrabPass = isNextLayerDepth && (camera.renderSceneColorMap || camera.renderSceneDepthMap);

      // end of the block using the same render target
      if (!nextRenderAction || nextRenderAction.renderTarget !== renderTarget || nextRenderAction.hasDirectionalShadowLights || isNextLayerGrabPass || isGrabPass) {
        // render the render actions in the range
        this.addMainRenderPass(frameGraph, layerComposition, renderTarget, startIndex, i, isGrabPass);

        // postprocessing
        if (renderAction.triggerPostprocess && camera != null && camera.onPostprocessing) {
          const renderPass = new RenderPass(this.device, () => {
            this.renderPassPostprocessing(renderAction, layerComposition);
          });
          renderPass.requiresCubemaps = false;
          DebugHelper.setName(renderPass, `Postprocess`);
          frameGraph.addRenderPass(renderPass);
        }
        newStart = true;
      }
    }
  }

  /**
   * @param {import('../frame-graph.js').FrameGraph} frameGraph - The frame graph.
   * @param {import('../composition/layer-composition.js').LayerComposition} layerComposition - The
   * layer composition.
   */
  addMainRenderPass(frameGraph, layerComposition, renderTarget, startIndex, endIndex, isGrabPass) {
    // render the render actions in the range
    const range = {
      start: startIndex,
      end: endIndex
    };
    const renderPass = new RenderPass(this.device, () => {
      this.renderPassRenderActions(layerComposition, range);
    });
    const renderActions = layerComposition._renderActions;
    const startRenderAction = renderActions[startIndex];
    const endRenderAction = renderActions[endIndex];
    const startLayer = layerComposition.layerList[startRenderAction.layerIndex];
    const camera = startLayer.cameras[startRenderAction.cameraIndex];
    if (camera) {
      // callback on the camera component before rendering with this camera for the first time
      if (startRenderAction.firstCameraUse && camera.onPreRender) {
        renderPass._before = () => {
          camera.onPreRender();
        };
      }

      // callback on the camera component when we're done rendering with this camera
      if (endRenderAction.lastCameraUse && camera.onPostRender) {
        renderPass._after = () => {
          camera.onPostRender();
        };
      }
    }

    // depth grab pass on webgl1 is normal render pass (scene gets re-rendered)
    const grabPassRequired = isGrabPass && SceneGrab.requiresRenderPass(this.device, camera);
    const isRealPass = !isGrabPass || grabPassRequired;
    if (isRealPass) {
      renderPass.init(renderTarget);
      renderPass.fullSizeClearRect = camera.camera.fullSizeClearRect;
      if (grabPassRequired) {
        // webgl1 depth rendering clear values
        renderPass.setClearColor(webgl1DepthClearColor);
        renderPass.setClearDepth(1.0);
      } else if (renderPass.fullSizeClearRect) {
        // if camera rendering covers the full viewport

        if (startRenderAction.clearColor) {
          renderPass.setClearColor(camera.camera.clearColor);
        }
        if (startRenderAction.clearDepth) {
          renderPass.setClearDepth(camera.camera.clearDepth);
        }
        if (startRenderAction.clearStencil) {
          renderPass.setClearStencil(camera.camera.clearStencil);
        }
      }
    }
    DebugHelper.setName(renderPass, `${isGrabPass ? 'SceneGrab' : 'RenderAction'} ${startIndex}-${endIndex} ` + `Cam: ${camera ? camera.entity.name : '-'}`);
    frameGraph.addRenderPass(renderPass);
  }

  /**
   * @param {import('../composition/layer-composition.js').LayerComposition} comp - The layer
   * composition.
   */
  update(comp) {
    this.frameUpdate();
    this.shadowRenderer.frameUpdate();
    const clusteredLightingEnabled = this.scene.clusteredLightingEnabled;

    // update the skybox, since this might change _meshInstances
    this.scene._updateSky(this.device);

    // update layer composition
    this.updateLayerComposition(comp, clusteredLightingEnabled);
    this.collectLights(comp);

    // Single per-frame calculations
    this.beginFrame(comp);
    this.setSceneConstants();

    // visibility culling of lights, meshInstances, shadows casters
    // after this the scene culling is done and script callbacks can be called to report which objects are visible
    this.cullComposition(comp);

    // GPU update for all visible objects
    this.gpuUpdate(this.processingMeshInstances);
  }
  renderPassPostprocessing(renderAction, layerComposition) {
    const layer = layerComposition.layerList[renderAction.layerIndex];
    const camera = layer.cameras[renderAction.cameraIndex];
    Debug.assert(renderAction.triggerPostprocess && camera.onPostprocessing);

    // trigger postprocessing for camera
    camera.onPostprocessing();
  }

  /**
   * Render pass representing the layer composition's render actions in the specified range.
   *
   * @param {import('../composition/layer-composition.js').LayerComposition} comp - The layer
   * composition to render.
   * @ignore
   */
  renderPassRenderActions(comp, range) {
    const renderActions = comp._renderActions;
    for (let i = range.start; i <= range.end; i++) {
      this.renderRenderAction(comp, renderActions[i], i === range.start);
    }
  }

  /**
   * @param {import('../composition/layer-composition.js').LayerComposition} comp - The layer
   * composition.
   * @param {import('../composition/render-action.js').RenderAction} renderAction - The render
   * action.
   * @param {boolean} firstRenderAction - True if this is the first render action in the render pass.
   */
  renderRenderAction(comp, renderAction, firstRenderAction) {
    const clusteredLightingEnabled = this.scene.clusteredLightingEnabled;
    const device = this.device;

    // layer
    const layerIndex = renderAction.layerIndex;
    const layer = comp.layerList[layerIndex];
    const transparent = comp.subLayerList[layerIndex];
    const cameraPass = renderAction.cameraIndex;
    const camera = layer.cameras[cameraPass];
    if (!renderAction.isLayerEnabled(comp)) {
      return;
    }
    DebugGraphics.pushGpuMarker(this.device, camera ? camera.entity.name : 'noname');
    DebugGraphics.pushGpuMarker(this.device, layer.name);
    const drawTime = now();

    // Call prerender callback if there's one
    if (!transparent && layer.onPreRenderOpaque) {
      layer.onPreRenderOpaque(cameraPass);
    } else if (transparent && layer.onPreRenderTransparent) {
      layer.onPreRenderTransparent(cameraPass);
    }

    // Called for the first sublayer and for every camera
    if (!(layer._preRenderCalledForCameras & 1 << cameraPass)) {
      if (layer.onPreRender) {
        layer.onPreRender(cameraPass);
      }
      layer._preRenderCalledForCameras |= 1 << cameraPass;
    }
    if (camera) {
      var _renderAction$renderT, _camera$camera$shader, _camera$camera$shader2;
      this.setupViewport(camera.camera, renderAction.renderTarget);

      // if this is not a first render action to the render target, or if the render target was not
      // fully cleared on pass start, we need to execute clears here
      if (!firstRenderAction || !camera.camera.fullSizeClearRect) {
        this.clear(camera.camera, renderAction.clearColor, renderAction.clearDepth, renderAction.clearStencil);
      }
      const sortTime = now();
      layer.sortVisible(camera.camera, transparent);
      this._sortTime += now() - sortTime;
      const culledInstances = layer.getCulledInstances(camera.camera);
      const visible = transparent ? culledInstances.transparent : culledInstances.opaque;

      // add debug mesh instances to visible list
      this.scene.immediate.onPreRenderLayer(layer, visible, transparent);

      // set up layer uniforms
      if (layer.requiresLightCube) {
        this.lightCube.update(this.scene.ambientLight, layer._lights);
        this.constantLightCube.setValue(this.lightCube.colors);
      }

      // upload clustered lights uniforms
      if (clusteredLightingEnabled && renderAction.lightClusters) {
        renderAction.lightClusters.activate();

        // debug rendering of clusters
        if (!this.clustersDebugRendered && this.scene.lighting.debugLayer === layer.id) {
          this.clustersDebugRendered = true;
          WorldClustersDebug.render(renderAction.lightClusters, this.scene);
        }
      }

      // Set the not very clever global variable which is only useful when there's just one camera
      this.scene._activeCamera = camera.camera;
      const viewCount = this.setCameraUniforms(camera.camera, renderAction.renderTarget);
      if (device.supportsUniformBuffers) {
        this.setupViewUniformBuffers(renderAction.viewBindGroups, this.viewUniformFormat, this.viewBindGroupFormat, viewCount);
      }

      // enable flip faces if either the camera has _flipFaces enabled or the render target
      // has flipY enabled
      const flipFaces = !!(camera.camera._flipFaces ^ (renderAction == null || (_renderAction$renderT = renderAction.renderTarget) == null ? void 0 : _renderAction$renderT.flipY));

      // shader pass - use setting from camera if available, otherwise use layer setting
      const shaderPass = (_camera$camera$shader = (_camera$camera$shader2 = camera.camera.shaderPassInfo) == null ? void 0 : _camera$camera$shader2.index) != null ? _camera$camera$shader : layer.shaderPass;
      const draws = this._forwardDrawCalls;
      this.renderForward(camera.camera, visible, layer.splitLights, shaderPass, layer.onDrawCall, layer, flipFaces);
      layer._forwardDrawCalls += this._forwardDrawCalls - draws;

      // Revert temp frame stuff
      // TODO: this should not be here, as each rendering / clearing should explicitly set up what
      // it requires (the properties are part of render pipeline on WebGPU anyways)
      device.setBlendState(BlendState.NOBLEND);
      device.setStencilState(null, null);
      device.setAlphaToCoverage(false); // don't leak a2c state
      device.setDepthBias(false);
    }

    // Call layer's postrender callback if there's one
    if (!transparent && layer.onPostRenderOpaque) {
      layer.onPostRenderOpaque(cameraPass);
    } else if (transparent && layer.onPostRenderTransparent) {
      layer.onPostRenderTransparent(cameraPass);
    }
    if (layer.onPostRender && !(layer._postRenderCalledForCameras & 1 << cameraPass)) {
      layer._postRenderCounter &= ~(transparent ? 2 : 1);
      if (layer._postRenderCounter === 0) {
        layer.onPostRender(cameraPass);
        layer._postRenderCalledForCameras |= 1 << cameraPass;
        layer._postRenderCounter = layer._postRenderCounterMax;
      }
    }
    DebugGraphics.popGpuMarker(this.device);
    DebugGraphics.popGpuMarker(this.device);
    layer._renderTime += now() - drawTime;
  }
}
ForwardRenderer.skipRenderCamera = null;
ForwardRenderer._skipRenderCounter = 0;
ForwardRenderer.skipRenderAfter = 0;

export { ForwardRenderer };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZm9yd2FyZC1yZW5kZXJlci5qcyIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL3NjZW5lL3JlbmRlcmVyL2ZvcndhcmQtcmVuZGVyZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgbm93IH0gZnJvbSAnLi4vLi4vY29yZS90aW1lLmpzJztcbmltcG9ydCB7IERlYnVnLCBEZWJ1Z0hlbHBlciB9IGZyb20gJy4uLy4uL2NvcmUvZGVidWcuanMnO1xuXG5pbXBvcnQgeyBWZWMzIH0gZnJvbSAnLi4vLi4vY29yZS9tYXRoL3ZlYzMuanMnO1xuaW1wb3J0IHsgQ29sb3IgfSBmcm9tICcuLi8uLi9jb3JlL21hdGgvY29sb3IuanMnO1xuXG5pbXBvcnQgeyBEZWJ1Z0dyYXBoaWNzIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vZ3JhcGhpY3MvZGVidWctZ3JhcGhpY3MuanMnO1xuaW1wb3J0IHsgUmVuZGVyUGFzcyB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2dyYXBoaWNzL3JlbmRlci1wYXNzLmpzJztcblxuaW1wb3J0IHtcbiAgICBGT0dfTk9ORSwgRk9HX0xJTkVBUixcbiAgICBMSUdIVFRZUEVfT01OSSwgTElHSFRUWVBFX1NQT1QsIExJR0hUVFlQRV9ESVJFQ1RJT05BTCxcbiAgICBMSUdIVFNIQVBFX1BVTkNUVUFMLFxuICAgIExBWUVSSURfREVQVEhcbn0gZnJvbSAnLi4vY29uc3RhbnRzLmpzJztcblxuaW1wb3J0IHsgUmVuZGVyZXIgfSBmcm9tICcuL3JlbmRlcmVyLmpzJztcbmltcG9ydCB7IExpZ2h0Q2FtZXJhIH0gZnJvbSAnLi9saWdodC1jYW1lcmEuanMnO1xuaW1wb3J0IHsgV29ybGRDbHVzdGVyc0RlYnVnIH0gZnJvbSAnLi4vbGlnaHRpbmcvd29ybGQtY2x1c3RlcnMtZGVidWcuanMnO1xuaW1wb3J0IHsgU2NlbmVHcmFiIH0gZnJvbSAnLi4vZ3JhcGhpY3Mvc2NlbmUtZ3JhYi5qcyc7XG5pbXBvcnQgeyBCbGVuZFN0YXRlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vZ3JhcGhpY3MvYmxlbmQtc3RhdGUuanMnO1xuXG5jb25zdCB3ZWJnbDFEZXB0aENsZWFyQ29sb3IgPSBuZXcgQ29sb3IoMjU0LjAgLyAyNTUsIDI1NC4wIC8gMjU1LCAyNTQuMCAvIDI1NSwgMjU0LjAgLyAyNTUpO1xuXG5jb25zdCBfZHJhd0NhbGxMaXN0ID0ge1xuICAgIGRyYXdDYWxsczogW10sXG4gICAgc2hhZGVySW5zdGFuY2VzOiBbXSxcbiAgICBpc05ld01hdGVyaWFsOiBbXSxcbiAgICBsaWdodE1hc2tDaGFuZ2VkOiBbXSxcblxuICAgIGNsZWFyOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMuZHJhd0NhbGxzLmxlbmd0aCA9IDA7XG4gICAgICAgIHRoaXMuc2hhZGVySW5zdGFuY2VzLmxlbmd0aCA9IDA7XG4gICAgICAgIHRoaXMuaXNOZXdNYXRlcmlhbC5sZW5ndGggPSAwO1xuICAgICAgICB0aGlzLmxpZ2h0TWFza0NoYW5nZWQubGVuZ3RoID0gMDtcbiAgICB9XG59O1xuXG5mdW5jdGlvbiB2b2dlbERpc2tQcmVjYWxjdWxhdGlvblNhbXBsZXMobnVtU2FtcGxlcykge1xuICAgIGNvbnN0IHNhbXBsZXMgPSBbXTtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IG51bVNhbXBsZXM7ICsraSkge1xuICAgICAgICBjb25zdCByID0gTWF0aC5zcXJ0KGkgKyAwLjUpIC8gTWF0aC5zcXJ0KG51bVNhbXBsZXMpO1xuICAgICAgICBzYW1wbGVzLnB1c2gocik7XG4gICAgfVxuICAgIHJldHVybiBzYW1wbGVzO1xufVxuXG5mdW5jdGlvbiB2b2dlbFNwaGVyZVByZWNhbGN1bGF0aW9uU2FtcGxlcyhudW1TYW1wbGVzKSB7XG4gICAgY29uc3Qgc2FtcGxlcyA9IFtdO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbnVtU2FtcGxlczsgaSsrKSB7XG4gICAgICAgIGNvbnN0IHdlaWdodCA9IGkgLyBudW1TYW1wbGVzO1xuICAgICAgICBjb25zdCByYWRpdXMgPSBNYXRoLnNxcnQoMS4wIC0gd2VpZ2h0ICogd2VpZ2h0KTtcbiAgICAgICAgc2FtcGxlcy5wdXNoKHJhZGl1cyk7XG4gICAgfVxuICAgIHJldHVybiBzYW1wbGVzO1xufVxuXG4vKipcbiAqIFRoZSBmb3J3YXJkIHJlbmRlcmVyIHJlbmRlcnMge0BsaW5rIFNjZW5lfXMuXG4gKlxuICogQGlnbm9yZVxuICovXG5jbGFzcyBGb3J3YXJkUmVuZGVyZXIgZXh0ZW5kcyBSZW5kZXJlciB7XG4gICAgLyoqXG4gICAgICogQ3JlYXRlIGEgbmV3IEZvcndhcmRSZW5kZXJlciBpbnN0YW5jZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuLi8uLi9wbGF0Zm9ybS9ncmFwaGljcy9ncmFwaGljcy1kZXZpY2UuanMnKS5HcmFwaGljc0RldmljZX0gZ3JhcGhpY3NEZXZpY2UgLSBUaGVcbiAgICAgKiBncmFwaGljcyBkZXZpY2UgdXNlZCBieSB0aGUgcmVuZGVyZXIuXG4gICAgICovXG4gICAgY29uc3RydWN0b3IoZ3JhcGhpY3NEZXZpY2UpIHtcbiAgICAgICAgc3VwZXIoZ3JhcGhpY3NEZXZpY2UpO1xuXG4gICAgICAgIGNvbnN0IGRldmljZSA9IHRoaXMuZGV2aWNlO1xuXG4gICAgICAgIHRoaXMuX2ZvcndhcmREcmF3Q2FsbHMgPSAwO1xuICAgICAgICB0aGlzLl9tYXRlcmlhbFN3aXRjaGVzID0gMDtcbiAgICAgICAgdGhpcy5fZGVwdGhNYXBUaW1lID0gMDtcbiAgICAgICAgdGhpcy5fZm9yd2FyZFRpbWUgPSAwO1xuICAgICAgICB0aGlzLl9zb3J0VGltZSA9IDA7XG5cbiAgICAgICAgLy8gVW5pZm9ybXNcbiAgICAgICAgY29uc3Qgc2NvcGUgPSBkZXZpY2Uuc2NvcGU7XG5cbiAgICAgICAgdGhpcy5mb2dDb2xvcklkID0gc2NvcGUucmVzb2x2ZSgnZm9nX2NvbG9yJyk7XG4gICAgICAgIHRoaXMuZm9nU3RhcnRJZCA9IHNjb3BlLnJlc29sdmUoJ2ZvZ19zdGFydCcpO1xuICAgICAgICB0aGlzLmZvZ0VuZElkID0gc2NvcGUucmVzb2x2ZSgnZm9nX2VuZCcpO1xuICAgICAgICB0aGlzLmZvZ0RlbnNpdHlJZCA9IHNjb3BlLnJlc29sdmUoJ2ZvZ19kZW5zaXR5Jyk7XG5cbiAgICAgICAgdGhpcy5hbWJpZW50SWQgPSBzY29wZS5yZXNvbHZlKCdsaWdodF9nbG9iYWxBbWJpZW50Jyk7XG4gICAgICAgIHRoaXMuc2t5Ym94SW50ZW5zaXR5SWQgPSBzY29wZS5yZXNvbHZlKCdza3lib3hJbnRlbnNpdHknKTtcbiAgICAgICAgdGhpcy5jdWJlTWFwUm90YXRpb25NYXRyaXhJZCA9IHNjb3BlLnJlc29sdmUoJ2N1YmVNYXBSb3RhdGlvbk1hdHJpeCcpO1xuICAgICAgICB0aGlzLnBjc3NEaXNrU2FtcGxlc0lkID0gc2NvcGUucmVzb2x2ZSgncGNzc0Rpc2tTYW1wbGVzWzBdJyk7XG4gICAgICAgIHRoaXMucGNzc1NwaGVyZVNhbXBsZXNJZCA9IHNjb3BlLnJlc29sdmUoJ3Bjc3NTcGhlcmVTYW1wbGVzWzBdJyk7XG4gICAgICAgIHRoaXMubGlnaHRDb2xvcklkID0gW107XG4gICAgICAgIHRoaXMubGlnaHREaXIgPSBbXTtcbiAgICAgICAgdGhpcy5saWdodERpcklkID0gW107XG4gICAgICAgIHRoaXMubGlnaHRTaGFkb3dNYXBJZCA9IFtdO1xuICAgICAgICB0aGlzLmxpZ2h0U2hhZG93TWF0cml4SWQgPSBbXTtcbiAgICAgICAgdGhpcy5saWdodFNoYWRvd1BhcmFtc0lkID0gW107XG4gICAgICAgIHRoaXMubGlnaHRTaGFkb3dJbnRlbnNpdHkgPSBbXTtcbiAgICAgICAgdGhpcy5saWdodFJhZGl1c0lkID0gW107XG4gICAgICAgIHRoaXMubGlnaHRQb3MgPSBbXTtcbiAgICAgICAgdGhpcy5saWdodFBvc0lkID0gW107XG4gICAgICAgIHRoaXMubGlnaHRXaWR0aCA9IFtdO1xuICAgICAgICB0aGlzLmxpZ2h0V2lkdGhJZCA9IFtdO1xuICAgICAgICB0aGlzLmxpZ2h0SGVpZ2h0ID0gW107XG4gICAgICAgIHRoaXMubGlnaHRIZWlnaHRJZCA9IFtdO1xuICAgICAgICB0aGlzLmxpZ2h0SW5BbmdsZUlkID0gW107XG4gICAgICAgIHRoaXMubGlnaHRPdXRBbmdsZUlkID0gW107XG4gICAgICAgIHRoaXMubGlnaHRDb29raWVJZCA9IFtdO1xuICAgICAgICB0aGlzLmxpZ2h0Q29va2llSW50SWQgPSBbXTtcbiAgICAgICAgdGhpcy5saWdodENvb2tpZU1hdHJpeElkID0gW107XG4gICAgICAgIHRoaXMubGlnaHRDb29raWVPZmZzZXRJZCA9IFtdO1xuICAgICAgICB0aGlzLmxpZ2h0U2hhZG93U2VhcmNoQXJlYUlkID0gW107XG4gICAgICAgIHRoaXMubGlnaHRDYW1lcmFQYXJhbXNJZCA9IFtdO1xuXG4gICAgICAgIC8vIHNoYWRvdyBjYXNjYWRlc1xuICAgICAgICB0aGlzLnNoYWRvd01hdHJpeFBhbGV0dGVJZCA9IFtdO1xuICAgICAgICB0aGlzLnNoYWRvd0Nhc2NhZGVEaXN0YW5jZXNJZCA9IFtdO1xuICAgICAgICB0aGlzLnNoYWRvd0Nhc2NhZGVDb3VudElkID0gW107XG5cbiAgICAgICAgdGhpcy5zY3JlZW5TaXplSWQgPSBzY29wZS5yZXNvbHZlKCd1U2NyZWVuU2l6ZScpO1xuICAgICAgICB0aGlzLl9zY3JlZW5TaXplID0gbmV3IEZsb2F0MzJBcnJheSg0KTtcblxuICAgICAgICB0aGlzLmZvZ0NvbG9yID0gbmV3IEZsb2F0MzJBcnJheSgzKTtcbiAgICAgICAgdGhpcy5hbWJpZW50Q29sb3IgPSBuZXcgRmxvYXQzMkFycmF5KDMpO1xuXG4gICAgICAgIHRoaXMucGNzc0Rpc2tTYW1wbGVzID0gdm9nZWxEaXNrUHJlY2FsY3VsYXRpb25TYW1wbGVzKDE2KTtcbiAgICAgICAgdGhpcy5wY3NzU3BoZXJlU2FtcGxlcyA9IHZvZ2VsU3BoZXJlUHJlY2FsY3VsYXRpb25TYW1wbGVzKDE2KTtcbiAgICB9XG5cbiAgICBkZXN0cm95KCkge1xuICAgICAgICBzdXBlci5kZXN0cm95KCk7XG4gICAgfVxuXG4gICAgLy8gI2lmIF9QUk9GSUxFUlxuICAgIC8vIFN0YXRpYyBwcm9wZXJ0aWVzIHVzZWQgYnkgdGhlIFByb2ZpbGVyIGluIHRoZSBFZGl0b3IncyBMYXVuY2ggUGFnZVxuICAgIHN0YXRpYyBza2lwUmVuZGVyQ2FtZXJhID0gbnVsbDtcblxuICAgIHN0YXRpYyBfc2tpcFJlbmRlckNvdW50ZXIgPSAwO1xuXG4gICAgc3RhdGljIHNraXBSZW5kZXJBZnRlciA9IDA7XG4gICAgLy8gI2VuZGlmXG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi4vc2NlbmUuanMnKS5TY2VuZX0gc2NlbmUgLSBUaGUgc2NlbmUuXG4gICAgICovXG4gICAgZGlzcGF0Y2hHbG9iYWxMaWdodHMoc2NlbmUpIHtcbiAgICAgICAgdGhpcy5hbWJpZW50Q29sb3JbMF0gPSBzY2VuZS5hbWJpZW50TGlnaHQucjtcbiAgICAgICAgdGhpcy5hbWJpZW50Q29sb3JbMV0gPSBzY2VuZS5hbWJpZW50TGlnaHQuZztcbiAgICAgICAgdGhpcy5hbWJpZW50Q29sb3JbMl0gPSBzY2VuZS5hbWJpZW50TGlnaHQuYjtcbiAgICAgICAgaWYgKHNjZW5lLmdhbW1hQ29ycmVjdGlvbikge1xuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCAzOyBpKyspIHtcbiAgICAgICAgICAgICAgICB0aGlzLmFtYmllbnRDb2xvcltpXSA9IE1hdGgucG93KHRoaXMuYW1iaWVudENvbG9yW2ldLCAyLjIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChzY2VuZS5waHlzaWNhbFVuaXRzKSB7XG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IDM7IGkrKykge1xuICAgICAgICAgICAgICAgIHRoaXMuYW1iaWVudENvbG9yW2ldICo9IHNjZW5lLmFtYmllbnRMdW1pbmFuY2U7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5hbWJpZW50SWQuc2V0VmFsdWUodGhpcy5hbWJpZW50Q29sb3IpO1xuXG4gICAgICAgIHRoaXMuc2t5Ym94SW50ZW5zaXR5SWQuc2V0VmFsdWUoc2NlbmUucGh5c2ljYWxVbml0cyA/IHNjZW5lLnNreWJveEx1bWluYW5jZSA6IHNjZW5lLnNreWJveEludGVuc2l0eSk7XG4gICAgICAgIHRoaXMuY3ViZU1hcFJvdGF0aW9uTWF0cml4SWQuc2V0VmFsdWUoc2NlbmUuX3NreWJveFJvdGF0aW9uTWF0My5kYXRhKTtcbiAgICB9XG5cbiAgICBfcmVzb2x2ZUxpZ2h0KHNjb3BlLCBpKSB7XG4gICAgICAgIGNvbnN0IGxpZ2h0ID0gJ2xpZ2h0JyArIGk7XG4gICAgICAgIHRoaXMubGlnaHRDb2xvcklkW2ldID0gc2NvcGUucmVzb2x2ZShsaWdodCArICdfY29sb3InKTtcbiAgICAgICAgdGhpcy5saWdodERpcltpXSA9IG5ldyBGbG9hdDMyQXJyYXkoMyk7XG4gICAgICAgIHRoaXMubGlnaHREaXJJZFtpXSA9IHNjb3BlLnJlc29sdmUobGlnaHQgKyAnX2RpcmVjdGlvbicpO1xuICAgICAgICB0aGlzLmxpZ2h0U2hhZG93TWFwSWRbaV0gPSBzY29wZS5yZXNvbHZlKGxpZ2h0ICsgJ19zaGFkb3dNYXAnKTtcbiAgICAgICAgdGhpcy5saWdodFNoYWRvd01hdHJpeElkW2ldID0gc2NvcGUucmVzb2x2ZShsaWdodCArICdfc2hhZG93TWF0cml4Jyk7XG4gICAgICAgIHRoaXMubGlnaHRTaGFkb3dQYXJhbXNJZFtpXSA9IHNjb3BlLnJlc29sdmUobGlnaHQgKyAnX3NoYWRvd1BhcmFtcycpO1xuICAgICAgICB0aGlzLmxpZ2h0U2hhZG93SW50ZW5zaXR5W2ldID0gc2NvcGUucmVzb2x2ZShsaWdodCArICdfc2hhZG93SW50ZW5zaXR5Jyk7XG4gICAgICAgIHRoaXMubGlnaHRTaGFkb3dTZWFyY2hBcmVhSWRbaV0gPSBzY29wZS5yZXNvbHZlKGxpZ2h0ICsgJ19zaGFkb3dTZWFyY2hBcmVhJyk7XG4gICAgICAgIHRoaXMubGlnaHRSYWRpdXNJZFtpXSA9IHNjb3BlLnJlc29sdmUobGlnaHQgKyAnX3JhZGl1cycpO1xuICAgICAgICB0aGlzLmxpZ2h0UG9zW2ldID0gbmV3IEZsb2F0MzJBcnJheSgzKTtcbiAgICAgICAgdGhpcy5saWdodFBvc0lkW2ldID0gc2NvcGUucmVzb2x2ZShsaWdodCArICdfcG9zaXRpb24nKTtcbiAgICAgICAgdGhpcy5saWdodFdpZHRoW2ldID0gbmV3IEZsb2F0MzJBcnJheSgzKTtcbiAgICAgICAgdGhpcy5saWdodFdpZHRoSWRbaV0gPSBzY29wZS5yZXNvbHZlKGxpZ2h0ICsgJ19oYWxmV2lkdGgnKTtcbiAgICAgICAgdGhpcy5saWdodEhlaWdodFtpXSA9IG5ldyBGbG9hdDMyQXJyYXkoMyk7XG4gICAgICAgIHRoaXMubGlnaHRIZWlnaHRJZFtpXSA9IHNjb3BlLnJlc29sdmUobGlnaHQgKyAnX2hhbGZIZWlnaHQnKTtcbiAgICAgICAgdGhpcy5saWdodEluQW5nbGVJZFtpXSA9IHNjb3BlLnJlc29sdmUobGlnaHQgKyAnX2lubmVyQ29uZUFuZ2xlJyk7XG4gICAgICAgIHRoaXMubGlnaHRPdXRBbmdsZUlkW2ldID0gc2NvcGUucmVzb2x2ZShsaWdodCArICdfb3V0ZXJDb25lQW5nbGUnKTtcbiAgICAgICAgdGhpcy5saWdodENvb2tpZUlkW2ldID0gc2NvcGUucmVzb2x2ZShsaWdodCArICdfY29va2llJyk7XG4gICAgICAgIHRoaXMubGlnaHRDb29raWVJbnRJZFtpXSA9IHNjb3BlLnJlc29sdmUobGlnaHQgKyAnX2Nvb2tpZUludGVuc2l0eScpO1xuICAgICAgICB0aGlzLmxpZ2h0Q29va2llTWF0cml4SWRbaV0gPSBzY29wZS5yZXNvbHZlKGxpZ2h0ICsgJ19jb29raWVNYXRyaXgnKTtcbiAgICAgICAgdGhpcy5saWdodENvb2tpZU9mZnNldElkW2ldID0gc2NvcGUucmVzb2x2ZShsaWdodCArICdfY29va2llT2Zmc2V0Jyk7XG4gICAgICAgIHRoaXMubGlnaHRDYW1lcmFQYXJhbXNJZFtpXSA9IHNjb3BlLnJlc29sdmUobGlnaHQgKyAnX2NhbWVyYVBhcmFtcycpO1xuXG4gICAgICAgIC8vIHNoYWRvdyBjYXNjYWRlc1xuICAgICAgICB0aGlzLnNoYWRvd01hdHJpeFBhbGV0dGVJZFtpXSA9IHNjb3BlLnJlc29sdmUobGlnaHQgKyAnX3NoYWRvd01hdHJpeFBhbGV0dGVbMF0nKTtcbiAgICAgICAgdGhpcy5zaGFkb3dDYXNjYWRlRGlzdGFuY2VzSWRbaV0gPSBzY29wZS5yZXNvbHZlKGxpZ2h0ICsgJ19zaGFkb3dDYXNjYWRlRGlzdGFuY2VzWzBdJyk7XG4gICAgICAgIHRoaXMuc2hhZG93Q2FzY2FkZUNvdW50SWRbaV0gPSBzY29wZS5yZXNvbHZlKGxpZ2h0ICsgJ19zaGFkb3dDYXNjYWRlQ291bnQnKTtcbiAgICB9XG5cbiAgICBzZXRMVENEaXJlY3Rpb25hbExpZ2h0KHd0bSwgY250LCBkaXIsIGNhbXBvcywgZmFyKSB7XG4gICAgICAgIHRoaXMubGlnaHRQb3NbY250XVswXSA9IGNhbXBvcy54IC0gZGlyLnggKiBmYXI7XG4gICAgICAgIHRoaXMubGlnaHRQb3NbY250XVsxXSA9IGNhbXBvcy55IC0gZGlyLnkgKiBmYXI7XG4gICAgICAgIHRoaXMubGlnaHRQb3NbY250XVsyXSA9IGNhbXBvcy56IC0gZGlyLnogKiBmYXI7XG4gICAgICAgIHRoaXMubGlnaHRQb3NJZFtjbnRdLnNldFZhbHVlKHRoaXMubGlnaHRQb3NbY250XSk7XG5cbiAgICAgICAgY29uc3QgaFdpZHRoID0gd3RtLnRyYW5zZm9ybVZlY3RvcihuZXcgVmVjMygtMC41LCAwLCAwKSk7XG4gICAgICAgIHRoaXMubGlnaHRXaWR0aFtjbnRdWzBdID0gaFdpZHRoLnggKiBmYXI7XG4gICAgICAgIHRoaXMubGlnaHRXaWR0aFtjbnRdWzFdID0gaFdpZHRoLnkgKiBmYXI7XG4gICAgICAgIHRoaXMubGlnaHRXaWR0aFtjbnRdWzJdID0gaFdpZHRoLnogKiBmYXI7XG4gICAgICAgIHRoaXMubGlnaHRXaWR0aElkW2NudF0uc2V0VmFsdWUodGhpcy5saWdodFdpZHRoW2NudF0pO1xuXG4gICAgICAgIGNvbnN0IGhIZWlnaHQgPSB3dG0udHJhbnNmb3JtVmVjdG9yKG5ldyBWZWMzKDAsIDAsIDAuNSkpO1xuICAgICAgICB0aGlzLmxpZ2h0SGVpZ2h0W2NudF1bMF0gPSBoSGVpZ2h0LnggKiBmYXI7XG4gICAgICAgIHRoaXMubGlnaHRIZWlnaHRbY250XVsxXSA9IGhIZWlnaHQueSAqIGZhcjtcbiAgICAgICAgdGhpcy5saWdodEhlaWdodFtjbnRdWzJdID0gaEhlaWdodC56ICogZmFyO1xuICAgICAgICB0aGlzLmxpZ2h0SGVpZ2h0SWRbY250XS5zZXRWYWx1ZSh0aGlzLmxpZ2h0SGVpZ2h0W2NudF0pO1xuICAgIH1cblxuICAgIGRpc3BhdGNoRGlyZWN0TGlnaHRzKGRpcnMsIHNjZW5lLCBtYXNrLCBjYW1lcmEpIHtcbiAgICAgICAgbGV0IGNudCA9IDA7XG5cbiAgICAgICAgY29uc3Qgc2NvcGUgPSB0aGlzLmRldmljZS5zY29wZTtcblxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGRpcnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGlmICghKGRpcnNbaV0ubWFzayAmIG1hc2spKSBjb250aW51ZTtcblxuICAgICAgICAgICAgY29uc3QgZGlyZWN0aW9uYWwgPSBkaXJzW2ldO1xuICAgICAgICAgICAgY29uc3Qgd3RtID0gZGlyZWN0aW9uYWwuX25vZGUuZ2V0V29ybGRUcmFuc2Zvcm0oKTtcblxuICAgICAgICAgICAgaWYgKCF0aGlzLmxpZ2h0Q29sb3JJZFtjbnRdKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fcmVzb2x2ZUxpZ2h0KHNjb3BlLCBjbnQpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLmxpZ2h0Q29sb3JJZFtjbnRdLnNldFZhbHVlKHNjZW5lLmdhbW1hQ29ycmVjdGlvbiA/IGRpcmVjdGlvbmFsLl9saW5lYXJGaW5hbENvbG9yIDogZGlyZWN0aW9uYWwuX2ZpbmFsQ29sb3IpO1xuXG4gICAgICAgICAgICAvLyBEaXJlY3Rpb25hbCBsaWdodHMgc2hpbmUgZG93biB0aGUgbmVnYXRpdmUgWSBheGlzXG4gICAgICAgICAgICB3dG0uZ2V0WShkaXJlY3Rpb25hbC5fZGlyZWN0aW9uKS5tdWxTY2FsYXIoLTEpO1xuICAgICAgICAgICAgZGlyZWN0aW9uYWwuX2RpcmVjdGlvbi5ub3JtYWxpemUoKTtcbiAgICAgICAgICAgIHRoaXMubGlnaHREaXJbY250XVswXSA9IGRpcmVjdGlvbmFsLl9kaXJlY3Rpb24ueDtcbiAgICAgICAgICAgIHRoaXMubGlnaHREaXJbY250XVsxXSA9IGRpcmVjdGlvbmFsLl9kaXJlY3Rpb24ueTtcbiAgICAgICAgICAgIHRoaXMubGlnaHREaXJbY250XVsyXSA9IGRpcmVjdGlvbmFsLl9kaXJlY3Rpb24uejtcbiAgICAgICAgICAgIHRoaXMubGlnaHREaXJJZFtjbnRdLnNldFZhbHVlKHRoaXMubGlnaHREaXJbY250XSk7XG5cbiAgICAgICAgICAgIGlmIChkaXJlY3Rpb25hbC5zaGFwZSAhPT0gTElHSFRTSEFQRV9QVU5DVFVBTCkge1xuICAgICAgICAgICAgICAgIC8vIG5vbi1wdW5jdHVhbCBzaGFwZSAtIE5CIGRpcmVjdGlvbmFsIGFyZWEgbGlnaHQgc3BlY3VsYXIgaXMgYXBwcm94aW1hdGVkIGJ5IHB1dHRpbmcgdGhlIGFyZWEgbGlnaHQgYXQgdGhlIGZhciBjbGlwXG4gICAgICAgICAgICAgICAgdGhpcy5zZXRMVENEaXJlY3Rpb25hbExpZ2h0KHd0bSwgY250LCBkaXJlY3Rpb25hbC5fZGlyZWN0aW9uLCBjYW1lcmEuX25vZGUuZ2V0UG9zaXRpb24oKSwgY2FtZXJhLmZhckNsaXApO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoZGlyZWN0aW9uYWwuY2FzdFNoYWRvd3MpIHtcblxuICAgICAgICAgICAgICAgIGNvbnN0IGxpZ2h0UmVuZGVyRGF0YSA9IGRpcmVjdGlvbmFsLmdldFJlbmRlckRhdGEoY2FtZXJhLCAwKTtcbiAgICAgICAgICAgICAgICBjb25zdCBiaWFzZXMgPSBkaXJlY3Rpb25hbC5fZ2V0VW5pZm9ybUJpYXNWYWx1ZXMobGlnaHRSZW5kZXJEYXRhKTtcblxuICAgICAgICAgICAgICAgIHRoaXMubGlnaHRTaGFkb3dNYXBJZFtjbnRdLnNldFZhbHVlKGxpZ2h0UmVuZGVyRGF0YS5zaGFkb3dCdWZmZXIpO1xuICAgICAgICAgICAgICAgIHRoaXMubGlnaHRTaGFkb3dNYXRyaXhJZFtjbnRdLnNldFZhbHVlKGxpZ2h0UmVuZGVyRGF0YS5zaGFkb3dNYXRyaXguZGF0YSk7XG5cbiAgICAgICAgICAgICAgICB0aGlzLnNoYWRvd01hdHJpeFBhbGV0dGVJZFtjbnRdLnNldFZhbHVlKGRpcmVjdGlvbmFsLl9zaGFkb3dNYXRyaXhQYWxldHRlKTtcbiAgICAgICAgICAgICAgICB0aGlzLnNoYWRvd0Nhc2NhZGVEaXN0YW5jZXNJZFtjbnRdLnNldFZhbHVlKGRpcmVjdGlvbmFsLl9zaGFkb3dDYXNjYWRlRGlzdGFuY2VzKTtcbiAgICAgICAgICAgICAgICB0aGlzLnNoYWRvd0Nhc2NhZGVDb3VudElkW2NudF0uc2V0VmFsdWUoZGlyZWN0aW9uYWwubnVtQ2FzY2FkZXMpO1xuICAgICAgICAgICAgICAgIHRoaXMubGlnaHRTaGFkb3dJbnRlbnNpdHlbY250XS5zZXRWYWx1ZShkaXJlY3Rpb25hbC5zaGFkb3dJbnRlbnNpdHkpO1xuXG4gICAgICAgICAgICAgICAgY29uc3QgcHJvamVjdGlvbkNvbXBlbnNhdGlvbiA9ICg1MC4wIC8gbGlnaHRSZW5kZXJEYXRhLnByb2plY3Rpb25Db21wZW5zYXRpb24pO1xuICAgICAgICAgICAgICAgIGNvbnN0IHBpeGVsc1Blck1ldGVyID0gZGlyZWN0aW9uYWwucGVudW1icmFTaXplIC8gbGlnaHRSZW5kZXJEYXRhLnNoYWRvd0NhbWVyYS5yZW5kZXJUYXJnZXQud2lkdGg7XG4gICAgICAgICAgICAgICAgdGhpcy5saWdodFNoYWRvd1NlYXJjaEFyZWFJZFtjbnRdLnNldFZhbHVlKHBpeGVsc1Blck1ldGVyICogcHJvamVjdGlvbkNvbXBlbnNhdGlvbik7XG5cbiAgICAgICAgICAgICAgICBjb25zdCBjYW1lcmFQYXJhbXMgPSBkaXJlY3Rpb25hbC5fc2hhZG93Q2FtZXJhUGFyYW1zO1xuICAgICAgICAgICAgICAgIGNhbWVyYVBhcmFtcy5sZW5ndGggPSA0O1xuICAgICAgICAgICAgICAgIGNhbWVyYVBhcmFtc1swXSA9IGxpZ2h0UmVuZGVyRGF0YS5kZXB0aFJhbmdlQ29tcGVuc2F0aW9uO1xuICAgICAgICAgICAgICAgIGNhbWVyYVBhcmFtc1sxXSA9IGxpZ2h0UmVuZGVyRGF0YS5zaGFkb3dDYW1lcmEuX2ZhckNsaXA7XG4gICAgICAgICAgICAgICAgY2FtZXJhUGFyYW1zWzJdID0gbGlnaHRSZW5kZXJEYXRhLnNoYWRvd0NhbWVyYS5fbmVhckNsaXA7XG4gICAgICAgICAgICAgICAgY2FtZXJhUGFyYW1zWzNdID0gMTtcbiAgICAgICAgICAgICAgICB0aGlzLmxpZ2h0Q2FtZXJhUGFyYW1zSWRbY250XS5zZXRWYWx1ZShjYW1lcmFQYXJhbXMpO1xuXG4gICAgICAgICAgICAgICAgY29uc3QgcGFyYW1zID0gZGlyZWN0aW9uYWwuX3NoYWRvd1JlbmRlclBhcmFtcztcbiAgICAgICAgICAgICAgICBwYXJhbXMubGVuZ3RoID0gNDtcbiAgICAgICAgICAgICAgICBwYXJhbXNbMF0gPSBkaXJlY3Rpb25hbC5fc2hhZG93UmVzb2x1dGlvbjsgIC8vIE5vdGU6IHRoaXMgbmVlZHMgdG8gY2hhbmdlIGZvciBub24tc3F1YXJlIHNoYWRvdyBtYXBzICgyIGNhc2NhZGVzKS4gQ3VycmVudGx5IHNxdWFyZSBpcyB1c2VkXG4gICAgICAgICAgICAgICAgcGFyYW1zWzFdID0gYmlhc2VzLm5vcm1hbEJpYXM7XG4gICAgICAgICAgICAgICAgcGFyYW1zWzJdID0gYmlhc2VzLmJpYXM7XG4gICAgICAgICAgICAgICAgcGFyYW1zWzNdID0gMDtcbiAgICAgICAgICAgICAgICB0aGlzLmxpZ2h0U2hhZG93UGFyYW1zSWRbY250XS5zZXRWYWx1ZShwYXJhbXMpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY250Kys7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGNudDtcbiAgICB9XG5cbiAgICBzZXRMVENQb3NpdGlvbmFsTGlnaHQod3RtLCBjbnQpIHtcbiAgICAgICAgY29uc3QgaFdpZHRoID0gd3RtLnRyYW5zZm9ybVZlY3RvcihuZXcgVmVjMygtMC41LCAwLCAwKSk7XG4gICAgICAgIHRoaXMubGlnaHRXaWR0aFtjbnRdWzBdID0gaFdpZHRoLng7XG4gICAgICAgIHRoaXMubGlnaHRXaWR0aFtjbnRdWzFdID0gaFdpZHRoLnk7XG4gICAgICAgIHRoaXMubGlnaHRXaWR0aFtjbnRdWzJdID0gaFdpZHRoLno7XG4gICAgICAgIHRoaXMubGlnaHRXaWR0aElkW2NudF0uc2V0VmFsdWUodGhpcy5saWdodFdpZHRoW2NudF0pO1xuXG4gICAgICAgIGNvbnN0IGhIZWlnaHQgPSB3dG0udHJhbnNmb3JtVmVjdG9yKG5ldyBWZWMzKDAsIDAsIDAuNSkpO1xuICAgICAgICB0aGlzLmxpZ2h0SGVpZ2h0W2NudF1bMF0gPSBoSGVpZ2h0Lng7XG4gICAgICAgIHRoaXMubGlnaHRIZWlnaHRbY250XVsxXSA9IGhIZWlnaHQueTtcbiAgICAgICAgdGhpcy5saWdodEhlaWdodFtjbnRdWzJdID0gaEhlaWdodC56O1xuICAgICAgICB0aGlzLmxpZ2h0SGVpZ2h0SWRbY250XS5zZXRWYWx1ZSh0aGlzLmxpZ2h0SGVpZ2h0W2NudF0pO1xuICAgIH1cblxuICAgIGRpc3BhdGNoT21uaUxpZ2h0KHNjZW5lLCBzY29wZSwgb21uaSwgY250KSB7XG4gICAgICAgIGNvbnN0IHd0bSA9IG9tbmkuX25vZGUuZ2V0V29ybGRUcmFuc2Zvcm0oKTtcblxuICAgICAgICBpZiAoIXRoaXMubGlnaHRDb2xvcklkW2NudF0pIHtcbiAgICAgICAgICAgIHRoaXMuX3Jlc29sdmVMaWdodChzY29wZSwgY250KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMubGlnaHRSYWRpdXNJZFtjbnRdLnNldFZhbHVlKG9tbmkuYXR0ZW51YXRpb25FbmQpO1xuICAgICAgICB0aGlzLmxpZ2h0Q29sb3JJZFtjbnRdLnNldFZhbHVlKHNjZW5lLmdhbW1hQ29ycmVjdGlvbiA/IG9tbmkuX2xpbmVhckZpbmFsQ29sb3IgOiBvbW5pLl9maW5hbENvbG9yKTtcbiAgICAgICAgd3RtLmdldFRyYW5zbGF0aW9uKG9tbmkuX3Bvc2l0aW9uKTtcbiAgICAgICAgdGhpcy5saWdodFBvc1tjbnRdWzBdID0gb21uaS5fcG9zaXRpb24ueDtcbiAgICAgICAgdGhpcy5saWdodFBvc1tjbnRdWzFdID0gb21uaS5fcG9zaXRpb24ueTtcbiAgICAgICAgdGhpcy5saWdodFBvc1tjbnRdWzJdID0gb21uaS5fcG9zaXRpb24uejtcbiAgICAgICAgdGhpcy5saWdodFBvc0lkW2NudF0uc2V0VmFsdWUodGhpcy5saWdodFBvc1tjbnRdKTtcblxuICAgICAgICBpZiAob21uaS5zaGFwZSAhPT0gTElHSFRTSEFQRV9QVU5DVFVBTCkge1xuICAgICAgICAgICAgLy8gbm9uLXB1bmN0dWFsIHNoYXBlXG4gICAgICAgICAgICB0aGlzLnNldExUQ1Bvc2l0aW9uYWxMaWdodCh3dG0sIGNudCk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAob21uaS5jYXN0U2hhZG93cykge1xuXG4gICAgICAgICAgICAvLyBzaGFkb3cgbWFwXG4gICAgICAgICAgICBjb25zdCBsaWdodFJlbmRlckRhdGEgPSBvbW5pLmdldFJlbmRlckRhdGEobnVsbCwgMCk7XG4gICAgICAgICAgICB0aGlzLmxpZ2h0U2hhZG93TWFwSWRbY250XS5zZXRWYWx1ZShsaWdodFJlbmRlckRhdGEuc2hhZG93QnVmZmVyKTtcblxuICAgICAgICAgICAgY29uc3QgYmlhc2VzID0gb21uaS5fZ2V0VW5pZm9ybUJpYXNWYWx1ZXMobGlnaHRSZW5kZXJEYXRhKTtcbiAgICAgICAgICAgIGNvbnN0IHBhcmFtcyA9IG9tbmkuX3NoYWRvd1JlbmRlclBhcmFtcztcbiAgICAgICAgICAgIHBhcmFtcy5sZW5ndGggPSA0O1xuICAgICAgICAgICAgcGFyYW1zWzBdID0gb21uaS5fc2hhZG93UmVzb2x1dGlvbjtcbiAgICAgICAgICAgIHBhcmFtc1sxXSA9IGJpYXNlcy5ub3JtYWxCaWFzO1xuICAgICAgICAgICAgcGFyYW1zWzJdID0gYmlhc2VzLmJpYXM7XG4gICAgICAgICAgICBwYXJhbXNbM10gPSAxLjAgLyBvbW5pLmF0dGVudWF0aW9uRW5kO1xuICAgICAgICAgICAgdGhpcy5saWdodFNoYWRvd1BhcmFtc0lkW2NudF0uc2V0VmFsdWUocGFyYW1zKTtcbiAgICAgICAgICAgIHRoaXMubGlnaHRTaGFkb3dJbnRlbnNpdHlbY250XS5zZXRWYWx1ZShvbW5pLnNoYWRvd0ludGVuc2l0eSk7XG5cbiAgICAgICAgICAgIGNvbnN0IHBpeGVsc1Blck1ldGVyID0gb21uaS5wZW51bWJyYVNpemUgLyBsaWdodFJlbmRlckRhdGEuc2hhZG93Q2FtZXJhLnJlbmRlclRhcmdldC53aWR0aDtcbiAgICAgICAgICAgIHRoaXMubGlnaHRTaGFkb3dTZWFyY2hBcmVhSWRbY250XS5zZXRWYWx1ZShwaXhlbHNQZXJNZXRlcik7XG4gICAgICAgICAgICBjb25zdCBjYW1lcmFQYXJhbXMgPSBvbW5pLl9zaGFkb3dDYW1lcmFQYXJhbXM7XG5cbiAgICAgICAgICAgIGNhbWVyYVBhcmFtcy5sZW5ndGggPSA0O1xuICAgICAgICAgICAgY2FtZXJhUGFyYW1zWzBdID0gbGlnaHRSZW5kZXJEYXRhLmRlcHRoUmFuZ2VDb21wZW5zYXRpb247XG4gICAgICAgICAgICBjYW1lcmFQYXJhbXNbMV0gPSBsaWdodFJlbmRlckRhdGEuc2hhZG93Q2FtZXJhLl9mYXJDbGlwO1xuICAgICAgICAgICAgY2FtZXJhUGFyYW1zWzJdID0gbGlnaHRSZW5kZXJEYXRhLnNoYWRvd0NhbWVyYS5fbmVhckNsaXA7XG4gICAgICAgICAgICBjYW1lcmFQYXJhbXNbM10gPSAwO1xuICAgICAgICAgICAgdGhpcy5saWdodENhbWVyYVBhcmFtc0lkW2NudF0uc2V0VmFsdWUoY2FtZXJhUGFyYW1zKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAob21uaS5fY29va2llKSB7XG4gICAgICAgICAgICB0aGlzLmxpZ2h0Q29va2llSWRbY250XS5zZXRWYWx1ZShvbW5pLl9jb29raWUpO1xuICAgICAgICAgICAgdGhpcy5saWdodFNoYWRvd01hdHJpeElkW2NudF0uc2V0VmFsdWUod3RtLmRhdGEpO1xuICAgICAgICAgICAgdGhpcy5saWdodENvb2tpZUludElkW2NudF0uc2V0VmFsdWUob21uaS5jb29raWVJbnRlbnNpdHkpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZGlzcGF0Y2hTcG90TGlnaHQoc2NlbmUsIHNjb3BlLCBzcG90LCBjbnQpIHtcbiAgICAgICAgY29uc3Qgd3RtID0gc3BvdC5fbm9kZS5nZXRXb3JsZFRyYW5zZm9ybSgpO1xuXG4gICAgICAgIGlmICghdGhpcy5saWdodENvbG9ySWRbY250XSkge1xuICAgICAgICAgICAgdGhpcy5fcmVzb2x2ZUxpZ2h0KHNjb3BlLCBjbnQpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5saWdodEluQW5nbGVJZFtjbnRdLnNldFZhbHVlKHNwb3QuX2lubmVyQ29uZUFuZ2xlQ29zKTtcbiAgICAgICAgdGhpcy5saWdodE91dEFuZ2xlSWRbY250XS5zZXRWYWx1ZShzcG90Ll9vdXRlckNvbmVBbmdsZUNvcyk7XG4gICAgICAgIHRoaXMubGlnaHRSYWRpdXNJZFtjbnRdLnNldFZhbHVlKHNwb3QuYXR0ZW51YXRpb25FbmQpO1xuICAgICAgICB0aGlzLmxpZ2h0Q29sb3JJZFtjbnRdLnNldFZhbHVlKHNjZW5lLmdhbW1hQ29ycmVjdGlvbiA/IHNwb3QuX2xpbmVhckZpbmFsQ29sb3IgOiBzcG90Ll9maW5hbENvbG9yKTtcbiAgICAgICAgd3RtLmdldFRyYW5zbGF0aW9uKHNwb3QuX3Bvc2l0aW9uKTtcbiAgICAgICAgdGhpcy5saWdodFBvc1tjbnRdWzBdID0gc3BvdC5fcG9zaXRpb24ueDtcbiAgICAgICAgdGhpcy5saWdodFBvc1tjbnRdWzFdID0gc3BvdC5fcG9zaXRpb24ueTtcbiAgICAgICAgdGhpcy5saWdodFBvc1tjbnRdWzJdID0gc3BvdC5fcG9zaXRpb24uejtcbiAgICAgICAgdGhpcy5saWdodFBvc0lkW2NudF0uc2V0VmFsdWUodGhpcy5saWdodFBvc1tjbnRdKTtcblxuICAgICAgICBpZiAoc3BvdC5zaGFwZSAhPT0gTElHSFRTSEFQRV9QVU5DVFVBTCkge1xuICAgICAgICAgICAgLy8gbm9uLXB1bmN0dWFsIHNoYXBlXG4gICAgICAgICAgICB0aGlzLnNldExUQ1Bvc2l0aW9uYWxMaWdodCh3dG0sIGNudCk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBTcG90cyBzaGluZSBkb3duIHRoZSBuZWdhdGl2ZSBZIGF4aXNcbiAgICAgICAgd3RtLmdldFkoc3BvdC5fZGlyZWN0aW9uKS5tdWxTY2FsYXIoLTEpO1xuICAgICAgICBzcG90Ll9kaXJlY3Rpb24ubm9ybWFsaXplKCk7XG4gICAgICAgIHRoaXMubGlnaHREaXJbY250XVswXSA9IHNwb3QuX2RpcmVjdGlvbi54O1xuICAgICAgICB0aGlzLmxpZ2h0RGlyW2NudF1bMV0gPSBzcG90Ll9kaXJlY3Rpb24ueTtcbiAgICAgICAgdGhpcy5saWdodERpcltjbnRdWzJdID0gc3BvdC5fZGlyZWN0aW9uLno7XG4gICAgICAgIHRoaXMubGlnaHREaXJJZFtjbnRdLnNldFZhbHVlKHRoaXMubGlnaHREaXJbY250XSk7XG5cbiAgICAgICAgaWYgKHNwb3QuY2FzdFNoYWRvd3MpIHtcblxuICAgICAgICAgICAgLy8gc2hhZG93IG1hcFxuICAgICAgICAgICAgY29uc3QgbGlnaHRSZW5kZXJEYXRhID0gc3BvdC5nZXRSZW5kZXJEYXRhKG51bGwsIDApO1xuICAgICAgICAgICAgdGhpcy5saWdodFNoYWRvd01hcElkW2NudF0uc2V0VmFsdWUobGlnaHRSZW5kZXJEYXRhLnNoYWRvd0J1ZmZlcik7XG5cbiAgICAgICAgICAgIHRoaXMubGlnaHRTaGFkb3dNYXRyaXhJZFtjbnRdLnNldFZhbHVlKGxpZ2h0UmVuZGVyRGF0YS5zaGFkb3dNYXRyaXguZGF0YSk7XG5cbiAgICAgICAgICAgIGNvbnN0IGJpYXNlcyA9IHNwb3QuX2dldFVuaWZvcm1CaWFzVmFsdWVzKGxpZ2h0UmVuZGVyRGF0YSk7XG4gICAgICAgICAgICBjb25zdCBwYXJhbXMgPSBzcG90Ll9zaGFkb3dSZW5kZXJQYXJhbXM7XG4gICAgICAgICAgICBwYXJhbXMubGVuZ3RoID0gNDtcbiAgICAgICAgICAgIHBhcmFtc1swXSA9IHNwb3QuX3NoYWRvd1Jlc29sdXRpb247XG4gICAgICAgICAgICBwYXJhbXNbMV0gPSBiaWFzZXMubm9ybWFsQmlhcztcbiAgICAgICAgICAgIHBhcmFtc1syXSA9IGJpYXNlcy5iaWFzO1xuICAgICAgICAgICAgcGFyYW1zWzNdID0gMS4wIC8gc3BvdC5hdHRlbnVhdGlvbkVuZDtcbiAgICAgICAgICAgIHRoaXMubGlnaHRTaGFkb3dQYXJhbXNJZFtjbnRdLnNldFZhbHVlKHBhcmFtcyk7XG4gICAgICAgICAgICB0aGlzLmxpZ2h0U2hhZG93SW50ZW5zaXR5W2NudF0uc2V0VmFsdWUoc3BvdC5zaGFkb3dJbnRlbnNpdHkpO1xuXG4gICAgICAgICAgICBjb25zdCBwaXhlbHNQZXJNZXRlciA9IHNwb3QucGVudW1icmFTaXplIC8gbGlnaHRSZW5kZXJEYXRhLnNoYWRvd0NhbWVyYS5yZW5kZXJUYXJnZXQud2lkdGg7XG4gICAgICAgICAgICBjb25zdCBmb3YgPSBsaWdodFJlbmRlckRhdGEuc2hhZG93Q2FtZXJhLl9mb3YgKiBNYXRoLlBJIC8gMTgwLjA7XG4gICAgICAgICAgICBjb25zdCBmb3ZSYXRpbyA9IDEuMCAvIE1hdGgudGFuKGZvdiAvIDIuMCk7XG4gICAgICAgICAgICB0aGlzLmxpZ2h0U2hhZG93U2VhcmNoQXJlYUlkW2NudF0uc2V0VmFsdWUocGl4ZWxzUGVyTWV0ZXIgKiBmb3ZSYXRpbyk7XG5cbiAgICAgICAgICAgIGNvbnN0IGNhbWVyYVBhcmFtcyA9IHNwb3QuX3NoYWRvd0NhbWVyYVBhcmFtcztcbiAgICAgICAgICAgIGNhbWVyYVBhcmFtcy5sZW5ndGggPSA0O1xuICAgICAgICAgICAgY2FtZXJhUGFyYW1zWzBdID0gbGlnaHRSZW5kZXJEYXRhLmRlcHRoUmFuZ2VDb21wZW5zYXRpb247XG4gICAgICAgICAgICBjYW1lcmFQYXJhbXNbMV0gPSBsaWdodFJlbmRlckRhdGEuc2hhZG93Q2FtZXJhLl9mYXJDbGlwO1xuICAgICAgICAgICAgY2FtZXJhUGFyYW1zWzJdID0gbGlnaHRSZW5kZXJEYXRhLnNoYWRvd0NhbWVyYS5fbmVhckNsaXA7XG4gICAgICAgICAgICBjYW1lcmFQYXJhbXNbM10gPSAwO1xuICAgICAgICAgICAgdGhpcy5saWdodENhbWVyYVBhcmFtc0lkW2NudF0uc2V0VmFsdWUoY2FtZXJhUGFyYW1zKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzcG90Ll9jb29raWUpIHtcblxuICAgICAgICAgICAgLy8gaWYgc2hhZG93IGlzIG5vdCByZW5kZXJlZCwgd2UgbmVlZCB0byBldmFsdWF0ZSBsaWdodCBwcm9qZWN0aW9uIG1hdHJpeFxuICAgICAgICAgICAgaWYgKCFzcG90LmNhc3RTaGFkb3dzKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgY29va2llTWF0cml4ID0gTGlnaHRDYW1lcmEuZXZhbFNwb3RDb29raWVNYXRyaXgoc3BvdCk7XG4gICAgICAgICAgICAgICAgdGhpcy5saWdodFNoYWRvd01hdHJpeElkW2NudF0uc2V0VmFsdWUoY29va2llTWF0cml4LmRhdGEpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLmxpZ2h0Q29va2llSWRbY250XS5zZXRWYWx1ZShzcG90Ll9jb29raWUpO1xuICAgICAgICAgICAgdGhpcy5saWdodENvb2tpZUludElkW2NudF0uc2V0VmFsdWUoc3BvdC5jb29raWVJbnRlbnNpdHkpO1xuICAgICAgICAgICAgaWYgKHNwb3QuX2Nvb2tpZVRyYW5zZm9ybSkge1xuICAgICAgICAgICAgICAgIHNwb3QuX2Nvb2tpZVRyYW5zZm9ybVVuaWZvcm1bMF0gPSBzcG90Ll9jb29raWVUcmFuc2Zvcm0ueDtcbiAgICAgICAgICAgICAgICBzcG90Ll9jb29raWVUcmFuc2Zvcm1Vbmlmb3JtWzFdID0gc3BvdC5fY29va2llVHJhbnNmb3JtLnk7XG4gICAgICAgICAgICAgICAgc3BvdC5fY29va2llVHJhbnNmb3JtVW5pZm9ybVsyXSA9IHNwb3QuX2Nvb2tpZVRyYW5zZm9ybS56O1xuICAgICAgICAgICAgICAgIHNwb3QuX2Nvb2tpZVRyYW5zZm9ybVVuaWZvcm1bM10gPSBzcG90Ll9jb29raWVUcmFuc2Zvcm0udztcbiAgICAgICAgICAgICAgICB0aGlzLmxpZ2h0Q29va2llTWF0cml4SWRbY250XS5zZXRWYWx1ZShzcG90Ll9jb29raWVUcmFuc2Zvcm1Vbmlmb3JtKTtcbiAgICAgICAgICAgICAgICBzcG90Ll9jb29raWVPZmZzZXRVbmlmb3JtWzBdID0gc3BvdC5fY29va2llT2Zmc2V0Lng7XG4gICAgICAgICAgICAgICAgc3BvdC5fY29va2llT2Zmc2V0VW5pZm9ybVsxXSA9IHNwb3QuX2Nvb2tpZU9mZnNldC55O1xuICAgICAgICAgICAgICAgIHRoaXMubGlnaHRDb29raWVPZmZzZXRJZFtjbnRdLnNldFZhbHVlKHNwb3QuX2Nvb2tpZU9mZnNldFVuaWZvcm0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgZGlzcGF0Y2hMb2NhbExpZ2h0cyhzb3J0ZWRMaWdodHMsIHNjZW5lLCBtYXNrLCB1c2VkRGlyTGlnaHRzKSB7XG5cbiAgICAgICAgbGV0IGNudCA9IHVzZWREaXJMaWdodHM7XG4gICAgICAgIGNvbnN0IHNjb3BlID0gdGhpcy5kZXZpY2Uuc2NvcGU7XG5cbiAgICAgICAgY29uc3Qgb21uaXMgPSBzb3J0ZWRMaWdodHNbTElHSFRUWVBFX09NTkldO1xuICAgICAgICBjb25zdCBudW1PbW5pcyA9IG9tbmlzLmxlbmd0aDtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBudW1PbW5pczsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBvbW5pID0gb21uaXNbaV07XG4gICAgICAgICAgICBpZiAoIShvbW5pLm1hc2sgJiBtYXNrKSkgY29udGludWU7XG4gICAgICAgICAgICB0aGlzLmRpc3BhdGNoT21uaUxpZ2h0KHNjZW5lLCBzY29wZSwgb21uaSwgY250KTtcbiAgICAgICAgICAgIGNudCsrO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3Qgc3B0cyA9IHNvcnRlZExpZ2h0c1tMSUdIVFRZUEVfU1BPVF07XG4gICAgICAgIGNvbnN0IG51bVNwdHMgPSBzcHRzLmxlbmd0aDtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBudW1TcHRzOyBpKyspIHtcbiAgICAgICAgICAgIGNvbnN0IHNwb3QgPSBzcHRzW2ldO1xuICAgICAgICAgICAgaWYgKCEoc3BvdC5tYXNrICYgbWFzaykpIGNvbnRpbnVlO1xuICAgICAgICAgICAgdGhpcy5kaXNwYXRjaFNwb3RMaWdodChzY2VuZSwgc2NvcGUsIHNwb3QsIGNudCk7XG4gICAgICAgICAgICBjbnQrKztcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIGV4ZWN1dGUgZmlyc3QgcGFzcyBvdmVyIGRyYXcgY2FsbHMsIGluIG9yZGVyIHRvIHVwZGF0ZSBtYXRlcmlhbHMgLyBzaGFkZXJzXG4gICAgcmVuZGVyRm9yd2FyZFByZXBhcmVNYXRlcmlhbHMoY2FtZXJhLCBkcmF3Q2FsbHMsIHNvcnRlZExpZ2h0cywgbGF5ZXIsIHBhc3MpIHtcblxuICAgICAgICBjb25zdCBhZGRDYWxsID0gKGRyYXdDYWxsLCBzaGFkZXJJbnN0YW5jZSwgaXNOZXdNYXRlcmlhbCwgbGlnaHRNYXNrQ2hhbmdlZCkgPT4ge1xuICAgICAgICAgICAgX2RyYXdDYWxsTGlzdC5kcmF3Q2FsbHMucHVzaChkcmF3Q2FsbCk7XG4gICAgICAgICAgICBfZHJhd0NhbGxMaXN0LnNoYWRlckluc3RhbmNlcy5wdXNoKHNoYWRlckluc3RhbmNlKTtcbiAgICAgICAgICAgIF9kcmF3Q2FsbExpc3QuaXNOZXdNYXRlcmlhbC5wdXNoKGlzTmV3TWF0ZXJpYWwpO1xuICAgICAgICAgICAgX2RyYXdDYWxsTGlzdC5saWdodE1hc2tDaGFuZ2VkLnB1c2gobGlnaHRNYXNrQ2hhbmdlZCk7XG4gICAgICAgIH07XG5cbiAgICAgICAgLy8gc3RhcnQgd2l0aCBlbXB0eSBhcnJheXNcbiAgICAgICAgX2RyYXdDYWxsTGlzdC5jbGVhcigpO1xuXG4gICAgICAgIGNvbnN0IGRldmljZSA9IHRoaXMuZGV2aWNlO1xuICAgICAgICBjb25zdCBzY2VuZSA9IHRoaXMuc2NlbmU7XG4gICAgICAgIGNvbnN0IGNsdXN0ZXJlZExpZ2h0aW5nRW5hYmxlZCA9IHNjZW5lLmNsdXN0ZXJlZExpZ2h0aW5nRW5hYmxlZDtcbiAgICAgICAgY29uc3QgbGlnaHRIYXNoID0gbGF5ZXI/LmdldExpZ2h0SGFzaChjbHVzdGVyZWRMaWdodGluZ0VuYWJsZWQpID8/IDA7XG4gICAgICAgIGxldCBwcmV2TWF0ZXJpYWwgPSBudWxsLCBwcmV2T2JqRGVmcywgcHJldkxpZ2h0TWFzaztcblxuICAgICAgICBjb25zdCBkcmF3Q2FsbHNDb3VudCA9IGRyYXdDYWxscy5sZW5ndGg7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZHJhd0NhbGxzQ291bnQ7IGkrKykge1xuXG4gICAgICAgICAgICAvKiogQHR5cGUge2ltcG9ydCgnLi4vbWVzaC1pbnN0YW5jZS5qcycpLk1lc2hJbnN0YW5jZX0gKi9cbiAgICAgICAgICAgIGNvbnN0IGRyYXdDYWxsID0gZHJhd0NhbGxzW2ldO1xuXG4gICAgICAgICAgICAvLyAjaWYgX1BST0ZJTEVSXG4gICAgICAgICAgICBpZiAoY2FtZXJhID09PSBGb3J3YXJkUmVuZGVyZXIuc2tpcFJlbmRlckNhbWVyYSkge1xuICAgICAgICAgICAgICAgIGlmIChGb3J3YXJkUmVuZGVyZXIuX3NraXBSZW5kZXJDb3VudGVyID49IEZvcndhcmRSZW5kZXJlci5za2lwUmVuZGVyQWZ0ZXIpXG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIEZvcndhcmRSZW5kZXJlci5fc2tpcFJlbmRlckNvdW50ZXIrKztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChsYXllcikge1xuICAgICAgICAgICAgICAgIGlmIChsYXllci5fc2tpcFJlbmRlckNvdW50ZXIgPj0gbGF5ZXIuc2tpcFJlbmRlckFmdGVyKVxuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICBsYXllci5fc2tpcFJlbmRlckNvdW50ZXIrKztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vICNlbmRpZlxuXG4gICAgICAgICAgICBkcmF3Q2FsbC5lbnN1cmVNYXRlcmlhbChkZXZpY2UpO1xuICAgICAgICAgICAgY29uc3QgbWF0ZXJpYWwgPSBkcmF3Q2FsbC5tYXRlcmlhbDtcblxuICAgICAgICAgICAgY29uc3Qgb2JqRGVmcyA9IGRyYXdDYWxsLl9zaGFkZXJEZWZzO1xuICAgICAgICAgICAgY29uc3QgbGlnaHRNYXNrID0gZHJhd0NhbGwubWFzaztcblxuICAgICAgICAgICAgaWYgKG1hdGVyaWFsICYmIG1hdGVyaWFsID09PSBwcmV2TWF0ZXJpYWwgJiYgb2JqRGVmcyAhPT0gcHJldk9iakRlZnMpIHtcbiAgICAgICAgICAgICAgICBwcmV2TWF0ZXJpYWwgPSBudWxsOyAvLyBmb3JjZSBjaGFuZ2Ugc2hhZGVyIGlmIHRoZSBvYmplY3QgdXNlcyBhIGRpZmZlcmVudCB2YXJpYW50IG9mIHRoZSBzYW1lIG1hdGVyaWFsXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChtYXRlcmlhbCAhPT0gcHJldk1hdGVyaWFsKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fbWF0ZXJpYWxTd2l0Y2hlcysrO1xuICAgICAgICAgICAgICAgIG1hdGVyaWFsLl9zY2VuZSA9IHNjZW5lO1xuXG4gICAgICAgICAgICAgICAgaWYgKG1hdGVyaWFsLmRpcnR5KSB7XG4gICAgICAgICAgICAgICAgICAgIG1hdGVyaWFsLnVwZGF0ZVVuaWZvcm1zKGRldmljZSwgc2NlbmUpO1xuICAgICAgICAgICAgICAgICAgICBtYXRlcmlhbC5kaXJ0eSA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gbWFya2VyIHRvIGFsbG93IHVzIHRvIHNlZSB0aGUgc291cmNlIG5vZGUgZm9yIHNoYWRlciBhbGxvY1xuICAgICAgICAgICAgRGVidWdHcmFwaGljcy5wdXNoR3B1TWFya2VyKGRldmljZSwgYE5vZGU6ICR7ZHJhd0NhbGwubm9kZS5uYW1lfWApO1xuXG4gICAgICAgICAgICBjb25zdCBzaGFkZXJJbnN0YW5jZSA9IGRyYXdDYWxsLmdldFNoYWRlckluc3RhbmNlKHBhc3MsIGxpZ2h0SGFzaCwgc2NlbmUsIHRoaXMudmlld1VuaWZvcm1Gb3JtYXQsIHRoaXMudmlld0JpbmRHcm91cEZvcm1hdCwgc29ydGVkTGlnaHRzKTtcblxuICAgICAgICAgICAgRGVidWdHcmFwaGljcy5wb3BHcHVNYXJrZXIoZGV2aWNlKTtcblxuICAgICAgICAgICAgYWRkQ2FsbChkcmF3Q2FsbCwgc2hhZGVySW5zdGFuY2UsIG1hdGVyaWFsICE9PSBwcmV2TWF0ZXJpYWwsICFwcmV2TWF0ZXJpYWwgfHwgbGlnaHRNYXNrICE9PSBwcmV2TGlnaHRNYXNrKTtcblxuICAgICAgICAgICAgcHJldk1hdGVyaWFsID0gbWF0ZXJpYWw7XG4gICAgICAgICAgICBwcmV2T2JqRGVmcyA9IG9iakRlZnM7XG4gICAgICAgICAgICBwcmV2TGlnaHRNYXNrID0gbGlnaHRNYXNrO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gcHJvY2VzcyB0aGUgYmF0Y2ggb2Ygc2hhZGVycyBjcmVhdGVkIGhlcmVcbiAgICAgICAgZGV2aWNlLmVuZFNoYWRlckJhdGNoPy4oKTtcblxuICAgICAgICByZXR1cm4gX2RyYXdDYWxsTGlzdDtcbiAgICB9XG5cbiAgICByZW5kZXJGb3J3YXJkSW50ZXJuYWwoY2FtZXJhLCBwcmVwYXJlZENhbGxzLCBzb3J0ZWRMaWdodHMsIHBhc3MsIGRyYXdDYWxsYmFjaywgZmxpcEZhY2VzKSB7XG4gICAgICAgIGNvbnN0IGRldmljZSA9IHRoaXMuZGV2aWNlO1xuICAgICAgICBjb25zdCBzY2VuZSA9IHRoaXMuc2NlbmU7XG4gICAgICAgIGNvbnN0IHBhc3NGbGFnID0gMSA8PCBwYXNzO1xuICAgICAgICBjb25zdCBmbGlwRmFjdG9yID0gZmxpcEZhY2VzID8gLTEgOiAxO1xuICAgICAgICBjb25zdCBjbHVzdGVyZWRMaWdodGluZ0VuYWJsZWQgPSB0aGlzLnNjZW5lLmNsdXN0ZXJlZExpZ2h0aW5nRW5hYmxlZDtcblxuICAgICAgICAvLyBSZW5kZXIgdGhlIHNjZW5lXG4gICAgICAgIGxldCBza2lwTWF0ZXJpYWwgPSBmYWxzZTtcbiAgICAgICAgY29uc3QgcHJlcGFyZWRDYWxsc0NvdW50ID0gcHJlcGFyZWRDYWxscy5kcmF3Q2FsbHMubGVuZ3RoO1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHByZXBhcmVkQ2FsbHNDb3VudDsgaSsrKSB7XG5cbiAgICAgICAgICAgIGNvbnN0IGRyYXdDYWxsID0gcHJlcGFyZWRDYWxscy5kcmF3Q2FsbHNbaV07XG5cbiAgICAgICAgICAgIC8vIFdlIGhhdmUgYSBtZXNoIGluc3RhbmNlXG4gICAgICAgICAgICBjb25zdCBuZXdNYXRlcmlhbCA9IHByZXBhcmVkQ2FsbHMuaXNOZXdNYXRlcmlhbFtpXTtcbiAgICAgICAgICAgIGNvbnN0IGxpZ2h0TWFza0NoYW5nZWQgPSBwcmVwYXJlZENhbGxzLmxpZ2h0TWFza0NoYW5nZWRbaV07XG4gICAgICAgICAgICBjb25zdCBzaGFkZXJJbnN0YW5jZSA9IHByZXBhcmVkQ2FsbHMuc2hhZGVySW5zdGFuY2VzW2ldO1xuICAgICAgICAgICAgY29uc3QgbWF0ZXJpYWwgPSBkcmF3Q2FsbC5tYXRlcmlhbDtcbiAgICAgICAgICAgIGNvbnN0IG9iakRlZnMgPSBkcmF3Q2FsbC5fc2hhZGVyRGVmcztcbiAgICAgICAgICAgIGNvbnN0IGxpZ2h0TWFzayA9IGRyYXdDYWxsLm1hc2s7XG5cbiAgICAgICAgICAgIGlmIChuZXdNYXRlcmlhbCkge1xuXG4gICAgICAgICAgICAgICAgY29uc3Qgc2hhZGVyID0gc2hhZGVySW5zdGFuY2Uuc2hhZGVyO1xuICAgICAgICAgICAgICAgIGlmICghc2hhZGVyLmZhaWxlZCAmJiAhZGV2aWNlLnNldFNoYWRlcihzaGFkZXIpKSB7XG4gICAgICAgICAgICAgICAgICAgIERlYnVnLmVycm9yKGBFcnJvciBjb21waWxpbmcgc2hhZGVyIFske3NoYWRlci5sYWJlbH1dIGZvciBtYXRlcmlhbD0ke21hdGVyaWFsLm5hbWV9IHBhc3M9JHtwYXNzfSBvYmpEZWZzPSR7b2JqRGVmc31gLCBtYXRlcmlhbCk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gc2tpcCByZW5kZXJpbmcgd2l0aCB0aGUgbWF0ZXJpYWwgaWYgc2hhZGVyIGZhaWxlZFxuICAgICAgICAgICAgICAgIHNraXBNYXRlcmlhbCA9IHNoYWRlci5mYWlsZWQ7XG4gICAgICAgICAgICAgICAgaWYgKHNraXBNYXRlcmlhbClcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgICAgICBEZWJ1Z0dyYXBoaWNzLnB1c2hHcHVNYXJrZXIoZGV2aWNlLCBgTWF0ZXJpYWw6ICR7bWF0ZXJpYWwubmFtZX1gKTtcblxuICAgICAgICAgICAgICAgIC8vIFVuaWZvcm1zIEk6IG1hdGVyaWFsXG4gICAgICAgICAgICAgICAgbWF0ZXJpYWwuc2V0UGFyYW1ldGVycyhkZXZpY2UpO1xuXG4gICAgICAgICAgICAgICAgaWYgKGxpZ2h0TWFza0NoYW5nZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdXNlZERpckxpZ2h0cyA9IHRoaXMuZGlzcGF0Y2hEaXJlY3RMaWdodHMoc29ydGVkTGlnaHRzW0xJR0hUVFlQRV9ESVJFQ1RJT05BTF0sIHNjZW5lLCBsaWdodE1hc2ssIGNhbWVyYSk7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKCFjbHVzdGVyZWRMaWdodGluZ0VuYWJsZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZGlzcGF0Y2hMb2NhbExpZ2h0cyhzb3J0ZWRMaWdodHMsIHNjZW5lLCBsaWdodE1hc2ssIHVzZWREaXJMaWdodHMpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgdGhpcy5hbHBoYVRlc3RJZC5zZXRWYWx1ZShtYXRlcmlhbC5hbHBoYVRlc3QpO1xuXG4gICAgICAgICAgICAgICAgZGV2aWNlLnNldEJsZW5kU3RhdGUobWF0ZXJpYWwuYmxlbmRTdGF0ZSk7XG4gICAgICAgICAgICAgICAgZGV2aWNlLnNldERlcHRoU3RhdGUobWF0ZXJpYWwuZGVwdGhTdGF0ZSk7XG5cbiAgICAgICAgICAgICAgICBkZXZpY2Uuc2V0QWxwaGFUb0NvdmVyYWdlKG1hdGVyaWFsLmFscGhhVG9Db3ZlcmFnZSk7XG5cbiAgICAgICAgICAgICAgICBpZiAobWF0ZXJpYWwuZGVwdGhCaWFzIHx8IG1hdGVyaWFsLnNsb3BlRGVwdGhCaWFzKSB7XG4gICAgICAgICAgICAgICAgICAgIGRldmljZS5zZXREZXB0aEJpYXModHJ1ZSk7XG4gICAgICAgICAgICAgICAgICAgIGRldmljZS5zZXREZXB0aEJpYXNWYWx1ZXMobWF0ZXJpYWwuZGVwdGhCaWFzLCBtYXRlcmlhbC5zbG9wZURlcHRoQmlhcyk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgZGV2aWNlLnNldERlcHRoQmlhcyhmYWxzZSk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgRGVidWdHcmFwaGljcy5wb3BHcHVNYXJrZXIoZGV2aWNlKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgRGVidWdHcmFwaGljcy5wdXNoR3B1TWFya2VyKGRldmljZSwgYE5vZGU6ICR7ZHJhd0NhbGwubm9kZS5uYW1lfWApO1xuXG4gICAgICAgICAgICB0aGlzLnNldHVwQ3VsbE1vZGUoY2FtZXJhLl9jdWxsRmFjZXMsIGZsaXBGYWN0b3IsIGRyYXdDYWxsKTtcblxuICAgICAgICAgICAgY29uc3Qgc3RlbmNpbEZyb250ID0gZHJhd0NhbGwuc3RlbmNpbEZyb250ID8/IG1hdGVyaWFsLnN0ZW5jaWxGcm9udDtcbiAgICAgICAgICAgIGNvbnN0IHN0ZW5jaWxCYWNrID0gZHJhd0NhbGwuc3RlbmNpbEJhY2sgPz8gbWF0ZXJpYWwuc3RlbmNpbEJhY2s7XG4gICAgICAgICAgICBkZXZpY2Uuc2V0U3RlbmNpbFN0YXRlKHN0ZW5jaWxGcm9udCwgc3RlbmNpbEJhY2spO1xuXG4gICAgICAgICAgICBjb25zdCBtZXNoID0gZHJhd0NhbGwubWVzaDtcblxuICAgICAgICAgICAgLy8gVW5pZm9ybXMgSUk6IG1lc2hJbnN0YW5jZSBvdmVycmlkZXNcbiAgICAgICAgICAgIGRyYXdDYWxsLnNldFBhcmFtZXRlcnMoZGV2aWNlLCBwYXNzRmxhZyk7XG5cbiAgICAgICAgICAgIHRoaXMuc2V0VmVydGV4QnVmZmVycyhkZXZpY2UsIG1lc2gpO1xuICAgICAgICAgICAgdGhpcy5zZXRNb3JwaGluZyhkZXZpY2UsIGRyYXdDYWxsLm1vcnBoSW5zdGFuY2UpO1xuICAgICAgICAgICAgdGhpcy5zZXRTa2lubmluZyhkZXZpY2UsIGRyYXdDYWxsKTtcblxuICAgICAgICAgICAgdGhpcy5zZXR1cE1lc2hVbmlmb3JtQnVmZmVycyhzaGFkZXJJbnN0YW5jZSwgZHJhd0NhbGwpO1xuXG4gICAgICAgICAgICBjb25zdCBzdHlsZSA9IGRyYXdDYWxsLnJlbmRlclN0eWxlO1xuICAgICAgICAgICAgZGV2aWNlLnNldEluZGV4QnVmZmVyKG1lc2guaW5kZXhCdWZmZXJbc3R5bGVdKTtcblxuICAgICAgICAgICAgZHJhd0NhbGxiYWNrPy4oZHJhd0NhbGwsIGkpO1xuXG4gICAgICAgICAgICBpZiAoY2FtZXJhLnhyICYmIGNhbWVyYS54ci5zZXNzaW9uICYmIGNhbWVyYS54ci52aWV3cy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB2aWV3cyA9IGNhbWVyYS54ci52aWV3cztcblxuICAgICAgICAgICAgICAgIGZvciAobGV0IHYgPSAwOyB2IDwgdmlld3MubGVuZ3RoOyB2KyspIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdmlldyA9IHZpZXdzW3ZdO1xuXG4gICAgICAgICAgICAgICAgICAgIGRldmljZS5zZXRWaWV3cG9ydCh2aWV3LnZpZXdwb3J0LngsIHZpZXcudmlld3BvcnQueSwgdmlldy52aWV3cG9ydC56LCB2aWV3LnZpZXdwb3J0LncpO1xuXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucHJvaklkLnNldFZhbHVlKHZpZXcucHJvak1hdC5kYXRhKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wcm9qU2t5Ym94SWQuc2V0VmFsdWUodmlldy5wcm9qTWF0LmRhdGEpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnZpZXdJZC5zZXRWYWx1ZSh2aWV3LnZpZXdPZmZNYXQuZGF0YSk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMudmlld0ludklkLnNldFZhbHVlKHZpZXcudmlld0ludk9mZk1hdC5kYXRhKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy52aWV3SWQzLnNldFZhbHVlKHZpZXcudmlld01hdDMuZGF0YSk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMudmlld1Byb2pJZC5zZXRWYWx1ZSh2aWV3LnByb2pWaWV3T2ZmTWF0LmRhdGEpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnZpZXdQb3NJZC5zZXRWYWx1ZSh2aWV3LnBvc2l0aW9uKTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAodiA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5kcmF3SW5zdGFuY2UoZGV2aWNlLCBkcmF3Q2FsbCwgbWVzaCwgc3R5bGUsIHRydWUpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5kcmF3SW5zdGFuY2UyKGRldmljZSwgZHJhd0NhbGwsIG1lc2gsIHN0eWxlKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX2ZvcndhcmREcmF3Q2FsbHMrKztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMuZHJhd0luc3RhbmNlKGRldmljZSwgZHJhd0NhbGwsIG1lc2gsIHN0eWxlLCB0cnVlKTtcbiAgICAgICAgICAgICAgICB0aGlzLl9mb3J3YXJkRHJhd0NhbGxzKys7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIFVuc2V0IG1lc2hJbnN0YW5jZSBvdmVycmlkZXMgYmFjayB0byBtYXRlcmlhbCB2YWx1ZXMgaWYgbmV4dCBkcmF3IGNhbGwgd2lsbCB1c2UgdGhlIHNhbWUgbWF0ZXJpYWxcbiAgICAgICAgICAgIGlmIChpIDwgcHJlcGFyZWRDYWxsc0NvdW50IC0gMSAmJiAhcHJlcGFyZWRDYWxscy5pc05ld01hdGVyaWFsW2kgKyAxXSkge1xuICAgICAgICAgICAgICAgIG1hdGVyaWFsLnNldFBhcmFtZXRlcnMoZGV2aWNlLCBkcmF3Q2FsbC5wYXJhbWV0ZXJzKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgRGVidWdHcmFwaGljcy5wb3BHcHVNYXJrZXIoZGV2aWNlKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJlbmRlckZvcndhcmQoY2FtZXJhLCBhbGxEcmF3Q2FsbHMsIHNvcnRlZExpZ2h0cywgcGFzcywgZHJhd0NhbGxiYWNrLCBsYXllciwgZmxpcEZhY2VzKSB7XG5cbiAgICAgICAgLy8gI2lmIF9QUk9GSUxFUlxuICAgICAgICBjb25zdCBmb3J3YXJkU3RhcnRUaW1lID0gbm93KCk7XG4gICAgICAgIC8vICNlbmRpZlxuXG4gICAgICAgIC8vIHJ1biBmaXJzdCBwYXNzIG92ZXIgZHJhdyBjYWxscyBhbmQgaGFuZGxlIG1hdGVyaWFsIC8gc2hhZGVyIHVwZGF0ZXNcbiAgICAgICAgY29uc3QgcHJlcGFyZWRDYWxscyA9IHRoaXMucmVuZGVyRm9yd2FyZFByZXBhcmVNYXRlcmlhbHMoY2FtZXJhLCBhbGxEcmF3Q2FsbHMsIHNvcnRlZExpZ2h0cywgbGF5ZXIsIHBhc3MpO1xuXG4gICAgICAgIC8vIHJlbmRlciBtZXNoIGluc3RhbmNlc1xuICAgICAgICB0aGlzLnJlbmRlckZvcndhcmRJbnRlcm5hbChjYW1lcmEsIHByZXBhcmVkQ2FsbHMsIHNvcnRlZExpZ2h0cywgcGFzcywgZHJhd0NhbGxiYWNrLCBmbGlwRmFjZXMpO1xuXG4gICAgICAgIF9kcmF3Q2FsbExpc3QuY2xlYXIoKTtcblxuICAgICAgICAvLyAjaWYgX1BST0ZJTEVSXG4gICAgICAgIHRoaXMuX2ZvcndhcmRUaW1lICs9IG5vdygpIC0gZm9yd2FyZFN0YXJ0VGltZTtcbiAgICAgICAgLy8gI2VuZGlmXG4gICAgfVxuXG4gICAgc2V0U2NlbmVDb25zdGFudHMoKSB7XG4gICAgICAgIGNvbnN0IHNjZW5lID0gdGhpcy5zY2VuZTtcblxuICAgICAgICAvLyBTZXQgdXAgYW1iaWVudC9leHBvc3VyZVxuICAgICAgICB0aGlzLmRpc3BhdGNoR2xvYmFsTGlnaHRzKHNjZW5lKTtcblxuICAgICAgICAvLyBTZXQgdXAgdGhlIGZvZ1xuICAgICAgICBpZiAoc2NlbmUuZm9nICE9PSBGT0dfTk9ORSkge1xuICAgICAgICAgICAgdGhpcy5mb2dDb2xvclswXSA9IHNjZW5lLmZvZ0NvbG9yLnI7XG4gICAgICAgICAgICB0aGlzLmZvZ0NvbG9yWzFdID0gc2NlbmUuZm9nQ29sb3IuZztcbiAgICAgICAgICAgIHRoaXMuZm9nQ29sb3JbMl0gPSBzY2VuZS5mb2dDb2xvci5iO1xuICAgICAgICAgICAgaWYgKHNjZW5lLmdhbW1hQ29ycmVjdGlvbikge1xuICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgMzsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZm9nQ29sb3JbaV0gPSBNYXRoLnBvdyh0aGlzLmZvZ0NvbG9yW2ldLCAyLjIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuZm9nQ29sb3JJZC5zZXRWYWx1ZSh0aGlzLmZvZ0NvbG9yKTtcbiAgICAgICAgICAgIGlmIChzY2VuZS5mb2cgPT09IEZPR19MSU5FQVIpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmZvZ1N0YXJ0SWQuc2V0VmFsdWUoc2NlbmUuZm9nU3RhcnQpO1xuICAgICAgICAgICAgICAgIHRoaXMuZm9nRW5kSWQuc2V0VmFsdWUoc2NlbmUuZm9nRW5kKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5mb2dEZW5zaXR5SWQuc2V0VmFsdWUoc2NlbmUuZm9nRGVuc2l0eSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBTZXQgdXAgc2NyZWVuIHNpemUgLy8gc2hvdWxkIGJlIFJUIHNpemU/XG4gICAgICAgIGNvbnN0IGRldmljZSA9IHRoaXMuZGV2aWNlO1xuICAgICAgICB0aGlzLl9zY3JlZW5TaXplWzBdID0gZGV2aWNlLndpZHRoO1xuICAgICAgICB0aGlzLl9zY3JlZW5TaXplWzFdID0gZGV2aWNlLmhlaWdodDtcbiAgICAgICAgdGhpcy5fc2NyZWVuU2l6ZVsyXSA9IDEgLyBkZXZpY2Uud2lkdGg7XG4gICAgICAgIHRoaXMuX3NjcmVlblNpemVbM10gPSAxIC8gZGV2aWNlLmhlaWdodDtcbiAgICAgICAgdGhpcy5zY3JlZW5TaXplSWQuc2V0VmFsdWUodGhpcy5fc2NyZWVuU2l6ZSk7XG5cbiAgICAgICAgdGhpcy5wY3NzRGlza1NhbXBsZXNJZC5zZXRWYWx1ZSh0aGlzLnBjc3NEaXNrU2FtcGxlcyk7XG4gICAgICAgIHRoaXMucGNzc1NwaGVyZVNhbXBsZXNJZC5zZXRWYWx1ZSh0aGlzLnBjc3NTcGhlcmVTYW1wbGVzKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBCdWlsZHMgYSBmcmFtZSBncmFwaCBmb3IgdGhlIHJlbmRlcmluZyBvZiB0aGUgd2hvbGUgZnJhbWUuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi4vZnJhbWUtZ3JhcGguanMnKS5GcmFtZUdyYXBofSBmcmFtZUdyYXBoIC0gVGhlIGZyYW1lLWdyYXBoIHRoYXQgaXMgYnVpbHQuXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4uL2NvbXBvc2l0aW9uL2xheWVyLWNvbXBvc2l0aW9uLmpzJykuTGF5ZXJDb21wb3NpdGlvbn0gbGF5ZXJDb21wb3NpdGlvbiAtIFRoZVxuICAgICAqIGxheWVyIGNvbXBvc2l0aW9uIHVzZWQgdG8gYnVpbGQgdGhlIGZyYW1lIGdyYXBoLlxuICAgICAqIEBpZ25vcmVcbiAgICAgKi9cbiAgICBidWlsZEZyYW1lR3JhcGgoZnJhbWVHcmFwaCwgbGF5ZXJDb21wb3NpdGlvbikge1xuXG4gICAgICAgIGNvbnN0IGNsdXN0ZXJlZExpZ2h0aW5nRW5hYmxlZCA9IHRoaXMuc2NlbmUuY2x1c3RlcmVkTGlnaHRpbmdFbmFibGVkO1xuICAgICAgICBmcmFtZUdyYXBoLnJlc2V0KCk7XG5cbiAgICAgICAgdGhpcy51cGRhdGUobGF5ZXJDb21wb3NpdGlvbik7XG5cbiAgICAgICAgLy8gY2x1c3RlcmVkIGxpZ2h0aW5nIHJlbmRlciBwYXNzZXNcbiAgICAgICAgaWYgKGNsdXN0ZXJlZExpZ2h0aW5nRW5hYmxlZCkge1xuXG4gICAgICAgICAgICAvLyBjb29raWVzXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVuZGVyUGFzcyA9IG5ldyBSZW5kZXJQYXNzKHRoaXMuZGV2aWNlLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIC8vIHJlbmRlciBjb29raWVzIGZvciBhbGwgbG9jYWwgdmlzaWJsZSBsaWdodHNcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuc2NlbmUubGlnaHRpbmcuY29va2llc0VuYWJsZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucmVuZGVyQ29va2llcyh0aGlzLmxpZ2h0cyk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICByZW5kZXJQYXNzLnJlcXVpcmVzQ3ViZW1hcHMgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBEZWJ1Z0hlbHBlci5zZXROYW1lKHJlbmRlclBhc3MsICdDbHVzdGVyZWRDb29raWVzJyk7XG4gICAgICAgICAgICAgICAgZnJhbWVHcmFwaC5hZGRSZW5kZXJQYXNzKHJlbmRlclBhc3MpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBsb2NhbCBzaGFkb3dzIC0gdGhlc2UgYXJlIHNoYXJlZCBieSBhbGwgY2FtZXJhcyAobm90IGVudGlyZWx5IGNvcnJlY3RseSlcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBjb25zdCByZW5kZXJQYXNzID0gbmV3IFJlbmRlclBhc3ModGhpcy5kZXZpY2UpO1xuICAgICAgICAgICAgICAgIERlYnVnSGVscGVyLnNldE5hbWUocmVuZGVyUGFzcywgJ0NsdXN0ZXJlZExvY2FsU2hhZG93cycpO1xuICAgICAgICAgICAgICAgIHJlbmRlclBhc3MucmVxdWlyZXNDdWJlbWFwcyA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIGZyYW1lR3JhcGguYWRkUmVuZGVyUGFzcyhyZW5kZXJQYXNzKTtcblxuICAgICAgICAgICAgICAgIC8vIHJlbmRlciBzaGFkb3dzIG9ubHkgd2hlbiBuZWVkZWRcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5zY2VuZS5saWdodGluZy5zaGFkb3dzRW5hYmxlZCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9zaGFkb3dSZW5kZXJlckxvY2FsLnByZXBhcmVDbHVzdGVyZWRSZW5kZXJQYXNzKHJlbmRlclBhc3MsIHRoaXMubG9jYWxMaWdodHMpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIHVwZGF0ZSBjbHVzdGVycyBhbGwgdGhlIHRpbWVcbiAgICAgICAgICAgICAgICByZW5kZXJQYXNzLl9hZnRlciA9ICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy51cGRhdGVDbHVzdGVycyhsYXllckNvbXBvc2l0aW9uKTtcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgIH0gZWxzZSB7XG5cbiAgICAgICAgICAgIC8vIG5vbi1jbHVzdGVyZWQgbG9jYWwgc2hhZG93cyAtIHRoZXNlIGFyZSBzaGFyZWQgYnkgYWxsIGNhbWVyYXMgKG5vdCBlbnRpcmVseSBjb3JyZWN0bHkpXG4gICAgICAgICAgICB0aGlzLl9zaGFkb3dSZW5kZXJlckxvY2FsLmJ1aWxkTm9uQ2x1c3RlcmVkUmVuZGVyUGFzc2VzKGZyYW1lR3JhcGgsIHRoaXMubG9jYWxMaWdodHMpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gbWFpbiBwYXNzZXNcbiAgICAgICAgbGV0IHN0YXJ0SW5kZXggPSAwO1xuICAgICAgICBsZXQgbmV3U3RhcnQgPSB0cnVlO1xuICAgICAgICBsZXQgcmVuZGVyVGFyZ2V0ID0gbnVsbDtcbiAgICAgICAgY29uc3QgcmVuZGVyQWN0aW9ucyA9IGxheWVyQ29tcG9zaXRpb24uX3JlbmRlckFjdGlvbnM7XG5cbiAgICAgICAgZm9yIChsZXQgaSA9IHN0YXJ0SW5kZXg7IGkgPCByZW5kZXJBY3Rpb25zLmxlbmd0aDsgaSsrKSB7XG5cbiAgICAgICAgICAgIGNvbnN0IHJlbmRlckFjdGlvbiA9IHJlbmRlckFjdGlvbnNbaV07XG4gICAgICAgICAgICBjb25zdCBsYXllciA9IGxheWVyQ29tcG9zaXRpb24ubGF5ZXJMaXN0W3JlbmRlckFjdGlvbi5sYXllckluZGV4XTtcbiAgICAgICAgICAgIGNvbnN0IGNhbWVyYSA9IGxheWVyLmNhbWVyYXNbcmVuZGVyQWN0aW9uLmNhbWVyYUluZGV4XTtcblxuICAgICAgICAgICAgLy8gc2tpcCBkaXNhYmxlZCBsYXllcnNcbiAgICAgICAgICAgIGlmICghcmVuZGVyQWN0aW9uLmlzTGF5ZXJFbmFibGVkKGxheWVyQ29tcG9zaXRpb24pKSB7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IGlzRGVwdGhMYXllciA9IGxheWVyLmlkID09PSBMQVlFUklEX0RFUFRIO1xuICAgICAgICAgICAgY29uc3QgaXNHcmFiUGFzcyA9IGlzRGVwdGhMYXllciAmJiAoY2FtZXJhLnJlbmRlclNjZW5lQ29sb3JNYXAgfHwgY2FtZXJhLnJlbmRlclNjZW5lRGVwdGhNYXApO1xuXG4gICAgICAgICAgICAvLyBkaXJlY3Rpb25hbCBzaGFkb3dzIGdldCByZS1yZW5kZXJlZCBmb3IgZWFjaCBjYW1lcmFcbiAgICAgICAgICAgIGlmIChyZW5kZXJBY3Rpb24uaGFzRGlyZWN0aW9uYWxTaGFkb3dMaWdodHMgJiYgY2FtZXJhKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fc2hhZG93UmVuZGVyZXJEaXJlY3Rpb25hbC5idWlsZEZyYW1lR3JhcGgoZnJhbWVHcmFwaCwgcmVuZGVyQWN0aW9uLmRpcmVjdGlvbmFsTGlnaHRzLCBjYW1lcmEpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBzdGFydCBvZiBibG9jayBvZiByZW5kZXIgYWN0aW9ucyByZW5kZXJpbmcgdG8gdGhlIHNhbWUgcmVuZGVyIHRhcmdldFxuICAgICAgICAgICAgaWYgKG5ld1N0YXJ0KSB7XG4gICAgICAgICAgICAgICAgbmV3U3RhcnQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBzdGFydEluZGV4ID0gaTtcbiAgICAgICAgICAgICAgICByZW5kZXJUYXJnZXQgPSByZW5kZXJBY3Rpb24ucmVuZGVyVGFyZ2V0O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBmaW5kIHRoZSBuZXh0IGVuYWJsZWQgcmVuZGVyIGFjdGlvblxuICAgICAgICAgICAgbGV0IG5leHRJbmRleCA9IGkgKyAxO1xuICAgICAgICAgICAgd2hpbGUgKHJlbmRlckFjdGlvbnNbbmV4dEluZGV4XSAmJiAhcmVuZGVyQWN0aW9uc1tuZXh0SW5kZXhdLmlzTGF5ZXJFbmFibGVkKGxheWVyQ29tcG9zaXRpb24pKSB7XG4gICAgICAgICAgICAgICAgbmV4dEluZGV4Kys7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIGluZm8gYWJvdXQgdGhlIG5leHQgcmVuZGVyIGFjdGlvblxuICAgICAgICAgICAgY29uc3QgbmV4dFJlbmRlckFjdGlvbiA9IHJlbmRlckFjdGlvbnNbbmV4dEluZGV4XTtcbiAgICAgICAgICAgIGNvbnN0IGlzTmV4dExheWVyRGVwdGggPSBuZXh0UmVuZGVyQWN0aW9uID8gbGF5ZXJDb21wb3NpdGlvbi5sYXllckxpc3RbbmV4dFJlbmRlckFjdGlvbi5sYXllckluZGV4XS5pZCA9PT0gTEFZRVJJRF9ERVBUSCA6IGZhbHNlO1xuICAgICAgICAgICAgY29uc3QgaXNOZXh0TGF5ZXJHcmFiUGFzcyA9IGlzTmV4dExheWVyRGVwdGggJiYgKGNhbWVyYS5yZW5kZXJTY2VuZUNvbG9yTWFwIHx8IGNhbWVyYS5yZW5kZXJTY2VuZURlcHRoTWFwKTtcblxuICAgICAgICAgICAgLy8gZW5kIG9mIHRoZSBibG9jayB1c2luZyB0aGUgc2FtZSByZW5kZXIgdGFyZ2V0XG4gICAgICAgICAgICBpZiAoIW5leHRSZW5kZXJBY3Rpb24gfHwgbmV4dFJlbmRlckFjdGlvbi5yZW5kZXJUYXJnZXQgIT09IHJlbmRlclRhcmdldCB8fFxuICAgICAgICAgICAgICAgIG5leHRSZW5kZXJBY3Rpb24uaGFzRGlyZWN0aW9uYWxTaGFkb3dMaWdodHMgfHwgaXNOZXh0TGF5ZXJHcmFiUGFzcyB8fCBpc0dyYWJQYXNzKSB7XG5cbiAgICAgICAgICAgICAgICAvLyByZW5kZXIgdGhlIHJlbmRlciBhY3Rpb25zIGluIHRoZSByYW5nZVxuICAgICAgICAgICAgICAgIHRoaXMuYWRkTWFpblJlbmRlclBhc3MoZnJhbWVHcmFwaCwgbGF5ZXJDb21wb3NpdGlvbiwgcmVuZGVyVGFyZ2V0LCBzdGFydEluZGV4LCBpLCBpc0dyYWJQYXNzKTtcblxuICAgICAgICAgICAgICAgIC8vIHBvc3Rwcm9jZXNzaW5nXG4gICAgICAgICAgICAgICAgaWYgKHJlbmRlckFjdGlvbi50cmlnZ2VyUG9zdHByb2Nlc3MgJiYgY2FtZXJhPy5vblBvc3Rwcm9jZXNzaW5nKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlbmRlclBhc3MgPSBuZXcgUmVuZGVyUGFzcyh0aGlzLmRldmljZSwgKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJQYXNzUG9zdHByb2Nlc3NpbmcocmVuZGVyQWN0aW9uLCBsYXllckNvbXBvc2l0aW9uKTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHJlbmRlclBhc3MucmVxdWlyZXNDdWJlbWFwcyA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICBEZWJ1Z0hlbHBlci5zZXROYW1lKHJlbmRlclBhc3MsIGBQb3N0cHJvY2Vzc2ApO1xuICAgICAgICAgICAgICAgICAgICBmcmFtZUdyYXBoLmFkZFJlbmRlclBhc3MocmVuZGVyUGFzcyk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgbmV3U3RhcnQgPSB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4uL2ZyYW1lLWdyYXBoLmpzJykuRnJhbWVHcmFwaH0gZnJhbWVHcmFwaCAtIFRoZSBmcmFtZSBncmFwaC5cbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi4vY29tcG9zaXRpb24vbGF5ZXItY29tcG9zaXRpb24uanMnKS5MYXllckNvbXBvc2l0aW9ufSBsYXllckNvbXBvc2l0aW9uIC0gVGhlXG4gICAgICogbGF5ZXIgY29tcG9zaXRpb24uXG4gICAgICovXG4gICAgYWRkTWFpblJlbmRlclBhc3MoZnJhbWVHcmFwaCwgbGF5ZXJDb21wb3NpdGlvbiwgcmVuZGVyVGFyZ2V0LCBzdGFydEluZGV4LCBlbmRJbmRleCwgaXNHcmFiUGFzcykge1xuXG4gICAgICAgIC8vIHJlbmRlciB0aGUgcmVuZGVyIGFjdGlvbnMgaW4gdGhlIHJhbmdlXG4gICAgICAgIGNvbnN0IHJhbmdlID0geyBzdGFydDogc3RhcnRJbmRleCwgZW5kOiBlbmRJbmRleCB9O1xuICAgICAgICBjb25zdCByZW5kZXJQYXNzID0gbmV3IFJlbmRlclBhc3ModGhpcy5kZXZpY2UsICgpID0+IHtcbiAgICAgICAgICAgIHRoaXMucmVuZGVyUGFzc1JlbmRlckFjdGlvbnMobGF5ZXJDb21wb3NpdGlvbiwgcmFuZ2UpO1xuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCByZW5kZXJBY3Rpb25zID0gbGF5ZXJDb21wb3NpdGlvbi5fcmVuZGVyQWN0aW9ucztcbiAgICAgICAgY29uc3Qgc3RhcnRSZW5kZXJBY3Rpb24gPSByZW5kZXJBY3Rpb25zW3N0YXJ0SW5kZXhdO1xuICAgICAgICBjb25zdCBlbmRSZW5kZXJBY3Rpb24gPSByZW5kZXJBY3Rpb25zW2VuZEluZGV4XTtcbiAgICAgICAgY29uc3Qgc3RhcnRMYXllciA9IGxheWVyQ29tcG9zaXRpb24ubGF5ZXJMaXN0W3N0YXJ0UmVuZGVyQWN0aW9uLmxheWVySW5kZXhdO1xuICAgICAgICBjb25zdCBjYW1lcmEgPSBzdGFydExheWVyLmNhbWVyYXNbc3RhcnRSZW5kZXJBY3Rpb24uY2FtZXJhSW5kZXhdO1xuXG4gICAgICAgIGlmIChjYW1lcmEpIHtcblxuICAgICAgICAgICAgLy8gY2FsbGJhY2sgb24gdGhlIGNhbWVyYSBjb21wb25lbnQgYmVmb3JlIHJlbmRlcmluZyB3aXRoIHRoaXMgY2FtZXJhIGZvciB0aGUgZmlyc3QgdGltZVxuICAgICAgICAgICAgaWYgKHN0YXJ0UmVuZGVyQWN0aW9uLmZpcnN0Q2FtZXJhVXNlICYmIGNhbWVyYS5vblByZVJlbmRlcikge1xuICAgICAgICAgICAgICAgIHJlbmRlclBhc3MuX2JlZm9yZSA9ICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY2FtZXJhLm9uUHJlUmVuZGVyKCk7XG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gY2FsbGJhY2sgb24gdGhlIGNhbWVyYSBjb21wb25lbnQgd2hlbiB3ZSdyZSBkb25lIHJlbmRlcmluZyB3aXRoIHRoaXMgY2FtZXJhXG4gICAgICAgICAgICBpZiAoZW5kUmVuZGVyQWN0aW9uLmxhc3RDYW1lcmFVc2UgJiYgY2FtZXJhLm9uUG9zdFJlbmRlcikge1xuICAgICAgICAgICAgICAgIHJlbmRlclBhc3MuX2FmdGVyID0gKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjYW1lcmEub25Qb3N0UmVuZGVyKCk7XG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGRlcHRoIGdyYWIgcGFzcyBvbiB3ZWJnbDEgaXMgbm9ybWFsIHJlbmRlciBwYXNzIChzY2VuZSBnZXRzIHJlLXJlbmRlcmVkKVxuICAgICAgICBjb25zdCBncmFiUGFzc1JlcXVpcmVkID0gaXNHcmFiUGFzcyAmJiBTY2VuZUdyYWIucmVxdWlyZXNSZW5kZXJQYXNzKHRoaXMuZGV2aWNlLCBjYW1lcmEpO1xuICAgICAgICBjb25zdCBpc1JlYWxQYXNzID0gIWlzR3JhYlBhc3MgfHwgZ3JhYlBhc3NSZXF1aXJlZDtcblxuICAgICAgICBpZiAoaXNSZWFsUGFzcykge1xuXG4gICAgICAgICAgICByZW5kZXJQYXNzLmluaXQocmVuZGVyVGFyZ2V0KTtcbiAgICAgICAgICAgIHJlbmRlclBhc3MuZnVsbFNpemVDbGVhclJlY3QgPSBjYW1lcmEuY2FtZXJhLmZ1bGxTaXplQ2xlYXJSZWN0O1xuXG4gICAgICAgICAgICBpZiAoZ3JhYlBhc3NSZXF1aXJlZCkge1xuXG4gICAgICAgICAgICAgICAgLy8gd2ViZ2wxIGRlcHRoIHJlbmRlcmluZyBjbGVhciB2YWx1ZXNcbiAgICAgICAgICAgICAgICByZW5kZXJQYXNzLnNldENsZWFyQ29sb3Iod2ViZ2wxRGVwdGhDbGVhckNvbG9yKTtcbiAgICAgICAgICAgICAgICByZW5kZXJQYXNzLnNldENsZWFyRGVwdGgoMS4wKTtcblxuICAgICAgICAgICAgfSBlbHNlIGlmIChyZW5kZXJQYXNzLmZ1bGxTaXplQ2xlYXJSZWN0KSB7IC8vIGlmIGNhbWVyYSByZW5kZXJpbmcgY292ZXJzIHRoZSBmdWxsIHZpZXdwb3J0XG5cbiAgICAgICAgICAgICAgICBpZiAoc3RhcnRSZW5kZXJBY3Rpb24uY2xlYXJDb2xvcikge1xuICAgICAgICAgICAgICAgICAgICByZW5kZXJQYXNzLnNldENsZWFyQ29sb3IoY2FtZXJhLmNhbWVyYS5jbGVhckNvbG9yKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKHN0YXJ0UmVuZGVyQWN0aW9uLmNsZWFyRGVwdGgpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVuZGVyUGFzcy5zZXRDbGVhckRlcHRoKGNhbWVyYS5jYW1lcmEuY2xlYXJEZXB0aCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChzdGFydFJlbmRlckFjdGlvbi5jbGVhclN0ZW5jaWwpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVuZGVyUGFzcy5zZXRDbGVhclN0ZW5jaWwoY2FtZXJhLmNhbWVyYS5jbGVhclN0ZW5jaWwpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIERlYnVnSGVscGVyLnNldE5hbWUocmVuZGVyUGFzcywgYCR7aXNHcmFiUGFzcyA/ICdTY2VuZUdyYWInIDogJ1JlbmRlckFjdGlvbid9ICR7c3RhcnRJbmRleH0tJHtlbmRJbmRleH0gYCArXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYENhbTogJHtjYW1lcmEgPyBjYW1lcmEuZW50aXR5Lm5hbWUgOiAnLSd9YCk7XG4gICAgICAgIGZyYW1lR3JhcGguYWRkUmVuZGVyUGFzcyhyZW5kZXJQYXNzKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi4vY29tcG9zaXRpb24vbGF5ZXItY29tcG9zaXRpb24uanMnKS5MYXllckNvbXBvc2l0aW9ufSBjb21wIC0gVGhlIGxheWVyXG4gICAgICogY29tcG9zaXRpb24uXG4gICAgICovXG4gICAgdXBkYXRlKGNvbXApIHtcblxuICAgICAgICB0aGlzLmZyYW1lVXBkYXRlKCk7XG4gICAgICAgIHRoaXMuc2hhZG93UmVuZGVyZXIuZnJhbWVVcGRhdGUoKTtcblxuICAgICAgICBjb25zdCBjbHVzdGVyZWRMaWdodGluZ0VuYWJsZWQgPSB0aGlzLnNjZW5lLmNsdXN0ZXJlZExpZ2h0aW5nRW5hYmxlZDtcblxuICAgICAgICAvLyB1cGRhdGUgdGhlIHNreWJveCwgc2luY2UgdGhpcyBtaWdodCBjaGFuZ2UgX21lc2hJbnN0YW5jZXNcbiAgICAgICAgdGhpcy5zY2VuZS5fdXBkYXRlU2t5KHRoaXMuZGV2aWNlKTtcblxuICAgICAgICAvLyB1cGRhdGUgbGF5ZXIgY29tcG9zaXRpb25cbiAgICAgICAgdGhpcy51cGRhdGVMYXllckNvbXBvc2l0aW9uKGNvbXAsIGNsdXN0ZXJlZExpZ2h0aW5nRW5hYmxlZCk7XG5cbiAgICAgICAgdGhpcy5jb2xsZWN0TGlnaHRzKGNvbXApO1xuXG4gICAgICAgIC8vIFNpbmdsZSBwZXItZnJhbWUgY2FsY3VsYXRpb25zXG4gICAgICAgIHRoaXMuYmVnaW5GcmFtZShjb21wKTtcbiAgICAgICAgdGhpcy5zZXRTY2VuZUNvbnN0YW50cygpO1xuXG4gICAgICAgIC8vIHZpc2liaWxpdHkgY3VsbGluZyBvZiBsaWdodHMsIG1lc2hJbnN0YW5jZXMsIHNoYWRvd3MgY2FzdGVyc1xuICAgICAgICAvLyBhZnRlciB0aGlzIHRoZSBzY2VuZSBjdWxsaW5nIGlzIGRvbmUgYW5kIHNjcmlwdCBjYWxsYmFja3MgY2FuIGJlIGNhbGxlZCB0byByZXBvcnQgd2hpY2ggb2JqZWN0cyBhcmUgdmlzaWJsZVxuICAgICAgICB0aGlzLmN1bGxDb21wb3NpdGlvbihjb21wKTtcblxuICAgICAgICAvLyBHUFUgdXBkYXRlIGZvciBhbGwgdmlzaWJsZSBvYmplY3RzXG4gICAgICAgIHRoaXMuZ3B1VXBkYXRlKHRoaXMucHJvY2Vzc2luZ01lc2hJbnN0YW5jZXMpO1xuICAgIH1cblxuICAgIHJlbmRlclBhc3NQb3N0cHJvY2Vzc2luZyhyZW5kZXJBY3Rpb24sIGxheWVyQ29tcG9zaXRpb24pIHtcblxuICAgICAgICBjb25zdCBsYXllciA9IGxheWVyQ29tcG9zaXRpb24ubGF5ZXJMaXN0W3JlbmRlckFjdGlvbi5sYXllckluZGV4XTtcbiAgICAgICAgY29uc3QgY2FtZXJhID0gbGF5ZXIuY2FtZXJhc1tyZW5kZXJBY3Rpb24uY2FtZXJhSW5kZXhdO1xuICAgICAgICBEZWJ1Zy5hc3NlcnQocmVuZGVyQWN0aW9uLnRyaWdnZXJQb3N0cHJvY2VzcyAmJiBjYW1lcmEub25Qb3N0cHJvY2Vzc2luZyk7XG5cbiAgICAgICAgLy8gdHJpZ2dlciBwb3N0cHJvY2Vzc2luZyBmb3IgY2FtZXJhXG4gICAgICAgIGNhbWVyYS5vblBvc3Rwcm9jZXNzaW5nKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVuZGVyIHBhc3MgcmVwcmVzZW50aW5nIHRoZSBsYXllciBjb21wb3NpdGlvbidzIHJlbmRlciBhY3Rpb25zIGluIHRoZSBzcGVjaWZpZWQgcmFuZ2UuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi4vY29tcG9zaXRpb24vbGF5ZXItY29tcG9zaXRpb24uanMnKS5MYXllckNvbXBvc2l0aW9ufSBjb21wIC0gVGhlIGxheWVyXG4gICAgICogY29tcG9zaXRpb24gdG8gcmVuZGVyLlxuICAgICAqIEBpZ25vcmVcbiAgICAgKi9cbiAgICByZW5kZXJQYXNzUmVuZGVyQWN0aW9ucyhjb21wLCByYW5nZSkge1xuXG4gICAgICAgIGNvbnN0IHJlbmRlckFjdGlvbnMgPSBjb21wLl9yZW5kZXJBY3Rpb25zO1xuICAgICAgICBmb3IgKGxldCBpID0gcmFuZ2Uuc3RhcnQ7IGkgPD0gcmFuZ2UuZW5kOyBpKyspIHtcbiAgICAgICAgICAgIHRoaXMucmVuZGVyUmVuZGVyQWN0aW9uKGNvbXAsIHJlbmRlckFjdGlvbnNbaV0sIGkgPT09IHJhbmdlLnN0YXJ0KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuLi9jb21wb3NpdGlvbi9sYXllci1jb21wb3NpdGlvbi5qcycpLkxheWVyQ29tcG9zaXRpb259IGNvbXAgLSBUaGUgbGF5ZXJcbiAgICAgKiBjb21wb3NpdGlvbi5cbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi4vY29tcG9zaXRpb24vcmVuZGVyLWFjdGlvbi5qcycpLlJlbmRlckFjdGlvbn0gcmVuZGVyQWN0aW9uIC0gVGhlIHJlbmRlclxuICAgICAqIGFjdGlvbi5cbiAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IGZpcnN0UmVuZGVyQWN0aW9uIC0gVHJ1ZSBpZiB0aGlzIGlzIHRoZSBmaXJzdCByZW5kZXIgYWN0aW9uIGluIHRoZSByZW5kZXIgcGFzcy5cbiAgICAgKi9cbiAgICByZW5kZXJSZW5kZXJBY3Rpb24oY29tcCwgcmVuZGVyQWN0aW9uLCBmaXJzdFJlbmRlckFjdGlvbikge1xuXG4gICAgICAgIGNvbnN0IGNsdXN0ZXJlZExpZ2h0aW5nRW5hYmxlZCA9IHRoaXMuc2NlbmUuY2x1c3RlcmVkTGlnaHRpbmdFbmFibGVkO1xuICAgICAgICBjb25zdCBkZXZpY2UgPSB0aGlzLmRldmljZTtcblxuICAgICAgICAvLyBsYXllclxuICAgICAgICBjb25zdCBsYXllckluZGV4ID0gcmVuZGVyQWN0aW9uLmxheWVySW5kZXg7XG4gICAgICAgIGNvbnN0IGxheWVyID0gY29tcC5sYXllckxpc3RbbGF5ZXJJbmRleF07XG4gICAgICAgIGNvbnN0IHRyYW5zcGFyZW50ID0gY29tcC5zdWJMYXllckxpc3RbbGF5ZXJJbmRleF07XG5cbiAgICAgICAgY29uc3QgY2FtZXJhUGFzcyA9IHJlbmRlckFjdGlvbi5jYW1lcmFJbmRleDtcbiAgICAgICAgY29uc3QgY2FtZXJhID0gbGF5ZXIuY2FtZXJhc1tjYW1lcmFQYXNzXTtcblxuICAgICAgICBpZiAoIXJlbmRlckFjdGlvbi5pc0xheWVyRW5hYmxlZChjb21wKSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgRGVidWdHcmFwaGljcy5wdXNoR3B1TWFya2VyKHRoaXMuZGV2aWNlLCBjYW1lcmEgPyBjYW1lcmEuZW50aXR5Lm5hbWUgOiAnbm9uYW1lJyk7XG4gICAgICAgIERlYnVnR3JhcGhpY3MucHVzaEdwdU1hcmtlcih0aGlzLmRldmljZSwgbGF5ZXIubmFtZSk7XG5cbiAgICAgICAgLy8gI2lmIF9QUk9GSUxFUlxuICAgICAgICBjb25zdCBkcmF3VGltZSA9IG5vdygpO1xuICAgICAgICAvLyAjZW5kaWZcblxuICAgICAgICAvLyBDYWxsIHByZXJlbmRlciBjYWxsYmFjayBpZiB0aGVyZSdzIG9uZVxuICAgICAgICBpZiAoIXRyYW5zcGFyZW50ICYmIGxheWVyLm9uUHJlUmVuZGVyT3BhcXVlKSB7XG4gICAgICAgICAgICBsYXllci5vblByZVJlbmRlck9wYXF1ZShjYW1lcmFQYXNzKTtcbiAgICAgICAgfSBlbHNlIGlmICh0cmFuc3BhcmVudCAmJiBsYXllci5vblByZVJlbmRlclRyYW5zcGFyZW50KSB7XG4gICAgICAgICAgICBsYXllci5vblByZVJlbmRlclRyYW5zcGFyZW50KGNhbWVyYVBhc3MpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQ2FsbGVkIGZvciB0aGUgZmlyc3Qgc3VibGF5ZXIgYW5kIGZvciBldmVyeSBjYW1lcmFcbiAgICAgICAgaWYgKCEobGF5ZXIuX3ByZVJlbmRlckNhbGxlZEZvckNhbWVyYXMgJiAoMSA8PCBjYW1lcmFQYXNzKSkpIHtcbiAgICAgICAgICAgIGlmIChsYXllci5vblByZVJlbmRlcikge1xuICAgICAgICAgICAgICAgIGxheWVyLm9uUHJlUmVuZGVyKGNhbWVyYVBhc3MpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbGF5ZXIuX3ByZVJlbmRlckNhbGxlZEZvckNhbWVyYXMgfD0gMSA8PCBjYW1lcmFQYXNzO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGNhbWVyYSkge1xuXG4gICAgICAgICAgICB0aGlzLnNldHVwVmlld3BvcnQoY2FtZXJhLmNhbWVyYSwgcmVuZGVyQWN0aW9uLnJlbmRlclRhcmdldCk7XG5cbiAgICAgICAgICAgIC8vIGlmIHRoaXMgaXMgbm90IGEgZmlyc3QgcmVuZGVyIGFjdGlvbiB0byB0aGUgcmVuZGVyIHRhcmdldCwgb3IgaWYgdGhlIHJlbmRlciB0YXJnZXQgd2FzIG5vdFxuICAgICAgICAgICAgLy8gZnVsbHkgY2xlYXJlZCBvbiBwYXNzIHN0YXJ0LCB3ZSBuZWVkIHRvIGV4ZWN1dGUgY2xlYXJzIGhlcmVcbiAgICAgICAgICAgIGlmICghZmlyc3RSZW5kZXJBY3Rpb24gfHwgIWNhbWVyYS5jYW1lcmEuZnVsbFNpemVDbGVhclJlY3QpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmNsZWFyKGNhbWVyYS5jYW1lcmEsIHJlbmRlckFjdGlvbi5jbGVhckNvbG9yLCByZW5kZXJBY3Rpb24uY2xlYXJEZXB0aCwgcmVuZGVyQWN0aW9uLmNsZWFyU3RlbmNpbCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vICNpZiBfUFJPRklMRVJcbiAgICAgICAgICAgIGNvbnN0IHNvcnRUaW1lID0gbm93KCk7XG4gICAgICAgICAgICAvLyAjZW5kaWZcblxuICAgICAgICAgICAgbGF5ZXIuc29ydFZpc2libGUoY2FtZXJhLmNhbWVyYSwgdHJhbnNwYXJlbnQpO1xuXG4gICAgICAgICAgICAvLyAjaWYgX1BST0ZJTEVSXG4gICAgICAgICAgICB0aGlzLl9zb3J0VGltZSArPSBub3coKSAtIHNvcnRUaW1lO1xuICAgICAgICAgICAgLy8gI2VuZGlmXG5cbiAgICAgICAgICAgIGNvbnN0IGN1bGxlZEluc3RhbmNlcyA9IGxheWVyLmdldEN1bGxlZEluc3RhbmNlcyhjYW1lcmEuY2FtZXJhKTtcbiAgICAgICAgICAgIGNvbnN0IHZpc2libGUgPSB0cmFuc3BhcmVudCA/IGN1bGxlZEluc3RhbmNlcy50cmFuc3BhcmVudCA6IGN1bGxlZEluc3RhbmNlcy5vcGFxdWU7XG5cbiAgICAgICAgICAgIC8vIGFkZCBkZWJ1ZyBtZXNoIGluc3RhbmNlcyB0byB2aXNpYmxlIGxpc3RcbiAgICAgICAgICAgIHRoaXMuc2NlbmUuaW1tZWRpYXRlLm9uUHJlUmVuZGVyTGF5ZXIobGF5ZXIsIHZpc2libGUsIHRyYW5zcGFyZW50KTtcblxuICAgICAgICAgICAgLy8gc2V0IHVwIGxheWVyIHVuaWZvcm1zXG4gICAgICAgICAgICBpZiAobGF5ZXIucmVxdWlyZXNMaWdodEN1YmUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmxpZ2h0Q3ViZS51cGRhdGUodGhpcy5zY2VuZS5hbWJpZW50TGlnaHQsIGxheWVyLl9saWdodHMpO1xuICAgICAgICAgICAgICAgIHRoaXMuY29uc3RhbnRMaWdodEN1YmUuc2V0VmFsdWUodGhpcy5saWdodEN1YmUuY29sb3JzKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gdXBsb2FkIGNsdXN0ZXJlZCBsaWdodHMgdW5pZm9ybXNcbiAgICAgICAgICAgIGlmIChjbHVzdGVyZWRMaWdodGluZ0VuYWJsZWQgJiYgcmVuZGVyQWN0aW9uLmxpZ2h0Q2x1c3RlcnMpIHtcbiAgICAgICAgICAgICAgICByZW5kZXJBY3Rpb24ubGlnaHRDbHVzdGVycy5hY3RpdmF0ZSgpO1xuXG4gICAgICAgICAgICAgICAgLy8gZGVidWcgcmVuZGVyaW5nIG9mIGNsdXN0ZXJzXG4gICAgICAgICAgICAgICAgaWYgKCF0aGlzLmNsdXN0ZXJzRGVidWdSZW5kZXJlZCAmJiB0aGlzLnNjZW5lLmxpZ2h0aW5nLmRlYnVnTGF5ZXIgPT09IGxheWVyLmlkKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY2x1c3RlcnNEZWJ1Z1JlbmRlcmVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgV29ybGRDbHVzdGVyc0RlYnVnLnJlbmRlcihyZW5kZXJBY3Rpb24ubGlnaHRDbHVzdGVycywgdGhpcy5zY2VuZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBTZXQgdGhlIG5vdCB2ZXJ5IGNsZXZlciBnbG9iYWwgdmFyaWFibGUgd2hpY2ggaXMgb25seSB1c2VmdWwgd2hlbiB0aGVyZSdzIGp1c3Qgb25lIGNhbWVyYVxuICAgICAgICAgICAgdGhpcy5zY2VuZS5fYWN0aXZlQ2FtZXJhID0gY2FtZXJhLmNhbWVyYTtcblxuICAgICAgICAgICAgY29uc3Qgdmlld0NvdW50ID0gdGhpcy5zZXRDYW1lcmFVbmlmb3JtcyhjYW1lcmEuY2FtZXJhLCByZW5kZXJBY3Rpb24ucmVuZGVyVGFyZ2V0KTtcbiAgICAgICAgICAgIGlmIChkZXZpY2Uuc3VwcG9ydHNVbmlmb3JtQnVmZmVycykge1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0dXBWaWV3VW5pZm9ybUJ1ZmZlcnMocmVuZGVyQWN0aW9uLnZpZXdCaW5kR3JvdXBzLCB0aGlzLnZpZXdVbmlmb3JtRm9ybWF0LCB0aGlzLnZpZXdCaW5kR3JvdXBGb3JtYXQsIHZpZXdDb3VudCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIGVuYWJsZSBmbGlwIGZhY2VzIGlmIGVpdGhlciB0aGUgY2FtZXJhIGhhcyBfZmxpcEZhY2VzIGVuYWJsZWQgb3IgdGhlIHJlbmRlciB0YXJnZXRcbiAgICAgICAgICAgIC8vIGhhcyBmbGlwWSBlbmFibGVkXG4gICAgICAgICAgICBjb25zdCBmbGlwRmFjZXMgPSAhIShjYW1lcmEuY2FtZXJhLl9mbGlwRmFjZXMgXiByZW5kZXJBY3Rpb24/LnJlbmRlclRhcmdldD8uZmxpcFkpO1xuXG4gICAgICAgICAgICAvLyBzaGFkZXIgcGFzcyAtIHVzZSBzZXR0aW5nIGZyb20gY2FtZXJhIGlmIGF2YWlsYWJsZSwgb3RoZXJ3aXNlIHVzZSBsYXllciBzZXR0aW5nXG4gICAgICAgICAgICBjb25zdCBzaGFkZXJQYXNzID0gY2FtZXJhLmNhbWVyYS5zaGFkZXJQYXNzSW5mbz8uaW5kZXggPz8gbGF5ZXIuc2hhZGVyUGFzcztcblxuICAgICAgICAgICAgY29uc3QgZHJhd3MgPSB0aGlzLl9mb3J3YXJkRHJhd0NhbGxzO1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJGb3J3YXJkKGNhbWVyYS5jYW1lcmEsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmlzaWJsZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBsYXllci5zcGxpdExpZ2h0cyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzaGFkZXJQYXNzLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxheWVyLm9uRHJhd0NhbGwsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbGF5ZXIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZmxpcEZhY2VzKTtcbiAgICAgICAgICAgIGxheWVyLl9mb3J3YXJkRHJhd0NhbGxzICs9IHRoaXMuX2ZvcndhcmREcmF3Q2FsbHMgLSBkcmF3cztcblxuICAgICAgICAgICAgLy8gUmV2ZXJ0IHRlbXAgZnJhbWUgc3R1ZmZcbiAgICAgICAgICAgIC8vIFRPRE86IHRoaXMgc2hvdWxkIG5vdCBiZSBoZXJlLCBhcyBlYWNoIHJlbmRlcmluZyAvIGNsZWFyaW5nIHNob3VsZCBleHBsaWNpdGx5IHNldCB1cCB3aGF0XG4gICAgICAgICAgICAvLyBpdCByZXF1aXJlcyAodGhlIHByb3BlcnRpZXMgYXJlIHBhcnQgb2YgcmVuZGVyIHBpcGVsaW5lIG9uIFdlYkdQVSBhbnl3YXlzKVxuICAgICAgICAgICAgZGV2aWNlLnNldEJsZW5kU3RhdGUoQmxlbmRTdGF0ZS5OT0JMRU5EKTtcbiAgICAgICAgICAgIGRldmljZS5zZXRTdGVuY2lsU3RhdGUobnVsbCwgbnVsbCk7XG4gICAgICAgICAgICBkZXZpY2Uuc2V0QWxwaGFUb0NvdmVyYWdlKGZhbHNlKTsgLy8gZG9uJ3QgbGVhayBhMmMgc3RhdGVcbiAgICAgICAgICAgIGRldmljZS5zZXREZXB0aEJpYXMoZmFsc2UpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQ2FsbCBsYXllcidzIHBvc3RyZW5kZXIgY2FsbGJhY2sgaWYgdGhlcmUncyBvbmVcbiAgICAgICAgaWYgKCF0cmFuc3BhcmVudCAmJiBsYXllci5vblBvc3RSZW5kZXJPcGFxdWUpIHtcbiAgICAgICAgICAgIGxheWVyLm9uUG9zdFJlbmRlck9wYXF1ZShjYW1lcmFQYXNzKTtcbiAgICAgICAgfSBlbHNlIGlmICh0cmFuc3BhcmVudCAmJiBsYXllci5vblBvc3RSZW5kZXJUcmFuc3BhcmVudCkge1xuICAgICAgICAgICAgbGF5ZXIub25Qb3N0UmVuZGVyVHJhbnNwYXJlbnQoY2FtZXJhUGFzcyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGxheWVyLm9uUG9zdFJlbmRlciAmJiAhKGxheWVyLl9wb3N0UmVuZGVyQ2FsbGVkRm9yQ2FtZXJhcyAmICgxIDw8IGNhbWVyYVBhc3MpKSkge1xuICAgICAgICAgICAgbGF5ZXIuX3Bvc3RSZW5kZXJDb3VudGVyICY9IH4odHJhbnNwYXJlbnQgPyAyIDogMSk7XG4gICAgICAgICAgICBpZiAobGF5ZXIuX3Bvc3RSZW5kZXJDb3VudGVyID09PSAwKSB7XG4gICAgICAgICAgICAgICAgbGF5ZXIub25Qb3N0UmVuZGVyKGNhbWVyYVBhc3MpO1xuICAgICAgICAgICAgICAgIGxheWVyLl9wb3N0UmVuZGVyQ2FsbGVkRm9yQ2FtZXJhcyB8PSAxIDw8IGNhbWVyYVBhc3M7XG4gICAgICAgICAgICAgICAgbGF5ZXIuX3Bvc3RSZW5kZXJDb3VudGVyID0gbGF5ZXIuX3Bvc3RSZW5kZXJDb3VudGVyTWF4O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgRGVidWdHcmFwaGljcy5wb3BHcHVNYXJrZXIodGhpcy5kZXZpY2UpO1xuICAgICAgICBEZWJ1Z0dyYXBoaWNzLnBvcEdwdU1hcmtlcih0aGlzLmRldmljZSk7XG5cbiAgICAgICAgLy8gI2lmIF9QUk9GSUxFUlxuICAgICAgICBsYXllci5fcmVuZGVyVGltZSArPSBub3coKSAtIGRyYXdUaW1lO1xuICAgICAgICAvLyAjZW5kaWZcbiAgICB9XG59XG5cbmV4cG9ydCB7IEZvcndhcmRSZW5kZXJlciB9O1xuIl0sIm5hbWVzIjpbIndlYmdsMURlcHRoQ2xlYXJDb2xvciIsIkNvbG9yIiwiX2RyYXdDYWxsTGlzdCIsImRyYXdDYWxscyIsInNoYWRlckluc3RhbmNlcyIsImlzTmV3TWF0ZXJpYWwiLCJsaWdodE1hc2tDaGFuZ2VkIiwiY2xlYXIiLCJsZW5ndGgiLCJ2b2dlbERpc2tQcmVjYWxjdWxhdGlvblNhbXBsZXMiLCJudW1TYW1wbGVzIiwic2FtcGxlcyIsImkiLCJyIiwiTWF0aCIsInNxcnQiLCJwdXNoIiwidm9nZWxTcGhlcmVQcmVjYWxjdWxhdGlvblNhbXBsZXMiLCJ3ZWlnaHQiLCJyYWRpdXMiLCJGb3J3YXJkUmVuZGVyZXIiLCJSZW5kZXJlciIsImNvbnN0cnVjdG9yIiwiZ3JhcGhpY3NEZXZpY2UiLCJkZXZpY2UiLCJfZm9yd2FyZERyYXdDYWxscyIsIl9tYXRlcmlhbFN3aXRjaGVzIiwiX2RlcHRoTWFwVGltZSIsIl9mb3J3YXJkVGltZSIsIl9zb3J0VGltZSIsInNjb3BlIiwiZm9nQ29sb3JJZCIsInJlc29sdmUiLCJmb2dTdGFydElkIiwiZm9nRW5kSWQiLCJmb2dEZW5zaXR5SWQiLCJhbWJpZW50SWQiLCJza3lib3hJbnRlbnNpdHlJZCIsImN1YmVNYXBSb3RhdGlvbk1hdHJpeElkIiwicGNzc0Rpc2tTYW1wbGVzSWQiLCJwY3NzU3BoZXJlU2FtcGxlc0lkIiwibGlnaHRDb2xvcklkIiwibGlnaHREaXIiLCJsaWdodERpcklkIiwibGlnaHRTaGFkb3dNYXBJZCIsImxpZ2h0U2hhZG93TWF0cml4SWQiLCJsaWdodFNoYWRvd1BhcmFtc0lkIiwibGlnaHRTaGFkb3dJbnRlbnNpdHkiLCJsaWdodFJhZGl1c0lkIiwibGlnaHRQb3MiLCJsaWdodFBvc0lkIiwibGlnaHRXaWR0aCIsImxpZ2h0V2lkdGhJZCIsImxpZ2h0SGVpZ2h0IiwibGlnaHRIZWlnaHRJZCIsImxpZ2h0SW5BbmdsZUlkIiwibGlnaHRPdXRBbmdsZUlkIiwibGlnaHRDb29raWVJZCIsImxpZ2h0Q29va2llSW50SWQiLCJsaWdodENvb2tpZU1hdHJpeElkIiwibGlnaHRDb29raWVPZmZzZXRJZCIsImxpZ2h0U2hhZG93U2VhcmNoQXJlYUlkIiwibGlnaHRDYW1lcmFQYXJhbXNJZCIsInNoYWRvd01hdHJpeFBhbGV0dGVJZCIsInNoYWRvd0Nhc2NhZGVEaXN0YW5jZXNJZCIsInNoYWRvd0Nhc2NhZGVDb3VudElkIiwic2NyZWVuU2l6ZUlkIiwiX3NjcmVlblNpemUiLCJGbG9hdDMyQXJyYXkiLCJmb2dDb2xvciIsImFtYmllbnRDb2xvciIsInBjc3NEaXNrU2FtcGxlcyIsInBjc3NTcGhlcmVTYW1wbGVzIiwiZGVzdHJveSIsImRpc3BhdGNoR2xvYmFsTGlnaHRzIiwic2NlbmUiLCJhbWJpZW50TGlnaHQiLCJnIiwiYiIsImdhbW1hQ29ycmVjdGlvbiIsInBvdyIsInBoeXNpY2FsVW5pdHMiLCJhbWJpZW50THVtaW5hbmNlIiwic2V0VmFsdWUiLCJza3lib3hMdW1pbmFuY2UiLCJza3lib3hJbnRlbnNpdHkiLCJfc2t5Ym94Um90YXRpb25NYXQzIiwiZGF0YSIsIl9yZXNvbHZlTGlnaHQiLCJsaWdodCIsInNldExUQ0RpcmVjdGlvbmFsTGlnaHQiLCJ3dG0iLCJjbnQiLCJkaXIiLCJjYW1wb3MiLCJmYXIiLCJ4IiwieSIsInoiLCJoV2lkdGgiLCJ0cmFuc2Zvcm1WZWN0b3IiLCJWZWMzIiwiaEhlaWdodCIsImRpc3BhdGNoRGlyZWN0TGlnaHRzIiwiZGlycyIsIm1hc2siLCJjYW1lcmEiLCJkaXJlY3Rpb25hbCIsIl9ub2RlIiwiZ2V0V29ybGRUcmFuc2Zvcm0iLCJfbGluZWFyRmluYWxDb2xvciIsIl9maW5hbENvbG9yIiwiZ2V0WSIsIl9kaXJlY3Rpb24iLCJtdWxTY2FsYXIiLCJub3JtYWxpemUiLCJzaGFwZSIsIkxJR0hUU0hBUEVfUFVOQ1RVQUwiLCJnZXRQb3NpdGlvbiIsImZhckNsaXAiLCJjYXN0U2hhZG93cyIsImxpZ2h0UmVuZGVyRGF0YSIsImdldFJlbmRlckRhdGEiLCJiaWFzZXMiLCJfZ2V0VW5pZm9ybUJpYXNWYWx1ZXMiLCJzaGFkb3dCdWZmZXIiLCJzaGFkb3dNYXRyaXgiLCJfc2hhZG93TWF0cml4UGFsZXR0ZSIsIl9zaGFkb3dDYXNjYWRlRGlzdGFuY2VzIiwibnVtQ2FzY2FkZXMiLCJzaGFkb3dJbnRlbnNpdHkiLCJwcm9qZWN0aW9uQ29tcGVuc2F0aW9uIiwicGl4ZWxzUGVyTWV0ZXIiLCJwZW51bWJyYVNpemUiLCJzaGFkb3dDYW1lcmEiLCJyZW5kZXJUYXJnZXQiLCJ3aWR0aCIsImNhbWVyYVBhcmFtcyIsIl9zaGFkb3dDYW1lcmFQYXJhbXMiLCJkZXB0aFJhbmdlQ29tcGVuc2F0aW9uIiwiX2ZhckNsaXAiLCJfbmVhckNsaXAiLCJwYXJhbXMiLCJfc2hhZG93UmVuZGVyUGFyYW1zIiwiX3NoYWRvd1Jlc29sdXRpb24iLCJub3JtYWxCaWFzIiwiYmlhcyIsInNldExUQ1Bvc2l0aW9uYWxMaWdodCIsImRpc3BhdGNoT21uaUxpZ2h0Iiwib21uaSIsImF0dGVudWF0aW9uRW5kIiwiZ2V0VHJhbnNsYXRpb24iLCJfcG9zaXRpb24iLCJfY29va2llIiwiY29va2llSW50ZW5zaXR5IiwiZGlzcGF0Y2hTcG90TGlnaHQiLCJzcG90IiwiX2lubmVyQ29uZUFuZ2xlQ29zIiwiX291dGVyQ29uZUFuZ2xlQ29zIiwiZm92IiwiX2ZvdiIsIlBJIiwiZm92UmF0aW8iLCJ0YW4iLCJjb29raWVNYXRyaXgiLCJMaWdodENhbWVyYSIsImV2YWxTcG90Q29va2llTWF0cml4IiwiX2Nvb2tpZVRyYW5zZm9ybSIsIl9jb29raWVUcmFuc2Zvcm1Vbmlmb3JtIiwidyIsIl9jb29raWVPZmZzZXRVbmlmb3JtIiwiX2Nvb2tpZU9mZnNldCIsImRpc3BhdGNoTG9jYWxMaWdodHMiLCJzb3J0ZWRMaWdodHMiLCJ1c2VkRGlyTGlnaHRzIiwib21uaXMiLCJMSUdIVFRZUEVfT01OSSIsIm51bU9tbmlzIiwic3B0cyIsIkxJR0hUVFlQRV9TUE9UIiwibnVtU3B0cyIsInJlbmRlckZvcndhcmRQcmVwYXJlTWF0ZXJpYWxzIiwibGF5ZXIiLCJwYXNzIiwiX2xheWVyJGdldExpZ2h0SGFzaCIsImFkZENhbGwiLCJkcmF3Q2FsbCIsInNoYWRlckluc3RhbmNlIiwiY2x1c3RlcmVkTGlnaHRpbmdFbmFibGVkIiwibGlnaHRIYXNoIiwiZ2V0TGlnaHRIYXNoIiwicHJldk1hdGVyaWFsIiwicHJldk9iakRlZnMiLCJwcmV2TGlnaHRNYXNrIiwiZHJhd0NhbGxzQ291bnQiLCJza2lwUmVuZGVyQ2FtZXJhIiwiX3NraXBSZW5kZXJDb3VudGVyIiwic2tpcFJlbmRlckFmdGVyIiwiZW5zdXJlTWF0ZXJpYWwiLCJtYXRlcmlhbCIsIm9iakRlZnMiLCJfc2hhZGVyRGVmcyIsImxpZ2h0TWFzayIsIl9zY2VuZSIsImRpcnR5IiwidXBkYXRlVW5pZm9ybXMiLCJEZWJ1Z0dyYXBoaWNzIiwicHVzaEdwdU1hcmtlciIsIm5vZGUiLCJuYW1lIiwiZ2V0U2hhZGVySW5zdGFuY2UiLCJ2aWV3VW5pZm9ybUZvcm1hdCIsInZpZXdCaW5kR3JvdXBGb3JtYXQiLCJwb3BHcHVNYXJrZXIiLCJlbmRTaGFkZXJCYXRjaCIsInJlbmRlckZvcndhcmRJbnRlcm5hbCIsInByZXBhcmVkQ2FsbHMiLCJkcmF3Q2FsbGJhY2siLCJmbGlwRmFjZXMiLCJwYXNzRmxhZyIsImZsaXBGYWN0b3IiLCJza2lwTWF0ZXJpYWwiLCJwcmVwYXJlZENhbGxzQ291bnQiLCJfZHJhd0NhbGwkc3RlbmNpbEZyb24iLCJfZHJhd0NhbGwkc3RlbmNpbEJhY2siLCJuZXdNYXRlcmlhbCIsInNoYWRlciIsImZhaWxlZCIsInNldFNoYWRlciIsIkRlYnVnIiwiZXJyb3IiLCJsYWJlbCIsInNldFBhcmFtZXRlcnMiLCJMSUdIVFRZUEVfRElSRUNUSU9OQUwiLCJhbHBoYVRlc3RJZCIsImFscGhhVGVzdCIsInNldEJsZW5kU3RhdGUiLCJibGVuZFN0YXRlIiwic2V0RGVwdGhTdGF0ZSIsImRlcHRoU3RhdGUiLCJzZXRBbHBoYVRvQ292ZXJhZ2UiLCJhbHBoYVRvQ292ZXJhZ2UiLCJkZXB0aEJpYXMiLCJzbG9wZURlcHRoQmlhcyIsInNldERlcHRoQmlhcyIsInNldERlcHRoQmlhc1ZhbHVlcyIsInNldHVwQ3VsbE1vZGUiLCJfY3VsbEZhY2VzIiwic3RlbmNpbEZyb250Iiwic3RlbmNpbEJhY2siLCJzZXRTdGVuY2lsU3RhdGUiLCJtZXNoIiwic2V0VmVydGV4QnVmZmVycyIsInNldE1vcnBoaW5nIiwibW9ycGhJbnN0YW5jZSIsInNldFNraW5uaW5nIiwic2V0dXBNZXNoVW5pZm9ybUJ1ZmZlcnMiLCJzdHlsZSIsInJlbmRlclN0eWxlIiwic2V0SW5kZXhCdWZmZXIiLCJpbmRleEJ1ZmZlciIsInhyIiwic2Vzc2lvbiIsInZpZXdzIiwidiIsInZpZXciLCJzZXRWaWV3cG9ydCIsInZpZXdwb3J0IiwicHJvaklkIiwicHJvak1hdCIsInByb2pTa3lib3hJZCIsInZpZXdJZCIsInZpZXdPZmZNYXQiLCJ2aWV3SW52SWQiLCJ2aWV3SW52T2ZmTWF0Iiwidmlld0lkMyIsInZpZXdNYXQzIiwidmlld1Byb2pJZCIsInByb2pWaWV3T2ZmTWF0Iiwidmlld1Bvc0lkIiwicG9zaXRpb24iLCJkcmF3SW5zdGFuY2UiLCJkcmF3SW5zdGFuY2UyIiwicGFyYW1ldGVycyIsInJlbmRlckZvcndhcmQiLCJhbGxEcmF3Q2FsbHMiLCJmb3J3YXJkU3RhcnRUaW1lIiwibm93Iiwic2V0U2NlbmVDb25zdGFudHMiLCJmb2ciLCJGT0dfTk9ORSIsIkZPR19MSU5FQVIiLCJmb2dTdGFydCIsImZvZ0VuZCIsImZvZ0RlbnNpdHkiLCJoZWlnaHQiLCJidWlsZEZyYW1lR3JhcGgiLCJmcmFtZUdyYXBoIiwibGF5ZXJDb21wb3NpdGlvbiIsInJlc2V0IiwidXBkYXRlIiwicmVuZGVyUGFzcyIsIlJlbmRlclBhc3MiLCJsaWdodGluZyIsImNvb2tpZXNFbmFibGVkIiwicmVuZGVyQ29va2llcyIsImxpZ2h0cyIsInJlcXVpcmVzQ3ViZW1hcHMiLCJEZWJ1Z0hlbHBlciIsInNldE5hbWUiLCJhZGRSZW5kZXJQYXNzIiwic2hhZG93c0VuYWJsZWQiLCJfc2hhZG93UmVuZGVyZXJMb2NhbCIsInByZXBhcmVDbHVzdGVyZWRSZW5kZXJQYXNzIiwibG9jYWxMaWdodHMiLCJfYWZ0ZXIiLCJ1cGRhdGVDbHVzdGVycyIsImJ1aWxkTm9uQ2x1c3RlcmVkUmVuZGVyUGFzc2VzIiwic3RhcnRJbmRleCIsIm5ld1N0YXJ0IiwicmVuZGVyQWN0aW9ucyIsIl9yZW5kZXJBY3Rpb25zIiwicmVuZGVyQWN0aW9uIiwibGF5ZXJMaXN0IiwibGF5ZXJJbmRleCIsImNhbWVyYXMiLCJjYW1lcmFJbmRleCIsImlzTGF5ZXJFbmFibGVkIiwiaXNEZXB0aExheWVyIiwiaWQiLCJMQVlFUklEX0RFUFRIIiwiaXNHcmFiUGFzcyIsInJlbmRlclNjZW5lQ29sb3JNYXAiLCJyZW5kZXJTY2VuZURlcHRoTWFwIiwiaGFzRGlyZWN0aW9uYWxTaGFkb3dMaWdodHMiLCJfc2hhZG93UmVuZGVyZXJEaXJlY3Rpb25hbCIsImRpcmVjdGlvbmFsTGlnaHRzIiwibmV4dEluZGV4IiwibmV4dFJlbmRlckFjdGlvbiIsImlzTmV4dExheWVyRGVwdGgiLCJpc05leHRMYXllckdyYWJQYXNzIiwiYWRkTWFpblJlbmRlclBhc3MiLCJ0cmlnZ2VyUG9zdHByb2Nlc3MiLCJvblBvc3Rwcm9jZXNzaW5nIiwicmVuZGVyUGFzc1Bvc3Rwcm9jZXNzaW5nIiwiZW5kSW5kZXgiLCJyYW5nZSIsInN0YXJ0IiwiZW5kIiwicmVuZGVyUGFzc1JlbmRlckFjdGlvbnMiLCJzdGFydFJlbmRlckFjdGlvbiIsImVuZFJlbmRlckFjdGlvbiIsInN0YXJ0TGF5ZXIiLCJmaXJzdENhbWVyYVVzZSIsIm9uUHJlUmVuZGVyIiwiX2JlZm9yZSIsImxhc3RDYW1lcmFVc2UiLCJvblBvc3RSZW5kZXIiLCJncmFiUGFzc1JlcXVpcmVkIiwiU2NlbmVHcmFiIiwicmVxdWlyZXNSZW5kZXJQYXNzIiwiaXNSZWFsUGFzcyIsImluaXQiLCJmdWxsU2l6ZUNsZWFyUmVjdCIsInNldENsZWFyQ29sb3IiLCJzZXRDbGVhckRlcHRoIiwiY2xlYXJDb2xvciIsImNsZWFyRGVwdGgiLCJjbGVhclN0ZW5jaWwiLCJzZXRDbGVhclN0ZW5jaWwiLCJlbnRpdHkiLCJjb21wIiwiZnJhbWVVcGRhdGUiLCJzaGFkb3dSZW5kZXJlciIsIl91cGRhdGVTa3kiLCJ1cGRhdGVMYXllckNvbXBvc2l0aW9uIiwiY29sbGVjdExpZ2h0cyIsImJlZ2luRnJhbWUiLCJjdWxsQ29tcG9zaXRpb24iLCJncHVVcGRhdGUiLCJwcm9jZXNzaW5nTWVzaEluc3RhbmNlcyIsImFzc2VydCIsInJlbmRlclJlbmRlckFjdGlvbiIsImZpcnN0UmVuZGVyQWN0aW9uIiwidHJhbnNwYXJlbnQiLCJzdWJMYXllckxpc3QiLCJjYW1lcmFQYXNzIiwiZHJhd1RpbWUiLCJvblByZVJlbmRlck9wYXF1ZSIsIm9uUHJlUmVuZGVyVHJhbnNwYXJlbnQiLCJfcHJlUmVuZGVyQ2FsbGVkRm9yQ2FtZXJhcyIsIl9yZW5kZXJBY3Rpb24kcmVuZGVyVCIsIl9jYW1lcmEkY2FtZXJhJHNoYWRlciIsIl9jYW1lcmEkY2FtZXJhJHNoYWRlcjIiLCJzZXR1cFZpZXdwb3J0Iiwic29ydFRpbWUiLCJzb3J0VmlzaWJsZSIsImN1bGxlZEluc3RhbmNlcyIsImdldEN1bGxlZEluc3RhbmNlcyIsInZpc2libGUiLCJvcGFxdWUiLCJpbW1lZGlhdGUiLCJvblByZVJlbmRlckxheWVyIiwicmVxdWlyZXNMaWdodEN1YmUiLCJsaWdodEN1YmUiLCJfbGlnaHRzIiwiY29uc3RhbnRMaWdodEN1YmUiLCJjb2xvcnMiLCJsaWdodENsdXN0ZXJzIiwiYWN0aXZhdGUiLCJjbHVzdGVyc0RlYnVnUmVuZGVyZWQiLCJkZWJ1Z0xheWVyIiwiV29ybGRDbHVzdGVyc0RlYnVnIiwicmVuZGVyIiwiX2FjdGl2ZUNhbWVyYSIsInZpZXdDb3VudCIsInNldENhbWVyYVVuaWZvcm1zIiwic3VwcG9ydHNVbmlmb3JtQnVmZmVycyIsInNldHVwVmlld1VuaWZvcm1CdWZmZXJzIiwidmlld0JpbmRHcm91cHMiLCJfZmxpcEZhY2VzIiwiZmxpcFkiLCJzaGFkZXJQYXNzIiwic2hhZGVyUGFzc0luZm8iLCJpbmRleCIsImRyYXdzIiwic3BsaXRMaWdodHMiLCJvbkRyYXdDYWxsIiwiQmxlbmRTdGF0ZSIsIk5PQkxFTkQiLCJvblBvc3RSZW5kZXJPcGFxdWUiLCJvblBvc3RSZW5kZXJUcmFuc3BhcmVudCIsIl9wb3N0UmVuZGVyQ2FsbGVkRm9yQ2FtZXJhcyIsIl9wb3N0UmVuZGVyQ291bnRlciIsIl9wb3N0UmVuZGVyQ291bnRlck1heCIsIl9yZW5kZXJUaW1lIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7O0FBc0JBLE1BQU1BLHFCQUFxQixHQUFHLElBQUlDLEtBQUssQ0FBQyxLQUFLLEdBQUcsR0FBRyxFQUFFLEtBQUssR0FBRyxHQUFHLEVBQUUsS0FBSyxHQUFHLEdBQUcsRUFBRSxLQUFLLEdBQUcsR0FBRyxDQUFDLENBQUE7QUFFM0YsTUFBTUMsYUFBYSxHQUFHO0FBQ2xCQyxFQUFBQSxTQUFTLEVBQUUsRUFBRTtBQUNiQyxFQUFBQSxlQUFlLEVBQUUsRUFBRTtBQUNuQkMsRUFBQUEsYUFBYSxFQUFFLEVBQUU7QUFDakJDLEVBQUFBLGdCQUFn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
