<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import Fa from "svelte-fa";
  import { faComputer } from "@fortawesome/free-solid-svg-icons/faComputer";
  import { faMobileScreen } from "@fortawesome/free-solid-svg-icons/faMobileScreen";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import * as Tabs from "$lib/components/ui/tabs";
  import { settings } from "$lib/room/stores";
  import { isTouchScreenQuery } from "$lib/utils";
  import Separator from "$lib/components/ui/separator/separator.svelte";

  export let onClose: () => void;

  let selectedTab = "desktop";

  const isTouchScreen = isTouchScreenQuery();
  $: syncTab($isTouchScreen);

  function syncTab(isMobile: boolean) {
    selectedTab = isMobile ? "mobile" : "desktop";
  }
</script>

<Dialog.Header>
  <Dialog.Title>{t("help.title", $translations)}</Dialog.Title>
</Dialog.Header>

<div class="space-y-4">
  <ul class="text-sm">
    <li>{t("help.invite", $translations)}</li>
    <li>{t("help.cog", $translations)}</li>
  </ul>

  <div class="flex justify-center">
    <Button
      size="lg"
      on:click={() => {
        onClose();
        settings.update((s) => {
          s.helpDismissed = "no";
          return s;
        });
      }}>{t("help.runTour", $translations)}</Button>
  </div>

  <Separator />

  <Tabs.Root bind:value={selectedTab} class="flex flex-col my-4">
    <Tabs.List class="mx-auto size-auto">
      <Tabs.Trigger value="desktop" class="gap-2 px-4 py-1.5">
        <Fa icon={faComputer} />
        {t("help.desktop", $translations)}
      </Tabs.Trigger>
      <Tabs.Trigger value="mobile" class="gap-2 px-4 py-1.5">
        <Fa icon={faMobileScreen} />
        {t("help.mobile", $translations)}
      </Tabs.Trigger>
    </Tabs.List>
    <Tabs.Content value={selectedTab} class="text-sm p-2">
      {#if selectedTab === "desktop"}
        <ol class="list-decimal">
          <li>{@html t("help.d1", $translations)}</li>
          <li>{@html t("help.d2", $translations)}</li>
          <li>{@html t("help.d3", $translations)}</li>
          <li>{@html t("help.d4", $translations)}</li>
          <li>{@html t("help.d5", $translations)}</li>
          <li>{@html t("help.d6", $translations)}</li>
          <li>{@html t("help.d7", $translations)}</li>
          <li>{@html t("help.d8", $translations)}</li>
        </ol>
      {:else}
        <ol class="list-decimal">
          <li>{@html t("help.m1", $translations)}</li>
          <li>{@html t("help.m2", $translations)}</li>
          <li>{@html t("help.m3", $translations)}</li>
          <li>{@html t("help.m4", $translations)}</li>
          <li>{@html t("help.m5", $translations)}</li>
          <li>{@html t("help.m6", $translations)}</li>
        </ol>
      {/if}
    </Tabs.Content>
  </Tabs.Root>

  <Separator />

  <div>
    <h3 class="font-semibold">{t("help.chatCommands", $translations)}</h3>
    <p class="text-sm">{t("help.chatHelp", $translations)}</p>
  </div>
</div>

<Dialog.Footer>
  <Button on:click={onClose} variant="outline">{t("common.close", $translations)}</Button>
</Dialog.Footer>

<style lang="postcss">
  :global(.kbd) {
    @apply bg-foreground text-background rounded px-1;
  }
</style>
