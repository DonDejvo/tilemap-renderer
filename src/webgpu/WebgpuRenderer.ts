import { Camera } from "../Camera";
import { Color } from "../Color";
import { geometry } from "../geometry";
import { math } from "../math";
import { defaultPassStage, DYNAMIC_LAYER_MAX_SPRITES, getOffscreenTextureSizeFactor, LAYER_LIFETIME, LAYER_MAX_TEXTURES, maskClearColor, MAX_CHANNELS, OFFSCREEN_TEXTURES, Renderer, RendererBuilderOptions, RendererType, RenderPassStage, STATIC_LAYER_MAX_SPRITES, TextureInfo, UNIFORMS_MAX_SIZE } from "../Renderer";
import { Scene, SceneLayer } from "../Scene";
import { defaultShaderBuilder, ShaderBuilder, ShaderBuilderOutput } from "../ShaderBuilder";
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

const mainVertex = `
struct VSInput {
    @location(0) vertexPos: vec2f,
    @location(1) texCoord: vec2f,
    
    @location(2) tilePos: vec2f,
    @location(3) tileScale: vec2f,
    @location(4) tileAngle: f32,
    @location(5) tileRegion: vec2u,

    @location(6) maskColor: vec4f
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
    @location(1) maskColor: vec4f
}

@vertex
fn vs_main(input: VSInput) -> VSOutput {
    var out: VSOutput;

    out.maskColor = input.maskColor;

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
}`;

const mainFragment = `

@group(1) @binding(0)
var spriteSampler: sampler;

@group(1) @binding(1)
var spriteTexture: texture_2d<f32>;

@fragment
fn fs_main(input: VSOutput) -> @location(0) vec4f {
    return textureSample(spriteTexture, spriteSampler, input.uv);
}
`;

const maskFragment = `
@group(1) @binding(0)
var spriteSampler: sampler;

@group(1) @binding(1)
var spriteTexture: texture_2d<f32>;

@fragment
fn fs_main(input: VSOutput) -> @location(0) vec4f {
    let texColor: vec4f = textureSample(spriteTexture, spriteSampler, input.uv);
    return vec4f(input.maskColor.xyz, texColor.w * input.maskColor.a);
}
`;

const mainSource = mainVertex + mainFragment;
const maskSource = mainVertex + maskFragment;

const fullscreenSource = (input: ShaderBuilderOutput) => `

struct VSOutput {
    @builtin(position) pos: vec4f,
    @location(0) uv: vec2f
}

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VSOutput {
    var out: VSOutput;

    let x = f32((vertexIndex & 1) << 2);
    let y = f32((vertexIndex & 2) << 1);

    out.uv = vec2f(x, 2.0 - y) / 2.0;
    out.pos = vec4f(x - 1.0, y - 1.0, 0.0, 1.0);
    return out;
}

struct Uniforms {
${input.uniforms.map(line => "    " + line).join(",\n")}
}

@group(0) @binding(0)
var<uniform> uniforms: Uniforms;

@group(1) @binding(0)
var defaultSampler: sampler;

@group(1) @binding(1)
var channel0: texture_2d<f32>;

@group(1) @binding(2)
var channel1: texture_2d<f32>;

@group(1) @binding(3)
var channel2: texture_2d<f32>;

@group(1) @binding(4)
var channel3: texture_2d<f32>;

@group(1) @binding(5)
var channel4: texture_2d<f32>;

@group(1) @binding(6)
var channel5: texture_2d<f32>;

@group(1) @binding(7)
var channel6: texture_2d<f32>;

@group(1) @binding(8)
var channel7: texture_2d<f32>;

fn texture(ch: i32, uv: vec2f) -> vec4f {
    let scaledUV = uv;

    switch (ch) {
        case 1:  { return textureSample(channel1, defaultSampler, scaledUV); }
        case 2:  { return textureSample(channel2, defaultSampler, scaledUV); }
        case 3:  { return textureSample(channel3, defaultSampler, scaledUV); }
        case 4:  { return textureSample(channel4, defaultSampler, scaledUV); }
        case 5:  { return textureSample(channel5, defaultSampler, scaledUV); }
        case 6:  { return textureSample(channel6, defaultSampler, scaledUV); }
        case 7:  { return textureSample(channel7, defaultSampler, scaledUV); }
        default: { return textureSample(channel0, defaultSampler, scaledUV); }
    }
}

fn mainImage(fragCoord: vec2f) -> vec4f {
    var fragColor: vec4f;
${input.mainImage.map(line => "    " + line).join("\n")}
    return fragColor;
}

@fragment
fn fs_main(input: VSOutput) -> @location(0) vec4f {
    let fragCoord = input.uv * uniforms.resolution;
    return mainImage(fragCoord);
}
`;

interface FullscreenShaderInfo {
    pipeline?: GPURenderPipeline;
    uniformBindGroup?: GPUBindGroup;
    uniformBuffer?: GPUBuffer;
    builder: ShaderBuilder;
}

const builderOptions: RendererBuilderOptions = {
    componentMap: { r: "x", g: "y", b: "z", a: "w" },
    declareVar: (name, type, isUniform = false) => {
        const s = `${name}: ${type === "float" ? "f32" : type + "f"}`;
        return isUniform ? s : `var ${s};`;
    }
};

export class WebgpuRenderer implements Renderer {
    private canvas: HTMLCanvasElement;
    private ctx!: GPUCanvasContext;
    private cfg!: GPUConfig;
    private pipeline!: GPURenderPipeline;
    private vbo!: GPUBuffer;
    private layersMap: Map<SceneLayer, WebgpuRendererLayer>;
    private texturesMap: Map<string, TextureInfo>;
    private cameraBuffer!: GPUBuffer;
    private cameraBindGroup!: GPUBindGroup;
    private sampler!: GPUSampler;
    private clearColor: Color;
    private shaderMap = new Map<string, FullscreenShaderInfo>();
    private offscreenTextures: GPUTexture[];
    private fullscreenSampler!: GPUSampler;
    private initialized: boolean;
    public pass: RenderPassStage[];
    private maskPipeline!: GPURenderPipeline;
    private commonBGL!: GPUBindGroupLayout;
    private cameraBGL!: GPUBindGroupLayout;

    constructor(canvas: HTMLCanvasElement) {
        this.layersMap = new Map();
        this.texturesMap = new Map();
        this.canvas = canvas;
        this.clearColor = new Color(0, 0, 0, 0);
        this.shaderMap = new Map();
        this.initialized = false;
        this.pass = [defaultPassStage];
        this.offscreenTextures = [];
    }

    public getType(): RendererType {
        return "webgpu";
    }

    public getBuilderOptions(): RendererBuilderOptions {
        return builderOptions;
    }

    public addTextures(tilesets: Tileset[], images: Record<string, TexImageSource>): void {
        for (const tileset of tilesets) {
            if (images[tileset.name]) {
                this.texturesMap.set(tileset.name, {
                    tileset,
                    image: images[tileset.name]
                });
            }
        }
    }

    public registerShader(name: string, builder: ShaderBuilder) {
        this.shaderMap.set(name, { builder });
    }

    public setClearColor(color: Color) {
        this.clearColor.copy(color);
    }

    public setSize(width: number, height: number) {
        this.canvas.width = width;
        this.canvas.height = height;

        if (this.initialized) {
            this.initOffscreenTextures(OFFSCREEN_TEXTURES);
        }
    }

    public getCanvas() {
        return this.canvas;
    }

    private initOffscreenTextures(count: number) {
        for (let i = 0; i < count; ++i) {
            this.offscreenTextures[i]?.destroy();
            const n = getOffscreenTextureSizeFactor(i)
            this.offscreenTextures[i] = this.cfg.device.createTexture({
                size: { width: this.canvas.width * n, height: this.canvas.height * n, depthOrArrayLayers: 1 },
                format: this.cfg.format,
                usage: GPUTextureUsage.RENDER_ATTACHMENT |
                    GPUTextureUsage.TEXTURE_BINDING,
                label: "offscreen texture " + i
            });
        }
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

        this.initOffscreenTextures(OFFSCREEN_TEXTURES);

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

        this.registerShader("default", defaultShaderBuilder);

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
                    entryPoint: "vs_main"
                },
                fragment: {
                    module,
                    entryPoint: "fs_main",
                    targets: [{ format: this.cfg.format }]
                },
                primitive: { topology: "triangle-strip" }
            });

            const uniformBuffer = device.createBuffer({
                size: UNIFORMS_MAX_SIZE * 4,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
            });

            const uniformBindGroup = device.createBindGroup({
                label: name + " uniform bind group",
                layout: pipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: uniformBuffer } }
                ]
            });

            shaderInfo.pipeline = pipeline;
            shaderInfo.uniformBindGroup = uniformBindGroup;
            shaderInfo.uniformBuffer = uniformBuffer;
        }

        this.commonBGL = this.cfg.device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
                { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
                { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } }
            ]
        });

        this.cameraBGL = this.cfg.device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } }
            ]
        });

        this.pipeline = this.createMainPipeline(mainSource);
        this.maskPipeline = this.createMainPipeline(maskSource);

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
    }

    private createMainPipeline(shaderSource: string) {
        const shaderModule = this.cfg.device.createShaderModule({
            code: shaderSource
        });

        const pipelineLayout = this.cfg.device.createPipelineLayout({
            bindGroupLayouts: [this.cameraBGL, this.commonBGL]
        });

        return this.cfg.device.createRenderPipeline({
            layout: pipelineLayout,
            vertex: {
                module: shaderModule,
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
                        arrayStride: 44,
                        stepMode: "instance",
                        attributes: [
                            { shaderLocation: 2, offset: 0, format: "float32x2" },
                            { shaderLocation: 3, offset: 8, format: "float32x2" },
                            { shaderLocation: 4, offset: 16, format: "float32" },
                            { shaderLocation: 5, offset: 20, format: "uint32x2" },
                            { shaderLocation: 6, offset: 28, format: "float32x4" }
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
    }

    private renderScene(encoder: GPUCommandEncoder, pipeline: GPURenderPipeline, writeTexture: GPUTexture, clearColor: Color, layers: WebgpuRendererLayer[]) {
        const scenePass = encoder.beginRenderPass({
            colorAttachments: [{
                clearValue: clearColor,
                view: writeTexture.createView(),
                loadOp: "clear",
                storeOp: "store"
            }]
        });
        scenePass.setPipeline(pipeline);
        scenePass.setBindGroup(0, this.cameraBindGroup);
        scenePass.setVertexBuffer(0, this.vbo);

        for (const layer of layers) {
            layer.render(scenePass);
        }

        scenePass.end();
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

        this.renderScene(encoder, this.pipeline, this.offscreenTextures[0], this.clearColor, layers);
        this.renderScene(encoder, this.maskPipeline, this.offscreenTextures[1], maskClearColor, layers);

        const time = performance.now() * 0.001;

        for (let i = 0; i < this.pass.length; ++i) {
            const passStage = this.pass[i];

            const shaderInfo = this.shaderMap.get(passStage.shader);
            if (!shaderInfo) {
                throw new Error("Unknown shader " + passStage.shader);
            }

            const entries: GPUBindGroupEntry[] = [
                { binding: 0, resource: this.fullscreenSampler }
            ];

            for (let i = 0; i < MAX_CHANNELS; i++) {
                const texIndex = passStage.inputs[i] ?? passStage.inputs[0];

                const texture = this.offscreenTextures[math.clamp(texIndex, 0, OFFSCREEN_TEXTURES - 1)];

                entries.push({
                    binding: i + 1,
                    resource: texture.createView()
                });
            }

            const outputTex = passStage.output === -1 ?
                this.ctx.getCurrentTexture() :
                this.offscreenTextures[math.clamp(passStage.output, 0, OFFSCREEN_TEXTURES - 1)];

            const uniforms = shaderInfo.builder.getUniforms();
            const stageUniforms = [{ name: "time", value: time }, { name: "resolution", value: [outputTex.width, outputTex.height] }].concat(passStage.uniforms ?? []);
            const uniformData = new Float32Array(UNIFORMS_MAX_SIZE);

            for (let uniform of uniforms) {
                const stageUniform = stageUniforms.find(elem => elem.name === uniform.name);
                if (stageUniform) {
                    const value = typeof stageUniform.value === "number" ? [stageUniform.value] : stageUniform.value;
                    uniformData.set(value, uniform.offset);
                }
            }

            this.cfg.device.queue.writeBuffer(shaderInfo.uniformBuffer!, 0, uniformData);

            // Create the bind group
            const textureBindGroup = this.cfg.device.createBindGroup({
                label: passStage.shader + " texture bind group",
                layout: shaderInfo.pipeline!.getBindGroupLayout(1),
                entries
            });

            const fullscreenPass = encoder.beginRenderPass({
                colorAttachments: [{
                    view: outputTex.createView(),
                    loadOp: "clear",
                    storeOp: "store"
                }]
            });

            fullscreenPass.setPipeline(shaderInfo.pipeline!);

            fullscreenPass.setBindGroup(0, shaderInfo.uniformBindGroup!);
            fullscreenPass.setBindGroup(1, textureBindGroup);

            fullscreenPass.draw(3);
            fullscreenPass.end();
        }

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