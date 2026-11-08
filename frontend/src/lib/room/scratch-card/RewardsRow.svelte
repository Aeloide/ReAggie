<script lang="ts">
  import rewardSpriteUrl from "$lib/assets/scratch-card/reward-sprites.png";
  import { cn } from "$lib/utils";
  import type { ScratchCardStatus } from "$room/types";
  import type { CardType } from "./types";

  export let type: ScratchCardStatus;
  export let highlighted = false;
  export let cardType: CardType;

  interface RewardSprite {
    width: number;
    height: number;
    position: [number, number];
  }

  const sprites: RewardSprite[] = [
    // jig-chan
    { width: 15, height: 13, position: [0, 0] },
    { width: 15, height: 12, position: [-15, 0] },
    { width: 15, height: 13, position: [-30, 0] },
    { width: 15, height: 13, position: [-45, 0] },
    // emoji
    { width: 15, height: 13, position: [0, -14] },
    { width: 15, height: 13, position: [-15, -14] },
    { width: 15, height: 13, position: [-30, -14] },
    { width: 15, height: 12, position: [-45, -14] },
  ];

  const rewards = new Map<ScratchCardStatus, { sprites: number[]; score: number | null }>([
    ["jackpot", { sprites: [0, 0, 0], score: 100 }],
    ["win", { sprites: [1, 1, 7], score: 10 }],
    ["draw", { sprites: [2, 6], score: 5 }],
    ["lose", { sprites: [5, 5, 3], score: -10 }],
    ["emoji", { sprites: [4, 4, 4], score: null }],
  ]);

  const scale = 2.5;

  $: reward = rewards.get(type)!;

  function getBgStyles(cardType: CardType) {
    switch (cardType) {
      case "red":
        return "bg-gradient-to-r from-red-500 via-red-300 to-red-500";
      case "green":
        return "bg-gradient-to-r from-green-600 via-green-400 to-green-600";
      case "blue":
        return "bg-gradient-to-r from-blue-500 via-blue-300 to-blue-500";
    }
  }
</script>

<div
  class={cn(
    "flex justify-center sm:grid sm:grid-cols-[auto_auto_1fr] px-2 text-[#594940] font-pixel leading-3 font-extrabold text-right items-center gap-2",
    highlighted && "text-primary animated-background",
    highlighted && getBgStyles(cardType),
  )}
  class:animated-background={highlighted}
  class:bg-red-500={highlighted}>
  <div class="grid grid-cols-3 gap-[1px]">
    {#each reward.sprites as spriteId}
      {@const sprite = sprites[spriteId]}
      <div
        style:width="{sprite.width * scale}px"
        style:height="{sprite.height * scale}px"
        style:image-rendering="pixelated"
        style:background-repeat="no-repeat"
        style:background-image="url({rewardSpriteUrl})"
        style:background-size="{60 * scale}px {27 * scale}px"
        style:background-position={`${sprite.position[0] * scale}px ${sprite.position[1] * scale}px`} />
    {/each}
  </div>
  <span class="text-xl">=</span>
  {#if type !== "emoji"}
    <div>
      <span class="text-4xl">{reward.score}</span>
      <span class="tracking-tighter">pts</span>
    </div>
  {:else}
    <div class="text-center text-2xl leading-4">
      <div>LOSE</div>
      <div>ALL</div>
    </div>
  {/if}
</div>

<style scoped>
  .animated-background {
    background-size: 400%;
    animation: animation 4s ease infinite;
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
