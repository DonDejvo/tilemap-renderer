export class EMATimer {
    private avgMs: number | null = null;
    private maxMs: number = 0;
    private readonly alpha: number;
    private startTime: number | null = null;
    private lastSample: number | null = null;

    constructor(alpha = 0.1) {
        this.alpha = alpha;
    }

    begin(): boolean {
        if (this.startTime !== null) return false;
        this.startTime = performance.now();
        return true;
    }

    end(): void {
        if (this.startTime === null) return;
        const elapsed = performance.now() - this.startTime;
        this.lastSample = elapsed;
        if (this.avgMs === null) this.avgMs = elapsed;
        else this.avgMs = this.avgMs * (1 - this.alpha) + elapsed * this.alpha;
        this.maxMs = Math.max(this.maxMs, elapsed);
        this.startTime = null;
    }

    poll(): number | null {
        return this.lastSample;
    }

    getAverage(): number | null {
        return this.avgMs;
    }

    getPeak(): number {
        return this.maxMs;
    }

    resetAverage(): void {
        this.avgMs = null;
        this.maxMs = 0;
        this.lastSample = null;
    }
}
