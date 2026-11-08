import { BinCommands, Group, PSet, Room, User, UserPrivate } from "../types.js";
import { ChatModule, Command, CommandRoomStateArg } from "./index.js";
import { deserializeEBinaryRepr } from "../mut.js";
import { Binary } from "mongodb";
import { struct, u16 } from "../core/binary.js";
import { Handler } from "../core/protocols/index.js";

const sanitize = (sets: PSet[], groups: Group[]) => {
    if (sets.length <= 1)
        return;
    // normally, the indices are 0-indexed per set, but 
    // a now patched client-side bug causes them to be the same as ids
    // so we detect if we need to fixup the indices 
    if (groups.some(g => g.set === 1 && g.indices.includes(0)))
        return; // no fixup needed
    const bases = new Map<number, number>();
    let b = 0;
    for (let i = 0; i < sets.length; ++i) {
        const s = sets[i];
        bases.set(i, b);
        b += s.cols * s.rows;
    }
    for (let g of groups) {
        for (let i = 0; i < g.indices.length; ++i)
            g.indices[i] -= bases.get(g.set)!;
    }
}

export class RollbackModule extends ChatModule {
    name = 'rollback';

    backups: Room[] = [];

    commands: Command[] = [{
        name: 'revert',
        named_params: ['x'],
        desc: `
Usage: /revert [x=0]
Effect: This command does not exist anymore.
`,
        handler: ({ room, userp, user, state }, ...args) => {
            if (!userp.host.Rollback) return false;
            userp.conn.send((JSON.stringify({
                type: "chat",
                message: 'This command does not exist anymore, use the top-left menu to revert',
                name: 'System',
                color: user.color,
                id: user.id
            })));
            return true;
        }
    }, {
        name: 'resync',
        named_params: [],
        desc: `
Usage: /resync
Effect: Resyncs the board state with all the clients. All selected pieces will be dropped.
`,
        handler: ({ room, userp, state, runtime }, ...args) => {
            if (!userp.host.Rollback) return false;
            runtime.broadcaster.broadcast({ type: "room", room });
            return true;
        }
    }];

    override serialize() {
        return this.backups;
    }

    startup() {
    }

    override deserialize(d: any): void {
    }
}

// dummy just to get the raw payload
const emptyStruct = struct({});

const doRevert: Handler<ReturnType<typeof emptyStruct['parse']>> = (pl, raw, user, room, state, runtime) => {
    if (!user.host.Rollback) return;
    if (room.endTime) return;
    const groups = deserializeEBinaryRepr(new Binary(raw.subarray(1) as any), room.ext?.rotting);
    sanitize(room.sets, groups);
    room.groups = groups;
    const transformedgroups = runtime.transformedgroups;
    transformedgroups.clear();
    runtime.lastMovedGroups.clear();
    runtime.groupowners.clear();
    runtime.groupownersbyip.clear();
    state.frameGroupIds = [];
    delete state.endstats;
    for (const g of room.groups) {
        transformedgroups.set(g.id, g);
        for (const c of g.ids) {
            transformedgroups.set(c, g);
        }
        const set = room.sets[g.set];
        if (g.indices.length >= 3 * Math.min(set.cols, set.rows)) {
            const corners = new Set([
                0,
                set.cols - 1,
                (set.rows - 1) * set.cols,
                set.cols * set.rows - 1
            ]);
            for (const index of g.indices) corners.delete(index);
            if (corners.size === 0) state.frameGroupIds.push(g.id);
        }
    }
    runtime.broadcaster.broadcast({ type: "room", room });
};

export default {
    [BinCommands.Revert]: [emptyStruct, doRevert]
} as const;