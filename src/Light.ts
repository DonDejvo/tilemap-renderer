import { Color } from "./Color";
import { Bounds } from "./common";
import { Vector } from "./Vector";

interface LightParams {
    radius: number;
    color?: Color;
    position?: Vector;
    intensity?: number;
    direction?: Vector;
    cutoff?: number;
    isStatic?: boolean;
}

export class Light {
    position: Vector;
    color: Color;
    intensity: number;
    radius: number;
    direction: Vector;
    cutoff: number;
    isStatic: boolean;

    constructor(params: LightParams) {
        this.position = params.position || new Vector();
        this.color = params.color || new Color(1, 1, 1);
        this.intensity = params.intensity || 1.0;
        this.radius = params.radius;
        this.direction = params.direction || new Vector(0, 1);
        this.cutoff = params.cutoff || 0.0;
        this.isStatic = params.isStatic || false;
    }

    public getBounds(): Bounds {
        const vec = new Vector(this.radius, this.radius);
        return {
            min: this.position.clone().sub(vec),
            max: this.position.clone().add(vec)
        }
    }
}