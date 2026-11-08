<script lang="ts">
  import RoomSettingsModalContent from "./RoomSettingsModalContent.svelte";
  import { useGame } from "$lib/room/hooks/useGame";
  import { settings } from "$lib/room/stores";
  import DialogRoot from "../DialogRoot.svelte";

  const game = useGame();
</script>

<DialogRoot stateKey="showRoomSettingsModal">
  <RoomSettingsModalContent
    onCancel={() => history.back()}
    onSuccess={(formData) => {
      const secret = $settings.secretforthisroom;
      if (secret) {
        game.connection.changeRules(
          secret,
          formData.disableImagePreview,
          formData.votekick,
          formData.noMultiSelect,
          formData.noLockUnlock,
          formData.noRectSelect,
          formData.noStack,
          formData.jigchan,
        );
      }
      history.back();
    }}
    onUnblockAllClick={() => {
      const secret = $settings.secretforthisroom;
      if (secret) {
        game.connection.unkickAll(secret);
      }
    }} />
</DialogRoot>
