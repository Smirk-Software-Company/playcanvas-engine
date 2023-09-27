import { Quat } from '../../../core/math/quat.js';
import { Vec3 } from '../../../core/math/vec3.js';
import { BODYGROUP_STATIC, BODYMASK_NOT_STATIC, BODYTYPE_STATIC, BODYTYPE_DYNAMIC, BODYTYPE_KINEMATIC, BODYGROUP_KINEMATIC, BODYMASK_ALL, BODYGROUP_DYNAMIC, BODYFLAG_KINEMATIC_OBJECT, BODYSTATE_DISABLE_DEACTIVATION, BODYSTATE_ACTIVE_TAG, BODYSTATE_DISABLE_SIMULATION } from './constants.js';
import { Component } from '../component.js';

// Shared math variable to avoid excessive allocation
let _ammoTransform;
let _ammoVec1, _ammoVec2, _ammoQuat;
const _quat1 = new Quat();
const _quat2 = new Quat();
const _vec3 = new Vec3();

/**
 * The rigidbody component, when combined with a {@link CollisionComponent}, allows your entities
 * to be simulated using realistic physics. A rigidbody component will fall under gravity and
 * collide with other rigid bodies. Using scripts, you can apply forces and impulses to rigid
 * bodies.
 *
 * You should never need to use the RigidBodyComponent constructor. To add an RigidBodyComponent to
 * a {@link Entity}, use {@link Entity#addComponent}:
 *
 * ```javascript
 * // Create a static 1x1x1 box-shaped rigid body
 * const entity = pc.Entity();
 * entity.addComponent("rigidbody"); // Without options, this defaults to a 'static' body
 * entity.addComponent("collision"); // Without options, this defaults to a 1x1x1 box shape
 * ```
 *
 * To create a dynamic sphere with mass of 10, do:
 *
 * ```javascript
 * const entity = pc.Entity();
 * entity.addComponent("rigidbody", {
 *     type: pc.BODYTYPE_DYNAMIC,
 *     mass: 10
 * });
 * entity.addComponent("collision", {
 *     type: "sphere"
 * });
 * ```
 *
 * Relevant 'Engine-only' examples:
 *
 * - [Falling shapes](http://playcanvas.github.io/#physics/falling-shapes)
 * - [Vehicle physics](http://playcanvas.github.io/#physics/vehicle)
 *
 * @augments Component
 * @category Physics
 */
class RigidBodyComponent extends Component {
  /**
   * Create a new RigidBodyComponent instance.
   *
   * @param {import('./system.js').RigidBodyComponentSystem} system - The ComponentSystem that
   * created this component.
   * @param {import('../../entity.js').Entity} entity - The entity this component is attached to.
   */
  constructor(system, entity) {
    // eslint-disable-line no-useless-constructor
    super(system, entity);
    /** @private */
    this._angularDamping = 0;
    /** @private */
    this._angularFactor = new Vec3(1, 1, 1);
    /** @private */
    this._angularVelocity = new Vec3();
    /** @private */
    this._body = null;
    /** @private */
    this._friction = 0.5;
    /** @private */
    this._group = BODYGROUP_STATIC;
    /** @private */
    this._linearDamping = 0;
    /** @private */
    this._linearFactor = new Vec3(1, 1, 1);
    /** @private */
    this._linearVelocity = new Vec3();
    /** @private */
    this._mask = BODYMASK_NOT_STATIC;
    /** @private */
    this._mass = 1;
    /** @private */
    this._restitution = 0;
    /** @private */
    this._rollingFriction = 0;
    /** @private */
    this._simulationEnabled = false;
    /** @private */
    this._type = BODYTYPE_STATIC;
  }

  /**
   * Fired when a contact occurs between two rigid bodies.
   *
   * @event RigidBodyComponent#contact
   * @param {ContactResult} result - Details of the contact between the two rigid bodies.
   */

  /**
   * Fired when two rigid bodies start touching.
   *
   * @event RigidBodyComponent#collisionstart
   * @param {ContactResult} result - Details of the contact between the two rigid bodies.
   */

  /**
   * Fired when two rigid bodies stop touching.
   *
   * @event RigidBodyComponent#collisionend
   * @param {import('../../entity.js').Entity} other - The {@link Entity} that stopped touching this rigid body.
   */

  /**
   * Fired when a rigid body enters a trigger volume.
   *
   * @event RigidBodyComponent#triggerenter
   * @param {import('../../entity.js').Entity} other - The {@link Entity} with trigger volume that this rigid body entered.
   */

  /**
   * Fired when a rigid body exits a trigger volume.
   *
   * @event RigidBodyComponent#triggerleave
   * @param {import('../../entity.js').Entity} other - The {@link Entity} with trigger volume that this rigid body exited.
   */

  /** @ignore */
  static onLibraryLoaded() {
    // Lazily create shared variable
    if (typeof Ammo !== 'undefined') {
      _ammoTransform = new Ammo.btTransform();
      _ammoVec1 = new Ammo.btVector3();
      _ammoVec2 = new Ammo.btVector3();
      _ammoQuat = new Ammo.btQuaternion();
    }
  }

  /**
   * Controls the rate at which a body loses angular velocity over time.
   *
   * @type {number}
   */
  set angularDamping(damping) {
    if (this._angularDamping !== damping) {
      this._angularDamping = damping;
      if (this._body) {
        this._body.setDamping(this._linearDamping, damping);
      }
    }
  }
  get angularDamping() {
    return this._angularDamping;
  }

  /**
   * Scaling factor for angular movement of the body in each axis. Only valid for rigid bodies of
   * type {@link BODYTYPE_DYNAMIC}. Defaults to 1 in all axes (body can freely rotate).
   *
   * @type {Vec3}
   */
  set angularFactor(factor) {
    if (!this._angularFactor.equals(factor)) {
      this._angularFactor.copy(factor);
      if (this._body && this._type === BODYTYPE_DYNAMIC) {
        _ammoVec1.setValue(factor.x, factor.y, factor.z);
        this._body.setAngularFactor(_ammoVec1);
      }
    }
  }
  get angularFactor() {
    return this._angularFactor;
  }

  /**
   * Defines the rotational speed of the body around each world axis.
   *
   * @type {Vec3}
   */
  set angularVelocity(velocity) {
    if (this._body && this._type === BODYTYPE_DYNAMIC) {
      this._body.activate();
      _ammoVec1.setValue(velocity.x, velocity.y, velocity.z);
      this._body.setAngularVelocity(_ammoVec1);
      this._angularVelocity.copy(velocity);
    }
  }
  get angularVelocity() {
    if (this._body && this._type === BODYTYPE_DYNAMIC) {
      const velocity = this._body.getAngularVelocity();
      this._angularVelocity.set(velocity.x(), velocity.y(), velocity.z());
    }
    return this._angularVelocity;
  }
  set body(body) {
    if (this._body !== body) {
      this._body = body;
      if (body && this._simulationEnabled) {
        body.activate();
      }
    }
  }
  get body() {
    return this._body;
  }

  /**
   * The friction value used when contacts occur between two bodies. A higher value indicates
   * more friction. Should be set in the range 0 to 1. Defaults to 0.5.
   *
   * @type {number}
   */
  set friction(friction) {
    if (this._friction !== friction) {
      this._friction = friction;
      if (this._body) {
        this._body.setFriction(friction);
      }
    }
  }
  get friction() {
    return this._friction;
  }

  /**
   * The collision group this body belongs to. Combine the group and the mask to prevent bodies
   * colliding with each other. Defaults to 1.
   *
   * @type {number}
   */
  set group(group) {
    if (this._group !== group) {
      this._group = group;

      // re-enabling simulation adds rigidbody back into world with new masks
      if (this.enabled && this.entity.enabled) {
        this.disableSimulation();
        this.enableSimulation();
      }
    }
  }
  get group() {
    return this._group;
  }

  /**
   * Controls the rate at which a body loses linear velocity over time. Defaults to 0.
   *
   * @type {number}
   */
  set linearDamping(damping) {
    if (this._linearDamping !== damping) {
      this._linearDamping = damping;
      if (this._body) {
        this._body.setDamping(damping, this._angularDamping);
      }
    }
  }
  get linearDamping() {
    return this._linearDamping;
  }

  /**
   * Scaling factor for linear movement of the body in each axis. Only valid for rigid bodies of
   * type {@link BODYTYPE_DYNAMIC}. Defaults to 1 in all axes (body can freely move).
   *
   * @type {Vec3}
   */
  set linearFactor(factor) {
    if (!this._linearFactor.equals(factor)) {
      this._linearFactor.copy(factor);
      if (this._body && this._type === BODYTYPE_DYNAMIC) {
        _ammoVec1.setValue(factor.x, factor.y, factor.z);
        this._body.setLinearFactor(_ammoVec1);
      }
    }
  }
  get linearFactor() {
    return this._linearFactor;
  }

  /**
   * Defines the speed of the body in a given direction.
   *
   * @type {Vec3}
   */
  set linearVelocity(velocity) {
    if (this._body && this._type === BODYTYPE_DYNAMIC) {
      this._body.activate();
      _ammoVec1.setValue(velocity.x, velocity.y, velocity.z);
      this._body.setLinearVelocity(_ammoVec1);
      this._linearVelocity.copy(velocity);
    }
  }
  get linearVelocity() {
    if (this._body && this._type === BODYTYPE_DYNAMIC) {
      const velocity = this._body.getLinearVelocity();
      this._linearVelocity.set(velocity.x(), velocity.y(), velocity.z());
    }
    return this._linearVelocity;
  }

  /**
   * The collision mask sets which groups this body collides with. It is a bitfield of 16 bits,
   * the first 8 bits are reserved for engine use. Defaults to 65535.
   *
   * @type {number}
   */
  set mask(mask) {
    if (this._mask !== mask) {
      this._mask = mask;

      // re-enabling simulation adds rigidbody back into world with new masks
      if (this.enabled && this.entity.enabled) {
        this.disableSimulation();
        this.enableSimulation();
      }
    }
  }
  get mask() {
    return this._mask;
  }

  /**
   * The mass of the body. This is only relevant for {@link BODYTYPE_DYNAMIC} bodies, other types
   * have infinite mass. Defaults to 1.
   *
   * @type {number}
   */
  set mass(mass) {
    if (this._mass !== mass) {
      this._mass = mass;
      if (this._body && this._type === BODYTYPE_DYNAMIC) {
        const enabled = this.enabled && this.entity.enabled;
        if (enabled) {
          this.disableSimulation();
        }

        // calculateLocalInertia writes local inertia to ammoVec1 here...
        this._body.getCollisionShape().calculateLocalInertia(mass, _ammoVec1);
        // ...and then writes the calculated local inertia to the body
        this._body.setMassProps(mass, _ammoVec1);
        this._body.updateInertiaTensor();
        if (enabled) {
          this.enableSimulation();
        }
      }
    }
  }
  get mass() {
    return this._mass;
  }

  /**
   * Influences the amount of energy lost when two rigid bodies collide. The calculation
   * multiplies the restitution values for both colliding bodies. A multiplied value of 0 means
   * that all energy is lost in the collision while a value of 1 means that no energy is lost.
   * Should be set in the range 0 to 1. Defaults to 0.
   *
   * @type {number}
   */
  set restitution(restitution) {
    if (this._restitution !== restitution) {
      this._restitution = restitution;
      if (this._body) {
        this._body.setRestitution(restitution);
      }
    }
  }
  get restitution() {
    return this._restitution;
  }

  /**
   * Sets a torsional friction orthogonal to the contact point. Defaults to 0.
   *
   * @type {number}
   */
  set rollingFriction(friction) {
    if (this._rollingFriction !== friction) {
      this._rollingFriction = friction;
      if (this._body) {
        this._body.setRollingFriction(friction);
      }
    }
  }
  get rollingFriction() {
    return this._rollingFriction;
  }

  /**
   * The rigid body type determines how the body is simulated. Can be:
   *
   * - {@link BODYTYPE_STATIC}: infinite mass and cannot move.
   * - {@link BODYTYPE_DYNAMIC}: simulated according to applied forces.
   * - {@link BODYTYPE_KINEMATIC}: infinite mass and does not respond to forces (can only be
   * moved by setting the position and rotation of component's {@link Entity}).
   *
   * Defaults to {@link BODYTYPE_STATIC}.
   *
   * @type {string}
   */
  set type(type) {
    if (this._type !== type) {
      this._type = type;
      this.disableSimulation();

      // set group and mask to defaults for type
      switch (type) {
        case BODYTYPE_DYNAMIC:
          this._group = BODYGROUP_DYNAMIC;
          this._mask = BODYMASK_ALL;
          break;
        case BODYTYPE_KINEMATIC:
          this._group = BODYGROUP_KINEMATIC;
          this._mask = BODYMASK_ALL;
          break;
        case BODYTYPE_STATIC:
        default:
          this._group = BODYGROUP_STATIC;
          this._mask = BODYMASK_NOT_STATIC;
          break;
      }

      // Create a new body
      this.createBody();
    }
  }
  get type() {
    return this._type;
  }

  /**
   * If the Entity has a Collision shape attached then create a rigid body using this shape. This
   * method destroys the existing body.
   *
   * @private
   */
  createBody() {
    const entity = this.entity;
    let shape;
    if (entity.collision) {
      shape = entity.collision.shape;

      // if a trigger was already created from the collision system
      // destroy it
      if (entity.trigger) {
        entity.trigger.destroy();
        delete entity.trigger;
      }
    }
    if (shape) {
      if (this._body) this.system.onRemove(entity, this);
      const mass = this._type === BODYTYPE_DYNAMIC ? this._mass : 0;
      this._getEntityTransform(_ammoTransform);
      const body = this.system.createBody(mass, shape, _ammoTransform);
      body.setRestitution(this._restitution);
      body.setFriction(this._friction);
      body.setRollingFriction(this._rollingFriction);
      body.setDamping(this._linearDamping, this._angularDamping);
      if (this._type === BODYTYPE_DYNAMIC) {
        const linearFactor = this._linearFactor;
        _ammoVec1.setValue(linearFactor.x, linearFactor.y, linearFactor.z);
        body.setLinearFactor(_ammoVec1);
        const angularFactor = this._angularFactor;
        _ammoVec1.setValue(angularFactor.x, angularFactor.y, angularFactor.z);
        body.setAngularFactor(_ammoVec1);
      } else if (this._type === BODYTYPE_KINEMATIC) {
        body.setCollisionFlags(body.getCollisionFlags() | BODYFLAG_KINEMATIC_OBJECT);
        body.setActivationState(BODYSTATE_DISABLE_DEACTIVATION);
      }
      body.entity = entity;
      this.body = body;
      if (this.enabled && entity.enabled) {
        this.enableSimulation();
      }
    }
  }

  /**
   * Returns true if the rigid body is currently actively being simulated. I.e. Not 'sleeping'.
   *
   * @returns {boolean} True if the body is active.
   */
  isActive() {
    return this._body ? this._body.isActive() : false;
  }

  /**
   * Forcibly activate the rigid body simulation. Only affects rigid bodies of type
   * {@link BODYTYPE_DYNAMIC}.
   */
  activate() {
    if (this._body) {
      this._body.activate();
    }
  }

  /**
   * Add a body to the simulation.
   *
   * @ignore
   */
  enableSimulation() {
    const entity = this.entity;
    if (entity.collision && entity.collision.enabled && !this._simulationEnabled) {
      const body = this._body;
      if (body) {
        this.system.addBody(body, this._group, this._mask);
        switch (this._type) {
          case BODYTYPE_DYNAMIC:
            this.system._dynamic.push(this);
            body.forceActivationState(BODYSTATE_ACTIVE_TAG);
            this.syncEntityToBody();
            break;
          case BODYTYPE_KINEMATIC:
            this.system._kinematic.push(this);
            body.forceActivationState(BODYSTATE_DISABLE_DEACTIVATION);
            break;
          case BODYTYPE_STATIC:
            body.forceActivationState(BODYSTATE_ACTIVE_TAG);
            this.syncEntityToBody();
            break;
        }
        if (entity.collision.type === 'compound') {
          this.system._compounds.push(entity.collision);
        }
        body.activate();
        this._simulationEnabled = true;
      }
    }
  }

  /**
   * Remove a body from the simulation.
   *
   * @ignore
   */
  disableSimulation() {
    const body = this._body;
    if (body && this._simulationEnabled) {
      const system = this.system;
      let idx = system._compounds.indexOf(this.entity.collision);
      if (idx > -1) {
        system._compounds.splice(idx, 1);
      }
      idx = system._dynamic.indexOf(this);
      if (idx > -1) {
        system._dynamic.splice(idx, 1);
      }
      idx = system._kinematic.indexOf(this);
      if (idx > -1) {
        system._kinematic.splice(idx, 1);
      }
      system.removeBody(body);

      // set activation state to disable simulation to avoid body.isActive() to return
      // true even if it's not in the dynamics world
      body.forceActivationState(BODYSTATE_DISABLE_SIMULATION);
      this._simulationEnabled = false;
    }
  }

  /**
   * Apply an force to the body at a point. By default, the force is applied at the origin of the
   * body. However, the force can be applied at an offset this point by specifying a world space
   * vector from the body's origin to the point of application. This function has two valid
   * signatures. You can either specify the force (and optional relative point) via 3D-vector or
   * numbers.
   *
   * @param {Vec3|number} x - A 3-dimensional vector representing the force in world-space or
   * the x-component of the force in world-space.
   * @param {Vec3|number} [y] - An optional 3-dimensional vector representing the relative point
   * at which to apply the impulse in world-space or the y-component of the force in world-space.
   * @param {number} [z] - The z-component of the force in world-space.
   * @param {number} [px] - The x-component of a world-space offset from the body's position
   * where the force is applied.
   * @param {number} [py] - The y-component of a world-space offset from the body's position
   * where the force is applied.
   * @param {number} [pz] - The z-component of a world-space offset from the body's position
   * where the force is applied.
   * @example
   * // Apply an approximation of gravity at the body's center
   * this.entity.rigidbody.applyForce(0, -10, 0);
   * @example
   * // Apply an approximation of gravity at 1 unit down the world Z from the center of the body
   * this.entity.rigidbody.applyForce(0, -10, 0, 0, 0, 1);
   * @example
   * // Apply a force at the body's center
   * // Calculate a force vector pointing in the world space direction of the entity
   * const force = this.entity.forward.clone().mulScalar(100);
   *
   * // Apply the force
   * this.entity.rigidbody.applyForce(force);
   * @example
   * // Apply a force at some relative offset from the body's center
   * // Calculate a force vector pointing in the world space direction of the entity
   * const force = this.entity.forward.clone().mulScalar(100);
   *
   * // Calculate the world space relative offset
   * const relativePos = new pc.Vec3();
   * const childEntity = this.entity.findByName('Engine');
   * relativePos.sub2(childEntity.getPosition(), this.entity.getPosition());
   *
   * // Apply the force
   * this.entity.rigidbody.applyForce(force, relativePos);
   */
  applyForce(x, y, z, px, py, pz) {
    const body = this._body;
    if (body) {
      body.activate();
      if (x instanceof Vec3) {
        _ammoVec1.setValue(x.x, x.y, x.z);
      } else {
        _ammoVec1.setValue(x, y, z);
      }
      if (y instanceof Vec3) {
        _ammoVec2.setValue(y.x, y.y, y.z);
      } else if (px !== undefined) {
        _ammoVec2.setValue(px, py, pz);
      } else {
        _ammoVec2.setValue(0, 0, 0);
      }
      body.applyForce(_ammoVec1, _ammoVec2);
    }
  }

  /**
   * Apply torque (rotational force) to the body. This function has two valid signatures. You can
   * either specify the torque force with a 3D-vector or with 3 numbers.
   *
   * @param {Vec3|number} x - A 3-dimensional vector representing the torque force in world-space
   * or the x-component of the torque force in world-space.
   * @param {number} [y] - The y-component of the torque force in world-space.
   * @param {number} [z] - The z-component of the torque force in world-space.
   * @example
   * // Apply via vector
   * const torque = new pc.Vec3(0, 10, 0);
   * entity.rigidbody.applyTorque(torque);
   * @example
   * // Apply via numbers
   * entity.rigidbody.applyTorque(0, 10, 0);
   */
  applyTorque(x, y, z) {
    const body = this._body;
    if (body) {
      body.activate();
      if (x instanceof Vec3) {
        _ammoVec1.setValue(x.x, x.y, x.z);
      } else {
        _ammoVec1.setValue(x, y, z);
      }
      body.applyTorque(_ammoVec1);
    }
  }

  /**
   * Apply an impulse (instantaneous change of velocity) to the body at a point. This function
   * has two valid signatures. You can either specify the impulse (and optional relative point)
   * via 3D-vector or numbers.
   *
   * @param {Vec3|number} x - A 3-dimensional vector representing the impulse in world-space or
   * the x-component of the impulse in world-space.
   * @param {Vec3|number} [y] - An optional 3-dimensional vector representing the relative point
   * at which to apply the impulse in the local-space of the entity or the y-component of the
   * impulse to apply in world-space.
   * @param {number} [z] - The z-component of the impulse to apply in world-space.
   * @param {number} [px] - The x-component of the point at which to apply the impulse in the
   * local-space of the entity.
   * @param {number} [py] - The y-component of the point at which to apply the impulse in the
   * local-space of the entity.
   * @param {number} [pz] - The z-component of the point at which to apply the impulse in the
   * local-space of the entity.
   * @example
   * // Apply an impulse along the world-space positive y-axis at the entity's position.
   * const impulse = new pc.Vec3(0, 10, 0);
   * entity.rigidbody.applyImpulse(impulse);
   * @example
   * // Apply an impulse along the world-space positive y-axis at 1 unit down the positive
   * // z-axis of the entity's local-space.
   * const impulse = new pc.Vec3(0, 10, 0);
   * const relativePoint = new pc.Vec3(0, 0, 1);
   * entity.rigidbody.applyImpulse(impulse, relativePoint);
   * @example
   * // Apply an impulse along the world-space positive y-axis at the entity's position.
   * entity.rigidbody.applyImpulse(0, 10, 0);
   * @example
   * // Apply an impulse along the world-space positive y-axis at 1 unit down the positive
   * // z-axis of the entity's local-space.
   * entity.rigidbody.applyImpulse(0, 10, 0, 0, 0, 1);
   */
  applyImpulse(x, y, z, px, py, pz) {
    const body = this._body;
    if (body) {
      body.activate();
      if (x instanceof Vec3) {
        _ammoVec1.setValue(x.x, x.y, x.z);
      } else {
        _ammoVec1.setValue(x, y, z);
      }
      if (y instanceof Vec3) {
        _ammoVec2.setValue(y.x, y.y, y.z);
      } else if (px !== undefined) {
        _ammoVec2.setValue(px, py, pz);
      } else {
        _ammoVec2.setValue(0, 0, 0);
      }
      body.applyImpulse(_ammoVec1, _ammoVec2);
    }
  }

  /**
   * Apply a torque impulse (rotational force applied instantaneously) to the body. This function
   * has two valid signatures. You can either specify the torque force with a 3D-vector or with 3
   * numbers.
   *
   * @param {Vec3|number} x - A 3-dimensional vector representing the torque impulse in
   * world-space or the x-component of the torque impulse in world-space.
   * @param {number} [y] - The y-component of the torque impulse in world-space.
   * @param {number} [z] - The z-component of the torque impulse in world-space.
   * @example
   * // Apply via vector
   * const torque = new pc.Vec3(0, 10, 0);
   * entity.rigidbody.applyTorqueImpulse(torque);
   * @example
   * // Apply via numbers
   * entity.rigidbody.applyTorqueImpulse(0, 10, 0);
   */
  applyTorqueImpulse(x, y, z) {
    const body = this._body;
    if (body) {
      body.activate();
      if (x instanceof Vec3) {
        _ammoVec1.setValue(x.x, x.y, x.z);
      } else {
        _ammoVec1.setValue(x, y, z);
      }
      body.applyTorqueImpulse(_ammoVec1);
    }
  }

  /**
   * Returns true if the rigid body is of type {@link BODYTYPE_STATIC}.
   *
   * @returns {boolean} True if static.
   */
  isStatic() {
    return this._type === BODYTYPE_STATIC;
  }

  /**
   * Returns true if the rigid body is of type {@link BODYTYPE_STATIC} or {@link BODYTYPE_KINEMATIC}.
   *
   * @returns {boolean} True if static or kinematic.
   */
  isStaticOrKinematic() {
    return this._type === BODYTYPE_STATIC || this._type === BODYTYPE_KINEMATIC;
  }

  /**
   * Returns true if the rigid body is of type {@link BODYTYPE_KINEMATIC}.
   *
   * @returns {boolean} True if kinematic.
   */
  isKinematic() {
    return this._type === BODYTYPE_KINEMATIC;
  }

  /**
   * Writes an entity transform into an Ammo.btTransform but ignoring scale.
   *
   * @param {object} transform - The ammo transform to write the entity transform to.
   * @private
   */
  _getEntityTransform(transform) {
    const entity = this.entity;
    const component = entity.collision;
    if (component) {
      const bodyPos = component.getShapePosition();
      const bodyRot = component.getShapeRotation();
      _ammoVec1.setValue(bodyPos.x, bodyPos.y, bodyPos.z);
      _ammoQuat.setValue(bodyRot.x, bodyRot.y, bodyRot.z, bodyRot.w);
    } else {
      const pos = entity.getPosition();
      const rot = entity.getRotation();
      _ammoVec1.setValue(pos.x, pos.y, pos.z);
      _ammoQuat.setValue(rot.x, rot.y, rot.z, rot.w);
    }
    transform.setOrigin(_ammoVec1);
    transform.setRotation(_ammoQuat);
  }

  /**
   * Set the rigid body transform to be the same as the Entity transform. This must be called
   * after any Entity transformation functions (e.g. {@link Entity#setPosition}) are called in
   * order to update the rigid body to match the Entity.
   *
   * @private
   */
  syncEntityToBody() {
    const body = this._body;
    if (body) {
      this._getEntityTransform(_ammoTransform);
      body.setWorldTransform(_ammoTransform);
      if (this._type === BODYTYPE_KINEMATIC) {
        const motionState = body.getMotionState();
        if (motionState) {
          motionState.setWorldTransform(_ammoTransform);
        }
      }
      body.activate();
    }
  }

  /**
   * Sets an entity's transform to match that of the world transformation matrix of a dynamic
   * rigid body's motion state.
   *
   * @private
   */
  _updateDynamic() {
    const body = this._body;

    // If a dynamic body is frozen, we can assume its motion state transform is
    // the same is the entity world transform
    if (body.isActive()) {
      // Update the motion state. Note that the test for the presence of the motion
      // state is technically redundant since the engine creates one for all bodies.
      const motionState = body.getMotionState();
      if (motionState) {
        const entity = this.entity;
        motionState.getWorldTransform(_ammoTransform);
        const p = _ammoTransform.getOrigin();
        const q = _ammoTransform.getRotation();
        const component = entity.collision;
        if (component && component._hasOffset) {
          const lo = component.data.linearOffset;
          const ao = component.data.angularOffset;

          // Un-rotate the angular offset and then use the new rotation to
          // un-translate the linear offset in local space
          // Order of operations matter here
          const invertedAo = _quat2.copy(ao).invert();
          const entityRot = _quat1.set(q.x(), q.y(), q.z(), q.w()).mul(invertedAo);
          entityRot.transformVector(lo, _vec3);
          entity.setPosition(p.x() - _vec3.x, p.y() - _vec3.y, p.z() - _vec3.z);
          entity.setRotation(entityRot);
        } else {
          entity.setPosition(p.x(), p.y(), p.z());
          entity.setRotation(q.x(), q.y(), q.z(), q.w());
        }
      }
    }
  }

  /**
   * Writes the entity's world transformation matrix into the motion state of a kinematic body.
   *
   * @private
   */
  _updateKinematic() {
    const motionState = this._body.getMotionState();
    if (motionState) {
      this._getEntityTransform(_ammoTransform);
      motionState.setWorldTransform(_ammoTransform);
    }
  }

  /**
   * Teleport an entity to a new world-space position, optionally setting orientation. This
   * function should only be called for rigid bodies that are dynamic. This function has three
   * valid signatures. The first takes a 3-dimensional vector for the position and an optional
   * 3-dimensional vector for Euler rotation. The second takes a 3-dimensional vector for the
   * position and an optional quaternion for rotation. The third takes 3 numbers for the position
   * and an optional 3 numbers for Euler rotation.
   *
   * @param {Vec3|number} x - A 3-dimensional vector holding the new position or the new position
   * x-coordinate.
   * @param {Quat|Vec3|number} [y] - A 3-dimensional vector or quaternion holding the new
   * rotation or the new position y-coordinate.
   * @param {number} [z] - The new position z-coordinate.
   * @param {number} [rx] - The new Euler x-angle value.
   * @param {number} [ry] - The new Euler y-angle value.
   * @param {number} [rz] - The new Euler z-angle value.
   * @example
   * // Teleport the entity to the origin
   * entity.rigidbody.teleport(pc.Vec3.ZERO);
   * @example
   * // Teleport the entity to the origin
   * entity.rigidbody.teleport(0, 0, 0);
   * @example
   * // Teleport the entity to world-space coordinate [1, 2, 3] and reset orientation
   * const position = new pc.Vec3(1, 2, 3);
   * entity.rigidbody.teleport(position, pc.Vec3.ZERO);
   * @example
   * // Teleport the entity to world-space coordinate [1, 2, 3] and reset orientation
   * entity.rigidbody.teleport(1, 2, 3, 0, 0, 0);
   */
  teleport(x, y, z, rx, ry, rz) {
    if (x instanceof Vec3) {
      this.entity.setPosition(x);
    } else {
      this.entity.setPosition(x, y, z);
    }
    if (y instanceof Quat) {
      this.entity.setRotation(y);
    } else if (y instanceof Vec3) {
      this.entity.setEulerAngles(y);
    } else if (rx !== undefined) {
      this.entity.setEulerAngles(rx, ry, rz);
    }
    this.syncEntityToBody();
  }

  /** @ignore */
  onEnable() {
    if (!this._body) {
      this.createBody();
    }
    this.enableSimulation();
  }

  /** @ignore */
  onDisable() {
    this.disableSimulation();
  }
}

export { RigidBodyComponent };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tcG9uZW50LmpzIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi9zcmMvZnJhbWV3b3JrL2NvbXBvbmVudHMvcmlnaWQtYm9keS9jb21wb25lbnQuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgUXVhdCB9IGZyb20gJy4uLy4uLy4uL2NvcmUvbWF0aC9xdWF0LmpzJztcbmltcG9ydCB7IFZlYzMgfSBmcm9tICcuLi8uLi8uLi9jb3JlL21hdGgvdmVjMy5qcyc7XG5cbmltcG9ydCB7XG4gICAgQk9EWUZMQUdfS0lORU1BVElDX09CSkVDVCwgQk9EWVRZUEVfU1RBVElDLFxuICAgIEJPRFlHUk9VUF9EWU5BTUlDLCBCT0RZR1JPVVBfS0lORU1BVElDLCBCT0RZR1JPVVBfU1RBVElDLFxuICAgIEJPRFlNQVNLX0FMTCwgQk9EWU1BU0tfTk9UX1NUQVRJQyxcbiAgICBCT0RZU1RBVEVfQUNUSVZFX1RBRywgQk9EWVNUQVRFX0RJU0FCTEVfREVBQ1RJVkFUSU9OLCBCT0RZU1RBVEVfRElTQUJMRV9TSU1VTEFUSU9OLFxuICAgIEJPRFlUWVBFX0RZTkFNSUMsIEJPRFlUWVBFX0tJTkVNQVRJQ1xufSBmcm9tICcuL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBDb21wb25lbnQgfSBmcm9tICcuLi9jb21wb25lbnQuanMnO1xuXG4vLyBTaGFyZWQgbWF0aCB2YXJpYWJsZSB0byBhdm9pZCBleGNlc3NpdmUgYWxsb2NhdGlvblxubGV0IF9hbW1vVHJhbnNmb3JtO1xubGV0IF9hbW1vVmVjMSwgX2FtbW9WZWMyLCBfYW1tb1F1YXQ7XG5jb25zdCBfcXVhdDEgPSBuZXcgUXVhdCgpO1xuY29uc3QgX3F1YXQyID0gbmV3IFF1YXQoKTtcbmNvbnN0IF92ZWMzID0gbmV3IFZlYzMoKTtcblxuLyoqXG4gKiBUaGUgcmlnaWRib2R5IGNvbXBvbmVudCwgd2hlbiBjb21iaW5lZCB3aXRoIGEge0BsaW5rIENvbGxpc2lvbkNvbXBvbmVudH0sIGFsbG93cyB5b3VyIGVudGl0aWVzXG4gKiB0byBiZSBzaW11bGF0ZWQgdXNpbmcgcmVhbGlzdGljIHBoeXNpY3MuIEEgcmlnaWRib2R5IGNvbXBvbmVudCB3aWxsIGZhbGwgdW5kZXIgZ3Jhdml0eSBhbmRcbiAqIGNvbGxpZGUgd2l0aCBvdGhlciByaWdpZCBib2RpZXMuIFVzaW5nIHNjcmlwdHMsIHlvdSBjYW4gYXBwbHkgZm9yY2VzIGFuZCBpbXB1bHNlcyB0byByaWdpZFxuICogYm9kaWVzLlxuICpcbiAqIFlvdSBzaG91bGQgbmV2ZXIgbmVlZCB0byB1c2UgdGhlIFJpZ2lkQm9keUNvbXBvbmVudCBjb25zdHJ1Y3Rvci4gVG8gYWRkIGFuIFJpZ2lkQm9keUNvbXBvbmVudCB0b1xuICogYSB7QGxpbmsgRW50aXR5fSwgdXNlIHtAbGluayBFbnRpdHkjYWRkQ29tcG9uZW50fTpcbiAqXG4gKiBgYGBqYXZhc2NyaXB0XG4gKiAvLyBDcmVhdGUgYSBzdGF0aWMgMXgxeDEgYm94LXNoYXBlZCByaWdpZCBib2R5XG4gKiBjb25zdCBlbnRpdHkgPSBwYy5FbnRpdHkoKTtcbiAqIGVudGl0eS5hZGRDb21wb25lbnQoXCJyaWdpZGJvZHlcIik7IC8vIFdpdGhvdXQgb3B0aW9ucywgdGhpcyBkZWZhdWx0cyB0byBhICdzdGF0aWMnIGJvZHlcbiAqIGVudGl0eS5hZGRDb21wb25lbnQoXCJjb2xsaXNpb25cIik7IC8vIFdpdGhvdXQgb3B0aW9ucywgdGhpcyBkZWZhdWx0cyB0byBhIDF4MXgxIGJveCBzaGFwZVxuICogYGBgXG4gKlxuICogVG8gY3JlYXRlIGEgZHluYW1pYyBzcGhlcmUgd2l0aCBtYXNzIG9mIDEwLCBkbzpcbiAqXG4gKiBgYGBqYXZhc2NyaXB0XG4gKiBjb25zdCBlbnRpdHkgPSBwYy5FbnRpdHkoKTtcbiAqIGVudGl0eS5hZGRDb21wb25lbnQoXCJyaWdpZGJvZHlcIiwge1xuICogICAgIHR5cGU6IHBjLkJPRFlUWVBFX0RZTkFNSUMsXG4gKiAgICAgbWFzczogMTBcbiAqIH0pO1xuICogZW50aXR5LmFkZENvbXBvbmVudChcImNvbGxpc2lvblwiLCB7XG4gKiAgICAgdHlwZTogXCJzcGhlcmVcIlxuICogfSk7XG4gKiBgYGBcbiAqXG4gKiBSZWxldmFudCAnRW5naW5lLW9ubHknIGV4YW1wbGVzOlxuICpcbiAqIC0gW0ZhbGxpbmcgc2hhcGVzXShodHRwOi8vcGxheWNhbnZhcy5naXRodWIuaW8vI3BoeXNpY3MvZmFsbGluZy1zaGFwZXMpXG4gKiAtIFtWZWhpY2xlIHBoeXNpY3NdKGh0dHA6Ly9wbGF5Y2FudmFzLmdpdGh1Yi5pby8jcGh5c2ljcy92ZWhpY2xlKVxuICpcbiAqIEBhdWdtZW50cyBDb21wb25lbnRcbiAqIEBjYXRlZ29yeSBQaHlzaWNzXG4gKi9cbmNsYXNzIFJpZ2lkQm9keUNvbXBvbmVudCBleHRlbmRzIENvbXBvbmVudCB7XG4gICAgLyoqIEBwcml2YXRlICovXG4gICAgX2FuZ3VsYXJEYW1waW5nID0gMDtcblxuICAgIC8qKiBAcHJpdmF0ZSAqL1xuICAgIF9hbmd1bGFyRmFjdG9yID0gbmV3IFZlYzMoMSwgMSwgMSk7XG5cbiAgICAvKiogQHByaXZhdGUgKi9cbiAgICBfYW5ndWxhclZlbG9jaXR5ID0gbmV3IFZlYzMoKTtcblxuICAgIC8qKiBAcHJpdmF0ZSAqL1xuICAgIF9ib2R5ID0gbnVsbDtcblxuICAgIC8qKiBAcHJpdmF0ZSAqL1xuICAgIF9mcmljdGlvbiA9IDAuNTtcblxuICAgIC8qKiBAcHJpdmF0ZSAqL1xuICAgIF9ncm91cCA9IEJPRFlHUk9VUF9TVEFUSUM7XG5cbiAgICAvKiogQHByaXZhdGUgKi9cbiAgICBfbGluZWFyRGFtcGluZyA9IDA7XG5cbiAgICAvKiogQHByaXZhdGUgKi9cbiAgICBfbGluZWFyRmFjdG9yID0gbmV3IFZlYzMoMSwgMSwgMSk7XG5cbiAgICAvKiogQHByaXZhdGUgKi9cbiAgICBfbGluZWFyVmVsb2NpdHkgPSBuZXcgVmVjMygpO1xuXG4gICAgLyoqIEBwcml2YXRlICovXG4gICAgX21hc2sgPSBCT0RZTUFTS19OT1RfU1RBVElDO1xuXG4gICAgLyoqIEBwcml2YXRlICovXG4gICAgX21hc3MgPSAxO1xuXG4gICAgLyoqIEBwcml2YXRlICovXG4gICAgX3Jlc3RpdHV0aW9uID0gMDtcblxuICAgIC8qKiBAcHJpdmF0ZSAqL1xuICAgIF9yb2xsaW5nRnJpY3Rpb24gPSAwO1xuXG4gICAgLyoqIEBwcml2YXRlICovXG4gICAgX3NpbXVsYXRpb25FbmFibGVkID0gZmFsc2U7XG5cbiAgICAvKiogQHByaXZhdGUgKi9cbiAgICBfdHlwZSA9IEJPRFlUWVBFX1NUQVRJQztcblxuICAgIC8qKlxuICAgICAqIENyZWF0ZSBhIG5ldyBSaWdpZEJvZHlDb21wb25lbnQgaW5zdGFuY2UuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi9zeXN0ZW0uanMnKS5SaWdpZEJvZHlDb21wb25lbnRTeXN0ZW19IHN5c3RlbSAtIFRoZSBDb21wb25lbnRTeXN0ZW0gdGhhdFxuICAgICAqIGNyZWF0ZWQgdGhpcyBjb21wb25lbnQuXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4uLy4uL2VudGl0eS5qcycpLkVudGl0eX0gZW50aXR5IC0gVGhlIGVudGl0eSB0aGlzIGNvbXBvbmVudCBpcyBhdHRhY2hlZCB0by5cbiAgICAgKi9cbiAgICBjb25zdHJ1Y3RvcihzeXN0ZW0sIGVudGl0eSkgeyAvLyBlc2xpbnQtZGlzYWJsZS1saW5lIG5vLXVzZWxlc3MtY29uc3RydWN0b3JcbiAgICAgICAgc3VwZXIoc3lzdGVtLCBlbnRpdHkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEZpcmVkIHdoZW4gYSBjb250YWN0IG9jY3VycyBiZXR3ZWVuIHR3byByaWdpZCBib2RpZXMuXG4gICAgICpcbiAgICAgKiBAZXZlbnQgUmlnaWRCb2R5Q29tcG9uZW50I2NvbnRhY3RcbiAgICAgKiBAcGFyYW0ge0NvbnRhY3RSZXN1bHR9IHJlc3VsdCAtIERldGFpbHMgb2YgdGhlIGNvbnRhY3QgYmV0d2VlbiB0aGUgdHdvIHJpZ2lkIGJvZGllcy5cbiAgICAgKi9cblxuICAgIC8qKlxuICAgICAqIEZpcmVkIHdoZW4gdHdvIHJpZ2lkIGJvZGllcyBzdGFydCB0b3VjaGluZy5cbiAgICAgKlxuICAgICAqIEBldmVudCBSaWdpZEJvZHlDb21wb25lbnQjY29sbGlzaW9uc3RhcnRcbiAgICAgKiBAcGFyYW0ge0NvbnRhY3RSZXN1bHR9IHJlc3VsdCAtIERldGFpbHMgb2YgdGhlIGNvbnRhY3QgYmV0d2VlbiB0aGUgdHdvIHJpZ2lkIGJvZGllcy5cbiAgICAgKi9cblxuICAgIC8qKlxuICAgICAqIEZpcmVkIHdoZW4gdHdvIHJpZ2lkIGJvZGllcyBzdG9wIHRvdWNoaW5nLlxuICAgICAqXG4gICAgICogQGV2ZW50IFJpZ2lkQm9keUNvbXBvbmVudCNjb2xsaXNpb25lbmRcbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi4vLi4vZW50aXR5LmpzJykuRW50aXR5fSBvdGhlciAtIFRoZSB7QGxpbmsgRW50aXR5fSB0aGF0IHN0b3BwZWQgdG91Y2hpbmcgdGhpcyByaWdpZCBib2R5LlxuICAgICAqL1xuXG4gICAgLyoqXG4gICAgICogRmlyZWQgd2hlbiBhIHJpZ2lkIGJvZHkgZW50ZXJzIGEgdHJpZ2dlciB2b2x1bWUuXG4gICAgICpcbiAgICAgKiBAZXZlbnQgUmlnaWRCb2R5Q29tcG9uZW50I3RyaWdnZXJlbnRlclxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuLi8uLi9lbnRpdHkuanMnKS5FbnRpdHl9IG90aGVyIC0gVGhlIHtAbGluayBFbnRpdHl9IHdpdGggdHJpZ2dlciB2b2x1bWUgdGhhdCB0aGlzIHJpZ2lkIGJvZHkgZW50ZXJlZC5cbiAgICAgKi9cblxuICAgIC8qKlxuICAgICAqIEZpcmVkIHdoZW4gYSByaWdpZCBib2R5IGV4aXRzIGEgdHJpZ2dlciB2b2x1bWUuXG4gICAgICpcbiAgICAgKiBAZXZlbnQgUmlnaWRCb2R5Q29tcG9uZW50I3RyaWdnZXJsZWF2ZVxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuLi8uLi9lbnRpdHkuanMnKS5FbnRpdHl9IG90aGVyIC0gVGhlIHtAbGluayBFbnRpdHl9IHdpdGggdHJpZ2dlciB2b2x1bWUgdGhhdCB0aGlzIHJpZ2lkIGJvZHkgZXhpdGVkLlxuICAgICAqL1xuXG4gICAgLyoqIEBpZ25vcmUgKi9cbiAgICBzdGF0aWMgb25MaWJyYXJ5TG9hZGVkKCkge1xuICAgICAgICAvLyBMYXppbHkgY3JlYXRlIHNoYXJlZCB2YXJpYWJsZVxuICAgICAgICBpZiAodHlwZW9mIEFtbW8gIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICBfYW1tb1RyYW5zZm9ybSA9IG5ldyBBbW1vLmJ0VHJhbnNmb3JtKCk7XG4gICAgICAgICAgICBfYW1tb1ZlYzEgPSBuZXcgQW1tby5idFZlY3RvcjMoKTtcbiAgICAgICAgICAgIF9hbW1vVmVjMiA9IG5ldyBBbW1vLmJ0VmVjdG9yMygpO1xuICAgICAgICAgICAgX2FtbW9RdWF0ID0gbmV3IEFtbW8uYnRRdWF0ZXJuaW9uKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDb250cm9scyB0aGUgcmF0ZSBhdCB3aGljaCBhIGJvZHkgbG9zZXMgYW5ndWxhciB2ZWxvY2l0eSBvdmVyIHRpbWUuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqL1xuICAgIHNldCBhbmd1bGFyRGFtcGluZyhkYW1waW5nKSB7XG4gICAgICAgIGlmICh0aGlzLl9hbmd1bGFyRGFtcGluZyAhPT0gZGFtcGluZykge1xuICAgICAgICAgICAgdGhpcy5fYW5ndWxhckRhbXBpbmcgPSBkYW1waW5nO1xuXG4gICAgICAgICAgICBpZiAodGhpcy5fYm9keSkge1xuICAgICAgICAgICAgICAgIHRoaXMuX2JvZHkuc2V0RGFtcGluZyh0aGlzLl9saW5lYXJEYW1waW5nLCBkYW1waW5nKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGdldCBhbmd1bGFyRGFtcGluZygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FuZ3VsYXJEYW1waW5nO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNjYWxpbmcgZmFjdG9yIGZvciBhbmd1bGFyIG1vdmVtZW50IG9mIHRoZSBib2R5IGluIGVhY2ggYXhpcy4gT25seSB2YWxpZCBmb3IgcmlnaWQgYm9kaWVzIG9mXG4gICAgICogdHlwZSB7QGxpbmsgQk9EWVRZUEVfRFlOQU1JQ30uIERlZmF1bHRzIHRvIDEgaW4gYWxsIGF4ZXMgKGJvZHkgY2FuIGZyZWVseSByb3RhdGUpLlxuICAgICAqXG4gICAgICogQHR5cGUge1ZlYzN9XG4gICAgICovXG4gICAgc2V0IGFuZ3VsYXJGYWN0b3IoZmFjdG9yKSB7XG4gICAgICAgIGlmICghdGhpcy5fYW5ndWxhckZhY3Rvci5lcXVhbHMoZmFjdG9yKSkge1xuICAgICAgICAgICAgdGhpcy5fYW5ndWxhckZhY3Rvci5jb3B5KGZhY3Rvcik7XG5cbiAgICAgICAgICAgIGlmICh0aGlzLl9ib2R5ICYmIHRoaXMuX3R5cGUgPT09IEJPRFlUWVBFX0RZTkFNSUMpIHtcbiAgICAgICAgICAgICAgICBfYW1tb1ZlYzEuc2V0VmFsdWUoZmFjdG9yLngsIGZhY3Rvci55LCBmYWN0b3Iueik7XG4gICAgICAgICAgICAgICAgdGhpcy5fYm9keS5zZXRBbmd1bGFyRmFjdG9yKF9hbW1vVmVjMSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBnZXQgYW5ndWxhckZhY3RvcigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FuZ3VsYXJGYWN0b3I7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRGVmaW5lcyB0aGUgcm90YXRpb25hbCBzcGVlZCBvZiB0aGUgYm9keSBhcm91bmQgZWFjaCB3b3JsZCBheGlzLlxuICAgICAqXG4gICAgICogQHR5cGUge1ZlYzN9XG4gICAgICovXG4gICAgc2V0IGFuZ3VsYXJWZWxvY2l0eSh2ZWxvY2l0eSkge1xuICAgICAgICBpZiAodGhpcy5fYm9keSAmJiB0aGlzLl90eXBlID09PSBCT0RZVFlQRV9EWU5BTUlDKSB7XG4gICAgICAgICAgICB0aGlzLl9ib2R5LmFjdGl2YXRlKCk7XG5cbiAgICAgICAgICAgIF9hbW1vVmVjMS5zZXRWYWx1ZSh2ZWxvY2l0eS54LCB2ZWxvY2l0eS55LCB2ZWxvY2l0eS56KTtcbiAgICAgICAgICAgIHRoaXMuX2JvZHkuc2V0QW5ndWxhclZlbG9jaXR5KF9hbW1vVmVjMSk7XG5cbiAgICAgICAgICAgIHRoaXMuX2FuZ3VsYXJWZWxvY2l0eS5jb3B5KHZlbG9jaXR5KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGdldCBhbmd1bGFyVmVsb2NpdHkoKSB7XG4gICAgICAgIGlmICh0aGlzLl9ib2R5ICYmIHRoaXMuX3R5cGUgPT09IEJPRFlUWVBFX0RZTkFNSUMpIHtcbiAgICAgICAgICAgIGNvbnN0IHZlbG9jaXR5ID0gdGhpcy5fYm9keS5nZXRBbmd1bGFyVmVsb2NpdHkoKTtcbiAgICAgICAgICAgIHRoaXMuX2FuZ3VsYXJWZWxvY2l0eS5zZXQodmVsb2NpdHkueCgpLCB2ZWxvY2l0eS55KCksIHZlbG9jaXR5LnooKSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMuX2FuZ3VsYXJWZWxvY2l0eTtcbiAgICB9XG5cbiAgICBzZXQgYm9keShib2R5KSB7XG4gICAgICAgIGlmICh0aGlzLl9ib2R5ICE9PSBib2R5KSB7XG4gICAgICAgICAgICB0aGlzLl9ib2R5ID0gYm9keTtcblxuICAgICAgICAgICAgaWYgKGJvZHkgJiYgdGhpcy5fc2ltdWxhdGlvbkVuYWJsZWQpIHtcbiAgICAgICAgICAgICAgICBib2R5LmFjdGl2YXRlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBnZXQgYm9keSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2JvZHk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVGhlIGZyaWN0aW9uIHZhbHVlIHVzZWQgd2hlbiBjb250YWN0cyBvY2N1ciBiZXR3ZWVuIHR3byBib2RpZXMuIEEgaGlnaGVyIHZhbHVlIGluZGljYXRlc1xuICAgICAqIG1vcmUgZnJpY3Rpb24uIFNob3VsZCBiZSBzZXQgaW4gdGhlIHJhbmdlIDAgdG8gMS4gRGVmYXVsdHMgdG8gMC41LlxuICAgICAqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKi9cbiAgICBzZXQgZnJpY3Rpb24oZnJpY3Rpb24pIHtcbiAgICAgICAgaWYgKHRoaXMuX2ZyaWN0aW9uICE9PSBmcmljdGlvbikge1xuICAgICAgICAgICAgdGhpcy5fZnJpY3Rpb24gPSBmcmljdGlvbjtcblxuICAgICAgICAgICAgaWYgKHRoaXMuX2JvZHkpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9ib2R5LnNldEZyaWN0aW9uKGZyaWN0aW9uKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGdldCBmcmljdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2ZyaWN0aW9uO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRoZSBjb2xsaXNpb24gZ3JvdXAgdGhpcyBib2R5IGJlbG9uZ3MgdG8uIENvbWJpbmUgdGhlIGdyb3VwIGFuZCB0aGUgbWFzayB0byBwcmV2ZW50IGJvZGllc1xuICAgICAqIGNvbGxpZGluZyB3aXRoIGVhY2ggb3RoZXIuIERlZmF1bHRzIHRvIDEuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqL1xuICAgIHNldCBncm91cChncm91cCkge1xuICAgICAgICBpZiAodGhpcy5fZ3JvdXAgIT09IGdyb3VwKSB7XG4gICAgICAgICAgICB0aGlzLl9ncm91cCA9IGdyb3VwO1xuXG4gICAgICAgICAgICAvLyByZS1lbmFibGluZyBzaW11bGF0aW9uIGFkZHMgcmlnaWRib2R5IGJhY2sgaW50byB3b3JsZCB3aXRoIG5ldyBtYXNrc1xuICAgICAgICAgICAgaWYgKHRoaXMuZW5hYmxlZCAmJiB0aGlzLmVudGl0eS5lbmFibGVkKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5kaXNhYmxlU2ltdWxhdGlvbigpO1xuICAgICAgICAgICAgICAgIHRoaXMuZW5hYmxlU2ltdWxhdGlvbigpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2V0IGdyb3VwKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fZ3JvdXA7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ29udHJvbHMgdGhlIHJhdGUgYXQgd2hpY2ggYSBib2R5IGxvc2VzIGxpbmVhciB2ZWxvY2l0eSBvdmVyIHRpbWUuIERlZmF1bHRzIHRvIDAuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqL1xuICAgIHNldCBsaW5lYXJEYW1waW5nKGRhbXBpbmcpIHtcbiAgICAgICAgaWYgKHRoaXMuX2xpbmVhckRhbXBpbmcgIT09IGRhbXBpbmcpIHtcbiAgICAgICAgICAgIHRoaXMuX2xpbmVhckRhbXBpbmcgPSBkYW1waW5nO1xuXG4gICAgICAgICAgICBpZiAodGhpcy5fYm9keSkge1xuICAgICAgICAgICAgICAgIHRoaXMuX2JvZHkuc2V0RGFtcGluZyhkYW1waW5nLCB0aGlzLl9hbmd1bGFyRGFtcGluZyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBnZXQgbGluZWFyRGFtcGluZygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2xpbmVhckRhbXBpbmc7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2NhbGluZyBmYWN0b3IgZm9yIGxpbmVhciBtb3ZlbWVudCBvZiB0aGUgYm9keSBpbiBlYWNoIGF4aXMuIE9ubHkgdmFsaWQgZm9yIHJpZ2lkIGJvZGllcyBvZlxuICAgICAqIHR5cGUge0BsaW5rIEJPRFlUWVBFX0RZTkFNSUN9LiBEZWZhdWx0cyB0byAxIGluIGFsbCBheGVzIChib2R5IGNhbiBmcmVlbHkgbW92ZSkuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7VmVjM31cbiAgICAgKi9cbiAgICBzZXQgbGluZWFyRmFjdG9yKGZhY3Rvcikge1xuICAgICAgICBpZiAoIXRoaXMuX2xpbmVhckZhY3Rvci5lcXVhbHMoZmFjdG9yKSkge1xuICAgICAgICAgICAgdGhpcy5fbGluZWFyRmFjdG9yLmNvcHkoZmFjdG9yKTtcblxuICAgICAgICAgICAgaWYgKHRoaXMuX2JvZHkgJiYgdGhpcy5fdHlwZSA9PT0gQk9EWVRZUEVfRFlOQU1JQykge1xuICAgICAgICAgICAgICAgIF9hbW1vVmVjMS5zZXRWYWx1ZShmYWN0b3IueCwgZmFjdG9yLnksIGZhY3Rvci56KTtcbiAgICAgICAgICAgICAgICB0aGlzLl9ib2R5LnNldExpbmVhckZhY3RvcihfYW1tb1ZlYzEpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2V0IGxpbmVhckZhY3RvcigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2xpbmVhckZhY3RvcjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBEZWZpbmVzIHRoZSBzcGVlZCBvZiB0aGUgYm9keSBpbiBhIGdpdmVuIGRpcmVjdGlvbi5cbiAgICAgKlxuICAgICAqIEB0eXBlIHtWZWMzfVxuICAgICAqL1xuICAgIHNldCBsaW5lYXJWZWxvY2l0eSh2ZWxvY2l0eSkge1xuICAgICAgICBpZiAodGhpcy5fYm9keSAmJiB0aGlzLl90eXBlID09PSBCT0RZVFlQRV9EWU5BTUlDKSB7XG4gICAgICAgICAgICB0aGlzLl9ib2R5LmFjdGl2YXRlKCk7XG5cbiAgICAgICAgICAgIF9hbW1vVmVjMS5zZXRWYWx1ZSh2ZWxvY2l0eS54LCB2ZWxvY2l0eS55LCB2ZWxvY2l0eS56KTtcbiAgICAgICAgICAgIHRoaXMuX2JvZHkuc2V0TGluZWFyVmVsb2NpdHkoX2FtbW9WZWMxKTtcblxuICAgICAgICAgICAgdGhpcy5fbGluZWFyVmVsb2NpdHkuY29weSh2ZWxvY2l0eSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBnZXQgbGluZWFyVmVsb2NpdHkoKSB7XG4gICAgICAgIGlmICh0aGlzLl9ib2R5ICYmIHRoaXMuX3R5cGUgPT09IEJPRFlUWVBFX0RZTkFNSUMpIHtcbiAgICAgICAgICAgIGNvbnN0IHZlbG9jaXR5ID0gdGhpcy5fYm9keS5nZXRMaW5lYXJWZWxvY2l0eSgpO1xuICAgICAgICAgICAgdGhpcy5fbGluZWFyVmVsb2NpdHkuc2V0KHZlbG9jaXR5LngoKSwgdmVsb2NpdHkueSgpLCB2ZWxvY2l0eS56KCkpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLl9saW5lYXJWZWxvY2l0eTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUaGUgY29sbGlzaW9uIG1hc2sgc2V0cyB3aGljaCBncm91cHMgdGhpcyBib2R5IGNvbGxpZGVzIHdpdGguIEl0IGlzIGEgYml0ZmllbGQgb2YgMTYgYml0cyxcbiAgICAgKiB0aGUgZmlyc3QgOCBiaXRzIGFyZSByZXNlcnZlZCBmb3IgZW5naW5lIHVzZS4gRGVmYXVsdHMgdG8gNjU1MzUuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqL1xuICAgIHNldCBtYXNrKG1hc2spIHtcbiAgICAgICAgaWYgKHRoaXMuX21hc2sgIT09IG1hc2spIHtcbiAgICAgICAgICAgIHRoaXMuX21hc2sgPSBtYXNrO1xuXG4gICAgICAgICAgICAvLyByZS1lbmFibGluZyBzaW11bGF0aW9uIGFkZHMgcmlnaWRib2R5IGJhY2sgaW50byB3b3JsZCB3aXRoIG5ldyBtYXNrc1xuICAgICAgICAgICAgaWYgKHRoaXMuZW5hYmxlZCAmJiB0aGlzLmVudGl0eS5lbmFibGVkKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5kaXNhYmxlU2ltdWxhdGlvbigpO1xuICAgICAgICAgICAgICAgIHRoaXMuZW5hYmxlU2ltdWxhdGlvbigpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2V0IG1hc2soKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9tYXNrO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRoZSBtYXNzIG9mIHRoZSBib2R5LiBUaGlzIGlzIG9ubHkgcmVsZXZhbnQgZm9yIHtAbGluayBCT0RZVFlQRV9EWU5BTUlDfSBib2RpZXMsIG90aGVyIHR5cGVzXG4gICAgICogaGF2ZSBpbmZpbml0ZSBtYXNzLiBEZWZhdWx0cyB0byAxLlxuICAgICAqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKi9cbiAgICBzZXQgbWFzcyhtYXNzKSB7XG4gICAgICAgIGlmICh0aGlzLl9tYXNzICE9PSBtYXNzKSB7XG4gICAgICAgICAgICB0aGlzLl9tYXNzID0gbWFzcztcblxuICAgICAgICAgICAgaWYgKHRoaXMuX2JvZHkgJiYgdGhpcy5fdHlwZSA9PT0gQk9EWVRZUEVfRFlOQU1JQykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGVuYWJsZWQgPSB0aGlzLmVuYWJsZWQgJiYgdGhpcy5lbnRpdHkuZW5hYmxlZDtcbiAgICAgICAgICAgICAgICBpZiAoZW5hYmxlZCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmRpc2FibGVTaW11bGF0aW9uKCk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gY2FsY3VsYXRlTG9jYWxJbmVydGlhIHdyaXRlcyBsb2NhbCBpbmVydGlhIHRvIGFtbW9WZWMxIGhlcmUuLi5cbiAgICAgICAgICAgICAgICB0aGlzLl9ib2R5LmdldENvbGxpc2lvblNoYXBlKCkuY2FsY3VsYXRlTG9jYWxJbmVydGlhKG1hc3MsIF9hbW1vVmVjMSk7XG4gICAgICAgICAgICAgICAgLy8gLi4uYW5kIHRoZW4gd3JpdGVzIHRoZSBjYWxjdWxhdGVkIGxvY2FsIGluZXJ0aWEgdG8gdGhlIGJvZHlcbiAgICAgICAgICAgICAgICB0aGlzLl9ib2R5LnNldE1hc3NQcm9wcyhtYXNzLCBfYW1tb1ZlYzEpO1xuICAgICAgICAgICAgICAgIHRoaXMuX2JvZHkudXBkYXRlSW5lcnRpYVRlbnNvcigpO1xuXG4gICAgICAgICAgICAgICAgaWYgKGVuYWJsZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5lbmFibGVTaW11bGF0aW9uKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2V0IG1hc3MoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9tYXNzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEluZmx1ZW5jZXMgdGhlIGFtb3VudCBvZiBlbmVyZ3kgbG9zdCB3aGVuIHR3byByaWdpZCBib2RpZXMgY29sbGlkZS4gVGhlIGNhbGN1bGF0aW9uXG4gICAgICogbXVsdGlwbGllcyB0aGUgcmVzdGl0dXRpb24gdmFsdWVzIGZvciBib3RoIGNvbGxpZGluZyBib2RpZXMuIEEgbXVsdGlwbGllZCB2YWx1ZSBvZiAwIG1lYW5zXG4gICAgICogdGhhdCBhbGwgZW5lcmd5IGlzIGxvc3QgaW4gdGhlIGNvbGxpc2lvbiB3aGlsZSBhIHZhbHVlIG9mIDEgbWVhbnMgdGhhdCBubyBlbmVyZ3kgaXMgbG9zdC5cbiAgICAgKiBTaG91bGQgYmUgc2V0IGluIHRoZSByYW5nZSAwIHRvIDEuIERlZmF1bHRzIHRvIDAuXG4gICAgICpcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqL1xuICAgIHNldCByZXN0aXR1dGlvbihyZXN0aXR1dGlvbikge1xuICAgICAgICBpZiAodGhpcy5fcmVzdGl0dXRpb24gIT09IHJlc3RpdHV0aW9uKSB7XG4gICAgICAgICAgICB0aGlzLl9yZXN0aXR1dGlvbiA9IHJlc3RpdHV0aW9uO1xuXG4gICAgICAgICAgICBpZiAodGhpcy5fYm9keSkge1xuICAgICAgICAgICAgICAgIHRoaXMuX2JvZHkuc2V0UmVzdGl0dXRpb24ocmVzdGl0dXRpb24pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2V0IHJlc3RpdHV0aW9uKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fcmVzdGl0dXRpb247XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyBhIHRvcnNpb25hbCBmcmljdGlvbiBvcnRob2dvbmFsIHRvIHRoZSBjb250YWN0IHBvaW50LiBEZWZhdWx0cyB0byAwLlxuICAgICAqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKi9cbiAgICBzZXQgcm9sbGluZ0ZyaWN0aW9uKGZyaWN0aW9uKSB7XG4gICAgICAgIGlmICh0aGlzLl9yb2xsaW5nRnJpY3Rpb24gIT09IGZyaWN0aW9uKSB7XG4gICAgICAgICAgICB0aGlzLl9yb2xsaW5nRnJpY3Rpb24gPSBmcmljdGlvbjtcblxuICAgICAgICAgICAgaWYgKHRoaXMuX2JvZHkpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9ib2R5LnNldFJvbGxpbmdGcmljdGlvbihmcmljdGlvbik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBnZXQgcm9sbGluZ0ZyaWN0aW9uKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fcm9sbGluZ0ZyaWN0aW9uO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRoZSByaWdpZCBib2R5IHR5cGUgZGV0ZXJtaW5lcyBob3cgdGhlIGJvZHkgaXMgc2ltdWxhdGVkLiBDYW4gYmU6XG4gICAgICpcbiAgICAgKiAtIHtAbGluayBCT0RZVFlQRV9TVEFUSUN9OiBpbmZpbml0ZSBtYXNzIGFuZCBjYW5ub3QgbW92ZS5cbiAgICAgKiAtIHtAbGluayBCT0RZVFlQRV9EWU5BTUlDfTogc2ltdWxhdGVkIGFjY29yZGluZyB0byBhcHBsaWVkIGZvcmNlcy5cbiAgICAgKiAtIHtAbGluayBCT0RZVFlQRV9LSU5FTUFUSUN9OiBpbmZpbml0ZSBtYXNzIGFuZCBkb2VzIG5vdCByZXNwb25kIHRvIGZvcmNlcyAoY2FuIG9ubHkgYmVcbiAgICAgKiBtb3ZlZCBieSBzZXR0aW5nIHRoZSBwb3NpdGlvbiBhbmQgcm90YXRpb24gb2YgY29tcG9uZW50J3Mge0BsaW5rIEVudGl0eX0pLlxuICAgICAqXG4gICAgICogRGVmYXVsdHMgdG8ge0BsaW5rIEJPRFlUWVBFX1NUQVRJQ30uXG4gICAgICpcbiAgICAgKiBAdHlwZSB7c3RyaW5nfVxuICAgICAqL1xuICAgIHNldCB0eXBlKHR5cGUpIHtcbiAgICAgICAgaWYgKHRoaXMuX3R5cGUgIT09IHR5cGUpIHtcbiAgICAgICAgICAgIHRoaXMuX3R5cGUgPSB0eXBlO1xuXG4gICAgICAgICAgICB0aGlzLmRpc2FibGVTaW11bGF0aW9uKCk7XG5cbiAgICAgICAgICAgIC8vIHNldCBncm91cCBhbmQgbWFzayB0byBkZWZhdWx0cyBmb3IgdHlwZVxuICAgICAgICAgICAgc3dpdGNoICh0eXBlKSB7XG4gICAgICAgICAgICAgICAgY2FzZSBCT0RZVFlQRV9EWU5BTUlDOlxuICAgICAgICAgICAgICAgICAgICB0aGlzLl9ncm91cCA9IEJPRFlHUk9VUF9EWU5BTUlDO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9tYXNrID0gQk9EWU1BU0tfQUxMO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlIEJPRFlUWVBFX0tJTkVNQVRJQzpcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fZ3JvdXAgPSBCT0RZR1JPVVBfS0lORU1BVElDO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9tYXNrID0gQk9EWU1BU0tfQUxMO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlIEJPRFlUWVBFX1NUQVRJQzpcbiAgICAgICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgICAgICB0aGlzLl9ncm91cCA9IEJPRFlHUk9VUF9TVEFUSUM7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX21hc2sgPSBCT0RZTUFTS19OT1RfU1RBVElDO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gQ3JlYXRlIGEgbmV3IGJvZHlcbiAgICAgICAgICAgIHRoaXMuY3JlYXRlQm9keSgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2V0IHR5cGUoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl90eXBlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIElmIHRoZSBFbnRpdHkgaGFzIGEgQ29sbGlzaW9uIHNoYXBlIGF0dGFjaGVkIHRoZW4gY3JlYXRlIGEgcmlnaWQgYm9keSB1c2luZyB0aGlzIHNoYXBlLiBUaGlzXG4gICAgICogbWV0aG9kIGRlc3Ryb3lzIHRoZSBleGlzdGluZyBib2R5LlxuICAgICAqXG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBjcmVhdGVCb2R5KCkge1xuICAgICAgICBjb25zdCBlbnRpdHkgPSB0aGlzLmVudGl0eTtcbiAgICAgICAgbGV0IHNoYXBlO1xuXG4gICAgICAgIGlmIChlbnRpdHkuY29sbGlzaW9uKSB7XG4gICAgICAgICAgICBzaGFwZSA9IGVudGl0eS5jb2xsaXNpb24uc2hhcGU7XG5cbiAgICAgICAgICAgIC8vIGlmIGEgdHJpZ2dlciB3YXMgYWxyZWFkeSBjcmVhdGVkIGZyb20gdGhlIGNvbGxpc2lvbiBzeXN0ZW1cbiAgICAgICAgICAgIC8vIGRlc3Ryb3kgaXRcbiAgICAgICAgICAgIGlmIChlbnRpdHkudHJpZ2dlcikge1xuICAgICAgICAgICAgICAgIGVudGl0eS50cmlnZ2VyLmRlc3Ryb3koKTtcbiAgICAgICAgICAgICAgICBkZWxldGUgZW50aXR5LnRyaWdnZXI7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc2hhcGUpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLl9ib2R5KVxuICAgICAgICAgICAgICAgIHRoaXMuc3lzdGVtLm9uUmVtb3ZlKGVudGl0eSwgdGhpcyk7XG5cbiAgICAgICAgICAgIGNvbnN0IG1hc3MgPSB0aGlzLl90eXBlID09PSBCT0RZVFlQRV9EWU5BTUlDID8gdGhpcy5fbWFzcyA6IDA7XG5cbiAgICAgICAgICAgIHRoaXMuX2dldEVudGl0eVRyYW5zZm9ybShfYW1tb1RyYW5zZm9ybSk7XG5cbiAgICAgICAgICAgIGNvbnN0IGJvZHkgPSB0aGlzLnN5c3RlbS5jcmVhdGVCb2R5KG1hc3MsIHNoYXBlLCBfYW1tb1RyYW5zZm9ybSk7XG5cbiAgICAgICAgICAgIGJvZHkuc2V0UmVzdGl0dXRpb24odGhpcy5fcmVzdGl0dXRpb24pO1xuICAgICAgICAgICAgYm9keS5zZXRGcmljdGlvbih0aGlzLl9mcmljdGlvbik7XG4gICAgICAgICAgICBib2R5LnNldFJvbGxpbmdGcmljdGlvbih0aGlzLl9yb2xsaW5nRnJpY3Rpb24pO1xuICAgICAgICAgICAgYm9keS5zZXREYW1waW5nKHRoaXMuX2xpbmVhckRhbXBpbmcsIHRoaXMuX2FuZ3VsYXJEYW1waW5nKTtcblxuICAgICAgICAgICAgaWYgKHRoaXMuX3R5cGUgPT09IEJPRFlUWVBFX0RZTkFNSUMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBsaW5lYXJGYWN0b3IgPSB0aGlzLl9saW5lYXJGYWN0b3I7XG4gICAgICAgICAgICAgICAgX2FtbW9WZWMxLnNldFZhbHVlKGxpbmVhckZhY3Rvci54LCBsaW5lYXJGYWN0b3IueSwgbGluZWFyRmFjdG9yLnopO1xuICAgICAgICAgICAgICAgIGJvZHkuc2V0TGluZWFyRmFjdG9yKF9hbW1vVmVjMSk7XG5cbiAgICAgICAgICAgICAgICBjb25zdCBhbmd1bGFyRmFjdG9yID0gdGhpcy5fYW5ndWxhckZhY3RvcjtcbiAgICAgICAgICAgICAgICBfYW1tb1ZlYzEuc2V0VmFsdWUoYW5ndWxhckZhY3Rvci54LCBhbmd1bGFyRmFjdG9yLnksIGFuZ3VsYXJGYWN0b3Iueik7XG4gICAgICAgICAgICAgICAgYm9keS5zZXRBbmd1bGFyRmFjdG9yKF9hbW1vVmVjMSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHRoaXMuX3R5cGUgPT09IEJPRFlUWVBFX0tJTkVNQVRJQykge1xuICAgICAgICAgICAgICAgIGJvZHkuc2V0Q29sbGlzaW9uRmxhZ3MoYm9keS5nZXRDb2xsaXNpb25GbGFncygpIHwgQk9EWUZMQUdfS0lORU1BVElDX09CSkVDVCk7XG4gICAgICAgICAgICAgICAgYm9keS5zZXRBY3RpdmF0aW9uU3RhdGUoQk9EWVNUQVRFX0RJU0FCTEVfREVBQ1RJVkFUSU9OKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgYm9keS5lbnRpdHkgPSBlbnRpdHk7XG5cbiAgICAgICAgICAgIHRoaXMuYm9keSA9IGJvZHk7XG5cbiAgICAgICAgICAgIGlmICh0aGlzLmVuYWJsZWQgJiYgZW50aXR5LmVuYWJsZWQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmVuYWJsZVNpbXVsYXRpb24oKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdHJ1ZSBpZiB0aGUgcmlnaWQgYm9keSBpcyBjdXJyZW50bHkgYWN0aXZlbHkgYmVpbmcgc2ltdWxhdGVkLiBJLmUuIE5vdCAnc2xlZXBpbmcnLlxuICAgICAqXG4gICAgICogQHJldHVybnMge2Jvb2xlYW59IFRydWUgaWYgdGhlIGJvZHkgaXMgYWN0aXZlLlxuICAgICAqL1xuICAgIGlzQWN0aXZlKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fYm9keSA/IHRoaXMuX2JvZHkuaXNBY3RpdmUoKSA6IGZhbHNlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEZvcmNpYmx5IGFjdGl2YXRlIHRoZSByaWdpZCBib2R5IHNpbXVsYXRpb24uIE9ubHkgYWZmZWN0cyByaWdpZCBib2RpZXMgb2YgdHlwZVxuICAgICAqIHtAbGluayBCT0RZVFlQRV9EWU5BTUlDfS5cbiAgICAgKi9cbiAgICBhY3RpdmF0ZSgpIHtcbiAgICAgICAgaWYgKHRoaXMuX2JvZHkpIHtcbiAgICAgICAgICAgIHRoaXMuX2JvZHkuYWN0aXZhdGUoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEFkZCBhIGJvZHkgdG8gdGhlIHNpbXVsYXRpb24uXG4gICAgICpcbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgZW5hYmxlU2ltdWxhdGlvbigpIHtcbiAgICAgICAgY29uc3QgZW50aXR5ID0gdGhpcy5lbnRpdHk7XG4gICAgICAgIGlmIChlbnRpdHkuY29sbGlzaW9uICYmIGVudGl0eS5jb2xsaXNpb24uZW5hYmxlZCAmJiAhdGhpcy5fc2ltdWxhdGlvbkVuYWJsZWQpIHtcbiAgICAgICAgICAgIGNvbnN0IGJvZHkgPSB0aGlzLl9ib2R5O1xuICAgICAgICAgICAgaWYgKGJvZHkpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnN5c3RlbS5hZGRCb2R5KGJvZHksIHRoaXMuX2dyb3VwLCB0aGlzLl9tYXNrKTtcblxuICAgICAgICAgICAgICAgIHN3aXRjaCAodGhpcy5fdHlwZSkge1xuICAgICAgICAgICAgICAgICAgICBjYXNlIEJPRFlUWVBFX0RZTkFNSUM6XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnN5c3RlbS5fZHluYW1pYy5wdXNoKHRoaXMpO1xuICAgICAgICAgICAgICAgICAgICAgICAgYm9keS5mb3JjZUFjdGl2YXRpb25TdGF0ZShCT0RZU1RBVEVfQUNUSVZFX1RBRyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnN5bmNFbnRpdHlUb0JvZHkoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBjYXNlIEJPRFlUWVBFX0tJTkVNQVRJQzpcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc3lzdGVtLl9raW5lbWF0aWMucHVzaCh0aGlzKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJvZHkuZm9yY2VBY3RpdmF0aW9uU3RhdGUoQk9EWVNUQVRFX0RJU0FCTEVfREVBQ1RJVkFUSU9OKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBjYXNlIEJPRFlUWVBFX1NUQVRJQzpcbiAgICAgICAgICAgICAgICAgICAgICAgIGJvZHkuZm9yY2VBY3RpdmF0aW9uU3RhdGUoQk9EWVNUQVRFX0FDVElWRV9UQUcpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zeW5jRW50aXR5VG9Cb2R5KCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoZW50aXR5LmNvbGxpc2lvbi50eXBlID09PSAnY29tcG91bmQnKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc3lzdGVtLl9jb21wb3VuZHMucHVzaChlbnRpdHkuY29sbGlzaW9uKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBib2R5LmFjdGl2YXRlKCk7XG5cbiAgICAgICAgICAgICAgICB0aGlzLl9zaW11bGF0aW9uRW5hYmxlZCA9IHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZW1vdmUgYSBib2R5IGZyb20gdGhlIHNpbXVsYXRpb24uXG4gICAgICpcbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgZGlzYWJsZVNpbXVsYXRpb24oKSB7XG4gICAgICAgIGNvbnN0IGJvZHkgPSB0aGlzLl9ib2R5O1xuICAgICAgICBpZiAoYm9keSAmJiB0aGlzLl9zaW11bGF0aW9uRW5hYmxlZCkge1xuICAgICAgICAgICAgY29uc3Qgc3lzdGVtID0gdGhpcy5zeXN0ZW07XG5cbiAgICAgICAgICAgIGxldCBpZHggPSBzeXN0ZW0uX2NvbXBvdW5kcy5pbmRleE9mKHRoaXMuZW50aXR5LmNvbGxpc2lvbik7XG4gICAgICAgICAgICBpZiAoaWR4ID4gLTEpIHtcbiAgICAgICAgICAgICAgICBzeXN0ZW0uX2NvbXBvdW5kcy5zcGxpY2UoaWR4LCAxKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWR4ID0gc3lzdGVtLl9keW5hbWljLmluZGV4T2YodGhpcyk7XG4gICAgICAgICAgICBpZiAoaWR4ID4gLTEpIHtcbiAgICAgICAgICAgICAgICBzeXN0ZW0uX2R5bmFtaWMuc3BsaWNlKGlkeCwgMSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlkeCA9IHN5c3RlbS5fa2luZW1hdGljLmluZGV4T2YodGhpcyk7XG4gICAgICAgICAgICBpZiAoaWR4ID4gLTEpIHtcbiAgICAgICAgICAgICAgICBzeXN0ZW0uX2tpbmVtYXRpYy5zcGxpY2UoaWR4LCAxKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgc3lzdGVtLnJlbW92ZUJvZHkoYm9keSk7XG5cbiAgICAgICAgICAgIC8vIHNldCBhY3RpdmF0aW9uIHN0YXRlIHRvIGRpc2FibGUgc2ltdWxhdGlvbiB0byBhdm9pZCBib2R5LmlzQWN0aXZlKCkgdG8gcmV0dXJuXG4gICAgICAgICAgICAvLyB0cnVlIGV2ZW4gaWYgaXQncyBub3QgaW4gdGhlIGR5bmFtaWNzIHdvcmxkXG4gICAgICAgICAgICBib2R5LmZvcmNlQWN0aXZhdGlvblN0YXRlKEJPRFlTVEFURV9ESVNBQkxFX1NJTVVMQVRJT04pO1xuXG4gICAgICAgICAgICB0aGlzLl9zaW11bGF0aW9uRW5hYmxlZCA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQXBwbHkgYW4gZm9yY2UgdG8gdGhlIGJvZHkgYXQgYSBwb2ludC4gQnkgZGVmYXVsdCwgdGhlIGZvcmNlIGlzIGFwcGxpZWQgYXQgdGhlIG9yaWdpbiBvZiB0aGVcbiAgICAgKiBib2R5LiBIb3dldmVyLCB0aGUgZm9yY2UgY2FuIGJlIGFwcGxpZWQgYXQgYW4gb2Zmc2V0IHRoaXMgcG9pbnQgYnkgc3BlY2lmeWluZyBhIHdvcmxkIHNwYWNlXG4gICAgICogdmVjdG9yIGZyb20gdGhlIGJvZHkncyBvcmlnaW4gdG8gdGhlIHBvaW50IG9mIGFwcGxpY2F0aW9uLiBUaGlzIGZ1bmN0aW9uIGhhcyB0d28gdmFsaWRcbiAgICAgKiBzaWduYXR1cmVzLiBZb3UgY2FuIGVpdGhlciBzcGVjaWZ5IHRoZSBmb3JjZSAoYW5kIG9wdGlvbmFsIHJlbGF0aXZlIHBvaW50KSB2aWEgM0QtdmVjdG9yIG9yXG4gICAgICogbnVtYmVycy5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7VmVjM3xudW1iZXJ9IHggLSBBIDMtZGltZW5zaW9uYWwgdmVjdG9yIHJlcHJlc2VudGluZyB0aGUgZm9yY2UgaW4gd29ybGQtc3BhY2Ugb3JcbiAgICAgKiB0aGUgeC1jb21wb25lbnQgb2YgdGhlIGZvcmNlIGluIHdvcmxkLXNwYWNlLlxuICAgICAqIEBwYXJhbSB7VmVjM3xudW1iZXJ9IFt5XSAtIEFuIG9wdGlvbmFsIDMtZGltZW5zaW9uYWwgdmVjdG9yIHJlcHJlc2VudGluZyB0aGUgcmVsYXRpdmUgcG9pbnRcbiAgICAgKiBhdCB3aGljaCB0byBhcHBseSB0aGUgaW1wdWxzZSBpbiB3b3JsZC1zcGFjZSBvciB0aGUgeS1jb21wb25lbnQgb2YgdGhlIGZvcmNlIGluIHdvcmxkLXNwYWNlLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBbel0gLSBUaGUgei1jb21wb25lbnQgb2YgdGhlIGZvcmNlIGluIHdvcmxkLXNwYWNlLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBbcHhdIC0gVGhlIHgtY29tcG9uZW50IG9mIGEgd29ybGQtc3BhY2Ugb2Zmc2V0IGZyb20gdGhlIGJvZHkncyBwb3NpdGlvblxuICAgICAqIHdoZXJlIHRoZSBmb3JjZSBpcyBhcHBsaWVkLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBbcHldIC0gVGhlIHktY29tcG9uZW50IG9mIGEgd29ybGQtc3BhY2Ugb2Zmc2V0IGZyb20gdGhlIGJvZHkncyBwb3NpdGlvblxuICAgICAqIHdoZXJlIHRoZSBmb3JjZSBpcyBhcHBsaWVkLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBbcHpdIC0gVGhlIHotY29tcG9uZW50IG9mIGEgd29ybGQtc3BhY2Ugb2Zmc2V0IGZyb20gdGhlIGJvZHkncyBwb3NpdGlvblxuICAgICAqIHdoZXJlIHRoZSBmb3JjZSBpcyBhcHBsaWVkLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogLy8gQXBwbHkgYW4gYXBwcm94aW1hdGlvbiBvZiBncmF2aXR5IGF0IHRoZSBib2R5J3MgY2VudGVyXG4gICAgICogdGhpcy5lbnRpdHkucmlnaWRib2R5LmFwcGx5Rm9yY2UoMCwgLTEwLCAwKTtcbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIC8vIEFwcGx5IGFuIGFwcHJveGltYXRpb24gb2YgZ3Jhdml0eSBhdCAxIHVuaXQgZG93biB0aGUgd29ybGQgWiBmcm9tIHRoZSBjZW50ZXIgb2YgdGhlIGJvZHlcbiAgICAgKiB0aGlzLmVudGl0eS5yaWdpZGJvZHkuYXBwbHlGb3JjZSgwLCAtMTAsIDAsIDAsIDAsIDEpO1xuICAgICAqIEBleGFtcGxlXG4gICAgICogLy8gQXBwbHkgYSBmb3JjZSBhdCB0aGUgYm9keSdzIGNlbnRlclxuICAgICAqIC8vIENhbGN1bGF0ZSBhIGZvcmNlIHZlY3RvciBwb2ludGluZyBpbiB0aGUgd29ybGQgc3BhY2UgZGlyZWN0aW9uIG9mIHRoZSBlbnRpdHlcbiAgICAgKiBjb25zdCBmb3JjZSA9IHRoaXMuZW50aXR5LmZvcndhcmQuY2xvbmUoKS5tdWxTY2FsYXIoMTAwKTtcbiAgICAgKlxuICAgICAqIC8vIEFwcGx5IHRoZSBmb3JjZVxuICAgICAqIHRoaXMuZW50aXR5LnJpZ2lkYm9keS5hcHBseUZvcmNlKGZvcmNlKTtcbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIC8vIEFwcGx5IGEgZm9yY2UgYXQgc29tZSByZWxhdGl2ZSBvZmZzZXQgZnJvbSB0aGUgYm9keSdzIGNlbnRlclxuICAgICAqIC8vIENhbGN1bGF0ZSBhIGZvcmNlIHZlY3RvciBwb2ludGluZyBpbiB0aGUgd29ybGQgc3BhY2UgZGlyZWN0aW9uIG9mIHRoZSBlbnRpdHlcbiAgICAgKiBjb25zdCBmb3JjZSA9IHRoaXMuZW50aXR5LmZvcndhcmQuY2xvbmUoKS5tdWxTY2FsYXIoMTAwKTtcbiAgICAgKlxuICAgICAqIC8vIENhbGN1bGF0ZSB0aGUgd29ybGQgc3BhY2UgcmVsYXRpdmUgb2Zmc2V0XG4gICAgICogY29uc3QgcmVsYXRpdmVQb3MgPSBuZXcgcGMuVmVjMygpO1xuICAgICAqIGNvbnN0IGNoaWxkRW50aXR5ID0gdGhpcy5lbnRpdHkuZmluZEJ5TmFtZSgnRW5naW5lJyk7XG4gICAgICogcmVsYXRpdmVQb3Muc3ViMihjaGlsZEVudGl0eS5nZXRQb3NpdGlvbigpLCB0aGlzLmVudGl0eS5nZXRQb3NpdGlvbigpKTtcbiAgICAgKlxuICAgICAqIC8vIEFwcGx5IHRoZSBmb3JjZVxuICAgICAqIHRoaXMuZW50aXR5LnJpZ2lkYm9keS5hcHBseUZvcmNlKGZvcmNlLCByZWxhdGl2ZVBvcyk7XG4gICAgICovXG4gICAgYXBwbHlGb3JjZSh4LCB5LCB6LCBweCwgcHksIHB6KSB7XG4gICAgICAgIGNvbnN0IGJvZHkgPSB0aGlzLl9ib2R5O1xuICAgICAgICBpZiAoYm9keSkge1xuICAgICAgICAgICAgYm9keS5hY3RpdmF0ZSgpO1xuXG4gICAgICAgICAgICBpZiAoeCBpbnN0YW5jZW9mIFZlYzMpIHtcbiAgICAgICAgICAgICAgICBfYW1tb1ZlYzEuc2V0VmFsdWUoeC54LCB4LnksIHgueik7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIF9hbW1vVmVjMS5zZXRWYWx1ZSh4LCB5LCB6KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHkgaW5zdGFuY2VvZiBWZWMzKSB7XG4gICAgICAgICAgICAgICAgX2FtbW9WZWMyLnNldFZhbHVlKHkueCwgeS55LCB5LnopO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChweCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgX2FtbW9WZWMyLnNldFZhbHVlKHB4LCBweSwgcHopO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBfYW1tb1ZlYzIuc2V0VmFsdWUoMCwgMCwgMCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGJvZHkuYXBwbHlGb3JjZShfYW1tb1ZlYzEsIF9hbW1vVmVjMik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBcHBseSB0b3JxdWUgKHJvdGF0aW9uYWwgZm9yY2UpIHRvIHRoZSBib2R5LiBUaGlzIGZ1bmN0aW9uIGhhcyB0d28gdmFsaWQgc2lnbmF0dXJlcy4gWW91IGNhblxuICAgICAqIGVpdGhlciBzcGVjaWZ5IHRoZSB0b3JxdWUgZm9yY2Ugd2l0aCBhIDNELXZlY3RvciBvciB3aXRoIDMgbnVtYmVycy5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7VmVjM3xudW1iZXJ9IHggLSBBIDMtZGltZW5zaW9uYWwgdmVjdG9yIHJlcHJlc2VudGluZyB0aGUgdG9ycXVlIGZvcmNlIGluIHdvcmxkLXNwYWNlXG4gICAgICogb3IgdGhlIHgtY29tcG9uZW50IG9mIHRoZSB0b3JxdWUgZm9yY2UgaW4gd29ybGQtc3BhY2UuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFt5XSAtIFRoZSB5LWNvbXBvbmVudCBvZiB0aGUgdG9ycXVlIGZvcmNlIGluIHdvcmxkLXNwYWNlLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBbel0gLSBUaGUgei1jb21wb25lbnQgb2YgdGhlIHRvcnF1ZSBmb3JjZSBpbiB3b3JsZC1zcGFjZS5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIC8vIEFwcGx5IHZpYSB2ZWN0b3JcbiAgICAgKiBjb25zdCB0b3JxdWUgPSBuZXcgcGMuVmVjMygwLCAxMCwgMCk7XG4gICAgICogZW50aXR5LnJpZ2lkYm9keS5hcHBseVRvcnF1ZSh0b3JxdWUpO1xuICAgICAqIEBleGFtcGxlXG4gICAgICogLy8gQXBwbHkgdmlhIG51bWJlcnNcbiAgICAgKiBlbnRpdHkucmlnaWRib2R5LmFwcGx5VG9ycXVlKDAsIDEwLCAwKTtcbiAgICAgKi9cbiAgICBhcHBseVRvcnF1ZSh4LCB5LCB6KSB7XG4gICAgICAgIGNvbnN0IGJvZHkgPSB0aGlzLl9ib2R5O1xuICAgICAgICBpZiAoYm9keSkge1xuICAgICAgICAgICAgYm9keS5hY3RpdmF0ZSgpO1xuXG4gICAgICAgICAgICBpZiAoeCBpbnN0YW5jZW9mIFZlYzMpIHtcbiAgICAgICAgICAgICAgICBfYW1tb1ZlYzEuc2V0VmFsdWUoeC54LCB4LnksIHgueik7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIF9hbW1vVmVjMS5zZXRWYWx1ZSh4LCB5LCB6KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGJvZHkuYXBwbHlUb3JxdWUoX2FtbW9WZWMxKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEFwcGx5IGFuIGltcHVsc2UgKGluc3RhbnRhbmVvdXMgY2hhbmdlIG9mIHZlbG9jaXR5KSB0byB0aGUgYm9keSBhdCBhIHBvaW50LiBUaGlzIGZ1bmN0aW9uXG4gICAgICogaGFzIHR3byB2YWxpZCBzaWduYXR1cmVzLiBZb3UgY2FuIGVpdGhlciBzcGVjaWZ5IHRoZSBpbXB1bHNlIChhbmQgb3B0aW9uYWwgcmVsYXRpdmUgcG9pbnQpXG4gICAgICogdmlhIDNELXZlY3RvciBvciBudW1iZXJzLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtWZWMzfG51bWJlcn0geCAtIEEgMy1kaW1lbnNpb25hbCB2ZWN0b3IgcmVwcmVzZW50aW5nIHRoZSBpbXB1bHNlIGluIHdvcmxkLXNwYWNlIG9yXG4gICAgICogdGhlIHgtY29tcG9uZW50IG9mIHRoZSBpbXB1bHNlIGluIHdvcmxkLXNwYWNlLlxuICAgICAqIEBwYXJhbSB7VmVjM3xudW1iZXJ9IFt5XSAtIEFuIG9wdGlvbmFsIDMtZGltZW5zaW9uYWwgdmVjdG9yIHJlcHJlc2VudGluZyB0aGUgcmVsYXRpdmUgcG9pbnRcbiAgICAgKiBhdCB3aGljaCB0byBhcHBseSB0aGUgaW1wdWxzZSBpbiB0aGUgbG9jYWwtc3BhY2Ugb2YgdGhlIGVudGl0eSBvciB0aGUgeS1jb21wb25lbnQgb2YgdGhlXG4gICAgICogaW1wdWxzZSB0byBhcHBseSBpbiB3b3JsZC1zcGFjZS5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gW3pdIC0gVGhlIHotY29tcG9uZW50IG9mIHRoZSBpbXB1bHNlIHRvIGFwcGx5IGluIHdvcmxkLXNwYWNlLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBbcHhdIC0gVGhlIHgtY29tcG9uZW50IG9mIHRoZSBwb2ludCBhdCB3aGljaCB0byBhcHBseSB0aGUgaW1wdWxzZSBpbiB0aGVcbiAgICAgKiBsb2NhbC1zcGFjZSBvZiB0aGUgZW50aXR5LlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBbcHldIC0gVGhlIHktY29tcG9uZW50IG9mIHRoZSBwb2ludCBhdCB3aGljaCB0byBhcHBseSB0aGUgaW1wdWxzZSBpbiB0aGVcbiAgICAgKiBsb2NhbC1zcGFjZSBvZiB0aGUgZW50aXR5LlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBbcHpdIC0gVGhlIHotY29tcG9uZW50IG9mIHRoZSBwb2ludCBhdCB3aGljaCB0byBhcHBseSB0aGUgaW1wdWxzZSBpbiB0aGVcbiAgICAgKiBsb2NhbC1zcGFjZSBvZiB0aGUgZW50aXR5LlxuICAgICAqIEBleGFtcGxlXG4gICAgICogLy8gQXBwbHkgYW4gaW1wdWxzZSBhbG9uZyB0aGUgd29ybGQtc3BhY2UgcG9zaXRpdmUgeS1heGlzIGF0IHRoZSBlbnRpdHkncyBwb3NpdGlvbi5cbiAgICAgKiBjb25zdCBpbXB1bHNlID0gbmV3IHBjLlZlYzMoMCwgMTAsIDApO1xuICAgICAqIGVudGl0eS5yaWdpZGJvZHkuYXBwbHlJbXB1bHNlKGltcHVsc2UpO1xuICAgICAqIEBleGFtcGxlXG4gICAgICogLy8gQXBwbHkgYW4gaW1wdWxzZSBhbG9uZyB0aGUgd29ybGQtc3BhY2UgcG9zaXRpdmUgeS1heGlzIGF0IDEgdW5pdCBkb3duIHRoZSBwb3NpdGl2ZVxuICAgICAqIC8vIHotYXhpcyBvZiB0aGUgZW50aXR5J3MgbG9jYWwtc3BhY2UuXG4gICAgICogY29uc3QgaW1wdWxzZSA9IG5ldyBwYy5WZWMzKDAsIDEwLCAwKTtcbiAgICAgKiBjb25zdCByZWxhdGl2ZVBvaW50ID0gbmV3IHBjLlZlYzMoMCwgMCwgMSk7XG4gICAgICogZW50aXR5LnJpZ2lkYm9keS5hcHBseUltcHVsc2UoaW1wdWxzZSwgcmVsYXRpdmVQb2ludCk7XG4gICAgICogQGV4YW1wbGVcbiAgICAgKiAvLyBBcHBseSBhbiBpbXB1bHNlIGFsb25nIHRoZSB3b3JsZC1zcGFjZSBwb3NpdGl2ZSB5LWF4aXMgYXQgdGhlIGVudGl0eSdzIHBvc2l0aW9uLlxuICAgICAqIGVudGl0eS5yaWdpZGJvZHkuYXBwbHlJbXB1bHNlKDAsIDEwLCAwKTtcbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIC8vIEFwcGx5IGFuIGltcHVsc2UgYWxvbmcgdGhlIHdvcmxkLXNwYWNlIHBvc2l0aXZlIHktYXhpcyBhdCAxIHVuaXQgZG93biB0aGUgcG9zaXRpdmVcbiAgICAgKiAvLyB6LWF4aXMgb2YgdGhlIGVudGl0eSdzIGxvY2FsLXNwYWNlLlxuICAgICAqIGVudGl0eS5yaWdpZGJvZHkuYXBwbHlJbXB1bHNlKDAsIDEwLCAwLCAwLCAwLCAxKTtcbiAgICAgKi9cbiAgICBhcHBseUltcHVsc2UoeCwgeSwgeiwgcHgsIHB5LCBweikge1xuICAgICAgICBjb25zdCBib2R5ID0gdGhpcy5fYm9keTtcbiAgICAgICAgaWYgKGJvZHkpIHtcbiAgICAgICAgICAgIGJvZHkuYWN0aXZhdGUoKTtcblxuICAgICAgICAgICAgaWYgKHggaW5zdGFuY2VvZiBWZWMzKSB7XG4gICAgICAgICAgICAgICAgX2FtbW9WZWMxLnNldFZhbHVlKHgueCwgeC55LCB4LnopO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBfYW1tb1ZlYzEuc2V0VmFsdWUoeCwgeSwgeik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICh5IGluc3RhbmNlb2YgVmVjMykge1xuICAgICAgICAgICAgICAgIF9hbW1vVmVjMi5zZXRWYWx1ZSh5LngsIHkueSwgeS56KTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocHggIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIF9hbW1vVmVjMi5zZXRWYWx1ZShweCwgcHksIHB6KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgX2FtbW9WZWMyLnNldFZhbHVlKDAsIDAsIDApO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBib2R5LmFwcGx5SW1wdWxzZShfYW1tb1ZlYzEsIF9hbW1vVmVjMik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBcHBseSBhIHRvcnF1ZSBpbXB1bHNlIChyb3RhdGlvbmFsIGZvcmNlIGFwcGxpZWQgaW5zdGFudGFuZW91c2x5KSB0byB0aGUgYm9keS4gVGhpcyBmdW5jdGlvblxuICAgICAqIGhhcyB0d28gdmFsaWQgc2lnbmF0dXJlcy4gWW91IGNhbiBlaXRoZXIgc3BlY2lmeSB0aGUgdG9ycXVlIGZvcmNlIHdpdGggYSAzRC12ZWN0b3Igb3Igd2l0aCAzXG4gICAgICogbnVtYmVycy5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7VmVjM3xudW1iZXJ9IHggLSBBIDMtZGltZW5zaW9uYWwgdmVjdG9yIHJlcHJlc2VudGluZyB0aGUgdG9ycXVlIGltcHVsc2UgaW5cbiAgICAgKiB3b3JsZC1zcGFjZSBvciB0aGUgeC1jb21wb25lbnQgb2YgdGhlIHRvcnF1ZSBpbXB1bHNlIGluIHdvcmxkLXNwYWNlLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBbeV0gLSBUaGUgeS1jb21wb25lbnQgb2YgdGhlIHRvcnF1ZSBpbXB1bHNlIGluIHdvcmxkLXNwYWNlLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBbel0gLSBUaGUgei1jb21wb25lbnQgb2YgdGhlIHRvcnF1ZSBpbXB1bHNlIGluIHdvcmxkLXNwYWNlLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogLy8gQXBwbHkgdmlhIHZlY3RvclxuICAgICAqIGNvbnN0IHRvcnF1ZSA9IG5ldyBwYy5WZWMzKDAsIDEwLCAwKTtcbiAgICAgKiBlbnRpdHkucmlnaWRib2R5LmFwcGx5VG9ycXVlSW1wdWxzZSh0b3JxdWUpO1xuICAgICAqIEBleGFtcGxlXG4gICAgICogLy8gQXBwbHkgdmlhIG51bWJlcnNcbiAgICAgKiBlbnRpdHkucmlnaWRib2R5LmFwcGx5VG9ycXVlSW1wdWxzZSgwLCAxMCwgMCk7XG4gICAgICovXG4gICAgYXBwbHlUb3JxdWVJbXB1bHNlKHgsIHksIHopIHtcbiAgICAgICAgY29uc3QgYm9keSA9IHRoaXMuX2JvZHk7XG4gICAgICAgIGlmIChib2R5KSB7XG4gICAgICAgICAgICBib2R5LmFjdGl2YXRlKCk7XG5cbiAgICAgICAgICAgIGlmICh4IGluc3RhbmNlb2YgVmVjMykge1xuICAgICAgICAgICAgICAgIF9hbW1vVmVjMS5zZXRWYWx1ZSh4LngsIHgueSwgeC56KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgX2FtbW9WZWMxLnNldFZhbHVlKHgsIHksIHopO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBib2R5LmFwcGx5VG9ycXVlSW1wdWxzZShfYW1tb1ZlYzEpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0cnVlIGlmIHRoZSByaWdpZCBib2R5IGlzIG9mIHR5cGUge0BsaW5rIEJPRFlUWVBFX1NUQVRJQ30uXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7Ym9vbGVhbn0gVHJ1ZSBpZiBzdGF0aWMuXG4gICAgICovXG4gICAgaXNTdGF0aWMoKSB7XG4gICAgICAgIHJldHVybiAodGhpcy5fdHlwZSA9PT0gQk9EWVRZUEVfU1RBVElDKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRydWUgaWYgdGhlIHJpZ2lkIGJvZHkgaXMgb2YgdHlwZSB7QGxpbmsgQk9EWVRZUEVfU1RBVElDfSBvciB7QGxpbmsgQk9EWVRZUEVfS0lORU1BVElDfS5cbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtib29sZWFufSBUcnVlIGlmIHN0YXRpYyBvciBraW5lbWF0aWMuXG4gICAgICovXG4gICAgaXNTdGF0aWNPcktpbmVtYXRpYygpIHtcbiAgICAgICAgcmV0dXJuICh0aGlzLl90eXBlID09PSBCT0RZVFlQRV9TVEFUSUMgfHwgdGhpcy5fdHlwZSA9PT0gQk9EWVRZUEVfS0lORU1BVElDKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRydWUgaWYgdGhlIHJpZ2lkIGJvZHkgaXMgb2YgdHlwZSB7QGxpbmsgQk9EWVRZUEVfS0lORU1BVElDfS5cbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtib29sZWFufSBUcnVlIGlmIGtpbmVtYXRpYy5cbiAgICAgKi9cbiAgICBpc0tpbmVtYXRpYygpIHtcbiAgICAgICAgcmV0dXJuICh0aGlzLl90eXBlID09PSBCT0RZVFlQRV9LSU5FTUFUSUMpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFdyaXRlcyBhbiBlbnRpdHkgdHJhbnNmb3JtIGludG8gYW4gQW1tby5idFRyYW5zZm9ybSBidXQgaWdub3Jpbmcgc2NhbGUuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge29iamVjdH0gdHJhbnNmb3JtIC0gVGhlIGFtbW8gdHJhbnNmb3JtIHRvIHdyaXRlIHRoZSBlbnRpdHkgdHJhbnNmb3JtIHRvLlxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX2dldEVudGl0eVRyYW5zZm9ybSh0cmFuc2Zvcm0pIHtcbiAgICAgICAgY29uc3QgZW50aXR5ID0gdGhpcy5lbnRpdHk7XG5cbiAgICAgICAgY29uc3QgY29tcG9uZW50ID0gZW50aXR5LmNvbGxpc2lvbjtcbiAgICAgICAgaWYgKGNvbXBvbmVudCkge1xuICAgICAgICAgICAgY29uc3QgYm9keVBvcyA9IGNvbXBvbmVudC5nZXRTaGFwZVBvc2l0aW9uKCk7XG4gICAgICAgICAgICBjb25zdCBib2R5Um90ID0gY29tcG9uZW50LmdldFNoYXBlUm90YXRpb24oKTtcbiAgICAgICAgICAgIF9hbW1vVmVjMS5zZXRWYWx1ZShib2R5UG9zLngsIGJvZHlQb3MueSwgYm9keVBvcy56KTtcbiAgICAgICAgICAgIF9hbW1vUXVhdC5zZXRWYWx1ZShib2R5Um90LngsIGJvZHlSb3QueSwgYm9keVJvdC56LCBib2R5Um90LncpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc3QgcG9zID0gZW50aXR5LmdldFBvc2l0aW9uKCk7XG4gICAgICAgICAgICBjb25zdCByb3QgPSBlbnRpdHkuZ2V0Um90YXRpb24oKTtcbiAgICAgICAgICAgIF9hbW1vVmVjMS5zZXRWYWx1ZShwb3MueCwgcG9zLnksIHBvcy56KTtcbiAgICAgICAgICAgIF9hbW1vUXVhdC5zZXRWYWx1ZShyb3QueCwgcm90LnksIHJvdC56LCByb3Qudyk7XG4gICAgICAgIH1cblxuICAgICAgICB0cmFuc2Zvcm0uc2V0T3JpZ2luKF9hbW1vVmVjMSk7XG4gICAgICAgIHRyYW5zZm9ybS5zZXRSb3RhdGlvbihfYW1tb1F1YXQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldCB0aGUgcmlnaWQgYm9keSB0cmFuc2Zvcm0gdG8gYmUgdGhlIHNhbWUgYXMgdGhlIEVudGl0eSB0cmFuc2Zvcm0uIFRoaXMgbXVzdCBiZSBjYWxsZWRcbiAgICAgKiBhZnRlciBhbnkgRW50aXR5IHRyYW5zZm9ybWF0aW9uIGZ1bmN0aW9ucyAoZS5nLiB7QGxpbmsgRW50aXR5I3NldFBvc2l0aW9ufSkgYXJlIGNhbGxlZCBpblxuICAgICAqIG9yZGVyIHRvIHVwZGF0ZSB0aGUgcmlnaWQgYm9keSB0byBtYXRjaCB0aGUgRW50aXR5LlxuICAgICAqXG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBzeW5jRW50aXR5VG9Cb2R5KCkge1xuICAgICAgICBjb25zdCBib2R5ID0gdGhpcy5fYm9keTtcbiAgICAgICAgaWYgKGJvZHkpIHtcbiAgICAgICAgICAgIHRoaXMuX2dldEVudGl0eVRyYW5zZm9ybShfYW1tb1RyYW5zZm9ybSk7XG5cbiAgICAgICAgICAgIGJvZHkuc2V0V29ybGRUcmFuc2Zvcm0oX2FtbW9UcmFuc2Zvcm0pO1xuXG4gICAgICAgICAgICBpZiAodGhpcy5fdHlwZSA9PT0gQk9EWVRZUEVfS0lORU1BVElDKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgbW90aW9uU3RhdGUgPSBib2R5LmdldE1vdGlvblN0YXRlKCk7XG4gICAgICAgICAgICAgICAgaWYgKG1vdGlvblN0YXRlKSB7XG4gICAgICAgICAgICAgICAgICAgIG1vdGlvblN0YXRlLnNldFdvcmxkVHJhbnNmb3JtKF9hbW1vVHJhbnNmb3JtKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBib2R5LmFjdGl2YXRlKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIGFuIGVudGl0eSdzIHRyYW5zZm9ybSB0byBtYXRjaCB0aGF0IG9mIHRoZSB3b3JsZCB0cmFuc2Zvcm1hdGlvbiBtYXRyaXggb2YgYSBkeW5hbWljXG4gICAgICogcmlnaWQgYm9keSdzIG1vdGlvbiBzdGF0ZS5cbiAgICAgKlxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX3VwZGF0ZUR5bmFtaWMoKSB7XG4gICAgICAgIGNvbnN0IGJvZHkgPSB0aGlzLl9ib2R5O1xuXG4gICAgICAgIC8vIElmIGEgZHluYW1pYyBib2R5IGlzIGZyb3plbiwgd2UgY2FuIGFzc3VtZSBpdHMgbW90aW9uIHN0YXRlIHRyYW5zZm9ybSBpc1xuICAgICAgICAvLyB0aGUgc2FtZSBpcyB0aGUgZW50aXR5IHdvcmxkIHRyYW5zZm9ybVxuICAgICAgICBpZiAoYm9keS5pc0FjdGl2ZSgpKSB7XG4gICAgICAgICAgICAvLyBVcGRhdGUgdGhlIG1vdGlvbiBzdGF0ZS4gTm90ZSB0aGF0IHRoZSB0ZXN0IGZvciB0aGUgcHJlc2VuY2Ugb2YgdGhlIG1vdGlvblxuICAgICAgICAgICAgLy8gc3RhdGUgaXMgdGVjaG5pY2FsbHkgcmVkdW5kYW50IHNpbmNlIHRoZSBlbmdpbmUgY3JlYXRlcyBvbmUgZm9yIGFsbCBib2RpZXMuXG4gICAgICAgICAgICBjb25zdCBtb3Rpb25TdGF0ZSA9IGJvZHkuZ2V0TW90aW9uU3RhdGUoKTtcbiAgICAgICAgICAgIGlmIChtb3Rpb25TdGF0ZSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGVudGl0eSA9IHRoaXMuZW50aXR5O1xuXG4gICAgICAgICAgICAgICAgbW90aW9uU3RhdGUuZ2V0V29ybGRUcmFuc2Zvcm0oX2FtbW9UcmFuc2Zvcm0pO1xuXG4gICAgICAgICAgICAgICAgY29uc3QgcCA9IF9hbW1vVHJhbnNmb3JtLmdldE9yaWdpbigpO1xuICAgICAgICAgICAgICAgIGNvbnN0IHEgPSBfYW1tb1RyYW5zZm9ybS5nZXRSb3RhdGlvbigpO1xuXG4gICAgICAgICAgICAgICAgY29uc3QgY29tcG9uZW50ID0gZW50aXR5LmNvbGxpc2lvbjtcbiAgICAgICAgICAgICAgICBpZiAoY29tcG9uZW50ICYmIGNvbXBvbmVudC5faGFzT2Zmc2V0KSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGxvID0gY29tcG9uZW50LmRhdGEubGluZWFyT2Zmc2V0O1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBhbyA9IGNvbXBvbmVudC5kYXRhLmFuZ3VsYXJPZmZzZXQ7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gVW4tcm90YXRlIHRoZSBhbmd1bGFyIG9mZnNldCBhbmQgdGhlbiB1c2UgdGhlIG5ldyByb3RhdGlvbiB0b1xuICAgICAgICAgICAgICAgICAgICAvLyB1bi10cmFuc2xhdGUgdGhlIGxpbmVhciBvZmZzZXQgaW4gbG9jYWwgc3BhY2VcbiAgICAgICAgICAgICAgICAgICAgLy8gT3JkZXIgb2Ygb3BlcmF0aW9ucyBtYXR0ZXIgaGVyZVxuICAgICAgICAgICAgICAgICAgICBjb25zdCBpbnZlcnRlZEFvID0gX3F1YXQyLmNvcHkoYW8pLmludmVydCgpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBlbnRpdHlSb3QgPSBfcXVhdDEuc2V0KHEueCgpLCBxLnkoKSwgcS56KCksIHEudygpKS5tdWwoaW52ZXJ0ZWRBbyk7XG5cbiAgICAgICAgICAgICAgICAgICAgZW50aXR5Um90LnRyYW5zZm9ybVZlY3RvcihsbywgX3ZlYzMpO1xuICAgICAgICAgICAgICAgICAgICBlbnRpdHkuc2V0UG9zaXRpb24ocC54KCkgLSBfdmVjMy54LCBwLnkoKSAtIF92ZWMzLnksIHAueigpIC0gX3ZlYzMueik7XG4gICAgICAgICAgICAgICAgICAgIGVudGl0eS5zZXRSb3RhdGlvbihlbnRpdHlSb3QpO1xuXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgZW50aXR5LnNldFBvc2l0aW9uKHAueCgpLCBwLnkoKSwgcC56KCkpO1xuICAgICAgICAgICAgICAgICAgICBlbnRpdHkuc2V0Um90YXRpb24ocS54KCksIHEueSgpLCBxLnooKSwgcS53KCkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFdyaXRlcyB0aGUgZW50aXR5J3Mgd29ybGQgdHJhbnNmb3JtYXRpb24gbWF0cml4IGludG8gdGhlIG1vdGlvbiBzdGF0ZSBvZiBhIGtpbmVtYXRpYyBib2R5LlxuICAgICAqXG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfdXBkYXRlS2luZW1hdGljKCkge1xuICAgICAgICBjb25zdCBtb3Rpb25TdGF0ZSA9IHRoaXMuX2JvZHkuZ2V0TW90aW9uU3RhdGUoKTtcbiAgICAgICAgaWYgKG1vdGlvblN0YXRlKSB7XG4gICAgICAgICAgICB0aGlzLl9nZXRFbnRpdHlUcmFuc2Zvcm0oX2FtbW9UcmFuc2Zvcm0pO1xuICAgICAgICAgICAgbW90aW9uU3RhdGUuc2V0V29ybGRUcmFuc2Zvcm0oX2FtbW9UcmFuc2Zvcm0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVGVsZXBvcnQgYW4gZW50aXR5IHRvIGEgbmV3IHdvcmxkLXNwYWNlIHBvc2l0aW9uLCBvcHRpb25hbGx5IHNldHRpbmcgb3JpZW50YXRpb24uIFRoaXNcbiAgICAgKiBmdW5jdGlvbiBzaG91bGQgb25seSBiZSBjYWxsZWQgZm9yIHJpZ2lkIGJvZGllcyB0aGF0IGFyZSBkeW5hbWljLiBUaGlzIGZ1bmN0aW9uIGhhcyB0aHJlZVxuICAgICAqIHZhbGlkIHNpZ25hdHVyZXMuIFRoZSBmaXJzdCB0YWtlcyBhIDMtZGltZW5zaW9uYWwgdmVjdG9yIGZvciB0aGUgcG9zaXRpb24gYW5kIGFuIG9wdGlvbmFsXG4gICAgICogMy1kaW1lbnNpb25hbCB2ZWN0b3IgZm9yIEV1bGVyIHJvdGF0aW9uLiBUaGUgc2Vjb25kIHRha2VzIGEgMy1kaW1lbnNpb25hbCB2ZWN0b3IgZm9yIHRoZVxuICAgICAqIHBvc2l0aW9uIGFuZCBhbiBvcHRpb25hbCBxdWF0ZXJuaW9uIGZvciByb3RhdGlvbi4gVGhlIHRoaXJkIHRha2VzIDMgbnVtYmVycyBmb3IgdGhlIHBvc2l0aW9uXG4gICAgICogYW5kIGFuIG9wdGlvbmFsIDMgbnVtYmVycyBmb3IgRXVsZXIgcm90YXRpb24uXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1ZlYzN8bnVtYmVyfSB4IC0gQSAzLWRpbWVuc2lvbmFsIHZlY3RvciBob2xkaW5nIHRoZSBuZXcgcG9zaXRpb24gb3IgdGhlIG5ldyBwb3NpdGlvblxuICAgICAqIHgtY29vcmRpbmF0ZS5cbiAgICAgKiBAcGFyYW0ge1F1YXR8VmVjM3xudW1iZXJ9IFt5XSAtIEEgMy1kaW1lbnNpb25hbCB2ZWN0b3Igb3IgcXVhdGVybmlvbiBob2xkaW5nIHRoZSBuZXdcbiAgICAgKiByb3RhdGlvbiBvciB0aGUgbmV3IHBvc2l0aW9uIHktY29vcmRpbmF0ZS5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gW3pdIC0gVGhlIG5ldyBwb3NpdGlvbiB6LWNvb3JkaW5hdGUuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFtyeF0gLSBUaGUgbmV3IEV1bGVyIHgtYW5nbGUgdmFsdWUuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFtyeV0gLSBUaGUgbmV3IEV1bGVyIHktYW5nbGUgdmFsdWUuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFtyel0gLSBUaGUgbmV3IEV1bGVyIHotYW5nbGUgdmFsdWUuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiAvLyBUZWxlcG9ydCB0aGUgZW50aXR5IHRvIHRoZSBvcmlnaW5cbiAgICAgKiBlbnRpdHkucmlnaWRib2R5LnRlbGVwb3J0KHBjLlZlYzMuWkVSTyk7XG4gICAgICogQGV4YW1wbGVcbiAgICAgKiAvLyBUZWxlcG9ydCB0aGUgZW50aXR5IHRvIHRoZSBvcmlnaW5cbiAgICAgKiBlbnRpdHkucmlnaWRib2R5LnRlbGVwb3J0KDAsIDAsIDApO1xuICAgICAqIEBleGFtcGxlXG4gICAgICogLy8gVGVsZXBvcnQgdGhlIGVudGl0eSB0byB3b3JsZC1zcGFjZSBjb29yZGluYXRlIFsxLCAyLCAzXSBhbmQgcmVzZXQgb3JpZW50YXRpb25cbiAgICAgKiBjb25zdCBwb3NpdGlvbiA9IG5ldyBwYy5WZWMzKDEsIDIsIDMpO1xuICAgICAqIGVudGl0eS5yaWdpZGJvZHkudGVsZXBvcnQocG9zaXRpb24sIHBjLlZlYzMuWkVSTyk7XG4gICAgICogQGV4YW1wbGVcbiAgICAgKiAvLyBUZWxlcG9ydCB0aGUgZW50aXR5IHRvIHdvcmxkLXNwYWNlIGNvb3JkaW5hdGUgWzEsIDIsIDNdIGFuZCByZXNldCBvcmllbnRhdGlvblxuICAgICAqIGVudGl0eS5yaWdpZGJvZHkudGVsZXBvcnQoMSwgMiwgMywgMCwgMCwgMCk7XG4gICAgICovXG4gICAgdGVsZXBvcnQoeCwgeSwgeiwgcngsIHJ5LCByeikge1xuICAgICAgICBpZiAoeCBpbnN0YW5jZW9mIFZlYzMpIHtcbiAgICAgICAgICAgIHRoaXMuZW50aXR5LnNldFBvc2l0aW9uKHgpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5lbnRpdHkuc2V0UG9zaXRpb24oeCwgeSwgeik7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoeSBpbnN0YW5jZW9mIFF1YXQpIHtcbiAgICAgICAgICAgIHRoaXMuZW50aXR5LnNldFJvdGF0aW9uKHkpO1xuICAgICAgICB9IGVsc2UgaWYgKHkgaW5zdGFuY2VvZiBWZWMzKSB7XG4gICAgICAgICAgICB0aGlzLmVudGl0eS5zZXRFdWxlckFuZ2xlcyh5KTtcbiAgICAgICAgfSBlbHNlIGlmIChyeCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aGlzLmVudGl0eS5zZXRFdWxlckFuZ2xlcyhyeCwgcnksIHJ6KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuc3luY0VudGl0eVRvQm9keSgpO1xuICAgIH1cblxuICAgIC8qKiBAaWdub3JlICovXG4gICAgb25FbmFibGUoKSB7XG4gICAgICAgIGlmICghdGhpcy5fYm9keSkge1xuICAgICAgICAgICAgdGhpcy5jcmVhdGVCb2R5KCk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmVuYWJsZVNpbXVsYXRpb24oKTtcbiAgICB9XG5cbiAgICAvKiogQGlnbm9yZSAqL1xuICAgIG9uRGlzYWJsZSgpIHtcbiAgICAgICAgdGhpcy5kaXNhYmxlU2ltdWxhdGlvbigpO1xuICAgIH1cbn1cblxuZXhwb3J0IHsgUmlnaWRCb2R5Q29tcG9uZW50IH07XG4iXSwibmFtZXMiOlsiX2FtbW9UcmFuc2Zvcm0iLCJfYW1tb1ZlYzEiLCJfYW1tb1ZlYzIiLCJfYW1tb1F1YXQiLCJfcXVhdDEiLCJRdWF0IiwiX3F1YXQyIiwiX3ZlYzMiLCJWZWMzIiwiUmlnaWRCb2R5Q29tcG9uZW50IiwiQ29tcG9uZW50IiwiY29uc3RydWN0b3IiLCJzeXN0ZW0iLCJlbnRpdHkiLCJfYW5ndWxhckRhbXBpbmciLCJfYW5ndWxhckZhY3RvciIsIl9hbmd1bGFyVmVsb2NpdHkiLCJfYm9keSIsIl9mcmljdGlvbiIsIl9ncm91cCIsIkJPRFlHUk9VUF9TVEFUSUMiLCJfbGluZWFyRGFtcGluZyIsIl9saW5lYXJGYWN0b3IiLCJfbGluZWFyVmVsb2NpdHkiLCJfbWFzayIsIkJPRFlNQVNLX05PVF9TVEFUSUMiLCJfbWFzcyIsIl9yZXN0aXR1dGlvbiIsIl9yb2xsaW5nRnJpY3Rpb24iLCJfc2ltdWxhdGlvbkVuYWJsZWQiLCJfdHlwZSIsIkJPRFlUWVBFX1NUQVRJQyIsIm9uTGlicmFyeUxvYWRlZCIsIkFtbW8iLCJidFRyYW5zZm9ybSIsImJ0VmVjdG9yMyIsImJ0UXVhdGVybmlvbiIsImFuZ3VsYXJEYW1waW5nIiwiZGFtcGluZyIsInNldERhbXBpbmciLCJhbmd1bGFyRmFjdG9yIiwiZmFjdG9yIiwiZXF1YWxzIiwiY29weSIsIkJPRFlUWVBFX0RZTkFNSUMiLCJzZXRWYWx1ZSIsIngiLCJ5IiwieiIsInNldEFuZ3VsYXJGYWN0b3IiLCJhbmd1bGFyVmVsb2NpdHkiLCJ2ZWxvY2l0eSIsImFjdGl2YXRlIiwic2V0QW5ndWxhclZlbG9jaXR5IiwiZ2V0QW5ndWxhclZlbG9jaXR5Iiwic2V0IiwiYm9keSIsImZyaWN0aW9uIiwic2V0RnJpY3Rpb24iLCJncm91cCIsImVuYWJsZWQiLCJkaXNhYmxlU2ltdWxhdGlvbiIsImVuYWJsZVNpbXVsYXRpb24iLCJsaW5lYXJEYW1waW5nIiwibGluZWFyRmFjdG9yIiwic2V0TGluZWFyRmFjdG9yIiwibGluZWFyVmVsb2NpdHkiLCJzZXRMaW5lYXJWZWxvY2l0eSIsImdldExpbmVhclZlbG9jaXR5IiwibWFzayIsIm1hc3MiLCJnZXRDb2xsaXNpb25TaGFwZSIsImNhbGN1bGF0ZUxvY2FsSW5lcnRpYSIsInNldE1hc3NQcm9wcyIsInVwZGF0ZUluZXJ0aWFUZW5zb3IiLCJyZXN0aXR1dGlvbiIsInNldFJlc3RpdHV0aW9uIiwicm9sbGluZ0ZyaWN0aW9uIiwic2V0Um9sbGluZ0ZyaWN0aW9uIiwidHlwZSIsIkJPRFlHUk9VUF9EWU5BTUlDIiwiQk9EWU1BU0tfQUxMIiwiQk9EWVRZUEVfS0lORU1BVElDIiwiQk9EWUdST1VQX0tJTkVNQVRJQyIsImNyZWF0ZUJvZHkiLCJzaGFwZSIsImNvbGxpc2lvbiIsInRyaWdnZXIiLCJkZXN0cm95Iiwib25SZW1vdmUiLCJfZ2V0RW50aXR5VHJhbnNmb3JtIiwic2V0Q29sbGlzaW9uRmxhZ3MiLCJnZXRDb2xsaXNpb25GbGFncyIsIkJPRFlGTEFHX0tJTkVNQVRJQ19PQkpFQ1QiLCJzZXRBY3RpdmF0aW9uU3RhdGUiLCJCT0RZU1RBVEVfRElTQUJMRV9ERUFDVElWQVRJT04iLCJpc0FjdGl2ZSIsImFkZEJvZHkiLCJfZHluYW1pYyIsInB1c2giLCJmb3JjZUFjdGl2YXRpb25TdGF0ZSIsIkJPRFlTVEFURV9BQ1RJVkVfVEFHIiwic3luY0VudGl0eVRvQm9keSIsIl9raW5lbWF0aWMiLCJfY29tcG91bmRzIiwiaWR4IiwiaW5kZXhPZiIsInNwbGljZSIsInJlbW92ZUJvZHkiLCJCT0RZU1RBVEVfRElTQUJMRV9TSU1VTEFUSU9OIiwiYXBwbHlGb3JjZSIsInB4IiwicHkiLCJweiIsInVuZGVmaW5lZCIsImFwcGx5VG9ycXVlIiwiYXBwbHlJbXB1bHNlIiwiYXBwbHlUb3JxdWVJbXB1bHNlIiwiaXNTdGF0aWMiLCJpc1N0YXRpY09yS2luZW1hdGljIiwiaXNLaW5lbWF0aWMiLCJ0cmFuc2Zvcm0iLCJjb21wb25lbnQiLCJib2R5UG9zIiwiZ2V0U2hhcGVQb3NpdGlvbiIsImJvZHlSb3QiLCJnZXRTaGFwZVJvdGF0aW9uIiwidyIsInBvcyIsImdldFBvc2l0aW9uIiwicm90IiwiZ2V0Um90YXRpb24iLCJzZXRPcmlnaW4iLCJzZXRSb3RhdGlvbiIsInNldFdvcmxkVHJhbnNmb3JtIiwibW90aW9uU3RhdGUiLCJnZXRNb3Rpb25TdGF0ZSIsIl91cGRhdGVEeW5hbWljIiwiZ2V0V29ybGRUcmFuc2Zvcm0iLCJwIiwiZ2V0T3JpZ2luIiwicSIsIl9oYXNPZmZzZXQiLCJsbyIsImRhdGEiLCJsaW5lYXJPZmZzZXQiLCJhbyIsImFuZ3VsYXJPZmZzZXQiLCJpbnZlcnRlZEFvIiwiaW52ZXJ0IiwiZW50aXR5Um90IiwibXVsIiwidHJhbnNmb3JtVmVjdG9yIiwic2V0UG9zaXRpb24iLCJfdXBkYXRlS2luZW1hdGljIiwidGVsZXBvcnQiLCJyeCIsInJ5IiwicnoiLCJzZXRFdWxlckFuZ2xlcyIsIm9uRW5hYmxlIiwi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
