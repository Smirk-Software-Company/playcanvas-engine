var bilateralDeNoisePS = `
float normpdf3(in vec3 v, in float sigma) {
	return 0.39894 * exp(-0.5 * dot(v, v) / (sigma * sigma)) / sigma;
}
vec3 decodeRGBM(vec4 rgbm) {
	vec3 color = (8.0 * rgbm.a) * rgbm.rgb;
	return color * color;
}
float saturate(float x) {
	return clamp(x, 0.0, 1.0);
}
vec4 encodeRGBM(vec3 color) {
	vec4 encoded;
	encoded.rgb = pow(color.rgb, vec3(0.5));
	encoded.rgb *= 1.0 / 8.0;
	encoded.a = saturate( max( max( encoded.r, encoded.g ), max( encoded.b, 1.0 / 255.0 ) ) );
	encoded.a = ceil(encoded.a * 255.0) / 255.0;
	encoded.rgb /= encoded.a;
	return encoded;
}
#define MSIZE 15
varying vec2 vUv0;
uniform sampler2D source;
uniform vec2 pixelOffset;
uniform vec2 sigmas;
uniform float bZnorm;
uniform float kernel[MSIZE];
void main(void) {
	
	vec4 pixelRgbm = texture2D(source, vUv0);
	if (pixelRgbm.a <= 0.0) {
		gl_FragColor = pixelRgbm;
		return ;
	}
	float sigma = sigmas.x;
	float bSigma = sigmas.y;
	vec3 pixelHdr = decodeRGBM(pixelRgbm);
	vec3 accumulatedHdr = vec3(0.0);
	float accumulatedFactor = 0.0;
	const int kSize = (MSIZE-1)/2;
	for (int i = -kSize; i <= kSize; ++i) {
		for (int j = -kSize; j <= kSize; ++j) {
			
			vec2 coord = vUv0 + vec2(float(i), float(j)) * pixelOffset;
			vec4 rgbm = texture2D(source, coord);
			if (rgbm.a > 0.0) {
				vec3 hdr = decodeRGBM(rgbm);
				float factor = kernel[kSize + j] * kernel[kSize + i];
				factor *= normpdf3(hdr - pixelHdr, bSigma) * bZnorm;
				accumulatedHdr += factor * hdr;
				accumulatedFactor += factor;
			}
		}
	}
	gl_FragColor = encodeRGBM(accumulatedHdr / accumulatedFactor);
}
`;

export { bilateralDeNoisePS as default };
