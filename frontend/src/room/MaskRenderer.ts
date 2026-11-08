import { Random } from "../utils";
import { Game, type MaskPiece, random } from "./game";
import type { MediaSetDownloadResult } from "./media-set-loader";
import { type Renderer, computeLayoutGrid, drawJigShapePath, generatePieceShape, initStillPending } from "./render";


export abstract class MaskRenderer implements Renderer {
    abstract doRender(): void;
    abstract doLoadInputImage(): void;
    abstract setBgCol(s: string): void;
    abstract get notRestrictedToPow2Textures(): boolean;
    abstract get isGPU(): boolean;
    abstract complete(): void;
    abstract get drawingBufferWidth(): number;
    abstract get drawingBufferHeight(): number;

    destroy(): void {
        this.imageElements = [];
        delete (this as any).scratchDrawingContext;
        delete (this as any).scratchCanvas;
    }

    imageElements: HTMLImageElement[];
    scratchCanvas = document.createElement("canvas");
    scratchDrawingContext = this.scratchCanvas!.getContext("2d") as CanvasRenderingContext2D;

    maskTextureWidth = 0;
    maskTextureHeight = 0;

    textureHeight = 0;
    textureWidth = 0;

    /*
    The side effects here are writing to Rt and Et.
    My guess is that it's looking for the smallest power of two dimensions that are under 4096 that can fit the (at most 4) images.
    If this is correct, then that's pretty bad as it's used by both renderers and will seriously kill the images quality.
    Though it seems to only be used when more than one image is specified. --shoedrip
    
    Aha! Explains why cpu renderer looks better in some cases -- Vox
*/
    computeTextureSize(images: Pick<HTMLImageElement, "width" | "height">[], isWebGL2: boolean) {
        const maxLength = 4096;
        const { wCount: imagesPerRow, hCount: imagesPerCol } = computeLayoutGrid(this.game.roomdef.sets.length);
        let maxWidth = 0;
        let maxHeight = 0;
        for (const { width, height } of images) {
            maxWidth = Math.max(maxWidth, width);
            maxHeight = Math.max(maxHeight, height);
        }
        if (isWebGL2 && 1 === images.length) {
            const { width, height } = images[0];
            if (width < height) {
                this.textureHeight = Math.min(height, maxLength);
                this.textureWidth = Math.round(width * this.textureHeight / height);
            } else {
                this.textureWidth = Math.min(width, maxLength);
                this.textureHeight = Math.round(height * this.textureWidth / width);
            }
        } else {
            this.textureWidth = Math.min(1 << (32 - Math.clz32(maxWidth * imagesPerRow - 1)), maxLength);
            this.textureHeight = Math.min(1 << (32 - Math.clz32(maxHeight * imagesPerCol - 1)), maxLength);
        }
    }


    constructor(public game: Game) {
        this.imageElements = Array(game.roomdef.sets!.length);
        game.addEventListener("new_set", () => {
            location.reload();
        });
        game.addEventListener("prune_set", () => {
            location.reload();
        });
    }

    // really hope this isn't really mandatory and is just to get a finer result...
    doHitTest(piece: MaskPiece, x: number, y: number): boolean {
        this.scratchDrawingContext!.beginPath();
        drawJigShapePath(this.scratchDrawingContext!, piece.x + piece.puzzleX, piece.y + piece.puzzleY, piece.puzzle, this.game.roomdef.tabSize);
        return this.scratchDrawingContext!.isPointInPath(x, y);
    }

    initialize() {
        const scratchCanvas = this.scratchCanvas!;
        const scratchDrawingContext = this.scratchDrawingContext!;

        const notRestrictedToPow2Textures = this.notRestrictedToPow2Textures;
        const layout = computeLayoutGrid(this.game.state.sets.length);
        const layoutWcount = layout.wCount;
        const layoutHcount = layout.hCount;

        this.game.view.maxPieceHeight = 0;
        this.game.view.maxPieceWidth = 0;
        let maskX = 0, maskY = 0, maxMaskX = 0, maxMaskY = 0;
        for (const localset of this.game.state.sets) {
            const pieceWidth = Math.round(localset.width / localset.cols);
            const pieceHeight = Math.round(localset.height / localset.rows);
            const fortypctofsmallestdim = Math.round(.4 * Math.min(pieceWidth, pieceHeight)); // (1/2.5)
            const y = (pieceHeight + 2 * fortypctofsmallestdim) * localset.rows;
            const x = (pieceWidth + 2 * fortypctofsmallestdim) * localset.cols;
            this.game.view.maxPieceWidth = Math.max(this.game.view.maxPieceWidth, pieceWidth);
            this.game.view.maxPieceHeight = Math.max(this.game.view.maxPieceHeight, pieceHeight);

            if (maskX + x > 16384 && (maskX = 0, (maskY = maxMaskY) + y > 16384))
                throw new Error("Exceeded texture size limit");
            localset.maskX = maskX;
            localset.maskY = maskY;
            localset.pieceWidth = pieceWidth;
            localset.pieceHeight = pieceHeight;
            maxMaskY = Math.max(maxMaskY, maskY + y);
            maxMaskX = Math.max(maxMaskX, maskX + x);
            maskX += x;
        }
        this.maskTextureWidth = (notRestrictedToPow2Textures ? maxMaskX : 1 << (32 - Math.clz32(maxMaskX - 1)));
        this.maskTextureHeight = (notRestrictedToPow2Textures ? maxMaskY : 1 << (32 - Math.clz32(maxMaskY - 1)));
        scratchCanvas.width = this.maskTextureWidth;
        scratchCanvas.height = this.maskTextureHeight;
        scratchDrawingContext.fillStyle = "white";
        scratchDrawingContext.strokeStyle = this.isGPU ? "black" : "rgba(0, 0, 0, 0.3)";
        scratchDrawingContext.lineWidth = 1.2;
        this.game.state.setPieces = [];
        if (this.game.state.sets.length > 1)
            this.computeTextureSize(this.game.state.sets.map(e => ({
                width: e.imageWidth,
                height: e.imageHeight
            })), notRestrictedToPow2Textures);
        for (const [setIndex, currentSet] of this.game.state.sets.entries()) {
            const actualtexture = this.imageElements[setIndex];
            const pieceWidth = currentSet.pieceWidth!;
            const pieceHeight = currentSet.pieceHeight!;
            const fourtyPctOfSmallestDim = Math.round(.4 * Math.min(pieceWidth, pieceHeight)); // (1/2.5)
            const adjustedPieceWidth = pieceWidth + 2 * fourtyPctOfSmallestDim;
            const adjustedPieceHeight = pieceHeight + 2 * fourtyPctOfSmallestDim;

            if (this.isGPU && this.game.state.sets.length > 1) {
                currentSet.tx = 1 / layoutWcount * (setIndex % 2) + 4 / this.textureWidth;
                currentSet.ty = 1 / layoutHcount * Math.floor(setIndex / 2) + 4 / this.textureHeight;
                currentSet.tw = 1 / layoutWcount - 8 / this.textureWidth;
                currentSet.th = 1 / layoutHcount - 8 / this.textureHeight;
            } else {
                currentSet.tx = 1 / layoutWcount * (setIndex % 2);
                currentSet.ty = 1 / layoutHcount * Math.floor(setIndex / 2);
                currentSet.tw = 1 / layoutWcount;
                currentSet.th = 1 / layoutHcount;
            }

            const tileWidth = currentSet.tw / currentSet.cols;
            const tileHeight = currentSet.th / currentSet.rows;
            const scaledTileWidth = tileWidth * (adjustedPieceWidth / pieceWidth);
            const scaledTileHeight = tileHeight * (adjustedPieceHeight / pieceHeight);
            const gpuTileOffsetX = -(scaledTileWidth - tileWidth) / 2;
            const gpuTileOffsetY = -(scaledTileHeight - tileHeight) / 2;
            const N = adjustedPieceWidth / this.maskTextureWidth;
            const L = adjustedPieceHeight / this.maskTextureHeight;
            const zeropos = {
                x: 0,
                y: 0
            };
            const previousPieces: MaskPiece[] = [];
            let pieceindex = 0;
            let random2 = new Random(currentSet.seed === undefined ? random.state : currentSet.seed);
            for (let rowindex = 0; rowindex < currentSet.rows; rowindex++)
                for (let columnindex = 0; columnindex < currentSet.cols; columnindex++, pieceindex++) {
                    const { pieceShape, he, ve, fe, ge } = generatePieceShape(random2, previousPieces, columnindex, rowindex, currentSet, pieceWidth, pieceHeight, zeropos,
                        this.game.roomdef.jitter, this.game.roomdef.cornerJitter, this.game.roomdef.fakeEdge, this.game.roomdef.zigzag);

                    scratchDrawingContext.save();
                    scratchDrawingContext.translate(currentSet.maskX! + adjustedPieceWidth * columnindex, currentSet.maskY! + adjustedPieceHeight * rowindex);
                    scratchDrawingContext.beginPath();
                    drawJigShapePath(scratchDrawingContext, fourtyPctOfSmallestDim, fourtyPctOfSmallestDim, pieceShape, this.game.roomdef.tabSize);
                    scratchDrawingContext.closePath();
                    scratchDrawingContext.fill();
                    let pe = 0;
                    let me = 0;
                    let xe = 1;
                    let we = 1;
                    let tx = 0;
                    let ty = 0;
                    let tw = 0;
                    let th = 0;
                    if (this.isGPU) {
                        pe = he;
                        me = ve;
                        xe = 1 - (he + fe);
                        we = 1 - (ve + ge);
                        tx = currentSet.tx + gpuTileOffsetX + tileWidth * columnindex + scaledTileWidth * pe;
                        ty = currentSet.ty + gpuTileOffsetY + tileHeight * rowindex + scaledTileHeight * me;
                        tw = scaledTileWidth * xe;
                        th = scaledTileHeight * we;
                    } else {
                        scratchDrawingContext.globalCompositeOperation = "source-atop";
                        const cpuTileWidth = actualtexture.width / currentSet.cols;
                        const cpuTileHeight = actualtexture.height / currentSet.rows;
                        const ke = Math.round(cpuTileWidth * (adjustedPieceWidth / pieceWidth));
                        const Me = Math.round(cpuTileHeight * (adjustedPieceHeight / pieceHeight));
                        let _e = ke;
                        let De = Me;
                        let Ae = columnindex * cpuTileWidth - Math.round((_e - cpuTileWidth) / 2);
                        let Ue = rowindex * cpuTileHeight - Math.round((De - cpuTileHeight) / 2);
                        let Xe = 0;
                        let Oe = 0;
                        let Pe = adjustedPieceWidth;
                        let Se = adjustedPieceHeight;
                        if (Ae < 0) {
                            const ze = adjustedPieceWidth * -Ae / ke;
                            _e += Ae;
                            Xe += ze;
                            Pe -= ze;
                            Ae = 0;
                        }
                        if (Ae < 0) {
                            const Fe = adjustedPieceHeight * -Ue / Me;
                            De += Ue;
                            Oe += Fe;
                            Se -= Fe;
                            Ue = 0;
                        }
                        if (Ae + _e > actualtexture.width) {
                            const Ie = actualtexture.width - (Ae + _e);
                            _e -= Ie;
                            Pe -= adjustedPieceWidth * Ie / ke;
                        }
                        if (Ue + De > actualtexture.height) {
                            const Ne = actualtexture.height - (Ue + De);
                            De -= Ne;
                            Se -= adjustedPieceHeight * Ne / Me;
                        }
                        tx = currentSet.maskX! + columnindex * adjustedPieceWidth;
                        ty = currentSet.maskY! + rowindex * adjustedPieceHeight;
                        tw = adjustedPieceWidth;
                        th = adjustedPieceHeight;
                        scratchDrawingContext.drawImage(actualtexture, Ae, Ue, _e, De, Xe, Oe, Pe, Se);
                        scratchDrawingContext.globalCompositeOperation = "source-over";
                    }
                    scratchDrawingContext.stroke();
                    scratchDrawingContext.restore();

                    previousPieces.push({
                        index: pieceindex,
                        xi: columnindex,
                        yi: rowindex,
                        rot: 0,
                        f: false,
                        x: 0,
                        y: 0,
                        spriteX: -adjustedPieceWidth / 2 + adjustedPieceWidth * pe,
                        spriteY: -adjustedPieceHeight / 2 + adjustedPieceHeight * me,
                        spriteW: adjustedPieceWidth * xe,
                        spriteH: adjustedPieceHeight * we,

                        // real image coordinates
                        tx: tx,
                        ty: ty,
                        tw: tw,
                        th: th,

                        // mask coordinates
                        tx2: currentSet.maskX! / this.maskTextureWidth + N * columnindex + N * pe,
                        ty2: currentSet.maskY! / this.maskTextureHeight + L * rowindex + L * me,
                        tw2: N * xe,
                        th2: L * we,

                        puzzle: pieceShape,
                        puzzleX: -pieceWidth! / 2,
                        puzzleY: -pieceHeight! / 2,
                        globalX: 0,
                        globalY: 0,
                        type: 0 //not needed to compute
                    });
                }
            random.state = random2.state;
            this.game.state.setPieces.push(previousPieces);
        }
    }

    uploadTextures(mediaElements: MediaSetDownloadResult[]): void {
        for (let i = 0; i < mediaElements.length; i++) {
            this.imageElements[i] = mediaElements[i].element as HTMLImageElement;
        }

        // initStillPending = false;
        this.doLoadInputImage();
    }

    async init() {
        this.initialize();
    }

}
