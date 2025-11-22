import { Color } from "./Color";
import { BlendMode } from "./Renderer";
import { Tileset, TilesetRegion } from "./Tileset";
import { Vector } from "./Vector";

interface SpriteParams {
    tileset: Tileset;
    tilesetRegion: TilesetRegion;
    zIndex?: number;
    isStatic?: boolean;
    angle?: number;
    blendMode?: BlendMode;
}

export class Sprite {
    zIndex: number;
    tileset: Tileset;
    tilesetRegion: TilesetRegion;
    isStatic: boolean;
    position: Vector;
    offset: Vector;
    scale: Vector;
    angle: number;
    tintColor: Color;
    maskColor: Color;
    blendMode: BlendMode;

    constructor(params: SpriteParams) {
        this.zIndex = params.zIndex || 0;
        this.tileset = params.tileset;
        this.tilesetRegion = params.tilesetRegion;
        this.isStatic = params.isStatic || false;
        this.position = new Vector();
        this.offset = new Vector();
        this.scale = new Vector(1, 1);
        this.angle = params.angle || 0;
        this.tintColor = new Color(1, 1, 1, 1);
        this.maskColor = new Color(0, 0, 0, 1);
        this.blendMode = params.blendMode || "alpha";
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