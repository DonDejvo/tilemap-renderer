import { Vector } from "./vector";

export class Sprite {
    zIndex: number;
    atlasName: string;
    tileId: number;
    isStatic: boolean;
    position: Vector;
    scale: Vector;

    constructor(zIndex: number, atlasName: string, tileId: number, isStatic: boolean) {
        this.zIndex = zIndex;
        this.atlasName = atlasName;
        this.tileId = tileId;
        this.isStatic = isStatic;
        this.position = new Vector();
        this.scale = new Vector(1, 1);
    }
}