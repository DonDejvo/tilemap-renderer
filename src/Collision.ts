import { Collider } from "./Collider";
import { Vector } from "./Vector";

export class Collision {
    colliderA: Collider;
    colliderB: Collider;

    contacts: Vector[];
    normal: Vector;
    depth: number;

    isTrigger: boolean;

    normalImpulse: number = 0;
    tangentImpulse: number = 0;

    restitution: number = 0;
    friction: number = 0;

    constructor(
        a: Collider,
        b: Collider,
        contacts: Vector[],
        normal: Vector,
        depth: number
    ) {
        this.colliderA = a;
        this.colliderB = b;
        this.contacts = contacts;
        this.normal = normal;
        this.depth = depth;

        this.isTrigger = a.isTrigger || b.isTrigger;
    }
}
