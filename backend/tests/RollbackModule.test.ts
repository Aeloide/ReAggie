import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RollbackModule } from '../src/commands/RollbackModule.js';
import { EventEmitter } from 'events';

vi.mock('../src/mut.js', () => ({
    deserializeEBinaryRepr: vi.fn(),
}));

describe('RollbackModule', () => {
    let module: RollbackModule;
    let mockState: any;
    let mockRoom: any;
    let mockUserP: any;
    let mockUser: any;

    beforeEach(() => {
        vi.clearAllMocks();
        module = new RollbackModule();

        mockState = {
            broadcaster: {
                broadcast: vi.fn()
            },
            binCodeHandlers: new Map(),
            transformedgroups: new Map(),
            events: new EventEmitter()
        };

        mockRoom = {
            sets: [{ cols: 2, rows: 2 }],
            groups: [],
            ext: {}
        };

        mockUser = {
            name: 'testUser',
            color: '#000000',
            id: 1
        };

        mockUserP = {
            host: {},
            conn: { send: vi.fn() }
        };
    });

    describe('attach', () => {
        it('should register binary code handler', () => {
            module.attach({ room: mockRoom, state: {}, runtime: mockState } as any);
            expect(mockState.binCodeHandlers.has(0xBB)).toBe(true);
        });

        it('should handle revert logic via binary handler', async () => {
            module.attach({ room: mockRoom, state: {}, runtime: mockState } as any);
            const handler = mockState.binCodeHandlers.get(0xBB);

            mockUserP.host.Rollback = true;

            const { deserializeEBinaryRepr } = await import('../src/mut.js');
            const mockGroups = [{ id: 1, ids: [2], set: 0, indices: [0] }];
            (deserializeEBinaryRepr as any).mockReturnValue(mockGroups);

            // Mock buffer payload
            const pl = Buffer.alloc(10);

            handler(pl, mockUserP, mockUser);

            expect(deserializeEBinaryRepr).toHaveBeenCalled();
            expect(mockState.transformedgroups.has(1)).toBe(true);
            expect(mockState.transformedgroups.has(2)).toBe(true);
            expect(mockState.broadcaster.broadcast).toHaveBeenCalledWith(expect.objectContaining({ type: 'room' }));
        });

        it('should ignore revert if no permission', () => {
            module.attach({ room: mockRoom, state: {}, runtime: mockState } as any);
            const handler = mockState.binCodeHandlers.get(0xBB);
            mockUserP.host.Rollback = false;

            const pl = Buffer.alloc(10);
            handler(pl, mockUserP, mockUser);

            expect(mockState.broadcaster.broadcast).not.toHaveBeenCalled();
        });
    });

    describe('revert command', () => {
        it('should warn about command deprecation if authorized', () => {
            mockUserP.host.Rollback = true;
            const cmd = module.commands.find(c => c.name === 'revert');

            cmd!.handler({ state: {}, runtime: mockState, room: mockRoom, userp: mockUserP, user: mockUser } as any);

            expect(mockUserP.conn.send).toHaveBeenCalledWith(expect.stringContaining('does not exist anymore'));
        });

        it('should do nothing if unauthorized', () => {
            mockUserP.host.Rollback = false;
            const cmd = module.commands.find(c => c.name === 'revert');
            const res = cmd!.handler({ state: {}, runtime: mockState, room: mockRoom, userp: mockUserP, user: mockUser } as any);
            expect(res).toBe(false);
            expect(mockUserP.conn.send).not.toHaveBeenCalled();
        });
    });

    describe('resync command', () => {
        it('should resync if authorized', () => {
            mockUserP.host.Rollback = true;
            const cmd = module.commands.find(c => c.name === 'resync');

            cmd!.handler({ state: {}, runtime: mockState, room: mockRoom, userp: mockUserP, user: mockUser } as any);
            expect(mockState.broadcaster.broadcast).toHaveBeenCalledWith(expect.objectContaining({ type: 'room' }));
        });

        it('should fail if unauthorized', () => {
            mockUserP.host.Rollback = false;
            const cmd = module.commands.find(c => c.name === 'resync');

            const res = cmd!.handler({ state: {}, runtime: mockState, room: mockRoom, userp: mockUserP, user: mockUser } as any);
            expect(res).toBe(false);
        });
    });
});
