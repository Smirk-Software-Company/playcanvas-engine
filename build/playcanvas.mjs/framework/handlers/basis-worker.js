// Basis worker
function BasisWorker() {
  // basis compression format enums, reproduced here
  const BASIS_FORMAT = {
    cTFETC1: 0,
    // etc1
    cTFETC2: 1,
    // etc2
    cTFBC1: 2,
    // dxt1
    cTFBC3: 3,
    // dxt5
    cTFPVRTC1_4_RGB: 8,
    // PVRTC1 rgb
    cTFPVRTC1_4_RGBA: 9,
    // PVRTC1 rgba
    cTFASTC_4x4: 10,
    // ASTC
    cTFATC_RGB: 11,
    // ATC rgb
    cTFATC_RGBA_INTERPOLATED_ALPHA: 12,
    // ATC rgba
    // uncompressed (fallback) formats
    cTFRGBA32: 13,
    // rgba 8888
    cTFRGB565: 14,
    // rgb 565
    cTFRGBA4444: 16 // rgba 4444
  };

  // map of GPU to basis format for textures without alpha
  const opaqueMapping = {
    astc: BASIS_FORMAT.cTFASTC_4x4,
    dxt: BASIS_FORMAT.cTFBC1,
    etc1: BASIS_FORMAT.cTFETC1,
    etc2: BASIS_FORMAT.cTFETC1,
    pvr: BASIS_FORMAT.cTFPVRTC1_4_RGB,
    atc: BASIS_FORMAT.cTFATC_RGB,
    none: BASIS_FORMAT.cTFRGB565
  };

  // map of GPU to basis format for textures with alpha
  const alphaMapping = {
    astc: BASIS_FORMAT.cTFASTC_4x4,
    dxt: BASIS_FORMAT.cTFBC3,
    etc1: BASIS_FORMAT.cTFRGBA4444,
    etc2: BASIS_FORMAT.cTFETC2,
    pvr: BASIS_FORMAT.cTFPVRTC1_4_RGBA,
    atc: BASIS_FORMAT.cTFATC_RGBA_INTERPOLATED_ALPHA,
    none: BASIS_FORMAT.cTFRGBA4444
  };

  // engine pixel format constants, reproduced here
  const PIXEL_FORMAT = {
    ETC1: 21,
    ETC2_RGB: 22,
    ETC2_RGBA: 23,
    DXT1: 8,
    DXT5: 10,
    PVRTC_4BPP_RGB_1: 26,
    PVRTC_4BPP_RGBA_1: 27,
    ASTC_4x4: 28,
    ATC_RGB: 29,
    ATC_RGBA: 30,
    R8_G8_B8_A8: 7,
    R5_G6_B5: 3,
    R4_G4_B4_A4: 5
  };

  // map of basis format to engine pixel format
  const basisToEngineMapping = (basisFormat, deviceDetails) => {
    switch (basisFormat) {
      case BASIS_FORMAT.cTFETC1:
        return deviceDetails.formats.etc1 ? PIXEL_FORMAT.ETC1 : PIXEL_FORMAT.ETC2_RGB;
      case BASIS_FORMAT.cTFETC2:
        return PIXEL_FORMAT.ETC2_RGBA;
      case BASIS_FORMAT.cTFBC1:
        return PIXEL_FORMAT.DXT1;
      case BASIS_FORMAT.cTFBC3:
        return PIXEL_FORMAT.DXT5;
      case BASIS_FORMAT.cTFPVRTC1_4_RGB:
        return PIXEL_FORMAT.PVRTC_4BPP_RGB_1;
      case BASIS_FORMAT.cTFPVRTC1_4_RGBA:
        return PIXEL_FORMAT.PVRTC_4BPP_RGBA_1;
      case BASIS_FORMAT.cTFASTC_4x4:
        return PIXEL_FORMAT.ASTC_4x4;
      case BASIS_FORMAT.cTFATC_RGB:
        return PIXEL_FORMAT.ATC_RGB;
      case BASIS_FORMAT.cTFATC_RGBA_INTERPOLATED_ALPHA:
        return PIXEL_FORMAT.ATC_RGBA;
      case BASIS_FORMAT.cTFRGBA32:
        return PIXEL_FORMAT.R8_G8_B8_A8;
      case BASIS_FORMAT.cTFRGB565:
        return PIXEL_FORMAT.R5_G6_B5;
      case BASIS_FORMAT.cTFRGBA4444:
        return PIXEL_FORMAT.R4_G4_B4_A4;
    }
  };

  // unswizzle two-component gggr8888 normal data into rgba8888
  const unswizzleGGGR = data => {
    // given R and G generate B
    const genB = function genB(R, G) {
      const r = R * (2.0 / 255.0) - 1.0;
      const g = G * (2.0 / 255.0) - 1.0;
      const b = Math.sqrt(1.0 - Math.min(1.0, r * r + g * g));
      return Math.max(0, Math.min(255, Math.floor((b + 1.0) * 0.5 * 255.0)));
    };
    for (let offset = 0; offset < data.length; offset += 4) {
      const R = data[offset + 3];
      const G = data[offset + 1];
      data[offset + 0] = R;
      data[offset + 2] = genB(R, G);
      data[offset + 3] = 255;
    }
    return data;
  };

  // pack rgba8888 data into rgb565
  const pack565 = data => {
    const result = new Uint16Array(data.length / 4);
    for (let offset = 0; offset < data.length; offset += 4) {
      const R = data[offset + 0];
      const G = data[offset + 1];
      const B = data[offset + 2];
      result[offset / 4] = (R & 0xf8) << 8 |
      // 5
      (G & 0xfc) << 3 |
      // 6
      B >> 3; // 5
    }

    return result;
  };
  const isPOT = (width, height) => {
    return (width & width - 1) === 0 && (height & height - 1) === 0;
  };
  const performanceNow = () => {
    return typeof performance !== 'undefined' ? performance.now() : 0;
  };

  // globals, set on worker init
  let basis;
  let rgbPriority;
  let rgbaPriority;
  const chooseTargetFormat = (deviceDetails, hasAlpha, isUASTC) => {
    // attempt to match file compression scheme with runtime compression
    if (isUASTC) {
      if (deviceDetails.formats.astc) {
        return 'astc';
      }
    } else {
      if (hasAlpha) {
        if (deviceDetails.formats.etc2) {
          return 'etc2';
        }
      } else {
        if (deviceDetails.formats.etc1 || deviceDetails.formats.etc2) {
          return 'etc1';
        }
      }
    }
    const testInOrder = priority => {
      for (let i = 0; i < priority.length; ++i) {
        const format = priority[i];
        if (deviceDetails.formats[format]) {
          return format;
        }
      }
      return 'none';
    };
    return testInOrder(hasAlpha ? rgbaPriority : rgbPriority);
  };

  // return true if the texture dimensions are valid for the target format
  const dimensionsValid = (width, height, format, webgl2) => {
    switch (format) {
      // etc1, 2
      case BASIS_FORMAT.cTFETC1:
      case BASIS_FORMAT.cTFETC2:
        // no size restrictions
        return true;
      // dxt1, 5
      case BASIS_FORMAT.cTFBC1:
      case BASIS_FORMAT.cTFBC3:
        // width and height must be multiple of 4
        return (width & 0x3) === 0 && (height & 0x3) === 0;
      // pvrtc
      case BASIS_FORMAT.cTFPVRTC1_4_RGB:
      case BASIS_FORMAT.cTFPVRTC1_4_RGBA:
        return isPOT(width, height) && (width === height || webgl2);
      // astc
      case BASIS_FORMAT.cTFASTC_4x4:
        return true;
      // atc
      case BASIS_FORMAT.cTFATC_RGB:
      case BASIS_FORMAT.cTFATC_RGBA_INTERPOLATED_ALPHA:
        // TODO: remove atc support? looks like it's been removed from the webgl spec, see
        // https://www.khronos.org/registry/webgl/extensions/rejected/WEBGL_compressed_texture_atc/
        return true;
    }
    return false;
  };
  const transcodeKTX2 = (url, data, options) => {
    if (!basis.KTX2File) {
      throw new Error('Basis transcoder module does not include support for KTX2.');
    }
    const funcStart = performanceNow();
    const basisFile = new basis.KTX2File(new Uint8Array(data));
    const width = basisFile.getWidth();
    const height = basisFile.getHeight();
    const levels = basisFile.getLevels();
    const hasAlpha = !!basisFile.getHasAlpha();
    const isUASTC = basisFile.isUASTC && basisFile.isUASTC();
    if (!width || !height || !levels) {
      basisFile.close();
      basisFile.delete();
      throw new Error(`Invalid image dimensions url=${url} width=${width} height=${height} levels=${levels}`);
    }

    // choose the target format
    const format = chooseTargetFormat(options.deviceDetails, hasAlpha, isUASTC);

    // unswizzle gggr textures under pvr compression
    const unswizzle = !!options.isGGGR && format === 'pvr';

    // convert to basis format taking into consideration platform restrictions
    let basisFormat;
    if (unswizzle) {
      // in order to unswizzle we need gggr8888
      basisFormat = BASIS_FORMAT.cTFRGBA32;
    } else {
      // select output format based on supported formats
      basisFormat = hasAlpha ? alphaMapping[format] : opaqueMapping[format];

      // if image dimensions don't work on target, fall back to uncompressed
      if (!dimensionsValid(width, height, basisFormat, options.deviceDetails.webgl2)) {
        basisFormat = hasAlpha ? BASIS_FORMAT.cTFRGBA32 : BASIS_FORMAT.cTFRGB565;
      }
    }
    if (!basisFile.startTranscoding()) {
      basisFile.close();
      basisFile.delete();
      throw new Error('Failed to start transcoding url=' + url);
    }
    let i;
    const levelData = [];
    for (let mip = 0; mip < levels; ++mip) {
      const dstSize = basisFile.getImageTranscodedSizeInBytes(mip, 0, 0, basisFormat);
      const dst = new Uint8Array(dstSize);
      if (!basisFile.transcodeImage(dst, mip, 0, 0, basisFormat, 0, -1, -1)) {
        basisFile.close();
        basisFile.delete();
        throw new Error('Failed to transcode image url=' + url);
      }
      const is16BitFormat = basisFormat === BASIS_FORMAT.cTFRGB565 || basisFormat === BASIS_FORMAT.cTFRGBA4444;
      levelData.push(is16BitFormat ? new Uint16Array(dst.buffer) : dst);
    }
    basisFile.close();
    basisFile.delete();

    // handle unswizzle option
    if (unswizzle) {
      basisFormat = BASIS_FORMAT.cTFRGB565;
      for (i = 0; i < levelData.length; ++i) {
        levelData[i] = pack565(unswizzleGGGR(levelData[i]));
      }
    }
    return {
      format: basisToEngineMapping(basisFormat, options.deviceDetails),
      width: width,
      height: height,
      levels: levelData,
      cubemap: false,
      transcodeTime: performanceNow() - funcStart,
      url: url,
      unswizzledGGGR: unswizzle
    };
  };

  // transcode the basis super-compressed data into one of the runtime gpu native formats
  const transcodeBasis = (url, data, options) => {
    const funcStart = performanceNow();
    const basisFile = new basis.BasisFile(new Uint8Array(data));
    const width = basisFile.getImageWidth(0, 0);
    const height = basisFile.getImageHeight(0, 0);
    const images = basisFile.getNumImages();
    const levels = basisFile.getNumLevels(0);
    const hasAlpha = !!basisFile.getHasAlpha();
    const isUASTC = basisFile.isUASTC && basisFile.isUASTC();
    if (!width || !height || !images || !levels) {
      basisFile.close();
      basisFile.delete();
      throw new Error(`Invalid image dimensions url=${url} width=${width} height=${height} images=${images} levels=${levels}`);
    }

    // choose the target format
    const format = chooseTargetFormat(options.deviceDetails, hasAlpha, isUASTC);

    // unswizzle gggr textures under pvr compression
    const unswizzle = !!options.isGGGR && format === 'pvr';

    // convert to basis format taking into consideration platform restrictions
    let basisFormat;
    if (unswizzle) {
      // in order to unswizzle we need gggr8888
      basisFormat = BASIS_FORMAT.cTFRGBA32;
    } else {
      // select output format based on supported formats
      basisFormat = hasAlpha ? alphaMapping[format] : opaqueMapping[format];

      // if image dimensions don't work on target, fall back to uncompressed
      if (!dimensionsValid(width, height, basisFormat, options.deviceDetails.webgl2)) {
        basisFormat = hasAlpha ? BASIS_FORMAT.cTFRGBA32 : BASIS_FORMAT.cTFRGB565;
      }
    }
    if (!basisFile.startTranscoding()) {
      basisFile.close();
      basisFile.delete();
      throw new Error('Failed to start transcoding url=' + url);
    }
    let i;
    const levelData = [];
    for (let mip = 0; mip < levels; ++mip) {
      const dstSize = basisFile.getImageTranscodedSizeInBytes(0, mip, basisFormat);
      const dst = new Uint8Array(dstSize);
      if (!basisFile.transcodeImage(dst, 0, mip, basisFormat, 0, 0)) {
        basisFile.close();
        basisFile.delete();
        throw new Error('Failed to transcode image url=' + url);
      }
      const is16BitFormat = basisFormat === BASIS_FORMAT.cTFRGB565 || basisFormat === BASIS_FORMAT.cTFRGBA4444;
      levelData.push(is16BitFormat ? new Uint16Array(dst.buffer) : dst);
    }
    basisFile.close();
    basisFile.delete();

    // handle unswizzle option
    if (unswizzle) {
      basisFormat = BASIS_FORMAT.cTFRGB565;
      for (i = 0; i < levelData.length; ++i) {
        levelData[i] = pack565(unswizzleGGGR(levelData[i]));
      }
    }
    return {
      format: basisToEngineMapping(basisFormat, options.deviceDetails),
      width: width,
      height: height,
      levels: levelData,
      cubemap: false,
      transcodeTime: performanceNow() - funcStart,
      url: url,
      unswizzledGGGR: unswizzle
    };
  };
  const transcode = (url, data, options) => {
    return options.isKTX2 ? transcodeKTX2(url, data, options) : transcodeBasis(url, data, options);
  };

  // download and transcode the file given the basis module and
  // file url
  const workerTranscode = (url, data, options) => {
    try {
      const result = transcode(url, data, options);
      result.levels = result.levels.map(v => v.buffer);
      self.postMessage({
        url: url,
        data: result
      }, result.levels);
    } catch (err) {
      self.postMessage({
        url: url,
        err: err
      }, null);
    }
  };
  const workerInit = (config, callback) => {
    // initialize the wasm module
    const instantiateWasmFunc = (imports, successCallback) => {
      WebAssembly.instantiate(config.module, imports).then(result => {
        successCallback(result);
      }).catch(reason => {
        console.error('instantiate failed + ' + reason);
      });
      return {};
    };
    self.BASIS(config.module ? {
      instantiateWasm: instantiateWasmFunc
    } : null).then(instance => {
      instance.initializeBasis();

      // set globals
      basis = instance;
      rgbPriority = config.rgbPriority;
      rgbaPriority = config.rgbaPriority;
      callback(null);
    });
  };

  // handle incoming worker requests
  const queue = [];
  self.onmessage = message => {
    const data = message.data;
    switch (data.type) {
      case 'init':
        workerInit(data.config, () => {
          for (let i = 0; i < queue.length; ++i) {
            workerTranscode(queue[i].url, queue[i].data, queue[i].options);
          }
          queue.length = 0;
        });
        break;
      case 'transcode':
        if (basis) {
          workerTranscode(data.url, data.data, data.options);
        } else {
          queue.push(data);
        }
        break;
    }
  };
}

export { BasisWorker };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFzaXMtd29ya2VyLmpzIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvZnJhbWV3b3JrL2hhbmRsZXJzL2Jhc2lzLXdvcmtlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBCYXNpcyB3b3JrZXJcbmZ1bmN0aW9uIEJhc2lzV29ya2VyKCkge1xuICAgIC8vIGJhc2lzIGNvbXByZXNzaW9uIGZvcm1hdCBlbnVtcywgcmVwcm9kdWNlZCBoZXJlXG4gICAgY29uc3QgQkFTSVNfRk9STUFUID0ge1xuICAgICAgICBjVEZFVEMxOiAwLCAgICAgICAgICAgICAgICAgICAgICAgICAvLyBldGMxXG4gICAgICAgIGNURkVUQzI6IDEsICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGV0YzJcbiAgICAgICAgY1RGQkMxOiAyLCAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gZHh0MVxuICAgICAgICBjVEZCQzM6IDMsICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBkeHQ1XG4gICAgICAgIGNURlBWUlRDMV80X1JHQjogOCwgICAgICAgICAgICAgICAgIC8vIFBWUlRDMSByZ2JcbiAgICAgICAgY1RGUFZSVEMxXzRfUkdCQTogOSwgICAgICAgICAgICAgICAgLy8gUFZSVEMxIHJnYmFcbiAgICAgICAgY1RGQVNUQ180eDQ6IDEwLCAgICAgICAgICAgICAgICAgICAgLy8gQVNUQ1xuICAgICAgICBjVEZBVENfUkdCOiAxMSwgICAgICAgICAgICAgICAgICAgICAvLyBBVEMgcmdiXG4gICAgICAgIGNURkFUQ19SR0JBX0lOVEVSUE9MQVRFRF9BTFBIQTogMTIsIC8vIEFUQyByZ2JhXG4gICAgICAgIC8vIHVuY29tcHJlc3NlZCAoZmFsbGJhY2spIGZvcm1hdHNcbiAgICAgICAgY1RGUkdCQTMyOiAxMywgICAgICAgICAgICAgICAgICAgICAgLy8gcmdiYSA4ODg4XG4gICAgICAgIGNURlJHQjU2NTogMTQsICAgICAgICAgICAgICAgICAgICAgIC8vIHJnYiA1NjVcbiAgICAgICAgY1RGUkdCQTQ0NDQ6IDE2ICAgICAgICAgICAgICAgICAgICAgLy8gcmdiYSA0NDQ0XG4gICAgfTtcblxuICAgIC8vIG1hcCBvZiBHUFUgdG8gYmFzaXMgZm9ybWF0IGZvciB0ZXh0dXJlcyB3aXRob3V0IGFscGhhXG4gICAgY29uc3Qgb3BhcXVlTWFwcGluZyA9IHtcbiAgICAgICAgYXN0YzogQkFTSVNfRk9STUFULmNURkFTVENfNHg0LFxuICAgICAgICBkeHQ6IEJBU0lTX0ZPUk1BVC5jVEZCQzEsXG4gICAgICAgIGV0YzE6IEJBU0lTX0ZPUk1BVC5jVEZFVEMxLFxuICAgICAgICBldGMyOiBCQVNJU19GT1JNQVQuY1RGRVRDMSxcbiAgICAgICAgcHZyOiBCQVNJU19GT1JNQVQuY1RGUFZSVEMxXzRfUkdCLFxuICAgICAgICBhdGM6IEJBU0lTX0ZPUk1BVC5jVEZBVENfUkdCLFxuICAgICAgICBub25lOiBCQVNJU19GT1JNQVQuY1RGUkdCNTY1XG4gICAgfTtcblxuICAgIC8vIG1hcCBvZiBHUFUgdG8gYmFzaXMgZm9ybWF0IGZvciB0ZXh0dXJlcyB3aXRoIGFscGhhXG4gICAgY29uc3QgYWxwaGFNYXBwaW5nID0ge1xuICAgICAgICBhc3RjOiBCQVNJU19GT1JNQVQuY1RGQVNUQ180eDQsXG4gICAgICAgIGR4dDogQkFTSVNfRk9STUFULmNURkJDMyxcbiAgICAgICAgZXRjMTogQkFTSVNfRk9STUFULmNURlJHQkE0NDQ0LFxuICAgICAgICBldGMyOiBCQVNJU19GT1JNQVQuY1RGRVRDMixcbiAgICAgICAgcHZyOiBCQVNJU19GT1JNQVQuY1RGUFZSVEMxXzRfUkdCQSxcbiAgICAgICAgYXRjOiBCQVNJU19GT1JNQVQuY1RGQVRDX1JHQkFfSU5URVJQT0xBVEVEX0FMUEhBLFxuICAgICAgICBub25lOiBCQVNJU19GT1JNQVQuY1RGUkdCQTQ0NDRcbiAgICB9O1xuXG4gICAgLy8gZW5naW5lIHBpeGVsIGZvcm1hdCBjb25zdGFudHMsIHJlcHJvZHVjZWQgaGVyZVxuICAgIGNvbnN0IFBJWEVMX0ZPUk1BVCA9IHtcbiAgICAgICAgRVRDMTogMjEsXG4gICAgICAgIEVUQzJfUkdCOiAyMixcbiAgICAgICAgRVRDMl9SR0JBOiAyMyxcbiAgICAgICAgRFhUMTogOCxcbiAgICAgICAgRFhUNTogMTAsXG4gICAgICAgIFBWUlRDXzRCUFBfUkdCXzE6IDI2LFxuICAgICAgICBQVlJUQ180QlBQX1JHQkFfMTogMjcsXG4gICAgICAgIEFTVENfNHg0OiAyOCxcbiAgICAgICAgQVRDX1JHQjogMjksXG4gICAgICAgIEFUQ19SR0JBOiAzMCxcbiAgICAgICAgUjhfRzhfQjhfQTg6IDcsXG4gICAgICAgIFI1X0c2X0I1OiAzLFxuICAgICAgICBSNF9HNF9CNF9BNDogNVxuICAgIH07XG5cbiAgICAvLyBtYXAgb2YgYmFzaXMgZm9ybWF0IHRvIGVuZ2luZSBwaXhlbCBmb3JtYXRcbiAgICBjb25zdCBiYXNpc1RvRW5naW5lTWFwcGluZyA9IChiYXNpc0Zvcm1hdCwgZGV2aWNlRGV0YWlscykgPT4ge1xuICAgICAgICBzd2l0Y2ggKGJhc2lzRm9ybWF0KSB7XG4gICAgICAgICAgICBjYXNlIEJBU0lTX0ZPUk1BVC5jVEZFVEMxOiByZXR1cm4gZGV2aWNlRGV0YWlscy5mb3JtYXRzLmV0YzEgPyBQSVhFTF9GT1JNQVQuRVRDMSA6IFBJWEVMX0ZPUk1BVC5FVEMyX1JHQjtcbiAgICAgICAgICAgIGNhc2UgQkFTSVNfRk9STUFULmNURkVUQzI6IHJldHVybiBQSVhFTF9GT1JNQVQuRVRDMl9SR0JBO1xuICAgICAgICAgICAgY2FzZSBCQVNJU19GT1JNQVQuY1RGQkMxOiByZXR1cm4gUElYRUxfRk9STUFULkRYVDE7XG4gICAgICAgICAgICBjYXNlIEJBU0lTX0ZPUk1BVC5jVEZCQzM6IHJldHVybiBQSVhFTF9GT1JNQVQuRFhUNTtcbiAgICAgICAgICAgIGNhc2UgQkFTSVNfRk9STUFULmNURlBWUlRDMV80X1JHQjogcmV0dXJuIFBJWEVMX0ZPUk1BVC5QVlJUQ180QlBQX1JHQl8xO1xuICAgICAgICAgICAgY2FzZSBCQVNJU19GT1JNQVQuY1RGUFZSVEMxXzRfUkdCQTogcmV0dXJuIFBJWEVMX0ZPUk1BVC5QVlJUQ180QlBQX1JHQkFfMTtcbiAgICAgICAgICAgIGNhc2UgQkFTSVNfRk9STUFULmNURkFTVENfNHg0OiByZXR1cm4gUElYRUxfRk9STUFULkFTVENfNHg0O1xuICAgICAgICAgICAgY2FzZSBCQVNJU19GT1JNQVQuY1RGQVRDX1JHQjogcmV0dXJuIFBJWEVMX0ZPUk1BVC5BVENfUkdCO1xuICAgICAgICAgICAgY2FzZSBCQVNJU19GT1JNQVQuY1RGQVRDX1JHQkFfSU5URVJQT0xBVEVEX0FMUEhBOiByZXR1cm4gUElYRUxfRk9STUFULkFUQ19SR0JBO1xuICAgICAgICAgICAgY2FzZSBCQVNJU19GT1JNQVQuY1RGUkdCQTMyOiByZXR1cm4gUElYRUxfRk9STUFULlI4X0c4X0I4X0E4O1xuICAgICAgICAgICAgY2FzZSBCQVNJU19GT1JNQVQuY1RGUkdCNTY1OiByZXR1cm4gUElYRUxfRk9STUFULlI1X0c2X0I1O1xuICAgICAgICAgICAgY2FzZSBCQVNJU19GT1JNQVQuY1RGUkdCQTQ0NDQ6IHJldHVybiBQSVhFTF9GT1JNQVQuUjRfRzRfQjRfQTQ7XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgLy8gdW5zd2l6emxlIHR3by1jb21wb25lbnQgZ2dncjg4ODggbm9ybWFsIGRhdGEgaW50byByZ2JhODg4OFxuICAgIGNvbnN0IHVuc3dpenpsZUdHR1IgPSAoZGF0YSkgPT4ge1xuICAgICAgICAvLyBnaXZlbiBSIGFuZCBHIGdlbmVyYXRlIEJcbiAgICAgICAgY29uc3QgZ2VuQiA9IGZ1bmN0aW9uIChSLCBHKSB7XG4gICAgICAgICAgICBjb25zdCByID0gUiAqICgyLjAgLyAyNTUuMCkgLSAxLjA7XG4gICAgICAgICAgICBjb25zdCBnID0gRyAqICgyLjAgLyAyNTUuMCkgLSAxLjA7XG4gICAgICAgICAgICBjb25zdCBiID0gTWF0aC5zcXJ0KDEuMCAtIE1hdGgubWluKDEuMCwgciAqIHIgKyBnICogZykpO1xuICAgICAgICAgICAgcmV0dXJuIE1hdGgubWF4KDAsIE1hdGgubWluKDI1NSwgTWF0aC5mbG9vcigoKGIgKyAxLjApICogMC41KSAqIDI1NS4wKSkpO1xuICAgICAgICB9O1xuXG4gICAgICAgIGZvciAobGV0IG9mZnNldCA9IDA7IG9mZnNldCA8IGRhdGEubGVuZ3RoOyBvZmZzZXQgKz0gNCkge1xuICAgICAgICAgICAgY29uc3QgUiA9IGRhdGFbb2Zmc2V0ICsgM107XG4gICAgICAgICAgICBjb25zdCBHID0gZGF0YVtvZmZzZXQgKyAxXTtcbiAgICAgICAgICAgIGRhdGFbb2Zmc2V0ICsgMF0gPSBSO1xuICAgICAgICAgICAgZGF0YVtvZmZzZXQgKyAyXSA9IGdlbkIoUiwgRyk7XG4gICAgICAgICAgICBkYXRhW29mZnNldCArIDNdID0gMjU1O1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGRhdGE7XG4gICAgfTtcblxuICAgIC8vIHBhY2sgcmdiYTg4ODggZGF0YSBpbnRvIHJnYjU2NVxuICAgIGNvbnN0IHBhY2s1NjUgPSAoZGF0YSkgPT4ge1xuICAgICAgICBjb25zdCByZXN1bHQgPSBuZXcgVWludDE2QXJyYXkoZGF0YS5sZW5ndGggLyA0KTtcblxuICAgICAgICBmb3IgKGxldCBvZmZzZXQgPSAwOyBvZmZzZXQgPCBkYXRhLmxlbmd0aDsgb2Zmc2V0ICs9IDQpIHtcbiAgICAgICAgICAgIGNvbnN0IFIgPSBkYXRhW29mZnNldCArIDBdO1xuICAgICAgICAgICAgY29uc3QgRyA9IGRhdGFbb2Zmc2V0ICsgMV07XG4gICAgICAgICAgICBjb25zdCBCID0gZGF0YVtvZmZzZXQgKyAyXTtcbiAgICAgICAgICAgIHJlc3VsdFtvZmZzZXQgLyA0XSA9ICgoUiAmIDB4ZjgpIDw8IDgpIHwgIC8vIDVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICgoRyAmIDB4ZmMpIDw8IDMpIHwgIC8vIDZcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICgoQiA+PiAzKSk7ICAgICAgICAgIC8vIDVcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfTtcblxuICAgIGNvbnN0IGlzUE9UID0gKHdpZHRoLCBoZWlnaHQpID0+IHtcbiAgICAgICAgcmV0dXJuICgod2lkdGggJiAod2lkdGggLSAxKSkgPT09IDApICYmICgoaGVpZ2h0ICYgKGhlaWdodCAtIDEpKSA9PT0gMCk7XG4gICAgfTtcblxuICAgIGNvbnN0IHBlcmZvcm1hbmNlTm93ID0gKCkgPT4ge1xuICAgICAgICByZXR1cm4gKHR5cGVvZiBwZXJmb3JtYW5jZSAhPT0gJ3VuZGVmaW5lZCcpID8gcGVyZm9ybWFuY2Uubm93KCkgOiAwO1xuICAgIH07XG5cbiAgICAvLyBnbG9iYWxzLCBzZXQgb24gd29ya2VyIGluaXRcbiAgICBsZXQgYmFzaXM7XG4gICAgbGV0IHJnYlByaW9yaXR5O1xuICAgIGxldCByZ2JhUHJpb3JpdHk7XG5cbiAgICBjb25zdCBjaG9vc2VUYXJnZXRGb3JtYXQgPSAoZGV2aWNlRGV0YWlscywgaGFzQWxwaGEsIGlzVUFTVEMpID0+IHtcbiAgICAgICAgLy8gYXR0ZW1wdCB0byBtYXRjaCBmaWxlIGNvbXByZXNzaW9uIHNjaGVtZSB3aXRoIHJ1bnRpbWUgY29tcHJlc3Npb25cbiAgICAgICAgaWYgKGlzVUFTVEMpIHtcbiAgICAgICAgICAgIGlmIChkZXZpY2VEZXRhaWxzLmZvcm1hdHMuYXN0Yykge1xuICAgICAgICAgICAgICAgIHJldHVybiAnYXN0Yyc7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpZiAoaGFzQWxwaGEpIHtcbiAgICAgICAgICAgICAgICBpZiAoZGV2aWNlRGV0YWlscy5mb3JtYXRzLmV0YzIpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuICdldGMyJztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGlmIChkZXZpY2VEZXRhaWxzLmZvcm1hdHMuZXRjMSB8fCBkZXZpY2VEZXRhaWxzLmZvcm1hdHMuZXRjMikge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gJ2V0YzEnO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHRlc3RJbk9yZGVyID0gKHByaW9yaXR5KSA9PiB7XG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHByaW9yaXR5Lmxlbmd0aDsgKytpKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZm9ybWF0ID0gcHJpb3JpdHlbaV07XG4gICAgICAgICAgICAgICAgaWYgKGRldmljZURldGFpbHMuZm9ybWF0c1tmb3JtYXRdKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmb3JtYXQ7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuICdub25lJztcbiAgICAgICAgfTtcblxuICAgICAgICByZXR1cm4gdGVzdEluT3JkZXIoaGFzQWxwaGEgPyByZ2JhUHJpb3JpdHkgOiByZ2JQcmlvcml0eSk7XG4gICAgfTtcblxuICAgIC8vIHJldHVybiB0cnVlIGlmIHRoZSB0ZXh0dXJlIGRpbWVuc2lvbnMgYXJlIHZhbGlkIGZvciB0aGUgdGFyZ2V0IGZvcm1hdFxuICAgIGNvbnN0IGRpbWVuc2lvbnNWYWxpZCA9ICh3aWR0aCwgaGVpZ2h0LCBmb3JtYXQsIHdlYmdsMikgPT4ge1xuICAgICAgICBzd2l0Y2ggKGZvcm1hdCkge1xuICAgICAgICAgICAgLy8gZXRjMSwgMlxuICAgICAgICAgICAgY2FzZSBCQVNJU19GT1JNQVQuY1RGRVRDMTpcbiAgICAgICAgICAgIGNhc2UgQkFTSVNfRk9STUFULmNURkVUQzI6XG4gICAgICAgICAgICAgICAgLy8gbm8gc2l6ZSByZXN0cmljdGlvbnNcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIC8vIGR4dDEsIDVcbiAgICAgICAgICAgIGNhc2UgQkFTSVNfRk9STUFULmNURkJDMTpcbiAgICAgICAgICAgIGNhc2UgQkFTSVNfRk9STUFULmNURkJDMzpcbiAgICAgICAgICAgICAgICAvLyB3aWR0aCBhbmQgaGVpZ2h0IG11c3QgYmUgbXVsdGlwbGUgb2YgNFxuICAgICAgICAgICAgICAgIHJldHVybiAoKHdpZHRoICYgMHgzKSA9PT0gMCkgJiYgKChoZWlnaHQgJiAweDMpID09PSAwKTtcbiAgICAgICAgICAgIC8vIHB2cnRjXG4gICAgICAgICAgICBjYXNlIEJBU0lTX0ZPUk1BVC5jVEZQVlJUQzFfNF9SR0I6XG4gICAgICAgICAgICBjYXNlIEJBU0lTX0ZPUk1BVC5jVEZQVlJUQzFfNF9SR0JBOlxuICAgICAgICAgICAgICAgIHJldHVybiBpc1BPVCh3aWR0aCwgaGVpZ2h0KSAmJiAoKHdpZHRoID09PSBoZWlnaHQpIHx8IHdlYmdsMik7XG4gICAgICAgICAgICAvLyBhc3RjXG4gICAgICAgICAgICBjYXNlIEJBU0lTX0ZPUk1BVC5jVEZBU1RDXzR4NDpcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIC8vIGF0Y1xuICAgICAgICAgICAgY2FzZSBCQVNJU19GT1JNQVQuY1RGQVRDX1JHQjpcbiAgICAgICAgICAgIGNhc2UgQkFTSVNfRk9STUFULmNURkFUQ19SR0JBX0lOVEVSUE9MQVRFRF9BTFBIQTpcbiAgICAgICAgICAgICAgICAvLyBUT0RPOiByZW1vdmUgYXRjIHN1cHBvcnQ/IGxvb2tzIGxpa2UgaXQncyBiZWVuIHJlbW92ZWQgZnJvbSB0aGUgd2ViZ2wgc3BlYywgc2VlXG4gICAgICAgICAgICAgICAgLy8gaHR0cHM6Ly93d3cua2hyb25vcy5vcmcvcmVnaXN0cnkvd2ViZ2wvZXh0ZW5zaW9ucy9yZWplY3RlZC9XRUJHTF9jb21wcmVzc2VkX3RleHR1cmVfYXRjL1xuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9O1xuXG4gICAgY29uc3QgdHJhbnNjb2RlS1RYMiA9ICh1cmwsIGRhdGEsIG9wdGlvbnMpID0+IHtcbiAgICAgICAgaWYgKCFiYXNpcy5LVFgyRmlsZSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdCYXNpcyB0cmFuc2NvZGVyIG1vZHVsZSBkb2VzIG5vdCBpbmNsdWRlIHN1cHBvcnQgZm9yIEtUWDIuJyk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBmdW5jU3RhcnQgPSBwZXJmb3JtYW5jZU5vdygpO1xuICAgICAgICBjb25zdCBiYXNpc0ZpbGUgPSBuZXcgYmFzaXMuS1RYMkZpbGUobmV3IFVpbnQ4QXJyYXkoZGF0YSkpO1xuXG4gICAgICAgIGNvbnN0IHdpZHRoID0gYmFzaXNGaWxlLmdldFdpZHRoKCk7XG4gICAgICAgIGNvbnN0IGhlaWdodCA9IGJhc2lzRmlsZS5nZXRIZWlnaHQoKTtcbiAgICAgICAgY29uc3QgbGV2ZWxzID0gYmFzaXNGaWxlLmdldExldmVscygpO1xuICAgICAgICBjb25zdCBoYXNBbHBoYSA9ICEhYmFzaXNGaWxlLmdldEhhc0FscGhhKCk7XG4gICAgICAgIGNvbnN0IGlzVUFTVEMgPSBiYXNpc0ZpbGUuaXNVQVNUQyAmJiBiYXNpc0ZpbGUuaXNVQVNUQygpO1xuXG4gICAgICAgIGlmICghd2lkdGggfHwgIWhlaWdodCB8fCAhbGV2ZWxzKSB7XG4gICAgICAgICAgICBiYXNpc0ZpbGUuY2xvc2UoKTtcbiAgICAgICAgICAgIGJhc2lzRmlsZS5kZWxldGUoKTtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBpbWFnZSBkaW1lbnNpb25zIHVybD0ke3VybH0gd2lkdGg9JHt3aWR0aH0gaGVpZ2h0PSR7aGVpZ2h0fSBsZXZlbHM9JHtsZXZlbHN9YCk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBjaG9vc2UgdGhlIHRhcmdldCBmb3JtYXRcbiAgICAgICAgY29uc3QgZm9ybWF0ID0gY2hvb3NlVGFyZ2V0Rm9ybWF0KG9wdGlvbnMuZGV2aWNlRGV0YWlscywgaGFzQWxwaGEsIGlzVUFTVEMpO1xuXG4gICAgICAgIC8vIHVuc3dpenpsZSBnZ2dyIHRleHR1cmVzIHVuZGVyIHB2ciBjb21wcmVzc2lvblxuICAgICAgICBjb25zdCB1bnN3aXp6bGUgPSAhIW9wdGlvbnMuaXNHR0dSICYmIGZvcm1hdCA9PT0gJ3B2cic7XG5cbiAgICAgICAgLy8gY29udmVydCB0byBiYXNpcyBmb3JtYXQgdGFraW5nIGludG8gY29uc2lkZXJhdGlvbiBwbGF0Zm9ybSByZXN0cmljdGlvbnNcbiAgICAgICAgbGV0IGJhc2lzRm9ybWF0O1xuICAgICAgICBpZiAodW5zd2l6emxlKSB7XG4gICAgICAgICAgICAvLyBpbiBvcmRlciB0byB1bnN3aXp6bGUgd2UgbmVlZCBnZ2dyODg4OFxuICAgICAgICAgICAgYmFzaXNGb3JtYXQgPSBCQVNJU19GT1JNQVQuY1RGUkdCQTMyO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gc2VsZWN0IG91dHB1dCBmb3JtYXQgYmFzZWQgb24gc3VwcG9ydGVkIGZvcm1hdHNcbiAgICAgICAgICAgIGJhc2lzRm9ybWF0ID0gaGFzQWxwaGEgPyBhbHBoYU1hcHBpbmdbZm9ybWF0XSA6IG9wYXF1ZU1hcHBpbmdbZm9ybWF0XTtcblxuICAgICAgICAgICAgLy8gaWYgaW1hZ2UgZGltZW5zaW9ucyBkb24ndCB3b3JrIG9uIHRhcmdldCwgZmFsbCBiYWNrIHRvIHVuY29tcHJlc3NlZFxuICAgICAgICAgICAgaWYgKCFkaW1lbnNpb25zVmFsaWQod2lkdGgsIGhlaWdodCwgYmFzaXNGb3JtYXQsIG9wdGlvbnMuZGV2aWNlRGV0YWlscy53ZWJnbDIpKSB7XG4gICAgICAgICAgICAgICAgYmFzaXNGb3JtYXQgPSBoYXNBbHBoYSA/IEJBU0lTX0ZPUk1BVC5jVEZSR0JBMzIgOiBCQVNJU19GT1JNQVQuY1RGUkdCNTY1O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCFiYXNpc0ZpbGUuc3RhcnRUcmFuc2NvZGluZygpKSB7XG4gICAgICAgICAgICBiYXNpc0ZpbGUuY2xvc2UoKTtcbiAgICAgICAgICAgIGJhc2lzRmlsZS5kZWxldGUoKTtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignRmFpbGVkIHRvIHN0YXJ0IHRyYW5zY29kaW5nIHVybD0nICsgdXJsKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCBpO1xuXG4gICAgICAgIGNvbnN0IGxldmVsRGF0YSA9IFtdO1xuICAgICAgICBmb3IgKGxldCBtaXAgPSAwOyBtaXAgPCBsZXZlbHM7ICsrbWlwKSB7XG4gICAgICAgICAgICBjb25zdCBkc3RTaXplID0gYmFzaXNGaWxlLmdldEltYWdlVHJhbnNjb2RlZFNpemVJbkJ5dGVzKG1pcCwgMCwgMCwgYmFzaXNGb3JtYXQpO1xuICAgICAgICAgICAgY29uc3QgZHN0ID0gbmV3IFVpbnQ4QXJyYXkoZHN0U2l6ZSk7XG5cbiAgICAgICAgICAgIGlmICghYmFzaXNGaWxlLnRyYW5zY29kZUltYWdlKGRzdCwgbWlwLCAwLCAwLCBiYXNpc0Zvcm1hdCwgMCwgLTEsIC0xKSkge1xuICAgICAgICAgICAgICAgIGJhc2lzRmlsZS5jbG9zZSgpO1xuICAgICAgICAgICAgICAgIGJhc2lzRmlsZS5kZWxldGUoKTtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZhaWxlZCB0byB0cmFuc2NvZGUgaW1hZ2UgdXJsPScgKyB1cmwpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBpczE2Qml0Rm9ybWF0ID0gKGJhc2lzRm9ybWF0ID09PSBCQVNJU19GT1JNQVQuY1RGUkdCNTY1IHx8IGJhc2lzRm9ybWF0ID09PSBCQVNJU19GT1JNQVQuY1RGUkdCQTQ0NDQpO1xuXG4gICAgICAgICAgICBsZXZlbERhdGEucHVzaChpczE2Qml0Rm9ybWF0ID8gbmV3IFVpbnQxNkFycmF5KGRzdC5idWZmZXIpIDogZHN0KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGJhc2lzRmlsZS5jbG9zZSgpO1xuICAgICAgICBiYXNpc0ZpbGUuZGVsZXRlKCk7XG5cbiAgICAgICAgLy8gaGFuZGxlIHVuc3dpenpsZSBvcHRpb25cbiAgICAgICAgaWYgKHVuc3dpenpsZSkge1xuICAgICAgICAgICAgYmFzaXNGb3JtYXQgPSBCQVNJU19GT1JNQVQuY1RGUkdCNTY1O1xuICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IGxldmVsRGF0YS5sZW5ndGg7ICsraSkge1xuICAgICAgICAgICAgICAgIGxldmVsRGF0YVtpXSA9IHBhY2s1NjUodW5zd2l6emxlR0dHUihsZXZlbERhdGFbaV0pKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBmb3JtYXQ6IGJhc2lzVG9FbmdpbmVNYXBwaW5nKGJhc2lzRm9ybWF0LCBvcHRpb25zLmRldmljZURldGFpbHMpLFxuICAgICAgICAgICAgd2lkdGg6IHdpZHRoLFxuICAgICAgICAgICAgaGVpZ2h0OiBoZWlnaHQsXG4gICAgICAgICAgICBsZXZlbHM6IGxldmVsRGF0YSxcbiAgICAgICAgICAgIGN1YmVtYXA6IGZhbHNlLFxuICAgICAgICAgICAgdHJhbnNjb2RlVGltZTogcGVyZm9ybWFuY2VOb3coKSAtIGZ1bmNTdGFydCxcbiAgICAgICAgICAgIHVybDogdXJsLFxuICAgICAgICAgICAgdW5zd2l6emxlZEdHR1I6IHVuc3dpenpsZVxuICAgICAgICB9O1xuICAgIH07XG5cbiAgICAvLyB0cmFuc2NvZGUgdGhlIGJhc2lzIHN1cGVyLWNvbXByZXNzZWQgZGF0YSBpbnRvIG9uZSBvZiB0aGUgcnVudGltZSBncHUgbmF0aXZlIGZvcm1hdHNcbiAgICBjb25zdCB0cmFuc2NvZGVCYXNpcyA9ICh1cmwsIGRhdGEsIG9wdGlvbnMpID0+IHtcbiAgICAgICAgY29uc3QgZnVuY1N0YXJ0ID0gcGVyZm9ybWFuY2VOb3coKTtcbiAgICAgICAgY29uc3QgYmFzaXNGaWxlID0gbmV3IGJhc2lzLkJhc2lzRmlsZShuZXcgVWludDhBcnJheShkYXRhKSk7XG5cbiAgICAgICAgY29uc3Qgd2lkdGggPSBiYXNpc0ZpbGUuZ2V0SW1hZ2VXaWR0aCgwLCAwKTtcbiAgICAgICAgY29uc3QgaGVpZ2h0ID0gYmFzaXNGaWxlLmdldEltYWdlSGVpZ2h0KDAsIDApO1xuICAgICAgICBjb25zdCBpbWFnZXMgPSBiYXNpc0ZpbGUuZ2V0TnVtSW1hZ2VzKCk7XG4gICAgICAgIGNvbnN0IGxldmVscyA9IGJhc2lzRmlsZS5nZXROdW1MZXZlbHMoMCk7XG4gICAgICAgIGNvbnN0IGhhc0FscGhhID0gISFiYXNpc0ZpbGUuZ2V0SGFzQWxwaGEoKTtcbiAgICAgICAgY29uc3QgaXNVQVNUQyA9IGJhc2lzRmlsZS5pc1VBU1RDICYmIGJhc2lzRmlsZS5pc1VBU1RDKCk7XG5cbiAgICAgICAgaWYgKCF3aWR0aCB8fCAhaGVpZ2h0IHx8ICFpbWFnZXMgfHwgIWxldmVscykge1xuICAgICAgICAgICAgYmFzaXNGaWxlLmNsb3NlKCk7XG4gICAgICAgICAgICBiYXNpc0ZpbGUuZGVsZXRlKCk7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgaW1hZ2UgZGltZW5zaW9ucyB1cmw9JHt1cmx9IHdpZHRoPSR7d2lkdGh9IGhlaWdodD0ke2hlaWdodH0gaW1hZ2VzPSR7aW1hZ2VzfSBsZXZlbHM9JHtsZXZlbHN9YCk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBjaG9vc2UgdGhlIHRhcmdldCBmb3JtYXRcbiAgICAgICAgY29uc3QgZm9ybWF0ID0gY2hvb3NlVGFyZ2V0Rm9ybWF0KG9wdGlvbnMuZGV2aWNlRGV0YWlscywgaGFzQWxwaGEsIGlzVUFTVEMpO1xuXG4gICAgICAgIC8vIHVuc3dpenpsZSBnZ2dyIHRleHR1cmVzIHVuZGVyIHB2ciBjb21wcmVzc2lvblxuICAgICAgICBjb25zdCB1bnN3aXp6bGUgPSAhIW9wdGlvbnMuaXNHR0dSICYmIGZvcm1hdCA9PT0gJ3B2cic7XG5cbiAgICAgICAgLy8gY29udmVydCB0byBiYXNpcyBmb3JtYXQgdGFraW5nIGludG8gY29uc2lkZXJhdGlvbiBwbGF0Zm9ybSByZXN0cmljdGlvbnNcbiAgICAgICAgbGV0IGJhc2lzRm9ybWF0O1xuICAgICAgICBpZiAodW5zd2l6emxlKSB7XG4gICAgICAgICAgICAvLyBpbiBvcmRlciB0byB1bnN3aXp6bGUgd2UgbmVlZCBnZ2dyODg4OFxuICAgICAgICAgICAgYmFzaXNGb3JtYXQgPSBCQVNJU19GT1JNQVQuY1RGUkdCQTMyO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gc2VsZWN0IG91dHB1dCBmb3JtYXQgYmFzZWQgb24gc3VwcG9ydGVkIGZvcm1hdHNcbiAgICAgICAgICAgIGJhc2lzRm9ybWF0ID0gaGFzQWxwaGEgPyBhbHBoYU1hcHBpbmdbZm9ybWF0XSA6IG9wYXF1ZU1hcHBpbmdbZm9ybWF0XTtcblxuICAgICAgICAgICAgLy8gaWYgaW1hZ2UgZGltZW5zaW9ucyBkb24ndCB3b3JrIG9uIHRhcmdldCwgZmFsbCBiYWNrIHRvIHVuY29tcHJlc3NlZFxuICAgICAgICAgICAgaWYgKCFkaW1lbnNpb25zVmFsaWQod2lkdGgsIGhlaWdodCwgYmFzaXNGb3JtYXQsIG9wdGlvbnMuZGV2aWNlRGV0YWlscy53ZWJnbDIpKSB7XG4gICAgICAgICAgICAgICAgYmFzaXNGb3JtYXQgPSBoYXNBbHBoYSA/IEJBU0lTX0ZPUk1BVC5jVEZSR0JBMzIgOiBCQVNJU19GT1JNQVQuY1RGUkdCNTY1O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCFiYXNpc0ZpbGUuc3RhcnRUcmFuc2NvZGluZygpKSB7XG4gICAgICAgICAgICBiYXNpc0ZpbGUuY2xvc2UoKTtcbiAgICAgICAgICAgIGJhc2lzRmlsZS5kZWxldGUoKTtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignRmFpbGVkIHRvIHN0YXJ0IHRyYW5zY29kaW5nIHVybD0nICsgdXJsKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCBpO1xuXG4gICAgICAgIGNvbnN0IGxldmVsRGF0YSA9IFtdO1xuICAgICAgICBmb3IgKGxldCBtaXAgPSAwOyBtaXAgPCBsZXZlbHM7ICsrbWlwKSB7XG4gICAgICAgICAgICBjb25zdCBkc3RTaXplID0gYmFzaXNGaWxlLmdldEltYWdlVHJhbnNjb2RlZFNpemVJbkJ5dGVzKDAsIG1pcCwgYmFzaXNGb3JtYXQpO1xuICAgICAgICAgICAgY29uc3QgZHN0ID0gbmV3IFVpbnQ4QXJyYXkoZHN0U2l6ZSk7XG5cbiAgICAgICAgICAgIGlmICghYmFzaXNGaWxlLnRyYW5zY29kZUltYWdlKGRzdCwgMCwgbWlwLCBiYXNpc0Zvcm1hdCwgMCwgMCkpIHtcbiAgICAgICAgICAgICAgICBiYXNpc0ZpbGUuY2xvc2UoKTtcbiAgICAgICAgICAgICAgICBiYXNpc0ZpbGUuZGVsZXRlKCk7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdGYWlsZWQgdG8gdHJhbnNjb2RlIGltYWdlIHVybD0nICsgdXJsKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgaXMxNkJpdEZvcm1hdCA9IChiYXNpc0Zvcm1hdCA9PT0gQkFTSVNfRk9STUFULmNURlJHQjU2NSB8fCBiYXNpc0Zvcm1hdCA9PT0gQkFTSVNfRk9STUFULmNURlJHQkE0NDQ0KTtcblxuICAgICAgICAgICAgbGV2ZWxEYXRhLnB1c2goaXMxNkJpdEZvcm1hdCA/IG5ldyBVaW50MTZBcnJheShkc3QuYnVmZmVyKSA6IGRzdCk7XG4gICAgICAgIH1cblxuICAgICAgICBiYXNpc0ZpbGUuY2xvc2UoKTtcbiAgICAgICAgYmFzaXNGaWxlLmRlbGV0ZSgpO1xuXG4gICAgICAgIC8vIGhhbmRsZSB1bnN3aXp6bGUgb3B0aW9uXG4gICAgICAgIGlmICh1bnN3aXp6bGUpIHtcbiAgICAgICAgICAgIGJhc2lzRm9ybWF0ID0gQkFTSVNfRk9STUFULmNURlJHQjU2NTtcbiAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBsZXZlbERhdGEubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgICAgICAgICBsZXZlbERhdGFbaV0gPSBwYWNrNTY1KHVuc3dpenpsZUdHR1IobGV2ZWxEYXRhW2ldKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgZm9ybWF0OiBiYXNpc1RvRW5naW5lTWFwcGluZyhiYXNpc0Zvcm1hdCwgb3B0aW9ucy5kZXZpY2VEZXRhaWxzKSxcbiAgICAgICAgICAgIHdpZHRoOiB3aWR0aCxcbiAgICAgICAgICAgIGhlaWdodDogaGVpZ2h0LFxuICAgICAgICAgICAgbGV2ZWxzOiBsZXZlbERhdGEsXG4gICAgICAgICAgICBjdWJlbWFwOiBmYWxzZSxcbiAgICAgICAgICAgIHRyYW5zY29kZVRpbWU6IHBlcmZvcm1hbmNlTm93KCkgLSBmdW5jU3RhcnQsXG4gICAgICAgICAgICB1cmw6IHVybCxcbiAgICAgICAgICAgIHVuc3dpenpsZWRHR0dSOiB1bnN3aXp6bGVcbiAgICAgICAgfTtcbiAgICB9O1xuXG4gICAgY29uc3QgdHJhbnNjb2RlID0gKHVybCwgZGF0YSwgb3B0aW9ucykgPT4ge1xuICAgICAgICByZXR1cm4gb3B0aW9ucy5pc0tUWDIgPyB0cmFuc2NvZGVLVFgyKHVybCwgZGF0YSwgb3B0aW9ucykgOiB0cmFuc2NvZGVCYXNpcyh1cmwsIGRhdGEsIG9wdGlvbnMpO1xuICAgIH07XG5cbiAgICAvLyBkb3dubG9hZCBhbmQgdHJhbnNjb2RlIHRoZSBmaWxlIGdpdmVuIHRoZSBiYXNpcyBtb2R1bGUgYW5kXG4gICAgLy8gZmlsZSB1cmxcbiAgICBjb25zdCB3b3JrZXJUcmFuc2NvZGUgPSAodXJsLCBkYXRhLCBvcHRpb25zKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSB0cmFuc2NvZGUodXJsLCBkYXRhLCBvcHRpb25zKTtcbiAgICAgICAgICAgIHJlc3VsdC5sZXZlbHMgPSByZXN1bHQubGV2ZWxzLm1hcCh2ID0+IHYuYnVmZmVyKTtcbiAgICAgICAgICAgIHNlbGYucG9zdE1lc3NhZ2UoeyB1cmw6IHVybCwgZGF0YTogcmVzdWx0IH0sIHJlc3VsdC5sZXZlbHMpO1xuICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIHNlbGYucG9zdE1lc3NhZ2UoeyB1cmw6IHVybCwgZXJyOiBlcnIgfSwgbnVsbCk7XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgY29uc3Qgd29ya2VySW5pdCA9IChjb25maWcsIGNhbGxiYWNrKSA9PiB7XG4gICAgICAgIC8vIGluaXRpYWxpemUgdGhlIHdhc20gbW9kdWxlXG4gICAgICAgIGNvbnN0IGluc3RhbnRpYXRlV2FzbUZ1bmMgPSAoaW1wb3J0cywgc3VjY2Vzc0NhbGxiYWNrKSA9PiB7XG4gICAgICAgICAgICBXZWJBc3NlbWJseS5pbnN0YW50aWF0ZShjb25maWcubW9kdWxlLCBpbXBvcnRzKVxuICAgICAgICAgICAgICAgIC50aGVuKChyZXN1bHQpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgc3VjY2Vzc0NhbGxiYWNrKHJlc3VsdCk7XG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAuY2F0Y2goKHJlYXNvbikgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKCdpbnN0YW50aWF0ZSBmYWlsZWQgKyAnICsgcmVhc29uKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiB7fTtcbiAgICAgICAgfTtcblxuICAgICAgICBzZWxmLkJBU0lTKGNvbmZpZy5tb2R1bGUgPyB7IGluc3RhbnRpYXRlV2FzbTogaW5zdGFudGlhdGVXYXNtRnVuYyB9IDogbnVsbClcbiAgICAgICAgICAgIC50aGVuKChpbnN0YW5jZSkgPT4ge1xuICAgICAgICAgICAgICAgIGluc3RhbmNlLmluaXRpYWxpemVCYXNpcygpO1xuXG4gICAgICAgICAgICAgICAgLy8gc2V0IGdsb2JhbHNcbiAgICAgICAgICAgICAgICBiYXNpcyA9IGluc3RhbmNlO1xuICAgICAgICAgICAgICAgIHJnYlByaW9yaXR5ID0gY29uZmlnLnJnYlByaW9yaXR5O1xuICAgICAgICAgICAgICAgIHJnYmFQcmlvcml0eSA9IGNvbmZpZy5yZ2JhUHJpb3JpdHk7XG5cbiAgICAgICAgICAgICAgICBjYWxsYmFjayhudWxsKTtcbiAgICAgICAgICAgIH0pO1xuICAgIH07XG5cbiAgICAvLyBoYW5kbGUgaW5jb21pbmcgd29ya2VyIHJlcXVlc3RzXG4gICAgY29uc3QgcXVldWUgPSBbXTtcbiAgICBzZWxmLm9ubWVzc2FnZSA9IChtZXNzYWdlKSA9PiB7XG4gICAgICAgIGNvbnN0IGRhdGEgPSBtZXNzYWdlLmRhdGE7XG4gICAgICAgIHN3aXRjaCAoZGF0YS50eXBlKSB7XG4gICAgICAgICAgICBjYXNlICdpbml0JzpcbiAgICAgICAgICAgICAgICB3b3JrZXJJbml0KGRhdGEuY29uZmlnLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcXVldWUubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHdvcmtlclRyYW5zY29kZShxdWV1ZVtpXS51cmwsIHF1ZXVlW2ldLmRhdGEsIHF1ZXVlW2ldLm9wdGlvbnMpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHF1ZXVlLmxlbmd0aCA9IDA7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICd0cmFuc2NvZGUnOlxuICAgICAgICAgICAgICAgIGlmIChiYXNpcykge1xuICAgICAgICAgICAgICAgICAgICB3b3JrZXJUcmFuc2NvZGUoZGF0YS51cmwsIGRhdGEuZGF0YSwgZGF0YS5vcHRpb25zKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBxdWV1ZS5wdXNoKGRhdGEpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgIH07XG59XG5cbmV4cG9ydCB7XG4gICAgQmFzaXNXb3JrZXJcbn07XG4iXSwibmFtZXMiOlsiQmFzaXNXb3JrZXIiLCJCQVNJU19GT1JNQVQiLCJjVEZFVEMxIiwiY1RGRVRDMiIsImNURkJDMSIsImNURkJDMyIsImNURlBWUlRDMV80X1JHQiIsImNURlBWUlRDMV80X1JHQkEiLCJjVEZBU1RDXzR4NCIsImNURkFUQ19SR0IiLCJjVEZBVENfUkdCQV9JTlRFUlBPTEFURURfQUxQSEEiLCJjVEZSR0JBMzIiLCJjVEZSR0I1NjUiLCJjVEZSR0JBNDQ0NCIsIm9wYXF1ZU1hcHBpbmciLCJhc3RjIiwiZHh0IiwiZXRjMSIsImV0YzIiLCJwdnIiLCJhdGMiLCJub25lIiwiYWxwaGFNYXBwaW5nIiwiUElYRUxfRk9STUFUIiwiRVRDMSIsIkVUQzJfUkdCIiwiRVRDMl9SR0JBIiwiRFhUMSIsIkRYVDUiLCJQVlJUQ180QlBQX1JHQl8xIiwiUFZSVENfNEJQUF9SR0JBXzEiLCJBU1RDXzR4NCIsIkFUQ19SR0IiLCJBVENfUkdCQSIsIlI4X0c4X0I4X0E4IiwiUjVfRzZfQjUiLCJSNF9HNF9CNF9BNCIsImJhc2lzVG9FbmdpbmVNYXBwaW5nIiwiYmFzaXNGb3JtYXQiLCJkZXZpY2VEZXRhaWxzIiwiZm9ybWF0cyIsInVuc3dpenpsZUdHR1IiLCJkYXRhIiwiZ2VuQiIsIlIiLCJHIiwiciIsImciLCJiIiwiTWF0aCIsInNxcnQiLCJtaW4iLCJtYXgiLCJmbG9vciIsIm9mZnNldCIsImxlbmd0aCIsInBhY2s1NjUiLCJyZXN1bHQiLCJVaW50MTZBcnJheSIsIkIiLCJpc1BPVCIsIndpZHRoIiwiaGVpZ2h0IiwicGVyZm9ybWFuY2VOb3ciLCJwZXJmb3JtYW5jZSIsIm5vdyIsImJhc2lzIiwicmdiUHJpb3JpdHkiLCJyZ2JhUHJpb3JpdHkiLCJjaG9vc2VUYXJnZXRGb3JtYXQiLCJoYXNBbHBoYSIsImlzVUFTVEMiLCJ0ZXN0SW5PcmRlciIsInByaW9yaXR5IiwiaSIsImZvcm1hdCIsImRpbWVuc2lvbnNWYWxpZCIsIndlYmdsMiIsInRyYW5zY29kZUtUWDIiLCJ1cmwiLCJvcHRpb25zIiwiS1RYMkZpbGUiLCJFcnJvciIsImZ1bmNTdGFydCIsImJhc2lzRmlsZSIsIlVpbnQ4QXJyYXkiLCJnZXRXaWR0aCIsImdldEhlaWdodCIsImxldmVscyIsImdldExldmVscyIsImdldEhhc0FscGhhIiwiY2xvc2UiLCJkZWxldGUiLCJ1bnN3aXp6bGUiLCJpc0dHR1IiLCJzdGFydFRyYW5zY29kaW5nIiwibGV2ZWxEYXRhIiwibWlwIiwiZHN0U2l6ZSIsImdldEltYWdlVHJhbnNjb2RlZFNpemVJbkJ5dGVzIiwiZHN0IiwidHJhbnNjb2RlSW1hZ2UiLCJpczE2Qml0Rm9ybWF0IiwicHVzaCIsImJ1ZmZlciIsImN1YmVtYXAiLCJ0cmFuc2NvZGVUaW1lIiwidW5zd2l6emxlZEdHR1IiLCJ0cmFuc2NvZGVCYXNpcyIsIkJhc2lzRmlsZSIsImdldEltYWdlV2lkdGgiLCJnZXRJbWFnZUhlaWdodCIsImltYWdlcyIsImdldE51bUltYWdlcyIsImdldE51bUxldmVscyIsInRyYW5zY29kZSIsImlzS1RYMiIsIndvcmtlclRyYW5zY29kZSIsIm1hcCIsInYiLCJzZWxmIiwicG9zdE1lc3NhZ2UiLCJlcnIiLCJ3b3JrZXJJbml0IiwiY29uZmlnIiwiY2FsbGJhY2siLCJpbnN0YW50aWF0ZVdhc21GdW5jIiwiaW1wb3J0cyIsInN1Y2Nlc3NDYWxsYmFjayIsIldlYkFzc2VtYmx5IiwiaW5zdGFudGlhdGUiLCJtb2R1bGUiLCJ0aGVuIiwiY2F0Y2giLCJyZWFzb24iLCJjb25zb2xlIiwiZXJyb3IiLCJCQVNJUyIsImluc3RhbnRpYXRlV2FzbSIsImluc3RhbmNlIiwiaW5pdGlhbGl6ZUJhc2lzIiwicXVldWUiLCJvbm1lc3NhZ2UiLCJtZXNzYWdlIiwidHlwZSJdLCJtYXBwaW5ncyI6IkFBQUE7QUFDQSxTQUFTQSxXQUFXQSxHQUFHO0FBQ25CO0FBQ0EsRUFBQSxNQUFNQyxZQUFZLEdBQUc7QUFDakJDLElBQUFBLE9BQU8sRUFBRSxDQUFDO0FBQTBCO0FBQ3BDQyxJQUFBQSxPQUFPLEVBQUUsQ0FBQztBQUEwQjtBQUNwQ0MsSUFBQUEsTUFBTSxFQUFFLENBQUM7QUFBMkI7QUFDcENDLElBQUFBLE1BQU0sRUFBRSxDQUFDO0FBQTJCO0FBQ3BDQyxJQUFBQSxlQUFlLEVBQUUsQ0FBQztBQUFrQjtBQUNwQ0MsSUFBQUEsZ0JBQWdCLEVBQUUsQ0FBQztBQUFpQjtBQUNwQ0MsSUFBQUEsV0FBVyxFQUFFLEVBQUU7QUFBcUI7QUFDcENDLElBQUFBLFVBQVUsRUFBRSxFQUFFO0FBQXNCO0FBQ3BDQyxJQUFBQSw4QkFBOEIsRUFBRSxFQUFFO0FBQUU7QUFDcEM7QUFDQUMsSUFBQUEsU0FBUyxFQUFFLEVBQUU7QUFBdUI7QUFDcENDLElBQUFBLFNBQVMsRUFBRSxFQUFFO0FBQXVCO0lBQ3BDQyxXQUFXLEVBQUUsRUFBRTtHQUNsQixDQUFBOztBQUVEO0FBQ0EsRUFBQSxNQUFNQyxhQUFhLEdBQUc7SUFDbEJDLElBQUksRUFBRWQsWUFBWSxDQUFDTyxXQUFXO0lBQzlCUSxHQUFHLEVBQUVmLFlBQVksQ0FBQ0csTUFBTTtJQUN4QmEsSUFBSSxFQUFFaEIsWUFBWSxDQUFDQyxPQUFPO0lBQzFCZ0IsSUFBSSxFQUFFakIsWUFBWSxDQUFDQyxPQUFPO0lBQzFCaUIsR0FBRyxFQUFFbEIsWUFBWSxDQUFDSyxlQUFlO0lBQ2pDYyxHQUFHLEVBQUVuQixZQUFZLENBQUNRLFVBQVU7SUFDNUJZLElBQUksRUFBRXBCLFlBQVksQ0FBQ1csU0FBQUE7R0FDdEIsQ0FBQTs7QUFFRDtBQUNBLEVBQUEsTUFBTVUsWUFBWSxHQUFHO0lBQ2pCUCxJQUFJLEVBQUVkLFlBQVksQ0FBQ08sV0FBVztJQUM5QlEsR0FBRyxFQUFFZixZQUFZLENBQUNJLE1BQU07SUFDeEJZLElBQUksRUFBRWhCLFlBQVksQ0FBQ1ksV0FBVztJQUM5QkssSUFBSSxFQUFFakIsWUFBWSxDQUFDRSxPQUFPO0lBQzFCZ0IsR0FBRyxFQUFFbEIsWUFBWSxDQUFDTSxnQkFBZ0I7SUFDbENhLEdBQUcsRUFBRW5CLFlBQVksQ0FBQ1MsOEJBQThCO0lBQ2hEVyxJQUFJLEVBQUVwQixZQUFZLENBQUNZLFdBQUFBO0dBQ3RCLENBQUE7O0FBRUQ7QUFDQSxFQUFBLE1BQU1VLFlBQVksR0FBRztBQUNqQkMsSUFBQUEsSUFBSSxFQUFFLEVBQUU7QUFDUkMsSUFBQUEsUUFBUSxFQUFFLEVBQUU7QUFDWkMsSUFBQUEsU0FBUyxFQUFFLEVBQUU7QUFDYkMsSUFBQUEsSUFBSSxFQUFFLENBQUM7QUFDUEMsSUFBQUEsSUFBSSxFQUFFLEVBQUU7QUFDUkMsSUFBQUEsZ0JBQWdCLEVBQUUsRUFBRTtBQUNwQkMsSUFBQUEsaUJBQWlCLEVBQUUsRUFBRTtBQUNyQkMsSUFBQUEsUUFBUSxFQUFFLEVBQUU7QUFDWkMsSUFBQUEsT0FBTyxFQUFFLEVBQUU7QUFDWEMsSUFBQUEsUUFBUSxFQUFFLEVBQUU7QUFDWkMsSUFBQUEsV0FBVyxFQUFFLENBQUM7QUFDZEMsSUFBQUEsUUFBUSxFQUFFLENBQUM7QUFDWEMsSUFBQUEsV0FBVyxFQUFFLENBQUE7R0FDaEIsQ0FBQTs7QUFFRDtBQUNBLEVBQUEsTUFBTUMsb0JBQW9CLEdBQUdBLENBQUNDLFdBQVcsRUFBRUMsYUFBYSxLQUFLO0FBQ3pELElBQUEsUUFBUUQsV0FBVztNQUNmLEtBQUtyQyxZQUFZLENBQUNDLE9BQU87QUFBRSxRQUFBLE9BQU9xQyxhQUFhLENBQUNDLE9BQU8sQ0FBQ3ZCLElBQUksR0FBR00sWUFBWSxDQUFDQyxJQUFJLEdBQUdELFlBQVksQ0FBQ0UsUUFBUSxDQUFBO01BQ3hHLEtBQUt4QixZQUFZLENBQUNFLE9BQU87UUFBRSxPQUFPb0IsWUFBWSxDQUFDRyxTQUFTLENBQUE7TUFDeEQsS0FBS3pCLFlBQVksQ0FBQ0csTUFBTTtRQUFFLE9BQU9tQixZQUFZLENBQUNJLElBQUksQ0FBQTtNQUNsRCxLQUFLMUIsWUFBWSxDQUFDSSxNQUFNO1FBQUUsT0FBT2tCLFlBQVksQ0FBQ0ssSUFBSSxDQUFBO01BQ2xELEtBQUszQixZQUFZLENBQUNLLGVBQWU7UUFBRSxPQUFPaUIsWUFBWSxDQUFDTSxnQkFBZ0IsQ0FBQTtNQUN2RSxLQUFLNUIsWUFBWSxDQUFDTSxnQkFBZ0I7UUFBRSxPQUFPZ0IsWUFBWSxDQUFDTyxpQkFBaUIsQ0FBQTtNQUN6RSxLQUFLN0IsWUFBWSxDQUFDTyxXQUFXO1FBQUUsT0FBT2UsWUFBWSxDQUFDUSxRQUFRLENBQUE7TUFDM0QsS0FBSzlCLFlBQVksQ0FBQ1EsVUFBVTtRQUFFLE9BQU9jLFlBQVksQ0FBQ1MsT0FBTyxDQUFBO01BQ3pELEtBQUsvQixZQUFZLENBQUNTLDhCQUE4QjtRQUFFLE9BQU9hLFlBQVksQ0FBQ1UsUUFBUSxDQUFBO01BQzlFLEtBQUtoQyxZQUFZLENBQUNVLFNBQVM7UUFBRSxPQUFPWSxZQUFZLENBQUNXLFdBQVcsQ0FBQTtNQUM1RCxLQUFLakMsWUFBWSxDQUFDVyxTQUFTO1FBQUUsT0FBT1csWUFBWSxDQUFDWSxRQUFRLENBQUE7TUFDekQsS0FBS2xDLFlBQVksQ0FBQ1ksV0FBVztRQUFFLE9BQU9VLFlBQVksQ0FBQ2EsV0FBVyxDQUFBO0FBQ2xFLEtBQUE7R0FDSCxDQUFBOztBQUVEO0VBQ0EsTUFBTUssYUFBYSxHQUFJQyxJQUFJLElBQUs7QUFDNUI7SUFDQSxNQUFNQyxJQUFJLEdBQUcsU0FBUEEsSUFBSUEsQ0FBYUMsQ0FBQyxFQUFFQyxDQUFDLEVBQUU7TUFDekIsTUFBTUMsQ0FBQyxHQUFHRixDQUFDLElBQUksR0FBRyxHQUFHLEtBQUssQ0FBQyxHQUFHLEdBQUcsQ0FBQTtNQUNqQyxNQUFNRyxDQUFDLEdBQUdGLENBQUMsSUFBSSxHQUFHLEdBQUcsS0FBSyxDQUFDLEdBQUcsR0FBRyxDQUFBO01BQ2pDLE1BQU1HLENBQUMsR0FBR0MsSUFBSSxDQUFDQyxJQUFJLENBQUMsR0FBRyxHQUFHRCxJQUFJLENBQUNFLEdBQUcsQ0FBQyxHQUFHLEVBQUVMLENBQUMsR0FBR0EsQ0FBQyxHQUFHQyxDQUFDLEdBQUdBLENBQUMsQ0FBQyxDQUFDLENBQUE7TUFDdkQsT0FBT0UsSUFBSSxDQUFDRyxHQUFHLENBQUMsQ0FBQyxFQUFFSCxJQUFJLENBQUNFLEdBQUcsQ0FBQyxHQUFHLEVBQUVGLElBQUksQ0FBQ0ksS0FBSyxDQUFFLENBQUNMLENBQUMsR0FBRyxHQUFHLElBQUksR0FBRyxHQUFJLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQTtLQUMzRSxDQUFBO0FBRUQsSUFBQSxLQUFLLElBQUlNLE1BQU0sR0FBRyxDQUFDLEVBQUVBLE1BQU0sR0FBR1osSUFBSSxDQUFDYSxNQUFNLEVBQUVELE1BQU0sSUFBSSxDQUFDLEVBQUU7QUFDcEQsTUFBQSxNQUFNVixDQUFDLEdBQUdGLElBQUksQ0FBQ1ksTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFBO0FBQzFCLE1BQUEsTUFBTVQsQ0FBQyxHQUFHSCxJQUFJLENBQUNZLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQTtBQUMxQlosTUFBQUEsSUFBSSxDQUFDWSxNQUFNLEdBQUcsQ0FBQyxDQUFDLEdBQUdWLENBQUMsQ0FBQTtNQUNwQkYsSUFBSSxDQUFDWSxNQUFNLEdBQUcsQ0FBQyxDQUFDLEdBQUdYLElBQUksQ0FBQ0MsQ0FBQyxFQUFFQyxDQUFDLENBQUMsQ0FBQTtBQUM3QkgsTUFBQUEsSUFBSSxDQUFDWSxNQUFNLEdBQUcsQ0FBQyxDQUFDLEdBQUcsR0FBRyxDQUFBO0FBQzFCLEtBQUE7QUFFQSxJQUFBLE9BQU9aLElBQUksQ0FBQTtHQUNkLENBQUE7O0FBRUQ7RUFDQSxNQUFNYyxPQUFPLEdBQUlkLElBQUksSUFBSztJQUN0QixNQUFNZSxNQUFNLEdBQUcsSUFBSUMsV0FBVyxDQUFDaEIsSUFBSSxDQUFDYSxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUE7QUFFL0MsSUFBQSxLQUFLLElBQUlELE1BQU0sR0FBRyxDQUFDLEVBQUVBLE1BQU0sR0FBR1osSUFBSSxDQUFDYSxNQUFNLEVBQUVELE1BQU0sSUFBSSxDQUFDLEVBQUU7QUFDcEQsTUFBQSxNQUFNVixDQUFDLEdBQUdGLElBQUksQ0FBQ1ksTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFBO0FBQzFCLE1BQUEsTUFBTVQsQ0FBQyxHQUFHSCxJQUFJLENBQUNZLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQTtBQUMxQixNQUFBLE1BQU1LLENBQUMsR0FBR2pCLElBQUksQ0FBQ1ksTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFBO01BQzFCRyxNQUFNLENBQUNILE1BQU0sR0FBRyxDQUFDLENBQUMsR0FBSSxDQUFDVixDQUFDLEdBQUcsSUFBSSxLQUFLLENBQUM7QUFBSztBQUNwQixNQUFBLENBQUNDLENBQUMsR0FBRyxJQUFJLEtBQUssQ0FBRTtBQUFJO01BQ25CYyxDQUFDLElBQUksQ0FBRyxDQUFDO0FBQ3BDLEtBQUE7O0FBRUEsSUFBQSxPQUFPRixNQUFNLENBQUE7R0FDaEIsQ0FBQTtBQUVELEVBQUEsTUFBTUcsS0FBSyxHQUFHQSxDQUFDQyxLQUFLLEVBQUVDLE1BQU0sS0FBSztBQUM3QixJQUFBLE9BQVEsQ0FBQ0QsS0FBSyxHQUFJQSxLQUFLLEdBQUcsQ0FBRSxNQUFNLENBQUMsSUFBTSxDQUFDQyxNQUFNLEdBQUlBLE1BQU0sR0FBRyxDQUFFLE1BQU0sQ0FBRSxDQUFBO0dBQzFFLENBQUE7RUFFRCxNQUFNQyxjQUFjLEdBQUdBLE1BQU07SUFDekIsT0FBUSxPQUFPQyxXQUFXLEtBQUssV0FBVyxHQUFJQSxXQUFXLENBQUNDLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQTtHQUN0RSxDQUFBOztBQUVEO0FBQ0EsRUFBQSxJQUFJQyxLQUFLLENBQUE7QUFDVCxFQUFBLElBQUlDLFdBQVcsQ0FBQTtBQUNmLEVBQUEsSUFBSUMsWUFBWSxDQUFBO0VBRWhCLE1BQU1DLGtCQUFrQixHQUFHQSxDQUFDOUIsYUFBYSxFQUFFK0IsUUFBUSxFQUFFQyxPQUFPLEtBQUs7QUFDN0Q7QUFDQSxJQUFBLElBQUlBLE9BQU8sRUFBRTtBQUNULE1BQUEsSUFBSWhDLGFBQWEsQ0FBQ0MsT0FBTyxDQUFDekIsSUFBSSxFQUFFO0FBQzVCLFFBQUEsT0FBTyxNQUFNLENBQUE7QUFDakIsT0FBQTtBQUNKLEtBQUMsTUFBTTtBQUNILE1BQUEsSUFBSXVELFFBQVEsRUFBRTtBQUNWLFFBQUEsSUFBSS9CLGFBQWEsQ0FBQ0MsT0FBTyxDQUFDdEIsSUFBSSxFQUFFO0FBQzVCLFVBQUEsT0FBTyxNQUFNLENBQUE7QUFDakIsU0FBQTtBQUNKLE9BQUMsTUFBTTtRQUNILElBQUlxQixhQUFhLENBQUNDLE9BQU8sQ0FBQ3ZCLElBQUksSUFBSXNCLGFBQWEsQ0FBQ0MsT0FBTyxDQUFDdEIsSUFBSSxFQUFFO0FBQzFELFVBQUEsT0FBTyxNQUFNLENBQUE7QUFDakIsU0FBQTtBQUNKLE9BQUE7QUFDSixLQUFBO0lBRUEsTUFBTXNELFdBQVcsR0FBSUMsUUFBUSxJQUFLO0FBQzlCLE1BQUEsS0FBSyxJQUFJQyxDQUFDLEdBQUcsQ0FBQyxFQUFFQSxDQUFDLEdBQUdELFFBQVEsQ0FBQ2xCLE1BQU0sRUFBRSxFQUFFbUIsQ0FBQyxFQUFFO0FBQ3RDLFFBQUEsTUFBTUMsTUFBTSxHQUFHRixRQUFRLENBQUNDLENBQUMsQ0FBQyxDQUFBO0FBQzFCLFFBQUEsSUFBSW5DLGFBQWEsQ0FBQ0MsT0FBTyxDQUFDbUMsTUFBTSxDQUFDLEVBQUU7QUFDL0IsVUFBQSxPQUFPQSxNQUFNLENBQUE7QUFDakIsU0FBQTtBQUNKLE9BQUE7QUFDQSxNQUFBLE9BQU8sTUFBTSxDQUFBO0tBQ2hCLENBQUE7QUFFRCxJQUFBLE9BQU9ILFdBQVcsQ0FBQ0YsUUFBUSxHQUFHRixZQUFZLEdBQUdELFdBQVcsQ0FBQyxDQUFBO0dBQzVELENBQUE7O0FBRUQ7RUFDQSxNQUFNUyxlQUFlLEdBQUdBLENBQUNmLEtBQUssRUFBRUMsTUFBTSxFQUFFYSxNQUFNLEVBQUVFLE1BQU0sS0FBSztBQUN2RCxJQUFBLFFBQVFGLE1BQU07QUFDVjtNQUNBLEtBQUsxRSxZQUFZLENBQUNDLE9BQU8sQ0FBQTtNQUN6QixLQUFLRCxZQUFZLENBQUNFLE9BQU87QUFDckI7QUFDQSxRQUFBLE9BQU8sSUFBSSxDQUFBO0FBQ2Y7TUFDQSxLQUFLRixZQUFZLENBQUNHLE1BQU0sQ0FBQTtNQUN4QixLQUFLSCxZQUFZLENBQUNJLE1BQU07QUFDcEI7QUFDQSxRQUFBLE9BQVEsQ0FBQ3dELEtBQUssR0FBRyxHQUFHLE1BQU0sQ0FBQyxJQUFNLENBQUNDLE1BQU0sR0FBRyxHQUFHLE1BQU0sQ0FBRSxDQUFBO0FBQzFEO01BQ0EsS0FBSzdELFlBQVksQ0FBQ0ssZUFBZSxDQUFBO01BQ2pDLEtBQUtMLFlBQVksQ0FBQ00sZ0JBQWdCO0FBQzlCLFFBQUEsT0FBT3FELEtBQUssQ0FBQ0MsS0FBSyxFQUFFQyxNQUFNLENBQUMsS0FBTUQsS0FBSyxLQUFLQyxNQUFNLElBQUtlLE1BQU0sQ0FBQyxDQUFBO0FBQ2pFO01BQ0EsS0FBSzVFLFlBQVksQ0FBQ08sV0FBVztBQUN6QixRQUFBLE9BQU8sSUFBSSxDQUFBO0FBQ2Y7TUFDQSxLQUFLUCxZQUFZLENBQUNRLFVBQVUsQ0FBQTtNQUM1QixLQUFLUixZQUFZLENBQUNTLDhCQUE4QjtBQUM1QztBQUNBO0FBQ0EsUUFBQSxPQUFPLElBQUksQ0FBQTtBQUNuQixLQUFBO0FBQ0EsSUFBQSxPQUFPLEtBQUssQ0FBQTtHQUNmLENBQUE7RUFFRCxNQUFNb0UsYUFBYSxHQUFHQSxDQUFDQyxHQUFHLEVBQUVyQyxJQUFJLEVBQUVzQyxPQUFPLEtBQUs7QUFDMUMsSUFBQSxJQUFJLENBQUNkLEtBQUssQ0FBQ2UsUUFBUSxFQUFFO0FBQ2pCLE1BQUEsTUFBTSxJQUFJQyxLQUFLLENBQUMsNERBQTRELENBQUMsQ0FBQTtBQUNqRixLQUFBO0FBRUEsSUFBQSxNQUFNQyxTQUFTLEdBQUdwQixjQUFjLEVBQUUsQ0FBQTtBQUNsQyxJQUFBLE1BQU1xQixTQUFTLEdBQUcsSUFBSWxCLEtBQUssQ0FBQ2UsUUFBUSxDQUFDLElBQUlJLFVBQVUsQ0FBQzNDLElBQUksQ0FBQyxDQUFDLENBQUE7QUFFMUQsSUFBQSxNQUFNbUIsS0FBSyxHQUFHdUIsU0FBUyxDQUFDRSxRQUFRLEVBQUUsQ0FBQTtBQUNsQyxJQUFBLE1BQU14QixNQUFNLEdBQUdzQixTQUFTLENBQUNHLFNBQVMsRUFBRSxDQUFBO0FBQ3BDLElBQUEsTUFBTUMsTUFBTSxHQUFHSixTQUFTLENBQUNLLFNBQVMsRUFBRSxDQUFBO0lBQ3BDLE1BQU1uQixRQUFRLEdBQUcsQ0FBQyxDQUFDYyxTQUFTLENBQUNNLFdBQVcsRUFBRSxDQUFBO0lBQzFDLE1BQU1uQixPQUFPLEdBQUdhLFNBQVMsQ0FBQ2IsT0FBTyxJQUFJYSxTQUFTLENBQUNiLE9BQU8sRUFBRSxDQUFBO0lBRXhELElBQUksQ0FBQ1YsS0FBSyxJQUFJLENBQUNDLE1BQU0sSUFBSSxDQUFDMEIsTUFBTSxFQUFFO01BQzlCSixTQUFTLENBQUNPLEtBQUssRUFBRSxDQUFBO01BQ2pCUCxTQUFTLENBQUNRLE1BQU0sRUFBRSxDQUFBO0FBQ2xCLE1BQUEsTUFBTSxJQUFJVixLQUFLLENBQUUsQ0FBQSw2QkFBQSxFQUErQkgsR0FBSSxDQUFBLE9BQUEsRUFBU2xCLEtBQU0sQ0FBQSxRQUFBLEVBQVVDLE1BQU8sQ0FBQSxRQUFBLEVBQVUwQixNQUFPLENBQUEsQ0FBQyxDQUFDLENBQUE7QUFDM0csS0FBQTs7QUFFQTtJQUNBLE1BQU1iLE1BQU0sR0FBR04sa0JBQWtCLENBQUNXLE9BQU8sQ0FBQ3pDLGFBQWEsRUFBRStCLFFBQVEsRUFBRUMsT0FBTyxDQUFDLENBQUE7O0FBRTNFO0lBQ0EsTUFBTXNCLFNBQVMsR0FBRyxDQUFDLENBQUNiLE9BQU8sQ0FBQ2MsTUFBTSxJQUFJbkIsTUFBTSxLQUFLLEtBQUssQ0FBQTs7QUFFdEQ7QUFDQSxJQUFBLElBQUlyQyxXQUFXLENBQUE7QUFDZixJQUFBLElBQUl1RCxTQUFTLEVBQUU7QUFDWDtNQUNBdkQsV0FBVyxHQUFHckMsWUFBWSxDQUFDVSxTQUFTLENBQUE7QUFDeEMsS0FBQyxNQUFNO0FBQ0g7TUFDQTJCLFdBQVcsR0FBR2dDLFFBQVEsR0FBR2hELFlBQVksQ0FBQ3FELE1BQU0sQ0FBQyxHQUFHN0QsYUFBYSxDQUFDNkQsTUFBTSxDQUFDLENBQUE7O0FBRXJFO0FBQ0EsTUFBQSxJQUFJLENBQUNDLGVBQWUsQ0FBQ2YsS0FBSyxFQUFFQyxNQUFNLEVBQUV4QixXQUFXLEVBQUUwQyxPQUFPLENBQUN6QyxhQUFhLENBQUNzQyxNQUFNLENBQUMsRUFBRTtRQUM1RXZDLFdBQVcsR0FBR2dDLFFBQVEsR0FBR3JFLFlBQVksQ0FBQ1UsU0FBUyxHQUFHVixZQUFZLENBQUNXLFNBQVMsQ0FBQTtBQUM1RSxPQUFBO0FBQ0osS0FBQTtBQUVBLElBQUEsSUFBSSxDQUFDd0UsU0FBUyxDQUFDVyxnQkFBZ0IsRUFBRSxFQUFFO01BQy9CWCxTQUFTLENBQUNPLEtBQUssRUFBRSxDQUFBO01BQ2pCUCxTQUFTLENBQUNRLE1BQU0sRUFBRSxDQUFBO0FBQ2xCLE1BQUEsTUFBTSxJQUFJVixLQUFLLENBQUMsa0NBQWtDLEdBQUdILEdBQUcsQ0FBQyxDQUFBO0FBQzdELEtBQUE7QUFFQSxJQUFBLElBQUlMLENBQUMsQ0FBQTtJQUVMLE1BQU1zQixTQUFTLEdBQUcsRUFBRSxDQUFBO0lBQ3BCLEtBQUssSUFBSUMsR0FBRyxHQUFHLENBQUMsRUFBRUEsR0FBRyxHQUFHVCxNQUFNLEVBQUUsRUFBRVMsR0FBRyxFQUFFO0FBQ25DLE1BQUEsTUFBTUMsT0FBTyxHQUFHZCxTQUFTLENBQUNlLDZCQUE2QixDQUFDRixHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRTNELFdBQVcsQ0FBQyxDQUFBO0FBQy9FLE1BQUEsTUFBTThELEdBQUcsR0FBRyxJQUFJZixVQUFVLENBQUNhLE9BQU8sQ0FBQyxDQUFBO01BRW5DLElBQUksQ0FBQ2QsU0FBUyxDQUFDaUIsY0FBYyxDQUFDRCxHQUFHLEVBQUVILEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFM0QsV0FBVyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFO1FBQ25FOEMsU0FBUyxDQUFDTyxLQUFLLEVBQUUsQ0FBQTtRQUNqQlAsU0FBUyxDQUFDUSxNQUFNLEVBQUUsQ0FBQTtBQUNsQixRQUFBLE1BQU0sSUFBSVYsS0FBSyxDQUFDLGdDQUFnQyxHQUFHSCxHQUFHLENBQUMsQ0FBQTtBQUMzRCxPQUFBO0FBRUEsTUFBQSxNQUFNdUIsYUFBYSxHQUFJaEUsV0FBVyxLQUFLckMsWUFBWSxDQUFDVyxTQUFTLElBQUkwQixXQUFXLEtBQUtyQyxZQUFZLENBQUNZLFdBQVksQ0FBQTtBQUUxR21GLE1BQUFBLFNBQVMsQ0FBQ08sSUFBSSxDQUFDRCxhQUFhLEdBQUcsSUFBSTVDLFdBQVcsQ0FBQzBDLEdBQUcsQ0FBQ0ksTUFBTSxDQUFDLEdBQUdKLEdBQUcsQ0FBQyxDQUFBO0FBQ3JFLEtBQUE7SUFFQWhCLFNBQVMsQ0FBQ08sS0FBSyxFQUFFLENBQUE7SUFDakJQLFNBQVMsQ0FBQ1EsTUFBTSxFQUFFLENBQUE7O0FBRWxCO0FBQ0EsSUFBQSxJQUFJQyxTQUFTLEVBQUU7TUFDWHZELFdBQVcsR0FBR3JDLFlBQVksQ0FBQ1csU0FBUyxDQUFBO0FBQ3BDLE1BQUEsS0FBSzhELENBQUMsR0FBRyxDQUFDLEVBQUVBLENBQUMsR0FBR3NCLFNBQVMsQ0FBQ3pDLE1BQU0sRUFBRSxFQUFFbUIsQ0FBQyxFQUFFO0FBQ25Dc0IsUUFBQUEsU0FBUyxDQUFDdEIsQ0FBQyxDQUFDLEdBQUdsQixPQUFPLENBQUNmLGFBQWEsQ0FBQ3VELFNBQVMsQ0FBQ3RCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQTtBQUN2RCxPQUFBO0FBQ0osS0FBQTtJQUVBLE9BQU87TUFDSEMsTUFBTSxFQUFFdEMsb0JBQW9CLENBQUNDLFdBQVcsRUFBRTBDLE9BQU8sQ0FBQ3pDLGFBQWEsQ0FBQztBQUNoRXNCLE1BQUFBLEtBQUssRUFBRUEsS0FBSztBQUNaQyxNQUFBQSxNQUFNLEVBQUVBLE1BQU07QUFDZDBCLE1BQUFBLE1BQU0sRUFBRVEsU0FBUztBQUNqQlMsTUFBQUEsT0FBTyxFQUFFLEtBQUs7QUFDZEMsTUFBQUEsYUFBYSxFQUFFM0MsY0FBYyxFQUFFLEdBQUdvQixTQUFTO0FBQzNDSixNQUFBQSxHQUFHLEVBQUVBLEdBQUc7QUFDUjRCLE1BQUFBLGNBQWMsRUFBRWQsU0FBQUE7S0FDbkIsQ0FBQTtHQUNKLENBQUE7O0FBRUQ7RUFDQSxNQUFNZSxjQUFjLEdBQUdBLENBQUM3QixHQUFHLEVBQUVyQyxJQUFJLEVBQUVzQyxPQUFPLEtBQUs7QUFDM0MsSUFBQSxNQUFNRyxTQUFTLEdBQUdwQixjQUFjLEVBQUUsQ0FBQTtBQUNsQyxJQUFBLE1BQU1xQixTQUFTLEdBQUcsSUFBSWxCLEtBQUssQ0FBQzJDLFNBQVMsQ0FBQyxJQUFJeEIsVUFBVSxDQUFDM0MsSUFBSSxDQUFDLENBQUMsQ0FBQTtJQUUzRCxNQUFNbUIsS0FBSyxHQUFHdUIsU0FBUyxDQUFDMEIsYUFBYSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQTtJQUMzQyxNQUFNaEQsTUFBTSxHQUFHc0IsU0FBUyxDQUFDMkIsY0FBYyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQTtBQUM3QyxJQUFBLE1BQU1DLE1BQU0sR0FBRzVCLFNBQVMsQ0FBQzZCLFlBQVksRUFBRSxDQUFBO0FBQ3ZDLElBQUEsTUFBTXpCLE1BQU0sR0FBR0osU0FBUyxDQUFDOEIsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFBO0lBQ3hDLE1BQU01QyxRQUFRLEdBQUcsQ0FBQyxDQUFDYyxTQUFTLENBQUNNLFdBQVcsRUFBRSxDQUFBO0lBQzFDLE1BQU1uQixPQUFPLEdBQUdhLFNBQVMsQ0FBQ2IsT0FBTyxJQUFJYSxTQUFTLENBQUNiLE9BQU8sRUFBRSxDQUFBO0lBRXhELElBQUksQ0FBQ1YsS0FBSyxJQUFJLENBQUNDLE1BQU0sSUFBSSxDQUFDa0QsTUFBTSxJQUFJLENBQUN4QixNQUFNLEVBQUU7TUFDekNKLFNBQVMsQ0FBQ08sS0FBSyxFQUFFLENBQUE7TUFDakJQLFNBQVMsQ0FBQ1EsTUFBTSxFQUFFLENBQUE7QUFDbEIsTUFBQSxNQUFNLElBQUlWLEtBQUssQ0FBRSxDQUFBLDZCQUFBLEVBQStCSCxHQUFJLENBQVNsQixPQUFBQSxFQUFBQSxLQUFNLENBQVVDLFFBQUFBLEVBQUFBLE1BQU8sQ0FBVWtELFFBQUFBLEVBQUFBLE1BQU8sQ0FBVXhCLFFBQUFBLEVBQUFBLE1BQU8sRUFBQyxDQUFDLENBQUE7QUFDNUgsS0FBQTs7QUFFQTtJQUNBLE1BQU1iLE1BQU0sR0FBR04sa0JBQWtCLENBQUNXLE9BQU8sQ0FBQ3pDLGFBQWEsRUFBRStCLFFBQVEsRUFBRUMsT0FBTyxDQUFDLENBQUE7O0FBRTNFO0lBQ0EsTUFBTXNCLFNBQVMsR0FBRyxDQUFDLENBQUNiLE9BQU8sQ0FBQ2MsTUFBTSxJQUFJbkIsTUFBTSxLQUFLLEtBQUssQ0FBQTs7QUFFdEQ7QUFDQSxJQUFBLElBQUlyQyxXQUFXLENBQUE7QUFDZixJQUFBLElBQUl1RCxTQUFTLEVBQUU7QUFDWDtNQUNBdkQsV0FBVyxHQUFHckMsWUFBWSxDQUFDVSxTQUFTLENBQUE7QUFDeEMsS0FBQyxNQUFNO0FBQ0g7TUFDQTJCLFdBQVcsR0FBR2dDLFFBQVEsR0FBR2hELFlBQVksQ0FBQ3FELE1BQU0sQ0FBQyxHQUFHN0QsYUFBYSxDQUFDNkQsTUFBTSxDQUFDLENBQUE7O0FBRXJFO0FBQ0EsTUFBQSxJQUFJLENBQUNDLGVBQWUsQ0FBQ2YsS0FBSyxFQUFFQyxNQUFNLEVBQUV4QixXQUFXLEVBQUUwQyxPQUFPLENBQUN6QyxhQUFhLENBQUNzQyxNQUFNLENBQUMsRUFBRTtRQUM1RXZDLFdBQVcsR0FBR2dDLFFBQVEsR0FBR3JFLFlBQVksQ0FBQ1UsU0FBUyxHQUFHVixZQUFZLENBQUNXLFNBQVMsQ0FBQTtBQUM1RSxPQUFBO0FBQ0osS0FBQTtBQUVBLElBQUEsSUFBSSxDQUFDd0UsU0FBUyxDQUFDVyxnQkFBZ0IsRUFBRSxFQUFFO01BQy9CWCxTQUFTLENBQUNPLEtBQUssRUFBRSxDQUFBO01BQ2pCUCxTQUFTLENBQUNRLE1BQU0sRUFBRSxDQUFBO0FBQ2xCLE1BQUEsTUFBTSxJQUFJVixLQUFLLENBQUMsa0NBQWtDLEdBQUdILEdBQUcsQ0FBQyxDQUFBO0FBQzdELEtBQUE7QUFFQSxJQUFBLElBQUlMLENBQUMsQ0FBQTtJQUVMLE1BQU1zQixTQUFTLEdBQUcsRUFBRSxDQUFBO0lBQ3BCLEtBQUssSUFBSUMsR0FBRyxHQUFHLENBQUMsRUFBRUEsR0FBRyxHQUFHVCxNQUFNLEVBQUUsRUFBRVMsR0FBRyxFQUFFO01BQ25DLE1BQU1DLE9BQU8sR0FBR2QsU0FBUyxDQUFDZSw2QkFBNkIsQ0FBQyxDQUFDLEVBQUVGLEdBQUcsRUFBRTNELFdBQVcsQ0FBQyxDQUFBO0FBQzVFLE1BQUEsTUFBTThELEdBQUcsR0FBRyxJQUFJZixVQUFVLENBQUNhLE9BQU8sQ0FBQyxDQUFBO0FBRW5DLE1BQUEsSUFBSSxDQUFDZCxTQUFTLENBQUNpQixjQUFjLENBQUNELEdBQUcsRUFBRSxDQUFDLEVBQUVILEdBQUcsRUFBRTNELFdBQVcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUU7UUFDM0Q4QyxTQUFTLENBQUNPLEtBQUssRUFBRSxDQUFBO1FBQ2pCUCxTQUFTLENBQUNRLE1BQU0sRUFBRSxDQUFBO0FBQ2xCLFFBQUEsTUFBTSxJQUFJVixLQUFLLENBQUMsZ0NBQWdDLEdBQUdILEdBQUcsQ0FBQyxDQUFBO0FBQzNELE9BQUE7QUFFQSxNQUFBLE1BQU11QixhQUFhLEdBQUloRSxXQUFXLEtBQUtyQyxZQUFZLENBQUNXLFNBQVMsSUFBSTBCLFdBQVcsS0FBS3JDLFlBQVksQ0FBQ1ksV0FBWSxDQUFBO0FBRTFHbUYsTUFBQUEsU0FBUyxDQUFDTyxJQUFJLENBQUNELGFBQWEsR0FBRyxJQUFJNUMsV0FBVyxDQUFDMEMsR0FBRyxDQUFDSSxNQUFNLENBQUMsR0FBR0osR0FBRyxDQUFDLENBQUE7QUFDckUsS0FBQTtJQUVBaEIsU0FBUyxDQUFDTyxLQUFLLEVBQUUsQ0FBQTtJQUNqQlAsU0FBUyxDQUFDUSxNQUFNLEVBQUUsQ0FBQTs7QUFFbEI7QUFDQSxJQUFBLElBQUlDLFNBQVMsRUFBRTtNQUNYdkQsV0FBVyxHQUFHckMsWUFBWSxDQUFDVyxTQUFTLENBQUE7QUFDcEMsTUFBQSxLQUFLOEQsQ0FBQyxHQUFHLENBQUMsRUFBRUEsQ0FBQyxHQUFHc0IsU0FBUyxDQUFDekMsTUFBTSxFQUFFLEVBQUVtQixDQUFDLEVBQUU7QUFDbkNzQixRQUFBQSxTQUFTLENBQUN0QixDQUFDLENBQUMsR0FBR2xCLE9BQU8sQ0FBQ2YsYUFBYSxDQUFDdUQsU0FBUyxDQUFDdEIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFBO0FBQ3ZELE9BQUE7QUFDSixLQUFBO0lBRUEsT0FBTztNQUNIQyxNQUFNLEVBQUV0QyxvQkFBb0IsQ0FBQ0MsV0FBVyxFQUFFMEMsT0FBTyxDQUFDekMsYUFBYSxDQUFDO0FBQ2hFc0IsTUFBQUEsS0FBSyxFQUFFQSxLQUFLO0FBQ1pDLE1BQUFBLE1BQU0sRUFBRUEsTUFBTTtBQUNkMEIsTUFBQUEsTUFBTSxFQUFFUSxTQUFTO0FBQ2pCUyxNQUFBQSxPQUFPLEVBQUUsS0FBSztBQUNkQyxNQUFBQSxhQUFhLEVBQUUzQyxjQUFjLEVBQUUsR0FBR29CLFNBQVM7QUFDM0NKLE1BQUFBLEdBQUcsRUFBRUEsR0FBRztBQUNSNEIsTUFBQUEsY0FBYyxFQUFFZCxTQUFBQTtLQUNuQixDQUFBO0dBQ0osQ0FBQTtFQUVELE1BQU1zQixTQUFTLEdBQUdBLENBQUNwQyxHQUFHLEVBQUVyQyxJQUFJLEVBQUVzQyxPQUFPLEtBQUs7SUFDdEMsT0FBT0EsT0FBTyxDQUFDb0MsTUFBTSxHQUFHdEMsYUFBYSxDQUFDQyxHQUFHLEVBQUVyQyxJQUFJLEVBQUVzQyxPQUFPLENBQUMsR0FBRzRCLGNBQWMsQ0FBQzdCLEdBQUcsRUFBRXJDLElBQUksRUFBRXNDLE9BQU8sQ0FBQyxDQUFBO0dBQ2pHLENBQUE7O0FBRUQ7QUFDQTtFQUNBLE1BQU1xQyxlQUFlLEdBQUdBLENBQUN0QyxHQUFHLEVBQUVyQyxJQUFJLEVBQUVzQyxPQUFPLEtBQUs7SUFDNUMsSUFBSTtNQUNBLE1BQU12QixNQUFNLEdBQUcwRCxTQUFTLENBQUNwQyxHQUFHLEVBQUVyQyxJQUFJLEVBQUVzQyxPQUFPLENBQUMsQ0FBQTtBQUM1Q3ZCLE1BQUFBLE1BQU0sQ0FBQytCLE1BQU0sR0FBRy9CLE1BQU0sQ0FBQytCLE1BQU0sQ0FBQzhCLEdBQUcsQ0FBQ0MsQ0FBQyxJQUFJQSxDQUFDLENBQUNmLE1BQU0sQ0FBQyxDQUFBO01BQ2hEZ0IsSUFBSSxDQUFDQyxXQUFXLENBQUM7QUFBRTFDLFFBQUFBLEdBQUcsRUFBRUEsR0FBRztBQUFFckMsUUFBQUEsSUFBSSxFQUFFZSxNQUFBQTtBQUFPLE9BQUMsRUFBRUEsTUFBTSxDQUFDK0IsTUFBTSxDQUFDLENBQUE7S0FDOUQsQ0FBQyxPQUFPa0MsR0FBRyxFQUFFO01BQ1ZGLElBQUksQ0FBQ0MsV0FBVyxDQUFDO0FBQUUxQyxRQUFBQSxHQUFHLEVBQUVBLEdBQUc7QUFBRTJDLFFBQUFBLEdBQUcsRUFBRUEsR0FBQUE7T0FBSyxFQUFFLElBQUksQ0FBQyxDQUFBO0FBQ2xELEtBQUE7R0FDSCxDQUFBO0FBRUQsRUFBQSxNQUFNQyxVQUFVLEdBQUdBLENBQUNDLE1BQU0sRUFBRUMsUUFBUSxLQUFLO0FBQ3JDO0FBQ0EsSUFBQSxNQUFNQyxtQkFBbUIsR0FBR0EsQ0FBQ0MsT0FBTyxFQUFFQyxlQUFlLEtBQUs7QUFDdERDLE1BQUFBLFdBQVcsQ0FBQ0MsV0FBVyxDQUFDTixNQUFNLENBQUNPLE1BQU0sRUFBRUosT0FBTyxDQUFDLENBQzFDSyxJQUFJLENBQUUzRSxNQUFNLElBQUs7UUFDZHVFLGVBQWUsQ0FBQ3ZFLE1BQU0sQ0FBQyxDQUFBO0FBQzNCLE9BQUMsQ0FBQyxDQUNENEUsS0FBSyxDQUFFQyxNQUFNLElBQUs7QUFDZkMsUUFBQUEsT0FBTyxDQUFDQyxLQUFLLENBQUMsdUJBQXVCLEdBQUdGLE1BQU0sQ0FBQyxDQUFBO0FBQ25ELE9BQUMsQ0FBQyxDQUFBO0FBQ04sTUFBQSxPQUFPLEVBQUUsQ0FBQTtLQUNaLENBQUE7QUFFRGQsSUFBQUEsSUFBSSxDQUFDaUIsS0FBSyxDQUFDYixNQUFNLENBQUNPLE1BQU0sR0FBRztBQUFFTyxNQUFBQSxlQUFlLEVBQUVaLG1CQUFBQTtBQUFvQixLQUFDLEdBQUcsSUFBSSxDQUFDLENBQ3RFTSxJQUFJLENBQUVPLFFBQVEsSUFBSztNQUNoQkEsUUFBUSxDQUFDQyxlQUFlLEVBQUUsQ0FBQTs7QUFFMUI7QUFDQTFFLE1BQUFBLEtBQUssR0FBR3lFLFFBQVEsQ0FBQTtNQUNoQnhFLFdBQVcsR0FBR3lELE1BQU0sQ0FBQ3pELFdBQVcsQ0FBQTtNQUNoQ0MsWUFBWSxHQUFHd0QsTUFBTSxDQUFDeEQsWUFBWSxDQUFBO01BRWxDeUQsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFBO0FBQ2xCLEtBQUMsQ0FBQyxDQUFBO0dBQ1QsQ0FBQTs7QUFFRDtFQUNBLE1BQU1nQixLQUFLLEdBQUcsRUFBRSxDQUFBO0FBQ2hCckIsRUFBQUEsSUFBSSxDQUFDc0IsU0FBUyxHQUFJQyxPQUFPLElBQUs7QUFDMUIsSUFBQSxNQUFNckcsSUFBSSxHQUFHcUcsT0FBTyxDQUFDckcsSUFBSSxDQUFBO0lBQ3pCLFFBQVFBLElBQUksQ0FBQ3NHLElBQUk7QUFDYixNQUFBLEtBQUssTUFBTTtBQUNQckIsUUFBQUEsVUFBVSxDQUFDakYsSUFBSSxDQUFDa0YsTUFBTSxFQUFFLE1BQU07QUFDMUIsVUFBQSxLQUFLLElBQUlsRCxDQUFDLEdBQUcsQ0FBQyxFQUFFQSxDQUFDLEdBQUdtRSxLQUFLLENBQUN0RixNQUFNLEVBQUUsRUFBRW1CLENBQUMsRUFBRTtZQUNuQzJDLGVBQWUsQ0FBQ3dCLEtBQUssQ0FBQ25FLENBQUMsQ0FBQyxDQUFDSyxHQUFHLEVBQUU4RCxLQUFLLENBQUNuRSxDQUFDLENBQUMsQ0FBQ2hDLElBQUksRUFBRW1HLEtBQUssQ0FBQ25FLENBQUMsQ0FBQyxDQUFDTSxPQUFPLENBQUMsQ0FBQTtBQUNsRSxXQUFBO1VBQ0E2RCxLQUFLLENBQUN0RixNQUFNLEdBQUcsQ0FBQyxDQUFBO0FBQ3BCLFNBQUMsQ0FBQyxDQUFBO0FBQ0YsUUFBQSxNQUFBO0FBQ0osTUFBQSxLQUFLLFdBQVc7QUFDWixRQUFBLElBQUlXLEtBQUssRUFBRTtBQUNQbUQsVUFBQUEsZUFBZSxDQUFDM0UsSUFBSSxDQUFDcUMsR0FBRyxFQUFFckMsSUFBSSxDQUFDQSxJQUFJLEVBQUVBLElBQUksQ0FBQ3NDLE9BQU8sQ0FBQyxDQUFBO0FBQ3RELFNBQUMsTUFBTTtBQUNINkQsVUFBQUEsS0FBSyxDQUFDdEMsSUFBSSxDQUFDN0QsSUFBSSxDQUFDLENBQUE7QUFDcEIsU0FBQTtBQUNBLFFBQUEsTUFBQTtBQUNSLEtBQUE7R0FDSCxDQUFBO0FBQ0w7Ozs7In0=
