import { Animator } from "./Animator";
import { Collider } from "./Collider";
import { Color } from "./Color";
import { Bounds } from "./bounds";
import { Light } from "./Light";
import { RigidBody } from "./RigidBody";
import { SceneNode } from "./SceneNode";
import { SpatialHashGrid, SpatialHashGridParams } from "./SpatialHashGrid";
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
    colliderHashGrid?: SpatialHashGridParams;
}

export class Scene {
    private nodes: SceneNode[];
    private layers: SceneLayer[];
    public ambientColor: Color;
    public ambientIntensity: number;

    private lights: Light[];
    private colliders: Collider[];
    private rigidBodies: RigidBody[];
    private colliderHashGrid: SpatialHashGrid<Collider>;

    constructor(params: SceneParams = {}) {
        this.nodes = [];
        this.layers = [];
        this.ambientIntensity = 1.0;
        this.ambientColor = new Color(1, 1, 1);
        this.lights = [];
        this.colliders = [];
        this.rigidBodies = [];
        this.colliderHashGrid = new SpatialHashGrid(params.colliderHashGrid || {
            bounds: { min: new Vector(-1000, -1000), max: new Vector(1000, 1000) },
            dimensions: [20, 20]
        });
    }

    public findLayerBySprite(sprite: Sprite) {
        return this.layers.find(layer =>
            layer.isStatic === sprite.isStatic &&
            layer.zIndex === sprite.zIndex);
    }

    public addNode<T extends SceneNode>(node: T): T {
        this.nodes.push(node);
        node.scene = this;
        node.start();
        return node;
    }

    public removeNode(node: SceneNode) {
        const i = this.nodes.indexOf(node);
        if (i !== -1) {
            for (const childNode of node.getNodes()) {
                this.removeNode(childNode);
            }

            node.destroy();
            node.scene = null as any;
            this.nodes.splice(i, 1);
        }
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

                            sprites.push(this.addNode(s));

                            if (tile.animation) {
                                const animator = new Animator(s);

                                animators.push(s.addNode(animator));

                                animator.play([tile.x, tile.y], { repeat: true });
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
                            const h = obj.height * tileHeight / tilemap.tileHeight
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

    public getColliderHashGrid() {
        return this.colliderHashGrid;
    }

    public getColliders(bounds?: Bounds, mask?: number): Collider[] {
        let colliders: Collider[];

        if (bounds) {
            colliders = this.colliderHashGrid.findNearby(bounds).map(client => client.data);
        } else {
            colliders = this.colliders;
        }

        if (mask !== undefined) {
            colliders = colliders.filter(c => (c.layer & mask) !== 0);
        }

        return colliders;
    }

    public getRigidbodies() {
        return this.rigidBodies;
    }

    public findNode(name: string): SceneNode | null {
        for (const node of this.nodes) {
            if (node.name === name) return node;
        }
        return null;
    }

    public syncColliders() {
        for(let collider of this.colliders) {
            collider.calculateWorldPoints();

            const client = collider.getHashGridClient();
            client.bounds = collider.getBounds();
            this.colliderHashGrid.updateClient(client);
        }
    }

    public update(dt: number) {
        for (const node of this.nodes) {
            node.update(dt);
        }
    }

    public fixedUpdate(dt: number) {
        for (const node of this.nodes) {
            node.fixedUpdate(dt);
        }
    }

    public getInfo() {
        const spritesCount = this.layers.reduce((spritesCount, layer) => spritesCount + layer.sprites.length, 0);
        const staticSpritesCount = this.layers.reduce((spritesCount, layer) => spritesCount + layer.sprites.filter(sprite => sprite.isStatic).length, 0);
        const collidersHashGridInfo = this.colliderHashGrid.getInfo();
        return {
            nodes: this.nodes.length,
            lights: this.lights.length,
            colliders: this.colliders.length,
            sprites: spritesCount,
            staticSprites: staticSpritesCount,
            dynamicSprites: spritesCount - staticSpritesCount,
            rigidBodies: this.rigidBodies.length,
            colliderHashGrid: collidersHashGridInfo
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
