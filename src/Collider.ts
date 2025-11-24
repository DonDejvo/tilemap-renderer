import { AABB } from "./AABB";
import { Vector } from "./Vector";

export type ColliderType = "circle" | "polygon";

export abstract class Collider {
    position: Vector;
    constructor() {
        this.position = new Vector();
    }
    abstract getBounds(): AABB;
    abstract getType(): ColliderType; 
}

export class CircleCollider extends Collider {
    getType(): ColliderType {
        return "circle";
    }
    radius: number;
    constructor(radius: number) {
        super();
        this.radius = radius;
    }
    getBounds(): AABB {
        return new AABB(
            this.position.x - this.radius,
            this.position.y - this.radius,
            this.radius * 2,
            this.radius * 2
        );
    }
}

export class PolygonCollider extends Collider {
    getType(): ColliderType {
        return "polygon";
    }
    points: Vector[];
    constructor(points: Vector[]) {
        super();
        this.points = points;
    }
    getBounds(): AABB {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of this.points) {
            const x = p.x + this.position.x;
            const y = p.y + this.position.y;
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
        }
        return new AABB(minX, minY, maxX - minX, maxY - minY);
    }
}

export class BoxCollider extends PolygonCollider {
    width: number;
    height: number;

    constructor(width: number, height: number) {
        const hw = width * 0.5;
        const hh = height * 0.5;
        const points = [
            new Vector(-hw, -hh),
            new Vector(hw, -hh),
            new Vector(hw, hh),
            new Vector(-hw, hh)
        ];
        super(points);
        this.width = width;
        this.height = height;
    }
}

export const colliders = {
    CircleCollider,
    PolygonCollider,
    BoxCollider
};
