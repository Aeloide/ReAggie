import type { GameGroup, GamePiece, MaskPiece, VoronoiShape } from "./game";
import type { GameRules } from "./game-rules";
import { clamp, extractFromArray } from "../utils";
import type { GameViewState } from "./game-view-state";
import type { GameConnection } from "./game-connection";

import { getInvTransformedXY, getRotatedXY, getTransformedXY, type GameState } from "./game-state";
import { setFirstTextureLoadFinished, setZ, z, type Renderer } from "./render";
import { ROTATION } from "./common";
import { add } from "./vec2";

export class GameActions {
  private releasedGroups: {
    pieces: number;
    startX: number;
    endX: number;
    startY: number;
    endY: number;
    id: number;
  }[] = [];

  constructor(
    private state: GameState,
    private view: GameViewState,
    private rules: GameRules,
    private conn: GameConnection | undefined,
    private dispatcher: (event: Event) => void
  ) { }

  releaseHeldGroups() {
    const onMerge = (groupId: number, neighborId: number, x: number, y: number) => {
      this.conn?.merge(groupId, neighborId, x, y);
    };
    this.view.edgePanX = this.view.edgePanY = 0;

    if (!this.view.pickedGroups.length)
      return;
    for (let e = 0, groups = this.view.pickedGroups; e < groups.length; e++) {
      let group = groups[e];
      group.dragged = false;
      this.state.updatePieceCoordinates(group);
      group.dirty = true;
    }

    this.conn?.drop(this.view.pickedGroups); // release

    this.releasedGroups = this.view.pickedGroups.map(e => ({
      id: e.id,
      pieces: e.pieces.length,
      startX: e.startX,
      startY: e.startY,
      endX: e.x,
      endY: e.y,
    }));

    if (this.view.pickedGroups.length) {
      let droppedgroup = this.view.pickedGroups[0];
      this.groupsJoined = false;

      // case for when the pieces are squares
      const set = this.state.sets[droppedgroup.set];
      const cols = set.cols;
      const rows = set.rows;
      for (const piece of droppedgroup.pieces) {
        if ((piece.puzzle as any as VoronoiShape).type === "voronoi") {
          const puzzle = piece.puzzle as any as VoronoiShape;
          for (let p = 0; p < puzzle.neighbors.length; p++) {
            droppedgroup = this.voronoiCollisionDetection(droppedgroup, piece, onMerge);
          }
        } else {
          // test the 4 neighbors when dropping a piece
          piece.xi > 0 && (droppedgroup = this.collisionDetection(droppedgroup, piece, -1, 0, onMerge));
          piece.yi > 0 && (droppedgroup = this.collisionDetection(droppedgroup, piece, 0, -1, onMerge));
          piece.xi < cols - 1 && (droppedgroup = this.collisionDetection(droppedgroup, piece, 1, 0, onMerge));
          piece.yi < rows - 1 && (droppedgroup = this.collisionDetection(droppedgroup, piece, 0, 1, onMerge));
        }
      }

      this.state.reorderGroupBySize(droppedgroup);

      if (this.groupsJoined) {
        this.releasedGroups.length = 0;
      }
    }
    this.view.pickedGroups.length = 0;
  }

  voronoiCollisionDetection(droppedgroup: GameGroup, piece: GamePiece, onMerge: (groupId: number, neighborId: number, x: number, y: number) => void): GameGroup {
    const set = this.state.sets[droppedgroup.set];
    if (!set) {
      return droppedgroup;
    }
    const puzzle = piece.puzzle as any as VoronoiShape;
    for (let p = 0; p < puzzle.neighbors.length; p++) {
      const neighbor = puzzle.neighbors[p];
      // neighbor.id is the index of the piece in the set
      // neighbor.relativePosition gives the offset between the dropped *piece* and its neighbor

      const neighborPiece = this.state.setPieces[droppedgroup.set][neighbor.id];
      if (!neighborPiece) continue;

      // Find the group that contains this neighbor piece
      // Mirroring collisionDetection logic
      const neighborGroup = this.state.groups.find((g) => g.pieces.includes(neighborPiece));

      if (!neighborGroup) {
        continue;
      }

      const groupId = droppedgroup.id;
      const neighborGroupId = neighborGroup.id;
      if (groupId === neighborGroupId) {
        continue;
      }

      // Check for compatible rotation/flip
      if (droppedgroup.rot !== neighborGroup.rot || droppedgroup.f !== neighborGroup.f) continue;

      // Assuming: MyPos = NeighborPos - RelativePos (rotated)
      const relPos = neighbor.relativePosition;
      const [rx, ry] = getTransformedXY(neighborGroup, [relPos[0], relPos[1]]);

      const expectedGlobalX = neighborPiece.globalX - rx;
      const expectedGlobalY = neighborPiece.globalY - ry;

      const minimumdim = Math.min(piece.puzzle.width, piece.puzzle.height) * 0.25;
      const distance = getDistance2d(piece.globalX, piece.globalY, expectedGlobalX, expectedGlobalY);

      if (distance < minimumdim) {
        // Snap the dropped group to align perfectly
        const dx = expectedGlobalX - piece.globalX;
        const dy = expectedGlobalY - piece.globalY;

        droppedgroup.x += dx;
        droppedgroup.y += dy;
        this.state.updatePieceCoordinates(droppedgroup);

        droppedgroup = this.mergeGroups(droppedgroup, neighborGroup, this.groupsJoined, true);
        onMerge(groupId, neighborGroupId, droppedgroup.x, droppedgroup.y);
        this.groupsJoined = true;
      }
    }
    return droppedgroup;
  }

  // TODO: refactor
  private groupsJoined = false;

  private collisionDetection(
    group: GameGroup,
    piece: GameGroup["pieces"][0],
    relX: number,
    relY: number,
    onMerge: (groupId: number, neighborId: number, x: number, y: number) => void
  ) {
    const set = this.state.sets[group.set];
    if (!set) {
      return group;
    }
    const neighborPiece = this.state.setPieces[group.set][piece.xi + relX + (piece.yi + relY) * set.cols];
    if (-1 === group.pieces.indexOf(neighborPiece)
      && piece.rot === neighborPiece.rot
      && piece.f === neighborPiece.f) {
      const width = relX * set.pieceWidth!;
      const height = relY * set.pieceHeight!;
      let [x, y] = getTransformedXY(piece, [width, height]);
      const minimumdim = Math.min(neighborPiece.puzzle.width, neighborPiece.puzzle.height) * 0.25;
      if (getDistance2d(
        neighborPiece.globalX, neighborPiece.globalY,
        piece.globalX + x, piece.globalY + y) < minimumdim) {
        const neighborGroup = this.state.groups.find((g) => g.pieces.includes(neighborPiece));
        if (!neighborGroup) throw new Error("no group");
        if (!neighborGroup.user) {
          // prevents from joining to a selected group
          const groupId = group.id,
            neighborId = neighborGroup.id;
          if (groupId !== neighborId) {
            // I suspect stacking is still viable at these sizes
            if (this.rules.noStack() && neighborGroup.pieces.length <= 4) {
              const stacked = this.state.groups.find((e) => {
                return (
                  e.set == neighborGroup.set &&
                  e.id != neighborGroup.id &&
                  e.pieces.length == neighborGroup.pieces.length &&
                  getDistance2d(e.x, e.y, neighborGroup.x, neighborGroup.y) < minimumdim
                );
              });

              if (stacked) return group; // cancel
            }

            // groupsJoined is used to track if this is the first join that occured during release
            // this prevents the subsequent joined pieces from jumping around
            group = this.mergeGroups(group, neighborGroup, this.groupsJoined, true);
            onMerge(groupId, neighborId, group.x, group.y);
            this.groupsJoined = true;
          }
        }
      }
    }

    return group;
  }

  /**
   * Clamps a group's position to the inside of the playing area.
   * Piece tabs and edge deformation are not accounted for.
   * @param group A group of one or more pieces.
   */
  preventMovementOOB(group: GameGroup) {
    let turned = ROTATION.EAST === group.rot || ROTATION.WEST === group.rot;
    const w = turned ? group.h : group.w;
    const h = turned ? group.w : group.h;
    group.x = clamp(group.x, w / 2, this.view.boardWidth - w / 2);
    group.y = clamp(group.y, h / 2, this.view.boardHeight - h / 2);
  }

  /**
   * Merge two groups into one.
   * @param groupA The group to be merged.
   * @param groupB The group to be merged into.
   * @param preferA Prefer the first group to be merged.
   * @param isMe Whether the user is the current user.
   * @returns The now modified {@link groupB}.
   */
  mergeGroups(groupA: GameGroup, groupB: GameGroup, preferA?: boolean, isMe?: boolean): GameGroup {
    const isVoronoi = (groupB.pieces[0].puzzle as any).type === 'voronoi';

    if (isVoronoi) {
      for (const piece of groupA.pieces) {
        // Move piece from Group A to Group B local space
        const [lx, ly] = getInvTransformedXY(groupB, [piece.globalX - groupB.x, piece.globalY - groupB.y]);
        piece.x = lx;
        piece.y = ly;
        groupB.pieces.push(piece);
      }

      // Re-center logic
      const offset = this.state.updateGroupPieces(groupB);
      // Offset global position
      const [dx, dy] = getTransformedXY(groupB, [offset.x, offset.y]);
      groupB.x += dx;
      groupB.y += dy;
    } else {
      // Square Logic
      const targetGroup = preferA && groupA.pieces.length > groupB.pieces.length ? groupA : groupB;

      let targetColumnMin = 1e6;
      let targetRowMin = 1e6;
      let targetColumnMax = 0;
      let targetRowMax = 0;

      for (const piece of targetGroup.pieces) {
        targetColumnMin = Math.min(targetColumnMin, piece.xi);
        targetRowMin = Math.min(targetRowMin, piece.yi);
        targetColumnMax = Math.max(targetColumnMax, piece.xi);
        targetRowMax = Math.max(targetRowMax, piece.yi);
      }

      for (const piece of groupA.pieces) {
        groupB.pieces.push(piece);
      }

      const targetW = targetGroup.w;
      const targetH = targetGroup.h;
      this.state.updateGroupPieces(groupB);

      let bColumnMin = 1e6;
      let bRowMin = 1e6;
      let bColumnMax = 0;
      let bRowMax = 0;

      for (const piece of groupB.pieces) {
        bColumnMin = Math.min(bColumnMin, piece.xi);
        bRowMin = Math.min(bRowMin, piece.yi);
        bColumnMax = Math.max(bColumnMax, piece.xi);
        bRowMax = Math.max(bRowMax, piece.yi);
      }

      const { pieceWidth, pieceHeight } = this.state.sets[groupB.set];
      const newXOffset = -targetW / 2 + (bColumnMin - targetColumnMin) * pieceWidth! + groupB.w / 2;
      const newYOffset = -targetH / 2 + (bRowMin - targetRowMin) * pieceHeight! + groupB.h / 2;
      [groupB.x, groupB.y] = add([targetGroup.x, targetGroup.y], getTransformedXY(groupB, [newXOffset, newYOffset]));
    }

    this.preventMovementOOB(groupB);
    this.state.updatePieceCoordinates(groupB);
    extractFromArray(this.state.groups, groupA);
    groupA.dirty = true;

    for (const id of groupA.ids) {
      groupB.ids.push(id);
    }

    groupB.ids.push(Math.min(groupA.id, groupB.id));
    groupB.id = Math.max(groupA.id, groupB.id);

    groupB.locked = groupA.locked || groupB.locked;
    groupB.user = void 0;
    groupB.selectedByOther = false;
    this.state.transformedboard[groupB.id] = groupB;
    if (groupB.rotp)
      groupB.rotp = Date.now();
    for (const id of groupB.ids) {
      this.state.transformedboard[id] = groupB;
    }

    if (this.state.isGameEnded()) {
      this.view.borderOpacity = 0;
    }

    this.view.stickied.delete(groupA);
    this.dispatcher(new CustomEvent("merge", { detail: { isMe, group: groupB } }));

    return groupB;
  }

  /**
   * Pick up and hold a group and include any selected groups.
   * @param group The group to pick up. Must not be locked or the action will silently fail.
   * @returns Whether any group was deselected.
   */
  pickGroup(group: GameGroup) {
    if (group.locked) return false;

    let deselectedAnyGroup = false;
    if (!group.selected) {
      const deselected: GameGroup[] = [];
      for (const g of this.state.groups) {
        if (!g.selected) continue;
        g.selected = false;
        deselected.push(g);
        g.dirty = true;
      }
      if (deselected.length) {
        this.conn?.deselect(deselected);
        deselected.forEach((d) => (d.dirty = true));
        deselectedAnyGroup = true;
      }
    }
    if (group.selected) {
      for (const g of this.state.groups) {
        if (!g.selected || g === group) continue;
        g.startX = g.x;
        g.startY = g.y;
        g.dragged = true;
        this.view.pickedGroups.push(g);
      }
    }
    group.startX = group.x;
    group.startY = group.y;
    group.dragged = true;
    this.view.pickedGroups.push(group);
    for (const group of this.view.pickedGroups) {
      this.state.reorderGroupBySize(group);
    }
    this.conn?.pick(this.view.pickedGroups);

    return deselectedAnyGroup;
  }

  /**
   * Move picked pieces.
   * @param relX World-space X relative to the pick location.
   * @param relY World-space Y relative to the pick location.
   */
  move(relX: number, relY: number) {
    for (const group of this.view.pickedGroups) {
      group.x = group.startX + relX;
      group.y = group.startY + relY;
      this.preventMovementOOB(group);
      group.dirty = true;
      this.state.updatePieceCoordinates(group)
    }
    this.conn?.move(this.view.pickedGroups);
  }

  alignCamera(align: Alignment) {
    let xPos, yPos;

    if (align & 0x10) {
      // Left
      xPos = this.view.maxPieceWidth;
    } else if (align & 0x20) {
      // HMiddle
      xPos = -this.view.boardWidth / 2 + innerWidth / (2 * this.view.scale);
    } else {
      // Right
      xPos = -this.view.boardWidth + innerWidth / this.view.scale - this.view.maxPieceWidth;
    }

    if (align & 0x01) {
      // Top
      yPos = this.view.maxPieceHeight;
    } else if (align & 0x02) {
      // VMiddle
      yPos = -this.view.boardHeight / 2 + innerHeight / (2 * this.view.scale);
    } else {
      // Bottom
      yPos = -this.view.boardHeight + innerHeight / this.view.scale - this.view.maxPieceHeight;
    }

    this.setViewPos(xPos, yPos, this.view.scale);
  }

  /**
   * Set the position of the play area in world-space coordinates,
   * effectively moving the camera in the reverse direction.
   * @param {number} x ← Left offset (Negative value for camera pan right)
   * @param {number} y ↑ Up offset. (Negative values camera pan down)
   * @param {number} scale Zoom level. 1 = 100%
   */
  setViewPos(x: number, y: number, scale: number) {
    const oldViewX = this.view.x,
      oldViewY = this.view.y,
      oldViewScale = this.view.scale,
      deltaX = this.view.canvasClickX / this.view.scale - this.view.x,
      deltaY = this.view.canvasClickY / this.view.scale - this.view.y;
    this.view.x = x;
    this.view.y = y;
    this.view.scale = scale;
    this.view.updateRoomView();
    this.view.canvasClickX = (deltaX + this.view.x) * this.view.scale;
    this.view.canvasClickY = (deltaY + this.view.y) * this.view.scale;
    this.dragMove(this.view.pageClickX, this.view.pageClickY, true);
    setFirstTextureLoadFinished(setZ(z || oldViewX !== this.view.x || oldViewY !== this.view.y || oldViewScale !== this.view.scale));
  }

  setViewPosCentered(x: number, y: number) {
    this.view.x = -x + innerWidth / this.view.scale / 2;
    this.view.y = -y + innerHeight / this.view.scale / 2;
    this.view.updateRoomView();
  }

  updateRenderView(deltaTime: number) {
    if (this.view.edgePanX || this.view.edgePanY) {
      this.setViewPos(this.view.x + this.view.edgePanX * deltaTime, this.view.y + this.view.edgePanY * deltaTime, this.view.scale);
    }
  }

  /**
   * Move pieces and/or pan the view
   * @param pageX Screen-space X
   * @param pageY Screen-space Y
   * @param preventPanning
   */
  dragMove(pageX: number, pageY: number, preventPanning?: boolean) {
    const relgameX = (pageX - this.view.canvasClickX) / this.view.scale;
    const relgameY = (pageY - this.view.canvasClickY) / this.view.scale;
    // todo: may need to individually invalidate the render
    this.view.currentMouseEvent?.move?.(relgameX, relgameY);
    this.view.currentMouseEvent?.mouse?.(...this.view.screenToWorld([pageX, pageY]));

    if (this.view.pickedGroups.length) {
      this.move(relgameX, relgameY);
      setFirstTextureLoadFinished(true);
    } else if (this.view.isBoxSelecting) {
      this.view.selection[1] = [relgameX, relgameY];
      setFirstTextureLoadFinished(true);
    }

    if (preventPanning) return;
    if (this.view.isPanning) {
      this.setViewPos(
        // calls dragMove with preventPanning=true;
        this.view.prePanViewX + (pageX - this.view.panStartPosX) / this.view.scale,
        this.view.prePanViewY + (pageY - this.view.panStartPosY) / this.view.scale,
        this.view.scale
      );
      return;
    }
    if (this.view.pickedGroups.length || this.view.isBoxSelecting) {
      this.view.edgePanX = getEdgePan(pageX, innerWidth) / this.view.scale;
      this.view.edgePanY = getEdgePan(pageY, innerHeight) / this.view.scale;
    }
  }

  /**
   * Select all pieces in the chosen area.
   * @param keepExistingSelection Don't deselect pieces outside the chosen area.
   * @param rect A rectangular world-space area defined as [[x0, y0], [x1, y1]].
   */
  boxSelect(keepExistingSelection: boolean, rect: [[number, number], [number, number]]) {
    if (!this.view.isBoxSelecting) return;

    const [[x0, y0], [x1, y1]] = rect;
    const selected: GameGroup[] = [];
    const deselected: GameGroup[] = [];
    for (const group of this.state.groups) {
      // when in sticky mode and committed to a piece, all other pieces behave as if locked to a rectangle select
      if (group.user || group.locked) continue;
      if (this.rules.sticky) {
        if (this.view.stickied.size >= 2 && !this.view.stickied.has(group)) continue;
      }

      let intersects: number | boolean = this.state.rectangleOverlap(group, x0, y0, x1, y1);
      if (keepExistingSelection) {
        intersects = group.selected || intersects;
      }
      if (group.selected === intersects) continue;
      group.selected = intersects;
      group.dirty = true;
      intersects ? selected.push(group) : deselected.push(group);
    }
    if (deselected.length) {
      this.conn?.deselect(deselected);
      deselected.forEach((e) => (e.dirty = true));
    }
    if (selected.length) {
      this.conn?.select(selected);
    }
    this.view.isBoxSelecting = false;
  }

  limitZoom(scale: number, zoomX2: boolean) {
    let w = this.view.boardWidth, h = this.view.boardHeight;
    const maxv = zoomX2 ? 4 : 1;
    return clamp(scale, Math.min(0.1, innerWidth / (1.5 * w), innerHeight / (1.5 * h)), maxv);
  }

  deselectSelected() {
    const deselected: GameGroup[] = [];
    for (const group of this.state.groups) {
      group.selected && ((group.selected = false), deselected.push(group));
    }
    if (deselected.length) {
      this.conn?.deselect(deselected);
      deselected.forEach((d) => (d.dirty = true));
    }
  }

  /**
   * Selects or deselects a group.
   * Multiselect must be enabled in room settings or the action will silently fail.
   * @param group
   * @returns The selection state.
   */
  toggleSelect(group: GameGroup): Boolean {
    group.selected = !group.selected;
    group.dirty = true;
    if (group.selected) {
      this.conn?.select([group]);
    } else {
      this.conn?.deselect([group]);
      group.dirty = true;
    }
    return group.selected;
  }

  /**
   * Rotate groups by one turn
   * @param {GameGroup[]} groups
   * @param {boolean} clockwise
   */
  turn(groups: GameGroup[], clockwise: boolean) {
    if (!this.rules.canRotate()) return;
    groups.forEach((group) => this.state.setGroupRotation(group, (group.rot! + (clockwise ? 1 : 3)) % 4));

    this.conn?.turn(groups);
  }

  flip(groups: GameGroup[]) {
    if (!this.rules.canFlip()) return;
    groups.forEach((group) => this.state.setGroupFlip(group, !group.f))

    this.conn?.flip(groups);
  }

  /**
   * Locks or unlocks a group.
   * (Un)locking must be enabled in room settings or the action will silently fail.
   * @param group
   * @returns The lock state.
   */
  toggleLock(group: GameGroup): boolean {
    if (!this.rules.canLock()) return group.locked ?? false;

    if (group.dragged) {
      this.stopDragging(group);
    }
    group.locked = !group.locked;
    if (group.selected) {
      group.selected = false;
      this.conn?.deselect([group]);
      group.dirty = true;
    }
    if (group.locked) {
      this.conn?.lock([group]);
      this.dispatcher(new Event("lock"));
    } else {
      this.conn?.unlock([group]);
      this.dispatcher(new Event("unlock"));
    }

    return group.locked;
  }

  unlockAllPieces(): boolean {
    if (!this.rules.canLock()) {
      return false;
    }
    const locked = this.state.groups.filter((g) => g.locked);
    if (!locked.length) {
      return false;
    }
    for (const group of locked) {
      group.locked = false;
    }

    this.conn?.unlock(locked);
    this.dispatcher(new Event("unlock"));
    return true;
  }

  revertGroups() {
    if (!this.releasedGroups.length) {
      return;
    }

    for (var undoneGroups: Record<"x" | "y" | "id", number>[] = [], i = 0, groups = this.releasedGroups; i < groups.length; i++) {
      let releasedGroup = groups[i],
        group = this.state.transformedboard[releasedGroup.id];
      group &&
        !group.user &&
        group.pieces.length === releasedGroup.pieces &&
        group.x === releasedGroup.endX &&
        group.y === releasedGroup.endY &&
        undoneGroups.push({
          id: group.id,
          x: releasedGroup.startX,
          y: releasedGroup.startY,
        });
    }
    if (undoneGroups.length) {
      for (let i = 0; i < undoneGroups.length; i++) {
        const undoneGroup = undoneGroups[i],
          group = this.state.transformedboard[undoneGroup.id];
        if (!group) continue;
        group.x = undoneGroup.x;
        group.y = undoneGroup.y;
        this.state.updatePieceCoordinates(group);
      }
      this.conn?.pick(undoneGroups);
      this.conn?.drop(undoneGroups);
      setFirstTextureLoadFinished(true);
    }
  }

  /**
   * Stop dragging a held group.
   * @param group Group to be dropped.
   * @param keepSelected Don't deselect the group.
   */
  stopDragging(group: GameGroup, keepSelected?: boolean) {
    if (group.dragged) {
      extractFromArray(this.view.pickedGroups, group);
      group.dragged = false;
      this.conn?.drop([group]); //Frontend fix #64 for backend bug (related to backend #38)
    }
    // I think this was used to let other players merge groups to a held group, but that is currently not possible.
    if (!keepSelected) {
      if (group.selected) {
        this.conn?.deselect([group]);
      }
      group.selected = false;
    }

    group.dirty = true;
  }

  posIsInGroup(gameX: number, gameY: number, group: GameGroup, renderer: Renderer) {
    gameX -= group.x;
    gameY -= group.y;
    const rot = (4 - group.rot!) % 4;

    // or inverse transform
    let [groupX, groupY] = getInvTransformedXY(group, [gameX, gameY]);
    group.pieces.sort((a, b) => a.index - b.index);
    for (const piece of group.pieces) {
      if (posIsInPiece(groupX, groupY, piece as MaskPiece)) {
        if (renderer.doHitTest(piece, groupX, groupY)) {
          return piece;
        }
      }
    }
    return false;
  }

  private posIsInGroupSlot(gameX: number, gameY: number, group: GameGroup, renderer: Renderer) {
    gameX -= group.x;
    gameY -= group.y;
    const rot = (4 - group.rot!) % 4;
    let [groupX, groupY] = getInvTransformedXY(group, [gameX, gameY]);
    const set = this.state.sets[group.set];
    const pieceWidth = set.pieceWidth;
    const pieceHeight = set.pieceHeight;
    const pieces = group.pieces;

    for (const piece of pieces) {
      if (posIsInPiece(groupX, groupY, piece as MaskPiece)) {
        const xMin = piece.x + piece.puzzleX - 5;
        const yMin = piece.y + piece.puzzleY - 5;
        if (groupX > xMin && groupY > yMin && groupX < xMin + pieceWidth! + 10 && groupY < yMin + pieceHeight! + 10) {
          if ((piece.puzzle as any).type === 'voronoi') {
            return renderer.doHitTest(piece, groupX, groupY)
          }
          return true;
        };
      }
    }
    return false;
  }

  /**
   * Get the topmost group at the chosen coordinates.
   * Sets {@link pieceWasFound} if an valid piece was found regardless of {@link includeHeld}.
   * @param gameX World-space X.
   * @param gameY World-space Y.
   * @param includeLocked Return locked pieces.
   * @param includeHeld Return held pieces.
   * @returns A group if one was found or undefined if not.
   */
  tryGetGroupAt(gameX: number, gameY: number, renderer: Renderer, includeLocked?: boolean, includeHeld?: boolean, onPieceFound?: () => void) {
    type TestFunc = (x: number, y: number, group: GameGroup) => boolean;
    const f1: TestFunc = (x, y, group) => this.posIsInGroup(x, y, group, renderer) !== false;
    const f2: TestFunc = (x, y, group) => this.posIsInGroupSlot(x, y, group, renderer);

    const test = (f: TestFunc) => {
      for (let i = this.state.groups.length - 1; i >= 0; i--) {
        // groups are sorted by descending size
        const group = this.state.groups[i];
        if ((includeLocked || !group.locked) && f(gameX, gameY, group)) {
          onPieceFound?.();
          if (includeHeld || !group.user) {
            return group;
          }
        }
      }
    };

    return test(f1) ?? test(f2);
  }
}

export function getDistance2d(x1: number, y1: number, x2: number, y2: number) {
  const x = x1 - x2;
  const y = y1 - y2;
  return Math.sqrt(x * x + y * y);
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

function getEdgePan(pos: number, edge: number) {
  //    return pos <= 1 ? clamp(-pos / 200, 1, 10) : pos >= edge - 1 ? clamp(-(pos - edge) / 200, -10, -1) : 0;
  if (pos <= 1) {
    return clamp(-pos / 200, 1, 10);
  } else if (pos >= edge - 1) {
    return clamp(-(pos - edge) / 200, -10, -1);
  } else {
    return 0;
  }
}

function posIsInPiece(x: number, y: number, piece: MaskPiece) {
  if ((piece.puzzle as any).type === "voronoi") {
    const shape = (piece.puzzle as any) as VoronoiShape;
    const xMin = piece.x - shape.width;
    const yMin = piece.y - shape.height;
    const xMax = xMin + shape.width * 2;
    const yMax = yMin + shape.height * 2;
    return x > xMin && y > yMin && x < xMax && y < yMax;
  }
  // made the bounding box bigger to account for the nubs
  // then doHitTest makes sure it is inside of the piece geometry
  const xMin = piece.x + piece.puzzleX * 2;
  const yMin = piece.y + piece.puzzleY * 2;
  const xMax = xMin + piece.puzzleX * 2 * -2;
  const yMax = yMin + piece.puzzleY * 2 * -2;
  return x > xMin && y > yMin && x < xMax && y < yMax;
}
