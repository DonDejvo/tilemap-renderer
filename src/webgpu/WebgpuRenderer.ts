import { Camera } from "../Camera";
import { Color } from "../Color";
import { overlaps } from "../common";
import { geometry } from "../geometry";
import { math } from "../math";
import { BlendMode, defaultPassStage, DYNAMIC_LAYER_MAX_SPRITES, getOffscreenTextureSizeFactor, LAYER_LIFETIME, LAYER_MAX_TEXTURES, maskClearColor, MAX_CHANNELS, MAX_LIGHTS, OFFSCREEN_TEXTURES, Renderer, RendererBuilderOptions, RendererType, RenderPassStage, SHADOW_MAX_VERTICES, STATIC_LAYER_MAX_SPRITES, TEXID_LIGHTMAP, TEXID_MASK, TEXID_SCENE, TextureInfo, UNIFORMS_MAX_SIZE } from "../Renderer";
import { Scene, SceneLayer } from "../Scene";
import { blurHorizontalBuilder, blurVerticalBuilder, defaultShaderBuilder, lightShaderBuilder, ShaderBuilder, ShaderBuilderOutput } from "../ShaderBuilder";
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

const worldToClipVertex = `
fn worldToClip(worldPos: vec2f, cameraPos: vec2f, viewport: vec2f) -> vec4f {
    let pixelPos = worldPos - cameraPos;
    let clipPos = vec2f(pixelPos.x / viewport.x, 1.0 - pixelPos.y / viewport.y) * 2.0 - 1.0;
    return vec4f(clipPos, 0.0, 1.0);
}
`;

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
    cutoff: f32
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
    if (light.cutoff > 0.0) {
        let cosAngle = dot(normalize(toPixel), normalize(light.direction));
        spotFactor = clamp((cosAngle - light.cutoff) / (1.0 - light.cutoff), 0.0, 1.0);
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
fn fs_main(input: VSOutput) -> @location(0) vec4f {
    return vec4f(0.0, 0.0, 0.0, 1.0);
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
    builder: ShaderBuilder;
    blendMode: BlendMode;
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
    private lightBGL!: GPUBindGroupLayout;
    private time: number;
    private lightPipeline!: GPURenderPipeline;
    private shadowPipeline!: GPURenderPipeline;
    private lightUniformBindGroup!: GPUBindGroup;
    private lightUniformBuffer!: GPUBuffer;
    private shadowsVbo!: GPUBuffer;
    private shaderCache: Map<ShaderBuilder, GPUShaderModule>;
    private renderPassUniformMap: Map<RenderPassStage, { ubo: GPUBuffer, uniformBindGroup: GPUBindGroup, textureBindGroup: GPUBindGroup }>;
    private fullscreenPassStages: {
        mainLight: RenderPassStage;
        lightBlurHorizontal: RenderPassStage;
        lightBlurVertical: RenderPassStage;
        lightAdditive: RenderPassStage;
    };
    private resizeRequested: boolean;

    constructor(canvas: HTMLCanvasElement) {
        this.layersMap = new Map();
        this.texturesMap = new Map();
        this.canvas = canvas;
        this.clearColor = new Color(0, 0, 0, 0);
        this.shaderMap = new Map();
        this.initialized = false;
        this.pass = [defaultPassStage];
        this.offscreenTextures = [];
        this.time = 0;
        this.shaderCache = new Map();
        this.renderPassUniformMap = new Map();
        this.fullscreenPassStages = {
            mainLight: { shader: "light", inputs: [TEXID_SCENE, TEXID_LIGHTMAP], output: 0 },
            lightBlurHorizontal: { shader: "blurHorizontal", inputs: [TEXID_LIGHTMAP + 1], output: 4 },
            lightBlurVertical: { shader: "blurVertical", inputs: [4], output: 5 },
            lightAdditive: { shader: "default_additive", inputs: [5], output: TEXID_LIGHTMAP }
        };
        this.resizeRequested = false;
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

    public registerShader(name: string, builder: ShaderBuilder, blendMode: BlendMode = "none") {
        this.shaderMap.set(name, { builder, blendMode });
    }

    public setClearColor(color: Color) {
        this.clearColor.copy(color);
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

    private initOffscreenTextures() {
        for (let i = 0; i < OFFSCREEN_TEXTURES; ++i) {
            this.offscreenTextures[i]?.destroy();
            const n = getOffscreenTextureSizeFactor(i);
            this.offscreenTextures[i] = this.cfg.device.createTexture({
                size: { width: this.canvas.width * n, height: this.canvas.height * n, depthOrArrayLayers: 1 },
                format: this.cfg.format,
                usage: GPUTextureUsage.RENDER_ATTACHMENT |
                    GPUTextureUsage.TEXTURE_BINDING,
                label: "offscreen texture " + i
            });
        }
        for(let [passStage, info] of this.renderPassUniformMap) {
            info.textureBindGroup = this.renderPassCreateTextureBindGroup(passStage);
        }
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

        for (const texInfo of this.texturesMap.values()) {
            if (texInfo.tileset) {
                texInfo.texture = this.createTexture(texInfo.tileset, texInfo.image);
            }
        }

        this.initOffscreenTextures();

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
        this.registerShader("default_additive", defaultShaderBuilder, "additive");
        this.registerShader("light", lightShaderBuilder);
        this.registerShader("blurHorizontal", blurHorizontalBuilder);
        this.registerShader("blurVertical", blurVerticalBuilder);

        for (const [name, shaderInfo] of this.shaderMap.entries()) {

            if (!this.shaderCache.has(shaderInfo.builder)) {
                const code = fullscreenSource(shaderInfo.builder.build(this));
                const module = device.createShaderModule({
                    label: name + " shader module",
                    code
                });
                this.shaderCache.set(shaderInfo.builder, module);
            }

            const module = this.shaderCache.get(shaderInfo.builder)!;

            const pipeline = device.createRenderPipeline({
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
        this.lightBGL = this.cfg.device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform", hasDynamicOffset: true } }
            ]
        });

        this.pipeline = this.createMainPipeline(mainSource);
        this.maskPipeline = this.createMainPipeline(maskSource);

        this.lightUniformBuffer = this.cfg.device.createBuffer({
            label: "Light uniform buffer",
            size: MAX_LIGHTS * 256,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        const lightPipelineLayout = this.cfg.device.createPipelineLayout({
            bindGroupLayouts: [this.cameraBGL, this.lightBGL],
        });
        const lightShaderModule = this.cfg.device.createShaderModule({
            code: lightSource
        });
        this.lightPipeline = this.cfg.device.createRenderPipeline({
            label: "Light pipeline",
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
            primitive: { topology: "triangle-strip" }
        });

        this.lightUniformBindGroup = this.cfg.device.createBindGroup({
            label: "Light uniform bind group",
            layout: this.lightPipeline.getBindGroupLayout(1),
            entries: [{ binding: 0, resource: { buffer: this.lightUniformBuffer, size: geometry.lightStride } }]
        });

        const shadowPipelineLayot = this.cfg.device.createPipelineLayout({
            bindGroupLayouts: [this.cameraBGL]
        });
        const shadowShaderModule = this.cfg.device.createShaderModule({
            code: shadowSource
        });
        this.shadowPipeline = this.cfg.device.createRenderPipeline({
            label: "Shadow pipeline",
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
                targets: [{ format: this.cfg.format }]
            }
        });

        this.cameraBuffer = device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        })

        this.cameraBindGroup = device.createBindGroup({
            label: "Camera bind group",
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

        this.shadowsVbo = this.cfg.device.createBuffer({
            size: MAX_LIGHTS * SHADOW_MAX_VERTICES * 8,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
        });

        this.initialized = true;
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

    private renderScene(encoder: GPUCommandEncoder, pipeline: GPURenderPipeline, writeTexture: GPUTexture, clearColor: Color | null, layers: WebgpuRendererLayer[]) {
        const scenePass = encoder.beginRenderPass({
            colorAttachments: [{
                clearValue: clearColor || undefined,
                view: writeTexture.createView(),
                loadOp: clearColor ? "clear" : "load",
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

    private renderLights(encoder: GPUCommandEncoder, scene: Scene, camera: Camera) {
        const cameraBounds = camera.getBounds();
        const sceneLights = scene.getLights().filter(light => {
            return overlaps(cameraBounds, light.getBounds());
        });

        const shadowVertices = new Float32Array(sceneLights.length * SHADOW_MAX_VERTICES * 2);
        const shadowsDrawCalls: { offset: number; count: number; }[] = [];
        let offset = 0;
        for (let light of sceneLights) {
            const sceneColliders = scene.getColliders(light.getBounds());
            const newOffset = geometry.createShadowsGeometry(shadowVertices, light, sceneColliders, offset);
            shadowsDrawCalls.push({ count: (newOffset - offset) / 2, offset: offset / 2 });
            offset = newOffset;
        }

        this.cfg.device.queue.writeBuffer(this.shadowsVbo, 0, shadowVertices, 0, offset);

        const clearColor = new Color(
            scene.ambientColor.r * scene.ambientIntensity,
            scene.ambientColor.g * scene.ambientIntensity,
            scene.ambientColor.b * scene.ambientIntensity,
            1.0
        );

        const lightAmbientPass = encoder.beginRenderPass({
            colorAttachments: [{
                view: this.offscreenTextures[TEXID_LIGHTMAP].createView(),
                clearValue: clearColor,
                loadOp: "clear",
                storeOp: "store"
            }]
        });
        lightAmbientPass.end();

        const lightsUniformData = geometry.createLightsGeometry(sceneLights, true);
        this.cfg.device.queue.writeBuffer(this.lightUniformBuffer, 0, lightsUniformData);

        const texView = this.offscreenTextures[TEXID_LIGHTMAP + 1].createView();

        for (let i = 0; i < sceneLights.length; ++i) {

            const lightPass = encoder.beginRenderPass({
                colorAttachments: [{
                    view: texView,
                    clearValue: new Color(0, 0, 0, 1),
                    loadOp: "clear",
                    storeOp: "store"
                }]
            });

            lightPass.setPipeline(this.lightPipeline);
            lightPass.setVertexBuffer(0, this.vbo);
            lightPass.setBindGroup(0, this.cameraBindGroup);
            lightPass.setBindGroup(1, this.lightUniformBindGroup, [i * 256]);
            lightPass.draw(4);

            const shadowDrawCall = shadowsDrawCalls[i];

            if (shadowDrawCall.count !== 0) {

                lightPass.setPipeline(this.shadowPipeline);
                lightPass.setVertexBuffer(0, this.shadowsVbo);
                lightPass.setBindGroup(0, this.cameraBindGroup);
                lightPass.draw(shadowDrawCall.count, 1, shadowDrawCall.offset);
            }

            lightPass.end();

            this.renderFullscreenPass(encoder, this.fullscreenPassStages.lightBlurHorizontal);
            this.renderFullscreenPass(encoder, this.fullscreenPassStages.lightBlurVertical);
            this.renderFullscreenPass(encoder, this.fullscreenPassStages.lightAdditive);
        }
    }

    private renderPassCreateTextureBindGroup(passStage: RenderPassStage) {
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
        const textureBindGroup = this.cfg.device.createBindGroup({
            label: passStage.shader + " texture bind group",
            layout: shaderInfo.pipeline!.getBindGroupLayout(1),
            entries
        });

        return textureBindGroup;
    }

    private renderFullscreenPass(encoder: GPUCommandEncoder, passStage: RenderPassStage) {
        const shaderInfo = this.shaderMap.get(passStage.shader);
        if (!shaderInfo) {
            throw new Error("Unknown shader " + passStage.shader);
        }

        const outputTex = passStage.output === -1 ?
            this.ctx.getCurrentTexture() :
            this.offscreenTextures[math.clamp(passStage.output, 0, OFFSCREEN_TEXTURES - 1)];

        const uniforms = shaderInfo.builder.getUniforms();
        const stageUniforms = [{ name: "time", value: this.time }, { name: "resolution", value: [outputTex.width, outputTex.height] }].concat(passStage.uniforms ?? []);
        const uniformData = new Float32Array(UNIFORMS_MAX_SIZE);

        for (let uniform of uniforms) {
            const stageUniform = stageUniforms.find(elem => elem.name === uniform.name);
            if (stageUniform) {
                const value = typeof stageUniform.value === "number" ? [stageUniform.value] : stageUniform.value;
                uniformData.set(value, uniform.offset);
            }
        }

        if (!this.renderPassUniformMap.has(passStage)) {
            const ubo = this.cfg.device.createBuffer({
                size: 256,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
            });
            const uniformBindGroup = this.cfg.device.createBindGroup({
                layout: shaderInfo.pipeline!.getBindGroupLayout(0),
                entries: [{ binding: 0, resource: { buffer: ubo } }]
            });
            const textureBindGroup = this.renderPassCreateTextureBindGroup(passStage);

            this.renderPassUniformMap.set(passStage, { ubo, uniformBindGroup, textureBindGroup });
        }

        const uniformsInfo = this.renderPassUniformMap.get(passStage)!;
        this.cfg.device.queue.writeBuffer(uniformsInfo.ubo, 0, uniformData);

        const fullscreenPass = encoder.beginRenderPass({
            colorAttachments: [{
                view: outputTex.createView(),
                loadOp: passStage.clearColor ? "clear" : "load",
                clearValue: passStage.clearColor,
                storeOp: "store"
            }]
        });

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

        const layers: WebgpuRendererLayer[] = [];
        const layersUnderShadows: WebgpuRendererLayer[] = [];
        const layersAboveShadows: WebgpuRendererLayer[] = [];
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
            if (sceneLayer.zIndex <= scene.shadowsZIndex) {
                layersUnderShadows.push(layer);
            } else {
                layersAboveShadows.push(layer);
            }
        }

        this.cfg.device.queue.writeBuffer(
            this.cameraBuffer,
            0,
            new Float32Array([
                camera.position.x, camera.position.y,
                camera.vw, camera.vh
            ])
        );

        const encoder = this.cfg.device.createCommandEncoder();

        this.renderLights(encoder, scene, camera);

        this.renderScene(encoder, this.pipeline, this.offscreenTextures[TEXID_SCENE], this.clearColor, layersUnderShadows);

        this.renderFullscreenPass(encoder, this.fullscreenPassStages.mainLight);

        this.renderScene(encoder, this.pipeline, this.offscreenTextures[0], null, layersAboveShadows);

        this.renderScene(encoder, this.maskPipeline, this.offscreenTextures[TEXID_MASK], maskClearColor, layers);

        for (let i = 0; i < this.pass.length; ++i) {
            const passStage = this.pass[i];
            this.renderFullscreenPass(encoder, passStage);
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
            size: geometry.spriteStride * (isStatic ? STATIC_LAYER_MAX_SPRITES : DYNAMIC_LAYER_MAX_SPRITES),
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
        });

        this.tilesetDimBuffer = renderer.getConfig().device.createBuffer({
            label: "Tileset Dimensions Buffer",
            size: LAYER_MAX_TEXTURES * 256,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
    }

    public uploadSprites(sprites: Sprite[]) {
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