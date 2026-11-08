import { Camera2D } from "./Camera2D";
import { JigGL, baseShapesArray } from "./gpu4-renderer";
import { type PieceData, buildPiece } from "./jig-generation";
import basicpass from "./basicpass.glsl";
import shadowpass from "./shadowpass.glsl";
import blurpass from "./blurpass.glsl";

import { IndexBuffer, TTexture, VertexBuffer, VertexBufferAssembly } from "safe-gl";

export class DropShadows {
    private readonly gl: WebGL2RenderingContext;
    fakeshadows;
    jigShadow;

    getArchPieceData(n: number, w: number, h: number, t: number): PieceData {
        const curvetypes = n.toString(3).padStart(4, '0').split('').map(e => +e);
        const curve = {
            a: 0, b: 0, c: 0, d: 0, e: 0,
            flip: false
        };
        const curvetl = {
            a: 0, b: 0, c: 0, d: 0, e: 0,
            flip: true
        };
        // 1 == outer, 2 == inner
        const top = curvetypes[0] == 0 ? null : curvetypes[0] == 1 ? { ...curvetl } : { ...curve };
        const right = curvetypes[1] == 0 ? null : curvetypes[1] == 1 ? { ...curve } : { ...curvetl };
        const bottom = curvetypes[2] == 0 ? null : curvetypes[2] == 2 ? { ...curvetl } : { ...curve };
        const left = curvetypes[3] == 0 ? null : curvetypes[3] == 2 ? { ...curve } : { ...curvetl };
        // squares have a jitter and tabsize of 0
        // jitter of 0
        const zero = { x: 0, y: 0 };
        return {
            bottom, left, right, top,
            bl: zero, br: zero, tl: zero, tr: zero
        } as PieceData;
    }

    jgl;
    constructor(tjgl: JigGL, maxpw: number, maxph: number, ts: number) {
        this.jgl = tjgl;
        this.gl = this.jgl.gl;
        const hostgl = this.gl;

        const t = 1 + ts; // TODO: solve this (variable was used in shader but now it was taken out and needs to be passed as a uniform)
        this.jigShadow = new shadowpass(this.jgl.glx);

        const [tw, th] = [maxpw * 2, maxph * 2].map(e => ~~e);
        const ogl = new OffscreenCanvas(tw, th);

        const internalgl = ogl.getContext("webgl2", { antialias: false, alpha: true, premultipliedAlpha: false })!;
        const sp: any = undefined;// window['spector' as any] as any;
        sp?.startCapture(internalgl, 500, false);
        internalgl.clearColor(0, 0, 0, 0);

        const jgl = new JigGL(internalgl);
        const tripos = new VertexBuffer(internalgl, "STATIC_DRAW", ["position", "vec2"]);
        tripos.set(new Float32Array([-1, -1, 3, -1, -1, 3]));
        const triidx = new IndexBuffer(internalgl, "STATIC_DRAW", "UNSIGNED_SHORT");
        triidx.set(new Uint16Array([0, 1, 2]));
        const trivao = new VertexBufferAssembly(internalgl, triidx, tripos);
        const basicBlurProg = new blurpass(jgl.glx);
        basicBlurProg.setAssembly(trivao);
        const basicJigProg = new basicpass(jgl.glx);

        this.fakeshadows = this.jgl.glx.createTexture(["RGBA8", "RGBA", "UNSIGNED_BYTE"], [tw, th, 24]);
        const cam = new Camera2D(ogl, internalgl, -1024, 1024, () => 1, () => true, () => true);

        const firstPassFb = internalgl.createFramebuffer();
        const secondPassFb = internalgl.createFramebuffer();
        const firstPassTexture = jgl.glx.createTexture(["RGBA", "RGBA", "UNSIGNED_BYTE"], [tw, th], undefined, undefined, true);
        (firstPassTexture as any).tex.__SPECTOR_Metadata = { name: "firstPassTexture" }
        const secondPassTexture = jgl.glx.createTexture(["RGBA", "RGBA", "UNSIGNED_BYTE"], [tw, th], undefined, undefined, true);
        (secondPassTexture as any).tex.__SPECTOR_Metadata = { name: "secondPassTexture" }

        internalgl.bindFramebuffer(internalgl.FRAMEBUFFER, firstPassFb);
        internalgl.framebufferTexture2D(internalgl.FRAMEBUFFER, internalgl.COLOR_ATTACHMENT0, internalgl.TEXTURE_2D, firstPassTexture.tex, 0);

        internalgl.bindFramebuffer(internalgl.FRAMEBUFFER, secondPassFb);
        internalgl.framebufferTexture2D(internalgl.FRAMEBUFFER, internalgl.COLOR_ATTACHMENT0, internalgl.TEXTURE_2D, secondPassTexture.tex, 0);

        if (internalgl.checkFramebufferStatus(internalgl.FRAMEBUFFER) !== internalgl.FRAMEBUFFER_COMPLETE) {
            throw new Error("Framebuffer is not complete.");
        }

        internalgl.bindFramebuffer(internalgl.READ_FRAMEBUFFER, null);
        internalgl.bindFramebuffer(internalgl.DRAW_FRAMEBUFFER, null);

        for (let i = 0; i < 24; ++i) {
            internalgl.bindFramebuffer(internalgl.READ_FRAMEBUFFER, null);
            internalgl.bindFramebuffer(internalgl.DRAW_FRAMEBUFFER, firstPassFb);

            // internalgl.clearColor(0, 1.0, 0.2, 0.5);
            internalgl.clear(internalgl.COLOR_BUFFER_BIT);
            // generate archtypical piece geometry
            // render geometry to offscreen canvas and blurring pass
            // 
            const fact = 1 + ts;

            cam.update(fact, tw / (2 * fact), th / (2 * fact));
            const blabla = this.getArchPieceData(baseShapesArray[i],
                maxpw, maxph, ts);
            const piece = buildPiece(blabla, ts, 0, 0, maxpw, maxph);

            basicJigProg.uniforms.camera.data = cam.projectionMatrix;
            const positions = new VertexBuffer(internalgl, "STATIC_DRAW", ["position", "vec2"]);
            positions.set(piece.positionBuffer);
            const idx = new IndexBuffer(internalgl, "STATIC_DRAW", "UNSIGNED_INT");
            idx.set(piece.elementBuffer);
            basicJigProg.setAssembly(new VertexBufferAssembly(internalgl, idx, positions));

            jgl.glx.using(basicJigProg, drawer => {
                drawer.drawElements(internalgl.TRIANGLES, piece.elementBuffer.length);
            });
            // TODO: need to better tweak the quality/blur distance relative to piece sizes
            const blursize = 13; // from the shader code, not a parameter
            const mdim = Math.min(maxph, maxpw);
            const iterations = ~~(mdim / blursize / (3 - 1));
            const distance = 3;
            for (let i = 1; i <= iterations; ++i) {
                // first pass
                internalgl.bindFramebuffer(internalgl.READ_FRAMEBUFFER, null);
                internalgl.bindFramebuffer(internalgl.DRAW_FRAMEBUFFER, secondPassFb);
                internalgl.clear(internalgl.COLOR_BUFFER_BIT);

                basicBlurProg.bindings.tex.texture = firstPassTexture;
                basicBlurProg.uniforms.dir.data = [distance, 0];
                jgl.glx.using(basicBlurProg, drawer => drawer.drawElements(internalgl.TRIANGLES, 3));

                // second pass
                internalgl.bindFramebuffer(internalgl.READ_FRAMEBUFFER, null);
                internalgl.bindFramebuffer(internalgl.DRAW_FRAMEBUFFER, i == iterations ? null : firstPassFb);
                internalgl.clear(internalgl.COLOR_BUFFER_BIT);

                basicBlurProg.bindings.tex.texture = secondPassTexture;
                basicBlurProg.uniforms.dir.data = [0, distance];
                jgl.glx.using(basicBlurProg, drawer => {
                    drawer.drawElements(internalgl.TRIANGLES, 3)
                });
            }

            this.fakeshadows.updateRegion(ogl, [0, 0, i], [tw, th, 1]);
        }
        const ret = sp?.stopCapture(internalgl);
        jgl.destroy();

        const sqpos = new VertexBuffer(hostgl, "STATIC_DRAW", ["position", "vec2"]);
        sqpos.set(new Float32Array([
            0, 0,
            1, 0,
            1, 1,
            0, 1
        ].map(e => e - 0.5)));
        const sqidx = new IndexBuffer(hostgl, "STATIC_DRAW", "UNSIGNED_SHORT");
        sqidx.set(new Uint16Array([0, 1, 2, 2, 3, 0]));
        this.jigShadow.setAssembly(new VertexBufferAssembly(hostgl, sqidx, sqpos));
        this.jigShadow.uniforms.idpr.data = 1 / (3 - 1);
    }

    draw(pieces: number,
        puzzleState: TTexture<"RGBA32F">,
        camera: Camera2D) {
        const gl = this.gl;

        this.jigShadow.bindings.puzzleState.texture = puzzleState;
        this.jigShadow.uniforms.camera.data = camera.projectionMatrix;
        this.jigShadow.uniforms.totalPieces.data = pieces;
        this.jigShadow.bindings.shadows.texture = this.fakeshadows;
        this.jgl.glx.using(this.jigShadow, drawer => {
            drawer.drawElementsInstanced(gl.TRIANGLES, 6, pieces);
        });
    }

    destroy() {
        this.jgl.destroy();
    }
}
