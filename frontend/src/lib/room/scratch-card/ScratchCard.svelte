<script lang="ts">
  import { onMount } from "svelte";
  import ScratchCircle from "./ScratchCircle.svelte";
  import { clamp } from "../../../utils";
  import * as AlertDialog from "$lib/components/ui/alert-dialog";
  import { scratchCard } from "./scratchCardStore";
  import { useGame } from "../hooks/useGame";
  import RewardsRow from "./RewardsRow.svelte";
  import ScratchImage from "./ScratchImage.svelte";
  import type { ScratchCardStatus } from "$room/types";
  import type { CardType } from "./types";
  import { cn } from "$lib/utils";
  import { jukebox } from "../stores";
  import ScratchCardFooter from "./ScratchCardFooter.svelte";

  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D;
  let particles: { x: number; y: number; vx: number; vy: number; color: string }[] = [];
  let rafReq: number;

  const PRICE_PER_CARD = 5;

  const game = useGame();

  const fleckColors = ["#909092", "#000000", "#FFFFFF"];

  function getRandomArbitrary(min: number, max: number): number {
    return Math.random() * (max - min) + min;
  }

  function generateFlecks(e: { clientX: number; clientY: number; movementX: number; movementY: number }) {
    for (let i = 0; i < 3; i++) {
      particles.push({
        x: getRandomArbitrary(e.clientX - 10, e.clientX + 10),
        y: getRandomArbitrary(e.clientY - 10, e.clientY + 10),
        vx: clamp(e.movementX, -2, 2) * getRandomArbitrary(0.5, 1.5),
        vy: clamp(e.movementY, -2, 2) * getRandomArbitrary(0.5, 1.5),
        color: fleckColors[Math.floor(Math.random() * 3)],
      });
    }
  }

  function render() {
    rafReq = requestAnimationFrame(render);

    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach((particle, index) => {
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.vy += 0.1;

        if (particle.y > innerHeight) {
          particles.splice(index, 1);
        } else {
          ctx.fillStyle = particle.color;
          ctx.fillRect(particle.x, particle.y, 2, 2);
        }
      });
    }
  }

  function handleScratchMove(index: number) {
    if (!$scratchCard.requestedValues.has(index)) {
      game.connection.chat(`/card ${index}`);
      scratchCard.markAsRequested(index);
    }
  }

  onMount(() => {
    ctx = canvas.getContext("2d")!;
    canvas.width = innerWidth;
    canvas.height = innerHeight;
    render();

    return () => {
      cancelAnimationFrame(rafReq);
    };
  });

  const rewards: ScratchCardStatus[] = ["jackpot", "win", "draw", "lose", "emoji"];

  function getBgColor(cardType: CardType) {
    switch (cardType) {
      case "red":
        return "bg-red-500";
      case "green":
        return "bg-green-600";
      case "blue":
        return "bg-blue-500";
    }
  }

  function getBgBtnColor(cardType: CardType) {
    switch (cardType) {
      case "red":
        return "bg-red-500 hover:bg-red-600";
      case "green":
        return "bg-green-600 hover:bg-green-700";
      case "blue":
        return "bg-blue-500 hover:bg-blue-600";
    }
  }
</script>

<canvas bind:this={canvas} class="fixed pointer-events-none inset-0 w-[100vw] h-[100vh] z-[60]" />

<AlertDialog.Root
  open={true}
  closeOnEscape={false}
  closeOnOutsideClick={false}
  onOpenChange={(open) => {
    if (!open) {
      scratchCard.reset();
    }
  }}>
  <AlertDialog.Content class="bg-[#e7dccf] max-w-xl py-2 px-4 gap-3 md:rounded-none">
    <div>
      <div class="text-center font-pixel text-3xl text-[#594940]">YOUR BALANCE: {$jukebox.qty} pts</div>
      <div class={cn("w-full h-1", getBgColor($scratchCard.cardType))} />
    </div>
    <div class="grid grid-cols-1 gap-y-4 sm:grid-cols-[1fr_auto]">
      <div class="h-full py-2 mr-2 bg-[#f2ece7] rounded-lg grow z-10">
        <div class={cn("font-pixel tracking-wider text-xl rounded-lg text-center mx-2 mb-1", getBgColor($scratchCard.cardType))}>REWARDS</div>
        <div class="text-primary-foreground grid grid-rows-5">
          {#each rewards as reward}
            <RewardsRow type={reward} highlighted={$scratchCard.status === reward} cardType={$scratchCard.cardType} />
          {/each}
        </div>
      </div>
      <div class="relative">
        {#if $scratchCard.status}
          <!-- <div
            transition:fade={{ delay: 500, duration: 500 }}
            class="absolute inset-0 flex flex-col items-center justify-center text-7xl font-bold bg-background/70 z-20 pointer-events-none">
            <p class="uppercase mb-3">{$scratchCard.status}</p>
            <p>{$scratchCard.points} pts</p>
          </div> -->
        {/if}
        <div class="grid grid-rows-2 grid-cols-3 gap-2 p-1">
          {#key $scratchCard.key}
            {#each Array(6) as _, i}
              <div class="relative flex items-center justify-center select-none">
                <div class="z-10">
                  <ScratchCircle
                    radius={50}
                    disabled={!!$scratchCard.status && !$scratchCard.requestedValues.has(i)}
                    onScratch={(e) => {
                      generateFlecks(e);
                      handleScratchMove(i);
                    }} />
                </div>
                <div class="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
                  <ScratchImage type={$scratchCard.values[i]} status={$scratchCard.status} cardType={$scratchCard.cardType} />
                </div>
              </div>
            {/each}
          {/key}
        </div>
        <ScratchCardFooter cardType={$scratchCard.cardType} />
      </div>
    </div>
    <AlertDialog.Footer class="sm:justify-center mt-1">
      <AlertDialog.Action
        class={cn("text-primary font-pixel text-2xl", getBgBtnColor($scratchCard.cardType))}
        disabled={!$scratchCard.status || $jukebox.qty < PRICE_PER_CARD}
        on:click={(e) => {
          e.preventDefault();
          scratchCard.reset(true);
          game.connection.chat("/card");
        }}>Try Again ({PRICE_PER_CARD} pts)</AlertDialog.Action>
      <AlertDialog.Cancel
        class="font-pixel text-2xl"
        on:click={() => {
          if (!$scratchCard.status) {
            game.connection.chat(`/card give-up`);
          }
        }}>Close</AlertDialog.Cancel>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
