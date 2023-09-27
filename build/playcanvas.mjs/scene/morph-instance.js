import { Debug } from '../core/debug.js';
import { BLENDEQUATION_ADD, BLENDMODE_ONE } from '../platform/graphics/constants.js';
import { drawQuadWithShader } from './graphics/quad-render-utils.js';
import { RenderTarget } from '../platform/graphics/render-target.js';
import { DebugGraphics } from '../platform/graphics/debug-graphics.js';
import { createShaderFromCode } from './shader-lib/utils.js';
import { BlendState } from '../platform/graphics/blend-state.js';

// vertex shader used to add morph targets from textures into render target
const textureMorphVertexShader = /* glsl */`
    attribute vec2 vertex_position;
    varying vec2 uv0;
    void main(void) {
        gl_Position = vec4(vertex_position, 0.5, 1.0);
        uv0 = vertex_position.xy * 0.5 + 0.5;
    }
    `;
const blendStateAdditive = new BlendState(true, BLENDEQUATION_ADD, BLENDMODE_ONE, BLENDMODE_ONE);

/**
 * An instance of {@link Morph}. Contains weights to assign to every {@link MorphTarget}, manages
 * selection of active morph targets.
 *
 * @category Graphics
 */
class MorphInstance {
  /**
   * Create a new MorphInstance instance.
   *
   * @param {import('./morph.js').Morph} morph - The {@link Morph} to instance.
   */
  constructor(morph) {
    /**
     * The morph with its targets, which is being instanced.
     *
     * @type {import('./morph.js').Morph}
     */
    this.morph = morph;
    morph.incRefCount();
    this.device = morph.device;

    // weights
    this._weights = [];
    this._weightMap = new Map();
    for (let v = 0; v < morph._targets.length; v++) {
      const target = morph._targets[v];
      if (target.name) {
        this._weightMap.set(target.name, v);
      }
      this.setWeight(v, target.defaultWeight);
    }

    // temporary array of targets with non-zero weight
    this._activeTargets = [];
    if (morph.useTextureMorph) {
      // shader cache
      this.shaderCache = {};

      // max number of morph targets rendered at a time (each uses single texture slot)
      this.maxSubmitCount = this.device.maxTextures;

      // array for max number of weights
      this._shaderMorphWeights = new Float32Array(this.maxSubmitCount);

      // create render targets to morph targets into
      const createRT = (name, textureVar) => {
        // render to appropriate, RGBA formats, we cannot render to RGB float / half float format in WEbGL
        this[textureVar] = morph._createTexture(name, morph._renderTextureFormat);
        return new RenderTarget({
          colorBuffer: this[textureVar],
          depth: false
        });
      };
      if (morph.morphPositions) {
        this.rtPositions = createRT('MorphRTPos', 'texturePositions');
      }
      if (morph.morphNormals) {
        this.rtNormals = createRT('MorphRTNrm', 'textureNormals');
      }

      // texture params
      this._textureParams = new Float32Array([morph.morphTextureWidth, morph.morphTextureHeight, 1 / morph.morphTextureWidth, 1 / morph.morphTextureHeight]);

      // resolve possible texture names
      for (let i = 0; i < this.maxSubmitCount; i++) {
        this['morphBlendTex' + i] = this.device.scope.resolve('morphBlendTex' + i);
      }
      this.morphFactor = this.device.scope.resolve('morphFactor[0]');

      // true indicates render target textures are full of zeros to avoid rendering to them when all weights are zero
      this.zeroTextures = false;
    } else {
      // vertex attribute based morphing

      // max number of morph targets rendered at a time
      this.maxSubmitCount = 8;

      // weights of active vertex buffers in format used by rendering
      this._shaderMorphWeights = new Float32Array(this.maxSubmitCount); // whole array
      this._shaderMorphWeightsA = new Float32Array(this._shaderMorphWeights.buffer, 0, 4); // first 4 elements
      this._shaderMorphWeightsB = new Float32Array(this._shaderMorphWeights.buffer, 4 * 4, 4); // second 4 elements

      // pre-allocate array of active vertex buffers used by rendering
      this._activeVertexBuffers = new Array(this.maxSubmitCount);
    }
  }

  /**
   * Frees video memory allocated by this object.
   */
  destroy() {
    // don't destroy shader as it's in the cache and can be used by other materials
    this.shader = null;
    const morph = this.morph;
    if (morph) {
      // decrease ref count
      this.morph = null;
      morph.decRefCount();

      // destroy morph
      if (morph.refCount < 1) {
        morph.destroy();
      }
    }
    if (this.rtPositions) {
      this.rtPositions.destroy();
      this.rtPositions = null;
    }
    if (this.texturePositions) {
      this.texturePositions.destroy();
      this.texturePositions = null;
    }
    if (this.rtNormals) {
      this.rtNormals.destroy();
      this.rtNormals = null;
    }
    if (this.textureNormals) {
      this.textureNormals.destroy();
      this.textureNormals = null;
    }
  }

  /**
   * Clones a MorphInstance. The returned clone uses the same {@link Morph} and weights are set
   * to defaults.
   *
   * @returns {MorphInstance} A clone of the specified MorphInstance.
   */
  clone() {
    return new MorphInstance(this.morph);
  }
  _getWeightIndex(key) {
    if (typeof key === 'string') {
      const index = this._weightMap.get(key);
      if (index === undefined) {
        Debug.error(`Cannot find morph target with name: ${key}.`);
      }
      return index;
    }
    return key;
  }

  /**
   * Gets current weight of the specified morph target.
   *
   * @param {string|number} key - An identifier for the morph target. Either the weight index or
   * the weight name.
   * @returns {number} Weight.
   */
  getWeight(key) {
    const index = this._getWeightIndex(key);
    return this._weights[index];
  }

  /**
   * Sets weight of the specified morph target.
   *
   * @param {string|number} key - An identifier for the morph target. Either the weight index or
   * the weight name.
   * @param {number} weight - Weight.
   */
  setWeight(key, weight) {
    const index = this._getWeightIndex(key);
    Debug.assert(index >= 0 && index < this.morph._targets.length);
    this._weights[index] = weight;
    this._dirty = true;
  }

  /**
   * Generate fragment shader to blend a number of textures using specified weights.
   *
   * @param {number} numTextures - Number of textures to blend.
   * @returns {string} Fragment shader.
   * @private
   */
  _getFragmentShader(numTextures) {
    let fragmentShader = '';
    if (numTextures > 0) {
      fragmentShader += 'varying vec2 uv0;\n' + 'uniform highp float morphFactor[' + numTextures + '];\n';
    }
    for (let i = 0; i < numTextures; i++) {
      fragmentShader += 'uniform highp sampler2D morphBlendTex' + i + ';\n';
    }
    fragmentShader += 'void main (void) {\n' + '    highp vec4 color = vec4(0, 0, 0, 1);\n';
    for (let i = 0; i < numTextures; i++) {
      fragmentShader += '    color.xyz += morphFactor[' + i + '] * texture2D(morphBlendTex' + i + ', uv0).xyz;\n';
    }
    fragmentShader += '    gl_FragColor = color;\n' + '}\n';
    return fragmentShader;
  }

  /**
   * Create complete shader for texture based morphing.
   *
   * @param {number} count - Number of textures to blend.
   * @returns {import('../platform/graphics/shader.js').Shader} Shader.
   * @private
   */
  _getShader(count) {
    let shader = this.shaderCache[count];

    // if shader is not in cache, generate one
    if (!shader) {
      const fs = this._getFragmentShader(count);
      shader = createShaderFromCode(this.device, textureMorphVertexShader, fs, 'textureMorph' + count);
      this.shaderCache[count] = shader;
    }
    return shader;
  }
  _updateTextureRenderTarget(renderTarget, srcTextureName) {
    const device = this.device;

    // blend currently set up textures to render target
    const submitBatch = (usedCount, blending) => {
      // factors
      this.morphFactor.setValue(this._shaderMorphWeights);

      // alpha blending - first pass gets none, following passes are additive
      device.setBlendState(blending ? blendStateAdditive : BlendState.NOBLEND);

      // render quad with shader for required number of textures
      const shader = this._getShader(usedCount);
      drawQuadWithShader(device, renderTarget, shader);
    };

    // set up parameters for active blend targets
    let usedCount = 0;
    let blending = false;
    const count = this._activeTargets.length;
    for (let i = 0; i < count; i++) {
      const activeTarget = this._activeTargets[i];
      const tex = activeTarget.target[srcTextureName];
      if (tex) {
        // texture
        this['morphBlendTex' + usedCount].setValue(tex);

        // weight
        this._shaderMorphWeights[usedCount] = activeTarget.weight;

        // submit if batch is full
        usedCount++;
        if (usedCount >= this.maxSubmitCount) {
          submitBatch(usedCount, blending);
          usedCount = 0;
          blending = true;
        }
      }
    }

    // leftover batch, or just to clear texture
    if (usedCount > 0 || count === 0 && !this.zeroTextures) {
      submitBatch(usedCount, blending);
    }
  }
  _updateTextureMorph() {
    const device = this.device;
    DebugGraphics.pushGpuMarker(device, 'MorphUpdate');

    // update textures if active targets, or no active targets and textures need to be cleared
    if (this._activeTargets.length > 0 || !this.zeroTextures) {
      // blend morph targets into render targets
      if (this.rtPositions) this._updateTextureRenderTarget(this.rtPositions, 'texturePositions');
      if (this.rtNormals) this._updateTextureRenderTarget(this.rtNormals, 'textureNormals');

      // textures were cleared if no active targets
      this.zeroTextures = this._activeTargets.length === 0;
    }
    DebugGraphics.popGpuMarker(device);
  }
  _updateVertexMorph() {
    // prepare 8 slots for rendering. these are supported combinations: PPPPPPPP, NNNNNNNN, PPPPNNNN
    const count = this.maxSubmitCount;
    for (let i = 0; i < count; i++) {
      this._shaderMorphWeights[i] = 0;
      this._activeVertexBuffers[i] = null;
    }
    let posIndex = 0;
    let nrmIndex = this.morph.morphPositions ? 4 : 0;
    for (let i = 0; i < this._activeTargets.length; i++) {
      const target = this._activeTargets[i].target;
      if (target._vertexBufferPositions) {
        this._activeVertexBuffers[posIndex] = target._vertexBufferPositions;
        this._shaderMorphWeights[posIndex] = this._activeTargets[i].weight;
        posIndex++;
      }
      if (target._vertexBufferNormals) {
        this._activeVertexBuffers[nrmIndex] = target._vertexBufferNormals;
        this._shaderMorphWeights[nrmIndex] = this._activeTargets[i].weight;
        nrmIndex++;
      }
    }
  }

  /**
   * Selects active morph targets and prepares morph for rendering. Called automatically by
   * renderer.
   */
  update() {
    this._dirty = false;
    const targets = this.morph._targets;

    // collect active targets, reuse objects in _activeTargets array to avoid allocations
    let activeCount = 0;
    const epsilon = 0.00001;
    for (let i = 0; i < targets.length; i++) {
      const absWeight = Math.abs(this.getWeight(i));
      if (absWeight > epsilon) {
        // create new object if needed
        if (this._activeTargets.length <= activeCount) {
          this._activeTargets[activeCount] = {};
        }
        const activeTarget = this._activeTargets[activeCount++];
        activeTarget.absWeight = absWeight;
        activeTarget.weight = this.getWeight(i);
        activeTarget.target = targets[i];
      }
    }
    this._activeTargets.length = activeCount;

    // if there's more active targets then rendering supports
    const maxActiveTargets = this.morph.maxActiveTargets;
    if (this._activeTargets.length > maxActiveTargets) {
      // sort them by absWeight
      this._activeTargets.sort(function (l, r) {
        return l.absWeight < r.absWeight ? 1 : r.absWeight < l.absWeight ? -1 : 0;
      });

      // remove excess
      this._activeTargets.length = maxActiveTargets;
    }

    // prepare for rendering
    if (this.morph.useTextureMorph) {
      this._updateTextureMorph();
    } else {
      this._updateVertexMorph();
    }
  }
}

export { MorphInstance };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9ycGgtaW5zdGFuY2UuanMiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9zY2VuZS9tb3JwaC1pbnN0YW5jZS5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBEZWJ1ZyB9IGZyb20gJy4uL2NvcmUvZGVidWcuanMnO1xuXG5pbXBvcnQgeyBCTEVOREVRVUFUSU9OX0FERCwgQkxFTkRNT0RFX09ORSB9IGZyb20gJy4uL3BsYXRmb3JtL2dyYXBoaWNzL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBkcmF3UXVhZFdpdGhTaGFkZXIgfSBmcm9tICcuL2dyYXBoaWNzL3F1YWQtcmVuZGVyLXV0aWxzLmpzJztcbmltcG9ydCB7IFJlbmRlclRhcmdldCB9IGZyb20gJy4uL3BsYXRmb3JtL2dyYXBoaWNzL3JlbmRlci10YXJnZXQuanMnO1xuaW1wb3J0IHsgRGVidWdHcmFwaGljcyB9IGZyb20gJy4uL3BsYXRmb3JtL2dyYXBoaWNzL2RlYnVnLWdyYXBoaWNzLmpzJztcblxuaW1wb3J0IHsgY3JlYXRlU2hhZGVyRnJvbUNvZGUgfSBmcm9tICcuL3NoYWRlci1saWIvdXRpbHMuanMnO1xuaW1wb3J0IHsgQmxlbmRTdGF0ZSB9IGZyb20gJy4uL3BsYXRmb3JtL2dyYXBoaWNzL2JsZW5kLXN0YXRlLmpzJztcblxuLy8gdmVydGV4IHNoYWRlciB1c2VkIHRvIGFkZCBtb3JwaCB0YXJnZXRzIGZyb20gdGV4dHVyZXMgaW50byByZW5kZXIgdGFyZ2V0XG5jb25zdCB0ZXh0dXJlTW9ycGhWZXJ0ZXhTaGFkZXIgPSAvKiBnbHNsICovIGBcbiAgICBhdHRyaWJ1dGUgdmVjMiB2ZXJ0ZXhfcG9zaXRpb247XG4gICAgdmFyeWluZyB2ZWMyIHV2MDtcbiAgICB2b2lkIG1haW4odm9pZCkge1xuICAgICAgICBnbF9Qb3NpdGlvbiA9IHZlYzQodmVydGV4X3Bvc2l0aW9uLCAwLjUsIDEuMCk7XG4gICAgICAgIHV2MCA9IHZlcnRleF9wb3NpdGlvbi54eSAqIDAuNSArIDAuNTtcbiAgICB9XG4gICAgYDtcblxuY29uc3QgYmxlbmRTdGF0ZUFkZGl0aXZlID0gbmV3IEJsZW5kU3RhdGUodHJ1ZSwgQkxFTkRFUVVBVElPTl9BREQsIEJMRU5ETU9ERV9PTkUsIEJMRU5ETU9ERV9PTkUpO1xuXG4vKipcbiAqIEFuIGluc3RhbmNlIG9mIHtAbGluayBNb3JwaH0uIENvbnRhaW5zIHdlaWdodHMgdG8gYXNzaWduIHRvIGV2ZXJ5IHtAbGluayBNb3JwaFRhcmdldH0sIG1hbmFnZXNcbiAqIHNlbGVjdGlvbiBvZiBhY3RpdmUgbW9ycGggdGFyZ2V0cy5cbiAqXG4gKiBAY2F0ZWdvcnkgR3JhcGhpY3NcbiAqL1xuY2xhc3MgTW9ycGhJbnN0YW5jZSB7XG4gICAgLyoqXG4gICAgICogQ3JlYXRlIGEgbmV3IE1vcnBoSW5zdGFuY2UgaW5zdGFuY2UuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi9tb3JwaC5qcycpLk1vcnBofSBtb3JwaCAtIFRoZSB7QGxpbmsgTW9ycGh9IHRvIGluc3RhbmNlLlxuICAgICAqL1xuICAgIGNvbnN0cnVjdG9yKG1vcnBoKSB7XG4gICAgICAgIC8qKlxuICAgICAgICAgKiBUaGUgbW9ycGggd2l0aCBpdHMgdGFyZ2V0cywgd2hpY2ggaXMgYmVpbmcgaW5zdGFuY2VkLlxuICAgICAgICAgKlxuICAgICAgICAgKiBAdHlwZSB7aW1wb3J0KCcuL21vcnBoLmpzJykuTW9ycGh9XG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLm1vcnBoID0gbW9ycGg7XG4gICAgICAgIG1vcnBoLmluY1JlZkNvdW50KCk7XG4gICAgICAgIHRoaXMuZGV2aWNlID0gbW9ycGguZGV2aWNlO1xuXG4gICAgICAgIC8vIHdlaWdodHNcbiAgICAgICAgdGhpcy5fd2VpZ2h0cyA9IFtdO1xuICAgICAgICB0aGlzLl93ZWlnaHRNYXAgPSBuZXcgTWFwKCk7XG4gICAgICAgIGZvciAobGV0IHYgPSAwOyB2IDwgbW9ycGguX3RhcmdldHMubGVuZ3RoOyB2KyspIHtcbiAgICAgICAgICAgIGNvbnN0IHRhcmdldCA9IG1vcnBoLl90YXJnZXRzW3ZdO1xuICAgICAgICAgICAgaWYgKHRhcmdldC5uYW1lKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fd2VpZ2h0TWFwLnNldCh0YXJnZXQubmFtZSwgdik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLnNldFdlaWdodCh2LCB0YXJnZXQuZGVmYXVsdFdlaWdodCk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyB0ZW1wb3JhcnkgYXJyYXkgb2YgdGFyZ2V0cyB3aXRoIG5vbi16ZXJvIHdlaWdodFxuICAgICAgICB0aGlzLl9hY3RpdmVUYXJnZXRzID0gW107XG5cbiAgICAgICAgaWYgKG1vcnBoLnVzZVRleHR1cmVNb3JwaCkge1xuXG4gICAgICAgICAgICAvLyBzaGFkZXIgY2FjaGVcbiAgICAgICAgICAgIHRoaXMuc2hhZGVyQ2FjaGUgPSB7fTtcblxuICAgICAgICAgICAgLy8gbWF4IG51bWJlciBvZiBtb3JwaCB0YXJnZXRzIHJlbmRlcmVkIGF0IGEgdGltZSAoZWFjaCB1c2VzIHNpbmdsZSB0ZXh0dXJlIHNsb3QpXG4gICAgICAgICAgICB0aGlzLm1heFN1Ym1pdENvdW50ID0gdGhpcy5kZXZpY2UubWF4VGV4dHVyZXM7XG5cbiAgICAgICAgICAgIC8vIGFycmF5IGZvciBtYXggbnVtYmVyIG9mIHdlaWdodHNcbiAgICAgICAgICAgIHRoaXMuX3NoYWRlck1vcnBoV2VpZ2h0cyA9IG5ldyBGbG9hdDMyQXJyYXkodGhpcy5tYXhTdWJtaXRDb3VudCk7XG5cbiAgICAgICAgICAgIC8vIGNyZWF0ZSByZW5kZXIgdGFyZ2V0cyB0byBtb3JwaCB0YXJnZXRzIGludG9cbiAgICAgICAgICAgIGNvbnN0IGNyZWF0ZVJUID0gKG5hbWUsIHRleHR1cmVWYXIpID0+IHtcblxuICAgICAgICAgICAgICAgIC8vIHJlbmRlciB0byBhcHByb3ByaWF0ZSwgUkdCQSBmb3JtYXRzLCB3ZSBjYW5ub3QgcmVuZGVyIHRvIFJHQiBmbG9hdCAvIGhhbGYgZmxvYXQgZm9ybWF0IGluIFdFYkdMXG4gICAgICAgICAgICAgICAgdGhpc1t0ZXh0dXJlVmFyXSA9IG1vcnBoLl9jcmVhdGVUZXh0dXJlKG5hbWUsIG1vcnBoLl9yZW5kZXJUZXh0dXJlRm9ybWF0KTtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IFJlbmRlclRhcmdldCh7XG4gICAgICAgICAgICAgICAgICAgIGNvbG9yQnVmZmVyOiB0aGlzW3RleHR1cmVWYXJdLFxuICAgICAgICAgICAgICAgICAgICBkZXB0aDogZmFsc2VcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGlmIChtb3JwaC5tb3JwaFBvc2l0aW9ucykge1xuICAgICAgICAgICAgICAgIHRoaXMucnRQb3NpdGlvbnMgPSBjcmVhdGVSVCgnTW9ycGhSVFBvcycsICd0ZXh0dXJlUG9zaXRpb25zJyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChtb3JwaC5tb3JwaE5vcm1hbHMpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnJ0Tm9ybWFscyA9IGNyZWF0ZVJUKCdNb3JwaFJUTnJtJywgJ3RleHR1cmVOb3JtYWxzJyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIHRleHR1cmUgcGFyYW1zXG4gICAgICAgICAgICB0aGlzLl90ZXh0dXJlUGFyYW1zID0gbmV3IEZsb2F0MzJBcnJheShbbW9ycGgubW9ycGhUZXh0dXJlV2lkdGgsIG1vcnBoLm1vcnBoVGV4dHVyZUhlaWdodCxcbiAgICAgICAgICAgICAgICAxIC8gbW9ycGgubW9ycGhUZXh0dXJlV2lkdGgsIDEgLyBtb3JwaC5tb3JwaFRleHR1cmVIZWlnaHRdKTtcblxuICAgICAgICAgICAgLy8gcmVzb2x2ZSBwb3NzaWJsZSB0ZXh0dXJlIG5hbWVzXG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMubWF4U3VibWl0Q291bnQ7IGkrKykge1xuICAgICAgICAgICAgICAgIHRoaXNbJ21vcnBoQmxlbmRUZXgnICsgaV0gPSB0aGlzLmRldmljZS5zY29wZS5yZXNvbHZlKCdtb3JwaEJsZW5kVGV4JyArIGkpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLm1vcnBoRmFjdG9yID0gdGhpcy5kZXZpY2Uuc2NvcGUucmVzb2x2ZSgnbW9ycGhGYWN0b3JbMF0nKTtcblxuICAgICAgICAgICAgLy8gdHJ1ZSBpbmRpY2F0ZXMgcmVuZGVyIHRhcmdldCB0ZXh0dXJlcyBhcmUgZnVsbCBvZiB6ZXJvcyB0byBhdm9pZCByZW5kZXJpbmcgdG8gdGhlbSB3aGVuIGFsbCB3ZWlnaHRzIGFyZSB6ZXJvXG4gICAgICAgICAgICB0aGlzLnplcm9UZXh0dXJlcyA9IGZhbHNlO1xuXG4gICAgICAgIH0gZWxzZSB7ICAgIC8vIHZlcnRleCBhdHRyaWJ1dGUgYmFzZWQgbW9ycGhpbmdcblxuICAgICAgICAgICAgLy8gbWF4IG51bWJlciBvZiBtb3JwaCB0YXJnZXRzIHJlbmRlcmVkIGF0IGEgdGltZVxuICAgICAgICAgICAgdGhpcy5tYXhTdWJtaXRDb3VudCA9IDg7XG5cbiAgICAgICAgICAgIC8vIHdlaWdodHMgb2YgYWN0aXZlIHZlcnRleCBidWZmZXJzIGluIGZvcm1hdCB1c2VkIGJ5IHJlbmRlcmluZ1xuICAgICAgICAgICAgdGhpcy5fc2hhZGVyTW9ycGhXZWlnaHRzID0gbmV3IEZsb2F0MzJBcnJheSh0aGlzLm1heFN1Ym1pdENvdW50KTsgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyB3aG9sZSBhcnJheVxuICAgICAgICAgICAgdGhpcy5fc2hhZGVyTW9ycGhXZWlnaHRzQSA9IG5ldyBGbG9hdDMyQXJyYXkodGhpcy5fc2hhZGVyTW9ycGhXZWlnaHRzLmJ1ZmZlciwgMCwgNCk7ICAgICAgICAvLyBmaXJzdCA0IGVsZW1lbnRzXG4gICAgICAgICAgICB0aGlzLl9zaGFkZXJNb3JwaFdlaWdodHNCID0gbmV3IEZsb2F0MzJBcnJheSh0aGlzLl9zaGFkZXJNb3JwaFdlaWdodHMuYnVmZmVyLCA0ICogNCwgNCk7ICAgIC8vIHNlY29uZCA0IGVsZW1lbnRzXG5cbiAgICAgICAgICAgIC8vIHByZS1hbGxvY2F0ZSBhcnJheSBvZiBhY3RpdmUgdmVydGV4IGJ1ZmZlcnMgdXNlZCBieSByZW5kZXJpbmdcbiAgICAgICAgICAgIHRoaXMuX2FjdGl2ZVZlcnRleEJ1ZmZlcnMgPSBuZXcgQXJyYXkodGhpcy5tYXhTdWJtaXRDb3VudCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBGcmVlcyB2aWRlbyBtZW1vcnkgYWxsb2NhdGVkIGJ5IHRoaXMgb2JqZWN0LlxuICAgICAqL1xuICAgIGRlc3Ryb3koKSB7XG5cbiAgICAgICAgLy8gZG9uJ3QgZGVzdHJveSBzaGFkZXIgYXMgaXQncyBpbiB0aGUgY2FjaGUgYW5kIGNhbiBiZSB1c2VkIGJ5IG90aGVyIG1hdGVyaWFsc1xuICAgICAgICB0aGlzLnNoYWRlciA9IG51bGw7XG5cbiAgICAgICAgY29uc3QgbW9ycGggPSB0aGlzLm1vcnBoO1xuICAgICAgICBpZiAobW9ycGgpIHtcblxuICAgICAgICAgICAgLy8gZGVjcmVhc2UgcmVmIGNvdW50XG4gICAgICAgICAgICB0aGlzLm1vcnBoID0gbnVsbDtcbiAgICAgICAgICAgIG1vcnBoLmRlY1JlZkNvdW50KCk7XG5cbiAgICAgICAgICAgIC8vIGRlc3Ryb3kgbW9ycGhcbiAgICAgICAgICAgIGlmIChtb3JwaC5yZWZDb3VudCA8IDEpIHtcbiAgICAgICAgICAgICAgICBtb3JwaC5kZXN0cm95KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5ydFBvc2l0aW9ucykge1xuICAgICAgICAgICAgdGhpcy5ydFBvc2l0aW9ucy5kZXN0cm95KCk7XG4gICAgICAgICAgICB0aGlzLnJ0UG9zaXRpb25zID0gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLnRleHR1cmVQb3NpdGlvbnMpIHtcbiAgICAgICAgICAgIHRoaXMudGV4dHVyZVBvc2l0aW9ucy5kZXN0cm95KCk7XG4gICAgICAgICAgICB0aGlzLnRleHR1cmVQb3NpdGlvbnMgPSBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMucnROb3JtYWxzKSB7XG4gICAgICAgICAgICB0aGlzLnJ0Tm9ybWFscy5kZXN0cm95KCk7XG4gICAgICAgICAgICB0aGlzLnJ0Tm9ybWFscyA9IG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy50ZXh0dXJlTm9ybWFscykge1xuICAgICAgICAgICAgdGhpcy50ZXh0dXJlTm9ybWFscy5kZXN0cm95KCk7XG4gICAgICAgICAgICB0aGlzLnRleHR1cmVOb3JtYWxzID0gbnVsbDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENsb25lcyBhIE1vcnBoSW5zdGFuY2UuIFRoZSByZXR1cm5lZCBjbG9uZSB1c2VzIHRoZSBzYW1lIHtAbGluayBNb3JwaH0gYW5kIHdlaWdodHMgYXJlIHNldFxuICAgICAqIHRvIGRlZmF1bHRzLlxuICAgICAqXG4gICAgICogQHJldHVybnMge01vcnBoSW5zdGFuY2V9IEEgY2xvbmUgb2YgdGhlIHNwZWNpZmllZCBNb3JwaEluc3RhbmNlLlxuICAgICAqL1xuICAgIGNsb25lKCkge1xuICAgICAgICByZXR1cm4gbmV3IE1vcnBoSW5zdGFuY2UodGhpcy5tb3JwaCk7XG4gICAgfVxuXG4gICAgX2dldFdlaWdodEluZGV4KGtleSkge1xuICAgICAgICBpZiAodHlwZW9mIGtleSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIGNvbnN0IGluZGV4ID0gdGhpcy5fd2VpZ2h0TWFwLmdldChrZXkpO1xuICAgICAgICAgICAgaWYgKGluZGV4ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBEZWJ1Zy5lcnJvcihgQ2Fubm90IGZpbmQgbW9ycGggdGFyZ2V0IHdpdGggbmFtZTogJHtrZXl9LmApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGluZGV4O1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBrZXk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogR2V0cyBjdXJyZW50IHdlaWdodCBvZiB0aGUgc3BlY2lmaWVkIG1vcnBoIHRhcmdldC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfG51bWJlcn0ga2V5IC0gQW4gaWRlbnRpZmllciBmb3IgdGhlIG1vcnBoIHRhcmdldC4gRWl0aGVyIHRoZSB3ZWlnaHQgaW5kZXggb3JcbiAgICAgKiB0aGUgd2VpZ2h0IG5hbWUuXG4gICAgICogQHJldHVybnMge251bWJlcn0gV2VpZ2h0LlxuICAgICAqL1xuICAgIGdldFdlaWdodChrZXkpIHtcbiAgICAgICAgY29uc3QgaW5kZXggPSB0aGlzLl9nZXRXZWlnaHRJbmRleChrZXkpO1xuICAgICAgICByZXR1cm4gdGhpcy5fd2VpZ2h0c1tpbmRleF07XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyB3ZWlnaHQgb2YgdGhlIHNwZWNpZmllZCBtb3JwaCB0YXJnZXQuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ3xudW1iZXJ9IGtleSAtIEFuIGlkZW50aWZpZXIgZm9yIHRoZSBtb3JwaCB0YXJnZXQuIEVpdGhlciB0aGUgd2VpZ2h0IGluZGV4IG9yXG4gICAgICogdGhlIHdlaWdodCBuYW1lLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSB3ZWlnaHQgLSBXZWlnaHQuXG4gICAgICovXG4gICAgc2V0V2VpZ2h0KGtleSwgd2VpZ2h0KSB7XG4gICAgICAgIGNvbnN0IGluZGV4ID0gdGhpcy5fZ2V0V2VpZ2h0SW5kZXgoa2V5KTtcbiAgICAgICAgRGVidWcuYXNzZXJ0KGluZGV4ID49IDAgJiYgaW5kZXggPCB0aGlzLm1vcnBoLl90YXJnZXRzLmxlbmd0aCk7XG4gICAgICAgIHRoaXMuX3dlaWdodHNbaW5kZXhdID0gd2VpZ2h0O1xuICAgICAgICB0aGlzLl9kaXJ0eSA9IHRydWU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogR2VuZXJhdGUgZnJhZ21lbnQgc2hhZGVyIHRvIGJsZW5kIGEgbnVtYmVyIG9mIHRleHR1cmVzIHVzaW5nIHNwZWNpZmllZCB3ZWlnaHRzLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IG51bVRleHR1cmVzIC0gTnVtYmVyIG9mIHRleHR1cmVzIHRvIGJsZW5kLlxuICAgICAqIEByZXR1cm5zIHtzdHJpbmd9IEZyYWdtZW50IHNoYWRlci5cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9nZXRGcmFnbWVudFNoYWRlcihudW1UZXh0dXJlcykge1xuXG4gICAgICAgIGxldCBmcmFnbWVudFNoYWRlciA9ICcnO1xuXG4gICAgICAgIGlmIChudW1UZXh0dXJlcyA+IDApIHtcbiAgICAgICAgICAgIGZyYWdtZW50U2hhZGVyICs9ICd2YXJ5aW5nIHZlYzIgdXYwO1xcbicgK1xuICAgICAgICAgICAgICAgICd1bmlmb3JtIGhpZ2hwIGZsb2F0IG1vcnBoRmFjdG9yWycgKyBudW1UZXh0dXJlcyArICddO1xcbic7XG4gICAgICAgIH1cblxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG51bVRleHR1cmVzOyBpKyspIHtcbiAgICAgICAgICAgIGZyYWdtZW50U2hhZGVyICs9ICd1bmlmb3JtIGhpZ2hwIHNhbXBsZXIyRCBtb3JwaEJsZW5kVGV4JyArIGkgKyAnO1xcbic7XG4gICAgICAgIH1cblxuICAgICAgICBmcmFnbWVudFNoYWRlciArPSAndm9pZCBtYWluICh2b2lkKSB7XFxuJyArXG4gICAgICAgICAgICAnICAgIGhpZ2hwIHZlYzQgY29sb3IgPSB2ZWM0KDAsIDAsIDAsIDEpO1xcbic7XG5cbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBudW1UZXh0dXJlczsgaSsrKSB7XG4gICAgICAgICAgICBmcmFnbWVudFNoYWRlciArPSAnICAgIGNvbG9yLnh5eiArPSBtb3JwaEZhY3RvclsnICsgaSArICddICogdGV4dHVyZTJEKG1vcnBoQmxlbmRUZXgnICsgaSArICcsIHV2MCkueHl6O1xcbic7XG4gICAgICAgIH1cblxuICAgICAgICBmcmFnbWVudFNoYWRlciArPSAnICAgIGdsX0ZyYWdDb2xvciA9IGNvbG9yO1xcbicgK1xuICAgICAgICAgICAgJ31cXG4nO1xuXG4gICAgICAgIHJldHVybiBmcmFnbWVudFNoYWRlcjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDcmVhdGUgY29tcGxldGUgc2hhZGVyIGZvciB0ZXh0dXJlIGJhc2VkIG1vcnBoaW5nLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGNvdW50IC0gTnVtYmVyIG9mIHRleHR1cmVzIHRvIGJsZW5kLlxuICAgICAqIEByZXR1cm5zIHtpbXBvcnQoJy4uL3BsYXRmb3JtL2dyYXBoaWNzL3NoYWRlci5qcycpLlNoYWRlcn0gU2hhZGVyLlxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX2dldFNoYWRlcihjb3VudCkge1xuXG4gICAgICAgIGxldCBzaGFkZXIgPSB0aGlzLnNoYWRlckNhY2hlW2NvdW50XTtcblxuICAgICAgICAvLyBpZiBzaGFkZXIgaXMgbm90IGluIGNhY2hlLCBnZW5lcmF0ZSBvbmVcbiAgICAgICAgaWYgKCFzaGFkZXIpIHtcbiAgICAgICAgICAgIGNvbnN0IGZzID0gdGhpcy5fZ2V0RnJhZ21lbnRTaGFkZXIoY291bnQpO1xuICAgICAgICAgICAgc2hhZGVyID0gY3JlYXRlU2hhZGVyRnJvbUNvZGUodGhpcy5kZXZpY2UsIHRleHR1cmVNb3JwaFZlcnRleFNoYWRlciwgZnMsICd0ZXh0dXJlTW9ycGgnICsgY291bnQpO1xuICAgICAgICAgICAgdGhpcy5zaGFkZXJDYWNoZVtjb3VudF0gPSBzaGFkZXI7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gc2hhZGVyO1xuICAgIH1cblxuICAgIF91cGRhdGVUZXh0dXJlUmVuZGVyVGFyZ2V0KHJlbmRlclRhcmdldCwgc3JjVGV4dHVyZU5hbWUpIHtcblxuICAgICAgICBjb25zdCBkZXZpY2UgPSB0aGlzLmRldmljZTtcblxuICAgICAgICAvLyBibGVuZCBjdXJyZW50bHkgc2V0IHVwIHRleHR1cmVzIHRvIHJlbmRlciB0YXJnZXRcbiAgICAgICAgY29uc3Qgc3VibWl0QmF0Y2ggPSAodXNlZENvdW50LCBibGVuZGluZykgPT4ge1xuXG4gICAgICAgICAgICAvLyBmYWN0b3JzXG4gICAgICAgICAgICB0aGlzLm1vcnBoRmFjdG9yLnNldFZhbHVlKHRoaXMuX3NoYWRlck1vcnBoV2VpZ2h0cyk7XG5cbiAgICAgICAgICAgIC8vIGFscGhhIGJsZW5kaW5nIC0gZmlyc3QgcGFzcyBnZXRzIG5vbmUsIGZvbGxvd2luZyBwYXNzZXMgYXJlIGFkZGl0aXZlXG4gICAgICAgICAgICBkZXZpY2Uuc2V0QmxlbmRTdGF0ZShibGVuZGluZyA/IGJsZW5kU3RhdGVBZGRpdGl2ZSA6IEJsZW5kU3RhdGUuTk9CTEVORCk7XG5cbiAgICAgICAgICAgIC8vIHJlbmRlciBxdWFkIHdpdGggc2hhZGVyIGZvciByZXF1aXJlZCBudW1iZXIgb2YgdGV4dHVyZXNcbiAgICAgICAgICAgIGNvbnN0IHNoYWRlciA9IHRoaXMuX2dldFNoYWRlcih1c2VkQ291bnQpO1xuICAgICAgICAgICAgZHJhd1F1YWRXaXRoU2hhZGVyKGRldmljZSwgcmVuZGVyVGFyZ2V0LCBzaGFkZXIpO1xuICAgICAgICB9O1xuXG4gICAgICAgIC8vIHNldCB1cCBwYXJhbWV0ZXJzIGZvciBhY3RpdmUgYmxlbmQgdGFyZ2V0c1xuICAgICAgICBsZXQgdXNlZENvdW50ID0gMDtcbiAgICAgICAgbGV0IGJsZW5kaW5nID0gZmFsc2U7XG4gICAgICAgIGNvbnN0IGNvdW50ID0gdGhpcy5fYWN0aXZlVGFyZ2V0cy5sZW5ndGg7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgY291bnQ7IGkrKykge1xuICAgICAgICAgICAgY29uc3QgYWN0aXZlVGFyZ2V0ID0gdGhpcy5fYWN0aXZlVGFyZ2V0c1tpXTtcbiAgICAgICAgICAgIGNvbnN0IHRleCA9IGFjdGl2ZVRhcmdldC50YXJnZXRbc3JjVGV4dHVyZU5hbWVdO1xuICAgICAgICAgICAgaWYgKHRleCkge1xuXG4gICAgICAgICAgICAgICAgLy8gdGV4dHVyZVxuICAgICAgICAgICAgICAgIHRoaXNbJ21vcnBoQmxlbmRUZXgnICsgdXNlZENvdW50XS5zZXRWYWx1ZSh0ZXgpO1xuXG4gICAgICAgICAgICAgICAgLy8gd2VpZ2h0XG4gICAgICAgICAgICAgICAgdGhpcy5fc2hhZGVyTW9ycGhXZWlnaHRzW3VzZWRDb3VudF0gPSBhY3RpdmVUYXJnZXQud2VpZ2h0O1xuXG4gICAgICAgICAgICAgICAgLy8gc3VibWl0IGlmIGJhdGNoIGlzIGZ1bGxcbiAgICAgICAgICAgICAgICB1c2VkQ291bnQrKztcbiAgICAgICAgICAgICAgICBpZiAodXNlZENvdW50ID49IHRoaXMubWF4U3VibWl0Q291bnQpIHtcblxuICAgICAgICAgICAgICAgICAgICBzdWJtaXRCYXRjaCh1c2VkQ291bnQsIGJsZW5kaW5nKTtcbiAgICAgICAgICAgICAgICAgICAgdXNlZENvdW50ID0gMDtcbiAgICAgICAgICAgICAgICAgICAgYmxlbmRpbmcgPSB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGxlZnRvdmVyIGJhdGNoLCBvciBqdXN0IHRvIGNsZWFyIHRleHR1cmVcbiAgICAgICAgaWYgKHVzZWRDb3VudCA+IDAgfHwgKGNvdW50ID09PSAwICYmICF0aGlzLnplcm9UZXh0dXJlcykpIHtcbiAgICAgICAgICAgIHN1Ym1pdEJhdGNoKHVzZWRDb3VudCwgYmxlbmRpbmcpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgX3VwZGF0ZVRleHR1cmVNb3JwaCgpIHtcblxuICAgICAgICBjb25zdCBkZXZpY2UgPSB0aGlzLmRldmljZTtcblxuICAgICAgICBEZWJ1Z0dyYXBoaWNzLnB1c2hHcHVNYXJrZXIoZGV2aWNlLCAnTW9ycGhVcGRhdGUnKTtcblxuICAgICAgICAvLyB1cGRhdGUgdGV4dHVyZXMgaWYgYWN0aXZlIHRhcmdldHMsIG9yIG5vIGFjdGl2ZSB0YXJnZXRzIGFuZCB0ZXh0dXJlcyBuZWVkIHRvIGJlIGNsZWFyZWRcbiAgICAgICAgaWYgKHRoaXMuX2FjdGl2ZVRhcmdldHMubGVuZ3RoID4gMCB8fCAhdGhpcy56ZXJvVGV4dHVyZXMpIHtcblxuICAgICAgICAgICAgLy8gYmxlbmQgbW9ycGggdGFyZ2V0cyBpbnRvIHJlbmRlciB0YXJnZXRzXG4gICAgICAgICAgICBpZiAodGhpcy5ydFBvc2l0aW9ucylcbiAgICAgICAgICAgICAgICB0aGlzLl91cGRhdGVUZXh0dXJlUmVuZGVyVGFyZ2V0KHRoaXMucnRQb3NpdGlvbnMsICd0ZXh0dXJlUG9zaXRpb25zJyk7XG5cbiAgICAgICAgICAgIGlmICh0aGlzLnJ0Tm9ybWFscylcbiAgICAgICAgICAgICAgICB0aGlzLl91cGRhdGVUZXh0dXJlUmVuZGVyVGFyZ2V0KHRoaXMucnROb3JtYWxzLCAndGV4dHVyZU5vcm1hbHMnKTtcblxuICAgICAgICAgICAgLy8gdGV4dHVyZXMgd2VyZSBjbGVhcmVkIGlmIG5vIGFjdGl2ZSB0YXJnZXRzXG4gICAgICAgICAgICB0aGlzLnplcm9UZXh0dXJlcyA9IHRoaXMuX2FjdGl2ZVRhcmdldHMubGVuZ3RoID09PSAwO1xuICAgICAgICB9XG5cbiAgICAgICAgRGVidWdHcmFwaGljcy5wb3BHcHVNYXJrZXIoZGV2aWNlKTtcbiAgICB9XG5cbiAgICBfdXBkYXRlVmVydGV4TW9ycGgoKSB7XG5cbiAgICAgICAgLy8gcHJlcGFyZSA4IHNsb3RzIGZvciByZW5kZXJpbmcuIHRoZXNlIGFyZSBzdXBwb3J0ZWQgY29tYmluYXRpb25zOiBQUFBQUFBQUCwgTk5OTk5OTk4sIFBQUFBOTk5OXG4gICAgICAgIGNvbnN0IGNvdW50ID0gdGhpcy5tYXhTdWJtaXRDb3VudDtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjb3VudDsgaSsrKSB7XG4gICAgICAgICAgICB0aGlzLl9zaGFkZXJNb3JwaFdlaWdodHNbaV0gPSAwO1xuICAgICAgICAgICAgdGhpcy5fYWN0aXZlVmVydGV4QnVmZmVyc1tpXSA9IG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgcG9zSW5kZXggPSAwO1xuICAgICAgICBsZXQgbnJtSW5kZXggPSB0aGlzLm1vcnBoLm1vcnBoUG9zaXRpb25zID8gNCA6IDA7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fYWN0aXZlVGFyZ2V0cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgY29uc3QgdGFyZ2V0ID0gdGhpcy5fYWN0aXZlVGFyZ2V0c1tpXS50YXJnZXQ7XG5cbiAgICAgICAgICAgIGlmICh0YXJnZXQuX3ZlcnRleEJ1ZmZlclBvc2l0aW9ucykge1xuICAgICAgICAgICAgICAgIHRoaXMuX2FjdGl2ZVZlcnRleEJ1ZmZlcnNbcG9zSW5kZXhdID0gdGFyZ2V0Ll92ZXJ0ZXhCdWZmZXJQb3NpdGlvbnM7XG4gICAgICAgICAgICAgICAgdGhpcy5fc2hhZGVyTW9ycGhXZWlnaHRzW3Bvc0luZGV4XSA9IHRoaXMuX2FjdGl2ZVRhcmdldHNbaV0ud2VpZ2h0O1xuICAgICAgICAgICAgICAgIHBvc0luZGV4Kys7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICh0YXJnZXQuX3ZlcnRleEJ1ZmZlck5vcm1hbHMpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9hY3RpdmVWZXJ0ZXhCdWZmZXJzW25ybUluZGV4XSA9IHRhcmdldC5fdmVydGV4QnVmZmVyTm9ybWFscztcbiAgICAgICAgICAgICAgICB0aGlzLl9zaGFkZXJNb3JwaFdlaWdodHNbbnJtSW5kZXhdID0gdGhpcy5fYWN0aXZlVGFyZ2V0c1tpXS53ZWlnaHQ7XG4gICAgICAgICAgICAgICAgbnJtSW5kZXgrKztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNlbGVjdHMgYWN0aXZlIG1vcnBoIHRhcmdldHMgYW5kIHByZXBhcmVzIG1vcnBoIGZvciByZW5kZXJpbmcuIENhbGxlZCBhdXRvbWF0aWNhbGx5IGJ5XG4gICAgICogcmVuZGVyZXIuXG4gICAgICovXG4gICAgdXBkYXRlKCkge1xuXG4gICAgICAgIHRoaXMuX2RpcnR5ID0gZmFsc2U7XG4gICAgICAgIGNvbnN0IHRhcmdldHMgPSB0aGlzLm1vcnBoLl90YXJnZXRzO1xuXG4gICAgICAgIC8vIGNvbGxlY3QgYWN0aXZlIHRhcmdldHMsIHJldXNlIG9iamVjdHMgaW4gX2FjdGl2ZVRhcmdldHMgYXJyYXkgdG8gYXZvaWQgYWxsb2NhdGlvbnNcbiAgICAgICAgbGV0IGFjdGl2ZUNvdW50ID0gMDtcbiAgICAgICAgY29uc3QgZXBzaWxvbiA9IDAuMDAwMDE7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGFyZ2V0cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgY29uc3QgYWJzV2VpZ2h0ID0gTWF0aC5hYnModGhpcy5nZXRXZWlnaHQoaSkpO1xuICAgICAgICAgICAgaWYgKGFic1dlaWdodCA+IGVwc2lsb24pIHtcblxuICAgICAgICAgICAgICAgIC8vIGNyZWF0ZSBuZXcgb2JqZWN0IGlmIG5lZWRlZFxuICAgICAgICAgICAgICAgIGlmICh0aGlzLl9hY3RpdmVUYXJnZXRzLmxlbmd0aCA8PSBhY3RpdmVDb3VudCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9hY3RpdmVUYXJnZXRzW2FjdGl2ZUNvdW50XSA9IHt9O1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGNvbnN0IGFjdGl2ZVRhcmdldCA9IHRoaXMuX2FjdGl2ZVRhcmdldHNbYWN0aXZlQ291bnQrK107XG4gICAgICAgICAgICAgICAgYWN0aXZlVGFyZ2V0LmFic1dlaWdodCA9IGFic1dlaWdodDtcbiAgICAgICAgICAgICAgICBhY3RpdmVUYXJnZXQud2VpZ2h0ID0gdGhpcy5nZXRXZWlnaHQoaSk7XG4gICAgICAgICAgICAgICAgYWN0aXZlVGFyZ2V0LnRhcmdldCA9IHRhcmdldHNbaV07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5fYWN0aXZlVGFyZ2V0cy5sZW5ndGggPSBhY3RpdmVDb3VudDtcblxuICAgICAgICAvLyBpZiB0aGVyZSdzIG1vcmUgYWN0aXZlIHRhcmdldHMgdGhlbiByZW5kZXJpbmcgc3VwcG9ydHNcbiAgICAgICAgY29uc3QgbWF4QWN0aXZlVGFyZ2V0cyA9IHRoaXMubW9ycGgubWF4QWN0aXZlVGFyZ2V0cztcbiAgICAgICAgaWYgKHRoaXMuX2FjdGl2ZVRhcmdldHMubGVuZ3RoID4gbWF4QWN0aXZlVGFyZ2V0cykge1xuXG4gICAgICAgICAgICAvLyBzb3J0IHRoZW0gYnkgYWJzV2VpZ2h0XG4gICAgICAgICAgICB0aGlzLl9hY3RpdmVUYXJnZXRzLnNvcnQoZnVuY3Rpb24gKGwsIHIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gKGwuYWJzV2VpZ2h0IDwgci5hYnNXZWlnaHQpID8gMSA6IChyLmFic1dlaWdodCA8IGwuYWJzV2VpZ2h0ID8gLTEgOiAwKTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAvLyByZW1vdmUgZXhjZXNzXG4gICAgICAgICAgICB0aGlzLl9hY3RpdmVUYXJnZXRzLmxlbmd0aCA9IG1heEFjdGl2ZVRhcmdldHM7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBwcmVwYXJlIGZvciByZW5kZXJpbmdcbiAgICAgICAgaWYgKHRoaXMubW9ycGgudXNlVGV4dHVyZU1vcnBoKSB7XG4gICAgICAgICAgICB0aGlzLl91cGRhdGVUZXh0dXJlTW9ycGgoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuX3VwZGF0ZVZlcnRleE1vcnBoKCk7XG4gICAgICAgIH1cbiAgICB9XG59XG5cbmV4cG9ydCB7IE1vcnBoSW5zdGFuY2UgfTtcbiJdLCJuYW1lcyI6WyJ0ZXh0dXJlTW9ycGhWZXJ0ZXhTaGFkZXIiLCJibGVuZFN0YXRlQWRkaXRpdmUiLCJCbGVuZFN0YXRlIiwiQkxFTkRFUVVBVElPTl9BREQiLCJCTEVORE1PREVfT05FIiwiTW9ycGhJbnN0YW5jZSIsImNvbnN0cnVjdG9yIiwibW9ycGgiLCJpbmNSZWZDb3VudCIsImRldmljZSIsIl93ZWlnaHRzIiwiX3dlaWdodE1hcCIsIk1hcCIsInYiLCJfdGFyZ2V0cyIsImxlbmd0aCIsInRhcmdldCIsIm5hbWUiLCJzZXQiLCJzZXRXZWlnaHQiLCJkZWZhdWx0V2VpZ2h0IiwiX2FjdGl2ZVRhcmdldHMiLCJ1c2VUZXh0dXJlTW9ycGgiLCJzaGFkZXJDYWNoZSIsIm1heFN1Ym1pdENvdW50IiwibWF4VGV4dHVyZXMiLCJfc2hhZGVyTW9ycGhXZWlnaHRzIiwiRmxvYXQzMkFycmF5IiwiY3JlYXRlUlQiLCJ0ZXh0dXJlVmFyIiwiX2NyZWF0ZVRleHR1cmUiLCJfcmVuZGVyVGV4dHVyZUZvcm1hdCIsIlJlbmRlclRhcmdldCIsImNvbG9yQnVmZmVyIiwiZGVwdGgiLCJtb3JwaFBvc2l0aW9ucyIsInJ0UG9zaXRpb25zIiwibW9ycGhOb3JtYWxzIiwicnROb3JtYWxzIiwiX3RleHR1cmVQYXJhbXMiLCJtb3JwaFRleHR1cmVXaWR0aCIsIm1vcnBoVGV4dHVyZUhlaWdodCIsImkiLCJzY29wZSIsInJlc29sdmUiLCJtb3JwaEZhY3RvciIsInplcm9UZXh0dXJlcyIsIl9zaGFkZXJNb3JwaFdlaWdodHNBIiwiYnVmZmVyIiwiX3NoYWRlck1vcnBoV2VpZ2h0c0IiLCJfYWN0aXZlVmVydGV4QnVmZmVycyIsIkFycmF5IiwiZGVzdHJveSIsInNoYWRlciIsImRlY1JlZkNvdW50IiwicmVmQ291bnQiLCJ0ZXh0dXJlUG9zaXRpb25zIiwidGV4dHVyZU5vcm1hbHMiLCJjbG9uZSIsIl9nZXRXZWlnaHRJbmRleCIsImtleSIsImluZGV4IiwiZ2V0IiwidW5kZWZpbmVkIiwiRGVidWciLCJlcnJvciIsImdldFdlaWdodCIsIndlaWdodCIsImFzc2VydCIsIl9kaXJ0eSIsIl9nZXRGcmFnbWVudFNoYWRlciIsIm51bVRleHR1cmVzIiwiZnJhZ21lbnRTaGFkZXIiLCJfZ2V0U2hhZGVyIiwiY291bnQiLCJmcyIsImNyZWF0ZVNoYWRlckZyb21Db2RlIiwiX3VwZGF0ZVRleHR1cmVSZW5kZXJUYXJnZXQiLCJyZW5kZXJUYXJnZXQiLCJzcmNUZXh0dXJlTmFtZSIsInN1Ym1pdEJhdGNoIiwidXNlZENvdW50IiwiYmxlbmRpbmciLCJzZXRWYWx1ZSIsInNldEJsZW5kU3RhdGUiLCJOT0JMRU5EIiwiZHJhd1F1YWRXaXRoU2hhZGVyIiwiYWN0aXZlVGFyZ2V0IiwidGV4IiwiX3VwZGF0ZVRleHR1cmVNb3JwaCIsIkRlYnVnR3JhcGhpY3MiLCJwdXNoR3B1TWFya2VyIiwicG9wR3B1TWFya2VyIiwiX3VwZGF0ZVZlcnRleE1vcnBoIiwicG9zSW5kZXgiLCJucm1JbmRleCIsIl92ZXJ0ZXhCdWZmZXJQb3NpdGlvbnMiLCJfdmVydGV4QnVmZmVyTm9ybWFscyIsInVwZGF0ZSIsInRhcmdldHMiLCJhY3RpdmVDb3VudCIsImVwc2lsb24iLCJhYnNXZWlnaHQiLCJNYXRoIiwiYWJzIiwibWF4QWN0aXZlVGFyZ2V0cyIsInNvcnQiLCJsIiwiciJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7QUFVQTtBQUNBLE1BQU1BLHdCQUF3QixhQUFlLENBQUE7QUFDN0M7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsSUFBSyxDQUFBLENBQUE7QUFFTCxNQUFNQyxrQkFBa0IsR0FBRyxJQUFJQyxVQUFVLENBQUMsSUFBSSxFQUFFQyxpQkFBaUIsRUFBRUMsYUFBYSxFQUFFQSxhQUFhLENBQUMsQ0FBQTs7QUFFaEc7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsTUFBTUMsYUFBYSxDQUFDO0FBQ2hCO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7RUFDSUMsV0FBV0EsQ0FBQ0MsS0FBSyxFQUFFO0FBQ2Y7QUFDUjtBQUNBO0FBQ0E7QUFDQTtJQUNRLElBQUksQ0FBQ0EsS0FBSyxHQUFHQSxLQUFLLENBQUE7SUFDbEJBLEtBQUssQ0FBQ0MsV0FBVyxFQUFF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
