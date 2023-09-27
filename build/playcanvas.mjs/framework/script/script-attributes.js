import { Debug } from '../../core/debug.js';
import { Color } from '../../core/math/color.js';
import { Curve } from '../../core/math/curve.js';
import { CurveSet } from '../../core/math/curve-set.js';
import { Vec2 } from '../../core/math/vec2.js';
import { Vec3 } from '../../core/math/vec3.js';
import { Vec4 } from '../../core/math/vec4.js';
import { GraphNode } from '../../scene/graph-node.js';
import { Asset } from '../asset/asset.js';

const components = ['x', 'y', 'z', 'w'];
const vecLookup = [undefined, undefined, Vec2, Vec3, Vec4];
function rawToValue(app, args, value, old) {
  switch (args.type) {
    case 'boolean':
      return !!value;
    case 'number':
      if (typeof value === 'number') {
        return value;
      } else if (typeof value === 'string') {
        const v = parseInt(value, 10);
        if (isNaN(v)) return null;
        return v;
      } else if (typeof value === 'boolean') {
        return 0 + value;
      }
      return null;
    case 'json':
      {
        const result = {};
        if (Array.isArray(args.schema)) {
          if (!value || typeof value !== 'object') {
            value = {};
          }
          for (let i = 0; i < args.schema.length; i++) {
            const field = args.schema[i];
            if (!field.name) continue;
            if (field.array) {
              result[field.name] = [];
              const arr = Array.isArray(value[field.name]) ? value[field.name] : [];
              for (let j = 0; j < arr.length; j++) {
                result[field.name].push(rawToValue(app, field, arr[j]));
              }
            } else {
              // use the value of the field as it's passed into rawToValue otherwise
              // use the default field value
              const val = value.hasOwnProperty(field.name) ? value[field.name] : field.default;
              result[field.name] = rawToValue(app, field, val);
            }
          }
        }
        return result;
      }
    case 'asset':
      if (value instanceof Asset) {
        return value;
      } else if (typeof value === 'number') {
        return app.assets.get(value) || null;
      } else if (typeof value === 'string') {
        return app.assets.get(parseInt(value, 10)) || null;
      }
      return null;
    case 'entity':
      if (value instanceof GraphNode) {
        return value;
      } else if (typeof value === 'string') {
        return app.getEntityFromIndex(value);
      }
      return null;
    case 'rgb':
    case 'rgba':
      if (value instanceof Color) {
        if (old instanceof Color) {
          old.copy(value);
          return old;
        }
        return value.clone();
      } else if (value instanceof Array && value.length >= 3 && value.length <= 4) {
        for (let i = 0; i < value.length; i++) {
          if (typeof value[i] !== 'number') return null;
        }
        if (!old) old = new Color();
        old.r = value[0];
        old.g = value[1];
        old.b = value[2];
        old.a = value.length === 3 ? 1 : value[3];
        return old;
      } else if (typeof value === 'string' && /#([0-9abcdef]{2}){3,4}/i.test(value)) {
        if (!old) old = new Color();
        old.fromString(value);
        return old;
      }
      return null;
    case 'vec2':
    case 'vec3':
    case 'vec4':
      {
        const len = parseInt(args.type.slice(3), 10);
        const vecType = vecLookup[len];
        if (value instanceof vecType) {
          if (old instanceof vecType) {
            old.copy(value);
            return old;
          }
          return value.clone();
        } else if (value instanceof Array && value.length === len) {
          for (let i = 0; i < value.length; i++) {
            if (typeof value[i] !== 'number') return null;
          }
          if (!old) old = new vecType();
          for (let i = 0; i < len; i++) old[components[i]] = value[i];
          return old;
        }
        return null;
      }
    case 'curve':
      if (value) {
        let curve;
        if (value instanceof Curve || value instanceof CurveSet) {
          curve = value.clone();
        } else {
          const CurveType = value.keys[0] instanceof Array ? CurveSet : Curve;
          curve = new CurveType(value.keys);
          curve.type = value.type;
        }
        return curve;
      }
      break;
  }
  return value;
}

/**
 * Container of Script Attribute definitions. Implements an interface to add/remove attributes and
 * store their definition for a {@link ScriptType}. Note: An instance of ScriptAttributes is
 * created automatically by each {@link ScriptType}.
 */
class ScriptAttributes {
  /**
   * Create a new ScriptAttributes instance.
   *
   * @param {Class<import('./script-type.js').ScriptType>} scriptType - Script Type that attributes relate to.
   */
  constructor(scriptType) {
    this.scriptType = scriptType;
    this.index = {};
  }
  /**
   * Add Attribute.
   *
   * @param {string} name - Name of an attribute.
   * @param {object} args - Object with Arguments for an attribute.
   * @param {("boolean"|"number"|"string"|"json"|"asset"|"entity"|"rgb"|"rgba"|"vec2"|"vec3"|"vec4"|"curve")} args.type - Type
   * of an attribute value.  Can be:
   *
   * - "asset"
   * - "boolean"
   * - "curve"
   * - "entity"
   * - "json"
   * - "number"
   * - "rgb"
   * - "rgba"
   * - "string"
   * - "vec2"
   * - "vec3"
   * - "vec4"
   *
   * @param {*} [args.default] - Default attribute value.
   * @param {string} [args.title] - Title for Editor's for field UI.
   * @param {string} [args.description] - Description for Editor's for field UI.
   * @param {string|string[]} [args.placeholder] - Placeholder for Editor's for field UI.
   * For multi-field types, such as vec2, vec3, and others use array of strings.
   * @param {boolean} [args.array] - If attribute can hold single or multiple values.
   * @param {number} [args.size] - If attribute is array, maximum number of values can be set.
   * @param {number} [args.min] - Minimum value for type 'number', if max and min defined, slider
   * will be rendered in Editor's UI.
   * @param {number} [args.max] - Maximum value for type 'number', if max and min defined, slider
   * will be rendered in Editor's UI.
   * @param {number} [args.precision] - Level of precision for field type 'number' with floating
   * values.
   * @param {number} [args.step] - Step value for type 'number'. The amount used to increment the
   * value when using the arrow keys in the Editor's UI.
   * @param {string} [args.assetType] - Name of asset type to be used in 'asset' type attribute
   * picker in Editor's UI, defaults to '*' (all).
   * @param {string[]} [args.curves] - List of names for Curves for field type 'curve'.
   * @param {string} [args.color] - String of color channels for Curves for field type 'curve',
   * can be any combination of `rgba` characters. Defining this property will render Gradient in
   * Editor's field UI.
   * @param {object[]} [args.enum] - List of fixed choices for field, defined as array of objects,
   * where key in object is a title of an option.
   * @param {object[]} [args.schema] - List of attributes for type 'json'. Each attribute
   * description is an object with the same properties as regular script attributes but with an
   * added 'name' field to specify the name of each attribute in the JSON.
   * @example
   * PlayerController.attributes.add('fullName', {
   *     type: 'string'
   * });
   * @example
   * PlayerController.attributes.add('speed', {
   *     type: 'number',
   *     title: 'Speed',
   *     placeholder: 'km/h',
   *     default: 22.2
   * });
   * @example
   * PlayerController.attributes.add('resolution', {
   *     type: 'number',
   *     default: 32,
   *     enum: [
   *         { '32x32': 32 },
   *         { '64x64': 64 },
   *         { '128x128': 128 }
   *     ]
   * });
   * @example
   * PlayerController.attributes.add('config', {
   *     type: 'json',
   *     schema: [{
   *         name: 'speed',
   *         type: 'number',
   *         title: 'Speed',
   *         placeholder: 'km/h',
   *         default: 22.2
   *     }, {
   *         name: 'resolution',
   *         type: 'number',
   *         default: 32,
   *         enum: [
   *             { '32x32': 32 },
   *             { '64x64': 64 },
   *             { '128x128': 128 }
   *         ]
   *     }]
   * });
   */
  add(name, args) {
    if (this.index[name]) {
      Debug.warn(`attribute '${name}' is already defined for script type '${this.scriptType.name}'`);
      return;
    } else if (ScriptAttributes.reservedNames.has(name)) {
      Debug.warn(`attribute '${name}' is a reserved attribute name`);
      return;
    }
    this.index[name] = args;
    Object.defineProperty(this.scriptType.prototype, name, {
      get: function () {
        return this.__attributes[name];
      },
      set: function (raw) {
        const evt = 'attr';
        const evtName = 'attr:' + name;
        const old = this.__attributes[name];
        // keep copy of old for the event below
        let oldCopy = old;
        // json types might have a 'clone' field in their
        // schema so make sure it's not that
        // entities should not be cloned as well
        if (old && args.type !== 'json' && args.type !== 'entity' && old.clone) {
          // check if an event handler is there
          // before cloning for performance
          if (this.hasEvent(evt) || this.hasEvent(evtName)) {
            oldCopy = old.clone();
          }
        }

        // convert to appropriate type
        if (args.array) {
          this.__attributes[name] = [];
          if (raw) {
            for (let i = 0, len = raw.length; i < len; i++) {
              this.__attributes[name].push(rawToValue(this.app, args, raw[i], old ? old[i] : null));
            }
          }
        } else {
          this.__attributes[name] = rawToValue(this.app, args, raw, old);
        }
        this.fire(evt, name, this.__attributes[name], oldCopy);
        this.fire(evtName, this.__attributes[name], oldCopy);
      }
    });
  }

  /**
   * Remove Attribute.
   *
   * @param {string} name - Name of an attribute.
   * @returns {boolean} True if removed or false if not defined.
   * @example
   * PlayerController.attributes.remove('fullName');
   */
  remove(name) {
    if (!this.index[name]) return false;
    delete this.index[name];
    delete this.scriptType.prototype[name];
    return true;
  }

  /**
   * Detect if Attribute is added.
   *
   * @param {string} name - Name of an attribute.
   * @returns {boolean} True if Attribute is defined.
   * @example
   * if (PlayerController.attributes.has('fullName')) {
   *     // attribute fullName is defined
   * }
   */
  has(name) {
    return !!this.index[name];
  }

  /**
   * Get object with attribute arguments. Note: Changing argument properties will not affect
   * existing Script Instances.
   *
   * @param {string} name - Name of an attribute.
   * @returns {?object} Arguments with attribute properties.
   * @example
   * // changing default value for an attribute 'fullName'
   * var attr = PlayerController.attributes.get('fullName');
   * if (attr) attr.default = 'Unknown';
   */
  get(name) {
    return this.index[name] || null;
  }
}
ScriptAttributes.reservedNames = new Set(['app', 'entity', 'enabled', '_enabled', '_enabledOld', '_destroyed', '__attributes', '__attributesRaw', '__scriptType', '__executionOrder', '_callbacks', '_callbackActive', 'has', 'get', 'on', 'off', 'fire', 'once', 'hasEvent']);

export { ScriptAttributes };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NyaXB0LWF0dHJpYnV0ZXMuanMiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9mcmFtZXdvcmsvc2NyaXB0L3NjcmlwdC1hdHRyaWJ1dGVzLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IERlYnVnIH0gZnJvbSAnLi4vLi4vY29yZS9kZWJ1Zy5qcyc7XG5pbXBvcnQgeyBDb2xvciB9IGZyb20gJy4uLy4uL2NvcmUvbWF0aC9jb2xvci5qcyc7XG5pbXBvcnQgeyBDdXJ2ZSB9IGZyb20gJy4uLy4uL2NvcmUvbWF0aC9jdXJ2ZS5qcyc7XG5pbXBvcnQgeyBDdXJ2ZVNldCB9IGZyb20gJy4uLy4uL2NvcmUvbWF0aC9jdXJ2ZS1zZXQuanMnO1xuaW1wb3J0IHsgVmVjMiB9IGZyb20gJy4uLy4uL2NvcmUvbWF0aC92ZWMyLmpzJztcbmltcG9ydCB7IFZlYzMgfSBmcm9tICcuLi8uLi9jb3JlL21hdGgvdmVjMy5qcyc7XG5pbXBvcnQgeyBWZWM0IH0gZnJvbSAnLi4vLi4vY29yZS9tYXRoL3ZlYzQuanMnO1xuXG5pbXBvcnQgeyBHcmFwaE5vZGUgfSBmcm9tICcuLi8uLi9zY2VuZS9ncmFwaC1ub2RlLmpzJztcblxuaW1wb3J0IHsgQXNzZXQgfSBmcm9tICcuLi9hc3NldC9hc3NldC5qcyc7XG5cbmNvbnN0IGNvbXBvbmVudHMgPSBbJ3gnLCAneScsICd6JywgJ3cnXTtcbmNvbnN0IHZlY0xvb2t1cCA9IFt1bmRlZmluZWQsIHVuZGVmaW5lZCwgVmVjMiwgVmVjMywgVmVjNF07XG5cbmZ1bmN0aW9uIHJhd1RvVmFsdWUoYXBwLCBhcmdzLCB2YWx1ZSwgb2xkKSB7XG4gICAgc3dpdGNoIChhcmdzLnR5cGUpIHtcbiAgICAgICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICAgICAgICByZXR1cm4gISF2YWx1ZTtcbiAgICAgICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdiA9IHBhcnNlSW50KHZhbHVlLCAxMCk7XG4gICAgICAgICAgICAgICAgaWYgKGlzTmFOKHYpKSByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgICAgICByZXR1cm4gdjtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIHZhbHVlID09PSAnYm9vbGVhbicpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gMCArIHZhbHVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIGNhc2UgJ2pzb24nOiB7XG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSB7fTtcblxuICAgICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoYXJncy5zY2hlbWEpKSB7XG4gICAgICAgICAgICAgICAgaWYgKCF2YWx1ZSB8fCB0eXBlb2YgdmFsdWUgIT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhbHVlID0ge307XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhcmdzLnNjaGVtYS5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBmaWVsZCA9IGFyZ3Muc2NoZW1hW2ldO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIWZpZWxkLm5hbWUpIGNvbnRpbnVlO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChmaWVsZC5hcnJheSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0W2ZpZWxkLm5hbWVdID0gW107XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGFyciA9IEFycmF5LmlzQXJyYXkodmFsdWVbZmllbGQubmFtZV0pID8gdmFsdWVbZmllbGQubmFtZV0gOiBbXTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgaiA9IDA7IGogPCBhcnIubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXN1bHRbZmllbGQubmFtZV0ucHVzaChyYXdUb1ZhbHVlKGFwcCwgZmllbGQsIGFycltqXSkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gdXNlIHRoZSB2YWx1ZSBvZiB0aGUgZmllbGQgYXMgaXQncyBwYXNzZWQgaW50byByYXdUb1ZhbHVlIG90aGVyd2lzZVxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gdXNlIHRoZSBkZWZhdWx0IGZpZWxkIHZhbHVlXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB2YWwgPSB2YWx1ZS5oYXNPd25Qcm9wZXJ0eShmaWVsZC5uYW1lKSA/IHZhbHVlW2ZpZWxkLm5hbWVdIDogZmllbGQuZGVmYXVsdDtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdFtmaWVsZC5uYW1lXSA9IHJhd1RvVmFsdWUoYXBwLCBmaWVsZCwgdmFsKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgfVxuICAgICAgICBjYXNlICdhc3NldCc6XG4gICAgICAgICAgICBpZiAodmFsdWUgaW5zdGFuY2VvZiBBc3NldCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJykge1xuICAgICAgICAgICAgICAgIHJldHVybiBhcHAuYXNzZXRzLmdldCh2YWx1ZSkgfHwgbnVsbDtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgIHJldHVybiBhcHAuYXNzZXRzLmdldChwYXJzZUludCh2YWx1ZSwgMTApKSB8fCBudWxsO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIGNhc2UgJ2VudGl0eSc6XG4gICAgICAgICAgICBpZiAodmFsdWUgaW5zdGFuY2VvZiBHcmFwaE5vZGUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gYXBwLmdldEVudGl0eUZyb21JbmRleCh2YWx1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgY2FzZSAncmdiJzpcbiAgICAgICAgY2FzZSAncmdiYSc6XG4gICAgICAgICAgICBpZiAodmFsdWUgaW5zdGFuY2VvZiBDb2xvcikge1xuICAgICAgICAgICAgICAgIGlmIChvbGQgaW5zdGFuY2VvZiBDb2xvcikge1xuICAgICAgICAgICAgICAgICAgICBvbGQuY29weSh2YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBvbGQ7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiB2YWx1ZS5jbG9uZSgpO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh2YWx1ZSBpbnN0YW5jZW9mIEFycmF5ICYmIHZhbHVlLmxlbmd0aCA+PSAzICYmIHZhbHVlLmxlbmd0aCA8PSA0KSB7XG4gICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB2YWx1ZS5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlW2ldICE9PSAnbnVtYmVyJylcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoIW9sZCkgb2xkID0gbmV3IENvbG9yKCk7XG5cbiAgICAgICAgICAgICAgICBvbGQuciA9IHZhbHVlWzBdO1xuICAgICAgICAgICAgICAgIG9sZC5nID0gdmFsdWVbMV07XG4gICAgICAgICAgICAgICAgb2xkLmIgPSB2YWx1ZVsyXTtcbiAgICAgICAgICAgICAgICBvbGQuYSA9ICh2YWx1ZS5sZW5ndGggPT09IDMpID8gMSA6IHZhbHVlWzNdO1xuXG4gICAgICAgICAgICAgICAgcmV0dXJuIG9sZDtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyAmJiAvIyhbMC05YWJjZGVmXXsyfSl7Myw0fS9pLnRlc3QodmFsdWUpKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFvbGQpXG4gICAgICAgICAgICAgICAgICAgIG9sZCA9IG5ldyBDb2xvcigpO1xuXG4gICAgICAgICAgICAgICAgb2xkLmZyb21TdHJpbmcodmFsdWUpO1xuICAgICAgICAgICAgICAgIHJldHVybiBvbGQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgY2FzZSAndmVjMic6XG4gICAgICAgIGNhc2UgJ3ZlYzMnOlxuICAgICAgICBjYXNlICd2ZWM0Jzoge1xuICAgICAgICAgICAgY29uc3QgbGVuID0gcGFyc2VJbnQoYXJncy50eXBlLnNsaWNlKDMpLCAxMCk7XG4gICAgICAgICAgICBjb25zdCB2ZWNUeXBlID0gdmVjTG9va3VwW2xlbl07XG5cbiAgICAgICAgICAgIGlmICh2YWx1ZSBpbnN0YW5jZW9mIHZlY1R5cGUpIHtcbiAgICAgICAgICAgICAgICBpZiAob2xkIGluc3RhbmNlb2YgdmVjVHlwZSkge1xuICAgICAgICAgICAgICAgICAgICBvbGQuY29weSh2YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBvbGQ7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiB2YWx1ZS5jbG9uZSgpO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh2YWx1ZSBpbnN0YW5jZW9mIEFycmF5ICYmIHZhbHVlLmxlbmd0aCA9PT0gbGVuKSB7XG4gICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB2YWx1ZS5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlW2ldICE9PSAnbnVtYmVyJylcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoIW9sZCkgb2xkID0gbmV3IHZlY1R5cGUoKTtcblxuICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbGVuOyBpKyspXG4gICAgICAgICAgICAgICAgICAgIG9sZFtjb21wb25lbnRzW2ldXSA9IHZhbHVlW2ldO1xuXG4gICAgICAgICAgICAgICAgcmV0dXJuIG9sZDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG4gICAgICAgIGNhc2UgJ2N1cnZlJzpcbiAgICAgICAgICAgIGlmICh2YWx1ZSkge1xuICAgICAgICAgICAgICAgIGxldCBjdXJ2ZTtcbiAgICAgICAgICAgICAgICBpZiAodmFsdWUgaW5zdGFuY2VvZiBDdXJ2ZSB8fCB2YWx1ZSBpbnN0YW5jZW9mIEN1cnZlU2V0KSB7XG4gICAgICAgICAgICAgICAgICAgIGN1cnZlID0gdmFsdWUuY2xvbmUoKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBDdXJ2ZVR5cGUgPSB2YWx1ZS5rZXlzWzBdIGluc3RhbmNlb2YgQXJyYXkgPyBDdXJ2ZVNldCA6IEN1cnZlO1xuICAgICAgICAgICAgICAgICAgICBjdXJ2ZSA9IG5ldyBDdXJ2ZVR5cGUodmFsdWUua2V5cyk7XG4gICAgICAgICAgICAgICAgICAgIGN1cnZlLnR5cGUgPSB2YWx1ZS50eXBlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gY3VydmU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBicmVhaztcbiAgICB9XG5cbiAgICByZXR1cm4gdmFsdWU7XG59XG5cbi8qKlxuICogQ29udGFpbmVyIG9mIFNjcmlwdCBBdHRyaWJ1dGUgZGVmaW5pdGlvbnMuIEltcGxlbWVudHMgYW4gaW50ZXJmYWNlIHRvIGFkZC9yZW1vdmUgYXR0cmlidXRlcyBhbmRcbiAqIHN0b3JlIHRoZWlyIGRlZmluaXRpb24gZm9yIGEge0BsaW5rIFNjcmlwdFR5cGV9LiBOb3RlOiBBbiBpbnN0YW5jZSBvZiBTY3JpcHRBdHRyaWJ1dGVzIGlzXG4gKiBjcmVhdGVkIGF1dG9tYXRpY2FsbHkgYnkgZWFjaCB7QGxpbmsgU2NyaXB0VHlwZX0uXG4gKi9cbmNsYXNzIFNjcmlwdEF0dHJpYnV0ZXMge1xuICAgIC8qKlxuICAgICAqIENyZWF0ZSBhIG5ldyBTY3JpcHRBdHRyaWJ1dGVzIGluc3RhbmNlLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtDbGFzczxpbXBvcnQoJy4vc2NyaXB0LXR5cGUuanMnKS5TY3JpcHRUeXBlPn0gc2NyaXB0VHlwZSAtIFNjcmlwdCBUeXBlIHRoYXQgYXR0cmlidXRlcyByZWxhdGUgdG8uXG4gICAgICovXG4gICAgY29uc3RydWN0b3Ioc2NyaXB0VHlwZSkge1xuICAgICAgICB0aGlzLnNjcmlwdFR5cGUgPSBzY3JpcHRUeXBlO1xuICAgICAgICB0aGlzLmluZGV4ID0ge307XG4gICAgfVxuXG4gICAgc3RhdGljIHJlc2VydmVkTmFtZXMgPSBuZXcgU2V0KFtcbiAgICAgICAgJ2FwcCcsICdlbnRpdHknLCAnZW5hYmxlZCcsICdfZW5hYmxlZCcsICdfZW5hYmxlZE9sZCcsICdfZGVzdHJveWVkJyxcbiAgICAgICAgJ19fYXR0cmlidXRlcycsICdfX2F0dHJpYnV0ZXNSYXcnLCAnX19zY3JpcHRUeXBlJywgJ19fZXhlY3V0aW9uT3JkZXInLFxuICAgICAgICAnX2NhbGxiYWNrcycsICdfY2FsbGJhY2tBY3RpdmUnLCAnaGFzJywgJ2dldCcsICdvbicsICdvZmYnLCAnZmlyZScsICdvbmNlJywgJ2hhc0V2ZW50J1xuICAgIF0pO1xuXG4gICAgLyoqXG4gICAgICogQWRkIEF0dHJpYnV0ZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lIC0gTmFtZSBvZiBhbiBhdHRyaWJ1dGUuXG4gICAgICogQHBhcmFtIHtvYmplY3R9IGFyZ3MgLSBPYmplY3Qgd2l0aCBBcmd1bWVudHMgZm9yIGFuIGF0dHJpYnV0ZS5cbiAgICAgKiBAcGFyYW0geyhcImJvb2xlYW5cInxcIm51bWJlclwifFwic3RyaW5nXCJ8XCJqc29uXCJ8XCJhc3NldFwifFwiZW50aXR5XCJ8XCJyZ2JcInxcInJnYmFcInxcInZlYzJcInxcInZlYzNcInxcInZlYzRcInxcImN1cnZlXCIpfSBhcmdzLnR5cGUgLSBUeXBlXG4gICAgICogb2YgYW4gYXR0cmlidXRlIHZhbHVlLiAgQ2FuIGJlOlxuICAgICAqXG4gICAgICogLSBcImFzc2V0XCJcbiAgICAgKiAtIFwiYm9vbGVhblwiXG4gICAgICogLSBcImN1cnZlXCJcbiAgICAgKiAtIFwiZW50aXR5XCJcbiAgICAgKiAtIFwianNvblwiXG4gICAgICogLSBcIm51bWJlclwiXG4gICAgICogLSBcInJnYlwiXG4gICAgICogLSBcInJnYmFcIlxuICAgICAqIC0gXCJzdHJpbmdcIlxuICAgICAqIC0gXCJ2ZWMyXCJcbiAgICAgKiAtIFwidmVjM1wiXG4gICAgICogLSBcInZlYzRcIlxuICAgICAqXG4gICAgICogQHBhcmFtIHsqfSBbYXJncy5kZWZhdWx0XSAtIERlZmF1bHQgYXR0cmlidXRlIHZhbHVlLlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBbYXJncy50aXRsZV0gLSBUaXRsZSBmb3IgRWRpdG9yJ3MgZm9yIGZpZWxkIFVJLlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBbYXJncy5kZXNjcmlwdGlvbl0gLSBEZXNjcmlwdGlvbiBmb3IgRWRpdG9yJ3MgZm9yIGZpZWxkIFVJLlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfHN0cmluZ1tdfSBbYXJncy5wbGFjZWhvbGRlcl0gLSBQbGFjZWhvbGRlciBmb3IgRWRpdG9yJ3MgZm9yIGZpZWxkIFVJLlxuICAgICAqIEZvciBtdWx0aS1maWVsZCB0eXBlcywgc3VjaCBhcyB2ZWMyLCB2ZWMzLCBhbmQgb3RoZXJzIHVzZSBhcnJheSBvZiBzdHJpbmdzLlxuICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gW2FyZ3MuYXJyYXldIC0gSWYgYXR0cmlidXRlIGNhbiBob2xkIHNpbmdsZSBvciBtdWx0aXBsZSB2YWx1ZXMuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFthcmdzLnNpemVdIC0gSWYgYXR0cmlidXRlIGlzIGFycmF5LCBtYXhpbXVtIG51bWJlciBvZiB2YWx1ZXMgY2FuIGJlIHNldC5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gW2FyZ3MubWluXSAtIE1pbmltdW0gdmFsdWUgZm9yIHR5cGUgJ251bWJlcicsIGlmIG1heCBhbmQgbWluIGRlZmluZWQsIHNsaWRlclxuICAgICAqIHdpbGwgYmUgcmVuZGVyZWQgaW4gRWRpdG9yJ3MgVUkuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFthcmdzLm1heF0gLSBNYXhpbXVtIHZhbHVlIGZvciB0eXBlICdudW1iZXInLCBpZiBtYXggYW5kIG1pbiBkZWZpbmVkLCBzbGlkZXJcbiAgICAgKiB3aWxsIGJlIHJlbmRlcmVkIGluIEVkaXRvcidzIFVJLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBbYXJncy5wcmVjaXNpb25dIC0gTGV2ZWwgb2YgcHJlY2lzaW9uIGZvciBmaWVsZCB0eXBlICdudW1iZXInIHdpdGggZmxvYXRpbmdcbiAgICAgKiB2YWx1ZXMuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFthcmdzLnN0ZXBdIC0gU3RlcCB2YWx1ZSBmb3IgdHlwZSAnbnVtYmVyJy4gVGhlIGFtb3VudCB1c2VkIHRvIGluY3JlbWVudCB0aGVcbiAgICAgKiB2YWx1ZSB3aGVuIHVzaW5nIHRoZSBhcnJvdyBrZXlzIGluIHRoZSBFZGl0b3IncyBVSS5cbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gW2FyZ3MuYXNzZXRUeXBlXSAtIE5hbWUgb2YgYXNzZXQgdHlwZSB0byBiZSB1c2VkIGluICdhc3NldCcgdHlwZSBhdHRyaWJ1dGVcbiAgICAgKiBwaWNrZXIgaW4gRWRpdG9yJ3MgVUksIGRlZmF1bHRzIHRvICcqJyAoYWxsKS5cbiAgICAgKiBAcGFyYW0ge3N0cmluZ1tdfSBbYXJncy5jdXJ2ZXNdIC0gTGlzdCBvZiBuYW1lcyBmb3IgQ3VydmVzIGZvciBmaWVsZCB0eXBlICdjdXJ2ZScuXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IFthcmdzLmNvbG9yXSAtIFN0cmluZyBvZiBjb2xvciBjaGFubmVscyBmb3IgQ3VydmVzIGZvciBmaWVsZCB0eXBlICdjdXJ2ZScsXG4gICAgICogY2FuIGJlIGFueSBjb21iaW5hdGlvbiBvZiBgcmdiYWAgY2hhcmFjdGVycy4gRGVmaW5pbmcgdGhpcyBwcm9wZXJ0eSB3aWxsIHJlbmRlciBHcmFkaWVudCBpblxuICAgICAqIEVkaXRvcidzIGZpZWxkIFVJLlxuICAgICAqIEBwYXJhbSB7b2JqZWN0W119IFthcmdzLmVudW1dIC0gTGlzdCBvZiBmaXhlZCBjaG9pY2VzIGZvciBmaWVsZCwgZGVmaW5lZCBhcyBhcnJheSBvZiBvYmplY3RzLFxuICAgICAqIHdoZXJlIGtleSBpbiBvYmplY3QgaXMgYSB0aXRsZSBvZiBhbiBvcHRpb24uXG4gICAgICogQHBhcmFtIHtvYmplY3RbXX0gW2FyZ3Muc2NoZW1hXSAtIExpc3Qgb2YgYXR0cmlidXRlcyBmb3IgdHlwZSAnanNvbicuIEVhY2ggYXR0cmlidXRlXG4gICAgICogZGVzY3JpcHRpb24gaXMgYW4gb2JqZWN0IHdpdGggdGhlIHNhbWUgcHJvcGVydGllcyBhcyByZWd1bGFyIHNjcmlwdCBhdHRyaWJ1dGVzIGJ1dCB3aXRoIGFuXG4gICAgICogYWRkZWQgJ25hbWUnIGZpZWxkIHRvIHNwZWNpZnkgdGhlIG5hbWUgb2YgZWFjaCBhdHRyaWJ1dGUgaW4gdGhlIEpTT04uXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBQbGF5ZXJDb250cm9sbGVyLmF0dHJpYnV0ZXMuYWRkKCdmdWxsTmFtZScsIHtcbiAgICAgKiAgICAgdHlwZTogJ3N0cmluZydcbiAgICAgKiB9KTtcbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIFBsYXllckNvbnRyb2xsZXIuYXR0cmlidXRlcy5hZGQoJ3NwZWVkJywge1xuICAgICAqICAgICB0eXBlOiAnbnVtYmVyJyxcbiAgICAgKiAgICAgdGl0bGU6ICdTcGVlZCcsXG4gICAgICogICAgIHBsYWNlaG9sZGVyOiAna20vaCcsXG4gICAgICogICAgIGRlZmF1bHQ6IDIyLjJcbiAgICAgKiB9KTtcbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIFBsYXllckNvbnRyb2xsZXIuYXR0cmlidXRlcy5hZGQoJ3Jlc29sdXRpb24nLCB7XG4gICAgICogICAgIHR5cGU6ICdudW1iZXInLFxuICAgICAqICAgICBkZWZhdWx0OiAzMixcbiAgICAgKiAgICAgZW51bTogW1xuICAgICAqICAgICAgICAgeyAnMzJ4MzInOiAzMiB9LFxuICAgICAqICAgICAgICAgeyAnNjR4NjQnOiA2NCB9LFxuICAgICAqICAgICAgICAgeyAnMTI4eDEyOCc6IDEyOCB9XG4gICAgICogICAgIF1cbiAgICAgKiB9KTtcbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIFBsYXllckNvbnRyb2xsZXIuYXR0cmlidXRlcy5hZGQoJ2NvbmZpZycsIHtcbiAgICAgKiAgICAgdHlwZTogJ2pzb24nLFxuICAgICAqICAgICBzY2hlbWE6IFt7XG4gICAgICogICAgICAgICBuYW1lOiAnc3BlZWQnLFxuICAgICAqICAgICAgICAgdHlwZTogJ251bWJlcicsXG4gICAgICogICAgICAgICB0aXRsZTogJ1NwZWVkJyxcbiAgICAgKiAgICAgICAgIHBsYWNlaG9sZGVyOiAna20vaCcsXG4gICAgICogICAgICAgICBkZWZhdWx0OiAyMi4yXG4gICAgICogICAgIH0sIHtcbiAgICAgKiAgICAgICAgIG5hbWU6ICdyZXNvbHV0aW9uJyxcbiAgICAgKiAgICAgICAgIHR5cGU6ICdudW1iZXInLFxuICAgICAqICAgICAgICAgZGVmYXVsdDogMzIsXG4gICAgICogICAgICAgICBlbnVtOiBbXG4gICAgICogICAgICAgICAgICAgeyAnMzJ4MzInOiAzMiB9LFxuICAgICAqICAgICAgICAgICAgIHsgJzY0eDY0JzogNjQgfSxcbiAgICAgKiAgICAgICAgICAgICB7ICcxMjh4MTI4JzogMTI4IH1cbiAgICAgKiAgICAgICAgIF1cbiAgICAgKiAgICAgfV1cbiAgICAgKiB9KTtcbiAgICAgKi9cbiAgICBhZGQobmFtZSwgYXJncykge1xuICAgICAgICBpZiAodGhpcy5pbmRleFtuYW1lXSkge1xuICAgICAgICAgICAgRGVidWcud2FybihgYXR0cmlidXRlICcke25hbWV9JyBpcyBhbHJlYWR5IGRlZmluZWQgZm9yIHNjcmlwdCB0eXBlICcke3RoaXMuc2NyaXB0VHlwZS5uYW1lfSdgKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfSBlbHNlIGlmIChTY3JpcHRBdHRyaWJ1dGVzLnJlc2VydmVkTmFtZXMuaGFzKG5hbWUpKSB7XG4gICAgICAgICAgICBEZWJ1Zy53YXJuKGBhdHRyaWJ1dGUgJyR7bmFtZX0nIGlzIGEgcmVzZXJ2ZWQgYXR0cmlidXRlIG5hbWVgKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuaW5kZXhbbmFtZV0gPSBhcmdzO1xuXG4gICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh0aGlzLnNjcmlwdFR5cGUucHJvdG90eXBlLCBuYW1lLCB7XG4gICAgICAgICAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5fX2F0dHJpYnV0ZXNbbmFtZV07XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgc2V0OiBmdW5jdGlvbiAocmF3KSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZXZ0ID0gJ2F0dHInO1xuICAgICAgICAgICAgICAgIGNvbnN0IGV2dE5hbWUgPSAnYXR0cjonICsgbmFtZTtcblxuICAgICAgICAgICAgICAgIGNvbnN0IG9sZCA9IHRoaXMuX19hdHRyaWJ1dGVzW25hbWVdO1xuICAgICAgICAgICAgICAgIC8vIGtlZXAgY29weSBvZiBvbGQgZm9yIHRoZSBldmVudCBiZWxvd1xuICAgICAgICAgICAgICAgIGxldCBvbGRDb3B5ID0gb2xkO1xuICAgICAgICAgICAgICAgIC8vIGpzb24gdHlwZXMgbWlnaHQgaGF2ZSBhICdjbG9uZScgZmllbGQgaW4gdGhlaXJcbiAgICAgICAgICAgICAgICAvLyBzY2hlbWEgc28gbWFrZSBzdXJlIGl0J3Mgbm90IHRoYXRcbiAgICAgICAgICAgICAgICAvLyBlbnRpdGllcyBzaG91bGQgbm90IGJlIGNsb25lZCBhcyB3ZWxsXG4gICAgICAgICAgICAgICAgaWYgKG9sZCAmJiBhcmdzLnR5cGUgIT09ICdqc29uJyAmJiBhcmdzLnR5cGUgIT09ICdlbnRpdHknICYmIG9sZC5jbG9uZSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBjaGVjayBpZiBhbiBldmVudCBoYW5kbGVyIGlzIHRoZXJlXG4gICAgICAgICAgICAgICAgICAgIC8vIGJlZm9yZSBjbG9uaW5nIGZvciBwZXJmb3JtYW5jZVxuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5oYXNFdmVudChldnQpIHx8IHRoaXMuaGFzRXZlbnQoZXZ0TmFtZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG9sZENvcHkgPSBvbGQuY2xvbmUoKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIGNvbnZlcnQgdG8gYXBwcm9wcmlhdGUgdHlwZVxuICAgICAgICAgICAgICAgIGlmIChhcmdzLmFycmF5KSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX19hdHRyaWJ1dGVzW25hbWVdID0gW107XG4gICAgICAgICAgICAgICAgICAgIGlmIChyYXcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAwLCBsZW4gPSByYXcubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9fYXR0cmlidXRlc1tuYW1lXS5wdXNoKHJhd1RvVmFsdWUodGhpcy5hcHAsIGFyZ3MsIHJhd1tpXSwgb2xkID8gb2xkW2ldIDogbnVsbCkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fX2F0dHJpYnV0ZXNbbmFtZV0gPSByYXdUb1ZhbHVlKHRoaXMuYXBwLCBhcmdzLCByYXcsIG9sZCk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgdGhpcy5maXJlKGV2dCwgbmFtZSwgdGhpcy5fX2F0dHJpYnV0ZXNbbmFtZV0sIG9sZENvcHkpO1xuICAgICAgICAgICAgICAgIHRoaXMuZmlyZShldnROYW1lLCB0aGlzLl9fYXR0cmlidXRlc1tuYW1lXSwgb2xkQ29weSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJlbW92ZSBBdHRyaWJ1dGUuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gbmFtZSAtIE5hbWUgb2YgYW4gYXR0cmlidXRlLlxuICAgICAqIEByZXR1cm5zIHtib29sZWFufSBUcnVlIGlmIHJlbW92ZWQgb3IgZmFsc2UgaWYgbm90IGRlZmluZWQuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBQbGF5ZXJDb250cm9sbGVyLmF0dHJpYnV0ZXMucmVtb3ZlKCdmdWxsTmFtZScpO1xuICAgICAqL1xuICAgIHJlbW92ZShuYW1lKSB7XG4gICAgICAgIGlmICghdGhpcy5pbmRleFtuYW1lXSlcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcblxuICAgICAgICBkZWxldGUgdGhpcy5pbmRleFtuYW1lXTtcbiAgICAgICAgZGVsZXRlIHRoaXMuc2NyaXB0VHlwZS5wcm90b3R5cGVbbmFtZV07XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIERldGVjdCBpZiBBdHRyaWJ1dGUgaXMgYWRkZWQuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gbmFtZSAtIE5hbWUgb2YgYW4gYXR0cmlidXRlLlxuICAgICAqIEByZXR1cm5zIHtib29sZWFufSBUcnVlIGlmIEF0dHJpYnV0ZSBpcyBkZWZpbmVkLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogaWYgKFBsYXllckNvbnRyb2xsZXIuYXR0cmlidXRlcy5oYXMoJ2Z1bGxOYW1lJykpIHtcbiAgICAgKiAgICAgLy8gYXR0cmlidXRlIGZ1bGxOYW1lIGlzIGRlZmluZWRcbiAgICAgKiB9XG4gICAgICovXG4gICAgaGFzKG5hbWUpIHtcbiAgICAgICAgcmV0dXJuICEhdGhpcy5pbmRleFtuYW1lXTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBHZXQgb2JqZWN0IHdpdGggYXR0cmlidXRlIGFyZ3VtZW50cy4gTm90ZTogQ2hhbmdpbmcgYXJndW1lbnQgcHJvcGVydGllcyB3aWxsIG5vdCBhZmZlY3RcbiAgICAgKiBleGlzdGluZyBTY3JpcHQgSW5zdGFuY2VzLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IG5hbWUgLSBOYW1lIG9mIGFuIGF0dHJpYnV0ZS5cbiAgICAgKiBAcmV0dXJucyB7P29iamVjdH0gQXJndW1lbnRzIHdpdGggYXR0cmlidXRlIHByb3BlcnRpZXMuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiAvLyBjaGFuZ2luZyBkZWZhdWx0IHZhbHVlIGZvciBhbiBhdHRyaWJ1dGUgJ2Z1bGxOYW1lJ1xuICAgICAqIHZhciBhdHRyID0gUGxheWVyQ29udHJvbGxlci5hdHRyaWJ1dGVzLmdldCgnZnVsbE5hbWUnKTtcbiAgICAgKiBpZiAoYXR0cikgYXR0ci5kZWZhdWx0ID0gJ1Vua25vd24nO1xuICAgICAqL1xuICAgIGdldChuYW1lKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmluZGV4W25hbWVdIHx8IG51bGw7XG4gICAgfVxufVxuXG5leHBvcnQgeyBTY3JpcHRBdHRyaWJ1dGVzIH07XG4iXSwibmFtZXMiOlsiY29tcG9uZW50cyIsInZlY0xvb2t1cCIsInVuZGVmaW5lZCIsIlZlYzIiLCJWZWMzIiwiVmVjNCIsInJhd1RvVmFsdWUiLCJhcHAiLCJhcmdzIiwidmFsdWUiLCJvbGQiLCJ0eXBlIiwidiIsInBhcnNlSW50IiwiaXNOYU4iLCJyZXN1bHQiLCJBcnJheSIsImlzQXJyYXkiLCJzY2hlbWEiLCJpIiwibGVuZ3RoIiwiZmllbGQiLCJuYW1lIiwiYXJyYXkiLCJhcnIiLCJqIiwicHVzaCIsInZhbCIsImhhc093blByb3BlcnR5IiwiZGVmYXVsdCIsIkFzc2V0IiwiYXNzZXRzIiwiZ2V0IiwiR3JhcGhOb2RlIiwiZ2V0RW50aXR5RnJvbUluZGV4IiwiQ29sb3IiLCJjb3B5IiwiY2xvbmUiLCJyIiwiZyIsImIiLCJhIiwidGVzdCIsImZyb21TdHJpbmciLCJsZW4iLCJzbGljZSIsInZlY1R5cGUiLCJjdXJ2ZSIsIkN1cnZlIiwiQ3VydmVTZXQiLCJDdXJ2ZVR5cGUiLCJrZXlzIiwiU2NyaXB0QXR0cmlidXRlcyIsImNvbnN0cnVjdG9yIiwic2NyaXB0VHlwZSIsImluZGV4IiwiYWRkIiwiRGVidWciLCJ3YXJuIiwicmVzZXJ2ZWROYW1lcyIsImhhcyIsIk9iamVjdCIsImRlZmluZVByb3BlcnR5IiwicHJvdG90eXBlIiwiX19hdHRyaWJ1dGVzIiwic2V0IiwicmF3IiwiZXZ0IiwiZXZ0TmFtZSIsIm9sZENvcHkiLCJoYXNFdmVudCIsImZpcmUiLCJyZW1vdmUiLCJTZXQiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7QUFZQSxNQUFNQSxVQUFVLEdBQUcsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdB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
