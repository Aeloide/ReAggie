<script lang="ts">
  import { jukeboxSongRequest, otherSettings, playlist, settings } from "$lib/room/stores";
  import type { ActiveSong, JukeBoxSongPlayRequest } from "../types";
  import { getAssetUrl } from "$lib";
  import JukeboxAddSongButton from "./JukeboxAddSongButton.svelte";
  import Fa from "svelte-fa";
  import { faMusic } from "@fortawesome/free-solid-svg-icons/faMusic";
  import VolumeControl from "../jukebox/VolumeControl.svelte";
  import SongPlaylistPanel from "../jukebox/SongPlaylistPanel.svelte";
  import { useGame } from "../hooks/useGame";
  import { Button } from "$lib/components/ui/button";
  import * as Popover from "$lib/components/ui/popover";

  let audio: HTMLAudioElement;
  let audioSrc = "";
  let audioTimeNow = 0;

  $: syncMusicRequest($jukeboxSongRequest);

  function syncMusicRequest(request?: JukeBoxSongPlayRequest) {
    if (request) {
      playSong(request);
    } else {
      stopSong();
    }
  }

  $: activeSong = getActiveSong(audio, audioTimeNow, $jukeboxSongRequest);

  function getActiveSong(audio: HTMLAudioElement, audioTimeNow: number, request?: JukeBoxSongPlayRequest): ActiveSong | undefined {
    if (!audio || !request) {
      return;
    }

    const { mid } = request;
    return {
      id: mid,
      progressSeconds: audioTimeNow,
      durationSeconds: audio.duration,
    };
  }

  function playSong(request: JukeBoxSongPlayRequest) {
    const { mid, ext } = request;

    // TODO: if the new song is the same AND
    // audio.currentTime > newStartTime (request rewinds the song)
    // then skip update

    const extension = ext || $playlist.find((t) => t.id == mid)?.ext || "webm";
    const fileName = `${mid}.${extension}`;
    audioSrc = getAssetUrl(fileName);
    
    // handle song restarts without loading the audio again
    if (audio) {
      audio.load();
      onLoadedMetadata();
    }
  }

  function stopSong() {
    if (audio) {
      audio.pause();
    }
    audioSrc = "";
  }

  const game = useGame();

  async function onLoadedMetadata() {
    try {
      await playCurrentSong();
    } catch (error) {
      // AudioContext can be played only after any user gesture
      ["mousedown", "touchstart"].forEach((e) => {
        document.addEventListener(
          e,
          // setTimeout is required on mobile devices
          () =>
            setTimeout(async () => {
              await playCurrentSong();
            }, 50),
          { once: true },
        );
      });
    }
  }

  async function playCurrentSong() {
    if (audio && audio.src && $jukeboxSongRequest) {
      const newTime = (Date.now() - $jukeboxSongRequest.timeStarted) / 1000;
      // it's okay to have a small desync
      if (Math.abs(newTime - audio.currentTime) > 2) {
        audio.currentTime = newTime;
        await new Promise((_) => audio.addEventListener("seeked", _, { once: true }));
      }
      await audio.play();
    }
  }

  function onSongSkipClick(e: CustomEvent<{ index: number }>) {
    game.connection.chat(`/plskip ${e.detail.index}`);
  }

  let open = false;
</script>

<audio
  on:loadedmetadata={onLoadedMetadata}
  bind:this={audio}
  bind:volume={$settings.jukevol}
  on:timeupdate={() => {
    audioTimeNow = audio.currentTime;
  }}
  crossorigin="anonymous"
  autoplay
  src={audioSrc}
  muted={!!$settings.mutejuke} />

<VolumeControl
  bind:volume={$settings.jukevol}
  muted={!!$settings.mutejuke}
  on:muteChange={({ detail: { muted } }) => {
    $settings.mutejuke = muted ? "y" : "";
  }} />

<Popover.Root bind:open>
  <Popover.Trigger asChild let:builder>
    <Button size="icon-menu" tabindex={-1} variant={open ? "default" : "outline"} builders={[builder]}>
      <Fa icon={faMusic} />
    </Button>
  </Popover.Trigger>
  <Popover.Content class="p-1 w-[95%] max-w-96">
    <SongPlaylistPanel playlist={$playlist} {activeSong} on:skip={onSongSkipClick} hasAdminControls={!!$otherSettings.host.Playlist} />
  </Popover.Content>
</Popover.Root>

<JukeboxAddSongButton />
