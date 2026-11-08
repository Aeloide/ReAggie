<script lang="ts">
  import DialogRoot from "../DialogRoot.svelte";
  import RevertModalContent from "./RevertModalContent.svelte";

</script>

<DialogRoot stateKey="showRevertModal">
  <RevertModalContent
    onCancel={() => history.back()}
    onSuccess={() => {
      history.back()
    }} />
</DialogRoot>
