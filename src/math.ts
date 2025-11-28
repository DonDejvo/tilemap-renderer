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
