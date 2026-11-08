<script lang="ts">
  import RoomGameView from "$lib/room/RoomGameView.svelte";
  import RoomUserSettingsView from "$lib/room/RoomUserSettingsView.svelte";
  import GameProvider from "$lib/room/providers/GameProvider.svelte";
  import { roomDef, settings } from "$lib/room/stores";
  import type { PageData } from "./$types";

  export let data: PageData;
</script>

<svelte:head>
  <title>{($roomDef && `${$roomDef.pieces} | ${$roomDef.name || "Jiggie"}`) || "Jiggie"}</title>
  <meta name="robots" content="noindex nofollow" />
  <html lang="en" />
</svelte:head>

{#if $settings.savedname}
  <GameProvider roomName={"offline-" + data.slug}>
    <div class="w-screen h-[100dvh] overflow-hidden relative" id="room-content">
      <RoomGameView />
    </div>
  </GameProvider>
{:else}
  <RoomUserSettingsView />
{/if}
