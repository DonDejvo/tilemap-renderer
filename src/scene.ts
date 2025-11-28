import { Animator } from "./Animator";
import { Collider } from "./Collider";
import { Color } from "./Color";
import { Bounds } from "./common";
import { Light } from "./Light";
import { SpatialHashGrid, SpatialHashGridClient, SpatialHashGridParams } from "./SpatialHashGrid";
import { Sprite } from "./Sprite";
import { ObjectLayer, TileLayer, Tilemap, TilemapObject } from "./Tilemap";
import { Vector } from "./Vector";

interface SceneAddTilemapConfig {
    layers?: {
        name: string;
        zIndex?: number;
    }[];
    tileWidth?: number;
    tileHeight?: number;
    onObject?: (obj: TilemapObject, x: number, y: number, w: number, h: number, zIndex: number, scene: Scene, layer: ObjectLayer) => void;
}

interface SceneParams {
    spatialHashGridParams?: SpatialHashGridParams;
    shadowsZIndex?: number;
    ambientIntensity?: number;
    ambientColor?: Color;
}

export class Scene {
    private layers: SceneLayer[];
    public ambientColor: Color;
    public ambientIntensity: number;
    private lights: Light[];
    private colliders: { collider: Collider, hashGridClient: SpatialHashGridClient<Collider> }[];
    public shadowsZIndex: number;
    private collidersHashGrid: SpatialHashGrid<Collider>;

    constructor(params: SceneParams = {}) {
        this.layers = [];
        this.ambientIntensity = params.ambientIntensity || 1.0;
        this.ambientColor = params.ambientColor || new Color(1, 1, 1);
        this.lights = [];
        this.colliders = [];
        this.shadowsZIndex = params.shadowsZIndex || 0;
        this.collidersHashGrid = new SpatialHashGrid(params.spatialHashGridParams || {
            bounds: { min: new Vector(-1000, -1000), max: new Vector(1000, 1000) },
            dimensions: [20, 20]
        })
    }

    private findLayerBySprite(sprite: Sprite) {
        return this.layers.find(layer =>
            layer.isStatic === sprite.isStatic &&
            layer.zIndex === sprite.zIndex);
    }

    public addLight(light: Light) {
        this.lights.push(light);
    }

    public removeLight(light: Light) {
        const i = this.lights.indexOf(light);
        if (i !== -1) this.lights.splice(i, 1);
    }

    public addSprite(sprite: Sprite) {
        let layer;
        layer = this.findLayerBySprite(sprite);
        if (!layer) {
            layer = this.createLayer({
                zIndex: sprite.zIndex,
                isStatic: sprite.isStatic
            });
        }
        layer.add(sprite);
        return sprite;
    }

    public removeSprite(sprite: Sprite) {
        const layer = this.findLayerBySprite(sprite);
        if (!layer) return;

        layer.remove(sprite);
    }

    public addTilemap(tilemap: Tilemap, config: SceneAddTilemapConfig = {}) {
        const layers = tilemap.getLayers();

        const tileWidth = config.tileWidth || tilemap.tileWidth;
        const tileHeight = config.tileHeight || tilemap.tileHeight;

        let zIndex = 0;

        const sprites = [];
        const animators = [];

        for (const layer of layers) {
            const layerConfig = config.layers?.find(item => item.name === layer.name);

            if (layerConfig?.zIndex) {
                zIndex = layerConfig.zIndex;
            }

            if (layer.renderOrder !== "manual") {
                this.createLayer({
                    zIndex,
                    renderOrder: layer.renderOrder,
                    isStatic: false
                });
            }

            switch (layer.type) {
                case "tilelayer": {

                    for (let i = 0; i < layer.height; ++i) {
                        for (let j = 0; j < layer.width; ++j) {
                            const tile = (layer as TileLayer).getTile(j, i);

                            if (!tile) continue;

                            const s = new Sprite({
                                isStatic: tile.animation === undefined,
                                zIndex,
                                tileset: tile.tileset,
                                tilesetRegion: { x: tile.x, y: tile.y }
                            });

                            s.position.set((j + layer.x) * tileWidth, (i + layer.y) * tileHeight);
                            s.scale.set(tileWidth, tileHeight);

                            sprites.push(this.addSprite(s));

                            if (tile.animation) {
                                const animator = new Animator(s);
                                animator.play({ x: tile.x, y: tile.y }, { repeat: true });
                                animators.push(animator);
                            }
                        }
                    }
                    break;
                }
                case "objectgroup": {
                    if (config.onObject) {
                        const objects = (layer as ObjectLayer).getObjects();
                        for (const obj of objects) {
                            const x = obj.x * tileWidth / tilemap.tileWidth;
                            const y = obj.y * tileHeight / tilemap.tileHeight;
                            const w = obj.width * tileWidth / tilemap.tileWidth;
                            const h = tileHeight / tilemap.tileHeight
                            config.onObject(obj, x, y, w, h, zIndex, this, layer as ObjectLayer);
                        }
                    }
                    break;
                }
            }

            ++zIndex;
        }

        return {
            sprites,
            animators
        }
    }

    public createLayer(params: SceneLayerParams) {
        const layer = new SceneLayer(params);
        this.layers.push(layer);
        return layer;
    }

    public getLayersOrdered() {
        return this.layers.sort((a, b) => a.zIndex - b.zIndex);
    }

    public getLights() {
        return this.lights;
    }

    public addCollider(collider: Collider) {
        this.colliders.push({
            collider,
            hashGridClient: this.collidersHashGrid.createClient(collider, collider.getBounds())
        });
        return collider;
    }

    public removeCollider(collider: Collider) {
        const i = this.colliders.findIndex(colliderInfo => colliderInfo.collider === collider);
        if (i !== -1) {
            this.collidersHashGrid.removeClient(this.colliders[i].hashGridClient);
            this.colliders.splice(i, 1);
        }
    }

    public getColliders(bounds: Bounds): Collider[] {
        return this.collidersHashGrid.findNearby(bounds).map(client => client.parent);
    }

    public update() {
        for (let colliderInfo of this.colliders) {
            if(colliderInfo.collider.isStatic) continue;

            colliderInfo.hashGridClient.bounds = colliderInfo.collider.getBounds();
            this.collidersHashGrid.updateClient(colliderInfo.hashGridClient);
        }
    }

    public getInfo() {
        const spritesCount = this.layers.reduce((spritesCount, layer) => spritesCount + layer.sprites.length, 0);
        const staticSpritesCount = this.layers.reduce((spritesCount, layer) => spritesCount + layer.sprites.filter(sprite => sprite.isStatic).length, 0);
        return {
            lights: this.lights.length,
            colliders: this.colliders.length,
            sprites: spritesCount,
            staticSprites: staticSpritesCount,
            dynamicSprites: spritesCount - staticSpritesCount,
            layers: this.layers.length
        };
    }
}

export type SceneLayerRenderOrder = "manual" | "topdown";

interface SceneLayerParams {
    zIndex: number;
    isStatic: boolean;
    renderOrder?: SceneLayerRenderOrder;
}

export class SceneLayer {
    zIndex: number;
    isStatic: boolean;
    sprites: Sprite[];
    renderOrder: SceneLayerRenderOrder;

    constructor(params: SceneLayerParams) {
        this.zIndex = params.zIndex;
        this.isStatic = params.isStatic;
        this.renderOrder = params.renderOrder || "manual";
        this.sprites = [];
    }

    public add(sprite: Sprite) {
        if (this.renderOrder === "manual") {
            let insertIndex = -1;
            for (let i = this.sprites.length - 1; i >= 0; --i) {
                if (this.sprites[i].tileset.name <= sprite.tileset.name) {
                    insertIndex = i;
                    break;
                }
            }
            if (insertIndex === -1) {
                this.sprites.unshift(sprite);
            } else {
                this.sprites.splice(insertIndex + 1, 0, sprite);
            }
        } else {
            this.sprites.push(sprite);
        }
    }

    public remove(sprite: Sprite) {
        const i = this.sprites.indexOf(sprite);
        if (i !== -1) this.sprites.splice(i, 1);
    }

    public getSpritesOrdered() {
        switch (this.renderOrder) {
            case "topdown":
                return this.sprites.sort((a, b) => a.position.y - b.position.y);
            default:
                return this.sprites;
        }
    }
}