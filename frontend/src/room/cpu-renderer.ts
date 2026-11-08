import { createElement } from "../html";
import { drawJigShapePath } from "./render";
import { MaskRenderer } from "./MaskRenderer";
import type { Game, GameGroup, MaskGroup } from "./game";
import { settings } from "$lib/room/stores";
import { firstTextureLoadFinished, setZ as setFullRedraw, z as fullRedraw } from "./render";
import { clamp } from "../utils";

export class CPUMaskRenderer extends MaskRenderer {
    private redrawRegions: {
        x: number,
        y: number,
        w: number,
        h: number;
    }[] = [];

    constructor(game: Game, private canvas: HTMLCanvasElement | OffscreenCanvas) {
        super(game);

        this.cpuDrawingCtx2d = this.canvas.getContext("2d")! as CanvasRenderingContext2D;
    }

    get drawingBufferWidth(): number {
        return this.canvas.width * devicePixelRatio;
    }

    get drawingBufferHeight(): number {
        return this.canvas.height * devicePixelRatio;
    }

    destroy(): void {
        super.destroy();
        this.toggleLayoutHack();
    }

    complete(): void {
    }

    setBgCol(s: string): void {
        // nothing to do, bgcol is already directly used
    }

    // some offscreen canvas that's reused for at least two things: redrawing transparent input images over a white background
    // rendering the mask texture
    //export let scratchCanvas = createElement("canvas");
    //export let scratchDrawingContext = scratchCanvas.getContext("2d") as CanvasRenderingContext2D;

    readonly actualBoardCanvas = createElement("canvas");
    readonly boardInnerDrawingContext = this.actualBoardCanvas && this.actualBoardCanvas.getContext("2d");
    readonly cpucanvas3 = createElement("canvas");
    readonly boardOuterDrawingContext = this.cpucanvas3 && this.cpucanvas3.getContext("2d");
    readonly cpuDrawingCtx2d: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
    possibletransparentbgcol = "white";

    get isGPU() {
        return false;
    }

    get notRestrictedToPow2Textures(): boolean {
        return true;
    }

    private schedulePartialUpdate(group: GameGroup) {
        // Add a group's axis-aligned bounding box to the redraw queue
        // Intersecting AABBs are united to increase performance

        const set = this.game.state.sets[group.set],
            w = set.pieceWidth!,
            h = set.pieceHeight!,
            // Extents are padded by half a piece to account for tabs.
            cx = (group.w + w) / 2,
            cy = (group.h + h) / 2;

        let vRadius, hRadius;

        // Assume worst case if it is rotating
        if (group.angle !== group.targetAngle)
            vRadius = hRadius = Math.sqrt(cx * cx + cy * cy);
        else {
            let turned = 1 === group.rot || 3 === group.rot;
            vRadius = turned ? cy : cx;
            hRadius = turned ? cx : cy;
        }

        this.scheduleAreaRedraw(group.x - vRadius, group.y - hRadius, 2 * vRadius, 2 * hRadius);
    }

    /**
     * Add a rectangular area to the redraw queue.
     * Intersecting areas are united into larger areas.
     * @param x Left edge
     * @param y Top edge
     * @param w Width
     * @param h Height
     */
    private scheduleAreaRedraw(x: number, y: number, w: number, h: number) {
        const maxAreasBeforeFullRedraw = 20;

        const view = this.game.view;

        // Convert to screen space coordinates
        let x1 = Math.max(Math.floor((x + view.x) * view.scale), 0);
        let y1 = Math.max(Math.floor((y + view.y) * view.scale), 0);
        let w1 = clamp(Math.ceil((x + view.x + w) * view.scale) - x1, 0, Math.max(this.canvas.width - x1, 0));
        let h1 = clamp(Math.ceil((y + view.y + h) * view.scale) - y1, 0, Math.max(this.canvas.height - y1, 0));

        if (fullRedraw || 0 == w1 || 0 == h1)
            return;

        /* Dead code, prevented by clamp()
        if (h1 < 0)
            console.warn("invalid redraw", x1, y1, w1, h1);*/

        // assuming `I` are regions to redraw, if there are too many regions, give up and redraw everything
        if (this.redrawRegions.length > maxAreasBeforeFullRedraw) {
            setFullRedraw(true);
            this.redrawRegions.length = 0;
            return;
        }

        // If the new BoundingBox intersects any other BB,
        // replace the new BB with a union of both, and
        // discard the other BB in a LIFO manner.
        for (let i = 0; i < this.redrawRegions.length; i++) {
            const { x: x2, y: y2, w: w2, h: h2 } = this.redrawRegions[i];
            if (x1 < x2 + w2 && x1 + w1 > x2 &&
                y1 < y2 + h2 && y1 + h1 > y2) {

                let tempX = Math.min(x1, x2);
                w1 = Math.max(x1 + w1, x2 + w2) - tempX;
                let tempY = Math.min(y1, y2);
                h1 = Math.max(y1 + h1, y2 + h2) - tempY;
                x1 = tempX; y1 = tempY;

                this.redrawRegions[i] = this.redrawRegions[this.redrawRegions.length - 1];
                this.redrawRegions.length--;
                i = -1; // Start over until the list is empty or no intersections are found
            }
        }

        this.redrawRegions.push({
            x: x1,
            y: y1,
            w: w1,
            h: h1
        });
    }

    private toggleLayoutHack() {
        if (this.canvas instanceof HTMLCanvasElement) {
            this.canvas.classList.toggle('size-full');
            document.body.classList.toggle("overflow-hidden");
        }
    }

    initialize(): void {
        super.initialize();
        this.toggleLayoutHack();
    }

    doRender(): void {
        const { state, view } = this.game;

        if (this.actualBoardCanvas) {
            if ((this.canvas.width === this.actualBoardCanvas.width && this.canvas.height === this.actualBoardCanvas.height) == false) {
                this.actualBoardCanvas.width = this.canvas.width;
                this.actualBoardCanvas.height = this.canvas.height;
                setFullRedraw(true);
            }
        }

        const cpuDrawingCtx2d = this.cpuDrawingCtx2d;

        // try to calculate partial updates first
        if (!fullRedraw) {
            this.redrawRegions.length = 0;
            for (const group of state.groups) {
                if (group.dirty) {
                    if (!fullRedraw) {
                        this.schedulePartialUpdate(group);
                    }
                    group.dirty = false;
                }
            }
        }

        if (!fullRedraw && !firstTextureLoadFinished && !this.redrawRegions.length) {
            return;
        }

        if (fullRedraw) {
            this.redrawRegions.length = 0;
            this.redrawRegions.push({
                x: 0,
                y: 0,
                w: this.canvas.width,
                h: this.canvas.height
            });
        };
        if (!this.cpucanvas3 || !this.boardOuterDrawingContext || !this.boardInnerDrawingContext || !this.actualBoardCanvas) {
            return;
        }
        for (const region of this.redrawRegions) {
            this.cpucanvas3.width = region.w;
            this.cpucanvas3.height = region.h;
            this.boardOuterDrawingContext.fillStyle = "#191919";
            // draws out of bounds
            this.boardOuterDrawingContext.fillRect(0, 0, region.w, region.h);
            this.boardOuterDrawingContext.save();
            this.boardOuterDrawingContext.translate(-region.x, -region.y);
            this.boardOuterDrawingContext.scale(view.scale, view.scale);
            this.boardOuterDrawingContext.fillStyle = settings.snapshot().savedbgcol;
            // draws the background color
            this.boardOuterDrawingContext.fillRect(view.x, view.y, view.boardWidth, view.boardHeight);

            // draws all the pieces, except for selected or held.
            this.boardOuterDrawingContext.lineWidth = 5 / view.scale;
            this.boardOuterDrawingContext.strokeStyle = this.possibletransparentbgcol = "white";
            const xMin = region.x / view.scale;
            const yMin = region.y / view.scale;
            const xMax = xMin + region.w / view.scale;
            const yMax = yMin + region.h / view.scale;
            for (const group of state.groups) {
                if (group.dragged || group.user) {
                    continue; // Prevents duplication
                }
                this.drawPiecesCPU(this.boardOuterDrawingContext, group as MaskGroup, xMin, yMin, xMax, yMax);
            }
            this.boardOuterDrawingContext.restore();
            this.boardInnerDrawingContext.drawImage(this.cpucanvas3, region.x, region.y);
        }
        this.redrawRegions.length = 0;
        cpuDrawingCtx2d.drawImage(this.actualBoardCanvas, 0, 0);
        cpuDrawingCtx2d.save();
        cpuDrawingCtx2d.scale(view.scale, view.scale);

        // draw groups held or selected by others
        cpuDrawingCtx2d.lineWidth = 5 / view.scale;
        cpuDrawingCtx2d.strokeStyle = this.possibletransparentbgcol = "white";
        const xMax = this.canvas.width / view.scale;
        const yMax = this.canvas.height / view.scale;
        for (const group of state.groups) {
            if (group.user) {
                this.drawPiecesCPU(cpuDrawingCtx2d, group as MaskGroup, 0, 0, xMax, yMax);
            }
        }
        // draw groups held by me
        for (const group of view.pickedGroups) {
            this.drawPiecesCPU(cpuDrawingCtx2d, group as MaskGroup, 0, 0, xMax, yMax);
        }
        cpuDrawingCtx2d.restore();
        if (view.isBoxSelecting && view.selection[1][0] && view.selection[1][1]) {
            cpuDrawingCtx2d.save();
            cpuDrawingCtx2d.fillStyle = "rgba(255, 255, 255, 0.2)";
            cpuDrawingCtx2d.scale(view.scale, view.scale);
            // draws the selection rectangle

            cpuDrawingCtx2d.fillRect(view.selection[0][0] + view.x, view.selection[0][1] + view.y, view.selection[1][0], view.selection[1][1]);
            cpuDrawingCtx2d.restore();
        }
    }

    doLoadInputImage(): void {
        //throw new Error("Method not implemented.");
    }

    /**
     * 
     * @param ctx RenderingContext
     * @param group Piece group
     * @param xMin for culling
     * @param yMin for culling
     * @param xMax for culling
     * @param yMax for culling
     */
    drawPiecesCPU(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, group: MaskGroup, xMin: number, yMin: number, xMax: number, yMax: number) {
        const { state, view, rules } = this.game;
        let xPos: number;
        let yPos: number;
        const pSet = state.sets[group.set];
        const screenX = group.x + view.x;
        const screenY = group.y + view.y;
        const gX = (group.w + pSet.pieceWidth!) / 2;
        const gY = (group.h + pSet.pieceHeight!) / 2;

        if (group.angle !== group.targetAngle) {
            xPos = yPos = Math.sqrt(gX * gX + gY * gY);
        } else {
            const swapXY = 1 === group.rot || 3 === group.rot;
            xPos = swapXY ? gY : gX;
            yPos = swapXY ? gX : gY;
        }

        // Cull invisible groups
        if (screenX - xPos > xMax || screenY - yPos > yMax || screenX + xPos < xMin || screenY + yPos < yMin) {
            return;
        }

        const selected = !group.dragged && group.user || group.selected;
        if (selected) {
            const selectionColor = group.user ? group.user.color : "white";
            this.possibletransparentbgcol !== selectionColor && (ctx.strokeStyle = this.possibletransparentbgcol = selectionColor);
        }
        ctx.save();
        ctx.translate(screenX, screenY);
        ctx.rotate(group.angle);

        // Draw selection outline
        if (selected) {
            ctx.beginPath();
            for (const piece of group.pieces) {
                if (!rules.canRotate()) { // rooms with rotation on don't cull?
                    const x = screenX + piece.x + piece.spriteX;
                    const y = screenY + piece.y + piece.spriteY;
                    if (x > xMax || y > yMax || x + piece.spriteW < xMin || y + piece.spriteH < yMin)
                        continue;
                }
                drawJigShapePath(ctx, piece.x + piece.puzzleX, piece.y + piece.puzzleY, piece.puzzle, this.game.roomdef.tabSize);
            }
            ctx.stroke();
        }

        // Draw the pieces
        if (state.isGameEnded()) {
            const img = this.imageElements[group.set];
            ctx.drawImage(this.imageElements[group.set], 0, 0,
                img.naturalWidth, img.naturalHeight,
                -group.w / 2, -group.h / 2,
                group.w, group.h);
        } else for (const p of group.pieces) { // rooms with rotation on don't cull?
            if (!rules.canRotate()) {
                const x = screenX + p.x + p.spriteX;
                const y = screenY + p.y + p.spriteY;
                if (x > xMax || y > yMax || x + p.spriteW < xMin || y + p.spriteH < yMin)
                    continue;
            }
            ctx.drawImage(this.scratchCanvas!, p.tx, p.ty, p.tw, p.th, p.x + p.spriteX, p.y + p.spriteY, p.spriteW, p.spriteH);
        }
        ctx.restore();
    }
}