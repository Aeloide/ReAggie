<script lang="ts">
  import DialogRoot from "../DialogRoot.svelte";
  import HelpModalContent from "./HelpModalContent.svelte";
</script>

<DialogRoot stateKey="showHelpModal">
  <HelpModalContent onClose={() => history.back()} />
</DialogRoot>
