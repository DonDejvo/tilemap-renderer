import { Camera } from "../Camera";
import { Color } from "../Color";
import { geometry } from "../geometry";
import { DYNAMIC_LAYER_MAX_SPRITES, LAYER_LIFETIME, Renderer, STATIC_LAYER_MAX_SPRITES, TextureInfo } from "../Renderer";
import { Scene, SceneLayer } from "../Scene";
import { Sprite } from "../Sprite";
import { Tileset } from "../Tileset";
import { ShaderProgram } from "../webgl/ShaderProgram";

const vertexSource = `#version 300 es

layout(location = 0) in vec2 aVertexPos;
layout(location = 1) in vec2 aTexCoord;

layout(location = 2) in vec2 aTilePos;
layout(location = 3) in vec2 aTileScale;
layout(location = 4) in uvec4 aTileRegion;

uniform mat4 uProjectionMatrix;
uniform vec2 uCameraPos;

uniform vec2 uTilesetDimensions;

out vec2 uv;

void main() {
    uv = (vec2(aTileRegion.xy) + aTexCoord * vec2(aTileRegion.zw)) / uTilesetDimensions;

    vec2 worldPos = aVertexPos * aTileScale + aTilePos;
    gl_Position = uProjectionMatrix * vec4(worldPos - uCameraPos, 0.0, 1.0);
}
`;

const fragmentSource = `#version 300 es

precision mediump float;

in vec2 uv;

uniform mediump sampler2D uSampler;  

out vec4 fragColor;

void main() {
    fragColor = texture(uSampler, uv);
}
`;

export class Webgl2Renderer implements Renderer {
    private canvas: HTMLCanvasElement;
    private gl!: WebGL2RenderingContext;
    private shaderProgram!: ShaderProgram;
    private vbo!: WebGLBuffer;
    private ebo!: WebGLBuffer;
    private layersMap: Map<SceneLayer, WebglRendererLayer>;
    private texturesMap: Map<string, { texture: WebGLTexture; tileset: Tileset; }>;
    private clearColor: Color;
    private texturesInfo: TextureInfo[];

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.layersMap = new Map();
        this.texturesMap = new Map();
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
        const gl = this.canvas.getContext("webgl2");
        if (!gl) throw new Error("WebGL2 not supported");

        this.gl = gl;

        for (const texInfo of this.texturesInfo) {
            if (texInfo.tileset) {
                this.createTexture(texInfo.tileset, texInfo.tileset.name, texInfo.image);
            }
        }

        this.shaderProgram = new ShaderProgram(gl, vertexSource, fragmentSource);

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

        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);

        this.gl.clearColor(this.clearColor.r, this.clearColor.g, this.clearColor.b, this.clearColor.a);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);

        this.shaderProgram.use();

        this.gl.uniformMatrix4fv(this.shaderProgram.getUniform("uProjectionMatrix"), false, camera.projectionMatrix);
        this.gl.uniform2f(this.shaderProgram.getUniform("uCameraPos"), camera.position.x, camera.position.y);

        for (let layer of layers) {
            layer.render();
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

    public getShaderProgram() {
        return this.shaderProgram;
    }

    public createTexture(tileset: Tileset, name: string, imageData: TexImageSource) {
        const gl = this.gl;

        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, imageData);

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

        this.texturesMap.set(name, { texture, tileset });
    }

    public createTextureArray(tileset: Tileset, name: string, imageData: Uint8Array) {
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

        this.texturesMap.set(name, { texture, tileset });
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

        const stride = 24;

        this.spriteBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.spriteBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, (this.isStatic ? STATIC_LAYER_MAX_SPRITES : DYNAMIC_LAYER_MAX_SPRITES) * 4 * stride, this.isStatic ? gl.STATIC_DRAW : gl.DYNAMIC_DRAW);

        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 0);

        gl.enableVertexAttribArray(3);
        gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 8);

        gl.enableVertexAttribArray(4);
        gl.vertexAttribIPointer(4, 4, gl.UNSIGNED_SHORT, stride, 16);

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
            const texName = sprites[i].tilesetName;

            if (!currentCall || texName !== currentCall.texName) {
                currentCall = { texName, spriteOffset: i, spriteCount: 1 };
                this.drawCalls.push(currentCall);
            } else {
                currentCall.spriteCount++;
            }
        }

    }

    public render() {
        const gl = this.gl;

        gl.bindVertexArray(this.vao);

        for (const drawCall of this.drawCalls) {
            const texInfo = this.renderer.getTextureInfo(drawCall.texName);
            gl.bindTexture(gl.TEXTURE_2D, texInfo.texture);

            const tilesetCols = texInfo.tileset.columns;
            const tilesetRows = Math.floor(texInfo.tileset.tileCount / texInfo.tileset.columns);
            this.gl.uniform2f(this.renderer.getShaderProgram().getUniform("uTilesetDimensions"), tilesetCols, tilesetRows);

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