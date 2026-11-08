import type { PSet } from "$backend/types";
import { jig } from "$backend/utils";

export type GenerateSetsResult = Awaited<ReturnType<typeof generateSets2>>;

const adjustedDims = (dims: [number, number][], min = 1500) => {
    return dims.map((d) => {
      let fact = 1;
      for (let k = 0; k < 2; ++k) fact = Math.max(fact, min / d[k]);
      return [d[0] * fact, d[1] * fact] as [number, number];
    });
  };

  const generateSets2 = async (
    n: number,
    file: {
      width: number;
      height: number;
      path: string;
      md5: string;
      mime: string;
    },
    dims: [number, number][], // needs to be called with all the other pics natural dims
  ): Promise<{
    total: number;
    set: PSet;
  }> => {
    let set: PSet;
    let total = 0;

    const boardDims = {
      boardHeight: 0,
      boardWidth: 0,
    };

    // adjust dims so smallest side is at least 1500
    const adims = adjustedDims(dims);
    let biggestdims = adims[0]!;
    let biggestarea = biggestdims[0] * biggestdims[1];
    for (let i = 1; i < adims.length; ++i) {
      const narea = adims[i]![0] * adims[i]![1];
      if (narea > biggestarea) {
        biggestarea = narea;
        biggestdims = adims[i]!;
      }
    }

    let i = 0;
    const calc = jig(...adims[i]!, n);
    const ext = file.path.match(/\.(.{3,4})$/)?.at(1) || 'png';
    const isvideo = ext == "webm" || ext == "mp4";
    const fileName = file!.path;

    // scale the images so they have roughly the same surface area
    let earearoot = Math.sqrt(adims[i]![0] * adims[i]![1]);
    let fact = Math.sqrt(biggestarea) / earearoot;
    let eheight = adims[i]![1] * fact;
    let ewidth = adims[i]![0] * fact;

    set = ({
      cols: calc[0][0],
      rows: calc[0][1],
      height: eheight,
      width: ewidth,
      imageWidth: dims[i]![0],
      imageHeight: dims[i]![1],
      pieceWidth: ewidth / calc[0][0],
      pieceHeight: eheight / calc[0][1],
      image: fileName,
      isvideo,
    });
    total += calc[0][0] * calc[0][1];
    // count too low, try another bound
    if (total === 0) return generateSets2(n + 10, file, dims);

    return {
      total,
      set,
    };
  };