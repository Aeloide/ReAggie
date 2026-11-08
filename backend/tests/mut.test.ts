
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as mut from '../src/mut.js';
import * as db from '../src/db.js';
import * as cleanupService from "../src/core/cleanup-service.js";
import * as roomBroadcaster from '../src/core/room-broadcaster.js';
import * as room from '../src/room.js';
import { EventEmitter } from 'events';
import * as mongo from 'mongodb';
import { deserialize } from 'bson';
import { PlaylistModule } from '../src/commands/PlaylistModule.js';
import { ScoreModule } from '../src/commands/ScoreModule.js';

vi.mock('mongodb', () => {
    return {
        Binary: class {
            buffer: any;
            constructor(buffer: any) {
                this.buffer = buffer;
            }
        },
        deserialize: vi.fn()
    };
});

vi.mock('bson', () => ({
    deserialize: vi.fn()
}));

vi.mock('../src/db.js', () => ({
    roomc: {
        findOne: vi.fn(),
        updateOne: vi.fn(),
        deleteOne: vi.fn()
    },
    trashupRoom: vi.fn()
}));

vi.mock('../src/core/room-broadcaster.js', () => ({
    RoomBroadcaster: vi.fn()
}));

vi.mock('../src/core/cleanup-service.js', () => ({
    trashupRoom: vi.fn()
}));

vi.mock('../src/room.js', () => ({
    getStatsMessage: vi.fn(),
    setJuke: vi.fn(),
    ipc: [{
        write: vi.fn()
    }]
}));

// Mock all command modules to avoid side effects
vi.mock('../src/commands/AdminModule.js');
vi.mock('../src/commands/VoteKickModule.js');
vi.mock('../src/commands/RollbackModule.js');
vi.mock('../src/commands/CleanupModule.js');
vi.mock('../src/commands/ReplayModule.js');
vi.mock('../src/commands/ScoreModule.js');
vi.mock('../src/commands/DVDModule.js');
vi.mock('../src/commands/PollModule.js');
vi.mock('../src/commands/JigChanModule.js');
vi.mock('../src/commands/ImpactTextModule.js');
vi.mock('../src/commands/ScratchCardModule.js');
vi.mock('../src/commands/LargeBugModule.js');
vi.mock('../src/commands/PlaylistModule.js');
vi.mock('../src/commands/AFDVDModule.js');
vi.mock('../src/commands/FunnyHahaModule.js');

describe('mut.ts', () => {

    describe('Binary State Deserialization', () => {
        it('should deserialize E binary repr', () => {
            const bufSize = 2 + (2 + 2 + 4 + 4 + 2 + 2 + 0 + (1 * 2) + (1 * 2));
            const buf = Buffer.alloc(bufSize);
            let ptr = 0;
            buf.writeUInt16LE(1, ptr); ptr += 2; // n=1
            buf.writeInt16LE(100, ptr); ptr += 2; // id=100
            const status = (1 & 0x3) | (1 << 2) | (1 << 3) | (5 << 8);
            buf.writeUInt16LE(status, ptr); ptr += 2;
            buf.writeFloatLE(10.5, ptr); ptr += 4;
            buf.writeFloatLE(20.5, ptr); ptr += 4;
            buf.writeInt16LE(1, ptr); ptr += 2;
            buf.writeInt16LE(1, ptr); ptr += 2;
            buf.writeUInt16LE(101, ptr); ptr += 2;
            buf.writeUInt16LE(0, ptr); ptr += 2;

            const mockBinary = { buffer: buf };
            const groups = mut.deserializeEBinaryRepr(mockBinary as any, false);

            expect(groups[0].id).toBe(100);
            expect(groups[0].locked).toBe(true);
            expect(groups[0].f).toBe(true);
            expect(groups[0].set).toBe(5);
        });

        it('should deserialize E binary repr with rotting', () => {
            const bufSize = 2 + (2 + 2 + 4 + 4 + 2 + 2 + 8 + 0 + 0);
            const buf = Buffer.alloc(bufSize);
            let ptr = 0;
            buf.writeUInt16LE(1, ptr); ptr += 2;
            buf.writeInt16LE(100, ptr); ptr += 2;
            buf.writeUInt16LE(0, ptr); ptr += 2;
            buf.writeFloatLE(0, ptr); ptr += 4;
            buf.writeFloatLE(0, ptr); ptr += 4;
            buf.writeInt16LE(0, ptr); ptr += 2;
            buf.writeInt16LE(0, ptr); ptr += 2;
            buf.writeDoubleLE(3.14, ptr); ptr += 8;

            const mockBinary = { buffer: buf };
            const groups = mut.deserializeEBinaryRepr(mockBinary as any, true);
            expect(groups[0].rotp).toBeCloseTo(3.14);
        });

        it('should deserialize C binary repr', () => {
            const bufSize = 2 + (2 + 1 + 4 + 4 + 2 + 2 + 0 + 0);
            const buf = Buffer.alloc(bufSize);
            let ptr = 0;
            buf.writeUInt16LE(1, ptr); ptr += 2;
            buf.writeInt16LE(100, ptr); ptr += 2;
            const status = (2 << 3) | (1 << 1) | 1;
            buf.writeUInt8(status, ptr); ptr += 1;
            buf.writeFloatLE(10, ptr); ptr += 4;
            buf.writeFloatLE(20, ptr); ptr += 4;
            buf.writeInt16LE(0, ptr); ptr += 2;
            buf.writeInt16LE(0, ptr); ptr += 2;

            const mockBinary = { buffer: buf };
            const groups = mut.deserializeCBinaryRepr(mockBinary);
            expect(groups[0].rot).toBe(2);
            expect(groups[0].set).toBe(1);
            expect(groups[0].locked).toBe(true);
        });

        it('should deserialize D binary repr', () => {
            const bufSize = 2 + (2 + 1 + 4 + 4 + 2 + 2 + 0 + 0);
            const buf = Buffer.alloc(bufSize);
            let ptr = 0;
            buf.writeUInt16LE(1, ptr); ptr += 2;
            buf.writeInt16LE(100, ptr); ptr += 2;
            const status = (3 << 6) | (5 << 1) | 1;
            buf.writeUInt8(status, ptr); ptr += 1;
            buf.writeFloatLE(10, ptr); ptr += 4;
            buf.writeFloatLE(20, ptr); ptr += 4;
            buf.writeInt16LE(0, ptr); ptr += 2;
            buf.writeInt16LE(0, ptr); ptr += 2;

            const mockBinary = { buffer: buf };
            const groups = mut.deserializeDBinaryRepr(mockBinary, false);
            expect(groups[0].rot).toBe(3);
            expect(groups[0].set).toBe(5);
            expect(groups[0].locked).toBe(true);
        });

        it('should deserialize D binary repr with rotting', () => {
            const bufSize = 2 + (2 + 1 + 4 + 4 + 2 + 2 + 8 + 0 + 0);
            const buf = Buffer.alloc(bufSize);
            let ptr = 0;
            buf.writeUInt16LE(1, ptr); ptr += 2;
            buf.writeInt16LE(100, ptr); ptr += 2;
            buf.writeUInt8(0, ptr); ptr += 1;
            buf.writeFloatLE(0, ptr); ptr += 4;
            buf.writeFloatLE(0, ptr); ptr += 4;
            buf.writeInt16LE(0, ptr); ptr += 2;
            buf.writeInt16LE(0, ptr); ptr += 2;
            buf.writeDoubleLE(1.23, ptr); ptr += 8;

            const mockBinary = { buffer: buf };
            const groups = mut.deserializeDBinaryRepr(mockBinary, true);
            expect(groups[0].rotp).toBeCloseTo(1.23);
        });

        it('should deserialize B binary repr (bson)', async () => {
            const mockBson = [
                // id, ids, indices, locked, rot, set, x, y
                [100, [], [], true, 1, 2, 10.5, 20.5]
            ];
            (deserialize as any).mockReturnValue({ value: mockBson });

            const groups = mut.deserializeBinaryRepr({ buffer: Buffer.from([]) });
            expect(groups[0].id).toBe(100);
            expect(groups[0].locked).toBe(true);
        });
    });

    describe('loadRoom', () => {
        beforeEach(() => {
            vi.clearAllMocks();
            vi.useFakeTimers();
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it('should load a room successfully', async () => {
            const mockRoom = {
                groups: [],
                sets: [],
                ext: { estate: true },
                state: {},
                juke: false
            };
            const mockRecord = {
                room: mockRoom,
                state: { modstate: {} }
            };
            (db.roomc.findOne as any).mockResolvedValue(mockRecord);
            const buf = Buffer.alloc(2);
            buf.writeUInt16LE(0, 0);
            mockRoom.groups = { buffer: buf } as any;

            const [state, runtime, room] = await mut.loadRoom('rid');

            expect(state).toBeDefined();
            expect(room).toBeDefined();
            expect(runtime).toBeDefined();
            expect(runtime.modules.length).toBeGreaterThan(0);
            expect(roomBroadcaster.RoomBroadcaster).toHaveBeenCalled();
        });

        it('should load room with jukebox and scores and cstate/dstate', async () => {
            const mockRoom = {
                groups: { buffer: Buffer.alloc(2) } as any,
                sets: [],
                ext: { cstate: true, dstate: false, estate: false, bstate: false },
                juke: true,
                scores: true,
                key: ""
            };
            mockRoom.groups.buffer.writeUInt16LE(0, 0);
            (db.roomc.findOne as any).mockResolvedValue({ room: mockRoom, state: {} });

            const [state, runtime, roomObj] = await mut.loadRoom('rid');

            expect(runtime.modules.some(m => m instanceof PlaylistModule)).toBe(true);
            expect(runtime.modules.some(m => m instanceof ScoreModule)).toBe(true);
        });

        it('should throw if room not found', async () => {
            (db.roomc.findOne as any).mockResolvedValue(null);
            await expect(mut.loadRoom('missing')).rejects.toThrow('No such room');
        });

        it('should load room with AFDVDModule on April 1st', async () => {
            vi.setSystemTime(new Date('2024-04-01T12:00:00'));
            const mockRoom = {
                groups: { buffer: Buffer.alloc(2) } as any,
                sets: [],
                ext: { estate: true },
                state: {},
                juke: true,
                key: ""
            };
            mockRoom.groups.buffer.writeUInt16LE(0, 0);
            (db.roomc.findOne as any).mockResolvedValue({ room: mockRoom, state: {} });

            const [state, runtime, roomObj] = await mut.loadRoom('rid');

            // Check for AFDVDModule
            // Since we don't export it to check instanceof easily (unless we add import), we can check constructor name
            // or expect(AFDVDModule).toHaveBeenCalled() (we need to import/mock it)
            // We mocked it.
            const { AFDVDModule } = await import('../src/commands/AFDVDModule.js');
            expect(AFDVDModule).toHaveBeenCalled();
        });

        it('should load bstate and dstate and process groups', async () => {
            const mockRoom = {
                groups: { buffer: Buffer.alloc(2) } as any,
                sets: [{ cols: 10, rows: 10 }],
                ext: { bstate: true },
                state: {},
                juke: false
            };
            // Mock buffer for B state? B state calls deserializeBinaryRepr which uses bson.deserialize
            // Format: [id, ids, indices, locked, rot, set, x, y]
            const mockGroups = [
                [1, [2], [0, 1, 2], false, 0, 0, 0, 0]
            ];
            (deserialize as any).mockReturnValue({ value: mockGroups });

            (db.roomc.findOne as any).mockResolvedValue({ room: mockRoom, state: {} });

            const [state, runtime, roomObj] = await mut.loadRoom('rid');

            expect(runtime.transformedgroups.has(1)).toBe(true);
            expect(runtime.transformedgroups.has(2)).toBe(true);
        });

        it('should notify users on self destruct', async () => {
            const mockUser = { conn: { send: vi.fn() } };
            const mockRoom = {
                groups: { buffer: Buffer.from([0, 0]) } as any,
                sets: [],
                ext: { estate: true, selfdestruct: true },
                state: {},
                juke: false
            };
            (db.roomc.findOne as any).mockResolvedValue({ room: mockRoom, state: {} });
            (db.roomc.deleteOne as any).mockResolvedValue({ room: mockRoom, state: {} });

            const [state, runtime, roomObj] = await mut.loadRoom('rid');
            runtime.usersPriv.set(1, mockUser as any);

            const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => { }) as any);
            await vi.runAllTimersAsync();

            expect(mockUser.conn.send).toHaveBeenCalledWith(expect.stringContaining('noroom'));
        });

        it('should check if persistent room exists in self-destruct', async () => {
            const mockRoom = {
                groups: { buffer: Buffer.from([0, 0]) } as any,
                sets: [],
                ext: { estate: true, selfdestruct: true },
                state: {},
                juke: false
            };
            (db.roomc.findOne as any).mockImplementation((query: any) => {
                if (query.roomid) return { room: mockRoom, state: {} };
                // Query for persistent room logic
                // return null if not found (so fn returns true -> destroy)
                // return obj if found (so fn returns false -> don't destroy)
                if (query['room.sets.image'] === 'img1') return { room: {} };
                return null;
            });

            await mut.loadRoom('rid');
            const trashSpy = (cleanupService.trashupRoom as any);
            await vi.runAllTimersAsync();

            // Extract callback passed to trashupRoom
            const callback = trashSpy.mock.calls[0][2];

            // Case 1: image 'img1' exists in consistent room -> returns false (don't destroy)
            expect(await callback('img1')).toBe(false);

            // Case 2: image 'img2' not found -> returns true (destroy)
            expect(await callback('img2')).toBe(true);

            // Case 3: image '-' -> returns true
            expect(await callback('-')).toBe(true);
        });

        it('should setup periodic saver', async () => {
            const mockRoom = {
                groups: { buffer: Buffer.from([0, 0]) } as any,
                sets: [],
                ext: { estate: true },
                state: {},
                juke: false
            };
            (db.roomc.findOne as any).mockResolvedValue({ room: mockRoom, state: {} });

            const [state, room, runtime] = await mut.loadRoom('rid');
            const saveSpy = vi.spyOn(db.roomc, 'updateOne');

            vi.advanceTimersByTime(15000);

            expect(saveSpy).toHaveBeenCalled();
        });
    });

    describe('saveRoom', () => {
        it('should save room state', async () => {
            const mockRuntime: any = {
                modules: [{ name: 'test', serialize: () => ({ foo: 'bar' }) }],
                usersPriv: new Map(),
                save: null,
            };
            const mockState: any = {};
            const mockRoom: any = {
                groups: [],
                sets: [],
                ext: {}
            };

            await mut.saveRoom('rid', mockState, mockRuntime, mockRoom);

            expect(db.roomc.updateOne).toHaveBeenCalledWith(
                { roomid: 'rid' },
                expect.objectContaining({
                    $set: expect.objectContaining({
                        room: expect.objectContaining({ ext: expect.objectContaining({ estate: true }) }),
                        state: expect.objectContaining({ modstate: { test: { foo: 'bar' } } })
                    })
                })
            );
            const callArgs = (db.roomc.updateOne as any).mock.calls[0][1].$set.state;
            expect(callArgs.usersPriv).toBeUndefined();
        });

        it('should handle errors gracefully', async () => {
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
            (db.roomc.updateOne as any).mockRejectedValue(new Error('db fail'));

            await mut.saveRoom('rid', {} as any, { modules: [] } as any, { groups: [] } as any);

            expect(consoleSpy).toHaveBeenCalled();
        });
    });

    describe('destroyState', () => {
        it('should clear timers', () => {
            const mockRuntime: any = {
                archive: setTimeout(() => { }, 1000),
                save: setInterval(() => { }, 1000),
                usersPriv: new Map([
                    [1, { interid: setInterval(() => { }, 1000) }]
                ])
            };

            const clearSpy = vi.spyOn(global, 'clearTimeout');
            const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

            mut.destroyState(mockRuntime);

            expect(clearSpy).toHaveBeenCalled();
            expect(clearIntervalSpy).toHaveBeenCalled();
            expect(mockRuntime.usersPriv.get(1).interid).toBeUndefined();
        });
    });
});
