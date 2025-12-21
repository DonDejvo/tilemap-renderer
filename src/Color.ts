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
    static YELLOW = new Color(1, 1, 0);
    static CYAN = new Color(0, 1, 1);
    static MAGENTA = new Color(1, 0, 1);
    
    // Grays
    static GRAY = new Color(0.5, 0.5, 0.5);
    static LIGHT_GRAY = new Color(0.75, 0.75, 0.75);
    static DARK_GRAY = new Color(0.25, 0.25, 0.25);

    // Orange / Brown
    static ORANGE = new Color(1, 0.5, 0);
    static DARK_ORANGE = new Color(0.8, 0.4, 0);
    static BROWN = new Color(0.6, 0.3, 0.1);

    // Pink / Purple
    static PINK = new Color(1, 0.75, 0.8);
    static HOT_PINK = new Color(1, 0.4, 0.7);
    static PURPLE = new Color(0.5, 0, 0.5);
    static VIOLET = new Color(0.6, 0.2, 0.8);

    // Blues
    static LIGHT_BLUE = new Color(0.4, 0.7, 1);
    static SKY_BLUE = new Color(0.53, 0.81, 0.92);
    static NAVY = new Color(0, 0, 0.5);
    static TEAL = new Color(0, 0.5, 0.5);

    // Greens
    static LIME = new Color(0.75, 1, 0);
    static DARK_GREEN = new Color(0, 0.4, 0);
    static OLIVE = new Color(0.5, 0.5, 0);

    // Utility
    static TRANSPARENT = new Color(0, 0, 0, 0);

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