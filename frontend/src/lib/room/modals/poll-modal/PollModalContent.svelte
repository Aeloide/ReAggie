<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import Fa from "svelte-fa";
  import { faPlus } from "@fortawesome/free-solid-svg-icons/faPlus";
  import { faMinus } from "@fortawesome/free-solid-svg-icons/faMinus";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";

  export let onCancel: () => void;
  export let onSuccess: (response: { question: string; options: string[] }) => void;

  let question = "";
  let options: string[] = [];
</script>

<Dialog.Header>
  <Dialog.Title>{t("modals.pollTitle", $translations)}</Dialog.Title>
</Dialog.Header>
<div class="flex flex-col gap-2">
  <Input bind:value={question} placeholder={t("modals.pollQuestion", $translations)} />
  {#each options as opt}
    <div class="flex flex-row gap-2 justify-center">
      <Input bind:value={opt} placeholder={t("modals.pollOption", $translations)} />
      <Button on:click={() => (options = options.filter((e) => e != opt))} size="icon" variant="destructive" title={t("modals.removeOption", $translations)}>
        <Fa icon={faMinus} />
      </Button>
    </div>
  {/each}
  {#if options.length < 8}
    <Button on:click={() => (options.push(""), (options = options))} size="icon" class="self-end" title={t("modals.addOption", $translations)}>
      <Fa icon={faPlus} />
    </Button>
  {/if}
</div>

<Dialog.Footer>
  <Button on:click={onCancel} variant="outline">{t("common.cancel", $translations)}</Button>
  <Button
    type="submit"
    disabled={options.length < 2 || question == "" || options.some((o) => o == "")}
    on:click={() => onSuccess({ question, options })}>{t("common.start", $translations)}</Button>
</Dialog.Footer>
