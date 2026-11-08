<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import MediaSelectorElement from "./MediaSelectorElement.svelte";
  import type { MediaItem, PSet, PSetGenerated } from "./types";
  import { generateSets } from "./utils";
  import paper from "paper";
  import Fa from "svelte-fa";
  import { faEraser } from "@fortawesome/free-solid-svg-icons/faEraser";
  import { fade } from "svelte/transition";
  import Checkbox from "./Checkbox.svelte";
  import Button from "$lib/components/ui/button/button.svelte";

  export let value: string = "";
  export let mediaItems: MediaItem[] = [];
  export let pieces: number = 0;

  let isEnabled = false;
  let piecesToHide: number[] = [];

  $: canEnable = mediaItems.length === 1;

  $: if (mediaItems.length || !isEnabled) {
    clearPath();
  }

  $: updateValue(piecesToHide);

  $: if (canvas) loadCensorImage();

  function updateValue(piecesToHide: number[]) {
    value = piecesToHide.length ? JSON.stringify(piecesToHide) : "";
  }

  function loadCensorImage() {
    if (!canvas) {
      return;
    }

    const dims = mediaItems.map((e) => [e.width, e.height]) as [number, number][];
    if (dims.length == 0 || dims[0].length != 2) {
      return;
    }
    if (dims.length != 1) {
      return;
    }

    localsetclone = generateSets(pieces, dims.length, dims);

    const { width, height } = localsetclone[0];
    canvas.width = width;
    canvas.height = height;

    hitcanvas.width = width;
    hitcanvas.height = height;
    ctx2 = hitcanvas.getContext("2d")!;

    paper.setup(canvas);

    paper.view.onMouseDown = function (event: paper.MouseEvent) {
      startPath(getCursorPoint(event));
    };

    paper.view.onMouseDrag = function (event: paper.MouseEvent) {
      continuePath(getCursorPoint(event));
    };

    paper.view.onMouseUp = endPath;
    paper.view.viewSize = new paper.Size(localsetclone[0].width, localsetclone[0].height);
  }

  let canvas: HTMLCanvasElement;
  let hitcanvas: HTMLCanvasElement;
  let ctx2: CanvasRenderingContext2D;
  let localsetclone: PSetGenerated[];

  let to: ReturnType<typeof setTimeout> | undefined;

  // Function to handle mouse down and touch start events
  function startPath(point: paper.Point) {
    if (isDrawing) return;
    isDrawing = true;
    path = new paper.Path();
    path.strokeColor = new paper.Color("black");
    const rect = canvas.getBoundingClientRect();
    const scaleX = paper.view.size.width / rect.width;
    const scaleY = paper.view.size.height / rect.height;

    path.strokeWidth = Math.max(scaleX, scaleY) * 3;
    path.fillColor = new paper.Color("#80808080");
    path.add(point);
  }

  let dirty = true;

  export function gotDirty() {
    if (localsetclone?.length != 1) return;
    const dims = mediaItems.map((e) => [e.width, e.height]) as [number, number][];
    if (dims.length == 0 || dims[0].length != 2) {
      return;
    }
    if (dims.length != 1) {
      return;
    }

    localsetclone = generateSets(pieces, dims.length, dims);
    const { rows, cols, pieceHeight, pieceWidth } = localsetclone[0] as PSet;
    dirty = true;
    renderCensored();
  }

  function renderCensored() {
    if (dirty) {
      let maxpiecewidth = 0,
        maxpieceheight = 0;
      let maskX = 0,
        maskY = 0,
        s = 0,
        l = 0;
      // todo, do it only once when changing piece count/image
      for (let c = 0; c < localsetclone.length; c++) {
        let localset = localsetclone[c] as PSet,
          v = Math.round(localset.width / localset.cols),
          g = Math.round(localset.height / localset.rows),
          p = Math.round(0.4 * Math.min(v, g)),
          m = g + 2 * p,
          x = (v + 2 * p) * localset.cols,
          w = m * localset.rows;
        maxpiecewidth = Math.max(maxpiecewidth, v);
        maxpieceheight = Math.max(maxpieceheight, g);

        //if (maskX + x > 8192 && (maskX = 0, (maskY = l) + w > 8192)) throw new Error("Exceeded texture size limit");
        localset.maskX = maskX;
        localset.maskY = maskY;
        localset.pieceWidth = v;
        localset.pieceHeight = g;
        l = Math.max(l, maskY + w);
        s = Math.max(s, maskX + x);
        maskX += x;
      }
      dirty = false;
    }

    const { rows, cols, pieceHeight, pieceWidth } = localsetclone[0] as PSet;
    ctx2.fillStyle = "#80000080";
    ctx2.clearRect(0, 0, hitcanvas.width, hitcanvas.height);
    for (let y = 0; y < rows; ++y) {
      for (let x = 0; x < cols; ++x) {
        const pbounds = [
          [x * pieceWidth + pieceWidth / 2, y * pieceHeight + pieceHeight / 2], // middle point
        ].map((e) => new paper.Point(e[0], e[1]));
        if (pbounds.some((p) => paper.project.hitTest(p))) {
          ctx2.fillRect(x * pieceWidth, y * pieceHeight, pieceWidth, pieceHeight);
          continue;
        }
      }
    }
    to = undefined;
  }

  // Function to handle mouse drag and touch move events
  function continuePath(point: paper.Point) {
    if (to === undefined) {
      clearTimeout(to);
      to = setTimeout(renderCensored, 50);
    }
    if (!isDrawing) return;
    path!.add(point);
  }

  // Function to handle mouse up and touch end events

  function endPath() {
    isDrawing = false;
    closePath();
    svg = paper.project.exportSVG({ asString: true }) as string;
    applyHidePieces();
  }

  function getCursorPoint(event: paper.MouseEvent) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = paper.view.size.width / rect.width;
    const scaleY = paper.view.size.height / rect.height;
    const pointX = event.point.x * scaleX;
    const pointY = event.point.y * scaleY;
    return new paper.Point(pointX, pointY);
  }

  let path: paper.Path | null;
  let svg: string;
  let isDrawing = false;

  function onClearClick(event: MouseEvent) {
    event.preventDefault();
    clearPath();
  }

  function clearPath() {
    if (hitcanvas) {
      paper.project?.clear();
      ctx2?.clearRect(0, 0, hitcanvas.width, hitcanvas.height);
    }
    piecesToHide = [];
    dirty = true;
  }

  // Function to start a new path when the "close path" button is clicked
  function closePath() {
    if (path) {
      path.closed = true;
    }
    path = null;
    isDrawing = false;
  }

  function applyHidePieces() {
    let cids: number[] = [];
    const dims = mediaItems.map((e) => [e.width, e.height]) as [number, number][];
    const n = pieces;
    localsetclone = generateSets(n, dims.length, dims);
    let maxpiecewidth = 0,
      maxpieceheight = 0;
    let maskX = 0,
      maskY = 0,
      s = 0,
      l = 0;

    for (let c = 0; c < localsetclone.length; c++) {
      let localset = localsetclone[c] as PSet,
        v = Math.round(localset.width / localset.cols),
        g = Math.round(localset.height / localset.rows),
        p = Math.round(0.4 * Math.min(v, g)),
        m = g + 2 * p,
        x = (v + 2 * p) * localset.cols,
        w = m * localset.rows;
      maxpiecewidth = Math.max(maxpiecewidth, v);
      maxpieceheight = Math.max(maxpieceheight, g);

      //if (maskX + x > 8192 && (maskX = 0, (maskY = l) + w > 8192)) throw new Error("Exceeded texture size limit");
      localset.maskX = maskX;
      localset.maskY = maskY;
      localset.pieceWidth = v;
      localset.pieceHeight = g;
      l = Math.max(l, maskY + w);
      s = Math.max(s, maskX + x);
      maskX += x;
    }

    const { rows, cols, pieceHeight, pieceWidth } = localsetclone[0] as PSet;

    for (let y = 0; y < rows; ++y) {
      for (let x = 0; x < cols; ++x) {
        const pbounds = [
          [x * pieceWidth + pieceWidth / 2, y * pieceHeight + pieceHeight / 2], // middle point
        ].map((e) => new paper.Point(e[0], e[1]));
        if (pbounds.some((p) => paper.project.hitTest(p))) {
          cids.push(y * cols + x);
          continue;
        }
      }
    }

    piecesToHide = cids;
  }

  $: label = piecesToHide.length ? t("createRoom.censorEnableCount", $translations).replace("{count}", String(piecesToHide.length)) : t("createRoom.censorEnable", $translations);

  // mark width and height as important to override the styles from paperjs
  const canvasClasses = "absolute top-0 z-1 !w-full !h-[unset]";
</script>

<Checkbox
  id="censor"
  disabled={!canEnable}
  title={t("createRoom.censorOnlySingle", $translations)}
  bind:checked={isEnabled}
  {label}
  description={t("createRoom.censorDescription", $translations)} />

{#if isEnabled && mediaItems.length}
  <div class="relative cursor-crosshair">
    <canvas class={canvasClasses} bind:this={hitcanvas} />
    <canvas class={canvasClasses} bind:this={canvas} />
    {#if piecesToHide.length}
      <div transition:fade={{ duration: 150 }} class="absolute top-0 right-0 m-2">
        <Button title={t("createRoom.clear", $translations)} type="button" size="icon" class="rounded-full transition-opacity opacity-50 hover:opacity-100" variant="destructive" on:click={clearPath}>
          <Fa icon={faEraser} />
        </Button>
      </div>
    {/if}
    <MediaSelectorElement item={mediaItems[0].item} />
  </div>
{/if}
