import { banuser, forceRoomSync } from "../../room-utils.js";
import { Handler } from "./index.js";
import { BinCommands, Group } from "../../types.js";
import { struct, u16, u8 } from "../binary.js";
import { doDisconnect } from "../../connectionFlow.js";

const rotStruct = struct({
    id: u16(),
    items: struct({
        gid: u16(),
        rot: u8()
    })(-1)
});

type RotStruct = ReturnType<typeof rotStruct['parse']>;

const handleRotation: Handler<RotStruct> = (payload, raw, user, room, state, runtime) => {
    if (raw.length < 6 || (raw.length - 3) % 3 !== 0) return;
    if (!room.rotation) {
        banuser(state, runtime, room, user, 'rotate pieces in non rotate', () => doDisconnect(user, 'rotate pieces in non rotate'));
        return;
    }

    const rotations: { id: number; rot: number; group: Group }[] = [];
    const rejected: { id: number; rot: number }[] = [];
    const seen = new Set<number>();
    for (const item of payload.items) {
        const a = runtime.transformedgroups.get(item.gid);
        if (!a || item.gid !== a.id) {
            forceRoomSync(state, room, user);
            return;
        }
        if (seen.has(a.id)) continue;
        seen.add(a.id);
        if (item.rot > 3) {
            forceRoomSync(state, room, user);
            return;
        }
        if (a.locked) {
            // Piece got locked while the rotate was in flight: skip it and echo
            // its current rotation back to the sender instead of a full resync.
            rejected.push({ id: a.id, rot: a.rot || 0 });
            continue;
        }
        rotations.push({ id: a.id, rot: item.rot, group: a });
    }
    if (rejected.length) {
        const revert = Buffer.allocUnsafe(3 + rejected.length * 3);
        revert[0] = BinCommands.Rotate;
        revert.writeUInt16LE(user.user.id, 1);
        rejected.forEach(({ id, rot }, i) => {
            revert.writeUInt16LE(id, 3 + i * 3);
            revert.writeUInt8(rot, 5 + i * 3);
        });
        user.conn.send(revert);
    }
    if (rotations.length === 0) return;

    rotations.forEach(({ group, rot }) => group.rot = rot);
    const outbound = Buffer.allocUnsafe(3 + rotations.length * 3);
    outbound[0] = BinCommands.Rotate;
    outbound.writeUInt16LE(user.user.id, 1);
    rotations.forEach(({ id, rot }, i) => {
        outbound.writeUInt16LE(id, 3 + i * 3);
        outbound.writeUInt8(rot, 5 + i * 3);
    });
    runtime.broadcaster.broadcast(outbound);
}

const handleFlip: Handler<RotStruct> = (payload, raw, user, room, state, runtime) => {
    if (raw.length < 6 || (raw.length - 3) % 3 !== 0) return;
    if (!room.flipping) {
        banuser(state, runtime, room, user, 'flipping pieces in non flipping', () => doDisconnect(user, 'flipping pieces in non flipping'));
        return;
    }

    const flips: { id: number; flipped: boolean; group: Group }[] = [];
    const rejected: { id: number; flipped: boolean }[] = [];
    const seen = new Set<number>();
    for (const item of payload.items) {
        const a = runtime.transformedgroups.get(item.gid);
        if (!a || item.gid !== a.id) {
            forceRoomSync(state, room, user);
            return;
        }
        if (seen.has(a.id)) continue;
        seen.add(a.id);
        if (item.rot > 1) {
            forceRoomSync(state, room, user);
            return;
        }
        if (a.locked) {
            rejected.push({ id: a.id, flipped: !!a.f });
            continue;
        }
        flips.push({ id: a.id, flipped: item.rot !== 0, group: a });
    }
    if (rejected.length) {
        const revert = Buffer.allocUnsafe(3 + rejected.length * 3);
        revert[0] = BinCommands.Flip;
        revert.writeUInt16LE(user.user.id, 1);
        rejected.forEach(({ id, flipped }, i) => {
            revert.writeUInt16LE(id, 3 + i * 3);
            revert.writeUInt8(flipped ? 1 : 0, 5 + i * 3);
        });
        user.conn.send(revert);
    }
    if (flips.length === 0) return;

    flips.forEach(({ group, flipped }) => group.f = flipped);
    const outbound = Buffer.allocUnsafe(3 + flips.length * 3);
    outbound[0] = BinCommands.Flip;
    outbound.writeUInt16LE(user.user.id, 1);
    flips.forEach(({ id, flipped }, i) => {
        outbound.writeUInt16LE(id, 3 + i * 3);
        outbound.writeUInt8(flipped ? 1 : 0, 5 + i * 3);
    });
    runtime.broadcaster.broadcast(outbound);
}

export default {
    [BinCommands.Rotate]: [rotStruct, handleRotation],
    [BinCommands.Flip]: [rotStruct, handleFlip]
} as const