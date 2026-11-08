<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import { goto } from "$app/navigation";
  import * as AlertDialog from "$lib/components/ui/alert-dialog";
  import { onDestroy } from "svelte";
  import { toast, type ExternalToast } from "svelte-sonner";
  import { useGame } from "./hooks/useGame";
  import { gameStatus } from "./stores";

  const game = useGame();

  $: $gameStatus, updateLoader();

  let lastToastId: string | number | undefined;

  function getToastData(): ExternalToast {
    return {
      id: lastToastId,
      position: "top-center",
      duration: Number.POSITIVE_INFINITY,
      action: {
        label: t("status.cancel", $translations),
        onClick: () => {
          history.back();
        },
      },
    };
  }

  function updateLoader() {
    const status = $gameStatus.status;

    switch (status) {
      case "connecting":
        const isReconnecting = (game?.connection?.reconnectAttempt || 0) > 0;
        const connectingText = isReconnecting ? t("status.reconnecting", $translations).replace("{attempt}", String(game.connection.reconnectAttempt)) : t("status.connecting", $translations);
        lastToastId = toast.loading(`${connectingText}...`, getToastData());
        break;
      case "loading":
        const loadingProgress = $gameStatus.text;
        const loadingText = loadingProgress ? t("status.loadingProgress", $translations).replace("{progress}", loadingProgress) : t("status.loading", $translations);
        lastToastId = toast.loading(loadingText, getToastData());
        break;
      default:
        toast.dismiss(lastToastId);
        break;
    }
  }

  onDestroy(() => {
    if (lastToastId !== undefined) {
      toast.dismiss(lastToastId);
    }
  });
</script>

{#if $gameStatus.status === "error"}
  <AlertDialog.Root open>
    <AlertDialog.Content>
      <AlertDialog.Header>
        <AlertDialog.Title class="capitalize">{t("status.error", $translations)}</AlertDialog.Title>
        <AlertDialog.Description>
          {$gameStatus.text}
        </AlertDialog.Description>
      </AlertDialog.Header>
      <AlertDialog.Footer>
        <AlertDialog.Cancel>{t("common.close", $translations)}</AlertDialog.Cancel>
      </AlertDialog.Footer>
    </AlertDialog.Content>
  </AlertDialog.Root>
{/if}
