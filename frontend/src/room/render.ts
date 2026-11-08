/*
    Both renderers use the CPU to generate masks
*/


import { writable } from "svelte/store";

import type { PieceShape, GamePiece, VoronoiShape } from "./game";
import type { PSet } from "$backend/types";
import type { MediaSetDownloadResult } from "./media-set-loader";

import { nameTags, settings } from "$lib/room/stores";

import { errorhandler } from "./errors";
import { initRoomData, Game } from "./game";
import { Button } from "./Controller";
import { Random } from "../utils";
import type { tesselateSurface } from "$lib/create-room/voronoi";
import type { vec2 } from "./vec2";
import { generateNubCoefficients } from "../jig";
import { drawNubPath } from "./jig-generation";

export const deltaTimeStore = writable(0);
export const frameTimeStore = writable([0, 0]);

// names are very innaccurate, seem to be related to the availability of GPU rendering
// apparently a flag used to control whether or not to redraw the scene, usually when the game state changes
// except it's always set when receiving any kind of message on the WS, even those that don't affect the game state, probably a mistake
// also only the cpu renderer seems to appropriately handle it, a return seems to be missing in the branch taken by the gpu renderer
// TODO: WTF IS THAT? it should be deleted, we have Z (fullRedraw) and group.isDirty props
export let firstTextureLoadFinished = true;
// read by ScheduleAreaRedraw(), seems to be CPU only
// also set when moving the entire view
// so I suspect this is some partial draw mechanism to save CPU, and the `I` array contains regions to redraw?
// would also explain why Vr only runs when on CPU renderer
export let z = true;

export let setFirstTextureLoadFinished = (b: boolean) => firstTextureLoadFinished = b;
export let setZ = (b: boolean) => z = b;

export interface Renderer {

    doRender(): void;

    doLoadInputImage(): void;

    init(): Promise<void>;

    uploadTextures(mediaElements: MediaSetDownloadResult[]): void;

    doHitTest(piece: GamePiece & { puzzle: PieceShape; }, x: number, y: number): boolean;

    setBgCol(s: string): void;

    // request to finish everything pending (debug)
    complete(): void;

    destroy(): void;

    canvasSizeChanged?(newWidth: number, newHeight: number): void;

    drawingBufferWidth: number;
    drawingBufferHeight: number;
}

function randomtenth(random: Random, s = 1) {
    return random.nextInterval(-s / 10, s / 10);
}

function rndxtenth(random: Random, s = 1) {
    return {
        x: randomtenth(random) * s,
        y: 0
    };
}

function rndytenth(random: Random, s = 1) {
    return {
        x: 0,
        y: randomtenth(random) * s
    };
}

export function generatePieceShape(
    random: Random,
    previousPieces: { puzzle: PieceShape; }[],
    columnindex: number, rowindex: number,
    currentSet: PSet,
    pieceWidth: number, pieceHeight: number,
    zeropos: { x: number; y: number; },
    jitter: number,
    cornerJitter: number,
    fakeEdge?: boolean,
    zigzag?: boolean,
    noedge?: boolean) {
    const pieceOfPreviousCol = previousPieces[columnindex - 1 + rowindex * currentSet.cols];
    const pieceOfPreviousRow = previousPieces[columnindex + (rowindex - 1) * currentSet.cols];

    const isTopEdge: boolean = 0 === rowindex;
    const isLeftEdge: boolean = 0 === columnindex;
    const isRightEdge: boolean = currentSet.cols - 1 === columnindex;
    const isBottomEdge: boolean = currentSet.rows - 1 === rowindex;
    const isEdge: boolean = isLeftEdge || isRightEdge || isTopEdge || isBottomEdge;

    const fakeEdges = !!fakeEdge;
    const s = (cornerJitter !== undefined && !isNaN(cornerJitter)) ? cornerJitter * 12.5 : 1.0;
    const rx = randomtenth(random, s);
    const ry = randomtenth(random, s);
    const baseChance = 0.03;

    let fakeX = !isEdge && fakeEdges && rx > baseChance;
    let fakeY = !isEdge && fakeEdges && ry > baseChance;
    // if the previous on the same axis was faked, we can't fake the other on the same axis
    if (!isEdge) {
        if (!pieceOfPreviousRow.puzzle.bottom || rowindex === currentSet.rows - 2)
            fakeY = false;
        if (!pieceOfPreviousCol.puzzle.right || columnindex === currentSet.cols - 2)
            fakeX = false;
    }

    let top = isTopEdge ? void 0 : pieceOfPreviousRow.puzzle.bottom;
    let bottom = (isBottomEdge || fakeY) ? void 0 : generateNubCoefficients(random, jitter, pieceOfPreviousCol?.puzzle?.bottom, zigzag, isLeftEdge);
    let left = isLeftEdge ? void 0 : pieceOfPreviousCol.puzzle.right;
    let right = (isRightEdge || fakeX) ? void 0 : generateNubCoefficients(random, jitter, pieceOfPreviousRow?.puzzle?.right, zigzag);

    if (noedge) {
        if (!top) top = generateNubCoefficients(random, jitter, undefined, zigzag);
        if (!bottom) bottom = generateNubCoefficients(random, jitter, undefined, zigzag);
        if (!left) left = generateNubCoefficients(random, jitter, undefined, zigzag);
        if (!right) right = generateNubCoefficients(random, jitter, undefined, zigzag);
    }

    const pieceShape = {
        width: pieceWidth,
        height: pieceHeight,
        top: top,
        bottom: bottom,
        left: left,
        right: right,

        tl: isLeftEdge ? (isTopEdge ? zeropos : pieceOfPreviousRow.puzzle.bl) :
            pieceOfPreviousCol.puzzle.tr,
        tr: isTopEdge ? (isRightEdge ? zeropos : (fakeEdges ? zeropos : rndxtenth(random, s))) :
            pieceOfPreviousRow.puzzle.br,
        bl: isLeftEdge ? (isBottomEdge ? zeropos : (fakeEdges ? zeropos : rndytenth(random, s))) :
            pieceOfPreviousCol.puzzle.br,
        br: isRightEdge ? (isBottomEdge ? zeropos : (fakeEdges ? zeropos : rndytenth(random, s))) :
            isBottomEdge ? (fakeEdges ? zeropos : rndxtenth(random, s)) : {
                x: fakeEdges ? 0 : randomtenth(random, s),
                y: fakeEdges ? 0 : randomtenth(random, s)
            },
    };
    // not sure how to name those, they seem to be the bounding box of a piece
    // Affects cropping of joined pieces in gpu mode?
    let he = (left?.flip ? -1 : 1) * (.05 + (left ? /*   */ .5 * left.c : 0));
    let fe = (right?.flip ? 1 : -1) * (.05 + (right ? /*  */ .5 * right.c : 0));
    let ve = (top?.flip ? -1 : 1) * (.05 + (top ? /*    */ .5 * top.c : 0));
    let ge = (bottom?.flip ? 1 : -1) * (.05 + (bottom ? /* */ .5 * bottom.c : 0));
    he += (pieceShape.tl.x + pieceShape.bl.x) / 2 * .5;
    fe -= (pieceShape.tr.x + pieceShape.br.x) / 2 * .5;
    ve += (pieceShape.tl.y + pieceShape.tr.y) / 2 * .5;
    ge -= (pieceShape.bl.y + pieceShape.br.y) / 2 * .5;
    return { pieceShape, he, ve, fe, ge };
}

// this allocates region of a larger texture when there are multiple sets
/*
    1 image -> only one region
    2 images -> texture is split horizontally, creating 2 regions
    3 and 4 images -> texture is split horizontally then vertically, creating 4 regions
    the images are then copied in the sub regions resulting from the split
*/
export function computeLayoutGrid(l: number) {
    return {
        wCount: l > 1 ? 2 : 1,
        hCount: l > 2 ? 2 : 1
    };
}


export let initStillPending = true;

export function drawJigShapePath(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    xcoordinate: number,
    ycoordinate: number,
    pieceBounds: PieceShape,
    tabSize: number) {
    ctx.save();
    ctx.translate(xcoordinate, ycoordinate);

    drawNubPath(ctx, 0, 0, pieceBounds.width, pieceBounds.height, true, false, pieceBounds.top, tabSize, pieceBounds.tl, pieceBounds.tr, true);
    drawNubPath(ctx, 1, 0, pieceBounds.width, pieceBounds.height, false, false, pieceBounds.right, tabSize, pieceBounds.tr, pieceBounds.br);
    drawNubPath(ctx, 0, 1, pieceBounds.width, pieceBounds.height, true, true, pieceBounds.bottom, tabSize, pieceBounds.bl, pieceBounds.br);
    drawNubPath(ctx, 0, 0, pieceBounds.width, pieceBounds.height, false, true, pieceBounds.left, tabSize, pieceBounds.tl, pieceBounds.bl);
    ctx.closePath();
    ctx.restore();
}

export async function startLoading(game: Game) {
    try {
        await initRoomData(game);
        initStillPending = false;
    } catch (e) {
        errorhandler(e as any);
        throw e;
    }
}

let oldCurrentTime = performance.now();

export const startRender = (game: Game, canvas: HTMLCanvasElement) => {
    let req1: number, req2: number;

    const stopRender = () => {
        cancelAnimationFrame(req1);
        cancelAnimationFrame(req2);
    };

    setFirstTextureLoadFinished(true);

    let ext: any;
    let queries: WebGLQuery[] = [];
    let lastGpuTime = 0;

    req1 = requestAnimationFrame((function doRender(timeStamp) {
        let timeStampTotal = 0, timeStampRenderer = 0;
        if (import.meta.env.DEV)
            timeStampTotal = performance.now();
        const deltaTime = timeStamp - oldCurrentTime;
        req2 = requestAnimationFrame(doRender);

        const renderer = game.renderer;
        if (renderer) {
            if (renderer.drawingBufferWidth !== ~~(innerWidth * devicePixelRatio) || renderer.drawingBufferHeight !== ~~(innerHeight * devicePixelRatio)) {
                canvas.width = innerWidth * devicePixelRatio;
                canvas.height = innerHeight * devicePixelRatio;
                setFirstTextureLoadFinished(true);
                renderer.canvasSizeChanged?.(canvas.width, canvas.height);
            };
        }

        const ctrl = game.state.controller;
        ctrl.update();
        const speed = -1 / game.view.scale;
        if (ctrl.held & Button.Left)
            game.view.edgePanX -= speed;
        if (ctrl.held & Button.Right)
            game.view.edgePanX += speed;
        if (ctrl.held & Button.Up)
            game.view.edgePanY -= speed;
        if (ctrl.held & Button.Down)
            game.view.edgePanY += speed;

        game.entities.forEach(e => e.update(timeStamp, deltaTime));
        game.actions.updateRenderView(deltaTime);
        if (ctrl.held) {
            game.view.edgePanY = game.view.edgePanX = 0;
        }

        oldCurrentTime = timeStamp;
        if (game.rules.canRotate() || game.rules.canFlip())
            for (const o of game.state.groups) {
                if (o.angle !== o.targetAngle) {
                    o.dirty = true;
                    const s = .01 * deltaTime;
                    if (o.angle < o.targetAngle) {
                        o.angle = Math.min(o.angle + s, o.targetAngle);
                    } else {
                        o.angle = Math.max(o.angle - s, o.targetAngle);
                    }
                }

                if (o.roll !== o.targetRoll) {
                    o.dirty = true;
                    const s = .01 * deltaTime;
                    if (o.roll < o.targetRoll) {
                        o.roll = Math.min(o.roll + s, o.targetRoll);
                    } else {
                        o.roll = Math.max(o.roll - s, o.targetRoll);
                    }
                }
            }

        if (renderer) {
            let gl: WebGL2RenderingContext | undefined;
            if ('gl' in renderer) gl = (renderer as any).gl;

            let query: WebGLQuery | null = null;
            if (import.meta.env.DEV) {
                if (gl) {
                    if (!ext) ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
                    if (ext) {
                        query = gl.createQuery();
                        if (query) gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
                    }
                }
                timeStampRenderer = performance.now();
            }

            try {
                renderer.doRender();
            } catch (error) {
                stopRender();
                //gameStatus.set({ status: "error", text: "Render error:\n" + error });
                throw error;
            }
            if (import.meta.env.DEV) {
                if (gl && ext && query) {
                    gl.endQuery(ext.TIME_ELAPSED_EXT);
                    gl.flush();
                    queries.push(query);

                    while (queries.length > 0) {
                        const q = queries[0];
                        const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
                        const available = gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE);

                        if (available && !disjoint) {
                            lastGpuTime = Number(gl.getQueryParameter(q, gl.QUERY_RESULT)) / 1000000.0;
                            queries.shift();
                            gl.deleteQuery(q);
                        } else if (available || disjoint) {
                            queries.shift();
                            gl.deleteQuery(q);
                        } else {
                            break;
                        }
                    }
                    timeStampRenderer = lastGpuTime;
                } else {
                    const now = performance.now();
                    timeStampRenderer = now - timeStampRenderer;
                }
            }
            firstTextureLoadFinished = false;
            z = false;

            if (!settings.snapshot().hidenametags) {
                nameTags.drawTags(game.view.x, game.view.y, game.view.scale, game.state.groups);
            }
        }

        if (import.meta.env.DEV) {
            const now = performance.now();
            // separate stores per value cause perfmon graph desyncs
            frameTimeStore.set([now - timeStampTotal, timeStampRenderer]);
            deltaTimeStore.set(deltaTime);
        }
    }));

    return stopRender;
};
