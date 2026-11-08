<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import { createEventDispatcher } from "svelte";
  import type { MediaItem, PreviewItem } from "./types";
  import type { HTMLAttributes } from "svelte/elements";

  export let item: PreviewItem;
  export let currentTime: number = 0;
  export let extraClasses: HTMLAttributes<HTMLElement>["class"] | undefined = undefined;

  let video: HTMLVideoElement;

  $: if (currentTime && video) {
    video.currentTime = currentTime;
  }

  const dispatch = createEventDispatcher<{
    mediaLoad: MediaItem;
    error: { text: string };
  }>();

  let isLoaded = false;
  $: if (item) {
    isLoaded = false;
  }

  function onVideoCanPlay(event: Event) {
    if (isLoaded) return;
    const video = event.target as HTMLVideoElement;
    dispatch("mediaLoad", {
      item,
      size: item.size,
      width: video.videoWidth,
      height: video.videoHeight,
      element: video,
    });
    isLoaded = true;
  }

  function onImageLoad(event: Event) {
    if (isLoaded) return;
    const img = event.target as HTMLImageElement;
    dispatch("mediaLoad", {
      item,
      size: item.size,
      width: img.naturalWidth,
      height: img.naturalHeight,
      element: img,
    });
    isLoaded = true;
  }

  function onError() {
    dispatch("error", { text: t("createRoom.errorPrefix", $translations).replace("{message}", t("createRoom.decodeFailed", $translations)) });
  }

  const baseClasses = "bg-white w-full block pointer-events-none rounded-lg";
</script>

{#if item.isImage}
  <img class={extraClasses || baseClasses} alt={t("createRoom.preview", $translations)} draggable="false" src={item.objectUrl} on:load={onImageLoad} on:error={onError} />
{:else}
  <video
    class={extraClasses || baseClasses}
    bind:this={video}
    autoplay
    muted
    loop
    draggable="false"
    src={item.objectUrl}
    currenttime={currentTime}
    on:canplay={onVideoCanPlay}
    on:error={onError}>
    <track kind="captions" />
  </video>
{/if}
