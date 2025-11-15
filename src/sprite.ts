import { Tileset } from "./Tileset";
import { Vector } from "./Vector";

interface TilesetRegion {
    x: number;
    y: number;
    width?: number;
    height?: number;
}

interface SpriteParams {
    tileset: Tileset;
    tilesetRegion: TilesetRegion;
    zIndex?: number;
    isStatic?: boolean;
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
        this.offset = new Vector();
        this.scale = new Vector(1, 1);
    }

    public setTilesetRegion(x: number, y: number, width: number = 1, height: number = 1) {
        this.tilesetRegion.x = x;
        this.tilesetRegion.y = y;
        this.tilesetRegion.width = width;
        this.tilesetRegion.height = height;
    }

    public getTile() {
        return this.tileset.getTile(this.tilesetRegion.x, this.tilesetRegion.y)!;
    }
}