<script lang="ts">
  import ReportRoomModalContent from "./ReportRoomModalContent.svelte";
  import DialogRoot from "../DialogRoot.svelte";

  export let onSuccess: (reason: string) => void;
</script>

<DialogRoot stateKey="showReportRoomModal">
  <ReportRoomModalContent
    onCancel={() => history.back()}
    onSuccess={(reason) => {
      onSuccess(reason);
      history.back();
    }} />
</DialogRoot>
