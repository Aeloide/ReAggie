<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import { faBackward, faForward } from "@fortawesome/free-solid-svg-icons"; // Import icons for new buttons
  import { fetchRoomReplay, updateLogEventsAbsoluteTimes } from "$room/replay/replay-loader";
  import { ReplayPlayer } from "$room/replay/replay-player";
  import type { ReplayLogEvent } from "$room/replay/types";
  import { faExclamationTriangle } from "@fortawesome/free-solid-svg-icons/faExclamationTriangle";
  import { onDestroy, type ComponentType } from "svelte";
  import Fa from "svelte-fa";
  import { useGame } from "../../hooks/useGame";
  import { debounce } from "../../../../utils";
  import { faSpinner } from "@fortawesome/free-solid-svg-icons/faSpinner";

  let replayPos = 0;
  let customSeekSeconds = 10;
  let canvas: HTMLCanvasElement;
  let replayEvents: ReplayLogEvent[] = [];
  let replayPlayer: ReplayPlayer;

  export let sub: ComponentType | undefined = undefined;

  export function getReplayPlayer() {
    return replayPlayer;
  }

  let loaded = false;

  const globalGame = useGame();

  async function initViewer() {
    try {
      replayEvents = await fetchRoomReplay(globalGame.roomName!, globalGame.state.isGameEnded());
      updateLogEventsAbsoluteTimes(replayEvents, globalGame.roomdef?.startTime || 0);

      // viewer should use at most 60% of the screen
      const maxWidth = innerWidth * 0.6;
      const maxHeight = innerHeight * 0.6;

      const aspect = globalGame.view.boardWidth / globalGame.view.boardHeight;
      const width = Math.round(Math.min(maxWidth, aspect < 1 ? maxHeight * aspect : maxHeight / aspect));
      const height = Math.round(Math.min(maxHeight, aspect < 1 ? maxWidth / aspect : maxWidth * aspect));
      const largestDim = Math.max(width, height);

      replayPlayer = await ReplayPlayer.create(replayEvents, largestDim, canvas);
      replayPlayer.buildCheckpoint();
      canvas.style.display = "block";
      canvas.style.width = "100%";
      canvas.style.height = "auto";
      canvas.style.maxHeight = "75vh"; // giving up
      canvas.style.aspectRatio = "" + aspect;
      loaded = true;
    } catch (e) {
      console.error(e);
      throw e;
    }
  }

  onDestroy(() => {
    replayPlayer?.destroy();
  });

  const [playStepDebounced, cancelScheduledPlayStep] = debounce(() => playStep(), 25);

  function playStep() {
    if (replayPlayer.playStepInstant(replayPos)) {
      replayPlayer.render();
    }
  }

  function playStepSmart(pos: number) {
    if (!replayPlayer || pos >= replayEvents.length) {
      return;
    }

    if (pos >= replayPlayer.lastPlayedStepIndex) {
      cancelScheduledPlayStep();
      playStep();
    } else {
      playStepDebounced();
    }
  }

  function seekByTime(offsetMs: number) {
    if (!replayPlayer || !replayEvents || replayEvents.length === 0) {
      return;
    }
    const currentEventIndex = parseInt(String(replayPos), 10);
    if (isNaN(currentEventIndex) || currentEventIndex < 0 || currentEventIndex >= replayEvents.length) {
      console.error("Seek: Invalid currentEventIndex from replayPos", replayPos);
      return;
    }

    const currentTimeMs = replayEvents[currentEventIndex].time;
    const targetTimeMs = currentTimeMs + offsetMs;
    let newIndex = currentEventIndex;

    if (offsetMs === 0) return;

    if (targetTimeMs <= replayEvents[0].time) {
      newIndex = 0;
    } else if (targetTimeMs >= replayEvents[replayEvents.length - 1].time) {
      newIndex = replayEvents.length - 1;
    } else {
      if (offsetMs > 0) {
        const foundIndex = replayEvents.findIndex((event) => event.time >= targetTimeMs);
        newIndex = foundIndex !== -1 ? foundIndex : replayEvents.length - 1;
      } else {
        // offsetMs < 0
        let foundIndex = -1;
        for (let i = replayEvents.length - 1; i >= 0; i--) {
          if (replayEvents[i].time <= targetTimeMs) {
            foundIndex = i;
            break;
          }
        }
        newIndex = foundIndex !== -1 ? foundIndex : 0;
      }
    }

    const maxSliderIndex = replayEvents.length > 1 ? replayEvents.length - 2 : 0;
    const minSliderIndex = 0;

    if (replayEvents.length === 0) {
      // Should be handled by the initial guard
    } else if (replayEvents.length === 1) {
      replayPos = 0;
    } else {
      replayPos = Math.max(minSliderIndex, Math.min(newIndex, maxSliderIndex));
    }
  }

  function handleCustomSeek(direction: "forward" | "backward") {
    const amountMs = Number(customSeekSeconds) * 1000;
    if (isNaN(amountMs) || amountMs <= 0) {
      console.warn("Invalid custom seek amount:", customSeekSeconds);
      return;
    }
    seekByTime(direction === "forward" ? amountMs : -amountMs);
  }

  $: playStepSmart(replayPos);
</script>

<div class="bg-popover rounded border p-2 shadow-xl pointer-events-auto">
  <div class="relative">
    {#await initViewer()}
      <div class="absolute size-full">
        <div class="flex flex-col gap-2 items-center justify-center size-full">
          <Fa icon={faSpinner} size="2x" spin />
          <p class="ml-2">{t("post.loadingReplay", $translations)}</p>
        </div>
      </div>
    {:catch error}
      <div class="absolute size-full">
        <div class="flex flex-col gap-2 items-center justify-center h-full">
          <Fa icon={faExclamationTriangle} size="2x" />
          <h3 class="text-xl">{t("post.error", $translations)}</h3>
          <p class="text-sm">{error.message || t("post.unknownError", $translations)}</p>
        </div>
      </div>
    {/await}
    <div class="flex flex-col items-center gap-2 min-w-72">
      <canvas bind:this={canvas} class="pointer-events-none" />
      {#if loaded}
        <div class="flex justify-center items-center gap-2 mt-2 w-full px-1">
          <button
            on:click={() => handleCustomSeek("backward")}
            class="p-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-md transition-colors"
            aria-label={t("post.seekBack", $translations)}>
            <Fa icon={faBackward} />
          </button>

          <input
            type="number"
            bind:value={customSeekSeconds}
            min="1"
            class="w-20 px-2 py-1.5 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 rounded-md text-center text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            aria-label={t("post.seekAmount", $translations)} />
          <span class="text-sm text-slate-600 dark:text-slate-400">s</span>

          <button
            on:click={() => handleCustomSeek("forward")}
            class="p-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-md transition-colors"
            aria-label={t("post.seekForward", $translations)}>
            <Fa icon={faForward} />
          </button>
        </div>
        <div class="flex items-center w-full gap-2">
          <!-- exclude the first event from the slider, as it is a roomDef event -->
          <input type="range" min="0" max={replayEvents.length - 2} bind:value={replayPos} class="w-full" />

          {#if sub}
            <svelte:component this={sub} {replayEvents}></svelte:component>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>
