import { LitShaderOptions } from '../shader-lib/programs/lit-shader-options.js';

/**
 * The standard material options define a set of options used to control the shader frontend shader
 * generation, such as textures, tints and multipliers.
 *
 * @category Graphics
 */
class StandardMaterialOptions {
  constructor() {
    /**
     * If UV1 (second set of texture coordinates) is required in the shader. Will be declared as
     * "vUv1" and passed to the fragment shader.
     *
     * @type {boolean}
     */
    this.forceUv1 = false;
    /**
     * The value of {@link StandardMaterial#ambientTint}.
     *
     * @type {boolean}
     */
    this.ambientTint = false;
    /**
     * Defines if {@link StandardMaterial#diffuse} constant should affect diffuse color.
     *
     * @type {boolean}
     */
    this.diffuseTint = false;
    /**
     * Defines if {@link StandardMaterial#specular} constant should affect specular color.
     *
     * @type {boolean}
     */
    this.specularTint = false;
    /**
     * Defines if {@link StandardMaterial#metalness} constant should affect metalness value.
     *
     * @type {boolean}
     */
    this.metalnessTint = false;
    /**
     * Defines if {@link StandardMaterial#gloss} constant should affect glossiness value.
     *
     * @type {boolean}
     */
    this.glossTint = false;
    /**
     * Defines if {@link StandardMaterial#emissive} constant should affect emissive color.
     *
     * @type {boolean}
     */
    this.emissiveTint = false;
    /**
     * Defines if {@link StandardMaterial#opacity} constant should affect opacity value.
     *
     * @type {boolean}
     */
    this.opacityTint = false;
    this.emissiveEncoding = 'linear';
    this.lightMapEncoding = 'linear';
    /**
     * If normal map contains X in RGB, Y in Alpha, and Z must be reconstructed.
     *
     * @type {boolean}
     */
    this.packedNormal = false;
    /**
     * Invert the gloss channel.
     *
     * @type {boolean}
     */
    this.glossInvert = false;
    /**
     * Invert the sheen gloss channel.
     *
     * @type {boolean}
     */
    this.sheenGlossInvert = false;
    /**
     * Invert the clearcoat gloss channel.
     *
     * @type {boolean}
     */
    this.clearCoatGlossInvert = false;
    /**
     * Storage for the options for lit the shader and material.
     *
     * @type {LitShaderOptions}
     */
    this.litOptions = new LitShaderOptions();
  }
  // program-library assumes material options has a pass property
  get pass() {
    return this.litOptions.pass;
  }
}

export { StandardMaterialOptions };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhbmRhcmQtbWF0ZXJpYWwtb3B0aW9ucy5qcyIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL3NjZW5lL21hdGVyaWFscy9zdGFuZGFyZC1tYXRlcmlhbC1vcHRpb25zLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IExpdFNoYWRlck9wdGlvbnMgfSBmcm9tIFwiLi4vc2hhZGVyLWxpYi9wcm9ncmFtcy9saXQtc2hhZGVyLW9wdGlvbnMuanNcIjtcblxuLyoqXG4gKiBUaGUgc3RhbmRhcmQgbWF0ZXJpYWwgb3B0aW9ucyBkZWZpbmUgYSBzZXQgb2Ygb3B0aW9ucyB1c2VkIHRvIGNvbnRyb2wgdGhlIHNoYWRlciBmcm9udGVuZCBzaGFkZXJcbiAqIGdlbmVyYXRpb24sIHN1Y2ggYXMgdGV4dHVyZXMsIHRpbnRzIGFuZCBtdWx0aXBsaWVycy5cbiAqXG4gKiBAY2F0ZWdvcnkgR3JhcGhpY3NcbiAqL1xuY2xhc3MgU3RhbmRhcmRNYXRlcmlhbE9wdGlvbnMge1xuICAgIC8qKlxuICAgICAqIElmIFVWMSAoc2Vjb25kIHNldCBvZiB0ZXh0dXJlIGNvb3JkaW5hdGVzKSBpcyByZXF1aXJlZCBpbiB0aGUgc2hhZGVyLiBXaWxsIGJlIGRlY2xhcmVkIGFzXG4gICAgICogXCJ2VXYxXCIgYW5kIHBhc3NlZCB0byB0aGUgZnJhZ21lbnQgc2hhZGVyLlxuICAgICAqXG4gICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICovXG4gICAgZm9yY2VVdjEgPSBmYWxzZTtcblxuICAgIC8qKlxuICAgICAqIFRoZSB2YWx1ZSBvZiB7QGxpbmsgU3RhbmRhcmRNYXRlcmlhbCNhbWJpZW50VGludH0uXG4gICAgICpcbiAgICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICAgKi9cbiAgICBhbWJpZW50VGludCA9IGZhbHNlO1xuXG4gICAgLyoqXG4gICAgICogRGVmaW5lcyBpZiB7QGxpbmsgU3RhbmRhcmRNYXRlcmlhbCNkaWZmdXNlfSBjb25zdGFudCBzaG91bGQgYWZmZWN0IGRpZmZ1c2UgY29sb3IuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICAgKi9cbiAgICBkaWZmdXNlVGludCA9IGZhbHNlO1xuXG4gICAgLyoqXG4gICAgICogRGVmaW5lcyBpZiB7QGxpbmsgU3RhbmRhcmRNYXRlcmlhbCNzcGVjdWxhcn0gY29uc3RhbnQgc2hvdWxkIGFmZmVjdCBzcGVjdWxhciBjb2xvci5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAqL1xuICAgIHNwZWN1bGFyVGludCA9IGZhbHNlO1xuXG4gICAgLyoqXG4gICAgICogRGVmaW5lcyBpZiB7QGxpbmsgU3RhbmRhcmRNYXRlcmlhbCNtZXRhbG5lc3N9IGNvbnN0YW50IHNob3VsZCBhZmZlY3QgbWV0YWxuZXNzIHZhbHVlLlxuICAgICAqXG4gICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICovXG4gICAgbWV0YWxuZXNzVGludCA9IGZhbHNlO1xuXG4gICAgLyoqXG4gICAgICogRGVmaW5lcyBpZiB7QGxpbmsgU3RhbmRhcmRNYXRlcmlhbCNnbG9zc30gY29uc3RhbnQgc2hvdWxkIGFmZmVjdCBnbG9zc2luZXNzIHZhbHVlLlxuICAgICAqXG4gICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICovXG4gICAgZ2xvc3NUaW50ID0gZmFsc2U7XG5cbiAgICAvKipcbiAgICAgKiBEZWZpbmVzIGlmIHtAbGluayBTdGFuZGFyZE1hdGVyaWFsI2VtaXNzaXZlfSBjb25zdGFudCBzaG91bGQgYWZmZWN0IGVtaXNzaXZlIGNvbG9yLlxuICAgICAqXG4gICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICovXG4gICAgZW1pc3NpdmVUaW50ID0gZmFsc2U7XG5cbiAgICAvKipcbiAgICAgKiBEZWZpbmVzIGlmIHtAbGluayBTdGFuZGFyZE1hdGVyaWFsI29wYWNpdHl9IGNvbnN0YW50IHNob3VsZCBhZmZlY3Qgb3BhY2l0eSB2YWx1ZS5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAqL1xuICAgIG9wYWNpdHlUaW50ID0gZmFsc2U7XG5cbiAgICBlbWlzc2l2ZUVuY29kaW5nID0gJ2xpbmVhcic7XG5cbiAgICBsaWdodE1hcEVuY29kaW5nID0gJ2xpbmVhcic7XG5cbiAgICAvKipcbiAgICAgKiBJZiBub3JtYWwgbWFwIGNvbnRhaW5zIFggaW4gUkdCLCBZIGluIEFscGhhLCBhbmQgWiBtdXN0IGJlIHJlY29uc3RydWN0ZWQuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICAgKi9cbiAgICBwYWNrZWROb3JtYWwgPSBmYWxzZTtcblxuICAgIC8qKlxuICAgICAqIEludmVydCB0aGUgZ2xvc3MgY2hhbm5lbC5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAqL1xuICAgIGdsb3NzSW52ZXJ0ID0gZmFsc2U7XG5cbiAgICAvKipcbiAgICAgKiBJbnZlcnQgdGhlIHNoZWVuIGdsb3NzIGNoYW5uZWwuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICAgKi9cbiAgICBzaGVlbkdsb3NzSW52ZXJ0ID0gZmFsc2U7XG5cbiAgICAvKipcbiAgICAgKiBJbnZlcnQgdGhlIGNsZWFyY29hdCBnbG9zcyBjaGFubmVsLlxuICAgICAqXG4gICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICovXG4gICAgY2xlYXJDb2F0R2xvc3NJbnZlcnQgPSBmYWxzZTtcblxuICAgIC8qKlxuICAgICAqIFN0b3JhZ2UgZm9yIHRoZSBvcHRpb25zIGZvciBsaXQgdGhlIHNoYWRlciBhbmQgbWF0ZXJpYWwuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7TGl0U2hhZGVyT3B0aW9uc31cbiAgICAgKi9cbiAgICBsaXRPcHRpb25zID0gbmV3IExpdFNoYWRlck9wdGlvbnMoKTtcblxuICAgIC8vIHByb2dyYW0tbGlicmFyeSBhc3N1bWVzIG1hdGVyaWFsIG9wdGlvbnMgaGFzIGEgcGFzcyBwcm9wZXJ0eVxuICAgIGdldCBwYXNzKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5saXRPcHRpb25zLnBhc3M7XG4gICAgfVxufVxuXG5leHBvcnQgeyBTdGFuZGFyZE1hdGVyaWFsT3B0aW9ucyB9O1xuIl0sIm5hbWVzIjpbIlN0YW5kYXJkTWF0ZXJpYWxPcHRpb25zIiwiY29uc3RydWN0b3IiLCJmb3JjZVV2MSIsImFtYmllbnRUaW50IiwiZGlmZnVzZVRpbnQiLCJzcGVjdWxhclRpbnQiLCJtZXRhbG5lc3NUaW50IiwiZ2xvc3NUaW50IiwiZW1pc3NpdmVUaW50Iiwib3BhY2l0eVRpbnQiLCJlbWlzc2l2ZUVuY29kaW5nIiwibGlnaHRNYXBFbmNvZGluZyIsInBhY2tlZE5vcm1hbCIsImdsb3NzSW52ZXJ0Iiwic2hlZW5HbG9zc0ludmVydCIsImNsZWFyQ29hdEdsb3NzSW52ZXJ0IiwibGl0T3B0aW9ucyIsIkxpdFNoYWRlck9wdGlvbnMiLCJwYXNzIl0sIm1hcHBpbmdzIjoiOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLE1BQU1BLHVCQUF1QixDQUFDO0VBQUFDLFdBQUEsR0FBQTtBQUMxQjtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7SUFMSSxJQU1BQyxDQUFBQSxRQUFRLEdBQUcsS0FBSyxDQUFBO0FBRWhCO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7SUFKSSxJQUtBQyxDQUFBQSxXQUFXLEdBQUcsS0FBSyxDQUFBO0FBRW5CO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7SUFKSSxJQUtBQyxDQUFBQSxXQUFXLEdBQUcsS0FBSyxDQUFBO0FBRW5CO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7SUFKSSxJQUtBQyxDQUFBQSxZQUFZLEdBQUcsS0FBSyxDQUFBO0FBRXBCO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7SUFKSSxJQUtBQyxDQUFBQSxhQUFhLEdBQUcsS0FBSyxDQUFBO0FBRXJCO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7SUFKSSxJQUtBQyxDQUFBQSxTQUFTLEdBQUcsS0FBSyxDQUFBO0FBRWpCO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7SUFKSSxJQUtBQyxDQUFBQSxZQUFZLEdBQUcsS0FBSyxDQUFBO0FBRXBCO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7SUFKSSxJQUtBQyxDQUFBQSxXQUFXLEdBQUcsS0FBSyxDQUFBO0lBQUEsSUFFbkJDLENBQUFBLGdCQUFnQixHQUFHLFFBQVEsQ0FBQTtJQUFBLElBRTNCQyxDQUFBQSxnQkFBZ0IsR0FBRyxRQUFRLENBQUE7QUFFM0I7QUFDSjtBQUNBO0FBQ0E7QUFDQTtJQUpJLElBS0FDLENBQUFBLFlBQVksR0FBRyxLQUFLLENBQUE7QUFFcEI7QUFDSjtBQUNBO0FBQ0E7QUFDQTtJQUpJLElBS0FDLENBQUFBLFdBQVcsR0FBRyxLQUFLLENBQUE7QUFFbkI7QUFDSjtBQUNBO0FBQ0E7QUFDQTtJQUpJLElBS0FDLENBQUFBLGdCQUFnQixHQUFHLEtBQUssQ0FBQTtBQUV4QjtBQUNKO0FBQ0E7QUFDQTtBQUNBO0lBSkksSUFLQUMsQ0FBQUEsb0JBQW9CLEdBQUcsS0FBSyxDQUFBO0FBRTVCO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFKSSxJQUFBLElBQUEsQ0FLQUMsVUFBVSxHQUFHLElBQUlDLGdCQUFnQixFQUFFLENBQUE7QUFBQSxHQUFBO0FBRW5DO0VBQ0EsSUFBSUMsSUFBSUEsR0FBRztBQUNQLElBQUEsT0FBTyxJQUFJLENBQUNGLFVBQVUsQ0FBQ0UsSUFBSSxDQUFBO0FBQy9CLEdBQUE7QUFDSjs7OzsifQ==
