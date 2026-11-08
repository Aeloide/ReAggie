import type { PSet } from "$backend/types";
import { jig } from "$backend/utils";
import type { PSetGenerated } from "./types";

const adjustedDims = (dims: number[][], min = 1500): [number, number][] => {
  return dims.map((d) => {
    let fact = 1;
    for (let k = 0; k < 2; ++k) fact = Math.max(fact, min / d[k]);
    return [d[0] * fact, d[1] * fact];
  });
};

export const generateSets = (
  n: number,
  files: number,
  dims: [number, number][]
): PSet[] => {
  n = Math.max(1, n / (files || 1));
  let sets: PSet[] = [];
  let total = 0;
  const boardDims = {
    boardHeight: 0,
    boardWidth: 0,
  };
  // adjust dims so smallest side is at least 1500
  const adims = adjustedDims(dims);
  let biggestdims = adims[0];
  let biggestarea = biggestdims[0] * biggestdims[1];
  for (let i = 1; i < adims.length; ++i) {
    const narea = adims[i][0] * adims[i][1];
    if (narea > biggestarea) {
      biggestarea = narea;
      biggestdims = adims[i];
    }
  }
  for (let i = 0; i < files; ++i) {
    const calc = jig(adims[i][0], adims[i][1], n);
    // scale the images so they have roughly the same surface area
    let earearoot = Math.sqrt(adims[i][0] * adims[i][1]);
    let fact = Math.sqrt(biggestarea) / earearoot;
    let eheight = adims[i][1] * fact;
    let ewidth = adims[i][0] * fact;
    if (!Number.isFinite(ewidth) || !Number.isFinite(eheight)
      || ewidth > 10_000_000 || eheight > 10_000_000)
      throw new Error("Image aspect ratio is too extreme");
    sets.push({
      cols: calc[0][0],
      rows: calc[0][1],
      height: eheight,
      width: ewidth,
      pieceWidth: ewidth / calc[0][0],
      pieceHeight: eheight / calc[0][1],
      imageWidth: dims[i][0],
      imageHeight: dims[i][1],
      image: "fn",
    });
    boardDims.boardWidth += ewidth * 2.5 * fact; // 2.5 is accurate, at least for single sets
    boardDims.boardHeight += eheight * 2.5 * fact;
    total += calc[0][0] * calc[0][1];
  }
  return sets;
};
