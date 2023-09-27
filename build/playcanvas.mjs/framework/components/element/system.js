import { Color } from '../../../core/math/color.js';
import { Vec2 } from '../../../core/math/vec2.js';
import { Vec4 } from '../../../core/math/vec4.js';
import { PIXELFORMAT_RGBA8 } from '../../../platform/graphics/constants.js';
import { Texture } from '../../../platform/graphics/texture.js';
import { BLEND_PREMULTIPLIED, SPRITE_RENDERMODE_SLICED, SPRITE_RENDERMODE_TILED } from '../../../scene/constants.js';
import { StandardMaterial } from '../../../scene/materials/standard-material.js';
import { Component } from '../component.js';
import { ComponentSystem } from '../system.js';
import { ELEMENTTYPE_IMAGE, ELEMENTTYPE_TEXT } from './constants.js';
import { ElementComponent } from './component.js';
import { ElementComponentData } from './data.js';

const _schema = ['enabled'];

/**
 * Manages creation of {@link ElementComponent}s.
 *
 * @augments ComponentSystem
 * @category User Interface
 */
class ElementComponentSystem extends ComponentSystem {
  /**
   * Create a new ElementComponentSystem instance.
   *
   * @param {import('../../app-base.js').AppBase} app - The application.
   * @hideconstructor
   */
  constructor(app) {
    super(app);
    this.id = 'element';
    this.ComponentType = ElementComponent;
    this.DataType = ElementComponentData;
    this.schema = _schema;
    this._unicodeConverter = null;
    this._rtlReorder = null;

    // default texture - make white so we can tint it with emissive color
    this._defaultTexture = new Texture(app.graphicsDevice, {
      width: 1,
      height: 1,
      format: PIXELFORMAT_RGBA8,
      name: 'element-system'
    });
    const pixels = this._defaultTexture.lock();
    const pixelData = new Uint8Array(4);
    pixelData[0] = 255.0;
    pixelData[1] = 255.0;
    pixelData[2] = 255.0;
    pixelData[3] = 255.0;
    pixels.set(pixelData);
    this._defaultTexture.unlock();

    // image element materials created on demand by getImageElementMaterial()
    this.defaultImageMaterial = null;
    this.defaultImage9SlicedMaterial = null;
    this.defaultImage9TiledMaterial = null;
    this.defaultImageMaskMaterial = null;
    this.defaultImage9SlicedMaskMaterial = null;
    this.defaultImage9TiledMaskMaterial = null;
    this.defaultScreenSpaceImageMaterial = null;
    this.defaultScreenSpaceImage9SlicedMaterial = null;
    this.defaultScreenSpaceImage9TiledMaterial = null;
    this.defaultScreenSpaceImageMask9SlicedMaterial = null;
    this.defaultScreenSpaceImageMask9TiledMaterial = null;
    this.defaultScreenSpaceImageMaskMaterial = null;

    // text element materials created on demand by getTextElementMaterial()
    this._defaultTextMaterials = {};
    this.defaultImageMaterials = [];
    this.on('beforeremove', this.onRemoveComponent, this);
  }
  destroy() {
    super.destroy();
    this._defaultTexture.destroy();
  }
  initializeComponentData(component, data, properties) {
    component._beingInitialized = true;
    if (data.anchor !== undefined) {
      if (data.anchor instanceof Vec4) {
        component.anchor.copy(data.anchor);
      } else {
        component.anchor.set(data.anchor[0], data.anchor[1], data.anchor[2], data.anchor[3]);
      }
    }
    if (data.pivot !== undefined) {
      if (data.pivot instanceof Vec2) {
        component.pivot.copy(data.pivot);
      } else {
        component.pivot.set(data.pivot[0], data.pivot[1]);
      }
    }
    const splitHorAnchors = Math.abs(component.anchor.x - component.anchor.z) > 0.001;
    const splitVerAnchors = Math.abs(component.anchor.y - component.anchor.w) > 0.001;
    let _marginChange = false;
    let color;
    if (data.margin !== undefined) {
      if (data.margin instanceof Vec4) {
        component.margin.copy(data.margin);
      } else {
        component._margin.set(data.margin[0], data.margin[1], data.margin[2], data.margin[3]);
      }
      _marginChange = true;
    }
    if (data.left !== undefined) {
      component._margin.x = data.left;
      _marginChange = true;
    }
    if (data.bottom !== undefined) {
      component._margin.y = data.bottom;
      _marginChange = true;
    }
    if (data.right !== undefined) {
      component._margin.z = data.right;
      _marginChange = true;
    }
    if (data.top !== undefined) {
      component._margin.w = data.top;
      _marginChange = true;
    }
    if (_marginChange) {
      // force update
      component.margin = component._margin;
    }
    let shouldForceSetAnchor = false;
    if (data.width !== undefined && !splitHorAnchors) {
      // force update
      component.width = data.width;
    } else if (splitHorAnchors) {
      shouldForceSetAnchor = true;
    }
    if (data.height !== undefined && !splitVerAnchors) {
      // force update
      component.height = data.height;
    } else if (splitVerAnchors) {
      shouldForceSetAnchor = true;
    }
    if (shouldForceSetAnchor) {
      /* eslint-disable no-self-assign */
      // force update
      component.anchor = component.anchor;
      /* eslint-enable no-self-assign */
    }

    if (data.enabled !== undefined) {
      component.enabled = data.enabled;
    }
    if (data.useInput !== undefined) {
      component.useInput = data.useInput;
    }
    if (data.fitMode !== undefined) {
      component.fitMode = data.fitMode;
    }
    component.batchGroupId = data.batchGroupId === undefined || data.batchGroupId === null ? -1 : data.batchGroupId;
    if (data.layers && Array.isArray(data.layers)) {
      component.layers = data.layers.slice(0);
    }
    if (data.type !== undefined) {
      component.type = data.type;
    }
    if (component.type === ELEMENTTYPE_IMAGE) {
      if (data.rect !== undefined) {
        component.rect = data.rect;
      }
      if (data.color !== undefined) {
        color = data.color;
        if (!(color instanceof Color)) {
          color = new Color(data.color[0], data.color[1], data.color[2]);
        }
        component.color = color;
      }
      if (data.opacity !== undefined) component.opacity = data.opacity;
      if (data.textureAsset !== undefined) component.textureAsset = data.textureAsset;
      if (data.texture) component.texture = data.texture;
      if (data.spriteAsset !== undefined) component.spriteAsset = data.spriteAsset;
      if (data.sprite) component.sprite = data.sprite;
      if (data.spriteFrame !== undefined) component.spriteFrame = data.spriteFrame;
      if (data.pixelsPerUnit !== undefined && data.pixelsPerUnit !== null) component.pixelsPerUnit = data.pixelsPerUnit;
      if (data.materialAsset !== undefined) component.materialAsset = data.materialAsset;
      if (data.material) component.material = data.material;
      if (data.mask !== undefined) {
        component.mask = data.mask;
      }
    } else if (component.type === ELEMENTTYPE_TEXT) {
      if (data.autoWidth !== undefined) component.autoWidth = data.autoWidth;
      if (data.autoHeight !== undefined) component.autoHeight = data.autoHeight;
      if (data.rtlReorder !== undefined) component.rtlReorder = data.rtlReorder;
      if (data.unicodeConverter !== undefined) component.unicodeConverter = data.unicodeConverter;
      if (data.text !== null && data.text !== undefined) {
        component.text = data.text;
      } else if (data.key !== null && data.key !== undefined) {
        component.key = data.key;
      }
      if (data.color !== undefined) {
        color = data.color;
        if (!(color instanceof Color)) {
          color = new Color(color[0], color[1], color[2]);
        }
        component.color = color;
      }
      if (data.opacity !== undefined) {
        component.opacity = data.opacity;
      }
      if (data.spacing !== undefined) component.spacing = data.spacing;
      if (data.fontSize !== undefined) {
        component.fontSize = data.fontSize;
        if (!data.lineHeight) component.lineHeight = data.fontSize;
      }
      if (data.lineHeight !== undefined) component.lineHeight = data.lineHeight;
      if (data.maxLines !== undefined) component.maxLines = data.maxLines;
      if (data.wrapLines !== undefined) component.wrapLines = data.wrapLines;
      if (data.minFontSize !== undefined) component.minFontSize = data.minFontSize;
      if (data.maxFontSize !== undefined) component.maxFontSize = data.maxFontSize;
      if (data.autoFitWidth) component.autoFitWidth = data.autoFitWidth;
      if (data.autoFitHeight) component.autoFitHeight = data.autoFitHeight;
      if (data.fontAsset !== undefined) component.fontAsset = data.fontAsset;
      if (data.font !== undefined) component.font = data.font;
      if (data.alignment !== undefined) component.alignment = data.alignment;
      if (data.outlineColor !== undefined) component.outlineColor = data.outlineColor;
      if (data.outlineThickness !== undefined) component.outlineThickness = data.outlineThickness;
      if (data.shadowColor !== undefined) component.shadowColor = data.shadowColor;
      if (data.shadowOffset !== undefined) component.shadowOffset = data.shadowOffset;
      if (data.enableMarkup !== undefined) component.enableMarkup = data.enableMarkup;
    }
    // OTHERWISE: group

    // find screen
    // do this here not in constructor so that component is added to the entity
    const result = component._parseUpToScreen();
    if (result.screen) {
      component._updateScreen(result.screen);
    }
    super.initializeComponentData(component, data, properties);
    component._beingInitialized = false;
    if (component.type === ELEMENTTYPE_IMAGE && component._image._meshDirty) {
      component._image._updateMesh(component._image.mesh);
    }
  }
  onRemoveComponent(entity, component) {
    component.onRemove();
  }
  cloneComponent(entity, clone) {
    const source = entity.element;
    const data = {
      enabled: source.enabled,
      width: source.width,
      height: source.height,
      anchor: source.anchor.clone(),
      pivot: source.pivot.clone(),
      margin: source.margin.clone(),
      alignment: source.alignment && source.alignment.clone() || source.alignment,
      autoWidth: source.autoWidth,
      autoHeight: source.autoHeight,
      type: source.type,
      rect: source.rect && source.rect.clone() || source.rect,
      rtlReorder: source.rtlReorder,
      unicodeConverter: source.unicodeConverter,
      materialAsset: source.materialAsset,
      material: source.material,
      color: source.color && source.color.clone() || source.color,
      opacity: source.opacity,
      textureAsset: source.textureAsset,
      texture: source.texture,
      spriteAsset: source.spriteAsset,
      sprite: source.sprite,
      spriteFrame: source.spriteFrame,
      pixelsPerUnit: source.pixelsPerUnit,
      spacing: source.spacing,
      lineHeight: source.lineHeight,
      wrapLines: source.wrapLines,
      layers: source.layers,
      fontSize: source.fontSize,
      minFontSize: source.minFontSize,
      maxFontSize: source.maxFontSize,
      autoFitWidth: source.autoFitWidth,
      autoFitHeight: source.autoFitHeight,
      maxLines: source.maxLines,
      fontAsset: source.fontAsset,
      font: source.font,
      useInput: source.useInput,
      fitMode: source.fitMode,
      batchGroupId: source.batchGroupId,
      mask: source.mask,
      outlineColor: source.outlineColor && source.outlineColor.clone() || source.outlineColor,
      outlineThickness: source.outlineThickness,
      shadowColor: source.shadowColor && source.shadowColor.clone() || source.shadowColor,
      shadowOffset: source.shadowOffset && source.shadowOffset.clone() || source.shadowOffset,
      enableMarkup: source.enableMarkup
    };
    if (source.key !== undefined && source.key !== null) {
      data.key = source.key;
    } else {
      data.text = source.text;
    }
    return this.addComponent(clone, data);
  }
  getTextElementMaterial(screenSpace, msdf, textAttibutes) {
    const hash = (screenSpace && 1 << 0) | (msdf && 1 << 1) | (textAttibutes && 1 << 2);
    let material = this._defaultTextMaterials[hash];
    if (material) {
      return material;
    }
    let name = "TextMaterial";
    material = new StandardMaterial();
    if (msdf) {
      material.msdfMap = this._defaultTexture;
      material.msdfTextAttribute = textAttibutes;
      material.emissive.set(1, 1, 1);
    } else {
      name = "Bitmap" + name;
      material.emissive.set(0.5, 0.5, 0.5); // set to non-(1,1,1) so that tint is actually applied
      material.emissiveMap = this._defaultTexture;
      material.emissiveTint = true;
      material.opacityMap = this._defaultTexture;
      material.opacityMapChannel = 'a';
    }
    if (screenSpace) {
      name = 'ScreenSpace' + name;
      material.depthTest = false;
    }

    // The material name can be:
    //  defaultTextMaterial
    //  defaultBitmapTextMaterial
    //  defaultScreenSpaceTextMaterial
    //  defaultScreenSpaceBitmapTextMaterial
    material.name = 'default' + name;
    material.useLighting = false;
    material.useGammaTonemap = false;
    material.useFog = false;
    material.useSkybox = false;
    material.diffuse.set(0, 0, 0); // black diffuse color to prevent ambient light being included
    material.opacity = 0.5;
    material.blendType = BLEND_PREMULTIPLIED;
    material.depthWrite = false;
    material.emissiveVertexColor = true;
    material.update();
    this._defaultTextMaterials[hash] = material;
    return material;
  }
  _createBaseImageMaterial() {
    const material = new StandardMaterial();
    material.diffuse.set(0, 0, 0); // black diffuse color to prevent ambient light being included
    material.emissive.set(0.5, 0.5, 0.5); // use non-white to compile shader correctly
    material.emissiveMap = this._defaultTexture;
    material.emissiveTint = true;
    material.opacityMap = this._defaultTexture;
    material.opacityMapChannel = 'a';
    material.opacityTint = true;
    material.opacity = 0; // use non-1 opacity to compile shader correctly
    material.useLighting = false;
    material.useGammaTonemap = false;
    material.useFog = false;
    material.useSkybox = false;
    material.blendType = BLEND_PREMULTIPLIED;
    material.depthWrite = false;
    return material;
  }
  getImageElementMaterial(screenSpace, mask, nineSliced, nineSliceTiled) {
    /* eslint-disable no-else-return */
    if (screenSpace) {
      if (mask) {
        if (nineSliced) {
          if (!this.defaultScreenSpaceImageMask9SlicedMaterial) {
            this.defaultScreenSpaceImageMask9SlicedMaterial = this._createBaseImageMaterial();
            this.defaultScreenSpaceImageMask9SlicedMaterial.name = 'defaultScreenSpaceImageMask9SlicedMaterial';
            this.defaultScreenSpaceImageMask9SlicedMaterial.nineSlicedMode = SPRITE_RENDERMODE_SLICED;
            this.defaultScreenSpaceImageMask9SlicedMaterial.depthTest = false;
            this.defaultScreenSpaceImageMask9SlicedMaterial.alphaTest = 1;
            this.defaultScreenSpaceImageMask9SlicedMaterial.redWrite = false;
            this.defaultScreenSpaceImageMask9SlicedMaterial.greenWrite = false;
            this.defaultScreenSpaceImageMask9SlicedMaterial.blueWrite = false;
            this.defaultScreenSpaceImageMask9SlicedMaterial.alphaWrite = false;
            this.defaultScreenSpaceImageMask9SlicedMaterial.update();
            this.defaultImageMaterials.push(this.defaultScreenSpaceImageMask9SlicedMaterial);
          }
          return this.defaultScreenSpaceImageMask9SlicedMaterial;
        } else if (nineSliceTiled) {
          if (!this.defaultScreenSpaceImageMask9TiledMaterial) {
            this.defaultScreenSpaceImageMask9TiledMaterial = this.defaultScreenSpaceImage9TiledMaterial.clone();
            this.defaultScreenSpaceImageMask9TiledMaterial.name = 'defaultScreenSpaceImageMask9TiledMaterial';
            this.defaultScreenSpaceImageMask9TiledMaterial.nineSlicedMode = SPRITE_RENDERMODE_TILED;
            this.defaultScreenSpaceImageMask9TiledMaterial.depthTest = false;
            this.defaultScreenSpaceImageMask9TiledMaterial.alphaTest = 1;
            this.defaultScreenSpaceImageMask9TiledMaterial.redWrite = false;
            this.defaultScreenSpaceImageMask9TiledMaterial.greenWrite = false;
            this.defaultScreenSpaceImageMask9TiledMaterial.blueWrite = false;
            this.defaultScreenSpaceImageMask9TiledMaterial.alphaWrite = false;
            this.defaultScreenSpaceImageMask9TiledMaterial.update();
            this.defaultImageMaterials.push(this.defaultScreenSpaceImageMask9TiledMaterial);
          }
          return this.defaultScreenSpaceImageMask9TiledMaterial;
        } else {
          if (!this.defaultScreenSpaceImageMaskMaterial) {
            this.defaultScreenSpaceImageMaskMaterial = this._createBaseImageMaterial();
            this.defaultScreenSpaceImageMaskMaterial.name = 'defaultScreenSpaceImageMaskMaterial';
            this.defaultScreenSpaceImageMaskMaterial.depthTest = false;
            this.defaultScreenSpaceImageMaskMaterial.alphaTest = 1;
            this.defaultScreenSpaceImageMaskMaterial.redWrite = false;
            this.defaultScreenSpaceImageMaskMaterial.greenWrite = false;
            this.defaultScreenSpaceImageMaskMaterial.blueWrite = false;
            this.defaultScreenSpaceImageMaskMaterial.alphaWrite = false;
            this.defaultScreenSpaceImageMaskMaterial.update();
            this.defaultImageMaterials.push(this.defaultScreenSpaceImageMaskMaterial);
          }
          return this.defaultScreenSpaceImageMaskMaterial;
        }
      } else {
        if (nineSliced) {
          if (!this.defaultScreenSpaceImage9SlicedMaterial) {
            this.defaultScreenSpaceImage9SlicedMaterial = this._createBaseImageMaterial();
            this.defaultScreenSpaceImage9SlicedMaterial.name = 'defaultScreenSpaceImage9SlicedMaterial';
            this.defaultScreenSpaceImage9SlicedMaterial.nineSlicedMode = SPRITE_RENDERMODE_SLICED;
            this.defaultScreenSpaceImage9SlicedMaterial.depthTest = false;
            this.defaultScreenSpaceImage9SlicedMaterial.update();
            this.defaultImageMaterials.push(this.defaultScreenSpaceImage9SlicedMaterial);
          }
          return this.defaultScreenSpaceImage9SlicedMaterial;
        } else if (nineSliceTiled) {
          if (!this.defaultScreenSpaceImage9TiledMaterial) {
            this.defaultScreenSpaceImage9TiledMaterial = this._createBaseImageMaterial();
            this.defaultScreenSpaceImage9TiledMaterial.name = 'defaultScreenSpaceImage9TiledMaterial';
            this.defaultScreenSpaceImage9TiledMaterial.nineSlicedMode = SPRITE_RENDERMODE_TILED;
            this.defaultScreenSpaceImage9TiledMaterial.depthTest = false;
            this.defaultScreenSpaceImage9TiledMaterial.update();
            this.defaultImageMaterials.push(this.defaultScreenSpaceImage9TiledMaterial);
          }
          return this.defaultScreenSpaceImage9TiledMaterial;
        } else {
          if (!this.defaultScreenSpaceImageMaterial) {
            this.defaultScreenSpaceImageMaterial = this._createBaseImageMaterial();
            this.defaultScreenSpaceImageMaterial.name = 'defaultScreenSpaceImageMaterial';
            this.defaultScreenSpaceImageMaterial.depthTest = false;
            this.defaultScreenSpaceImageMaterial.update();
            this.defaultImageMaterials.push(this.defaultScreenSpaceImageMaterial);
          }
          return this.defaultScreenSpaceImageMaterial;
        }
      }
    } else {
      if (mask) {
        if (nineSliced) {
          if (!this.defaultImage9SlicedMaskMaterial) {
            this.defaultImage9SlicedMaskMaterial = this._createBaseImageMaterial();
            this.defaultImage9SlicedMaskMaterial.name = 'defaultImage9SlicedMaskMaterial';
            this.defaultImage9SlicedMaskMaterial.nineSlicedMode = SPRITE_RENDERMODE_SLICED;
            this.defaultImage9SlicedMaskMaterial.alphaTest = 1;
            this.defaultImage9SlicedMaskMaterial.redWrite = false;
            this.defaultImage9SlicedMaskMaterial.greenWrite = false;
            this.defaultImage9SlicedMaskMaterial.blueWrite = false;
            this.defaultImage9SlicedMaskMaterial.alphaWrite = false;
            this.defaultImage9SlicedMaskMaterial.update();
            this.defaultImageMaterials.push(this.defaultImage9SlicedMaskMaterial);
          }
          return this.defaultImage9SlicedMaskMaterial;
        } else if (nineSliceTiled) {
          if (!this.defaultImage9TiledMaskMaterial) {
            this.defaultImage9TiledMaskMaterial = this._createBaseImageMaterial();
            this.defaultImage9TiledMaskMaterial.name = 'defaultImage9TiledMaskMaterial';
            this.defaultImage9TiledMaskMaterial.nineSlicedMode = SPRITE_RENDERMODE_TILED;
            this.defaultImage9TiledMaskMaterial.alphaTest = 1;
            this.defaultImage9TiledMaskMaterial.redWrite = false;
            this.defaultImage9TiledMaskMaterial.greenWrite = false;
            this.defaultImage9TiledMaskMaterial.blueWrite = false;
            this.defaultImage9TiledMaskMaterial.alphaWrite = false;
            this.defaultImage9TiledMaskMaterial.update();
            this.defaultImageMaterials.push(this.defaultImage9TiledMaskMaterial);
          }
          return this.defaultImage9TiledMaskMaterial;
        } else {
          if (!this.defaultImageMaskMaterial) {
            this.defaultImageMaskMaterial = this._createBaseImageMaterial();
            this.defaultImageMaskMaterial.name = 'defaultImageMaskMaterial';
            this.defaultImageMaskMaterial.alphaTest = 1;
            this.defaultImageMaskMaterial.redWrite = false;
            this.defaultImageMaskMaterial.greenWrite = false;
            this.defaultImageMaskMaterial.blueWrite = false;
            this.defaultImageMaskMaterial.alphaWrite = false;
            this.defaultImageMaskMaterial.update();
            this.defaultImageMaterials.push(this.defaultImageMaskMaterial);
          }
          return this.defaultImageMaskMaterial;
        }
      } else {
        if (nineSliced) {
          if (!this.defaultImage9SlicedMaterial) {
            this.defaultImage9SlicedMaterial = this._createBaseImageMaterial();
            this.defaultImage9SlicedMaterial.name = 'defaultImage9SlicedMaterial';
            this.defaultImage9SlicedMaterial.nineSlicedMode = SPRITE_RENDERMODE_SLICED;
            this.defaultImage9SlicedMaterial.update();
            this.defaultImageMaterials.push(this.defaultImage9SlicedMaterial);
          }
          return this.defaultImage9SlicedMaterial;
        } else if (nineSliceTiled) {
          if (!this.defaultImage9TiledMaterial) {
            this.defaultImage9TiledMaterial = this._createBaseImageMaterial();
            this.defaultImage9TiledMaterial.name = 'defaultImage9TiledMaterial';
            this.defaultImage9TiledMaterial.nineSlicedMode = SPRITE_RENDERMODE_TILED;
            this.defaultImage9TiledMaterial.update();
            this.defaultImageMaterials.push(this.defaultImage9TiledMaterial);
          }
          return this.defaultImage9TiledMaterial;
        } else {
          if (!this.defaultImageMaterial) {
            this.defaultImageMaterial = this._createBaseImageMaterial();
            this.defaultImageMaterial.name = 'defaultImageMaterial';
            this.defaultImageMaterial.update();
            this.defaultImageMaterials.push(this.defaultImageMaterial);
          }
          return this.defaultImageMaterial;
        }
      }
    }
    /* eslint-enable no-else-return */
  }

  registerUnicodeConverter(func) {
    this._unicodeConverter = func;
  }
  registerRtlReorder(func) {
    this._rtlReorder = func;
  }
  getUnicodeConverter() {
    return this._unicodeConverter;
  }
  getRtlReorder() {
    return this._rtlReorder;
  }
}
Component._buildAccessors(ElementComponent.prototype, _schema);

export { ElementComponentSystem };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3lzdGVtLmpzIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi9zcmMvZnJhbWV3b3JrL2NvbXBvbmVudHMvZWxlbWVudC9zeXN0ZW0uanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQ29sb3IgfSBmcm9tICcuLi8uLi8uLi9jb3JlL21hdGgvY29sb3IuanMnO1xuaW1wb3J0IHsgVmVjMiB9IGZyb20gJy4uLy4uLy4uL2NvcmUvbWF0aC92ZWMyLmpzJztcbmltcG9ydCB7IFZlYzQgfSBmcm9tICcuLi8uLi8uLi9jb3JlL21hdGgvdmVjNC5qcyc7XG5cbmltcG9ydCB7XG4gICAgUElYRUxGT1JNQVRfUkdCQThcbn0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZ3JhcGhpY3MvY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IFRleHR1cmUgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9ncmFwaGljcy90ZXh0dXJlLmpzJztcblxuaW1wb3J0IHsgQkxFTkRfUFJFTVVMVElQTElFRCwgU1BSSVRFX1JFTkRFUk1PREVfU0xJQ0VELCBTUFJJVEVfUkVOREVSTU9ERV9USUxFRCB9IGZyb20gJy4uLy4uLy4uL3NjZW5lL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZE1hdGVyaWFsIH0gZnJvbSAnLi4vLi4vLi4vc2NlbmUvbWF0ZXJpYWxzL3N0YW5kYXJkLW1hdGVyaWFsLmpzJztcblxuaW1wb3J0IHsgQ29tcG9uZW50IH0gZnJvbSAnLi4vY29tcG9uZW50LmpzJztcbmltcG9ydCB7IENvbXBvbmVudFN5c3RlbSB9IGZyb20gJy4uL3N5c3RlbS5qcyc7XG5cbmltcG9ydCB7IEVMRU1FTlRUWVBFX0lNQUdFLCBFTEVNRU5UVFlQRV9URVhUIH0gZnJvbSAnLi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgRWxlbWVudENvbXBvbmVudCB9IGZyb20gJy4vY29tcG9uZW50LmpzJztcbmltcG9ydCB7IEVsZW1lbnRDb21wb25lbnREYXRhIH0gZnJvbSAnLi9kYXRhLmpzJztcblxuY29uc3QgX3NjaGVtYSA9IFsnZW5hYmxlZCddO1xuXG4vKipcbiAqIE1hbmFnZXMgY3JlYXRpb24gb2Yge0BsaW5rIEVsZW1lbnRDb21wb25lbnR9cy5cbiAqXG4gKiBAYXVnbWVudHMgQ29tcG9uZW50U3lzdGVtXG4gKiBAY2F0ZWdvcnkgVXNlciBJbnRlcmZhY2VcbiAqL1xuY2xhc3MgRWxlbWVudENvbXBvbmVudFN5c3RlbSBleHRlbmRzIENvbXBvbmVudFN5c3RlbSB7XG4gICAgLyoqXG4gICAgICogQ3JlYXRlIGEgbmV3IEVsZW1lbnRDb21wb25lbnRTeXN0ZW0gaW5zdGFuY2UuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi4vLi4vYXBwLWJhc2UuanMnKS5BcHBCYXNlfSBhcHAgLSBUaGUgYXBwbGljYXRpb24uXG4gICAgICogQGhpZGVjb25zdHJ1Y3RvclxuICAgICAqL1xuICAgIGNvbnN0cnVjdG9yKGFwcCkge1xuICAgICAgICBzdXBlcihhcHApO1xuXG4gICAgICAgIHRoaXMuaWQgPSAnZWxlbWVudCc7XG5cbiAgICAgICAgdGhpcy5Db21wb25lbnRUeXBlID0gRWxlbWVudENvbXBvbmVudDtcbiAgICAgICAgdGhpcy5EYXRhVHlwZSA9IEVsZW1lbnRDb21wb25lbnREYXRhO1xuXG4gICAgICAgIHRoaXMuc2NoZW1hID0gX3NjaGVtYTtcbiAgICAgICAgdGhpcy5fdW5pY29kZUNvbnZlcnRlciA9IG51bGw7XG4gICAgICAgIHRoaXMuX3J0bFJlb3JkZXIgPSBudWxsO1xuXG4gICAgICAgIC8vIGRlZmF1bHQgdGV4dHVyZSAtIG1ha2Ugd2hpdGUgc28gd2UgY2FuIHRpbnQgaXQgd2l0aCBlbWlzc2l2ZSBjb2xvclxuICAgICAgICB0aGlzLl9kZWZhdWx0VGV4dHVyZSA9IG5ldyBUZXh0dXJlKGFwcC5ncmFwaGljc0RldmljZSwge1xuICAgICAgICAgICAgd2lkdGg6IDEsXG4gICAgICAgICAgICBoZWlnaHQ6IDEsXG4gICAgICAgICAgICBmb3JtYXQ6IFBJWEVMRk9STUFUX1JHQkE4LFxuICAgICAgICAgICAgbmFtZTogJ2VsZW1lbnQtc3lzdGVtJ1xuICAgICAgICB9KTtcbiAgICAgICAgY29uc3QgcGl4ZWxzID0gdGhpcy5fZGVmYXVsdFRleHR1cmUubG9jaygpO1xuICAgICAgICBjb25zdCBwaXhlbERhdGEgPSBuZXcgVWludDhBcnJheSg0KTtcbiAgICAgICAgcGl4ZWxEYXRhWzBdID0gMjU1LjA7XG4gICAgICAgIHBpeGVsRGF0YVsxXSA9IDI1NS4wO1xuICAgICAgICBwaXhlbERhdGFbMl0gPSAyNTUuMDtcbiAgICAgICAgcGl4ZWxEYXRhWzNdID0gMjU1LjA7XG4gICAgICAgIHBpeGVscy5zZXQocGl4ZWxEYXRhKTtcbiAgICAgICAgdGhpcy5fZGVmYXVsdFRleHR1cmUudW5sb2NrKCk7XG5cbiAgICAgICAgLy8gaW1hZ2UgZWxlbWVudCBtYXRlcmlhbHMgY3JlYXRlZCBvbiBkZW1hbmQgYnkgZ2V0SW1hZ2VFbGVtZW50TWF0ZXJpYWwoKVxuICAgICAgICB0aGlzLmRlZmF1bHRJbWFnZU1hdGVyaWFsID0gbnVsbDtcbiAgICAgICAgdGhpcy5kZWZhdWx0SW1hZ2U5U2xpY2VkTWF0ZXJpYWwgPSBudWxsO1xuICAgICAgICB0aGlzLmRlZmF1bHRJbWFnZTlUaWxlZE1hdGVyaWFsID0gbnVsbDtcbiAgICAgICAgdGhpcy5kZWZhdWx0SW1hZ2VNYXNrTWF0ZXJpYWwgPSBudWxsO1xuICAgICAgICB0aGlzLmRlZmF1bHRJbWFnZTlTbGljZWRNYXNrTWF0ZXJpYWwgPSBudWxsO1xuICAgICAgICB0aGlzLmRlZmF1bHRJbWFnZTlUaWxlZE1hc2tNYXRlcmlhbCA9IG51bGw7XG4gICAgICAgIHRoaXMuZGVmYXVsdFNjcmVlblNwYWNlSW1hZ2VNYXRlcmlhbCA9IG51bGw7XG4gICAgICAgIHRoaXMuZGVmYXVsdFNjcmVlblNwYWNlSW1hZ2U5U2xpY2VkTWF0ZXJpYWwgPSBudWxsO1xuICAgICAgICB0aGlzLmRlZmF1bHRTY3JlZW5TcGFjZUltYWdlOVRpbGVkTWF0ZXJpYWwgPSBudWxsO1xuICAgICAgICB0aGlzLmRlZmF1bHRTY3JlZW5TcGFjZUltYWdlTWFzazlTbGljZWRNYXRlcmlhbCA9IG51bGw7XG4gICAgICAgIHRoaXMuZGVmYXVsdFNjcmVlblNwYWNlSW1hZ2VNYXNrOVRpbGVkTWF0ZXJpYWwgPSBudWxsO1xuICAgICAgICB0aGlzLmRlZmF1bHRTY3JlZW5TcGFjZUltYWdlTWFza01hdGVyaWFsID0gbnVsbDtcblxuICAgICAgICAvLyB0ZXh0IGVsZW1lbnQgbWF0ZXJpYWxzIGNyZWF0ZWQgb24gZGVtYW5kIGJ5IGdldFRleHRFbGVtZW50TWF0ZXJpYWwoKVxuICAgICAgICB0aGlzLl9kZWZhdWx0VGV4dE1hdGVyaWFscyA9IHt9O1xuXG4gICAgICAgIHRoaXMuZGVmYXVsdEltYWdlTWF0ZXJpYWxzID0gW107XG5cbiAgICAgICAgdGhpcy5vbignYmVmb3JlcmVtb3ZlJywgdGhpcy5vblJlbW92ZUNvbXBvbmVudCwgdGhpcyk7XG4gICAgfVxuXG4gICAgZGVzdHJveSgpIHtcbiAgICAgICAgc3VwZXIuZGVzdHJveSgpO1xuXG4gICAgICAgIHRoaXMuX2RlZmF1bHRUZXh0dXJlLmRlc3Ryb3koKTtcbiAgICB9XG5cbiAgICBpbml0aWFsaXplQ29tcG9uZW50RGF0YShjb21wb25lbnQsIGRhdGEsIHByb3BlcnRpZXMpIHtcbiAgICAgICAgY29tcG9uZW50Ll9iZWluZ0luaXRpYWxpemVkID0gdHJ1ZTtcblxuICAgICAgICBpZiAoZGF0YS5hbmNob3IgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgaWYgKGRhdGEuYW5jaG9yIGluc3RhbmNlb2YgVmVjNCkge1xuICAgICAgICAgICAgICAgIGNvbXBvbmVudC5hbmNob3IuY29weShkYXRhLmFuY2hvcik7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbXBvbmVudC5hbmNob3Iuc2V0KGRhdGEuYW5jaG9yWzBdLCBkYXRhLmFuY2hvclsxXSwgZGF0YS5hbmNob3JbMl0sIGRhdGEuYW5jaG9yWzNdKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChkYXRhLnBpdm90ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGlmIChkYXRhLnBpdm90IGluc3RhbmNlb2YgVmVjMikge1xuICAgICAgICAgICAgICAgIGNvbXBvbmVudC5waXZvdC5jb3B5KGRhdGEucGl2b3QpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb21wb25lbnQucGl2b3Quc2V0KGRhdGEucGl2b3RbMF0sIGRhdGEucGl2b3RbMV0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgY29uc3Qgc3BsaXRIb3JBbmNob3JzID0gTWF0aC5hYnMoY29tcG9uZW50LmFuY2hvci54IC0gY29tcG9uZW50LmFuY2hvci56KSA+IDAuMDAxO1xuICAgICAgICBjb25zdCBzcGxpdFZlckFuY2hvcnMgPSBNYXRoLmFicyhjb21wb25lbnQuYW5jaG9yLnkgLSBjb21wb25lbnQuYW5jaG9yLncpID4gMC4wMDE7XG4gICAgICAgIGxldCBfbWFyZ2luQ2hhbmdlID0gZmFsc2U7XG4gICAgICAgIGxldCBjb2xvcjtcblxuICAgICAgICBpZiAoZGF0YS5tYXJnaW4gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgaWYgKGRhdGEubWFyZ2luIGluc3RhbmNlb2YgVmVjNCkge1xuICAgICAgICAgICAgICAgIGNvbXBvbmVudC5tYXJnaW4uY29weShkYXRhLm1hcmdpbik7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbXBvbmVudC5fbWFyZ2luLnNldChkYXRhLm1hcmdpblswXSwgZGF0YS5tYXJnaW5bMV0sIGRhdGEubWFyZ2luWzJdLCBkYXRhLm1hcmdpblszXSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIF9tYXJnaW5DaGFuZ2UgPSB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGRhdGEubGVmdCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBjb21wb25lbnQuX21hcmdpbi54ID0gZGF0YS5sZWZ0O1xuICAgICAgICAgICAgX21hcmdpbkNoYW5nZSA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGRhdGEuYm90dG9tICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGNvbXBvbmVudC5fbWFyZ2luLnkgPSBkYXRhLmJvdHRvbTtcbiAgICAgICAgICAgIF9tYXJnaW5DaGFuZ2UgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGlmIChkYXRhLnJpZ2h0ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGNvbXBvbmVudC5fbWFyZ2luLnogPSBkYXRhLnJpZ2h0O1xuICAgICAgICAgICAgX21hcmdpbkNoYW5nZSA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGRhdGEudG9wICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGNvbXBvbmVudC5fbWFyZ2luLncgPSBkYXRhLnRvcDtcbiAgICAgICAgICAgIF9tYXJnaW5DaGFuZ2UgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGlmIChfbWFyZ2luQ2hhbmdlKSB7XG4gICAgICAgICAgICAvLyBmb3JjZSB1cGRhdGVcbiAgICAgICAgICAgIGNvbXBvbmVudC5tYXJnaW4gPSBjb21wb25lbnQuX21hcmdpbjtcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCBzaG91bGRGb3JjZVNldEFuY2hvciA9IGZhbHNlO1xuXG4gICAgICAgIGlmIChkYXRhLndpZHRoICE9PSB1bmRlZmluZWQgJiYgIXNwbGl0SG9yQW5jaG9ycykge1xuICAgICAgICAgICAgLy8gZm9yY2UgdXBkYXRlXG4gICAgICAgICAgICBjb21wb25lbnQud2lkdGggPSBkYXRhLndpZHRoO1xuICAgICAgICB9IGVsc2UgaWYgKHNwbGl0SG9yQW5jaG9ycykge1xuICAgICAgICAgICAgc2hvdWxkRm9yY2VTZXRBbmNob3IgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGlmIChkYXRhLmhlaWdodCAhPT0gdW5kZWZpbmVkICYmICFzcGxpdFZlckFuY2hvcnMpIHtcbiAgICAgICAgICAgIC8vIGZvcmNlIHVwZGF0ZVxuICAgICAgICAgICAgY29tcG9uZW50LmhlaWdodCA9IGRhdGEuaGVpZ2h0O1xuICAgICAgICB9IGVsc2UgaWYgKHNwbGl0VmVyQW5jaG9ycykge1xuICAgICAgICAgICAgc2hvdWxkRm9yY2VTZXRBbmNob3IgPSB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHNob3VsZEZvcmNlU2V0QW5jaG9yKSB7XG4gICAgICAgICAgICAvKiBlc2xpbnQtZGlzYWJsZSBuby1zZWxmLWFzc2lnbiAqL1xuICAgICAgICAgICAgLy8gZm9yY2UgdXBkYXRlXG4gICAgICAgICAgICBjb21wb25lbnQuYW5jaG9yID0gY29tcG9uZW50LmFuY2hvcjtcbiAgICAgICAgICAgIC8qIGVzbGludC1lbmFibGUgbm8tc2VsZi1hc3NpZ24gKi9cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChkYXRhLmVuYWJsZWQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgY29tcG9uZW50LmVuYWJsZWQgPSBkYXRhLmVuYWJsZWQ7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoZGF0YS51c2VJbnB1dCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBjb21wb25lbnQudXNlSW5wdXQgPSBkYXRhLnVzZUlucHV0O1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGRhdGEuZml0TW9kZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBjb21wb25lbnQuZml0TW9kZSA9IGRhdGEuZml0TW9kZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbXBvbmVudC5iYXRjaEdyb3VwSWQgPSBkYXRhLmJhdGNoR3JvdXBJZCA9PT0gdW5kZWZpbmVkIHx8IGRhdGEuYmF0Y2hHcm91cElkID09PSBudWxsID8gLTEgOiBkYXRhLmJhdGNoR3JvdXBJZDtcblxuICAgICAgICBpZiAoZGF0YS5sYXllcnMgJiYgQXJyYXkuaXNBcnJheShkYXRhLmxheWVycykpIHtcbiAgICAgICAgICAgIGNvbXBvbmVudC5sYXllcnMgPSBkYXRhLmxheWVycy5zbGljZSgwKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChkYXRhLnR5cGUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgY29tcG9uZW50LnR5cGUgPSBkYXRhLnR5cGU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoY29tcG9uZW50LnR5cGUgPT09IEVMRU1FTlRUWVBFX0lNQUdFKSB7XG4gICAgICAgICAgICBpZiAoZGF0YS5yZWN0ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBjb21wb25lbnQucmVjdCA9IGRhdGEucmVjdDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChkYXRhLmNvbG9yICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBjb2xvciA9IGRhdGEuY29sb3I7XG4gICAgICAgICAgICAgICAgaWYgKCEoY29sb3IgaW5zdGFuY2VvZiBDb2xvcikpIHtcbiAgICAgICAgICAgICAgICAgICAgY29sb3IgPSBuZXcgQ29sb3IoZGF0YS5jb2xvclswXSwgZGF0YS5jb2xvclsxXSwgZGF0YS5jb2xvclsyXSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbXBvbmVudC5jb2xvciA9IGNvbG9yO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoZGF0YS5vcGFjaXR5ICE9PSB1bmRlZmluZWQpIGNvbXBvbmVudC5vcGFjaXR5ID0gZGF0YS5vcGFjaXR5O1xuICAgICAgICAgICAgaWYgKGRhdGEudGV4dHVyZUFzc2V0ICE9PSB1bmRlZmluZWQpIGNvbXBvbmVudC50ZXh0dXJlQXNzZXQgPSBkYXRhLnRleHR1cmVBc3NldDtcbiAgICAgICAgICAgIGlmIChkYXRhLnRleHR1cmUpIGNvbXBvbmVudC50ZXh0dXJlID0gZGF0YS50ZXh0dXJlO1xuICAgICAgICAgICAgaWYgKGRhdGEuc3ByaXRlQXNzZXQgIT09IHVuZGVmaW5lZCkgY29tcG9uZW50LnNwcml0ZUFzc2V0ID0gZGF0YS5zcHJpdGVBc3NldDtcbiAgICAgICAgICAgIGlmIChkYXRhLnNwcml0ZSkgY29tcG9uZW50LnNwcml0ZSA9IGRhdGEuc3ByaXRlO1xuICAgICAgICAgICAgaWYgKGRhdGEuc3ByaXRlRnJhbWUgIT09IHVuZGVmaW5lZCkgY29tcG9uZW50LnNwcml0ZUZyYW1lID0gZGF0YS5zcHJpdGVGcmFtZTtcbiAgICAgICAgICAgIGlmIChkYXRhLnBpeGVsc1BlclVuaXQgIT09IHVuZGVmaW5lZCAmJiBkYXRhLnBpeGVsc1BlclVuaXQgIT09IG51bGwpIGNvbXBvbmVudC5waXhlbHNQZXJVbml0ID0gZGF0YS5waXhlbHNQZXJVbml0O1xuICAgICAgICAgICAgaWYgKGRhdGEubWF0ZXJpYWxBc3NldCAhPT0gdW5kZWZpbmVkKSBjb21wb25lbnQubWF0ZXJpYWxBc3NldCA9IGRhdGEubWF0ZXJpYWxBc3NldDtcbiAgICAgICAgICAgIGlmIChkYXRhLm1hdGVyaWFsKSBjb21wb25lbnQubWF0ZXJpYWwgPSBkYXRhLm1hdGVyaWFsO1xuXG4gICAgICAgICAgICBpZiAoZGF0YS5tYXNrICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBjb21wb25lbnQubWFzayA9IGRhdGEubWFzaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChjb21wb25lbnQudHlwZSA9PT0gRUxFTUVOVFRZUEVfVEVYVCkge1xuICAgICAgICAgICAgaWYgKGRhdGEuYXV0b1dpZHRoICE9PSB1bmRlZmluZWQpIGNvbXBvbmVudC5hdXRvV2lkdGggPSBkYXRhLmF1dG9XaWR0aDtcbiAgICAgICAgICAgIGlmIChkYXRhLmF1dG9IZWlnaHQgIT09IHVuZGVmaW5lZCkgY29tcG9uZW50LmF1dG9IZWlnaHQgPSBkYXRhLmF1dG9IZWlnaHQ7XG4gICAgICAgICAgICBpZiAoZGF0YS5ydGxSZW9yZGVyICE9PSB1bmRlZmluZWQpIGNvbXBvbmVudC5ydGxSZW9yZGVyID0gZGF0YS5ydGxSZW9yZGVyO1xuICAgICAgICAgICAgaWYgKGRhdGEudW5pY29kZUNvbnZlcnRlciAhPT0gdW5kZWZpbmVkKSBjb21wb25lbnQudW5pY29kZUNvbnZlcnRlciA9IGRhdGEudW5pY29kZUNvbnZlcnRlcjtcbiAgICAgICAgICAgIGlmIChkYXRhLnRleHQgIT09IG51bGwgJiYgZGF0YS50ZXh0ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBjb21wb25lbnQudGV4dCA9IGRhdGEudGV4dDtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZGF0YS5rZXkgIT09IG51bGwgJiYgZGF0YS5rZXkgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIGNvbXBvbmVudC5rZXkgPSBkYXRhLmtleTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChkYXRhLmNvbG9yICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBjb2xvciA9IGRhdGEuY29sb3I7XG4gICAgICAgICAgICAgICAgaWYgKCEoY29sb3IgaW5zdGFuY2VvZiBDb2xvcikpIHtcbiAgICAgICAgICAgICAgICAgICAgY29sb3IgPSBuZXcgQ29sb3IoY29sb3JbMF0sIGNvbG9yWzFdLCBjb2xvclsyXSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbXBvbmVudC5jb2xvciA9IGNvbG9yO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGRhdGEub3BhY2l0eSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgY29tcG9uZW50Lm9wYWNpdHkgPSBkYXRhLm9wYWNpdHk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoZGF0YS5zcGFjaW5nICE9PSB1bmRlZmluZWQpIGNvbXBvbmVudC5zcGFjaW5nID0gZGF0YS5zcGFjaW5nO1xuICAgICAgICAgICAgaWYgKGRhdGEuZm9udFNpemUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIGNvbXBvbmVudC5mb250U2l6ZSA9IGRhdGEuZm9udFNpemU7XG4gICAgICAgICAgICAgICAgaWYgKCFkYXRhLmxpbmVIZWlnaHQpIGNvbXBvbmVudC5saW5lSGVpZ2h0ID0gZGF0YS5mb250U2l6ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChkYXRhLmxpbmVIZWlnaHQgIT09IHVuZGVmaW5lZCkgY29tcG9uZW50LmxpbmVIZWlnaHQgPSBkYXRhLmxpbmVIZWlnaHQ7XG4gICAgICAgICAgICBpZiAoZGF0YS5tYXhMaW5lcyAhPT0gdW5kZWZpbmVkKSBjb21wb25lbnQubWF4TGluZXMgPSBkYXRhLm1heExpbmVzO1xuICAgICAgICAgICAgaWYgKGRhdGEud3JhcExpbmVzICE9PSB1bmRlZmluZWQpIGNvbXBvbmVudC53cmFwTGluZXMgPSBkYXRhLndyYXBMaW5lcztcbiAgICAgICAgICAgIGlmIChkYXRhLm1pbkZvbnRTaXplICE9PSB1bmRlZmluZWQpIGNvbXBvbmVudC5taW5Gb250U2l6ZSA9IGRhdGEubWluRm9udFNpemU7XG4gICAgICAgICAgICBpZiAoZGF0YS5tYXhGb250U2l6ZSAhPT0gdW5kZWZpbmVkKSBjb21wb25lbnQubWF4Rm9udFNpemUgPSBkYXRhLm1heEZvbnRTaXplO1xuICAgICAgICAgICAgaWYgKGRhdGEuYXV0b0ZpdFdpZHRoKSBjb21wb25lbnQuYXV0b0ZpdFdpZHRoID0gZGF0YS5hdXRvRml0V2lkdGg7XG4gICAgICAgICAgICBpZiAoZGF0YS5hdXRvRml0SGVpZ2h0KSBjb21wb25lbnQuYXV0b0ZpdEhlaWdodCA9IGRhdGEuYXV0b0ZpdEhlaWdodDtcbiAgICAgICAgICAgIGlmIChkYXRhLmZvbnRBc3NldCAhPT0gdW5kZWZpbmVkKSBjb21wb25lbnQuZm9udEFzc2V0ID0gZGF0YS5mb250QXNzZXQ7XG4gICAgICAgICAgICBpZiAoZGF0YS5mb250ICE9PSB1bmRlZmluZWQpIGNvbXBvbmVudC5mb250ID0gZGF0YS5mb250O1xuICAgICAgICAgICAgaWYgKGRhdGEuYWxpZ25tZW50ICE9PSB1bmRlZmluZWQpIGNvbXBvbmVudC5hbGlnbm1lbnQgPSBkYXRhLmFsaWdubWVudDtcbiAgICAgICAgICAgIGlmIChkYXRhLm91dGxpbmVDb2xvciAhPT0gdW5kZWZpbmVkKSBjb21wb25lbnQub3V0bGluZUNvbG9yID0gZGF0YS5vdXRsaW5lQ29sb3I7XG4gICAgICAgICAgICBpZiAoZGF0YS5vdXRsaW5lVGhpY2tuZXNzICE9PSB1bmRlZmluZWQpIGNvbXBvbmVudC5vdXRsaW5lVGhpY2tuZXNzID0gZGF0YS5vdXRsaW5lVGhpY2tuZXNzO1xuICAgICAgICAgICAgaWYgKGRhdGEuc2hhZG93Q29sb3IgIT09IHVuZGVmaW5lZCkgY29tcG9uZW50LnNoYWRvd0NvbG9yID0gZGF0YS5zaGFkb3dDb2xvcjtcbiAgICAgICAgICAgIGlmIChkYXRhLnNoYWRvd09mZnNldCAhPT0gdW5kZWZpbmVkKSBjb21wb25lbnQuc2hhZG93T2Zmc2V0ID0gZGF0YS5zaGFkb3dPZmZzZXQ7XG4gICAgICAgICAgICBpZiAoZGF0YS5lbmFibGVNYXJrdXAgIT09IHVuZGVmaW5lZCkgY29tcG9uZW50LmVuYWJsZU1hcmt1cCA9IGRhdGEuZW5hYmxlTWFya3VwO1xuICAgICAgICB9XG4gICAgICAgIC8vIE9USEVSV0lTRTogZ3JvdXBcblxuICAgICAgICAvLyBmaW5kIHNjcmVlblxuICAgICAgICAvLyBkbyB0aGlzIGhlcmUgbm90IGluIGNvbnN0cnVjdG9yIHNvIHRoYXQgY29tcG9uZW50IGlzIGFkZGVkIHRvIHRoZSBlbnRpdHlcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gY29tcG9uZW50Ll9wYXJzZVVwVG9TY3JlZW4oKTtcbiAgICAgICAgaWYgKHJlc3VsdC5zY3JlZW4pIHtcbiAgICAgICAgICAgIGNvbXBvbmVudC5fdXBkYXRlU2NyZWVuKHJlc3VsdC5zY3JlZW4pO1xuICAgICAgICB9XG5cbiAgICAgICAgc3VwZXIuaW5pdGlhbGl6ZUNvbXBvbmVudERhdGEoY29tcG9uZW50LCBkYXRhLCBwcm9wZXJ0aWVzKTtcblxuICAgICAgICBjb21wb25lbnQuX2JlaW5nSW5pdGlhbGl6ZWQgPSBmYWxzZTtcblxuICAgICAgICBpZiAoY29tcG9uZW50LnR5cGUgPT09IEVMRU1FTlRUWVBFX0lNQUdFICYmIGNvbXBvbmVudC5faW1hZ2UuX21lc2hEaXJ0eSkge1xuICAgICAgICAgICAgY29tcG9uZW50Ll9pbWFnZS5fdXBkYXRlTWVzaChjb21wb25lbnQuX2ltYWdlLm1lc2gpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgb25SZW1vdmVDb21wb25lbnQoZW50aXR5LCBjb21wb25lbnQpIHtcbiAgICAgICAgY29tcG9uZW50Lm9uUmVtb3ZlKCk7XG4gICAgfVxuXG4gICAgY2xvbmVDb21wb25lbnQoZW50aXR5LCBjbG9uZSkge1xuICAgICAgICBjb25zdCBzb3VyY2UgPSBlbnRpdHkuZWxlbWVudDtcblxuICAgICAgICBjb25zdCBkYXRhID0ge1xuICAgICAgICAgICAgZW5hYmxlZDogc291cmNlLmVuYWJsZWQsXG4gICAgICAgICAgICB3aWR0aDogc291cmNlLndpZHRoLFxuICAgICAgICAgICAgaGVpZ2h0OiBzb3VyY2UuaGVpZ2h0LFxuICAgICAgICAgICAgYW5jaG9yOiBzb3VyY2UuYW5jaG9yLmNsb25lKCksXG4gICAgICAgICAgICBwaXZvdDogc291cmNlLnBpdm90LmNsb25lKCksXG4gICAgICAgICAgICBtYXJnaW46IHNvdXJjZS5tYXJnaW4uY2xvbmUoKSxcbiAgICAgICAgICAgIGFsaWdubWVudDogc291cmNlLmFsaWdubWVudCAmJiBzb3VyY2UuYWxpZ25tZW50LmNsb25lKCkgfHwgc291cmNlLmFsaWdubWVudCxcbiAgICAgICAgICAgIGF1dG9XaWR0aDogc291cmNlLmF1dG9XaWR0aCxcbiAgICAgICAgICAgIGF1dG9IZWlnaHQ6IHNvdXJjZS5hdXRvSGVpZ2h0LFxuICAgICAgICAgICAgdHlwZTogc291cmNlLnR5cGUsXG4gICAgICAgICAgICByZWN0OiBzb3VyY2UucmVjdCAmJiBzb3VyY2UucmVjdC5jbG9uZSgpIHx8IHNvdXJjZS5yZWN0LFxuICAgICAgICAgICAgcnRsUmVvcmRlcjogc291cmNlLnJ0bFJlb3JkZXIsXG4gICAgICAgICAgICB1bmljb2RlQ29udmVydGVyOiBzb3VyY2UudW5pY29kZUNvbnZlcnRlcixcbiAgICAgICAgICAgIG1hdGVyaWFsQXNzZXQ6IHNvdXJjZS5tYXRlcmlhbEFzc2V0LFxuICAgICAgICAgICAgbWF0ZXJpYWw6IHNvdXJjZS5tYXRlcmlhbCxcbiAgICAgICAgICAgIGNvbG9yOiBzb3VyY2UuY29sb3IgJiYgc291cmNlLmNvbG9yLmNsb25lKCkgfHwgc291cmNlLmNvbG9yLFxuICAgICAgICAgICAgb3BhY2l0eTogc291cmNlLm9wYWNpdHksXG4gICAgICAgICAgICB0ZXh0dXJlQXNzZXQ6IHNvdXJjZS50ZXh0dXJlQXNzZXQsXG4gICAgICAgICAgICB0ZXh0dXJlOiBzb3VyY2UudGV4dHVyZSxcbiAgICAgICAgICAgIHNwcml0ZUFzc2V0OiBzb3VyY2Uuc3ByaXRlQXNzZXQsXG4gICAgICAgICAgICBzcHJpdGU6IHNvdXJjZS5zcHJpdGUsXG4gICAgICAgICAgICBzcHJpdGVGcmFtZTogc291cmNlLnNwcml0ZUZyYW1lLFxuICAgICAgICAgICAgcGl4ZWxzUGVyVW5pdDogc291cmNlLnBpeGVsc1BlclVuaXQsXG4gICAgICAgICAgICBzcGFjaW5nOiBzb3VyY2Uuc3BhY2luZyxcbiAgICAgICAgICAgIGxpbmVIZWlnaHQ6IHNvdXJjZS5saW5lSGVpZ2h0LFxuICAgICAgICAgICAgd3JhcExpbmVzOiBzb3VyY2Uud3JhcExpbmVzLFxuICAgICAgICAgICAgbGF5ZXJzOiBzb3VyY2UubGF5ZXJzLFxuICAgICAgICAgICAgZm9udFNpemU6IHNvdXJjZS5mb250U2l6ZSxcbiAgICAgICAgICAgIG1pbkZvbnRTaXplOiBzb3VyY2UubWluRm9udFNpemUsXG4gICAgICAgICAgICBtYXhGb250U2l6ZTogc291cmNlLm1heEZvbnRTaXplLFxuICAgICAgICAgICAgYXV0b0ZpdFdpZHRoOiBzb3VyY2UuYXV0b0ZpdFdpZHRoLFxuICAgICAgICAgICAgYXV0b0ZpdEhlaWdodDogc291cmNlLmF1dG9GaXRIZWlnaHQsXG4gICAgICAgICAgICBtYXhMaW5lczogc291cmNlLm1heExpbmVzLFxuICAgICAgICAgICAgZm9udEFzc2V0OiBzb3VyY2UuZm9udEFzc2V0LFxuICAgICAgICAgICAgZm9udDogc291cmNlLmZvbnQsXG4gICAgICAgICAgICB1c2VJbnB1dDogc291cmNlLnVzZUlucHV0LFxuICAgICAgICAgICAgZml0TW9kZTogc291cmNlLmZpdE1vZGUsXG4gICAgICAgICAgICBiYXRjaEdyb3VwSWQ6IHNvdXJjZS5iYXRjaEdyb3VwSWQsXG4gICAgICAgICAgICBtYXNrOiBzb3VyY2UubWFzayxcbiAgICAgICAgICAgIG91dGxpbmVDb2xvcjogc291cmNlLm91dGxpbmVDb2xvciAmJiBzb3VyY2Uub3V0bGluZUNvbG9yLmNsb25lKCkgfHwgc291cmNlLm91dGxpbmVDb2xvcixcbiAgICAgICAgICAgIG91dGxpbmVUaGlja25lc3M6IHNvdXJjZS5vdXRsaW5lVGhpY2tuZXNzLFxuICAgICAgICAgICAgc2hhZG93Q29sb3I6IHNvdXJjZS5zaGFkb3dDb2xvciAmJiBzb3VyY2Uuc2hhZG93Q29sb3IuY2xvbmUoKSB8fCBzb3VyY2Uuc2hhZG93Q29sb3IsXG4gICAgICAgICAgICBzaGFkb3dPZmZzZXQ6IHNvdXJjZS5zaGFkb3dPZmZzZXQgJiYgc291cmNlLnNoYWRvd09mZnNldC5jbG9uZSgpIHx8IHNvdXJjZS5zaGFkb3dPZmZzZXQsXG4gICAgICAgICAgICBlbmFibGVNYXJrdXA6IHNvdXJjZS5lbmFibGVNYXJrdXBcbiAgICAgICAgfTtcblxuICAgICAgICBpZiAoc291cmNlLmtleSAhPT0gdW5kZWZpbmVkICYmIHNvdXJjZS5rZXkgIT09IG51bGwpIHtcbiAgICAgICAgICAgIGRhdGEua2V5ID0gc291cmNlLmtleTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGRhdGEudGV4dCA9IHNvdXJjZS50ZXh0O1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHRoaXMuYWRkQ29tcG9uZW50KGNsb25lLCBkYXRhKTtcbiAgICB9XG5cbiAgICBnZXRUZXh0RWxlbWVudE1hdGVyaWFsKHNjcmVlblNwYWNlLCBtc2RmLCB0ZXh0QXR0aWJ1dGVzKSB7XG4gICAgICAgIGNvbnN0IGhhc2ggPSAoc2NyZWVuU3BhY2UgJiYgKDEgPDwgMCkpIHxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgKG1zZGYgJiYgKDEgPDwgMSkpIHxcbiAgICAgICAgICAgICAgICAgKHRleHRBdHRpYnV0ZXMgJiYgKDEgPDwgMikpO1xuXG4gICAgICAgIGxldCBtYXRlcmlhbCA9IHRoaXMuX2RlZmF1bHRUZXh0TWF0ZXJpYWxzW2hhc2hdO1xuXG4gICAgICAgIGlmIChtYXRlcmlhbCkge1xuICAgICAgICAgICAgcmV0dXJuIG1hdGVyaWFsO1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IG5hbWUgPSBcIlRleHRNYXRlcmlhbFwiO1xuXG4gICAgICAgIG1hdGVyaWFsID0gbmV3IFN0YW5kYXJkTWF0ZXJpYWwoKTtcblxuICAgICAgICBpZiAobXNkZikge1xuICAgICAgICAgICAgbWF0ZXJpYWwubXNkZk1hcCA9IHRoaXMuX2RlZmF1bHRUZXh0dXJlO1xuICAgICAgICAgICAgbWF0ZXJpYWwubXNkZlRleHRBdHRyaWJ1dGUgPSB0ZXh0QXR0aWJ1dGVzO1xuICAgICAgICAgICAgbWF0ZXJpYWwuZW1pc3NpdmUuc2V0KDEsIDEsIDEpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbmFtZSA9IFwiQml0bWFwXCIgKyBuYW1lO1xuICAgICAgICAgICAgbWF0ZXJpYWwuZW1pc3NpdmUuc2V0KDAuNSwgMC41LCAwLjUpOyAvLyBzZXQgdG8gbm9uLSgxLDEsMSkgc28gdGhhdCB0aW50IGlzIGFjdHVhbGx5IGFwcGxpZWRcbiAgICAgICAgICAgIG1hdGVyaWFsLmVtaXNzaXZlTWFwID0gdGhpcy5fZGVmYXVsdFRleHR1cmU7XG4gICAgICAgICAgICBtYXRlcmlhbC5lbWlzc2l2ZVRpbnQgPSB0cnVlO1xuICAgICAgICAgICAgbWF0ZXJpYWwub3BhY2l0eU1hcCA9IHRoaXMuX2RlZmF1bHRUZXh0dXJlO1xuICAgICAgICAgICAgbWF0ZXJpYWwub3BhY2l0eU1hcENoYW5uZWwgPSAnYSc7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc2NyZWVuU3BhY2UpIHtcbiAgICAgICAgICAgIG5hbWUgPSAnU2NyZWVuU3BhY2UnICsgbmFtZTtcbiAgICAgICAgICAgIG1hdGVyaWFsLmRlcHRoVGVzdCA9IGZhbHNlO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gVGhlIG1hdGVyaWFsIG5hbWUgY2FuIGJlOlxuICAgICAgICAvLyAgZGVmYXVsdFRleHRNYXRlcmlhbFxuICAgICAgICAvLyAgZGVmYXVsdEJpdG1hcFRleHRNYXRlcmlhbFxuICAgICAgICAvLyAgZGVmYXVsdFNjcmVlblNwYWNlVGV4dE1hdGVyaWFsXG4gICAgICAgIC8vICBkZWZhdWx0U2NyZWVuU3BhY2VCaXRtYXBUZXh0TWF0ZXJpYWxcbiAgICAgICAgbWF0ZXJpYWwubmFtZSA9ICdkZWZhdWx0JyArIG5hbWU7XG4gICAgICAgIG1hdGVyaWFsLnVzZUxpZ2h0aW5nID0gZmFsc2U7XG4gICAgICAgIG1hdGVyaWFsLnVzZUdhbW1hVG9uZW1hcCA9IGZhbHNlO1xuICAgICAgICBtYXRlcmlhbC51c2VGb2cgPSBmYWxzZTtcbiAgICAgICAgbWF0ZXJpYWwudXNlU2t5Ym94ID0gZmFsc2U7XG4gICAgICAgIG1hdGVyaWFsLmRpZmZ1c2Uuc2V0KDAsIDAsIDApOyAvLyBibGFjayBkaWZmdXNlIGNvbG9yIHRvIHByZXZlbnQgYW1iaWVudCBsaWdodCBiZWluZyBpbmNsdWRlZFxuICAgICAgICBtYXRlcmlhbC5vcGFjaXR5ID0gMC41O1xuICAgICAgICBtYXRlcmlhbC5ibGVuZFR5cGUgPSBCTEVORF9QUkVNVUxUSVBMSUVEO1xuICAgICAgICBtYXRlcmlhbC5kZXB0aFdyaXRlID0gZmFsc2U7XG4gICAgICAgIG1hdGVyaWFsLmVtaXNzaXZlVmVydGV4Q29sb3IgPSB0cnVlO1xuICAgICAgICBtYXRlcmlhbC51cGRhdGUoKTtcblxuICAgICAgICB0aGlzLl9kZWZhdWx0VGV4dE1hdGVyaWFsc1toYXNoXSA9IG1hdGVyaWFsO1xuXG4gICAgICAgIHJldHVybiBtYXRlcmlhbDtcbiAgICB9XG5cbiAgICBfY3JlYXRlQmFzZUltYWdlTWF0ZXJpYWwoKSB7XG4gICAgICAgIGNvbnN0IG1hdGVyaWFsID0gbmV3IFN0YW5kYXJkTWF0ZXJpYWwoKTtcblxuICAgICAgICBtYXRlcmlhbC5kaWZmdXNlLnNldCgwLCAwLCAwKTsgLy8gYmxhY2sgZGlmZnVzZSBjb2xvciB0byBwcmV2ZW50IGFtYmllbnQgbGlnaHQgYmVpbmcgaW5jbHVkZWRcbiAgICAgICAgbWF0ZXJpYWwuZW1pc3NpdmUuc2V0KDAuNSwgMC41LCAwLjUpOyAvLyB1c2Ugbm9uLXdoaXRlIHRvIGNvbXBpbGUgc2hhZGVyIGNvcnJlY3RseVxuICAgICAgICBtYXRlcmlhbC5lbWlzc2l2ZU1hcCA9IHRoaXMuX2RlZmF1bHRUZXh0dXJlO1xuICAgICAgICBtYXRlcmlhbC5lbWlzc2l2ZVRpbnQgPSB0cnVlO1xuICAgICAgICBtYXRlcmlhbC5vcGFjaXR5TWFwID0gdGhpcy5fZGVmYXVsdFRleHR1cmU7XG4gICAgICAgIG1hdGVyaWFsLm9wYWNpdHlNYXBDaGFubmVsID0gJ2EnO1xuICAgICAgICBtYXRlcmlhbC5vcGFjaXR5VGludCA9IHRydWU7XG4gICAgICAgIG1hdGVyaWFsLm9wYWNpdHkgPSAwOyAvLyB1c2Ugbm9uLTEgb3BhY2l0eSB0byBjb21waWxlIHNoYWRlciBjb3JyZWN0bHlcbiAgICAgICAgbWF0ZXJpYWwudXNlTGlnaHRpbmcgPSBmYWxzZTtcbiAgICAgICAgbWF0ZXJpYWwudXNlR2FtbWFUb25lbWFwID0gZmFsc2U7XG4gICAgICAgIG1hdGVyaWFsLnVzZUZvZyA9IGZhbHNlO1xuICAgICAgICBtYXRlcmlhbC51c2VTa3lib3ggPSBmYWxzZTtcbiAgICAgICAgbWF0ZXJpYWwuYmxlbmRUeXBlID0gQkxFTkRfUFJFTVVMVElQTElFRDtcbiAgICAgICAgbWF0ZXJpYWwuZGVwdGhXcml0ZSA9IGZhbHNlO1xuXG4gICAgICAgIHJldHVybiBtYXRlcmlhbDtcbiAgICB9XG5cbiAgICBnZXRJbWFnZUVsZW1lbnRNYXRlcmlhbChzY3JlZW5TcGFjZSwgbWFzaywgbmluZVNsaWNlZCwgbmluZVNsaWNlVGlsZWQpIHtcbiAgICAgICAgLyogZXNsaW50LWRpc2FibGUgbm8tZWxzZS1yZXR1cm4gKi9cbiAgICAgICAgaWYgKHNjcmVlblNwYWNlKSB7XG4gICAgICAgICAgICBpZiAobWFzaykge1xuICAgICAgICAgICAgICAgIGlmIChuaW5lU2xpY2VkKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICghdGhpcy5kZWZhdWx0U2NyZWVuU3BhY2VJbWFnZU1hc2s5U2xpY2VkTWF0ZXJpYWwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZGVmYXVsdFNjcmVlblNwYWNlSW1hZ2VNYXNrOVNsaWNlZE1hdGVyaWFsID0gdGhpcy5fY3JlYXRlQmFzZUltYWdlTWF0ZXJpYWwoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZGVmYXVsdFNjcmVlblNwYWNlSW1hZ2VNYXNrOVNsaWNlZE1hdGVyaWFsLm5hbWUgPSAnZGVmYXVsdFNjcmVlblNwYWNlSW1hZ2VNYXNrOVNsaWNlZE1hdGVyaWFsJztcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZGVmYXVsdFNjcmVlblNwYWNlSW1hZ2VNYXNrOVNsaWNlZE1hdGVyaWFsLm5pbmVTbGljZWRNb2RlID0gU1BSSVRFX1JFTkRFUk1PREVfU0xJQ0VEO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5kZWZhdWx0U2NyZWVuU3BhY2VJbWFnZU1hc2s5U2xpY2VkTWF0ZXJpYWwuZGVwdGhUZXN0ID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmRlZmF1bHRTY3JlZW5TcGFjZUltYWdlTWFzazlTbGljZWRNYXRlcmlhbC5hbHBoYVRlc3QgPSAxO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5kZWZhdWx0U2NyZWVuU3BhY2VJbWFnZU1hc2s5U2xpY2VkTWF0ZXJpYWwucmVkV3JpdGUgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZGVmYXVsdFNjcmVlblNwYWNlSW1hZ2VNYXNrOVNsaWNlZE1hdGVyaWFsLmdyZWVuV3JpdGUgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZGVmYXVsdFNjcmVlblNwYWNlSW1hZ2VNYXNrOVNsaWNlZE1hdGVyaWFsLmJsdWVXcml0ZSA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5kZWZhdWx0U2NyZWVuU3BhY2VJbWFnZU1hc2s5U2xpY2VkTWF0ZXJpYWwuYWxwaGFXcml0ZSA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5kZWZhdWx0U2NyZWVuU3BhY2VJbWFnZU1hc2s5U2xpY2VkTWF0ZXJpYWwudXBkYXRlKCk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZGVmYXVsdEltYWdlTWF0ZXJpYWxzLnB1c2godGhpcy5kZWZhdWx0U2NyZWVuU3BhY2VJbWFnZU1hc2s5U2xpY2VkTWF0ZXJpYWwpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmRlZmF1bHRTY3JlZW5TcGFjZUltYWdlTWFzazlTbGljZWRNYXRlcmlhbDtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKG5pbmVTbGljZVRpbGVkKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICghdGhpcy5kZWZhdWx0U2NyZWVuU3BhY2VJbWFnZU1hc2s5VGlsZWRNYXRlcmlhbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5kZWZhdWx0U2NyZWVuU3BhY2VJbWFnZU1hc2s5VGlsZWRNYXRlcmlhbCA9IHRoaXMuZGVmYXVsdFNjcmVlblNwYWNlSW1hZ2U5VGlsZWRNYXRlcmlhbC5jbG9uZSgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5kZWZhdWx0U2NyZWVuU3BhY2VJbWFnZU1hc2s5VGlsZWRNYXRlcmlhbC5uYW1lID0gJ2RlZmF1bHRTY3JlZW5TcGFjZUltYWdlTWFzazlUaWxlZE1hdGVyaWFsJztcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZGVmYXVsdFNjcmVlblNwYWNlSW1hZ2VNYXNrOVRpbGVkTWF0ZXJpYWwubmluZVNsaWNlZE1vZGUgPSBTUFJJVEVfUkVOREVSTU9ERV9USUxFRDtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZGVmYXVsdFNjcmVlblNwYWNlSW1hZ2VNYXNrOVRpbGVkTWF0ZXJpYWwuZGVwdGhUZXN0ID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmRlZmF1bHRTY3JlZW5TcGFjZUltYWdlTWFzazlUaWxlZE1hdGVyaWFsLmFscGhhVGVzdCA9IDE7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmRlZmF1bHRTY3JlZW5TcGFjZUltYWdlTWFzazlUaWxlZE1hdGVyaWFsLnJlZFdyaXRlID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmRlZmF1bHRTY3JlZW5TcGFjZUltYWdlTWFzazlUaWxlZE1hdGVyaWFsLmdyZWVuV3JpdGUgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZGVmYXVsdFNjcmVlblNwYWNlSW1hZ2VNYXNrOVRpbGVkTWF0ZXJpYWwuYmx1ZVdyaXRlID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmRlZmF1bHRTY3JlZW5TcGFjZUltYWdlTWFzazlUaWxlZE1hdGVyaWFsLmFscGhhV3JpdGUgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZGVmYXVsdFNjcmVlblNwYWNlSW1hZ2VNYXNrOVRpbGVkTWF0ZXJpYWwudXBkYXRlKCk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZGVmYXVsdEltYWdlTWF0ZXJpYWxzLnB1c2godGhpcy5kZWZhdWx0U2NyZWVuU3BhY2VJbWFnZU1hc2s5VGlsZWRNYXRlcmlhbCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuZGVmYXVsdFNjcmVlblNwYWNlSW1hZ2VNYXNrOVRpbGVkTWF0ZXJpYWw7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCF0aGlzLmRlZmF1bHRTY3JlZW5TcGFjZUltYWdlTWFza01hdGVyaWFsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmRlZmF1bHRTY3JlZW5TcGFjZUltYWdlTWFza01hdGVyaWFsID0gdGhpcy5fY3JlYXRlQmFzZUltYWdlTWF0ZXJpYWwoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZGVmYXVsdFNjcmVlblNwYWNlSW1hZ2VNYXNrTWF0ZXJpYWwubmFtZSA9ICdkZWZhdWx0U2NyZWVuU3BhY2VJbWFnZU1hc2tNYXRlcmlhbCc7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmRlZmF1bHRTY3JlZW5TcGFjZUltYWdlTWFza01hdGVyaWFsLmRlcHRoVGVzdCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5kZWZhdWx0U2NyZWVuU3BhY2VJbWFnZU1hc2tNYXRlcmlhbC5hbHBoYVRlc3QgPSAxO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5kZWZhdWx0U2NyZWVuU3BhY2VJbWFnZU1hc2tNYXRlcmlhbC5yZWRXcml0ZSA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5kZWZhdWx0U2NyZWVuU3BhY2VJbWFnZU1hc2tNYXRlcmlhbC5ncmVlbldyaXRlID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmRlZmF1bHRTY3JlZW5TcGFjZUltYWdlTWFza01hdGVyaWFsLmJsdWVXcml0ZSA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5kZWZhdWx0U2NyZWVuU3BhY2VJbWFnZU1hc2tNYXRlcmlhbC5hbHBoYVdyaXRlID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmRlZmF1bHRTY3JlZW5TcGFjZUltYWdlTWFza01hdGVyaWFsLnVwZGF0ZSgpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmRlZmF1bHRJbWFnZU1hdGVyaWFscy5wdXNoKHRoaXMuZGVmYXVsdFNjcmVlblNwYWNlSW1hZ2VNYXNrTWF0ZXJpYWwpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmRlZmF1bHRTY3JlZW5TcGFjZUltYWdlTWFza01hdGVyaWFsO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgaWYgKG5pbmVTbGljZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCF0aGlzLmRlZmF1bHRTY3JlZW5TcGFjZUltYWdlOVNsaWNlZE1hdGVyaWFsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmRlZmF1bHRTY3JlZW5TcGFjZUltYWdlOVNsaWNlZE1hdGVyaWFsID0gdGhpcy5fY3JlYXRlQmFzZUltYWdlTWF0ZXJpYWwoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZGVmYXVsdFNjcmVlblNwYWNlSW1hZ2U5U2xpY2VkTWF0ZXJpYWwubmFtZSA9ICdkZWZhdWx0U2NyZWVuU3BhY2VJbWFnZTlTbGljZWRNYXRlcmlhbCc7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmRlZmF1bHRTY3JlZW5TcGFjZUltYWdlOVNsaWNlZE1hdGVyaWFsLm5pbmVTbGljZWRNb2RlID0gU1BSSVRFX1JFTkRFUk1PREVfU0xJQ0VEO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5kZWZhdWx0U2NyZWVuU3BhY2VJbWFnZTlTbGljZWRNYXRlcmlhbC5kZXB0aFRlc3QgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZGVmYXVsdFNjcmVlblNwYWNlSW1hZ2U5U2xpY2VkTWF0ZXJpYWwudXBkYXRlKCk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZGVmYXVsdEltYWdlTWF0ZXJpYWxzLnB1c2godGhpcy5kZWZhdWx0U2NyZWVuU3BhY2VJbWFnZTlTbGljZWRNYXRlcmlhbCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuZGVmYXVsdFNjcmVlblNwYWNlSW1hZ2U5U2xpY2VkTWF0ZXJpYWw7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChuaW5lU2xpY2VUaWxlZCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoIXRoaXMuZGVmYXVsdFNjcmVlblNwYWNlSW1hZ2U5VGlsZWRNYXRlcmlhbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5kZWZhdWx0U2NyZWVuU3BhY2VJbWFnZTlUaWxlZE1hdGVyaWFsID0gdGhpcy5fY3JlYXRlQmFzZUltYWdlTWF0ZXJpYWwoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZGVmYXVsdFNjcmVlblNwYWNlSW1hZ2U5VGlsZWRNYXRlcmlhbC5uYW1lID0gJ2RlZmF1bHRTY3JlZW5TcGFjZUltYWdlOVRpbGVkTWF0ZXJpYWwnO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5kZWZhdWx0U2NyZWVuU3BhY2VJbWFnZTlUaWxlZE1hdGVyaWFsLm5pbmVTbGljZWRNb2RlID0gU1BSSVRFX1JFTkRFUk1PREVfVElMRUQ7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmRlZmF1bHRTY3JlZW5TcGFjZUltYWdlOVRpbGVkTWF0ZXJpYWwuZGVwdGhUZXN0ID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmRlZmF1bHRTY3JlZW5TcGFjZUltYWdlOVRpbGVkTWF0ZXJpYWwudXBkYXRlKCk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZGVmYXVsdEltYWdlTWF0ZXJpYWxzLnB1c2godGhpcy5kZWZhdWx0U2NyZWVuU3BhY2VJbWFnZTlUaWxlZE1hdGVyaWFsKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmRlZmF1bHRTY3JlZW5TcGFjZUltYWdlOVRpbGVkTWF0ZXJpYWw7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCF0aGlzLmRlZmF1bHRTY3JlZW5TcGFjZUltYWdlTWF0ZXJpYWwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZGVmYXVsdFNjcmVlblNwYWNlSW1hZ2VNYXRlcmlhbCA9IHRoaXMuX2NyZWF0ZUJhc2VJbWFnZU1hdGVyaWFsKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmRlZmF1bHRTY3JlZW5TcGFjZUltYWdlTWF0ZXJpYWwubmFtZSA9ICdkZWZhdWx0U2NyZWVuU3BhY2VJbWFnZU1hdGVyaWFsJztcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZGVmYXVsdFNjcmVlblNwYWNlSW1hZ2VNYXRlcmlhbC5kZXB0aFRlc3QgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZGVmYXVsdFNjcmVlblNwYWNlSW1hZ2VNYXRlcmlhbC51cGRhdGUoKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5kZWZhdWx0SW1hZ2VNYXRlcmlhbHMucHVzaCh0aGlzLmRlZmF1bHRTY3JlZW5TcGFjZUltYWdlTWF0ZXJpYWwpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmRlZmF1bHRTY3JlZW5TcGFjZUltYWdlTWF0ZXJpYWw7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaWYgKG1hc2spIHtcbiAgICAgICAgICAgICAgICBpZiAobmluZVNsaWNlZCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoIXRoaXMuZGVmYXVsdEltYWdlOVNsaWNlZE1hc2tNYXRlcmlhbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5kZWZhdWx0SW1hZ2U5U2xpY2VkTWFza01hdGVyaWFsID0gdGhpcy5fY3JlYXRlQmFzZUltYWdlTWF0ZXJpYWwoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZGVmYXVsdEltYWdlOVNsaWNlZE1hc2tNYXRlcmlhbC5uYW1lID0gJ2RlZmF1bHRJbWFnZTlTbGljZWRNYXNrTWF0ZXJpYWwnO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5kZWZhdWx0SW1hZ2U5U2xpY2VkTWFza01hdGVyaWFsLm5pbmVTbGljZWRNb2RlID0gU1BSSVRFX1JFTkRFUk1PREVfU0xJQ0VEO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5kZWZhdWx0SW1hZ2U5U2xpY2VkTWFza01hdGVyaWFsLmFscGhhVGVzdCA9IDE7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmRlZmF1bHRJbWFnZTlTbGljZWRNYXNrTWF0ZXJpYWwucmVkV3JpdGUgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZGVmYXVsdEltYWdlOVNsaWNlZE1hc2tNYXRlcmlhbC5ncmVlbldyaXRlID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmRlZmF1bHRJbWFnZTlTbGljZWRNYXNrTWF0ZXJpYWwuYmx1ZVdyaXRlID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmRlZmF1bHRJbWFnZTlTbGljZWRNYXNrTWF0ZXJpYWwuYWxwaGFXcml0ZSA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5kZWZhdWx0SW1hZ2U5U2xpY2VkTWFza01hdGVyaWFsLnVwZGF0ZSgpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmRlZmF1bHRJbWFnZU1hdGVyaWFscy5wdXNoKHRoaXMuZGVmYXVsdEltYWdlOVNsaWNlZE1hc2tNYXRlcmlhbCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuZGVmYXVsdEltYWdlOVNsaWNlZE1hc2tNYXRlcmlhbDtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKG5pbmVTbGljZVRpbGVkKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICghdGhpcy5kZWZhdWx0SW1hZ2U5VGlsZWRNYXNrTWF0ZXJpYWwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZGVmYXVsdEltYWdlOVRpbGVkTWFza01hdGVyaWFsID0gdGhpcy5fY3JlYXRlQmFzZUltYWdlTWF0ZXJpYWwoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZGVmYXVsdEltYWdlOVRpbGVkTWFza01hdGVyaWFsLm5hbWUgPSAnZGVmYXVsdEltYWdlOVRpbGVkTWFza01hdGVyaWFsJztcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZGVmYXVsdEltYWdlOVRpbGVkTWFza01hdGVyaWFsLm5pbmVTbGljZWRNb2RlID0gU1BSSVRFX1JFTkRFUk1PREVfVElMRUQ7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmRlZmF1bHRJbWFnZTlUaWxlZE1hc2tNYXRlcmlhbC5hbHBoYVRlc3QgPSAxO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5kZWZhdWx0SW1hZ2U5VGlsZWRNYXNrTWF0ZXJpYWwucmVkV3JpdGUgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZGVmYXVsdEltYWdlOVRpbGVkTWFza01hdGVyaWFsLmdyZWVuV3JpdGUgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZGVmYXVsdEltYWdlOVRpbGVkTWFza01hdGVyaWFsLmJsdWVXcml0ZSA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5kZWZhdWx0SW1hZ2U5VGlsZWRNYXNrTWF0ZXJpYWwuYWxwaGFXcml0ZSA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5kZWZhdWx0SW1hZ2U5VGlsZWRNYXNrTWF0ZXJpYWwudXBkYXRlKCk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZGVmYXVsdEltYWdlTWF0ZXJpYWxzLnB1c2godGhpcy5kZWZhdWx0SW1hZ2U5VGlsZWRNYXNrTWF0ZXJpYWwpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmRlZmF1bHRJbWFnZTlUaWxlZE1hc2tNYXRlcmlhbDtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBpZiAoIXRoaXMuZGVmYXVsdEltYWdlTWFza01hdGVyaWFsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmRlZmF1bHRJbWFnZU1hc2tNYXRlcmlhbCA9IHRoaXMuX2NyZWF0ZUJhc2VJbWFnZU1hdGVyaWFsKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmRlZmF1bHRJbWFnZU1hc2tNYXRlcmlhbC5uYW1lID0gJ2RlZmF1bHRJbWFnZU1hc2tNYXRlcmlhbCc7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmRlZmF1bHRJbWFnZU1hc2tNYXRlcmlhbC5hbHBoYVRlc3QgPSAxO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5kZWZhdWx0SW1hZ2VNYXNrTWF0ZXJpYWwucmVkV3JpdGUgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZGVmYXVsdEltYWdlTWFza01hdGVyaWFsLmdyZWVuV3JpdGUgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZGVmYXVsdEltYWdlTWFza01hdGVyaWFsLmJsdWVXcml0ZSA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5kZWZhdWx0SW1hZ2VNYXNrTWF0ZXJpYWwuYWxwaGFXcml0ZSA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5kZWZhdWx0SW1hZ2VNYXNrTWF0ZXJpYWwudXBkYXRlKCk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZGVmYXVsdEltYWdlTWF0ZXJpYWxzLnB1c2godGhpcy5kZWZhdWx0SW1hZ2VNYXNrTWF0ZXJpYWwpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmRlZmF1bHRJbWFnZU1hc2tNYXRlcmlhbDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGlmIChuaW5lU2xpY2VkKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICghdGhpcy5kZWZhdWx0SW1hZ2U5U2xpY2VkTWF0ZXJpYWwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZGVmYXVsdEltYWdlOVNsaWNlZE1hdGVyaWFsID0gdGhpcy5fY3JlYXRlQmFzZUltYWdlTWF0ZXJpYWwoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZGVmYXVsdEltYWdlOVNsaWNlZE1hdGVyaWFsLm5hbWUgPSAnZGVmYXVsdEltYWdlOVNsaWNlZE1hdGVyaWFsJztcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZGVmYXVsdEltYWdlOVNsaWNlZE1hdGVyaWFsLm5pbmVTbGljZWRNb2RlID0gU1BSSVRFX1JFTkRFUk1PREVfU0xJQ0VEO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5kZWZhdWx0SW1hZ2U5U2xpY2VkTWF0ZXJpYWwudXBkYXRlKCk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZGVmYXVsdEltYWdlTWF0ZXJpYWxzLnB1c2godGhpcy5kZWZhdWx0SW1hZ2U5U2xpY2VkTWF0ZXJpYWwpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmRlZmF1bHRJbWFnZTlTbGljZWRNYXRlcmlhbDtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKG5pbmVTbGljZVRpbGVkKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICghdGhpcy5kZWZhdWx0SW1hZ2U5VGlsZWRNYXRlcmlhbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5kZWZhdWx0SW1hZ2U5VGlsZWRNYXRlcmlhbCA9IHRoaXMuX2NyZWF0ZUJhc2VJbWFnZU1hdGVyaWFsKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmRlZmF1bHRJbWFnZTlUaWxlZE1hdGVyaWFsLm5hbWUgPSAnZGVmYXVsdEltYWdlOVRpbGVkTWF0ZXJpYWwnO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5kZWZhdWx0SW1hZ2U5VGlsZWRNYXRlcmlhbC5uaW5lU2xpY2VkTW9kZSA9IFNQUklURV9SRU5ERVJNT0RFX1RJTEVEO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5kZWZhdWx0SW1hZ2U5VGlsZWRNYXRlcmlhbC51cGRhdGUoKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5kZWZhdWx0SW1hZ2VNYXRlcmlhbHMucHVzaCh0aGlzLmRlZmF1bHRJbWFnZTlUaWxlZE1hdGVyaWFsKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5kZWZhdWx0SW1hZ2U5VGlsZWRNYXRlcmlhbDtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBpZiAoIXRoaXMuZGVmYXVsdEltYWdlTWF0ZXJpYWwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZGVmYXVsdEltYWdlTWF0ZXJpYWwgPSB0aGlzLl9jcmVhdGVCYXNlSW1hZ2VNYXRlcmlhbCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5kZWZhdWx0SW1hZ2VNYXRlcmlhbC5uYW1lID0gJ2RlZmF1bHRJbWFnZU1hdGVyaWFsJztcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZGVmYXVsdEltYWdlTWF0ZXJpYWwudXBkYXRlKCk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZGVmYXVsdEltYWdlTWF0ZXJpYWxzLnB1c2godGhpcy5kZWZhdWx0SW1hZ2VNYXRlcmlhbCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuZGVmYXVsdEltYWdlTWF0ZXJpYWw7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIC8qIGVzbGludC1lbmFibGUgbm8tZWxzZS1yZXR1cm4gKi9cbiAgICB9XG5cbiAgICByZWdpc3RlclVuaWNvZGVDb252ZXJ0ZXIoZnVuYykge1xuICAgICAgICB0aGlzLl91bmljb2RlQ29udmVydGVyID0gZnVuYztcbiAgICB9XG5cbiAgICByZWdpc3RlclJ0bFJlb3JkZXIoZnVuYykge1xuICAgICAgICB0aGlzLl9ydGxSZW9yZGVyID0gZnVuYztcbiAgICB9XG5cbiAgICBnZXRVbmljb2RlQ29udmVydGVyKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fdW5pY29kZUNvbnZlcnRlcjtcbiAgICB9XG5cbiAgICBnZXRSdGxSZW9yZGVyKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fcnRsUmVvcmRlcjtcbiAgICB9XG59XG5cbkNvbXBvbmVudC5fYnVpbGRBY2Nlc3NvcnMoRWxlbWVudENvbXBvbmVudC5wcm90b3R5cGUsIF9zY2hlbWEpO1xuXG5leHBvcnQgeyBFbGVtZW50Q29tcG9uZW50U3lzdGVtIH07XG4iXSwibmFtZXMiOlsiX3NjaGVtYSIsIkVsZW1lbnRDb21wb25lbnRTeXN0ZW0iLCJDb21wb25lbnRTeXN0ZW0iLCJjb25zdHJ1Y3RvciIsImFwcCIsImlkIiwiQ29tcG9uZW50VHlwZSIsIkVsZW1lbnRDb21wb25lbnQiLCJEYXRhVHlwZSIsIkVsZW1lbnRDb21wb25lbnREYXRhIiwic2NoZW1hIiwiX3VuaWNvZGVDb252ZXJ0ZXIiLCJfcnRsUmVvcmRlciIsIl9kZWZhdWx0VGV4dHVyZSIsIlRleHR1cmUiLCJncmFwaGljc0RldmljZSIsIndpZHRoIiwiaGVpZ2h0IiwiZm9ybWF0IiwiUElYRUxGT1JNQVRfUkdCQTgiLCJuYW1lIiwicGl4ZWxzIiwibG9jayIsInBpeGVsRGF0YSIsIlVpbnQ4QXJyYXkiLCJzZXQiLCJ1bmxvY2siLCJkZWZhdWx0SW1hZ2VNYXRlcmlhbCIsImRlZmF1bHRJbWFnZTlTbGljZWRNYXRlcmlhbCIsImRlZmF1bHRJbWFnZTlUaWxlZE1hdGVyaWFsIiwiZGVmYXVsdEltYWdlTWFza01hdGVyaWFsIiwiZGVmYXVsdEltYWdlOVNsaWNlZE1hc2tNYXRlcmlhbCIsImRlZmF1bHRJbWFnZTlUaWxlZE1hc2tNYXRlcmlhbCIsImRlZmF1bHRTY3JlZW5TcGFjZUltYWdlTWF0ZXJpYWwiLCJkZWZhdWx0U2NyZWVuU3BhY2VJbWFnZTlTbGljZWRNYXRlcmlhbCIsImRlZmF1bHRTY3JlZW5TcGFjZUltYWdlOVRpbGVkTWF0ZXJpYWwiLCJkZWZhdWx0U2NyZWVuU3BhY2VJbWFnZU1hc2s5U2xpY2VkTWF0ZXJpYWwiLCJkZWZhdWx0U2NyZWVuU3BhY2VJbWFnZU1hc2s5VGlsZWRNYXRlcmlhbCIsImRlZmF1bHRTY3JlZW5TcGFjZUltYWdlTWFza01hdGVyaWFsIiwiX2RlZmF1bHRUZXh0TWF0ZXJpYWxzIiwiZGVmYXVsdEltYWdlTWF0ZXJpYWxzIiwib24iLCJvblJlbW92ZUNvbXBvbmVudCIsImRlc3Ryb3kiLCJpbml0aWFsaXplQ29tcG9uZW50RGF0YSIsImNvbXBvbmVudCIsImRhdGEiLCJwcm9wZXJ0aWVzIiwiX2JlaW5nSW5pdGlhbGl6ZWQiLCJhbmNob3IiLCJ1bmRlZmluZWQiLCJWZWM0IiwiY29weSIsInBpdm90IiwiVmVjMiIsInNwbGl0SG9yQW5jaG9ycyIsIk1hdGgiLCJhYnMiLCJ4IiwieiIsInNwbGl0VmVyQW5jaG9ycyIsInkiLCJ3IiwiX21hcmdpbkNoYW5nZSIsImNvbG9yIiwibWFyZ2luIiwiX21hcmdpbiIsImxlZnQiLCJib3R0b20iLCJyaWdodCIsInRvcCIsInNob3VsZEZvcmNlU2V0QW5jaG9yIiwiZW5hYmxlZCIsInVzZUlucHV0IiwiZml0TW9kZSIsImJhdGNoR3JvdXBJZCIsImxheWVycyIsIkFycmF5IiwiaXNBcnJheSIsInNsaWNlIiwidHlwZSIsIkVMRU1FTlRUWVBFX0lNQUdFIiwicmVjdCIsIkNvbG9yIiwib3BhY2l0eSIsInRleHR1cmVBc3NldCIsInRleHR1cmUiLCJzcHJpdGVBc3NldCIsInNwcml0ZSIsInNwcml0ZUZyYW1lIiwicGl4ZWxzUGVyVW5pdCIsIm1hdGVyaWFsQXNzZXQiLCJtYXRlcmlhbCIsIm1hc2siLCJFTEVNRU5UVFlQRV9URVhUIiwiYXV0b1dpZHRoIiwiYXV0b0hlaWdodCIsInJ0bFJlb3JkZXIiLCJ1bmljb2RlQ29udmVydGVyIiwidGV4dCIsImtleSIsInNwYWNpbmciLCJmb250U2l6ZSIsImxpbmVIZWlnaHQiLCJtYXhMaW5lcyIsIndyYXBMaW5lcyIsIm1pbkZvbnRTaXplIiwibWF4Rm9udFNpemUiLCJhdXRvRml0V2lkdGgiLCJhdXRvRml0SGVpZ2h0IiwiZm9udEFzc2V0IiwiZm9udCIsImFsaWdubWVudCIsIm91dGxpbmVDb2xvciIsIm91dGxpbmVUaGlja25lc3MiLCJzaGFkb3dDb2xvciIsInNoYWRvd09mZnNldCIsImVuYWJsZU1hcmt1cCIsInJlc3VsdCIsIl9wYXJzZVVwVG9TY3JlZW4iLCJzY3JlZW4iLCJfdXBkYXRlU2NyZWVuIiwiX2ltYWdlIiwiX21lc2hEaXJ0eSIsIl91cGRhdGVNZXNoIiwibWVzaCIsImVudGl0eSIsIm9uUmVtb3ZlIiwiY2xvbmVDb21wb25lbnQiLCJjbG9uZSIsInNvdXJjZSIsImVsZW1lbnQiLCJhZGRDb21wb25lbnQiLCJnZXRUZXh0RWxlbWVudE1hdGVyaWFsIiwic2NyZWVuU3BhY2UiLCJtc2RmIiwidGV4dEF0dGlidXRlcyIsImhhc2giLCJTdGFuZGFyZE1hdGVyaWFsIiwibXNkZk1hcCIsIm1zZGZUZXh0QXR0cmlidXRlIiwiZW1pc3NpdmUiLCJlbWlzc2l2ZU1hcCIsImVtaXNzaXZlVGludCIsIm9wYWNpdHlNYXAiLCJvcGFjaXR5TWFwQ2hhbm5lbCIsImRlcHRoVGVzdCIsInVzZUxpZ2h0aW5nIiwidXNlR2FtbWFUb25lbWFwIiwidXNlRm9nIiwidXNlU2t5Ym94IiwiZGlmZnVzZSIsImJsZW5kVHlwZSIsIkJMRU5EX1BSRU1VTFRJUExJRUQiLCJkZXB0aFdyaXRlIiwiZW1pc3NpdmVWZXJ0ZXhDb2xvciIsInVwZGF0ZSIsIl9jcmVhdGVCYXNlSW1hZ2VNYXRlcmlhbCIsIm9wYWNpdHlUaW50IiwiZ2V0SW1hZ2VFbGVtZW50TWF0ZXJpYWwiLCJuaW5lU2xpY2VkIiwibmluZVNsaWNlVGlsZWQiLCJuaW5lU2xpY2VkTW9kZSIsIlNQUklURV9SRU5ERVJNT0RFX1NMSUNFRCIsImFscGhhVGVzdCIsInJlZFdyaXRlIiwiZ3JlZW5Xcml0ZSIsImJsdWVXcml0ZSIsImFscGhhV3JpdGUiLCJwdXNoIiwiU1BSSVRFX1JFTkRFUk1PREVfVElMRUQiLCJyZWdpc3RlclVuaWNvZGVDb252ZXJ0ZXIiLCJmdW5jIiwicmVnaXN0ZXJSdGxSZW9yZGVyIiwiZ2V0VW5pY29kZUNvbnZlcnRlciIsImdldFJ0bFJlb3JkZXIiLCJDb21wb25lbnQiLCJfYnVpbGRBY2Nlc3NvcnMiLCJwcm90b3R5cGUiXSwibWFwcGluZ3MiOiI7Ozs7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
