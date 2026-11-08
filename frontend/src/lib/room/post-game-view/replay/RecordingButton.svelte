<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import { recordReplayVideo2 } from "$room/replay/replay-recorder";
  import type { ReplayLogEvent } from "$room/replay/types";
  import { faSpinner } from "@fortawesome/free-solid-svg-icons/faSpinner";
  import { faVideo } from "@fortawesome/free-solid-svg-icons/faVideo";
  import Fa from "svelte-fa";
  import * as Dialog from "$lib/components/ui/dialog";
  import { type VideoOptions } from "../../modals/replay-recording-options/ReplayRecordingOptionsModalContent.svelte";
  import ReplayRecordingOptionsModal from "$lib/room/modals/replay-recording-options/ReplayRecordingOptionsModal.svelte";
  import { toast } from "svelte-sonner";
  import { pushState } from "$app/navigation";
  import { Button } from "$lib/components/ui/button";

  export let replayEvents: ReplayLogEvent[];

  let recording = false;
  let recordingProgress = 0;

  let generatedMediaUrl: string | undefined;
  let previewVideoOpen = false;

  async function recordVideo(data: VideoOptions) {
    if (!data) {
      return;
    }

    recording = true;
    try {
      const { size, duration, fps } = data;
      const buffer = await recordReplayVideo2(
        replayEvents,
        {
          dimensionPx: size,
          duration: duration * 1_000,
          fps: fps,
        },
        (progress) => {
          recordingProgress = progress;
        },
      );
      generatedMediaUrl = URL.createObjectURL(new Blob([buffer], { type: "video/webm" }));
      previewVideoOpen = true;
    } catch (error) {
      if ((error as any).toString().includes("VideoEncoder is not defined")) {
        toast.error(t("post.noVideoEncoder", $translations));
      } else {
        toast.error(t("post.recordFailed", $translations).replace("{error}", String(error)));
      }
      return;
    } finally {
      recording = false;
      recordingProgress = 0;
    }
  }
</script>

<ReplayRecordingOptionsModal onSuccess={recordVideo} />

<Dialog.Root
  bind:open={previewVideoOpen}
  onOpenChange={(open) => {
    if (open) {
      return;
    }

    if (generatedMediaUrl) {
      URL.revokeObjectURL(generatedMediaUrl);
      generatedMediaUrl = undefined;
    }
  }}>
  <Dialog.Content class="justify-center p-1 h-auto w-auto md:w-auto max-w-[90vw]">
    {#if generatedMediaUrl}
      <!-- svelte-ignore a11y-media-has-caption -->
      <video src={generatedMediaUrl} class="w-full h-auto max-h-[90vh] object-contain" controls autoplay />
    {/if}
  </Dialog.Content>
</Dialog.Root>

{#if recording}
  <Button class="px-1" disabled title={t("post.recordingProgress", $translations)}>
    <span class="tabular-nums mr-2">{recordingProgress}%</span>
    <Fa icon={faSpinner} spin />
  </Button>
{:else}
  <Button
    size="icon"
    class="rounded-full"
    title={t("post.recordVideo", $translations)}
    disabled={replayEvents.length === 0}
    on:click={() => pushState("", { showReplayRecordingOptions: true })}>
    <Fa icon={faVideo} />
  </Button>
{/if}
