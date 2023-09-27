import { EventHandler } from '../core/event-handler.js';
import { Tags } from '../core/tags.js';
import { Debug } from '../core/debug.js';
import { Mat3 } from '../core/math/mat3.js';
import { Mat4 } from '../core/math/mat4.js';
import { Quat } from '../core/math/quat.js';
import { Vec3 } from '../core/math/vec3.js';

const scaleCompensatePosTransform = new Mat4();
const scaleCompensatePos = new Vec3();
const scaleCompensateRot = new Quat();
const scaleCompensateRot2 = new Quat();
const scaleCompensateScale = new Vec3();
const scaleCompensateScaleForParent = new Vec3();
const tmpMat4 = new Mat4();
const tmpQuat = new Quat();
const position = new Vec3();
const invParentWtm = new Mat4();
const rotation = new Quat();
const invParentRot = new Quat();
const matrix = new Mat4();
const target = new Vec3();
const up = new Vec3();

/**
 * Callback used by {@link GraphNode#find} and {@link GraphNode#findOne} to search through a graph
 * node and all of its descendants.
 *
 * @callback FindNodeCallback
 * @param {GraphNode} node - The current graph node.
 * @returns {boolean} Returning `true` will result in that node being returned from
 * {@link GraphNode#find} or {@link GraphNode#findOne}.
 */

/**
 * Callback used by {@link GraphNode#forEach} to iterate through a graph node and all of its
 * descendants.
 *
 * @callback ForEachNodeCallback
 * @param {GraphNode} node - The current graph node.
 */

/**
 * A hierarchical scene node.
 *
 * @augments EventHandler
 */
class GraphNode extends EventHandler {
  /**
   * Create a new GraphNode instance.
   *
   * @param {string} [name] - The non-unique name of a graph node. Defaults to 'Untitled'.
   */
  constructor(name = 'Untitled') {
    super();
    /**
     * The non-unique name of a graph node. Defaults to 'Untitled'.
     *
     * @type {string}
     */
    this.name = void 0;
    /**
     * Interface for tagging graph nodes. Tag based searches can be performed using the
     * {@link GraphNode#findByTag} function.
     *
     * @type {Tags}
     */
    this.tags = new Tags(this);
    /** @private */
    this._labels = {};
    // Local-space properties of transform (only first 3 are settable by the user)
    /**
     * @type {Vec3}
     * @private
     */
    this.localPosition = new Vec3();
    /**
     * @type {Quat}
     * @private
     */
    this.localRotation = new Quat();
    /**
     * @type {Vec3}
     * @private
     */
    this.localScale = new Vec3(1, 1, 1);
    /**
     * @type {Vec3}
     * @private
     */
    this.localEulerAngles = new Vec3();
    // Only calculated on request
    // World-space properties of transform
    /**
     * @type {Vec3}
     * @private
     */
    this.position = new Vec3();
    /**
     * @type {Quat}
     * @private
     */
    this.rotation = new Quat();
    /**
     * @type {Vec3}
     * @private
     */
    this.eulerAngles = new Vec3();
    /**
     * @type {Vec3|null}
     * @private
     */
    this._scale = null;
    /**
     * @type {Mat4}
     * @private
     */
    this.localTransform = new Mat4();
    /**
     * @type {boolean}
     * @private
     */
    this._dirtyLocal = false;
    /**
     * @type {number}
     * @private
     */
    this._aabbVer = 0;
    /**
     * Marks the node to ignore hierarchy sync entirely (including children nodes). The engine code
     * automatically freezes and unfreezes objects whenever required. Segregating dynamic and
     * stationary nodes into subhierarchies allows to reduce sync time significantly.
     *
     * @type {boolean}
     * @private
     */
    this._frozen = false;
    /**
     * @type {Mat4}
     * @private
     */
    this.worldTransform = new Mat4();
    /**
     * @type {boolean}
     * @private
     */
    this._dirtyWorld = false;
    /**
     * Cached value representing the negatively scaled world transform. If the value is 0, this
     * marks this value as dirty and it needs to be recalculated. If the value is 1, the world
     * transform is not negatively scaled. If the value is -1, the world transform is negatively
     * scaled.
     *
     * @type {number}
     * @private
     */
    this._worldScaleSign = 0;
    /**
     * @type {Mat3}
     * @private
     */
    this._normalMatrix = new Mat3();
    /**
     * @type {boolean}
     * @private
     */
    this._dirtyNormal = true;
    /**
     * @type {Vec3|null}
     * @private
     */
    this._right = null;
    /**
     * @type {Vec3|null}
     * @private
     */
    this._up = null;
    /**
     * @type {Vec3|null}
     * @private
     */
    this._forward = null;
    /**
     * @type {GraphNode|null}
     * @private
     */
    this._parent = null;
    /**
     * @type {GraphNode[]}
     * @private
     */
    this._children = [];
    /**
     * @type {number}
     * @private
     */
    this._graphDepth = 0;
    /**
     * Represents enabled state of the entity. If the entity is disabled, the entity including all
     * children are excluded from updates.
     *
     * @type {boolean}
     * @private
     */
    this._enabled = true;
    /**
     * Represents enabled state of the entity in the hierarchy. It's true only if this entity and
     * all parent entities all the way to the scene's root are enabled.
     *
     * @type {boolean}
     * @private
     */
    this._enabledInHierarchy = false;
    /**
     * @type {boolean}
     * @ignore
     */
    this.scaleCompensation = false;
    this.name = name;
  }

  /**
   * The normalized local space X-axis vector of the graph node in world space.
   *
   * @type {Vec3}
   */
  get right() {
    if (!this._right) {
      this._right = new Vec3();
    }
    return this.getWorldTransform().getX(this._right).normalize();
  }

  /**
   * The normalized local space Y-axis vector of the graph node in world space.
   *
   * @type {Vec3}
   */
  get up() {
    if (!this._up) {
      this._up = new Vec3();
    }
    return this.getWorldTransform().getY(this._up).normalize();
  }

  /**
   * The normalized local space negative Z-axis vector of the graph node in world space.
   *
   * @type {Vec3}
   */
  get forward() {
    if (!this._forward) {
      this._forward = new Vec3();
    }
    return this.getWorldTransform().getZ(this._forward).normalize().mulScalar(-1);
  }

  /**
   * A matrix used to transform the normal.
   *
   * @type  {Mat3}
   * @ignore
   */
  get normalMatrix() {
    const normalMat = this._normalMatrix;
    if (this._dirtyNormal) {
      normalMat.invertMat4(this.getWorldTransform()).transpose();
      this._dirtyNormal = false;
    }
    return normalMat;
  }

  /**
   * Enable or disable a GraphNode. If one of the GraphNode's parents is disabled there will be
   * no other side effects. If all the parents are enabled then the new value will activate or
   * deactivate all the enabled children of the GraphNode.
   *
   * @type {boolean}
   */
  set enabled(enabled) {
    if (this._enabled !== enabled) {
      var _this$_parent;
      this._enabled = enabled;

      // if enabling entity, make all children enabled in hierarchy only when the parent is as well
      // if disabling entity, make all children disabled in hierarchy in all cases
      if (enabled && (_this$_parent = this._parent) != null && _this$_parent.enabled || !enabled) {
        this._notifyHierarchyStateChanged(this, enabled);
      }
    }
  }
  get enabled() {
    // make sure to check this._enabled too because if that
    // was false when a parent was updated the _enabledInHierarchy
    // flag may not have been updated for optimization purposes
    return this._enabled && this._enabledInHierarchy;
  }

  /**
   * A read-only property to get a parent graph node.
   *
   * @type {GraphNode|null}
   */
  get parent() {
    return this._parent;
  }

  /**
   * A read-only property to get the path of the graph node relative to the root of the hierarchy.
   *
   * @type {string}
   */
  get path() {
    let node = this._parent;
    if (!node) {
      return '';
    }
    let result = this.name;
    while (node && node._parent) {
      result = `${node.name}/${result}`;
      node = node._parent;
    }
    return result;
  }

  /**
   * A read-only property to get highest graph node from current node.
   *
   * @type {GraphNode}
   */
  get root() {
    let result = this;
    while (result._parent) {
      result = result._parent;
    }
    return result;
  }

  /**
   * A read-only property to get the children of this graph node.
   *
   * @type {GraphNode[]}
   */
  get children() {
    return this._children;
  }

  /**
   * A read-only property to get the depth of this child within the graph. Note that for
   * performance reasons this is only recalculated when a node is added to a new parent, i.e. It
   * is not recalculated when a node is simply removed from the graph.
   *
   * @type {number}
   */
  get graphDepth() {
    return this._graphDepth;
  }

  /**
   * @param {GraphNode} node - Graph node to update.
   * @param {boolean} enabled - True if enabled in the hierarchy, false if disabled.
   * @private
   */
  _notifyHierarchyStateChanged(node, enabled) {
    node._onHierarchyStateChanged(enabled);
    const c = node._children;
    for (let i = 0, len = c.length; i < len; i++) {
      if (c[i]._enabled) this._notifyHierarchyStateChanged(c[i], enabled);
    }
  }

  /**
   * Called when the enabled flag of the entity or one of its parents changes.
   *
   * @param {boolean} enabled - True if enabled in the hierarchy, false if disabled.
   * @private
   */
  _onHierarchyStateChanged(enabled) {
    // Override in derived classes
    this._enabledInHierarchy = enabled;
    if (enabled && !this._frozen) this._unfreezeParentToRoot();
  }

  /**
   * @param {this} clone - The cloned graph node to copy into.
   * @private
   */
  _cloneInternal(clone) {
    clone.name = this.name;
    const tags = this.tags._list;
    clone.tags.clear();
    for (let i = 0; i < tags.length; i++) clone.tags.add(tags[i]);
    clone._labels = Object.assign({}, this._labels);
    clone.localPosition.copy(this.localPosition);
    clone.localRotation.copy(this.localRotation);
    clone.localScale.copy(this.localScale);
    clone.localEulerAngles.copy(this.localEulerAngles);
    clone.position.copy(this.position);
    clone.rotation.copy(this.rotation);
    clone.eulerAngles.copy(this.eulerAngles);
    clone.localTransform.copy(this.localTransform);
    clone._dirtyLocal = this._dirtyLocal;
    clone.worldTransform.copy(this.worldTransform);
    clone._dirtyWorld = this._dirtyWorld;
    clone._dirtyNormal = this._dirtyNormal;
    clone._aabbVer = this._aabbVer + 1;
    clone._enabled = this._enabled;
    clone.scaleCompensation = this.scaleCompensation;

    // false as this node is not in the hierarchy yet
    clone._enabledInHierarchy = false;
  }

  /**
   * Clone a graph node.
   *
   * @returns {this} A clone of the specified graph node.
   */
  clone() {
    const clone = new this.constructor();
    this._cloneInternal(clone);
    return clone;
  }

  /**
   * Copy a graph node.
   *
   * @param {GraphNode} source - The graph node to copy.
   * @returns {GraphNode} The destination graph node.
   * @ignore
   */
  copy(source) {
    source._cloneInternal(this);
    return this;
  }

  /**
   * Detach a GraphNode from the hierarchy and recursively destroy all children.
   *
   * @example
   * const firstChild = this.entity.children[0];
   * firstChild.destroy(); // delete child, all components and remove from hierarchy
   */
  destroy() {
    // Detach from parent
    this.remove();

    // Recursively destroy all children
    const children = this._children;
    while (children.length) {
      // Remove last child from the array
      const child = children.pop();
      // Disconnect it from the parent: this is only an optimization step, to prevent calling
      // GraphNode#removeChild which would try to refind it via this._children.indexOf (which
      // will fail, because we just removed it).
      child._parent = null;
      child.destroy();
    }

    // fire destroy event
    this.fire('destroy', this);

    // clear all events
    this.off();
  }

  /**
   * Search the graph node and all of its descendants for the nodes that satisfy some search
   * criteria.
   *
   * @param {FindNodeCallback|string} attr - This can either be a function or a string. If it's a
   * function, it is executed for each descendant node to test if node satisfies the search
   * logic. Returning true from the function will include the node into the results. If it's a
   * string then it represents the name of a field or a method of the node. If this is the name
   * of a field then the value passed as the second argument will be checked for equality. If
   * this is the name of a function then the return value of the function will be checked for
   * equality against the valued passed as the second argument to this function.
   * @param {object} [value] - If the first argument (attr) is a property name then this value
   * will be checked against the value of the property.
   * @returns {GraphNode[]} The array of graph nodes that match the search criteria.
   * @example
   * // Finds all nodes that have a model component and have 'door' in their lower-cased name
   * const doors = house.find(function (node) {
   *     return node.model && node.name.toLowerCase().indexOf('door') !== -1;
   * });
   * @example
   * // Finds all nodes that have the name property set to 'Test'
   * const entities = parent.find('name', 'Test');
   */
  find(attr, value) {
    let result,
      results = [];
    const len = this._children.length;
    if (attr instanceof Function) {
      const fn = attr;
      result = fn(this);
      if (result) results.push(this);
      for (let i = 0; i < len; i++) {
        const descendants = this._children[i].find(fn);
        if (descendants.length) results = results.concat(descendants);
      }
    } else {
      let testValue;
      if (this[attr]) {
        if (this[attr] instanceof Function) {
          testValue = this[attr]();
        } else {
          testValue = this[attr];
        }
        if (testValue === value) results.push(this);
      }
      for (let i = 0; i < len; ++i) {
        const descendants = this._children[i].find(attr, value);
        if (descendants.length) results = results.concat(descendants);
      }
    }
    return results;
  }

  /**
   * Search the graph node and all of its descendants for the first node that satisfies some
   * search criteria.
   *
   * @param {FindNodeCallback|string} attr - This can either be a function or a string. If it's a
   * function, it is executed for each descendant node to test if node satisfies the search
   * logic. Returning true from the function will result in that node being returned from
   * findOne. If it's a string then it represents the name of a field or a method of the node. If
   * this is the name of a field then the value passed as the second argument will be checked for
   * equality. If this is the name of a function then the return value of the function will be
   * checked for equality against the valued passed as the second argument to this function.
   * @param {object} [value] - If the first argument (attr) is a property name then this value
   * will be checked against the value of the property.
   * @returns {GraphNode|null} A graph node that match the search criteria. Returns null if no
   * node is found.
   * @example
   * // Find the first node that is called 'head' and has a model component
   * const head = player.findOne(function (node) {
   *     return node.model && node.name === 'head';
   * });
   * @example
   * // Finds the first node that has the name property set to 'Test'
   * const node = parent.findOne('name', 'Test');
   */
  findOne(attr, value) {
    const len = this._children.length;
    let result = null;
    if (attr instanceof Function) {
      const fn = attr;
      result = fn(this);
      if (result) return this;
      for (let i = 0; i < len; i++) {
        result = this._children[i].findOne(fn);
        if (result) return result;
      }
    } else {
      let testValue;
      if (this[attr]) {
        if (this[attr] instanceof Function) {
          testValue = this[attr]();
        } else {
          testValue = this[attr];
        }
        if (testValue === value) {
          return this;
        }
      }
      for (let i = 0; i < len; i++) {
        result = this._children[i].findOne(attr, value);
        if (result !== null) return result;
      }
    }
    return null;
  }

  /**
   * Return all graph nodes that satisfy the search query. Query can be simply a string, or comma
   * separated strings, to have inclusive results of assets that match at least one query. A
   * query that consists of an array of tags can be used to match graph nodes that have each tag
   * of array.
   *
   * @param {...*} query - Name of a tag or array of tags.
   * @returns {GraphNode[]} A list of all graph nodes that match the query.
   * @example
   * // Return all graph nodes that tagged by `animal`
   * const animals = node.findByTag("animal");
   * @example
   * // Return all graph nodes that tagged by `bird` OR `mammal`
   * const birdsAndMammals = node.findByTag("bird", "mammal");
   * @example
   * // Return all assets that tagged by `carnivore` AND `mammal`
   * const meatEatingMammals = node.findByTag(["carnivore", "mammal"]);
   * @example
   * // Return all assets that tagged by (`carnivore` AND `mammal`) OR (`carnivore` AND `reptile`)
   * const meatEatingMammalsAndReptiles = node.findByTag(["carnivore", "mammal"], ["carnivore", "reptile"]);
   */
  findByTag() {
    const query = arguments;
    const results = [];
    const queryNode = (node, checkNode) => {
      if (checkNode && node.tags.has(...query)) {
        results.push(node);
      }
      for (let i = 0; i < node._children.length; i++) {
        queryNode(node._children[i], true);
      }
    };
    queryNode(this, false);
    return results;
  }

  /**
   * Get the first node found in the graph with the name. The search is depth first.
   *
   * @param {string} name - The name of the graph.
   * @returns {GraphNode|null} The first node to be found matching the supplied name. Returns
   * null if no node is found.
   */
  findByName(name) {
    if (this.name === name) return this;
    for (let i = 0; i < this._children.length; i++) {
      const found = this._children[i].findByName(name);
      if (found !== null) return found;
    }
    return null;
  }

  /**
   * Get the first node found in the graph by its full path in the graph. The full path has this
   * form 'parent/child/sub-child'. The search is depth first.
   *
   * @param {string|string[]} path - The full path of the {@link GraphNode} as either a string or
   * array of {@link GraphNode} names.
   * @returns {GraphNode|null} The first node to be found matching the supplied path. Returns
   * null if no node is found.
   * @example
   * // String form
   * const grandchild = this.entity.findByPath('child/grandchild');
   * @example
   * // Array form
   * const grandchild = this.entity.findByPath(['child', 'grandchild']);
   */
  findByPath(path) {
    // accept either string path with '/' separators or array of parts.
    const parts = Array.isArray(path) ? path : path.split('/');
    let result = this;
    for (let i = 0, imax = parts.length; i < imax; ++i) {
      result = result.children.find(c => c.name === parts[i]);
      if (!result) {
        return null;
      }
    }
    return result;
  }

  /**
   * Executes a provided function once on this graph node and all of its descendants.
   *
   * @param {ForEachNodeCallback} callback - The function to execute on the graph node and each
   * descendant.
   * @param {object} [thisArg] - Optional value to use as this when executing callback function.
   * @example
   * // Log the path and name of each node in descendant tree starting with "parent"
   * parent.forEach(function (node) {
   *     console.log(node.path + "/" + node.name);
   * });
   */
  forEach(callback, thisArg) {
    callback.call(thisArg, this);
    const children = this._children;
    for (let i = 0; i < children.length; i++) {
      children[i].forEach(callback, thisArg);
    }
  }

  /**
   * Check if node is descendant of another node.
   *
   * @param {GraphNode} node - Potential ancestor of node.
   * @returns {boolean} If node is descendant of another node.
   * @example
   * if (roof.isDescendantOf(house)) {
   *     // roof is descendant of house entity
   * }
   */
  isDescendantOf(node) {
    let parent = this._parent;
    while (parent) {
      if (parent === node) return true;
      parent = parent._parent;
    }
    return false;
  }

  /**
   * Check if node is ancestor for another node.
   *
   * @param {GraphNode} node - Potential descendant of node.
   * @returns {boolean} If node is ancestor for another node.
   * @example
   * if (body.isAncestorOf(foot)) {
   *     // foot is within body's hierarchy
   * }
   */
  isAncestorOf(node) {
    return node.isDescendantOf(this);
  }

  /**
   * Get the world space rotation for the specified GraphNode in Euler angle form. The rotation
   * is returned as euler angles in a {@link Vec3}. The value returned by this function should be
   * considered read-only. In order to set the world-space rotation of the graph node, use
   * {@link GraphNode#setEulerAngles}.
   *
   * @returns {Vec3} The world space rotation of the graph node in Euler angle form.
   * @example
   * const angles = this.entity.getEulerAngles();
   * angles.y = 180; // rotate the entity around Y by 180 degrees
   * this.entity.setEulerAngles(angles);
   */
  getEulerAngles() {
    this.getWorldTransform().getEulerAngles(this.eulerAngles);
    return this.eulerAngles;
  }

  /**
   * Get the rotation in local space for the specified GraphNode. The rotation is returned as
   * euler angles in a {@link Vec3}. The returned vector should be considered read-only. To
   * update the local rotation, use {@link GraphNode#setLocalEulerAngles}.
   *
   * @returns {Vec3} The local space rotation of the graph node as euler angles in XYZ order.
   * @example
   * const angles = this.entity.getLocalEulerAngles();
   * angles.y = 180;
   * this.entity.setLocalEulerAngles(angles);
   */
  getLocalEulerAngles() {
    this.localRotation.getEulerAngles(this.localEulerAngles);
    return this.localEulerAngles;
  }

  /**
   * Get the position in local space for the specified GraphNode. The position is returned as a
   * {@link Vec3}. The returned vector should be considered read-only. To update the local
   * position, use {@link GraphNode#setLocalPosition}.
   *
   * @returns {Vec3} The local space position of the graph node.
   * @example
   * const position = this.entity.getLocalPosition();
   * position.x += 1; // move the entity 1 unit along x.
   * this.entity.setLocalPosition(position);
   */
  getLocalPosition() {
    return this.localPosition;
  }

  /**
   * Get the rotation in local space for the specified GraphNode. The rotation is returned as a
   * {@link Quat}. The returned quaternion should be considered read-only. To update the local
   * rotation, use {@link GraphNode#setLocalRotation}.
   *
   * @returns {Quat} The local space rotation of the graph node as a quaternion.
   * @example
   * const rotation = this.entity.getLocalRotation();
   */
  getLocalRotation() {
    return this.localRotation;
  }

  /**
   * Get the scale in local space for the specified GraphNode. The scale is returned as a
   * {@link Vec3}. The returned vector should be considered read-only. To update the local scale,
   * use {@link GraphNode#setLocalScale}.
   *
   * @returns {Vec3} The local space scale of the graph node.
   * @example
   * const scale = this.entity.getLocalScale();
   * scale.x = 100;
   * this.entity.setLocalScale(scale);
   */
  getLocalScale() {
    return this.localScale;
  }

  /**
   * Get the local transform matrix for this graph node. This matrix is the transform relative to
   * the node's parent's world transformation matrix.
   *
   * @returns {Mat4} The node's local transformation matrix.
   * @example
   * const transform = this.entity.getLocalTransform();
   */
  getLocalTransform() {
    if (this._dirtyLocal) {
      this.localTransform.setTRS(this.localPosition, this.localRotation, this.localScale);
      this._dirtyLocal = false;
    }
    return this.localTransform;
  }

  /**
   * Get the world space position for the specified GraphNode. The position is returned as a
   * {@link Vec3}. The value returned by this function should be considered read-only. In order
   * to set the world-space position of the graph node, use {@link GraphNode#setPosition}.
   *
   * @returns {Vec3} The world space position of the graph node.
   * @example
   * const position = this.entity.getPosition();
   * position.x = 10;
   * this.entity.setPosition(position);
   */
  getPosition() {
    this.getWorldTransform().getTranslation(this.position);
    return this.position;
  }

  /**
   * Get the world space rotation for the specified GraphNode. The rotation is returned as a
   * {@link Quat}. The value returned by this function should be considered read-only. In order
   * to set the world-space rotation of the graph node, use {@link GraphNode#setRotation}.
   *
   * @returns {Quat} The world space rotation of the graph node as a quaternion.
   * @example
   * const rotation = this.entity.getRotation();
   */
  getRotation() {
    this.rotation.setFromMat4(this.getWorldTransform());
    return this.rotation;
  }

  /**
   * Get the world space scale for the specified GraphNode. The returned value will only be
   * correct for graph nodes that have a non-skewed world transform (a skew can be introduced by
   * the compounding of rotations and scales higher in the graph node hierarchy). The scale is
   * returned as a {@link Vec3}. The value returned by this function should be considered
   * read-only. Note that it is not possible to set the world space scale of a graph node
   * directly.
   *
   * @returns {Vec3} The world space scale of the graph node.
   * @example
   * const scale = this.entity.getScale();
   * @ignore
   */
  getScale() {
    if (!this._scale) {
      this._scale = new Vec3();
    }
    return this.getWorldTransform().getScale(this._scale);
  }

  /**
   * Get the world transformation matrix for this graph node.
   *
   * @returns {Mat4} The node's world transformation matrix.
   * @example
   * const transform = this.entity.getWorldTransform();
   */
  getWorldTransform() {
    if (!this._dirtyLocal && !this._dirtyWorld) return this.worldTransform;
    if (this._parent) this._parent.getWorldTransform();
    this._sync();
    return this.worldTransform;
  }

  /**
   * Returns cached value of negative scale of the world transform.
   *
   * @returns {number} -1 if world transform has negative scale, 1 otherwise.
   * @ignore
   */
  get worldScaleSign() {
    if (this._worldScaleSign === 0) {
      this._worldScaleSign = this.getWorldTransform().scaleSign;
    }
    return this._worldScaleSign;
  }

  /**
   * Remove graph node from current parent.
   */
  remove() {
    var _this$_parent2;
    (_this$_parent2 = this._parent) == null ? void 0 : _this$_parent2.removeChild(this);
  }

  /**
   * Remove graph node from current parent and add as child to new parent.
   *
   * @param {GraphNode} parent - New parent to attach graph node to.
   * @param {number} [index] - The child index where the child node should be placed.
   */
  reparent(parent, index) {
    this.remove();
    if (parent) {
      if (index >= 0) {
        parent.insertChild(this, index);
      } else {
        parent.addChild(this);
      }
    }
  }

  /**
   * Sets the local-space rotation of the specified graph node using euler angles. Eulers are
   * interpreted in XYZ order. Eulers must be specified in degrees. This function has two valid
   * signatures: you can either pass a 3D vector or 3 numbers to specify the local-space euler
   * rotation.
   *
   * @param {Vec3|number} x - 3-dimensional vector holding eulers or rotation around local-space
   * x-axis in degrees.
   * @param {number} [y] - Rotation around local-space y-axis in degrees.
   * @param {number} [z] - Rotation around local-space z-axis in degrees.
   * @example
   * // Set rotation of 90 degrees around y-axis via 3 numbers
   * this.entity.setLocalEulerAngles(0, 90, 0);
   * @example
   * // Set rotation of 90 degrees around y-axis via a vector
   * const angles = new pc.Vec3(0, 90, 0);
   * this.entity.setLocalEulerAngles(angles);
   */
  setLocalEulerAngles(x, y, z) {
    this.localRotation.setFromEulerAngles(x, y, z);
    if (!this._dirtyLocal) this._dirtifyLocal();
  }

  /**
   * Sets the local-space position of the specified graph node. This function has two valid
   * signatures: you can either pass a 3D vector or 3 numbers to specify the local-space
   * position.
   *
   * @param {Vec3|number} x - 3-dimensional vector holding local-space position or
   * x-coordinate of local-space position.
   * @param {number} [y] - Y-coordinate of local-space position.
   * @param {number} [z] - Z-coordinate of local-space position.
   * @example
   * // Set via 3 numbers
   * this.entity.setLocalPosition(0, 10, 0);
   * @example
   * // Set via vector
   * const pos = new pc.Vec3(0, 10, 0);
   * this.entity.setLocalPosition(pos);
   */
  setLocalPosition(x, y, z) {
    if (x instanceof Vec3) {
      this.localPosition.copy(x);
    } else {
      this.localPosition.set(x, y, z);
    }
    if (!this._dirtyLocal) this._dirtifyLocal();
  }

  /**
   * Sets the local-space rotation of the specified graph node. This function has two valid
   * signatures: you can either pass a quaternion or 3 numbers to specify the local-space
   * rotation.
   *
   * @param {Quat|number} x - Quaternion holding local-space rotation or x-component of
   * local-space quaternion rotation.
   * @param {number} [y] - Y-component of local-space quaternion rotation.
   * @param {number} [z] - Z-component of local-space quaternion rotation.
   * @param {number} [w] - W-component of local-space quaternion rotation.
   * @example
   * // Set via 4 numbers
   * this.entity.setLocalRotation(0, 0, 0, 1);
   * @example
   * // Set via quaternion
   * const q = pc.Quat();
   * this.entity.setLocalRotation(q);
   */
  setLocalRotation(x, y, z, w) {
    if (x instanceof Quat) {
      this.localRotation.copy(x);
    } else {
      this.localRotation.set(x, y, z, w);
    }
    if (!this._dirtyLocal) this._dirtifyLocal();
  }

  /**
   * Sets the local-space scale factor of the specified graph node. This function has two valid
   * signatures: you can either pass a 3D vector or 3 numbers to specify the local-space scale.
   *
   * @param {Vec3|number} x - 3-dimensional vector holding local-space scale or x-coordinate
   * of local-space scale.
   * @param {number} [y] - Y-coordinate of local-space scale.
   * @param {number} [z] - Z-coordinate of local-space scale.
   * @example
   * // Set via 3 numbers
   * this.entity.setLocalScale(10, 10, 10);
   * @example
   * // Set via vector
   * const scale = new pc.Vec3(10, 10, 10);
   * this.entity.setLocalScale(scale);
   */
  setLocalScale(x, y, z) {
    if (x instanceof Vec3) {
      this.localScale.copy(x);
    } else {
      this.localScale.set(x, y, z);
    }
    if (!this._dirtyLocal) this._dirtifyLocal();
  }

  /** @private */
  _dirtifyLocal() {
    if (!this._dirtyLocal) {
      this._dirtyLocal = true;
      if (!this._dirtyWorld) this._dirtifyWorld();
    }
  }

  /** @private */
  _unfreezeParentToRoot() {
    let p = this._parent;
    while (p) {
      p._frozen = false;
      p = p._parent;
    }
  }

  /** @private */
  _dirtifyWorld() {
    if (!this._dirtyWorld) this._unfreezeParentToRoot();
    this._dirtifyWorldInternal();
  }

  /** @private */
  _dirtifyWorldInternal() {
    if (!this._dirtyWorld) {
      this._frozen = false;
      this._dirtyWorld = true;
      for (let i = 0; i < this._children.length; i++) {
        if (!this._children[i]._dirtyWorld) this._children[i]._dirtifyWorldInternal();
      }
    }
    this._dirtyNormal = true;
    this._worldScaleSign = 0; // world matrix is dirty, mark this flag dirty too
    this._aabbVer++;
  }

  /**
   * Sets the world-space position of the specified graph node. This function has two valid
   * signatures: you can either pass a 3D vector or 3 numbers to specify the world-space
   * position.
   *
   * @param {Vec3|number} x - 3-dimensional vector holding world-space position or
   * x-coordinate of world-space position.
   * @param {number} [y] - Y-coordinate of world-space position.
   * @param {number} [z] - Z-coordinate of world-space position.
   * @example
   * // Set via 3 numbers
   * this.entity.setPosition(0, 10, 0);
   * @example
   * // Set via vector
   * const position = new pc.Vec3(0, 10, 0);
   * this.entity.setPosition(position);
   */
  setPosition(x, y, z) {
    if (x instanceof Vec3) {
      position.copy(x);
    } else {
      position.set(x, y, z);
    }
    if (this._parent === null) {
      this.localPosition.copy(position);
    } else {
      invParentWtm.copy(this._parent.getWorldTransform()).invert();
      invParentWtm.transformPoint(position, this.localPosition);
    }
    if (!this._dirtyLocal) this._dirtifyLocal();
  }

  /**
   * Sets the world-space rotation of the specified graph node. This function has two valid
   * signatures: you can either pass a quaternion or 3 numbers to specify the world-space
   * rotation.
   *
   * @param {Quat|number} x - Quaternion holding world-space rotation or x-component of
   * world-space quaternion rotation.
   * @param {number} [y] - Y-component of world-space quaternion rotation.
   * @param {number} [z] - Z-component of world-space quaternion rotation.
   * @param {number} [w] - W-component of world-space quaternion rotation.
   * @example
   * // Set via 4 numbers
   * this.entity.setRotation(0, 0, 0, 1);
   * @example
   * // Set via quaternion
   * const q = pc.Quat();
   * this.entity.setRotation(q);
   */
  setRotation(x, y, z, w) {
    if (x instanceof Quat) {
      rotation.copy(x);
    } else {
      rotation.set(x, y, z, w);
    }
    if (this._parent === null) {
      this.localRotation.copy(rotation);
    } else {
      const parentRot = this._parent.getRotation();
      invParentRot.copy(parentRot).invert();
      this.localRotation.copy(invParentRot).mul(rotation);
    }
    if (!this._dirtyLocal) this._dirtifyLocal();
  }

  /**
   * Sets the world-space rotation of the specified graph node using euler angles. Eulers are
   * interpreted in XYZ order. Eulers must be specified in degrees. This function has two valid
   * signatures: you can either pass a 3D vector or 3 numbers to specify the world-space euler
   * rotation.
   *
   * @param {Vec3|number} x - 3-dimensional vector holding eulers or rotation around world-space
   * x-axis in degrees.
   * @param {number} [y] - Rotation around world-space y-axis in degrees.
   * @param {number} [z] - Rotation around world-space z-axis in degrees.
   * @example
   * // Set rotation of 90 degrees around world-space y-axis via 3 numbers
   * this.entity.setEulerAngles(0, 90, 0);
   * @example
   * // Set rotation of 90 degrees around world-space y-axis via a vector
   * const angles = new pc.Vec3(0, 90, 0);
   * this.entity.setEulerAngles(angles);
   */
  setEulerAngles(x, y, z) {
    this.localRotation.setFromEulerAngles(x, y, z);
    if (this._parent !== null) {
      const parentRot = this._parent.getRotation();
      invParentRot.copy(parentRot).invert();
      this.localRotation.mul2(invParentRot, this.localRotation);
    }
    if (!this._dirtyLocal) this._dirtifyLocal();
  }

  /**
   * Add a new child to the child list and update the parent value of the child node.
   * If the node already had a parent, it is removed from its child list.
   *
   * @param {GraphNode} node - The new child to add.
   * @example
   * const e = new pc.Entity(app);
   * this.entity.addChild(e);
   */
  addChild(node) {
    this._prepareInsertChild(node);
    this._children.push(node);
    this._onInsertChild(node);
  }

  /**
   * Add a child to this node, maintaining the child's transform in world space.
   * If the node already had a parent, it is removed from its child list.
   *
   * @param {GraphNode} node - The child to add.
   * @example
   * const e = new pc.Entity(app);
   * this.entity.addChildAndSaveTransform(e);
   * @ignore
   */
  addChildAndSaveTransform(node) {
    const wPos = node.getPosition();
    const wRot = node.getRotation();
    this._prepareInsertChild(node);
    node.setPosition(tmpMat4.copy(this.worldTransform).invert().transformPoint(wPos));
    node.setRotation(tmpQuat.copy(this.getRotation()).invert().mul(wRot));
    this._children.push(node);
    this._onInsertChild(node);
  }

  /**
   * Insert a new child to the child list at the specified index and update the parent value of
   * the child node. If the node already had a parent, it is removed from its child list.
   *
   * @param {GraphNode} node - The new child to insert.
   * @param {number} index - The index in the child list of the parent where the new node will be
   * inserted.
   * @example
   * const e = new pc.Entity(app);
   * this.entity.insertChild(e, 1);
   */
  insertChild(node, index) {
    this._prepareInsertChild(node);
    this._children.splice(index, 0, node);
    this._onInsertChild(node);
  }

  /**
   * Prepares node for being inserted to a parent node, and removes it from the previous parent.
   *
   * @param {GraphNode} node - The node being inserted.
   * @private
   */
  _prepareInsertChild(node) {
    // remove it from the existing parent
    node.remove();
    Debug.assert(node !== this, `GraphNode ${node == null ? void 0 : node.name} cannot be a child of itself`);
    Debug.assert(!this.isDescendantOf(node), `GraphNode ${node == null ? void 0 : node.name} cannot add an ancestor as a child`);
  }

  /**
   * Fires an event on all children of the node. The event `name` is fired on the first (root)
   * node only. The event `nameHierarchy` is fired for all children.
   *
   * @param {string} name - The name of the event to fire on the root.
   * @param {string} nameHierarchy - The name of the event to fire for all descendants.
   * @param {GraphNode} parent - The parent of the node being added/removed from the hierarchy.
   * @private
   */
  _fireOnHierarchy(name, nameHierarchy, parent) {
    this.fire(name, parent);
    for (let i = 0; i < this._children.length; i++) {
      this._children[i]._fireOnHierarchy(nameHierarchy, nameHierarchy, parent);
    }
  }

  /**
   * Called when a node is inserted into a node's child list.
   *
   * @param {GraphNode} node - The node that was inserted.
   * @private
   */
  _onInsertChild(node) {
    node._parent = this;

    // the child node should be enabled in the hierarchy only if itself is enabled and if
    // this parent is enabled
    const enabledInHierarchy = node._enabled && this.enabled;
    if (node._enabledInHierarchy !== enabledInHierarchy) {
      node._enabledInHierarchy = enabledInHierarchy;

      // propagate the change to the children - necessary if we reparent a node
      // under a parent with a different enabled state (if we reparent a node that is
      // not active in the hierarchy under a parent who is active in the hierarchy then
      // we want our node to be activated)
      node._notifyHierarchyStateChanged(node, enabledInHierarchy);
    }

    // The graph depth of the child and all of its descendants will now change
    node._updateGraphDepth();

    // The child (plus subhierarchy) will need world transforms to be recalculated
    node._dirtifyWorld();
    // node might be already marked as dirty, in that case the whole chain stays frozen, so let's enforce unfreeze
    if (this._frozen) node._unfreezeParentToRoot();

    // alert an entity hierarchy that it has been inserted
    node._fireOnHierarchy('insert', 'inserthierarchy', this);

    // alert the parent that it has had a child inserted
    if (this.fire) this.fire('childinsert', node);
  }

  /**
   * Recurse the hierarchy and update the graph depth at each node.
   *
   * @private
   */
  _updateGraphDepth() {
    this._graphDepth = this._parent ? this._parent._graphDepth + 1 : 0;
    for (let i = 0, len = this._children.length; i < len; i++) {
      this._children[i]._updateGraphDepth();
    }
  }

  /**
   * Remove the node from the child list and update the parent value of the child.
   *
   * @param {GraphNode} child - The node to remove.
   * @example
   * const child = this.entity.children[0];
   * this.entity.removeChild(child);
   */
  removeChild(child) {
    const index = this._children.indexOf(child);
    if (index === -1) {
      return;
    }

    // Remove from child list
    this._children.splice(index, 1);

    // Clear parent
    child._parent = null;

    // NOTE: see PR #4047 - this fix is removed for now as it breaks other things
    // notify the child hierarchy it has been removed from the parent,
    // which marks them as not enabled in hierarchy
    // if (child._enabledInHierarchy) {
    //     child._notifyHierarchyStateChanged(child, false);
    // }

    // alert children that they has been removed
    child._fireOnHierarchy('remove', 'removehierarchy', this);

    // alert the parent that it has had a child removed
    this.fire('childremove', child);
  }
  _sync() {
    if (this._dirtyLocal) {
      this.localTransform.setTRS(this.localPosition, this.localRotation, this.localScale);
      this._dirtyLocal = false;
    }
    if (this._dirtyWorld) {
      if (this._parent === null) {
        this.worldTransform.copy(this.localTransform);
      } else {
        if (this.scaleCompensation) {
          let parentWorldScale;
          const parent = this._parent;

          // Find a parent of the first uncompensated node up in the hierarchy and use its scale * localScale
          let scale = this.localScale;
          let parentToUseScaleFrom = parent; // current parent
          if (parentToUseScaleFrom) {
            while (parentToUseScaleFrom && parentToUseScaleFrom.scaleCompensation) {
              parentToUseScaleFrom = parentToUseScaleFrom._parent;
            }
            // topmost node with scale compensation
            if (parentToUseScaleFrom) {
              parentToUseScaleFrom = parentToUseScaleFrom._parent; // node without scale compensation
              if (parentToUseScaleFrom) {
                parentWorldScale = parentToUseScaleFrom.worldTransform.getScale();
                scaleCompensateScale.mul2(parentWorldScale, this.localScale);
                scale = scaleCompensateScale;
              }
            }
          }

          // Rotation is as usual
          scaleCompensateRot2.setFromMat4(parent.worldTransform);
          scaleCompensateRot.mul2(scaleCompensateRot2, this.localRotation);

          // Find matrix to transform position
          let tmatrix = parent.worldTransform;
          if (parent.scaleCompensation) {
            scaleCompensateScaleForParent.mul2(parentWorldScale, parent.getLocalScale());
            scaleCompensatePosTransform.setTRS(parent.worldTransform.getTranslation(scaleCompensatePos), scaleCompensateRot2, scaleCompensateScaleForParent);
            tmatrix = scaleCompensatePosTransform;
          }
          tmatrix.transformPoint(this.localPosition, scaleCompensatePos);
          this.worldTransform.setTRS(scaleCompensatePos, scaleCompensateRot, scale);
        } else {
          this.worldTransform.mulAffine2(this._parent.worldTransform, this.localTransform);
        }
      }
      this._dirtyWorld = false;
    }
  }

  /**
   * Updates the world transformation matrices at this node and all of its descendants.
   *
   * @ignore
   */
  syncHierarchy() {
    if (!this._enabled) return;
    if (this._frozen) return;
    this._frozen = true;
    if (this._dirtyLocal || this._dirtyWorld) {
      this._sync();
    }
    const children = this._children;
    for (let i = 0, len = children.length; i < len; i++) {
      children[i].syncHierarchy();
    }
  }

  /**
   * Reorients the graph node so that the negative z-axis points towards the target. This
   * function has two valid signatures. Either pass 3D vectors for the look at coordinate and up
   * vector, or pass numbers to represent the vectors.
   *
   * @param {Vec3|number} x - If passing a 3D vector, this is the world-space coordinate to look at.
   * Otherwise, it is the x-component of the world-space coordinate to look at.
   * @param {Vec3|number} [y] - If passing a 3D vector, this is the world-space up vector for look at
   * transform. Otherwise, it is the y-component of the world-space coordinate to look at.
   * @param {number} [z] - Z-component of the world-space coordinate to look at.
   * @param {number} [ux] - X-component of the up vector for the look at transform. Defaults to 0.
   * @param {number} [uy] - Y-component of the up vector for the look at transform. Defaults to 1.
   * @param {number} [uz] - Z-component of the up vector for the look at transform. Defaults to 0.
   * @example
   * // Look at another entity, using the (default) positive y-axis for up
   * const position = otherEntity.getPosition();
   * this.entity.lookAt(position);
   * @example
   * // Look at another entity, using the negative world y-axis for up
   * const position = otherEntity.getPosition();
   * this.entity.lookAt(position, pc.Vec3.DOWN);
   * @example
   * // Look at the world space origin, using the (default) positive y-axis for up
   * this.entity.lookAt(0, 0, 0);
   * @example
   * // Look at world-space coordinate [10, 10, 10], using the negative world y-axis for up
   * this.entity.lookAt(10, 10, 10, 0, -1, 0);
   */
  lookAt(x, y, z, ux = 0, uy = 1, uz = 0) {
    if (x instanceof Vec3) {
      target.copy(x);
      if (y instanceof Vec3) {
        // vec3, vec3
        up.copy(y);
      } else {
        // vec3
        up.copy(Vec3.UP);
      }
    } else if (z === undefined) {
      return;
    } else {
      target.set(x, y, z);
      up.set(ux, uy, uz);
    }
    matrix.setLookAt(this.getPosition(), target, up);
    rotation.setFromMat4(matrix);
    this.setRotation(rotation);
  }

  /**
   * Translates the graph node in world-space by the specified translation vector. This function
   * has two valid signatures: you can either pass a 3D vector or 3 numbers to specify the
   * world-space translation.
   *
   * @param {Vec3|number} x - 3-dimensional vector holding world-space translation or
   * x-coordinate of world-space translation.
   * @param {number} [y] - Y-coordinate of world-space translation.
   * @param {number} [z] - Z-coordinate of world-space translation.
   * @example
   * // Translate via 3 numbers
   * this.entity.translate(10, 0, 0);
   * @example
   * // Translate via vector
   * const t = new pc.Vec3(10, 0, 0);
   * this.entity.translate(t);
   */
  translate(x, y, z) {
    if (x instanceof Vec3) {
      position.copy(x);
    } else {
      position.set(x, y, z);
    }
    position.add(this.getPosition());
    this.setPosition(position);
  }

  /**
   * Translates the graph node in local-space by the specified translation vector. This function
   * has two valid signatures: you can either pass a 3D vector or 3 numbers to specify the
   * local-space translation.
   *
   * @param {Vec3|number} x - 3-dimensional vector holding local-space translation or
   * x-coordinate of local-space translation.
   * @param {number} [y] - Y-coordinate of local-space translation.
   * @param {number} [z] - Z-coordinate of local-space translation.
   * @example
   * // Translate via 3 numbers
   * this.entity.translateLocal(10, 0, 0);
   * @example
   * // Translate via vector
   * const t = new pc.Vec3(10, 0, 0);
   * this.entity.translateLocal(t);
   */
  translateLocal(x, y, z) {
    if (x instanceof Vec3) {
      position.copy(x);
    } else {
      position.set(x, y, z);
    }
    this.localRotation.transformVector(position, position);
    this.localPosition.add(position);
    if (!this._dirtyLocal) this._dirtifyLocal();
  }

  /**
   * Rotates the graph node in world-space by the specified Euler angles. Eulers are specified in
   * degrees in XYZ order. This function has two valid signatures: you can either pass a 3D
   * vector or 3 numbers to specify the world-space rotation.
   *
   * @param {Vec3|number} x - 3-dimensional vector holding world-space rotation or
   * rotation around world-space x-axis in degrees.
   * @param {number} [y] - Rotation around world-space y-axis in degrees.
   * @param {number} [z] - Rotation around world-space z-axis in degrees.
   * @example
   * // Rotate via 3 numbers
   * this.entity.rotate(0, 90, 0);
   * @example
   * // Rotate via vector
   * const r = new pc.Vec3(0, 90, 0);
   * this.entity.rotate(r);
   */
  rotate(x, y, z) {
    rotation.setFromEulerAngles(x, y, z);
    if (this._parent === null) {
      this.localRotation.mul2(rotation, this.localRotation);
    } else {
      const rot = this.getRotation();
      const parentRot = this._parent.getRotation();
      invParentRot.copy(parentRot).invert();
      rotation.mul2(invParentRot, rotation);
      this.localRotation.mul2(rotation, rot);
    }
    if (!this._dirtyLocal) this._dirtifyLocal();
  }

  /**
   * Rotates the graph node in local-space by the specified Euler angles. Eulers are specified in
   * degrees in XYZ order. This function has two valid signatures: you can either pass a 3D
   * vector or 3 numbers to specify the local-space rotation.
   *
   * @param {Vec3|number} x - 3-dimensional vector holding local-space rotation or
   * rotation around local-space x-axis in degrees.
   * @param {number} [y] - Rotation around local-space y-axis in degrees.
   * @param {number} [z] - Rotation around local-space z-axis in degrees.
   * @example
   * // Rotate via 3 numbers
   * this.entity.rotateLocal(0, 90, 0);
   * @example
   * // Rotate via vector
   * const r = new pc.Vec3(0, 90, 0);
   * this.entity.rotateLocal(r);
   */
  rotateLocal(x, y, z) {
    rotation.setFromEulerAngles(x, y, z);
    this.localRotation.mul(rotation);
    if (!this._dirtyLocal) this._dirtifyLocal();
  }
}

export { GraphNode };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ3JhcGgtbm9kZS5qcyIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL3NjZW5lL2dyYXBoLW5vZGUuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgRXZlbnRIYW5kbGVyIH0gZnJvbSAnLi4vY29yZS9ldmVudC1oYW5kbGVyLmpzJztcbmltcG9ydCB7IFRhZ3MgfSBmcm9tICcuLi9jb3JlL3RhZ3MuanMnO1xuaW1wb3J0IHsgRGVidWcgfSBmcm9tICcuLi9jb3JlL2RlYnVnLmpzJztcblxuaW1wb3J0IHsgTWF0MyB9IGZyb20gJy4uL2NvcmUvbWF0aC9tYXQzLmpzJztcbmltcG9ydCB7IE1hdDQgfSBmcm9tICcuLi9jb3JlL21hdGgvbWF0NC5qcyc7XG5pbXBvcnQgeyBRdWF0IH0gZnJvbSAnLi4vY29yZS9tYXRoL3F1YXQuanMnO1xuaW1wb3J0IHsgVmVjMyB9IGZyb20gJy4uL2NvcmUvbWF0aC92ZWMzLmpzJztcblxuY29uc3Qgc2NhbGVDb21wZW5zYXRlUG9zVHJhbnNmb3JtID0gbmV3IE1hdDQoKTtcbmNvbnN0IHNjYWxlQ29tcGVuc2F0ZVBvcyA9IG5ldyBWZWMzKCk7XG5jb25zdCBzY2FsZUNvbXBlbnNhdGVSb3QgPSBuZXcgUXVhdCgpO1xuY29uc3Qgc2NhbGVDb21wZW5zYXRlUm90MiA9IG5ldyBRdWF0KCk7XG5jb25zdCBzY2FsZUNvbXBlbnNhdGVTY2FsZSA9IG5ldyBWZWMzKCk7XG5jb25zdCBzY2FsZUNvbXBlbnNhdGVTY2FsZUZvclBhcmVudCA9IG5ldyBWZWMzKCk7XG5jb25zdCB0bXBNYXQ0ID0gbmV3IE1hdDQoKTtcbmNvbnN0IHRtcFF1YXQgPSBuZXcgUXVhdCgpO1xuY29uc3QgcG9zaXRpb24gPSBuZXcgVmVjMygpO1xuY29uc3QgaW52UGFyZW50V3RtID0gbmV3IE1hdDQoKTtcbmNvbnN0IHJvdGF0aW9uID0gbmV3IFF1YXQoKTtcbmNvbnN0IGludlBhcmVudFJvdCA9IG5ldyBRdWF0KCk7XG5jb25zdCBtYXRyaXggPSBuZXcgTWF0NCgpO1xuY29uc3QgdGFyZ2V0ID0gbmV3IFZlYzMoKTtcbmNvbnN0IHVwID0gbmV3IFZlYzMoKTtcblxuLyoqXG4gKiBDYWxsYmFjayB1c2VkIGJ5IHtAbGluayBHcmFwaE5vZGUjZmluZH0gYW5kIHtAbGluayBHcmFwaE5vZGUjZmluZE9uZX0gdG8gc2VhcmNoIHRocm91Z2ggYSBncmFwaFxuICogbm9kZSBhbmQgYWxsIG9mIGl0cyBkZXNjZW5kYW50cy5cbiAqXG4gKiBAY2FsbGJhY2sgRmluZE5vZGVDYWxsYmFja1xuICogQHBhcmFtIHtHcmFwaE5vZGV9IG5vZGUgLSBUaGUgY3VycmVudCBncmFwaCBub2RlLlxuICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybmluZyBgdHJ1ZWAgd2lsbCByZXN1bHQgaW4gdGhhdCBub2RlIGJlaW5nIHJldHVybmVkIGZyb21cbiAqIHtAbGluayBHcmFwaE5vZGUjZmluZH0gb3Ige0BsaW5rIEdyYXBoTm9kZSNmaW5kT25lfS5cbiAqL1xuXG4vKipcbiAqIENhbGxiYWNrIHVzZWQgYnkge0BsaW5rIEdyYXBoTm9kZSNmb3JFYWNofSB0byBpdGVyYXRlIHRocm91Z2ggYSBncmFwaCBub2RlIGFuZCBhbGwgb2YgaXRzXG4gKiBkZXNjZW5kYW50cy5cbiAqXG4gKiBAY2FsbGJhY2sgRm9yRWFjaE5vZGVDYWxsYmFja1xuICogQHBhcmFtIHtHcmFwaE5vZGV9IG5vZGUgLSBUaGUgY3VycmVudCBncmFwaCBub2RlLlxuICovXG5cbi8qKlxuICogQSBoaWVyYXJjaGljYWwgc2NlbmUgbm9kZS5cbiAqXG4gKiBAYXVnbWVudHMgRXZlbnRIYW5kbGVyXG4gKi9cbmNsYXNzIEdyYXBoTm9kZSBleHRlbmRzIEV2ZW50SGFuZGxlciB7XG4gICAgLyoqXG4gICAgICogVGhlIG5vbi11bmlxdWUgbmFtZSBvZiBhIGdyYXBoIG5vZGUuIERlZmF1bHRzIHRvICdVbnRpdGxlZCcuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7c3RyaW5nfVxuICAgICAqL1xuICAgIG5hbWU7XG5cbiAgICAvKipcbiAgICAgKiBJbnRlcmZhY2UgZm9yIHRhZ2dpbmcgZ3JhcGggbm9kZXMuIFRhZyBiYXNlZCBzZWFyY2hlcyBjYW4gYmUgcGVyZm9ybWVkIHVzaW5nIHRoZVxuICAgICAqIHtAbGluayBHcmFwaE5vZGUjZmluZEJ5VGFnfSBmdW5jdGlvbi5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtUYWdzfVxuICAgICAqL1xuICAgIHRhZ3MgPSBuZXcgVGFncyh0aGlzKTtcblxuICAgIC8qKiBAcHJpdmF0ZSAqL1xuICAgIF9sYWJlbHMgPSB7fTtcblxuICAgIC8vIExvY2FsLXNwYWNlIHByb3BlcnRpZXMgb2YgdHJhbnNmb3JtIChvbmx5IGZpcnN0IDMgYXJlIHNldHRhYmxlIGJ5IHRoZSB1c2VyKVxuICAgIC8qKlxuICAgICAqIEB0eXBlIHtWZWMzfVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgbG9jYWxQb3NpdGlvbiA9IG5ldyBWZWMzKCk7XG5cbiAgICAvKipcbiAgICAgKiBAdHlwZSB7UXVhdH1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIGxvY2FsUm90YXRpb24gPSBuZXcgUXVhdCgpO1xuXG4gICAgLyoqXG4gICAgICogQHR5cGUge1ZlYzN9XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBsb2NhbFNjYWxlID0gbmV3IFZlYzMoMSwgMSwgMSk7XG5cbiAgICAvKipcbiAgICAgKiBAdHlwZSB7VmVjM31cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIGxvY2FsRXVsZXJBbmdsZXMgPSBuZXcgVmVjMygpOyAvLyBPbmx5IGNhbGN1bGF0ZWQgb24gcmVxdWVzdFxuXG4gICAgLy8gV29ybGQtc3BhY2UgcHJvcGVydGllcyBvZiB0cmFuc2Zvcm1cbiAgICAvKipcbiAgICAgKiBAdHlwZSB7VmVjM31cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIHBvc2l0aW9uID0gbmV3IFZlYzMoKTtcblxuICAgIC8qKlxuICAgICAqIEB0eXBlIHtRdWF0fVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgcm90YXRpb24gPSBuZXcgUXVhdCgpO1xuXG4gICAgLyoqXG4gICAgICogQHR5cGUge1ZlYzN9XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBldWxlckFuZ2xlcyA9IG5ldyBWZWMzKCk7XG5cbiAgICAvKipcbiAgICAgKiBAdHlwZSB7VmVjM3xudWxsfVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX3NjYWxlID0gbnVsbDtcblxuICAgIC8qKlxuICAgICAqIEB0eXBlIHtNYXQ0fVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgbG9jYWxUcmFuc2Zvcm0gPSBuZXcgTWF0NCgpO1xuXG4gICAgLyoqXG4gICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfZGlydHlMb2NhbCA9IGZhbHNlO1xuXG4gICAgLyoqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9hYWJiVmVyID0gMDtcblxuICAgIC8qKlxuICAgICAqIE1hcmtzIHRoZSBub2RlIHRvIGlnbm9yZSBoaWVyYXJjaHkgc3luYyBlbnRpcmVseSAoaW5jbHVkaW5nIGNoaWxkcmVuIG5vZGVzKS4gVGhlIGVuZ2luZSBjb2RlXG4gICAgICogYXV0b21hdGljYWxseSBmcmVlemVzIGFuZCB1bmZyZWV6ZXMgb2JqZWN0cyB3aGVuZXZlciByZXF1aXJlZC4gU2VncmVnYXRpbmcgZHluYW1pYyBhbmRcbiAgICAgKiBzdGF0aW9uYXJ5IG5vZGVzIGludG8gc3ViaGllcmFyY2hpZXMgYWxsb3dzIHRvIHJlZHVjZSBzeW5jIHRpbWUgc2lnbmlmaWNhbnRseS5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX2Zyb3plbiA9IGZhbHNlO1xuXG4gICAgLyoqXG4gICAgICogQHR5cGUge01hdDR9XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICB3b3JsZFRyYW5zZm9ybSA9IG5ldyBNYXQ0KCk7XG5cbiAgICAvKipcbiAgICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9kaXJ0eVdvcmxkID0gZmFsc2U7XG5cbiAgICAvKipcbiAgICAgKiBDYWNoZWQgdmFsdWUgcmVwcmVzZW50aW5nIHRoZSBuZWdhdGl2ZWx5IHNjYWxlZCB3b3JsZCB0cmFuc2Zvcm0uIElmIHRoZSB2YWx1ZSBpcyAwLCB0aGlzXG4gICAgICogbWFya3MgdGhpcyB2YWx1ZSBhcyBkaXJ0eSBhbmQgaXQgbmVlZHMgdG8gYmUgcmVjYWxjdWxhdGVkLiBJZiB0aGUgdmFsdWUgaXMgMSwgdGhlIHdvcmxkXG4gICAgICogdHJhbnNmb3JtIGlzIG5vdCBuZWdhdGl2ZWx5IHNjYWxlZC4gSWYgdGhlIHZhbHVlIGlzIC0xLCB0aGUgd29ybGQgdHJhbnNmb3JtIGlzIG5lZ2F0aXZlbHlcbiAgICAgKiBzY2FsZWQuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX3dvcmxkU2NhbGVTaWduID0gMDtcblxuICAgIC8qKlxuICAgICAqIEB0eXBlIHtNYXQzfVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX25vcm1hbE1hdHJpeCA9IG5ldyBNYXQzKCk7XG5cbiAgICAvKipcbiAgICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9kaXJ0eU5vcm1hbCA9IHRydWU7XG5cbiAgICAvKipcbiAgICAgKiBAdHlwZSB7VmVjM3xudWxsfVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX3JpZ2h0ID0gbnVsbDtcblxuICAgIC8qKlxuICAgICAqIEB0eXBlIHtWZWMzfG51bGx9XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfdXAgPSBudWxsO1xuXG4gICAgLyoqXG4gICAgICogQHR5cGUge1ZlYzN8bnVsbH1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9mb3J3YXJkID0gbnVsbDtcblxuICAgIC8qKlxuICAgICAqIEB0eXBlIHtHcmFwaE5vZGV8bnVsbH1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9wYXJlbnQgPSBudWxsO1xuXG4gICAgLyoqXG4gICAgICogQHR5cGUge0dyYXBoTm9kZVtdfVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX2NoaWxkcmVuID0gW107XG5cbiAgICAvKipcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX2dyYXBoRGVwdGggPSAwO1xuXG4gICAgLyoqXG4gICAgICogUmVwcmVzZW50cyBlbmFibGVkIHN0YXRlIG9mIHRoZSBlbnRpdHkuIElmIHRoZSBlbnRpdHkgaXMgZGlzYWJsZWQsIHRoZSBlbnRpdHkgaW5jbHVkaW5nIGFsbFxuICAgICAqIGNoaWxkcmVuIGFyZSBleGNsdWRlZCBmcm9tIHVwZGF0ZXMuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9lbmFibGVkID0gdHJ1ZTtcblxuICAgIC8qKlxuICAgICAqIFJlcHJlc2VudHMgZW5hYmxlZCBzdGF0ZSBvZiB0aGUgZW50aXR5IGluIHRoZSBoaWVyYXJjaHkuIEl0J3MgdHJ1ZSBvbmx5IGlmIHRoaXMgZW50aXR5IGFuZFxuICAgICAqIGFsbCBwYXJlbnQgZW50aXRpZXMgYWxsIHRoZSB3YXkgdG8gdGhlIHNjZW5lJ3Mgcm9vdCBhcmUgZW5hYmxlZC5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX2VuYWJsZWRJbkhpZXJhcmNoeSA9IGZhbHNlO1xuXG4gICAgLyoqXG4gICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICogQGlnbm9yZVxuICAgICAqL1xuICAgIHNjYWxlQ29tcGVuc2F0aW9uID0gZmFsc2U7XG5cbiAgICAvKipcbiAgICAgKiBDcmVhdGUgYSBuZXcgR3JhcGhOb2RlIGluc3RhbmNlLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IFtuYW1lXSAtIFRoZSBub24tdW5pcXVlIG5hbWUgb2YgYSBncmFwaCBub2RlLiBEZWZhdWx0cyB0byAnVW50aXRsZWQnLlxuICAgICAqL1xuICAgIGNvbnN0cnVjdG9yKG5hbWUgPSAnVW50aXRsZWQnKSB7XG4gICAgICAgIHN1cGVyKCk7XG5cbiAgICAgICAgdGhpcy5uYW1lID0gbmFtZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUaGUgbm9ybWFsaXplZCBsb2NhbCBzcGFjZSBYLWF4aXMgdmVjdG9yIG9mIHRoZSBncmFwaCBub2RlIGluIHdvcmxkIHNwYWNlLlxuICAgICAqXG4gICAgICogQHR5cGUge1ZlYzN9XG4gICAgICovXG4gICAgZ2V0IHJpZ2h0KCkge1xuICAgICAgICBpZiAoIXRoaXMuX3JpZ2h0KSB7XG4gICAgICAgICAgICB0aGlzLl9yaWdodCA9IG5ldyBWZWMzKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0V29ybGRUcmFuc2Zvcm0oKS5nZXRYKHRoaXMuX3JpZ2h0KS5ub3JtYWxpemUoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUaGUgbm9ybWFsaXplZCBsb2NhbCBzcGFjZSBZLWF4aXMgdmVjdG9yIG9mIHRoZSBncmFwaCBub2RlIGluIHdvcmxkIHNwYWNlLlxuICAgICAqXG4gICAgICogQHR5cGUge1ZlYzN9XG4gICAgICovXG4gICAgZ2V0IHVwKCkge1xuICAgICAgICBpZiAoIXRoaXMuX3VwKSB7XG4gICAgICAgICAgICB0aGlzLl91cCA9IG5ldyBWZWMzKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0V29ybGRUcmFuc2Zvcm0oKS5nZXRZKHRoaXMuX3VwKS5ub3JtYWxpemUoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUaGUgbm9ybWFsaXplZCBsb2NhbCBzcGFjZSBuZWdhdGl2ZSBaLWF4aXMgdmVjdG9yIG9mIHRoZSBncmFwaCBub2RlIGluIHdvcmxkIHNwYWNlLlxuICAgICAqXG4gICAgICogQHR5cGUge1ZlYzN9XG4gICAgICovXG4gICAgZ2V0IGZvcndhcmQoKSB7XG4gICAgICAgIGlmICghdGhpcy5fZm9yd2FyZCkge1xuICAgICAgICAgICAgdGhpcy5fZm9yd2FyZCA9IG5ldyBWZWMzKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0V29ybGRUcmFuc2Zvcm0oKS5nZXRaKHRoaXMuX2ZvcndhcmQpLm5vcm1hbGl6ZSgpLm11bFNjYWxhcigtMSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQSBtYXRyaXggdXNlZCB0byB0cmFuc2Zvcm0gdGhlIG5vcm1hbC5cbiAgICAgKlxuICAgICAqIEB0eXBlICB7TWF0M31cbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgZ2V0IG5vcm1hbE1hdHJpeCgpIHtcblxuICAgICAgICBjb25zdCBub3JtYWxNYXQgPSB0aGlzLl9ub3JtYWxNYXRyaXg7XG4gICAgICAgIGlmICh0aGlzLl9kaXJ0eU5vcm1hbCkge1xuICAgICAgICAgICAgbm9ybWFsTWF0LmludmVydE1hdDQodGhpcy5nZXRXb3JsZFRyYW5zZm9ybSgpKS50cmFuc3Bvc2UoKTtcbiAgICAgICAgICAgIHRoaXMuX2RpcnR5Tm9ybWFsID0gZmFsc2U7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gbm9ybWFsTWF0O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEVuYWJsZSBvciBkaXNhYmxlIGEgR3JhcGhOb2RlLiBJZiBvbmUgb2YgdGhlIEdyYXBoTm9kZSdzIHBhcmVudHMgaXMgZGlzYWJsZWQgdGhlcmUgd2lsbCBiZVxuICAgICAqIG5vIG90aGVyIHNpZGUgZWZmZWN0cy4gSWYgYWxsIHRoZSBwYXJlbnRzIGFyZSBlbmFibGVkIHRoZW4gdGhlIG5ldyB2YWx1ZSB3aWxsIGFjdGl2YXRlIG9yXG4gICAgICogZGVhY3RpdmF0ZSBhbGwgdGhlIGVuYWJsZWQgY2hpbGRyZW4gb2YgdGhlIEdyYXBoTm9kZS5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAqL1xuICAgIHNldCBlbmFibGVkKGVuYWJsZWQpIHtcbiAgICAgICAgaWYgKHRoaXMuX2VuYWJsZWQgIT09IGVuYWJsZWQpIHtcbiAgICAgICAgICAgIHRoaXMuX2VuYWJsZWQgPSBlbmFibGVkO1xuXG4gICAgICAgICAgICAvLyBpZiBlbmFibGluZyBlbnRpdHksIG1ha2UgYWxsIGNoaWxkcmVuIGVuYWJsZWQgaW4gaGllcmFyY2h5IG9ubHkgd2hlbiB0aGUgcGFyZW50IGlzIGFzIHdlbGxcbiAgICAgICAgICAgIC8vIGlmIGRpc2FibGluZyBlbnRpdHksIG1ha2UgYWxsIGNoaWxkcmVuIGRpc2FibGVkIGluIGhpZXJhcmNoeSBpbiBhbGwgY2FzZXNcbiAgICAgICAgICAgIGlmIChlbmFibGVkICYmIHRoaXMuX3BhcmVudD8uZW5hYmxlZCB8fCAhZW5hYmxlZCkge1xuICAgICAgICAgICAgICAgIHRoaXMuX25vdGlmeUhpZXJhcmNoeVN0YXRlQ2hhbmdlZCh0aGlzLCBlbmFibGVkKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGdldCBlbmFibGVkKCkge1xuICAgICAgICAvLyBtYWtlIHN1cmUgdG8gY2hlY2sgdGhpcy5fZW5hYmxlZCB0b28gYmVjYXVzZSBpZiB0aGF0XG4gICAgICAgIC8vIHdhcyBmYWxzZSB3aGVuIGEgcGFyZW50IHdhcyB1cGRhdGVkIHRoZSBfZW5hYmxlZEluSGllcmFyY2h5XG4gICAgICAgIC8vIGZsYWcgbWF5IG5vdCBoYXZlIGJlZW4gdXBkYXRlZCBmb3Igb3B0aW1pemF0aW9uIHB1cnBvc2VzXG4gICAgICAgIHJldHVybiB0aGlzLl9lbmFibGVkICYmIHRoaXMuX2VuYWJsZWRJbkhpZXJhcmNoeTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBIHJlYWQtb25seSBwcm9wZXJ0eSB0byBnZXQgYSBwYXJlbnQgZ3JhcGggbm9kZS5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtHcmFwaE5vZGV8bnVsbH1cbiAgICAgKi9cbiAgICBnZXQgcGFyZW50KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fcGFyZW50O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEEgcmVhZC1vbmx5IHByb3BlcnR5IHRvIGdldCB0aGUgcGF0aCBvZiB0aGUgZ3JhcGggbm9kZSByZWxhdGl2ZSB0byB0aGUgcm9vdCBvZiB0aGUgaGllcmFyY2h5LlxuICAgICAqXG4gICAgICogQHR5cGUge3N0cmluZ31cbiAgICAgKi9cbiAgICBnZXQgcGF0aCgpIHtcbiAgICAgICAgbGV0IG5vZGUgPSB0aGlzLl9wYXJlbnQ7XG4gICAgICAgIGlmICghbm9kZSkge1xuICAgICAgICAgICAgcmV0dXJuICcnO1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IHJlc3VsdCA9IHRoaXMubmFtZTtcbiAgICAgICAgd2hpbGUgKG5vZGUgJiYgbm9kZS5fcGFyZW50KSB7XG4gICAgICAgICAgICByZXN1bHQgPSBgJHtub2RlLm5hbWV9LyR7cmVzdWx0fWA7XG4gICAgICAgICAgICBub2RlID0gbm9kZS5fcGFyZW50O1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQSByZWFkLW9ubHkgcHJvcGVydHkgdG8gZ2V0IGhpZ2hlc3QgZ3JhcGggbm9kZSBmcm9tIGN1cnJlbnQgbm9kZS5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtHcmFwaE5vZGV9XG4gICAgICovXG4gICAgZ2V0IHJvb3QoKSB7XG4gICAgICAgIGxldCByZXN1bHQgPSB0aGlzO1xuICAgICAgICB3aGlsZSAocmVzdWx0Ll9wYXJlbnQpIHtcbiAgICAgICAgICAgIHJlc3VsdCA9IHJlc3VsdC5fcGFyZW50O1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQSByZWFkLW9ubHkgcHJvcGVydHkgdG8gZ2V0IHRoZSBjaGlsZHJlbiBvZiB0aGlzIGdyYXBoIG5vZGUuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7R3JhcGhOb2RlW119XG4gICAgICovXG4gICAgZ2V0IGNoaWxkcmVuKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fY2hpbGRyZW47XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQSByZWFkLW9ubHkgcHJvcGVydHkgdG8gZ2V0IHRoZSBkZXB0aCBvZiB0aGlzIGNoaWxkIHdpdGhpbiB0aGUgZ3JhcGguIE5vdGUgdGhhdCBmb3JcbiAgICAgKiBwZXJmb3JtYW5jZSByZWFzb25zIHRoaXMgaXMgb25seSByZWNhbGN1bGF0ZWQgd2hlbiBhIG5vZGUgaXMgYWRkZWQgdG8gYSBuZXcgcGFyZW50LCBpLmUuIEl0XG4gICAgICogaXMgbm90IHJlY2FsY3VsYXRlZCB3aGVuIGEgbm9kZSBpcyBzaW1wbHkgcmVtb3ZlZCBmcm9tIHRoZSBncmFwaC5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtudW1iZXJ9XG4gICAgICovXG4gICAgZ2V0IGdyYXBoRGVwdGgoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9ncmFwaERlcHRoO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7R3JhcGhOb2RlfSBub2RlIC0gR3JhcGggbm9kZSB0byB1cGRhdGUuXG4gICAgICogQHBhcmFtIHtib29sZWFufSBlbmFibGVkIC0gVHJ1ZSBpZiBlbmFibGVkIGluIHRoZSBoaWVyYXJjaHksIGZhbHNlIGlmIGRpc2FibGVkLlxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX25vdGlmeUhpZXJhcmNoeVN0YXRlQ2hhbmdlZChub2RlLCBlbmFibGVkKSB7XG4gICAgICAgIG5vZGUuX29uSGllcmFyY2h5U3RhdGVDaGFuZ2VkKGVuYWJsZWQpO1xuXG4gICAgICAgIGNvbnN0IGMgPSBub2RlLl9jaGlsZHJlbjtcbiAgICAgICAgZm9yIChsZXQgaSA9IDAsIGxlbiA9IGMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgICAgIGlmIChjW2ldLl9lbmFibGVkKVxuICAgICAgICAgICAgICAgIHRoaXMuX25vdGlmeUhpZXJhcmNoeVN0YXRlQ2hhbmdlZChjW2ldLCBlbmFibGVkKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENhbGxlZCB3aGVuIHRoZSBlbmFibGVkIGZsYWcgb2YgdGhlIGVudGl0eSBvciBvbmUgb2YgaXRzIHBhcmVudHMgY2hhbmdlcy5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gZW5hYmxlZCAtIFRydWUgaWYgZW5hYmxlZCBpbiB0aGUgaGllcmFyY2h5LCBmYWxzZSBpZiBkaXNhYmxlZC5cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9vbkhpZXJhcmNoeVN0YXRlQ2hhbmdlZChlbmFibGVkKSB7XG4gICAgICAgIC8vIE92ZXJyaWRlIGluIGRlcml2ZWQgY2xhc3Nlc1xuICAgICAgICB0aGlzLl9lbmFibGVkSW5IaWVyYXJjaHkgPSBlbmFibGVkO1xuICAgICAgICBpZiAoZW5hYmxlZCAmJiAhdGhpcy5fZnJvemVuKVxuICAgICAgICAgICAgdGhpcy5fdW5mcmVlemVQYXJlbnRUb1Jvb3QoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0ge3RoaXN9IGNsb25lIC0gVGhlIGNsb25lZCBncmFwaCBub2RlIHRvIGNvcHkgaW50by5cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9jbG9uZUludGVybmFsKGNsb25lKSB7XG4gICAgICAgIGNsb25lLm5hbWUgPSB0aGlzLm5hbWU7XG5cbiAgICAgICAgY29uc3QgdGFncyA9IHRoaXMudGFncy5fbGlzdDtcbiAgICAgICAgY2xvbmUudGFncy5jbGVhcigpO1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRhZ3MubGVuZ3RoOyBpKyspXG4gICAgICAgICAgICBjbG9uZS50YWdzLmFkZCh0YWdzW2ldKTtcblxuICAgICAgICBjbG9uZS5fbGFiZWxzID0gT2JqZWN0LmFzc2lnbih7fSwgdGhpcy5fbGFiZWxzKTtcblxuICAgICAgICBjbG9uZS5sb2NhbFBvc2l0aW9uLmNvcHkodGhpcy5sb2NhbFBvc2l0aW9uKTtcbiAgICAgICAgY2xvbmUubG9jYWxSb3RhdGlvbi5jb3B5KHRoaXMubG9jYWxSb3RhdGlvbik7XG4gICAgICAgIGNsb25lLmxvY2FsU2NhbGUuY29weSh0aGlzLmxvY2FsU2NhbGUpO1xuICAgICAgICBjbG9uZS5sb2NhbEV1bGVyQW5nbGVzLmNvcHkodGhpcy5sb2NhbEV1bGVyQW5nbGVzKTtcblxuICAgICAgICBjbG9uZS5wb3NpdGlvbi5jb3B5KHRoaXMucG9zaXRpb24pO1xuICAgICAgICBjbG9uZS5yb3RhdGlvbi5jb3B5KHRoaXMucm90YXRpb24pO1xuICAgICAgICBjbG9uZS5ldWxlckFuZ2xlcy5jb3B5KHRoaXMuZXVsZXJBbmdsZXMpO1xuXG4gICAgICAgIGNsb25lLmxvY2FsVHJhbnNmb3JtLmNvcHkodGhpcy5sb2NhbFRyYW5zZm9ybSk7XG4gICAgICAgIGNsb25lLl9kaXJ0eUxvY2FsID0gdGhpcy5fZGlydHlMb2NhbDtcblxuICAgICAgICBjbG9uZS53b3JsZFRyYW5zZm9ybS5jb3B5KHRoaXMud29ybGRUcmFuc2Zvcm0pO1xuICAgICAgICBjbG9uZS5fZGlydHlXb3JsZCA9IHRoaXMuX2RpcnR5V29ybGQ7XG4gICAgICAgIGNsb25lLl9kaXJ0eU5vcm1hbCA9IHRoaXMuX2RpcnR5Tm9ybWFsO1xuICAgICAgICBjbG9uZS5fYWFiYlZlciA9IHRoaXMuX2FhYmJWZXIgKyAxO1xuXG4gICAgICAgIGNsb25lLl9lbmFibGVkID0gdGhpcy5fZW5hYmxlZDtcblxuICAgICAgICBjbG9uZS5zY2FsZUNvbXBlbnNhdGlvbiA9IHRoaXMuc2NhbGVDb21wZW5zYXRpb247XG5cbiAgICAgICAgLy8gZmFsc2UgYXMgdGhpcyBub2RlIGlzIG5vdCBpbiB0aGUgaGllcmFyY2h5IHlldFxuICAgICAgICBjbG9uZS5fZW5hYmxlZEluSGllcmFyY2h5ID0gZmFsc2U7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ2xvbmUgYSBncmFwaCBub2RlLlxuICAgICAqXG4gICAgICogQHJldHVybnMge3RoaXN9IEEgY2xvbmUgb2YgdGhlIHNwZWNpZmllZCBncmFwaCBub2RlLlxuICAgICAqL1xuICAgIGNsb25lKCkge1xuICAgICAgICBjb25zdCBjbG9uZSA9IG5ldyB0aGlzLmNvbnN0cnVjdG9yKCk7XG4gICAgICAgIHRoaXMuX2Nsb25lSW50ZXJuYWwoY2xvbmUpO1xuICAgICAgICByZXR1cm4gY2xvbmU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ29weSBhIGdyYXBoIG5vZGUuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge0dyYXBoTm9kZX0gc291cmNlIC0gVGhlIGdyYXBoIG5vZGUgdG8gY29weS5cbiAgICAgKiBAcmV0dXJucyB7R3JhcGhOb2RlfSBUaGUgZGVzdGluYXRpb24gZ3JhcGggbm9kZS5cbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgY29weShzb3VyY2UpIHtcbiAgICAgICAgc291cmNlLl9jbG9uZUludGVybmFsKHRoaXMpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cblxuICAgIC8qKlxuICAgICAqIERldGFjaCBhIEdyYXBoTm9kZSBmcm9tIHRoZSBoaWVyYXJjaHkgYW5kIHJlY3Vyc2l2ZWx5IGRlc3Ryb3kgYWxsIGNoaWxkcmVuLlxuICAgICAqXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBjb25zdCBmaXJzdENoaWxkID0gdGhpcy5lbnRpdHkuY2hpbGRyZW5bMF07XG4gICAgICogZmlyc3RDaGlsZC5kZXN0cm95KCk7IC8vIGRlbGV0ZSBjaGlsZCwgYWxsIGNvbXBvbmVudHMgYW5kIHJlbW92ZSBmcm9tIGhpZXJhcmNoeVxuICAgICAqL1xuICAgIGRlc3Ryb3koKSB7XG4gICAgICAgIC8vIERldGFjaCBmcm9tIHBhcmVudFxuICAgICAgICB0aGlzLnJlbW92ZSgpO1xuXG4gICAgICAgIC8vIFJlY3Vyc2l2ZWx5IGRlc3Ryb3kgYWxsIGNoaWxkcmVuXG4gICAgICAgIGNvbnN0IGNoaWxkcmVuID0gdGhpcy5fY2hpbGRyZW47XG4gICAgICAgIHdoaWxlIChjaGlsZHJlbi5sZW5ndGgpIHtcbiAgICAgICAgICAgIC8vIFJlbW92ZSBsYXN0IGNoaWxkIGZyb20gdGhlIGFycmF5XG4gICAgICAgICAgICBjb25zdCBjaGlsZCA9IGNoaWxkcmVuLnBvcCgpO1xuICAgICAgICAgICAgLy8gRGlzY29ubmVjdCBpdCBmcm9tIHRoZSBwYXJlbnQ6IHRoaXMgaXMgb25seSBhbiBvcHRpbWl6YXRpb24gc3RlcCwgdG8gcHJldmVudCBjYWxsaW5nXG4gICAgICAgICAgICAvLyBHcmFwaE5vZGUjcmVtb3ZlQ2hpbGQgd2hpY2ggd291bGQgdHJ5IHRvIHJlZmluZCBpdCB2aWEgdGhpcy5fY2hpbGRyZW4uaW5kZXhPZiAod2hpY2hcbiAgICAgICAgICAgIC8vIHdpbGwgZmFpbCwgYmVjYXVzZSB3ZSBqdXN0IHJlbW92ZWQgaXQpLlxuICAgICAgICAgICAgY2hpbGQuX3BhcmVudCA9IG51bGw7XG4gICAgICAgICAgICBjaGlsZC5kZXN0cm95KCk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBmaXJlIGRlc3Ryb3kgZXZlbnRcbiAgICAgICAgdGhpcy5maXJlKCdkZXN0cm95JywgdGhpcyk7XG5cbiAgICAgICAgLy8gY2xlYXIgYWxsIGV2ZW50c1xuICAgICAgICB0aGlzLm9mZigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNlYXJjaCB0aGUgZ3JhcGggbm9kZSBhbmQgYWxsIG9mIGl0cyBkZXNjZW5kYW50cyBmb3IgdGhlIG5vZGVzIHRoYXQgc2F0aXNmeSBzb21lIHNlYXJjaFxuICAgICAqIGNyaXRlcmlhLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtGaW5kTm9kZUNhbGxiYWNrfHN0cmluZ30gYXR0ciAtIFRoaXMgY2FuIGVpdGhlciBiZSBhIGZ1bmN0aW9uIG9yIGEgc3RyaW5nLiBJZiBpdCdzIGFcbiAgICAgKiBmdW5jdGlvbiwgaXQgaXMgZXhlY3V0ZWQgZm9yIGVhY2ggZGVzY2VuZGFudCBub2RlIHRvIHRlc3QgaWYgbm9kZSBzYXRpc2ZpZXMgdGhlIHNlYXJjaFxuICAgICAqIGxvZ2ljLiBSZXR1cm5pbmcgdHJ1ZSBmcm9tIHRoZSBmdW5jdGlvbiB3aWxsIGluY2x1ZGUgdGhlIG5vZGUgaW50byB0aGUgcmVzdWx0cy4gSWYgaXQncyBhXG4gICAgICogc3RyaW5nIHRoZW4gaXQgcmVwcmVzZW50cyB0aGUgbmFtZSBvZiBhIGZpZWxkIG9yIGEgbWV0aG9kIG9mIHRoZSBub2RlLiBJZiB0aGlzIGlzIHRoZSBuYW1lXG4gICAgICogb2YgYSBmaWVsZCB0aGVuIHRoZSB2YWx1ZSBwYXNzZWQgYXMgdGhlIHNlY29uZCBhcmd1bWVudCB3aWxsIGJlIGNoZWNrZWQgZm9yIGVxdWFsaXR5LiBJZlxuICAgICAqIHRoaXMgaXMgdGhlIG5hbWUgb2YgYSBmdW5jdGlvbiB0aGVuIHRoZSByZXR1cm4gdmFsdWUgb2YgdGhlIGZ1bmN0aW9uIHdpbGwgYmUgY2hlY2tlZCBmb3JcbiAgICAgKiBlcXVhbGl0eSBhZ2FpbnN0IHRoZSB2YWx1ZWQgcGFzc2VkIGFzIHRoZSBzZWNvbmQgYXJndW1lbnQgdG8gdGhpcyBmdW5jdGlvbi5cbiAgICAgKiBAcGFyYW0ge29iamVjdH0gW3ZhbHVlXSAtIElmIHRoZSBmaXJzdCBhcmd1bWVudCAoYXR0cikgaXMgYSBwcm9wZXJ0eSBuYW1lIHRoZW4gdGhpcyB2YWx1ZVxuICAgICAqIHdpbGwgYmUgY2hlY2tlZCBhZ2FpbnN0IHRoZSB2YWx1ZSBvZiB0aGUgcHJvcGVydHkuXG4gICAgICogQHJldHVybnMge0dyYXBoTm9kZVtdfSBUaGUgYXJyYXkgb2YgZ3JhcGggbm9kZXMgdGhhdCBtYXRjaCB0aGUgc2VhcmNoIGNyaXRlcmlhLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogLy8gRmluZHMgYWxsIG5vZGVzIHRoYXQgaGF2ZSBhIG1vZGVsIGNvbXBvbmVudCBhbmQgaGF2ZSAnZG9vcicgaW4gdGhlaXIgbG93ZXItY2FzZWQgbmFtZVxuICAgICAqIGNvbnN0IGRvb3JzID0gaG91c2UuZmluZChmdW5jdGlvbiAobm9kZSkge1xuICAgICAqICAgICByZXR1cm4gbm9kZS5tb2RlbCAmJiBub2RlLm5hbWUudG9Mb3dlckNhc2UoKS5pbmRleE9mKCdkb29yJykgIT09IC0xO1xuICAgICAqIH0pO1xuICAgICAqIEBleGFtcGxlXG4gICAgICogLy8gRmluZHMgYWxsIG5vZGVzIHRoYXQgaGF2ZSB0aGUgbmFtZSBwcm9wZXJ0eSBzZXQgdG8gJ1Rlc3QnXG4gICAgICogY29uc3QgZW50aXRpZXMgPSBwYXJlbnQuZmluZCgnbmFtZScsICdUZXN0Jyk7XG4gICAgICovXG4gICAgZmluZChhdHRyLCB2YWx1ZSkge1xuICAgICAgICBsZXQgcmVzdWx0LCByZXN1bHRzID0gW107XG4gICAgICAgIGNvbnN0IGxlbiA9IHRoaXMuX2NoaWxkcmVuLmxlbmd0aDtcblxuICAgICAgICBpZiAoYXR0ciBpbnN0YW5jZW9mIEZ1bmN0aW9uKSB7XG4gICAgICAgICAgICBjb25zdCBmbiA9IGF0dHI7XG5cbiAgICAgICAgICAgIHJlc3VsdCA9IGZuKHRoaXMpO1xuICAgICAgICAgICAgaWYgKHJlc3VsdClcbiAgICAgICAgICAgICAgICByZXN1bHRzLnB1c2godGhpcyk7XG5cbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgICAgICAgICBjb25zdCBkZXNjZW5kYW50cyA9IHRoaXMuX2NoaWxkcmVuW2ldLmZpbmQoZm4pO1xuICAgICAgICAgICAgICAgIGlmIChkZXNjZW5kYW50cy5sZW5ndGgpXG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdHMgPSByZXN1bHRzLmNvbmNhdChkZXNjZW5kYW50cyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBsZXQgdGVzdFZhbHVlO1xuXG4gICAgICAgICAgICBpZiAodGhpc1thdHRyXSkge1xuICAgICAgICAgICAgICAgIGlmICh0aGlzW2F0dHJdIGluc3RhbmNlb2YgRnVuY3Rpb24pIHtcbiAgICAgICAgICAgICAgICAgICAgdGVzdFZhbHVlID0gdGhpc1thdHRyXSgpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHRlc3RWYWx1ZSA9IHRoaXNbYXR0cl07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmICh0ZXN0VmFsdWUgPT09IHZhbHVlKVxuICAgICAgICAgICAgICAgICAgICByZXN1bHRzLnB1c2godGhpcyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbGVuOyArK2kpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBkZXNjZW5kYW50cyA9IHRoaXMuX2NoaWxkcmVuW2ldLmZpbmQoYXR0ciwgdmFsdWUpO1xuICAgICAgICAgICAgICAgIGlmIChkZXNjZW5kYW50cy5sZW5ndGgpXG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdHMgPSByZXN1bHRzLmNvbmNhdChkZXNjZW5kYW50cyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcmVzdWx0cztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZWFyY2ggdGhlIGdyYXBoIG5vZGUgYW5kIGFsbCBvZiBpdHMgZGVzY2VuZGFudHMgZm9yIHRoZSBmaXJzdCBub2RlIHRoYXQgc2F0aXNmaWVzIHNvbWVcbiAgICAgKiBzZWFyY2ggY3JpdGVyaWEuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge0ZpbmROb2RlQ2FsbGJhY2t8c3RyaW5nfSBhdHRyIC0gVGhpcyBjYW4gZWl0aGVyIGJlIGEgZnVuY3Rpb24gb3IgYSBzdHJpbmcuIElmIGl0J3MgYVxuICAgICAqIGZ1bmN0aW9uLCBpdCBpcyBleGVjdXRlZCBmb3IgZWFjaCBkZXNjZW5kYW50IG5vZGUgdG8gdGVzdCBpZiBub2RlIHNhdGlzZmllcyB0aGUgc2VhcmNoXG4gICAgICogbG9naWMuIFJldHVybmluZyB0cnVlIGZyb20gdGhlIGZ1bmN0aW9uIHdpbGwgcmVzdWx0IGluIHRoYXQgbm9kZSBiZWluZyByZXR1cm5lZCBmcm9tXG4gICAgICogZmluZE9uZS4gSWYgaXQncyBhIHN0cmluZyB0aGVuIGl0IHJlcHJlc2VudHMgdGhlIG5hbWUgb2YgYSBmaWVsZCBvciBhIG1ldGhvZCBvZiB0aGUgbm9kZS4gSWZcbiAgICAgKiB0aGlzIGlzIHRoZSBuYW1lIG9mIGEgZmllbGQgdGhlbiB0aGUgdmFsdWUgcGFzc2VkIGFzIHRoZSBzZWNvbmQgYXJndW1lbnQgd2lsbCBiZSBjaGVja2VkIGZvclxuICAgICAqIGVxdWFsaXR5LiBJZiB0aGlzIGlzIHRoZSBuYW1lIG9mIGEgZnVuY3Rpb24gdGhlbiB0aGUgcmV0dXJuIHZhbHVlIG9mIHRoZSBmdW5jdGlvbiB3aWxsIGJlXG4gICAgICogY2hlY2tlZCBmb3IgZXF1YWxpdHkgYWdhaW5zdCB0aGUgdmFsdWVkIHBhc3NlZCBhcyB0aGUgc2Vjb25kIGFyZ3VtZW50IHRvIHRoaXMgZnVuY3Rpb24uXG4gICAgICogQHBhcmFtIHtvYmplY3R9IFt2YWx1ZV0gLSBJZiB0aGUgZmlyc3QgYXJndW1lbnQgKGF0dHIpIGlzIGEgcHJvcGVydHkgbmFtZSB0aGVuIHRoaXMgdmFsdWVcbiAgICAgKiB3aWxsIGJlIGNoZWNrZWQgYWdhaW5zdCB0aGUgdmFsdWUgb2YgdGhlIHByb3BlcnR5LlxuICAgICAqIEByZXR1cm5zIHtHcmFwaE5vZGV8bnVsbH0gQSBncmFwaCBub2RlIHRoYXQgbWF0Y2ggdGhlIHNlYXJjaCBjcml0ZXJpYS4gUmV0dXJucyBudWxsIGlmIG5vXG4gICAgICogbm9kZSBpcyBmb3VuZC5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIC8vIEZpbmQgdGhlIGZpcnN0IG5vZGUgdGhhdCBpcyBjYWxsZWQgJ2hlYWQnIGFuZCBoYXMgYSBtb2RlbCBjb21wb25lbnRcbiAgICAgKiBjb25zdCBoZWFkID0gcGxheWVyLmZpbmRPbmUoZnVuY3Rpb24gKG5vZGUpIHtcbiAgICAgKiAgICAgcmV0dXJuIG5vZGUubW9kZWwgJiYgbm9kZS5uYW1lID09PSAnaGVhZCc7XG4gICAgICogfSk7XG4gICAgICogQGV4YW1wbGVcbiAgICAgKiAvLyBGaW5kcyB0aGUgZmlyc3Qgbm9kZSB0aGF0IGhhcyB0aGUgbmFtZSBwcm9wZXJ0eSBzZXQgdG8gJ1Rlc3QnXG4gICAgICogY29uc3Qgbm9kZSA9IHBhcmVudC5maW5kT25lKCduYW1lJywgJ1Rlc3QnKTtcbiAgICAgKi9cbiAgICBmaW5kT25lKGF0dHIsIHZhbHVlKSB7XG4gICAgICAgIGNvbnN0IGxlbiA9IHRoaXMuX2NoaWxkcmVuLmxlbmd0aDtcbiAgICAgICAgbGV0IHJlc3VsdCA9IG51bGw7XG5cbiAgICAgICAgaWYgKGF0dHIgaW5zdGFuY2VvZiBGdW5jdGlvbikge1xuICAgICAgICAgICAgY29uc3QgZm4gPSBhdHRyO1xuXG4gICAgICAgICAgICByZXN1bHQgPSBmbih0aGlzKTtcbiAgICAgICAgICAgIGlmIChyZXN1bHQpXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG5cbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgICAgICAgICByZXN1bHQgPSB0aGlzLl9jaGlsZHJlbltpXS5maW5kT25lKGZuKTtcbiAgICAgICAgICAgICAgICBpZiAocmVzdWx0KVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbGV0IHRlc3RWYWx1ZTtcbiAgICAgICAgICAgIGlmICh0aGlzW2F0dHJdKSB7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXNbYXR0cl0gaW5zdGFuY2VvZiBGdW5jdGlvbikge1xuICAgICAgICAgICAgICAgICAgICB0ZXN0VmFsdWUgPSB0aGlzW2F0dHJdKCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgdGVzdFZhbHVlID0gdGhpc1thdHRyXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKHRlc3RWYWx1ZSA9PT0gdmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0ID0gdGhpcy5fY2hpbGRyZW5baV0uZmluZE9uZShhdHRyLCB2YWx1ZSk7XG4gICAgICAgICAgICAgICAgaWYgKHJlc3VsdCAhPT0gbnVsbClcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybiBhbGwgZ3JhcGggbm9kZXMgdGhhdCBzYXRpc2Z5IHRoZSBzZWFyY2ggcXVlcnkuIFF1ZXJ5IGNhbiBiZSBzaW1wbHkgYSBzdHJpbmcsIG9yIGNvbW1hXG4gICAgICogc2VwYXJhdGVkIHN0cmluZ3MsIHRvIGhhdmUgaW5jbHVzaXZlIHJlc3VsdHMgb2YgYXNzZXRzIHRoYXQgbWF0Y2ggYXQgbGVhc3Qgb25lIHF1ZXJ5LiBBXG4gICAgICogcXVlcnkgdGhhdCBjb25zaXN0cyBvZiBhbiBhcnJheSBvZiB0YWdzIGNhbiBiZSB1c2VkIHRvIG1hdGNoIGdyYXBoIG5vZGVzIHRoYXQgaGF2ZSBlYWNoIHRhZ1xuICAgICAqIG9mIGFycmF5LlxuICAgICAqXG4gICAgICogQHBhcmFtIHsuLi4qfSBxdWVyeSAtIE5hbWUgb2YgYSB0YWcgb3IgYXJyYXkgb2YgdGFncy5cbiAgICAgKiBAcmV0dXJucyB7R3JhcGhOb2RlW119IEEgbGlzdCBvZiBhbGwgZ3JhcGggbm9kZXMgdGhhdCBtYXRjaCB0aGUgcXVlcnkuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiAvLyBSZXR1cm4gYWxsIGdyYXBoIG5vZGVzIHRoYXQgdGFnZ2VkIGJ5IGBhbmltYWxgXG4gICAgICogY29uc3QgYW5pbWFscyA9IG5vZGUuZmluZEJ5VGFnKFwiYW5pbWFsXCIpO1xuICAgICAqIEBleGFtcGxlXG4gICAgICogLy8gUmV0dXJuIGFsbCBncmFwaCBub2RlcyB0aGF0IHRhZ2dlZCBieSBgYmlyZGAgT1IgYG1hbW1hbGBcbiAgICAgKiBjb25zdCBiaXJkc0FuZE1hbW1hbHMgPSBub2RlLmZpbmRCeVRhZyhcImJpcmRcIiwgXCJtYW1tYWxcIik7XG4gICAgICogQGV4YW1wbGVcbiAgICAgKiAvLyBSZXR1cm4gYWxsIGFzc2V0cyB0aGF0IHRhZ2dlZCBieSBgY2Fybml2b3JlYCBBTkQgYG1hbW1hbGBcbiAgICAgKiBjb25zdCBtZWF0RWF0aW5nTWFtbWFscyA9IG5vZGUuZmluZEJ5VGFnKFtcImNhcm5pdm9yZVwiLCBcIm1hbW1hbFwiXSk7XG4gICAgICogQGV4YW1wbGVcbiAgICAgKiAvLyBSZXR1cm4gYWxsIGFzc2V0cyB0aGF0IHRhZ2dlZCBieSAoYGNhcm5pdm9yZWAgQU5EIGBtYW1tYWxgKSBPUiAoYGNhcm5pdm9yZWAgQU5EIGByZXB0aWxlYClcbiAgICAgKiBjb25zdCBtZWF0RWF0aW5nTWFtbWFsc0FuZFJlcHRpbGVzID0gbm9kZS5maW5kQnlUYWcoW1wiY2Fybml2b3JlXCIsIFwibWFtbWFsXCJdLCBbXCJjYXJuaXZvcmVcIiwgXCJyZXB0aWxlXCJdKTtcbiAgICAgKi9cbiAgICBmaW5kQnlUYWcoKSB7XG4gICAgICAgIGNvbnN0IHF1ZXJ5ID0gYXJndW1lbnRzO1xuICAgICAgICBjb25zdCByZXN1bHRzID0gW107XG5cbiAgICAgICAgY29uc3QgcXVlcnlOb2RlID0gKG5vZGUsIGNoZWNrTm9kZSkgPT4ge1xuICAgICAgICAgICAgaWYgKGNoZWNrTm9kZSAmJiBub2RlLnRhZ3MuaGFzKC4uLnF1ZXJ5KSkge1xuICAgICAgICAgICAgICAgIHJlc3VsdHMucHVzaChub2RlKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBub2RlLl9jaGlsZHJlbi5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIHF1ZXJ5Tm9kZShub2RlLl9jaGlsZHJlbltpXSwgdHJ1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgcXVlcnlOb2RlKHRoaXMsIGZhbHNlKTtcblxuICAgICAgICByZXR1cm4gcmVzdWx0cztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBHZXQgdGhlIGZpcnN0IG5vZGUgZm91bmQgaW4gdGhlIGdyYXBoIHdpdGggdGhlIG5hbWUuIFRoZSBzZWFyY2ggaXMgZGVwdGggZmlyc3QuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gbmFtZSAtIFRoZSBuYW1lIG9mIHRoZSBncmFwaC5cbiAgICAgKiBAcmV0dXJucyB7R3JhcGhOb2RlfG51bGx9IFRoZSBmaXJzdCBub2RlIHRvIGJlIGZvdW5kIG1hdGNoaW5nIHRoZSBzdXBwbGllZCBuYW1lLiBSZXR1cm5zXG4gICAgICogbnVsbCBpZiBubyBub2RlIGlzIGZvdW5kLlxuICAgICAqL1xuICAgIGZpbmRCeU5hbWUobmFtZSkge1xuICAgICAgICBpZiAodGhpcy5uYW1lID09PSBuYW1lKSByZXR1cm4gdGhpcztcblxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuX2NoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBmb3VuZCA9IHRoaXMuX2NoaWxkcmVuW2ldLmZpbmRCeU5hbWUobmFtZSk7XG4gICAgICAgICAgICBpZiAoZm91bmQgIT09IG51bGwpIHJldHVybiBmb3VuZDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBHZXQgdGhlIGZpcnN0IG5vZGUgZm91bmQgaW4gdGhlIGdyYXBoIGJ5IGl0cyBmdWxsIHBhdGggaW4gdGhlIGdyYXBoLiBUaGUgZnVsbCBwYXRoIGhhcyB0aGlzXG4gICAgICogZm9ybSAncGFyZW50L2NoaWxkL3N1Yi1jaGlsZCcuIFRoZSBzZWFyY2ggaXMgZGVwdGggZmlyc3QuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ3xzdHJpbmdbXX0gcGF0aCAtIFRoZSBmdWxsIHBhdGggb2YgdGhlIHtAbGluayBHcmFwaE5vZGV9IGFzIGVpdGhlciBhIHN0cmluZyBvclxuICAgICAqIGFycmF5IG9mIHtAbGluayBHcmFwaE5vZGV9IG5hbWVzLlxuICAgICAqIEByZXR1cm5zIHtHcmFwaE5vZGV8bnVsbH0gVGhlIGZpcnN0IG5vZGUgdG8gYmUgZm91bmQgbWF0Y2hpbmcgdGhlIHN1cHBsaWVkIHBhdGguIFJldHVybnNcbiAgICAgKiBudWxsIGlmIG5vIG5vZGUgaXMgZm91bmQuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiAvLyBTdHJpbmcgZm9ybVxuICAgICAqIGNvbnN0IGdyYW5kY2hpbGQgPSB0aGlzLmVudGl0eS5maW5kQnlQYXRoKCdjaGlsZC9ncmFuZGNoaWxkJyk7XG4gICAgICogQGV4YW1wbGVcbiAgICAgKiAvLyBBcnJheSBmb3JtXG4gICAgICogY29uc3QgZ3JhbmRjaGlsZCA9IHRoaXMuZW50aXR5LmZpbmRCeVBhdGgoWydjaGlsZCcsICdncmFuZGNoaWxkJ10pO1xuICAgICAqL1xuICAgIGZpbmRCeVBhdGgocGF0aCkge1xuICAgICAgICAvLyBhY2NlcHQgZWl0aGVyIHN0cmluZyBwYXRoIHdpdGggJy8nIHNlcGFyYXRvcnMgb3IgYXJyYXkgb2YgcGFydHMuXG4gICAgICAgIGNvbnN0IHBhcnRzID0gQXJyYXkuaXNBcnJheShwYXRoKSA/IHBhdGggOiBwYXRoLnNwbGl0KCcvJyk7XG5cbiAgICAgICAgbGV0IHJlc3VsdCA9IHRoaXM7XG4gICAgICAgIGZvciAobGV0IGkgPSAwLCBpbWF4ID0gcGFydHMubGVuZ3RoOyBpIDwgaW1heDsgKytpKSB7XG4gICAgICAgICAgICByZXN1bHQgPSByZXN1bHQuY2hpbGRyZW4uZmluZChjID0+IGMubmFtZSA9PT0gcGFydHNbaV0pO1xuICAgICAgICAgICAgaWYgKCFyZXN1bHQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRXhlY3V0ZXMgYSBwcm92aWRlZCBmdW5jdGlvbiBvbmNlIG9uIHRoaXMgZ3JhcGggbm9kZSBhbmQgYWxsIG9mIGl0cyBkZXNjZW5kYW50cy5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7Rm9yRWFjaE5vZGVDYWxsYmFja30gY2FsbGJhY2sgLSBUaGUgZnVuY3Rpb24gdG8gZXhlY3V0ZSBvbiB0aGUgZ3JhcGggbm9kZSBhbmQgZWFjaFxuICAgICAqIGRlc2NlbmRhbnQuXG4gICAgICogQHBhcmFtIHtvYmplY3R9IFt0aGlzQXJnXSAtIE9wdGlvbmFsIHZhbHVlIHRvIHVzZSBhcyB0aGlzIHdoZW4gZXhlY3V0aW5nIGNhbGxiYWNrIGZ1bmN0aW9uLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogLy8gTG9nIHRoZSBwYXRoIGFuZCBuYW1lIG9mIGVhY2ggbm9kZSBpbiBkZXNjZW5kYW50IHRyZWUgc3RhcnRpbmcgd2l0aCBcInBhcmVudFwiXG4gICAgICogcGFyZW50LmZvckVhY2goZnVuY3Rpb24gKG5vZGUpIHtcbiAgICAgKiAgICAgY29uc29sZS5sb2cobm9kZS5wYXRoICsgXCIvXCIgKyBub2RlLm5hbWUpO1xuICAgICAqIH0pO1xuICAgICAqL1xuICAgIGZvckVhY2goY2FsbGJhY2ssIHRoaXNBcmcpIHtcbiAgICAgICAgY2FsbGJhY2suY2FsbCh0aGlzQXJnLCB0aGlzKTtcblxuICAgICAgICBjb25zdCBjaGlsZHJlbiA9IHRoaXMuX2NoaWxkcmVuO1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBjaGlsZHJlbltpXS5mb3JFYWNoKGNhbGxiYWNrLCB0aGlzQXJnKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENoZWNrIGlmIG5vZGUgaXMgZGVzY2VuZGFudCBvZiBhbm90aGVyIG5vZGUuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge0dyYXBoTm9kZX0gbm9kZSAtIFBvdGVudGlhbCBhbmNlc3RvciBvZiBub2RlLlxuICAgICAqIEByZXR1cm5zIHtib29sZWFufSBJZiBub2RlIGlzIGRlc2NlbmRhbnQgb2YgYW5vdGhlciBub2RlLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogaWYgKHJvb2YuaXNEZXNjZW5kYW50T2YoaG91c2UpKSB7XG4gICAgICogICAgIC8vIHJvb2YgaXMgZGVzY2VuZGFudCBvZiBob3VzZSBlbnRpdHlcbiAgICAgKiB9XG4gICAgICovXG4gICAgaXNEZXNjZW5kYW50T2Yobm9kZSkge1xuICAgICAgICBsZXQgcGFyZW50ID0gdGhpcy5fcGFyZW50O1xuICAgICAgICB3aGlsZSAocGFyZW50KSB7XG4gICAgICAgICAgICBpZiAocGFyZW50ID09PSBub2RlKVxuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuXG4gICAgICAgICAgICBwYXJlbnQgPSBwYXJlbnQuX3BhcmVudDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ2hlY2sgaWYgbm9kZSBpcyBhbmNlc3RvciBmb3IgYW5vdGhlciBub2RlLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtHcmFwaE5vZGV9IG5vZGUgLSBQb3RlbnRpYWwgZGVzY2VuZGFudCBvZiBub2RlLlxuICAgICAqIEByZXR1cm5zIHtib29sZWFufSBJZiBub2RlIGlzIGFuY2VzdG9yIGZvciBhbm90aGVyIG5vZGUuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBpZiAoYm9keS5pc0FuY2VzdG9yT2YoZm9vdCkpIHtcbiAgICAgKiAgICAgLy8gZm9vdCBpcyB3aXRoaW4gYm9keSdzIGhpZXJhcmNoeVxuICAgICAqIH1cbiAgICAgKi9cbiAgICBpc0FuY2VzdG9yT2Yobm9kZSkge1xuICAgICAgICByZXR1cm4gbm9kZS5pc0Rlc2NlbmRhbnRPZih0aGlzKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBHZXQgdGhlIHdvcmxkIHNwYWNlIHJvdGF0aW9uIGZvciB0aGUgc3BlY2lmaWVkIEdyYXBoTm9kZSBpbiBFdWxlciBhbmdsZSBmb3JtLiBUaGUgcm90YXRpb25cbiAgICAgKiBpcyByZXR1cm5lZCBhcyBldWxlciBhbmdsZXMgaW4gYSB7QGxpbmsgVmVjM30uIFRoZSB2YWx1ZSByZXR1cm5lZCBieSB0aGlzIGZ1bmN0aW9uIHNob3VsZCBiZVxuICAgICAqIGNvbnNpZGVyZWQgcmVhZC1vbmx5LiBJbiBvcmRlciB0byBzZXQgdGhlIHdvcmxkLXNwYWNlIHJvdGF0aW9uIG9mIHRoZSBncmFwaCBub2RlLCB1c2VcbiAgICAgKiB7QGxpbmsgR3JhcGhOb2RlI3NldEV1bGVyQW5nbGVzfS5cbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtWZWMzfSBUaGUgd29ybGQgc3BhY2Ugcm90YXRpb24gb2YgdGhlIGdyYXBoIG5vZGUgaW4gRXVsZXIgYW5nbGUgZm9ybS5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGNvbnN0IGFuZ2xlcyA9IHRoaXMuZW50aXR5LmdldEV1bGVyQW5nbGVzKCk7XG4gICAgICogYW5nbGVzLnkgPSAxODA7IC8vIHJvdGF0ZSB0aGUgZW50aXR5IGFyb3VuZCBZIGJ5IDE4MCBkZWdyZWVzXG4gICAgICogdGhpcy5lbnRpdHkuc2V0RXVsZXJBbmdsZXMoYW5nbGVzKTtcbiAgICAgKi9cbiAgICBnZXRFdWxlckFuZ2xlcygpIHtcbiAgICAgICAgdGhpcy5nZXRXb3JsZFRyYW5zZm9ybSgpLmdldEV1bGVyQW5nbGVzKHRoaXMuZXVsZXJBbmdsZXMpO1xuICAgICAgICByZXR1cm4gdGhpcy5ldWxlckFuZ2xlcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBHZXQgdGhlIHJvdGF0aW9uIGluIGxvY2FsIHNwYWNlIGZvciB0aGUgc3BlY2lmaWVkIEdyYXBoTm9kZS4gVGhlIHJvdGF0aW9uIGlzIHJldHVybmVkIGFzXG4gICAgICogZXVsZXIgYW5nbGVzIGluIGEge0BsaW5rIFZlYzN9LiBUaGUgcmV0dXJuZWQgdmVjdG9yIHNob3VsZCBiZSBjb25zaWRlcmVkIHJlYWQtb25seS4gVG9cbiAgICAgKiB1cGRhdGUgdGhlIGxvY2FsIHJvdGF0aW9uLCB1c2Uge0BsaW5rIEdyYXBoTm9kZSNzZXRMb2NhbEV1bGVyQW5nbGVzfS5cbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtWZWMzfSBUaGUgbG9jYWwgc3BhY2Ugcm90YXRpb24gb2YgdGhlIGdyYXBoIG5vZGUgYXMgZXVsZXIgYW5nbGVzIGluIFhZWiBvcmRlci5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGNvbnN0IGFuZ2xlcyA9IHRoaXMuZW50aXR5LmdldExvY2FsRXVsZXJBbmdsZXMoKTtcbiAgICAgKiBhbmdsZXMueSA9IDE4MDtcbiAgICAgKiB0aGlzLmVudGl0eS5zZXRMb2NhbEV1bGVyQW5nbGVzKGFuZ2xlcyk7XG4gICAgICovXG4gICAgZ2V0TG9jYWxFdWxlckFuZ2xlcygpIHtcbiAgICAgICAgdGhpcy5sb2NhbFJvdGF0aW9uLmdldEV1bGVyQW5nbGVzKHRoaXMubG9jYWxFdWxlckFuZ2xlcyk7XG4gICAgICAgIHJldHVybiB0aGlzLmxvY2FsRXVsZXJBbmdsZXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogR2V0IHRoZSBwb3NpdGlvbiBpbiBsb2NhbCBzcGFjZSBmb3IgdGhlIHNwZWNpZmllZCBHcmFwaE5vZGUuIFRoZSBwb3NpdGlvbiBpcyByZXR1cm5lZCBhcyBhXG4gICAgICoge0BsaW5rIFZlYzN9LiBUaGUgcmV0dXJuZWQgdmVjdG9yIHNob3VsZCBiZSBjb25zaWRlcmVkIHJlYWQtb25seS4gVG8gdXBkYXRlIHRoZSBsb2NhbFxuICAgICAqIHBvc2l0aW9uLCB1c2Uge0BsaW5rIEdyYXBoTm9kZSNzZXRMb2NhbFBvc2l0aW9ufS5cbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtWZWMzfSBUaGUgbG9jYWwgc3BhY2UgcG9zaXRpb24gb2YgdGhlIGdyYXBoIG5vZGUuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBjb25zdCBwb3NpdGlvbiA9IHRoaXMuZW50aXR5LmdldExvY2FsUG9zaXRpb24oKTtcbiAgICAgKiBwb3NpdGlvbi54ICs9IDE7IC8vIG1vdmUgdGhlIGVudGl0eSAxIHVuaXQgYWxvbmcgeC5cbiAgICAgKiB0aGlzLmVudGl0eS5zZXRMb2NhbFBvc2l0aW9uKHBvc2l0aW9uKTtcbiAgICAgKi9cbiAgICBnZXRMb2NhbFBvc2l0aW9uKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5sb2NhbFBvc2l0aW9uO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEdldCB0aGUgcm90YXRpb24gaW4gbG9jYWwgc3BhY2UgZm9yIHRoZSBzcGVjaWZpZWQgR3JhcGhOb2RlLiBUaGUgcm90YXRpb24gaXMgcmV0dXJuZWQgYXMgYVxuICAgICAqIHtAbGluayBRdWF0fS4gVGhlIHJldHVybmVkIHF1YXRlcm5pb24gc2hvdWxkIGJlIGNvbnNpZGVyZWQgcmVhZC1vbmx5LiBUbyB1cGRhdGUgdGhlIGxvY2FsXG4gICAgICogcm90YXRpb24sIHVzZSB7QGxpbmsgR3JhcGhOb2RlI3NldExvY2FsUm90YXRpb259LlxuICAgICAqXG4gICAgICogQHJldHVybnMge1F1YXR9IFRoZSBsb2NhbCBzcGFjZSByb3RhdGlvbiBvZiB0aGUgZ3JhcGggbm9kZSBhcyBhIHF1YXRlcm5pb24uXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBjb25zdCByb3RhdGlvbiA9IHRoaXMuZW50aXR5LmdldExvY2FsUm90YXRpb24oKTtcbiAgICAgKi9cbiAgICBnZXRMb2NhbFJvdGF0aW9uKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5sb2NhbFJvdGF0aW9uO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEdldCB0aGUgc2NhbGUgaW4gbG9jYWwgc3BhY2UgZm9yIHRoZSBzcGVjaWZpZWQgR3JhcGhOb2RlLiBUaGUgc2NhbGUgaXMgcmV0dXJuZWQgYXMgYVxuICAgICAqIHtAbGluayBWZWMzfS4gVGhlIHJldHVybmVkIHZlY3RvciBzaG91bGQgYmUgY29uc2lkZXJlZCByZWFkLW9ubHkuIFRvIHVwZGF0ZSB0aGUgbG9jYWwgc2NhbGUsXG4gICAgICogdXNlIHtAbGluayBHcmFwaE5vZGUjc2V0TG9jYWxTY2FsZX0uXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7VmVjM30gVGhlIGxvY2FsIHNwYWNlIHNjYWxlIG9mIHRoZSBncmFwaCBub2RlLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogY29uc3Qgc2NhbGUgPSB0aGlzLmVudGl0eS5nZXRMb2NhbFNjYWxlKCk7XG4gICAgICogc2NhbGUueCA9IDEwMDtcbiAgICAgKiB0aGlzLmVudGl0eS5zZXRMb2NhbFNjYWxlKHNjYWxlKTtcbiAgICAgKi9cbiAgICBnZXRMb2NhbFNjYWxlKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5sb2NhbFNjYWxlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEdldCB0aGUgbG9jYWwgdHJhbnNmb3JtIG1hdHJpeCBmb3IgdGhpcyBncmFwaCBub2RlLiBUaGlzIG1hdHJpeCBpcyB0aGUgdHJhbnNmb3JtIHJlbGF0aXZlIHRvXG4gICAgICogdGhlIG5vZGUncyBwYXJlbnQncyB3b3JsZCB0cmFuc2Zvcm1hdGlvbiBtYXRyaXguXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7TWF0NH0gVGhlIG5vZGUncyBsb2NhbCB0cmFuc2Zvcm1hdGlvbiBtYXRyaXguXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBjb25zdCB0cmFuc2Zvcm0gPSB0aGlzLmVudGl0eS5nZXRMb2NhbFRyYW5zZm9ybSgpO1xuICAgICAqL1xuICAgIGdldExvY2FsVHJhbnNmb3JtKCkge1xuICAgICAgICBpZiAodGhpcy5fZGlydHlMb2NhbCkge1xuICAgICAgICAgICAgdGhpcy5sb2NhbFRyYW5zZm9ybS5zZXRUUlModGhpcy5sb2NhbFBvc2l0aW9uLCB0aGlzLmxvY2FsUm90YXRpb24sIHRoaXMubG9jYWxTY2FsZSk7XG4gICAgICAgICAgICB0aGlzLl9kaXJ0eUxvY2FsID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMubG9jYWxUcmFuc2Zvcm07XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogR2V0IHRoZSB3b3JsZCBzcGFjZSBwb3NpdGlvbiBmb3IgdGhlIHNwZWNpZmllZCBHcmFwaE5vZGUuIFRoZSBwb3NpdGlvbiBpcyByZXR1cm5lZCBhcyBhXG4gICAgICoge0BsaW5rIFZlYzN9LiBUaGUgdmFsdWUgcmV0dXJuZWQgYnkgdGhpcyBmdW5jdGlvbiBzaG91bGQgYmUgY29uc2lkZXJlZCByZWFkLW9ubHkuIEluIG9yZGVyXG4gICAgICogdG8gc2V0IHRoZSB3b3JsZC1zcGFjZSBwb3NpdGlvbiBvZiB0aGUgZ3JhcGggbm9kZSwgdXNlIHtAbGluayBHcmFwaE5vZGUjc2V0UG9zaXRpb259LlxuICAgICAqXG4gICAgICogQHJldHVybnMge1ZlYzN9IFRoZSB3b3JsZCBzcGFjZSBwb3NpdGlvbiBvZiB0aGUgZ3JhcGggbm9kZS5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGNvbnN0IHBvc2l0aW9uID0gdGhpcy5lbnRpdHkuZ2V0UG9zaXRpb24oKTtcbiAgICAgKiBwb3NpdGlvbi54ID0gMTA7XG4gICAgICogdGhpcy5lbnRpdHkuc2V0UG9zaXRpb24ocG9zaXRpb24pO1xuICAgICAqL1xuICAgIGdldFBvc2l0aW9uKCkge1xuICAgICAgICB0aGlzLmdldFdvcmxkVHJhbnNmb3JtKCkuZ2V0VHJhbnNsYXRpb24odGhpcy5wb3NpdGlvbik7XG4gICAgICAgIHJldHVybiB0aGlzLnBvc2l0aW9uO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEdldCB0aGUgd29ybGQgc3BhY2Ugcm90YXRpb24gZm9yIHRoZSBzcGVjaWZpZWQgR3JhcGhOb2RlLiBUaGUgcm90YXRpb24gaXMgcmV0dXJuZWQgYXMgYVxuICAgICAqIHtAbGluayBRdWF0fS4gVGhlIHZhbHVlIHJldHVybmVkIGJ5IHRoaXMgZnVuY3Rpb24gc2hvdWxkIGJlIGNvbnNpZGVyZWQgcmVhZC1vbmx5LiBJbiBvcmRlclxuICAgICAqIHRvIHNldCB0aGUgd29ybGQtc3BhY2Ugcm90YXRpb24gb2YgdGhlIGdyYXBoIG5vZGUsIHVzZSB7QGxpbmsgR3JhcGhOb2RlI3NldFJvdGF0aW9ufS5cbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtRdWF0fSBUaGUgd29ybGQgc3BhY2Ugcm90YXRpb24gb2YgdGhlIGdyYXBoIG5vZGUgYXMgYSBxdWF0ZXJuaW9uLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogY29uc3Qgcm90YXRpb24gPSB0aGlzLmVudGl0eS5nZXRSb3RhdGlvbigpO1xuICAgICAqL1xuICAgIGdldFJvdGF0aW9uKCkge1xuICAgICAgICB0aGlzLnJvdGF0aW9uLnNldEZyb21NYXQ0KHRoaXMuZ2V0V29ybGRUcmFuc2Zvcm0oKSk7XG4gICAgICAgIHJldHVybiB0aGlzLnJvdGF0aW9uO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEdldCB0aGUgd29ybGQgc3BhY2Ugc2NhbGUgZm9yIHRoZSBzcGVjaWZpZWQgR3JhcGhOb2RlLiBUaGUgcmV0dXJuZWQgdmFsdWUgd2lsbCBvbmx5IGJlXG4gICAgICogY29ycmVjdCBmb3IgZ3JhcGggbm9kZXMgdGhhdCBoYXZlIGEgbm9uLXNrZXdlZCB3b3JsZCB0cmFuc2Zvcm0gKGEgc2tldyBjYW4gYmUgaW50cm9kdWNlZCBieVxuICAgICAqIHRoZSBjb21wb3VuZGluZyBvZiByb3RhdGlvbnMgYW5kIHNjYWxlcyBoaWdoZXIgaW4gdGhlIGdyYXBoIG5vZGUgaGllcmFyY2h5KS4gVGhlIHNjYWxlIGlzXG4gICAgICogcmV0dXJuZWQgYXMgYSB7QGxpbmsgVmVjM30uIFRoZSB2YWx1ZSByZXR1cm5lZCBieSB0aGlzIGZ1bmN0aW9uIHNob3VsZCBiZSBjb25zaWRlcmVkXG4gICAgICogcmVhZC1vbmx5LiBOb3RlIHRoYXQgaXQgaXMgbm90IHBvc3NpYmxlIHRvIHNldCB0aGUgd29ybGQgc3BhY2Ugc2NhbGUgb2YgYSBncmFwaCBub2RlXG4gICAgICogZGlyZWN0bHkuXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7VmVjM30gVGhlIHdvcmxkIHNwYWNlIHNjYWxlIG9mIHRoZSBncmFwaCBub2RlLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogY29uc3Qgc2NhbGUgPSB0aGlzLmVudGl0eS5nZXRTY2FsZSgpO1xuICAgICAqIEBpZ25vcmVcbiAgICAgKi9cbiAgICBnZXRTY2FsZSgpIHtcbiAgICAgICAgaWYgKCF0aGlzLl9zY2FsZSkge1xuICAgICAgICAgICAgdGhpcy5fc2NhbGUgPSBuZXcgVmVjMygpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLmdldFdvcmxkVHJhbnNmb3JtKCkuZ2V0U2NhbGUodGhpcy5fc2NhbGUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEdldCB0aGUgd29ybGQgdHJhbnNmb3JtYXRpb24gbWF0cml4IGZvciB0aGlzIGdyYXBoIG5vZGUuXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7TWF0NH0gVGhlIG5vZGUncyB3b3JsZCB0cmFuc2Zvcm1hdGlvbiBtYXRyaXguXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBjb25zdCB0cmFuc2Zvcm0gPSB0aGlzLmVudGl0eS5nZXRXb3JsZFRyYW5zZm9ybSgpO1xuICAgICAqL1xuICAgIGdldFdvcmxkVHJhbnNmb3JtKCkge1xuICAgICAgICBpZiAoIXRoaXMuX2RpcnR5TG9jYWwgJiYgIXRoaXMuX2RpcnR5V29ybGQpXG4gICAgICAgICAgICByZXR1cm4gdGhpcy53b3JsZFRyYW5zZm9ybTtcblxuICAgICAgICBpZiAodGhpcy5fcGFyZW50KVxuICAgICAgICAgICAgdGhpcy5fcGFyZW50LmdldFdvcmxkVHJhbnNmb3JtKCk7XG5cbiAgICAgICAgdGhpcy5fc3luYygpO1xuXG4gICAgICAgIHJldHVybiB0aGlzLndvcmxkVHJhbnNmb3JtO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgY2FjaGVkIHZhbHVlIG9mIG5lZ2F0aXZlIHNjYWxlIG9mIHRoZSB3b3JsZCB0cmFuc2Zvcm0uXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7bnVtYmVyfSAtMSBpZiB3b3JsZCB0cmFuc2Zvcm0gaGFzIG5lZ2F0aXZlIHNjYWxlLCAxIG90aGVyd2lzZS5cbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgZ2V0IHdvcmxkU2NhbGVTaWduKCkge1xuXG4gICAgICAgIGlmICh0aGlzLl93b3JsZFNjYWxlU2lnbiA9PT0gMCkge1xuICAgICAgICAgICAgdGhpcy5fd29ybGRTY2FsZVNpZ24gPSB0aGlzLmdldFdvcmxkVHJhbnNmb3JtKCkuc2NhbGVTaWduO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHRoaXMuX3dvcmxkU2NhbGVTaWduO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJlbW92ZSBncmFwaCBub2RlIGZyb20gY3VycmVudCBwYXJlbnQuXG4gICAgICovXG4gICAgcmVtb3ZlKCkge1xuICAgICAgICB0aGlzLl9wYXJlbnQ/LnJlbW92ZUNoaWxkKHRoaXMpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJlbW92ZSBncmFwaCBub2RlIGZyb20gY3VycmVudCBwYXJlbnQgYW5kIGFkZCBhcyBjaGlsZCB0byBuZXcgcGFyZW50LlxuICAgICAqXG4gICAgICogQHBhcmFtIHtHcmFwaE5vZGV9IHBhcmVudCAtIE5ldyBwYXJlbnQgdG8gYXR0YWNoIGdyYXBoIG5vZGUgdG8uXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFtpbmRleF0gLSBUaGUgY2hpbGQgaW5kZXggd2hlcmUgdGhlIGNoaWxkIG5vZGUgc2hvdWxkIGJlIHBsYWNlZC5cbiAgICAgKi9cbiAgICByZXBhcmVudChwYXJlbnQsIGluZGV4KSB7XG4gICAgICAgIHRoaXMucmVtb3ZlKCk7XG4gICAgICAgIGlmIChwYXJlbnQpIHtcbiAgICAgICAgICAgIGlmIChpbmRleCA+PSAwKSB7XG4gICAgICAgICAgICAgICAgcGFyZW50Lmluc2VydENoaWxkKHRoaXMsIGluZGV4KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcGFyZW50LmFkZENoaWxkKHRoaXMpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyB0aGUgbG9jYWwtc3BhY2Ugcm90YXRpb24gb2YgdGhlIHNwZWNpZmllZCBncmFwaCBub2RlIHVzaW5nIGV1bGVyIGFuZ2xlcy4gRXVsZXJzIGFyZVxuICAgICAqIGludGVycHJldGVkIGluIFhZWiBvcmRlci4gRXVsZXJzIG11c3QgYmUgc3BlY2lmaWVkIGluIGRlZ3JlZXMuIFRoaXMgZnVuY3Rpb24gaGFzIHR3byB2YWxpZFxuICAgICAqIHNpZ25hdHVyZXM6IHlvdSBjYW4gZWl0aGVyIHBhc3MgYSAzRCB2ZWN0b3Igb3IgMyBudW1iZXJzIHRvIHNwZWNpZnkgdGhlIGxvY2FsLXNwYWNlIGV1bGVyXG4gICAgICogcm90YXRpb24uXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1ZlYzN8bnVtYmVyfSB4IC0gMy1kaW1lbnNpb25hbCB2ZWN0b3IgaG9sZGluZyBldWxlcnMgb3Igcm90YXRpb24gYXJvdW5kIGxvY2FsLXNwYWNlXG4gICAgICogeC1heGlzIGluIGRlZ3JlZXMuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFt5XSAtIFJvdGF0aW9uIGFyb3VuZCBsb2NhbC1zcGFjZSB5LWF4aXMgaW4gZGVncmVlcy5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gW3pdIC0gUm90YXRpb24gYXJvdW5kIGxvY2FsLXNwYWNlIHotYXhpcyBpbiBkZWdyZWVzLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogLy8gU2V0IHJvdGF0aW9uIG9mIDkwIGRlZ3JlZXMgYXJvdW5kIHktYXhpcyB2aWEgMyBudW1iZXJzXG4gICAgICogdGhpcy5lbnRpdHkuc2V0TG9jYWxFdWxlckFuZ2xlcygwLCA5MCwgMCk7XG4gICAgICogQGV4YW1wbGVcbiAgICAgKiAvLyBTZXQgcm90YXRpb24gb2YgOTAgZGVncmVlcyBhcm91bmQgeS1heGlzIHZpYSBhIHZlY3RvclxuICAgICAqIGNvbnN0IGFuZ2xlcyA9IG5ldyBwYy5WZWMzKDAsIDkwLCAwKTtcbiAgICAgKiB0aGlzLmVudGl0eS5zZXRMb2NhbEV1bGVyQW5nbGVzKGFuZ2xlcyk7XG4gICAgICovXG4gICAgc2V0TG9jYWxFdWxlckFuZ2xlcyh4LCB5LCB6KSB7XG4gICAgICAgIHRoaXMubG9jYWxSb3RhdGlvbi5zZXRGcm9tRXVsZXJBbmdsZXMoeCwgeSwgeik7XG5cbiAgICAgICAgaWYgKCF0aGlzLl9kaXJ0eUxvY2FsKVxuICAgICAgICAgICAgdGhpcy5fZGlydGlmeUxvY2FsKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyB0aGUgbG9jYWwtc3BhY2UgcG9zaXRpb24gb2YgdGhlIHNwZWNpZmllZCBncmFwaCBub2RlLiBUaGlzIGZ1bmN0aW9uIGhhcyB0d28gdmFsaWRcbiAgICAgKiBzaWduYXR1cmVzOiB5b3UgY2FuIGVpdGhlciBwYXNzIGEgM0QgdmVjdG9yIG9yIDMgbnVtYmVycyB0byBzcGVjaWZ5IHRoZSBsb2NhbC1zcGFjZVxuICAgICAqIHBvc2l0aW9uLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtWZWMzfG51bWJlcn0geCAtIDMtZGltZW5zaW9uYWwgdmVjdG9yIGhvbGRpbmcgbG9jYWwtc3BhY2UgcG9zaXRpb24gb3JcbiAgICAgKiB4LWNvb3JkaW5hdGUgb2YgbG9jYWwtc3BhY2UgcG9zaXRpb24uXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFt5XSAtIFktY29vcmRpbmF0ZSBvZiBsb2NhbC1zcGFjZSBwb3NpdGlvbi5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gW3pdIC0gWi1jb29yZGluYXRlIG9mIGxvY2FsLXNwYWNlIHBvc2l0aW9uLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogLy8gU2V0IHZpYSAzIG51bWJlcnNcbiAgICAgKiB0aGlzLmVudGl0eS5zZXRMb2NhbFBvc2l0aW9uKDAsIDEwLCAwKTtcbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIC8vIFNldCB2aWEgdmVjdG9yXG4gICAgICogY29uc3QgcG9zID0gbmV3IHBjLlZlYzMoMCwgMTAsIDApO1xuICAgICAqIHRoaXMuZW50aXR5LnNldExvY2FsUG9zaXRpb24ocG9zKTtcbiAgICAgKi9cbiAgICBzZXRMb2NhbFBvc2l0aW9uKHgsIHksIHopIHtcbiAgICAgICAgaWYgKHggaW5zdGFuY2VvZiBWZWMzKSB7XG4gICAgICAgICAgICB0aGlzLmxvY2FsUG9zaXRpb24uY29weSh4KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMubG9jYWxQb3NpdGlvbi5zZXQoeCwgeSwgeik7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIXRoaXMuX2RpcnR5TG9jYWwpXG4gICAgICAgICAgICB0aGlzLl9kaXJ0aWZ5TG9jYWwoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHRoZSBsb2NhbC1zcGFjZSByb3RhdGlvbiBvZiB0aGUgc3BlY2lmaWVkIGdyYXBoIG5vZGUuIFRoaXMgZnVuY3Rpb24gaGFzIHR3byB2YWxpZFxuICAgICAqIHNpZ25hdHVyZXM6IHlvdSBjYW4gZWl0aGVyIHBhc3MgYSBxdWF0ZXJuaW9uIG9yIDMgbnVtYmVycyB0byBzcGVjaWZ5IHRoZSBsb2NhbC1zcGFjZVxuICAgICAqIHJvdGF0aW9uLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtRdWF0fG51bWJlcn0geCAtIFF1YXRlcm5pb24gaG9sZGluZyBsb2NhbC1zcGFjZSByb3RhdGlvbiBvciB4LWNvbXBvbmVudCBvZlxuICAgICAqIGxvY2FsLXNwYWNlIHF1YXRlcm5pb24gcm90YXRpb24uXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFt5XSAtIFktY29tcG9uZW50IG9mIGxvY2FsLXNwYWNlIHF1YXRlcm5pb24gcm90YXRpb24uXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFt6XSAtIFotY29tcG9uZW50IG9mIGxvY2FsLXNwYWNlIHF1YXRlcm5pb24gcm90YXRpb24uXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFt3XSAtIFctY29tcG9uZW50IG9mIGxvY2FsLXNwYWNlIHF1YXRlcm5pb24gcm90YXRpb24uXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiAvLyBTZXQgdmlhIDQgbnVtYmVyc1xuICAgICAqIHRoaXMuZW50aXR5LnNldExvY2FsUm90YXRpb24oMCwgMCwgMCwgMSk7XG4gICAgICogQGV4YW1wbGVcbiAgICAgKiAvLyBTZXQgdmlhIHF1YXRlcm5pb25cbiAgICAgKiBjb25zdCBxID0gcGMuUXVhdCgpO1xuICAgICAqIHRoaXMuZW50aXR5LnNldExvY2FsUm90YXRpb24ocSk7XG4gICAgICovXG4gICAgc2V0TG9jYWxSb3RhdGlvbih4LCB5LCB6LCB3KSB7XG4gICAgICAgIGlmICh4IGluc3RhbmNlb2YgUXVhdCkge1xuICAgICAgICAgICAgdGhpcy5sb2NhbFJvdGF0aW9uLmNvcHkoeCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmxvY2FsUm90YXRpb24uc2V0KHgsIHksIHosIHcpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCF0aGlzLl9kaXJ0eUxvY2FsKVxuICAgICAgICAgICAgdGhpcy5fZGlydGlmeUxvY2FsKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyB0aGUgbG9jYWwtc3BhY2Ugc2NhbGUgZmFjdG9yIG9mIHRoZSBzcGVjaWZpZWQgZ3JhcGggbm9kZS4gVGhpcyBmdW5jdGlvbiBoYXMgdHdvIHZhbGlkXG4gICAgICogc2lnbmF0dXJlczogeW91IGNhbiBlaXRoZXIgcGFzcyBhIDNEIHZlY3RvciBvciAzIG51bWJlcnMgdG8gc3BlY2lmeSB0aGUgbG9jYWwtc3BhY2Ugc2NhbGUuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1ZlYzN8bnVtYmVyfSB4IC0gMy1kaW1lbnNpb25hbCB2ZWN0b3IgaG9sZGluZyBsb2NhbC1zcGFjZSBzY2FsZSBvciB4LWNvb3JkaW5hdGVcbiAgICAgKiBvZiBsb2NhbC1zcGFjZSBzY2FsZS5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gW3ldIC0gWS1jb29yZGluYXRlIG9mIGxvY2FsLXNwYWNlIHNjYWxlLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBbel0gLSBaLWNvb3JkaW5hdGUgb2YgbG9jYWwtc3BhY2Ugc2NhbGUuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiAvLyBTZXQgdmlhIDMgbnVtYmVyc1xuICAgICAqIHRoaXMuZW50aXR5LnNldExvY2FsU2NhbGUoMTAsIDEwLCAxMCk7XG4gICAgICogQGV4YW1wbGVcbiAgICAgKiAvLyBTZXQgdmlhIHZlY3RvclxuICAgICAqIGNvbnN0IHNjYWxlID0gbmV3IHBjLlZlYzMoMTAsIDEwLCAxMCk7XG4gICAgICogdGhpcy5lbnRpdHkuc2V0TG9jYWxTY2FsZShzY2FsZSk7XG4gICAgICovXG4gICAgc2V0TG9jYWxTY2FsZSh4LCB5LCB6KSB7XG4gICAgICAgIGlmICh4IGluc3RhbmNlb2YgVmVjMykge1xuICAgICAgICAgICAgdGhpcy5sb2NhbFNjYWxlLmNvcHkoeCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmxvY2FsU2NhbGUuc2V0KHgsIHksIHopO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCF0aGlzLl9kaXJ0eUxvY2FsKVxuICAgICAgICAgICAgdGhpcy5fZGlydGlmeUxvY2FsKCk7XG4gICAgfVxuXG4gICAgLyoqIEBwcml2YXRlICovXG4gICAgX2RpcnRpZnlMb2NhbCgpIHtcbiAgICAgICAgaWYgKCF0aGlzLl9kaXJ0eUxvY2FsKSB7XG4gICAgICAgICAgICB0aGlzLl9kaXJ0eUxvY2FsID0gdHJ1ZTtcbiAgICAgICAgICAgIGlmICghdGhpcy5fZGlydHlXb3JsZClcbiAgICAgICAgICAgICAgICB0aGlzLl9kaXJ0aWZ5V29ybGQoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKiBAcHJpdmF0ZSAqL1xuICAgIF91bmZyZWV6ZVBhcmVudFRvUm9vdCgpIHtcbiAgICAgICAgbGV0IHAgPSB0aGlzLl9wYXJlbnQ7XG4gICAgICAgIHdoaWxlIChwKSB7XG4gICAgICAgICAgICBwLl9mcm96ZW4gPSBmYWxzZTtcbiAgICAgICAgICAgIHAgPSBwLl9wYXJlbnQ7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKiogQHByaXZhdGUgKi9cbiAgICBfZGlydGlmeVdvcmxkKCkge1xuICAgICAgICBpZiAoIXRoaXMuX2RpcnR5V29ybGQpXG4gICAgICAgICAgICB0aGlzLl91bmZyZWV6ZVBhcmVudFRvUm9vdCgpO1xuICAgICAgICB0aGlzLl9kaXJ0aWZ5V29ybGRJbnRlcm5hbCgpO1xuICAgIH1cblxuICAgIC8qKiBAcHJpdmF0ZSAqL1xuICAgIF9kaXJ0aWZ5V29ybGRJbnRlcm5hbCgpIHtcbiAgICAgICAgaWYgKCF0aGlzLl9kaXJ0eVdvcmxkKSB7XG4gICAgICAgICAgICB0aGlzLl9mcm96ZW4gPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMuX2RpcnR5V29ybGQgPSB0cnVlO1xuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLl9jaGlsZHJlbi5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIGlmICghdGhpcy5fY2hpbGRyZW5baV0uX2RpcnR5V29ybGQpXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX2NoaWxkcmVuW2ldLl9kaXJ0aWZ5V29ybGRJbnRlcm5hbCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHRoaXMuX2RpcnR5Tm9ybWFsID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5fd29ybGRTY2FsZVNpZ24gPSAwOyAgIC8vIHdvcmxkIG1hdHJpeCBpcyBkaXJ0eSwgbWFyayB0aGlzIGZsYWcgZGlydHkgdG9vXG4gICAgICAgIHRoaXMuX2FhYmJWZXIrKztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHRoZSB3b3JsZC1zcGFjZSBwb3NpdGlvbiBvZiB0aGUgc3BlY2lmaWVkIGdyYXBoIG5vZGUuIFRoaXMgZnVuY3Rpb24gaGFzIHR3byB2YWxpZFxuICAgICAqIHNpZ25hdHVyZXM6IHlvdSBjYW4gZWl0aGVyIHBhc3MgYSAzRCB2ZWN0b3Igb3IgMyBudW1iZXJzIHRvIHNwZWNpZnkgdGhlIHdvcmxkLXNwYWNlXG4gICAgICogcG9zaXRpb24uXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1ZlYzN8bnVtYmVyfSB4IC0gMy1kaW1lbnNpb25hbCB2ZWN0b3IgaG9sZGluZyB3b3JsZC1zcGFjZSBwb3NpdGlvbiBvclxuICAgICAqIHgtY29vcmRpbmF0ZSBvZiB3b3JsZC1zcGFjZSBwb3NpdGlvbi5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gW3ldIC0gWS1jb29yZGluYXRlIG9mIHdvcmxkLXNwYWNlIHBvc2l0aW9uLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBbel0gLSBaLWNvb3JkaW5hdGUgb2Ygd29ybGQtc3BhY2UgcG9zaXRpb24uXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiAvLyBTZXQgdmlhIDMgbnVtYmVyc1xuICAgICAqIHRoaXMuZW50aXR5LnNldFBvc2l0aW9uKDAsIDEwLCAwKTtcbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIC8vIFNldCB2aWEgdmVjdG9yXG4gICAgICogY29uc3QgcG9zaXRpb24gPSBuZXcgcGMuVmVjMygwLCAxMCwgMCk7XG4gICAgICogdGhpcy5lbnRpdHkuc2V0UG9zaXRpb24ocG9zaXRpb24pO1xuICAgICAqL1xuICAgIHNldFBvc2l0aW9uKHgsIHksIHopIHtcbiAgICAgICAgaWYgKHggaW5zdGFuY2VvZiBWZWMzKSB7XG4gICAgICAgICAgICBwb3NpdGlvbi5jb3B5KHgpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcG9zaXRpb24uc2V0KHgsIHksIHopO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuX3BhcmVudCA9PT0gbnVsbCkge1xuICAgICAgICAgICAgdGhpcy5sb2NhbFBvc2l0aW9uLmNvcHkocG9zaXRpb24pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaW52UGFyZW50V3RtLmNvcHkodGhpcy5fcGFyZW50LmdldFdvcmxkVHJhbnNmb3JtKCkpLmludmVydCgpO1xuICAgICAgICAgICAgaW52UGFyZW50V3RtLnRyYW5zZm9ybVBvaW50KHBvc2l0aW9uLCB0aGlzLmxvY2FsUG9zaXRpb24pO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCF0aGlzLl9kaXJ0eUxvY2FsKVxuICAgICAgICAgICAgdGhpcy5fZGlydGlmeUxvY2FsKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyB0aGUgd29ybGQtc3BhY2Ugcm90YXRpb24gb2YgdGhlIHNwZWNpZmllZCBncmFwaCBub2RlLiBUaGlzIGZ1bmN0aW9uIGhhcyB0d28gdmFsaWRcbiAgICAgKiBzaWduYXR1cmVzOiB5b3UgY2FuIGVpdGhlciBwYXNzIGEgcXVhdGVybmlvbiBvciAzIG51bWJlcnMgdG8gc3BlY2lmeSB0aGUgd29ybGQtc3BhY2VcbiAgICAgKiByb3RhdGlvbi5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7UXVhdHxudW1iZXJ9IHggLSBRdWF0ZXJuaW9uIGhvbGRpbmcgd29ybGQtc3BhY2Ugcm90YXRpb24gb3IgeC1jb21wb25lbnQgb2ZcbiAgICAgKiB3b3JsZC1zcGFjZSBxdWF0ZXJuaW9uIHJvdGF0aW9uLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBbeV0gLSBZLWNvbXBvbmVudCBvZiB3b3JsZC1zcGFjZSBxdWF0ZXJuaW9uIHJvdGF0aW9uLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBbel0gLSBaLWNvbXBvbmVudCBvZiB3b3JsZC1zcGFjZSBxdWF0ZXJuaW9uIHJvdGF0aW9uLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBbd10gLSBXLWNvbXBvbmVudCBvZiB3b3JsZC1zcGFjZSBxdWF0ZXJuaW9uIHJvdGF0aW9uLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogLy8gU2V0IHZpYSA0IG51bWJlcnNcbiAgICAgKiB0aGlzLmVudGl0eS5zZXRSb3RhdGlvbigwLCAwLCAwLCAxKTtcbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIC8vIFNldCB2aWEgcXVhdGVybmlvblxuICAgICAqIGNvbnN0IHEgPSBwYy5RdWF0KCk7XG4gICAgICogdGhpcy5lbnRpdHkuc2V0Um90YXRpb24ocSk7XG4gICAgICovXG4gICAgc2V0Um90YXRpb24oeCwgeSwgeiwgdykge1xuICAgICAgICBpZiAoeCBpbnN0YW5jZW9mIFF1YXQpIHtcbiAgICAgICAgICAgIHJvdGF0aW9uLmNvcHkoeCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByb3RhdGlvbi5zZXQoeCwgeSwgeiwgdyk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5fcGFyZW50ID09PSBudWxsKSB7XG4gICAgICAgICAgICB0aGlzLmxvY2FsUm90YXRpb24uY29weShyb3RhdGlvbik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zdCBwYXJlbnRSb3QgPSB0aGlzLl9wYXJlbnQuZ2V0Um90YXRpb24oKTtcbiAgICAgICAgICAgIGludlBhcmVudFJvdC5jb3B5KHBhcmVudFJvdCkuaW52ZXJ0KCk7XG4gICAgICAgICAgICB0aGlzLmxvY2FsUm90YXRpb24uY29weShpbnZQYXJlbnRSb3QpLm11bChyb3RhdGlvbik7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIXRoaXMuX2RpcnR5TG9jYWwpXG4gICAgICAgICAgICB0aGlzLl9kaXJ0aWZ5TG9jYWwoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHRoZSB3b3JsZC1zcGFjZSByb3RhdGlvbiBvZiB0aGUgc3BlY2lmaWVkIGdyYXBoIG5vZGUgdXNpbmcgZXVsZXIgYW5nbGVzLiBFdWxlcnMgYXJlXG4gICAgICogaW50ZXJwcmV0ZWQgaW4gWFlaIG9yZGVyLiBFdWxlcnMgbXVzdCBiZSBzcGVjaWZpZWQgaW4gZGVncmVlcy4gVGhpcyBmdW5jdGlvbiBoYXMgdHdvIHZhbGlkXG4gICAgICogc2lnbmF0dXJlczogeW91IGNhbiBlaXRoZXIgcGFzcyBhIDNEIHZlY3RvciBvciAzIG51bWJlcnMgdG8gc3BlY2lmeSB0aGUgd29ybGQtc3BhY2UgZXVsZXJcbiAgICAgKiByb3RhdGlvbi5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7VmVjM3xudW1iZXJ9IHggLSAzLWRpbWVuc2lvbmFsIHZlY3RvciBob2xkaW5nIGV1bGVycyBvciByb3RhdGlvbiBhcm91bmQgd29ybGQtc3BhY2VcbiAgICAgKiB4LWF4aXMgaW4gZGVncmVlcy5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gW3ldIC0gUm90YXRpb24gYXJvdW5kIHdvcmxkLXNwYWNlIHktYXhpcyBpbiBkZWdyZWVzLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBbel0gLSBSb3RhdGlvbiBhcm91bmQgd29ybGQtc3BhY2Ugei1heGlzIGluIGRlZ3JlZXMuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiAvLyBTZXQgcm90YXRpb24gb2YgOTAgZGVncmVlcyBhcm91bmQgd29ybGQtc3BhY2UgeS1heGlzIHZpYSAzIG51bWJlcnNcbiAgICAgKiB0aGlzLmVudGl0eS5zZXRFdWxlckFuZ2xlcygwLCA5MCwgMCk7XG4gICAgICogQGV4YW1wbGVcbiAgICAgKiAvLyBTZXQgcm90YXRpb24gb2YgOTAgZGVncmVlcyBhcm91bmQgd29ybGQtc3BhY2UgeS1heGlzIHZpYSBhIHZlY3RvclxuICAgICAqIGNvbnN0IGFuZ2xlcyA9IG5ldyBwYy5WZWMzKDAsIDkwLCAwKTtcbiAgICAgKiB0aGlzLmVudGl0eS5zZXRFdWxlckFuZ2xlcyhhbmdsZXMpO1xuICAgICAqL1xuICAgIHNldEV1bGVyQW5nbGVzKHgsIHksIHopIHtcbiAgICAgICAgdGhpcy5sb2NhbFJvdGF0aW9uLnNldEZyb21FdWxlckFuZ2xlcyh4LCB5LCB6KTtcblxuICAgICAgICBpZiAodGhpcy5fcGFyZW50ICE9PSBudWxsKSB7XG4gICAgICAgICAgICBjb25zdCBwYXJlbnRSb3QgPSB0aGlzLl9wYXJlbnQuZ2V0Um90YXRpb24oKTtcbiAgICAgICAgICAgIGludlBhcmVudFJvdC5jb3B5KHBhcmVudFJvdCkuaW52ZXJ0KCk7XG4gICAgICAgICAgICB0aGlzLmxvY2FsUm90YXRpb24ubXVsMihpbnZQYXJlbnRSb3QsIHRoaXMubG9jYWxSb3RhdGlvbik7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIXRoaXMuX2RpcnR5TG9jYWwpXG4gICAgICAgICAgICB0aGlzLl9kaXJ0aWZ5TG9jYWwoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBZGQgYSBuZXcgY2hpbGQgdG8gdGhlIGNoaWxkIGxpc3QgYW5kIHVwZGF0ZSB0aGUgcGFyZW50IHZhbHVlIG9mIHRoZSBjaGlsZCBub2RlLlxuICAgICAqIElmIHRoZSBub2RlIGFscmVhZHkgaGFkIGEgcGFyZW50LCBpdCBpcyByZW1vdmVkIGZyb20gaXRzIGNoaWxkIGxpc3QuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge0dyYXBoTm9kZX0gbm9kZSAtIFRoZSBuZXcgY2hpbGQgdG8gYWRkLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogY29uc3QgZSA9IG5ldyBwYy5FbnRpdHkoYXBwKTtcbiAgICAgKiB0aGlzLmVudGl0eS5hZGRDaGlsZChlKTtcbiAgICAgKi9cbiAgICBhZGRDaGlsZChub2RlKSB7XG4gICAgICAgIHRoaXMuX3ByZXBhcmVJbnNlcnRDaGlsZChub2RlKTtcbiAgICAgICAgdGhpcy5fY2hpbGRyZW4ucHVzaChub2RlKTtcbiAgICAgICAgdGhpcy5fb25JbnNlcnRDaGlsZChub2RlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBZGQgYSBjaGlsZCB0byB0aGlzIG5vZGUsIG1haW50YWluaW5nIHRoZSBjaGlsZCdzIHRyYW5zZm9ybSBpbiB3b3JsZCBzcGFjZS5cbiAgICAgKiBJZiB0aGUgbm9kZSBhbHJlYWR5IGhhZCBhIHBhcmVudCwgaXQgaXMgcmVtb3ZlZCBmcm9tIGl0cyBjaGlsZCBsaXN0LlxuICAgICAqXG4gICAgICogQHBhcmFtIHtHcmFwaE5vZGV9IG5vZGUgLSBUaGUgY2hpbGQgdG8gYWRkLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogY29uc3QgZSA9IG5ldyBwYy5FbnRpdHkoYXBwKTtcbiAgICAgKiB0aGlzLmVudGl0eS5hZGRDaGlsZEFuZFNhdmVUcmFuc2Zvcm0oZSk7XG4gICAgICogQGlnbm9yZVxuICAgICAqL1xuICAgIGFkZENoaWxkQW5kU2F2ZVRyYW5zZm9ybShub2RlKSB7XG5cbiAgICAgICAgY29uc3Qgd1BvcyA9IG5vZGUuZ2V0UG9zaXRpb24oKTtcbiAgICAgICAgY29uc3Qgd1JvdCA9IG5vZGUuZ2V0Um90YXRpb24oKTtcblxuICAgICAgICB0aGlzLl9wcmVwYXJlSW5zZXJ0Q2hpbGQobm9kZSk7XG5cbiAgICAgICAgbm9kZS5zZXRQb3NpdGlvbih0bXBNYXQ0LmNvcHkodGhpcy53b3JsZFRyYW5zZm9ybSkuaW52ZXJ0KCkudHJhbnNmb3JtUG9pbnQod1BvcykpO1xuICAgICAgICBub2RlLnNldFJvdGF0aW9uKHRtcFF1YXQuY29weSh0aGlzLmdldFJvdGF0aW9uKCkpLmludmVydCgpLm11bCh3Um90KSk7XG5cbiAgICAgICAgdGhpcy5fY2hpbGRyZW4ucHVzaChub2RlKTtcbiAgICAgICAgdGhpcy5fb25JbnNlcnRDaGlsZChub2RlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJbnNlcnQgYSBuZXcgY2hpbGQgdG8gdGhlIGNoaWxkIGxpc3QgYXQgdGhlIHNwZWNpZmllZCBpbmRleCBhbmQgdXBkYXRlIHRoZSBwYXJlbnQgdmFsdWUgb2ZcbiAgICAgKiB0aGUgY2hpbGQgbm9kZS4gSWYgdGhlIG5vZGUgYWxyZWFkeSBoYWQgYSBwYXJlbnQsIGl0IGlzIHJlbW92ZWQgZnJvbSBpdHMgY2hpbGQgbGlzdC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7R3JhcGhOb2RlfSBub2RlIC0gVGhlIG5ldyBjaGlsZCB0byBpbnNlcnQuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGluZGV4IC0gVGhlIGluZGV4IGluIHRoZSBjaGlsZCBsaXN0IG9mIHRoZSBwYXJlbnQgd2hlcmUgdGhlIG5ldyBub2RlIHdpbGwgYmVcbiAgICAgKiBpbnNlcnRlZC5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGNvbnN0IGUgPSBuZXcgcGMuRW50aXR5KGFwcCk7XG4gICAgICogdGhpcy5lbnRpdHkuaW5zZXJ0Q2hpbGQoZSwgMSk7XG4gICAgICovXG4gICAgaW5zZXJ0Q2hpbGQobm9kZSwgaW5kZXgpIHtcblxuICAgICAgICB0aGlzLl9wcmVwYXJlSW5zZXJ0Q2hpbGQobm9kZSk7XG4gICAgICAgIHRoaXMuX2NoaWxkcmVuLnNwbGljZShpbmRleCwgMCwgbm9kZSk7XG4gICAgICAgIHRoaXMuX29uSW5zZXJ0Q2hpbGQobm9kZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUHJlcGFyZXMgbm9kZSBmb3IgYmVpbmcgaW5zZXJ0ZWQgdG8gYSBwYXJlbnQgbm9kZSwgYW5kIHJlbW92ZXMgaXQgZnJvbSB0aGUgcHJldmlvdXMgcGFyZW50LlxuICAgICAqXG4gICAgICogQHBhcmFtIHtHcmFwaE5vZGV9IG5vZGUgLSBUaGUgbm9kZSBiZWluZyBpbnNlcnRlZC5cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9wcmVwYXJlSW5zZXJ0Q2hpbGQobm9kZSkge1xuXG4gICAgICAgIC8vIHJlbW92ZSBpdCBmcm9tIHRoZSBleGlzdGluZyBwYXJlbnRcbiAgICAgICAgbm9kZS5yZW1vdmUoKTtcblxuICAgICAgICBEZWJ1Zy5hc3NlcnQobm9kZSAhPT0gdGhpcywgYEdyYXBoTm9kZSAke25vZGU/Lm5hbWV9IGNhbm5vdCBiZSBhIGNoaWxkIG9mIGl0c2VsZmApO1xuICAgICAgICBEZWJ1Zy5hc3NlcnQoIXRoaXMuaXNEZXNjZW5kYW50T2Yobm9kZSksIGBHcmFwaE5vZGUgJHtub2RlPy5uYW1lfSBjYW5ub3QgYWRkIGFuIGFuY2VzdG9yIGFzIGEgY2hpbGRgKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBGaXJlcyBhbiBldmVudCBvbiBhbGwgY2hpbGRyZW4gb2YgdGhlIG5vZGUuIFRoZSBldmVudCBgbmFtZWAgaXMgZmlyZWQgb24gdGhlIGZpcnN0IChyb290KVxuICAgICAqIG5vZGUgb25seS4gVGhlIGV2ZW50IGBuYW1lSGllcmFyY2h5YCBpcyBmaXJlZCBmb3IgYWxsIGNoaWxkcmVuLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IG5hbWUgLSBUaGUgbmFtZSBvZiB0aGUgZXZlbnQgdG8gZmlyZSBvbiB0aGUgcm9vdC5cbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gbmFtZUhpZXJhcmNoeSAtIFRoZSBuYW1lIG9mIHRoZSBldmVudCB0byBmaXJlIGZvciBhbGwgZGVzY2VuZGFudHMuXG4gICAgICogQHBhcmFtIHtHcmFwaE5vZGV9IHBhcmVudCAtIFRoZSBwYXJlbnQgb2YgdGhlIG5vZGUgYmVpbmcgYWRkZWQvcmVtb3ZlZCBmcm9tIHRoZSBoaWVyYXJjaHkuXG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfZmlyZU9uSGllcmFyY2h5KG5hbWUsIG5hbWVIaWVyYXJjaHksIHBhcmVudCkge1xuICAgICAgICB0aGlzLmZpcmUobmFtZSwgcGFyZW50KTtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLl9jaGlsZHJlbi5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgdGhpcy5fY2hpbGRyZW5baV0uX2ZpcmVPbkhpZXJhcmNoeShuYW1lSGllcmFyY2h5LCBuYW1lSGllcmFyY2h5LCBwYXJlbnQpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ2FsbGVkIHdoZW4gYSBub2RlIGlzIGluc2VydGVkIGludG8gYSBub2RlJ3MgY2hpbGQgbGlzdC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7R3JhcGhOb2RlfSBub2RlIC0gVGhlIG5vZGUgdGhhdCB3YXMgaW5zZXJ0ZWQuXG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfb25JbnNlcnRDaGlsZChub2RlKSB7XG4gICAgICAgIG5vZGUuX3BhcmVudCA9IHRoaXM7XG5cbiAgICAgICAgLy8gdGhlIGNoaWxkIG5vZGUgc2hvdWxkIGJlIGVuYWJsZWQgaW4gdGhlIGhpZXJhcmNoeSBvbmx5IGlmIGl0c2VsZiBpcyBlbmFibGVkIGFuZCBpZlxuICAgICAgICAvLyB0aGlzIHBhcmVudCBpcyBlbmFibGVkXG4gICAgICAgIGNvbnN0IGVuYWJsZWRJbkhpZXJhcmNoeSA9IChub2RlLl9lbmFibGVkICYmIHRoaXMuZW5hYmxlZCk7XG4gICAgICAgIGlmIChub2RlLl9lbmFibGVkSW5IaWVyYXJjaHkgIT09IGVuYWJsZWRJbkhpZXJhcmNoeSkge1xuICAgICAgICAgICAgbm9kZS5fZW5hYmxlZEluSGllcmFyY2h5ID0gZW5hYmxlZEluSGllcmFyY2h5O1xuXG4gICAgICAgICAgICAvLyBwcm9wYWdhdGUgdGhlIGNoYW5nZSB0byB0aGUgY2hpbGRyZW4gLSBuZWNlc3NhcnkgaWYgd2UgcmVwYXJlbnQgYSBub2RlXG4gICAgICAgICAgICAvLyB1bmRlciBhIHBhcmVudCB3aXRoIGEgZGlmZmVyZW50IGVuYWJsZWQgc3RhdGUgKGlmIHdlIHJlcGFyZW50IGEgbm9kZSB0aGF0IGlzXG4gICAgICAgICAgICAvLyBub3QgYWN0aXZlIGluIHRoZSBoaWVyYXJjaHkgdW5kZXIgYSBwYXJlbnQgd2hvIGlzIGFjdGl2ZSBpbiB0aGUgaGllcmFyY2h5IHRoZW5cbiAgICAgICAgICAgIC8vIHdlIHdhbnQgb3VyIG5vZGUgdG8gYmUgYWN0aXZhdGVkKVxuICAgICAgICAgICAgbm9kZS5fbm90aWZ5SGllcmFyY2h5U3RhdGVDaGFuZ2VkKG5vZGUsIGVuYWJsZWRJbkhpZXJhcmNoeSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBUaGUgZ3JhcGggZGVwdGggb2YgdGhlIGNoaWxkIGFuZCBhbGwgb2YgaXRzIGRlc2NlbmRhbnRzIHdpbGwgbm93IGNoYW5nZVxuICAgICAgICBub2RlLl91cGRhdGVHcmFwaERlcHRoKCk7XG5cbiAgICAgICAgLy8gVGhlIGNoaWxkIChwbHVzIHN1YmhpZXJhcmNoeSkgd2lsbCBuZWVkIHdvcmxkIHRyYW5zZm9ybXMgdG8gYmUgcmVjYWxjdWxhdGVkXG4gICAgICAgIG5vZGUuX2RpcnRpZnlXb3JsZCgpO1xuICAgICAgICAvLyBub2RlIG1pZ2h0IGJlIGFscmVhZHkgbWFya2VkIGFzIGRpcnR5LCBpbiB0aGF0IGNhc2UgdGhlIHdob2xlIGNoYWluIHN0YXlzIGZyb3plbiwgc28gbGV0J3MgZW5mb3JjZSB1bmZyZWV6ZVxuICAgICAgICBpZiAodGhpcy5fZnJvemVuKVxuICAgICAgICAgICAgbm9kZS5fdW5mcmVlemVQYXJlbnRUb1Jvb3QoKTtcblxuICAgICAgICAvLyBhbGVydCBhbiBlbnRpdHkgaGllcmFyY2h5IHRoYXQgaXQgaGFzIGJlZW4gaW5zZXJ0ZWRcbiAgICAgICAgbm9kZS5fZmlyZU9uSGllcmFyY2h5KCdpbnNlcnQnLCAnaW5zZXJ0aGllcmFyY2h5JywgdGhpcyk7XG5cbiAgICAgICAgLy8gYWxlcnQgdGhlIHBhcmVudCB0aGF0IGl0IGhhcyBoYWQgYSBjaGlsZCBpbnNlcnRlZFxuICAgICAgICBpZiAodGhpcy5maXJlKSB0aGlzLmZpcmUoJ2NoaWxkaW5zZXJ0Jywgbm9kZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVjdXJzZSB0aGUgaGllcmFyY2h5IGFuZCB1cGRhdGUgdGhlIGdyYXBoIGRlcHRoIGF0IGVhY2ggbm9kZS5cbiAgICAgKlxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX3VwZGF0ZUdyYXBoRGVwdGgoKSB7XG4gICAgICAgIHRoaXMuX2dyYXBoRGVwdGggPSB0aGlzLl9wYXJlbnQgPyB0aGlzLl9wYXJlbnQuX2dyYXBoRGVwdGggKyAxIDogMDtcblxuICAgICAgICBmb3IgKGxldCBpID0gMCwgbGVuID0gdGhpcy5fY2hpbGRyZW4ubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgICAgIHRoaXMuX2NoaWxkcmVuW2ldLl91cGRhdGVHcmFwaERlcHRoKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZW1vdmUgdGhlIG5vZGUgZnJvbSB0aGUgY2hpbGQgbGlzdCBhbmQgdXBkYXRlIHRoZSBwYXJlbnQgdmFsdWUgb2YgdGhlIGNoaWxkLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtHcmFwaE5vZGV9IGNoaWxkIC0gVGhlIG5vZGUgdG8gcmVtb3ZlLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogY29uc3QgY2hpbGQgPSB0aGlzLmVudGl0eS5jaGlsZHJlblswXTtcbiAgICAgKiB0aGlzLmVudGl0eS5yZW1vdmVDaGlsZChjaGlsZCk7XG4gICAgICovXG4gICAgcmVtb3ZlQ2hpbGQoY2hpbGQpIHtcbiAgICAgICAgY29uc3QgaW5kZXggPSB0aGlzLl9jaGlsZHJlbi5pbmRleE9mKGNoaWxkKTtcbiAgICAgICAgaWYgKGluZGV4ID09PSAtMSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gUmVtb3ZlIGZyb20gY2hpbGQgbGlzdFxuICAgICAgICB0aGlzLl9jaGlsZHJlbi5zcGxpY2UoaW5kZXgsIDEpO1xuXG4gICAgICAgIC8vIENsZWFyIHBhcmVudFxuICAgICAgICBjaGlsZC5fcGFyZW50ID0gbnVsbDtcblxuICAgICAgICAvLyBOT1RFOiBzZWUgUFIgIzQwNDcgLSB0aGlzIGZpeCBpcyByZW1vdmVkIGZvciBub3cgYXMgaXQgYnJlYWtzIG90aGVyIHRoaW5nc1xuICAgICAgICAvLyBub3RpZnkgdGhlIGNoaWxkIGhpZXJhcmNoeSBpdCBoYXMgYmVlbiByZW1vdmVkIGZyb20gdGhlIHBhcmVudCxcbiAgICAgICAgLy8gd2hpY2ggbWFya3MgdGhlbSBhcyBub3QgZW5hYmxlZCBpbiBoaWVyYXJjaHlcbiAgICAgICAgLy8gaWYgKGNoaWxkLl9lbmFibGVkSW5IaWVyYXJjaHkpIHtcbiAgICAgICAgLy8gICAgIGNoaWxkLl9ub3RpZnlIaWVyYXJjaHlTdGF0ZUNoYW5nZWQoY2hpbGQsIGZhbHNlKTtcbiAgICAgICAgLy8gfVxuXG4gICAgICAgIC8vIGFsZXJ0IGNoaWxkcmVuIHRoYXQgdGhleSBoYXMgYmVlbiByZW1vdmVkXG4gICAgICAgIGNoaWxkLl9maXJlT25IaWVyYXJjaHkoJ3JlbW92ZScsICdyZW1vdmVoaWVyYXJjaHknLCB0aGlzKTtcblxuICAgICAgICAvLyBhbGVydCB0aGUgcGFyZW50IHRoYXQgaXQgaGFzIGhhZCBhIGNoaWxkIHJlbW92ZWRcbiAgICAgICAgdGhpcy5maXJlKCdjaGlsZHJlbW92ZScsIGNoaWxkKTtcbiAgICB9XG5cbiAgICBfc3luYygpIHtcbiAgICAgICAgaWYgKHRoaXMuX2RpcnR5TG9jYWwpIHtcbiAgICAgICAgICAgIHRoaXMubG9jYWxUcmFuc2Zvcm0uc2V0VFJTKHRoaXMubG9jYWxQb3NpdGlvbiwgdGhpcy5sb2NhbFJvdGF0aW9uLCB0aGlzLmxvY2FsU2NhbGUpO1xuXG4gICAgICAgICAgICB0aGlzLl9kaXJ0eUxvY2FsID0gZmFsc2U7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5fZGlydHlXb3JsZCkge1xuICAgICAgICAgICAgaWYgKHRoaXMuX3BhcmVudCA9PT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIHRoaXMud29ybGRUcmFuc2Zvcm0uY29weSh0aGlzLmxvY2FsVHJhbnNmb3JtKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuc2NhbGVDb21wZW5zYXRpb24pIHtcbiAgICAgICAgICAgICAgICAgICAgbGV0IHBhcmVudFdvcmxkU2NhbGU7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHBhcmVudCA9IHRoaXMuX3BhcmVudDtcblxuICAgICAgICAgICAgICAgICAgICAvLyBGaW5kIGEgcGFyZW50IG9mIHRoZSBmaXJzdCB1bmNvbXBlbnNhdGVkIG5vZGUgdXAgaW4gdGhlIGhpZXJhcmNoeSBhbmQgdXNlIGl0cyBzY2FsZSAqIGxvY2FsU2NhbGVcbiAgICAgICAgICAgICAgICAgICAgbGV0IHNjYWxlID0gdGhpcy5sb2NhbFNjYWxlO1xuICAgICAgICAgICAgICAgICAgICBsZXQgcGFyZW50VG9Vc2VTY2FsZUZyb20gPSBwYXJlbnQ7IC8vIGN1cnJlbnQgcGFyZW50XG4gICAgICAgICAgICAgICAgICAgIGlmIChwYXJlbnRUb1VzZVNjYWxlRnJvbSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgd2hpbGUgKHBhcmVudFRvVXNlU2NhbGVGcm9tICYmIHBhcmVudFRvVXNlU2NhbGVGcm9tLnNjYWxlQ29tcGVuc2F0aW9uKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcGFyZW50VG9Vc2VTY2FsZUZyb20gPSBwYXJlbnRUb1VzZVNjYWxlRnJvbS5fcGFyZW50O1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gdG9wbW9zdCBub2RlIHdpdGggc2NhbGUgY29tcGVuc2F0aW9uXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocGFyZW50VG9Vc2VTY2FsZUZyb20pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwYXJlbnRUb1VzZVNjYWxlRnJvbSA9IHBhcmVudFRvVXNlU2NhbGVGcm9tLl9wYXJlbnQ7IC8vIG5vZGUgd2l0aG91dCBzY2FsZSBjb21wZW5zYXRpb25cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAocGFyZW50VG9Vc2VTY2FsZUZyb20pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcGFyZW50V29ybGRTY2FsZSA9IHBhcmVudFRvVXNlU2NhbGVGcm9tLndvcmxkVHJhbnNmb3JtLmdldFNjYWxlKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNjYWxlQ29tcGVuc2F0ZVNjYWxlLm11bDIocGFyZW50V29ybGRTY2FsZSwgdGhpcy5sb2NhbFNjYWxlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2NhbGUgPSBzY2FsZUNvbXBlbnNhdGVTY2FsZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAvLyBSb3RhdGlvbiBpcyBhcyB1c3VhbFxuICAgICAgICAgICAgICAgICAgICBzY2FsZUNvbXBlbnNhdGVSb3QyLnNldEZyb21NYXQ0KHBhcmVudC53b3JsZFRyYW5zZm9ybSk7XG4gICAgICAgICAgICAgICAgICAgIHNjYWxlQ29tcGVuc2F0ZVJvdC5tdWwyKHNjYWxlQ29tcGVuc2F0ZVJvdDIsIHRoaXMubG9jYWxSb3RhdGlvbik7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gRmluZCBtYXRyaXggdG8gdHJhbnNmb3JtIHBvc2l0aW9uXG4gICAgICAgICAgICAgICAgICAgIGxldCB0bWF0cml4ID0gcGFyZW50LndvcmxkVHJhbnNmb3JtO1xuICAgICAgICAgICAgICAgICAgICBpZiAocGFyZW50LnNjYWxlQ29tcGVuc2F0aW9uKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzY2FsZUNvbXBlbnNhdGVTY2FsZUZvclBhcmVudC5tdWwyKHBhcmVudFdvcmxkU2NhbGUsIHBhcmVudC5nZXRMb2NhbFNjYWxlKCkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgc2NhbGVDb21wZW5zYXRlUG9zVHJhbnNmb3JtLnNldFRSUyhwYXJlbnQud29ybGRUcmFuc2Zvcm0uZ2V0VHJhbnNsYXRpb24oc2NhbGVDb21wZW5zYXRlUG9zKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2NhbGVDb21wZW5zYXRlUm90MixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2NhbGVDb21wZW5zYXRlU2NhbGVGb3JQYXJlbnQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdG1hdHJpeCA9IHNjYWxlQ29tcGVuc2F0ZVBvc1RyYW5zZm9ybTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB0bWF0cml4LnRyYW5zZm9ybVBvaW50KHRoaXMubG9jYWxQb3NpdGlvbiwgc2NhbGVDb21wZW5zYXRlUG9zKTtcblxuICAgICAgICAgICAgICAgICAgICB0aGlzLndvcmxkVHJhbnNmb3JtLnNldFRSUyhzY2FsZUNvbXBlbnNhdGVQb3MsIHNjYWxlQ29tcGVuc2F0ZVJvdCwgc2NhbGUpO1xuXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy53b3JsZFRyYW5zZm9ybS5tdWxBZmZpbmUyKHRoaXMuX3BhcmVudC53b3JsZFRyYW5zZm9ybSwgdGhpcy5sb2NhbFRyYW5zZm9ybSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLl9kaXJ0eVdvcmxkID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBVcGRhdGVzIHRoZSB3b3JsZCB0cmFuc2Zvcm1hdGlvbiBtYXRyaWNlcyBhdCB0aGlzIG5vZGUgYW5kIGFsbCBvZiBpdHMgZGVzY2VuZGFudHMuXG4gICAgICpcbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgc3luY0hpZXJhcmNoeSgpIHtcbiAgICAgICAgaWYgKCF0aGlzLl9lbmFibGVkKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIGlmICh0aGlzLl9mcm96ZW4pXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIHRoaXMuX2Zyb3plbiA9IHRydWU7XG5cbiAgICAgICAgaWYgKHRoaXMuX2RpcnR5TG9jYWwgfHwgdGhpcy5fZGlydHlXb3JsZCkge1xuICAgICAgICAgICAgdGhpcy5fc3luYygpO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgY2hpbGRyZW4gPSB0aGlzLl9jaGlsZHJlbjtcbiAgICAgICAgZm9yIChsZXQgaSA9IDAsIGxlbiA9IGNoaWxkcmVuLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgICAgICBjaGlsZHJlbltpXS5zeW5jSGllcmFyY2h5KCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZW9yaWVudHMgdGhlIGdyYXBoIG5vZGUgc28gdGhhdCB0aGUgbmVnYXRpdmUgei1heGlzIHBvaW50cyB0b3dhcmRzIHRoZSB0YXJnZXQuIFRoaXNcbiAgICAgKiBmdW5jdGlvbiBoYXMgdHdvIHZhbGlkIHNpZ25hdHVyZXMuIEVpdGhlciBwYXNzIDNEIHZlY3RvcnMgZm9yIHRoZSBsb29rIGF0IGNvb3JkaW5hdGUgYW5kIHVwXG4gICAgICogdmVjdG9yLCBvciBwYXNzIG51bWJlcnMgdG8gcmVwcmVzZW50IHRoZSB2ZWN0b3JzLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtWZWMzfG51bWJlcn0geCAtIElmIHBhc3NpbmcgYSAzRCB2ZWN0b3IsIHRoaXMgaXMgdGhlIHdvcmxkLXNwYWNlIGNvb3JkaW5hdGUgdG8gbG9vayBhdC5cbiAgICAgKiBPdGhlcndpc2UsIGl0IGlzIHRoZSB4LWNvbXBvbmVudCBvZiB0aGUgd29ybGQtc3BhY2UgY29vcmRpbmF0ZSB0byBsb29rIGF0LlxuICAgICAqIEBwYXJhbSB7VmVjM3xudW1iZXJ9IFt5XSAtIElmIHBhc3NpbmcgYSAzRCB2ZWN0b3IsIHRoaXMgaXMgdGhlIHdvcmxkLXNwYWNlIHVwIHZlY3RvciBmb3IgbG9vayBhdFxuICAgICAqIHRyYW5zZm9ybS4gT3RoZXJ3aXNlLCBpdCBpcyB0aGUgeS1jb21wb25lbnQgb2YgdGhlIHdvcmxkLXNwYWNlIGNvb3JkaW5hdGUgdG8gbG9vayBhdC5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gW3pdIC0gWi1jb21wb25lbnQgb2YgdGhlIHdvcmxkLXNwYWNlIGNvb3JkaW5hdGUgdG8gbG9vayBhdC5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gW3V4XSAtIFgtY29tcG9uZW50IG9mIHRoZSB1cCB2ZWN0b3IgZm9yIHRoZSBsb29rIGF0IHRyYW5zZm9ybS4gRGVmYXVsdHMgdG8gMC5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gW3V5XSAtIFktY29tcG9uZW50IG9mIHRoZSB1cCB2ZWN0b3IgZm9yIHRoZSBsb29rIGF0IHRyYW5zZm9ybS4gRGVmYXVsdHMgdG8gMS5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gW3V6XSAtIFotY29tcG9uZW50IG9mIHRoZSB1cCB2ZWN0b3IgZm9yIHRoZSBsb29rIGF0IHRyYW5zZm9ybS4gRGVmYXVsdHMgdG8gMC5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIC8vIExvb2sgYXQgYW5vdGhlciBlbnRpdHksIHVzaW5nIHRoZSAoZGVmYXVsdCkgcG9zaXRpdmUgeS1heGlzIGZvciB1cFxuICAgICAqIGNvbnN0IHBvc2l0aW9uID0gb3RoZXJFbnRpdHkuZ2V0UG9zaXRpb24oKTtcbiAgICAgKiB0aGlzLmVudGl0eS5sb29rQXQocG9zaXRpb24pO1xuICAgICAqIEBleGFtcGxlXG4gICAgICogLy8gTG9vayBhdCBhbm90aGVyIGVudGl0eSwgdXNpbmcgdGhlIG5lZ2F0aXZlIHdvcmxkIHktYXhpcyBmb3IgdXBcbiAgICAgKiBjb25zdCBwb3NpdGlvbiA9IG90aGVyRW50aXR5LmdldFBvc2l0aW9uKCk7XG4gICAgICogdGhpcy5lbnRpdHkubG9va0F0KHBvc2l0aW9uLCBwYy5WZWMzLkRPV04pO1xuICAgICAqIEBleGFtcGxlXG4gICAgICogLy8gTG9vayBhdCB0aGUgd29ybGQgc3BhY2Ugb3JpZ2luLCB1c2luZyB0aGUgKGRlZmF1bHQpIHBvc2l0aXZlIHktYXhpcyBmb3IgdXBcbiAgICAgKiB0aGlzLmVudGl0eS5sb29rQXQoMCwgMCwgMCk7XG4gICAgICogQGV4YW1wbGVcbiAgICAgKiAvLyBMb29rIGF0IHdvcmxkLXNwYWNlIGNvb3JkaW5hdGUgWzEwLCAxMCwgMTBdLCB1c2luZyB0aGUgbmVnYXRpdmUgd29ybGQgeS1heGlzIGZvciB1cFxuICAgICAqIHRoaXMuZW50aXR5Lmxvb2tBdCgxMCwgMTAsIDEwLCAwLCAtMSwgMCk7XG4gICAgICovXG4gICAgbG9va0F0KHgsIHksIHosIHV4ID0gMCwgdXkgPSAxLCB1eiA9IDApIHtcbiAgICAgICAgaWYgKHggaW5zdGFuY2VvZiBWZWMzKSB7XG4gICAgICAgICAgICB0YXJnZXQuY29weSh4KTtcblxuICAgICAgICAgICAgaWYgKHkgaW5zdGFuY2VvZiBWZWMzKSB7IC8vIHZlYzMsIHZlYzNcbiAgICAgICAgICAgICAgICB1cC5jb3B5KHkpO1xuICAgICAgICAgICAgfSBlbHNlIHsgLy8gdmVjM1xuICAgICAgICAgICAgICAgIHVwLmNvcHkoVmVjMy5VUCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoeiA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0YXJnZXQuc2V0KHgsIHksIHopO1xuICAgICAgICAgICAgdXAuc2V0KHV4LCB1eSwgdXopO1xuICAgICAgICB9XG5cbiAgICAgICAgbWF0cml4LnNldExvb2tBdCh0aGlzLmdldFBvc2l0aW9uKCksIHRhcmdldCwgdXApO1xuICAgICAgICByb3RhdGlvbi5zZXRGcm9tTWF0NChtYXRyaXgpO1xuICAgICAgICB0aGlzLnNldFJvdGF0aW9uKHJvdGF0aW9uKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUcmFuc2xhdGVzIHRoZSBncmFwaCBub2RlIGluIHdvcmxkLXNwYWNlIGJ5IHRoZSBzcGVjaWZpZWQgdHJhbnNsYXRpb24gdmVjdG9yLiBUaGlzIGZ1bmN0aW9uXG4gICAgICogaGFzIHR3byB2YWxpZCBzaWduYXR1cmVzOiB5b3UgY2FuIGVpdGhlciBwYXNzIGEgM0QgdmVjdG9yIG9yIDMgbnVtYmVycyB0byBzcGVjaWZ5IHRoZVxuICAgICAqIHdvcmxkLXNwYWNlIHRyYW5zbGF0aW9uLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtWZWMzfG51bWJlcn0geCAtIDMtZGltZW5zaW9uYWwgdmVjdG9yIGhvbGRpbmcgd29ybGQtc3BhY2UgdHJhbnNsYXRpb24gb3JcbiAgICAgKiB4LWNvb3JkaW5hdGUgb2Ygd29ybGQtc3BhY2UgdHJhbnNsYXRpb24uXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFt5XSAtIFktY29vcmRpbmF0ZSBvZiB3b3JsZC1zcGFjZSB0cmFuc2xhdGlvbi5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gW3pdIC0gWi1jb29yZGluYXRlIG9mIHdvcmxkLXNwYWNlIHRyYW5zbGF0aW9uLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogLy8gVHJhbnNsYXRlIHZpYSAzIG51bWJlcnNcbiAgICAgKiB0aGlzLmVudGl0eS50cmFuc2xhdGUoMTAsIDAsIDApO1xuICAgICAqIEBleGFtcGxlXG4gICAgICogLy8gVHJhbnNsYXRlIHZpYSB2ZWN0b3JcbiAgICAgKiBjb25zdCB0ID0gbmV3IHBjLlZlYzMoMTAsIDAsIDApO1xuICAgICAqIHRoaXMuZW50aXR5LnRyYW5zbGF0ZSh0KTtcbiAgICAgKi9cbiAgICB0cmFuc2xhdGUoeCwgeSwgeikge1xuICAgICAgICBpZiAoeCBpbnN0YW5jZW9mIFZlYzMpIHtcbiAgICAgICAgICAgIHBvc2l0aW9uLmNvcHkoeCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwb3NpdGlvbi5zZXQoeCwgeSwgeik7XG4gICAgICAgIH1cblxuICAgICAgICBwb3NpdGlvbi5hZGQodGhpcy5nZXRQb3NpdGlvbigpKTtcbiAgICAgICAgdGhpcy5zZXRQb3NpdGlvbihwb3NpdGlvbik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVHJhbnNsYXRlcyB0aGUgZ3JhcGggbm9kZSBpbiBsb2NhbC1zcGFjZSBieSB0aGUgc3BlY2lmaWVkIHRyYW5zbGF0aW9uIHZlY3Rvci4gVGhpcyBmdW5jdGlvblxuICAgICAqIGhhcyB0d28gdmFsaWQgc2lnbmF0dXJlczogeW91IGNhbiBlaXRoZXIgcGFzcyBhIDNEIHZlY3RvciBvciAzIG51bWJlcnMgdG8gc3BlY2lmeSB0aGVcbiAgICAgKiBsb2NhbC1zcGFjZSB0cmFuc2xhdGlvbi5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7VmVjM3xudW1iZXJ9IHggLSAzLWRpbWVuc2lvbmFsIHZlY3RvciBob2xkaW5nIGxvY2FsLXNwYWNlIHRyYW5zbGF0aW9uIG9yXG4gICAgICogeC1jb29yZGluYXRlIG9mIGxvY2FsLXNwYWNlIHRyYW5zbGF0aW9uLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBbeV0gLSBZLWNvb3JkaW5hdGUgb2YgbG9jYWwtc3BhY2UgdHJhbnNsYXRpb24uXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFt6XSAtIFotY29vcmRpbmF0ZSBvZiBsb2NhbC1zcGFjZSB0cmFuc2xhdGlvbi5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIC8vIFRyYW5zbGF0ZSB2aWEgMyBudW1iZXJzXG4gICAgICogdGhpcy5lbnRpdHkudHJhbnNsYXRlTG9jYWwoMTAsIDAsIDApO1xuICAgICAqIEBleGFtcGxlXG4gICAgICogLy8gVHJhbnNsYXRlIHZpYSB2ZWN0b3JcbiAgICAgKiBjb25zdCB0ID0gbmV3IHBjLlZlYzMoMTAsIDAsIDApO1xuICAgICAqIHRoaXMuZW50aXR5LnRyYW5zbGF0ZUxvY2FsKHQpO1xuICAgICAqL1xuICAgIHRyYW5zbGF0ZUxvY2FsKHgsIHksIHopIHtcbiAgICAgICAgaWYgKHggaW5zdGFuY2VvZiBWZWMzKSB7XG4gICAgICAgICAgICBwb3NpdGlvbi5jb3B5KHgpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcG9zaXRpb24uc2V0KHgsIHksIHopO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5sb2NhbFJvdGF0aW9uLnRyYW5zZm9ybVZlY3Rvcihwb3NpdGlvbiwgcG9zaXRpb24pO1xuICAgICAgICB0aGlzLmxvY2FsUG9zaXRpb24uYWRkKHBvc2l0aW9uKTtcblxuICAgICAgICBpZiAoIXRoaXMuX2RpcnR5TG9jYWwpXG4gICAgICAgICAgICB0aGlzLl9kaXJ0aWZ5TG9jYWwoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSb3RhdGVzIHRoZSBncmFwaCBub2RlIGluIHdvcmxkLXNwYWNlIGJ5IHRoZSBzcGVjaWZpZWQgRXVsZXIgYW5nbGVzLiBFdWxlcnMgYXJlIHNwZWNpZmllZCBpblxuICAgICAqIGRlZ3JlZXMgaW4gWFlaIG9yZGVyLiBUaGlzIGZ1bmN0aW9uIGhhcyB0d28gdmFsaWQgc2lnbmF0dXJlczogeW91IGNhbiBlaXRoZXIgcGFzcyBhIDNEXG4gICAgICogdmVjdG9yIG9yIDMgbnVtYmVycyB0byBzcGVjaWZ5IHRoZSB3b3JsZC1zcGFjZSByb3RhdGlvbi5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7VmVjM3xudW1iZXJ9IHggLSAzLWRpbWVuc2lvbmFsIHZlY3RvciBob2xkaW5nIHdvcmxkLXNwYWNlIHJvdGF0aW9uIG9yXG4gICAgICogcm90YXRpb24gYXJvdW5kIHdvcmxkLXNwYWNlIHgtYXhpcyBpbiBkZWdyZWVzLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBbeV0gLSBSb3RhdGlvbiBhcm91bmQgd29ybGQtc3BhY2UgeS1heGlzIGluIGRlZ3JlZXMuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFt6XSAtIFJvdGF0aW9uIGFyb3VuZCB3b3JsZC1zcGFjZSB6LWF4aXMgaW4gZGVncmVlcy5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIC8vIFJvdGF0ZSB2aWEgMyBudW1iZXJzXG4gICAgICogdGhpcy5lbnRpdHkucm90YXRlKDAsIDkwLCAwKTtcbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIC8vIFJvdGF0ZSB2aWEgdmVjdG9yXG4gICAgICogY29uc3QgciA9IG5ldyBwYy5WZWMzKDAsIDkwLCAwKTtcbiAgICAgKiB0aGlzLmVudGl0eS5yb3RhdGUocik7XG4gICAgICovXG4gICAgcm90YXRlKHgsIHksIHopIHtcbiAgICAgICAgcm90YXRpb24uc2V0RnJvbUV1bGVyQW5nbGVzKHgsIHksIHopO1xuXG4gICAgICAgIGlmICh0aGlzLl9wYXJlbnQgPT09IG51bGwpIHtcbiAgICAgICAgICAgIHRoaXMubG9jYWxSb3RhdGlvbi5tdWwyKHJvdGF0aW9uLCB0aGlzLmxvY2FsUm90YXRpb24pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc3Qgcm90ID0gdGhpcy5nZXRSb3RhdGlvbigpO1xuICAgICAgICAgICAgY29uc3QgcGFyZW50Um90ID0gdGhpcy5fcGFyZW50LmdldFJvdGF0aW9uKCk7XG5cbiAgICAgICAgICAgIGludlBhcmVudFJvdC5jb3B5KHBhcmVudFJvdCkuaW52ZXJ0KCk7XG4gICAgICAgICAgICByb3RhdGlvbi5tdWwyKGludlBhcmVudFJvdCwgcm90YXRpb24pO1xuICAgICAgICAgICAgdGhpcy5sb2NhbFJvdGF0aW9uLm11bDIocm90YXRpb24sIHJvdCk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIXRoaXMuX2RpcnR5TG9jYWwpXG4gICAgICAgICAgICB0aGlzLl9kaXJ0aWZ5TG9jYWwoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSb3RhdGVzIHRoZSBncmFwaCBub2RlIGluIGxvY2FsLXNwYWNlIGJ5IHRoZSBzcGVjaWZpZWQgRXVsZXIgYW5nbGVzLiBFdWxlcnMgYXJlIHNwZWNpZmllZCBpblxuICAgICAqIGRlZ3JlZXMgaW4gWFlaIG9yZGVyLiBUaGlzIGZ1bmN0aW9uIGhhcyB0d28gdmFsaWQgc2lnbmF0dXJlczogeW91IGNhbiBlaXRoZXIgcGFzcyBhIDNEXG4gICAgICogdmVjdG9yIG9yIDMgbnVtYmVycyB0byBzcGVjaWZ5IHRoZSBsb2NhbC1zcGFjZSByb3RhdGlvbi5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7VmVjM3xudW1iZXJ9IHggLSAzLWRpbWVuc2lvbmFsIHZlY3RvciBob2xkaW5nIGxvY2FsLXNwYWNlIHJvdGF0aW9uIG9yXG4gICAgICogcm90YXRpb24gYXJvdW5kIGxvY2FsLXNwYWNlIHgtYXhpcyBpbiBkZWdyZWVzLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBbeV0gLSBSb3RhdGlvbiBhcm91bmQgbG9jYWwtc3BhY2UgeS1heGlzIGluIGRlZ3JlZXMuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFt6XSAtIFJvdGF0aW9uIGFyb3VuZCBsb2NhbC1zcGFjZSB6LWF4aXMgaW4gZGVncmVlcy5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIC8vIFJvdGF0ZSB2aWEgMyBudW1iZXJzXG4gICAgICogdGhpcy5lbnRpdHkucm90YXRlTG9jYWwoMCwgOTAsIDApO1xuICAgICAqIEBleGFtcGxlXG4gICAgICogLy8gUm90YXRlIHZpYSB2ZWN0b3JcbiAgICAgKiBjb25zdCByID0gbmV3IHBjLlZlYzMoMCwgOTAsIDApO1xuICAgICAqIHRoaXMuZW50aXR5LnJvdGF0ZUxvY2FsKHIpO1xuICAgICAqL1xuICAgIHJvdGF0ZUxvY2FsKHgsIHksIHopIHtcbiAgICAgICAgcm90YXRpb24uc2V0RnJvbUV1bGVyQW5nbGVzKHgsIHksIHopO1xuXG4gICAgICAgIHRoaXMubG9jYWxSb3RhdGlvbi5tdWwocm90YXRpb24pO1xuXG4gICAgICAgIGlmICghdGhpcy5fZGlydHlMb2NhbClcbiAgICAgICAgICAgIHRoaXMuX2RpcnRpZnlMb2NhbCgpO1xuICAgIH1cbn1cblxuZXhwb3J0IHsgR3JhcGhOb2RlIH07XG4iXSwibmFtZXMiOlsic2NhbGVDb21wZW5zYXRlUG9zVHJhbnNmb3JtIiwiTWF0NCIsInNjYWxlQ29tcGVuc2F0ZVBvcyIsIlZlYzMiLCJzY2FsZUNvbXBlbnNhdGVSb3QiLCJRdWF0Iiwic2NhbGVDb21wZW5zYXRlUm90MiIsInNjYWxlQ29tcGVuc2F0ZVNjYWxlIiwic2NhbGVDb21wZW5zYXRlU2NhbGVGb3JQYXJlbnQiLCJ0bXBNYXQ0IiwidG1wUXVhdCIsInBvc2l0aW9uIiwiaW52UGFyZW50V3RtIiwicm90YXRpb24iLCJpbnZQYXJlbnRSb3QiLCJtYXRyaXgiLCJ0YXJnZXQiLCJ1cCIsIkdyYXBoTm9kZSIsIkV2ZW50SGFuZGxlciIsImNvbnN0cnVjdG9yIiwibmFtZSIsInRhZ3MiLCJUYWdzIiwiX2xhYmVscyIsImxvY2FsUG9zaXRpb24iLCJsb2NhbFJvdGF0aW9uIiwibG9jYWxTY2FsZSIsImxvY2FsRXVsZXJBbmdsZXMiLCJldWxlckFuZ2xlcyIsIl9zY2FsZSIsImxvY2FsVHJhbnNmb3JtIiwiX2RpcnR5TG9jYWwiLCJfYWFiYlZlciIsIl9mcm96ZW4iLCJ3b3JsZFRyYW5zZm9ybSIsIl9kaXJ0eVdvcmxkIiwiX3dvcmxkU2NhbGVTaWduIiwiX25vcm1hbE1hdHJpeCIsIk1hdDMiLCJfZGlydHlOb3JtYWwiLCJfcmlnaHQiLCJfdXAiLCJfZm9yd2FyZCIsIl9wYXJlbnQiLCJfY2hpbGRyZW4iLCJfZ3JhcGhEZXB0aCIsIl9lbmFibGVkIiwiX2VuYWJsZWRJbkhpZXJhcmNoeSIsInNjYWxlQ29tcGVuc2F0aW9uIiwicmlnaHQiLCJnZXRXb3JsZFRyYW5zZm9ybSIsImdldFgiLCJub3JtYWxpemUiLCJnZXRZIiwiZm9yd2FyZCIsImdldFoiLCJtdWxTY2FsYXIiLCJub3JtYWxNYXRyaXgiLCJub3JtYWxNYXQiLCJpbnZlcnRNYXQ0IiwidHJhbnNwb3NlIiwiZW5hYmxlZCIsIl90aGlzJF9wYXJlbnQiLCJfbm90aWZ5SGllcmFyY2h5U3RhdGVDaGFuZ2VkIiwicGFyZW50IiwicGF0aCIsIm5vZGUiLCJyZXN1bHQiLCJyb290IiwiY2hpbGRyZW4iLCJncmFwaERlcHRoIiwiX29uSGllcmFyY2h5U3RhdGVDaGFuZ2VkIiwiYyIsImkiLCJsZW4iLCJsZW5ndGgiLCJfdW5mcmVlemVQYXJlbnRUb1Jvb3QiLCJfY2xvbmVJbnRlcm5hbCIsImNsb25lIiwiX2xpc3QiLCJjbGVhciIsImFkZCIsIk9iamVjdCIsImFzc2lnbiIsImNvcHkiLCJzb3VyY2UiLCJkZXN0cm95IiwicmVtb3ZlIiwiY2hpbGQiLCJwb3AiLCJmaXJlIiwib2ZmIiwiZmluZCIsImF0dHIiLCJ2YWx1ZSIsInJlc3VsdHMiLCJGdW5jdGlvbiIsImZuIiwicHVzaCIsImRlc2NlbmRhbnRzIiwiY29uY2F0IiwidGVzdFZhbHVlIiwiZmluZE9uZSIsImZpbmRCeVRhZyIsInF1ZXJ5IiwiYXJndW1lbnRzIiwicXVlcnlOb2RlIiwiY2hlY2tOb2RlIiwiaGFzIiwiZmluZEJ5TmFtZSIsImZvdW5kIiwiZmluZEJ5UGF0aCIsInBhcnRzIiwiQXJyYXkiLCJpc0FycmF5Iiwic3BsaXQiLCJpbWF4IiwiZm9yRWFjaCIsImNhbGxiYWNrIiwidGhpc0FyZyIsImNhbGwiLCJpc0Rlc2NlbmRhbnRPZiIsImlzQW5jZXN0b3JPZiIsImdldEV1bGVyQW5nbGVzIiwiZ2V0TG9jYWxFdWxlckFuZ2xlcyIsImdldExvY2FsUG9zaXRpb24iLCJnZXRMb2NhbFJvdGF0aW9uIiwiZ2V0TG9jYWxTY2FsZSIsImdldExvY2FsVHJhbnNmb3JtIiwic2V0VFJTIiwiZ2V0UG9zaXRpb24iLCJnZXRUcmFuc2xhdGlvbiIsImdldFJvdGF0aW9uIiwic2V0RnJvbU1hdDQiLCJnZXRTY2FsZSIsIl9zeW5jIiwid29ybGRTY2FsZVNpZ24iLCJzY2FsZVNpZ24iLCJfdGhpcyRfcGFyZW50MiIsInJlbW92ZUNoaWxkIiwicmVwYXJlbnQiLCJpbmRleCIsImluc2VydENoaWxkIiwiYWRkQ2hpbGQiLCJzZXRMb2NhbEV1bGVyQW5nbGVzIiwieCIsInkiLCJ6Iiwic2V0RnJvbUV1bGVyQW5nbGVzIiwiX2RpcnRpZnlMb2NhbCIsInNldExvY2FsUG9zaXRpb24iLCJzZXQiLCJzZXRMb2NhbFJvdGF0aW9uIiwidyIsInNldExvY2FsU2NhbGUiLCJfZGlydGlmeVdvcmxkIiwicCIsIl9kaXJ0aWZ5V29ybGRJbnRlcm5hbCIsInNldFBvc2l0aW9uIiwiaW52ZXJ0IiwidHJhbnNmb3JtUG9pbnQiLCJzZXRSb3RhdGlvbiIsInBhcmVudFJvdCIsIm11bCIsInNldEV1bGVyQW5nbGVzIiwibXVsMiIsIl9wcmVwYXJlSW5zZXJ0Q2hpbGQiLCJfb25JbnNlcnRDaGlsZCIsImFkZENoaWxkQW5kU2F2ZVRyYW5zZm9ybSIsIndQb3MiLCJ3Um90Iiwic3BsaWNlIiwiRGVidWciLCJhc3NlcnQiLCJfZmlyZU9uSGllcmFyY2h5IiwibmFtZUhpZXJhcmNoeSIsImVuYWJsZWRJbkhpZXJhcmNoeSIsIl91cGRhdGVHcmFwaERlcHRoIiwiaW5kZXhPZiIsInBhcmVudFdvcmxkU2NhbGUiLCJzY2FsZSIsInBhcmVudFRvVXNlU2NhbGVGcm9tIiwidG1hdHJpeCIsIm11bEFmZmluZTIiLCJzeW5jSGllcmFyY2h5IiwibG9va0F0IiwidXgiLCJ1eSIsInV6IiwiVVAiLCJ1bmRlZmluZWQiLCJzZXRMb29rQXQiLCJ0cmFuc2xhdGUiLCJ0cmFuc2xhdGVMb2NhbCIsInRyYW5zZm9ybVZlY3RvciIsInJvdGF0ZSIsInJvdCIsInJvdGF0ZUxvY2FsIl0sIm1hcHBpbmdzIjoiOzs7Ozs7OztBQVNBLE1BQU1BLDJCQUEyQixHQUFHLElBQUlDLElBQUksRUFBRSxDQUFBO0FBQzlDLE1BQU1DLGtCQUFrQixHQUFHLElBQUlDLElBQUksRUFBRSxDQUFBO0FBQ3JDLE1BQU1DLGtCQUFrQixHQUFHLElBQUlDLElBQUksRUFBRSxDQUFBO0FBQ3JDLE1BQU1DLG1CQUFtQixHQUFHLElBQUlELElBQUksRUFBRSxDQUFBO0FBQ3RDLE1BQU1FLG9CQUFvQixHQUFHLElBQUlKLElBQUksRUFBRSxDQUFBO0FBQ3ZDLE1BQU1LLDZCQUE2QixHQUFHLElBQUlMLElBQUksRUFBRSxDQUFBO0FBQ2hELE1BQU1NLE9BQU8sR0FBRyxJQUFJUixJQUFJLEVBQUUsQ0FBQTtBQUMxQixNQUFNUyxPQUFPLEdBQUcsSUFBSUwsSUFBSSxFQUFFLENBQUE7QUFDMUIsTUFBTU0sUUFBUSxHQUFHLElBQUlSLElBQUksRUFBRSxDQUFBO0FBQzNCLE1BQU1TLFlBQVksR0FBRyxJQUFJWCxJQUFJLEVBQUUsQ0FBQTtBQUMvQixNQUFNWSxRQUFRLEdBQUcsSUFBSVIsSUFBSSxFQUFFLENBQUE7QUFDM0IsTUFBTVMsWUFBWSxHQUFHLElBQUlULElBQUksRUFBRSxDQUFBO0FBQy9CLE1BQU1VLE1BQU0sR0FBRyxJQUFJZCxJQUFJLEVBQUUsQ0FBQTtBQUN6QixNQUFNZSxNQUFNLEdBQUcsSUFBSWIsSUFBSSxFQUFFLENBQUE7QUFDekIsTUFBTWMsRUFBRSxHQUFHLElBQUlkLElBQUksRUFBRSxDQUFBOztBQUVyQjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLE1BQU1lLFNBQVMsU0FBU0MsWUFBWSxDQUFDO0FBZ01qQztBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0lDLEVBQUFBLFdBQVdBLENBQUNDLElBQUksR0FBRyxVQUFVLEVBQUU7QUFDM0IsSUFBQSxLQUFLLEVBQUUsQ0FBQTtBQXJNWDtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBSkksSUFBQSxJQUFBLENBS0FBLElBQUksR0FBQSxLQUFBLENBQUEsQ0FBQTtBQUVKO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUxJLElBQUEsSUFBQSxDQU1BQyxJQUFJLEdBQUcsSUFBSUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFBO0FBRXJCO0lBQUEsSUFDQUMsQ0FBQUEsT0FBTyxHQUFHLEVBQUUsQ0FBQTtBQUVaO0FBQ0E7QUFDSjtBQUNBO0FBQ0E7QUFISSxJQUFBLElBQUEsQ0FJQUMsYUFBYSxHQUFHLElBQUl0QixJQUFJLEVBQUUsQ0FBQTtBQUUxQjtBQUNKO0FBQ0E7QUFDQTtBQUhJLElBQUEsSUFBQSxDQUlBdUIsYUFBYSxHQUFHLElBQUlyQixJQUFJLEVBQUUsQ0FBQTtBQUUxQjtBQUNKO0FBQ0E7QUFDQTtJQUhJLElBSUFzQixDQUFBQSxVQUFVLEdBQUcsSUFBSXhCLElBQUksQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFBO0FBRTlCO0FBQ0o7QUFDQTtBQUNBO0FBSEksSUFBQSxJQUFBLENBSUF5QixnQkFBZ0IsR0FBRyxJQUFJekIsSUFBSSxFQUFFLENBQUE7QUFBRTtBQUUvQjtBQUNBO0FBQ0o7QUFDQTtBQUNBO0FBSEksSUFBQSxJQUFBLENBSUFRLFFBQVEsR0FBRyxJQUFJUixJQUFJLEVBQUUsQ0FBQTtBQUVyQjtBQUNKO0FBQ0E7QUFDQTtBQUhJLElBQUEsSUFBQSxDQUlBVSxRQUFRLEdBQUcsSUFBSVIsSUFBSSxFQUFFLENBQUE7QUFFckI7QUFDSjtBQUNBO0FBQ0E7QUFISSxJQUFBLElBQUEsQ0FJQXdCLFdBQVcsR0FBRyxJQUFJMUIsSUFBSSxFQUFFLENBQUE7QUFFeEI7QUFDSjtBQUNBO0FBQ0E7SUFISSxJQUlBMkIsQ0FBQUEsTUFBTSxHQUFHLElBQUksQ0FBQTtBQUViO0FBQ0o7QUFDQTtBQUNBO0FBSEksSUFBQSxJQUFBLENBSUFDLGNBQWMsR0FBRyxJQUFJOUIsSUFBSSxFQUFFLENBQUE7QUFFM0I7QUFDSjtBQUNBO0FBQ0E7SUFISSxJQUlBK0IsQ0FBQUEsV0FBVyxHQUFHLEtBQUssQ0FBQTtBQUVuQjtBQUNKO0FBQ0E7QUFDQTtJQUhJLElBSUFDLENBQUFBLFFBQVEsR0FBRyxDQUFDLENBQUE7QUFFWjtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0lBUEksSUFRQUMsQ0FBQUEsT0FBTyxHQUFHLEtBQUssQ0FBQTtBQUVmO0FBQ0o7QUFDQTtBQUNBO0FBSEksSUFBQSxJQUFBLENBSUFDLGNBQWMsR0FBRyxJQUFJbEMsSUFBSSxFQUFFLENBQUE7QUFFM0I7QUFDSjtBQUNBO0FBQ0E7SUFISSxJQUlBbUMsQ0FBQUEsV0FBVyxHQUFHLEtBQUssQ0FBQTtBQUVuQjtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7SUFSSSxJQVNBQyxDQUFBQSxlQUFlLEdBQUcsQ0FBQyxDQUFBO0FBRW5CO0FBQ0o7QUFDQTtBQUNBO0FBSEksSUFBQSxJQUFBLENBSUFDLGFBQWEsR0FBRyxJQUFJQyxJQUFJLEVBQUUsQ0FBQTtBQUUxQjtBQUNKO0FBQ0E7QUFDQTtJQUhJLElBSUFDLENBQUFBLFlBQVksR0FBRyxJQUFJLENBQUE7QUFFbkI7QUFDSjtBQUNBO0FBQ0E7SUFISSxJQUlBQyxDQUFBQSxNQUFNLEdBQUcsSUFBSSxDQUFBO0FBRWI7QUFDSjtBQUNBO0FBQ0E7SUFISSxJQUlBQyxDQUFBQSxHQUFHLEdBQUcsSUFBSSxDQUFBO0FBRVY7QUFDSjtBQUNBO0FBQ0E7SUFISSxJQUlBQyxDQUFBQSxRQUFRLEdBQUcsSUFBSSxDQUFBO0FBRWY7QUFDSjtBQUNBO0FBQ0E7SUFISSxJQUlBQyxDQUFBQSxPQUFPLEdBQUcsSUFBSSxDQUFBO0FBRWQ7QUFDSjtBQUNBO0FBQ0E7SUFISSxJQUlBQyxDQUFBQSxTQUFTLEdBQUcsRUFBRSxDQUFBO0FBRWQ7QUFDSjtBQUNBO0FBQ0E7SUFISSxJQUlBQyxDQUFBQSxXQUFXLEdBQUcsQ0FBQyxDQUFBO0FBRWY7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7SUFOSSxJQU9BQyxDQUFBQSxRQUFRLEdBQUcsSUFBSSxDQUFBO0FBRWY7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7SUFOSSxJQU9BQyxDQUFBQSxtQkFBbUIsR0FBRyxLQUFLLENBQUE7QUFFM0I7QUFDSjtBQUNBO0FBQ0E7SUFISSxJQUlBQyxDQUFBQSxpQkFBaUIsR0FBRyxLQUFLLENBQUE7SUFVckIsSUFBSSxDQUFDNUIsSUFBSSxHQUFHQSxJQUFJLENBQUE7QUFDcEIsR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0VBQ0ksSUFBSTZCLEtBQUtBLEdBQUc7QUFDUixJQUFBLElBQUksQ0FBQyxJQUFJLENBQUNULE1BQU0sRUFBRTtBQUNkLE1BQUEsSUFBSSxDQUFDQSxNQUFNLEdBQUcsSUFBSXRDLElBQUksRUFBRSxDQUFBO0FBQzVCLEtBQUE7QUFDQSxJQUFBLE9BQU8sSUFBSSxDQUFDZ0QsaUJBQWlCLEVBQUUsQ0FBQ0MsSUFBSSxDQUFDLElBQUksQ0FBQ1gsTUFBTSxDQUFDLENBQUNZLFNBQVMsRUFBRSxDQUFBO0FBQ2pFLEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtFQUNJLElBQUlwQyxFQUFFQSxHQUFHO0FBQ0wsSUFBQSxJQUFJLENBQUMsSUFBSSxDQUFDeUIsR0FBRyxFQUFFO0FBQ1gsTUFBQSxJQUFJLENBQUNBLEdBQUcsR0FBRyxJQUFJdkMsSUFBSSxFQUFFLENBQUE7QUFDekIsS0FBQTtBQUNBLElBQUEsT0FBTyxJQUFJLENBQUNnRCxpQkFBaUIsRUFBRSxDQUFDRyxJQUFJLENBQUMsSUFBSSxDQUFDWixHQUFHLENBQUMsQ0FBQ1csU0FBUyxFQUFFLENBQUE7QUFDOUQsR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0VBQ0ksSUFBSUUsT0FBT0EsR0FBRztBQUNWLElBQUEsSUFBSSxDQUFDLElBQUksQ0FBQ1osUUFBUSxFQUFFO0FBQ2hCLE1BQUEsSUFBSSxDQUFDQSxRQUFRLEdBQUcsSUFBSXhDLElBQUksRUFBRSxDQUFBO0FBQzlCLEtBQUE7SUFDQSxPQUFPLElBQUksQ0FBQ2dELGlCQUFpQixFQUFFLENBQUNLLElBQUksQ0FBQyxJQUFJLENBQUNiLFFBQVEsQ0FBQyxDQUFDVSxTQUFTLEVBQUUsQ0FBQ0ksU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUE7QUFDakYsR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7RUFDSSxJQUFJQyxZQUFZQSxHQUFHO0FBRWYsSUFBQSxNQUFNQyxTQUFTLEdBQUcsSUFBSSxDQUFDckIsYUFBYSxDQUFBO0lBQ3BDLElBQUksSUFBSSxDQUFDRSxZQUFZLEVBQUU7QUFDbkJtQixNQUFBQSxTQUFTLENBQUNDLFVBQVUsQ0FBQyxJQUFJLENBQUNULGlCQUFpQixFQUFFLENBQUMsQ0FBQ1UsU0FBUyxFQUFFLENBQUE7TUFDMUQsSUFBSSxDQUFDckIsWUFBWSxHQUFHLEtBQUssQ0FBQTtBQUM3QixLQUFBO0FBRUEsSUFBQSxPQUFPbUIsU0FBUyxDQUFBO0FBQ3BCLEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7RUFDSSxJQUFJRyxPQUFPQSxDQUFDQSxPQUFPLEVBQUU7QUFDakIsSUFBQSxJQUFJLElBQUksQ0FBQ2YsUUFBUSxLQUFLZSxPQUFPLEVBQUU7QUFBQSxNQUFBLElBQUFDLGFBQUEsQ0FBQTtNQUMzQixJQUFJLENBQUNoQixRQUFRLEdBQUdlLE9BQU8sQ0FBQTs7QUFFdkI7QUFDQTtBQUNBLE1BQUEsSUFBSUEsT0FBTyxJQUFBLENBQUFDLGFBQUEsR0FBSSxJQUFJLENBQUNuQixPQUFPLEtBQVptQixJQUFBQSxJQUFBQSxhQUFBLENBQWNELE9BQU8sSUFBSSxDQUFDQSxPQUFPLEVBQUU7QUFDOUMsUUFBQSxJQUFJLENBQUNFLDRCQUE0QixDQUFDLElBQUksRUFBRUYsT0FBTyxDQUFDLENBQUE7QUFDcEQsT0FBQTtBQUNKLEtBQUE7QUFDSixHQUFBO0VBRUEsSUFBSUEsT0FBT0EsR0FBRztBQUNWO0FBQ0E7QUFDQTtBQUNBLElBQUEsT0FBTyxJQUFJLENBQUNmLFFBQVEsSUFBSSxJQUFJLENBQUNDLG1CQUFtQixDQUFBO0FBQ3BELEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtFQUNJLElBQUlpQixNQUFNQSxHQUFHO0lBQ1QsT0FBTyxJQUFJLENBQUNyQixPQUFPLENBQUE7QUFDdkIsR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0VBQ0ksSUFBSXNCLElBQUlBLEdBQUc7QUFDUCxJQUFBLElBQUlDLElBQUksR0FBRyxJQUFJLENBQUN2QixPQUFPLENBQUE7SUFDdkIsSUFBSSxDQUFDdUIsSUFBSSxFQUFFO0FBQ1AsTUFBQSxPQUFPLEVBQUUsQ0FBQTtBQUNiLEtBQUE7QUFFQSxJQUFBLElBQUlDLE1BQU0sR0FBRyxJQUFJLENBQUMvQyxJQUFJLENBQUE7QUFDdEIsSUFBQSxPQUFPOEMsSUFBSSxJQUFJQSxJQUFJLENBQUN2QixPQUFPLEVBQUU7QUFDekJ3QixNQUFBQSxNQUFNLEdBQUksQ0FBRUQsRUFBQUEsSUFBSSxDQUFDOUMsSUFBSyxDQUFBLENBQUEsRUFBRytDLE1BQU8sQ0FBQyxDQUFBLENBQUE7TUFDakNELElBQUksR0FBR0EsSUFBSSxDQUFDdkIsT0FBTyxDQUFBO0FBQ3ZCLEtBQUE7QUFDQSxJQUFBLE9BQU93QixNQUFNLENBQUE7QUFDakIsR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0VBQ0ksSUFBSUMsSUFBSUEsR0FBRztJQUNQLElBQUlELE1BQU0sR0FBRyxJQUFJLENBQUE7SUFDakIsT0FBT0EsTUFBTSxDQUFDeEIsT0FBTyxFQUFFO01BQ25Cd0IsTUFBTSxHQUFHQSxNQUFNLENBQUN4QixPQUFPLENBQUE7QUFDM0IsS0FBQTtBQUNBLElBQUEsT0FBT3dCLE1BQU0sQ0FBQTtBQUNqQixHQUFBOztBQUVBO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7RUFDSSxJQUFJRSxRQUFRQSxHQUFHO0lBQ1gsT0FBTyxJQUFJLENBQUN6QixTQUFTLENBQUE7QUFDekIsR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtFQUNJLElBQUkwQixVQUFVQSxHQUFHO0lBQ2IsT0FBTyxJQUFJLENBQUN6QixXQUFXLENBQUE7QUFDM0IsR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0lrQixFQUFBQSw0QkFBNEJBLENBQUNHLElBQUksRUFBRUwsT0FBTyxFQUFFO0FBQ3hDSyxJQUFBQSxJQUFJLENBQUNLLHdCQUF3QixDQUFDVixPQUFPLENBQUMsQ0FBQTtBQUV0QyxJQUFBLE1BQU1XLENBQUMsR0FBR04sSUFBSSxDQUFDdEIsU0FBUyxDQUFBO0FBQ3hCLElBQUEsS0FBSyxJQUFJNkIsQ0FBQyxHQUFHLENBQUMsRUFBRUMsR0FBRyxHQUFHRixDQUFDLENBQUNHLE1BQU0sRUFBRUYsQ0FBQyxHQUFHQyxHQUFHLEVBQUVELENBQUMsRUFBRSxFQUFFO0FBQzFDLE1BQUEsSUFBSUQsQ0FBQyxDQUFDQyxDQUFDLENBQUMsQ0FBQzNCLFFBQVEsRUFDYixJQUFJLENBQUNpQiw0QkFBNEIsQ0FBQ1MsQ0FBQyxDQUFDQyxDQUFDLENBQUMsRUFBRVosT0FBTyxDQUFDLENBQUE7QUFDeEQsS0FBQTtBQUNKLEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0VBQ0lVLHdCQUF3QkEsQ0FBQ1YsT0FBTyxFQUFFO0FBQzlCO0lBQ0EsSUFBSSxDQUFDZCxtQkFBbUIsR0FBR2MsT0FBTyxDQUFBO0lBQ2xDLElBQUlBLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQzVCLE9BQU8sRUFDeEIsSUFBSSxDQUFDMkMscUJBQXFCLEVBQUUsQ0FBQTtBQUNwQyxHQUFBOztBQUVBO0FBQ0o7QUFDQTtBQUNBO0VBQ0lDLGNBQWNBLENBQUNDLEtBQUssRUFBRTtBQUNsQkEsSUFBQUEsS0FBSyxDQUFDMUQsSUFBSSxHQUFHLElBQUksQ0FBQ0EsSUFBSSxDQUFBO0FBRXRCLElBQUEsTUFBTUMsSUFBSSxHQUFHLElBQUksQ0FBQ0EsSUFBSSxDQUFDMEQsS0FBSyxDQUFBO0FBQzVCRCxJQUFBQSxLQUFLLENBQUN6RCxJQUFJLENBQUMyRCxLQUFLLEVBQUUsQ0FBQTtJQUNsQixLQUFLLElBQUlQLENBQUMsR0FBRyxDQUFDLEVBQUVBLENBQUMsR0FBR3BELElBQUksQ0FBQ3NELE1BQU0sRUFBRUYsQ0FBQyxFQUFFLEVBQ2hDSyxLQUFLLENBQUN6RCxJQUFJLENBQUM0RCxHQUFHLENBQUM1RCxJQUFJLENBQUNvRCxDQUFDLENBQUMsQ0FBQyxDQUFBO0FBRTNCSyxJQUFBQSxLQUFLLENBQUN2RCxPQUFPLEdBQUcyRCxNQUFNLENBQUNDLE1BQU0sQ0FBQyxFQUFFLEVBQUUsSUFBSSxDQUFDNUQsT0FBTyxDQUFDLENBQUE7SUFFL0N1RCxLQUFLLENBQUN0RCxhQUFhLENBQUM0RCxJQUFJLENBQUMsSUFBSSxDQUFDNUQsYUFBYSxDQUFDLENBQUE7SUFDNUNzRCxLQUFLLENBQUNyRCxhQUFhLENBQUMyRCxJQUFJLENBQUMsSUFBSSxDQUFDM0QsYUFBYSxDQUFDLENBQUE7SUFDNUNxRCxLQUFLLENBQUNwRCxVQUFVLENBQUMwRCxJQUFJLENBQUMsSUFBSSxDQUFDMUQsVUFBVSxDQUFDLENBQUE7SUFDdENvRCxLQUFLLENBQUNuRCxnQkFBZ0IsQ0FBQ3lELElBQUksQ0FBQyxJQUFJLENBQUN6RCxnQkFBZ0IsQ0FBQyxDQUFBO0lBRWxEbUQsS0FBSyxDQUFDcEUsUUFBUSxDQUFDMEUsSUFBSSxDQUFDLElBQUksQ0FBQzFFLFFBQVEsQ0FBQyxDQUFBO0lBQ2xDb0UsS0FBSyxDQUFDbEUsUUFBUSxDQUFDd0UsSUFBSSxDQUFDLElBQUksQ0FBQ3hFLFFBQVEsQ0FBQyxDQUFBO0lBQ2xDa0UsS0FBSyxDQUFDbEQsV0FBVyxDQUFDd0QsSUFBSSxDQUFDLElBQUksQ0FBQ3hELFdBQVcsQ0FBQyxDQUFBO0lBRXhDa0QsS0FBSyxDQUFDaEQsY0FBYyxDQUFDc0QsSUFBSSxDQUFDLElBQUksQ0FBQ3RELGNBQWMsQ0FBQyxDQUFBO0FBQzlDZ0QsSUFBQUEsS0FBSyxDQUFDL0MsV0FBVyxHQUFHLElBQUksQ0FBQ0EsV0FBVyxDQUFBO0lBRXBDK0MsS0FBSyxDQUFDNUMsY0FBYyxDQUFDa0QsSUFBSSxDQUFDLElBQUksQ0FBQ2xELGNBQWMsQ0FBQyxDQUFBO0FBQzlDNEMsSUFBQUEsS0FBSyxDQUFDM0MsV0FBVyxHQUFHLElBQUksQ0FBQ0EsV0FBVyxDQUFBO0FBQ3BDMkMsSUFBQUEsS0FBSyxDQUFDdkMsWUFBWSxHQUFHLElBQUksQ0FBQ0EsWUFBWSxDQUFBO0FBQ3RDdUMsSUFBQUEsS0FBSyxDQUFDOUMsUUFBUSxHQUFHLElBQUksQ0FBQ0EsUUFBUSxHQUFHLENBQUMsQ0FBQTtBQUVsQzhDLElBQUFBLEtBQUssQ0FBQ2hDLFFBQVEsR0FBRyxJQUFJLENBQUNBLFFBQVEsQ0FBQTtBQUU5QmdDLElBQUFBLEtBQUssQ0FBQzlCLGlCQUFpQixHQUFHLElBQUksQ0FBQ0EsaUJBQWlCLENBQUE7O0FBRWhEO0lBQ0E4QixLQUFLLENBQUMvQixtQkFBbUIsR0FBRyxLQUFLLENBQUE7QUFDckMsR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0krQixFQUFBQSxLQUFLQSxHQUFHO0FBQ0osSUFBQSxNQUFNQSxLQUFLLEdBQUcsSUFBSSxJQUFJLENBQUMzRCxXQUFXLEVBQUUsQ0FBQTtBQUNwQyxJQUFBLElBQUksQ0FBQzBELGNBQWMsQ0FBQ0MsS0FBSyxDQUFDLENBQUE7QUFDMUIsSUFBQSxPQUFPQSxLQUFLLENBQUE7QUFDaEIsR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtFQUNJTSxJQUFJQSxDQUFDQyxNQUFNLEVBQUU7QUFDVEEsSUFBQUEsTUFBTSxDQUFDUixjQUFjLENBQUMsSUFBSSxDQUFDLENBQUE7QUFDM0IsSUFBQSxPQUFPLElBQUksQ0FBQTtBQUNmLEdBQUE7O0FBR0E7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDSVMsRUFBQUEsT0FBT0EsR0FBRztBQUNOO0lBQ0EsSUFBSSxDQUFDQyxNQUFNLEVBQUUsQ0FBQTs7QUFFYjtBQUNBLElBQUEsTUFBTWxCLFFBQVEsR0FBRyxJQUFJLENBQUN6QixTQUFTLENBQUE7SUFDL0IsT0FBT3lCLFFBQVEsQ0FBQ00sTUFBTSxFQUFFO0FBQ3BCO0FBQ0EsTUFBQSxNQUFNYSxLQUFLLEdBQUduQixRQUFRLENBQUNvQixHQUFHLEVBQUUsQ0FBQTtBQUM1QjtBQUNBO0FBQ0E7TUFDQUQsS0FBSyxDQUFDN0MsT0FBTyxHQUFHLElBQUksQ0FBQTtNQUNwQjZDLEtBQUssQ0FBQ0YsT0FBTyxFQUFFLENBQUE7QUFDbkIsS0FBQTs7QUFFQTtBQUNBLElBQUEsSUFBSSxDQUFDSSxJQUFJLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxDQUFBOztBQUUxQjtJQUNBLElBQUksQ0FBQ0MsR0FBRyxFQUFFLENBQUE7QUFDZCxHQUFBOztBQUVBO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDSUMsRUFBQUEsSUFBSUEsQ0FBQ0MsSUFBSSxFQUFFQyxLQUFLLEVBQUU7QUFDZCxJQUFBLElBQUkzQixNQUFNO0FBQUU0QixNQUFBQSxPQUFPLEdBQUcsRUFBRSxDQUFBO0FBQ3hCLElBQUEsTUFBTXJCLEdBQUcsR0FBRyxJQUFJLENBQUM5QixTQUFTLENBQUMrQixNQUFNLENBQUE7SUFFakMsSUFBSWtCLElBQUksWUFBWUcsUUFBUSxFQUFFO01BQzFCLE1BQU1DLEVBQUUsR0FBR0osSUFBSSxDQUFBO0FBRWYxQixNQUFBQSxNQUFNLEdBQUc4QixFQUFFLENBQUMsSUFBSSxDQUFDLENBQUE7QUFDakIsTUFBQSxJQUFJOUIsTUFBTSxFQUNONEIsT0FBTyxDQUFDRyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUE7TUFFdEIsS0FBSyxJQUFJekIsQ0FBQyxHQUFHLENBQUMsRUFBRUEsQ0FBQyxHQUFHQyxHQUFHLEVBQUVELENBQUMsRUFBRSxFQUFFO0FBQzFCLFFBQUEsTUFBTTBCLFdBQVcsR0FBRyxJQUFJLENBQUN2RCxTQUFTLENBQUM2QixDQUFDLENBQUMsQ0FBQ21CLElBQUksQ0FBQ0ssRUFBRSxDQUFDLENBQUE7UUFDOUMsSUFBSUUsV0FBVyxDQUFDeEIsTUFBTSxFQUNsQm9CLE9BQU8sR0FBR0EsT0FBTyxDQUFDSyxNQUFNLENBQUNELFdBQVcsQ0FBQyxDQUFBO0FBQzdDLE9BQUE7QUFDSixLQUFDLE1BQU07QUFDSCxNQUFBLElBQUlFLFNBQVMsQ0FBQTtBQUViLE1BQUEsSUFBSSxJQUFJLENBQUNSLElBQUksQ0FBQyxFQUFFO0FBQ1osUUFBQSxJQUFJLElBQUksQ0FBQ0EsSUFBSSxDQUFDLFlBQVlHLFFBQVEsRUFBRTtBQUNoQ0ssVUFBQUEsU0FBUyxHQUFHLElBQUksQ0FBQ1IsSUFBSSxDQUFDLEVBQUUsQ0FBQTtBQUM1QixTQUFDLE1BQU07QUFDSFEsVUFBQUEsU0FBUyxHQUFHLElBQUksQ0FBQ1IsSUFBSSxDQUFDLENBQUE7QUFDMUIsU0FBQTtRQUNBLElBQUlRLFNBQVMsS0FBS1AsS0FBSyxFQUNuQkMsT0FBTyxDQUFDRyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUE7QUFDMUIsT0FBQTtNQUVBLEtBQUssSUFBSXpCLENBQUMsR0FBRyxDQUFDLEVBQUVBLENBQUMsR0FBR0MsR0FBRyxFQUFFLEVBQUVELENBQUMsRUFBRTtBQUMxQixRQUFBLE1BQU0wQixXQUFXLEdBQUcsSUFBSSxDQUFDdkQsU0FBUyxDQUFDNkIsQ0FBQyxDQUFDLENBQUNtQixJQUFJLENBQUNDLElBQUksRUFBRUMsS0FBSyxDQUFDLENBQUE7UUFDdkQsSUFBSUssV0FBVyxDQUFDeEIsTUFBTSxFQUNsQm9CLE9BQU8sR0FBR0EsT0FBTyxDQUFDSyxNQUFNLENBQUNELFdBQVcsQ0FBQyxDQUFBO0FBQzdDLE9BQUE7QUFDSixLQUFBO0FBRUEsSUFBQSxPQUFPSixPQUFPLENBQUE7QUFDbEIsR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDSU8sRUFBQUEsT0FBT0EsQ0FBQ1QsSUFBSSxFQUFFQyxLQUFLLEVBQUU7QUFDakIsSUFBQSxNQUFNcEIsR0FBRyxHQUFHLElBQUksQ0FBQzlCLFNBQVMsQ0FBQytCLE1BQU0sQ0FBQTtJQUNqQyxJQUFJUixNQUFNLEdBQUcsSUFBSSxDQUFBO0lBRWpCLElBQUkwQixJQUFJLFlBQVlHLFFBQVEsRUFBRTtNQUMxQixNQUFNQyxFQUFFLEdBQUdKLElBQUksQ0FBQTtBQUVmMUIsTUFBQUEsTUFBTSxHQUFHOEIsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFBO01BQ2pCLElBQUk5QixNQUFNLEVBQ04sT0FBTyxJQUFJLENBQUE7TUFFZixLQUFLLElBQUlNLENBQUMsR0FBRyxDQUFDLEVBQUVBLENBQUMsR0FBR0MsR0FBRyxFQUFFRCxDQUFDLEVBQUUsRUFBRTtRQUMxQk4sTUFBTSxHQUFHLElBQUksQ0FBQ3ZCLFNBQVMsQ0FBQzZCLENBQUMsQ0FBQyxDQUFDNkIsT0FBTyxDQUFDTCxFQUFFLENBQUMsQ0FBQTtRQUN0QyxJQUFJOUIsTUFBTSxFQUNOLE9BQU9BLE1BQU0sQ0FBQTtBQUNyQixPQUFBO0FBQ0osS0FBQyxNQUFNO0FBQ0gsTUFBQSxJQUFJa0MsU0FBUyxDQUFBO0FBQ2IsTUFBQSxJQUFJLElBQUksQ0FBQ1IsSUFBSSxDQUFDLEVBQUU7QUFDWixRQUFBLElBQUksSUFBSSxDQUFDQSxJQUFJLENBQUMsWUFBWUcsUUFBUSxFQUFFO0FBQ2hDSyxVQUFBQSxTQUFTLEdBQUcsSUFBSSxDQUFDUixJQUFJLENBQUMsRUFBRSxDQUFBO0FBQzVCLFNBQUMsTUFBTTtBQUNIUSxVQUFBQSxTQUFTLEdBQUcsSUFBSSxDQUFDUixJQUFJLENBQUMsQ0FBQTtBQUMxQixTQUFBO1FBQ0EsSUFBSVEsU0FBUyxLQUFLUCxLQUFLLEVBQUU7QUFDckIsVUFBQSxPQUFPLElBQUksQ0FBQTtBQUNmLFNBQUE7QUFDSixPQUFBO01BRUEsS0FBSyxJQUFJckIsQ0FBQyxHQUFHLENBQUMsRUFBRUEsQ0FBQyxHQUFHQyxHQUFHLEVBQUVELENBQUMsRUFBRSxFQUFFO0FBQzFCTixRQUFBQSxNQUFNLEdBQUcsSUFBSSxDQUFDdkIsU0FBUyxDQUFDNkIsQ0FBQyxDQUFDLENBQUM2QixPQUFPLENBQUNULElBQUksRUFBRUMsS0FBSyxDQUFDLENBQUE7QUFDL0MsUUFBQSxJQUFJM0IsTUFBTSxLQUFLLElBQUksRUFDZixPQUFPQSxNQUFNLENBQUE7QUFDckIsT0FBQTtBQUNKLEtBQUE7QUFFQSxJQUFBLE9BQU8sSUFBSSxDQUFBO0FBQ2YsR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDSW9DLEVBQUFBLFNBQVNBLEdBQUc7SUFDUixNQUFNQyxLQUFLLEdBQUdDLFNBQVMsQ0FBQTtJQUN2QixNQUFNVixPQUFPLEdBQUcsRUFBRSxDQUFBO0FBRWxCLElBQUEsTUFBTVcsU0FBUyxHQUFHQSxDQUFDeEMsSUFBSSxFQUFFeUMsU0FBUyxLQUFLO01BQ25DLElBQUlBLFNBQVMsSUFBSXpDLElBQUksQ0FBQzdDLElBQUksQ0FBQ3VGLEdBQUcsQ0FBQyxHQUFHSixLQUFLLENBQUMsRUFBRTtBQUN0Q1QsUUFBQUEsT0FBTyxDQUFDRyxJQUFJLENBQUNoQyxJQUFJLENBQUMsQ0FBQTtBQUN0QixPQUFBO0FBRUEsTUFBQSxLQUFLLElBQUlPLENBQUMsR0FBRyxDQUFDLEVBQUVBLENBQUMsR0FBR1AsSUFBSSxDQUFDdEIsU0FBUyxDQUFDK0IsTUFBTSxFQUFFRixDQUFDLEVBQUUsRUFBRTtRQUM1Q2lDLFNBQVMsQ0FBQ3hDLElBQUksQ0FBQ3RCLFNBQVMsQ0FBQzZCLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFBO0FBQ3RDLE9BQUE7S0FDSCxDQUFBO0FBRURpQyxJQUFBQSxTQUFTLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFBO0FBRXRCLElBQUEsT0FBT1gsT0FBTyxDQUFBO0FBQ2xCLEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7RUFDSWMsVUFBVUEsQ0FBQ3pGLElBQUksRUFBRTtBQUNiLElBQUEsSUFBSSxJQUFJLENBQUNBLElBQUksS0FBS0EsSUFBSSxFQUFFLE9BQU8sSUFBSSxDQUFBO0FBRW5DLElBQUEsS0FBSyxJQUFJcUQsQ0FBQyxHQUFHLENBQUMsRUFBRUEsQ0FBQyxHQUFHLElBQUksQ0FBQzdCLFNBQVMsQ0FBQytCLE1BQU0sRUFBRUYsQ0FBQyxFQUFFLEVBQUU7QUFDNUMsTUFBQSxNQUFNcUMsS0FBSyxHQUFHLElBQUksQ0FBQ2xFLFNBQVMsQ0FBQzZCLENBQUMsQ0FBQyxDQUFDb0MsVUFBVSxDQUFDekYsSUFBSSxDQUFDLENBQUE7QUFDaEQsTUFBQSxJQUFJMEYsS0FBSyxLQUFLLElBQUksRUFBRSxPQUFPQSxLQUFLLENBQUE7QUFDcEMsS0FBQTtBQUNBLElBQUEsT0FBTyxJQUFJLENBQUE7QUFDZixHQUFBOztBQUVBO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtFQUNJQyxVQUFVQSxDQUFDOUMsSUFBSSxFQUFFO0FBQ2I7QUFDQSxJQUFBLE1BQU0rQyxLQUFLLEdBQUdDLEtBQUssQ0FBQ0MsT0FBTyxDQUFDakQsSUFBSSxDQUFDLEdBQUdBLElBQUksR0FBR0EsSUFBSSxDQUFDa0QsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFBO0lBRTFELElBQUloRCxNQUFNLEdBQUcsSUFBSSxDQUFBO0FBQ2pCLElBQUEsS0FBSyxJQUFJTSxDQUFDLEdBQUcsQ0FBQyxFQUFFMkMsSUFBSSxHQUFHSixLQUFLLENBQUNyQyxNQUFNLEVBQUVGLENBQUMsR0FBRzJDLElBQUksRUFBRSxFQUFFM0MsQ0FBQyxFQUFFO0FBQ2hETixNQUFBQSxNQUFNLEdBQUdBLE1BQU0sQ0FBQ0UsUUFBUSxDQUFDdUIsSUFBSSxDQUFDcEIsQ0FBQyxJQUFJQSxDQUFDLENBQUNwRCxJQUFJLEtBQUs0RixLQUFLLENBQUN2QyxDQUFDLENBQUMsQ0FBQyxDQUFBO01BQ3ZELElBQUksQ0FBQ04sTUFBTSxFQUFFO0FBQ1QsUUFBQSxPQUFPLElBQUksQ0FBQTtBQUNmLE9BQUE7QUFDSixLQUFBO0FBRUEsSUFBQSxPQUFPQSxNQUFNLENBQUE7QUFDakIsR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDSWtELEVBQUFBLE9BQU9BLENBQUNDLFFBQVEsRUFBRUMsT0FBTyxFQUFFO0FBQ3ZCRCxJQUFBQSxRQUFRLENBQUNFLElBQUksQ0FBQ0QsT0FBTyxFQUFFLElBQUksQ0FBQyxDQUFBO0FBRTVCLElBQUEsTUFBTWxELFFBQVEsR0FBRyxJQUFJLENBQUN6QixTQUFTLENBQUE7QUFDL0IsSUFBQSxLQUFLLElBQUk2QixDQUFDLEdBQUcsQ0FBQyxFQUFFQSxDQUFDLEdBQUdKLFFBQVEsQ0FBQ00sTUFBTSxFQUFFRixDQUFDLEVBQUUsRUFBRTtNQUN0Q0osUUFBUSxDQUFDSSxDQUFDLENBQUMsQ0FBQzRDLE9BQU8sQ0FBQ0MsUUFBUSxFQUFFQyxPQUFPLENBQUMsQ0FBQTtBQUMxQyxLQUFBO0FBQ0osR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtFQUNJRSxjQUFjQSxDQUFDdkQsSUFBSSxFQUFFO0FBQ2pCLElBQUEsSUFBSUYsTUFBTSxHQUFHLElBQUksQ0FBQ3JCLE9BQU8sQ0FBQTtBQUN6QixJQUFBLE9BQU9xQixNQUFNLEVBQUU7QUFDWCxNQUFBLElBQUlBLE1BQU0sS0FBS0UsSUFBSSxFQUNmLE9BQU8sSUFBSSxDQUFBO01BRWZGLE1BQU0sR0FBR0EsTUFBTSxDQUFDckIsT0FBTyxDQUFBO0FBQzNCLEtBQUE7QUFDQSxJQUFBLE9BQU8sS0FBSyxDQUFBO0FBQ2hCLEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7RUFDSStFLFlBQVlBLENBQUN4RCxJQUFJLEVBQUU7QUFDZixJQUFBLE9BQU9BLElBQUksQ0FBQ3VELGNBQWMsQ0FBQyxJQUFJLENBQUMsQ0FBQTtBQUNwQyxHQUFBOztBQUVBO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNJRSxFQUFBQSxjQUFjQSxHQUFHO0lBQ2IsSUFBSSxDQUFDekUsaUJBQWlCLEVBQUUsQ0FBQ3lFLGNBQWMsQ0FBQyxJQUFJLENBQUMvRixXQUFXLENBQUMsQ0FBQTtJQUN6RCxPQUFPLElBQUksQ0FBQ0EsV0FBVyxDQUFBO0FBQzNCLEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNJZ0csRUFBQUEsbUJBQW1CQSxHQUFHO0lBQ2xCLElBQUksQ0FBQ25HLGFBQWEsQ0FBQ2tHLGNBQWMsQ0FBQyxJQUFJLENBQUNoRyxnQkFBZ0IsQ0FBQyxDQUFBO0lBQ3hELE9BQU8sSUFBSSxDQUFDQSxnQkFBZ0IsQ0FBQTtBQUNoQyxHQUFBOztBQUVBO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDSWtHLEVBQUFBLGdCQUFnQkEsR0FBRztJQUNmLE9BQU8sSUFBSSxDQUFDckcsYUFBYSxDQUFBO0FBQzdCLEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0lzRyxFQUFBQSxnQkFBZ0JBLEdBQUc7SUFDZixPQUFPLElBQUksQ0FBQ3JHLGFBQWEsQ0FBQTtBQUM3QixHQUFBOztBQUVBO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDSXNHLEVBQUFBLGFBQWFBLEdBQUc7SUFDWixPQUFPLElBQUksQ0FBQ3JHLFVBQVUsQ0FBQTtBQUMxQixHQUFBOztBQUVBO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDSXNHLEVBQUFBLGlCQUFpQkEsR0FBRztJQUNoQixJQUFJLElBQUksQ0FBQ2pHLFdBQVcsRUFBRTtBQUNsQixNQUFBLElBQUksQ0FBQ0QsY0FBYyxDQUFDbUcsTUFBTSxDQUFDLElBQUksQ0FBQ3pHLGFBQWEsRUFBRSxJQUFJLENBQUNDLGFBQWEsRUFBRSxJQUFJLENBQUNDLFVBQVUsQ0FBQyxDQUFBO01BQ25GLElBQUksQ0FBQ0ssV0FBVyxHQUFHLEtBQUssQ0FBQTtBQUM1QixLQUFBO0lBQ0EsT0FBTyxJQUFJLENBQUNELGNBQWMsQ0FBQTtBQUM5QixHQUFBOztBQUVBO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDSW9HLEVBQUFBLFdBQVdBLEdBQUc7SUFDVixJQUFJLENBQUNoRixpQkFBaUIsRUFBRSxDQUFDaUYsY0FBYyxDQUFDLElBQUksQ0FBQ3pILFFBQVEsQ0FBQyxDQUFBO0lBQ3RELE9BQU8sSUFBSSxDQUFDQSxRQUFRLENBQUE7QUFDeEIsR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDSTBILEVBQUFBLFdBQVdBLEdBQUc7SUFDVixJQUFJLENBQUN4SCxRQUFRLENBQUN5SCxXQUFXLENBQUMsSUFBSSxDQUFDbkYsaUJBQWlCLEVBQUUsQ0FBQyxDQUFBO0lBQ25ELE9BQU8sSUFBSSxDQUFDdEMsUUFBUSxDQUFBO0FBQ3hCLEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDSTBILEVBQUFBLFFBQVFBLEdBQUc7QUFDUCxJQUFBLElBQUksQ0FBQyxJQUFJLENBQUN6RyxNQUFNLEVBQUU7QUFDZCxNQUFBLElBQUksQ0FBQ0EsTUFBTSxHQUFHLElBQUkzQixJQUFJLEVBQUUsQ0FBQTtBQUM1QixLQUFBO0lBQ0EsT0FBTyxJQUFJLENBQUNnRCxpQkFBaUIsRUFBRSxDQUFDb0YsUUFBUSxDQUFDLElBQUksQ0FBQ3pHLE1BQU0sQ0FBQyxDQUFBO0FBQ3pELEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDSXFCLEVBQUFBLGlCQUFpQkEsR0FBRztBQUNoQixJQUFBLElBQUksQ0FBQyxJQUFJLENBQUNuQixXQUFXLElBQUksQ0FBQyxJQUFJLENBQUNJLFdBQVcsRUFDdEMsT0FBTyxJQUFJLENBQUNELGNBQWMsQ0FBQTtJQUU5QixJQUFJLElBQUksQ0FBQ1MsT0FBTyxFQUNaLElBQUksQ0FBQ0EsT0FBTyxDQUFDTyxpQkFBaUIsRUFBRSxDQUFBO0lBRXBDLElBQUksQ0FBQ3FGLEtBQUssRUFBRSxDQUFBO0lBRVosT0FBTyxJQUFJLENBQUNyRyxjQUFjLENBQUE7QUFDOUIsR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7RUFDSSxJQUFJc0csY0FBY0EsR0FBRztBQUVqQixJQUFBLElBQUksSUFBSSxDQUFDcEcsZUFBZSxLQUFLLENBQUMsRUFBRTtNQUM1QixJQUFJLENBQUNBLGVBQWUsR0FBRyxJQUFJLENBQUNjLGlCQUFpQixFQUFFLENBQUN1RixTQUFTLENBQUE7QUFDN0QsS0FBQTtJQUVBLE9BQU8sSUFBSSxDQUFDckcsZUFBZSxDQUFBO0FBQy9CLEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0ltRCxFQUFBQSxNQUFNQSxHQUFHO0FBQUEsSUFBQSxJQUFBbUQsY0FBQSxDQUFBO0lBQ0wsQ0FBQUEsY0FBQSxHQUFJLElBQUEsQ0FBQy9GLE9BQU8sS0FBQSxJQUFBLEdBQUEsS0FBQSxDQUFBLEdBQVorRixjQUFBLENBQWNDLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQTtBQUNuQyxHQUFBOztBQUVBO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNJQyxFQUFBQSxRQUFRQSxDQUFDNUUsTUFBTSxFQUFFNkUsS0FBSyxFQUFFO0lBQ3BCLElBQUksQ0FBQ3RELE1BQU0sRUFBRSxDQUFBO0FBQ2IsSUFBQSxJQUFJdkIsTUFBTSxFQUFFO01BQ1IsSUFBSTZFLEtBQUssSUFBSSxDQUFDLEVBQUU7QUFDWjdFLFFBQUFBLE1BQU0sQ0FBQzhFLFdBQVcsQ0FBQyxJQUFJLEVBQUVELEtBQUssQ0FBQyxDQUFBO0FBQ25DLE9BQUMsTUFBTTtBQUNIN0UsUUFBQUEsTUFBTSxDQUFDK0UsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFBO0FBQ3pCLE9BQUE7QUFDSixLQUFBO0FBQ0osR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDSUMsRUFBQUEsbUJBQW1CQSxDQUFDQyxDQUFDLEVBQUVDLENBQUMsRUFBRUMsQ0FBQyxFQUFFO0lBQ3pCLElBQUksQ0FBQzFILGFBQWEsQ0FBQzJILGtCQUFrQixDQUFDSCxDQUFDLEVBQUVDLENBQUMsRUFBRUMsQ0FBQyxDQUFDLENBQUE7SUFFOUMsSUFBSSxDQUFDLElBQUksQ0FBQ3BILFdBQVcsRUFDakIsSUFBSSxDQUFDc0gsYUFBYSxFQUFFLENBQUE7QUFDNUIsR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0lDLEVBQUFBLGdCQUFnQkEsQ0FBQ0wsQ0FBQyxFQUFFQyxDQUFDLEVBQUVDLENBQUMsRUFBRTtJQUN0QixJQUFJRixDQUFDLFlBQVkvSSxJQUFJLEVBQUU7QUFDbkIsTUFBQSxJQUFJLENBQUNzQixhQUFhLENBQUM0RCxJQUFJLENBQUM2RCxDQUFDLENBQUMsQ0FBQTtBQUM5QixLQUFDLE1BQU07TUFDSCxJQUFJLENBQUN6SCxhQUFhLENBQUMrSCxHQUFHLENBQUNOLENBQUMsRUFBRUMsQ0FBQyxFQUFFQyxDQUFDLENBQUMsQ0FBQTtBQUNuQyxLQUFBO0lBRUEsSUFBSSxDQUFDLElBQUksQ0FBQ3BILFdBQVcsRUFDakIsSUFBSSxDQUFDc0gsYUFBYSxFQUFFLENBQUE7QUFDNUIsR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7RUFDSUcsZ0JBQWdCQSxDQUFDUCxDQUFDLEVBQUVDLENBQUMsRUFBRUMsQ0FBQyxFQUFFTSxDQUFDLEVBQUU7SUFDekIsSUFBSVIsQ0FBQyxZQUFZN0ksSUFBSSxFQUFFO0FBQ25CLE1BQUEsSUFBSSxDQUFDcUIsYUFBYSxDQUFDMkQsSUFBSSxDQUFDNkQsQ0FBQyxDQUFDLENBQUE7QUFDOUIsS0FBQyxNQUFNO0FBQ0gsTUFBQSxJQUFJLENBQUN4SCxhQUFhLENBQUM4SCxHQUFHLENBQUNOLENBQUMsRUFBRUMsQ0FBQyxFQUFFQyxDQUFDLEVBQUVNLENBQUMsQ0FBQyxDQUFBO0FBQ3RDLEtBQUE7SUFFQSxJQUFJLENBQUMsSUFBSSxDQUFDMUgsV0FBVyxFQUNqQixJQUFJLENBQUNzSCxhQUFhLEVBQUUsQ0FBQTtBQUM1QixHQUFBOztBQUVBO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0lLLEVBQUFBLGFBQWFBLENBQUNULENBQUMsRUFBRUMsQ0FBQyxFQUFFQyxDQUFDLEVBQUU7SUFDbkIsSUFBSUYsQ0FBQyxZQUFZL0ksSUFBSSxFQUFFO0FBQ25CLE1BQUEsSUFBSSxDQUFDd0IsVUFBVSxDQUFDMEQsSUFBSSxDQUFDNkQsQ0FBQyxDQUFDLENBQUE7QUFDM0IsS0FBQyxNQUFNO01BQ0gsSUFBSSxDQUFDdkgsVUFBVSxDQUFDNkgsR0FBRyxDQUFDTixDQUFDLEVBQUVDLENBQUMsRUFBRUMsQ0FBQyxDQUFDLENBQUE7QUFDaEMsS0FBQTtJQUVBLElBQUksQ0FBQyxJQUFJLENBQUNwSCxXQUFXLEVBQ2pCLElBQUksQ0FBQ3NILGFBQWEsRUFBRSxDQUFBO0FBQzVCLEdBQUE7O0FBRUE7QUFDQUEsRUFBQUEsYUFBYUEsR0FBRztBQUNaLElBQUEsSUFBSSxDQUFDLElBQUksQ0FBQ3RILFdBQVcsRUFBRTtNQUNuQixJQUFJLENBQUNBLFdBQVcsR0FBRyxJQUFJLENBQUE7TUFDdkIsSUFBSSxDQUFDLElBQUksQ0FBQ0ksV0FBVyxFQUNqQixJQUFJLENBQUN3SCxhQUFhLEVBQUUsQ0FBQTtBQUM1QixLQUFBO0FBQ0osR0FBQTs7QUFFQTtBQUNBL0UsRUFBQUEscUJBQXFCQSxHQUFHO0FBQ3BCLElBQUEsSUFBSWdGLENBQUMsR0FBRyxJQUFJLENBQUNqSCxPQUFPLENBQUE7QUFDcEIsSUFBQSxPQUFPaUgsQ0FBQyxFQUFFO01BQ05BLENBQUMsQ0FBQzNILE9BQU8sR0FBRyxLQUFLLENBQUE7TUFDakIySCxDQUFDLEdBQUdBLENBQUMsQ0FBQ2pILE9BQU8sQ0FBQTtBQUNqQixLQUFBO0FBQ0osR0FBQTs7QUFFQTtBQUNBZ0gsRUFBQUEsYUFBYUEsR0FBRztJQUNaLElBQUksQ0FBQyxJQUFJLENBQUN4SCxXQUFXLEVBQ2pCLElBQUksQ0FBQ3lDLHFCQUFxQixFQUFFLENBQUE7SUFDaEMsSUFBSSxDQUFDaUYscUJBQXFCLEVBQUUsQ0FBQTtBQUNoQyxHQUFBOztBQUVBO0FBQ0FBLEVBQUFBLHFCQUFxQkEsR0FBRztBQUNwQixJQUFBLElBQUksQ0FBQyxJQUFJLENBQUMxSCxXQUFXLEVBQUU7TUFDbkIsSUFBSSxDQUFDRixPQUFPLEdBQUcsS0FBSyxDQUFBO01BQ3BCLElBQUksQ0FBQ0UsV0FBVyxHQUFHLElBQUksQ0FBQTtBQUN2QixNQUFBLEtBQUssSUFBSXNDLENBQUMsR0FBRyxDQUFDLEVBQUVBLENBQUMsR0FBRyxJQUFJLENBQUM3QixTQUFTLENBQUMrQixNQUFNLEVBQUVGLENBQUMsRUFBRSxFQUFFO0FBQzVDLFFBQUEsSUFBSSxDQUFDLElBQUksQ0FBQzdCLFNBQVMsQ0FBQzZCLENBQUMsQ0FBQyxDQUFDdEMsV0FBVyxFQUM5QixJQUFJLENBQUNTLFNBQVMsQ0FBQzZCLENBQUMsQ0FBQyxDQUFDb0YscUJBQXFCLEVBQUUsQ0FBQTtBQUNqRCxPQUFBO0FBQ0osS0FBQTtJQUNBLElBQUksQ0FBQ3RILFlBQVksR0FBRyxJQUFJLENBQUE7QUFDeEIsSUFBQSxJQUFJLENBQUNILGVBQWUsR0FBRyxDQUFDLENBQUM7SUFDekIsSUFBSSxDQUFDSixRQUFRLEVBQUUsQ0FBQTtBQUNuQixHQUFBOztBQUVBO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDSThILEVBQUFBLFdBQVdBLENBQUNiLENBQUMsRUFBRUMsQ0FBQyxFQUFFQyxDQUFDLEVBQUU7SUFDakIsSUFBSUYsQ0FBQyxZQUFZL0ksSUFBSSxFQUFFO0FBQ25CUSxNQUFBQSxRQUFRLENBQUMwRSxJQUFJLENBQUM2RCxDQUFDLENBQUMsQ0FBQTtBQUNwQixLQUFDLE1BQU07TUFDSHZJLFFBQVEsQ0FBQzZJLEdBQUcsQ0FBQ04sQ0FBQyxFQUFFQyxDQUFDLEVBQUVDLENBQUMsQ0FBQyxDQUFBO0FBQ3pCLEtBQUE7QUFFQSxJQUFBLElBQUksSUFBSSxDQUFDeEcsT0FBTyxLQUFLLElBQUksRUFBRTtBQUN2QixNQUFBLElBQUksQ0FBQ25CLGFBQWEsQ0FBQzRELElBQUksQ0FBQzFFLFFBQVEsQ0FBQyxDQUFBO0FBQ3JDLEtBQUMsTUFBTTtBQUNIQyxNQUFBQSxZQUFZLENBQUN5RSxJQUFJLENBQUMsSUFBSSxDQUFDekMsT0FBTyxDQUFDTyxpQkFBaUIsRUFBRSxDQUFDLENBQUM2RyxNQUFNLEVBQUUsQ0FBQTtNQUM1RHBKLFlBQVksQ0FBQ3FKLGNBQWMsQ0FBQ3RKLFFBQVEsRUFBRSxJQUFJLENBQUNjLGFBQWEsQ0FBQyxDQUFBO0FBQzdELEtBQUE7SUFFQSxJQUFJLENBQUMsSUFBSSxDQUFDTyxXQUFXLEVBQ2pCLElBQUksQ0FBQ3NILGFBQWEsRUFBRSxDQUFBO0FBQzVCLEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0VBQ0lZLFdBQVdBLENBQUNoQixDQUFDLEVBQUVDLENBQUMsRUFBRUMsQ0FBQyxFQUFFTSxDQUFDLEVBQUU7SUFDcEIsSUFBSVIsQ0FBQyxZQUFZN0ksSUFBSSxFQUFFO0FBQ25CUSxNQUFBQSxRQUFRLENBQUN3RSxJQUFJLENBQUM2RCxDQUFDLENBQUMsQ0FBQTtBQUNwQixLQUFDLE1BQU07TUFDSHJJLFFBQVEsQ0FBQzJJLEdBQUcsQ0FBQ04sQ0FBQyxFQUFFQyxDQUFDLEVBQUVDLENBQUMsRUFBRU0sQ0FBQyxDQUFDLENBQUE7QUFDNUIsS0FBQTtBQUVBLElBQUEsSUFBSSxJQUFJLENBQUM5RyxPQUFPLEtBQUssSUFBSSxFQUFFO0FBQ3ZCLE1BQUEsSUFBSSxDQUFDbEIsYUFBYSxDQUFDMkQsSUFBSSxDQUFDeEUsUUFBUSxDQUFDLENBQUE7QUFDckMsS0FBQyxNQUFNO01BQ0gsTUFBTXNKLFNBQVMsR0FBRyxJQUFJLENBQUN2SCxPQUFPLENBQUN5RixXQUFXLEVBQUUsQ0FBQTtNQUM1Q3ZILFlBQVksQ0FBQ3VFLElBQUksQ0FBQzhFLFNBQVMsQ0FBQyxDQUFDSCxNQUFNLEVBQUUsQ0FBQTtNQUNyQyxJQUFJLENBQUN0SSxhQUFhLENBQUMyRCxJQUFJLENBQUN2RSxZQUFZLENBQUMsQ0FBQ3NKLEdBQUcsQ0FBQ3ZKLFFBQVEsQ0FBQyxDQUFBO0FBQ3ZELEtBQUE7SUFFQSxJQUFJLENBQUMsSUFBSSxDQUFDbUIsV0FBVyxFQUNqQixJQUFJLENBQUNzSCxhQUFhLEVBQUUsQ0FBQTtBQUM1QixHQUFBOztBQUVBO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNJZSxFQUFBQSxjQUFjQSxDQUFDbkIsQ0FBQyxFQUFFQyxDQUFDLEVBQUVDLENBQUMsRUFBRTtJQUNwQixJQUFJLENBQUMxSCxhQUFhLENBQUMySCxrQkFBa0IsQ0FBQ0gsQ0FBQyxFQUFFQyxDQUFDLEVBQUVDLENBQUMsQ0FBQyxDQUFBO0FBRTlDLElBQUEsSUFBSSxJQUFJLENBQUN4RyxPQUFPLEtBQUssSUFBSSxFQUFFO01BQ3ZCLE1BQU11SCxTQUFTLEdBQUcsSUFBSSxDQUFDdkgsT0FBTyxDQUFDeUYsV0FBVyxFQUFFLENBQUE7TUFDNUN2SCxZQUFZLENBQUN1RSxJQUFJLENBQUM4RSxTQUFTLENBQUMsQ0FBQ0gsTUFBTSxFQUFFLENBQUE7TUFDckMsSUFBSSxDQUFDdEksYUFBYSxDQUFDNEksSUFBSSxDQUFDeEosWUFBWSxFQUFFLElBQUksQ0FBQ1ksYUFBYSxDQUFDLENBQUE7QUFDN0QsS0FBQTtJQUVBLElBQUksQ0FBQyxJQUFJLENBQUNNLFdBQVcsRUFDakIsSUFBSSxDQUFDc0gsYUFBYSxFQUFFLENBQUE7QUFDNUIsR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7RUFDSU4sUUFBUUEsQ0FBQzdFLElBQUksRUFBRTtBQUNYLElBQUEsSUFBSSxDQUFDb0csbUJBQW1CLENBQUNwRyxJQUFJLENBQUMsQ0FBQTtBQUM5QixJQUFBLElBQUksQ0FBQ3RCLFNBQVMsQ0FBQ3NELElBQUksQ0FBQ2hDLElBQUksQ0FBQyxDQUFBO0FBQ3pCLElBQUEsSUFBSSxDQUFDcUcsY0FBYyxDQUFDckcsSUFBSSxDQUFDLENBQUE7QUFDN0IsR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtFQUNJc0csd0JBQXdCQSxDQUFDdEcsSUFBSSxFQUFFO0FBRTNCLElBQUEsTUFBTXVHLElBQUksR0FBR3ZHLElBQUksQ0FBQ2dFLFdBQVcsRUFBRSxDQUFBO0FBQy9CLElBQUEsTUFBTXdDLElBQUksR0FBR3hHLElBQUksQ0FBQ2tFLFdBQVcsRUFBRSxDQUFBO0FBRS9CLElBQUEsSUFBSSxDQUFDa0MsbUJBQW1CLENBQUNwRyxJQUFJLENBQUMsQ0FBQTtJQUU5QkEsSUFBSSxDQUFDNEYsV0FBVyxDQUFDdEosT0FBTyxDQUFDNEUsSUFBSSxDQUFDLElBQUksQ0FBQ2xELGNBQWMsQ0FBQyxDQUFDNkgsTUFBTSxFQUFFLENBQUNDLGNBQWMsQ0FBQ1MsSUFBSSxDQUFDLENBQUMsQ0FBQTtJQUNqRnZHLElBQUksQ0FBQytGLFdBQVcsQ0FBQ3hKLE9BQU8sQ0FBQzJFLElBQUksQ0FBQyxJQUFJLENBQUNnRCxXQUFXLEVBQUUsQ0FBQyxDQUFDMkIsTUFBTSxFQUFFLENBQUNJLEdBQUcsQ0FBQ08sSUFBSSxDQUFDLENBQUMsQ0FBQTtBQUVyRSxJQUFBLElBQUksQ0FBQzlILFNBQVMsQ0FBQ3NELElBQUksQ0FBQ2hDLElBQUksQ0FBQyxDQUFBO0FBQ3pCLElBQUEsSUFBSSxDQUFDcUcsY0FBYyxDQUFDckcsSUFBSSxDQUFDLENBQUE7QUFDN0IsR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0k0RSxFQUFBQSxXQUFXQSxDQUFDNUUsSUFBSSxFQUFFMkUsS0FBSyxFQUFFO0FBRXJCLElBQUEsSUFBSSxDQUFDeUIsbUJBQW1CLENBQUNwRyxJQUFJLENBQUMsQ0FBQTtJQUM5QixJQUFJLENBQUN0QixTQUFTLENBQUMrSCxNQUFNLENBQUM5QixLQUFLLEVBQUUsQ0FBQyxFQUFFM0UsSUFBSSxDQUFDLENBQUE7QUFDckMsSUFBQSxJQUFJLENBQUNxRyxjQUFjLENBQUNyRyxJQUFJLENBQUMsQ0FBQTtBQUM3QixHQUFBOztBQUVBO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtFQUNJb0csbUJBQW1CQSxDQUFDcEcsSUFBSSxFQUFFO0FBRXRCO0lBQ0FBLElBQUksQ0FBQ3FCLE1BQU0sRUFBRSxDQUFBO0FBRWJxRixJQUFBQSxLQUFLLENBQUNDLE1BQU0sQ0FBQzNHLElBQUksS0FBSyxJQUFJLEVBQUcsQ0FBWUEsVUFBQUEsRUFBQUEsSUFBSSxJQUFKQSxJQUFBQSxHQUFBQSxLQUFBQSxDQUFBQSxHQUFBQSxJQUFJLENBQUU5QyxJQUFLLDhCQUE2QixDQUFDLENBQUE7QUFDbEZ3SixJQUFBQSxLQUFLLENBQUNDLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQ3BELGNBQWMsQ0FBQ3ZELElBQUksQ0FBQyxFQUFHLGFBQVlBLElBQUksSUFBQSxJQUFBLEdBQUEsS0FBQSxDQUFBLEdBQUpBLElBQUksQ0FBRTlDLElBQUssb0NBQW1DLENBQUMsQ0FBQTtBQUN6RyxHQUFBOztBQUVBO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNJMEosRUFBQUEsZ0JBQWdCQSxDQUFDMUosSUFBSSxFQUFFMkosYUFBYSxFQUFFL0csTUFBTSxFQUFFO0FBQzFDLElBQUEsSUFBSSxDQUFDMEIsSUFBSSxDQUFDdEUsSUFBSSxFQUFFNEMsTUFBTSxDQUFDLENBQUE7QUFDdkIsSUFBQSxLQUFLLElBQUlTLENBQUMsR0FBRyxDQUFDLEVBQUVBLENBQUMsR0FBRyxJQUFJLENBQUM3QixTQUFTLENBQUMrQixNQUFNLEVBQUVGLENBQUMsRUFBRSxFQUFFO0FBQzVDLE1BQUEsSUFBSSxDQUFDN0IsU0FBUyxDQUFDNkIsQ0FBQyxDQUFDLENBQUNxRyxnQkFBZ0IsQ0FBQ0MsYUFBYSxFQUFFQSxhQUFhLEVBQUUvRyxNQUFNLENBQUMsQ0FBQTtBQUM1RSxLQUFBO0FBQ0osR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7RUFDSXVHLGNBQWNBLENBQUNyRyxJQUFJLEVBQUU7SUFDakJBLElBQUksQ0FBQ3ZCLE9BQU8sR0FBRyxJQUFJLENBQUE7O0FBRW5CO0FBQ0E7SUFDQSxNQUFNcUksa0JBQWtCLEdBQUk5RyxJQUFJLENBQUNwQixRQUFRLElBQUksSUFBSSxDQUFDZSxPQUFRLENBQUE7QUFDMUQsSUFBQSxJQUFJSyxJQUFJLENBQUNuQixtQkFBbUIsS0FBS2lJLGtCQUFrQixFQUFFO01BQ2pEOUcsSUFBSSxDQUFDbkIsbUJBQW1CLEdBQUdpSSxrQkFBa0IsQ0FBQTs7QUFFN0M7QUFDQTtBQUNBO0FBQ0E7QUFDQTlHLE1BQUFBLElBQUksQ0FBQ0gsNEJBQTRCLENBQUNHLElBQUksRUFBRThHLGtCQUFrQixDQUFDLENBQUE7QUFDL0QsS0FBQTs7QUFFQTtJQUNBOUcsSUFBSSxDQUFDK0csaUJBQWlCLEVBQUUsQ0FBQTs7QUFFeEI7SUFDQS9HLElBQUksQ0FBQ3lGLGFBQWEsRUFBRSxDQUFBO0FBQ3BCO0lBQ0EsSUFBSSxJQUFJLENBQUMxSCxPQUFPLEVBQ1ppQyxJQUFJLENBQUNVLHFCQUFxQixFQUFFLENBQUE7O0FBRWhDO0lBQ0FWLElBQUksQ0FBQzRHLGdCQUFnQixDQUFDLFFBQVEsRUFBRSxpQkFBaUIsRUFBRSxJQUFJLENBQUMsQ0FBQTs7QUFFeEQ7SUFDQSxJQUFJLElBQUksQ0FBQ3BGLElBQUksRUFBRSxJQUFJLENBQUNBLElBQUksQ0FBQyxhQUFhLEVBQUV4QixJQUFJLENBQUMsQ0FBQTtBQUNqRCxHQUFBOztBQUVBO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDSStHLEVBQUFBLGlCQUFpQkEsR0FBRztBQUNoQixJQUFBLElBQUksQ0FBQ3BJLFdBQVcsR0FBRyxJQUFJLENBQUNGLE9BQU8sR0FBRyxJQUFJLENBQUNBLE9BQU8sQ0FBQ0UsV0FBVyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUE7QUFFbEUsSUFBQSxLQUFLLElBQUk0QixDQUFDLEdBQUcsQ0FBQyxFQUFFQyxHQUFHLEdBQUcsSUFBSSxDQUFDOUIsU0FBUyxDQUFDK0IsTUFBTSxFQUFFRixDQUFDLEdBQUdDLEdBQUcsRUFBRUQsQ0FBQyxFQUFFLEVBQUU7TUFDdkQsSUFBSSxDQUFDN0IsU0FBUyxDQUFDNkIsQ0FBQyxDQUFDLENBQUN3RyxpQkFBaUIsRUFBRSxDQUFBO0FBQ3pDLEtBQUE7QUFDSixHQUFBOztBQUVBO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7RUFDSXRDLFdBQVdBLENBQUNuRCxLQUFLLEVBQUU7SUFDZixNQUFNcUQsS0FBSyxHQUFHLElBQUksQ0FBQ2pHLFNBQVMsQ0FBQ3NJLE9BQU8sQ0FBQzFGLEtBQUssQ0FBQyxDQUFBO0FBQzNDLElBQUEsSUFBSXFELEtBQUssS0FBSyxDQUFDLENBQUMsRUFBRTtBQUNkLE1BQUEsT0FBQTtBQUNKLEtBQUE7O0FBRUE7SUFDQSxJQUFJLENBQUNqRyxTQUFTLENBQUMrSCxNQUFNLENBQUM5QixLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUE7O0FBRS9CO0lBQ0FyRCxLQUFLLENBQUM3QyxPQUFPLEdBQUcsSUFBSSxDQUFBOztBQUVwQjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7SUFDQTZDLEtBQUssQ0FBQ3NGLGdCQUFnQixDQUFDLFFBQVEsRUFBRSxpQkFBaUIsRUFBRSxJQUFJLENBQUMsQ0FBQTs7QUFFekQ7QUFDQSxJQUFBLElBQUksQ0FBQ3BGLElBQUksQ0FBQyxhQUFhLEVBQUVGLEtBQUssQ0FBQyxDQUFBO0FBQ25DLEdBQUE7QUFFQStDLEVBQUFBLEtBQUtBLEdBQUc7SUFDSixJQUFJLElBQUksQ0FBQ3hHLFdBQVcsRUFBRTtBQUNsQixNQUFBLElBQUksQ0FBQ0QsY0FBYyxDQUFDbUcsTUFBTSxDQUFDLElBQUksQ0FBQ3pHLGFBQWEsRUFBRSxJQUFJLENBQUNDLGFBQWEsRUFBRSxJQUFJLENBQUNDLFVBQVUsQ0FBQyxDQUFBO01BRW5GLElBQUksQ0FBQ0ssV0FBVyxHQUFHLEtBQUssQ0FBQTtBQUM1QixLQUFBO0lBRUEsSUFBSSxJQUFJLENBQUNJLFdBQVcsRUFBRTtBQUNsQixNQUFBLElBQUksSUFBSSxDQUFDUSxPQUFPLEtBQUssSUFBSSxFQUFFO1FBQ3ZCLElBQUksQ0FBQ1QsY0FBYyxDQUFDa0QsSUFBSSxDQUFDLElBQUksQ0FBQ3RELGNBQWMsQ0FBQyxDQUFBO0FBQ2pELE9BQUMsTUFBTTtRQUNILElBQUksSUFBSSxDQUFDa0IsaUJBQWlCLEVBQUU7QUFDeEIsVUFBQSxJQUFJbUksZ0JBQWdCLENBQUE7QUFDcEIsVUFBQSxNQUFNbkgsTUFBTSxHQUFHLElBQUksQ0FBQ3JCLE9BQU8sQ0FBQTs7QUFFM0I7QUFDQSxVQUFBLElBQUl5SSxLQUFLLEdBQUcsSUFBSSxDQUFDMUosVUFBVSxDQUFBO0FBQzNCLFVBQUEsSUFBSTJKLG9CQUFvQixHQUFHckgsTUFBTSxDQUFDO0FBQ2xDLFVBQUEsSUFBSXFILG9CQUFvQixFQUFFO0FBQ3RCLFlBQUEsT0FBT0Esb0JBQW9CLElBQUlBLG9CQUFvQixDQUFDckksaUJBQWlCLEVBQUU7Y0FDbkVxSSxvQkFBb0IsR0FBR0Esb0JBQW9CLENBQUMxSSxPQUFPLENBQUE7QUFDdkQsYUFBQTtBQUNBO0FBQ0EsWUFBQSxJQUFJMEksb0JBQW9CLEVBQUU7QUFDdEJBLGNBQUFBLG9CQUFvQixHQUFHQSxvQkFBb0IsQ0FBQzFJLE9BQU8sQ0FBQztBQUNwRCxjQUFBLElBQUkwSSxvQkFBb0IsRUFBRTtBQUN0QkYsZ0JBQUFBLGdCQUFnQixHQUFHRSxvQkFBb0IsQ0FBQ25KLGNBQWMsQ0FBQ29HLFFBQVEsRUFBRSxDQUFBO2dCQUNqRWhJLG9CQUFvQixDQUFDK0osSUFBSSxDQUFDYyxnQkFBZ0IsRUFBRSxJQUFJLENBQUN6SixVQUFVLENBQUMsQ0FBQTtBQUM1RDBKLGdCQUFBQSxLQUFLLEdBQUc5SyxvQkFBb0IsQ0FBQTtBQUNoQyxlQUFBO0FBQ0osYUFBQTtBQUNKLFdBQUE7O0FBRUE7QUFDQUQsVUFBQUEsbUJBQW1CLENBQUNnSSxXQUFXLENBQUNyRSxNQUFNLENBQUM5QixjQUFjLENBQUMsQ0FBQTtVQUN0RC9CLGtCQUFrQixDQUFDa0ssSUFBSSxDQUFDaEssbUJBQW1CLEVBQUUsSUFBSSxDQUFDb0IsYUFBYSxDQUFDLENBQUE7O0FBRWhFO0FBQ0EsVUFBQSxJQUFJNkosT0FBTyxHQUFHdEgsTUFBTSxDQUFDOUIsY0FBYyxDQUFBO1VBQ25DLElBQUk4QixNQUFNLENBQUNoQixpQkFBaUIsRUFBRTtZQUMxQnpDLDZCQUE2QixDQUFDOEosSUFBSSxDQUFDYyxnQkFBZ0IsRUFBRW5ILE1BQU0sQ0FBQytELGFBQWEsRUFBRSxDQUFDLENBQUE7QUFDNUVoSSxZQUFBQSwyQkFBMkIsQ0FBQ2tJLE1BQU0sQ0FBQ2pFLE1BQU0sQ0FBQzlCLGNBQWMsQ0FBQ2lHLGNBQWMsQ0FBQ2xJLGtCQUFrQixDQUFDLEVBQ3hESSxtQkFBbUIsRUFDbkJFLDZCQUE2QixDQUFDLENBQUE7QUFDakUrSyxZQUFBQSxPQUFPLEdBQUd2TCwyQkFBMkIsQ0FBQTtBQUN6QyxXQUFBO1VBQ0F1TCxPQUFPLENBQUN0QixjQUFjLENBQUMsSUFBSSxDQUFDeEksYUFBYSxFQUFFdkIsa0JBQWtCLENBQUMsQ0FBQTtVQUU5RCxJQUFJLENBQUNpQyxjQUFjLENBQUMrRixNQUFNLENBQUNoSSxrQkFBa0IsRUFBRUUsa0JBQWtCLEVBQUVpTCxLQUFLLENBQUMsQ0FBQTtBQUU3RSxTQUFDLE1BQU07QUFDSCxVQUFBLElBQUksQ0FBQ2xKLGNBQWMsQ0FBQ3FKLFVBQVUsQ0FBQyxJQUFJLENBQUM1SSxPQUFPLENBQUNULGNBQWMsRUFBRSxJQUFJLENBQUNKLGNBQWMsQ0FBQyxDQUFBO0FBQ3BGLFNBQUE7QUFDSixPQUFBO01BRUEsSUFBSSxDQUFDSyxXQUFXLEdBQUcsS0FBSyxDQUFBO0FBQzVCLEtBQUE7QUFDSixHQUFBOztBQUVBO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDSXFKLEVBQUFBLGFBQWFBLEdBQUc7QUFDWixJQUFBLElBQUksQ0FBQyxJQUFJLENBQUMxSSxRQUFRLEVBQ2QsT0FBQTtJQUVKLElBQUksSUFBSSxDQUFDYixPQUFPLEVBQ1osT0FBQTtJQUNKLElBQUksQ0FBQ0EsT0FBTyxHQUFHLElBQUksQ0FBQTtBQUVuQixJQUFBLElBQUksSUFBSSxDQUFDRixXQUFXLElBQUksSUFBSSxDQUFDSSxXQUFXLEVBQUU7TUFDdEMsSUFBSSxDQUFDb0csS0FBSyxFQUFFLENBQUE7QUFDaEIsS0FBQTtBQUVBLElBQUEsTUFBTWxFLFFBQVEsR0FBRyxJQUFJLENBQUN6QixTQUFTLENBQUE7QUFDL0IsSUFBQSxLQUFLLElBQUk2QixDQUFDLEdBQUcsQ0FBQyxFQUFFQyxHQUFHLEdBQUdMLFFBQVEsQ0FBQ00sTUFBTSxFQUFFRixDQUFDLEdBQUdDLEdBQUcsRUFBRUQsQ0FBQyxFQUFFLEVBQUU7QUFDakRKLE1BQUFBLFFBQVEsQ0FBQ0ksQ0FBQyxDQUFDLENBQUMrRyxhQUFhLEVBQUUsQ0FBQTtBQUMvQixLQUFBO0FBQ0osR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNJQyxFQUFBQSxNQUFNQSxDQUFDeEMsQ0FBQyxFQUFFQyxDQUFDLEVBQUVDLENBQUMsRUFBRXVDLEVBQUUsR0FBRyxDQUFDLEVBQUVDLEVBQUUsR0FBRyxDQUFDLEVBQUVDLEVBQUUsR0FBRyxDQUFDLEVBQUU7SUFDcEMsSUFBSTNDLENBQUMsWUFBWS9JLElBQUksRUFBRTtBQUNuQmEsTUFBQUEsTUFBTSxDQUFDcUUsSUFBSSxDQUFDNkQsQ0FBQyxDQUFDLENBQUE7TUFFZCxJQUFJQyxDQUFDLFlBQVloSixJQUFJLEVBQUU7QUFBRTtBQUNyQmMsUUFBQUEsRUFBRSxDQUFDb0UsSUFBSSxDQUFDOEQsQ0FBQyxDQUFDLENBQUE7QUFDZCxPQUFDLE1BQU07QUFBRTtBQUNMbEksUUFBQUEsRUFBRSxDQUFDb0UsSUFBSSxDQUFDbEYsSUFBSSxDQUFDMkwsRUFBRSxDQUFDLENBQUE7QUFDcEIsT0FBQTtBQUNKLEtBQUMsTUFBTSxJQUFJMUMsQ0FBQyxLQUFLMkMsU0FBUyxFQUFFO0FBQ3hCLE1BQUEsT0FBQTtBQUNKLEtBQUMsTUFBTTtNQUNIL0ssTUFBTSxDQUFDd0ksR0FBRyxDQUFDTixDQUFDLEVBQUVDLENBQUMsRUFBRUMsQ0FBQyxDQUFDLENBQUE7TUFDbkJuSSxFQUFFLENBQUN1SSxHQUFHLENBQUNtQyxFQUFFLEVBQUVDLEVBQUUsRUFBRUMsRUFBRSxDQUFDLENBQUE7QUFDdEIsS0FBQTtBQUVBOUssSUFBQUEsTUFBTSxDQUFDaUwsU0FBUyxDQUFDLElBQUksQ0FBQzdELFdBQVcsRUFBRSxFQUFFbkgsTUFBTSxFQUFFQyxFQUFFLENBQUMsQ0FBQTtBQUNoREosSUFBQUEsUUFBUSxDQUFDeUgsV0FBVyxDQUFDdkgsTUFBTSxDQUFDLENBQUE7QUFDNUIsSUFBQSxJQUFJLENBQUNtSixXQUFXLENBQUNySixRQUFRLENBQUMsQ0FBQTtBQUM5QixHQUFBOztBQUVBO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDSW9MLEVBQUFBLFNBQVNBLENBQUMvQyxDQUFDLEVBQUVDLENBQUMsRUFBRUMsQ0FBQyxFQUFFO0lBQ2YsSUFBSUYsQ0FBQyxZQUFZL0ksSUFBSSxFQUFFO0FBQ25CUSxNQUFBQSxRQUFRLENBQUMwRSxJQUFJLENBQUM2RCxDQUFDLENBQUMsQ0FBQTtBQUNwQixLQUFDLE1BQU07TUFDSHZJLFFBQVEsQ0FBQzZJLEdBQUcsQ0FBQ04sQ0FBQyxFQUFFQyxDQUFDLEVBQUVDLENBQUMsQ0FBQyxDQUFBO0FBQ3pCLEtBQUE7SUFFQXpJLFFBQVEsQ0FBQ3VFLEdBQUcsQ0FBQyxJQUFJLENBQUNpRCxXQUFXLEVBQUUsQ0FBQyxDQUFBO0FBQ2hDLElBQUEsSUFBSSxDQUFDNEIsV0FBVyxDQUFDcEosUUFBUSxDQUFDLENBQUE7QUFDOUIsR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0l1TCxFQUFBQSxjQUFjQSxDQUFDaEQsQ0FBQyxFQUFFQyxDQUFDLEVBQUVDLENBQUMsRUFBRTtJQUNwQixJQUFJRixDQUFDLFlBQVkvSSxJQUFJLEVBQUU7QUFDbkJRLE1BQUFBLFFBQVEsQ0FBQzBFLElBQUksQ0FBQzZELENBQUMsQ0FBQyxDQUFBO0FBQ3BCLEtBQUMsTUFBTTtNQUNIdkksUUFBUSxDQUFDNkksR0FBRyxDQUFDTixDQUFDLEVBQUVDLENBQUMsRUFBRUMsQ0FBQyxDQUFDLENBQUE7QUFDekIsS0FBQTtJQUVBLElBQUksQ0FBQzFILGFBQWEsQ0FBQ3lLLGVBQWUsQ0FBQ3hMLFFBQVEsRUFBRUEsUUFBUSxDQUFDLENBQUE7QUFDdEQsSUFBQSxJQUFJLENBQUNjLGFBQWEsQ0FBQ3lELEdBQUcsQ0FBQ3ZFLFFBQVEsQ0FBQyxDQUFBO0lBRWhDLElBQUksQ0FBQyxJQUFJLENBQUNxQixXQUFXLEVBQ2pCLElBQUksQ0FBQ3NILGFBQWEsRUFBRSxDQUFBO0FBQzVCLEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNJOEMsRUFBQUEsTUFBTUEsQ0FBQ2xELENBQUMsRUFBRUMsQ0FBQyxFQUFFQyxDQUFDLEVBQUU7SUFDWnZJLFFBQVEsQ0FBQ3dJLGtCQUFrQixDQUFDSCxDQUFDLEVBQUVDLENBQUMsRUFBRUMsQ0FBQyxDQUFDLENBQUE7QUFFcEMsSUFBQSxJQUFJLElBQUksQ0FBQ3hHLE9BQU8sS0FBSyxJQUFJLEVBQUU7TUFDdkIsSUFBSSxDQUFDbEIsYUFBYSxDQUFDNEksSUFBSSxDQUFDekosUUFBUSxFQUFFLElBQUksQ0FBQ2EsYUFBYSxDQUFDLENBQUE7QUFDekQsS0FBQyxNQUFNO0FBQ0gsTUFBQSxNQUFNMkssR0FBRyxHQUFHLElBQUksQ0FBQ2hFLFdBQVcsRUFBRSxDQUFBO01BQzlCLE1BQU04QixTQUFTLEdBQUcsSUFBSSxDQUFDdkgsT0FBTyxDQUFDeUYsV0FBVyxFQUFFLENBQUE7TUFFNUN2SCxZQUFZLENBQUN1RSxJQUFJLENBQUM4RSxTQUFTLENBQUMsQ0FBQ0gsTUFBTSxFQUFFLENBQUE7QUFDckNuSixNQUFBQSxRQUFRLENBQUN5SixJQUFJLENBQUN4SixZQUFZLEVBQUVELFFBQVEsQ0FBQyxDQUFBO01BQ3JDLElBQUksQ0FBQ2EsYUFBYSxDQUFDNEksSUFBSSxDQUFDekosUUFBUSxFQUFFd0wsR0FBRyxDQUFDLENBQUE7QUFDMUMsS0FBQTtJQUVBLElBQUksQ0FBQyxJQUFJLENBQUNySyxXQUFXLEVBQ2pCLElBQUksQ0FBQ3NILGFBQWEsRUFBRSxDQUFBO0FBQzVCLEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNJZ0QsRUFBQUEsV0FBV0EsQ0FBQ3BELENBQUMsRUFBRUMsQ0FBQyxFQUFFQyxDQUFDLEVBQUU7SUFDakJ2SSxRQUFRLENBQUN3SSxrQkFBa0IsQ0FBQ0gsQ0FBQyxFQUFFQyxDQUFDLEVBQUVDLENBQUMsQ0FBQyxDQUFBO0FBRXBDLElBQUEsSUFBSSxDQUFDMUgsYUFBYSxDQUFDMEksR0FBRyxDQUFDdkosUUFBUSxDQUFDLENBQUE7SUFFaEMsSUFBSSxDQUFDLElBQUksQ0FBQ21CLFdBQVcsRUFDakIsSUFBSSxDQUFDc0gsYUFBYSxFQUFFLENBQUE7QUFDNUIsR0FBQTtBQUNKOzs7OyJ9
