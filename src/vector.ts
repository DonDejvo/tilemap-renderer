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

    multiplyScalar(s: number) {
        this.x *= s;
        this.y *= s;
        return this;
    }

    multiply(v: Vector) {
        this.x *= v.x;
        this.y *= v.y;
        return this;
    }

    divideScalar(s: number) {
        if (s !== 0) {
            this.x /= s;
            this.y /= s;
        } else {
            this.x = 0;
            this.y = 0;
        }
        return this;
    }

    dot(v: Vector) {
        return this.x * v.x + this.y * v.y;
    }

    cross(v: Vector) {
        return this.x * v.y - this.y * v.x;
    }

    length() {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }

    lengthSq() {
        return this.x * this.x + this.y * this.y;
    }

    normalize() {
        const len = this.length();
        if (len > 0) this.divideScalar(len);
        return this;
    }

    distanceTo(v: Vector) {
        return Math.sqrt(this.distanceToSq(v));
    }

    distanceToSq(v: Vector) {
        const dx = this.x - v.x;
        const dy = this.y - v.y;
        return dx * dx + dy * dy;
    }

    angle() {
        return Math.atan2(this.y, this.x);
    }

    rotate(theta: number) {
        const cos = Math.cos(theta);
        const sin = Math.sin(theta);
        const x = this.x * cos - this.y * sin;
        const y = this.x * sin + this.y * cos;
        this.x = x;
        this.y = y;
        return this;
    }

    setFromAngle(angle: number, length: number = 1) {
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
