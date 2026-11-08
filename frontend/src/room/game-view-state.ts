import { clamp } from "../utils";
import type { GameGroup } from "./game";
import type { vec2 } from "./vec2";

export interface MouseEventWrapper {
  move?(dx: number, dy: number): void;
  mouse?(dx: number, dy: number): void;
  end?(): void;
}

export class GameViewState extends EventTarget {
  boardWidth = 0;
  boardHeight = 0;
  currentMouseEvent?: MouseEventWrapper;
  // i think groups used to have a "dragged" property and this kept track of dragging groups
  // but the original dev realized this was useless and removed most of the code related to it
  // nothing sets this variable, and there's just a function that removes elements
  pickedGroups: GameGroup[] = [];

  stickied: Set<GameGroup> = new Set();

  isBoxSelecting = false;

  selection: [[number, number], [number, number]] = [
    [0, 0],
    [100, 100],
  ];

  borderOpacity = 1;
  maxPieceWidth = 0;
  maxPieceHeight = 0;

  _x = 0;
  _y = 0;
  get x() {return this._x};
  get y() {return this._y};
  set x(v: number) {this._x = v; this.dispatchEvent(new CustomEvent("view_change"))};
  set y(v: number) {this._y = v; this.dispatchEvent(new CustomEvent("view_change"))};
  scale = 1;

  pageClickX = 0;
  pageClickY = 0;
  canvasClickX = 0;
  canvasClickY = 0;

  isPanning = false;
  prePanViewX = 0;
  prePanViewY = 0;
  edgePanX = 0;
  edgePanY = 0;
  panStartPosX = 0;
  panStartPosY = 0;

  // kaos: vec2[] = [];
  // selected_kao?: number;
  // selected_kao_start?: vec2;
  // zones: [label: string, region: Rectangle][] = [];
  // is_updating_zone = 0;

  /**
   * Start drawing a selection rectangle.
   * @param gameX World-space X
   * @param gameY World-space Y
   */
  beginBoxSelection(gameX: number, gameY: number) {
    this.isBoxSelecting = true;
    this.selection[0] = [gameX, gameY];
    this.selection[1] = [0, 0];
  }

  stopBoxSelection() {
    this.isBoxSelecting = false;
  }

  panViewStart(pageX: number, pageY: number) {
    this.isPanning = true;
    this.panStartPosX = pageX;
    this.panStartPosY = pageY;
    this.prePanViewX = this.x;
    this.prePanViewY = this.y;
  }

  panViewStop() {
    this.isPanning = false;
  }

  stopActiveOperations() {
    this.pickedGroups = [];
    this.stopBoxSelection();
    this.panViewStop();
  }

  updateRoomView() {
    this.x = clampOOBView(this.x, this.boardWidth, innerWidth, this.scale);
    this.y = clampOOBView(this.y, this.boardHeight, innerHeight, this.scale);

    this.dispatchEvent(new Event("view-change"));
  }

  clearEdgePan() {
    this.edgePanX = this.edgePanY = 0;
  }

  screenToWorld(p: vec2): vec2 {
    return [
      p[0] / this.scale - this.x,
      p[1] / this.scale - this.y
    ];
  }

  worldToScreen(p: vec2): vec2 {
    return [
      (p[0] + this.x) * this.scale,
      (p[1] + this.y) * this.scale
    ];
  }
}

function clampOOBView(pos: number, boardSize: number, windowPixels: number, viewScale: number) {
  const minBoardPixels = Math.min(500, windowPixels * 0.2);
  return clamp(pos, minBoardPixels / viewScale - boardSize, (windowPixels - minBoardPixels) / viewScale);
}
