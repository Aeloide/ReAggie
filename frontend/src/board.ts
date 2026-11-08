import pack from "bin-pack";

// import { Group, PSet, Rectangle, SpreadingFunction, vec2 } from "./types.js";
import { isInRectangle, shuffleArray } from "./utils.js";
import type { Group, PSet, Rectangle, SpreadingFunction, vec2 } from "$backend/types.js";
import type { GenerateSetsResult } from "./generation.js";

export const adjustedDims = (dims: [number, number][], min = 1500) => {
    return dims.map(d => {
        let fact = 1;
        for (let k = 0; k < 2; ++k)
            fact = Math.max(fact, min / d[k]!);
        return [
            d[0] * fact,
            d[1] * fact,
        ] as [number, number];
    });
};

const randn_bm = (): number => {
    let u = 0, v = 0;
    while (u === 0) u = Math.random(); //Converting [0,1) to (0,1)
    while (v === 0) v = Math.random();
    let num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    num = num / 10.0 + 0.5; // Translate to 0 -> 1
    if (num > 1 || num < 0) return randn_bm(); // resample between 0 and 1
    return num;
};

const randRange = (min: number, max: number) => min + randn_bm() * (max - min);
const urandRange = (min: number, max: number) => min + Math.random() * (max - min);

const isOnEdge = (g: Group, set: PSet) => {
    const colpos = g.indices[0]! % set.cols;
    const rowpos = ~~(g.indices[0]! / set.cols);

    return colpos == 0 || colpos == (set.cols - 1) ||
        rowpos == 0 || rowpos == (set.rows - 1);
};

// everything spread randomly in the middle of the allocated area
const shitstain: SpreadingFunction = (gs, bound, pdim, idim, srects, force) => {
    gs.forEach(g => {
        if (!force && g.x >= 0xdead0000)
            return;
        if (srects?.some(r => isInRectangle([g.x, g.y], r)))
            return;
        g.x = randRange(bound[0][0], bound[1][0]);
        g.y = randRange(bound[0][1], bound[1][1]);
    });
};

// everything stacked in the middle of the allocated area
const middlestack: SpreadingFunction = (gs, bound, pdim, idim, srects, force) => {
    const mid = [
        bound[0][0] + bound[1][0],
        bound[0][1] + bound[1][1],
    ];
    mid[0]! *= 0.5;
    mid[1]! *= 0.5;
    gs.forEach(g => {
        if (!force && g.x >= 0xdead0000)
            return;
        if (srects?.some(r => isInRectangle([g.x, g.y], r)))
            return;
        g.x = mid[0]!;
        g.y = mid[1]!;
    });
};

const makeVec2 = (a: number) =>
    [Math.sin(a), Math.cos(a)] as [number, number];

// everything spread randomly in a disk the middle of the allocated area
const disk: SpreadingFunction = (gs, bound, pdim, idim, srects, force) => {
    const mid = [
        bound[0][0] + bound[1][0],
        bound[0][1] + bound[1][1],
    ];
    mid[0]! *= 0.5;
    mid[1]! *= 0.5;

    let radius = Math.min(
        bound[1][0] - bound[0][0],
        bound[1][1] - bound[0][1],
    );

    radius *= 0.75;

    gs.forEach(g => {
        if (!force && g.x >= 0xdead0000)
            return;
        if (srects?.some(r => isInRectangle([g.x, g.y], r)))
            return;
        const axis = urandRange(-Math.PI, Math.PI);
        const dist = radius * randRange(-1, 1); // normal distribution, making the pieces more concentrated near the center
        const v = makeVec2(axis);
        g.x = mid[0]! + v[0] * dist;
        g.y = mid[1]! + v[1] * dist;
    });
};

const rectAt = (center: vec2, dims: vec2) => [
    [center[0] - dims[0] / 2, center[1] - dims[1] / 2],
    [center[0] + dims[0] / 2, center[1] + dims[1] / 2],
] as Rectangle;

const growRect = (r: Rectangle, f: vec2) => [
    [r[0][0] - f[0], r[0][1] - f[1]],
    [r[1][0] + f[1], r[1][1] + f[1]],
] as Rectangle;

export const rectDims = (bound: Rectangle) => [
    bound[1][0] - bound[0][0],
    bound[1][1] - bound[0][1]
] as vec2;

const rectMid = (bound: Rectangle) => [
    (bound[0][0] + bound[1][0]) / 2,
    (bound[0][1] + bound[1][1]) / 2,
] as vec2;

const clipRect = (r: Rectangle, ar: number) => {
    if (ar < 1)
        ar = 1 / ar;
    const dims = rectDims(r);
    if (dims[0] < dims[1]) {
        dims[1] = dims[0] * ar;
    } else {
        dims[0] = dims[1] * ar;
    }
    return rectAt(rectMid(r), dims);
};

// everything in a rectangle around a clear area
const clearRect: SpreadingFunction = (gs: Group[],
    bound: Rectangle,
    pdim: vec2,
    idim: vec2, srects, force?: boolean) => {
    const mid = rectMid(bound);

    let spr = pdim.map(e => e * 1.55) as vec2;

    let border = bound;
    border = rectAt(mid, idim); // create a rectangle centered at mid with size idim
    // shrink by 20%
    //border = growRect(border, [-(bdim[0] * 0.05), -(bdim[1] * 0.05)]);
    border = growRect(border, [(idim[0] * 0.1), (idim[1] * 0.1)]); // grow the rectangle by 10%

    // generates coordinates along a rectangle r, walking along with step in both directions
    // starting from the topleft

    function* walk(r: Rectangle, step: vec2) {
        let tpos = r[0];

        const rdim = rectDims(r);
        // re-estimate the number of steps to make
        const nhor = Math.ceil(rdim[0] / step[0]);
        const nvert = Math.ceil(rdim[1] / step[1]);

        // recompute step size
        step = [...step];// clone
        step[0] = rdim[0] / nhor;
        step[1] = rdim[1] / nvert;

        // top
        for (let i = 0; i < nhor; ++i) {
            tpos[0] += step[0];
            yield tpos;
        }

        // right
        for (let i = 0; i < nvert; ++i) {
            tpos[1] += step[1];
            yield tpos;
        }

        // bottom
        for (let i = 0; i < nhor; ++i) {
            tpos[0] -= step[0];
            yield tpos;
        }

        // left
        for (let i = 0; i < nvert; ++i) {
            tpos[1] -= step[1];
            yield tpos;
        }

    }

    let currentrectanglepath = walk(border, spr);
    try {
        let igs = [...new Array(gs.length)].map((e, i) => i);
        shuffleArray(igs);
        for (const ig of igs) {
            const g = gs[ig];
            if (!g) continue;
            if (!force && g.x >= 0xdead0000)
                continue;
            if (srects?.some(r => isInRectangle([g.x, g.y], r)))
                continue;
            let pos = currentrectanglepath.next();
            if (pos.done) {
                // finished walking along the current rectangle, grow it again and continue
                //border = growRect(border, [-spr[0], -spr[1]]);
                border = growRect(border, spr);
                currentrectanglepath = walk(border, spr);
                pos = currentrectanglepath.next();
                if (pos.done) // shouldn't happen, but make ts happy
                {
                    break;
                }
            }
            const p = pos.value;
            g.x = p[0];
            g.y = p[1];

        }
    } catch (e) {
        console.log(e);
    }
};

// if edges were separated, i requests the bounds for the regular pieces of a set, 
// and i + 1 requests the bounds for the edge pieces of that same set
// basically, the set number is given by sid = sepedges ? i >> 1 : i;
type SplittingFunction = (bs: pack.PackedItem<pack.Bin>[], n: PSet[], sepedges: boolean) => ((i: number) => Rectangle);

// put every kind of groups in their different box
const evenSplit: SplittingFunction = (bs, sets, sepedges) => {
    const n = sets.length;
    const getBounds = (idx: number) => {
        const bb = bs[idx]!;
        return [
            [bb.x, bb.y], [bb.x + bb.width, bb.y + bb.height]
        ] as Rectangle;
    };
    return i => getBounds(i);
};

// edges are given a region nested inside the global region
const concentricSplit: SplittingFunction = (bs, sets, sepedges) => {
    const n = sets.length;
    const getBounds = (i: number) => {
        const idx = sepedges ? i >> 1 : i;
        const bb = bs[idx]!;
        let ret = [
            [bb.x, bb.y], [bb.x + bb.width, bb.y + bb.height]
        ] as Rectangle;
        if (i & 1) {
            let m = rectMid(ret);
            let dim: vec2 = [sets[idx]!.width * 0.75, sets[idx]!.height * 0.75];
            ret = rectAt(m, dim);
        }
        return ret;
    };
    return i => getBounds(i);
};

export const spreadPresets = {
    0: {
        dospread: shitstain,
        edgespread: shitstain,
        dosplit: evenSplit
    },
    1: {
        dospread: disk,
        edgespread: disk,
        dosplit: evenSplit
    },
    2: {
        dospread: clearRect,
        edgespread: disk,
        dosplit: concentricSplit
    }
} as const;

export const groupsFromSet = (gensets: GenerateSetsResult,
    hasrot: boolean,
    sepedges: boolean,
    autism: 0 | 1 | 2 = 2,
    oldgroups?: Group[]) => {

    const set = gensets.set;

    const { dospread,
        edgespread,
        dosplit } = spreadPresets[autism];

    let ret: Group[] = [];
    let bid = 0; // global group identifier
    let sid = 0;
    let middle = [0, 0];
    middle[0] /= 2;
    middle[1] /= 2;


    let getBounds: (i: number) => Rectangle;

    getBounds = dosplit(
        // pretend we have no space so the algorithm centers the pieces around [0,0]
        [{ x: 0, y: 0, height: 0, width: 0, item: { width: 0, height: 0 } }],
        [set], sepedges);
    let splitidx = 0;
    const t = set.cols * set.rows;

    let thissetgroups = oldgroups?.filter(g => g.set == sid && g.indices.length == 1 && !g.locked) || [...new Array(t)].map((e, i) => ({
        id: bid + i,
        ids: [],
        indices: [i],
        set: sid,
        ...(hasrot ? { rot: ~~(Math.random() * 4) } : {}),
        x: 0,
        y: 0
    } as Group));

    const pdim: vec2 = [
        set.width / set.cols,
        set.height / set.rows
    ];
    const idim: vec2 = [
        set.width, set.height
    ];
    if (sepedges) {
        const edges = thissetgroups.filter(g => isOnEdge(g, set));
        const inner = thissetgroups.filter(g => !isOnEdge(g, set));
        const ib = getBounds(splitidx);
        dospread(inner, ib, pdim, idim);
        const eb = getBounds(splitidx + 1);
        edgespread(edges, eb, pdim, idim);
    } else {
        const ib = getBounds(splitidx);
        dospread(thissetgroups, ib, pdim, idim);
    }

    ret.push(...thissetgroups);

    bid += t;
    splitidx += sepedges ? 2 : 1;
    ++sid;


    return ret;
};