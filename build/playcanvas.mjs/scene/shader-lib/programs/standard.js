import { Debug } from '../../../core/debug.js';
import { SHADER_FORWARD, SHADER_FORWARDHDR, SPRITE_RENDERMODE_SLICED, SPRITE_RENDERMODE_TILED, SPECULAR_PHONG, FRESNEL_SCHLICK, BLEND_NONE } from '../../constants.js';
import { ShaderPass } from '../../shader-pass.js';
import { LitShader } from './lit-shader.js';
import { ChunkBuilder } from '../chunk-builder.js';
import { ChunkUtils } from '../chunk-utils.js';
import { StandardMaterialOptions } from '../../materials/standard-material-options.js';
import { LitOptionsUtils } from './lit-options-utils.js';
import { ShaderGenerator } from './shader-generator.js';

const _matTex2D = [];
const buildPropertiesList = options => {
  return Object.keys(options).filter(key => key !== "litOptions").sort();
};
class ShaderGeneratorStandard extends ShaderGenerator {
  constructor(...args) {
    super(...args);
    // Shared Standard Material option structures
    this.optionsContext = new StandardMaterialOptions();
    this.optionsContextMin = new StandardMaterialOptions();
  }
  generateKey(options) {
    let props;
    if (options === this.optionsContextMin) {
      if (!this.propsMin) this.propsMin = buildPropertiesList(options);
      props = this.propsMin;
    } else if (options === this.optionsContext) {
      if (!this.props) this.props = buildPropertiesList(options);
      props = this.props;
    } else {
      props = buildPropertiesList(options);
    }
    const key = "standard:\n" + props.map(prop => prop + options[prop]).join('\n') + LitOptionsUtils.generateKey(options.litOptions);
    return key;
  }

  // get the value to replace $UV with in Map Shader functions

  /**
   * Get the code with which to to replace '$UV' in the map shader functions.
   *
   * @param {string} transformPropName - Name of the transform id in the options block. Usually "basenameTransform".
   * @param {string} uVPropName - Name of the UV channel in the options block. Usually "basenameUv".
   * @param {object} options - The options passed into createShaderDefinition.
   * @returns {string} The code used to replace "$UV" in the shader code.
   * @private
   */
  _getUvSourceExpression(transformPropName, uVPropName, options) {
    const transformId = options[transformPropName];
    const uvChannel = options[uVPropName];
    const isMainPass = options.litOptions.pass === SHADER_FORWARD || options.litOptions.pass === SHADER_FORWARDHDR;
    let expression;
    if (isMainPass && options.litOptions.nineSlicedMode === SPRITE_RENDERMODE_SLICED) {
      expression = "nineSlicedUv";
    } else if (isMainPass && options.litOptions.nineSlicedMode === SPRITE_RENDERMODE_TILED) {
      expression = "nineSlicedUv";
    } else {
      if (transformId === 0) {
        expression = "vUv" + uvChannel;
      } else {
        // note: different capitalization!
        expression = "vUV" + uvChannel + "_" + transformId;
      }

      // if heightmap is enabled all maps except the heightmap are offset
      if (options.heightMap && transformPropName !== "heightMapTransform") {
        expression += " + dUvOffset";
      }
    }
    return expression;
  }
  _addMapDef(name, enabled) {
    return enabled ? `#define ${name}\n` : `#undef ${name}\n`;
  }
  _addMapDefs(float, color, vertex, map, invert) {
    return this._addMapDef("MAPFLOAT", float) + this._addMapDef("MAPCOLOR", color) + this._addMapDef("MAPVERTEX", vertex) + this._addMapDef("MAPTEXTURE", map) + this._addMapDef("MAPINVERT", invert);
  }

  /**
   * Add chunk for Map Types (used for all maps except Normal).
   *
   * @param {string} propName - The base name of the map: diffuse | emissive | opacity | light | height | metalness | specular | gloss | ao.
   * @param {string} chunkName - The name of the chunk to use. Usually "basenamePS".
   * @param {object} options - The options passed into to createShaderDefinition.
   * @param {object} chunks - The set of shader chunks to choose from.
   * @param {object} mapping - The mapping between chunk and sampler
   * @param {string} encoding - The texture's encoding
   * @returns {string} The shader code to support this map.
   * @private
   */
  _addMap(propName, chunkName, options, chunks, mapping, encoding = null) {
    const mapPropName = propName + "Map";
    const uVPropName = mapPropName + "Uv";
    const identifierPropName = mapPropName + "Identifier";
    const transformPropName = mapPropName + "Transform";
    const channelPropName = mapPropName + "Channel";
    const vertexColorChannelPropName = propName + "VertexColorChannel";
    const tintPropName = propName + "Tint";
    const vertexColorPropName = propName + "VertexColor";
    const detailModePropName = propName + "Mode";
    const invertName = propName + "Invert";
    const tintOption = options[tintPropName];
    const vertexColorOption = options[vertexColorPropName];
    const textureOption = options[mapPropName];
    const textureIdentifier = options[identifierPropName];
    const detailModeOption = options[detailModePropName];
    let subCode = chunks[chunkName];
    if (textureOption) {
      const uv = this._getUvSourceExpression(transformPropName, uVPropName, options);
      subCode = subCode.replace(/\$UV/g, uv).replace(/\$CH/g, options[channelPropName]);
      if (mapping && subCode.search(/\$SAMPLER/g) !== -1) {
        let samplerName = "texture_" + mapPropName;
        const alias = mapping[textureIdentifier];
        if (alias) {
          samplerName = alias;
        } else {
          mapping[textureIdentifier] = samplerName;
        }
        subCode = subCode.replace(/\$SAMPLER/g, samplerName);
      }
      if (encoding) {
        if (options[channelPropName] === 'aaa') {
          // completely skip decoding if the user has selected the alpha channel (since alpha
          // is never decoded).
          subCode = subCode.replace(/\$DECODE/g, 'passThrough');
        } else {
          subCode = subCode.replace(/\$DECODE/g, ChunkUtils.decodeFunc(!options.litOptions.gamma && encoding === 'srgb' ? 'linear' : encoding));
        }

        // continue to support $texture2DSAMPLE
        if (subCode.indexOf('$texture2DSAMPLE')) {
          const decodeTable = {
            linear: 'texture2D',
            srgb: 'texture2DSRGB',
            rgbm: 'texture2DRGBM',
            rgbe: 'texture2DRGBE'
          };
          subCode = subCode.replace(/\$texture2DSAMPLE/g, decodeTable[encoding] || 'texture2D');
        }
      }
    }
    if (vertexColorOption) {
      subCode = subCode.replace(/\$VC/g, options[vertexColorChannelPropName]);
    }
    if (detailModeOption) {
      subCode = subCode.replace(/\$DETAILMODE/g, detailModeOption);
    }
    const isFloatTint = !!(tintOption & 1);
    const isVecTint = !!(tintOption & 2);
    const invertOption = !!options[invertName];
    subCode = this._addMapDefs(isFloatTint, isVecTint, vertexColorOption, textureOption, invertOption) + subCode;
    return subCode.replace(/\$/g, "");
  }
  _correctChannel(p, chan, _matTex2D) {
    if (_matTex2D[p] > 0) {
      if (_matTex2D[p] < chan.length) {
        return chan.substring(0, _matTex2D[p]);
      } else if (_matTex2D[p] > chan.length) {
        let str = chan;
        const chr = str.charAt(str.length - 1);
        const addLen = _matTex2D[p] - str.length;
        for (let i = 0; i < addLen; i++) str += chr;
        return str;
      }
      return chan;
    }
  }

  /**
   * @param {import('../../../platform/graphics/graphics-device.js').GraphicsDevice} device - The
   * graphics device.
   * @param {StandardMaterialOptions} options - The create options.
   * @returns {object} Returns the created shader definition.
   * @ignore
   */
  createShaderDefinition(device, options) {
    const shaderPassInfo = ShaderPass.get(device).getByIndex(options.litOptions.pass);
    const isForwardPass = shaderPassInfo.isForward;
    const litShader = new LitShader(device, options.litOptions);

    // generate vertex shader
    const useUv = [];
    const useUnmodifiedUv = [];
    const mapTransforms = [];
    const maxUvSets = 2;
    const textureMapping = {};
    for (const p in _matTex2D) {
      const mname = p + "Map";
      if (options[p + "VertexColor"]) {
        const cname = p + "VertexColorChannel";
        options[cname] = this._correctChannel(p, options[cname], _matTex2D);
      }
      if (options[mname]) {
        const cname = mname + "Channel";
        const tname = mname + "Transform";
        const uname = mname + "Uv";
        options[uname] = Math.min(options[uname], maxUvSets - 1);
        options[cname] = this._correctChannel(p, options[cname], _matTex2D);
        const uvSet = options[uname];
        useUv[uvSet] = true;
        useUnmodifiedUv[uvSet] = useUnmodifiedUv[uvSet] || options[mname] && !options[tname];

        // create map transforms
        if (options[tname]) {
          mapTransforms.push({
            name: p,
            id: options[tname],
            uv: options[uname]
          });
        }
      }
    }
    if (options.forceUv1) {
      useUv[1] = true;
      useUnmodifiedUv[1] = useUnmodifiedUv[1] !== undefined ? useUnmodifiedUv[1] : true;
    }
    litShader.generateVertexShader(useUv, useUnmodifiedUv, mapTransforms);

    // handle fragment shader
    if (options.litOptions.shadingModel === SPECULAR_PHONG) {
      options.litOptions.fresnelModel = 0;
      options.litOptions.ambientSH = false;
    } else {
      options.litOptions.fresnelModel = options.litOptions.fresnelModel === 0 ? FRESNEL_SCHLICK : options.litOptions.fresnelModel;
    }
    const decl = new ChunkBuilder();
    const code = new ChunkBuilder();
    const func = new ChunkBuilder();
    const args = new ChunkBuilder();
    let lightingUv = "";

    // global texture bias for standard textures
    if (options.litOptions.nineSlicedMode === SPRITE_RENDERMODE_TILED) {
      decl.append(`const float textureBias = -1000.0;`);
    } else {
      decl.append(`uniform float textureBias;`);
    }
    if (isForwardPass) {
      // parallax
      if (options.heightMap) {
        // if (!options.normalMap) {
        //     const transformedHeightMapUv = this._getUvSourceExpression("heightMapTransform", "heightMapUv", options);
        //     if (!options.hasTangents) tbn = tbn.replace(/\$UV/g, transformedHeightMapUv);
        //     code += tbn;
        // }
        decl.append("vec2 dUvOffset;");
        code.append(this._addMap("height", "parallaxPS", options, litShader.chunks, textureMapping));
        func.append("getParallax();");
      }

      // opacity
      if (options.litOptions.blendType !== BLEND_NONE || options.litOptions.alphaTest || options.litOptions.alphaToCoverage) {
        decl.append("float dAlpha;");
        code.append(this._addMap("opacity", "opacityPS", options, litShader.chunks, textureMapping));
        func.append("getOpacity();");
        args.append("litArgs_opacity = dAlpha;");
        if (options.litOptions.alphaTest) {
          code.append(litShader.chunks.alphaTestPS);
          func.append("alphaTest(dAlpha);");
        }
      } else {
        decl.append("float dAlpha = 1.0;");
      }

      // normal
      if (litShader.needsNormal) {
        if (options.normalMap || options.clearCoatNormalMap) {
          // TODO: let each normalmap input (normalMap, normalDetailMap, clearCoatNormalMap) independently decide which unpackNormal to use.
          code.append(options.packedNormal ? litShader.chunks.normalXYPS : litShader.chunks.normalXYZPS);
          if (!options.litOptions.hasTangents) {
            // TODO: generalize to support each normalmap input (normalMap, normalDetailMap, clearCoatNormalMap) independently
            const baseName = options.normalMap ? "normalMap" : "clearCoatNormalMap";
            lightingUv = this._getUvSourceExpression(`${baseName}Transform`, `${baseName}Uv`, options);
          }
        }
        decl.append("vec3 dNormalW;");
        code.append(this._addMap("normalDetail", "normalDetailMapPS", options, litShader.chunks, textureMapping));
        code.append(this._addMap("normal", "normalMapPS", options, litShader.chunks, textureMapping));
        func.append("getNormal();");
        args.append("litArgs_worldNormal = dNormalW;");
      }
      if (litShader.needsSceneColor) {
        decl.append("uniform sampler2D uSceneColorMap;");
      }
      if (litShader.needsScreenSize) {
        decl.append("uniform vec4 uScreenSize;");
      }
      if (litShader.needsTransforms) {
        decl.append("uniform mat4 matrix_viewProjection;");
        decl.append("uniform mat4 matrix_model;");
      }

      // support for diffuse & ao detail modes
      if (options.diffuseDetail || options.aoDetail) {
        code.append(litShader.chunks.detailModesPS);
      }

      // albedo
      decl.append("vec3 dAlbedo;");
      if (options.diffuseDetail) {
        code.append(this._addMap("diffuseDetail", "diffuseDetailMapPS", options, litShader.chunks, textureMapping, options.diffuseDetailEncoding));
      }
      code.append(this._addMap("diffuse", "diffusePS", options, litShader.chunks, textureMapping, options.diffuseEncoding));
      func.append("getAlbedo();");
      args.append("litArgs_albedo = dAlbedo;");
      if (options.litOptions.useRefraction) {
        decl.append("float dTransmission;");
        code.append(this._addMap("refraction", "transmissionPS", options, litShader.chunks, textureMapping));
        func.append("getRefraction();");
        args.append("litArgs_transmission = dTransmission;");
        decl.append("float dThickness;");
        code.append(this._addMap("thickness", "thicknessPS", options, litShader.chunks, textureMapping));
        func.append("getThickness();");
        args.append("litArgs_thickness = dThickness;");
      }
      if (options.litOptions.useIridescence) {
        decl.append("float dIridescence;");
        code.append(this._addMap("iridescence", "iridescencePS", options, litShader.chunks, textureMapping));
        func.append("getIridescence();");
        args.append("litArgs_iridescence_intensity = dIridescence;");
        decl.append("float dIridescenceThickness;");
        code.append(this._addMap("iridescenceThickness", "iridescenceThicknessPS", options, litShader.chunks, textureMapping));
        func.append("getIridescenceThickness();");
        args.append("litArgs_iridescence_thickness = dIridescenceThickness;");
      }

      // specularity & glossiness
      if (litShader.lighting && options.litOptions.useSpecular || litShader.reflections) {
        decl.append("vec3 dSpecularity;");
        decl.append("float dGlossiness;");
        if (options.litOptions.useSheen) {
          decl.append("vec3 sSpecularity;");
          code.append(this._addMap("sheen", "sheenPS", options, litShader.chunks, textureMapping, options.sheenEncoding));
          func.append("getSheen();");
          args.append("litArgs_sheen_specularity = sSpecularity;");
          decl.append("float sGlossiness;");
          code.append(this._addMap("sheenGloss", "sheenGlossPS", options, litShader.chunks, textureMapping));
          func.append("getSheenGlossiness();");
          args.append("litArgs_sheen_gloss = sGlossiness;");
        }
        if (options.litOptions.useMetalness) {
          decl.append("float dMetalness;");
          code.append(this._addMap("metalness", "metalnessPS", options, litShader.chunks, textureMapping));
          func.append("getMetalness();");
          args.append("litArgs_metalness = dMetalness;");
          decl.append("float dIor;");
          code.append(this._addMap("ior", "iorPS", options, litShader.chunks, textureMapping));
          func.append("getIor();");
          args.append("litArgs_ior = dIor;");
        }
        if (options.litOptions.useSpecularityFactor) {
          decl.append("float dSpecularityFactor;");
          code.append(this._addMap("specularityFactor", "specularityFactorPS", options, litShader.chunks, textureMapping));
          func.append("getSpecularityFactor();");
          args.append("litArgs_specularityFactor = dSpecularityFactor;");
        }
        if (options.useSpecularColor) {
          code.append(this._addMap("specular", "specularPS", options, litShader.chunks, textureMapping, options.specularEncoding));
        } else {
          code.append("void getSpecularity() { dSpecularity = vec3(1); }");
        }
        code.append(this._addMap("gloss", "glossPS", options, litShader.chunks, textureMapping));
        func.append("getGlossiness();");
        func.append("getSpecularity();");
        args.append("litArgs_specularity = dSpecularity;");
        args.append("litArgs_gloss = dGlossiness;");
      } else {
        decl.append("vec3 dSpecularity = vec3(0.0);");
        decl.append("float dGlossiness = 0.0;");
      }

      // ao
      if (options.aoDetail) {
        code.append(this._addMap("aoDetail", "aoDetailMapPS", options, litShader.chunks, textureMapping));
      }
      if (options.aoMap || options.aoVertexColor) {
        decl.append("float dAo;");
        code.append(this._addMap("ao", "aoPS", options, litShader.chunks, textureMapping));
        func.append("getAO();");
        args.append("litArgs_ao = dAo;");
      }

      // emission
      decl.append("vec3 dEmission;");
      code.append(this._addMap("emissive", "emissivePS", options, litShader.chunks, textureMapping, options.emissiveEncoding));
      func.append("getEmission();");
      args.append("litArgs_emission = dEmission;");

      // clearcoat
      if (options.litOptions.useClearCoat) {
        decl.append("float ccSpecularity;");
        decl.append("float ccGlossiness;");
        decl.append("vec3 ccNormalW;");
        code.append(this._addMap("clearCoat", "clearCoatPS", options, litShader.chunks, textureMapping));
        code.append(this._addMap("clearCoatGloss", "clearCoatGlossPS", options, litShader.chunks, textureMapping));
        code.append(this._addMap("clearCoatNormal", "clearCoatNormalPS", options, litShader.chunks, textureMapping));
        func.append("getClearCoat();");
        func.append("getClearCoatGlossiness();");
        func.append("getClearCoatNormal();");
        args.append("litArgs_clearcoat_specularity = ccSpecularity;");
        args.append("litArgs_clearcoat_gloss = ccGlossiness;");
        args.append("litArgs_clearcoat_worldNormal = ccNormalW;");
      }

      // lightmap
      if (options.lightMap || options.lightVertexColor) {
        const lightmapDir = options.dirLightMap && options.litOptions.useSpecular;
        const lightmapChunkPropName = lightmapDir ? 'lightmapDirPS' : 'lightmapSinglePS';
        decl.append("vec3 dLightmap;");
        if (lightmapDir) {
          decl.append("vec3 dLightmapDir;");
        }
        code.append(this._addMap("light", lightmapChunkPropName, options, litShader.chunks, textureMapping, options.lightMapEncoding));
        func.append("getLightMap();");
        args.append("litArgs_lightmap = dLightmap;");
        if (lightmapDir) {
          args.append("litArgs_lightmapDir = dLightmapDir;");
        }
      }

      // only add the legacy chunk if it's referenced
      if (code.code.indexOf('texture2DSRGB') !== -1 || code.code.indexOf('texture2DRGBM') !== -1 || code.code.indexOf('texture2DRGBE') !== -1) {
        Debug.deprecated('Shader chunk macro $texture2DSAMPLE(XXX) is deprecated. Please use $DECODE(texture2D(XXX)) instead.');
        code.prepend(litShader.chunks.textureSamplePS);
      }
    } else {
      // all other passes require only opacity
      if (options.litOptions.alphaTest) {
        decl.append("float dAlpha;");
        code.append(this._addMap("opacity", "opacityPS", options, litShader.chunks, textureMapping));
        code.append(litShader.chunks.alphaTestPS);
        func.append("getOpacity();");
        func.append("alphaTest(dAlpha);");
        args.append("litArgs_opacity = dAlpha;");
      }
    }
    decl.append(litShader.chunks.litShaderArgsPS);
    code.append(`void evaluateFrontend() { \n${func.code}\n${args.code}\n }\n`);
    func.code = `evaluateFrontend();`;
    for (const texture in textureMapping) {
      decl.append(`uniform sampler2D ${textureMapping[texture]};`);
    }

    // decl.append('//-------- frontend decl begin', decl.code, '//-------- frontend decl end');
    // code.append('//-------- frontend code begin', code.code, '//-------- frontend code end');
    // func.append('//-------- frontend func begin\n${func}//-------- frontend func end\n`;

    // format func
    func.code = `\n${func.code.split('\n').map(l => `    ${l}`).join('\n')}\n\n`;
    litShader.generateFragmentShader(decl.code, code.code, func.code, lightingUv);
    return litShader.getDefinition();
  }
}
const standard = new ShaderGeneratorStandard();

export { _matTex2D, standard };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhbmRhcmQuanMiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uL3NyYy9zY2VuZS9zaGFkZXItbGliL3Byb2dyYW1zL3N0YW5kYXJkLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IERlYnVnIH0gZnJvbSAnLi4vLi4vLi4vY29yZS9kZWJ1Zy5qcyc7XG5cbmltcG9ydCB7XG4gICAgQkxFTkRfTk9ORSwgRlJFU05FTF9TQ0hMSUNLLFxuICAgIFNIQURFUl9GT1JXQVJELCBTSEFERVJfRk9SV0FSREhEUixcbiAgICBTUEVDVUxBUl9QSE9ORyxcbiAgICBTUFJJVEVfUkVOREVSTU9ERV9TTElDRUQsIFNQUklURV9SRU5ERVJNT0RFX1RJTEVEXG59IGZyb20gJy4uLy4uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBTaGFkZXJQYXNzIH0gZnJvbSAnLi4vLi4vc2hhZGVyLXBhc3MuanMnO1xuaW1wb3J0IHsgTGl0U2hhZGVyIH0gZnJvbSAnLi9saXQtc2hhZGVyLmpzJztcbmltcG9ydCB7IENodW5rQnVpbGRlciB9IGZyb20gJy4uL2NodW5rLWJ1aWxkZXIuanMnO1xuaW1wb3J0IHsgQ2h1bmtVdGlscyB9IGZyb20gJy4uL2NodW5rLXV0aWxzLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkTWF0ZXJpYWxPcHRpb25zIH0gZnJvbSAnLi4vLi4vbWF0ZXJpYWxzL3N0YW5kYXJkLW1hdGVyaWFsLW9wdGlvbnMuanMnO1xuaW1wb3J0IHsgTGl0T3B0aW9uc1V0aWxzIH0gZnJvbSAnLi9saXQtb3B0aW9ucy11dGlscy5qcyc7XG5pbXBvcnQgeyBTaGFkZXJHZW5lcmF0b3IgfSBmcm9tICcuL3NoYWRlci1nZW5lcmF0b3IuanMnO1xuXG5jb25zdCBfbWF0VGV4MkQgPSBbXTtcblxuY29uc3QgYnVpbGRQcm9wZXJ0aWVzTGlzdCA9IChvcHRpb25zKSA9PiB7XG4gICAgcmV0dXJuIE9iamVjdC5rZXlzKG9wdGlvbnMpXG4gICAgICAgIC5maWx0ZXIoa2V5ID0+IGtleSAhPT0gXCJsaXRPcHRpb25zXCIpXG4gICAgICAgIC5zb3J0KCk7XG59O1xuXG5jbGFzcyBTaGFkZXJHZW5lcmF0b3JTdGFuZGFyZCBleHRlbmRzIFNoYWRlckdlbmVyYXRvciB7XG4gICAgLy8gU2hhcmVkIFN0YW5kYXJkIE1hdGVyaWFsIG9wdGlvbiBzdHJ1Y3R1cmVzXG4gICAgb3B0aW9uc0NvbnRleHQgPSBuZXcgU3RhbmRhcmRNYXRlcmlhbE9wdGlvbnMoKTtcblxuICAgIG9wdGlvbnNDb250ZXh0TWluID0gbmV3IFN0YW5kYXJkTWF0ZXJpYWxPcHRpb25zKCk7XG5cbiAgICBnZW5lcmF0ZUtleShvcHRpb25zKSB7XG4gICAgICAgIGxldCBwcm9wcztcbiAgICAgICAgaWYgKG9wdGlvbnMgPT09IHRoaXMub3B0aW9uc0NvbnRleHRNaW4pIHtcbiAgICAgICAgICAgIGlmICghdGhpcy5wcm9wc01pbikgdGhpcy5wcm9wc01pbiA9IGJ1aWxkUHJvcGVydGllc0xpc3Qob3B0aW9ucyk7XG4gICAgICAgICAgICBwcm9wcyA9IHRoaXMucHJvcHNNaW47XG4gICAgICAgIH0gZWxzZSBpZiAob3B0aW9ucyA9PT0gdGhpcy5vcHRpb25zQ29udGV4dCkge1xuICAgICAgICAgICAgaWYgKCF0aGlzLnByb3BzKSB0aGlzLnByb3BzID0gYnVpbGRQcm9wZXJ0aWVzTGlzdChvcHRpb25zKTtcbiAgICAgICAgICAgIHByb3BzID0gdGhpcy5wcm9wcztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHByb3BzID0gYnVpbGRQcm9wZXJ0aWVzTGlzdChvcHRpb25zKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGtleSA9IFwic3RhbmRhcmQ6XFxuXCIgK1xuICAgICAgICAgICAgcHJvcHMubWFwKHByb3AgPT4gcHJvcCArIG9wdGlvbnNbcHJvcF0pLmpvaW4oJ1xcbicpICtcbiAgICAgICAgICAgIExpdE9wdGlvbnNVdGlscy5nZW5lcmF0ZUtleShvcHRpb25zLmxpdE9wdGlvbnMpO1xuXG4gICAgICAgIHJldHVybiBrZXk7XG4gICAgfVxuXG4gICAgLy8gZ2V0IHRoZSB2YWx1ZSB0byByZXBsYWNlICRVViB3aXRoIGluIE1hcCBTaGFkZXIgZnVuY3Rpb25zXG5cbiAgICAvKipcbiAgICAgKiBHZXQgdGhlIGNvZGUgd2l0aCB3aGljaCB0byB0byByZXBsYWNlICckVVYnIGluIHRoZSBtYXAgc2hhZGVyIGZ1bmN0aW9ucy5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSB0cmFuc2Zvcm1Qcm9wTmFtZSAtIE5hbWUgb2YgdGhlIHRyYW5zZm9ybSBpZCBpbiB0aGUgb3B0aW9ucyBibG9jay4gVXN1YWxseSBcImJhc2VuYW1lVHJhbnNmb3JtXCIuXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IHVWUHJvcE5hbWUgLSBOYW1lIG9mIHRoZSBVViBjaGFubmVsIGluIHRoZSBvcHRpb25zIGJsb2NrLiBVc3VhbGx5IFwiYmFzZW5hbWVVdlwiLlxuICAgICAqIEBwYXJhbSB7b2JqZWN0fSBvcHRpb25zIC0gVGhlIG9wdGlvbnMgcGFzc2VkIGludG8gY3JlYXRlU2hhZGVyRGVmaW5pdGlvbi5cbiAgICAgKiBAcmV0dXJucyB7c3RyaW5nfSBUaGUgY29kZSB1c2VkIHRvIHJlcGxhY2UgXCIkVVZcIiBpbiB0aGUgc2hhZGVyIGNvZGUuXG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfZ2V0VXZTb3VyY2VFeHByZXNzaW9uKHRyYW5zZm9ybVByb3BOYW1lLCB1VlByb3BOYW1lLCBvcHRpb25zKSB7XG4gICAgICAgIGNvbnN0IHRyYW5zZm9ybUlkID0gb3B0aW9uc1t0cmFuc2Zvcm1Qcm9wTmFtZV07XG4gICAgICAgIGNvbnN0IHV2Q2hhbm5lbCA9IG9wdGlvbnNbdVZQcm9wTmFtZV07XG4gICAgICAgIGNvbnN0IGlzTWFpblBhc3MgPSBvcHRpb25zLmxpdE9wdGlvbnMucGFzcyA9PT0gU0hBREVSX0ZPUldBUkQgfHwgb3B0aW9ucy5saXRPcHRpb25zLnBhc3MgPT09IFNIQURFUl9GT1JXQVJESERSO1xuXG4gICAgICAgIGxldCBleHByZXNzaW9uO1xuICAgICAgICBpZiAoaXNNYWluUGFzcyAmJiBvcHRpb25zLmxpdE9wdGlvbnMubmluZVNsaWNlZE1vZGUgPT09IFNQUklURV9SRU5ERVJNT0RFX1NMSUNFRCkge1xuICAgICAgICAgICAgZXhwcmVzc2lvbiA9IFwibmluZVNsaWNlZFV2XCI7XG4gICAgICAgIH0gZWxzZSBpZiAoaXNNYWluUGFzcyAmJiBvcHRpb25zLmxpdE9wdGlvbnMubmluZVNsaWNlZE1vZGUgPT09IFNQUklURV9SRU5ERVJNT0RFX1RJTEVEKSB7XG4gICAgICAgICAgICBleHByZXNzaW9uID0gXCJuaW5lU2xpY2VkVXZcIjtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGlmICh0cmFuc2Zvcm1JZCA9PT0gMCkge1xuICAgICAgICAgICAgICAgIGV4cHJlc3Npb24gPSBcInZVdlwiICsgdXZDaGFubmVsO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBub3RlOiBkaWZmZXJlbnQgY2FwaXRhbGl6YXRpb24hXG4gICAgICAgICAgICAgICAgZXhwcmVzc2lvbiA9IFwidlVWXCIgKyB1dkNoYW5uZWwgKyBcIl9cIiArIHRyYW5zZm9ybUlkO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBpZiBoZWlnaHRtYXAgaXMgZW5hYmxlZCBhbGwgbWFwcyBleGNlcHQgdGhlIGhlaWdodG1hcCBhcmUgb2Zmc2V0XG4gICAgICAgICAgICBpZiAob3B0aW9ucy5oZWlnaHRNYXAgJiYgdHJhbnNmb3JtUHJvcE5hbWUgIT09IFwiaGVpZ2h0TWFwVHJhbnNmb3JtXCIpIHtcbiAgICAgICAgICAgICAgICBleHByZXNzaW9uICs9IFwiICsgZFV2T2Zmc2V0XCI7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gZXhwcmVzc2lvbjtcbiAgICB9XG5cbiAgICBfYWRkTWFwRGVmKG5hbWUsIGVuYWJsZWQpIHtcbiAgICAgICAgcmV0dXJuIGVuYWJsZWQgPyBgI2RlZmluZSAke25hbWV9XFxuYCA6IGAjdW5kZWYgJHtuYW1lfVxcbmA7XG4gICAgfVxuXG4gICAgX2FkZE1hcERlZnMoZmxvYXQsIGNvbG9yLCB2ZXJ0ZXgsIG1hcCwgaW52ZXJ0KSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGRNYXBEZWYoXCJNQVBGTE9BVFwiLCBmbG9hdCkgK1xuICAgICAgICAgICAgICAgdGhpcy5fYWRkTWFwRGVmKFwiTUFQQ09MT1JcIiwgY29sb3IpICtcbiAgICAgICAgICAgICAgIHRoaXMuX2FkZE1hcERlZihcIk1BUFZFUlRFWFwiLCB2ZXJ0ZXgpICtcbiAgICAgICAgICAgICAgIHRoaXMuX2FkZE1hcERlZihcIk1BUFRFWFRVUkVcIiwgbWFwKSArXG4gICAgICAgICAgICAgICB0aGlzLl9hZGRNYXBEZWYoXCJNQVBJTlZFUlRcIiwgaW52ZXJ0KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBZGQgY2h1bmsgZm9yIE1hcCBUeXBlcyAodXNlZCBmb3IgYWxsIG1hcHMgZXhjZXB0IE5vcm1hbCkuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gcHJvcE5hbWUgLSBUaGUgYmFzZSBuYW1lIG9mIHRoZSBtYXA6IGRpZmZ1c2UgfCBlbWlzc2l2ZSB8IG9wYWNpdHkgfCBsaWdodCB8IGhlaWdodCB8IG1ldGFsbmVzcyB8IHNwZWN1bGFyIHwgZ2xvc3MgfCBhby5cbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gY2h1bmtOYW1lIC0gVGhlIG5hbWUgb2YgdGhlIGNodW5rIHRvIHVzZS4gVXN1YWxseSBcImJhc2VuYW1lUFNcIi5cbiAgICAgKiBAcGFyYW0ge29iamVjdH0gb3B0aW9ucyAtIFRoZSBvcHRpb25zIHBhc3NlZCBpbnRvIHRvIGNyZWF0ZVNoYWRlckRlZmluaXRpb24uXG4gICAgICogQHBhcmFtIHtvYmplY3R9IGNodW5rcyAtIFRoZSBzZXQgb2Ygc2hhZGVyIGNodW5rcyB0byBjaG9vc2UgZnJvbS5cbiAgICAgKiBAcGFyYW0ge29iamVjdH0gbWFwcGluZyAtIFRoZSBtYXBwaW5nIGJldHdlZW4gY2h1bmsgYW5kIHNhbXBsZXJcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gZW5jb2RpbmcgLSBUaGUgdGV4dHVyZSdzIGVuY29kaW5nXG4gICAgICogQHJldHVybnMge3N0cmluZ30gVGhlIHNoYWRlciBjb2RlIHRvIHN1cHBvcnQgdGhpcyBtYXAuXG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfYWRkTWFwKHByb3BOYW1lLCBjaHVua05hbWUsIG9wdGlvbnMsIGNodW5rcywgbWFwcGluZywgZW5jb2RpbmcgPSBudWxsKSB7XG4gICAgICAgIGNvbnN0IG1hcFByb3BOYW1lID0gcHJvcE5hbWUgKyBcIk1hcFwiO1xuICAgICAgICBjb25zdCB1VlByb3BOYW1lID0gbWFwUHJvcE5hbWUgKyBcIlV2XCI7XG4gICAgICAgIGNvbnN0IGlkZW50aWZpZXJQcm9wTmFtZSA9IG1hcFByb3BOYW1lICsgXCJJZGVudGlmaWVyXCI7XG4gICAgICAgIGNvbnN0IHRyYW5zZm9ybVByb3BOYW1lID0gbWFwUHJvcE5hbWUgKyBcIlRyYW5zZm9ybVwiO1xuICAgICAgICBjb25zdCBjaGFubmVsUHJvcE5hbWUgPSBtYXBQcm9wTmFtZSArIFwiQ2hhbm5lbFwiO1xuICAgICAgICBjb25zdCB2ZXJ0ZXhDb2xvckNoYW5uZWxQcm9wTmFtZSA9IHByb3BOYW1lICsgXCJWZXJ0ZXhDb2xvckNoYW5uZWxcIjtcbiAgICAgICAgY29uc3QgdGludFByb3BOYW1lID0gcHJvcE5hbWUgKyBcIlRpbnRcIjtcbiAgICAgICAgY29uc3QgdmVydGV4Q29sb3JQcm9wTmFtZSA9IHByb3BOYW1lICsgXCJWZXJ0ZXhDb2xvclwiO1xuICAgICAgICBjb25zdCBkZXRhaWxNb2RlUHJvcE5hbWUgPSBwcm9wTmFtZSArIFwiTW9kZVwiO1xuICAgICAgICBjb25zdCBpbnZlcnROYW1lID0gcHJvcE5hbWUgKyBcIkludmVydFwiO1xuXG4gICAgICAgIGNvbnN0IHRpbnRPcHRpb24gPSBvcHRpb25zW3RpbnRQcm9wTmFtZV07XG4gICAgICAgIGNvbnN0IHZlcnRleENvbG9yT3B0aW9uID0gb3B0aW9uc1t2ZXJ0ZXhDb2xvclByb3BOYW1lXTtcbiAgICAgICAgY29uc3QgdGV4dHVyZU9wdGlvbiA9IG9wdGlvbnNbbWFwUHJvcE5hbWVdO1xuICAgICAgICBjb25zdCB0ZXh0dXJlSWRlbnRpZmllciA9IG9wdGlvbnNbaWRlbnRpZmllclByb3BOYW1lXTtcbiAgICAgICAgY29uc3QgZGV0YWlsTW9kZU9wdGlvbiA9IG9wdGlvbnNbZGV0YWlsTW9kZVByb3BOYW1lXTtcblxuICAgICAgICBsZXQgc3ViQ29kZSA9IGNodW5rc1tjaHVua05hbWVdO1xuXG4gICAgICAgIGlmICh0ZXh0dXJlT3B0aW9uKSB7XG4gICAgICAgICAgICBjb25zdCB1diA9IHRoaXMuX2dldFV2U291cmNlRXhwcmVzc2lvbih0cmFuc2Zvcm1Qcm9wTmFtZSwgdVZQcm9wTmFtZSwgb3B0aW9ucyk7XG5cbiAgICAgICAgICAgIHN1YkNvZGUgPSBzdWJDb2RlLnJlcGxhY2UoL1xcJFVWL2csIHV2KS5yZXBsYWNlKC9cXCRDSC9nLCBvcHRpb25zW2NoYW5uZWxQcm9wTmFtZV0pO1xuXG4gICAgICAgICAgICBpZiAobWFwcGluZyAmJiBzdWJDb2RlLnNlYXJjaCgvXFwkU0FNUExFUi9nKSAhPT0gLTEpIHtcbiAgICAgICAgICAgICAgICBsZXQgc2FtcGxlck5hbWUgPSBcInRleHR1cmVfXCIgKyBtYXBQcm9wTmFtZTtcbiAgICAgICAgICAgICAgICBjb25zdCBhbGlhcyA9IG1hcHBpbmdbdGV4dHVyZUlkZW50aWZpZXJdO1xuICAgICAgICAgICAgICAgIGlmIChhbGlhcykge1xuICAgICAgICAgICAgICAgICAgICBzYW1wbGVyTmFtZSA9IGFsaWFzO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIG1hcHBpbmdbdGV4dHVyZUlkZW50aWZpZXJdID0gc2FtcGxlck5hbWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHN1YkNvZGUgPSBzdWJDb2RlLnJlcGxhY2UoL1xcJFNBTVBMRVIvZywgc2FtcGxlck5hbWUpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoZW5jb2RpbmcpIHtcbiAgICAgICAgICAgICAgICBpZiAob3B0aW9uc1tjaGFubmVsUHJvcE5hbWVdID09PSAnYWFhJykge1xuICAgICAgICAgICAgICAgICAgICAvLyBjb21wbGV0ZWx5IHNraXAgZGVjb2RpbmcgaWYgdGhlIHVzZXIgaGFzIHNlbGVjdGVkIHRoZSBhbHBoYSBjaGFubmVsIChzaW5jZSBhbHBoYVxuICAgICAgICAgICAgICAgICAgICAvLyBpcyBuZXZlciBkZWNvZGVkKS5cbiAgICAgICAgICAgICAgICAgICAgc3ViQ29kZSA9IHN1YkNvZGUucmVwbGFjZSgvXFwkREVDT0RFL2csICdwYXNzVGhyb3VnaCcpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHN1YkNvZGUgPSBzdWJDb2RlLnJlcGxhY2UoL1xcJERFQ09ERS9nLCBDaHVua1V0aWxzLmRlY29kZUZ1bmMoKCFvcHRpb25zLmxpdE9wdGlvbnMuZ2FtbWEgJiYgZW5jb2RpbmcgPT09ICdzcmdiJykgPyAnbGluZWFyJyA6IGVuY29kaW5nKSk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gY29udGludWUgdG8gc3VwcG9ydCAkdGV4dHVyZTJEU0FNUExFXG4gICAgICAgICAgICAgICAgaWYgKHN1YkNvZGUuaW5kZXhPZignJHRleHR1cmUyRFNBTVBMRScpKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGRlY29kZVRhYmxlID0ge1xuICAgICAgICAgICAgICAgICAgICAgICAgbGluZWFyOiAndGV4dHVyZTJEJyxcbiAgICAgICAgICAgICAgICAgICAgICAgIHNyZ2I6ICd0ZXh0dXJlMkRTUkdCJyxcbiAgICAgICAgICAgICAgICAgICAgICAgIHJnYm06ICd0ZXh0dXJlMkRSR0JNJyxcbiAgICAgICAgICAgICAgICAgICAgICAgIHJnYmU6ICd0ZXh0dXJlMkRSR0JFJ1xuICAgICAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgICAgICAgIHN1YkNvZGUgPSBzdWJDb2RlLnJlcGxhY2UoL1xcJHRleHR1cmUyRFNBTVBMRS9nLCBkZWNvZGVUYWJsZVtlbmNvZGluZ10gfHwgJ3RleHR1cmUyRCcpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh2ZXJ0ZXhDb2xvck9wdGlvbikge1xuICAgICAgICAgICAgc3ViQ29kZSA9IHN1YkNvZGUucmVwbGFjZSgvXFwkVkMvZywgb3B0aW9uc1t2ZXJ0ZXhDb2xvckNoYW5uZWxQcm9wTmFtZV0pO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGRldGFpbE1vZGVPcHRpb24pIHtcbiAgICAgICAgICAgIHN1YkNvZGUgPSBzdWJDb2RlLnJlcGxhY2UoL1xcJERFVEFJTE1PREUvZywgZGV0YWlsTW9kZU9wdGlvbik7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBpc0Zsb2F0VGludCA9ICEhKHRpbnRPcHRpb24gJiAxKTtcbiAgICAgICAgY29uc3QgaXNWZWNUaW50ID0gISEodGludE9wdGlvbiAmIDIpO1xuICAgICAgICBjb25zdCBpbnZlcnRPcHRpb24gPSAhIShvcHRpb25zW2ludmVydE5hbWVdKTtcblxuICAgICAgICBzdWJDb2RlID0gdGhpcy5fYWRkTWFwRGVmcyhpc0Zsb2F0VGludCwgaXNWZWNUaW50LCB2ZXJ0ZXhDb2xvck9wdGlvbiwgdGV4dHVyZU9wdGlvbiwgaW52ZXJ0T3B0aW9uKSArIHN1YkNvZGU7XG4gICAgICAgIHJldHVybiBzdWJDb2RlLnJlcGxhY2UoL1xcJC9nLCBcIlwiKTtcbiAgICB9XG5cbiAgICBfY29ycmVjdENoYW5uZWwocCwgY2hhbiwgX21hdFRleDJEKSB7XG4gICAgICAgIGlmIChfbWF0VGV4MkRbcF0gPiAwKSB7XG4gICAgICAgICAgICBpZiAoX21hdFRleDJEW3BdIDwgY2hhbi5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gY2hhbi5zdWJzdHJpbmcoMCwgX21hdFRleDJEW3BdKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoX21hdFRleDJEW3BdID4gY2hhbi5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICBsZXQgc3RyID0gY2hhbjtcbiAgICAgICAgICAgICAgICBjb25zdCBjaHIgPSBzdHIuY2hhckF0KHN0ci5sZW5ndGggLSAxKTtcbiAgICAgICAgICAgICAgICBjb25zdCBhZGRMZW4gPSBfbWF0VGV4MkRbcF0gLSBzdHIubGVuZ3RoO1xuICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYWRkTGVuOyBpKyspIHN0ciArPSBjaHI7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHN0cjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBjaGFuO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4uLy4uLy4uL3BsYXRmb3JtL2dyYXBoaWNzL2dyYXBoaWNzLWRldmljZS5qcycpLkdyYXBoaWNzRGV2aWNlfSBkZXZpY2UgLSBUaGVcbiAgICAgKiBncmFwaGljcyBkZXZpY2UuXG4gICAgICogQHBhcmFtIHtTdGFuZGFyZE1hdGVyaWFsT3B0aW9uc30gb3B0aW9ucyAtIFRoZSBjcmVhdGUgb3B0aW9ucy5cbiAgICAgKiBAcmV0dXJucyB7b2JqZWN0fSBSZXR1cm5zIHRoZSBjcmVhdGVkIHNoYWRlciBkZWZpbml0aW9uLlxuICAgICAqIEBpZ25vcmVcbiAgICAgKi9cbiAgICBjcmVhdGVTaGFkZXJEZWZpbml0aW9uKGRldmljZSwgb3B0aW9ucykge1xuXG4gICAgICAgIGNvbnN0IHNoYWRlclBhc3NJbmZvID0gU2hhZGVyUGFzcy5nZXQoZGV2aWNlKS5nZXRCeUluZGV4KG9wdGlvbnMubGl0T3B0aW9ucy5wYXNzKTtcbiAgICAgICAgY29uc3QgaXNGb3J3YXJkUGFzcyA9IHNoYWRlclBhc3NJbmZvLmlzRm9yd2FyZDtcbiAgICAgICAgY29uc3QgbGl0U2hhZGVyID0gbmV3IExpdFNoYWRlcihkZXZpY2UsIG9wdGlvbnMubGl0T3B0aW9ucyk7XG5cbiAgICAgICAgLy8gZ2VuZXJhdGUgdmVydGV4IHNoYWRlclxuICAgICAgICBjb25zdCB1c2VVdiA9IFtdO1xuICAgICAgICBjb25zdCB1c2VVbm1vZGlmaWVkVXYgPSBbXTtcbiAgICAgICAgY29uc3QgbWFwVHJhbnNmb3JtcyA9IFtdO1xuICAgICAgICBjb25zdCBtYXhVdlNldHMgPSAyO1xuICAgICAgICBjb25zdCB0ZXh0dXJlTWFwcGluZyA9IHt9O1xuXG4gICAgICAgIGZvciAoY29uc3QgcCBpbiBfbWF0VGV4MkQpIHtcbiAgICAgICAgICAgIGNvbnN0IG1uYW1lID0gcCArIFwiTWFwXCI7XG5cbiAgICAgICAgICAgIGlmIChvcHRpb25zW3AgKyBcIlZlcnRleENvbG9yXCJdKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgY25hbWUgPSBwICsgXCJWZXJ0ZXhDb2xvckNoYW5uZWxcIjtcbiAgICAgICAgICAgICAgICBvcHRpb25zW2NuYW1lXSA9IHRoaXMuX2NvcnJlY3RDaGFubmVsKHAsIG9wdGlvbnNbY25hbWVdLCBfbWF0VGV4MkQpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAob3B0aW9uc1ttbmFtZV0pIHtcbiAgICAgICAgICAgICAgICBjb25zdCBjbmFtZSA9IG1uYW1lICsgXCJDaGFubmVsXCI7XG4gICAgICAgICAgICAgICAgY29uc3QgdG5hbWUgPSBtbmFtZSArIFwiVHJhbnNmb3JtXCI7XG4gICAgICAgICAgICAgICAgY29uc3QgdW5hbWUgPSBtbmFtZSArIFwiVXZcIjtcblxuICAgICAgICAgICAgICAgIG9wdGlvbnNbdW5hbWVdID0gTWF0aC5taW4ob3B0aW9uc1t1bmFtZV0sIG1heFV2U2V0cyAtIDEpO1xuICAgICAgICAgICAgICAgIG9wdGlvbnNbY25hbWVdID0gdGhpcy5fY29ycmVjdENoYW5uZWwocCwgb3B0aW9uc1tjbmFtZV0sIF9tYXRUZXgyRCk7XG5cbiAgICAgICAgICAgICAgICBjb25zdCB1dlNldCA9IG9wdGlvbnNbdW5hbWVdO1xuICAgICAgICAgICAgICAgIHVzZVV2W3V2U2V0XSA9IHRydWU7XG4gICAgICAgICAgICAgICAgdXNlVW5tb2RpZmllZFV2W3V2U2V0XSA9IHVzZVVubW9kaWZpZWRVdlt1dlNldF0gfHwgKG9wdGlvbnNbbW5hbWVdICYmICFvcHRpb25zW3RuYW1lXSk7XG5cbiAgICAgICAgICAgICAgICAvLyBjcmVhdGUgbWFwIHRyYW5zZm9ybXNcbiAgICAgICAgICAgICAgICBpZiAob3B0aW9uc1t0bmFtZV0pIHtcbiAgICAgICAgICAgICAgICAgICAgbWFwVHJhbnNmb3Jtcy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG5hbWU6IHAsXG4gICAgICAgICAgICAgICAgICAgICAgICBpZDogb3B0aW9uc1t0bmFtZV0sXG4gICAgICAgICAgICAgICAgICAgICAgICB1djogb3B0aW9uc1t1bmFtZV1cbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKG9wdGlvbnMuZm9yY2VVdjEpIHtcbiAgICAgICAgICAgIHVzZVV2WzFdID0gdHJ1ZTtcbiAgICAgICAgICAgIHVzZVVubW9kaWZpZWRVdlsxXSA9ICh1c2VVbm1vZGlmaWVkVXZbMV0gIT09IHVuZGVmaW5lZCkgPyB1c2VVbm1vZGlmaWVkVXZbMV0gOiB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgbGl0U2hhZGVyLmdlbmVyYXRlVmVydGV4U2hhZGVyKHVzZVV2LCB1c2VVbm1vZGlmaWVkVXYsIG1hcFRyYW5zZm9ybXMpO1xuXG4gICAgICAgIC8vIGhhbmRsZSBmcmFnbWVudCBzaGFkZXJcbiAgICAgICAgaWYgKG9wdGlvbnMubGl0T3B0aW9ucy5zaGFkaW5nTW9kZWwgPT09IFNQRUNVTEFSX1BIT05HKSB7XG4gICAgICAgICAgICBvcHRpb25zLmxpdE9wdGlvbnMuZnJlc25lbE1vZGVsID0gMDtcbiAgICAgICAgICAgIG9wdGlvbnMubGl0T3B0aW9ucy5hbWJpZW50U0ggPSBmYWxzZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIG9wdGlvbnMubGl0T3B0aW9ucy5mcmVzbmVsTW9kZWwgPSAob3B0aW9ucy5saXRPcHRpb25zLmZyZXNuZWxNb2RlbCA9PT0gMCkgPyBGUkVTTkVMX1NDSExJQ0sgOiBvcHRpb25zLmxpdE9wdGlvbnMuZnJlc25lbE1vZGVsO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgZGVjbCA9IG5ldyBDaHVua0J1aWxkZXIoKTtcbiAgICAgICAgY29uc3QgY29kZSA9IG5ldyBDaHVua0J1aWxkZXIoKTtcbiAgICAgICAgY29uc3QgZnVuYyA9IG5ldyBDaHVua0J1aWxkZXIoKTtcbiAgICAgICAgY29uc3QgYXJncyA9IG5ldyBDaHVua0J1aWxkZXIoKTtcbiAgICAgICAgbGV0IGxpZ2h0aW5nVXYgPSBcIlwiO1xuXG4gICAgICAgIC8vIGdsb2JhbCB0ZXh0dXJlIGJpYXMgZm9yIHN0YW5kYXJkIHRleHR1cmVzXG4gICAgICAgIGlmIChvcHRpb25zLmxpdE9wdGlvbnMubmluZVNsaWNlZE1vZGUgPT09IFNQUklURV9SRU5ERVJNT0RFX1RJTEVEKSB7XG4gICAgICAgICAgICBkZWNsLmFwcGVuZChgY29uc3QgZmxvYXQgdGV4dHVyZUJpYXMgPSAtMTAwMC4wO2ApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZGVjbC5hcHBlbmQoYHVuaWZvcm0gZmxvYXQgdGV4dHVyZUJpYXM7YCk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoaXNGb3J3YXJkUGFzcykge1xuICAgICAgICAgICAgLy8gcGFyYWxsYXhcbiAgICAgICAgICAgIGlmIChvcHRpb25zLmhlaWdodE1hcCkge1xuICAgICAgICAgICAgICAgIC8vIGlmICghb3B0aW9ucy5ub3JtYWxNYXApIHtcbiAgICAgICAgICAgICAgICAvLyAgICAgY29uc3QgdHJhbnNmb3JtZWRIZWlnaHRNYXBVdiA9IHRoaXMuX2dldFV2U291cmNlRXhwcmVzc2lvbihcImhlaWdodE1hcFRyYW5zZm9ybVwiLCBcImhlaWdodE1hcFV2XCIsIG9wdGlvbnMpO1xuICAgICAgICAgICAgICAgIC8vICAgICBpZiAoIW9wdGlvbnMuaGFzVGFuZ2VudHMpIHRibiA9IHRibi5yZXBsYWNlKC9cXCRVVi9nLCB0cmFuc2Zvcm1lZEhlaWdodE1hcFV2KTtcbiAgICAgICAgICAgICAgICAvLyAgICAgY29kZSArPSB0Ym47XG4gICAgICAgICAgICAgICAgLy8gfVxuICAgICAgICAgICAgICAgIGRlY2wuYXBwZW5kKFwidmVjMiBkVXZPZmZzZXQ7XCIpO1xuICAgICAgICAgICAgICAgIGNvZGUuYXBwZW5kKHRoaXMuX2FkZE1hcChcImhlaWdodFwiLCBcInBhcmFsbGF4UFNcIiwgb3B0aW9ucywgbGl0U2hhZGVyLmNodW5rcywgdGV4dHVyZU1hcHBpbmcpKTtcbiAgICAgICAgICAgICAgICBmdW5jLmFwcGVuZChcImdldFBhcmFsbGF4KCk7XCIpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBvcGFjaXR5XG4gICAgICAgICAgICBpZiAob3B0aW9ucy5saXRPcHRpb25zLmJsZW5kVHlwZSAhPT0gQkxFTkRfTk9ORSB8fCBvcHRpb25zLmxpdE9wdGlvbnMuYWxwaGFUZXN0IHx8IG9wdGlvbnMubGl0T3B0aW9ucy5hbHBoYVRvQ292ZXJhZ2UpIHtcbiAgICAgICAgICAgICAgICBkZWNsLmFwcGVuZChcImZsb2F0IGRBbHBoYTtcIik7XG4gICAgICAgICAgICAgICAgY29kZS5hcHBlbmQodGhpcy5fYWRkTWFwKFwib3BhY2l0eVwiLCBcIm9wYWNpdHlQU1wiLCBvcHRpb25zLCBsaXRTaGFkZXIuY2h1bmtzLCB0ZXh0dXJlTWFwcGluZykpO1xuICAgICAgICAgICAgICAgIGZ1bmMuYXBwZW5kKFwiZ2V0T3BhY2l0eSgpO1wiKTtcbiAgICAgICAgICAgICAgICBhcmdzLmFwcGVuZChcImxpdEFyZ3Nfb3BhY2l0eSA9IGRBbHBoYTtcIik7XG4gICAgICAgICAgICAgICAgaWYgKG9wdGlvbnMubGl0T3B0aW9ucy5hbHBoYVRlc3QpIHtcbiAgICAgICAgICAgICAgICAgICAgY29kZS5hcHBlbmQobGl0U2hhZGVyLmNodW5rcy5hbHBoYVRlc3RQUyk7XG4gICAgICAgICAgICAgICAgICAgIGZ1bmMuYXBwZW5kKFwiYWxwaGFUZXN0KGRBbHBoYSk7XCIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZGVjbC5hcHBlbmQoXCJmbG9hdCBkQWxwaGEgPSAxLjA7XCIpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBub3JtYWxcbiAgICAgICAgICAgIGlmIChsaXRTaGFkZXIubmVlZHNOb3JtYWwpIHtcbiAgICAgICAgICAgICAgICBpZiAob3B0aW9ucy5ub3JtYWxNYXAgfHwgb3B0aW9ucy5jbGVhckNvYXROb3JtYWxNYXApIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gVE9ETzogbGV0IGVhY2ggbm9ybWFsbWFwIGlucHV0IChub3JtYWxNYXAsIG5vcm1hbERldGFpbE1hcCwgY2xlYXJDb2F0Tm9ybWFsTWFwKSBpbmRlcGVuZGVudGx5IGRlY2lkZSB3aGljaCB1bnBhY2tOb3JtYWwgdG8gdXNlLlxuICAgICAgICAgICAgICAgICAgICBjb2RlLmFwcGVuZChvcHRpb25zLnBhY2tlZE5vcm1hbCA/IGxpdFNoYWRlci5jaHVua3Mubm9ybWFsWFlQUyA6IGxpdFNoYWRlci5jaHVua3Mubm9ybWFsWFlaUFMpO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmICghb3B0aW9ucy5saXRPcHRpb25zLmhhc1RhbmdlbnRzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBUT0RPOiBnZW5lcmFsaXplIHRvIHN1cHBvcnQgZWFjaCBub3JtYWxtYXAgaW5wdXQgKG5vcm1hbE1hcCwgbm9ybWFsRGV0YWlsTWFwLCBjbGVhckNvYXROb3JtYWxNYXApIGluZGVwZW5kZW50bHlcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGJhc2VOYW1lID0gb3B0aW9ucy5ub3JtYWxNYXAgPyBcIm5vcm1hbE1hcFwiIDogXCJjbGVhckNvYXROb3JtYWxNYXBcIjtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxpZ2h0aW5nVXYgPSB0aGlzLl9nZXRVdlNvdXJjZUV4cHJlc3Npb24oYCR7YmFzZU5hbWV9VHJhbnNmb3JtYCwgYCR7YmFzZU5hbWV9VXZgLCBvcHRpb25zKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGRlY2wuYXBwZW5kKFwidmVjMyBkTm9ybWFsVztcIik7XG4gICAgICAgICAgICAgICAgY29kZS5hcHBlbmQodGhpcy5fYWRkTWFwKFwibm9ybWFsRGV0YWlsXCIsIFwibm9ybWFsRGV0YWlsTWFwUFNcIiwgb3B0aW9ucywgbGl0U2hhZGVyLmNodW5rcywgdGV4dHVyZU1hcHBpbmcpKTtcbiAgICAgICAgICAgICAgICBjb2RlLmFwcGVuZCh0aGlzLl9hZGRNYXAoXCJub3JtYWxcIiwgXCJub3JtYWxNYXBQU1wiLCBvcHRpb25zLCBsaXRTaGFkZXIuY2h1bmtzLCB0ZXh0dXJlTWFwcGluZykpO1xuICAgICAgICAgICAgICAgIGZ1bmMuYXBwZW5kKFwiZ2V0Tm9ybWFsKCk7XCIpO1xuICAgICAgICAgICAgICAgIGFyZ3MuYXBwZW5kKFwibGl0QXJnc193b3JsZE5vcm1hbCA9IGROb3JtYWxXO1wiKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGxpdFNoYWRlci5uZWVkc1NjZW5lQ29sb3IpIHtcbiAgICAgICAgICAgICAgICBkZWNsLmFwcGVuZChcInVuaWZvcm0gc2FtcGxlcjJEIHVTY2VuZUNvbG9yTWFwO1wiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChsaXRTaGFkZXIubmVlZHNTY3JlZW5TaXplKSB7XG4gICAgICAgICAgICAgICAgZGVjbC5hcHBlbmQoXCJ1bmlmb3JtIHZlYzQgdVNjcmVlblNpemU7XCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGxpdFNoYWRlci5uZWVkc1RyYW5zZm9ybXMpIHtcbiAgICAgICAgICAgICAgICBkZWNsLmFwcGVuZChcInVuaWZvcm0gbWF0NCBtYXRyaXhfdmlld1Byb2plY3Rpb247XCIpO1xuICAgICAgICAgICAgICAgIGRlY2wuYXBwZW5kKFwidW5pZm9ybSBtYXQ0IG1hdHJpeF9tb2RlbDtcIik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIHN1cHBvcnQgZm9yIGRpZmZ1c2UgJiBhbyBkZXRhaWwgbW9kZXNcbiAgICAgICAgICAgIGlmIChvcHRpb25zLmRpZmZ1c2VEZXRhaWwgfHwgb3B0aW9ucy5hb0RldGFpbCkge1xuICAgICAgICAgICAgICAgIGNvZGUuYXBwZW5kKGxpdFNoYWRlci5jaHVua3MuZGV0YWlsTW9kZXNQUyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIGFsYmVkb1xuICAgICAgICAgICAgZGVjbC5hcHBlbmQoXCJ2ZWMzIGRBbGJlZG87XCIpO1xuICAgICAgICAgICAgaWYgKG9wdGlvbnMuZGlmZnVzZURldGFpbCkge1xuICAgICAgICAgICAgICAgIGNvZGUuYXBwZW5kKHRoaXMuX2FkZE1hcChcImRpZmZ1c2VEZXRhaWxcIiwgXCJkaWZmdXNlRGV0YWlsTWFwUFNcIiwgb3B0aW9ucywgbGl0U2hhZGVyLmNodW5rcywgdGV4dHVyZU1hcHBpbmcsIG9wdGlvbnMuZGlmZnVzZURldGFpbEVuY29kaW5nKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb2RlLmFwcGVuZCh0aGlzLl9hZGRNYXAoXCJkaWZmdXNlXCIsIFwiZGlmZnVzZVBTXCIsIG9wdGlvbnMsIGxpdFNoYWRlci5jaHVua3MsIHRleHR1cmVNYXBwaW5nLCBvcHRpb25zLmRpZmZ1c2VFbmNvZGluZykpO1xuICAgICAgICAgICAgZnVuYy5hcHBlbmQoXCJnZXRBbGJlZG8oKTtcIik7XG4gICAgICAgICAgICBhcmdzLmFwcGVuZChcImxpdEFyZ3NfYWxiZWRvID0gZEFsYmVkbztcIik7XG5cbiAgICAgICAgICAgIGlmIChvcHRpb25zLmxpdE9wdGlvbnMudXNlUmVmcmFjdGlvbikge1xuICAgICAgICAgICAgICAgIGRlY2wuYXBwZW5kKFwiZmxvYXQgZFRyYW5zbWlzc2lvbjtcIik7XG4gICAgICAgICAgICAgICAgY29kZS5hcHBlbmQodGhpcy5fYWRkTWFwKFwicmVmcmFjdGlvblwiLCBcInRyYW5zbWlzc2lvblBTXCIsIG9wdGlvbnMsIGxpdFNoYWRlci5jaHVua3MsIHRleHR1cmVNYXBwaW5nKSk7XG4gICAgICAgICAgICAgICAgZnVuYy5hcHBlbmQoXCJnZXRSZWZyYWN0aW9uKCk7XCIpO1xuICAgICAgICAgICAgICAgIGFyZ3MuYXBwZW5kKFwibGl0QXJnc190cmFuc21pc3Npb24gPSBkVHJhbnNtaXNzaW9uO1wiKTtcblxuICAgICAgICAgICAgICAgIGRlY2wuYXBwZW5kKFwiZmxvYXQgZFRoaWNrbmVzcztcIik7XG4gICAgICAgICAgICAgICAgY29kZS5hcHBlbmQodGhpcy5fYWRkTWFwKFwidGhpY2tuZXNzXCIsIFwidGhpY2tuZXNzUFNcIiwgb3B0aW9ucywgbGl0U2hhZGVyLmNodW5rcywgdGV4dHVyZU1hcHBpbmcpKTtcbiAgICAgICAgICAgICAgICBmdW5jLmFwcGVuZChcImdldFRoaWNrbmVzcygpO1wiKTtcbiAgICAgICAgICAgICAgICBhcmdzLmFwcGVuZChcImxpdEFyZ3NfdGhpY2tuZXNzID0gZFRoaWNrbmVzcztcIik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChvcHRpb25zLmxpdE9wdGlvbnMudXNlSXJpZGVzY2VuY2UpIHtcbiAgICAgICAgICAgICAgICBkZWNsLmFwcGVuZChcImZsb2F0IGRJcmlkZXNjZW5jZTtcIik7XG4gICAgICAgICAgICAgICAgY29kZS5hcHBlbmQodGhpcy5fYWRkTWFwKFwiaXJpZGVzY2VuY2VcIiwgXCJpcmlkZXNjZW5jZVBTXCIsIG9wdGlvbnMsIGxpdFNoYWRlci5jaHVua3MsIHRleHR1cmVNYXBwaW5nKSk7XG4gICAgICAgICAgICAgICAgZnVuYy5hcHBlbmQoXCJnZXRJcmlkZXNjZW5jZSgpO1wiKTtcbiAgICAgICAgICAgICAgICBhcmdzLmFwcGVuZChcImxpdEFyZ3NfaXJpZGVzY2VuY2VfaW50ZW5zaXR5ID0gZElyaWRlc2NlbmNlO1wiKTtcblxuICAgICAgICAgICAgICAgIGRlY2wuYXBwZW5kKFwiZmxvYXQgZElyaWRlc2NlbmNlVGhpY2tuZXNzO1wiKTtcbiAgICAgICAgICAgICAgICBjb2RlLmFwcGVuZCh0aGlzLl9hZGRNYXAoXCJpcmlkZXNjZW5jZVRoaWNrbmVzc1wiLCBcImlyaWRlc2NlbmNlVGhpY2tuZXNzUFNcIiwgb3B0aW9ucywgbGl0U2hhZGVyLmNodW5rcywgdGV4dHVyZU1hcHBpbmcpKTtcbiAgICAgICAgICAgICAgICBmdW5jLmFwcGVuZChcImdldElyaWRlc2NlbmNlVGhpY2tuZXNzKCk7XCIpO1xuICAgICAgICAgICAgICAgIGFyZ3MuYXBwZW5kKFwibGl0QXJnc19pcmlkZXNjZW5jZV90aGlja25lc3MgPSBkSXJpZGVzY2VuY2VUaGlja25lc3M7XCIpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBzcGVjdWxhcml0eSAmIGdsb3NzaW5lc3NcbiAgICAgICAgICAgIGlmICgobGl0U2hhZGVyLmxpZ2h0aW5nICYmIG9wdGlvbnMubGl0T3B0aW9ucy51c2VTcGVjdWxhcikgfHwgbGl0U2hhZGVyLnJlZmxlY3Rpb25zKSB7XG4gICAgICAgICAgICAgICAgZGVjbC5hcHBlbmQoXCJ2ZWMzIGRTcGVjdWxhcml0eTtcIik7XG4gICAgICAgICAgICAgICAgZGVjbC5hcHBlbmQoXCJmbG9hdCBkR2xvc3NpbmVzcztcIik7XG4gICAgICAgICAgICAgICAgaWYgKG9wdGlvbnMubGl0T3B0aW9ucy51c2VTaGVlbikge1xuICAgICAgICAgICAgICAgICAgICBkZWNsLmFwcGVuZChcInZlYzMgc1NwZWN1bGFyaXR5O1wiKTtcbiAgICAgICAgICAgICAgICAgICAgY29kZS5hcHBlbmQodGhpcy5fYWRkTWFwKFwic2hlZW5cIiwgXCJzaGVlblBTXCIsIG9wdGlvbnMsIGxpdFNoYWRlci5jaHVua3MsIHRleHR1cmVNYXBwaW5nLCBvcHRpb25zLnNoZWVuRW5jb2RpbmcpKTtcbiAgICAgICAgICAgICAgICAgICAgZnVuYy5hcHBlbmQoXCJnZXRTaGVlbigpO1wiKTtcbiAgICAgICAgICAgICAgICAgICAgYXJncy5hcHBlbmQoXCJsaXRBcmdzX3NoZWVuX3NwZWN1bGFyaXR5ID0gc1NwZWN1bGFyaXR5O1wiKTtcblxuICAgICAgICAgICAgICAgICAgICBkZWNsLmFwcGVuZChcImZsb2F0IHNHbG9zc2luZXNzO1wiKTtcbiAgICAgICAgICAgICAgICAgICAgY29kZS5hcHBlbmQodGhpcy5fYWRkTWFwKFwic2hlZW5HbG9zc1wiLCBcInNoZWVuR2xvc3NQU1wiLCBvcHRpb25zLCBsaXRTaGFkZXIuY2h1bmtzLCB0ZXh0dXJlTWFwcGluZykpO1xuICAgICAgICAgICAgICAgICAgICBmdW5jLmFwcGVuZChcImdldFNoZWVuR2xvc3NpbmVzcygpO1wiKTtcbiAgICAgICAgICAgICAgICAgICAgYXJncy5hcHBlbmQoXCJsaXRBcmdzX3NoZWVuX2dsb3NzID0gc0dsb3NzaW5lc3M7XCIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAob3B0aW9ucy5saXRPcHRpb25zLnVzZU1ldGFsbmVzcykge1xuICAgICAgICAgICAgICAgICAgICBkZWNsLmFwcGVuZChcImZsb2F0IGRNZXRhbG5lc3M7XCIpO1xuICAgICAgICAgICAgICAgICAgICBjb2RlLmFwcGVuZCh0aGlzLl9hZGRNYXAoXCJtZXRhbG5lc3NcIiwgXCJtZXRhbG5lc3NQU1wiLCBvcHRpb25zLCBsaXRTaGFkZXIuY2h1bmtzLCB0ZXh0dXJlTWFwcGluZykpO1xuICAgICAgICAgICAgICAgICAgICBmdW5jLmFwcGVuZChcImdldE1ldGFsbmVzcygpO1wiKTtcbiAgICAgICAgICAgICAgICAgICAgYXJncy5hcHBlbmQoXCJsaXRBcmdzX21ldGFsbmVzcyA9IGRNZXRhbG5lc3M7XCIpO1xuXG4gICAgICAgICAgICAgICAgICAgIGRlY2wuYXBwZW5kKFwiZmxvYXQgZElvcjtcIik7XG4gICAgICAgICAgICAgICAgICAgIGNvZGUuYXBwZW5kKHRoaXMuX2FkZE1hcChcImlvclwiLCBcImlvclBTXCIsIG9wdGlvbnMsIGxpdFNoYWRlci5jaHVua3MsIHRleHR1cmVNYXBwaW5nKSk7XG4gICAgICAgICAgICAgICAgICAgIGZ1bmMuYXBwZW5kKFwiZ2V0SW9yKCk7XCIpO1xuICAgICAgICAgICAgICAgICAgICBhcmdzLmFwcGVuZChcImxpdEFyZ3NfaW9yID0gZElvcjtcIik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChvcHRpb25zLmxpdE9wdGlvbnMudXNlU3BlY3VsYXJpdHlGYWN0b3IpIHtcbiAgICAgICAgICAgICAgICAgICAgZGVjbC5hcHBlbmQoXCJmbG9hdCBkU3BlY3VsYXJpdHlGYWN0b3I7XCIpO1xuICAgICAgICAgICAgICAgICAgICBjb2RlLmFwcGVuZCh0aGlzLl9hZGRNYXAoXCJzcGVjdWxhcml0eUZhY3RvclwiLCBcInNwZWN1bGFyaXR5RmFjdG9yUFNcIiwgb3B0aW9ucywgbGl0U2hhZGVyLmNodW5rcywgdGV4dHVyZU1hcHBpbmcpKTtcbiAgICAgICAgICAgICAgICAgICAgZnVuYy5hcHBlbmQoXCJnZXRTcGVjdWxhcml0eUZhY3RvcigpO1wiKTtcbiAgICAgICAgICAgICAgICAgICAgYXJncy5hcHBlbmQoXCJsaXRBcmdzX3NwZWN1bGFyaXR5RmFjdG9yID0gZFNwZWN1bGFyaXR5RmFjdG9yO1wiKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKG9wdGlvbnMudXNlU3BlY3VsYXJDb2xvcikge1xuICAgICAgICAgICAgICAgICAgICBjb2RlLmFwcGVuZCh0aGlzLl9hZGRNYXAoXCJzcGVjdWxhclwiLCBcInNwZWN1bGFyUFNcIiwgb3B0aW9ucywgbGl0U2hhZGVyLmNodW5rcywgdGV4dHVyZU1hcHBpbmcsIG9wdGlvbnMuc3BlY3VsYXJFbmNvZGluZykpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGNvZGUuYXBwZW5kKFwidm9pZCBnZXRTcGVjdWxhcml0eSgpIHsgZFNwZWN1bGFyaXR5ID0gdmVjMygxKTsgfVwiKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29kZS5hcHBlbmQodGhpcy5fYWRkTWFwKFwiZ2xvc3NcIiwgXCJnbG9zc1BTXCIsIG9wdGlvbnMsIGxpdFNoYWRlci5jaHVua3MsIHRleHR1cmVNYXBwaW5nKSk7XG4gICAgICAgICAgICAgICAgZnVuYy5hcHBlbmQoXCJnZXRHbG9zc2luZXNzKCk7XCIpO1xuICAgICAgICAgICAgICAgIGZ1bmMuYXBwZW5kKFwiZ2V0U3BlY3VsYXJpdHkoKTtcIik7XG4gICAgICAgICAgICAgICAgYXJncy5hcHBlbmQoXCJsaXRBcmdzX3NwZWN1bGFyaXR5ID0gZFNwZWN1bGFyaXR5O1wiKTtcbiAgICAgICAgICAgICAgICBhcmdzLmFwcGVuZChcImxpdEFyZ3NfZ2xvc3MgPSBkR2xvc3NpbmVzcztcIik7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGRlY2wuYXBwZW5kKFwidmVjMyBkU3BlY3VsYXJpdHkgPSB2ZWMzKDAuMCk7XCIpO1xuICAgICAgICAgICAgICAgIGRlY2wuYXBwZW5kKFwiZmxvYXQgZEdsb3NzaW5lc3MgPSAwLjA7XCIpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBhb1xuICAgICAgICAgICAgaWYgKG9wdGlvbnMuYW9EZXRhaWwpIHtcbiAgICAgICAgICAgICAgICBjb2RlLmFwcGVuZCh0aGlzLl9hZGRNYXAoXCJhb0RldGFpbFwiLCBcImFvRGV0YWlsTWFwUFNcIiwgb3B0aW9ucywgbGl0U2hhZGVyLmNodW5rcywgdGV4dHVyZU1hcHBpbmcpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChvcHRpb25zLmFvTWFwIHx8IG9wdGlvbnMuYW9WZXJ0ZXhDb2xvcikge1xuICAgICAgICAgICAgICAgIGRlY2wuYXBwZW5kKFwiZmxvYXQgZEFvO1wiKTtcbiAgICAgICAgICAgICAgICBjb2RlLmFwcGVuZCh0aGlzLl9hZGRNYXAoXCJhb1wiLCBcImFvUFNcIiwgb3B0aW9ucywgbGl0U2hhZGVyLmNodW5rcywgdGV4dHVyZU1hcHBpbmcpKTtcbiAgICAgICAgICAgICAgICBmdW5jLmFwcGVuZChcImdldEFPKCk7XCIpO1xuICAgICAgICAgICAgICAgIGFyZ3MuYXBwZW5kKFwibGl0QXJnc19hbyA9IGRBbztcIik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIGVtaXNzaW9uXG4gICAgICAgICAgICBkZWNsLmFwcGVuZChcInZlYzMgZEVtaXNzaW9uO1wiKTtcbiAgICAgICAgICAgIGNvZGUuYXBwZW5kKHRoaXMuX2FkZE1hcChcImVtaXNzaXZlXCIsIFwiZW1pc3NpdmVQU1wiLCBvcHRpb25zLCBsaXRTaGFkZXIuY2h1bmtzLCB0ZXh0dXJlTWFwcGluZywgb3B0aW9ucy5lbWlzc2l2ZUVuY29kaW5nKSk7XG4gICAgICAgICAgICBmdW5jLmFwcGVuZChcImdldEVtaXNzaW9uKCk7XCIpO1xuICAgICAgICAgICAgYXJncy5hcHBlbmQoXCJsaXRBcmdzX2VtaXNzaW9uID0gZEVtaXNzaW9uO1wiKTtcblxuICAgICAgICAgICAgLy8gY2xlYXJjb2F0XG4gICAgICAgICAgICBpZiAob3B0aW9ucy5saXRPcHRpb25zLnVzZUNsZWFyQ29hdCkge1xuICAgICAgICAgICAgICAgIGRlY2wuYXBwZW5kKFwiZmxvYXQgY2NTcGVjdWxhcml0eTtcIik7XG4gICAgICAgICAgICAgICAgZGVjbC5hcHBlbmQoXCJmbG9hdCBjY0dsb3NzaW5lc3M7XCIpO1xuICAgICAgICAgICAgICAgIGRlY2wuYXBwZW5kKFwidmVjMyBjY05vcm1hbFc7XCIpO1xuXG4gICAgICAgICAgICAgICAgY29kZS5hcHBlbmQodGhpcy5fYWRkTWFwKFwiY2xlYXJDb2F0XCIsIFwiY2xlYXJDb2F0UFNcIiwgb3B0aW9ucywgbGl0U2hhZGVyLmNodW5rcywgdGV4dHVyZU1hcHBpbmcpKTtcbiAgICAgICAgICAgICAgICBjb2RlLmFwcGVuZCh0aGlzLl9hZGRNYXAoXCJjbGVhckNvYXRHbG9zc1wiLCBcImNsZWFyQ29hdEdsb3NzUFNcIiwgb3B0aW9ucywgbGl0U2hhZGVyLmNodW5rcywgdGV4dHVyZU1hcHBpbmcpKTtcbiAgICAgICAgICAgICAgICBjb2RlLmFwcGVuZCh0aGlzLl9hZGRNYXAoXCJjbGVhckNvYXROb3JtYWxcIiwgXCJjbGVhckNvYXROb3JtYWxQU1wiLCBvcHRpb25zLCBsaXRTaGFkZXIuY2h1bmtzLCB0ZXh0dXJlTWFwcGluZykpO1xuXG4gICAgICAgICAgICAgICAgZnVuYy5hcHBlbmQoXCJnZXRDbGVhckNvYXQoKTtcIik7XG4gICAgICAgICAgICAgICAgZnVuYy5hcHBlbmQoXCJnZXRDbGVhckNvYXRHbG9zc2luZXNzKCk7XCIpO1xuICAgICAgICAgICAgICAgIGZ1bmMuYXBwZW5kKFwiZ2V0Q2xlYXJDb2F0Tm9ybWFsKCk7XCIpO1xuXG4gICAgICAgICAgICAgICAgYXJncy5hcHBlbmQoXCJsaXRBcmdzX2NsZWFyY29hdF9zcGVjdWxhcml0eSA9IGNjU3BlY3VsYXJpdHk7XCIpO1xuICAgICAgICAgICAgICAgIGFyZ3MuYXBwZW5kKFwibGl0QXJnc19jbGVhcmNvYXRfZ2xvc3MgPSBjY0dsb3NzaW5lc3M7XCIpO1xuICAgICAgICAgICAgICAgIGFyZ3MuYXBwZW5kKFwibGl0QXJnc19jbGVhcmNvYXRfd29ybGROb3JtYWwgPSBjY05vcm1hbFc7XCIpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBsaWdodG1hcFxuICAgICAgICAgICAgaWYgKG9wdGlvbnMubGlnaHRNYXAgfHwgb3B0aW9ucy5saWdodFZlcnRleENvbG9yKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgbGlnaHRtYXBEaXIgPSAob3B0aW9ucy5kaXJMaWdodE1hcCAmJiBvcHRpb25zLmxpdE9wdGlvbnMudXNlU3BlY3VsYXIpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGxpZ2h0bWFwQ2h1bmtQcm9wTmFtZSA9IGxpZ2h0bWFwRGlyID8gJ2xpZ2h0bWFwRGlyUFMnIDogJ2xpZ2h0bWFwU2luZ2xlUFMnO1xuICAgICAgICAgICAgICAgIGRlY2wuYXBwZW5kKFwidmVjMyBkTGlnaHRtYXA7XCIpO1xuICAgICAgICAgICAgICAgIGlmIChsaWdodG1hcERpcikge1xuICAgICAgICAgICAgICAgICAgICBkZWNsLmFwcGVuZChcInZlYzMgZExpZ2h0bWFwRGlyO1wiKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29kZS5hcHBlbmQodGhpcy5fYWRkTWFwKFwibGlnaHRcIiwgbGlnaHRtYXBDaHVua1Byb3BOYW1lLCBvcHRpb25zLCBsaXRTaGFkZXIuY2h1bmtzLCB0ZXh0dXJlTWFwcGluZywgb3B0aW9ucy5saWdodE1hcEVuY29kaW5nKSk7XG4gICAgICAgICAgICAgICAgZnVuYy5hcHBlbmQoXCJnZXRMaWdodE1hcCgpO1wiKTtcbiAgICAgICAgICAgICAgICBhcmdzLmFwcGVuZChcImxpdEFyZ3NfbGlnaHRtYXAgPSBkTGlnaHRtYXA7XCIpO1xuICAgICAgICAgICAgICAgIGlmIChsaWdodG1hcERpcikge1xuICAgICAgICAgICAgICAgICAgICBhcmdzLmFwcGVuZChcImxpdEFyZ3NfbGlnaHRtYXBEaXIgPSBkTGlnaHRtYXBEaXI7XCIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gb25seSBhZGQgdGhlIGxlZ2FjeSBjaHVuayBpZiBpdCdzIHJlZmVyZW5jZWRcbiAgICAgICAgICAgIGlmIChjb2RlLmNvZGUuaW5kZXhPZigndGV4dHVyZTJEU1JHQicpICE9PSAtMSB8fFxuICAgICAgICAgICAgICAgIGNvZGUuY29kZS5pbmRleE9mKCd0ZXh0dXJlMkRSR0JNJykgIT09IC0xIHx8XG4gICAgICAgICAgICAgICAgY29kZS5jb2RlLmluZGV4T2YoJ3RleHR1cmUyRFJHQkUnKSAhPT0gLTEpIHtcbiAgICAgICAgICAgICAgICBEZWJ1Zy5kZXByZWNhdGVkKCdTaGFkZXIgY2h1bmsgbWFjcm8gJHRleHR1cmUyRFNBTVBMRShYWFgpIGlzIGRlcHJlY2F0ZWQuIFBsZWFzZSB1c2UgJERFQ09ERSh0ZXh0dXJlMkQoWFhYKSkgaW5zdGVhZC4nKTtcbiAgICAgICAgICAgICAgICBjb2RlLnByZXBlbmQobGl0U2hhZGVyLmNodW5rcy50ZXh0dXJlU2FtcGxlUFMpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gYWxsIG90aGVyIHBhc3NlcyByZXF1aXJlIG9ubHkgb3BhY2l0eVxuICAgICAgICAgICAgaWYgKG9wdGlvbnMubGl0T3B0aW9ucy5hbHBoYVRlc3QpIHtcbiAgICAgICAgICAgICAgICBkZWNsLmFwcGVuZChcImZsb2F0IGRBbHBoYTtcIik7XG4gICAgICAgICAgICAgICAgY29kZS5hcHBlbmQodGhpcy5fYWRkTWFwKFwib3BhY2l0eVwiLCBcIm9wYWNpdHlQU1wiLCBvcHRpb25zLCBsaXRTaGFkZXIuY2h1bmtzLCB0ZXh0dXJlTWFwcGluZykpO1xuICAgICAgICAgICAgICAgIGNvZGUuYXBwZW5kKGxpdFNoYWRlci5jaHVua3MuYWxwaGFUZXN0UFMpO1xuICAgICAgICAgICAgICAgIGZ1bmMuYXBwZW5kKFwiZ2V0T3BhY2l0eSgpO1wiKTtcbiAgICAgICAgICAgICAgICBmdW5jLmFwcGVuZChcImFscGhhVGVzdChkQWxwaGEpO1wiKTtcbiAgICAgICAgICAgICAgICBhcmdzLmFwcGVuZChcImxpdEFyZ3Nfb3BhY2l0eSA9IGRBbHBoYTtcIik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBkZWNsLmFwcGVuZChsaXRTaGFkZXIuY2h1bmtzLmxpdFNoYWRlckFyZ3NQUyk7XG4gICAgICAgIGNvZGUuYXBwZW5kKGB2b2lkIGV2YWx1YXRlRnJvbnRlbmQoKSB7IFxcbiR7ZnVuYy5jb2RlfVxcbiR7YXJncy5jb2RlfVxcbiB9XFxuYCk7XG4gICAgICAgIGZ1bmMuY29kZSA9IGBldmFsdWF0ZUZyb250ZW5kKCk7YDtcblxuICAgICAgICBmb3IgKGNvbnN0IHRleHR1cmUgaW4gdGV4dHVyZU1hcHBpbmcpIHtcbiAgICAgICAgICAgIGRlY2wuYXBwZW5kKGB1bmlmb3JtIHNhbXBsZXIyRCAke3RleHR1cmVNYXBwaW5nW3RleHR1cmVdfTtgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGRlY2wuYXBwZW5kKCcvLy0tLS0tLS0tIGZyb250ZW5kIGRlY2wgYmVnaW4nLCBkZWNsLmNvZGUsICcvLy0tLS0tLS0tIGZyb250ZW5kIGRlY2wgZW5kJyk7XG4gICAgICAgIC8vIGNvZGUuYXBwZW5kKCcvLy0tLS0tLS0tIGZyb250ZW5kIGNvZGUgYmVnaW4nLCBjb2RlLmNvZGUsICcvLy0tLS0tLS0tIGZyb250ZW5kIGNvZGUgZW5kJyk7XG4gICAgICAgIC8vIGZ1bmMuYXBwZW5kKCcvLy0tLS0tLS0tIGZyb250ZW5kIGZ1bmMgYmVnaW5cXG4ke2Z1bmN9Ly8tLS0tLS0tLSBmcm9udGVuZCBmdW5jIGVuZFxcbmA7XG5cbiAgICAgICAgLy8gZm9ybWF0IGZ1bmNcbiAgICAgICAgZnVuYy5jb2RlID0gYFxcbiR7ZnVuYy5jb2RlLnNwbGl0KCdcXG4nKS5tYXAobCA9PiBgICAgICR7bH1gKS5qb2luKCdcXG4nKX1cXG5cXG5gO1xuXG4gICAgICAgIGxpdFNoYWRlci5nZW5lcmF0ZUZyYWdtZW50U2hhZGVyKGRlY2wuY29kZSwgY29kZS5jb2RlLCBmdW5jLmNvZGUsIGxpZ2h0aW5nVXYpO1xuXG4gICAgICAgIHJldHVybiBsaXRTaGFkZXIuZ2V0RGVmaW5pdGlvbigpO1xuICAgIH1cbn1cblxuY29uc3Qgc3RhbmRhcmQgPSBuZXcgU2hhZGVyR2VuZXJhdG9yU3RhbmRhcmQoKTtcblxuZXhwb3J0IHsgX21hdFRleDJELCBzdGFuZGFyZCB9O1xuIl0sIm5hbWVzIjpbIl9tYXRUZXgyRCIsImJ1aWxkUHJvcGVydGllc0xpc3QiLCJvcHRpb25zIiwiT2JqZWN0Iiwia2V5cyIsImZpbHRlciIsImtleSIsInNvcnQiLCJTaGFkZXJHZW5lcmF0b3JTdGFuZGFyZCIsIlNoYWRlckdlbmVyYXRvciIsImNvbnN0cnVjdG9yIiwiYXJncyIsIm9wdGlvbnNDb250ZXh0IiwiU3RhbmRhcmRNYXRlcmlhbE9wdGlvbnMiLCJvcHRpb25zQ29udGV4dE1pbiIsImdlbmVyYXRlS2V5IiwicHJvcHMiLCJwcm9wc01pbiIsIm1hcCIsInByb3AiLCJqb2luIiwiTGl0T3B0aW9uc1V0aWxzIiwibGl0T3B0aW9ucyIsIl9nZXRVdlNvdXJjZUV4cHJlc3Npb24iLCJ0cmFuc2Zvcm1Qcm9wTmFtZSIsInVWUHJvcE5hbWUiLCJ0cmFuc2Zvcm1JZCIsInV2Q2hhbm5lbCIsImlzTWFpblBhc3MiLCJwYXNzIiwiU0hBREVSX0ZPUldBUkQiLCJTSEFERVJfRk9SV0FSREhEUiIsImV4cHJlc3Npb24iLCJuaW5lU2xpY2VkTW9kZSIsIlNQUklURV9SRU5ERVJNT0RFX1NMSUNFRCIsIlNQUklURV9SRU5ERVJNT0RFX1RJTEVEIiwiaGVpZ2h0TWFwIiwiX2FkZE1hcERlZiIsIm5hbWUiLCJlbmFibGVkIiwiX2FkZE1hcERlZnMiLCJmbG9hdCIsImNvbG9yIiwidmVydGV4IiwiaW52ZXJ0IiwiX2FkZE1hcCIsInByb3BOYW1lIiwiY2h1bmtOYW1lIiwiY2h1bmtzIiwibWFwcGluZyIsImVuY29kaW5nIiwibWFwUHJvcE5hbWUiLCJpZGVudGlmaWVyUHJvcE5hbWUiLCJjaGFubmVsUHJvcE5hbWUiLCJ2ZXJ0ZXhDb2xvckNoYW5uZWxQcm9wTmFtZSIsInRpbnRQcm9wTmFtZSIsInZlcnRleENvbG9yUHJvcE5hbWUiLCJkZXRhaWxNb2RlUHJvcE5hbWUiLCJpbnZlcnROYW1lIiwidGludE9wdGlvbiIsInZlcnRleENvbG9yT3B0aW9uIiwidGV4dHVyZU9wdGlvbiIsInRleHR1cmVJZGVudGlmaWVyIiwiZGV0YWlsTW9kZU9wdGlvbiIsInN1YkNvZGUiLCJ1diIsInJlcGxhY2UiLCJzZWFyY2giLCJzYW1wbGVyTmFtZSIsImFsaWFzIiwiQ2h1bmtVdGlscyIsImRlY29kZUZ1bmMiLCJnYW1tYSIsImluZGV4T2YiLCJkZWNvZGVUYWJsZSIsImxpbmVhciIsInNyZ2IiLCJyZ2JtIiwicmdiZSIsImlzRmxvYXRUaW50IiwiaXNWZWNUaW50IiwiaW52ZXJ0T3B0aW9uIiwiX2NvcnJlY3RDaGFubmVsIiwicCIsImNoYW4iLCJsZW5ndGgiLCJzdWJzdHJpbmciLCJzdHIiLCJjaHIiLCJjaGFyQXQiLCJhZGRMZW4iLCJpIiwiY3JlYXRlU2hhZGVyRGVmaW5pdGlvbiIsImRldmljZSIsInNoYWRlclBhc3NJbmZvIiwiU2hhZGVyUGFzcyIsImdldCIsImdldEJ5SW5kZXgiLCJpc0ZvcndhcmRQYXNzIiwiaXNGb3J3YXJkIiwibGl0U2hhZGVyIiwiTGl0U2hhZGVyIiwidXNlVXYiLCJ1c2VVbm1vZGlmaWVkVXYiLCJtYXBUcmFuc2Zvcm1zIiwibWF4VXZTZXRzIiwidGV4dHVyZU1hcHBpbmciLCJtbmFtZSIsImNuYW1lIiwidG5hbWUiLCJ1bmFtZSIsIk1hdGgiLCJtaW4iLCJ1dlNldCIsInB1c2giLCJpZCIsImZvcmNlVXYxIiwidW5kZWZpbmVkIiwiZ2VuZXJhdGVWZXJ0ZXhTaGFkZXIiLCJzaGFkaW5nTW9kZWwiLCJTUEVDVUxBUl9QSE9ORyIsImZyZXNuZWxNb2RlbCIsImFtYmllbnRTSCIsIkZSRVNORUxfU0NITElDSyIsImRlY2wiLCJDaHVua0J1aWxkZXIiLCJjb2RlIiwiZnVuYyIsImxpZ2h0aW5nVXYiLCJhcHBlbmQiLCJibGVuZFR5cGUiLCJCTEVORF9OT05FIiwiYWxwaGFUZXN0IiwiYWxwaGFUb0NvdmVyYWdlIiwiYWxwaGFUZXN0UFMiLCJuZWVkc05vcm1hbCIsIm5vcm1hbE1hcCIsImNsZWFyQ29hdE5vcm1hbE1hcCIsInBhY2tlZE5vcm1hbCIsIm5vcm1hbFhZUFMiLCJub3JtYWxYWVpQUyIsImhhc1RhbmdlbnRzIiwiYmFzZU5hbWUiLCJuZWVkc1NjZW5lQ29sb3IiLCJuZWVkc1NjcmVlblNpemUiLCJuZWVkc1RyYW5zZm9ybXMiLCJkaWZmdXNlRGV0YWlsIiwiYW9EZXRhaWwiLCJkZXRhaWxNb2Rlc1BTIiwiZGlmZnVzZURldGFpbEVuY29kaW5nIiwiZGlmZnVzZUVuY29kaW5nIiwidXNlUmVmcmFjdGlvbiIsInVzZUlyaWRlc2NlbmNlIiwibGlnaHRpbmciLCJ1c2VTcGVjdWxhciIsInJlZmxlY3Rpb25zIiwidXNlU2hlZW4iLCJzaGVlbkVuY29kaW5nIiwidXNlTWV0YWxuZXNzIiwidXNlU3BlY3VsYXJpdHlGYWN0b3IiLCJ1c2VTcGVjdWxhckNvbG9yIiwic3BlY3VsYXJFbmNvZGluZyIsImFvTWFwIiwiYW9WZXJ0ZXhDb2xvciIsImVtaXNzaXZlRW5jb2RpbmciLCJ1c2VDbGVhckNvYXQiLCJsaWdodE1hcCIsImxpZ2h0VmVydGV4Q29sb3IiLCJsaWdodG1hcERpciIsImRpckxpZ2h0TWFwIiwibGlnaHRtYXBDaHVua1Byb3BOYW1lIiwibGlnaHRNYXBFbmNvZGluZyIsIkRlYnVnIiwiZGVwcmVjYXRlZCIsInByZXBlbmQiLCJ0ZXh0dXJlU2FtcGxlUFMiLCJsaXRTaGFkZXJBcmdzUFMiLCJ0ZXh0dXJlIiwic3BsaXQiLCJsIiwiZ2VuZXJhdGVGcmFnbWVudFNoYWRlciIsImdldERlZmluaXRpb24iLCJzdGFuZGFyZCJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7OztBQWdCTUEsTUFBQUEsU0FBUyxHQUFHLEdBQUU7QUFFcEIs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
