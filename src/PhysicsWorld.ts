import { Collision, detectCollision } from "./Collision";
import { Scene } from "./Scene";

export class PhysicsWorld {
    private scene: Scene;

    private previousCollisions = new Map<bigint, Collision>();
    private currentCollisions = new Map<bigint, Collision>();

    constructor(scene: Scene) {
        this.scene = scene;
    }

    public step(dt: number) {
        const colliders = this.scene.getColliders();

        for (const c of colliders) c._processed = false;

        this.currentCollisions.clear();

        for (const colliderA of colliders) {
            if (colliderA._processed) continue;

            const candidates = this.scene.getColliders(
                colliderA.getBounds(),
                colliderA.mask
            );

            for (const colliderB of candidates) {
                if (colliderA === colliderB || colliderB._processed) continue;

                const collision = detectCollision(colliderA, colliderB);
                
                if (!collision) continue;

                this.currentCollisions.set(collision.key, collision);

                const existed = this.previousCollisions.has(collision.key);
                this.emitEnterStay(collision, existed);
            }

            colliderA._processed = true;
        }

        this.emitExit();

        this.previousCollisions = new Map(this.currentCollisions);
    }

    private emitEnterStay(collision: Collision, existed: boolean) {
        const body = collision.collider.body;
        const otherBody = collision.otherCollider.body;

        if (!body && !otherBody) return;

        const type = collision.isTrigger
            ? existed ? "triggerstay" : "triggerenter"
            : existed ? "collisionstay" : "collisionenter";

        if (body) body.emitMessage(type, collision);
        if (otherBody) otherBody.emitMessage(type, collision.clone().flip());
    }

    private emitExit() {
        for (const [key, collision] of this.previousCollisions) {
            if (this.currentCollisions.has(key)) continue;

            const body = collision.collider.body;
            const otherBody = collision.otherCollider.body;

            const type = collision.isTrigger
                ? "triggerexit"
                : "collisionexit";

            if (body) body.emitMessage(type, collision);
            if (otherBody) otherBody.emitMessage(type, collision.clone().flip());
        }
    }
}
