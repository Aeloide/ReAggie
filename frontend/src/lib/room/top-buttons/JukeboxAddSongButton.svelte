<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import Fa from "svelte-fa";
  import { faPlus } from "@fortawesome/free-solid-svg-icons/faPlus";
  import { jukebox } from "$lib/room/stores";
  import { useGame } from "../hooks/useGame";
  import { Button } from "$lib/components/ui/button";
  import * as Popover from "$lib/components/ui/popover";
  import AddSongPanel from "../jukebox/AddSongPanel.svelte";

  const game = useGame();

  function onSongAdded(e: CustomEvent<{ op: string; url: string; bid: number }>) {
    const { op, url, bid } = e.detail;
    game.connection.chat(`/pl${op} ${bid} ${url}`);
  }

  let open = false;
  // $: if (!open) (document.activeElement as any)?.blur();
</script>

<Popover.Root bind:open>
  <Popover.Trigger asChild let:builder>
    <Button size="icon-menu" variant={open ? "default" : "outline"} tabindex={-1} title={t("menu.addSong", $translations)} builders={[builder]}>
      <Fa icon={faPlus} class="mr-1.5" />
      <span>{$jukebox.qty}₽/{$jukebox.minprice + 1}₽</span>
    </Button>
  </Popover.Trigger>
  <Popover.Content class="p-1 w-64 md:w-96">
    <AddSongPanel balance={$jukebox.qty} minPrice={$jukebox.minprice} on:songAdded={onSongAdded} />
  </Popover.Content>
</Popover.Root>
