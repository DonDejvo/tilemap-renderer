export const math = (() => {

    const clamp = (value: number, min: number, max: number): number =>
        Math.min(Math.max(value, min), max);

    const lerp = (a: number, b: number, t: number): number =>
        a + (b - a) * t;

    const unlerp = (a: number, b: number, value: number): number =>
        clamp((value - a) / (b - a), 0, 1);

    const sat = (value: number): number =>
        clamp(value, 0, 1);

    const degToRad = (deg: number) =>
        deg / 180 * Math.PI;

    const radToDeg = (rad: number) => 
        rad / Math.PI * 180;

    return {
        clamp,
        lerp,
        unlerp,
        sat,
        degToRad,
        radToDeg
    };

})();

export class LinearSpline {
    points: number[];

    constructor(points: number[] = []) {
        this.points = points;
    }

    addPoint(value: number) {
        this.points.push(value);
    }

    getValue(t: number): number {
        const n = this.points.length;
        if (n === 0) return 0;
        if (t <= 0) return this.points[0];
        if (t >= n - 1) return this.points[n - 1];

        const i = Math.floor(t);
        const tLocal = t - i;
        return math.lerp(this.points[i], this.points[i + 1], tLocal);
    }
}
