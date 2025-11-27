import { assets } from "./assets";
import { SceneLayerRenderOrder } from "./Scene";
import { TilePropertyJSON, Tileset, TilesetJSON } from "./Tileset";

type TilemapTileset = TilesetJSON & { firstgid: number; source?: string; }
type TilemapLayerType = "tilelayer" | "objectgroup";

interface TilemapLayerJSON {
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    type: TilemapLayerType;
    data?: number[];
    objects?: TilemapObject[];
    draworder?: SceneLayerRenderOrder;
}

interface TilemapJSON {
    width: number;
    height: number;
    tilewidth: number;
    tileheight: number;
    tilesets: TilemapTileset[];
    layers: TilemapLayerJSON[];
}

abstract class Layer {
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    type: TilemapLayerType;
    renderOrder: SceneLayerRenderOrder;
    tilemap!: Tilemap;

    constructor(json: TilemapLayerJSON) {
        this.name = json.name;
        this.x = json.x;
        this.y = json.y;
        this.width = json.width;
        this.height = json.height;
        this.type = json.type;
        this.renderOrder = json.draworder || "manual";
    }
}

class TileLayer extends Layer {
    private data: number[];

    constructor(json: TilemapLayerJSON) {
        super(json);
        this.data = json.data!;
    }

    public getTile(x: number, y: number) {
        const tileId = this.data[y * this.width + x];
        if (tileId - 1 == -1) {
            return null;
        }

        return this.tilemap.getTileById(tileId);
    }
}

export class TilemapObject {
    name: string;
    type: string;
    x: number;
    y: number;
    rotation: number;
    properties?: TilePropertyJSON[];

    constructor(name: string, type: string, x: number, y: number, rotation?: number, properties?: TilePropertyJSON[]) {
        this.name = name;
        this.type = type;
        this.x = x;
        this.y = y;
        this.rotation = rotation || 0;
        this.properties = properties;
    }

    public getProperty<T>(name: string): T {
        return this.properties?.find(prop => prop.name === name)?.value as T;
    }
}

class ObjectLayer extends Layer {
    private objects: TilemapObject[];

    constructor(json: TilemapLayerJSON) {
        super(json);
        this.objects = json.objects!;
    }

    public getObjects() {
        return this.objects.map(obj => new TilemapObject(obj.name, obj.type, obj.x, obj.y, obj.rotation, obj.properties));
    }
}

export class Tilemap {
    width: number;
    height: number;
    tileWidth: number;
    tileHeight: number;
    private tilesets: { tileset: Tileset; firstGlobalId: number; }[];
    private layers: Layer[];

    constructor(width: number, height: number, tileWidth: number, tileHeight: number) {
        this.width = width;
        this.height = height;
        this.tileWidth = tileWidth;
        this.tileHeight = tileHeight;
        this.tilesets = [];
        this.layers = [];
    }

    static async load(url: string, tilesetSources: Record<string, string>) {
        const json = await assets.loadJson<TilemapJSON>(url);
        const tilemap = new Tilemap(json.width, json.height, json.tilewidth, json.tileheight);

        for (const layer of json.layers) {
            switch (layer.type) {
                case "tilelayer":
                    tilemap.addLayer(new TileLayer(layer));
                    break;
                case "objectgroup":
                    tilemap.addLayer(new ObjectLayer(layer));
                    break;
            }
        }

        for (let tilesetData of json.tilesets) {
            let tileset;
            if (tilesetData.source) {
                const tokens = tilesetData.source.split(/(\/|\\\/)/);
                const tilesetName = tokens[tokens.length - 1].split(".tsj")[0];

                if (!tilesetSources[tilesetName]) throw new Error("Source is missing for tileset: " + tilesetName);

                tileset = await Tileset.load(tilesetSources[tilesetName]);
            } else {
                tileset = new Tileset(tilesetData);
            }
            tilemap.tilesets.push({ tileset, firstGlobalId: tilesetData.firstgid });
        }

        return tilemap;
    }

    public addLayer(layer: Layer) {
        layer.tilemap = this;
        this.layers.push(layer);
    }

    public getTilesets() {
        return this.tilesets.map((tileset) => tileset.tileset);
    }

    public getTilesetByName(name: string) {
        const info = this.tilesets.find((tileset) => tileset.tileset.name === name);
        if(!info) {
            throw new Error("Tilemap doesn't include tileset \"" + name + "\"");
        }
        return info.tileset;
    }

    public getLayers() {
        return this.layers;
    }

    public getLayerByName(name: string) {
        return this.layers.find((layer) => layer.name === name) || null;
    }

    public getTileById(id: number) {
        const tilesets = this.tilesets;
        for (let tileset of tilesets) {
            let tile = tileset.tileset.getTileById(id - tileset.firstGlobalId);

            if (tile) {
                return tile;
            }
        }
        return null;
    }
}

export type {
    TileLayer,
    ObjectLayer
}