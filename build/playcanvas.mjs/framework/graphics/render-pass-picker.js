import { BlendState } from '../../platform/graphics/blend-state.js';
import { RenderPass } from '../../platform/graphics/render-pass.js';
import { SHADER_PICK } from '../../scene/constants.js';

const tempMeshInstances = [];
class RenderPassPicker extends RenderPass {
	constructor(device, renderer) {
		super(device);
		this.pickColor = new Float32Array(4);
		this.renderer = renderer;
	}
	setup(camera, scene, layers, mapping) {
		this.camera = camera;
		this.scene = scene;
		this.layers = layers;
		this.mapping = mapping;
	}
	execute() {
		const device = this.device;
		const {
			renderer,
			camera,
			scene,
			layers,
			mapping
		} = this;
		const srcLayers = scene.layers.layerList;
		const subLayerEnabled = scene.layers.subLayerEnabled;
		const isTransparent = scene.layers.subLayerList;
		const pickColorId = device.scope.resolve('uColor');
		const pickColor = this.pickColor;
		for (let i = 0; i < srcLayers.length; i++) {
			const srcLayer = srcLayers[i];
			if (layers && layers.indexOf(srcLayer) < 0) {
				continue;
			}
			if (srcLayer.enabled && subLayerEnabled[i]) {
				const layerCamId = srcLayer.cameras.indexOf(camera);
				if (layerCamId >= 0) {
					if (srcLayer._clearDepthBuffer) {
						renderer.clear(camera.camera, false, true, false);
					}
					const culledInstances = srcLayer.getCulledInstances(camera.camera);
					const meshInstances = isTransparent[i] ? culledInstances.transparent : culledInstances.opaque;
					for (let j = 0; j < meshInstances.length; j++) {
						const meshInstance = meshInstances[j];
						if (meshInstance.pick) {
							tempMeshInstances.push(meshInstance);
							mapping.set(meshInstance.id, meshInstance);
						}
					}
					const lights = [[], [], []];
					renderer.renderForward(camera.camera, tempMeshInstances, lights, SHADER_PICK, meshInstance => {
						const miId = meshInstance.id;
						pickColor[0] = (miId >> 16 & 0xff) / 255;
						pickColor[1] = (miId >> 8 & 0xff) / 255;
						pickColor[2] = (miId & 0xff) / 255;
						pickColor[3] = (miId >> 24 & 0xff) / 255;
						pickColorId.setValue(pickColor);
						device.setBlendState(BlendState.NOBLEND);
					});
					tempMeshInstances.length = 0;
				}
			}
		}
	}
}

export { RenderPassPicker };
