import { Bounds } from "./common";
import { Vector } from "./Vector";

export type ColliderType = "circle" | "polygon";

export abstract class Collider {
    position: Vector;

    constructor() {
        this.position = new Vector();
    }

    abstract getBounds(): Bounds;

    abstract getType(): ColliderType; 
}

export class CircleCollider extends Collider {
    radius: number;

    constructor(radius: number) {
        super();
        this.radius = radius;
    }

    getType(): ColliderType {
        return "circle";
    }

    getBounds(): Bounds {
        const vec = new Vector(this.radius, this.radius);
        return {
            min: this.position.clone().sub(vec),
            max: this.position.clone().add(vec)
        }
    }
}

export class PolygonCollider extends Collider {
    points: Vector[];

    constructor(points: Vector[]) {
        super();
        this.points = points;
    }

    getType(): ColliderType {
        return "polygon";
    }
    
    getBounds(): Bounds {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of this.points) {
            const x = p.x + this.position.x;
            const y = p.y + this.position.y;
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
        }
        return {
            min: new Vector(minX, minY),
            max: new Vector(maxX, maxY)
        }
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
