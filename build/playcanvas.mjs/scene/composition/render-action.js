class RenderAction {
	constructor() {
		this.layerIndex = 0;
		this.layer = null;
		this.cameraIndex = 0;
		this.camera = null;
		this.renderTarget = null;
		this.lightClusters = null;
		this.clearColor = false;
		this.clearDepth = false;
		this.clearStencil = false;
		this.triggerPostprocess = false;
		this.firstCameraUse = false;
		this.lastCameraUse = false;
		this.directionalLights = [];
		this.viewBindGroups = [];
	}
	destroy() {
		this.viewBindGroups.forEach(bg => {
			bg.defaultUniformBuffer.destroy();
			bg.destroy();
		});
		this.viewBindGroups.length = 0;
	}
	get hasDirectionalShadowLights() {
		return this.directionalLights.length > 0;
	}
	isLayerEnabled(layerComposition) {
		const layer = layerComposition.layerList[this.layerIndex];
		return layer.enabled && layerComposition.subLayerEnabled[this.layerIndex];
	}
}

export { RenderAction };
