<script lang="ts">
  import PollModalContent from "./PollModalContent.svelte";
  import DialogRoot from "../DialogRoot.svelte";

  export let onSuccess: (response: { question: string; options: string[] }) => void;
</script>

<DialogRoot stateKey="showPollModal">
  <PollModalContent
    onCancel={() => history.back()}
    onSuccess={({ question, options }) => {
      onSuccess({ question, options });
      history.back();
    }} />
</DialogRoot>
