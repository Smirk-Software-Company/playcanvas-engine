import { Debug } from '../../core/debug.js';
import { TRACEID_TEXTURE_ALLOC, TRACEID_VRAM_TEXTURE } from '../../core/constants.js';
import { math } from '../../core/math/math.js';
import { RenderTarget } from './render-target.js';
import { TextureUtils } from './texture-utils.js';
import { PIXELFORMAT_RGBA8, isCompressedPixelFormat, FILTER_LINEAR_MIPMAP_LINEAR, FILTER_LINEAR, ADDRESS_REPEAT, FUNC_LESS, TEXTURETYPE_DEFAULT, TEXTURETYPE_RGBM, TEXTURETYPE_SWIZZLEGGGR, TEXTUREPROJECTION_NONE, TEXTUREPROJECTION_CUBE, TEXHINT_SHADOWMAP, TEXHINT_ASSET, TEXHINT_LIGHTMAP, PIXELFORMAT_RGB16F, PIXELFORMAT_RGB32F, PIXELFORMAT_RGBA16F, PIXELFORMAT_RGBA32F, TEXTURETYPE_RGBP, TEXTURETYPE_RGBE, TEXTURELOCK_WRITE, getPixelFormatArrayType } from './constants.js';

let id = 0;

/**
 * A texture is a container for texel data that can be utilized in a fragment shader. Typically,
 * the texel data represents an image that is mapped over geometry.
 *
 * @category Graphics
 */
class Texture {
  /**
   * Create a new Texture instance.
   *
   * @param {import('./graphics-device.js').GraphicsDevice} graphicsDevice - The graphics device
   * used to manage this texture.
   * @param {object} [options] - Object for passing optional arguments.
   * @param {string} [options.name] - The name of the texture. Defaults to null.
   * @param {number} [options.width] - The width of the texture in pixels. Defaults to 4.
   * @param {number} [options.height] - The height of the texture in pixels. Defaults to 4.
   * @param {number} [options.depth] - The number of depth slices in a 3D texture (not supported by WebGl1).
   * Defaults to 1 (single 2D image).
   * @param {number} [options.format] - The pixel format of the texture. Can be:
   *
   * - {@link PIXELFORMAT_A8}
   * - {@link PIXELFORMAT_L8}
   * - {@link PIXELFORMAT_LA8}
   * - {@link PIXELFORMAT_RGB565}
   * - {@link PIXELFORMAT_RGBA5551}
   * - {@link PIXELFORMAT_RGBA4}
   * - {@link PIXELFORMAT_RGB8}
   * - {@link PIXELFORMAT_RGBA8}
   * - {@link PIXELFORMAT_DXT1}
   * - {@link PIXELFORMAT_DXT3}
   * - {@link PIXELFORMAT_DXT5}
   * - {@link PIXELFORMAT_RGB16F}
   * - {@link PIXELFORMAT_RGBA16F}
   * - {@link PIXELFORMAT_RGB32F}
   * - {@link PIXELFORMAT_RGBA32F}
   * - {@link PIXELFORMAT_ETC1}
   * - {@link PIXELFORMAT_PVRTC_2BPP_RGB_1}
   * - {@link PIXELFORMAT_PVRTC_2BPP_RGBA_1}
   * - {@link PIXELFORMAT_PVRTC_4BPP_RGB_1}
   * - {@link PIXELFORMAT_PVRTC_4BPP_RGBA_1}
   * - {@link PIXELFORMAT_111110F}
   * - {@link PIXELFORMAT_ASTC_4x4}
   * - {@link PIXELFORMAT_ATC_RGB}
   * - {@link PIXELFORMAT_ATC_RGBA}
   *
   * Defaults to {@link PIXELFORMAT_RGBA8}.
   * @param {string} [options.projection] - The projection type of the texture, used when the
   * texture represents an environment. Can be:
   *
   * - {@link TEXTUREPROJECTION_NONE}
   * - {@link TEXTUREPROJECTION_CUBE}
   * - {@link TEXTUREPROJECTION_EQUIRECT}
   * - {@link TEXTUREPROJECTION_OCTAHEDRAL}
   *
   * Defaults to {@link TEXTUREPROJECTION_CUBE} if options.cubemap is true, otherwise
   * {@link TEXTUREPROJECTION_NONE}.
   * @param {number} [options.minFilter] - The minification filter type to use. Defaults to
   * {@link FILTER_LINEAR_MIPMAP_LINEAR}.
   * @param {number} [options.magFilter] - The magnification filter type to use. Defaults to
   * {@link FILTER_LINEAR}.
   * @param {number} [options.anisotropy] - The level of anisotropic filtering to use. Defaults
   * to 1.
   * @param {number} [options.addressU] - The repeat mode to use in the U direction. Defaults to
   * {@link ADDRESS_REPEAT}.
   * @param {number} [options.addressV] - The repeat mode to use in the V direction. Defaults to
   * {@link ADDRESS_REPEAT}.
   * @param {number} [options.addressW] - The repeat mode to use in the W direction. Defaults to
   * {@link ADDRESS_REPEAT}.
   * @param {boolean} [options.mipmaps] - When enabled try to generate or use mipmaps for this
   * texture. Default is true.
   * @param {boolean} [options.cubemap] - Specifies whether the texture is to be a cubemap.
   * Defaults to false.
   * @param {boolean} [options.volume] - Specifies whether the texture is to be a 3D volume
   * (not supported by WebGL1). Defaults to false.
   * @param {string} [options.type] - Specifies the texture type.  Can be:
   *
   * - {@link TEXTURETYPE_DEFAULT}
   * - {@link TEXTURETYPE_RGBM}
   * - {@link TEXTURETYPE_RGBE}
   * - {@link TEXTURETYPE_RGBP}
   * - {@link TEXTURETYPE_SWIZZLEGGGR}
   *
   * Defaults to {@link TEXTURETYPE_DEFAULT}.
   * @param {boolean} [options.fixCubemapSeams] - Specifies whether this cubemap texture requires
   * special seam fixing shader code to look right. Defaults to false.
   * @param {boolean} [options.flipY] - Specifies whether the texture should be flipped in the
   * Y-direction. Only affects textures with a source that is an image, canvas or video element.
   * Does not affect cubemaps, compressed textures or textures set from raw pixel data. Defaults
   * to false.
   * @param {boolean} [options.premultiplyAlpha] - If true, the alpha channel of the texture (if
   * present) is multiplied into the color channels. Defaults to false.
   * @param {boolean} [options.compareOnRead] - When enabled, and if texture format is
   * {@link PIXELFORMAT_DEPTH} or {@link PIXELFORMAT_DEPTHSTENCIL}, hardware PCF is enabled for
   * this texture, and you can get filtered results of comparison using texture() in your shader
   * (not supported by WebGL1). Defaults to false.
   * @param {number} [options.compareFunc] - Comparison function when compareOnRead is enabled
   * (not supported by WebGL1). Can be:
   *
   * - {@link FUNC_LESS}
   * - {@link FUNC_LESSEQUAL}
   * - {@link FUNC_GREATER}
   * - {@link FUNC_GREATEREQUAL}
   * - {@link FUNC_EQUAL}
   * - {@link FUNC_NOTEQUAL}
   *
   * Defaults to {@link FUNC_LESS}.
   * @param {Uint8Array[]} [options.levels] - Array of Uint8Array.
   * @example
   * // Create a 8x8x24-bit texture
   * const texture = new pc.Texture(graphicsDevice, {
   *     width: 8,
   *     height: 8,
   *     format: pc.PIXELFORMAT_RGB8
   * });
   *
   * // Fill the texture with a gradient
   * const pixels = texture.lock();
   * const count = 0;
   * for (let i = 0; i < 8; i++) {
   *     for (let j = 0; j < 8; j++) {
   *         pixels[count++] = i * 32;
   *         pixels[count++] = j * 32;
   *         pixels[count++] = 255;
   *     }
   * }
   * texture.unlock();
   */
  constructor(graphicsDevice, options = {}) {
    var _options$name, _options$width, _options$height, _options$format, _options$cubemap, _options$fixCubemapSe, _options$flipY, _options$premultiplyA, _ref, _options$mipmaps, _options$minFilter, _options$magFilter, _options$anisotropy, _options$addressU, _options$addressV, _options$addressW, _options$compareOnRea, _options$compareFunc, _options$profilerHint;
    /**
     * The name of the texture.
     *
     * @type {string}
     */
    this.name = void 0;
    /** @protected */
    this._isRenderTarget = false;
    /** @protected */
    this._gpuSize = 0;
    /** @protected */
    this.id = id++;
    /** @protected */
    this._invalid = false;
    /** @protected */
    this._lockedLevel = -1;
    /**
     * A render version used to track the last time the texture properties requiring bind group
     * to be updated were changed.
     *
     * @type {number}
     * @ignore
     */
    this.renderVersionDirty = 0;
    this.device = graphicsDevice;
    Debug.assert(this.device, "Texture constructor requires a graphicsDevice to be valid");
    this.name = (_options$name = options.name) != null ? _options$name : null;
    this._width = (_options$width = options.width) != null ? _options$width : 4;
    this._height = (_options$height = options.height) != null ? _options$height : 4;
    this._format = (_options$format = options.format) != null ? _options$format : PIXELFORMAT_RGBA8;
    this._compressed = isCompressedPixelFormat(this._format);
    if (graphicsDevice.supportsVolumeTextures) {
      var _options$volume, _options$depth;
      this._volume = (_options$volume = options.volume) != null ? _options$volume : false;
      this._depth = (_options$depth = options.depth) != null ? _options$depth : 1;
    } else {
      this._volume = false;
      this._depth = 1;
    }
    this._cubemap = (_options$cubemap = options.cubemap) != null ? _options$cubemap : false;
    this.fixCubemapSeams = (_options$fixCubemapSe = options.fixCubemapSeams) != null ? _options$fixCubemapSe : false;
    this._flipY = (_options$flipY = options.flipY) != null ? _options$flipY : false;
    this._premultiplyAlpha = (_options$premultiplyA = options.premultiplyAlpha) != null ? _options$premultiplyA : false;
    this._mipmaps = (_ref = (_options$mipmaps = options.mipmaps) != null ? _options$mipmaps : options.autoMipmap) != null ? _ref : true;
    this._minFilter = (_options$minFilter = options.minFilter) != null ? _options$minFilter : FILTER_LINEAR_MIPMAP_LINEAR;
    this._magFilter = (_options$magFilter = options.magFilter) != null ? _options$magFilter : FILTER_LINEAR;
    this._anisotropy = (_options$anisotropy = options.anisotropy) != null ? _options$anisotropy : 1;
    this._addressU = (_options$addressU = options.addressU) != null ? _options$addressU : ADDRESS_REPEAT;
    this._addressV = (_options$addressV = options.addressV) != null ? _options$addressV : ADDRESS_REPEAT;
    this._addressW = (_options$addressW = options.addressW) != null ? _options$addressW : ADDRESS_REPEAT;
    this._compareOnRead = (_options$compareOnRea = options.compareOnRead) != null ? _options$compareOnRea : false;
    this._compareFunc = (_options$compareFunc = options.compareFunc) != null ? _options$compareFunc : FUNC_LESS;
    this.type = TEXTURETYPE_DEFAULT;
    if (options.hasOwnProperty('type')) {
      this.type = options.type;
    } else if (options.hasOwnProperty('rgbm')) {
      Debug.deprecated("options.rgbm is deprecated. Use options.type instead.");
      this.type = options.rgbm ? TEXTURETYPE_RGBM : TEXTURETYPE_DEFAULT;
    } else if (options.hasOwnProperty('swizzleGGGR')) {
      Debug.deprecated("options.swizzleGGGR is deprecated. Use options.type instead.");
      this.type = options.swizzleGGGR ? TEXTURETYPE_SWIZZLEGGGR : TEXTURETYPE_DEFAULT;
    }
    this.projection = TEXTUREPROJECTION_NONE;
    if (this._cubemap) {
      this.projection = TEXTUREPROJECTION_CUBE;
    } else if (options.projection && options.projection !== TEXTUREPROJECTION_CUBE) {
      this.projection = options.projection;
    }
    this.impl = graphicsDevice.createTextureImpl(this);
    this.profilerHint = (_options$profilerHint = options.profilerHint) != null ? _options$profilerHint : 0;
    this.dirtyAll();
    this._levels = options.levels;
    if (this._levels) {
      this.upload();
    } else {
      this._levels = this._cubemap ? [[null, null, null, null, null, null]] : [null];
    }

    // track the texture
    graphicsDevice.textures.push(this);
    Debug.trace(TRACEID_TEXTURE_ALLOC, `Alloc: Id ${this.id} ${this.name}: ${this.width}x${this.height} ` + `${this.cubemap ? '[Cubemap]' : ''}` + `${this.volume ? '[Volume]' : ''}` + `${this.mipmaps ? '[Mipmaps]' : ''}`, this);
  }

  /**
   * Frees resources associated with this texture.
   */
  destroy() {
    Debug.trace(TRACEID_TEXTURE_ALLOC, `DeAlloc: Id ${this.id} ${this.name}`);
    const device = this.device;
    if (device) {
      // stop tracking the texture
      const idx = device.textures.indexOf(this);
      if (idx !== -1) {
        device.textures.splice(idx, 1);
      }

      // Remove texture from any uniforms
      device.scope.removeValue(this);

      // destroy implementation
      this.impl.destroy(device);

      // Update texture stats
      this.adjustVramSizeTracking(device._vram, -this._gpuSize);
      this._levels = null;
      this.device = null;
    }
  }

  /**
   * Resizes the texture. Only supported for render target textures, as it does not resize the
   * existing content of the texture, but only the allocated buffer for rendering into.
   *
   * @param {number} width - The new width of the texture.
   * @param {number} height - The new height of the texture.
   * @param {number} [depth] - The new depth of the texture. Defaults to 1.
   * @ignore
   */
  resize(width, height, depth = 1) {
    // destroy texture impl
    const device = this.device;
    this.adjustVramSizeTracking(device._vram, -this._gpuSize);
    this.impl.destroy(device);
    this._width = width;
    this._height = height;
    this._depth = depth;

    // re-create the implementation
    this.impl = device.createTextureImpl(this);
    this.dirtyAll();
  }

  /**
   * Called when the rendering context was lost. It releases all context related resources.
   *
   * @ignore
   */
  loseContext() {
    this.impl.loseContext();
    this.dirtyAll();
  }

  /**
   * Updates vram size tracking for the texture, size can be positive to add or negative to subtract
   *
   * @ignore
   */
  adjustVramSizeTracking(vram, size) {
    Debug.trace(TRACEID_VRAM_TEXTURE, `${this.id} ${this.name} size: ${size} vram.texture: ${vram.tex} => ${vram.tex + size}`);
    vram.tex += size;
    if (this.profilerHint === TEXHINT_SHADOWMAP) {
      vram.texShadow += size;
    } else if (this.profilerHint === TEXHINT_ASSET) {
      vram.texAsset += size;
    } else if (this.profilerHint === TEXHINT_LIGHTMAP) {
      vram.texLightmap += size;
    }
  }
  propertyChanged(flag) {
    this.impl.propertyChanged(flag);
    this.renderVersionDirty = this.device.renderVersion;
  }

  /**
   * Returns number of required mip levels for the texture based on its dimensions and parameters.
   *
   * @ignore
   * @type {number}
   */
  get requiredMipLevels() {
    return this.mipmaps ? Math.floor(Math.log2(Math.max(this.width, this.height))) + 1 : 1;
  }

  /**
   * The minification filter to be applied to the texture. Can be:
   *
   * - {@link FILTER_NEAREST}
   * - {@link FILTER_LINEAR}
   * - {@link FILTER_NEAREST_MIPMAP_NEAREST}
   * - {@link FILTER_NEAREST_MIPMAP_LINEAR}
   * - {@link FILTER_LINEAR_MIPMAP_NEAREST}
   * - {@link FILTER_LINEAR_MIPMAP_LINEAR}
   *
   * @type {number}
   */
  set minFilter(v) {
    if (this._minFilter !== v) {
      this._minFilter = v;
      this.propertyChanged(1);
    }
  }
  get minFilter() {
    return this._minFilter;
  }

  /**
   * The magnification filter to be applied to the texture. Can be:
   *
   * - {@link FILTER_NEAREST}
   * - {@link FILTER_LINEAR}
   *
   * @type {number}
   */
  set magFilter(v) {
    if (this._magFilter !== v) {
      this._magFilter = v;
      this.propertyChanged(2);
    }
  }
  get magFilter() {
    return this._magFilter;
  }

  /**
   * The addressing mode to be applied to the texture horizontally. Can be:
   *
   * - {@link ADDRESS_REPEAT}
   * - {@link ADDRESS_CLAMP_TO_EDGE}
   * - {@link ADDRESS_MIRRORED_REPEAT}
   *
   * @type {number}
   */
  set addressU(v) {
    if (this._addressU !== v) {
      this._addressU = v;
      this.propertyChanged(4);
    }
  }
  get addressU() {
    return this._addressU;
  }

  /**
   * The addressing mode to be applied to the texture vertically. Can be:
   *
   * - {@link ADDRESS_REPEAT}
   * - {@link ADDRESS_CLAMP_TO_EDGE}
   * - {@link ADDRESS_MIRRORED_REPEAT}
   *
   * @type {number}
   */
  set addressV(v) {
    if (this._addressV !== v) {
      this._addressV = v;
      this.propertyChanged(8);
    }
  }
  get addressV() {
    return this._addressV;
  }

  /**
   * The addressing mode to be applied to the 3D texture depth (not supported on WebGL1). Can be:
   *
   * - {@link ADDRESS_REPEAT}
   * - {@link ADDRESS_CLAMP_TO_EDGE}
   * - {@link ADDRESS_MIRRORED_REPEAT}
   *
   * @type {number}
   */
  set addressW(addressW) {
    if (!this.device.supportsVolumeTextures) return;
    if (!this._volume) {
      Debug.warn("pc.Texture#addressW: Can't set W addressing mode for a non-3D texture.");
      return;
    }
    if (addressW !== this._addressW) {
      this._addressW = addressW;
      this.propertyChanged(16);
    }
  }
  get addressW() {
    return this._addressW;
  }

  /**
   * When enabled, and if texture format is {@link PIXELFORMAT_DEPTH} or
   * {@link PIXELFORMAT_DEPTHSTENCIL}, hardware PCF is enabled for this texture, and you can get
   * filtered results of comparison using texture() in your shader (not supported on WebGL1).
   *
   * @type {boolean}
   */
  set compareOnRead(v) {
    if (this._compareOnRead !== v) {
      this._compareOnRead = v;
      this.propertyChanged(32);
    }
  }
  get compareOnRead() {
    return this._compareOnRead;
  }

  /**
   * Comparison function when compareOnRead is enabled (not supported on WebGL1). Possible values:
   *
   * - {@link FUNC_LESS}
   * - {@link FUNC_LESSEQUAL}
   * - {@link FUNC_GREATER}
   * - {@link FUNC_GREATEREQUAL}
   * - {@link FUNC_EQUAL}
   * - {@link FUNC_NOTEQUAL}
   *
   * @type {number}
   */
  set compareFunc(v) {
    if (this._compareFunc !== v) {
      this._compareFunc = v;
      this.propertyChanged(64);
    }
  }
  get compareFunc() {
    return this._compareFunc;
  }

  /**
   * Integer value specifying the level of anisotropic to apply to the texture ranging from 1 (no
   * anisotropic filtering) to the {@link GraphicsDevice} property maxAnisotropy.
   *
   * @type {number}
   */
  set anisotropy(v) {
    if (this._anisotropy !== v) {
      this._anisotropy = v;
      this.propertyChanged(128);
    }
  }
  get anisotropy() {
    return this._anisotropy;
  }

  /**
   * Defines if texture should generate/upload mipmaps if possible.
   *
   * @type {boolean}
   */
  set mipmaps(v) {
    if (this._mipmaps !== v) {
      this._mipmaps = v;
      if (this.device.isWebGPU) {
        Debug.warn("Texture#mipmaps: mipmap property is currently not allowed to be changed on WebGPU, create the texture appropriately.", this);
      }
      if (v) this._needsMipmapsUpload = true;
    }
  }
  get mipmaps() {
    return this._mipmaps;
  }

  /**
   * The width of the texture in pixels.
   *
   * @type {number}
   */
  get width() {
    return this._width;
  }

  /**
   * The height of the texture in pixels.
   *
   * @type {number}
   */
  get height() {
    return this._height;
  }

  /**
   * The number of depth slices in a 3D texture.
   *
   * @type {number}
   */
  get depth() {
    return this._depth;
  }

  /**
   * The pixel format of the texture. Can be:
   *
   * - {@link PIXELFORMAT_A8}
   * - {@link PIXELFORMAT_L8}
   * - {@link PIXELFORMAT_LA8}
   * - {@link PIXELFORMAT_RGB565}
   * - {@link PIXELFORMAT_RGBA5551}
   * - {@link PIXELFORMAT_RGBA4}
   * - {@link PIXELFORMAT_RGB8}
   * - {@link PIXELFORMAT_RGBA8}
   * - {@link PIXELFORMAT_DXT1}
   * - {@link PIXELFORMAT_DXT3}
   * - {@link PIXELFORMAT_DXT5}
   * - {@link PIXELFORMAT_RGB16F}
   * - {@link PIXELFORMAT_RGBA16F}
   * - {@link PIXELFORMAT_RGB32F}
   * - {@link PIXELFORMAT_RGBA32F}
   * - {@link PIXELFORMAT_ETC1}
   * - {@link PIXELFORMAT_PVRTC_2BPP_RGB_1}
   * - {@link PIXELFORMAT_PVRTC_2BPP_RGBA_1}
   * - {@link PIXELFORMAT_PVRTC_4BPP_RGB_1}
   * - {@link PIXELFORMAT_PVRTC_4BPP_RGBA_1}
   * - {@link PIXELFORMAT_111110F}
   * - {@link PIXELFORMAT_ASTC_4x4}>/li>
   * - {@link PIXELFORMAT_ATC_RGB}
   * - {@link PIXELFORMAT_ATC_RGBA}
   *
   * @type {number}
   */
  get format() {
    return this._format;
  }

  /**
   * Returns true if this texture is a cube map and false otherwise.
   *
   * @type {boolean}
   */
  get cubemap() {
    return this._cubemap;
  }
  get gpuSize() {
    const mips = this.pot && this._mipmaps && !(this._compressed && this._levels.length === 1);
    return TextureUtils.calcGpuSize(this._width, this._height, this._depth, this._format, mips, this._cubemap);
  }

  /**
   * Returns true if this texture is a 3D volume and false otherwise.
   *
   * @type {boolean}
   */
  get volume() {
    return this._volume;
  }

  /**
   * Specifies whether the texture should be flipped in the Y-direction. Only affects textures
   * with a source that is an image, canvas or video element. Does not affect cubemaps,
   * compressed textures or textures set from raw pixel data. Defaults to true.
   *
   * @type {boolean}
   */
  set flipY(flipY) {
    if (this._flipY !== flipY) {
      this._flipY = flipY;
      this._needsUpload = true;
    }
  }
  get flipY() {
    return this._flipY;
  }
  set premultiplyAlpha(premultiplyAlpha) {
    if (this._premultiplyAlpha !== premultiplyAlpha) {
      this._premultiplyAlpha = premultiplyAlpha;
      this._needsUpload = true;
    }
  }
  get premultiplyAlpha() {
    return this._premultiplyAlpha;
  }

  /**
   * Returns true if all dimensions of the texture are power of two, and false otherwise.
   *
   * @type {boolean}
   */
  get pot() {
    return math.powerOfTwo(this._width) && math.powerOfTwo(this._height);
  }

  // get the texture's encoding type
  get encoding() {
    switch (this.type) {
      case TEXTURETYPE_RGBM:
        return 'rgbm';
      case TEXTURETYPE_RGBE:
        return 'rgbe';
      case TEXTURETYPE_RGBP:
        return 'rgbp';
      default:
        return this.format === PIXELFORMAT_RGB16F || this.format === PIXELFORMAT_RGB32F || this.format === PIXELFORMAT_RGBA16F || this.format === PIXELFORMAT_RGBA32F ? 'linear' : 'srgb';
    }
  }

  // Force a full resubmission of the texture to the GPU (used on a context restore event)
  dirtyAll() {
    this._levelsUpdated = this._cubemap ? [[true, true, true, true, true, true]] : [true];
    this._needsUpload = true;
    this._needsMipmapsUpload = this._mipmaps;
    this._mipmapsUploaded = false;
    this.propertyChanged(255); // 1 | 2 | 4 | 8 | 16 | 32 | 64 | 128
  }

  /**
   * Locks a miplevel of the texture, returning a typed array to be filled with pixel data.
   *
   * @param {object} [options] - Optional options object. Valid properties are as follows:
   * @param {number} [options.level] - The mip level to lock with 0 being the top level. Defaults
   * to 0.
   * @param {number} [options.face] - If the texture is a cubemap, this is the index of the face
   * to lock.
   * @param {number} [options.mode] - The lock mode. Can be:
   * - {@link TEXTURELOCK_READ}
   * - {@link TEXTURELOCK_WRITE}
   * Defaults to {@link TEXTURELOCK_WRITE}.
   * @returns {Uint8Array|Uint16Array|Float32Array} A typed array containing the pixel data of
   * the locked mip level.
   */
  lock(options = {}) {
    // Initialize options to some sensible defaults
    if (options.level === undefined) {
      options.level = 0;
    }
    if (options.face === undefined) {
      options.face = 0;
    }
    if (options.mode === undefined) {
      options.mode = TEXTURELOCK_WRITE;
    }
    this._lockedLevel = options.level;
    const levels = this.cubemap ? this._levels[options.face] : this._levels;
    if (levels[options.level] === null) {
      // allocate storage for this mip level
      const width = Math.max(1, this._width >> options.level);
      const height = Math.max(1, this._height >> options.level);
      const depth = Math.max(1, this._depth >> options.level);
      const data = new ArrayBuffer(TextureUtils.calcLevelGpuSize(width, height, depth, this._format));
      levels[options.level] = new (getPixelFormatArrayType(this._format))(data);
    }
    return levels[options.level];
  }

  /**
   * Set the pixel data of the texture from a canvas, image, video DOM element. If the texture is
   * a cubemap, the supplied source must be an array of 6 canvases, images or videos.
   *
   * @param {HTMLCanvasElement|HTMLImageElement|HTMLVideoElement|HTMLCanvasElement[]|HTMLImageElement[]|HTMLVideoElement[]} source - A
   * canvas, image or video element, or an array of 6 canvas, image or video elements.
   * @param {number} [mipLevel] - A non-negative integer specifying the image level of detail.
   * Defaults to 0, which represents the base image source. A level value of N, that is greater
   * than 0, represents the image source for the Nth mipmap reduction level.
   */
  setSource(source, mipLevel = 0) {
    let invalid = false;
    let width, height;
    if (this._cubemap) {
      if (source[0]) {
        // rely on first face sizes
        width = source[0].width || 0;
        height = source[0].height || 0;
        for (let i = 0; i < 6; i++) {
          const face = source[i];
          // cubemap becomes invalid if any condition is not satisfied
          if (!face ||
          // face is missing
          face.width !== width ||
          // face is different width
          face.height !== height ||
          // face is different height
          !this.device._isBrowserInterface(face)) {
            // new image bitmap
            invalid = true;
            break;
          }
        }
      } else {
        // first face is missing
        invalid = true;
      }
      if (!invalid) {
        // mark levels as updated
        for (let i = 0; i < 6; i++) {
          if (this._levels[mipLevel][i] !== source[i]) this._levelsUpdated[mipLevel][i] = true;
        }
      }
    } else {
      // check if source is valid type of element
      if (!this.device._isBrowserInterface(source)) invalid = true;
      if (!invalid) {
        // mark level as updated
        if (source !== this._levels[mipLevel]) this._levelsUpdated[mipLevel] = true;
        width = source.width;
        height = source.height;
      }
    }
    if (invalid) {
      // invalid texture

      // default sizes
      this._width = 4;
      this._height = 4;

      // remove levels
      if (this._cubemap) {
        for (let i = 0; i < 6; i++) {
          this._levels[mipLevel][i] = null;
          this._levelsUpdated[mipLevel][i] = true;
        }
      } else {
        this._levels[mipLevel] = null;
        this._levelsUpdated[mipLevel] = true;
      }
    } else {
      // valid texture
      if (mipLevel === 0) {
        this._width = width;
        this._height = height;
      }
      this._levels[mipLevel] = source;
    }

    // valid or changed state of validity
    if (this._invalid !== invalid || !invalid) {
      this._invalid = invalid;

      // reupload
      this.upload();
    }
  }

  /**
   * Get the pixel data of the texture. If this is a cubemap then an array of 6 images will be
   * returned otherwise a single image.
   *
   * @param {number} [mipLevel] - A non-negative integer specifying the image level of detail.
   * Defaults to 0, which represents the base image source. A level value of N, that is greater
   * than 0, represents the image source for the Nth mipmap reduction level.
   * @returns {HTMLImageElement} The source image of this texture. Can be null if source not
   * assigned for specific image level.
   */
  getSource(mipLevel = 0) {
    return this._levels[mipLevel];
  }

  /**
   * Unlocks the currently locked mip level and uploads it to VRAM.
   */
  unlock() {
    if (this._lockedLevel === -1) {
      Debug.log("pc.Texture#unlock: Attempting to unlock a texture that is not locked.", this);
    }

    // Upload the new pixel data
    this.upload();
    this._lockedLevel = -1;
  }

  /**
   * Forces a reupload of the textures pixel data to graphics memory. Ordinarily, this function
   * is called by internally by {@link Texture#setSource} and {@link Texture#unlock}. However, it
   * still needs to be called explicitly in the case where an HTMLVideoElement is set as the
   * source of the texture.  Normally, this is done once every frame before video textured
   * geometry is rendered.
   */
  upload() {
    var _this$impl$uploadImme, _this$impl;
    this._needsUpload = true;
    this._needsMipmapsUpload = this._mipmaps;
    (_this$impl$uploadImme = (_this$impl = this.impl).uploadImmediate) == null ? void 0 : _this$impl$uploadImme.call(_this$impl, this.device, this);
  }

  /**
   * Download texture's top level data from graphics memory to local memory.
   *
   * @ignore
   */
  async downloadAsync() {
    const promises = [];
    for (let i = 0; i < (this.cubemap ? 6 : 1); i++) {
      var _this$device$readPixe, _this$device;
      const renderTarget = new RenderTarget({
        colorBuffer: this,
        depth: false,
        face: i
      });
      this.device.setRenderTarget(renderTarget);
      this.device.initRenderTarget(renderTarget);
      const levels = this.cubemap ? this._levels[i] : this._levels;
      let level = levels[0];
      if (levels[0] && this.device._isBrowserInterface(levels[0])) {
        levels[0] = null;
      }
      level = this.lock({
        face: i
      });
      const promise = (_this$device$readPixe = (_this$device = this.device).readPixelsAsync) == null ? void 0 : _this$device$readPixe.call(_this$device, 0, 0, this.width, this.height, level).then(() => renderTarget.destroy());
      promises.push(promise);
    }
    await Promise.all(promises);
  }
}

export { Texture };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGV4dHVyZS5qcyIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL3BsYXRmb3JtL2dyYXBoaWNzL3RleHR1cmUuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgRGVidWcgfSBmcm9tICcuLi8uLi9jb3JlL2RlYnVnLmpzJztcbmltcG9ydCB7IFRSQUNFSURfVEVYVFVSRV9BTExPQywgVFJBQ0VJRF9WUkFNX1RFWFRVUkUgfSBmcm9tICcuLi8uLi9jb3JlL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBtYXRoIH0gZnJvbSAnLi4vLi4vY29yZS9tYXRoL21hdGguanMnO1xuXG5pbXBvcnQgeyBSZW5kZXJUYXJnZXQgfSBmcm9tICcuL3JlbmRlci10YXJnZXQuanMnO1xuaW1wb3J0IHsgVGV4dHVyZVV0aWxzIH0gZnJvbSAnLi90ZXh0dXJlLXV0aWxzLmpzJztcbmltcG9ydCB7XG4gICAgaXNDb21wcmVzc2VkUGl4ZWxGb3JtYXQsXG4gICAgZ2V0UGl4ZWxGb3JtYXRBcnJheVR5cGUsXG4gICAgQUREUkVTU19SRVBFQVQsXG4gICAgRklMVEVSX0xJTkVBUiwgRklMVEVSX0xJTkVBUl9NSVBNQVBfTElORUFSLFxuICAgIEZVTkNfTEVTUyxcbiAgICBQSVhFTEZPUk1BVF9SR0JBOCxcbiAgICBQSVhFTEZPUk1BVF9SR0IxNkYsIFBJWEVMRk9STUFUX1JHQkExNkYsIFBJWEVMRk9STUFUX1JHQjMyRiwgUElYRUxGT1JNQVRfUkdCQTMyRixcbiAgICBURVhISU5UX1NIQURPV01BUCwgVEVYSElOVF9BU1NFVCwgVEVYSElOVF9MSUdIVE1BUCxcbiAgICBURVhUVVJFTE9DS19XUklURSxcbiAgICBURVhUVVJFUFJPSkVDVElPTl9OT05FLCBURVhUVVJFUFJPSkVDVElPTl9DVUJFLFxuICAgIFRFWFRVUkVUWVBFX0RFRkFVTFQsIFRFWFRVUkVUWVBFX1JHQk0sIFRFWFRVUkVUWVBFX1JHQkUsIFRFWFRVUkVUWVBFX1JHQlAsIFRFWFRVUkVUWVBFX1NXSVpaTEVHR0dSXG59IGZyb20gJy4vY29uc3RhbnRzLmpzJztcblxubGV0IGlkID0gMDtcblxuLyoqXG4gKiBBIHRleHR1cmUgaXMgYSBjb250YWluZXIgZm9yIHRleGVsIGRhdGEgdGhhdCBjYW4gYmUgdXRpbGl6ZWQgaW4gYSBmcmFnbWVudCBzaGFkZXIuIFR5cGljYWxseSxcbiAqIHRoZSB0ZXhlbCBkYXRhIHJlcHJlc2VudHMgYW4gaW1hZ2UgdGhhdCBpcyBtYXBwZWQgb3ZlciBnZW9tZXRyeS5cbiAqXG4gKiBAY2F0ZWdvcnkgR3JhcGhpY3NcbiAqL1xuY2xhc3MgVGV4dHVyZSB7XG4gICAgLyoqXG4gICAgICogVGhlIG5hbWUgb2YgdGhlIHRleHR1cmUuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7c3RyaW5nfVxuICAgICAqL1xuICAgIG5hbWU7XG5cbiAgICAvKiogQHByb3RlY3RlZCAqL1xuICAgIF9pc1JlbmRlclRhcmdldCA9IGZhbHNlO1xuXG4gICAgLyoqIEBwcm90ZWN0ZWQgKi9cbiAgICBfZ3B1U2l6ZSA9IDA7XG5cbiAgICAvKiogQHByb3RlY3RlZCAqL1xuICAgIGlkID0gaWQrKztcblxuICAgIC8qKiBAcHJvdGVjdGVkICovXG4gICAgX2ludmFsaWQgPSBmYWxzZTtcblxuICAgIC8qKiBAcHJvdGVjdGVkICovXG4gICAgX2xvY2tlZExldmVsID0gLTE7XG5cbiAgICAvKipcbiAgICAgKiBBIHJlbmRlciB2ZXJzaW9uIHVzZWQgdG8gdHJhY2sgdGhlIGxhc3QgdGltZSB0aGUgdGV4dHVyZSBwcm9wZXJ0aWVzIHJlcXVpcmluZyBiaW5kIGdyb3VwXG4gICAgICogdG8gYmUgdXBkYXRlZCB3ZXJlIGNoYW5nZWQuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqIEBpZ25vcmVcbiAgICAgKi9cbiAgICByZW5kZXJWZXJzaW9uRGlydHkgPSAwO1xuXG4gICAgLyoqXG4gICAgICogQ3JlYXRlIGEgbmV3IFRleHR1cmUgaW5zdGFuY2UuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi9ncmFwaGljcy1kZXZpY2UuanMnKS5HcmFwaGljc0RldmljZX0gZ3JhcGhpY3NEZXZpY2UgLSBUaGUgZ3JhcGhpY3MgZGV2aWNlXG4gICAgICogdXNlZCB0byBtYW5hZ2UgdGhpcyB0ZXh0dXJlLlxuICAgICAqIEBwYXJhbSB7b2JqZWN0fSBbb3B0aW9uc10gLSBPYmplY3QgZm9yIHBhc3Npbmcgb3B0aW9uYWwgYXJndW1lbnRzLlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBbb3B0aW9ucy5uYW1lXSAtIFRoZSBuYW1lIG9mIHRoZSB0ZXh0dXJlLiBEZWZhdWx0cyB0byBudWxsLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBbb3B0aW9ucy53aWR0aF0gLSBUaGUgd2lkdGggb2YgdGhlIHRleHR1cmUgaW4gcGl4ZWxzLiBEZWZhdWx0cyB0byA0LlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBbb3B0aW9ucy5oZWlnaHRdIC0gVGhlIGhlaWdodCBvZiB0aGUgdGV4dHVyZSBpbiBwaXhlbHMuIERlZmF1bHRzIHRvIDQuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFtvcHRpb25zLmRlcHRoXSAtIFRoZSBudW1iZXIgb2YgZGVwdGggc2xpY2VzIGluIGEgM0QgdGV4dHVyZSAobm90IHN1cHBvcnRlZCBieSBXZWJHbDEpLlxuICAgICAqIERlZmF1bHRzIHRvIDEgKHNpbmdsZSAyRCBpbWFnZSkuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFtvcHRpb25zLmZvcm1hdF0gLSBUaGUgcGl4ZWwgZm9ybWF0IG9mIHRoZSB0ZXh0dXJlLiBDYW4gYmU6XG4gICAgICpcbiAgICAgKiAtIHtAbGluayBQSVhFTEZPUk1BVF9BOH1cbiAgICAgKiAtIHtAbGluayBQSVhFTEZPUk1BVF9MOH1cbiAgICAgKiAtIHtAbGluayBQSVhFTEZPUk1BVF9MQTh9XG4gICAgICogLSB7QGxpbmsgUElYRUxGT1JNQVRfUkdCNTY1fVxuICAgICAqIC0ge0BsaW5rIFBJWEVMRk9STUFUX1JHQkE1NTUxfVxuICAgICAqIC0ge0BsaW5rIFBJWEVMRk9STUFUX1JHQkE0fVxuICAgICAqIC0ge0BsaW5rIFBJWEVMRk9STUFUX1JHQjh9XG4gICAgICogLSB7QGxpbmsgUElYRUxGT1JNQVRfUkdCQTh9XG4gICAgICogLSB7QGxpbmsgUElYRUxGT1JNQVRfRFhUMX1cbiAgICAgKiAtIHtAbGluayBQSVhFTEZPUk1BVF9EWFQzfVxuICAgICAqIC0ge0BsaW5rIFBJWEVMRk9STUFUX0RYVDV9XG4gICAgICogLSB7QGxpbmsgUElYRUxGT1JNQVRfUkdCMTZGfVxuICAgICAqIC0ge0BsaW5rIFBJWEVMRk9STUFUX1JHQkExNkZ9XG4gICAgICogLSB7QGxpbmsgUElYRUxGT1JNQVRfUkdCMzJGfVxuICAgICAqIC0ge0BsaW5rIFBJWEVMRk9STUFUX1JHQkEzMkZ9XG4gICAgICogLSB7QGxpbmsgUElYRUxGT1JNQVRfRVRDMX1cbiAgICAgKiAtIHtAbGluayBQSVhFTEZPUk1BVF9QVlJUQ18yQlBQX1JHQl8xfVxuICAgICAqIC0ge0BsaW5rIFBJWEVMRk9STUFUX1BWUlRDXzJCUFBfUkdCQV8xfVxuICAgICAqIC0ge0BsaW5rIFBJWEVMRk9STUFUX1BWUlRDXzRCUFBfUkdCXzF9XG4gICAgICogLSB7QGxpbmsgUElYRUxGT1JNQVRfUFZSVENfNEJQUF9SR0JBXzF9XG4gICAgICogLSB7QGxpbmsgUElYRUxGT1JNQVRfMTExMTEwRn1cbiAgICAgKiAtIHtAbGluayBQSVhFTEZPUk1BVF9BU1RDXzR4NH1cbiAgICAgKiAtIHtAbGluayBQSVhFTEZPUk1BVF9BVENfUkdCfVxuICAgICAqIC0ge0BsaW5rIFBJWEVMRk9STUFUX0FUQ19SR0JBfVxuICAgICAqXG4gICAgICogRGVmYXVsdHMgdG8ge0BsaW5rIFBJWEVMRk9STUFUX1JHQkE4fS5cbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gW29wdGlvbnMucHJvamVjdGlvbl0gLSBUaGUgcHJvamVjdGlvbiB0eXBlIG9mIHRoZSB0ZXh0dXJlLCB1c2VkIHdoZW4gdGhlXG4gICAgICogdGV4dHVyZSByZXByZXNlbnRzIGFuIGVudmlyb25tZW50LiBDYW4gYmU6XG4gICAgICpcbiAgICAgKiAtIHtAbGluayBURVhUVVJFUFJPSkVDVElPTl9OT05FfVxuICAgICAqIC0ge0BsaW5rIFRFWFRVUkVQUk9KRUNUSU9OX0NVQkV9XG4gICAgICogLSB7QGxpbmsgVEVYVFVSRVBST0pFQ1RJT05fRVFVSVJFQ1R9XG4gICAgICogLSB7QGxpbmsgVEVYVFVSRVBST0pFQ1RJT05fT0NUQUhFRFJBTH1cbiAgICAgKlxuICAgICAqIERlZmF1bHRzIHRvIHtAbGluayBURVhUVVJFUFJPSkVDVElPTl9DVUJFfSBpZiBvcHRpb25zLmN1YmVtYXAgaXMgdHJ1ZSwgb3RoZXJ3aXNlXG4gICAgICoge0BsaW5rIFRFWFRVUkVQUk9KRUNUSU9OX05PTkV9LlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBbb3B0aW9ucy5taW5GaWx0ZXJdIC0gVGhlIG1pbmlmaWNhdGlvbiBmaWx0ZXIgdHlwZSB0byB1c2UuIERlZmF1bHRzIHRvXG4gICAgICoge0BsaW5rIEZJTFRFUl9MSU5FQVJfTUlQTUFQX0xJTkVBUn0uXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFtvcHRpb25zLm1hZ0ZpbHRlcl0gLSBUaGUgbWFnbmlmaWNhdGlvbiBmaWx0ZXIgdHlwZSB0byB1c2UuIERlZmF1bHRzIHRvXG4gICAgICoge0BsaW5rIEZJTFRFUl9MSU5FQVJ9LlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBbb3B0aW9ucy5hbmlzb3Ryb3B5XSAtIFRoZSBsZXZlbCBvZiBhbmlzb3Ryb3BpYyBmaWx0ZXJpbmcgdG8gdXNlLiBEZWZhdWx0c1xuICAgICAqIHRvIDEuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFtvcHRpb25zLmFkZHJlc3NVXSAtIFRoZSByZXBlYXQgbW9kZSB0byB1c2UgaW4gdGhlIFUgZGlyZWN0aW9uLiBEZWZhdWx0cyB0b1xuICAgICAqIHtAbGluayBBRERSRVNTX1JFUEVBVH0uXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFtvcHRpb25zLmFkZHJlc3NWXSAtIFRoZSByZXBlYXQgbW9kZSB0byB1c2UgaW4gdGhlIFYgZGlyZWN0aW9uLiBEZWZhdWx0cyB0b1xuICAgICAqIHtAbGluayBBRERSRVNTX1JFUEVBVH0uXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFtvcHRpb25zLmFkZHJlc3NXXSAtIFRoZSByZXBlYXQgbW9kZSB0byB1c2UgaW4gdGhlIFcgZGlyZWN0aW9uLiBEZWZhdWx0cyB0b1xuICAgICAqIHtAbGluayBBRERSRVNTX1JFUEVBVH0uXG4gICAgICogQHBhcmFtIHtib29sZWFufSBbb3B0aW9ucy5taXBtYXBzXSAtIFdoZW4gZW5hYmxlZCB0cnkgdG8gZ2VuZXJhdGUgb3IgdXNlIG1pcG1hcHMgZm9yIHRoaXNcbiAgICAgKiB0ZXh0dXJlLiBEZWZhdWx0IGlzIHRydWUuXG4gICAgICogQHBhcmFtIHtib29sZWFufSBbb3B0aW9ucy5jdWJlbWFwXSAtIFNwZWNpZmllcyB3aGV0aGVyIHRoZSB0ZXh0dXJlIGlzIHRvIGJlIGEgY3ViZW1hcC5cbiAgICAgKiBEZWZhdWx0cyB0byBmYWxzZS5cbiAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IFtvcHRpb25zLnZvbHVtZV0gLSBTcGVjaWZpZXMgd2hldGhlciB0aGUgdGV4dHVyZSBpcyB0byBiZSBhIDNEIHZvbHVtZVxuICAgICAqIChub3Qgc3VwcG9ydGVkIGJ5IFdlYkdMMSkuIERlZmF1bHRzIHRvIGZhbHNlLlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBbb3B0aW9ucy50eXBlXSAtIFNwZWNpZmllcyB0aGUgdGV4dHVyZSB0eXBlLiAgQ2FuIGJlOlxuICAgICAqXG4gICAgICogLSB7QGxpbmsgVEVYVFVSRVRZUEVfREVGQVVMVH1cbiAgICAgKiAtIHtAbGluayBURVhUVVJFVFlQRV9SR0JNfVxuICAgICAqIC0ge0BsaW5rIFRFWFRVUkVUWVBFX1JHQkV9XG4gICAgICogLSB7QGxpbmsgVEVYVFVSRVRZUEVfUkdCUH1cbiAgICAgKiAtIHtAbGluayBURVhUVVJFVFlQRV9TV0laWkxFR0dHUn1cbiAgICAgKlxuICAgICAqIERlZmF1bHRzIHRvIHtAbGluayBURVhUVVJFVFlQRV9ERUZBVUxUfS5cbiAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IFtvcHRpb25zLmZpeEN1YmVtYXBTZWFtc10gLSBTcGVjaWZpZXMgd2hldGhlciB0aGlzIGN1YmVtYXAgdGV4dHVyZSByZXF1aXJlc1xuICAgICAqIHNwZWNpYWwgc2VhbSBmaXhpbmcgc2hhZGVyIGNvZGUgdG8gbG9vayByaWdodC4gRGVmYXVsdHMgdG8gZmFsc2UuXG4gICAgICogQHBhcmFtIHtib29sZWFufSBbb3B0aW9ucy5mbGlwWV0gLSBTcGVjaWZpZXMgd2hldGhlciB0aGUgdGV4dHVyZSBzaG91bGQgYmUgZmxpcHBlZCBpbiB0aGVcbiAgICAgKiBZLWRpcmVjdGlvbi4gT25seSBhZmZlY3RzIHRleHR1cmVzIHdpdGggYSBzb3VyY2UgdGhhdCBpcyBhbiBpbWFnZSwgY2FudmFzIG9yIHZpZGVvIGVsZW1lbnQuXG4gICAgICogRG9lcyBub3QgYWZmZWN0IGN1YmVtYXBzLCBjb21wcmVzc2VkIHRleHR1cmVzIG9yIHRleHR1cmVzIHNldCBmcm9tIHJhdyBwaXhlbCBkYXRhLiBEZWZhdWx0c1xuICAgICAqIHRvIGZhbHNlLlxuICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gW29wdGlvbnMucHJlbXVsdGlwbHlBbHBoYV0gLSBJZiB0cnVlLCB0aGUgYWxwaGEgY2hhbm5lbCBvZiB0aGUgdGV4dHVyZSAoaWZcbiAgICAgKiBwcmVzZW50KSBpcyBtdWx0aXBsaWVkIGludG8gdGhlIGNvbG9yIGNoYW5uZWxzLiBEZWZhdWx0cyB0byBmYWxzZS5cbiAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IFtvcHRpb25zLmNvbXBhcmVPblJlYWRdIC0gV2hlbiBlbmFibGVkLCBhbmQgaWYgdGV4dHVyZSBmb3JtYXQgaXNcbiAgICAgKiB7QGxpbmsgUElYRUxGT1JNQVRfREVQVEh9IG9yIHtAbGluayBQSVhFTEZPUk1BVF9ERVBUSFNURU5DSUx9LCBoYXJkd2FyZSBQQ0YgaXMgZW5hYmxlZCBmb3JcbiAgICAgKiB0aGlzIHRleHR1cmUsIGFuZCB5b3UgY2FuIGdldCBmaWx0ZXJlZCByZXN1bHRzIG9mIGNvbXBhcmlzb24gdXNpbmcgdGV4dHVyZSgpIGluIHlvdXIgc2hhZGVyXG4gICAgICogKG5vdCBzdXBwb3J0ZWQgYnkgV2ViR0wxKS4gRGVmYXVsdHMgdG8gZmFsc2UuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFtvcHRpb25zLmNvbXBhcmVGdW5jXSAtIENvbXBhcmlzb24gZnVuY3Rpb24gd2hlbiBjb21wYXJlT25SZWFkIGlzIGVuYWJsZWRcbiAgICAgKiAobm90IHN1cHBvcnRlZCBieSBXZWJHTDEpLiBDYW4gYmU6XG4gICAgICpcbiAgICAgKiAtIHtAbGluayBGVU5DX0xFU1N9XG4gICAgICogLSB7QGxpbmsgRlVOQ19MRVNTRVFVQUx9XG4gICAgICogLSB7QGxpbmsgRlVOQ19HUkVBVEVSfVxuICAgICAqIC0ge0BsaW5rIEZVTkNfR1JFQVRFUkVRVUFMfVxuICAgICAqIC0ge0BsaW5rIEZVTkNfRVFVQUx9XG4gICAgICogLSB7QGxpbmsgRlVOQ19OT1RFUVVBTH1cbiAgICAgKlxuICAgICAqIERlZmF1bHRzIHRvIHtAbGluayBGVU5DX0xFU1N9LlxuICAgICAqIEBwYXJhbSB7VWludDhBcnJheVtdfSBbb3B0aW9ucy5sZXZlbHNdIC0gQXJyYXkgb2YgVWludDhBcnJheS5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIC8vIENyZWF0ZSBhIDh4OHgyNC1iaXQgdGV4dHVyZVxuICAgICAqIGNvbnN0IHRleHR1cmUgPSBuZXcgcGMuVGV4dHVyZShncmFwaGljc0RldmljZSwge1xuICAgICAqICAgICB3aWR0aDogOCxcbiAgICAgKiAgICAgaGVpZ2h0OiA4LFxuICAgICAqICAgICBmb3JtYXQ6IHBjLlBJWEVMRk9STUFUX1JHQjhcbiAgICAgKiB9KTtcbiAgICAgKlxuICAgICAqIC8vIEZpbGwgdGhlIHRleHR1cmUgd2l0aCBhIGdyYWRpZW50XG4gICAgICogY29uc3QgcGl4ZWxzID0gdGV4dHVyZS5sb2NrKCk7XG4gICAgICogY29uc3QgY291bnQgPSAwO1xuICAgICAqIGZvciAobGV0IGkgPSAwOyBpIDwgODsgaSsrKSB7XG4gICAgICogICAgIGZvciAobGV0IGogPSAwOyBqIDwgODsgaisrKSB7XG4gICAgICogICAgICAgICBwaXhlbHNbY291bnQrK10gPSBpICogMzI7XG4gICAgICogICAgICAgICBwaXhlbHNbY291bnQrK10gPSBqICogMzI7XG4gICAgICogICAgICAgICBwaXhlbHNbY291bnQrK10gPSAyNTU7XG4gICAgICogICAgIH1cbiAgICAgKiB9XG4gICAgICogdGV4dHVyZS51bmxvY2soKTtcbiAgICAgKi9cbiAgICBjb25zdHJ1Y3RvcihncmFwaGljc0RldmljZSwgb3B0aW9ucyA9IHt9KSB7XG4gICAgICAgIHRoaXMuZGV2aWNlID0gZ3JhcGhpY3NEZXZpY2U7XG4gICAgICAgIERlYnVnLmFzc2VydCh0aGlzLmRldmljZSwgXCJUZXh0dXJlIGNvbnN0cnVjdG9yIHJlcXVpcmVzIGEgZ3JhcGhpY3NEZXZpY2UgdG8gYmUgdmFsaWRcIik7XG5cbiAgICAgICAgdGhpcy5uYW1lID0gb3B0aW9ucy5uYW1lID8/IG51bGw7XG5cbiAgICAgICAgdGhpcy5fd2lkdGggPSBvcHRpb25zLndpZHRoID8/IDQ7XG4gICAgICAgIHRoaXMuX2hlaWdodCA9IG9wdGlvbnMuaGVpZ2h0ID8/IDQ7XG5cbiAgICAgICAgdGhpcy5fZm9ybWF0ID0gb3B0aW9ucy5mb3JtYXQgPz8gUElYRUxGT1JNQVRfUkdCQTg7XG4gICAgICAgIHRoaXMuX2NvbXByZXNzZWQgPSBpc0NvbXByZXNzZWRQaXhlbEZvcm1hdCh0aGlzLl9mb3JtYXQpO1xuXG4gICAgICAgIGlmIChncmFwaGljc0RldmljZS5zdXBwb3J0c1ZvbHVtZVRleHR1cmVzKSB7XG4gICAgICAgICAgICB0aGlzLl92b2x1bWUgPSBvcHRpb25zLnZvbHVtZSA/PyBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMuX2RlcHRoID0gb3B0aW9ucy5kZXB0aCA/PyAxO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5fdm9sdW1lID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLl9kZXB0aCA9IDE7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl9jdWJlbWFwID0gb3B0aW9ucy5jdWJlbWFwID8/IGZhbHNlO1xuICAgICAgICB0aGlzLmZpeEN1YmVtYXBTZWFtcyA9IG9wdGlvbnMuZml4Q3ViZW1hcFNlYW1zID8/IGZhbHNlO1xuICAgICAgICB0aGlzLl9mbGlwWSA9IG9wdGlvbnMuZmxpcFkgPz8gZmFsc2U7XG4gICAgICAgIHRoaXMuX3ByZW11bHRpcGx5QWxwaGEgPSBvcHRpb25zLnByZW11bHRpcGx5QWxwaGEgPz8gZmFsc2U7XG5cbiAgICAgICAgdGhpcy5fbWlwbWFwcyA9IG9wdGlvbnMubWlwbWFwcyA/PyBvcHRpb25zLmF1dG9NaXBtYXAgPz8gdHJ1ZTtcbiAgICAgICAgdGhpcy5fbWluRmlsdGVyID0gb3B0aW9ucy5taW5GaWx0ZXIgPz8gRklMVEVSX0xJTkVBUl9NSVBNQVBfTElORUFSO1xuICAgICAgICB0aGlzLl9tYWdGaWx0ZXIgPSBvcHRpb25zLm1hZ0ZpbHRlciA/PyBGSUxURVJfTElORUFSO1xuICAgICAgICB0aGlzLl9hbmlzb3Ryb3B5ID0gb3B0aW9ucy5hbmlzb3Ryb3B5ID8/IDE7XG4gICAgICAgIHRoaXMuX2FkZHJlc3NVID0gb3B0aW9ucy5hZGRyZXNzVSA/PyBBRERSRVNTX1JFUEVBVDtcbiAgICAgICAgdGhpcy5fYWRkcmVzc1YgPSBvcHRpb25zLmFkZHJlc3NWID8/IEFERFJFU1NfUkVQRUFUO1xuICAgICAgICB0aGlzLl9hZGRyZXNzVyA9IG9wdGlvbnMuYWRkcmVzc1cgPz8gQUREUkVTU19SRVBFQVQ7XG5cbiAgICAgICAgdGhpcy5fY29tcGFyZU9uUmVhZCA9IG9wdGlvbnMuY29tcGFyZU9uUmVhZCA/PyBmYWxzZTtcbiAgICAgICAgdGhpcy5fY29tcGFyZUZ1bmMgPSBvcHRpb25zLmNvbXBhcmVGdW5jID8/IEZVTkNfTEVTUztcblxuICAgICAgICB0aGlzLnR5cGUgPSBURVhUVVJFVFlQRV9ERUZBVUxUO1xuICAgICAgICBpZiAob3B0aW9ucy5oYXNPd25Qcm9wZXJ0eSgndHlwZScpKSB7XG4gICAgICAgICAgICB0aGlzLnR5cGUgPSBvcHRpb25zLnR5cGU7XG4gICAgICAgIH0gZWxzZSBpZiAob3B0aW9ucy5oYXNPd25Qcm9wZXJ0eSgncmdibScpKSB7XG4gICAgICAgICAgICBEZWJ1Zy5kZXByZWNhdGVkKFwib3B0aW9ucy5yZ2JtIGlzIGRlcHJlY2F0ZWQuIFVzZSBvcHRpb25zLnR5cGUgaW5zdGVhZC5cIik7XG4gICAgICAgICAgICB0aGlzLnR5cGUgPSBvcHRpb25zLnJnYm0gPyBURVhUVVJFVFlQRV9SR0JNIDogVEVYVFVSRVRZUEVfREVGQVVMVDtcbiAgICAgICAgfSBlbHNlIGlmIChvcHRpb25zLmhhc093blByb3BlcnR5KCdzd2l6emxlR0dHUicpKSB7XG4gICAgICAgICAgICBEZWJ1Zy5kZXByZWNhdGVkKFwib3B0aW9ucy5zd2l6emxlR0dHUiBpcyBkZXByZWNhdGVkLiBVc2Ugb3B0aW9ucy50eXBlIGluc3RlYWQuXCIpO1xuICAgICAgICAgICAgdGhpcy50eXBlID0gb3B0aW9ucy5zd2l6emxlR0dHUiA/IFRFWFRVUkVUWVBFX1NXSVpaTEVHR0dSIDogVEVYVFVSRVRZUEVfREVGQVVMVDtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMucHJvamVjdGlvbiA9IFRFWFRVUkVQUk9KRUNUSU9OX05PTkU7XG4gICAgICAgIGlmICh0aGlzLl9jdWJlbWFwKSB7XG4gICAgICAgICAgICB0aGlzLnByb2plY3Rpb24gPSBURVhUVVJFUFJPSkVDVElPTl9DVUJFO1xuICAgICAgICB9IGVsc2UgaWYgKG9wdGlvbnMucHJvamVjdGlvbiAmJiBvcHRpb25zLnByb2plY3Rpb24gIT09IFRFWFRVUkVQUk9KRUNUSU9OX0NVQkUpIHtcbiAgICAgICAgICAgIHRoaXMucHJvamVjdGlvbiA9IG9wdGlvbnMucHJvamVjdGlvbjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuaW1wbCA9IGdyYXBoaWNzRGV2aWNlLmNyZWF0ZVRleHR1cmVJbXBsKHRoaXMpO1xuXG4gICAgICAgIC8vICNpZiBfUFJPRklMRVJcbiAgICAgICAgdGhpcy5wcm9maWxlckhpbnQgPSBvcHRpb25zLnByb2ZpbGVySGludCA/PyAwO1xuICAgICAgICAvLyAjZW5kaWZcblxuICAgICAgICB0aGlzLmRpcnR5QWxsKCk7XG5cbiAgICAgICAgdGhpcy5fbGV2ZWxzID0gb3B0aW9ucy5sZXZlbHM7XG4gICAgICAgIGlmICh0aGlzLl9sZXZlbHMpIHtcbiAgICAgICAgICAgIHRoaXMudXBsb2FkKCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLl9sZXZlbHMgPSB0aGlzLl9jdWJlbWFwID8gW1tudWxsLCBudWxsLCBudWxsLCBudWxsLCBudWxsLCBudWxsXV0gOiBbbnVsbF07XG4gICAgICAgIH1cblxuICAgICAgICAvLyB0cmFjayB0aGUgdGV4dHVyZVxuICAgICAgICBncmFwaGljc0RldmljZS50ZXh0dXJlcy5wdXNoKHRoaXMpO1xuXG4gICAgICAgIERlYnVnLnRyYWNlKFRSQUNFSURfVEVYVFVSRV9BTExPQywgYEFsbG9jOiBJZCAke3RoaXMuaWR9ICR7dGhpcy5uYW1lfTogJHt0aGlzLndpZHRofXgke3RoaXMuaGVpZ2h0fSBgICtcbiAgICAgICAgICAgIGAke3RoaXMuY3ViZW1hcCA/ICdbQ3ViZW1hcF0nIDogJyd9YCArXG4gICAgICAgICAgICBgJHt0aGlzLnZvbHVtZSA/ICdbVm9sdW1lXScgOiAnJ31gICtcbiAgICAgICAgICAgIGAke3RoaXMubWlwbWFwcyA/ICdbTWlwbWFwc10nIDogJyd9YCwgdGhpcyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRnJlZXMgcmVzb3VyY2VzIGFzc29jaWF0ZWQgd2l0aCB0aGlzIHRleHR1cmUuXG4gICAgICovXG4gICAgZGVzdHJveSgpIHtcblxuICAgICAgICBEZWJ1Zy50cmFjZShUUkFDRUlEX1RFWFRVUkVfQUxMT0MsIGBEZUFsbG9jOiBJZCAke3RoaXMuaWR9ICR7dGhpcy5uYW1lfWApO1xuXG4gICAgICAgIGNvbnN0IGRldmljZSA9IHRoaXMuZGV2aWNlO1xuICAgICAgICBpZiAoZGV2aWNlKSB7XG4gICAgICAgICAgICAvLyBzdG9wIHRyYWNraW5nIHRoZSB0ZXh0dXJlXG4gICAgICAgICAgICBjb25zdCBpZHggPSBkZXZpY2UudGV4dHVyZXMuaW5kZXhPZih0aGlzKTtcbiAgICAgICAgICAgIGlmIChpZHggIT09IC0xKSB7XG4gICAgICAgICAgICAgICAgZGV2aWNlLnRleHR1cmVzLnNwbGljZShpZHgsIDEpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBSZW1vdmUgdGV4dHVyZSBmcm9tIGFueSB1bmlmb3Jtc1xuICAgICAgICAgICAgZGV2aWNlLnNjb3BlLnJlbW92ZVZhbHVlKHRoaXMpO1xuXG4gICAgICAgICAgICAvLyBkZXN0cm95IGltcGxlbWVudGF0aW9uXG4gICAgICAgICAgICB0aGlzLmltcGwuZGVzdHJveShkZXZpY2UpO1xuXG4gICAgICAgICAgICAvLyBVcGRhdGUgdGV4dHVyZSBzdGF0c1xuICAgICAgICAgICAgdGhpcy5hZGp1c3RWcmFtU2l6ZVRyYWNraW5nKGRldmljZS5fdnJhbSwgLXRoaXMuX2dwdVNpemUpO1xuXG4gICAgICAgICAgICB0aGlzLl9sZXZlbHMgPSBudWxsO1xuICAgICAgICAgICAgdGhpcy5kZXZpY2UgPSBudWxsO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVzaXplcyB0aGUgdGV4dHVyZS4gT25seSBzdXBwb3J0ZWQgZm9yIHJlbmRlciB0YXJnZXQgdGV4dHVyZXMsIGFzIGl0IGRvZXMgbm90IHJlc2l6ZSB0aGVcbiAgICAgKiBleGlzdGluZyBjb250ZW50IG9mIHRoZSB0ZXh0dXJlLCBidXQgb25seSB0aGUgYWxsb2NhdGVkIGJ1ZmZlciBmb3IgcmVuZGVyaW5nIGludG8uXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gd2lkdGggLSBUaGUgbmV3IHdpZHRoIG9mIHRoZSB0ZXh0dXJlLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBoZWlnaHQgLSBUaGUgbmV3IGhlaWdodCBvZiB0aGUgdGV4dHVyZS5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gW2RlcHRoXSAtIFRoZSBuZXcgZGVwdGggb2YgdGhlIHRleHR1cmUuIERlZmF1bHRzIHRvIDEuXG4gICAgICogQGlnbm9yZVxuICAgICAqL1xuICAgIHJlc2l6ZSh3aWR0aCwgaGVpZ2h0LCBkZXB0aCA9IDEpIHtcblxuICAgICAgICAvLyBkZXN0cm95IHRleHR1cmUgaW1wbFxuICAgICAgICBjb25zdCBkZXZpY2UgPSB0aGlzLmRldmljZTtcbiAgICAgICAgdGhpcy5hZGp1c3RWcmFtU2l6ZVRyYWNraW5nKGRldmljZS5fdnJhbSwgLXRoaXMuX2dwdVNpemUpO1xuICAgICAgICB0aGlzLmltcGwuZGVzdHJveShkZXZpY2UpO1xuXG4gICAgICAgIHRoaXMuX3dpZHRoID0gd2lkdGg7XG4gICAgICAgIHRoaXMuX2hlaWdodCA9IGhlaWdodDtcbiAgICAgICAgdGhpcy5fZGVwdGggPSBkZXB0aDtcblxuICAgICAgICAvLyByZS1jcmVhdGUgdGhlIGltcGxlbWVudGF0aW9uXG4gICAgICAgIHRoaXMuaW1wbCA9IGRldmljZS5jcmVhdGVUZXh0dXJlSW1wbCh0aGlzKTtcbiAgICAgICAgdGhpcy5kaXJ0eUFsbCgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENhbGxlZCB3aGVuIHRoZSByZW5kZXJpbmcgY29udGV4dCB3YXMgbG9zdC4gSXQgcmVsZWFzZXMgYWxsIGNvbnRleHQgcmVsYXRlZCByZXNvdXJjZXMuXG4gICAgICpcbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgbG9zZUNvbnRleHQoKSB7XG4gICAgICAgIHRoaXMuaW1wbC5sb3NlQ29udGV4dCgpO1xuICAgICAgICB0aGlzLmRpcnR5QWxsKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVXBkYXRlcyB2cmFtIHNpemUgdHJhY2tpbmcgZm9yIHRoZSB0ZXh0dXJlLCBzaXplIGNhbiBiZSBwb3NpdGl2ZSB0byBhZGQgb3IgbmVnYXRpdmUgdG8gc3VidHJhY3RcbiAgICAgKlxuICAgICAqIEBpZ25vcmVcbiAgICAgKi9cbiAgICBhZGp1c3RWcmFtU2l6ZVRyYWNraW5nKHZyYW0sIHNpemUpIHtcblxuICAgICAgICBEZWJ1Zy50cmFjZShUUkFDRUlEX1ZSQU1fVEVYVFVSRSwgYCR7dGhpcy5pZH0gJHt0aGlzLm5hbWV9IHNpemU6ICR7c2l6ZX0gdnJhbS50ZXh0dXJlOiAke3ZyYW0udGV4fSA9PiAke3ZyYW0udGV4ICsgc2l6ZX1gKTtcblxuICAgICAgICB2cmFtLnRleCArPSBzaXplO1xuXG4gICAgICAgIC8vICNpZiBfUFJPRklMRVJcbiAgICAgICAgaWYgKHRoaXMucHJvZmlsZXJIaW50ID09PSBURVhISU5UX1NIQURPV01BUCkge1xuICAgICAgICAgICAgdnJhbS50ZXhTaGFkb3cgKz0gc2l6ZTtcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLnByb2ZpbGVySGludCA9PT0gVEVYSElOVF9BU1NFVCkge1xuICAgICAgICAgICAgdnJhbS50ZXhBc3NldCArPSBzaXplO1xuICAgICAgICB9IGVsc2UgaWYgKHRoaXMucHJvZmlsZXJIaW50ID09PSBURVhISU5UX0xJR0hUTUFQKSB7XG4gICAgICAgICAgICB2cmFtLnRleExpZ2h0bWFwICs9IHNpemU7XG4gICAgICAgIH1cbiAgICAgICAgLy8gI2VuZGlmXG4gICAgfVxuXG4gICAgcHJvcGVydHlDaGFuZ2VkKGZsYWcpIHtcbiAgICAgICAgdGhpcy5pbXBsLnByb3BlcnR5Q2hhbmdlZChmbGFnKTtcbiAgICAgICAgdGhpcy5yZW5kZXJWZXJzaW9uRGlydHkgPSB0aGlzLmRldmljZS5yZW5kZXJWZXJzaW9uO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgbnVtYmVyIG9mIHJlcXVpcmVkIG1pcCBsZXZlbHMgZm9yIHRoZSB0ZXh0dXJlIGJhc2VkIG9uIGl0cyBkaW1lbnNpb25zIGFuZCBwYXJhbWV0ZXJzLlxuICAgICAqXG4gICAgICogQGlnbm9yZVxuICAgICAqIEB0eXBlIHtudW1iZXJ9XG4gICAgICovXG4gICAgZ2V0IHJlcXVpcmVkTWlwTGV2ZWxzKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5taXBtYXBzID8gTWF0aC5mbG9vcihNYXRoLmxvZzIoTWF0aC5tYXgodGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpKSkgKyAxIDogMTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUaGUgbWluaWZpY2F0aW9uIGZpbHRlciB0byBiZSBhcHBsaWVkIHRvIHRoZSB0ZXh0dXJlLiBDYW4gYmU6XG4gICAgICpcbiAgICAgKiAtIHtAbGluayBGSUxURVJfTkVBUkVTVH1cbiAgICAgKiAtIHtAbGluayBGSUxURVJfTElORUFSfVxuICAgICAqIC0ge0BsaW5rIEZJTFRFUl9ORUFSRVNUX01JUE1BUF9ORUFSRVNUfVxuICAgICAqIC0ge0BsaW5rIEZJTFRFUl9ORUFSRVNUX01JUE1BUF9MSU5FQVJ9XG4gICAgICogLSB7QGxpbmsgRklMVEVSX0xJTkVBUl9NSVBNQVBfTkVBUkVTVH1cbiAgICAgKiAtIHtAbGluayBGSUxURVJfTElORUFSX01JUE1BUF9MSU5FQVJ9XG4gICAgICpcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqL1xuICAgIHNldCBtaW5GaWx0ZXIodikge1xuICAgICAgICBpZiAodGhpcy5fbWluRmlsdGVyICE9PSB2KSB7XG4gICAgICAgICAgICB0aGlzLl9taW5GaWx0ZXIgPSB2O1xuICAgICAgICAgICAgdGhpcy5wcm9wZXJ0eUNoYW5nZWQoMSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBnZXQgbWluRmlsdGVyKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fbWluRmlsdGVyO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRoZSBtYWduaWZpY2F0aW9uIGZpbHRlciB0byBiZSBhcHBsaWVkIHRvIHRoZSB0ZXh0dXJlLiBDYW4gYmU6XG4gICAgICpcbiAgICAgKiAtIHtAbGluayBGSUxURVJfTkVBUkVTVH1cbiAgICAgKiAtIHtAbGluayBGSUxURVJfTElORUFSfVxuICAgICAqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKi9cbiAgICBzZXQgbWFnRmlsdGVyKHYpIHtcbiAgICAgICAgaWYgKHRoaXMuX21hZ0ZpbHRlciAhPT0gdikge1xuICAgICAgICAgICAgdGhpcy5fbWFnRmlsdGVyID0gdjtcbiAgICAgICAgICAgIHRoaXMucHJvcGVydHlDaGFuZ2VkKDIpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2V0IG1hZ0ZpbHRlcigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX21hZ0ZpbHRlcjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUaGUgYWRkcmVzc2luZyBtb2RlIHRvIGJlIGFwcGxpZWQgdG8gdGhlIHRleHR1cmUgaG9yaXpvbnRhbGx5LiBDYW4gYmU6XG4gICAgICpcbiAgICAgKiAtIHtAbGluayBBRERSRVNTX1JFUEVBVH1cbiAgICAgKiAtIHtAbGluayBBRERSRVNTX0NMQU1QX1RPX0VER0V9XG4gICAgICogLSB7QGxpbmsgQUREUkVTU19NSVJST1JFRF9SRVBFQVR9XG4gICAgICpcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqL1xuICAgIHNldCBhZGRyZXNzVSh2KSB7XG4gICAgICAgIGlmICh0aGlzLl9hZGRyZXNzVSAhPT0gdikge1xuICAgICAgICAgICAgdGhpcy5fYWRkcmVzc1UgPSB2O1xuICAgICAgICAgICAgdGhpcy5wcm9wZXJ0eUNoYW5nZWQoNCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBnZXQgYWRkcmVzc1UoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGRyZXNzVTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUaGUgYWRkcmVzc2luZyBtb2RlIHRvIGJlIGFwcGxpZWQgdG8gdGhlIHRleHR1cmUgdmVydGljYWxseS4gQ2FuIGJlOlxuICAgICAqXG4gICAgICogLSB7QGxpbmsgQUREUkVTU19SRVBFQVR9XG4gICAgICogLSB7QGxpbmsgQUREUkVTU19DTEFNUF9UT19FREdFfVxuICAgICAqIC0ge0BsaW5rIEFERFJFU1NfTUlSUk9SRURfUkVQRUFUfVxuICAgICAqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKi9cbiAgICBzZXQgYWRkcmVzc1Yodikge1xuICAgICAgICBpZiAodGhpcy5fYWRkcmVzc1YgIT09IHYpIHtcbiAgICAgICAgICAgIHRoaXMuX2FkZHJlc3NWID0gdjtcbiAgICAgICAgICAgIHRoaXMucHJvcGVydHlDaGFuZ2VkKDgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2V0IGFkZHJlc3NWKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRkcmVzc1Y7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVGhlIGFkZHJlc3NpbmcgbW9kZSB0byBiZSBhcHBsaWVkIHRvIHRoZSAzRCB0ZXh0dXJlIGRlcHRoIChub3Qgc3VwcG9ydGVkIG9uIFdlYkdMMSkuIENhbiBiZTpcbiAgICAgKlxuICAgICAqIC0ge0BsaW5rIEFERFJFU1NfUkVQRUFUfVxuICAgICAqIC0ge0BsaW5rIEFERFJFU1NfQ0xBTVBfVE9fRURHRX1cbiAgICAgKiAtIHtAbGluayBBRERSRVNTX01JUlJPUkVEX1JFUEVBVH1cbiAgICAgKlxuICAgICAqIEB0eXBlIHtudW1iZXJ9XG4gICAgICovXG4gICAgc2V0IGFkZHJlc3NXKGFkZHJlc3NXKSB7XG4gICAgICAgIGlmICghdGhpcy5kZXZpY2Uuc3VwcG9ydHNWb2x1bWVUZXh0dXJlcykgcmV0dXJuO1xuICAgICAgICBpZiAoIXRoaXMuX3ZvbHVtZSkge1xuICAgICAgICAgICAgRGVidWcud2FybihcInBjLlRleHR1cmUjYWRkcmVzc1c6IENhbid0IHNldCBXIGFkZHJlc3NpbmcgbW9kZSBmb3IgYSBub24tM0QgdGV4dHVyZS5cIik7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGFkZHJlc3NXICE9PSB0aGlzLl9hZGRyZXNzVykge1xuICAgICAgICAgICAgdGhpcy5fYWRkcmVzc1cgPSBhZGRyZXNzVztcbiAgICAgICAgICAgIHRoaXMucHJvcGVydHlDaGFuZ2VkKDE2KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGdldCBhZGRyZXNzVygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkZHJlc3NXO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFdoZW4gZW5hYmxlZCwgYW5kIGlmIHRleHR1cmUgZm9ybWF0IGlzIHtAbGluayBQSVhFTEZPUk1BVF9ERVBUSH0gb3JcbiAgICAgKiB7QGxpbmsgUElYRUxGT1JNQVRfREVQVEhTVEVOQ0lMfSwgaGFyZHdhcmUgUENGIGlzIGVuYWJsZWQgZm9yIHRoaXMgdGV4dHVyZSwgYW5kIHlvdSBjYW4gZ2V0XG4gICAgICogZmlsdGVyZWQgcmVzdWx0cyBvZiBjb21wYXJpc29uIHVzaW5nIHRleHR1cmUoKSBpbiB5b3VyIHNoYWRlciAobm90IHN1cHBvcnRlZCBvbiBXZWJHTDEpLlxuICAgICAqXG4gICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICovXG4gICAgc2V0IGNvbXBhcmVPblJlYWQodikge1xuICAgICAgICBpZiAodGhpcy5fY29tcGFyZU9uUmVhZCAhPT0gdikge1xuICAgICAgICAgICAgdGhpcy5fY29tcGFyZU9uUmVhZCA9IHY7XG4gICAgICAgICAgICB0aGlzLnByb3BlcnR5Q2hhbmdlZCgzMik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBnZXQgY29tcGFyZU9uUmVhZCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2NvbXBhcmVPblJlYWQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ29tcGFyaXNvbiBmdW5jdGlvbiB3aGVuIGNvbXBhcmVPblJlYWQgaXMgZW5hYmxlZCAobm90IHN1cHBvcnRlZCBvbiBXZWJHTDEpLiBQb3NzaWJsZSB2YWx1ZXM6XG4gICAgICpcbiAgICAgKiAtIHtAbGluayBGVU5DX0xFU1N9XG4gICAgICogLSB7QGxpbmsgRlVOQ19MRVNTRVFVQUx9XG4gICAgICogLSB7QGxpbmsgRlVOQ19HUkVBVEVSfVxuICAgICAqIC0ge0BsaW5rIEZVTkNfR1JFQVRFUkVRVUFMfVxuICAgICAqIC0ge0BsaW5rIEZVTkNfRVFVQUx9XG4gICAgICogLSB7QGxpbmsgRlVOQ19OT1RFUVVBTH1cbiAgICAgKlxuICAgICAqIEB0eXBlIHtudW1iZXJ9XG4gICAgICovXG4gICAgc2V0IGNvbXBhcmVGdW5jKHYpIHtcbiAgICAgICAgaWYgKHRoaXMuX2NvbXBhcmVGdW5jICE9PSB2KSB7XG4gICAgICAgICAgICB0aGlzLl9jb21wYXJlRnVuYyA9IHY7XG4gICAgICAgICAgICB0aGlzLnByb3BlcnR5Q2hhbmdlZCg2NCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBnZXQgY29tcGFyZUZ1bmMoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9jb21wYXJlRnVuYztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJbnRlZ2VyIHZhbHVlIHNwZWNpZnlpbmcgdGhlIGxldmVsIG9mIGFuaXNvdHJvcGljIHRvIGFwcGx5IHRvIHRoZSB0ZXh0dXJlIHJhbmdpbmcgZnJvbSAxIChub1xuICAgICAqIGFuaXNvdHJvcGljIGZpbHRlcmluZykgdG8gdGhlIHtAbGluayBHcmFwaGljc0RldmljZX0gcHJvcGVydHkgbWF4QW5pc290cm9weS5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtudW1iZXJ9XG4gICAgICovXG4gICAgc2V0IGFuaXNvdHJvcHkodikge1xuICAgICAgICBpZiAodGhpcy5fYW5pc290cm9weSAhPT0gdikge1xuICAgICAgICAgICAgdGhpcy5fYW5pc290cm9weSA9IHY7XG4gICAgICAgICAgICB0aGlzLnByb3BlcnR5Q2hhbmdlZCgxMjgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2V0IGFuaXNvdHJvcHkoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hbmlzb3Ryb3B5O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIERlZmluZXMgaWYgdGV4dHVyZSBzaG91bGQgZ2VuZXJhdGUvdXBsb2FkIG1pcG1hcHMgaWYgcG9zc2libGUuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICAgKi9cbiAgICBzZXQgbWlwbWFwcyh2KSB7XG4gICAgICAgIGlmICh0aGlzLl9taXBtYXBzICE9PSB2KSB7XG4gICAgICAgICAgICB0aGlzLl9taXBtYXBzID0gdjtcblxuICAgICAgICAgICAgaWYgKHRoaXMuZGV2aWNlLmlzV2ViR1BVKSB7XG4gICAgICAgICAgICAgICAgRGVidWcud2FybihcIlRleHR1cmUjbWlwbWFwczogbWlwbWFwIHByb3BlcnR5IGlzIGN1cnJlbnRseSBub3QgYWxsb3dlZCB0byBiZSBjaGFuZ2VkIG9uIFdlYkdQVSwgY3JlYXRlIHRoZSB0ZXh0dXJlIGFwcHJvcHJpYXRlbHkuXCIsIHRoaXMpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAodikgdGhpcy5fbmVlZHNNaXBtYXBzVXBsb2FkID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGdldCBtaXBtYXBzKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fbWlwbWFwcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUaGUgd2lkdGggb2YgdGhlIHRleHR1cmUgaW4gcGl4ZWxzLlxuICAgICAqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKi9cbiAgICBnZXQgd2lkdGgoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl93aWR0aDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUaGUgaGVpZ2h0IG9mIHRoZSB0ZXh0dXJlIGluIHBpeGVscy5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtudW1iZXJ9XG4gICAgICovXG4gICAgZ2V0IGhlaWdodCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2hlaWdodDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUaGUgbnVtYmVyIG9mIGRlcHRoIHNsaWNlcyBpbiBhIDNEIHRleHR1cmUuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqL1xuICAgIGdldCBkZXB0aCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2RlcHRoO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRoZSBwaXhlbCBmb3JtYXQgb2YgdGhlIHRleHR1cmUuIENhbiBiZTpcbiAgICAgKlxuICAgICAqIC0ge0BsaW5rIFBJWEVMRk9STUFUX0E4fVxuICAgICAqIC0ge0BsaW5rIFBJWEVMRk9STUFUX0w4fVxuICAgICAqIC0ge0BsaW5rIFBJWEVMRk9STUFUX0xBOH1cbiAgICAgKiAtIHtAbGluayBQSVhFTEZPUk1BVF9SR0I1NjV9XG4gICAgICogLSB7QGxpbmsgUElYRUxGT1JNQVRfUkdCQTU1NTF9XG4gICAgICogLSB7QGxpbmsgUElYRUxGT1JNQVRfUkdCQTR9XG4gICAgICogLSB7QGxpbmsgUElYRUxGT1JNQVRfUkdCOH1cbiAgICAgKiAtIHtAbGluayBQSVhFTEZPUk1BVF9SR0JBOH1cbiAgICAgKiAtIHtAbGluayBQSVhFTEZPUk1BVF9EWFQxfVxuICAgICAqIC0ge0BsaW5rIFBJWEVMRk9STUFUX0RYVDN9XG4gICAgICogLSB7QGxpbmsgUElYRUxGT1JNQVRfRFhUNX1cbiAgICAgKiAtIHtAbGluayBQSVhFTEZPUk1BVF9SR0IxNkZ9XG4gICAgICogLSB7QGxpbmsgUElYRUxGT1JNQVRfUkdCQTE2Rn1cbiAgICAgKiAtIHtAbGluayBQSVhFTEZPUk1BVF9SR0IzMkZ9XG4gICAgICogLSB7QGxpbmsgUElYRUxGT1JNQVRfUkdCQTMyRn1cbiAgICAgKiAtIHtAbGluayBQSVhFTEZPUk1BVF9FVEMxfVxuICAgICAqIC0ge0BsaW5rIFBJWEVMRk9STUFUX1BWUlRDXzJCUFBfUkdCXzF9XG4gICAgICogLSB7QGxpbmsgUElYRUxGT1JNQVRfUFZSVENfMkJQUF9SR0JBXzF9XG4gICAgICogLSB7QGxpbmsgUElYRUxGT1JNQVRfUFZSVENfNEJQUF9SR0JfMX1cbiAgICAgKiAtIHtAbGluayBQSVhFTEZPUk1BVF9QVlJUQ180QlBQX1JHQkFfMX1cbiAgICAgKiAtIHtAbGluayBQSVhFTEZPUk1BVF8xMTExMTBGfVxuICAgICAqIC0ge0BsaW5rIFBJWEVMRk9STUFUX0FTVENfNHg0fT4vbGk+XG4gICAgICogLSB7QGxpbmsgUElYRUxGT1JNQVRfQVRDX1JHQn1cbiAgICAgKiAtIHtAbGluayBQSVhFTEZPUk1BVF9BVENfUkdCQX1cbiAgICAgKlxuICAgICAqIEB0eXBlIHtudW1iZXJ9XG4gICAgICovXG4gICAgZ2V0IGZvcm1hdCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2Zvcm1hdDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRydWUgaWYgdGhpcyB0ZXh0dXJlIGlzIGEgY3ViZSBtYXAgYW5kIGZhbHNlIG90aGVyd2lzZS5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAqL1xuICAgIGdldCBjdWJlbWFwKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fY3ViZW1hcDtcbiAgICB9XG5cbiAgICBnZXQgZ3B1U2l6ZSgpIHtcbiAgICAgICAgY29uc3QgbWlwcyA9IHRoaXMucG90ICYmIHRoaXMuX21pcG1hcHMgJiYgISh0aGlzLl9jb21wcmVzc2VkICYmIHRoaXMuX2xldmVscy5sZW5ndGggPT09IDEpO1xuICAgICAgICByZXR1cm4gVGV4dHVyZVV0aWxzLmNhbGNHcHVTaXplKHRoaXMuX3dpZHRoLCB0aGlzLl9oZWlnaHQsIHRoaXMuX2RlcHRoLCB0aGlzLl9mb3JtYXQsIG1pcHMsIHRoaXMuX2N1YmVtYXApO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdHJ1ZSBpZiB0aGlzIHRleHR1cmUgaXMgYSAzRCB2b2x1bWUgYW5kIGZhbHNlIG90aGVyd2lzZS5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAqL1xuICAgIGdldCB2b2x1bWUoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl92b2x1bWU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU3BlY2lmaWVzIHdoZXRoZXIgdGhlIHRleHR1cmUgc2hvdWxkIGJlIGZsaXBwZWQgaW4gdGhlIFktZGlyZWN0aW9uLiBPbmx5IGFmZmVjdHMgdGV4dHVyZXNcbiAgICAgKiB3aXRoIGEgc291cmNlIHRoYXQgaXMgYW4gaW1hZ2UsIGNhbnZhcyBvciB2aWRlbyBlbGVtZW50LiBEb2VzIG5vdCBhZmZlY3QgY3ViZW1hcHMsXG4gICAgICogY29tcHJlc3NlZCB0ZXh0dXJlcyBvciB0ZXh0dXJlcyBzZXQgZnJvbSByYXcgcGl4ZWwgZGF0YS4gRGVmYXVsdHMgdG8gdHJ1ZS5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAqL1xuICAgIHNldCBmbGlwWShmbGlwWSkge1xuICAgICAgICBpZiAodGhpcy5fZmxpcFkgIT09IGZsaXBZKSB7XG4gICAgICAgICAgICB0aGlzLl9mbGlwWSA9IGZsaXBZO1xuICAgICAgICAgICAgdGhpcy5fbmVlZHNVcGxvYWQgPSB0cnVlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2V0IGZsaXBZKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fZmxpcFk7XG4gICAgfVxuXG4gICAgc2V0IHByZW11bHRpcGx5QWxwaGEocHJlbXVsdGlwbHlBbHBoYSkge1xuICAgICAgICBpZiAodGhpcy5fcHJlbXVsdGlwbHlBbHBoYSAhPT0gcHJlbXVsdGlwbHlBbHBoYSkge1xuICAgICAgICAgICAgdGhpcy5fcHJlbXVsdGlwbHlBbHBoYSA9IHByZW11bHRpcGx5QWxwaGE7XG4gICAgICAgICAgICB0aGlzLl9uZWVkc1VwbG9hZCA9IHRydWU7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBnZXQgcHJlbXVsdGlwbHlBbHBoYSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3ByZW11bHRpcGx5QWxwaGE7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0cnVlIGlmIGFsbCBkaW1lbnNpb25zIG9mIHRoZSB0ZXh0dXJlIGFyZSBwb3dlciBvZiB0d28sIGFuZCBmYWxzZSBvdGhlcndpc2UuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICAgKi9cbiAgICBnZXQgcG90KCkge1xuICAgICAgICByZXR1cm4gbWF0aC5wb3dlck9mVHdvKHRoaXMuX3dpZHRoKSAmJiBtYXRoLnBvd2VyT2ZUd28odGhpcy5faGVpZ2h0KTtcbiAgICB9XG5cbiAgICAvLyBnZXQgdGhlIHRleHR1cmUncyBlbmNvZGluZyB0eXBlXG4gICAgZ2V0IGVuY29kaW5nKCkge1xuICAgICAgICBzd2l0Y2ggKHRoaXMudHlwZSkge1xuICAgICAgICAgICAgY2FzZSBURVhUVVJFVFlQRV9SR0JNOlxuICAgICAgICAgICAgICAgIHJldHVybiAncmdibSc7XG4gICAgICAgICAgICBjYXNlIFRFWFRVUkVUWVBFX1JHQkU6XG4gICAgICAgICAgICAgICAgcmV0dXJuICdyZ2JlJztcbiAgICAgICAgICAgIGNhc2UgVEVYVFVSRVRZUEVfUkdCUDpcbiAgICAgICAgICAgICAgICByZXR1cm4gJ3JnYnAnO1xuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICByZXR1cm4gKHRoaXMuZm9ybWF0ID09PSBQSVhFTEZPUk1BVF9SR0IxNkYgfHxcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZm9ybWF0ID09PSBQSVhFTEZPUk1BVF9SR0IzMkYgfHxcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZm9ybWF0ID09PSBQSVhFTEZPUk1BVF9SR0JBMTZGIHx8XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmZvcm1hdCA9PT0gUElYRUxGT1JNQVRfUkdCQTMyRikgPyAnbGluZWFyJyA6ICdzcmdiJztcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIEZvcmNlIGEgZnVsbCByZXN1Ym1pc3Npb24gb2YgdGhlIHRleHR1cmUgdG8gdGhlIEdQVSAodXNlZCBvbiBhIGNvbnRleHQgcmVzdG9yZSBldmVudClcbiAgICBkaXJ0eUFsbCgpIHtcbiAgICAgICAgdGhpcy5fbGV2ZWxzVXBkYXRlZCA9IHRoaXMuX2N1YmVtYXAgPyBbW3RydWUsIHRydWUsIHRydWUsIHRydWUsIHRydWUsIHRydWVdXSA6IFt0cnVlXTtcblxuICAgICAgICB0aGlzLl9uZWVkc1VwbG9hZCA9IHRydWU7XG4gICAgICAgIHRoaXMuX25lZWRzTWlwbWFwc1VwbG9hZCA9IHRoaXMuX21pcG1hcHM7XG4gICAgICAgIHRoaXMuX21pcG1hcHNVcGxvYWRlZCA9IGZhbHNlO1xuXG4gICAgICAgIHRoaXMucHJvcGVydHlDaGFuZ2VkKDI1NSk7ICAvLyAxIHwgMiB8IDQgfCA4IHwgMTYgfCAzMiB8IDY0IHwgMTI4XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTG9ja3MgYSBtaXBsZXZlbCBvZiB0aGUgdGV4dHVyZSwgcmV0dXJuaW5nIGEgdHlwZWQgYXJyYXkgdG8gYmUgZmlsbGVkIHdpdGggcGl4ZWwgZGF0YS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7b2JqZWN0fSBbb3B0aW9uc10gLSBPcHRpb25hbCBvcHRpb25zIG9iamVjdC4gVmFsaWQgcHJvcGVydGllcyBhcmUgYXMgZm9sbG93czpcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gW29wdGlvbnMubGV2ZWxdIC0gVGhlIG1pcCBsZXZlbCB0byBsb2NrIHdpdGggMCBiZWluZyB0aGUgdG9wIGxldmVsLiBEZWZhdWx0c1xuICAgICAqIHRvIDAuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFtvcHRpb25zLmZhY2VdIC0gSWYgdGhlIHRleHR1cmUgaXMgYSBjdWJlbWFwLCB0aGlzIGlzIHRoZSBpbmRleCBvZiB0aGUgZmFjZVxuICAgICAqIHRvIGxvY2suXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFtvcHRpb25zLm1vZGVdIC0gVGhlIGxvY2sgbW9kZS4gQ2FuIGJlOlxuICAgICAqIC0ge0BsaW5rIFRFWFRVUkVMT0NLX1JFQUR9XG4gICAgICogLSB7QGxpbmsgVEVYVFVSRUxPQ0tfV1JJVEV9XG4gICAgICogRGVmYXVsdHMgdG8ge0BsaW5rIFRFWFRVUkVMT0NLX1dSSVRFfS5cbiAgICAgKiBAcmV0dXJucyB7VWludDhBcnJheXxVaW50MTZBcnJheXxGbG9hdDMyQXJyYXl9IEEgdHlwZWQgYXJyYXkgY29udGFpbmluZyB0aGUgcGl4ZWwgZGF0YSBvZlxuICAgICAqIHRoZSBsb2NrZWQgbWlwIGxldmVsLlxuICAgICAqL1xuICAgIGxvY2sob3B0aW9ucyA9IHt9KSB7XG4gICAgICAgIC8vIEluaXRpYWxpemUgb3B0aW9ucyB0byBzb21lIHNlbnNpYmxlIGRlZmF1bHRzXG4gICAgICAgIGlmIChvcHRpb25zLmxldmVsID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIG9wdGlvbnMubGV2ZWwgPSAwO1xuICAgICAgICB9XG4gICAgICAgIGlmIChvcHRpb25zLmZhY2UgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgb3B0aW9ucy5mYWNlID0gMDtcbiAgICAgICAgfVxuICAgICAgICBpZiAob3B0aW9ucy5tb2RlID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIG9wdGlvbnMubW9kZSA9IFRFWFRVUkVMT0NLX1dSSVRFO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fbG9ja2VkTGV2ZWwgPSBvcHRpb25zLmxldmVsO1xuXG4gICAgICAgIGNvbnN0IGxldmVscyA9IHRoaXMuY3ViZW1hcCA/IHRoaXMuX2xldmVsc1tvcHRpb25zLmZhY2VdIDogdGhpcy5fbGV2ZWxzO1xuICAgICAgICBpZiAobGV2ZWxzW29wdGlvbnMubGV2ZWxdID09PSBudWxsKSB7XG4gICAgICAgICAgICAvLyBhbGxvY2F0ZSBzdG9yYWdlIGZvciB0aGlzIG1pcCBsZXZlbFxuICAgICAgICAgICAgY29uc3Qgd2lkdGggPSBNYXRoLm1heCgxLCB0aGlzLl93aWR0aCA+PiBvcHRpb25zLmxldmVsKTtcbiAgICAgICAgICAgIGNvbnN0IGhlaWdodCA9IE1hdGgubWF4KDEsIHRoaXMuX2hlaWdodCA+PiBvcHRpb25zLmxldmVsKTtcbiAgICAgICAgICAgIGNvbnN0IGRlcHRoID0gTWF0aC5tYXgoMSwgdGhpcy5fZGVwdGggPj4gb3B0aW9ucy5sZXZlbCk7XG4gICAgICAgICAgICBjb25zdCBkYXRhID0gbmV3IEFycmF5QnVmZmVyKFRleHR1cmVVdGlscy5jYWxjTGV2ZWxHcHVTaXplKHdpZHRoLCBoZWlnaHQsIGRlcHRoLCB0aGlzLl9mb3JtYXQpKTtcbiAgICAgICAgICAgIGxldmVsc1tvcHRpb25zLmxldmVsXSA9IG5ldyAoZ2V0UGl4ZWxGb3JtYXRBcnJheVR5cGUodGhpcy5fZm9ybWF0KSkoZGF0YSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gbGV2ZWxzW29wdGlvbnMubGV2ZWxdO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldCB0aGUgcGl4ZWwgZGF0YSBvZiB0aGUgdGV4dHVyZSBmcm9tIGEgY2FudmFzLCBpbWFnZSwgdmlkZW8gRE9NIGVsZW1lbnQuIElmIHRoZSB0ZXh0dXJlIGlzXG4gICAgICogYSBjdWJlbWFwLCB0aGUgc3VwcGxpZWQgc291cmNlIG11c3QgYmUgYW4gYXJyYXkgb2YgNiBjYW52YXNlcywgaW1hZ2VzIG9yIHZpZGVvcy5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7SFRNTENhbnZhc0VsZW1lbnR8SFRNTEltYWdlRWxlbWVudHxIVE1MVmlkZW9FbGVtZW50fEhUTUxDYW52YXNFbGVtZW50W118SFRNTEltYWdlRWxlbWVudFtdfEhUTUxWaWRlb0VsZW1lbnRbXX0gc291cmNlIC0gQVxuICAgICAqIGNhbnZhcywgaW1hZ2Ugb3IgdmlkZW8gZWxlbWVudCwgb3IgYW4gYXJyYXkgb2YgNiBjYW52YXMsIGltYWdlIG9yIHZpZGVvIGVsZW1lbnRzLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBbbWlwTGV2ZWxdIC0gQSBub24tbmVnYXRpdmUgaW50ZWdlciBzcGVjaWZ5aW5nIHRoZSBpbWFnZSBsZXZlbCBvZiBkZXRhaWwuXG4gICAgICogRGVmYXVsdHMgdG8gMCwgd2hpY2ggcmVwcmVzZW50cyB0aGUgYmFzZSBpbWFnZSBzb3VyY2UuIEEgbGV2ZWwgdmFsdWUgb2YgTiwgdGhhdCBpcyBncmVhdGVyXG4gICAgICogdGhhbiAwLCByZXByZXNlbnRzIHRoZSBpbWFnZSBzb3VyY2UgZm9yIHRoZSBOdGggbWlwbWFwIHJlZHVjdGlvbiBsZXZlbC5cbiAgICAgKi9cbiAgICBzZXRTb3VyY2Uoc291cmNlLCBtaXBMZXZlbCA9IDApIHtcbiAgICAgICAgbGV0IGludmFsaWQgPSBmYWxzZTtcbiAgICAgICAgbGV0IHdpZHRoLCBoZWlnaHQ7XG5cbiAgICAgICAgaWYgKHRoaXMuX2N1YmVtYXApIHtcbiAgICAgICAgICAgIGlmIChzb3VyY2VbMF0pIHtcbiAgICAgICAgICAgICAgICAvLyByZWx5IG9uIGZpcnN0IGZhY2Ugc2l6ZXNcbiAgICAgICAgICAgICAgICB3aWR0aCA9IHNvdXJjZVswXS53aWR0aCB8fCAwO1xuICAgICAgICAgICAgICAgIGhlaWdodCA9IHNvdXJjZVswXS5oZWlnaHQgfHwgMDtcblxuICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgNjsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGZhY2UgPSBzb3VyY2VbaV07XG4gICAgICAgICAgICAgICAgICAgIC8vIGN1YmVtYXAgYmVjb21lcyBpbnZhbGlkIGlmIGFueSBjb25kaXRpb24gaXMgbm90IHNhdGlzZmllZFxuICAgICAgICAgICAgICAgICAgICBpZiAoIWZhY2UgfHwgICAgICAgICAgICAgICAgICAvLyBmYWNlIGlzIG1pc3NpbmdcbiAgICAgICAgICAgICAgICAgICAgICAgIGZhY2Uud2lkdGggIT09IHdpZHRoIHx8ICAgLy8gZmFjZSBpcyBkaWZmZXJlbnQgd2lkdGhcbiAgICAgICAgICAgICAgICAgICAgICAgIGZhY2UuaGVpZ2h0ICE9PSBoZWlnaHQgfHwgLy8gZmFjZSBpcyBkaWZmZXJlbnQgaGVpZ2h0XG4gICAgICAgICAgICAgICAgICAgICAgICAhdGhpcy5kZXZpY2UuX2lzQnJvd3NlckludGVyZmFjZShmYWNlKSkgeyAgICAgICAgICAgIC8vIG5ldyBpbWFnZSBiaXRtYXBcbiAgICAgICAgICAgICAgICAgICAgICAgIGludmFsaWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIGZpcnN0IGZhY2UgaXMgbWlzc2luZ1xuICAgICAgICAgICAgICAgIGludmFsaWQgPSB0cnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoIWludmFsaWQpIHtcbiAgICAgICAgICAgICAgICAvLyBtYXJrIGxldmVscyBhcyB1cGRhdGVkXG4gICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCA2OyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuX2xldmVsc1ttaXBMZXZlbF1baV0gIT09IHNvdXJjZVtpXSlcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX2xldmVsc1VwZGF0ZWRbbWlwTGV2ZWxdW2ldID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBjaGVjayBpZiBzb3VyY2UgaXMgdmFsaWQgdHlwZSBvZiBlbGVtZW50XG4gICAgICAgICAgICBpZiAoIXRoaXMuZGV2aWNlLl9pc0Jyb3dzZXJJbnRlcmZhY2Uoc291cmNlKSlcbiAgICAgICAgICAgICAgICBpbnZhbGlkID0gdHJ1ZTtcblxuICAgICAgICAgICAgaWYgKCFpbnZhbGlkKSB7XG4gICAgICAgICAgICAgICAgLy8gbWFyayBsZXZlbCBhcyB1cGRhdGVkXG4gICAgICAgICAgICAgICAgaWYgKHNvdXJjZSAhPT0gdGhpcy5fbGV2ZWxzW21pcExldmVsXSlcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fbGV2ZWxzVXBkYXRlZFttaXBMZXZlbF0gPSB0cnVlO1xuXG4gICAgICAgICAgICAgICAgd2lkdGggPSBzb3VyY2Uud2lkdGg7XG4gICAgICAgICAgICAgICAgaGVpZ2h0ID0gc291cmNlLmhlaWdodDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChpbnZhbGlkKSB7XG4gICAgICAgICAgICAvLyBpbnZhbGlkIHRleHR1cmVcblxuICAgICAgICAgICAgLy8gZGVmYXVsdCBzaXplc1xuICAgICAgICAgICAgdGhpcy5fd2lkdGggPSA0O1xuICAgICAgICAgICAgdGhpcy5faGVpZ2h0ID0gNDtcblxuICAgICAgICAgICAgLy8gcmVtb3ZlIGxldmVsc1xuICAgICAgICAgICAgaWYgKHRoaXMuX2N1YmVtYXApIHtcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IDY7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9sZXZlbHNbbWlwTGV2ZWxdW2ldID0gbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fbGV2ZWxzVXBkYXRlZFttaXBMZXZlbF1baV0gPSB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fbGV2ZWxzW21pcExldmVsXSA9IG51bGw7XG4gICAgICAgICAgICAgICAgdGhpcy5fbGV2ZWxzVXBkYXRlZFttaXBMZXZlbF0gPSB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gdmFsaWQgdGV4dHVyZVxuICAgICAgICAgICAgaWYgKG1pcExldmVsID09PSAwKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fd2lkdGggPSB3aWR0aDtcbiAgICAgICAgICAgICAgICB0aGlzLl9oZWlnaHQgPSBoZWlnaHQ7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuX2xldmVsc1ttaXBMZXZlbF0gPSBzb3VyY2U7XG4gICAgICAgIH1cblxuICAgICAgICAvLyB2YWxpZCBvciBjaGFuZ2VkIHN0YXRlIG9mIHZhbGlkaXR5XG4gICAgICAgIGlmICh0aGlzLl9pbnZhbGlkICE9PSBpbnZhbGlkIHx8ICFpbnZhbGlkKSB7XG4gICAgICAgICAgICB0aGlzLl9pbnZhbGlkID0gaW52YWxpZDtcblxuICAgICAgICAgICAgLy8gcmV1cGxvYWRcbiAgICAgICAgICAgIHRoaXMudXBsb2FkKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBHZXQgdGhlIHBpeGVsIGRhdGEgb2YgdGhlIHRleHR1cmUuIElmIHRoaXMgaXMgYSBjdWJlbWFwIHRoZW4gYW4gYXJyYXkgb2YgNiBpbWFnZXMgd2lsbCBiZVxuICAgICAqIHJldHVybmVkIG90aGVyd2lzZSBhIHNpbmdsZSBpbWFnZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBbbWlwTGV2ZWxdIC0gQSBub24tbmVnYXRpdmUgaW50ZWdlciBzcGVjaWZ5aW5nIHRoZSBpbWFnZSBsZXZlbCBvZiBkZXRhaWwuXG4gICAgICogRGVmYXVsdHMgdG8gMCwgd2hpY2ggcmVwcmVzZW50cyB0aGUgYmFzZSBpbWFnZSBzb3VyY2UuIEEgbGV2ZWwgdmFsdWUgb2YgTiwgdGhhdCBpcyBncmVhdGVyXG4gICAgICogdGhhbiAwLCByZXByZXNlbnRzIHRoZSBpbWFnZSBzb3VyY2UgZm9yIHRoZSBOdGggbWlwbWFwIHJlZHVjdGlvbiBsZXZlbC5cbiAgICAgKiBAcmV0dXJucyB7SFRNTEltYWdlRWxlbWVudH0gVGhlIHNvdXJjZSBpbWFnZSBvZiB0aGlzIHRleHR1cmUuIENhbiBiZSBudWxsIGlmIHNvdXJjZSBub3RcbiAgICAgKiBhc3NpZ25lZCBmb3Igc3BlY2lmaWMgaW1hZ2UgbGV2ZWwuXG4gICAgICovXG4gICAgZ2V0U291cmNlKG1pcExldmVsID0gMCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fbGV2ZWxzW21pcExldmVsXTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBVbmxvY2tzIHRoZSBjdXJyZW50bHkgbG9ja2VkIG1pcCBsZXZlbCBhbmQgdXBsb2FkcyBpdCB0byBWUkFNLlxuICAgICAqL1xuICAgIHVubG9jaygpIHtcbiAgICAgICAgaWYgKHRoaXMuX2xvY2tlZExldmVsID09PSAtMSkge1xuICAgICAgICAgICAgRGVidWcubG9nKFwicGMuVGV4dHVyZSN1bmxvY2s6IEF0dGVtcHRpbmcgdG8gdW5sb2NrIGEgdGV4dHVyZSB0aGF0IGlzIG5vdCBsb2NrZWQuXCIsIHRoaXMpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gVXBsb2FkIHRoZSBuZXcgcGl4ZWwgZGF0YVxuICAgICAgICB0aGlzLnVwbG9hZCgpO1xuICAgICAgICB0aGlzLl9sb2NrZWRMZXZlbCA9IC0xO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEZvcmNlcyBhIHJldXBsb2FkIG9mIHRoZSB0ZXh0dXJlcyBwaXhlbCBkYXRhIHRvIGdyYXBoaWNzIG1lbW9yeS4gT3JkaW5hcmlseSwgdGhpcyBmdW5jdGlvblxuICAgICAqIGlzIGNhbGxlZCBieSBpbnRlcm5hbGx5IGJ5IHtAbGluayBUZXh0dXJlI3NldFNvdXJjZX0gYW5kIHtAbGluayBUZXh0dXJlI3VubG9ja30uIEhvd2V2ZXIsIGl0XG4gICAgICogc3RpbGwgbmVlZHMgdG8gYmUgY2FsbGVkIGV4cGxpY2l0bHkgaW4gdGhlIGNhc2Ugd2hlcmUgYW4gSFRNTFZpZGVvRWxlbWVudCBpcyBzZXQgYXMgdGhlXG4gICAgICogc291cmNlIG9mIHRoZSB0ZXh0dXJlLiAgTm9ybWFsbHksIHRoaXMgaXMgZG9uZSBvbmNlIGV2ZXJ5IGZyYW1lIGJlZm9yZSB2aWRlbyB0ZXh0dXJlZFxuICAgICAqIGdlb21ldHJ5IGlzIHJlbmRlcmVkLlxuICAgICAqL1xuICAgIHVwbG9hZCgpIHtcbiAgICAgICAgdGhpcy5fbmVlZHNVcGxvYWQgPSB0cnVlO1xuICAgICAgICB0aGlzLl9uZWVkc01pcG1hcHNVcGxvYWQgPSB0aGlzLl9taXBtYXBzO1xuICAgICAgICB0aGlzLmltcGwudXBsb2FkSW1tZWRpYXRlPy4odGhpcy5kZXZpY2UsIHRoaXMpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIERvd25sb2FkIHRleHR1cmUncyB0b3AgbGV2ZWwgZGF0YSBmcm9tIGdyYXBoaWNzIG1lbW9yeSB0byBsb2NhbCBtZW1vcnkuXG4gICAgICpcbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgYXN5bmMgZG93bmxvYWRBc3luYygpIHtcbiAgICAgICAgY29uc3QgcHJvbWlzZXMgPSBbXTtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCAodGhpcy5jdWJlbWFwID8gNiA6IDEpOyBpKyspIHtcbiAgICAgICAgICAgIGNvbnN0IHJlbmRlclRhcmdldCA9IG5ldyBSZW5kZXJUYXJnZXQoe1xuICAgICAgICAgICAgICAgIGNvbG9yQnVmZmVyOiB0aGlzLFxuICAgICAgICAgICAgICAgIGRlcHRoOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBmYWNlOiBpXG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgdGhpcy5kZXZpY2Uuc2V0UmVuZGVyVGFyZ2V0KHJlbmRlclRhcmdldCk7XG4gICAgICAgICAgICB0aGlzLmRldmljZS5pbml0UmVuZGVyVGFyZ2V0KHJlbmRlclRhcmdldCk7XG5cbiAgICAgICAgICAgIGNvbnN0IGxldmVscyA9IHRoaXMuY3ViZW1hcCA/IHRoaXMuX2xldmVsc1tpXSA6IHRoaXMuX2xldmVscztcblxuICAgICAgICAgICAgbGV0IGxldmVsID0gbGV2ZWxzWzBdO1xuICAgICAgICAgICAgaWYgKGxldmVsc1swXSAmJiB0aGlzLmRldmljZS5faXNCcm93c2VySW50ZXJmYWNlKGxldmVsc1swXSkpIHtcbiAgICAgICAgICAgICAgICBsZXZlbHNbMF0gPSBudWxsO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBsZXZlbCA9IHRoaXMubG9jayh7IGZhY2U6IGkgfSk7XG5cbiAgICAgICAgICAgIGNvbnN0IHByb21pc2UgPSB0aGlzLmRldmljZS5yZWFkUGl4ZWxzQXN5bmM/LigwLCAwLCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCwgbGV2ZWwpXG4gICAgICAgICAgICAgICAgLnRoZW4oKCkgPT4gcmVuZGVyVGFyZ2V0LmRlc3Ryb3koKSk7XG5cbiAgICAgICAgICAgIHByb21pc2VzLnB1c2gocHJvbWlzZSk7XG4gICAgICAgIH1cbiAgICAgICAgYXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuICAgIH1cbn1cblxuZXhwb3J0IHsgVGV4dHVyZSB9O1xuIl0sIm5hbWVzIjpbImlkIiwiVGV4dHVyZSIsImNvbnN0cnVjdG9yIiwiZ3JhcGhpY3NEZXZpY2UiLCJvcHRpb25zIiwiX29wdGlvbnMkbmFtZSIsIl9vcHRpb25zJHdpZHRoIiwiX29wdGlvbnMkaGVpZ2h0IiwiX29wdGlvbnMkZm9ybWF0IiwiX29wdGlvbnMkY3ViZW1hcCIsIl9vcHRpb25zJGZpeEN1YmVtYXBTZSIsIl9vcHRpb25zJGZsaXBZIiwiX29wdGlvbnMkcHJlbXVsdGlwbHlBIiwiX3JlZiIsIl9vcHRpb25zJG1pcG1hcHMiLCJfb3B0aW9ucyRtaW5GaWx0ZXIiLCJfb3B0aW9ucyRtYWdGaWx0ZXIiLCJfb3B0aW9ucyRhbmlzb3Ryb3B5IiwiX29wdGlvbnMkYWRkcmVzc1UiLCJfb3B0aW9ucyRhZGRyZXNzViIsIl9vcHRpb25zJGFkZHJlc3NXIiwiX29wdGlvbnMkY29tcGFyZU9uUmVhIiwiX29wdGlvbnMkY29tcGFyZUZ1bmMiLCJfb3B0aW9ucyRwcm9maWxlckhpbnQiLCJuYW1lIiwiX2lzUmVuZGVyVGFyZ2V0IiwiX2dwdVNpemUiLCJfaW52YWxpZCIsIl9sb2NrZWRMZXZlbCIsInJlbmRlclZlcnNpb25EaXJ0eSIsImRldmljZSIsIkRlYnVnIiwiYXNzZXJ0IiwiX3dpZHRoIiwid2lkdGgiLCJfaGVpZ2h0IiwiaGVpZ2h0IiwiX2Zvcm1hdCIsImZvcm1hdCIsIlBJWEVMRk9STUFUX1JHQkE4IiwiX2NvbXByZXNzZWQiLCJpc0NvbXByZXNzZWRQaXhlbEZvcm1hdCIsInN1cHBvcnRzVm9sdW1lVGV4dHVyZXMiLCJfb3B0aW9ucyR2b2x1bWUiLCJfb3B0aW9ucyRkZXB0aCIsIl92b2x1bWUiLCJ2b2x1bWUiLCJfZGVwdGgiLCJkZXB0aCIsIl9jdWJlbWFwIiwiY3ViZW1hcCIsImZpeEN1YmVtYXBTZWFtcyIsIl9mbGlwWSIsImZsaXBZIiwiX3ByZW11bHRpcGx5QWxwaGEiLCJwcmVtdWx0aXBseUFscGhhIiwiX21pcG1hcHMiLCJtaXBtYXBzIiwiYXV0b01pcG1hcCIsIl9taW5GaWx0ZXIiLCJtaW5GaWx0ZXIiLCJGSUxURVJfTElORUFSX01JUE1BUF9MSU5FQVIiLCJfbWFnRmlsdGVyIiwibWFnRmlsdGVyIiwiRklMVEVSX0xJTkVBUiIsIl9hbmlzb3Ryb3B5IiwiYW5pc290cm9weSIsIl9hZGRyZXNzVSIsImFkZHJlc3NVIiwiQUREUkVTU19SRVBFQVQiLCJfYWRkcmVzc1YiLCJhZGRyZXNzViIsIl9hZGRyZXNzVyIsImFkZHJlc3NXIiwiX2NvbXBhcmVPblJlYWQiLCJjb21wYXJlT25SZWFkIiwiX2NvbXBhcmVGdW5jIiwiY29tcGFyZUZ1bmMiLCJGVU5DX0xFU1MiLCJ0eXBlIiwiVEVYVFVSRVRZUEVfREVGQVVMVCIsImhhc093blByb3BlcnR5IiwiZGVwcmVjYXRlZCIsInJnYm0iLCJURVhUVVJFVFlQRV9SR0JNIiwic3dpenpsZUdHR1IiLCJURVhUVVJFVFlQRV9TV0laWkxFR0dHUiIsInByb2plY3Rpb24iLCJURVhUVVJFUFJPSkVDVElPTl9OT05FIiwiVEVYVFVSRVBST0pFQ1RJT05fQ1VCRSIsImltcGwiLCJjcmVhdGVUZXh0dXJlSW1wbCIsInByb2ZpbGVySGludCIsImRpcnR5QWxsIiwiX2xldmVscyIsImxldmVscyIsInVwbG9hZCIsInRleHR1cmVzIiwicHVzaCIsInRyYWNlIiwiVFJBQ0VJRF9URVhUVVJFX0FMTE9DIiwiZGVzdHJveSIsImlkeCIsImluZGV4T2YiLCJzcGxpY2UiLCJzY29wZSIsInJlbW92ZVZhbHVlIiwiYWRqdXN0VnJhbVNpemVUcmFja2luZyIsIl92cmFtIiwicmVzaXplIiwibG9zZUNvbnRleHQiLCJ2cmFtIiwic2l6ZSIsIlRSQUNFSURfVlJBTV9URVhUVVJFIiwidGV4IiwiVEVYSElOVF9TSEFET1dNQVAiLCJ0ZXhTaGFkb3ciLCJURVhISU5UX0FTU0VUIiwidGV4QXNzZXQiLCJURVhISU5UX0xJR0hUTUFQIiwidGV4TGlnaHRtYXAiLCJwcm9wZXJ0eUNoYW5nZWQiLCJmbGFnIiwicmVuZGVyVmVyc2lvbiIsInJlcXVpcmVkTWlwTGV2ZWxzIiwiTWF0aCIsImZsb29yIiwibG9nMiIsIm1heCIsInYiLCJ3YXJuIiwiaXNXZWJHUFUiLCJfbmVlZHNNaXBtYXBzVXBsb2FkIiwiZ3B1U2l6ZSIsIm1pcHMiLCJwb3QiLCJsZW5ndGgiLCJUZXh0dXJlVXRpbHMiLCJjYWxjR3B1U2l6ZSIsIl9uZWVkc1VwbG9hZCIsIm1hdGgiLCJwb3dlck9mVHdvIiwiZW5jb2RpbmciLCJURVhUVVJFVFlQRV9SR0JFIiwiVEVYVFVSRVRZUEVfUkdCUCIsIlBJWEVMRk9STUFUX1JHQjE2RiIsIlBJWEVMRk9STUFUX1JHQjMyRiIsIlBJWEVMRk9STUFUX1JHQkExNkYiLCJQSVhFTEZPUk1BVF9SR0JBMzJGIiwiX2xldmVsc1VwZGF0ZWQiLCJfbWlwbWFwc1VwbG9hZGVkIiwibG9jayIsImxldmVsIiwidW5kZWZpbmVkIiwiZmFjZSIsIm1vZGUiLCJURVhUVVJFTE9DS19XUklURSIsImRhdGEiLCJBcnJheUJ1ZmZlciIsImNhbGNMZXZlbEdwdVNpemUiLCJnZXRQaXhlbEZvcm1hdEFycmF5VHlwZSIsInNldFNvdXJjZSIsInNvdXJjZSIsIm1pcExldmVsIiwiaW52YWxpZCIsImkiLCJfaXNCcm93c2VySW50ZXJmYWNlIiwiZ2V0U291cmNlIiwidW5sb2NrIiwibG9nIiwiX3RoaXMkaW1wbCR1cGxvYWRJbW1lIiwiX3RoaXMkaW1wbCIsInVwbG9hZEltbWVkaWF0ZSIsImNhbGwiLCJkb3dubG9hZEFzeW5jIiwicHJvbWlzZXMiLCJfdGhpcyRkZXZpY2UkcmVhZFBpeGUiLCJfdGhpcyRkZXZpY2UiLCJyZW5kZXJUYXJnZXQiLCJSZW5kZXJUYXJnZXQiLCJjb2xvckJ1ZmZlciIsInNldFJlbmRlclRhcmdldCIsImluaXRSZW5kZXJUYXJnZXQiLCJwcm9taXNlIiwicmVhZFBpeGVsc0FzeW5jIiwidGhlbiIsIlByb21pc2UiLCJhbGwiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFvQkEsSUFBSUEsRUFBRSxHQUFHLENBQUMsQ0FBQTs7QUFFVjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxNQUFNQyxPQUFPLENBQUM7QUFnQ1Y7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFD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
