import { EventHandler } from '../../core/event-handler.js';
import { platform } from '../../core/platform.js';
import { XrAnchor } from './xr-anchor.js';

class XrAnchors extends EventHandler {
	constructor(manager) {
		super();
		this._supported = platform.browser && !!window.XRAnchor;
		this._creationQueue = [];
		this._index = new Map();
		this._list = [];
		this._callbacksAnchors = new Map();
		this.manager = manager;
		if (this._supported) {
			this.manager.on('end', this._onSessionEnd, this);
		}
	}
	_onSessionEnd() {
		for (let i = 0; i < this._creationQueue.length; i++) {
			if (!this._creationQueue[i].callback) continue;
			this._creationQueue[i].callback(new Error('session ended'), null);
		}
		this._creationQueue.length = 0;
		if (this._list) {
			let i = this._list.length;
			while (i--) {
				this._list[i].destroy();
			}
			this._list.length = 0;
		}
	}
	create(position, rotation, callback) {
		this._creationQueue.push({
			transform: new XRRigidTransform(position, rotation),
			callback: callback
		});
	}
	update(frame) {
		if (this._creationQueue.length) {
			for (let i = 0; i < this._creationQueue.length; i++) {
				const request = this._creationQueue[i];
				frame.createAnchor(request.transform, this.manager._referenceSpace).then(xrAnchor => {
					if (request.callback) this._callbacksAnchors.set(xrAnchor, request.callback);
				}).catch(ex => {
					if (request.callback) request.callback(ex, null);
					this.fire('error', ex);
				});
			}
			this._creationQueue.length = 0;
		}
		for (const [xrAnchor, anchor] of this._index) {
			if (frame.trackedAnchors.has(xrAnchor)) continue;
			anchor.destroy();
		}
		for (let i = 0; i < this._list.length; i++) {
			this._list[i].update(frame);
		}
		for (const xrAnchor of frame.trackedAnchors) {
			if (this._index.has(xrAnchor)) continue;
			try {
				const tmp = xrAnchor.anchorSpace;
			} catch (ex) {
				continue;
			}
			const anchor = new XrAnchor(this, xrAnchor);
			this._index.set(xrAnchor, anchor);
			this._list.push(anchor);
			anchor.update(frame);
			const callback = this._callbacksAnchors.get(xrAnchor);
			if (callback) {
				this._callbacksAnchors.delete(xrAnchor);
				callback(null, anchor);
			}
			this.fire('add', anchor);
		}
	}
	get supported() {
		return this._supported;
	}
	get list() {
		return this._list;
	}
}

export { XrAnchors };
