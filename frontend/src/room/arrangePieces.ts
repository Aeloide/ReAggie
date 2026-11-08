import { clamp } from "../utils";
import { game } from "$room";
import { Vector2 } from "../Vector2";
import type { vector2 } from "../Vector2";
import * as debugDraw from "./debugCanvas";
import type { GameGroup, GamePiece } from "./game";
import potpack from "./potpack";
import munkres from "munkres";
import { range } from "$backend/utils";

const idealDistance = 1.55; // 1.6 // Cleanup is 1.55, but it overlaps in rare cases.
const DEBUG = false; // Debug draw toggle

type Group = GameGroup<GamePiece & vector2>;

class Grid {
    /** Top left world-space corner */
    position = new Vector2();
    /** Grid size in grid cells */
    dimensions = new Vector2();
    /** World-space size of each cell */
    cellSize: number;

    /** World-space size */
    getSize() {
        return Vector2.mul(this.dimensions, this.cellSize);
    }

    constructor(cellSize: number) {
        this.cellSize = cellSize;
    }

    /** Generated world-space coordinates corresponding to each cell */
    generateCellCoords(length: number = this.dimensions.x * this.dimensions.y): Vector2[] {
        const cells: Vector2[] = [];
        const halfCell = this.cellSize / 2;
        for (let i = 0; i < length; i++) {
            const col = i % this.dimensions.x;
            const row = Math.floor(i / this.dimensions.x);
            const v = new Vector2(
                this.position.x + halfCell + col * this.cellSize,
                this.position.y + halfCell + row * this.cellSize
            );
            cells.push(v);
            if (import.meta.env.DEV && DEBUG) {
                debugDraw.cross(v, this.cellSize / 4, "#fff");
            }
        }
        return cells;
    }

    /**
     * @param targetRatio The grid rectangle's desired height to width ratio.
     * @param groups The array of cells where each cell has w and h properties.
     * @returns (width, height) in number of cells.
     */
    static bestFit(targetRatio: number = 1, groups: Group[], cellSize: number) {
        const groupSizes = groups.map(group => ({
            ...getGroupSize(group, cellSize),
            x: -1,
            y: -1,
            group
        }));

        const boardMaxWidth = Math.floor(game.view.boardWidth / cellSize) || 1;
        const boardMaxHeight = Math.floor(game.view.boardHeight / cellSize) || 1;

        let estimatedMaxWidth: number;
        if (targetRatio === 0) {
            // horizontal line
            estimatedMaxWidth = boardMaxWidth;
        } else if (targetRatio === Infinity) {
            // vertical line
            estimatedMaxWidth = 1;
        } else {
            const area = groupSizes.reduce((a, b) => a + b.w * b.h, 0); 
            estimatedMaxWidth = Math.round(Math.sqrt(area / targetRatio));
            estimatedMaxWidth = Math.max(Math.min(estimatedMaxWidth, boardMaxWidth), 1);
        }

        let res = potpack([...groupSizes], estimatedMaxWidth, boardMaxHeight);

        // try again with with an additional column (if failed)
        while (estimatedMaxWidth < boardMaxWidth && groupSizes.some(x => x.x < 0 || x.y < 0)) {
            estimatedMaxWidth += 1;
            groupSizes.forEach(x => x.x = x.y = -1);
            res = potpack([...groupSizes], estimatedMaxWidth, boardMaxHeight);
        }

        return {
            gridSize: new Vector2(res.w, res.h),
            cells: groupSizes
        };
    }
}

function getGroupSize(group: {w: number, h: number}, cellSize: number) {
    return {
        w: Math.ceil(group.w / cellSize),
        h: Math.ceil(group.h / cellSize)
    };
}

function moveGroup(group: Group, targetPoint: Vector2, speed: number) {
    const vectorToTarget = Vector2.sub(targetPoint, group);
    if (import.meta.env.DEV && DEBUG)
        debugDraw.line(group, Vector2.add(group, vectorToTarget));

    const dist = vectorToTarget.magnitude();
    if (dist < 0.001) {
        return false;
    }

    if (dist < speed) {
        // Prevents overshooting the target
        Vector2.copy(group, targetPoint);
    } else {
        // Take a speed-sized step toward the target
        vectorToTarget.div(dist).mul(speed).add(group);
        Vector2.copy(group, vectorToTarget);
    }

    game.state.updatePieceCoordinates(group);
    return true;
}

function getSizeStats(groups: Group[]) {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const group of groups) {
        minX = Math.min(minX, group.x - group.w / 2);
        minY = Math.min(minY, group.y - group.h / 2);

        maxX = Math.max(maxX, group.x + group.w / 2);
        maxY = Math.max(maxY, group.y + group.h / 2);
    }

    return {
        min: new Vector2(minX, minY),
        max: new Vector2(maxX, maxY)
    };
}

function calculateCenterMean(pieces: GamePiece[]) {
    const avgX = getMean(pieces.map(piece => piece.globalX));
    const avgY = getMean(pieces.map(piece => piece.globalY));
    return new Vector2(avgX, avgY);
}

function getMean(data: number[]): number {
    let sum = data.reduce((a, b) => a + b, 0);
    return sum / data.length;
}

function getStandardDeviation(data: number[]): number {
    const mean = getMean(data);
    const squareDiffs = data.map(value => (value - mean) ** 2);
    const avgSquareDiff = getMean(squareDiffs);
    return Math.sqrt(avgSquareDiff);
}

function getStdBounds(data: number[]): [number, number] {
    const mean = getMean(data);
    const stdDev = getStandardDeviation(data);

    return [mean - stdDev, mean + stdDev];
}

function calculateAspectRatio(pieces: GamePiece[], cellSize: number) {
    // std bounds are used to calculate a range that covers most of the pieces
    // but tolerate pieces that are too far away
    const [minX, maxX] = getStdBounds(pieces.map(piece => piece.globalX));
    const [minY, maxY] = getStdBounds(pieces.map(piece => piece.globalY));

    const stdDist = Vector2.dist(new Vector2(minX, minY), new Vector2(maxX, maxY));
    if (stdDist < cellSize / 2) {
        // square
        return 0.5;
    }

    const width = maxX - minX;
    const height = maxY - minY;

    const stdErr = 0.001;
    if (width < stdErr) {
        return Infinity;
    }

    if (height < stdErr) {
        return 0;
    }

    return (height / width) || 1;
}

export function order(selection: Group[]) {
    const cellSize = Math.max(game.view.maxPieceWidth, game.view.maxPieceHeight) * idealDistance;
    const grid = new Grid(cellSize);
    const speed = (game.view.maxPieceWidth + game.view.maxPieceHeight) / 4;

    if (import.meta.env.DEV && DEBUG) debugDraw.clear();

    const { min, max } = getSizeStats(selection);

    const pieces = selection.flatMap(group => group.pieces);
    const aspectRatio = calculateAspectRatio(pieces, cellSize);
    const bestFit = Grid.bestFit(aspectRatio, selection, cellSize);
    grid.dimensions = bestFit.gridSize;

    const avg = calculateCenterMean(pieces);
    
    if (import.meta.env.DEV && DEBUG) {
        selection[0] && debugDraw.cross(selection[0], cellSize / 4, undefined, "1st");
        selection[1] && debugDraw.cross(selection[1], cellSize / 4, undefined, "2nd");
        debugDraw.cross(avg, cellSize / 4, "#808", "Avg.");
        //debugDraw.cross(stats.center, cellSize / 4, "#808", "Center");
        //debugDraw.cross(stats.mean, cellSize / 4, "#808", "Mean");
    }

    const gridSize = grid.getSize();
    if (import.meta.env.DEV && DEBUG) {
        const halfCell = (new Vector2(cellSize, cellSize)).div(2);
        const start = Vector2.sub(min, halfCell);
        debugDraw.rectangle(start, Vector2.add(max, halfCell), "red", "Selection");
        debugDraw.rectangle2(start, gridSize, "orangered", `Best fit for ${selection.length} pieces: ${grid.dimensions}`);
    }

    // Center the grid on a point that shouldn't move between calls.
    grid.position = Vector2.sub(avg, grid.getSize().div(2));
    if (import.meta.env.DEV && DEBUG) {
        debugDraw.rectangle2(grid.position, grid.getSize(), "yellow", "No offset");
    }

    // Make sure it's within bounds.
    grid.position.x = clamp(grid.position.x, 0, game.view.boardWidth - gridSize.x);
    grid.position.y = clamp(grid.position.y, 0, game.view.boardHeight - gridSize.y);

    // The grid will be skewed to one side if the board isn't full divisible by cellSize.
    const boardCenterOffset = new Vector2(game.view.boardWidth, game.view.boardHeight).mod(cellSize).div(2);

    // Align the grid to nearest multiple of cellSize...
    grid.position.div(cellSize).round().mul(cellSize).add(boardCenterOffset);

    // ...and make sure it's still within bounds.
    grid.position.x = clamp(grid.position.x, boardCenterOffset.x, game.view.boardWidth - gridSize.x - boardCenterOffset.x);
    grid.position.y = clamp(grid.position.y, boardCenterOffset.y, game.view.boardHeight - gridSize.y - boardCenterOffset.y);

    if (import.meta.env.DEV && DEBUG) {
        debugDraw.rectangle2(grid.position, grid.getSize(), "lime", "Aligned Grid");
    }

    // Move each group to the closest empty cell
    const requiredCellsCount = bestFit.cells.map(x => x.h * x.w).reduce((a, b) => a + b);
    let cells = grid.generateCellCoords(requiredCellsCount);

    const affectedGroups: Group[] = [];

    // place groups that have more than one piece first
    for (const item of bestFit.cells.filter(x => x.group.pieces.length > 1)) {
        let groupCellIndices = [];
        for (let y = item.y; y < item.y + item.h; y++) {
            const start = y * grid.dimensions.x + item.x;
            const nextRowIndices = range(start, start + item.w);
            groupCellIndices.push(...nextRowIndices);
        }

        let newCenterX = 0;
        let newCenterY = 0;
        for (const index of groupCellIndices) {
            newCenterX += cells[index].x;
            newCenterY += cells[index].y;
        }
        newCenterX /= groupCellIndices.length;
        newCenterY /= groupCellIndices.length;
        const newCenter = new Vector2(newCenterX, newCenterY);
        
        if (moveGroup(item.group, newCenter, speed)) {
            affectedGroups.push(item.group);
        }

        // remove cells from grid
        groupCellIndices.forEach(i => delete cells[i]);
    }

    // use remaining cells to place groups that have only one piece
    cells = cells.filter(x => x);
    const remainingGroups = selection.filter(g => g.pieces.length === 1);

    const costMatrix: number[][] = [];
    const matrixSize = remainingGroups.length;
    for (let i = 0; i < matrixSize; i++) {
        costMatrix[i] = [];
        for (let j = 0; j < matrixSize; j++) {
            costMatrix[i][j] = Vector2.dist(remainingGroups[i], cells[j]);
        }
    }

    const optimalIndices = munkres(costMatrix);
    for (let i = 0; i < optimalIndices.length; i++) {
        const group = remainingGroups[optimalIndices[i][0]];
        const cell = cells[optimalIndices[i][1]];
        if (moveGroup(group, cell, speed)) {
            affectedGroups.push(group);
        }
    }
    
    game.connection.move(affectedGroups);
}

export function pack(selection: Group[]) {
    //debugDraw.clear();
    const distance = (game.view.maxPieceWidth + game.view.maxPieceHeight) / 4;
    const xs = selection.map(e => e.x);
    const ys = selection.map(e => e.y);
    const bbox = [
        [Math.min(...xs), Math.min(...ys)],
        [Math.max(...xs), Math.max(...ys)],
    ];
    const mid = [(bbox[0][0] + bbox[1][0]) * 0.5, (bbox[0][1] + bbox[1][1]) * 0.5];

    for (const s of selection) {
        //const oldX = s.x, oldY = s.y;
        // direction to center of bounding box;
        const dir = [mid[0] - s.x, mid[1] - s.y];
        const dist = Math.sqrt(dir[0] * dir[0] + dir[1] * dir[1]);
        let dirnorm_1o = 1 / dist;
        // if too close, move directly to middle of bbox
        if (Math.abs(dist) < distance) {
            s.x = mid[0];
            s.y = mid[1];
        } else {
            dir[0] *= distance * dirnorm_1o;
            dir[1] *= distance * dirnorm_1o;
            s.x += dir[0];
            s.y += dir[1];
        }
        //debugDraw.line(oldX, oldY, s.x, s.y);
        game.actions.preventMovementOOB(s); // prevent out of bounds?
        game.state.updatePieceCoordinates(s);
    }

    game.connection.move(selection);
}

export function spread(selection: Group[]) {
    const maxDistance = Math.max(game.view.maxPieceWidth, game.view.maxPieceHeight) * idealDistance + 1; //+1 to cause chaos to ordered pieces
    const maxDistanceSquared = maxDistance * maxDistance;
    const speed = (game.view.maxPieceWidth + game.view.maxPieceHeight) / 4;
    for (const p1 of selection) {
        let nearestSquared = maxDistanceSquared;

        // Vector pointing away from other pieces
        let offsetX = 0;
        let offsetY = 0;

        for (const p2 of selection) {
            if (p1 === p2) continue;
            for (const { globalX: x, globalY: y} of p2.pieces) {
                const deltaX = p1.x - x;
                const deltaY = p1.y - y;
                const magSquared = deltaX * deltaX + deltaY * deltaY;
                if (magSquared < nearestSquared) nearestSquared = magSquared;
                if (magSquared) {
                    const norm = 1 / (magSquared * magSquared);
                    offsetX += deltaX * norm;
                    offsetY += deltaY * norm;
                }
            }
        }

        if (nearestSquared >= maxDistanceSquared) continue;
        const magnitude = Math.sqrt(offsetX * offsetX + offsetY * offsetY) || 1;
        const x = p1.x + (offsetX / magnitude + (Math.random() - .5)) * speed;
        const y = p1.y + (offsetY / magnitude + (Math.random() - .5)) * speed;
        p1.x = x;
        p1.y = y;
        game.actions.preventMovementOOB(p1);
        game.state.updatePieceCoordinates(p1);
    }
    game.connection.move(selection);
}
