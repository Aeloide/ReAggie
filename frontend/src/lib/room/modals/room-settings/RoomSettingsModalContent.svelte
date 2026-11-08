<script context="module" lang="ts">
  export interface RoomSettingsFormData {
    disableImagePreview: boolean;
    votekick: boolean;
    noMultiSelect: boolean;
    noLockUnlock: boolean;
    noRectSelect: boolean;
    noStack: boolean;
    jigchan: boolean;
  }
</script>

<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import Fa from "svelte-fa";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { roomDef } from "$lib/room/stores";
  import { onDestroy } from "svelte";
  import Checkbox from "$lib/create-room/Checkbox.svelte";
  import Separator from "$lib/components/ui/separator/separator.svelte";
  import { faExclamationTriangle } from "@fortawesome/free-solid-svg-icons/faExclamationTriangle";

  export let onCancel: () => void;
  export let onSuccess: (response: RoomSettingsFormData) => void;
  export let onUnblockAllClick: () => void;

  let formData: RoomSettingsFormData;
  let areUsersUnblocked = false;

  const roomDefSyncUnsubscribe = roomDef.subscribe((rd) => {
    formData = {
      disableImagePreview: rd?.hidePreview || false,
      votekick: rd?.votekick || false,
      noMultiSelect: rd?.nomultiselect || false,
      noLockUnlock: rd?.nolockunlock || false,
      noRectSelect: rd?.norectselect || false,
      noStack: rd?.nostack || false,
      jigchan: rd?.jigchan || false,
    };
  });

  onDestroy(() => {
    roomDefSyncUnsubscribe();
  });

  function handleUnblockAllClick() {
    onUnblockAllClick();
    areUsersUnblocked = true;
  }
</script>

<Dialog.Header>
  <Dialog.Title>{t("modals.roomSettingsTitle", $translations)}</Dialog.Title>
  <Dialog.Description>{t("modals.roomSettingsDescription", $translations)}</Dialog.Description>
</Dialog.Header>

<Checkbox id="preview" bind:checked={formData.disableImagePreview} label={t("createRoom.disablePreview", $translations)} />
<Checkbox id="votekick" bind:checked={formData.votekick} label={t("createRoom.voteKick", $translations)} description={t("createRoom.voteKickDescription", $translations)} />

<div class="flex items-center border rounded-sm p-2">
  <Fa icon={faExclamationTriangle} class="mr-2" />
  <span class="text-sm">{t("modals.notForCreator", $translations)}</span>
</div>

<Checkbox id="nomultisel" bind:checked={formData.noMultiSelect} label={t("createRoom.noMultiSelect", $translations)} />
<Checkbox
  id="nolock"
  bind:checked={formData.noLockUnlock}
  label={t("createRoom.noLock", $translations)}
  description={t("modals.noLockHelp", $translations)} />
<Checkbox id="norect" bind:checked={formData.noRectSelect} label={t("createRoom.noRectangle", $translations)} />
<Checkbox id="nostack" bind:checked={formData.noStack} label={t("createRoom.noStack", $translations)} />

{#if $roomDef?.juke}
  <Checkbox
    id="jigchan"
    bind:checked={formData.jigchan}
    label={t("createRoom.jigchan", $translations)}
    description={t("modals.jigchanHelp", $translations)} />
{/if}

<Separator class="w-full" />

<Button disabled={areUsersUnblocked} variant="secondary" on:click={handleUnblockAllClick}>
  {areUsersUnblocked ? t("modals.clearedBlocks", $translations) : t("modals.unblockAll", $translations)}
</Button>

<Dialog.Footer>
  <Button on:click={onCancel} variant="outline">{t("common.cancel", $translations)}</Button>
  <Button type="submit" on:click={() => onSuccess(formData)}>{t("common.ok", $translations)}</Button>
</Dialog.Footer>
