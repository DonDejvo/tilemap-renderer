export const worldToClipVertex = `vec4 worldToClip(vec2 worldPos, vec2 cameraPos, vec2 viewport) {
    vec2 pixelPos = worldPos - cameraPos;
    vec2 clipPos = vec2(pixelPos.x / viewport.x, 1.0 - pixelPos.y / viewport.y) * 2.0 - 1.0;
    return vec4(clipPos, 0.0, 1.0);
}
`;

export const lightStruct = `struct Light {
    vec2 center;
    float radius;
    vec3 color;
    float intensity;
    vec2 direction;
    float outerCutoff;
    float innerCutoff;
};`;

class ShaderError extends Error {
    constructor(message: string) {
        super("Shader Error: " + message);
    }
}

export class ShaderProgram {
    private gl: WebGL2RenderingContext | WebGLRenderingContext;
    private program: WebGLProgram;
    private uniforms: Map<string, WebGLUniformLocation | null>;
    private attribs: Map<string, number>;

    constructor(gl: WebGL2RenderingContext | WebGLRenderingContext, vertSource: string, fragSource: string) {
        this.gl = gl;
        this.uniforms = new Map();
        this.attribs = new Map();

        const vertexShader = this.compileShader(gl.VERTEX_SHADER, vertSource);
        const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fragSource);

        this.program = gl.createProgram();

        gl.attachShader(this.program, vertexShader);
        gl.attachShader(this.program, fragmentShader);

        gl.linkProgram(this.program);
        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
            throw new ShaderError(gl.getProgramInfoLog(this.program) ?? "Failed to link program");
        }
    }

    private compileShader(type: number, source: string) {
        const shader = this.gl.createShader(type);
        if (!shader) throw new ShaderError("Failed to create shader");

        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);

        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            throw new ShaderError(this.gl.getShaderInfoLog(shader) ?? "Failed to compile shader");
        }

        return shader;
    }

    public use() {
        this.gl.useProgram(this.program);
    }

    public getUniform(name: string) {
        if (!this.uniforms.has(name)) {
            const loc = this.gl.getUniformLocation(this.program, name);
            this.uniforms.set(name, loc);
        }

        return this.uniforms.get(name)!;
    }

    public getAttrib(name: string) {
        if (!this.attribs.has(name)) {
            this.attribs.set(name, this.gl.getAttribLocation(this.program, name));
        }
        return this.attribs.get(name)!;
    }
}