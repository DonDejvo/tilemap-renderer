import { GPUTimer } from "../Renderer";
import { GPUConfig } from "./common";

export class WebgpuGPUTimer implements GPUTimer {
    private cfg: GPUConfig;
    private supported: boolean;

    private querySet!: GPUQuerySet;
    private resolveBuffer!: GPUBuffer;
    private availableReadBuffers: GPUBuffer[] = [];
    private readBuffer: GPUBuffer | null = null;
    private queryActive: boolean = false;

    private enabled = false;
    private pending = false;

    private avgMs = 0;
    private maxMs = 0;
    private readonly alpha: number;

    constructor(cfg: GPUConfig, alpha: number = 0.1) {
        this.cfg = cfg;
        this.alpha = alpha;

        this.supported = cfg.device.features.has("timestamp-query");
        if (!this.supported) {
            console.log("GPUTimer is not supported on this device/browser");
            return;
        }

        this.querySet = cfg.device.createQuerySet({
            type: "timestamp",
            count: 4
        });

        this.resolveBuffer = cfg.device.createBuffer({
            label: "GPU Timer Query Resolve Buffer",
            size: 32,
            usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC
        });
    }

    isSupported(): boolean {
        return this.supported;
    }

    isEnabled(): boolean {
        return this.enabled;
    }

    enable(): void {
        this.enabled = this.supported;
    }

    disable(): void {
        this.enabled = false;
    }

    begin(encoder: GPUCommandEncoder): boolean {
        if (this.pending) return false;

        const pass = this.beginComputePass(encoder, 0);
        pass.end();

        this.queryActive = true;

        return true;
    }

    end(encoder: GPUCommandEncoder): void {
        if (!this.queryActive) return;

        const pass = this.beginComputePass(encoder, 2);
        pass.end();

        this.queryActive = false;

        this.readBuffer = this.availableReadBuffers.pop() || this.cfg.device.createBuffer({
            label: "GPU Timer Result Buffer",
            size: 32,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
        });

        encoder.resolveQuerySet(this.querySet, 0, this.querySet.count, this.resolveBuffer, 0);
        encoder.copyBufferToBuffer(this.resolveBuffer, this.readBuffer);

        this.pending = true;
    }

    private beginComputePass(
        encoder: GPUCommandEncoder,
        writeIndex: number
    ): GPUComputePassEncoder {
        return encoder.beginComputePass({
            timestampWrites: {
                querySet: this.querySet,
                beginningOfPassWriteIndex: writeIndex,
                endOfPassWriteIndex: writeIndex + 1
            }
        });
    }

    poll(): number | null {
        if (!this.supported || !this.pending || !this.readBuffer) return null;
        if (this.readBuffer.mapState !== "unmapped") return null;

        this.readBuffer.mapAsync(GPUMapMode.READ).then(() => {
            const buffer = this.readBuffer!;
            const data = new BigUint64Array(buffer.getMappedRange());
            const delta = Number(data[2] - data[1]);

            buffer.unmap();
            this.availableReadBuffers.push(buffer);
            this.readBuffer = null;

            const ms = delta * 1e-6;

            if (this.avgMs === 0) this.avgMs = ms;
            else this.avgMs = this.avgMs * (1 - this.alpha) + ms * this.alpha;

            this.maxMs = Math.max(this.maxMs, ms);
            this.pending = false;
        });

        return null;
    }

    getAverage(): number {
        return this.avgMs;
    }

    getPeak(): number {
        return this.maxMs;
    }

    resetAverage(): void {
        this.avgMs = 0;
        this.maxMs = 0;
    }
}
