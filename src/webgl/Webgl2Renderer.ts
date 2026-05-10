import { Camera } from "../Camera";
import { Color } from "../Color";
import { getHeight, getWidth, overlaps } from "../bounds";
import { geometry } from "../geometry";
import { LineRenderer } from "../LineRenderer";
import { BlendMode, defaultPass, getOffscreenTextureSizeFactor, LAYER_LIFETIME, maskClearColor, Renderer, RendererBuilderOptions, RendererType, RenderPass, TEXTURE_CHANNELS, TextureInfo } from "../Renderer";
import { Scene, SceneLayer } from "../Scene";
import { ShaderBuilderOutput, ShaderBuilder, shaders } from "../ShaderBuilder";
import { Sprite } from "../Sprite";
import { Tileset } from "../Tileset";
import { Framebuffer } from "./Framebuffer";
import { ShaderProgram } from "./ShaderProgram";
import { WebglLineRenderer } from "./WebglLineRenderer";
import { shadowGeometryModule } from "../wasm/shadowGeometryModule";
import { limits } from "../limits";
import { lightStruct, textureChannels, worldToClipVertex } from "./common";
import { TextureID } from "../TextureID";

const mainVertex = `#version 300 es

layout(location = 0) in vec2 aVertexPos;
layout(location = 1) in vec2 aTexCoord;
layout(location = 2) in vec2 aTilePos;
layout(location = 3) in vec2 aTileScale;
layout(location = 4) in float aTileAngle;
layout(location = 5) in uvec4 aTileRegion;
layout(location = 6) in vec4 aTintColor;
layout(location = 7) in vec4 aMaskColor;

uniform vec2 uViewportDimensions;
uniform vec2 uCameraPos;

uniform vec2 uTilesetDimensions;

out vec2 uv;
out vec4 tintColor;
out vec4 maskColor;

${worldToClipVertex}

void main() {
    tintColor = aTintColor;
    maskColor = aMaskColor;

    vec2 flippedTexCoord = vec2(aTexCoord.x, 1.0 - aTexCoord.y);
    uv = (vec2(aTileRegion.xy) + flippedTexCoord * vec2(aTileRegion.zw)) / uTilesetDimensions;

    float c = cos(aTileAngle);
    float s = sin(aTileAngle);
    vec2 scaledPos = aVertexPos * abs(aTileScale);
    vec2 rotatedPos = vec2(
        scaledPos.x * c - scaledPos.y * s,
        scaledPos.x * s + scaledPos.y * c
    );
    vec2 worldPos = rotatedPos + aTilePos;

    gl_Position = worldToClip(worldPos, uCameraPos, uViewportDimensions);
}
`;

const mainFragment = `#version 300 es

precision mediump float;

in vec2 uv;
in vec4 tintColor;

uniform mediump sampler2D uSampler;

out vec4 fragColor;

void main() {
    fragColor = texture(uSampler, uv) * tintColor;
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

const lightVertex = `#version 300 es
precision mediump float;

layout(location = 0) in vec2 aVertexPos;

${lightStruct}

uniform Light light;

uniform vec2 uCameraPos;
uniform vec2 uViewportDimensions;

out vec2 worldPos;

${worldToClipVertex}

void main() {
    worldPos = light.center + (aVertexPos - 0.5) * 2.0 * light.radius;

    gl_Position = worldToClip(worldPos, uCameraPos, uViewportDimensions);
}
`;

const lightFragment = `#version 300 es

precision mediump float;

in vec2 worldPos;

${lightStruct}

uniform Light light;

out vec4 fragColor;

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

    fragColor = vec4(light.color * light.intensity * attenuation * spotFactor, 1.0);
}
`;

const shadowVertex = `#version 300 es

layout(location = 0) in vec2 aPos;

uniform vec2 uCameraPos;
uniform vec2 uViewportDimensions;

${worldToClipVertex}

void main() {
    gl_Position = worldToClip(aPos, uCameraPos, uViewportDimensions);
}
`;

const shadowFragment = `#version 300 es

void main() {
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

${textureChannels(TEXTURE_CHANNELS)}

uniform Uniforms uniforms;

out vec4 glFragColor;

${input.functions.join("\n\n")}

void main() {
    vec2 fragCoord = gl_FragCoord.xy;
    glFragColor = mainImage(fragCoord);
}
`;

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

export class Webgl2Renderer implements Renderer {
    private canvas: HTMLCanvasElement;
    private gl!: WebGL2RenderingContext;
    private shaderProgram!: ShaderProgram;
    private maskShaderProgram!: ShaderProgram;
    private lightShaderProgram!: ShaderProgram;
    private shadowShaderProgram!: ShaderProgram;
    private framebuffers: Framebuffer[];
    private vbo!: WebGLBuffer;
    private layersMap: Map<SceneLayer, WebglRendererLayer>;
    private texturesMap: Map<string, TextureInfo>;
    private shaderMap: Map<string, { shader?: ShaderProgram, builder: ShaderBuilder, blendMode: BlendMode }>;
    public clearColor: Color;
    private initialized: boolean;
    public pipeline: RenderPass[];
    private time: number;
    private lightVao!: WebGLVertexArrayObject;
    private shadowsVao!: WebGLVertexArrayObject;
    private shadowsVbo!: WebGLBuffer;
    private shaderCache: Map<ShaderBuilder, ShaderProgram>;
    private resizeRequested: boolean;
    private lineRenderer!: WebglLineRenderer;
    private nextTextureIdx: number = 0;
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
        this.time = 0;
        this.shaderCache = new Map();
        this.resizeRequested = false;
    }

    public getLineRenderer(): LineRenderer {
        return this.lineRenderer;
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
            const n = getOffscreenTextureSizeFactor(i)
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
        const gl = this.canvas.getContext("webgl2", {
            powerPreference: "high-performance"
        });
        if (!gl) throw new Error("WebGL2 not supported");

        this.gl = gl;

        for (const texInfo of this.texturesMap.values()) {
            if (texInfo.tileset) {
                texInfo.texture = this.createTexture(texInfo.image);
            }
        }

        this.initFramebuffers();

        for (let shader of shaders) {
            this.registerShader(shader.name, shader.builder, shader.blendMode);
        }

        for (const [shaderName, shaderInfo] of this.shaderMap.entries()) {
            if (!this.shaderCache.has(shaderInfo.builder)) {
                const mainImageBody = shaderInfo.builder.build(this);
                const shader = new ShaderProgram(gl, fullscreenVertex, fullscreenFragment(mainImageBody), "Fullscreen Shader Program \"" + shaderName + "\"");
                this.shaderCache.set(shaderInfo.builder, shader);
            }
            shaderInfo.shader = this.shaderCache.get(shaderInfo.builder)!;
        }

        this.shaderProgram = new ShaderProgram(gl, mainVertex, mainFragment, "Main Shader Program");
        this.maskShaderProgram = new ShaderProgram(gl, mainVertex, maskFragment, "Mask Shader Program");
        this.lightShaderProgram = new ShaderProgram(gl, lightVertex, lightFragment, "Light Shader Program");
        this.shadowShaderProgram = new ShaderProgram(gl, shadowVertex, shadowFragment, "Shadow Shader Program");

        this.vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
        gl.bufferData(gl.ARRAY_BUFFER, geometry.quad, gl.STATIC_DRAW);

        this.lightVao = gl.createVertexArray();
        gl.bindVertexArray(this.lightVao);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);

        gl.bindVertexArray(null);

        this.shadowsVbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.shadowsVbo);
        gl.bufferData(gl.ARRAY_BUFFER, limits.maxLights * limits.shadowPerLightMaxTriangles * 24, gl.DYNAMIC_DRAW);

        this.shadowsVao = gl.createVertexArray();
        gl.bindVertexArray(this.shadowsVao);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.shadowsVbo);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);

        gl.bindVertexArray(null);

        this.lineRenderer = new WebglLineRenderer(gl);
        this.lineRenderer.init();

        this.initialized = true;

        if (this.enableSpector && import.meta.env.DEV) {
            import('spectorjs').then(({ Spector }) => {
                const spector = new Spector();
                spector.displayUI();
            });
        }
    }

    private renderScene(framebuffer: Framebuffer, shaderProgram: ShaderProgram, camera: Camera, clearColor: Color | null, layers: WebglRendererLayer[]) {
        framebuffer.bind();

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

        framebuffer.unbind();
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

        this.gl.bufferSubData(this.gl.ARRAY_BUFFER, 0, new Float32Array(vertices));

        this.bindFbo(this.framebuffers[TextureID.LIGHTMAP]);
        this.gl.clearColor(
            scene.ambientColor.r * scene.ambientIntensity,
            scene.ambientColor.g * scene.ambientIntensity,
            scene.ambientColor.b * scene.ambientIntensity,
            1.0
        );
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);

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

                this.gl.bindVertexArray(this.shadowsVao);
                this.gl.drawArrays(this.gl.TRIANGLES, shadowDrawCall.offset, shadowDrawCall.count);
                this.gl.bindVertexArray(null);
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

            this.gl.bindVertexArray(this.lightVao);
            this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
            this.gl.bindVertexArray(null);

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

        for (let c = 0; c < TEXTURE_CHANNELS; c++) {
            const texIndex = pass.inputs[c] ?? pass.inputs[0];
            const texture = this.framebuffers[texIndex].texture;

            this.gl.activeTexture(this.gl.TEXTURE0 + c);
            this.gl.bindTexture(this.gl.TEXTURE_2D, texture);

            const loc = shader.getUniform(`uChannel${c}`);
            this.gl.uniform1i(loc, c);
        }

        this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);

        for (let c = 0; c < TEXTURE_CHANNELS; c++) {
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
    offset: number;
    count: number;
}

class WebglRendererLayer {
    private gl: WebGL2RenderingContext;
    private renderer: Webgl2Renderer;
    private instanceBuffer: WebGLBuffer;
    private instanceData: ArrayBuffer;
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

        this.instanceData = new ArrayBuffer(geometry.spriteStride * (isStatic ? limits.staticLayerMaxSprites : limits.dynamicLayerMaxSprites));

        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);

        gl.bindBuffer(gl.ARRAY_BUFFER, renderer.getVBO());

        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);

        this.instanceBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);

        const stride = geometry.spriteStride;
        gl.bufferData(gl.ARRAY_BUFFER, (this.isStatic ? limits.staticLayerMaxSprites : limits.dynamicLayerMaxSprites) * stride, this.isStatic ? gl.STATIC_DRAW : gl.DYNAMIC_DRAW);

        for (let i = 2; i <= 7; ++i) {
            gl.enableVertexAttribArray(i);
            gl.vertexAttribDivisor(i, 1);
        }

        gl.bindVertexArray(null);
    }

    public uploadSprites(sprites: Sprite[]) {
        const gl = this.gl;

        geometry.createSpritesData(this.instanceData, sprites, true);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Uint8Array(this.instanceData), 0, sprites.length * geometry.spriteStride);            

        if (this.isStatic) {
            this.needsUpdate = false;
        }

        this.drawCalls.length = 0;

        let currentCall: DrawCall | null = null;

        for (let i = 0; i < sprites.length; ++i) {
            const texName = sprites[i].tileset.name;

            if (!currentCall || texName !== currentCall.texName) {
                currentCall = { texName, offset: i, count: 1 };
                this.drawCalls.push(currentCall);
            } else {
                currentCall.count++;
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

            gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);

            const stride = geometry.spriteStride;
            const instanceByteOffset = drawCall.offset * stride;

            gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 0 + instanceByteOffset);
            gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 8 + instanceByteOffset);
            gl.vertexAttribPointer(4, 1, gl.FLOAT, false, stride, 16 + instanceByteOffset);
            gl.vertexAttribIPointer(5, 4, gl.UNSIGNED_SHORT, stride, 20 + instanceByteOffset);
            gl.vertexAttribPointer(6, 4, gl.UNSIGNED_BYTE, true, stride, 28 + instanceByteOffset);
            gl.vertexAttribPointer(7, 4, gl.UNSIGNED_BYTE, true, stride, 32 + instanceByteOffset);

            gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, drawCall.count);
        }

        gl.bindVertexArray(null);

        this.lifetime = LAYER_LIFETIME;
    }

    public destroy() {
        this.gl.deleteBuffer(this.instanceBuffer);
        this.gl.deleteVertexArray(this.vao);
    }
}