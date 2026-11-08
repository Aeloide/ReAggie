<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import { createEventDispatcher, onMount } from "svelte";

  // Props
  export let minSpread = 1;
  export let maxSpread = 64;
  export let spread = 1;

  // State
  let x = 0;
  let y = 0;
  let dragging = false;
  let container: HTMLDivElement;

  const dispatch = createEventDispatcher();

  const LIMIT = 12;

  // Derived Values
  $: dist = Math.sqrt(x * x + y * y);
  $: angleRad = Math.atan2(y, x);
  $: angleDeg = (angleRad * (180 / Math.PI) + 360) % 360;
  $: magnitude = Math.min(1, dist / LIMIT);
  $: interpolatedSpread = minSpread + ((maxSpread - minSpread) * (spread - 0.4)) / 2.1; // Scaled based on internal 0.4-2.5 range

  // Exported value object for bind:value
  export let value = {
    x: 0,
    y: 0,
    angle: 0,
    magnitude: 0,
    spread: minSpread,
  };

  // Sync internal state from external value prop
  $: {
    if (value) {
      const range = maxSpread - minSpread;
      // Restore X/Y
      // value.x is normalized. x is pixels (0..LIMIT).
      const targetX = (value.x || 0) * LIMIT;
      const targetY = (value.y || 0) * LIMIT;

      // Restore Spread
      // val = min + (range)*(internal - 0.4)/2.1
      // internal = 0.4 + (val - min)*2.1/range
      const sVal = value.spread ?? minSpread;
      let targetSpread = 1;
      if (range !== 0) {
        targetSpread = 0.4 + ((sVal - minSpread) * 2.1) / range;
      }

      // Update only if significantly different to avoid loops/precision jitter
      if (Math.abs(targetX - x) > 0.01 || Math.abs(targetY - y) > 0.01 || Math.abs(targetSpread - spread) > 0.01) {
        x = targetX;
        y = targetY;
        spread = Math.max(0.4, Math.min(2.5, targetSpread));
      }
    }
  }

  function update() {
    // Recalculate derived for output
    const d = Math.sqrt(x * x + y * y);
    const m = Math.min(1, d / LIMIT);
    const ang = Math.atan2(y, x) * (180 / Math.PI);
    const angDeg = (ang + 360) % 360;

    // Recalculate spread output
    const range = maxSpread - minSpread;
    const sOut = minSpread + (range * (spread - 0.4)) / 2.1;

    const newVal = {
      x: m > 0 ? x / LIMIT : 0,
      y: m > 0 ? y / LIMIT : 0,
      angle: angDeg,
      magnitude: m,
      spread: sOut,
    };

    value = newVal;
    dispatch("change", newVal);
  }

  function handleMove(clientX: number, clientY: number) {
    const rect = container.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    const dx = clientX - cx;
    const dy = clientY - cy;
    const d = Math.sqrt(dx * dx + dy * dy);
    const a = Math.atan2(dy, dx);

    if (d > LIMIT) {
      x = Math.cos(a) * LIMIT;
      y = Math.sin(a) * LIMIT;
    } else {
      x = dx;
      y = dy;
    }
    update();
  }

  function onMouseDown(e: MouseEvent) {
    if (e.button === 1) {
      e.preventDefault();
      x = 0;
      y = 0;
      spread = 1;
      update();
      return;
    }
    dragging = true;
    handleMove(e.clientX, e.clientY);
  }

  function onWindowMouseMove(e: MouseEvent) {
    if (dragging) handleMove(e.clientX, e.clientY);
  }

  function onWindowMouseUp(e: MouseEvent | TouchEvent) {
    dragging = false;
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    spread = Math.max(0.4, Math.min(2.5, spread + delta));
    update();
  }

  function onTouchStart(e: TouchEvent) {
    dragging = true;
    handleMove(e.touches[0].clientX, e.touches[0].clientY);
  }

  function onTouchMove(e: TouchEvent) {
    if (dragging) handleMove(e.touches[0].clientX, e.touches[0].clientY);
  }
</script>

<svelte:window on:mousemove={onWindowMouseMove} on:mouseup={onWindowMouseUp} on:touchmove|nonpassive={onTouchMove} on:touchend={onWindowMouseUp} />

<div
  bind:this={container}
  class="light-gizmo"
  title={t("settings.gizmoHint", $translations)}
  role="slider"
  aria-orientation="vertical"
  aria-valuemin={minSpread}
  aria-valuemax={maxSpread}
  aria-valuenow={spread}
  tabindex="0"
  on:mousedown={onMouseDown}
  on:touchstart|preventDefault={onTouchStart}
  on:wheel={onWheel}
  style="
    --x: {x}px; 
    --y: {y}px; 
    --a: {angleDeg}deg; 
    --m: {magnitude}; 
    --s: {spread};
  ">
  <div class="gizmo-handle">
    <div class="gizmo-pointer">
      <div class="gizmo-lens"></div>
    </div>
  </div>
</div>

<style>
  .light-gizmo {
    --g-size: 48px;
    --g-handle: 24px;
    --accent: #fbbf24;
    position: relative;
    width: var(--g-size);
    height: var(--g-size);
    background: #1e293b;
    border-radius: 50%;
    cursor: grab;
    box-shadow:
      inset 0 2px 4px rgba(0, 0, 0, 0.5),
      0 0 0 2px #334155;
    touch-action: none;
    display: flex;
    align-items: center;
    justify-content: center;
    user-select: none;
  }

  .light-gizmo:active {
    cursor: grabbing;
  }

  .gizmo-handle {
    position: absolute;
    width: var(--g-handle);
    height: var(--g-handle);
    background: radial-gradient(circle at 30% 30%, #475569, #0f172a);
    border-radius: 50%;
    transform: translate(var(--x), var(--y));
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.4);
    z-index: 10;
    pointer-events: none;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .gizmo-pointer {
    position: absolute;
    width: 100%;
    height: 100%;
    transform: rotate(var(--a));
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .gizmo-lens {
    width: 6px;
    height: 6px;
    background: var(--accent);
    border-radius: 50%;
    box-shadow: 0 0 8px var(--accent);
    transform: translateX(calc(var(--m) * 7px)) scale(var(--s));
    transition: transform 0.1s ease-out;
  }
</style>
