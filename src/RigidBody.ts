import { Collider } from "./Collider";
import { Vector } from "./Vector";

interface RigidBodyParams {
    mass: number;
}

export class RigidBody {
    position: Vector;
    angle: number;
    velocity: Vector;
    angularVelocity: number;
    mass: number;
    colliders: Collider[];

    constructor(params: RigidBodyParams) {
        this.position = new Vector();
        this.angle = 0;
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
        if(collider.body) {
            collider.body.removeCollider(collider);
        }
        collider.body = this;
        this.colliders.push(collider);
    }

    public update(dt: number) {
        const frameVelocity = this.velocity.clone().scale(dt);
        this.position.add(frameVelocity);

        const frameAngularVelocity = this.angularVelocity * dt;
        this.angle += frameAngularVelocity;
    }
}