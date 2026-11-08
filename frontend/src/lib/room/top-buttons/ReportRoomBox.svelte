<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import Fa from "svelte-fa";
  import { faFlag } from "@fortawesome/free-solid-svg-icons/faFlag";
  import { ROOM_NAME } from "../../../room";
  import { roomDef } from "../stores";
  import { toast } from "svelte-sonner";
  import { pushState } from "$app/navigation";
  import ReportRoomModal from "../modals/report-room/ReportRoomModal.svelte";
  import { Button } from "$lib/components/ui/button";

  async function onModalSuccess(reason: string) {
    if (!reason) return;

    try {
      const response = await fetch(`${location.origin}/report/${ROOM_NAME}?reason=${btoa(reason)}`);

      if (response.ok) {
        localStorage["reported" + ROOM_NAME] = "y";
        isReported = true;
        toast.success(t("menu.reportSubmitted", $translations));
      } else {
        toast.error(t("menu.tryLater", $translations));
      }
    } catch (error) {
      toast.error(t("menu.tryLater", $translations));
    }
  }

  $: isReported = $roomDef?.ext?.reported || localStorage["reported" + ROOM_NAME];
</script>

<ReportRoomModal onSuccess={onModalSuccess} />

<Button
  size="icon-menu"
  variant="destructive"
  disabled={isReported}
  title={isReported ? t("menu.alreadyReported", $translations) : t("menu.reportRoom", $translations)}
  on:click={() => pushState("", { showReportRoomModal: true })}>
  <Fa icon={faFlag} />
</Button>
