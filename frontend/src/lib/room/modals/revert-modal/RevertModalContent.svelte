<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import ReplayViewer from "$lib/room/post-game-view/replay/ReplayViewer.svelte";
  import { game } from "$room";
  import { buildBinaryRepr, concatArrayBuffers } from "$room/network/serialization";

  export let onCancel: () => void;
  export let onSuccess: () => void;

  let rv: ReplayViewer;
  async function doRevert() {
    const igame = rv.getReplayPlayer().game;
    const bin = buildBinaryRepr(igame.state.groups, igame.state.sets, igame.roomdef.ext?.rotting);
    const buff = concatArrayBuffers([new Uint8Array([0xbb]).buffer, bin]);
    game.connection.wsClient?.send((e) => new Uint8Array(buff));
    onSuccess();
  }
</script>

<Dialog.Header>
  <Dialog.Title>{t("modals.revertTitle", $translations)}</Dialog.Title>
</Dialog.Header>
<div class="flex flex-col gap-2">
  <ReplayViewer bind:this={rv} />
</div>

<Dialog.Footer>
  <Button on:click={onCancel} variant="outline">{t("common.cancel", $translations)}</Button>
  <Button type="submit" on:click={() => doRevert()}>{t("modals.revert", $translations)}</Button>
</Dialog.Footer>
