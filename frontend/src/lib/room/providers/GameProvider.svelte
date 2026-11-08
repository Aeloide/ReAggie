<script lang="ts">
  import { createGame, initGame } from "$room";
  import { onMount, setContext } from "svelte";
  import { resetRoomStores, settings } from "../stores";

  export let roomName: string;

  const game = setContext("game", createGame());

  onMount(() => {
    settings.init(roomName);
    initGame(game, roomName);

    return () => {
      game.destroy();
      resetRoomStores();
    };
  });
</script>

<slot />
