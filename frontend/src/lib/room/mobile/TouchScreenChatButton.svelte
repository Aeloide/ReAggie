<script lang="ts">
  import Fa from "svelte-fa";
  import { faComments } from "@fortawesome/free-solid-svg-icons/faComments";
  import { chatInput } from "../side-panel/chatInputStore";
  import { Button } from "$lib/components/ui/button";
</script>

{#if !$chatInput.visible}
  <div class="absolute bottom-[6px] right-2">
    <Button size="icon" variant="ghost" on:click={() => chatInput.setVisible(true)} class="rounded-full pointer-events-auto">
      <Fa icon={faComments} />
    </Button>
  </div>
{/if}
