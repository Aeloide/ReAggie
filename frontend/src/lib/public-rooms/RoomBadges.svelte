<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import { Badge } from "$lib/components/ui/badge";
  import type { PublicRoomInfo } from "./api";

  export let room: PublicRoomInfo;
</script>

<div class="flex gap-1 flex-wrap items-center justify-center">
  {#if room.nsfw}
    <Badge class="bg-red-700 hover:bg-red-800 text-foreground/80 px-1.5">NSFW</Badge>
  {/if}
  {#if room.rotation}
    <Badge class="px-1">{t("rooms.rotation", $translations)}</Badge>
  {/if}
  {#if room.hasVideo}
    <Badge class="px-1">{t("rooms.videos", $translations)}</Badge>
  {/if}
  {#each room.tags.slice(0, 5) as tag}
    <Badge class="bg-slate-700 hover:bg-slate-800 text-foreground/80 px-1.5">{tag}</Badge>
  {/each}
</div>
