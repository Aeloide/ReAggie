import { GPU4Renderer, JigGL } from "./gpu4-renderer";
import { SpriteDrawer3, buildAseRenderer } from "./SpriteDrawer";
import { add, isInBox, rectangleCenter, rectAt, smul, sub, type Rectangle, type vec2 } from "./vec2";
import { memsound, meowsound, playsound } from "./audio";

import jigchan from "./jiggie.aseprite";
import extras from "./extras.aseprite";
import largebug from "./bug.aseprite";
import chuu from "./chuu.aseprite";

import { DummyManager, type Entity, type EntityManager } from "./Entity";
import type { Game, GamePiece } from "./game";
import type { Camera2D } from "./Camera2D";
import { LargeBug } from "./LargeBug";
import { FrameController } from "./FrameController";
import { clamp, Random } from "../utils";

import kaoshader from "./kao.glsl";
import indtest from "./indtest.glsl";
import { getDistance2d } from "./game-actions";
import { TextDrawer } from "./TextDrawer";
import { RectangleDrawer } from "./RectangleDrawer";
import type { MouseEventWrapper } from "./game-view-state";

import kao from "./kao3.png";
import { bugStore, jigChanStore } from "$lib/room/stores";
import { IndexBuffer, VertexBuffer, VertexBufferAssembly } from "safe-gl";
export type Sub<T, From extends string, To extends string> = T extends `${infer U extends string}${From}${infer V extends string}` ? `${U}${To}${V}` : T;

type SpriteInstance = {
    spos: "vec2";
    pos: "vec2";
    gscale: "vec2";
    frame: "int";
    layer: "int";
    angle: "float";
};
const spriteSheetDrawer = SpriteDrawer3<any, SpriteInstance, "spos">;
export type spritedrawerInstance = InstanceType<typeof spriteSheetDrawer>;
// import jigchan from "./jiggie.aseprite";

export interface State {
    enter(): void;
    update(t: number, d: number): void;
    animEnd(): void;
    leave(): void;
}

type StateFunction = (jc: JigChan) => ({
    enter(): void;
    update(t: number, d: number): void;
    animEnd(): void;
    leave(): void;
});

const base: StateFunction = (jc) => ({
    enter() {
    },
    leave() { },
    animEnd() { },
    update(t, d) {
        jc.ctrl.update(d);
        jc.accessories.forEach(a => a.ctrl.update(d));
    },
});

const idle: StateFunction = (jc) => {
    return {
        ...base(jc),
        enter() {
            for (let acc of jc.accessories)
                jc.removeAccessory(acc);
            //jc.ctrl.setAnim('idle');
            const r = Math.random();
            jc.ctrl.setAnim(r < 0.3 ? 'idle' : r < 0.6 ? 'idle2' : 'idle3');
        },
        animEnd() {
            this.enter();
        },
    };
};


const picked: StateFunction = (jc) => {
    const acc = jc.buildAccessory('Hand_Picking_Up', [2, -16]);
    return {
        ...base(jc),
        enter() {
            jc.ctrl.setAnim('jiggling');
        },
        animEnd() {
            this.enter();
        },
        leave() {
            jc.removeAccessory(acc);
        }
    };
};

const win: StateFunction = (jc) => {
    let played = false;
    return {
        ...base(jc),
        enter() {
            jc.ctrl.setAnim('win');
        },
        animEnd() {
            played = true;
            const a = jc.ctrl.currentAnim!;
            jc.ctrl.currentFrame = a[1] - a[0];
        },
        update(t, d) {
            if (played)
                return;
            jc.ctrl.update(d);
        }
    };
};

const ntr: StateFunction = (jc) => {
    const acc = jc.buildAccessory('Heart_Ballon', [8, -16]);
    return {
        ...base(jc),
        enter() {
            jc.accessory = [8, -16];
        },
        leave() {
            jc.removeAccessory(acc);
        }
    };
};

const basicIntoIdle: (enterAnim: Parameters<Parameters<StateFunction>[0]['ctrl']['setAnim']>[0]) => StateFunction = name => jc => ({
    ...base(jc),
    enter() {
        jc.ctrl.setAnim(name);
    },
    animEnd() {
        jc.state = idle(jc);
    }
})

const eat = basicIntoIdle('eating');

const patting: StateFunction = (jc) => {
    const acc = jc.buildAccessory('Hand_patting', [2, -12]);
    return {
        ...base(jc),
        enter() {
            jc.ctrl.setAnim('pat');
        },
        leave() {
        }
    };
};

export const directionLoopedAnim = (s: string) =>
    <StateFunction>((jc) => ({
        ...base(jc),
        enter() {
            jc.ctrl.setAnim(s + jc.direction as `break_${keyof typeof Direction}`);
        },
        animEnd() {
        },
    }));

export const break_: StateFunction = (jc) => {
    let loopCount = 0;
    return {
        ...base(jc),
        enter() {
            jc.ctrl.setAnim('break_' + jc.direction as `break_${keyof typeof Direction}`);
        },
        animEnd() {
            jc.ctrl.setAnim('break_' + jc.direction + '_loop' as `break_${keyof typeof Direction}_loop`);
            if (loopCount++ > 3)
                jc.state = jc.states.idle(jc);
        },
    };
};

export const fall: StateFunction = (jc) => {
    return {
        ...base(jc),
        enter() {
            jc.ctrl.setAnim('falling_' + jc.direction as `falling_${keyof typeof Direction}`);
        },
        animEnd() {
            jc.state = jc.states.idle(jc);
        },
    };
};

const landing = basicIntoIdle('landing');
const bow = basicIntoIdle('bow');

export enum Direction {
    up,
    down,
    left,
    right,
};

const jcf = jigchan.flags;
const clothes = [jcf.sailor, jcf.sailor2, jcf.normal, jcf.normal2];
const hair = {
    jig: [jcf.bowl, jcf.messy, jcf.mushroom, jcf.ribbon, jcf.twintails],
    gie: [jcf.rimo, jcf.long, jcf.braided, jcf.puffy]
};
const bun = {
    jig: [jcf.jear],
    gie: [jcf.gear],
}

const variants = (() => {
    let ret = [];
    for (let cloth of clothes)
        for (const h in hair)
            for (let hc of hair[h as keyof typeof hair])
                ret.push([cloth, hc]);
    for (let cloth of clothes)
        for (const h in hair)
            for (let hc of hair[h as keyof typeof hair])
                for (let acc of bun[h as keyof typeof bun])
                    ret.push([cloth, hc, acc]);
    return ret.map(a => a.reduce((c, b) => c | (2 ** b), 0 as number));
})();

type Accessory = {
    offset: vec2;
    pf: number;
    ctrl: FrameController<typeof extras>;
};

export class JigChan implements Entity {
    _state = idle(this);

    _direction: Direction = Direction.down;

    get direction() {
        return Direction[this._direction];
    }

    get state() {
        return this._state;
    }

    set state(nv: ReturnType<StateFunction>) {
        this._state.leave();
        this._state = nv;
        nv.enter();
    }

    states = {
        idle,
        win,
        run: directionLoopedAnim('run_'),
        push: directionLoopedAnim('push_'),
        break: break_,
        picked,
        eat, fall, ntr,
        bow, landing,
        patting
    };

    x = -9999;
    y = -9999;
    px = 0;
    py = 0;
    pf = 0;
    paf = 0;
    upd = true;
    ctrl;

    accessories = new Set<Accessory>();
    constructor(public id: number,
        public worldscale: number,
        public sdrawer: spritedrawerInstance,
        public adrawer: spritedrawerInstance,
        variant: number) {
        this.ctrl = new FrameController(sdrawer, jigchan);
        this.ctrl.setVariant(variants[variant]);
        // this.ctrl.setVariant(variants[7]);
        this.ctrl.onEnd = () => {
            this._state.animEnd();
        };
        this._state = idle(this);
        this._state.enter();
    }

    buildAccessory(anim: keyof typeof extras['anims'], offset: vec2) {
        const ctrl = new FrameController(this.adrawer, extras);
        ctrl.setVariant(1 << extras.flags.normal);
        ctrl.setAnim(anim);
        ctrl.prepareDraw();
        const newacc = {
            pf: -1,
            ctrl,
            offset
        };
        this.accessories.add(newacc);
        return newacc;
    }

    removeAccessory(acc: Accessory) {
        acc.ctrl.cleanup();
        this.accessories.delete(acc);
    }

    doRender(): void {
        if (!this.upd)
            return;
        this.ctrl.prepareDraw();
        this.accessories.forEach(a => a.ctrl.prepareDraw());
        this.upd = false;
    }

    die(cb: () => void): void {
        const end = () => {
            this.ctrl.cleanup();
            this.accessories.forEach(a => a.ctrl.cleanup());
            cb();
        }
        this.state = {
            ...base(this),
            enter: () => {
                this.ctrl.setAnim('death');
            },
            animEnd: end,
            leave: end
        }
    }

    accessory: vec2 = [0, 0];
    update(dt: number) {
        this._state.update(0, dt);
        if (this.pf != this.ctrl.currentFrame ||
            [...this.accessories].some(e => e.pf != e.ctrl.currentFrame) ||
            this.px != this.x ||
            this.py != this.y
        ) {
            this.upd = true;
            this.ctrl.origin = [this.x, this.y];
            this.pf = this.ctrl.currentFrame;
            this.accessories.forEach(a => {
                a.ctrl.origin = [this.x + a.offset[0] * this.worldscale, this.y + a.offset[1] * this.worldscale];
                a.pf = a.ctrl.currentFrame;
            });
            this.px = this.x;
            this.py = this.y;
        }
    }
}

const decoder = new TextDecoder();

function readCString(dv: DataView, offset: number = 0) {
    let str = '';
    let c: number;
    const start = offset;
    while (offset < dv.byteLength && (c = dv.getInt8(offset++))) {
    }
    if (offset - start <= 0)
        return ['', 0] as const;
    const bl = offset - 1 - start;
    return [decoder.decode(dv.buffer.slice(start, offset - 1)), bl] as const;
}

// todo: find a better name
export class JiggieChanManager implements EntityManager {
    entities = new Map<number, JigChan>();
    gl!: WebGL2RenderingContext;

    lastjcparams!: {
        cake: number;
        pat: boolean;
        myjc?: number;
    };
    constructor() {
        jigChanStore.subscribe(v => {
            this.lastjcparams = v;
            if (v.cake > 0) {
                document.body.classList.add("cake");
            } else {
                document.body.classList.remove("cake");
            }

            if (v.pat) {
                document.body.classList.add("patting");
            } else {
                document.body.classList.remove("patting");
            }
        });
    }

    prog!: spritedrawerInstance['prog'];
    jcrender!: Awaited<ReturnType<typeof buildAseRenderer>>;
    arender!: Awaited<ReturnType<typeof buildAseRenderer>>;
    camera!: Camera2D;
    game!: Game;
    async init(game: Game): Promise<EntityManager> {
        if (!game.renderer || !(game.renderer instanceof GPU4Renderer))
            return new DummyManager;

        this.game = game;
        this.mph = game.view.maxPieceHeight / 32;
        this.gl = game.renderer.gl;
        [this.jcrender, this.arender] = [await buildAseRenderer(game.renderer.jigGl,
            jigchan,
            game.renderer.camera,
            this.mph),
        await buildAseRenderer(game.renderer.jigGl,
            extras,
            game.renderer.camera,
            this.mph)];
        this.prog = this.jcrender.prog;
        this.camera = game.renderer.camera;
        return this;
    }
    mph = 0;

    get cakeCount() {
        return this.lastjcparams.cake;
    }

    set cakeCount(v: number) {
        jigChanStore.update(u => { u.cake = v; return u; });
    }

    get patting() {
        return this.lastjcparams.pat;
    }

    set patting(v: boolean) {
        jigChanStore.update(u => { u.pat = v; return u; });
    }

    wants(ev: MouseEvent, stop: () => void): MouseEventWrapper | void {
        // we want if:
        // left click event intersects with a jigchan
        const [x, y] = this.game.view.screenToWorld([ev.pageX, ev.pageY]);
        const jc = this.pick(x, y);
        if (!jc) {
            return;
        }

        // cake mode, feed cake
        if (this.cakeCount > 0) {
            // don't need to hold onto the event;
            this.game.connection.chat(`/feed ${this.cakeCount} ${jc.id}`);
            // holding the Alt key keeps the same number of prepared cakes after feeding, which is convenient for feeding multiple jig-chans in a row
            if (!ev.altKey) {
                this.cakeCount = 0;
            }
            return;
        }

        if (this.patting) {
            // don't disable patting mode
            // jc.state = jc.states.patting(jc);
            this.game.connection.patJc(jc.id, true);
            return {
                move: (dx, dy) => {
                },
                end: () => {
                    this.game.connection.patJc(jc.id, false);
                }
            };
            return;
        }

        // player wants to drag and drop
        const [sx, sy] = [jc.x, jc.y];
        this.game.connection.setJc(jc.id, jc.x, jc.y, 0);
        jc.state = jc.states.picked(jc);
        return {
            move: (dx, dy) => {
                jc.x = sx + dx;
                jc.y = sy + dy;
                this.game.connection.setJc(jc.id, jc.x, jc.y, 1);
            },
            end: () => {
                this.game.connection.setJc(jc.id, jc.x, jc.y, 2);
            }
        };
    }

    pick(x: number, y: number) {
        const v = [x, y] as vec2;
        // paddings are top right bottom left -> 2 9 2 6
        for (let e of this.entities.values()) {
            const u = [e.x, e.y] as vec2;
            if (isInBox(v, rectAt(u, [18 * this.mph, 28 * this.mph])))
                return e;
        }
    }

    allocNew(id: number = this.entities.size, ...args: any[]) {
        const ret = new JigChan(id, this.mph, this.jcrender, this.arender, args[0]);
        this.entities.set(id, ret);
        ret.x = NaN;
        ret.y = NaN;
        ret.state = ret.states.idle(ret);
        return ret;
    }

    dealloc(id: number): void {
        const ent = this.entities.get(id) as JigChan | null;
        if (!ent)
            return;
        ent.die(() => {
            this.entities.delete(id);
        })
    }

    // maybe we shouldn't use a binary interface for one off messages...
    process(dv: DataView): void {
        // 0: 0xAA
        // 1: this id
        // 2: action
        const base = 2;
        switch (dv.getInt8(base + 0)) {
            case 0: // alloc with entity id
                // 5 is the original variant (in the currently used resource archive)
                let variant = 5;
                if (dv.byteLength - (base + 3) == 1)
                    variant = dv.getInt8(base + 3)
                else if (dv.byteLength - (base + 3) == 4)
                    variant = dv.getUint32(base + 3, true);
                this.allocNew(dv.getInt16(base + 1, true), variant);
                break;
            case 1: {// dealloc with entity id
                const id = dv.getInt16(base + 1, true);
                this.dealloc(id);
                if (id == this.myjcid) {
                    delete this.myjcid;
                    jigChanStore.update(u => {
                        delete u.myjc;
                        return u;
                    });
                }
                break;
            }
            case 2: {// set state
                const ent = this.entities.get(dv.getInt16(base + 1, true));
                if (ent) {
                    let ptr = base + 3;
                    let [newstatename, newstatelen] = readCString(dv, ptr) as [keyof JigChan['states'], number];
                    ptr += newstatelen + 1;
                    let newdir = dv.getUint8(ptr);
                    ptr += 1;
                    ent._direction = newdir;
                    if (newstatename in ent.states) {
                        ent.state = ent.states[newstatename](ent);
                    }
                }
                break;
            }
            case 3: { // set pos
                const ent = this.entities.get(dv.getInt16(base + 1, true));
                if (ent) {
                    ent.x = dv.getFloat32(base + 3, true);
                    ent.y = dv.getFloat32(base + 7, true);
                    ent.upd = true;
                }
                break;
            }
            case 4: { // set my jigchan
                this.myjcid = dv.getInt16(base + 1, true);
                if (this.myjcid === -1)
                    delete this.myjcid;
                jigChanStore.update(u => {
                    u.myjc = this.myjcid;
                    return u;
                });
                break;
            }
            case 5:
            case 6: {
                const jc = this.entities.get(dv.getInt16(base + 1, true));
                if (!jc)
                    break;
                const ispat = dv.getInt8(base + 0) === 5;
                if (ispat) {
                    jc.state = jc.states.patting(jc);
                } else {
                    jc.state = jc.states.idle(jc);
                }
                break;
            }
            case 0xAB:
            case 0xAD: {
                const jc = this.entities.get(dv.getInt16(base + 1, true));
                if (!jc)
                    break;
                const ispick = dv.getInt8(base + 0) === 0xAB;
                if (ispick) {
                    jc.state = jc.states.picked(jc);
                } else {
                    jc.state = jc.states.idle(jc);
                }
                break;
            }

        }
    }

    myjcid?: number;
    get myjc() {
        return this.entities.get(this.myjcid!) as JigChan | void;
    }

    update(t: number, dt: number): void {
        this.entities.forEach(e => e.update(dt));
    }

    die(): void {
    }

    doRender() {
        // maybe save/restore bindings?
        if (this.entities.size == 0)
            return;
        this.entities.forEach(e => e.doRender());
        this.jcrender.prog.uniforms.camera.data = this.camera.projectionMatrix;
        this.arender.prog.uniforms.camera.data = this.camera.projectionMatrix;
        this.jcrender.finalizeDraw();
        this.arender.finalizeDraw();
    }

    dirty(): boolean {
        const halfWidth = 32;
        const halfHeight = 32;
        for (const e of this.entities.values()) {
            if (e.x + halfWidth >= this.camera.left && e.x - halfWidth <= this.camera.right &&
                e.y + halfHeight >= this.camera.top && e.y - halfHeight <= this.camera.bottom) {
                return true;
            }
        }
        return false;
    }
}


// todo: find a better name

export class LargeBugManager implements EntityManager {
    entities = new Map<number, LargeBug>;
    gl!: WebGL2RenderingContext;

    constructor() {
        bugStore.subscribe(v => {
            if (v.spawn) {
                if (v.spawnchuu) {
                    bugStore.update(s => (s.spawnchuu = false, s));
                    return;
                }
                document.body.classList.add("bugspawn");
            } else {
                document.body.classList.remove("bugspawn");
            }
        });
    }

    prog!: spritedrawerInstance['prog'];
    lbrender!: Awaited<ReturnType<typeof buildAseRenderer>>;
    camera!: Camera2D;
    game!: Game;
    async init(game: Game): Promise<EntityManager> {
        if (!game.renderer || !(game.renderer instanceof GPU4Renderer))
            return new DummyManager;

        this.game = game;
        const gl = game.renderer.gl;
        this.gl = gl;
        this.mph = game.view.maxPieceHeight / 32;
        this.lbrender = await buildAseRenderer(game.renderer.jigGl,
            largebug,
            game.renderer.camera,
            this.mph);
        this.prog = this.lbrender.prog;
        this.camera = game.renderer.camera;
        return this;
    }
    mph = 0;

    pick(x: number, y: number) {
        const v = [x, y] as vec2;
        // paddings are top right bottom left -> 2 9 2 6
        for (let e of this.entities.values()) {
            const u = [e.x, e.y] as vec2;
            if (isInBox(v, rectAt(u, [18 * this.mph, 28 * this.mph])))
                return e;
        }
    }

    wants(ev: MouseEvent, stop: () => void): MouseEventWrapper | void {
        if (!get(bugStore).spawn)
            return;
        const [x, y] = this.game.view.screenToWorld([ev.pageX, ev.pageY]);
        this.game.connection.chat(`/largebug ${~~x} ${~~y}`);
        bugStore.update(s => (s.spawn = false, s));
    }

    allocNew(id: number = this.entities.size, x = 0, y = 0, seed = ~~(Math.random() * 200)) {
        const ret: LargeBug = new LargeBug(this, id, this.lbrender, seed);
        this.entities.set(id, ret);
        ret.x = x;
        ret.y = y;
        ret.state = ret.states.idle(ret);
        return ret;
    }

    dealloc(id: number): void {
        const ent = this.entities.get(id);
        if (!ent)
            return;
        ent.die();
        this.entities.delete(id);
    }

    iidg = 0;
    process(dv: DataView): void {
        // 0: 0xAA
        // 1: this id
        // 2: action
        const base = 2;
        switch (dv.getInt8(base + 0)) {
            case 0: // alloc with entity id
                const rng = new Random(dv.getInt32(base + 9, true));
                // makes 30 large bugs
                for (let i = 0; i < 30; ++i) {
                    this.allocNew(this.iidg++,
                        dv.getFloat32(base + 1, true),
                        dv.getFloat32(base + 5, true), rng.next() * 1000);
                }
                break;
        }
    }

    update(t: number, dt: number): void {
        this.entities.forEach(e => e.update(dt));
    }

    die(): void {
    }

    doRender() {
        // maybe save/restore bindings?
        if (this.entities.size == 0)
            return;
        this.entities.forEach(e => e.doRender());

        this.lbrender.prog.uniforms.camera.data = this.camera.projectionMatrix;
        this.lbrender.finalizeDraw();
    }

    dirty(): boolean {
        return this.entities.size > 0;
    }
}
const lerp = (a: number, b: number, t: number) => a + t * (b - a);

declare let hahaoffs: vec2[];
declare let funoffs: vec2;
declare let framm: number;
(window as any).framm = undefined;
(window as any).funoffs = [412, 300];
(window as any).hahaoffs = [[-0.8479983040050879, -0.5299989400031799], [-0.6783986432040705, -0.42399915200254407], [-0.33919932160203525, -0.21199957600127203], [-0.16959966080101763, -0.10599978800063602], [0, 0], [0.16959966080101763, 0.10599978800063602], [-0.16959966080101763, -0.10599978800063602], [-0.16959966080101763, -0.10599978800063602], [-0.125, -0.125]]

class FunnyHaha implements Entity {
    attachedpiece?: GamePiece;
    anchor?: vec2;
    attach(arg0: GamePiece, anchorpoint: vec2) {
        this.attachedpiece = arg0;
        this.anchor = getTransformedXY(arg0, anchorpoint);
    }

    renderer;
    inst;
    ctrl;
    constructor(parent: FunnyHahaManager, public id: number,
        batch: FunnyHahaManager['fhrender'],
        private succ: FunnyHahaManager['succrenderer']
    ) {
        this.ctrl = new FrameController(batch, chuu);
        this.ctrl.setVariant(1);
        this.ctrl.setAnim("chuu");
        this.ctrl.origin = [NaN, NaN];

        this.inst = succ.allocInst();
        this.inst.sync();

        this.renderer = parent.renderer;
        const gl = this.renderer.gl;
        const geo = new VertexBuffer(gl, "STATIC_DRAW", ["pos", "vec2"]);
        geo.set(new Float32Array([
            0, 0,
            1, 0,
            1, 1,
            0, 1
        ].map(e => e - 0.5)));
        const idx = new IndexBuffer(gl, "STATIC_DRAW", "UNSIGNED_SHORT");
        idx.set(new Uint16Array([0, 1, 2, 2, 3, 0]));
        const inputass = new VertexBufferAssembly(gl, idx, geo);
        this.shad = new indtest(this.renderer.jigGl.glx);
        this.shad.setAssembly(inputass);
        this.camera = this.renderer.camera;
    }
    camera;
    shad;
    upd = true;
    pf = 0;
    doRender(): void {
        // const { gl } = this.renderer;
        // this.shad.uniforms.camera.data = this.camera.projectionMatrix;
        // this.shad.uniforms.dims.data = [512, 512];
        // this.shad.bindings.fbuffer.texture = this.renderer.colorTexture!;
        // this.renderer.jigGl.glx.using(this.shad, (drawer) => {
        //     // drawer.drawElements(gl.TRIANGLES, 6);
        // });
        if (!this.upd)
            return;

        this.ctrl.prepareDraw();
    }

    update(t: number, dt: number): void {
        this.shad.uniforms.time.data = t;
        this.ctrl.update(dt);
        if (this.attachedpiece) {
            let anchor = getTransformedXY(this.attachedpiece, this.anchor!);
            this.ctrl.origin =
                sub(add([this.attachedpiece.globalX, this.attachedpiece.globalY],
                    anchor),
                    smul(funoffs, this.ctrl.pscale));
        } else {
        }
        this.inst.world_pos = add(this.ctrl.origin, [funoffs[0] * this.ctrl.pscale, funoffs[1] * this.ctrl.pscale]);
        this.inst.scale_angle = [this.ctrl.pscale * 512, 0];
        this.upd ||= (this.pf != this.ctrl.currentFrame);
        this.pf = this.ctrl.currentFrame;
        const cp = this.ctrl.ctrl.partialCompletion;
        const cf = (this.ctrl.currentFrame + 1) % 8;
        const f1 = hahaoffs[(cf == 0 ? hahaoffs.length - 1 : cf - 1)];
        const f2 = hahaoffs[cf];
        this.inst.u_end = [
            lerp(f1[0], f2[0], cp),
            lerp(f1[1], f2[1], cp),
        ];
        this.inst.sync();
    }

    die() {
        this.ctrl.cleanup();
        this.succ.free(this.inst);
    }
}

function createGridMesh(size: number) {
    let vertices: number[] = [];
    let indices: number[] = [];
    vertices.length = 0;
    indices.length = 0;

    // Generate vertices
    for (let y = 0; y <= size; y++) {
        for (let x = 0; x <= size; x++) {
            const xPos = (x / size) * 2 - 1; // Map to [-1, 1]
            const yPos = (y / size) * 2 - 1; // Map to [-1, 1]

            vertices.push(xPos, yPos);
        }
    }

    // Generate indices for triangles
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const topLeft = y * (size + 1) + x;
            const topRight = topLeft + 1;
            const bottomLeft = (y + 1) * (size + 1) + x;
            const bottomRight = bottomLeft + 1;

            // First triangle (top-left, bottom-left, bottom-right)
            indices.push(topLeft, bottomLeft, bottomRight);
            // Second triangle (top-left, bottom-right, top-right)
            indices.push(topLeft, bottomRight, topRight);
        }
    }

    return { vertices: new Float32Array(vertices), indices: new Uint16Array(indices) };
}

import succ from "./succ.glsl";
import { get } from "svelte/store";
import { getTransformedXY } from "./game-state";

async function buildSuccRenderer(jgl: JigGL) {
    const { glx } = jgl;
    const grid = createGridMesh(50);
    const succinst = new succ(glx);
    return new SpriteDrawer3(glx, succinst, "basepos", 32, grid);
}

export class FunnyHahaManager implements EntityManager {
    entities = new Map<number, FunnyHaha>;
    gl!: WebGL2RenderingContext;

    cursor?: FunnyHaha;
    constructor() {
        const cursorTrack = (ev: MouseEvent) => {
            // const [x, y] = this.game.view.screenToWorld([ev.pageX, ev.pageY]);
            // this.cursor!.ctrl.origin = sub([x, y], funoffs);
            // this.cursor!.ctrl.pscale = (1 / clamp(this.game.view.scale, 0.5, 1)) / 4;

        }
        bugStore.subscribe(v => {
            if (v.spawnchuu) {
                if (v.spawn) {
                    bugStore.update(s => (s.spawn = false, s));
                    return;
                }
                this.cursor = new FunnyHaha(this, -1, this.fhrender, this.succrenderer)
                this.entities.set(-1, this.cursor);
                window.addEventListener("mousemove", cursorTrack);
                this.game.view.currentMouseEvent = {
                    mouse: (x, y) => {
                        const sc = (1 / clamp(this.game.view.scale, 0.5, 1)) / 4;
                        this.cursor!.ctrl.origin = sub([x, y], smul(funoffs, sc));
                        this.cursor!.ctrl.pscale = sc;
                    },
                }
            } else {
                delete this.game?.view?.currentMouseEvent;
                this.entities.delete(-1);
                this.cursor?.die();
                window.removeEventListener("mousemove", cursorTrack);
                delete this.cursor;
            }
        });
    }

    camera!: Camera2D;
    game!: Game;
    renderer!: GPU4Renderer;
    fhrender!: Awaited<ReturnType<typeof buildAseRenderer>>;
    succrenderer!: Awaited<ReturnType<typeof buildSuccRenderer>>;

    async init(game: Game): Promise<EntityManager> {
        if (!game.renderer || !(game.renderer instanceof GPU4Renderer))
            return new DummyManager;

        this.game = game;
        const gl = game.renderer.gl;
        this.gl = gl;
        this.renderer = game.renderer;
        this.camera = game.renderer.camera;
        this.fhrender = await buildAseRenderer(game.renderer.jigGl,
            chuu,
            game.renderer.camera,
            1);

        this.succrenderer = await buildSuccRenderer(game.renderer.jigGl);
        return this;
    }

    pick(x: number, y: number) {
    }

    wants(ev: MouseEvent, stop: () => void): MouseEventWrapper | void {
        if (!get(bugStore).spawnchuu)
            return;
        const [x, y] = this.game.view.screenToWorld([ev.pageX, ev.pageY]);

        /*
            -- if it refers to a piece, attach to piece
            -- else attach to board
        */
        const group = (this.game.actions.tryGetGroupAt(x, y, this.renderer, true, false))
        const nid = ~~(Math.random() * 100000);
        let newinst = new FunnyHaha(this, nid, this.fhrender, this.succrenderer);
        const sc = (1 / clamp(this.game.view.scale, 0.5, 1)) / 4;
        if (group) {
            const pid = this.game.actions.posIsInGroup(x, y, group, this.renderer);
            if (pid !== false) {
                const M: vec2 = [x, y];
                const C: vec2 = [pid.globalX, pid.globalY];
                newinst.attach(pid, sub(M, C));
            } else {
                newinst.ctrl.origin = sub([x, y], smul(funoffs, sc));
            }
        } else {
            newinst.ctrl.origin = sub([x, y], smul(funoffs, sc));
        }
        newinst.ctrl.pscale = sc;
        this.entities.set(newinst.id, newinst);
        if (newinst.attachedpiece)
            this.game.connection.wsClient?.send(e => ({
                type: "funny",
                id: newinst.id,
                x: newinst.anchor![0],
                y: newinst.anchor![1],
                scale: newinst.ctrl.pscale,
                gid: group!.id,
                pid: newinst.attachedpiece!.index,
            }));
        else {
            this.game.connection.wsClient?.send(e => ({
                type: "funny",
                id: newinst.id,
                x: newinst.ctrl.origin[0],
                y: newinst.ctrl.origin[1],
                scale: newinst.ctrl.pscale,
            }));
        }

        bugStore.update(s => (s.spawnchuu = false, s));
    }

    allocNew(id: number = this.entities.size) {
        if (this.entities.has(id))
            return this.entities.get(id)!;
        const ret: FunnyHaha = new FunnyHaha(this, id, this.fhrender, this.succrenderer);
        this.entities.set(id, ret);
        return ret;
    }

    dealloc(id: number): void {
        const ent = this.entities.get(id);
        if (!ent)
            return;
        this.entities.delete(id);
    }

    iidg = 0;
    process(dv: DataView): void {
        // 0: 0xAA
        // 1: this id
        // 2: action
        const base = 2;
        switch (dv.getInt8(base + 0)) {
            case 0: {// alloc with entity id, and piece attachment
                // id, scale, off, pid, groupid
                let ptr = 1;
                const id = dv.getInt32(base + ptr, true); ptr += 4;
                const offx = dv.getFloat32(base + ptr, true); ptr += 4;
                const offy = dv.getFloat32(base + ptr, true); ptr += 4;
                let scale = dv.getFloat32(base + ptr, true); ptr += 4;
                const gid = dv.getUint16(base + ptr, true); ptr += 2;
                const pid = dv.getUint16(base + ptr, true); ptr += 2;

                const g = this.game.state.transformedboard[gid];
                if (!g) break;
                const p = g.pieces.find(e => e.index === pid);
                if (!p) break;
                const ent = this.allocNew(id);
                ent.attach(p, [offx, offy]);
                //if scale is NaN it won't render which is a (You) problem
                ent.ctrl.pscale = clamp(scale, 0.25, 0.5);
                break;
            }
            case 1: {// alloc with entity id, and global pos
                // id, scale, off, pid, groupid
                let ptr = 1;
                const id = dv.getInt32(base + ptr, true); ptr += 4;
                const offx = dv.getFloat32(base + ptr, true); ptr += 4;
                const offy = dv.getFloat32(base + ptr, true); ptr += 4;
                const scale = dv.getFloat32(base + ptr, true); ptr += 4;

                const ent = this.allocNew(id);
                ent.ctrl.origin = [offx, offy];
                ent.ctrl.pscale = clamp(scale, 0.25, 0.5);
                break;
            }
            case 2: {// dealloc
                const id = dv.getInt32(base + 1, true)
                this.entities.get(id)?.die();
                this.entities.delete(id);
                break;
            }
        }
    }

    update(t: number, dt: number): void {
        this.entities.forEach(e => e.update(t, dt));
    }

    die(): void {
    }

    doRender() {
        // if (this.entities.size == 0)
        //     return;
        // this.entities.forEach(e => e.doRender());
        // this.fhrender.prog.uniforms.camera.data = this.camera.projectionMatrix;
        // this.fhrender.finalizeDraw();
    }

    doPostRender() {
        // maybe save/restore bindings?
        if (this.entities.size == 0)
            return;
        this.entities.forEach(e => e.doRender());
        this.succrenderer.prog.uniforms.camera.data = this.camera.projectionMatrix;
        this.succrenderer.prog.uniforms.dims.data = [512 / 4, 512 / 4];
        this.succrenderer.prog.bindings.fbuffer.texture = this.renderer.colorTexture!;
        const gl = this.renderer.gl;
        gl.enable(gl.DEPTH_TEST);
        this.succrenderer.finalizeDraw();
        gl.disable(gl.DEPTH_TEST);
        this.fhrender.prog.uniforms.camera.data = this.camera.projectionMatrix;
        this.fhrender.finalizeDraw();
    }

    dirty(): boolean {
        return this.entities.size > 0;
    }
}

export class ImpactTextManager implements EntityManager {

    async init(game: Game): Promise<EntityManager> {
        return this;
    }

    wants() {

    }

    allocNew(id: number, txt = '', y = 0, sz = 4 + Math.random() * 15) {
        const e = document.createElement('span');
        e.classList.add('impact');
        e.style.top = `calc(${~~y}% - ${~~sz}vh)`;
        e.style.fontSize = `${~~sz}vh`;
        e.innerText = txt;
        e.onanimationend = () => e.remove();
        document.body.append(e);
        return {
            id: id,
            update() { },
            doRender() { },
        } as Entity;
    }

    iidg = 0;
    process(dv: DataView): void {
        // 0: 0xAA
        // 1: this id
        // 2: action
        const base = 2;
        switch (dv.getInt8(base + 0)) {
            case 0:
                const [txt, txtlen] = readCString(dv, base + 1);
                const y = dv.getFloat32(base + 1 + txtlen + 1, true);
                const sz = dv.getFloat32(base + 1 + txtlen + 1 + 4, true);
                this.allocNew(this.iidg++, txt, y, sz);
                break;
        }
    }

    constructor() { }
    pick(x: number, y: number) { }
    dealloc(id: number): void { }
    update(t: number, dt: number): void { }
    die(): void { }
    doRender() { }

    dirty(): boolean {
        return false;
    }
}

class Kaomoji implements Entity {
    selected = false;
    select_start?: vec2;
    upd = true;
    constructor(
        public hook: ReturnType<PollManager['spriteDrawer']['allocInst']>,
        public id: number,
        public x: number = NaN,
        public y: number = NaN) {
    }

    doRender(): void {
        if (!this.upd)
            return;
        this.upd = false;
        this.hook.sync();
    }

    update(dt: number): void {
        if (this.hook.pos[0] == this.x &&
            this.hook.pos[1] == this.y &&
            this.hook.sel == +this.selected
        ) return;
        this.upd = true;
        this.hook.pos[0] = this.x;
        this.hook.pos[1] = this.y;
        this.hook.sel = +this.selected;
    }

    die() {

    }

}
const poll_region_colors = [
    [0.9, 0.1, 0.1, 0.6], // red
    [0.1, 0.9, 0.1, 0.6], // green
    [0.1, 0.1, 0.9, 0.6], // blue
    [0.9, 0.9, 0.1, 0.6], // yellow
    [0.9, 0.1, 0.9, 0.6], // magenta
    [0.1, 0.9, 0.9, 0.6], // cyan
    [0.9, 0.5, 0.1, 0.6], // orange
    [0.5, 0.1, 0.9, 0.6], // purple
];

export class PollManager implements EntityManager {
    pickKao(id: number) {
        const kao = this.kaos.get(id);
        if (!kao) return;
        kao.selected = true;
        kao.select_start = [kao.x, kao.y];
        const note = this.game.sequencer.next();
        playsound(Math.random() < 0.01 ? memsound : meowsound, 1, true, note);
    }

    releaseKao(id: number) {
        const kao = this.kaos.get(id);
        if (!kao) return;
        kao.selected = false;
    }

    kaos = new Map<number, Kaomoji>();
    zones: [label: string, region: Rectangle][] = [];
    is_updating_zone = 0;
    gl!: WebGL2RenderingContext;

    textDrawers: TextDrawer[] = [];
    rectangleDrawer!: RectangleDrawer;
    constructor() {
    }

    prog!: spritedrawerInstance['prog'];
    camera!: Camera2D;
    jigGl!: JigGL;
    spriteDrawer!: SpriteDrawer3<kaoshader, { spos: "vec2"; pos: "vec2"; sel: "float"; }, "spos">;
    game!: Game;
    async init(game: Game): Promise<EntityManager> {
        if (!game.renderer || !(game.renderer instanceof GPU4Renderer))
            return new DummyManager;
        this.game = game;
        this.mph = game.view.maxPieceHeight / 32;
        this.jigGl = game.renderer.jigGl;
        this.gl = this.jigGl.gl;
        this.spriteDrawer = new SpriteDrawer3(this.jigGl.glx, new kaoshader(this.jigGl.glx), 'spos');
        const kaoi = new Image();
        await new Promise(_ => {
            kaoi.onload = _;
            kaoi.src = kao;
        });

        const kaot = this.jigGl.glx.createTexture(["RGBA", "RGBA", "UNSIGNED_BYTE"], kaoi);
        this.spriteDrawer.prog.bindings.sprite.texture = kaot;
        this.spriteDrawer.prog.uniforms.dims.data = [64, 64];
        this.prog = this.spriteDrawer.prog;
        this.camera = game.renderer.camera;
        this.rectangleDrawer = new RectangleDrawer(this.jigGl, this.camera);
        return this;
    }
    mph = 0;

    setKaos(kaos: [number, number][]) {
        this.kaos.forEach(k => {
            this.spriteDrawer.free(k.hook);
        });
        this.kaos.clear();
        for (let i = 0; i < kaos.length; ++i) {
            this.allocNew(i, ...kaos[i]);
        }

    }

    zone_setup: 'none' | 'waiting_first_point' | 'waiting_second_point' = 'none';
    wants(ev: MouseEvent): MouseEventWrapper | void {
        const [x, y] = this.game.view.screenToWorld([ev.pageX, ev.pageY]);

        if (this.kaos.size == 0) {
            // we stop only if we aren't setting up the zones
            if (this.zone_setup == 'none')
                return;
            this.zone_setup = 'waiting_second_point';
            const last_zone = this.zones.at(-1)!;
            last_zone[1][0] = [x, y];
            last_zone[1][1] = [x, y];
            return {
                move: (dx, dy) => {
                    last_zone[1][1] = add([dx, dy], [x, y]);
                },
                end: () => {
                    this.zone_setup = 'waiting_first_point';
                }
            };
        }

        const kao = this.pick(x, y);
        if (!kao)
            return;

        this.pickKao(kao.id);
        this.game.connection.pickKao(kao.id);

        return {
            move: (dx, dy) => {
                kao.x = kao.select_start![0] + dx;
                kao.y = kao.select_start![1] + dy;
                const w = 64;
                const h = 64;
                kao.x = clamp(kao.x, w / 2, this.game.view.boardWidth - w / 2);
                kao.y = clamp(kao.y, h / 2, this.game.view.boardHeight - h / 2);
                this.game.connection.sendKaoPosition(kao.id, kao.x, kao.y);
            },
            end: () => {
                this.releaseKao(kao.id);
                this.game.connection.releaseKao(kao.id);
            }
        };
    }

    pick(x: number, y: number) {
        for (const [i, kao] of [...this.kaos].reverse()) {
            const p: vec2 = [kao.x, kao.y];
            if (getDistance2d(x, y, ...p) < 44) {
                return kao;
            }

        }
    }
    allocNew(id: number = this.kaos.size, ...args: any[]) {
        const ret = new Kaomoji(this.spriteDrawer.allocInst(), id, ...args);
        this.kaos.set(id, ret);
        return ret;
    }

    dealloc(id: number): void {
        const ent = this.kaos.get(id);
        if (!ent)
            return;
        this.spriteDrawer.free(ent.hook);
        this.kaos.delete(id);
    }

    // maybe we shouldn't use a binary interface for one off messages...
    process(dv: DataView): void {
        // 0: 0xAA
        // 1: this id
        // 2: action
        const base = 2;
        switch (dv.getInt8(base + 0)) {
            case 0: // alloc with entity id
                // 5 is the original variant (in the currently used resource archive)
                this.allocNew(dv.getInt16(base + 1, true), base + 3 < dv.byteLength ? dv.getInt8(base + 3) : 5);
                break;
            case 1: // dealloc with entity id
                this.dealloc(dv.getInt16(base + 1, true));
                break;
            case 2: { // set pos
                const ent = this.kaos.get(dv.getInt16(base + 1, true));
                if (ent) {
                    ent.x = dv.getFloat32(base + 3, true);
                    ent.y = dv.getFloat32(base + 7, true);
                    ent.upd = true;
                }
                break;
            }
        }
        this._dirty = true;
    }

    update(t: number, dt: number): void {
        this.kaos.forEach(e => e.update(dt));
    }

    die(): void {
    }


    doRender() {
        const gl = this.gl;
        this.spriteDrawer.prog.uniforms.camera.data = this.camera.projectionMatrix;
        if (this.zones.length > 0) {
            for (let i = 0; i < this.zones.length; ++i) {
                const r = this.zones[i][1];
                this.rectangleDrawer.drawRect(...r[0], ...r[1], poll_region_colors[i & 0x7]);
            }

            gl.enable(gl.BLEND);

            if (this.textDrawers.length != this.zones.length) {
                this.textDrawers = []; // TODO: actually ressources
                for (let z of this.zones) {
                    const td = new TextDrawer(this.jigGl, this.camera, z[0]);
                    this.textDrawers.push(td);
                }
            }
            this.kaos.forEach(k => k.doRender());
            this.spriteDrawer?.finalizeDraw();
            for (let i = 0; i < this.textDrawers.length; ++i) {
                const z = this.zones[i];
                const td = this.textDrawers[i];
                td.setPos(rectangleCenter(z[1]));
            }
            for (let td of this.textDrawers) {
                td.finalizeDraw();
            }
        }
    }

    _dirty = true;
    dirty(): boolean {
        const ret = this._dirty;
        this._dirty = false;
        return ret;
    }
}

import { notesStore } from "$lib/room/stores";
import type { Note } from "./types";

export class NotesManager implements EntityManager {

    notes: Note[] = [];
    gl!: WebGL2RenderingContext;

    textDrawers: TextDrawer[] = [];
    rectangleDrawer!: RectangleDrawer;
    constructor() {
    }

    camera!: Camera2D;
    jigGl!: JigGL;
    game!: Game;
    async init(game: Game): Promise<EntityManager> {
        if (!game.renderer || !(game.renderer instanceof GPU4Renderer))
            return new DummyManager;
        this.game = game;
        this.mph = game.view.maxPieceHeight / 32;
        this.jigGl = game.renderer.jigGl;
        this.gl = this.jigGl.gl;
        this.camera = game.renderer.camera;
        this.rectangleDrawer = new RectangleDrawer(this.jigGl, this.camera);
        return this;
    }
    mph = 0;

    _dirty = true;
    setNotes(notes: Note[]) {
        this.notes = notes;
        this._dirty = true;
        notesStore.set({ notes });
    }

    // none: not adding a note
    // waiting_first_point: waiting for user to click to start drawing the rectangle
    // waiting_second_point: user clicked once, dragging to define the rectangle
    zone_setup: 'none' | 'waiting_first_point' | 'waiting_second_point' = 'none';
    current_setup_note: Note | null = null;
    current_setup_cb?: (note: Note) => void;

    startSetup(note: Note, cb: (note: Note) => void) {
        this.zone_setup = 'waiting_first_point';
        this.current_setup_note = note;
        this.current_setup_cb = cb;
    }

    cancelSetup() {
        this.zone_setup = 'none';
        this.current_setup_note = null;
        this.current_setup_cb = undefined;
    }

    wants(ev: MouseEvent): MouseEventWrapper | void {
        const [x, y] = this.game.view.screenToWorld([ev.pageX, ev.pageY]);

        if (this.zone_setup !== 'none' && this.current_setup_note) {

            if (this.zone_setup == 'waiting_first_point') {
                this.zone_setup = 'waiting_second_point';
                this.current_setup_note.region[0] = [x, y];
                this.current_setup_note.region[1] = [x, y];
                return {
                    move: (dx, dy) => {
                        this.current_setup_note!.region[1] = add([dx, dy], [x, y]);
                    },
                    end: () => {
                        this.zone_setup = 'none';
                        if (this.current_setup_cb) {
                            this.current_setup_cb(this.current_setup_note!);
                        }
                    }
                };
            }
        }
    }

    pick(x: number, y: number) {

    }
    allocNew(id: number = 0, ...args: any[]) {
        return null as any;
    }

    dealloc(id: number): void {

    }

    process(dv: DataView): void {

    }

    update(t: number, dt: number): void {

    }

    die(): void {
    }

    doRender() {
        const gl = this.gl;

        if (this.notes.length > 0 || this.current_setup_note) {

            const notesToRender = [...this.notes];
            if (this.current_setup_note) {
                // display the note being currently edited
                notesToRender.push(this.current_setup_note);
            }

            for (let i = 0; i < notesToRender.length; ++i) {
                const note = notesToRender[i];
                const r = note.region;
                // parse color
                let color = [1, 1, 1, 1];
                if (note.color.startsWith('#')) {
                    const r = parseInt(note.color.slice(1, 3), 16) / 255;
                    const g = parseInt(note.color.slice(3, 5), 16) / 255;
                    const b = parseInt(note.color.slice(5, 7), 16) / 255;
                    color = [r, g, b, 0.6];
                }

                this.rectangleDrawer.drawRect(...r[0], ...r[1], color);
            }

            gl.enable(gl.BLEND);

            // Rebuild text drawers if count changed (inefficient but simple for now)
            // Ideally we'd cache these better or update them incrementally
            if (this.textDrawers.length != notesToRender.length) {
                this.textDrawers = [];
                for (let note of notesToRender) {
                    const td = new TextDrawer(this.jigGl, this.camera, note.text);
                    this.textDrawers.push(td);
                }
            } else {
                // update text if it changed? TextDrawer doesn't support changing text easily without re-creation usually
                // but checking if we need to might be good. For now, assume re-creation if length differs
                // or just always recreate if small number
            }

            for (let i = 0; i < this.textDrawers.length; ++i) {
                const note = notesToRender[i];
                const td = this.textDrawers[i];
                td.setPos(rectangleCenter(note.region));
                // TODO: alignment support in TextDrawer? usually it centers
            }
            for (let i = 0; i < this.textDrawers.length; ++i) {
                const note = notesToRender[i];
                const td = this.textDrawers[i];
                td.finalizeDraw(note.scale || 1);
            }
        }
    }

    dirty(): boolean {
        const ret = this._dirty;
        this._dirty = false;
        return ret;
    }
}
