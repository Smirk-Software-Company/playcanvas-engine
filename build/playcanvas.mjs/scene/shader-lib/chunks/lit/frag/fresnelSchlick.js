var fresnelSchlickPS = /* glsl */`
// Schlick's approximation
vec3 getFresnel(
        float cosTheta, 
        float gloss, 
        vec3 specularity
#if defined(LIT_IRIDESCENCE)
        , vec3 iridescenceFresnel, 
        float iridescenceIntensity
#endif
    ) {
    float fresnel = pow(1.0 - max(cosTheta, 0.0), 5.0);
    float glossSq = gloss * gloss;
    vec3 ret = specularity + (max(vec3(glossSq), specularity) - specularity) * fresnel;
#if defined(LIT_IRIDESCENCE)
    return mix(ret, iridescenceFresnel, iridescenceIntensity);
#else
    return ret;
#endif    
}

float getFresnelCC(float cosTheta) {
    float fresnel = pow(1.0 - max(cosTheta, 0.0), 5.0);
    return 0.04 + (1.0 - 0.04) * fresnel;
}
`;

export { fresnelSchlickPS as default };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZnJlc25lbFNjaGxpY2suanMiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uLy4uL3NyYy9zY2VuZS9zaGFkZXItbGliL2NodW5rcy9saXQvZnJhZy9mcmVzbmVsU2NobGljay5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJleHBvcnQgZGVmYXVsdCAvKiBnbHNsICovYFxuLy8gU2NobGljaydzIGFwcHJveGltYXRpb25cbnZlYzMgZ2V0RnJlc25lbChcbiAgICAgICAgZmxvYXQgY29zVGhldGEsIFxuICAgICAgICBmbG9hdCBnbG9zcywgXG4gICAgICAgIHZlYzMgc3BlY3VsYXJpdHlcbiNpZiBkZWZpbmVkKExJVF9JUklERVNDRU5DRSlcbiAgICAgICAgLCB2ZWMzIGlyaWRlc2NlbmNlRnJlc25lbCwgXG4gICAgICAgIGZsb2F0IGlyaWRlc2NlbmNlSW50ZW5zaXR5XG4jZW5kaWZcbiAgICApIHtcbiAgICBmbG9hdCBmcmVzbmVsID0gcG93KDEuMCAtIG1heChjb3NUaGV0YSwgMC4wKSwgNS4wKTtcbiAgICBmbG9hdCBnbG9zc1NxID0gZ2xvc3MgKiBnbG9zcztcbiAgICB2ZWMzIHJldCA9IHNwZWN1bGFyaXR5ICsgKG1heCh2ZWMzKGdsb3NzU3EpLCBzcGVjdWxhcml0eSkgLSBzcGVjdWxhcml0eSkgKiBmcmVzbmVsO1xuI2lmIGRlZmluZWQoTElUX0lSSURFU0NFTkNFKVxuICAgIHJldHVybiBtaXgocmV0LCBpcmlkZXNjZW5jZUZyZXNuZWwsIGlyaWRlc2NlbmNlSW50ZW5zaXR5KTtcbiNlbHNlXG4gICAgcmV0dXJuIHJldDtcbiNlbmRpZiAgICBcbn1cblxuZmxvYXQgZ2V0RnJlc25lbENDKGZsb2F0IGNvc1RoZXRhKSB7XG4gICAgZmxvYXQgZnJlc25lbCA9IHBvdygxLjAgLSBtYXgoY29zVGhldGEsIDAuMCksIDUuMCk7XG4gICAgcmV0dXJuIDAuMDQgKyAoMS4wIC0gMC4wNCkgKiBmcmVzbmVsO1xufVxuYDtcbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSx1QkFBZSxVQUFXLENBQUE7QUFDMUI7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsQ0FBQzs7OzsifQ==
