import { vec2 } from "../types.js";

export type Rectangle = [vec2, vec2];
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

export const cross = (a: vec2, b: vec2) => a[0] * b[1] - a[1] * b[0];
