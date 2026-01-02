import { Collider } from "./Collider";
import { Vector } from "./Vector";

export class CollisionInfo {
    readonly key: string;
    collider: Collider;
    otherCollider: Collider;
    penetration: number;
    dir: Vector;
    contacts: Vector[];

    static genKey(collider: Collider, other: Collider) {
        return `${collider.id}:${other.id}`;
    }

    static fromResult(collider: Collider, other: Collider, result: CollisionResult) {
        return new CollisionInfo(
            collider,
            other,
            result.penetration,
            result.dir,
            result.contacts.slice(0, result.contactsCount)
        );
    }

    constructor(collider: Collider, other: Collider, penetration: number, dir: Vector, contacts: Vector[]) {
        this.key = CollisionInfo.genKey(collider, other);
        this.collider = collider;
        this.otherCollider = other;
        this.penetration = penetration;
        this.dir = dir.clone();
        this.contacts = contacts.map(p => p.clone());
    }

    public clone() {
        return new CollisionInfo(this.collider, this.otherCollider, this.penetration, this.dir, this.contacts);
    }

    public flip() {
        [this.collider, this.otherCollider] = [this.otherCollider, this.collider];
        this.dir.scale(-1);

        this.contacts.forEach(p => p.sub(this.dir.clone().scale(this.penetration)));

        return this;
    }
}

export interface CollisionResult {
    collides: boolean;
    penetration: number;
    dir: Vector;
    contacts: Vector[];
    contactsCount: number;
}

const projectCircle = (center: Vector, radius: number, normal: Vector) => {
    const proj = Vector.dot(center, normal);
    return {
        min: proj - radius,
        max: proj + radius
    };
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

const projectPoints = (points: Vector[], normal: Vector) => {
    let min = Infinity, min2 = Infinity, max = -Infinity;

    let minidx = 0, min2idx = 0;

    for (let i = 0; i < points.length; ++i) {
        const proj = Vector.dot(points[i], normal);
        if (proj < min) {
            min2 = min;
            min = proj;
            min2idx = minidx;
            minidx = i;
        } else if (proj < min2) {
            min2 = proj;
            min2idx = i;
        }
        if (proj > max) {
            max = proj;
        }
    }

    return {
        min, min2,
        max,
        minidx, min2idx
    };
}

const polygonCollisionHelper = (result: CollisionResult, pointsA: Vector[], pointsB: Vector[], flipped: boolean) => {
    for (let i = 0; i < pointsA.length; ++i) {
        const a1 = pointsA[i];
        const a2 = pointsA[(i + 1) % pointsA.length];

        const edgeDir = a2.clone().sub(a1).normalize();
        const normal = new Vector(edgeDir.y, -edgeDir.x);

        const projResultA = projectPoints(pointsA, normal);
        const projResultB = projectPoints(pointsB, normal);

        result.collides = projResultA.max > projResultB.min && projResultA.min < projResultB.max;
        if (!result.collides) return;

        const penetration = projResultA.max - projResultB.min;

        if (penetration < result.penetration) {

            result.penetration = penetration;
            result.dir.copy(flipped ? normal.clone().scale(-1) : normal);
            result.contactsCount = 0;

            let p1 = pointsB[projResultB.minidx];
            let p2 = pointsB[projResultB.min2idx];

            if ((projResultB.min2 - projResultB.min) / Vector.distance(p1, p2) > 0.01) {

                result.contacts[result.contactsCount++] = p1.clone();

            } else {
                const plane1 = edgeDir.clone();
                const planeProj1 = Vector.dot(a2, plane1);

                const plane2 = edgeDir.clone().scale(-1);
                const planeProj2 = Vector.dot(a1, plane2);

                [p1, p2] = clipEdgeToHalfspace(p1, p2, plane2, planeProj2);
                [p1, p2] = clipEdgeToHalfspace(p1, p2, plane1, planeProj1);

                result.contacts[result.contactsCount++] = p1;
                result.contacts[result.contactsCount++] = p2;

            }

            if (flipped) {
                result.contacts.forEach(p => p.add(normal.clone().scale(penetration)));
            }
        }
    }
}

const clipEdgeToHalfspace = (p1: Vector, p2: Vector, plane: Vector, planeProj: number) => {
    const proj1 = Vector.dot(p1, plane) - planeProj;
    const proj2 = Vector.dot(p2, plane) - planeProj;

    const result: [Vector, Vector] = [new Vector, new Vector];
    let i = 0;

    if (proj1 <= 0) {
        result[i++].copy(p1);
    }

    if (proj2 <= 0) {
        result[i++].copy(p2);
    }

    if (proj1 * proj2 < 0) {
        const t = proj1 / (proj1 - proj2);

        result[i++].copy(p1.clone().lerp(p2, t));
    }

    return result;
}

export const polygonVsPolygon = (result: CollisionResult, pointsA: Vector[], pointsB: Vector[]) => {
    polygonCollisionHelper(result, pointsA, pointsB, false);

    if (!result.collides) return;

    polygonCollisionHelper(result, pointsB, pointsA, true);
}

export const polygonVsCircle = (result: CollisionResult, points: Vector[], circleCenter: Vector, circleRadius: number, flipped: boolean) => {
    const normals = new Array(points.length + 1);
    for (let i = 0; i < points.length; ++i) {
        const a1 = points[i];
        const a2 = points[(i + 1) % points.length];

        const edgeDir = a2.clone().sub(a1).normalize();
        normals[i] = new Vector(edgeDir.y, -edgeDir.x);
    }
    normals[points.length] = circleCenter.clone().sub(findClosestPoint(points, circleCenter)).normalize();

    for (let i = 0; i < normals.length; ++i) {
        const normal = normals[i];

        const polyProjResult = projectPoints(points, normal);
        const circleProjResult = projectCircle(circleCenter, circleRadius, normal);

        result.collides = polyProjResult.max > circleProjResult.min && polyProjResult.min < circleProjResult.max;
        if (!result.collides) return;

        const penetration = polyProjResult.max - circleProjResult.min;

        if (penetration < result.penetration) {

            result.penetration = penetration;
            result.dir.copy(flipped ? normal.clone().scale(-1) : normal);
            result.contactsCount = 0;
            result.contacts[result.contactsCount++] = circleCenter.clone().sub(normal.clone().scale(circleRadius));

            if (flipped) {
                result.contacts.forEach(p => p.add(normal.clone().scale(penetration)));
            }
        }
    }
}

export const circleVsCircle = (result: CollisionResult, centerA: Vector, radiusA: number, centerB: Vector, radiusB: number) => {
    const vec = centerB.clone().sub(centerA);

    const penetration = radiusA + radiusB - vec.len();

    result.collides = penetration > 0;
    if (!result.collides) return;

    const normal = vec.clone().normalize();

    result.dir = normal;
    result.penetration = penetration;
    result.contacts[result.contactsCount++] = centerB.clone().sub(normal.clone().scale(radiusB));
}