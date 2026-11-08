<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import { onMount, tick } from "svelte";
  import { Random } from "../../utils";
  import { generatePieceShape, drawJigShapePath } from "../../room/render";
  import { tesselateSurface } from "./voronoi";
  import roomSettings from "./roomSettingsStore";
  import { Label } from "$lib/components/ui/label";
  import Checkbox from "./Checkbox.svelte";
  import { Slider } from "$lib/components/ui/slider";
  import { aids } from "../../utils";
  import { generateNubCoefficients } from "../../jig";
  import { arbitraryDrawNubPath } from "$room/jig-generation";
  import CodeEditor from "./CodeEditor.svelte";
  import { defaultVoronoiSites } from "./distributorsPresets";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";

  export let disabled = false;

  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D | null;
  const COLS = 5;
  const ROWS = 5;

  $: {
    // Reactive dependencies on relevant settings
    const { square, voronoi, jitter, cornerJitter, tabSize, fakeEdge, zigzag, noEdge } = $roomSettings; // trigger redraw
    if (canvas) {
      drawPreview();
    }
  }

  function drawPreview() {
    if (!canvas) return;
    ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    // Support HiDPI displays completely resolving blurring
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = 350;
    const cssHeight = 350;

    canvas.width = cssWidth * dpr;
    canvas.height = cssHeight * dpr;
    canvas.style.width = cssWidth + "px";
    canvas.style.height = cssHeight + "px";

    ctx.scale(dpr, dpr);

    const cw = cssWidth;
    const ch = cssHeight;
    ctx.clearRect(0, 0, cw, ch);

    const set = { cols: COLS, rows: ROWS } as any;
    const marginX = 1;
    const marginY = 1;
    const pieceWidth = (cw - marginX * 2) / COLS;
    const pieceHeight = (ch - marginY * 2) / ROWS;

    const random = new Random(1337);

    if ($roomSettings.voronoi) {
      const targetCount = COLS * ROWS;
      const tessellation = tesselateSurface(cw - marginX * 2, ch - marginY * 2, targetCount, 42);
      const tabSize = $roomSettings.tabSize;
      const jitter = $roomSettings.jitter;

      const pieces = new Map<number, any>();

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
            if (pieces.has(seg.neighborIndex)) {
              const nshape = pieces.get(seg.neighborIndex);
              const ncell = tessellation[seg.neighborIndex];
              const nsegidx = ncell.segments.findIndex((s) => s.neighborIndex === j);
              const curve = nshape.curves[nsegidx];
              p.curves.push(curve ? { ...curve, flip: !curve.flip } : undefined);
            } else {
              p.curves.push(generateNubCoefficients(random, jitter));
            }
          }
        }
        pieces.set(j, p);
      }

      ctx.save();
      ctx.translate(marginX, marginY);
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.lineWidth = 1.5;

      for (const [j, piece] of pieces.entries()) {
        if (piece.geometry.length === 0) continue;
        ctx.save();
        ctx.translate(piece.site[0], piece.site[1]);
        ctx.beginPath();

        let isFirst = true;
        let prevPoint: any = null;
        let i = 0;
        for (const line of piece.geometry) {
          if (isFirst) {
            ctx.moveTo(line[0], line[1]);
            prevPoint = line;
            isFirst = false;
          } else {
            const curve = piece.curves[i % piece.curves.length];
            if (!curve) {
              ctx.lineTo(line[0], line[1]);
            } else {
              // @ts-ignore - duck typing path interface
              arbitraryDrawNubPath(ctx, prevPoint, line, curve, tabSize);
            }
            i++;
            prevPoint = line;
          }
        }
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
      return;
    }

    if ($roomSettings.square) {
      ctx.save();
      ctx.translate(marginX, marginY);
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
          ctx.rect(col * pieceWidth, row * pieceHeight, pieceWidth, pieceHeight);
        }
      }
      ctx.stroke();
      ctx.restore();
      return;
    }

    const previousPieces: any[] = [];

    // reset global piece properties used down by render
    ctx.save();
    ctx.translate(marginX, marginY);
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
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
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function resetToDefault() {
    $roomSettings.tabSize = 0.1;
    $roomSettings.jitter = 0.15;
    $roomSettings.cornerJitter = 0.1;
  }

  onMount(() => {
    drawPreview();
  });
</script>

<Dialog.Root>
  <Dialog.Trigger let:builder asChild>
    <Button builders={[builder]} variant="outline" class="w-full justify-center">{t("studio.shapeSettings", $translations)}</Button>
  </Dialog.Trigger>
  <Dialog.Content class="sm:max-w-[768px]">
    <Dialog.Header>
      <Dialog.Title>{t("studio.shapeSettings", $translations)}</Dialog.Title>
      <Dialog.Description>{t("studio.shapeDescription", $translations)}</Dialog.Description>
    </Dialog.Header>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 overflow-y-auto max-h-[75vh] px-1 pb-1">
      <div class="rounded-lg p-3 border shadow-sm mx-auto h-fit">
        <canvas bind:this={canvas} class="block max-w-full h-auto"></canvas>
      </div>

      <div class="flex flex-col gap-y-6">
        <div class="flex flex-col gap-4">
          <Checkbox id="edges" bind:checked={$roomSettings.edges} label={t("studio.edges", $translations)} {disabled} />
          <Checkbox id="mixsets" bind:checked={$roomSettings.mixsets} label={t("studio.mixSets", $translations)} {disabled} />
          <Checkbox
            id="zigzag"
            bind:checked={$roomSettings.zigzag}
            label={t("studio.zigzag", $translations)}
            disabled={disabled || $roomSettings.voronoi}
            description={t("studio.zigzagDesc", $translations)} />
          <Checkbox id="fakeedge" bind:checked={$roomSettings.fakeEdge} disabled={disabled || $roomSettings.voronoi} label={t("studio.fakeEdge", $translations)} />
          <Checkbox id="noedge" bind:checked={$roomSettings.noEdge} disabled={disabled || $roomSettings.voronoi} label={t("studio.noEdge", $translations)} />
        </div>

        <div class="space-y-4">
          <div id="voronoi" use:aids>
            <Checkbox
              id="voronoi"
              bind:checked={$roomSettings.voronoi}
              label={t("studio.voronoi", $translations)}
              {disabled}
              description={t("studio.voronoiDesc", $translations)} />
          </div>

          <div class="px-2 space-y-6 py-2">
            <div class="space-y-3">
              <div class="flex justify-between">
                <Label for="jitter">Jitter (Shape irregularity) - {$roomSettings.jitter.toFixed(2)}</Label>
              </div>
              <Slider
                id="jitter"
                min={0}
                max={0.25}
                step={0.01}
                value={[$roomSettings.jitter]}
                onValueChange={(v) => ($roomSettings.jitter = v[0])}
                {disabled} />
            </div>

            <!-- Temporary demonstration of preset codes inside PieceShapePreview directly -->
             {$roomSettings.voronoi}
             {$roomSettings.voronoiPreset}
            {#if $roomSettings.voronoi}
              <div class="space-y-3 mt-4">
                <div class="flex justify-between relative z-50">
                  <Label for="voronoigenerator">{t("studio.voronoiScript", $translations)}</Label>
                </div>
                <div class="text-xs text-muted-foreground pb-2 relative z-50">
                  <select bind:value={$roomSettings.voronoiPreset} class="w-full bg-slate-900 border border-slate-700 rounded mb-2 h-7" {disabled}>
                    {#each Object.entries(defaultVoronoiSites) as [key, { name }]}
                      <option value={key}>{name}</option>
                    {/each}
                    <option value="custom">{t("studio.customSpray", $translations)}</option>
                  </select>
                  {#if $roomSettings.voronoiPreset === "custom"}
                    <span class="text-xs text-yellow-500 block mb-2"
                      >{t("studio.editCustom", $translations)}</span>
                  {/if}
                  <CodeEditor bind:code={$roomSettings.voronoiCode} {disabled} />
                </div>
              </div>
            {/if}

            <div class="space-y-3 mt-4">
              <div class="flex justify-between">
                <Label for="cornerjitter">Corner Wobble - {$roomSettings.cornerJitter.toFixed(2)}</Label>
                {#if $roomSettings.voronoi}
                  <span class="text-xs text-muted-foreground">{t("studio.disabledByVoronoi", $translations)}</span>
                {/if}
              </div>
              <Slider
                id="cornerjitter"
                min={0}
                max={0.5}
                step={0.001}
                value={[$roomSettings.cornerJitter]}
                onValueChange={(v) => ($roomSettings.cornerJitter = v[0])}
                disabled={disabled || $roomSettings.voronoi} />
            </div>

            <div class="space-y-3">
              <div class="flex justify-between">
                <Label for="tabsize">Tab Size (Nub size) - {$roomSettings.tabSize.toFixed(2)}</Label>
              </div>
              <Slider
                id="tabsize"
                min={0.0}
                max={0.2}
                step={0.01}
                value={[$roomSettings.tabSize]}
                onValueChange={(v) => ($roomSettings.tabSize = v[0])}
                {disabled} />
            </div>

            <Button variant="secondary" size="sm" class="w-full mt-2" on:click={resetToDefault} {disabled}>{t("studio.resetDefault", $translations)}</Button>
          </div>
        </div>
      </div>
    </div>
  </Dialog.Content>
</Dialog.Root>
