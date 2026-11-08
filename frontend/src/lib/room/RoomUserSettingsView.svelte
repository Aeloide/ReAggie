<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import { Button } from "$lib/components/ui/button";
  import Header from "../../routes/Header.svelte";
  import UserSettingsForm from "./modals/user-settings/UserSettingsForm.svelte";

  let userSettingsForm: UserSettingsForm;
</script>

<section class="h-screen my-4">
  <Header />
  <div class="mt-4 mx-auto w-full sm:max-w-4xl">
    <div class="bg-popover rounded border p-3 sm:p-6 shadow-xl">
      <UserSettingsForm bind:this={userSettingsForm} />

      <div class="flex items-center justify-center mt-4">
        <Button size="lg" on:click={() => userSettingsForm.requestSubmitForm()}>{t("status.joinRoom", $translations)}</Button>
      </div>
    </div>
  </div>
</section>
