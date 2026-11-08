import { EventEmitter } from "events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BinCommands } from "../src/types.js";
import Movement from "../src/core/protocols/Movement.js";
import Merge from "../src/core/protocols/Merge.js";
import Lock from "../src/core/protocols/Lock.js";
import Select from "../src/core/protocols/Select.js";
import Rotation from "../src/core/protocols/Rotation.js";
import Heartbeat from "../src/core/protocols/Heartbeat.js";
import { Game, revealCensoredGroups } from "../src/core/protocols/Game.js";
import { estimateClockDrift } from "../src/core/clock.js";
import { forceRoomSync } from "../src/room-utils.js";

vi.mock("../src/room-utils.js", () => ({
    clamp: (min: number, value: number, max: number) => Math.min(Math.max(min, value), max),
    extractFromArray: (array: unknown[], value: unknown) => {
        const index = array.indexOf(value);
        if (index >= 0) array.splice(index, 1);
    },
    forceRoomSync: vi.fn(),
    banuser: vi.fn(),
}));

vi.mock("../src/connectionFlow.js", () => ({
    doDisconnect: vi.fn(),
}));

vi.mock("../src/room.js", () => ({
    roomstate: {},
}));

const run = (implementations: any, command: BinCommands, raw: Buffer, user: any, room: any, state: any, runtime: any) => {
    const [parser, handler] = implementations[command];
    handler(parser.parse(raw, 1), raw, user, room, state, runtime);
};

const positionPacket = (command: BinCommands, userId: number, items: { id: number; x: number; y: number }[]) => {
    const raw = Buffer.alloc(3 + items.length * 10);
    raw[0] = command;
    raw.writeUInt16LE(userId, 1);
    items.forEach((item, index) => {
        const offset = 3 + index * 10;
        raw.writeUInt16LE(item.id, offset);
        raw.writeFloatLE(item.x, offset + 2);
        raw.writeFloatLE(item.y, offset + 6);
    });
    return raw;
};

const idPacket = (command: BinCommands, userId: number, ids: number[]) => {
    const raw = Buffer.alloc(3 + ids.length * 2);
    raw[0] = command;
    raw.writeUInt16LE(userId, 1);
    ids.forEach((id, index) => raw.writeUInt16LE(id, 3 + index * 2));
    return raw;
};

describe("authoritative websocket protocol output", () => {
    let user: any;
    let room: any;
    let state: any;
    let runtime: any;

    beforeEach(() => {
        vi.clearAllMocks();
        user = {
            user: { id: 42 },
            ipaddr: "127.0.0.1",
            host: { ChangeRoomSettings: false },
            selects: { use: vi.fn() },
            conn: { send: vi.fn() },
        };
        room = {
            boardWidth: 100,
            boardHeight: 40,
            startTime: 1,
            groups: [],
            sets: [{ cols: 2, rows: 1 }],
            ext: {},
        };
        state = {};
        runtime = {
            transformedgroups: new Map(),
            groupowners: new Map(),
            lastMovedGroups: new Map(),
            events: new EventEmitter(),
            broadcaster: { broadcast: vi.fn() },
        };
    });

    it("broadcasts canonical, clamped movement with the authenticated user id", () => {
        const group = { id: 7, ids: [3], indices: [0], set: 0, x: 10, y: 10, dragged: 42 };
        runtime.transformedgroups.set(3, group);
        runtime.transformedgroups.set(7, group);

        run(Movement, BinCommands.Move, positionPacket(BinCommands.Move, 999, [
            { id: 7, x: 150, y: -20 },
        ]), user, room, state, runtime);

        expect([group.x, group.y]).toEqual([100, 0]);
        const outbound = runtime.broadcaster.broadcast.mock.calls[0][0] as Buffer;
        expect(outbound.readUInt16LE(1)).toBe(42);
        expect(outbound.readUInt16LE(3)).toBe(7);
        expect(outbound.readFloatLE(5)).toBe(100);
        expect(outbound.readFloatLE(9)).toBe(0);
        const correction = JSON.parse(user.conn.send.mock.calls[0][0]);
        expect(correction).toEqual({
            type: "position_correction",
            groups: [{ id: 7, x: 100, y: 0 }]
        });
    });

    it("moves the valid part of a batch and snaps back raced (locked) groups without a resync", () => {
        const first = { id: 1, ids: [], indices: [0], set: 0, x: 5, y: 5, dragged: 42 };
        const second = { id: 2, ids: [], indices: [1], set: 0, x: 6, y: 6, locked: true, dragged: 42 };
        runtime.transformedgroups.set(1, first);
        runtime.transformedgroups.set(2, second);

        run(Movement, BinCommands.Move, positionPacket(BinCommands.Move, 42, [
            { id: 1, x: 20, y: 20 },
            { id: 2, x: 30, y: 30 },
        ]), user, room, state, runtime);

        expect([first.x, first.y]).toEqual([20, 20]);
        expect([second.x, second.y]).toEqual([6, 6]);
        expect(forceRoomSync).not.toHaveBeenCalled();
        const outbound = runtime.broadcaster.broadcast.mock.calls[0][0] as Buffer;
        expect(outbound.readUInt16LE(3)).toBe(1);
        expect(outbound.length).toBe(13); // only the movable group is broadcast
        const correction = JSON.parse(user.conn.send.mock.calls[0][0]);
        expect(correction).toEqual({
            type: "position_correction",
            groups: [{ id: 2, x: 6, y: 6 }]
        });
    });

    it("rejects stale movement aliases and movement without an accepted pick", () => {
        const group = { id: 7, ids: [3], indices: [0], set: 0, x: 10, y: 10 };
        runtime.transformedgroups.set(3, group);
        runtime.transformedgroups.set(7, group);

        run(Movement, BinCommands.Move, positionPacket(BinCommands.Move, 42, [
            { id: 3, x: 20, y: 20 },
        ]), user, room, state, runtime);

        expect([group.x, group.y]).toEqual([10, 10]);
        expect(forceRoomSync).toHaveBeenCalledOnce();
        expect(runtime.broadcaster.broadcast).not.toHaveBeenCalled();
    });

    it("allows moving a piece that is selected but not dragged (space organize)", () => {
        const group = { id: 7, ids: [], indices: [0], set: 0, x: 10, y: 10, selected: 42 };
        runtime.transformedgroups.set(7, group);

        run(Movement, BinCommands.Move, positionPacket(BinCommands.Move, 42, [
            { id: 7, x: 20, y: 20 },
        ]), user, room, state, runtime);

        expect([group.x, group.y]).toEqual([20, 20]);
        expect(group.dragged).toBeUndefined();
        expect(forceRoomSync).not.toHaveBeenCalled();
        expect(runtime.broadcaster.broadcast).toHaveBeenCalledOnce();
    });

    it("allows only the current drag owner to move or drop a group", () => {
        const group = { id: 7, ids: [], indices: [0], set: 0, x: 10, y: 10, dragged: 9 };
        runtime.transformedgroups.set(7, group);

        run(Movement, BinCommands.Drop, positionPacket(BinCommands.Drop, 42, [
            { id: 7, x: 20, y: 20 },
        ]), user, room, state, runtime);

        expect(group.dragged).toBe(9);
        expect([group.x, group.y]).toEqual([10, 10]);
        // raced ownership is answered with a targeted snap-back, not a full resync
        expect(forceRoomSync).not.toHaveBeenCalled();
        expect(runtime.broadcaster.broadcast).not.toHaveBeenCalled();
        const correction = JSON.parse(user.conn.send.mock.calls[0][0]);
        expect(correction).toEqual({
            type: "position_correction",
            groups: [{ id: 7, x: 10, y: 10 }]
        });
    });

    it("broadcasts the server-clamped merge position and uses board height for y", () => {
        const a = { id: 2, ids: [], indices: [0], set: 0, x: 5, y: 5, rot: 0 };
        const b = { id: 3, ids: [], indices: [1], set: 0, x: 6, y: 6, rot: 0 };
        room.groups = [a, b];
        runtime.transformedgroups.set(2, a);
        runtime.transformedgroups.set(3, b);
        const raw = Buffer.alloc(15);
        raw[0] = BinCommands.Merge;
        raw.writeUInt16LE(999, 1);
        raw.writeUInt16LE(2, 3);
        raw.writeUInt16LE(3, 5);
        raw.writeFloatLE(500, 7);
        raw.writeFloatLE(500, 11);

        run(Merge, BinCommands.Merge, raw, user, room, state, runtime);

        expect([a.x, a.y]).toEqual([100, 40]);
        const outbound = runtime.broadcaster.broadcast.mock.calls[0][0] as Buffer;
        expect(outbound.readUInt16LE(1)).toBe(42);
        expect(outbound.readFloatLE(7)).toBe(100);
        expect(outbound.readFloatLE(11)).toBe(40);
        const correction = JSON.parse(user.conn.send.mock.calls[0][0]);
        expect(correction).toEqual({
            type: "position_correction",
            groups: [{ id: a.id, x: 100, y: 40 }]
        });
    });

    it("still broadcasts a committed merge when a post-merge listener fails", () => {
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
        const a = { id: 2, ids: [], indices: [0], set: 0, x: 5, y: 5, rot: 0 };
        const b = { id: 3, ids: [], indices: [1], set: 0, x: 6, y: 6, rot: 0 };
        room.groups = [a, b];
        runtime.transformedgroups.set(2, a);
        runtime.transformedgroups.set(3, b);
        runtime.events.on("joined", () => { throw new Error("secondary listener failed"); });
        const raw = Buffer.alloc(15);
        raw[0] = BinCommands.Merge;
        raw.writeUInt16LE(42, 1);
        raw.writeUInt16LE(2, 3);
        raw.writeUInt16LE(3, 5);
        raw.writeFloatLE(20, 7);
        raw.writeFloatLE(20, 11);

        run(Merge, BinCommands.Merge, raw, user, room, state, runtime);

        expect(room.groups).toHaveLength(1);
        expect(runtime.broadcaster.broadcast).toHaveBeenCalledOnce();
        consoleError.mockRestore();
    });

    it("merges an unlocked piece into a locked group and keeps the result locked", () => {
        const a = { id: 2, ids: [], indices: [0], set: 0, x: 5, y: 5, rot: 0 };
        const b = { id: 3, ids: [], indices: [1], set: 0, x: 6, y: 6, rot: 0, locked: true };
        room.groups = [a, b];
        runtime.transformedgroups.set(2, a);
        runtime.transformedgroups.set(3, b);
        const raw = Buffer.alloc(15);
        raw[0] = BinCommands.Merge;
        raw.writeUInt16LE(42, 1);
        raw.writeUInt16LE(2, 3);
        raw.writeUInt16LE(3, 5);
        raw.writeFloatLE(20, 7);
        raw.writeFloatLE(20, 11);

        run(Merge, BinCommands.Merge, raw, user, room, state, runtime);

        expect(room.groups).toHaveLength(1);
        expect((a as any).locked).toBe(true);
        expect([a.x, a.y]).toEqual([20, 20]);
        expect(forceRoomSync).not.toHaveBeenCalled();
        expect(runtime.broadcaster.broadcast).toHaveBeenCalledOnce();
    });

    it("merges two locked groups (chain merge through a bridging piece)", () => {
        // dropping a piece between two locked clusters merges it into the first
        // cluster (result is locked), then that locked group merges into the
        // second locked cluster - the second merge arrives with both sides locked
        const a = { id: 2, ids: [], indices: [0], set: 0, x: 5, y: 5, rot: 0, locked: true };
        const b = { id: 3, ids: [], indices: [1], set: 0, x: 6, y: 6, rot: 0, locked: true };
        room.groups = [a, b];
        runtime.transformedgroups.set(2, a);
        runtime.transformedgroups.set(3, b);
        const raw = Buffer.alloc(15);
        raw[0] = BinCommands.Merge;
        raw.writeUInt16LE(42, 1);
        raw.writeUInt16LE(2, 3);
        raw.writeUInt16LE(3, 5);
        raw.writeFloatLE(20, 7);
        raw.writeFloatLE(20, 11);

        run(Merge, BinCommands.Merge, raw, user, room, state, runtime);

        expect(room.groups).toHaveLength(1);
        expect((a as any).locked).toBe(true);
        expect(forceRoomSync).not.toHaveBeenCalled();
        expect(runtime.broadcaster.broadcast).toHaveBeenCalledOnce();
    });

    it("rejects merges with incompatible flip or ownership state", () => {
        const a = { id: 2, ids: [], indices: [0], set: 0, x: 5, y: 5, rot: 0, f: false };
        const b = { id: 3, ids: [], indices: [1], set: 0, x: 6, y: 6, rot: 0, f: true };
        room.groups = [a, b];
        runtime.transformedgroups.set(2, a);
        runtime.transformedgroups.set(3, b);
        const raw = Buffer.alloc(15);
        raw[0] = BinCommands.Merge;
        raw.writeUInt16LE(42, 1);
        raw.writeUInt16LE(2, 3);
        raw.writeUInt16LE(3, 5);
        raw.writeFloatLE(20, 7);
        raw.writeFloatLE(20, 11);

        run(Merge, BinCommands.Merge, raw, user, room, state, runtime);

        expect(room.groups).toEqual([a, b]);
        expect(forceRoomSync).toHaveBeenCalledOnce();
        expect(runtime.broadcaster.broadcast).not.toHaveBeenCalled();
    });

    it("broadcasts one canonical lock packet instead of one duplicate per group", () => {
        const a = { id: 7, ids: [3], indices: [0], set: 0 };
        const b = { id: 8, ids: [], indices: [1], set: 0 };
        runtime.transformedgroups.set(3, a);
        runtime.transformedgroups.set(7, a);
        runtime.transformedgroups.set(8, b);

        run(Lock, BinCommands.Lock, idPacket(BinCommands.Lock, 999, [7, 8]), user, room, state, runtime);

        expect(runtime.broadcaster.broadcast).toHaveBeenCalledOnce();
        const outbound = runtime.broadcaster.broadcast.mock.calls[0][0] as Buffer;
        expect([...outbound]).toEqual([BinCommands.Lock, 42, 0, 7, 0, 8, 0]);
    });

    it("locks the free groups and reverts the held one with a targeted unlock", () => {
        const a = { id: 7, ids: [], indices: [0], set: 0, locked: false };
        const b = { id: 8, ids: [], indices: [1], set: 0, locked: false, selected: 9 };
        runtime.transformedgroups.set(7, a);
        runtime.transformedgroups.set(8, b);

        run(Lock, BinCommands.Lock, idPacket(BinCommands.Lock, 42, [7, 8]), user, room, state, runtime);

        expect(a.locked).toBe(true);
        expect(b.locked).toBe(false);
        expect(b.selected).toBe(9); // other user's selection is untouched
        expect(forceRoomSync).not.toHaveBeenCalled();
        const outbound = runtime.broadcaster.broadcast.mock.calls[0][0] as Buffer;
        expect([...outbound]).toEqual([BinCommands.Lock, 42, 0, 7, 0]);
        const revert = user.conn.send.mock.calls[0][0] as Buffer;
        expect([...revert]).toEqual([BinCommands.Unlock, 42, 0, 8, 0]);
    });

    it("clears the locker's own selection instead of rejecting the lock", () => {
        const a: any = { id: 7, ids: [], indices: [0], set: 0, locked: false, selected: 42, dragged: 42 };
        runtime.transformedgroups.set(7, a);

        run(Lock, BinCommands.Lock, idPacket(BinCommands.Lock, 42, [7]), user, room, state, runtime);

        expect(a.locked).toBe(true);
        expect(a.selected).toBeUndefined();
        expect(a.dragged).toBeUndefined();
        expect(forceRoomSync).not.toHaveBeenCalled();
        expect(runtime.broadcaster.broadcast).toHaveBeenCalledOnce();
    });

    it("selects the free groups and reverts the locked one with a targeted release", () => {
        const a: any = { id: 7, ids: [], indices: [0], set: 0 };
        const b: any = { id: 8, ids: [], indices: [1], set: 0, locked: true };
        runtime.transformedgroups.set(7, a);
        runtime.transformedgroups.set(8, b);

        run(Select, BinCommands.Select, idPacket(BinCommands.Select, 42, [7, 8]), user, room, state, runtime);

        expect(a.selected).toBe(42);
        expect(b.selected).toBeUndefined();
        expect(forceRoomSync).not.toHaveBeenCalled();
        const outbound = runtime.broadcaster.broadcast.mock.calls[0][0] as Buffer;
        expect([...outbound]).toEqual([BinCommands.Select, 42, 0, 7, 0]);
        const revert = user.conn.send.mock.calls[0][0] as Buffer;
        expect([...revert]).toEqual([BinCommands.ForceRelease, 42, 0, 8, 0]);
    });

    it("treats a deselect of an already-deselected group as a no-op", () => {
        const a: any = { id: 7, ids: [], indices: [0], set: 0 };
        runtime.transformedgroups.set(7, a);

        run(Select, BinCommands.Deselect, idPacket(BinCommands.Deselect, 42, [7]), user, room, state, runtime);

        expect(forceRoomSync).not.toHaveBeenCalled();
        expect(runtime.broadcaster.broadcast).not.toHaveBeenCalled();
    });

    it("supports sticky selection without an event-payload mismatch", () => {
        const group: any = { id: 7, ids: [], indices: [0], set: 0, x: 10, y: 10 };
        room.ext = { sticky: true };
        room.groups = [group];
        runtime.transformedgroups.set(7, group);
        runtime.usersPriv = new Map([[42, user]]);
        runtime.groupownersbyip = new Map();
        runtime.jsonCodeHandlers = new Map();
        runtime.connectionFlow = new EventEmitter();
        runtime.modules = [];
        user.commited = undefined;
        new Game().attach({ room, state, runtime });

        expect(() => run(
            Select,
            BinCommands.Select,
            idPacket(BinCommands.Select, 42, [7]),
            user,
            room,
            state,
            runtime
        )).not.toThrow();

        expect(group.selected).toBe(42);
        expect(user.commited.has(group)).toBe(true);
    });

    it("includes the acting user in force-release hooks and canonicalizes output", () => {
        const group = { id: 7, ids: [3], indices: [0], set: 0, selected: 9, dragged: 9 };
        runtime.transformedgroups.set(3, group);
        runtime.transformedgroups.set(7, group);
        const listener = vi.fn();
        runtime.events.on("forceRelease", listener);

        run(Select, BinCommands.ForceRelease, idPacket(BinCommands.ForceRelease, 999, [7]), user, room, state, runtime);

        expect(listener.mock.calls[0][0].user).toBe(user);
        expect(group.selected).toBeUndefined();
        const outbound = runtime.broadcaster.broadcast.mock.calls[0][0] as Buffer;
        expect([...outbound]).toEqual([BinCommands.ForceRelease, 42, 0, 7, 0]);
    });

    it("rotates the free groups and reverts the locked one with its current rotation", () => {
        room.rotation = true;
        const a = { id: 1, ids: [], indices: [0], set: 0, rot: 0 };
        const b = { id: 2, ids: [], indices: [1], set: 0, rot: 0, locked: true };
        runtime.transformedgroups.set(1, a);
        runtime.transformedgroups.set(2, b);
        const raw = Buffer.from([BinCommands.Rotate, 42, 0, 1, 0, 1, 2, 0, 2]);

        run(Rotation, BinCommands.Rotate, raw, user, room, state, runtime);

        expect(a.rot).toBe(1);
        expect(b.rot).toBe(0);
        expect(forceRoomSync).not.toHaveBeenCalled();
        const outbound = runtime.broadcaster.broadcast.mock.calls[0][0] as Buffer;
        expect([...outbound]).toEqual([BinCommands.Rotate, 42, 0, 1, 0, 1]);
        const revert = user.conn.send.mock.calls[0][0] as Buffer;
        expect([...revert]).toEqual([BinCommands.Rotate, 42, 0, 2, 0, 0]);
    });

    it("still resyncs on a structurally invalid rotation value", () => {
        room.rotation = true;
        const a = { id: 1, ids: [], indices: [0], set: 0, rot: 0 };
        runtime.transformedgroups.set(1, a);
        const raw = Buffer.from([BinCommands.Rotate, 42, 0, 1, 0, 7]);

        run(Rotation, BinCommands.Rotate, raw, user, room, state, runtime);

        expect(a.rot).toBe(0);
        expect(runtime.broadcaster.broadcast).not.toHaveBeenCalled();
        expect(forceRoomSync).toHaveBeenCalledOnce();
    });
});

describe("clock drift estimation", () => {
    it("returns client minus server clock skew without subtracting a full RTT", () => {
        // Server sends at 1000, client receives at server-time 1050 with a +5s clock,
        // and the server receives the response at 1100.
        expect(estimateClockDrift(1000, 1100, 6050)).toBe(5000);
    });

    it("rejects invalid timing samples", () => {
        expect(estimateClockDrift(1100, 1000, 6000)).toBeUndefined();
        expect(estimateClockDrift(1000, 1100, Number.NaN)).toBeUndefined();
        expect(estimateClockDrift(1000, 12_000, 6000)).toBeUndefined();
    });

    it("accepts only complete legacy or timestamped heartbeat frames", () => {
        const heartbeatUser: any = {
            user: { id: 42 },
            missedhb: 5,
            heartbeatPending: true,
            clitime: 123
        };
        const malformed = Buffer.alloc(7);
        malformed[0] = BinCommands.Heartbeat;
        malformed.writeUInt16LE(42, 1);
        run(Heartbeat, BinCommands.Heartbeat, malformed, heartbeatUser, {}, {}, {});
        expect(heartbeatUser.missedhb).toBe(5);
        expect(heartbeatUser.heartbeatPending).toBe(true);

        const legacy = Buffer.from([BinCommands.Heartbeat, 42, 0]);
        run(Heartbeat, BinCommands.Heartbeat, legacy, heartbeatUser, {}, {}, {});
        expect(heartbeatUser.missedhb).toBe(0);
        expect(heartbeatUser.heartbeatPending).toBe(false);
        expect(heartbeatUser.clitime).toBeUndefined();
    });
});

describe("censored-piece recovery", () => {
    it("restores saved initial positions without relying on the removed cleanup module", () => {
        const group: any = {
            id: 7,
            ids: [],
            indices: [0],
            set: 0,
            x: 0xDEADBABE,
            y: 0xDEADBABE,
        };
        const room: any = {
            boardWidth: 1000,
            boardHeight: 800,
            groups: [group],
            initialLayout: [{ ...group, x: 125, y: 250 }],
            ext: { censoredCount: 1, censoredIds: [7] },
        };
        const runtime: any = {
            transformedgroups: new Map([[7, group]]),
            broadcaster: { broadcast: vi.fn() },
        };

        revealCensoredGroups(room, runtime);

        expect([group.x, group.y]).toEqual([125, 250]);
        expect(room.ext.censoredCount).toBe(0);
        const outbound = runtime.broadcaster.broadcast.mock.calls[0][0] as Buffer;
        expect(outbound[0]).toBe(BinCommands.Drop);
        expect(outbound.readUInt16LE(1)).toBe(0xffff);
        expect(outbound.readUInt16LE(3)).toBe(7);
    });
});
