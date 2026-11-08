<script lang="ts">
  import eraserUrl from "$lib/assets/scratch-card/eraser.png";
  import { cn } from "$lib/utils";
  import { onMount, createEventDispatcher } from "svelte";

  export let radius = 75;
  export let disabled = false;
  export let onScratch = (_: { clientX: number; clientY: number; movementX: number; movementY: number }) => {};

  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let isDrawing = false;
  let brush: HTMLImageElement;
  let pointerLeaveWithPressedButton = false;

  let completionPercentage = 0;
  const completionThreshold = 80;

  const dispatch = createEventDispatcher();

  function loadBrush() {
    brush = new Image();
    brush.src = eraserUrl;
  }

  function calculateCompletion() {
    if (!ctx || !canvas) return;
    const dpr = devicePixelRatio || 1;
    const imageData = ctx.getImageData(0, 0, radius * 2 * dpr, radius * 2 * dpr);
    const pixels = imageData.data;
    const totalPixels = pixels.length / 4; // RGBA
    let clearedPixels = 0;

    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] === 0) {
        clearedPixels++;
      }
    }

    completionPercentage = (clearedPixels / totalPixels) * 100;
    dispatch("scratchProgress", { completionPercentage });

    if (completionPercentage >= completionThreshold) {
      dispatch("scratchComplete");
    }
  }

  // Scratch function using custom brush
  function scratch(e: PointerEvent) {
    if (!isDrawing || !ctx || !canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const distFromCenter = Math.sqrt((x - radius) ** 2 + (y - radius) ** 2);
    if (distFromCenter <= radius) {
      ctx.globalCompositeOperation = "destination-out";
      ctx.drawImage(brush, x - brush.width / 2, y - brush.height / 2);

      const prevCompletion = completionPercentage;
      calculateCompletion();

      if (prevCompletion !== completionPercentage) {
        onScratch({ clientX: e.clientX, clientY: e.clientY, movementX: e.movementX, movementY: e.movementY });
      }
    }
  }

  function startDrawing(e: PointerEvent) {
    e.preventDefault();

    if (disabled) return;
    isDrawing = true;
    scratch(e);
  }

  function stopDrawing(e: PointerEvent) {
    e.preventDefault();
    isDrawing = false;
  }

  function resumeDrawingIfButtonIsDown(e: PointerEvent) {
    if (e.buttons === 1 && pointerLeaveWithPressedButton) {
      isDrawing = true;
      scratch(e);
    }
  }

  function initCanvas() {
    if (!canvas) return;

    const dpr = devicePixelRatio || 1;
    canvas.width = radius * 2 * dpr;
    canvas.height = radius * 2 * dpr;
    canvas.style.width = `${radius * 2}px`;
    canvas.style.height = `${radius * 2}px`;

    ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    ctx.scale(dpr, dpr);

    ctx.fillStyle = "#948f96";
    ctx.fillRect(0, 0, radius * 2, radius * 2);


    const grad = ctx.createLinearGradient(0, 0, radius, radius);
    grad.addColorStop(0, "#c2bec4");
    grad.addColorStop(1, "#948f96");

    // Fill rectangle with gradient
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, radius * 2, radius * 2);


    loadBrush();
  }

  onMount(() => {
    initCanvas();
  });
</script>

<canvas
  bind:this={canvas}
  class={cn("touch-none select-none rounded-full", isDrawing ? "cursor-grabbing" : disabled ? "cursor-not-allowed" : "cursor-grab")}
  on:pointerdown={startDrawing}
  on:pointermove={scratch}
  on:pointerup={stopDrawing}
  on:pointerleave={(e) => {
    pointerLeaveWithPressedButton = isDrawing && e.buttons === 1;
    stopDrawing(e);
  }}
  on:pointerenter={resumeDrawingIfButtonIsDown} />
