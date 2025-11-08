import { loadJson } from "./assets";

type TileProperty = { name: string; value: boolean | number | string; };

export interface TileAnimation {
    frames: number[];
    framesPerSecond: number;
}

export interface TileData {
    id: number;
    properties?: TileProperty[];
    animation?: TileAnimation;
}

export interface TilesetJSON {
    tileSize: number;
    tilesPerRow: number;
    totalTiles: number;
    data: TileData[];
}

export class Tile {
    x: number;
    y: number;
    properties?: TileProperty[];
    animation?: TileAnimation;

    constructor(x: number, y: number, tileData?: TileData) {
        this.x = x;
        this.y = y;
        this.properties = tileData?.properties;
        this.animation = tileData?.animation;
    }

    public getProperty(name: string) {
        return this.properties?.find(prop => prop.name === name) ?? null;
    }
}

export class SpriteAtlas {
    tileSize: number;
    tilesPerRow: number;
    totalTiles: number;
    data: Map<number, TileData>;

    constructor(json: TilesetJSON) {
        this.tileSize = json.tileSize;
        this.tilesPerRow = json.tilesPerRow;
        this.totalTiles = json.totalTiles;

        this.data = new Map();
        for (const tile of json.data) {
            this.data.set(tile.id, tile);
        }
    }

    public static async load(url: string): Promise<SpriteAtlas> {
        const json = await loadJson(url);
        return new SpriteAtlas(json);
    }

    public getTile(x: number, y: number) {
        const data = this.data.get(y * this.tilesPerRow + x);

        return new Tile(x, y, data);
    }

    public getTileById(id: number) {
        const data = this.data.get(id);

        const x = id % this.tilesPerRow;
        const y = Math.floor(id / this.tilesPerRow);

        return new Tile(x, y, data);
    }
}