import type { Game } from "$room/game";
import { getContext } from "svelte";

export const useGame = () => {
    return getContext<Game>("game");
};
