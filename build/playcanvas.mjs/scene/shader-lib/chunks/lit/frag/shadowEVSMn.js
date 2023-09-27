var shadowEVSMnPS = /* glsl */`
float VSM$(TEXTURE_ACCEPT(tex), vec2 texCoords, float resolution, float Z, float vsmBias, float exponent) {
    float pixelSize = 1.0 / resolution;
    texCoords -= vec2(pixelSize);
    vec3 s00 = texture2D(tex, texCoords).xyz;
    vec3 s10 = texture2D(tex, texCoords + vec2(pixelSize, 0)).xyz;
    vec3 s01 = texture2D(tex, texCoords + vec2(0, pixelSize)).xyz;
    vec3 s11 = texture2D(tex, texCoords + vec2(pixelSize)).xyz;
    vec2 fr = fract(texCoords * resolution);
    vec3 h0 = mix(s00, s10, fr.x);
    vec3 h1 = mix(s01, s11, fr.x);
    vec3 moments = mix(h0, h1, fr.y);
    return calculateEVSM(moments, Z, vsmBias, exponent);
}

float getShadowVSM$(TEXTURE_ACCEPT(shadowMap), vec3 shadowCoord, vec4 shadowParams, float exponent, vec3 lightDir) {
    return VSM$(TEXTURE_PASS(shadowMap), shadowCoord.xy, shadowParams.x, shadowCoord.z, shadowParams.y, exponent);
}

float getShadowSpotVSM$(TEXTURE_ACCEPT(shadowMap), vec3 shadowCoord, vec4 shadowParams, float exponent, vec3 lightDir) {
    return VSM$(TEXTURE_PASS(shadowMap), shadowCoord.xy, shadowParams.x, length(lightDir) * shadowParams.w + shadowParams.z, shadowParams.y, exponent);
}
`;

export { shadowEVSMnPS as default };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2hhZG93RVZTTW4uanMiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uLy4uL3NyYy9zY2VuZS9zaGFkZXItbGliL2NodW5rcy9saXQvZnJhZy9zaGFkb3dFVlNNbi5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJleHBvcnQgZGVmYXVsdCAvKiBnbHNsICovYFxuZmxvYXQgVlNNJChURVhUVVJFX0FDQ0VQVCh0ZXgpLCB2ZWMyIHRleENvb3JkcywgZmxvYXQgcmVzb2x1dGlvbiwgZmxvYXQgWiwgZmxvYXQgdnNtQmlhcywgZmxvYXQgZXhwb25lbnQpIHtcbiAgICBmbG9hdCBwaXhlbFNpemUgPSAxLjAgLyByZXNvbHV0aW9uO1xuICAgIHRleENvb3JkcyAtPSB2ZWMyKHBpeGVsU2l6ZSk7XG4gICAgdmVjMyBzMDAgPSB0ZXh0dXJlMkQodGV4LCB0ZXhDb29yZHMpLnh5ejtcbiAgICB2ZWMzIHMxMCA9IHRleHR1cmUyRCh0ZXgsIHRleENvb3JkcyArIHZlYzIocGl4ZWxTaXplLCAwKSkueHl6O1xuICAgIHZlYzMgczAxID0gdGV4dHVyZTJEKHRleCwgdGV4Q29vcmRzICsgdmVjMigwLCBwaXhlbFNpemUpKS54eXo7XG4gICAgdmVjMyBzMTEgPSB0ZXh0dXJlMkQodGV4LCB0ZXhDb29yZHMgKyB2ZWMyKHBpeGVsU2l6ZSkpLnh5ejtcbiAgICB2ZWMyIGZyID0gZnJhY3QodGV4Q29vcmRzICogcmVzb2x1dGlvbik7XG4gICAgdmVjMyBoMCA9IG1peChzMDAsIHMxMCwgZnIueCk7XG4gICAgdmVjMyBoMSA9IG1peChzMDEsIHMxMSwgZnIueCk7XG4gICAgdmVjMyBtb21lbnRzID0gbWl4KGgwLCBoMSwgZnIueSk7XG4gICAgcmV0dXJuIGNhbGN1bGF0ZUVWU00obW9tZW50cywgWiwgdnNtQmlhcywgZXhwb25lbnQpO1xufVxuXG5mbG9hdCBnZXRTaGFkb3dWU00kKFRFWFRVUkVfQUNDRVBUKHNoYWRvd01hcCksIHZlYzMgc2hhZG93Q29vcmQsIHZlYzQgc2hhZG93UGFyYW1zLCBmbG9hdCBleHBvbmVudCwgdmVjMyBsaWdodERpcikge1xuICAgIHJldHVybiBWU00kKFRFWFRVUkVfUEFTUyhzaGFkb3dNYXApLCBzaGFkb3dDb29yZC54eSwgc2hhZG93UGFyYW1zLngsIHNoYWRvd0Nvb3JkLnosIHNoYWRvd1BhcmFtcy55LCBleHBvbmVudCk7XG59XG5cbmZsb2F0IGdldFNoYWRvd1Nwb3RWU00kKFRFWFRVUkVfQUNDRVBUKHNoYWRvd01hcCksIHZlYzMgc2hhZG93Q29vcmQsIHZlYzQgc2hhZG93UGFyYW1zLCBmbG9hdCBleHBvbmVudCwgdmVjMyBsaWdodERpcikge1xuICAgIHJldHVybiBWU00kKFRFWFRVUkVfUEFTUyhzaGFkb3dNYXApLCBzaGFkb3dDb29yZC54eSwgc2hhZG93UGFyYW1zLngsIGxlbmd0aChsaWdodERpcikgKiBzaGFkb3dQYXJhbXMudyArIHNoYWRvd1BhcmFtcy56LCBzaGFkb3dQYXJhbXMueSwgZXhwb25lbnQpO1xufVxuYDtcbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxvQkFBZSxVQUFXLENBQUE7QUFDMUI7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsQ0FBQzs7OzsifQ==
