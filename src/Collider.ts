import { Bounds } from "./common";
import { Vector } from "./Vector";

export type ColliderType = "circle" | "polygon";

export abstract class Collider {
    position: Vector;
    offset: Vector;
    angle: number;
    isStatic: boolean;
    castsShadows: boolean;

    constructor() {
        this.position = new Vector();
        this.offset = new Vector();
        this.angle = 0;
        this.isStatic = false;
        this.castsShadows = true;
    }

    getCenter() {
        return this.position.clone().add(this.offset);   
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
        const center = this.getCenter();
        const r = this.radius;

        return {
            min: center.clone().sub(new Vector(r, r)),
            max: center.clone().add(new Vector(r, r))
        };
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

    getWorldPoints() {
        return this.points.map(p => p.clone()
            .add(this.offset)
            .rot(-this.angle)
            .add(this.position));
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

export class BoxCollider extends PolygonCollider {
    width: number;
    height: number;

    constructor(width: number, height: number) {
        const points = [
            new Vector(0, 0),
            new Vector(width, 0),
            new Vector(width, height),
            new Vector(0, height)
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
