<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import * as Tabs from "$lib/components/ui/tabs";
  import CreateRoomForm from "$lib/create-room/CreateRoomForm.svelte";
  import PublicRooms from "$lib/public-rooms/PublicRooms.svelte";
  import MyPuzzles from "$lib/public-rooms/MyPuzzles.svelte";
  import { isPWA } from "$lib/pwaStore";
  import type { SortValue } from "$lib/public-rooms/types";
  import { faSquarePlus } from "@fortawesome/free-solid-svg-icons/faSquarePlus";
  import { faTableList } from "@fortawesome/free-solid-svg-icons/faTableList";
  import Fa from "svelte-fa";
  import type { Snapshot } from "./$types";
  import Footer from "./Footer.svelte";
  import Header from "./Header.svelte";
  import JigGieGirlsLogo from "./JigGieGirlsLogo.svelte";
  import GachaBanner from "./GachaBanner.svelte";
  import { onMount } from "svelte";
  import { FaviconBadge } from "../utils";
  import { slide, fade } from "svelte/transition";

  let announcement: string | null = null;
  let announcementTime: number | null = null;
  let isMinimized = false;

  onMount(async () => {
    try {
      const response = await fetch("/stats");
      const data = await response.json();
      
      if (data && data.announcement) {
        announcement = data.announcement;
        announcementTime = data.announcement_time || 0;
        
        const storedMinimizedTime = localStorage.getItem("announcement_minimized_time");
        if (storedMinimizedTime) {
          const minTime = parseInt(storedMinimizedTime, 10);
          if (minTime >= announcementTime) {
            isMinimized = true;
          }
        }
      }
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  });

  function minimize() {
    isMinimized = true;
    if (announcementTime !== null) {
      localStorage.setItem("announcement_minimized_time", announcementTime.toString());
    }
  }

  function expand() {
    isMinimized = false;
  }

  const isDecember = new Date().getMonth() == 11;
  let publicSortValue: SortValue | undefined;

  export const snapshot: Snapshot<typeof publicSortValue> = {
    capture: () => publicSortValue,
    restore: (value) => (publicSortValue = value),
  };

  const isDevPteEnv = location.host.startsWith("dev.") || location.host.startsWith("pte.");

  const newRoomSearchLoc = "new";
  $: selectedTab = $page.url.searchParams.has(newRoomSearchLoc) ? "new" : "public";

  const tabTriggerClass = "gap-2 px-4 py-1.5";

  function onTabChange(value: string | undefined) {
    goto(value === "new" ? `?${newRoomSearchLoc}` : "/", { replaceState: true });
  }

</script>

{#if isDevPteEnv}
  <h2 id="warning">{t("environment.pteWarning", $translations)}</h2>
{/if}

<section class="container sm:px-4 md:px-8 mx-auto max-w-5xl my-4">
  {#if announcement}
    {#if !isMinimized}
      <div transition:slide={{ duration: 400 }} class="relative my-6 overflow-hidden rounded border-4 border-black shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] transition-all duration-300 transform -rotate-1 hover:rotate-0" style="background: #ffd800;">
        <!-- Top stripes (moving right) -->
        <div class="h-3 w-full stripes-top animate-stripes-right" style="background: repeating-linear-gradient(-45deg, #000, #000 12px, #ffd800 12px, #ffd800 24px);"></div>
        
        <div class="flex items-center justify-between px-4 py-3 md:px-6 md:py-4 text-black">
          <div class="flex items-center gap-3 flex-1 min-w-0">
            <span class="flex-shrink-0 text-xl md:text-2xl animate-bounce" role="img" aria-label="caution">⚠️</span>
            <div class="announcement-content text-sm md:text-base tracking-wide break-words flex-1 leading-snug">
              {@html announcement}
            </div>
          </div>
          
          <button 
            on:click={minimize} 
            class="ml-4 px-2.5 py-1.5 rounded bg-black text-[#ffd800] hover:bg-zinc-800 transition-colors flex-shrink-0 border-2 border-black font-black uppercase text-xs tracking-wider shadow-[2px_2px_0px_0px_rgba(0,0,0,0.5)] active:translate-x-[1px] active:translate-y-[1px]"
            aria-label={t("announcement.hide", $translations)}
          >
            {t("announcement.hide", $translations)}
          </button>
        </div>

        <!-- Bottom stripes (moving left) -->
        <div class="h-3 w-full stripes-bottom animate-stripes-left" style="background: repeating-linear-gradient(-45deg, #000, #000 12px, #ffd800 12px, #ffd800 24px);"></div>
      </div>
    {:else}
      <div transition:fade={{ duration: 250 }} class="fixed bottom-4 right-4 z-50 transform rotate-3 hover:rotate-0 transition-all duration-300">
        <button 
          on:click={expand}
          class="flex items-center gap-2 px-3 py-2 font-extrabold text-xs uppercase tracking-wider text-black border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[-2px] active:translate-y-[2px] transition-all"
          style="background: repeating-linear-gradient(-45deg, #000, #000 8px, #ffd800 8px, #ffd800 16px); position: relative; overflow: hidden;"
        >
          <span style="background: #ffd800; padding: 2px 6px; border: 2px solid #000; display: inline-flex; align-items: center; gap: 4px;">
            <span>⚠️</span> {t("announcement.title", $translations)}
          </span>
        </button>
      </div>
    {/if}
  {/if}

  <Header />
  {#if isDecember}
    <GachaBanner key="christ">
      <img alt="gacha" src="/Christmas_2.png" />
    </GachaBanner>
  {/if}

  <Tabs.Root bind:value={selectedTab} class="relative flex flex-col mt-4" onValueChange={onTabChange}>
    <Tabs.List class="mx-auto size-auto">
      <Tabs.Trigger value="public" class={tabTriggerClass}>
        <Fa icon={faTableList} />
        {$isPWA ? t("rooms.myPuzzles", $translations) : t("rooms.publicRooms", $translations)}
      </Tabs.Trigger>
      <Tabs.Trigger value="new" class={tabTriggerClass}>
        <Fa icon={faSquarePlus} />
        {t("rooms.newRoom", $translations)}
      </Tabs.Trigger>
    </Tabs.List>
    <JigGieGirlsLogo type="header" />
    <Tabs.Content value={selectedTab} class="bg-zinc-900 rounded-sm border shadow-[0_5px_25px_-12px_rgba(58,109,191,0.6)]">
      {#if selectedTab === "new"}
        <CreateRoomForm />
      {:else if selectedTab === "public"}
        {#if $isPWA}
          <MyPuzzles />
        {:else}
          <PublicRooms bind:sort={publicSortValue} />
        {/if}
      {/if}
    </Tabs.Content>
  </Tabs.Root>
</section>
<Footer />

<!-- <JigGieGirlsLogo type="footer" /> -->

<style lang="postcss">
  #warning {
    color: red;
    font-weight: bolder;
    z-index: 420;
    text-align: center;
    position: fixed;
    width: 100%;
    bottom: 0;
    padding: 10px;
    background: #ffb101;
    border: 10px solid pink;
    border-image: repeating-linear-gradient(-55deg, #000, #000 20px, #ffb101 20px, #ffb101 40px) 10;
  }
  .announcement-content :global(a) {
    text-decoration: underline;
    font-weight: 900;
    color: #000;
  }
  .announcement-content :global(a:hover) {
    opacity: 0.85;
  }
  .stripes-top, .stripes-bottom {
    background-size: 34px 34px !important;
  }
  .animate-stripes-right {
    animation: stripe-move-right 3s linear infinite;
  }
  .animate-stripes-left {
    animation: stripe-move-left 3s linear infinite;
  }
  @keyframes stripe-move-right {
    from {
      background-position: 0 0;
    }
    to {
      background-position: 34px 0;
    }
  }
  @keyframes stripe-move-left {
    from {
      background-position: 0 0;
    }
    to {
      background-position: -34px 0;
    }
  }
</style>
