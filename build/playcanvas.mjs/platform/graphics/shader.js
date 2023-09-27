import { TRACEID_SHADER_ALLOC } from '../../core/constants.js';
import { Debug } from '../../core/debug.js';
import { Preprocessor } from '../../core/preprocessor.js';
import { DebugGraphics } from './debug-graphics.js';

let id = 0;

/**
 * A shader is a program that is responsible for rendering graphical primitives on a device's
 * graphics processor. The shader is generated from a shader definition. This shader definition
 * specifies the code for processing vertices and fragments processed by the GPU. The language of
 * the code is GLSL (or more specifically ESSL, the OpenGL ES Shading Language). The shader
 * definition also describes how the PlayCanvas engine should map vertex buffer elements onto the
 * attributes specified in the vertex shader code.
 *
 * @category Graphics
 */
class Shader {
  /**
   * Creates a new Shader instance.
   *
   * Consider {@link createShaderFromCode} as a simpler and more powerful way to create
   * a shader.
   *
   * @param {import('./graphics-device.js').GraphicsDevice} graphicsDevice - The graphics device
   * used to manage this shader.
   * @param {object} definition - The shader definition from which to build the shader.
   * @param {string} [definition.name] - The name of the shader.
   * @param {Object<string, string>} [definition.attributes] - Object detailing the mapping of
   * vertex shader attribute names to semantics SEMANTIC_*. This enables the engine to match
   * vertex buffer data as inputs to the shader. When not specified, rendering without
   * vertex buffer is assumed.
   * @param {string} definition.vshader - Vertex shader source (GLSL code).
   * @param {string} [definition.fshader] - Fragment shader source (GLSL code). Optional when
   * useTransformFeedback is specified.
   * @param {boolean} [definition.useTransformFeedback] - Specifies that this shader outputs
   * post-VS data to a buffer.
   * @param {string} [definition.shaderLanguage] - Specifies the shader language of vertex and
   * fragment shaders. Defaults to {@link SHADERLANGUAGE_GLSL}.
   * @example
   * // Create a shader that renders primitives with a solid red color
   *
   * // Vertex shader
   * const vshader = `
   * attribute vec3 aPosition;
   *
   * void main(void) {
   *     gl_Position = vec4(aPosition, 1.0);
   * }
   * `;
   *
   * // Fragment shader
   * const fshader = `
   * precision ${graphicsDevice.precision} float;
   *
   * void main(void) {
   *     gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
   * }
   * `;
   *
   * const shaderDefinition = {
   *     attributes: {
   *         aPosition: pc.SEMANTIC_POSITION
   *     },
   *     vshader,
   *     fshader
   * };
   *
   * const shader = new pc.Shader(graphicsDevice, shaderDefinition);
   */
  constructor(graphicsDevice, definition) {
    /**
     * Format of the uniform buffer for mesh bind group.
     *
     * @type {import('./uniform-buffer-format.js').UniformBufferFormat}
     * @ignore
     */
    this.meshUniformBufferFormat = void 0;
    /**
     * Format of the bind group for the mesh bind group.
     *
     * @type {import('./bind-group-format.js').BindGroupFormat}
     * @ignore
     */
    this.meshBindGroupFormat = void 0;
    this.id = id++;
    this.device = graphicsDevice;
    this.definition = definition;
    this.name = definition.name || 'Untitled';
    Debug.assert(definition.vshader, 'No vertex shader has been specified when creating a shader.');
    Debug.assert(definition.fshader, 'No fragment shader has been specified when creating a shader.');

    // pre-process shader sources
    definition.vshader = Preprocessor.run(definition.vshader);
    definition.fshader = Preprocessor.run(definition.fshader, graphicsDevice.webgl2);
    this.init();
    this.impl = graphicsDevice.createShaderImpl(this);
    Debug.trace(TRACEID_SHADER_ALLOC, `Alloc: ${this.label}, stack: ${DebugGraphics.toString()}`, {
      instance: this
    });
  }

  /**
   * Initialize a shader back to its default state.
   *
   * @private
   */
  init() {
    this.ready = false;
    this.failed = false;
  }

  /** @ignore */
  get label() {
    return `Shader Id ${this.id} ${this.name}`;
  }

  /**
   * Frees resources associated with this shader.
   */
  destroy() {
    Debug.trace(TRACEID_SHADER_ALLOC, `DeAlloc: Id ${this.id} ${this.name}`);
    this.device.onDestroyShader(this);
    this.impl.destroy(this);
  }

  /**
   * Called when the WebGL context was lost. It releases all context related resources.
   *
   * @ignore
   */
  loseContext() {
    this.init();
    this.impl.loseContext();
  }

  /** @ignore */
  restoreContext() {
    this.impl.restoreContext(this.device, this);
  }
}

export { Shader };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2hhZGVyLmpzIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvcGxhdGZvcm0vZ3JhcGhpY3Mvc2hhZGVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFRSQUNFSURfU0hBREVSX0FMTE9DIH0gZnJvbSAnLi4vLi4vY29yZS9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgRGVidWcgfSBmcm9tICcuLi8uLi9jb3JlL2RlYnVnLmpzJztcbmltcG9ydCB7IFByZXByb2Nlc3NvciB9IGZyb20gJy4uLy4uL2NvcmUvcHJlcHJvY2Vzc29yLmpzJztcbmltcG9ydCB7IERlYnVnR3JhcGhpY3MgfSBmcm9tICcuL2RlYnVnLWdyYXBoaWNzLmpzJztcblxubGV0IGlkID0gMDtcblxuLyoqXG4gKiBBIHNoYWRlciBpcyBhIHByb2dyYW0gdGhhdCBpcyByZXNwb25zaWJsZSBmb3IgcmVuZGVyaW5nIGdyYXBoaWNhbCBwcmltaXRpdmVzIG9uIGEgZGV2aWNlJ3NcbiAqIGdyYXBoaWNzIHByb2Nlc3Nvci4gVGhlIHNoYWRlciBpcyBnZW5lcmF0ZWQgZnJvbSBhIHNoYWRlciBkZWZpbml0aW9uLiBUaGlzIHNoYWRlciBkZWZpbml0aW9uXG4gKiBzcGVjaWZpZXMgdGhlIGNvZGUgZm9yIHByb2Nlc3NpbmcgdmVydGljZXMgYW5kIGZyYWdtZW50cyBwcm9jZXNzZWQgYnkgdGhlIEdQVS4gVGhlIGxhbmd1YWdlIG9mXG4gKiB0aGUgY29kZSBpcyBHTFNMIChvciBtb3JlIHNwZWNpZmljYWxseSBFU1NMLCB0aGUgT3BlbkdMIEVTIFNoYWRpbmcgTGFuZ3VhZ2UpLiBUaGUgc2hhZGVyXG4gKiBkZWZpbml0aW9uIGFsc28gZGVzY3JpYmVzIGhvdyB0aGUgUGxheUNhbnZhcyBlbmdpbmUgc2hvdWxkIG1hcCB2ZXJ0ZXggYnVmZmVyIGVsZW1lbnRzIG9udG8gdGhlXG4gKiBhdHRyaWJ1dGVzIHNwZWNpZmllZCBpbiB0aGUgdmVydGV4IHNoYWRlciBjb2RlLlxuICpcbiAqIEBjYXRlZ29yeSBHcmFwaGljc1xuICovXG5jbGFzcyBTaGFkZXIge1xuICAgIC8qKlxuICAgICAqIEZvcm1hdCBvZiB0aGUgdW5pZm9ybSBidWZmZXIgZm9yIG1lc2ggYmluZCBncm91cC5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtpbXBvcnQoJy4vdW5pZm9ybS1idWZmZXItZm9ybWF0LmpzJykuVW5pZm9ybUJ1ZmZlckZvcm1hdH1cbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgbWVzaFVuaWZvcm1CdWZmZXJGb3JtYXQ7XG5cbiAgICAvKipcbiAgICAgKiBGb3JtYXQgb2YgdGhlIGJpbmQgZ3JvdXAgZm9yIHRoZSBtZXNoIGJpbmQgZ3JvdXAuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7aW1wb3J0KCcuL2JpbmQtZ3JvdXAtZm9ybWF0LmpzJykuQmluZEdyb3VwRm9ybWF0fVxuICAgICAqIEBpZ25vcmVcbiAgICAgKi9cbiAgICBtZXNoQmluZEdyb3VwRm9ybWF0O1xuXG4gICAgLyoqXG4gICAgICogQ3JlYXRlcyBhIG5ldyBTaGFkZXIgaW5zdGFuY2UuXG4gICAgICpcbiAgICAgKiBDb25zaWRlciB7QGxpbmsgY3JlYXRlU2hhZGVyRnJvbUNvZGV9IGFzIGEgc2ltcGxlciBhbmQgbW9yZSBwb3dlcmZ1bCB3YXkgdG8gY3JlYXRlXG4gICAgICogYSBzaGFkZXIuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi9ncmFwaGljcy1kZXZpY2UuanMnKS5HcmFwaGljc0RldmljZX0gZ3JhcGhpY3NEZXZpY2UgLSBUaGUgZ3JhcGhpY3MgZGV2aWNlXG4gICAgICogdXNlZCB0byBtYW5hZ2UgdGhpcyBzaGFkZXIuXG4gICAgICogQHBhcmFtIHtvYmplY3R9IGRlZmluaXRpb24gLSBUaGUgc2hhZGVyIGRlZmluaXRpb24gZnJvbSB3aGljaCB0byBidWlsZCB0aGUgc2hhZGVyLlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBbZGVmaW5pdGlvbi5uYW1lXSAtIFRoZSBuYW1lIG9mIHRoZSBzaGFkZXIuXG4gICAgICogQHBhcmFtIHtPYmplY3Q8c3RyaW5nLCBzdHJpbmc+fSBbZGVmaW5pdGlvbi5hdHRyaWJ1dGVzXSAtIE9iamVjdCBkZXRhaWxpbmcgdGhlIG1hcHBpbmcgb2ZcbiAgICAgKiB2ZXJ0ZXggc2hhZGVyIGF0dHJpYnV0ZSBuYW1lcyB0byBzZW1hbnRpY3MgU0VNQU5USUNfKi4gVGhpcyBlbmFibGVzIHRoZSBlbmdpbmUgdG8gbWF0Y2hcbiAgICAgKiB2ZXJ0ZXggYnVmZmVyIGRhdGEgYXMgaW5wdXRzIHRvIHRoZSBzaGFkZXIuIFdoZW4gbm90IHNwZWNpZmllZCwgcmVuZGVyaW5nIHdpdGhvdXRcbiAgICAgKiB2ZXJ0ZXggYnVmZmVyIGlzIGFzc3VtZWQuXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IGRlZmluaXRpb24udnNoYWRlciAtIFZlcnRleCBzaGFkZXIgc291cmNlIChHTFNMIGNvZGUpLlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBbZGVmaW5pdGlvbi5mc2hhZGVyXSAtIEZyYWdtZW50IHNoYWRlciBzb3VyY2UgKEdMU0wgY29kZSkuIE9wdGlvbmFsIHdoZW5cbiAgICAgKiB1c2VUcmFuc2Zvcm1GZWVkYmFjayBpcyBzcGVjaWZpZWQuXG4gICAgICogQHBhcmFtIHtib29sZWFufSBbZGVmaW5pdGlvbi51c2VUcmFuc2Zvcm1GZWVkYmFja10gLSBTcGVjaWZpZXMgdGhhdCB0aGlzIHNoYWRlciBvdXRwdXRzXG4gICAgICogcG9zdC1WUyBkYXRhIHRvIGEgYnVmZmVyLlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBbZGVmaW5pdGlvbi5zaGFkZXJMYW5ndWFnZV0gLSBTcGVjaWZpZXMgdGhlIHNoYWRlciBsYW5ndWFnZSBvZiB2ZXJ0ZXggYW5kXG4gICAgICogZnJhZ21lbnQgc2hhZGVycy4gRGVmYXVsdHMgdG8ge0BsaW5rIFNIQURFUkxBTkdVQUdFX0dMU0x9LlxuICAgICAqIEBleGFtcGxlXG4gICAgICogLy8gQ3JlYXRlIGEgc2hhZGVyIHRoYXQgcmVuZGVycyBwcmltaXRpdmVzIHdpdGggYSBzb2xpZCByZWQgY29sb3JcbiAgICAgKlxuICAgICAqIC8vIFZlcnRleCBzaGFkZXJcbiAgICAgKiBjb25zdCB2c2hhZGVyID0gYFxuICAgICAqIGF0dHJpYnV0ZSB2ZWMzIGFQb3NpdGlvbjtcbiAgICAgKlxuICAgICAqIHZvaWQgbWFpbih2b2lkKSB7XG4gICAgICogICAgIGdsX1Bvc2l0aW9uID0gdmVjNChhUG9zaXRpb24sIDEuMCk7XG4gICAgICogfVxuICAgICAqIGA7XG4gICAgICpcbiAgICAgKiAvLyBGcmFnbWVudCBzaGFkZXJcbiAgICAgKiBjb25zdCBmc2hhZGVyID0gYFxuICAgICAqIHByZWNpc2lvbiAke2dyYXBoaWNzRGV2aWNlLnByZWNpc2lvbn0gZmxvYXQ7XG4gICAgICpcbiAgICAgKiB2b2lkIG1haW4odm9pZCkge1xuICAgICAqICAgICBnbF9GcmFnQ29sb3IgPSB2ZWM0KDEuMCwgMC4wLCAwLjAsIDEuMCk7XG4gICAgICogfVxuICAgICAqIGA7XG4gICAgICpcbiAgICAgKiBjb25zdCBzaGFkZXJEZWZpbml0aW9uID0ge1xuICAgICAqICAgICBhdHRyaWJ1dGVzOiB7XG4gICAgICogICAgICAgICBhUG9zaXRpb246IHBjLlNFTUFOVElDX1BPU0lUSU9OXG4gICAgICogICAgIH0sXG4gICAgICogICAgIHZzaGFkZXIsXG4gICAgICogICAgIGZzaGFkZXJcbiAgICAgKiB9O1xuICAgICAqXG4gICAgICogY29uc3Qgc2hhZGVyID0gbmV3IHBjLlNoYWRlcihncmFwaGljc0RldmljZSwgc2hhZGVyRGVmaW5pdGlvbik7XG4gICAgICovXG4gICAgY29uc3RydWN0b3IoZ3JhcGhpY3NEZXZpY2UsIGRlZmluaXRpb24pIHtcbiAgICAgICAgdGhpcy5pZCA9IGlkKys7XG4gICAgICAgIHRoaXMuZGV2aWNlID0gZ3JhcGhpY3NEZXZpY2U7XG4gICAgICAgIHRoaXMuZGVmaW5pdGlvbiA9IGRlZmluaXRpb247XG4gICAgICAgIHRoaXMubmFtZSA9IGRlZmluaXRpb24ubmFtZSB8fCAnVW50aXRsZWQnO1xuXG4gICAgICAgIERlYnVnLmFzc2VydChkZWZpbml0aW9uLnZzaGFkZXIsICdObyB2ZXJ0ZXggc2hhZGVyIGhhcyBiZWVuIHNwZWNpZmllZCB3aGVuIGNyZWF0aW5nIGEgc2hhZGVyLicpO1xuICAgICAgICBEZWJ1Zy5hc3NlcnQoZGVmaW5pdGlvbi5mc2hhZGVyLCAnTm8gZnJhZ21lbnQgc2hhZGVyIGhhcyBiZWVuIHNwZWNpZmllZCB3aGVuIGNyZWF0aW5nIGEgc2hhZGVyLicpO1xuXG4gICAgICAgIC8vIHByZS1wcm9jZXNzIHNoYWRlciBzb3VyY2VzXG4gICAgICAgIGRlZmluaXRpb24udnNoYWRlciA9IFByZXByb2Nlc3Nvci5ydW4oZGVmaW5pdGlvbi52c2hhZGVyKTtcbiAgICAgICAgZGVmaW5pdGlvbi5mc2hhZGVyID0gUHJlcHJvY2Vzc29yLnJ1bihkZWZpbml0aW9uLmZzaGFkZXIsIGdyYXBoaWNzRGV2aWNlLndlYmdsMik7XG5cbiAgICAgICAgdGhpcy5pbml0KCk7XG5cbiAgICAgICAgdGhpcy5pbXBsID0gZ3JhcGhpY3NEZXZpY2UuY3JlYXRlU2hhZGVySW1wbCh0aGlzKTtcblxuICAgICAgICBEZWJ1Zy50cmFjZShUUkFDRUlEX1NIQURFUl9BTExPQywgYEFsbG9jOiAke3RoaXMubGFiZWx9LCBzdGFjazogJHtEZWJ1Z0dyYXBoaWNzLnRvU3RyaW5nKCl9YCwge1xuICAgICAgICAgICAgaW5zdGFuY2U6IHRoaXNcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSW5pdGlhbGl6ZSBhIHNoYWRlciBiYWNrIHRvIGl0cyBkZWZhdWx0IHN0YXRlLlxuICAgICAqXG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBpbml0KCkge1xuICAgICAgICB0aGlzLnJlYWR5ID0gZmFsc2U7XG4gICAgICAgIHRoaXMuZmFpbGVkID0gZmFsc2U7XG4gICAgfVxuXG4gICAgLyoqIEBpZ25vcmUgKi9cbiAgICBnZXQgbGFiZWwoKSB7XG4gICAgICAgIHJldHVybiBgU2hhZGVyIElkICR7dGhpcy5pZH0gJHt0aGlzLm5hbWV9YDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBGcmVlcyByZXNvdXJjZXMgYXNzb2NpYXRlZCB3aXRoIHRoaXMgc2hhZGVyLlxuICAgICAqL1xuICAgIGRlc3Ryb3koKSB7XG4gICAgICAgIERlYnVnLnRyYWNlKFRSQUNFSURfU0hBREVSX0FMTE9DLCBgRGVBbGxvYzogSWQgJHt0aGlzLmlkfSAke3RoaXMubmFtZX1gKTtcbiAgICAgICAgdGhpcy5kZXZpY2Uub25EZXN0cm95U2hhZGVyKHRoaXMpO1xuICAgICAgICB0aGlzLmltcGwuZGVzdHJveSh0aGlzKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDYWxsZWQgd2hlbiB0aGUgV2ViR0wgY29udGV4dCB3YXMgbG9zdC4gSXQgcmVsZWFzZXMgYWxsIGNvbnRleHQgcmVsYXRlZCByZXNvdXJjZXMuXG4gICAgICpcbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgbG9zZUNvbnRleHQoKSB7XG4gICAgICAgIHRoaXMuaW5pdCgpO1xuICAgICAgICB0aGlzLmltcGwubG9zZUNvbnRleHQoKTtcbiAgICB9XG5cbiAgICAvKiogQGlnbm9yZSAqL1xuICAgIHJlc3RvcmVDb250ZXh0KCkge1xuICAgICAgICB0aGlzLmltcGwucmVzdG9yZUNvbnRleHQodGhpcy5kZXZpY2UsIHRoaXMpO1xuICAgIH1cbn1cblxuZXhwb3J0IHsgU2hhZGVyIH07XG4iXSwibmFtZXMiOlsiaWQiLCJTaGFkZXIiLCJjb25zdHJ1Y3RvciIsImdyYXBoaWNzRGV2aWNlIiwiZGVmaW5pdGlvbiIsIm1lc2hVbmlmb3JtQnVmZmVyRm9ybWF0IiwibWVzaEJpbmRHcm91cEZvcm1hdCIsImRldmljZSIsIm5hbWUiLCJEZWJ1ZyIsImFzc2VydCIsInZzaGFkZXIiLCJmc2hhZGVyIiwiUHJlcHJvY2Vzc29yIiwicnVuIiwid2ViZ2wyIiwiaW5pdCIsImltcGwiLCJjcmVhdGVTaGFkZXJJbXBsIiwidHJhY2UiLCJUUkFDRUlEX1NIQURFUl9BTExPQyIsImxhYmVsIiwiRGVidWdHcmFwaGljcyIsInRvU3RyaW5nIiwiaW5zdGFuY2UiLCJyZWFkeSIsImZhaWxlZCIsImRlc3Ryb3kiLCJvbkRlc3Ryb3lTaGFkZXIiLCJsb3NlQ29udGV4dCIsInJlc3RvcmVDb250ZXh0Il0sIm1hcHBpbmdzIjoiOzs7OztBQUtBLElBQUlBLEVBQUUsR0FBRyxDQUFDLENBQUE7O0FBRVY7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxNQUFNQyxNQUFNLENBQUM7QUFpQlQ7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDSUMsRUFBQUEsV0FBV0EsQ0FBQ0MsY0FBYyxFQUFFQyxVQUFVLEVBQUU7QUFwRXhDO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUxJLElBQUEsSUFBQSxDQU1BQyx1QkFBdUIsR0FBQSxLQUFBLENBQUEsQ0FBQTtBQUV2QjtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFMSSxJQUFBLElBQUEsQ0FNQUMsbUJBQW1CLEdBQUEsS0FBQSxDQUFBLENBQUE7QUF1RGYsSUFBQSxJQUFJLENBQUNOLEVBQUUsR0FBR0EsRUFBRSxFQUFFLENBQUE7SUFDZCxJQUFJLENBQUNPLE1BQU0sR0FBR0osY0FBYyxDQUFBO0lBQzVCLElBQUksQ0FBQ0MsVUFBVSxHQUFHQSxVQUFVLENBQUE7QUFDNUIsSUFBQSxJQUFJLENBQUNJLElBQUksR0FBR0osVUFBVSxDQUFDSSxJQUFJLElBQUksVUFBVSxDQUFBO0lBRXpDQyxLQUFLLENBQUNDLE1BQU0sQ0FBQ04sVUFBVSxDQUFDTyxPQUFPLEVBQUUsNkRBQTZELENBQUMsQ0FBQTtJQUMvRkYsS0FBSyxDQUFDQyxNQUFNLENBQUNOLFVBQVUsQ0FBQ1EsT0FBTyxFQUFFLCtEQUErRCxDQUFDLENBQUE7O0FBRWpHO0lBQ0FSLFVBQVUsQ0FBQ08sT0FBTyxHQUFHRSxZQUFZLENBQUNDLEdBQUcsQ0FBQ1YsVUFBVSxDQUFDTyxPQUFPLENBQUMsQ0FBQTtBQUN6RFAsSUFBQUEsVUFBVSxDQUFDUSxPQUFPLEdBQUdDLFlBQVksQ0FBQ0MsR0FBRyxDQUFDVixVQUFVLENBQUNRLE9BQU8sRUFBRVQsY0FBYyxDQUFDWSxNQUFNLENBQUMsQ0FBQTtJQUVoRixJQUFJLENBQUNDLElBQUksRUFBRSxDQUFBO0lBRVgsSUFBSSxDQUFDQyxJQUFJLEdBQUdkLGNBQWMsQ0FBQ2UsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLENBQUE7QUFFakRULElBQUFBLEtBQUssQ0FBQ1UsS0FBSyxDQUFDQyxvQkFBb0IsRUFBRyxVQUFTLElBQUksQ0FBQ0MsS0FBTSxDQUFBLFNBQUEsRUFBV0MsYUFBYSxDQUFDQyxRQUFRLEVBQUcsRUFBQyxFQUFFO0FBQzFGQyxNQUFBQSxRQUFRLEVBQUUsSUFBQTtBQUNkLEtBQUMsQ0FBQyxDQUFBO0FBQ04sR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0lSLEVBQUFBLElBQUlBLEdBQUc7SUFDSCxJQUFJLENBQUNTLEtBQUssR0FBRyxLQUFLLENBQUE7SUFDbEIsSUFBSSxDQUFDQyxNQUFNLEdBQUcsS0FBSyxDQUFBO0FBQ3ZCLEdBQUE7O0FBRUE7RUFDQSxJQUFJTCxLQUFLQSxHQUFHO0lBQ1IsT0FBUSxDQUFBLFVBQUEsRUFBWSxJQUFJLENBQUNyQixFQUFHLElBQUcsSUFBSSxDQUFDUSxJQUFLLENBQUMsQ0FBQSxDQUFBO0FBQzlDLEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0ltQixFQUFBQSxPQUFPQSxHQUFHO0FBQ05sQixJQUFBQSxLQUFLLENBQUNVLEtBQUssQ0FBQ0Msb0JBQW9CLEVBQUcsQ0FBYyxZQUFBLEVBQUEsSUFBSSxDQUFDcEIsRUFBRyxDQUFHLENBQUEsRUFBQSxJQUFJLENBQUNRLElBQUssRUFBQyxDQUFDLENBQUE7QUFDeEUsSUFBQSxJQUFJLENBQUNELE1BQU0sQ0FBQ3FCLGVBQWUsQ0FBQyxJQUFJLENBQUMsQ0FBQTtBQUNqQyxJQUFBLElBQUksQ0FBQ1gsSUFBSSxDQUFDVSxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUE7QUFDM0IsR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0lFLEVBQUFBLFdBQVdBLEdBQUc7SUFDVixJQUFJLENBQUNiLElBQUksRUFBRSxDQUFBO0FBQ1gsSUFBQSxJQUFJLENBQUNDLElBQUksQ0FBQ1ksV0FBVyxFQUFFLENBQUE7QUFDM0IsR0FBQTs7QUFFQTtBQUNBQyxFQUFBQSxjQUFjQSxHQUFHO0lBQ2IsSUFBSSxDQUFDYixJQUFJLENBQUNhLGNBQWMsQ0FBQyxJQUFJLENBQUN2QixNQUFNLEVBQUUsSUFBSSxDQUFDLENBQUE7QUFDL0MsR0FBQTtBQUNKOzs7OyJ9
