import type { mat4 } from "./gpu4-renderer";
// import { firstTextureLoadFinished as canvasSizeChanged, z as viewChanged } from "./render";

export class Camera2D {
    projectionMatrix: mat4 = [
        /*    x  y  z  w */
        /*x*/ 1, 0, 0, 0,
        /*y*/ 0, 1, 0, 0,
        /*z*/ 0, 0, 1, 0,
        /*w*/ 0, 0, 0, 1
    ];

    // Worldspace coordinates
    left = 0;
    right = 0;
    top = 0;
    bottom = 0;
    viewScale = 1;

    constructor(
        private canvas: HTMLCanvasElement | OffscreenCanvas,
        private gl: WebGL2RenderingContext,
        near: number = -1,
        far: number = 1,
        public dprf: () => number = () => devicePixelRatio,
        public sizeChange: () => boolean = () => true,
        public viewChange: () => boolean = () => true,
    ) {
        this.setClippingPlanes(near, far);
        // this.update();
    }

    setClippingPlanes(near: number, far: number) {
        const depthRange = near - far;
        this.projectionMatrix[10] = 2 / depthRange; // webgl Z spans -1 (near) to +1 (far), inclusive.
        this.projectionMatrix[14] = (near + far) / depthRange;
    }


    private width = 0;
    private height = 0;
    private clipspaceFactorX = 0;
    private clipspaceFactorY = 0;
    private worldspaceWidth = 0;
    private worldspaceHeight = 0;

    update(viewScale: number, viewX: number, viewY: number): boolean {
        const m = this.projectionMatrix;
        this.viewScale = viewScale;
        const sizechanged = this.sizeChange();
        const viewchanged = this.viewChange();
        if (sizechanged) {
            // canvas size is already set by doRender() in render.ts 
            const dpr = this.dprf();
            this.width = this.canvas.width / dpr;
            this.height = this.canvas.height / dpr;
            this.gl.viewport(0, 0, this.width * dpr, this.height * dpr);
            this.clipspaceFactorX = 2 * viewScale / this.width;
            this.clipspaceFactorY = -2 * viewScale / this.height;
            this.worldspaceWidth = this.width / viewScale;
            this.worldspaceHeight = this.height / viewScale;
            m[0] = this.clipspaceFactorX;
            m[5] = this.clipspaceFactorY;
        }
        if (sizechanged || viewchanged) {
            this.left = -viewX;
            this.top = -viewY;
            this.right = this.worldspaceWidth - viewX;
            this.bottom = this.worldspaceHeight - viewY;
            m[12] = -1 + viewX * this.clipspaceFactorX;
            m[13] = 1 + viewY * this.clipspaceFactorY;
        }
        return sizechanged || viewchanged;
    }
}
