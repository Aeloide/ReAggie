
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CleanupModule } from '../src/commands/CleanupModule.js';
import { RollbackModule } from '../src/commands/RollbackModule.js';
import { EventEmitter } from 'events';
import { Permissions } from '../src/utils.js';
import * as board from '../src/board.js';

// Mock board.js layoutAndSpreadGroups
vi.mock('../src/board.js', () => ({
    layoutAndSpreadGroups: vi.fn().mockImplementation((sets, rot, sep, scale, shuff, force, flip, skip, existingGroups) => {
        return { groups: existingGroups };
    })
}));

vi.mock('../src/mut.js', () => ({
    deserializeEBinaryRepr: vi.fn().mockReturnValue([
        { id: 1, set: 1, indices: [4], ids: [1] }, // Global index 4 (should be 0 in set 1)
        { id: 2, set: 0, indices: [0], ids: [2] }
    ])
}));

describe('Module Extras Coverage', () => {
    let mockState: any;
    let mockRoom: any;
    let mockUserP: any;
    let mockUser: any;

    beforeEach(() => {
        mockState = {
            events: new EventEmitter(),
            usersPriv: new Map(),
            users: new Map(),
            broadcaster: {
                broadcast: vi.fn(),
            },
            modules: [],
            binCodeHandlers: new Map(),
            transformedgroups: new Map(),
            frameGroupIds: []
        };
        const mockRuntime = {
            broadcaster: mockState.broadcaster,
            transformedgroups: mockState.transformedgroups,
            usersPriv: mockState.usersPriv,
            binCodeHandlers: mockState.binCodeHandlers,
            events: mockState.events
        };
        (mockState as any).runtime = mockRuntime;

        mockRoom = {
            sets: [
                { pieceWidth: 10, pieceHeight: 10, cols: 2, rows: 2 },
                { pieceWidth: 10, pieceHeight: 10, cols: 2, rows: 2 } // Set 1 starts at index 4
            ],
            groups: [],
            ext: {},
            boardWidth: 100,
            boardHeight: 100
        };

        mockUser = { name: 'host', color: '#fff', id: 1 };
        mockUserP = {
            host: { Cleanup: true, Rollback: true },
            ishost: new Permissions(['Cleanup', 'Rollback']),
            conn: { send: vi.fn() }
        };
    });

    describe('CleanupModule', () => {
        it('should handle frames in cleanup', () => {
            const module = new CleanupModule();

            // Setup frame groups
            const frameGroup = { id: 100, set: 0, x: 50, y: 50, rot: 0, indices: [0], ids: [100] };
            const frameGroupRot = { id: 101, set: 0, x: 80, y: 80, rot: 1, indices: [1], ids: [101] };

            mockRoom.groups = [frameGroup, frameGroupRot];
            mockState.transformedgroups.set(100, frameGroup);
            mockState.transformedgroups.set(101, frameGroupRot);
            mockState.frameGroupIds = [100, 101];

            module.attach({ state: mockState, runtime: (mockState as any).runtime, room: mockRoom } as any);
            const cmd = module.commands.find(c => c.name === 'cleanup');

            // Invoke
            cmd!.handler({ state: mockState, runtime: (mockState as any).runtime, room: mockRoom, userp: mockUserP } as any);

            // layoutAndSpreadGroups should check skipRectangles
            // We can check if getFrameExtent logic was covered by inspecting the mocked call args if needed
            // But just running it is enough for coverage lines 43-50
            expect(board.layoutAndSpreadGroups).toHaveBeenCalledWith(
                expect.anything(),
                undefined,
                undefined,
                expect.anything(),
                expect.anything(),
                expect.anything(),
                undefined,
                expect.arrayContaining([expect.anything(), expect.anything()]), // skipRectangles has 2 items
                expect.anything()
            );
        });
    });

    describe('RollbackModule', () => {
        it('should sanitize groups with multiple sets', () => {
            const module = new RollbackModule();
            module.attach({ state: mockState, runtime: (mockState as any).runtime, room: mockRoom } as any);

            // Trigger binary revert code
            const revertHandler = mockState.binCodeHandlers.get(0xBB);
            expect(revertHandler).toBeDefined();

            // Invoke
            const buffer = Buffer.alloc(10); // Dummy buffer, ignored by mock
            revertHandler(buffer, mockUserP, mockUser);

            // Verify room.groups were updated and sanitized
            const groupSet1 = mockRoom.groups.find((g: any) => g.set === 1);
            expect(groupSet1.indices[0]).toBe(0); // 4 - 4 (base) = 0

            const groupSet0 = mockRoom.groups.find((g: any) => g.set === 0);
            expect(groupSet0.indices[0]).toBe(0); // 0 - 0 (base) = 0

            expect(mockState.broadcaster.broadcast).toHaveBeenCalledWith(expect.objectContaining({ type: "room" }));
        });
    });
});
