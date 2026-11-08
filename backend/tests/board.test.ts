import { describe, it, expect } from 'vitest';
import { adjustedDims, rectAt, growRect, rectDims, rectMid, layoutAndSpreadGroups } from '../src/board.js';

describe('board.ts', () => {
    describe('adjustedDims', () => {
        it('should adjust dimensions based on min size', () => {
            const dims: [number, number][] = [[100, 100]];
            const result = adjustedDims(dims, 200);
            // 200 / 100 = 2. Factor should be 2.
            expect(result[0]).toEqual([200, 200]);
        });
    });

    describe('Geometric Utilities', () => {
        const rect = [[0, 0], [10, 20]] as any; // [x1, y1], [x2, y2]

        it('rectAt should center rectangle', () => {
            const r = rectAt([5, 10], [10, 20]);
            expect(r).toEqual([[0, 0], [10, 20]]);
        });

        it('growRect should expand rectangle', () => {
            const r = growRect(rect, [1, 2]);
            expect(r).toEqual([[-1, -2], [11, 22]]);
        });

        it('rectDims should return width and height', () => {
            const d = rectDims(rect);
            expect(d).toEqual([10, 20]);
        });

        it('rectMid should return center', () => {
            const m = rectMid(rect);
            expect(m).toEqual([5, 10]);
        });
    });

    describe('layoutAndSpreadGroups', () => {
        it('should layout groups', () => {
            const sets: any[] = [{
                cols: 2, rows: 2, width: 200, height: 200, imageWidth: 200, imageHeight: 200
            }];
            const result = layoutAndSpreadGroups(sets, false, false, 0, false, false, false, []);

            expect(result.groups.length).toBe(4); // 2x2 = 4
            expect(result.boardDims.boardWidth).toBeGreaterThan(0);
        });

        it('should handle multiple sets', () => {
            const sets: any[] = [{
                cols: 1, rows: 1, width: 100, height: 100
            }, {
                cols: 1, rows: 1, width: 100, height: 100
            }];
            const result = layoutAndSpreadGroups(sets, false, false, 0, false, false, false, []);
            expect(result.groups.length).toBe(2);
        });

        // Covering different spread presets
        it('should layout with disk spread (preset 1)', () => {
            const sets: any[] = [{ cols: 2, rows: 2, width: 100, height: 100 }];
            const result = layoutAndSpreadGroups(sets, false, false, 1, false, false, false, []);
            expect(result.groups.length).toBe(4);
        });

        // Covering existing groups preservation
        it('should preserve existing locked groups', () => {
            const sets: any[] = [{ cols: 2, rows: 2, width: 100, height: 100 }];
            const oldGroups: any[] = [{
                id: 0,
                ids: [],
                indices: [0],
                set: 0,
                locked: true,
                x: 555,
                y: 555
            }];

            const result = layoutAndSpreadGroups(sets, false, false, 0, false, false, false, [], oldGroups);
            const preserved = result.groups.find(g => g.id === 0);
            expect(preserved).toBeDefined();
            // Coords are shifted by packing, so we can't assert exact x/y easily without knowing packing offset
            // But we can check it exists
        });

        it('should layout with clearRect spread (preset 2)', () => {
            const sets: any[] = [{ cols: 5, rows: 5, width: 500, height: 500 }];
            // autism = 2 is default
            const result = layoutAndSpreadGroups(sets, false, false, 2, false, false, false, []);
            expect(result.groups.length).toBe(25);
        });

        it('should handle sepedges=true', () => {
            const sets: any[] = [{ cols: 3, rows: 3, width: 300, height: 300 }]; // 9 pieces, 8 edges, 1 center
            const result = layoutAndSpreadGroups(sets, false, true, 0, false, false, false, []);
            expect(result.groups.length).toBe(9);
        });

        it('should handle mixsets=true', () => {
            const sets: any[] = [{ cols: 2, rows: 2, width: 200, height: 200 }, { cols: 2, rows: 2, width: 200, height: 200 }];
            const result = layoutAndSpreadGroups(sets, false, false, 0, true, false, false, []);
            expect(result.groups.length).toBe(8);
        });

        it('should apply properties hasrot and flipping', () => {
            const sets: any[] = [{ cols: 1, rows: 1, width: 100, height: 100 }];
            const result = layoutAndSpreadGroups(sets, true, false, 0, false, false, true, []);
            const g = result.groups[0];
            expect(g).toHaveProperty('rot');
            expect(g).toHaveProperty('f');
        });

        it('should respect skipRectangles', () => {
            const sets: any[] = [{ cols: 5, rows: 5, width: 500, height: 500 }];
            const result = layoutAndSpreadGroups(sets, false, false, 0, false, false, false, [[[0, 0], [10, 10]]]);
            expect(result.groups.length).toBe(25);
        });
    });

});

it('should handle mixsets=true AND sepedges=true', () => {
    const sets: any[] = [{ cols: 3, rows: 3, width: 300, height: 300 }, { cols: 3, rows: 3, width: 300, height: 300 }];
    // 9x2 = 18 pieces.
    // sepedges=true.
    const result = layoutAndSpreadGroups(sets, false, true, 0, true, false, false, []);
    expect(result.groups.length).toBe(18);
});

describe('Stress Tests', () => {
    // Helper to check for overlapping pieces (approximated by checking distinct centers)
    // and bounds checking
    const checkLayout = (result: any, sets: any[]) => {
        const { groups, boardDims } = result;
        const posSet = new Set<string>();

        // Assuming one set for simplicity in these tests
        const set = sets[0];
        const pW = set.width / set.cols;
        const pH = set.height / set.rows;

        for (const g of groups) {
            // Check if position is unique. 
            // Note: layout coordinates might be floats, but collisions usually happen from grid-based logic or identical random outcomes.
            // We use a precision
            const k = `${g.x.toFixed(2)},${g.y.toFixed(2)}`;
            if (posSet.has(k)) {
                throw new Error(`Duplicate position found: ${k}`);
            }
            posSet.add(k);

            // Check bounds (assuming top-left coordinates or adjust if centered)
            // In board.ts logic, groups x/y seem to be topleft (since we add them to box x/y).
            // However, spread functions like 'disk' use center? 
            // Let's assume the bounding box must contain the point (center or topleft).
            // To be safe, let's verify the point is largely within the board.
            // If it's topleft, x >= 0, x + pW <= boardWidth.

            // Relaxed check: the center of the piece should be within board?
            // Or topleft >= 0?
            // packres returns box positions >= 0.
            // g.x += box.x.
            // So g.x should be positive.
            if (g.x < -1 || g.y < -1) { // tolerance
                throw new Error(`Position out of bounds (negative): ${g.x}, ${g.y}`);
            }
            if (g.x > boardDims.boardWidth + 1 || g.y > boardDims.boardHeight + 1) {
                throw new Error(`Position out of bounds (exceeds board): ${g.x}, ${g.y} (Board: ${boardDims.boardWidth}x${boardDims.boardHeight})`);
            }
        }
    };

    [0, 1, 2].forEach((autism: any) => {
        it(`should handle wide aspect ratio (50x2, 100 pieces) [autism=${autism}]`, () => {
            const sets: any[] = [{ cols: 50, rows: 2, width: 1000, height: 40 }];
            const result = layoutAndSpreadGroups(sets, false, false, autism, false, false, false, []);
            expect(result.groups.length).toBe(100);
            expect(() => checkLayout(result, sets)).not.toThrow();
        });

        it(`should handle tall aspect ratio (2x50, 100 pieces) [autism=${autism}]`, () => {
            const sets: any[] = [{ cols: 2, rows: 50, width: 40, height: 1000 }];
            const result = layoutAndSpreadGroups(sets, false, false, autism, false, false, false, []);
            expect(result.groups.length).toBe(100);
            expect(() => checkLayout(result, sets)).not.toThrow();
        });

        it(`should handle large set (20x25, 500 pieces) [autism=${autism}]`, () => {
            const sets: any[] = [{ cols: 20, rows: 25, width: 2000, height: 2500 }];
            const result = layoutAndSpreadGroups(sets, false, false, autism, false, false, false, []);
            expect(result.groups.length).toBe(500);
            expect(() => checkLayout(result, sets)).not.toThrow();
        });
    });
});

