import { Vector } from "./Vector";

interface SpriteParams {
    tilesetName: string;
    tilesetIdx: number;
    zIndex?: number;
    isStatic?: boolean;
}

export class Sprite {
    zIndex: number;
    tilesetName: string;
    tilesetIdx: number;
    isStatic: boolean;
    position: Vector;
    scale: Vector;

    constructor(params: SpriteParams) {
        this.zIndex = params.zIndex || 0;
        this.tilesetName = params.tilesetName;
        this.tilesetIdx = params.tilesetIdx;
        this.isStatic = params.isStatic || false;
        this.position = new Vector();
        this.scale = new Vector(1, 1);
    }
}