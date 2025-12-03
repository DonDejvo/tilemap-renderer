import { Camera } from "../Camera";
import { geometry } from "../geometry";
import { LineRenderer, MAX_LINES } from "../LineRenderer";
import { ShaderProgram, worldToClipVertex } from "./ShaderProgram";

const lineVertex = `
attribute vec2 aPos;
attribute vec4 aColor;

uniform vec2 uCameraPos;
uniform vec2 uViewportDimensions;

varying vec4 color;

${worldToClipVertex}

void main() {
    color = aColor;
    gl_Position = worldToClip(aPos, uCameraPos, uViewportDimensions);
}
`;

const lineFragment = `
precision mediump float;

varying vec4 color;

void main() {
    gl_FragColor = color;
}
`;

export class WebglLineRenderer extends LineRenderer {
    private gl: WebGLRenderingContext | WebGL2RenderingContext;
    private vbo!: WebGLBuffer;
    private shaderProgram!: ShaderProgram;

    constructor(gl: WebGLRenderingContext | WebGL2RenderingContext) {
        super();
        this.gl = gl;
    }

    init() {
        this.shaderProgram = new ShaderProgram(this.gl, lineVertex, lineFragment);

        this.vbo = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vbo);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, MAX_LINES * geometry.lineStride * 4 * 2, this.gl.DYNAMIC_DRAW);
    }

    render(camera: Camera) {
        if(this.lines.length === 0) return;

        this.shaderProgram.use();

        this.gl.uniform2f(this.shaderProgram.getUniform("uViewportDimensions"), camera.vw, camera.vh);
        this.gl.uniform2f(this.shaderProgram.getUniform("uCameraPos"), camera.position.x, camera.position.y);

        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vbo);
        this.gl.bufferSubData(this.gl.ARRAY_BUFFER, 0, geometry.createLinesGeometry(this.lines));

        const attribLocations = {
            pos: this.shaderProgram.getAttrib("aPos"),
            color: this.shaderProgram.getAttrib("aColor")
        }

        this.gl.enableVertexAttribArray(attribLocations.pos);
        this.gl.vertexAttribPointer(attribLocations.pos, 2, this.gl.FLOAT, false, geometry.lineStride * 4, 0);
        this.gl.enableVertexAttribArray(attribLocations.color);
        this.gl.vertexAttribPointer(attribLocations.color, 4, this.gl.FLOAT, false, geometry.lineStride * 4, 8);

        this.gl.drawArrays(this.gl.LINES, 0, 2 * this.lines.length);

        this.gl.disableVertexAttribArray(attribLocations.pos);
        this.gl.disableVertexAttribArray(attribLocations.color);
    }
}