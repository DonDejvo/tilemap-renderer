import { Camera } from "../camera";
import { createSpritesData, quad } from "../geometry";
import { getImageData } from "../imageUtils";
import { Renderer, TextureInfo } from "../renderer";
import { Scene } from "../scene";
import { Sprite } from "../sprite";
import { SpriteAtlas } from "../sprite-atlas";
import { ShaderProgram } from "./shader-program";

const vertexSource = `#version 300 es

layout(location = 0) in vec2 aVertexPos;
layout(location = 1) in vec2 aTexCoord;
layout(location = 2) in vec2 aTilePos;
layout(location = 3) in vec2 aTileScale;
layout(location = 4) in float aDepth;

uniform mat4 uProjectionMatrix;

out vec2 vTexCoord;
out float vDepth;

void main() {
    vTexCoord = aTexCoord;
    vDepth = aDepth;

    vec2 worldPos = aVertexPos * aTileScale + aTilePos;
    gl_Position = uProjectionMatrix * vec4(worldPos, 0.0, 1.0);
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

export class WebglRenderer implements Renderer {
    private canvas: HTMLCanvasElement;
    private gl!: WebGL2RenderingContext;
    private shaderProgram!: ShaderProgram;
    private vbo!: WebGLBuffer;
    private layersMap: Map<string, WebglRendererLayer>;
    private texturesMap: Map<string, WebGLTexture>;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.layersMap = new Map();
        this.texturesMap = new Map();
    }

    async init(texturesInfo: TextureInfo[]) {
        const gl = this.canvas.getContext("webgl2");
        if (!gl) throw new Error("WebGL2 not supported");

        this.gl = gl;

        for (const texInfo of texturesInfo) {
            if (texInfo.atlas) {
                this.createAtlasTexture(texInfo.atlas, texInfo.name, getImageData(texInfo.imageData));
            }
        }

        this.shaderProgram = new ShaderProgram(gl, vertexSource, fragmentSource);

        this.vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
        gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
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

        this.gl.viewport(0, 0, camera.vw, camera.vh);

        this.gl.clearColor(0.5, 0.5, 0.5, 1);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);

        this.shaderProgram.use();

        this.gl.uniformMatrix4fv(this.shaderProgram.getUniform("uProjectionMatrix"), false, camera.projectionMatrix);

        for (let layer of layers) {
            layer.render();
        }
    }

    public getTexture(name: string) {
        return this.texturesMap.get(name) ?? null;
    }

    public getVBO() {
        return this.vbo;
    }

    public createAtlasTexture(atlas: SpriteAtlas, name: string, imageData: Uint8Array) {
        const gl = this.gl;

        const pbo = gl.createBuffer();
        gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, pbo);
        gl.bufferData(gl.PIXEL_UNPACK_BUFFER, imageData, gl.STATIC_DRAW);

        gl.pixelStorei(gl.UNPACK_ROW_LENGTH, atlas.imageWidth);
        gl.pixelStorei(gl.UNPACK_IMAGE_HEIGHT, atlas.imageHeight);

        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
        gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 4, gl.RGBA8, atlas.tileSize, atlas.tileSize, atlas.totalTiles);

        for (let i = 0; i < atlas.totalTiles; ++i) {
            const col = i % atlas.tilesPerRow;
            const row = Math.floor(i / atlas.tilesPerRow);

            gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, col * atlas.tileSize);
            gl.pixelStorei(gl.UNPACK_SKIP_ROWS, row * atlas.tileSize);

            gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, atlas.tileSize, atlas.tileSize, 1, gl.RGBA, gl.UNSIGNED_BYTE, 0);
        }

        gl.deleteBuffer(pbo);

        gl.generateMipmap(gl.TEXTURE_2D_ARRAY);

        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_NEAREST);

        this.texturesMap.set(name, texture);
    }
}

class WebglRendererLayer {
    private gl: WebGL2RenderingContext;
    private renderer: WebglRenderer;
    private instanceBuffer: WebGLBuffer;
    private vao: WebGLVertexArrayObject;
    isStatic: boolean;
    texName: string;
    needsUpdate: boolean;
    instanceCount: number;

    constructor(gl: WebGL2RenderingContext, rendrer: WebglRenderer, isStatic: boolean, texName: string) {
        this.gl = gl;
        this.renderer = rendrer;
        this.isStatic = isStatic;
        this.texName = texName;
        this.needsUpdate = true;
        this.instanceCount = 0;

        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);

        gl.bindBuffer(gl.ARRAY_BUFFER, rendrer.getVBO());

        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);

        this.instanceBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, (this.isStatic ? 10000 : 1000) * 5 * 4, this.isStatic ? gl.STATIC_DRAW : gl.DYNAMIC_DRAW);

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
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, createSpritesData(sprites));

        if (this.isStatic) {
            this.needsUpdate = false;
        }

        this.instanceCount = sprites.length;
    }

    public render() {
        const gl = this.gl;

        gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.renderer.getTexture(this.texName));

        gl.bindVertexArray(this.vao)
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.instanceCount);
        gl.bindVertexArray(null);
    }
}