import type { vec2 } from "./vec2";

export enum MouseButton {
    Left = 1,
    Right = 2,
    Middle = 4,
};

export type PSet = {
    pieceDims: vec2;
    hpieceDims: vec2;
    cols: number;
    rows: number;
    width: number;
    height: number;
    image: string;
    isvideo?: true;
}

export const tuple = <T extends any[]>(...args: T) => args;
