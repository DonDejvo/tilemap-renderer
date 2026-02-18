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
    collider: Collider | null;

    constructor(params: RigidBodyParams) {
        super();
        this.velocity = new Vector();
        this.angularVelocity = 0;
        this.mass = params.mass;
        this.collider = null;
    }

    public setCollider(collider: Collider) {
        if (collider.body) {
            collider.body.collider = null;
        }
        collider.body = this;
        this.collider = collider;
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

            if (this.collider) {
                this.collider.body = null;
            }

            this.scene.getRigidbodies().splice(i, 1);
        }
    }
}