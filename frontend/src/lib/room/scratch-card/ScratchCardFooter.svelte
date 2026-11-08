<script lang="ts">
  import { cn } from "$lib/utils";
  import type { CardType } from "./types";
  import jigChanFooterUrl from "$lib/assets/scratch-card/jig-chan-footer.png";
  import gieChanFooterUrl from "$lib/assets/scratch-card/gie-chan-footer.png";

  export let cardType: CardType;

  $: config = getConfig(cardType);

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

  type ViewConfig = {
    footerImgUrl: string;
    footerImgPosClass: string;
    textPaddingClass: string;
    textLineOne: string;
    textLineTwo: string;
  };

  function getConfig(cardType: CardType): ViewConfig {
    switch (cardType) {
      case "green":
        return {
          footerImgUrl: jigChanFooterUrl,
          footerImgPosClass: "left-1",
          textPaddingClass: "pl-20",
          textLineOne: "NEED HELP WITH A JIG?",
          textLineTwo: "TYPE /SPAWN",
        };
      case "red":
      case "blue":
      default:
        return {
          footerImgUrl: gieChanFooterUrl,
          footerImgPosClass: "right-4",
          textPaddingClass: "pr-20",
          textLineOne: "FIND THE GOLD JIG PIECE",
          textLineTwo: "AND WIN INSTANTLY!!",
        };
    }
  }
</script>

<div class="hidden sm:block relative">
  <div class={cn("w-[calc(100%+16px)] -ml-4 mt-4 flex items-center rounded font-pixel", getBgColor(cardType))}>
    <div class={cn("w-[calc(100%-4px)] pl-4 my-1 py-1 bg-background/25 border-2 rounded", config.textPaddingClass)}>
      <div class="text-center text-xl tracking-widest leading-4">
        <div>{config.textLineOne}</div>
        <div>{config.textLineTwo}</div>
      </div>
    </div>
  </div>

  <div class={cn("absolute top-0 h-full", config.footerImgPosClass)}>
    <img src={config.footerImgUrl} style:image-rendering="pixelated" alt="" class="h-full" />
  </div>
</div>
