import { Camera } from "../Camera";
import { Color } from "../Color";
import { geometry } from "../geometry";
import { DYNAMIC_LAYER_MAX_SPRITES, LAYER_LIFETIME, LAYER_MAX_TEXTURES, Renderer, STATIC_LAYER_MAX_SPRITES, TextureInfo } from "../Renderer";
import { Scene, SceneLayer } from "../Scene";
import { Sprite } from "../Sprite";
import { Tileset } from "../Tileset";

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
    @location(4) tileRegion: vec2u
}

struct Camera {
    pos: vec2f,
    viewportDimensions: vec2f
}

@group(0) @binding(0)
var<uniform> camera: Camera;

@group(1) @binding(2)
var<uniform> tilesetDimensions: vec2f;

struct VSOutput {
    @builtin(position) pos: vec4f,
    @location(0) uv: vec2f,
}

@vertex
fn vs_main(input: VSInput) -> VSOutput {
    var out: VSOutput;

    let x = f32(input.tileRegion.x & 0xFFFFu);
    let y = f32(input.tileRegion.x >> 16);
    let w = f32(input.tileRegion.y & 0xFFFFu);
    let h = f32(input.tileRegion.y >> 16);

    let tileRegion = vec4f(x, y, w, h);

    let flippedTexCoord = vec2f(input.texCoord.x, 1.0 - input.texCoord.y);
    out.uv = (tileRegion.xy + flippedTexCoord * tileRegion.zw) / tilesetDimensions;

    let worldPos = input.vertexPos * input.tileScale + input.tilePos;
    let pixelPos = worldPos - camera.pos;
    let clipPos = vec2f(pixelPos.x / camera.viewportDimensions.x, 1.0 - pixelPos.y / camera.viewportDimensions.y) * 2.0 - 1.0;
    out.pos = vec4f(clipPos, 0.0, 1.0);

    return out;
}

@group(1) @binding(0)
var spriteSampler: sampler;

@group(1) @binding(1)
var spriteTexture: texture_2d<f32>;

@fragment
fn fs_main(input: VSOutput) -> @location(0) vec4f {
    return textureSample(spriteTexture, spriteSampler, input.uv);
}
`;

export class WebgpuRenderer implements Renderer {
    private canvas: HTMLCanvasElement;
    private ctx!: GPUCanvasContext;
    private cfg!: GPUConfig;
    private pipeline!: GPURenderPipeline;
    private vbo!: GPUBuffer;
    private layersMap: Map<SceneLayer, WebgpuRendererLayer>;
    private texturesMap: Map<string, { texture: GPUTexture; tileset: Tileset; }>;
    private cameraBuffer!: GPUBuffer;
    private cameraBindGroup!: GPUBindGroup;
    private sampler!: GPUSampler;
    private clearColor: Color;
    private texturesInfo: TextureInfo[];

    constructor(canvas: HTMLCanvasElement) {
        this.layersMap = new Map();
        this.texturesMap = new Map();
        this.canvas = canvas;
        this.clearColor = new Color(0, 0, 0, 0);
        this.texturesInfo = [];
    }

    addTextures(tilesets: Tileset[], images: Record<string, TexImageSource>): void {
        for (const tileset of tilesets) {
            if (images[tileset.name]) {
                this.texturesInfo.push({
                    tileset,
                    image: images[tileset.name]
                });
            }
        }
    }

    setClearColor(color: Color) {
        this.clearColor.copy(color);
    }

    public setSize(width: number, height: number) {
        this.canvas.width = width;
        this.canvas.height = height;
    }

    public getCanvas() {
        return this.canvas;
    }

    public async init() {
        const gpuConfig = await requestConfig();
        if (!gpuConfig) throw new Error("WebGPU not supported");
        this.cfg = gpuConfig;

        const device = this.cfg.device;

        const ctx = this.canvas.getContext("webgpu")!;

        this.ctx = ctx;

        this.ctx.configure(this.cfg);

        for (const texInfo of this.texturesInfo) {
            if (texInfo.tileset) {
                this.createTexture(texInfo.tileset, texInfo.tileset.name, texInfo.image);
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
                        arrayStride: 6 * 4,
                        stepMode: "instance",
                        attributes: [
                            { shaderLocation: 2, offset: 0, format: "float32x2" },
                            { shaderLocation: 3, offset: 2 * 4, format: "float32x2" },
                            { shaderLocation: 4, offset: 4 * 4, format: "uint32x2" }
                        ]
                    }
                ]
            },
            fragment: {
                module: shaderModule,
                entryPoint: "fs_main",
                targets: [
                    {
                        format: this.cfg.format,
                        blend: {
                            color: {
                                srcFactor: "src-alpha",
                                dstFactor: "one-minus-src-alpha",
                                operation: "add"
                            },
                            alpha: {
                                srcFactor: "one",
                                dstFactor: "one-minus-src-alpha",
                                operation: "add"
                            }
                        }
                    }
                ],
            },
            primitive: { topology: "triangle-strip" }
        });

        this.cameraBuffer = device.createBuffer({
            size: 16,
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
            minFilter: "nearest",
            addressModeU: "clamp-to-edge",
            addressModeV: "clamp-to-edge"
        });

        this.vbo = device.createBuffer({
            size: geometry.quad.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
        });

        device.queue.writeBuffer(this.vbo, 0, geometry.quad);
    }

    render(scene: Scene, camera: Camera) {
        const layers: WebgpuRendererLayer[] = [];
        for (const sceneLayer of scene.getLayersOrdered()) {
            if (!this.layersMap.has(sceneLayer)) {
                const layer = new WebgpuRendererLayer(this, sceneLayer.isStatic);
                this.layersMap.set(sceneLayer, layer);
            }
            const layer = this.layersMap.get(sceneLayer)!;
            if (layer.needsUpdate) {
                layer.upload(sceneLayer.getSpritesOrdered());
            }
            layers.push(layer);
        }

        this.cfg.device.queue.writeBuffer(
            this.cameraBuffer,
            0,
            camera.position.toArray()
        );

        this.cfg.device.queue.writeBuffer(
            this.cameraBuffer,
            8,
            new Float32Array([camera.vw, camera.vh])
        );

        const encoder = this.cfg.device.createCommandEncoder();

        const pass = encoder.beginRenderPass({
            colorAttachments: [{
                clearValue: this.clearColor,
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

        for (const [sceneLayer, rendererLayer] of this.layersMap) {
            if (rendererLayer.lifetime <= 0) {
                rendererLayer.destroy();
                this.layersMap.delete(sceneLayer);
            }
        }
    }

    createTexture(tileset: Tileset, name: string, imageData: GPUCopyExternalImageSource) {

        const texture = this.cfg.device.createTexture({
            size: {
                width: tileset.imageWidth,
                height: tileset.imageHeight,
                depthOrArrayLayers: 1
            },
            format: "rgba8unorm",
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
        });

        this.cfg.device.queue.copyExternalImageToTexture

        this.cfg.device.queue.copyExternalImageToTexture(
            { source: imageData },
            { texture },
            [tileset.imageWidth, tileset.imageHeight, 1]
        );

        this.texturesMap.set(name, { texture, tileset });
    }

    createTextureArray(tileset: Tileset, name: string, imageData: Uint8Array) {
        const tileW = tileset.tileWidth, tileH = tileset.tileHeight;

        const texture = this.cfg.device.createTexture({
            size: {
                width: tileW,
                height: tileH,
                depthOrArrayLayers: tileset.tileCount
            },
            format: "rgba8unorm",
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
        });

        for (let i = 0; i < tileset.tileCount; ++i) {
            const row = Math.floor(i / tileset.columns);
            const col = i % tileset.columns;

            const tilePixels = new Uint8Array(tileW * tileH * 4);
            for (let j = 0; j < tileH; ++j) {
                const srcStart = (((row * tileH + j) * tileset.columns + col) * tileW) * 4;
                const srcEnd = srcStart + tileW * 4;
                tilePixels.set(imageData.slice(srcStart, srcEnd), j * tileW * 4);
            }

            this.cfg.device.queue.writeTexture(
                {
                    texture,
                    origin: { x: 0, y: 0, z: i }
                },
                tilePixels,
                {
                    bytesPerRow: tileW * 4,
                    rowsPerImage: tileH
                },
                {
                    width: tileW,
                    height: tileH,
                    depthOrArrayLayers: 1
                }
            );
        }

        this.texturesMap.set(name, { texture, tileset });
    }

    public getConfig() {
        return this.cfg;
    }

    public getTextureInfo(name: string) {
        const texInfo = this.texturesMap.get(name);
        if (!texInfo) throw new Error("Texture not found: " + name);
        return texInfo;
    }

    public getPipeline() {
        return this.pipeline;
    }

    public getSampler() {
        return this.sampler;
    }
}

interface DrawCall {
    texName: string;
    instanceCount: number;
    instanceOffset: number;
}

class WebgpuRendererLayer {
    isStatic: boolean;
    needsUpdate: boolean;
    drawCalls: DrawCall[];
    bindGroups: Map<string, GPUBindGroup>;
    lastTexIdx: number;
    private renderer: WebgpuRenderer;
    private instanceBuffer: GPUBuffer;
    private tilesetDimBuffer: GPUBuffer;
    lifetime: number;

    constructor(renderer: WebgpuRenderer, isStatic: boolean) {
        this.renderer = renderer;
        this.isStatic = isStatic;
        this.needsUpdate = true;
        this.drawCalls = [];
        this.bindGroups = new Map();
        this.lifetime = LAYER_LIFETIME;
        this.lastTexIdx = 0;

        this.instanceBuffer = renderer.getConfig().device.createBuffer({
            label: "Instance Buffer",
            size: 6 * 4 * (isStatic ? STATIC_LAYER_MAX_SPRITES : DYNAMIC_LAYER_MAX_SPRITES),
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
        });

        this.tilesetDimBuffer = renderer.getConfig().device.createBuffer({
            label: "Tileset Dimensions Buffer",
            size: LAYER_MAX_TEXTURES * 256,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
    }

    public upload(sprites: Sprite[]) {
        const device = this.renderer.getConfig().device;
        const pipeline = this.renderer.getPipeline();
        const sampler = this.renderer.getSampler();

        device.queue.writeBuffer(this.instanceBuffer, 0, geometry.createSpritesData(sprites, true));

        if (this.isStatic) {
            this.needsUpdate = false;
        }

        this.drawCalls.length = 0;

        let currentCall: DrawCall | null = null;

        for (let i = 0; i < sprites.length; ++i) {
            const texName = sprites[i].tileset.name;

            if (!currentCall || texName !== currentCall.texName) {
                const texInfo = this.renderer.getTextureInfo(texName);

                device.queue.writeBuffer(
                    this.tilesetDimBuffer,
                    this.lastTexIdx * 256,
                    new Float32Array([texInfo.tileset.imageWidth, texInfo.tileset.imageHeight])
                );

                const bindGroup = device.createBindGroup({
                    layout: pipeline.getBindGroupLayout(1),
                    entries: [
                        { binding: 0, resource: sampler },
                        { binding: 1, resource: texInfo.texture.createView() },
                        {
                            binding: 2,
                            resource: {
                                buffer: this.tilesetDimBuffer,
                                offset: this.lastTexIdx * 256,
                                size: 8
                            }
                        }
                    ],
                });

                currentCall = {
                    texName,
                    instanceOffset: i,
                    instanceCount: 1
                };
                if (!this.bindGroups.has(currentCall.texName)) {
                    this.bindGroups.set(currentCall.texName, bindGroup);
                    ++this.lastTexIdx;
                }
                this.drawCalls.push(currentCall);
            } else {
                currentCall.instanceCount++;
            }
        }
    }

    public render(pass: GPURenderPassEncoder) {
        pass.setVertexBuffer(1, this.instanceBuffer);

        for (const drawCall of this.drawCalls) {
            pass.setBindGroup(1, this.bindGroups.get(drawCall.texName));
            pass.draw(4, drawCall.instanceCount, 0, drawCall.instanceOffset);
        }

        this.lifetime = LAYER_LIFETIME;
    }

    public destroy() {
        this.instanceBuffer.destroy();
        this.tilesetDimBuffer.destroy();
    }
}