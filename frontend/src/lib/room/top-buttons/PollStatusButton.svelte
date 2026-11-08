<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import Fa from "svelte-fa";
  import { faPoll } from "@fortawesome/free-solid-svg-icons/faPoll";
  import { faCheckCircle } from "@fortawesome/free-solid-svg-icons/faCheckCircle";
  import { pollStore, settings } from "../stores";
  import * as Popover from "$lib/components/ui/popover";
  import { Button } from "$lib/components/ui/button";
  import { useGame } from "../hooks/useGame";

  const game = useGame();
</script>

<Popover.Root>
  <Popover.Trigger asChild let:builder>
    <Button
      size="icon-menu"
      variant="outline"
      class="max-w-[calc(100vw-min(450px,40vw))]"
      title={`Poll: "${$pollStore.question}"`}
      builders={[builder]}>
      <Fa icon={faPoll} class="mr-1.5" />
      <span class="overflow-hidden text-ellipsis">
        {#if $settings.renderer === "gpu4"}
          Poll: "{$pollStore.question}"
        {:else}
          You need to switch to the "Quality" renderer to participate in the poll
        {/if}
      </span>
    </Button>
  </Popover.Trigger>
  <Popover.Content class="p-1 w-auto">
    <Button class="gap-2" on:click={() => game.connection.chat("/stoppoll")}>
      <Fa icon={faCheckCircle} />
      <span>{t("menu.stopPoll", $translations)}</span>
    </Button>
  </Popover.Content>
</Popover.Root>
