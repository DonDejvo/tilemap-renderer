export class Color {
    r: number;
    g: number;
    b: number;
    a: number;

    static WHITE = new Color(1, 1, 1);
    static BLACK = new Color(0, 0, 0);
    static RED = new Color(1, 0, 0);
    static GREEN = new Color(0, 1, 0);
    static BLUE = new Color(0, 0, 1);

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

    clone() {
        return new Color(this.r, this.g, this.b, this.a);
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