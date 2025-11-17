export class Framebuffer {
    gl: WebGLRenderingContext | WebGL2RenderingContext;
    fbo: WebGLFramebuffer;
    texture: WebGLTexture;
    width: number;
    height: number;

    constructor(gl: WebGLRenderingContext | WebGL2RenderingContext, width: number, height: number) {
        this.gl = gl;
        this.width = width;
        this.height = height;
        this.texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.texture);

        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        this.fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);

        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texture, 0);

        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
            console.error("Framebuffer incomplete!");
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindTexture(gl.TEXTURE_2D, null);
    }

    public bind() {
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.fbo);
        this.gl.viewport(0, 0, this.width, this.height);
    }

    public unbind() {
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    }

    public destroy() {
        this.gl.deleteFramebuffer(this.fbo);
        this.gl.deleteTexture(this.texture);
    }
}