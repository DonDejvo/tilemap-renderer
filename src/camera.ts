import { matrix, Matrix } from "./matrix";
import { Vector } from "./Vector";

export class Camera {
    vw: number;
    vh: number;
    projectionMatrix: Matrix;
    viewMatrix: Matrix;
    position: Vector;
    zoom: number;

    constructor(vw: number, vh: number) {
        this.projectionMatrix = matrix.create();
        this.viewMatrix = matrix.create();
        this.position = new Vector();
        this.zoom = 1;
        this.vw = 0;
        this.vh = 0;

        this.updateProjection(vw, vh);
    }

    public updateProjection(vw: number, vh: number) {
        this.vw = vw;
        this.vh = vh;
    }

    public update() {
        matrix.identity(this.viewMatrix);
        matrix.translate(this.viewMatrix, new Vector(-this.position.x, -this.position.y));

        const halfW = this.vw * 0.5 / this.zoom;
        const halfH = this.vh * 0.5 / this.zoom;

        matrix.createOrtho(this.projectionMatrix, -halfW, halfW, -halfH, halfH);
    }
}