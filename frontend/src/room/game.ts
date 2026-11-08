import type { Group, PSet, Room as ServerRoom } from "$backend/types";
import { extractAllFromArray, Random } from "../utils";
import { playsound, clicksound, completesound, locksound } from "./audio";
import type { Renderer } from "./render";
import { loadFromLocalStorage } from "./settings";
import { refreshLockedDisplay, updateDonePercent } from "./ui-elements";
import type { JukeRecord } from "./types";
import { ROOM_NAME, game } from "$room";
import { CPUMaskRenderer } from "./cpu-renderer";
import { GPUMaskRenderer } from "./gpu-renderer";
import { GPU4Renderer } from "./gpu4-renderer";
import { gameStatus, otherSettingsSnapshot, roomState, settings, videoElements } from "$lib/room/stores";
import { writable } from "svelte/store";
import { GameState } from "./game-state";
import { GameActions } from "./game-actions";
import { GameRules } from "./game-rules";
import { GameViewState } from "./game-view-state";
import { GameConnection } from "./game-connection";
import { RoomMessageHandler } from "./room-message-handler";
import { goto } from "$app/navigation";
import { UiStateHandler } from "./ui-state-handler";
import { RandomSequencer, type Sequencer } from "./sequencer";
import type { Entity, EntityManager } from "./Entity";
import { Direction, FunnyHahaManager, ImpactTextManager, JigChan, JiggieChanManager, LargeBugManager, PollManager, NotesManager } from "./EntityManager";
import { MediaSetLoader, type MediaSetDownloadResult } from "./media-set-loader";
import { RoomCommandsInterpolator } from "./room-commands-interpolator";
import { getGPUDiags, getIntent } from "$lib/utils";

export const rendererStore = writable<Renderer | null>(null);

import { Permissions } from "$lib/room/permissions";
import type { vec2 } from "./vec2";
import type { PieceData } from "./jig-generation";

export type User = {
  id: number;
  name: string;
  color: string;
  isHost: Permissions;
  hasToken?: boolean;
  highlight?: number[];
  isMe?: boolean;
  avatar?: string;
  banner?: string;
};

export type Point = {
  x: number;
  y: number;
};

export type Curve = {
  flip: boolean;
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
};

export type PieceShape = ({
  width: number;
  height: number;
} & PieceData);

export type VoronoiShape = {
  type: 'voronoi';
  neighbors: {
    id: number;
    relativePosition: [number, number];
  }[];
  curves: (Curve | undefined)[];
  site: vec2;
  bboxCenter: vec2;
  cellid: number;
  width: number;
  height: number;
  geometry: vec2[];
}

export type GamePiece = {
  index: number; // index in set
  /** Column in the set */
  xi: number;
  /** Row in the set */
  yi: number;
  /** Clockwise rotation in 90 degree increments. [0-3] */
  rot: number;
  /** Face supposed to be visible */
  f: boolean;
  /** Horizontal world-space center-to-center offset relative to its group */
  x: number;
  /** Vertical world-space center-to-center offset relative to its group */
  y: number;

  puzzle: PieceShape;
  puzzleX: number;
  puzzleY: number;
  globalX: number;
  globalY: number;
  type: number;
};

// represents a piece in term of where in the mask it is.
export type MaskPiece = GamePiece & {
  spriteX: number; // pixel coordinates in real texture
  spriteY: number;
  spriteW: number;
  spriteH: number;
  tx: number; // texture coordinates in real texture
  ty: number;
  tw: number;
  th: number;
  tx2: number; // texture coordinates in mask texture
  ty2: number;
  tw2: number;
  th2: number;
};


export type GameGroup<PieceType = GamePiece> = Omit<Group, "indices"> & {
  angle: number;
  targetAngle: number;
  roll: number;
  targetRoll: number;

  user?: User;
  selectedByOther: boolean;

  /** World-space start X of a drag action */
  startX: number;
  /** World-space start Y of a drag action */
  startY: number;
  // dimensions in pixel encompassed by the group
  w: number;
  h: number;

  pieces: PieceType[];

  /** Flag indicating whether a groups's properties have changed
   * for partial redraws. */
  dirty?: boolean;
};

// this group type is used by mask renderers because of the way they render pieces
export type MaskGroup = GameGroup<MaskPiece>;

export const random = new Random(123);

type RoomDefinition = ServerRoom;

const random2 = new Random(123);

export class Game extends EventTarget {
  loaded = false;
  dataInitialized = false;

  state: GameState;
  rules: GameRules;
  view: GameViewState;

  records: JukeRecord[] = [];

  roomUsers: User[] = [];

  roomdef: RoomDefinition = {} as RoomDefinition;

  roomName?: string;

  groupToGameGroup(group: Group) {
    const ownerId = +group.dragged! || +group.selected! || 0;
    const isSelectedByMe = +group.selected! === this.connection?.playerId;
    const isOwnedByMe = ownerId === this.connection?.playerId;
    return ({
      set: 0 | group.set,
      id: group.id,
      ids: group.ids || [],
      x: group.x,
      y: group.y,
      w: 0,
      h: 0,
      locked: !!group.locked,
      rot: 0 | (group.rot || 0),
      f: group.f || false,
      roll: group.f ? -1 : 1,
      targetRoll: group.f ? -1 : 1,
      angle: (0 | (group.rot || 0)) * Math.PI * 0.5,
      targetAngle: (0 | (group.rot || 0)) * Math.PI * 0.5,
      pieces: group.indices.map((t) => this.state.setPieces[0 | group.set][t]),
      user: isOwnedByMe ? undefined : this.getUserById(ownerId),
      selectedByOther: !!group.selected && !isSelectedByMe,
      selected: isSelectedByMe,
      dragged: false,
      startX: 0,
      startY: 0,
      rotp: group.rotp,
      dirty: true
    }) as GameGroup;
  }

  constructor() {
    super();
    this.state = new GameState();
    this.rules = new GameRules(settings, {} as RoomDefinition);
    this.view = new GameViewState();
  }

  getUserById(id: number) {
    return this.roomUsers.find((e) => e.id == id);
  }

  async doEntityStress() {
    const em = this.entities[0];
    const allocatedIds = new Set<number>();
    for (let i = 0; i < 72; ++i) {
      if (random2.next() < 0) {
        const did = [...allocatedIds.values()][~~(random2.next() * allocatedIds.size)];
        if (did === undefined) continue;
        em.dealloc(did);
        allocatedIds.delete(did);
      } else {
        let nid = 500;
        while (allocatedIds.has(nid)) nid = ~~(random2.next() * 1000) + 500;
        const ent = em.allocNew(nid, ~~(Math.random() * 72)) as JigChan;
        ent.x = random2.next() * 1000;
        ent.y = random2.next() * 1000;
        allocatedIds.add(nid);
      }
      await new Promise(requestAnimationFrame);
    }

    for (let did of allocatedIds) {
      em.dealloc(did);
      await new Promise(requestAnimationFrame);
    }
  }

  destroy() {
    this.interpolator?.cancelAll();
    this.connection?.close();
    this.connection = undefined!;
    this.roomdef = {} as RoomDefinition;
    this.renderer?.destroy();
    this.renderer = undefined;
    rendererStore.set(null);

    this.loaded = false;
    this.dataInitialized = false;
  }

  setRoomDef(def: RoomDefinition) {
    this.interpolator?.cancelAll();
    const wasLoaded = this.loaded;
    const mediaManifest = (sets: PSet[]) => JSON.stringify(sets.map(set => ({
      image: set.image,
      image2: set.image2,
      width: set.width,
      height: set.height,
      cols: set.cols,
      rows: set.rows,
      sites: set.sites
    })));
    const sameManifest = wasLoaded
      && mediaManifest(this.roomdef.sets || []) === mediaManifest(def.sets);
    const canReconcile = this.dataInitialized && sameManifest;
    def.cornerJitter = +def.cornerJitter;
    def.tabSize = +def.tabSize;
    def.jitter = +def.jitter;
    
    this.roomdef = def;
    random.state = def.seed;

    this.state.sets = def.sets;
    this.rules.roomdef = this.roomdef;

    this.view.boardHeight = def.boardHeight || 0;
    this.view.boardWidth = def.boardWidth || 0;

    let sets = def.sets;
    for (let s of sets) {
      s.isvideo = ['webm', 'mp4'].some(t => s.image.includes(t));
      if (s.image2)
        s.isvideo2 = ['webm', 'mp4'].some(t => s.image2!.includes(t));
    }

    if (canReconcile) {
      this.view.stopActiveOperations();
      this.view.stickied.clear();
      this.syncRoomDefGroups();
      this.dispatchEvent(new Event("state-resynced"));
      return;
    }
    if (wasLoaded && !this.dataInitialized && sameManifest) {
      // Initialization already uses this media manifest and will materialize
      // the latest room snapshot when it reaches syncRoomDefGroups().
      return;
    }
    if (wasLoaded) {
      this.view.stopActiveOperations();
      this.view.stickied.clear();
      this.loaded = false;
      this.dataInitialized = false;
    }

    if (!this.loaded && ROOM_NAME && loadFromLocalStorage("viewRoom") !== ROOM_NAME) {
      // Reset the camera on the first viewing of the room
      resetView();
    }

    this.loaded = true;
    this.dispatchEvent(new Event("data-loaded"));
  }

  appendGroups(groups: Group[]) {
    this.roomdef.groups.push(...groups);
    const newgamegroups = groups.map(g => this.groupToGameGroup(g))
    newgamegroups.forEach(g => this.state.updatePieceCoordinates(g))
    this.state.groups.push(...newgamegroups);
    for (const g of newgamegroups) {
      this.state.transformedboard[g.id] = g;
      for (const i of g.ids)
        this.state.transformedboard[i] = g;
    }
  }

  syncRoomDefGroups() {
    const groups = this.roomdef.groups;
    const transformedGroups = groups.map(g => this.groupToGameGroup(g));

    this.state.syncGroups(transformedGroups);
    this.uiStateHandler?.recountHeldPieces(this.state.groups);
  }

  async resetEntityManagers() {
    this.entities.forEach(e => e.die());
    this.entities = (await Promise.all(this.managers.map(async m => await new m().init(this)))) as any as Game['entities'];
  }

  init(roomName?: string) {
    if (roomName) {
      this.roomName = roomName;
      this.connection = new GameConnection(this.roomName);
      this.uiStateHandler = new UiStateHandler();
      this.interpolator = new RoomCommandsInterpolator(this, false);
      const msgHandler = new RoomMessageHandler(this, this.interpolator);
      this.connection.onMessage = (msg) => msgHandler.handle(msg);
      this.connection.addEventListener("connecting", () => gameStatus.set({ status: "connecting" }));
      this.connection.addEventListener("connected", () => gameStatus.set({ status: "loading" }));
      this.connection.addEventListener("disconnected", (evt) => {
        this.interpolator?.cancelAll();
        this.loaded = false;
        this.dataInitialized = false;
        this.dispatchEvent(new Event("disconnected"));

        const { reason, retry } = (evt as CustomEvent).detail as { reason: string; retry: boolean; };
        if (reason.includes("not authenticated")) {
          goto("/login?room=" + this.roomName);
          return;
        }

        const status = retry ? "connecting" : "error";
        gameStatus.set({ status, text: reason });
      });
      this.connection.connect();
    }

    this.actions = new GameActions(this.state, this.view, this.rules, this.connection, (event) => this.dispatchEvent(event));
  }

  onEntityPick?: (ent: Entity, emg: EntityManager) => void;
  pickEntity(cb: (ent: Entity, emg: EntityManager) => void) {
    this.onEntityPick = cb;
    return () => {
      delete this.onEntityPick;
    };
  }

  onNextClick?: (x: number, y: number) => void;
  nextClick(cb: (x: number, y: number) => void) {
    this.onNextClick = cb;
    return () => {
      delete this.onNextClick;
    };
  }

  injectSet(arg: { set: PSet, groups: Group[], res: MediaSetDownloadResult }, fixup_ids = false) {
    const r = this.roomdef;
    const b = this.roomdef.pieces;
    const s = this.roomdef.sets.length;
    r.sets.push(arg.set);
    const g = r.groups;
    if (fixup_ids)
      arg.groups.forEach(g => {
        g.id += b;
        g.set = s;
      });

    this.dispatchEvent(new CustomEvent("new_set", { detail: arg }));
    this.appendGroups(arg.groups);

    for (let g of this.state.groups)
      this.state.updateGroupPieces(g)
    r.pieces += arg.set.cols * arg.set.rows;
  }

  removeSet(set: PSet) {
    const r = this.roomdef;
    const idx = r.sets.indexOf(set);
    if (idx === -1) return;
    this.dispatchEvent(new CustomEvent("prune_set", { detail: set }));
    extractAllFromArray(r.sets, e => e === set)
    extractAllFromArray(r.groups, e => e.set === idx);
    extractAllFromArray(this.state.groups, e => e.set === idx);
    extractAllFromArray(this.state.sets, e => e === set);
    extractAllFromArray(this.view.pickedGroups, e => e.set === idx);
    this.state.groups.forEach(g => g.dirty = true);
    r.pieces -= set.cols * set.rows;
  }

  async commitSet(arg: { set: PSet, groups: Group[], res: MediaSetDownloadResult }) {
    // upload the file somewhere
    const intent = await getIntent(this.roomdef.ext?.selfdestruct);
    const blob = await (await fetch(arg.res.url)).blob();
    const file = new File([blob], "image");
    await intent.uploadFile(file);
    this.connection.addSet(intent.toString(), arg.set, arg.groups, [this.roomdef.boardWidth, this.roomdef.boardHeight]);
  }

  actions!: GameActions;

  renderer?: Renderer;
  connection!: GameConnection;
  uiStateHandler?: UiStateHandler;
  interpolator?: RoomCommandsInterpolator;
  sequencer: Sequencer = new RandomSequencer();
  managers = [JiggieChanManager, LargeBugManager,
    ImpactTextManager, PollManager,
    FunnyHahaManager, NotesManager
  ] as const;
  entities: InstanceTuple<Game['managers']> = [] as any;
}

type InstanceTuple<ConstructorTuple> = {
  [K in keyof ConstructorTuple]: ConstructorTuple[K] extends new (...args: any[]) => infer R ? R : never;
};

/**
 * Move pieces and/or pan the view
 * @param pageX Screen-space X
 * @param pageY Screen-space Y
 * @param preventPanning
 */
export function dragMove(pageX: number, pageY: number, preventPanning?: boolean) {
  game.actions.dragMove(pageX, pageY, preventPanning);
}

export function resetView() {
  // Zoom to fit
  const xScale = innerWidth / game.view.boardWidth;
  const yScale = innerHeight / game.view.boardHeight;
  const viewScale = limitZoom(xScale < yScale ? xScale : yScale);
  game.actions.setViewPos(
    (innerWidth / viewScale - game.view.boardWidth) / 2,
    (innerHeight / viewScale - game.view.boardHeight) / 2,
    viewScale
  );
}

export enum Alignment {
  TopLeft = 0x11,
  Top = 0x21,
  TopRight = 0x41,
  Left = 0x12,
  Center = 0x22,
  Right = 0x42,
  BottomLeft = 0x14,
  Bottom = 0x24,
  BottomRight = 0x44,
}

export function limitZoom(scale: number) {
  const zoomX2 = !!settings.snapshot().imblind;
  return game.actions.limitZoom(scale, zoomX2);
}

export function canMultiselect() {
  return game.rules.canMultiselect() && !game.rules.sticky;
}

export function canRectselect() {
  // rectangle select is possible when in sticky mode and already committed to a piece, as all the other pieces
  // behave as if locked, this makes it easier to just rectangle select the whole board in case you lose sight of your piece
  if (game.rules.sticky) {
    return game.view.stickied.size == 2;
  }
  // TODO: anyone with changeroomsettings right should be able
  return (canMultiselect() && !game.roomdef.norectselect) || otherSettingsSnapshot?.host.ChangeRoomSettings;
}

export function releaseHeldGroups() {
  game.actions.releaseHeldGroups();

  if (!game.rules.canMultiselect()) {
    game.actions.deselectSelected();
  }
}

export function enableGameEvents(game: Game) {
  game.addEventListener("merge", ((event: CustomEvent) => {
    const group = event.detail.group;
    game.interpolator?.stop(group, group.x, group.y);

    const isMe = event.detail.isMe;

    const volume = isMe ? 1 : 0.5;
    playsound(clicksound, volume);

    if (game.state.isGameEnded()) {
      roomState.markAsCompleted();
      playsound(completesound);
    }

    updateDonePercent();

    // TODO: optimize with extra flag in the merge event
    // so this will be called only when groupA or groupB is locked
    refreshLockedDisplay();
  }) as EventListener);

  game.addEventListener("lock", () => {
    playsound(locksound);
    refreshLockedDisplay();
  });

  game.addEventListener("unlock", () => {
    playsound(locksound);
    refreshLockedDisplay();
  });
}

export function getSupportedRenderer(renderer: string): { renderer: string; reason?: string; } {
  try {
    getGPUDiags();
  } catch (e) {
    if (e === 'no webgl2 support') {
      const newrenderer = getSupportedRenderer("cpu");
      if (newrenderer.reason) {
        throw new Error("Room requires hardware acceleration, but it is not available");
      }
      return { renderer: "cpu", reason: 'Hardware acceleration is not available in your browser' };
    }
  }
  if (renderer != "gpu4") {
    if (game.state.sets.length > 4) {
      return { renderer: "gpu4", reason: 'This room has more than 4 sets, the "Quality" renderer is required' };
    }
    if (game.state.sets.some((s) => s.image.endsWith(".webm") || s.image.endsWith(".mp4"))) {
      return { renderer: "gpu4", reason: 'This room uses a video, the "Quality" renderer is required' };
    }
    if (game.roomdef.ext?.rotting) {
      return { renderer: "gpu4", reason: 'This room is rotting, the "Quality" renderer is required' };
    }
    if (game.roomdef.ext?.voronoi) {
      return { renderer: "gpu4", reason: 'This room uses voronoi-shaped pieces, the "Quality" renderer is required' };
    }
    if (game.roomdef.noedge) {
      // shouldn't technically, but too lazy to update old renderer
      return { renderer: "gpu4", reason: 'This room uses no edge pieces, the "Quality" renderer is required' };
    }
  }

  return { renderer };
}

export function createRenderer(game: Game, renderer: string, canvas: HTMLCanvasElement | OffscreenCanvas): Renderer {
  switch (renderer) {
    case "gpu":
      return new GPUMaskRenderer(game, canvas);
    case "cpu":
      return new CPUMaskRenderer(game, canvas);
    default:
    case "gpu4":
      return new GPU4Renderer(game, canvas);
  }
}

export async function initRoomData(game: Game) {
  const renderer = game.renderer;
  if (!renderer) {
    throw new Error("No renderer");
  }

  gameStatus.set({ status: "loading" });

  const mediaPromises = MediaSetLoader.preparePromises(game.state.sets, (done, total) => {
    gameStatus.set({ status: "loading", text: `${done}/${total}` });
  });

  const isGpu4 = renderer instanceof GPU4Renderer;
  if (!isGpu4) {
    const media = await MediaSetLoader.waitAll(mediaPromises);
    renderer.uploadTextures(media);
    await renderer.init();
    gameStatus.set({ status: "loaded" });
  } else {
    await renderer.init();
    const media = await MediaSetLoader.waitAsap(mediaPromises, (mediaItem) => {
      renderer.uploadTexture(mediaItem);
    });
    // sync preview elements
    const videoItems = media.filter((x) => x.isVideo).map((x) => x.element as HTMLVideoElement);
    if (videoItems.length > 0) {
      videoElements.addElements(videoItems);
    }
    gameStatus.set({ status: "loaded" });
  }

  rendererStore.set(renderer);
  game.view.stopActiveOperations();
  game.syncRoomDefGroups();
  await game.resetEntityManagers();

  if (game.state.isGameEnded()) {
    game.view.borderOpacity = 0;
    roomState.markAsCompleted();
  }

  refreshLockedDisplay();
  updateDonePercent();
}
