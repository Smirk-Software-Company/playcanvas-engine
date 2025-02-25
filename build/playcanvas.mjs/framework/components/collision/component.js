import { Quat } from '../../../core/math/quat.js';
import { Vec3 } from '../../../core/math/vec3.js';
import { Asset } from '../../asset/asset.js';
import { Component } from '../component.js';

const _vec3 = new Vec3();
const _quat = new Quat();
class CollisionComponent extends Component {
	constructor(system, entity) {
		super(system, entity);
		this._compoundParent = null;
		this._hasOffset = false;
		this.entity.on('insert', this._onInsert, this);
		this.on('set_type', this.onSetType, this);
		this.on('set_halfExtents', this.onSetHalfExtents, this);
		this.on('set_linearOffset', this.onSetOffset, this);
		this.on('set_angularOffset', this.onSetOffset, this);
		this.on('set_radius', this.onSetRadius, this);
		this.on('set_height', this.onSetHeight, this);
		this.on('set_axis', this.onSetAxis, this);
		this.on('set_asset', this.onSetAsset, this);
		this.on('set_renderAsset', this.onSetRenderAsset, this);
		this.on('set_model', this.onSetModel, this);
		this.on('set_render', this.onSetRender, this);
	}
	onSetType(name, oldValue, newValue) {
		if (oldValue !== newValue) {
			this.system.changeType(this, oldValue, newValue);
		}
	}
	onSetHalfExtents(name, oldValue, newValue) {
		const t = this.data.type;
		if (this.data.initialized && t === 'box') {
			this.system.recreatePhysicalShapes(this);
		}
	}
	onSetOffset(name, oldValue, newValue) {
		this._hasOffset = !this.data.linearOffset.equals(Vec3.ZERO) || !this.data.angularOffset.equals(Quat.IDENTITY);
		if (this.data.initialized) {
			this.system.recreatePhysicalShapes(this);
		}
	}
	onSetRadius(name, oldValue, newValue) {
		const t = this.data.type;
		if (this.data.initialized && (t === 'sphere' || t === 'capsule' || t === 'cylinder' || t === 'cone')) {
			this.system.recreatePhysicalShapes(this);
		}
	}
	onSetHeight(name, oldValue, newValue) {
		const t = this.data.type;
		if (this.data.initialized && (t === 'capsule' || t === 'cylinder' || t === 'cone')) {
			this.system.recreatePhysicalShapes(this);
		}
	}
	onSetAxis(name, oldValue, newValue) {
		const t = this.data.type;
		if (this.data.initialized && (t === 'capsule' || t === 'cylinder' || t === 'cone')) {
			this.system.recreatePhysicalShapes(this);
		}
	}
	onSetAsset(name, oldValue, newValue) {
		const assets = this.system.app.assets;
		if (oldValue) {
			const asset = assets.get(oldValue);
			if (asset) {
				asset.off('remove', this.onAssetRemoved, this);
			}
		}
		if (newValue) {
			if (newValue instanceof Asset) {
				this.data.asset = newValue.id;
			}
			const asset = assets.get(this.data.asset);
			if (asset) {
				asset.off('remove', this.onAssetRemoved, this);
				asset.on('remove', this.onAssetRemoved, this);
			}
		}
		if (this.data.initialized && this.data.type === 'mesh') {
			if (!newValue) {
				this.data.model = null;
			}
			this.system.recreatePhysicalShapes(this);
		}
	}
	onSetRenderAsset(name, oldValue, newValue) {
		const assets = this.system.app.assets;
		if (oldValue) {
			const asset = assets.get(oldValue);
			if (asset) {
				asset.off('remove', this.onRenderAssetRemoved, this);
			}
		}
		if (newValue) {
			if (newValue instanceof Asset) {
				this.data.renderAsset = newValue.id;
			}
			const asset = assets.get(this.data.renderAsset);
			if (asset) {
				asset.off('remove', this.onRenderAssetRemoved, this);
				asset.on('remove', this.onRenderAssetRemoved, this);
			}
		}
		if (this.data.initialized && this.data.type === 'mesh') {
			if (!newValue) {
				this.data.render = null;
			}
			this.system.recreatePhysicalShapes(this);
		}
	}
	onSetModel(name, oldValue, newValue) {
		if (this.data.initialized && this.data.type === 'mesh') {
			this.system.implementations.mesh.doRecreatePhysicalShape(this);
		}
	}
	onSetRender(name, oldValue, newValue) {
		this.onSetModel(name, oldValue, newValue);
	}
	onAssetRemoved(asset) {
		asset.off('remove', this.onAssetRemoved, this);
		if (this.data.asset === asset.id) {
			this.asset = null;
		}
	}
	onRenderAssetRemoved(asset) {
		asset.off('remove', this.onRenderAssetRemoved, this);
		if (this.data.renderAsset === asset.id) {
			this.renderAsset = null;
		}
	}
	_getCompoundChildShapeIndex(shape) {
		const compound = this.data.shape;
		const shapes = compound.getNumChildShapes();
		for (let i = 0; i < shapes; i++) {
			const childShape = compound.getChildShape(i);
			if (childShape.ptr === shape.ptr) {
				return i;
			}
		}
		return null;
	}
	_onInsert(parent) {
		if (typeof Ammo === 'undefined') return;
		if (this._compoundParent) {
			this.system.recreatePhysicalShapes(this);
		} else if (!this.entity.rigidbody) {
			let ancestor = this.entity.parent;
			while (ancestor) {
				if (ancestor.collision && ancestor.collision.type === 'compound') {
					if (ancestor.collision.shape.getNumChildShapes() === 0) {
						this.system.recreatePhysicalShapes(ancestor.collision);
					} else {
						this.system.recreatePhysicalShapes(this);
					}
					break;
				}
				ancestor = ancestor.parent;
			}
		}
	}
	_updateCompound() {
		const entity = this.entity;
		if (entity._dirtyWorld) {
			let dirty = entity._dirtyLocal;
			let parent = entity;
			while (parent && !dirty) {
				if (parent.collision && parent.collision === this._compoundParent) break;
				if (parent._dirtyLocal) dirty = true;
				parent = parent.parent;
			}
			if (dirty) {
				entity.forEach(this.system.implementations.compound._updateEachDescendantTransform, entity);
				const bodyComponent = this._compoundParent.entity.rigidbody;
				if (bodyComponent) bodyComponent.activate();
			}
		}
	}
	getShapePosition() {
		const pos = this.entity.getPosition();
		if (this._hasOffset) {
			const rot = this.entity.getRotation();
			const lo = this.data.linearOffset;
			_quat.copy(rot).transformVector(lo, _vec3);
			return _vec3.add(pos);
		}
		return pos;
	}
	getShapeRotation() {
		const rot = this.entity.getRotation();
		if (this._hasOffset) {
			return _quat.copy(rot).mul(this.data.angularOffset);
		}
		return rot;
	}
	onEnable() {
		if (this.data.type === 'mesh' && (this.data.asset || this.data.renderAsset) && this.data.initialized) {
			const asset = this.system.app.assets.get(this.data.asset || this.data.renderAsset);
			if (asset && (!asset.resource || !this.data.shape)) {
				this.system.recreatePhysicalShapes(this);
				return;
			}
		}
		if (this.entity.rigidbody) {
			if (this.entity.rigidbody.enabled) {
				this.entity.rigidbody.enableSimulation();
			}
		} else if (this._compoundParent && this !== this._compoundParent) {
			if (this._compoundParent.shape.getNumChildShapes() === 0) {
				this.system.recreatePhysicalShapes(this._compoundParent);
			} else {
				const transform = this.system._getNodeTransform(this.entity, this._compoundParent.entity);
				this._compoundParent.shape.addChildShape(transform, this.data.shape);
				Ammo.destroy(transform);
				if (this._compoundParent.entity.rigidbody) this._compoundParent.entity.rigidbody.activate();
			}
		} else if (this.entity.trigger) {
			this.entity.trigger.enable();
		}
	}
	onDisable() {
		if (this.entity.rigidbody) {
			this.entity.rigidbody.disableSimulation();
		} else if (this._compoundParent && this !== this._compoundParent) {
			if (!this._compoundParent.entity._destroying) {
				this.system._removeCompoundChild(this._compoundParent, this.data.shape);
				if (this._compoundParent.entity.rigidbody) this._compoundParent.entity.rigidbody.activate();
			}
		} else if (this.entity.trigger) {
			this.entity.trigger.disable();
		}
	}
	onBeforeRemove() {
		if (this.asset) {
			this.asset = null;
		}
		if (this.renderAsset) {
			this.renderAsset = null;
		}
		this.entity.off('insert', this._onInsert, this);
		this.off();
	}
}

export { CollisionComponent };
