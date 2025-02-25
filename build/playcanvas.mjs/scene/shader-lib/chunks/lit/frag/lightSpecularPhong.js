var lightSpecularPhongPS = `
float calcLightSpecular(float gloss, vec3 reflDir, vec3 lightDirNorm) {
	float specPow = gloss;
	return pow(max(dot(reflDir, -lightDirNorm), 0.0), specPow + 0.0001);
}
float getLightSpecular(vec3 h, vec3 reflDir, vec3 worldNormal, vec3 viewDir, vec3 lightDirNorm, float gloss, mat3 tbn) {
	return calcLightSpecular(gloss, reflDir, lightDirNorm);
}
`;

export { lightSpecularPhongPS as default };
