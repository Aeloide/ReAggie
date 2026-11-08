import type { ScratchCardStatus } from "$room/types";
import { writable } from "svelte/store";
import type { CardType } from "./types";

interface ScratchCardState {
  open: boolean;
  key: number;
  cardType: CardType;
  values: number[];
  requestedValues: Set<number>;

  status?: ScratchCardStatus;
  points?: string;
}

const ALL_CARD_TYPES: CardType[] = ["red", "green", "blue"];

function createEmpty(): ScratchCardState {
  return {
    open: false,
    key: Math.random(),
    cardType: ALL_CARD_TYPES[Math.floor(Math.random() * ALL_CARD_TYPES.length)],
    values: [],
    requestedValues: new Set(),
  };
}

export const scratchCard = (() => {
  const store = writable<ScratchCardState>(createEmpty());

  return {
    subscribe: store.subscribe,
    open: () => store.update((x) => ({ ...x, open: true })),
    reset: (preserveOpen?: boolean) => {
      const empty = createEmpty();
      if (preserveOpen) empty.open = true;
      store.set(empty);
    },
    setValue(choice: number, value: number) {
      store.update((x) => {
        const values = [...x.values];
        values[choice] = value;
        return { ...x, values };
      });
    },
    markAsRequested(choice: number) {
      store.update((x) => {
        const requestedValues = new Set(x.requestedValues);
        requestedValues.add(choice);
        return { ...x, requestedValues };
      });
    },

    complete(status: ScratchCardStatus, points: number) {
      store.update((x) => ({ ...x, status, points: status === "emoji" ? "-all" : points.toString() }));
    },
  };
})();
