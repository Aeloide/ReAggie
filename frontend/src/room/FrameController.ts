import { AnimationController as LoopController } from "./AnimationController";
import { type Sub, type spritedrawerInstance } from "./EntityManager";
import type { AsepriteImport } from "./SpriteDrawer";
import type { vec2 } from "./vec2";

export function bitCount(n: number) {
    n = n - ((n >> 1) & 0x55555555)
    n = (n & 0x33333333) + ((n >> 2) & 0x33333333)
    return ((n + (n >> 4) & 0xF0F0F0F) * 0x1010101) >> 24
}

export class FrameController<T extends AsepriteImport<any, any>> {
    origin: vec2 = [0, 0];
    onEnd?: () => void;

    ctrl;
    animMap: Record<Sub<keyof T['anims'], "_left", "_right"> | Sub<keyof T['anims'], "_right", "_left">, [boolean, string, AsepriteImport['anims'][string]]>;
    constructor(private sdrawer: spritedrawerInstance,
        private res: T) {
        this.ctrl = new LoopController(res);

        this.ctrl.onEnd = () => this.onEnd?.();

        const animMap = {} as any;
        for (let anim in res.anims) {
            animMap[anim] = [false, anim, res.anims[anim]];

            const tryGenArtificial = (a: string, b: string) => anim.includes(a) && (animMap[anim.replace(a, b)] = [true, anim, res.anims[anim]]);
            tryGenArtificial('_left', '_right');
            tryGenArtificial('_right', '_left');
        }
        this.animMap = animMap;
    }

    update(dt: number) {
        this.ctrl.update(dt);
    }

    set currentFrame(v: number) {
        this.ctrl.currentFrame = v;
    }

    get currentFrame() {
        return this.ctrl.frameIndex;
    }

    flip = false;
    currentAnim!: AsepriteImport['anims'][string];
    setAnim(s: Sub<keyof T['anims'], "_left", "_right"> | Sub<keyof T['anims'], "_right", "_left">) {
        let src: string;
        [this.flip, src, this.currentAnim] = this.animMap[s];
        this.ctrl.setAnim(src);
    }

    drawpool: [number, ReturnType<spritedrawerInstance['allocInst']>][] = [];
    setVariant(n: number) {
        // set the proper layer id to source from
        let lidx = 0;
        let ptr = 0;
        for (let p of this.res.layers_props) {
            if ((p & n) == p) {
                while (this.drawpool.length <= ptr) // allocate as needed
                    this.drawpool.push([0, this.sdrawer.allocInst()]);
                this.drawpool[ptr][0] = lidx;
                ptr++;
            }
            lidx++;
        }
        let fail: FrameController<T>['drawpool'];
        try {
            fail = this.drawpool.splice(ptr);
            fail.map(d => { this.sdrawer.free(d[1]); return d; }); // remove surplus
        } catch {
            for (let d of fail!)
                this.sdrawer.free(d[1]);
        }
    }

    cleanup() {
        while (this.drawpool.length != 0) {
            this.sdrawer.free(this.drawpool.at(-1)![1]);
            this.drawpool.pop();
        }
    }

    angle = 0;
    pscale = 1;
    prepareDraw() {
        const frame = this.ctrl.frameIndex;
        for (let [lid, s] of this.drawpool) {
            s.pos = this.origin;
            s.angle = this.angle;
            s.frame = frame;
            s.gscale = [this.flip ? -this.pscale : this.pscale, this.pscale];
            s.layer = lid;
            s.sync();
        }
    }
}
