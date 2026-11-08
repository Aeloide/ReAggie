import type { Rectangle } from "$room/vec2";

export interface GameStatus {
  status: "connecting" | "loading" | "loaded" | "error" | 'authentication required';
  text?: string;
}

export interface JukeboxState {
  minprice: number;
  qty: number;
  songRequest?: JukeBoxSongPlayRequest;
}

export interface JukeBoxSongPlayRequest {
  timeStarted: number;
  mid: string;
  ext?: string;
}

export interface ChatMessage {
  id: number;
  name: string;
  color: string;
  message: string;
  timeStamp?: number;
}

export interface EmoteMessage {
  id: number;
  name: string;
  color: string;
  emotes: string[];
}

export interface RoomState {
  timerText: string;
  lockedPiecesCount: number;
  donePercent: number;
  isCompleted: boolean;
}

export interface UserSettingsFormData {
  name: string;
  token: string | null;
  color: string;
  bg: string;
  bgTexture: string;
  hideusers: boolean;
  hidechat: boolean;
  hidenametags: boolean;
  mutesounds: boolean;
  mutechat: boolean;
  imblind: boolean;
  piecePickMode: string;
  renderer: string;
  antialias: 0 | 2 | 4 | 8;
  particle: number;
  hideosc: boolean;
  hideshadow: boolean;
  forcedesync: boolean;
  gamingmode: boolean;
  bingotoken: string;
  shadowQuality: string;
  shadowLightPos: { x: number, y: number, angle: number, magnitude: number, spread: number };
  persistentShadowGizmo: boolean;
}

export interface ActiveSong {
  id: string;
  progressSeconds: number;
  durationSeconds: number;
}

export interface BgColorPickerState {
  visible: boolean;
  color?: string;
  texture?: string;
}

export interface GamePoll {
  question?: string;
  zones: [string, Rectangle][];
}