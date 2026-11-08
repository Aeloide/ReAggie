import { sub, type vec2 } from "$room/vec2";
import * as d3 from "d3-delaunay";
import { Random } from "../../utils"; // seeded random

function poissonDiscSampler(width: number, height: number, radius: number, random: Random): vec2[] {
    const k = 30;
    const radius2 = radius * radius;
    const R = 3 * radius2;
    const cellSize = radius * Math.SQRT1_2;
    const gridWidth = Math.ceil(width / cellSize);
    const gridHeight = Math.ceil(height / cellSize);
    const grid = new Array(gridWidth * gridHeight);
    const queue: vec2[] = [];
    const result: vec2[] = [];

    function emit(x: number, y: number) {
        const s: vec2 = [x, y];
        queue.push(s);
        result.push(s);
        grid[gridWidth * ((y / cellSize) | 0) + ((x / cellSize) | 0)] = s;
        return s;
    }

    emit(random.next() * width, random.next() * height);

    while (queue.length) {
        const i: number = (random.next() * queue.length) | 0;
        const s: vec2 = queue[i];

        let accepted = false;
        for (let j = 0; j < k; ++j) {
            const a = 2 * Math.PI * random.next();
            const r = Math.sqrt(random.next() * R + radius2);
            const x = s[0] + r * Math.cos(a);
            const y = s[1] + r * Math.sin(a);

            if (0 <= x && x < width && 0 <= y && y < height) {
                const gx = (x / cellSize) | 0;
                const gy = (y / cellSize) | 0;
                let farEnough = true;

                for (let dx = -1; dx <= 1; ++dx) {
                    if (!farEnough) break;
                    for (let dy = -1; dy <= 1; ++dy) {
                        const neighbor: vec2 | undefined = grid[gridWidth * (gy + dy) + (gx + dx)];
                        if (neighbor) {
                            const dx2 = neighbor[0] - x;
                            const dy2 = neighbor[1] - y;
                            if (dx2 * dx2 + dy2 * dy2 < radius2) {
                                farEnough = false;
                                break;
                            }
                        }
                    }
                }

                if (farEnough) {
                    accepted = true;
                    emit(x, y);
                    break;
                }
            }
        }

        if (!accepted) {
            queue[i] = queue[queue.length - 1];
            queue.pop();
        }
    }
    return result;
}

// compat flag to remain compatible with old voronoi generation for a while, can be removed after the new one is tested in production for a bit
export const tesselateSurface = (width: number, height: number, targetCount: number, seed: number = 45, customSites?: vec2[]) => {
    const random = new Random(seed);

    // Heuristic: r approx sqrt(Area / (N * 1.6))
    let r = Math.sqrt((width * height) / (targetCount * 1.6));
    let realPoints = [];
    let bestDiff = Infinity;
    let bestPoints: vec2[] = [];

    const MAX_ITERATIONS = 5;

    if (customSites && customSites.length > 0) {
        bestPoints = customSites;
    } else {
        for (let i = 0; i < MAX_ITERATIONS; i++) {
            const attempt = poissonDiscSampler(width, height, r, random);
            const count = attempt.length;
            const diff = Math.abs(count - targetCount);

            if (diff < bestDiff) {
                bestDiff = diff;
                bestPoints = attempt;
            }

            // Dampened feedback loop
            const ratio = Math.sqrt(count / targetCount);
            r = r * ((ratio + 1) / 2);
        }
    }

    realPoints = bestPoints;
    targetCount = realPoints.length;

    // do a second pass with the ghosts to fill in the rest of the cells
    let points = realPoints;
    let delaunay = d3.Delaunay.from(points);
    let voronoi = delaunay.voronoi([0, 0, width, height]);

    const returnData: {
        segments: { neighborIndex?: number; }[];
        geometry: vec2[];
        site: vec2;
        neighbors: { id: number; relativePosition: vec2 }[]
    }[] = [];

    for (let i = 0; i < targetCount; i++) {
        const site = realPoints[i];
        const neighborsIds = [...delaunay.neighbors(i)];
        // this maps the segment with the neighbor, if the neighbor is outside the bounds, it's undefined
        const segmentToNeighbor: (number | undefined)[] = [];

        const poly = voronoi.cellPolygon(i);
        if (!poly) continue;

        let ptr = 0;
        const comps = [width, height]

        /*
        - Take all segments
        - For each segment, get it's midpoint
        - for each midpoint, move it two times further from the site
        - find the closest site to this new point
        - if delaunay.find returns an index inside the neighborsIds array, it's not clipped, otherwise it is
        */
        const EPS = 1e-1; // Epsilon for coordinate comparison
        const DIST_EPS = 1; // Epsilon for squared distance comparison (looser due to large coordinates)

        const clip = { x: 0, y: 0, width, height };
        const distSq = (p1: vec2, p2: vec2) => (p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2;

        const isBoundaryEdge = (p1: vec2, p2: vec2) => {
            // Check X boundaries
            if (Math.abs(p1[0] - p2[0]) < EPS) {
                if (Math.abs(p1[0] - clip.x) < EPS || Math.abs(p1[0] - (clip.x + clip.width)) < EPS) return true;
            }
            // Check Y boundaries
            if (Math.abs(p1[1] - p2[1]) < EPS) {
                if (Math.abs(p1[1] - clip.y) < EPS || Math.abs(p1[1] - (clip.y + clip.height)) < EPS) return true;
            }
            return false;
        };

        for (let j = 0; j < poly.length - 1; j++) {
            const p1 = poly[j];
            const p2 = poly[j + 1];

            // If this edge is part of the clipping box, it doesn't lead to a Delaunay neighbor
            if (isBoundaryEdge(p1, p2)) {
                // We could store { p1, p2, neighbor: -1 } here if we wanted to track walls
                segmentToNeighbor.push(undefined);
                continue;
            }

            // Calculate midpoint of the edge
            const mid = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2] as vec2;

            // The edge lies on the bisector between activeSite and the correct neighbor.
            // Therefore, the midpoint must be equidistant to activeSite and the neighborSite.
            const dSite = distSq(mid, site);

            let bestNeighbor: number | undefined;
            let bestDiff = Infinity;

            for (const k of neighborsIds) {
                const nSite = points[k];
                const dNeighbor = distSq(mid, nSite);
                const diff = Math.abs(dSite - dNeighbor);

                if (diff < bestDiff) {
                    bestDiff = diff;
                    bestNeighbor = k;
                }
            }

            if (bestDiff < 1.0 && bestNeighbor !== undefined) {
                segmentToNeighbor.push(bestNeighbor);
            } else {
                segmentToNeighbor.push(undefined);
            }
        }
        // segmentToNeighbor.push(...neighborsIds.slice(ptr))

        // --- FIX 2: Pass bounds to helper for clipping ---
        const segments: {
            neighborIndex?: number | undefined;
        }[] = segmentToNeighbor.map((neighborIndex) => ({ neighborIndex }));

        poly.forEach((p) => {
            p[0] -= site[0];
            p[1] -= site[1];
        });

        const neighbors = segmentToNeighbor
            .filter((id) => id !== undefined)
            .map((id) => {
                const nsite: vec2 = realPoints[id];
                return ({
                    id,
                    relativePosition: sub(nsite, site),
                })
            });

        returnData.push({ segments, geometry: poly, site, neighbors });
    }
    return returnData;
}
