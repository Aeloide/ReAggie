<script lang="ts">
  import type { VideoOptions } from "./ReplayRecordingOptionsModalContent.svelte";
  import ReplayRecordingOptionsModalContent from "./ReplayRecordingOptionsModalContent.svelte";
  import DialogRoot from "../DialogRoot.svelte";

  export let onSuccess: (response: VideoOptions) => void;
</script>

<DialogRoot stateKey="showReplayRecordingOptions" class="md:w-72">
  <ReplayRecordingOptionsModalContent
    onCancel={() => history.back()}
    onSuccess={(options) => {
      onSuccess(options);
      history.back();
    }} />
</DialogRoot>
