<script lang="ts">
  import MediaSelectorElement from "$lib/create-room/MediaSelectorElement.svelte";
  import { fade } from "svelte/transition";
  import { videoElements } from "../stores";
  import {
    overlayImageTransform,
    previewBox,
    previewBoxSelectedItem,
  } from "./previewBoxStore";

  let currentVideoProgress = 0;

  $: if (!$previewBox.overlayVisible) {
    currentVideoProgress = 0;
  }
</script>

{#if $previewBox.overlayVisible && $previewBoxSelectedItem}
  <div
    transition:fade={{ duration: 70 }}
    class="absolute inset-0 overflow-hidden bg-surface-backdrop-token pointer-events-none"
  >
    <div
      style:translate={$overlayImageTransform.translate}
      style:scale={$overlayImageTransform.scale}
      style:transform-origin="top left"
    >
      <MediaSelectorElement
        extraClasses="max-w-none"
        currentTime={currentVideoProgress}
        on:mediaLoad={() => {
          const url = $previewBoxSelectedItem?.objectUrl;
          if (url) {
            currentVideoProgress = videoElements.getProgress(url);
          }
        }}
        item={$previewBoxSelectedItem}
      />
    </div>
  </div>
{/if}
