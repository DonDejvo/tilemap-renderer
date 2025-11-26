import { Camera } from "./Camera";
import { Color } from "./Color";
import { Scene } from "./Scene";
import { ShaderBuilder, VariableType } from "./ShaderBuilder";
import { Tileset } from "./Tileset";
import { WebglRenderer } from "./webgl/WebglRenderer";
import { Webgl2Renderer } from "./webgl2/Webgl2Renderer";
import { WebgpuRenderer } from "./webgpu/WebgpuRenderer";

export const STATIC_LAYER_MAX_SPRITES = 100000;
export const DYNAMIC_LAYER_MAX_SPRITES = 50000;
export const LAYER_LIFETIME = 30;
export const LAYER_MAX_TEXTURES = 16;
export const OFFSCREEN_TEXTURES = 12;
export const MAX_CHANNELS = 8;
export const UNIFORMS_MAX_SIZE = 64;
export const MAX_LIGHTS = 1000;
export const SHADOW_MAX_VERTICES = 3 * 8 * 32;

export const TEXID_SCENE = 3;
export const TEXID_MASK = 1;
export const TEXID_LIGHTMAP = 1;

export const defaultPassStage: RenderPassStage = { shader: "default", inputs: [0], output: -1 };

export const getOffscreenTextureSizeFactor = (idx: number) => {
    return 1 / (1 << Math.max(0, Math.floor((idx - 2) * 0.5)));
}

export interface TextureInfo {
    texture?: WebGLTexture | GPUTexture;
    tileset: Tileset;
    image: TexImageSource;
}

export interface RenderPassStage {
    shader: string;
    inputs: number[];
    output: number;
    uniforms?: ({ name: string; value: number } | { name: string; value: number[] })[];
    clearColor?: Color;
}

export type BlendMode = "none" | "alpha" | "additive" | "multiply" | "screen";
export type RendererType = "webgl" | "webgl2" | "webgpu";

export interface RendererBuilderOptions {
    componentMap: Record<string, string>;
    declareVar: (name: string, type: VariableType, isUniform?: boolean) => string;
}

export const maskClearColor = new Color(0, 0, 0, 1);

export interface ImageInfo {
    name: string;
    image: TexImageSource;
    width: number;
    height: number;
}

export interface Renderer {
    getType(): RendererType;
    addTextures(tilesets: Tileset[], images: Record<string, TexImageSource>): void;
    addImageTextures(images: ImageInfo[]): void;
    init(): Promise<void>;
    render(scene: Scene, camera: Camera): void;
    setSize(width: number, height: number): void;
    getCanvas(): HTMLCanvasElement;
    setClearColor(color: Color): void;
    getBuilderOptions(): RendererBuilderOptions;
    registerShader(name: string, builder: ShaderBuilder, blendMode?: BlendMode): void;
    pass: RenderPassStage[];
}

export const createRenderer = (type: RendererType): Renderer => {
    const canvas = document.createElement("canvas");

    switch (type) {
        case "webgl":
            return new WebglRenderer(canvas);
        case "webgl2":
            return new Webgl2Renderer(canvas);
        case "webgpu":
            return new WebgpuRenderer(canvas);
        default:
            throw new Error("Unknown renderer type");
    }
}