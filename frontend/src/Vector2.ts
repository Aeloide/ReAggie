// coomdev: not too fond of that as property access is slower than array access even after v8 optimization passes, hence vec2.ts
// though if you want to keep your vectors as "object-oriented", maybe extending an array would work

// Enables using groups and pieces in Vector2 operations
export type vector2 = {
    x: number;
    y: number;
};

export class Vector2 implements vector2 {
    x: number;
    y: number;

    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }

    // Static members for objects that conform to {x: number, y: number}
    // Returns new Vector2 instances
    // Intentionally avoids using extra function calls in hope of improving performance.
    static from = (v: vector2) => new Vector2(v.x, v.y);
    static add = (a: vector2, b: vector2) => new Vector2(a.x + b.x, a.y + b.y);
    static sub = (a: vector2, b: vector2) => new Vector2(a.x - b.x, a.y - b.y);
    static div = (a: vector2, divisor: number) => new Vector2(a.x / divisor, a.y / divisor);
    static mul = (a: vector2, scalar: number) => new Vector2(a.x * scalar, a.y * scalar);
    static floor = (a: vector2) => new Vector2(a.x | 0, a.y | 0);
    static round = (a: vector2) => new Vector2(Math.round(a.x), Math.round(a.y));
    static abs = (a: vector2) => new Vector2(Math.abs(a.x), Math.abs(a.y));
    static mod = (a: vector2, modulo: number) => new Vector2(a.x % modulo, a.y % modulo);
    static get one() { return new Vector2(1, 1); };

    static dot = (a: vector2, b: vector2) => a.x * b.x + a.y * b.y;
    static magnitude = ({ x, y }: vector2) => Math.sqrt(x * x + y * y);
    static magnitudeSq = ({ x, y }: vector2) => x * x + y * y;
    static distSq = (a: vector2, b: vector2) => {
        const x = a.x - b.x;
        const y = a.y - b.y;
        return x * x + y * y;
    };
    static dist = (a: vector2, b: vector2) => {
        const x = a.x - b.x;
        const y = a.y - b.y;
        return Math.sqrt(x * x + y * y);
    };
    static normalize = ({ x, y }: vector2) => {
        const invSqrt = 1 / (Math.sqrt(x * x + y * y) || 1);
        return new Vector2(x * invSqrt, y * invSqrt);
    };
    static equals = (a: vector2, b: vector2, epsilon = 1): boolean => Math.abs(a.x - b.x) < epsilon && Math.abs(a.y - b.y) < epsilon;
    static copy = (to: vector2, from: vector2): void => {
        to.x = from.x;
        to.y = from.y;
    };

    // Mutates the instance and returns it to allow for chaining.
    add = (b: vector2): this => (this.x += b.x, this.y += b.y, this);
    sub = (b: vector2): this => (this.x -= b.x, this.y -= b.y, this);
    div = (divisor: number): this => (this.x /= divisor, this.y /= divisor, this);
    mul = (scalar: number): this => (this.x *= scalar, this.y *= scalar, this);
    mod = (modulo: number): this => (this.x %= modulo, this.y %= modulo, this);
    floor = (): this => (this.x |= 0, this.y |= 0, this);
    round = (): this => {
        const { x, y } = this;
        this.x = Math.round(x);
        this.y = Math.round(y);
        return this;
    };
    abs = (): this => {
        const { x, y } = this;
        this.x = Math.abs(x);
        this.y = Math.abs(y);
        return this;
    };
    normalize = (): this => {
        const { x, y } = this;
        const invSqrt = 1 / (Math.sqrt(x * x + y * y) || 1);
        this.x *= invSqrt;
        this.y *= invSqrt;
        return this;
    };

    dot = Vector2.dot.bind(null, this);
    dist = Vector2.dist.bind(null, this);
    distSq = Vector2.distSq.bind(null, this);
    magnitude = Vector2.magnitude.bind(null, this);
    magnitudeSq = Vector2.magnitudeSq.bind(null, this);
    equals = Vector2.equals.bind(null, this);

    toString = () => `(${this.x}, ${this.y})`;
}
