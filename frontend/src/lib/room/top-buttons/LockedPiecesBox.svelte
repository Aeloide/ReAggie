<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import Fa from "svelte-fa";
  import { faLock } from "@fortawesome/free-solid-svg-icons/faLock";
  import { faUnlock } from "@fortawesome/free-solid-svg-icons/faUnlock";
  import { roomState } from "$lib/room/stores";
  import { useGame } from "../hooks/useGame";
  import * as Popover from "$lib/components/ui/popover";
  import { Button } from "$lib/components/ui/button";

  const game = useGame();
</script>

<Popover.Root>
  <Popover.Trigger asChild let:builder>
    <Button size="icon-menu" variant="outline" title={t("menu.lockedPieces", $translations)} builders={[builder]}>
      <Fa icon={faLock} class="mr-1.5" />
      <span>{$roomState.lockedPiecesCount}</span>
    </Button>
  </Popover.Trigger>
  <Popover.Content class="p-1 w-auto">
    <Button class="gap-2" on:click={() => game.actions.unlockAllPieces()}>
      <Fa icon={faUnlock} />
      <span>{t("menu.unlockAll", $translations)}</span>
    </Button>
  </Popover.Content>
</Popover.Root>
