export class ShaderProgram {
    private gl: WebGL2RenderingContext | WebGLRenderingContext;
    private program: WebGLProgram;
    private uniforms: Map<string, WebGLUniformLocation | null>;

    constructor(gl: WebGL2RenderingContext | WebGLRenderingContext, vertSource: string, fragSource: string) {
        this.gl = gl;
        this.uniforms = new Map();

        const vertexShader = this.compileShader(gl.VERTEX_SHADER, vertSource);
        const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fragSource);

        this.program = gl.createProgram();

        gl.attachShader(this.program, vertexShader);
        gl.attachShader(this.program, fragmentShader);

        gl.linkProgram(this.program);
        if(!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
            throw new Error(gl.getProgramInfoLog(this.program) ?? "Could not link program");
        }

        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
    }

    private compileShader(type: number, source: string) {
        const shader = this.gl.createShader(type);
        if(!shader) throw new Error("Could not create shader");

        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);

        if(!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            throw new Error(this.gl.getShaderInfoLog(shader) ?? "Could not compile shader");
        }

        return shader;
    }

    public use() {
        this.gl.useProgram(this.program);
    }

    public getUniform(name: string) {
        if(!this.uniforms.has(name)) {
            const loc = this.gl.getUniformLocation(this.program, name);
            if(!loc) {
                console.log("Could not get uniform location:", name);
            }

            this.uniforms.set(name, loc);
        }

        return this.uniforms.get(name)!;
    }

    public getAttrib(name: string) {
        return this.gl.getAttribLocation(this.program, name);
    }
}