import { BLEND_NONE, FOG_NONE, GAMMA_NONE } from '../../constants.js';

/**
 * The lit shader options determines how the lit-shader gets generated. It specifies a set of
 * parameters which triggers different fragment and vertex shader generation in the backend.
 *
 * @category Graphics
 */
class LitShaderOptions {
  constructor() {
    this.hasTangents = false;
    /**
     * Object containing custom shader chunks that will replace default ones.
     *
     * @type {Object<string, string>}
     */
    this.chunks = {};
    // one of the SHADER_ constants
    this.pass = 0;
    /**
     * Enable alpha testing. See {@link Material#alphaTest}.
     *
     * @type {boolean}
     */
    this.alphaTest = false;
    /**
     * The value of {@link Material#blendType}.
     *
     * @type {number}
     */
    this.blendType = BLEND_NONE;
    this.separateAmbient = false;
    this.screenSpace = false;
    this.skin = false;
    /**
     * If hardware instancing compatible shader should be generated. Transform is read from
     * per-instance {@link VertexBuffer} instead of shader's uniforms.
     *
     * @type {boolean}
     */
    this.useInstancing = false;
    /**
     * If morphing code should be generated to morph positions.
     *
     * @type {boolean}
     */
    this.useMorphPosition = false;
    /**
     * If morphing code should be generated to morph normals.
     *
     * @type {boolean}
     */
    this.useMorphNormal = false;
    this.useMorphTextureBased = false;
    this.nineSlicedMode = 0;
    this.clusteredLightingEnabled = true;
    this.clusteredLightingCookiesEnabled = false;
    this.clusteredLightingShadowsEnabled = false;
    this.clusteredLightingShadowType = 0;
    this.clusteredLightingAreaLightsEnabled = false;
    this.vertexColors = false;
    this.lightMapEnabled = false;
    this.dirLightMapEnabled = false;
    this.useHeights = false;
    this.useNormals = false;
    this.useClearCoatNormals = false;
    this.useAo = false;
    this.diffuseMapEnabled = false;
    this.useAmbientTint = false;
    /**
     * Replaced the whole fragment shader with this string.
     *
     * @type {string}
     */
    this.customFragmentShader = null;
    this.pixelSnap = false;
    /**
     * The value of {@link StandardMaterial#shadingModel}.
     *
     * @type {number}
     */
    this.shadingModel = 0;
    /**
     * If ambient spherical harmonics are used. Ambient SH replace prefiltered cubemap ambient on
     * certain platforms (mostly Android) for performance reasons.
     *
     * @type {boolean}
     */
    this.ambientSH = false;
    /**
     * Use slightly cheaper normal mapping code (skip tangent space normalization). Can look buggy
     * sometimes.
     *
     * @type {boolean}
     */
    this.fastTbn = false;
    /**
     * The value of {@link StandardMaterial#twoSidedLighting}.
     *
     * @type {boolean}
     */
    this.twoSidedLighting = false;
    /**
     * The value of {@link StandardMaterial#occludeDirect}.
     *
     * @type {boolean}
     */
    this.occludeDirect = false;
    /**
     * The value of {@link StandardMaterial#occludeSpecular}.
     *
     * @type {number}
     */
    this.occludeSpecular = 0;
    /**
     * Defines if {@link StandardMaterial#occludeSpecularIntensity} constant should affect specular
     * occlusion.
     *
     * @type {boolean}
     */
    this.occludeSpecularFloat = false;
    this.useMsdf = false;
    this.msdfTextAttribute = false;
    /**
     * Enable alpha to coverage. See {@link Material#alphaToCoverage}.
     *
     * @type {boolean}
     */
    this.alphaToCoverage = false;
    /**
     * Enable specular fade. See {@link StandardMaterial#opacityFadesSpecular}.
     *
     * @type {boolean}
     */
    this.opacityFadesSpecular = false;
    /**
     * The value of {@link StandardMaterial#cubeMapProjection}.
     *
     * @type {number}
     */
    this.cubeMapProjection = 0;
    /**
     * The value of {@link StandardMaterial#conserveEnergy}.
     *
     * @type {boolean}
     */
    this.conserveEnergy = false;
    /**
     * If any specular or reflections are needed at all.
     *
     * @type {boolean}
     */
    this.useSpecular = false;
    this.useSpecularityFactor = false;
    this.enableGGXSpecular = false;
    /**
     * The value of {@link StandardMaterial#fresnelModel}.
     *
     * @type {number}
     */
    this.fresnelModel = 0;
    /**
     * If refraction is used.
     *
     * @type {boolean}
     */
    this.useRefraction = false;
    this.useClearCoat = false;
    this.useSheen = false;
    this.useIridescence = false;
    /**
     * The value of {@link StandardMaterial#useMetalness}.
     *
     * @type {boolean}
     */
    this.useMetalness = false;
    this.useDynamicRefraction = false;
    /**
     * The type of fog being applied in the shader. See {@link Scene#fog} for the list of possible
     * values.
     *
     * @type {string}
     */
    this.fog = FOG_NONE;
    /**
     * The type of gamma correction being applied in the shader. See {@link Scene#gammaCorrection}
     * for the list of possible values.
     *
     * @type {number}
     */
    this.gamma = GAMMA_NONE;
    /**
     * The type of tone mapping being applied in the shader. See {@link Scene#toneMapping} for the
     * list of possible values.
     *
     * @type {number}
     */
    this.toneMap = -1;
    /**
     * If cubemaps require seam fixing (see the `fixCubemapSeams` property of the options object
     * passed to the {@link Texture} constructor).
     *
     * @type {boolean}
     */
    this.fixSeams = false;
    /**
     * One of "envAtlasHQ", "envAtlas", "cubeMap", "sphereMap".
     *
     * @type {string}
     */
    this.reflectionSource = null;
    this.reflectionEncoding = null;
    this.reflectionCubemapEncoding = null;
    /**
     * One of "ambientSH", "envAtlas", "constant".
     *
     * @type {string}
     */
    this.ambientSource = 'constant';
    this.ambientEncoding = null;
    // TODO: add a test for if non skybox cubemaps have rotation (when this is supported) - for now
    // assume no non-skybox cubemap rotation
    /**
     * Skybox intensity factor.
     *
     * @type {number}
     */
    this.skyboxIntensity = 1.0;
    /**
     * If cube map rotation is enabled.
     *
     * @type {boolean}
     */
    this.useCubeMapRotation = false;
    this.lightMapWithoutAmbient = false;
    this.lights = [];
    this.noShadow = false;
    this.lightMaskDynamic = 0x0;
    /**
     * Object containing a map of user defined vertex attributes to attached shader semantics.
     *
     * @type {Object<string, string>}
     */
    this.userAttributes = {};
  }
}

export { LitShaderOptions };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGl0LXNoYWRlci1vcHRpb25zLmpzIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi9zcmMvc2NlbmUvc2hhZGVyLWxpYi9wcm9ncmFtcy9saXQtc2hhZGVyLW9wdGlvbnMuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQkxFTkRfTk9ORSwgRk9HX05PTkUsIEdBTU1BX05PTkUgfSBmcm9tICcuLi8uLi9jb25zdGFudHMuanMnO1xuXG4vKipcbiAqIFRoZSBsaXQgc2hhZGVyIG9wdGlvbnMgZGV0ZXJtaW5lcyBob3cgdGhlIGxpdC1zaGFkZXIgZ2V0cyBnZW5lcmF0ZWQuIEl0IHNwZWNpZmllcyBhIHNldCBvZlxuICogcGFyYW1ldGVycyB3aGljaCB0cmlnZ2VycyBkaWZmZXJlbnQgZnJhZ21lbnQgYW5kIHZlcnRleCBzaGFkZXIgZ2VuZXJhdGlvbiBpbiB0aGUgYmFja2VuZC5cbiAqXG4gKiBAY2F0ZWdvcnkgR3JhcGhpY3NcbiAqL1xuY2xhc3MgTGl0U2hhZGVyT3B0aW9ucyB7XG4gICAgaGFzVGFuZ2VudHMgPSBmYWxzZTtcblxuICAgIC8qKlxuICAgICAqIE9iamVjdCBjb250YWluaW5nIGN1c3RvbSBzaGFkZXIgY2h1bmtzIHRoYXQgd2lsbCByZXBsYWNlIGRlZmF1bHQgb25lcy5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtPYmplY3Q8c3RyaW5nLCBzdHJpbmc+fVxuICAgICAqL1xuICAgIGNodW5rcyA9IHt9O1xuXG4gICAgLy8gb25lIG9mIHRoZSBTSEFERVJfIGNvbnN0YW50c1xuICAgIHBhc3MgPSAwO1xuXG4gICAgLyoqXG4gICAgICogRW5hYmxlIGFscGhhIHRlc3RpbmcuIFNlZSB7QGxpbmsgTWF0ZXJpYWwjYWxwaGFUZXN0fS5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAqL1xuICAgIGFscGhhVGVzdCA9IGZhbHNlO1xuXG4gICAgLyoqXG4gICAgICogVGhlIHZhbHVlIG9mIHtAbGluayBNYXRlcmlhbCNibGVuZFR5cGV9LlxuICAgICAqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKi9cbiAgICBibGVuZFR5cGUgPSBCTEVORF9OT05FO1xuXG4gICAgc2VwYXJhdGVBbWJpZW50ID0gZmFsc2U7XG5cbiAgICBzY3JlZW5TcGFjZSA9IGZhbHNlO1xuXG4gICAgc2tpbiA9IGZhbHNlO1xuXG4gICAgLyoqXG4gICAgICogSWYgaGFyZHdhcmUgaW5zdGFuY2luZyBjb21wYXRpYmxlIHNoYWRlciBzaG91bGQgYmUgZ2VuZXJhdGVkLiBUcmFuc2Zvcm0gaXMgcmVhZCBmcm9tXG4gICAgICogcGVyLWluc3RhbmNlIHtAbGluayBWZXJ0ZXhCdWZmZXJ9IGluc3RlYWQgb2Ygc2hhZGVyJ3MgdW5pZm9ybXMuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICAgKi9cbiAgICB1c2VJbnN0YW5jaW5nID0gZmFsc2U7XG5cbiAgICAvKipcbiAgICAgKiBJZiBtb3JwaGluZyBjb2RlIHNob3VsZCBiZSBnZW5lcmF0ZWQgdG8gbW9ycGggcG9zaXRpb25zLlxuICAgICAqXG4gICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICovXG4gICAgdXNlTW9ycGhQb3NpdGlvbiA9IGZhbHNlO1xuXG4gICAgLyoqXG4gICAgICogSWYgbW9ycGhpbmcgY29kZSBzaG91bGQgYmUgZ2VuZXJhdGVkIHRvIG1vcnBoIG5vcm1hbHMuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICAgKi9cbiAgICB1c2VNb3JwaE5vcm1hbCA9IGZhbHNlO1xuXG4gICAgdXNlTW9ycGhUZXh0dXJlQmFzZWQgPSBmYWxzZTtcblxuICAgIG5pbmVTbGljZWRNb2RlID0gMDtcblxuICAgIGNsdXN0ZXJlZExpZ2h0aW5nRW5hYmxlZCA9IHRydWU7XG5cbiAgICBjbHVzdGVyZWRMaWdodGluZ0Nvb2tpZXNFbmFibGVkID0gZmFsc2U7XG5cbiAgICBjbHVzdGVyZWRMaWdodGluZ1NoYWRvd3NFbmFibGVkID0gZmFsc2U7XG5cbiAgICBjbHVzdGVyZWRMaWdodGluZ1NoYWRvd1R5cGUgPSAwO1xuXG4gICAgY2x1c3RlcmVkTGlnaHRpbmdBcmVhTGlnaHRzRW5hYmxlZCA9IGZhbHNlO1xuXG4gICAgdmVydGV4Q29sb3JzID0gZmFsc2U7XG5cbiAgICBsaWdodE1hcEVuYWJsZWQgPSBmYWxzZTtcblxuICAgIGRpckxpZ2h0TWFwRW5hYmxlZCA9IGZhbHNlO1xuXG4gICAgdXNlSGVpZ2h0cyA9IGZhbHNlO1xuXG4gICAgdXNlTm9ybWFscyA9IGZhbHNlO1xuXG4gICAgdXNlQ2xlYXJDb2F0Tm9ybWFscyA9IGZhbHNlO1xuXG4gICAgdXNlQW8gPSBmYWxzZTtcblxuICAgIGRpZmZ1c2VNYXBFbmFibGVkID0gZmFsc2U7XG5cbiAgICB1c2VBbWJpZW50VGludCA9IGZhbHNlO1xuXG4gICAgLyoqXG4gICAgICogUmVwbGFjZWQgdGhlIHdob2xlIGZyYWdtZW50IHNoYWRlciB3aXRoIHRoaXMgc3RyaW5nLlxuICAgICAqXG4gICAgICogQHR5cGUge3N0cmluZ31cbiAgICAgKi9cbiAgICBjdXN0b21GcmFnbWVudFNoYWRlciA9IG51bGw7XG5cbiAgICBwaXhlbFNuYXAgPSBmYWxzZTtcblxuICAgIC8qKlxuICAgICAqIFRoZSB2YWx1ZSBvZiB7QGxpbmsgU3RhbmRhcmRNYXRlcmlhbCNzaGFkaW5nTW9kZWx9LlxuICAgICAqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKi9cbiAgICBzaGFkaW5nTW9kZWwgPSAwO1xuXG4gICAgLyoqXG4gICAgICogSWYgYW1iaWVudCBzcGhlcmljYWwgaGFybW9uaWNzIGFyZSB1c2VkLiBBbWJpZW50IFNIIHJlcGxhY2UgcHJlZmlsdGVyZWQgY3ViZW1hcCBhbWJpZW50IG9uXG4gICAgICogY2VydGFpbiBwbGF0Zm9ybXMgKG1vc3RseSBBbmRyb2lkKSBmb3IgcGVyZm9ybWFuY2UgcmVhc29ucy5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAqL1xuICAgIGFtYmllbnRTSCA9IGZhbHNlO1xuXG4gICAgLyoqXG4gICAgICogVXNlIHNsaWdodGx5IGNoZWFwZXIgbm9ybWFsIG1hcHBpbmcgY29kZSAoc2tpcCB0YW5nZW50IHNwYWNlIG5vcm1hbGl6YXRpb24pLiBDYW4gbG9vayBidWdneVxuICAgICAqIHNvbWV0aW1lcy5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAqL1xuICAgIGZhc3RUYm4gPSBmYWxzZTtcblxuICAgIC8qKlxuICAgICAqIFRoZSB2YWx1ZSBvZiB7QGxpbmsgU3RhbmRhcmRNYXRlcmlhbCN0d29TaWRlZExpZ2h0aW5nfS5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAqL1xuICAgIHR3b1NpZGVkTGlnaHRpbmcgPSBmYWxzZTtcblxuICAgIC8qKlxuICAgICAqIFRoZSB2YWx1ZSBvZiB7QGxpbmsgU3RhbmRhcmRNYXRlcmlhbCNvY2NsdWRlRGlyZWN0fS5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAqL1xuICAgIG9jY2x1ZGVEaXJlY3QgPSBmYWxzZTtcblxuICAgIC8qKlxuICAgICAqIFRoZSB2YWx1ZSBvZiB7QGxpbmsgU3RhbmRhcmRNYXRlcmlhbCNvY2NsdWRlU3BlY3VsYXJ9LlxuICAgICAqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKi9cbiAgICBvY2NsdWRlU3BlY3VsYXIgPSAwO1xuXG4gICAgLyoqXG4gICAgICogRGVmaW5lcyBpZiB7QGxpbmsgU3RhbmRhcmRNYXRlcmlhbCNvY2NsdWRlU3BlY3VsYXJJbnRlbnNpdHl9IGNvbnN0YW50IHNob3VsZCBhZmZlY3Qgc3BlY3VsYXJcbiAgICAgKiBvY2NsdXNpb24uXG4gICAgICpcbiAgICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICAgKi9cbiAgICBvY2NsdWRlU3BlY3VsYXJGbG9hdCA9IGZhbHNlO1xuXG4gICAgdXNlTXNkZiA9IGZhbHNlO1xuXG4gICAgbXNkZlRleHRBdHRyaWJ1dGUgPSBmYWxzZTtcblxuICAgIC8qKlxuICAgICAqIEVuYWJsZSBhbHBoYSB0byBjb3ZlcmFnZS4gU2VlIHtAbGluayBNYXRlcmlhbCNhbHBoYVRvQ292ZXJhZ2V9LlxuICAgICAqXG4gICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICovXG4gICAgYWxwaGFUb0NvdmVyYWdlID0gZmFsc2U7XG5cbiAgICAvKipcbiAgICAgKiBFbmFibGUgc3BlY3VsYXIgZmFkZS4gU2VlIHtAbGluayBTdGFuZGFyZE1hdGVyaWFsI29wYWNpdHlGYWRlc1NwZWN1bGFyfS5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAqL1xuICAgIG9wYWNpdHlGYWRlc1NwZWN1bGFyID0gZmFsc2U7XG5cbiAgICAvKipcbiAgICAgKiBUaGUgdmFsdWUgb2Yge0BsaW5rIFN0YW5kYXJkTWF0ZXJpYWwjY3ViZU1hcFByb2plY3Rpb259LlxuICAgICAqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKi9cbiAgICBjdWJlTWFwUHJvamVjdGlvbiA9IDA7XG5cbiAgICAvKipcbiAgICAgKiBUaGUgdmFsdWUgb2Yge0BsaW5rIFN0YW5kYXJkTWF0ZXJpYWwjY29uc2VydmVFbmVyZ3l9LlxuICAgICAqXG4gICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICovXG4gICAgY29uc2VydmVFbmVyZ3kgPSBmYWxzZTtcblxuICAgIC8qKlxuICAgICAqIElmIGFueSBzcGVjdWxhciBvciByZWZsZWN0aW9ucyBhcmUgbmVlZGVkIGF0IGFsbC5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAqL1xuICAgIHVzZVNwZWN1bGFyID0gZmFsc2U7XG5cbiAgICB1c2VTcGVjdWxhcml0eUZhY3RvciA9IGZhbHNlO1xuXG4gICAgZW5hYmxlR0dYU3BlY3VsYXIgPSBmYWxzZTtcblxuICAgIC8qKlxuICAgICAqIFRoZSB2YWx1ZSBvZiB7QGxpbmsgU3RhbmRhcmRNYXRlcmlhbCNmcmVzbmVsTW9kZWx9LlxuICAgICAqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKi9cbiAgICBmcmVzbmVsTW9kZWwgPSAwO1xuXG4gICAgLyoqXG4gICAgICogSWYgcmVmcmFjdGlvbiBpcyB1c2VkLlxuICAgICAqXG4gICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICovXG4gICAgdXNlUmVmcmFjdGlvbiA9IGZhbHNlO1xuXG4gICAgdXNlQ2xlYXJDb2F0ID0gZmFsc2U7XG5cbiAgICB1c2VTaGVlbiA9IGZhbHNlO1xuXG4gICAgdXNlSXJpZGVzY2VuY2UgPSBmYWxzZTtcblxuICAgIC8qKlxuICAgICAqIFRoZSB2YWx1ZSBvZiB7QGxpbmsgU3RhbmRhcmRNYXRlcmlhbCN1c2VNZXRhbG5lc3N9LlxuICAgICAqXG4gICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICovXG4gICAgdXNlTWV0YWxuZXNzID0gZmFsc2U7XG5cbiAgICB1c2VEeW5hbWljUmVmcmFjdGlvbiA9IGZhbHNlO1xuXG4gICAgLyoqXG4gICAgICogVGhlIHR5cGUgb2YgZm9nIGJlaW5nIGFwcGxpZWQgaW4gdGhlIHNoYWRlci4gU2VlIHtAbGluayBTY2VuZSNmb2d9IGZvciB0aGUgbGlzdCBvZiBwb3NzaWJsZVxuICAgICAqIHZhbHVlcy5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtzdHJpbmd9XG4gICAgICovXG4gICAgZm9nID0gRk9HX05PTkU7XG5cbiAgICAvKipcbiAgICAgKiBUaGUgdHlwZSBvZiBnYW1tYSBjb3JyZWN0aW9uIGJlaW5nIGFwcGxpZWQgaW4gdGhlIHNoYWRlci4gU2VlIHtAbGluayBTY2VuZSNnYW1tYUNvcnJlY3Rpb259XG4gICAgICogZm9yIHRoZSBsaXN0IG9mIHBvc3NpYmxlIHZhbHVlcy5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtudW1iZXJ9XG4gICAgICovXG4gICAgZ2FtbWEgPSBHQU1NQV9OT05FO1xuXG4gICAgLyoqXG4gICAgICogVGhlIHR5cGUgb2YgdG9uZSBtYXBwaW5nIGJlaW5nIGFwcGxpZWQgaW4gdGhlIHNoYWRlci4gU2VlIHtAbGluayBTY2VuZSN0b25lTWFwcGluZ30gZm9yIHRoZVxuICAgICAqIGxpc3Qgb2YgcG9zc2libGUgdmFsdWVzLlxuICAgICAqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKi9cbiAgICB0b25lTWFwID0gLTE7XG5cbiAgICAvKipcbiAgICAgKiBJZiBjdWJlbWFwcyByZXF1aXJlIHNlYW0gZml4aW5nIChzZWUgdGhlIGBmaXhDdWJlbWFwU2VhbXNgIHByb3BlcnR5IG9mIHRoZSBvcHRpb25zIG9iamVjdFxuICAgICAqIHBhc3NlZCB0byB0aGUge0BsaW5rIFRleHR1cmV9IGNvbnN0cnVjdG9yKS5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAqL1xuICAgIGZpeFNlYW1zID0gZmFsc2U7XG5cbiAgICAvKipcbiAgICAgKiBPbmUgb2YgXCJlbnZBdGxhc0hRXCIsIFwiZW52QXRsYXNcIiwgXCJjdWJlTWFwXCIsIFwic3BoZXJlTWFwXCIuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7c3RyaW5nfVxuICAgICAqL1xuICAgIHJlZmxlY3Rpb25Tb3VyY2UgPSBudWxsO1xuXG4gICAgcmVmbGVjdGlvbkVuY29kaW5nID0gbnVsbDtcblxuICAgIHJlZmxlY3Rpb25DdWJlbWFwRW5jb2RpbmcgPSBudWxsO1xuXG4gICAgLyoqXG4gICAgICogT25lIG9mIFwiYW1iaWVudFNIXCIsIFwiZW52QXRsYXNcIiwgXCJjb25zdGFudFwiLlxuICAgICAqXG4gICAgICogQHR5cGUge3N0cmluZ31cbiAgICAgKi9cbiAgICBhbWJpZW50U291cmNlID0gJ2NvbnN0YW50JztcblxuICAgIGFtYmllbnRFbmNvZGluZyA9IG51bGw7XG5cbiAgICAvLyBUT0RPOiBhZGQgYSB0ZXN0IGZvciBpZiBub24gc2t5Ym94IGN1YmVtYXBzIGhhdmUgcm90YXRpb24gKHdoZW4gdGhpcyBpcyBzdXBwb3J0ZWQpIC0gZm9yIG5vd1xuICAgIC8vIGFzc3VtZSBubyBub24tc2t5Ym94IGN1YmVtYXAgcm90YXRpb25cblxuICAgIC8qKlxuICAgICAqIFNreWJveCBpbnRlbnNpdHkgZmFjdG9yLlxuICAgICAqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKi9cbiAgICBza3lib3hJbnRlbnNpdHkgPSAxLjA7XG5cbiAgICAvKipcbiAgICAgKiBJZiBjdWJlIG1hcCByb3RhdGlvbiBpcyBlbmFibGVkLlxuICAgICAqXG4gICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICovXG4gICAgdXNlQ3ViZU1hcFJvdGF0aW9uID0gZmFsc2U7XG5cbiAgICBsaWdodE1hcFdpdGhvdXRBbWJpZW50ID0gZmFsc2U7XG5cbiAgICBsaWdodHMgPSBbXTtcblxuICAgIG5vU2hhZG93ID0gZmFsc2U7XG5cbiAgICBsaWdodE1hc2tEeW5hbWljID0gMHgwO1xuXG4gICAgLyoqXG4gICAgICogT2JqZWN0IGNvbnRhaW5pbmcgYSBtYXAgb2YgdXNlciBkZWZpbmVkIHZlcnRleCBhdHRyaWJ1dGVzIHRvIGF0dGFjaGVkIHNoYWRlciBzZW1hbnRpY3MuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7T2JqZWN0PHN0cmluZywgc3RyaW5nPn1cbiAgICAgKi9cbiAgICB1c2VyQXR0cmlidXRlcyA9IHt9O1xufVxuXG5leHBvcnQgeyBMaXRTaGFkZXJPcHRpb25zIH07XG4iXSwibmFtZXMiOlsiTGl0U2hhZGVyT3B0aW9ucyIsImNvbnN0cnVjdG9yIiwiaGFzVGFuZ2VudHMiLCJjaHVua3MiLCJwYXNzIiwiYWxwaGFUZXN0IiwiYmxlbmRUeXBlIiwiQkxFTkRfTk9ORSIsInNlcGFyYXRlQW1iaWVudCIsInNjcmVlblNwYWNlIiwic2tpbiIsInVzZUluc3RhbmNpbmciLCJ1c2VNb3JwaFBvc2l0aW9uIiwidXNlTW9ycGhOb3JtYWwiLCJ1c2VNb3JwaFRleHR1cmVCYXNlZCIsIm5pbmVTbGljZWRNb2RlIiwiY2x1c3RlcmVkTGlnaHRpbmdFbmFibGVkIiwiY2x1c3RlcmVkTGlnaHRpbmdDb29raWVzRW5hYmxlZCIsImNsdXN0ZXJlZExpZ2h0aW5nU2hhZG93c0VuYWJsZWQiLCJjbHVzdGVyZWRMaWdodGluZ1NoYWRvd1R5cGUiLCJjbHVzdGVyZWRMaWdodGluZ0FyZWFMaWdodHNFbmFibGVkIiwidmVydGV4Q29sb3JzIiwibGlnaHRNYXBFbmFibGVkIiwiZGlyTGlnaHRNYXBFbmFibGVkIiwidXNlSGVpZ2h0cyIsInVzZU5vcm1hbHMiLCJ1c2VDbGVhckNvYXROb3JtYWxzIiwidXNlQW8iLCJkaWZmdXNlTWFwRW5hYmxlZCIsInVzZUFtYmllbnRUaW50IiwiY3VzdG9tRnJhZ21lbnRTaGFkZXIiLCJwaXhlbFNuYXAiLCJzaGFkaW5nTW9kZWwiLCJhbWJpZW50U0giLCJmYXN0VGJuIiwidHdvU2lkZWRMaWdodGluZyIsIm9jY2x1ZGVEaXJlY3QiLCJvY2NsdWRlU3BlY3VsYXIiLCJvY2NsdWRlU3BlY3VsYXJGbG9hdCIsInVzZU1zZGYiLCJtc2RmVGV4dEF0dHJpYnV0ZSIsImFscGhhVG9Db3ZlcmFnZSIsIm9wYWNpdHlGYWRlc1NwZWN1bGFyIiwiY3ViZU1hcFByb2plY3Rpb24iLCJjb25zZXJ2ZUVuZXJneSIsInVzZVNwZWN1bGFyIiwidXNlU3BlY3VsYXJpdHlGYWN0b3IiLCJlbmFibGVHR1hTcGVjdWxhciIsImZyZXNuZWxNb2RlbCIsInVzZVJlZnJhY3Rpb24iLCJ1c2VDbGVhckNvYXQiLCJ1c2VTaGVlbiIsInVzZUlyaWRlc2NlbmNlIiwidXNlTWV0YWxuZXNzIiwidXNlRHluYW1pY1JlZnJhY3Rpb24iLCJmb2ciLCJGT0dfTk9ORSIsImdhbW1hIiwiR0FNTUFfTk9ORSIsInRvbmVNYXAiLCJmaXhTZWFtcyIsInJlZmxlY3Rpb25Tb3VyY2UiLCJyZWZsZWN0aW9uRW5jb2RpbmciLCJyZWZsZWN0aW9uQ3ViZW1hcEVuY29kaW5nIiwiYW1iaWVudFNvdXJjZSIsImFtYmllbnRFbmNvZGluZyIsInNreWJveEludGVuc2l0eSIsInVzZUN1YmVNYXBSb3RhdGlvbiIsImxpZ2h0TWFwV2l0aG91dEFtYmllbnQiLCJsaWdodHMiLCJub1NoYWRv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
