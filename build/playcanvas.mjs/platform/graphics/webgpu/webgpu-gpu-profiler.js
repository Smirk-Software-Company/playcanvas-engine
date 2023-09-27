import '../../../core/tracing.js';
import { GpuProfiler } from '../gpu-profiler.js';
import { WebgpuQuerySet } from './webgpu-query-set.js';

class WebgpuGpuProfiler extends GpuProfiler {
	constructor(device) {
		super();
		this.device = void 0;
		this.frameGPUMarkerSlot = void 0;
		this.device = device;
		this.timestampQueriesSet = device.supportsTimestampQuery ? new WebgpuQuerySet(device, true, 512) : null;
	}
	destroy() {
		var _this$timestampQuerie;
		(_this$timestampQuerie = this.timestampQueriesSet) == null ? void 0 : _this$timestampQuerie.destroy();
		this.timestampQueriesSet = null;
	}
	frameMarker(isStart) {
		if (this.timestampQueriesSet) {
			const commandEncoder = this.device.wgpu.createCommandEncoder();
			this.frameGPUMarkerSlot = isStart ? this.getSlot('GpuFrame') : this.frameGPUMarkerSlot;
			commandEncoder.writeTimestamp(this.timestampQueriesSet.querySet, this.frameGPUMarkerSlot * 2 + (isStart ? 0 : 1));
			const cb = commandEncoder.finish();
			this.device.addCommandBuffer(cb, isStart);
		}
	}
	frameStart() {
		this.processEnableRequest();
		if (this._enabled) {
			this.frameMarker(true);
		}
	}
	frameEnd() {
		if (this._enabled) {
			var _this$timestampQuerie2;
			this.frameMarker(false);
			(_this$timestampQuerie2 = this.timestampQueriesSet) == null ? void 0 : _this$timestampQuerie2.resolve(this.slotCount * 2);
		}
	}
	request() {
		if (this._enabled) {
			var _this$timestampQuerie3;
			const renderVersion = this.device.renderVersion;
			(_this$timestampQuerie3 = this.timestampQueriesSet) == null ? void 0 : _this$timestampQuerie3.request(this.slotCount, renderVersion).then(results => {
				this.report(results.renderVersion, results.timings);
			});
			super.request(renderVersion);
		}
	}
}

export { WebgpuGpuProfiler };
