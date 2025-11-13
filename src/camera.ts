import { matrix, Matrix } from "./matrix";
import { Vector } from "./Vector";

export class Camera {
    vw: number;
    vh: number;
    projectionMatrix: Matrix;
    position: Vector;

    constructor(vw: number, vh: number) {
        this.projectionMatrix = matrix.identity();
        this.position = new Vector();
        this.vw = 0;
        this.vh = 0;

        this.updateProjection(vw, vh);
    }

    public updateProjection(vw: number, vh: number) {
        this.vw = vw;
        this.vh = vh;
        matrix.createOrtho(this.projectionMatrix, -vw * 0.5, vw * 0.5, -vh * 0.5, vh * 0.5);
    }
}