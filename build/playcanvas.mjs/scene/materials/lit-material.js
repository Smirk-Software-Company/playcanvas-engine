import { ShaderProcessorOptions } from '../../platform/graphics/shader-processor-options.js';
import { SPECULAR_BLINN, SPECOCC_AO, FRESNEL_SCHLICK } from '../constants.js';
import { Material } from './material.js';
import { LitMaterialOptions } from './lit-material-options.js';
import { LitMaterialOptionsBuilder } from './lit-material-options-builder.js';
import { getProgramLibrary } from '../shader-lib/get-program-library.js';
import { lit } from '../shader-lib/programs/lit.js';

const options = new LitMaterialOptions();
class LitMaterial extends Material {
	constructor(...args) {
		super(...args);
		this.usedUvs = [true];
		this.shaderChunk = 'void evaluateFrontend() {}\n';
		this.chunks = null;
		this.useLighting = true;
		this.useFog = true;
		this.useGammaTonemap = true;
		this.useSkybox = true;
		this.shadingModel = SPECULAR_BLINN;
		this.ambientSH = null;
		this.pixelSnap = false;
		this.nineSlicedMode = null;
		this.fastTbn = false;
		this.twoSidedLighting = false;
		this.occludeDirect = false;
		this.occludeSpecular = SPECOCC_AO;
		this.occludeSpecularIntensity = 1;
		this.opacityFadesSpecular = true;
		this.conserveEnergy = true;
		this.ggxSpecular = false;
		this.fresnelModel = FRESNEL_SCHLICK;
		this.dynamicRefraction = false;
		this.hasAo = false;
		this.hasSpecular = false;
		this.hasSpecularityFactor = false;
		this.hasLighting = false;
		this.hasHeights = false;
		this.hasNormals = false;
		this.hasSheen = false;
		this.hasRefraction = false;
		this.hasIrridescence = false;
		this.hasMetalness = false;
		this.hasClearCoat = false;
		this.hasClearCoatNormals = false;
	}
	getShaderVariant(device, scene, objDefs, unused, pass, sortedLights, viewUniformFormat, viewBindGroupFormat, vertexFormat) {
		options.usedUvs = this.usedUvs.slice();
		options.shaderChunk = this.shaderChunk;
		LitMaterialOptionsBuilder.update(options.litOptions, this, scene, objDefs, pass, sortedLights);
		const processingOptions = new ShaderProcessorOptions(viewUniformFormat, viewBindGroupFormat, vertexFormat);
		const library = getProgramLibrary(device);
		library.register('lit', lit);
		const shader = library.getProgram('lit', options, processingOptions, this.userId);
		return shader;
	}
}

export { LitMaterial };
