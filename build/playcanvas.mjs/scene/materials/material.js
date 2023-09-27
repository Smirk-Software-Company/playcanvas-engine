import { Debug } from '../../core/debug.js';
import { CULLFACE_BACK, BLENDMODE_ONE, BLENDEQUATION_REVERSE_SUBTRACT, BLENDMODE_ZERO, BLENDEQUATION_ADD, BLENDMODE_SRC_ALPHA, BLENDMODE_ONE_MINUS_SRC_ALPHA, BLENDMODE_DST_COLOR, BLENDMODE_SRC_COLOR, BLENDMODE_ONE_MINUS_DST_COLOR, BLENDEQUATION_MIN, BLENDEQUATION_MAX } from '../../platform/graphics/constants.js';
import { BlendState } from '../../platform/graphics/blend-state.js';
import { DepthState } from '../../platform/graphics/depth-state.js';
import { ShaderProcessorOptions } from '../../platform/graphics/shader-processor-options.js';
import { BLEND_NONE, BLEND_NORMAL, BLEND_SUBTRACTIVE, BLEND_PREMULTIPLIED, BLEND_ADDITIVE, BLEND_ADDITIVEALPHA, BLEND_MULTIPLICATIVE2X, BLEND_SCREEN, BLEND_MULTIPLICATIVE, BLEND_MIN, BLEND_MAX } from '../constants.js';
import { processShader } from '../shader-lib/utils.js';
import { getDefaultMaterial } from './default-material.js';

// blend mode mapping to op, srcBlend and dstBlend
const blendModes = [];
blendModes[BLEND_SUBTRACTIVE] = {
  src: BLENDMODE_ONE,
  dst: BLENDMODE_ONE,
  op: BLENDEQUATION_REVERSE_SUBTRACT
};
blendModes[BLEND_NONE] = {
  src: BLENDMODE_ONE,
  dst: BLENDMODE_ZERO,
  op: BLENDEQUATION_ADD
};
blendModes[BLEND_NORMAL] = {
  src: BLENDMODE_SRC_ALPHA,
  dst: BLENDMODE_ONE_MINUS_SRC_ALPHA,
  op: BLENDEQUATION_ADD
};
blendModes[BLEND_PREMULTIPLIED] = {
  src: BLENDMODE_ONE,
  dst: BLENDMODE_ONE_MINUS_SRC_ALPHA,
  op: BLENDEQUATION_ADD
};
blendModes[BLEND_ADDITIVE] = {
  src: BLENDMODE_ONE,
  dst: BLENDMODE_ONE,
  op: BLENDEQUATION_ADD
};
blendModes[BLEND_ADDITIVEALPHA] = {
  src: BLENDMODE_SRC_ALPHA,
  dst: BLENDMODE_ONE,
  op: BLENDEQUATION_ADD
};
blendModes[BLEND_MULTIPLICATIVE2X] = {
  src: BLENDMODE_DST_COLOR,
  dst: BLENDMODE_SRC_COLOR,
  op: BLENDEQUATION_ADD
};
blendModes[BLEND_SCREEN] = {
  src: BLENDMODE_ONE_MINUS_DST_COLOR,
  dst: BLENDMODE_ONE,
  op: BLENDEQUATION_ADD
};
blendModes[BLEND_MULTIPLICATIVE] = {
  src: BLENDMODE_DST_COLOR,
  dst: BLENDMODE_ZERO,
  op: BLENDEQUATION_ADD
};
blendModes[BLEND_MIN] = {
  src: BLENDMODE_ONE,
  dst: BLENDMODE_ONE,
  op: BLENDEQUATION_MIN
};
blendModes[BLEND_MAX] = {
  src: BLENDMODE_ONE,
  dst: BLENDMODE_ONE,
  op: BLENDEQUATION_MAX
};
let id = 0;

/**
 * A material determines how a particular mesh instance is rendered. It specifies the shader and
 * render state that is set before the mesh instance is submitted to the graphics device.
 *
 * @category Graphics
 */
class Material {
  constructor() {
    /**
     * A shader used to render the material. Note that this is used only by materials where the
     * user specifies the shader. Most material types generate multiple shader variants, and do not
     * set this.
     *
     * @type {import('../../platform/graphics/shader.js').Shader}
     * @private
     */
    this._shader = null;
    /**
     * The mesh instances referencing this material
     *
     * @type {import('../mesh-instance.js').MeshInstance[]}
     * @private
     */
    this.meshInstances = [];
    /**
     * The name of the material.
     *
     * @type {string}
     */
    this.name = 'Untitled';
    /**
     * A unique id the user can assign to the material. The engine internally does not use this for
     * anything, and the user can assign a value to this id for any purpose they like. Defaults to
     * an empty string.
     *
     * @type {string}
     */
    this.userId = '';
    this.id = id++;
    /**
     * The cache of shader variants generated for this material. The key represents the unique
     * variant, the value is the shader.
     *
     * @type {Map<string, import('../../platform/graphics/shader.js').Shader>}
     * @ignore
     */
    this.variants = new Map();
    this.parameters = {};
    /**
     * The alpha test reference value to control which fragments are written to the currently
     * active render target based on alpha value. All fragments with an alpha value of less than
     * the alphaTest reference value will be discarded. alphaTest defaults to 0 (all fragments
     * pass).
     *
     * @type {number}
     */
    this.alphaTest = 0;
    /**
     * Enables or disables alpha to coverage (WebGL2 only). When enabled, and if hardware
     * anti-aliasing is on, limited order-independent transparency can be achieved. Quality depends
     * on the number of MSAA samples of the current render target. It can nicely soften edges of
     * otherwise sharp alpha cutouts, but isn't recommended for large area semi-transparent
     * surfaces. Note, that you don't need to enable blending to make alpha to coverage work. It
     * will work without it, just like alphaTest.
     *
     * @type {boolean}
     */
    this.alphaToCoverage = false;
    /** @ignore */
    this._blendState = new BlendState();
    /** @ignore */
    this._depthState = new DepthState();
    /**
     * Controls how triangles are culled based on their face direction with respect to the
     * viewpoint. Can be:
     *
     * - {@link CULLFACE_NONE}: Do not cull triangles based on face direction.
     * - {@link CULLFACE_BACK}: Cull the back faces of triangles (do not render triangles facing
     * away from the view point).
     * - {@link CULLFACE_FRONT}: Cull the front faces of triangles (do not render triangles facing
     * towards the view point).
     *
     * Defaults to {@link CULLFACE_BACK}.
     *
     * @type {number}
     */
    this.cull = CULLFACE_BACK;
    /**
     * Stencil parameters for front faces (default is null).
     *
     * @type {import('../../platform/graphics/stencil-parameters.js').StencilParameters|null}
     */
    this.stencilFront = null;
    /**
     * Stencil parameters for back faces (default is null).
     *
     * @type {import('../../platform/graphics/stencil-parameters.js').StencilParameters|null}
     */
    this.stencilBack = null;
    /**
     * Offsets the output depth buffer value. Useful for decals to prevent z-fighting.
     *
     * @type {number}
     */
    this.depthBias = 0;
    /**
     * Same as {@link Material#depthBias}, but also depends on the slope of the triangle relative
     * to the camera.
     *
     * @type {number}
     */
    this.slopeDepthBias = 0;
    this._shaderVersion = 0;
    this._scene = null;
    this.dirty = true;
  }
  /**
   * If true, the red component of fragments generated by the shader of this material is written
   * to the color buffer of the currently active render target. If false, the red component will
   * not be written. Defaults to true.
   *
   * @type {boolean}
   */
  set redWrite(value) {
    this._blendState.redWrite = value;
  }
  get redWrite() {
    return this._blendState.redWrite;
  }

  /**
   * If true, the green component of fragments generated by the shader of this material is
   * written to the color buffer of the currently active render target. If false, the green
   * component will not be written. Defaults to true.
   *
   * @type {boolean}
   */
  set greenWrite(value) {
    this._blendState.greenWrite = value;
  }
  get greenWrite() {
    return this._blendState.greenWrite;
  }

  /**
   * If true, the blue component of fragments generated by the shader of this material is
   * written to the color buffer of the currently active render target. If false, the blue
   * component will not be written. Defaults to true.
   *
   * @type {boolean}
   */
  set blueWrite(value) {
    this._blendState.blueWrite = value;
  }
  get blueWrite() {
    return this._blendState.blueWrite;
  }

  /**
   * If true, the alpha component of fragments generated by the shader of this material is
   * written to the color buffer of the currently active render target. If false, the alpha
   * component will not be written. Defaults to true.
   *
   * @type {boolean}
   */
  set alphaWrite(value) {
    this._blendState.alphaWrite = value;
  }
  get alphaWrite() {
    return this._blendState.alphaWrite;
  }

  /**
   * The shader used by this material to render mesh instances (default is null).
   *
   * @type {import('../../platform/graphics/shader.js').Shader|null}
   */
  set shader(shader) {
    this._shader = shader;
  }
  get shader() {
    return this._shader;
  }

  // returns boolean depending on material being transparent
  get transparent() {
    return this._blendState.blend;
  }
  _updateTransparency() {
    const transparent = this.transparent;
    const meshInstances = this.meshInstances;
    for (let i = 0; i < meshInstances.length; i++) {
      meshInstances[i].transparent = transparent;
    }
  }

  /**
   * Controls how fragment shader outputs are blended when being written to the currently active
   * render target. This overwrites blending type set using {@link Material#blendType}, and
   * offers more control over blending.
   *
   * @type { BlendState }
   */
  set blendState(value) {
    this._blendState.copy(value);
    this._updateTransparency();
  }
  get blendState() {
    return this._blendState;
  }

  /**
   * Controls how fragment shader outputs are blended when being written to the currently active
   * render target. Can be:
   *
   * - {@link BLEND_SUBTRACTIVE}: Subtract the color of the source fragment from the destination
   * fragment and write the result to the frame buffer.
   * - {@link BLEND_ADDITIVE}: Add the color of the source fragment to the destination fragment
   * and write the result to the frame buffer.
   * - {@link BLEND_NORMAL}: Enable simple translucency for materials such as glass. This is
   * equivalent to enabling a source blend mode of {@link BLENDMODE_SRC_ALPHA} and a destination
   * blend mode of {@link BLENDMODE_ONE_MINUS_SRC_ALPHA}.
   * - {@link BLEND_NONE}: Disable blending.
   * - {@link BLEND_PREMULTIPLIED}: Similar to {@link BLEND_NORMAL} expect the source fragment is
   * assumed to have already been multiplied by the source alpha value.
   * - {@link BLEND_MULTIPLICATIVE}: Multiply the color of the source fragment by the color of the
   * destination fragment and write the result to the frame buffer.
   * - {@link BLEND_ADDITIVEALPHA}: Same as {@link BLEND_ADDITIVE} except the source RGB is
   * multiplied by the source alpha.
   * - {@link BLEND_MULTIPLICATIVE2X}: Multiplies colors and doubles the result.
   * - {@link BLEND_SCREEN}: Softer version of additive.
   * - {@link BLEND_MIN}: Minimum color. Check app.graphicsDevice.extBlendMinmax for support.
   * - {@link BLEND_MAX}: Maximum color. Check app.graphicsDevice.extBlendMinmax for support.
   *
   * Defaults to {@link BLEND_NONE}.
   *
   * @type {number}
   */
  set blendType(type) {
    const blendMode = blendModes[type];
    Debug.assert(blendMode, `Unknown blend mode ${type}`);
    this._blendState.setColorBlend(blendMode.op, blendMode.src, blendMode.dst);
    this._blendState.setAlphaBlend(blendMode.op, blendMode.src, blendMode.dst);
    const blend = type !== BLEND_NONE;
    if (this._blendState.blend !== blend) {
      this._blendState.blend = blend;
      this._updateTransparency();
    }
    this._updateMeshInstanceKeys();
  }
  get blendType() {
    if (!this.transparent) {
      return BLEND_NONE;
    }
    const {
      colorOp,
      colorSrcFactor,
      colorDstFactor,
      alphaOp,
      alphaSrcFactor,
      alphaDstFactor
    } = this._blendState;
    for (let i = 0; i < blendModes.length; i++) {
      const blendMode = blendModes[i];
      if (blendMode.src === colorSrcFactor && blendMode.dst === colorDstFactor && blendMode.op === colorOp && blendMode.src === alphaSrcFactor && blendMode.dst === alphaDstFactor && blendMode.op === alphaOp) {
        return i;
      }
    }
    return BLEND_NORMAL;
  }

  /**
   * Sets the depth state. Note that this can also be done by using {@link Material#depthTest},
   * {@link Material#depthFunc} and {@link Material#depthWrite}.
   *
   * @type { DepthState }
   */
  set depthState(value) {
    this._depthState.copy(value);
  }
  get depthState() {
    return this._depthState;
  }

  /**
   * If true, fragments generated by the shader of this material are only written to the current
   * render target if they pass the depth test. If false, fragments generated by the shader of
   * this material are written to the current render target regardless of what is in the depth
   * buffer. Defaults to true.
   *
   * @type {boolean}
   */
  set depthTest(value) {
    this._depthState.test = value;
  }
  get depthTest() {
    return this._depthState.test;
  }

  /**
   * Controls how the depth of new fragments is compared against the current depth contained in
   * the depth buffer. Can be:
   *
   * - {@link FUNC_NEVER}: don't draw
   * - {@link FUNC_LESS}: draw if new depth < depth buffer
   * - {@link FUNC_EQUAL}: draw if new depth == depth buffer
   * - {@link FUNC_LESSEQUAL}: draw if new depth <= depth buffer
   * - {@link FUNC_GREATER}: draw if new depth > depth buffer
   * - {@link FUNC_NOTEQUAL}: draw if new depth != depth buffer
   * - {@link FUNC_GREATEREQUAL}: draw if new depth >= depth buffer
   * - {@link FUNC_ALWAYS}: always draw
   *
   * Defaults to {@link FUNC_LESSEQUAL}.
   *
   * @type {number}
   */
  set depthFunc(value) {
    this._depthState.func = value;
  }
  get depthFunc() {
    return this._depthState.func;
  }

  /**
   * If true, fragments generated by the shader of this material write a depth value to the depth
   * buffer of the currently active render target. If false, no depth value is written. Defaults
   * to true.
   *
   * @type {boolean}
   */
  set depthWrite(value) {
    this._depthState.write = value;
  }
  get depthWrite() {
    return this._depthState.write;
  }

  /**
   * Copy a material.
   *
   * @param {Material} source - The material to copy.
   * @returns {Material} The destination material.
   */
  copy(source) {
    var _source$stencilFront;
    this.name = source.name;
    this._shader = source._shader;

    // Render states
    this.alphaTest = source.alphaTest;
    this.alphaToCoverage = source.alphaToCoverage;
    this._blendState.copy(source._blendState);
    this._depthState.copy(source._depthState);
    this.cull = source.cull;
    this.depthBias = source.depthBias;
    this.slopeDepthBias = source.slopeDepthBias;
    this.stencilFront = (_source$stencilFront = source.stencilFront) == null ? void 0 : _source$stencilFront.clone();
    if (source.stencilBack) {
      this.stencilBack = source.stencilFront === source.stencilBack ? this.stencilFront : source.stencilBack.clone();
    }
    return this;
  }

  /**
   * Clone a material.
   *
   * @returns {this} A newly cloned material.
   */
  clone() {
    const clone = new this.constructor();
    return clone.copy(this);
  }
  _updateMeshInstanceKeys() {
    const meshInstances = this.meshInstances;
    for (let i = 0; i < meshInstances.length; i++) {
      meshInstances[i].updateKey();
    }
  }
  updateUniforms(device, scene) {}

  // TODO: unused parameter should be removed, but the Editor still uses this function
  getShaderVariant(device, scene, objDefs, unused, pass, sortedLights, viewUniformFormat, viewBindGroupFormat, vertexFormat) {
    // generate shader variant - its the same shader, but with different processing options
    const processingOptions = new ShaderProcessorOptions(viewUniformFormat, viewBindGroupFormat, vertexFormat);
    return processShader(this._shader, processingOptions);
  }

  /**
   * Applies any changes made to the material's properties.
   */
  update() {
    this.dirty = true;
    if (this._shader) this._shader.failed = false;
  }

  // Parameter management
  clearParameters() {
    this.parameters = {};
  }
  getParameters() {
    return this.parameters;
  }
  clearVariants() {
    // clear variants on the material
    this.variants.clear();

    // but also clear them from all materials that reference them
    const meshInstances = this.meshInstances;
    const count = meshInstances.length;
    for (let i = 0; i < count; i++) {
      meshInstances[i].clearShaders();
    }
  }

  /**
   * Retrieves the specified shader parameter from a material.
   *
   * @param {string} name - The name of the parameter to query.
   * @returns {object} The named parameter.
   */
  getParameter(name) {
    return this.parameters[name];
  }

  /**
   * Sets a shader parameter on a material.
   *
   * @param {string} name - The name of the parameter to set.
   * @param {number|number[]|Float32Array|import('../../platform/graphics/texture.js').Texture} data -
   * The value for the specified parameter.
   */
  setParameter(name, data) {
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
    } else {
      this.parameters[name] = {
        scopeId: null,
        data: data
      };
    }
  }

  /**
   * Deletes a shader parameter on a material.
   *
   * @param {string} name - The name of the parameter to delete.
   */
  deleteParameter(name) {
    if (this.parameters[name]) {
      delete this.parameters[name];
    }
  }

  // used to apply parameters from this material into scope of uniforms, called internally by forward-renderer
  // optional list of parameter names to be set can be specified, otherwise all parameters are set
  setParameters(device, names) {
    const parameters = this.parameters;
    if (names === undefined) names = parameters;
    for (const paramName in names) {
      const parameter = parameters[paramName];
      if (parameter) {
        if (!parameter.scopeId) {
          parameter.scopeId = device.scope.resolve(paramName);
        }
        parameter.scopeId.setValue(parameter.data);
      }
    }
  }

  /**
   * Removes this material from the scene and possibly frees up memory from its shaders (if there
   * are no other materials using it).
   */
  destroy() {
    this.variants.clear();
    this._shader = null;
    for (let i = 0; i < this.meshInstances.length; i++) {
      const meshInstance = this.meshInstances[i];
      meshInstance.clearShaders();
      meshInstance._material = null;
      if (meshInstance.mesh) {
        const defaultMaterial = getDefaultMaterial(meshInstance.mesh.device);
        if (this !== defaultMaterial) {
          meshInstance.material = defaultMaterial;
        }
      } else {
        Debug.warn('pc.Material: MeshInstance.mesh is null, default material cannot be assigned to the MeshInstance');
      }
    }
    this.meshInstances.length = 0;
  }

  /**
   * Registers mesh instance as referencing the material.
   *
   * @param {import('../mesh-instance.js').MeshInstance} meshInstance - The mesh instance to
   * de-register.
   * @ignore
   */
  addMeshInstanceRef(meshInstance) {
    this.meshInstances.push(meshInstance);
  }

  /**
   * De-registers mesh instance as referencing the material.
   *
   * @param {import('../mesh-instance.js').MeshInstance} meshInstance - The mesh instance to
   * de-register.
   * @ignore
   */
  removeMeshInstanceRef(meshInstance) {
    const meshInstances = this.meshInstances;
    const i = meshInstances.indexOf(meshInstance);
    if (i !== -1) {
      meshInstances.splice(i, 1);
    }
  }
}

export { Material };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWF0ZXJpYWwuanMiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9zY2VuZS9tYXRlcmlhbHMvbWF0ZXJpYWwuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgRGVidWcgfSBmcm9tICcuLi8uLi9jb3JlL2RlYnVnLmpzJztcblxuaW1wb3J0IHtcbiAgICBCTEVORE1PREVfWkVSTywgQkxFTkRNT0RFX09ORSwgQkxFTkRNT0RFX1NSQ19DT0xPUixcbiAgICBCTEVORE1PREVfRFNUX0NPTE9SLCBCTEVORE1PREVfT05FX01JTlVTX0RTVF9DT0xPUiwgQkxFTkRNT0RFX1NSQ19BTFBIQSxcbiAgICBCTEVORE1PREVfT05FX01JTlVTX1NSQ19BTFBIQSxcbiAgICBCTEVOREVRVUFUSU9OX0FERCwgQkxFTkRFUVVBVElPTl9SRVZFUlNFX1NVQlRSQUNULFxuICAgIEJMRU5ERVFVQVRJT05fTUlOLCBCTEVOREVRVUFUSU9OX01BWCxcbiAgICBDVUxMRkFDRV9CQUNLXG59IGZyb20gJy4uLy4uL3BsYXRmb3JtL2dyYXBoaWNzL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBCbGVuZFN0YXRlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vZ3JhcGhpY3MvYmxlbmQtc3RhdGUuanMnO1xuaW1wb3J0IHsgRGVwdGhTdGF0ZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2dyYXBoaWNzL2RlcHRoLXN0YXRlLmpzJztcbmltcG9ydCB7IFNoYWRlclByb2Nlc3Nvck9wdGlvbnMgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9ncmFwaGljcy9zaGFkZXItcHJvY2Vzc29yLW9wdGlvbnMuanMnO1xuXG5pbXBvcnQge1xuICAgIEJMRU5EX0FERElUSVZFLCBCTEVORF9OT1JNQUwsIEJMRU5EX05PTkUsIEJMRU5EX1BSRU1VTFRJUExJRUQsXG4gICAgQkxFTkRfTVVMVElQTElDQVRJVkUsIEJMRU5EX0FERElUSVZFQUxQSEEsIEJMRU5EX01VTFRJUExJQ0FUSVZFMlgsIEJMRU5EX1NDUkVFTixcbiAgICBCTEVORF9NSU4sIEJMRU5EX01BWCwgQkxFTkRfU1VCVFJBQ1RJVkVcbn0gZnJvbSAnLi4vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IHByb2Nlc3NTaGFkZXIgfSBmcm9tICcuLi9zaGFkZXItbGliL3V0aWxzLmpzJztcbmltcG9ydCB7IGdldERlZmF1bHRNYXRlcmlhbCB9IGZyb20gJy4vZGVmYXVsdC1tYXRlcmlhbC5qcyc7XG5cbi8vIGJsZW5kIG1vZGUgbWFwcGluZyB0byBvcCwgc3JjQmxlbmQgYW5kIGRzdEJsZW5kXG5jb25zdCBibGVuZE1vZGVzID0gW107XG5ibGVuZE1vZGVzW0JMRU5EX1NVQlRSQUNUSVZFXSA9IHsgc3JjOiBCTEVORE1PREVfT05FLCBkc3Q6IEJMRU5ETU9ERV9PTkUsIG9wOiBCTEVOREVRVUFUSU9OX1JFVkVSU0VfU1VCVFJBQ1QgfTtcbmJsZW5kTW9kZXNbQkxFTkRfTk9ORV0gPSB7IHNyYzogQkxFTkRNT0RFX09ORSwgZHN0OiBCTEVORE1PREVfWkVSTywgb3A6IEJMRU5ERVFVQVRJT05fQUREIH07XG5ibGVuZE1vZGVzW0JMRU5EX05PUk1BTF0gPSB7IHNyYzogQkxFTkRNT0RFX1NSQ19BTFBIQSwgZHN0OiBCTEVORE1PREVfT05FX01JTlVTX1NSQ19BTFBIQSwgb3A6IEJMRU5ERVFVQVRJT05fQUREIH07XG5ibGVuZE1vZGVzW0JMRU5EX1BSRU1VTFRJUExJRURdID0geyBzcmM6IEJMRU5ETU9ERV9PTkUsIGRzdDogQkxFTkRNT0RFX09ORV9NSU5VU19TUkNfQUxQSEEsIG9wOiBCTEVOREVRVUFUSU9OX0FERCB9O1xuYmxlbmRNb2Rlc1tCTEVORF9BRERJVElWRV0gPSB7IHNyYzogQkxFTkRNT0RFX09ORSwgZHN0OiBCTEVORE1PREVfT05FLCBvcDogQkxFTkRFUVVBVElPTl9BREQgfTtcbmJsZW5kTW9kZXNbQkxFTkRfQURESVRJVkVBTFBIQV0gPSB7IHNyYzogQkxFTkRNT0RFX1NSQ19BTFBIQSwgZHN0OiBCTEVORE1PREVfT05FLCBvcDogQkxFTkRFUVVBVElPTl9BREQgfTtcbmJsZW5kTW9kZXNbQkxFTkRfTVVMVElQTElDQVRJVkUyWF0gPSB7IHNyYzogQkxFTkRNT0RFX0RTVF9DT0xPUiwgZHN0OiBCTEVORE1PREVfU1JDX0NPTE9SLCBvcDogQkxFTkRFUVVBVElPTl9BREQgfTtcbmJsZW5kTW9kZXNbQkxFTkRfU0NSRUVOXSA9IHsgc3JjOiBCTEVORE1PREVfT05FX01JTlVTX0RTVF9DT0xPUiwgZHN0OiBCTEVORE1PREVfT05FLCBvcDogQkxFTkRFUVVBVElPTl9BREQgfTtcbmJsZW5kTW9kZXNbQkxFTkRfTVVMVElQTElDQVRJVkVdID0geyBzcmM6IEJMRU5ETU9ERV9EU1RfQ09MT1IsIGRzdDogQkxFTkRNT0RFX1pFUk8sIG9wOiBCTEVOREVRVUFUSU9OX0FERCB9O1xuYmxlbmRNb2Rlc1tCTEVORF9NSU5dID0geyBzcmM6IEJMRU5ETU9ERV9PTkUsIGRzdDogQkxFTkRNT0RFX09ORSwgb3A6IEJMRU5ERVFVQVRJT05fTUlOIH07XG5ibGVuZE1vZGVzW0JMRU5EX01BWF0gPSB7IHNyYzogQkxFTkRNT0RFX09ORSwgZHN0OiBCTEVORE1PREVfT05FLCBvcDogQkxFTkRFUVVBVElPTl9NQVggfTtcblxubGV0IGlkID0gMDtcblxuLyoqXG4gKiBBIG1hdGVyaWFsIGRldGVybWluZXMgaG93IGEgcGFydGljdWxhciBtZXNoIGluc3RhbmNlIGlzIHJlbmRlcmVkLiBJdCBzcGVjaWZpZXMgdGhlIHNoYWRlciBhbmRcbiAqIHJlbmRlciBzdGF0ZSB0aGF0IGlzIHNldCBiZWZvcmUgdGhlIG1lc2ggaW5zdGFuY2UgaXMgc3VibWl0dGVkIHRvIHRoZSBncmFwaGljcyBkZXZpY2UuXG4gKlxuICogQGNhdGVnb3J5IEdyYXBoaWNzXG4gKi9cbmNsYXNzIE1hdGVyaWFsIHtcbiAgICAvKipcbiAgICAgKiBBIHNoYWRlciB1c2VkIHRvIHJlbmRlciB0aGUgbWF0ZXJpYWwuIE5vdGUgdGhhdCB0aGlzIGlzIHVzZWQgb25seSBieSBtYXRlcmlhbHMgd2hlcmUgdGhlXG4gICAgICogdXNlciBzcGVjaWZpZXMgdGhlIHNoYWRlci4gTW9zdCBtYXRlcmlhbCB0eXBlcyBnZW5lcmF0ZSBtdWx0aXBsZSBzaGFkZXIgdmFyaWFudHMsIGFuZCBkbyBub3RcbiAgICAgKiBzZXQgdGhpcy5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtpbXBvcnQoJy4uLy4uL3BsYXRmb3JtL2dyYXBoaWNzL3NoYWRlci5qcycpLlNoYWRlcn1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9zaGFkZXIgPSBudWxsO1xuXG4gICAgLyoqXG4gICAgICogVGhlIG1lc2ggaW5zdGFuY2VzIHJlZmVyZW5jaW5nIHRoaXMgbWF0ZXJpYWxcbiAgICAgKlxuICAgICAqIEB0eXBlIHtpbXBvcnQoJy4uL21lc2gtaW5zdGFuY2UuanMnKS5NZXNoSW5zdGFuY2VbXX1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIG1lc2hJbnN0YW5jZXMgPSBbXTtcblxuICAgIC8qKlxuICAgICAqIFRoZSBuYW1lIG9mIHRoZSBtYXRlcmlhbC5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtzdHJpbmd9XG4gICAgICovXG4gICAgbmFtZSA9ICdVbnRpdGxlZCc7XG5cbiAgICAvKipcbiAgICAgKiBBIHVuaXF1ZSBpZCB0aGUgdXNlciBjYW4gYXNzaWduIHRvIHRoZSBtYXRlcmlhbC4gVGhlIGVuZ2luZSBpbnRlcm5hbGx5IGRvZXMgbm90IHVzZSB0aGlzIGZvclxuICAgICAqIGFueXRoaW5nLCBhbmQgdGhlIHVzZXIgY2FuIGFzc2lnbiBhIHZhbHVlIHRvIHRoaXMgaWQgZm9yIGFueSBwdXJwb3NlIHRoZXkgbGlrZS4gRGVmYXVsdHMgdG9cbiAgICAgKiBhbiBlbXB0eSBzdHJpbmcuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7c3RyaW5nfVxuICAgICAqL1xuICAgIHVzZXJJZCA9ICcnO1xuXG4gICAgaWQgPSBpZCsrO1xuXG4gICAgLyoqXG4gICAgICogVGhlIGNhY2hlIG9mIHNoYWRlciB2YXJpYW50cyBnZW5lcmF0ZWQgZm9yIHRoaXMgbWF0ZXJpYWwuIFRoZSBrZXkgcmVwcmVzZW50cyB0aGUgdW5pcXVlXG4gICAgICogdmFyaWFudCwgdGhlIHZhbHVlIGlzIHRoZSBzaGFkZXIuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7TWFwPHN0cmluZywgaW1wb3J0KCcuLi8uLi9wbGF0Zm9ybS9ncmFwaGljcy9zaGFkZXIuanMnKS5TaGFkZXI+fVxuICAgICAqIEBpZ25vcmVcbiAgICAgKi9cbiAgICB2YXJpYW50cyA9IG5ldyBNYXAoKTtcblxuICAgIHBhcmFtZXRlcnMgPSB7fTtcblxuICAgIC8qKlxuICAgICAqIFRoZSBhbHBoYSB0ZXN0IHJlZmVyZW5jZSB2YWx1ZSB0byBjb250cm9sIHdoaWNoIGZyYWdtZW50cyBhcmUgd3JpdHRlbiB0byB0aGUgY3VycmVudGx5XG4gICAgICogYWN0aXZlIHJlbmRlciB0YXJnZXQgYmFzZWQgb24gYWxwaGEgdmFsdWUuIEFsbCBmcmFnbWVudHMgd2l0aCBhbiBhbHBoYSB2YWx1ZSBvZiBsZXNzIHRoYW5cbiAgICAgKiB0aGUgYWxwaGFUZXN0IHJlZmVyZW5jZSB2YWx1ZSB3aWxsIGJlIGRpc2NhcmRlZC4gYWxwaGFUZXN0IGRlZmF1bHRzIHRvIDAgKGFsbCBmcmFnbWVudHNcbiAgICAgKiBwYXNzKS5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtudW1iZXJ9XG4gICAgICovXG4gICAgYWxwaGFUZXN0ID0gMDtcblxuICAgIC8qKlxuICAgICAqIEVuYWJsZXMgb3IgZGlzYWJsZXMgYWxwaGEgdG8gY292ZXJhZ2UgKFdlYkdMMiBvbmx5KS4gV2hlbiBlbmFibGVkLCBhbmQgaWYgaGFyZHdhcmVcbiAgICAgKiBhbnRpLWFsaWFzaW5nIGlzIG9uLCBsaW1pdGVkIG9yZGVyLWluZGVwZW5kZW50IHRyYW5zcGFyZW5jeSBjYW4gYmUgYWNoaWV2ZWQuIFF1YWxpdHkgZGVwZW5kc1xuICAgICAqIG9uIHRoZSBudW1iZXIgb2YgTVNBQSBzYW1wbGVzIG9mIHRoZSBjdXJyZW50IHJlbmRlciB0YXJnZXQuIEl0IGNhbiBuaWNlbHkgc29mdGVuIGVkZ2VzIG9mXG4gICAgICogb3RoZXJ3aXNlIHNoYXJwIGFscGhhIGN1dG91dHMsIGJ1dCBpc24ndCByZWNvbW1lbmRlZCBmb3IgbGFyZ2UgYXJlYSBzZW1pLXRyYW5zcGFyZW50XG4gICAgICogc3VyZmFjZXMuIE5vdGUsIHRoYXQgeW91IGRvbid0IG5lZWQgdG8gZW5hYmxlIGJsZW5kaW5nIHRvIG1ha2UgYWxwaGEgdG8gY292ZXJhZ2Ugd29yay4gSXRcbiAgICAgKiB3aWxsIHdvcmsgd2l0aG91dCBpdCwganVzdCBsaWtlIGFscGhhVGVzdC5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAqL1xuICAgIGFscGhhVG9Db3ZlcmFnZSA9IGZhbHNlO1xuXG4gICAgLyoqIEBpZ25vcmUgKi9cbiAgICBfYmxlbmRTdGF0ZSA9IG5ldyBCbGVuZFN0YXRlKCk7XG5cbiAgICAvKiogQGlnbm9yZSAqL1xuICAgIF9kZXB0aFN0YXRlID0gbmV3IERlcHRoU3RhdGUoKTtcblxuICAgIC8qKlxuICAgICAqIENvbnRyb2xzIGhvdyB0cmlhbmdsZXMgYXJlIGN1bGxlZCBiYXNlZCBvbiB0aGVpciBmYWNlIGRpcmVjdGlvbiB3aXRoIHJlc3BlY3QgdG8gdGhlXG4gICAgICogdmlld3BvaW50LiBDYW4gYmU6XG4gICAgICpcbiAgICAgKiAtIHtAbGluayBDVUxMRkFDRV9OT05FfTogRG8gbm90IGN1bGwgdHJpYW5nbGVzIGJhc2VkIG9uIGZhY2UgZGlyZWN0aW9uLlxuICAgICAqIC0ge0BsaW5rIENVTExGQUNFX0JBQ0t9OiBDdWxsIHRoZSBiYWNrIGZhY2VzIG9mIHRyaWFuZ2xlcyAoZG8gbm90IHJlbmRlciB0cmlhbmdsZXMgZmFjaW5nXG4gICAgICogYXdheSBmcm9tIHRoZSB2aWV3IHBvaW50KS5cbiAgICAgKiAtIHtAbGluayBDVUxMRkFDRV9GUk9OVH06IEN1bGwgdGhlIGZyb250IGZhY2VzIG9mIHRyaWFuZ2xlcyAoZG8gbm90IHJlbmRlciB0cmlhbmdsZXMgZmFjaW5nXG4gICAgICogdG93YXJkcyB0aGUgdmlldyBwb2ludCkuXG4gICAgICpcbiAgICAgKiBEZWZhdWx0cyB0byB7QGxpbmsgQ1VMTEZBQ0VfQkFDS30uXG4gICAgICpcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqL1xuICAgIGN1bGwgPSBDVUxMRkFDRV9CQUNLO1xuXG4gICAgLyoqXG4gICAgICogU3RlbmNpbCBwYXJhbWV0ZXJzIGZvciBmcm9udCBmYWNlcyAoZGVmYXVsdCBpcyBudWxsKS5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtpbXBvcnQoJy4uLy4uL3BsYXRmb3JtL2dyYXBoaWNzL3N0ZW5jaWwtcGFyYW1ldGVycy5qcycpLlN0ZW5jaWxQYXJhbWV0ZXJzfG51bGx9XG4gICAgICovXG4gICAgc3RlbmNpbEZyb250ID0gbnVsbDtcblxuICAgIC8qKlxuICAgICAqIFN0ZW5jaWwgcGFyYW1ldGVycyBmb3IgYmFjayBmYWNlcyAoZGVmYXVsdCBpcyBudWxsKS5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtpbXBvcnQoJy4uLy4uL3BsYXRmb3JtL2dyYXBoaWNzL3N0ZW5jaWwtcGFyYW1ldGVycy5qcycpLlN0ZW5jaWxQYXJhbWV0ZXJzfG51bGx9XG4gICAgICovXG4gICAgc3RlbmNpbEJhY2sgPSBudWxsO1xuXG4gICAgLyoqXG4gICAgICogT2Zmc2V0cyB0aGUgb3V0cHV0IGRlcHRoIGJ1ZmZlciB2YWx1ZS4gVXNlZnVsIGZvciBkZWNhbHMgdG8gcHJldmVudCB6LWZpZ2h0aW5nLlxuICAgICAqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKi9cbiAgICBkZXB0aEJpYXMgPSAwO1xuXG4gICAgLyoqXG4gICAgICogU2FtZSBhcyB7QGxpbmsgTWF0ZXJpYWwjZGVwdGhCaWFzfSwgYnV0IGFsc28gZGVwZW5kcyBvbiB0aGUgc2xvcGUgb2YgdGhlIHRyaWFuZ2xlIHJlbGF0aXZlXG4gICAgICogdG8gdGhlIGNhbWVyYS5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtudW1iZXJ9XG4gICAgICovXG4gICAgc2xvcGVEZXB0aEJpYXMgPSAwO1xuXG4gICAgX3NoYWRlclZlcnNpb24gPSAwO1xuXG4gICAgX3NjZW5lID0gbnVsbDtcblxuICAgIGRpcnR5ID0gdHJ1ZTtcblxuICAgIC8qKlxuICAgICAqIElmIHRydWUsIHRoZSByZWQgY29tcG9uZW50IG9mIGZyYWdtZW50cyBnZW5lcmF0ZWQgYnkgdGhlIHNoYWRlciBvZiB0aGlzIG1hdGVyaWFsIGlzIHdyaXR0ZW5cbiAgICAgKiB0byB0aGUgY29sb3IgYnVmZmVyIG9mIHRoZSBjdXJyZW50bHkgYWN0aXZlIHJlbmRlciB0YXJnZXQuIElmIGZhbHNlLCB0aGUgcmVkIGNvbXBvbmVudCB3aWxsXG4gICAgICogbm90IGJlIHdyaXR0ZW4uIERlZmF1bHRzIHRvIHRydWUuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICAgKi9cbiAgICBzZXQgcmVkV3JpdGUodmFsdWUpIHtcbiAgICAgICAgdGhpcy5fYmxlbmRTdGF0ZS5yZWRXcml0ZSA9IHZhbHVlO1xuICAgIH1cblxuICAgIGdldCByZWRXcml0ZSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2JsZW5kU3RhdGUucmVkV3JpdGU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSWYgdHJ1ZSwgdGhlIGdyZWVuIGNvbXBvbmVudCBvZiBmcmFnbWVudHMgZ2VuZXJhdGVkIGJ5IHRoZSBzaGFkZXIgb2YgdGhpcyBtYXRlcmlhbCBpc1xuICAgICAqIHdyaXR0ZW4gdG8gdGhlIGNvbG9yIGJ1ZmZlciBvZiB0aGUgY3VycmVudGx5IGFjdGl2ZSByZW5kZXIgdGFyZ2V0LiBJZiBmYWxzZSwgdGhlIGdyZWVuXG4gICAgICogY29tcG9uZW50IHdpbGwgbm90IGJlIHdyaXR0ZW4uIERlZmF1bHRzIHRvIHRydWUuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICAgKi9cbiAgICBzZXQgZ3JlZW5Xcml0ZSh2YWx1ZSkge1xuICAgICAgICB0aGlzLl9ibGVuZFN0YXRlLmdyZWVuV3JpdGUgPSB2YWx1ZTtcbiAgICB9XG5cbiAgICBnZXQgZ3JlZW5Xcml0ZSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2JsZW5kU3RhdGUuZ3JlZW5Xcml0ZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJZiB0cnVlLCB0aGUgYmx1ZSBjb21wb25lbnQgb2YgZnJhZ21lbnRzIGdlbmVyYXRlZCBieSB0aGUgc2hhZGVyIG9mIHRoaXMgbWF0ZXJpYWwgaXNcbiAgICAgKiB3cml0dGVuIHRvIHRoZSBjb2xvciBidWZmZXIgb2YgdGhlIGN1cnJlbnRseSBhY3RpdmUgcmVuZGVyIHRhcmdldC4gSWYgZmFsc2UsIHRoZSBibHVlXG4gICAgICogY29tcG9uZW50IHdpbGwgbm90IGJlIHdyaXR0ZW4uIERlZmF1bHRzIHRvIHRydWUuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICAgKi9cbiAgICBzZXQgYmx1ZVdyaXRlKHZhbHVlKSB7XG4gICAgICAgIHRoaXMuX2JsZW5kU3RhdGUuYmx1ZVdyaXRlID0gdmFsdWU7XG4gICAgfVxuXG4gICAgZ2V0IGJsdWVXcml0ZSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2JsZW5kU3RhdGUuYmx1ZVdyaXRlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIElmIHRydWUsIHRoZSBhbHBoYSBjb21wb25lbnQgb2YgZnJhZ21lbnRzIGdlbmVyYXRlZCBieSB0aGUgc2hhZGVyIG9mIHRoaXMgbWF0ZXJpYWwgaXNcbiAgICAgKiB3cml0dGVuIHRvIHRoZSBjb2xvciBidWZmZXIgb2YgdGhlIGN1cnJlbnRseSBhY3RpdmUgcmVuZGVyIHRhcmdldC4gSWYgZmFsc2UsIHRoZSBhbHBoYVxuICAgICAqIGNvbXBvbmVudCB3aWxsIG5vdCBiZSB3cml0dGVuLiBEZWZhdWx0cyB0byB0cnVlLlxuICAgICAqXG4gICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICovXG4gICAgc2V0IGFscGhhV3JpdGUodmFsdWUpIHtcbiAgICAgICAgdGhpcy5fYmxlbmRTdGF0ZS5hbHBoYVdyaXRlID0gdmFsdWU7XG4gICAgfVxuXG4gICAgZ2V0IGFscGhhV3JpdGUoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9ibGVuZFN0YXRlLmFscGhhV3JpdGU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVGhlIHNoYWRlciB1c2VkIGJ5IHRoaXMgbWF0ZXJpYWwgdG8gcmVuZGVyIG1lc2ggaW5zdGFuY2VzIChkZWZhdWx0IGlzIG51bGwpLlxuICAgICAqXG4gICAgICogQHR5cGUge2ltcG9ydCgnLi4vLi4vcGxhdGZvcm0vZ3JhcGhpY3Mvc2hhZGVyLmpzJykuU2hhZGVyfG51bGx9XG4gICAgICovXG4gICAgc2V0IHNoYWRlcihzaGFkZXIpIHtcbiAgICAgICAgdGhpcy5fc2hhZGVyID0gc2hhZGVyO1xuICAgIH1cblxuICAgIGdldCBzaGFkZXIoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9zaGFkZXI7XG4gICAgfVxuXG4gICAgLy8gcmV0dXJucyBib29sZWFuIGRlcGVuZGluZyBvbiBtYXRlcmlhbCBiZWluZyB0cmFuc3BhcmVudFxuICAgIGdldCB0cmFuc3BhcmVudCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2JsZW5kU3RhdGUuYmxlbmQ7XG4gICAgfVxuXG4gICAgX3VwZGF0ZVRyYW5zcGFyZW5jeSgpIHtcbiAgICAgICAgY29uc3QgdHJhbnNwYXJlbnQgPSB0aGlzLnRyYW5zcGFyZW50O1xuICAgICAgICBjb25zdCBtZXNoSW5zdGFuY2VzID0gdGhpcy5tZXNoSW5zdGFuY2VzO1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG1lc2hJbnN0YW5jZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIG1lc2hJbnN0YW5jZXNbaV0udHJhbnNwYXJlbnQgPSB0cmFuc3BhcmVudDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENvbnRyb2xzIGhvdyBmcmFnbWVudCBzaGFkZXIgb3V0cHV0cyBhcmUgYmxlbmRlZCB3aGVuIGJlaW5nIHdyaXR0ZW4gdG8gdGhlIGN1cnJlbnRseSBhY3RpdmVcbiAgICAgKiByZW5kZXIgdGFyZ2V0LiBUaGlzIG92ZXJ3cml0ZXMgYmxlbmRpbmcgdHlwZSBzZXQgdXNpbmcge0BsaW5rIE1hdGVyaWFsI2JsZW5kVHlwZX0sIGFuZFxuICAgICAqIG9mZmVycyBtb3JlIGNvbnRyb2wgb3ZlciBibGVuZGluZy5cbiAgICAgKlxuICAgICAqIEB0eXBlIHsgQmxlbmRTdGF0ZSB9XG4gICAgICovXG4gICAgc2V0IGJsZW5kU3RhdGUodmFsdWUpIHtcbiAgICAgICAgdGhpcy5fYmxlbmRTdGF0ZS5jb3B5KHZhbHVlKTtcbiAgICAgICAgdGhpcy5fdXBkYXRlVHJhbnNwYXJlbmN5KCk7XG4gICAgfVxuXG4gICAgZ2V0IGJsZW5kU3RhdGUoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9ibGVuZFN0YXRlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENvbnRyb2xzIGhvdyBmcmFnbWVudCBzaGFkZXIgb3V0cHV0cyBhcmUgYmxlbmRlZCB3aGVuIGJlaW5nIHdyaXR0ZW4gdG8gdGhlIGN1cnJlbnRseSBhY3RpdmVcbiAgICAgKiByZW5kZXIgdGFyZ2V0LiBDYW4gYmU6XG4gICAgICpcbiAgICAgKiAtIHtAbGluayBCTEVORF9TVUJUUkFDVElWRX06IFN1YnRyYWN0IHRoZSBjb2xvciBvZiB0aGUgc291cmNlIGZyYWdtZW50IGZyb20gdGhlIGRlc3RpbmF0aW9uXG4gICAgICogZnJhZ21lbnQgYW5kIHdyaXRlIHRoZSByZXN1bHQgdG8gdGhlIGZyYW1lIGJ1ZmZlci5cbiAgICAgKiAtIHtAbGluayBCTEVORF9BRERJVElWRX06IEFkZCB0aGUgY29sb3Igb2YgdGhlIHNvdXJjZSBmcmFnbWVudCB0byB0aGUgZGVzdGluYXRpb24gZnJhZ21lbnRcbiAgICAgKiBhbmQgd3JpdGUgdGhlIHJlc3VsdCB0byB0aGUgZnJhbWUgYnVmZmVyLlxuICAgICAqIC0ge0BsaW5rIEJMRU5EX05PUk1BTH06IEVuYWJsZSBzaW1wbGUgdHJhbnNsdWNlbmN5IGZvciBtYXRlcmlhbHMgc3VjaCBhcyBnbGFzcy4gVGhpcyBpc1xuICAgICAqIGVxdWl2YWxlbnQgdG8gZW5hYmxpbmcgYSBzb3VyY2UgYmxlbmQgbW9kZSBvZiB7QGxpbmsgQkxFTkRNT0RFX1NSQ19BTFBIQX0gYW5kIGEgZGVzdGluYXRpb25cbiAgICAgKiBibGVuZCBtb2RlIG9mIHtAbGluayBCTEVORE1PREVfT05FX01JTlVTX1NSQ19BTFBIQX0uXG4gICAgICogLSB7QGxpbmsgQkxFTkRfTk9ORX06IERpc2FibGUgYmxlbmRpbmcuXG4gICAgICogLSB7QGxpbmsgQkxFTkRfUFJFTVVMVElQTElFRH06IFNpbWlsYXIgdG8ge0BsaW5rIEJMRU5EX05PUk1BTH0gZXhwZWN0IHRoZSBzb3VyY2UgZnJhZ21lbnQgaXNcbiAgICAgKiBhc3N1bWVkIHRvIGhhdmUgYWxyZWFkeSBiZWVuIG11bHRpcGxpZWQgYnkgdGhlIHNvdXJjZSBhbHBoYSB2YWx1ZS5cbiAgICAgKiAtIHtAbGluayBCTEVORF9NVUxUSVBMSUNBVElWRX06IE11bHRpcGx5IHRoZSBjb2xvciBvZiB0aGUgc291cmNlIGZyYWdtZW50IGJ5IHRoZSBjb2xvciBvZiB0aGVcbiAgICAgKiBkZXN0aW5hdGlvbiBmcmFnbWVudCBhbmQgd3JpdGUgdGhlIHJlc3VsdCB0byB0aGUgZnJhbWUgYnVmZmVyLlxuICAgICAqIC0ge0BsaW5rIEJMRU5EX0FERElUSVZFQUxQSEF9OiBTYW1lIGFzIHtAbGluayBCTEVORF9BRERJVElWRX0gZXhjZXB0IHRoZSBzb3VyY2UgUkdCIGlzXG4gICAgICogbXVsdGlwbGllZCBieSB0aGUgc291cmNlIGFscGhhLlxuICAgICAqIC0ge0BsaW5rIEJMRU5EX01VTFRJUExJQ0FUSVZFMlh9OiBNdWx0aXBsaWVzIGNvbG9ycyBhbmQgZG91YmxlcyB0aGUgcmVzdWx0LlxuICAgICAqIC0ge0BsaW5rIEJMRU5EX1NDUkVFTn06IFNvZnRlciB2ZXJzaW9uIG9mIGFkZGl0aXZlLlxuICAgICAqIC0ge0BsaW5rIEJMRU5EX01JTn06IE1pbmltdW0gY29sb3IuIENoZWNrIGFwcC5ncmFwaGljc0RldmljZS5leHRCbGVuZE1pbm1heCBmb3Igc3VwcG9ydC5cbiAgICAgKiAtIHtAbGluayBCTEVORF9NQVh9OiBNYXhpbXVtIGNvbG9yLiBDaGVjayBhcHAuZ3JhcGhpY3NEZXZpY2UuZXh0QmxlbmRNaW5tYXggZm9yIHN1cHBvcnQuXG4gICAgICpcbiAgICAgKiBEZWZhdWx0cyB0byB7QGxpbmsgQkxFTkRfTk9ORX0uXG4gICAgICpcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqL1xuICAgIHNldCBibGVuZFR5cGUodHlwZSkge1xuXG4gICAgICAgIGNvbnN0IGJsZW5kTW9kZSA9IGJsZW5kTW9kZXNbdHlwZV07XG4gICAgICAgIERlYnVnLmFzc2VydChibGVuZE1vZGUsIGBVbmtub3duIGJsZW5kIG1vZGUgJHt0eXBlfWApO1xuICAgICAgICB0aGlzLl9ibGVuZFN0YXRlLnNldENvbG9yQmxlbmQoYmxlbmRNb2RlLm9wLCBibGVuZE1vZGUuc3JjLCBibGVuZE1vZGUuZHN0KTtcbiAgICAgICAgdGhpcy5fYmxlbmRTdGF0ZS5zZXRBbHBoYUJsZW5kKGJsZW5kTW9kZS5vcCwgYmxlbmRNb2RlLnNyYywgYmxlbmRNb2RlLmRzdCk7XG5cbiAgICAgICAgY29uc3QgYmxlbmQgPSB0eXBlICE9PSBCTEVORF9OT05FO1xuICAgICAgICBpZiAodGhpcy5fYmxlbmRTdGF0ZS5ibGVuZCAhPT0gYmxlbmQpIHtcbiAgICAgICAgICAgIHRoaXMuX2JsZW5kU3RhdGUuYmxlbmQgPSBibGVuZDtcbiAgICAgICAgICAgIHRoaXMuX3VwZGF0ZVRyYW5zcGFyZW5jeSgpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuX3VwZGF0ZU1lc2hJbnN0YW5jZUtleXMoKTtcbiAgICB9XG5cbiAgICBnZXQgYmxlbmRUeXBlKCkge1xuICAgICAgICBpZiAoIXRoaXMudHJhbnNwYXJlbnQpIHtcbiAgICAgICAgICAgIHJldHVybiBCTEVORF9OT05FO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgeyBjb2xvck9wLCBjb2xvclNyY0ZhY3RvciwgY29sb3JEc3RGYWN0b3IsIGFscGhhT3AsIGFscGhhU3JjRmFjdG9yLCBhbHBoYURzdEZhY3RvciB9ID0gdGhpcy5fYmxlbmRTdGF0ZTtcblxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGJsZW5kTW9kZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGNvbnN0IGJsZW5kTW9kZSA9IGJsZW5kTW9kZXNbaV07XG4gICAgICAgICAgICBpZiAoYmxlbmRNb2RlLnNyYyA9PT0gY29sb3JTcmNGYWN0b3IgJiYgYmxlbmRNb2RlLmRzdCA9PT0gY29sb3JEc3RGYWN0b3IgJiYgYmxlbmRNb2RlLm9wID09PSBjb2xvck9wICYmXG4gICAgICAgICAgICAgICAgYmxlbmRNb2RlLnNyYyA9PT0gYWxwaGFTcmNGYWN0b3IgJiYgYmxlbmRNb2RlLmRzdCA9PT0gYWxwaGFEc3RGYWN0b3IgJiYgYmxlbmRNb2RlLm9wID09PSBhbHBoYU9wKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gQkxFTkRfTk9STUFMO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIGRlcHRoIHN0YXRlLiBOb3RlIHRoYXQgdGhpcyBjYW4gYWxzbyBiZSBkb25lIGJ5IHVzaW5nIHtAbGluayBNYXRlcmlhbCNkZXB0aFRlc3R9LFxuICAgICAqIHtAbGluayBNYXRlcmlhbCNkZXB0aEZ1bmN9IGFuZCB7QGxpbmsgTWF0ZXJpYWwjZGVwdGhXcml0ZX0uXG4gICAgICpcbiAgICAgKiBAdHlwZSB7IERlcHRoU3RhdGUgfVxuICAgICAqL1xuICAgIHNldCBkZXB0aFN0YXRlKHZhbHVlKSB7XG4gICAgICAgIHRoaXMuX2RlcHRoU3RhdGUuY29weSh2YWx1ZSk7XG4gICAgfVxuXG4gICAgZ2V0IGRlcHRoU3RhdGUoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9kZXB0aFN0YXRlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIElmIHRydWUsIGZyYWdtZW50cyBnZW5lcmF0ZWQgYnkgdGhlIHNoYWRlciBvZiB0aGlzIG1hdGVyaWFsIGFyZSBvbmx5IHdyaXR0ZW4gdG8gdGhlIGN1cnJlbnRcbiAgICAgKiByZW5kZXIgdGFyZ2V0IGlmIHRoZXkgcGFzcyB0aGUgZGVwdGggdGVzdC4gSWYgZmFsc2UsIGZyYWdtZW50cyBnZW5lcmF0ZWQgYnkgdGhlIHNoYWRlciBvZlxuICAgICAqIHRoaXMgbWF0ZXJpYWwgYXJlIHdyaXR0ZW4gdG8gdGhlIGN1cnJlbnQgcmVuZGVyIHRhcmdldCByZWdhcmRsZXNzIG9mIHdoYXQgaXMgaW4gdGhlIGRlcHRoXG4gICAgICogYnVmZmVyLiBEZWZhdWx0cyB0byB0cnVlLlxuICAgICAqXG4gICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICovXG4gICAgc2V0IGRlcHRoVGVzdCh2YWx1ZSkge1xuICAgICAgICB0aGlzLl9kZXB0aFN0YXRlLnRlc3QgPSB2YWx1ZTtcbiAgICB9XG5cbiAgICBnZXQgZGVwdGhUZXN0KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fZGVwdGhTdGF0ZS50ZXN0O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENvbnRyb2xzIGhvdyB0aGUgZGVwdGggb2YgbmV3IGZyYWdtZW50cyBpcyBjb21wYXJlZCBhZ2FpbnN0IHRoZSBjdXJyZW50IGRlcHRoIGNvbnRhaW5lZCBpblxuICAgICAqIHRoZSBkZXB0aCBidWZmZXIuIENhbiBiZTpcbiAgICAgKlxuICAgICAqIC0ge0BsaW5rIEZVTkNfTkVWRVJ9OiBkb24ndCBkcmF3XG4gICAgICogLSB7QGxpbmsgRlVOQ19MRVNTfTogZHJhdyBpZiBuZXcgZGVwdGggPCBkZXB0aCBidWZmZXJcbiAgICAgKiAtIHtAbGluayBGVU5DX0VRVUFMfTogZHJhdyBpZiBuZXcgZGVwdGggPT0gZGVwdGggYnVmZmVyXG4gICAgICogLSB7QGxpbmsgRlVOQ19MRVNTRVFVQUx9OiBkcmF3IGlmIG5ldyBkZXB0aCA8PSBkZXB0aCBidWZmZXJcbiAgICAgKiAtIHtAbGluayBGVU5DX0dSRUFURVJ9OiBkcmF3IGlmIG5ldyBkZXB0aCA+IGRlcHRoIGJ1ZmZlclxuICAgICAqIC0ge0BsaW5rIEZVTkNfTk9URVFVQUx9OiBkcmF3IGlmIG5ldyBkZXB0aCAhPSBkZXB0aCBidWZmZXJcbiAgICAgKiAtIHtAbGluayBGVU5DX0dSRUFURVJFUVVBTH06IGRyYXcgaWYgbmV3IGRlcHRoID49IGRlcHRoIGJ1ZmZlclxuICAgICAqIC0ge0BsaW5rIEZVTkNfQUxXQVlTfTogYWx3YXlzIGRyYXdcbiAgICAgKlxuICAgICAqIERlZmF1bHRzIHRvIHtAbGluayBGVU5DX0xFU1NFUVVBTH0uXG4gICAgICpcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqL1xuICAgIHNldCBkZXB0aEZ1bmModmFsdWUpIHtcbiAgICAgICAgdGhpcy5fZGVwdGhTdGF0ZS5mdW5jID0gdmFsdWU7XG4gICAgfVxuXG4gICAgZ2V0IGRlcHRoRnVuYygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2RlcHRoU3RhdGUuZnVuYztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJZiB0cnVlLCBmcmFnbWVudHMgZ2VuZXJhdGVkIGJ5IHRoZSBzaGFkZXIgb2YgdGhpcyBtYXRlcmlhbCB3cml0ZSBhIGRlcHRoIHZhbHVlIHRvIHRoZSBkZXB0aFxuICAgICAqIGJ1ZmZlciBvZiB0aGUgY3VycmVudGx5IGFjdGl2ZSByZW5kZXIgdGFyZ2V0LiBJZiBmYWxzZSwgbm8gZGVwdGggdmFsdWUgaXMgd3JpdHRlbi4gRGVmYXVsdHNcbiAgICAgKiB0byB0cnVlLlxuICAgICAqXG4gICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICovXG4gICAgc2V0IGRlcHRoV3JpdGUodmFsdWUpIHtcbiAgICAgICAgdGhpcy5fZGVwdGhTdGF0ZS53cml0ZSA9IHZhbHVlO1xuICAgIH1cblxuICAgIGdldCBkZXB0aFdyaXRlKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fZGVwdGhTdGF0ZS53cml0ZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDb3B5IGEgbWF0ZXJpYWwuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge01hdGVyaWFsfSBzb3VyY2UgLSBUaGUgbWF0ZXJpYWwgdG8gY29weS5cbiAgICAgKiBAcmV0dXJucyB7TWF0ZXJpYWx9IFRoZSBkZXN0aW5hdGlvbiBtYXRlcmlhbC5cbiAgICAgKi9cbiAgICBjb3B5KHNvdXJjZSkge1xuICAgICAgICB0aGlzLm5hbWUgPSBzb3VyY2UubmFtZTtcbiAgICAgICAgdGhpcy5fc2hhZGVyID0gc291cmNlLl9zaGFkZXI7XG5cbiAgICAgICAgLy8gUmVuZGVyIHN0YXRlc1xuICAgICAgICB0aGlzLmFscGhhVGVzdCA9IHNvdXJjZS5hbHBoYVRlc3Q7XG4gICAgICAgIHRoaXMuYWxwaGFUb0NvdmVyYWdlID0gc291cmNlLmFscGhhVG9Db3ZlcmFnZTtcblxuICAgICAgICB0aGlzLl9ibGVuZFN0YXRlLmNvcHkoc291cmNlLl9ibGVuZFN0YXRlKTtcbiAgICAgICAgdGhpcy5fZGVwdGhTdGF0ZS5jb3B5KHNvdXJjZS5fZGVwdGhTdGF0ZSk7XG5cbiAgICAgICAgdGhpcy5jdWxsID0gc291cmNlLmN1bGw7XG5cbiAgICAgICAgdGhpcy5kZXB0aEJpYXMgPSBzb3VyY2UuZGVwdGhCaWFzO1xuICAgICAgICB0aGlzLnNsb3BlRGVwdGhCaWFzID0gc291cmNlLnNsb3BlRGVwdGhCaWFzO1xuXG4gICAgICAgIHRoaXMuc3RlbmNpbEZyb250ID0gc291cmNlLnN0ZW5jaWxGcm9udD8uY2xvbmUoKTtcbiAgICAgICAgaWYgKHNvdXJjZS5zdGVuY2lsQmFjaykge1xuICAgICAgICAgICAgdGhpcy5zdGVuY2lsQmFjayA9IHNvdXJjZS5zdGVuY2lsRnJvbnQgPT09IHNvdXJjZS5zdGVuY2lsQmFjayA/IHRoaXMuc3RlbmNpbEZyb250IDogc291cmNlLnN0ZW5jaWxCYWNrLmNsb25lKCk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDbG9uZSBhIG1hdGVyaWFsLlxuICAgICAqXG4gICAgICogQHJldHVybnMge3RoaXN9IEEgbmV3bHkgY2xvbmVkIG1hdGVyaWFsLlxuICAgICAqL1xuICAgIGNsb25lKCkge1xuICAgICAgICBjb25zdCBjbG9uZSA9IG5ldyB0aGlzLmNvbnN0cnVjdG9yKCk7XG4gICAgICAgIHJldHVybiBjbG9uZS5jb3B5KHRoaXMpO1xuICAgIH1cblxuICAgIF91cGRhdGVNZXNoSW5zdGFuY2VLZXlzKCkge1xuICAgICAgICBjb25zdCBtZXNoSW5zdGFuY2VzID0gdGhpcy5tZXNoSW5zdGFuY2VzO1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG1lc2hJbnN0YW5jZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIG1lc2hJbnN0YW5jZXNbaV0udXBkYXRlS2V5KCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICB1cGRhdGVVbmlmb3JtcyhkZXZpY2UsIHNjZW5lKSB7XG4gICAgfVxuXG4gICAgLy8gVE9ETzogdW51c2VkIHBhcmFtZXRlciBzaG91bGQgYmUgcmVtb3ZlZCwgYnV0IHRoZSBFZGl0b3Igc3RpbGwgdXNlcyB0aGlzIGZ1bmN0aW9uXG4gICAgZ2V0U2hhZGVyVmFyaWFudChkZXZpY2UsIHNjZW5lLCBvYmpEZWZzLCB1bnVzZWQsIHBhc3MsIHNvcnRlZExpZ2h0cywgdmlld1VuaWZvcm1Gb3JtYXQsIHZpZXdCaW5kR3JvdXBGb3JtYXQsIHZlcnRleEZvcm1hdCkge1xuXG4gICAgICAgIC8vIGdlbmVyYXRlIHNoYWRlciB2YXJpYW50IC0gaXRzIHRoZSBzYW1lIHNoYWRlciwgYnV0IHdpdGggZGlmZmVyZW50IHByb2Nlc3Npbmcgb3B0aW9uc1xuICAgICAgICBjb25zdCBwcm9jZXNzaW5nT3B0aW9ucyA9IG5ldyBTaGFkZXJQcm9jZXNzb3JPcHRpb25zKHZpZXdVbmlmb3JtRm9ybWF0LCB2aWV3QmluZEdyb3VwRm9ybWF0LCB2ZXJ0ZXhGb3JtYXQpO1xuICAgICAgICByZXR1cm4gcHJvY2Vzc1NoYWRlcih0aGlzLl9zaGFkZXIsIHByb2Nlc3NpbmdPcHRpb25zKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBcHBsaWVzIGFueSBjaGFuZ2VzIG1hZGUgdG8gdGhlIG1hdGVyaWFsJ3MgcHJvcGVydGllcy5cbiAgICAgKi9cbiAgICB1cGRhdGUoKSB7XG4gICAgICAgIHRoaXMuZGlydHkgPSB0cnVlO1xuICAgICAgICBpZiAodGhpcy5fc2hhZGVyKSB0aGlzLl9zaGFkZXIuZmFpbGVkID0gZmFsc2U7XG4gICAgfVxuXG4gICAgLy8gUGFyYW1ldGVyIG1hbmFnZW1lbnRcbiAgICBjbGVhclBhcmFtZXRlcnMoKSB7XG4gICAgICAgIHRoaXMucGFyYW1ldGVycyA9IHt9O1xuICAgIH1cblxuICAgIGdldFBhcmFtZXRlcnMoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnBhcmFtZXRlcnM7XG4gICAgfVxuXG4gICAgY2xlYXJWYXJpYW50cygpIHtcblxuICAgICAgICAvLyBjbGVhciB2YXJpYW50cyBvbiB0aGUgbWF0ZXJpYWxcbiAgICAgICAgdGhpcy52YXJpYW50cy5jbGVhcigpO1xuXG4gICAgICAgIC8vIGJ1dCBhbHNvIGNsZWFyIHRoZW0gZnJvbSBhbGwgbWF0ZXJpYWxzIHRoYXQgcmVmZXJlbmNlIHRoZW1cbiAgICAgICAgY29uc3QgbWVzaEluc3RhbmNlcyA9IHRoaXMubWVzaEluc3RhbmNlcztcbiAgICAgICAgY29uc3QgY291bnQgPSBtZXNoSW5zdGFuY2VzLmxlbmd0aDtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjb3VudDsgaSsrKSB7XG4gICAgICAgICAgICBtZXNoSW5zdGFuY2VzW2ldLmNsZWFyU2hhZGVycygpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0cmlldmVzIHRoZSBzcGVjaWZpZWQgc2hhZGVyIHBhcmFtZXRlciBmcm9tIGEgbWF0ZXJpYWwuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gbmFtZSAtIFRoZSBuYW1lIG9mIHRoZSBwYXJhbWV0ZXIgdG8gcXVlcnkuXG4gICAgICogQHJldHVybnMge29iamVjdH0gVGhlIG5hbWVkIHBhcmFtZXRlci5cbiAgICAgKi9cbiAgICBnZXRQYXJhbWV0ZXIobmFtZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5wYXJhbWV0ZXJzW25hbWVdO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgYSBzaGFkZXIgcGFyYW1ldGVyIG9uIGEgbWF0ZXJpYWwuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gbmFtZSAtIFRoZSBuYW1lIG9mIHRoZSBwYXJhbWV0ZXIgdG8gc2V0LlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfG51bWJlcltdfEZsb2F0MzJBcnJheXxpbXBvcnQoJy4uLy4uL3BsYXRmb3JtL2dyYXBoaWNzL3RleHR1cmUuanMnKS5UZXh0dXJlfSBkYXRhIC1cbiAgICAgKiBUaGUgdmFsdWUgZm9yIHRoZSBzcGVjaWZpZWQgcGFyYW1ldGVyLlxuICAgICAqL1xuICAgIHNldFBhcmFtZXRlcihuYW1lLCBkYXRhKSB7XG5cbiAgICAgICAgaWYgKGRhdGEgPT09IHVuZGVmaW5lZCAmJiB0eXBlb2YgbmFtZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgIGNvbnN0IHVuaWZvcm1PYmplY3QgPSBuYW1lO1xuICAgICAgICAgICAgaWYgKHVuaWZvcm1PYmplY3QubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB1bmlmb3JtT2JqZWN0Lmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0UGFyYW1ldGVyKHVuaWZvcm1PYmplY3RbaV0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBuYW1lID0gdW5pZm9ybU9iamVjdC5uYW1lO1xuICAgICAgICAgICAgZGF0YSA9IHVuaWZvcm1PYmplY3QudmFsdWU7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBwYXJhbSA9IHRoaXMucGFyYW1ldGVyc1tuYW1lXTtcbiAgICAgICAgaWYgKHBhcmFtKSB7XG4gICAgICAgICAgICBwYXJhbS5kYXRhID0gZGF0YTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMucGFyYW1ldGVyc1tuYW1lXSA9IHtcbiAgICAgICAgICAgICAgICBzY29wZUlkOiBudWxsLFxuICAgICAgICAgICAgICAgIGRhdGE6IGRhdGFcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBEZWxldGVzIGEgc2hhZGVyIHBhcmFtZXRlciBvbiBhIG1hdGVyaWFsLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IG5hbWUgLSBUaGUgbmFtZSBvZiB0aGUgcGFyYW1ldGVyIHRvIGRlbGV0ZS5cbiAgICAgKi9cbiAgICBkZWxldGVQYXJhbWV0ZXIobmFtZSkge1xuICAgICAgICBpZiAodGhpcy5wYXJhbWV0ZXJzW25hbWVdKSB7XG4gICAgICAgICAgICBkZWxldGUgdGhpcy5wYXJhbWV0ZXJzW25hbWVdO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gdXNlZCB0byBhcHBseSBwYXJhbWV0ZXJzIGZyb20gdGhpcyBtYXRlcmlhbCBpbnRvIHNjb3BlIG9mIHVuaWZvcm1zLCBjYWxsZWQgaW50ZXJuYWxseSBieSBmb3J3YXJkLXJlbmRlcmVyXG4gICAgLy8gb3B0aW9uYWwgbGlzdCBvZiBwYXJhbWV0ZXIgbmFtZXMgdG8gYmUgc2V0IGNhbiBiZSBzcGVjaWZpZWQsIG90aGVyd2lzZSBhbGwgcGFyYW1ldGVycyBhcmUgc2V0XG4gICAgc2V0UGFyYW1ldGVycyhkZXZpY2UsIG5hbWVzKSB7XG4gICAgICAgIGNvbnN0IHBhcmFtZXRlcnMgPSB0aGlzLnBhcmFtZXRlcnM7XG4gICAgICAgIGlmIChuYW1lcyA9PT0gdW5kZWZpbmVkKSBuYW1lcyA9IHBhcmFtZXRlcnM7XG4gICAgICAgIGZvciAoY29uc3QgcGFyYW1OYW1lIGluIG5hbWVzKSB7XG4gICAgICAgICAgICBjb25zdCBwYXJhbWV0ZXIgPSBwYXJhbWV0ZXJzW3BhcmFtTmFtZV07XG4gICAgICAgICAgICBpZiAocGFyYW1ldGVyKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFwYXJhbWV0ZXIuc2NvcGVJZCkge1xuICAgICAgICAgICAgICAgICAgICBwYXJhbWV0ZXIuc2NvcGVJZCA9IGRldmljZS5zY29wZS5yZXNvbHZlKHBhcmFtTmFtZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHBhcmFtZXRlci5zY29wZUlkLnNldFZhbHVlKHBhcmFtZXRlci5kYXRhKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJlbW92ZXMgdGhpcyBtYXRlcmlhbCBmcm9tIHRoZSBzY2VuZSBhbmQgcG9zc2libHkgZnJlZXMgdXAgbWVtb3J5IGZyb20gaXRzIHNoYWRlcnMgKGlmIHRoZXJlXG4gICAgICogYXJlIG5vIG90aGVyIG1hdGVyaWFscyB1c2luZyBpdCkuXG4gICAgICovXG4gICAgZGVzdHJveSgpIHtcbiAgICAgICAgdGhpcy52YXJpYW50cy5jbGVhcigpO1xuICAgICAgICB0aGlzLl9zaGFkZXIgPSBudWxsO1xuXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5tZXNoSW5zdGFuY2VzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBtZXNoSW5zdGFuY2UgPSB0aGlzLm1lc2hJbnN0YW5jZXNbaV07XG4gICAgICAgICAgICBtZXNoSW5zdGFuY2UuY2xlYXJTaGFkZXJzKCk7XG4gICAgICAgICAgICBtZXNoSW5zdGFuY2UuX21hdGVyaWFsID0gbnVsbDtcblxuICAgICAgICAgICAgaWYgKG1lc2hJbnN0YW5jZS5tZXNoKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZGVmYXVsdE1hdGVyaWFsID0gZ2V0RGVmYXVsdE1hdGVyaWFsKG1lc2hJbnN0YW5jZS5tZXNoLmRldmljZSk7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMgIT09IGRlZmF1bHRNYXRlcmlhbCkge1xuICAgICAgICAgICAgICAgICAgICBtZXNoSW5zdGFuY2UubWF0ZXJpYWwgPSBkZWZhdWx0TWF0ZXJpYWw7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBEZWJ1Zy53YXJuKCdwYy5NYXRlcmlhbDogTWVzaEluc3RhbmNlLm1lc2ggaXMgbnVsbCwgZGVmYXVsdCBtYXRlcmlhbCBjYW5ub3QgYmUgYXNzaWduZWQgdG8gdGhlIE1lc2hJbnN0YW5jZScpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5tZXNoSW5zdGFuY2VzLmxlbmd0aCA9IDA7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVnaXN0ZXJzIG1lc2ggaW5zdGFuY2UgYXMgcmVmZXJlbmNpbmcgdGhlIG1hdGVyaWFsLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4uL21lc2gtaW5zdGFuY2UuanMnKS5NZXNoSW5zdGFuY2V9IG1lc2hJbnN0YW5jZSAtIFRoZSBtZXNoIGluc3RhbmNlIHRvXG4gICAgICogZGUtcmVnaXN0ZXIuXG4gICAgICogQGlnbm9yZVxuICAgICAqL1xuICAgIGFkZE1lc2hJbnN0YW5jZVJlZihtZXNoSW5zdGFuY2UpIHtcbiAgICAgICAgdGhpcy5tZXNoSW5zdGFuY2VzLnB1c2gobWVzaEluc3RhbmNlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBEZS1yZWdpc3RlcnMgbWVzaCBpbnN0YW5jZSBhcyByZWZlcmVuY2luZyB0aGUgbWF0ZXJpYWwuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi4vbWVzaC1pbnN0YW5jZS5qcycpLk1lc2hJbnN0YW5jZX0gbWVzaEluc3RhbmNlIC0gVGhlIG1lc2ggaW5zdGFuY2UgdG9cbiAgICAgKiBkZS1yZWdpc3Rlci5cbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgcmVtb3ZlTWVzaEluc3RhbmNlUmVmKG1lc2hJbnN0YW5jZSkge1xuICAgICAgICBjb25zdCBtZXNoSW5zdGFuY2VzID0gdGhpcy5tZXNoSW5zdGFuY2VzO1xuICAgICAgICBjb25zdCBpID0gbWVzaEluc3RhbmNlcy5pbmRleE9mKG1lc2hJbnN0YW5jZSk7XG4gICAgICAgIGlmIChpICE9PSAtMSkge1xuICAgICAgICAgICAgbWVzaEluc3RhbmNlcy5zcGxpY2UoaSwgMSk7XG4gICAgICAgIH1cbiAgICB9XG59XG5cbmV4cG9ydCB7IE1hdGVyaWFsIH07XG4iXSwibmFtZXMiOlsiYmxlbmRNb2RlcyIsIkJMRU5EX1NVQlRSQUNUSVZFIiwic3JjIiwiQkxFTkRNT0RFX09ORSIsImRzdCIsIm9wIiwiQkxFTkRFUVVBVElPTl9SRVZFUlNFX1NVQlRSQUNUIiwiQkxFTkRfTk9ORSIsIkJMRU5ETU9ERV9aRVJPIiwiQkxFTkRFUVVBVElPTl9BREQiLCJCTEVORF9OT1JNQUwiLCJCTEVORE1PREVfU1JDX0FMUEhBIiwiQkxFTkRNT0RFX09ORV9NSU5VU19TUkNfQUxQSEEiLCJCTEVORF9QUkVNVUxUSVBMSUVEIiwiQkxFTkRfQURESVRJVkUiLCJCTEVORF9BRERJVElWRUFMUEhBIiwiQkxFTkRfTVVMVElQTElDQVRJVkUyWCIsIkJMRU5ETU9ERV9EU1RfQ09MT1IiLCJCTEVORE1PREVfU1JDX0NPTE9SIiwiQkxFTkRfU0NSRUVOIiwiQkxFTkRNT0RFX09ORV9NSU5VU19EU1RfQ09MT1IiLCJCTEVORF9NVUxUSVBMSUNBVElWRSIsIkJMRU5EX01JTiIsIkJMRU5ERVFVQVRJT05fTUlOIiwiQkxFTkRfTUFYIiwiQkxFTkRFUVVBVElPTl9NQVgiLCJpZCIsIk1hdGVyaWFsIiwiY29uc3RydWN0b3IiLCJfc2hhZGVyIiwibWVzaEluc3RhbmNlcyIsIm5hbWUiLCJ1c2VySWQiLCJ2YXJpYW50cyIsIk1hcCIsInBhcmFtZXRlcnMiLCJhbHBoYVRlc3QiLCJhbHBoYVRvQ292ZXJhZ2UiLCJfYmxlbmRTdGF0ZSIsIkJsZW5kU3RhdGUiLCJfZGVwdGhTdGF0ZSIsIkRlcHRoU3RhdGUiLCJjdWxsIiwiQ1VMTEZBQ0VfQkFDSyIsInN0ZW5jaWxGcm9udCIsInN0ZW5jaWxCYWNrIiwiZGVwdGhCaWFzIiwic2xvcGVEZXB0aEJpYXMiLCJfc2hhZGVyVmVyc2lvbiIsIl9zY2VuZSIsImRpcnR5IiwicmVkV3JpdGUiLCJ2YWx1ZSIsImdyZWVuV3JpdGUiLCJibHVlV3JpdGUiLCJhbHBoYVdyaXRlIiwic2hhZGVyIiwidHJhbnNwYXJlbnQiLCJibGVuZCIsIl91cGRhdGVUcmFuc3BhcmVuY3kiLCJpIiwibGVuZ3RoIiwiYmxlbmRTdGF0ZSIsImNvcHkiLCJibGVuZFR5cGUiLCJ0eXBlIiwiYmxlbmRNb2RlIiwiRGVidWciLCJhc3NlcnQiLCJzZXRDb2xvckJsZW5kIiwic2V0QWxwaGFCbGVuZCIsIl91cGRhdGVNZXNoSW5zdGFuY2VLZXlzIiwiY29sb3JPcCIsImNvbG9yU3JjRmFjdG9yIiwiY29sb3JEc3RGYWN0b3IiLCJhbHBoYU9wIiwiYWxwaGFTcmNGYWN0b3IiLCJhbHBoYURzdEZhY3RvciIsImRlcHRoU3RhdGUiLCJkZXB0aFRlc3QiLCJ0ZXN0IiwiZGVwdGhGdW5jIiwiZnVuYyIsImRlcHRoV3JpdGUiLCJ3cml0ZSIsInNvdXJjZSIsIl9zb3VyY2Ukc3RlbmNpbEZyb250IiwiY2xvbmUiLCJ1cGRhdGVLZXkiLCJ1cGRhdGVVbmlmb3JtcyIsImRldmljZSIsInNjZW5lIiwiZ2V0U2hhZGVyVmFyaWFudCIsIm9iakRlZnMiLCJ1bnVzZWQiLCJwYXNzIiwic29ydGVkTGlnaHRzIiwidmlld1VuaWZvcm1Gb3JtYXQiLCJ2aWV3QmluZEdyb3VwRm9ybWF0IiwidmVydGV4Rm9ybWF0IiwicHJvY2Vzc2luZ09wdGlvbnMiLCJTaGFkZXJQcm9jZXNzb3JPcHRpb25zIiwicHJvY2Vzc1NoYWRlciIsInVwZGF0ZSIsImZhaWxlZCIsImNsZWFyUGFyYW1ldGVycyIsImdldFBhcmFtZXRlcnMiLCJjbGVhclZhcmlhbnRzIiwiY2xlYXIiLCJjb3VudCIsImNsZWFyU2hhZGVycyIsImdldFBhcmFtZXRlciIsInNldFBhcmFtZXRlciIsImRhdGEiLCJ1bmRlZmluZWQiLCJ1bmlmb3JtT2JqZWN0IiwicGFyYW0iLCJzY29wZUlkIiwiZGVsZXRlUGFyYW1ldGVyIiwic2V0UGFyYW1ldGVycyIsIm5hbWVzIiwicGFyYW1OYW1lIiwicGFyYW1ldGVyIiwic2NvcGUiLCJyZXNvbHZlIiwic2V0VmFsdWUiLCJkZXN0cm95IiwibWVzaEluc3RhbmNlIiwiX21hdGVyaWFsIiwibWVzaCIsImRlZmF1bHRNYXRlcmlhbCIsImdldERlZmF1bHRNYXRlcmlhbCIsIm1hdGVyaWFsIiwid2FybiIsImFkZE1lc2hJbnN0YW5jZVJlZiIsInB1c2giLCJyZW1vdmVNZXNoSW5zdGFuY2VSZWYiLCJpbmRleE9mIiwic3BsaWNlIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7QUFzQkE7QUFDQSxNQUFNQSxVQUFVLEdBQUcsRUFBRSxDQUFBO0FBQ3JCQSxVQUFVLENBQUNDLGlCQUFpQixDQUFDLEdBQUc7QUFBRUMsRUFBQUEsR0FBRyxFQUFFQyxhQUFhO0FBQUVDLEVBQUFBLEdBQUcsRUFBRUQsYUFBYTtBQUFFRSxFQUFBQSxFQUFFLEVBQUVDLDhCQUFBQTtBQUErQixDQUFDLENBQUE7QUFDOUdOLFVBQVUsQ0FBQ08sVUFBVSxDQUFDLEdBQUc7QUFBRUwsRUFBQUEsR0FBRyxFQUFFQyxhQUFhO0FBQUVDLEVBQUFBLEdBQUcsRUFBRUksY0FBYztBQUFFSCxFQUFBQSxFQUFFLEVBQUVJLGlCQUFBQTtBQUFrQixDQUFDLENBQUE7QUFDM0ZULFVBQVUsQ0FBQ1UsWUFBWSxDQUFDLEdBQUc7QUFBRVIsRUFBQUEsR0FBRyxFQUFFUyxtQkFBbUI7QUFBRVAsRUFBQUEsR0FBRyxFQUFFUSw2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
