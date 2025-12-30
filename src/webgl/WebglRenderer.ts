import { Camera } from "../Camera";
import { Color } from "../Color";
import { getHeight, getWidth, overlaps } from "../bounds";
import { geometry } from "../geometry";
import { LineRenderer } from "../LineRenderer";
import { BlendMode, defaultPass, getOffscreenTextureSizeFactor, GPUTimer, LAYER_LIFETIME, maskClearColor, Renderer, RendererBuilderOptions, RendererType, RenderPass, TextureInfo } from "../Renderer";
import { Scene, SceneLayer } from "../Scene";
import { ShaderBuilder, ShaderBuilderOutput, shaders } from "../ShaderBuilder";
import { Sprite } from "../Sprite";
import { Tileset } from "../Tileset";
import { Framebuffer } from "./Framebuffer";
import { WebglGPUTimer } from "./WebglGPUTimer";
import { ShaderProgram } from "./ShaderProgram";
import { WebglLineRenderer } from "./WebglLineRenderer";
import { shadowGeometryModule } from "../wasm/shadowGeometryModule";
import { limits } from "../limits";
import { TextureID } from "../TextureID";
import { getRendererReport, lightStruct, textureChannels, worldToClipVertex } from "./common";

const builderOptions: RendererBuilderOptions = {
    componentMap: { r: "r", g: "g", b: "b", a: "a" },
    replaceType(type) {
        return type;
    },
    declareFn(name, returnType, ...args) {
        return `${returnType === null ? "void" : returnType} ${name}(${args.map(arg => `${arg[1]} ${arg[0]}`).join(", ")})`;
    },
    declareVar(name, type) {
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
    public clearColor: Color;
    private initialized: boolean;
    public pipeline: RenderPass[];
    private shadowsVbo!: WebGLBuffer;
    private shaderCache: Map<ShaderBuilder, ShaderProgram>;
    private time: number;
    private resizeRequested: boolean;
    private lineRenderer!: WebglLineRenderer;
    private nextTextureIdx: number = 0;
    private gpuTimer!: WebglGPUTimer;
    private fbo: Framebuffer | null = null;
    public enableSpector: boolean = false;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.layersMap = new Map();
        this.texturesMap = new Map();
        this.clearColor = new Color(0, 0, 0, 0);
        this.shaderMap = new Map();
        this.initialized = false;
        this.pipeline = [defaultPass];
        this.framebuffers = [];
        this.shaderCache = new Map();
        this.time = 0;
        this.resizeRequested = false;
    }

    public getReport() {
        return getRendererReport(this.getType(), this.gl);
    }

    public getGpuTimer(): GPUTimer {
        return this.gpuTimer;
    }

    public getLineRenderer(): LineRenderer {
        return this.lineRenderer;
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

    private initFramebuffers() {
        for (let i = 0; i < limits.offscreenTextures; ++i) {
            const n = getOffscreenTextureSizeFactor(i);
            this.framebuffers[i]?.destroy();
            this.framebuffers[i] = new Framebuffer(this.gl, Math.ceil(this.canvas.width * n), Math.ceil(this.canvas.height * n));
        }
    }

    private setBlendMode(blendMode: BlendMode) {
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

    private setScissor(rect: [number, number, number, number] | null) {
        if (rect) {
            this.gl.enable(this.gl.SCISSOR_TEST);
            const sh = this.fbo ? this.fbo.height : this.canvas.height;
            this.gl.scissor(rect[0], sh - rect[1] - rect[3], rect[2], rect[3]);
        } else {
            this.gl.disable(this.gl.SCISSOR_TEST);
        }
    }

    private bindFbo(fbo: Framebuffer | null) {
        if (fbo) {
            fbo.bind();
        } else {
            this.fbo?.unbind();
        }
        this.fbo = fbo;
    }

    public async init() {
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
    vec2 offsetPos = (aVertexPos * abs(aTileScale) + aTileOffset) * sign(aTileScale);
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

${lightStruct}

uniform Light light;

uniform vec2 uCameraPos;
uniform vec2 uViewportDimensions;

varying vec2 worldPos;

${worldToClipVertex}

void main() {
    worldPos = light.center + (aVertexPos - 0.5) * 2.0 * light.radius;

    gl_Position = worldToClip(worldPos, uCameraPos, uViewportDimensions);
}
`;

        const lightFragment = `

precision mediump float;

varying vec2 worldPos;

${lightStruct}

uniform Light light;

void main() {
    vec2 toPixel = worldPos - light.center;
    float dist = length(toPixel);

    float attenuation = clamp(1.0 - pow(dist / light.radius, 2.0), 0.0, 1.0);

    float spotFactor = 1.0;
    if (light.outerCutoff > 0.0) {
        float cosAngle = dot(normalize(light.direction), normalize(toPixel));
        spotFactor = smoothstep(
            light.outerCutoff,
            light.innerCutoff,
            cosAngle
        );
    }

    gl_FragColor = vec4(light.color * light.intensity * attenuation * spotFactor, 1.0);
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
void main() {
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

${textureChannels(limits.textureChannels)}

uniform Uniforms uniforms;

${input.functions.join("\n\n")}

void main() {
    vec2 fragCoord = vec2(gl_FragCoord.x, gl_FragCoord.y);
    gl_FragColor = mainImage(fragCoord);
}
`;

        const gl = this.canvas.getContext("webgl", {
            powerPreference: "high-performance"
        });
        if (!gl) throw new Error("WebGL not supported");

        this.gl = gl;

        for (const texInfo of this.texturesMap.values()) {
            if (texInfo.tileset) {
                texInfo.texture = this.createTexture(texInfo.image);
            }
        }

        for (let shader of shaders) {
            this.registerShader(shader.name, shader.builder, shader.blendMode);
        }

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
        const maxSprites = Math.max(limits.staticLayerMaxSprites, limits.dynamicLayerMaxSprites);
        const vertices = new Float32Array(maxSprites * 16);
        for (let i = 0; i < maxSprites; ++i) {
            vertices.set(geometry.quad, i * 16);
        }
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

        const indexCache = [0, 1, 2, 1, 2, 3];
        this.ebo = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ebo);
        const indices = new Uint16Array(maxSprites * 6);
        for (let i = 0; i < maxSprites; ++i) {
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
        gl.bufferData(gl.ARRAY_BUFFER, limits.maxLights * limits.shadowPerLightMaxTriangles * 24, gl.DYNAMIC_DRAW);

        this.lineRenderer = new WebglLineRenderer(gl);
        this.lineRenderer.init();

        this.gpuTimer = new WebglGPUTimer(gl);

        this.initialized = true;

        if (this.enableSpector && import.meta.env.DEV) {
            import('spectorjs').then(({ Spector }) => {
                const spector = new Spector();
                spector.displayUI();
            });
        }
    }

    private renderScene(framebuffer: Framebuffer, shaderProgram: ShaderProgram, camera: Camera, clearColor: Color | null, layers: WebglRendererLayer[]) {
        this.bindFbo(framebuffer);

        this.setBlendMode("alpha");

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

        this.bindFbo(null);
    }

    private renderLights(scene: Scene, camera: Camera) {
        const cameraBounds = camera.getBounds();
        const sceneLights = scene.getLights().filter(light => {
            return overlaps(cameraBounds, light.getBounds());
        });
        const sceneColliders = scene.getColliders(cameraBounds).filter(c => c.castShadow);
        for (let i = 0; i < sceneColliders.length; ++i) {
            sceneColliders[i]._index = i;
        }

        const colliderIndices = sceneLights.map(light => scene.getColliders(light.getBounds()).map(c => c._index).filter(idx => idx !== null));
        const { drawCalls, vertices } = shadowGeometryModule.initShadowBuffer(sceneLights, sceneColliders, colliderIndices);

        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.shadowsVbo);

        this.gl.bufferSubData(this.gl.ARRAY_BUFFER, 0, vertices);

        this.bindFbo(this.framebuffers[TextureID.LIGHTMAP]);
        this.gl.clearColor(
            scene.ambientColor.r * scene.ambientIntensity,
            scene.ambientColor.g * scene.ambientIntensity,
            scene.ambientColor.b * scene.ambientIntensity,
            1.0
        );
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);

        const lightPosLoc = this.lightShaderProgram.getAttrib("aVertexPos");
        const shadowPosLoc = this.shadowShaderProgram.getAttrib("aPos");

        for (let i = 0; i < sceneLights.length; ++i) {
            const light = sceneLights[i];
            const shadowDrawCall = drawCalls[i];

            const lightBounds = light.getBounds();

            const lightScissor: [number, number, number, number] = [
                lightBounds.min.x - cameraBounds.min.x,
                lightBounds.min.y - cameraBounds.min.y,
                getWidth(lightBounds),
                getHeight(lightBounds)
            ];

            this.bindFbo(this.framebuffers[TextureID.LIGHTMAP + 1]);

            this.gl.enable(this.gl.STENCIL_TEST);

            this.gl.clearColor(0, 0, 0, 1);
            this.gl.clearStencil(0);
            this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.STENCIL_BUFFER_BIT);

            this.setBlendMode("none");

            this.setScissor(lightScissor);

            // Shadows

            if (shadowDrawCall.count !== 0) {
                this.gl.colorMask(false, false, false, false);

                this.gl.stencilFunc(this.gl.ALWAYS, 1, 0xFF);
                this.gl.stencilOp(this.gl.KEEP, this.gl.KEEP, this.gl.REPLACE);

                this.shadowShaderProgram.use();

                this.gl.uniform2f(this.shadowShaderProgram.getUniform("uViewportDimensions"), camera.vw, camera.vh);
                this.gl.uniform2fv(this.shadowShaderProgram.getUniform("uCameraPos"), camera.position.toArray());

                this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.shadowsVbo);
                this.gl.enableVertexAttribArray(shadowPosLoc);
                this.gl.vertexAttribPointer(shadowPosLoc, 2, this.gl.FLOAT, false, 8, 0);

                this.gl.drawArrays(this.gl.TRIANGLES, shadowDrawCall.offset, shadowDrawCall.count);

                this.gl.disableVertexAttribArray(shadowPosLoc);
            }

            // Light

            this.gl.colorMask(true, true, true, true);
            this.gl.stencilFunc(this.gl.EQUAL, 0, 0xFF);
            this.gl.stencilOp(this.gl.KEEP, this.gl.KEEP, this.gl.KEEP);

            this.lightShaderProgram.use();

            this.gl.uniform2f(this.lightShaderProgram.getUniform("uViewportDimensions"), camera.vw, camera.vh);
            this.gl.uniform2f(this.lightShaderProgram.getUniform("uCameraPos"), camera.position.x, camera.position.y);

            this.gl.uniform2fv(this.lightShaderProgram.getUniform("light.center"), light.worldPosition.toArray());
            this.gl.uniform1f(this.lightShaderProgram.getUniform("light.radius"), light.radius);
            this.gl.uniform3f(this.lightShaderProgram.getUniform("light.color"), light.color.r, light.color.g, light.color.b);
            this.gl.uniform1f(this.lightShaderProgram.getUniform("light.intensity"), light.intensity);
            this.gl.uniform2fv(this.lightShaderProgram.getUniform("light.direction"), light.direction.toArray());
            this.gl.uniform1f(this.lightShaderProgram.getUniform("light.outerCutoff"), light.outerCutoff);
            this.gl.uniform1f(this.lightShaderProgram.getUniform("light.innerCutoff"), light.innerCutoff);

            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vbo);
            this.gl.enableVertexAttribArray(lightPosLoc);
            this.gl.vertexAttribPointer(lightPosLoc, 2, this.gl.FLOAT, false, 16, 0);

            this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);

            this.gl.disableVertexAttribArray(lightPosLoc);

            this.gl.colorMask(true, true, true, true);
            this.gl.disable(this.gl.STENCIL_TEST);

            this.setScissor(null);

            this.bindFbo(this.framebuffers[TextureID.LIGHTMAP + 1]);

            this.renderFullscreenPass({ shader: "default_additive", inputs: [TextureID.LIGHTMAP + 1], output: TextureID.LIGHTMAP, scissor: lightScissor });
        }

        for (let i = 0; i < sceneColliders.length; ++i) {
            sceneColliders[i]._index = null;
        }

    }

    private renderFullscreenPass(pass: RenderPass) {
        const shaderInfo = this.shaderMap.get(pass.shader);
        if (!shaderInfo) {
            throw new Error("Unknown shader " + pass.shader);
        }

        const shader = shaderInfo.shader!;

        let sw = this.canvas.width, sh = this.canvas.height;
        if (pass.output !== -1) {
            const outFbo = this.framebuffers[pass.output];
            sw = outFbo.width;
            sh = outFbo.height;
            this.bindFbo(outFbo);
        } else {
            this.gl.viewport(0, 0, sw, sh);
        }

        if (pass.clearColor) {
            this.gl.clearColor(pass.clearColor.r, pass.clearColor.g, pass.clearColor.b, pass.clearColor.a);
            this.gl.clear(this.gl.COLOR_BUFFER_BIT);
        }

        if (pass.scissor) {
            this.setScissor(pass.scissor);
        }

        this.setBlendMode(shaderInfo.blendMode);

        shader.use();

        const passUniforms = [{ name: "time", value: this.time }, { name: "resolution", value: [sw, sh] }].concat(pass.uniforms ?? []);

        const uniforms = shaderInfo.builder.getUniforms();
        for (let uniform of uniforms) {
            const passUniform = passUniforms.find(elem => elem.name === uniform.name);
            if (passUniform) {
                const value = typeof passUniform.value === "number" ? [passUniform.value] : passUniform.value;
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

        for (let c = 0; c < limits.textureChannels; c++) {
            const texIndex = pass.inputs[c] ?? pass.inputs[0];
            const texture = this.framebuffers[texIndex].texture;

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

        for (let c = 0; c < limits.textureChannels; c++) {
            this.gl.activeTexture(this.gl.TEXTURE0 + c);
            this.gl.bindTexture(this.gl.TEXTURE_2D, null);
        }

        this.setScissor(null);

        if (pass.output !== -1) {
            this.framebuffers[pass.output].unbind();
        }
    }

    public render(scene: Scene, camera: Camera) {
        if (!this.initialized) {
            throw new Error("Renderer not initialized. Call renderer.init() first.");
        }

        if (this.resizeRequested) {
            this.initFramebuffers();
            this.resizeRequested = false;
        }

        const cameraBounds = camera.getBounds();
        this.time = performance.now() * 0.001;

        if (this.gpuTimer.isEnabled()) {
            this.gpuTimer.begin();
        }

        const layers: WebglRendererLayer[] = [];
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
        }

        this.renderLights(scene, camera);
        this.renderScene(this.framebuffers[TextureID.SCENE], this.shaderProgram, camera, this.clearColor, layers);
        this.renderScene(this.framebuffers[TextureID.MASK], this.maskShaderProgram, camera, maskClearColor, layers);

        for (const pass of this.pipeline) {
            this.renderFullscreenPass(pass);
        }

        this.lineRenderer.render(camera);
        this.lineRenderer.clear();

        if (this.gpuTimer.isEnabled()) {
            this.gpuTimer.end();
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
        gl.bufferData(gl.ARRAY_BUFFER, (this.isStatic ? limits.staticLayerMaxSprites : limits.dynamicLayerMaxSprites) * geometry.spriteStride * 4, this.isStatic ? gl.STATIC_DRAW : gl.DYNAMIC_DRAW);
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