import { AnimationController } from "./AnimationController";
// import { SpriteDrawer2 } from "./SpriteDrawer";
// import {  } from "./JANparse";
import { type Entity, type EntityManager } from "./Entity";
import { Random } from "../utils";
import { add, smul } from "./vec2";
import type { vec2 } from "$backend/types";
import type { spritedrawerInstance } from "./EntityManager";
import largebug from "./bug.aseprite";
import { FrameController } from "./FrameController";

type StateFunction = (jc: LargeBug) => ({
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
    update(t, d) { jc.ctrl.update(d); },
});

const dying: StateFunction = (jc) => {
    let wait = jc.rng.nextInterval(1000, 2500);
    let decay = jc.ctrl.pscale / wait;
    return {
        ...base(jc),
        enter() {
            jc.ctrl.setAnim('walk');
        },
        update(t, dt) {
            wait -= dt;
            jc.ctrl.pscale -= decay * dt;
            jc.upd ||= true;
            if (jc.ctrl.pscale <= 0)
                jc.owner.dealloc(jc.id);
        }
    };
}

const idle: StateFunction = (jc) => {
    let wait = jc.rng.nextInterval(100, 2500);
    return {
        ...base(jc),
        enter() {
            jc.life -= 1;
            if (jc.life <= 0) {
                jc.state = dying(jc);
                return;
            }
            jc.ctrl.setAnim('walk');
        },
        update(t, dt) {
            wait -= dt;
            if (wait <= 0)
                jc.state = moving(jc);
        }, // stop moving
    };
}

const moving: StateFunction = jc => {
    let length = jc.rng.nextInterval(60, 1200);
    let dir = jc.rng.nextInterval(0, Math.PI * 4);
    let dirv: vec2 = [Math.sin(dir), Math.cos(dir)];
    const speed = jc.rng.nextInterval(30, 40);
    return {
        ...base(jc),
        enter() {
            jc.direction = dir;
        },
        update(t, dt) {
            jc.ctrl.update(dt);
            const amount = speed * dt * 0.1;
            [jc.x, jc.y] = add([jc.x, jc.y], smul(dirv, Math.min(amount, length)));
            length -= amount;
            if (length <= 0)
                jc.state = idle(jc);
        }, // stop moving
    }
}

export class LargeBug implements Entity {
    _state;

    get direction() {
        return -this.ctrl.angle;
    }

    get x() {
        return this.ctrl.origin[0];
    }

    get y() {
        return this.ctrl.origin[1];
    }

    set y(v: number) {
        this.ctrl.origin[1] = v;
        this.upd = true;
    }

    set direction(v: number) {
        this.ctrl.angle = v + Math.PI;
        this.upd = true;
    }

    set x(v: number) {
        this.ctrl.origin[0] = v;
        this.upd = true;
    }

    set state(nv: ReturnType<StateFunction>) {
        this._state.leave();
        this._state = nv;
        nv.enter();
    }

    states = {
        idle,
        moving
    };

    ctrl;
    upd = true;

    rng;
    life;
    constructor(public owner: EntityManager, public id: number, public hook: spritedrawerInstance, seed: number) {
        this.rng = new Random(seed);
        this.life = ~~(this.rng.nextInterval(4, 12));
        this.ctrl = new FrameController(hook, largebug);
        let variant = seed % 7;
        this.ctrl.setVariant(2 ** variant);
        this.ctrl.onEnd = () => {
            this._state.animEnd();
        };
        this._state = idle(this);
        this._state.enter();
        this.ctrl.pscale = this.rng.next() + 1;
    }

    doRender(): void {
        if (!this.upd)
            return;
        this.ctrl.prepareDraw();
        this.upd = false;
    }

    die(): void {
        this.ctrl.cleanup();
    }

    update(dt: number) {
        this._state.update(0, dt);
    }
}
