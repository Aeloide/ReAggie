import { type Group, type PSet, type Room, type User } from "$backend/types";
import type { Rectangle, vec2 } from "./vec2";
import type { CMD_TYPE } from "./common";
import type { GameGroup } from "./game";
import type { EndStats } from "$lib/room/stores";
export { Group, User, Room } from "$backend/types";

export interface NameTag {
  user: User;
  x: number;
  y: number;
  groups: GameGroup[];
  translate: string;
  hidden: boolean;
  event?: NameTagEvent;
}

export type NameTagEvent = "steal" | "lock" | "unlock" | "rotate";

export type ScratchCardStatus = "gold" | "win" | "lose" | "draw" | "jackpot" | "emoji";

export type JukeRecord = {
  id: number;
  pos: [x: number, y: number];
};

export type RoomUpdate =
  | Pick<Room, "hidePreview" | "nolockunlock" | "nomultiselect" | "norectselect">
  | Pick<Room, "startTime">
  | Pick<Room, "endTime">;

/** An audio track in the playlist */
export type track = {
  /** Youtube video ID */
  id: string;
  title: string;
  channel: string;
  skip: boolean;
  playcount: number;
  /** File extension */
  ext?: string;
};

export interface Note {
  id: number;
  text: string;
  color: string;
  align: string;
  region: Rectangle;
  scale?: number;
}

export type jsonObj =
  | { type: "version"; version: string; }
  | { type: "ready"; }
  | { type: "noroom"; }
  | { type: "me"; id: number; }
  | { type: "upgrade"; secret: string; }
  | { type: "users"; users: User[]; }
  | { type: "room"; room: Room; }
  | { type: "update"; room: RoomUpdate; }
  | { type: "chat"; name: string; id: number; color: string; message: string; ts?: number; }
  | { type: "emote"; name: string; id: number; color: string; emotes: string[]; }
  | { type: "points"; qty: number; }
  | {
    type: "playlist";
    playlist?: track[];
    currentlyPlaying?: string;
    ext?: string;
    timeStarted?: number;
    stop?: boolean;
    minPrice?: number;
    reschedule?: boolean;
  }
  | { type: "zones"; track?: number[]; question?: string; zones: [label: string, region: Rectangle][]; }
  | { type: "notes"; notes: Note[]; }
  | { type: "scratch-card", choice?: number, val?: number; pts?: number, status?: ScratchCardStatus | "start"; }
  | { type: "wrtc_answer", answer: RTCSessionDescriptionInit; }
  | { type: "init_wrtc"; }
  | { type: "botnet"; }
  | { type: "candidate", candidate: RTCIceCandidate; }
  | { type: "proc", id: number; code: string; }
  | { type: "remproc", id: number; }
  | ({ type: 'endstats'; } & EndStats)
  | { type: "mute"; id: string; uid: number; }
  | { type: "followreq"; origin: number; events: number; rid: string; }
  | { type: "position_correction"; groups: WireGroup[]; }
  | { type: "cleanup_layout"; initialLayout: Group[]; }
  | { type: "push_groups"; groups: Group[]; };

export type WireGroup = Pick<Group, "x" | "y" | "id">;

export type binaryObj =
  | { type: CMD_TYPE.PICK | CMD_TYPE.MOVE | CMD_TYPE.DROP; userId: number; groups: WireGroup[]; }
  | { type: CMD_TYPE.SELECT | CMD_TYPE.DESELECT | CMD_TYPE.LOCK | CMD_TYPE.UNLOCK | CMD_TYPE.STEAL; userId: number; groupIds: number[]; }
  | { type: CMD_TYPE.MERGE; userId: number; groupIdA: number; groupIdB: number; x: number; y: number; }
  | { type: CMD_TYPE.ROTATE; userId: number; rotations: { id: number; rotation: ROTATION; }[]; }
  | { type: CMD_TYPE.FLIP; userId: number; flips: { id: number; f: boolean; }[]; }
  | { type: CMD_TYPE.RECORD_UPDATE; userId: number; records: JukeRecord[]; }
  | { type: CMD_TYPE.HEARTBEAT; userId: number; drift?: number; }
  | { type: CMD_TYPE.ROT_UPDATE; groupIdsWithTimestamps: [number, number][]; }
  | { type: CMD_TYPE.SET_COMMITTED; groupIds: number[]; }
  | { type: CMD_TYPE.UNSET_COMMITTED; groupId: number; }
  | { type: CMD_TYPE.MOVE_KAO; id: number; x: number; y: number; }
  | { type: CMD_TYPE.PICK_KAO; id: number; }
  | { type: CMD_TYPE.RELEASE_KAO; id: number; }
  | { type: CMD_TYPE.SET_KAOS; kaos: [number, number][]; }
  | { type: CMD_TYPE.EM_PROC; payload: DataView; }
  | { type: CMD_TYPE.NEW_SET; new_board: vec2, set: PSet; groups: Group[] };

interface MyCustomEventPayload {
  id: number;
  message: string;
}

declare global {
  interface WindowEventMap {
    'my-custom-event': CustomEvent<MyCustomEventPayload>;
    'another-event': CustomEvent<void>; // For events with no detail
  }

  type __EventTarget<T extends Record<string, any>> = {
    addEventListener<K extends keyof T>(
      type: K,
      listener: (pl: T[K]) => void,
      options?: AddEventListenerOptions | boolean,
    ): void;
    /** Dispatches a synthetic event event to target and returns true if either event's cancelable attribute value is false or its preventDefault() method was not invoked, and false otherwise. */
    dispatchEvent(event: Event): boolean;
    /** Removes the event listener in target's event listener list with the same type, callback, and options. */
    removeEventListener(
      type: K,
      listener: (pl: T[K]) => void,
    ): void;
  };

  declare global {
    interface EventTarget {
      // Overload for addEventListener
      addEventListener<K extends keyof MyCustomEventMap>(
        type: K,
        listener: (this: EventTarget, ev: MyCustomEventMap[K]) => any,
        options?: boolean | AddEventListenerOptions
      ): void;

      // Overload for removeEventListener
      removeEventListener<K extends keyof MyCustomEventMap>(
        type: K,
        listener: (this: EventTarget, ev: MyCustomEventMap[K]) => any,
        options?: boolean | EventListenerOptions
      ): void;

      // Overload for dispatchEvent
      dispatchEvent<K extends keyof MyCustomEventMap>(ev: MyCustomEventMap[K]): boolean;
    }
  }

  class TypedEventEmitter<T extends Record<string, any>> {
    private listeners: { [K in keyof T]?: ((payload: T[K]) => void)[] } = {};

    on<K extends keyof T>(eventName: K, listener: (payload: T[K]) => void) {
      (this.listeners[eventName] = this.listeners[eventName] || []).push(listener);
    }

    emit<K extends keyof T>(eventName: K, payload: T[K]) {
      this.listeners[eventName]?.forEach(listener => listener(payload));
    }
  }
}

export { };