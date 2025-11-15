import { Camera } from "../Camera";
import { Color } from "../Color";
import { geometry } from "../geometry";
import { DYNAMIC_LAYER_MAX_SPRITES, LAYER_LIFETIME, Renderer, STATIC_LAYER_MAX_SPRITES, TextureInfo } from "../Renderer";
import { Scene, SceneLayer } from "../Scene";
import { Sprite } from "../Sprite";
import { Tileset } from "../Tileset";
import { ShaderProgram } from "./ShaderProgram";

const vertexSource = `

attribute vec2 aVertexPos;
attribute vec2 aTexCoord;
attribute vec2 aTilePos;
attribute vec2 aTileScale;
attribute vec4 aTileRegion;

uniform vec2 uViewportDimensions;
uniform vec2 uCameraPos;

uniform vec2 uTilesetDimensions;

varying vec2 uv;

void main() {
    vec2 flippedTexCoord = vec2(aTexCoord.x, 1.0 - aTexCoord.y);
    uv = (vec2(aTileRegion.xy) + flippedTexCoord * vec2(aTileRegion.zw)) / uTilesetDimensions;

    vec2 worldPos = aVertexPos * aTileScale + aTilePos;
    vec2 pixelPos = worldPos - uCameraPos;
    vec2 clipPos = vec2(pixelPos.x / uViewportDimensions.x, 1.0 - pixelPos.y / uViewportDimensions.y) * 2.0 - 1.0;
    gl_Position = vec4(clipPos, 0.0, 1.0);
}
`;

const fragmentSource = `

precision mediump float;

varying vec2 uv;

uniform sampler2D uSampler;  

void main() {
    gl_FragColor = texture2D(uSampler, uv);
}
`;

interface AttribLocations {
    vertexPos: number;
    texCoord: number;
    tilePos: number;
    tileScale: number;
    tileRegion: number;
}

export class WebglRenderer implements Renderer {
    private canvas: HTMLCanvasElement;
    private gl!: WebGLRenderingContext;
    private shaderProgram!: ShaderProgram;
    private vbo!: WebGLBuffer;
    private ebo!: WebGLBuffer;
    private layersMap: Map<SceneLayer, WebglRendererLayer>;
    private texturesMap: Map<string, { texture: WebGLTexture; tileset: Tileset; }>;
    private attribLocations!: AttribLocations;
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
        const gl = this.canvas.getContext("webgl");
        if (!gl) throw new Error("WebGL not supported");

        this.gl = gl;

        for (const texInfo of this.texturesInfo) {
            if (texInfo.tileset) {
                this.createTexture(texInfo.tileset, texInfo.tileset.name, texInfo.image);
            }
        }

        this.shaderProgram = new ShaderProgram(gl, vertexSource, fragmentSource);

        this.attribLocations = {
            vertexPos: this.shaderProgram.getAttrib("aVertexPos"),
            texCoord: this.shaderProgram.getAttrib("aTexCoord"),
            tilePos: this.shaderProgram.getAttrib("aTilePos"),
            tileScale: this.shaderProgram.getAttrib("aTileScale"),
            tileRegion: this.shaderProgram.getAttrib("aTileRegion")
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

        this.gl.viewport(0, 0, camera.vw, camera.vh);

        this.gl.clearColor(this.clearColor.r, this.clearColor.g, this.clearColor.b, this.clearColor.a);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);

        this.shaderProgram.use();

        this.gl.uniform2f(this.shaderProgram.getUniform("uViewportDimensions"), camera.vw, camera.vh);
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

    public getAttribLocations() {
        return this.attribLocations;
    }

    public createTexture(tileset: Tileset, name: string, imageData: TexImageSource) {
        const gl = this.gl;

        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);

        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageData);

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

        this.texturesMap.set(name, { texture, tileset });
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
        gl.bufferData(gl.ARRAY_BUFFER, (this.isStatic ? STATIC_LAYER_MAX_SPRITES : DYNAMIC_LAYER_MAX_SPRITES) * 5 * 4 * 4, this.isStatic ? gl.STATIC_DRAW : gl.DYNAMIC_DRAW);
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

    public render() {
        const gl = this.gl;

        const attribLocations = this.renderer.getAttribLocations();

        gl.bindBuffer(gl.ARRAY_BUFFER, this.renderer.getVBO());

        gl.enableVertexAttribArray(attribLocations.vertexPos);
        gl.vertexAttribPointer(attribLocations.vertexPos, 2, gl.FLOAT, false, 16, 0);
        gl.enableVertexAttribArray(attribLocations.texCoord);
        gl.vertexAttribPointer(attribLocations.texCoord, 2, gl.FLOAT, false, 16, 8);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.spriteBuffer);

        gl.enableVertexAttribArray(attribLocations.tilePos);
        gl.vertexAttribPointer(attribLocations.tilePos, 2, gl.FLOAT, false, 24, 0);
        gl.enableVertexAttribArray(attribLocations.tileScale);
        gl.vertexAttribPointer(attribLocations.tileScale, 2, gl.FLOAT, false, 24, 8);
        gl.enableVertexAttribArray(attribLocations.tileRegion);
        gl.vertexAttribPointer(attribLocations.tileRegion, 4, gl.UNSIGNED_SHORT, false, 24, 16);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.renderer.getEBO());

        for (const drawCall of this.drawCalls) {
            const texInfo = this.renderer.getTextureInfo(drawCall.texName);
            gl.bindTexture(gl.TEXTURE_2D, texInfo.texture);

            this.gl.uniform2f(this.renderer.getShaderProgram().getUniform("uTilesetDimensions"), texInfo.tileset.imageWidth, texInfo.tileset.imageHeight);

            gl.drawElements(gl.TRIANGLES, 6 * drawCall.spriteCount, gl.UNSIGNED_SHORT, drawCall.spriteOffset * 6 * 2);
        }

        this.lifetime = LAYER_LIFETIME;
    }

    public destroy() {
        this.gl.deleteBuffer(this.spriteBuffer);
    }
}