import { Color } from "./Color";
import { Bounds } from "./common";
import { SceneNode } from "./SceneNode";
import { Vector } from "./Vector";

interface LightParams {
    radius: number;
    color?: Color;
    intensity?: number;
    direction?: Vector;
    cutoff?: number;
    isStatic?: boolean;
}

export class Light extends SceneNode {
    color: Color;
    intensity: number;
    radius: number;
    direction: Vector;
    cutoff: number;
    isStatic: boolean;

    constructor(params: LightParams) {
        super();
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
            min: this.worldPosition.clone().sub(vec),
            max: this.worldPosition.clone().add(vec)
        }
    }

    public start(): void {
        this.scene.getLights().push(this);
    }

    public destroy(): void {
        const i = this.scene.getLights().indexOf(this);
        if (i !== -1) this.scene.getLights().splice(i, 1);
    }
}