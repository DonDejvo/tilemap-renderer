import { assets } from "./assets";

type TilePropertyJSON = { name: string; value: boolean | number | string; };

export interface TileAnimationFrameJSON {
    duration: number; // in ms
    tileid: number;
}

export type TileAnimation = TileAnimationFrameJSON[];

export interface TileDataJSON {
    id: number;
    properties?: TilePropertyJSON[];
    animation?: TileAnimation;
}

export interface TilesetJSON {
    name: string;
    imagewidth: number;
    imageheight: number;
    tilewidth: number;
    tileheight: number;
    columns: number;
    tilecount: number;
    tiles?: TileDataJSON[];
    margin?: number;
    spacing?: number;
}

export class Tile {
    id: number;
    x: number;
    y: number;
    properties?: TilePropertyJSON[];
    animation?: TileAnimation;
    tileset: Tileset;

    constructor(tileset: Tileset, id: number, x: number, y: number, tileData?: TileDataJSON) {
        this.tileset = tileset;
        this.id = id;
        this.x = x;
        this.y = y;
        this.properties = tileData?.properties;
        this.animation = tileData?.animation;
    }

    public getProperty(name: string) {
        return this.properties?.find(prop => prop.name === name) ?? null;
    }
}

export interface TilesetRegion {
    x: number;
    y: number;
    width?: number;
    height?: number;
}

export class Tileset {
    static cache = new Map<string, Tileset>();

    name: string;
    imageWidth: number;
    imageHeight: number;
    tileWidth: number;
    tileHeight: number;
    columns: number;
    tileCount: number;
    margin: number;
    spacing: number;
    tiledata: Map<number, TileDataJSON>;

    constructor(json: TilesetJSON) {
        this.name = json.name;
        this.imageWidth = json.imagewidth;
        this.imageHeight = json.imageheight;
        this.tileWidth = json.tilewidth;
        this.tileHeight = json.tileheight;
        this.columns = json.columns;
        this.tileCount = json.tilecount;
        this.margin = json.margin || 0;
        this.spacing = json.spacing || 0;
        this.tiledata = new Map();

        if (json.tiles) {
            for (let item of json.tiles) {
                this.tiledata.set(item.id, item);
            }
        }
    }

    public static async load(url: string): Promise<Tileset> {
        if (!this.cache.has(url)) {
            const json = await assets.loadJson<TilesetJSON>(url);
            this.cache.set(url, new Tileset(json));
        }
        return this.cache.get(url)!;
    }

    public static getByName(name: string) {
        return this.cache.values().find(tileset => tileset.name === name) || null;
    }

    public getTile(x: number, y: number) {
        if (x < 0 || x >= this.columns || y < 0 || y >= Math.ceil(this.tileCount / this.columns)) return null;

        const id = y * this.columns + x;

        const data = this.tiledata.get(id);

        return new Tile(this, id, x, y, data);
    }

    public getTileById(id: number) {
        if (id >= this.tileCount || id < 0) return null;

        const x = id % this.columns;
        const y = Math.floor(id / this.columns);

        const data = this.tiledata.get(id);

        return new Tile(this, id, x, y, data);
    }

    public getTileXY(id: number) {
        const x = id % this.columns;
        const y = Math.floor(id / this.columns);
        return { x, y };
    }
}