import { banuser, forceRoomSync } from "../../room-utils.js";
import { Handler } from "./index.js";
import { BinCommands, Group } from "../../types.js";
import { struct, u16 } from "../binary.js";
import { doDisconnect } from "../../connectionFlow.js";

const selectStruct = struct({
    id: u16(),
    gids: u16(-1)
});

type SelectStruct = ReturnType<typeof selectStruct['parse']>;

const handleSelect: Handler<SelectStruct> = (payload, raw, user, room, state, runtime) => {
    if (raw.length < 3 || (raw.length - 3) % 2 !== 0) return;

    const groups: Group[] = [];
    const rejectedGids: number[] = [];
    const seen = new Set<number>();
    for (const requestedGid of payload.gids) {
        const a = runtime.transformedgroups.get(requestedGid);
        if (!a || requestedGid !== a.id) {
            forceRoomSync(state, room, user);
            return;
        }
        if (seen.has(a.id)) continue;
        seen.add(a.id);

        if (raw[0] === BinCommands.Select) {
            if (a.locked || (a.selected !== undefined && a.selected !== false && a.selected !== user.user.id)) {
                // Piece was locked or grabbed by someone else while this select was
                // in flight. Skip it and revert the sender's optimistic selection
                // with a targeted release instead of a full room resync.
                rejectedGids.push(a.id);
                continue;
            }
        } else {
            if (a.selected === undefined || a.selected === false) continue; // already deselected, states agree
            if (a.selected !== user.user.id && !user.host.ChangeRoomSettings) continue; // not theirs to deselect
        }
        groups.push(a);
    }

    if (raw[0] === BinCommands.Select && rejectedGids.length) {
        const revert = Buffer.allocUnsafe(3 + rejectedGids.length * 2);
        revert[0] = BinCommands.ForceRelease;
        revert.writeUInt16LE(user.user.id, 1);
        rejectedGids.forEach((gid, i) => revert.writeUInt16LE(gid, 3 + i * 2));
        user.conn.send(revert);
    }

    if (raw[0] === BinCommands.Select) {
        let batchStopped = false;
        runtime.events.emit("preselectbatch", {
            groups,
            userpriv: user,
            preventDefault: () => { batchStopped = true; }
        });
        if (batchStopped) return;
    }

    const affected = raw[0] === BinCommands.Select
        ? groups.filter(group => {
            if (group.selected === user.user.id) return false;
            let stop = false;
            runtime.events.emit('preselect', { preventDefault() { stop = true; }, group, userpriv: user });
            return !stop;
        })
        : groups;
    if (affected.length === 0) return;

    if (raw[0] === BinCommands.Select && room.norectselect && !user.host.ChangeRoomSettings)
        try {
            user.selects.use(affected.length);
        } catch {
            banuser(state, runtime, room, user, "selected too much", () => doDisconnect(user, 'selecting pieces too fast'));
            return;
        }

    const now = Date.now();
    for (const group of affected) {
        if (raw[0] === BinCommands.Select) {
            group.selected = user.user.id;
            const ownership = runtime.groupowners.get(group.id);
            if (ownership) {
                if (ownership.co !== user.ipaddr) {
                    ownership.pp = [group.x, group.y];
                    ownership.co = user.ipaddr;
                    ownership.ref = group;
                    ownership.t = now;
                }
            } else {
                runtime.groupowners.set(group.id, {
                    ref: group,
                    pp: [group.x, group.y],
                    co: user.ipaddr,
                    t: now
                });
            }
        } else {
            delete group.selected;
            delete group.dragged;
        }
    }

    const outbound = Buffer.allocUnsafe(3 + affected.length * 2);
    outbound[0] = raw[0]!;
    outbound.writeUInt16LE(user.user.id, 1);
    affected.forEach((group, index) => outbound.writeUInt16LE(group.id, 3 + index * 2));
    runtime.broadcaster.broadcast(outbound, user);
}

const forceRelease: Handler<SelectStruct> = (payload, raw, user, room, state, runtime) => {
    if (raw.length < 3 || (raw.length - 3) % 2 !== 0) return;

    const groups: Group[] = [];
    const seen = new Set<number>();
    for (const requestedGid of payload.gids) {
        const a = runtime.transformedgroups.get(requestedGid);
        if (!a || requestedGid !== a.id) {
            forceRoomSync(state, room, user);
            return;
        }
        if (seen.has(a.id)) continue;
        seen.add(a.id);
        groups.push(a);
    }

    const released: number[] = [];
    for (const a of groups) {
        // if you steal from someone, you're forced to commit to the stolen piece, makes the code easier
        let stop = false;
        runtime.events.emit('forceRelease', { preventDefault() { stop = true; }, group: a, user });
        if (stop) continue;
        delete a.selected;
        delete a.dragged;
        released.push(a.id);
    }

    if (released.length === 0) return;
    const outbound = Buffer.allocUnsafe(3 + released.length * 2);
    outbound[0] = BinCommands.ForceRelease;
    outbound.writeUInt16LE(user.user.id, 1);
    released.forEach((gid, i) => outbound.writeUInt16LE(gid, 3 + i * 2));
    runtime.broadcaster.broadcast(outbound);
    return;
}

export default {
    [BinCommands.Select]: [selectStruct, handleSelect],
    [BinCommands.Deselect]: [selectStruct, handleSelect],
    [BinCommands.ForceRelease]: [selectStruct, forceRelease]
} as const