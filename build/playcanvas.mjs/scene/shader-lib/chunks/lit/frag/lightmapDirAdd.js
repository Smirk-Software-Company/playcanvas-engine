var lightmapDirAddPS = /* glsl */`
void addLightMap(
    vec3 lightmap, 
    vec3 dir, 
    vec3 worldNormal, 
    vec3 viewDir, 
    vec3 reflectionDir, 
    float gloss, 
    vec3 specularity, 
    vec3 vertexNormal, 
    mat3 tbn
#if defined(LIT_IRIDESCENCE)
    vec3 iridescenceFresnel, 
    float iridescenceIntensity
#endif
) {
    if (dot(dir, dir) < 0.0001) {
        dDiffuseLight += lightmap;
    } else {
        float vlight = saturate(dot(dir, -vertexNormal));
        float flight = saturate(dot(dir, -worldNormal));
        float nlight = (flight / max(vlight, 0.01)) * 0.5;

        dDiffuseLight += lightmap * nlight * 2.0;

        vec3 halfDir = normalize(-dir + viewDir);
        vec3 specularLight = lightmap * getLightSpecular(halfDir, reflectionDir, worldNormal, viewDir, dir, gloss, tbn);

#ifdef LIT_SPECULAR_FRESNEL
        specularLight *= 
            getFresnel(dot(viewDir, halfDir), 
            gloss, 
            specularity
        #if defined(LIT_IRIDESCENCE)
            , iridescenceFresnel,
            iridescenceIntensity
        #endif
            );
#endif

        dSpecularLight += specularLight;
    }
}
`;

export { lightmapDirAddPS as default };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGlnaHRtYXBEaXJBZGQuanMiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uLy4uL3NyYy9zY2VuZS9zaGFkZXItbGliL2NodW5rcy9saXQvZnJhZy9saWdodG1hcERpckFkZC5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJleHBvcnQgZGVmYXVsdCAvKiBnbHNsICovYFxudm9pZCBhZGRMaWdodE1hcChcbiAgICB2ZWMzIGxpZ2h0bWFwLCBcbiAgICB2ZWMzIGRpciwgXG4gICAgdmVjMyB3b3JsZE5vcm1hbCwgXG4gICAgdmVjMyB2aWV3RGlyLCBcbiAgICB2ZWMzIHJlZmxlY3Rpb25EaXIsIFxuICAgIGZsb2F0IGdsb3NzLCBcbiAgICB2ZWMzIHNwZWN1bGFyaXR5LCBcbiAgICB2ZWMzIHZlcnRleE5vcm1hbCwgXG4gICAgbWF0MyB0Ym5cbiNpZiBkZWZpbmVkKExJVF9JUklERVNDRU5DRSlcbiAgICB2ZWMzIGlyaWRlc2NlbmNlRnJlc25lbCwgXG4gICAgZmxvYXQgaXJpZGVzY2VuY2VJbnRlbnNpdHlcbiNlbmRpZlxuKSB7XG4gICAgaWYgKGRvdChkaXIsIGRpcikgPCAwLjAwMDEpIHtcbiAgICAgICAgZERpZmZ1c2VMaWdodCArPSBsaWdodG1hcDtcbiAgICB9IGVsc2Uge1xuICAgICAgICBmbG9hdCB2bGlnaHQgPSBzYXR1cmF0ZShkb3QoZGlyLCAtdmVydGV4Tm9ybWFsKSk7XG4gICAgICAgIGZsb2F0IGZsaWdodCA9IHNhdHVyYXRlKGRvdChkaXIsIC13b3JsZE5vcm1hbCkpO1xuICAgICAgICBmbG9hdCBubGlnaHQgPSAoZmxpZ2h0IC8gbWF4KHZsaWdodCwgMC4wMSkpICogMC41O1xuXG4gICAgICAgIGREaWZmdXNlTGlnaHQgKz0gbGlnaHRtYXAgKiBubGlnaHQgKiAyLjA7XG5cbiAgICAgICAgdmVjMyBoYWxmRGlyID0gbm9ybWFsaXplKC1kaXIgKyB2aWV3RGlyKTtcbiAgICAgICAgdmVjMyBzcGVjdWxhckxpZ2h0ID0gbGlnaHRtYXAgKiBnZXRMaWdodFNwZWN1bGFyKGhhbGZEaXIsIHJlZmxlY3Rpb25EaXIsIHdvcmxkTm9ybWFsLCB2aWV3RGlyLCBkaXIsIGdsb3NzLCB0Ym4pO1xuXG4jaWZkZWYgTElUX1NQRUNVTEFSX0ZSRVNORUxcbiAgICAgICAgc3BlY3VsYXJMaWdodCAqPSBcbiAgICAgICAgICAgIGdldEZyZXNuZWwoZG90KHZpZXdEaXIsIGhhbGZEaXIpLCBcbiAgICAgICAgICAgIGdsb3NzLCBcbiAgICAgICAgICAgIHNwZWN1bGFyaXR5XG4gICAgICAgICNpZiBkZWZpbmVkKExJVF9JUklERVNDRU5DRSlcbiAgICAgICAgICAgICwgaXJpZGVzY2VuY2VGcmVzbmVsLFxuICAgICAgICAgICAgaXJpZGVzY2VuY2VJbnRlbnNpdHlcbiAgICAgICAgI2VuZGlmXG4gICAgICAgICAgICApO1xuI2VuZGlmXG5cbiAgICAgICAgZFNwZWN1bGFyTGlnaHQgKz0gc3BlY3VsYXJMaWdodDtcbiAgICB9XG59XG5gO1xuIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLHVCQUFlLFVBQVcsQ0FBQTtBQUMxQjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxDQUFDOzs7OyJ9
