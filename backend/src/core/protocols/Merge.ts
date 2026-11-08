import { clamp, extractFromArray, forceRoomSync } from "../../room-utils.js";
import { Group, Room, RoomRuntimeState, RoomState, UserPrivate } from "../../types.js";
import { f32, struct, u16 } from "../binary.js";
import { BinCommands } from "../../types.js";
import { getGroupSize } from "./arrangePieces.js";

/* 
Returns false on fail
Returns true on solve
Can fail because of invalid arguments
Can fail
*/

const mergePieces = (runtime: RoomRuntimeState,
    roomstate: RoomState,
    thisroom: Room,
    a: Group | undefined,
    b: Group | undefined,
    npos: [number, number],
    userpriv: UserPrivate
) => {
    // 1. Pure state mutation

    // 1.1 Basic checks
    const transformedgroups = runtime.transformedgroups;
    if (!a || !b || a === b || a.set !== b.set) return false;
    const r2 = runtime;
    const set = thisroom.sets[a.set]!;
    if (!set.sites?.length) {
        const bIndices = new Set(b.indices);
        const areAdjacent = a.indices.some(index => {
            const col = index % set.cols;
            const row = Math.floor(index / set.cols);
            return (col > 0 && bIndices.has(index - 1))
                || (col < set.cols - 1 && bIndices.has(index + 1))
                || (row > 0 && bIndices.has(index - set.cols))
                || (row < set.rows - 1 && bIndices.has(index + set.cols));
        });
        if (!areAdjacent) {
            forceRoomSync(roomstate, thisroom, userpriv);
            return false;
        }
    }
    if (a.rot !== b.rot || !!a.f !== !!b.f) {
        forceRoomSync(roomstate, thisroom, userpriv);
        return false;
    }
    // Locked groups are intentionally NOT rejected here: attaching a dropped
    // piece to a locked group is a core mechanic (the merged group inherits
    // the lock, see `lock` below), and chain merges within one drop can make
    // either side - even both - locked (a piece bridging locked clusters).
    // Dragging a locked group is already prevented at the Movement layer.
    if ((a.selected !== undefined && a.selected !== false && a.selected !== userpriv.user.id)
        || (b.selected !== undefined && b.selected !== false && b.selected !== userpriv.user.id)
        || (a.dragged !== undefined && a.dragged !== false)
        || (b.dragged !== undefined && b.dragged !== false)) {
        forceRoomSync(roomstate, thisroom, userpriv);
        return false;
    }

    try {
        r2.events.emit("premerge", userpriv, a, b);
    } catch (e) {
        console.error(e);
        return false;
    }

    // 1.2 Merge logic
    const r = Math.min(a.id, b.id);
    a.id = Math.max(a.id, b.id);
    a.indices.push(...b.indices);
    const lock = a.locked || b.locked;
    a.ids.push(...b.ids);
    a.ids.push(r);
    extractFromArray(thisroom.groups, b);
    a.locked = lock;
    transformedgroups.set(a.id, a);
    for (const c of a.ids)
        transformedgroups.set(c, a);
    let { w: groupWidth, h: groupHeight } = getGroupSize(a, thisroom);
    if (a.rot === 1 || a.rot === 3)
        [groupWidth, groupHeight] = [groupHeight, groupWidth];
    npos[0] = groupWidth >= thisroom.boardWidth
        ? thisroom.boardWidth / 2
        : clamp(groupWidth / 2, npos[0], thisroom.boardWidth - groupWidth / 2);
    npos[1] = groupHeight >= thisroom.boardHeight
        ? thisroom.boardHeight / 2
        : clamp(groupHeight / 2, npos[1], thisroom.boardHeight - groupHeight / 2);
    a.x = npos[0];
    a.y = npos[1];
    delete a.selected;
    delete a.dragged;
    delete a.dragStartX;
    delete a.dragStartY;
    delete b.selected;
    delete b.dragged;
    delete b.dragStartX;
    delete b.dragStartY;
    return { removedId: r };
}

const mergeStruct = struct({
    id: u16(),
    solv: u16(),
    merge: u16(),
    npos: f32(2),
});

type MergeStruct = ReturnType<typeof mergeStruct['parse']>

const handleMerge = (
    payload: MergeStruct,
    raw: Buffer,
    user: UserPrivate,
    room: Room,
    state: RoomState,
    runtime: RoomRuntimeState,
) => {
    if (raw.length !== 15 || !Number.isFinite(payload.npos[0]) || !Number.isFinite(payload.npos[1])) {
        forceRoomSync(state, room, user);
        return;
    }

    const a = runtime.transformedgroups.get(payload.solv);
    const b = runtime.transformedgroups.get(payload.merge);
    if (!a || !b || a === b) {
        forceRoomSync(state, room, user);
        return;
    }
    if (payload.solv !== a.id || payload.merge !== b.id) {
        forceRoomSync(state, room, user);
        return;
    }

    const solv = a.id;
    const merge = b.id;
    const npos: [number, number] = [payload.npos[0], payload.npos[1]];
    const result = mergePieces(runtime, state, room, a, b, npos, user);
    if (!result) return;

    if (!room.startTime) {
        room.startTime = Date.now();
        try {
            runtime.events.emit("setStart");
        } catch (error) {
            console.error("Game-start listener failed", error);
        }
        runtime.broadcaster.broadcast({
            type: "update",
            room: { startTime: room.startTime }
        });
    }
    user.solvedDone = true;
    const outbound = Buffer.allocUnsafe(15);
    outbound[0] = BinCommands.Merge;
    outbound.writeUInt16LE(user.user.id, 1);
    outbound.writeUInt16LE(solv, 3);
    outbound.writeUInt16LE(merge, 5);
    outbound.writeFloatLE(npos[0], 7);
    outbound.writeFloatLE(npos[1], 11);
    runtime.broadcaster.broadcast(outbound, user);
    if (npos[0] !== payload.npos[0] || npos[1] !== payload.npos[1]) {
        user.conn.send(JSON.stringify({
            type: "position_correction",
            groups: [{ id: a.id, x: a.x, y: a.y }]
        }));
    }
    try {
        runtime.events.emit("joined", user, a, b, result.removedId);
    } catch (error) {
        console.error("Post-merge listener failed", error);
    }
}

export default {
    [BinCommands.Merge]: [mergeStruct, handleMerge]
} as const