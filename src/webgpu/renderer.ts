import { Camera } from "../camera";
import { createSpritesData, quad } from "../geometry";
import { getImageData } from "../imageUtils";
import { Renderer, TextureInfo } from "../renderer";
import { Scene } from "../scene";
import { Sprite } from "../sprite";
import { SpriteAtlas } from "../sprite-atlas";

interface GPUConfig {
    device: GPUDevice;
    format: GPUTextureFormat;
}

export const requestConfig = async (): Promise<GPUConfig | null> => {
    const adapter = await navigator.gpu?.requestAdapter();
    const device = await adapter?.requestDevice();

    if (!device) return null;

    const format = navigator.gpu.getPreferredCanvasFormat();

    return {
        device,
        format
    };
}

const shaderSource = `
struct VSInput {
    @location(0) vertexPos: vec2f,
    @location(1) texCoord: vec2f,
    
    @location(2) tilePos: vec2f,
    @location(3) tileScale: vec2f,
    @location(4) depth: f32
}

struct Camera {
    projectionMatrix: mat4x4f
}

@group(0) @binding(0)
var<uniform> camera: Camera;

struct VSOutput {
    @builtin(position) pos: vec4f,
    @location(0) texCoord: vec2f,
    @location(1) depth: f32
}

@vertex
fn vs_main(input: VSInput) -> VSOutput {
    var out: VSOutput;

    out.texCoord = input.texCoord;
    out.depth = input.depth;

    let worldPos = input.vertexPos * input.tileScale + input.tilePos;
    out.pos = camera.projectionMatrix * vec4f(worldPos, 0.0, 1.0);

    return out;
}

@group(1) @binding(0)
var spriteSampler: sampler;

@group(1) @binding(1)
var spriteTexture: texture_2d_array<f32>;

@fragment
fn fs_main(input: VSOutput) -> @location(0) vec4f {
    let idx: u32 = u32(input.depth);
    return textureSample(spriteTexture, spriteSampler, input.texCoord, idx);
}
`;

export class WebgpuRenderer implements Renderer {
    private canvas: HTMLCanvasElement;
    private ctx!: GPUCanvasContext;
    private cfg!: GPUConfig;
    private pipeline!: GPURenderPipeline;
    private vbo!: GPUBuffer;
    private layersMap: Map<string, WebgpuRendererLayer>;
    private texturesMap: Map<string, GPUTexture>;
    private cameraBuffer!: GPUBuffer;
    private cameraBindGroup!: GPUBindGroup;
    private sampler!: GPUSampler;

    constructor(canvas: HTMLCanvasElement) {
        this.layersMap = new Map();
        this.texturesMap = new Map();
        this.canvas = canvas;
    }

    async init(texturesInfo: TextureInfo[]) {
        const gpuConfig = await requestConfig();
        if (!gpuConfig) throw new Error("WebGPU not supported");
        this.cfg = gpuConfig;

        const device = this.cfg.device;

        const ctx = this.canvas.getContext("webgpu")!;

        this.ctx = ctx;

        this.ctx.configure(this.cfg);

        for (const texInfo of texturesInfo) {
            if (texInfo.atlas) {
                this.createAtlasTexture(texInfo.atlas, texInfo.name, getImageData(texInfo.imageData));
            }
        }

        const shaderModule = device.createShaderModule({
            code: shaderSource
        });

        this.pipeline = device.createRenderPipeline({
            layout: "auto",
            vertex: {
                module: shaderModule,
                entryPoint: "vs_main",
                buffers: [
                    {
                        arrayStride: 4 * 4,
                        stepMode: "vertex",
                        attributes: [
                            { shaderLocation: 0, offset: 0, format: "float32x2" },
                            { shaderLocation: 1, offset: 2 * 4, format: "float32x2" }
                        ]
                    },
                    {
                        arrayStride: 5 * 4,
                        stepMode: "instance",
                        attributes: [
                            { shaderLocation: 2, offset: 0, format: "float32x2" },
                            { shaderLocation: 3, offset: 2 * 4, format: "float32x2" },
                            { shaderLocation: 4, offset: 4 * 4, format: "float32" }
                        ]
                    }
                ]
            },
            fragment: {
                module: shaderModule,
                entryPoint: "fs_main",
                targets: [{ format: this.cfg.format }]
            },
            primitive: { topology: "triangle-strip" }
        });

        this.cameraBuffer = device.createBuffer({
            size: 4 * 4 * 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        })

        this.cameraBindGroup = device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [{
                binding: 0, resource: { buffer: this.cameraBuffer }
            }]
        });

        this.sampler = device.createSampler({
            magFilter: "nearest",
            minFilter: "nearest"
        });

        this.vbo = device.createBuffer({
            size: quad.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
        });

        device.queue.writeBuffer(this.vbo, 0, quad);
    }

    render(scene: Scene, camera: Camera) {
        const layers: WebgpuRendererLayer[] = [];
        for (const sceneLayer of scene.layers.toSorted((layer1, layer2) => layer1.zIndex - layer2.zIndex)) {
            const key = sceneLayer.getKey();
            if (!this.layersMap.has(key)) {
                const layer = new WebgpuRendererLayer(this, sceneLayer.isStatic, sceneLayer.atlasName);
                this.layersMap.set(key, layer);
            }
            const layer = this.layersMap.get(key)!;
            if (layer.needsUpdate) {
                layer.upload(sceneLayer.sprites);
            }
            layers.push(layer);
        }

        this.cfg.device.queue.writeBuffer(
            this.cameraBuffer,
            0,
            camera.projectionMatrix
        );

        const encoder = this.cfg.device.createCommandEncoder();

        const pass = encoder.beginRenderPass({
            colorAttachments: [{
                clearValue: { r: 0.5, g: 0.5, b: 0.5, a: 1 },
                view: this.ctx.getCurrentTexture().createView(),
                loadOp: "clear",
                storeOp: "store"
            }]
        });
        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, this.cameraBindGroup);
        pass.setVertexBuffer(0, this.vbo);

        for (const layer of layers) {
            layer.render(pass);
        }

        pass.end();

        const commandBuffer = encoder.finish();
        this.cfg.device.queue.submit([commandBuffer]);
    }

    createAtlasTexture(atlas: SpriteAtlas, name: string, imageData: Uint8Array) {
        const tileSize = atlas.tileSize;

        const textureArray = this.cfg.device.createTexture({
            size: {
                width: tileSize,
                height: tileSize,
                depthOrArrayLayers: atlas.totalTiles
            },
            format: "rgba8unorm",
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
        });

        for (let i = 0; i < atlas.totalTiles; ++i) {
            const row = Math.floor(i / atlas.tilesPerRow);
            const col = i % atlas.tilesPerRow;

            const tilePixels = new Uint8Array(tileSize * tileSize * 4);
            for (let j = 0; j < tileSize; ++j) {
                const srcStart = (((row * tileSize + j) * atlas.tilesPerRow + col) * tileSize) * 4;
                const srcEnd = srcStart + tileSize * 4;
                tilePixels.set(imageData.slice(srcStart, srcEnd), j * tileSize * 4);
            }

            this.cfg.device.queue.writeTexture(
                {
                    texture: textureArray,
                    origin: { x: 0, y: 0, z: i }
                },
                tilePixels,
                {
                    bytesPerRow: tileSize * 4,
                    rowsPerImage: tileSize
                },
                {
                    width: tileSize,
                    height: tileSize,
                    depthOrArrayLayers: 1
                }
            );
        }

        this.texturesMap.set(name, textureArray);
    }

    public getConfig() {
        return this.cfg;
    }

    public getTexture(name: string) {
        return this.texturesMap.get(name)!;
    }

    public getPipeline() {
        return this.pipeline;
    }

    public getSampler() {
        return this.sampler;
    }
}

class WebgpuRendererLayer {
    isStatic: boolean;
    texName: string;
    needsUpdate: boolean;
    instanceCount: number;
    private renderer: WebgpuRenderer;
    private instanceBuffer: GPUBuffer;
    private textureBindGroup: GPUBindGroup;

    constructor(renderer: WebgpuRenderer, isStatic: boolean, texName: string) {
        this.renderer = renderer;
        this.isStatic = isStatic;
        this.texName = texName;
        this.needsUpdate = true;
        this.instanceCount = 0;

        this.instanceBuffer = renderer.getConfig().device.createBuffer({
            size: 4 * 4 * (isStatic ? 10000 : 1000),
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
        });

        this.textureBindGroup = renderer.getConfig().device.createBindGroup({
            layout: renderer.getPipeline().getBindGroupLayout(1),
            entries: [
                { binding: 0, resource: renderer.getSampler() },
                {
                    binding: 1, resource: renderer.getTexture(texName).createView()
                }
            ]
        });
    }

    public upload(sprites: Sprite[]) {

        this.renderer.getConfig().device.queue.writeBuffer(this.instanceBuffer, 0, createSpritesData(sprites));

        if (this.isStatic) {
            this.needsUpdate = false;
        }

        this.instanceCount = sprites.length;
    }

    public render(pass: GPURenderPassEncoder) {
        pass.setVertexBuffer(1, this.instanceBuffer);
        pass.setBindGroup(1, this.textureBindGroup);
        pass.draw(4, this.instanceCount);
    }
}