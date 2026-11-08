<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import * as Dialog from "$lib/components/ui/dialog";
  import { page } from "$app/stores";
  import { users, settings } from "../../stores";
  import { Button } from "$lib/components/ui/button";
  import { useGame } from "../../hooks/useGame";
  import DialogRoot from "../DialogRoot.svelte";
  import MuteModalContent from "./MuteModalContent.svelte";

  const game = useGame();
  $: user = $users.find((u) => u.id === $page.state.showUserMuteModal?.userId);

  let mutetype: { type: "asn" } | { type: "ip"; range: "exact" | "narrow" | "large" } = { type: "ip", range: "exact" };
</script>

<DialogRoot stateKey="showUserMuteModal">
  <Dialog.Header>
    <Dialog.Title>
      {#if user}
        {t("modals.muteTitle", $translations).split("{name}")[0]}<span style={`color:${user.color}`}>{user.name}</span>{t("modals.muteTitle", $translations).split("{name}")[1] ?? ""}
      {:else}
        {t("modals.muteFailed", $translations)}
      {/if}
    </Dialog.Title>
  </Dialog.Header>
  {#if user}
    <MuteModalContent {user} bind:mutetype />
  {:else}
    <div class="text-center">{t("modals.userNotFound", $translations)}</div>
  {/if}
  <Dialog.Footer>
    <Button on:click={() => history.back()} variant="outline">{t("common.cancel", $translations)}</Button>
    {#if user}
      <Button
        type="submit"
        on:click={() => {
          if (user && mutetype) {
            // Send mute command immediately if in a room
            game.connection.mute(user.id, mutetype);

            // Queue the mute command for persistence
            settings.update((s) => {
              s.pending_mute_commands = [
                ...(s.pending_mute_commands || []),
                {
                  action: "mute",
                  userId: user.id,
                  userName: user.name,
                  type: mutetype.type,
                  range: mutetype.type === "ip" ? mutetype.range : undefined,
                  timestamp: Date.now(),
                },
              ];

              // Add to mutelist
              s.mutelist = [
                ...(s.mutelist || []),
                {
                  userId: user.id,
                  userName: user.name,
                  type: mutetype.type,
                  range: mutetype.type === "ip" ? mutetype.range : undefined,
                  timestamp: Date.now(),
                },
              ];
              return s;
            });
          }
          history.back();
        }}>{t("common.confirm", $translations)}</Button>
    {/if}
  </Dialog.Footer>
</DialogRoot>
