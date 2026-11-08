<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import { createEventDispatcher, onMount } from "svelte";
  import { useGame } from "./hooks/useGame";
  import { Button } from "$lib/components/ui/button";

  export let options: string[] = [];

  const game = useGame();

  const pollManager = game.entities[3];
  const dispatch = createEventDispatcher();

  onMount(() => {
    pollManager.zone_setup = "waiting_first_point";
    next();

    return () => {
      pollManager.zone_setup = "none";
    };
  });

  function cancel() {
    if (i == 0) {
      i = pollManager.zones.length = 0;
      dispatch("cancel");
    } else {
      pollManager.zones.length -= 1;
      i = i - 1;
      // TODO: cleanup the already defined zones
    }
  }

  let i = -1;
  function next() {
    if (i == options.length - 1) {
      // commit
      dispatch("cancel", { ok: true });
    } else {
      i = i + 1;
      pollManager.zones[i] = [
        options[i],
        [
          [NaN, NaN],
          [NaN, NaN],
        ],
      ];
    }
  }
</script>

<div class="bg-popover rounded border p-4 w-72 shadow-xl">
  <div class="flex flex-col items-center gap-2">
    <span>{t("zone.step", $translations).replace("{step}", String(i + 1)).replace("{total}", String(options.length))}</span>
    <span class="text-sm">{t("zone.draw", $translations).replace("{option}", options[i] ?? "")}</span>

    <div class="grid grid-cols-2 w-full gap-2 mt-2">
      <Button variant="outline" on:click={cancel}>{i == 0 ? t("common.cancel", $translations) : t("common.previous", $translations)}</Button>
      <Button on:click={next}>{i == options.length - 1 ? t("common.start", $translations) : t("common.next", $translations)}</Button>
    </div>
  </div>
</div>
