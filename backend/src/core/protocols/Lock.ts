import { Handler } from "./index.js";
import { BinCommands, Group } from "../../types.js";
import { struct, u16 } from "../binary.js";
import { forceRoomSync } from "../../room-utils.js";

const lockStruct = struct({
    id: u16(),
    gids: u16(-1)
});

type LockStruct = ReturnType<typeof lockStruct['parse']>;

const handleLock: Handler<LockStruct> = (
    payload,
    raw,
    user,
    room,
    state,
    runtime,
) => {
    if (room.nolockunlock && !user.host.ChangeRoomSettings) {
        forceRoomSync(state, room, user);
        return;
    }
    if (raw.length < 3 || (raw.length - 3) % 2 !== 0) return;

    const locking = raw[0] === BinCommands.Lock;
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
        if (!!a.locked === locking) continue; // already in the requested state
        if (locking) {
            const selectedByOther = a.selected !== undefined && a.selected !== false && a.selected !== user.user.id;
            const draggedByOther = a.dragged !== undefined && a.dragged !== false && a.dragged !== user.user.id;
            if (selectedByOther || draggedByOther) {
                // Someone else is using the piece: don't lock it, and revert the
                // sender's optimistic lock with a targeted unlock instead of
                // nuking them with a full room resync.
                rejectedGids.push(a.id);
                continue;
            }
        }
        groups.push(a);
    }

    if (rejectedGids.length) {
        const revert = Buffer.allocUnsafe(3 + rejectedGids.length * 2);
        revert[0] = BinCommands.Unlock;
        revert.writeUInt16LE(user.user.id, 1);
        rejectedGids.forEach((gid, i) => revert.writeUInt16LE(gid, 3 + i * 2));
        user.conn.send(revert);
    }

    if (groups.length === 0) return;
    const gids: number[] = [];
    for (const a of groups) {
        if (locking) {
            // Clear own selection/drag so ctrl-click lock is not racey with a preceding deselect.
            delete a.selected;
            delete a.dragged;
        }
        a.locked = locking;
        gids.push(a.id);
    }

    const outbound = Buffer.allocUnsafe(3 + gids.length * 2);
    outbound[0] = raw[0]!;
    outbound.writeUInt16LE(user.user.id, 1);
    gids.forEach((gid, i) => outbound.writeUInt16LE(gid, 3 + i * 2));
    runtime.broadcaster.broadcast(outbound);
}

export default {
    [BinCommands.Lock]: [lockStruct, handleLock],
    [BinCommands.Unlock]: [lockStruct, handleLock]
} as const