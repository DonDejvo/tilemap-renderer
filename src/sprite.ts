import { Tileset } from "./Tileset";
import { Vector } from "./Vector";

interface TilesetRegion {
    x: number;
    y: number;
    width?: number;
    height?: number;
}

type SpriteOrigin = "center" | "bottom" | "top";

interface SpriteParams {
    tileset: Tileset;
    tilesetRegion: TilesetRegion;
    zIndex?: number;
    isStatic?: boolean;
    origin?: SpriteOrigin;
}

export class Sprite {
    zIndex: number;
    tileset: Tileset;
    tilesetRegion: TilesetRegion;
    isStatic: boolean;
    position: Vector;
    offset: Vector;
    scale: Vector;

    constructor(params: SpriteParams) {
        this.zIndex = params.zIndex || 0;
        this.tileset = params.tileset;
        this.tilesetRegion = params.tilesetRegion;
        this.isStatic = params.isStatic || false;
        this.position = new Vector();
        this.offset = this.getOffsetFromOrigin(params.origin);
        this.scale = new Vector(1, 1);
    }

    private getOffsetFromOrigin(origin?: SpriteOrigin) {
        switch(origin) {
            case "bottom":
                return new Vector(0, 0.5);
            case "top":
                return new Vector(0, -0.5);
            default:
                return new Vector();
        }
    }
}