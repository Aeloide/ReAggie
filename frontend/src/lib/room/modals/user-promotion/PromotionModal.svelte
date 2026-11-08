<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import * as Dialog from "$lib/components/ui/dialog";
  import { page } from "$app/stores";
  import PromotionModalContent from "./PromotionModalContent.svelte";
  import { users, settings } from "../../stores";
  import { Button } from "$lib/components/ui/button";
  import { Checkbox } from "$lib/components/ui/checkbox";
  import { Label } from "$lib/components/ui/label";
  import { useGame } from "../../hooks/useGame";
  import DialogRoot from "../DialogRoot.svelte";
  import type { Permission } from "$lib/room/permissions";

  const game = useGame();
  $: user = $users.find((u) => u.id === $page.state.showUserPromotionModal?.userId);

  let permissions: Permission[] = [];
  let activePermissions: Permission[] = [];
  let addAsTrustee = false;
</script>

<DialogRoot stateKey="showUserPromotionModal">
  <Dialog.Header>
    <Dialog.Title>
      {#if user}
        {t("modals.promoteTitle", $translations).split("{name}")[0]}<span style={`color:${user.color}`}>{user.name}</span>{t("modals.promoteTitle", $translations).split("{name}")[1] ?? ""}
      {:else}
        {t("modals.promoteFailed", $translations)}
      {/if}
    </Dialog.Title>
    <Dialog.Description>{t("modals.cannotUndo", $translations)}</Dialog.Description>
  </Dialog.Header>
  {#if user}
    <PromotionModalContent {user} bind:permissions bind:activePermissions />

    {#if user.hasToken}
      <div class="flex items-center space-x-2 px-6 py-2">
        <Checkbox id="add-trustee" bind:checked={addAsTrustee} />
        <Label for="add-trustee" class="text-sm font-normal cursor-pointer">
          {t("modals.addTrustee", $translations)}
        </Label>
      </div>
    {/if}
  {:else}
    <div class="text-center">{t("modals.userNotFound", $translations)}</div>
  {/if}
  <Dialog.Footer>
    <Button on:click={() => history.back()} variant="outline">{t("common.cancel", $translations)}</Button>
    {#if user}
      <Button
        type="submit"
        on:click={() => {
          if (user && permissions !== undefined) {
            game.connection.promote(user.id, permissions);

            // Add to trustees if checkbox is checked
            if (addAsTrustee) {
              game.connection.chat(`/trustid ${user.id} ${activePermissions.join(" ")}`);
            }
          }
          history.back();
        }}>{t("common.confirm", $translations)}</Button>
    {/if}
  </Dialog.Footer>
</DialogRoot>
