<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import { Button } from "$lib/components/ui/button";
  import { Fa } from "svelte-fa";
  import { faList } from "@fortawesome/free-solid-svg-icons/faList";
  import { faGrip } from "@fortawesome/free-solid-svg-icons/faGrip";

  export let value: string;
</script>

<div class="grid grid-cols-2 gap-0.5">
  {#each ["list", "grid"] as val}
    <Button
      size="icon"
      variant={value === val ? "secondary" : "ghost"}
      on:click={() => (value = val)}
      title={val === "list" ? t("rooms.listView", $translations) : t("rooms.gridView", $translations)}>
      <Fa icon={val === "list" ? faList : faGrip} />
    </Button>
  {/each}
</div>
