import { now } from '../../../core/time.js';
import { ObjectPool } from '../../../core/object-pool.js';
import { Debug } from '../../../core/debug.js';
import { Vec3 } from '../../../core/math/vec3.js';
import { Component } from '../component.js';
import { ComponentSystem } from '../system.js';
import { BODYFLAG_NORESPONSE_OBJECT } from './constants.js';
import { RigidBodyComponent } from './component.js';
import { RigidBodyComponentData } from './data.js';

let ammoRayStart, ammoRayEnd;

/**
 * Object holding the result of a successful raycast hit.
 *
 * @category Physics
 */
class RaycastResult {
  /**
   * Create a new RaycastResult instance.
   *
   * @param {import('../../entity.js').Entity} entity - The entity that was hit.
   * @param {Vec3} point - The point at which the ray hit the entity in world space.
   * @param {Vec3} normal - The normal vector of the surface where the ray hit in world space.
   * @param {number} hitFraction - The normalized distance (between 0 and 1) at which the ray hit
   * occurred from the starting point.
   * @hideconstructor
   */
  constructor(entity, point, normal, hitFraction) {
    /**
     * The entity that was hit.
     *
     * @type {import('../../entity.js').Entity}
     */
    this.entity = entity;

    /**
     * The point at which the ray hit the entity in world space.
     *
     * @type {Vec3}
     */
    this.point = point;

    /**
     * The normal vector of the surface where the ray hit in world space.
     *
     * @type {Vec3}
     */
    this.normal = normal;

    /**
     * The normalized distance (between 0 and 1) at which the ray hit occurred from the
     * starting point.
     *
     * @type {number}
     */
    this.hitFraction = hitFraction;
  }
}

/**
 * Object holding the result of a contact between two rigid bodies.
 *
 * @category Physics
 */
class SingleContactResult {
  /**
   * Create a new SingleContactResult instance.
   *
   * @param {import('../../entity.js').Entity} a - The first entity involved in the contact.
   * @param {import('../../entity.js').Entity} b - The second entity involved in the contact.
   * @param {ContactPoint} contactPoint - The contact point between the two entities.
   * @hideconstructor
   */
  constructor(a, b, contactPoint) {
    if (arguments.length === 0) {
      /**
       * The first entity involved in the contact.
       *
       * @type {import('../../entity.js').Entity}
       */
      this.a = null;

      /**
       * The second entity involved in the contact.
       *
       * @type {import('../../entity.js').Entity}
       */
      this.b = null;

      /**
       * The total accumulated impulse applied by the constraint solver during the last
       * sub-step. Describes how hard two bodies collided.
       *
       * @type {number}
       */
      this.impulse = 0;

      /**
       * The point on Entity A where the contact occurred, relative to A.
       *
       * @type {Vec3}
       */
      this.localPointA = new Vec3();

      /**
       * The point on Entity B where the contact occurred, relative to B.
       *
       * @type {Vec3}
       */
      this.localPointB = new Vec3();

      /**
       * The point on Entity A where the contact occurred, in world space.
       *
       * @type {Vec3}
       */
      this.pointA = new Vec3();

      /**
       * The point on Entity B where the contact occurred, in world space.
       *
       * @type {Vec3}
       */
      this.pointB = new Vec3();

      /**
       * The normal vector of the contact on Entity B, in world space.
       *
       * @type {Vec3}
       */
      this.normal = new Vec3();
    } else {
      this.a = a;
      this.b = b;
      this.impulse = contactPoint.impulse;
      this.localPointA = contactPoint.localPoint;
      this.localPointB = contactPoint.localPointOther;
      this.pointA = contactPoint.point;
      this.pointB = contactPoint.pointOther;
      this.normal = contactPoint.normal;
    }
  }
}

/**
 * Object holding the result of a contact between two Entities.
 *
 * @category Physics
 */
class ContactPoint {
  /**
   * Create a new ContactPoint instance.
   *
   * @param {Vec3} [localPoint] - The point on the entity where the contact occurred, relative to
   * the entity.
   * @param {Vec3} [localPointOther] - The point on the other entity where the contact occurred,
   * relative to the other entity.
   * @param {Vec3} [point] - The point on the entity where the contact occurred, in world space.
   * @param {Vec3} [pointOther] - The point on the other entity where the contact occurred, in
   * world space.
   * @param {Vec3} [normal] - The normal vector of the contact on the other entity, in world
   * space.
   * @param {number} [impulse] - The total accumulated impulse applied by the constraint solver
   * during the last sub-step. Describes how hard two objects collide. Defaults to 0.
   * @hideconstructor
   */
  constructor(localPoint = new Vec3(), localPointOther = new Vec3(), point = new Vec3(), pointOther = new Vec3(), normal = new Vec3(), impulse = 0) {
    /**
     * The point on the entity where the contact occurred, relative to the entity.
     *
     * @type {Vec3}
     */
    this.localPoint = localPoint;

    /**
     * The point on the other entity where the contact occurred, relative to the other entity.
     *
     * @type {Vec3}
     */
    this.localPointOther = localPointOther;

    /**
     * The point on the entity where the contact occurred, in world space.
     *
     * @type {Vec3}
     */
    this.point = point;

    /**
     * The point on the other entity where the contact occurred, in world space.
     *
     * @type {Vec3}
     */
    this.pointOther = pointOther;

    /**
     * The normal vector of the contact on the other entity, in world space.
     *
     * @type {Vec3}
     */
    this.normal = normal;

    /**
     * The total accumulated impulse applied by the constraint solver during the last sub-step.
     * Describes how hard two objects collide.
     *
     * @type {number}
     */
    this.impulse = impulse;
  }
}

/**
 * Object holding the result of a contact between two Entities.
 *
 * @category Physics
 */
class ContactResult {
  /**
   * Create a new ContactResult instance.
   *
   * @param {import('../../entity.js').Entity} other - The entity that was involved in the
   * contact with this entity.
   * @param {ContactPoint[]} contacts - An array of ContactPoints with the other entity.
   * @hideconstructor
   */
  constructor(other, contacts) {
    /**
     * The entity that was involved in the contact with this entity.
     *
     * @type {import('../../entity.js').Entity}
     */
    this.other = other;

    /**
     * An array of ContactPoints with the other entity.
     *
     * @type {ContactPoint[]}
     */
    this.contacts = contacts;
  }
}
const _schema = ['enabled'];

/**
 * The RigidBodyComponentSystem maintains the dynamics world for simulating rigid bodies, it also
 * controls global values for the world such as gravity. Note: The RigidBodyComponentSystem is only
 * valid if 3D Physics is enabled in your application. You can enable this in the application
 * settings for your project.
 *
 * @augments ComponentSystem
 * @category Physics
 */
class RigidBodyComponentSystem extends ComponentSystem {
  /**
   * Create a new RigidBodyComponentSystem.
   *
   * @param {import('../../app-base.js').AppBase} app - The Application.
   * @hideconstructor
   */
  constructor(app) {
    super(app);
    /**
     * @type {number}
     * @ignore
     */
    this.maxSubSteps = 10;
    /**
     * @type {number}
     * @ignore
     */
    this.fixedTimeStep = 1 / 60;
    /**
     * The world space vector representing global gravity in the physics simulation. Defaults to
     * [0, -9.81, 0] which is an approximation of the gravitational force on Earth.
     *
     * @type {Vec3}
     */
    this.gravity = new Vec3(0, -9.81, 0);
    /**
     * @type {Float32Array}
     * @private
     */
    this._gravityFloat32 = new Float32Array(3);
    /**
     * @type {RigidBodyComponent[]}
     * @private
     */
    this._dynamic = [];
    /**
     * @type {RigidBodyComponent[]}
     * @private
     */
    this._kinematic = [];
    /**
     * @type {RigidBodyComponent[]}
     * @private
     */
    this._triggers = [];
    /**
     * @type {RigidBodyComponent[]}
     * @private
     */
    this._compounds = [];
    this.id = 'rigidbody';
    this._stats = app.stats.frame;
    this.ComponentType = RigidBodyComponent;
    this.DataType = RigidBodyComponentData;
    this.contactPointPool = null;
    this.contactResultPool = null;
    this.singleContactResultPool = null;
    this.schema = _schema;
    this.collisions = {};
    this.frameCollisions = {};
    this.on('beforeremove', this.onBeforeRemove, this);
    this.on('remove', this.onRemove, this);
  }

  /**
   * Fired when a contact occurs between two rigid bodies.
   *
   * @event RigidBodyComponentSystem#contact
   * @param {SingleContactResult} result - Details of the contact between the two bodies.
   */

  /**
   * Called once Ammo has been loaded. Responsible for creating the physics world.
   *
   * @ignore
   */
  onLibraryLoaded() {
    // Create the Ammo physics world
    if (typeof Ammo !== 'undefined') {
      this.collisionConfiguration = new Ammo.btDefaultCollisionConfiguration();
      this.dispatcher = new Ammo.btCollisionDispatcher(this.collisionConfiguration);
      this.overlappingPairCache = new Ammo.btDbvtBroadphase();
      this.solver = new Ammo.btSequentialImpulseConstraintSolver();
      this.dynamicsWorld = new Ammo.btDiscreteDynamicsWorld(this.dispatcher, this.overlappingPairCache, this.solver, this.collisionConfiguration);
      if (this.dynamicsWorld.setInternalTickCallback) {
        const checkForCollisionsPointer = Ammo.addFunction(this._checkForCollisions.bind(this), 'vif');
        this.dynamicsWorld.setInternalTickCallback(checkForCollisionsPointer);
      } else {
        Debug.warn('WARNING: This version of ammo.js can potentially fail to report contacts. Please update it to the latest version.');
      }

      // Lazily create temp vars
      ammoRayStart = new Ammo.btVector3();
      ammoRayEnd = new Ammo.btVector3();
      RigidBodyComponent.onLibraryLoaded();
      this.contactPointPool = new ObjectPool(ContactPoint, 1);
      this.contactResultPool = new ObjectPool(ContactResult, 1);
      this.singleContactResultPool = new ObjectPool(SingleContactResult, 1);
      this.app.systems.on('update', this.onUpdate, this);
    } else {
      // Unbind the update function if we haven't loaded Ammo by now
      this.app.systems.off('update', this.onUpdate, this);
    }
  }
  initializeComponentData(component, data, properties) {
    const props = ['mass', 'linearDamping', 'angularDamping', 'linearFactor', 'angularFactor', 'friction', 'rollingFriction', 'restitution', 'type', 'group', 'mask'];
    for (const property of props) {
      if (data.hasOwnProperty(property)) {
        const value = data[property];
        if (Array.isArray(value)) {
          component[property] = new Vec3(value[0], value[1], value[2]);
        } else {
          component[property] = value;
        }
      }
    }
    super.initializeComponentData(component, data, ['enabled']);
  }
  cloneComponent(entity, clone) {
    // create new data block for clone
    const rigidbody = entity.rigidbody;
    const data = {
      enabled: rigidbody.enabled,
      mass: rigidbody.mass,
      linearDamping: rigidbody.linearDamping,
      angularDamping: rigidbody.angularDamping,
      linearFactor: [rigidbody.linearFactor.x, rigidbody.linearFactor.y, rigidbody.linearFactor.z],
      angularFactor: [rigidbody.angularFactor.x, rigidbody.angularFactor.y, rigidbody.angularFactor.z],
      friction: rigidbody.friction,
      rollingFriction: rigidbody.rollingFriction,
      restitution: rigidbody.restitution,
      type: rigidbody.type,
      group: rigidbody.group,
      mask: rigidbody.mask
    };
    return this.addComponent(clone, data);
  }
  onBeforeRemove(entity, component) {
    if (component.enabled) {
      component.enabled = false;
    }
  }
  onRemove(entity, component) {
    const body = component.body;
    if (body) {
      this.removeBody(body);
      this.destroyBody(body);
      component.body = null;
    }
  }
  addBody(body, group, mask) {
    if (group !== undefined && mask !== undefined) {
      this.dynamicsWorld.addRigidBody(body, group, mask);
    } else {
      this.dynamicsWorld.addRigidBody(body);
    }
  }
  removeBody(body) {
    this.dynamicsWorld.removeRigidBody(body);
  }
  createBody(mass, shape, transform) {
    const localInertia = new Ammo.btVector3(0, 0, 0);
    if (mass !== 0) {
      shape.calculateLocalInertia(mass, localInertia);
    }
    const motionState = new Ammo.btDefaultMotionState(transform);
    const bodyInfo = new Ammo.btRigidBodyConstructionInfo(mass, motionState, shape, localInertia);
    const body = new Ammo.btRigidBody(bodyInfo);
    Ammo.destroy(bodyInfo);
    Ammo.destroy(localInertia);
    return body;
  }
  destroyBody(body) {
    // The motion state needs to be destroyed explicitly (if present)
    const motionState = body.getMotionState();
    if (motionState) {
      Ammo.destroy(motionState);
    }
    Ammo.destroy(body);
  }

  /**
   * Raycast the world and return the first entity the ray hits. Fire a ray into the world from
   * start to end, if the ray hits an entity with a collision component, it returns a
   * {@link RaycastResult}, otherwise returns null.
   *
   * @param {Vec3} start - The world space point where the ray starts.
   * @param {Vec3} end - The world space point where the ray ends.
   * @param {object} [options] - The additional options for the raycasting.
   * @param {number} [options.filterCollisionGroup] - Collision group to apply to the raycast.
   * @param {number} [options.filterCollisionMask] - Collision mask to apply to the raycast.
   * @param {any[]} [options.filterTags] - Tags filters. Defined the same way as a {@link Tags#has}
   * query but within an array.
   * @param {Function} [options.filterCallback] - Custom function to use to filter entities.
   * Must return true to proceed with result. Takes one argument: the entity to evaluate.
   *
   * @returns {RaycastResult|null} The result of the raycasting or null if there was no hit.
   */
  raycastFirst(start, end, options = {}) {
    // Tags and custom callback can only be performed by looking at all results.
    if (options.filterTags || options.filterCallback) {
      options.sort = true;
      return this.raycastAll(start, end, options)[0] || null;
    }
    let result = null;
    ammoRayStart.setValue(start.x, start.y, start.z);
    ammoRayEnd.setValue(end.x, end.y, end.z);
    const rayCallback = new Ammo.ClosestRayResultCallback(ammoRayStart, ammoRayEnd);
    if (typeof options.filterCollisionGroup === 'number') {
      rayCallback.set_m_collisionFilterGroup(options.filterCollisionGroup);
    }
    if (typeof options.filterCollisionMask === 'number') {
      rayCallback.set_m_collisionFilterMask(options.filterCollisionMask);
    }
    this.dynamicsWorld.rayTest(ammoRayStart, ammoRayEnd, rayCallback);
    if (rayCallback.hasHit()) {
      const collisionObj = rayCallback.get_m_collisionObject();
      const body = Ammo.castObject(collisionObj, Ammo.btRigidBody);
      if (body) {
        const point = rayCallback.get_m_hitPointWorld();
        const normal = rayCallback.get_m_hitNormalWorld();
        result = new RaycastResult(body.entity, new Vec3(point.x(), point.y(), point.z()), new Vec3(normal.x(), normal.y(), normal.z()), rayCallback.get_m_closestHitFraction());
      }
    }
    Ammo.destroy(rayCallback);
    return result;
  }

  /**
   * Raycast the world and return all entities the ray hits. It returns an array of
   * {@link RaycastResult}, one for each hit. If no hits are detected, the returned array will be
   * of length 0. Results are sorted by distance with closest first.
   *
   * @param {Vec3} start - The world space point where the ray starts.
   * @param {Vec3} end - The world space point where the ray ends.
   * @param {object} [options] - The additional options for the raycasting.
   * @param {boolean} [options.sort] - Whether to sort raycast results based on distance with closest
   * first. Defaults to false.
   * @param {number} [options.filterCollisionGroup] - Collision group to apply to the raycast.
   * @param {number} [options.filterCollisionMask] - Collision mask to apply to the raycast.
   * @param {any[]} [options.filterTags] - Tags filters. Defined the same way as a {@link Tags#has}
   * query but within an array.
   * @param {Function} [options.filterCallback] - Custom function to use to filter entities.
   * Must return true to proceed with result. Takes the entity to evaluate as argument.
   *
   * @returns {RaycastResult[]} An array of raycast hit results (0 length if there were no hits).
   *
   * @example
   * // Return all results of a raycast between 0, 2, 2 and 0, -2, -2
   * const hits = this.app.systems.rigidbody.raycastAll(new Vec3(0, 2, 2), new Vec3(0, -2, -2));
   * @example
   * // Return all results of a raycast between 0, 2, 2 and 0, -2, -2
   * // where hit entity is tagged with `bird` OR `mammal`
   * const hits = this.app.systems.rigidbody.raycastAll(new Vec3(0, 2, 2), new Vec3(0, -2, -2), {
   *     filterTags: [ "bird", "mammal" ]
   * });
   * @example
   * // Return all results of a raycast between 0, 2, 2 and 0, -2, -2
   * // where hit entity has a `camera` component
   * const hits = this.app.systems.rigidbody.raycastAll(new Vec3(0, 2, 2), new Vec3(0, -2, -2), {
   *     filterCallback: (entity) => entity && entity.camera
   * });
   * @example
   * // Return all results of a raycast between 0, 2, 2 and 0, -2, -2
   * // where hit entity is tagged with (`carnivore` AND `mammal`) OR (`carnivore` AND `reptile`)
   * // and the entity has an `anim` component
   * const hits = this.app.systems.rigidbody.raycastAll(new Vec3(0, 2, 2), new Vec3(0, -2, -2), {
   *     filterTags: [
   *         [ "carnivore", "mammal" ],
   *         [ "carnivore", "reptile" ]
   *     ],
   *     filterCallback: (entity) => entity && entity.anim
   * });
   */
  raycastAll(start, end, options = {}) {
    Debug.assert(Ammo.AllHitsRayResultCallback, 'pc.RigidBodyComponentSystem#raycastAll: Your version of ammo.js does not expose Ammo.AllHitsRayResultCallback. Update it to latest.');
    const results = [];
    ammoRayStart.setValue(start.x, start.y, start.z);
    ammoRayEnd.setValue(end.x, end.y, end.z);
    const rayCallback = new Ammo.AllHitsRayResultCallback(ammoRayStart, ammoRayEnd);

    // Ignore backfaces
    rayCallback.set_m_flags(1 << 0);
    if (typeof options.filterCollisionGroup === 'number') {
      rayCallback.set_m_collisionFilterGroup(options.filterCollisionGroup);
    }
    if (typeof options.filterCollisionMask === 'number') {
      rayCallback.set_m_collisionFilterMask(options.filterCollisionMask);
    }
    this.dynamicsWorld.rayTest(ammoRayStart, ammoRayEnd, rayCallback);
    if (rayCallback.hasHit()) {
      const collisionObjs = rayCallback.get_m_collisionObjects();
      const points = rayCallback.get_m_hitPointWorld();
      const normals = rayCallback.get_m_hitNormalWorld();
      const hitFractions = rayCallback.get_m_hitFractions();
      const numHits = collisionObjs.size();
      for (let i = 0; i < numHits; i++) {
        const body = Ammo.castObject(collisionObjs.at(i), Ammo.btRigidBody);
        if (body && body.entity) {
          if (options.filterTags && !body.entity.tags.has(...options.filterTags) || options.filterCallback && !options.filterCallback(body.entity)) {
            continue;
          }
          const point = points.at(i);
          const normal = normals.at(i);
          const result = new RaycastResult(body.entity, new Vec3(point.x(), point.y(), point.z()), new Vec3(normal.x(), normal.y(), normal.z()), hitFractions.at(i));
          results.push(result);
        }
      }
      if (options.sort) {
        results.sort((a, b) => a.hitFraction - b.hitFraction);
      }
    }
    Ammo.destroy(rayCallback);
    return results;
  }

  /**
   * Stores a collision between the entity and other in the contacts map and returns true if it
   * is a new collision.
   *
   * @param {import('../../entity.js').Entity} entity - The entity.
   * @param {import('../../entity.js').Entity} other - The entity that collides with the first
   * entity.
   * @returns {boolean} True if this is a new collision, false otherwise.
   * @private
   */
  _storeCollision(entity, other) {
    let isNewCollision = false;
    const guid = entity.getGuid();
    this.collisions[guid] = this.collisions[guid] || {
      others: [],
      entity: entity
    };
    if (this.collisions[guid].others.indexOf(other) < 0) {
      this.collisions[guid].others.push(other);
      isNewCollision = true;
    }
    this.frameCollisions[guid] = this.frameCollisions[guid] || {
      others: [],
      entity: entity
    };
    this.frameCollisions[guid].others.push(other);
    return isNewCollision;
  }
  _createContactPointFromAmmo(contactPoint) {
    const localPointA = contactPoint.get_m_localPointA();
    const localPointB = contactPoint.get_m_localPointB();
    const positionWorldOnA = contactPoint.getPositionWorldOnA();
    const positionWorldOnB = contactPoint.getPositionWorldOnB();
    const normalWorldOnB = contactPoint.get_m_normalWorldOnB();
    const contact = this.contactPointPool.allocate();
    contact.localPoint.set(localPointA.x(), localPointA.y(), localPointA.z());
    contact.localPointOther.set(localPointB.x(), localPointB.y(), localPointB.z());
    contact.point.set(positionWorldOnA.x(), positionWorldOnA.y(), positionWorldOnA.z());
    contact.pointOther.set(positionWorldOnB.x(), positionWorldOnB.y(), positionWorldOnB.z());
    contact.normal.set(normalWorldOnB.x(), normalWorldOnB.y(), normalWorldOnB.z());
    contact.impulse = contactPoint.getAppliedImpulse();
    return contact;
  }
  _createReverseContactPointFromAmmo(contactPoint) {
    const localPointA = contactPoint.get_m_localPointA();
    const localPointB = contactPoint.get_m_localPointB();
    const positionWorldOnA = contactPoint.getPositionWorldOnA();
    const positionWorldOnB = contactPoint.getPositionWorldOnB();
    const normalWorldOnB = contactPoint.get_m_normalWorldOnB();
    const contact = this.contactPointPool.allocate();
    contact.localPointOther.set(localPointA.x(), localPointA.y(), localPointA.z());
    contact.localPoint.set(localPointB.x(), localPointB.y(), localPointB.z());
    contact.pointOther.set(positionWorldOnA.x(), positionWorldOnA.y(), positionWorldOnA.z());
    contact.point.set(positionWorldOnB.x(), positionWorldOnB.y(), positionWorldOnB.z());
    contact.normal.set(normalWorldOnB.x(), normalWorldOnB.y(), normalWorldOnB.z());
    contact.impulse = contactPoint.getAppliedImpulse();
    return contact;
  }
  _createSingleContactResult(a, b, contactPoint) {
    const result = this.singleContactResultPool.allocate();
    result.a = a;
    result.b = b;
    result.localPointA = contactPoint.localPoint;
    result.localPointB = contactPoint.localPointOther;
    result.pointA = contactPoint.point;
    result.pointB = contactPoint.pointOther;
    result.normal = contactPoint.normal;
    result.impulse = contactPoint.impulse;
    return result;
  }
  _createContactResult(other, contacts) {
    const result = this.contactResultPool.allocate();
    result.other = other;
    result.contacts = contacts;
    return result;
  }

  /**
   * Removes collisions that no longer exist from the collisions list and fires collisionend
   * events to the related entities.
   *
   * @private
   */
  _cleanOldCollisions() {
    for (const guid in this.collisions) {
      if (this.collisions.hasOwnProperty(guid)) {
        const frameCollision = this.frameCollisions[guid];
        const collision = this.collisions[guid];
        const entity = collision.entity;
        const entityCollision = entity.collision;
        const entityRigidbody = entity.rigidbody;
        const others = collision.others;
        const length = others.length;
        let i = length;
        while (i--) {
          const other = others[i];
          // if the contact does not exist in the current frame collisions then fire event
          if (!frameCollision || frameCollision.others.indexOf(other) < 0) {
            // remove from others list
            others.splice(i, 1);
            if (entity.trigger) {
              // handle a trigger entity
              if (entityCollision) {
                entityCollision.fire('triggerleave', other);
              }
              if (other.rigidbody) {
                other.rigidbody.fire('triggerleave', entity);
              }
            } else if (!other.trigger) {
              // suppress events if the other entity is a trigger
              if (entityRigidbody) {
                entityRigidbody.fire('collisionend', other);
              }
              if (entityCollision) {
                entityCollision.fire('collisionend', other);
              }
            }
          }
        }
        if (others.length === 0) {
          delete this.collisions[guid];
        }
      }
    }
  }

  /**
   * Returns true if the entity has a contact event attached and false otherwise.
   *
   * @param {import('../../entity.js').Entity} entity - Entity to test.
   * @returns {boolean} True if the entity has a contact and false otherwise.
   * @private
   */
  _hasContactEvent(entity) {
    const c = entity.collision;
    if (c && (c.hasEvent('collisionstart') || c.hasEvent('collisionend') || c.hasEvent('contact'))) {
      return true;
    }
    const r = entity.rigidbody;
    return r && (r.hasEvent('collisionstart') || r.hasEvent('collisionend') || r.hasEvent('contact'));
  }

  /**
   * Checks for collisions and fires collision events.
   *
   * @param {number} world - The pointer to the dynamics world that invoked this callback.
   * @param {number} timeStep - The amount of simulation time processed in the last simulation tick.
   * @private
   */
  _checkForCollisions(world, timeStep) {
    const dynamicsWorld = Ammo.wrapPointer(world, Ammo.btDynamicsWorld);

    // Check for collisions and fire callbacks
    const dispatcher = dynamicsWorld.getDispatcher();
    const numManifolds = dispatcher.getNumManifolds();
    this.frameCollisions = {};

    // loop through the all contacts and fire events
    for (let i = 0; i < numManifolds; i++) {
      const manifold = dispatcher.getManifoldByIndexInternal(i);
      const body0 = manifold.getBody0();
      const body1 = manifold.getBody1();
      const wb0 = Ammo.castObject(body0, Ammo.btRigidBody);
      const wb1 = Ammo.castObject(body1, Ammo.btRigidBody);
      const e0 = wb0.entity;
      const e1 = wb1.entity;

      // check if entity is null - TODO: investigate when this happens
      if (!e0 || !e1) {
        continue;
      }
      const flags0 = wb0.getCollisionFlags();
      const flags1 = wb1.getCollisionFlags();
      const numContacts = manifold.getNumContacts();
      const forwardContacts = [];
      const reverseContacts = [];
      let newCollision;
      if (numContacts > 0) {
        // don't fire contact events for triggers
        if (flags0 & BODYFLAG_NORESPONSE_OBJECT || flags1 & BODYFLAG_NORESPONSE_OBJECT) {
          const e0Events = e0.collision && (e0.collision.hasEvent('triggerenter') || e0.collision.hasEvent('triggerleave'));
          const e1Events = e1.collision && (e1.collision.hasEvent('triggerenter') || e1.collision.hasEvent('triggerleave'));
          const e0BodyEvents = e0.rigidbody && (e0.rigidbody.hasEvent('triggerenter') || e0.rigidbody.hasEvent('triggerleave'));
          const e1BodyEvents = e1.rigidbody && (e1.rigidbody.hasEvent('triggerenter') || e1.rigidbody.hasEvent('triggerleave'));

          // fire triggerenter events for triggers
          if (e0Events) {
            newCollision = this._storeCollision(e0, e1);
            if (newCollision && !(flags1 & BODYFLAG_NORESPONSE_OBJECT)) {
              e0.collision.fire('triggerenter', e1);
            }
          }
          if (e1Events) {
            newCollision = this._storeCollision(e1, e0);
            if (newCollision && !(flags0 & BODYFLAG_NORESPONSE_OBJECT)) {
              e1.collision.fire('triggerenter', e0);
            }
          }

          // fire triggerenter events for rigidbodies
          if (e0BodyEvents) {
            if (!newCollision) {
              newCollision = this._storeCollision(e1, e0);
            }
            if (newCollision) {
              e0.rigidbody.fire('triggerenter', e1);
            }
          }
          if (e1BodyEvents) {
            if (!newCollision) {
              newCollision = this._storeCollision(e0, e1);
            }
            if (newCollision) {
              e1.rigidbody.fire('triggerenter', e0);
            }
          }
        } else {
          const e0Events = this._hasContactEvent(e0);
          const e1Events = this._hasContactEvent(e1);
          const globalEvents = this.hasEvent('contact');
          if (globalEvents || e0Events || e1Events) {
            for (let j = 0; j < numContacts; j++) {
              const btContactPoint = manifold.getContactPoint(j);
              const contactPoint = this._createContactPointFromAmmo(btContactPoint);
              if (e0Events || e1Events) {
                forwardContacts.push(contactPoint);
                const reverseContactPoint = this._createReverseContactPointFromAmmo(btContactPoint);
                reverseContacts.push(reverseContactPoint);
              }
              if (globalEvents) {
                // fire global contact event for every contact
                const result = this._createSingleContactResult(e0, e1, contactPoint);
                this.fire('contact', result);
              }
            }
            if (e0Events) {
              const forwardResult = this._createContactResult(e1, forwardContacts);
              newCollision = this._storeCollision(e0, e1);
              if (e0.collision) {
                e0.collision.fire('contact', forwardResult);
                if (newCollision) {
                  e0.collision.fire('collisionstart', forwardResult);
                }
              }
              if (e0.rigidbody) {
                e0.rigidbody.fire('contact', forwardResult);
                if (newCollision) {
                  e0.rigidbody.fire('collisionstart', forwardResult);
                }
              }
            }
            if (e1Events) {
              const reverseResult = this._createContactResult(e0, reverseContacts);
              newCollision = this._storeCollision(e1, e0);
              if (e1.collision) {
                e1.collision.fire('contact', reverseResult);
                if (newCollision) {
                  e1.collision.fire('collisionstart', reverseResult);
                }
              }
              if (e1.rigidbody) {
                e1.rigidbody.fire('contact', reverseResult);
                if (newCollision) {
                  e1.rigidbody.fire('collisionstart', reverseResult);
                }
              }
            }
          }
        }
      }
    }

    // check for collisions that no longer exist and fire events
    this._cleanOldCollisions();

    // Reset contact pools
    this.contactPointPool.freeAll();
    this.contactResultPool.freeAll();
    this.singleContactResultPool.freeAll();
  }
  onUpdate(dt) {
    let i, len;
    this._stats.physicsStart = now();

    // downcast gravity to float32 so we can accurately compare with existing
    // gravity set in ammo.
    this._gravityFloat32[0] = this.gravity.x;
    this._gravityFloat32[1] = this.gravity.y;
    this._gravityFloat32[2] = this.gravity.z;

    // Check to see whether we need to update gravity on the dynamics world
    const gravity = this.dynamicsWorld.getGravity();
    if (gravity.x() !== this._gravityFloat32[0] || gravity.y() !== this._gravityFloat32[1] || gravity.z() !== this._gravityFloat32[2]) {
      gravity.setValue(this.gravity.x, this.gravity.y, this.gravity.z);
      this.dynamicsWorld.setGravity(gravity);
    }
    const triggers = this._triggers;
    for (i = 0, len = triggers.length; i < len; i++) {
      triggers[i].updateTransform();
    }
    const compounds = this._compounds;
    for (i = 0, len = compounds.length; i < len; i++) {
      compounds[i]._updateCompound();
    }

    // Update all kinematic bodies based on their current entity transform
    const kinematic = this._kinematic;
    for (i = 0, len = kinematic.length; i < len; i++) {
      kinematic[i]._updateKinematic();
    }

    // Step the physics simulation
    this.dynamicsWorld.stepSimulation(dt, this.maxSubSteps, this.fixedTimeStep);

    // Update the transforms of all entities referencing a dynamic body
    const dynamic = this._dynamic;
    for (i = 0, len = dynamic.length; i < len; i++) {
      dynamic[i]._updateDynamic();
    }
    if (!this.dynamicsWorld.setInternalTickCallback) this._checkForCollisions(Ammo.getPointer(this.dynamicsWorld), dt);
    this._stats.physicsTime = now() - this._stats.physicsStart;
  }
  destroy() {
    super.destroy();
    this.app.systems.off('update', this.onUpdate, this);
    if (typeof Ammo !== 'undefined') {
      Ammo.destroy(this.dynamicsWorld);
      Ammo.destroy(this.solver);
      Ammo.destroy(this.overlappingPairCache);
      Ammo.destroy(this.dispatcher);
      Ammo.destroy(this.collisionConfiguration);
      this.dynamicsWorld = null;
      this.solver = null;
      this.overlappingPairCache = null;
      this.dispatcher = null;
      this.collisionConfiguration = null;
    }
  }
}
Component._buildAccessors(RigidBodyComponent.prototype, _schema);

export { ContactPoint, ContactResult, RaycastResult, RigidBodyComponentSystem, SingleContactResult };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3lzdGVtLmpzIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi9zcmMvZnJhbWV3b3JrL2NvbXBvbmVudHMvcmlnaWQtYm9keS9zeXN0ZW0uanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgbm93IH0gZnJvbSAnLi4vLi4vLi4vY29yZS90aW1lLmpzJztcbmltcG9ydCB7IE9iamVjdFBvb2wgfSBmcm9tICcuLi8uLi8uLi9jb3JlL29iamVjdC1wb29sLmpzJztcbmltcG9ydCB7IERlYnVnIH0gZnJvbSAnLi4vLi4vLi4vY29yZS9kZWJ1Zy5qcyc7XG5cbmltcG9ydCB7IFZlYzMgfSBmcm9tICcuLi8uLi8uLi9jb3JlL21hdGgvdmVjMy5qcyc7XG5cbmltcG9ydCB7IENvbXBvbmVudCB9IGZyb20gJy4uL2NvbXBvbmVudC5qcyc7XG5pbXBvcnQgeyBDb21wb25lbnRTeXN0ZW0gfSBmcm9tICcuLi9zeXN0ZW0uanMnO1xuXG5pbXBvcnQgeyBCT0RZRkxBR19OT1JFU1BPTlNFX09CSkVDVCB9IGZyb20gJy4vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IFJpZ2lkQm9keUNvbXBvbmVudCB9IGZyb20gJy4vY29tcG9uZW50LmpzJztcbmltcG9ydCB7IFJpZ2lkQm9keUNvbXBvbmVudERhdGEgfSBmcm9tICcuL2RhdGEuanMnO1xuXG5sZXQgYW1tb1JheVN0YXJ0LCBhbW1vUmF5RW5kO1xuXG4vKipcbiAqIE9iamVjdCBob2xkaW5nIHRoZSByZXN1bHQgb2YgYSBzdWNjZXNzZnVsIHJheWNhc3QgaGl0LlxuICpcbiAqIEBjYXRlZ29yeSBQaHlzaWNzXG4gKi9cbmNsYXNzIFJheWNhc3RSZXN1bHQge1xuICAgIC8qKlxuICAgICAqIENyZWF0ZSBhIG5ldyBSYXljYXN0UmVzdWx0IGluc3RhbmNlLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4uLy4uL2VudGl0eS5qcycpLkVudGl0eX0gZW50aXR5IC0gVGhlIGVudGl0eSB0aGF0IHdhcyBoaXQuXG4gICAgICogQHBhcmFtIHtWZWMzfSBwb2ludCAtIFRoZSBwb2ludCBhdCB3aGljaCB0aGUgcmF5IGhpdCB0aGUgZW50aXR5IGluIHdvcmxkIHNwYWNlLlxuICAgICAqIEBwYXJhbSB7VmVjM30gbm9ybWFsIC0gVGhlIG5vcm1hbCB2ZWN0b3Igb2YgdGhlIHN1cmZhY2Ugd2hlcmUgdGhlIHJheSBoaXQgaW4gd29ybGQgc3BhY2UuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGhpdEZyYWN0aW9uIC0gVGhlIG5vcm1hbGl6ZWQgZGlzdGFuY2UgKGJldHdlZW4gMCBhbmQgMSkgYXQgd2hpY2ggdGhlIHJheSBoaXRcbiAgICAgKiBvY2N1cnJlZCBmcm9tIHRoZSBzdGFydGluZyBwb2ludC5cbiAgICAgKiBAaGlkZWNvbnN0cnVjdG9yXG4gICAgICovXG4gICAgY29uc3RydWN0b3IoZW50aXR5LCBwb2ludCwgbm9ybWFsLCBoaXRGcmFjdGlvbikge1xuICAgICAgICAvKipcbiAgICAgICAgICogVGhlIGVudGl0eSB0aGF0IHdhcyBoaXQuXG4gICAgICAgICAqXG4gICAgICAgICAqIEB0eXBlIHtpbXBvcnQoJy4uLy4uL2VudGl0eS5qcycpLkVudGl0eX1cbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuZW50aXR5ID0gZW50aXR5O1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBUaGUgcG9pbnQgYXQgd2hpY2ggdGhlIHJheSBoaXQgdGhlIGVudGl0eSBpbiB3b3JsZCBzcGFjZS5cbiAgICAgICAgICpcbiAgICAgICAgICogQHR5cGUge1ZlYzN9XG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLnBvaW50ID0gcG9pbnQ7XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIFRoZSBub3JtYWwgdmVjdG9yIG9mIHRoZSBzdXJmYWNlIHdoZXJlIHRoZSByYXkgaGl0IGluIHdvcmxkIHNwYWNlLlxuICAgICAgICAgKlxuICAgICAgICAgKiBAdHlwZSB7VmVjM31cbiAgICAgICAgICovXG4gICAgICAgIHRoaXMubm9ybWFsID0gbm9ybWFsO1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBUaGUgbm9ybWFsaXplZCBkaXN0YW5jZSAoYmV0d2VlbiAwIGFuZCAxKSBhdCB3aGljaCB0aGUgcmF5IGhpdCBvY2N1cnJlZCBmcm9tIHRoZVxuICAgICAgICAgKiBzdGFydGluZyBwb2ludC5cbiAgICAgICAgICpcbiAgICAgICAgICogQHR5cGUge251bWJlcn1cbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuaGl0RnJhY3Rpb24gPSBoaXRGcmFjdGlvbjtcbiAgICB9XG59XG5cbi8qKlxuICogT2JqZWN0IGhvbGRpbmcgdGhlIHJlc3VsdCBvZiBhIGNvbnRhY3QgYmV0d2VlbiB0d28gcmlnaWQgYm9kaWVzLlxuICpcbiAqIEBjYXRlZ29yeSBQaHlzaWNzXG4gKi9cbmNsYXNzIFNpbmdsZUNvbnRhY3RSZXN1bHQge1xuICAgIC8qKlxuICAgICAqIENyZWF0ZSBhIG5ldyBTaW5nbGVDb250YWN0UmVzdWx0IGluc3RhbmNlLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4uLy4uL2VudGl0eS5qcycpLkVudGl0eX0gYSAtIFRoZSBmaXJzdCBlbnRpdHkgaW52b2x2ZWQgaW4gdGhlIGNvbnRhY3QuXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4uLy4uL2VudGl0eS5qcycpLkVudGl0eX0gYiAtIFRoZSBzZWNvbmQgZW50aXR5IGludm9sdmVkIGluIHRoZSBjb250YWN0LlxuICAgICAqIEBwYXJhbSB7Q29udGFjdFBvaW50fSBjb250YWN0UG9pbnQgLSBUaGUgY29udGFjdCBwb2ludCBiZXR3ZWVuIHRoZSB0d28gZW50aXRpZXMuXG4gICAgICogQGhpZGVjb25zdHJ1Y3RvclxuICAgICAqL1xuICAgIGNvbnN0cnVjdG9yKGEsIGIsIGNvbnRhY3RQb2ludCkge1xuICAgICAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgLyoqXG4gICAgICAgICAgICAgKiBUaGUgZmlyc3QgZW50aXR5IGludm9sdmVkIGluIHRoZSBjb250YWN0LlxuICAgICAgICAgICAgICpcbiAgICAgICAgICAgICAqIEB0eXBlIHtpbXBvcnQoJy4uLy4uL2VudGl0eS5qcycpLkVudGl0eX1cbiAgICAgICAgICAgICAqL1xuICAgICAgICAgICAgdGhpcy5hID0gbnVsbDtcblxuICAgICAgICAgICAgLyoqXG4gICAgICAgICAgICAgKiBUaGUgc2Vjb25kIGVudGl0eSBpbnZvbHZlZCBpbiB0aGUgY29udGFjdC5cbiAgICAgICAgICAgICAqXG4gICAgICAgICAgICAgKiBAdHlwZSB7aW1wb3J0KCcuLi8uLi9lbnRpdHkuanMnKS5FbnRpdHl9XG4gICAgICAgICAgICAgKi9cbiAgICAgICAgICAgIHRoaXMuYiA9IG51bGw7XG5cbiAgICAgICAgICAgIC8qKlxuICAgICAgICAgICAgICogVGhlIHRvdGFsIGFjY3VtdWxhdGVkIGltcHVsc2UgYXBwbGllZCBieSB0aGUgY29uc3RyYWludCBzb2x2ZXIgZHVyaW5nIHRoZSBsYXN0XG4gICAgICAgICAgICAgKiBzdWItc3RlcC4gRGVzY3JpYmVzIGhvdyBoYXJkIHR3byBib2RpZXMgY29sbGlkZWQuXG4gICAgICAgICAgICAgKlxuICAgICAgICAgICAgICogQHR5cGUge251bWJlcn1cbiAgICAgICAgICAgICAqL1xuICAgICAgICAgICAgdGhpcy5pbXB1bHNlID0gMDtcblxuICAgICAgICAgICAgLyoqXG4gICAgICAgICAgICAgKiBUaGUgcG9pbnQgb24gRW50aXR5IEEgd2hlcmUgdGhlIGNvbnRhY3Qgb2NjdXJyZWQsIHJlbGF0aXZlIHRvIEEuXG4gICAgICAgICAgICAgKlxuICAgICAgICAgICAgICogQHR5cGUge1ZlYzN9XG4gICAgICAgICAgICAgKi9cbiAgICAgICAgICAgIHRoaXMubG9jYWxQb2ludEEgPSBuZXcgVmVjMygpO1xuXG4gICAgICAgICAgICAvKipcbiAgICAgICAgICAgICAqIFRoZSBwb2ludCBvbiBFbnRpdHkgQiB3aGVyZSB0aGUgY29udGFjdCBvY2N1cnJlZCwgcmVsYXRpdmUgdG8gQi5cbiAgICAgICAgICAgICAqXG4gICAgICAgICAgICAgKiBAdHlwZSB7VmVjM31cbiAgICAgICAgICAgICAqL1xuICAgICAgICAgICAgdGhpcy5sb2NhbFBvaW50QiA9IG5ldyBWZWMzKCk7XG5cbiAgICAgICAgICAgIC8qKlxuICAgICAgICAgICAgICogVGhlIHBvaW50IG9uIEVudGl0eSBBIHdoZXJlIHRoZSBjb250YWN0IG9jY3VycmVkLCBpbiB3b3JsZCBzcGFjZS5cbiAgICAgICAgICAgICAqXG4gICAgICAgICAgICAgKiBAdHlwZSB7VmVjM31cbiAgICAgICAgICAgICAqL1xuICAgICAgICAgICAgdGhpcy5wb2ludEEgPSBuZXcgVmVjMygpO1xuXG4gICAgICAgICAgICAvKipcbiAgICAgICAgICAgICAqIFRoZSBwb2ludCBvbiBFbnRpdHkgQiB3aGVyZSB0aGUgY29udGFjdCBvY2N1cnJlZCwgaW4gd29ybGQgc3BhY2UuXG4gICAgICAgICAgICAgKlxuICAgICAgICAgICAgICogQHR5cGUge1ZlYzN9XG4gICAgICAgICAgICAgKi9cbiAgICAgICAgICAgIHRoaXMucG9pbnRCID0gbmV3IFZlYzMoKTtcblxuICAgICAgICAgICAgLyoqXG4gICAgICAgICAgICAgKiBUaGUgbm9ybWFsIHZlY3RvciBvZiB0aGUgY29udGFjdCBvbiBFbnRpdHkgQiwgaW4gd29ybGQgc3BhY2UuXG4gICAgICAgICAgICAgKlxuICAgICAgICAgICAgICogQHR5cGUge1ZlYzN9XG4gICAgICAgICAgICAgKi9cbiAgICAgICAgICAgIHRoaXMubm9ybWFsID0gbmV3IFZlYzMoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuYSA9IGE7XG4gICAgICAgICAgICB0aGlzLmIgPSBiO1xuICAgICAgICAgICAgdGhpcy5pbXB1bHNlID0gY29udGFjdFBvaW50LmltcHVsc2U7XG4gICAgICAgICAgICB0aGlzLmxvY2FsUG9pbnRBID0gY29udGFjdFBvaW50LmxvY2FsUG9pbnQ7XG4gICAgICAgICAgICB0aGlzLmxvY2FsUG9pbnRCID0gY29udGFjdFBvaW50LmxvY2FsUG9pbnRPdGhlcjtcbiAgICAgICAgICAgIHRoaXMucG9pbnRBID0gY29udGFjdFBvaW50LnBvaW50O1xuICAgICAgICAgICAgdGhpcy5wb2ludEIgPSBjb250YWN0UG9pbnQucG9pbnRPdGhlcjtcbiAgICAgICAgICAgIHRoaXMubm9ybWFsID0gY29udGFjdFBvaW50Lm5vcm1hbDtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuLyoqXG4gKiBPYmplY3QgaG9sZGluZyB0aGUgcmVzdWx0IG9mIGEgY29udGFjdCBiZXR3ZWVuIHR3byBFbnRpdGllcy5cbiAqXG4gKiBAY2F0ZWdvcnkgUGh5c2ljc1xuICovXG5jbGFzcyBDb250YWN0UG9pbnQge1xuICAgIC8qKlxuICAgICAqIENyZWF0ZSBhIG5ldyBDb250YWN0UG9pbnQgaW5zdGFuY2UuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1ZlYzN9IFtsb2NhbFBvaW50XSAtIFRoZSBwb2ludCBvbiB0aGUgZW50aXR5IHdoZXJlIHRoZSBjb250YWN0IG9jY3VycmVkLCByZWxhdGl2ZSB0b1xuICAgICAqIHRoZSBlbnRpdHkuXG4gICAgICogQHBhcmFtIHtWZWMzfSBbbG9jYWxQb2ludE90aGVyXSAtIFRoZSBwb2ludCBvbiB0aGUgb3RoZXIgZW50aXR5IHdoZXJlIHRoZSBjb250YWN0IG9jY3VycmVkLFxuICAgICAqIHJlbGF0aXZlIHRvIHRoZSBvdGhlciBlbnRpdHkuXG4gICAgICogQHBhcmFtIHtWZWMzfSBbcG9pbnRdIC0gVGhlIHBvaW50IG9uIHRoZSBlbnRpdHkgd2hlcmUgdGhlIGNvbnRhY3Qgb2NjdXJyZWQsIGluIHdvcmxkIHNwYWNlLlxuICAgICAqIEBwYXJhbSB7VmVjM30gW3BvaW50T3RoZXJdIC0gVGhlIHBvaW50IG9uIHRoZSBvdGhlciBlbnRpdHkgd2hlcmUgdGhlIGNvbnRhY3Qgb2NjdXJyZWQsIGluXG4gICAgICogd29ybGQgc3BhY2UuXG4gICAgICogQHBhcmFtIHtWZWMzfSBbbm9ybWFsXSAtIFRoZSBub3JtYWwgdmVjdG9yIG9mIHRoZSBjb250YWN0IG9uIHRoZSBvdGhlciBlbnRpdHksIGluIHdvcmxkXG4gICAgICogc3BhY2UuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFtpbXB1bHNlXSAtIFRoZSB0b3RhbCBhY2N1bXVsYXRlZCBpbXB1bHNlIGFwcGxpZWQgYnkgdGhlIGNvbnN0cmFpbnQgc29sdmVyXG4gICAgICogZHVyaW5nIHRoZSBsYXN0IHN1Yi1zdGVwLiBEZXNjcmliZXMgaG93IGhhcmQgdHdvIG9iamVjdHMgY29sbGlkZS4gRGVmYXVsdHMgdG8gMC5cbiAgICAgKiBAaGlkZWNvbnN0cnVjdG9yXG4gICAgICovXG4gICAgY29uc3RydWN0b3IobG9jYWxQb2ludCA9IG5ldyBWZWMzKCksIGxvY2FsUG9pbnRPdGhlciA9IG5ldyBWZWMzKCksIHBvaW50ID0gbmV3IFZlYzMoKSwgcG9pbnRPdGhlciA9IG5ldyBWZWMzKCksIG5vcm1hbCA9IG5ldyBWZWMzKCksIGltcHVsc2UgPSAwKSB7XG4gICAgICAgIC8qKlxuICAgICAgICAgKiBUaGUgcG9pbnQgb24gdGhlIGVudGl0eSB3aGVyZSB0aGUgY29udGFjdCBvY2N1cnJlZCwgcmVsYXRpdmUgdG8gdGhlIGVudGl0eS5cbiAgICAgICAgICpcbiAgICAgICAgICogQHR5cGUge1ZlYzN9XG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLmxvY2FsUG9pbnQgPSBsb2NhbFBvaW50O1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBUaGUgcG9pbnQgb24gdGhlIG90aGVyIGVudGl0eSB3aGVyZSB0aGUgY29udGFjdCBvY2N1cnJlZCwgcmVsYXRpdmUgdG8gdGhlIG90aGVyIGVudGl0eS5cbiAgICAgICAgICpcbiAgICAgICAgICogQHR5cGUge1ZlYzN9XG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLmxvY2FsUG9pbnRPdGhlciA9IGxvY2FsUG9pbnRPdGhlcjtcblxuICAgICAgICAvKipcbiAgICAgICAgICogVGhlIHBvaW50IG9uIHRoZSBlbnRpdHkgd2hlcmUgdGhlIGNvbnRhY3Qgb2NjdXJyZWQsIGluIHdvcmxkIHNwYWNlLlxuICAgICAgICAgKlxuICAgICAgICAgKiBAdHlwZSB7VmVjM31cbiAgICAgICAgICovXG4gICAgICAgIHRoaXMucG9pbnQgPSBwb2ludDtcblxuICAgICAgICAvKipcbiAgICAgICAgICogVGhlIHBvaW50IG9uIHRoZSBvdGhlciBlbnRpdHkgd2hlcmUgdGhlIGNvbnRhY3Qgb2NjdXJyZWQsIGluIHdvcmxkIHNwYWNlLlxuICAgICAgICAgKlxuICAgICAgICAgKiBAdHlwZSB7VmVjM31cbiAgICAgICAgICovXG4gICAgICAgIHRoaXMucG9pbnRPdGhlciA9IHBvaW50T3RoZXI7XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIFRoZSBub3JtYWwgdmVjdG9yIG9mIHRoZSBjb250YWN0IG9uIHRoZSBvdGhlciBlbnRpdHksIGluIHdvcmxkIHNwYWNlLlxuICAgICAgICAgKlxuICAgICAgICAgKiBAdHlwZSB7VmVjM31cbiAgICAgICAgICovXG4gICAgICAgIHRoaXMubm9ybWFsID0gbm9ybWFsO1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBUaGUgdG90YWwgYWNjdW11bGF0ZWQgaW1wdWxzZSBhcHBsaWVkIGJ5IHRoZSBjb25zdHJhaW50IHNvbHZlciBkdXJpbmcgdGhlIGxhc3Qgc3ViLXN0ZXAuXG4gICAgICAgICAqIERlc2NyaWJlcyBob3cgaGFyZCB0d28gb2JqZWN0cyBjb2xsaWRlLlxuICAgICAgICAgKlxuICAgICAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5pbXB1bHNlID0gaW1wdWxzZTtcbiAgICB9XG59XG5cbi8qKlxuICogT2JqZWN0IGhvbGRpbmcgdGhlIHJlc3VsdCBvZiBhIGNvbnRhY3QgYmV0d2VlbiB0d28gRW50aXRpZXMuXG4gKlxuICogQGNhdGVnb3J5IFBoeXNpY3NcbiAqL1xuY2xhc3MgQ29udGFjdFJlc3VsdCB7XG4gICAgLyoqXG4gICAgICogQ3JlYXRlIGEgbmV3IENvbnRhY3RSZXN1bHQgaW5zdGFuY2UuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge2ltcG9ydCgnLi4vLi4vZW50aXR5LmpzJykuRW50aXR5fSBvdGhlciAtIFRoZSBlbnRpdHkgdGhhdCB3YXMgaW52b2x2ZWQgaW4gdGhlXG4gICAgICogY29udGFjdCB3aXRoIHRoaXMgZW50aXR5LlxuICAgICAqIEBwYXJhbSB7Q29udGFjdFBvaW50W119IGNvbnRhY3RzIC0gQW4gYXJyYXkgb2YgQ29udGFjdFBvaW50cyB3aXRoIHRoZSBvdGhlciBlbnRpdHkuXG4gICAgICogQGhpZGVjb25zdHJ1Y3RvclxuICAgICAqL1xuICAgIGNvbnN0cnVjdG9yKG90aGVyLCBjb250YWN0cykge1xuICAgICAgICAvKipcbiAgICAgICAgICogVGhlIGVudGl0eSB0aGF0IHdhcyBpbnZvbHZlZCBpbiB0aGUgY29udGFjdCB3aXRoIHRoaXMgZW50aXR5LlxuICAgICAgICAgKlxuICAgICAgICAgKiBAdHlwZSB7aW1wb3J0KCcuLi8uLi9lbnRpdHkuanMnKS5FbnRpdHl9XG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLm90aGVyID0gb3RoZXI7XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEFuIGFycmF5IG9mIENvbnRhY3RQb2ludHMgd2l0aCB0aGUgb3RoZXIgZW50aXR5LlxuICAgICAgICAgKlxuICAgICAgICAgKiBAdHlwZSB7Q29udGFjdFBvaW50W119XG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLmNvbnRhY3RzID0gY29udGFjdHM7XG4gICAgfVxufVxuXG5jb25zdCBfc2NoZW1hID0gWydlbmFibGVkJ107XG5cbi8qKlxuICogVGhlIFJpZ2lkQm9keUNvbXBvbmVudFN5c3RlbSBtYWludGFpbnMgdGhlIGR5bmFtaWNzIHdvcmxkIGZvciBzaW11bGF0aW5nIHJpZ2lkIGJvZGllcywgaXQgYWxzb1xuICogY29udHJvbHMgZ2xvYmFsIHZhbHVlcyBmb3IgdGhlIHdvcmxkIHN1Y2ggYXMgZ3Jhdml0eS4gTm90ZTogVGhlIFJpZ2lkQm9keUNvbXBvbmVudFN5c3RlbSBpcyBvbmx5XG4gKiB2YWxpZCBpZiAzRCBQaHlzaWNzIGlzIGVuYWJsZWQgaW4geW91ciBhcHBsaWNhdGlvbi4gWW91IGNhbiBlbmFibGUgdGhpcyBpbiB0aGUgYXBwbGljYXRpb25cbiAqIHNldHRpbmdzIGZvciB5b3VyIHByb2plY3QuXG4gKlxuICogQGF1Z21lbnRzIENvbXBvbmVudFN5c3RlbVxuICogQGNhdGVnb3J5IFBoeXNpY3NcbiAqL1xuY2xhc3MgUmlnaWRCb2R5Q29tcG9uZW50U3lzdGVtIGV4dGVuZHMgQ29tcG9uZW50U3lzdGVtIHtcbiAgICAvKipcbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqIEBpZ25vcmVcbiAgICAgKi9cbiAgICBtYXhTdWJTdGVwcyA9IDEwO1xuXG4gICAgLyoqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgZml4ZWRUaW1lU3RlcCA9IDEgLyA2MDtcblxuICAgIC8qKlxuICAgICAqIFRoZSB3b3JsZCBzcGFjZSB2ZWN0b3IgcmVwcmVzZW50aW5nIGdsb2JhbCBncmF2aXR5IGluIHRoZSBwaHlzaWNzIHNpbXVsYXRpb24uIERlZmF1bHRzIHRvXG4gICAgICogWzAsIC05LjgxLCAwXSB3aGljaCBpcyBhbiBhcHByb3hpbWF0aW9uIG9mIHRoZSBncmF2aXRhdGlvbmFsIGZvcmNlIG9uIEVhcnRoLlxuICAgICAqXG4gICAgICogQHR5cGUge1ZlYzN9XG4gICAgICovXG4gICAgZ3Jhdml0eSA9IG5ldyBWZWMzKDAsIC05LjgxLCAwKTtcblxuICAgIC8qKlxuICAgICAqIEB0eXBlIHtGbG9hdDMyQXJyYXl9XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfZ3Jhdml0eUZsb2F0MzIgPSBuZXcgRmxvYXQzMkFycmF5KDMpO1xuXG4gICAgLyoqXG4gICAgICogQHR5cGUge1JpZ2lkQm9keUNvbXBvbmVudFtdfVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX2R5bmFtaWMgPSBbXTtcblxuICAgIC8qKlxuICAgICAqIEB0eXBlIHtSaWdpZEJvZHlDb21wb25lbnRbXX1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9raW5lbWF0aWMgPSBbXTtcblxuICAgIC8qKlxuICAgICAqIEB0eXBlIHtSaWdpZEJvZHlDb21wb25lbnRbXX1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF90cmlnZ2VycyA9IFtdO1xuXG4gICAgLyoqXG4gICAgICogQHR5cGUge1JpZ2lkQm9keUNvbXBvbmVudFtdfVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX2NvbXBvdW5kcyA9IFtdO1xuXG4gICAgLyoqXG4gICAgICogQ3JlYXRlIGEgbmV3IFJpZ2lkQm9keUNvbXBvbmVudFN5c3RlbS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuLi8uLi9hcHAtYmFzZS5qcycpLkFwcEJhc2V9IGFwcCAtIFRoZSBBcHBsaWNhdGlvbi5cbiAgICAgKiBAaGlkZWNvbnN0cnVjdG9yXG4gICAgICovXG4gICAgY29uc3RydWN0b3IoYXBwKSB7XG4gICAgICAgIHN1cGVyKGFwcCk7XG5cbiAgICAgICAgdGhpcy5pZCA9ICdyaWdpZGJvZHknO1xuICAgICAgICB0aGlzLl9zdGF0cyA9IGFwcC5zdGF0cy5mcmFtZTtcblxuICAgICAgICB0aGlzLkNvbXBvbmVudFR5cGUgPSBSaWdpZEJvZHlDb21wb25lbnQ7XG4gICAgICAgIHRoaXMuRGF0YVR5cGUgPSBSaWdpZEJvZHlDb21wb25lbnREYXRhO1xuXG4gICAgICAgIHRoaXMuY29udGFjdFBvaW50UG9vbCA9IG51bGw7XG4gICAgICAgIHRoaXMuY29udGFjdFJlc3VsdFBvb2wgPSBudWxsO1xuICAgICAgICB0aGlzLnNpbmdsZUNvbnRhY3RSZXN1bHRQb29sID0gbnVsbDtcblxuICAgICAgICB0aGlzLnNjaGVtYSA9IF9zY2hlbWE7XG5cbiAgICAgICAgdGhpcy5jb2xsaXNpb25zID0ge307XG4gICAgICAgIHRoaXMuZnJhbWVDb2xsaXNpb25zID0ge307XG5cbiAgICAgICAgdGhpcy5vbignYmVmb3JlcmVtb3ZlJywgdGhpcy5vbkJlZm9yZVJlbW92ZSwgdGhpcyk7XG4gICAgICAgIHRoaXMub24oJ3JlbW92ZScsIHRoaXMub25SZW1vdmUsIHRoaXMpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEZpcmVkIHdoZW4gYSBjb250YWN0IG9jY3VycyBiZXR3ZWVuIHR3byByaWdpZCBib2RpZXMuXG4gICAgICpcbiAgICAgKiBAZXZlbnQgUmlnaWRCb2R5Q29tcG9uZW50U3lzdGVtI2NvbnRhY3RcbiAgICAgKiBAcGFyYW0ge1NpbmdsZUNvbnRhY3RSZXN1bHR9IHJlc3VsdCAtIERldGFpbHMgb2YgdGhlIGNvbnRhY3QgYmV0d2VlbiB0aGUgdHdvIGJvZGllcy5cbiAgICAgKi9cblxuICAgIC8qKlxuICAgICAqIENhbGxlZCBvbmNlIEFtbW8gaGFzIGJlZW4gbG9hZGVkLiBSZXNwb25zaWJsZSBmb3IgY3JlYXRpbmcgdGhlIHBoeXNpY3Mgd29ybGQuXG4gICAgICpcbiAgICAgKiBAaWdub3JlXG4gICAgICovXG4gICAgb25MaWJyYXJ5TG9hZGVkKCkge1xuICAgICAgICAvLyBDcmVhdGUgdGhlIEFtbW8gcGh5c2ljcyB3b3JsZFxuICAgICAgICBpZiAodHlwZW9mIEFtbW8gIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICB0aGlzLmNvbGxpc2lvbkNvbmZpZ3VyYXRpb24gPSBuZXcgQW1tby5idERlZmF1bHRDb2xsaXNpb25Db25maWd1cmF0aW9uKCk7XG4gICAgICAgICAgICB0aGlzLmRpc3BhdGNoZXIgPSBuZXcgQW1tby5idENvbGxpc2lvbkRpc3BhdGNoZXIodGhpcy5jb2xsaXNpb25Db25maWd1cmF0aW9uKTtcbiAgICAgICAgICAgIHRoaXMub3ZlcmxhcHBpbmdQYWlyQ2FjaGUgPSBuZXcgQW1tby5idERidnRCcm9hZHBoYXNlKCk7XG4gICAgICAgICAgICB0aGlzLnNvbHZlciA9IG5ldyBBbW1vLmJ0U2VxdWVudGlhbEltcHVsc2VDb25zdHJhaW50U29sdmVyKCk7XG4gICAgICAgICAgICB0aGlzLmR5bmFtaWNzV29ybGQgPSBuZXcgQW1tby5idERpc2NyZXRlRHluYW1pY3NXb3JsZCh0aGlzLmRpc3BhdGNoZXIsIHRoaXMub3ZlcmxhcHBpbmdQYWlyQ2FjaGUsIHRoaXMuc29sdmVyLCB0aGlzLmNvbGxpc2lvbkNvbmZpZ3VyYXRpb24pO1xuXG4gICAgICAgICAgICBpZiAodGhpcy5keW5hbWljc1dvcmxkLnNldEludGVybmFsVGlja0NhbGxiYWNrKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgY2hlY2tGb3JDb2xsaXNpb25zUG9pbnRlciA9IEFtbW8uYWRkRnVuY3Rpb24odGhpcy5fY2hlY2tGb3JDb2xsaXNpb25zLmJpbmQodGhpcyksICd2aWYnKTtcbiAgICAgICAgICAgICAgICB0aGlzLmR5bmFtaWNzV29ybGQuc2V0SW50ZXJuYWxUaWNrQ2FsbGJhY2soY2hlY2tGb3JDb2xsaXNpb25zUG9pbnRlcik7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIERlYnVnLndhcm4oJ1dBUk5JTkc6IFRoaXMgdmVyc2lvbiBvZiBhbW1vLmpzIGNhbiBwb3RlbnRpYWxseSBmYWlsIHRvIHJlcG9ydCBjb250YWN0cy4gUGxlYXNlIHVwZGF0ZSBpdCB0byB0aGUgbGF0ZXN0IHZlcnNpb24uJyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIExhemlseSBjcmVhdGUgdGVtcCB2YXJzXG4gICAgICAgICAgICBhbW1vUmF5U3RhcnQgPSBuZXcgQW1tby5idFZlY3RvcjMoKTtcbiAgICAgICAgICAgIGFtbW9SYXlFbmQgPSBuZXcgQW1tby5idFZlY3RvcjMoKTtcbiAgICAgICAgICAgIFJpZ2lkQm9keUNvbXBvbmVudC5vbkxpYnJhcnlMb2FkZWQoKTtcblxuICAgICAgICAgICAgdGhpcy5jb250YWN0UG9pbnRQb29sID0gbmV3IE9iamVjdFBvb2woQ29udGFjdFBvaW50LCAxKTtcbiAgICAgICAgICAgIHRoaXMuY29udGFjdFJlc3VsdFBvb2wgPSBuZXcgT2JqZWN0UG9vbChDb250YWN0UmVzdWx0LCAxKTtcbiAgICAgICAgICAgIHRoaXMuc2luZ2xlQ29udGFjdFJlc3VsdFBvb2wgPSBuZXcgT2JqZWN0UG9vbChTaW5nbGVDb250YWN0UmVzdWx0LCAxKTtcblxuICAgICAgICAgICAgdGhpcy5hcHAuc3lzdGVtcy5vbigndXBkYXRlJywgdGhpcy5vblVwZGF0ZSwgdGhpcyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBVbmJpbmQgdGhlIHVwZGF0ZSBmdW5jdGlvbiBpZiB3ZSBoYXZlbid0IGxvYWRlZCBBbW1vIGJ5IG5vd1xuICAgICAgICAgICAgdGhpcy5hcHAuc3lzdGVtcy5vZmYoJ3VwZGF0ZScsIHRoaXMub25VcGRhdGUsIHRoaXMpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgaW5pdGlhbGl6ZUNvbXBvbmVudERhdGEoY29tcG9uZW50LCBkYXRhLCBwcm9wZXJ0aWVzKSB7XG4gICAgICAgIGNvbnN0IHByb3BzID0gW1xuICAgICAgICAgICAgJ21hc3MnLFxuICAgICAgICAgICAgJ2xpbmVhckRhbXBpbmcnLFxuICAgICAgICAgICAgJ2FuZ3VsYXJEYW1waW5nJyxcbiAgICAgICAgICAgICdsaW5lYXJGYWN0b3InLFxuICAgICAgICAgICAgJ2FuZ3VsYXJGYWN0b3InLFxuICAgICAgICAgICAgJ2ZyaWN0aW9uJyxcbiAgICAgICAgICAgICdyb2xsaW5nRnJpY3Rpb24nLFxuICAgICAgICAgICAgJ3Jlc3RpdHV0aW9uJyxcbiAgICAgICAgICAgICd0eXBlJyxcbiAgICAgICAgICAgICdncm91cCcsXG4gICAgICAgICAgICAnbWFzaydcbiAgICAgICAgXTtcblxuICAgICAgICBmb3IgKGNvbnN0IHByb3BlcnR5IG9mIHByb3BzKSB7XG4gICAgICAgICAgICBpZiAoZGF0YS5oYXNPd25Qcm9wZXJ0eShwcm9wZXJ0eSkpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB2YWx1ZSA9IGRhdGFbcHJvcGVydHldO1xuICAgICAgICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRbcHJvcGVydHldID0gbmV3IFZlYzModmFsdWVbMF0sIHZhbHVlWzFdLCB2YWx1ZVsyXSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50W3Byb3BlcnR5XSA9IHZhbHVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHN1cGVyLmluaXRpYWxpemVDb21wb25lbnREYXRhKGNvbXBvbmVudCwgZGF0YSwgWydlbmFibGVkJ10pO1xuICAgIH1cblxuICAgIGNsb25lQ29tcG9uZW50KGVudGl0eSwgY2xvbmUpIHtcbiAgICAgICAgLy8gY3JlYXRlIG5ldyBkYXRhIGJsb2NrIGZvciBjbG9uZVxuICAgICAgICBjb25zdCByaWdpZGJvZHkgPSBlbnRpdHkucmlnaWRib2R5O1xuICAgICAgICBjb25zdCBkYXRhID0ge1xuICAgICAgICAgICAgZW5hYmxlZDogcmlnaWRib2R5LmVuYWJsZWQsXG4gICAgICAgICAgICBtYXNzOiByaWdpZGJvZHkubWFzcyxcbiAgICAgICAgICAgIGxpbmVhckRhbXBpbmc6IHJpZ2lkYm9keS5saW5lYXJEYW1waW5nLFxuICAgICAgICAgICAgYW5ndWxhckRhbXBpbmc6IHJpZ2lkYm9keS5hbmd1bGFyRGFtcGluZyxcbiAgICAgICAgICAgIGxpbmVhckZhY3RvcjogW3JpZ2lkYm9keS5saW5lYXJGYWN0b3IueCwgcmlnaWRib2R5LmxpbmVhckZhY3Rvci55LCByaWdpZGJvZHkubGluZWFyRmFjdG9yLnpdLFxuICAgICAgICAgICAgYW5ndWxhckZhY3RvcjogW3JpZ2lkYm9keS5hbmd1bGFyRmFjdG9yLngsIHJpZ2lkYm9keS5hbmd1bGFyRmFjdG9yLnksIHJpZ2lkYm9keS5hbmd1bGFyRmFjdG9yLnpdLFxuICAgICAgICAgICAgZnJpY3Rpb246IHJpZ2lkYm9keS5mcmljdGlvbixcbiAgICAgICAgICAgIHJvbGxpbmdGcmljdGlvbjogcmlnaWRib2R5LnJvbGxpbmdGcmljdGlvbixcbiAgICAgICAgICAgIHJlc3RpdHV0aW9uOiByaWdpZGJvZHkucmVzdGl0dXRpb24sXG4gICAgICAgICAgICB0eXBlOiByaWdpZGJvZHkudHlwZSxcbiAgICAgICAgICAgIGdyb3VwOiByaWdpZGJvZHkuZ3JvdXAsXG4gICAgICAgICAgICBtYXNrOiByaWdpZGJvZHkubWFza1xuICAgICAgICB9O1xuXG4gICAgICAgIHJldHVybiB0aGlzLmFkZENvbXBvbmVudChjbG9uZSwgZGF0YSk7XG4gICAgfVxuXG4gICAgb25CZWZvcmVSZW1vdmUoZW50aXR5LCBjb21wb25lbnQpIHtcbiAgICAgICAgaWYgKGNvbXBvbmVudC5lbmFibGVkKSB7XG4gICAgICAgICAgICBjb21wb25lbnQuZW5hYmxlZCA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgb25SZW1vdmUoZW50aXR5LCBjb21wb25lbnQpIHtcbiAgICAgICAgY29uc3QgYm9keSA9IGNvbXBvbmVudC5ib2R5O1xuICAgICAgICBpZiAoYm9keSkge1xuICAgICAgICAgICAgdGhpcy5yZW1vdmVCb2R5KGJvZHkpO1xuICAgICAgICAgICAgdGhpcy5kZXN0cm95Qm9keShib2R5KTtcblxuICAgICAgICAgICAgY29tcG9uZW50LmJvZHkgPSBudWxsO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgYWRkQm9keShib2R5LCBncm91cCwgbWFzaykge1xuICAgICAgICBpZiAoZ3JvdXAgIT09IHVuZGVmaW5lZCAmJiBtYXNrICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRoaXMuZHluYW1pY3NXb3JsZC5hZGRSaWdpZEJvZHkoYm9keSwgZ3JvdXAsIG1hc2spO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5keW5hbWljc1dvcmxkLmFkZFJpZ2lkQm9keShib2R5KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJlbW92ZUJvZHkoYm9keSkge1xuICAgICAgICB0aGlzLmR5bmFtaWNzV29ybGQucmVtb3ZlUmlnaWRCb2R5KGJvZHkpO1xuICAgIH1cblxuICAgIGNyZWF0ZUJvZHkobWFzcywgc2hhcGUsIHRyYW5zZm9ybSkge1xuICAgICAgICBjb25zdCBsb2NhbEluZXJ0aWEgPSBuZXcgQW1tby5idFZlY3RvcjMoMCwgMCwgMCk7XG4gICAgICAgIGlmIChtYXNzICE9PSAwKSB7XG4gICAgICAgICAgICBzaGFwZS5jYWxjdWxhdGVMb2NhbEluZXJ0aWEobWFzcywgbG9jYWxJbmVydGlhKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IG1vdGlvblN0YXRlID0gbmV3IEFtbW8uYnREZWZhdWx0TW90aW9uU3RhdGUodHJhbnNmb3JtKTtcbiAgICAgICAgY29uc3QgYm9keUluZm8gPSBuZXcgQW1tby5idFJpZ2lkQm9keUNvbnN0cnVjdGlvbkluZm8obWFzcywgbW90aW9uU3RhdGUsIHNoYXBlLCBsb2NhbEluZXJ0aWEpO1xuICAgICAgICBjb25zdCBib2R5ID0gbmV3IEFtbW8uYnRSaWdpZEJvZHkoYm9keUluZm8pO1xuICAgICAgICBBbW1vLmRlc3Ryb3koYm9keUluZm8pO1xuICAgICAgICBBbW1vLmRlc3Ryb3kobG9jYWxJbmVydGlhKTtcblxuICAgICAgICByZXR1cm4gYm9keTtcbiAgICB9XG5cbiAgICBkZXN0cm95Qm9keShib2R5KSB7XG4gICAgICAgIC8vIFRoZSBtb3Rpb24gc3RhdGUgbmVlZHMgdG8gYmUgZGVzdHJveWVkIGV4cGxpY2l0bHkgKGlmIHByZXNlbnQpXG4gICAgICAgIGNvbnN0IG1vdGlvblN0YXRlID0gYm9keS5nZXRNb3Rpb25TdGF0ZSgpO1xuICAgICAgICBpZiAobW90aW9uU3RhdGUpIHtcbiAgICAgICAgICAgIEFtbW8uZGVzdHJveShtb3Rpb25TdGF0ZSk7XG4gICAgICAgIH1cbiAgICAgICAgQW1tby5kZXN0cm95KGJvZHkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJheWNhc3QgdGhlIHdvcmxkIGFuZCByZXR1cm4gdGhlIGZpcnN0IGVudGl0eSB0aGUgcmF5IGhpdHMuIEZpcmUgYSByYXkgaW50byB0aGUgd29ybGQgZnJvbVxuICAgICAqIHN0YXJ0IHRvIGVuZCwgaWYgdGhlIHJheSBoaXRzIGFuIGVudGl0eSB3aXRoIGEgY29sbGlzaW9uIGNvbXBvbmVudCwgaXQgcmV0dXJucyBhXG4gICAgICoge0BsaW5rIFJheWNhc3RSZXN1bHR9LCBvdGhlcndpc2UgcmV0dXJucyBudWxsLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtWZWMzfSBzdGFydCAtIFRoZSB3b3JsZCBzcGFjZSBwb2ludCB3aGVyZSB0aGUgcmF5IHN0YXJ0cy5cbiAgICAgKiBAcGFyYW0ge1ZlYzN9IGVuZCAtIFRoZSB3b3JsZCBzcGFjZSBwb2ludCB3aGVyZSB0aGUgcmF5IGVuZHMuXG4gICAgICogQHBhcmFtIHtvYmplY3R9IFtvcHRpb25zXSAtIFRoZSBhZGRpdGlvbmFsIG9wdGlvbnMgZm9yIHRoZSByYXljYXN0aW5nLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBbb3B0aW9ucy5maWx0ZXJDb2xsaXNpb25Hcm91cF0gLSBDb2xsaXNpb24gZ3JvdXAgdG8gYXBwbHkgdG8gdGhlIHJheWNhc3QuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFtvcHRpb25zLmZpbHRlckNvbGxpc2lvbk1hc2tdIC0gQ29sbGlzaW9uIG1hc2sgdG8gYXBwbHkgdG8gdGhlIHJheWNhc3QuXG4gICAgICogQHBhcmFtIHthbnlbXX0gW29wdGlvbnMuZmlsdGVyVGFnc10gLSBUYWdzIGZpbHRlcnMuIERlZmluZWQgdGhlIHNhbWUgd2F5IGFzIGEge0BsaW5rIFRhZ3MjaGFzfVxuICAgICAqIHF1ZXJ5IGJ1dCB3aXRoaW4gYW4gYXJyYXkuXG4gICAgICogQHBhcmFtIHtGdW5jdGlvbn0gW29wdGlvbnMuZmlsdGVyQ2FsbGJhY2tdIC0gQ3VzdG9tIGZ1bmN0aW9uIHRvIHVzZSB0byBmaWx0ZXIgZW50aXRpZXMuXG4gICAgICogTXVzdCByZXR1cm4gdHJ1ZSB0byBwcm9jZWVkIHdpdGggcmVzdWx0LiBUYWtlcyBvbmUgYXJndW1lbnQ6IHRoZSBlbnRpdHkgdG8gZXZhbHVhdGUuXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7UmF5Y2FzdFJlc3VsdHxudWxsfSBUaGUgcmVzdWx0IG9mIHRoZSByYXljYXN0aW5nIG9yIG51bGwgaWYgdGhlcmUgd2FzIG5vIGhpdC5cbiAgICAgKi9cbiAgICByYXljYXN0Rmlyc3Qoc3RhcnQsIGVuZCwgb3B0aW9ucyA9IHt9KSB7XG4gICAgICAgIC8vIFRhZ3MgYW5kIGN1c3RvbSBjYWxsYmFjayBjYW4gb25seSBiZSBwZXJmb3JtZWQgYnkgbG9va2luZyBhdCBhbGwgcmVzdWx0cy5cbiAgICAgICAgaWYgKG9wdGlvbnMuZmlsdGVyVGFncyB8fCBvcHRpb25zLmZpbHRlckNhbGxiYWNrKSB7XG4gICAgICAgICAgICBvcHRpb25zLnNvcnQgPSB0cnVlO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMucmF5Y2FzdEFsbChzdGFydCwgZW5kLCBvcHRpb25zKVswXSB8fCBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IHJlc3VsdCA9IG51bGw7XG5cbiAgICAgICAgYW1tb1JheVN0YXJ0LnNldFZhbHVlKHN0YXJ0LngsIHN0YXJ0LnksIHN0YXJ0LnopO1xuICAgICAgICBhbW1vUmF5RW5kLnNldFZhbHVlKGVuZC54LCBlbmQueSwgZW5kLnopO1xuICAgICAgICBjb25zdCByYXlDYWxsYmFjayA9IG5ldyBBbW1vLkNsb3Nlc3RSYXlSZXN1bHRDYWxsYmFjayhhbW1vUmF5U3RhcnQsIGFtbW9SYXlFbmQpO1xuXG4gICAgICAgIGlmICh0eXBlb2Ygb3B0aW9ucy5maWx0ZXJDb2xsaXNpb25Hcm91cCA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgICAgIHJheUNhbGxiYWNrLnNldF9tX2NvbGxpc2lvbkZpbHRlckdyb3VwKG9wdGlvbnMuZmlsdGVyQ29sbGlzaW9uR3JvdXApO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHR5cGVvZiBvcHRpb25zLmZpbHRlckNvbGxpc2lvbk1hc2sgPT09ICdudW1iZXInKSB7XG4gICAgICAgICAgICByYXlDYWxsYmFjay5zZXRfbV9jb2xsaXNpb25GaWx0ZXJNYXNrKG9wdGlvbnMuZmlsdGVyQ29sbGlzaW9uTWFzayk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmR5bmFtaWNzV29ybGQucmF5VGVzdChhbW1vUmF5U3RhcnQsIGFtbW9SYXlFbmQsIHJheUNhbGxiYWNrKTtcbiAgICAgICAgaWYgKHJheUNhbGxiYWNrLmhhc0hpdCgpKSB7XG4gICAgICAgICAgICBjb25zdCBjb2xsaXNpb25PYmogPSByYXlDYWxsYmFjay5nZXRfbV9jb2xsaXNpb25PYmplY3QoKTtcbiAgICAgICAgICAgIGNvbnN0IGJvZHkgPSBBbW1vLmNhc3RPYmplY3QoY29sbGlzaW9uT2JqLCBBbW1vLmJ0UmlnaWRCb2R5KTtcblxuICAgICAgICAgICAgaWYgKGJvZHkpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBwb2ludCA9IHJheUNhbGxiYWNrLmdldF9tX2hpdFBvaW50V29ybGQoKTtcbiAgICAgICAgICAgICAgICBjb25zdCBub3JtYWwgPSByYXlDYWxsYmFjay5nZXRfbV9oaXROb3JtYWxXb3JsZCgpO1xuXG4gICAgICAgICAgICAgICAgcmVzdWx0ID0gbmV3IFJheWNhc3RSZXN1bHQoXG4gICAgICAgICAgICAgICAgICAgIGJvZHkuZW50aXR5LFxuICAgICAgICAgICAgICAgICAgICBuZXcgVmVjMyhwb2ludC54KCksIHBvaW50LnkoKSwgcG9pbnQueigpKSxcbiAgICAgICAgICAgICAgICAgICAgbmV3IFZlYzMobm9ybWFsLngoKSwgbm9ybWFsLnkoKSwgbm9ybWFsLnooKSksXG4gICAgICAgICAgICAgICAgICAgIHJheUNhbGxiYWNrLmdldF9tX2Nsb3Nlc3RIaXRGcmFjdGlvbigpXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIEFtbW8uZGVzdHJveShyYXlDYWxsYmFjayk7XG5cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSYXljYXN0IHRoZSB3b3JsZCBhbmQgcmV0dXJuIGFsbCBlbnRpdGllcyB0aGUgcmF5IGhpdHMuIEl0IHJldHVybnMgYW4gYXJyYXkgb2ZcbiAgICAgKiB7QGxpbmsgUmF5Y2FzdFJlc3VsdH0sIG9uZSBmb3IgZWFjaCBoaXQuIElmIG5vIGhpdHMgYXJlIGRldGVjdGVkLCB0aGUgcmV0dXJuZWQgYXJyYXkgd2lsbCBiZVxuICAgICAqIG9mIGxlbmd0aCAwLiBSZXN1bHRzIGFyZSBzb3J0ZWQgYnkgZGlzdGFuY2Ugd2l0aCBjbG9zZXN0IGZpcnN0LlxuICAgICAqXG4gICAgICogQHBhcmFtIHtWZWMzfSBzdGFydCAtIFRoZSB3b3JsZCBzcGFjZSBwb2ludCB3aGVyZSB0aGUgcmF5IHN0YXJ0cy5cbiAgICAgKiBAcGFyYW0ge1ZlYzN9IGVuZCAtIFRoZSB3b3JsZCBzcGFjZSBwb2ludCB3aGVyZSB0aGUgcmF5IGVuZHMuXG4gICAgICogQHBhcmFtIHtvYmplY3R9IFtvcHRpb25zXSAtIFRoZSBhZGRpdGlvbmFsIG9wdGlvbnMgZm9yIHRoZSByYXljYXN0aW5nLlxuICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gW29wdGlvbnMuc29ydF0gLSBXaGV0aGVyIHRvIHNvcnQgcmF5Y2FzdCByZXN1bHRzIGJhc2VkIG9uIGRpc3RhbmNlIHdpdGggY2xvc2VzdFxuICAgICAqIGZpcnN0LiBEZWZhdWx0cyB0byBmYWxzZS5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gW29wdGlvbnMuZmlsdGVyQ29sbGlzaW9uR3JvdXBdIC0gQ29sbGlzaW9uIGdyb3VwIHRvIGFwcGx5IHRvIHRoZSByYXljYXN0LlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBbb3B0aW9ucy5maWx0ZXJDb2xsaXNpb25NYXNrXSAtIENvbGxpc2lvbiBtYXNrIHRvIGFwcGx5IHRvIHRoZSByYXljYXN0LlxuICAgICAqIEBwYXJhbSB7YW55W119IFtvcHRpb25zLmZpbHRlclRhZ3NdIC0gVGFncyBmaWx0ZXJzLiBEZWZpbmVkIHRoZSBzYW1lIHdheSBhcyBhIHtAbGluayBUYWdzI2hhc31cbiAgICAgKiBxdWVyeSBidXQgd2l0aGluIGFuIGFycmF5LlxuICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IFtvcHRpb25zLmZpbHRlckNhbGxiYWNrXSAtIEN1c3RvbSBmdW5jdGlvbiB0byB1c2UgdG8gZmlsdGVyIGVudGl0aWVzLlxuICAgICAqIE11c3QgcmV0dXJuIHRydWUgdG8gcHJvY2VlZCB3aXRoIHJlc3VsdC4gVGFrZXMgdGhlIGVudGl0eSB0byBldmFsdWF0ZSBhcyBhcmd1bWVudC5cbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtSYXljYXN0UmVzdWx0W119IEFuIGFycmF5IG9mIHJheWNhc3QgaGl0IHJlc3VsdHMgKDAgbGVuZ3RoIGlmIHRoZXJlIHdlcmUgbm8gaGl0cykuXG4gICAgICpcbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIC8vIFJldHVybiBhbGwgcmVzdWx0cyBvZiBhIHJheWNhc3QgYmV0d2VlbiAwLCAyLCAyIGFuZCAwLCAtMiwgLTJcbiAgICAgKiBjb25zdCBoaXRzID0gdGhpcy5hcHAuc3lzdGVtcy5yaWdpZGJvZHkucmF5Y2FzdEFsbChuZXcgVmVjMygwLCAyLCAyKSwgbmV3IFZlYzMoMCwgLTIsIC0yKSk7XG4gICAgICogQGV4YW1wbGVcbiAgICAgKiAvLyBSZXR1cm4gYWxsIHJlc3VsdHMgb2YgYSByYXljYXN0IGJldHdlZW4gMCwgMiwgMiBhbmQgMCwgLTIsIC0yXG4gICAgICogLy8gd2hlcmUgaGl0IGVudGl0eSBpcyB0YWdnZWQgd2l0aCBgYmlyZGAgT1IgYG1hbW1hbGBcbiAgICAgKiBjb25zdCBoaXRzID0gdGhpcy5hcHAuc3lzdGVtcy5yaWdpZGJvZHkucmF5Y2FzdEFsbChuZXcgVmVjMygwLCAyLCAyKSwgbmV3IFZlYzMoMCwgLTIsIC0yKSwge1xuICAgICAqICAgICBmaWx0ZXJUYWdzOiBbIFwiYmlyZFwiLCBcIm1hbW1hbFwiIF1cbiAgICAgKiB9KTtcbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIC8vIFJldHVybiBhbGwgcmVzdWx0cyBvZiBhIHJheWNhc3QgYmV0d2VlbiAwLCAyLCAyIGFuZCAwLCAtMiwgLTJcbiAgICAgKiAvLyB3aGVyZSBoaXQgZW50aXR5IGhhcyBhIGBjYW1lcmFgIGNvbXBvbmVudFxuICAgICAqIGNvbnN0IGhpdHMgPSB0aGlzLmFwcC5zeXN0ZW1zLnJpZ2lkYm9keS5yYXljYXN0QWxsKG5ldyBWZWMzKDAsIDIsIDIpLCBuZXcgVmVjMygwLCAtMiwgLTIpLCB7XG4gICAgICogICAgIGZpbHRlckNhbGxiYWNrOiAoZW50aXR5KSA9PiBlbnRpdHkgJiYgZW50aXR5LmNhbWVyYVxuICAgICAqIH0pO1xuICAgICAqIEBleGFtcGxlXG4gICAgICogLy8gUmV0dXJuIGFsbCByZXN1bHRzIG9mIGEgcmF5Y2FzdCBiZXR3ZWVuIDAsIDIsIDIgYW5kIDAsIC0yLCAtMlxuICAgICAqIC8vIHdoZXJlIGhpdCBlbnRpdHkgaXMgdGFnZ2VkIHdpdGggKGBjYXJuaXZvcmVgIEFORCBgbWFtbWFsYCkgT1IgKGBjYXJuaXZvcmVgIEFORCBgcmVwdGlsZWApXG4gICAgICogLy8gYW5kIHRoZSBlbnRpdHkgaGFzIGFuIGBhbmltYCBjb21wb25lbnRcbiAgICAgKiBjb25zdCBoaXRzID0gdGhpcy5hcHAuc3lzdGVtcy5yaWdpZGJvZHkucmF5Y2FzdEFsbChuZXcgVmVjMygwLCAyLCAyKSwgbmV3IFZlYzMoMCwgLTIsIC0yKSwge1xuICAgICAqICAgICBmaWx0ZXJUYWdzOiBbXG4gICAgICogICAgICAgICBbIFwiY2Fybml2b3JlXCIsIFwibWFtbWFsXCIgXSxcbiAgICAgKiAgICAgICAgIFsgXCJjYXJuaXZvcmVcIiwgXCJyZXB0aWxlXCIgXVxuICAgICAqICAgICBdLFxuICAgICAqICAgICBmaWx0ZXJDYWxsYmFjazogKGVudGl0eSkgPT4gZW50aXR5ICYmIGVudGl0eS5hbmltXG4gICAgICogfSk7XG4gICAgICovXG4gICAgcmF5Y2FzdEFsbChzdGFydCwgZW5kLCBvcHRpb25zID0ge30pIHtcbiAgICAgICAgRGVidWcuYXNzZXJ0KEFtbW8uQWxsSGl0c1JheVJlc3VsdENhbGxiYWNrLCAncGMuUmlnaWRCb2R5Q29tcG9uZW50U3lzdGVtI3JheWNhc3RBbGw6IFlvdXIgdmVyc2lvbiBvZiBhbW1vLmpzIGRvZXMgbm90IGV4cG9zZSBBbW1vLkFsbEhpdHNSYXlSZXN1bHRDYWxsYmFjay4gVXBkYXRlIGl0IHRvIGxhdGVzdC4nKTtcblxuICAgICAgICBjb25zdCByZXN1bHRzID0gW107XG5cbiAgICAgICAgYW1tb1JheVN0YXJ0LnNldFZhbHVlKHN0YXJ0LngsIHN0YXJ0LnksIHN0YXJ0LnopO1xuICAgICAgICBhbW1vUmF5RW5kLnNldFZhbHVlKGVuZC54LCBlbmQueSwgZW5kLnopO1xuICAgICAgICBjb25zdCByYXlDYWxsYmFjayA9IG5ldyBBbW1vLkFsbEhpdHNSYXlSZXN1bHRDYWxsYmFjayhhbW1vUmF5U3RhcnQsIGFtbW9SYXlFbmQpO1xuXG4gICAgICAgIC8vIElnbm9yZSBiYWNrZmFjZXNcbiAgICAgICAgcmF5Q2FsbGJhY2suc2V0X21fZmxhZ3MoMSA8PCAwKTtcblxuICAgICAgICBpZiAodHlwZW9mIG9wdGlvbnMuZmlsdGVyQ29sbGlzaW9uR3JvdXAgPT09ICdudW1iZXInKSB7XG4gICAgICAgICAgICByYXlDYWxsYmFjay5zZXRfbV9jb2xsaXNpb25GaWx0ZXJHcm91cChvcHRpb25zLmZpbHRlckNvbGxpc2lvbkdyb3VwKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0eXBlb2Ygb3B0aW9ucy5maWx0ZXJDb2xsaXNpb25NYXNrID09PSAnbnVtYmVyJykge1xuICAgICAgICAgICAgcmF5Q2FsbGJhY2suc2V0X21fY29sbGlzaW9uRmlsdGVyTWFzayhvcHRpb25zLmZpbHRlckNvbGxpc2lvbk1hc2spO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5keW5hbWljc1dvcmxkLnJheVRlc3QoYW1tb1JheVN0YXJ0LCBhbW1vUmF5RW5kLCByYXlDYWxsYmFjayk7XG4gICAgICAgIGlmIChyYXlDYWxsYmFjay5oYXNIaXQoKSkge1xuICAgICAgICAgICAgY29uc3QgY29sbGlzaW9uT2JqcyA9IHJheUNhbGxiYWNrLmdldF9tX2NvbGxpc2lvbk9iamVjdHMoKTtcbiAgICAgICAgICAgIGNvbnN0IHBvaW50cyA9IHJheUNhbGxiYWNrLmdldF9tX2hpdFBvaW50V29ybGQoKTtcbiAgICAgICAgICAgIGNvbnN0IG5vcm1hbHMgPSByYXlDYWxsYmFjay5nZXRfbV9oaXROb3JtYWxXb3JsZCgpO1xuICAgICAgICAgICAgY29uc3QgaGl0RnJhY3Rpb25zID0gcmF5Q2FsbGJhY2suZ2V0X21faGl0RnJhY3Rpb25zKCk7XG5cbiAgICAgICAgICAgIGNvbnN0IG51bUhpdHMgPSBjb2xsaXNpb25PYmpzLnNpemUoKTtcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbnVtSGl0czsgaSsrKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgYm9keSA9IEFtbW8uY2FzdE9iamVjdChjb2xsaXNpb25PYmpzLmF0KGkpLCBBbW1vLmJ0UmlnaWRCb2R5KTtcblxuICAgICAgICAgICAgICAgIGlmIChib2R5ICYmIGJvZHkuZW50aXR5KSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChvcHRpb25zLmZpbHRlclRhZ3MgJiYgIWJvZHkuZW50aXR5LnRhZ3MuaGFzKC4uLm9wdGlvbnMuZmlsdGVyVGFncykgfHwgb3B0aW9ucy5maWx0ZXJDYWxsYmFjayAmJiAhb3B0aW9ucy5maWx0ZXJDYWxsYmFjayhib2R5LmVudGl0eSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcG9pbnQgPSBwb2ludHMuYXQoaSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG5vcm1hbCA9IG5vcm1hbHMuYXQoaSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IG5ldyBSYXljYXN0UmVzdWx0KFxuICAgICAgICAgICAgICAgICAgICAgICAgYm9keS5lbnRpdHksXG4gICAgICAgICAgICAgICAgICAgICAgICBuZXcgVmVjMyhwb2ludC54KCksIHBvaW50LnkoKSwgcG9pbnQueigpKSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG5ldyBWZWMzKG5vcm1hbC54KCksIG5vcm1hbC55KCksIG5vcm1hbC56KCkpLFxuICAgICAgICAgICAgICAgICAgICAgICAgaGl0RnJhY3Rpb25zLmF0KGkpXG4gICAgICAgICAgICAgICAgICAgICk7XG5cbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0cy5wdXNoKHJlc3VsdCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAob3B0aW9ucy5zb3J0KSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0cy5zb3J0KChhLCBiKSA9PiBhLmhpdEZyYWN0aW9uIC0gYi5oaXRGcmFjdGlvbik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBBbW1vLmRlc3Ryb3kocmF5Q2FsbGJhY2spO1xuXG4gICAgICAgIHJldHVybiByZXN1bHRzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFN0b3JlcyBhIGNvbGxpc2lvbiBiZXR3ZWVuIHRoZSBlbnRpdHkgYW5kIG90aGVyIGluIHRoZSBjb250YWN0cyBtYXAgYW5kIHJldHVybnMgdHJ1ZSBpZiBpdFxuICAgICAqIGlzIGEgbmV3IGNvbGxpc2lvbi5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuLi8uLi9lbnRpdHkuanMnKS5FbnRpdHl9IGVudGl0eSAtIFRoZSBlbnRpdHkuXG4gICAgICogQHBhcmFtIHtpbXBvcnQoJy4uLy4uL2VudGl0eS5qcycpLkVudGl0eX0gb3RoZXIgLSBUaGUgZW50aXR5IHRoYXQgY29sbGlkZXMgd2l0aCB0aGUgZmlyc3RcbiAgICAgKiBlbnRpdHkuXG4gICAgICogQHJldHVybnMge2Jvb2xlYW59IFRydWUgaWYgdGhpcyBpcyBhIG5ldyBjb2xsaXNpb24sIGZhbHNlIG90aGVyd2lzZS5cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9zdG9yZUNvbGxpc2lvbihlbnRpdHksIG90aGVyKSB7XG4gICAgICAgIGxldCBpc05ld0NvbGxpc2lvbiA9IGZhbHNlO1xuICAgICAgICBjb25zdCBndWlkID0gZW50aXR5LmdldEd1aWQoKTtcblxuICAgICAgICB0aGlzLmNvbGxpc2lvbnNbZ3VpZF0gPSB0aGlzLmNvbGxpc2lvbnNbZ3VpZF0gfHwgeyBvdGhlcnM6IFtdLCBlbnRpdHk6IGVudGl0eSB9O1xuXG4gICAgICAgIGlmICh0aGlzLmNvbGxpc2lvbnNbZ3VpZF0ub3RoZXJzLmluZGV4T2Yob3RoZXIpIDwgMCkge1xuICAgICAgICAgICAgdGhpcy5jb2xsaXNpb25zW2d1aWRdLm90aGVycy5wdXNoKG90aGVyKTtcbiAgICAgICAgICAgIGlzTmV3Q29sbGlzaW9uID0gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuZnJhbWVDb2xsaXNpb25zW2d1aWRdID0gdGhpcy5mcmFtZUNvbGxpc2lvbnNbZ3VpZF0gfHwgeyBvdGhlcnM6IFtdLCBlbnRpdHk6IGVudGl0eSB9O1xuICAgICAgICB0aGlzLmZyYW1lQ29sbGlzaW9uc1tndWlkXS5vdGhlcnMucHVzaChvdGhlcik7XG5cbiAgICAgICAgcmV0dXJuIGlzTmV3Q29sbGlzaW9uO1xuICAgIH1cblxuICAgIF9jcmVhdGVDb250YWN0UG9pbnRGcm9tQW1tbyhjb250YWN0UG9pbnQpIHtcbiAgICAgICAgY29uc3QgbG9jYWxQb2ludEEgPSBjb250YWN0UG9pbnQuZ2V0X21fbG9jYWxQb2ludEEoKTtcbiAgICAgICAgY29uc3QgbG9jYWxQb2ludEIgPSBjb250YWN0UG9pbnQuZ2V0X21fbG9jYWxQb2ludEIoKTtcbiAgICAgICAgY29uc3QgcG9zaXRpb25Xb3JsZE9uQSA9IGNvbnRhY3RQb2ludC5nZXRQb3NpdGlvbldvcmxkT25BKCk7XG4gICAgICAgIGNvbnN0IHBvc2l0aW9uV29ybGRPbkIgPSBjb250YWN0UG9pbnQuZ2V0UG9zaXRpb25Xb3JsZE9uQigpO1xuICAgICAgICBjb25zdCBub3JtYWxXb3JsZE9uQiA9IGNvbnRhY3RQb2ludC5nZXRfbV9ub3JtYWxXb3JsZE9uQigpO1xuXG4gICAgICAgIGNvbnN0IGNvbnRhY3QgPSB0aGlzLmNvbnRhY3RQb2ludFBvb2wuYWxsb2NhdGUoKTtcbiAgICAgICAgY29udGFjdC5sb2NhbFBvaW50LnNldChsb2NhbFBvaW50QS54KCksIGxvY2FsUG9pbnRBLnkoKSwgbG9jYWxQb2ludEEueigpKTtcbiAgICAgICAgY29udGFjdC5sb2NhbFBvaW50T3RoZXIuc2V0KGxvY2FsUG9pbnRCLngoKSwgbG9jYWxQb2ludEIueSgpLCBsb2NhbFBvaW50Qi56KCkpO1xuICAgICAgICBjb250YWN0LnBvaW50LnNldChwb3NpdGlvbldvcmxkT25BLngoKSwgcG9zaXRpb25Xb3JsZE9uQS55KCksIHBvc2l0aW9uV29ybGRPbkEueigpKTtcbiAgICAgICAgY29udGFjdC5wb2ludE90aGVyLnNldChwb3NpdGlvbldvcmxkT25CLngoKSwgcG9zaXRpb25Xb3JsZE9uQi55KCksIHBvc2l0aW9uV29ybGRPbkIueigpKTtcbiAgICAgICAgY29udGFjdC5ub3JtYWwuc2V0KG5vcm1hbFdvcmxkT25CLngoKSwgbm9ybWFsV29ybGRPbkIueSgpLCBub3JtYWxXb3JsZE9uQi56KCkpO1xuICAgICAgICBjb250YWN0LmltcHVsc2UgPSBjb250YWN0UG9pbnQuZ2V0QXBwbGllZEltcHVsc2UoKTtcbiAgICAgICAgcmV0dXJuIGNvbnRhY3Q7XG4gICAgfVxuXG4gICAgX2NyZWF0ZVJldmVyc2VDb250YWN0UG9pbnRGcm9tQW1tbyhjb250YWN0UG9pbnQpIHtcbiAgICAgICAgY29uc3QgbG9jYWxQb2ludEEgPSBjb250YWN0UG9pbnQuZ2V0X21fbG9jYWxQb2ludEEoKTtcbiAgICAgICAgY29uc3QgbG9jYWxQb2ludEIgPSBjb250YWN0UG9pbnQuZ2V0X21fbG9jYWxQb2ludEIoKTtcbiAgICAgICAgY29uc3QgcG9zaXRpb25Xb3JsZE9uQSA9IGNvbnRhY3RQb2ludC5nZXRQb3NpdGlvbldvcmxkT25BKCk7XG4gICAgICAgIGNvbnN0IHBvc2l0aW9uV29ybGRPbkIgPSBjb250YWN0UG9pbnQuZ2V0UG9zaXRpb25Xb3JsZE9uQigpO1xuICAgICAgICBjb25zdCBub3JtYWxXb3JsZE9uQiA9IGNvbnRhY3RQb2ludC5nZXRfbV9ub3JtYWxXb3JsZE9uQigpO1xuXG4gICAgICAgIGNvbnN0IGNvbnRhY3QgPSB0aGlzLmNvbnRhY3RQb2ludFBvb2wuYWxsb2NhdGUoKTtcbiAgICAgICAgY29udGFjdC5sb2NhbFBvaW50T3RoZXIuc2V0KGxvY2FsUG9pbnRBLngoKSwgbG9jYWxQb2ludEEueSgpLCBsb2NhbFBvaW50QS56KCkpO1xuICAgICAgICBjb250YWN0LmxvY2FsUG9pbnQuc2V0KGxvY2FsUG9pbnRCLngoKSwgbG9jYWxQb2ludEIueSgpLCBsb2NhbFBvaW50Qi56KCkpO1xuICAgICAgICBjb250YWN0LnBvaW50T3RoZXIuc2V0KHBvc2l0aW9uV29ybGRPbkEueCgpLCBwb3NpdGlvbldvcmxkT25BLnkoKSwgcG9zaXRpb25Xb3JsZE9uQS56KCkpO1xuICAgICAgICBjb250YWN0LnBvaW50LnNldChwb3NpdGlvbldvcmxkT25CLngoKSwgcG9zaXRpb25Xb3JsZE9uQi55KCksIHBvc2l0aW9uV29ybGRPbkIueigpKTtcbiAgICAgICAgY29udGFjdC5ub3JtYWwuc2V0KG5vcm1hbFdvcmxkT25CLngoKSwgbm9ybWFsV29ybGRPbkIueSgpLCBub3JtYWxXb3JsZE9uQi56KCkpO1xuICAgICAgICBjb250YWN0LmltcHVsc2UgPSBjb250YWN0UG9pbnQuZ2V0QXBwbGllZEltcHVsc2UoKTtcbiAgICAgICAgcmV0dXJuIGNvbnRhY3Q7XG4gICAgfVxuXG4gICAgX2NyZWF0ZVNpbmdsZUNvbnRhY3RSZXN1bHQoYSwgYiwgY29udGFjdFBvaW50KSB7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IHRoaXMuc2luZ2xlQ29udGFjdFJlc3VsdFBvb2wuYWxsb2NhdGUoKTtcblxuICAgICAgICByZXN1bHQuYSA9IGE7XG4gICAgICAgIHJlc3VsdC5iID0gYjtcbiAgICAgICAgcmVzdWx0LmxvY2FsUG9pbnRBID0gY29udGFjdFBvaW50LmxvY2FsUG9pbnQ7XG4gICAgICAgIHJlc3VsdC5sb2NhbFBvaW50QiA9IGNvbnRhY3RQb2ludC5sb2NhbFBvaW50T3RoZXI7XG4gICAgICAgIHJlc3VsdC5wb2ludEEgPSBjb250YWN0UG9pbnQucG9pbnQ7XG4gICAgICAgIHJlc3VsdC5wb2ludEIgPSBjb250YWN0UG9pbnQucG9pbnRPdGhlcjtcbiAgICAgICAgcmVzdWx0Lm5vcm1hbCA9IGNvbnRhY3RQb2ludC5ub3JtYWw7XG4gICAgICAgIHJlc3VsdC5pbXB1bHNlID0gY29udGFjdFBvaW50LmltcHVsc2U7XG5cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICBfY3JlYXRlQ29udGFjdFJlc3VsdChvdGhlciwgY29udGFjdHMpIHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gdGhpcy5jb250YWN0UmVzdWx0UG9vbC5hbGxvY2F0ZSgpO1xuICAgICAgICByZXN1bHQub3RoZXIgPSBvdGhlcjtcbiAgICAgICAgcmVzdWx0LmNvbnRhY3RzID0gY29udGFjdHM7XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVtb3ZlcyBjb2xsaXNpb25zIHRoYXQgbm8gbG9uZ2VyIGV4aXN0IGZyb20gdGhlIGNvbGxpc2lvbnMgbGlzdCBhbmQgZmlyZXMgY29sbGlzaW9uZW5kXG4gICAgICogZXZlbnRzIHRvIHRoZSByZWxhdGVkIGVudGl0aWVzLlxuICAgICAqXG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfY2xlYW5PbGRDb2xsaXNpb25zKCkge1xuICAgICAgICBmb3IgKGNvbnN0IGd1aWQgaW4gdGhpcy5jb2xsaXNpb25zKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5jb2xsaXNpb25zLmhhc093blByb3BlcnR5KGd1aWQpKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZnJhbWVDb2xsaXNpb24gPSB0aGlzLmZyYW1lQ29sbGlzaW9uc1tndWlkXTtcbiAgICAgICAgICAgICAgICBjb25zdCBjb2xsaXNpb24gPSB0aGlzLmNvbGxpc2lvbnNbZ3VpZF07XG4gICAgICAgICAgICAgICAgY29uc3QgZW50aXR5ID0gY29sbGlzaW9uLmVudGl0eTtcbiAgICAgICAgICAgICAgICBjb25zdCBlbnRpdHlDb2xsaXNpb24gPSBlbnRpdHkuY29sbGlzaW9uO1xuICAgICAgICAgICAgICAgIGNvbnN0IGVudGl0eVJpZ2lkYm9keSA9IGVudGl0eS5yaWdpZGJvZHk7XG4gICAgICAgICAgICAgICAgY29uc3Qgb3RoZXJzID0gY29sbGlzaW9uLm90aGVycztcbiAgICAgICAgICAgICAgICBjb25zdCBsZW5ndGggPSBvdGhlcnMubGVuZ3RoO1xuICAgICAgICAgICAgICAgIGxldCBpID0gbGVuZ3RoO1xuICAgICAgICAgICAgICAgIHdoaWxlIChpLS0pIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgb3RoZXIgPSBvdGhlcnNbaV07XG4gICAgICAgICAgICAgICAgICAgIC8vIGlmIHRoZSBjb250YWN0IGRvZXMgbm90IGV4aXN0IGluIHRoZSBjdXJyZW50IGZyYW1lIGNvbGxpc2lvbnMgdGhlbiBmaXJlIGV2ZW50XG4gICAgICAgICAgICAgICAgICAgIGlmICghZnJhbWVDb2xsaXNpb24gfHwgZnJhbWVDb2xsaXNpb24ub3RoZXJzLmluZGV4T2Yob3RoZXIpIDwgMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gcmVtb3ZlIGZyb20gb3RoZXJzIGxpc3RcbiAgICAgICAgICAgICAgICAgICAgICAgIG90aGVycy5zcGxpY2UoaSwgMSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChlbnRpdHkudHJpZ2dlcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGhhbmRsZSBhIHRyaWdnZXIgZW50aXR5XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGVudGl0eUNvbGxpc2lvbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbnRpdHlDb2xsaXNpb24uZmlyZSgndHJpZ2dlcmxlYXZlJywgb3RoZXIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAob3RoZXIucmlnaWRib2R5KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG90aGVyLnJpZ2lkYm9keS5maXJlKCd0cmlnZ2VybGVhdmUnLCBlbnRpdHkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoIW90aGVyLnRyaWdnZXIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBzdXBwcmVzcyBldmVudHMgaWYgdGhlIG90aGVyIGVudGl0eSBpcyBhIHRyaWdnZXJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoZW50aXR5UmlnaWRib2R5KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVudGl0eVJpZ2lkYm9keS5maXJlKCdjb2xsaXNpb25lbmQnLCBvdGhlcik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChlbnRpdHlDb2xsaXNpb24pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZW50aXR5Q29sbGlzaW9uLmZpcmUoJ2NvbGxpc2lvbmVuZCcsIG90aGVyKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAob3RoZXJzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICBkZWxldGUgdGhpcy5jb2xsaXNpb25zW2d1aWRdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdHJ1ZSBpZiB0aGUgZW50aXR5IGhhcyBhIGNvbnRhY3QgZXZlbnQgYXR0YWNoZWQgYW5kIGZhbHNlIG90aGVyd2lzZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7aW1wb3J0KCcuLi8uLi9lbnRpdHkuanMnKS5FbnRpdHl9IGVudGl0eSAtIEVudGl0eSB0byB0ZXN0LlxuICAgICAqIEByZXR1cm5zIHtib29sZWFufSBUcnVlIGlmIHRoZSBlbnRpdHkgaGFzIGEgY29udGFjdCBhbmQgZmFsc2Ugb3RoZXJ3aXNlLlxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX2hhc0NvbnRhY3RFdmVudChlbnRpdHkpIHtcbiAgICAgICAgY29uc3QgYyA9IGVudGl0eS5jb2xsaXNpb247XG4gICAgICAgIGlmIChjICYmIChjLmhhc0V2ZW50KCdjb2xsaXNpb25zdGFydCcpIHx8IGMuaGFzRXZlbnQoJ2NvbGxpc2lvbmVuZCcpIHx8IGMuaGFzRXZlbnQoJ2NvbnRhY3QnKSkpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgciA9IGVudGl0eS5yaWdpZGJvZHk7XG4gICAgICAgIHJldHVybiByICYmIChyLmhhc0V2ZW50KCdjb2xsaXNpb25zdGFydCcpIHx8IHIuaGFzRXZlbnQoJ2NvbGxpc2lvbmVuZCcpIHx8IHIuaGFzRXZlbnQoJ2NvbnRhY3QnKSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ2hlY2tzIGZvciBjb2xsaXNpb25zIGFuZCBmaXJlcyBjb2xsaXNpb24gZXZlbnRzLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHdvcmxkIC0gVGhlIHBvaW50ZXIgdG8gdGhlIGR5bmFtaWNzIHdvcmxkIHRoYXQgaW52b2tlZCB0aGlzIGNhbGxiYWNrLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSB0aW1lU3RlcCAtIFRoZSBhbW91bnQgb2Ygc2ltdWxhdGlvbiB0aW1lIHByb2Nlc3NlZCBpbiB0aGUgbGFzdCBzaW11bGF0aW9uIHRpY2suXG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfY2hlY2tGb3JDb2xsaXNpb25zKHdvcmxkLCB0aW1lU3RlcCkge1xuICAgICAgICBjb25zdCBkeW5hbWljc1dvcmxkID0gQW1tby53cmFwUG9pbnRlcih3b3JsZCwgQW1tby5idER5bmFtaWNzV29ybGQpO1xuXG4gICAgICAgIC8vIENoZWNrIGZvciBjb2xsaXNpb25zIGFuZCBmaXJlIGNhbGxiYWNrc1xuICAgICAgICBjb25zdCBkaXNwYXRjaGVyID0gZHluYW1pY3NXb3JsZC5nZXREaXNwYXRjaGVyKCk7XG4gICAgICAgIGNvbnN0IG51bU1hbmlmb2xkcyA9IGRpc3BhdGNoZXIuZ2V0TnVtTWFuaWZvbGRzKCk7XG5cbiAgICAgICAgdGhpcy5mcmFtZUNvbGxpc2lvbnMgPSB7fTtcblxuICAgICAgICAvLyBsb29wIHRocm91Z2ggdGhlIGFsbCBjb250YWN0cyBhbmQgZmlyZSBldmVudHNcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBudW1NYW5pZm9sZHM7IGkrKykge1xuICAgICAgICAgICAgY29uc3QgbWFuaWZvbGQgPSBkaXNwYXRjaGVyLmdldE1hbmlmb2xkQnlJbmRleEludGVybmFsKGkpO1xuXG4gICAgICAgICAgICBjb25zdCBib2R5MCA9IG1hbmlmb2xkLmdldEJvZHkwKCk7XG4gICAgICAgICAgICBjb25zdCBib2R5MSA9IG1hbmlmb2xkLmdldEJvZHkxKCk7XG5cbiAgICAgICAgICAgIGNvbnN0IHdiMCA9IEFtbW8uY2FzdE9iamVjdChib2R5MCwgQW1tby5idFJpZ2lkQm9keSk7XG4gICAgICAgICAgICBjb25zdCB3YjEgPSBBbW1vLmNhc3RPYmplY3QoYm9keTEsIEFtbW8uYnRSaWdpZEJvZHkpO1xuXG4gICAgICAgICAgICBjb25zdCBlMCA9IHdiMC5lbnRpdHk7XG4gICAgICAgICAgICBjb25zdCBlMSA9IHdiMS5lbnRpdHk7XG5cbiAgICAgICAgICAgIC8vIGNoZWNrIGlmIGVudGl0eSBpcyBudWxsIC0gVE9ETzogaW52ZXN0aWdhdGUgd2hlbiB0aGlzIGhhcHBlbnNcbiAgICAgICAgICAgIGlmICghZTAgfHwgIWUxKSB7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IGZsYWdzMCA9IHdiMC5nZXRDb2xsaXNpb25GbGFncygpO1xuICAgICAgICAgICAgY29uc3QgZmxhZ3MxID0gd2IxLmdldENvbGxpc2lvbkZsYWdzKCk7XG5cbiAgICAgICAgICAgIGNvbnN0IG51bUNvbnRhY3RzID0gbWFuaWZvbGQuZ2V0TnVtQ29udGFjdHMoKTtcbiAgICAgICAgICAgIGNvbnN0IGZvcndhcmRDb250YWN0cyA9IFtdO1xuICAgICAgICAgICAgY29uc3QgcmV2ZXJzZUNvbnRhY3RzID0gW107XG4gICAgICAgICAgICBsZXQgbmV3Q29sbGlzaW9uO1xuXG4gICAgICAgICAgICBpZiAobnVtQ29udGFjdHMgPiAwKSB7XG4gICAgICAgICAgICAgICAgLy8gZG9uJ3QgZmlyZSBjb250YWN0IGV2ZW50cyBmb3IgdHJpZ2dlcnNcbiAgICAgICAgICAgICAgICBpZiAoKGZsYWdzMCAmIEJPRFlGTEFHX05PUkVTUE9OU0VfT0JKRUNUKSB8fFxuICAgICAgICAgICAgICAgICAgICAoZmxhZ3MxICYgQk9EWUZMQUdfTk9SRVNQT05TRV9PQkpFQ1QpKSB7XG5cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZTBFdmVudHMgPSBlMC5jb2xsaXNpb24gJiYgKGUwLmNvbGxpc2lvbi5oYXNFdmVudCgndHJpZ2dlcmVudGVyJykgfHwgZTAuY29sbGlzaW9uLmhhc0V2ZW50KCd0cmlnZ2VybGVhdmUnKSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGUxRXZlbnRzID0gZTEuY29sbGlzaW9uICYmIChlMS5jb2xsaXNpb24uaGFzRXZlbnQoJ3RyaWdnZXJlbnRlcicpIHx8IGUxLmNvbGxpc2lvbi5oYXNFdmVudCgndHJpZ2dlcmxlYXZlJykpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBlMEJvZHlFdmVudHMgPSBlMC5yaWdpZGJvZHkgJiYgKGUwLnJpZ2lkYm9keS5oYXNFdmVudCgndHJpZ2dlcmVudGVyJykgfHwgZTAucmlnaWRib2R5Lmhhc0V2ZW50KCd0cmlnZ2VybGVhdmUnKSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGUxQm9keUV2ZW50cyA9IGUxLnJpZ2lkYm9keSAmJiAoZTEucmlnaWRib2R5Lmhhc0V2ZW50KCd0cmlnZ2VyZW50ZXInKSB8fCBlMS5yaWdpZGJvZHkuaGFzRXZlbnQoJ3RyaWdnZXJsZWF2ZScpKTtcblxuICAgICAgICAgICAgICAgICAgICAvLyBmaXJlIHRyaWdnZXJlbnRlciBldmVudHMgZm9yIHRyaWdnZXJzXG4gICAgICAgICAgICAgICAgICAgIGlmIChlMEV2ZW50cykge1xuICAgICAgICAgICAgICAgICAgICAgICAgbmV3Q29sbGlzaW9uID0gdGhpcy5fc3RvcmVDb2xsaXNpb24oZTAsIGUxKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChuZXdDb2xsaXNpb24gJiYgIShmbGFnczEgJiBCT0RZRkxBR19OT1JFU1BPTlNFX09CSkVDVCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlMC5jb2xsaXNpb24uZmlyZSgndHJpZ2dlcmVudGVyJywgZTEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGUxRXZlbnRzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBuZXdDb2xsaXNpb24gPSB0aGlzLl9zdG9yZUNvbGxpc2lvbihlMSwgZTApO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG5ld0NvbGxpc2lvbiAmJiAhKGZsYWdzMCAmIEJPRFlGTEFHX05PUkVTUE9OU0VfT0JKRUNUKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGUxLmNvbGxpc2lvbi5maXJlKCd0cmlnZ2VyZW50ZXInLCBlMCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAvLyBmaXJlIHRyaWdnZXJlbnRlciBldmVudHMgZm9yIHJpZ2lkYm9kaWVzXG4gICAgICAgICAgICAgICAgICAgIGlmIChlMEJvZHlFdmVudHMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghbmV3Q29sbGlzaW9uKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbmV3Q29sbGlzaW9uID0gdGhpcy5fc3RvcmVDb2xsaXNpb24oZTEsIGUwKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG5ld0NvbGxpc2lvbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGUwLnJpZ2lkYm9keS5maXJlKCd0cmlnZ2VyZW50ZXInLCBlMSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBpZiAoZTFCb2R5RXZlbnRzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIW5ld0NvbGxpc2lvbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5ld0NvbGxpc2lvbiA9IHRoaXMuX3N0b3JlQ29sbGlzaW9uKGUwLCBlMSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChuZXdDb2xsaXNpb24pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlMS5yaWdpZGJvZHkuZmlyZSgndHJpZ2dlcmVudGVyJywgZTApO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZTBFdmVudHMgPSB0aGlzLl9oYXNDb250YWN0RXZlbnQoZTApO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBlMUV2ZW50cyA9IHRoaXMuX2hhc0NvbnRhY3RFdmVudChlMSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGdsb2JhbEV2ZW50cyA9IHRoaXMuaGFzRXZlbnQoJ2NvbnRhY3QnKTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAoZ2xvYmFsRXZlbnRzIHx8IGUwRXZlbnRzIHx8IGUxRXZlbnRzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGxldCBqID0gMDsgaiA8IG51bUNvbnRhY3RzOyBqKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBidENvbnRhY3RQb2ludCA9IG1hbmlmb2xkLmdldENvbnRhY3RQb2ludChqKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjb250YWN0UG9pbnQgPSB0aGlzLl9jcmVhdGVDb250YWN0UG9pbnRGcm9tQW1tbyhidENvbnRhY3RQb2ludCk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoZTBFdmVudHMgfHwgZTFFdmVudHMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZm9yd2FyZENvbnRhY3RzLnB1c2goY29udGFjdFBvaW50KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcmV2ZXJzZUNvbnRhY3RQb2ludCA9IHRoaXMuX2NyZWF0ZVJldmVyc2VDb250YWN0UG9pbnRGcm9tQW1tbyhidENvbnRhY3RQb2ludCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldmVyc2VDb250YWN0cy5wdXNoKHJldmVyc2VDb250YWN0UG9pbnQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChnbG9iYWxFdmVudHMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gZmlyZSBnbG9iYWwgY29udGFjdCBldmVudCBmb3IgZXZlcnkgY29udGFjdFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSB0aGlzLl9jcmVhdGVTaW5nbGVDb250YWN0UmVzdWx0KGUwLCBlMSwgY29udGFjdFBvaW50KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5maXJlKCdjb250YWN0JywgcmVzdWx0KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChlMEV2ZW50cykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGZvcndhcmRSZXN1bHQgPSB0aGlzLl9jcmVhdGVDb250YWN0UmVzdWx0KGUxLCBmb3J3YXJkQ29udGFjdHMpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5ld0NvbGxpc2lvbiA9IHRoaXMuX3N0b3JlQ29sbGlzaW9uKGUwLCBlMSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoZTAuY29sbGlzaW9uKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGUwLmNvbGxpc2lvbi5maXJlKCdjb250YWN0JywgZm9yd2FyZFJlc3VsdCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChuZXdDb2xsaXNpb24pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGUwLmNvbGxpc2lvbi5maXJlKCdjb2xsaXNpb25zdGFydCcsIGZvcndhcmRSZXN1bHQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGUwLnJpZ2lkYm9keSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlMC5yaWdpZGJvZHkuZmlyZSgnY29udGFjdCcsIGZvcndhcmRSZXN1bHQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAobmV3Q29sbGlzaW9uKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlMC5yaWdpZGJvZHkuZmlyZSgnY29sbGlzaW9uc3RhcnQnLCBmb3J3YXJkUmVzdWx0KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGUxRXZlbnRzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcmV2ZXJzZVJlc3VsdCA9IHRoaXMuX2NyZWF0ZUNvbnRhY3RSZXN1bHQoZTAsIHJldmVyc2VDb250YWN0cyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbmV3Q29sbGlzaW9uID0gdGhpcy5fc3RvcmVDb2xsaXNpb24oZTEsIGUwKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChlMS5jb2xsaXNpb24pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZTEuY29sbGlzaW9uLmZpcmUoJ2NvbnRhY3QnLCByZXZlcnNlUmVzdWx0KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG5ld0NvbGxpc2lvbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZTEuY29sbGlzaW9uLmZpcmUoJ2NvbGxpc2lvbnN0YXJ0JywgcmV2ZXJzZVJlc3VsdCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoZTEucmlnaWRib2R5KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGUxLnJpZ2lkYm9keS5maXJlKCdjb250YWN0JywgcmV2ZXJzZVJlc3VsdCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChuZXdDb2xsaXNpb24pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGUxLnJpZ2lkYm9keS5maXJlKCdjb2xsaXNpb25zdGFydCcsIHJldmVyc2VSZXN1bHQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gY2hlY2sgZm9yIGNvbGxpc2lvbnMgdGhhdCBubyBsb25nZXIgZXhpc3QgYW5kIGZpcmUgZXZlbnRzXG4gICAgICAgIHRoaXMuX2NsZWFuT2xkQ29sbGlzaW9ucygpO1xuXG4gICAgICAgIC8vIFJlc2V0IGNvbnRhY3QgcG9vbHNcbiAgICAgICAgdGhpcy5jb250YWN0UG9pbnRQb29sLmZyZWVBbGwoKTtcbiAgICAgICAgdGhpcy5jb250YWN0UmVzdWx0UG9vbC5mcmVlQWxsKCk7XG4gICAgICAgIHRoaXMuc2luZ2xlQ29udGFjdFJlc3VsdFBvb2wuZnJlZUFsbCgpO1xuICAgIH1cblxuICAgIG9uVXBkYXRlKGR0KSB7XG4gICAgICAgIGxldCBpLCBsZW47XG5cbiAgICAgICAgLy8gI2lmIF9QUk9GSUxFUlxuICAgICAgICB0aGlzLl9zdGF0cy5waHlzaWNzU3RhcnQgPSBub3coKTtcbiAgICAgICAgLy8gI2VuZGlmXG5cbiAgICAgICAgLy8gZG93bmNhc3QgZ3Jhdml0eSB0byBmbG9hdDMyIHNvIHdlIGNhbiBhY2N1cmF0ZWx5IGNvbXBhcmUgd2l0aCBleGlzdGluZ1xuICAgICAgICAvLyBncmF2aXR5IHNldCBpbiBhbW1vLlxuICAgICAgICB0aGlzLl9ncmF2aXR5RmxvYXQzMlswXSA9IHRoaXMuZ3Jhdml0eS54O1xuICAgICAgICB0aGlzLl9ncmF2aXR5RmxvYXQzMlsxXSA9IHRoaXMuZ3Jhdml0eS55O1xuICAgICAgICB0aGlzLl9ncmF2aXR5RmxvYXQzMlsyXSA9IHRoaXMuZ3Jhdml0eS56O1xuXG4gICAgICAgIC8vIENoZWNrIHRvIHNlZSB3aGV0aGVyIHdlIG5lZWQgdG8gdXBkYXRlIGdyYXZpdHkgb24gdGhlIGR5bmFtaWNzIHdvcmxkXG4gICAgICAgIGNvbnN0IGdyYXZpdHkgPSB0aGlzLmR5bmFtaWNzV29ybGQuZ2V0R3Jhdml0eSgpO1xuICAgICAgICBpZiAoZ3Jhdml0eS54KCkgIT09IHRoaXMuX2dyYXZpdHlGbG9hdDMyWzBdIHx8XG4gICAgICAgICAgICBncmF2aXR5LnkoKSAhPT0gdGhpcy5fZ3Jhdml0eUZsb2F0MzJbMV0gfHxcbiAgICAgICAgICAgIGdyYXZpdHkueigpICE9PSB0aGlzLl9ncmF2aXR5RmxvYXQzMlsyXSkge1xuICAgICAgICAgICAgZ3Jhdml0eS5zZXRWYWx1ZSh0aGlzLmdyYXZpdHkueCwgdGhpcy5ncmF2aXR5LnksIHRoaXMuZ3Jhdml0eS56KTtcbiAgICAgICAgICAgIHRoaXMuZHluYW1pY3NXb3JsZC5zZXRHcmF2aXR5KGdyYXZpdHkpO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgdHJpZ2dlcnMgPSB0aGlzLl90cmlnZ2VycztcbiAgICAgICAgZm9yIChpID0gMCwgbGVuID0gdHJpZ2dlcnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgICAgIHRyaWdnZXJzW2ldLnVwZGF0ZVRyYW5zZm9ybSgpO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgY29tcG91bmRzID0gdGhpcy5fY29tcG91bmRzO1xuICAgICAgICBmb3IgKGkgPSAwLCBsZW4gPSBjb21wb3VuZHMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgICAgIGNvbXBvdW5kc1tpXS5fdXBkYXRlQ29tcG91bmQoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFVwZGF0ZSBhbGwga2luZW1hdGljIGJvZGllcyBiYXNlZCBvbiB0aGVpciBjdXJyZW50IGVudGl0eSB0cmFuc2Zvcm1cbiAgICAgICAgY29uc3Qga2luZW1hdGljID0gdGhpcy5fa2luZW1hdGljO1xuICAgICAgICBmb3IgKGkgPSAwLCBsZW4gPSBraW5lbWF0aWMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgICAgIGtpbmVtYXRpY1tpXS5fdXBkYXRlS2luZW1hdGljKCk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBTdGVwIHRoZSBwaHlzaWNzIHNpbXVsYXRpb25cbiAgICAgICAgdGhpcy5keW5hbWljc1dvcmxkLnN0ZXBTaW11bGF0aW9uKGR0LCB0aGlzLm1heFN1YlN0ZXBzLCB0aGlzLmZpeGVkVGltZVN0ZXApO1xuXG4gICAgICAgIC8vIFVwZGF0ZSB0aGUgdHJhbnNmb3JtcyBvZiBhbGwgZW50aXRpZXMgcmVmZXJlbmNpbmcgYSBkeW5hbWljIGJvZHlcbiAgICAgICAgY29uc3QgZHluYW1pYyA9IHRoaXMuX2R5bmFtaWM7XG4gICAgICAgIGZvciAoaSA9IDAsIGxlbiA9IGR5bmFtaWMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgICAgIGR5bmFtaWNbaV0uX3VwZGF0ZUR5bmFtaWMoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghdGhpcy5keW5hbWljc1dvcmxkLnNldEludGVybmFsVGlja0NhbGxiYWNrKVxuICAgICAgICAgICAgdGhpcy5fY2hlY2tGb3JDb2xsaXNpb25zKEFtbW8uZ2V0UG9pbnRlcih0aGlzLmR5bmFtaWNzV29ybGQpLCBkdCk7XG5cbiAgICAgICAgLy8gI2lmIF9QUk9GSUxFUlxuICAgICAgICB0aGlzLl9zdGF0cy5waHlzaWNzVGltZSA9IG5vdygpIC0gdGhpcy5fc3RhdHMucGh5c2ljc1N0YXJ0O1xuICAgICAgICAvLyAjZW5kaWZcbiAgICB9XG5cbiAgICBkZXN0cm95KCkge1xuICAgICAgICBzdXBlci5kZXN0cm95KCk7XG5cbiAgICAgICAgdGhpcy5hcHAuc3lzdGVtcy5vZmYoJ3VwZGF0ZScsIHRoaXMub25VcGRhdGUsIHRoaXMpO1xuXG4gICAgICAgIGlmICh0eXBlb2YgQW1tbyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgIEFtbW8uZGVzdHJveSh0aGlzLmR5bmFtaWNzV29ybGQpO1xuICAgICAgICAgICAgQW1tby5kZXN0cm95KHRoaXMuc29sdmVyKTtcbiAgICAgICAgICAgIEFtbW8uZGVzdHJveSh0aGlzLm92ZXJsYXBwaW5nUGFpckNhY2hlKTtcbiAgICAgICAgICAgIEFtbW8uZGVzdHJveSh0aGlzLmRpc3BhdGNoZXIpO1xuICAgICAgICAgICAgQW1tby5kZXN0cm95KHRoaXMuY29sbGlzaW9uQ29uZmlndXJhdGlvbik7XG4gICAgICAgICAgICB0aGlzLmR5bmFtaWNzV29ybGQgPSBudWxsO1xuICAgICAgICAgICAgdGhpcy5zb2x2ZXIgPSBudWxsO1xuICAgICAgICAgICAgdGhpcy5vdmVybGFwcGluZ1BhaXJDYWNoZSA9IG51bGw7XG4gICAgICAgICAgICB0aGlzLmRpc3BhdGNoZXIgPSBudWxsO1xuICAgICAgICAgICAgdGhpcy5jb2xsaXNpb25Db25maWd1cmF0aW9uID0gbnVsbDtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuQ29tcG9uZW50Ll9idWlsZEFjY2Vzc29ycyhSaWdpZEJvZHlDb21wb25lbnQucHJvdG90eXBlLCBfc2NoZW1hKTtcblxuZXhwb3J0IHsgQ29udGFjdFBvaW50LCBDb250YWN0UmVzdWx0LCBSYXljYXN0UmVzdWx0LCBSaWdpZEJvZHlDb21wb25lbnRTeXN0ZW0sIFNpbmdsZUNvbnRhY3RSZXN1bHQgfTtcbiJdLCJuYW1lcyI6WyJhbW1vUmF5U3RhcnQiLCJhbW1vUmF5RW5kIiwiUmF5Y2FzdFJlc3VsdCIsImNvbnN0cnVjdG9yIiwiZW50aXR5IiwicG9pbnQiLCJub3JtYWwiLCJoaXRGcmFjdGlvbiIsIlNpbmdsZUNvbnRhY3RSZXN1bHQiLCJhIiwiYiIsImNvbnRhY3RQb2ludCIsImFyZ3VtZW50cyIsImxlbmd0aCIsImltcHVsc2UiLCJsb2NhbFBvaW50QSIsIlZlYzMiLCJsb2NhbFBvaW50QiIsInBvaW50QSIsInBvaW50QiIsImxvY2FsUG9pbnQiLCJsb2NhbFBvaW50T3RoZXIiLCJwb2ludE90aGVyIiwiQ29udGFjdFBvaW50IiwiQ29udGFjdFJlc3VsdCIsIm90aGVyIiwiY29udGFjdHMiLCJfc2NoZW1hIiwiUmlnaWRCb2R5Q29tcG9uZW50U3lzdGVtIiwiQ29tcG9uZW50U3lzdGVtIiwiYXBwIiwibWF4U3ViU3RlcHMiLCJmaXhlZFRpbWVTdGVwIiwiZ3Jhdml0eSIsIl9ncmF2aXR5RmxvYXQzMiIsIkZsb2F0MzJBcnJheSIsIl9keW5hbWljIiwiX2tpbmVtYXRpYyIsIl90cmlnZ2VycyIsIl9jb21wb3VuZHMiLCJpZCIsIl9zdGF0cyIsInN0YXRzIiwiZnJhbWUiLCJDb21wb25lbnRUeXBlIiwiUmlnaWRCb2R5Q29tcG9uZW50IiwiRGF0YVR5cGUiLCJSaWdpZEJvZHlDb21wb25lbnREYXRhIiwiY29udGFjdFBvaW50UG9vbCIsImNvbnRhY3RSZXN1bHRQb29sIiwic2luZ2xlQ29udGFjdFJlc3VsdFBvb2wiLCJzY2hlbWEiLCJjb2xsaXNpb25zIiwiZnJhbWVDb2xsaXNpb25zIiwib24iLCJvbkJlZm9yZVJlbW92ZSIsIm9uUmVtb3ZlIiwib25MaWJyYXJ5TG9hZGVkIiwiQW1tbyIsImNvbGxpc2lvbkNvbmZpZ3VyYXRpb24iLCJidERlZmF1bHRDb2xsaXNpb25Db25maWd1cmF0aW9uIiwiZGlzcGF0Y2hlciIsImJ0Q29sbGlzaW9uRGlzcGF0Y2hlciIsIm92ZXJsYXBwaW5nUGFpckNhY2hlIiwiYnREYnZ0QnJvYWRwaGFzZSIsInNvbHZlciIsImJ0U2VxdWVudGlhbEltcHVsc2VDb25zdHJhaW50U29sdmVyIiwiZHluYW1pY3NXb3JsZCIsImJ0RGlzY3JldGVEeW5hbWljc1dvcmxkIiwic2V0SW50ZXJuYWxUaWNrQ2FsbGJhY2siLCJjaGVja0ZvckNvbGxpc2lvbnNQb2ludGVyIiwiYWRkRnVuY3Rpb24iLCJfY2hlY2tGb3JDb2xsaXNpb25zIiwiYmluZCIsIkRlYnVnIiwid2FybiIsImJ0VmVjdG9yMyIsIk9iamVjdFBvb2wiLCJzeXN0ZW1zIiwib25VcGRhdGUiLCJvZmYiLCJpbml0aWFsaXplQ29tcG9uZW50RGF0YSIsImNvbXBvbmVudCIsImRhdGEiLCJwcm9wZXJ0aWVzIiwicHJvcHMiLCJwcm9wZXJ0eSIsImhhc093blByb3BlcnR5IiwidmFsdWUiLCJBcnJheSIsImlzQXJyYXkiLCJjbG9uZUNvbXBvbmVudCIsImNsb25lIiwicmlnaWRib2R5IiwiZW5hYmxlZCIsIm1hc3MiLCJsaW5lYXJEYW1waW5nIiwiYW5ndWxhckRhbXBpbmciLCJsaW5lYXJGYWN0b3IiLCJ4IiwieSIsInoiLCJhbmd1bGFyRmFjdG9yIiwiZnJpY3Rpb24iLCJyb2xsaW5nRnJpY3Rpb24iLCJyZXN0aXR1dGlvbiIsInR5cGUiLCJncm91cCIsIm1hc2siLCJhZGRDb21wb25lbnQiLCJib2R5IiwicmVtb3ZlQm9keSIsImRlc3Ryb3lCb2R5IiwiYWRkQm9keSIsInVuZGVmaW5lZCIsImFkZFJpZ2lkQm9keSIsInJlbW92ZVJpZ2lkQm9keSIsImNyZWF0ZUJvZHkiLCJzaGFwZSIsInRyYW5zZm9ybSIsImxvY2FsSW5lcnRpYSIsImNhbGN1bGF0ZUxvY2FsSW5lcnRpYSIsIm1vdGlvblN0YXRlIiwiYnREZWZhdWx0TW90aW9uU3RhdGUiLCJib2R5SW5mbyIsImJ0UmlnaWRCb2R5Q29uc3RydWN0aW9uSW5mbyIsImJ0UmlnaWRCb2R5IiwiZGVzdHJveSIsImdldE1vdGlvblN0YXRlIiwicmF5Y2FzdEZpcnN0Iiwic3RhcnQiLCJlbmQiLCJvcHRpb25zIiwiZmlsdGVyVGFncyIsImZpbHRlckNhbGxiYWNrIiwic29ydCIsInJheWNhc3RBbGwiLCJyZXN1bHQiLCJzZXRWYWx1ZSIsInJheUNhbGxiYWNrIiwiQ2xvc2VzdFJheVJlc3VsdENhbGxiYWNrIiwiZmlsdGVyQ29sbGlzaW9uR3JvdXAiLCJzZXRfbV9jb2xsaXNpb25GaWx0ZXJHcm91cCIsImZpbHRlckNvbGxpc2lvbk1hc2siLCJzZXRfbV9jb2xsaXNpb25GaWx0ZXJNYXNrIiwicmF5VGVzdCIsImhhc0hpdCIsImNvbGxpc2lvbk9iaiIsImdldF9tX2NvbGxpc2lvbk9iamVjdCIsImNhc3RPYmplY3QiLCJnZXRfbV9oaXRQb2ludFdvcmxkIiwiZ2V0X21faGl0Tm9ybWFsV29ybGQiLCJnZXRfbV9jbG9zZXN0SGl0RnJhY3Rpb24iLCJhc3NlcnQiLCJBbGxIaXRzUmF5UmVzdWx0Q2FsbGJhY2siLCJyZXN1bHRzIiwic2V0X21fZmxhZ3MiLCJjb2xsaXNpb25PYmpzIiwiZ2V0X21fY29sbGlzaW9uT2JqZWN0cyIsInBvaW50cyIsIm5vcm1hbHMiLCJoaXRGcmFjdGlvbnMiLCJnZXRfbV9oaXRGcmFjdGlvbnMiLCJudW1IaXRzIiwic2l6ZSIsImkiLCJhdCIsInRhZ3MiLCJoYXMiLCJwdXNoIiwiX3N0b3JlQ29sbGlzaW9uIiwiaXNOZXdDb2xsaXNpb24iLCJndWlkIiwiZ2V0R3VpZCIsIm90aGVycyIsImluZGV4T2YiLCJfY3JlYXRlQ29udGFjdFBvaW50RnJvbUFtbW8iLCJnZXRfbV9sb2NhbFBvaW50QSIsImdldF9tX2xvY2FsUG9pbnRCIiwicG9zaXRpb25Xb3JsZE9uQSIsImdldFBvc2l0aW9uV29ybGRPbkEiLCJwb3NpdGlvbldvcmxkT25CIiwiZ2V0UG9zaXRpb25Xb3JsZE9uQiIsIm5vcm1hbFdvcmxkT25CIiwiZ2V0X21fbm9ybWFsV29ybGRPbkIiLCJjb250YWN0IiwiYWxsb2NhdGUiLCJzZXQiLCJnZXRBcHBsaWVkSW1wdWxzZSIsIl9jcmVhdGVSZXZlcnNlQ29udGFjdFBvaW50RnJvbUFtbW8iLCJfY3JlYXRlU2luZ2xlQ29udGFjdFJlc3VsdCIsIl9jcmVhdGVDb250YWN0UmVzdWx0IiwiX2NsZWFuT2xkQ29sbGlzaW9ucyIsImZyYW1lQ29sbGlzaW9uIiwiY29sbGlzaW9uIiwiZW50aXR5Q29sbGlzaW9uIiwiZW50aXR5UmlnaWRib2R5Iiwic3BsaWNlIiwidHJpZ2dlciIsImZpcmUiLCJfaGFzQ29udGFjdEV2ZW50IiwiYyIsImhhc0V2ZW50IiwiciIsIndvcmxkIiwidGltZVN0ZXAiLCJ3cmFwUG9pbnRlciIsImJ0RHluYW1pY3NXb3JsZCIsImdldERpc3BhdGNoZXIiLCJudW1NYW5pZm9sZHMiLCJnZXROdW1NYW5pZm9sZHMiLCJtYW5pZm9sZCIsImdldE1hbmlmb2xkQnlJbmRleEludGVybmFsIiwiYm9keTAiLCJnZXRCb2R5MCIsImJvZHkxIiwiZ2V0Qm9keTEiLCJ3YjAiLCJ3YjEiLCJlMCIsImUxIiwiZmxhZ3MwIiwiZ2V0Q29sbGlzaW9uRmxhZ3MiLCJmbGFnczEiLCJudW1Db250YWN0cyIsImdldE51bUNvbnRhY3RzIiwiZm9yd2FyZENvbnRhY3RzIiwicmV2ZXJzZUNvbnRhY3RzIiwibmV3Q29sbGlzaW9uIiwiQk9EWUZMQUdfTk9SRVNQT05TRV9PQkpFQ1QiLCJlMEV2ZW50cyIsImUxRXZlbnRzIiwiZTBCb2R5RXZlbnRzIiwiZTFCb2R5RXZlbnRzIiwiZ2xvYmFsRXZlbnRzIiwiaiIsImJ0Q29udGFjdFBvaW50IiwiZ2V0Q29udGFjdFBvaW50IiwicmV2ZXJzZUNvbnRhY3RQb2ludCIsImZvcndhcmRSZXN1bHQiLCJyZXZlcnNlUmVzdWx0IiwiZnJlZUFsbCIsImR0IiwibGVuIiwicGh5c2ljc1N0YXJ0Iiwibm93IiwiZ2V0R3Jhdml0eSIsInNldEdyYXZpdHkiLCJ0cmlnZ2VycyIsInVwZGF0ZVRyYW5zZm9ybSIsImNvbXBvdW5kcyIsIl91cGRhdGVDb21wb3VuZCIsImtpbmVtYXRpYyIsIl91cGRhdGVLaW5lbWF0aWMiLCJzdGVwU2ltdWxhdGlvbiIsImR5bmFtaWMiLCJfdXBkYXRlRHluYW1pYyIsImdldFBvaW50ZXIiLCJwaHlzaWNzVGltZSIsIkNvbXBvbmVudCIsIl9idWlsZEFjY2Vzc29ycyIsInByb3RvdHlwZSJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7OztBQWFBLElBQUlBLFlBQVksRUFBRUMsVUFBVSxDQUFBOztBQUU1QjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsTUFBTUMsYUFBYSxDQUFDO0FBQ2hCO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0VBQ0lDLFdBQVdBLENBQUNDLE1BQU0sRUFBRUMsS0FBSyxFQUFFQyxNQUFNLEVBQUVDLFdBQVcsRUFBRTtBQUM1QztBQUNSO0FBQ0E7QUFDQTtBQUNBO0lBQ1EsSUFBSSxDQUFDSCxNQUFNLEdBQUdBLE1BQU0sQ0FBQTs7QUFFcEI7QUFDUjtBQUNBO0FBQ0E7QUFDQTtJQUNRLElBQUksQ0FBQ0MsS0FBSyxHQUFHQSxLQUFLLENBQUE7O0FBRWxCO0FBQ1I7QUFDQTtBQUNBO0FBQ0E7SUFDUSxJQUFJLENBQUNDLE1BQU0sR0FBR0EsTUFBTSxDQUFBOztBQUVwQjtBQUNSO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7SUFDUSxJQUFJLENBQUNDLFdBQVcsR0FBR0EsV0FBVyxDQUFBO0FBQ2xDLEdBQUE7QUFDSixDQUFBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxNQUFNQyxtQkFBbUIsQ0FBQztBQUN0QjtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0lMLEVBQUFBLFdBQVdBLENBQUNNLENBQUMsRUFBRUMsQ0FBQyxFQUFFQyxZQUFZLEVBQUU7QUFDNUIsSUFBQSxJQUFJQyxTQUFTLENBQUNDLE1BQU0sS0FBSyxDQUFDLEVBQUU7QUFDeEI7QUFDWjtBQUNBO0FBQ0E7QUFDQTtNQUNZLElBQUksQ0FBQ0osQ0FBQyxHQUFHLElBQUksQ0FBQTs7QUFFYjtBQUNaO0FBQ0E7QUFDQTtBQUNBO01BQ1ksSUFBSSxDQUFDQyxDQUFDLEdBQUcsSUFBSSxDQUFBOztBQUViO0FBQ1o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtNQUNZLElBQUksQ0FBQ0ksT0FBTyxHQUFHLENBQUMsQ0FBQTs7QUFFaEI7QUFDWjtBQUNBO0FBQ0E7QUFDQTtBQUNZLE1BQUEsSUFBSSxDQUFDQyxXQUFXLEdBQUcsSUFBSUMsSUFBSSxFQUFFLENBQUE7O0FBRTdCO0FBQ1o7QUFDQTtBQUNBO0FBQ0E7QUFDWSxNQUFBLElBQUksQ0FBQ0MsV0FBVyxHQUFHLElBQUlELElBQUksRUFBRSxDQUFBOztBQUU3QjtBQUNaO0FBQ0E7QUFDQTtBQUNBO0FBQ1ksTUFBQSxJQUFJLENBQUNFLE1BQU0sR0FBRyxJQUFJRixJQUFJLEVBQUUsQ0FBQTs7QUFFeEI7QUFDWjtBQUNBO0FBQ0E7QUFDQTtBQUNZLE1BQUEsSUFBSSxDQUFDRyxNQUFNLEdBQUcsSUFBSUgsSUFBSSxFQUFFLENBQUE7O0FBRXhCO0FBQ1o7QUFDQTtBQUNBO0FBQ0E7QUFDWSxNQUFBLElBQUksQ0FBQ1YsTUFBTSxHQUFHLElBQUlVLElBQUksRUFBRSxDQUFBO0FBQzVCLEtBQUMsTUFBTTtNQUNILElBQUksQ0FBQ1AsQ0FBQyxHQUFHQSxDQUFDLENBQUE7TUFDVixJQUFJLENBQUNDLENBQUMsR0FBR0EsQ0FBQyxDQUFBO0FBQ1YsTUFBQSxJQUFJLENBQUNJLE9BQU8sR0FBR0gsWUFBWSxDQUFDRyxPQUFPLENBQUE7QUFDbkMsTUFBQSxJQUFJLENBQUNDLFdBQVcsR0FBR0osWUFBWSxDQUFDUyxVQUFVLENBQUE7QUFDMUMsTUFBQSxJQUFJLENBQUNILFdBQVcsR0FBR04sWUFBWSxDQUFDVSxlQUFlLENBQUE7QUFDL0MsTUFBQSxJQUFJLENBQUNILE1BQU0sR0FBR1AsWUFBWSxDQUFDTixLQUFLLENBQUE7QUFDaEMsTUFBQSxJQUFJLENBQUNjLE1BQU0sR0FBR1IsWUFBWSxDQUFDVyxVQUFVLENBQUE7QUFDckMsTUFBQSxJQUFJLENBQUNoQixNQUFNLEdBQUdLLFlBQVksQ0FBQ0wsTUFBTSxDQUFBO0FBQ3JDLEtBQUE7QUFDSixHQUFBO0FBQ0osQ0FBQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsTUFBTWlCLFlBQVksQ0FBQztBQUNmO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0lwQixFQUFBQSxXQUFXQSxDQUFDaUIsVUFBVSxHQUFHLElBQUlKLElBQUksRUFBRSxFQUFFSyxlQUFlLEdBQUcsSUFBSUwsSUFBSSxFQUFFLEVBQUVYLEtBQUssR0FBRyxJQUFJVyxJQUFJLEVBQUUsRUFBRU0sVUFBVSxHQUFHLElBQUlOLElBQUksRUFBRSxFQUFFVixNQUFNLEdBQUcsSUFBSVUsSUFBSSxFQUFFLEVBQUVGLE9BQU8sR0FBRyxDQUFDLEVBQUU7QUFDOUk7QUFDUjtBQUNBO0FBQ0E7QUFDQTtJQUNRLElBQUksQ0FBQ00sVUFBVSxHQUFHQSxVQUFVLENBQUE7O0FBRTVCO0FBQ1I7QUFDQTtBQUNBO0FBQ0E7SUFDUSxJQUFJLENBQUNDLGVBQWUsR0FBR0EsZUFBZSxDQUFBOztBQUV0QztBQUNSO0FBQ0E7QUFDQTtBQUNBO0lBQ1EsSUFBSSxDQUFDaEIsS0FBSyxHQUFHQSxLQUFLLENBQUE7O0FBRWxCO0FBQ1I7QUFDQTtBQUNBO0FBQ0E7SUFDUSxJQUFJLENBQUNpQixVQUFVLEdBQUdBLFVBQVUsQ0FBQTs7QUFFNUI7QUFDUjtBQUNBO0FBQ0E7QUFDQTtJQUNRLElBQUksQ0FBQ2hCLE1BQU0sR0FBR0EsTUFBTSxDQUFBOztBQUVwQjtBQUNSO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7SUFDUSxJQUFJLENBQUNRLE9BQU8sR0FBR0EsT0FBTyxDQUFBO0FBQzFCLEdBQUE7QUFDSixDQUFBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxNQUFNVSxhQUFhLENBQUM7QUFDaEI7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNJckIsRUFBQUEsV0FBV0EsQ0FBQ3NCLEtBQUssRUFBRUMsUUFBUSxFQUFFO0FBQ3pCO0FBQ1I7QUFDQTtBQUNBO0FBQ0E7SUFDUSxJQUFJLENBQUNELEtBQUssR0FBR0EsS0FBSyxDQUFBOztBQUVsQjtBQUNSO0FBQ0E7QUFDQTtBQUNBO0lBQ1EsSUFBSSxDQUFDQyxRQUFRLEdBQUdBLFFBQVEsQ0FBQTtBQUM1QixHQUFBO0FBQ0osQ0FBQTtBQUVBLE1BQU1DLE9BQU8sR0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFBOztBQUUzQjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxNQUFNQyx3QkFBd0IsU0FBU0MsZUFBZSxDQUFDO0FBbURuRDtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7RUFDSTFCLFdBQVdBLENBQUMyQixHQUFHLEVBQUU7SUFDYixLQUFLLENBQUNBLEdBQUcsQ0FBQyxDQUFBO0FBekRkO0FBQ0o7QUFDQTtBQUNBO0lBSEksSUFJQUMsQ0FBQUEsV0FBVyxHQUFHLEVBQUUsQ0FBQTtBQUVoQjtBQUNKO0FBQ0E7QUFDQTtBQUhJLElBQUEsSUFBQSxDQUlBQyxhQUFhLEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FBQTtBQUV0QjtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7SUFMSSxJQU1BQyxDQUFBQSxPQUFPLEdBQUcsSUFBSWpCLElBQUksQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUE7QUFFL0I7QUFDSjtBQUNBO0FBQ0E7QUFISSxJQUFBLElBQUEsQ0FJQWtCLGVBQWUsR0FBRyxJQUFJQyxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUE7QUFFckM7QUFDSjtBQUNBO0FBQ0E7SUFISSxJQUlBQyxDQUFBQSxRQUFRLEdBQUcsRUFBRSxDQUFBO0FBRWI7QUFDSjtBQUNBO0FBQ0E7SUFISSxJQUlBQyxDQUFBQSxVQUFVLEdBQUcsRUFBRSxDQUFBO0FBRWY7QUFDSjtBQUNBO0FBQ0E7SUFISSxJQUlBQyxDQUFBQSxTQUFTLEdBQUcsRUFBRSxDQUFBO0FBRWQ7QUFDSjtBQUNBO0FBQ0E7SUFISSxJQUlBQyxDQUFBQSxVQUFVLEdBQUcsRUFBRSxDQUFBO0lBV1gsSUFBSSxDQUFDQyxFQUFFLEdBQUcsV0FBVyxDQUFBO0FBQ3JCLElBQUEsSUFBSSxDQUFDQyxNQUFNLEdBQUdYLEdBQUcsQ0FBQ1ksS0FBSyxDQUFDQyxLQUFLLENBQUE7SUFFN0IsSUFBSSxDQUFDQyxhQUFhLEdBQUdDLGtCQUFrQixDQUFBO0lBQ3ZDLElBQUksQ0FBQ0MsUUFBUSxHQUFHQyxzQkFBc0IsQ0FBQTtJQUV0QyxJQUFJLENBQUNDLGdCQUFnQixHQUFHLElBQUksQ0FBQTtJQUM1QixJQUFJLENBQUNDLGlCQUFpQixHQUFHLElBQUksQ0FBQTtJQUM3QixJQUFJLENBQUNDLHVCQUF1QixHQUFHLElBQUksQ0FBQTtJQUVuQyxJQUFJLENBQUNDLE1BQU0sR0FBR3hCLE9BQU8sQ0FBQTtBQUVyQixJQUFBLElBQUksQ0FBQ3lCLFVBQVUsR0FBRyxFQUFFLENBQUE7QUFDcEIsSUFBQSxJQUFJLENBQUNDLGVBQWUsR0FBRyxFQUFFLENBQUE7SUFFekIsSUFBSSxDQUFDQyxFQUFFLENBQUMsY0FBYyxFQUFFLElBQUksQ0FBQ0MsY0FBYyxFQUFFLElBQUksQ0FBQyxDQUFBO0lBQ2xELElBQUksQ0FBQ0QsRUFBRSxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUNFLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQTtBQUMxQyxHQUFBOztBQUVBO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFSTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0lDLEVBQUFBLGVBQWVBLEdBQUc7QUFDZDtBQUNBLElBQUEsSUFBSSxPQUFPQyxJQUFJLEtBQUssV0FBVyxFQUFFO01BQzdCLElBQUksQ0FBQ0Msc0JBQXNCLEdBQUcsSUFBSUQsSUFBSSxDQUFDRSwrQkFBK0IsRUFBRSxDQUFBO01BQ3hFLElBQUksQ0FBQ0MsVUFBVSxHQUFHLElBQUlILElBQUksQ0FBQ0kscUJBQXFCLENBQUMsSUFBSSxDQUFDSCxzQkFBc0IsQ0FBQyxDQUFBO01BQzdFLElBQUksQ0FBQ0ksb0JBQW9CLEdBQUcsSUFBSUwsSUFBSSxDQUFDTSxnQkFBZ0IsRUFBRSxDQUFBO01BQ3ZELElBQUksQ0FBQ0MsTUFBTSxHQUFHLElBQUlQLElBQUksQ0FBQ1EsbUNBQW1DLEVBQUUsQ0FBQTtNQUM1RCxJQUFJLENBQUNDLGFBQWEsR0FBRyxJQUFJVCxJQUFJLENBQUNVLHVCQUF1QixDQUFDLElBQUksQ0FBQ1AsVUFBVSxFQUFFLElBQUksQ0FBQ0Usb0JBQW9CLEVBQUUsSUFBSSxDQUFDRSxNQUFNLEVBQUUsSUFBSSxDQUFDTixzQkFBc0IsQ0FBQyxDQUFBO0FBRTNJLE1BQUEsSUFBSSxJQUFJLENBQUNRLGFBQWEsQ0FBQ0UsdUJBQXVCLEVBQUU7QUFDNUMsUUFBQSxNQUFNQyx5QkFBeUIsR0FBR1osSUFBSSxDQUFDYSxXQUFXLENBQUMsSUFBSSxDQUFDQyxtQkFBbUIsQ0FBQ0MsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFBO0FBQzlGLFFBQUEsSUFBSSxDQUFDTixhQUFhLENBQUNFLHVCQUF1QixDQUFDQyx5QkFBeUIsQ0FBQyxDQUFBO0FBQ3pFLE9BQUMsTUFBTTtBQUNISSxRQUFBQSxLQUFLLENBQUNDLElBQUksQ0FBQyxtSEFBbUgsQ0FBQyxDQUFBO0FBQ25JLE9BQUE7O0FBRUE7QUFDQTNFLE1BQUFBLFlBQVksR0FBRyxJQUFJMEQsSUFBSSxDQUFDa0IsU0FBUyxFQUFFLENBQUE7QUFDbkMzRSxNQUFBQSxVQUFVLEdBQUcsSUFBSXlELElBQUksQ0FBQ2tCLFNBQVMsRUFBRSxDQUFBO01BQ2pDL0Isa0JBQWtCLENBQUNZLGVBQWUsRUFBRSxDQUFBO01BRXBDLElBQUksQ0FBQ1QsZ0JBQWdCLEdBQUcsSUFBSTZCLFVBQVUsQ0FBQ3RELFlBQVksRUFBRSxDQUFDLENBQUMsQ0FBQTtNQUN2RCxJQUFJLENBQUMwQixpQkFBaUIsR0FBRyxJQUFJNEIsVUFBVSxDQUFDckQsYUFBYSxFQUFFLENBQUMsQ0FBQyxDQUFBO01BQ3pELElBQUksQ0FBQzBCLHVCQUF1QixHQUFHLElBQUkyQixVQUFVLENBQUNyRSxtQkFBbUIsRUFBRSxDQUFDLENBQUMsQ0FBQTtBQUVyRSxNQUFBLElBQUksQ0FBQ3NCLEdBQUcsQ0FBQ2dELE9BQU8sQ0FBQ3hCLEVBQUUsQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDeUIsUUFBUSxFQUFFLElBQUksQ0FBQyxDQUFBO0FBQ3RELEtBQUMsTUFBTTtBQUNIO0FBQ0EsTUFBQSxJQUFJLENBQUNqRCxHQUFHLENBQUNnRCxPQUFPLENBQUNFLEdBQUcsQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDRCxRQUFRLEVBQUUsSUFBSSxDQUFDLENBQUE7QUFDdkQsS0FBQTtBQUNKLEdBQUE7QUFFQUUsRUFBQUEsdUJBQXVCQSxDQUFDQyxTQUFTLEVBQUVDLElBQUksRUFBRUMsVUFBVSxFQUFFO0lBQ2pELE1BQU1DLEtBQUssR0FBRyxDQUNWLE1BQU0sRUFDTixlQUFlLEVBQ2YsZ0JBQWdCLEVBQ2hCLGNBQWMsRUFDZCxlQUFlLEVBQ2YsVUFBVSxFQUNWLGlCQUFpQixFQUNqQixhQUFhLEVBQ2IsTUFBTSxFQUNOLE9BQU8sRUFDUCxNQUFNLENBQ1QsQ0FBQTtBQUVELElBQUEsS0FBSyxNQUFNQyxRQUFRLElBQUlELEtBQUssRUFBRTtBQUMxQixNQUFBLElBQUlGLElBQUksQ0FBQ0ksY0FBYyxDQUFDRCxRQUFRLENBQUMsRUFBRTtBQUMvQixRQUFBLE1BQU1FLEtBQUssR0FBR0wsSUFBSSxDQUFDRyxRQUFRLENBQUMsQ0FBQTtBQUM1QixRQUFBLElBQUlHLEtBQUssQ0FBQ0MsT0FBTyxDQUFDRixLQUFLLENBQUMsRUFBRTtVQUN0Qk4sU0FBUyxDQUFDSSxRQUFRLENBQUMsR0FBRyxJQUFJdEUsSUFBSSxDQUFDd0UsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFQSxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUVBLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFBO0FBQ2hFLFNBQUMsTUFBTTtBQUNITixVQUFBQSxTQUFTLENBQUNJLFFBQVEsQ0FBQyxHQUFHRSxLQUFLLENBQUE7QUFDL0IsU0FBQTtBQUNKLE9BQUE7QUFDSixLQUFBO0lBRUEsS0FBSyxDQUFDUCx1QkFBdUIsQ0FBQ0MsU0FBUyxFQUFFQyxJQUFJLEVBQUUsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFBO0FBQy9ELEdBQUE7QUFFQVEsRUFBQUEsY0FBY0EsQ0FBQ3ZGLE1BQU0sRUFBRXdGLEtBQUssRUFBRTtBQUMxQjtBQUNBLElBQUEsTUFBTUMsU0FBUyxHQUFHekYsTUFBTSxDQUFDeUYsU0FBUyxDQUFBO0FBQ2xDLElBQUEsTUFBTVYsSUFBSSxHQUFHO01BQ1RXLE9BQU8sRUFBRUQsU0FBUyxDQUFDQyxPQUFPO01BQzFCQyxJQUFJLEVBQUVGLFNBQVMsQ0FBQ0UsSUFBSTtNQUNwQkMsYUFBYSxFQUFFSCxTQUFTLENBQUNHLGFBQWE7TUFDdENDLGNBQWMsRUFBRUosU0FBUyxDQUFDSSxjQUFjO0FBQ3hDQyxNQUFBQSxZQUFZLEVBQUUsQ0FBQ0wsU0FBUyxDQUFDSyxZQUFZLENBQUNDLENBQUMsRUFBRU4sU0FBUyxDQUFDSyxZQUFZLENBQUNFLENBQUMsRUFBRVAsU0FBUyxDQUFDSyxZQUFZLENBQUNHLENBQUMsQ0FBQztBQUM1RkMsTUFBQUEsYUFBYSxFQUFFLENBQUNULFNBQVMsQ0FBQ1MsYUFBYSxDQUFDSCxDQUFDLEVBQUVOLFNBQVMsQ0FBQ1MsYUFBYSxDQUFDRixDQUFDLEVBQUVQLFNBQVMsQ0FBQ1MsYUFBYSxDQUFDRCxDQUFDLENBQUM7TUFDaEdFLFFBQVEsRUFBRVYsU0FBUyxDQUFDVSxRQUFRO01BQzVCQyxlQUFlLEVBQUVYLFNBQVMsQ0FBQ1csZUFBZTtNQUMxQ0MsV0FBVyxFQUFFWixTQUFTLENBQUNZLFdBQVc7TUFDbENDLElBQUksRUFBRWIsU0FBUyxDQUFDYSxJQUFJO01BQ3BCQyxLQUFLLEVBQUVkLFNBQVMsQ0FBQ2MsS0FBSztNQUN0QkMsSUFBSSxFQUFFZixTQUFTLENBQUNlLElBQUFBO0tBQ25CLENBQUE7QUFFRCxJQUFBLE9BQU8sSUFBSSxDQUFDQyxZQUFZLENBQUNqQixLQUFLLEVBQUVULElBQUksQ0FBQyxDQUFBO0FBQ3pDLEdBQUE7QUFFQTVCLEVBQUFBLGNBQWNBLENBQUNuRCxNQUFNLEVBQUU4RSxTQUFTLEVBQUU7SUFDOUIsSUFBSUEsU0FBUyxDQUFDWSxPQUFPLEVBQUU7TUFDbkJaLFNBQVMsQ0FBQ1ksT0FBTyxHQUFHLEtBQUssQ0FBQTtBQUM3QixLQUFBO0FBQ0osR0FBQTtBQUVBdEMsRUFBQUEsUUFBUUEsQ0FBQ3BELE1BQU0sRUFBRThFLFNBQVMsRUFBRTtBQUN4QixJQUFBLE1BQU00QixJQUFJLEdBQUc1QixTQUFTLENBQUM0QixJQUFJLENBQUE7QUFDM0IsSUFBQSxJQUFJQSxJQUFJLEVBQUU7QUFDTixNQUFBLElBQUksQ0FBQ0MsVUFBVSxDQUFDRCxJQUFJLENBQUMsQ0FBQTtBQUNyQixNQUFBLElBQUksQ0FBQ0UsV0FBVyxDQUFDRixJQUFJLENBQUMsQ0FBQTtNQUV0QjVCLFNBQVMsQ0FBQzRCLElBQUksR0FBRyxJQUFJLENBQUE7QUFDekIsS0FBQTtBQUNKLEdBQUE7QUFFQUcsRUFBQUEsT0FBT0EsQ0FBQ0gsSUFBSSxFQUFFSCxLQUFLLEVBQUVDLElBQUksRUFBRTtBQUN2QixJQUFBLElBQUlELEtBQUssS0FBS08sU0FBUyxJQUFJTixJQUFJLEtBQUtNLFNBQVMsRUFBRTtNQUMzQyxJQUFJLENBQUMvQyxhQUFhLENBQUNnRCxZQUFZLENBQUNMLElBQUksRUFBRUgsS0FBSyxFQUFFQyxJQUFJLENBQUMsQ0FBQTtBQUN0RCxLQUFDLE1BQU07QUFDSCxNQUFBLElBQUksQ0FBQ3pDLGFBQWEsQ0FBQ2dELFlBQVksQ0FBQ0wsSUFBSSxDQUFDLENBQUE7QUFDekMsS0FBQTtBQUNKLEdBQUE7RUFFQUMsVUFBVUEsQ0FBQ0QsSUFBSSxFQUFFO0FBQ2IsSUFBQSxJQUFJLENBQUMzQyxhQUFhLENBQUNpRCxlQUFlLENBQUNOLElBQUksQ0FBQyxDQUFBO0FBQzVDLEdBQUE7QUFFQU8sRUFBQUEsVUFBVUEsQ0FBQ3RCLElBQUksRUFBRXVCLEtBQUssRUFBRUMsU0FBUyxFQUFFO0FBQy9CLElBQUEsTUFBTUMsWUFBWSxHQUFHLElBQUk5RCxJQUFJLENBQUNrQixTQUFTLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQTtJQUNoRCxJQUFJbUIsSUFBSSxLQUFLLENBQUMsRUFBRTtBQUNadUIsTUFBQUEsS0FBSyxDQUFDRyxxQkFBcUIsQ0FBQzFCLElBQUksRUFBRXlCLFlBQVksQ0FBQyxDQUFBO0FBQ25ELEtBQUE7SUFFQSxNQUFNRSxXQUFXLEdBQUcsSUFBSWhFLElBQUksQ0FBQ2lFLG9CQUFvQixDQUFDSixTQUFTLENBQUMsQ0FBQTtBQUM1RCxJQUFBLE1BQU1LLFFBQVEsR0FBRyxJQUFJbEUsSUFBSSxDQUFDbUUsMkJBQTJCLENBQUM5QixJQUFJLEVBQUUyQixXQUFXLEVBQUVKLEtBQUssRUFBRUUsWUFBWSxDQUFDLENBQUE7SUFDN0YsTUFBTVYsSUFBSSxHQUFHLElBQUlwRCxJQUFJLENBQUNvRSxXQUFXLENBQUNGLFFBQVEsQ0FBQyxDQUFBO0FBQzNDbEUsSUFBQUEsSUFBSSxDQUFDcUUsT0FBTyxDQUFDSCxRQUFRLENBQUMsQ0FBQTtBQUN0QmxFLElBQUFBLElBQUksQ0FBQ3FFLE9BQU8sQ0FBQ1AsWUFBWSxDQUFDLENBQUE7QUFFMUIsSUFBQSxPQUFPVixJQUFJLENBQUE7QUFDZixHQUFBO0VBRUFFLFdBQVdBLENBQUNGLElBQUksRUFBRTtBQUNkO0FBQ0EsSUFBQSxNQUFNWSxXQUFXLEdBQUdaLElBQUksQ0FBQ2tCLGNBQWMsRUFBRSxDQUFBO0FBQ3pDLElBQUEsSUFBSU4sV0FBVyxFQUFFO0FBQ2JoRSxNQUFBQSxJQUFJLENBQUNxRSxPQUFPLENBQUNMLFdBQVcsQ0FBQyxDQUFBO0FBQzdCLEtBQUE7QUFDQWhFLElBQUFBLElBQUksQ0FBQ3FFLE9BQU8sQ0FBQ2pCLElBQUksQ0FBQyxDQUFBO0FBQ3RCLEdBQUE7O0FBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtFQUNJbUIsWUFBWUEsQ0FBQ0MsS0FBSyxFQUFFQyxHQUFHLEVBQUVDLE9BQU8sR0FBRyxFQUFFLEVBQUU7QUFDbkM7QUFDQSxJQUFBLElBQUlBLE9BQU8sQ0FBQ0MsVUFBVSxJQUFJRCxPQUFPLENBQUNFLGNBQWMsRUFBRTtNQUM5Q0YsT0FBTyxDQUFDRyxJQUFJLEdBQUcsSUFBSSxDQUFBO0FBQ25CLE1BQUEsT0FBTyxJQUFJLENBQUNDLFVBQVUsQ0FBQ04sS0FBSyxFQUFFQyxHQUFHLEVBQUVDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLElBQUksQ0FBQTtBQUMxRCxLQUFBO0lBRUEsSUFBSUssTUFBTSxHQUFHLElBQUksQ0FBQTtBQUVqQnpJLElBQUFBLFlBQVksQ0FBQzBJLFFBQVEsQ0FBQ1IsS0FBSyxDQUFDL0IsQ0FBQyxFQUFFK0IsS0FBSyxDQUFDOUIsQ0FBQyxFQUFFOEIsS0FBSyxDQUFDN0IsQ0FBQyxDQUFDLENBQUE7QUFDaERwRyxJQUFBQSxVQUFVLENBQUN5SSxRQUFRLENBQUNQLEdBQUcsQ0FBQ2hDLENBQUMsRUFBRWdDLEdBQUcsQ0FBQy9CLENBQUMsRUFBRStCLEdBQUcsQ0FBQzlCLENBQUMsQ0FBQyxDQUFBO0lBQ3hDLE1BQU1zQyxXQUFXLEdBQUcsSUFBSWpGLElBQUksQ0FBQ2tGLHdCQUF3QixDQUFDNUksWUFBWSxFQUFFQyxVQUFVLENBQUMsQ0FBQTtBQUUvRSxJQUFBLElBQUksT0FBT21JLE9BQU8sQ0FBQ1Msb0JBQW9CLEtBQUssUUFBUSxFQUFFO0FBQ2xERixNQUFBQSxXQUFXLENBQUNHLDBCQUEwQixDQUFDVixPQUFPLENBQUNTLG9CQUFvQixDQUFDLENBQUE7QUFDeEUsS0FBQTtBQUVBLElBQUEsSUFBSSxPQUFPVCxPQUFPLENBQUNXLG1CQUFtQixLQUFLLFFBQVEsRUFBRTtBQUNqREosTUFBQUEsV0FBVyxDQUFDSyx5QkFBeUIsQ0FBQ1osT0FBTyxDQUFDVyxtQkFBbUIsQ0FBQyxDQUFBO0FBQ3RFLEtBQUE7SUFFQSxJQUFJLENBQUM1RSxhQUFhLENBQUM4RSxPQUFPLENBQUNqSixZQUFZLEVBQUVDLFVBQVUsRUFBRTBJLFdBQVcsQ0FBQyxDQUFBO0FBQ2pFLElBQUEsSUFBSUEsV0FBVyxDQUFDTyxNQUFNLEVBQUUsRUFBRTtBQUN0QixNQUFBLE1BQU1DLFlBQVksR0FBR1IsV0FBVyxDQUFDUyxxQkFBcUIsRUFBRSxDQUFBO01BQ3hELE1BQU10QyxJQUFJLEdBQUdwRCxJQUFJLENBQUMyRixVQUFVLENBQUNGLFlBQVksRUFBRXpGLElBQUksQ0FBQ29FLFdBQVcsQ0FBQyxDQUFBO0FBRTVELE1BQUEsSUFBSWhCLElBQUksRUFBRTtBQUNOLFFBQUEsTUFBTXpHLEtBQUssR0FBR3NJLFdBQVcsQ0FBQ1csbUJBQW1CLEVBQUUsQ0FBQTtBQUMvQyxRQUFBLE1BQU1oSixNQUFNLEdBQUdxSSxXQUFXLENBQUNZLG9CQUFvQixFQUFFLENBQUE7UUFFakRkLE1BQU0sR0FBRyxJQUFJdkksYUFBYSxDQUN0QjRHLElBQUksQ0FBQzFHLE1BQU0sRUFDWCxJQUFJWSxJQUFJLENBQUNYLEtBQUssQ0FBQzhGLENBQUMsRUFBRSxFQUFFOUYsS0FBSyxDQUFDK0YsQ0FBQyxFQUFFLEVBQUUvRixLQUFLLENBQUNnRyxDQUFDLEVBQUUsQ0FBQyxFQUN6QyxJQUFJckYsSUFBSSxDQUFDVixNQUFNLENBQUM2RixDQUFDLEVBQUUsRUFBRTdGLE1BQU0sQ0FBQzhGLENBQUMsRUFBRSxFQUFFOUYsTUFBTSxDQUFDK0YsQ0FBQyxFQUFFLENBQUMsRUFDNUNzQyxXQUFXLENBQUNhLHdCQUF3QixFQUN4QyxDQUFDLENBQUE7QUFDTCxPQUFBO0FBQ0osS0FBQTtBQUVBOUYsSUFBQUEsSUFBSSxDQUFDcUUsT0FBTyxDQUFDWSxXQUFXLENBQUMsQ0FBQTtBQUV6QixJQUFBLE9BQU9GLE1BQU0sQ0FBQTtBQUNqQixHQUFBOztBQUVBO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0VBQ0lELFVBQVVBLENBQUNOLEtBQUssRUFBRUMsR0FBRyxFQUFFQyxPQUFPLEdBQUcsRUFBRSxFQUFFO0lBQ2pDMUQsS0FBSyxDQUFDK0UsTUFBTSxDQUFDL0YsSUFBSSxDQUFDZ0csd0JBQXdCLEVBQUUscUlBQXFJLENBQUMsQ0FBQTtJQUVsTCxNQUFNQyxPQUFPLEdBQUcsRUFBRSxDQUFBO0FBRWxCM0osSUFBQUEsWUFBWSxDQUFDMEksUUFBUSxDQUFDUixLQUFLLENBQUMvQixDQUFDLEVBQUUrQixLQUFLLENBQUM5QixDQUFDLEVBQUU4QixLQUFLLENBQUM3QixDQUFDLENBQUMsQ0FBQTtBQUNoRHBHLElBQUFBLFVBQVUsQ0FBQ3lJLFFBQVEsQ0FBQ1AsR0FBRyxDQUFDaEMsQ0FBQyxFQUFFZ0MsR0FBRyxDQUFDL0IsQ0FBQyxFQUFFK0IsR0FBRyxDQUFDOUIsQ0FBQyxDQUFDLENBQUE7SUFDeEMsTUFBTXNDLFdBQVcsR0FBRyxJQUFJakYsSUFBSSxDQUFDZ0csd0JBQXdCLENBQUMxSixZQUFZLEVBQUVDLFVBQVUsQ0FBQyxDQUFBOztBQUUvRTtBQUNBMEksSUFBQUEsV0FBVyxDQUFDaUIsV0FBVyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQTtBQUUvQixJQUFBLElBQUksT0FBT3hCLE9BQU8sQ0FBQ1Msb0JBQW9CLEtBQUssUUFBUSxFQUFFO0FBQ2xERixNQUFBQSxXQUFXLENBQUNHLDBCQUEwQixDQUFDVixPQUFPLENBQUNTLG9CQUFvQixDQUFDLENBQUE7QUFDeEUsS0FBQTtBQUVBLElBQUEsSUFBSSxPQUFPVCxPQUFPLENBQUNXLG1CQUFtQixLQUFLLFFBQVEsRUFBRTtBQUNqREosTUFBQUEsV0FBVyxDQUFDSyx5QkFBeUIsQ0FBQ1osT0FBTyxDQUFDVyxtQkFBbUIsQ0FBQyxDQUFBO0FBQ3RFLEtBQUE7SUFFQSxJQUFJLENBQUM1RSxhQUFhLENBQUM4RSxPQUFPLENBQUNqSixZQUFZLEVBQUVDLFVBQVUsRUFBRTBJLFdBQVcsQ0FBQyxDQUFBO0FBQ2pFLElBQUEsSUFBSUEsV0FBVyxDQUFDTyxNQUFNLEVBQUUsRUFBRTtBQUN0QixNQUFBLE1BQU1XLGFBQWEsR0FBR2xCLFdBQVcsQ0FBQ21CLHNCQUFzQixFQUFFLENBQUE7QUFDMUQsTUFBQSxNQUFNQyxNQUFNLEdBQUdwQixXQUFXLENBQUNXLG1CQUFtQixFQUFFLENBQUE7QUFDaEQsTUFBQSxNQUFNVSxPQUFPLEdBQUdyQixXQUFXLENBQUNZLG9CQUFvQixFQUFFLENBQUE7QUFDbEQsTUFBQSxNQUFNVSxZQUFZLEdBQUd0QixXQUFXLENBQUN1QixrQkFBa0IsRUFBRSxDQUFBO0FBRXJELE1BQUEsTUFBTUMsT0FBTyxHQUFHTixhQUFhLENBQUNPLElBQUksRUFBRSxDQUFBO01BQ3BDLEtBQUssSUFBSUMsQ0FBQyxHQUFHLENBQUMsRUFBRUEsQ0FBQyxHQUFHRixPQUFPLEVBQUVFLENBQUMsRUFBRSxFQUFFO0FBQzlCLFFBQUEsTUFBTXZELElBQUksR0FBR3BELElBQUksQ0FBQzJGLFVBQVUsQ0FBQ1EsYUFBYSxDQUFDUyxFQUFFLENBQUNELENBQUMsQ0FBQyxFQUFFM0csSUFBSSxDQUFDb0UsV0FBVyxDQUFDLENBQUE7QUFFbkUsUUFBQSxJQUFJaEIsSUFBSSxJQUFJQSxJQUFJLENBQUMxRyxNQUFNLEVBQUU7QUFDckIsVUFBQSxJQUFJZ0ksT0FBTyxDQUFDQyxVQUFVLElBQUksQ0FBQ3ZCLElBQUksQ0FBQzFHLE1BQU0sQ0FBQ21LLElBQUksQ0FBQ0MsR0FBRyxDQUFDLEdBQUdwQyxPQUFPLENBQUNDLFVBQVUsQ0FBQyxJQUFJRCxPQUFPLENBQUNFLGNBQWMsSUFBSSxDQUFDRixPQUFPLENBQUNFLGNBQWMsQ0FBQ3hCLElBQUksQ0FBQzFHLE1BQU0sQ0FBQyxFQUFFO0FBQ3RJLFlBQUEsU0FBQTtBQUNKLFdBQUE7QUFFQSxVQUFBLE1BQU1DLEtBQUssR0FBRzBKLE1BQU0sQ0FBQ08sRUFBRSxDQUFDRCxDQUFDLENBQUMsQ0FBQTtBQUMxQixVQUFBLE1BQU0vSixNQUFNLEdBQUcwSixPQUFPLENBQUNNLEVBQUUsQ0FBQ0QsQ0FBQyxDQUFDLENBQUE7VUFDNUIsTUFBTTVCLE1BQU0sR0FBRyxJQUFJdkksYUFBYSxDQUM1QjRHLElBQUksQ0FBQzFHLE1BQU0sRUFDWCxJQUFJWSxJQUFJLENBQUNYLEtBQUssQ0FBQzhGLENBQUMsRUFBRSxFQUFFOUYsS0FBSyxDQUFDK0YsQ0FBQyxFQUFFLEVBQUUvRixLQUFLLENBQUNnRyxDQUFDLEVBQUUsQ0FBQyxFQUN6QyxJQUFJckYsSUFBSSxDQUFDVixNQUFNLENBQUM2RixDQUFDLEVBQUUsRUFBRTdGLE1BQU0sQ0FBQzhGLENBQUMsRUFBRSxFQUFFOUYsTUFBTSxDQUFDK0YsQ0FBQyxFQUFFLENBQUMsRUFDNUM0RCxZQUFZLENBQUNLLEVBQUUsQ0FBQ0QsQ0FBQyxDQUNyQixDQUFDLENBQUE7QUFFRFYsVUFBQUEsT0FBTyxDQUFDYyxJQUFJLENBQUNoQyxNQUFNLENBQUMsQ0FBQTtBQUN4QixTQUFBO0FBQ0osT0FBQTtNQUVBLElBQUlMLE9BQU8sQ0FBQ0csSUFBSSxFQUFFO0FBQ2RvQixRQUFBQSxPQUFPLENBQUNwQixJQUFJLENBQUMsQ0FBQzlILENBQUMsRUFBRUMsQ0FBQyxLQUFLRCxDQUFDLENBQUNGLFdBQVcsR0FBR0csQ0FBQyxDQUFDSCxXQUFXLENBQUMsQ0FBQTtBQUN6RCxPQUFBO0FBQ0osS0FBQTtBQUVBbUQsSUFBQUEsSUFBSSxDQUFDcUUsT0FBTyxDQUFDWSxXQUFXLENBQUMsQ0FBQTtBQUV6QixJQUFBLE9BQU9nQixPQUFPLENBQUE7QUFDbEIsR0FBQTs7QUFFQTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNJZSxFQUFBQSxlQUFlQSxDQUFDdEssTUFBTSxFQUFFcUIsS0FBSyxFQUFFO0lBQzNCLElBQUlrSixjQUFjLEdBQUcsS0FBSyxDQUFBO0FBQzFCLElBQUEsTUFBTUMsSUFBSSxHQUFHeEssTUFBTSxDQUFDeUssT0FBTyxFQUFFLENBQUE7QUFFN0IsSUFBQSxJQUFJLENBQUN6SCxVQUFVLENBQUN3SCxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUN4SCxVQUFVLENBQUN3SCxJQUFJLENBQUMsSUFBSTtBQUFFRSxNQUFBQSxNQUFNLEVBQUUsRUFBRTtBQUFFMUssTUFBQUEsTUFBTSxFQUFFQSxNQUFBQTtLQUFRLENBQUE7QUFFL0UsSUFBQSxJQUFJLElBQUksQ0FBQ2dELFVBQVUsQ0FBQ3dILElBQUksQ0FBQyxDQUFDRSxNQUFNLENBQUNDLE9BQU8sQ0FBQ3RKLEtBQUssQ0FBQyxHQUFHLENBQUMsRUFBRTtNQUNqRCxJQUFJLENBQUMyQixVQUFVLENBQUN3SCxJQUFJLENBQUMsQ0FBQ0UsTUFBTSxDQUFDTCxJQUFJLENBQUNoSixLQUFLLENBQUMsQ0FBQTtBQUN4Q2tKLE1BQUFBLGNBQWMsR0FBRyxJQUFJLENBQUE7QUFDekIsS0FBQTtBQUVBLElBQUEsSUFBSSxDQUFDdEgsZUFBZSxDQUFDdUgsSUFBSSxDQUFDLEdBQUcsSUFBSSxDQUFDdkgsZUFBZSxDQUFDdUgsSUFBSSxDQUFDLElBQUk7QUFBRUUsTUFBQUEsTUFBTSxFQUFFLEVBQUU7QUFBRTFLLE1BQUFBLE1BQU0sRUFBRUEsTUFBQUE7S0FBUSxDQUFBO0lBQ3pGLElBQUksQ0FBQ2lELGVBQWUsQ0FBQ3VILElBQUksQ0FBQyxDQUFDRSxNQUFNLENBQUNMLElBQUksQ0FBQ2hKLEtBQUssQ0FBQyxDQUFBO0FBRTdDLElBQUEsT0FBT2tKLGNBQWMsQ0FBQTtBQUN6QixHQUFBO0VBRUFLLDJCQUEyQkEsQ0FBQ3JLLFlBQVksRUFBRTtBQUN0QyxJQUFBLE1BQU1JLFdBQVcsR0FBR0osWUFBWSxDQUFDc0ssaUJBQWlCLEVBQUUsQ0FBQTtBQUNwRCxJQUFBLE1BQU1oSyxXQUFXLEdBQUdOLFlBQVksQ0FBQ3VLLGlCQUFpQixFQUFFLENBQUE7QUFDcEQsSUFBQSxNQUFNQyxnQkFBZ0IsR0FBR3hLLFlBQVksQ0FBQ3lLLG1CQUFtQixFQUFFLENBQUE7QUFDM0QsSUFBQSxNQUFNQyxnQkFBZ0IsR0FBRzFLLFlBQVksQ0FBQzJLLG1CQUFtQixFQUFFLENBQUE7QUFDM0QsSUFBQSxNQUFNQyxjQUFjLEdBQUc1SyxZQUFZLENBQUM2SyxvQkFBb0IsRUFBRSxDQUFBO0lBRTFELE1BQU1DLE9BQU8sR0FBRyxJQUFJLENBQUN6SSxnQkFBZ0IsQ0FBQzBJLFFBQVEsRUFBRSxDQUFBO0lBQ2hERCxPQUFPLENBQUNySyxVQUFVLENBQUN1SyxHQUFHLENBQUM1SyxXQUFXLENBQUNvRixDQUFDLEVBQUUsRUFBRXBGLFdBQVcsQ0FBQ3FGLENBQUMsRUFBRSxFQUFFckYsV0FBVyxDQUFDc0YsQ0FBQyxFQUFFLENBQUMsQ0FBQTtJQUN6RW9GLE9BQU8sQ0FBQ3BLLGVBQWUsQ0FBQ3NLLEdBQUcsQ0FBQzFLLFdBQVcsQ0FBQ2tGLENBQUMsRUFBRSxFQUFFbEYsV0FBVyxDQUFDbUYsQ0FBQyxFQUFFLEVBQUVuRixXQUFXLENBQUNvRixDQUFDLEVBQUUsQ0FBQyxDQUFBO0lBQzlFb0YsT0FBTyxDQUFDcEwsS0FBSyxDQUFDc0wsR0FBRyxDQUFDUixnQkFBZ0IsQ0FBQ2hGLENBQUMsRUFBRSxFQUFFZ0YsZ0JBQWdCLENBQUMvRSxDQUFDLEVBQUUsRUFBRStFLGdCQUFnQixDQUFDOUUsQ0FBQyxFQUFFLENBQUMsQ0FBQTtJQUNuRm9GLE9BQU8sQ0FBQ25LLFVBQVUsQ0FBQ3FLLEdBQUcsQ0FBQ04sZ0JBQWdCLENBQUNsRixDQUFDLEVBQUUsRUFBRWtGLGdCQUFnQixDQUFDakYsQ0FBQyxFQUFFLEVBQUVpRixnQkFBZ0IsQ0FBQ2hGLENBQUMsRUFBRSxDQUFDLENBQUE7SUFDeEZvRixPQUFPLENBQUNuTCxNQUFNLENBQUNxTCxHQUFHLENBQUNKLGNBQWMsQ0FBQ3BGLENBQUMsRUFBRSxFQUFFb0YsY0FBYyxDQUFDbkYsQ0FBQyxFQUFFLEVBQUVtRixjQUFjLENBQUNsRixDQUFDLEVBQUUsQ0FBQyxDQUFBO0FBQzlFb0YsSUFBQUEsT0FBTyxDQUFDM0ssT0FBTyxHQUFHSCxZQUFZLENBQUNpTCxpQkFBaUIsRUFBRSxDQUFBO0FBQ2xELElBQUEsT0FBT0gsT0FBTyxDQUFBO0FBQ2xCLEdBQUE7RUFFQUksa0NBQWtDQSxDQUFDbEwsWUFBWSxFQUFFO0FBQzdDLElBQUEsTUFBTUksV0FBVyxHQUFHSixZQUFZLENBQUNzSyxpQkFBaUIsRUFBRSxDQUFBO0FBQ3BELElBQUEsTUFBTWhLLFdBQVcsR0FBR04sWUFBWSxDQUFDdUssaUJBQWlCLEVBQUUsQ0FBQTtBQUNwRCxJQUFBLE1BQU1DLGdCQUFnQixHQUFHeEssWUFBWSxDQUFDeUssbUJBQW1CLEVBQUUsQ0FBQTtBQUMzRCxJQUFBLE1BQU1DLGdCQUFnQixHQUFHMUssWUFBWSxDQUFDMkssbUJBQW1CLEVBQUUsQ0FBQTtBQUMzRCxJQUFBLE1BQU1DLGNBQWMsR0FBRzVLLFlBQVksQ0FBQzZLLG9CQUFvQixFQUFFLENBQUE7SUFFMUQsTUFBTUMsT0FBTyxHQUFHLElBQUksQ0FBQ3pJLGdCQUFnQixDQUFDMEksUUFBUSxFQUFFLENBQUE7SUFDaERELE9BQU8sQ0FBQ3BLLGVBQWUsQ0FBQ3NLLEdBQUcsQ0FBQzVLLFdBQVcsQ0FBQ29GLENBQUMsRUFBRSxFQUFFcEYsV0FBVyxDQUFDcUYsQ0FBQyxFQUFFLEVBQUVyRixXQUFXLENBQUNzRixDQUFDLEVBQUUsQ0FBQyxDQUFBO0lBQzlFb0YsT0FBTyxDQUFDckssVUFBVSxDQUFDdUssR0FBRyxDQUFDMUssV0FBVyxDQUFDa0YsQ0FBQyxFQUFFLEVBQUVsRixXQUFXLENBQUNtRixDQUFDLEVBQUUsRUFBRW5GLFdBQVcsQ0FBQ29GLENBQUMsRUFBRSxDQUFDLENBQUE7SUFDekVvRixPQUFPLENBQUNuSyxVQUFVLENBQUNxSyxHQUFHLENBQUNSLGdCQUFnQixDQUFDaEYsQ0FBQyxFQUFFLEVBQUVnRixnQkFBZ0IsQ0FBQy9FLENBQUMsRUFBRSxFQUFFK0UsZ0JBQWdCLENBQUM5RSxDQUFDLEVBQUUsQ0FBQyxDQUFBO0lBQ3hGb0YsT0FBTyxDQUFDcEwsS0FBSyxDQUFDc0wsR0FBRyxDQUFDTixnQkFBZ0IsQ0FBQ2xGLENBQUMsRUFBRSxFQUFFa0YsZ0JBQWdCLENBQUNqRixDQUFDLEVBQUUsRUFBRWlGLGdCQUFnQixDQUFDaEYsQ0FBQyxFQUFFLENBQUMsQ0FBQTtJQUNuRm9GLE9BQU8sQ0FBQ25MLE1BQU0sQ0FBQ3FMLEdBQUcsQ0FBQ0osY0FBYyxDQUFDcEYsQ0FBQyxFQUFFLEVBQUVvRixjQUFjLENBQUNuRixDQUFDLEVBQUUsRUFBRW1GLGNBQWMsQ0FBQ2xGLENBQUMsRUFBRSxDQUFDLENBQUE7QUFDOUVvRixJQUFBQSxPQUFPLENBQUMzSyxPQUFPLEdBQUdILFlBQVksQ0FBQ2lMLGlCQUFpQixFQUFFLENBQUE7QUFDbEQsSUFBQSxPQUFPSCxPQUFPLENBQUE7QUFDbEIsR0FBQTtBQUVBSyxFQUFBQSwwQkFBMEJBLENBQUNyTCxDQUFDLEVBQUVDLENBQUMsRUFBRUMsWUFBWSxFQUFFO0lBQzNDLE1BQU04SCxNQUFNLEdBQUcsSUFBSSxDQUFDdkYsdUJBQXVCLENBQUN3SSxRQUFRLEVBQUUsQ0FBQTtJQUV0RGpELE1BQU0sQ0FBQ2hJLENBQUMsR0FBR0EsQ0FBQyxDQUFBO0lBQ1pnSSxNQUFNLENBQUMvSCxDQUFDLEdBQUdBLENBQUMsQ0FBQTtBQUNaK0gsSUFBQUEsTUFBTSxDQUFDMUgsV0FBVyxHQUFHSixZQUFZLENBQUNTLFVBQVUsQ0FBQTtBQUM1Q3FILElBQUFBLE1BQU0sQ0FBQ3hILFdBQVcsR0FBR04sWUFBWSxDQUFDVSxlQUFlLENBQUE7QUFDakRvSCxJQUFBQSxNQUFNLENBQUN2SCxNQUFNLEdBQUdQLFlBQVksQ0FBQ04sS0FBSyxDQUFBO0FBQ2xDb0ksSUFBQUEsTUFBTSxDQUFDdEgsTUFBTSxHQUFHUixZQUFZLENBQUNXLFVBQVUsQ0FBQTtBQUN2Q21ILElBQUFBLE1BQU0sQ0FBQ25JLE1BQU0sR0FBR0ssWUFBWSxDQUFDTCxNQUFNLENBQUE7QUFDbkNtSSxJQUFBQSxNQUFNLENBQUMzSCxPQUFPLEdBQUdILFlBQVksQ0FBQ0csT0FBTyxDQUFBO0FBRXJDLElBQUEsT0FBTzJILE1BQU0sQ0FBQTtBQUNqQixHQUFBO0FBRUFzRCxFQUFBQSxvQkFBb0JBLENBQUN0SyxLQUFLLEVBQUVDLFFBQVEsRUFBRTtJQUNsQyxNQUFNK0csTUFBTSxHQUFHLElBQUksQ0FBQ3hGLGlCQUFpQixDQUFDeUksUUFBUSxFQUFFLENBQUE7SUFDaERqRCxNQUFNLENBQUNoSCxLQUFLLEdBQUdBLEtBQUssQ0FBQTtJQUNwQmdILE1BQU0sQ0FBQy9HLFFBQVEsR0FBR0EsUUFBUSxDQUFBO0FBQzFCLElBQUEsT0FBTytHLE1BQU0sQ0FBQTtBQUNqQixHQUFBOztBQUVBO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNJdUQsRUFBQUEsbUJBQW1CQSxHQUFHO0FBQ2xCLElBQUEsS0FBSyxNQUFNcEIsSUFBSSxJQUFJLElBQUksQ0FBQ3hILFVBQVUsRUFBRTtNQUNoQyxJQUFJLElBQUksQ0FBQ0EsVUFBVSxDQUFDbUMsY0FBYyxDQUFDcUYsSUFBSSxDQUFDLEVBQUU7QUFDdEMsUUFBQSxNQUFNcUIsY0FBYyxHQUFHLElBQUksQ0FBQzVJLGVBQWUsQ0FBQ3VILElBQUksQ0FBQyxDQUFBO0FBQ2pELFFBQUEsTUFBTXNCLFNBQVMsR0FBRyxJQUFJLENBQUM5SSxVQUFVLENBQUN3SCxJQUFJLENBQUMsQ0FBQTtBQUN2QyxRQUFBLE1BQU14SyxNQUFNLEdBQUc4TCxTQUFTLENBQUM5TCxNQUFNLENBQUE7QUFDL0IsUUFBQSxNQUFNK0wsZUFBZSxHQUFHL0wsTUFBTSxDQUFDOEwsU0FBUyxDQUFBO0FBQ3hDLFFBQUEsTUFBTUUsZUFBZSxHQUFHaE0sTUFBTSxDQUFDeUYsU0FBUyxDQUFBO0FBQ3hDLFFBQUEsTUFBTWlGLE1BQU0sR0FBR29CLFNBQVMsQ0FBQ3BCLE1BQU0sQ0FBQTtBQUMvQixRQUFBLE1BQU1qSyxNQUFNLEdBQUdpSyxNQUFNLENBQUNqSyxNQUFNLENBQUE7UUFDNUIsSUFBSXdKLENBQUMsR0FBR3hKLE1BQU0sQ0FBQTtRQUNkLE9BQU93SixDQUFDLEVBQUUsRUFBRTtBQUNSLFVBQUEsTUFBTTVJLEtBQUssR0FBR3FKLE1BQU0sQ0FBQ1QsQ0FBQyxDQUFDLENBQUE7QUFDdkI7QUFDQSxVQUFBLElBQUksQ0FBQzRCLGNBQWMsSUFBSUEsY0FBYyxDQUFDbkIsTUFBTSxDQUFDQyxPQUFPLENBQUN0SixLQUFLLENBQUMsR0FBRyxDQUFDLEVBQUU7QUFDN0Q7QUFDQXFKLFlBQUFBLE1BQU0sQ0FBQ3VCLE1BQU0sQ0FBQ2hDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQTtZQUVuQixJQUFJakssTUFBTSxDQUFDa00sT0FBTyxFQUFFO0FBQ2hCO0FBQ0EsY0FBQSxJQUFJSCxlQUFlLEVBQUU7QUFDakJBLGdCQUFBQSxlQUFlLENBQUNJLElBQUksQ0FBQyxjQUFjLEVBQUU5SyxLQUFLLENBQUMsQ0FBQTtBQUMvQyxlQUFBO2NBQ0EsSUFBSUEsS0FBSyxDQUFDb0UsU0FBUyxFQUFFO2dCQUNqQnBFLEtBQUssQ0FBQ29FLFNBQVMsQ0FBQzBHLElBQUksQ0FBQyxjQUFjLEVBQUVuTSxNQUFNLENBQUMsQ0FBQTtBQUNoRCxlQUFBO0FBQ0osYUFBQyxNQUFNLElBQUksQ0FBQ3FCLEtBQUssQ0FBQzZLLE9BQU8sRUFBRTtBQUN2QjtBQUNBLGNBQUEsSUFBSUYsZUFBZSxFQUFFO0FBQ2pCQSxnQkFBQUEsZUFBZSxDQUFDRyxJQUFJLENBQUMsY0FBYyxFQUFFOUssS0FBSyxDQUFDLENBQUE7QUFDL0MsZUFBQTtBQUNBLGNBQUEsSUFBSTBLLGVBQWUsRUFBRTtBQUNqQkEsZ0JBQUFBLGVBQWUsQ0FBQ0ksSUFBSSxDQUFDLGNBQWMsRUFBRTlLLEtBQUssQ0FBQyxDQUFBO0FBQy9DLGVBQUE7QUFDSixhQUFBO0FBQ0osV0FBQTtBQUNKLFNBQUE7QUFFQSxRQUFBLElBQUlxSixNQUFNLENBQUNqSyxNQUFNLEtBQUssQ0FBQyxFQUFFO0FBQ3JCLFVBQUEsT0FBTyxJQUFJLENBQUN1QyxVQUFVLENBQUN3SCxJQUFJLENBQUMsQ0FBQTtBQUNoQyxTQUFBO0FBQ0osT0FBQTtBQUNKLEtBQUE7QUFDSixHQUFBOztBQUVBO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0VBQ0k0QixnQkFBZ0JBLENBQUNwTSxNQUFNLEVBQUU7QUFDckIsSUFBQSxNQUFNcU0sQ0FBQyxHQUFHck0sTUFBTSxDQUFDOEwsU0FBUyxDQUFBO0lBQzFCLElBQUlPLENBQUMsS0FBS0EsQ0FBQyxDQUFDQyxRQUFRLENBQUMsZ0JBQWdCLENBQUMsSUFBSUQsQ0FBQyxDQUFDQyxRQUFRLENBQUMsY0FBYyxDQUFDLElBQUlELENBQUMsQ0FBQ0MsUUFBUSxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUU7QUFDNUYsTUFBQSxPQUFPLElBQUksQ0FBQTtBQUNmLEtBQUE7QUFFQSxJQUFBLE1BQU1DLENBQUMsR0FBR3ZNLE1BQU0sQ0FBQ3lGLFNBQVMsQ0FBQTtJQUMxQixPQUFPOEcsQ0FBQyxLQUFLQSxDQUFDLENBQUNELFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJQyxDQUFDLENBQUNELFFBQVEsQ0FBQyxjQUFjLENBQUMsSUFBSUMsQ0FBQyxDQUFDRCxRQUFRLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQTtBQUNyRyxHQUFBOztBQUVBO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0lsSSxFQUFBQSxtQkFBbUJBLENBQUNvSSxLQUFLLEVBQUVDLFFBQVEsRUFBRTtJQUNqQyxNQUFNMUksYUFBYSxHQUFHVCxJQUFJLENBQUNvSixXQUFXLENBQUNGLEtBQUssRUFBRWxKLElBQUksQ0FBQ3FKLGVBQWUsQ0FBQyxDQUFBOztBQUVuRTtBQUNBLElBQUEsTUFBTWxKLFVBQVUsR0FBR00sYUFBYSxDQUFDNkksYUFBYSxFQUFFLENBQUE7QUFDaEQsSUFBQSxNQUFNQyxZQUFZLEdBQUdwSixVQUFVLENBQUNxSixlQUFlLEVBQUUsQ0FBQTtBQUVqRCxJQUFBLElBQUksQ0FBQzdKLGVBQWUsR0FBRyxFQUFFLENBQUE7O0FBRXpCO0lBQ0EsS0FBSyxJQUFJZ0gsQ0FBQyxHQUFHLENBQUMsRUFBRUEsQ0FBQyxHQUFHNEMsWUFBWSxFQUFFNUMsQ0FBQyxFQUFFLEVBQUU7QUFDbkMsTUFBQSxNQUFNOEMsUUFBUSxHQUFHdEosVUFBVSxDQUFDdUosMEJBQTBCLENBQUMvQyxDQUFDLENBQUMsQ0FBQTtBQUV6RCxNQUFBLE1BQU1nRCxLQUFLLEdBQUdGLFFBQVEsQ0FBQ0csUUFBUSxFQUFFLENBQUE7QUFDakMsTUFBQSxNQUFNQyxLQUFLLEdBQUdKLFFBQVEsQ0FBQ0ssUUFBUSxFQUFFLENBQUE7TUFFakMsTUFBTUMsR0FBRyxHQUFHL0osSUFBSSxDQUFDMkYsVUFBVSxDQUFDZ0UsS0FBSyxFQUFFM0osSUFBSSxDQUFDb0UsV0FBVyxDQUFDLENBQUE7TUFDcEQsTUFBTTRGLEdBQUcsR0FBR2hLLElBQUksQ0FBQzJGLFVBQVUsQ0FBQ2tFLEtBQUssRUFBRTdKLElBQUksQ0FBQ29FLFdBQVcsQ0FBQyxDQUFBO0FBRXBELE1BQUEsTUFBTTZGLEVBQUUsR0FBR0YsR0FBRyxDQUFDck4sTUFBTSxDQUFBO0FBQ3JCLE1BQUEsTUFBTXdOLEVBQUUsR0FBR0YsR0FBRyxDQUFDdE4sTUFBTSxDQUFBOztBQUVyQjtBQUNBLE1BQUEsSUFBSSxDQUFDdU4sRUFBRSxJQUFJLENBQUNDLEVBQUUsRUFBRTtBQUNaLFFBQUEsU0FBQTtBQUNKLE9BQUE7QUFFQSxNQUFBLE1BQU1DLE1BQU0sR0FBR0osR0FBRyxDQUFDSyxpQkFBaUIsRUFBRSxDQUFBO0FBQ3RDLE1BQUEsTUFBTUMsTUFBTSxHQUFHTCxHQUFHLENBQUNJLGlCQUFpQixFQUFFLENBQUE7QUFFdEMsTUFBQSxNQUFNRSxXQUFXLEdBQUdiLFFBQVEsQ0FBQ2MsY0FBYyxFQUFFLENBQUE7TUFDN0MsTUFBTUMsZUFBZSxHQUFHLEVBQUUsQ0FBQTtNQUMxQixNQUFNQyxlQUFlLEdBQUcsRUFBRSxDQUFBO0FBQzFCLE1BQUEsSUFBSUMsWUFBWSxDQUFBO01BRWhCLElBQUlKLFdBQVcsR0FBRyxDQUFDLEVBQUU7QUFDakI7QUFDQSxRQUFBLElBQUtILE1BQU0sR0FBR1EsMEJBQTBCLElBQ25DTixNQUFNLEdBQUdNLDBCQUEyQixFQUFFO1VBRXZDLE1BQU1DLFFBQVEsR0FBR1gsRUFBRSxDQUFDekIsU0FBUyxLQUFLeUIsRUFBRSxDQUFDekIsU0FBUyxDQUFDUSxRQUFRLENBQUMsY0FBYyxDQUFDLElBQUlpQixFQUFFLENBQUN6QixTQUFTLENBQUNRLFFBQVEsQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFBO1VBQ2pILE1BQU02QixRQUFRLEdBQUdYLEVBQUUsQ0FBQzFCLFNBQVMsS0FBSzBCLEVBQUUsQ0FBQzFCLFNBQVMsQ0FBQ1EsUUFBUSxDQUFDLGNBQWMsQ0FBQyxJQUFJa0IsRUFBRSxDQUFDMUIsU0FBUyxDQUFDUSxRQUFRLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQTtVQUNqSCxNQUFNOEIsWUFBWSxHQUFHYixFQUFFLENBQUM5SCxTQUFTLEtBQUs4SCxFQUFFLENBQUM5SCxTQUFTLENBQUM2RyxRQUFRLENBQUMsY0FBYyxDQUFDLElBQUlpQixFQUFFLENBQUM5SCxTQUFTLENBQUM2RyxRQUFRLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQTtVQUNySCxNQUFNK0IsWUFBWSxHQUFHYixFQUFFLENBQUMvSCxTQUFTLEtBQUsrSCxFQUFFLENBQUMvSCxTQUFTLENBQUM2RyxRQUFRLENBQUMsY0FBYyxDQUFDLElBQUlrQixFQUFFLENBQUMvSCxTQUFTLENBQUM2RyxRQUFRLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQTs7QUFFckg7QUFDQSxVQUFBLElBQUk0QixRQUFRLEVBQUU7WUFDVkYsWUFBWSxHQUFHLElBQUksQ0FBQzFELGVBQWUsQ0FBQ2lELEVBQUUsRUFBRUMsRUFBRSxDQUFDLENBQUE7QUFDM0MsWUFBQSxJQUFJUSxZQUFZLElBQUksRUFBRUwsTUFBTSxHQUFHTSwwQkFBMEIsQ0FBQyxFQUFFO2NBQ3hEVixFQUFFLENBQUN6QixTQUFTLENBQUNLLElBQUksQ0FBQyxjQUFjLEVBQUVxQixFQUFFLENBQUMsQ0FBQTtBQUN6QyxhQUFBO0FBQ0osV0FBQTtBQUVBLFVBQUEsSUFBSVcsUUFBUSxFQUFFO1lBQ1ZILFlBQVksR0FBRyxJQUFJLENBQUMxRCxlQUFlLENBQUNrRCxFQUFFLEVBQUVELEVBQUUsQ0FBQyxDQUFBO0FBQzNDLFlBQUEsSUFBSVMsWUFBWSxJQUFJLEVBQUVQLE1BQU0sR0FBR1EsMEJBQTBCLENBQUMsRUFBRTtjQUN4RFQsRUFBRSxDQUFDMUIsU0FBUyxDQUFDSyxJQUFJLENBQUMsY0FBYyxFQUFFb0IsRUFBRSxDQUFDLENBQUE7QUFDekMsYUFBQTtBQUNKLFdBQUE7O0FBRUE7QUFDQSxVQUFBLElBQUlhLFlBQVksRUFBRTtZQUNkLElBQUksQ0FBQ0osWUFBWSxFQUFFO2NBQ2ZBLFlBQVksR0FBRyxJQUFJLENBQUMxRCxlQUFlLENBQUNrRCxFQUFFLEVBQUVELEVBQUUsQ0FBQyxDQUFBO0FBQy9DLGFBQUE7QUFFQSxZQUFBLElBQUlTLFlBQVksRUFBRTtjQUNkVCxFQUFFLENBQUM5SCxTQUFTLENBQUMwRyxJQUFJLENBQUMsY0FBYyxFQUFFcUIsRUFBRSxDQUFDLENBQUE7QUFDekMsYUFBQTtBQUNKLFdBQUE7QUFFQSxVQUFBLElBQUlhLFlBQVksRUFBRTtZQUNkLElBQUksQ0FBQ0wsWUFBWSxFQUFFO2NBQ2ZBLFlBQVksR0FBRyxJQUFJLENBQUMxRCxlQUFlLENBQUNpRCxFQUFFLEVBQUVDLEVBQUUsQ0FBQyxDQUFBO0FBQy9DLGFBQUE7QUFFQSxZQUFBLElBQUlRLFlBQVksRUFBRTtjQUNkUixFQUFFLENBQUMvSCxTQUFTLENBQUMwRyxJQUFJLENBQUMsY0FBYyxFQUFFb0IsRUFBRSxDQUFDLENBQUE7QUFDekMsYUFBQTtBQUNKLFdBQUE7QUFDSixTQUFDLE1BQU07QUFDSCxVQUFBLE1BQU1XLFFBQVEsR0FBRyxJQUFJLENBQUM5QixnQkFBZ0IsQ0FBQ21CLEVBQUUsQ0FBQyxDQUFBO0FBQzFDLFVBQUEsTUFBTVksUUFBUSxHQUFHLElBQUksQ0FBQy9CLGdCQUFnQixDQUFDb0IsRUFBRSxDQUFDLENBQUE7QUFDMUMsVUFBQSxNQUFNYyxZQUFZLEdBQUcsSUFBSSxDQUFDaEMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxDQUFBO0FBRTdDLFVBQUEsSUFBSWdDLFlBQVksSUFBSUosUUFBUSxJQUFJQyxRQUFRLEVBQUU7WUFDdEMsS0FBSyxJQUFJSSxDQUFDLEdBQUcsQ0FBQyxFQUFFQSxDQUFDLEdBQUdYLFdBQVcsRUFBRVcsQ0FBQyxFQUFFLEVBQUU7QUFDbEMsY0FBQSxNQUFNQyxjQUFjLEdBQUd6QixRQUFRLENBQUMwQixlQUFlLENBQUNGLENBQUMsQ0FBQyxDQUFBO0FBQ2xELGNBQUEsTUFBTWhPLFlBQVksR0FBRyxJQUFJLENBQUNxSywyQkFBMkIsQ0FBQzRELGNBQWMsQ0FBQyxDQUFBO2NBRXJFLElBQUlOLFFBQVEsSUFBSUMsUUFBUSxFQUFFO0FBQ3RCTCxnQkFBQUEsZUFBZSxDQUFDekQsSUFBSSxDQUFDOUosWUFBWSxDQUFDLENBQUE7QUFDbEMsZ0JBQUEsTUFBTW1PLG1CQUFtQixHQUFHLElBQUksQ0FBQ2pELGtDQUFrQyxDQUFDK0MsY0FBYyxDQUFDLENBQUE7QUFDbkZULGdCQUFBQSxlQUFlLENBQUMxRCxJQUFJLENBQUNxRSxtQkFBbUIsQ0FBQyxDQUFBO0FBQzdDLGVBQUE7QUFFQSxjQUFBLElBQUlKLFlBQVksRUFBRTtBQUNkO2dCQUNBLE1BQU1qRyxNQUFNLEdBQUcsSUFBSSxDQUFDcUQsMEJBQTBCLENBQUM2QixFQUFFLEVBQUVDLEVBQUUsRUFBRWpOLFlBQVksQ0FBQyxDQUFBO0FBQ3BFLGdCQUFBLElBQUksQ0FBQzRMLElBQUksQ0FBQyxTQUFTLEVBQUU5RCxNQUFNLENBQUMsQ0FBQTtBQUNoQyxlQUFBO0FBQ0osYUFBQTtBQUVBLFlBQUEsSUFBSTZGLFFBQVEsRUFBRTtjQUNWLE1BQU1TLGFBQWEsR0FBRyxJQUFJLENBQUNoRCxvQkFBb0IsQ0FBQzZCLEVBQUUsRUFBRU0sZUFBZSxDQUFDLENBQUE7Y0FDcEVFLFlBQVksR0FBRyxJQUFJLENBQUMxRCxlQUFlLENBQUNpRCxFQUFFLEVBQUVDLEVBQUUsQ0FBQyxDQUFBO2NBRTNDLElBQUlELEVBQUUsQ0FBQ3pCLFNBQVMsRUFBRTtnQkFDZHlCLEVBQUUsQ0FBQ3pCLFNBQVMsQ0FBQ0ssSUFBSSxDQUFDLFNBQVMsRUFBRXdDLGFBQWEsQ0FBQyxDQUFBO0FBQzNDLGdCQUFBLElBQUlYLFlBQVksRUFBRTtrQkFDZFQsRUFBRSxDQUFDekIsU0FBUyxDQUFDSyxJQUFJLENBQUMsZ0JBQWdCLEVBQUV3QyxhQUFhLENBQUMsQ0FBQTtBQUN0RCxpQkFBQTtBQUNKLGVBQUE7Y0FFQSxJQUFJcEIsRUFBRSxDQUFDOUgsU0FBUyxFQUFFO2dCQUNkOEgsRUFBRSxDQUFDOUgsU0FBUyxDQUFDMEcsSUFBSSxDQUFDLFNBQVMsRUFBRXdDLGFBQWEsQ0FBQyxDQUFBO0FBQzNDLGdCQUFBLElBQUlYLFlBQVksRUFBRTtrQkFDZFQsRUFBRSxDQUFDOUgsU0FBUyxDQUFDMEcsSUFBSSxDQUFDLGdCQUFnQixFQUFFd0MsYUFBYSxDQUFDLENBQUE7QUFDdEQsaUJBQUE7QUFDSixlQUFBO0FBQ0osYUFBQTtBQUVBLFlBQUEsSUFBSVIsUUFBUSxFQUFFO2NBQ1YsTUFBTVMsYUFBYSxHQUFHLElBQUksQ0FBQ2pELG9CQUFvQixDQUFDNEIsRUFBRSxFQUFFUSxlQUFlLENBQUMsQ0FBQTtjQUNwRUMsWUFBWSxHQUFHLElBQUksQ0FBQzFELGVBQWUsQ0FBQ2tELEVBQUUsRUFBRUQsRUFBRSxDQUFDLENBQUE7Y0FFM0MsSUFBSUMsRUFBRSxDQUFDMUIsU0FBUyxFQUFFO2dCQUNkMEIsRUFBRSxDQUFDMUIsU0FBUyxDQUFDSyxJQUFJLENBQUMsU0FBUyxFQUFFeUMsYUFBYSxDQUFDLENBQUE7QUFDM0MsZ0JBQUEsSUFBSVosWUFBWSxFQUFFO2tCQUNkUixFQUFFLENBQUMxQixTQUFTLENBQUNLLElBQUksQ0FBQyxnQkFBZ0IsRUFBRXlDLGFBQWEsQ0FBQyxDQUFBO0FBQ3RELGlCQUFBO0FBQ0osZUFBQTtjQUVBLElBQUlwQixFQUFFLENBQUMvSCxTQUFTLEVBQUU7Z0JBQ2QrSCxFQUFFLENBQUMvSCxTQUFTLENBQUMwRyxJQUFJLENBQUMsU0FBUyxFQUFFeUMsYUFBYSxDQUFDLENBQUE7QUFDM0MsZ0JBQUEsSUFBSVosWUFBWSxFQUFFO2tCQUNkUixFQUFFLENBQUMvSCxTQUFTLENBQUMwRyxJQUFJLENBQUMsZ0JBQWdCLEVBQUV5QyxhQUFhLENBQUMsQ0FBQTtBQUN0RCxpQkFBQTtBQUNKLGVBQUE7QUFDSixhQUFBO0FBQ0osV0FBQTtBQUNKLFNBQUE7QUFDSixPQUFBO0FBQ0osS0FBQTs7QUFFQTtJQUNBLElBQUksQ0FBQ2hELG1CQUFtQixFQUFFLENBQUE7O0FBRTFCO0FBQ0EsSUFBQSxJQUFJLENBQUNoSixnQkFBZ0IsQ0FBQ2lNLE9BQU8sRUFBRSxDQUFBO0FBQy9CLElBQUEsSUFBSSxDQUFDaE0saUJBQWlCLENBQUNnTSxPQUFPLEVBQUUsQ0FBQTtBQUNoQyxJQUFBLElBQUksQ0FBQy9MLHVCQUF1QixDQUFDK0wsT0FBTyxFQUFFLENBQUE7QUFDMUMsR0FBQTtFQUVBbEssUUFBUUEsQ0FBQ21LLEVBQUUsRUFBRTtJQUNULElBQUk3RSxDQUFDLEVBQUU4RSxHQUFHLENBQUE7QUFHVixJQUFBLElBQUksQ0FBQzFNLE1BQU0sQ0FBQzJNLFlBQVksR0FBR0MsR0FBRyxFQUFFLENBQUE7O0FBR2hDO0FBQ0E7SUFDQSxJQUFJLENBQUNuTixlQUFlLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDRCxPQUFPLENBQUNrRSxDQUFDLENBQUE7SUFDeEMsSUFBSSxDQUFDakUsZUFBZSxDQUFDLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQ0QsT0FBTyxDQUFDbUUsQ0FBQyxDQUFBO0lBQ3hDLElBQUksQ0FBQ2xFLGVBQWUsQ0FBQyxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUNELE9BQU8sQ0FBQ29FLENBQUMsQ0FBQTs7QUFFeEM7SUFDQSxNQUFNcEUsT0FBTyxHQUFHLElBQUksQ0FBQ2tDLGFBQWEsQ0FBQ21MLFVBQVUsRUFBRSxDQUFBO0FBQy9DLElBQUEsSUFBSXJOLE9BQU8sQ0FBQ2tFLENBQUMsRUFBRSxLQUFLLElBQUksQ0FBQ2pFLGVBQWUsQ0FBQyxDQUFDLENBQUMsSUFDdkNELE9BQU8sQ0FBQ21FLENBQUMsRUFBRSxLQUFLLElBQUksQ0FBQ2xFLGVBQWUsQ0FBQyxDQUFDLENBQUMsSUFDdkNELE9BQU8sQ0FBQ29FLENBQUMsRUFBRSxLQUFLLElBQUksQ0FBQ25FLGVBQWUsQ0FBQyxDQUFDLENBQUMsRUFBRTtNQUN6Q0QsT0FBTyxDQUFDeUcsUUFBUSxDQUFDLElBQUksQ0FBQ3pHLE9BQU8sQ0FBQ2tFLENBQUMsRUFBRSxJQUFJLENBQUNsRSxPQUFPLENBQUNtRSxDQUFDLEVBQUUsSUFBSSxDQUFDbkUsT0FBTyxDQUFDb0UsQ0FBQyxDQUFDLENBQUE7QUFDaEUsTUFBQSxJQUFJLENBQUNsQyxhQUFhLENBQUNvTCxVQUFVLENBQUN0TixPQUFPLENBQUMsQ0FBQTtBQUMxQyxLQUFBO0FBRUEsSUFBQSxNQUFNdU4sUUFBUSxHQUFHLElBQUksQ0FBQ2xOLFNBQVMsQ0FBQTtBQUMvQixJQUFBLEtBQUsrSCxDQUFDLEdBQUcsQ0FBQyxFQUFFOEUsR0FBRyxHQUFHSyxRQUFRLENBQUMzTyxNQUFNLEVBQUV3SixDQUFDLEdBQUc4RSxHQUFHLEVBQUU5RSxDQUFDLEVBQUUsRUFBRTtBQUM3Q21GLE1BQUFBLFFBQVEsQ0FBQ25GLENBQUMsQ0FBQyxDQUFDb0YsZUFBZSxFQUFFLENBQUE7QUFDakMsS0FBQTtBQUVBLElBQUEsTUFBTUMsU0FBUyxHQUFHLElBQUksQ0FBQ25OLFVBQVUsQ0FBQTtBQUNqQyxJQUFBLEtBQUs4SCxDQUFDLEdBQUcsQ0FBQyxFQUFFOEUsR0FBRyxHQUFHTyxTQUFTLENBQUM3TyxNQUFNLEVBQUV3SixDQUFDLEdBQUc4RSxHQUFHLEVBQUU5RSxDQUFDLEVBQUUsRUFBRTtBQUM5Q3FGLE1BQUFBLFNBQVMsQ0FBQ3JGLENBQUMsQ0FBQyxDQUFDc0YsZUFBZSxFQUFFLENBQUE7QUFDbEMsS0FBQTs7QUFFQTtBQUNBLElBQUEsTUFBTUMsU0FBUyxHQUFHLElBQUksQ0FBQ3ZOLFVBQVUsQ0FBQTtBQUNqQyxJQUFBLEtBQUtnSSxDQUFDLEdBQUcsQ0FBQyxFQUFFOEUsR0FBRyxHQUFHUyxTQUFTLENBQUMvTyxNQUFNLEVBQUV3SixDQUFDLEdBQUc4RSxHQUFHLEVBQUU5RSxDQUFDLEVBQUUsRUFBRTtBQUM5Q3VGLE1BQUFBLFNBQVMsQ0FBQ3ZGLENBQUMsQ0FBQyxDQUFDd0YsZ0JBQWdCLEVBQUUsQ0FBQTtBQUNuQyxLQUFBOztBQUVBO0FBQ0EsSUFBQSxJQUFJLENBQUMxTCxhQUFhLENBQUMyTCxjQUFjLENBQUNaLEVBQUUsRUFBRSxJQUFJLENBQUNuTixXQUFXLEVBQUUsSUFBSSxDQUFDQyxhQUFhLENBQUMsQ0FBQTs7QUFFM0U7QUFDQSxJQUFBLE1BQU0rTixPQUFPLEdBQUcsSUFBSSxDQUFDM04sUUFBUSxDQUFBO0FBQzdCLElBQUEsS0FBS2lJLENBQUMsR0FBRyxDQUFDLEVBQUU4RSxHQUFHLEdBQUdZLE9BQU8sQ0FBQ2xQLE1BQU0sRUFBRXdKLENBQUMsR0FBRzhFLEdBQUcsRUFBRTlFLENBQUMsRUFBRSxFQUFFO0FBQzVDMEYsTUFBQUEsT0FBTyxDQUFDMUYsQ0FBQyxDQUFDLENBQUMyRixjQUFjLEVBQUUsQ0FBQTtBQUMvQixLQUFBO0lBRUEsSUFBSSxDQUFDLElBQUksQ0FBQzdMLGFBQWEsQ0FBQ0UsdUJBQXVCLEVBQzNDLElBQUksQ0FBQ0csbUJBQW1CLENBQUNkLElBQUksQ0FBQ3VNLFVBQVUsQ0FBQyxJQUFJLENBQUM5TCxhQUFhLENBQUMsRUFBRStLLEVBQUUsQ0FBQyxDQUFBO0FBR3JFLElBQUEsSUFBSSxDQUFDek0sTUFBTSxDQUFDeU4sV0FBVyxHQUFHYixHQUFHLEVBQUUsR0FBRyxJQUFJLENBQUM1TSxNQUFNLENBQUMyTSxZQUFZLENBQUE7QUFFOUQsR0FBQTtBQUVBckgsRUFBQUEsT0FBT0EsR0FBRztJQUNOLEtBQUssQ0FBQ0EsT0FBTyxFQUFFLENBQUE7QUFFZixJQUFBLElBQUksQ0FBQ2pHLEdBQUcsQ0FBQ2dELE9BQU8sQ0FBQ0UsR0FBRyxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUNELFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQTtBQUVuRCxJQUFBLElBQUksT0FBT3JCLElBQUksS0FBSyxXQUFXLEVBQUU7QUFDN0JBLE1BQUFBLElBQUksQ0FBQ3FFLE9BQU8sQ0FBQyxJQUFJLENBQUM1RCxhQUFhLENBQUMsQ0FBQTtBQUNoQ1QsTUFBQUEsSUFBSSxDQUFDcUUsT0FBTyxDQUFDLElBQUksQ0FBQzlELE1BQU0sQ0FBQyxDQUFBO0FBQ3pCUCxNQUFBQSxJQUFJLENBQUNxRSxPQUFPLENBQUMsSUFBSSxDQUFDaEUsb0JBQW9CLENBQUMsQ0FBQTtBQUN2Q0wsTUFBQUEsSUFBSSxDQUFDcUUsT0FBTyxDQUFDLElBQUksQ0FBQ2xFLFVBQVUsQ0FBQyxDQUFBO0FBQzdCSCxNQUFBQSxJQUFJLENBQUNxRSxPQUFPLENBQUMsSUFBSSxDQUFDcEUsc0JBQXNCLENBQUMsQ0FBQTtNQUN6QyxJQUFJLENBQUNRLGFBQWEsR0FBRyxJQUFJLENBQUE7TUFDekIsSUFBSSxDQUFDRixNQUFNLEdBQUcsSUFBSSxDQUFBO01BQ2xCLElBQUksQ0FBQ0Ysb0JBQW9CLEdBQUcsSUFBSSxDQUFBO01BQ2hDLElBQUksQ0FBQ0YsVUFBVSxHQUFHLElBQUksQ0FBQTtNQUN0QixJQUFJLENBQUNGLHNCQUFzQixHQUFHLElBQUksQ0FBQTtBQUN0QyxLQUFBO0FBQ0osR0FBQTtBQUNKLENBQUE7QUFFQXdNLFNBQVMsQ0FBQ0MsZUFBZSxDQUFDdk4sa0JBQWtCLENBQUN3TixTQUFTLEVBQUUxTyxPQUFPLENBQUM7Ozs7In0=
