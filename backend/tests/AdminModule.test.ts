import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminModule } from '../src/commands/AdminModule.js';
import { Permissions } from '../src/utils.js';
import { send_system } from '../src/room-utils.js';

// Mock dependencies
// room.js mock removed

vi.mock('../src/db.js', () => ({
    goodgoys: {},
    trashupRoom: vi.fn()
}));

vi.mock('../src/room-utils.js', () => ({
    send_system: vi.fn(),
    sendAlert: vi.fn(),
    pruneuser: vi.fn((s, r, rm, u, cb) => cb({ close: vi.fn() })) // Mock implementation calling callback
}));

vi.mock('../src/utils.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../src/utils.js')>();
    return {
        ...actual,
        buildCapString: vi.fn(),
        findInList: vi.fn(),
    }
});

describe('AdminModule', () => {
    let module: AdminModule;
    let mockState: any;
    let mockRoom: any;
    let mockUserP: any;
    let mockUser: any;

    beforeEach(() => {
        module = new AdminModule();
        mockState = {
            broadcaster: {
                broadcast: vi.fn(),
                broadcastRoomUsers: vi.fn()
            },
            usersPriv: new Map(),
            users: [],
            modules: [],
            getStatsMessage: vi.fn(),
            sendInfos: vi.fn(),
            reEvalHardbans: vi.fn()
        };

        mockRoom = {};

        mockUser = {
            name: 'testUser',
            color: '#000000',
            id: 1
        };

        mockUserP = {
            host: {}, // capabilities
            ishost: new Permissions(),
            conn: { send: vi.fn(), close: vi.fn() },
            ipaddr: '127.0.0.1'
        };
    });

    describe('lock command', () => {
        it('should lock the room if user has Lock capability', () => {
            mockUserP.host = { Lock: true };

            const cmd = module.commands.find(c => c.name === 'lock');
            expect(cmd).toBeDefined();

            const result = cmd!.handler({ state: mockState, runtime: mockState, room: mockRoom, userp: mockUserP, user: mockUser } as any);

            expect(result).toBe(true);
            expect(module.locked).toBe(true);
            expect(mockState.broadcaster.broadcast).toHaveBeenCalled();
        });

        it('should not lock the room if user does not have Lock capability', () => {
            mockUserP.host = { Lock: false }; // No lock capability

            const cmd = module.commands.find(c => c.name === 'lock');

            const result = cmd!.handler({ state: mockState, runtime: mockState, room: mockRoom, userp: mockUserP, user: mockUser } as any);

            expect(result).toBe(false);
            expect(module.locked).toBe(false);
        });

        it('should unlock the room if called again', () => {
            mockUserP.host = { Lock: true };
            const cmd = module.commands.find(c => c.name === 'lock');

            // First call matches lock
            cmd!.handler({ state: mockState, runtime: mockState, room: mockRoom, userp: mockUserP, user: mockUser } as any);
            expect(module.locked).toBe(true);

            // Second call matches unlock
            vi.clearAllMocks(); // Clear previous broadcast call
            cmd!.handler({ state: mockState, runtime: mockState, room: mockRoom, userp: mockUserP, user: mockUser } as any);
            expect(module.locked).toBe(false);
            expect(mockState.broadcaster.broadcast).toHaveBeenCalledWith(expect.objectContaining({ message: 'The room is now unlocked' }));
        });
    });

    describe('superlock command', () => {
        it('should superlock if admin', async () => {
            mockUserP.host = { Admin: true };
            const cmd = module.commands.find(c => c.name === 'superlock');
            expect(cmd).toBeDefined();

            // Setup users to kick
            const normalUserP = { ...mockUserP, host: { Admin: false }, conn: { close: vi.fn() } };
            mockState.usersPriv.set(2, normalUserP);

            const result = cmd!.handler({ state: mockState, runtime: mockState, room: mockRoom, userp: mockUserP, user: mockUser } as any, 'Test Reason');

            expect(result).toBe(true);
            expect(module.superlocked).toBe(true);
            expect(module.superlockMessage).toBe('Test Reason');

            // Check if pruneuser was called
            const { pruneuser } = await import('../src/room-utils.js');
            expect(pruneuser).toHaveBeenCalled();
        });
    });

    describe('togglepublic command', () => {
        it('should toggle room visibility if RoomCreator', () => {
            mockUserP.host = { RoomCreator: true };
            const cmd = module.commands.find(c => c.name === 'togglepublic');

            // Initial state: private (key is undefined)
            mockRoom.key = undefined;
            cmd!.handler({ state: mockState, runtime: mockState, room: mockRoom, userp: mockUserP, user: mockUser } as any);
            expect(mockRoom.key).toBe(''); // Should become public
            expect(mockState.sendInfos).toHaveBeenCalled();

            // Toggle back to private
            cmd!.handler({ state: mockState, runtime: mockState, room: mockRoom, userp: mockUserP, user: mockUser } as any);
            expect(mockRoom.key).toBeUndefined(); // Should become private
            expect(mockState.sendInfos).toHaveBeenCalledTimes(2);
        });

        it('should fail if not RoomCreator', () => {
            mockUserP.host = { RoomCreator: false };
            const cmd = module.commands.find(c => c.name === 'togglepublic');

            const result = cmd!.handler({ state: mockState, runtime: mockState, room: mockRoom, userp: mockUserP, user: mockUser } as any);
            expect(result).toBe(false);
        });
    });

    describe('setnsfw command', () => {
        it('should set nsfw flag', () => {
            mockUserP.host = { RoomCreator: true };
            const cmd = module.commands.find(c => c.name === 'setnsfw');

            mockRoom.nsfw = false;
            cmd!.handler({ state: mockState, runtime: mockState, room: mockRoom, userp: mockUserP, user: mockUser } as any);
            expect(mockRoom.nsfw).toBe(true);
            expect(mockState.sendInfos).toHaveBeenCalled();
        });
    });

    describe('stats command', () => {
        it('should return stats if debug', () => {
            mockUserP.host = { Debug: true };
            mockState.getStatsMessage.mockReturnValue({ fake: 'stats' });

            const cmd = module.commands.find(c => c.name === 'stats');
            cmd!.handler({ state: mockState, runtime: mockState, room: mockRoom, userp: mockUserP, user: mockUser } as any);

            expect(mockState.getStatsMessage).toHaveBeenCalled();
            expect(send_system).toHaveBeenCalledWith(mockUserP, mockUser, '{"fake":"stats"}');
        });
    });
});
