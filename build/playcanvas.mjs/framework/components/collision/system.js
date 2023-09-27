import { Debug } from '../../../core/debug.js';
import { Mat4 } from '../../../core/math/mat4.js';
import { Quat } from '../../../core/math/quat.js';
import { Vec3 } from '../../../core/math/vec3.js';
import { SEMANTIC_POSITION } from '../../../platform/graphics/constants.js';
import { GraphNode } from '../../../scene/graph-node.js';
import { Model } from '../../../scene/model.js';
import { Component } from '../component.js';
import { ComponentSystem } from '../system.js';
import { CollisionComponent } from './component.js';
import { CollisionComponentData } from './data.js';
import { Trigger } from './trigger.js';

const mat4 = new Mat4();
const p1 = new Vec3();
const p2 = new Vec3();
const quat = new Quat();
const tempGraphNode = new GraphNode();
const _schema = ['enabled', 'type', 'halfExtents', 'linearOffset', 'angularOffset', 'radius', 'axis', 'height', 'asset', 'renderAsset', 'shape', 'model', 'render'];

// Collision system implementations
class CollisionSystemImpl {
  constructor(system) {
    this.system = system;
  }

  // Called before the call to system.super.initializeComponentData is made
  beforeInitialize(component, data) {
    data.shape = null;
    data.model = new Model();
    data.model.graph = new GraphNode();
  }

  // Called after the call to system.super.initializeComponentData is made
  afterInitialize(component, data) {
    this.recreatePhysicalShapes(component);
    component.data.initialized = true;
  }

  // Called when a collision component changes type in order to recreate debug and physical shapes
  reset(component, data) {
    this.beforeInitialize(component, data);
    this.afterInitialize(component, data);
  }

  // Re-creates rigid bodies / triggers
  recreatePhysicalShapes(component) {
    const entity = component.entity;
    const data = component.data;
    if (typeof Ammo !== 'undefined') {
      if (entity.trigger) {
        entity.trigger.destroy();
        delete entity.trigger;
      }
      if (data.shape) {
        if (component._compoundParent) {
          this.system._removeCompoundChild(component._compoundParent, data.shape);
          if (component._compoundParent.entity.rigidbody) component._compoundParent.entity.rigidbody.activate();
        }
        this.destroyShape(data);
      }
      data.shape = this.createPhysicalShape(component.entity, data);
      const firstCompoundChild = !component._compoundParent;
      if (data.type === 'compound' && (!component._compoundParent || component === component._compoundParent)) {
        component._compoundParent = component;
        entity.forEach(this._addEachDescendant, component);
      } else if (data.type !== 'compound') {
        if (component._compoundParent && component === component._compoundParent) {
          entity.forEach(this.system.implementations.compound._updateEachDescendant, component);
        }
        if (!component.rigidbody) {
          component._compoundParent = null;
          let parent = entity.parent;
          while (parent) {
            if (parent.collision && parent.collision.type === 'compound') {
              component._compoundParent = parent.collision;
              break;
            }
            parent = parent.parent;
          }
        }
      }
      if (component._compoundParent) {
        if (component !== component._compoundParent) {
          if (firstCompoundChild && component._compoundParent.shape.getNumChildShapes() === 0) {
            this.system.recreatePhysicalShapes(component._compoundParent);
          } else {
            this.system.updateCompoundChildTransform(entity);
            if (component._compoundParent.entity.rigidbody) component._compoundParent.entity.rigidbody.activate();
          }
        }
      }
      if (entity.rigidbody) {
        entity.rigidbody.disableSimulation();
        entity.rigidbody.createBody();
        if (entity.enabled && entity.rigidbody.enabled) {
          entity.rigidbody.enableSimulation();
        }
      } else if (!component._compoundParent) {
        if (!entity.trigger) {
          entity.trigger = new Trigger(this.system.app, component, data);
        } else {
          entity.trigger.initialize(data);
        }
      }
    }
  }

  // Creates a physical shape for the collision. This consists
  // of the actual shape that will be used for the rigid bodies / triggers of
  // the collision.
  createPhysicalShape(entity, data) {
    return undefined;
  }
  updateTransform(component, position, rotation, scale) {
    if (component.entity.trigger) {
      component.entity.trigger.updateTransform();
    }
  }
  destroyShape(data) {
    if (data.shape) {
      Ammo.destroy(data.shape);
      data.shape = null;
    }
  }
  beforeRemove(entity, component) {
    if (component.data.shape) {
      if (component._compoundParent && !component._compoundParent.entity._destroying) {
        this.system._removeCompoundChild(component._compoundParent, component.data.shape);
        if (component._compoundParent.entity.rigidbody) component._compoundParent.entity.rigidbody.activate();
      }
      component._compoundParent = null;
      this.destroyShape(component.data);
    }
  }

  // Called when the collision is removed
  remove(entity, data) {
    if (entity.rigidbody && entity.rigidbody.body) {
      entity.rigidbody.disableSimulation();
    }
    if (entity.trigger) {
      entity.trigger.destroy();
      delete entity.trigger;
    }
  }

  // Called when the collision is cloned to another entity
  clone(entity, clone) {
    const src = this.system.store[entity.getGuid()];
    const data = {
      enabled: src.data.enabled,
      type: src.data.type,
      halfExtents: [src.data.halfExtents.x, src.data.halfExtents.y, src.data.halfExtents.z],
      linearOffset: [src.data.linearOffset.x, src.data.linearOffset.y, src.data.linearOffset.z],
      angularOffset: [src.data.angularOffset.x, src.data.angularOffset.y, src.data.angularOffset.z, src.data.angularOffset.w],
      radius: src.data.radius,
      axis: src.data.axis,
      height: src.data.height,
      asset: src.data.asset,
      renderAsset: src.data.renderAsset,
      model: src.data.model,
      render: src.data.render
    };
    return this.system.addComponent(clone, data);
  }
}

// Box Collision System
class CollisionBoxSystemImpl extends CollisionSystemImpl {
  createPhysicalShape(entity, data) {
    if (typeof Ammo !== 'undefined') {
      const he = data.halfExtents;
      const ammoHe = new Ammo.btVector3(he ? he.x : 0.5, he ? he.y : 0.5, he ? he.z : 0.5);
      const shape = new Ammo.btBoxShape(ammoHe);
      Ammo.destroy(ammoHe);
      return shape;
    }
    return undefined;
  }
}

// Sphere Collision System
class CollisionSphereSystemImpl extends CollisionSystemImpl {
  createPhysicalShape(entity, data) {
    if (typeof Ammo !== 'undefined') {
      return new Ammo.btSphereShape(data.radius);
    }
    return undefined;
  }
}

// Capsule Collision System
class CollisionCapsuleSystemImpl extends CollisionSystemImpl {
  createPhysicalShape(entity, data) {
    var _data$axis, _data$radius, _data$height;
    const axis = (_data$axis = data.axis) != null ? _data$axis : 1;
    const radius = (_data$radius = data.radius) != null ? _data$radius : 0.5;
    const height = Math.max(((_data$height = data.height) != null ? _data$height : 2) - 2 * radius, 0);
    let shape = null;
    if (typeof Ammo !== 'undefined') {
      switch (axis) {
        case 0:
          shape = new Ammo.btCapsuleShapeX(radius, height);
          break;
        case 1:
          shape = new Ammo.btCapsuleShape(radius, height);
          break;
        case 2:
          shape = new Ammo.btCapsuleShapeZ(radius, height);
          break;
      }
    }
    return shape;
  }
}

// Cylinder Collision System
class CollisionCylinderSystemImpl extends CollisionSystemImpl {
  createPhysicalShape(entity, data) {
    var _data$axis2, _data$radius2, _data$height2;
    const axis = (_data$axis2 = data.axis) != null ? _data$axis2 : 1;
    const radius = (_data$radius2 = data.radius) != null ? _data$radius2 : 0.5;
    const height = (_data$height2 = data.height) != null ? _data$height2 : 1;
    let halfExtents = null;
    let shape = null;
    if (typeof Ammo !== 'undefined') {
      switch (axis) {
        case 0:
          halfExtents = new Ammo.btVector3(height * 0.5, radius, radius);
          shape = new Ammo.btCylinderShapeX(halfExtents);
          break;
        case 1:
          halfExtents = new Ammo.btVector3(radius, height * 0.5, radius);
          shape = new Ammo.btCylinderShape(halfExtents);
          break;
        case 2:
          halfExtents = new Ammo.btVector3(radius, radius, height * 0.5);
          shape = new Ammo.btCylinderShapeZ(halfExtents);
          break;
      }
    }
    if (halfExtents) Ammo.destroy(halfExtents);
    return shape;
  }
}

// Cone Collision System
class CollisionConeSystemImpl extends CollisionSystemImpl {
  createPhysicalShape(entity, data) {
    var _data$axis3, _data$radius3, _data$height3;
    const axis = (_data$axis3 = data.axis) != null ? _data$axis3 : 1;
    const radius = (_data$radius3 = data.radius) != null ? _data$radius3 : 0.5;
    const height = (_data$height3 = data.height) != null ? _data$height3 : 1;
    let shape = null;
    if (typeof Ammo !== 'undefined') {
      switch (axis) {
        case 0:
          shape = new Ammo.btConeShapeX(radius, height);
          break;
        case 1:
          shape = new Ammo.btConeShape(radius, height);
          break;
        case 2:
          shape = new Ammo.btConeShapeZ(radius, height);
          break;
      }
    }
    return shape;
  }
}

// Mesh Collision System
class CollisionMeshSystemImpl extends CollisionSystemImpl {
  // override for the mesh implementation because the asset model needs
  // special handling
  beforeInitialize(component, data) {}
  createAmmoMesh(mesh, node, shape) {
    let triMesh;
    if (this.system._triMeshCache[mesh.id]) {
      triMesh = this.system._triMeshCache[mesh.id];
    } else {
      const vb = mesh.vertexBuffer;
      const format = vb.getFormat();
      let stride;
      let positions;
      for (let i = 0; i < format.elements.length; i++) {
        const element = format.elements[i];
        if (element.name === SEMANTIC_POSITION) {
          positions = new Float32Array(vb.lock(), element.offset);
          stride = element.stride / 4;
          break;
        }
      }
      const indices = [];
      mesh.getIndices(indices);
      const numTriangles = mesh.primitive[0].count / 3;
      const v1 = new Ammo.btVector3();
      const v2 = new Ammo.btVector3();
      const v3 = new Ammo.btVector3();
      let i1, i2, i3;
      const base = mesh.primitive[0].base;
      triMesh = new Ammo.btTriangleMesh();
      this.system._triMeshCache[mesh.id] = triMesh;
      for (let i = 0; i < numTriangles; i++) {
        i1 = indices[base + i * 3] * stride;
        i2 = indices[base + i * 3 + 1] * stride;
        i3 = indices[base + i * 3 + 2] * stride;
        v1.setValue(positions[i1], positions[i1 + 1], positions[i1 + 2]);
        v2.setValue(positions[i2], positions[i2 + 1], positions[i2 + 2]);
        v3.setValue(positions[i3], positions[i3 + 1], positions[i3 + 2]);
        triMesh.addTriangle(v1, v2, v3, true);
      }
      Ammo.destroy(v1);
      Ammo.destroy(v2);
      Ammo.destroy(v3);
    }
    const useQuantizedAabbCompression = true;
    const triMeshShape = new Ammo.btBvhTriangleMeshShape(triMesh, useQuantizedAabbCompression);
    const scaling = this.system._getNodeScaling(node);
    triMeshShape.setLocalScaling(scaling);
    Ammo.destroy(scaling);
    const transform = this.system._getNodeTransform(node);
    shape.addChildShape(transform, triMeshShape);
    Ammo.destroy(transform);
  }
  createPhysicalShape(entity, data) {
    if (typeof Ammo === 'undefined') return undefined;
    if (data.model || data.render) {
      const shape = new Ammo.btCompoundShape();
      if (data.model) {
        const meshInstances = data.model.meshInstances;
        for (let i = 0; i < meshInstances.length; i++) {
          this.createAmmoMesh(meshInstances[i].mesh, meshInstances[i].node, shape);
        }
      } else if (data.render) {
        const meshes = data.render.meshes;
        for (let i = 0; i < meshes.length; i++) {
          this.createAmmoMesh(meshes[i], tempGraphNode, shape);
        }
      }
      const entityTransform = entity.getWorldTransform();
      const scale = entityTransform.getScale();
      const vec = new Ammo.btVector3(scale.x, scale.y, scale.z);
      shape.setLocalScaling(vec);
      Ammo.destroy(vec);
      return shape;
    }
    return undefined;
  }
  recreatePhysicalShapes(component) {
    const data = component.data;
    if (data.renderAsset || data.asset) {
      if (component.enabled && component.entity.enabled) {
        this.loadAsset(component, data.renderAsset || data.asset, data.renderAsset ? 'render' : 'model');
        return;
      }
    }
    this.doRecreatePhysicalShape(component);
  }
  loadAsset(component, id, property) {
    const data = component.data;
    const assets = this.system.app.assets;
    const asset = assets.get(id);
    if (asset) {
      asset.ready(asset => {
        data[property] = asset.resource;
        this.doRecreatePhysicalShape(component);
      });
      assets.load(asset);
    } else {
      assets.once('add:' + id, asset => {
        asset.ready(asset => {
          data[property] = asset.resource;
          this.doRecreatePhysicalShape(component);
        });
        assets.load(asset);
      });
    }
  }
  doRecreatePhysicalShape(component) {
    const entity = component.entity;
    const data = component.data;
    if (data.model || data.render) {
      this.destroyShape(data);
      data.shape = this.createPhysicalShape(entity, data);
      if (entity.rigidbody) {
        entity.rigidbody.disableSimulation();
        entity.rigidbody.createBody();
        if (entity.enabled && entity.rigidbody.enabled) {
          entity.rigidbody.enableSimulation();
        }
      } else {
        if (!entity.trigger) {
          entity.trigger = new Trigger(this.system.app, component, data);
        } else {
          entity.trigger.initialize(data);
        }
      }
    } else {
      this.beforeRemove(entity, component);
      this.remove(entity, data);
    }
  }
  updateTransform(component, position, rotation, scale) {
    if (component.shape) {
      const entityTransform = component.entity.getWorldTransform();
      const worldScale = entityTransform.getScale();

      // if the scale changed then recreate the shape
      const previousScale = component.shape.getLocalScaling();
      if (worldScale.x !== previousScale.x() || worldScale.y !== previousScale.y() || worldScale.z !== previousScale.z()) {
        this.doRecreatePhysicalShape(component);
      }
    }
    super.updateTransform(component, position, rotation, scale);
  }
  destroyShape(data) {
    if (!data.shape) return;
    const numShapes = data.shape.getNumChildShapes();
    for (let i = 0; i < numShapes; i++) {
      const shape = data.shape.getChildShape(i);
      Ammo.destroy(shape);
    }
    Ammo.destroy(data.shape);
    data.shape = null;
  }
}

// Compound Collision System
class CollisionCompoundSystemImpl extends CollisionSystemImpl {
  createPhysicalShape(entity, data) {
    if (typeof Ammo !== 'undefined') {
      return new Ammo.btCompoundShape();
    }
    return undefined;
  }
  _addEachDescendant(entity) {
    if (!entity.collision || entity.rigidbody) return;
    entity.collision._compoundParent = this;
    if (entity !== this.entity) {
      entity.collision.system.recreatePhysicalShapes(entity.collision);
    }
  }
  _updateEachDescendant(entity) {
    if (!entity.collision) return;
    if (entity.collision._compoundParent !== this) return;
    entity.collision._compoundParent = null;
    if (entity !== this.entity && !entity.rigidbody) {
      entity.collision.system.recreatePhysicalShapes(entity.collision);
    }
  }
  _updateEachDescendantTransform(entity) {
    if (!entity.collision || entity.collision._compoundParent !== this.collision._compoundParent) return;
    this.collision.system.updateCompoundChildTransform(entity);
  }
}

/**
 * Manages creation of {@link CollisionComponent}s.
 *
 * @augments ComponentSystem
 * @category Physics
 */
class CollisionComponentSystem extends ComponentSystem {
  /**
   * Creates a new CollisionComponentSystem instance.
   *
   * @param {import('../../app-base.js').AppBase} app - The running {@link AppBase}.
   * @hideconstructor
   */
  constructor(app) {
    super(app);
    this.id = 'collision';
    this.ComponentType = CollisionComponent;
    this.DataType = CollisionComponentData;
    this.schema = _schema;
    this.implementations = {};
    this._triMeshCache = {};
    this.on('beforeremove', this.onBeforeRemove, this);
    this.on('remove', this.onRemove, this);
  }
  initializeComponentData(component, _data, properties) {
    properties = ['type', 'halfExtents', 'radius', 'axis', 'height', 'shape', 'model', 'asset', 'render', 'renderAsset', 'enabled', 'linearOffset', 'angularOffset'];

    // duplicate the input data because we are modifying it
    const data = {};
    for (let i = 0, len = properties.length; i < len; i++) {
      const property = properties[i];
      data[property] = _data[property];
    }

    // asset takes priority over model
    // but they are both trying to change the mesh
    // so remove one of them to avoid conflicts
    let idx;
    if (_data.hasOwnProperty('asset')) {
      idx = properties.indexOf('model');
      if (idx !== -1) {
        properties.splice(idx, 1);
      }
      idx = properties.indexOf('render');
      if (idx !== -1) {
        properties.splice(idx, 1);
      }
    } else if (_data.hasOwnProperty('model')) {
      idx = properties.indexOf('asset');
      if (idx !== -1) {
        properties.splice(idx, 1);
      }
    }
    if (!data.type) {
      data.type = component.data.type;
    }
    component.data.type = data.type;
    if (Array.isArray(data.halfExtents)) {
      data.halfExtents = new Vec3(data.halfExtents);
    }
    if (Array.isArray(data.linearOffset)) {
      data.linearOffset = new Vec3(data.linearOffset);
    }
    if (Array.isArray(data.angularOffset)) {
      // Allow for euler angles to be passed as a 3 length array
      const values = data.angularOffset;
      if (values.length === 3) {
        data.angularOffset = new Quat().setFromEulerAngles(values[0], values[1], values[2]);
      } else {
        data.angularOffset = new Quat(data.angularOffset);
      }
    }
    const impl = this._createImplementation(data.type);
    impl.beforeInitialize(component, data);
    super.initializeComponentData(component, data, properties);
    impl.afterInitialize(component, data);
  }

  // Creates an implementation based on the collision type and caches it
  // in an internal implementations structure, before returning it.
  _createImplementation(type) {
    if (this.implementations[type] === undefined) {
      let impl;
      switch (type) {
        case 'box':
          impl = new CollisionBoxSystemImpl(this);
          break;
        case 'sphere':
          impl = new CollisionSphereSystemImpl(this);
          break;
        case 'capsule':
          impl = new CollisionCapsuleSystemImpl(this);
          break;
        case 'cylinder':
          impl = new CollisionCylinderSystemImpl(this);
          break;
        case 'cone':
          impl = new CollisionConeSystemImpl(this);
          break;
        case 'mesh':
          impl = new CollisionMeshSystemImpl(this);
          break;
        case 'compound':
          impl = new CollisionCompoundSystemImpl(this);
          break;
        default:
          Debug.error(`_createImplementation: Invalid collision system type: ${type}`);
      }
      this.implementations[type] = impl;
    }
    return this.implementations[type];
  }

  // Gets an existing implementation for the specified entity
  _getImplementation(entity) {
    return this.implementations[entity.collision.data.type];
  }
  cloneComponent(entity, clone) {
    return this._getImplementation(entity).clone(entity, clone);
  }
  onBeforeRemove(entity, component) {
    this.implementations[component.data.type].beforeRemove(entity, component);
    component.onBeforeRemove();
  }
  onRemove(entity, data) {
    this.implementations[data.type].remove(entity, data);
  }
  updateCompoundChildTransform(entity) {
    // TODO
    // use updateChildTransform once it is exposed in ammo.js

    this._removeCompoundChild(entity.collision._compoundParent, entity.collision.data.shape);
    if (entity.enabled && entity.collision.enabled) {
      const transform = this._getNodeTransform(entity, entity.collision._compoundParent.entity);
      entity.collision._compoundParent.shape.addChildShape(transform, entity.collision.data.shape);
      Ammo.destroy(transform);
    }
  }
  _removeCompoundChild(collision, shape) {
    if (collision.shape.removeChildShape) {
      collision.shape.removeChildShape(shape);
    } else {
      const ind = collision._getCompoundChildShapeIndex(shape);
      if (ind !== null) {
        collision.shape.removeChildShapeByIndex(ind);
      }
    }
  }
  onTransformChanged(component, position, rotation, scale) {
    this.implementations[component.data.type].updateTransform(component, position, rotation, scale);
  }

  // Destroys the previous collision type and creates a new one based on the new type provided
  changeType(component, previousType, newType) {
    this.implementations[previousType].beforeRemove(component.entity, component);
    this.implementations[previousType].remove(component.entity, component.data);
    this._createImplementation(newType).reset(component, component.data);
  }

  // Recreates rigid bodies or triggers for the specified component
  recreatePhysicalShapes(component) {
    this.implementations[component.data.type].recreatePhysicalShapes(component);
  }
  _calculateNodeRelativeTransform(node, relative) {
    if (node === relative) {
      const scale = node.getWorldTransform().getScale();
      mat4.setScale(scale.x, scale.y, scale.z);
    } else {
      this._calculateNodeRelativeTransform(node.parent, relative);
      mat4.mul(node.getLocalTransform());
    }
  }
  _getNodeScaling(node) {
    const wtm = node.getWorldTransform();
    const scl = wtm.getScale();
    return new Ammo.btVector3(scl.x, scl.y, scl.z);
  }
  _getNodeTransform(node, relative) {
    let pos, rot;
    if (relative) {
      this._calculateNodeRelativeTransform(node, relative);
      pos = p1;
      rot = quat;
      mat4.getTranslation(pos);
      rot.setFromMat4(mat4);
    } else {
      pos = node.getPosition();
      rot = node.getRotation();
    }
    const ammoQuat = new Ammo.btQuaternion();
    const transform = new Ammo.btTransform();
    transform.setIdentity();
    const origin = transform.getOrigin();
    const component = node.collision;
    if (component && component._hasOffset) {
      const lo = component.data.linearOffset;
      const ao = component.data.angularOffset;
      const newOrigin = p2;
      quat.copy(rot).transformVector(lo, newOrigin);
      newOrigin.add(pos);
      quat.copy(rot).mul(ao);
      origin.setValue(newOrigin.x, newOrigin.y, newOrigin.z);
      ammoQuat.setValue(quat.x, quat.y, quat.z, quat.w);
    } else {
      origin.setValue(pos.x, pos.y, pos.z);
      ammoQuat.setValue(rot.x, rot.y, rot.z, rot.w);
    }
    transform.setRotation(ammoQuat);
    Ammo.destroy(ammoQuat);
    Ammo.destroy(origin);
    return transform;
  }
  destroy() {
    for (const key in this._triMeshCache) {
      Ammo.destroy(this._triMeshCache[key]);
    }
    this._triMeshCache = null;
    super.destroy();
  }
}
Component._buildAccessors(CollisionComponent.prototype, _schema);

export { CollisionComponentSystem };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3lzdGVtLmpzIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi9zcmMvZnJhbWV3b3JrL2NvbXBvbmVudHMvY29sbGlzaW9uL3N5c3RlbS5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBEZWJ1ZyB9IGZyb20gJy4uLy4uLy4uL2NvcmUvZGVidWcuanMnO1xuXG5pbXBvcnQgeyBNYXQ0IH0gZnJvbSAnLi4vLi4vLi4vY29yZS9tYXRoL21hdDQuanMnO1xuaW1wb3J0IHsgUXVhdCB9IGZyb20gJy4uLy4uLy4uL2NvcmUvbWF0aC9xdWF0LmpzJztcbmltcG9ydCB7IFZlYzMgfSBmcm9tICcuLi8uLi8uLi9jb3JlL21hdGgvdmVjMy5qcyc7XG5cbmltcG9ydCB7IFNFTUFOVElDX1BPU0lUSU9OIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZ3JhcGhpY3MvY29uc3RhbnRzLmpzJztcblxuaW1wb3J0IHsgR3JhcGhOb2RlIH0gZnJvbSAnLi4vLi4vLi4vc2NlbmUvZ3JhcGgtbm9kZS5qcyc7XG5pbXBvcnQgeyBNb2RlbCB9IGZyb20gJy4uLy4uLy4uL3NjZW5lL21vZGVsLmpzJztcblxuaW1wb3J0IHsgQ29tcG9uZW50IH0gZnJvbSAnLi4vY29tcG9uZW50LmpzJztcbmltcG9ydCB7IENvbXBvbmVudFN5c3RlbSB9IGZyb20gJy4uL3N5c3RlbS5qcyc7XG5cbmltcG9ydCB7IENvbGxpc2lvbkNvbXBvbmVudCB9IGZyb20gJy4vY29tcG9uZW50LmpzJztcbmltcG9ydCB7IENvbGxpc2lvbkNvbXBvbmVudERhdGEgfSBmcm9tICcuL2RhdGEuanMnO1xuaW1wb3J0IHsgVHJpZ2dlciB9IGZyb20gJy4vdHJpZ2dlci5qcyc7XG5cbmNvbnN0IG1hdDQgPSBuZXcgTWF0NCgpO1xuY29uc3QgcDEgPSBuZXcgVmVjMygpO1xuY29uc3QgcDIgPSBuZXcgVmVjMygpO1xuY29uc3QgcXVhdCA9IG5ldyBRdWF0KCk7XG5jb25zdCB0ZW1wR3JhcGhOb2RlID0gbmV3IEdyYXBoTm9kZSgpO1xuXG5jb25zdCBfc2NoZW1hID0gW1xuICAgICdlbmFibGVkJyxcbiAgICAndHlwZScsXG4gICAgJ2hhbGZFeHRlbnRzJyxcbiAgICAnbGluZWFyT2Zmc2V0JyxcbiAgICAnYW5ndWxhck9mZnNldCcsXG4gICAgJ3JhZGl1cycsXG4gICAgJ2F4aXMnLFxuICAgICdoZWlnaHQnLFxuICAgICdhc3NldCcsXG4gICAgJ3JlbmRlckFzc2V0JyxcbiAgICAnc2hhcGUnLFxuICAgICdtb2RlbCcsXG4gICAgJ3JlbmRlcidcbl07XG5cbi8vIENvbGxpc2lvbiBzeXN0ZW0gaW1wbGVtZW50YXRpb25zXG5jbGFzcyBDb2xsaXNpb25TeXN0ZW1JbXBsIHtcbiAgICBjb25zdHJ1Y3RvcihzeXN0ZW0pIHtcbiAgICAgICAgdGhpcy5zeXN0ZW0gPSBzeXN0ZW07XG4gICAgfVxuXG4gICAgLy8gQ2FsbGVkIGJlZm9yZSB0aGUgY2FsbCB0byBzeXN0ZW0uc3VwZXIuaW5pdGlhbGl6ZUNvbXBvbmVudERhdGEgaXMgbWFkZVxuICAgIGJlZm9yZUluaXRpYWxpemUoY29tcG9uZW50LCBkYXRhKSB7XG4gICAgICAgIGRhdGEuc2hhcGUgPSBudWxsO1xuXG4gICAgICAgIGRhdGEubW9kZWwgPSBuZXcgTW9kZWwoKTtcbiAgICAgICAgZGF0YS5tb2RlbC5ncmFwaCA9IG5ldyBHcmFwaE5vZGUoKTtcbiAgICB9XG5cbiAgICAvLyBDYWxsZWQgYWZ0ZXIgdGhlIGNhbGwgdG8gc3lzdGVtLnN1cGVyLmluaXRpYWxpemVDb21wb25lbnREYXRhIGlzIG1hZGVcbiAgICBhZnRlckluaXRpYWxpemUoY29tcG9uZW50LCBkYXRhKSB7XG4gICAgICAgIHRoaXMucmVjcmVhdGVQaHlzaWNhbFNoYXBlcyhjb21wb25lbnQpO1xuICAgICAgICBjb21wb25lbnQuZGF0YS5pbml0aWFsaXplZCA9IHRydWU7XG4gICAgfVxuXG4gICAgLy8gQ2FsbGVkIHdoZW4gYSBjb2xsaXNpb24gY29tcG9uZW50IGNoYW5nZXMgdHlwZSBpbiBvcmRlciB0byByZWNyZWF0ZSBkZWJ1ZyBhbmQgcGh5c2ljYWwgc2hhcGVzXG4gICAgcmVzZXQoY29tcG9uZW50LCBkYXRhKSB7XG4gICAgICAgIHRoaXMuYmVmb3JlSW5pdGlhbGl6ZShjb21wb25lbnQsIGRhdGEpO1xuICAgICAgICB0aGlzLmFmdGVySW5pdGlhbGl6ZShjb21wb25lbnQsIGRhdGEpO1xuICAgIH1cblxuICAgIC8vIFJlLWNyZWF0ZXMgcmlnaWQgYm9kaWVzIC8gdHJpZ2dlcnNcbiAgICByZWNyZWF0ZVBoeXNpY2FsU2hhcGVzKGNvbXBvbmVudCkge1xuICAgICAgICBjb25zdCBlbnRpdHkgPSBjb21wb25lbnQuZW50aXR5O1xuICAgICAgICBjb25zdCBkYXRhID0gY29tcG9uZW50LmRhdGE7XG5cbiAgICAgICAgaWYgKHR5cGVvZiBBbW1vICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgaWYgKGVudGl0eS50cmlnZ2VyKSB7XG4gICAgICAgICAgICAgICAgZW50aXR5LnRyaWdnZXIuZGVzdHJveSgpO1xuICAgICAgICAgICAgICAgIGRlbGV0ZSBlbnRpdHkudHJpZ2dlcjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGRhdGEuc2hhcGUpIHtcbiAgICAgICAgICAgICAgICBpZiAoY29tcG9uZW50Ll9jb21wb3VuZFBhcmVudCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnN5c3RlbS5fcmVtb3ZlQ29tcG91bmRDaGlsZChjb21wb25lbnQuX2NvbXBvdW5kUGFyZW50LCBkYXRhLnNoYXBlKTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAoY29tcG9uZW50Ll9jb21wb3VuZFBhcmVudC5lbnRpdHkucmlnaWRib2R5KVxuICAgICAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50Ll9jb21wb3VuZFBhcmVudC5lbnRpdHkucmlnaWRib2R5LmFjdGl2YXRlKCk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgdGhpcy5kZXN0cm95U2hhcGUoZGF0YSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGRhdGEuc2hhcGUgPSB0aGlzLmNyZWF0ZVBoeXNpY2FsU2hhcGUoY29tcG9uZW50LmVudGl0eSwgZGF0YSk7XG5cbiAgICAgICAgICAgIGNvbnN0IGZpcnN0Q29tcG91bmRDaGlsZCA9ICFjb21wb25lbnQuX2NvbXBvdW5kUGFyZW50O1xuXG4gICAgICAgICAgICBpZiAoZGF0YS50eXBlID09PSAnY29tcG91bmQnICYmICghY29tcG9uZW50Ll9jb21wb3VuZFBhcmVudCB8fCBjb21wb25lbnQgPT09IGNvbXBvbmVudC5fY29tcG91bmRQYXJlbnQpKSB7XG4gICAgICAgICAgICAgICAgY29tcG9uZW50Ll9jb21wb3VuZFBhcmVudCA9IGNvbXBvbmVudDtcblxuICAgICAgICAgICAgICAgIGVudGl0eS5mb3JFYWNoKHRoaXMuX2FkZEVhY2hEZXNjZW5kYW50LCBjb21wb25lbnQpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChkYXRhLnR5cGUgIT09ICdjb21wb3VuZCcpIHtcbiAgICAgICAgICAgICAgICBpZiAoY29tcG9uZW50Ll9jb21wb3VuZFBhcmVudCAmJiBjb21wb25lbnQgPT09IGNvbXBvbmVudC5fY29tcG91bmRQYXJlbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgZW50aXR5LmZvckVhY2godGhpcy5zeXN0ZW0uaW1wbGVtZW50YXRpb25zLmNvbXBvdW5kLl91cGRhdGVFYWNoRGVzY2VuZGFudCwgY29tcG9uZW50KTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoIWNvbXBvbmVudC5yaWdpZGJvZHkpIHtcbiAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50Ll9jb21wb3VuZFBhcmVudCA9IG51bGw7XG4gICAgICAgICAgICAgICAgICAgIGxldCBwYXJlbnQgPSBlbnRpdHkucGFyZW50O1xuICAgICAgICAgICAgICAgICAgICB3aGlsZSAocGFyZW50KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocGFyZW50LmNvbGxpc2lvbiAmJiBwYXJlbnQuY29sbGlzaW9uLnR5cGUgPT09ICdjb21wb3VuZCcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb21wb25lbnQuX2NvbXBvdW5kUGFyZW50ID0gcGFyZW50LmNvbGxpc2lvbjtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIHBhcmVudCA9IHBhcmVudC5wYXJlbnQ7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChjb21wb25lbnQuX2NvbXBvdW5kUGFyZW50KSB7XG4gICAgICAgICAgICAgICAgaWYgKGNvbXBvbmVudCAhPT0gY29tcG9uZW50Ll9jb21wb3VuZFBhcmVudCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoZmlyc3RDb21wb3VuZENoaWxkICYmIGNvbXBvbmVudC5fY29tcG91bmRQYXJlbnQuc2hhcGUuZ2V0TnVtQ2hpbGRTaGFwZXMoKSA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zeXN0ZW0ucmVjcmVhdGVQaHlzaWNhbFNoYXBlcyhjb21wb25lbnQuX2NvbXBvdW5kUGFyZW50KTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc3lzdGVtLnVwZGF0ZUNvbXBvdW5kQ2hpbGRUcmFuc2Zvcm0oZW50aXR5KTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNvbXBvbmVudC5fY29tcG91bmRQYXJlbnQuZW50aXR5LnJpZ2lkYm9keSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb21wb25lbnQuX2NvbXBvdW5kUGFyZW50LmVudGl0eS5yaWdpZGJvZHkuYWN0aXZhdGUoKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGVudGl0eS5yaWdpZGJvZHkpIHtcbiAgICAgICAgICAgICAgICBlbnRpdHkucmlnaWRib2R5LmRpc2FibGVTaW11bGF0aW9uKCk7XG4gICAgICAgICAgICAgICAgZW50aXR5LnJpZ2lkYm9keS5jcmVhdGVCb2R5KCk7XG5cbiAgICAgICAgICAgICAgICBpZiAoZW50aXR5LmVuYWJsZWQgJiYgZW50aXR5LnJpZ2lkYm9keS5lbmFibGVkKSB7XG4gICAgICAgICAgICAgICAgICAgIGVudGl0eS5yaWdpZGJvZHkuZW5hYmxlU2ltdWxhdGlvbigpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSBpZiAoIWNvbXBvbmVudC5fY29tcG91bmRQYXJlbnQpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWVudGl0eS50cmlnZ2VyKSB7XG4gICAgICAgICAgICAgICAgICAgIGVudGl0eS50cmlnZ2VyID0gbmV3IFRyaWdnZXIodGhpcy5zeXN0ZW0uYXBwLCBjb21wb25lbnQsIGRhdGEpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGVudGl0eS50cmlnZ2VyLmluaXRpYWxpemUoZGF0YSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gQ3JlYXRlcyBhIHBoeXNpY2FsIHNoYXBlIGZvciB0aGUgY29sbGlzaW9uLiBUaGlzIGNvbnNpc3RzXG4gICAgLy8gb2YgdGhlIGFjdHVhbCBzaGFwZSB0aGF0IHdpbGwgYmUgdXNlZCBmb3IgdGhlIHJpZ2lkIGJvZGllcyAvIHRyaWdnZXJzIG9mXG4gICAgLy8gdGhlIGNvbGxpc2lvbi5cbiAgICBjcmVhdGVQaHlzaWNhbFNoYXBlKGVudGl0eSwgZGF0YSkge1xuICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cblxuICAgIHVwZGF0ZVRyYW5zZm9ybShjb21wb25lbnQsIHBvc2l0aW9uLCByb3RhdGlvbiwgc2NhbGUpIHtcbiAgICAgICAgaWYgKGNvbXBvbmVudC5lbnRpdHkudHJpZ2dlcikge1xuICAgICAgICAgICAgY29tcG9uZW50LmVudGl0eS50cmlnZ2VyLnVwZGF0ZVRyYW5zZm9ybSgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZGVzdHJveVNoYXBlKGRhdGEpIHtcbiAgICAgICAgaWYgKGRhdGEuc2hhcGUpIHtcbiAgICAgICAgICAgIEFtbW8uZGVzdHJveShkYXRhLnNoYXBlKTtcbiAgICAgICAgICAgIGRhdGEuc2hhcGUgPSBudWxsO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgYmVmb3JlUmVtb3ZlKGVudGl0eSwgY29tcG9uZW50KSB7XG4gICAgICAgIGlmIChjb21wb25lbnQuZGF0YS5zaGFwZSkge1xuICAgICAgICAgICAgaWYgKGNvbXBvbmVudC5fY29tcG91bmRQYXJlbnQgJiYgIWNvbXBvbmVudC5fY29tcG91bmRQYXJlbnQuZW50aXR5Ll9kZXN0cm95aW5nKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zeXN0ZW0uX3JlbW92ZUNvbXBvdW5kQ2hpbGQoY29tcG9uZW50Ll9jb21wb3VuZFBhcmVudCwgY29tcG9uZW50LmRhdGEuc2hhcGUpO1xuXG4gICAgICAgICAgICAgICAgaWYgKGNvbXBvbmVudC5fY29tcG91bmRQYXJlbnQuZW50aXR5LnJpZ2lkYm9keSlcbiAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50Ll9jb21wb3VuZFBhcmVudC5lbnRpdHkucmlnaWRib2R5LmFjdGl2YXRlKCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbXBvbmVudC5fY29tcG91bmRQYXJlbnQgPSBudWxsO1xuXG4gICAgICAgICAgICB0aGlzLmRlc3Ryb3lTaGFwZShjb21wb25lbnQuZGF0YSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBDYWxsZWQgd2hlbiB0aGUgY29sbGlzaW9uIGlzIHJlbW92ZWRcbiAgICByZW1vdmUoZW50aXR5LCBkYXRhKSB7XG4gICAgICAgIGlmIChlbnRpdHkucmlnaWRib2R5ICYmIGVudGl0eS5yaWdpZGJvZHkuYm9keSkge1xuICAgICAgICAgICAgZW50aXR5LnJpZ2lkYm9keS5kaXNhYmxlU2ltdWxhdGlvbigpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGVudGl0eS50cmlnZ2VyKSB7XG4gICAgICAgICAgICBlbnRpdHkudHJpZ2dlci5kZXN0cm95KCk7XG4gICAgICAgICAgICBkZWxldGUgZW50aXR5LnRyaWdnZXI7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBDYWxsZWQgd2hlbiB0aGUgY29sbGlzaW9uIGlzIGNsb25lZCB0byBhbm90aGVyIGVudGl0eVxuICAgIGNsb25lKGVudGl0eSwgY2xvbmUpIHtcbiAgICAgICAgY29uc3Qgc3JjID0gdGhpcy5zeXN0ZW0uc3RvcmVbZW50aXR5LmdldEd1aWQoKV07XG5cbiAgICAgICAgY29uc3QgZGF0YSA9IHtcbiAgICAgICAgICAgIGVuYWJsZWQ6IHNyYy5kYXRhLmVuYWJsZWQsXG4gICAgICAgICAgICB0eXBlOiBzcmMuZGF0YS50eXBlLFxuICAgICAgICAgICAgaGFsZkV4dGVudHM6IFtzcmMuZGF0YS5oYWxmRXh0ZW50cy54LCBzcmMuZGF0YS5oYWxmRXh0ZW50cy55LCBzcmMuZGF0YS5oYWxmRXh0ZW50cy56XSxcbiAgICAgICAgICAgIGxpbmVhck9mZnNldDogW3NyYy5kYXRhLmxpbmVhck9mZnNldC54LCBzcmMuZGF0YS5saW5lYXJPZmZzZXQueSwgc3JjLmRhdGEubGluZWFyT2Zmc2V0LnpdLFxuICAgICAgICAgICAgYW5ndWxhck9mZnNldDogW3NyYy5kYXRhLmFuZ3VsYXJPZmZzZXQueCwgc3JjLmRhdGEuYW5ndWxhck9mZnNldC55LCBzcmMuZGF0YS5hbmd1bGFyT2Zmc2V0LnosIHNyYy5kYXRhLmFuZ3VsYXJPZmZzZXQud10sXG4gICAgICAgICAgICByYWRpdXM6IHNyYy5kYXRhLnJhZGl1cyxcbiAgICAgICAgICAgIGF4aXM6IHNyYy5kYXRhLmF4aXMsXG4gICAgICAgICAgICBoZWlnaHQ6IHNyYy5kYXRhLmhlaWdodCxcbiAgICAgICAgICAgIGFzc2V0OiBzcmMuZGF0YS5hc3NldCxcbiAgICAgICAgICAgIHJlbmRlckFzc2V0OiBzcmMuZGF0YS5yZW5kZXJBc3NldCxcbiAgICAgICAgICAgIG1vZGVsOiBzcmMuZGF0YS5tb2RlbCxcbiAgICAgICAgICAgIHJlbmRlcjogc3JjLmRhdGEucmVuZGVyXG4gICAgICAgIH07XG5cbiAgICAgICAgcmV0dXJuIHRoaXMuc3lzdGVtLmFkZENvbXBvbmVudChjbG9uZSwgZGF0YSk7XG4gICAgfVxufVxuXG4vLyBCb3ggQ29sbGlzaW9uIFN5c3RlbVxuY2xhc3MgQ29sbGlzaW9uQm94U3lzdGVtSW1wbCBleHRlbmRzIENvbGxpc2lvblN5c3RlbUltcGwge1xuICAgIGNyZWF0ZVBoeXNpY2FsU2hhcGUoZW50aXR5LCBkYXRhKSB7XG4gICAgICAgIGlmICh0eXBlb2YgQW1tbyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgIGNvbnN0IGhlID0gZGF0YS5oYWxmRXh0ZW50cztcbiAgICAgICAgICAgIGNvbnN0IGFtbW9IZSA9IG5ldyBBbW1vLmJ0VmVjdG9yMyhoZSA/IGhlLnggOiAwLjUsIGhlID8gaGUueSA6IDAuNSwgaGUgPyBoZS56IDogMC41KTtcbiAgICAgICAgICAgIGNvbnN0IHNoYXBlID0gbmV3IEFtbW8uYnRCb3hTaGFwZShhbW1vSGUpO1xuICAgICAgICAgICAgQW1tby5kZXN0cm95KGFtbW9IZSk7XG4gICAgICAgICAgICByZXR1cm4gc2hhcGU7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG59XG5cbi8vIFNwaGVyZSBDb2xsaXNpb24gU3lzdGVtXG5jbGFzcyBDb2xsaXNpb25TcGhlcmVTeXN0ZW1JbXBsIGV4dGVuZHMgQ29sbGlzaW9uU3lzdGVtSW1wbCB7XG4gICAgY3JlYXRlUGh5c2ljYWxTaGFwZShlbnRpdHksIGRhdGEpIHtcbiAgICAgICAgaWYgKHR5cGVvZiBBbW1vICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBBbW1vLmJ0U3BoZXJlU2hhcGUoZGF0YS5yYWRpdXMpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxufVxuXG4vLyBDYXBzdWxlIENvbGxpc2lvbiBTeXN0ZW1cbmNsYXNzIENvbGxpc2lvbkNhcHN1bGVTeXN0ZW1JbXBsIGV4dGVuZHMgQ29sbGlzaW9uU3lzdGVtSW1wbCB7XG4gICAgY3JlYXRlUGh5c2ljYWxTaGFwZShlbnRpdHksIGRhdGEpIHtcbiAgICAgICAgY29uc3QgYXhpcyA9IGRhdGEuYXhpcyA/PyAxO1xuICAgICAgICBjb25zdCByYWRpdXMgPSBkYXRhLnJhZGl1cyA/PyAwLjU7XG4gICAgICAgIGNvbnN0IGhlaWdodCA9IE1hdGgubWF4KChkYXRhLmhlaWdodCA/PyAyKSAtIDIgKiByYWRpdXMsIDApO1xuXG4gICAgICAgIGxldCBzaGFwZSA9IG51bGw7XG5cbiAgICAgICAgaWYgKHR5cGVvZiBBbW1vICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgc3dpdGNoIChheGlzKSB7XG4gICAgICAgICAgICAgICAgY2FzZSAwOlxuICAgICAgICAgICAgICAgICAgICBzaGFwZSA9IG5ldyBBbW1vLmJ0Q2Fwc3VsZVNoYXBlWChyYWRpdXMsIGhlaWdodCk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgMTpcbiAgICAgICAgICAgICAgICAgICAgc2hhcGUgPSBuZXcgQW1tby5idENhcHN1bGVTaGFwZShyYWRpdXMsIGhlaWdodCk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgMjpcbiAgICAgICAgICAgICAgICAgICAgc2hhcGUgPSBuZXcgQW1tby5idENhcHN1bGVTaGFwZVoocmFkaXVzLCBoZWlnaHQpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBzaGFwZTtcbiAgICB9XG59XG5cbi8vIEN5bGluZGVyIENvbGxpc2lvbiBTeXN0ZW1cbmNsYXNzIENvbGxpc2lvbkN5bGluZGVyU3lzdGVtSW1wbCBleHRlbmRzIENvbGxpc2lvblN5c3RlbUltcGwge1xuICAgIGNyZWF0ZVBoeXNpY2FsU2hhcGUoZW50aXR5LCBkYXRhKSB7XG4gICAgICAgIGNvbnN0IGF4aXMgPSBkYXRhLmF4aXMgPz8gMTtcbiAgICAgICAgY29uc3QgcmFkaXVzID0gZGF0YS5yYWRpdXMgPz8gMC41O1xuICAgICAgICBjb25zdCBoZWlnaHQgPSBkYXRhLmhlaWdodCA/PyAxO1xuXG4gICAgICAgIGxldCBoYWxmRXh0ZW50cyA9IG51bGw7XG4gICAgICAgIGxldCBzaGFwZSA9IG51bGw7XG5cbiAgICAgICAgaWYgKHR5cGVvZiBBbW1vICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgc3dpdGNoIChheGlzKSB7XG4gICAgICAgICAgICAgICAgY2FzZSAwOlxuICAgICAgICAgICAgICAgICAgICBoYWxmRXh0ZW50cyA9IG5ldyBBbW1vLmJ0VmVjdG9yMyhoZWlnaHQgKiAwLjUsIHJhZGl1cywgcmFkaXVzKTtcbiAgICAgICAgICAgICAgICAgICAgc2hhcGUgPSBuZXcgQW1tby5idEN5bGluZGVyU2hhcGVYKGhhbGZFeHRlbnRzKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAxOlxuICAgICAgICAgICAgICAgICAgICBoYWxmRXh0ZW50cyA9IG5ldyBBbW1vLmJ0VmVjdG9yMyhyYWRpdXMsIGhlaWdodCAqIDAuNSwgcmFkaXVzKTtcbiAgICAgICAgICAgICAgICAgICAgc2hhcGUgPSBuZXcgQW1tby5idEN5bGluZGVyU2hhcGUoaGFsZkV4dGVudHMpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlIDI6XG4gICAgICAgICAgICAgICAgICAgIGhhbGZFeHRlbnRzID0gbmV3IEFtbW8uYnRWZWN0b3IzKHJhZGl1cywgcmFkaXVzLCBoZWlnaHQgKiAwLjUpO1xuICAgICAgICAgICAgICAgICAgICBzaGFwZSA9IG5ldyBBbW1vLmJ0Q3lsaW5kZXJTaGFwZVooaGFsZkV4dGVudHMpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChoYWxmRXh0ZW50cylcbiAgICAgICAgICAgIEFtbW8uZGVzdHJveShoYWxmRXh0ZW50cyk7XG5cbiAgICAgICAgcmV0dXJuIHNoYXBlO1xuICAgIH1cbn1cblxuLy8gQ29uZSBDb2xsaXNpb24gU3lzdGVtXG5jbGFzcyBDb2xsaXNpb25Db25lU3lzdGVtSW1wbCBleHRlbmRzIENvbGxpc2lvblN5c3RlbUltcGwge1xuICAgIGNyZWF0ZVBoeXNpY2FsU2hhcGUoZW50aXR5LCBkYXRhKSB7XG4gICAgICAgIGNvbnN0IGF4aXMgPSBkYXRhLmF4aXMgPz8gMTtcbiAgICAgICAgY29uc3QgcmFkaXVzID0gZGF0YS5yYWRpdXMgPz8gMC41O1xuICAgICAgICBjb25zdCBoZWlnaHQgPSBkYXRhLmhlaWdodCA/PyAxO1xuXG4gICAgICAgIGxldCBzaGFwZSA9IG51bGw7XG5cbiAgICAgICAgaWYgKHR5cGVvZiBBbW1vICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgc3dpdGNoIChheGlzKSB7XG4gICAgICAgICAgICAgICAgY2FzZSAwOlxuICAgICAgICAgICAgICAgICAgICBzaGFwZSA9IG5ldyBBbW1vLmJ0Q29uZVNoYXBlWChyYWRpdXMsIGhlaWdodCk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgMTpcbiAgICAgICAgICAgICAgICAgICAgc2hhcGUgPSBuZXcgQW1tby5idENvbmVTaGFwZShyYWRpdXMsIGhlaWdodCk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgMjpcbiAgICAgICAgICAgICAgICAgICAgc2hhcGUgPSBuZXcgQW1tby5idENvbmVTaGFwZVoocmFkaXVzLCBoZWlnaHQpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBzaGFwZTtcbiAgICB9XG59XG5cbi8vIE1lc2ggQ29sbGlzaW9uIFN5c3RlbVxuY2xhc3MgQ29sbGlzaW9uTWVzaFN5c3RlbUltcGwgZXh0ZW5kcyBDb2xsaXNpb25TeXN0ZW1JbXBsIHtcbiAgICAvLyBvdmVycmlkZSBmb3IgdGhlIG1lc2ggaW1wbGVtZW50YXRpb24gYmVjYXVzZSB0aGUgYXNzZXQgbW9kZWwgbmVlZHNcbiAgICAvLyBzcGVjaWFsIGhhbmRsaW5nXG4gICAgYmVmb3JlSW5pdGlhbGl6ZShjb21wb25lbnQsIGRhdGEpIHt9XG5cbiAgICBjcmVhdGVBbW1vTWVzaChtZXNoLCBub2RlLCBzaGFwZSkge1xuICAgICAgICBsZXQgdHJpTWVzaDtcblxuICAgICAgICBpZiAodGhpcy5zeXN0ZW0uX3RyaU1lc2hDYWNoZVttZXNoLmlkXSkge1xuICAgICAgICAgICAgdHJpTWVzaCA9IHRoaXMuc3lzdGVtLl90cmlNZXNoQ2FjaGVbbWVzaC5pZF07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zdCB2YiA9IG1lc2gudmVydGV4QnVmZmVyO1xuXG4gICAgICAgICAgICBjb25zdCBmb3JtYXQgPSB2Yi5nZXRGb3JtYXQoKTtcbiAgICAgICAgICAgIGxldCBzdHJpZGU7XG4gICAgICAgICAgICBsZXQgcG9zaXRpb25zO1xuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBmb3JtYXQuZWxlbWVudHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICBjb25zdCBlbGVtZW50ID0gZm9ybWF0LmVsZW1lbnRzW2ldO1xuICAgICAgICAgICAgICAgIGlmIChlbGVtZW50Lm5hbWUgPT09IFNFTUFOVElDX1BPU0lUSU9OKSB7XG4gICAgICAgICAgICAgICAgICAgIHBvc2l0aW9ucyA9IG5ldyBGbG9hdDMyQXJyYXkodmIubG9jaygpLCBlbGVtZW50Lm9mZnNldCk7XG4gICAgICAgICAgICAgICAgICAgIHN0cmlkZSA9IGVsZW1lbnQuc3RyaWRlIC8gNDtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBpbmRpY2VzID0gW107XG4gICAgICAgICAgICBtZXNoLmdldEluZGljZXMoaW5kaWNlcyk7XG4gICAgICAgICAgICBjb25zdCBudW1UcmlhbmdsZXMgPSBtZXNoLnByaW1pdGl2ZVswXS5jb3VudCAvIDM7XG5cbiAgICAgICAgICAgIGNvbnN0IHYxID0gbmV3IEFtbW8uYnRWZWN0b3IzKCk7XG4gICAgICAgICAgICBjb25zdCB2MiA9IG5ldyBBbW1vLmJ0VmVjdG9yMygpO1xuICAgICAgICAgICAgY29uc3QgdjMgPSBuZXcgQW1tby5idFZlY3RvcjMoKTtcbiAgICAgICAgICAgIGxldCBpMSwgaTIsIGkzO1xuXG4gICAgICAgICAgICBjb25zdCBiYXNlID0gbWVzaC5wcmltaXRpdmVbMF0uYmFzZTtcbiAgICAgICAgICAgIHRyaU1lc2ggPSBuZXcgQW1tby5idFRyaWFuZ2xlTWVzaCgpO1xuICAgICAgICAgICAgdGhpcy5zeXN0ZW0uX3RyaU1lc2hDYWNoZVttZXNoLmlkXSA9IHRyaU1lc2g7XG5cbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbnVtVHJpYW5nbGVzOyBpKyspIHtcbiAgICAgICAgICAgICAgICBpMSA9IGluZGljZXNbYmFzZSArIGkgKiAzXSAqIHN0cmlkZTtcbiAgICAgICAgICAgICAgICBpMiA9IGluZGljZXNbYmFzZSArIGkgKiAzICsgMV0gKiBzdHJpZGU7XG4gICAgICAgICAgICAgICAgaTMgPSBpbmRpY2VzW2Jhc2UgKyBpICogMyArIDJdICogc3RyaWRlO1xuICAgICAgICAgICAgICAgIHYxLnNldFZhbHVlKHBvc2l0aW9uc1tpMV0sIHBvc2l0aW9uc1tpMSArIDFdLCBwb3NpdGlvbnNbaTEgKyAyXSk7XG4gICAgICAgICAgICAgICAgdjIuc2V0VmFsdWUocG9zaXRpb25zW2kyXSwgcG9zaXRpb25zW2kyICsgMV0sIHBvc2l0aW9uc1tpMiArIDJdKTtcbiAgICAgICAgICAgICAgICB2My5zZXRWYWx1ZShwb3NpdGlvbnNbaTNdLCBwb3NpdGlvbnNbaTMgKyAxXSwgcG9zaXRpb25zW2kzICsgMl0pO1xuICAgICAgICAgICAgICAgIHRyaU1lc2guYWRkVHJpYW5nbGUodjEsIHYyLCB2MywgdHJ1ZSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIEFtbW8uZGVzdHJveSh2MSk7XG4gICAgICAgICAgICBBbW1vLmRlc3Ryb3kodjIpO1xuICAgICAgICAgICAgQW1tby5kZXN0cm95KHYzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHVzZVF1YW50aXplZEFhYmJDb21wcmVzc2lvbiA9IHRydWU7XG4gICAgICAgIGNvbnN0IHRyaU1lc2hTaGFwZSA9IG5ldyBBbW1vLmJ0QnZoVHJpYW5nbGVNZXNoU2hhcGUodHJpTWVzaCwgdXNlUXVhbnRpemVkQWFiYkNvbXByZXNzaW9uKTtcblxuICAgICAgICBjb25zdCBzY2FsaW5nID0gdGhpcy5zeXN0ZW0uX2dldE5vZGVTY2FsaW5nKG5vZGUpO1xuICAgICAgICB0cmlNZXNoU2hhcGUuc2V0TG9jYWxTY2FsaW5nKHNjYWxpbmcpO1xuICAgICAgICBBbW1vLmRlc3Ryb3koc2NhbGluZyk7XG5cbiAgICAgICAgY29uc3QgdHJhbnNmb3JtID0gdGhpcy5zeXN0ZW0uX2dldE5vZGVUcmFuc2Zvcm0obm9kZSk7XG4gICAgICAgIHNoYXBlLmFkZENoaWxkU2hhcGUodHJhbnNmb3JtLCB0cmlNZXNoU2hhcGUpO1xuICAgICAgICBBbW1vLmRlc3Ryb3kodHJhbnNmb3JtKTtcbiAgICB9XG5cbiAgICBjcmVhdGVQaHlzaWNhbFNoYXBlKGVudGl0eSwgZGF0YSkge1xuICAgICAgICBpZiAodHlwZW9mIEFtbW8gPT09ICd1bmRlZmluZWQnKSByZXR1cm4gdW5kZWZpbmVkO1xuXG4gICAgICAgIGlmIChkYXRhLm1vZGVsIHx8IGRhdGEucmVuZGVyKSB7XG5cbiAgICAgICAgICAgIGNvbnN0IHNoYXBlID0gbmV3IEFtbW8uYnRDb21wb3VuZFNoYXBlKCk7XG5cbiAgICAgICAgICAgIGlmIChkYXRhLm1vZGVsKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgbWVzaEluc3RhbmNlcyA9IGRhdGEubW9kZWwubWVzaEluc3RhbmNlcztcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG1lc2hJbnN0YW5jZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jcmVhdGVBbW1vTWVzaChtZXNoSW5zdGFuY2VzW2ldLm1lc2gsIG1lc2hJbnN0YW5jZXNbaV0ubm9kZSwgc2hhcGUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZGF0YS5yZW5kZXIpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBtZXNoZXMgPSBkYXRhLnJlbmRlci5tZXNoZXM7XG4gICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBtZXNoZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jcmVhdGVBbW1vTWVzaChtZXNoZXNbaV0sIHRlbXBHcmFwaE5vZGUsIHNoYXBlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IGVudGl0eVRyYW5zZm9ybSA9IGVudGl0eS5nZXRXb3JsZFRyYW5zZm9ybSgpO1xuICAgICAgICAgICAgY29uc3Qgc2NhbGUgPSBlbnRpdHlUcmFuc2Zvcm0uZ2V0U2NhbGUoKTtcbiAgICAgICAgICAgIGNvbnN0IHZlYyA9IG5ldyBBbW1vLmJ0VmVjdG9yMyhzY2FsZS54LCBzY2FsZS55LCBzY2FsZS56KTtcbiAgICAgICAgICAgIHNoYXBlLnNldExvY2FsU2NhbGluZyh2ZWMpO1xuICAgICAgICAgICAgQW1tby5kZXN0cm95KHZlYyk7XG5cbiAgICAgICAgICAgIHJldHVybiBzaGFwZTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuXG4gICAgcmVjcmVhdGVQaHlzaWNhbFNoYXBlcyhjb21wb25lbnQpIHtcbiAgICAgICAgY29uc3QgZGF0YSA9IGNvbXBvbmVudC5kYXRhO1xuXG4gICAgICAgIGlmIChkYXRhLnJlbmRlckFzc2V0IHx8IGRhdGEuYXNzZXQpIHtcbiAgICAgICAgICAgIGlmIChjb21wb25lbnQuZW5hYmxlZCAmJiBjb21wb25lbnQuZW50aXR5LmVuYWJsZWQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmxvYWRBc3NldChcbiAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50LFxuICAgICAgICAgICAgICAgICAgICBkYXRhLnJlbmRlckFzc2V0IHx8IGRhdGEuYXNzZXQsXG4gICAgICAgICAgICAgICAgICAgIGRhdGEucmVuZGVyQXNzZXQgPyAncmVuZGVyJyA6ICdtb2RlbCdcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuZG9SZWNyZWF0ZVBoeXNpY2FsU2hhcGUoY29tcG9uZW50KTtcbiAgICB9XG5cbiAgICBsb2FkQXNzZXQoY29tcG9uZW50LCBpZCwgcHJvcGVydHkpIHtcbiAgICAgICAgY29uc3QgZGF0YSA9IGNvbXBvbmVudC5kYXRhO1xuICAgICAgICBjb25zdCBhc3NldHMgPSB0aGlzLnN5c3RlbS5hcHAuYXNzZXRzO1xuXG4gICAgICAgIGNvbnN0IGFzc2V0ID0gYXNzZXRzLmdldChpZCk7XG4gICAgICAgIGlmIChhc3NldCkge1xuICAgICAgICAgICAgYXNzZXQucmVhZHkoKGFzc2V0KSA9PiB7XG4gICAgICAgICAgICAgICAgZGF0YVtwcm9wZXJ0eV0gPSBhc3NldC5yZXNvdXJjZTtcbiAgICAgICAgICAgICAgICB0aGlzLmRvUmVjcmVhdGVQaHlzaWNhbFNoYXBlKGNvbXBvbmVudCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGFzc2V0cy5sb2FkKGFzc2V0KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGFzc2V0cy5vbmNlKCdhZGQ6JyArIGlkLCAoYXNzZXQpID0+IHtcbiAgICAgICAgICAgICAgICBhc3NldC5yZWFkeSgoYXNzZXQpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgZGF0YVtwcm9wZXJ0eV0gPSBhc3NldC5yZXNvdXJjZTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5kb1JlY3JlYXRlUGh5c2ljYWxTaGFwZShjb21wb25lbnQpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIGFzc2V0cy5sb2FkKGFzc2V0KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZG9SZWNyZWF0ZVBoeXNpY2FsU2hhcGUoY29tcG9uZW50KSB7XG4gICAgICAgIGNvbnN0IGVudGl0eSA9IGNvbXBvbmVudC5lbnRpdHk7XG4gICAgICAgIGNvbnN0IGRhdGEgPSBjb21wb25lbnQuZGF0YTtcblxuICAgICAgICBpZiAoZGF0YS5tb2RlbCB8fCBkYXRhLnJlbmRlcikge1xuICAgICAgICAgICAgdGhpcy5kZXN0cm95U2hhcGUoZGF0YSk7XG5cbiAgICAgICAgICAgIGRhdGEuc2hhcGUgPSB0aGlzLmNyZWF0ZVBoeXNpY2FsU2hhcGUoZW50aXR5LCBkYXRhKTtcblxuICAgICAgICAgICAgaWYgKGVudGl0eS5yaWdpZGJvZHkpIHtcbiAgICAgICAgICAgICAgICBlbnRpdHkucmlnaWRib2R5LmRpc2FibGVTaW11bGF0aW9uKCk7XG4gICAgICAgICAgICAgICAgZW50aXR5LnJpZ2lkYm9keS5jcmVhdGVCb2R5KCk7XG5cbiAgICAgICAgICAgICAgICBpZiAoZW50aXR5LmVuYWJsZWQgJiYgZW50aXR5LnJpZ2lkYm9keS5lbmFibGVkKSB7XG4gICAgICAgICAgICAgICAgICAgIGVudGl0eS5yaWdpZGJvZHkuZW5hYmxlU2ltdWxhdGlvbigpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgaWYgKCFlbnRpdHkudHJpZ2dlcikge1xuICAgICAgICAgICAgICAgICAgICBlbnRpdHkudHJpZ2dlciA9IG5ldyBUcmlnZ2VyKHRoaXMuc3lzdGVtLmFwcCwgY29tcG9uZW50LCBkYXRhKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBlbnRpdHkudHJpZ2dlci5pbml0aWFsaXplKGRhdGEpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuYmVmb3JlUmVtb3ZlKGVudGl0eSwgY29tcG9uZW50KTtcbiAgICAgICAgICAgIHRoaXMucmVtb3ZlKGVudGl0eSwgZGF0YSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICB1cGRhdGVUcmFuc2Zvcm0oY29tcG9uZW50LCBwb3NpdGlvbiwgcm90YXRpb24sIHNjYWxlKSB7XG4gICAgICAgIGlmIChjb21wb25lbnQuc2hhcGUpIHtcbiAgICAgICAgICAgIGNvbnN0IGVudGl0eVRyYW5zZm9ybSA9IGNvbXBvbmVudC5lbnRpdHkuZ2V0V29ybGRUcmFuc2Zvcm0oKTtcbiAgICAgICAgICAgIGNvbnN0IHdvcmxkU2NhbGUgPSBlbnRpdHlUcmFuc2Zvcm0uZ2V0U2NhbGUoKTtcblxuICAgICAgICAgICAgLy8gaWYgdGhlIHNjYWxlIGNoYW5nZWQgdGhlbiByZWNyZWF0ZSB0aGUgc2hhcGVcbiAgICAgICAgICAgIGNvbnN0IHByZXZpb3VzU2NhbGUgPSBjb21wb25lbnQuc2hhcGUuZ2V0TG9jYWxTY2FsaW5nKCk7XG4gICAgICAgICAgICBpZiAod29ybGRTY2FsZS54ICE9PSBwcmV2aW91c1NjYWxlLngoKSB8fFxuICAgICAgICAgICAgICAgIHdvcmxkU2NhbGUueSAhPT0gcHJldmlvdXNTY2FsZS55KCkgfHxcbiAgICAgICAgICAgICAgICB3b3JsZFNjYWxlLnogIT09IHByZXZpb3VzU2NhbGUueigpKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5kb1JlY3JlYXRlUGh5c2ljYWxTaGFwZShjb21wb25lbnQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgc3VwZXIudXBkYXRlVHJhbnNmb3JtKGNvbXBvbmVudCwgcG9zaXRpb24sIHJvdGF0aW9uLCBzY2FsZSk7XG4gICAgfVxuXG4gICAgZGVzdHJveVNoYXBlKGRhdGEpIHtcbiAgICAgICAgaWYgKCFkYXRhLnNoYXBlKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIGNvbnN0IG51bVNoYXBlcyA9IGRhdGEuc2hhcGUuZ2V0TnVtQ2hpbGRTaGFwZXMoKTtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBudW1TaGFwZXM7IGkrKykge1xuICAgICAgICAgICAgY29uc3Qgc2hhcGUgPSBkYXRhLnNoYXBlLmdldENoaWxkU2hhcGUoaSk7XG4gICAgICAgICAgICBBbW1vLmRlc3Ryb3koc2hhcGUpO1xuICAgICAgICB9XG5cbiAgICAgICAgQW1tby5kZXN0cm95KGRhdGEuc2hhcGUpO1xuICAgICAgICBkYXRhLnNoYXBlID0gbnVsbDtcbiAgICB9XG59XG5cbi8vIENvbXBvdW5kIENvbGxpc2lvbiBTeXN0ZW1cbmNsYXNzIENvbGxpc2lvbkNvbXBvdW5kU3lzdGVtSW1wbCBleHRlbmRzIENvbGxpc2lvblN5c3RlbUltcGwge1xuICAgIGNyZWF0ZVBoeXNpY2FsU2hhcGUoZW50aXR5LCBkYXRhKSB7XG4gICAgICAgIGlmICh0eXBlb2YgQW1tbyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgIHJldHVybiBuZXcgQW1tby5idENvbXBvdW5kU2hhcGUoKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cblxuICAgIF9hZGRFYWNoRGVzY2VuZGFudChlbnRpdHkpIHtcbiAgICAgICAgaWYgKCFlbnRpdHkuY29sbGlzaW9uIHx8IGVudGl0eS5yaWdpZGJvZHkpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgZW50aXR5LmNvbGxpc2lvbi5fY29tcG91bmRQYXJlbnQgPSB0aGlzO1xuXG4gICAgICAgIGlmIChlbnRpdHkgIT09IHRoaXMuZW50aXR5KSB7XG4gICAgICAgICAgICBlbnRpdHkuY29sbGlzaW9uLnN5c3RlbS5yZWNyZWF0ZVBoeXNpY2FsU2hhcGVzKGVudGl0eS5jb2xsaXNpb24pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgX3VwZGF0ZUVhY2hEZXNjZW5kYW50KGVudGl0eSkge1xuICAgICAgICBpZiAoIWVudGl0eS5jb2xsaXNpb24pXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgaWYgKGVudGl0eS5jb2xsaXNpb24uX2NvbXBvdW5kUGFyZW50ICE9PSB0aGlzKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIGVudGl0eS5jb2xsaXNpb24uX2NvbXBvdW5kUGFyZW50ID0gbnVsbDtcblxuICAgICAgICBpZiAoZW50aXR5ICE9PSB0aGlzLmVudGl0eSAmJiAhZW50aXR5LnJpZ2lkYm9keSkge1xuICAgICAgICAgICAgZW50aXR5LmNvbGxpc2lvbi5zeXN0ZW0ucmVjcmVhdGVQaHlzaWNhbFNoYXBlcyhlbnRpdHkuY29sbGlzaW9uKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIF91cGRhdGVFYWNoRGVzY2VuZGFudFRyYW5zZm9ybShlbnRpdHkpIHtcbiAgICAgICAgaWYgKCFlbnRpdHkuY29sbGlzaW9uIHx8IGVudGl0eS5jb2xsaXNpb24uX2NvbXBvdW5kUGFyZW50ICE9PSB0aGlzLmNvbGxpc2lvbi5fY29tcG91bmRQYXJlbnQpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgdGhpcy5jb2xsaXNpb24uc3lzdGVtLnVwZGF0ZUNvbXBvdW5kQ2hpbGRUcmFuc2Zvcm0oZW50aXR5KTtcbiAgICB9XG59XG5cbi8qKlxuICogTWFuYWdlcyBjcmVhdGlvbiBvZiB7QGxpbmsgQ29sbGlzaW9uQ29tcG9uZW50fXMuXG4gKlxuICogQGF1Z21lbnRzIENvbXBvbmVudFN5c3RlbVxuICogQGNhdGVnb3J5IFBoeXNpY3NcbiAqL1xuY2xhc3MgQ29sbGlzaW9uQ29tcG9uZW50U3lzdGVtIGV4dGVuZHMgQ29tcG9uZW50U3lzdGVtIHtcbiAgICAvKipcbiAgICAgKiBDcmVhdGVzIGEgbmV3IENvbGxpc2lvbkNvbXBvbmVudFN5c3RlbSBpbnN0YW5jZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuLi8uLi9hcHAtYmFzZS5qcycpLkFwcEJhc2V9IGFwcCAtIFRoZSBydW5uaW5nIHtAbGluayBBcHBCYXNlfS5cbiAgICAgKiBAaGlkZWNvbnN0cnVjdG9yXG4gICAgICovXG4gICAgY29uc3RydWN0b3IoYXBwKSB7XG4gICAgICAgIHN1cGVyKGFwcCk7XG5cbiAgICAgICAgdGhpcy5pZCA9ICdjb2xsaXNpb24nO1xuXG4gICAgICAgIHRoaXMuQ29tcG9uZW50VHlwZSA9IENvbGxpc2lvbkNvbXBvbmVudDtcbiAgICAgICAgdGhpcy5EYXRhVHlwZSA9IENvbGxpc2lvbkNvbXBvbmVudERhdGE7XG5cbiAgICAgICAgdGhpcy5zY2hlbWEgPSBfc2NoZW1hO1xuXG4gICAgICAgIHRoaXMuaW1wbGVtZW50YXRpb25zID0geyB9O1xuXG4gICAgICAgIHRoaXMuX3RyaU1lc2hDYWNoZSA9IHsgfTtcblxuICAgICAgICB0aGlzLm9uKCdiZWZvcmVyZW1vdmUnLCB0aGlzLm9uQmVmb3JlUmVtb3ZlLCB0aGlzKTtcbiAgICAgICAgdGhpcy5vbigncmVtb3ZlJywgdGhpcy5vblJlbW92ZSwgdGhpcyk7XG4gICAgfVxuXG4gICAgaW5pdGlhbGl6ZUNvbXBvbmVudERhdGEoY29tcG9uZW50LCBfZGF0YSwgcHJvcGVydGllcykge1xuICAgICAgICBwcm9wZXJ0aWVzID0gW1xuICAgICAgICAgICAgJ3R5cGUnLFxuICAgICAgICAgICAgJ2hhbGZFeHRlbnRzJyxcbiAgICAgICAgICAgICdyYWRpdXMnLFxuICAgICAgICAgICAgJ2F4aXMnLFxuICAgICAgICAgICAgJ2hlaWdodCcsXG4gICAgICAgICAgICAnc2hhcGUnLFxuICAgICAgICAgICAgJ21vZGVsJyxcbiAgICAgICAgICAgICdhc3NldCcsXG4gICAgICAgICAgICAncmVuZGVyJyxcbiAgICAgICAgICAgICdyZW5kZXJBc3NldCcsXG4gICAgICAgICAgICAnZW5hYmxlZCcsXG4gICAgICAgICAgICAnbGluZWFyT2Zmc2V0JyxcbiAgICAgICAgICAgICdhbmd1bGFyT2Zmc2V0J1xuICAgICAgICBdO1xuXG4gICAgICAgIC8vIGR1cGxpY2F0ZSB0aGUgaW5wdXQgZGF0YSBiZWNhdXNlIHdlIGFyZSBtb2RpZnlpbmcgaXRcbiAgICAgICAgY29uc3QgZGF0YSA9IHt9O1xuICAgICAgICBmb3IgKGxldCBpID0gMCwgbGVuID0gcHJvcGVydGllcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuICAgICAgICAgICAgY29uc3QgcHJvcGVydHkgPSBwcm9wZXJ0aWVzW2ldO1xuICAgICAgICAgICAgZGF0YVtwcm9wZXJ0eV0gPSBfZGF0YVtwcm9wZXJ0eV07XG4gICAgICAgIH1cblxuICAgICAgICAvLyBhc3NldCB0YWtlcyBwcmlvcml0eSBvdmVyIG1vZGVsXG4gICAgICAgIC8vIGJ1dCB0aGV5IGFyZSBib3RoIHRyeWluZyB0byBjaGFuZ2UgdGhlIG1lc2hcbiAgICAgICAgLy8gc28gcmVtb3ZlIG9uZSBvZiB0aGVtIHRvIGF2b2lkIGNvbmZsaWN0c1xuICAgICAgICBsZXQgaWR4O1xuICAgICAgICBpZiAoX2RhdGEuaGFzT3duUHJvcGVydHkoJ2Fzc2V0JykpIHtcbiAgICAgICAgICAgIGlkeCA9IHByb3BlcnRpZXMuaW5kZXhPZignbW9kZWwnKTtcbiAgICAgICAgICAgIGlmIChpZHggIT09IC0xKSB7XG4gICAgICAgICAgICAgICAgcHJvcGVydGllcy5zcGxpY2UoaWR4LCAxKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlkeCA9IHByb3BlcnRpZXMuaW5kZXhPZigncmVuZGVyJyk7XG4gICAgICAgICAgICBpZiAoaWR4ICE9PSAtMSkge1xuICAgICAgICAgICAgICAgIHByb3BlcnRpZXMuc3BsaWNlKGlkeCwgMSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoX2RhdGEuaGFzT3duUHJvcGVydHkoJ21vZGVsJykpIHtcbiAgICAgICAgICAgIGlkeCA9IHByb3BlcnRpZXMuaW5kZXhPZignYXNzZXQnKTtcbiAgICAgICAgICAgIGlmIChpZHggIT09IC0xKSB7XG4gICAgICAgICAgICAgICAgcHJvcGVydGllcy5zcGxpY2UoaWR4LCAxKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghZGF0YS50eXBlKSB7XG4gICAgICAgICAgICBkYXRhLnR5cGUgPSBjb21wb25lbnQuZGF0YS50eXBlO1xuICAgICAgICB9XG4gICAgICAgIGNvbXBvbmVudC5kYXRhLnR5cGUgPSBkYXRhLnR5cGU7XG5cbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoZGF0YS5oYWxmRXh0ZW50cykpIHtcbiAgICAgICAgICAgIGRhdGEuaGFsZkV4dGVudHMgPSBuZXcgVmVjMyhkYXRhLmhhbGZFeHRlbnRzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KGRhdGEubGluZWFyT2Zmc2V0KSkge1xuICAgICAgICAgICAgZGF0YS5saW5lYXJPZmZzZXQgPSBuZXcgVmVjMyhkYXRhLmxpbmVhck9mZnNldCk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShkYXRhLmFuZ3VsYXJPZmZzZXQpKSB7XG4gICAgICAgICAgICAvLyBBbGxvdyBmb3IgZXVsZXIgYW5nbGVzIHRvIGJlIHBhc3NlZCBhcyBhIDMgbGVuZ3RoIGFycmF5XG4gICAgICAgICAgICBjb25zdCB2YWx1ZXMgPSBkYXRhLmFuZ3VsYXJPZmZzZXQ7XG4gICAgICAgICAgICBpZiAodmFsdWVzLmxlbmd0aCA9PT0gMykge1xuICAgICAgICAgICAgICAgIGRhdGEuYW5ndWxhck9mZnNldCA9IG5ldyBRdWF0KCkuc2V0RnJvbUV1bGVyQW5nbGVzKHZhbHVlc1swXSwgdmFsdWVzWzFdLCB2YWx1ZXNbMl0pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBkYXRhLmFuZ3VsYXJPZmZzZXQgPSBuZXcgUXVhdChkYXRhLmFuZ3VsYXJPZmZzZXQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgaW1wbCA9IHRoaXMuX2NyZWF0ZUltcGxlbWVudGF0aW9uKGRhdGEudHlwZSk7XG4gICAgICAgIGltcGwuYmVmb3JlSW5pdGlhbGl6ZShjb21wb25lbnQsIGRhdGEpO1xuXG4gICAgICAgIHN1cGVyLmluaXRpYWxpemVDb21wb25lbnREYXRhKGNvbXBvbmVudCwgZGF0YSwgcHJvcGVydGllcyk7XG5cbiAgICAgICAgaW1wbC5hZnRlckluaXRpYWxpemUoY29tcG9uZW50LCBkYXRhKTtcbiAgICB9XG5cbiAgICAvLyBDcmVhdGVzIGFuIGltcGxlbWVudGF0aW9uIGJhc2VkIG9uIHRoZSBjb2xsaXNpb24gdHlwZSBhbmQgY2FjaGVzIGl0XG4gICAgLy8gaW4gYW4gaW50ZXJuYWwgaW1wbGVtZW50YXRpb25zIHN0cnVjdHVyZSwgYmVmb3JlIHJldHVybmluZyBpdC5cbiAgICBfY3JlYXRlSW1wbGVtZW50YXRpb24odHlwZSkge1xuICAgICAgICBpZiAodGhpcy5pbXBsZW1lbnRhdGlvbnNbdHlwZV0gPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgbGV0IGltcGw7XG4gICAgICAgICAgICBzd2l0Y2ggKHR5cGUpIHtcbiAgICAgICAgICAgICAgICBjYXNlICdib3gnOlxuICAgICAgICAgICAgICAgICAgICBpbXBsID0gbmV3IENvbGxpc2lvbkJveFN5c3RlbUltcGwodGhpcyk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ3NwaGVyZSc6XG4gICAgICAgICAgICAgICAgICAgIGltcGwgPSBuZXcgQ29sbGlzaW9uU3BoZXJlU3lzdGVtSW1wbCh0aGlzKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnY2Fwc3VsZSc6XG4gICAgICAgICAgICAgICAgICAgIGltcGwgPSBuZXcgQ29sbGlzaW9uQ2Fwc3VsZVN5c3RlbUltcGwodGhpcyk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ2N5bGluZGVyJzpcbiAgICAgICAgICAgICAgICAgICAgaW1wbCA9IG5ldyBDb2xsaXNpb25DeWxpbmRlclN5c3RlbUltcGwodGhpcyk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ2NvbmUnOlxuICAgICAgICAgICAgICAgICAgICBpbXBsID0gbmV3IENvbGxpc2lvbkNvbmVTeXN0ZW1JbXBsKHRoaXMpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdtZXNoJzpcbiAgICAgICAgICAgICAgICAgICAgaW1wbCA9IG5ldyBDb2xsaXNpb25NZXNoU3lzdGVtSW1wbCh0aGlzKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnY29tcG91bmQnOlxuICAgICAgICAgICAgICAgICAgICBpbXBsID0gbmV3IENvbGxpc2lvbkNvbXBvdW5kU3lzdGVtSW1wbCh0aGlzKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAgICAgRGVidWcuZXJyb3IoYF9jcmVhdGVJbXBsZW1lbnRhdGlvbjogSW52YWxpZCBjb2xsaXNpb24gc3lzdGVtIHR5cGU6ICR7dHlwZX1gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuaW1wbGVtZW50YXRpb25zW3R5cGVdID0gaW1wbDtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0aGlzLmltcGxlbWVudGF0aW9uc1t0eXBlXTtcbiAgICB9XG5cbiAgICAvLyBHZXRzIGFuIGV4aXN0aW5nIGltcGxlbWVudGF0aW9uIGZvciB0aGUgc3BlY2lmaWVkIGVudGl0eVxuICAgIF9nZXRJbXBsZW1lbnRhdGlvbihlbnRpdHkpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuaW1wbGVtZW50YXRpb25zW2VudGl0eS5jb2xsaXNpb24uZGF0YS50eXBlXTtcbiAgICB9XG5cbiAgICBjbG9uZUNvbXBvbmVudChlbnRpdHksIGNsb25lKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9nZXRJbXBsZW1lbnRhdGlvbihlbnRpdHkpLmNsb25lKGVudGl0eSwgY2xvbmUpO1xuICAgIH1cblxuICAgIG9uQmVmb3JlUmVtb3ZlKGVudGl0eSwgY29tcG9uZW50KSB7XG4gICAgICAgIHRoaXMuaW1wbGVtZW50YXRpb25zW2NvbXBvbmVudC5kYXRhLnR5cGVdLmJlZm9yZVJlbW92ZShlbnRpdHksIGNvbXBvbmVudCk7XG4gICAgICAgIGNvbXBvbmVudC5vbkJlZm9yZVJlbW92ZSgpO1xuICAgIH1cblxuICAgIG9uUmVtb3ZlKGVudGl0eSwgZGF0YSkge1xuICAgICAgICB0aGlzLmltcGxlbWVudGF0aW9uc1tkYXRhLnR5cGVdLnJlbW92ZShlbnRpdHksIGRhdGEpO1xuICAgIH1cblxuICAgIHVwZGF0ZUNvbXBvdW5kQ2hpbGRUcmFuc2Zvcm0oZW50aXR5KSB7XG4gICAgICAgIC8vIFRPRE9cbiAgICAgICAgLy8gdXNlIHVwZGF0ZUNoaWxkVHJhbnNmb3JtIG9uY2UgaXQgaXMgZXhwb3NlZCBpbiBhbW1vLmpzXG5cbiAgICAgICAgdGhpcy5fcmVtb3ZlQ29tcG91bmRDaGlsZChlbnRpdHkuY29sbGlzaW9uLl9jb21wb3VuZFBhcmVudCwgZW50aXR5LmNvbGxpc2lvbi5kYXRhLnNoYXBlKTtcblxuICAgICAgICBpZiAoZW50aXR5LmVuYWJsZWQgJiYgZW50aXR5LmNvbGxpc2lvbi5lbmFibGVkKSB7XG4gICAgICAgICAgICBjb25zdCB0cmFuc2Zvcm0gPSB0aGlzLl9nZXROb2RlVHJhbnNmb3JtKGVudGl0eSwgZW50aXR5LmNvbGxpc2lvbi5fY29tcG91bmRQYXJlbnQuZW50aXR5KTtcbiAgICAgICAgICAgIGVudGl0eS5jb2xsaXNpb24uX2NvbXBvdW5kUGFyZW50LnNoYXBlLmFkZENoaWxkU2hhcGUodHJhbnNmb3JtLCBlbnRpdHkuY29sbGlzaW9uLmRhdGEuc2hhcGUpO1xuICAgICAgICAgICAgQW1tby5kZXN0cm95KHRyYW5zZm9ybSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBfcmVtb3ZlQ29tcG91bmRDaGlsZChjb2xsaXNpb24sIHNoYXBlKSB7XG4gICAgICAgIGlmIChjb2xsaXNpb24uc2hhcGUucmVtb3ZlQ2hpbGRTaGFwZSkge1xuICAgICAgICAgICAgY29sbGlzaW9uLnNoYXBlLnJlbW92ZUNoaWxkU2hhcGUoc2hhcGUpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc3QgaW5kID0gY29sbGlzaW9uLl9nZXRDb21wb3VuZENoaWxkU2hhcGVJbmRleChzaGFwZSk7XG4gICAgICAgICAgICBpZiAoaW5kICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgY29sbGlzaW9uLnNoYXBlLnJlbW92ZUNoaWxkU2hhcGVCeUluZGV4KGluZCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBvblRyYW5zZm9ybUNoYW5nZWQoY29tcG9uZW50LCBwb3NpdGlvbiwgcm90YXRpb24sIHNjYWxlKSB7XG4gICAgICAgIHRoaXMuaW1wbGVtZW50YXRpb25zW2NvbXBvbmVudC5kYXRhLnR5cGVdLnVwZGF0ZVRyYW5zZm9ybShjb21wb25lbnQsIHBvc2l0aW9uLCByb3RhdGlvbiwgc2NhbGUpO1xuICAgIH1cblxuICAgIC8vIERlc3Ryb3lzIHRoZSBwcmV2aW91cyBjb2xsaXNpb24gdHlwZSBhbmQgY3JlYXRlcyBhIG5ldyBvbmUgYmFzZWQgb24gdGhlIG5ldyB0eXBlIHByb3ZpZGVkXG4gICAgY2hhbmdlVHlwZShjb21wb25lbnQsIHByZXZpb3VzVHlwZSwgbmV3VHlwZSkge1xuICAgICAgICB0aGlzLmltcGxlbWVudGF0aW9uc1twcmV2aW91c1R5cGVdLmJlZm9yZVJlbW92ZShjb21wb25lbnQuZW50aXR5LCBjb21wb25lbnQpO1xuICAgICAgICB0aGlzLmltcGxlbWVudGF0aW9uc1twcmV2aW91c1R5cGVdLnJlbW92ZShjb21wb25lbnQuZW50aXR5LCBjb21wb25lbnQuZGF0YSk7XG4gICAgICAgIHRoaXMuX2NyZWF0ZUltcGxlbWVudGF0aW9uKG5ld1R5cGUpLnJlc2V0KGNvbXBvbmVudCwgY29tcG9uZW50LmRhdGEpO1xuICAgIH1cblxuICAgIC8vIFJlY3JlYXRlcyByaWdpZCBib2RpZXMgb3IgdHJpZ2dlcnMgZm9yIHRoZSBzcGVjaWZpZWQgY29tcG9uZW50XG4gICAgcmVjcmVhdGVQaHlzaWNhbFNoYXBlcyhjb21wb25lbnQpIHtcbiAgICAgICAgdGhpcy5pbXBsZW1lbnRhdGlvbnNbY29tcG9uZW50LmRhdGEudHlwZV0ucmVjcmVhdGVQaHlzaWNhbFNoYXBlcyhjb21wb25lbnQpO1xuICAgIH1cblxuICAgIF9jYWxjdWxhdGVOb2RlUmVsYXRpdmVUcmFuc2Zvcm0obm9kZSwgcmVsYXRpdmUpIHtcbiAgICAgICAgaWYgKG5vZGUgPT09IHJlbGF0aXZlKSB7XG4gICAgICAgICAgICBjb25zdCBzY2FsZSA9IG5vZGUuZ2V0V29ybGRUcmFuc2Zvcm0oKS5nZXRTY2FsZSgpO1xuICAgICAgICAgICAgbWF0NC5zZXRTY2FsZShzY2FsZS54LCBzY2FsZS55LCBzY2FsZS56KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuX2NhbGN1bGF0ZU5vZGVSZWxhdGl2ZVRyYW5zZm9ybShub2RlLnBhcmVudCwgcmVsYXRpdmUpO1xuICAgICAgICAgICAgbWF0NC5tdWwobm9kZS5nZXRMb2NhbFRyYW5zZm9ybSgpKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIF9nZXROb2RlU2NhbGluZyhub2RlKSB7XG4gICAgICAgIGNvbnN0IHd0bSA9IG5vZGUuZ2V0V29ybGRUcmFuc2Zvcm0oKTtcbiAgICAgICAgY29uc3Qgc2NsID0gd3RtLmdldFNjYWxlKCk7XG4gICAgICAgIHJldHVybiBuZXcgQW1tby5idFZlY3RvcjMoc2NsLngsIHNjbC55LCBzY2wueik7XG4gICAgfVxuXG4gICAgX2dldE5vZGVUcmFuc2Zvcm0obm9kZSwgcmVsYXRpdmUpIHtcbiAgICAgICAgbGV0IHBvcywgcm90O1xuXG4gICAgICAgIGlmIChyZWxhdGl2ZSkge1xuICAgICAgICAgICAgdGhpcy5fY2FsY3VsYXRlTm9kZVJlbGF0aXZlVHJhbnNmb3JtKG5vZGUsIHJlbGF0aXZlKTtcblxuICAgICAgICAgICAgcG9zID0gcDE7XG4gICAgICAgICAgICByb3QgPSBxdWF0O1xuXG4gICAgICAgICAgICBtYXQ0LmdldFRyYW5zbGF0aW9uKHBvcyk7XG4gICAgICAgICAgICByb3Quc2V0RnJvbU1hdDQobWF0NCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwb3MgPSBub2RlLmdldFBvc2l0aW9uKCk7XG4gICAgICAgICAgICByb3QgPSBub2RlLmdldFJvdGF0aW9uKCk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgYW1tb1F1YXQgPSBuZXcgQW1tby5idFF1YXRlcm5pb24oKTtcbiAgICAgICAgY29uc3QgdHJhbnNmb3JtID0gbmV3IEFtbW8uYnRUcmFuc2Zvcm0oKTtcblxuICAgICAgICB0cmFuc2Zvcm0uc2V0SWRlbnRpdHkoKTtcbiAgICAgICAgY29uc3Qgb3JpZ2luID0gdHJhbnNmb3JtLmdldE9yaWdpbigpO1xuICAgICAgICBjb25zdCBjb21wb25lbnQgPSBub2RlLmNvbGxpc2lvbjtcblxuICAgICAgICBpZiAoY29tcG9uZW50ICYmIGNvbXBvbmVudC5faGFzT2Zmc2V0KSB7XG4gICAgICAgICAgICBjb25zdCBsbyA9IGNvbXBvbmVudC5kYXRhLmxpbmVhck9mZnNldDtcbiAgICAgICAgICAgIGNvbnN0IGFvID0gY29tcG9uZW50LmRhdGEuYW5ndWxhck9mZnNldDtcbiAgICAgICAgICAgIGNvbnN0IG5ld09yaWdpbiA9IHAyO1xuXG4gICAgICAgICAgICBxdWF0LmNvcHkocm90KS50cmFuc2Zvcm1WZWN0b3IobG8sIG5ld09yaWdpbik7XG4gICAgICAgICAgICBuZXdPcmlnaW4uYWRkKHBvcyk7XG4gICAgICAgICAgICBxdWF0LmNvcHkocm90KS5tdWwoYW8pO1xuXG4gICAgICAgICAgICBvcmlnaW4uc2V0VmFsdWUobmV3T3JpZ2luLngsIG5ld09yaWdpbi55LCBuZXdPcmlnaW4ueik7XG4gICAgICAgICAgICBhbW1vUXVhdC5zZXRWYWx1ZShxdWF0LngsIHF1YXQueSwgcXVhdC56LCBxdWF0LncpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgb3JpZ2luLnNldFZhbHVlKHBvcy54LCBwb3MueSwgcG9zLnopO1xuICAgICAgICAgICAgYW1tb1F1YXQuc2V0VmFsdWUocm90LngsIHJvdC55LCByb3Queiwgcm90LncpO1xuICAgICAgICB9XG5cbiAgICAgICAgdHJhbnNmb3JtLnNldFJvdGF0aW9uKGFtbW9RdWF0KTtcbiAgICAgICAgQW1tby5kZXN0cm95KGFtbW9RdWF0KTtcbiAgICAgICAgQW1tby5kZXN0cm95KG9yaWdpbik7XG5cbiAgICAgICAgcmV0dXJuIHRyYW5zZm9ybTtcbiAgICB9XG5cbiAgICBkZXN0cm95KCkge1xuICAgICAgICBmb3IgKGNvbnN0IGtleSBpbiB0aGlzLl90cmlNZXNoQ2FjaGUpIHtcbiAgICAgICAgICAgIEFtbW8uZGVzdHJveSh0aGlzLl90cmlNZXNoQ2FjaGVba2V5XSk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl90cmlNZXNoQ2FjaGUgPSBudWxsO1xuXG4gICAgICAgIHN1cGVyLmRlc3Ryb3koKTtcbiAgICB9XG59XG5cbkNvbXBvbmVudC5fYnVpbGRBY2Nlc3NvcnMoQ29sbGlzaW9uQ29tcG9uZW50LnByb3RvdHlwZSwgX3NjaGVtYSk7XG5cbmV4cG9ydCB7IENvbGxpc2lvbkNvbXBvbmVudFN5c3RlbSB9O1xuIl0sIm5hbWVzIjpbIm1hdDQiLCJNYXQ0IiwicDEiLCJWZWMzIiwicDIiLCJxdWF0IiwiUXVhdCIsInRlbXBHcmFwaE5vZGUiLCJHcmFwaE5vZGUiLCJfc2NoZW1hIiwiQ29sbGlzaW9uU3lzdGVtSW1wbCIsImNvbnN0cnVjdG9yIiwic3lzdGVtIiwiYmVmb3JlSW5pdGlhbGl6ZSIsImNvbXBvbmVudCIsImRhdGEiLCJzaGFwZSIsIm1vZGVsIiwiTW9kZWwiLCJncmFwaCIsImFmdGVySW5pdGlhbGl6ZSIsInJlY3JlYXRlUGh5c2ljYWxTaGFwZXMiLCJpbml0aWFsaXplZCIsInJlc2V0IiwiZW50aXR5IiwiQW1tbyIsInRyaWdnZXIiLCJkZXN0cm95IiwiX2NvbXBvdW5kUGFyZW50IiwiX3JlbW92ZUNvbXBvdW5kQ2hpbGQiLCJyaWdpZGJvZHkiLCJhY3RpdmF0ZSIsImRlc3Ryb3lTaGFwZSIsImNyZWF0ZVBoeXNpY2FsU2hhcGUiLCJmaXJzdENvbXBvdW5kQ2hpbGQiLCJ0eXBlIiwiZm9yRWFjaCIsIl9hZGRFYWNoRGVzY2VuZGFudCIsImltcGxlbWVudGF0aW9ucyIsImNvbXBvdW5kIiwiX3VwZGF0ZUVhY2hEZXNjZW5kYW50IiwicGFyZW50IiwiY29sbGlzaW9uIiwiZ2V0TnVtQ2hpbGRTaGFwZXMiLCJ1cGRhdGVDb21wb3VuZENoaWxkVHJhbnNmb3JtIiwiZGlzYWJsZVNpbXVsYXRpb24iLCJjcmVhdGVCb2R5IiwiZW5hYmxlZCIsImVuYWJsZVNpbXVsYXRpb24iLCJUcmlnZ2VyIiwiYXBwIiwiaW5pdGlhbGl6ZSIsInVuZGVmaW5lZCIsInVwZGF0ZVRyYW5zZm9ybSIsInBvc2l0aW9uIiwicm90YXRpb24iLCJzY2FsZSIsImJlZm9yZVJlbW92ZSIsIl9kZXN0cm95aW5nIiwicmVtb3ZlIiwiYm9keSIsImNsb25lIiwic3JjIiwic3RvcmUiLCJnZXRHdWlkIiwiaGFsZkV4dGVudHMiLCJ4IiwieSIsInoiLCJsaW5lYXJPZmZzZXQiLCJhbmd1bGFyT2Zmc2V0IiwidyIsInJhZGl1cyIsImF4aXMiLCJoZWlnaHQiLCJhc3NldCIsInJlbmRlckFzc2V0IiwicmVuZGVyIiwiYWRkQ29tcG9uZW50IiwiQ29sbGlzaW9uQm94U3lzdGVtSW1wbCIsImhlIiwiYW1tb0hlIiwiYnRWZWN0b3IzIiwiYnRCb3hTaGFwZSIsIkNvbGxpc2lvblNwaGVyZVN5c3RlbUltcGwiLCJidFNwaGVyZVNoYXBlIiwiQ29sbGlzaW9uQ2Fwc3VsZVN5c3RlbUltcGwiLCJfZGF0YSRheGlzIiwiX2RhdGEkcmFkaXVzIiwiX2RhdGEkaGVpZ2h0IiwiTWF0aCIsIm1heCIsImJ0Q2Fwc3VsZVNoYXBlWCIsImJ0Q2Fwc3VsZVNoYXBlIiwiYnRDYXBzdWxlU2hhcGVaIiwiQ29sbGlzaW9uQ3lsaW5kZXJTeXN0ZW1JbXBsIiwiX2RhdGEkYXhpczIiLCJfZGF0YSRyYWRpdXMyIiwiX2RhdGEkaGVpZ2h0MiIsImJ0Q3lsaW5kZXJTaGFwZVgiLCJidEN5bGluZGVyU2hhcGUiLCJidEN5bGluZGVyU2hhcGVaIiwiQ29sbGlzaW9uQ29uZVN5c3RlbUltcGwiLCJfZGF0YSRheGlzMyIsIl9kYXRhJHJhZGl1czMiLCJfZGF0YSRoZWlnaHQzIiwiYnRDb25lU2hhcGVYIiwiYnRDb25lU2hhcGUiLCJidENvbmVTaGFwZVoiLCJDb2xsaXNpb25NZXNoU3lzdGVtSW1wbCIsImNyZWF0ZUFtbW9NZXNoIiwibWVzaCIsIm5vZGUiLCJ0cmlNZXNoIiwiX3RyaU1lc2hDYWNoZSIsImlkIiwidmIiLCJ2ZXJ0ZXhCdWZmZXIiLCJmb3JtYXQiLCJnZXRGb3JtYXQiLCJzdHJpZGUiLCJwb3NpdGlvbnMiLCJpIiwiZWxlbWVudHMiLCJsZW5ndGgiLCJlbGVtZW50IiwibmFtZSIsIlNFTUFOVElDX1BPU0lUSU9OIiwiRmxvYXQzMkFycmF5IiwibG9jayIsIm9mZnNldCIsImluZGljZXMiLCJnZXRJbmRpY2VzIiwibnVtVHJpYW5nbGVzIiwicHJpbWl0aXZlIiwiY291bnQiLCJ2MSIsInYyIiwidjMiLCJpMSIsImkyIiwiaTMiLCJiYXNlIiwiYnRUcmlhbmdsZU1lc2giLCJzZXRWYWx1ZSIsImFkZFRyaWFuZ2xlIiwidXNlUXVhbnRpemVkQWFiYkNvbXByZXNzaW9uIiwidHJpTWVzaFNoYXBlIiwiYnRCdmhUcmlhbmdsZU1lc2hTaGFwZSIsInNjYWxpbmciLCJfZ2V0Tm9kZVNjYWxpbmciLCJzZXRMb2NhbFNjYWxpbmciLCJ0cmFuc2Zvcm0iLCJfZ2V0Tm9kZVRyYW5zZm9ybSIsImFkZENoaWxkU2hhcGUiLCJidENvbXBvdW5kU2hhcGUiLCJtZXNoSW5zdGFuY2VzIiwibWVzaGVzIiwiZW50aXR5VHJhbnNmb3JtIiwiZ2V0V29ybGRUcmFuc2Zvcm0iLCJnZXRTY2FsZSIsInZlYyIsImxvYWRBc3NldCIsImRvUmVjcmVhdGVQaHlzaWNhbFNoYXBlIiwicHJvcGVydHkiLCJhc3NldHMiLCJnZXQiLCJyZWFkeSIsInJlc291cmNlIiwibG9hZCIsIm9uY2UiLCJ3b3JsZFNjYWxlIiwicHJldmlvdXNTY2FsZSIsImdldExvY2FsU2NhbGluZyIsIm51bVNoYXBlcyIsImdldENoaWxkU2hhcGUiLCJDb2xsaXNpb25Db21wb3VuZFN5c3RlbUltcGwiLCJfdXBkYXRlRWFjaERlc2NlbmRhbnRUcmFuc2Zvcm0iLCJDb2xsaXNpb25Db21wb25lbnRTeXN0ZW0iLCJDb21wb25lbnRTeXN0ZW0iLCJDb21wb25lbnRUeXBlIiwiQ29sbGlzaW9uQ29tcG9uZW50IiwiRGF0YVR5cGUiLCJDb2xsaXNpb25Db21wb25lbnREYXRhIiwic2NoZW1hIiwib24iLCJvbkJlZm9yZVJlbW92ZSIsIm9uUmVtb3ZlIiwiaW5pdGlhbGl6ZUNvbXBvbmVudERhdGEiLCJfZGF0YSIsInByb3BlcnRpZXMiLCJsZW4iLCJpZHgiLCJoYXNPd25Qcm9wZXJ0eSIsImluZGV4T2YiLCJzcGxpY2UiLCJBcnJheSIsImlzQXJyYXkiLCJ2YWx1ZXMiLCJzZXRGcm9tRXVsZXJBbmdsZXMiLCJpbXBsIiwiX2NyZWF0ZUltcGxlbWVudGF0aW9uIiwiRGVidWciLCJlcnJvciIsIl9nZXRJbXBsZW1lbnRhdGlvbiIsImNsb25lQ29tcG9uZW50IiwicmVtb3ZlQ2hpbGRTaGFwZSIsImluZCIsIl9nZXRDb21wb3VuZENoaWxkU2hhcGVJbmRleCIsInJlbW92ZUNoaWxkU2hhcGVCeUluZGV4Iiwib25UcmFuc2Zvcm1DaGFuZ2VkIiwiY2hhbmdlVHlwZSIsInByZXZpb3VzVHlwZSIsIm5ld1R5cGUiLCJfY2FsY3VsYXRlTm9kZVJlbGF0aXZlVHJhbnNmb3JtIiwicmVsYXRpdmUiLCJzZXRTY2FsZSIsIm11bCIsImdldExvY2FsVHJhbnNmb3JtIiwid3RtIiwic2NsIiwicG9zIiwicm90IiwiZ2V0VHJhbnNsYXRpb24iLCJzZXRGcm9tTWF0NCIsImdldFBvc2l0aW9uIiwiZ2V0Um90YXRpb24iLCJhbW1vUXVhdCIsImJ0UXVhdGVybmlvbiIsImJ0VHJhbnNmb3JtIiwic2V0SWRlbnRpdHkiLCJvcmlnaW4iLCJnZXRPcmlnaW4iLCJfaGFzT2Zmc2V0IiwibG8iLCJhbyIsIm5ld09yaWdpbiIsImNvcHkiLCJ0cmFuc2Zvcm1WZWN0b3IiLCJhZGQiLCJzZXRSb3RhdGlvbiIsImtleSIsIkNvbXBvbmVudCIsIl9idWlsZEFjY2Vzc29ycyIsInByb3RvdHlwZSJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7OztBQWtCQSxNQUFNQSxJQUFJLEdBQUcsSUFBSUMsSUFBSSxFQUFFLENBQUE7QUFDdkIsTUFBTUMsRUFBRSxHQUFH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
