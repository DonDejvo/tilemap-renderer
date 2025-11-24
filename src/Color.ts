export class Color {
    r: number;
    g: number;
    b: number;
    a: number;

    constructor(r: number, g: number, b: number, a: number = 1) {
        this.r = r;
        this.g = g;
        this.b = b;
        this.a = a;
    }

    set(r: number, g: number, b: number, a: number) {
        this.r = r;
        this.g = g;
        this.b = b;
        this.a = a;
    }

    copy(c: Color) {
        this.r = c.r;
        this.g = c.g;
        this.b = c.b;
        this.a = c.a;
    }

    toArray() {
        return new Float32Array([this.r, this.g, this.b, this.a]);
    }
}