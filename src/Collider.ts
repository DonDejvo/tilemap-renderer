import { Bounds } from "./common";
import { RigidBody } from "./RigidBody";
import { Vector } from "./Vector";

export const DEFAULT_LAYER = 1;

export type ColliderType = "circle" | "polygon" | "box";

interface ColliderParams {
    castShadow?: boolean;
    layer: number;
    mask: number;
    isTrigger?: boolean;
}

export abstract class Collider {
    position: Vector;
    angle: number;
    layer: number;
    mask: number;
    castShadow: boolean;
    body: RigidBody | null;
    isTrigger: boolean;
    _processed: boolean;

    constructor(params: ColliderParams) {
        this.position = new Vector();
        this.angle = 0;
        this.castShadow = params.castShadow !== undefined ? params.castShadow : true;
        this.layer = params.layer || DEFAULT_LAYER;
        this.mask = params.mask;
        this.body = null;
        this.isTrigger = params.isTrigger !== undefined ? params.isTrigger : false;
        this._processed = false;
    }

    getWorldPosition() {
        if (!this.body) return this.position.clone();
        return this.body.position.clone();
    }

    getWorldAngle() {
        return this.body ? this.body.angle : this.angle;
    }

    abstract getBounds(): Bounds;

    abstract getType(): ColliderType;
}

interface CircleColliderParams extends ColliderParams {
    radius: number;
}

export class CircleCollider extends Collider {
    radius: number;

    constructor(params: CircleColliderParams) {
        super(params);
        this.radius = params.radius;
    }

    getType(): ColliderType {
        return "circle";
    }

    getBounds(): Bounds {
        const center = this.getWorldPosition();
        const r = this.radius;

        return {
            min: center.clone().sub(new Vector(r, r)),
            max: center.clone().add(new Vector(r, r))
        };
    }

}

interface PolygonColliderParams extends ColliderParams {
    points: Vector[];
}

export class PolygonCollider extends Collider {
    points: Vector[];

    constructor(params: PolygonColliderParams) {
        super(params);
        this.points = params.points;
    }

    getType(): ColliderType {
        return "polygon";
    }

    getWorldPoints() {
        const worldPos = this.getWorldPosition();
        const worldAngle = this.getWorldAngle();

        return this.points.map(p => p.clone()
            .rot(-worldAngle)
            .add(worldPos));
    }

    getBounds(): Bounds {
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        const worldPoints = this.getWorldPoints();
        for (const transformed of worldPoints) {

            if (transformed.x < minX) minX = transformed.x;
            if (transformed.y < minY) minY = transformed.y;
            if (transformed.x > maxX) maxX = transformed.x;
            if (transformed.y > maxY) maxY = transformed.y;
        }

        return {
            min: new Vector(minX, minY),
            max: new Vector(maxX, maxY)
        };
    }

}

interface BoxColliderParams extends ColliderParams {
    width: number;
    height: number;
    offset?: Vector;
}

export class BoxCollider extends PolygonCollider {
    width: number;
    height: number;

    constructor(params: BoxColliderParams) {
        const points = [
            new Vector(0, 0),
            new Vector(params.width, 0),
            new Vector(params.width, params.height),
            new Vector(0, params.height)
        ].map(p => params.offset ? p.add(params.offset) : p);
        super({ ...params, points });
        this.width = params.width;
        this.height = params.height;
    }

    getType(): ColliderType {
        return "box";
    }
}

export const colliders = {
    CircleCollider,
    PolygonCollider,
    BoxCollider
};
