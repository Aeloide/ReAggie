import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CleanupModule } from '../src/commands/CleanupModule.js';

// Mock board.js
vi.mock('../src/board.js', () => ({
    layoutAndSpreadGroups: vi.fn(() => ({ groups: [] }))
}));

// Mock utils
vi.mock('../src/utils.js', () => ({
    clamp: (min: number, v: number, max: number) => v < min ? min : (v > max ? max : v)
}));

describe('CleanupModule', () => {
    let module: CleanupModule;
    let mockState: any;
    let mockRoom: any;
    let mockUserP: any;
    let mockUser: any;

    beforeEach(() => {
        module = new CleanupModule();
        mockState = {
            broadcaster: {
                broadcast: vi.fn()
            },
            usersPriv: new Map(),
            frameGroupIds: [],
            lastMovedGroups: new Map()
        };
        const mockRuntime = {
            broadcaster: mockState.broadcaster,
            transformedgroups: new Map(),
            usersPriv: mockState.usersPriv,
            lastMovedGroups: mockState.lastMovedGroups
        };
        (mockState as any).runtime = mockRuntime; // Hack for easier access in tests if needed, but mainly we pass it explicitly

        mockRoom = {
            sets: [],
            groups: [],
            boardWidth: 1000,
            boardHeight: 1000,
            ext: {}
        };

        mockUser = {
            name: 'testUser',
            color: '#000000',
            id: 1
        };

        mockUserP = {
            host: {},
            ipaddr: '127.0.0.1'
        };
    });

    describe('cleanup command', () => {
        it('should check permissions', () => {
            mockUserP.host = { Cleanup: false };
            const cmd = module.commands.find(c => c.name === 'cleanup');
            const result = cmd!.handler({ state: mockState, runtime: (mockState as any).runtime, room: mockRoom, userp: mockUserP, user: mockUser } as any);
            expect(result).toBe(false);
        });

        it('should execute cleanup logic and broadcast', async () => {
            mockUserP.host = { Cleanup: true };
            const { layoutAndSpreadGroups } = await import('../src/board.js');
            const mockGroups = [{ id: 1, x: 0, y: 0 }];

            // Mock layout function return
            (layoutAndSpreadGroups as any).mockReturnValue({ groups: mockGroups });
            mockRoom.groups = [{ id: 1, x: 100, y: 100 }];

            const cmd = module.commands.find(c => c.name === 'cleanup');
            const result = cmd!.handler({ state: mockState, runtime: (mockState as any).runtime, room: mockRoom, userp: mockUserP, user: mockUser } as any);

            expect(result).toBe(true);
            expect(layoutAndSpreadGroups).toHaveBeenCalled();
            expect(mockState.broadcaster.broadcast).toHaveBeenCalled();
            // Should verify buffer content ideally, but verifying call is sufficient for logic flow
        });

        it('should clear lastMovedGroups', async () => {
            mockUserP.host = { Cleanup: true };
            const { layoutAndSpreadGroups } = await import('../src/board.js');
            (layoutAndSpreadGroups as any).mockReturnValue({ groups: [] });

            mockState.lastMovedGroups.set({}, {}); // ensure it's not empty

            const cmd = module.commands.find(c => c.name === 'cleanup');
            cmd!.handler({ state: mockState, runtime: (mockState as any).runtime, room: mockRoom, userp: mockUserP, user: mockUser } as any);

            expect(mockState.lastMovedGroups.size).toBe(0);
        });
    });
});
