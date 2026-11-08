import { send_system } from "../room-utils.js";
import { Room, UserPrivate } from "../types.js";
import { shuffleArray } from "../utils.js";
import { PlaylistModule } from "./PlaylistModule.js";
import { ChatModule, Command, CommandRoomStateArg } from "./index.js";

const PRICE_PER_CARD = 5;

enum ImgValue {
  JigChan,
  Emoji,
  GoldenJig,
}

interface ScratchResult {
  choice?: number;
  val?: ImgValue;
  pts?: number;
  status?: "gold" | "win" | "lose" | "draw" | "jackpot" | "emoji" | "start";
}

class ScratchCard {
  values: ImgValue[] = [];
  choices: number[] = [];

  constructor() {
    this.values = [
      ImgValue.Emoji,
      ImgValue.Emoji,
      ImgValue.Emoji,
      ImgValue.JigChan,
      ImgValue.JigChan,
      ImgValue.JigChan,
    ];

    if (Math.random() < 0.02) {
      this.values[~~(Math.random() * 6)] = ImgValue.GoldenJig;
    }

    shuffleArray(this.values);
  }

  scratch(choice: number): ScratchResult {
    if (this.choices.includes(choice)) {
      return { val: this.values[choice] };
    }

    this.choices.push(choice);
    return this.checkResult();
  }

  getEmojiRevealedCount() {
    return this.choices.filter((c) => this.values[c] === ImgValue.Emoji).length;
  }

  private checkResult(): ScratchResult {
    const choices = this.choices.map((c) => this.values[c]);
    const lastChoice = choices[choices.length - 1];

    const res: ScratchResult = {
      choice: this.choices[this.choices.length - 1],
      val: lastChoice,
    };

    if (lastChoice === ImgValue.GoldenJig) {
      return { ...res, pts: 100, status: "gold" };
    }

    if (choices.length === 2) {
      if (choices[0] === choices[1]) {
        return { ...res };
      }

      return { ...res, pts: PRICE_PER_CARD, status: "draw" };
    }

    if (choices.length === 3) {
      if (choices.every((x) => x === ImgValue.JigChan)) {
        return { ...res, pts: 100, status: "jackpot" };
      }

      if (choices.every((x) => x === ImgValue.Emoji)) {
        return {
          ...res,
          pts: Number.MIN_SAFE_INTEGER,
          status: "emoji",
        };
      }

      if (choices.filter((x) => x === ImgValue.JigChan).length === 2) {
        return { ...res, pts: 10, status: "win" };
      }

      if (choices.filter((x) => x === ImgValue.Emoji).length === 2) {
        return { ...res, pts: -10, status: "lose" };
      }
    }

    return { ...res };
  }
}

export class ScratchCardModule extends ChatModule {
  attachedroom?: Room;

  name = "scratch-card";

  commands: Command[] = [
    {
      name: "card",
      named_params: [],
      desc: `
Usage: /card
Effect: Spawns a scratch card (${PRICE_PER_CARD} pts)`,
      handler: ({ userp, user }, ...args) => {
        if (!this.plmodule) {
          send_system(
            userp,
            user,
            "Cards can only be used when the playlist module is enabled"
          );
          return false;
        }

        let card = this.scratchCards.get(userp.ipaddr);
        const userPts = this.plmodule.qtys[userp.ipaddr] || 0;

        const isGiveUp = args.includes("give-up");
        if (isGiveUp && card) {
          const emojiCount = card.getEmojiRevealedCount();
          if (emojiCount === 1) {
            const fee = -10;
            this.addPoints(userp, fee);
            send_system(userp, user, `What a loser... ${fee} pts.`);
          } else if (emojiCount === 2) {
            const halfPtsFee = -Math.floor(userPts / 2);
            this.addPoints(userp, halfPtsFee);
            send_system(
              userp,
              user,
              `What a loser... ${halfPtsFee} pts (1/2).`
            );
          }

          this.scratchCards.delete(userp.ipaddr);
          return true;
        }

        const isSpawn = args.length === 0;
        if (isSpawn) {
          if (!card) {
            if (userPts < PRICE_PER_CARD) {
              send_system(
                userp,
                user,
                `You need ${PRICE_PER_CARD} pts to spawn a card.`
              );
              return true;
            }

            card = new ScratchCard();
            this.scratchCards.set(userp.ipaddr, card);
            this.addPoints(userp, -PRICE_PER_CARD);
            this.sendResult(userp, { status: "start" });
            return true;
          }

          // attempt to skip card if it's already been played (after page reload)
          if (card.choices.length > 0) {
            this.scratchCards.delete(userp.ipaddr);

            if (card.getEmojiRevealedCount()) {
              this.addPoints(userp, -userPts);
              send_system(
                userp,
                user,
                "Good try, loser (say bye to all your points). Next time don't try to cheat!"
              );
              return true;
            }

            // it's okay to let the user play again for free
            this.sendResult(userp, { status: "start" });
            return true;
          }

          // the card was not touched yet, so it's okay to play it for free
          this.sendResult(userp, { status: "start" });
          return true;
        }

        if (!card) {
          send_system(userp, user, "No card to play");
          return true;
        }

        const choice = +args[0];
        const result = card.scratch(choice);
        if (result.pts !== undefined) {
          this.addPoints(userp, result.pts);
          this.scratchCards.delete(userp.ipaddr);
        }

        this.sendResult(userp, result);

        return true;
      },
    },
  ];

  private addPoints(userp: UserPrivate, pts: number) {
    const curPts = this.plmodule.qtys[userp.ipaddr] || 0;
    this.plmodule.qtys[userp.ipaddr] = Math.max(0, curPts + pts);
    this.plmodule.send_points(userp);
  }

  private sendResult(userp: UserPrivate, result: ScratchResult) {
    userp.conn.send(
      JSON.stringify({
        type: "scratch-card",
        ...result,
      })
    );
  }

  scratchCards: Map<string, ScratchCard> = new Map();

  plmodule!: PlaylistModule;
  override attach({ state, runtime }: CommandRoomStateArg): void {
    // module relies on playlist module for points
    const pl = runtime.modules.find((e) => e instanceof PlaylistModule) as
      | PlaylistModule
      | undefined;
    if (!pl) return;

    this.plmodule = pl;
  }
}
