import { CircleCollider, Collider, ColliderType, PolygonCollider } from "./Collider";
import { Vector } from "./Vector";

export class Collision {
    readonly key: bigint;
    collider: Collider;
    otherCollider: Collider;

    contacts: Vector[];
    normal: Vector;
    depth: number;

    isTrigger: boolean;

    normalImpulse: number = 0;
    tangentImpulse: number = 0;

    restitution: number = 0;
    friction: number = 0;

    private static getKey(collider: Collider, otherCollider: Collider): bigint {
        const a = BigInt(collider.id);
        const b = BigInt(otherCollider.id);

        return a < b
            ? (a << 32n) | b
            : (b << 32n) | a;
    }

    constructor(
        collider: Collider,
        otherCollider: Collider,
        contacts: Vector[],
        normal: Vector,
        depth: number
    ) {
        this.key = Collision.getKey(collider, otherCollider);
        this.collider = collider;
        this.otherCollider = otherCollider;
        this.contacts = contacts;
        this.normal = normal;
        this.depth = depth;

        this.isTrigger = collider.isTrigger || otherCollider.isTrigger;
    }

    public clone() {
        return new Collision(this.collider, this.otherCollider, this.contacts, this.normal, this.depth);
    }

    public flip() {
        [this.collider, this.otherCollider] = [this.otherCollider, this.collider];
        this.normal.scale(-1);
        return this;
    }
}

const projectPoints = (points: Vector[], normal: Vector): [number, number] => {
    let min = Infinity, max = -Infinity;

    for (const p of points) {
        const proj = Vector.dot(p, normal);
        if (proj < min) min = proj;
        if (proj > max) max = proj;
    }

    return [min, max];
}

const projectCircle = (center: Vector, radius: number, normal: Vector): [number, number] => {
    const proj = Vector.dot(center, normal);
    return [proj - radius, proj + radius];
}

const findClosestPoint = (points: Vector[], point: Vector) => {
    let closest = points[0];
    let minDist = point.clone().sub(closest).lenSq();

    for (let i = 1; i < points.length; i++) {
        const d = point.clone().sub(points[i]).lenSq();
        if (d < minDist) {
            minDist = d;
            closest = points[i];
        }
    }
    return closest;
}

const circleVsCircle = (colliderA: CircleCollider, colliderB: CircleCollider): Collision | null => {
    const posA = colliderA.getWorldPosition();
    const posB = colliderB.getWorldPosition();

    const diff = posB.clone().sub(posA);
    const dist = diff.len();
    const radiusSum = colliderA.radius + colliderB.radius;

    if (dist >= radiusSum) return null;

    const depth = radiusSum - dist;
    const normal = diff.clone().normalize();

    return new Collision(colliderA, colliderB, [], normal, depth);
}

const polygonVsPolygon = (colliderA: PolygonCollider, colliderB: PolygonCollider): Collision | null => {
    const pointsA = colliderA.getWorldPoints();
    const pointsB = colliderB.getWorldPoints();
    const posA = colliderA.getWorldPosition();
    const posB = colliderB.getWorldPosition();

    let minDepth = Infinity;
    let collisionNormal!: Vector;

    const normals = [...colliderA.getNormals(), ...colliderB.getNormals()];
    for (let normal of normals) {
        const [minA, maxA] = projectPoints(pointsA, normal);
        const [minB, maxB] = projectPoints(pointsB, normal);

        const depth = Math.min(maxA, maxB) - Math.max(minA, minB);

        if (depth <= 0) return null;

        if (depth < minDepth) {
            minDepth = depth;
            collisionNormal = normal;
        }
    }

    if (Vector.dot(posB.clone().sub(posA), collisionNormal) < 0) {
        collisionNormal!.scale(-1);
    }

    return new Collision(colliderA, colliderB, [], collisionNormal, minDepth);
}

const polygonVsCircle = (colliderA: PolygonCollider, colliderB: CircleCollider): Collision | null => {
    const pointsA = colliderA.getWorldPoints();
    const posA = colliderA.getWorldPosition();
    const posB = colliderB.getWorldPosition();

    let minDepth = Infinity;
    let collisionNormal!: Vector;

    const normals = [...colliderA.getNormals(), posB.clone().sub(findClosestPoint(pointsA, posB)).normalize()];
    for (let normal of normals) {
        const [minA, maxA] = projectPoints(pointsA, normal);
        const [minB, maxB] = projectCircle(posB, colliderB.radius, normal);

        const depth = Math.min(maxA, maxB) - Math.max(minA, minB);

        if (depth <= 0) return null;

        if (depth < minDepth) {
            minDepth = depth;
            collisionNormal = normal;
        }
    }

    if (Vector.dot(posB.clone().sub(posA), collisionNormal) < 0) {
        collisionNormal!.scale(-1);
    }

    return new Collision(colliderA, colliderB, [], collisionNormal, minDepth);
}

export const detectCollision = (colliderA: Collider, colliderB: Collider): Collision | null => {
    const typeA = colliderA.getType();
    const typeB = colliderB.getType();

    if (typeA === ColliderType.CIRCLE && typeB === ColliderType.CIRCLE) {
        return circleVsCircle(colliderA as CircleCollider, colliderB as CircleCollider);
    }

    if (typeA === ColliderType.POLYGON && typeB === ColliderType.POLYGON) {
        return polygonVsPolygon(colliderA as PolygonCollider, colliderB as PolygonCollider);
    }

    if (typeA === ColliderType.POLYGON && typeB === ColliderType.CIRCLE) {
        return polygonVsCircle(colliderA as PolygonCollider, colliderB as CircleCollider);
    }

    if (typeA === ColliderType.CIRCLE && typeB === ColliderType.POLYGON) {
        return polygonVsCircle(colliderB as PolygonCollider, colliderA as CircleCollider);
    }

    return null;
}

