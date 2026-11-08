import type { PSet } from "$backend/types";
import type { GameGroup } from "$room/game";

export const concatArrayBuffers = (arrays: ArrayBufferLike[]) => {
    const sz = arrays.reduce((a, b) => a + b.byteLength, 0);
    const res = new Uint8Array(sz);
    let ptr = 0;
    for (let arr of arrays) {
        res.set(new Uint8Array(arr), ptr);
        ptr += arr.byteLength;
    }
    return res.buffer;
}


// (MSB) SSSSSSSS XXXXXLRR (LSB)
const toStatus = (g: GameGroup) =>
    ((g.locked ? 1 : 0) << 2) // 1 bit
    | g.set << 8 // 8 bits
    | (g.rot || 0) << 0 // 2 bits
    | (g.f ? 1 : 0) << 3;

const serializeGroup = (g: GameGroup, basecount: Map<number, number>, rotting: boolean) => {
    // 20 bytes min, ~40kb per group max (10000 pieces puzzles)
    // groups grows only as the get merged into other groups
    // so this is basically a constant size
    // however, the overhead is 15 bytes per group, so ~19kb on top
    let groupsize =
        2 + //id 0
        2 + //status 2
        4 + //x 3
        4 + //y 7
        2 + // ids size
        2 + // indices size
        2 * g.ids.length +
        2 * (g.ids.length + 1)
        + (rotting ? 8 : 0);

    const buff = new ArrayBuffer(groupsize);
    const tbuff = new Uint8Array(buff);
    const dv = new DataView(buff);
    let ptr = 0;
    dv.setUint16(ptr, g.id, true); ptr += 2;
    dv.setUint16(ptr, toStatus(g), true); ptr += 2;
    dv.setFloat32(ptr, g.x, true); ptr += 4;
    dv.setFloat32(ptr, g.y, true), ptr += 4;
    dv.setUint16(ptr, g.ids.length, true); ptr += 2;
    dv.setUint16(ptr, g.ids.length + 1, true); ptr += 2;
    if (rotting) {
        dv.setFloat64(ptr, g.rotp || NaN, true); ptr += 8;
    }
    const n = basecount.get(g.set) || 0;
    const blocks = new Uint16Array(g.ids);
    let bytes = new Uint8Array(blocks.buffer);
    tbuff.set(bytes, ptr);
    ptr += bytes.length;

    for (let i = 0; i < blocks.length; ++i)
        blocks[i] -= n;
    tbuff.set(bytes, ptr);
    ptr += bytes.length;
    dv.setUint16(ptr, g.id - n, true);
    ptr += 2;
    return buff;
};

export const buildBinaryRepr = (g: GameGroup[], sets: PSet[], rotting: boolean) => {
    const groupCount = new Uint16Array(1);
    groupCount[0] = g.length;
    const bases = new Map<number, number>();
    let b = 0;
    for (let i = 0; i < sets.length; ++i) {
        const s = sets[i];
        bases.set(i, b);
        b += s.count || s.sites?.length || s.cols * s.rows;
    }
    return concatArrayBuffers([groupCount.buffer, ...g.map(e => serializeGroup(e, bases, rotting))]);
};