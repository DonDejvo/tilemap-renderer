import { Bounds } from "./common";
import { Vector } from "./Vector";

export class Camera {
    vw: number;
    vh: number;
    position: Vector;

    constructor(vw: number, vh: number) {
        this.position = new Vector();
        this.vw = 0;
        this.vh = 0;

        this.updateProjection(vw, vh);
    }

    public updateProjection(vw: number, vh: number) {
        this.vw = vw;
        this.vh = vh;
    }

    public getBounds(): Bounds {
        return {
            min: this.position.clone(),
            max: this.position.clone().add(new Vector(this.vw, this.vh))
        };
    }
}