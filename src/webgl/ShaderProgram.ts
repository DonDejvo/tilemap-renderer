class ShaderError extends Error {
    constructor(label: string, message: string) {
        super(label + ": " + message);
    }
}

export class ShaderProgram {
    private gl: WebGL2RenderingContext | WebGLRenderingContext;
    private program: WebGLProgram;
    private uniforms: Map<string, WebGLUniformLocation | null>;
    private attribs: Map<string, number>;
    public readonly label: string;

    constructor(gl: WebGL2RenderingContext | WebGLRenderingContext, vertSource: string, fragSource: string, label: string = "Unlabeled Shader Program") {
        this.gl = gl;
        this.uniforms = new Map();
        this.attribs = new Map();

        this.label = label;

        const vertexShader = this.compileShader(gl.VERTEX_SHADER, vertSource);
        const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fragSource);

        this.program = gl.createProgram();

        gl.attachShader(this.program, vertexShader);
        gl.attachShader(this.program, fragmentShader);

        gl.linkProgram(this.program);
        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
            throw new ShaderError(this.label, gl.getProgramInfoLog(this.program) ?? "Failed to link program");
        }
    }

    private compileShader(type: number, source: string) {
        const shader = this.gl.createShader(type);
        if (!shader) throw new ShaderError(this.label, "Failed to create shader");

        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);

        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            throw new ShaderError(this.label, this.gl.getShaderInfoLog(shader) ?? "Failed to compile shader");
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