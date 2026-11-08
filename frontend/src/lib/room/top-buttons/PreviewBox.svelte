<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import { previewBox } from "../preview/previewBoxStore";
  import Fa from "svelte-fa";
  import { faImage } from "@fortawesome/free-solid-svg-icons/faImage";
  import { Button } from "$lib/components/ui/button";

  function onWindowKeyDown(event: KeyboardEvent) {
    if (event.code === "KeyR" && !event.metaKey && !event.ctrlKey) {
      toggleThumbnailVisibility();
    }
  }

  function toggleThumbnailVisibility() {
    const isThumbnailVisible = $previewBox.thumbnailVisible;
    if (isThumbnailVisible) {
      previewBox.setOverlayVisible(false);
    }

    previewBox.setThumbnailVisible(!isThumbnailVisible);
  }
</script>

<svelte:window on:keydown={onWindowKeyDown} />

<Button
  size="icon-menu"
  variant={$previewBox.thumbnailVisible ? "default" : "outline"}
  title={t("menu.previewImage", $translations)}
  on:click={() => toggleThumbnailVisibility()}>
  <Fa icon={faImage} />
</Button>
