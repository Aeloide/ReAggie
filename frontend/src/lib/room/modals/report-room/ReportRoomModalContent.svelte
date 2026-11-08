<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Button } from "$lib/components/ui/button";

  // Infraction codes are now in the <select> element.
  // Initialize formData.code with a default valid value.
  const formData = {
    code: "", // Default value for the select dropdown
    reason: "",
  };

  let form: HTMLFormElement;

  // The checkCodeValidity function is no longer needed because the
  // <select> element restricts choices to valid options.

  function onFormSubmit(): void {
    if (!form) return;
    if (!form.reportValidity()) return;
    const reason = formData.code + "|" + formData.reason;
    onSuccess(reason);
  }

  export let onCancel: () => void;
  export let onSuccess: (reason: string) => void;

  function fixup() {
    formData.code = "1280131407";
  }
</script>

<Dialog.Header>
  <Dialog.Title>{t("modals.reportTitle", $translations)}</Dialog.Title>
  <Dialog.Description>{t("modals.reportDescription", $translations)}</Dialog.Description>
</Dialog.Header>

<form bind:this={form} class="flex flex-col gap-4">
  <div class="grid w-full items-center gap-1.5">
    <Label for="icode">
      {t("modals.infractionType", $translations)}
      <Button size="icon" class="size-auto" variant="link" title={t("modals.readRules", $translations)} href="/rules" target="_blank">(?)</Button>
    </Label>
    {#if formData.code === "3131746989"}
      <p>{t("modals.fictionHint", $translations).split("{link}")[0]}<a class="fixup" on:click={fixup}>{t("modals.fictionLink", $translations)}</a>{t("modals.fictionHint", $translations).split("{link}")[1] ?? ""}</p>
    {/if}

    <select
      id="icode"
      required
      bind:value={formData.code}
      class="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:focus:border-blue-500">
      <option disabled selected>{t("modals.selectCategory", $translations)}</option>
      <option value="3131746989">CSAM</option>
      <option value="1280131407">{t("modals.catFiction", $translations)}</option>
      <option value="184594741">{t("modals.catEvasion", $translations)}</option>
      <option value="3405689018">{t("modals.catScripts", $translations)}</option>
    </select>
  </div>
  <div class="grid w-full items-center gap-1.5">
    <Label for="additional">{t("modals.reasonLabel", $translations)}</Label>
    <Input id="additional" placeholder={t("modals.reasonPlaceholder", $translations)} bind:value={formData.reason} />
  </div>
</form>

<Dialog.Footer>
  <Button on:click={onCancel} variant="outline">{t("common.cancel", $translations)}</Button>
  <Button type="submit" on:click={onFormSubmit}>{t("common.submit", $translations)}</Button>
</Dialog.Footer>

<style scoped>
  @keyframes rainbow {
    0% {
      background-position: 0% 50%;
    }
    50% {
      background-position: 100% 25%;
    }
    100% {
      background-position: 0% 50%;
    }
  }

  .fun {
    font-family: "Comic Sans MS", "Comic Sans", "Comic", cursive;
    background-image: repeating-linear-gradient(45deg, violet, indigo, blue, green, yellow, orange, red, violet);
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    animation: rainbow 8s ease infinite;
    background-size: 800% 800%;
    font-size: 24px;
  }

  .sec {
    font-size: medium;
    text-align: center;
  }

  h1 {
    padding-bottom: 5px;
    text-align: center;
  }

  .fixup {
    cursor: pointer;
    color: blue;
    text-decoration: underline;
    font-weight: bolder;
  }
</style>
