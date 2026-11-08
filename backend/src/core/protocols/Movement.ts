import { Group, GroupOwnershipInfo } from "../../types.js";
import { Handler } from "./index.js";
import { BinCommands } from "../../types.js";
import { clamp } from "../../utils.js";
import { forceRoomSync } from "../../room-utils.js";
import { f32, struct, u16 } from "../binary.js";
import {
    arrangePiecesMoveDelta,
    arrangePiecesOrder,
    arrangePiecesPack,
    arrangePiecesSpread,
    getGroupSize
} from "./arrangePieces.js";

const moveStruct = struct({
    id: u16(),
    items: struct({
        gid: u16(),
        x: f32(),
        y: f32()
    })(-1)
});

const moveDeltaStruct = struct({
    id: u16(),
    dx: f32(),
    dy: f32(),
    gids: u16(-1)
});

const moveCommandStruct = struct({
    id: u16(),
    state: f32()
});

type MoveStruct = ReturnType<typeof moveStruct['parse']>;

const handleMove: Handler<MoveStruct> = (
    payload, raw, user, room, state, runtime) => {
    if (raw.length < 13 || (raw.length - 3) % 10 !== 0) {
        console.log("reject because of length mismatch");
        return;
    }
    const resolvedgroups: {
        group: Group;
        x: number;
        y: number;
        corrected: boolean;
    }[] = [];
    const seen = new Set<number>();
    const newlyrottinggroups: Buffer[] = [];
    // Items that lost a race (piece got locked/grabbed by someone else while this
    // command was in flight). These are skipped and answered with a targeted
    // position correction instead of a full room resync: the broadcast that made
    // them invalid (LOCK/SELECT/PICK) is already queued to this client, so only
    // the position needs to be snapped back.
    const raced: Group[] = [];

    for (const item of payload.items) {
        if (!Number.isFinite(item.x) || !Number.isFinite(item.y)) {
            forceRoomSync(state, room, user);
            return;
        }

        const tg = runtime.transformedgroups.get(item.gid);
        // structurally invalid references mean the client state is truly broken
        if (!tg) {
            forceRoomSync(state, room, user);
            return;
        }
        if (item.gid !== tg.id) {
            forceRoomSync(state, room, user);
            return;
        }
        if (seen.has(tg.id)) continue;
        seen.add(tg.id);

        const selectedByOther = tg.selected !== undefined && tg.selected !== false && tg.selected !== user.user.id;
        const draggedByOther = tg.dragged !== undefined && tg.dragged !== false && tg.dragged !== user.user.id;
        const draggedBySelf = tg.dragged === user.user.id;
        const selectedBySelf = tg.selected === user.user.id;

        if (tg.locked || selectedByOther || draggedByOther) {
            raced.push(tg);
            continue;
        }
        if (raw[0] !== BinCommands.Pick && !draggedBySelf && !selectedBySelf) {
            // Move/Drop on a piece the server never granted to this user.
            // Happens when a lock/steal/release raced the command; skip and snap back.
            // (Move is allowed while dragging OR while selected: Space
            // organize/spread/pack sends Move on selected pieces that are not dragged.)
            raced.push(tg);
            continue;
        }

        let { w: groupWidth, h: groupHeight } = getGroupSize(tg, room);
        if (tg.rot === 1 || tg.rot === 3)
            [groupWidth, groupHeight] = [groupHeight, groupWidth];
        const x = groupWidth >= room.boardWidth
            ? room.boardWidth / 2
            : clamp(groupWidth / 2, item.x, room.boardWidth - groupWidth / 2);
        const y = groupHeight >= room.boardHeight
            ? room.boardHeight / 2
            : clamp(groupHeight / 2, item.y, room.boardHeight - groupHeight / 2);

        resolvedgroups.push({
            group: tg,
            x,
            y,
            corrected: x !== item.x || y !== item.y
        });
    }

    if (raced.length) {
        // Snap only the raced pieces back on the sender's screen. The state
        // change that caused the race (lock/select broadcast) is delivered
        // reliably on its own, so no full room resync is needed.
        user.conn.send(JSON.stringify({
            type: "position_correction",
            groups: raced.map(g => ({ id: g.id, x: g.x, y: g.y }))
        }));
    }

    let batchStopped = false;
    runtime.events.emit("premovebatch", {
        groups: resolvedgroups.map(({ group }) => group),
        userpriv: user,
        preventDefault: () => { batchStopped = true; }
    });
    if (batchStopped) return;

    const affectedgroups = resolvedgroups.filter(({ group }) => {
        let stop = false;
        runtime.events.emit('premove', { preventDefault: () => { stop = true; }, userpriv: user, a: group });
        return !stop;
    });
    if (affectedgroups.length === 0) return;

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

    const now = Date.now();
    for (const { group: tg, x, y } of affectedgroups) {
        let v;
        // eslint-disable-next-line no-cond-assign
        if (v = runtime.groupowners.get(tg.id)) {
            // this group has an owner
            if (v.co !== user.ipaddr) {
                // owner isn't this player
                v.ref = tg;
                v.pp = [tg.x, tg.y];
                v.co = user.ipaddr;
                v.t = now;
            }
        } else { // group never had an owner
            const val: GroupOwnershipInfo = {
                ref: tg,
                pp: [tg.x, tg.y],
                co: user.ipaddr,
                t: now
            };
            runtime.groupowners.set(tg.id, val);
        }

        v = runtime.lastMovedGroups.get(tg);
        if (!v || v.userId !== user.user.id) {
            // only way to refresh is grabbing the group from another IP
            runtime.lastMovedGroups.set(tg, {
                ip: user.ipaddr,
                userId: user.user.id,
                time: now,
                prev: [tg.x, tg.y]
            });
        }
        tg.x = x;
        tg.y = y;
        if (room.ext?.rotting && !tg.rotp) {
            tg.rotp = now;
            const b = Buffer.alloc(10);
            b.writeUint16LE(tg.id);
            b.writeDoubleLE(tg.rotp, 2);
            newlyrottinggroups.push(b);
        }

        switch (raw[0]) {
            case BinCommands.Pick:
                tg.dragStartX = x;
                tg.dragStartY = y;
                tg.dragged = user.user.id;
                break;
            case BinCommands.Move:
                // Keep existing drag ownership, but do not acquire it for selected-only moves
                // (Space organize/spread). Claiming drag here breaks subsequent ctrl-click lock.
                break;
            case BinCommands.Drop:
                delete tg.dragged;
                break;
        }
    }

    if (affectedgroups.length === 1 && raw[0] !== BinCommands.Move) {
        try {
            runtime.events.emit(raw[0] === BinCommands.Pick ? "picked" : "dropped", user, affectedgroups[0].group.id);
        } catch (error) {
            console.error("Post-movement listener failed", error);
        }
    }

    const outbound = Buffer.allocUnsafe(3 + affectedgroups.length * 10);
    outbound[0] = raw[0]!;
    outbound.writeUInt16LE(user.user.id, 1);
    let ptr = 3;
    for (const { group, x, y } of affectedgroups) {
        outbound.writeUInt16LE(group.id, ptr);
        outbound.writeFloatLE(x, ptr + 2);
        outbound.writeFloatLE(y, ptr + 6);
        ptr += 10;
    }
    runtime.broadcaster.broadcast(outbound, user, raw[0] !== BinCommands.Move);
    if (affectedgroups.some(item => item.corrected)) {
        user.conn.send(JSON.stringify({
            type: "position_correction",
            groups: affectedgroups.map(({ group, x, y }) => ({ id: group.id, x, y }))
        }));
    }
    if (newlyrottinggroups.length) {
        // 0x61: ROT_UPDATE
        runtime.broadcaster.broadcast(Buffer.concat([Buffer.from([0x61]), ...newlyrottinggroups]) as any);
    }
};

export default {
    [BinCommands.Pick]: [moveStruct, handleMove],
    [BinCommands.Move]: [moveStruct, handleMove],
    [BinCommands.Drop]: [moveStruct, handleMove],
    [BinCommands.MoveDelta]: [moveDeltaStruct, arrangePiecesMoveDelta],
    [BinCommands.MoveAlign]: [moveCommandStruct, arrangePiecesOrder],
    [BinCommands.MoveStack]: [moveCommandStruct, arrangePiecesPack],
    [BinCommands.MoveScatter]: [moveCommandStruct, arrangePiecesSpread],
} as const