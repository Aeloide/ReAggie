<script lang="ts">
  import UserSettingsModalForm from "./UserSettingsModalForm.svelte";
  import DialogRoot from "../DialogRoot.svelte";
  import { page } from "$app/stores";
  import type { UserSettingsFormData } from "$lib/room/types";

  function getForcedValues(): Partial<UserSettingsFormData> {
    const bgColor = $page.state.showUserSettingsModal?.bgColor;
    const bgTexture = $page.state.showUserSettingsModal?.bgTexture;
    if (bgColor) {
      return { bg: bgColor, bgTexture } satisfies Partial<UserSettingsFormData>;
    }

    return {};
  }
</script>

<DialogRoot stateKey="showUserSettingsModal" class="sm:max-w-4xl">
  <UserSettingsModalForm forcedValues={getForcedValues()} onCancel={() => history.back()} onSuccess={() => history.back()} />
</DialogRoot>
