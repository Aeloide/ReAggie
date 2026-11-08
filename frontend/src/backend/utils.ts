const low_factors = (
  n: number // all the factors which are the lower half of each factor pair
) =>
  [...new Array(~~Math.sqrt(n) + 1)]
    .map((e, i) => i + 1)
    .filter((e) => n % e == 0);

export const range = (min: number, max: number) =>
  [...Array(max - min)].map((e, i) => i + min);

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
  const ratio = w / h; // switched to be greater than 1

  const min_cap = Math.max(1, ~~((1 - threshold) * n));
  const max_cap = Math.max(min_cap, ~~((1 + threshold) * n));

  let worst = Number.POSITIVE_INFINITY;
  let ret: [[number, number], number] | undefined;
  const rng = min_cap === max_cap ? [min_cap] : range(min_cap, max_cap + 1);
  for (let testn of rng) {
    let this_best = 0;
    let bestsides = [0, 0] as [number, number];
    let min_diff = Number.POSITIVE_INFINITY;

    // find the rows/cols closest to the original pic
    for (const colc of low_factors(testn)) {
      let rowc = ~~(testn / colc);
      let trat = rowc / colc;
      let diff = Math.abs(ratio - trat);
      if (diff < min_diff) {
        min_diff = diff;
        this_best = trat;
        bestsides = [rowc, colc];
      }
    }
    // remember the one with the closest piece ratio to 1
    const pr = Math.max(ratio, this_best) / Math.min(ratio, this_best);
    let bad = penalty ** Math.abs(testn - n) * pr;
    if (!ret || bad < worst) {
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
