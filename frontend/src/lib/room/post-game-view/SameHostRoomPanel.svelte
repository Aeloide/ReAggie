<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import { getPublicRooms, type PublicRoomInfo } from "$lib/public-rooms/api";
  import { users } from "../stores";
  import { onMount } from "svelte";
  import { HostCapabilities } from "$backend/types";
  import GridViewRoomItem from "$lib/public-rooms/GridViewRoomItem.svelte";
  import { useGame } from "../hooks/useGame";

  const game = useGame();

  let roomFromTheSameHost: PublicRoomInfo | undefined;

  async function getRoomFromTheSameHost() {
    try {
      const hostName = $users.find((u) => u.isHost.has("RoomCreator"))?.name;
      if (!hostName) {
        return;
      }

      const rooms = await getPublicRooms();
      const room = rooms.find((r) => r.hostName === hostName && r.id !== game.roomName);
      if (room) {
        clearInterval(roomCheckInterval);
        roomFromTheSameHost = room;
        onRoomFound(room);
      }
    } catch (error) {
      console.error(error);
    }
  }

  const roomCheckInterval = setInterval(() => {
    getRoomFromTheSameHost();
  }, 10 * 1000);

  onMount(() => {
    getRoomFromTheSameHost();

    setTimeout(() => clearInterval(roomCheckInterval), 2 * 60 * 1000);

    return () => clearInterval(roomCheckInterval);
  });

  export let open = false;
  export let onRoomFound: (room: PublicRoomInfo) => void;
</script>

{#if roomFromTheSameHost && open}
  <div class="bg-popover rounded border p-2 shadow-xl pointer-events-auto">
    <div class="flex flex-col items-center gap-2">
      <p class="text-sm">{t("post.sameHost", $translations)}</p>
      <GridViewRoomItem room={roomFromTheSameHost} openInNewTab />
    </div>
  </div>
{/if}
