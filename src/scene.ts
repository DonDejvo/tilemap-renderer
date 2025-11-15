import { Animator } from "./Animator";
import { Sprite } from "./Sprite";
import { ObjectLayer, TileLayer, Tilemap, TilemapObject } from "./Tilemap";

interface SceneAddTilemapConfig {
    layers?: {
        name: string;
        zIndex?: number;
    }[];
    onObject?: (scene: Scene, obj: TilemapObject, layer: ObjectLayer, zIndex: number) => void;
}

export class Scene {
    private layers: SceneLayer[];

    constructor() {
        this.layers = [];
    }

    public addSprite(sprite: Sprite) {
        let layer = this.layers.find(layer =>
            layer.isStatic === sprite.isStatic &&
            layer.zIndex === sprite.zIndex);
        if (!layer) {
            layer = new SceneLayer({
                zIndex: sprite.zIndex,
                isStatic: sprite.isStatic
            });
            this.layers.push(layer);
        }
        layer.add(sprite);
        return sprite;
    }

    public addTilemap(tilemap: Tilemap, config: SceneAddTilemapConfig = {}) {
        const layers = tilemap.getLayers();

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

                            s.position.set((j + layer.x) * tilemap.tileWidth, (i + layer.y) * tilemap.tileHeight);
                            s.scale.set(tilemap.tileWidth, tilemap.tileHeight);

                            sprites.push(this.addSprite(s));

                            if(tile.animation) {
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
                            config.onObject(this, obj, layer as ObjectLayer, zIndex);
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
    renderOrder: SceneLayerRenderOrder;
    private sprites: Sprite[];

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

    public getSpritesOrdered() {
        switch (this.renderOrder) {
            case "topdown":
                return this.sprites.sort((a, b) => a.position.y - b.position.y);
            default:
                return this.sprites;
        }
    }
}