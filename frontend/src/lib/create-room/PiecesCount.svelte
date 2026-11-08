<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import { createEventDispatcher } from "svelte";
  import type { PSet } from "../../backend/types";
  import type { MediaItem, PiecesEstimation } from "./types";
  import { generateSets } from "./utils";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import Button from "$lib/components/ui/button/button.svelte";
  import Checkbox from "./Checkbox.svelte";

  export let pieces: number;
  export let mediaItems: MediaItem[] = [];

  export let voronoi = false;

  $: maxPieces = 10000;
  const MIN_PIECES = 2;
  const OPTIONS = [50, 250, 450, 750, 1000];

  let value: number = pieces;
  let estimation: PiecesEstimation | undefined;

  const dispatch = createEventDispatcher<{
    estimation: PiecesEstimation | undefined;
  }>();

  function setEstimation(value: PiecesEstimation | undefined) {
    estimation = value;
    dispatch("estimation", value);
  }

  const recomputeEstimation = (n: number) => {
    const dims = mediaItems.map((e) => [e.width, e.height]) as [number, number][];
    if (!dims.length || dims[0].length !== 2) {
      setEstimation(undefined);
      return;
    }

    const localSetClone = generateSets(n, dims.length, dims);
    const total = localSetClone.reduce((a, b) => a + b.cols * b.rows, 0);
    if (total === 0) {
      setEstimation({ valid: false, total, density: 0, maxTextureDim: 0 });
      return;
    }

    const totalNumOfPixels = localSetClone.reduce((a, b) => a + b.imageWidth * b.imageHeight, 0);
    const density = Math.round(Math.sqrt(totalNumOfPixels / total));
    const maxTextureDim = computeMaxTextureDim(localSetClone);
    setEstimation({ valid: true, total, density, maxTextureDim });
  };

  function computeMaxTextureDim(localSetClone: PSet[]) {
    let maxpiecewidth = 0;
    let maxpieceheight = 0;
    let maskX = 0;
    let maskY = 0;
    let s = 0;
    let l = 0;

    let localSetClone2 = localSetClone;
    for (let c = 0; c < localSetClone2.length; c++) {
      let localset = localSetClone2[c],
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

    return Math.max(s, l);
  }

  function getBoundedValue(value: number) {
    return Math.max(MIN_PIECES, Math.min(value, maxPieces));
  }

  function onValueChange() {
    pieces = getBoundedValue(value);
    value = pieces;
  }

  $: recomputeEstimation(getBoundedValue(value));
  $: mediaItems?.length > 0 && recomputeEstimation(pieces);
  $: if (pieces > maxPieces) {
    pieces = maxPieces;
    value = pieces;
  }
</script>

<div class="grid w-full items-center gap-1.5">
  <Label for="number-of-pieces">
    {t("createRoom.numberOfPieces", $translations)}
    {#if estimation?.valid}
      <span>({estimation.total})</span>
      {#if estimation.density > 0}
        <span>({estimation.density}&nbsp;ppi)</span>
      {/if}
      {#if mediaItems?.length > 1}
        <span class="text-muted-foreground">{t("createRoom.totalAllSets", $translations)}</span>
      {/if}
    {/if}
  </Label>
  <div class="flex flex-wrap sm:flex-nowrap justify-center gap-2">
    <Input type="number" id="number-of-pieces" min={MIN_PIECES} max={maxPieces} required bind:value on:change={() => onValueChange()} />
    <div class="flex gap-1">
      {#each OPTIONS as option (option)}
        <Button
          size="sm"
          variant="secondary"
          class="sm:h-full"
          on:click={() => {
            value = option;
            onValueChange();
          }}>
          {option}
        </Button>
      {/each}
    </div>
  </div>
</div>

{#if estimation}
  {#if estimation.valid}
    <!-- {#if estimation.maxTextureDim > 8000 && estimation.maxTextureDim < 16000}
      <aside class="bg-yellow-100 border border-yellow-400 text-red-700 px-4 py-3 rounded relative alert variant-ghost-error" role="alert">
        <div class="alert-message text-sm">
          This image size may cause issues on Firefox and mobile browsers using the old renderer. {estimation.maxTextureDim}
        </div>
      </aside>
    {:else if estimation.maxTextureDim >= 16000}
      <div class="bg-yellow-100 border border-yellow-400 text-red-700 px-4 py-3 rounded relative alert variant-ghost-error" role="alert">
        <div class="alert-message text-sm">
          This image size may cause issues on a lot of browsers using the old renderer. {estimation.maxTextureDim}
        </div>
      </div>
    {/if} -->
  {:else}
    <div class="bg-yellow-100 border border-yellow-400 text-red-700 px-4 py-3 rounded relative alert variant-ghost-error" role="alert">
      <div class="alert-message text-sm">{t("createRoom.invalidPieces", $translations)}</div>
    </div>
  {/if}
{/if}
