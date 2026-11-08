import { existsSync, watch } from "fs";
import { readFile } from "fs/promises";

import { Rectangle, RoomState, RoomRuntimeState, UserPrivate, vec2 } from "../types.js";
import { clamp, isInRectangle } from "../utils.js";
import { send_system } from "../room-utils.js";
import { ChatModule, Command, CommandRoomStateArg, CommandRoomStateUserArg } from "./index.js";
import { BinCommands } from "../types.js";
import { u8, struct, f32 } from "../core/binary.js";
import { Handler } from "../core/protocols/index.js";

let tracks: number[][] = [];
const attachedPollModules = new WeakMap<RoomRuntimeState, PollModule>();

const pollMoveStruct = struct({
    id: u8(),
    x: f32(),
    y: f32(),
});

const pollTouchStruct = struct({
    id: u8(),
});

function initTracks() {
    if (existsSync('./tracks')) {
        void (async () => {
            const buff = (await readFile('./tracks')).toString();
            tracks = JSON.parse(buff);
        })().catch(error => console.error("Failed to load poll tracks", error));

        watch('./tracks', async (r, fn) => {
            console.log('reloading tracks');
            if (r == 'change') {
                try {
                    const buff = (await readFile('./tracks')).toString();
                    tracks = JSON.parse(buff);
                } catch (error) {
                    console.error("Failed to reload poll tracks", error);
                }
            }
        });
    }
}
// Init tracks only if not in test environment or explicitly called? 
// For now, let's just export it and call it?
// But existing code expects it to run.
// We can check if we are in test?
if (process.env.NODE_ENV !== 'test') {
    initTracks();
}

export class PollModule extends ChatModule {
    name = 'polls';

    polling = false;
    zones: [label: string, region: Rectangle][] = [];
    kaos: { pos: vec2; heldBy?: number; }[] = [];

    question?: string;
    track?: number[];

    static instance: PollModule;

    constructor() {
        super();
        if (!PollModule.instance)
            PollModule.instance = this;
        return PollModule.instance;
    }

    private broadcastPollState(runtime: RoomRuntimeState, userp?: UserPrivate) {
        const message = `A poll has started! "${this.question}" Move the kitties to vote!`;
        if (userp) {
            send_system(userp, { color: '#ffffff', id: -1, name: 'bepis' }, message);
        } else {
            runtime.broadcaster.broadcast({
                type: "chat",
                message: message,
                name: 'System',
                color: '#ffffff',
                id: -1
            });
        }

        runtime.broadcaster.broadcast({
            type: "zones",
            zones: this.zones,
            question: this.question,
            track: this.track
        }, userp);

        const buff = Buffer.alloc(1 + this.kaos.length * 2 * 4);
        buff[0] = BinCommands.SetKaosList;
        let ptr = 1;
        for (const k of this.kaos) {
            for (const p of k.pos) {
                buff.writeFloatLE(p, ptr);
                ptr += 4;
            }
        }
        runtime.broadcaster.broadcast(buff, userp);
    }

    *setupPoll(runtime: RoomRuntimeState, choices: string[]) {
        for (const label of choices) {
            const region = (yield) as Rectangle;
            this.zones.push([label, region]);
        }
        this.polling = true;
        delete this.setupState;
        if (tracks.length > 0 && Math.random() < 0.66) {
            this.track = tracks[~~(Math.random() * tracks.length)];
        }
        this.broadcastPollState(runtime);
    }

    setupState?: Generator<undefined, void, Rectangle>;



    startPoll({ room, state, runtime, userp, user }: CommandRoomStateUserArg, ...args: string[]) {
        if (!userp.host.Poll) {
            send_system(userp, user, "Can't let you do that, Dave...");
            return true;
        }
        if (this.polling) { // allow to redo the poll if it wasn't set up
            send_system(userp, user, "There's already a poll pending...");
            return true;
        }
        const argstr = args.join(' ');
        let [question, ...choices] = argstr.split(';');
        if (choices.length < 2) {
            send_system(userp, user, "Need at least two choices");
            return true;
        }
        choices = choices.slice(0, 8);
        this.question = question;
        this.kaos = []; // reset in case startPoll is called multiple times without properly setting up
        this.zones = [];
        const bonus = ~~(runtime.users.length * Math.random()); // this is bonus!
        const kaocount = clamp(4, runtime.users.length + bonus, 252);
        for (let i = 0; i < kaocount; ++i) {
            this.kaos.push({
                pos: [Math.random() * room.boardWidth, Math.random() * room.boardHeight]
            });
        }
        this.setupState = this.setupPoll(runtime, choices);
        this.setupState.next(); // kickstart the generator so it settles at the first yield
        return true;
    }

    inputSetup({ userp, user }: CommandRoomStateUserArg, ...args: string[]) {
        if (!userp.host.Poll) {
            send_system(userp, user, "Can't let you do that, Dave...");
            return true;
        }
        if (!this.setupState) {
            send_system(userp, user, "Not currently setting up a poll...");
            return true;
        }
        if (args.length !== 4) {
            return true;
        }
        const rect = args.map(e => +e);
        this.setupState?.next([[rect[0], rect[1]], [rect[2], rect[3]]]);
        return true;
    }

    stopPoll({ room, state, runtime, userp, user }: CommandRoomStateUserArg, ...args: string[]) {
        if (!userp.host.Poll) {
            send_system(userp, user, "Can't let you do that, Dave...");
            return true;
        }
        if (!this.polling) {
            send_system(userp, user, "There's nothing to stop...");
            return true;
        }
        const results = new Map<string, number>();
        for (const kao of this.kaos) {
            // have fun making venn diagrams with rectangles
            for (const z of this.zones) {
                if (isInRectangle(kao.pos, z[1])) {
                    results.set(z[0], (results.get(z[0]) || 0) + 1);
                }
            }
        }

        runtime.broadcaster.broadcast({
            type: "chat",
            message: `Here are the results!
${([...results.entries()].sort((a, b) => b[1] - a[1]).map(kv => `${kv[0]}: ${kv[1]} votes`).join('\n'))}`,
            name: 'System',
            color: '#ffffff',
            id: -1
        })

        runtime.broadcaster.broadcast({ type: "zones", zones: [] });
        const buff = Buffer.alloc(1);
        buff[0] = BinCommands.SetKaosList; // empty list
        runtime.broadcaster.broadcast(buff);

        this.polling = false;
        this.kaos = [];
        this.zones = [];
        delete this.question;
        delete this.setupState;
        return true;
    }

    commands: Command[] = [{
        name: 'startpoll',
        desc: `
Usage: /startpoll [question];[choice1](;choiceN)*
Effect: Starts a poll when the required setup is done:^)
`, handler: this.startPoll.bind(this)
    }, {
        name: 'stoppoll',
        desc: `
Usage: /stoppoll
Effect: Stops the current poll and shows the results
    `, handler: this.stopPoll.bind(this)
    }, {
        name: 'setupZone',
        desc: `
Usage: /setupZone x1 y1 x2 y2
Effect:
`,
        handler: this.inputSetup.bind(this)
    }];

    override serialize() {
        return {
            question: this.question,
            polling: this.polling,
            zones: this.zones,
            kaos: this.kaos.map(kao => ({ pos: kao.pos })),
            track: this.track
        };
    }

    override deserialize(d: any): void {
        if (!d) return;
        this.polling = d.polling;
        this.zones = d.zones;
        this.kaos = d.kaos;
        this.question = d.question;
        this.track = d.track;
    }

    override attach({ state, runtime }: CommandRoomStateArg): void {
        attachedPollModules.set(runtime, this);
        runtime.events.addListener("connected", (up: UserPrivate) => {
            if (!this.polling)
                return;
            send_system(up, { color: '#ffffff', id: -1, name: 'bepis' }, `A poll has started! "${this.question}" Move the kitties to vote!`);
            up.conn.send(JSON.stringify({
                type: "zones",
                zones: this.zones,
                question: this.question,
                track: this.track
            }));
            const buff = Buffer.alloc(1 + this.kaos.length * 2 * 4);
            buff[0] = BinCommands.SetKaosList;
            let ptr = 1;
            for (const k of this.kaos) {
                for (const p of k.pos) {
                    buff.writeFloatLE(p, ptr);
                    ptr += 4;
                }
            }
            up.conn.send(buff);
        });
        runtime.events.addListener("leave", (up: UserPrivate) => {
            for (const kao of this.kaos) {
                if (kao.heldBy === up.user.id)
                    delete kao.heldBy;
            }
        });
    }
}

type PollMoveStruct = ReturnType<typeof pollMoveStruct['parse']>;
type PollTouchStruct = ReturnType<typeof pollTouchStruct['parse']>;
const kaomove: Handler<PollMoveStruct> = (payload, raw, user, room, state, runtime) => {
    const inst = attachedPollModules.get(runtime)
        || runtime.modules.find(module => module instanceof PollModule) as PollModule | undefined;
    if (!inst) return;
    // cmdid:1,kaoid:1,nx:4f,ny:4f
    const kid = payload.id;
    if (kid >= inst.kaos.length)
        return; // stops processing this buffer further
    const kao = inst.kaos[kid];
    if (!Number.isFinite(payload.x) || !Number.isFinite(payload.y))
        return;
    if (kao.heldBy === undefined)
        kao.heldBy = user.user.id;
    else if (kao.heldBy !== user.user.id)
        return;

    kao.pos[0] = clamp(0, payload.x, room.boardWidth);
    kao.pos[1] = clamp(0, payload.y, room.boardHeight);
    const outbound = Buffer.allocUnsafe(10);
    outbound[0] = BinCommands.PollMove;
    outbound.writeUInt8(kid, 1);
    outbound.writeFloatLE(kao.pos[0], 2);
    outbound.writeFloatLE(kao.pos[1], 6);
    runtime.broadcaster.broadcast(outbound, user, false);
};

const kaohold: Handler<PollTouchStruct> = (payload, raw, user, room, state, runtime) => {
    const inst = attachedPollModules.get(runtime)
        || runtime.modules.find(module => module instanceof PollModule) as PollModule | undefined;
    if (!inst) return;
    // cmdid:2,kaoid:1
    const kid = payload.id;
    if (kid >= inst.kaos.length)
        return; // stops processing this buffer further
    const kao = inst.kaos[kid];
    if (raw[0] === BinCommands.PollHold) {
        if (kao.heldBy !== undefined && kao.heldBy !== user.user.id) return;
        kao.heldBy = user.user.id;
    } else {
        if (kao.heldBy !== user.user.id) return;
        delete kao.heldBy;
    }
    runtime.broadcaster.broadcast(raw, user, false);
};

export default {
    [BinCommands.PollMove]: [pollMoveStruct, kaomove],
    [BinCommands.PollHold]: [pollTouchStruct, kaohold],
    [BinCommands.PollRelease]: [pollTouchStruct, kaohold],
} as const
