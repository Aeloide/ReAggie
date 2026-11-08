<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import * as Dialog from "$lib/components/ui/dialog";
  import { page } from "$app/stores";
  import { users } from "../../stores";
  import { Button } from "$lib/components/ui/button";
  import { useGame } from "../../hooks/useGame";
  import DialogRoot from "../DialogRoot.svelte";
  import FollowModalContent from "./FollowModalContent.svelte";

  const game = useGame();
  $: user = $users.find((u) => u.id === $page.state.showFollowModal?.userId);

  let events: number = 0;
</script>

<DialogRoot stateKey="showFollowModal">
  <Dialog.Header>
    <Dialog.Title>
      {#if user}
        {t("modals.followTitle", $translations).split("{name}")[0]}<span style={`color:${user.color}`}>{user.name}</span>{t("modals.followTitle", $translations).split("{name}")[1] ?? ""}
      {:else}
        {t("modals.followFailed", $translations)}
      {/if}
    </Dialog.Title>
  </Dialog.Header>
  {#if user}
    <FollowModalContent {user} bind:events />
  {:else}
    <div class="text-center">{t("modals.userNotFound", $translations)}</div>
  {/if}
  <Dialog.Footer>
    <Button on:click={() => history.back()} variant="outline">{t("common.cancel", $translations)}</Button>
    {#if user}
      <Button
        type="submit"
        on:click={() => {
          if (user && events) {
            game.connection.chat(`/requestfollowid ${user.id} ${events}`);
          }
          history.back();
        }}>{t("common.confirm", $translations)}</Button>
    {/if}
  </Dialog.Footer>
</DialogRoot>
