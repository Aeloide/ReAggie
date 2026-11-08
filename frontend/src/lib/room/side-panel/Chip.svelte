<script lang="ts">
  import Fa from "svelte-fa";
  import { faXmark } from "@fortawesome/free-solid-svg-icons/faXmark";
  import { Button } from "$lib/components/ui/button";

  export let onClose: () => void;
</script>

<div class="flex items-center gap-1.5 select-none border rounded-lg bg-background/60 py-1 pl-2.5 pr-1 text-xs font-bold">
  <slot />
  <Button size="icon" variant="ghost" class="size-5" on:click={onClose}>
    <Fa icon={faXmark} />
  </Button>
</div>
