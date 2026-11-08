import type { SerializedImageLayoutConfig } from "./layoutStore";

export interface PreviewItem {
  isImage: boolean;
  size: number;
  objectUrl: string;
}

export interface MediaItem {
  item: PreviewItem;
  width: number;
  height: number;
  size: number;
  element: HTMLImageElement | HTMLVideoElement;
}

export interface PSetGenerated {
  cols: number;
  rows: number;
  height: number;
  width: number;
  imageWidth: number;
  imageHeight: number;
  image: string;
}

export interface PSet extends PSetGenerated {
  pieceHeight: number;
  pieceWidth: number;
  maskY: number;
  maskX: number;
}

export interface RoomSettings {
  pieces: number;
  rotation: boolean;
  flipping: boolean;
  edges: boolean;
  /** disable preview */
  preview: boolean;
  votekick: boolean;
  mixsets: boolean;
  juke: boolean;
  square: boolean;
  scores: boolean;
  zigzag: boolean;
  fakeEdge: boolean;
  noEdge: boolean;
  nomultisel: boolean;
  nolock: boolean;
  norect: boolean;
  nostack: boolean;
  auth: boolean;
  sd: boolean;
  autism: number;
  nsfw: boolean;

  listable: boolean;
  secretkey?: string;
  jukemusic: boolean;
  tags?: string[];
  forceanon: boolean;
  rotting: boolean;
  sticky: boolean;
  jigchan: boolean;
  token?: string;
  voronoi: boolean;
  jitter: number;
  cornerJitter: number;
  tabSize: number;
  voronoiPreset?: string;
  voronoiCode?: string;
  distributorPreset?: string;
  distributorCode?: string;
}

export interface CreateRoomSubmitParams {
  name: string;
  urlname: string;
  censor: string;
  size: string;
  files?: FileList;
  thumbnail?: Blob;
  layouts?: SerializedImageLayoutConfig[];
}

export interface PiecesEstimation {
  valid: boolean;
  total: number;
  density: number;
  maxTextureDim: number;
}
