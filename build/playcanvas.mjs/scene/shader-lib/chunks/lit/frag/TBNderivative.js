var TBNderivativePS = `
uniform float tbnBasis;
void getTBN(vec3 tangent, vec3 binormal, vec3 normal) {
	vec2 uv = $UV;
	vec3 dp1 = dFdx( vPositionW );
	vec3 dp2 = dFdy( vPositionW );
	vec2 duv1 = dFdx( uv );
	vec2 duv2 = dFdy( uv );
	vec3 dp2perp = cross( dp2, normal );
	vec3 dp1perp = cross( normal, dp1 );
	vec3 T = dp2perp * duv1.x + dp1perp * duv2.x;
	vec3 B = dp2perp * duv1.y + dp1perp * duv2.y;
	float denom = max( dot(T,T), dot(B,B) );
	float invmax = (denom == 0.0) ? 0.0 : tbnBasis / sqrt( denom );
	dTBN = mat3(T * invmax, -B * invmax, normal );
}
`;

export { TBNderivativePS as default };
