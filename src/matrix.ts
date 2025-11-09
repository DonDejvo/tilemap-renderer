export type Matrix = Float32Array<any>;

export const matrix = (() => {
    const identity = (): Matrix => {
        return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    }

    const createOrtho = (
        out: Matrix,
        left: number,
        right: number,
        bottom: number,
        top: number
    ): Matrix => {

        out[0] = 2 / (right - left);
        out[1] = 0;
        out[2] = 0;
        out[3] = 0;

        out[4] = 0;
        out[5] = 2 / (top - bottom);
        out[6] = 0;
        out[7] = 0;

        out[8] = 0;
        out[9] = 0;
        out[10] = 1;
        out[11] = 0;

        out[12] = -(right + left) / (right - left);
        out[13] = -(top + bottom) / (top - bottom);
        out[14] = 0;
        out[15] = 1;

        return out;
    };
    return {
        identity,
        createOrtho
    }
})();

