<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import { onMount, tick } from "svelte";
  import { layoutStore, type BagId } from "./layoutStore";
  import roomSettings from "./roomSettingsStore";
  import { generatePieceShape, drawJigShapePath } from "../../room/render";
  import { Random } from "../../utils";
  import { tesselateSurface } from "./voronoi";
  import { generateSets } from "./utils";
  import { generateNubCoefficients } from "../../jig";
  import { arbitraryDrawNubPath } from "../../room/jig-generation";
  import CodeEditor from "./CodeEditor.svelte";
  import { defaultVoronoiSites, defaultDistributors } from "./distributorsPresets";
  import { Button } from "$lib/components/ui/button";
  import { Label } from "$lib/components/ui/label";
  import * as Tabs from "$lib/components/ui/tabs";
  import Checkbox from "./Checkbox.svelte";
  import { Slider } from "$lib/components/ui/slider";
  import type { MediaItem, PiecesEstimation } from "./types";
import { generateAndPackLayouts } from "./layoutGenerator";

  export let disabled = false;
  export let mediaItems: MediaItem[] = [];
  export let pieces: number = 25;

  let currentImageIndex = 0;

  $: currentMedia = mediaItems[currentImageIndex];

  $: actualPieces = $roomSettings.voronoi ? Math.round($roomSettings.pieces / (mediaItems.length || 1)) : COLS * ROWS;

  $: {
    if (currentMedia) {
      const imageId = currentMedia.item.objectUrl || currentImageIndex.toString();
      const layout = $layoutStore.get(imageId);
      const targetPieces = $roomSettings.voronoi ? (layout?.voronoiConfig?.total ?? Math.round($roomSettings.pieces / (mediaItems.length || 1))) : COLS * ROWS;
      if (!layout) {
        layoutStore.initImage(imageId, targetPieces);
      } else {
        let currentTotal = 0;
        for (const bag of layout.bags.values()) {
          currentTotal += bag.pieces.size;
        }
        if (currentTotal !== targetPieces && mode !== "path-split") {
          layoutStore.setPieceCount(imageId, targetPieces);
          
          // Rerun the layout distribution function to update positions
          const { orderedLayouts } = generateAndPackLayouts(mediaItems, $layoutStore, {
            pieces: $roomSettings.pieces,
            distributorCode: $roomSettings.distributorCode,
            distributorPreset: $roomSettings.distributorPreset,
            mixsets: $roomSettings.mixsets,
            rotation: $roomSettings.rotation,
          });
          for (const l of orderedLayouts) {
            const storeLayout = $layoutStore.get(l.imageId);
            if (storeLayout) {
              storeLayout.positions = l.positions;
            }
          }
        }
      }
    }
  }

  $: currentLayout = $layoutStore.get(currentMedia?.item?.objectUrl || currentImageIndex.toString());

  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D | null;

  let mode: "view" | "voronoi-spray" | "path-split" | "grid-split" = "view";
  let activeTab = "settings";
  $: {
    if (activeTab !== "bags" && mode === "path-split") {
      mode = "view";
    }
    if (activeTab === "bags" && mode === "voronoi-spray") {
      mode = "view";
    }
  }

  let lastPieces = $roomSettings.pieces;
  $: {
    if ($roomSettings.pieces !== lastPieces) {
      lastPieces = $roomSettings.pieces;
      customSites = [];
      const imageId = currentMedia?.item?.objectUrl || currentImageIndex.toString();
      if (imageId) {
        const dims = mediaItems.map((e) => [e.width, e.height]) as [number, number][];
        const sets = generateSets($roomSettings.pieces, mediaItems.length, dims);
        const set = sets[currentImageIndex];
        const targetPieces = $roomSettings.voronoi ? Math.round($roomSettings.pieces / (mediaItems.length || 1)) : (set ? set.cols * set.rows : $roomSettings.pieces);
        layoutStore.setPieceCount(imageId, targetPieces);
        const { orderedLayouts } = generateAndPackLayouts(mediaItems, $layoutStore, {
          pieces: $roomSettings.pieces,
          distributorCode: $roomSettings.distributorCode,
          distributorPreset: $roomSettings.distributorPreset,
          mixsets: $roomSettings.mixsets,
          rotation: $roomSettings.rotation,
        });
        for (const l of orderedLayouts) {
          const storeLayout = $layoutStore.get(l.imageId);
          if (storeLayout) {
            storeLayout.positions = l.positions;
          }
        }
      }
    }
  }
  let brushSize = 25;
  let isPainting = false;
  let isErasing = false;
  let zoomScale = 1.0;
  let zoomOffsetX = 0;
  let zoomOffsetY = 0;
  let isPanning = false;
  let panStartX = 0;
  let panStartY = 0;
  let isMouseOverCanvas = false;
  let customSites: [number, number][] = [];
  let dragStartPos: [number, number] | null = null;
  let dragCurrentPos: [number, number] | null = null;
  let dragPath: [number, number][] | null = null;

  let gridSplitX = 2;
  let gridSplitY = 2;
  let cachedVoronoiSites: [number, number][] = [];
  let cachedVoronoiTessellation: any[] = [];
  let lastSprayTime = 0;

  let lastImageId = "";
  $: {
    if (currentMedia) {
      const imageId = currentMedia.item.objectUrl || currentImageIndex.toString();
      if (imageId !== lastImageId) {
        lastImageId = imageId;
        const layout = $layoutStore.get(imageId);
        if (layout && layout.voronoiConfig && layout.voronoiConfig.sites) {
          customSites = [...layout.voronoiConfig.sites];
        } else {
          customSites = [];
        }
      }
    }
  }

  $: {
    if ($roomSettings || $layoutStore || customSites) {
      // Trigger redraw on settings, layout store, or custom sites changes
      drawPreview();
    }
  }

  let COLS = 5;
  let ROWS = 5;

  // Derive COLS and ROWS optimally matching aspect ratio to the required piece count
  $: {
    if (currentMedia) {
      const dims = mediaItems.map((e) => [e.width, e.height]) as [number, number][];
      const sets = generateSets($roomSettings.pieces, mediaItems.length, dims);
      const set = sets[currentImageIndex];
      if (set) {
        COLS = set.cols;
        ROWS = set.rows;
      }
    }
  }

  function getVoronoiSites(width: number, height: number, count: number): [number, number][] {
    const fnStr = $roomSettings.voronoiCode || defaultVoronoiSites.random.code;
    try {
      const fn = new Function("width", "height", "count", fnStr + "\n return generateSites(width, height, count);");
      return fn(width, height, count);
    } catch (e) {
      console.error("Voronoi Code Evaluation Error:", e);
      return [];
    }
  }

  function drawPreview() {
    if (!canvas) return;
    ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const parent = canvas.parentElement;
    if (!parent) return;

    const cw = parent.clientWidth;
    let ch = cw;

    if (currentMedia) {
      ch = Math.round(cw / (currentMedia.width / currentMedia.height));
    }

    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    canvas.style.width = cw + "px";
    canvas.style.height = ch + "px";

    ctx.scale(dpr, dpr);
    ctx.translate(zoomOffsetX, zoomOffsetY);
    ctx.scale(zoomScale, zoomScale);

    ctx.clearRect(-zoomOffsetX/zoomScale, -zoomOffsetY/zoomScale, cw/zoomScale, ch/zoomScale);

    const showOutlines = !(mode === "path-split" && isMouseOverCanvas);
    const outlineColor = showOutlines ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.0)";

    // Render the backdrop image correctly
    if (currentMedia?.element instanceof HTMLImageElement || currentMedia?.element instanceof HTMLVideoElement) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.drawImage(currentMedia.element as any, 0, 0, cw, ch);
      ctx.restore();
    }

    const set = { cols: COLS, rows: ROWS } as any;
    const marginX = 1;
    const marginY = 1;
    const pieceWidth = (cw - marginX * 2) / COLS;
    const pieceHeight = (ch - marginY * 2) / ROWS;

    const random = new Random(1337);

    // Simplistic drawing for performance mock
    const fastMode = COLS * ROWS > 1000;

    const pieceColors = new Map<number, string>();
    if (currentLayout) {
      for (const bag of currentLayout.bags.values()) {
        for (const p of bag.pieces) {
          pieceColors.set(p, bag.color);
        }
      }
    }

    if ($roomSettings.voronoi) {
      const targetCount = Math.round($roomSettings.pieces / (mediaItems.length || 1));
      let sites;

      const currentSet = generateSets($roomSettings.pieces, mediaItems.length, mediaItems.map(m => [m.width, m.height]) as [number, number][])[currentImageIndex];
      const setW = currentSet ? currentSet.imageWidth : cw;
      const setH = currentSet ? currentSet.imageHeight : ch;

      if (mode === "voronoi-spray" || (customSites && customSites.length > 0)) {
        // If in spray mode or we have custom sites, we override visually with whatever the user paints
        if (mode === "voronoi-spray" && customSites.length === 0) {
          customSites = getVoronoiSites(setW, setH, targetCount);
        }
        sites = customSites;
      } else {
        sites = getVoronoiSites(setW, setH, targetCount);
      }

      ctx.save();
      ctx.translate(marginX, marginY);
      ctx.scale(cw / setW, ch / setH);
      ctx.strokeStyle = outlineColor;
      ctx.lineWidth = 1.5 / (cw / setW);

      if (!sites || sites.length >= 3) {
        try {
          const tessellation = tesselateSurface(setW, setH, targetCount, 42, sites);
          cachedVoronoiSites = tessellation.map((t) => t.site);
          cachedVoronoiTessellation = tessellation;

          const imageId = currentMedia.item.objectUrl || currentImageIndex.toString();
          layoutStore.update((m) => {
            const l = m.get(imageId);
            if (l) {
              const edges = tessellation
                .map((t, idx) => t.segments.some((s) => s.neighborIndex === undefined) ? idx : -1)
                .filter((idx) => idx !== -1);
              l.voronoiConfig = {
                total: tessellation.length,
                edges,
                seed: 42,
                sites: tessellation.map((t) => t.site),
              };
            }
            return new Map(m);
          });

          const precomputedPieces = new Map<number, any>();
          const tabSize = $roomSettings.tabSize;
          const jitter = $roomSettings.jitter;

          // Instantiate a fresh Random instance with a fixed seed so curves generated are stable per frame
          const generatorRandom = new Random(1337);

          for (let j = 0; j < tessellation.length; ++j) {
            const cell = tessellation[j];
            let p: any = {};
            p.site = cell.site;
            p.geometry = cell.geometry;
            p.curves = [];

            for (let si = 0; si < cell.segments.length; ++si) {
              const seg = cell.segments[si];
              if (seg.neighborIndex === undefined) {
                p.curves.push(undefined);
              } else {
                if (precomputedPieces.has(seg.neighborIndex)) {
                  const nshape = precomputedPieces.get(seg.neighborIndex);
                  const ncell = tessellation[seg.neighborIndex];
                  const nsegidx = ncell.segments.findIndex((s) => s.neighborIndex === j);
                  const curve = nshape.curves[nsegidx];
                  p.curves.push(curve ? { ...curve, flip: !curve.flip } : undefined);
                } else {
                  p.curves.push(generateNubCoefficients(generatorRandom, jitter));
                }
              }
            }
            precomputedPieces.set(j, p);
          }

          for (const [j, piece] of precomputedPieces.entries()) {
            if (piece.geometry.length === 0) continue;
            ctx.save();
            ctx.translate(piece.site[0], piece.site[1]);
            ctx.beginPath();

            let isFirst = true;
            let prevPoint: any = null;
            for (let i = 0; i < piece.geometry.length; i++) {
              const line = piece.geometry[i];
              if (isFirst) {
                ctx.moveTo(line[0], line[1]);
                prevPoint = line;
                isFirst = false;
              } else {
                // seg i - 1 corresponds to curves[i - 1]
                const curve = piece.curves[i - 1];
                if (!curve || tabSize === 0) {
                  ctx.lineTo(line[0], line[1]);
                } else {
                  arbitraryDrawNubPath(ctx as any, prevPoint, line, curve, tabSize);
                }
                prevPoint = line;
              }
            }
            const color = pieceColors.get(j) || "rgba(0,0,0,0)";
            ctx.fillStyle = color;
            ctx.globalAlpha = 0.5;
            ctx.fill();
            ctx.globalAlpha = 1.0;
            ctx.stroke();
            ctx.restore();
          }
        } catch (err) {
          console.error(err);
        }
      }
      ctx.restore();
    } else if ($roomSettings.square || fastMode) {
      ctx.save();
      ctx.translate(marginX, marginY);
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.lineWidth = 2;
      for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
          const pieceIndex = row * COLS + col;
          const color = pieceColors.get(pieceIndex) || "rgba(0,0,0,0)";
          ctx.beginPath();
          ctx.rect(col * pieceWidth, row * pieceHeight, pieceWidth, pieceHeight);
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.5;
          ctx.fill();
          ctx.globalAlpha = 1.0;
          ctx.stroke();
        }
      }
      ctx.restore();
    } else {
      const previousPieces: any[] = [];

      ctx.save();
      ctx.translate(marginX, marginY);
      ctx.strokeStyle = outlineColor;
      ctx.lineWidth = 1.5;

      let pieceindex = 0;
      for (let rowindex = 0; rowindex < ROWS; rowindex++) {
        for (let columnindex = 0; columnindex < COLS; columnindex++, pieceindex++) {
          const { pieceShape } = generatePieceShape(
            random,
            previousPieces,
            columnindex,
            rowindex,
            set,
            pieceWidth,
            pieceHeight,
            { x: 0, y: 0 },
            $roomSettings.jitter,
            $roomSettings.cornerJitter,
            $roomSettings.fakeEdge,
            $roomSettings.zigzag,
            $roomSettings.noEdge,
          );

          previousPieces.push({
            puzzle: pieceShape,
            index: pieceindex,
            tl: pieceShape.tl,
            tr: pieceShape.tr,
            bl: pieceShape.bl,
            br: pieceShape.br,
          });

          ctx.beginPath();
          drawJigShapePath(ctx as any, columnindex * pieceWidth, rowindex * pieceHeight, pieceShape, $roomSettings.tabSize);
          const color = pieceColors.get(pieceindex) || "rgba(0,0,0,0)";
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.5;
          ctx.fill();
          ctx.globalAlpha = 1.0;
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // Interactive Spray cursor
    if (mode === "voronoi-spray" && customSites) {
      ctx.save();
      ctx.fillStyle = "white";
      const currentSet = generateSets($roomSettings.pieces, mediaItems.length, mediaItems.map(m => [m.width, m.height]) as [number, number][])[currentImageIndex];
      const setW = currentSet ? currentSet.width : cw;
      const setH = currentSet ? currentSet.height : ch;
      for (const pt of customSites) {
        ctx.beginPath();
        const px = marginX + pt[0] * (cw / setW);
        const py = marginY + pt[1] * (ch / setH);
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Render interactive tool overlays
    if (dragPath && dragPath.length > 0 && mode === "path-split") {
      ctx.save();
      ctx.fillStyle = "rgba(0, 255, 255, 0.2)";
      ctx.strokeStyle = "cyan";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(dragPath[0][0], dragPath[0][1]);
      for (let i = 1; i < dragPath.length; i++) {
        ctx.lineTo(dragPath[i][0], dragPath[i][1]);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  function getConnectedComponents(pieces: Set<number>) {
    const components: Set<number>[] = [];
    const unvisited = new Set(pieces);

    let tess = cachedVoronoiTessellation;
    const targetCount = $roomSettings.voronoi ? Math.round($roomSettings.pieces / (mediaItems.length || 1)) : $roomSettings.pieces;
    if ($roomSettings.voronoi && (!tess || tess.length !== targetCount) && canvas) {
      const parent = canvas.parentElement;
      if (parent) {
        const cw = parent.clientWidth;
        let ch = cw;
        if (currentMedia) {
          ch = Math.round(cw / (currentMedia.width / currentMedia.height));
        }
        const marginX = 1;
        const marginY = 1;
        const currentSet = generateSets($roomSettings.pieces, mediaItems.length, mediaItems.map(m => [m.width, m.height]) as [number, number][])[currentImageIndex];
        const setW = currentSet ? currentSet.imageWidth : cw;
        const setH = currentSet ? currentSet.imageHeight : ch;
        const sites = mode === "voronoi-spray" ? customSites : getVoronoiSites(setW, setH, targetCount);
        try {
          tess = tesselateSurface(setW, setH, targetCount, 42, sites);
          cachedVoronoiTessellation = tess;
        } catch (e) {
          console.error(e);
        }
      }
    }

    while (unvisited.size > 0) {
      const start = unvisited.values().next().value;
      if (start === undefined) break;
      const queue = [start];
      unvisited.delete(start);
      const comp = new Set<number>([start]);

      while (queue.length > 0) {
        const curr = queue.shift()!;
        const neighbors = new Set<number>();

        if ($roomSettings.voronoi) {
          if (tess && tess[curr]) {
            for (const neighbor of tess[curr].neighbors) {
              const o = neighbor.id;
              if (o !== undefined && o !== curr && unvisited.has(o)) {
                neighbors.add(o);
              }
            }
          }
        } else {
          // Standard grid neighbor logic
          const r = Math.floor(curr / COLS);
          const c = curr % COLS;
          const dirs = [
            [-1, 0],
            [1, 0],
            [0, -1],
            [0, 1],
          ];
          for (const [dr, dc] of dirs) {
            const nr = r + dr;
            const nc = c + dc;
            if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
              const nid = nr * COLS + nc;
              if (unvisited.has(nid)) {
                neighbors.add(nid);
              }
            }
          }
        }

        for (const n of neighbors) {
          unvisited.delete(n);
          comp.add(n);
          queue.push(n);
        }
      }
      components.push(comp);
    }
    return components;
  }

  function splitSelectedPieces(selectedIdxs: Set<number>, customName?: string) {
    if (selectedIdxs.size === 0) return;
    layoutStore.update((m) => {
      const l = m.get(currentMedia?.item?.objectUrl || currentImageIndex.toString());
      if (!l) return m;
      const colors = ["#f44336", "#e91e63", "#9c27b0", "#673ab7", "#3f51b5", "#2196f3", "#03a9f4", "#00bcd4"];
      const newPiecesCollection = new Set<number>();

      const getNextLocalBagId = (bagsMap: Map<any, any>) => {
        let max = -1;
        for (const key of bagsMap.keys()) {
          if (Number(key) > max) max = Number(key);
        }
        return max + 1;
      };

      const defaultBag = l.bags.get(0);
      const isConnected = defaultBag && (defaultBag.distributorType === "clearRect");
      const connectedToRegion = isConnected ? {
        parentImageId: l.imageId,
        parentBagId: 0,
        regionName: "center"
      } : undefined;

      for (const [bagId, bag] of Array.from(l.bags.entries())) {
        const toMove = new Set<number>();
        for (const p of bag.pieces) {
          if (selectedIdxs.has(p)) {
            toMove.add(p);
            newPiecesCollection.add(p);
          }
        }
        if (toMove.size === 0) continue;
        for (const p of toMove) bag.pieces.delete(p);

        // Discard 0-length bag entirely, but retain default properties
        const isDefault = bagId === 0;
        if (bag.pieces.size === 0) {
          if (!isDefault) {
            l.bags.delete(bagId);
          }
        } else {
          // Re-eval pieces to ensure no orphans/islands were left behind in the split!
          const oldComps = getConnectedComponents(bag.pieces);
          if (oldComps.length > 0) {
            bag.pieces = oldComps[0]; // Assign the main trunk back into the original bag
            for (let i = 1; i < oldComps.length; i++) {
              const newBagId = getNextLocalBagId(l.bags);
              l.bags.set(newBagId, {
                id: newBagId,
                name: customName ? `${customName} Island #${newBagId}` : `Bag ${l.bags.size + 1}`,
                color: colors[l.bags.size % colors.length],
                pieces: oldComps[i],
                presolved: false,
                distributorType: "disk",
                distributorCode: defaultDistributors.disk.code,
                connectedToRegion
              });
            }
          }
        }
      }

      if (newPiecesCollection.size > 0) {
        const newComps = getConnectedComponents(newPiecesCollection);
        for (const comp of newComps) {
          const newBagId = getNextLocalBagId(l.bags);
          l.bags.set(newBagId, {
            id: newBagId,
            name: customName ? (customName === "Edge pieces" ? customName : `${customName} #${newBagId}`) : `Bag ${l.bags.size + 1}`,
            color: colors[l.bags.size % colors.length],
            pieces: comp,
            presolved: false,
            distributorType: "disk",
            distributorCode: defaultDistributors.disk.code,
            connectedToRegion
          });
        }
      }

      // Force Svelte to detect the Map and Object reference change visually!
      m.set(l.imageId, { ...l, bags: new Map(l.bags) });
      return new Map(m);
    });
    drawPreview();
  }

  function handlePointerDown(e: PointerEvent) {
    if (mode === "view") {
      isPanning = true;
      panStartX = e.clientX - zoomOffsetX;
      panStartY = e.clientY - zoomOffsetY;
      try { canvas.setPointerCapture(e.pointerId); } catch {}
      return;
    }
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (e) {}

    const rect = canvas.getBoundingClientRect();
    const rawX = e.clientX - rect.left;
    const rawY = e.clientY - rect.top;
    const x = (rawX - zoomOffsetX) / zoomScale;
    const y = (rawY - zoomOffsetY) / zoomScale;

    if (mode === "voronoi-spray") {
      if (e.button === 0) isPainting = true;
      if (e.button === 2) isErasing = true;
      spray(e);
    } else {
      dragStartPos = [x, y];
      dragCurrentPos = [x, y];
      if (mode === "path-split") {
        dragPath = [[x, y]];
      }
    }
  }

  function handlePointerMove(e: PointerEvent) {
    if (mode === "view") {
      if (isPanning) {
        zoomOffsetX = e.clientX - panStartX;
        zoomOffsetY = e.clientY - panStartY;
        drawPreview();
      }
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const rawX = e.clientX - rect.left;
    const rawY = e.clientY - rect.top;
    const x = (rawX - zoomOffsetX) / zoomScale;
    const y = (rawY - zoomOffsetY) / zoomScale;

    if (mode === "voronoi-spray" && (isPainting || isErasing)) {
      spray(e, rawX, rawY);
    } else if (dragStartPos) {
      dragCurrentPos = [x, y];
      if (mode === "path-split" && dragPath) {
        dragPath.push([x, y]);
      }
      drawPreview();
    }
  }

  function handlePointerUp(e: PointerEvent) {
    if (mode === "view") {
      if (isPanning) {
        isPanning = false;
        try { canvas.releasePointerCapture(e.pointerId); } catch {}
      }
      return;
    }
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch (e) {}

    if (mode === "voronoi-spray") {
      isPainting = false;
      isErasing = false;
      drawPreview();
    } else if (dragStartPos && dragCurrentPos) {
      const selectedIdxs = new Set<number>();
      const rect = canvas.getBoundingClientRect();
      const parent = canvas.parentElement;
      if (!parent) return;

      const cw = parent.clientWidth;
      let ch = cw;
      if (currentMedia) {
        ch = Math.round(cw / (currentMedia.width / currentMedia.height));
      }

      const marginX = 1;
      const marginY = 1;
      const pieceWidth = (cw - marginX * 2) / COLS;
      const pieceHeight = (ch - marginY * 2) / ROWS;

      const checkPointInPath = (cx: number, cy: number, path: [number, number][]) => {
        let inside = false;
        for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
          const xi = path[i][0],
            yi = path[i][1];
          const xj = path[j][0],
            yj = path[j][1];

          const intersect =
            yi > cy !== yj > cy && cx < ((xj - xi) * (cy - yi)) / (yj - yi) + xi;
          if (intersect) inside = !inside;
        }
        return inside;
      };

      if ($roomSettings.voronoi && cachedVoronoiTessellation) {
        const currentSet = generateSets($roomSettings.pieces, mediaItems.length, mediaItems.map(m => [m.width, m.height]) as [number, number][])[currentImageIndex];
        const setW = currentSet ? currentSet.width : cw;
        const setH = currentSet ? currentSet.height : ch;

        // Path split with Voronoi cell sites
        if (mode === "path-split" && dragPath) {
          for (let i = 0; i < cachedVoronoiTessellation.length; i++) {
            const cell = cachedVoronoiTessellation[i];
            const cx = marginX + cell.site[0] * (cw / setW);
            const cy = marginY + cell.site[1] * (ch / setH);
            if (checkPointInPath(cx, cy, dragPath)) {
              selectedIdxs.add(i);
            }
          }
        }
      } else {
        if (mode === "path-split" && dragPath) {
          for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
              const cx = c * pieceWidth + pieceWidth / 2 + marginX;
              const cy = r * pieceHeight + pieceHeight / 2 + marginY;
              if (checkPointInPath(cx, cy, dragPath)) {
                selectedIdxs.add(r * COLS + c);
              }
            }
          }
        }
      }

      splitSelectedPieces(selectedIdxs, "Path");

      dragStartPos = null;
      dragCurrentPos = null;
      dragPath = null;
      drawPreview();
    }
  }

  function handleWheel(e: WheelEvent) {
    if (mode === "voronoi-spray") {
      e.preventDefault();
      brushSize = Math.max(5, Math.min(100, brushSize + (e.deltaY > 0 ? -5 : 5)));
      return;
    }

    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    const newScale = Math.max(0.5, Math.min(8.0, zoomScale * zoomFactor));

    if (newScale !== zoomScale) {
      zoomOffsetX = mouseX - (mouseX - zoomOffsetX) * (newScale / zoomScale);
      zoomOffsetY = mouseY - (mouseY - zoomOffsetY) * (newScale / zoomScale);
      zoomScale = newScale;
      drawPreview();
    }
  }

  function spray(e: PointerEvent, forceX?: number, forceY?: number) {
    const now = Date.now();
    if (now - lastSprayTime < 40) return; // Throttle to 25 events per second
    lastSprayTime = now;

    let x = forceX;
    let y = forceY;

    if (x === undefined || y === undefined) {
      const rect = canvas.getBoundingClientRect();
      x = e.clientX - rect.left;
      y = e.clientY - rect.top;
    }

    // Convert from zoomed space
    x = (x - zoomOffsetX) / zoomScale;
    y = (y - zoomOffsetY) / zoomScale;

    const parent = canvas.parentElement;
    if (!parent) return;
    const cw = parent.clientWidth;
    let ch = cw;
    if (currentMedia) {
      ch = Math.round(cw / (currentMedia.width / currentMedia.height));
    }
    const currentSet = generateSets($roomSettings.pieces, mediaItems.length, mediaItems.map(m => [m.width, m.height]) as [number, number][])[currentImageIndex];
    const setW = currentSet ? currentSet.width : cw;
    const setH = currentSet ? currentSet.height : ch;
    
    const marginX = 1;
    const marginY = 1;
    
    // Scale screen/CSS coords to setW/setH space
    const siteX = (x - marginX) * (setW / cw);
    const siteY = (y - marginY) * (setH / ch);

    if (isPainting) {
      for (let i = 0; i < 2; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * brushSize;
        const offsetX = Math.cos(a) * r;
        const offsetY = Math.sin(a) * r;
        const ptX = siteX + offsetX * (setW / cw);
        const ptY = siteY + offsetY * (setH / ch);
        customSites.push([ptX, ptY]);
      }
      customSites = customSites;
    } else if (isErasing) {
      const rx = brushSize * (setW / cw);
      const ry = brushSize * (setH / ch);
      const rSq = ((rx + ry) / 2) ** 2;
      customSites = customSites.filter((site) => (site[0] - siteX) ** 2 + (site[1] - siteY) ** 2 > rSq);
    }
    drawPreview();
  }

  function handlePresetChange() {
    if ($roomSettings.voronoiPreset && $roomSettings.voronoiPreset !== "custom") {
      const preset = defaultVoronoiSites[$roomSettings.voronoiPreset as keyof typeof defaultVoronoiSites];
      if (preset) {
        $roomSettings.voronoiCode = preset.code;
        customSites = [];
      }
    }
    drawPreview();
  }

  let selectedBagId: BagId = 0;
  let selectedBagImageId = "";

  $: {
    if (currentMedia) {
      const activeImageId = currentMedia.item.objectUrl || currentImageIndex.toString();
      if (!selectedBagImageId) {
        selectedBagImageId = activeImageId;
      }
    }
  }

  $: activeBagLayout = $layoutStore.get(selectedBagImageId);
  $: activeBag = activeBagLayout?.bags.get(selectedBagId);

  let currentPreset = "clearRect";
  let currentCode = "";
  let updatingFromLayout = false;

  $: {
    if (activeBag) {
      updatingFromLayout = true;
      currentPreset = activeBag.distributorType;
      currentCode = activeBag.distributorCode || "";
      tick().then(() => updatingFromLayout = false);
    }
  }

  $: {
    if (!updatingFromLayout && activeBag) {
      if (currentPreset !== activeBag.distributorType) {
        updateDistributorPreset(currentPreset);
      }
    }
  }

  $: {
    if (!updatingFromLayout && activeBag) {
      if (currentCode !== activeBag.distributorCode) {
        updateDistributorCode(currentCode);
      }
    }
  }

  function getSpeculativeRegions(type: string, code: string, w: number, h: number, pw: number, ph: number): string[] {
    const activeType = type || "clearRect";
    let finalCode = code;
    if (activeType !== 'custom') {
      const preset = defaultDistributors[activeType as keyof typeof defaultDistributors];
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
    } catch (e) {}
    return [];
  }

  function getBagName(imgId: string, bId: BagId): string {
    const layout = $layoutStore.get(imgId);
    const bag = layout?.bags.get(bId);
    const imgIndex = mediaItems.findIndex((m, idx) => (m.item.objectUrl || idx.toString()) === imgId);
    const setLabel = imgIndex >= 0 ? `Set ${imgIndex + 1}` : imgId;
    return bag ? `${bag.name} (${setLabel})` : `Bag ${bId}`;
  }

  function getAvailableRegions(currentImgId: string, currentBagId: BagId) {
    const list: { label: string; value: string }[] = [];
    for (const [imgId, layout] of $layoutStore.entries()) {
      const imgIndex = mediaItems.findIndex((m, idx) => (m.item.objectUrl || idx.toString()) === imgId);
      const setLabel = imgIndex >= 0 ? `Set ${imgIndex + 1}` : imgId;
      for (const bag of layout.bags.values()) {
        if (imgId === currentImgId && bag.id === currentBagId) continue;
        const key = `${imgId}::${bag.id}`;
        const specRegs = specRegionsMap.get(key) || [];
        for (const reg of specRegs) {
          list.push({
            label: `${bag.name} (${setLabel}) → ${reg}`,
            value: `${imgId}::${bag.id}::${reg}`
          });
        }
      }
    }
    return list;
  }

  function connectBagRegion(imageId: string, bagId: BagId, value: string) {
    if (!value) return;
    const [parentImgId, parentBgIdStr, regionName] = value.split("::");
    const parentBgId = Number(parentBgIdStr);
    layoutStore.update((m) => {
      const l = m.get(imageId);
      if (l) {
        const b = l.bags.get(bagId);
        if (b) {
          b.connectedToRegion = {
            parentImageId: parentImgId,
            parentBagId: parentBgId,
            regionName
          };
          m.set(imageId, { ...l, bags: new Map(l.bags) });
        }
      }
      return new Map(m);
    });
    regenerateCurrentLayout();
  }

  function disconnectBagRegion(imageId: string, bagId: BagId) {
    layoutStore.update((m) => {
      const l = m.get(imageId);
      if (l) {
        const b = l.bags.get(bagId);
        if (b) {
          b.connectedToRegion = undefined;
          m.set(imageId, { ...l, bags: new Map(l.bags) });
        }
      }
      return new Map(m);
    });
    regenerateCurrentLayout();
  }

  function changeBagDistributorType(imageId: string, bagId: BagId, type: string) {
    layoutStore.update((m) => {
      const l = m.get(imageId);
      if (l) {
        const b = l.bags.get(bagId);
        if (b) {
          b.distributorType = type as any;
          if (type !== "custom") {
            const presetObj = defaultDistributors[type as keyof typeof defaultDistributors];
            if (presetObj) {
              b.distributorCode = presetObj.code;
            }
          }
          m.set(imageId, { ...l, bags: new Map(l.bags) });
        }
      }
      return new Map(m);
    });
    regenerateCurrentLayout();
  }

  function updateDistributorPreset(preset: string) {
    if (!selectedBagImageId) return;
    layoutStore.update((m) => {
      const l = m.get(selectedBagImageId);
      if (l) {
        const b = l.bags.get(selectedBagId);
        if (b) {
          b.distributorType = preset as any;
          if (preset !== "custom") {
            const presetObj = defaultDistributors[preset as keyof typeof defaultDistributors];
            if (presetObj) {
              b.distributorCode = presetObj.code;
            }
          }
          m.set(selectedBagImageId, { ...l, bags: new Map(l.bags) });
        }
      }
      return new Map(m);
    });
    regenerateCurrentLayout();
  }

  function updateDistributorCode(code: string) {
    if (!selectedBagImageId) return;
    layoutStore.update((m) => {
      const l = m.get(selectedBagImageId);
      if (l) {
        const b = l.bags.get(selectedBagId);
        if (b) {
          b.distributorCode = code;
          b.distributorType = "custom";
          m.set(selectedBagImageId, { ...l, bags: new Map(l.bags) });
        }
      }
      return new Map(m);
    });
    regenerateCurrentLayout();
  }

  let cycleErrors: string[] = [];

  function regenerateCurrentLayout() {
    const { orderedLayouts, cycleErrors: errors } = generateAndPackLayouts(mediaItems, $layoutStore, {
      pieces: $roomSettings.pieces,
      distributorCode: $roomSettings.distributorCode,
      distributorPreset: $roomSettings.distributorPreset,
      mixsets: $roomSettings.mixsets,
      rotation: $roomSettings.rotation,
    });
    cycleErrors = errors || [];
    for (const l of orderedLayouts) {
      const storeLayout = $layoutStore.get(l.imageId);
      if (storeLayout) {
        storeLayout.positions = l.positions;
      }
    }
    drawPreview();
  }

  $: {
    if ($roomSettings.voronoiPreset && $roomSettings.voronoiPreset !== "custom") {
      const preset = defaultVoronoiSites[$roomSettings.voronoiPreset as keyof typeof defaultVoronoiSites];
      if (preset && $roomSettings.voronoiCode !== preset.code) {
        $roomSettings.voronoiCode = preset.code;
        customSites = [];
      }
    }
  }

  onMount(() => {
    if (!$roomSettings.voronoiCode || $roomSettings.voronoiCode === "") {
      const preset = defaultVoronoiSites[$roomSettings.voronoiPreset as keyof typeof defaultVoronoiSites];
      if (preset) $roomSettings.voronoiCode = preset.code;
    }
    if (!$roomSettings.distributorCode || $roomSettings.distributorCode === "") {
      const preset = defaultDistributors[$roomSettings.distributorPreset as keyof typeof defaultDistributors];
      if (preset) $roomSettings.distributorCode = preset.code;
    }
    drawPreview();
  });

  function separateEdges() {
    const edges = new Set<number>();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) {
          edges.add(r * COLS + c);
        }
      }
    }
    splitSelectedPieces(edges, "Edge pieces");
  }

  function mixSets() {
    if (!currentMedia) return;
    const imageId = currentMedia.item.objectUrl || currentImageIndex.toString();
    layoutStore.update((m) => {
      const layout = m.get(imageId);
      if (!layout) return m;
      let allPieces = new Set<number>();
      for (const bag of layout.bags.values()) {
        for (const p of bag.pieces) {
          allPieces.add(p);
        }
      }

      const defaultBagId = Array.from(layout.bags.keys())[0];
      const defaultBag = layout.bags.get(defaultBagId)!;
      defaultBag.pieces = allPieces;

      const newBags = new Map();
      newBags.set(defaultBagId, defaultBag);
      layout.bags = newBags;

      m.set(imageId, { ...layout, bags: new Map(layout.bags) });
      return new Map(m);
    });
  }

  function splitGridExplicitly() {
    if (!currentMedia) return;
    layoutStore.update((m) => {
      const layout = m.get(currentMedia.item.objectUrl || currentImageIndex.toString());
      if (!layout) return m;

      // Group the pieces into distinct sets
      const chunkW = COLS / gridSplitX;
      const chunkH = ROWS / gridSplitY;
      const sets: Set<number>[] = [];

      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const px = Math.min(Math.floor(c / chunkW), gridSplitX - 1);
          const py = Math.min(Math.floor(r / chunkH), gridSplitY - 1);
          const bagIdx = py * gridSplitX + px;
          if (!sets[bagIdx]) sets[bagIdx] = new Set();
          sets[bagIdx].add(r * COLS + c);
        }
      }

      layout.bags.clear();

      const colors = ["#f44336", "#e91e63", "#9c27b0", "#673ab7", "#3f51b5", "#2196f3", "#03a9f4", "#00bcd4"];
      const getNextLocalBagId = (bagsMap: Map<any, any>) => {
        let max = -1;
        for (const key of bagsMap.keys()) {
          if (Number(key) > max) max = Number(key);
        }
        return max + 1;
      };

      sets.forEach((set, i) => {
        if (!set || set.size === 0) return;
        const newBagId = getNextLocalBagId(layout.bags);
        const isDefault = newBagId === 0;
        layout.bags.set(newBagId, {
          id: newBagId,
          name: isDefault ? "Default Bag" : `Grid #${newBagId}`,
          color: isDefault ? "rgba(0,0,0,0)" : colors[i % colors.length],
          pieces: set,
          presolved: false,
          distributorType: "shitstain",
          distributorCode: defaultDistributors.shitstain.code
        });
      });

      m.set(layout.imageId, { ...layout, bags: new Map(layout.bags) });
      return new Map(m);
    });
    drawPreview();
  }

  function resetShapeSettings() {
    $roomSettings.jitter = 0.15;
    $roomSettings.cornerJitter = 0.15;
    $roomSettings.tabSize = 0.1;
    $roomSettings.zigzag = false;
    $roomSettings.fakeEdge = false;
    $roomSettings.voronoi = false;
    $roomSettings.voronoiPreset = 'random';
    const randomPreset = defaultVoronoiSites.random;
    if (randomPreset) $roomSettings.voronoiCode = randomPreset.code;
    drawPreview();
  }

  function deleteBag(imageId: string, bagId: BagId) {
    layoutStore.removeBag(imageId, bagId);
    if (selectedBagId === bagId && selectedBagImageId === imageId) {
      selectedBagId = 0;
      selectedBagImageId = currentImageId;
    }
    drawPreview();
  }

  let draggedBagId: BagId | null = null;
  let draggedImageId: string | null = null;
  let draggingOverBagId: BagId | null = null;
  let draggingOverImageId: string | null = null;

  function handleBagDragStart(e: DragEvent, imageId: string, bagId: BagId) {
    draggedBagId = bagId;
    draggedImageId = imageId;
    if (e.dataTransfer) {
      e.dataTransfer.setData("text/plain", `${imageId}::${bagId}`);
      e.dataTransfer.effectAllowed = "move";
    }
  }

  function handleBagDragEnd(e: DragEvent) {
    draggedBagId = null;
    draggedImageId = null;
    draggingOverBagId = null;
    draggingOverImageId = null;
  }

  function handleBagDragOver(e: DragEvent, imageId: string, bagId: BagId) {
    e.preventDefault();
    if (imageId === draggedImageId && bagId !== draggedBagId) {
      draggingOverBagId = bagId;
      draggingOverImageId = imageId;
    }
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  }

  function handleBagDragLeave(e: DragEvent, imageId: string, bagId: BagId) {
    if (draggingOverBagId === bagId && draggingOverImageId === imageId) {
      draggingOverBagId = null;
      draggingOverImageId = null;
    }
  }

  function handleBagDrop(e: DragEvent, targetImageId: string, targetBagId: BagId) {
    e.preventDefault();
    const data = e.dataTransfer ? e.dataTransfer.getData("text/plain") : null;
    const parts = data ? data.split("::") : [];
    const sourceImageId = parts[0] || draggedImageId;
    const sourceBagId = parts[1] !== undefined ? Number(parts[1]) : draggedBagId;

    draggingOverBagId = null;
    draggingOverImageId = null;
    draggedBagId = null;
    draggedImageId = null;

    if (sourceImageId && sourceBagId !== null && sourceBagId !== targetBagId && sourceImageId === targetImageId) {
      layoutStore.setHiddenUntil(sourceImageId, sourceBagId, targetBagId);
    }
  }

  function clearBagHiddenUntil(imageId: string, bagId: BagId) {
    layoutStore.clearHiddenUntil(imageId, bagId);
  }

  $: currentImageId = currentMedia?.item?.objectUrl || currentImageIndex.toString();

  $: allBagsWithMetadata = Array.from($layoutStore.entries()).flatMap(([imageId, layout]) => {
    const setIdx = mediaItems.findIndex((m, idx) => (m.item.objectUrl || idx.toString()) === imageId);
    return Array.from(layout.bags.values()).map(bag => ({
      bag,
      imageId,
      imageName: mediaItems[setIdx] ? `Set ${setIdx + 1}` : `Set ${imageId}`,
      isCurrentSet: imageId === currentImageId,
      layout
    }));
  }).sort((a, b) => {
    if (a.isCurrentSet && !b.isCurrentSet) return -1;
    if (!a.isCurrentSet && b.isCurrentSet) return 1;
    if (a.imageId !== b.imageId) return a.imageId.localeCompare(b.imageId);
    return a.bag.id - b.bag.id;
  });

  $: specRegionsMap = getSpecRegionsMap(allBagsWithMetadata);

  function getSpecRegionsMap(bagsList: any[]) {
    const m = new Map<string, string[]>();
    for (const item of bagsList) {
      const set = item.layout.setConfig || { cols: COLS, rows: ROWS };
      const pw = set.width ? (set.width / set.cols) : 25;
      const ph = set.height ? (set.height / set.rows) : 25;
      const type = item.bag.distributorType || (item.bag.id === 0 ? "clearRect" : "shitstain");
      const code = item.bag.distributorCode || (defaultDistributors[type]?.code || "");
      const specRegs = getSpeculativeRegions(
        type,
        code,
        item.layout.width || 500,
        item.layout.height || 500,
        pw,
        ph
      );
      m.set(`${item.imageId}::${item.bag.id}`, specRegs);
    }
    return m;
  }

  $: bagTree = getBagTree(allBagsWithMetadata);

  function getBagTree(bagsList: any[]) {
    // Group by imageId to preserve local trees
    const imageGroups = new Map<string, any[]>();
    for (const item of bagsList) {
      if (!imageGroups.has(item.imageId)) imageGroups.set(item.imageId, []);
      imageGroups.get(item.imageId)!.push(item);
    }

    const flattened: { bag: any; imageId: string; imageName: string; isCurrentSet: boolean; depth: number }[] = [];

    // Sort active imageId first
    const sortedImageIds = Array.from(imageGroups.keys()).sort((a, b) => {
      if (a === currentImageId && b !== currentImageId) return -1;
      if (a !== currentImageId && b === currentImageId) return 1;
      return a.localeCompare(b);
    });

    for (const imgId of sortedImageIds) {
      const items = imageGroups.get(imgId) || [];
      const bagsMap = new Map<BagId, any>();
      for (const item of items) {
        bagsMap.set(item.bag.id, item);
      }

      const childrenMap = new Map<BagId, any[]>();
      const topLevel: any[] = [];

      for (const item of items) {
        const bag = item.bag;
        if (bag.hiddenUntil !== undefined && bagsMap.has(bag.hiddenUntil)) {
          if (!childrenMap.has(bag.hiddenUntil)) childrenMap.set(bag.hiddenUntil, []);
          childrenMap.get(bag.hiddenUntil)!.push(item);
        } else {
          topLevel.push(item);
        }
      }

      function traverse(item: any, depth: number) {
        flattened.push({
          bag: item.bag,
          imageId: item.imageId,
          imageName: item.imageName,
          isCurrentSet: item.isCurrentSet,
          depth
        });
        const children = childrenMap.get(item.bag.id) || [];
        for (const child of children) {
          traverse(child, depth + 1);
        }
      }

      for (const item of topLevel) traverse(item, 0);
    }

    return flattened;
  }

  let bagsContainer: HTMLDivElement;
  let bagsContainerParent: HTMLDivElement;
  let activeConnectionLines: { d: string; color: string; parentKey: string; childKey: string }[] = [];

  let draggingWire: {
    type: "in" | "out";
    imageId: string;
    bagId: BagId;
    regionName?: string;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null = null;

  async function drawConnectionLines() {
    await tick();
    if (!bagsContainer) return;
    const containerRect = bagsContainer.getBoundingClientRect();
    const lines: typeof activeConnectionLines = [];

    for (const item of allBagsWithMetadata) {
      const bag = item.bag;
      if (bag.connectedToRegion) {
        const parentKey = `${bag.connectedToRegion.parentImageId}::${bag.connectedToRegion.parentBagId}::${bag.connectedToRegion.regionName}`;
        const childKey = `${item.imageId}::${bag.id}`;

        const outDot = bagsContainer.querySelector(`[data-socket-out="${parentKey}"]`);
        const inDot = bagsContainer.querySelector(`[data-socket-in="${childKey}"]`);

        if (outDot && inDot) {
          const outRect = outDot.getBoundingClientRect();
          const inRect = inDot.getBoundingClientRect();

          const x1 = outRect.left + outRect.width / 2 - containerRect.left;
          const y1 = outRect.top + outRect.height / 2 - containerRect.top;
          const x2 = inRect.left + inRect.width / 2 - containerRect.left;
          const y2 = inRect.top + inRect.height / 2 - containerRect.top;

          const cp1x = x1 + Math.max(30, Math.abs(x2 - x1) * 0.4);
          const cp2x = x2 - Math.max(30, Math.abs(x2 - x1) * 0.4);
          const d = `M ${x1} ${y1} C ${cp1x} ${y1}, ${cp2x} ${y2}, ${x2} ${y2}`;

          const isCycle = cycleErrors.includes(`${item.imageId}::${bag.id}`);
          lines.push({
            d,
            color: isCycle ? "#ef4444" : "#06b6d4",
            parentKey,
            childKey
          });
        }
      }
    }
    activeConnectionLines = lines;
  }

  function handleSocketPointerDown(e: PointerEvent, type: "in" | "out", imgId: string, bId: BagId, regName?: string) {
    e.stopPropagation();
    e.preventDefault();
    if (!bagsContainer) return;

    const containerRect = bagsContainer.getBoundingClientRect();
    const dotRect = e.currentTarget.getBoundingClientRect();
    const startX = dotRect.left + dotRect.width / 2 - containerRect.left;
    const startY = dotRect.top + dotRect.height / 2 - containerRect.top;

    draggingWire = {
      type,
      imageId: imgId,
      bagId: bId,
      regionName: regName,
      startX,
      startY,
      currentX: startX,
      currentY: startY
    };

    window.addEventListener("pointermove", handleWirePointerMove);
    window.addEventListener("pointerup", handleWirePointerUp);
  }

  function handleWirePointerMove(e: PointerEvent) {
    if (!draggingWire || !bagsContainer) return;
    const containerRect = bagsContainer.getBoundingClientRect();
    draggingWire.currentX = e.clientX - containerRect.left;
    draggingWire.currentY = e.clientY - containerRect.top;
    draggingWire = { ...draggingWire };
  }

  function handleWirePointerUp(e: PointerEvent) {
    window.removeEventListener("pointermove", handleWirePointerMove);
    window.removeEventListener("pointerup", handleWirePointerUp);
    if (!draggingWire) return;

    const target = e.target as HTMLElement;
    const inputDot = target.closest("[data-socket-in]") as HTMLElement;
    const outputDot = target.closest("[data-socket-out]") as HTMLElement;

    if (draggingWire.type === "out" && inputDot) {
      const childKey = inputDot.getAttribute("data-socket-in");
      if (childKey) {
        const [childImgId, childBgIdStr] = childKey.split("::");
        const childBgId = Number(childBgIdStr);
        connectBagRegion(childImgId, childBgId, `${draggingWire.imageId}::${draggingWire.bagId}::${draggingWire.regionName}`);
      }
    } else if (draggingWire.type === "in" && outputDot) {
      const parentKey = outputDot.getAttribute("data-socket-out");
      if (parentKey) {
        connectBagRegion(draggingWire.imageId, draggingWire.bagId, parentKey);
      }
    }

    draggingWire = null;
    drawConnectionLines();
  }

  let editingDistributorId = "clearRect";

  function createNewLibraryDistributor() {
    if (!currentLayout) return;
    const id = `custom_${Date.now()}`;
    const name = `Custom Distributor ${currentLayout.customDistributors ? currentLayout.customDistributors.size + 1 : 1}`;
    const code = defaultDistributors.shitstain.code;

    layoutStore.update((m) => {
      const l = m.get(currentLayout.imageId);
      if (l) {
        if (!l.customDistributors) l.customDistributors = new Map();
        l.customDistributors.set(id, { name, code });
        m.set(l.imageId, { ...l, customDistributors: new Map(l.customDistributors) });
      }
      return new Map(m);
    });

    editingDistributorId = id;
    regenerateCurrentLayout();
  }

  function renameLibraryDistributor(id: string, name: string) {
    if (!currentLayout || !name) return;
    layoutStore.update((m) => {
      const l = m.get(currentLayout.imageId);
      if (l && l.customDistributors) {
        const dist = l.customDistributors.get(id);
        if (dist) {
          dist.name = name;
          m.set(l.imageId, { ...l, customDistributors: new Map(l.customDistributors) });
        }
      }
      return new Map(m);
    });
  }

  function deleteLibraryDistributor(id: string) {
    if (!currentLayout) return;
    layoutStore.update((m) => {
      const l = m.get(currentLayout.imageId);
      if (l && l.customDistributors) {
        l.customDistributors.delete(id);
        for (const b of l.bags.values()) {
          if (b.distributorType === id) {
            b.distributorType = "shitstain";
            b.distributorCode = defaultDistributors.shitstain.code;
          }
        }
        m.set(l.imageId, { ...l, bags: new Map(l.bags), customDistributors: new Map(l.customDistributors) });
      }
      return new Map(m);
    });
    editingDistributorId = "clearRect";
    regenerateCurrentLayout();
  }

  function getEditingDistributorCode(id: string, layout: any): string {
    if (defaultDistributors[id as keyof typeof defaultDistributors]) {
      return defaultDistributors[id as keyof typeof defaultDistributors].code;
    }
    if (layout?.customDistributors) {
      const dist = layout.customDistributors.get(id);
      return dist ? dist.code : "";
    }
    return "";
  }

  function updateEditingDistributorCode(id: string, code: string) {
    if (!currentLayout || defaultDistributors[id as keyof typeof defaultDistributors]) return;
    layoutStore.update((m) => {
      const l = m.get(currentLayout.imageId);
      if (l && l.customDistributors) {
        const dist = l.customDistributors.get(id);
        if (dist) {
          dist.code = code;
          m.set(l.imageId, { ...l, customDistributors: new Map(l.customDistributors) });
        }
      }
      return new Map(m);
    });
    regenerateCurrentLayout();
  }

  let editingDistributorCode = "";
  let lastDistId = "";
  $: {
    if (editingDistributorId !== lastDistId && currentLayout) {
      lastDistId = editingDistributorId;
      if (defaultDistributors[editingDistributorId]) {
        editingDistributorCode = defaultDistributors[editingDistributorId].code;
      } else if (currentLayout.customDistributors) {
        const dist = currentLayout.customDistributors.get(editingDistributorId);
        editingDistributorCode = dist ? dist.code : "";
      }
    }
  }

  $: {
    if (editingDistributorCode !== undefined && editingDistributorId && currentLayout && !defaultDistributors[editingDistributorId]) {
      const dist = currentLayout.customDistributors?.get(editingDistributorId);
      if (dist && dist.code !== editingDistributorCode) {
        dist.code = editingDistributorCode;
        layoutStore.update((m) => {
          const l = m.get(currentLayout.imageId);
          if (l && l.customDistributors) {
            l.customDistributors.set(editingDistributorId, { ...dist, code: editingDistributorCode });
            m.set(l.imageId, { ...l, customDistributors: new Map(l.customDistributors) });
          }
          return new Map(m);
        });
        regenerateCurrentLayout();
      }
    }
  }

  $: {
    if (allBagsWithMetadata || cycleErrors || activeTab) {
      drawConnectionLines();
    }
  }
</script>

<div class="flex flex-col md:flex-row gap-4">
  <!-- Left Side: Canvas + Tools -->
  <div class="flex-1 flex flex-col border rounded p-4 bg-slate-950 min-h-[500px]">
    <div class="flex justify-between items-center mb-4 flex-wrap gap-2">
      <div class="flex gap-2 items-center">
        <h3 class="text-sm font-semibold text-white">{t("studio.interactiveBoard", $translations)}</h3>
        {#if mediaItems.length > 1}
          <select
            bind:value={currentImageIndex}
            on:change={drawPreview}
            class="ml-2 bg-slate-800 text-xs px-2 py-1 rounded border border-slate-700 text-white">
            {#each mediaItems as m, i}
              <option value={i}>Image {i + 1}</option>
            {/each}
          </select>
        {/if}
      </div>
      <div class="flex gap-2">
        <Button variant={mode === "view" ? "default" : "outline"} size="sm" on:click={() => (mode = "view")}>{t("studio.view", $translations)}</Button>
        {#if $roomSettings.voronoi && activeTab !== "bags"}
          <Button variant={mode === "voronoi-spray" ? "default" : "outline"} size="sm" on:click={() => { mode = "voronoi-spray"; customSites = [...cachedVoronoiSites]; }}>{t("studio.spraySites", $translations)}</Button>
        {/if}
        {#if activeTab === "bags"}
          <Button variant={mode === "path-split" ? "default" : "outline"} size="sm" on:click={() => (mode = "path-split")}>{t("studio.pathSplit", $translations)}</Button>
        {/if}
      </div>
    </div>

    <div class="flex-1 flex items-center justify-center relative">
      <canvas
        bind:this={canvas}
        on:pointerdown={handlePointerDown}
        on:pointermove={handlePointerMove}
        on:pointerup={handlePointerUp}
        on:wheel|nonpassive={handleWheel}
        on:pointerenter={() => { isMouseOverCanvas = true; drawPreview(); }}
        on:pointerleave={() => { isMouseOverCanvas = false; drawPreview(); }}
        on:contextmenu|preventDefault></canvas>
      {#if mode === "voronoi-spray"}
        <div class="absolute top-2 left-2 bg-black/50 p-2 text-xs rounded pointer-events-none text-white">
          Left Click: Spray | Right Click: Erase | Scroll: Brush Size ({brushSize})
        </div>
      {/if}
    </div>

    <div class="mt-4 flex gap-4 items-center">
      <Button size="sm" variant="secondary" on:click={separateEdges} disabled={$roomSettings.voronoi}>{t("studio.separateEdges", $translations)}</Button>
      <label class="flex items-center gap-1.5 cursor-pointer text-xs text-slate-300 select-none">
        <input 
          type="checkbox" 
          bind:checked={$roomSettings.edges} 
          class="rounded border-slate-800 bg-slate-950 text-cyan-600 focus:ring-cyan-500 focus:ring-offset-slate-950 w-4 h-4 cursor-pointer" />
        {t("studio.autoApply", $translations)}
      </label>
    </div>
    {#if !$roomSettings.voronoi && activeTab === "bags"}
      <div class="mt-2 flex gap-2 items-center text-white">
        <span class="text-xs text-slate-400">{t("studio.gridSplit", $translations)}</span>
        <input
          type="number"
          bind:value={gridSplitX}
          min={1}
          max={10}
          class="w-12 bg-slate-800 text-xs text-center border-slate-700 border text-white rounded px-1" />
        <span class="text-xs text-slate-400">x</span>
        <input
          type="number"
          bind:value={gridSplitY}
          min={1}
          max={10}
          class="w-12 bg-slate-800 text-xs text-center border-slate-700 border text-white rounded px-1" />
        <Button size="sm" variant="secondary" on:click={splitGridExplicitly}>{t("studio.applyAutoSplit", $translations)}</Button>
      </div>
    {/if}
  </div>

  <!-- Right Side: Bags / Distributors / Settings -->
  <div class="w-full md:w-[380px] flex flex-col border rounded bg-slate-100 dark:bg-slate-900 overflow-hidden min-h-[500px]">
    <Tabs.Root bind:value={activeTab} class="flex flex-col h-full w-full relative">
      <Tabs.List class="grid grid-cols-3 mx-2 my-2">
        <Tabs.Trigger value="settings">{t("studio.tabShape", $translations)}</Tabs.Trigger>
        <Tabs.Trigger value="bags">{t("studio.tabBags", $translations)}</Tabs.Trigger>
        <Tabs.Trigger value="distributors">{t("studio.tabDist", $translations)}</Tabs.Trigger>
      </Tabs.List>

      <div class="flex-1 overflow-y-auto px-4 pb-4">
        <Tabs.Content value="settings" class="mt-0">
          <div class="flex flex-col gap-4">
            <div class="space-y-3">
              <Label>Number of Pieces ({$roomSettings.pieces})</Label>
              <Slider min={4} max={10000} step={1} value={[$roomSettings.pieces]} onValueChange={(v) => ($roomSettings.pieces = v[0])} {disabled} />
            </div>

            <Checkbox id="zigzag" bind:checked={$roomSettings.zigzag} label={t("studio.zigzag", $translations)} disabled={disabled || $roomSettings.voronoi} />
            <Checkbox id="fakeedge" bind:checked={$roomSettings.fakeEdge} disabled={disabled || $roomSettings.voronoi} label={t("studio.fakeEdge", $translations)} />
            <Checkbox id="noedge" bind:checked={$roomSettings.noEdge} disabled={disabled || $roomSettings.voronoi} label={t("studio.noEdge", $translations)} />

            <Checkbox id="voronoi" bind:checked={$roomSettings.voronoi} label={t("studio.voronoiShapes", $translations)} {disabled} />

            <div class="space-y-3">
              <Label>{t("studio.jitter", $translations)}</Label>
              <Slider min={0} max={0.25} step={0.01} value={[$roomSettings.jitter]} onValueChange={(v) => ($roomSettings.jitter = v[0])} {disabled} />

              {#if !$roomSettings.voronoi}
                <Label>{t("studio.cornerWobble", $translations)}</Label>
                <Slider
                  min={0}
                  max={0.5}
                  step={0.001}
                  value={[$roomSettings.cornerJitter]}
                  onValueChange={(v) => ($roomSettings.cornerJitter = v[0])}
                  disabled={disabled || $roomSettings.voronoi} />
              {/if}

              <Label>{t("studio.tabSize", $translations)}</Label>
              <Slider
                min={0.0}
                max={0.2}
                step={0.01}
                value={[$roomSettings.tabSize]}
                onValueChange={(v) => ($roomSettings.tabSize = v[0])}
                {disabled} />

              <Button size="sm" variant="outline" class="w-full mt-2" on:click={resetShapeSettings}>{t("studio.resetDefaults", $translations)}</Button>
            </div>

            {#if $roomSettings.voronoi}
              <div class="space-y-2 mt-4">
                <Label>{t("studio.voronoiGenerator", $translations)}</Label>
                <select
                  bind:value={$roomSettings.voronoiPreset}
                  class="w-full bg-slate-900 text-white border border-slate-700 rounded h-8 text-sm px-2"
                  {disabled}
                  on:change={handlePresetChange}>
                  {#each Object.entries(defaultVoronoiSites) as [key, { name }]}
                    <option value={key}>{name}</option>
                  {/each}
                  <option value="custom">{t("studio.customCode", $translations)}</option>
                </select>
                <div class="mt-2">
                  <Label class="text-xs text-muted-foreground">{t("studio.generatorScript", $translations)}</Label>
                  <CodeEditor bind:code={$roomSettings.voronoiCode} {disabled} />
                </div>
              </div>
            {/if}
          </div>
        </Tabs.Content>

        <Tabs.Content value="bags" class="mt-0 space-y-2 relative" bind:this={bagsContainerParent} on:scroll={drawConnectionLines}>
          <div class="relative w-full h-full" bind:this={bagsContainer}>
            <svg class="absolute inset-0 pointer-events-none w-full h-full z-20">
              {#each activeConnectionLines as line}
                <path d={line.d} stroke={line.color} stroke-width="2.5" fill="none" />
              {/each}
              {#if draggingWire}
                <path 
                  d="M {draggingWire.startX} {draggingWire.startY} C {draggingWire.startX + (draggingWire.type === 'out' ? 50 : -50)} {draggingWire.startY}, {draggingWire.currentX + (draggingWire.type === 'in' ? 50 : -50)} {draggingWire.currentY}, {draggingWire.currentX} {draggingWire.currentY}" 
                  stroke="#38bdf8" 
                  stroke-width="2" 
                  stroke-dasharray="4" 
                  fill="none" 
                  class="animate-[dash_1s_linear_infinite]" />
              {/if}
            </svg>

            <Label>{t("studio.bagsConfig", $translations)}</Label>
            {#if allBagsWithMetadata.length > 0}
              {#each bagTree as { bag, imageId, imageName, isCurrentSet, depth } (imageId + "::" + bag.id)}
                <div class="relative transition-all" style="padding-left: {depth * 2}rem;">
                  {#if depth > 0}
                    <div
                      class="absolute left-0 top-0 bottom-0 border-l-2 border-slate-700 pointer-events-none"
                      style="margin-left: {(depth - 1) * 2 + 1}rem;">
                    </div>
                    <div
                      class="absolute left-0 top-1/2 w-4 border-t-2 border-slate-700 pointer-events-none"
                      style="margin-left: {(depth - 1) * 2 + 1}rem;">
                    </div>
                  {/if}

                  <!-- svelte-ignore a11y-click-events-have-key-events -->
                  <!-- svelte-ignore a11y-no-static-element-interactions -->
                  <div
                    class="p-2 border rounded text-sm transition-all cursor-pointer {selectedBagId === bag.id && selectedBagImageId === imageId
                      ? 'bg-slate-800 border-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.3)] z-10'
                      : 'bg-slate-900 hover:border-slate-700 border-slate-800'} relative z-10"
                    on:click={() => { selectedBagId = bag.id; selectedBagImageId = imageId; }}
                    draggable="true"
                    role="listitem"
                    on:dragstart={(e) => handleBagDragStart(e, imageId, bag.id)}
                    on:dragend={handleBagDragEnd}
                    on:dragover|preventDefault={(e) => handleBagDragOver(e, imageId, bag.id)}
                    on:dragleave={(e) => handleBagDragLeave(e, imageId, bag.id)}
                    on:drop|preventDefault={(e) => handleBagDrop(e, imageId, bag.id)}>
                    
                    <div class="flex justify-between items-center mb-1">
                      <div class="flex items-center gap-2">
                        <div class="w-3 h-3 rounded-full shadow" style="background-color: {bag.color}"></div>
                        <span class="font-medium text-slate-200">{bag.name}</span>
                        {#if !isCurrentSet}
                          <span class="text-slate-500 text-xxs bg-slate-850 px-1 py-0.5 rounded">{imageName}</span>
                        {/if}
                      </div>
                      <div class="flex items-center gap-2">
                        <span class="text-slate-400 font-mono text-xs">{bag.pieces ? bag.pieces.size : 0} PCs</span>
                        {#if bag.id !== 0}
                          <Button
                            variant="ghost"
                            size="sm"
                            class="h-5 w-5 p-0 text-red-500 hover:text-red-400 hover:bg-slate-700/50"
                            on:click={(e) => { e.stopPropagation(); deleteBag(imageId, bag.id); }}>✕</Button>
                        {/if}
                      </div>
                    </div>

                    <div class="flex justify-between items-center gap-2 mt-2">
                      <div class="flex flex-col gap-1">
                        <Checkbox id="bag-pre-{imageId}-{bag.id}" bind:checked={bag.presolved} label={t("studio.presolved", $translations)} />
                        <div class="flex items-center gap-1 text-slate-400 text-xxs">
                          <span>{t("studio.distributor", $translations)}</span>
                          <select
                            value={bag.distributorType || (bag.id === 0 ? "clearRect" : "shitstain")}
                            on:change|stopPropagation={(e) => changeBagDistributorType(imageId, bag.id, e.currentTarget.value)}
                            class="bg-slate-950 border border-slate-800 text-slate-350 text-xxs rounded px-1 py-0.5 max-w-[120px]">
                            <optgroup label={t("studio.presets", $translations)}>
                              {#each Object.entries(defaultDistributors) as [key, { name }]}
                                <option value={key}>{name}</option>
                              {/each}
                            </optgroup>
                            {#if currentLayout?.customDistributors && currentLayout.customDistributors.size > 0}
                              <optgroup label={t("studio.library", $translations)}>
                                {#each Array.from(currentLayout.customDistributors.entries()) as [id, dist]}
                                  <option value={id}>{dist.name}</option>
                                {/each}
                              </optgroup>
                            {/if}
                            <option value="custom">{t("studio.customInline", $translations)}</option>
                          </select>
                        </div>
                      </div>
                      
                      <!-- Output Sockets -->
                      <div class="flex flex-col gap-1 items-end">
                        {#each specRegionsMap.get(`${imageId}::${bag.id}`) || [] as rName}
                          <div class="flex items-center gap-1 text-right">
                            <span class="text-emerald-400 font-mono text-xxs">{rName}</span>
                            <div 
                              class="w-2.5 h-2.5 rounded-full bg-emerald-500 border border-emerald-400 shadow-[0_0_5px_rgba(16,185,129,0.5)] cursor-crosshair hover:scale-125 transition-transform"
                              data-socket-out="{imageId}::{bag.id}::{rName}"
                              draggable="false"
                              on:pointerdown={(e) => handleSocketPointerDown(e, 'out', imageId, bag.id, rName)}>
                            </div>
                          </div>
                        {/each}
                      </div>
                    </div>

                    <!-- Input Connections -->
                    <div class="mt-2 pt-2 border-t border-slate-800 flex justify-between items-center flex-wrap gap-1">
                      <div class="flex items-center gap-1 text-xs text-slate-400">
                        <div 
                          class="w-2.5 h-2.5 rounded-full border border-slate-500 cursor-crosshair hover:scale-125 transition-transform {bag.connectedToRegion ? 'bg-cyan-500 border-cyan-400 shadow-[0_0_5px_rgba(6,182,212,0.5)]' : 'bg-slate-950'} {cycleErrors.includes(imageId + '::' + bag.id) ? 'bg-red-500 border-red-400 shadow-[0_0_5px_rgba(239,68,68,0.5)]' : ''}"
                          data-socket-in="{imageId}::{bag.id}"
                          draggable="false"
                          on:pointerdown={(e) => handleSocketPointerDown(e, 'in', imageId, bag.id)}>
                        </div>
                        <span class="mr-1">{t("studio.placedInside", $translations)}</span>
                        {#if bag.connectedToRegion}
                          <span class="text-cyan-400 font-medium text-xxs">
                            {getBagName(bag.connectedToRegion.parentImageId, bag.connectedToRegion.parentBagId)} &rarr; {bag.connectedToRegion.regionName}
                          </span>
                          <button class="text-red-400 hover:text-red-300 ml-1 text-xs font-semibold" on:click|stopPropagation={() => disconnectBagRegion(imageId, bag.id)}>✕</button>
                        {:else}
                          <select 
                            value="" 
                            on:change|stopPropagation={(e) => connectBagRegion(imageId, bag.id, e.currentTarget.value)}
                            class="bg-slate-950 border border-slate-800 text-slate-300 text-xxs rounded px-1 py-0.5 max-w-[150px]">
                            <option value="">{t("studio.roomBounds", $translations)}</option>
                            {#each getAvailableRegions(imageId, bag.id) as opt}
                              <option value={opt.value}>{opt.label}</option>
                            {/each}
                          </select>
                        {/if}
                      </div>
                    </div>

                    {#if cycleErrors.includes(imageId + '::' + bag.id)}
                      <div class="text-red-500 text-xxs font-semibold flex items-center gap-1 mt-1">
                        <svg class="w-3 h-3 text-red-500" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
                        {t("studio.cycle", $translations)}
                      </div>
                    {/if}

                    {#if depth === 0 && bag.hiddenUntil === undefined}
                      <div class="mt-2 text-xxs text-slate-650 italic select-none pointer-events-none">
                        {t("studio.dragNest", $translations)}
                      </div>
                    {/if}

                    {#if bag.hiddenUntil !== undefined && activeBagLayout?.bags.has(bag.hiddenUntil)}
                      <div class="mt-2 flex items-center justify-between pointer-events-none border-t border-slate-800 pt-2 text-slate-400">
                        <div class="text-xs flex items-center gap-1.5">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            class="lucide lucide-lock"
                            ><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                          Child of {activeBagLayout.bags.get(bag.hiddenUntil)?.name}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          class="h-5 w-5 p-0 pointer-events-auto hover:bg-slate-800/50 hover:text-red-400 transition-colors"
                          on:click={() => clearBagHiddenUntil(imageId, bag.id)}>✕</Button>
                      </div>
                    {/if}
                  </div>
                </div>
              {/each}
            {:else}
              <div class="text-sm text-slate-400">{t("studio.loadingLayout", $translations)}</div>
            {/if}
          </div>
        </Tabs.Content>

        <Tabs.Content value="distributors" class="mt-0 space-y-4">
          <Label class="text-white">{t("studio.distLibrary", $translations)}</Label>

          <Checkbox
            id="mixsets"
            bind:checked={$roomSettings.mixsets}
            label={t("studio.mixEverySet", $translations)}
            description={t("studio.mixEverySetDesc", $translations)} />

          <div class="space-y-2 mt-4">
            <Label class="text-xs text-slate-400">{t("studio.selectDist", $translations)}</Label>
            <div class="flex gap-2">
              <select
                bind:value={editingDistributorId}
                class="flex-1 bg-slate-950 border text-white border-slate-800 rounded h-8 text-sm px-2 animate-none">
                <optgroup label={t("studio.presetsRO", $translations)}>
                  {#each Object.entries(defaultDistributors) as [key, { name }]}
                    <option value={key}>{name}</option>
                  {/each}
                </optgroup>
                {#if currentLayout?.customDistributors && currentLayout.customDistributors.size > 0}
                  <optgroup label={t("studio.libraryCustom", $translations)}>
                    {#each Array.from(currentLayout.customDistributors.entries()) as [id, dist]}
                      <option value={id}>{dist.name}</option>
                    {/each}
                  </optgroup>
                {/if}
              </select>
              <Button size="sm" variant="outline" on:click={createNewLibraryDistributor}>{t("studio.newDist", $translations)}</Button>
            </div>
          </div>

          {#if !defaultDistributors[editingDistributorId] && currentLayout?.customDistributors}
            {#each [currentLayout.customDistributors.get(editingDistributorId)] as dist}
              {#if dist}
                <div class="flex gap-2 items-center">
                  <input
                    type="text"
                    value={dist.name}
                    on:input={(e) => renameLibraryDistributor(editingDistributorId, e.currentTarget.value)}
                    class="bg-slate-950 border border-slate-800 text-white text-xs rounded px-2 py-1 flex-1 h-8"
                    placeholder={t("studio.distName", $translations)} />
                  <Button size="sm" variant="ghost" class="text-red-500 hover:text-red-400" on:click={() => deleteLibraryDistributor(editingDistributorId)}>{t("common.delete", $translations)}</Button>
                </div>
              {/if}
            {/each}
          {:else}
            <div class="p-2 bg-slate-950/40 rounded border border-slate-800 text-xxs text-amber-400 italic">
              {t("studio.readOnlyNote", $translations)}
            </div>
          {/if}

          <div class="mt-4">
            <Label class="text-xs text-slate-400">{t("studio.scriptEditor", $translations)}</Label>
            <CodeEditor 
              bind:code={editingDistributorCode} 
              disabled={!!defaultDistributors[editingDistributorId]} />
          </div>
        </Tabs.Content>
      </div>
    </Tabs.Root>
  </div>
</div>

<style>
  @keyframes dash {
    to {
      stroke-dashoffset: -20;
    }
  }
</style>
