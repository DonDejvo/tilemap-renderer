import { Color } from "./Color";
import { Bounds } from "./common";
import { Tileset, TilesetRegion } from "./Tileset";
import { Vector } from "./Vector";

interface SpriteParams {
    tileset: Tileset;
    tilesetRegion?: TilesetRegion;
    zIndex?: number;
    isStatic?: boolean;
    angle?: number;
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

    constructor(params: SpriteParams) {
        this.zIndex = params.zIndex || 0;
        this.tileset = params.tileset;
        this.tilesetRegion = params.tilesetRegion || { x: 0, y: 0 };
        this.isStatic = params.isStatic || false;
        this.position = new Vector();
        this.offset = new Vector();
        this.scale = new Vector(
            this.tileset.tileWidth * (this.tilesetRegion.width || 1), 
            this.tileset.tileHeight * (this.tilesetRegion.height || 1)
        );
        this.angle = params.angle || 0;
        this.tintColor = new Color(1, 1, 1, 1);
        this.maskColor = new Color(0, 0, 0, 1);
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

    public getBounds(): Bounds {
        const radius = Math.max(Math.abs(this.scale.x), Math.abs(this.scale.y));
        const vec = new Vector(radius, radius);
        const min = this.position.clone().add(this.offset).sub(vec);
        const max = min.clone().add(vec).add(vec);
        return {
            min,
            max
        }
    }
}