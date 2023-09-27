var refractionCubePS = /* glsl */`
vec3 refract2(vec3 viewVec, vec3 normal, float IOR) {
    float vn = dot(viewVec, normal);
    float k = 1.0 - IOR * IOR * (1.0 - vn * vn);
    vec3 refrVec = IOR * viewVec - (IOR * vn + sqrt(k)) * normal;
    return refrVec;
}

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
    // use same reflection code with refraction vector
    vec4 tmpRefl = dReflection;
    vec3 reflectionDir = refract2(-viewDir, worldNormal, refractionIndex);
    dReflection = vec4(0);
    addReflection(reflectionDir, gloss);
    dDiffuseLight = mix(dDiffuseLight, dReflection.rgb * albedo, transmission);
    dReflection = tmpRefl;
}
`;

export { refractionCubePS as default };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVmcmFjdGlvbkN1YmUuanMiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uLy4uL3NyYy9zY2VuZS9zaGFkZXItbGliL2NodW5rcy9saXQvZnJhZy9yZWZyYWN0aW9uQ3ViZS5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJleHBvcnQgZGVmYXVsdCAvKiBnbHNsICovYFxudmVjMyByZWZyYWN0Mih2ZWMzIHZpZXdWZWMsIHZlYzMgbm9ybWFsLCBmbG9hdCBJT1IpIHtcbiAgICBmbG9hdCB2biA9IGRvdCh2aWV3VmVjLCBub3JtYWwpO1xuICAgIGZsb2F0IGsgPSAxLjAgLSBJT1IgKiBJT1IgKiAoMS4wIC0gdm4gKiB2bik7XG4gICAgdmVjMyByZWZyVmVjID0gSU9SICogdmlld1ZlYyAtIChJT1IgKiB2biArIHNxcnQoaykpICogbm9ybWFsO1xuICAgIHJldHVybiByZWZyVmVjO1xufVxuXG52b2lkIGFkZFJlZnJhY3Rpb24oXG4gICAgdmVjMyB3b3JsZE5vcm1hbCwgXG4gICAgdmVjMyB2aWV3RGlyLCBcbiAgICBmbG9hdCB0aGlja25lc3MsIFxuICAgIGZsb2F0IGdsb3NzLCBcbiAgICB2ZWMzIHNwZWN1bGFyaXR5LCBcbiAgICB2ZWMzIGFsYmVkbywgXG4gICAgZmxvYXQgdHJhbnNtaXNzaW9uLFxuICAgIGZsb2F0IHJlZnJhY3Rpb25JbmRleFxuI2lmIGRlZmluZWQoTElUX0lSSURFU0NFTkNFKVxuICAgICwgdmVjMyBpcmlkZXNjZW5jZUZyZXNuZWwsXG4gICAgZmxvYXQgaXJpZGVzY2VuY2VJbnRlbnNpdHlcbiNlbmRpZiBcbikge1xuICAgIC8vIHVzZSBzYW1lIHJlZmxlY3Rpb24gY29kZSB3aXRoIHJlZnJhY3Rpb24gdmVjdG9yXG4gICAgdmVjNCB0bXBSZWZsID0gZFJlZmxlY3Rpb247XG4gICAgdmVjMyByZWZsZWN0aW9uRGlyID0gcmVmcmFjdDIoLXZpZXdEaXIsIHdvcmxkTm9ybWFsLCByZWZyYWN0aW9uSW5kZXgpO1xuICAgIGRSZWZsZWN0aW9uID0gdmVjNCgwKTtcbiAgICBhZGRSZWZsZWN0aW9uKHJlZmxlY3Rpb25EaXIsIGdsb3NzKTtcbiAgICBkRGlmZnVzZUxpZ2h0ID0gbWl4KGREaWZmdXNlTGlnaHQsIGRSZWZsZWN0aW9uLnJnYiAqIGFsYmVkbywgdHJhbnNtaXNzaW9uKTtcbiAgICBkUmVmbGVjdGlvbiA9IHRtcFJlZmw7XG59XG5gO1xuIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLHVCQUFlLFVBQVcsQ0FBQTtBQUMxQjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsQ0FBQzs7OzsifQ==
