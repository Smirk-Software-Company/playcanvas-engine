import { EventHandler } from '../../core/event-handler.js';
import { Vec3 } from '../../core/math/vec3.js';
import { Quat } from '../../core/math/quat.js';

class XrAnchor extends EventHandler {
	constructor(anchors, xrAnchor) {
		super();
		this._position = new Vec3();
		this._rotation = new Quat();
		this._anchors = anchors;
		this._xrAnchor = xrAnchor;
	}
	destroy() {
		if (!this._xrAnchor) return;
		this._anchors._index.delete(this._xrAnchor);
		const ind = this._anchors._list.indexOf(this);
		if (ind !== -1) this._anchors._list.splice(ind, 1);
		this._xrAnchor.delete();
		this._xrAnchor = null;
		this.fire('destroy');
		this._anchors.fire('destroy', this);
	}
	update(frame) {
		if (!this._xrAnchor) return;
		const pose = frame.getPose(this._xrAnchor.anchorSpace, this._anchors.manager._referenceSpace);
		if (pose) {
			if (this._position.equals(pose.transform.position) && this._rotation.equals(pose.transform.orientation)) return;
			this._position.copy(pose.transform.position);
			this._rotation.copy(pose.transform.orientation);
			this.fire('change');
		}
	}
	getPosition() {
		return this._position;
	}
	getRotation() {
		return this._rotation;
	}
}

export { XrAnchor };
