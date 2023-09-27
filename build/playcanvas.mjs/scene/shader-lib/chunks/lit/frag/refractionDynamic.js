var refractionDynamicPS = /* glsl */`
uniform float material_invAttenuationDistance;
uniform vec3 material_attenuation;

void addRefraction(
    vec3 worldNormal, 
    vec3 viewDir, 
    float thickness, 
    float gloss, 
    vec3 specularity, 
    vec3 albedo, 
    float transmission,
    float refractionIndex
#if defined(LIT_IRIDESCENCE)
    , vec3 iridescenceFresnel,
    float iridescenceIntensity
#endif
) {

    // Extract scale from the model transform
    vec3 modelScale;
    modelScale.x = length(vec3(matrix_model[0].xyz));
    modelScale.y = length(vec3(matrix_model[1].xyz));
    modelScale.z = length(vec3(matrix_model[2].xyz));

    // Calculate the refraction vector, scaled by the thickness and scale of the object
    vec3 refractionVector = normalize(refract(-viewDir, worldNormal, refractionIndex)) * thickness * modelScale;

    // The refraction point is the entry point + vector to exit point
    vec4 pointOfRefraction = vec4(vPositionW + refractionVector, 1.0);

    // Project to texture space so we can sample it
    vec4 projectionPoint = matrix_viewProjection * pointOfRefraction;

    // use built-in getGrabScreenPos function to convert screen position to grab texture uv coords
    vec2 uv = getGrabScreenPos(projectionPoint);

    #ifdef SUPPORTS_TEXLOD
        // Use IOR and roughness to select mip
        float iorToRoughness = (1.0 - gloss) * clamp((1.0 / refractionIndex) * 2.0 - 2.0, 0.0, 1.0);
        float refractionLod = log2(uScreenSize.x) * iorToRoughness;
        vec3 refraction = texture2DLodEXT(uSceneColorMap, uv, refractionLod).rgb;
    #else
        vec3 refraction = texture2D(uSceneColorMap, uv).rgb;
    #endif

    // Transmittance is our final refraction color
    vec3 transmittance;
    if (material_invAttenuationDistance != 0.0)
    {
        vec3 attenuation = -log(material_attenuation) * material_invAttenuationDistance;
        transmittance = exp(-attenuation * length(refractionVector));
    }
    else
    {
        transmittance = refraction;
    }

    // Apply fresnel effect on refraction
    vec3 fresnel = vec3(1.0) - 
        getFresnel(
            dot(viewDir, worldNormal), 
            gloss, 
            specularity
        #if defined(LIT_IRIDESCENCE)
            , iridescenceFresnel,
            iridescenceIntensity
        #endif
        );
    dDiffuseLight = mix(dDiffuseLight, refraction * transmittance * fresnel, transmission);
}
`;

export { refractionDynamicPS as default };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVmcmFjdGlvbkR5bmFtaWMuanMiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uLy4uL3NyYy9zY2VuZS9zaGFkZXItbGliL2NodW5rcy9saXQvZnJhZy9yZWZyYWN0aW9uRHluYW1pYy5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJleHBvcnQgZGVmYXVsdCAvKiBnbHNsICovYFxudW5pZm9ybSBmbG9hdCBtYXRlcmlhbF9pbnZBdHRlbnVhdGlvbkRpc3RhbmNlO1xudW5pZm9ybSB2ZWMzIG1hdGVyaWFsX2F0dGVudWF0aW9uO1xuXG52b2lkIGFkZFJlZnJhY3Rpb24oXG4gICAgdmVjMyB3b3JsZE5vcm1hbCwgXG4gICAgdmVjMyB2aWV3RGlyLCBcbiAgICBmbG9hdCB0aGlja25lc3MsIFxuICAgIGZsb2F0IGdsb3NzLCBcbiAgICB2ZWMzIHNwZWN1bGFyaXR5LCBcbiAgICB2ZWMzIGFsYmVkbywgXG4gICAgZmxvYXQgdHJhbnNtaXNzaW9uLFxuICAgIGZsb2F0IHJlZnJhY3Rpb25JbmRleFxuI2lmIGRlZmluZWQoTElUX0lSSURFU0NFTkNFKVxuICAgICwgdmVjMyBpcmlkZXNjZW5jZUZyZXNuZWwsXG4gICAgZmxvYXQgaXJpZGVzY2VuY2VJbnRlbnNpdHlcbiNlbmRpZlxuKSB7XG5cbiAgICAvLyBFeHRyYWN0IHNjYWxlIGZyb20gdGhlIG1vZGVsIHRyYW5zZm9ybVxuICAgIHZlYzMgbW9kZWxTY2FsZTtcbiAgICBtb2RlbFNjYWxlLnggPSBsZW5ndGgodmVjMyhtYXRyaXhfbW9kZWxbMF0ueHl6KSk7XG4gICAgbW9kZWxTY2FsZS55ID0gbGVuZ3RoKHZlYzMobWF0cml4X21vZGVsWzFdLnh5eikpO1xuICAgIG1vZGVsU2NhbGUueiA9IGxlbmd0aCh2ZWMzKG1hdHJpeF9tb2RlbFsyXS54eXopKTtcblxuICAgIC8vIENhbGN1bGF0ZSB0aGUgcmVmcmFjdGlvbiB2ZWN0b3IsIHNjYWxlZCBieSB0aGUgdGhpY2tuZXNzIGFuZCBzY2FsZSBvZiB0aGUgb2JqZWN0XG4gICAgdmVjMyByZWZyYWN0aW9uVmVjdG9yID0gbm9ybWFsaXplKHJlZnJhY3QoLXZpZXdEaXIsIHdvcmxkTm9ybWFsLCByZWZyYWN0aW9uSW5kZXgpKSAqIHRoaWNrbmVzcyAqIG1vZGVsU2NhbGU7XG5cbiAgICAvLyBUaGUgcmVmcmFjdGlvbiBwb2ludCBpcyB0aGUgZW50cnkgcG9pbnQgKyB2ZWN0b3IgdG8gZXhpdCBwb2ludFxuICAgIHZlYzQgcG9pbnRPZlJlZnJhY3Rpb24gPSB2ZWM0KHZQb3NpdGlvblcgKyByZWZyYWN0aW9uVmVjdG9yLCAxLjApO1xuXG4gICAgLy8gUHJvamVjdCB0byB0ZXh0dXJlIHNwYWNlIHNvIHdlIGNhbiBzYW1wbGUgaXRcbiAgICB2ZWM0IHByb2plY3Rpb25Qb2ludCA9IG1hdHJpeF92aWV3UHJvamVjdGlvbiAqIHBvaW50T2ZSZWZyYWN0aW9uO1xuXG4gICAgLy8gdXNlIGJ1aWx0LWluIGdldEdyYWJTY3JlZW5Qb3MgZnVuY3Rpb24gdG8gY29udmVydCBzY3JlZW4gcG9zaXRpb24gdG8gZ3JhYiB0ZXh0dXJlIHV2IGNvb3Jkc1xuICAgIHZlYzIgdXYgPSBnZXRHcmFiU2NyZWVuUG9zKHByb2plY3Rpb25Qb2ludCk7XG5cbiAgICAjaWZkZWYgU1VQUE9SVFNfVEVYTE9EXG4gICAgICAgIC8vIFVzZSBJT1IgYW5kIHJvdWdobmVzcyB0byBzZWxlY3QgbWlwXG4gICAgICAgIGZsb2F0IGlvclRvUm91Z2huZXNzID0gKDEuMCAtIGdsb3NzKSAqIGNsYW1wKCgxLjAgLyByZWZyYWN0aW9uSW5kZXgpICogMi4wIC0gMi4wLCAwLjAsIDEuMCk7XG4gICAgICAgIGZsb2F0IHJlZnJhY3Rpb25Mb2QgPSBsb2cyKHVTY3JlZW5TaXplLngpICogaW9yVG9Sb3VnaG5lc3M7XG4gICAgICAgIHZlYzMgcmVmcmFjdGlvbiA9IHRleHR1cmUyRExvZEVYVCh1U2NlbmVDb2xvck1hcCwgdXYsIHJlZnJhY3Rpb25Mb2QpLnJnYjtcbiAgICAjZWxzZVxuICAgICAgICB2ZWMzIHJlZnJhY3Rpb24gPSB0ZXh0dXJlMkQodVNjZW5lQ29sb3JNYXAsIHV2KS5yZ2I7XG4gICAgI2VuZGlmXG5cbiAgICAvLyBUcmFuc21pdHRhbmNlIGlzIG91ciBmaW5hbCByZWZyYWN0aW9uIGNvbG9yXG4gICAgdmVjMyB0cmFuc21pdHRhbmNlO1xuICAgIGlmIChtYXRlcmlhbF9pbnZBdHRlbnVhdGlvbkRpc3RhbmNlICE9IDAuMClcbiAgICB7XG4gICAgICAgIHZlYzMgYXR0ZW51YXRpb24gPSAtbG9nKG1hdGVyaWFsX2F0dGVudWF0aW9uKSAqIG1hdGVyaWFsX2ludkF0dGVudWF0aW9uRGlzdGFuY2U7XG4gICAgICAgIHRyYW5zbWl0dGFuY2UgPSBleHAoLWF0dGVudWF0aW9uICogbGVuZ3RoKHJlZnJhY3Rpb25WZWN0b3IpKTtcbiAgICB9XG4gICAgZWxzZVxuICAgIHtcbiAgICAgICAgdHJhbnNtaXR0YW5jZSA9IHJlZnJhY3Rpb247XG4gICAgfVxuXG4gICAgLy8gQXBwbHkgZnJlc25lbCBlZmZlY3Qgb24gcmVmcmFjdGlvblxuICAgIHZlYzMgZnJlc25lbCA9IHZlYzMoMS4wKSAtIFxuICAgICAgICBnZXRGcmVzbmVsKFxuICAgICAgICAgICAgZG90KHZpZXdEaXIsIHdvcmxkTm9ybWFsKSwgXG4gICAgICAgICAgICBnbG9zcywgXG4gICAgICAgICAgICBzcGVjdWxhcml0eVxuICAgICAgICAjaWYgZGVmaW5lZChMSVRfSVJJREVTQ0VOQ0UpXG4gICAgICAgICAgICAsIGlyaWRlc2NlbmNlRnJlc25lbCxcbiAgICAgICAgICAgIGlyaWRlc2NlbmNlSW50ZW5zaXR5XG4gICAgICAgICNlbmRpZlxuICAgICAgICApO1xuICAgIGREaWZmdXNlTGlnaHQgPSBtaXgoZERpZmZ1c2VMaWdodCwgcmVmcmFjdGlvbiAqIHRyYW5zbWl0dGFuY2UgKiBmcmVzbmVsLCB0cmFuc21pc3Npb24pO1xufVxuYDtcbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSwwQkFBZSxVQUFXLENBQUE7QUFDMUI7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxDQUFDOzs7OyJ9
