import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PollModule } from '../src/commands/PollModule.js';
// fs mocks removed to avoid resolution issues. 
// PollModule.ts refactoring (initTracks skipped in test env) ensures no fs calls happen during import.

// Mock module deps
import { send_system } from '../src/room-utils.js';
vi.mock('../src/room-utils.js', () => ({
    send_system: vi.fn()
}));

import { EventEmitter } from 'events';

describe('PollModule', () => {
    let module: PollModule;
    let mockState: any;
    let mockRoom: any;
    let mockUserP: any;
    let mockUser: any;

    beforeEach(() => {
        vi.clearAllMocks();
        module = new PollModule();
        mockState = {
            events: new EventEmitter(),
            usersPriv: new Map(),
            users: [],
            broadcaster: { broadcast: vi.fn() },
            binCodeHandlers: new Map()
        };
        mockRoom = {
            boardWidth: 1000,
            boardHeight: 1000
        };
        mockUserP = {
            host: { Poll: true },
            conn: { send: vi.fn() }
        };
        mockUser = { id: 1 };
        module.attach({ room: mockRoom, state: {}, runtime: mockState } as any);
    });



    it('should start setting up poll', () => {
        const cmd = module.commands.find(c => c.name === 'startpoll');
        cmd!.handler({ room: mockRoom, state: {}, runtime: mockState, userp: mockUserP, user: mockUser } as any, 'Question;A;B');

        expect(module.question).toBe('Question');
        expect(module.kaos.length).toBeGreaterThan(0);
        expect(module.setupState).toBeDefined();
    });

    it('should accept zone inputs', () => {
        const startCmd = module.commands.find(c => c.name === 'startpoll');
        startCmd!.handler({ room: mockRoom, state: {}, runtime: mockState, userp: mockUserP, user: mockUser } as any, 'Question;Op1;Op2');

        const zoneCmd = module.commands.find(c => c.name === 'setupZone');
        // Op1 zone
        zoneCmd!.handler({ room: mockRoom, state: {}, runtime: mockState, userp: mockUserP, user: mockUser } as any, '0', '0', '10', '10');

        expect(module.zones.length).toBe(1);
        expect(module.zones[0][0]).toBe('Op1');
        expect(module.polling).toBe(false); // Only 1 of 2 zones set

        // Op2 zone
        zoneCmd!.handler({ room: mockRoom, state: {}, runtime: mockState, userp: mockUserP, user: mockUser } as any, '20', '20', '30', '30');
        expect(module.zones.length).toBe(2);

        // Should finish setup and start polling
        expect(module.polling).toBe(true);
        expect(mockState.broadcaster.broadcast).toHaveBeenCalledWith(expect.objectContaining({ type: 'zones' }), undefined);
    });

    it('should stop poll and count votes', () => {
        module.question = 'Q';
        module.zones = [['A', [[0, 0], [100, 100]]], ['B', [[200, 200], [300, 300]]]];
        module.kaos = [{ pos: [50, 50] }, { pos: [50, 50] }, { pos: [250, 250] }]; // 2 for A, 1 for B
        module.polling = true;

        const cmd = module.commands.find(c => c.name === 'stoppoll');
        cmd!.handler({ room: mockRoom, state: {}, runtime: mockState, userp: mockUserP, user: mockUser } as any);

        expect(module.polling).toBe(false);
        expect(mockState.broadcaster.broadcast).toHaveBeenCalledWith(expect.objectContaining({
            message: expect.stringContaining('A: 2 votes')
        }));
    });
    describe('Serialization', () => {
        it('should serialize and deserialize state', () => {
            module.question = 'Q';
            module.polling = true;
            module.zones = [['A', [[0, 0], [10, 10]]]];
            module.kaos = [{ pos: [5, 5] }];
            module.track = [1, 2, 3];

            const data = module.serialize();

            const newModule = new PollModule();
            newModule.deserialize(data);

            expect(newModule.question).toBe('Q');
            expect(newModule.polling).toBe(true);
            expect(newModule.zones.length).toBe(1);
            expect(newModule.kaos.length).toBe(1);
            expect(newModule.track).toEqual([1, 2, 3]);
        });

        it('should handle empty deserialization', () => {
            module.deserialize(null);
            // Should not crash
        });
    });
});
