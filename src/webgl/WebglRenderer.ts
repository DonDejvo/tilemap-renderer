import { Camera } from "../Camera";
import { Color } from "../Color";
import { geometry } from "../geometry";
import { imageUtils } from "../imageUtils";
import { DYNAMIC_LAYER_MAX_SPRITES, Renderer, STATIC_LAYER_MAX_SPRITES, TextureInfo } from "../Renderer";
import { Scene } from "../Scene";
import { Sprite } from "../Sprite";
import { Tileset } from "../Tileset";
import { ShaderProgram } from "./ShaderProgram";

const vertexSource = `

attribute vec2 aVertexPos;
attribute vec2 aTexCoord;
attribute vec2 aTilePos;
attribute vec2 aTileScale;
attribute float aDepth;

uniform mat4 uProjectionMatrix;
uniform vec2 uCameraPos;
uniform vec2 uTilesetDimensions;

varying vec2 vTexCoord;

void main() {
    float col = mod(aDepth, uTilesetDimensions.x);
    float row = floor(aDepth / uTilesetDimensions.x);
    vTexCoord = vec2(aTexCoord.x + col, aTexCoord.y + row) / uTilesetDimensions;

    vec2 worldPos = aVertexPos * aTileScale + aTilePos;
    gl_Position = uProjectionMatrix * vec4(worldPos - uCameraPos, 0.0, 1.0);
}
`;

const fragmentSource = `

precision mediump float;

varying vec2 vTexCoord;

uniform sampler2D uSampler;  

void main() {
    gl_FragColor = texture2D(uSampler, vTexCoord);
}
`;

interface AttribLocations {
    vertexPos: number;
    texCoord: number;
    tilePos: number;
    tileScale: number;
    depth: number;
}

export class WebglRenderer implements Renderer {
    private canvas: HTMLCanvasElement;
    private gl!: WebGLRenderingContext;
    private shaderProgram!: ShaderProgram;
    private vbo!: WebGLBuffer;
    private ebo!: WebGLBuffer;
    private layersMap: Map<string, WebglRendererLayer>;
    private texturesMap: Map<string, { texture: WebGLTexture; tileset: Tileset; }>;
    private attribLocations!: AttribLocations;
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
        const gl = this.canvas.getContext("webgl");
        if (!gl) throw new Error("WebGL not supported");

        this.gl = gl;

        for (const texInfo of texturesInfo) {
            if (texInfo.tileset) {
                this.createTexture(texInfo.tileset, texInfo.tileset.name, imageUtils.getImageData(texInfo.image));
            }
        }

        this.shaderProgram = new ShaderProgram(gl, vertexSource, fragmentSource);

        this.attribLocations = {
            vertexPos: this.shaderProgram.getAttrib("aVertexPos"),
            texCoord: this.shaderProgram.getAttrib("aTexCoord"),
            tilePos: this.shaderProgram.getAttrib("aTilePos"),
            tileScale: this.shaderProgram.getAttrib("aTileScale"),
            depth: this.shaderProgram.getAttrib("aDepth")
        };

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

        this.gl.clearColor(this.clearColor.r, this.clearColor.g, this.clearColor.b, this.clearColor.a);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);

        this.shaderProgram.use();

        this.gl.uniformMatrix4fv(this.shaderProgram.getUniform("uProjectionMatrix"), false, camera.projectionMatrix);
        this.gl.uniform2f(this.shaderProgram.getUniform("uCameraPos"), camera.position.x, camera.position.y);

        for (let layer of layers) {
            const texInfo = this.getTextureInfo(layer.texName);
            const tilesetCols = texInfo.tileset.tilesPerRow;
            const tilesetRows = Math.floor(texInfo.tileset.totalTiles / texInfo.tileset.tilesPerRow);
            this.gl.uniform2f(this.shaderProgram.getUniform("uTilesetDimensions"), tilesetCols, tilesetRows);
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

    public getEBO() {
        return this.ebo;
    }

    public getAttribLocations() {
        return this.attribLocations;
    }

    public createTexture(tileset: Tileset, name: string, imageData: Uint8Array) {
        const gl = this.gl;

        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, tileset.imageWidth, tileset.imageHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, imageData);

        if (imageUtils.isPowerOf2(tileset.imageWidth) && imageUtils.isPowerOf2(tileset.imageHeight)) {
            gl.generateMipmap(gl.TEXTURE_2D);
        }

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);

        this.texturesMap.set(name, { texture, tileset });
    }
}

class WebglRendererLayer {
    private gl: WebGLRenderingContext;
    private renderer: WebglRenderer;
    private spriteBuffer: WebGLBuffer;
    isStatic: boolean;
    texName: string;
    needsUpdate: boolean;
    spriteCount: number;

    constructor(gl: WebGLRenderingContext, renderer: WebglRenderer, isStatic: boolean, texName: string) {
        this.gl = gl;
        this.renderer = renderer;
        this.isStatic = isStatic;
        this.texName = texName;
        this.needsUpdate = true;
        this.spriteCount = 0;

        this.spriteBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.spriteBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, (this.isStatic ? STATIC_LAYER_MAX_SPRITES : DYNAMIC_LAYER_MAX_SPRITES) * 5 * 4 * 4, this.isStatic ? gl.STATIC_DRAW : gl.DYNAMIC_DRAW);
    }

    public upload(sprites: Sprite[]) {
        const gl = this.gl;

        gl.bindBuffer(gl.ARRAY_BUFFER, this.spriteBuffer);
        const data: number[] = [];
        for (let sprite of sprites) {
            for (let i = 0; i < 4; ++i) {
                data.push(sprite.position.x, sprite.position.y, sprite.scale.x, sprite.scale.y, sprite.tilesetIdx);
            }
        }
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(data));

        if (this.isStatic) {
            this.needsUpdate = false;
        }

        this.spriteCount = sprites.length;
    }

    public render() {
        const gl = this.gl;

        gl.bindTexture(gl.TEXTURE_2D, this.renderer.getTextureInfo(this.texName).texture);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.renderer.getVBO());

        const attribLocations = this.renderer.getAttribLocations();

        gl.enableVertexAttribArray(attribLocations.vertexPos);
        gl.vertexAttribPointer(attribLocations.vertexPos, 2, gl.FLOAT, false, 16, 0);
        gl.enableVertexAttribArray(attribLocations.texCoord);
        gl.vertexAttribPointer(attribLocations.texCoord, 2, gl.FLOAT, false, 16, 8);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.spriteBuffer);

        gl.enableVertexAttribArray(attribLocations.tilePos);
        gl.vertexAttribPointer(attribLocations.tilePos, 2, gl.FLOAT, false, 20, 0);
        gl.enableVertexAttribArray(attribLocations.tileScale);
        gl.vertexAttribPointer(attribLocations.tileScale, 2, gl.FLOAT, false, 20, 8);
        gl.enableVertexAttribArray(attribLocations.depth);
        gl.vertexAttribPointer(attribLocations.depth, 1, gl.FLOAT, false, 20, 16);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.renderer.getEBO());

        gl.drawElements(gl.TRIANGLES, 6 * this.spriteCount, gl.UNSIGNED_SHORT, 0);
    }
}