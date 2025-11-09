import { Camera } from "./Camera";
import { Color } from "./Color";
import { Scene } from "./Scene";
import { Tileset } from "./Tileset";
import { WebglRenderer } from "./webgl/WebglRenderer";
import { Webgl2Renderer } from "./webgl2/Webgl2Renderer";
import { WebgpuRenderer } from "./webgpu/WebgpuRenderer";

export const STATIC_LAYER_MAX_SPRITES = 10000;
export const DYNAMIC_LAYER_MAX_SPRITES = 10000;

export interface TextureInfo {
    tileset?: Tileset;
    image: Uint8Array | HTMLImageElement | HTMLCanvasElement;
}

export type RendererType = "webgl" | "webgl2" | "webgpu";

export interface Renderer {
    init(texturesInfo: TextureInfo[]): Promise<void>;
    render: (scene: Scene, camera: Camera) => void;
    setSize: (width: number, height: number) => void;
    getCanvas: () => HTMLCanvasElement;
    setClearColor: (color: Color) => void;
}

export const createRenderer = (type: RendererType): Renderer => {
    const canvas = document.createElement("canvas");

    switch(type) {
        case "webgl": return new WebglRenderer(canvas);
        case "webgl2": return new Webgl2Renderer(canvas);
        case "webgpu": return new WebgpuRenderer(canvas);
    }
}