import { Game, createRenderer } from "$room/game";
import type { GameState } from "$room/game-state";
import type { GameViewState } from "$room/game-view-state";
import { MediaSetLoader } from "$room/media-set-loader";
import { setFirstTextureLoadFinished } from "$room/render";
import { RoomCommandsInterpolator } from "$room/room-commands-interpolator";
import { RoomMessageHandler } from "$room/room-message-handler";
import type { ReplayLogEvent } from "./types";

export class ReplayPlayer {
  static async create(roomEvents: ReplayLogEvent[], sizePx: number, existingCanvas?: HTMLCanvasElement) {
    const game = new Game();
    game.init();

    const interpolator = new RoomCommandsInterpolator(game, true);
    const messageHandler = new RoomMessageHandler(game, interpolator);
    messageHandler.handle(roomEvents[0].data); // roomdef event

    const { view } = game;
    view.scale = Math.min(sizePx / view.boardWidth, sizePx / view.boardHeight);

    const width = Math.floor(view.boardWidth * view.scale);
    const height = Math.floor(view.boardHeight * view.scale);

    const canvasWidth = Math.floor(width * devicePixelRatio);
    const canvasHeight = Math.floor(height * devicePixelRatio);

    let canvas: HTMLCanvasElement | OffscreenCanvas;
    if (existingCanvas) {
      canvas = existingCanvas;

      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
    } else {
      canvas = new OffscreenCanvas(canvasWidth, canvasHeight);
    }

    const renderer = createRenderer(game, "gpu4", canvas);
    const mediaPromises = MediaSetLoader.preparePromises(game.state.sets);
    await renderer.init();
    renderer.uploadTextures(await MediaSetLoader.waitAll(mediaPromises));

    game.renderer = renderer;
    game.syncRoomDefGroups();

    const player = new ReplayPlayer(game, canvas, roomEvents.slice(1), messageHandler);
    setFirstTextureLoadFinished(true);
    player.render();

    return player;
  }

  private constructor(
    public game: Game,
    public canvas: HTMLCanvasElement | OffscreenCanvas,
    private logEvents: ReplayLogEvent[],
    private messageHandler: RoomMessageHandler
  ) {}

  private checkpoint?: { state: GameState; view: GameViewState };
  lastPlayedStepIndex = 0;

  buildCheckpoint() {
    const view = Object.assign({}, this.game.view);
    this.checkpoint = { state: structuredClone(this.game.state), view: structuredClone(view) };
  }

  playStepInstant(newIndex: number): boolean {
    if (this.lastPlayedStepIndex === newIndex) {
      return false;
    }

    let start = 0;
    const moveForward = this.lastPlayedStepIndex < newIndex;
    if (moveForward) {
      start = this.lastPlayedStepIndex;
    } else {
      if (!this.checkpoint) {
        throw new Error("Checkpoint is required");
      }

      Object.assign(this.game.state, structuredClone(this.checkpoint.state));
      Object.assign(this.game.view, structuredClone(this.checkpoint.view));
    }

    for (let j = start; j <= newIndex; j++) {
      const item = this.logEvents[j];
      this.messageHandler.handle(item.data);
    }

    this.lastPlayedStepIndex = newIndex;
    return true;
  }

  render() {
    if (this.game.rules.canRotate()) {
      for (const group of this.game.state.groups) {
        if (group.angle !== group.targetAngle) {
          group.dirty = true;
          group.angle = group.targetAngle;
        }
      }
    }

    this.game.renderer?.doRender();
  }

  async playAllStepsByFrames(totalFrames: number, callback: (frame: number, kf?: true) => Promise<void>) {
    // maybe the log messages should be processed by their timestamps instead of indices...

    let lastProcessed = 0;
    let k = 0;
    for (let i = 0; i < totalFrames; ++i) {
      let currentEvent = ~~((i / totalFrames) * this.logEvents.length);
      let eventsToProcess = currentEvent - lastProcessed;
      for (let n = 0; n < eventsToProcess; ++n) {
        const item = this.logEvents[k++];
        this.messageHandler.handle(item.data); // make it a key frame if a "large" event occured, like a /cleanup
        lastProcessed = currentEvent;
      }
      await callback(i);
    }

    // dirty hack to flush the remaining events
    while (k < this.logEvents.length) {
      const item = this.logEvents[k++];
      this.messageHandler.handle(item.data);
    }

    await callback(totalFrames, true);
    await callback(totalFrames + 80, true); // hold the final board state for a bit
  }

  destroy() {
    this.game.destroy();
  }
}
