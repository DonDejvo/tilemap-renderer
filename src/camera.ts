import { createOrtho, identity, Matrix } from "./matrix";
import { Vector } from "./vector";

export class Camera {
    vw: number;
    vh: number;
    projectionMatrix: Matrix;
    position: Vector;

    constructor() {
        this.projectionMatrix = identity();
        this.position = new Vector();
        this.vw = 0;
        this.vh = 0;
    }

    public updateProjection(vw: number, vh: number) {
        this.vw = vw;
        this.vh = vh;
        createOrtho(this.projectionMatrix, 0, vw, 0, vh);
    }
}