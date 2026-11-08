<script lang="ts">
  import Fa from "svelte-fa";
  import { faVolumeOff } from "@fortawesome/free-solid-svg-icons/faVolumeOff";
  import { faVolumeLow } from "@fortawesome/free-solid-svg-icons/faVolumeLow";
  import { faVolumeHigh } from "@fortawesome/free-solid-svg-icons/faVolumeHigh";
  import { faVolumeXmark } from "@fortawesome/free-solid-svg-icons/faVolumeXmark";
  import { createEventDispatcher } from "svelte";
  import { Slider } from "$lib/components/ui/slider";
  import { Button } from "$lib/components/ui/button";

  export let volume: number;
  export let muted: boolean;

  const dispatch = createEventDispatcher<{
    muteChange: { muted: boolean };
  }>();

  let volSliderValue = calcVolSliderValue(volume);

  $: updateVolume(volume);
  $: updateSliderVolume(volSliderValue);

  function updateSliderVolume(newSliderVolume: number) {
    volume = newSliderVolume / 100;
  }

  function updateVolume(newVolume: number) {
    volSliderValue = calcVolSliderValue(newVolume);
  }

  function calcVolSliderValue(newVolume: number) {
    return Math.max(0, Math.min(newVolume * 100, 100));
  }

  function getVolumeIcon(muted: boolean, volume: number) {
    if (muted) {
      return faVolumeXmark;
    }

    if (volume === 0) {
      return faVolumeOff;
    }

    return volume > 50 ? faVolumeHigh : faVolumeLow;
  }

  let volSliderValues = [volSliderValue];
  $: volSliderValue = volSliderValues[0];
</script>

<Button
  size="icon-menu"
  variant="outline"
  title={muted ? "Click to unmute" : "Click to mute"}
  on:click={() => dispatch("muteChange", { muted: !muted })}>
  <Fa icon={getVolumeIcon(muted, volSliderValue)} fw />
</Button>

{#if !muted}
  <Slider bind:value={volSliderValues} min={0} max={100} step={1} class="w-32 mx-2" />
{/if}
