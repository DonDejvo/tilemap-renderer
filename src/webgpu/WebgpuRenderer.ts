import { Camera } from "../Camera";
import { Color } from "../Color";
import { geometry } from "../geometry";
import { DYNAMIC_LAYER_MAX_SPRITES, LAYER_LIFETIME, LAYER_MAX_TEXTURES, Renderer, RendererBuilderOptions, STATIC_LAYER_MAX_SPRITES, TextureInfo } from "../Renderer";
import { Scene, SceneLayer } from "../Scene";
import { ShaderBuilder } from "../ShaderBuilder";
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

const mainSource = `
struct VSInput {
    @location(0) vertexPos: vec2f,
    @location(1) texCoord: vec2f,
    
    @location(2) tilePos: vec2f,
    @location(3) tileScale: vec2f,
    @location(4) tileAngle: f32,
    @location(5) tileRegion: vec2u
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

    let c = cos(input.tileAngle);
    let s = sin(input.tileAngle);
    let rotatedPos = vec2f(
        input.vertexPos.x * c - input.vertexPos.y * s,
        input.vertexPos.x * s + input.vertexPos.y * c
    );
    let worldPos = rotatedPos * input.tileScale + input.tilePos;
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

const fullscreenSource = (mainImageBody: string = "") => {
    return `
struct VSInput {
    @location(0) pos: vec2f,
    @location(1) uv: vec2f
}

struct VSOutput {
    @builtin(position) pos: vec4f,
    @location(0) uv: vec2f,
}

@vertex
fn vs_main(input: VSInput) -> VSOutput {
    var out: VSOutput;
    out.pos = vec4f(input.pos, 0.0, 1.0);
    out.uv = input.uv;
    return out;
}

struct Uniforms {
    resolution: vec2f,
    time: f32,
}

@group(0) @binding(0)
var<uniform> uniforms: Uniforms;

@group(1) @binding(0)
var screenSampler: sampler;

@group(1) @binding(1)
var screenTexture: texture_2d<f32>;

fn mainImage(inColor: vec4f, fragCoord: vec2f) -> vec4f {
    var fragColor = inColor;
${mainImageBody.split("\n").map(line => "    " + line).join("\n")}
    return fragColor;
}

@fragment
fn fs_main(input: VSOutput) -> @location(0) vec4f {
    _ = uniforms.resolution.x;
    let fragCoord = input.pos.xy;
    var fragColor = textureSample(screenTexture, screenSampler, input.uv);
    fragColor = mainImage(fragColor, fragCoord);
    return fragColor;
}
`;
}

interface FullscreenShaderInfo {
    module?: GPUShaderModule;
    pipeline?: GPURenderPipeline;
    uniformBuffer?: GPUBuffer;
    uniformBindGroup?: GPUBindGroup;
    textureBindGroup?: GPUBindGroup;
    builder: ShaderBuilder;
}

const builderOptions: RendererBuilderOptions = {
    componentMap: { r: "x", g: "y", b: "z", a: "w" },
    uniformMap: { "$time": "uniforms.time", "$resolution": "uniforms.resolution" },
    declareVar: (name, type, mutable = true) => {
        return `var ${name}: ${type === "float" ? "f32" : type + "f"};`;
    }
};

export class WebgpuRenderer implements Renderer {
    private canvas: HTMLCanvasElement;
    private ctx!: GPUCanvasContext;
    private cfg!: GPUConfig;
    private pipeline!: GPURenderPipeline;
    private vbo!: GPUBuffer;
    private fullscreenVbo!: GPUBuffer;
    private layersMap: Map<SceneLayer, WebgpuRendererLayer>;
    private texturesMap: Map<string, TextureInfo>;
    private cameraBuffer!: GPUBuffer;
    private cameraBindGroup!: GPUBindGroup;
    private sampler!: GPUSampler;
    private clearColor: Color;
    private shaderMap = new Map<string, FullscreenShaderInfo>();
    private offscreenTexture!: GPUTexture;
    private fullscreenSampler!: GPUSampler;
    private activeFullscreenShader!: FullscreenShaderInfo;
    private initialized: boolean;

    constructor(canvas: HTMLCanvasElement) {
        this.layersMap = new Map();
        this.texturesMap = new Map();
        this.canvas = canvas;
        this.clearColor = new Color(0, 0, 0, 0);
        this.shaderMap = new Map();
        this.initialized = false;
    }

    public getBuilderOptions(): RendererBuilderOptions {
        return builderOptions;
    }

    addTextures(tilesets: Tileset[], images: Record<string, TexImageSource>): void {
        for (const tileset of tilesets) {
            if (images[tileset.name]) {
                this.texturesMap.set(tileset.name, {
                    tileset,
                    image: images[tileset.name]
                });
            }
        }
    }

    public addShader(name: string, builder: ShaderBuilder) {
        this.shaderMap.set(name, { builder });
    }

    public setShader(name: string) {
        const shaderInfo = this.shaderMap.get(name);
        if (!shaderInfo) throw new Error(`Shader not found: ${name}`);
        this.activeFullscreenShader = shaderInfo;
    }

    setClearColor(color: Color) {
        this.clearColor.copy(color);
    }

    public setSize(width: number, height: number) {
        this.canvas.width = width;
        this.canvas.height = height;

        if (this.initialized) {
            this.offscreenTexture.destroy();

            this.offscreenTexture = this.cfg.device.createTexture({
                size: { width: this.canvas.width, height: this.canvas.height, depthOrArrayLayers: 1 },
                format: this.cfg.format,
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
            });

            for (const [name, shaderInfo] of this.shaderMap.entries()) {
                shaderInfo.textureBindGroup = this.cfg.device.createBindGroup({
                    label: name + " texture bind group",
                    layout: shaderInfo.pipeline!.getBindGroupLayout(1),
                    entries: [
                        { binding: 0, resource: this.fullscreenSampler },
                        { binding: 1, resource: this.offscreenTexture.createView() }
                    ]
                });
            }
        }
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

        for (const texInfo of this.texturesMap.values()) {
            if (texInfo.tileset) {
                texInfo.texture = this.createTexture(texInfo.tileset, texInfo.image);
            }
        }

        this.offscreenTexture = this.cfg.device.createTexture({
            size: { width: this.canvas.width, height: this.canvas.height, depthOrArrayLayers: 1 },
            format: this.cfg.format,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });

        this.sampler = device.createSampler({
            magFilter: "nearest",
            minFilter: "nearest",
            addressModeU: "clamp-to-edge",
            addressModeV: "clamp-to-edge"
        });

        this.fullscreenSampler = device.createSampler({
            magFilter: "linear",
            minFilter: "linear",
            addressModeU: "clamp-to-edge",
            addressModeV: "clamp-to-edge",
        });

        this.addShader("default", new ShaderBuilder());

        for (const [name, shaderInfo] of this.shaderMap.entries()) {
            const code = fullscreenSource(shaderInfo.builder.build(this));

            const module = device.createShaderModule({
                label: name + " shader module",
                code
            });

            const pipeline = device.createRenderPipeline({
                layout: "auto",
                vertex: {
                    module,
                    entryPoint: "vs_main",
                    buffers: [
                        {
                            arrayStride: 16,
                            stepMode: "vertex",
                            attributes: [
                                { shaderLocation: 0, offset: 0, format: "float32x2" },
                                { shaderLocation: 1, offset: 8, format: "float32x2" }
                            ]
                        }
                    ]
                },
                fragment: {
                    module,
                    entryPoint: "fs_main",
                    targets: [{ format: this.cfg.format }]
                },
                primitive: { topology: "triangle-strip" }
            });

            const uniformBuffer = device.createBuffer({
                size: 16,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
            });

            const uniformBindGroup = device.createBindGroup({
                label: name + " uniform bind group",
                layout: pipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: uniformBuffer } }
                ]
            });

            const textureBindGroup = device.createBindGroup({
                label: name + " texture bind group",
                layout: pipeline.getBindGroupLayout(1),
                entries: [
                    { binding: 0, resource: this.fullscreenSampler },
                    { binding: 1, resource: this.offscreenTexture.createView() }
                ]
            });

            shaderInfo.module = module;
            shaderInfo.pipeline = pipeline;
            shaderInfo.uniformBuffer = uniformBuffer;
            shaderInfo.uniformBindGroup = uniformBindGroup;
            shaderInfo.textureBindGroup = textureBindGroup;
        }

        this.setShader("default");

        const mainModule = device.createShaderModule({
            code: mainSource
        });

        this.pipeline = device.createRenderPipeline({
            layout: "auto",
            vertex: {
                module: mainModule,
                entryPoint: "vs_main",
                buffers: [
                    {
                        arrayStride: 16,
                        stepMode: "vertex",
                        attributes: [
                            { shaderLocation: 0, offset: 0, format: "float32x2" },
                            { shaderLocation: 1, offset: 8, format: "float32x2" }
                        ]
                    },
                    {
                        arrayStride: 28,
                        stepMode: "instance",
                        attributes: [
                            { shaderLocation: 2, offset: 0, format: "float32x2" },
                            { shaderLocation: 3, offset: 8, format: "float32x2" },
                            { shaderLocation: 4, offset: 16, format: "float32" },
                            { shaderLocation: 5, offset: 20, format: "uint32x2" }
                        ]
                    }
                ]
            },
            fragment: {
                module: mainModule,
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

        this.vbo = device.createBuffer({
            size: geometry.quad.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
        });

        device.queue.writeBuffer(this.vbo, 0, geometry.quad);

        this.fullscreenVbo = device.createBuffer({
            size: geometry.fullscreenQuad.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
        });

        device.queue.writeBuffer(this.fullscreenVbo, 0, geometry.fullscreenQuad);
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

        const time = performance.now() * 0.001;
        this.cfg.device.queue.writeBuffer(
            this.activeFullscreenShader.uniformBuffer!,
            0,
            new Float32Array([this.canvas.width, this.canvas.height, time])
        );

        const encoder = this.cfg.device.createCommandEncoder();

        const scenePass = encoder.beginRenderPass({
            colorAttachments: [{
                clearValue: this.clearColor,
                view: this.offscreenTexture.createView(),
                loadOp: "clear",
                storeOp: "store"
            }]
        });
        scenePass.setPipeline(this.pipeline);
        scenePass.setBindGroup(0, this.cameraBindGroup);
        scenePass.setVertexBuffer(0, this.vbo);

        for (const layer of layers) {
            layer.render(scenePass);
        }

        scenePass.end();

        const fullscreenPass = encoder.beginRenderPass({
            colorAttachments: [{
                view: this.ctx.getCurrentTexture().createView(),
                loadOp: "clear",
                storeOp: "store"
            }]
        });

        fullscreenPass.setPipeline(this.activeFullscreenShader.pipeline!);

        fullscreenPass.setBindGroup(0, this.activeFullscreenShader.uniformBindGroup!);
        fullscreenPass.setBindGroup(1, this.activeFullscreenShader.textureBindGroup!);

        fullscreenPass.setVertexBuffer(0, this.fullscreenVbo);
        fullscreenPass.draw(4, 1, 0, 0);
        fullscreenPass.end();

        const commandBuffer = encoder.finish();
        this.cfg.device.queue.submit([commandBuffer]);

        for (const [sceneLayer, rendererLayer] of this.layersMap) {
            if (rendererLayer.lifetime <= 0) {
                rendererLayer.destroy();
                this.layersMap.delete(sceneLayer);
            }
        }
    }

    createTexture(tileset: Tileset, imageData: GPUCopyExternalImageSource) {

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

        return texture;
    }

    createTextureArray(tileset: Tileset, imageData: Uint8Array) {
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

        return texture;
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
                        { binding: 1, resource: (texInfo.texture as GPUTexture).createView() },
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