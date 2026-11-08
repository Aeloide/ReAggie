<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import Fa from "svelte-fa";
  import { faClock } from "@fortawesome/free-solid-svg-icons/faClock";
  import { driftStore, roomState, settings } from "$lib/room/stores";
  import { Button } from "$lib/components/ui/button";
  import { derived } from "svelte/store";
  import { fly } from "svelte/transition";

  const timerEnabled = derived(settings, (x) => x.enableTimer === "y");
  let timerText = t("menu.toggleTimer", $translations);
  let driftSec = 0;
  $: {
    if ($driftStore !== undefined && Number.isFinite($driftStore)) {
      driftSec = Math.floor(Math.abs($driftStore) / 1000);
      if (driftSec > 2) timerText = t("menu.desync", $translations).replace("{seconds}", String(driftSec));
      else timerText = t("menu.toggleTimer", $translations);
    } else {
      driftSec = 0;
      timerText = t("menu.toggleTimer", $translations);
    }
  }
</script>

<Button size="icon-menu" variant="outline" title={timerText} on:click={() => ($settings.enableTimer = $timerEnabled ? "n" : "y")}>
  <Fa icon={faClock} color={driftSec > 2 ? "orange" : "white"} />
  {#if $timerEnabled}
    <span transition:fly={{ x: -10, duration: 100 }} class="ml-1.5 tabular-nums">{$roomState.timerText}</span>
  {/if}
</Button>
