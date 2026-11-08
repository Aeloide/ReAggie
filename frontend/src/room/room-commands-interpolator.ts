import { spring, type Spring } from "svelte/motion";
import type { Game, GameGroup } from "./game";

type SpringMapValue = {
  spring: Spring<{ x: number; y: number }>;
  invalidate: () => void;
};

export class RoomCommandsInterpolator {
  private springs = new Map<GameGroup, SpringMapValue>();

  constructor(private readonly game: Game, private readonly instant = false) {}

  set(group: GameGroup, x: number, y: number) {
    if (this.instant) {
      this.updateGroupPos(group, x, y);
    } else {
      const spr = this.getOrCreate(group);
      spr.set({ x, y });
    }
  }

  stop(group: GameGroup, x: number, y: number) {
    if (this.instant) {
      this.updateGroupPos(group, x, y);
      return;
    }

    const spr = this.springs.get(group);
    if (spr) {
      spr.spring.set({ x, y }, { hard: true });
      spr.invalidate();
      this.springs.delete(group);
    } else {
      this.updateGroupPos(group, x, y);
    }
  }

  cancel(group: GameGroup) {
    const spr = this.springs.get(group);
    if (!spr) return;
    spr.invalidate();
    this.springs.delete(group);
  }

  cancelAll() {
    for (const { invalidate } of this.springs.values()) {
      invalidate();
    }
    this.springs.clear();
  }

  private getOrCreate(group: GameGroup) {
    const spr = this.springs.get(group);
    if (spr) {
      return spr.spring;
    }

    const newSpring = spring(
      { x: group.x, y: group.y },
      {
        stiffness: 0.07,
        damping: 0.35,
      }
    );

    const invalidate = newSpring.subscribe(({ x, y }) => {
      this.updateGroupPos(group, x, y);
    });

    this.springs.set(group, { spring: newSpring, invalidate });
    return newSpring;
  }

  private updateGroupPos(group: GameGroup, x: number, y: number) {
    group.x = x;
    group.y = y;
    this.game.state.updatePieceCoordinates(group);
  }
}
