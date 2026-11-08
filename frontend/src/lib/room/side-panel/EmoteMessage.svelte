<script lang="ts">
  import type { EmoteMessage } from "../types";
  import type { User } from "$room/game";
  import { cn, isEmoji } from "$lib/utils";

  export let msg: EmoteMessage;
  export let me: User | undefined;

  export let onLoad: Function | undefined;

</script>

<div class={cn("p-2 pointer-events-auto bg-background rounded", {})}>
  <div class="w-full grid grid-cols-[1fr_auto] gap-1 items-center">
    <div class="font-bold truncate" title={msg.name} style:color={msg.color}>
      {msg.name}
    </div>
  </div>
  <div class="flex break-words whitespace-pre-wrap text-ellipsis">
    {#each msg.emotes as emote}
      <div class="tw">
        {#if isEmoji(emote)}
          <span class="sz">{emote}</span>
        {:else}
          <em-emoji on:load={onLoad} class="sz" shortcodes={emote} title={emote} fallback={emote} />
        {/if}
      </div>
    {/each}
  </div>
</div>

<style scoped>
  .sz {
    font-size: 50cqw;
    display: inline-flex;
  }
  .tw {
    container-type: inline-size;
    width: 100%;
    text-align: center;
  }

  .meme {
    color: #b5bd68;
  }

  .animated-background {
    background-size: 400%;
    animation: animation 8s ease infinite;
  }

  

  @keyframes animation {
    0%,
    100% {
      background-position: 0% 50%;
    }

    50% {
      background-position: 100% 50%;
    }
  }
</style>
