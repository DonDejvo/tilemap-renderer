import { Camera } from "../Camera";
import { Color } from "../Color";
import { getHeight, getWidth, overlaps } from "../bounds";
import { geometry } from "../geometry";
import { LineRenderer } from "../LineRenderer";
import { math } from "../math";
import { BlendMode, defaultPass, DYNAMIC_LAYER_MAX_SPRITES, getOffscreenTextureSizeFactor, GPUTimer, LAYER_LIFETIME, maskClearColor, MAX_CHANNELS, MAX_LIGHTS, OFFSCREEN_TEXTURES, Renderer, RendererBuilderOptions, RendererType, RenderPass, SHADOW_MAX_VERTICES, STATIC_LAYER_MAX_SPRITES, TEXID_LIGHTMAP, TEXID_MASK, TEXID_SCENE, TextureInfo, UNIFORMS_MAX_SIZE } from "../Renderer";
import { Scene, SceneLayer } from "../Scene";
import { ShaderBuilder, ShaderBuilderOutput, shaders } from "../ShaderBuilder";
import { Sprite } from "../Sprite";
import { Tileset } from "../Tileset";
import { GPUConfig, requestConfig, worldToClipVertex } from "./common";
import { WebgpuGPUTimer } from "./WebgpuGPUTimer";
import { WebgpuLineRendrer } from "./WebgpuLineRenderer";

const mainVertex = `
struct VSInput {
    @location(0) vertexPos: vec2f,
    @location(1) texCoord: vec2f,
    
    @location(2) tilePos: vec2f,
    @location(3) tileScale: vec2f,
    @location(4) tileAngle: f32,
    @location(5) tileRegion: vec2u,

    @location(6) tintColor: vec4f,
    @location(7) maskColor: vec4f,

    @location(8) tileOffset: vec2f
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
    @location(1) tintColor: vec4f,
    @location(2) maskColor: vec4f
}

${worldToClipVertex}

@vertex
fn vs_main(input: VSInput) -> VSOutput {
    var out: VSOutput;

    out.tintColor = input.tintColor;
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
    let offsetPos = (input.vertexPos * abs(input.tileScale) + input.tileOffset) * sign(input.tileScale);
    let rotatedPos = vec2f(
        offsetPos.x * c - offsetPos.y * s,
        offsetPos.x * s + offsetPos.y * c
    );
    let worldPos = rotatedPos + input.tilePos;

    out.pos = worldToClip(worldPos, camera.pos, camera.viewportDimensions);
    return out;
}`;

const mainFragment = `

@group(1) @binding(0)
var spriteSampler: sampler;

@group(1) @binding(1)
var spriteTexture: texture_2d<f32>;

@fragment
fn fs_main(input: VSOutput) -> @location(0) vec4f {
    return textureSample(spriteTexture, spriteSampler, input.uv) * input.tintColor;
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

const lightSource = `
struct VSInput {
    @location(0) pos: vec2f
}

struct VSOutput {
    @builtin(position) pos: vec4f,
    @location(0) worldPos: vec2f
}

struct Camera {
    pos: vec2f,
    viewportDimensions: vec2f
}

struct Light {
    center: vec2f,
    radius: f32,
    color: vec3f,
    intensity: f32,
    direction: vec2f,
    outerCutoff: f32,
    innerCutoff: f32
}

@group(0) @binding(0)
var<uniform> camera: Camera;

@group(1) @binding(0)
var<uniform> light: Light;

${worldToClipVertex}

@vertex
fn vs_main(input: VSInput) -> VSOutput {
    var out: VSOutput;

    out.worldPos = light.center + (input.pos - 0.5) * 2.0 * light.radius;

    out.pos = worldToClip(out.worldPos, camera.pos, camera.viewportDimensions);
    return out;
}

@fragment
fn fs_main(input: VSOutput) -> @location(0) vec4f {
    let toPixel = input.worldPos - light.center;
    let dist = length(toPixel);

    let attenuation = clamp(1.0 - pow(dist / light.radius, 2.0), 0.0, 1.0);

    var spotFactor = 1.0;
    if (light.outerCutoff > 0.0) {
        let cosAngle = dot(normalize(toPixel), normalize(light.direction));
        spotFactor = smoothstep(
            light.outerCutoff,
            light.innerCutoff,
            cosAngle
        );
    }

    return vec4f(light.color * light.intensity * attenuation * spotFactor, 1.0);
}
`;

const shadowSource = `
struct VSInput {
    @location(0) pos: vec2f
}

struct VSOutput {
    @builtin(position) pos: vec4f
}

struct Camera {
    pos: vec2f,
    viewportDimensions: vec2f
}

@group(0) @binding(0)
var<uniform> camera: Camera;

${worldToClipVertex}

@vertex
fn vs_main(input: VSInput) -> VSOutput {
    var out: VSOutput;

    out.pos = worldToClip(input.pos, camera.pos, camera.viewportDimensions);
    return out;
}

@fragment
fn fs_main(input: VSOutput) {
}
`;

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

${input.functions.join("\n\n")}

@fragment
fn fs_main(input: VSOutput) -> @location(0) vec4f {
    let fragCoord = input.uv * uniforms.resolution;
    return mainImage(fragCoord);
}
`;

interface FullscreenShaderInfo {
    pipeline?: GPURenderPipeline;
    builder: ShaderBuilder;
    blendMode: BlendMode;
}

const builderOptions: RendererBuilderOptions = {
    componentMap: { r: "x", g: "y", b: "z", a: "w" },
    replaceType(type) {
        return `${type === "float" ? "f32" : type + "<f32>"}`;
    },
    declareFn(name, returnType, ...args) {
        return `fn ${name}(${args.map(arg => `${arg[0]}: ${this.replaceType(arg[1])}`).join(", ")}) ${returnType !== null ? "-> " + this.replaceType(returnType) : ""}`;
    },
    declareVar(name, type, isUniform = false) {
        const s = `${name}: ${this.replaceType(type)}`;
        return isUniform ? s : `var ${s};`;
    }
};

export class WebgpuRenderer implements Renderer {
    private canvas: HTMLCanvasElement;
    private ctx!: GPUCanvasContext;
    private cfg!: GPUConfig;
    private mainPipeline!: GPURenderPipeline;
    private vbo!: GPUBuffer;
    private layersMap: Map<SceneLayer, WebgpuRendererLayer>;
    private texturesMap: Map<string, TextureInfo>;
    private cameraBuffer!: GPUBuffer;
    private cameraBindGroup!: GPUBindGroup;
    private sampler!: GPUSampler;
    public clearColor: Color;
    private shaderMap = new Map<string, FullscreenShaderInfo>();
    private offscreenTextures: { texture: GPUTexture, view: GPUTextureView }[];
    private fullscreenSampler!: GPUSampler;
    private initialized: boolean;
    public pipeline: RenderPass[];
    private maskPipeline!: GPURenderPipeline;
    private commonBGL!: GPUBindGroupLayout;
    private cameraBGL!: GPUBindGroupLayout;
    private lightBGL!: GPUBindGroupLayout;
    private time: number;
    private lightPipeline!: GPURenderPipeline;
    private shadowPipeline!: GPURenderPipeline;
    private lightUniformBindGroup!: GPUBindGroup;
    private lightUniformBuffer!: GPUBuffer;
    private shadowsVbo!: GPUBuffer;
    private lightStencilTexture!: { texture: GPUTexture, view: GPUTextureView };
    private shaderCache: Map<ShaderBuilder, GPUShaderModule>;
    private renderPassUniformMap: Map<RenderPass, { ubo: GPUBuffer, uniformBindGroup: GPUBindGroup, textureBindGroup: GPUBindGroup }>;
    private fullscreenPasses: {
        lightAdditive: RenderPass;
    };
    private resizeRequested: boolean;
    private lineRenderer!: WebgpuLineRendrer;
    private textureDimBuffer!: GPUBuffer;
    private nextTextureIdx: number = 0;
    private spriteBindGroups: Map<string, GPUBindGroup> = new Map();
    private gpuTimer!: WebgpuGPUTimer;

    constructor(canvas: HTMLCanvasElement) {
        this.layersMap = new Map();
        this.texturesMap = new Map();
        this.canvas = canvas;
        this.clearColor = new Color(0, 0, 0, 0);
        this.shaderMap = new Map();
        this.initialized = false;
        this.pipeline = [defaultPass];
        this.offscreenTextures = [];
        this.time = 0;
        this.shaderCache = new Map();
        this.renderPassUniformMap = new Map();
        this.fullscreenPasses = {
            lightAdditive: { shader: "default_additive", inputs: [TEXID_LIGHTMAP + 1], output: TEXID_LIGHTMAP }
        };
        this.resizeRequested = false;
    }

    public getGpuTimer(): GPUTimer {
        return this.gpuTimer;
    }

    public getLineRenderer(): LineRenderer {
        return this.lineRenderer;
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
                    image: images[tileset.name],
                    idx: this.nextTextureIdx++
                });
            }
        }
    }

    public registerShader(name: string, builder: ShaderBuilder, blendMode: BlendMode = "none") {
        this.shaderMap.set(name, { builder, blendMode });
    }

    public setSize(width: number, height: number) {
        this.canvas.width = width;
        this.canvas.height = height;

        if (this.initialized) {
            this.resizeRequested = true;
        }
    }

    public getCanvas() {
        return this.canvas;
    }

    private initTextures() {
        for (const texInfo of this.texturesMap.values()) {
            if (texInfo.tileset) {
                texInfo.texture = this.createTexture(texInfo.tileset, texInfo.image);
                texInfo.view = ((texInfo.texture) as GPUTexture).createView();
                this.cfg.device.queue.writeBuffer(
                    this.textureDimBuffer,
                    texInfo.idx * 256,
                    new Float32Array([texInfo.tileset.imageWidth, texInfo.tileset.imageHeight])
                );
            }
        }
    }

    private initOffscreenTextures() {
        for (let i = 0; i < OFFSCREEN_TEXTURES; ++i) {
            this.offscreenTextures[i]?.texture.destroy();
            const n = getOffscreenTextureSizeFactor(i);
            const width = Math.ceil(this.canvas.width * n);
            const height = Math.ceil(this.canvas.height * n);
            const texture = this.cfg.device.createTexture({
                size: { width, height, depthOrArrayLayers: 1 },
                format: this.cfg.format,
                usage: GPUTextureUsage.RENDER_ATTACHMENT |
                    GPUTextureUsage.TEXTURE_BINDING,
                label: "Offscreen Texture " + i + " - " + width + "x" + height
            });
            this.offscreenTextures[i] = { texture, view: texture.createView() };
        }
        this.lightStencilTexture?.texture.destroy();
        const stencilTexture = this.cfg.device.createTexture({
            size: [this.canvas.width, this.canvas.height],
            format: 'stencil8',
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        });
        this.lightStencilTexture = { texture: stencilTexture, view: stencilTexture.createView() };
        for (let [pass, info] of this.renderPassUniformMap) {
            info.textureBindGroup = this.renderPassCreateTextureBindGroup(pass);
        }
    }

    private setScissor(pass: GPURenderPassEncoder, outTex: GPUTexture, rect: [number, number, number, number]) {
        const x = math.clamp(rect[0], 0, outTex.width);
        const y = math.clamp(rect[1], 0, outTex.height);
        const width = math.clamp(rect[2], 0, outTex.width - x);
        const height = math.clamp(rect[3], 0, outTex.height - y);
        pass.setScissorRect(x, y, width, height);
    }

    private getBlendOptions(blendMode: BlendMode): GPUBlendState | undefined {
        switch (blendMode) {
            case "alpha": return {
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
            };
            case "additive": return {
                color: {
                    srcFactor: "one",
                    dstFactor: "one",
                    operation: "add"
                },
                alpha: {
                    srcFactor: "zero",
                    dstFactor: "one",
                    operation: "add"
                }
            };
            default: return undefined;
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

        this.textureDimBuffer = this.cfg.device.createBuffer({
            label: "Texture Dimensions Buffer",
            size: 256 * 256,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        this.initTextures();

        this.initOffscreenTextures();

        this.sampler = device.createSampler({
            label: "Sprite Sampler",
            magFilter: "nearest",
            minFilter: "nearest",
            addressModeU: "clamp-to-edge",
            addressModeV: "clamp-to-edge"
        });

        this.fullscreenSampler = device.createSampler({
            label: "Fullscreen Sampler",
            magFilter: "linear",
            minFilter: "linear",
            addressModeU: "clamp-to-edge",
            addressModeV: "clamp-to-edge",
        });

        for (let shader of shaders) {
            this.registerShader(shader.name, shader.builder, shader.blendMode);
        }

        for (const [name, shaderInfo] of this.shaderMap.entries()) {

            if (!this.shaderCache.has(shaderInfo.builder)) {
                const code = fullscreenSource(shaderInfo.builder.build(this));
                const module = device.createShaderModule({
                    label: "Fullscreen Shader Module \"" + name + "\"",
                    code
                });
                this.shaderCache.set(shaderInfo.builder, module);
            }

            const module = this.shaderCache.get(shaderInfo.builder)!;

            const pipeline = device.createRenderPipeline({
                label: "Fullscreen Pipeline \"" + name + "\"",
                layout: "auto",
                vertex: {
                    module,
                    entryPoint: "vs_main"
                },
                fragment: {
                    module,
                    entryPoint: "fs_main",
                    targets: [{
                        format: this.cfg.format,
                        blend: this.getBlendOptions(shaderInfo.blendMode)
                    }]
                },
                primitive: { topology: "triangle-strip" }
            });

            shaderInfo.pipeline = pipeline;
        }

        this.commonBGL = this.cfg.device.createBindGroupLayout({
            label: "Common Bind Group Layout",
            entries: [
                { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
                { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
                { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } }
            ]
        });
        this.cameraBGL = this.cfg.device.createBindGroupLayout({
            label: "Camera Bind Group Layout",
            entries: [
                { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } }
            ]
        });
        this.lightBGL = this.cfg.device.createBindGroupLayout({
            label: "Light Bind Group Layout",
            entries: [
                { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform", hasDynamicOffset: true } }
            ]
        });

        this.mainPipeline = this.createMainPipeline(mainSource, "Main");
        this.maskPipeline = this.createMainPipeline(maskSource, "Mask");

        this.lightUniformBuffer = this.cfg.device.createBuffer({
            label: "Light Uniform Buffer",
            size: MAX_LIGHTS * 256,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        const lightPipelineLayout = this.cfg.device.createPipelineLayout({
            label: "Light Pipeline Layout",
            bindGroupLayouts: [this.cameraBGL, this.lightBGL],
        });
        const lightShaderModule = this.cfg.device.createShaderModule({
            label: "Light Shader Module",
            code: lightSource
        });
        this.lightPipeline = this.cfg.device.createRenderPipeline({
            label: "Light Pipeline",
            layout: lightPipelineLayout,
            vertex: {
                module: lightShaderModule,
                entryPoint: "vs_main",
                buffers: [
                    {
                        arrayStride: 16,
                        attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }]
                    }
                ]
            },
            fragment: {
                module: lightShaderModule,
                entryPoint: "fs_main",
                targets: [{
                    format: this.cfg.format
                }],
            },
            primitive: { topology: "triangle-strip" },
            depthStencil: {
                format: 'stencil8',
                depthWriteEnabled: false,
                stencilFront: {
                    compare: 'equal',
                    failOp: 'keep',
                    depthFailOp: 'keep',
                    passOp: 'keep',
                },
                stencilBack: {
                    compare: 'equal',
                    failOp: 'keep',
                    depthFailOp: 'keep',
                    passOp: 'keep',
                },
                stencilReadMask: 0xFF,
                stencilWriteMask: 0x00,
            },
        });

        this.lightUniformBindGroup = this.cfg.device.createBindGroup({
            label: "Light Uniform Bind Group",
            layout: this.lightPipeline.getBindGroupLayout(1),
            entries: [{ binding: 0, resource: { buffer: this.lightUniformBuffer, size: geometry.lightStride } }]
        });

        const shadowPipelineLayot = this.cfg.device.createPipelineLayout({
            label: "Shadow Pipeline Layout",
            bindGroupLayouts: [this.cameraBGL]
        });
        const shadowShaderModule = this.cfg.device.createShaderModule({
            label: "Shadow Shader Module",
            code: shadowSource
        });
        this.shadowPipeline = this.cfg.device.createRenderPipeline({
            label: "Shadow Pipeline",
            layout: shadowPipelineLayot,
            vertex: {
                module: shadowShaderModule,
                entryPoint: "vs_main",
                buffers: [
                    {
                        arrayStride: 8,
                        attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }]
                    }
                ]
            },
            fragment: {
                module: shadowShaderModule,
                entryPoint: "fs_main",
                targets: [{ format: this.cfg.format, writeMask: 0 }],
            },
            depthStencil: {
                format: "stencil8",
                depthWriteEnabled: false,
                stencilFront: {
                    compare: 'always',
                    failOp: 'keep',
                    depthFailOp: 'keep',
                    passOp: 'replace',
                },
                stencilBack: {
                    compare: 'always',
                    failOp: 'keep',
                    depthFailOp: 'keep',
                    passOp: 'replace',
                },
                stencilReadMask: 0xFF,
                stencilWriteMask: 0xFF,
            }
        });

        this.cameraBuffer = device.createBuffer({
            label: "Camera Uniform Buffer",
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        })

        this.cameraBindGroup = device.createBindGroup({
            label: "Camera Uniform Bind Group",
            layout: this.mainPipeline.getBindGroupLayout(0),
            entries: [{
                binding: 0, resource: { buffer: this.cameraBuffer }
            }]
        });

        this.vbo = device.createBuffer({
            label: "Quad Vertex Buffer",
            size: geometry.quad.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
        });

        device.queue.writeBuffer(this.vbo, 0, geometry.quad);

        this.shadowsVbo = this.cfg.device.createBuffer({
            label: "Shadows Vertex Buffer",
            size: MAX_LIGHTS * SHADOW_MAX_VERTICES * 8,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
        });

        this.lineRenderer = new WebgpuLineRendrer(ctx, this.cfg);
        this.lineRenderer.init();

        this.gpuTimer = new WebgpuGPUTimer(this.cfg);

        this.initialized = true;
    }

    private createMainPipeline(shaderSource: string, label: string) {
        const shaderModule = this.cfg.device.createShaderModule({
            label: label + " Shader Module",
            code: shaderSource
        });

        const pipelineLayout = this.cfg.device.createPipelineLayout({
            label: label + " Pipeline Layout",
            bindGroupLayouts: [this.cameraBGL, this.commonBGL]
        });

        return this.cfg.device.createRenderPipeline({
            label: label + " Pipeline",
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
                        arrayStride: geometry.spriteStride,
                        stepMode: "instance",
                        attributes: [
                            { shaderLocation: 2, offset: 0, format: "float32x2" },
                            { shaderLocation: 3, offset: 8, format: "float32x2" },
                            { shaderLocation: 4, offset: 16, format: "float32" },
                            { shaderLocation: 5, offset: 20, format: "uint32x2" },
                            { shaderLocation: 6, offset: 28, format: "float32x4" },
                            { shaderLocation: 7, offset: 44, format: "float32x4" },
                            { shaderLocation: 8, offset: 60, format: "float32x2" }
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
                        blend: this.getBlendOptions("alpha")
                    }
                ],
            },
            primitive: { topology: "triangle-strip" }
        });
    }

    private renderScene(encoder: GPUCommandEncoder, pipeline: GPURenderPipeline, view: GPUTextureView, clearColor: Color | null, layers: WebgpuRendererLayer[]) {
        const scenePassDescriptor: GPURenderPassDescriptor = {
            colorAttachments: [{
                clearValue: clearColor || undefined,
                view,
                loadOp: clearColor ? "clear" : "load",
                storeOp: "store"
            }]
        };

        const scenePass = encoder.beginRenderPass(scenePassDescriptor);
        scenePass.setPipeline(pipeline);
        scenePass.setBindGroup(0, this.cameraBindGroup);
        scenePass.setVertexBuffer(0, this.vbo);

        for (const layer of layers) {
            layer.render(scenePass);
        }

        scenePass.end();
    }

    private renderLights(encoder: GPUCommandEncoder, scene: Scene, camera: Camera) {
        const cameraBounds = camera.getBounds();
        const sceneLights = scene.getLights().filter(light => {
            return overlaps(cameraBounds, light.getBounds());
        });
        const sceneColliders = scene.getColliders(cameraBounds).filter(c => c.castShadow);
        for (let i = 0; i < sceneColliders.length; ++i) {
            sceneColliders[i]._index = i;
        }

        const shadowVertices: number[] = [];
        const shadowsDrawCalls: { offset: number; count: number; }[] = [];
        let offset = 0;
        for (let light of sceneLights) {
            const lightColliderIndices = scene.getColliders(light.getBounds())
                .map(c => c._index)
                .filter(idx => idx !== null);
            const newOffset = geometry.createShadowsGeometry(shadowVertices, light, lightColliderIndices, sceneColliders, offset);
            shadowsDrawCalls.push({ count: (newOffset - offset) / 2, offset: offset / 2 });
            offset = newOffset;
        }

        this.cfg.device.queue.writeBuffer(this.shadowsVbo, 0, new Float32Array(shadowVertices));

        const clearColor = new Color(
            scene.ambientColor.r * scene.ambientIntensity,
            scene.ambientColor.g * scene.ambientIntensity,
            scene.ambientColor.b * scene.ambientIntensity,
            1.0
        );

        const lightAmbientPassDescriptor: GPURenderPassDescriptor = {
            colorAttachments: [{
                view: this.offscreenTextures[TEXID_LIGHTMAP].view,
                clearValue: clearColor,
                loadOp: "clear",
                storeOp: "store"
            }]
        };
        const lightAmbientPass = encoder.beginRenderPass(lightAmbientPassDescriptor);
        lightAmbientPass.end();

        const lightsUniformData = geometry.createLightsGeometry(sceneLights, true);
        this.cfg.device.queue.writeBuffer(this.lightUniformBuffer, 0, lightsUniformData);

        const texView = this.offscreenTextures[TEXID_LIGHTMAP + 1].view;

        for (let i = 0; i < sceneLights.length; ++i) {
            const shadowDrawCall = shadowsDrawCalls[i];

            const lightBounds = sceneLights[i].getBounds();

            const lightScissor: [number, number, number, number] = [
                lightBounds.min.x - cameraBounds.min.x,
                lightBounds.min.y - cameraBounds.min.y,
                getWidth(lightBounds),
                getHeight(lightBounds)
            ];

            const lightPassDescriptor: GPURenderPassDescriptor = {
                colorAttachments: [{
                    view: texView,
                    clearValue: new Color(0, 0, 0, 1),
                    loadOp: "clear",
                    storeOp: "store"
                }],
                depthStencilAttachment: {
                    view: this.lightStencilTexture.view,
                    stencilLoadOp: 'clear',
                    stencilStoreOp: 'store',
                    stencilClearValue: 0,
                }
            };
            const lightPass = encoder.beginRenderPass(lightPassDescriptor);

            this.setScissor(lightPass, this.offscreenTextures[TEXID_LIGHTMAP + 1].texture, lightScissor);

            if (shadowDrawCall.count !== 0) {
                lightPass.setPipeline(this.shadowPipeline);
                lightPass.setStencilReference(1);
                lightPass.setVertexBuffer(0, this.shadowsVbo);
                lightPass.setBindGroup(0, this.cameraBindGroup);
                lightPass.draw(shadowDrawCall.count, 1, shadowDrawCall.offset);
            }

            lightPass.setPipeline(this.lightPipeline);
            lightPass.setStencilReference(0);
            lightPass.setVertexBuffer(0, this.vbo);
            lightPass.setBindGroup(0, this.cameraBindGroup);
            lightPass.setBindGroup(1, this.lightUniformBindGroup, [i * 256]);
            lightPass.draw(4);

            lightPass.end();

            this.fullscreenPasses.lightAdditive.scissor = lightScissor;

            this.renderFullscreenPass(encoder, this.fullscreenPasses.lightAdditive);
        }

        for (let i = 0; i < sceneColliders.length; ++i) {
            sceneColliders[i]._index = null;
        }
    }

    private renderPassCreateTextureBindGroup(pass: RenderPass) {
        const shaderInfo = this.shaderMap.get(pass.shader);
        if (!shaderInfo) {
            throw new Error("Unknown shader " + pass.shader);
        }

        const entries: GPUBindGroupEntry[] = [
            { binding: 0, resource: this.fullscreenSampler }
        ];
        for (let i = 0; i < MAX_CHANNELS; i++) {
            const texIndex = pass.inputs[i] ?? pass.inputs[0];

            const texture = this.offscreenTextures[math.clamp(texIndex, 0, OFFSCREEN_TEXTURES - 1)];

            entries.push({
                binding: i + 1,
                resource: texture.view
            });
        }
        const textureBindGroup = this.cfg.device.createBindGroup({
            label: "Render Pass \"" + pass.shader + "\" - Texture Bind Group",
            layout: shaderInfo.pipeline!.getBindGroupLayout(1),
            entries
        });

        return textureBindGroup;
    }

    private renderFullscreenPass(encoder: GPUCommandEncoder, pass: RenderPass) {
        const shaderInfo = this.shaderMap.get(pass.shader);
        if (!shaderInfo) {
            throw new Error("Unknown shader " + pass.shader);
        }

        let outputTex: { texture: GPUTexture, view: GPUTextureView };
        if (pass.output === -1) {
            const canvasTexture = this.ctx.getCurrentTexture();
            outputTex = { texture: canvasTexture, view: canvasTexture.createView() };
        } else {
            outputTex = this.offscreenTextures[math.clamp(pass.output, 0, OFFSCREEN_TEXTURES - 1)];
        }

        const uniforms = shaderInfo.builder.getUniforms();
        const passUniforms = [{ name: "time", value: this.time }, { name: "resolution", value: [outputTex.texture.width, outputTex.texture.height] }].concat(pass.uniforms ?? []);
        const uniformData = new Float32Array(UNIFORMS_MAX_SIZE);

        for (let uniform of uniforms) {
            const passUniform = passUniforms.find(elem => elem.name === uniform.name);
            if (passUniform) {
                const value = typeof passUniform.value === "number" ? [passUniform.value] : passUniform.value;
                uniformData.set(value, uniform.offset);
            }
        }

        if (!this.renderPassUniformMap.has(pass)) {
            const ubo = this.cfg.device.createBuffer({
                label: "Render Pass \"" + pass.shader + "\" - Uniform Buffer",
                size: 256,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
            });
            const uniformBindGroup = this.cfg.device.createBindGroup({
                label: "Render Pass \"" + pass.shader + "\" - Uniform Bind Group",
                layout: shaderInfo.pipeline!.getBindGroupLayout(0),
                entries: [{ binding: 0, resource: { buffer: ubo } }]
            });
            const textureBindGroup = this.renderPassCreateTextureBindGroup(pass);

            this.renderPassUniformMap.set(pass, { ubo, uniformBindGroup, textureBindGroup });
        }

        const uniformsInfo = this.renderPassUniformMap.get(pass)!;
        this.cfg.device.queue.writeBuffer(uniformsInfo.ubo, 0, uniformData);

        const fullscreenPassDescriptor: GPURenderPassDescriptor = {
            colorAttachments: [{
                view: outputTex.view,
                loadOp: pass.clearColor ? "clear" : "load",
                clearValue: pass.clearColor,
                storeOp: "store"
            }]
        };
        const fullscreenPass = encoder.beginRenderPass(fullscreenPassDescriptor);

        if (pass.scissor) {
            this.setScissor(fullscreenPass, outputTex.texture, pass.scissor);
        }

        fullscreenPass.setPipeline(shaderInfo.pipeline!);

        fullscreenPass.setBindGroup(0, uniformsInfo.uniformBindGroup);
        fullscreenPass.setBindGroup(1, uniformsInfo.textureBindGroup);

        fullscreenPass.draw(3);
        fullscreenPass.end();
    }

    public render(scene: Scene, camera: Camera) {
        if (!this.initialized) {
            throw new Error("Renderer is not initialized");
        }

        if (this.resizeRequested) {
            this.initOffscreenTextures();
            this.resizeRequested = false;
        }

        const cameraBounds = camera.getBounds();
        this.time = performance.now() * 0.001;

        const encoder = this.cfg.device.createCommandEncoder();

        if (this.gpuTimer.isEnabled()) {
            this.gpuTimer.begin(encoder);
        }

        const layers: WebgpuRendererLayer[] = [];
        for (const sceneLayer of scene.getLayersOrdered()) {
            if (!this.layersMap.has(sceneLayer)) {
                const layer = new WebgpuRendererLayer(this, sceneLayer.isStatic);
                this.layersMap.set(sceneLayer, layer);
            }
            const layer = this.layersMap.get(sceneLayer)!;
            if (layer.needsUpdate) {
                let sprites = sceneLayer.getSpritesOrdered();
                if (!layer.isStatic) {
                    sprites = sprites.filter(sprite => overlaps(cameraBounds, sprite.getBounds()))
                }
                layer.uploadSprites(sprites);
            }
            layers.push(layer);
        }

        this.cfg.device.queue.writeBuffer(
            this.cameraBuffer,
            0,
            new Float32Array([
                camera.position.x, camera.position.y,
                camera.vw, camera.vh
            ])
        );

        this.renderLights(encoder, scene, camera);
        this.renderScene(encoder, this.mainPipeline, this.offscreenTextures[TEXID_SCENE].view, this.clearColor, layers);
        this.renderScene(encoder, this.maskPipeline, this.offscreenTextures[TEXID_MASK].view, maskClearColor, layers);

        for (const pass of this.pipeline) {
            this.renderFullscreenPass(encoder, pass);
        }

        this.lineRenderer.render(encoder, camera);
        this.lineRenderer.clear();

        if (this.gpuTimer.isEnabled()) {
            this.gpuTimer.end(encoder);
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
            label: "Tileset \"" + tileset.name + "\" Texture",
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

    public getMainPipeline() {
        return this.mainPipeline;
    }

    public getSampler() {
        return this.sampler;
    }

    public getTextureDimBuffer() {
        return this.textureDimBuffer;
    }

    public getSpriteBindGroups() {
        return this.spriteBindGroups;
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
    bindGroups: Map<string, GPUBindGroup> = new Map();
    lastTexIdx: number;
    private renderer: WebgpuRenderer;
    private instanceBuffer: GPUBuffer;
    // private tilesetDimBuffer: GPUBuffer;
    lifetime: number;

    constructor(renderer: WebgpuRenderer, isStatic: boolean) {
        this.renderer = renderer;
        this.isStatic = isStatic;
        this.needsUpdate = true;
        this.drawCalls = [];
        this.lifetime = LAYER_LIFETIME;
        this.lastTexIdx = 0;

        this.instanceBuffer = renderer.getConfig().device.createBuffer({
            label: "Render Layer Vertex Buffer",
            size: geometry.spriteStride * (isStatic ? STATIC_LAYER_MAX_SPRITES : DYNAMIC_LAYER_MAX_SPRITES),
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
        });
    }

    public uploadSprites(sprites: Sprite[]) {
        const device = this.renderer.getConfig().device;
        const pipeline = this.renderer.getMainPipeline();
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
                const spriteBindGroups = this.renderer.getSpriteBindGroups();
                if (!spriteBindGroups.has(texName)) {
                    const texInfo = this.renderer.getTextureInfo(texName);
                    const bindGroup = device.createBindGroup({
                        label: "Texture \"" + texName + "\" - Sprite Draw Call Bind Group",
                        layout: pipeline.getBindGroupLayout(1),
                        entries: [
                            { binding: 0, resource: sampler },
                            { binding: 1, resource: texInfo.view! },
                            {
                                binding: 2,
                                resource: {
                                    buffer: this.renderer.getTextureDimBuffer(),
                                    offset: texInfo.idx * 256,
                                    size: 8
                                }
                            }
                        ],
                    });
                    spriteBindGroups.set(texName, bindGroup);
                }
                const bindGroup = spriteBindGroups.get(texName)!;

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
    }
}