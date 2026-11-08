<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import RoomGameView from "$lib/room/RoomGameView.svelte";

  let files: FileList;
</script>

<svelte:head>
  <meta name="robots" content="noindex nofollow" />
  <html lang="en" />
</svelte:head>

{#if files?.length > 0}
  <div>

  </div>
{:else}
  <div>
    <h2>{t("viewer.selectReplay", $translations)}</h2>
    <input bind:value={files} type="file" />
  </div>
{/if}
