<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import { faSpinner } from "@fortawesome/free-solid-svg-icons";
  import { faExclamationTriangle } from "@fortawesome/free-solid-svg-icons/faExclamationTriangle";
  import { faFaceMeh } from "@fortawesome/free-solid-svg-icons/faFaceMeh";
  import { faPlus } from "@fortawesome/free-solid-svg-icons/faPlus";
  import { createEventDispatcher, onMount } from "svelte";
  import Fa from "svelte-fa";
  import { getSongByVideoId, type Song } from "./ytSearchApi";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { modalBodyEvents } from "$lib/directives";

  export let minPrice: number;
  export let balance: number;

  let bid: number = 0;
  let query: string = "";

  $: canPay = !!selectedVideoId && balance >= bid;
  $: canJam = !!selectedVideoId && balance >= bid * 2;

  let selectedVideoId: string | undefined;
  let searchPromise: Promise<Song[]>;

  function updateBid(minPrice: number) {
    bid = minPrice + 1;
  }

  $: updateBid(minPrice);

  function getYouTubeUrl(q: string): URL | undefined {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(q);
    } catch (e) {
      return;
    }

    if (!parsedUrl.host.includes("youtu")) {
      return;
    }

    if (parsedUrl.hostname.match(/(music\.youtube\.com)/i)) {
      parsedUrl.hostname = "youtube.com";
    }

    return parsedUrl;
  }

  function loadFromInput() {
    if (query?.trim()) {
      handlePastedText(query);
    }
  }

  const dispatch = createEventDispatcher<{
    songAdded: { op: string; url: string; bid: number };
  }>();

  async function submitSong(operation: string) {
    if (!selectedVideoId) {
      // should not happen, but just in case
      return;
    }

    if (operation === "jam") {
      bid *= 2;
    }

    const resUrl = `https://www.youtube.com/watch?v=${selectedVideoId}`;
    dispatch("songAdded", { op: operation, url: resUrl, bid });
    bid += 1;

    // reset state
    query = "";
    selectedVideoId = undefined;
    searchPromise = undefined!;
  }

  function fmtMSS(duration: number) {
    let s = Math.floor(duration);
    return (s - (s %= 60)) / 60 + (9 < s ? ":" : ":0") + s;
  }

  function handlePastedText(text: string) {
    const resUrl = getYouTubeUrl(text);
    const videoId = resUrl?.searchParams.get("v");
    if (!videoId) {
      searchPromise = Promise.resolve([]);
      return;
    }

    selectedVideoId = videoId;
    searchPromise = Promise.resolve([
      {
        videoId,
        title: `Video: ${videoId}`,
        videoThumbnails: [],
      } satisfies Song,
    ]);

    // load song info in background and replace the stub with the real one
    getSongByVideoId(videoId)
      // TODO: if not found (or duration is invalid) => show error?
      .then((songs) => {
        if (songs.length && songs[0].videoId === selectedVideoId) {
          searchPromise = Promise.resolve([songs[0]]);
        }
      })
      .catch(() => {});
  }

  function onInputPaste(event: ClipboardEvent) {
    const pastedText = event.clipboardData?.getData("Text");
    if (!pastedText) {
      return;
    }

    handlePastedText(pastedText);
  }
</script>

<div class="grid grid-cols-1 gap-2 w-full" use:modalBodyEvents>
  <form class="flex w-full max-w-sm items-center space-x-2" on:submit|preventDefault={() => loadFromInput()}>
    <Input type="text" placeholder={t("jukebox.pasteUrl", $translations)} bind:value={query} on:paste={onInputPaste} />
    <Button size="icon" variant="secondary" class="size-9" type="submit">
      <Fa icon={faPlus} />
    </Button>
  </form>

  {#if searchPromise}
    {#await searchPromise}
      {#each [...Array(3)] as _, i (i)}
        <div class="grid grid-rows-3 grid-cols-[auto_1fr] gap-x-2 gap-y-1 p-2">
          <Skeleton class="w-[80px] h-[60px] row-span-3" />
          <Skeleton class="w-full h-4" />
          <Skeleton class="w-full h-4" />
          <Skeleton class="w-16 h-4" />
        </div>
      {/each}
    {:then songs}
      <ScrollArea class="max-h-60 md:max-h-80 w-full max-w-full">
        {#if songs.length === 0}
          <div class="flex flex-col p-2 text-center">
            <Fa icon={faFaceMeh} size="3x" />
            <p class="mt-1 text-xl font-bold">{t("jukebox.invalidUrl", $translations)}</p>
            <p class="mt-2 text-sm">{t("jukebox.pleasePaste", $translations)}</p>
            <p class="text-sm">{t("jukebox.duration", $translations)}</p>
          </div>
        {:else}
          <div class="flex flex-col gap-1">
            {#each songs as song (song.videoId)}
              <Button
                variant={song.videoId === selectedVideoId ? "default" : "ghost"}
                class="w-full h-auto text-start whitespace-normal"
                on:click={() => {
                  selectedVideoId = song.videoId !== selectedVideoId ? song.videoId : undefined;
                }}>
                <div class="grid grid-rows-[auto_auto] grid-cols-[auto_1fr] gap-x-4 gap-y-1 w-full">
                  {#if song.thumbnail}
                    <img
                      class="row-span-2 bg-primary/10 h-auto self-center"
                      width="80"
                      height="60"
                      src={song.thumbnail}
                      loading="lazy"
                      alt={song.title} />
                  {:else}
                    <Fa class="row-span-2 self-center" icon={faSpinner} spin color="red" size="2x" />
                  {/if}
                  <span class="text-sm">{song.title}</span>
                  <span class="text-sm text-muted-foreground">
                    {song.lengthSeconds ? fmtMSS(song.lengthSeconds) : "N/A"}
                  </span>
                </div>
              </Button>
            {/each}
          </div>
        {/if}
      </ScrollArea>
    {:catch}
      <aside class="alert variant-soft-error p-3">
        <Fa icon={faExclamationTriangle} size="2x" />
        <div class="alert-message">
          <h4 class="h4">{t("jukebox.error", $translations)}</h4>
          <p class="text-sm">{t("jukebox.failedLoad", $translations)}</p>
        </div>
      </aside>
    {/await}
  {:else if balance < bid}
    <aside class="alert text-center p-2">
      <div class="alert-message">
        <p class="text-sm">{t("jukebox.connectPieces", $translations)}</p>
      </div>
    </aside>
  {/if}

  <hr />

  <div class="grid grid-cols-2 gap-x-2 z-10" id="addSongBtnPanel">
    <Button disabled={!canPay} class="h-auto" on:click={() => submitSong("add")}>
      <div class="flex flex-col">
        <span>Pay - {bid}₽</span>
        <span class="hidden md:block text-xs text-muted">{t("jukebox.addToEnd", $translations)}</span>
      </div>
    </Button>
    <Button disabled={!canJam} variant="secondary" class="h-auto" on:click={() => submitSong("jam")}>
      <div class="flex flex-col">
        <span>Jam - {bid * 2}₽</span>
        <span class="hidden md:block text-xs text-muted-foreground">{t("jukebox.addNow", $translations)}</span>
      </div>
    </Button>
  </div>
</div>
