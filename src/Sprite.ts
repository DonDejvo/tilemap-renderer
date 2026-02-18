import { Color } from "./Color";
import { Bounds } from "./bounds";
import { SceneNode } from "./SceneNode";
import { Tileset, TilesetRegion } from "./Tileset";
import { Vector } from "./Vector";

interface SpriteParams {
    tileset: Tileset;
    tilesetRegion?: TilesetRegion;
    zIndex?: number;
    isStatic?: boolean;
}

export class Sprite extends SceneNode {
    zIndex: number;
    tileset: Tileset;
    tilesetRegion: TilesetRegion;
    isStatic: boolean;
    width: number;
    height: number;
    tintColor: Color;
    maskColor: Color;

    constructor(params: SpriteParams) {
        super();
        this.zIndex = params.zIndex || 0;
        this.tileset = params.tileset;
        this.tilesetRegion = params.tilesetRegion || { x: 0, y: 0 };
        this.isStatic = params.isStatic || false;
        this.width = this.tileset.tileWidth * (this.tilesetRegion.width || 1);
        this.height = this.tileset.tileHeight * (this.tilesetRegion.height || 1);
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
        const radius = Math.max(Math.abs(this.width), Math.abs(this.height));
        const vec = new Vector(radius, radius);
        const min = this.worldPosition.clone().sub(vec);
        const max = min.clone().add(vec).add(vec);
        return {
            min,
            max
        }
    }

    public start(): void {
        let layer;
        layer = this.scene.findLayerBySprite(this);
        if (!layer) {
            layer = this.scene.createLayer({
                zIndex: this.zIndex,
                isStatic: this.isStatic
            });
        }
        layer.add(this);
    }

    public destroy(): void {
        const layer = this.scene.findLayerBySprite(this);
        if (layer) {
            layer.remove(this);
        }
    }
}