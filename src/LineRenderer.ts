import { Color } from "./Color";

export const MAX_LINES = 100000;

export interface Line {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    color: Color;
}

export abstract class LineRenderer {
    public strokeColor: Color;
    protected lines: Line[];
    private isNewPath: boolean;
    private pathStart: { x: number, y: number };
    private cursor: { x: number, y: number };

    constructor() {
        this.strokeColor = Color.BLACK;
        this.lines = [];
        this.isNewPath = false;
        this.pathStart = { x: 0, y: 0 };
        this.cursor = { x: 0, y: 0 };
    }

    beginPath(): void {
        this.isNewPath = true;
    }

    moveTo(x: number, y: number): void {
        this.cursor.x = x;
        this.cursor.y = y;
        if (this.isNewPath) {
            this.isNewPath = false;
            this.pathStart.x = this.cursor.x;
            this.pathStart.y = this.cursor.y;
        }
    }

    lineTo(x: number, y: number): void {
        const color = this.strokeColor.clone();
        this.lines.push({ x0: this.cursor.x, y0: this.cursor.y, x1: x, y1: y, color });
        this.moveTo(x, y);
    }

    closePath(): void {
        this.lineTo(this.pathStart.x, this.pathStart.y);
    }

    rect(x: number, y: number, w: number, h: number): void {
        const x1 = x + w;
        const y1 = y + h;
        this.moveTo(x, y);
        this.lineTo(x1, y);
        this.lineTo(x1, y1);
        this.lineTo(x, y1);
        this.closePath();
    }

    arc(x: number, y: number, r: number, startAngle: number, endAngle: number): void {
        let angle = endAngle - startAngle;
        if (angle <= 0) {
            return;
        }
        if (angle > 2 * Math.PI) {
            angle = 2 * Math.PI;
        }
        const maxError = 0.5;
        let arg = 1 - maxError / r;
        if (arg < -1) {
            arg = -1;
        }
        if (arg > 1) {
            arg = 1;
        }
        const maxStep = 2 * Math.acos(arg);
        const segments = Math.ceil(angle / maxStep);
        const step = angle / segments;
        let a = startAngle;
        this.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        for (let i = 1; i <= segments; i++) {
            a = startAngle + step * i;
            this.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        }
    }

    clear() {
        this.lines.length = 0;
    }
}