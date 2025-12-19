import { Collider } from "./Collider";
import { SceneNode } from "./SceneNode";
import { Vector } from "./Vector";

interface RigidBodyParams {
    mass: number;
}

export class RigidBody extends SceneNode {
    velocity: Vector;
    angularVelocity: number;
    mass: number;
    colliders: Collider[];

    constructor(params: RigidBodyParams) {
        super();
        this.velocity = new Vector();
        this.angularVelocity = 0;
        this.mass = params.mass;
        this.colliders = [];
    }

    public removeCollider(collider: Collider) {
        const i = this.colliders.indexOf(collider);
        if (i !== -1) {
            collider.body = null;
            this.colliders.splice(i, 1);
        }
    }

    public addCollider(collider: Collider) {
        if (collider.body) {
            collider.body.removeCollider(collider);
        }
        collider.body = this;
        this.colliders.push(collider);
    }

    public fixedUpdate(dt: number): void {
        const frameVelocity = this.velocity.clone().scale(dt);
        this.position.add(frameVelocity);

        const frameAngularVelocity = this.angularVelocity * dt
        this.angle += frameAngularVelocity;
    }

    public start(): void {
        this.scene.getRigidbodies().push(this);
    }

    public destroy(): void {
        const i = this.scene.getRigidbodies().indexOf(this);
        if (i !== -1) {

            for (const collider of this.colliders) {
                collider.body = null;
            }

            this.scene.getRigidbodies().splice(i, 1);
        }
    }
}