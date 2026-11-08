<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import Fa from "svelte-fa";
  import { faPuzzlePiece } from "@fortawesome/free-solid-svg-icons/faPuzzlePiece";
  import { roomDef, roomState } from "$lib/room/stores";
  import { Button } from "$lib/components/ui/button";
</script>

{#if $roomDef?.pieces}
  <Button
    variant="outline"
    size="icon-menu"
    class="disabled:opacity-100 cursor-default"
    title={t("menu.piecesDone", $translations).replace("{pieces}", String($roomDef.pieces)).replace("{percent}", $roomState.donePercent.toFixed())}
    >
    <Fa icon={faPuzzlePiece} class="mr-1.5" />
    {$roomDef.pieces}
  </Button>
{/if}
