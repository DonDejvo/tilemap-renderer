import { Vector } from "./Vector";

export type Bounds = { min: Vector; max: Vector; };

export const overlaps = (a: Bounds, b: Bounds): boolean => {
    return (b.min.x - a.max.x) * (b.max.x - a.min.x) < 0 &&
        (b.min.y - a.max.y) * (b.max.y - a.min.y) < 0
};
