import { CircleCollider, ColliderType } from "./Collider";
import { circleVsCircle, CollisionInfo, CollisionResult, polygonVsCircle, polygonVsPolygon } from "./Collision";
import { Scene } from "./Scene";
import { Vector } from "./Vector";

export class PhysicsWorld {
    private scene: Scene;

    private prevCollisions = new Map<string, CollisionInfo>();
    private currCollisions = new Map<string, CollisionInfo>();

    constructor(scene: Scene) {
        this.scene = scene;
    }

    public step(dt: number) {
        const sceneColliders = this.scene.getColliders();

        for (let i = 0; i < sceneColliders.length; ++i) {
            sceneColliders[i]._index = i;
        }

        const colliderIndices = sceneColliders.map((c, i) => this.scene.getColliders(c.getBounds(), c.mask).map(c2 => c2._index!).filter(j => j > i));

        for (let i = 0; i < sceneColliders.length; ++i) {
            for (let j = 0; j < colliderIndices[i].length; ++j) {
                const k = colliderIndices[i][j];

                const result: CollisionResult = {
                    collides: false,
                    penetration: Infinity,
                    dir: new Vector(),
                    contacts: new Array(2),
                    contactsCount: 0
                };

                if (sceneColliders[i].getType() === ColliderType.POLYGON && sceneColliders[k].getType() === ColliderType.POLYGON) {
                    polygonVsPolygon(result, sceneColliders[i].getWorldPoints(), sceneColliders[k].getWorldPoints());
                } else if (sceneColliders[i].getType() === ColliderType.POLYGON && sceneColliders[k].getType() === ColliderType.CIRCLE) {
                    polygonVsCircle(result, sceneColliders[i].getWorldPoints(), sceneColliders[k].worldPosition, (sceneColliders[k] as CircleCollider).radius, false);
                } else if (sceneColliders[i].getType() === ColliderType.CIRCLE && sceneColliders[k].getType() === ColliderType.POLYGON) {
                    polygonVsCircle(result, sceneColliders[k].getWorldPoints(), sceneColliders[i].worldPosition, (sceneColliders[i] as CircleCollider).radius, true);
                } else if (sceneColliders[i].getType() === ColliderType.CIRCLE && sceneColliders[k].getType() === ColliderType.CIRCLE) {
                    circleVsCircle(result, sceneColliders[i].worldPosition, (sceneColliders[i] as CircleCollider).radius,
                        sceneColliders[k].worldPosition, (sceneColliders[k] as CircleCollider).radius);
                }

                if (result.collides) {
                    const a = sceneColliders[i];
                    const b = sceneColliders[k];

                    const info = CollisionInfo.fromResult(a, b, result);
                    this.currCollisions.set(info.key, info);
                }
            }
        }

        for (const [key, info] of this.currCollisions) {
            const existed = this.prevCollisions.has(key);

            if (!existed) {
                this.emit(info, "collisionEnter");
            } else {
                this.emit(info, "collisionStay");
            }
        }

        for (const [key, info] of this.prevCollisions) {
            if (!this.currCollisions.has(key)) {
                this.emit(info, "collisionExit");
            }
        }

        [this.prevCollisions, this.currCollisions] = [
            this.currCollisions,
            this.prevCollisions
        ];

        this.currCollisions.clear();


        for (let i = 0; i < sceneColliders.length; ++i) {
            sceneColliders[i]._index = null;
        }
    }

    private emit(info: CollisionInfo, type: string) {
        const a = info.collider;
        const b = info.otherCollider;

        if (a.body) {
            a.body.emitMessage(type, info.clone().flip());
        }

        if (b.body) {
            b.body.emitMessage(type, info);
        }
    }

}
