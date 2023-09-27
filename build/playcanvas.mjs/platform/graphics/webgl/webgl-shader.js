import { Debug } from '../../../core/debug.js';
import { TRACEID_SHADER_COMPILE } from '../../../core/constants.js';
import { now } from '../../../core/time.js';
import { WebglShaderInput } from './webgl-shader-input.js';
import { semanticToLocation, SHADERTAG_MATERIAL } from '../constants.js';
import { DeviceCache } from '../device-cache.js';

let _totalCompileTime = 0;
const _vertexShaderBuiltins = ['gl_VertexID', 'gl_InstanceID', 'gl_DrawID', 'gl_BaseVertex', 'gl_BaseInstance'];

// class used to hold compiled WebGL vertex or fragment shaders in the device cache
class CompiledShaderCache {
  constructor() {
    // maps shader source to a compiled WebGL shader
    this.map = new Map();
  }
  // destroy all created shaders when the device is destroyed
  destroy(device) {
    this.map.forEach(shader => {
      device.gl.deleteShader(shader);
    });
  }

  // just empty the cache when the context is lost
  loseContext(device) {
    this.map.clear();
  }
}

// class used to hold a list of recently created shaders forming a batch, to allow their more optimized compilation
class ShaderBatchCache {
  constructor() {
    this.shaders = [];
  }
  loseContext(device) {
    this.shaders = [];
  }
}
const _vertexShaderCache = new DeviceCache();
const _fragmentShaderCache = new DeviceCache();
const _shaderBatchCache = new DeviceCache();

/**
 * A WebGL implementation of the Shader.
 *
 * @ignore
 */
class WebglShader {
  constructor(shader) {
    this.compileDuration = 0;
    this.init();

    // kick off vertex and fragment shader compilation, but not linking here, as that would
    // make it blocking.
    this.compile(shader.device, shader);

    // add the shader to recently created list
    WebglShader.getBatchShaders(shader.device).push(shader);

    // add it to a device list of all shaders
    shader.device.shaders.push(shader);
  }

  /**
   * Free the WebGL resources associated with a shader.
   *
   * @param {import('../shader.js').Shader} shader - The shader to free.
   */
  destroy(shader) {
    if (this.glProgram) {
      shader.device.gl.deleteProgram(this.glProgram);
      this.glProgram = null;
    }
  }
  init() {
    this.uniforms = [];
    this.samplers = [];
    this.attributes = [];
    this.glProgram = null;
    this.glVertexShader = null;
    this.glFragmentShader = null;
  }
  static getBatchShaders(device) {
    const batchCache = _shaderBatchCache.get(device, () => {
      return new ShaderBatchCache();
    });
    return batchCache.shaders;
  }
  static endShaderBatch(device) {
    // Trigger link step for all recently created shaders. This allows linking to be done in parallel, before
    // the blocking wait on the linking result is triggered in finalize function
    const shaders = WebglShader.getBatchShaders(device);
    shaders.forEach(shader => shader.impl.link(device, shader));
    shaders.length = 0;
  }

  /**
   * Dispose the shader when the context has been lost.
   */
  loseContext() {
    this.init();
  }

  /**
   * Restore shader after the context has been obtained.
   *
   * @param {import('./webgl-graphics-device.js').WebglGraphicsDevice} device - The graphics device.
   * @param {import('../shader.js').Shader} shader - The shader to restore.
   */
  restoreContext(device, shader) {
    this.compile(device, shader);
  }

  /**
   * Compile shader programs.
   *
   * @param {import('./webgl-graphics-device.js').WebglGraphicsDevice} device - The graphics device.
   * @param {import('../shader.js').Shader} shader - The shader to compile.
   */
  compile(device, shader) {
    const definition = shader.definition;
    this.glVertexShader = this._compileShaderSource(device, definition.vshader, true);
    this.glFragmentShader = this._compileShaderSource(device, definition.fshader, false);
  }

  /**
   * Link shader programs. This is called at a later stage, to allow many shaders to compile in parallel.
   *
   * @param {import('./webgl-graphics-device.js').WebglGraphicsDevice} device - The graphics device.
   * @param {import('../shader.js').Shader} shader - The shader to compile.
   */
  link(device, shader) {
    // if the shader was already linked
    if (this.glProgram) return;

    // if the device is lost, silently ignore
    const gl = device.gl;
    if (gl.isContextLost()) {
      return;
    }
    let startTime = 0;
    Debug.call(() => {
      this.compileDuration = 0;
      startTime = now();
    });
    const glProgram = gl.createProgram();
    this.glProgram = glProgram;
    gl.attachShader(glProgram, this.glVertexShader);
    gl.attachShader(glProgram, this.glFragmentShader);
    const definition = shader.definition;
    const attrs = definition.attributes;
    if (device.webgl2 && definition.useTransformFeedback) {
      // Collect all "out_" attributes and use them for output
      const outNames = [];
      for (const attr in attrs) {
        if (attrs.hasOwnProperty(attr)) {
          outNames.push("out_" + attr);
        }
      }
      gl.transformFeedbackVaryings(glProgram, outNames, gl.INTERLEAVED_ATTRIBS);
    }

    // map all vertex input attributes to fixed locations
    const locations = {};
    for (const attr in attrs) {
      if (attrs.hasOwnProperty(attr)) {
        const semantic = attrs[attr];
        const loc = semanticToLocation[semantic];
        Debug.assert(!locations.hasOwnProperty(loc), `WARNING: Two attributes are mapped to the same location in a shader: ${locations[loc]} and ${attr}`);
        locations[loc] = attr;
        gl.bindAttribLocation(glProgram, loc, attr);
      }
    }
    gl.linkProgram(glProgram);
    Debug.call(() => {
      this.compileDuration = now() - startTime;
    });
    device._shaderStats.linked++;
    if (definition.tag === SHADERTAG_MATERIAL) {
      device._shaderStats.materialShaders++;
    }
  }

  /**
   * Compiles an individual shader.
   *
   * @param {import('./webgl-graphics-device.js').WebglGraphicsDevice} device - The graphics device.
   * @param {string} src - The shader source code.
   * @param {boolean} isVertexShader - True if the shader is a vertex shader, false if it is a
   * fragment shader.
   * @returns {WebGLShader} The compiled shader.
   * @private
   */
  _compileShaderSource(device, src, isVertexShader) {
    const gl = device.gl;

    // device cache for current device, containing cache of compiled shaders
    const shaderDeviceCache = isVertexShader ? _vertexShaderCache : _fragmentShaderCache;
    const shaderCache = shaderDeviceCache.get(device, () => {
      return new CompiledShaderCache();
    });

    // try to get compiled shader from the cache
    let glShader = shaderCache.map.get(src);
    if (!glShader) {
      const startTime = now();
      device.fire('shader:compile:start', {
        timestamp: startTime,
        target: device
      });
      glShader = gl.createShader(isVertexShader ? gl.VERTEX_SHADER : gl.FRAGMENT_SHADER);

      // if the device is lost, silently ignore
      if (!glShader && gl.isContextLost()) {
        return glShader;
      }
      gl.shaderSource(glShader, src);
      gl.compileShader(glShader);
      shaderCache.map.set(src, glShader);
      const endTime = now();
      device.fire('shader:compile:end', {
        timestamp: endTime,
        target: device
      });
      device._shaderStats.compileTime += endTime - startTime;
      if (isVertexShader) {
        device._shaderStats.vsCompiled++;
      } else {
        device._shaderStats.fsCompiled++;
      }
    }
    return glShader;
  }

  /**
   * Link the shader, and extract its attributes and uniform information.
   *
   * @param {import('./webgl-graphics-device.js').WebglGraphicsDevice} device - The graphics device.
   * @param {import('../shader.js').Shader} shader - The shader to query.
   * @returns {boolean} True if the shader was successfully queried and false otherwise.
   */
  finalize(device, shader) {
    // if the device is lost, silently ignore
    const gl = device.gl;
    if (gl.isContextLost()) {
      return true;
    }

    // if the program wasn't linked yet (shader was not created in batch)
    if (!this.glProgram) this.link(device, shader);
    const glProgram = this.glProgram;
    const definition = shader.definition;
    const startTime = now();
    device.fire('shader:link:start', {
      timestamp: startTime,
      target: device
    });

    // this is the main thead blocking part of the shader compilation, time it
    let linkStartTime = 0;
    Debug.call(() => {
      linkStartTime = now();
    });
    const linkStatus = gl.getProgramParameter(glProgram, gl.LINK_STATUS);
    if (!linkStatus) {
      var _gl$getExtension, _gl$getExtension2;
      // Check for compilation errors
      if (!this._isCompiled(device, shader, this.glVertexShader, definition.vshader, "vertex")) return false;
      if (!this._isCompiled(device, shader, this.glFragmentShader, definition.fshader, "fragment")) return false;
      const message = "Failed to link shader program. Error: " + gl.getProgramInfoLog(glProgram);

      // log translated shaders
      definition.translatedFrag = (_gl$getExtension = gl.getExtension('WEBGL_debug_shaders')) == null ? void 0 : _gl$getExtension.getTranslatedShaderSource(this.glFragmentShader);
      definition.translatedVert = (_gl$getExtension2 = gl.getExtension('WEBGL_debug_shaders')) == null ? void 0 : _gl$getExtension2.getTranslatedShaderSource(this.glVertexShader);
      console.error(message, definition);
      return false;
    }

    // Query the program for each vertex buffer input (GLSL 'attribute')
    let i = 0;
    const numAttributes = gl.getProgramParameter(glProgram, gl.ACTIVE_ATTRIBUTES);
    while (i < numAttributes) {
      const info = gl.getActiveAttrib(glProgram, i++);
      const location = gl.getAttribLocation(glProgram, info.name);

      // a built-in attributes for which we do not need to provide any data
      if (_vertexShaderBuiltins.indexOf(info.name) !== -1) continue;

      // Check attributes are correctly linked up
      if (definition.attributes[info.name] === undefined) {
        console.error(`Vertex shader attribute "${info.name}" is not mapped to a semantic in shader definition, shader [${shader.label}]`, shader);
        shader.failed = true;
      }
      const shaderInput = new WebglShaderInput(device, definition.attributes[info.name], device.pcUniformType[info.type], location);
      this.attributes.push(shaderInput);
    }

    // Query the program for each shader state (GLSL 'uniform')
    i = 0;
    const numUniforms = gl.getProgramParameter(glProgram, gl.ACTIVE_UNIFORMS);
    while (i < numUniforms) {
      const info = gl.getActiveUniform(glProgram, i++);
      const location = gl.getUniformLocation(glProgram, info.name);
      const shaderInput = new WebglShaderInput(device, info.name, device.pcUniformType[info.type], location);
      if (info.type === gl.SAMPLER_2D || info.type === gl.SAMPLER_CUBE || device.webgl2 && (info.type === gl.SAMPLER_2D_SHADOW || info.type === gl.SAMPLER_CUBE_SHADOW || info.type === gl.SAMPLER_3D)) {
        this.samplers.push(shaderInput);
      } else {
        this.uniforms.push(shaderInput);
      }
    }
    shader.ready = true;
    const endTime = now();
    device.fire('shader:link:end', {
      timestamp: endTime,
      target: device
    });
    device._shaderStats.compileTime += endTime - startTime;
    Debug.call(() => {
      const duration = now() - linkStartTime;
      this.compileDuration += duration;
      _totalCompileTime += this.compileDuration;
      Debug.trace(TRACEID_SHADER_COMPILE, `[id: ${shader.id}] ${shader.name}: ${this.compileDuration.toFixed(1)}ms, TOTAL: ${_totalCompileTime.toFixed(1)}ms`);
    });
    return true;
  }

  /**
   * Check the compilation status of a shader.
   *
   * @param {import('./webgl-graphics-device.js').WebglGraphicsDevice} device - The graphics device.
   * @param {import('../shader.js').Shader} shader - The shader to query.
   * @param {WebGLShader} glShader - The WebGL shader.
   * @param {string} source - The shader source code.
   * @param {string} shaderType - The shader type. Can be 'vertex' or 'fragment'.
   * @returns {boolean} True if the shader compiled successfully, false otherwise.
   * @private
   */
  _isCompiled(device, shader, glShader, source, shaderType) {
    const gl = device.gl;
    if (!gl.getShaderParameter(glShader, gl.COMPILE_STATUS)) {
      const infoLog = gl.getShaderInfoLog(glShader);
      const [code, error] = this._processError(source, infoLog);
      const message = `Failed to compile ${shaderType} shader:\n\n${infoLog}\n${code}`;
      error.shader = shader;
      console.error(message, error);
      return false;
    }
    return true;
  }

  /**
   * Truncate the WebGL shader compilation log to just include the error line plus the 5 lines
   * before and after it.
   *
   * @param {string} src - The shader source code.
   * @param {string} infoLog - The info log returned from WebGL on a failed shader compilation.
   * @returns {Array} An array where the first element is the 10 lines of code around the first
   * detected error, and the second element an object storing the error message, line number and
   * complete shader source.
   * @private
   */
  _processError(src, infoLog) {
    const error = {};
    let code = '';
    if (src) {
      const lines = src.split('\n');
      let from = 0;
      let to = lines.length;

      // if error is in the code, only show nearby lines instead of whole shader code
      if (infoLog && infoLog.startsWith('ERROR:')) {
        const match = infoLog.match(/^ERROR:\s([0-9]+):([0-9]+):\s*(.+)/);
        if (match) {
          error.message = match[3];
          error.line = parseInt(match[2], 10);
          from = Math.max(0, error.line - 6);
          to = Math.min(lines.length, error.line + 5);
        }
      }

      // Chrome reports shader errors on lines indexed from 1
      for (let i = from; i < to; i++) {
        code += i + 1 + ":\t" + lines[i] + '\n';
      }
      error.source = src;
    }
    return [code, error];
  }
}

export { WebglShader };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2ViZ2wtc2hhZGVyLmpzIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi9zcmMvcGxhdGZvcm0vZ3JhcGhpY3Mvd2ViZ2wvd2ViZ2wtc2hhZGVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IERlYnVnIH0gZnJvbSAnLi4vLi4vLi4vY29yZS9kZWJ1Zy5qcyc7XG5pbXBvcnQgeyBUUkFDRUlEX1NIQURFUl9DT01QSUxFIH0gZnJvbSAnLi4vLi4vLi4vY29yZS9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgbm93IH0gZnJvbSAnLi4vLi4vLi4vY29yZS90aW1lLmpzJztcblxuaW1wb3J0IHsgV2ViZ2xTaGFkZXJJbnB1dCB9IGZyb20gJy4vd2ViZ2wtc2hhZGVyLWlucHV0LmpzJztcbmltcG9ydCB7IFNIQURFUlRBR19NQVRFUklBTCwgc2VtYW50aWNUb0xvY2F0aW9uIH0gZnJvbSAnLi4vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IERldmljZUNhY2hlIH0gZnJvbSAnLi4vZGV2aWNlLWNhY2hlLmpzJztcblxubGV0IF90b3RhbENvbXBpbGVUaW1lID0gMDtcblxuY29uc3QgX3ZlcnRleFNoYWRlckJ1aWx0aW5zID0gW1xuICAgICdnbF9WZXJ0ZXhJRCcsXG4gICAgJ2dsX0luc3RhbmNlSUQnLFxuICAgICdnbF9EcmF3SUQnLFxuICAgICdnbF9CYXNlVmVydGV4JyxcbiAgICAnZ2xfQmFzZUluc3RhbmNlJ1xuXTtcblxuLy8gY2xhc3MgdXNlZCB0byBob2xkIGNvbXBpbGVkIFdlYkdMIHZlcnRleCBvciBmcmFnbWVudCBzaGFkZXJzIGluIHRoZSBkZXZpY2UgY2FjaGVcbmNsYXNzIENvbXBpbGVkU2hhZGVyQ2FjaGUge1xuICAgIC8vIG1hcHMgc2hhZGVyIHNvdXJjZSB0byBhIGNvbXBpbGVkIFdlYkdMIHNoYWRlclxuICAgIG1hcCA9IG5ldyBNYXAoKTtcblxuICAgIC8vIGRlc3Ryb3kgYWxsIGNyZWF0ZWQgc2hhZGVycyB3aGVuIHRoZSBkZXZpY2UgaXMgZGVzdHJveWVkXG4gICAgZGVzdHJveShkZXZpY2UpIHtcbiAgICAgICAgdGhpcy5tYXAuZm9yRWFjaCgoc2hhZGVyKSA9PiB7XG4gICAgICAgICAgICBkZXZpY2UuZ2wuZGVsZXRlU2hhZGVyKHNoYWRlcik7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIGp1c3QgZW1wdHkgdGhlIGNhY2hlIHdoZW4gdGhlIGNvbnRleHQgaXMgbG9zdFxuICAgIGxvc2VDb250ZXh0KGRldmljZSkge1xuICAgICAgICB0aGlzLm1hcC5jbGVhcigpO1xuICAgIH1cbn1cblxuLy8gY2xhc3MgdXNlZCB0byBob2xkIGEgbGlzdCBvZiByZWNlbnRseSBjcmVhdGVkIHNoYWRlcnMgZm9ybWluZyBhIGJhdGNoLCB0byBhbGxvdyB0aGVpciBtb3JlIG9wdGltaXplZCBjb21waWxhdGlvblxuY2xhc3MgU2hhZGVyQmF0Y2hDYWNoZSB7XG4gICAgc2hhZGVycyA9IFtdO1xuXG4gICAgbG9zZUNvbnRleHQoZGV2aWNlKSB7XG4gICAgICAgIHRoaXMuc2hhZGVycyA9IFtdO1xuICAgIH1cbn1cblxuY29uc3QgX3ZlcnRleFNoYWRlckNhY2hlID0gbmV3IERldmljZUNhY2hlKCk7XG5jb25zdCBfZnJhZ21lbnRTaGFkZXJDYWNoZSA9IG5ldyBEZXZpY2VDYWNoZSgpO1xuY29uc3QgX3NoYWRlckJhdGNoQ2FjaGUgPSBuZXcgRGV2aWNlQ2FjaGUoKTtcblxuLyoqXG4gKiBBIFdlYkdMIGltcGxlbWVudGF0aW9uIG9mIHRoZSBTaGFkZXIuXG4gKlxuICogQGlnbm9yZVxuICovXG5jbGFzcyBXZWJnbFNoYWRlciB7XG4gICAgY29tcGlsZUR1cmF0aW9uID0gMDtcblxuICAgIGNvbnN0cnVjdG9yKHNoYWRlcikge1xuICAgICAgICB0aGlzLmluaXQoKTtcblxuICAgICAgICAvLyBraWNrIG9mZiB2ZXJ0ZXggYW5kIGZyYWdtZW50IHNoYWRlciBjb21waWxhdGlvbiwgYnV0IG5vdCBsaW5raW5nIGhlcmUsIGFzIHRoYXQgd291bGRcbiAgICAgICAgLy8gbWFrZSBpdCBibG9ja2luZy5cbiAgICAgICAgdGhpcy5jb21waWxlKHNoYWRlci5kZXZpY2UsIHNoYWRlcik7XG5cbiAgICAgICAgLy8gYWRkIHRoZSBzaGFkZXIgdG8gcmVjZW50bHkgY3JlYXRlZCBsaXN0XG4gICAgICAgIFdlYmdsU2hhZGVyLmdldEJhdGNoU2hhZGVycyhzaGFkZXIuZGV2aWNlKS5wdXNoKHNoYWRlcik7XG5cbiAgICAgICAgLy8gYWRkIGl0IHRvIGEgZGV2aWNlIGxpc3Qgb2YgYWxsIHNoYWRlcnNcbiAgICAgICAgc2hhZGVyLmRldmljZS5zaGFkZXJzLnB1c2goc2hhZGVyKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBGcmVlIHRoZSBXZWJHTCByZXNvdXJjZXMgYXNzb2NpYXRlZCB3aXRoIGEgc2hhZGVyLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4uL3NoYWRlci5qcycpLlNoYWRlcn0gc2hhZGVyIC0gVGhlIHNoYWRlciB0byBmcmVlLlxuICAgICAqL1xuICAgIGRlc3Ryb3koc2hhZGVyKSB7XG4gICAgICAgIGlmICh0aGlzLmdsUHJvZ3JhbSkge1xuICAgICAgICAgICAgc2hhZGVyLmRldmljZS5nbC5kZWxldGVQcm9ncmFtKHRoaXMuZ2xQcm9ncmFtKTtcbiAgICAgICAgICAgIHRoaXMuZ2xQcm9ncmFtID0gbnVsbDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGluaXQoKSB7XG4gICAgICAgIHRoaXMudW5pZm9ybXMgPSBbXTtcbiAgICAgICAgdGhpcy5zYW1wbGVycyA9IFtdO1xuICAgICAgICB0aGlzLmF0dHJpYnV0ZXMgPSBbXTtcblxuICAgICAgICB0aGlzLmdsUHJvZ3JhbSA9IG51bGw7XG4gICAgICAgIHRoaXMuZ2xWZXJ0ZXhTaGFkZXIgPSBudWxsO1xuICAgICAgICB0aGlzLmdsRnJhZ21lbnRTaGFkZXIgPSBudWxsO1xuICAgIH1cblxuICAgIHN0YXRpYyBnZXRCYXRjaFNoYWRlcnMoZGV2aWNlKSB7XG4gICAgICAgIGNvbnN0IGJhdGNoQ2FjaGUgPSBfc2hhZGVyQmF0Y2hDYWNoZS5nZXQoZGV2aWNlLCAoKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gbmV3IFNoYWRlckJhdGNoQ2FjaGUoKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBiYXRjaENhY2hlLnNoYWRlcnM7XG4gICAgfVxuXG4gICAgc3RhdGljIGVuZFNoYWRlckJhdGNoKGRldmljZSkge1xuXG4gICAgICAgIC8vIFRyaWdnZXIgbGluayBzdGVwIGZvciBhbGwgcmVjZW50bHkgY3JlYXRlZCBzaGFkZXJzLiBUaGlzIGFsbG93cyBsaW5raW5nIHRvIGJlIGRvbmUgaW4gcGFyYWxsZWwsIGJlZm9yZVxuICAgICAgICAvLyB0aGUgYmxvY2tpbmcgd2FpdCBvbiB0aGUgbGlua2luZyByZXN1bHQgaXMgdHJpZ2dlcmVkIGluIGZpbmFsaXplIGZ1bmN0aW9uXG4gICAgICAgIGNvbnN0IHNoYWRlcnMgPSBXZWJnbFNoYWRlci5nZXRCYXRjaFNoYWRlcnMoZGV2aWNlKTtcbiAgICAgICAgc2hhZGVycy5mb3JFYWNoKHNoYWRlciA9PiBzaGFkZXIuaW1wbC5saW5rKGRldmljZSwgc2hhZGVyKSk7XG4gICAgICAgIHNoYWRlcnMubGVuZ3RoID0gMDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBEaXNwb3NlIHRoZSBzaGFkZXIgd2hlbiB0aGUgY29udGV4dCBoYXMgYmVlbiBsb3N0LlxuICAgICAqL1xuICAgIGxvc2VDb250ZXh0KCkge1xuICAgICAgICB0aGlzLmluaXQoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXN0b3JlIHNoYWRlciBhZnRlciB0aGUgY29udGV4dCBoYXMgYmVlbiBvYnRhaW5lZC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuL3dlYmdsLWdyYXBoaWNzLWRldmljZS5qcycpLldlYmdsR3JhcGhpY3NEZXZpY2V9IGRldmljZSAtIFRoZSBncmFwaGljcyBkZXZpY2UuXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4uL3NoYWRlci5qcycpLlNoYWRlcn0gc2hhZGVyIC0gVGhlIHNoYWRlciB0byByZXN0b3JlLlxuICAgICAqL1xuICAgIHJlc3RvcmVDb250ZXh0KGRldmljZSwgc2hhZGVyKSB7XG4gICAgICAgIHRoaXMuY29tcGlsZShkZXZpY2UsIHNoYWRlcik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ29tcGlsZSBzaGFkZXIgcHJvZ3JhbXMuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi93ZWJnbC1ncmFwaGljcy1kZXZpY2UuanMnKS5XZWJnbEdyYXBoaWNzRGV2aWNlfSBkZXZpY2UgLSBUaGUgZ3JhcGhpY3MgZGV2aWNlLlxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuLi9zaGFkZXIuanMnKS5TaGFkZXJ9IHNoYWRlciAtIFRoZSBzaGFkZXIgdG8gY29tcGlsZS5cbiAgICAgKi9cbiAgICBjb21waWxlKGRldmljZSwgc2hhZGVyKSB7XG5cbiAgICAgICAgY29uc3QgZGVmaW5pdGlvbiA9IHNoYWRlci5kZWZpbml0aW9uO1xuICAgICAgICB0aGlzLmdsVmVydGV4U2hhZGVyID0gdGhpcy5fY29tcGlsZVNoYWRlclNvdXJjZShkZXZpY2UsIGRlZmluaXRpb24udnNoYWRlciwgdHJ1ZSk7XG4gICAgICAgIHRoaXMuZ2xGcmFnbWVudFNoYWRlciA9IHRoaXMuX2NvbXBpbGVTaGFkZXJTb3VyY2UoZGV2aWNlLCBkZWZpbml0aW9uLmZzaGFkZXIsIGZhbHNlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBMaW5rIHNoYWRlciBwcm9ncmFtcy4gVGhpcyBpcyBjYWxsZWQgYXQgYSBsYXRlciBzdGFnZSwgdG8gYWxsb3cgbWFueSBzaGFkZXJzIHRvIGNvbXBpbGUgaW4gcGFyYWxsZWwuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi93ZWJnbC1ncmFwaGljcy1kZXZpY2UuanMnKS5XZWJnbEdyYXBoaWNzRGV2aWNlfSBkZXZpY2UgLSBUaGUgZ3JhcGhpY3MgZGV2aWNlLlxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuLi9zaGFkZXIuanMnKS5TaGFkZXJ9IHNoYWRlciAtIFRoZSBzaGFkZXIgdG8gY29tcGlsZS5cbiAgICAgKi9cbiAgICBsaW5rKGRldmljZSwgc2hhZGVyKSB7XG5cbiAgICAgICAgLy8gaWYgdGhlIHNoYWRlciB3YXMgYWxyZWFkeSBsaW5rZWRcbiAgICAgICAgaWYgKHRoaXMuZ2xQcm9ncmFtKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIC8vIGlmIHRoZSBkZXZpY2UgaXMgbG9zdCwgc2lsZW50bHkgaWdub3JlXG4gICAgICAgIGNvbnN0IGdsID0gZGV2aWNlLmdsO1xuICAgICAgICBpZiAoZ2wuaXNDb250ZXh0TG9zdCgpKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgc3RhcnRUaW1lID0gMDtcbiAgICAgICAgRGVidWcuY2FsbCgoKSA9PiB7XG4gICAgICAgICAgICB0aGlzLmNvbXBpbGVEdXJhdGlvbiA9IDA7XG4gICAgICAgICAgICBzdGFydFRpbWUgPSBub3coKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uc3QgZ2xQcm9ncmFtID0gZ2wuY3JlYXRlUHJvZ3JhbSgpO1xuICAgICAgICB0aGlzLmdsUHJvZ3JhbSA9IGdsUHJvZ3JhbTtcblxuICAgICAgICBnbC5hdHRhY2hTaGFkZXIoZ2xQcm9ncmFtLCB0aGlzLmdsVmVydGV4U2hhZGVyKTtcbiAgICAgICAgZ2wuYXR0YWNoU2hhZGVyKGdsUHJvZ3JhbSwgdGhpcy5nbEZyYWdtZW50U2hhZGVyKTtcblxuICAgICAgICBjb25zdCBkZWZpbml0aW9uID0gc2hhZGVyLmRlZmluaXRpb247XG4gICAgICAgIGNvbnN0IGF0dHJzID0gZGVmaW5pdGlvbi5hdHRyaWJ1dGVzO1xuICAgICAgICBpZiAoZGV2aWNlLndlYmdsMiAmJiBkZWZpbml0aW9uLnVzZVRyYW5zZm9ybUZlZWRiYWNrKSB7XG4gICAgICAgICAgICAvLyBDb2xsZWN0IGFsbCBcIm91dF9cIiBhdHRyaWJ1dGVzIGFuZCB1c2UgdGhlbSBmb3Igb3V0cHV0XG4gICAgICAgICAgICBjb25zdCBvdXROYW1lcyA9IFtdO1xuICAgICAgICAgICAgZm9yIChjb25zdCBhdHRyIGluIGF0dHJzKSB7XG4gICAgICAgICAgICAgICAgaWYgKGF0dHJzLmhhc093blByb3BlcnR5KGF0dHIpKSB7XG4gICAgICAgICAgICAgICAgICAgIG91dE5hbWVzLnB1c2goXCJvdXRfXCIgKyBhdHRyKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBnbC50cmFuc2Zvcm1GZWVkYmFja1ZhcnlpbmdzKGdsUHJvZ3JhbSwgb3V0TmFtZXMsIGdsLklOVEVSTEVBVkVEX0FUVFJJQlMpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gbWFwIGFsbCB2ZXJ0ZXggaW5wdXQgYXR0cmlidXRlcyB0byBmaXhlZCBsb2NhdGlvbnNcbiAgICAgICAgY29uc3QgbG9jYXRpb25zID0ge307XG4gICAgICAgIGZvciAoY29uc3QgYXR0ciBpbiBhdHRycykge1xuICAgICAgICAgICAgaWYgKGF0dHJzLmhhc093blByb3BlcnR5KGF0dHIpKSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgc2VtYW50aWMgPSBhdHRyc1thdHRyXTtcbiAgICAgICAgICAgICAgICBjb25zdCBsb2MgPSBzZW1hbnRpY1RvTG9jYXRpb25bc2VtYW50aWNdO1xuICAgICAgICAgICAgICAgIERlYnVnLmFzc2VydCghbG9jYXRpb25zLmhhc093blByb3BlcnR5KGxvYyksIGBXQVJOSU5HOiBUd28gYXR0cmlidXRlcyBhcmUgbWFwcGVkIHRvIHRoZSBzYW1lIGxvY2F0aW9uIGluIGEgc2hhZGVyOiAke2xvY2F0aW9uc1tsb2NdfSBhbmQgJHthdHRyfWApO1xuXG4gICAgICAgICAgICAgICAgbG9jYXRpb25zW2xvY10gPSBhdHRyO1xuICAgICAgICAgICAgICAgIGdsLmJpbmRBdHRyaWJMb2NhdGlvbihnbFByb2dyYW0sIGxvYywgYXR0cik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBnbC5saW5rUHJvZ3JhbShnbFByb2dyYW0pO1xuXG4gICAgICAgIERlYnVnLmNhbGwoKCkgPT4ge1xuICAgICAgICAgICAgdGhpcy5jb21waWxlRHVyYXRpb24gPSBub3coKSAtIHN0YXJ0VGltZTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gI2lmIF9QUk9GSUxFUlxuICAgICAgICBkZXZpY2UuX3NoYWRlclN0YXRzLmxpbmtlZCsrO1xuICAgICAgICBpZiAoZGVmaW5pdGlvbi50YWcgPT09IFNIQURFUlRBR19NQVRFUklBTCkge1xuICAgICAgICAgICAgZGV2aWNlLl9zaGFkZXJTdGF0cy5tYXRlcmlhbFNoYWRlcnMrKztcbiAgICAgICAgfVxuICAgICAgICAvLyAjZW5kaWZcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDb21waWxlcyBhbiBpbmRpdmlkdWFsIHNoYWRlci5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuL3dlYmdsLWdyYXBoaWNzLWRldmljZS5qcycpLldlYmdsR3JhcGhpY3NEZXZpY2V9IGRldmljZSAtIFRoZSBncmFwaGljcyBkZXZpY2UuXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IHNyYyAtIFRoZSBzaGFkZXIgc291cmNlIGNvZGUuXG4gICAgICogQHBhcmFtIHtib29sZWFufSBpc1ZlcnRleFNoYWRlciAtIFRydWUgaWYgdGhlIHNoYWRlciBpcyBhIHZlcnRleCBzaGFkZXIsIGZhbHNlIGlmIGl0IGlzIGFcbiAgICAgKiBmcmFnbWVudCBzaGFkZXIuXG4gICAgICogQHJldHVybnMge1dlYkdMU2hhZGVyfSBUaGUgY29tcGlsZWQgc2hhZGVyLlxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX2NvbXBpbGVTaGFkZXJTb3VyY2UoZGV2aWNlLCBzcmMsIGlzVmVydGV4U2hhZGVyKSB7XG4gICAgICAgIGNvbnN0IGdsID0gZGV2aWNlLmdsO1xuXG4gICAgICAgIC8vIGRldmljZSBjYWNoZSBmb3IgY3VycmVudCBkZXZpY2UsIGNvbnRhaW5pbmcgY2FjaGUgb2YgY29tcGlsZWQgc2hhZGVyc1xuICAgICAgICBjb25zdCBzaGFkZXJEZXZpY2VDYWNoZSA9IGlzVmVydGV4U2hhZGVyID8gX3ZlcnRleFNoYWRlckNhY2hlIDogX2ZyYWdtZW50U2hhZGVyQ2FjaGU7XG4gICAgICAgIGNvbnN0IHNoYWRlckNhY2hlID0gc2hhZGVyRGV2aWNlQ2FjaGUuZ2V0KGRldmljZSwgKCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBDb21waWxlZFNoYWRlckNhY2hlKCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIHRyeSB0byBnZXQgY29tcGlsZWQgc2hhZGVyIGZyb20gdGhlIGNhY2hlXG4gICAgICAgIGxldCBnbFNoYWRlciA9IHNoYWRlckNhY2hlLm1hcC5nZXQoc3JjKTtcblxuICAgICAgICBpZiAoIWdsU2hhZGVyKSB7XG4gICAgICAgICAgICAvLyAjaWYgX1BST0ZJTEVSXG4gICAgICAgICAgICBjb25zdCBzdGFydFRpbWUgPSBub3coKTtcbiAgICAgICAgICAgIGRldmljZS5maXJlKCdzaGFkZXI6Y29tcGlsZTpzdGFydCcsIHtcbiAgICAgICAgICAgICAgICB0aW1lc3RhbXA6IHN0YXJ0VGltZSxcbiAgICAgICAgICAgICAgICB0YXJnZXQ6IGRldmljZVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAvLyAjZW5kaWZcblxuICAgICAgICAgICAgZ2xTaGFkZXIgPSBnbC5jcmVhdGVTaGFkZXIoaXNWZXJ0ZXhTaGFkZXIgPyBnbC5WRVJURVhfU0hBREVSIDogZ2wuRlJBR01FTlRfU0hBREVSKTtcblxuICAgICAgICAgICAgLy8gaWYgdGhlIGRldmljZSBpcyBsb3N0LCBzaWxlbnRseSBpZ25vcmVcbiAgICAgICAgICAgIGlmICghZ2xTaGFkZXIgJiYgZ2wuaXNDb250ZXh0TG9zdCgpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGdsU2hhZGVyO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBnbC5zaGFkZXJTb3VyY2UoZ2xTaGFkZXIsIHNyYyk7XG4gICAgICAgICAgICBnbC5jb21waWxlU2hhZGVyKGdsU2hhZGVyKTtcblxuICAgICAgICAgICAgc2hhZGVyQ2FjaGUubWFwLnNldChzcmMsIGdsU2hhZGVyKTtcblxuICAgICAgICAgICAgLy8gI2lmIF9QUk9GSUxFUlxuICAgICAgICAgICAgY29uc3QgZW5kVGltZSA9IG5vdygpO1xuICAgICAgICAgICAgZGV2aWNlLmZpcmUoJ3NoYWRlcjpjb21waWxlOmVuZCcsIHtcbiAgICAgICAgICAgICAgICB0aW1lc3RhbXA6IGVuZFRpbWUsXG4gICAgICAgICAgICAgICAgdGFyZ2V0OiBkZXZpY2VcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgZGV2aWNlLl9zaGFkZXJTdGF0cy5jb21waWxlVGltZSArPSBlbmRUaW1lIC0gc3RhcnRUaW1lO1xuXG4gICAgICAgICAgICBpZiAoaXNWZXJ0ZXhTaGFkZXIpIHtcbiAgICAgICAgICAgICAgICBkZXZpY2UuX3NoYWRlclN0YXRzLnZzQ29tcGlsZWQrKztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZGV2aWNlLl9zaGFkZXJTdGF0cy5mc0NvbXBpbGVkKys7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyAjZW5kaWZcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBnbFNoYWRlcjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBMaW5rIHRoZSBzaGFkZXIsIGFuZCBleHRyYWN0IGl0cyBhdHRyaWJ1dGVzIGFuZCB1bmlmb3JtIGluZm9ybWF0aW9uLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4vd2ViZ2wtZ3JhcGhpY3MtZGV2aWNlLmpzJykuV2ViZ2xHcmFwaGljc0RldmljZX0gZGV2aWNlIC0gVGhlIGdyYXBoaWNzIGRldmljZS5cbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi4vc2hhZGVyLmpzJykuU2hhZGVyfSBzaGFkZXIgLSBUaGUgc2hhZGVyIHRvIHF1ZXJ5LlxuICAgICAqIEByZXR1cm5zIHtib29sZWFufSBUcnVlIGlmIHRoZSBzaGFkZXIgd2FzIHN1Y2Nlc3NmdWxseSBxdWVyaWVkIGFuZCBmYWxzZSBvdGhlcndpc2UuXG4gICAgICovXG4gICAgZmluYWxpemUoZGV2aWNlLCBzaGFkZXIpIHtcblxuICAgICAgICAvLyBpZiB0aGUgZGV2aWNlIGlzIGxvc3QsIHNpbGVudGx5IGlnbm9yZVxuICAgICAgICBjb25zdCBnbCA9IGRldmljZS5nbDtcbiAgICAgICAgaWYgKGdsLmlzQ29udGV4dExvc3QoKSkge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBpZiB0aGUgcHJvZ3JhbSB3YXNuJ3QgbGlua2VkIHlldCAoc2hhZGVyIHdhcyBub3QgY3JlYXRlZCBpbiBiYXRjaClcbiAgICAgICAgaWYgKCF0aGlzLmdsUHJvZ3JhbSlcbiAgICAgICAgICAgIHRoaXMubGluayhkZXZpY2UsIHNoYWRlcik7XG5cbiAgICAgICAgY29uc3QgZ2xQcm9ncmFtID0gdGhpcy5nbFByb2dyYW07XG4gICAgICAgIGNvbnN0IGRlZmluaXRpb24gPSBzaGFkZXIuZGVmaW5pdGlvbjtcblxuICAgICAgICAvLyAjaWYgX1BST0ZJTEVSXG4gICAgICAgIGNvbnN0IHN0YXJ0VGltZSA9IG5vdygpO1xuICAgICAgICBkZXZpY2UuZmlyZSgnc2hhZGVyOmxpbms6c3RhcnQnLCB7XG4gICAgICAgICAgICB0aW1lc3RhbXA6IHN0YXJ0VGltZSxcbiAgICAgICAgICAgIHRhcmdldDogZGV2aWNlXG4gICAgICAgIH0pO1xuICAgICAgICAvLyAjZW5kaWZcblxuICAgICAgICAvLyB0aGlzIGlzIHRoZSBtYWluIHRoZWFkIGJsb2NraW5nIHBhcnQgb2YgdGhlIHNoYWRlciBjb21waWxhdGlvbiwgdGltZSBpdFxuICAgICAgICBsZXQgbGlua1N0YXJ0VGltZSA9IDA7XG4gICAgICAgIERlYnVnLmNhbGwoKCkgPT4ge1xuICAgICAgICAgICAgbGlua1N0YXJ0VGltZSA9IG5vdygpO1xuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCBsaW5rU3RhdHVzID0gZ2wuZ2V0UHJvZ3JhbVBhcmFtZXRlcihnbFByb2dyYW0sIGdsLkxJTktfU1RBVFVTKTtcbiAgICAgICAgaWYgKCFsaW5rU3RhdHVzKSB7XG5cbiAgICAgICAgICAgIC8vIENoZWNrIGZvciBjb21waWxhdGlvbiBlcnJvcnNcbiAgICAgICAgICAgIGlmICghdGhpcy5faXNDb21waWxlZChkZXZpY2UsIHNoYWRlciwgdGhpcy5nbFZlcnRleFNoYWRlciwgZGVmaW5pdGlvbi52c2hhZGVyLCBcInZlcnRleFwiKSlcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG5cbiAgICAgICAgICAgIGlmICghdGhpcy5faXNDb21waWxlZChkZXZpY2UsIHNoYWRlciwgdGhpcy5nbEZyYWdtZW50U2hhZGVyLCBkZWZpbml0aW9uLmZzaGFkZXIsIFwiZnJhZ21lbnRcIikpXG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuXG4gICAgICAgICAgICBjb25zdCBtZXNzYWdlID0gXCJGYWlsZWQgdG8gbGluayBzaGFkZXIgcHJvZ3JhbS4gRXJyb3I6IFwiICsgZ2wuZ2V0UHJvZ3JhbUluZm9Mb2coZ2xQcm9ncmFtKTtcblxuICAgICAgICAgICAgLy8gI2lmIF9ERUJVR1xuXG4gICAgICAgICAgICAvLyBsb2cgdHJhbnNsYXRlZCBzaGFkZXJzXG4gICAgICAgICAgICBkZWZpbml0aW9uLnRyYW5zbGF0ZWRGcmFnID0gZ2wuZ2V0RXh0ZW5zaW9uKCdXRUJHTF9kZWJ1Z19zaGFkZXJzJyk/LmdldFRyYW5zbGF0ZWRTaGFkZXJTb3VyY2UodGhpcy5nbEZyYWdtZW50U2hhZGVyKTtcbiAgICAgICAgICAgIGRlZmluaXRpb24udHJhbnNsYXRlZFZlcnQgPSBnbC5nZXRFeHRlbnNpb24oJ1dFQkdMX2RlYnVnX3NoYWRlcnMnKT8uZ2V0VHJhbnNsYXRlZFNoYWRlclNvdXJjZSh0aGlzLmdsVmVydGV4U2hhZGVyKTtcblxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihtZXNzYWdlLCBkZWZpbml0aW9uKTtcbiAgICAgICAgICAgIC8vICNlbHNlXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKG1lc3NhZ2UpO1xuICAgICAgICAgICAgLy8gI2VuZGlmXG5cbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFF1ZXJ5IHRoZSBwcm9ncmFtIGZvciBlYWNoIHZlcnRleCBidWZmZXIgaW5wdXQgKEdMU0wgJ2F0dHJpYnV0ZScpXG4gICAgICAgIGxldCBpID0gMDtcbiAgICAgICAgY29uc3QgbnVtQXR0cmlidXRlcyA9IGdsLmdldFByb2dyYW1QYXJhbWV0ZXIoZ2xQcm9ncmFtLCBnbC5BQ1RJVkVfQVRUUklCVVRFUyk7XG4gICAgICAgIHdoaWxlIChpIDwgbnVtQXR0cmlidXRlcykge1xuICAgICAgICAgICAgY29uc3QgaW5mbyA9IGdsLmdldEFjdGl2ZUF0dHJpYihnbFByb2dyYW0sIGkrKyk7XG4gICAgICAgICAgICBjb25zdCBsb2NhdGlvbiA9IGdsLmdldEF0dHJpYkxvY2F0aW9uKGdsUHJvZ3JhbSwgaW5mby5uYW1lKTtcblxuICAgICAgICAgICAgLy8gYSBidWlsdC1pbiBhdHRyaWJ1dGVzIGZvciB3aGljaCB3ZSBkbyBub3QgbmVlZCB0byBwcm92aWRlIGFueSBkYXRhXG4gICAgICAgICAgICBpZiAoX3ZlcnRleFNoYWRlckJ1aWx0aW5zLmluZGV4T2YoaW5mby5uYW1lKSAhPT0gLTEpXG4gICAgICAgICAgICAgICAgY29udGludWU7XG5cbiAgICAgICAgICAgIC8vIENoZWNrIGF0dHJpYnV0ZXMgYXJlIGNvcnJlY3RseSBsaW5rZWQgdXBcbiAgICAgICAgICAgIGlmIChkZWZpbml0aW9uLmF0dHJpYnV0ZXNbaW5mby5uYW1lXSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgVmVydGV4IHNoYWRlciBhdHRyaWJ1dGUgXCIke2luZm8ubmFtZX1cIiBpcyBub3QgbWFwcGVkIHRvIGEgc2VtYW50aWMgaW4gc2hhZGVyIGRlZmluaXRpb24sIHNoYWRlciBbJHtzaGFkZXIubGFiZWx9XWAsIHNoYWRlcik7XG4gICAgICAgICAgICAgICAgc2hhZGVyLmZhaWxlZCA9IHRydWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IHNoYWRlcklucHV0ID0gbmV3IFdlYmdsU2hhZGVySW5wdXQoZGV2aWNlLCBkZWZpbml0aW9uLmF0dHJpYnV0ZXNbaW5mby5uYW1lXSwgZGV2aWNlLnBjVW5pZm9ybVR5cGVbaW5mby50eXBlXSwgbG9jYXRpb24pO1xuXG4gICAgICAgICAgICB0aGlzLmF0dHJpYnV0ZXMucHVzaChzaGFkZXJJbnB1dCk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBRdWVyeSB0aGUgcHJvZ3JhbSBmb3IgZWFjaCBzaGFkZXIgc3RhdGUgKEdMU0wgJ3VuaWZvcm0nKVxuICAgICAgICBpID0gMDtcbiAgICAgICAgY29uc3QgbnVtVW5pZm9ybXMgPSBnbC5nZXRQcm9ncmFtUGFyYW1ldGVyKGdsUHJvZ3JhbSwgZ2wuQUNUSVZFX1VOSUZPUk1TKTtcbiAgICAgICAgd2hpbGUgKGkgPCBudW1Vbmlmb3Jtcykge1xuICAgICAgICAgICAgY29uc3QgaW5mbyA9IGdsLmdldEFjdGl2ZVVuaWZvcm0oZ2xQcm9ncmFtLCBpKyspO1xuICAgICAgICAgICAgY29uc3QgbG9jYXRpb24gPSBnbC5nZXRVbmlmb3JtTG9jYXRpb24oZ2xQcm9ncmFtLCBpbmZvLm5hbWUpO1xuXG4gICAgICAgICAgICBjb25zdCBzaGFkZXJJbnB1dCA9IG5ldyBXZWJnbFNoYWRlcklucHV0KGRldmljZSwgaW5mby5uYW1lLCBkZXZpY2UucGNVbmlmb3JtVHlwZVtpbmZvLnR5cGVdLCBsb2NhdGlvbik7XG5cbiAgICAgICAgICAgIGlmIChpbmZvLnR5cGUgPT09IGdsLlNBTVBMRVJfMkQgfHwgaW5mby50eXBlID09PSBnbC5TQU1QTEVSX0NVQkUgfHxcbiAgICAgICAgICAgICAgICAoZGV2aWNlLndlYmdsMiAmJiAoaW5mby50eXBlID09PSBnbC5TQU1QTEVSXzJEX1NIQURPVyB8fCBpbmZvLnR5cGUgPT09IGdsLlNBTVBMRVJfQ1VCRV9TSEFET1cgfHwgaW5mby50eXBlID09PSBnbC5TQU1QTEVSXzNEKSlcbiAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgIHRoaXMuc2FtcGxlcnMucHVzaChzaGFkZXJJbnB1dCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMudW5pZm9ybXMucHVzaChzaGFkZXJJbnB1dCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBzaGFkZXIucmVhZHkgPSB0cnVlO1xuXG4gICAgICAgIC8vICNpZiBfUFJPRklMRVJcbiAgICAgICAgY29uc3QgZW5kVGltZSA9IG5vdygpO1xuICAgICAgICBkZXZpY2UuZmlyZSgnc2hhZGVyOmxpbms6ZW5kJywge1xuICAgICAgICAgICAgdGltZXN0YW1wOiBlbmRUaW1lLFxuICAgICAgICAgICAgdGFyZ2V0OiBkZXZpY2VcbiAgICAgICAgfSk7XG4gICAgICAgIGRldmljZS5fc2hhZGVyU3RhdHMuY29tcGlsZVRpbWUgKz0gZW5kVGltZSAtIHN0YXJ0VGltZTtcbiAgICAgICAgLy8gI2VuZGlmXG5cbiAgICAgICAgRGVidWcuY2FsbCgoKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBkdXJhdGlvbiA9IG5vdygpIC0gbGlua1N0YXJ0VGltZTtcbiAgICAgICAgICAgIHRoaXMuY29tcGlsZUR1cmF0aW9uICs9IGR1cmF0aW9uO1xuICAgICAgICAgICAgX3RvdGFsQ29tcGlsZVRpbWUgKz0gdGhpcy5jb21waWxlRHVyYXRpb247XG4gICAgICAgICAgICBEZWJ1Zy50cmFjZShUUkFDRUlEX1NIQURFUl9DT01QSUxFLCBgW2lkOiAke3NoYWRlci5pZH1dICR7c2hhZGVyLm5hbWV9OiAke3RoaXMuY29tcGlsZUR1cmF0aW9uLnRvRml4ZWQoMSl9bXMsIFRPVEFMOiAke190b3RhbENvbXBpbGVUaW1lLnRvRml4ZWQoMSl9bXNgKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ2hlY2sgdGhlIGNvbXBpbGF0aW9uIHN0YXR1cyBvZiBhIHNoYWRlci5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuL3dlYmdsLWdyYXBoaWNzLWRldmljZS5qcycpLldlYmdsR3JhcGhpY3NEZXZpY2V9IGRldmljZSAtIFRoZSBncmFwaGljcyBkZXZpY2UuXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4uL3NoYWRlci5qcycpLlNoYWRlcn0gc2hhZGVyIC0gVGhlIHNoYWRlciB0byBxdWVyeS5cbiAgICAgKiBAcGFyYW0ge1dlYkdMU2hhZGVyfSBnbFNoYWRlciAtIFRoZSBXZWJHTCBzaGFkZXIuXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IHNvdXJjZSAtIFRoZSBzaGFkZXIgc291cmNlIGNvZGUuXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IHNoYWRlclR5cGUgLSBUaGUgc2hhZGVyIHR5cGUuIENhbiBiZSAndmVydGV4JyBvciAnZnJhZ21lbnQnLlxuICAgICAqIEByZXR1cm5zIHtib29sZWFufSBUcnVlIGlmIHRoZSBzaGFkZXIgY29tcGlsZWQgc3VjY2Vzc2Z1bGx5LCBmYWxzZSBvdGhlcndpc2UuXG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfaXNDb21waWxlZChkZXZpY2UsIHNoYWRlciwgZ2xTaGFkZXIsIHNvdXJjZSwgc2hhZGVyVHlwZSkge1xuICAgICAgICBjb25zdCBnbCA9IGRldmljZS5nbDtcblxuICAgICAgICBpZiAoIWdsLmdldFNoYWRlclBhcmFtZXRlcihnbFNoYWRlciwgZ2wuQ09NUElMRV9TVEFUVVMpKSB7XG4gICAgICAgICAgICBjb25zdCBpbmZvTG9nID0gZ2wuZ2V0U2hhZGVySW5mb0xvZyhnbFNoYWRlcik7XG4gICAgICAgICAgICBjb25zdCBbY29kZSwgZXJyb3JdID0gdGhpcy5fcHJvY2Vzc0Vycm9yKHNvdXJjZSwgaW5mb0xvZyk7XG4gICAgICAgICAgICBjb25zdCBtZXNzYWdlID0gYEZhaWxlZCB0byBjb21waWxlICR7c2hhZGVyVHlwZX0gc2hhZGVyOlxcblxcbiR7aW5mb0xvZ31cXG4ke2NvZGV9YDtcbiAgICAgICAgICAgIC8vICNpZiBfREVCVUdcbiAgICAgICAgICAgIGVycm9yLnNoYWRlciA9IHNoYWRlcjtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IobWVzc2FnZSwgZXJyb3IpO1xuICAgICAgICAgICAgLy8gI2Vsc2VcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IobWVzc2FnZSk7XG4gICAgICAgICAgICAvLyAjZW5kaWZcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUcnVuY2F0ZSB0aGUgV2ViR0wgc2hhZGVyIGNvbXBpbGF0aW9uIGxvZyB0byBqdXN0IGluY2x1ZGUgdGhlIGVycm9yIGxpbmUgcGx1cyB0aGUgNSBsaW5lc1xuICAgICAqIGJlZm9yZSBhbmQgYWZ0ZXIgaXQuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gc3JjIC0gVGhlIHNoYWRlciBzb3VyY2UgY29kZS5cbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gaW5mb0xvZyAtIFRoZSBpbmZvIGxvZyByZXR1cm5lZCBmcm9tIFdlYkdMIG9uIGEgZmFpbGVkIHNoYWRlciBjb21waWxhdGlvbi5cbiAgICAgKiBAcmV0dXJucyB7QXJyYXl9IEFuIGFycmF5IHdoZXJlIHRoZSBmaXJzdCBlbGVtZW50IGlzIHRoZSAxMCBsaW5lcyBvZiBjb2RlIGFyb3VuZCB0aGUgZmlyc3RcbiAgICAgKiBkZXRlY3RlZCBlcnJvciwgYW5kIHRoZSBzZWNvbmQgZWxlbWVudCBhbiBvYmplY3Qgc3RvcmluZyB0aGUgZXJyb3IgbWVzc2FnZSwgbGluZSBudW1iZXIgYW5kXG4gICAgICogY29tcGxldGUgc2hhZGVyIHNvdXJjZS5cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9wcm9jZXNzRXJyb3Ioc3JjLCBpbmZvTG9nKSB7XG4gICAgICAgIGNvbnN0IGVycm9yID0geyB9O1xuICAgICAgICBsZXQgY29kZSA9ICcnO1xuXG4gICAgICAgIGlmIChzcmMpIHtcbiAgICAgICAgICAgIGNvbnN0IGxpbmVzID0gc3JjLnNwbGl0KCdcXG4nKTtcbiAgICAgICAgICAgIGxldCBmcm9tID0gMDtcbiAgICAgICAgICAgIGxldCB0byA9IGxpbmVzLmxlbmd0aDtcblxuICAgICAgICAgICAgLy8gaWYgZXJyb3IgaXMgaW4gdGhlIGNvZGUsIG9ubHkgc2hvdyBuZWFyYnkgbGluZXMgaW5zdGVhZCBvZiB3aG9sZSBzaGFkZXIgY29kZVxuICAgICAgICAgICAgaWYgKGluZm9Mb2cgJiYgaW5mb0xvZy5zdGFydHNXaXRoKCdFUlJPUjonKSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IG1hdGNoID0gaW5mb0xvZy5tYXRjaCgvXkVSUk9SOlxccyhbMC05XSspOihbMC05XSspOlxccyooLispLyk7XG4gICAgICAgICAgICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgICAgICAgICAgICAgIGVycm9yLm1lc3NhZ2UgPSBtYXRjaFszXTtcbiAgICAgICAgICAgICAgICAgICAgZXJyb3IubGluZSA9IHBhcnNlSW50KG1hdGNoWzJdLCAxMCk7XG5cbiAgICAgICAgICAgICAgICAgICAgZnJvbSA9IE1hdGgubWF4KDAsIGVycm9yLmxpbmUgLSA2KTtcbiAgICAgICAgICAgICAgICAgICAgdG8gPSBNYXRoLm1pbihsaW5lcy5sZW5ndGgsIGVycm9yLmxpbmUgKyA1KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIENocm9tZSByZXBvcnRzIHNoYWRlciBlcnJvcnMgb24gbGluZXMgaW5kZXhlZCBmcm9tIDFcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSBmcm9tOyBpIDwgdG87IGkrKykge1xuICAgICAgICAgICAgICAgIGNvZGUgKz0gKGkgKyAxKSArIFwiOlxcdFwiICsgbGluZXNbaV0gKyAnXFxuJztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZXJyb3Iuc291cmNlID0gc3JjO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIFtjb2RlLCBlcnJvcl07XG4gICAgfVxufVxuXG5leHBvcnQgeyBXZWJnbFNoYWRlciB9O1xuIl0sIm5hbWVzIjpbIl90b3RhbENvbXBpbGVUaW1lIiwiX3ZlcnRleFNoYWRlckJ1aWx0aW5zIiwiQ29tcGlsZWRTaGFkZXJDYWNoZSIsImNvbnN0cnVjdG9yIiwibWFwIiwiTWFwIiwiZGVzdHJveSIsImRldmljZSIsImZvckVhY2giLCJzaGFkZXIiLCJnbCIsImRlbGV0ZVNoYWRlciIsImxvc2VDb250ZXh0IiwiY2xlYXIiLCJTaGFkZXJCYXRjaENhY2hlIiwic2hhZGVycyIsIl92ZXJ0ZXhTaGFkZXJDYWNoZSIsIkRldmljZUNhY2hlIiwiX2ZyYWdtZW50U2hhZGVyQ2FjaGUiLCJfc2hhZGVyQmF0Y2hDYWNoZSIsIldlYmdsU2hhZGVyIiwiY29tcGlsZUR1cmF0aW9uIiwiaW5pdCIsImNvbXBpbGUiLCJnZXRCYXRjaFNoYWRlcnMiLCJwdXNoIiwiZ2xQcm9ncmFtIiwiZGVsZXRlUHJvZ3JhbSIsInVuaWZvcm1zIiwic2FtcGxlcnMiLCJhdHRyaWJ1dGVzIiwiZ2xWZXJ0ZXhTaGFkZXIiLCJnbEZyYWdtZW50U2hhZGVyIiwiYmF0Y2hDYWNoZSIsImdldCIsImVuZFNoYWRlckJhdGNoIiwiaW1wbCIsImxpbmsiLCJsZW5ndGgiLCJyZXN0b3JlQ29udGV4dCIsImRlZmluaXRpb24iLCJfY29tcGlsZVNoYWRlclNvdXJjZSIsInZzaGFkZXIiLCJmc2hhZGVyIiwiaXNDb250ZXh0TG9zdCIsInN0YXJ0VGltZSIsIkRlYnVnIiwiY2FsbCIsIm5vdyIsImNyZWF0ZVByb2dyYW0iLCJhdHRhY2hTaGFkZXIiLCJhdHRycyIsIndlYmdsMiIsInVzZVRyYW5zZm9ybUZlZWRiYWNrIiwib3V0TmFtZXMiLCJhdHRyIiwiaGFzT3duUHJvcGVydHkiLCJ0cmFuc2Zvcm1GZWVkYmFja1ZhcnlpbmdzIiwiSU5URVJMRUFWRURfQVRUUklCUyIsImxvY2F0aW9ucyIsInNlbWFudGljIiwibG9jIiwic2VtYW50aWNUb0xvY2F0aW9uIiwiYXNzZXJ0IiwiYmluZEF0dHJpYkxvY2F0aW9uIiwibGlua1Byb2dyYW0iLCJfc2hhZGVyU3RhdHMiLCJsaW5rZWQiLCJ0YWciLCJTSEFERVJUQUdfTUFURVJJQUwiLCJtYXRlcmlhbFNoYWRlcnMiLCJzcmMiLCJpc1ZlcnRleFNoYWRlciIsInNoYWRlckRldmljZUNhY2hlIiwic2hhZGVyQ2FjaGUiLCJnbFNoYWRlciIsImZpcmUiLCJ0aW1lc3RhbXAiLCJ0YXJnZXQiLCJjcmVhdGVTaGFkZXIiLCJWRVJURVhfU0hBREVSIiwiRlJBR01FTlRfU0hBREVSIiwic2hhZGVyU291cmNlIiwiY29tcGlsZVNoYWRlciIsInNldCIsImVuZFRpbWUiLCJjb21waWxlVGltZSIsInZzQ29tcGlsZWQiLCJmc0NvbXBpbGVkIiwiZmluYWxpemUiLCJsaW5rU3RhcnRUaW1lIiwibGlua1N0YXR1cyIsImdldFByb2dyYW1QYXJhbWV0ZXIiLCJMSU5LX1NUQVRVUyIsIl9nbCRnZXRFeHRlbnNpb24iLCJfZ2wkZ2V0RXh0ZW5zaW9uMiIsIl9pc0NvbXBpbGVkIiwibWVzc2FnZSIsImdldFByb2dyYW1JbmZvTG9nIiwidHJhbnNsYXRlZEZyYWciLCJnZXRFeHRlbnNpb24iLCJnZXRUcmFuc2xhdGVkU2hhZGVyU291cmNlIiwidHJhbnNsYXRlZFZlcnQiLCJjb25zb2xlIiwiZXJyb3IiLCJpIiwibnVtQXR0cmlidXRlcyIsIkFDVElWRV9BVFRSSUJVVEVTIiwiaW5mbyIsImdldEFjdGl2ZUF0dHJpYiIsImxvY2F0aW9uIiwiZ2V0QXR0cmliTG9jYXRpb24iLCJuYW1lIiwiaW5kZXhPZiIsInVuZGVmaW5lZCIsImxhYmVsIiwiZmFpbGVkIiwic2hhZGVySW5wdXQiLCJXZWJnbFNoYWRlcklucHV0IiwicGNVbmlmb3JtVHlwZSIsInR5cGUiLCJudW1Vbmlmb3JtcyIsIkFDVElWRV9VTklGT1JNUyIsImdldEFjdGl2ZVVuaWZvcm0iLCJnZXRVbmlmb3JtTG9jYXRpb24iLCJTQU1QTEVSXzJEIiwiU0FNUExFUl9DVUJFIiwiU0FNUExFUl8yRF9TSEFET1ciLCJTQU1QTEVSX0NVQkVfU0hBRE9XIiwiU0FNUExFUl8zRCIsInJlYWR5IiwiZHVyYXRpb24iLCJ0cmFjZSIsIlRSQUNFSURfU0hBREVSX0NPTVBJTEUiLCJpZCIsInRvRml4ZWQiLCJzb3VyY2UiLCJzaGFkZXJUeXBlIiwiZ2V0U2hhZGVyUGFyYW1ldGVyIiwiQ09NUElMRV9TVEFUVVMiLCJpbmZvTG9nIiwiZ2V0U2hhZGVySW5mb0xvZyIsImNvZGUiLCJfcHJvY2Vzc0Vycm9yIiwibGluZXMiLCJzcGxpdCIsImZyb20iLCJ0byIsInN0YXJ0c1dpdGgiLCJtYXRjaCIsImxpbmUiLCJwYXJzZUludCIsIk1hdGgiLCJtYXgiLCJtaW4iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFRQSxJQUFJQSxpQkFBaUIsR0FBRyxDQUFDLENBQUE7QUFFekIsTUFBTUMscUJBQXFCLEdBQUcsQ0FDMUIsYUFBYSxFQUNiLGVBQWUsRUFDZixXQUFXLEVBQ1gsZUFBZSxFQUNmLGlCQUFpQixDQUNwQixDQUFBOztBQUVEO0FBQ0EsTUFBTUMsbUJBQW1CLENBQUM7RUFBQUMsV0FBQSxHQUFBO0FBQ3RCO0FBQUEsSUFBQSxJQUFBLENBQ0FDLEdBQUcsR0FBRyxJQUFJQyxHQUFHLEVBQUUsQ0FBQTtBQUFBLEdBQUE7QUFFZjtFQUNBQyxPQUFPQSxDQUFDQyxNQUFNLEVBQUU7QUFDWixJQUFBLElBQUksQ0FBQ0gsR0FBRyxDQUFDSSxPQUFPLENBQUVDLE1BQU0sSUFB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
