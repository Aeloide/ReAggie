import { t } from "$lib/i18n";
import { IndexBuffer, TTexture, VertexBuffer, VertexBufferAssembly, WebGLState } from "safe-gl";

import { type Game, type PieceShape, type MaskPiece, type GameGroup, type GamePiece, random, type VoronoiShape, type Curve } from "./game";
import type { Renderer } from "./render";
import type { vec2 } from "./vec2";
import type { Room } from "./types";
import type { Group, PSet } from "../backend/types";
import type { MediaSetDownloadResult } from "./media-set-loader";

import { settings } from "$lib/room/stores";
import { Random, toRgbaNum } from "../utils";
import { createElement } from "../html";

import { buildPiece, buildVoronoiPiece, arbitraryDrawNubPath } from "./jig-generation";
import { drawJigShapePath, firstTextureLoadFinished, generatePieceShape, z } from "./render";
import { generateNubCoefficients } from "../jig";
import { add, mul, sub } from "./vec2";
import { ROTATION } from "./common";
import { Camera2D } from "./Camera2D";
import { DropShadows } from "./DropShadows";
import { ScreenSpaceShadows } from "./ScreenSpaceShadows";
import { BoardDrawer } from "./BoardDrawer";
import { RectangleDrawer } from "./RectangleDrawer";

import jigshader from "./piece.glsl";
import { getUnmaskedInfo } from "$lib/utils";
import { get } from "svelte/store";
import { tesselateSurface } from "$lib/create-room/voronoi";

// const drawWireFrames: boolean = import.meta.env.DEV && false;
const dataTextureMaxSize: number = 1024;

const isFirefox = navigator.userAgent.toLowerCase().includes('firefox');
const isMacos = navigator.userAgent.toLowerCase().includes('macintosh');

const canvasOptions: WebGLContextAttributes = {
    alpha: true,
    antialias: false,
    depth: true,
    desynchronized: false, // true makes large moves in chrome appear in smooth slowmotion on the receiving end??
    failIfMajorPerformanceCaveat: undefined,
    // powerPreference: "low-power",
    premultipliedAlpha: undefined,
    preserveDrawingBuffer: true,
    stencil: undefined,
};

const canRequestVideoFrameCallback = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;

export type TextureInfo = {
    texture: WebGLTexture;
    textureUnit: number;
    needsUpdate?: boolean;
    width: number;
    height: number;
};

type GeoPiece = GamePiece & {
    index: number;
    origin: vec2;
    offset: vec2; // offset relative to the groups center
    group: number; // group id
    elementBuffer: Uint32Array;
    wireframeBuffer: Uint32Array | null;
    positionBuffer: Float32Array;
    normalBuffer: Float32Array;
    points: vec2[];
    indices: [number, number]; // [start; count]
};

export type Piece = {
    // point on the image that corresponds to the center of this piece, in pixel image space
    id: number;
    origin: vec2;
    offset: vec2; // offset relative to the groups center
    group: number; // group id
    elementBuffer: Uint32Array;
    wireframeBuffer: Uint32Array | null;
    positionBuffer: Float32Array;
    normalBuffer: Float32Array;
    points: vec2[];
    indices: [number, number]; // [start; count]
    puzzle: PieceShape;
    type: number;
};

function isPointInPolygon(point: vec2, polygon: vec2[]): boolean {
    let isInside = false;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i][0];
        const yi = polygon[i][1];
        const xj = polygon[j][0];
        const yj = polygon[j][1];

        // Check if the ray from 'point' crosses the edge connecting vertex i and vertex j
        // 1. (yi > point.y) !== (yj > point.y): Checks if the points i and j are on opposite sides of the horizontal ray
        // 2. point.x < ... : Checks if the intersection of the edge with the horizontal line is to the right of the point
        const intersect = ((yi > point[1]) !== (yj > point[1])) &&
            (point[0] < (xj - xi) * (point[1] - yi) / (yj - yi) + xi);

        if (intersect) {
            isInside = !isInside;
        }
    }

    return isInside;
}

/*
Maps one of the 81 possible jig shape to one of 24 general shape + rotation/mirror flags
 */
let lookupArray = [
    0, 1, 2, 193, 69, 71, 194, 3, 75, 129, 4, 137, 5, 206, 6, 7, 207, 8, 130, 9,
    10, 195, 208, 214, 11, 12, 13, 65, 133, 67, 68, 14, 15, 73, 16, 76, 197, 78,
    80, 142, 17, 18, 198, 210, 19, 199, 134, 86, 143, 146, 20, 200, 211, 21, 66,
    135, 139, 201, 70, 72, 74, 22, 77, 131, 79, 140, 144, 82, 83, 150, 84, 85,
    203, 136, 141, 204, 147, 149, 205, 213, 23
];

export let baseShapesArray = [
    0, 1, 2, 7, 10, 12, 14, 15, 17, 19, 20, 24, 25, 26, 31, 32, 34, 40, 41, 44, 50, 53, 61, 80
];

// TODO: move this to game logic, tho for only this renderer can handle this and I don't plan on porting this mode to the older renderers
let now = Date.now();
const lifetime = 5 * 60 * 1000; // TODO: maybe make them customizable on room creation?
const showtime = 4 * 60 * 1000;
const computeRottingRate = (game: Game, g: GameGroup<GamePiece>) => {
    // group hasn't been touched yet, or game has ended, or not connected
    // or the mode isn't sticky and it's a one-piece group
    if (!g.rotp || game.roomdef.endTime || (!game.roomdef.ext?.sticky && g.pieces.length === 1))
        return 1;
    let diff = now - g.rotp;
    if (diff >= lifetime)
        return 0;
    diff -= (lifetime - showtime);
    if (diff < 0)
        return 1;
    return 1 - (diff / showtime);
};

export class GPU4Renderer implements Renderer {
    readonly gl: WebGL2RenderingContext;
    readonly jigGl: JigGL;
    public frameIsDirty = true;
    private rafCounter = 0;
    private readonly osd = new OSD();

    public markGroupDirty(group: GameGroup, oldX: number, oldY: number, newX: number, newY: number, oldRot?: number, newRot?: number) {
        if (this.frameIsDirty) return;

        const isBoxVisible = (x: number, y: number, rot: number) => {
            const set = this.game.state.sets[group.set];
            if (!set) return false;
            const pieceWidth = set.pieceWidth || 0;
            const pieceHeight = set.pieceHeight || 0;
            let groupMidX = (group.w + pieceWidth) / 2;
            let groupMidY = (group.h + pieceHeight) / 2;
            if (group.angle !== group.targetAngle) {
                groupMidX = groupMidY = Math.sqrt(groupMidX * groupMidX + groupMidY * groupMidY);
            }
            const swapXY = rot === ROTATION.EAST || rot === ROTATION.WEST;
            const hx = swapXY ? groupMidY : groupMidX;
            const hy = swapXY ? groupMidX : groupMidY;
            return (
                x + hx > this.camera.left &&
                x - hx < this.camera.right &&
                y + hy > this.camera.top &&
                y - hy < this.camera.bottom
            );
        };

        if (isBoxVisible(oldX, oldY, oldRot ?? group.rot ?? 0) || isBoxVisible(newX, newY, newRot ?? group.rot ?? 0)) {
            this.frameIsDirty = true;
        }
    }

    private readonly setsData: {
        textureUnit: number,
        texture?: TTexture<"RGBA8">,
        texture2?: TTexture<"RGBA8">,
        reuploadTexture: boolean,
        reuploadTexture2: boolean,
        pidOf: (p: GeoPiece) => number,
        element?: HTMLVideoElement | HTMLImageElement,
        element2?: HTMLVideoElement | HTMLImageElement,
        range: vec2;
    }[] = [];

    private readonly jigdraw;
    private totalPieces: number = 0;

    private readonly MAX_TEXTURE_SIZE: number;

    private bgcolorasnum = toRgbaNum(settings.snapshot().savedbgcol);

    private puzzleState!: TTexture<"RGBA32F">;
    private puzzleBuffer!: Float32Array;

    private bases: number[] = [];
    /** Skip draw calls for sets that aren't in view */
    private setsVisibility: boolean[] = [];

    readonly camera: Camera2D;
    private readonly rectangleDrawer: RectangleDrawer;
    private readonly boardDrawer: BoardDrawer;

    private readonly scratchCanvas = createElement("canvas");
    private readonly scratchDrawingContext = this.scratchCanvas.getContext("2d") as CanvasRenderingContext2D;

    // private framebuffer: WebGLFramebuffer;
    // private depthBuffer: WebGLRenderbuffer;
    private dropShadows?: DropShadows;
    // private colorTexture: WebGLTexture;

    private ssShadows?: ScreenSpaceShadows;
    private mainVao?: VertexBufferAssembly;
    private totalIndices: number = 0;

    get drawingBufferWidth() {
        return this.gl.drawingBufferWidth;
    }

    get drawingBufferHeight() {
        return this.gl.drawingBufferHeight;
    }

    msaaFramebuffer: WebGLFramebuffer | null = null;
    resolveFramebuffer: WebGLFramebuffer | null = null;
    colorRenderbuffer: WebGLRenderbuffer | null = null;
    depthRenderbuffer: WebGLRenderbuffer | null = null;
    msaaDFramebuffer: WebGLFramebuffer | null = null;
    colorDRenderbuffer: WebGLRenderbuffer | null = null;
    depthDRenderbuffer: WebGLRenderbuffer | null = null;

    get msaa() {
        const msaa = settings.snapshot().antialias;
        return msaa === 6 ? 4 : msaa;
    }

    pmsaa = -1;
    /**
     * Resolves the multisampled framebuffer to the texture-backed framebuffer
     * Call this after rendering to the MSAA framebuffer and before using the textures
     */
    private resolveMultisampledFramebuffer() {
        const gl = this.gl;
        const width = this.drawingBufferWidth;
        const height = this.drawingBufferHeight;

        // Blit the multisampled framebuffer to the resolve framebuffer
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.msaaFramebuffer);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.resolveFramebuffer);

        // Blit the color buffer
        gl.blitFramebuffer(
            0, 0, width, height,  // Source rectangle
            0, 0, width, height,  // Destination rectangle
            gl.COLOR_BUFFER_BIT,  // Blit the color buffer
            gl.LINEAR             // Use linear interpolation
        );

        // Blit the depth buffer
        gl.blitFramebuffer(
            0, 0, width, height,  // Source rectangle
            0, 0, width, height,  // Destination rectangle
            gl.DEPTH_BUFFER_BIT,  // Blit the depth buffer
            gl.NEAREST            // Use nearest interpolation for depth
        );

        // Unbind framebuffers
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    }

    private setupMultisampledFramebuffer(rgba: boolean) {
        const gl = this.gl;
        const maxSamplesSupported = gl.getParameter(gl.MAX_SAMPLES);
        // Determine the number of samples supported for MSAA (use the minimum of color and depth)
        const maxSamples = Math.min(this.msaa || 2, maxSamplesSupported);
        console.log(maxSamples, maxSamplesSupported, this.msaa);
        // Dimensions should match your rendering context or target texture size
        const width = this.drawingBufferWidth;
        const height = this.drawingBufferHeight;

        gl.deleteFramebuffer(this.msaaFramebuffer || null);
        gl.deleteRenderbuffer(this.colorRenderbuffer || null);
        gl.deleteRenderbuffer(this.depthRenderbuffer || null);

        gl.deleteFramebuffer(this.msaaDFramebuffer || null);
        gl.deleteRenderbuffer(this.colorDRenderbuffer || null);
        gl.deleteRenderbuffer(this.depthDRenderbuffer || null);

        // Create and bind the multisampled framebuffer
        const msaaFramebuffer = gl.createFramebuffer();
        if (!msaaFramebuffer)
            return;
        gl.bindFramebuffer(gl.FRAMEBUFFER, msaaFramebuffer);

        // Create and attach a multisampled color renderbuffer
        const colorRenderbuffer = gl.createRenderbuffer();
        if (!colorRenderbuffer)
            return;
        gl.bindRenderbuffer(gl.RENDERBUFFER, colorRenderbuffer);
        gl.renderbufferStorageMultisample(gl.RENDERBUFFER, maxSamples, rgba ? gl.RGBA8 : gl.RGB8, width, height);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, colorRenderbuffer);

        // Create and attach a multisampled depth renderbuffer (if depth testing is required)
        const depthRenderbuffer = gl.createRenderbuffer();
        if (!depthRenderbuffer)
            return;
        gl.bindRenderbuffer(gl.RENDERBUFFER, depthRenderbuffer);
        gl.renderbufferStorageMultisample(gl.RENDERBUFFER, maxSamples, gl.DEPTH24_STENCIL8, width, height);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, depthRenderbuffer);

        // Check if the framebuffer was successfully created
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
            console.error("Framebuffer is not complete.");
            return;
        }

        if (isMacos) {
            // Create and bind the multisampled framebuffer
            const msaaDFramebuffer = gl.createFramebuffer();
            if (!msaaFramebuffer)
                return;
            gl.bindFramebuffer(gl.FRAMEBUFFER, msaaFramebuffer);

            // Create and attach a multisampled color renderbuffer
            const colorDRenderbuffer = gl.createRenderbuffer();
            if (!colorRenderbuffer)
                return;
            gl.bindRenderbuffer(gl.RENDERBUFFER, colorRenderbuffer);
            gl.renderbufferStorageMultisample(gl.RENDERBUFFER, maxSamples, rgba ? gl.RGBA8 : gl.RGB8, width, height);
            gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, colorRenderbuffer);

            // Create and attach a multisampled depth renderbuffer (if depth testing is required)
            const depthDRenderbuffer = gl.createRenderbuffer();
            if (!depthRenderbuffer)
                return;
            gl.bindRenderbuffer(gl.RENDERBUFFER, depthRenderbuffer);
            gl.renderbufferStorageMultisample(gl.RENDERBUFFER, maxSamples, gl.DEPTH24_STENCIL8, width, height);
            gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, depthRenderbuffer);

            // Check if the framebuffer was successfully created
            if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
                console.error("Framebuffer is not complete.");
                return;
            }

            this.msaaDFramebuffer = msaaDFramebuffer;
            this.colorDRenderbuffer = colorDRenderbuffer;
            this.depthDRenderbuffer = depthDRenderbuffer;
        }

        // Store the framebuffer and renderbuffers in your class for later use
        this.msaaFramebuffer = msaaFramebuffer;
        this.colorRenderbuffer = colorRenderbuffer;
        this.depthRenderbuffer = depthRenderbuffer;

        this.prepareDumpTextures();

        // Unbind the framebuffer and renderbuffer to avoid unintended operations
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    }

    colorTexture?: TTexture<"RGBA">;
    depthTexture?: TTexture<"R32F">;
    textureFramebuffer?: WebGLFramebuffer;
    prepareDumpTextures() {
        const gl = this.gl;
        const width = gl.drawingBufferWidth;
        const height = gl.drawingBufferHeight;

        const old = gl.getParameter(gl.TEXTURE_BINDING_2D);
        if (!this.textureFramebuffer) {
            // first initialization 
            this.colorTexture = this.jigGl.glx.createTexture(["RGBA", "RGBA", "UNSIGNED_BYTE"], [width, height], undefined, {
                // mirrored in case multisample and unaligned samples cause sampling out of bounds
                TEXTURE_WRAP_S: 'MIRRORED_REPEAT',
                TEXTURE_WRAP_T: 'MIRRORED_REPEAT',

                // linear in case effects are used that distort the texture
                TEXTURE_MIN_FILTER: 'LINEAR',
                TEXTURE_MAG_FILTER: 'LINEAR',
            });
            // this.depthTexture = this.jigGl.glx.createTexture(["R32F", "RED", "FLOAT"], [width, height]);
            this.textureFramebuffer = gl.createFramebuffer()!;
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.textureFramebuffer);
            gl.bindTexture(gl.TEXTURE_2D, this.colorTexture!.tex);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.colorTexture.tex, 0);
            // gl.bindTexture(gl.TEXTURE_2D, this.depthTexture!.tex);
            // gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.depthTexture.tex, 0);
            if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
                console.error("Framebuffer is not complete.");
                // throw 23;
            } else {
                console.log('Framebuffer is complete!');
            }
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        } else {
            gl.bindTexture(gl.TEXTURE_2D, this.colorTexture!.tex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            // gl.bindTexture(gl.TEXTURE_2D, this.depthTexture!.tex);
            // gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, width, height, 0, gl.RED, gl.FLOAT, null);
        }
        gl.bindTexture(gl.TEXTURE_2D, old);
    }

    doResolve() {
        const gl = this.gl;
        const width = gl.drawingBufferWidth;
        const height = gl.drawingBufferHeight;

        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.msaaFramebuffer);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.textureFramebuffer!);

        gl.blitFramebuffer(
            0, 0, width, height,   // Source rectangle (entire MSAA framebuffer)
            0, 0, width, height,   // Destination rectangle (entire texture framebuffer)
            gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT,   // Resolve only the color buffer
            gl.NEAREST             // Use nearest-neighbor filtering
        );

        // Unbind framebuffers to avoid unintended operations
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    }

    rgba = true || isFirefox;
    constructor(protected game: Game, private canvas: HTMLCanvasElement | OffscreenCanvas) {
        { // separate scope in hope of getting the offscreen canvas garbage collected asap
            const canv = new OffscreenCanvas(32, 32);
            const ctx = canv.getContext("webgl2", { failIfMajorPerformanceCaveat: false })!;
            if (!ctx)
                throw new Error("Failed to init GPU quality renderer");
            const strings = getUnmaskedInfo(ctx)
                .map((e) => ctx.getParameter(e) || "")
                .join("")
                .toLowerCase();
            if (["powervr", "imagination", "mediatek", "mali"].some((e) => strings.includes(e))) {
                canvasOptions.alpha = true; // required for antialiasing to work
                canvasOptions.desynchronized = false; // causes flickering if set to true
                this.rgba = true;
            }
            if (["direct3d11", "uhd", "intel"].every(e => strings.includes(e))) {
                canvasOptions.alpha = isFirefox; // required for antialiasing to work
                this.rgba = isFirefox;
            }
            canvasOptions.desynchronized = canvasOptions.desynchronized || get(settings).forcedesync;
        }

        const gl = canvas.getContext("webgl2", canvasOptions) as WebGL2RenderingContext | null;
        if (!gl) {
            alert(t("status.noWebgl2"));
            throw new Error("NOWEBGL2");
        }
        this.gl = gl;
        this.jigGl = new JigGL(gl);

        this.MAX_TEXTURE_SIZE = gl.getParameter(gl.MAX_TEXTURE_SIZE);
        console.log("MAX_TEXTURE_SIZE: " + this.MAX_TEXTURE_SIZE);

        this.jigdraw = new jigshader(this.jigGl.glx);

        this.camera = new Camera2D(canvas, gl, -1, 1, () => devicePixelRatio, () => firstTextureLoadFinished, () => z);
        this.rectangleDrawer = new RectangleDrawer(this.jigGl, this.camera);
        this.boardDrawer = new BoardDrawer(this.jigGl, this.camera);
        this.setupMultisampledFramebuffer(this.rgba);
        this.setBgTexture(settings.snapshot().savedbgtexture);

    }
    // squareDrawer!: SquareDrawer;

    async init(): Promise<void> {
        const gl = this.gl;
        //downloads.push(download('/assets/leather.png', false));
        const { sets } = this.game.roomdef;
        let maxpw = Math.max(...sets.map(s => s.pieceWidth || 0));
        let maxph = Math.max(...sets.map(s => s.pieceHeight || 0));
        if (!maxpw || !maxph) {
            maxpw = Math.max(...sets.map(s => s.width / s.cols));
            maxph = Math.max(...sets.map(s => s.height / s.rows));
        }
        // can't render shadows with voronoi pieces because we precompute the piece shapes
        // TODO: actual real shadows???
        if (!this.game.roomdef.ext?.voronoi) {
            this.dropShadows = new DropShadows(this.jigGl, maxpw, maxph, this.game.roomdef.tabSize);
        }
        this.ssShadows = new ScreenSpaceShadows(this.jigGl);
        // this.squareDrawer = new SquareDrawer(this.jigGl, maxpw, maxph);
        // used for finer collision detection against piece nubs
        // the actual draw surface isn't used, so minimize memory usage by making it small
        this.scratchCanvas.width = 1;
        this.scratchCanvas.height = 1;

        const roomdef = this.game.roomdef;
        let piecesperset: Piece[][] = [];
        this.game.state.setPieces = [];
        const groupsperset: GeoPiece[][] = [];
        for (const [i, set] of roomdef.sets.entries()) {
            let pieces: Piece[];
            console.time("Generate pieces");
            if (!('count' in set) && !('sites' in set)) {
                const pieceDims: vec2 = [set.width / set.cols, set.height / set.rows];
                [set.pieceWidth, set.pieceHeight] = pieceDims;
                this.game.view.maxPieceWidth = Math.max(this.game.view.maxPieceWidth, pieceDims[0]);
                this.game.view.maxPieceHeight = Math.max(this.game.view.maxPieceHeight, pieceDims[1]);
                pieces = this.generatePieces(set, i, roomdef.tabSize);
            } else {
                // get the sites in image space then scale them to puzzle space
                const wratio = set.width / set.imageWidth;
                const hratio = set.height / set.imageHeight;
                const ar = [wratio, hratio] as vec2;
                const sites = set.sites!.map(s => mul(s, ar));
                const voronoi = tesselateSurface(set.width, set.height, set.count! || roomdef.pieces, set.seed!, sites);
                // for (let k of voronoi) {
                //     for (let i = 0; i < k.geometry.length; ++i)
                //         k.geometry[i] = mul(k.geometry[i], ar);
                //     k.neighbors.forEach(n => n.relativePosition = mul(n.relativePosition, ar));
                //     k.site = mul(k.site, ar);
                // }

                // set.width  *= wratio;
                // set.height *= hratio;

                const imageArea = set.width * set.height;
                const averagePieceArea = imageArea / voronoi.length;
                const averagePieceSize = Math.sqrt(averagePieceArea);
                const pieceDims: vec2 = [averagePieceSize, averagePieceSize];
                [set.pieceWidth, set.pieceHeight] = pieceDims;
                this.game.view.maxPieceWidth = Math.max(this.game.view.maxPieceWidth, pieceDims[0]);
                this.game.view.maxPieceHeight = Math.max(this.game.view.maxPieceHeight, pieceDims[1]);

                pieces = this.generateVoronoiPieces(voronoi, this.game.roomdef.tabSize);
            }
            console.timeEnd("Generate pieces");
            piecesperset.push(pieces);
            groupsperset.push(roomdef.groups
                .filter(g => g.set === i)
                .map(g => g.indices.map((e) => this.toGeoPiece(piecesperset[g.set][e], e, g, set)))
                .flat()
                .sort((a, b) => a.index - b.index));
        }

        this.bases = this.game.state.sets.map((e, i) => piecesperset.slice(0, i).reduce((a, b) => a + b.length, 0));

        this.game.state.setPieces = groupsperset;
        const refreshTotalPieces = () => {
            let allpieces = piecesperset.flat();
            this.totalPieces = allpieces.length;
            // Triple space to elevate selected pieces + some room for extra layers
            this.camera.setClippingPlanes(-(this.totalPieces * 3 + 10), 10);

            // Create the data textures with a 2D layout
            // to support >4096 pieces on low end devices
            const width = Math.min(this.totalPieces, dataTextureMaxSize);
            const height = Math.floor(this.totalPieces / dataTextureMaxSize) + 1; // max is only 64 per RGBA attribute, for 64k pieces
            const length = width * height * 4;
            this.puzzleBuffer = new Float32Array(length * 4);
            this.puzzleState = this.jigGl.glx.createTexture(["RGBA32F", "RGBA", "FLOAT"], [width, height * 4], undefined, { TEXTURE_WRAP_S: 'CLAMP_TO_EDGE', TEXTURE_WRAP_T: 'CLAMP_TO_EDGE' });
            return length;
        }
        let length = refreshTotalPieces();

        let ptr = 0;

        let indexbufs: Uint32Array[] = [];
        let posbufs: Float32Array[] = [];
        let normbufs: Float32Array[] = [];
        let pidbufs: Float32Array[] = [];

        let prev = 0;
        this.setsData.length = 0;
        const pidOfI = (i: number) => (((b) => (p: GeoPiece) => p.index + b)(this.bases[i]));
        const ingestSet = (i: number, set: PSet) => {
            const pidOf = pidOfI(i);
            for (let p of groupsperset[i]) {
                for (let i = 0; i < p.elementBuffer.length; ++i) {
                    p.elementBuffer[i] += ptr; // fixup indices for later concatenation
                }
                const vcount = p.positionBuffer.length / 2;
                indexbufs.push(p.elementBuffer);
                posbufs.push(p.positionBuffer);
                normbufs.push(p.normalBuffer);
                const pid = pidOf(p);
                this.puzzleBuffer.set(p.origin, 3 * length + (pid) * 4);
                const pidbuf = new Float32Array(vcount).fill(pid);
                pidbufs.push(pidbuf);
                p.indices = [ptr, p.elementBuffer.length];
                ptr += vcount;
            }

            const count = groupsperset[i].map(g => g.indices[1]).flat().reduce((a, b) => a + b);
            this.setsData.push({
                pidOf,
                range: [prev, count],
                reuploadTexture: !!set.isvideo,
                reuploadTexture2: !!set.isvideo2,
                textureUnit: 4 + i,
                texture: this.jigGl.glx.createTexture(["RGBA8", "RGBA", "UNSIGNED_BYTE"], [1, 1], new Uint8Array([127, 127, 127, 255]))
            });
            prev += count;
        }
        for (const [i, set] of this.game.state.sets.entries()) {
            ingestSet(i, set);
        }
        // debugger;
        // Upload the static vertex data
        const positions = new VertexBuffer(gl, "STATIC_DRAW", ["position", "vec2"]);
        const normals = new VertexBuffer(gl, "STATIC_DRAW", ["normal", "vec2"]);
        const pids = new VertexBuffer(gl, "STATIC_DRAW", ["pieceid", "float"]);
        const indexbuf = new IndexBuffer(gl, "STATIC_DRAW", "UNSIGNED_INT");
        positions.set(concatF32Array(posbufs));
        normals.set(concatF32Array(normbufs));
        pids.set(concatF32Array(pidbufs));
        const allIndices = concatU32Array(indexbufs);
        indexbuf.set(allIndices);
        this.totalIndices = allIndices.length;

        this.mainVao = new VertexBufferAssembly(gl, indexbuf, positions, normals, pids);
        this.jigdraw.setAssembly(this.mainVao);

        this.setsVisibility = new Array<boolean>(this.game.state.sets.length);
    }

    toVoronoiGeoPiece(arg0: Piece, e: number, g: Group, set: PSet): any {
        throw new Error("Method not implemented.");
    }

    generateVoronoiPieces(voronoi: ReturnType<typeof tesselateSurface>, tabSize = 0.1) {
        const random2 = new Random(42 * 1000);
        const pieces = new Map<number, { shape: VoronoiShape }>();
        const curvesFromTo = new Map<string, Curve>();
        for (let j = 0; j < voronoi.length; ++j) {
            const cell = voronoi[j];
            let p: VoronoiShape = {} as any;
            p.type = "voronoi";
            p.neighbors = cell.neighbors;
            p.site = cell.site;
            p.cellid = j;
            const minx = Math.min(...cell.geometry.map(g => g[0]));
            const maxx = Math.max(...cell.geometry.map(g => g[0]));
            const miny = Math.min(...cell.geometry.map(g => g[1]));
            const maxy = Math.max(...cell.geometry.map(g => g[1]));
            p.width = maxx - minx;
            p.height = maxy - miny;
            p.bboxCenter = [(minx + maxx) / 2, (miny + maxy) / 2];
            p.geometry = cell.geometry;
            p.curves = [];

            // relies on the map being built in order
            for (let si = 0; si < cell.segments.length; ++si) {
                const seg = cell.segments[si];
                if (seg.neighborIndex === undefined) {
                    p.curves.push(undefined);
                } else {
                    const p1: vec2 = [cell.geometry[si][0] + cell.site[0], cell.geometry[si][1] + cell.site[1]];
                    const p2: vec2 = [cell.geometry[si + 1][0] + cell.site[0], cell.geometry[si + 1][1] + cell.site[1]];
                    const k1 = `${p1[0].toFixed(3)},${p1[1].toFixed(3)}`;
                    const k2 = `${p2[0].toFixed(3)},${p2[1].toFixed(3)}`;
                    const edgeKey = k1 < k2 ? `${k1};${k2}` : `${k2};${k1}`;
                    const isCanonical = k1 < k2;

                    let curve = curvesFromTo.get(edgeKey);
                    if (!curve) {
                        curve = generateNubCoefficients(random2, this.game.roomdef.jitter);
                        curvesFromTo.set(edgeKey, curve);
                    }

                    if (isCanonical) {
                        p.curves.push(curve);
                    } else {
                        p.curves.push({ ...curve, flip: !curve.flip });
                    }
                }
            }
            pieces.set(j, { shape: p });
        }

        const ret: Piece[] = [];
        for (let kv of pieces) {
            // now we need to generate the geometry for each piece
            const { shape } = kv[1];
            const piece = buildVoronoiPiece(shape, tabSize);
            piece.puzzle = shape as any;
            ret.push(piece);
        }
        return ret;
        // return pieces;
    }

    private toGeoPiece(p: Piece, index: number, g: Room['groups'][0], s: Room['sets'][0]): GeoPiece {
        const isVoronoi = (p.puzzle as any).type === 'voronoi';

        let puzzleX = isVoronoi ? 0 : -s.pieceWidth! / 2;
        let puzzleY = isVoronoi ? 0 : -s.pieceHeight! / 2;
        if (isVoronoi) {
            const shape = (p.puzzle as any) as VoronoiShape;
            // shape.bboxCenter is relative to the site, which is the origin (0,0) of the piece in local space.
            // puzzleX/Y should be the top-left coordinate relative to the origin.
            puzzleX = shape.bboxCenter[0] - shape.width / 2;
            puzzleY = shape.bboxCenter[1] - shape.height / 2;
        }
        return {
            index,
            ...p,
            rot: g.rot || 0,
            f: g.f || false,
            xi: index % s.cols, yi: ~~(index / s.cols),

            x: 0, y: 0, // pos relative to group center? recomputed when initing and merging groups

            // bloat as it's set-invariant, add these to gets top-left coordinates from center coordinates
            puzzleX,
            puzzleY,

            globalX: 0, globalY: 0, // global center of this piece, computed as parent global group pos + local pos relative to group center, will be 0,0 when the piece is alone in its group

        };
    }

    private generatePieces(set: PSet, sid: number, tabSize = 0.1): Piece[] {
        const dims = [set.width, set.height] as const;
        const split = [set.cols, set.rows] as const;
        const [columns, rows] = split;
        const { pieceWidth, pieceHeight } = set;

        const pieces: Piece[] = Array<Piece>(columns * rows);
        const pieceWidth2 = dims[0] / split[0];
        const pieceHeight2 = dims[1] / split[1];

        let random2 = new Random(set.seed === undefined ? random.state : set.seed);
        for (let row = 0, i = 0; row < rows; ++row) {
            for (let col = 0; col < columns; ++col, i++) {
                const { pieceShape: pdata } = generatePieceShape(random2, pieces, col, row, set, pieceWidth!, pieceHeight!, { x: 0, y: 0 },
                    this.game.roomdef.jitter, this.game.roomdef.cornerJitter, this.game.roomdef.fakeEdge, this.game.roomdef.zigzag, this.game.roomdef.noedge);
                //const pdata: PieceData = pieceShape;
                pieces[i] = {
                    ...buildPiece(pdata, tabSize, col, row, pieceWidth2, pieceHeight2, false),
                    puzzle: pdata,
                };
                pieces[i].id = pieces[i].group = i;
            }
        }
        random.state = random2.state;
        return pieces;
    };

    public uploadTexture(mediaElement: MediaSetDownloadResult) {
        const gl = this.gl;
        const i = this.game.state.sets.indexOf(mediaElement.set!);
        const set = this.setsData[i];

        const isVideo = mediaElement.isVideo;
        const elem = mediaElement.element;

        let media = downscale(elem, this.MAX_TEXTURE_SIZE);
        const ntex = this.jigGl.glx.createTexture(["RGBA8", "RGBA", "UNSIGNED_BYTE"], media.image, undefined, {
            TEXTURE_WRAP_S: 'CLAMP_TO_EDGE',
            TEXTURE_WRAP_T: 'CLAMP_TO_EDGE',
            TEXTURE_MIN_FILTER: isVideo ? 'LINEAR' : 'LINEAR_MIPMAP_LINEAR',
            TEXTURE_MAG_FILTER: 'LINEAR',
        });

        if (mediaElement.isSecond) {
            set.element2 = elem;
            set.texture2 = ntex;
        }
        else {
            set.element = elem;
            set.texture = ntex;
        }
        const error = gl.getError();
        if (error !== gl.NO_ERROR && !isVideo) {
            // the image might be corrupted
            // HACK: canvas internally converts the image data into a format that WebGL can understand
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d")!;
            canvas.width = elem.width;
            canvas.height = elem.height;
            ctx.drawImage(elem, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            canvas.remove();

            ntex.realloc(imageData, {
                TEXTURE_WRAP_S: 'CLAMP_TO_EDGE',
                TEXTURE_WRAP_T: 'CLAMP_TO_EDGE',
                TEXTURE_MIN_FILTER: isVideo ? 'LINEAR' : 'LINEAR_MIPMAP_LINEAR',
                TEXTURE_MAG_FILTER: 'LINEAR',
            });
        }

        if (isVideo) {
            const video = media.image as HTMLVideoElement;
            // On Chrome and derivative, we can update the texture only when a new frame really needs to be displayed
            if (canRequestVideoFrameCallback) {
                video.requestVideoFrameCallback(function setNeedsUpdate() {
                    set.reuploadTexture = true;
                    video.requestVideoFrameCallback(setNeedsUpdate);
                });
            }
            video.addEventListener('pause', () => {
                video.play();
            });
        }
    }

    public uploadTextures(mediaElements: MediaSetDownloadResult[]) {
        for (const mediaElement of mediaElements) {
            this.uploadTexture(mediaElement);
        }
    }

    destroy(): void {
        for (const set of this.setsData) {
            delete set.element;
        }
        this.jigGl.destroy();
        this.osd.destroy();
        this.dropShadows?.destroy();
        // this.deleteFramebuffer();
    }

    doRender(): void {
        const view = this.game.view;
        const cameraChanged = this.camera.update(view.scale, view.x, view.y);
        if (cameraChanged) {
            this.frameIsDirty = true;
        }

        // 1. Check oscillating selection in view (including other players' selections)
        const hideosc = settings.snapshot().hideosc;
        const hasOscillatingSelection = !hideosc && this.game.state.groups.some(g => (g.selected || g.dragged || g.user || g.selectedByOther) && this.isVisibleInCameraView(g));
        if (hasOscillatingSelection) {
            this.frameIsDirty = true;
        }

        // 2. Check video frames in view
        const videoFramePending = this.setsData.some((set, idx) =>
            this.setsVisibility[idx] && (set.reuploadTexture || set.reuploadTexture2)
        );
        if (videoFramePending) {
            this.frameIsDirty = true;
        }

        // 3. Check entity position shifts
        if (this.game.entities.some(e => e.dirty())) {
            this.frameIsDirty = true;
        }

        const gamingmode = settings.snapshot().gamingmode;
        if (gamingmode) {
            this.rafCounter++;
            if (this.rafCounter >= 10) {
                this.frameIsDirty = true;
            }
        }

        this.frameIsDirty = this.frameIsDirty || this.game.state.groups.some(g => g.dirty);

        // If nothing changed, we skip rendering entirely
        if (!this.frameIsDirty) {
            return;
        }
        this.frameIsDirty = false;
        this.rafCounter = 0;

        const qual = settings.snapshot().shadowQuality || 'accurate';
        const hideshadows = settings.snapshot().hideshadow;

        const gl = this.gl;
        const timeStamp = performance.now(); // This ought to be passed in by the caller
        now = Date.now();
        const invViewScale = 1 / view.scale;
        const selectionThickness = settings.snapshot().hideosc ?
            3.125 * invViewScale
            : (1.5 + Math.sin(timeStamp * 0.004) * .5) * 2.5 * invViewScale;
        const pieceOutlines = Math.min(Math.min(this.game.state.sets[0].pieceWidth! * 0.05, 0.75) * invViewScale * 0.5, 1, 1);

        this.osd.clear();

        if (this.pmsaa != this.msaa) {
            this.setupMultisampledFramebuffer(this.rgba);
            this.pmsaa = this.msaa;
        }
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.msaaFramebuffer);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.msaaDFramebuffer);
        gl.clearColor(0.1, 0.1, 0.1, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);

        gl.depthFunc(gl.LEQUAL);
        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE);

        //gl.bindRenderbuffer(gl.ACTIVE_TEXTURE, this.depthBuffer);
        // gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);

        // Draw the board
        // gl.disable(gl.BLEND);
        // gl.disable(gl.DEPTH_TEST);

        this.boardDrawer.draw(0, 0, this.game.roomdef.boardWidth, this.game.roomdef.boardHeight, this.bgcolorasnum);

        gl.enable(gl.BLEND);

        this.updateSets(); // Top expense

        if (!hideshadows && qual === 'accurate' && this.ssShadows && this.mainVao) {
            this.ssShadows.prepare(this.drawingBufferWidth, this.drawingBufferHeight, this.totalIndices, this.puzzleState, this.camera, this.mainVao);
            // Prepare disables blending, so we need to re-enable it
            gl.enable(gl.BLEND);
        }

        // Draw the jigsaw pieces
        gl.enable(gl.DEPTH_TEST);
        this.jigdraw.uniforms.camera.data = this.camera.projectionMatrix;
        this.jigdraw.bindings.puzzleState.texture = this.puzzleState;
        let candrawShadows = false;
        const f = this.game.roomdef.flipping;
        for (let i = 0; i < this.setsData.length; ++i) {
            const set = this.game.state.sets[i];
            const piececount = set.cols * set.rows;
            if (!this.setsVisibility[i]) {
                // basepiece += piececount;
                // continue
            };
            candrawShadows = true;
            const setdata = this.setsData[i];
            const indexBytesPerElement = 4;
            const [offset, count] = setdata.range;

            // on firefox we have to upload the video texture every frame 
            // (so even a 25fps video will be uploaded 120 times a second on a 120hz screen)
            this.jigdraw.bindings.image.texture = setdata.texture;
            this.jigdraw.bindings.image2.texture = f ? (setdata.texture2 || setdata.texture) : setdata.texture;
            if (setdata.reuploadTexture && setdata.element) {
                setdata.reuploadTexture = !canRequestVideoFrameCallback;
                setdata.texture!.realloc(setdata.element, {
                    TEXTURE_WRAP_S: 'CLAMP_TO_EDGE',
                    TEXTURE_WRAP_T: 'CLAMP_TO_EDGE',
                    TEXTURE_MIN_FILTER: 'LINEAR',
                    TEXTURE_MAG_FILTER: 'LINEAR',
                });
            }

            if (setdata.texture2 && setdata.reuploadTexture2) {
                setdata.reuploadTexture = !canRequestVideoFrameCallback;
                setdata.texture2!.realloc(setdata.element2!, {
                    TEXTURE_WRAP_S: 'CLAMP_TO_EDGE',
                    TEXTURE_WRAP_T: 'CLAMP_TO_EDGE',
                    TEXTURE_MIN_FILTER: 'LINEAR',
                    TEXTURE_MAG_FILTER: 'LINEAR',
                });
            }

            this.jigdraw.uniforms.idims.data = [set.width, set.height];
            // console.log(i, count, offset);
            this.jigGl.glx.using(this.jigdraw, drawer => {
                // Draw the jigsaw picture
                // this.jigdraw.uniforms.grow.data = 0;
                this.jigdraw.uniforms.grow.data = -pieceOutlines;
                this.jigdraw.uniforms.selection.data = +false;
                this.jigdraw.uniforms.grow.sync();
                this.jigdraw.uniforms.selection.sync();
                drawer.drawElements(gl.TRIANGLES, count, offset * indexBytesPerElement);

                // Draw the press lines
                this.jigdraw.uniforms.grow.data = 1 - this.game.view.borderOpacity;
                this.jigdraw.uniforms.grow.sync();
                drawer.drawElements(gl.TRIANGLES, count, offset * indexBytesPerElement);

                // Draw selection outlines
                gl.enable(gl.STENCIL_TEST);
                gl.stencilFunc(gl.ALWAYS, 1, 0xFF);
                gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
                gl.stencilMask(0xFF);

                this.jigdraw.uniforms.grow.data = selectionThickness;
                this.jigdraw.uniforms.selection.data = +true;
                this.jigdraw.uniforms.grow.sync();
                this.jigdraw.uniforms.selection.sync();
                drawer.drawElements(gl.TRIANGLES, count, offset * indexBytesPerElement);

                gl.disable(gl.STENCIL_TEST);
            });

        }

        // gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        // gl.disable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        // gl.activeTexture(gl.TEXTURE0 + 0);
        // gl.bindTexture(gl.TEXTURE_2D, this.colorTexture);
        // this.dropShadows.draw();
        // gl.bindTexture(gl.TEXTURE_2D, null);
        //gl.blitFramebuffer(0, 0, 0, 0, gl.canvas.width, gl.canvas.height, gl.canvas.width, gl.canvas.height, gl.COLOR_BUFFER_BIT, gl.LINEAR);

        // Draw the selection box

        if (!settings.snapshot().hideshadow && candrawShadows) {
            gl.depthMask(false);

            if (qual === 'accurate' && this.ssShadows) {
                this.ssShadows.draw(this.drawingBufferWidth, this.drawingBufferHeight, view.scale, this.totalPieces, settings.snapshot().shadowLightPos);
            } else if (qual === 'approximate' && this.dropShadows) {
                this.dropShadows.draw(
                    this.game.roomdef.pieces,
                    this.puzzleState,
                    this.camera);
            }
            gl.depthMask(true);
        }



        gl.disable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND); // Ensure blending is on for entities/selection box transparency

        this.game.entities.forEach(e => e.doRender());

        if (view.isBoxSelecting) {
            this.rectangleDrawer.drawRect(...view.selection[0], ...add(view.selection[1], view.selection[0]));
        }

        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.msaaFramebuffer);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.blitFramebuffer(
            0, 0, this.drawingBufferWidth, this.drawingBufferHeight, // Source rectangle
            0, 0, this.drawingBufferWidth, this.drawingBufferHeight, // Destination rectangle
            gl.COLOR_BUFFER_BIT, // Mask indicating which buffer(s) to copy
            gl.NEAREST // Interpolation method for resolving multisamples
        );

        this.doResolve();

        // Invalidate MSAA framebuffer attachments since they are resolved
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.msaaFramebuffer);
        gl.invalidateFramebuffer(gl.READ_FRAMEBUFFER, [
            gl.COLOR_ATTACHMENT0,
            gl.DEPTH_STENCIL_ATTACHMENT
        ]);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);

        // Invalidate default framebuffer depth/stencil attachments
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.invalidateFramebuffer(gl.FRAMEBUFFER, [gl.DEPTH, gl.STENCIL]);

        this.game.entities.forEach(e => 'doPostRender' in e && e.doPostRender());
    }

    // Performance bottleneck
    updateSets() {
        // TODO: theorically, we don't need to update the textures on every frame

        // the groups are already ordered back to front
        // so we just need to increment this
        // the selection must always be above the rest
        // update all group attributes at once
        // let depth = 0;

        const prevSetsVisibility = [...this.setsVisibility];
        this.setsVisibility.fill(false);

        let updateRequired = false;
        for (let gi = 0; gi < this.game.state.groups.length; gi++) {
            const g = this.game.state.groups[gi];

            const setIsInView = this.setsVisibility[g.set] || this.isVisibleInCameraView(g);
            this.setsVisibility[g.set] ||= setIsInView;

            const isDirty = g.dirty || !!g.rotp || false;
            updateRequired ||= setIsInView && isDirty;
        }

        if (!updateRequired) {
            for (let i = 0; i < this.setsVisibility.length; i++) {
                const setMovedOutOfView = prevSetsVisibility[i] && !this.setsVisibility[i];
                updateRequired ||= setMovedOutOfView;
            }

            if (!updateRequired) {
                return;
            }
        }

        let updateGpuData = false;
        const width = Math.min(this.totalPieces, dataTextureMaxSize);
        const height = Math.floor(this.totalPieces / dataTextureMaxSize) + 1; // max is only 64 per RGBA attribute, for 64k pieces
        const l = width * height * 4;

        // for is faster than for-of
        for (let gi = 0; gi < this.game.state.groups.length; gi++) {
            const g = this.game.state.groups[gi];
            const ptr = (g.id) * 4; // group
            const ptr3 = ptr + l * 2; // style
            const ptr4 = ptr + l * 3; // [xy: origin, z: rot, w: roll]

            // Disabling this logic for now, updating the group buffer doesn't directly 
            // set updateGpuData, while it should (it will most of the time because of other pieces). But if it did, it'd trigger texture uploads, but happens most of the time anyway so the dirty flag doesn't 
            // save anything except when literally nothing on screen is moving.
            //if (!isInView && wasInView === false || g.dirty === false) {
            // depth += g.pieces.length;
            // Depth has to be updated if the group orders changed
            // for the last moved piece to stay on top
            //this.groupBuffer[ptr + 3] = gi;
            //continue;
            //}
            g.dirty = false;

            const base = this.bases[g.set];
            // attr0
            this.puzzleBuffer[ptr] = g.x;
            this.puzzleBuffer[ptr + 1] = g.y;
            this.puzzleBuffer[ptr + 2] = -g.angle;
            // If held or selected by me, put it at the very top.
            // If selected by someone else, put it above unselected pieces.
            const depthBonus = this.totalPieces * (g.dragged || g.selected ? 2 : g.user ? 1 : 0);
            this.puzzleBuffer[ptr + 3] = depthBonus + gi;
            // end attr0

            // TODO: Switch to unsigned byte array
            // this.groupStyleBuffer.set(g.selected ? [1, 1, 1, 1] : g.user?.highlight || [0, 0, 0, 0], ptr);
            // attr2
            this.puzzleBuffer.set(g.selected ? [1, 1, 1, 1] : g.user?.highlight || [0, 0, 0, 0], ptr3);
            // endattr2
            this.puzzleBuffer[ptr4 + 2] = computeRottingRate(this.game, g);
            this.puzzleBuffer[ptr4 + 3] = g.roll;
            // TODO: This only needs to updated when the group contents change
            for (let pi = 0; pi < g.pieces.length; pi++) {
                const p = g.pieces[pi];
                const o = (base + p.index) * 4;
                this.puzzleBuffer[l + o] = p.x;
                this.puzzleBuffer[l + o + 1] = p.y;
                this.puzzleBuffer[l + o + 2] = g.id;
                this.puzzleBuffer[l + o + 3] = p.type;
                // Depth by piece basis, allows for the press lines between joined pieces.
                //this.pieceBuffer[o + 3] = depthBonus + depth++; //(sel ? bonus : 0) + depth++;
            }

            updateGpuData = true;
        }

        if (updateGpuData) {
            // respecify texture to not lock rendering
            this.puzzleState.realloc(this.puzzleBuffer, { TEXTURE_WRAP_S: 'CLAMP_TO_EDGE', TEXTURE_WRAP_T: 'CLAMP_TO_EDGE' });
        }
    }

    isVisibleInCameraView(group: GameGroup<GamePiece>): boolean {
        const { pieceWidth, pieceHeight } = this.game.state.sets[group.set];
        let groupMidX = (group.w + pieceWidth!) / 2;
        let groupMidY = (group.h + pieceHeight!) / 2;
        if (group.angle !== group.targetAngle) { // Assume worst case if it's currently rotating.
            groupMidX = groupMidY = Math.sqrt(groupMidX * groupMidX + groupMidY * groupMidY);
        }
        const swapXY = group.rot === ROTATION.EAST || group.rot === ROTATION.WEST;
        const x = swapXY ? groupMidY : groupMidX;
        const y = swapXY ? groupMidX : groupMidY;
        return (
            group.x + x > this.camera.left &&
            group.x - x < this.camera.right &&
            group.y + y > this.camera.top &&
            group.y - y < this.camera.bottom);
    }

    complete(): void {
        this.gl.finish();
    }

    setBgCol(s: string): void {
        this.bgcolorasnum = toRgbaNum(s);
        this.frameIsDirty = true;
    }

    setBgTexture(textureName: string): void {
        this.boardDrawer.setTexture(textureName);
        this.frameIsDirty = true;
    }

    doLoadInputImage(): void {
        //throw new Error("Method not implemented.");
    }

    doHitTest(piece: MaskPiece, x: number, y: number): boolean {
        // HACK: Debug overlay
        // let debugCanvas = document.getElementById('voronoi-debug-canvas') as HTMLCanvasElement;
        // if (!debugCanvas) {
        //     debugCanvas = document.createElement('canvas');
        //     debugCanvas.id = 'voronoi-debug-canvas';
        //     debugCanvas.style.cssText = 'position:fixed;top:50px;left:10px;z-index:99999;border:1px solid #999;background:rgba(255,255,255,0.9);pointer-events:none;width:200px;height:200px;';
        //     debugCanvas.width = 300;
        //     debugCanvas.height = 300;
        //     document.body.appendChild(debugCanvas);
        // }

        if ((piece.puzzle as any).type === "voronoi") {
            const shape = piece.puzzle as any as VoronoiShape;
            const tabSize = this.game.roomdef.tabSize;

            const ctx = this.scratchDrawingContext;
            const canvas = ctx.canvas;
            canvas.width = 300;
            canvas.height = 300;
            ctx.clearRect(0, 0, 300, 300);

            // Center piece on canvas (150, 150)
            const cx = 150;
            const cy = 150;

            ctx.beginPath();
            ctx.lineWidth = 2;
            ctx.strokeStyle = 'blue';
            ctx.fillStyle = 'rgba(0, 0, 255, 0.1)';

            let isFirst = true;
            let prevPoint: vec2 | null = null;

            for (const line of shape.geometry) {
                // Geo points are relative to piece center (roughly). 
                // Draw at Center + GeoPoint
                const currentPoint: vec2 = [line[0] + cx, line[1] + cy];

                if (isFirst) {
                    ctx.moveTo(currentPoint[0], currentPoint[1]);
                    prevPoint = currentPoint;
                    isFirst = false;
                } else {
                    ctx.lineTo(currentPoint[0], currentPoint[1]);
                    prevPoint = currentPoint;
                }
            }
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Transform world cursor (x, y) to canvas space
            // Canvas Space = (World - PiecePos) + Center
            const testX = (x - piece.x) + cx;
            const testY = (y - piece.y) + cy;

            const isHit = ctx.isPointInPath(testX, testY);

            ctx.beginPath();
            ctx.arc(testX, testY, 4, 0, Math.PI * 2);
            ctx.fillStyle = isHit ? '#00ff00' : '#ff0000';
            ctx.fill();
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1;
            ctx.stroke();

            // Dump to debug canvas
            // const dCtx = debugCanvas.getContext('2d')!;
            // dCtx.clearRect(0, 0, 300, 300);
            // dCtx.drawImage(canvas, 0, 0);

            return isHit;
        }
        this.scratchDrawingContext.beginPath();
        drawJigShapePath(this.scratchDrawingContext, piece.x + piece.puzzleX, piece.y + piece.puzzleY, piece.puzzle, this.game.roomdef.tabSize);
        return this.scratchDrawingContext.isPointInPath(x, y);
        //return true;
    }

    canvasSizeChanged(newWidth: number, newHeight: number): void {
        this.setupMultisampledFramebuffer(this.rgba);
        this.frameIsDirty = true;
        // this.setupFramebuffer();
    }
}

// TODO: Try createBitmapImage instead of a canvas.
function downscale(media: HTMLImageElement | HTMLVideoElement, maxSize: number): { image: TexImageSource, width: number, height: number; } {
    const isVideo = 'videoHeight' in media;
    const width = isVideo ? media.videoWidth : media.naturalWidth;
    const height = isVideo ? media.videoHeight : media.naturalHeight;
    // Don't bother with videos
    if (isVideo || (width <= maxSize && height <= maxSize)) {
        return { image: media, width, height };
    }

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { alpha: true, willReadFrequently: true })!;

    let size = maxSize;
    do {
        try {
            const scaleToFit = Math.min(size / width, size / height);
            canvas.width = width * scaleToFit;
            canvas.height = height * scaleToFit;

            // Firefox limitation (32k or 500MB/1GB) means you can't test only the last pixel.
            // https://bugzilla.mozilla.org/show_bug.cgi?id=1402711
            ctx.drawImage(media, 0, 0, canvas.width, canvas.height);
            const result = ctx.getImageData(canvas.width - 1, canvas.height - 1, 1, 1);
            if (result.data[0] || result.data[1] || result.data[2] || result.data[3]) {
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                console.log(`Resized to ${imageData.width}x${imageData.height}`);
                return { image: imageData, width: canvas.width, height: canvas.height };
            }
        } finally {
            canvas.width = canvas.height = 0;
            size >>= 1;
        }
    } while (size >= 2048);
    throw new Error("Resizing failed");
}

function concatF32Array(posbufs: Float32Array[]) {
    let s = posbufs.reduce((a, b) => a + b.length, 0);
    let r = new Float32Array(s);
    let ptr = 0;
    for (let p of posbufs) {
        r.set(p, ptr);
        ptr += p.length;
    }
    return r;
}

function concatU32Array(indexbufs: Uint32Array[]) {
    let s = indexbufs.reduce((a, b) => a + b.length, 0);
    let r = new Uint32Array(s);
    let ptr = 0;
    for (let p of indexbufs) {
        r.set(p, ptr);
        ptr += p.length;
    }
    return r;
}

const placeholderImage = new Uint8Array([127, 127, 127, 255]); // Needs to be 50% gray for correct background color

export type mat4 = [
    c0r0: number, c1r0: number, c2r0: number, c3r0: number,
    c0r1: number, c1r1: number, c2r1: number, c3r1: number,
    c0r2: number, c1r2: number, c2r2: number, c3r2: number,
    c0r3: number, c1r3: number, c2r3: number, c3r3: number,
];

class OSD {
    timeout?: ReturnType<typeof setTimeout>;
    lines: string[] = [];
    div: HTMLElement;
    constructor() {
        this.div = document.querySelector("body")!.appendChild(document.createElement("div"))!;
        Object.assign(this.div.style, {
            position: "absolute",
            //zIndex: "0",
            top: "80px",
            left: "1em",
            whiteSpace: "pre-wrap",
            fontFamily: "monospace",
            pointerEvents: "none",
        } as Partial<CSSStyleDeclaration>);
    }
    log(...t: any[]) {
        this.lines.push(t.join("\t"));
        clearTimeout(this.timeout);
        this.timeout = setTimeout(() => {
            const out = this.lines.join("\n");
            if (out != this.div.textContent)
                this.div.textContent = out;
        },);
    }
    clear() {
        this.lines.length = 0;
    }
    destroy() {
        this.div.remove();
    }
}

/** DEPRECATED, avoid using. 
 * WebGL cleanup helper. */
export class JigGL {
    private readonly destructors: (() => void)[] = [];

    glx;
    constructor(public gl: WebGL2RenderingContext) {
        this.glx = new WebGLState(gl);
    }

    private create<T>(createFn: () => T | null, destructor: (obj: T) => any): T {
        const gl = this.gl;
        const obj = createFn.call(gl);
        if (!obj) throw new Error(`${createFn.name} failed.`);
        this.destructors.push(() => void destructor.call(gl, obj));
        return obj;
    }

    /** Free up GPU memory by deleting known objects. */
    destroy() {
        for (const destroy of this.destructors) {
            destroy();
        }
    }

    createBuffer(): WebGLBuffer {
        const gl = this.gl;
        return this.create(gl.createBuffer, gl.deleteBuffer);
    }
    createFramebuffer(): WebGLFramebuffer {
        const gl = this.gl;
        return this.create(gl.createFramebuffer, gl.deleteFramebuffer);
    }
    createQuery(): WebGLQuery {
        const gl = this.gl;
        return this.create(gl.createQuery, gl.deleteQuery);
    }
    createRenderbuffer(gl: WebGL2RenderingContext): WebGLRenderbuffer {
        return this.create(gl.createRenderbuffer, gl.deleteRenderbuffer);
    }
    createSampler(): WebGLSampler {
        const gl = this.gl;
        return this.create(gl.createSampler, gl.deleteSampler);
    }
    createTexture(): WebGLTexture {
        const gl = this.gl;
        return this.create(gl.createTexture, gl.deleteTexture);
    }
    createTransformFeedback(): WebGLTransformFeedback {
        const gl = this.gl;
        return this.create(gl.createTransformFeedback, gl.deleteTransformFeedback);
    }
    createVertexArray(): WebGLVertexArrayObject {
        const gl = this.gl;
        return this.create(gl.createVertexArray, gl.deleteVertexArray);
    }
}