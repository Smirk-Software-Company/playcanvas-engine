var shadowVSM8PS = /* glsl */`
float calculateVSM8(vec3 moments, float Z, float vsmBias) {
    float VSMBias = vsmBias;//0.01 * 0.25;
    float depthScale = VSMBias * Z;
    float minVariance1 = depthScale * depthScale;
    return chebyshevUpperBound(moments.xy, Z, minVariance1, 0.1);
}

float decodeFloatRG(vec2 rg) {
    return rg.y*(1.0/255.0) + rg.x;
}

float VSM8(TEXTURE_ACCEPT(tex), vec2 texCoords, float resolution, float Z, float vsmBias, float exponent) {
    vec4 c = texture2D(tex, texCoords);
    vec3 moments = vec3(decodeFloatRG(c.xy), decodeFloatRG(c.zw), 0.0);
    return calculateVSM8(moments, Z, vsmBias);
}

float getShadowVSM8(TEXTURE_ACCEPT(shadowMap), vec3 shadowCoord, vec4 shadowParams, float exponent, vec3 lightDir) {
    return VSM8(TEXTURE_PASS(shadowMap), shadowCoord.xy, shadowParams.x, shadowCoord.z, shadowParams.y, 0.0);
}

float getShadowSpotVSM8(TEXTURE_ACCEPT(shadowMap), vec3 shadowCoord, vec4 shadowParams, float exponent, vec3 lightDir) {
    return VSM8(TEXTURE_PASS(shadowMap), shadowCoord.xy, shadowParams.x, length(lightDir) * shadowParams.w + shadowParams.z, shadowParams.y, 0.0);
}
`;

export { shadowVSM8PS as default };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2hhZG93VlNNOC5qcyIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vLi4vLi4vc3JjL3NjZW5lL3NoYWRlci1saWIvY2h1bmtzL2xpdC9mcmFnL3NoYWRvd1ZTTTguanMiXSwic291cmNlc0NvbnRlbnQiOlsiZXhwb3J0IGRlZmF1bHQgLyogZ2xzbCAqL2BcbmZsb2F0IGNhbGN1bGF0ZVZTTTgodmVjMyBtb21lbnRzLCBmbG9hdCBaLCBmbG9hdCB2c21CaWFzKSB7XG4gICAgZmxvYXQgVlNNQmlhcyA9IHZzbUJpYXM7Ly8wLjAxICogMC4yNTtcbiAgICBmbG9hdCBkZXB0aFNjYWxlID0gVlNNQmlhcyAqIFo7XG4gICAgZmxvYXQgbWluVmFyaWFuY2UxID0gZGVwdGhTY2FsZSAqIGRlcHRoU2NhbGU7XG4gICAgcmV0dXJuIGNoZWJ5c2hldlVwcGVyQm91bmQobW9tZW50cy54eSwgWiwgbWluVmFyaWFuY2UxLCAwLjEpO1xufVxuXG5mbG9hdCBkZWNvZGVGbG9hdFJHKHZlYzIgcmcpIHtcbiAgICByZXR1cm4gcmcueSooMS4wLzI1NS4wKSArIHJnLng7XG59XG5cbmZsb2F0IFZTTTgoVEVYVFVSRV9BQ0NFUFQodGV4KSwgdmVjMiB0ZXhDb29yZHMsIGZsb2F0IHJlc29sdXRpb24sIGZsb2F0IFosIGZsb2F0IHZzbUJpYXMsIGZsb2F0IGV4cG9uZW50KSB7XG4gICAgdmVjNCBjID0gdGV4dHVyZTJEKHRleCwgdGV4Q29vcmRzKTtcbiAgICB2ZWMzIG1vbWVudHMgPSB2ZWMzKGRlY29kZUZsb2F0UkcoYy54eSksIGRlY29kZUZsb2F0UkcoYy56dyksIDAuMCk7XG4gICAgcmV0dXJuIGNhbGN1bGF0ZVZTTTgobW9tZW50cywgWiwgdnNtQmlhcyk7XG59XG5cbmZsb2F0IGdldFNoYWRvd1ZTTTgoVEVYVFVSRV9BQ0NFUFQoc2hhZG93TWFwKSwgdmVjMyBzaGFkb3dDb29yZCwgdmVjNCBzaGFkb3dQYXJhbXMsIGZsb2F0IGV4cG9uZW50LCB2ZWMzIGxpZ2h0RGlyKSB7XG4gICAgcmV0dXJuIFZTTTgoVEVYVFVSRV9QQVNTKHNoYWRvd01hcCksIHNoYWRvd0Nvb3JkLnh5LCBzaGFkb3dQYXJhbXMueCwgc2hhZG93Q29vcmQueiwgc2hhZG93UGFyYW1zLnksIDAuMCk7XG59XG5cbmZsb2F0IGdldFNoYWRvd1Nwb3RWU004KFRFWFRVUkVfQUNDRVBUKHNoYWRvd01hcCksIHZlYzMgc2hhZG93Q29vcmQsIHZlYzQgc2hhZG93UGFyYW1zLCBmbG9hdCBleHBvbmVudCwgdmVjMyBsaWdodERpcikge1xuICAgIHJldHVybiBWU004KFRFWFRVUkVfUEFTUyhzaGFkb3dNYXApLCBzaGFkb3dDb29yZC54eSwgc2hhZG93UGFyYW1zLngsIGxlbmd0aChsaWdodERpcikgKiBzaGFkb3dQYXJhbXMudyArIHNoYWRvd1BhcmFtcy56LCBzaGFkb3dQYXJhbXMueSwgMC4wKTtcbn1cbmA7XG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsbUJBQWUsVUFBVyxDQUFBO0FBQzFCO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLENBQUM7Ozs7In0=
