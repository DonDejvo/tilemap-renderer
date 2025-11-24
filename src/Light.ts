import { Color } from "./Color";
import { Vector } from "./Vector";

interface LightParams {
    radius: number;
    color?: Color;
    position?: Vector;
    intensity?: number;
    direction?: Vector;
    cutoff?: number;
}

export class Light {
    position: Vector;
    color: Color;
    intensity: number;
    radius: number;
    direction: Vector;
    cutoff: number;

    constructor(params: LightParams) {
        this.position = params.position || new Vector();
        this.color = params.color || new Color(1, 1, 1);
        this.intensity = params.intensity || 1.0;
        this.radius = params.radius;
        this.direction = params.direction || new Vector(0, 1);
        this.cutoff = params.cutoff || 0.0;
    }
}