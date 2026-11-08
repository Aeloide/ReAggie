<script lang="ts">
  import MediaSelectorElement from "$lib/create-room/MediaSelectorElement.svelte";
  import { roomDef, videoElements } from "../stores";
  import { Button } from "$lib/components/ui/button";
  import { overlayImageTransform, previewBox, previewBoxSelectedItem } from "./previewBoxStore";

  let itemSize: { width: number; height: number } | null = null;

  let thumbnail: HTMLImageElement | HTMLVideoElement | undefined;
  let cursor: HTMLDivElement;

  let currentVideoProgress = 0;

  $: totalMediaItemsCount = $roomDef?.sets.length ?? 0;

  $: if (!$previewBox.thumbnailVisible) {
    currentVideoProgress = 0;
  }

  const scalePerMediaIndex = new Map<number, number>();

  function zoomTo(clientX: number, clientY: number, showOverlay: boolean) {
    if (!itemSize || !thumbnail) {
      return;
    }

    const rect = thumbnail.getBoundingClientRect();
    // Rect sometimes comes out with all zeros
    if (!rect.width || !rect.height) {
      return;
    }

    const width = itemSize.width;
    const height = itemSize.height;
    const scale = scalePerMediaIndex.get($previewBox.selectedMediaIndex) ?? 1;

    // update cursor size
    const cursorWidth = (innerWidth / width) * (rect.width / scale);
    const cursorHeight = (innerHeight / height) * (rect.height / scale);
    cursor.style.width = `${cursorWidth}px`;
    cursor.style.height = `${cursorHeight}px`;
    const cursorRect = cursor.getBoundingClientRect();
    const cursorX = clientX - cursorRect.width / 2;
    const cursorY = clientY - cursorRect.height / 2;
    cursor.style.translate = `${cursorX}px ${cursorY}px`;

    // translate image relative to cursor
    const relativeX = (clientX - rect.x) / rect.width;
    const relativeY = (clientY - rect.y) / rect.height;

    const translateX = relativeX * width * scale - innerWidth / 2;
    const translateY = relativeY * height * scale - innerHeight / 2;

    overlayImageTransform.set({
      translate: `${-translateX}px ${-translateY}px`,
      scale,
    });

    if (showOverlay) {
      previewBox.setOverlayVisible(true);
    }
  }

  function onInteractionEnd() {
    previewBox.setOverlayVisible(false);
  }

  function onMediaLoad(e: CustomEvent<{ width: number; height: number; element: HTMLImageElement | HTMLVideoElement }>) {
    itemSize = {
      width: e.detail.width,
      height: e.detail.height,
    };
    thumbnail = e.detail.element;

    syncVideoPlayback();
  }

  function syncVideoPlayback() {
    if (!$previewBoxSelectedItem) {
      return;
    }

    const { objectUrl, isImage } = $previewBoxSelectedItem;
    if (!isImage) {
      currentVideoProgress = videoElements.getProgress(objectUrl);
    }
  }

  function updateScale(clientX: number, clientY: number, deltaY: number) {
    const index = $previewBox.selectedMediaIndex;
    const prevScale = scalePerMediaIndex.get(index) ?? 1;
    const newScale = Math.min(Math.max(0.5, prevScale - deltaY * 0.001), 4);
    scalePerMediaIndex.set(index, newScale);

    zoomTo(clientX, clientY, false);
  }
</script>

<svelte:document on:visibilitychange={() => syncVideoPlayback()} />

{#if $previewBox.thumbnailVisible && $previewBoxSelectedItem}
  <div class="flex h-[20vh]">
    {#if totalMediaItemsCount > 1}
      <div class="flex flex-col gap-1 pr-1 pointer-events-auto overflow-y-auto">
        {#each Array(totalMediaItemsCount) as _, i}
          <Button
            size="icon"
            variant={i === $previewBox.selectedMediaIndex ? "default" : "outline"}
            class="size-7"
            on:click={() => previewBox.selectIndex(i)}>
            {i + 1}
          </Button>
        {/each}
      </div>
    {/if}
    <div
      role="img"
      class="h-full"
      on:wheel={(e) => updateScale(e.clientX, e.clientY, e.deltaY)}
      on:mouseenter={(e) => zoomTo(e.clientX, e.clientY, true)}
      on:mousemove={(e) => zoomTo(e.clientX, e.clientY, false)}
      on:mouseleave={() => onInteractionEnd()}
      on:touchstart={(e) => {
        const touch = e.touches[0];
        zoomTo(touch.clientX, touch.clientY, true);
      }}
      on:touchmove={(e) => {
        const touch = e.touches[0];
        zoomTo(touch.clientX, touch.clientY, false);
      }}
      on:touchend={() => onInteractionEnd()}>
      <MediaSelectorElement
        on:mediaLoad={onMediaLoad}
        currentTime={currentVideoProgress}
        extraClasses="max-h-full pointer-events-auto cursor-crosshair max-w-full"
        item={$previewBoxSelectedItem} />
    </div>

    <div
      class="absolute border-2 border-white border-solid top-0 left-0 pointer-events-none"
      class:invisible={!$previewBox.overlayVisible}
      bind:this={cursor} />
  </div>
{/if}
