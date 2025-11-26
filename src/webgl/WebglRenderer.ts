import { Camera } from "../Camera";
import { Color } from "../Color";
import { overlaps } from "../common";
import { geometry } from "../geometry";
import { math } from "../math";
import { BlendMode, defaultPassStage, DYNAMIC_LAYER_MAX_SPRITES, getOffscreenTextureSizeFactor, ImageInfo, LAYER_LIFETIME, maskClearColor, MAX_CHANNELS, MAX_LIGHTS, OFFSCREEN_TEXTURES, Renderer, RendererBuilderOptions, RendererType, RenderPassStage, SHADOW_MAX_VERTICES, STATIC_LAYER_MAX_SPRITES, TEXID_LIGHTMAP, TEXID_MASK, TEXID_SCENE, TextureInfo } from "../Renderer";
import { Scene, SceneLayer } from "../Scene";
import { blurHorizontalBuilder, blurVerticalBuilder, defaultShaderBuilder, lightShaderBuilder, ShaderBuilder, ShaderBuilderOutput } from "../ShaderBuilder";
import { Sprite } from "../Sprite";
import { Tileset } from "../Tileset";
import { Framebuffer } from "./Framebuffer";
import { ShaderProgram } from "./ShaderProgram";

const worldToClipVertex = `
vec4 worldToClip(vec2 worldPos, vec2 cameraPos, vec2 viewport) {
    vec2 pixelPos = worldPos - cameraPos;
    vec2 clipPos = vec2(pixelPos.x / viewport.x, 1.0 - pixelPos.y / viewport.y) * 2.0 - 1.0;
    return vec4(clipPos, 0.0, 1.0);
}
`;

const mainVertex = `

attribute vec2 aVertexPos;
attribute vec2 aTexCoord;
attribute vec2 aTilePos;
attribute float aTileAngle;
attribute vec2 aTileScale;
attribute vec4 aTileRegion;
attribute vec4 aTintColor;
attribute vec4 aMaskColor;
attribute vec2 aTileOffset;

uniform vec2 uViewportDimensions;
uniform vec2 uCameraPos;

uniform vec2 uTilesetDimensions;

varying vec2 uv;
varying vec4 tintColor;
varying vec4 maskColor;

${worldToClipVertex}

void main() {
    tintColor = aTintColor;
    maskColor = aMaskColor;

    vec2 flippedTexCoord = vec2(aTexCoord.x, 1.0 - aTexCoord.y);
    uv = (vec2(aTileRegion.xy) + flippedTexCoord * vec2(aTileRegion.zw)) / uTilesetDimensions;

    float c = cos(aTileAngle);
    float s = sin(aTileAngle);
    vec2 offsetPos = aVertexPos * aTileScale + aTileOffset;
    vec2 rotatedPos = vec2(
        offsetPos.x * c - offsetPos.y * s,
        offsetPos.x * s + offsetPos.y * c
    );
    vec2 worldPos = rotatedPos + aTilePos;

    gl_Position = worldToClip(worldPos, uCameraPos, uViewportDimensions);
}
`;

const mainFragment = `

precision mediump float;

varying vec2 uv;
varying vec4 tintColor;

uniform sampler2D uSampler;  

void main() {
    gl_FragColor = texture2D(uSampler, uv) * tintColor;
}
`;

const maskFragment = `

precision mediump float;

varying vec2 uv;
varying vec4 maskColor;

uniform mediump sampler2D uSampler;  

void main() {
    vec4 texColor = texture2D(uSampler, uv);
    gl_FragColor = vec4(maskColor.rgb, texColor.a * maskColor.a);
}
`;

const lightVertex = `
precision mediump float;

attribute vec2 aVertexPos;

uniform vec2 uLightCenter;
uniform float uLightRadius;

uniform vec2 uCameraPos;
uniform vec2 uViewportDimensions;

varying vec2 worldPos;

${worldToClipVertex}

void main() {
    worldPos = uLightCenter + (aVertexPos - 0.5) * 2.0 * uLightRadius;

    gl_Position = worldToClip(worldPos, uCameraPos, uViewportDimensions);
}
`;

const lightFragment = `

precision mediump float;

varying vec2 worldPos;

uniform vec2 uLightCenter;
uniform float uLightRadius;
uniform vec3 uLightColor;
uniform float uLightIntensity;
uniform vec2 uLightDir;
uniform float uLightCutoff;

void main() {
    vec2 toPixel = worldPos - uLightCenter;
    float dist = length(toPixel);

    float attenuation = clamp(1.0 - pow(dist / uLightRadius, 2.0), 0.0, 1.0);

    float spotFactor = 1.0;
    if (uLightCutoff > 0.0) {
        float cosAngle = dot(normalize(uLightDir), normalize(toPixel));
        spotFactor = clamp((cosAngle - uLightCutoff) / (1.0 - uLightCutoff), 0.0, 1.0);
    }

    gl_FragColor = vec4(uLightColor * uLightIntensity * attenuation * spotFactor, 1.0);
}
`;

const shadowVertex = `
attribute vec2 aPos;

uniform vec2 uCameraPos;
uniform vec2 uViewportDimensions;

${worldToClipVertex}

void main() {
    gl_Position = worldToClip(aPos, uCameraPos, uViewportDimensions);
}
`;

const shadowFragment = `
precision mediump float;

uniform vec2 uLightPos;

void main() {
    gl_FragColor = vec4(vec3(0.0), 1.0);
}
`;

const fullscreenVertex = `

attribute vec2 aPos;

void main() {
    gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const fullscreenFragment = (input: ShaderBuilderOutput) => `
#define texture texture2D

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

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
${input.mainImage.map(line => "    " + line).join("\n")}
}

void main() {
    vec2 fragCoord = vec2(gl_FragCoord.x, gl_FragCoord.y);
    mainImage(gl_FragColor, fragCoord);
}
`;

const builderOptions: RendererBuilderOptions = {
    componentMap: { r: "r", g: "g", b: "b", a: "a" },
    declareVar: (name, type) => {
        return `${type} ${name};`;
    }
};

export class WebglRenderer implements Renderer {
    private canvas: HTMLCanvasElement;
    private gl!: WebGLRenderingContext;
    private shaderProgram!: ShaderProgram;
    private maskShaderProgram!: ShaderProgram;
    private lightShaderProgram!: ShaderProgram;
    private shadowShaderProgram!: ShaderProgram;
    private fullscreenVbo!: WebGLBuffer;
    private framebuffers: Framebuffer[];
    private vbo!: WebGLBuffer;
    private ebo!: WebGLBuffer;
    private layersMap: Map<SceneLayer, WebglRendererLayer>;
    private texturesMap: Map<string, TextureInfo>;
    private shaderMap: Map<string, { shader?: ShaderProgram, builder: ShaderBuilder, blendMode: BlendMode }>;
    private clearColor: Color;
    private initialized: boolean;
    public pass: RenderPassStage[];
    private shadowsVbo!: WebGLBuffer;
    private shaderCache: Map<ShaderBuilder, ShaderProgram>;
    private time: number;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.layersMap = new Map();
        this.texturesMap = new Map();
        this.clearColor = new Color(0, 0, 0, 0);
        this.shaderMap = new Map();
        this.initialized = false;
        this.pass = [defaultPassStage];
        this.framebuffers = [];
        this.shaderCache = new Map();
        this.time = 0;
    }

    public getType(): RendererType {
        return "webgl";
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

    public addImageTextures(images: ImageInfo[]): void {
        for (let info of images) {
            const tileset = new Tileset({
                name: info.name,
                tilecount: 1,
                columns: 1,
                tilewidth: info.width,
                tileheight: info.height,
                imagewidth: info.width,
                imageheight: info.height
            });
            this.texturesMap.set(info.name, {
                tileset,
                image: info.image
            })
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
            this.initFramebuffers();
        }
    }

    public getCanvas() {
        return this.canvas;
    }

    private initFramebuffers() {
        for (let i = 0; i < OFFSCREEN_TEXTURES; ++i) {
            const n = getOffscreenTextureSizeFactor(i);
            this.framebuffers[i]?.destroy();
            this.framebuffers[i] = new Framebuffer(this.gl, this.canvas.width * n, this.canvas.height * n);
        }
    }

    private blend(blendMode: BlendMode) {
        switch (blendMode) {
            case "alpha":
                this.gl.enable(this.gl.BLEND);
                this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
                break;
            case "additive":
                this.gl.enable(this.gl.BLEND);
                this.gl.blendFunc(this.gl.ONE, this.gl.ONE);
                break;
            default:
                this.gl.disable(this.gl.BLEND);
        }
    }

    public async init() {
        const gl = this.canvas.getContext("webgl");
        if (!gl) throw new Error("WebGL not supported");

        this.gl = gl;

        for (const texInfo of this.texturesMap.values()) {
            if (texInfo.tileset) {
                texInfo.texture = this.createTexture(texInfo.image);
            }
        }

        this.registerShader("default", defaultShaderBuilder);
        this.registerShader("default_additive", defaultShaderBuilder, "additive");
        this.registerShader("light", lightShaderBuilder);
        this.registerShader("blurHorizontal", blurHorizontalBuilder);
        this.registerShader("blurVertical", blurVerticalBuilder);

        for (const shaderInfo of this.shaderMap.values()) {
            if (!this.shaderCache.has(shaderInfo.builder)) {
                const mainImageBody = shaderInfo.builder.build(this);
                const shader = new ShaderProgram(gl, fullscreenVertex, fullscreenFragment(mainImageBody));
                this.shaderCache.set(shaderInfo.builder, shader);
            }
            shaderInfo.shader = this.shaderCache.get(shaderInfo.builder)!;
        }

        this.shaderProgram = new ShaderProgram(gl, mainVertex, mainFragment);
        this.maskShaderProgram = new ShaderProgram(gl, mainVertex, maskFragment);
        this.lightShaderProgram = new ShaderProgram(gl, lightVertex, lightFragment);
        this.shadowShaderProgram = new ShaderProgram(gl, shadowVertex, shadowFragment);

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
        const indices = new Uint16Array(STATIC_LAYER_MAX_SPRITES * 6);
        for (let i = 0; i < STATIC_LAYER_MAX_SPRITES; ++i) {
            for (let j = 0; j < 6; ++j) {
                indices[i * 6 + j] = indexCache[j] + 4 * i;
            }
        }
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

        this.initFramebuffers();

        this.fullscreenVbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.fullscreenVbo);
        gl.bufferData(gl.ARRAY_BUFFER, geometry.fullscreenQuad, gl.STATIC_DRAW);

        this.shadowsVbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.shadowsVbo);
        gl.bufferData(gl.ARRAY_BUFFER, MAX_LIGHTS * SHADOW_MAX_VERTICES * 8, gl.DYNAMIC_DRAW);

        this.initialized = true;
    }

    private renderScene(framebuffer: Framebuffer, shaderProgram: ShaderProgram, camera: Camera, clearColor: Color | null, layers: WebglRendererLayer[]) {
        framebuffer.bind();

        this.blend("alpha");

        if (clearColor) {
            this.gl.clearColor(clearColor.r, clearColor.g, clearColor.b, clearColor.a);
            this.gl.clear(this.gl.COLOR_BUFFER_BIT);
        }

        this.gl.activeTexture(this.gl.TEXTURE0);

        shaderProgram.use();

        this.gl.uniform2f(shaderProgram.getUniform("uViewportDimensions"), camera.vw, camera.vh);
        this.gl.uniform2f(shaderProgram.getUniform("uCameraPos"), camera.position.x, camera.position.y);

        for (let layer of layers) {
            layer.render(shaderProgram);
        }

        framebuffer.unbind();
    }

    private renderLights(scene: Scene, camera: Camera) {
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

        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.shadowsVbo);

        this.gl.bufferSubData(this.gl.ARRAY_BUFFER, 0, shadowVertices);

        this.framebuffers[TEXID_LIGHTMAP].bind();
        this.gl.clearColor(
            scene.ambientColor.r * scene.ambientIntensity,
            scene.ambientColor.g * scene.ambientIntensity,
            scene.ambientColor.b * scene.ambientIntensity,
            1.0
        );
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
        this.framebuffers[TEXID_LIGHTMAP].unbind();

        const lightPosLoc = this.lightShaderProgram.getAttrib("aVertexPos");
        const shadowPosLoc = this.shadowShaderProgram.getAttrib("aPos");

        for (let i = 0; i < sceneLights.length; ++i) {
            const light = sceneLights[i];

            this.framebuffers[TEXID_LIGHTMAP + 1].bind();

            this.blend("none");

            this.gl.clearColor(0, 0, 0, 1);
            this.gl.clear(this.gl.COLOR_BUFFER_BIT);

            this.lightShaderProgram.use();

            this.gl.uniform2f(this.lightShaderProgram.getUniform("uViewportDimensions"), camera.vw, camera.vh);
            this.gl.uniform2f(this.lightShaderProgram.getUniform("uCameraPos"), camera.position.x, camera.position.y);

            this.gl.uniform2f(this.lightShaderProgram.getUniform("uLightCenter"), light.position.x, light.position.y);
            this.gl.uniform1f(this.lightShaderProgram.getUniform("uLightRadius"), light.radius);
            this.gl.uniform3f(this.lightShaderProgram.getUniform("uLightColor"), light.color.r, light.color.g, light.color.b);
            this.gl.uniform1f(this.lightShaderProgram.getUniform("uLightIntensity"), light.intensity);
            this.gl.uniform2f(this.lightShaderProgram.getUniform("uLightDir"), light.direction.x, light.direction.y);
            this.gl.uniform1f(this.lightShaderProgram.getUniform("uLightCutoff"), light.cutoff);

            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vbo);
            this.gl.enableVertexAttribArray(lightPosLoc);
            this.gl.vertexAttribPointer(lightPosLoc, 2, this.gl.FLOAT, false, 16, 0);

            this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);

            this.gl.disableVertexAttribArray(lightPosLoc);

            const shadowDrawCall = shadowsDrawCalls[i];

            if (shadowDrawCall.count !== 0) {
                this.shadowShaderProgram.use();

                this.gl.uniform2f(this.shadowShaderProgram.getUniform("uViewportDimensions"), camera.vw, camera.vh);
                this.gl.uniform2fv(this.shadowShaderProgram.getUniform("uCameraPos"), camera.position.toArray());

                this.gl.uniform2fv(this.shadowShaderProgram.getUniform("uLightPos"), light.position.toArray());

                this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.shadowsVbo);
                this.gl.enableVertexAttribArray(shadowPosLoc);
                this.gl.vertexAttribPointer(shadowPosLoc, 2, this.gl.FLOAT, false, 8, 0);

                this.gl.drawArrays(this.gl.TRIANGLES, shadowDrawCall.offset, shadowDrawCall.count);

                this.gl.disableVertexAttribArray(shadowPosLoc);
            }

            this.framebuffers[TEXID_LIGHTMAP + 1].unbind();

            this.renderFullscreenPass({ shader: "blurHorizontal", inputs: [TEXID_LIGHTMAP + 1], output: 4 });
            this.renderFullscreenPass({ shader: "blurVertical", inputs: [4], output: 5 });
            this.renderFullscreenPass({ shader: "default_additive", inputs: [5], output: TEXID_LIGHTMAP });
        }
    }

    private renderFullscreenPass(passStage: RenderPassStage) {
        const shaderInfo = this.shaderMap.get(passStage.shader);
        if (!shaderInfo) {
            throw new Error("Unknown shader " + passStage.shader);
        }

        if (passStage.clearColor) {
            this.gl.clearColor(this.clearColor.r, this.clearColor.g, this.clearColor.b, this.clearColor.a);
            this.gl.clear(this.gl.COLOR_BUFFER_BIT);
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

        this.blend(shaderInfo.blendMode);

        shader.use();

        const stageUniforms = [{ name: "time", value: this.time }, { name: "resolution", value: [sw, sh] }].concat(passStage.uniforms ?? []);

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

        const fullscreenPosLoc = shader.getAttrib("aPos");

        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.fullscreenVbo);

        this.gl.enableVertexAttribArray(fullscreenPosLoc);
        this.gl.vertexAttribPointer(fullscreenPosLoc, 2, this.gl.FLOAT, false, 16, 0);

        this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);

        this.gl.disableVertexAttribArray(fullscreenPosLoc);

        for (let c = 0; c < MAX_CHANNELS; c++) {
            this.gl.activeTexture(this.gl.TEXTURE0 + c);
            this.gl.bindTexture(this.gl.TEXTURE_2D, null);
        }

        if (passStage.output !== -1) {
            this.framebuffers[math.clamp(passStage.output, 0, OFFSCREEN_TEXTURES - 1)].unbind();
        }
    }

    public render(scene: Scene, camera: Camera) {
        if(!this.initialized) {
            throw new Error("Renderer is not initialized");
        }

        const cameraBounds = camera.getBounds();
        this.time = performance.now() * 0.001;

        const layers: WebglRendererLayer[] = [];
        const layersUnderShadows: WebglRendererLayer[] = [];
        const layersAboveShadows: WebglRendererLayer[] = [];
        for (const sceneLayer of scene.getLayersOrdered()) {
            let layer: WebglRendererLayer;
            if (!this.layersMap.has(sceneLayer)) {
                this.layersMap.set(sceneLayer, new WebglRendererLayer(this.gl, this, sceneLayer.isStatic));
            }
            layer = this.layersMap.get(sceneLayer)!;
            if (layer.needsUpdate) {
                let sprites = sceneLayer.getSpritesOrdered();
                if (!layer.isStatic) {
                    sprites = sprites.filter(sprite => overlaps(cameraBounds, sprite.getBounds()))
                }
                layer.uploadSprites(sceneLayer.getSpritesOrdered());
            }
            layers.push(layer);
            if (sceneLayer.zIndex <= scene.shadowsZIndex) {
                layersUnderShadows.push(layer);
            } else {
                layersAboveShadows.push(layer);
            }
        }

        this.renderScene(this.framebuffers[0], this.shaderProgram, camera, this.clearColor, layers);

        this.renderFullscreenPass({ shader: "default", inputs: [0], output: -1 });

        this.renderLights(scene, camera);

        this.renderScene(this.framebuffers[TEXID_SCENE], this.shaderProgram, camera, this.clearColor, layersUnderShadows);

        this.renderFullscreenPass({ shader: "light", inputs: [TEXID_SCENE, TEXID_LIGHTMAP], output: 0 });

        this.renderScene(this.framebuffers[0], this.shaderProgram, camera, null, layersAboveShadows);

        this.renderScene(this.framebuffers[TEXID_MASK], this.maskShaderProgram, camera, maskClearColor, layers);

        for (let i = 0; i < this.pass.length; ++i) {
            const passStage = this.pass[i];
            this.renderFullscreenPass(passStage);
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

        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageData);

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

        return texture;
    }

}

interface DrawCall {
    texName: string;
    spriteOffset: number;
    spriteCount: number;
}

class WebglRendererLayer {
    private gl: WebGLRenderingContext;
    private renderer: WebglRenderer;
    private spriteBuffer: WebGLBuffer;
    isStatic: boolean;
    drawCalls: DrawCall[];
    needsUpdate: boolean;
    lifetime: number;

    constructor(gl: WebGLRenderingContext, renderer: WebglRenderer, isStatic: boolean) {
        this.gl = gl;
        this.renderer = renderer;
        this.isStatic = isStatic;
        this.needsUpdate = true;
        this.drawCalls = [];
        this.lifetime = LAYER_LIFETIME;

        this.spriteBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.spriteBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, (this.isStatic ? STATIC_LAYER_MAX_SPRITES : DYNAMIC_LAYER_MAX_SPRITES) * geometry.spriteStride * 4, this.isStatic ? gl.STATIC_DRAW : gl.DYNAMIC_DRAW);
    }

    public uploadSprites(sprites: Sprite[]) {
        const gl = this.gl;

        gl.bindBuffer(gl.ARRAY_BUFFER, this.spriteBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, geometry.createSpritesData(sprites, false));

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

        gl.bindBuffer(gl.ARRAY_BUFFER, this.renderer.getVBO());

        const attribLocations = {
            vertexPos: shaderProgram.getAttrib("aVertexPos"),
            texCoord: shaderProgram.getAttrib("aTexCoord"),
            tilePos: shaderProgram.getAttrib("aTilePos"),
            tileScale: shaderProgram.getAttrib("aTileScale"),
            tileAngle: shaderProgram.getAttrib("aTileAngle"),
            tileRegion: shaderProgram.getAttrib("aTileRegion"),
            tintColor: shaderProgram.getAttrib("aTintColor"),
            maskColor: shaderProgram.getAttrib("aMaskColor"),
            tileOffset: shaderProgram.getAttrib("aTileOffset"),
        };

        gl.enableVertexAttribArray(attribLocations.vertexPos);
        gl.vertexAttribPointer(attribLocations.vertexPos, 2, gl.FLOAT, false, 16, 0);
        gl.enableVertexAttribArray(attribLocations.texCoord);
        gl.vertexAttribPointer(attribLocations.texCoord, 2, gl.FLOAT, false, 16, 8);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.spriteBuffer);

        const stride = geometry.spriteStride;

        gl.enableVertexAttribArray(attribLocations.tilePos);
        gl.vertexAttribPointer(attribLocations.tilePos, 2, gl.FLOAT, false, stride, 0);
        gl.enableVertexAttribArray(attribLocations.tileScale);
        gl.vertexAttribPointer(attribLocations.tileScale, 2, gl.FLOAT, false, stride, 8);
        gl.enableVertexAttribArray(attribLocations.tileAngle);
        gl.vertexAttribPointer(attribLocations.tileAngle, 1, gl.FLOAT, false, stride, 16);
        gl.enableVertexAttribArray(attribLocations.tileRegion);
        gl.vertexAttribPointer(attribLocations.tileRegion, 4, gl.UNSIGNED_SHORT, false, stride, 20);
        gl.enableVertexAttribArray(attribLocations.tintColor);
        gl.vertexAttribPointer(attribLocations.tintColor, 4, gl.FLOAT, false, stride, 28);
        gl.enableVertexAttribArray(attribLocations.maskColor);
        gl.vertexAttribPointer(attribLocations.maskColor, 4, gl.FLOAT, false, stride, 44);
        gl.enableVertexAttribArray(attribLocations.tileOffset);
        gl.vertexAttribPointer(attribLocations.tileOffset, 2, gl.FLOAT, false, stride, 60);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.renderer.getEBO());

        for (const drawCall of this.drawCalls) {
            const texInfo = this.renderer.getTextureInfo(drawCall.texName);
            gl.bindTexture(gl.TEXTURE_2D, texInfo.texture!);

            this.gl.uniform2f(shaderProgram.getUniform("uTilesetDimensions"), texInfo.tileset.imageWidth, texInfo.tileset.imageHeight);

            gl.drawElements(gl.TRIANGLES, 6 * drawCall.spriteCount, gl.UNSIGNED_SHORT, drawCall.spriteOffset * 6 * 2);
        }

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

        gl.disableVertexAttribArray(attribLocations.vertexPos);
        gl.disableVertexAttribArray(attribLocations.texCoord);
        gl.disableVertexAttribArray(attribLocations.tilePos);
        gl.disableVertexAttribArray(attribLocations.tileScale);
        gl.disableVertexAttribArray(attribLocations.tileAngle);
        gl.disableVertexAttribArray(attribLocations.tileRegion);
        gl.disableVertexAttribArray(attribLocations.tintColor);
        gl.disableVertexAttribArray(attribLocations.maskColor);

        this.lifetime = LAYER_LIFETIME;
    }

    public destroy() {
        this.gl.deleteBuffer(this.spriteBuffer);
    }
}