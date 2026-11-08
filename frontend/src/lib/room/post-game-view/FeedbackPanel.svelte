<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import { faGitAlt } from "@fortawesome/free-brands-svg-icons/faGitAlt";
  import { faEnvelope } from "@fortawesome/free-solid-svg-icons/faEnvelope";
  import Fa from "svelte-fa";
  import chpicUrl from "$lib/assets/chpic.webp";
  import { ROOM_NAME } from "$room";
  import { settings } from "../stores";
  import { modalBodyEvents } from "$lib/directives";
  import Separator from "$lib/components/ui/separator/separator.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Textarea } from "$lib/components/ui/textarea";
  import { sendNotification } from "../../../utils";

  let currentMessage = "";
  let sent = false;

  function addMessage(e: SubmitEvent): void {
    e.preventDefault();

    sent = true;
    sendNotification(`${ROOM_NAME} - ${$settings.savedname}`, "\n\n" + (currentMessage.trim() || "Message left intentionally empty???"));
    currentMessage = "";
  }
</script>

<div class="bg-popover rounded border p-2 shadow-xl md:w-[32rem] pointer-events-auto">
  <div class="flex flex-col">
    <div class="flex flex-col items-center sm:flex-row gap-2">
      <div class="flex flex-col items-center justify-center grow">
        <p class="h3">{t("post.anyFeedback", $translations)}</p>
        <p class="h3">{t("post.loveToHear", $translations)}</p>
      </div>
      <img class="row-span-2" src={chpicUrl} alt="chpic" height="100" width="100" />
    </div>
    <Separator class="mb-2" />
    <div class="grid grid-cols-2 items-center gap-2">
      <Button variant="secondary" class="gap-2" title={t("post.reportIssue", $translations)} href="https://git.coom.tech/coomdev/reaggie/issues" target="_blank">
        <Fa icon={faGitAlt} size="lg" />
        <span class="hidden sm:block">{t("post.codeIssues", $translations)}</span>
      </Button>
      <Button variant="secondary" class="gap-2" title="jiggie-contact@proton.me" href="mailto:jiggie-contact@proton.me">
        <Fa icon={faEnvelope} size="lg" />
        <span class="hidden sm:block">{t("post.contactUs", $translations)}</span>
      </Button>
      {#if !sent}
        <form on:submit={addMessage} use:modalBodyEvents class="flex flex-col md:flex-row w-full col-span-2 items-center gap-2">
          <Textarea
            required
            bind:value={currentMessage}
            class="resize-none w-full min-h-full"
            spellcheck={false}
            name="prompt"
            placeholder={t("post.feedbackPlaceholder", $translations)}
            rows={1} />
          <Button type="submit" class="px-3 w-full md:w-auto" disabled={!currentMessage}>{t("post.send", $translations)}</Button>
        </form>
      {:else}
        <span class="col-span-2 text-center">{t("post.sent", $translations)}</span>
      {/if}
    </div>
  </div>
</div>
