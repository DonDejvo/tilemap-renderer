import { Sprite } from "./Sprite";

export class Scene {
    layers: SceneLayer[];

    constructor() {
        this.layers = [];
    }

    public addSprite(sprite: Sprite) {
        let layer = this.layers.find(layer => layer.isLocked === false &&
            layer.isStatic === sprite.isStatic &&
            layer.zIndex === sprite.zIndex &&
            layer.atlasName === sprite.tilesetName);
        if (!layer) {
            layer = new SceneLayer(sprite.zIndex, sprite.isStatic, sprite.tilesetName, false);
            this.layers.push(layer);
        }
        layer.add(sprite);
    }

    public addLayer(layer: SceneLayer) {
        this.layers.push(layer);
    }
}

class SceneLayer {
    zIndex: number;
    isStatic: boolean;
    atlasName: string;
    isLocked: boolean;
    sprites: Sprite[];

    constructor(zIndex: number, isStatic: boolean, atlasName: string, isLocked: boolean) {
        this.zIndex = zIndex;
        this.isStatic = isStatic;
        this.atlasName = atlasName;
        this.isLocked = isLocked;
        this.sprites = [];
    }

    public add(sprite: Sprite) {
        this.sprites.push(sprite);
    }

    public getKey() {
        return `${this.zIndex};${this.isStatic ? "static" : "dynamic"};${this.atlasName}`;
    }
}