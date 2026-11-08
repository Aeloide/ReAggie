import earcut from "earcut";
import * as bezier from "bezier-js";
import type { Piece } from "./gpu4-renderer";
import type { Curve, Point, VoronoiShape } from "./game";
import { type vec2, sub, len, dot, dist, mid, normalized, smul, add, normal } from "./vec2";

export type PieceData = {
    top?: Curve;
    bottom?: Curve;
    left?: Curve;
    right?: Curve;

    tl: { x: number, y: number; };
    tr: { x: number, y: number; };
    bl: { x: number, y: number; };
    br: { x: number, y: number; };
};

let baseShapesArray = [
    0, 1, 2, 7, 10, 12, 14, 15, 17, 19, 20, 24, 25, 26, 31, 32, 34, 40, 41, 44, 50, 53, 61, 80
];

const 花になって = baseShapesArray.map(e => e.toString(3).padStart(4, '0').repeat(2));

const 楽にして = [0, 7, 3, 4]

function encodeShape(s: PieceData) {
    // top flip == true -> inwards
    // bottom flip == true -> outwards
    let t = !s.top ? 0 : s.top.flip ? 1 : 2;
    let r = !s.right ? 0 : !s.right.flip ? 1 : 2;
    let b = !s.bottom ? 0 : !s.bottom.flip ? 1 : 2;
    let l = !s.left ? 0 : s.left.flip ? 1 : 2;
    const basetype = l + b * 3 ** 1 + r * 3 ** 2 + t * 3 ** 3;
    const basetype3 = basetype.toString(3).padStart(4, '0');
    const その顔 = 花になって.map((e, i) => [i, e.indexOf(basetype3)]).find(e => e[1] >= 0);
    if (!その顔)
        throw new Error("Unexpected shape??");
    return (楽にして[その顔[1]] << 5) | その顔[0];
}

export const buildVoronoiPiece = (pdata: VoronoiShape, tabSize: number): Piece => {
    // Corner to corner lengths
    const origin = pdata.site;
    const segmentsPerCurve = 10;

    const pos = [0, 0];
    const points: number[] = [];

    const ctx: Pick<Path2D, "bezierCurveTo" | "lineTo" | "moveTo"> = {
        bezierCurveTo(cp1x, cp1y, cp2x, cp2y, endx, endy) {
            const curve = new bezier.Bezier([...pos, cp1x, cp1y, cp2x, cp2y, endx, endy]);
            const lutPoints = curve.getLUT(segmentsPerCurve);
            // Skip the first point, it's the same as the previous.
            const isFirstPoint: boolean = points.length == 0;
            for (let i = isFirstPoint ? 0 : 1; i < lutPoints.length; i++) {
                const point = lutPoints[i];
                points.push(point.x, point.y);
            }
            this.moveTo(endx, endy);
        },
        lineTo(x, y) {
            if (!points.length) {
                points.push(...pos);
            }
            points.push(...[x, y]);
            this.moveTo(x, y);
        },
        moveTo(x, y) {
            pos[0] = x;
            pos[1] = y;
        },
    };

    let isFirst = true;
    let prevPoint: vec2 | null = null;
    let i = 0;
    const cornerIndices: number[] = [];

    for (const line of pdata.geometry) {
        if (isFirst) {
            ctx.moveTo(...line);
            prevPoint = line as vec2;
            isFirst = false;
            cornerIndices.push(0);
        } else {
            const curve = pdata.curves[i % pdata.curves.length];
            if (!curve || tabSize === 0)
                ctx.lineTo(...line);
            else {
                // Need to draw the complex curve like drawNubPath does, but handle arbitrary directions
                arbitraryDrawNubPath(ctx, prevPoint!, line as vec2, curve, tabSize);
            }
            cornerIndices.push((points.length / 2) - 1);
            i++;
            prevPoint = line as vec2;
        }
    }

    // Remove the last point if it's a duplicate of the first (closed loop)
    // This prevents computeNormals from creating a zero-length edge at the seam
    if (points.length >= 4 && points[0] === points[points.length - 2] && points[1] === points[points.length - 1]) {
        points.length -= 2;
        // Also remove the last corner index if it points to the now-removed point
        // (which is effectively index 0)
        cornerIndices.pop();
    }

    const normals = computeNormals(points);

    const getvec2 = (l: number[], i: number): vec2 => l.slice(i * 2, (i + 1) * 2) as vec2;
    const setvec2 = (l: number[], i: number, p: vec2) => l.splice(i * 2, 2, p[0], p[1]);
    const numVertices = points.length / 2;

    for (let m = 0; m < cornerIndices.length; m++) {
        const idxStart = cornerIndices[m];
        // Ensure index is valid after potential point removal
        if (idxStart >= numVertices) continue;

        const nextPointIndex = (idxStart + 1) % numVertices;
        const prevPointIndex = (idxStart - 1 + numVertices) % numVertices;

        const currentPoint = getvec2(points, idxStart);
        const prevPoint = getvec2(points, prevPointIndex);

        // Calculate incoming edge normal (prev -> current)
        const edgeVec = sub(currentPoint, prevPoint);
        const edgeLen = len(edgeVec);
        if (edgeLen < 1e-5) continue;

        // Outward normal for CW winding: (dy, -dx)
        const edgeNormal: vec2 = [edgeVec[1] / edgeLen, -edgeVec[0] / edgeLen];
        const vertexNormal = getvec2(normals, idxStart);

        // Scale vertex normal so its component along edge normal is 1
        const d = dot(vertexNormal, edgeNormal);
        if (Math.abs(d) > 1e-4) {
            const scale = 1 / d;
            setvec2(normals, idxStart, smul(vertexNormal, scale));
        }
    }
    const elements = earcut(points);
    if (elements.length / 3 < (points.length / 2) - 2) {
        // console.warn(`Earcut discarded vertices`);
    }

    const elementBuffer = new Uint32Array(elements);
    const positionBuffer = new Float32Array(points);
    const normalBuffer = new Float32Array(normals);

    return {
        id: pdata.cellid,
        offset: [0, 0],
        origin,
        group: 0,
        elementBuffer,
        wireframeBuffer: null,
        positionBuffer,
        normalBuffer,
        type: 0
    } as Piece;
}

export const buildPiece = (pdata: PieceData,
    tabSize: number,
    x: number, y: number,
    pieceWidth: number, pieceHeight: number,
    includeWireframe: boolean = false): Piece => {

    // Corner to corner lengths
    const off = [pieceWidth * 0.5, pieceHeight * 0.5] as const;
    const origin = [
        pieceWidth * x + off[0],
        pieceHeight * y + off[1],
    ] as const;
    const segmentsPerCurve = 10; // Math.max(width, height) / 2; // 12 is good

    const pos = [0, 0];
    // use flat arrays for performance (about three times faster than vec2 array then flattening)
    const points: number[] = [];
    // Assume CW winding order, worst case are normal facing the wrong way?
    const ctx: Pick<Path2D, "bezierCurveTo" | "lineTo" | "moveTo"> = {
        bezierCurveTo(cp1x, cp1y, cp2x, cp2y, endx, endy) {
            const curve = new bezier.Bezier([...pos, cp1x, cp1y, cp2x, cp2y, endx, endy]);
            const lutPoints = curve.getLUT(segmentsPerCurve);
            // Skip the first point, it's the same as the previous.
            const isFirstPoint: boolean = points.length == 0;
            for (let i = isFirstPoint ? 0 : 1; i < lutPoints.length; i++) {
                const point = lutPoints[i];
                points.push(point.x, point.y);
            }
            this.moveTo(endx, endy);
        },
        lineTo(x, y) {
            if (!points.length) {
                points.push(...pos);
            }
            points.push(...[x, y]);
            this.moveTo(x, y);
        },
        moveTo(x, y) {
            pos[0] = x;
            pos[1] = y;
        },
    };

    const topLeft = 0;
    // draw top from left to right
    drawNubPath(ctx, 0, 0, pieceWidth, pieceHeight, true, false, pdata.top, tabSize, pdata.tl, pdata.tr, true);
    const topRight = points.length - 2;
    // draw right from top to bottom
    drawNubPath(ctx, 1, 0, pieceWidth, pieceHeight, false, false, pdata.right, tabSize, pdata.tr, pdata.br);
    const bottomRight = points.length - 2;
    // draw bottom from right to left
    drawNubPath(ctx, 0, 1, pieceWidth, pieceHeight, true, true, pdata.bottom, tabSize, pdata.bl, pdata.br);
    const bottomLeft = points.length - 2;
    // draw left from bottom to top
    drawNubPath(ctx, 0, 0, pieceWidth, pieceHeight, false, true, pdata.left, tabSize, pdata.tl, pdata.bl);
    // Last point is a duplicate of the first
    points.length -= 2;

    const normals = computeNormals(points);
    // Fixup the corners so they line up when connected
    normals[topLeft + 0] = -Math.SQRT1_2;
    normals[topLeft + 1] = -Math.SQRT1_2;
    normals[topRight + 0] = Math.SQRT1_2;
    normals[topRight + 1] = -Math.SQRT1_2;
    normals[bottomRight + 0] = Math.SQRT1_2;
    normals[bottomRight + 1] = Math.SQRT1_2;
    normals[bottomLeft + 0] = -Math.SQRT1_2;
    normals[bottomLeft + 1] = Math.SQRT1_2;

    // make the pieces centered around 0;0
    translate(points, ...off);

    // earcut may decide to discard geometry
    const elements = earcut(points);
    if (elements.length / 3 < (points.length / 2) - 2) {
        console.warn(`Earcut as discarded ${(points.length / 2 - 2) - elements.length / 3} vertices of piece (${x}, ${y})`);
    }
    const elementBuffer = new Uint32Array(elements);
    const positionBuffer = new Float32Array(points);
    const normalBuffer = new Float32Array(normals);

    // if (import.meta.env.DEV) {
    //     assertNoDuplicateVertices(points);
    // }
    return {
        id: 0,
        offset: [0, 0],
        origin,
        group: 0,
        elementBuffer,
        wireframeBuffer: includeWireframe ? new Uint32Array(trianglesToLines(elements)) : null,
        positionBuffer,
        normalBuffer,
        type: encodeShape(pdata)
    } as Piece;
};

/** For wireframes */
export function trianglesToLines(elements: number[]): number[] {
    if (elements.length % 3 != 0) {
        throw new Error("Those aren't triangles!");
    }
    const lineElements: number[] = [];
    for (let i = 0; i < elements.length; i += 3) {
        const A = elements[i], B = elements[i + 1], C = elements[i + 2];
        lineElements.push(A, B, B, C, C, A);
    }
    if (elements.length * 2 != lineElements.length) {
        throw new Error("Line miscount");
    }
    return lineElements;
}

function translate(points: number[], x: number, y: number): void {
    for (let p = 0; p < points.length; p += 2) {
        // make the pieces centered around 0;0
        points[p] -= x;
        points[p + 1] -= y;
    }
}

function computeNormals(points: number[]): number[] {
    const length = points.length;
    if (length % 2 !== 0 || length < 6) throw new Error("Coordinate list is malformed.");

    const vectorNormals: number[] = Array<number>(length);
    for (let i = 0; i < length; i += 2) {
        const j = (i + 2) % length;
        const
            ax = points[i + 0],
            ay = points[i + 1],
            bx = points[j + 0],
            by = points[j + 1];
        const
            vx = bx - ax,
            vy = by - ay;
        const magnitude = Math.sqrt(vx * vx + vy * vy);
        const invMag = magnitude ? 1 / magnitude : 0;
        vectorNormals[i + 0] = vy * invMag;
        vectorNormals[i + 1] = -vx * invMag;
    }

    const vertexNormals: number[] = Array<number>(length);
    for (let i = 0; i < length; i += 2) {
        const j = (i + 2) % length;
        const
            ax = vectorNormals[i + 0],
            ay = vectorNormals[i + 1],
            bx = vectorNormals[j + 0],
            by = vectorNormals[j + 1];
        const
            vx = (ax + bx) / 2,
            vy = (ay + by) / 2;
        const magnitude = Math.sqrt(vx * vx + vy * vy);
        const invMag = magnitude ? 1 / magnitude : 0;
        vertexNormals[j] = vx * invMag;
        vertexNormals[j + 1] = vy * invMag;
    }

    return vertexNormals;
}

function assertNoDuplicateVertices(points: number[]): void {
    for (let i = 0; i < points.length; i += 2) {
        const x1 = points[i], y1 = points[i + 1];
        for (let j = 0; j < points.length; j += 2) {
            if (i === j) continue;
            const x2 = points[j], y2 = points[j + 1];
            if (x1 === x2 && y1 === y2) {
                throw new Error(`Vertex ${j} is a duplicate of ${i} (${x1}, ${y1})!`);
            }
        }
    }
}

/** 
 * Convert a flat list of [X, Y, ...] coordinates to an SVG path.
 * Paste into, for example, https://yqnn.github.io/svg-path-editor/
 */
function coordsToSvgPath(points: number[]) {
    const strings = [`M${points[0]} ${points[1]}L`];
    for (let i = 2; i < points.length; i++) {
        strings.push(points[i] as any as string);
    }
    strings.push("Z");
    return strings.join(" ");
}

export function arbitraryDrawNubPath(
    ctx: Pick<Path2D, "bezierCurveTo" | "lineTo" | "moveTo">,
    start: vec2,
    end: vec2,
    shapeDef: Curve,
    tabSize: number
) {
    if (shapeDef.flip) {
        // Draw the curve as if it was in the other direction (end -> start)
        // This preserves winding order (drawing from start to end) while
        // matching the shape defined on the opposite edge.

        // We restore the original flip state for calculation because we are
        // reconstructing the original curve's points.
        const points = calculateNubPoints(end, start, { ...shapeDef, flip: !shapeDef.flip }, tabSize);

        // Connect start (which corresponds to end of original curve) 
        // to end (start of original curve) by reversing the bezier segments.
        ctx.bezierCurveTo(points[7][0], points[7][1], points[6][0], points[6][1], points[5][0], points[5][1]);
        ctx.bezierCurveTo(points[4][0], points[4][1], points[3][0], points[3][1], points[2][0], points[2][1]);
        ctx.bezierCurveTo(points[1][0], points[1][1], points[0][0], points[0][1], end[0], end[1]);
    } else {
        const points = calculateNubPoints(start, end, shapeDef, tabSize);
        ctx.bezierCurveTo(points[0][0], points[0][1], points[1][0], points[1][1], points[2][0], points[2][1]);
        ctx.bezierCurveTo(points[3][0], points[3][1], points[4][0], points[4][1], points[5][0], points[5][1]);
        ctx.bezierCurveTo(points[6][0], points[6][1], points[7][0], points[7][1], end[0], end[1]);
    }
}

function calculateNubPoints(start: vec2, end: vec2, shapeDef: Curve, tabSize: number): vec2[] {
    const vector = sub(end, start);
    const length = len(vector);
    const u = smul(vector, 1 / length);
    // Perpendicular vector (-y, x) which is 90 degrees clockwise from (x, y) assuming y points down
    const v = normal(u);

    const bendDirection = shapeDef.flip ? -1 : 1;

    // Helper to map relative control parameters to world coordinates
    const map = (along: number, across: number) => {
        // We scale the offset by the length of the edge. 
        // This keeps the tab proportional to the edge length.
        const offset = across * length;
        const p = add(
            add(start, smul(u, along * length)),
            smul(v, offset * bendDirection)
        );
        return p;
    };

    const coefA = shapeDef.a;
    const coefB = shapeDef.b;
    const coefC = shapeDef.c;
    const coefD = shapeDef.d;
    const coefE = shapeDef.e;

    return [
        map(.2, coefA),                                               // 0
        map(.5 + coefB + coefD, -tabSize + coefC),                    // 1
        map(.5 - tabSize + coefB, tabSize + coefC),                   // 2
        map(.5 - 2 * tabSize + coefB - coefD, 3 * tabSize + coefC),   // 3
        map(.5 + 2 * tabSize + coefB - coefD, 3 * tabSize + coefC),   // 4
        map(.5 + tabSize + coefB, tabSize + coefC),                   // 5
        map(.5 + coefB + coefD, -tabSize + coefC),                    // 6
        map(.8, coefE)                                                // 7
    ];
}
export function drawNubPath(ctx: Pick<Path2D, "bezierCurveTo" | "lineTo" | "moveTo">, flagB: number, flagA: number, width: number, height: number, isVertical: boolean, isConnectedToBR: boolean, shapeDef: Curve | undefined, tabsize: number, pointa: Point, pointb: Point, isFirst?: boolean) {
    let isHorizontal = !isVertical, cpLength = isHorizontal ? height : width, cpWidth = isHorizontal ? width : height, flagC = isHorizontal ? flagA : flagB, flagD = isHorizontal ? flagB : flagA, bendDirection = shapeDef && shapeDef.flip ? -1 : 1, originX = 0 + (isHorizontal ? pointa.y : pointa.x), originY = 0 + (isHorizontal ? pointa.x : pointa.y), targetX = 1 + (isHorizontal ? pointb.y : pointb.x), targetY = 0 + (isHorizontal ? pointb.x : pointb.y);

    function generateControlPoint(paramA: number, paramB: number) {
        let r = flagC + paramA;
        return {
            l: cpLength * (r * (targetX - originX) + originX),
            w: cpWidth * (r * (targetY - originY) + (flagD + paramB * bendDirection) + originY)
        };
    }
    let CPorigin = generateControlPoint(0, 0), CPend = generateControlPoint(1, 0);
    if (isFirst)
        ctx.moveTo(CPorigin.l, CPorigin.w);
    if (tabsize && shapeDef) {
        let coefA = shapeDef.a, coefB = shapeDef.b, coefC = shapeDef.c, coefD = shapeDef.d, coefE = shapeDef.e, cpoint0 = generateControlPoint(.2, coefA), cpoint1 = generateControlPoint(.5 + coefB + coefD, -tabsize + coefC), cpoint2 = generateControlPoint(.5 - tabsize + coefB, tabsize + coefC), cpoint3 = generateControlPoint(.5 - 2 * tabsize + coefB - coefD, 3 * tabsize + coefC), cpoint4 = generateControlPoint(.5 + 2 * tabsize + coefB - coefD, 3 * tabsize + coefC), cpoint5 = generateControlPoint(.5 + tabsize + coefB, tabsize + coefC), cpoint6 = generateControlPoint(.5 + coefB + coefD, -tabsize + coefC), cpoint7 = generateControlPoint(.8, coefE);
        if (isVertical) {
            if (isConnectedToBR) {
                ctx.bezierCurveTo(cpoint7.l, cpoint7.w, cpoint6.l, cpoint6.w, cpoint5.l, cpoint5.w);
                ctx.bezierCurveTo(cpoint4.l, cpoint4.w, cpoint3.l, cpoint3.w, cpoint2.l, cpoint2.w);
                ctx.bezierCurveTo(cpoint1.l, cpoint1.w, cpoint0.l, cpoint0.w, CPorigin.l, CPorigin.w);
            } else {
                ctx.bezierCurveTo(cpoint0.l, cpoint0.w, cpoint1.l, cpoint1.w, cpoint2.l, cpoint2.w);
                ctx.bezierCurveTo(cpoint3.l, cpoint3.w, cpoint4.l, cpoint4.w, cpoint5.l, cpoint5.w);
                ctx.bezierCurveTo(cpoint6.l, cpoint6.w, cpoint7.l, cpoint7.w, CPend.l, CPend.w);
            }
        } else {
            if (isConnectedToBR) {
                ctx.bezierCurveTo(cpoint7.w, cpoint7.l, cpoint6.w, cpoint6.l, cpoint5.w, cpoint5.l);
                ctx.bezierCurveTo(cpoint4.w, cpoint4.l, cpoint3.w, cpoint3.l, cpoint2.w, cpoint2.l);
                ctx.bezierCurveTo(cpoint1.w, cpoint1.l, cpoint0.w, cpoint0.l, CPorigin.w, CPorigin.l);
            } else {
                ctx.bezierCurveTo(cpoint0.w, cpoint0.l, cpoint1.w, cpoint1.l, cpoint2.w, cpoint2.l);
                ctx.bezierCurveTo(cpoint3.w, cpoint3.l, cpoint4.w, cpoint4.l, cpoint5.w, cpoint5.l);
                ctx.bezierCurveTo(cpoint6.w, cpoint6.l, cpoint7.w, cpoint7.l, CPend.w, CPend.l);
            }
        }
    } else if (isVertical) {
        if (isConnectedToBR)
            ctx.lineTo(CPorigin.l, CPorigin.w);

        else
            ctx.lineTo(CPend.l, CPend.w);
    } else {
        if (isConnectedToBR)
            ctx.lineTo(CPorigin.w, CPorigin.l);

        else
            ctx.lineTo(CPend.w, CPend.l);
    }
}
