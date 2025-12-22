import { Vector } from "./Vector";

export type Bounds = { min: Vector; max: Vector; };

export const getWidth = (bounds: Bounds) => Math.abs(bounds.max.x - bounds.min.x);

export const getHeight = (bounds: Bounds) => Math.abs(bounds.max.y - bounds.min.y);

export const overlaps = (a: Bounds, b: Bounds): boolean =>
    (b.min.x - a.max.x) * (b.max.x - a.min.x) < 0 &&
        (b.min.y - a.max.y) * (b.max.y - a.min.y) < 0

export const containsPoint = (bounds: Bounds, point: Vector): boolean =>
    (bounds.min.x - point.x) * (bounds.max.x - point.x) < 0 &&
        (bounds.min.y - point.y) * (bounds.max.y - point.y) < 0

export const bounds = {
    getWidth,
    getHeight,
    overlaps,
    containsPoint
};
