import { describe, expect, it } from "vitest";
import { adjustedDims, fitGroupsToBoard } from "../src/board.js";

describe("adjustedDims", () => {
    it("equalizes normalized image areas even for extreme mixed dimensions", () => {
        const result = adjustedDims([[100, 100], [10_000, 100]]);
        const areas = result.map(([width, height]) => width * height);

        expect(areas[0]).toBeCloseTo(areas[1], 5);
        expect(result[0][0] / result[0][1]).toBeCloseTo(1);
        expect(result[1][0] / result[1][1]).toBeCloseTo(100);
    });
});

describe("fitGroupsToBoard", () => {
    it("includes the full extent of pieces larger than the old fixed margin", () => {
        const groups: any[] = [{
            id: 0,
            ids: [],
            indices: [0],
            set: 0,
            x: 0,
            y: 0,
        }];
        const sets: any[] = [{
            cols: 1,
            rows: 1,
            width: 4000,
            height: 1000,
        }];

        const board = fitGroupsToBoard(groups, sets);

        expect(board).toEqual({ boardWidth: 5000, boardHeight: 2000 });
        expect(groups[0]).toMatchObject({ x: 2500, y: 1000 });
        expect(groups[0].x - 2000).toBe(500);
        expect(groups[0].x + 2000).toBe(board.boardWidth - 500);
    });

    it("fits mixed-size sets and negative layout coordinates into positive board space", () => {
        const groups: any[] = [
            { id: 0, ids: [], indices: [0], set: 0, x: -200, y: 100 },
            { id: 1, ids: [], indices: [0], set: 1, x: 1500, y: -300, rot: 1 },
        ];
        const sets: any[] = [
            { cols: 1, rows: 1, width: 100, height: 100 },
            { cols: 1, rows: 1, width: 2000, height: 500 },
        ];

        const board = fitGroupsToBoard(groups, sets);

        // The rotated second piece is 500 wide and 2000 tall.
        expect(groups[0].x - 50).toBeGreaterThanOrEqual(500);
        expect(groups[0].y - 50).toBeGreaterThanOrEqual(500);
        expect(groups[1].x + 250).toBeLessThanOrEqual(board.boardWidth - 500);
        expect(groups[1].y + 1000).toBeLessThanOrEqual(board.boardHeight - 500);
    });

    it("does not let hidden sentinel coordinates inflate the board", () => {
        const groups: any[] = [
            { id: 0, ids: [], indices: [0], set: 0, x: 10, y: 20 },
            { id: 1, ids: [], indices: [1], set: 0, x: 0xDEADC0DE, y: 0xDEADC0DE },
        ];
        const sets: any[] = [{ cols: 2, rows: 1, width: 200, height: 100 }];

        const board = fitGroupsToBoard(groups, sets);

        expect(board.boardWidth).toBe(1100);
        expect(board.boardHeight).toBe(1100);
    });
});
