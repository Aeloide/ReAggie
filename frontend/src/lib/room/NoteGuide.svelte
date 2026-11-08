<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import { createEventDispatcher, onMount } from "svelte";
  import { useGame } from "./hooks/useGame";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import type { Note } from "$room/types";

  export let note: Note = {
    id: -1,
    text: "",
    color: "#ffffff",
    align: "center",
    region: [
      [NaN, NaN],
      [NaN, NaN],
    ],
  };

  const game = useGame();
  const notesManager = game.entities[5]; // Should be replaced with a more robust lookup if possible
  const dispatch = createEventDispatcher();

  let regionDefined = false;
  $: regionDefined = !isNaN(note.region[0][0]);

  let maxScale = 50;
  let canvas: OffscreenCanvas | HTMLCanvasElement;
  let ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;

  // Compute maxScale purely from inputs
  function computeMaxScale(text: string, region: Note["region"]) {
    if (!text || isNaN(region[0][0])) {
      return 50;
    }

    if (!canvas) {
      if (typeof OffscreenCanvas !== "undefined") {
        canvas = new OffscreenCanvas(10, 48);
      } else {
        canvas = document.createElement("canvas");
        canvas.width = 10;
        canvas.height = 48;
      }
      ctx = canvas.getContext("2d") as any;
    }

    if (ctx) {
      ctx.font = "48px sans";
      const metrics = ctx.measureText(text);
      const width = metrics.width;

      const regionW = Math.abs(region[1][0] - region[0][0]);
      const regionH = Math.abs(region[1][1] - region[0][1]);

      const scaleW = regionW / width;
      const scaleH = regionH / 48; // TextDrawer height is 48px

      return Math.min(scaleW, scaleH);
    }
    return 50;
  }

  $: maxScale = computeMaxScale(note.text, note.region);

  function startDraw() {
    notesManager.startSetup(note, (n) => {
      note = n; // Update local note with drawn region
      regionDefined = true;
      // Force Svelte update just in case
      note = { ...note };
    });
  }

  function cancel() {
    notesManager.cancelSetup();
    dispatch("cancel");
  }

  function save() {
    dispatch("save", { note });
  }

  onMount(() => {
    // If we are editing an existing note that already has a region, we don't auto-start draw
    // If it's a new note (region has NaNs), maybe we could auto-start, or let user click "Draw"
    if (!regionDefined) {
      // Optional: auto start draw?
      // startDraw();
    }
    return () => {
      notesManager.cancelSetup();
    };
  });
</script>

<div class="bg-popover rounded border p-4 w-72 shadow-xl flex flex-col gap-4">
  <div class="flex flex-col gap-2">
    <h3 class="font-semibold leading-none tracking-tight">
      {note.id === -1 ? t("notes.add", $translations) : t("notes.edit", $translations)}
    </h3>
    <p class="text-sm text-muted-foreground">{t("notes.configure", $translations)}</p>
  </div>

  <div class="grid gap-2">
    <div class="grid grid-cols-3 items-center gap-4">
      <Label for="text">{t("notes.text", $translations)}</Label>
      <Input id="text" bind:value={note.text} class="col-span-2 h-8" on:keydown={(e) => e.stopPropagation()} />
    </div>

    <div class="grid grid-cols-3 items-center gap-4">
      <Label for="color">{t("notes.color", $translations)}</Label>
      <div class="col-span-2 flex items-center gap-2">
        <input type="color" id="color" bind:value={note.color} class="h-8 w-full cursor-pointer" />
      </div>
    </div>

    <div class="grid grid-cols-3 items-center gap-4">
      <Label for="scale">{t("notes.scale", $translations)}</Label>
      <div class="col-span-2 flex items-center gap-2">
        <input type="range" id="scale" bind:value={note.scale} min={1} max={maxScale} step={0.01} class="h-8 w-full cursor-pointer" />
      </div>
    </div>

    <div class="grid grid-cols-3 items-center gap-4">
      <Label>{t("notes.region", $translations)}</Label>
      <div class="col-span-2">
        <Button variant={regionDefined ? "outline" : "default"} size="sm" class="w-full" on:click={startDraw}>
          {regionDefined ? t("notes.redraw", $translations) : t("notes.draw", $translations)}
        </Button>
      </div>
    </div>
  </div>

  <div class="flex justify-end gap-2">
    <Button variant="outline" on:click={cancel}>{t("common.cancel", $translations)}</Button>
    <Button on:click={save} disabled={!regionDefined || !note.text}>{t("common.save", $translations)}</Button>
  </div>
</div>
