<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import Fa from "svelte-fa";
  import { faMinus } from "@fortawesome/free-solid-svg-icons/faMinus";
  import { faPlus } from "@fortawesome/free-solid-svg-icons/faPlus";
  import { faYoutube } from "@fortawesome/free-brands-svg-icons/faYoutube";
  import type { ActiveSong } from "../types";
  import { createEventDispatcher } from "svelte";
  import { useGame } from "../hooks/useGame";
  import { Button } from "$lib/components/ui/button";
  import { cn } from "$lib/utils";
  import { roomState } from "../stores";

  export let playlist: {
    id: string;
    skip: boolean;
    title: string;
  }[];

  export let activeSong: ActiveSong | undefined;

  export let hasAdminControls: boolean = true;

  const game = useGame();

  const dispatch = createEventDispatcher<{
    skip: { id: string; index: number };
  }>();

  function fmtMSS(duration: number) {
    let s = Math.floor(duration);
    return (s - (s %= 60)) / 60 + (9 < s ? ":" : ":0") + s;
  }

  function onSongSkipClick(id: string, index: number) {
    dispatch("skip", { id, index });
  }

  function getDurationText(song: ActiveSong) {
    const progress = fmtMSS(song.progressSeconds);
    const duration = fmtMSS(song.durationSeconds);
    return `${progress} / ${duration}`;
  }
</script>

<div class="max-h-64 overflow-y-auto">
  {#if playlist.length === 0}
    <div class="text-center text-sm py-2">{t("jukebox.empty", $translations)}</div>
  {:else}
    {#each playlist as track, i (track.id)}
      <div class="grid grid-cols-[1fr_auto] items-center text-sm">
        <span
          class={cn("truncate", {
            "text-blue-400 font-bold": track.id === activeSong?.id,
            "text-muted-foreground line-through": track.skip,
          })}
          title={track.title}>
          {i + 1}. {track.title}
        </span>
        <div class="flex flex-row gap-2 ml-1.5">
          {#if track.id === activeSong?.id}
            <span class="text-xs text-muted-foreground">
              {getDurationText(activeSong)}
            </span>
          {/if}
          {#if $roomState.isCompleted}
            <Button
              size="icon"
              variant="ghost"
              class="size-4"
              title={t("jukebox.source", $translations)}
              on:click={() => open("https://www.youtube.com/watch?v=" + track.id, "_blank")}>
              <Fa icon={faYoutube} size="lg" color="red" />
            </Button>
          {/if}
          {#if hasAdminControls}
            <Button size="icon" class="size-4 rounded-full" title={track.skip ? t("jukebox.restore", $translations) : t("jukebox.skip", $translations)} on:click={() => onSongSkipClick(track.id, i)}>
              <Fa icon={track.skip ? faPlus : faMinus} size="xs" />
            </Button>
          {/if}
        </div>
      </div>
    {/each}
  {/if}
</div>
