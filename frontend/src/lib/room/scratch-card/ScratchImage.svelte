<script lang="ts">
  import emojiLoseUrl from "$lib/assets/scratch-card/Emoji_Lose.gif";
  import emojiWinUrl from "$lib/assets/scratch-card/Emoji_Win.gif";
  import emojiStillUrl from "$lib/assets/scratch-card/Emoji_Still.png";
  import jigChanLoseUrl from "$lib/assets/scratch-card/Jig_chan_Lose.gif";
  import jigChanWinUrl from "$lib/assets/scratch-card/Jig_chan_Winl.gif";
  import jigChanStillUrl from "$lib/assets/scratch-card/Jig_chan_still.png";
  import goldJigStillUrl from "$lib/assets/scratch-card/Gold_Jig_Piece.png";
  import goldJigWinUrl from "$lib/assets/scratch-card/Gold_Jig_Piece_win.gif";
  import type { ScratchCardStatus } from "$room/types";
  import type { CardType } from "./types";
  import { cn } from "$lib/utils";

  export let cardType: CardType;
  export let status: ScratchCardStatus | undefined = undefined;
  export let type: number | undefined;

  function getUrl(tp: typeof type, st: typeof status) {
    if (tp === undefined) {
      return;
    }

    if (tp === 2) {
      return st === "gold" ? goldJigWinUrl : goldJigStillUrl;
    }

    const chan = tp === 0;
    switch (st) {
      case "gold":
        return chan ? jigChanWinUrl : emojiWinUrl;
      case "jackpot":
      case "win":
        return chan ? jigChanWinUrl : emojiLoseUrl;
      case "emoji":
      case "lose":
        return chan ? jigChanLoseUrl : emojiWinUrl;
      case "draw":
        return chan ? jigChanWinUrl : emojiWinUrl;
      default:
        return chan ? jigChanStillUrl : emojiStillUrl;
    }
  }

  function getBorderColor(cardType: CardType) {
    switch (cardType) {
      case "red":
        return "border-red-500";
      case "green":
        return "border-green-600";
      case "blue":
        return "border-blue-500";
    }
  }
</script>

<img
  src={getUrl(type, status)}
  alt=""
  class={cn("h-full aspect-square border-4 bg-[#efdac2] rounded-full", getBorderColor(cardType))}
  style:image-rendering="pixelated" />
