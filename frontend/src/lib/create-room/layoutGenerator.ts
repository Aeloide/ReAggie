import potpack from "../../room/potpack";
import type { MediaItem } from "./types";
import { generateSets } from "./utils";
import type { SerializedBag, SerializedImageLayoutConfig } from "./layoutStore";
import { defaultDistributors } from "./distributorsPresets";

export interface GenerateLayoutsOptions {
  pieces: number;
  distributorCode?: string;
  distributorPreset?: string;
  mixsets?: boolean;
  rotation?: boolean;
}

function getSpeculativeRegions(type: string, code: string, w: number, h: number, pw: number, ph: number): string[] {
  let finalCode = code;
  if (type !== 'custom') {
    const preset = defaultDistributors[type as keyof typeof defaultDistributors];
    finalCode = preset ? preset.code : "";
  }
  if (!finalCode) return [];
  try {
    const fn = new Function("groups", "bound", "pieceDim", "imageDim", "skipRects", "force",
      finalCode + "\n return spread(groups, bound, pieceDim, imageDim, skipRects, force);"
    );
    const mockGroups = [{ indices: [0], x: 0, y: 0 }];
    const bound = [[-w, -h], [w, h]];
    const pieceDim = [pw, ph];
    const imageDim = [w, h];
    const res = fn(mockGroups, bound, pieceDim, imageDim, [], true);
    if (res && res.regions) {
      return Object.keys(res.regions);
    }
  } catch (e) {
    // Silent fail
  }
  return [];
}

interface BagNode {
  key: string; // imageId::bagId
  imageId: string;
  bagId: number;
  bag: any;
  deps: string[];
  speculativeRegions: string[];
  layout: any;
  set: any;
}

export function generateAndPackLayouts(
  mediaItems: MediaItem[],
  layoutsMap: Map<string, any>,
  options: GenerateLayoutsOptions
): {
  orderedLayouts: SerializedImageLayoutConfig[];
  cycleErrors?: string[];
} {
  const dims = mediaItems.map((e) => [e.width, e.height]) as [number, number][];
  const sets = generateSets(options.pieces, mediaItems.length, dims);

  // Initialize layouts in layoutsMap if they don't exist
  for (let sid = 0; sid < sets.length; sid++) {
    const set = sets[sid]!;
    const imageId = mediaItems[sid].item.objectUrl || sid.toString();
    if (!layoutsMap.has(imageId)) {
      const defaultBagId = 0;
      const allPieces = new Set<number>();
      for (let i = 0; i < set.cols * set.rows; i++) allPieces.add(i);

      layoutsMap.set(imageId, {
        imageId,
        bags: new Map([[defaultBagId, {
          id: defaultBagId,
          name: "Default Bag",
          color: "rgba(0,0,0,0)",
          pieces: allPieces,
          presolved: false,
          distributorType: "clearRect",
          distributorCode: defaultDistributors.clearRect.code
        }]])
      });
    }
  }

  // 1. Build nodes and run speculative execution to find regions
  const nodes = new Map<string, BagNode>();
  for (let sid = 0; sid < sets.length; sid++) {
    const set = sets[sid]!;
    const imageId = mediaItems[sid].item.objectUrl || sid.toString();
    const layout = layoutsMap.get(imageId);
    if (!layout) continue;

    // Ensure customDistributors is a Map
    if (layout.customDistributors && !(layout.customDistributors instanceof Map)) {
      const arr = layout.customDistributors as any[];
      layout.customDistributors = new Map(arr.map(d => [d.id, { name: d.name, code: d.code }]));
    }
    if (!layout.customDistributors) {
      layout.customDistributors = new Map();
    }

    for (const bag of layout.bags.values()) {
      const key = `${imageId}::${bag.id}`;
      const pw = set.pieceWidth || (set.width / set.cols);
      const ph = set.pieceHeight || (set.height / set.rows);
      const type = bag.distributorType || (bag.id === 0 ? "clearRect" : "shitstain");
      
      let code = "";
      if (type === 'custom') {
        code = bag.distributorCode || "";
      } else if (defaultDistributors[type as keyof typeof defaultDistributors]) {
        code = defaultDistributors[type as keyof typeof defaultDistributors].code;
      } else {
        const libDist = layout.customDistributors.get(type);
        code = libDist ? libDist.code : defaultDistributors.shitstain.code;
      }

      const specRegs = getSpeculativeRegions(type, code, set.width, set.height, pw, ph);

      nodes.set(key, {
        key,
        imageId,
        bagId: bag.id,
        bag,
        deps: [],
        speculativeRegions: specRegs,
        layout,
        set
      });
    }
  }

  // 2. Resolve dependencies and build graph edges
  for (const node of nodes.values()) {
    if (node.bag.connectedToRegion) {
      const parentImageId = node.bag.connectedToRegion.parentImageId;
      const parentBagId = node.bag.connectedToRegion.parentBagId;
      const regionName = node.bag.connectedToRegion.regionName;
      const parentKey = `${parentImageId}::${parentBagId}`;

      const parentNode = nodes.get(parentKey);
      if (parentNode && parentNode.speculativeRegions.includes(regionName)) {
        node.deps.push(parentKey);
      }
    }
  }

  // 3. Topological sort with cycle detection
  const visited = new Map<string, number>(); // 0=unvisited, 1=visiting, 2=visited
  const sortedKeys: string[] = [];
  const cycleEdges = new Set<string>();

  function visit(key: string) {
    if (visited.get(key) === 1) {
      cycleEdges.add(key);
      return;
    }
    if (visited.get(key) === 2) return;
    visited.set(key, 1);
    const node = nodes.get(key);
    if (node) {
      for (const dep of node.deps) {
        visit(dep);
      }
    }
    visited.set(key, 2);
    sortedKeys.push(key);
  }

  for (const key of nodes.keys()) {
    if (!visited.has(key)) {
      visit(key);
    }
  }

  // 4. Execute layouts in topological order
  const resolvedRegions = new Map<string, [[number, number], [number, number]]>();
  const piecePositions = new Map<string, [number, number]>(); // key: imageId::pieceIndex

  // Check if we should merge default bags for clearRect under mixsets option
  let isMergedClearRect = false;
  const defaultBagKeys: string[] = [];
  if (options.mixsets) {
    let allDefaultUseClearRect = true;
    for (let sid = 0; sid < sets.length; sid++) {
      const imageId = mediaItems[sid].item.objectUrl || sid.toString();
      const key = `${imageId}::0`;
      const node = nodes.get(key);
      if (node) {
        defaultBagKeys.push(key);
        const preset = node.bag.distributorType || "clearRect";
        if (preset !== "clearRect") {
          allDefaultUseClearRect = false;
        }
      } else {
        allDefaultUseClearRect = false;
      }
    }
    if (allDefaultUseClearRect && defaultBagKeys.length > 0) {
      isMergedClearRect = true;
    }
  }

  if (isMergedClearRect) {
    const mergedPieceDim = defaultBagKeys.reduce<[number, number]>((dims, key) => {
      const set = nodes.get(key)!.set;
      const pieceWidth = set.pieceWidth || set.width / set.cols;
      const pieceHeight = set.pieceHeight || set.height / set.rows;
      if (options.rotation) {
        const maxDimension = Math.max(pieceWidth, pieceHeight);
        dims[0] = Math.max(dims[0], maxDimension);
        dims[1] = Math.max(dims[1], maxDimension);
      } else {
        dims[0] = Math.max(dims[0], pieceWidth);
        dims[1] = Math.max(dims[1], pieceHeight);
      }
      return dims;
    }, [0, 0]);
    const mergedImageDim = defaultBagKeys.reduce<[number, number]>((dims, key) => {
      const set = nodes.get(key)!.set;
      dims[0] += set.width;
      dims[1] += set.height;
      return dims;
    }, [0, 0]);
    const bound = [
      [-mergedImageDim[0], -mergedImageDim[1]],
      [mergedImageDim[0], mergedImageDim[1]]
    ] as [[number, number], [number, number]];

    const mergedGroupsToSpread: any[] = [];
    for (const key of defaultBagKeys) {
      const node = nodes.get(key)!;
      for (const p of node.bag.pieces) {
        mergedGroupsToSpread.push({
          indices: [p],
          imageId: node.imageId,
          x: 0,
          y: 0
        });
      }
    }

    const preset = "clearRect";
    const distCode = defaultDistributors[preset].code;
    let returnedVal: any = null;
    try {
      const fn = new Function("groups", "bound", "pieceDim", "imageDim", "skipRects", "force",
        distCode + "\n return spread(groups, bound, pieceDim, imageDim, skipRects, force);"
      );
      returnedVal = fn(
        mergedGroupsToSpread,
        bound,
        mergedPieceDim,
        mergedImageDim,
        [],
        true
      );
    } catch (e) {
      console.error("Merged ClearRect execution error:", e);
    }

    // Save returned regions for all default bags
    if (returnedVal && returnedVal.regions) {
      for (const [rName, rBound] of Object.entries(returnedVal.regions)) {
        for (const key of defaultBagKeys) {
          resolvedRegions.set(`${key}::${rName}`, rBound as [[number, number], [number, number]]);
        }
      }
    }

    // Distributors normally mutate the provided groups in place. Some custom
    // distributors also return a replacement list, so support both forms.
    const spreadGroups = returnedVal?.groups || mergedGroupsToSpread;
    for (const g of spreadGroups) {
      const gx = g.x;
      const gy = g.y;
      for (const idx of g.indices) {
        piecePositions.set(`${g.imageId}::${idx}`, [gx, gy]);
      }
    }
  }

  for (const key of sortedKeys) {
    if (isMergedClearRect && defaultBagKeys.includes(key)) {
      continue;
    }
    const node = nodes.get(key);
    if (!node) continue;

    const set = node.set;
    let bound = [[-set.width, -set.height], [set.width, set.height]] as [[number, number], [number, number]];

    // If connected and no cycle, resolve bounds
    if (node.deps.length > 0 && !cycleEdges.has(key)) {
      const parentKey = node.deps[0];
      const regionName = node.bag.connectedToRegion.regionName;
      const regKey = `${parentKey}::${regionName}`;
      if (resolvedRegions.has(regKey)) {
        bound = resolvedRegions.get(regKey)!;
      }
    }

    const groupsToSpread: any[] = [];
    if (node.bag.presolved) {
      groupsToSpread.push({
        indices: Array.from(node.bag.pieces),
        x: 0,
        y: 0
      });
    } else {
      for (const p of node.bag.pieces) {
        groupsToSpread.push({
          indices: [p],
          x: 0,
          y: 0
        });
      }
    }

    // Run distributor
    const preset = node.bag.distributorType || (node.bagId === 0 ? "clearRect" : "shitstain");
    let distCode = "";
    if (preset === 'custom') {
      distCode = node.bag.distributorCode || "";
    } else if (defaultDistributors[preset as keyof typeof defaultDistributors]) {
      distCode = defaultDistributors[preset as keyof typeof defaultDistributors].code;
    } else {
      const libDist = node.layout.customDistributors?.get(preset);
      distCode = libDist ? libDist.code : defaultDistributors.shitstain.code;
    }

    let returnedVal: any = null;
    if (distCode) {
      try {
        const fn = new Function("groups", "bound", "pieceDim", "imageDim", "skipRects", "force",
          distCode + "\n return spread(groups, bound, pieceDim, imageDim, skipRects, force);"
        );
        const boundW = bound[1][0] - bound[0][0];
        const boundH = bound[1][1] - bound[0][1];
        returnedVal = fn(groupsToSpread, bound, [set.pieceWidth, set.pieceHeight], [boundW * 0.5, boundH * 0.5], [], true);
      } catch (e) {
        console.error("Distributor execution error for bag:", node.bag.name, e);
      }
    }

    // Save returned regions
    if (returnedVal && returnedVal.regions) {
      for (const [rName, rBound] of Object.entries(returnedVal.regions)) {
        resolvedRegions.set(`${key}::${rName}`, rBound as [[number, number], [number, number]]);
      }
    }

    // Map group coordinates to positions
    for (const g of groupsToSpread) {
      if (g.indices.length > 1) {
        const getSolvedPos = (idx: number) => {
          if (node.layout.voronoiConfig && node.layout.voronoiConfig.sites[idx]) {
            const site = node.layout.voronoiConfig.sites[idx];
            return [
              site[0] * set.width / set.imageWidth,
              site[1] * set.height / set.imageHeight
            ];
          }
          const col = idx % set.cols;
          const row = Math.floor(idx / set.cols);
          return [
            col * set.pieceWidth! + set.pieceWidth! / 2,
            row * set.pieceHeight! + set.pieceHeight! / 2
          ];
        };

        const solvedPositions = g.indices.map((index: number) => getSolvedPos(index));
        const solvedCenter: [number, number] = [
          (Math.min(...solvedPositions.map((position: number[]) => position[0]))
            + Math.max(...solvedPositions.map((position: number[]) => position[0]))) / 2,
          (Math.min(...solvedPositions.map((position: number[]) => position[1]))
            + Math.max(...solvedPositions.map((position: number[]) => position[1]))) / 2
        ];
        for (const p of g.indices) {
          const solved = getSolvedPos(p);
          piecePositions.set(`${node.imageId}::${p}`, [
            g.x + (solved[0] - solvedCenter[0]),
            g.y + (solved[1] - solvedCenter[1])
          ]);
        }
      } else {
        const p = g.indices[0];
        piecePositions.set(`${node.imageId}::${p}`, [g.x, g.y]);
      }
    }
  }

  // 5. Build coordinate space trees to find root coordinate systems
  const mixedRootKey = "__mixed_defaults__";
  function getRootSpaceKey(imgId: string, bgId: number): string {
    const key = `${imgId}::${bgId}`;
    if (isMergedClearRect && defaultBagKeys.includes(key))
      return mixedRootKey;
    const layout = layoutsMap.get(imgId);
    const bag = layout?.bags.get(bgId);
    if (bag?.connectedToRegion) {
      const parentImgId = bag.connectedToRegion.parentImageId;
      const parentBgId = bag.connectedToRegion.parentBagId;
      const parentKey = `${parentImgId}::${parentBgId}`;
      if (nodes.has(parentKey) && !cycleEdges.has(`${imgId}::${bgId}`)) {
        return getRootSpaceKey(parentImgId, parentBgId);
      }
    }
    return `${imgId}::${bgId}`;
  }

  // Group pieces into root spaces
  interface PieceRef {
    imageId: string;
    pieceIndex: number;
    pos: [number, number];
  }
  const piecesInRootSpace = new Map<string, PieceRef[]>();

  for (const node of nodes.values()) {
    if (node.bag.pieces.size === 0) continue;
    const rootSpaceKey = getRootSpaceKey(node.imageId, node.bagId);
    if (!piecesInRootSpace.has(rootSpaceKey)) {
      piecesInRootSpace.set(rootSpaceKey, []);
    }
    for (const p of node.bag.pieces) {
      const pos = piecePositions.get(`${node.imageId}::${p}`) || [0, 0];
      piecesInRootSpace.get(rootSpaceKey)!.push({
        imageId: node.imageId,
        pieceIndex: p,
        pos
      });
    }
  }

  // 6. Pack root coordinate space boxes
  interface RootBox {
    rootSpaceKey: string;
    w: number;
    h: number;
    minX: number;
    minY: number;
    x: number;
    y: number;
    marginX: number;
    marginY: number;
    index: number;
  }

  const rootBoxes: RootBox[] = [];
  let rootIndex = 0;
  for (const rootSpaceKey of piecesInRootSpace.keys()) {
    const [rootImgId] = rootSpaceKey.split("::");
    const set = sets.find((s, idx) => (mediaItems[idx].item.objectUrl || idx.toString()) === rootImgId) || sets[0];
    const refs = piecesInRootSpace.get(rootSpaceKey) || [];
    const getSet = (imageId: string) => sets.find((candidate, idx) =>
      (mediaItems[idx].item.objectUrl || idx.toString()) === imageId
    ) || set;
    const minX = refs.length ? Math.min(...refs.map(ref => {
      const refSet = getSet(ref.imageId);
      const pieceWidth = refSet.pieceWidth || refSet.width / refSet.cols;
      const pieceHeight = refSet.pieceHeight || refSet.height / refSet.rows;
      return ref.pos[0] - (options.rotation ? Math.max(pieceWidth, pieceHeight) : pieceWidth) / 2;
    })) : -set.width;
    const minY = refs.length ? Math.min(...refs.map(ref => {
      const refSet = getSet(ref.imageId);
      const pieceWidth = refSet.pieceWidth || refSet.width / refSet.cols;
      const pieceHeight = refSet.pieceHeight || refSet.height / refSet.rows;
      return ref.pos[1] - (options.rotation ? Math.max(pieceWidth, pieceHeight) : pieceHeight) / 2;
    })) : -set.height;
    const maxX = refs.length ? Math.max(...refs.map(ref => {
      const refSet = getSet(ref.imageId);
      const pieceWidth = refSet.pieceWidth || refSet.width / refSet.cols;
      const pieceHeight = refSet.pieceHeight || refSet.height / refSet.rows;
      return ref.pos[0] + (options.rotation ? Math.max(pieceWidth, pieceHeight) : pieceWidth) / 2;
    })) : set.width;
    const maxY = refs.length ? Math.max(...refs.map(ref => {
      const refSet = getSet(ref.imageId);
      const pieceWidth = refSet.pieceWidth || refSet.width / refSet.cols;
      const pieceHeight = refSet.pieceHeight || refSet.height / refSet.rows;
      return ref.pos[1] + (options.rotation ? Math.max(pieceWidth, pieceHeight) : pieceHeight) / 2;
    })) : set.height;

    const w = Math.max(1, maxX - minX);
    const h = Math.max(1, maxY - minY);
    const marginX = Math.round(w * 0.25);
    const marginY = Math.round(h * 0.25);

    rootBoxes.push({
      rootSpaceKey,
      w: w + marginX * 2,
      h: h + marginY * 2,
      minX,
      minY,
      x: -1,
      y: -1,
      marginX,
      marginY,
      index: rootIndex++
    });
  }

  const area = rootBoxes.reduce((a, b) => a + b.w * b.h, 0);
  let estimatedMaxWidth = Math.max(1, Math.round(Math.sqrt(area)));
  const maxBoxWidth = Math.max(...rootBoxes.map(b => b.w));
  if (estimatedMaxWidth < maxBoxWidth) {
    estimatedMaxWidth = maxBoxWidth;
  }

  potpack(rootBoxes, estimatedMaxWidth, 9999999);

  let packingAttempts = 0;
  while (rootBoxes.some(box => (box.x ?? -1) < 0 || (box.y ?? -1) < 0)) {
    if (++packingAttempts > 1000)
      throw new Error("Could not pack puzzle layout");
    estimatedMaxWidth += 100;
    rootBoxes.forEach(box => {
      box.x = -1;
      box.y = -1;
    });
    potpack(rootBoxes, estimatedMaxWidth, 9999999);
  }

  // 7. Store final positions per image layout config
  const finalPositionsMap = new Map<string, [number, number][]>();
  for (let sid = 0; sid < mediaItems.length; sid++) {
    const imageId = mediaItems[sid].item.objectUrl || sid.toString();
    const layout = layoutsMap.get(imageId);
    if (layout) {
      const numPieces = layout.voronoiConfig ? layout.voronoiConfig.total : (sets[sid].cols * sets[sid].rows);
      finalPositionsMap.set(imageId, new Array(numPieces));
    }
  }

  for (const box of rootBoxes) {
    const refs = piecesInRootSpace.get(box.rootSpaceKey) || [];
    const offsetX = (box.x ?? 0) + box.marginX + 500;
    const offsetY = (box.y ?? 0) + box.marginY + 500;

    for (const ref of refs) {
      const finalX = ref.pos[0] - box.minX + offsetX;
      const finalY = ref.pos[1] - box.minY + offsetY;
      const layoutPositions = finalPositionsMap.get(ref.imageId);
      if (layoutPositions) {
        layoutPositions[ref.pieceIndex] = [finalX, finalY];
      }
    }
  }

  const orderedLayouts: SerializedImageLayoutConfig[] = [];
  for (let sid = 0; sid < mediaItems.length; sid++) {
    const imageId = mediaItems[sid].item.objectUrl || sid.toString();
    const layout = layoutsMap.get(imageId);
    if (layout) {
      const finalPos = finalPositionsMap.get(imageId) || [];
      layout.positions = finalPos;

      const bagsArray: SerializedBag[] = [];
      for (const [bagId, bag] of layout.bags.entries()) {
        bagsArray.push({
          id: bag.id,
          name: bag.name,
          color: bag.color,
          pieces: Array.from(bag.pieces),
          presolved: bag.presolved,
          hiddenUntil: bag.hiddenUntil,
          distributorType: bag.distributorType,
          distributorCode: bag.distributorCode,
          connectedToRegion: bag.connectedToRegion
        });
      }

      orderedLayouts.push({
        imageId,
        bags: bagsArray,
        positions: finalPos,
        voronoiConfig: layout.voronoiConfig,
        setConfig: { cols: sets[sid].cols, rows: sets[sid].rows }
      });
    }
  }

  return {
    orderedLayouts,
    cycleErrors: Array.from(cycleEdges)
  };
}
