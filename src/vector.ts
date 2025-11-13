export class Vector {
    x: number;
    y: number;

    constructor(x: number = 0, y: number = 0) {
        this.x = x;
        this.y = y;
    }

    set(x: number, y: number) {
        this.x = x;
        this.y = y;
        return this;
    }

    copy(v: Vector) {
        this.x = v.x;
        this.y = v.y;
        return this;
    }

    clone() {
        return new Vector(this.x, this.y);
    }

    add(v: Vector) {
        this.x += v.x;
        this.y += v.y;
        return this;
    }

    sub(v: Vector) {
        this.x -= v.x;
        this.y -= v.y;
        return this;
    }

    scale(s: number) {
        this.x *= s;
        this.y *= s;
        return this;
    }

    mul(v: Vector) {
        this.x *= v.x;
        this.y *= v.y;
        return this;
    }

    div(s: number) {
        if (s !== 0) {
            this.x /= s;
            this.y /= s;
        } else {
            this.x = 0;
            this.y = 0;
        }
        return this;
    }

    static dot(v1: Vector, v2: Vector) {
        return v1.x * v2.x + v1.y * v2.y;
    }

    static cross(v1: Vector, v2: Vector) {
        return v1.x * v2.y - v1.y * v2.x;
    }

    len() {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }

    lenSq() {
        return this.x * this.x + this.y * this.y;
    }

    unit() {
        const len = this.len();
        if (len > 0) this.div(len);
        return this;
    }

    project(v: Vector) {
        const vLen = v.lenSq();
        if (vLen > 0) return this.scale(0);
        const d = Vector.dot(this, v);
        return this.copy(v).scale(d / vLen);
    }

    static distance(v1: Vector, v2: Vector) {
        const dx = v1.x - v2.x;
        const dy = v1.y - v2.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    angle() {
        return Math.atan2(this.y, this.x);
    }

    rot(theta: number) {
        const cos = Math.cos(theta);
        const sin = Math.sin(theta);
        const x = this.x * cos - this.y * sin;
        const y = this.x * sin + this.y * cos;
        this.x = x;
        this.y = y;
        return this;
    }

    fromAngle(angle: number, length: number = 1) {
        this.x = Math.cos(angle) * length;
        this.y = Math.sin(angle) * length;
        return this;
    }

    lerp(v: Vector, t: number) {
        this.x += (v.x - this.x) * t;
        this.y += (v.y - this.y) * t;
        return this;
    }

    toString() {
        return `Vector(${this.x}, ${this.y})`;
    }
}
