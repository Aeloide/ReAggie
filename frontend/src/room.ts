import { Game, enableGameEvents } from "$room/game";
import { loadFloatSetting, loadFromLocalStorage, setLocalStorage } from "$room/settings";

declare global {
  const RELEASE: string;
}

export let game: Game;
export let ROOM_NAME: string = "";
export let ROOM_SECRET: string = "";
export let APP_VERSION: string = "1.8.0";

export const createGame = () => {
  game = new Game();
  return game;
};

export const initGame = (game: Game, roomName: string) => {
  ROOM_NAME = roomName;

  if (ROOM_NAME && ROOM_SECRET) setLocalStorage("secret:" + ROOM_NAME, ROOM_SECRET);

  game.init(roomName);

  tryRestoreRoomView(game);
  game.view.addEventListener("view-change", () => {
    if (game.roomName) {
      setLocalStorage("viewRoom", game.roomName);
      setLocalStorage("viewX", game.view.x);
      setLocalStorage("viewY", game.view.y);
      setLocalStorage("viewScale", game.view.scale);
    }
  });

  enableGameEvents(game);
};

function tryRestoreRoomView(game: Game) {
  if (loadFromLocalStorage("viewRoom") === game.roomName) {
    game.view.x = loadFloatSetting("viewX", 0);
    game.view.y = loadFloatSetting("viewY", 0);
    game.view.scale = loadFloatSetting("viewScale", 1);
  }
}
