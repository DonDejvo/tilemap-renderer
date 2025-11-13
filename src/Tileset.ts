import { assets } from "./assets";

type TilePropertyJSON = { name: string; value: boolean | number | string; };

export interface TileAnimation {
    frames: number[];
    framesPerSecond: number;
}

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
    x: number;
    y: number;
    properties?: TilePropertyJSON[];
    animation?: TileAnimation;
    tileset: Tileset;

    constructor(tileset: Tileset, x: number, y: number, tileData?: TileDataJSON) {
        this.tileset = tileset;
        this.x = x;
        this.y = y;
        this.properties = tileData?.properties;
        this.animation = tileData?.animation;
    }

    public getProperty(name: string) {
        return this.properties?.find(prop => prop.name === name) ?? null;
    }
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
    margin?: number;
    spacing?: number;
    tiledata: Map<number, TileDataJSON>;

    constructor(json: TilesetJSON) {
        this.name = json.name;
        this.imageWidth = json.imagewidth;
        this.imageHeight = json.imageheight;
        this.tileWidth = json.tilewidth;
        this.tileHeight = json.tileheight;
        this.columns = json.columns;
        this.tileCount = json.tilecount;
        this.tiledata = new Map();

        if(json.tiles) {
            for(let item of json.tiles) {
                this.tiledata.set(item.id, item);
            }
        }
    }

    public static async load(url: string): Promise<Tileset> {
        if(!this.cache.has(url)) {
            const json = await assets.loadJson<TilesetJSON>(url);
            this.cache.set(url, new Tileset(json));
        }
        return this.cache.get(url)!;
    }

    public getTile(x: number, y: number) {
        const data = this.tiledata.get(y * this.columns + x);

        return new Tile(this, x, y, data);
    }

    public getTileById(id: number) {
        if(id >= this.tileCount || id < 0) return null;

        const x = id % this.columns;
        const y = Math.floor(id / this.columns);

        return this.getTile(x, y);
    }
}