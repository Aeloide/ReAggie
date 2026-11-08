<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import * as Dialog from "$lib/components/ui/dialog";
  import { page } from "$app/stores";
  import FollowRequestModalContent from "./FollowRequestModalContent.svelte";
  import { users, settings } from "../../stores";
  import { Button } from "$lib/components/ui/button";
  import { useGame } from "../../hooks/useGame";
  import DialogRoot from "../DialogRoot.svelte";
  import type { User } from "$backend/types";

  const game = useGame();

  let error = "";

  async function setupRegistration() {
    try {
      const reg = await navigator.serviceWorker.register("/service-worker.js");
      const serverkey: { vapid: string } = await (await fetch("/api/vapid")).json();
      const sub = await reg.pushManager.subscribe({
        applicationServerKey: serverkey.vapid,
        userVisibleOnly: true,
      });
      game.connection.raw({ type: "sub", sub });
      return true;
    } catch (e) {
      console.error(e);
      error = t("modals.notificationsFailed", $translations) + (e instanceof Error ? e.message : String(e));
      return false;
    }
  }
  $: user = $users.find((u) => u.id === $page.state.showUserFollowRequestModal?.userId);

  let events = 0;
</script>

<DialogRoot stateKey="showUserFollowRequestModal">
  <Dialog.Header>
    <Dialog.Title>
      {#if user}
        {t("modals.followTitle", $translations).split("{name}")[0]}<span style={`color:${user.color}`}>{user.name}</span>{t("modals.followTitle", $translations).split("{name}")[1] ?? ""}
      {:else}
        {t("modals.followRequestFailed", $translations)}
      {/if}
    </Dialog.Title>
    <Dialog.Description>{t("modals.followRequestSelect", $translations)}</Dialog.Description>
  </Dialog.Header>
  {#if user}
    <FollowRequestModalContent {user} bind:events />
  {:else}
    <div class="text-center">{t("modals.userNotFound", $translations)}</div>
  {/if}
  {#if error}
    <div class="text-red-500 text-sm text-center mb-2">{error}</div>
  {/if}
  <Dialog.Footer>
    <Button on:click={() => history.back()} variant="outline">{t("common.cancel", $translations)}</Button>
    {#if user}
      <Button
        type="submit"
        disabled={events === 0}
        on:click={async () => {
          if (user && events > 0) {
            error = "";
            if (!(await setupRegistration())) return;
            game.connection.requestFollow(user.id, events);

            // Add to following list optimistically
            settings.update((s) => {
              const following = s.following || [];
              const alreadyFollowing = following.some((f) => f.userId === user.id);

              if (!alreadyFollowing) {
                s.following = [
                  ...following,
                  {
                    userId: user.id,
                    userName: user.name,
                    timestamp: Date.now(),
                  },
                ];
              }
              return s;
            });
          }
          history.back();
        }}>{t("modals.sendRequest", $translations)}</Button>
    {/if}
  </Dialog.Footer>
</DialogRoot>
