<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import UserSettingsForm from "./UserSettingsForm.svelte";
  import type { UserSettingsFormData } from "../../types";
  import { useGame } from "$lib/room/hooks/useGame";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { bgColorPicker, settings } from "$lib/room/stores";

  export let forcedValues: Partial<UserSettingsFormData> = {};

  const game = useGame();

  let userSettingsForm: UserSettingsForm;

  function onFormSubmit(formData: UserSettingsFormData) {
    game.renderer!.setBgCol(formData.bg);

    if (game.connection.isConnected) {
      game.connection.updateUser();
    }

    game.connection.updateToken();

    onSuccess?.();
  }

  function onCancelClick() {
    game.renderer!.setBgCol(settings.snapshot().savedbgcol);
    onCancel?.();
  }

  export let onCancel: () => void;
  export let onSuccess: () => void;
</script>

<Dialog.Header>
  <Dialog.Title>{t("settings.title", $translations)}</Dialog.Title>
</Dialog.Header>

<UserSettingsForm
  {forcedValues}
  bind:this={userSettingsForm}
  on:submit={(x) => onFormSubmit(x.detail.data)}
  dynamicBgColorPicker={true}
  onBgColorPickerClick={(color, texture) => {
    bgColorPicker.showPicker(color, texture);
    onCancel();
  }} />

<Dialog.Footer>
  <Button on:click={onCancelClick} variant="outline" class="w-full sm:w-auto">{t("common.cancel", $translations)}</Button>
  <Button type="submit" on:click={() => userSettingsForm.requestSubmitForm()} class="w-full sm:w-auto">{t("common.ok", $translations)}</Button>
</Dialog.Footer>
