export type vec<L extends number, T extends number[] = []> =
    T extends { length: L } ? T : vec<L, [...T, number]>;
export type Rectangle = [vec2, vec2];
export type vec2 = vec<2>;
export type BinaryOperator = (a: number, b: number) => number;
export const bop = (bop: BinaryOperator, a: vec2, b: vec2) => [bop(a[0], b[0]), bop(a[1], b[1])] as vec2;
export const sbop = (bop: BinaryOperator, a: vec2, s: number) => a.map(e => bop(e, s)) as vec2;

export const add = bop.bind(null, (a, b) => a + b);
export const mul = bop.bind(null, (a, b) => a * b);
export const sub = bop.bind(null, (a, b) => a - b);
export const div = bop.bind(null, (a, b) => a / b);

export const sadd = sbop.bind(null, (a, b) => a + b);
export const smul = sbop.bind(null, (a, b) => a * b);
export const ssub = sbop.bind(null, (a, b) => a - b);
export const sdiv = sbop.bind(null, (a, b) => a / b);

export const lensq = (a: vec2) => a[0] * a[0] + a[1] * a[1];
export const len = (a: vec2) => Math.sqrt(lensq(a));
export const dist = (a: vec2, b: vec2) => len(sub(a, b));
export const distsq = (a: vec2, b: vec2) => lensq(sub(a, b));
export const normalized = (a: vec2) => (k => [a[0] * k, a[1] * k])(1 / len(a)) as vec2;
export const normal = (a: vec2) => [a[1], -a[0]] as vec2;
export const mid = (a: vec2, b: vec2) => smul(add(a, b), 0.5);
export const rectangleCenter = (r: Rectangle) => mid(r[0], r[1]);
export const rectAt = (center: vec2, dims: vec2) => [
    [center[0] - dims[0] / 2, center[1] - dims[1] / 2],
    [center[0] + dims[0] / 2, center[1] + dims[1] / 2],
] as Rectangle;

export const overlap = (a: Rectangle, b: Rectangle) =>
    a[0][0] <= b[1][0] &&
    a[1][0] >= b[0][0] &&
    a[0][1] <= b[1][1] &&
    a[1][1] >= b[0][1];


export const norm = (v: vec2): vec2 => {
    const s = Math.sqrt(v[0] * v[0] + v[1] * v[1]);
    return [v[0] * s, v[1] * s];
};

export const isInBox = (point: vec2, box: [vec2, vec2]) =>
    point[0] >= box[0][0] &&
    point[0] <= box[1][0] &&
    point[1] >= box[0][1] &&
    point[1] <= box[1][1];

export function fixRectangle(r: Rectangle): Rectangle {
    const [p1, p2] = r;

    const [x1, y1] = p1;
    const [x2, y2] = p2;

    const topLeft: vec2 = [Math.min(x1, x2), Math.min(y1, y2)];
    const bottomRight: vec2 = [Math.max(x1, x2), Math.max(y1, y2)];

    return [topLeft, bottomRight];
}

export const dot = (a: vec2, b: vec2) => a[0] * b[0] + a[1] * b[1];