<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import { createEventDispatcher, onMount } from "svelte";
  import { setCanvasElem } from "$room/ui-elements";
  import { startLoading, startRender } from "$room/render";
  import { attachWindowsEvents, clearWindowsEvents, handleCanvasPressEvent, handleCanvasWheelEvent } from "$room/eventHandlers";
  import { createRenderer, getSupportedRenderer } from "$room/game";
  import { useGame } from "./hooks/useGame";
  import { derived } from "svelte/store";
  import { otherSettings, roomDef, settings } from "./stores";
  import { toast } from "svelte-sonner";
  import { getGPUDiags } from "$lib/utils";
  import { MediaSetLoader } from "$room/media-set-loader";
  import type { PSet, vec2 } from "$backend/types";
  import { generateSets } from "$lib/create-room/utils";
  import { groupsFromSet } from "../../board";
  import { slide } from "svelte/transition";
  import Button from "$lib/components/ui/button/button.svelte";
  import { getTransformedXY } from "$room/game-state";
  import { buildPiece, buildVoronoiPiece } from "$room/jig-generation";
  import type { VoronoiShape } from "$room/game";

  let canvas: HTMLCanvasElement;
  let initialized = false;
  let unloading = false;
  let devOverlayCanvas: HTMLCanvasElement;
  let devOverlayCtx: CanvasRenderingContext2D | null = null;
  let devOverlayReq: number;


  let initPromise: Promise<void> | undefined;
  let initGeneration = 0;

  const dispatch = createEventDispatcher<{loaded: undefined}>();

  const game = useGame();

  function destroyRenderer() {
    stopRender?.();
    game.renderer?.destroy();
    game.renderer = undefined;
  }

  function onDataLoaded() {
    initGeneration++;
    initialized = false;
    if (syncRenderer($renderer)) {
      renderGame();
    }
  }

  function onDisconnected() {
    initGeneration++;
    stopRender?.();
    initialized = false;
  }

  function renderDevOverlay() {
    if (!devOverlayCanvas) {
      devOverlayReq = requestAnimationFrame(renderDevOverlay);
      return;
    }

    if (devOverlayCanvas.width !== innerWidth || devOverlayCanvas.height !== innerHeight) {
      devOverlayCanvas.width = innerWidth;
      devOverlayCanvas.height = innerHeight;
    }

    const ctx = devOverlayCtx || (devOverlayCtx = devOverlayCanvas.getContext("2d"));
    if (!ctx) {
      devOverlayReq = requestAnimationFrame(renderDevOverlay);
      return;
    }

    ctx.clearRect(0, 0, devOverlayCanvas.width, devOverlayCanvas.height);

    if (game && game.loaded && game.state && game.state.groups) {
      for (const group of game.state.groups) {
        if (!group.pieces) continue;
        for (const piece of group.pieces) {
          // 1. Get or build detailed geometry positionBuffer
          if (!piece.positionBuffer) {
            const tabSize = game.roomdef.tabSize;
            const isVoronoi = (piece.puzzle as any)?.type === 'voronoi';
            if (isVoronoi) {
              const built = buildVoronoiPiece(piece.puzzle as any, tabSize);
              piece.positionBuffer = built.positionBuffer;
            } else {
              const set = game.state.sets[piece.set || 0];
              if (set) {
                const pieceWidth = set.pieceWidth || (set.width / set.cols);
                const pieceHeight = set.pieceHeight || (set.height / set.rows);
                const built = buildPiece(piece.puzzle as any, tabSize, piece.xi, piece.yi, pieceWidth, pieceHeight);
                piece.positionBuffer = built.positionBuffer;
              }
            }
          }

          // 2. Render coarse box
          const isVoronoi = (piece.puzzle as any)?.type === 'voronoi';
          let bboxWidth = 0;
          let bboxHeight = 0;

          if (isVoronoi) {
            const puzzle = piece.puzzle as any as VoronoiShape;
            bboxWidth = puzzle.width;
            bboxHeight = puzzle.height;
          } else {
            const set = game.state.sets[piece.set || 0];
            if (set) {
              const width = set.pieceWidth!;
              const height = set.pieceHeight!;
              const isVerticallyRotated = 1 === group.rot || 3 === group.rot;
              bboxWidth = isVerticallyRotated ? height : width;
              bboxHeight = isVerticallyRotated ? width : height;
            }
          }

          if (bboxWidth > 0 && bboxHeight > 0) {
            const wx = piece.globalX + piece.puzzleX;
            const wy = piece.globalY + piece.puzzleY;

            const [sx, sy] = game.view.worldToScreen([wx, wy]);
            const sW = bboxWidth * game.view.scale;
            const sH = bboxHeight * game.view.scale;

            // Draw coarse box (translucent overlay)
            ctx.strokeStyle = "rgba(244, 63, 94, 0.85)"; // Vibrant rose outline
            ctx.lineWidth = 2;
            ctx.strokeRect(sx, sy, sW, sH);
            ctx.fillStyle = "rgba(244, 63, 94, 0.15)";
            ctx.fillRect(sx, sy, sW, sH);
          }

          // 3. Render detailed geometry
          if (piece.positionBuffer) {
            ctx.beginPath();
            const numPoints = piece.positionBuffer.length / 2;
            for (let i = 0; i < numPoints; i++) {
              const vx = piece.positionBuffer[i * 2];
              const vy = piece.positionBuffer[i * 2 + 1];

              const [rx, ry] = getTransformedXY(piece, [vx, vy]);
              const vertexWx = rx + piece.globalX;
              const vertexWy = ry + piece.globalY;

              const [vertexSx, vertexSy] = game.view.worldToScreen([vertexWx, vertexWy]);
              if (i === 0) {
                ctx.moveTo(vertexSx, vertexSy);
              } else {
                ctx.lineTo(vertexSx, vertexSy);
              }
            }
            ctx.closePath();
            ctx.strokeStyle = "rgba(6, 182, 212, 0.9)"; // Vibrant cyan outline
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.fillStyle = "rgba(6, 182, 212, 0.2)";
            ctx.fill();
          }
        }
      }
    }

    devOverlayReq = requestAnimationFrame(renderDevOverlay);
  }

  onMount(() => {
    if (game.loaded) {
      onDataLoaded();
    } else {
      game.addEventListener("data-loaded", onDataLoaded);
    }

    game.addEventListener("disconnected", onDisconnected);

    if (import.meta.env.DEV) {
      devOverlayReq = requestAnimationFrame(renderDevOverlay);
    }

    return () => {
      game.removeEventListener("data-loaded", onDataLoaded);
      game.removeEventListener("disconnected", onDisconnected);
      if (devOverlayReq) {
        cancelAnimationFrame(devOverlayReq);
      }
      unloading = true;
      destroyRenderer();
      clearWindowsEvents();
      setCanvasElem(null);
    };
  });

  const renderer = derived(settings, (x) => x.renderer);
  let stopRender: (() => void) | undefined;
  let lastRendererSetting: string | undefined;

  $: if (canvas && $renderer) {
    if (lastRendererSetting !== $renderer) {
      lastRendererSetting = $renderer;
      initGeneration++;
      initialized = false;
    }
    if (syncRenderer($renderer))
      renderGame();
  }

  function syncRenderer(renderer: string) {
    if (!renderer || !game.loaded) {
      return;
    }

    const newRenderer = getSupportedRenderer(renderer);
    if (newRenderer.renderer !== renderer) {
      alert(t("status.rendererSwitching", $translations).replace("{reason}", String(newRenderer.reason)));

      settings.update((s) => {
        s.renderer = newRenderer.renderer;
        return s;
      });

      // can't be rendered now, waiting for the new canvas
      return false;
    }

    // canvas is ok, we can render
    initialized = false;
    return true;
  }

  function renderGame() {
    if (unloading || !canvas || !game.loaded || initialized) {
      return;
    }

    if (!initPromise) {
      destroyRenderer();
      clearWindowsEvents();
      const generation = initGeneration;
      initPromise = init(generation)
        .catch((error) => {
          console.error("Failed to initialize game renderer", error);
        })
        .finally(() => {
          initPromise = undefined;
          if (!unloading && generation !== initGeneration)
            renderGame();
        });
    }
  }

  async function init(generation: number) {
    let rendererInstance;
    try {
      rendererInstance = createRenderer(game, $renderer, canvas);
    } catch {
      settings.update((s) => {
        s.renderer = "cpu";
        return s;
      });
      alert(t("status.rendererFallback", $translations));
      rendererInstance = createRenderer(game, "cpu", canvas);
    }
    game.renderer = rendererInstance;
    if ($renderer.startsWith("gpu")) {
      const diagnostics = getGPUDiags();
      if (diagnostics) {
        toast.warning(diagnostics, { duration: 5000 });
      }
    }
    setCanvasElem(canvas); // is only used for the debugcanvas, do we really need this anymore?

    try {
      await startLoading(game);
    } catch (error) {
      if (game.renderer === rendererInstance) {
        rendererInstance.destroy();
        game.renderer = undefined;
      }
      throw error;
    }
    if (generation !== initGeneration || unloading) {
      game.dataInitialized = false;
      if (game.renderer === rendererInstance) {
        rendererInstance.destroy();
        game.renderer = undefined;
      }
      return;
    }
    game.dataInitialized = true;
    game.connection?.changeMode("process");
    stopRender = startRender(game, canvas);
    initialized = true;
    attachWindowsEvents();
    dispatch("loaded");
  }

  let injectCancel = () => {};

  let injectConfirm = () => {};

  let loading = false;
  let editmode = false;

  let pp: HTMLSpanElement;
  function updatePos() {
    if (!pp) return;
    if (lastpos && start) {
      const dv = game.view.screenToWorld(lastpos);
      setBoardWidth(dv);
    }

    const r = game.roomdef;
    const conv = game.view.worldToScreen([r.boardWidth, r.boardHeight]);
    pp.style.top = `${conv[1]}px`;
    pp.style.left = `${conv[0]}px`;
  }
  let original: vec2;
  let start: vec2 | undefined;
  $: if (!start && game?.loaded) {
    original = [game.roomdef.boardWidth, game.roomdef.boardHeight];
  }
  onMount(() => {
    game.addEventListener("data-loaded", () => {
      original = [game.view.boardWidth, game.view.boardHeight];
      updatePos();
    });
    game.view.addEventListener("view_change", updatePos);
  });

  $: if (pp) updatePos();

  function startDrag() {
    start = [game.view.boardWidth, game.view.boardHeight];
    lastpos = game.view.worldToScreen(start);
  }

  function setBoardWidth(nd: vec2) {
    game.view.boardWidth = nd[0];
    game.view.boardHeight = nd[1];
    game.roomdef.boardWidth = nd[0];
    game.roomdef.boardHeight = nd[1];
  }

  function stopDrag() {
    if (start) {
      const deltaX = Math.round(game.view.boardWidth - start[0]);
      const deltaY = Math.round(game.view.boardHeight - start[1]);
      if (deltaX !== 0 || deltaY !== 0) {
        if ($otherSettings.host.ChangeRoomSettings) {
          game.connection.chat(`/grow ${deltaX} ${deltaY}`);
          original = [game.view.boardWidth, game.view.boardHeight];
        }
      }
    }
    start = undefined;
  }
  let lastpos: vec2 | undefined;
  function handleDrag(nd: vec2) {
    if (!start) return;
    lastpos = nd;
    updatePos();
  }

  function handleDragEnter(e: DragEvent) {
    e.preventDefault();
  }

  function handleDragLeave(e: DragEvent) {
    if (e.relatedTarget === null || !canvas.contains(e.relatedTarget as Node)) {
    }
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
  }


  async function handleDrop(e: DragEvent) {
    e.preventDefault();
  }
</script>

<!-- recreate canvas on renderer change -->
{#key $renderer}
  <!-- tab index is required to make the canvas focusable -->
  <div class="absolute inset-0 size-full">
    <canvas
      tabindex="0"
      on:dragenter={handleDragEnter}
      on:dragleave={handleDragLeave}
      on:dragover={handleDragOver}
      on:drop={handleDrop}
      on:mousedown={handleCanvasPressEvent}
      on:touchstart={handleCanvasPressEvent}
      on:wheel={handleCanvasWheelEvent}
      on:contextmenu={(e) => e.preventDefault()}
      class="absolute inset-0 size-full outline-none select-none"
      class:pointer-events-none={!initialized}
      bind:this={canvas} />
    {#if import.meta.env.DEV}
      <canvas
        bind:this={devOverlayCanvas}
        class="absolute inset-0 size-full outline-none select-none pointer-events-none"
        style="z-index: 10;" />
    {/if}
  </div>
{/key}

<svelte:window on:pointerup={stopDrag} on:pointermove={(ev) => handleDrag([ev.pageX, ev.pageY])} />
{#if $otherSettings.host.ChangeRoomSettings}
  <span class="peepee" bind:this={pp} on:pointerdown={startDrag}>⇲</span>
{/if}

<style>
  .peepee {
    overflow: hidden;
    position: absolute;
    padding: 0;
    border: 1px solid;
    border-top-left-radius: 100%;
    aspect-ratio: 1;
    width: 2em;
    color: black;
    height: 2em;
    display: flex;
    flex-wrap: nowrap;
    align-content: center;
    justify-content: center;
    align-items: center;
    background: #ffffffd0;
    cursor: nwse-resize;
    user-select: none;
    transform: translate(-100%, -100%);
  }
</style>
