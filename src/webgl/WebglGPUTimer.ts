import { GPUTimer } from "../Renderer";

export class WebglGPUTimer implements GPUTimer {
    private gl: WebGLRenderingContext | WebGL2RenderingContext;
    private ext: any;
    private isWebGL2: boolean = false;
    private query: any = null;
    private queryActive: boolean = false;
    private supported: boolean;
    private active: boolean = false;

    private avgMs: number = 0;
    private readonly alpha: number;
    private maxMs: number = 0;

    constructor(gl: WebGLRenderingContext | WebGL2RenderingContext, alpha: number = 0.1) {
        this.gl = gl;
        this.alpha = alpha;

        const ext2 = gl.getExtension("EXT_disjoint_timer_query_webgl2");
        const ext1 = gl.getExtension("EXT_disjoint_timer_query");

        if (gl instanceof WebGL2RenderingContext && ext2) {
            this.ext = ext2;
            this.isWebGL2 = true;
            this.supported = true;
        } else if (ext1) {
            this.ext = ext1;
            this.isWebGL2 = false;
            this.supported = true;
        } else {
            this.ext = null;
            this.supported = false;
        }

        if (!this.supported) {
            console.log("GPUTimer is not supported on this device/browser");
        }
    }

    public isSupported(): boolean {
        return this.supported;
    }

    public isActive(): boolean {
        return this.active;
    }

    public activate(): boolean {
        this.active = this.supported;

        return this.active;
    }

    public deactivate(): void {
        this.active = false;
    }

    public begin(): boolean {
        if (this.query) return false;

        if (this.isWebGL2) {
            const gl = this.gl as WebGL2RenderingContext;
            this.query = gl.createQuery();
            gl.beginQuery(this.ext.TIME_ELAPSED_EXT, this.query);
        } else {
            this.query = this.ext.createQueryEXT();
            this.ext.beginQueryEXT(this.ext.TIME_ELAPSED_EXT, this.query);
        }

        this.queryActive = true;
        return true;
    }

    public end(): void {
        if (!this.queryActive) return;

        if (this.isWebGL2) {
            const gl = this.gl as WebGL2RenderingContext;
            gl.endQuery(this.ext.TIME_ELAPSED_EXT);
        } else {
            this.ext.endQueryEXT(this.ext.TIME_ELAPSED_EXT);
        }

        this.queryActive = false;
    }

    public poll(): number | null {
        if (!this.supported || !this.query) return null;

        let available = false;
        let disjoint = false;
        let timeMs: number | null = null;

        if (this.isWebGL2) {
            const gl = this.gl as WebGL2RenderingContext;
            available = gl.getQueryParameter(this.query, gl.QUERY_RESULT_AVAILABLE);
            disjoint = gl.getParameter(this.ext.GPU_DISJOINT_EXT);
            if (available && !disjoint) {
                const timeNs = gl.getQueryParameter(this.query, gl.QUERY_RESULT);
                timeMs = timeNs * 1e-6;
                gl.deleteQuery(this.query);
            }
        } else {
            const gl = this.gl;
            available = this.ext.getQueryObjectEXT(this.query, this.ext.QUERY_RESULT_AVAILABLE_EXT);
            disjoint = gl.getParameter(this.ext.GPU_DISJOINT_EXT);
            if (available && !disjoint) {
                const timeNs = this.ext.getQueryObjectEXT(this.query, this.ext.QUERY_RESULT_EXT);
                timeMs = timeNs * 1e-6;
                this.ext.deleteQueryEXT(this.query);
            }
        }

        if (timeMs !== null) {
            if (this.avgMs === 0) this.avgMs = timeMs;
            else this.avgMs = this.avgMs * (1 - this.alpha) + timeMs * this.alpha;
            this.maxMs = Math.max(this.maxMs, timeMs);
            this.query = null;
            this.queryActive = false;
        }

        return timeMs;
    }

    public getAverage(): number {
        return this.avgMs;
    }

    public getPeak(): number {
        return this.maxMs;
    }

    public resetAverage(): void {
        this.avgMs = 0;
        this.maxMs = 0;
    }
}
