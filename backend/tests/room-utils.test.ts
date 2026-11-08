import { describe, it, expect, vi, beforeEach } from 'vitest';
import { send_system, pruneuser, banuser, forceRoomSync, getRoomCompletionStat, getIp, buffToIpv4, buffToIpv6, shuffleArray } from '../src/room-utils.js';
import { infologsc, mongoinit } from '../src/db.js';

vi.mock('../src/db.js', () => ({
    infologsc: { insertOne: vi.fn() },
    mongoinit: vi.fn(),
    roomc: {
        findOne: vi.fn(),
        updateOne: vi.fn(),
        deleteOne: vi.fn()
    }
}));

vi.mock('../src/mut.js', () => ({
    loadRoom: vi.fn().mockResolvedValue([{}, {}, { sets: [] }])
}));

vi.mock('../src/room.js', () => ({
    runtime: { usersPriv: new Map() }
}));

// Mock axios
vi.mock('axios', () => ({
    default: { post: vi.fn() }
}));

// Mock web-push
vi.mock('web-push', () => ({
    default: {
        setVapidDetails: vi.fn(),
        sendNotification: vi.fn()
    }
}));

describe('room-utils', () => {
    let mockState: any;
    let mockRuntime: any;
    let mockRoom: any;
    let mockUserP: any;
    let mockUser: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockState = {
            bannedips: [],
            bannednames: [],
            bannedreason: []
        };
        mockRuntime = {
            broadcaster: { broadcast: vi.fn(), broadcastRoomUsers: vi.fn() },
            usersPriv: new Map(),
            users: []
        };
        mockRoom = {
            groups: [],
            pieces: 100,
            sets: []
        };
        mockUser = { id: 1, name: 'user1', color: '#000' };
        mockUserP = {
            conn: { send: vi.fn(), close: vi.fn() },
            ipaddr: '127.0.0.1',
            name: 'user1',
            user: mockUser
        };
        mockRuntime.usersPriv.set(1, mockUserP);
        mockRuntime.users.push(mockUser);
    });

    it('send_system should send correct JSON', () => {
        send_system(mockUserP, mockUser, 'hello');
        expect(mockUserP.conn.send).toHaveBeenCalledWith(expect.stringContaining('"message":"hello"'));
        expect(mockUserP.conn.send).toHaveBeenCalledWith(expect.stringContaining('"type":"chat"'));
    });

    describe('pruneuser', () => {
        it('should prune user and release groups', () => {
            mockUserP.interid = 123;
            // Setup groups held by user
            mockRoom.groups = [{ selected: 1, id: 10 }, { selected: 1, id: 11 }];

            const cb = vi.fn();
            pruneuser(mockState, mockRuntime, mockRoom, mockUserP, cb);

            expect(cb).toHaveBeenCalled();
            expect(mockRuntime.usersPriv.size).toBe(0);
            expect(mockRuntime.users.length).toBe(0);
            expect(mockRoom.groups[0].selected).toBeUndefined();
            expect(mockUserP.interid).toBeUndefined();
            const release = mockRuntime.broadcaster.broadcast.mock.calls[0][0] as Buffer;
            expect([...release]).toEqual([5, 1, 0, 10, 0, 11, 0]);
        });

        it('should broadcast a final drop for a dragged-only group', () => {
            mockRoom.groups = [{ dragged: 1, dragStartX: 1, dragStartY: 2, id: 10, x: 12, y: 34 }];

            pruneuser(mockState, mockRuntime, mockRoom, mockUserP, vi.fn());

            const drop = mockRuntime.broadcaster.broadcast.mock.calls[0][0] as Buffer;
            expect(drop[0]).toBe(3);
            expect(drop.readUInt16LE(1)).toBe(1);
            expect(drop.readUInt16LE(3)).toBe(10);
            expect(drop.readFloatLE(5)).toBe(12);
            expect(drop.readFloatLE(9)).toBe(34);
            expect(mockRoom.groups[0].dragged).toBeUndefined();
            expect(mockRoom.groups[0].dragStartX).toBeUndefined();
        });

        it('should broadcast drop then deselect for a selected and dragged group', () => {
            mockRoom.groups = [{ selected: 1, dragged: 1, id: 10, x: 12, y: 34 }];

            pruneuser(mockState, mockRuntime, mockRoom, mockUserP, vi.fn());

            const [drop, deselect] = mockRuntime.broadcaster.broadcast.mock.calls.map((call: any[]) => call[0] as Buffer);
            expect(drop[0]).toBe(3);
            expect(deselect[0]).toBe(5);
            expect(mockRoom.groups[0].selected).toBeUndefined();
            expect(mockRoom.groups[0].dragged).toBeUndefined();
        });

        it('should handle user not found in priv map gracefully', () => {
            mockRuntime.usersPriv.clear();
            const cb = vi.fn();
            pruneuser(mockState, mockRuntime, mockRoom, mockUserP, cb);
            expect(cb).not.toHaveBeenCalled();
        });
    });

    describe('banuser', () => {
        it('should ban user, close connection and log', () => {
            // Add an alt with same IP to verify bannednames logic (since primary user is pruned before check)
            const mockUser2 = { id: 2, name: 'alt', color: '#000' };
            const mockUserP2 = { ipaddr: '127.0.0.1', conn: { send: vi.fn(), close: vi.fn() }, name: 'alt', user: mockUser2 };
            mockRuntime.users.push(mockUser2);
            mockRuntime.usersPriv.set(2, mockUserP2);

            const cb = vi.fn();
            banuser(mockState, mockRuntime, mockRoom, mockUserP, 'reason', cb);

            expect(mockState.bannedips).toContain('127.0.0.1');
            // The alt's name should be added because it shares IP and wasn't pruned (only u was pruned)
            expect(mockState.bannednames).toContain('alt');
            expect(mockState.bannedreason).toContain('reason');
            expect(mockUserP.conn.close).toHaveBeenCalledWith(4001, "Banned");
            expect(infologsc.insertOne).toHaveBeenCalled();

            // Also pruned
            expect(cb).toHaveBeenCalled();
        });
    });

    describe('forceRoomSync', () => {
        it('should send room state', () => {
            forceRoomSync(mockState, mockRoom, mockUserP);
            expect(mockUserP.conn.send).toHaveBeenCalledWith(expect.stringContaining('"type":"room"'));
        });
    });

    describe('getRoomCompletionStat', () => {
        it('should calculate completion', () => {
            mockRoom.pieces = 100;
            mockRoom.sets = []; // length 0
            mockRoom.groups = new Array(50); // 50 groups remaining (so 50 merged?) 
            // Logic: 1 - (groups - sets) / (pieces - sets)
            // 1 - (50 - 0) / (100 - 0) = 1 - 0.5 = 0.5
            expect(getRoomCompletionStat(mockRoom)).toBe(0.5);
        });
    });

    describe('IP utils', () => {
        it('getIp should get ip from socket', () => {
            const req = { socket: { remoteAddress: '1.2.3.4' }, headers: {} } as any;
            expect(getIp(req)).toBe('1.2.3.4');
        });

        it('getIp should get ip from headers', () => {
            const req = { headers: { 'x-forwarded-for': '5.6.7.8, 1.2.3.4' } } as any;
            expect(getIp(req)).toBe('5.6.7.8');
        });

        it('buffToIpv4', () => {
            // 16 bytes. Last 4 are IP. 
            const buf = new Uint8Array(16);
            buf.set([127, 0, 0, 1], 12);
            expect(buffToIpv4(buf)).toBe('127.0.0.1');
        });

        it('buffToIpv6', () => {
            const buf = new Uint8Array(16);
            // ::1
            buf[15] = 1;
            // 0000:0000:...:0001
            expect(buffToIpv6(buf)).toBe('0000:0000:0000:0000:0000:0000:0000:0001');
        });
    });

    describe('shuffleArray', () => {
        it('should shuffle array', () => {
            const arr = [1, 2, 3, 4, 5];
            const original = [...arr];
            shuffleArray(arr);
            expect(arr).toHaveLength(5);
            expect(arr.sort()).toEqual(original.sort());
        });
    });
});
