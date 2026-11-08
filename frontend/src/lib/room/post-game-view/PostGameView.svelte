<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import ReplayViewer from "./replay/ReplayViewer.svelte";
  import Fa from "svelte-fa";
  import { faStar } from "@fortawesome/free-solid-svg-icons/faStar";
  import { faRankingStar } from "@fortawesome/free-solid-svg-icons/faRankingStar";
  import { faVideo } from "@fortawesome/free-solid-svg-icons/faVideo";
  import { faLightbulb } from "@fortawesome/free-solid-svg-icons/faLightbulb";
  import FeedbackPanel from "./FeedbackPanel.svelte";
  import * as ToggleGroup from "$lib/components/ui/toggle-group";
  import SameHostRoomPanel from "./SameHostRoomPanel.svelte";
  import { cn } from "$lib/utils";
  import { endStats, roomDef } from "../stores";
  import ScorePanel from "./ScorePanel.svelte";
  import { onMount } from "svelte";
  import { game } from "$room";
  import RecordingButton from "./replay/RecordingButton.svelte";

  let selectedItem: "room" | "replay" | "feedback" | "scores" | undefined;

  const toggleItemClass = "flex flex-col h-auto py-2 px-4 gap-1";

  let hasRoomFromTheSameHost = false;

  onMount(() => {
    if ($roomDef?.scores) {
      game.connection.chat("/endstats");
    }
  });
</script>

<div class="grid grid-rows-[1fr_auto] p-4 w-full h-full pointer-events-none">
  <div class="flex justify-center items-end">
    <SameHostRoomPanel
      open={selectedItem === "room"}
      onRoomFound={() => {
        hasRoomFromTheSameHost = true;
        if (!selectedItem) {
          selectedItem = "room";
        }
      }} />
    {#if selectedItem === "replay"}
      <ReplayViewer sub={RecordingButton}/>
    {:else if selectedItem === "feedback"}
      <FeedbackPanel />
    {:else if selectedItem === "scores"}
      <ScorePanel />
    {/if}
  </div>
  <div class="flex flex-col items-center gap-2">
    <div class="bg-popover border rounded p-1 md:p-2 shadow-xl pointer-events-auto">
      <ToggleGroup.Root class={cn("flex")} type="single" bind:value={selectedItem}>
        {#if hasRoomFromTheSameHost}
          <ToggleGroup.Item value="room" class={toggleItemClass} aria-label={t("post.toggleRoom", $translations)}>
            <Fa size="lg" icon={faStar} />
            <span class="text-sm hidden md:block">{t("post.room", $translations)}</span>
          </ToggleGroup.Item>
        {/if}
        {#if $roomDef?.scores && $endStats?.ranking.length > 0}
          <ToggleGroup.Item value="scores" class={toggleItemClass} aria-label={t("post.toggleScores", $translations)}>
            <Fa size="lg" icon={faRankingStar} />
            <span class="text-sm hidden md:block">{t("post.scores", $translations)}</span>
          </ToggleGroup.Item>
        {/if}
        <ToggleGroup.Item value="replay" class={toggleItemClass} aria-label={t("post.toggleReplay", $translations)}>
          <Fa size="lg" icon={faVideo} />
          <span class="text-sm hidden md:block">{t("post.replay", $translations)}</span>
        </ToggleGroup.Item>
        <ToggleGroup.Item value="feedback" class={toggleItemClass} aria-label={t("post.toggleFeedback", $translations)}>
          <Fa size="lg" icon={faLightbulb} />
          <span class="text-sm hidden md:block">{t("post.feedback", $translations)}</span>
        </ToggleGroup.Item>
      </ToggleGroup.Root>
    </div>
  </div>
</div>
