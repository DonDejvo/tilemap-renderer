import { Camera } from "./Camera";
import { Color } from "./Color";
import { Scene } from "./Scene";
import { Tileset } from "./Tileset";
import { WebglRenderer } from "./webgl/WebglRenderer";
import { Webgl2Renderer } from "./webgl2/Webgl2Renderer";
import { WebgpuRenderer } from "./webgpu/WebgpuRenderer";

export const STATIC_LAYER_MAX_SPRITES = 100000;
export const DYNAMIC_LAYER_MAX_SPRITES = 100000;
export const LAYER_LIFETIME = 30;
export const LAYER_MAX_TEXTURES = 16;

export interface TextureInfo {
    tileset?: Tileset;
    image: TexImageSource;
}

export type RendererType = "webgl" | "webgl2" | "webgpu";

export interface Renderer {
    addTextures(tilesets: Tileset[], images: Record<string, TexImageSource>): void;
    init(): Promise<void>;
    render: (scene: Scene, camera: Camera) => void;
    setSize: (width: number, height: number) => void;
    getCanvas: () => HTMLCanvasElement;
    setClearColor: (color: Color) => void;
}

export const createRenderer = (type: RendererType): Renderer => {
    const canvas = document.createElement("canvas");

    switch(type) {
        case "webgl": 
            return new WebglRenderer(canvas);
        case "webgl2": 
            return new Webgl2Renderer(canvas);
        case "webgpu": 
            return new WebgpuRenderer(canvas);
        default:
            throw new Error("Unknwn renderer type");
    }
}