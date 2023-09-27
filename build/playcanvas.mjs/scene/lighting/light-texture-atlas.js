import { Vec2 } from '../../core/math/vec2.js';
import { Vec4 } from '../../core/math/vec4.js';
import { RenderTarget } from '../../platform/graphics/render-target.js';
import { SHADOW_PCF3, LIGHTTYPE_SPOT, LIGHTTYPE_OMNI } from '../constants.js';
import { CookieRenderer } from '../renderer/cookie-renderer.js';
import { ShadowMap } from '../renderer/shadow-map.js';

const _tempArray = [];
const _tempArray2 = [];
const _viewport = new Vec4();
const _scissor = new Vec4();
class Slot {
  constructor(rect) {
    this.size = Math.floor(rect.w * 1024); // size normalized to 1024 atlas
    this.used = false;
    this.lightId = -1; // id of the light using the slot
    this.rect = rect;
  }
}

// A class handling runtime allocation of slots in a texture. It is used to allocate slots in the shadow and cookie atlas.
class LightTextureAtlas {
  constructor(device) {
    this.device = device;
    this.version = 1; // incremented each time slot configuration changes

    this.shadowAtlasResolution = 2048;
    this.shadowAtlas = null;

    // number of additional pixels to render past the required shadow camera angle (90deg for omni, outer for spot) of the shadow camera for clustered lights.
    // This needs to be a pixel more than a shadow filter needs to access.
    this.shadowEdgePixels = 3;
    this.cookieAtlasResolution = 4;
    this.cookieAtlas = CookieRenderer.createTexture(this.device, this.cookieAtlasResolution);
    this.cookieRenderTarget = new RenderTarget({
      colorBuffer: this.cookieAtlas,
      depth: false,
      flipY: true
    });

    // available slots (of type Slot)
    this.slots = [];

    // current subdivision strategy - matches format of LightingParams.atlasSplit
    this.atlasSplit = [];

    // offsets to individual faces of a cubemap inside 3x3 grid in an atlas slot
    this.cubeSlotsOffsets = [new Vec2(0, 0), new Vec2(0, 1), new Vec2(1, 0), new Vec2(1, 1), new Vec2(2, 0), new Vec2(2, 1)];

    // handles gap between slots
    this.scissorVec = new Vec4();
    this.allocateShadowAtlas(1); // placeholder as shader requires it
    this.allocateCookieAtlas(1); // placeholder as shader requires it
    this.allocateUniforms();
  }
  destroy() {
    this.destroyShadowAtlas();
    this.destroyCookieAtlas();
  }
  destroyShadowAtlas() {
    var _this$shadowAtlas;
    (_this$shadowAtlas = this.shadowAtlas) == null ? void 0 : _this$shadowAtlas.destroy();
    this.shadowAtlas = null;
  }
  destroyCookieAtlas() {
    var _this$cookieAtlas, _this$cookieRenderTar;
    (_this$cookieAtlas = this.cookieAtlas) == null ? void 0 : _this$cookieAtlas.destroy();
    this.cookieAtlas = null;
    (_this$cookieRenderTar = this.cookieRenderTarget) == null ? void 0 : _this$cookieRenderTar.destroy();
    this.cookieRenderTarget = null;
  }
  allocateShadowAtlas(resolution) {
    if (!this.shadowAtlas || this.shadowAtlas.texture.width !== resolution) {
      // content of atlas is lost, force re-render of static shadows
      this.version++;
      this.destroyShadowAtlas();
      this.shadowAtlas = ShadowMap.createAtlas(this.device, resolution, SHADOW_PCF3);

      // avoid it being destroyed by lights
      this.shadowAtlas.cached = true;

      // leave gap between individual tiles to avoid shadow / cookie sampling other tiles (enough for PCF5)
      // note that this only fades / removes shadows on the edges, which is still not correct - a shader clipping is needed?
      const scissorOffset = 4 / this.shadowAtlasResolution;
      this.scissorVec.set(scissorOffset, scissorOffset, -2 * scissorOffset, -2 * scissorOffset);
    }
  }
  allocateCookieAtlas(resolution) {
    // resize atlas
    if (this.cookieAtlas.width !== resolution) {
      this.cookieRenderTarget.resize(resolution, resolution);

      // content of atlas is lost, force re-render of static cookies
      this.version++;
    }
  }
  allocateUniforms() {
    this._shadowAtlasTextureId = this.device.scope.resolve('shadowAtlasTexture');
    this._shadowAtlasParamsId = this.device.scope.resolve('shadowAtlasParams');
    this._shadowAtlasParams = new Float32Array(2);
    this._cookieAtlasTextureId = this.device.scope.resolve('cookieAtlasTexture');
  }
  updateUniforms() {
    // shadow atlas texture
    const isShadowFilterPcf = true;
    const rt = this.shadowAtlas.renderTargets[0];
    const isDepthShadow = (this.device.isWebGPU || this.device.webgl2) && isShadowFilterPcf;
    const shadowBuffer = isDepthShadow ? rt.depthBuffer : rt.colorBuffer;
    this._shadowAtlasTextureId.setValue(shadowBuffer);

    // shadow atlas params
    this._shadowAtlasParams[0] = this.shadowAtlasResolution;
    this._shadowAtlasParams[1] = this.shadowEdgePixels;
    this._shadowAtlasParamsId.setValue(this._shadowAtlasParams);

    // cookie atlas textures
    this._cookieAtlasTextureId.setValue(this.cookieAtlas);
  }
  subdivide(numLights, lightingParams) {
    let atlasSplit = lightingParams.atlasSplit;

    // if no user specified subdivision
    if (!atlasSplit) {
      // split to equal number of squares
      const gridSize = Math.ceil(Math.sqrt(numLights));
      atlasSplit = _tempArray2;
      atlasSplit[0] = gridSize;
      atlasSplit.length = 1;
    }

    // compare two arrays
    const arraysEqual = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

    // if the split has changed, regenerate slots
    if (!arraysEqual(atlasSplit, this.atlasSplit)) {
      this.version++;
      this.slots.length = 0;

      // store current settings
      this.atlasSplit.length = 0;
      this.atlasSplit.push(...atlasSplit);

      // generate top level split
      const splitCount = this.atlasSplit[0];
      if (splitCount > 1) {
        const invSize = 1 / splitCount;
        for (let i = 0; i < splitCount; i++) {
          for (let j = 0; j < splitCount; j++) {
            const rect = new Vec4(i * invSize, j * invSize, invSize, invSize);
            const nextLevelSplit = this.atlasSplit[1 + i * splitCount + j];

            // if need to split again
            if (nextLevelSplit > 1) {
              for (let x = 0; x < nextLevelSplit; x++) {
                for (let y = 0; y < nextLevelSplit; y++) {
                  const invSizeNext = invSize / nextLevelSplit;
                  const rectNext = new Vec4(rect.x + x * invSizeNext, rect.y + y * invSizeNext, invSizeNext, invSizeNext);
                  this.slots.push(new Slot(rectNext));
                }
              }
            } else {
              this.slots.push(new Slot(rect));
            }
          }
        }
      } else {
        // single slot
        this.slots.push(new Slot(new Vec4(0, 0, 1, 1)));
      }

      // sort slots descending
      this.slots.sort((a, b) => {
        return b.size - a.size;
      });
    }
  }
  collectLights(localLights, lightingParams) {
    const cookiesEnabled = lightingParams.cookiesEnabled;
    const shadowsEnabled = lightingParams.shadowsEnabled;

    // get all lights that need shadows or cookies, if those are enabled
    let needsShadowAtlas = false;
    let needsCookieAtlas = false;
    const lights = _tempArray;
    lights.length = 0;
    const processLights = list => {
      for (let i = 0; i < list.length; i++) {
        const light = list[i];
        if (light.visibleThisFrame) {
          const lightShadow = shadowsEnabled && light.castShadows;
          const lightCookie = cookiesEnabled && !!light.cookie;
          needsShadowAtlas || (needsShadowAtlas = lightShadow);
          needsCookieAtlas || (needsCookieAtlas = lightCookie);
          if (lightShadow || lightCookie) {
            lights.push(light);
          }
        }
      }
    };
    if (cookiesEnabled || shadowsEnabled) {
      processLights(localLights);
    }

    // sort lights by maxScreenSize - to have them ordered by atlas slot size
    lights.sort((a, b) => {
      return b.maxScreenSize - a.maxScreenSize;
    });
    if (needsShadowAtlas) {
      this.allocateShadowAtlas(this.shadowAtlasResolution);
    }
    if (needsCookieAtlas) {
      this.allocateCookieAtlas(this.cookieAtlasResolution);
    }
    if (needsShadowAtlas || needsCookieAtlas) {
      this.subdivide(lights.length, lightingParams);
    }
    return lights;
  }

  // configure light to use assigned slot
  setupSlot(light, rect) {
    light.atlasViewport.copy(rect);
    const faceCount = light.numShadowFaces;
    for (let face = 0; face < faceCount; face++) {
      // setup slot for shadow and cookie
      if (light.castShadows || light._cookie) {
        _viewport.copy(rect);
        _scissor.copy(rect);

        // for spot lights in the atlas, make viewport slightly smaller to avoid sampling past the edges
        if (light._type === LIGHTTYPE_SPOT) {
          _viewport.add(this.scissorVec);
        }

        // for cube map, allocate part of the slot
        if (light._type === LIGHTTYPE_OMNI) {
          const smallSize = _viewport.z / 3;
          const offset = this.cubeSlotsOffsets[face];
          _viewport.x += smallSize * offset.x;
          _viewport.y += smallSize * offset.y;
          _viewport.z = smallSize;
          _viewport.w = smallSize;
          _scissor.copy(_viewport);
        }
        if (light.castShadows) {
          const lightRenderData = light.getRenderData(null, face);
          lightRenderData.shadowViewport.copy(_viewport);
          lightRenderData.shadowScissor.copy(_scissor);
        }
      }
    }
  }

  // assign a slot to the light
  assignSlot(light, slotIndex, slotReassigned) {
    light.atlasViewportAllocated = true;
    const slot = this.slots[slotIndex];
    slot.lightId = light.id;
    slot.used = true;

    // slot is reassigned (content needs to be updated)
    if (slotReassigned) {
      light.atlasSlotUpdated = true;
      light.atlasVersion = this.version;
      light.atlasSlotIndex = slotIndex;
    }
  }

  // update texture atlas for a list of lights
  update(localLights, lightingParams) {
    // update texture resolutions
    this.shadowAtlasResolution = lightingParams.shadowAtlasResolution;
    this.cookieAtlasResolution = lightingParams.cookieAtlasResolution;

    // collect lights requiring atlas
    const lights = this.collectLights(localLights, lightingParams);
    if (lights.length > 0) {
      // mark all slots as unused
      const slots = this.slots;
      for (let i = 0; i < slots.length; i++) {
        slots[i].used = false;
      }

      // assign slots to lights
      // The slot to light assignment logic:
      // - internally the atlas slots are sorted in the descending order (done when atlas split changes)
      // - every frame all visible lights are sorted by their screen space size (this handles all cameras where lights
      //   are visible using max value)
      // - all lights in this order get a slot size from the slot list in the same order. Care is taken to not reassign
      //   slot if the size of it is the same and only index changes - this is done using two pass assignment
      const assignCount = Math.min(lights.length, slots.length);

      // first pass - preserve allocated slots for lights requiring slot of the same size
      for (let i = 0; i < assignCount; i++) {
        const light = lights[i];
        if (light.castShadows) light._shadowMap = this.shadowAtlas;

        // if currently assigned slot is the same size as what is needed, and was last used by this light, reuse it
        const previousSlot = slots[light.atlasSlotIndex];
        if (light.atlasVersion === this.version && light.id === (previousSlot == null ? void 0 : previousSlot.lightId)) {
          const _previousSlot = slots[light.atlasSlotIndex];
          if (_previousSlot.size === slots[i].size && !_previousSlot.used) {
            this.assignSlot(light, light.atlasSlotIndex, false);
          }
        }
      }

      // second pass - assign slots to unhandled lights
      let usedCount = 0;
      for (let i = 0; i < assignCount; i++) {
        // skip already used slots
        while (usedCount < slots.length && slots[usedCount].used) usedCount++;
        const light = lights[i];
        if (!light.atlasViewportAllocated) {
          this.assignSlot(light, usedCount, true);
        }

        // set up all slots
        const slot = slots[light.atlasSlotIndex];
        this.setupSlot(light, slot.rect);
      }
    }
    this.updateUniforms();
  }
}

export { LightTextureAtlas };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGlnaHQtdGV4dHVyZS1hdGxhcy5qcyIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL3NjZW5lL2xpZ2h0aW5nL2xpZ2h0LXRleHR1cmUtYXRsYXMuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgVmVjMiB9IGZyb20gJy4uLy4uL2NvcmUvbWF0aC92ZWMyLmpzJztcbmltcG9ydCB7IFZlYzQgfSBmcm9tICcuLi8uLi9jb3JlL21hdGgvdmVjNC5qcyc7XG5cbmltcG9ydCB7IFJlbmRlclRhcmdldCB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2dyYXBoaWNzL3JlbmRlci10YXJnZXQuanMnO1xuXG5pbXBvcnQgeyBMSUdIVFRZUEVfT01OSSwgTElHSFRUWVBFX1NQT1QsIFNIQURPV19QQ0YzIH0gZnJvbSAnLi4vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IENvb2tpZVJlbmRlcmVyIH0gZnJvbSAnLi4vcmVuZGVyZXIvY29va2llLXJlbmRlcmVyLmpzJztcbmltcG9ydCB7IFNoYWRvd01hcCB9IGZyb20gJy4uL3JlbmRlcmVyL3NoYWRvdy1tYXAuanMnO1xuXG5jb25zdCBfdGVtcEFycmF5ID0gW107XG5jb25zdCBfdGVtcEFycmF5MiA9IFtdO1xuY29uc3QgX3ZpZXdwb3J0ID0gbmV3IFZlYzQoKTtcbmNvbnN0IF9zY2lzc29yID0gbmV3IFZlYzQoKTtcblxuY2xhc3MgU2xvdCB7XG4gICAgY29uc3RydWN0b3IocmVjdCkge1xuICAgICAgICB0aGlzLnNpemUgPSBNYXRoLmZsb29yKHJlY3QudyAqIDEwMjQpOyAgLy8gc2l6ZSBub3JtYWxpemVkIHRvIDEwMjQgYXRsYXNcbiAgICAgICAgdGhpcy51c2VkID0gZmFsc2U7XG4gICAgICAgIHRoaXMubGlnaHRJZCA9IC0xOyAgLy8gaWQgb2YgdGhlIGxpZ2h0IHVzaW5nIHRoZSBzbG90XG4gICAgICAgIHRoaXMucmVjdCA9IHJlY3Q7XG4gICAgfVxufVxuXG4vLyBBIGNsYXNzIGhhbmRsaW5nIHJ1bnRpbWUgYWxsb2NhdGlvbiBvZiBzbG90cyBpbiBhIHRleHR1cmUuIEl0IGlzIHVzZWQgdG8gYWxsb2NhdGUgc2xvdHMgaW4gdGhlIHNoYWRvdyBhbmQgY29va2llIGF0bGFzLlxuY2xhc3MgTGlnaHRUZXh0dXJlQXRsYXMge1xuICAgIGNvbnN0cnVjdG9yKGRldmljZSkge1xuXG4gICAgICAgIHRoaXMuZGV2aWNlID0gZGV2aWNlO1xuICAgICAgICB0aGlzLnZlcnNpb24gPSAxOyAgIC8vIGluY3JlbWVudGVkIGVhY2ggdGltZSBzbG90IGNvbmZpZ3VyYXRpb24gY2hhbmdlc1xuXG4gICAgICAgIHRoaXMuc2hhZG93QXRsYXNSZXNvbHV0aW9uID0gMjA0ODtcbiAgICAgICAgdGhpcy5zaGFkb3dBdGxhcyA9IG51bGw7XG5cbiAgICAgICAgLy8gbnVtYmVyIG9mIGFkZGl0aW9uYWwgcGl4ZWxzIHRvIHJlbmRlciBwYXN0IHRoZSByZXF1aXJlZCBzaGFkb3cgY2FtZXJhIGFuZ2xlICg5MGRlZyBmb3Igb21uaSwgb3V0ZXIgZm9yIHNwb3QpIG9mIHRoZSBzaGFkb3cgY2FtZXJhIGZvciBjbHVzdGVyZWQgbGlnaHRzLlxuICAgICAgICAvLyBUaGlzIG5lZWRzIHRvIGJlIGEgcGl4ZWwgbW9yZSB0aGFuIGEgc2hhZG93IGZpbHRlciBuZWVkcyB0byBhY2Nlc3MuXG4gICAgICAgIHRoaXMuc2hhZG93RWRnZVBpeGVscyA9IDM7XG5cbiAgICAgICAgdGhpcy5jb29raWVBdGxhc1Jlc29sdXRpb24gPSA0O1xuICAgICAgICB0aGlzLmNvb2tpZUF0bGFzID0gQ29va2llUmVuZGVyZXIuY3JlYXRlVGV4dHVyZSh0aGlzLmRldmljZSwgdGhpcy5jb29raWVBdGxhc1Jlc29sdXRpb24pO1xuICAgICAgICB0aGlzLmNvb2tpZVJlbmRlclRhcmdldCA9IG5ldyBSZW5kZXJUYXJnZXQoe1xuICAgICAgICAgICAgY29sb3JCdWZmZXI6IHRoaXMuY29va2llQXRsYXMsXG4gICAgICAgICAgICBkZXB0aDogZmFsc2UsXG4gICAgICAgICAgICBmbGlwWTogdHJ1ZVxuICAgICAgICB9KTtcblxuICAgICAgICAvLyBhdmFpbGFibGUgc2xvdHMgKG9mIHR5cGUgU2xvdClcbiAgICAgICAgdGhpcy5zbG90cyA9IFtdO1xuXG4gICAgICAgIC8vIGN1cnJlbnQgc3ViZGl2aXNpb24gc3RyYXRlZ3kgLSBtYXRjaGVzIGZvcm1hdCBvZiBMaWdodGluZ1BhcmFtcy5hdGxhc1NwbGl0XG4gICAgICAgIHRoaXMuYXRsYXNTcGxpdCA9IFtdO1xuXG4gICAgICAgIC8vIG9mZnNldHMgdG8gaW5kaXZpZHVhbCBmYWNlcyBvZiBhIGN1YmVtYXAgaW5zaWRlIDN4MyBncmlkIGluIGFuIGF0bGFzIHNsb3RcbiAgICAgICAgdGhpcy5jdWJlU2xvdHNPZmZzZXRzID0gW1xuICAgICAgICAgICAgbmV3IFZlYzIoMCwgMCksXG4gICAgICAgICAgICBuZXcgVmVjMigwLCAxKSxcbiAgICAgICAgICAgIG5ldyBWZWMyKDEsIDApLFxuICAgICAgICAgICAgbmV3IFZlYzIoMSwgMSksXG4gICAgICAgICAgICBuZXcgVmVjMigyLCAwKSxcbiAgICAgICAgICAgIG5ldyBWZWMyKDIsIDEpXG4gICAgICAgIF07XG5cbiAgICAgICAgLy8gaGFuZGxlcyBnYXAgYmV0d2VlbiBzbG90c1xuICAgICAgICB0aGlzLnNjaXNzb3JWZWMgPSBuZXcgVmVjNCgpO1xuXG4gICAgICAgIHRoaXMuYWxsb2NhdGVTaGFkb3dBdGxhcygxKTsgIC8vIHBsYWNlaG9sZGVyIGFzIHNoYWRlciByZXF1aXJlcyBpdFxuICAgICAgICB0aGlzLmFsbG9jYXRlQ29va2llQXRsYXMoMSk7ICAvLyBwbGFjZWhvbGRlciBhcyBzaGFkZXIgcmVxdWlyZXMgaXRcbiAgICAgICAgdGhpcy5hbGxvY2F0ZVVuaWZvcm1zKCk7XG4gICAgfVxuXG4gICAgZGVzdHJveSgpIHtcbiAgICAgICAgdGhpcy5kZXN0cm95U2hhZG93QXRsYXMoKTtcbiAgICAgICAgdGhpcy5kZXN0cm95Q29va2llQXRsYXMoKTtcbiAgICB9XG5cbiAgICBkZXN0cm95U2hhZG93QXRsYXMoKSB7XG4gICAgICAgIHRoaXMuc2hhZG93QXRsYXM/LmRlc3Ryb3koKTtcbiAgICAgICAgdGhpcy5zaGFkb3dBdGxhcyA9IG51bGw7XG4gICAgfVxuXG4gICAgZGVzdHJveUNvb2tpZUF0bGFzKCkge1xuICAgICAgICB0aGlzLmNvb2tpZUF0bGFzPy5kZXN0cm95KCk7XG4gICAgICAgIHRoaXMuY29va2llQXRsYXMgPSBudWxsO1xuXG4gICAgICAgIHRoaXMuY29va2llUmVuZGVyVGFyZ2V0Py5kZXN0cm95KCk7XG4gICAgICAgIHRoaXMuY29va2llUmVuZGVyVGFyZ2V0ID0gbnVsbDtcbiAgICB9XG5cbiAgICBhbGxvY2F0ZVNoYWRvd0F0bGFzKHJlc29sdXRpb24pIHtcblxuICAgICAgICBpZiAoIXRoaXMuc2hhZG93QXRsYXMgfHwgdGhpcy5zaGFkb3dBdGxhcy50ZXh0dXJlLndpZHRoICE9PSByZXNvbHV0aW9uKSB7XG5cbiAgICAgICAgICAgIC8vIGNvbnRlbnQgb2YgYXRsYXMgaXMgbG9zdCwgZm9yY2UgcmUtcmVuZGVyIG9mIHN0YXRpYyBzaGFkb3dzXG4gICAgICAgICAgICB0aGlzLnZlcnNpb24rKztcblxuICAgICAgICAgICAgdGhpcy5kZXN0cm95U2hhZG93QXRsYXMoKTtcbiAgICAgICAgICAgIHRoaXMuc2hhZG93QXRsYXMgPSBTaGFkb3dNYXAuY3JlYXRlQXRsYXModGhpcy5kZXZpY2UsIHJlc29sdXRpb24sIFNIQURPV19QQ0YzKTtcblxuICAgICAgICAgICAgLy8gYXZvaWQgaXQgYmVpbmcgZGVzdHJveWVkIGJ5IGxpZ2h0c1xuICAgICAgICAgICAgdGhpcy5zaGFkb3dBdGxhcy5jYWNoZWQgPSB0cnVlO1xuXG4gICAgICAgICAgICAvLyBsZWF2ZSBnYXAgYmV0d2VlbiBpbmRpdmlkdWFsIHRpbGVzIHRvIGF2b2lkIHNoYWRvdyAvIGNvb2tpZSBzYW1wbGluZyBvdGhlciB0aWxlcyAoZW5vdWdoIGZvciBQQ0Y1KVxuICAgICAgICAgICAgLy8gbm90ZSB0aGF0IHRoaXMgb25seSBmYWRlcyAvIHJlbW92ZXMgc2hhZG93cyBvbiB0aGUgZWRnZXMsIHdoaWNoIGlzIHN0aWxsIG5vdCBjb3JyZWN0IC0gYSBzaGFkZXIgY2xpcHBpbmcgaXMgbmVlZGVkP1xuICAgICAgICAgICAgY29uc3Qgc2Npc3Nvck9mZnNldCA9IDQgLyB0aGlzLnNoYWRvd0F0bGFzUmVzb2x1dGlvbjtcbiAgICAgICAgICAgIHRoaXMuc2Npc3NvclZlYy5zZXQoc2Npc3Nvck9mZnNldCwgc2Npc3Nvck9mZnNldCwgLTIgKiBzY2lzc29yT2Zmc2V0LCAtMiAqIHNjaXNzb3JPZmZzZXQpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgYWxsb2NhdGVDb29raWVBdGxhcyhyZXNvbHV0aW9uKSB7XG5cbiAgICAgICAgLy8gcmVzaXplIGF0bGFzXG4gICAgICAgIGlmICh0aGlzLmNvb2tpZUF0bGFzLndpZHRoICE9PSByZXNvbHV0aW9uKSB7XG5cbiAgICAgICAgICAgIHRoaXMuY29va2llUmVuZGVyVGFyZ2V0LnJlc2l6ZShyZXNvbHV0aW9uLCByZXNvbHV0aW9uKTtcblxuICAgICAgICAgICAgLy8gY29udGVudCBvZiBhdGxhcyBpcyBsb3N0LCBmb3JjZSByZS1yZW5kZXIgb2Ygc3RhdGljIGNvb2tpZXNcbiAgICAgICAgICAgIHRoaXMudmVyc2lvbisrO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgYWxsb2NhdGVVbmlmb3JtcygpIHtcbiAgICAgICAgdGhpcy5fc2hhZG93QXRsYXNUZXh0dXJlSWQgPSB0aGlzLmRldmljZS5zY29wZS5yZXNvbHZlKCdzaGFkb3dBdGxhc1RleHR1cmUnKTtcbiAgICAgICAgdGhpcy5fc2hhZG93QXRsYXNQYXJhbXNJZCA9IHRoaXMuZGV2aWNlLnNjb3BlLnJlc29sdmUoJ3NoYWRvd0F0bGFzUGFyYW1zJyk7XG4gICAgICAgIHRoaXMuX3NoYWRvd0F0bGFzUGFyYW1zID0gbmV3IEZsb2F0MzJBcnJheSgyKTtcblxuICAgICAgICB0aGlzLl9jb29raWVBdGxhc1RleHR1cmVJZCA9IHRoaXMuZGV2aWNlLnNjb3BlLnJlc29sdmUoJ2Nvb2tpZUF0bGFzVGV4dHVyZScpO1xuICAgIH1cblxuICAgIHVwZGF0ZVVuaWZvcm1zKCkge1xuXG4gICAgICAgIC8vIHNoYWRvdyBhdGxhcyB0ZXh0dXJlXG4gICAgICAgIGNvbnN0IGlzU2hhZG93RmlsdGVyUGNmID0gdHJ1ZTtcbiAgICAgICAgY29uc3QgcnQgPSB0aGlzLnNoYWRvd0F0bGFzLnJlbmRlclRhcmdldHNbMF07XG4gICAgICAgIGNvbnN0IGlzRGVwdGhTaGFkb3cgPSAodGhpcy5kZXZpY2UuaXNXZWJHUFUgfHwgdGhpcy5kZXZpY2Uud2ViZ2wyKSAmJiBpc1NoYWRvd0ZpbHRlclBjZjtcbiAgICAgICAgY29uc3Qgc2hhZG93QnVmZmVyID0gaXNEZXB0aFNoYWRvdyA/IHJ0LmRlcHRoQnVmZmVyIDogcnQuY29sb3JCdWZmZXI7XG4gICAgICAgIHRoaXMuX3NoYWRvd0F0bGFzVGV4dHVyZUlkLnNldFZhbHVlKHNoYWRvd0J1ZmZlcik7XG5cbiAgICAgICAgLy8gc2hhZG93IGF0bGFzIHBhcmFtc1xuICAgICAgICB0aGlzLl9zaGFkb3dBdGxhc1BhcmFtc1swXSA9IHRoaXMuc2hhZG93QXRsYXNSZXNvbHV0aW9uO1xuICAgICAgICB0aGlzLl9zaGFkb3dBdGxhc1BhcmFtc1sxXSA9IHRoaXMuc2hhZG93RWRnZVBpeGVscztcbiAgICAgICAgdGhpcy5fc2hhZG93QXRsYXNQYXJhbXNJZC5zZXRWYWx1ZSh0aGlzLl9zaGFkb3dBdGxhc1BhcmFtcyk7XG5cbiAgICAgICAgLy8gY29va2llIGF0bGFzIHRleHR1cmVzXG4gICAgICAgIHRoaXMuX2Nvb2tpZUF0bGFzVGV4dHVyZUlkLnNldFZhbHVlKHRoaXMuY29va2llQXRsYXMpO1xuICAgIH1cblxuICAgIHN1YmRpdmlkZShudW1MaWdodHMsIGxpZ2h0aW5nUGFyYW1zKSB7XG5cbiAgICAgICAgbGV0IGF0bGFzU3BsaXQgPSBsaWdodGluZ1BhcmFtcy5hdGxhc1NwbGl0O1xuXG4gICAgICAgIC8vIGlmIG5vIHVzZXIgc3BlY2lmaWVkIHN1YmRpdmlzaW9uXG4gICAgICAgIGlmICghYXRsYXNTcGxpdCkge1xuXG4gICAgICAgICAgICAvLyBzcGxpdCB0byBlcXVhbCBudW1iZXIgb2Ygc3F1YXJlc1xuICAgICAgICAgICAgY29uc3QgZ3JpZFNpemUgPSBNYXRoLmNlaWwoTWF0aC5zcXJ0KG51bUxpZ2h0cykpO1xuICAgICAgICAgICAgYXRsYXNTcGxpdCA9IF90ZW1wQXJyYXkyO1xuICAgICAgICAgICAgYXRsYXNTcGxpdFswXSA9IGdyaWRTaXplO1xuICAgICAgICAgICAgYXRsYXNTcGxpdC5sZW5ndGggPSAxO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gY29tcGFyZSB0d28gYXJyYXlzXG4gICAgICAgIGNvbnN0IGFycmF5c0VxdWFsID0gKGEsIGIpID0+IGEubGVuZ3RoID09PSBiLmxlbmd0aCAmJiBhLmV2ZXJ5KCh2LCBpKSA9PiB2ID09PSBiW2ldKTtcblxuICAgICAgICAvLyBpZiB0aGUgc3BsaXQgaGFzIGNoYW5nZWQsIHJlZ2VuZXJhdGUgc2xvdHNcbiAgICAgICAgaWYgKCFhcnJheXNFcXVhbChhdGxhc1NwbGl0LCB0aGlzLmF0bGFzU3BsaXQpKSB7XG5cbiAgICAgICAgICAgIHRoaXMudmVyc2lvbisrO1xuICAgICAgICAgICAgdGhpcy5zbG90cy5sZW5ndGggPSAwO1xuXG4gICAgICAgICAgICAvLyBzdG9yZSBjdXJyZW50IHNldHRpbmdzXG4gICAgICAgICAgICB0aGlzLmF0bGFzU3BsaXQubGVuZ3RoID0gMDtcbiAgICAgICAgICAgIHRoaXMuYXRsYXNTcGxpdC5wdXNoKC4uLmF0bGFzU3BsaXQpO1xuXG4gICAgICAgICAgICAvLyBnZW5lcmF0ZSB0b3AgbGV2ZWwgc3BsaXRcbiAgICAgICAgICAgIGNvbnN0IHNwbGl0Q291bnQgPSB0aGlzLmF0bGFzU3BsaXRbMF07XG4gICAgICAgICAgICBpZiAoc3BsaXRDb3VudCA+IDEpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBpbnZTaXplID0gMSAvIHNwbGl0Q291bnQ7XG4gICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzcGxpdENvdW50OyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgaiA9IDA7IGogPCBzcGxpdENvdW50OyBqKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlY3QgPSBuZXcgVmVjNChpICogaW52U2l6ZSwgaiAqIGludlNpemUsIGludlNpemUsIGludlNpemUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbmV4dExldmVsU3BsaXQgPSB0aGlzLmF0bGFzU3BsaXRbMSArIGkgKiBzcGxpdENvdW50ICsgal07XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGlmIG5lZWQgdG8gc3BsaXQgYWdhaW5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChuZXh0TGV2ZWxTcGxpdCA+IDEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGxldCB4ID0gMDsgeCA8IG5leHRMZXZlbFNwbGl0OyB4KyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgeSA9IDA7IHkgPCBuZXh0TGV2ZWxTcGxpdDsgeSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBpbnZTaXplTmV4dCA9IGludlNpemUgLyBuZXh0TGV2ZWxTcGxpdDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlY3ROZXh0ID0gbmV3IFZlYzQocmVjdC54ICsgeCAqIGludlNpemVOZXh0LCByZWN0LnkgKyB5ICogaW52U2l6ZU5leHQsIGludlNpemVOZXh0LCBpbnZTaXplTmV4dCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNsb3RzLnB1c2gobmV3IFNsb3QocmVjdE5leHQpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zbG90cy5wdXNoKG5ldyBTbG90KHJlY3QpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gc2luZ2xlIHNsb3RcbiAgICAgICAgICAgICAgICB0aGlzLnNsb3RzLnB1c2gobmV3IFNsb3QobmV3IFZlYzQoMCwgMCwgMSwgMSkpKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gc29ydCBzbG90cyBkZXNjZW5kaW5nXG4gICAgICAgICAgICB0aGlzLnNsb3RzLnNvcnQoKGEsIGIpID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gYi5zaXplIC0gYS5zaXplO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBjb2xsZWN0TGlnaHRzKGxvY2FsTGlnaHRzLCBsaWdodGluZ1BhcmFtcykge1xuXG4gICAgICAgIGNvbnN0IGNvb2tpZXNFbmFibGVkID0gbGlnaHRpbmdQYXJhbXMuY29va2llc0VuYWJsZWQ7XG4gICAgICAgIGNvbnN0IHNoYWRvd3NFbmFibGVkID0gbGlnaHRpbmdQYXJhbXMuc2hhZG93c0VuYWJsZWQ7XG5cbiAgICAgICAgLy8gZ2V0IGFsbCBsaWdodHMgdGhhdCBuZWVkIHNoYWRvd3Mgb3IgY29va2llcywgaWYgdGhvc2UgYXJlIGVuYWJsZWRcbiAgICAgICAgbGV0IG5lZWRzU2hhZG93QXRsYXMgPSBmYWxzZTtcbiAgICAgICAgbGV0IG5lZWRzQ29va2llQXRsYXMgPSBmYWxzZTtcbiAgICAgICAgY29uc3QgbGlnaHRzID0gX3RlbXBBcnJheTtcbiAgICAgICAgbGlnaHRzLmxlbmd0aCA9IDA7XG5cbiAgICAgICAgY29uc3QgcHJvY2Vzc0xpZ2h0cyA9IChsaXN0KSA9PiB7XG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGxpc3QubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICBjb25zdCBsaWdodCA9IGxpc3RbaV07XG4gICAgICAgICAgICAgICAgaWYgKGxpZ2h0LnZpc2libGVUaGlzRnJhbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbGlnaHRTaGFkb3cgPSBzaGFkb3dzRW5hYmxlZCAmJiBsaWdodC5jYXN0U2hhZG93cztcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbGlnaHRDb29raWUgPSBjb29raWVzRW5hYmxlZCAmJiAhIWxpZ2h0LmNvb2tpZTtcblxuICAgICAgICAgICAgICAgICAgICBuZWVkc1NoYWRvd0F0bGFzIHx8PSBsaWdodFNoYWRvdztcbiAgICAgICAgICAgICAgICAgICAgbmVlZHNDb29raWVBdGxhcyB8fD0gbGlnaHRDb29raWU7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGxpZ2h0U2hhZG93IHx8IGxpZ2h0Q29va2llKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBsaWdodHMucHVzaChsaWdodCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgaWYgKGNvb2tpZXNFbmFibGVkIHx8IHNoYWRvd3NFbmFibGVkKSB7XG4gICAgICAgICAgICBwcm9jZXNzTGlnaHRzKGxvY2FsTGlnaHRzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHNvcnQgbGlnaHRzIGJ5IG1heFNjcmVlblNpemUgLSB0byBoYXZlIHRoZW0gb3JkZXJlZCBieSBhdGxhcyBzbG90IHNpemVcbiAgICAgICAgbGlnaHRzLnNvcnQoKGEsIGIpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBiLm1heFNjcmVlblNpemUgLSBhLm1heFNjcmVlblNpemU7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGlmIChuZWVkc1NoYWRvd0F0bGFzKSB7XG4gICAgICAgICAgICB0aGlzLmFsbG9jYXRlU2hhZG93QXRsYXModGhpcy5zaGFkb3dBdGxhc1Jlc29sdXRpb24pO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKG5lZWRzQ29va2llQXRsYXMpIHtcbiAgICAgICAgICAgIHRoaXMuYWxsb2NhdGVDb29raWVBdGxhcyh0aGlzLmNvb2tpZUF0bGFzUmVzb2x1dGlvbik7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAobmVlZHNTaGFkb3dBdGxhcyB8fCBuZWVkc0Nvb2tpZUF0bGFzKSB7XG4gICAgICAgICAgICB0aGlzLnN1YmRpdmlkZShsaWdodHMubGVuZ3RoLCBsaWdodGluZ1BhcmFtcyk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gbGlnaHRzO1xuICAgIH1cblxuICAgIC8vIGNvbmZpZ3VyZSBsaWdodCB0byB1c2UgYXNzaWduZWQgc2xvdFxuICAgIHNldHVwU2xvdChsaWdodCwgcmVjdCkge1xuXG4gICAgICAgIGxpZ2h0LmF0bGFzVmlld3BvcnQuY29weShyZWN0KTtcblxuICAgICAgICBjb25zdCBmYWNlQ291bnQgPSBsaWdodC5udW1TaGFkb3dGYWNlcztcbiAgICAgICAgZm9yIChsZXQgZmFjZSA9IDA7IGZhY2UgPCBmYWNlQ291bnQ7IGZhY2UrKykge1xuXG4gICAgICAgICAgICAvLyBzZXR1cCBzbG90IGZvciBzaGFkb3cgYW5kIGNvb2tpZVxuICAgICAgICAgICAgaWYgKGxpZ2h0LmNhc3RTaGFkb3dzIHx8IGxpZ2h0Ll9jb29raWUpIHtcblxuICAgICAgICAgICAgICAgIF92aWV3cG9ydC5jb3B5KHJlY3QpO1xuICAgICAgICAgICAgICAgIF9zY2lzc29yLmNvcHkocmVjdCk7XG5cbiAgICAgICAgICAgICAgICAvLyBmb3Igc3BvdCBsaWdodHMgaW4gdGhlIGF0bGFzLCBtYWtlIHZpZXdwb3J0IHNsaWdodGx5IHNtYWxsZXIgdG8gYXZvaWQgc2FtcGxpbmcgcGFzdCB0aGUgZWRnZXNcbiAgICAgICAgICAgICAgICBpZiAobGlnaHQuX3R5cGUgPT09IExJR0hUVFlQRV9TUE9UKSB7XG4gICAgICAgICAgICAgICAgICAgIF92aWV3cG9ydC5hZGQodGhpcy5zY2lzc29yVmVjKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBmb3IgY3ViZSBtYXAsIGFsbG9jYXRlIHBhcnQgb2YgdGhlIHNsb3RcbiAgICAgICAgICAgICAgICBpZiAobGlnaHQuX3R5cGUgPT09IExJR0hUVFlQRV9PTU5JKSB7XG5cbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgc21hbGxTaXplID0gX3ZpZXdwb3J0LnogLyAzO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBvZmZzZXQgPSB0aGlzLmN1YmVTbG90c09mZnNldHNbZmFjZV07XG4gICAgICAgICAgICAgICAgICAgIF92aWV3cG9ydC54ICs9IHNtYWxsU2l6ZSAqIG9mZnNldC54O1xuICAgICAgICAgICAgICAgICAgICBfdmlld3BvcnQueSArPSBzbWFsbFNpemUgKiBvZmZzZXQueTtcbiAgICAgICAgICAgICAgICAgICAgX3ZpZXdwb3J0LnogPSBzbWFsbFNpemU7XG4gICAgICAgICAgICAgICAgICAgIF92aWV3cG9ydC53ID0gc21hbGxTaXplO1xuXG4gICAgICAgICAgICAgICAgICAgIF9zY2lzc29yLmNvcHkoX3ZpZXdwb3J0KTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAobGlnaHQuY2FzdFNoYWRvd3MpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbGlnaHRSZW5kZXJEYXRhID0gbGlnaHQuZ2V0UmVuZGVyRGF0YShudWxsLCBmYWNlKTtcbiAgICAgICAgICAgICAgICAgICAgbGlnaHRSZW5kZXJEYXRhLnNoYWRvd1ZpZXdwb3J0LmNvcHkoX3ZpZXdwb3J0KTtcbiAgICAgICAgICAgICAgICAgICAgbGlnaHRSZW5kZXJEYXRhLnNoYWRvd1NjaXNzb3IuY29weShfc2Npc3Nvcik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gYXNzaWduIGEgc2xvdCB0byB0aGUgbGlnaHRcbiAgICBhc3NpZ25TbG90KGxpZ2h0LCBzbG90SW5kZXgsIHNsb3RSZWFzc2lnbmVkKSB7XG5cbiAgICAgICAgbGlnaHQuYXRsYXNWaWV3cG9ydEFsbG9jYXRlZCA9IHRydWU7XG5cbiAgICAgICAgY29uc3Qgc2xvdCA9IHRoaXMuc2xvdHNbc2xvdEluZGV4XTtcbiAgICAgICAgc2xvdC5saWdodElkID0gbGlnaHQuaWQ7XG4gICAgICAgIHNsb3QudXNlZCA9IHRydWU7XG5cbiAgICAgICAgLy8gc2xvdCBpcyByZWFzc2lnbmVkIChjb250ZW50IG5lZWRzIHRvIGJlIHVwZGF0ZWQpXG4gICAgICAgIGlmIChzbG90UmVhc3NpZ25lZCkge1xuICAgICAgICAgICAgbGlnaHQuYXRsYXNTbG90VXBkYXRlZCA9IHRydWU7XG4gICAgICAgICAgICBsaWdodC5hdGxhc1ZlcnNpb24gPSB0aGlzLnZlcnNpb247XG4gICAgICAgICAgICBsaWdodC5hdGxhc1Nsb3RJbmRleCA9IHNsb3RJbmRleDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIHVwZGF0ZSB0ZXh0dXJlIGF0bGFzIGZvciBhIGxpc3Qgb2YgbGlnaHRzXG4gICAgdXBkYXRlKGxvY2FsTGlnaHRzLCBsaWdodGluZ1BhcmFtcykge1xuXG4gICAgICAgIC8vIHVwZGF0ZSB0ZXh0dXJlIHJlc29sdXRpb25zXG4gICAgICAgIHRoaXMuc2hhZG93QXRsYXNSZXNvbHV0aW9uID0gbGlnaHRpbmdQYXJhbXMuc2hhZG93QXRsYXNSZXNvbHV0aW9uO1xuICAgICAgICB0aGlzLmNvb2tpZUF0bGFzUmVzb2x1dGlvbiA9IGxpZ2h0aW5nUGFyYW1zLmNvb2tpZUF0bGFzUmVzb2x1dGlvbjtcblxuICAgICAgICAvLyBjb2xsZWN0IGxpZ2h0cyByZXF1aXJpbmcgYXRsYXNcbiAgICAgICAgY29uc3QgbGlnaHRzID0gdGhpcy5jb2xsZWN0TGlnaHRzKGxvY2FsTGlnaHRzLCBsaWdodGluZ1BhcmFtcyk7XG4gICAgICAgIGlmIChsaWdodHMubGVuZ3RoID4gMCkge1xuXG4gICAgICAgICAgICAvLyBtYXJrIGFsbCBzbG90cyBhcyB1bnVzZWRcbiAgICAgICAgICAgIGNvbnN0IHNsb3RzID0gdGhpcy5zbG90cztcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc2xvdHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICBzbG90c1tpXS51c2VkID0gZmFsc2U7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIGFzc2lnbiBzbG90cyB0byBsaWdodHNcbiAgICAgICAgICAgIC8vIFRoZSBzbG90IHRvIGxpZ2h0IGFzc2lnbm1lbnQgbG9naWM6XG4gICAgICAgICAgICAvLyAtIGludGVybmFsbHkgdGhlIGF0bGFzIHNsb3RzIGFyZSBzb3J0ZWQgaW4gdGhlIGRlc2NlbmRpbmcgb3JkZXIgKGRvbmUgd2hlbiBhdGxhcyBzcGxpdCBjaGFuZ2VzKVxuICAgICAgICAgICAgLy8gLSBldmVyeSBmcmFtZSBhbGwgdmlzaWJsZSBsaWdodHMgYXJlIHNvcnRlZCBieSB0aGVpciBzY3JlZW4gc3BhY2Ugc2l6ZSAodGhpcyBoYW5kbGVzIGFsbCBjYW1lcmFzIHdoZXJlIGxpZ2h0c1xuICAgICAgICAgICAgLy8gICBhcmUgdmlzaWJsZSB1c2luZyBtYXggdmFsdWUpXG4gICAgICAgICAgICAvLyAtIGFsbCBsaWdodHMgaW4gdGhpcyBvcmRlciBnZXQgYSBzbG90IHNpemUgZnJvbSB0aGUgc2xvdCBsaXN0IGluIHRoZSBzYW1lIG9yZGVyLiBDYXJlIGlzIHRha2VuIHRvIG5vdCByZWFzc2lnblxuICAgICAgICAgICAgLy8gICBzbG90IGlmIHRoZSBzaXplIG9mIGl0IGlzIHRoZSBzYW1lIGFuZCBvbmx5IGluZGV4IGNoYW5nZXMgLSB0aGlzIGlzIGRvbmUgdXNpbmcgdHdvIHBhc3MgYXNzaWdubWVudFxuICAgICAgICAgICAgY29uc3QgYXNzaWduQ291bnQgPSBNYXRoLm1pbihsaWdodHMubGVuZ3RoLCBzbG90cy5sZW5ndGgpO1xuXG4gICAgICAgICAgICAvLyBmaXJzdCBwYXNzIC0gcHJlc2VydmUgYWxsb2NhdGVkIHNsb3RzIGZvciBsaWdodHMgcmVxdWlyaW5nIHNsb3Qgb2YgdGhlIHNhbWUgc2l6ZVxuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhc3NpZ25Db3VudDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgbGlnaHQgPSBsaWdodHNbaV07XG5cbiAgICAgICAgICAgICAgICBpZiAobGlnaHQuY2FzdFNoYWRvd3MpXG4gICAgICAgICAgICAgICAgICAgIGxpZ2h0Ll9zaGFkb3dNYXAgPSB0aGlzLnNoYWRvd0F0bGFzO1xuXG4gICAgICAgICAgICAgICAgLy8gaWYgY3VycmVudGx5IGFzc2lnbmVkIHNsb3QgaXMgdGhlIHNhbWUgc2l6ZSBhcyB3aGF0IGlzIG5lZWRlZCwgYW5kIHdhcyBsYXN0IHVzZWQgYnkgdGhpcyBsaWdodCwgcmV1c2UgaXRcbiAgICAgICAgICAgICAgICBjb25zdCBwcmV2aW91c1Nsb3QgPSBzbG90c1tsaWdodC5hdGxhc1Nsb3RJbmRleF07XG4gICAgICAgICAgICAgICAgaWYgKGxpZ2h0LmF0bGFzVmVyc2lvbiA9PT0gdGhpcy52ZXJzaW9uICYmIGxpZ2h0LmlkID09PSBwcmV2aW91c1Nsb3Q/LmxpZ2h0SWQpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcHJldmlvdXNTbG90ID0gc2xvdHNbbGlnaHQuYXRsYXNTbG90SW5kZXhdO1xuICAgICAgICAgICAgICAgICAgICBpZiAocHJldmlvdXNTbG90LnNpemUgPT09IHNsb3RzW2ldLnNpemUgJiYgIXByZXZpb3VzU2xvdC51c2VkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmFzc2lnblNsb3QobGlnaHQsIGxpZ2h0LmF0bGFzU2xvdEluZGV4LCBmYWxzZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIHNlY29uZCBwYXNzIC0gYXNzaWduIHNsb3RzIHRvIHVuaGFuZGxlZCBsaWdodHNcbiAgICAgICAgICAgIGxldCB1c2VkQ291bnQgPSAwO1xuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhc3NpZ25Db3VudDsgaSsrKSB7XG5cbiAgICAgICAgICAgICAgICAvLyBza2lwIGFscmVhZHkgdXNlZCBzbG90c1xuICAgICAgICAgICAgICAgIHdoaWxlICh1c2VkQ291bnQgPCBzbG90cy5sZW5ndGggJiYgc2xvdHNbdXNlZENvdW50XS51c2VkKVxuICAgICAgICAgICAgICAgICAgICB1c2VkQ291bnQrKztcblxuICAgICAgICAgICAgICAgIGNvbnN0IGxpZ2h0ID0gbGlnaHRzW2ldO1xuICAgICAgICAgICAgICAgIGlmICghbGlnaHQuYXRsYXNWaWV3cG9ydEFsbG9jYXRlZCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmFzc2lnblNsb3QobGlnaHQsIHVzZWRDb3VudCwgdHJ1ZSk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gc2V0IHVwIGFsbCBzbG90c1xuICAgICAgICAgICAgICAgIGNvbnN0IHNsb3QgPSBzbG90c1tsaWdodC5hdGxhc1Nsb3RJbmRleF07XG4gICAgICAgICAgICAgICAgdGhpcy5zZXR1cFNsb3QobGlnaHQsIHNsb3QucmVjdCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnVwZGF0ZVVuaWZvcm1zKCk7XG4gICAgfVxufVxuXG5leHBvcnQgeyBMaWdodFRleHR1cmVBdGxhcyB9O1xuIl0sIm5hbWVzIjpbIl90ZW1wQXJyYXkiLCJfdGVtcEFycmF5MiIsIl92aWV3cG9ydCIsIlZlYzQiLCJfc2Npc3NvciIsIlNsb3QiLCJjb25zdHJ1Y3RvciIsInJlY3QiLCJzaXplIiwiTWF0aCIsImZsb29yIiwidyIsInVzZWQiLCJsaWdodElkIiwiTGlnaHRUZXh0dXJlQXRsYXMiLCJkZXZpY2UiLCJ2ZXJzaW9uIiwic2hhZG93QXRsYXNSZXNvbHV0aW9uIiwic2hhZG93QXRsYXMiLCJzaGFkb3dFZGdlUGl4ZWxzIiwiY29va2llQXRsYXNSZXNvbHV0aW9uIiwiY29va2llQXRsYXMiLCJDb29raWVSZW5kZXJlciIsImNyZWF0ZVRleHR1cmUiLCJjb29raWVSZW5kZXJUYXJnZXQiLCJSZW5kZXJUYXJnZXQiLCJjb2xvckJ1ZmZlciIsImRlcHRoIiwiZmxpcFkiLCJzbG90cyIsImF0bGFzU3BsaXQiLCJjdWJlU2xvdHNPZmZzZXRzIiwiVmVjMiIsInNjaXNzb3JWZWMiLCJhbGxvY2F0ZVNoYWRvd0F0bGFzIiwiYWxsb2NhdGVDb29raWVBdGxhcyIsImFsbG9jYXRlVW5pZm9ybXMiLCJkZXN0cm95IiwiZGVzdHJveVNoYWRvd0F0bGFzIiwiZGVzdHJveUNvb2tpZUF0bGFzIiwiX3RoaXMkc2hhZG93QXRsYXMiLCJfdGhpcyRjb29raWVBdGxhcyIsIl90aGlzJGNvb2tpZVJlbmRlclRhciIsInJlc29sdXRpb24iLCJ0ZXh0dXJlIiwid2lkdGgiLCJTaGFkb3dNYXAiLCJjcmVhdGVBdGxhcyIsIlNIQURPV19QQ0YzIiwiY2FjaGVkIiwic2Npc3Nvck9mZnNldCIsInNldCIsInJlc2l6ZSIsIl9zaGFkb3dBdGxhc1RleHR1cmVJZCIsInNjb3BlIiwicmVzb2x2ZSIsIl9zaGFkb3dBdGxhc1BhcmFtc0lkIiwiX3NoYWRvd0F0bGFzUGFyYW1zIiwiRmxvYXQzMkFycmF5IiwiX2Nvb2tpZUF0bGFzVGV4dHVyZUlkIiwidXBkYXRlVW5pZm9ybXMiLCJpc1NoYWRvd0ZpbHRlclBjZiIsInJ0IiwicmVuZGVyVGFyZ2V0cyIsImlzRGVwdGhTaGFkb3ciLCJpc1dlYkdQVSIsIndlYmdsMiIsInNoYWRvd0J1ZmZlciIsImRlcHRoQnVmZmVyIiwic2V0VmFsdWUiLCJzdWJkaXZpZGUiLCJudW1MaWdodHMiLCJsaWdodGluZ1BhcmFtcyIsImdyaWRTaXplIiwiY2VpbCIsInNxcnQiLCJsZW5ndGgiLCJhcnJheXNFcXVhbCIsImEiLCJiIiwiZXZlcnkiLCJ2IiwiaSIsInB1c2giLCJzcGxpdENvdW50IiwiaW52U2l6ZSIsImoiLCJuZXh0TGV2ZWxTcGxpdCIsIngiLCJ5IiwiaW52U2l6ZU5leHQiLCJyZWN0TmV4dCIsInNvcnQiLCJjb2xsZWN0TGlnaHRzIiwibG9jYWxMaWdodHMiLCJjb29raWVzRW5hYmxlZCIsInNoYWRvd3NFbmFibGVkIiwibmVlZHNTaGFkb3dBdGxhcyIsIm5lZWRzQ29va2llQXRsYXMiLCJsaWdodHMiLCJwcm9jZXNzTGlnaHRzIiwibGlzdCIsImxpZ2h0IiwidmlzaWJsZVRoaXNGcmFtZSIsImxpZ2h0U2hhZG93IiwiY2FzdFNoYWRvd3MiLCJsaWdodENvb2tpZSIsImNvb2tpZSIsIm1heFNjcmVlblNpemUiLCJzZXR1cFNsb3QiLCJhdGxhc1ZpZXdwb3J0IiwiY29weSIsImZhY2VDb3VudCIsIm51bVNoYWRvd0ZhY2VzIiwiZmFjZSIsIl9jb29raWUiLCJfdHlwZSIsIkxJR0hUVFlQRV9TUE9UIiwiYWRkIiwiTElHSFRUWVBFX09NTkkiLCJzbWFsbFNpemUiLCJ6Iiwib2Zmc2V0IiwibGlnaHRSZW5kZXJEYXRhIiwiZ2V0UmVuZGVyRGF0YSIsInNoYWRvd1ZpZXdwb3J0Iiwic2hhZG93U2Npc3NvciIsImFzc2lnblNsb3QiLCJzbG90SW5kZXgiLCJzbG90UmVhc3NpZ25lZCIsImF0bGFzVmlld3BvcnRBbGxvY2F0ZWQiLCJzbG90IiwiaWQiLCJhdGxhc1Nsb3RVcGRhdGVkIiwiYXRsYXNWZXJzaW9uIiwiYXRsYXNTbG90SW5kZXgiLCJ1cGRhdGUiLCJhc3NpZ25Db3VudCIsIm1pbiIsIl9zaGFkb3dNYXAiLCJwcmV2aW91c1Nsb3QiLCJ1c2VkQ291bnQiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFTQSxNQUFN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
