/* eslint-disable @typescript-eslint/no-this-alias */
import { BinCommands } from "../types.js";
import { send_system } from "../room-utils.js";
import { Group, PSet, Rectangle, Room, User, UserPrivate, vec2 } from "../types.js";
import { clamp } from "../utils.js";
import { PlaylistModule } from "./PlaylistModule.js";
import { ChatModule, Command, CommandRoomStateArg } from "./index.js";
import { add, dist, len, mul, normalized, rectangleCenter, smul, sub } from "./vec2.js";
import { f32, struct, u16, u8 } from "../core/binary.js";
import { Handler } from "../core/protocols/index.js";

export enum Direction {
    up,
    down,
    left,
    right,
};

const jigChanMoveStruct = struct({
    id: u16(),
    x: f32(),
    y: f32(),
});

const jigChanPatStruct = struct({
    id: u16(),
});

// we keep track of each part instead of just spitting out a random number as a client side seed so
// that we can control the random distribution of each element
// though uuuuhhhhhh, i guess it could still be client side?
const clothes = ['sailor', 'sailor2', 'normal', 'normal2'] as const;
const hair = {
    jig: ['bowl', 'messy', 'mushroom', 'ribbon', 'twintails'],
    gie: ['rimo', 'long', 'braided', 'puffy']
} as const;

const skins = {
    jig: {
        hair: ['bowl', 'messy', 'mushroom', 'ribbon', 'twintails'],
        clothes: ['sailor', 'normal']

    },
    gie: {
        hair: ['rimo', 'long', 'braided', 'puffy'],
        clothes: ['sailor2', 'normal2']
    }
} as const;

const bun = {
    jig: ['jear'],
    gie: ['gear'],
} as const

const variants = (() => {
    let ret: (
        [typeof hair[keyof typeof hair][number], (typeof clothes)[number]] |
        [typeof hair[keyof typeof hair][number], (typeof clothes)[number], typeof bun[keyof typeof bun][number]]

    )[] = [];
    for (let cloth of clothes)
        for (const h in hair)
            for (let hc of hair[h as keyof typeof hair])
                ret.push([hc, cloth]);
    for (let cloth of clothes)
        for (const h in hair)
            for (let hc of hair[h as keyof typeof hair])
                for (let acc of bun[h as keyof typeof bun])
                    ret.push([hc, cloth, acc]);
    return ret;
})();

const skinToId = (...specs: typeof variants[0]) =>
    variants.findIndex(e => {
        if (e.length != specs.length) return false;
        return e.every((_, i) => e[i] === specs[i]);
    })

// dont need the actual values, just know the number of variants
const numvariants = variants.length;

function getRotatedX(rotation: number, x: number, y: number) {
    switch (rotation) {
        case 0:
            return x;
        case 1:
            return -y;
        case 2:
            return -x;
        case 3:
            return y;
        default:
            return x;
    }
}

function getRotatedY(rotation: number, x: number, y: number) {
    switch (rotation) {
        case 0:
            return y;
        case 1:
            return x;
        case 2:
            return -y;
        case 3:
            return -x;
        default:
            return y;
    }
}

class JigChan {
    x: number;
    y: number;
    food = 0;
    pickedBy?: number;
    patBy?: number;
    state: 'idle' | 'run' | 'push' | 'break' | 'win' | 'eat' | 'fall' | 'patting' | 'picked' | 'ntr' | 'bow' | 'landing' = 'idle';
    dir = Direction.down;
    //solvedids = new Set<number>();
    id = 0;

    pieceDim = 0;
    ownerip: string;
    love = 0;
    love_threshold = 75;
    loverip: string;
    variant: number = 5;
    pickedAt?: [number, number, number];
    constructor(args: { owner: string, w: number, h: number, variant: number; }) {
        // approximate piece dims
        this.x = Math.random() * args.w;
        this.y = Math.random() * args.h;
        this.ownerip = args.owner;
        this.loverip = this.ownerip;
        this.variant = args.variant;
    }

    args!: CommandRoomStateArg;

    attach(args: CommandRoomStateArg) {
        this.pieceDim = Math.max(...args.room.sets.flatMap(s => [s.pieceWidth || 0, s.pieceHeight || 0]));
        this.args = args;
    }

    serialize() {
        return {
            x: this.x,
            y: this.y,
            ownerip: this.ownerip,
            id: this.id,
            food: this.food,
            variant: this.variant,
            loverip: this.loverip
        };
    }

    restore(state: ReturnType<JigChan['serialize']>) {
        Object.assign(this, state);
    }

    curr?: ReturnType<JigChan['behavior']>;

    statebuff = Buffer.alloc(16);

    getTilePos(g: Group) {
        let tid = g.id;
        if (g.indices.length != 1) {
            tid = Math.min(...g.indices);
        }
        return this.getTilePosFromId(tid, this.args.room.sets[g.set]);
    }

    getBoundingBox(g: Group): Rectangle {
        const set = this.args.room.sets[g.set];
        const coords = g.indices.map(i => this.getTilePosFromId(i, set));
        const xs = coords.map(e => e[0]);
        const ys = coords.map(e => e[1]);

        // puzzle jigs space
        return [
            [Math.min(...xs), Math.min(...ys)],
            [Math.max(...xs), Math.max(...ys)]
        ];
    }

    // offset from the most top left tile, [0, 0] for single-piece groups
    getTileOffset(g: Group): vec2 {
        if (g.indices.length == 1)
            return [0, 0]; // should lead the same result
        const bounds = this.getImageBounds(g);
        bounds[1] = sub(bounds[1], bounds[0]);
        return rectangleCenter(bounds);
    }

    getImageBounds(g: Group) {
        const set = this.args.room.sets[g.set];
        const setpd = [set.width / set.cols, set.height / set.rows] as vec2;
        const bounds = this.getBoundingBox(g);
        // local jig space
        bounds[1] = mul(bounds[1], setpd); // local image space
        bounds[0] = mul(bounds[0], setpd); // local image space
        return bounds;
    }

    getImagePos(g: Group) {
        return rectangleCenter(this.getImageBounds(g));
    }

    getTilePosFromId(tid: number, set: PSet) {
        return [~~(tid % set.cols), ~~(tid / set.cols)] as vec2;
    }

    previousVariant = -1;
    forceState(state: JigChan['state']) {
        const statebuff = this.statebuff;
        statebuff[0] = BinCommands.EntityManagerIO; // entity manager command
        statebuff[1] = 0; // entity manager 0;
        statebuff[2] = 2; // set state;
        statebuff.writeInt16LE(this.id, 3);
        statebuff.write(state + '\0', 5);
        statebuff.writeUInt8(this.dir, 5 + state.length + 1);
        const changeVariant = this.previousVariant < 0;
        if (changeVariant) {
            statebuff.writeUInt8(this.variant, 6 + state.length + 1);
            this.previousVariant = this.variant;
        }
        this.state = state;
        return statebuff.subarray(0, 7 + state.length + +changeVariant);
    }

    changeState(state: JigChan['state']): Buffer[] {
        if (state == this.state)
            return [];
        return [this.forceState(state)];
    }

    scratch = Buffer.alloc(16);
    mvtbuff = Buffer.alloc(16);
    ctarget?: Group;

    // Does one cycle of "walk to target then push in axis"
    // target is the thing that's being moved
    // selectedCandidate is where it's being moved
    *doMoveAlongTarget(target: Group, selectedCandidate: Group, axis: 0 | 1): Generator<[boolean, ...Buffer[]] | undefined, void, unknown> {
        // in case something happened in between
        if (target.indices.length != 1)
            return;
        const scratch = this.scratch;
        const mvtbuff = this.mvtbuff;

        const targetpos = [target.x, target.y] as vec2;

        // the solution position is where target should go, which is the candidates position
        // plus the difference between the coordinates between the target and candidate
        const targettilepos = this.getImagePos(target);
        const candidatetilepos = this.getImagePos(selectedCandidate);
        const set = this.args.room.sets[selectedCandidate.set];
        const setpd = [set.width / set.cols, set.height / set.rows] as vec2;
        // pos = selectedCandidate + (targettpos - candidatetpo) * pieceDim
        let diff = sub(targettilepos, candidatetilepos);

        // won't rotate the piece on her own, also untested :^)
        let diffp: vec2 = [getRotatedX(selectedCandidate.rot!, ...diff), getRotatedY(selectedCandidate.rot!, ...diff)];
        let solutionpos = add([selectedCandidate.x, selectedCandidate.y], diffp);

        const diffa = (solutionpos[axis] < targetpos[axis] ? -1 : 1) * setpd[axis];
        targetpos[axis] -= diffa;
        solutionpos[axis] -= diffa;

        const selfpos: vec2 = [this.x, this.y];
        const distance = () => len(sub(targetpos, [this.x, this.y]));
        const direction = normalized(sub(targetpos, selfpos));
        const dirToTarget = (target: vec2, flip = false) => {
            const selfpos: vec2 = [this.x, this.y];
            const direction = normalized(sub(target, selfpos));
            const faceLeft = direction[0] < 0;
            const faceDown = direction[1] > 0;
            const hMag = Math.abs(direction[0]);
            const vMag = Math.abs(direction[1]);
            this.dir = (hMag > vMag) ?
                (faceLeft) ? (!flip ? Direction.left : Direction.right) : (!flip ? Direction.right : Direction.right) :
                (faceDown) ? (!flip ? Direction.down : Direction.up) : (!flip ? Direction.up : Direction.down);
        };

        if (distance() > setpd[axis]) {
            dirToTarget(targetpos);
            yield [true, ...this.changeState('run')];
        }

        // while it's not being moved, selected, locked, walk toward it
        let broke = false;
        let speed = setpd[axis] / 20;

        const selectedByNotMe = (g: Group) => g.selected !== undefined && g.selected != -this.id;

        let interrupted = false;
        const targetMoved = () => (interrupted ||
            (target.dragged != -1 && target.dragged !== undefined) ||
            selectedByNotMe(target) ||
            target.locked || target.indices.length != 1);

        while (distance() > speed && speed >= setpd[axis] / 200) {
            // if the piece state changed, make her give up
            if (broke || targetMoved()) {
                speed *= 0.92;
                if (!broke) {
                    dirToTarget(targetpos);
                    yield [true, ...this.changeState('break')];
                    // break anim
                    broke = true;
                }
            }
            const mvt = smul(direction, speed);
            this.x += mvt[0];
            this.y += mvt[1];
            scratch[0] = BinCommands.EntityManagerIO; // entity manager command
            scratch[1] = 0; // entity manager 0;
            scratch[2] = 3; // set position;
            scratch.writeInt16LE(this.id, 3);
            scratch.writeFloatLE(this.x, 5);
            scratch.writeFloatLE(this.y, 9);
            yield [true, scratch.subarray(0, 13)];
        }

        if (broke)
            return;

        // go into pushing mode
        target.dragged = -1;
        this.ctarget = target;
        mvtbuff[0] = 2;
        mvtbuff.writeInt16LE(-1, 1);
        mvtbuff.writeUint16LE(target.id, 3);
        const self = this;
        function* moveTo(v: vec2, shouldStop: () => boolean): Generator<[boolean, ...Buffer[]], void, unknown> {
            if (!target) return;

            dirToTarget(v);
            yield [true, ...self.changeState('push')];
            const direction = normalized(sub(v, [self.x, self.y]));
            if (selectedByNotMe(target)) {
                interrupted = true;
                return;
            }

            target.selected = -self.id;
            do {
                if (shouldStop()) {
                    break;
                }
                const rem = len(sub(v, [self.x, self.y]));
                const mvt = smul(direction, Math.min(speed, rem));
                self.x += mvt[0];
                self.y += mvt[1];
                scratch[0] = BinCommands.EntityManagerIO; // entity manager command
                scratch[1] = 0; // entity manager 0;
                scratch[2] = 3; // set position;
                scratch.writeInt16LE(self.id, 3);
                scratch.writeFloatLE(self.x, 5);
                scratch.writeFloatLE(self.y, 9);

                target.x += mvt[0];
                target.y += mvt[1];
                mvtbuff.writeFloatLE(target.x, 5);
                mvtbuff.writeFloatLE(target.y, 9);
                yield [false, scratch.subarray(0, 13), mvtbuff.subarray(0, 13)];
            } while (!interrupted);
            delete target.selected;
        }

        const solutionOrTargetMoved = (axis: 0 | 1) => () => {
            if (interrupted ||
                (target.dragged != -1 && target.dragged !== undefined) ||
                (target.selected !== -this.id) ||
                target.locked ||
                target.indices.length != 1 ||
                selectedCandidate.dragged ||
                selectedCandidate.selected) {
                interrupted = true;
                return true;
            }
            return Math.abs(solutionpos[axis] - [this.x, this.y][axis]) < speed * .02;
        };

        this.food -= 1;
        const targetspos = () => [[solutionpos[0], this.y], [this.x, solutionpos[1]]] as vec2[];
        yield* moveTo(targetspos()[axis], solutionOrTargetMoved(axis));
        if (interrupted && (target.dragged < 0 && target.dragged != -this.id) || (+(target.selected || 0) < 0 && target.selected != -this.id)) {
            // panic, we may be picking the same piece as another jigchan and self interrupting each other indefinitely
            this.curr = this.panic();
        } else if (interrupted) { // normal interruption, though TODO: interruption is based on both moving her current piece, but also if her target moves
            yield [true, ...self.changeState('fall')];
            yield* this.wait(160);
            delete this.curr;
            yield;
        }
        //if (dist([target.x, target.y], [selectedCandidate.x, selectedCandidate.y]) < 1.5 * setpd[axis]) {
        //this.solvedids.add(target.id);
        //}
    }

    *panic(): Generator<[boolean, ...Buffer[]], void, unknown> {
        const randomangle = Math.random() * Math.PI * 2;
        let f = Math.random() * 10 * this.pieceDim;
        const selfpos: vec2 = [this.x, this.y];
        let targetpos = add(selfpos, mul([Math.sin(randomangle), Math.cos(randomangle)], [f, f]));

        const distance = () => len(sub(targetpos, [this.x, this.y]));
        const direction = normalized(sub(targetpos, selfpos));
        const dirToTarget = (target: vec2, flip = false) => {
            const selfpos: vec2 = [this.x, this.y];
            const direction = normalized(sub(target, selfpos));
            const faceLeft = direction[0] < 0;
            const faceDown = direction[1] > 0;
            const hMag = Math.abs(direction[0]);
            const vMag = Math.abs(direction[1]);
            this.dir = (hMag > vMag) ?
                (faceLeft) ? (!flip ? Direction.left : Direction.right) : (!flip ? Direction.right : Direction.right) :
                (faceDown) ? (!flip ? Direction.down : Direction.up) : (!flip ? Direction.up : Direction.down);
        };

        if (distance() > this.pieceDim) {
            dirToTarget(targetpos);
            yield [true, ...this.changeState('run')];
        }

        let speed = this.pieceDim / 20;
        const scratch = this.scratch;
        while (distance() > speed) {
            // if the piece state changed, make her give up
            const mvt = smul(direction, speed);
            this.x += mvt[0];
            this.y += mvt[1];
            scratch[0] = BinCommands.EntityManagerIO; // entity manager command
            scratch[1] = 0; // entity manager 0;
            scratch[2] = 3; // set position;
            scratch.writeInt16LE(this.id, 3);
            scratch.writeFloatLE(this.x, 5);
            scratch.writeFloatLE(this.y, 9);
            yield [false, scratch.subarray(0, 13)];
        }
        dirToTarget(targetpos);
        yield [true, ...this.changeState('break')];

        while (speed >= this.pieceDim / 200) {
            speed *= 0.92;
            const mvt = smul(direction, speed);
            this.x += mvt[0];
            this.y += mvt[1];
            scratch[0] = BinCommands.EntityManagerIO; // entity manager command
            scratch[1] = 0; // entity manager 0;
            scratch[2] = 3; // set position;
            scratch.writeInt16LE(this.id, 3);
            scratch.writeFloatLE(this.x, 5);
            scratch.writeFloatLE(this.y, 9);
            yield [false, scratch.subarray(0, 13)];
        }
    }

    *eat(): Generator<[boolean, ...Buffer[]] | undefined, void, unknown> {
        yield [true, ...[this.forceState('eat')]];
        // let her digest...
        yield* this.wait(20 + Math.random() * 30);
    }

    *picked(): Generator<[boolean, ...Buffer[]] | undefined, void, unknown> {
        yield [true, ...[this.forceState('picked')]];
        while (true)
            yield;
    }

    *pat(guy_who_is_patting: UserPrivate): Generator<[boolean, ...Buffer[]] | undefined, void, unknown> {
        yield [true, ...[this.forceState('patting')]];
        while (true) {
            this.love++;
            if (this.love >= this.love_threshold) {
                this.love_threshold += 25;
                this.love = 0;
                // das rite boi, NTR in your jigsaws
                yield [true, ...[this.forceState('ntr')]];
                this.loverip = guy_who_is_patting.ipaddr;
            }
            yield;
        }
    }

    *fall(): Generator<[boolean, ...Buffer[]] | undefined, void, unknown> {
        yield [true, ...[this.forceState('fall')]];
        yield* this.wait(30);
    }

    *wait(n: number): Generator<[boolean, ...Buffer[]] | undefined, void, unknown> {
        while (n-- > 0)
            yield;
    }


    *land(): Generator<[boolean, ...Buffer[]] | undefined, void, unknown> {
        yield [true, ...[this.forceState('landing')]];
        yield* this.wait(30);
    }

    /*
    changes to jigchan routine:
- look for the nearest filled frame in the room, else the biggest group in the room
- enumerate the single-size candidates, order by distance to self, randomly pick one in the first 10 results
- target piece remains the same, target position becomes the position in the group (take care of group-relative rotation/ackshually no im too lazy)
    */

    *behavior(): Generator<[boolean, ...Buffer[]] | undefined, void, unknown> {
        if (this.args.room.endTime) {
            return;
        }

        yield [true, ...this.changeState('idle')];

        if (this.food <= 0) {
            return;
        }

        const scratch = this.scratch;
        const mvtbuff = this.mvtbuff;
        scratch[0] = BinCommands.EntityManagerIO; // entity manager command
        // beware: el spaghetti
        const self = this;
        scratch[1] = 0; // entity manager 0;
        scratch[2] = 3; // set position;
        scratch.writeInt16LE(this.id, 3);
        scratch.writeFloatLE(this.x, 5);
        scratch.writeFloatLE(this.y, 9);
        yield [true, scratch.subarray(0, 13)];

        const pieceidtogroup = this.args.runtime.transformedgroups;
        const neighborsOf = (id: number, set: PSet) => {
            const ret: number[] = [];
            const y = ~~(id / set.cols);
            const x = ~~(id % set.cols);
            if (x > 0)
                ret.push(id - 1); //left
            if (x < set.cols - 1)
                ret.push(id + 1); // right
            if (y > 0)
                ret.push(id - set.cols); //top
            if (y < set.rows - 1)
                ret.push(id + set.cols); // bottom
            return ret;
        };

        const candidatesOf = (self: Group) => {
            const set = this.args.room.sets[self.set];
            let base = 0;
            for (let s of this.args.room.sets) {
                if (s == set)
                    break;
                base += s.cols * s.rows;
            }
            // i never know if it's indices or ids... but i think one of the two is hecking useless
            const candidates = new Set(self.indices.flatMap(i => neighborsOf(i, set).map(n => pieceidtogroup.get(n + base)!)));
            candidates.delete(self);
            return [...candidates].filter(g => g.indices.length == 1);
        };

        let target: Group | undefined;
        // wait 60 ticks before trying to seek a piece
        yield* this.wait(60 + Math.random() * 30);

        const closestGroupToJigChan = (a: Group, b: Group) => dist([this.x, this.y], [a.x, a.y]) - dist([this.x, this.y], [b.x, b.y]);
        // look for the closest complete frame that's not a complete image
        let ref = this.args.state.frameGroupIds
            ?.map(id => pieceidtogroup.get(id)!)
            ?.filter(g => {
                const set = this.args.room.sets[g.set];
                return g.indices.length != set.cols * set.rows;
            })
            ?.sort(closestGroupToJigChan)?.[0];

        // else look for the biggest group for each set
        if (!ref) {
            let biggestGroupForEachSet = new Map<number, Group>();
            for (const g of this.args.room.groups) {
                const set = this.args.room.sets[g.set];
                if (g.indices.length == set.cols * set.rows) // skip complete groups
                    continue;
                const currentBiggest = biggestGroupForEachSet.get(g.set);
                if (!currentBiggest || g.indices.length > currentBiggest.indices.length) {
                    biggestGroupForEachSet.set(g.set, g);
                }
            };
            // use the closest group as ref
            ref = [...biggestGroupForEachSet.values()].sort(closestGroupToJigChan)[0];
        }

        if (!ref)
            return;

        const candidatesspots = candidatesOf(ref)
            .sort(closestGroupToJigChan)
            .slice(0, 11).filter(target => {
                const targetpos = [target.x, target.y] as vec2;
                const selectedCandidate = ref;
                if (!selectedCandidate) return false;
                // the solution position is where target should go, which is the candidates position
                // plus the difference between the coordinates between the target and candidate
                const targettilepos = this.getTileOffset(target);
                const candidatetilepos = this.getTileOffset(selectedCandidate);
                const set = this.args.room.sets[selectedCandidate.set];
                const setpd = [set.width / set.cols, set.height / set.cols] as vec2;
                // pos = selectedCandidate + (targettpos - candidatetpo) * pieceDim
                let solutionpos = add([selectedCandidate.x, selectedCandidate.y] as vec2,
                    mul(sub(targettilepos, candidatetilepos), setpd));
                solutionpos = sub(solutionpos, this.getTileOffset(selectedCandidate));
                return dist(targetpos, solutionpos) > 3 * this.pieceDim;
            });
        const candidate = candidatesspots[~~(Math.random() * candidatesspots.length)];

        if (!candidate) {
            return;
        }

        // first axis the piece will be pushed along
        const axis = +(Math.random() < 0.5) as 0 | 1;

        yield* this.doMoveAlongTarget(candidate, ref, axis);
        yield* this.doMoveAlongTarget(candidate, ref, 1 - axis as any);
        yield [true, ...this.changeState('bow')]; // if we got there then we finished
        yield* this.wait(30);

    }

    //
    //delete target.dragged;
}

// const isDecember = new Date().getMonth() === 11;
// const probs = (isDecember ? [
//     7, 7, 7, 7, 7, 7, 7, 7, 7, 7, // base costumes (5 heads * 2 costumes) -> 70
//     4, 4, 4, 4, 4, // santa costumes -> 20
//     5, 5 // rudolf/gie -> 10
// ] : [
//     10, 10, 10, 10, 10, 10, 10, 10, 10, 10,
// ]).map(e => e / 100); // total is 100%

export class JigChanModule extends ChatModule {
    static instance: JigChanModule;
    attachedroom?: Room;

    name = 'jigchan';

    jigchans = new Map<number, JigChan>();
    gid = 0;

    logicUpdateInterval?: NodeJS.Timeout;

    despawnCommand = Buffer.alloc(5);
    logicUpdate(args: CommandRoomStateArg) {
        const despawnCommand = this.despawnCommand;
        despawnCommand[0] = BinCommands.EntityManagerIO; // entity manager command
        despawnCommand[1] = 0; // entity manager 0;
        despawnCommand[2] = 0; // spawn entity;

        const br = args.runtime.broadcaster;
        this.jigchans.forEach(j => {
            if (!j.curr) {
                if (j.ctarget) {
                    delete j.ctarget.dragged;
                    delete j.ctarget;
                }
                j.curr = j.behavior();
            }
            const buff = j.curr.next();
            if (buff.done) {
                delete j.curr;
            } else {
                if (buff.value) {
                    if (Array.isArray(buff.value)) {
                        const [rel, ...buffs] = buff.value;
                        buffs.forEach(b => br.broadcast(b, undefined, rel));
                    } else {
                        br.broadcast(buff.value);
                    }
                }
            }
        });
    }

    plmodule!: PlaylistModule;

    constructor() {
        super();
        if (!JigChanModule.instance)
            JigChanModule.instance = this;
        return JigChanModule.instance;
    }

    override attach(args: CommandRoomStateArg): void {
        const { state, runtime, room } = args;
        if (room.ext?.voronoi) return;
        // module relies on playlist module for points
        const pl = runtime.modules.find(e => e instanceof PlaylistModule) as PlaylistModule | undefined;
        if (!pl)
            return;
        this.jigchans.forEach(j => j.attach(args));

        if (this.jigchans.size > 0) {
            if (!this.logicUpdateInterval)
                this.logicUpdateInterval = setInterval(() => this.logicUpdate(args), 1000 / 24); // kino?
        }

        this.plmodule = pl;

        const spawnCommand = Buffer.alloc(9);
        spawnCommand[0] = BinCommands.EntityManagerIO; // entity manager command
        spawnCommand[1] = 0; // entity manager 0;
        spawnCommand[2] = 0; // spawn entity;

        const setJcCommand = Buffer.alloc(5);
        setJcCommand[0] = BinCommands.EntityManagerIO; // entity manager command
        setJcCommand[1] = 0; // entity manager 0;
        setJcCommand[2] = 4; // Set ID;

        runtime.events.addListener("connected", (up: UserPrivate) => {
            this.jigchans.forEach(jc => {
                spawnCommand.writeInt16LE(jc.id, 3);
                spawnCommand.writeUint32LE(jc.variant, 5);
                up.conn.send(Buffer.from(spawnCommand));
                const moveCommand = Buffer.allocUnsafe(13);
                moveCommand[0] = BinCommands.EntityManagerIO;
                moveCommand[1] = 0;
                moveCommand[2] = 3;
                moveCommand.writeInt16LE(jc.id, 3);
                moveCommand.writeFloatLE(jc.x, 5);
                moveCommand.writeFloatLE(jc.y, 9);
                up.conn.send(moveCommand);
                if (room.endTime) {
                    up.conn.send(jc.forceState("win"));
                }

                if (jc.ownerip == up.ipaddr) {
                    setJcCommand.writeInt16LE(jc.id, 3);
                    up.conn.send(Buffer.from(setJcCommand));
                }
            });
        });

        runtime.events.addListener("setEnd", () => {
            this.jigchans.forEach(jc => {
                runtime.broadcaster.broadcast(jc.forceState("win"));
            });
        });

        const despawnCommand = Buffer.alloc(5);
        despawnCommand[0] = BinCommands.EntityManagerIO; // entity manager command
        despawnCommand[1] = 0; // entity manager 0;
        despawnCommand[2] = 1; // despawn entity;

        runtime.events.addListener("leave", (up: UserPrivate) => {
            this.jigchans.forEach(jc => {
                if (jc.patBy == up.user.id) {
                    delete jc.patBy;
                    const patJcCommand = Buffer.allocUnsafe(5);
                    patJcCommand[0] = BinCommands.EntityManagerIO;
                    patJcCommand[1] = 0;
                    patJcCommand[2] = 6;
                    patJcCommand.writeInt16LE(jc.id, 3);
                    runtime.broadcaster.broadcast(patJcCommand);
                }
                if (jc.pickedBy == up.user.id) {
                    delete jc.pickedBy;
                    delete jc.pickedAt;
                    const moveCommand = Buffer.allocUnsafe(13);
                    moveCommand[0] = BinCommands.EntityManagerIO;
                    moveCommand[1] = 0;
                    moveCommand[2] = 0xAD; // drop
                    moveCommand.writeInt16LE(jc.id, 3);
                    moveCommand.writeFloatLE(jc.x, 5);
                    moveCommand.writeFloatLE(jc.y, 9);
                    runtime.broadcaster.broadcast(moveCommand);
                }
            });
        });

    }

    commands: Command[] = [{
        name: 'spawn',
        handler: (cmdarg, ...args) => {
            if (cmdarg.room.ext?.voronoi) return true;
            const { userp, user } = cmdarg;
            if (!this.plmodule) {
                send_system(userp, user, 'Jukebox was not enabled in this room');
                return true;
            }
            if (!cmdarg.room.jigchan) {
                send_system(userp, user, 'Jig-chan is not allowed in this room');
                return true;
            }
            const myjc = [...this.jigchans.values()].find(e => e.ownerip === userp.ipaddr);
            if (myjc) {
                send_system(userp, user, 'You already have a Jig-chan');
                return true;
            }

            if (cmdarg.room.endTime) {
                send_system(userp, user, 'The room has ended, so you cannot do that');
                return true;
            }
            let variant = 0;
            let skin: 'jig' | 'gie' = Math.random() >= 0.5 ? 'jig' : 'gie';
            let hair = skins[skin].hair[~~(Math.random() * skins[skin].hair.length)] as (typeof skins)[typeof skin]['hair'][number];
            let clo = skins[skin].clothes[~~(Math.random() * skins[skin].clothes.length)] as (typeof skins)[typeof skin]['clothes'][number];
            variant = skinToId(hair, clo);
            const ent = new JigChan({ owner: userp.ipaddr, w: cmdarg.room.boardWidth, h: cmdarg.room.boardHeight, variant });
            ent.id = this.gid++;
            ent.attach(cmdarg);
            this.jigchans.set(ent.id, ent);
            if (!this.logicUpdateInterval)
                this.logicUpdateInterval = setInterval(() => this.logicUpdate(cmdarg), 1000 / 30);

            const scratch = Buffer.alloc(16);
            scratch[0] = BinCommands.EntityManagerIO; // entity manager command
            scratch[1] = 0; // entity manager 0;
            scratch[2] = 0; // spawn entity;
            scratch.writeInt16LE(ent.id, 3);
            scratch.writeUint32LE(ent.variant, 5);
            cmdarg.runtime.broadcaster.broadcast(scratch.subarray(0, 9));

            scratch[2] = 3; // set position;
            scratch.writeFloatLE(ent.x, 5);
            scratch.writeFloatLE(ent.y, 9);
            cmdarg.runtime.broadcaster.broadcast(scratch.subarray(0, 13));

            const setJcCommand = Buffer.alloc(5);
            setJcCommand[0] = BinCommands.EntityManagerIO; // entity manager command
            setJcCommand[1] = 0; // entity manager 0;
            setJcCommand[2] = 4; // Set ID;
            setJcCommand.writeInt16LE(ent.id, 3);
            userp.conn.send(setJcCommand);
            return true;
        }
    }, {
        name: 'feed',
        named_params: ['qty', 'id'],
        handler: (cmdarg, ...args) => {
            const { userp, user } = cmdarg;
            if (cmdarg.room.ext?.voronoi) return false;
            if (!this.plmodule) {
                send_system(userp, user, 'Jukebox was not enabled in this room');
                return true;
            }
            if (cmdarg.room.endTime) {
                send_system(userp, user, 'The room has ended, so you cannot do that');
                return true;
            }
            const id = +args[1];
            const jc = this.jigchans.get(id);
            if (!jc) {
                send_system(userp, user, 'No such Jig-chan');
                return true;
            }

            const qty = +args[0] || 0;
            console.log(qty, id, this.plmodule.qtys[userp.ipaddr]);
            if (qty <= 0) {
                send_system(userp, user, 'Need to feed her something...');
                return true;
            }
            if (!this.plmodule.qtys[userp.ipaddr] || qty > this.plmodule.qtys[userp.ipaddr]) {
                send_system(userp, user, 'You cannot feed her that much, not enough points');
                return true;
            }
            jc.food += qty;

            jc.curr = jc.eat();

            this.plmodule.qtys[userp.ipaddr] -= qty;
            this.plmodule.send_points(userp);
            const ownerp = [...cmdarg.runtime.usersPriv.entries()].find(e => e[1].ipaddr == jc.ownerip);
            const owner = ownerp && cmdarg.runtime.users.find(e => e.id == ownerp[0]);
            let name = 'Someone';
            if (owner && ownerp)
                name = owner.name;

            userp.conn.send(JSON.stringify({
                type: "chat",
                // what am i doing with my life
                message: `Om nom nom! Thanks ${user.name}, that was delicious!`,
                name: ownerp?.[1].ipaddr == userp.ipaddr ? 'Your Jig-chan' : `${name}'s Jig-chan`,
                color: user.color,
                id: user.id
            }));
            return true;
        }
    }, {
        name: 'sudoku',
        desc: `
Usage: /sudoku
Effect: Makes your Jig-chan go sleep for a very long time`,
        handler: ({ state, runtime, userp, user }, ...args) => {
            const myjc = [...this.jigchans.values()].find(e => e.ownerip === userp.ipaddr);
            if (!myjc) {
                send_system(userp, user, 'You do not have a Jig-chan');
                return true;
            }

            // if (isDecember) {
            //     send_system(userp, user, 'Nuh-uh');
            //     return true;
            // }

            runtime.broadcaster.broadcast({
                type: "chat",
                message: Math.random() < 0.1 ? /*warning: JTL -> */ '恥をかかってしまってすみません...' : `I'm sorry for disappointing you...`,
                name: `${user.name}'s Jig-chan`,
                color: user.color,
                id: user.id
            });

            const despawnCommand = Buffer.alloc(5);
            despawnCommand[0] = BinCommands.EntityManagerIO; // entity manager command
            despawnCommand[1] = 0; // entity manager 0;
            despawnCommand[2] = 1; // despawn entity;
            despawnCommand.writeUint16LE(myjc.id, 3);
            runtime.broadcaster.broadcast(despawnCommand);
            this.jigchans.delete(myjc.id);
            if (this.jigchans.size == 0) {
                clearInterval(this.logicUpdateInterval!);
                delete this.logicUpdateInterval;
            }
            return true;
        }
    }];

    override serialize() {
        return {
            gid: this.gid,
            jigchans: [...this.jigchans.values()].map(j => j.serialize())
        };
    }

    override deserialize(d: ReturnType<JigChanModule['serialize']>): void {
        if (!d)
            return;
        this.gid = d.gid;
        this.jigchans = new Map(d.jigchans.map(e => {
            const jc = new JigChan({ w: 0, h: 0, owner: '', variant: e.variant || 5 });
            jc.restore(e);
            return [e.id, jc];
        }));
    }
}


type MoveJigChanStruct = ReturnType<typeof jigChanMoveStruct['parse']>;
type PatJigChanStruct = ReturnType<typeof jigChanPatStruct['parse']>;

// Pick/move/drop Jigchan
const moveJigChan: Handler<MoveJigChanStruct> = (payload, raw, user, room, state, runtime) => {
    const moduleInst = runtime.modules.find(module => module instanceof JigChanModule) as JigChanModule | undefined;
    if (!moduleInst) return;
    const jigchanid = payload.id;
    const jg = moduleInst.jigchans.get(jigchanid);
    if (!jg) return;
    switch (raw[0]) {
        case 0xAB: // pick
            if (jg.pickedBy)
                return;
            jg.pickedBy = user.user.id;
            jg.pickedAt = [jg.x, jg.y, Date.now()]
            jg.curr = jg.picked();
            break;
        case 0xAC: // move
            if (jg.pickedBy !== user.user.id)
                return;
            break;
        case 0xAD: { // drop
            if (jg.pickedBy !== user.user.id)
                return;
            delete jg.pickedBy;
            const currentCoord = [jg.x, jg.y] as vec2;
            const oldCoord = [jg.pickedAt![0], jg.pickedAt![1]] as vec2;
            const timeDelta = Date.now() - jg.pickedAt![2];
            const d = dist(oldCoord, currentCoord);
            if (d / (timeDelta * 0.001) > jg.pieceDim * 10) // if travelled over 10 pieces in one second on average
                jg.curr = jg.fall(); // maybe also make her hate you more?
            else
                jg.curr = jg.land();
            break;
        }
    }
    jg.x = payload.x;
    jg.y = payload.y;
    jg.x = clamp(0, jg.x, room.boardWidth);
    jg.y = clamp(0, jg.y, room.boardHeight);
    if (jg.x !== jg.x)
        jg.x = 0;
    if (jg.y !== jg.y)
        jg.y = 0;
    const moveCommand = Buffer.allocUnsafe(13);
    moveCommand[0] = BinCommands.EntityManagerIO;
    moveCommand[1] = 0;
    moveCommand[2] = raw[0] == 0xac ? 3 : raw[0];
    moveCommand.writeInt16LE(jigchanid, 3);
    moveCommand.writeFloatLE(jg.x, 5);
    moveCommand.writeFloatLE(jg.y, 9);
    runtime.broadcaster.broadcast(moveCommand, user);
};


const patJigChan: Handler<PatJigChanStruct> = (payload, raw, user, room, state, runtime) => {
    const moduleInst = runtime.modules.find(module => module instanceof JigChanModule) as JigChanModule | undefined;
    if (!moduleInst) return;
    const jigchanid = payload.id;
    const jg = moduleInst.jigchans.get(jigchanid);
    if (!jg) return;
    switch (raw[0]) {
        case 0xAE: // start pat
            if (jg.patBy !== undefined && jg.patBy !== user.user.id)
                return;
            jg.patBy = user.user.id;
            jg.curr = jg.pat(user);
            break;
        case 0xAF: // stop path
            if (jg.patBy !== user.user.id)
                return;
            delete jg.patBy;
            jg.curr = jg.behavior();
            break;
    }
    const patJcCommand = Buffer.allocUnsafe(5);
    patJcCommand[0] = BinCommands.EntityManagerIO;
    patJcCommand[1] = 0;
    patJcCommand[2] = 5 + raw[0] - 0xae; // 5 for start, 6 is stop
    patJcCommand.writeInt16LE(jigchanid, 3);
    runtime.broadcaster.broadcast(patJcCommand, user);

};

export default {
    [BinCommands.PickJigChan]: [jigChanMoveStruct, moveJigChan],
    [BinCommands.MoveJigChan]: [jigChanMoveStruct, moveJigChan],
    [BinCommands.DropJigChan]: [jigChanMoveStruct, moveJigChan],
    [BinCommands.StartPatJigChan]: [jigChanPatStruct, patJigChan],
    [BinCommands.StopPatJigChan]: [jigChanPatStruct, patJigChan],
} as const
