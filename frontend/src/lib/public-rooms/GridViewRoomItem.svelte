<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import { getAssetUrl } from "$lib";
  import { cn } from "$lib/utils";
  import { faEyeSlash } from "@fortawesome/free-solid-svg-icons/faEyeSlash";
  import { faImages } from "@fortawesome/free-solid-svg-icons/faImages";
  import { faPuzzlePiece } from "@fortawesome/free-solid-svg-icons/faPuzzlePiece";
  import { faUser } from "@fortawesome/free-solid-svg-icons/faUser";
  import { faUsers } from "@fortawesome/free-solid-svg-icons/faUsers";
  import Fa from "svelte-fa";
  import type { PublicRoomInfo } from "./api";
  import RoomBadges from "./RoomBadges.svelte";

  export let room: PublicRoomInfo;
  export let openInNewTab = false;
</script>

<a
  href="/{room.id}"
  target={openInNewTab ? "_blank" : undefined}
  class="relative bg-background border border-zinc-700 group transition-transform hover:scale-105"
  style={room.thumbnail ? `background-image: url(${getAssetUrl(room.thumbnail)});` : undefined}>
  {#if room.thumbnail}
    <img
      class={cn("w-full min-h-44 max-h-64 object-cover", {
        "group-hover:object-contain backdrop-blur-lg": !room.hidePreview,
      })}
      loading="lazy"
      src={getAssetUrl(room.thumbnail)}
      alt="" />
  {:else}
    <div class="size-44" />
  {/if}
  {#if room.hidePreview || !room.thumbnail}
    <div
      class={cn("absolute inset-0 flex flex-col items-center gap-y-1 justify-center text-foreground/40", {
        "backdrop-blur-lg": room.thumbnail,
      })}>
      <Fa icon={faEyeSlash} size="lg" />
      <p class="text-sm font-semibold text-center">{t("rooms.previewDisabled", $translations)}</p>
    </div>
  {/if}
  <div class="absolute bg-muted/70 top-0 flex flex-col gap-y-1 p-1 w-full transition-colors group-hover:bg-muted/30">
    <div class="flex flex-wrap items-center justify-center gap-x-2">
      <span class:gay={room.gay} class="text-xs text-center font-semibold">{room.name}</span>
      {#if room.hostName}
        <span title={t("rooms.host", $translations)} class="flex items-center justify-center space-x-1 text-xs text-blue-400/90">
          <Fa icon={faUser} size="xs" />
          <span class="font-semibold">{room.hostName}</span>
        </span>
      {/if}
    </div>
    <RoomBadges {room} />
  </div>
  <div class="absolute bg-muted/50 bottom-0 p-1 w-full transition-colors group-hover:bg-muted/30">
    <div class="grid grid-flow-col gap-x-2 transition-colors text-foreground/70 group-hover:text-foreground font-semibold text-xs">
      <span class="flex items-center justify-center space-x-1">
        <Fa icon={faUsers} size="sm" />
        <span>{room.players}</span>
      </span>
      <span class="flex items-center justify-center space-x-1">
        <Fa icon={faPuzzlePiece} size="sm" />
        <span>{room.pieces}</span>
      </span>
      <span class="flex items-center justify-center space-x-1">
        <Fa icon={faImages} size="sm" />
        <span>{room.sets}</span>
      </span>
      <span class="hidden sm:flex items-center justify-center space-x-1">
        <span>{(room.completion * 100)?.toFixed()}%</span>
      </span>
    </div>
  </div>
</a>
