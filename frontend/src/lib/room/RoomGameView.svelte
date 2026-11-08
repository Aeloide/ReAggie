<script lang="ts">
  import { slide } from "svelte/transition";
  import GameCanvas from "./GameCanvas.svelte";
  import Jukebox from "./top-buttons/Jukebox.svelte";
  import LockedPiecesBox from "./top-buttons/LockedPiecesBox.svelte";
  import PieceCountBox from "./top-buttons/PieceCountBox.svelte";
  import PreviewBox from "./top-buttons/PreviewBox.svelte";
  import RoomMenu from "./top-buttons/RoomMenu.svelte";
  import TimerBox from "./top-buttons/TimerBox.svelte";
  import { settings, roomDef, roomState, bgColorPicker, pollStore, nameTags } from "./stores";
  import NameTag from "./NameTag.svelte";
  import PreviewBoxThumbnail from "./preview/PreviewBoxThumbnail.svelte";
  import PreviewBoxOverlay from "./preview/PreviewBoxOverlay.svelte";
  import DownloadImagesBox from "./top-buttons/DownloadImagesBox.svelte";
  import RoomGameStatusOverlay from "./RoomGameStatusOverlay.svelte";
  import PerfMon from "./PerfMon.svelte";
  import BgColorPickerBox from "./color-picker/BgColorPickerBox.svelte";
  import PostGameView from "./post-game-view/PostGameView.svelte";
  import HelpTour from "./HelpTour.svelte";
  import { derived } from "svelte/store";
  import MobileAssistiveTouchButton from "./mobile/MobileAssistiveTouchButton.svelte";
  import { isMobileQuery, isTouchScreenQuery } from "$lib/utils";
  import SidePanel from "./side-panel/SidePanel.svelte";
  import MobileRoomSidePanelButton from "./mobile/MobileRoomSidePanelButton.svelte";
  import TouchScreenChatButton from "./mobile/TouchScreenChatButton.svelte";
  import JigChanControls from "./top-buttons/JigChanControls.svelte";
  import ReportRoomBox from "./top-buttons/ReportRoomBox.svelte";
  import RoomModals from "./modals/RoomModals.svelte";
  import PollStatusButton from "./top-buttons/PollStatusButton.svelte";
  import { scratchCard } from "./scratch-card/scratchCardStore";
  import ScratchCard from "./scratch-card/ScratchCard.svelte";
  import PrivateChatsContainer from "./PrivateChatsContainer.svelte";
  import { activeMobilePrivateChatUserId } from "./stores"; // Import new store
  import MobilePrivateChatSelectors from "./MobilePrivateChatSelectors.svelte"; // Adjust path
  import MobilePrivateChatSidePanel from "./MobilePrivateChatSidePanel.svelte"; // Adjust path
  import Gizmo from "./modals/user-settings/Gizmo.svelte";

  let canvasLoaded = false;
  const helpDismissed = derived(settings, (x) => x.helpDismissed === "yes");

  const isMobile = isMobileQuery();
  const isTouchScreen = isTouchScreenQuery();
</script>

<GameCanvas on:loaded={() => (canvasLoaded = true)} />

{#if !$settings.hidenametags}
  <div class="absolute inset-0 overflow-hidden pointer-events-none">
    {#each $nameTags as tag (tag.user.id)}
      <NameTag user={tag.user} hidden={tag.hidden} translate={tag.translate} event={tag.event} />
    {/each}
  </div>
{/if}

{#if !$roomDef?.hidePreview}
  <PreviewBoxOverlay />
{/if}

{#if import.meta.env.DEV}
  <PerfMon />
{/if}

{#if $bgColorPicker.visible && $bgColorPicker.color}
  <div transition:slide={{ duration: 150 }} class="absolute bottom-0 left-[50%] translate-x-[-50%] pb-1">
    <BgColorPickerBox color={$bgColorPicker.color} texture={$bgColorPicker.texture} />
  </div>
{/if}

<div
  class="absolute w-full h-full pl-1 pt-1 pr-1 grid items-start pointer-events-none"
  style={!$isMobile ? "grid-template-columns: 1fr auto; grid-template-rows: auto 1fr;" : "grid-template-columns: 1fr; grid-template-rows: auto 1fr;"}>
  <div class="grow flex flex-col gap-2">
    <div class="flex gap-1 flex-wrap [&>*]:pointer-events-auto">
      <RoomMenu />

      {#if !$roomDef?.hidePreview}
        <PreviewBox />
      {/if}

      <PieceCountBox />

      {#if $roomState.lockedPiecesCount || $roomState.lockedPiecesCount > 0}
        <LockedPiecesBox />
      {/if}

      <TimerBox />
      <ReportRoomBox />

      {#if $roomDef?.juke}
        <Jukebox />
      {/if}

      {#if $pollStore.question}
        <PollStatusButton />
      {/if}

      {#if $roomState.isCompleted}
        <DownloadImagesBox />
      {/if}

      {#if $roomDef?.jigchan && $roomDef.juke}
        <JigChanControls />
      {/if}
    </div>

    {#if !$roomDef?.hidePreview}
      <PreviewBoxThumbnail />
    {/if}
  </div>

  {#if !$isMobile}
    <SidePanel />
  {/if}

  <div class="relative pl-1 pr-1 w-full h-full">
    {#if $roomState.isCompleted}
      <PostGameView />
    {/if}
    {#if !$isMobile}
      <div class="absolute pl-1 pr-1 top-0 left-0 w-full h-full flex justify-end">
        <PrivateChatsContainer />
      </div>
    {:else}
      <div class="absolute top-0 left-0 w-full h-full flex p-5 justify-end flex-col items-end gap-2">
        <!-- Make it start in the bottom right, and added items stack on top -->
        <MobilePrivateChatSelectors />
        <MobileRoomSidePanelButton />
      </div>
    {/if}
  </div>
</div>

{#if $isMobile && $activeMobilePrivateChatUserId !== null}
  <MobilePrivateChatSidePanel />
{/if}

<RoomGameStatusOverlay />

{#if $isTouchScreen}
  <MobileAssistiveTouchButton />
{/if}

{#if $scratchCard.open}
  <ScratchCard />
{/if}

{#if !$helpDismissed && canvasLoaded}
  <HelpTour />
{/if}

<RoomModals />

{#if !$settings.hideshadow && $settings.shadowQuality === "accurate" && $settings.persistentShadowGizmo}
  <div class="fixed bottom-4 left-4 z-50 p-2 bg-slate-900/80 rounded-full border border-slate-700 shadow-xl backdrop-blur-sm pointer-events-auto">
    <Gizmo
      value={$settings.shadowLightPos}
      on:change={(e) => {
        settings.update((s) => {
          s.shadowLightPos = e.detail;
          return s;
        });
      }} />
  </div>
{/if}
