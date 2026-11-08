
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AdminModule } from '../src/commands/AdminModule.js';
import { EventEmitter } from 'events';
import { send_system, sendAlert, pruneuser } from '../src/room-utils.js';
import * as db from '../src/db.js';
import * as cleanupService from "../src/core/cleanup-service.js";
import { Permissions } from '../src/utils.js';

// Mock dependencies
vi.mock('../src/room-utils.js', () => ({
    send_system: vi.fn(),
    sendAlert: vi.fn(),
    pruneuser: vi.fn((state, room, user, cb) => cb({ close: vi.fn() })),
    buildCapString: vi.fn(() => 'caps'),
}));

vi.mock('../src/db.js', () => ({
    trashupRoom: vi.fn().mockResolvedValue(undefined),
    goodgoys: [],
    findInList: vi.fn().mockResolvedValue('found'),
    roomc: {
        findOne: vi.fn(),
        updateOne: vi.fn(),
        deleteOne: vi.fn()
    },
    tokensc: {
        updateOne: vi.fn(),
        findOne: vi.fn()
    },
    followersc: {
        findOne: vi.fn()
    }
}));

vi.mock('../src/core/cleanup-service.js', () => ({
    trashupRoom: vi.fn().mockResolvedValue(true)
}));

vi.mock('../src/utils.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../src/utils.js')>();
    return {
        ...actual,
        buildCapString: vi.fn(() => 'caps'),
        findInList: vi.fn().mockResolvedValue({}),
    }
});


describe('AdminModule Coverage', () => {
    let module: AdminModule;
    let mockState: any;
    let mockRoom: any;
    let mockUserP: any;
    let mockUser: any;

    beforeEach(() => {
        vi.clearAllMocks();
        module = new AdminModule();

        mockState = {
            events: new EventEmitter(),
            usersPriv: new Map(),
            users: new Map(),
            broadcaster: {
                broadcast: vi.fn(),
                broadcast_slow: vi.fn(),
                broadcastRoomUsers: vi.fn()
            },
            modules: [],
            bannedips: [],
            setAutodestruct: vi.fn()
        };

        mockRoom = {
            key: 'secret',
            nsfw: false,
            ext: {}
        };

        mockUser = {
            name: 'admin',
            color: '#ffffff',
            id: 1
        };

        mockUserP = {
            host: {
                Admin: true,
                Lock: true,
                Debug: true,
                RoomCreator: true,
                SlowMode: true,
                Delete: true,
                Delegate: true,
                ReadBanlist: true,
                Restart: true
            },
            ishost: new Permissions(['Admin', 'Lock', 'Debug', 'RoomCreator', 'SlowMode', 'Delete', 'Delegate', 'ReadBanlist', 'Restart']),
            ipaddr: '127.0.0.1',
            conn: { send: vi.fn() },
            user: mockUser,
            muter: { mutedUsers: new Set(), addClause: vi.fn(), removeClause: vi.fn(), shouldMute: vi.fn() }
        };

        mockState.usersPriv.set(1, mockUserP);

        module.attach({ state: mockState, runtime: mockState, room: mockRoom } as any);
        mockState.modules.push(module);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should handle whisper with session exchange pattern', () => {
        const cmd = module.commands.find(c => c.name === 'whisper');
        // Valid session exchange pattern: 05 followed by 64 hex chars
        const sessionMsg = '05' + 'a'.repeat(64);

        mockState.users.set(1, { name: 'target', id: 1 });
        mockState.usersPriv.set(1, { user: { name: 'target' }, conn: { send: vi.fn() }, muter: { mutedUsers: new Set() } });

        cmd!.handler({ state: mockState, runtime: mockState, userp: mockUserP, user: mockUser } as any, 'target;' + sessionMsg);

        expect(sendAlert).toHaveBeenCalledWith(expect.stringContaining('sess exch'), expect.anything());
    });

    it('should handle s command with session exchange pattern', () => {
        const cmd = module.commands.find(c => c.name === 's');
        const sessionMsg = '05' + 'a'.repeat(64);

        cmd!.handler({ state: mockState, runtime: mockState, userp: mockUserP, user: mockUser } as any, sessionMsg);

        expect(sendAlert).toHaveBeenCalledWith(expect.stringContaining('sess exch'), expect.anything());
        expect(mockState.broadcaster.broadcast_slow).toHaveBeenCalled();
    });

    it('should handle banlist when empty', () => {
        const cmd = module.commands.find(c => c.name === 'banlist');
        mockState.bannedips = [];

        cmd!.handler({ state: mockState, runtime: mockState, userp: mockUserP, user: mockUser } as any);

        expect(send_system).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'No banned ips in this room.');
    });

    it('should toggle superlock off', () => {
        module.superlocked = true;
        module.superlockMessage = 'Locked';

        const cmd = module.commands.find(c => c.name === 'superlock');
        cmd!.handler({ state: mockState, runtime: mockState, userp: mockUserP, user: mockUser, room: mockRoom } as any);

        expect(module.superlocked).toBe(false);
        expect(module.superlockMessage).toBeNull();
    });

    it('should toggle autodestruct timer on superlock', () => {
        const cmd = module.commands.find(c => c.name === 'superlock');

        // Turn on superlock
        cmd!.handler({ state: mockState, runtime: mockState, userp: mockUserP, user: mockUser, room: mockRoom } as any);
        expect(module.superlocked).toBe(true);
        expect(mockState.setAutodestruct).toHaveBeenCalledWith(false); // disable autodestruct

        // Turn off superlock
        cmd!.handler({ state: mockState, runtime: mockState, userp: mockUserP, user: mockUser, room: mockRoom } as any);
        expect(module.superlocked).toBe(false);
        expect(mockState.setAutodestruct).toHaveBeenCalledWith(true); // enable autodestruct
    });

    it('should handle kys command', () => {
        const pid = process.pid;
        const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

        const cmd = module.commands.find(c => c.name === 'kys');
        cmd!.handler({ state: mockState, runtime: mockState, userp: mockUserP } as any);

        expect(killSpy).toHaveBeenCalledWith(pid, 'SIGTERM');
    });

    it('should handle dbg command', () => {
        const pid = process.pid;
        const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

        // There are two 'dbg' commands in the array, testing finding one
        const cmd = module.commands.find(c => c.name === 'dbg');
        cmd!.handler({ state: mockState, runtime: mockState, userp: mockUserP } as any);

        expect(killSpy).toHaveBeenCalledWith(pid, 'SIGUSR1');
    });

    it('should handle botnet command', () => {
        const cmd = module.commands.find(c => c.name === 'botnet');
        const targetMock = { conn: { send: vi.fn() } };
        mockState.usersPriv.set(2, targetMock);

        cmd!.handler({ state: mockState, runtime: mockState, userp: mockUserP, user: mockUser } as any, '2');

        expect(targetMock.conn.send).toHaveBeenCalledWith(expect.stringContaining('botnet'));
    });

    it('should handle ids command', () => {
        const cmd = module.commands.find(c => c.name === 'ids');
        mockState.users = [{ name: 'u1', id: 1 }, { name: 'u2', id: 2 }];

        cmd!.handler({ state: mockState, runtime: mockState, userp: mockUserP, user: mockUser } as any);

        expect(send_system).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.stringContaining('u1: 1'));
    });

    it('should handle del command', async () => {
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => { }) as any);
        // We mock trashupRoom via the module mock at the top

        const cmd = module.commands.find(c => c.name === 'del');

        mockState.usersPriv.set(1, mockUserP);

        try {
            await cmd!.handler({ state: mockState, runtime: mockState, userp: mockUserP, room: mockRoom } as any);
            // handler calls async trashupRoom but doesn't await it in return. 
            // BUT trashupRoom mock is resolved. 
            // We need to wait for promise chain or use fake timers? 
            // The handler returns boolean immediately. The rest is async.

            // Wait a tick
            await new Promise(r => setTimeout(r, 10));
        } catch (e: any) {
            if (!e.message.startsWith('EXIT')) throw e;
        }

        expect(cleanupService.trashupRoom).toHaveBeenCalled();
        expect(exitSpy).toHaveBeenCalledWith(0);
        expect(mockUserP.conn.send).toHaveBeenCalledWith(expect.stringContaining('noroom'));
    });

    it('should handle help command', () => {
        const cmd = module.commands.find(c => c.name === 'help');
        cmd!.handler({ state: mockState, runtime: mockState, userp: mockUserP, user: mockUser } as any);
        expect(send_system).toHaveBeenCalled();
    });





    it('should handle br command', () => {
        const cmd = module.commands.find(c => c.name === 'br');
        cmd!.handler({ state: mockState, runtime: mockState, userp: mockUserP, user: mockUser } as any, '4f', '4b'); // OK in hex

        expect(mockState.broadcaster.broadcast).toHaveBeenCalledWith(expect.any(Buffer));
    });

    it('should handle endstats', () => {
        const cmd = module.commands.find(c => c.name === 'endstats');
        mockState.endstats = { some: 'stat' };

        cmd!.handler({ state: mockState, runtime: mockState, userp: mockUserP, user: mockUser } as any);

        expect(mockUserP.conn.send).toHaveBeenCalledWith(expect.stringContaining('endstats'));
    });

    it('should handle slowmode toggle off', () => {
        const cmd = module.commands.find(c => c.name === 'slowmode');
        mockState.slow = { baseTimeout: 10 };

        cmd!.handler({ state: mockState, runtime: mockState, userp: mockUserP, user: mockUser } as any, '10');

        expect(mockState.slow).toBeUndefined();
        expect(send_system).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.stringContaining('disabled'));
    });

    it('should serialize and deserialize', () => {
        const data = module.serialize();
        expect(data).toHaveProperty('locked');
        expect(data).toHaveProperty('superlocked');

        const mod2 = new AdminModule();
        mod2.deserialize(data);
        expect(mod2.locked).toBe(module.locked);
    });

});
