import { Camera } from "../Camera";
import { Color } from "../Color";
import { geometry } from "../geometry";
import { math } from "../math";
import { defaultPassStage, DYNAMIC_LAYER_MAX_SPRITES, getOffscreenTextureSizeFactor, LAYER_LIFETIME, maskClearColor, MAX_CHANNELS, OFFSCREEN_TEXTURES, Renderer, RendererBuilderOptions, RendererType, RenderPassStage, STATIC_LAYER_MAX_SPRITES, TextureInfo } from "../Renderer";
import { Scene, SceneLayer } from "../Scene";
import { ShaderBuilderOutput, defaultShaderBuilder, ShaderBuilder } from "../ShaderBuilder";
import { Sprite } from "../Sprite";
import { Tileset } from "../Tileset";
import { Framebuffer } from "../webgl/Framebuffer";
import { ShaderProgram } from "../webgl/ShaderProgram";

const mainVertex = `#version 300 es

layout(location = 0) in vec2 aVertexPos;
layout(location = 1) in vec2 aTexCoord;

layout(location = 2) in vec2 aTilePos;
layout(location = 3) in vec2 aTileScale;
layout(location = 4) in float aTileAngle;
layout(location = 5) in uvec4 aTileRegion;

layout(location=6) in vec4 aMaskColor;

uniform vec2 uViewportDimensions;
uniform vec2 uCameraPos;

uniform vec2 uTilesetDimensions;

out vec2 uv;
out vec4 maskColor;

void main() {
    maskColor = aMaskColor;

    vec2 flippedTexCoord = vec2(aTexCoord.x, 1.0 - aTexCoord.y);
    uv = (vec2(aTileRegion.xy) + flippedTexCoord * vec2(aTileRegion.zw)) / uTilesetDimensions;

    float c = cos(aTileAngle);
    float s = sin(aTileAngle);
    vec2 rotatedPos = vec2(
        aVertexPos.x * c - aVertexPos.y * s,
        aVertexPos.x * s + aVertexPos.y * c
    );
    vec2 worldPos = rotatedPos * aTileScale + aTilePos;
    vec2 pixelPos = worldPos - uCameraPos;
    vec2 clipPos = vec2(pixelPos.x / uViewportDimensions.x, 1.0 - pixelPos.y / uViewportDimensions.y) * 2.0 - 1.0;
    gl_Position = vec4(clipPos, 0.0, 1.0);
}
`;

const mainFragment = `#version 300 es

precision mediump float;

in vec2 uv;

uniform mediump sampler2D uSampler;  

out vec4 fragColor;

void main() {
    fragColor = texture(uSampler, uv);
}
`;

const maskFragment = `#version 300 es

precision mediump float;

in vec2 uv;
in vec4 maskColor;

uniform mediump sampler2D uSampler;  

out vec4 fragColor;

void main() {
    vec4 texColor = texture(uSampler, uv);
    fragColor = vec4(maskColor.rgb, texColor.a * maskColor.a);
}
`;

const fullscreenVertex = `#version 300 es

out vec2 uv;

void main() {
    float x = float((gl_VertexID & 1) << 2);
    float y = float((gl_VertexID & 2) << 1);

    gl_Position = vec4(x - 1.0, y - 1.0, 0.0, 1.0);
}
`;

const fullscreenFragment = (input: ShaderBuilderOutput) => `#version 300 es
precision mediump float;

struct Uniforms {
${input.uniforms.map(line => "    " + line).join("\n")}
};

uniform sampler2D uChannel0;
uniform sampler2D uChannel1;
uniform sampler2D uChannel2;
uniform sampler2D uChannel3;
uniform sampler2D uChannel4;
uniform sampler2D uChannel5;
uniform sampler2D uChannel6;
uniform sampler2D uChannel7;

uniform Uniforms uniforms;

out vec4 fragColor;

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
${input.mainImage.map(line => "    " + line).join("\n")}
}

void main() {
    vec2 fragCoord = gl_FragCoord.xy;
    mainImage(fragColor, fragCoord);
}
`;

const builderOptions: RendererBuilderOptions = {
    componentMap: { r: "r", g: "g", b: "b", a: "a" },
    declareVar: (name, type) => {
        return `${type} ${name};`;
    }
};

export class Webgl2Renderer implements Renderer {
    private canvas: HTMLCanvasElement;
    private gl!: WebGL2RenderingContext;
    private shaderProgram!: ShaderProgram;
    private maskShaderProgram!: ShaderProgram;
    private framebuffers: Framebuffer[];
    private vbo!: WebGLBuffer;
    private ebo!: WebGLBuffer;
    private layersMap: Map<SceneLayer, WebglRendererLayer>;
    private texturesMap: Map<string, TextureInfo>;
    private shaderMap: Map<string, { shader?: ShaderProgram, builder: ShaderBuilder }>;
    private clearColor: Color;
    private initialized: boolean;
    public pass: RenderPassStage[];

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.layersMap = new Map();
        this.texturesMap = new Map();
        this.clearColor = new Color(0, 0, 0, 0);
        this.shaderMap = new Map();
        this.initialized = false;
        this.pass = [defaultPassStage];
        this.framebuffers = [];
    }

    public getType(): RendererType {
        return "webgl2";
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
            this.initFramebuffers();
        }
    }

    public getCanvas() {
        return this.canvas;
    }

    private initFramebuffers() {
        for (let i = 0; i < OFFSCREEN_TEXTURES; ++i) {
            const n = getOffscreenTextureSizeFactor(i)
            this.framebuffers[i]?.destroy();
            this.framebuffers[i] = new Framebuffer(this.gl, this.canvas.width * n, this.canvas.height * n);
        }
    }

    public async init() {
        const gl = this.canvas.getContext("webgl2");
        if (!gl) throw new Error("WebGL2 not supported");

        this.gl = gl;

        for (const texInfo of this.texturesMap.values()) {
            if (texInfo.tileset) {
                texInfo.texture = this.createTexture(texInfo.image);
            }
        }

        this.initFramebuffers();

        this.registerShader("default", defaultShaderBuilder);

        for (const shaderInfo of this.shaderMap.values()) {
            const mainImageBody = shaderInfo.builder.build(this);
            shaderInfo.shader = new ShaderProgram(gl, fullscreenVertex, fullscreenFragment(mainImageBody));
        }

        this.shaderProgram = new ShaderProgram(gl, mainVertex, mainFragment);
        this.maskShaderProgram = new ShaderProgram(gl, mainVertex, maskFragment);

        this.vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
        const vertices = new Float32Array(STATIC_LAYER_MAX_SPRITES * 4 * 4);
        for (let i = 0; i < STATIC_LAYER_MAX_SPRITES; ++i) {
            vertices.set(geometry.quad, i * 4 * 4);
        }

        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

        const indexCache = [0, 1, 2, 1, 2, 3];
        this.ebo = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ebo);
        const indices = new Uint32Array(STATIC_LAYER_MAX_SPRITES * 6);
        for (let i = 0; i < STATIC_LAYER_MAX_SPRITES; ++i) {
            for (let j = 0; j < 6; ++j) {
                indices[i * 6 + j] = indexCache[j] + 4 * i;
            }
        }

        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        this.initialized = true;
    }

    private renderScene(framebuffer: Framebuffer, shaderProgram: ShaderProgram, camera: Camera, clearColor: Color, layers: WebglRendererLayer[]) {
        framebuffer.bind();

        this.gl.clearColor(clearColor.r, clearColor.g, clearColor.b, clearColor.a);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);

        shaderProgram.use();

        this.gl.uniform2f(shaderProgram.getUniform("uViewportDimensions"), camera.vw, camera.vh);
        this.gl.uniform2f(shaderProgram.getUniform("uCameraPos"), camera.position.x, camera.position.y);

        this.gl.activeTexture(this.gl.TEXTURE0);

        for (let layer of layers) {
            layer.render(shaderProgram);
        }

        framebuffer.unbind();
    }

    public render(scene: Scene, camera: Camera) {
        const layers: WebglRendererLayer[] = [];
        for (const sceneLayer of scene.getLayersOrdered()) {
            if (!this.layersMap.has(sceneLayer)) {
                const layer = new WebglRendererLayer(this.gl, this, sceneLayer.isStatic);
                this.layersMap.set(sceneLayer, layer);
            }
            const layer = this.layersMap.get(sceneLayer)!;
            if (layer.needsUpdate) {
                layer.upload(sceneLayer.getSpritesOrdered());
            }
            layers.push(layer);
        }

        this.renderScene(this.framebuffers[0], this.shaderProgram, camera, this.clearColor, layers);
        this.renderScene(this.framebuffers[1], this.maskShaderProgram, camera, maskClearColor, layers);

        const time = performance.now() * 0.001;

        for (let i = 0; i < this.pass.length; ++i) {
            const passStage = this.pass[i];

            const shaderInfo = this.shaderMap.get(passStage.shader);
            if (!shaderInfo) {
                throw new Error("Unknown shader " + passStage.shader);
            }

            const shader = shaderInfo.shader!;

            let sw = this.canvas.width, sh = this.canvas.height;
            if (passStage.output !== -1) {
                const outFbo = this.framebuffers[math.clamp(passStage.output, 0, OFFSCREEN_TEXTURES - 1)];
                sw = outFbo.width;
                sh = outFbo.height;
                outFbo.bind();
            } else {
                this.gl.viewport(0, 0, sw, sh);
            }

            shader.use();

            const stageUniforms = [{ name: "time", value: time }, { name: "resolution", value: [sw, sh] }].concat(passStage.uniforms ?? []);

            const uniforms = shaderInfo.builder.getUniforms();
            for (let uniform of uniforms) {
                const stageUniform = stageUniforms.find(elem => elem.name === uniform.name);
                if (stageUniform) {
                    const value = typeof stageUniform.value === "number" ? [stageUniform.value] : stageUniform.value;
                    const loc = shader.getUniform("uniforms." + uniform.name);
                    switch (uniform.type) {
                        case "float":
                            this.gl.uniform1f(loc, value[0]);
                            break;
                        case "vec2":
                            this.gl.uniform2fv(loc, value);
                            break;
                        case "vec3":
                            this.gl.uniform3fv(loc, value);
                            break;
                        case "vec4":
                            this.gl.uniform4fv(loc, value);
                            break;
                    }
                }
            }

            for (let c = 0; c < MAX_CHANNELS; c++) {
                const texIndex = passStage.inputs[c] ?? passStage.inputs[0];
                const texture = this.framebuffers[math.clamp(texIndex, 0, OFFSCREEN_TEXTURES - 1)].texture;

                this.gl.activeTexture(this.gl.TEXTURE0 + c);
                this.gl.bindTexture(this.gl.TEXTURE_2D, texture);

                const loc = shader.getUniform(`uChannel${c}`);
                this.gl.uniform1i(loc, c);
            }

            this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);

            for (let c = 0; c < MAX_CHANNELS; c++) {
                this.gl.activeTexture(this.gl.TEXTURE0 + c);
                this.gl.bindTexture(this.gl.TEXTURE_2D, null);
            }

            if (passStage.output !== -1) {
                this.framebuffers[math.clamp(passStage.output, 0, OFFSCREEN_TEXTURES - 1)].unbind();
            }
        }

        for (const [sceneLayer, rendererLayer] of this.layersMap) {
            if (rendererLayer.lifetime <= 0) {
                this.layersMap.delete(sceneLayer);
                rendererLayer.destroy();
            }
        }
    }

    public getTextureInfo(name: string) {
        const texInfo = this.texturesMap.get(name);
        if (!texInfo) throw new Error("Texture not found: " + name);
        return texInfo;
    }

    public getVBO() {
        return this.vbo;
    }

    public getEBO() {
        return this.ebo;
    }

    public createTexture(imageData: TexImageSource) {
        const gl = this.gl;

        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, imageData);

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

        return texture;
    }

    public createTextureArray(tileset: Tileset, imageData: Uint8Array) {
        const gl = this.gl;

        const pbo = gl.createBuffer();
        gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, pbo);
        gl.bufferData(gl.PIXEL_UNPACK_BUFFER, imageData, gl.STATIC_DRAW);

        gl.pixelStorei(gl.UNPACK_ROW_LENGTH, tileset.imageWidth);
        gl.pixelStorei(gl.UNPACK_IMAGE_HEIGHT, tileset.imageHeight);

        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
        gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 4, gl.RGBA8, tileset.tileWidth, tileset.tileHeight, tileset.tileCount);

        for (let i = 0; i < tileset.tileCount; ++i) {
            const col = i % tileset.columns;
            const row = Math.floor(i / tileset.columns);

            gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, col * tileset.tileWidth);
            gl.pixelStorei(gl.UNPACK_SKIP_ROWS, row * tileset.tileHeight);

            gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, tileset.tileWidth, tileset.tileHeight, 1, gl.RGBA, gl.UNSIGNED_BYTE, 0);
        }

        gl.deleteBuffer(pbo);

        gl.generateMipmap(gl.TEXTURE_2D_ARRAY);

        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);

        return texture;
    }
}

interface DrawCall {
    texName: string;
    spriteOffset: number;
    spriteCount: number;
}

class WebglRendererLayer {
    private gl: WebGL2RenderingContext;
    private renderer: Webgl2Renderer;
    private spriteBuffer: WebGLBuffer;
    private vao: WebGLVertexArrayObject;
    isStatic: boolean;
    drawCalls: DrawCall[];
    needsUpdate: boolean;
    lifetime: number;

    constructor(gl: WebGL2RenderingContext, renderer: Webgl2Renderer, isStatic: boolean) {
        this.gl = gl;
        this.renderer = renderer;
        this.isStatic = isStatic;
        this.needsUpdate = true;
        this.drawCalls = [];
        this.lifetime = LAYER_LIFETIME;

        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);

        gl.bindBuffer(gl.ARRAY_BUFFER, renderer.getVBO());

        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);

        const stride = 44;

        this.spriteBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.spriteBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, (this.isStatic ? STATIC_LAYER_MAX_SPRITES : DYNAMIC_LAYER_MAX_SPRITES) * 4 * stride, this.isStatic ? gl.STATIC_DRAW : gl.DYNAMIC_DRAW);

        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 0);
        gl.enableVertexAttribArray(3);
        gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 8);
        gl.enableVertexAttribArray(4);
        gl.vertexAttribPointer(4, 1, gl.FLOAT, false, stride, 16);
        gl.enableVertexAttribArray(5);
        gl.vertexAttribIPointer(5, 4, gl.UNSIGNED_SHORT, stride, 20);
        gl.enableVertexAttribArray(6);
        gl.vertexAttribPointer(6, 4, gl.FLOAT, false, stride, 28);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, renderer.getEBO());

        gl.bindVertexArray(null);
    }

    public upload(sprites: Sprite[]) {
        const gl = this.gl;

        gl.bindBuffer(gl.ARRAY_BUFFER, this.spriteBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, geometry.createSpritesData(sprites));

        if (this.isStatic) {
            this.needsUpdate = false;
        }

        this.drawCalls.length = 0;

        let currentCall: DrawCall | null = null;

        for (let i = 0; i < sprites.length; ++i) {
            const texName = sprites[i].tileset.name;

            if (!currentCall || texName !== currentCall.texName) {
                currentCall = { texName, spriteOffset: i, spriteCount: 1 };
                this.drawCalls.push(currentCall);
            } else {
                currentCall.spriteCount++;
            }
        }

    }

    public render(shaderProgram: ShaderProgram) {
        const gl = this.gl;

        gl.bindVertexArray(this.vao);

        for (const drawCall of this.drawCalls) {
            const texInfo = this.renderer.getTextureInfo(drawCall.texName);
            gl.bindTexture(gl.TEXTURE_2D, texInfo.texture!);

            this.gl.uniform2f(shaderProgram.getUniform("uTilesetDimensions"), texInfo.tileset.imageWidth, texInfo.tileset.imageHeight);

            gl.drawElements(gl.TRIANGLES, 6 * drawCall.spriteCount, gl.UNSIGNED_INT, drawCall.spriteOffset * 6 * 4);
        }

        gl.bindVertexArray(null);

        this.lifetime = LAYER_LIFETIME;
    }

    public destroy() {
        this.gl.deleteBuffer(this.spriteBuffer);
        this.gl.deleteVertexArray(this.vao);
    }
}