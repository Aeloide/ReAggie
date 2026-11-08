import { computeLayoutGrid, firstTextureLoadFinished, setFirstTextureLoadFinished } from "./render";
import { MaskRenderer } from "./MaskRenderer";
import { clamp, toRgbaNum } from "../utils";
import { Game } from "./game";
import type { MaskGroup, MaskPiece } from "./game";
import { boardShader, initShader as initShaders, jigshader, shader4 } from "./shaders";
import { settings } from "$lib/room/stores";

export function createTexture(gpucontext: WebGL2RenderingContext | WebGLRenderingContext) {
    let e = gpucontext!.createTexture();
    if (!e) throw new Error("Failed to create texture");
    return e;
}

type webglData = {
    vertices: Float32Array;
    indexBuffer: WebGLBuffer;
    buffers: any;
    currentBuffer: number;
    index: number;
    count: number;
    capacity: number;
};

const defaultHighlightColor = [1.5, 1.5, 1.5, 1.5];
export class GPUMaskRenderer extends MaskRenderer {
    get drawingBufferWidth() {
        return this.gpucontext?.drawingBufferWidth || 0;
    }

    get drawingBufferHeight() {
        return this.gpucontext?.drawingBufferHeight || 0;
    }

    bgcolorasnum = toRgbaNum(settings.snapshot().savedbgcol);

    complete(): void {
        this.gpucontext!.finish();
    }
    setBgCol(s: string): void {
        this.bgcolorasnum = toRgbaNum(s);
    }

    scaledViewWidth = 1;
    scaledViewHeight = 1;
    gpucontext: WebGL2RenderingContext | WebGLRenderingContext | null = null;
    isWebGL2 = false;

    realImage: WebGLTexture | null = null;
    maskTexture: WebGLTexture | null = null;
    xt: WebGLTexture | null = null;

    previousSelecter?: number[];

    initialMatrix = new Float32Array([111, 0, 0, 0, 0, 222, 0, 0, 0, 0, 1, 0, -1, 1, 0, 1]);
    transformMat2d = new Float32Array([1, 0, 0, 1, 0, 0]);
    currentFrameBuffer: WebGLFramebuffer | null = null;

    get isGPU() {
        return true;
    }

    get notRestrictedToPow2Textures(): boolean {
        return this.isWebGL2;
    }

    doRender(): void {
        const { state, view } = this.game;

        this.scaledViewWidth = innerWidth / view.scale;
        this.scaledViewHeight = innerHeight / view.scale;
        if (this.gpucontext && this.gt && boardShader && jigshader) {
            this.gt.currentBuffer = 0;
            if (!firstTextureLoadFinished) {
                // @ts-ignore
                if (chrome) {
                    this.gpucontext.enable(this.gpucontext.SCISSOR_TEST);
                    this.gpucontext.scissor(0, 0, 1, 1);
                    this.gpucontext.activeTexture(this.gpucontext.TEXTURE0);
                    this.gpucontext.bindTexture(this.gpucontext.TEXTURE_2D, this.realImage);
                    this.gpucontext.activeTexture(this.gpucontext.TEXTURE1);
                    this.gpucontext.bindTexture(this.gpucontext.TEXTURE_2D, this.maskTexture);
                    this.gpucontext.activeTexture(this.gpucontext.TEXTURE2);
                    this.gpucontext.bindTexture(this.gpucontext.TEXTURE_2D, this.xt);
                    this.gpucontext.useProgram(jigshader.program);
                    this.setupVertexBuffer(this.gt, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
                    this.executeDrawingCommands(this.gt);
                    this.gpucontext.activeTexture(this.gpucontext.TEXTURE2);
                    this.gpucontext.bindTexture(this.gpucontext.TEXTURE_2D, null);
                    this.gpucontext.activeTexture(this.gpucontext.TEXTURE1);
                    this.gpucontext.bindTexture(this.gpucontext.TEXTURE_2D, null);
                    this.gpucontext.activeTexture(this.gpucontext.TEXTURE0);
                    this.gpucontext.bindTexture(this.gpucontext.TEXTURE_2D, null);
                    this.gpucontext.disable(this.gpucontext.SCISSOR_TEST);
                }
            }
            this.initialMatrix[0] = view.scale * (2 / (this.gpucontext.drawingBufferWidth / devicePixelRatio));
            this.initialMatrix[5] = view.scale * (-2 / (this.gpucontext.drawingBufferHeight / devicePixelRatio));
            this.gpucontext.viewport(0, 0, this.gpucontext.drawingBufferWidth, this.gpucontext.drawingBufferHeight);
            this.gpucontext.clearColor(.1, .1, .1, 1), this.gpucontext.clear(this.gpucontext.COLOR_BUFFER_BIT);
            this.gpucontext.enable(this.gpucontext.BLEND);
            this.gpucontext.blendEquation(this.gpucontext.FUNC_ADD);
            this.gpucontext.blendFunc(this.gpucontext.ONE, this.gpucontext.ONE_MINUS_SRC_ALPHA);
            this.gpucontext.useProgram(boardShader.program);
            this.gpucontext.uniformMatrix4fv(boardShader.uniforms.transform, false, this.initialMatrix);
            this.setupVertexBuffer(this.gt, view.x, view.y, view.boardWidth, view.boardHeight, 0, 0, 0, 0, 0, 0, 0, 0,
                this.bgcolorasnum[0], this.bgcolorasnum[1], this.bgcolorasnum[2], 1);
            // draws the background color
            this.executeDrawingCommands(this.gt);
            this.gpucontext.activeTexture(this.gpucontext.TEXTURE0);
            this.gpucontext.bindTexture(this.gpucontext.TEXTURE_2D, this.realImage);
            this.gpucontext.activeTexture(this.gpucontext.TEXTURE1);
            this.gpucontext.bindTexture(this.gpucontext.TEXTURE_2D, this.maskTexture);
            this.gpucontext.activeTexture(this.gpucontext.TEXTURE2);
            this.gpucontext.bindTexture(this.gpucontext.TEXTURE_2D, this.xt);
            this.gpucontext.useProgram(jigshader.program);
            this.gpucontext.uniformMatrix4fv(jigshader.uniforms.transform, false, this.initialMatrix);
            this.gpucontext.uniform1f(jigshader.uniforms.viewScale, view.scale);
            this.gpucontext.uniform2f(jigshader.uniforms.shadowOffset, -3 / this.maskTextureWidth, -3 / this.maskTextureHeight);
            this.gpucontext.uniform2f(jigshader.uniforms.shadowSpread, 10 / this.maskTextureWidth / view.scale, 10 / this.maskTextureHeight / view.scale);
            this.gpucontext.uniform1f(jigshader.uniforms.borderOpacity, view.borderOpacity);
            this.updateUniformColor(jigshader.uniforms.highlightColor, this.previousSelecter = (defaultHighlightColor)!);

            for (const u of state.groups) {
                if (!u.dragged)
                    this.updateGroup(u as MaskGroup);
            }
            for (const group of view.pickedGroups) {
                this.updateGroup(group as MaskGroup);
            }
            this.transformMat2d[0] = 1;
            this.transformMat2d[1] = 0;
            this.transformMat2d[2] = 0;
            this.transformMat2d[3] = 1;
            this.transformMat2d[4] = 0;
            this.transformMat2d[5] = 0;
            // draws the piece textures??
            this.executeDrawingCommands(this.gt);

            this.gpucontext.activeTexture(this.gpucontext.TEXTURE2);
            this.gpucontext.bindTexture(this.gpucontext.TEXTURE_2D, null);
            this.gpucontext.activeTexture(this.gpucontext.TEXTURE1);
            this.gpucontext.bindTexture(this.gpucontext.TEXTURE_2D, null);

            this.gpucontext.activeTexture(this.gpucontext.TEXTURE0);
            this.gpucontext.bindTexture(this.gpucontext.TEXTURE_2D, null);
            if (view.isBoxSelecting && view.selection[1][0] && view.selection[1][1]) {
                this.gpucontext.useProgram(boardShader.program);
                this.gpucontext.uniformMatrix4fv(boardShader.uniforms.transform, false, this.initialMatrix);
                let Y = .2;
                this.setupVertexBuffer(this.gt,
                    view.selection[0][0] + view.x, view.selection[0][1] + view.y,
                    view.selection[1][0], view.selection[1][1],
                    0, 0, 0, 0, 0, 0, 0, 0, Y, Y, Y, Y);
                // draws the selection rectangle
                this.executeDrawingCommands(this.gt);
            }
        }
    }

    imageLoaded = false;

    doLoadInputImage(): void {
        if (!this.gpucontext) throw new Error("GPU rendering is disabled");
        this.imageLoaded = true;
        const moreThanOneImage = this.imageElements.length > 1;
        const { wCount: imagesPerRow, hCount: imagesPerCol } = computeLayoutGrid(this.game.roomdef.sets.length);
        this.computeTextureSize(this.imageElements, this.notRestrictedToPow2Textures);

        this.scratchCanvas.width = this.textureWidth;
        this.scratchCanvas.height = this.textureHeight;
        this.scratchDrawingContext.fillStyle = "white";
        this.scratchDrawingContext.fillRect(0, 0, this.scratchCanvas.width, this.scratchCanvas.height);
        this.imageElements.forEach((image, i) => {
            if (moreThanOneImage) {
                const o = 8,
                    allocatedWidth = this.textureWidth / imagesPerRow,
                    allocatedHeight = this.textureHeight / imagesPerCol,
                    c = allocatedWidth - o,
                    u = allocatedHeight - o,
                    xOffset = allocatedWidth * (i % 2),
                    yOffset = allocatedHeight * Math.floor(i / 2);

                this.scratchDrawingContext.drawImage(image, 0, 0, 1, 1, xOffset, yOffset, o / 2, o / 2);
                this.scratchDrawingContext.drawImage(image, image.width - 1, 0, 1, 1, xOffset + c + o / 2, yOffset, o / 2, o / 2);
                this.scratchDrawingContext.drawImage(image, 0, image.height - 1, 1, 1, xOffset, yOffset + u + o / 2, o / 2, o / 2);
                this.scratchDrawingContext.drawImage(image, image.width - 1, image.height - 1, 1, 1, xOffset + c + o / 2, yOffset + u + o / 2, o / 2, o / 2);
                this.scratchDrawingContext.drawImage(image, 0, 0, 1, image.height, xOffset, yOffset + o / 2, o / 2, u);
                this.scratchDrawingContext.drawImage(image, image.width - 1, 0, 1, image.height, xOffset + c + o / 2, yOffset + o / 2, o / 2, u);
                this.scratchDrawingContext.drawImage(image, 0, 0, image.width, 1, xOffset + o / 2, yOffset, c, o / 2);
                this.scratchDrawingContext.drawImage(image, 0, image.height - 1, image.width, 1, xOffset + o / 2, yOffset + u + o / 2, c, o / 2);
                this.scratchDrawingContext.drawImage(image, 0, 0, image.width, image.height, xOffset + o / 2, yOffset + o / 2, c, u);
            } else {
                const f = this.textureWidth / imagesPerRow,
                    v = this.textureHeight / imagesPerCol,
                    g = f * (i % 2),
                    p = v * Math.floor(i / 2);
                this.scratchDrawingContext.drawImage(image, 0, 0, image.width, image.height, g, p, f, v);
            }
        });
        this.realImage = (this.realImage || createTexture(this.gpucontext)!);

        this.gpucontext.bindTexture(this.gpucontext.TEXTURE_2D, this.realImage);
        this.gpucontext.texImage2D(this.gpucontext.TEXTURE_2D, 0, this.gpucontext.RGB, this.gpucontext.RGB, this.gpucontext.UNSIGNED_BYTE, this.scratchCanvas);
        this.gpucontext.texParameteri(this.gpucontext.TEXTURE_2D, this.gpucontext.TEXTURE_MAG_FILTER, this.gpucontext.LINEAR);
        this.gpucontext.texParameteri(this.gpucontext.TEXTURE_2D, this.gpucontext.TEXTURE_MIN_FILTER, this.gpucontext.LINEAR_MIPMAP_LINEAR);
        this.gpucontext.texParameteri(this.gpucontext.TEXTURE_2D, this.gpucontext.TEXTURE_WRAP_S, this.gpucontext.CLAMP_TO_EDGE);
        this.gpucontext.texParameteri(this.gpucontext.TEXTURE_2D, this.gpucontext.TEXTURE_WRAP_T, this.gpucontext.CLAMP_TO_EDGE);
        this.gpucontext.generateMipmap(this.gpucontext.TEXTURE_2D);
        this.gpucontext.bindTexture(this.gpucontext.TEXTURE_2D, null);
        setFirstTextureLoadFinished(true);
    }

    destroy(): void {
        super.destroy();
        this.currentFrameBuffer;
        this.gpucontext?.deleteFramebuffer(this.currentFrameBuffer);
        this.gpucontext?.deleteTexture(this.maskTexture);
        this.gpucontext?.deleteTexture(this.xt);
        this.gpucontext?.deleteTexture(this.realImage);
        this.gt.buffers.forEach((e: WebGLBuffer) => {
            this.gpucontext?.deleteBuffer(e);
        });
        this.gpucontext?.deleteBuffer(this.gt.indexBuffer);
        delete (this.gt as Partial<this['gt']>).vertices;
        delete (this as Partial<GPUMaskRenderer>)['gt'];
        delete (this as Partial<GPUMaskRenderer>)['gpucontext'];
    }

    gt!: webglData;
    constructor(game: Game, canvas: HTMLCanvasElement | OffscreenCanvas) {
        super(game);

        const gpucontextoptions = {
            alpha: false,
            antialias: false,
            desynchronized: true,
            preserveDrawingBuffer: true
        };

        this.gpucontext = canvas.getContext("webgl2", gpucontextoptions) as WebGL2RenderingContext | null;
        this.isWebGL2 = !!this.gpucontext;
        this.gpucontext ??= canvas.getContext("webgl", gpucontextoptions) as WebGLRenderingContext | null;
        if (canvas instanceof HTMLCanvasElement) {
            this.gpucontext ??= canvas.getContext("experimental-webgl", gpucontextoptions) as WebGLRenderingContext;
            this.gpucontext.pixelStorei(this.gpucontext.UNPACK_ALIGNMENT, 1);
        }
        initShaders(this.gpucontext!);


        this.gt = ((): webglData => {
            const numQuads = 8192;
            /** See {@link setupVertex}: 10 floats: X,Y, U?,V?,?,?, R,G,B,A */
            const vertexDataSize = 10;
            const indices = new Uint16Array(6 * numQuads); // 49152
            const vertexData = new Float32Array(4 * numQuads * vertexDataSize); // 327680
            for (let i = 0, tri = 0; i < indices.length; tri = tri + 4 | 0) {
                indices[i++] = tri + 0 | 0;
                indices[i++] = tri + 1 | 0;
                indices[i++] = tri + 2 | 0;
                indices[i++] = tri + 0 | 0;
                indices[i++] = tri + 2 | 0;
                indices[i++] = tri + 3 | 0;
            }
            const indexBuffer = this.gpucontext!.createBuffer();
            this.gpucontext!.bindBuffer(this.gpucontext!.ELEMENT_ARRAY_BUFFER, indexBuffer);
            this.gpucontext!.bufferData(this.gpucontext!.ELEMENT_ARRAY_BUFFER, indices, this.gpucontext!.STATIC_DRAW);
            this.gpucontext!.bindBuffer(this.gpucontext!.ELEMENT_ARRAY_BUFFER, null);

            return {
                vertices: vertexData,
                indexBuffer: indexBuffer!,
                buffers: [] as WebGLBuffer[],
                currentBuffer: 0,
                index: 0,
                count: 0,
                capacity: numQuads
            };
        })();
    }

    initialize() {
        super.initialize();


        if (!this.gpucontext) throw new Error("GPU rendering is disabled");
        if (document.hidden) {
            this.scratchDrawingContext.getImageData(0, 0, 1, 1);
        }

        this.maskTexture = (this.maskTexture || createTexture(this.gpucontext));
        this.gpucontext.bindTexture(this.gpucontext.TEXTURE_2D, this.maskTexture);
        this.gpucontext.texImage2D(this.gpucontext.TEXTURE_2D, 0, this.gpucontext.ALPHA, this.gpucontext.ALPHA, this.gpucontext.UNSIGNED_BYTE, this.scratchCanvas);
        this.gpucontext.texParameteri(this.gpucontext.TEXTURE_2D, this.gpucontext.TEXTURE_MAG_FILTER, this.gpucontext.LINEAR);
        this.gpucontext.texParameteri(this.gpucontext.TEXTURE_2D, this.gpucontext.TEXTURE_MIN_FILTER, this.gpucontext.LINEAR_MIPMAP_LINEAR);
        this.gpucontext.texParameteri(this.gpucontext.TEXTURE_2D, this.gpucontext.TEXTURE_WRAP_S, this.gpucontext.CLAMP_TO_EDGE);
        this.gpucontext.texParameteri(this.gpucontext.TEXTURE_2D, this.gpucontext.TEXTURE_WRAP_T, this.gpucontext.CLAMP_TO_EDGE);
        this.gpucontext.generateMipmap(this.gpucontext.TEXTURE_2D);

        let halfMaskWidth = Math.round(this.maskTextureWidth / 2);
        let halfMaskHeight = Math.round(this.maskTextureHeight / 2);
        this.currentFrameBuffer = (this.gpucontext.createFramebuffer()!);
        this.xt = (this.xt || createTexture(this.gpucontext));
        this.gpucontext.bindTexture(this.gpucontext.TEXTURE_2D, this.xt);
        if (this.isWebGL2) {
            this.gpucontext.texImage2D(
                this.gpucontext.TEXTURE_2D,
                0,
                (this.gpucontext as WebGL2RenderingContext).R8,
                halfMaskWidth,
                halfMaskHeight,
                0,
                (this.gpucontext as WebGL2RenderingContext).RED,
                this.gpucontext.UNSIGNED_BYTE,
                null
            );
        } else {
            this.gpucontext.texImage2D(
                this.gpucontext.TEXTURE_2D,
                0,
                this.gpucontext.RGBA,
                halfMaskWidth,
                halfMaskHeight,
                0,
                this.gpucontext.RGBA,
                this.gpucontext.UNSIGNED_BYTE,
                null
            );
        }
        this.gpucontext.texParameteri(this.gpucontext.TEXTURE_2D, this.gpucontext.TEXTURE_MAG_FILTER, this.gpucontext.LINEAR);
        this.gpucontext.texParameteri(this.gpucontext.TEXTURE_2D, this.gpucontext.TEXTURE_MIN_FILTER, this.gpucontext.LINEAR_MIPMAP_LINEAR);
        this.gpucontext.texParameteri(this.gpucontext.TEXTURE_2D, this.gpucontext.TEXTURE_WRAP_S, this.gpucontext.CLAMP_TO_EDGE);
        this.gpucontext.texParameteri(this.gpucontext.TEXTURE_2D, this.gpucontext.TEXTURE_WRAP_T, this.gpucontext.CLAMP_TO_EDGE);
        this.gpucontext.bindTexture(this.gpucontext.TEXTURE_2D, null);

        if (this.currentFrameBuffer && shader4 && this.gt) {
            this.gpucontext.bindFramebuffer(this.gpucontext.FRAMEBUFFER, this.currentFrameBuffer);
            this.gpucontext.framebufferTexture2D(this.gpucontext.FRAMEBUFFER, this.gpucontext.COLOR_ATTACHMENT0, this.gpucontext.TEXTURE_2D, this.xt, 0);
            this.gpucontext.viewport(0, 0, halfMaskWidth, halfMaskHeight);
            this.gpucontext.clearColor(0, 0, 0, 0);
            this.gpucontext.clear(this.gpucontext.COLOR_BUFFER_BIT);
            this.gpucontext.useProgram(shader4.program);
            this.gpucontext.uniform2f(shader4.uniforms.shadowOffset, 0, 0);
            this.gpucontext.uniform2f(shader4.uniforms.shadowSpread, 5 / this.maskTextureWidth, 5 / this.maskTextureHeight);
            this.gpucontext.bindTexture(this.gpucontext.TEXTURE_2D, this.maskTexture);
            this.setupVertexBuffer(this.gt, -1, -1, 2, 2, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0);
            this.executeDrawingCommands(this.gt);
            this.gpucontext.bindTexture(this.gpucontext.TEXTURE_2D, null);
            this.gpucontext.framebufferTexture2D(this.gpucontext.FRAMEBUFFER, this.gpucontext.COLOR_ATTACHMENT0, this.gpucontext.TEXTURE_2D, null, 0);
            this.gpucontext.bindFramebuffer(this.gpucontext.FRAMEBUFFER, null);
            this.gpucontext.deleteFramebuffer(this.currentFrameBuffer);
            this.gpucontext.bindTexture(this.gpucontext.TEXTURE_2D, this.xt);
            this.gpucontext.generateMipmap(this.gpucontext.TEXTURE_2D);
            this.gpucontext.bindTexture(this.gpucontext.TEXTURE_2D, null);
        }

        if (!this.imageLoaded) {
            let Ke = new Uint8Array([220, 220, 220, 255]);
            if (!this.realImage) {
                this.realImage = (createTexture(this.gpucontext));
                this.gpucontext.bindTexture(this.gpucontext.TEXTURE_2D, this.realImage);
                this.gpucontext.texImage2D(this.gpucontext.TEXTURE_2D, 0, this.gpucontext.RGB, 1, 1, 0, this.gpucontext.RGB, this.gpucontext.UNSIGNED_BYTE, Ke);
                this.gpucontext.bindTexture(this.gpucontext.TEXTURE_2D, null);
            }
        }
        this.scratchCanvas.width = 500;
        this.scratchCanvas.height = 500;
    }


    setupVertex(verts: Float32Array, idx: number, x: number, y: number, u: number, v: number, o: number, s: number, red: number, green: number, blue: number, alpha: number) {
        verts[idx + 0 | 0] = x * this.transformMat2d[0] + y * this.transformMat2d[2] + this.transformMat2d[4];
        verts[idx + 1 | 0] = x * this.transformMat2d[1] + y * this.transformMat2d[3] + this.transformMat2d[5];
        verts[idx + 2 | 0] = u; // texture coordinates
        verts[idx + 3 | 0] = v;
        verts[idx + 4 | 0] = o;
        verts[idx + 5 | 0] = s;
        verts[idx + 6 | 0] = red;
        verts[idx + 7 | 0] = green;
        verts[idx + 8 | 0] = blue;
        verts[idx + 9 | 0] = alpha;
    }


    setupVertexBuffer(graphicbuff: webglData,
        viewx: number, viewy: number,
        n: number, a: number,
        uvs0: number, uvt0: number,
        s: number, l: number,
        c: number, u: number, d: number, h: number,
        bgcolred: number, bgcolgreen: number, bgcolblue: number, bgcolalpha: number) {
        if (graphicbuff.count >= graphicbuff.capacity)
            this.executeDrawingCommands(graphicbuff);
        const vertices = graphicbuff.vertices;
        const index = graphicbuff.index;
        const w = viewx + n;
        const y = viewy + a;
        const T = uvs0 + s;
        const b = uvt0 + l;
        const E = c + d;
        const R = u + h;

        this.setupVertex(vertices, index + 0 | 0, viewx, viewy, uvs0, uvt0, c, u, bgcolred, bgcolgreen, bgcolblue, bgcolalpha);
        this.setupVertex(vertices, index + 10 | 0, w, viewy, T, uvt0, E, u, bgcolred, bgcolgreen, bgcolblue, bgcolalpha);
        this.setupVertex(vertices, index + 20 | 0, w, y, T, b, E, R, bgcolred, bgcolgreen, bgcolblue, bgcolalpha);
        this.setupVertex(vertices, index + 30 | 0, viewx, y, uvs0, b, c, R, bgcolred, bgcolgreen, bgcolblue, bgcolalpha);

        graphicbuff.count++;
        graphicbuff.index += 40;
    }


    setupPieceGeometry(e: MaskPiece, regularPiecePercent: number, shadowSpreadFactor: number, angle: number) {
        if (!this.gt)
            return;
        this.setupVertexBuffer(this.gt,
            e.x + e.spriteX, e.y + e.spriteY, e.spriteW, e.spriteH,
            e.tx, e.ty, e.tw, e.th,
            e.tx2, e.ty2, e.tw2, e.th2,
            regularPiecePercent, shadowSpreadFactor, angle, 0);
    }

    updateUniformColor(loc: WebGLUniformLocation | null, [r, g, b, a]: number[]) {
        this.gpucontext!.uniform4f(loc, r, g, b, a);
    }

    executeDrawingCommands(e: webglData) {
        if (!this.gpucontext) throw new Error("GPU rendering is disabled");
        if (e.count) {
            if (e.buffers.length <= e.currentBuffer) {
                let t = this.gpucontext.createBuffer();
                this.gpucontext.bindBuffer(this.gpucontext.ARRAY_BUFFER, t);
                this.gpucontext.bufferData(this.gpucontext.ARRAY_BUFFER, e.vertices.byteLength, this.gpucontext.DYNAMIC_DRAW);
                e.buffers.push(t);
            }
            this.gpucontext.bindBuffer(this.gpucontext.ARRAY_BUFFER, e.buffers[e.currentBuffer]);
            this.gpucontext.bindBuffer(this.gpucontext.ELEMENT_ARRAY_BUFFER, e.indexBuffer);
            this.gpucontext.bufferSubData(this.gpucontext.ARRAY_BUFFER, 0, e.vertices.subarray(0, e.index));
            this.gpucontext.enableVertexAttribArray(0);
            this.gpucontext.enableVertexAttribArray(1);
            this.gpucontext.enableVertexAttribArray(2);
            this.gpucontext.vertexAttribPointer(0, 2, this.gpucontext.FLOAT, false, 40, 0);
            this.gpucontext.vertexAttribPointer(1, 4, this.gpucontext.FLOAT, false, 40, 8);
            this.gpucontext.vertexAttribPointer(2, 4, this.gpucontext.FLOAT, false, 40, 24);
            this.gpucontext.drawElements(this.gpucontext.TRIANGLES, 6 * e.count, this.gpucontext.UNSIGNED_SHORT, 0);
            this.gpucontext.bindBuffer(this.gpucontext.ARRAY_BUFFER, null);
            this.gpucontext.bindBuffer(this.gpucontext.ELEMENT_ARRAY_BUFFER, null);
            e.index = 0;
            e.count = 0;
            e.currentBuffer++;
        }
    }

    updateGroup(group: MaskGroup) {
        const { state, view } = this.game;

        let t = state.sets[group.set],
            pieceWidth = t.pieceWidth!,
            pieceHeight = t.pieceHeight!,
            absX = group.x + view.x,
            absY = group.y + view.y,
            groupMidX = (group.w + pieceWidth) / 2,
            groupMidY = (group.h + pieceHeight) / 2;
        // cull groups out of view
        let shouldDraw = false;
        if ((group.rot || 0) & 1) { // consider the 90degree rotated bounding box
            shouldDraw = !(absX - groupMidY > this.scaledViewWidth || absY - groupMidX > this.scaledViewHeight || absX + groupMidY < 0 || absY + groupMidX < 0);
        } else {
            shouldDraw = !(absX - groupMidX > this.scaledViewWidth || absY - groupMidY > this.scaledViewHeight || absX + groupMidX < 0 || absY + groupMidY < 0);
        }
        if (shouldDraw) {
            let angle = group.angle,
                c = (group.dragged || group.user ? .7 : .4) * clamp(pieceWidth / 100, .1, 1),
                acos = Math.sin(angle),
                asin = Math.cos(angle);
            this.transformMat2d[0] = asin;
            this.transformMat2d[1] = acos;
            this.transformMat2d[2] = -acos;
            this.transformMat2d[3] = asin;
            this.transformMat2d[4] = absX;
            this.transformMat2d[5] = absY;
            for (const piece of group.pieces) {
                this.setupPieceGeometry(piece, 0, c, angle); // shadow geometry
            }
            if (!group.dragged && group.user || group.selected) {
                let currentSelecter = group.selected ? defaultHighlightColor : group.user?.highlight;
                if (this.previousSelecter !== currentSelecter && jigshader && this.gt) {
                    this.executeDrawingCommands(this.gt);
                    this.previousSelecter = currentSelecter;
                    this.updateUniformColor(jigshader.uniforms.highlightColor, this.previousSelecter!);
                };
                for (const piece of group.pieces) {
                    this.setupPieceGeometry(piece, 0, 0, angle); // highlight geometry
                }
            }
            for (let x = 0, w = group.pieces; x < w.length; x++) {
                this.setupPieceGeometry(w[x], 1, 0, angle); // proper piece geometry
            }
        }
    }
}


