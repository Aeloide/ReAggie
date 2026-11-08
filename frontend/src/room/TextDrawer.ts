
// too lazy to do it properly, with an atlas and shit

import type { Camera2D } from "./Camera2D";
import type { JigGL } from "./gpu4-renderer";
import { SpriteDrawer3 } from "./SpriteDrawer";
import type { vec2 } from "./vec2";
import textshader from "./text.glsl";

// maybe the question should be drawn too on the game board? like OOB on the top edge?
export class TextDrawer {
    sd;
    hook;
    constructor(jigGl: JigGL, private camera: Camera2D, txt: string) {
        const { gl, glx } = jigGl;
        const off = new OffscreenCanvas(10, 48);

        const ctx = off.getContext('2d')!;
        ctx.font = "48px sans";
        ctx.lineWidth = 1;
        const measures = ctx.measureText(txt);
        off.width = measures.width; // changing canvas dimensions resets style

        ctx.font = "48px sans";
        ctx.lineWidth = 1;
        ctx.fillStyle = "white";
        ctx.strokeStyle = "black";

        ctx.textBaseline = "top";
        ctx.clearRect(0, 0, off.width, off.height);
        ctx.fillText(txt, 0, 0); // may reach texture limits on long choices
        ctx.strokeText(txt, 0, 0);

        const kaot = glx.createTexture(["RGBA", "RGBA", "UNSIGNED_BYTE"], off, undefined, {
            TEXTURE_MAG_FILTER: 'LINEAR',
            TEXTURE_MIN_FILTER: 'LINEAR_MIPMAP_LINEAR'
        });
        const prog = this.prog = new textshader(glx);
        prog.bindings.sprite.texture = kaot;
        this.sd = new SpriteDrawer3(glx, prog, 'spos');
        this.hook = this.sd.allocInst();
    }
    prog;

    setPos(p: vec2) {
        this.hook.pos = p;
    }

    finalizeDraw(scale: number = 1) {
        this.hook.sync();
        this.prog.uniforms.camera.data = this.camera.projectionMatrix;
        this.prog.uniforms.scale.data = scale;
        this.sd.finalizeDraw();
    }
}
