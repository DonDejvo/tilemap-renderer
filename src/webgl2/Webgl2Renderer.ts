import { Camera } from "../Camera";
import { Color } from "../Color";
import { geometry } from "../geometry";
import { imageUtils } from "../imageUtils";
import { DYNAMIC_LAYER_MAX_SPRITES, Renderer, STATIC_LAYER_MAX_SPRITES, TextureInfo } from "../Renderer";
import { Scene } from "../Scene";
import { Sprite } from "../Sprite";
import { Tileset } from "../Tileset";
import { ShaderProgram } from "../webgl/ShaderProgram";

const vertexSource = `#version 300 es

layout(location = 0) in vec2 aVertexPos;
layout(location = 1) in vec2 aTexCoord;
layout(location = 2) in vec2 aTilePos;
layout(location = 3) in vec2 aTileScale;
layout(location = 4) in float aDepth;

uniform mat4 uProjectionMatrix;
uniform vec2 uCameraPos;

out vec2 vTexCoord;
out float vDepth;

void main() {
    vTexCoord = aTexCoord;
    vDepth = aDepth;

    vec2 worldPos = aVertexPos * aTileScale + aTilePos;
    gl_Position = uProjectionMatrix * vec4(worldPos - uCameraPos, 0.0, 1.0);
}
`;

const fragmentSource = `#version 300 es

precision mediump float;

in vec2 vTexCoord;
in float vDepth;

uniform mediump sampler2DArray uSampler;  

out vec4 fragColor;

void main() {
    fragColor = texture(uSampler, vec3(vTexCoord, vDepth));
}
`;

export class Webgl2Renderer implements Renderer {
    private canvas: HTMLCanvasElement;
    private gl!: WebGL2RenderingContext;
    private shaderProgram!: ShaderProgram;
    private vbo!: WebGLBuffer;
    private layersMap: Map<string, WebglRendererLayer>;
    private texturesMap: Map<string, { texture: WebGLTexture; tileset: Tileset; }>;
    private clearColor: Color;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.layersMap = new Map();
        this.texturesMap = new Map();
        this.clearColor = new Color(0, 0, 0, 0);
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

    public async init(texturesInfo: TextureInfo[]) {
        const gl = this.canvas.getContext("webgl2");
        if (!gl) throw new Error("WebGL2 not supported");

        this.gl = gl;

        for (const texInfo of texturesInfo) {
            if (texInfo.tileset) {
                this.createTexture(texInfo.tileset, texInfo.tileset.name, imageUtils.getImageData(texInfo.image));
            }
        }

        this.shaderProgram = new ShaderProgram(gl, vertexSource, fragmentSource);

        this.vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
        gl.bufferData(gl.ARRAY_BUFFER, geometry.quad, gl.STATIC_DRAW);
    }

    public render(scene: Scene, camera: Camera) {
        const layers: WebglRendererLayer[] = [];
        for (const sceneLayer of scene.layers.toSorted((layer1, layer2) => layer1.zIndex - layer2.zIndex)) {
            const key = sceneLayer.getKey();
            if (!this.layersMap.has(key)) {
                const layer = new WebglRendererLayer(this.gl, this, sceneLayer.isStatic, sceneLayer.atlasName);
                this.layersMap.set(key, layer);
            }
            const layer = this.layersMap.get(key)!;
            if (layer.needsUpdate) {
                layer.upload(sceneLayer.sprites);
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
    }

    public getTextureInfo(name: string) {
        const texInfo = this.texturesMap.get(name);
        if (!texInfo) throw new Error("Texture not found: " + name);
        return texInfo;
    }

    public getVBO() {
        return this.vbo;
    }

    public createTexture(tileset: Tileset, name: string, imageData: Uint8Array) {
        const gl = this.gl;

        const pbo = gl.createBuffer();
        gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, pbo);
        gl.bufferData(gl.PIXEL_UNPACK_BUFFER, imageData, gl.STATIC_DRAW);

        gl.pixelStorei(gl.UNPACK_ROW_LENGTH, tileset.imageWidth);
        gl.pixelStorei(gl.UNPACK_IMAGE_HEIGHT, tileset.imageHeight);

        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
        gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 4, gl.RGBA8, tileset.tileSize, tileset.tileSize, tileset.totalTiles);

        for (let i = 0; i < tileset.totalTiles; ++i) {
            const col = i % tileset.tilesPerRow;
            const row = Math.floor(i / tileset.tilesPerRow);

            gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, col * tileset.tileSize);
            gl.pixelStorei(gl.UNPACK_SKIP_ROWS, row * tileset.tileSize);

            gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, tileset.tileSize, tileset.tileSize, 1, gl.RGBA, gl.UNSIGNED_BYTE, 0);
        }

        gl.deleteBuffer(pbo);

        gl.generateMipmap(gl.TEXTURE_2D_ARRAY);

        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);

        this.texturesMap.set(name, { texture, tileset });
    }
}

class WebglRendererLayer {
    private gl: WebGL2RenderingContext;
    private renderer: Webgl2Renderer;
    private instanceBuffer: WebGLBuffer;
    private vao: WebGLVertexArrayObject;
    isStatic: boolean;
    texName: string;
    needsUpdate: boolean;
    instanceCount: number;

    constructor(gl: WebGL2RenderingContext, renderer: Webgl2Renderer, isStatic: boolean, texName: string) {
        this.gl = gl;
        this.renderer = renderer;
        this.isStatic = isStatic;
        this.texName = texName;
        this.needsUpdate = true;
        this.instanceCount = 0;

        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);

        gl.bindBuffer(gl.ARRAY_BUFFER, renderer.getVBO());

        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);

        this.instanceBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, (this.isStatic ? STATIC_LAYER_MAX_SPRITES : DYNAMIC_LAYER_MAX_SPRITES) * 5 * 4, this.isStatic ? gl.STATIC_DRAW : gl.DYNAMIC_DRAW);

        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 20, 0);
        gl.vertexAttribDivisor(2, 1);
        gl.enableVertexAttribArray(3);
        gl.vertexAttribPointer(3, 2, gl.FLOAT, false, 20, 8);
        gl.vertexAttribDivisor(3, 1);
        gl.enableVertexAttribArray(4);
        gl.vertexAttribPointer(4, 1, gl.FLOAT, false, 20, 16);
        gl.vertexAttribDivisor(4, 1);

        gl.bindVertexArray(null);
    }

    public upload(sprites: Sprite[]) {
        const gl = this.gl;

        gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, geometry.createSpritesData(sprites));

        if (this.isStatic) {
            this.needsUpdate = false;
        }

        this.instanceCount = sprites.length;
    }

    public render() {
        const gl = this.gl;

        gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.renderer.getTextureInfo(this.texName).texture);

        gl.bindVertexArray(this.vao)
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.instanceCount);
        gl.bindVertexArray(null);
    }
}