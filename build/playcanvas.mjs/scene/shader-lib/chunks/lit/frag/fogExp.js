var fogExpPS = `
uniform vec3 fog_color;
uniform float fog_density;
float dBlendModeFogFactor = 1.0;
vec3 addFog(vec3 color) {
	float depth = gl_FragCoord.z / gl_FragCoord.w;
	float fogFactor = exp(-depth * fog_density);
	fogFactor = clamp(fogFactor, 0.0, 1.0);
	return mix(fog_color * dBlendModeFogFactor, color, fogFactor);
}
`;

export { fogExpPS as default };
