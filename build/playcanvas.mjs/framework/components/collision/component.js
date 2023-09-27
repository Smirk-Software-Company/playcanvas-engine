import { Quat } from '../../../core/math/quat.js';
import { Vec3 } from '../../../core/math/vec3.js';
import { Asset } from '../../asset/asset.js';
import { Component } from '../component.js';

const _vec3 = new Vec3();
const _quat = new Quat();

/**
 * A collision volume. Use this in conjunction with a {@link RigidBodyComponent} to make a
 * collision volume that can be simulated using the physics engine.
 *
 * If the {@link Entity} does not have a {@link RigidBodyComponent} then this collision volume will
 * act as a trigger volume. When an entity with a dynamic or kinematic body enters or leaves an
 * entity with a trigger volume, both entities will receive trigger events.
 *
 * The following table shows all the events that can be fired between two Entities:
 *
 * |                                       | Rigid Body (Static)                                                   | Rigid Body (Dynamic or Kinematic)                                     | Trigger Volume                                      |
 * | ------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------- |
 * | **Rigid Body (Static)**               |                                                                       | <ul><li>contact</li><li>collisionstart</li><li>collisionend</li></ul> |                                                     |
 * | **Rigid Body (Dynamic or Kinematic)** | <ul><li>contact</li><li>collisionstart</li><li>collisionend</li></ul> | <ul><li>contact</li><li>collisionstart</li><li>collisionend</li></ul> | <ul><li>triggerenter</li><li>triggerleave</li></ul> |
 * | **Trigger Volume**                    |                                                                       | <ul><li>triggerenter</li><li>triggerleave</li></ul>                   |                                                     |
 *
 * @property {string} type The type of the collision volume. Can be:
 *
 * - "box": A box-shaped collision volume.
 * - "capsule": A capsule-shaped collision volume.
 * - "compound": A compound shape. Any descendant entities with a collision component
 * of type box, capsule, cone, cylinder or sphere will be combined into a single, rigid
 * shape.
 * - "cone": A cone-shaped collision volume.
 * - "cylinder": A cylinder-shaped collision volume.
 * - "mesh": A collision volume that uses a model asset as its shape.
 * - "sphere": A sphere-shaped collision volume.
 *
 * Defaults to "box".
 * @property {Vec3} halfExtents The half-extents of the
 * box-shaped collision volume in the x, y and z axes. Defaults to [0.5, 0.5, 0.5].
 * @property {Vec3} linearOffset The positional offset of the collision shape from the Entity position along the local axes.
 * Defaults to [0, 0, 0].
 * @property {Quat} angularOffset The rotational offset of the collision shape from the Entity rotation in local space.
 * Defaults to identity.
 * @property {number} radius The radius of the sphere, capsule, cylinder or cone-shaped collision
 * volumes. Defaults to 0.5.
 * @property {number} axis The local space axis with which the capsule, cylinder or cone-shaped
 * collision volume's length is aligned. 0 for X, 1 for Y and 2 for Z. Defaults to 1 (Y-axis).
 * @property {number} height The total height of the capsule, cylinder or cone-shaped collision
 * volume from tip to tip. Defaults to 2.
 * @property {Asset|number} asset The asset for the model of the mesh collision volume - can also
 * be an asset id. Defaults to null.
 * @property {Asset|number} renderAsset The render asset of the mesh collision volume - can also be
 * an asset id. Defaults to null. If not set then the asset property will be checked instead.
 * @property {import('../../../scene/model.js').Model} model The model that is added to the scene
 * graph for the mesh collision volume.
 * @augments Component
 * @category Physics
 */
class CollisionComponent extends Component {
  /**
   * Create a new CollisionComponent.
   *
   * @param {import('./system.js').CollisionComponentSystem} system - The ComponentSystem that
   * created this Component.
   * @param {import('../../entity.js').Entity} entity - The Entity that this Component is
   * attached to.
   */
  constructor(system, entity) {
    super(system, entity);

    /** @private */
    this._compoundParent = null;
    this._hasOffset = false;
    this.entity.on('insert', this._onInsert, this);
    this.on('set_type', this.onSetType, this);
    this.on('set_halfExtents', this.onSetHalfExtents, this);
    this.on('set_linearOffset', this.onSetOffset, this);
    this.on('set_angularOffset', this.onSetOffset, this);
    this.on('set_radius', this.onSetRadius, this);
    this.on('set_height', this.onSetHeight, this);
    this.on('set_axis', this.onSetAxis, this);
    this.on('set_asset', this.onSetAsset, this);
    this.on('set_renderAsset', this.onSetRenderAsset, this);
    this.on('set_model', this.onSetModel, this);
    this.on('set_render', this.onSetRender, this);
  }

  /**
   * The 'contact' event is fired when a contact occurs between two rigid bodies.
   *
   * @event CollisionComponent#contact
   * @param {ContactResult} result - Details of the contact between the two rigid bodies.
   */

  /**
   * Fired when two rigid bodies start touching.
   *
   * @event CollisionComponent#collisionstart
   * @param {ContactResult} result - Details of the contact between the two Entities.
   */

  /**
   * Fired two rigid-bodies stop touching.
   *
   * @event CollisionComponent#collisionend
   * @param {import('../../entity.js').Entity} other - The {@link Entity} that stopped touching this collision volume.
   */

  /**
   * Fired when a rigid body enters a trigger volume.
   *
   * @event CollisionComponent#triggerenter
   * @param {import('../../entity.js').Entity} other - The {@link Entity} that entered this collision volume.
   */

  /**
   * Fired when a rigid body exits a trigger volume.
   *
   * @event CollisionComponent#triggerleave
   * @param {import('../../entity.js').Entity} other - The {@link Entity} that exited this collision volume.
   */

  /**
   * @param {string} name - Property name.
   * @param {*} oldValue - Previous value of the property.
   * @param {*} newValue - New value of the property.
   * @private
   */
  onSetType(name, oldValue, newValue) {
    if (oldValue !== newValue) {
      this.system.changeType(this, oldValue, newValue);
    }
  }

  /**
   * @param {string} name - Property name.
   * @param {*} oldValue - Previous value of the property.
   * @param {*} newValue - New value of the property.
   * @private
   */
  onSetHalfExtents(name, oldValue, newValue) {
    const t = this.data.type;
    if (this.data.initialized && t === 'box') {
      this.system.recreatePhysicalShapes(this);
    }
  }

  /**
   * @param {string} name - Property name.
   * @param {*} oldValue - Previous value of the property.
   * @param {*} newValue - New value of the property.
   * @private
   */
  onSetOffset(name, oldValue, newValue) {
    this._hasOffset = !this.data.linearOffset.equals(Vec3.ZERO) || !this.data.angularOffset.equals(Quat.IDENTITY);
    if (this.data.initialized) {
      this.system.recreatePhysicalShapes(this);
    }
  }

  /**
   * @param {string} name - Property name.
   * @param {*} oldValue - Previous value of the property.
   * @param {*} newValue - New value of the property.
   * @private
   */
  onSetRadius(name, oldValue, newValue) {
    const t = this.data.type;
    if (this.data.initialized && (t === 'sphere' || t === 'capsule' || t === 'cylinder' || t === 'cone')) {
      this.system.recreatePhysicalShapes(this);
    }
  }

  /**
   * @param {string} name - Property name.
   * @param {*} oldValue - Previous value of the property.
   * @param {*} newValue - New value of the property.
   * @private
   */
  onSetHeight(name, oldValue, newValue) {
    const t = this.data.type;
    if (this.data.initialized && (t === 'capsule' || t === 'cylinder' || t === 'cone')) {
      this.system.recreatePhysicalShapes(this);
    }
  }

  /**
   * @param {string} name - Property name.
   * @param {*} oldValue - Previous value of the property.
   * @param {*} newValue - New value of the property.
   * @private
   */
  onSetAxis(name, oldValue, newValue) {
    const t = this.data.type;
    if (this.data.initialized && (t === 'capsule' || t === 'cylinder' || t === 'cone')) {
      this.system.recreatePhysicalShapes(this);
    }
  }

  /**
   * @param {string} name - Property name.
   * @param {*} oldValue - Previous value of the property.
   * @param {*} newValue - New value of the property.
   * @private
   */
  onSetAsset(name, oldValue, newValue) {
    const assets = this.system.app.assets;
    if (oldValue) {
      // Remove old listeners
      const asset = assets.get(oldValue);
      if (asset) {
        asset.off('remove', this.onAssetRemoved, this);
      }
    }
    if (newValue) {
      if (newValue instanceof Asset) {
        this.data.asset = newValue.id;
      }
      const asset = assets.get(this.data.asset);
      if (asset) {
        // make sure we don't subscribe twice
        asset.off('remove', this.onAssetRemoved, this);
        asset.on('remove', this.onAssetRemoved, this);
      }
    }
    if (this.data.initialized && this.data.type === 'mesh') {
      if (!newValue) {
        // if asset is null set model to null
        // so that it's going to be removed from the simulation
        this.data.model = null;
      }
      this.system.recreatePhysicalShapes(this);
    }
  }

  /**
   * @param {string} name - Property name.
   * @param {*} oldValue - Previous value of the property.
   * @param {*} newValue - New value of the property.
   * @private
   */
  onSetRenderAsset(name, oldValue, newValue) {
    const assets = this.system.app.assets;
    if (oldValue) {
      // Remove old listeners
      const asset = assets.get(oldValue);
      if (asset) {
        asset.off('remove', this.onRenderAssetRemoved, this);
      }
    }
    if (newValue) {
      if (newValue instanceof Asset) {
        this.data.renderAsset = newValue.id;
      }
      const asset = assets.get(this.data.renderAsset);
      if (asset) {
        // make sure we don't subscribe twice
        asset.off('remove', this.onRenderAssetRemoved, this);
        asset.on('remove', this.onRenderAssetRemoved, this);
      }
    }
    if (this.data.initialized && this.data.type === 'mesh') {
      if (!newValue) {
        // if render asset is null set render to null
        // so that it's going to be removed from the simulation
        this.data.render = null;
      }
      this.system.recreatePhysicalShapes(this);
    }
  }

  /**
   * @param {string} name - Property name.
   * @param {*} oldValue - Previous value of the property.
   * @param {*} newValue - New value of the property.
   * @private
   */
  onSetModel(name, oldValue, newValue) {
    if (this.data.initialized && this.data.type === 'mesh') {
      // recreate physical shapes skipping loading the model
      // from the 'asset' as the model passed in newValue might
      // have been created procedurally
      this.system.implementations.mesh.doRecreatePhysicalShape(this);
    }
  }

  /**
   * @param {string} name - Property name.
   * @param {*} oldValue - Previous value of the property.
   * @param {*} newValue - New value of the property.
   * @private
   */
  onSetRender(name, oldValue, newValue) {
    this.onSetModel(name, oldValue, newValue);
  }

  /**
   * @param {Asset} asset - Asset that was removed.
   * @private
   */
  onAssetRemoved(asset) {
    asset.off('remove', this.onAssetRemoved, this);
    if (this.data.asset === asset.id) {
      this.asset = null;
    }
  }

  /**
   * @param {Asset} asset - Asset that was removed.
   * @private
   */
  onRenderAssetRemoved(asset) {
    asset.off('remove', this.onRenderAssetRemoved, this);
    if (this.data.renderAsset === asset.id) {
      this.renderAsset = null;
    }
  }

  /**
   * @param {*} shape - Ammo shape.
   * @returns {number|null} The shape's index in the child array of the compound shape.
   * @private
   */
  _getCompoundChildShapeIndex(shape) {
    const compound = this.data.shape;
    const shapes = compound.getNumChildShapes();
    for (let i = 0; i < shapes; i++) {
      const childShape = compound.getChildShape(i);
      if (childShape.ptr === shape.ptr) {
        return i;
      }
    }
    return null;
  }

  /**
   * @param {import('../../../scene/graph-node.js').GraphNode} parent - The parent node.
   * @private
   */
  _onInsert(parent) {
    // TODO
    // if is child of compound shape
    // and there is no change of compoundParent, then update child transform
    // once updateChildTransform is exposed in ammo.js

    if (typeof Ammo === 'undefined') return;
    if (this._compoundParent) {
      this.system.recreatePhysicalShapes(this);
    } else if (!this.entity.rigidbody) {
      let ancestor = this.entity.parent;
      while (ancestor) {
        if (ancestor.collision && ancestor.collision.type === 'compound') {
          if (ancestor.collision.shape.getNumChildShapes() === 0) {
            this.system.recreatePhysicalShapes(ancestor.collision);
          } else {
            this.system.recreatePhysicalShapes(this);
          }
          break;
        }
        ancestor = ancestor.parent;
      }
    }
  }

  /** @private */
  _updateCompound() {
    const entity = this.entity;
    if (entity._dirtyWorld) {
      let dirty = entity._dirtyLocal;
      let parent = entity;
      while (parent && !dirty) {
        if (parent.collision && parent.collision === this._compoundParent) break;
        if (parent._dirtyLocal) dirty = true;
        parent = parent.parent;
      }
      if (dirty) {
        entity.forEach(this.system.implementations.compound._updateEachDescendantTransform, entity);
        const bodyComponent = this._compoundParent.entity.rigidbody;
        if (bodyComponent) bodyComponent.activate();
      }
    }
  }

  /**
   * @description Returns the world position for the collision shape taking into account of any offsets.
   * @returns {Vec3} The world position for the collision shape.
   */
  getShapePosition() {
    const pos = this.entity.getPosition();
    if (this._hasOffset) {
      const rot = this.entity.getRotation();
      const lo = this.data.linearOffset;
      _quat.copy(rot).transformVector(lo, _vec3);
      return _vec3.add(pos);
    }
    return pos;
  }

  /**
   * @description Returns the world rotation for the collision shape taking into account of any offsets.
   * @returns {Quat} The world rotation for the collision.
   */
  getShapeRotation() {
    const rot = this.entity.getRotation();
    if (this._hasOffset) {
      return _quat.copy(rot).mul(this.data.angularOffset);
    }
    return rot;
  }

  /** @private */
  onEnable() {
    if (this.data.type === 'mesh' && (this.data.asset || this.data.renderAsset) && this.data.initialized) {
      const asset = this.system.app.assets.get(this.data.asset || this.data.renderAsset);
      // recreate the collision shape if the model asset is not loaded
      // or the shape does not exist
      if (asset && (!asset.resource || !this.data.shape)) {
        this.system.recreatePhysicalShapes(this);
        return;
      }
    }
    if (this.entity.rigidbody) {
      if (this.entity.rigidbody.enabled) {
        this.entity.rigidbody.enableSimulation();
      }
    } else if (this._compoundParent && this !== this._compoundParent) {
      if (this._compoundParent.shape.getNumChildShapes() === 0) {
        this.system.recreatePhysicalShapes(this._compoundParent);
      } else {
        const transform = this.system._getNodeTransform(this.entity, this._compoundParent.entity);
        this._compoundParent.shape.addChildShape(transform, this.data.shape);
        Ammo.destroy(transform);
        if (this._compoundParent.entity.rigidbody) this._compoundParent.entity.rigidbody.activate();
      }
    } else if (this.entity.trigger) {
      this.entity.trigger.enable();
    }
  }

  /** @private */
  onDisable() {
    if (this.entity.rigidbody) {
      this.entity.rigidbody.disableSimulation();
    } else if (this._compoundParent && this !== this._compoundParent) {
      if (!this._compoundParent.entity._destroying) {
        this.system._removeCompoundChild(this._compoundParent, this.data.shape);
        if (this._compoundParent.entity.rigidbody) this._compoundParent.entity.rigidbody.activate();
      }
    } else if (this.entity.trigger) {
      this.entity.trigger.disable();
    }
  }

  /** @private */
  onBeforeRemove() {
    if (this.asset) {
      this.asset = null;
    }
    if (this.renderAsset) {
      this.renderAsset = null;
    }
    this.entity.off('insert', this._onInsert, this);
    this.off();
  }
}

export { CollisionComponent };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tcG9uZW50LmpzIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi9zcmMvZnJhbWV3b3JrL2NvbXBvbmVudHMvY29sbGlzaW9uL2NvbXBvbmVudC5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBRdWF0IH0gZnJvbSAnLi4vLi4vLi4vY29yZS9tYXRoL3F1YXQuanMnO1xuaW1wb3J0IHsgVmVjMyB9IGZyb20gJy4uLy4uLy4uL2NvcmUvbWF0aC92ZWMzLmpzJztcblxuaW1wb3J0IHsgQXNzZXQgfSBmcm9tICcuLi8uLi9hc3NldC9hc3NldC5qcyc7XG5cbmltcG9ydCB7IENvbXBvbmVudCB9IGZyb20gJy4uL2NvbXBvbmVudC5qcyc7XG5cbmNvbnN0IF92ZWMzID0gbmV3IFZlYzMoKTtcbmNvbnN0IF9xdWF0ID0gbmV3IFF1YXQoKTtcblxuLyoqXG4gKiBBIGNvbGxpc2lvbiB2b2x1bWUuIFVzZSB0aGlzIGluIGNvbmp1bmN0aW9uIHdpdGggYSB7QGxpbmsgUmlnaWRCb2R5Q29tcG9uZW50fSB0byBtYWtlIGFcbiAqIGNvbGxpc2lvbiB2b2x1bWUgdGhhdCBjYW4gYmUgc2ltdWxhdGVkIHVzaW5nIHRoZSBwaHlzaWNzIGVuZ2luZS5cbiAqXG4gKiBJZiB0aGUge0BsaW5rIEVudGl0eX0gZG9lcyBub3QgaGF2ZSBhIHtAbGluayBSaWdpZEJvZHlDb21wb25lbnR9IHRoZW4gdGhpcyBjb2xsaXNpb24gdm9sdW1lIHdpbGxcbiAqIGFjdCBhcyBhIHRyaWdnZXIgdm9sdW1lLiBXaGVuIGFuIGVudGl0eSB3aXRoIGEgZHluYW1pYyBvciBraW5lbWF0aWMgYm9keSBlbnRlcnMgb3IgbGVhdmVzIGFuXG4gKiBlbnRpdHkgd2l0aCBhIHRyaWdnZXIgdm9sdW1lLCBib3RoIGVudGl0aWVzIHdpbGwgcmVjZWl2ZSB0cmlnZ2VyIGV2ZW50cy5cbiAqXG4gKiBUaGUgZm9sbG93aW5nIHRhYmxlIHNob3dzIGFsbCB0aGUgZXZlbnRzIHRoYXQgY2FuIGJlIGZpcmVkIGJldHdlZW4gdHdvIEVudGl0aWVzOlxuICpcbiAqIHwgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB8IFJpZ2lkIEJvZHkgKFN0YXRpYykgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB8IFJpZ2lkIEJvZHkgKER5bmFtaWMgb3IgS2luZW1hdGljKSAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB8IFRyaWdnZXIgVm9sdW1lICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB8XG4gKiB8IC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0gfCAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0gfCAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0gfCAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0gfFxuICogfCAqKlJpZ2lkIEJvZHkgKFN0YXRpYykqKiAgICAgICAgICAgICAgIHwgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHwgPHVsPjxsaT5jb250YWN0PC9saT48bGk+Y29sbGlzaW9uc3RhcnQ8L2xpPjxsaT5jb2xsaXNpb25lbmQ8L2xpPjwvdWw+IHwgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHxcbiAqIHwgKipSaWdpZCBCb2R5IChEeW5hbWljIG9yIEtpbmVtYXRpYykqKiB8IDx1bD48bGk+Y29udGFjdDwvbGk+PGxpPmNvbGxpc2lvbnN0YXJ0PC9saT48bGk+Y29sbGlzaW9uZW5kPC9saT48L3VsPiB8IDx1bD48bGk+Y29udGFjdDwvbGk+PGxpPmNvbGxpc2lvbnN0YXJ0PC9saT48bGk+Y29sbGlzaW9uZW5kPC9saT48L3VsPiB8IDx1bD48bGk+dHJpZ2dlcmVudGVyPC9saT48bGk+dHJpZ2dlcmxlYXZlPC9saT48L3VsPiB8XG4gKiB8ICoqVHJpZ2dlciBWb2x1bWUqKiAgICAgICAgICAgICAgICAgICAgfCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfCA8dWw+PGxpPnRyaWdnZXJlbnRlcjwvbGk+PGxpPnRyaWdnZXJsZWF2ZTwvbGk+PC91bD4gICAgICAgICAgICAgICAgICAgfCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfFxuICpcbiAqIEBwcm9wZXJ0eSB7c3RyaW5nfSB0eXBlIFRoZSB0eXBlIG9mIHRoZSBjb2xsaXNpb24gdm9sdW1lLiBDYW4gYmU6XG4gKlxuICogLSBcImJveFwiOiBBIGJveC1zaGFwZWQgY29sbGlzaW9uIHZvbHVtZS5cbiAqIC0gXCJjYXBzdWxlXCI6IEEgY2Fwc3VsZS1zaGFwZWQgY29sbGlzaW9uIHZvbHVtZS5cbiAqIC0gXCJjb21wb3VuZFwiOiBBIGNvbXBvdW5kIHNoYXBlLiBBbnkgZGVzY2VuZGFudCBlbnRpdGllcyB3aXRoIGEgY29sbGlzaW9uIGNvbXBvbmVudFxuICogb2YgdHlwZSBib3gsIGNhcHN1bGUsIGNvbmUsIGN5bGluZGVyIG9yIHNwaGVyZSB3aWxsIGJlIGNvbWJpbmVkIGludG8gYSBzaW5nbGUsIHJpZ2lkXG4gKiBzaGFwZS5cbiAqIC0gXCJjb25lXCI6IEEgY29uZS1zaGFwZWQgY29sbGlzaW9uIHZvbHVtZS5cbiAqIC0gXCJjeWxpbmRlclwiOiBBIGN5bGluZGVyLXNoYXBlZCBjb2xsaXNpb24gdm9sdW1lLlxuICogLSBcIm1lc2hcIjogQSBjb2xsaXNpb24gdm9sdW1lIHRoYXQgdXNlcyBhIG1vZGVsIGFzc2V0IGFzIGl0cyBzaGFwZS5cbiAqIC0gXCJzcGhlcmVcIjogQSBzcGhlcmUtc2hhcGVkIGNvbGxpc2lvbiB2b2x1bWUuXG4gKlxuICogRGVmYXVsdHMgdG8gXCJib3hcIi5cbiAqIEBwcm9wZXJ0eSB7VmVjM30gaGFsZkV4dGVudHMgVGhlIGhhbGYtZXh0ZW50cyBvZiB0aGVcbiAqIGJveC1zaGFwZWQgY29sbGlzaW9uIHZvbHVtZSBpbiB0aGUgeCwgeSBhbmQgeiBheGVzLiBEZWZhdWx0cyB0byBbMC41LCAwLjUsIDAuNV0uXG4gKiBAcHJvcGVydHkge1ZlYzN9IGxpbmVhck9mZnNldCBUaGUgcG9zaXRpb25hbCBvZmZzZXQgb2YgdGhlIGNvbGxpc2lvbiBzaGFwZSBmcm9tIHRoZSBFbnRpdHkgcG9zaXRpb24gYWxvbmcgdGhlIGxvY2FsIGF4ZXMuXG4gKiBEZWZhdWx0cyB0byBbMCwgMCwgMF0uXG4gKiBAcHJvcGVydHkge1F1YXR9IGFuZ3VsYXJPZmZzZXQgVGhlIHJvdGF0aW9uYWwgb2Zmc2V0IG9mIHRoZSBjb2xsaXNpb24gc2hhcGUgZnJvbSB0aGUgRW50aXR5IHJvdGF0aW9uIGluIGxvY2FsIHNwYWNlLlxuICogRGVmYXVsdHMgdG8gaWRlbnRpdHkuXG4gKiBAcHJvcGVydHkge251bWJlcn0gcmFkaXVzIFRoZSByYWRpdXMgb2YgdGhlIHNwaGVyZSwgY2Fwc3VsZSwgY3lsaW5kZXIgb3IgY29uZS1zaGFwZWQgY29sbGlzaW9uXG4gKiB2b2x1bWVzLiBEZWZhdWx0cyB0byAwLjUuXG4gKiBAcHJvcGVydHkge251bWJlcn0gYXhpcyBUaGUgbG9jYWwgc3BhY2UgYXhpcyB3aXRoIHdoaWNoIHRoZSBjYXBzdWxlLCBjeWxpbmRlciBvciBjb25lLXNoYXBlZFxuICogY29sbGlzaW9uIHZvbHVtZSdzIGxlbmd0aCBpcyBhbGlnbmVkLiAwIGZvciBYLCAxIGZvciBZIGFuZCAyIGZvciBaLiBEZWZhdWx0cyB0byAxIChZLWF4aXMpLlxuICogQHByb3BlcnR5IHtudW1iZXJ9IGhlaWdodCBUaGUgdG90YWwgaGVpZ2h0IG9mIHRoZSBjYXBzdWxlLCBjeWxpbmRlciBvciBjb25lLXNoYXBlZCBjb2xsaXNpb25cbiAqIHZvbHVtZSBmcm9tIHRpcCB0byB0aXAuIERlZmF1bHRzIHRvIDIuXG4gKiBAcHJvcGVydHkge0Fzc2V0fG51bWJlcn0gYXNzZXQgVGhlIGFzc2V0IGZvciB0aGUgbW9kZWwgb2YgdGhlIG1lc2ggY29sbGlzaW9uIHZvbHVtZSAtIGNhbiBhbHNvXG4gKiBiZSBhbiBhc3NldCBpZC4gRGVmYXVsdHMgdG8gbnVsbC5cbiAqIEBwcm9wZXJ0eSB7QXNzZXR8bnVtYmVyfSByZW5kZXJBc3NldCBUaGUgcmVuZGVyIGFzc2V0IG9mIHRoZSBtZXNoIGNvbGxpc2lvbiB2b2x1bWUgLSBjYW4gYWxzbyBiZVxuICogYW4gYXNzZXQgaWQuIERlZmF1bHRzIHRvIG51bGwuIElmIG5vdCBzZXQgdGhlbiB0aGUgYXNzZXQgcHJvcGVydHkgd2lsbCBiZSBjaGVja2VkIGluc3RlYWQuXG4gKiBAcHJvcGVydHkge2ltcG9ydCgnLi4vLi4vLi4vc2NlbmUvbW9kZWwuanMnKS5Nb2RlbH0gbW9kZWwgVGhlIG1vZGVsIHRoYXQgaXMgYWRkZWQgdG8gdGhlIHNjZW5lXG4gKiBncmFwaCBmb3IgdGhlIG1lc2ggY29sbGlzaW9uIHZvbHVtZS5cbiAqIEBhdWdtZW50cyBDb21wb25lbnRcbiAqIEBjYXRlZ29yeSBQaHlzaWNzXG4gKi9cbmNsYXNzIENvbGxpc2lvbkNvbXBvbmVudCBleHRlbmRzIENvbXBvbmVudCB7XG4gICAgLyoqXG4gICAgICogQ3JlYXRlIGEgbmV3IENvbGxpc2lvbkNvbXBvbmVudC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuL3N5c3RlbS5qcycpLkNvbGxpc2lvbkNvbXBvbmVudFN5c3RlbX0gc3lzdGVtIC0gVGhlIENvbXBvbmVudFN5c3RlbSB0aGF0XG4gICAgICogY3JlYXRlZCB0aGlzIENvbXBvbmVudC5cbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi4vLi4vZW50aXR5LmpzJykuRW50aXR5fSBlbnRpdHkgLSBUaGUgRW50aXR5IHRoYXQgdGhpcyBDb21wb25lbnQgaXNcbiAgICAgKiBhdHRhY2hlZCB0by5cbiAgICAgKi9cbiAgICBjb25zdHJ1Y3RvcihzeXN0ZW0sIGVudGl0eSkge1xuICAgICAgICBzdXBlcihzeXN0ZW0sIGVudGl0eSk7XG5cbiAgICAgICAgLyoqIEBwcml2YXRlICovXG4gICAgICAgIHRoaXMuX2NvbXBvdW5kUGFyZW50ID0gbnVsbDtcbiAgICAgICAgdGhpcy5faGFzT2Zmc2V0ID0gZmFsc2U7XG5cbiAgICAgICAgdGhpcy5lbnRpdHkub24oJ2luc2VydCcsIHRoaXMuX29uSW5zZXJ0LCB0aGlzKTtcblxuICAgICAgICB0aGlzLm9uKCdzZXRfdHlwZScsIHRoaXMub25TZXRUeXBlLCB0aGlzKTtcbiAgICAgICAgdGhpcy5vbignc2V0X2hhbGZFeHRlbnRzJywgdGhpcy5vblNldEhhbGZFeHRlbnRzLCB0aGlzKTtcbiAgICAgICAgdGhpcy5vbignc2V0X2xpbmVhck9mZnNldCcsIHRoaXMub25TZXRPZmZzZXQsIHRoaXMpO1xuICAgICAgICB0aGlzLm9uKCdzZXRfYW5ndWxhck9mZnNldCcsIHRoaXMub25TZXRPZmZzZXQsIHRoaXMpO1xuICAgICAgICB0aGlzLm9uKCdzZXRfcmFkaXVzJywgdGhpcy5vblNldFJhZGl1cywgdGhpcyk7XG4gICAgICAgIHRoaXMub24oJ3NldF9oZWlnaHQnLCB0aGlzLm9uU2V0SGVpZ2h0LCB0aGlzKTtcbiAgICAgICAgdGhpcy5vbignc2V0X2F4aXMnLCB0aGlzLm9uU2V0QXhpcywgdGhpcyk7XG4gICAgICAgIHRoaXMub24oJ3NldF9hc3NldCcsIHRoaXMub25TZXRBc3NldCwgdGhpcyk7XG4gICAgICAgIHRoaXMub24oJ3NldF9yZW5kZXJBc3NldCcsIHRoaXMub25TZXRSZW5kZXJBc3NldCwgdGhpcyk7XG4gICAgICAgIHRoaXMub24oJ3NldF9tb2RlbCcsIHRoaXMub25TZXRNb2RlbCwgdGhpcyk7XG4gICAgICAgIHRoaXMub24oJ3NldF9yZW5kZXInLCB0aGlzLm9uU2V0UmVuZGVyLCB0aGlzKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUaGUgJ2NvbnRhY3QnIGV2ZW50IGlzIGZpcmVkIHdoZW4gYSBjb250YWN0IG9jY3VycyBiZXR3ZWVuIHR3byByaWdpZCBib2RpZXMuXG4gICAgICpcbiAgICAgKiBAZXZlbnQgQ29sbGlzaW9uQ29tcG9uZW50I2NvbnRhY3RcbiAgICAgKiBAcGFyYW0ge0NvbnRhY3RSZXN1bHR9IHJlc3VsdCAtIERldGFpbHMgb2YgdGhlIGNvbnRhY3QgYmV0d2VlbiB0aGUgdHdvIHJpZ2lkIGJvZGllcy5cbiAgICAgKi9cblxuICAgIC8qKlxuICAgICAqIEZpcmVkIHdoZW4gdHdvIHJpZ2lkIGJvZGllcyBzdGFydCB0b3VjaGluZy5cbiAgICAgKlxuICAgICAqIEBldmVudCBDb2xsaXNpb25Db21wb25lbnQjY29sbGlzaW9uc3RhcnRcbiAgICAgKiBAcGFyYW0ge0NvbnRhY3RSZXN1bHR9IHJlc3VsdCAtIERldGFpbHMgb2YgdGhlIGNvbnRhY3QgYmV0d2VlbiB0aGUgdHdvIEVudGl0aWVzLlxuICAgICAqL1xuXG4gICAgLyoqXG4gICAgICogRmlyZWQgdHdvIHJpZ2lkLWJvZGllcyBzdG9wIHRvdWNoaW5nLlxuICAgICAqXG4gICAgICogQGV2ZW50IENvbGxpc2lvbkNvbXBvbmVudCNjb2xsaXNpb25lbmRcbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi4vLi4vZW50aXR5LmpzJykuRW50aXR5fSBvdGhlciAtIFRoZSB7QGxpbmsgRW50aXR5fSB0aGF0IHN0b3BwZWQgdG91Y2hpbmcgdGhpcyBjb2xsaXNpb24gdm9sdW1lLlxuICAgICAqL1xuXG4gICAgLyoqXG4gICAgICogRmlyZWQgd2hlbiBhIHJpZ2lkIGJvZHkgZW50ZXJzIGEgdHJpZ2dlciB2b2x1bWUuXG4gICAgICpcbiAgICAgKiBAZXZlbnQgQ29sbGlzaW9uQ29tcG9uZW50I3RyaWdnZXJlbnRlclxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuLi8uLi9lbnRpdHkuanMnKS5FbnRpdHl9IG90aGVyIC0gVGhlIHtAbGluayBFbnRpdHl9IHRoYXQgZW50ZXJlZCB0aGlzIGNvbGxpc2lvbiB2b2x1bWUuXG4gICAgICovXG5cbiAgICAvKipcbiAgICAgKiBGaXJlZCB3aGVuIGEgcmlnaWQgYm9keSBleGl0cyBhIHRyaWdnZXIgdm9sdW1lLlxuICAgICAqXG4gICAgICogQGV2ZW50IENvbGxpc2lvbkNvbXBvbmVudCN0cmlnZ2VybGVhdmVcbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi4vLi4vZW50aXR5LmpzJykuRW50aXR5fSBvdGhlciAtIFRoZSB7QGxpbmsgRW50aXR5fSB0aGF0IGV4aXRlZCB0aGlzIGNvbGxpc2lvbiB2b2x1bWUuXG4gICAgICovXG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gbmFtZSAtIFByb3BlcnR5IG5hbWUuXG4gICAgICogQHBhcmFtIHsqfSBvbGRWYWx1ZSAtIFByZXZpb3VzIHZhbHVlIG9mIHRoZSBwcm9wZXJ0eS5cbiAgICAgKiBAcGFyYW0geyp9IG5ld1ZhbHVlIC0gTmV3IHZhbHVlIG9mIHRoZSBwcm9wZXJ0eS5cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIG9uU2V0VHlwZShuYW1lLCBvbGRWYWx1ZSwgbmV3VmFsdWUpIHtcbiAgICAgICAgaWYgKG9sZFZhbHVlICE9PSBuZXdWYWx1ZSkge1xuICAgICAgICAgICAgdGhpcy5zeXN0ZW0uY2hhbmdlVHlwZSh0aGlzLCBvbGRWYWx1ZSwgbmV3VmFsdWUpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IG5hbWUgLSBQcm9wZXJ0eSBuYW1lLlxuICAgICAqIEBwYXJhbSB7Kn0gb2xkVmFsdWUgLSBQcmV2aW91cyB2YWx1ZSBvZiB0aGUgcHJvcGVydHkuXG4gICAgICogQHBhcmFtIHsqfSBuZXdWYWx1ZSAtIE5ldyB2YWx1ZSBvZiB0aGUgcHJvcGVydHkuXG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBvblNldEhhbGZFeHRlbnRzKG5hbWUsIG9sZFZhbHVlLCBuZXdWYWx1ZSkge1xuICAgICAgICBjb25zdCB0ID0gdGhpcy5kYXRhLnR5cGU7XG4gICAgICAgIGlmICh0aGlzLmRhdGEuaW5pdGlhbGl6ZWQgJiYgdCA9PT0gJ2JveCcpIHtcbiAgICAgICAgICAgIHRoaXMuc3lzdGVtLnJlY3JlYXRlUGh5c2ljYWxTaGFwZXModGhpcyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gbmFtZSAtIFByb3BlcnR5IG5hbWUuXG4gICAgICogQHBhcmFtIHsqfSBvbGRWYWx1ZSAtIFByZXZpb3VzIHZhbHVlIG9mIHRoZSBwcm9wZXJ0eS5cbiAgICAgKiBAcGFyYW0geyp9IG5ld1ZhbHVlIC0gTmV3IHZhbHVlIG9mIHRoZSBwcm9wZXJ0eS5cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIG9uU2V0T2Zmc2V0KG5hbWUsIG9sZFZhbHVlLCBuZXdWYWx1ZSkge1xuICAgICAgICB0aGlzLl9oYXNPZmZzZXQgPSAhdGhpcy5kYXRhLmxpbmVhck9mZnNldC5lcXVhbHMoVmVjMy5aRVJPKSB8fCAhdGhpcy5kYXRhLmFuZ3VsYXJPZmZzZXQuZXF1YWxzKFF1YXQuSURFTlRJVFkpO1xuXG4gICAgICAgIGlmICh0aGlzLmRhdGEuaW5pdGlhbGl6ZWQpIHtcbiAgICAgICAgICAgIHRoaXMuc3lzdGVtLnJlY3JlYXRlUGh5c2ljYWxTaGFwZXModGhpcyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gbmFtZSAtIFByb3BlcnR5IG5hbWUuXG4gICAgICogQHBhcmFtIHsqfSBvbGRWYWx1ZSAtIFByZXZpb3VzIHZhbHVlIG9mIHRoZSBwcm9wZXJ0eS5cbiAgICAgKiBAcGFyYW0geyp9IG5ld1ZhbHVlIC0gTmV3IHZhbHVlIG9mIHRoZSBwcm9wZXJ0eS5cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIG9uU2V0UmFkaXVzKG5hbWUsIG9sZFZhbHVlLCBuZXdWYWx1ZSkge1xuICAgICAgICBjb25zdCB0ID0gdGhpcy5kYXRhLnR5cGU7XG4gICAgICAgIGlmICh0aGlzLmRhdGEuaW5pdGlhbGl6ZWQgJiYgKHQgPT09ICdzcGhlcmUnIHx8IHQgPT09ICdjYXBzdWxlJyB8fCB0ID09PSAnY3lsaW5kZXInIHx8IHQgPT09ICdjb25lJykpIHtcbiAgICAgICAgICAgIHRoaXMuc3lzdGVtLnJlY3JlYXRlUGh5c2ljYWxTaGFwZXModGhpcyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gbmFtZSAtIFByb3BlcnR5IG5hbWUuXG4gICAgICogQHBhcmFtIHsqfSBvbGRWYWx1ZSAtIFByZXZpb3VzIHZhbHVlIG9mIHRoZSBwcm9wZXJ0eS5cbiAgICAgKiBAcGFyYW0geyp9IG5ld1ZhbHVlIC0gTmV3IHZhbHVlIG9mIHRoZSBwcm9wZXJ0eS5cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIG9uU2V0SGVpZ2h0KG5hbWUsIG9sZFZhbHVlLCBuZXdWYWx1ZSkge1xuICAgICAgICBjb25zdCB0ID0gdGhpcy5kYXRhLnR5cGU7XG4gICAgICAgIGlmICh0aGlzLmRhdGEuaW5pdGlhbGl6ZWQgJiYgKHQgPT09ICdjYXBzdWxlJyB8fCB0ID09PSAnY3lsaW5kZXInIHx8IHQgPT09ICdjb25lJykpIHtcbiAgICAgICAgICAgIHRoaXMuc3lzdGVtLnJlY3JlYXRlUGh5c2ljYWxTaGFwZXModGhpcyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gbmFtZSAtIFByb3BlcnR5IG5hbWUuXG4gICAgICogQHBhcmFtIHsqfSBvbGRWYWx1ZSAtIFByZXZpb3VzIHZhbHVlIG9mIHRoZSBwcm9wZXJ0eS5cbiAgICAgKiBAcGFyYW0geyp9IG5ld1ZhbHVlIC0gTmV3IHZhbHVlIG9mIHRoZSBwcm9wZXJ0eS5cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIG9uU2V0QXhpcyhuYW1lLCBvbGRWYWx1ZSwgbmV3VmFsdWUpIHtcbiAgICAgICAgY29uc3QgdCA9IHRoaXMuZGF0YS50eXBlO1xuICAgICAgICBpZiAodGhpcy5kYXRhLmluaXRpYWxpemVkICYmICh0ID09PSAnY2Fwc3VsZScgfHwgdCA9PT0gJ2N5bGluZGVyJyB8fCB0ID09PSAnY29uZScpKSB7XG4gICAgICAgICAgICB0aGlzLnN5c3RlbS5yZWNyZWF0ZVBoeXNpY2FsU2hhcGVzKHRoaXMpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IG5hbWUgLSBQcm9wZXJ0eSBuYW1lLlxuICAgICAqIEBwYXJhbSB7Kn0gb2xkVmFsdWUgLSBQcmV2aW91cyB2YWx1ZSBvZiB0aGUgcHJvcGVydHkuXG4gICAgICogQHBhcmFtIHsqfSBuZXdWYWx1ZSAtIE5ldyB2YWx1ZSBvZiB0aGUgcHJvcGVydHkuXG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBvblNldEFzc2V0KG5hbWUsIG9sZFZhbHVlLCBuZXdWYWx1ZSkge1xuICAgICAgICBjb25zdCBhc3NldHMgPSB0aGlzLnN5c3RlbS5hcHAuYXNzZXRzO1xuXG4gICAgICAgIGlmIChvbGRWYWx1ZSkge1xuICAgICAgICAgICAgLy8gUmVtb3ZlIG9sZCBsaXN0ZW5lcnNcbiAgICAgICAgICAgIGNvbnN0IGFzc2V0ID0gYXNzZXRzLmdldChvbGRWYWx1ZSk7XG4gICAgICAgICAgICBpZiAoYXNzZXQpIHtcbiAgICAgICAgICAgICAgICBhc3NldC5vZmYoJ3JlbW92ZScsIHRoaXMub25Bc3NldFJlbW92ZWQsIHRoaXMpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKG5ld1ZhbHVlKSB7XG4gICAgICAgICAgICBpZiAobmV3VmFsdWUgaW5zdGFuY2VvZiBBc3NldCkge1xuICAgICAgICAgICAgICAgIHRoaXMuZGF0YS5hc3NldCA9IG5ld1ZhbHVlLmlkO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBhc3NldCA9IGFzc2V0cy5nZXQodGhpcy5kYXRhLmFzc2V0KTtcbiAgICAgICAgICAgIGlmIChhc3NldCkge1xuICAgICAgICAgICAgICAgIC8vIG1ha2Ugc3VyZSB3ZSBkb24ndCBzdWJzY3JpYmUgdHdpY2VcbiAgICAgICAgICAgICAgICBhc3NldC5vZmYoJ3JlbW92ZScsIHRoaXMub25Bc3NldFJlbW92ZWQsIHRoaXMpO1xuICAgICAgICAgICAgICAgIGFzc2V0Lm9uKCdyZW1vdmUnLCB0aGlzLm9uQXNzZXRSZW1vdmVkLCB0aGlzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLmRhdGEuaW5pdGlhbGl6ZWQgJiYgdGhpcy5kYXRhLnR5cGUgPT09ICdtZXNoJykge1xuICAgICAgICAgICAgaWYgKCFuZXdWYWx1ZSkge1xuICAgICAgICAgICAgICAgIC8vIGlmIGFzc2V0IGlzIG51bGwgc2V0IG1vZGVsIHRvIG51bGxcbiAgICAgICAgICAgICAgICAvLyBzbyB0aGF0IGl0J3MgZ29pbmcgdG8gYmUgcmVtb3ZlZCBmcm9tIHRoZSBzaW11bGF0aW9uXG4gICAgICAgICAgICAgICAgdGhpcy5kYXRhLm1vZGVsID0gbnVsbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuc3lzdGVtLnJlY3JlYXRlUGh5c2ljYWxTaGFwZXModGhpcyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gbmFtZSAtIFByb3BlcnR5IG5hbWUuXG4gICAgICogQHBhcmFtIHsqfSBvbGRWYWx1ZSAtIFByZXZpb3VzIHZhbHVlIG9mIHRoZSBwcm9wZXJ0eS5cbiAgICAgKiBAcGFyYW0geyp9IG5ld1ZhbHVlIC0gTmV3IHZhbHVlIG9mIHRoZSBwcm9wZXJ0eS5cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIG9uU2V0UmVuZGVyQXNzZXQobmFtZSwgb2xkVmFsdWUsIG5ld1ZhbHVlKSB7XG4gICAgICAgIGNvbnN0IGFzc2V0cyA9IHRoaXMuc3lzdGVtLmFwcC5hc3NldHM7XG5cbiAgICAgICAgaWYgKG9sZFZhbHVlKSB7XG4gICAgICAgICAgICAvLyBSZW1vdmUgb2xkIGxpc3RlbmVyc1xuICAgICAgICAgICAgY29uc3QgYXNzZXQgPSBhc3NldHMuZ2V0KG9sZFZhbHVlKTtcbiAgICAgICAgICAgIGlmIChhc3NldCkge1xuICAgICAgICAgICAgICAgIGFzc2V0Lm9mZigncmVtb3ZlJywgdGhpcy5vblJlbmRlckFzc2V0UmVtb3ZlZCwgdGhpcyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAobmV3VmFsdWUpIHtcbiAgICAgICAgICAgIGlmIChuZXdWYWx1ZSBpbnN0YW5jZW9mIEFzc2V0KSB7XG4gICAgICAgICAgICAgICAgdGhpcy5kYXRhLnJlbmRlckFzc2V0ID0gbmV3VmFsdWUuaWQ7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IGFzc2V0ID0gYXNzZXRzLmdldCh0aGlzLmRhdGEucmVuZGVyQXNzZXQpO1xuICAgICAgICAgICAgaWYgKGFzc2V0KSB7XG4gICAgICAgICAgICAgICAgLy8gbWFrZSBzdXJlIHdlIGRvbid0IHN1YnNjcmliZSB0d2ljZVxuICAgICAgICAgICAgICAgIGFzc2V0Lm9mZigncmVtb3ZlJywgdGhpcy5vblJlbmRlckFzc2V0UmVtb3ZlZCwgdGhpcyk7XG4gICAgICAgICAgICAgICAgYXNzZXQub24oJ3JlbW92ZScsIHRoaXMub25SZW5kZXJBc3NldFJlbW92ZWQsIHRoaXMpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuZGF0YS5pbml0aWFsaXplZCAmJiB0aGlzLmRhdGEudHlwZSA9PT0gJ21lc2gnKSB7XG4gICAgICAgICAgICBpZiAoIW5ld1ZhbHVlKSB7XG4gICAgICAgICAgICAgICAgLy8gaWYgcmVuZGVyIGFzc2V0IGlzIG51bGwgc2V0IHJlbmRlciB0byBudWxsXG4gICAgICAgICAgICAgICAgLy8gc28gdGhhdCBpdCdzIGdvaW5nIHRvIGJlIHJlbW92ZWQgZnJvbSB0aGUgc2ltdWxhdGlvblxuICAgICAgICAgICAgICAgIHRoaXMuZGF0YS5yZW5kZXIgPSBudWxsO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5zeXN0ZW0ucmVjcmVhdGVQaHlzaWNhbFNoYXBlcyh0aGlzKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lIC0gUHJvcGVydHkgbmFtZS5cbiAgICAgKiBAcGFyYW0geyp9IG9sZFZhbHVlIC0gUHJldmlvdXMgdmFsdWUgb2YgdGhlIHByb3BlcnR5LlxuICAgICAqIEBwYXJhbSB7Kn0gbmV3VmFsdWUgLSBOZXcgdmFsdWUgb2YgdGhlIHByb3BlcnR5LlxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgb25TZXRNb2RlbChuYW1lLCBvbGRWYWx1ZSwgbmV3VmFsdWUpIHtcbiAgICAgICAgaWYgKHRoaXMuZGF0YS5pbml0aWFsaXplZCAmJiB0aGlzLmRhdGEudHlwZSA9PT0gJ21lc2gnKSB7XG4gICAgICAgICAgICAvLyByZWNyZWF0ZSBwaHlzaWNhbCBzaGFwZXMgc2tpcHBpbmcgbG9hZGluZyB0aGUgbW9kZWxcbiAgICAgICAgICAgIC8vIGZyb20gdGhlICdhc3NldCcgYXMgdGhlIG1vZGVsIHBhc3NlZCBpbiBuZXdWYWx1ZSBtaWdodFxuICAgICAgICAgICAgLy8gaGF2ZSBiZWVuIGNyZWF0ZWQgcHJvY2VkdXJhbGx5XG4gICAgICAgICAgICB0aGlzLnN5c3RlbS5pbXBsZW1lbnRhdGlvbnMubWVzaC5kb1JlY3JlYXRlUGh5c2ljYWxTaGFwZSh0aGlzKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lIC0gUHJvcGVydHkgbmFtZS5cbiAgICAgKiBAcGFyYW0geyp9IG9sZFZhbHVlIC0gUHJldmlvdXMgdmFsdWUgb2YgdGhlIHByb3BlcnR5LlxuICAgICAqIEBwYXJhbSB7Kn0gbmV3VmFsdWUgLSBOZXcgdmFsdWUgb2YgdGhlIHByb3BlcnR5LlxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgb25TZXRSZW5kZXIobmFtZSwgb2xkVmFsdWUsIG5ld1ZhbHVlKSB7XG4gICAgICAgIHRoaXMub25TZXRNb2RlbChuYW1lLCBvbGRWYWx1ZSwgbmV3VmFsdWUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7QXNzZXR9IGFzc2V0IC0gQXNzZXQgdGhhdCB3YXMgcmVtb3ZlZC5cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIG9uQXNzZXRSZW1vdmVkKGFzc2V0KSB7XG4gICAgICAgIGFzc2V0Lm9mZigncmVtb3ZlJywgdGhpcy5vbkFzc2V0UmVtb3ZlZCwgdGhpcyk7XG4gICAgICAgIGlmICh0aGlzLmRhdGEuYXNzZXQgPT09IGFzc2V0LmlkKSB7XG4gICAgICAgICAgICB0aGlzLmFzc2V0ID0gbnVsbDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7QXNzZXR9IGFzc2V0IC0gQXNzZXQgdGhhdCB3YXMgcmVtb3ZlZC5cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIG9uUmVuZGVyQXNzZXRSZW1vdmVkKGFzc2V0KSB7XG4gICAgICAgIGFzc2V0Lm9mZigncmVtb3ZlJywgdGhpcy5vblJlbmRlckFzc2V0UmVtb3ZlZCwgdGhpcyk7XG4gICAgICAgIGlmICh0aGlzLmRhdGEucmVuZGVyQXNzZXQgPT09IGFzc2V0LmlkKSB7XG4gICAgICAgICAgICB0aGlzLnJlbmRlckFzc2V0ID0gbnVsbDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7Kn0gc2hhcGUgLSBBbW1vIHNoYXBlLlxuICAgICAqIEByZXR1cm5zIHtudW1iZXJ8bnVsbH0gVGhlIHNoYXBlJ3MgaW5kZXggaW4gdGhlIGNoaWxkIGFycmF5IG9mIHRoZSBjb21wb3VuZCBzaGFwZS5cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9nZXRDb21wb3VuZENoaWxkU2hhcGVJbmRleChzaGFwZSkge1xuICAgICAgICBjb25zdCBjb21wb3VuZCA9IHRoaXMuZGF0YS5zaGFwZTtcbiAgICAgICAgY29uc3Qgc2hhcGVzID0gY29tcG91bmQuZ2V0TnVtQ2hpbGRTaGFwZXMoKTtcblxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHNoYXBlczsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBjaGlsZFNoYXBlID0gY29tcG91bmQuZ2V0Q2hpbGRTaGFwZShpKTtcbiAgICAgICAgICAgIGlmIChjaGlsZFNoYXBlLnB0ciA9PT0gc2hhcGUucHRyKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi4vLi4vLi4vc2NlbmUvZ3JhcGgtbm9kZS5qcycpLkdyYXBoTm9kZX0gcGFyZW50IC0gVGhlIHBhcmVudCBub2RlLlxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX29uSW5zZXJ0KHBhcmVudCkge1xuICAgICAgICAvLyBUT0RPXG4gICAgICAgIC8vIGlmIGlzIGNoaWxkIG9mIGNvbXBvdW5kIHNoYXBlXG4gICAgICAgIC8vIGFuZCB0aGVyZSBpcyBubyBjaGFuZ2Ugb2YgY29tcG91bmRQYXJlbnQsIHRoZW4gdXBkYXRlIGNoaWxkIHRyYW5zZm9ybVxuICAgICAgICAvLyBvbmNlIHVwZGF0ZUNoaWxkVHJhbnNmb3JtIGlzIGV4cG9zZWQgaW4gYW1tby5qc1xuXG4gICAgICAgIGlmICh0eXBlb2YgQW1tbyA9PT0gJ3VuZGVmaW5lZCcpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgaWYgKHRoaXMuX2NvbXBvdW5kUGFyZW50KSB7XG4gICAgICAgICAgICB0aGlzLnN5c3RlbS5yZWNyZWF0ZVBoeXNpY2FsU2hhcGVzKHRoaXMpO1xuICAgICAgICB9IGVsc2UgaWYgKCF0aGlzLmVudGl0eS5yaWdpZGJvZHkpIHtcbiAgICAgICAgICAgIGxldCBhbmNlc3RvciA9IHRoaXMuZW50aXR5LnBhcmVudDtcbiAgICAgICAgICAgIHdoaWxlIChhbmNlc3Rvcikge1xuICAgICAgICAgICAgICAgIGlmIChhbmNlc3Rvci5jb2xsaXNpb24gJiYgYW5jZXN0b3IuY29sbGlzaW9uLnR5cGUgPT09ICdjb21wb3VuZCcpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGFuY2VzdG9yLmNvbGxpc2lvbi5zaGFwZS5nZXROdW1DaGlsZFNoYXBlcygpID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnN5c3RlbS5yZWNyZWF0ZVBoeXNpY2FsU2hhcGVzKGFuY2VzdG9yLmNvbGxpc2lvbik7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnN5c3RlbS5yZWNyZWF0ZVBoeXNpY2FsU2hhcGVzKHRoaXMpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBhbmNlc3RvciA9IGFuY2VzdG9yLnBhcmVudDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKiBAcHJpdmF0ZSAqL1xuICAgIF91cGRhdGVDb21wb3VuZCgpIHtcbiAgICAgICAgY29uc3QgZW50aXR5ID0gdGhpcy5lbnRpdHk7XG4gICAgICAgIGlmIChlbnRpdHkuX2RpcnR5V29ybGQpIHtcbiAgICAgICAgICAgIGxldCBkaXJ0eSA9IGVudGl0eS5fZGlydHlMb2NhbDtcbiAgICAgICAgICAgIGxldCBwYXJlbnQgPSBlbnRpdHk7XG4gICAgICAgICAgICB3aGlsZSAocGFyZW50ICYmICFkaXJ0eSkge1xuICAgICAgICAgICAgICAgIGlmIChwYXJlbnQuY29sbGlzaW9uICYmIHBhcmVudC5jb2xsaXNpb24gPT09IHRoaXMuX2NvbXBvdW5kUGFyZW50KVxuICAgICAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgICAgIGlmIChwYXJlbnQuX2RpcnR5TG9jYWwpXG4gICAgICAgICAgICAgICAgICAgIGRpcnR5ID0gdHJ1ZTtcblxuICAgICAgICAgICAgICAgIHBhcmVudCA9IHBhcmVudC5wYXJlbnQ7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChkaXJ0eSkge1xuICAgICAgICAgICAgICAgIGVudGl0eS5mb3JFYWNoKHRoaXMuc3lzdGVtLmltcGxlbWVudGF0aW9ucy5jb21wb3VuZC5fdXBkYXRlRWFjaERlc2NlbmRhbnRUcmFuc2Zvcm0sIGVudGl0eSk7XG5cbiAgICAgICAgICAgICAgICBjb25zdCBib2R5Q29tcG9uZW50ID0gdGhpcy5fY29tcG91bmRQYXJlbnQuZW50aXR5LnJpZ2lkYm9keTtcbiAgICAgICAgICAgICAgICBpZiAoYm9keUNvbXBvbmVudClcbiAgICAgICAgICAgICAgICAgICAgYm9keUNvbXBvbmVudC5hY3RpdmF0ZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICAvKipcbiAgICAgKiBAZGVzY3JpcHRpb24gUmV0dXJucyB0aGUgd29ybGQgcG9zaXRpb24gZm9yIHRoZSBjb2xsaXNpb24gc2hhcGUgdGFraW5nIGludG8gYWNjb3VudCBvZiBhbnkgb2Zmc2V0cy5cbiAgICAgKiBAcmV0dXJucyB7VmVjM30gVGhlIHdvcmxkIHBvc2l0aW9uIGZvciB0aGUgY29sbGlzaW9uIHNoYXBlLlxuICAgICAqL1xuICAgIGdldFNoYXBlUG9zaXRpb24oKSB7XG4gICAgICAgIGNvbnN0IHBvcyA9IHRoaXMuZW50aXR5LmdldFBvc2l0aW9uKCk7XG5cbiAgICAgICAgaWYgKHRoaXMuX2hhc09mZnNldCkge1xuICAgICAgICAgICAgY29uc3Qgcm90ID0gdGhpcy5lbnRpdHkuZ2V0Um90YXRpb24oKTtcbiAgICAgICAgICAgIGNvbnN0IGxvID0gdGhpcy5kYXRhLmxpbmVhck9mZnNldDtcblxuICAgICAgICAgICAgX3F1YXQuY29weShyb3QpLnRyYW5zZm9ybVZlY3RvcihsbywgX3ZlYzMpO1xuICAgICAgICAgICAgcmV0dXJuIF92ZWMzLmFkZChwb3MpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHBvcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAZGVzY3JpcHRpb24gUmV0dXJucyB0aGUgd29ybGQgcm90YXRpb24gZm9yIHRoZSBjb2xsaXNpb24gc2hhcGUgdGFraW5nIGludG8gYWNjb3VudCBvZiBhbnkgb2Zmc2V0cy5cbiAgICAgKiBAcmV0dXJucyB7UXVhdH0gVGhlIHdvcmxkIHJvdGF0aW9uIGZvciB0aGUgY29sbGlzaW9uLlxuICAgICAqL1xuICAgIGdldFNoYXBlUm90YXRpb24oKSB7XG4gICAgICAgIGNvbnN0IHJvdCA9IHRoaXMuZW50aXR5LmdldFJvdGF0aW9uKCk7XG5cbiAgICAgICAgaWYgKHRoaXMuX2hhc09mZnNldCkge1xuICAgICAgICAgICAgcmV0dXJuIF9xdWF0LmNvcHkocm90KS5tdWwodGhpcy5kYXRhLmFuZ3VsYXJPZmZzZXQpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHJvdDtcbiAgICB9XG5cbiAgICAvKiogQHByaXZhdGUgKi9cbiAgICBvbkVuYWJsZSgpIHtcbiAgICAgICAgaWYgKHRoaXMuZGF0YS50eXBlID09PSAnbWVzaCcgJiYgKHRoaXMuZGF0YS5hc3NldCB8fCB0aGlzLmRhdGEucmVuZGVyQXNzZXQpICYmIHRoaXMuZGF0YS5pbml0aWFsaXplZCkge1xuICAgICAgICAgICAgY29uc3QgYXNzZXQgPSB0aGlzLnN5c3RlbS5hcHAuYXNzZXRzLmdldCh0aGlzLmRhdGEuYXNzZXQgfHwgdGhpcy5kYXRhLnJlbmRlckFzc2V0KTtcbiAgICAgICAgICAgIC8vIHJlY3JlYXRlIHRoZSBjb2xsaXNpb24gc2hhcGUgaWYgdGhlIG1vZGVsIGFzc2V0IGlzIG5vdCBsb2FkZWRcbiAgICAgICAgICAgIC8vIG9yIHRoZSBzaGFwZSBkb2VzIG5vdCBleGlzdFxuICAgICAgICAgICAgaWYgKGFzc2V0ICYmICghYXNzZXQucmVzb3VyY2UgfHwgIXRoaXMuZGF0YS5zaGFwZSkpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnN5c3RlbS5yZWNyZWF0ZVBoeXNpY2FsU2hhcGVzKHRoaXMpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLmVudGl0eS5yaWdpZGJvZHkpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLmVudGl0eS5yaWdpZGJvZHkuZW5hYmxlZCkge1xuICAgICAgICAgICAgICAgIHRoaXMuZW50aXR5LnJpZ2lkYm9keS5lbmFibGVTaW11bGF0aW9uKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5fY29tcG91bmRQYXJlbnQgJiYgdGhpcyAhPT0gdGhpcy5fY29tcG91bmRQYXJlbnQpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLl9jb21wb3VuZFBhcmVudC5zaGFwZS5nZXROdW1DaGlsZFNoYXBlcygpID09PSAwKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zeXN0ZW0ucmVjcmVhdGVQaHlzaWNhbFNoYXBlcyh0aGlzLl9jb21wb3VuZFBhcmVudCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbnN0IHRyYW5zZm9ybSA9IHRoaXMuc3lzdGVtLl9nZXROb2RlVHJhbnNmb3JtKHRoaXMuZW50aXR5LCB0aGlzLl9jb21wb3VuZFBhcmVudC5lbnRpdHkpO1xuICAgICAgICAgICAgICAgIHRoaXMuX2NvbXBvdW5kUGFyZW50LnNoYXBlLmFkZENoaWxkU2hhcGUodHJhbnNmb3JtLCB0aGlzLmRhdGEuc2hhcGUpO1xuICAgICAgICAgICAgICAgIEFtbW8uZGVzdHJveSh0cmFuc2Zvcm0pO1xuXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuX2NvbXBvdW5kUGFyZW50LmVudGl0eS5yaWdpZGJvZHkpXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX2NvbXBvdW5kUGFyZW50LmVudGl0eS5yaWdpZGJvZHkuYWN0aXZhdGUoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLmVudGl0eS50cmlnZ2VyKSB7XG4gICAgICAgICAgICB0aGlzLmVudGl0eS50cmlnZ2VyLmVuYWJsZSgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqIEBwcml2YXRlICovXG4gICAgb25EaXNhYmxlKCkge1xuICAgICAgICBpZiAodGhpcy5lbnRpdHkucmlnaWRib2R5KSB7XG4gICAgICAgICAgICB0aGlzLmVudGl0eS5yaWdpZGJvZHkuZGlzYWJsZVNpbXVsYXRpb24oKTtcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLl9jb21wb3VuZFBhcmVudCAmJiB0aGlzICE9PSB0aGlzLl9jb21wb3VuZFBhcmVudCkge1xuICAgICAgICAgICAgaWYgKCF0aGlzLl9jb21wb3VuZFBhcmVudC5lbnRpdHkuX2Rlc3Ryb3lpbmcpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnN5c3RlbS5fcmVtb3ZlQ29tcG91bmRDaGlsZCh0aGlzLl9jb21wb3VuZFBhcmVudCwgdGhpcy5kYXRhLnNoYXBlKTtcblxuICAgICAgICAgICAgICAgIGlmICh0aGlzLl9jb21wb3VuZFBhcmVudC5lbnRpdHkucmlnaWRib2R5KVxuICAgICAgICAgICAgICAgICAgICB0aGlzLl9jb21wb3VuZFBhcmVudC5lbnRpdHkucmlnaWRib2R5LmFjdGl2YXRlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5lbnRpdHkudHJpZ2dlcikge1xuICAgICAgICAgICAgdGhpcy5lbnRpdHkudHJpZ2dlci5kaXNhYmxlKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKiogQHByaXZhdGUgKi9cbiAgICBvbkJlZm9yZVJlbW92ZSgpIHtcbiAgICAgICAgaWYgKHRoaXMuYXNzZXQpIHtcbiAgICAgICAgICAgIHRoaXMuYXNzZXQgPSBudWxsO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLnJlbmRlckFzc2V0KSB7XG4gICAgICAgICAgICB0aGlzLnJlbmRlckFzc2V0ID0gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuZW50aXR5Lm9mZignaW5zZXJ0JywgdGhpcy5fb25JbnNlcnQsIHRoaXMpO1xuXG4gICAgICAgIHRoaXMub2ZmKCk7XG4gICAgfVxufVxuXG5leHBvcnQgeyBDb2xsaXNpb25Db21wb25lbnQgfTtcbiJdLCJuYW1lcyI6WyJfdmVjMyIsIlZlYzMiLCJfcXVhdCIsIlF1YXQiLCJDb2xsaXNpb25Db21wb25lbnQiLCJDb21wb25lbnQiLCJjb25zdHJ1Y3RvciIsInN5c3RlbSIsImVudGl0eSIsIl9jb21wb3VuZFBhcmVudCIsIl9oYXNPZmZzZXQiLCJvbiIsIl9vbkluc2VydCIsIm9uU2V0VHlwZSIsIm9uU2V0SGFsZkV4dGVudHMiLCJvblNldE9mZnNldCIsIm9uU2V0UmFkaXVzIiwib25TZXRIZWlnaHQiLCJvblNldEF4aXMiLCJvblNldEFzc2V0Iiwib25TZXRSZW5kZXJBc3NldCIsIm9uU2V0TW9kZWwiLCJvblNldFJlbmRlciIsIm5hbWUiLCJvbGRWYWx1ZSIsIm5ld1ZhbHVlIiwiY2hhbmdlVHlwZSIsInQiLCJkYXRhIiwidHlwZSIsImluaXRpYWxpemVkIiwicmVjcmVhdGVQaHlzaWNhbFNoYXBlcyIsImxpbmVhck9mZnNldCIsImVxdWFscyIsIlpFUk8iLCJhbmd1bGFyT2Zmc2V0IiwiSURFTlRJVFkiLCJhc3NldHMiLCJhcHAiLCJhc3NldCIsImdldCIsIm9mZiIsIm9uQXNzZXRSZW1vdmVkIiwiQXNzZXQiLCJpZCIsIm1vZGVsIiwib25SZW5kZXJBc3NldFJlbW92ZWQiLCJyZW5kZXJBc3NldCIsInJlbmRlciIsImltcGxlbWVudGF0aW9ucyIsIm1lc2giLCJkb1JlY3JlYXRlUGh5c2ljYWxTaGFwZSIsIl9nZXRDb21wb3VuZENoaWxkU2hhcGVJbmRleCIsInNoYXBlIiwiY29tcG91bmQiLCJzaGFwZXMiLCJnZXROdW1DaGlsZFNoYXBlcyIsImkiLCJjaGlsZFNoYXBlIiwiZ2V0Q2hpbGRTaGFwZSIsInB0ciIsInBhcmVudCIsIkFtbW8iLCJyaWdpZGJvZHkiLCJhbmNlc3RvciIsImNvbGxpc2lvbiIsIl91cGRhdGVDb21wb3VuZCIsIl9kaXJ0eVdvcmxkIiwiZGlydHkiLCJfZGlydHlMb2NhbCIsImZvckVhY2giLCJfdXBkYXRlRWFjaERlc2NlbmRhbnRUcmFuc2Zvcm0iLCJib2R5Q29tcG9uZW50IiwiYWN0aXZhdGUiLCJnZXRTaGFwZVBvc2l0aW9uIiwicG9zIiwiZ2V0UG9zaXRpb24iLCJyb3QiLCJnZXRSb3RhdGlvbiIsImxvIiwiY29weSIsInRyYW5zZm9ybVZlY3RvciIsImFkZCIsImdldFNoYXBlUm90YXRpb24iLCJtdWwiLCJvbkVuYWJsZSIsInJlc291cmNlIiwiZW5hYmxlZCIsImVuYWJsZVNpbXVsYXRpb24iLCJ0cmFuc2Zvcm0iLCJfZ2V0Tm9kZVRyYW5zZm9ybSIsImFkZENoaWxkU2hhcGUiLCJkZXN0cm95IiwidHJpZ2dlciIsImVuYWJsZSIsIm9uRGlzYWJsZSIsImRpc2FibGVTaW11bGF0aW9uIiwiX2Rlc3Ryb3lpbmciLCJfcmVtb3ZlQ29tcG91bmRDaGlsZCIsImRpc2FibGUiLCJvbkJlZm9yZVJlbW92ZSJdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFPQSxNQUFNQSxLQUFLLEdBQUcsSUFBSUMsSUFBSSxFQUFFLENBQUE7QUFDeEIsTUFBTUMsS0FBSyxHQUFHLElBQUlDLElBQUksRUFBRSxDQUFBOztBQUV4QjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNB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
