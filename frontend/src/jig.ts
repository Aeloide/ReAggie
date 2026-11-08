// Stolen from
// JIG code from Stand-up Maths video "Why don't Jigsaw Puzzles have the correct number of pieces?"

import type { Curve } from "$room/game";
import type { Random } from "./utils";

const low_factors = (n: number) =>     // all the factors which are the lower half of each factor pair
    [...new Array(~~Math.sqrt(n) + 1)]
        .map((e, i) => i + 1)
        .filter(e => n % e == 0);

const range = (min: number, max: number) => [...Array(max - min)].map((e, i) => i + min);

export const jig = (w: number, h: number, n: number) => {
    // percentage we'll check in either direction
    const threshold = 0.1;

    // the extra badness per piece
    const penalty = 1.005;

    let rev = false;
    if (w < h) {
        [w, h] = [h, w];
        rev = true;
    }
    const ratio = w / h;  // switched to be greater than 1

    const min_cap = Math.max(1, ~~((1 - threshold) * n));
    const max_cap = Math.max(min_cap, ~~((1 + threshold) * n));

    let this_best = 0;
    let bestsides = [0, 0] as [number, number];
    let worst = Number.POSITIVE_INFINITY;
    let ret: [[number, number], number];
    for (let testn of range(min_cap, max_cap + 1)) {
        // find the rows/cols closest to the original pic
        for (const colc of low_factors(testn)) {
            let rowc = ~~(testn / colc);
            let trat = rowc / colc;
            //console.log(rowc, colc, Math.abs(ratio - trat), Math.abs(ratio - this_best));
            if (Math.abs(ratio - trat) < Math.abs(ratio - this_best)) {
                this_best = trat;
                bestsides = [rowc, colc];
            }
        }
        // remember the one with the closest piece ratio to 1
        const pr = Math.max(ratio, this_best) / Math.min(ratio, this_best);
        let bad = (penalty ** (Math.abs(testn - n))) * pr;
        if (!ret! || bad < worst) {
            worst = bad;
            ret = [bestsides, pr];
        }
    }
    if (rev) {
        const [w, h] = ret![0];
        ret![0] = [h, w];
        // inverse it?
        //ret![1] = ret![1];
    }
    return ret!;
};

const preferSquarer = (a: number, b: number, c: number) => {
    if (a == b)
        return Number.POSITIVE_INFINITY;
    return 1 / Math.abs(a - b);
};

export const boardSplit = (dims: [number, number], splits: number, merit_function = preferSquarer) => {
    let n = splits;
    let p = Math.ceil(Math.sqrt(n));
    let q = Math.ceil(n / p);
    let best_merit_yet = merit_function(dims[0] / p, dims[1] / q, 0);
    let best_configuration_yet = [p, q] as [number, number];
    for (let p = Math.floor(Math.sqrt(n)); p > 0; --p) {
        let q = Math.ceil(n / p);
        if (p * q < n) continue;
        let n_wasted = p * q - n;
        let merit1 = merit_function(dims[0] / p, dims[1] / q, n_wasted);
        let merit2 = merit_function(dims[1] / q, dims[0] / p, n_wasted);
        if (Math.max(merit1, merit2) > best_merit_yet) {
            if (merit1 > merit2) {
                best_configuration_yet = [p, q];
                best_merit_yet = merit1;
            } else {
                best_configuration_yet = [q, p];
                best_merit_yet = merit2;
            }
        }
    }
    return best_configuration_yet;
};
export function generateNubCoefficients(random: Random, jitter: number, prev?: Curve, zigzag?: boolean, isLeftEdge?: boolean): Curve {
    let flip = random.next() > .5;
    if (zigzag) {
        if (prev && !isLeftEdge) {
            flip = !prev.flip;
        }
    }
    const min = -jitter, max = .9 * jitter;
    return {
        flip,
        a: random.nextInterval(min, max),
        b: random.nextInterval(min, max),
        c: random.nextInterval(min, max),
        d: random.nextInterval(min, max),
        e: random.nextInterval(min, max)
    };
}
