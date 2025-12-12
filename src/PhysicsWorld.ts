import { Collider } from "./Collider";
import { Collision } from "./Collision";
import { Scene } from "./Scene";

export class PhysicsWorld {
    scene: Scene;
    collisions: Collision[];
    triggerCollisions: Collision[];

    constructor(scene: Scene) {
        this.scene = scene;
        this.collisions = [];
        this.triggerCollisions = [];
    }

    public step(dt: number) {
        const colliders = this.scene.getColliders();
        for (const collider of colliders) {
            collider._processed = false;
        }

        this.collisions.length = 0;
        this.triggerCollisions.length = 0;

        for (const colliderA of colliders) {
            if (colliderA._processed) continue;

            const candidates = this.scene.getColliders(colliderA.getBounds(), colliderA.mask);

            for (const colliderB of candidates) {
                if (colliderA === colliderB || colliderB._processed) continue;

                const collision = this.detectCollision(colliderA, colliderB);
                
                if(!collision) continue;

                if(collision.isTrigger) {
                    this.triggerCollisions.push(collision);
                } else {
                    this.collisions.push(collision);
                }
            }

            colliderA._processed = true;
        }

        this.resolveCollisions(dt);
    }

    private detectCollision(colliderA: Collider, colliderB: Collider): Collision | null {
        // TODO

        return null;
    }

    private resolveCollisions(dt: number) {
        // TODO
    }
}