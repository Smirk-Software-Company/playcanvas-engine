import '../../core/tracing.js';
import { EventHandler } from '../../core/event-handler.js';
import { sortPriority } from '../../core/sort.js';
import { LAYERID_DEPTH } from '../constants.js';
import { RenderAction } from './render-action.js';

class LayerComposition extends EventHandler {
	constructor(name = 'Untitled') {
		super();
		this.layerList = [];
		this.layerIdMap = new Map();
		this.layerNameMap = new Map();
		this.subLayerList = [];
		this.subLayerEnabled = [];
		this.cameras = [];
		this._renderActions = [];
		this.name = name;
		this._opaqueOrder = {};
		this._transparentOrder = {};
		this._dirtyCameras = false;
	}
	destroy() {
		this._renderActions.forEach(ra => ra.destroy());
		this._renderActions = null;
	}
	_update() {
		const len = this.layerList.length;
		if (!this._dirtyCameras) {
			for (let i = 0; i < len; i++) {
				if (this.layerList[i]._dirtyCameras) {
					this._dirtyCameras = true;
					break;
				}
			}
		}
		if (this._dirtyCameras) {
			this._dirtyCameras = false;
			this.cameras.length = 0;
			for (let i = 0; i < len; i++) {
				const layer = this.layerList[i];
				layer._dirtyCameras = false;
				for (let j = 0; j < layer.cameras.length; j++) {
					const camera = layer.cameras[j];
					const index = this.cameras.indexOf(camera);
					if (index < 0) {
						this.cameras.push(camera);
					}
				}
			}
			if (this.cameras.length > 1) {
				sortPriority(this.cameras);
			}
			let renderActionCount = 0;
			for (let i = 0; i < this.cameras.length; i++) {
				const camera = this.cameras[i];
				let cameraFirstRenderAction = true;
				const cameraFirstRenderActionIndex = renderActionCount;
				let lastRenderAction = null;
				let postProcessMarked = false;
				for (let j = 0; j < len; j++) {
					const layer = this.layerList[j];
					const isLayerEnabled = this.subLayerEnabled[j];
					if (layer && isLayerEnabled) {
						if (layer.cameras.length > 0) {
							if (camera.layers.indexOf(layer.id) >= 0) {
								if (!postProcessMarked && layer.id === camera.disablePostEffectsLayer) {
									postProcessMarked = true;
									if (lastRenderAction) {
										lastRenderAction.triggerPostprocess = true;
									}
								}
								const cameraIndex = layer.cameras.indexOf(camera);
								if (cameraIndex >= 0) {
									lastRenderAction = this.addRenderAction(this._renderActions, renderActionCount, layer, j, cameraIndex, cameraFirstRenderAction, postProcessMarked);
									renderActionCount++;
									cameraFirstRenderAction = false;
								}
							}
						}
					}
				}
				if (cameraFirstRenderActionIndex < renderActionCount) {
					lastRenderAction.lastCameraUse = true;
				}
				if (!postProcessMarked && lastRenderAction) {
					lastRenderAction.triggerPostprocess = true;
				}
				if (camera.renderTarget && camera.postEffectsEnabled) {
					this.propagateRenderTarget(cameraFirstRenderActionIndex - 1, camera);
				}
			}
			for (let i = renderActionCount; i < this._renderActions.length; i++) {
				this._renderActions[i].destroy();
			}
			this._renderActions.length = renderActionCount;
			this._logRenderActions();
		}
	}
	addRenderAction(renderActions, renderActionIndex, layer, layerIndex, cameraIndex, cameraFirstRenderAction, postProcessMarked) {
		let renderAction = renderActions[renderActionIndex];
		if (!renderAction) {
			renderAction = renderActions[renderActionIndex] = new RenderAction();
		}
		let rt = layer.renderTarget;
		const camera = layer.cameras[cameraIndex];
		if (camera && camera.renderTarget) {
			if (layer.id !== LAYERID_DEPTH) {
				rt = camera.renderTarget;
			}
		}
		let used = false;
		for (let i = renderActionIndex - 1; i >= 0; i--) {
			if (renderActions[i].camera === camera && renderActions[i].renderTarget === rt) {
				used = true;
				break;
			}
		}
		const needsClear = cameraFirstRenderAction || !used;
		let clearColor = needsClear ? camera.clearColorBuffer : false;
		let clearDepth = needsClear ? camera.clearDepthBuffer : false;
		let clearStencil = needsClear ? camera.clearStencilBuffer : false;
		clearColor || (clearColor = layer.clearColorBuffer);
		clearDepth || (clearDepth = layer.clearDepthBuffer);
		clearStencil || (clearStencil = layer.clearStencilBuffer);
		if (postProcessMarked && camera.postEffectsEnabled) {
			rt = null;
		}
		renderAction.triggerPostprocess = false;
		renderAction.layerIndex = layerIndex;
		renderAction.layer = layer;
		renderAction.cameraIndex = cameraIndex;
		renderAction.camera = camera;
		renderAction.renderTarget = rt;
		renderAction.clearColor = clearColor;
		renderAction.clearDepth = clearDepth;
		renderAction.clearStencil = clearStencil;
		renderAction.firstCameraUse = cameraFirstRenderAction;
		renderAction.lastCameraUse = false;
		return renderAction;
	}
	propagateRenderTarget(startIndex, fromCamera) {
		for (let a = startIndex; a >= 0; a--) {
			const ra = this._renderActions[a];
			const layer = this.layerList[ra.layerIndex];
			if (ra.renderTarget && layer.id !== LAYERID_DEPTH) {
				break;
			}
			if (layer.id === LAYERID_DEPTH) {
				continue;
			}
			const thisCamera = ra == null ? void 0 : ra.camera.camera;
			if (thisCamera) {
				if (!fromCamera.camera.rect.equals(thisCamera.rect) || !fromCamera.camera.scissorRect.equals(thisCamera.scissorRect)) {
					break;
				}
			}
			ra.renderTarget = fromCamera.renderTarget;
		}
	}
	_logRenderActions() {}
	_isLayerAdded(layer) {
		const found = this.layerIdMap.get(layer.id) === layer;
		return found;
	}
	_isSublayerAdded(layer, transparent) {
		for (let i = 0; i < this.layerList.length; i++) {
			if (this.layerList[i] === layer && this.subLayerList[i] === transparent) {
				return true;
			}
		}
		return false;
	}
	push(layer) {
		if (this._isLayerAdded(layer)) return;
		this.layerList.push(layer);
		this.layerList.push(layer);
		this._opaqueOrder[layer.id] = this.subLayerList.push(false) - 1;
		this._transparentOrder[layer.id] = this.subLayerList.push(true) - 1;
		this.subLayerEnabled.push(true);
		this.subLayerEnabled.push(true);
		this._updateLayerMaps();
		this._dirtyCameras = true;
		this.fire('add', layer);
	}
	insert(layer, index) {
		if (this._isLayerAdded(layer)) return;
		this.layerList.splice(index, 0, layer, layer);
		this.subLayerList.splice(index, 0, false, true);
		const count = this.layerList.length;
		this._updateOpaqueOrder(index, count - 1);
		this._updateTransparentOrder(index, count - 1);
		this.subLayerEnabled.splice(index, 0, true, true);
		this._updateLayerMaps();
		this._dirtyCameras = true;
		this.fire('add', layer);
	}
	remove(layer) {
		let id = this.layerList.indexOf(layer);
		delete this._opaqueOrder[id];
		delete this._transparentOrder[id];
		while (id >= 0) {
			this.layerList.splice(id, 1);
			this.subLayerList.splice(id, 1);
			this.subLayerEnabled.splice(id, 1);
			id = this.layerList.indexOf(layer);
			this._dirtyCameras = true;
			this.fire('remove', layer);
		}
		const count = this.layerList.length;
		this._updateOpaqueOrder(0, count - 1);
		this._updateTransparentOrder(0, count - 1);
		this._updateLayerMaps();
	}
	pushOpaque(layer) {
		if (this._isSublayerAdded(layer, false)) return;
		this.layerList.push(layer);
		this._opaqueOrder[layer.id] = this.subLayerList.push(false) - 1;
		this.subLayerEnabled.push(true);
		this._updateLayerMaps();
		this._dirtyCameras = true;
		this.fire('add', layer);
	}
	insertOpaque(layer, index) {
		if (this._isSublayerAdded(layer, false)) return;
		this.layerList.splice(index, 0, layer);
		this.subLayerList.splice(index, 0, false);
		const count = this.subLayerList.length;
		this._updateOpaqueOrder(index, count - 1);
		this.subLayerEnabled.splice(index, 0, true);
		this._updateLayerMaps();
		this._dirtyCameras = true;
		this.fire('add', layer);
	}
	removeOpaque(layer) {
		for (let i = 0, len = this.layerList.length; i < len; i++) {
			if (this.layerList[i] === layer && !this.subLayerList[i]) {
				this.layerList.splice(i, 1);
				this.subLayerList.splice(i, 1);
				len--;
				this._updateOpaqueOrder(i, len - 1);
				this.subLayerEnabled.splice(i, 1);
				this._dirtyCameras = true;
				if (this.layerList.indexOf(layer) < 0) {
					this.fire('remove', layer);
				}
				break;
			}
		}
		this._updateLayerMaps();
	}
	pushTransparent(layer) {
		if (this._isSublayerAdded(layer, true)) return;
		this.layerList.push(layer);
		this._transparentOrder[layer.id] = this.subLayerList.push(true) - 1;
		this.subLayerEnabled.push(true);
		this._updateLayerMaps();
		this._dirtyCameras = true;
		this.fire('add', layer);
	}
	insertTransparent(layer, index) {
		if (this._isSublayerAdded(layer, true)) return;
		this.layerList.splice(index, 0, layer);
		this.subLayerList.splice(index, 0, true);
		const count = this.subLayerList.length;
		this._updateTransparentOrder(index, count - 1);
		this.subLayerEnabled.splice(index, 0, true);
		this._updateLayerMaps();
		this._dirtyCameras = true;
		this.fire('add', layer);
	}
	removeTransparent(layer) {
		for (let i = 0, len = this.layerList.length; i < len; i++) {
			if (this.layerList[i] === layer && this.subLayerList[i]) {
				this.layerList.splice(i, 1);
				this.subLayerList.splice(i, 1);
				len--;
				this._updateTransparentOrder(i, len - 1);
				this.subLayerEnabled.splice(i, 1);
				this._dirtyCameras = true;
				if (this.layerList.indexOf(layer) < 0) {
					this.fire('remove', layer);
				}
				break;
			}
		}
		this._updateLayerMaps();
	}
	_getSublayerIndex(layer, transparent) {
		let id = this.layerList.indexOf(layer);
		if (id < 0) return -1;
		if (this.subLayerList[id] !== transparent) {
			id = this.layerList.indexOf(layer, id + 1);
			if (id < 0) return -1;
			if (this.subLayerList[id] !== transparent) {
				return -1;
			}
		}
		return id;
	}
	getOpaqueIndex(layer) {
		return this._getSublayerIndex(layer, false);
	}
	getTransparentIndex(layer) {
		return this._getSublayerIndex(layer, true);
	}
	_updateLayerMaps() {
		this.layerIdMap.clear();
		this.layerNameMap.clear();
		for (let i = 0; i < this.layerList.length; i++) {
			const layer = this.layerList[i];
			this.layerIdMap.set(layer.id, layer);
			this.layerNameMap.set(layer.name, layer);
		}
	}
	getLayerById(id) {
		var _this$layerIdMap$get;
		return (_this$layerIdMap$get = this.layerIdMap.get(id)) != null ? _this$layerIdMap$get : null;
	}
	getLayerByName(name) {
		var _this$layerNameMap$ge;
		return (_this$layerNameMap$ge = this.layerNameMap.get(name)) != null ? _this$layerNameMap$ge : null;
	}
	_updateOpaqueOrder(startIndex, endIndex) {
		for (let i = startIndex; i <= endIndex; i++) {
			if (this.subLayerList[i] === false) {
				this._opaqueOrder[this.layerList[i].id] = i;
			}
		}
	}
	_updateTransparentOrder(startIndex, endIndex) {
		for (let i = startIndex; i <= endIndex; i++) {
			if (this.subLayerList[i] === true) {
				this._transparentOrder[this.layerList[i].id] = i;
			}
		}
	}
	_sortLayersDescending(layersA, layersB, order) {
		let topLayerA = -1;
		let topLayerB = -1;
		for (let i = 0, len = layersA.length; i < len; i++) {
			const id = layersA[i];
			if (order.hasOwnProperty(id)) {
				topLayerA = Math.max(topLayerA, order[id]);
			}
		}
		for (let i = 0, len = layersB.length; i < len; i++) {
			const id = layersB[i];
			if (order.hasOwnProperty(id)) {
				topLayerB = Math.max(topLayerB, order[id]);
			}
		}
		if (topLayerA === -1 && topLayerB !== -1) {
			return 1;
		} else if (topLayerB === -1 && topLayerA !== -1) {
			return -1;
		}
		return topLayerB - topLayerA;
	}
	sortTransparentLayers(layersA, layersB) {
		return this._sortLayersDescending(layersA, layersB, this._transparentOrder);
	}
	sortOpaqueLayers(layersA, layersB) {
		return this._sortLayersDescending(layersA, layersB, this._opaqueOrder);
	}
}

export { LayerComposition };
