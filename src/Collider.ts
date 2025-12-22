import { Bounds } from "./bounds";
import { RigidBody } from "./RigidBody";
import { SceneNode } from "./SceneNode";
import { SpatialHashGridClient } from "./SpatialHashGrid";
import { Vector } from "./Vector";

export const DEFAULT_LAYER = 1;

export enum ColliderType {
    POLYGON = "polygon",
    CIRCLE = "circle"
}

interface ColliderParams {
    castShadow?: boolean;
    layer: number;
    mask?: number;
    isTrigger?: boolean;
    usage?: number;
}

export abstract class Collider extends SceneNode {
    layer: number;
    mask: number;
    castShadow: boolean;
    body: RigidBody | null;
    isTrigger: boolean;
    _hashGridClient: SpatialHashGridClient<Collider> | null;
    _processed: boolean;

    constructor(params: ColliderParams) {
        super();
        this.castShadow = params.castShadow !== undefined ? params.castShadow : true;
        this.layer = params.layer || DEFAULT_LAYER;
        this.mask = params.mask !== undefined ? params.mask : 0xFFFFFFFF;
        this.body = null;
        this.isTrigger = params.isTrigger !== undefined ? params.isTrigger : false;
        this._hashGridClient = null;
        this._processed = false;
    }


    public start(): void {
        this.scene.getColliders().push(this);
        this._hashGridClient = this.scene.getColliderHashGrid().createClient(this, this.getBounds());
    }

    public fixedUpdate(): void {
        if (this._hashGridClient) {
            this._hashGridClient.bounds = this.getBounds();
            this._hashGridClient.update();
        }
    }

    public destroy(): void {
        const i = this.scene.getColliders().indexOf(this);
        if (i !== -1) {
            this.scene.getColliders().splice(i, 1);
        }
        if (this.body) {
            this.body.removeCollider(this);
        }
        if (this._hashGridClient) {
            this.scene.getColliderHashGrid().removeClient(this._hashGridClient);
        }
    }

    abstract getBounds(): Bounds;

    abstract getType(): ColliderType;

    protected calculatePositions() { }

    protected calculateNormals() { }
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
        return ColliderType.CIRCLE;
    }

    getBounds(): Bounds {
        const center = this.worldPosition;
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
        return ColliderType.POLYGON;
    }

    getBounds() {
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        for (const transformed of this.getWorldPoints()) {

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

    getWorldPoints() {
        const worldPos = this.worldPosition;
        const worldAngle = this.worldAngle;

        return this.points.map(p => p.clone()
            .rot(-worldAngle)
            .add(worldPos));
    }

    getNormals() {
        const worldPoints = this.getWorldPoints();
        return worldPoints.map((p0, i) => {
            const p1 = worldPoints[(i + 1) % worldPoints.length];

            const edgeDir = p1.clone().sub(p0);
            return new Vector(edgeDir.y, -edgeDir.x).normalize();
        });
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
}

export const colliders = {
    CircleCollider,
    PolygonCollider,
    BoxCollider
};
