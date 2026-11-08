<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import * as AlertDialog from "$lib/components/ui/alert-dialog";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import * as Popover from "$lib/components/ui/popover";
  import { Separator } from "$lib/components/ui/separator";
  import { Switch } from "$lib/components/ui/switch";
  import { settings } from "$lib/room/stores";
  import { faArrowsRotate } from "@fortawesome/free-solid-svg-icons/faArrowsRotate";
  import { faFaceMeh } from "@fortawesome/free-solid-svg-icons/faFaceMeh";
  import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons/faMagnifyingGlass";
  import { DataHandler, type Field } from "@vincjo/datatables";
  import Fa from "svelte-fa";
  import { slide } from "svelte/transition";
  import { debounce } from "../../utils";
  import { getPublicRooms, type PublicRoomInfo } from "./api";
  import PublicRoomsGridView from "./PublicRoomsGridView.svelte";
  import PublicRoomsListView from "./PublicRoomsListView.svelte";
  import PublicRoomsViewModeButtons from "./PublicRoomsViewModeButtons.svelte";
  import type { SortValue } from "./types";

  export let sort: SortValue | undefined = undefined;

  const handler = new DataHandler<PublicRoomInfo>();

  $: handler.filter($settings.nsfw, "nsfw", (entry, value) => {
    return value || entry === value;
  });

  const rows = handler.getRows();
  let loading = false;
  let allTotalCount = 0;

  $: {
    if (sort?.identifier && sort?.direction) {
      const orderBy = sort.identifier as Field<PublicRoomInfo>;
      handler.applySort({ orderBy, direction: sort.direction });
    }
  }

  const sortStore = handler.getSort();
  $: syncUserSort($sortStore);

  const syncUserSort = (newSort: SortValue) => {
    if (newSort.identifier != sort?.identifier || newSort.direction != sort?.direction) {
      sort = newSort;
    }
  };

  let secretKey: string | undefined;
  $: secretKey, loadPublicRooms();

  async function loadPublicRooms() {
    loading = true;
    const data = await getPublicRooms(secretKey);
    allTotalCount = data.length;

    // by default sort rooms by players, then by completion
    data.sort((a, b) => {
      if (a.players < b.players) return 1;
      if (a.players > b.players) return -1;
      return a.completion - b.completion;
    });

    handler.setRows(data);

    // restore sort because it's now out of sync (after setRows)
    if (sort) {
      $sortStore = sort;
    }

    loading = false;
  }

  let nsfwDialogOpen = false;

  async function doNSFWPrompt(ev: Event) {
    if (!$settings.nsfw) {
      ev.preventDefault();
      nsfwDialogOpen = true;
    }
  }

  const [setSecretKey] = debounce((key: string) => {
    secretKey = key;
  }, 250);
</script>

<AlertDialog.Root bind:open={nsfwDialogOpen} closeOnOutsideClick>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>{t("rooms.nsfwTitle", $translations)}</AlertDialog.Title>
      <AlertDialog.Description>
        {t("rooms.nsfwDescription", $translations)}
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Action>{t("rooms.under18", $translations)}</AlertDialog.Action>
      <AlertDialog.Cancel on:click={() => ($settings.nsfw = true)}>{t("rooms.understood", $translations)}</AlertDialog.Cancel>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>

<div class="flex flex-col gap-4 p-4">
  <div class="flex flex-col sm:flex-row gap-2 justify-between items-center">
    <h3 class="text-2xl font-bold hidden sm:block">{t("rooms.title", $translations)}</h3>
    <div class="flex items-center flex-wrap gap-1">
      <div class="flex items-center space-x-2 mr-6">
        <Switch
          id="nsfw-toggle"
          bind:checked={$settings.nsfw}
          on:click={doNSFWPrompt}
          class="data-[state=checked]:bg-red-700 data-[state=unchecked]:bg-primary"
          thumbClass="data-[state=checked]:bg-primary" />
        <Label for="nsfw-toggle">NSFW</Label>
      </div>

      <PublicRoomsViewModeButtons bind:value={$settings.publicRoomsView} />

      <Separator orientation="vertical" class="h-6" />

      <Popover.Root>
        <Popover.Trigger asChild let:builder>
          <Button size="icon" variant="ghost" builders={[builder]}>
            <Fa icon={faMagnifyingGlass} />
          </Button>
        </Popover.Trigger>
        <Popover.Content class="p-1 w-48">
          <Input
            class="w-full"
            type="text"
            placeholder={t("rooms.secretKeySearch", $translations)}
            spellcheck="false"
            maxlength={25}
            on:keyup={(e) => setSecretKey(e.currentTarget.value)} />
        </Popover.Content>
      </Popover.Root>
      <Button variant="ghost" on:click={() => loadPublicRooms()} class="gap-2">
        <Fa icon={faArrowsRotate} />
        <span class="hidden sm:block">{t("rooms.refresh", $translations)}</span>
      </Button>
    </div>
  </div>

  {#if !loading && $rows.length === 0}
    <div transition:slide={{ duration: 150 }} class="flex flex-col gap-2 my-6">
      <Fa icon={faFaceMeh} size="5x" />
      <h3 class="text-center font-bold text-2xl">{t("rooms.empty", $translations)}</h3>
      <p class="text-center text-sm">{t("rooms.emptyDescription", $translations)}</p>
    </div>
  {:else if $settings.publicRoomsView === "list"}
    <PublicRoomsListView {loading} {handler} />
  {:else}
    <PublicRoomsGridView {loading} {handler} />
  {/if}
</div>

{#if allTotalCount > $rows.length}
  <div class="flex justify-center mt-2 mb-4">
    <Button variant="outline" on:click={doNSFWPrompt}>
      {t("rooms.loadNsfw", $translations).replace("{count}", String(allTotalCount - $rows.length))}
    </Button>
  </div>
{/if}
