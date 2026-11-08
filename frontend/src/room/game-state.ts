import { extractFromArray } from "../utils";
import { ROTATION } from "./common";
import { Controller } from "./Controller";
import { type GameGroup, type GamePiece, type VoronoiShape } from "./game";
import type { Room } from "./types";
import { add, type vec2 } from "./vec2";

type RoomSet = Room["sets"][number];

export class GameState {
  constructor() {}
  controller = new Controller();

  sets: RoomSet[] = [];

  setPieces: GamePiece[][] = [];

  // coupling to remove here, the "game engine" has no business
  // dealing with mask extents and whatevs
  groups: GameGroup[] = [];

  transformedboard: (GameGroup | undefined)[] = [];

  isGameEnded() {
    return this.groups.length === this.sets.length;
  }

  /**
   * Update the group's pieces' coordinates and rotation
   * to match their current position in relation to the playing area.
   * @param group A group of one or more pieces
   */
  updatePieceCoordinates(group: GameGroup) {
    group.dirty = true;

    for (const piece of group.pieces) {
      let np = add([group.x, group.y], getTransformedXY(group, [piece.x, piece.y]));
      [piece.globalX, piece.globalY] = np;
      piece.rot = group.rot!; // Maybe default to 0?
      piece.f = group.f || false;
    }
  }

  /**
   * more like "insert group while keeping sorted by size"
   */
  reorderGroupBySize(group: GameGroup) {
    group.dirty = true;
    extractFromArray(this.groups, group);
    for (let i = this.groups.length; i > 0; i--)
      if (this.groups[i - 1].pieces.length >= group.pieces.length) return void this.groups.splice(i, 0, group);
    this.groups.unshift(group);
  }

  syncGroups(groups: GameGroup[]) {
    this.groups = groups;
    // TODO: the server should probably be responsible for keeping the list ordered, here
    this.groups.sort((a, b) => b.ids.length - a.ids.length);

    this.transformedboard = [];
    for (const group of this.groups) {
      this.updateGroupPieces(group);
      this.updatePieceCoordinates(group);
      // `id` is the id of a group
      // `ids` are the group ids that were merged in that group
      // `indices` are the piece indices in that group
      this.transformedboard[group.id] = group;
      for (const c of group.ids) {
        this.transformedboard[c] = group;
      }
    }
  }

  updateGroupPieces(group: GameGroup) {
    if (group.pieces.length === 0) return { x: 0, y: 0 };

    const firstPieceV = group.pieces[0].puzzle as any as VoronoiShape;
    if (firstPieceV.type === 'voronoi') {
      // Map for quick lookup
      const pieceMap = new Map<number, GamePiece>();
      for (const p of group.pieces) {
        pieceMap.set((p.puzzle as any as VoronoiShape).cellid, p);
      }

      const visited = new Set<GamePiece>();

      // Iterate through all pieces to handle disjoint islands (stacks)
      for (const root of group.pieces) {
        if (visited.has(root)) continue;

        visited.add(root);
        // Start BFS from this root.
        // We trust the root's current position (or 0,0 if uninitialized, which is fine for the first anchor)
        // and propagate to neighbors.
        const queue = [root];

        while (queue.length) {
          const curr = queue.shift()!;
          const currPuzzle = curr.puzzle as any as VoronoiShape;

          for (const neighborDef of currPuzzle.neighbors) {
            const neighborPiece = pieceMap.get(neighborDef.id);
            if (neighborPiece && !visited.has(neighborPiece)) {
              visited.add(neighborPiece);

              // Pos(Neighbor) = Pos(Current) + Relative(Current -> Neighbor)
              // Note: neighborDef.relativePosition is the vector from Current to Neighbor
              neighborPiece.x = curr.x + neighborDef.relativePosition[0];
              neighborPiece.y = curr.y + neighborDef.relativePosition[1];

              queue.push(neighborPiece);
            }
          }
        }
      }

      // Calculate bounding box based on the reconstructed positions
      let xMin = 1e6, yMin = 1e6, xMax = -1e6, yMax = -1e6;

      for (const piece of group.pieces) {
        const w = piece.puzzle.width;
        const h = piece.puzzle.height;

        xMin = Math.min(xMin, piece.x - w / 2);
        xMax = Math.max(xMax, piece.x + w / 2);
        yMin = Math.min(yMin, piece.y - h / 2);
        yMax = Math.max(yMax, piece.y + h / 2);
      }

      const width = xMax - xMin;
      const height = yMax - yMin;

      const centerX = xMin + width / 2;
      const centerY = yMin + height / 2;

      for (const piece of group.pieces) {
        piece.x -= centerX;
        piece.y -= centerY;
      }

      group.w = width;
      group.h = height;

      return { x: centerX, y: centerY };
    }

    let xMin = 1e6,
      yMin = 1e6,
      xMax = 0,
      yMax = 0;
    for (const piece of group.pieces) {
      xMin = Math.min(xMin, piece.xi);
      yMin = Math.min(yMin, piece.yi);
      xMax = Math.max(xMax, piece.xi);
      yMax = Math.max(yMax, piece.yi);
    }
    const set = this.sets[group.set];
    const w = set.pieceWidth  || (set.width / set.cols);
    const h = set.pieceHeight || (set.height / set.rows);
    const xOffset = (-(xMax - xMin) * w) / 2;
    const yOffset = (-(yMax - yMin) * h) / 2;
    for (const piece of group.pieces) {
      piece.x = (piece.xi - xMin) * w + xOffset;
      piece.y = (piece.yi - yMin) * h + yOffset;
    }
    group.w = (xMax - xMin + 1) * w;
    group.h = (yMax - yMin + 1) * h;
    return { x: 0, y: 0 };
  }

  rectangleOverlap(e: GameGroup, x0: number, y0: number, inwidth: number, inheight: number) {
    if (inwidth < 0) {
      x0 += inwidth;
      inwidth = -inwidth;
    }
    if (inheight < 0) {
      y0 += inheight;
      inheight = -inheight;
    }
    let isVerticallyRotated = 1 === e.rot || 3 === e.rot;

    const set = this.sets[e.set];
    const width = set.pieceWidth!;
    const height = set.pieceHeight!;
    let bboxWidth = isVerticallyRotated ? height : width;
    let bboxHeight = isVerticallyRotated ? width : height;
    for (const piece of e.pieces) {
      if ((piece.puzzle as any).type === 'voronoi') {
        const puzzle = piece.puzzle as any as VoronoiShape;
        bboxWidth = puzzle.width;
        bboxHeight = puzzle.height;
      }
      const [g, p] = add([piece.globalX, piece.globalY], [piece.puzzleX, piece.puzzleY]);
      if (x0 <= g + bboxWidth
        && x0 + inwidth >= g
        && y0 <= p + bboxHeight
        && y0 + inheight >= p) {
        return true;
      }
    }
    return false;
  }

  setGroupRotation(group: GameGroup, rot: ROTATION) {
    // am i too sleep deprived or isn't this code fucking stupid???
    const rev = 2 * Math.PI;
    let tAngle = (rot * rev) / 4;
    if (rot === (group.rot! + 1) % 4) {
      while (tAngle < group.angle) tAngle += rev;
      while (tAngle - rev > group.angle) tAngle -= rev;
    } else {
      while (tAngle > group.angle) tAngle -= rev;
      while (tAngle + rev < group.angle) tAngle += rev;
    }
    group.targetAngle = tAngle;
    group.rot = rot;
    this.updatePieceCoordinates(group);
  }

  setGroupFlip(group: GameGroup, flipped: boolean) {
    // am i too sleep deprived or isn't this code fucking stupid???
    group.targetRoll = flipped ? -1 : 1;
    group.f = flipped;
    this.updatePieceCoordinates(group);
  }
}

export function getRotatedXY(rot: number, [x, y]: vec2): vec2 {
  switch (rot) {
    case 0:
      return [x, y];
    case 1:
      return [-y, x];
    case 2:
      return [-x, -y];
    case 3:
    default:
      return [y, -x];
  }
}

export function getFlippedXY(flipped: boolean, [x, y]: vec2): vec2 {
  if (!flipped)
    return [x, y];
  return [-x, y];
}

export function getTransformedXY(b: { rot?: ROTATION | number | undefined, f?: boolean }, v: vec2): vec2 {
  return getRotatedXY(b.rot || 0, getFlippedXY(b.f || false, v));
}

export function getInvTransformedXY(b: { rot?: ROTATION | number | undefined, f?: boolean }, v: vec2): vec2 {
  const efr = b.rot || 0;
  return getFlippedXY(b.f || false, getRotatedXY((4 - efr) % 4, v));
}