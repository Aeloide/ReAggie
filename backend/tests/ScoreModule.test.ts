import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScoreModule } from '../src/commands/ScoreModule.js';
import { EventEmitter } from 'events';
import { send_system } from '../src/room-utils.js';

vi.mock('../src/room-utils.js', () => ({
    send_system: vi.fn()
}));

describe('ScoreModule', () => {
    let module: ScoreModule;
    let mockState: any;
    let mockRoom: any;

    beforeEach(() => {
        vi.clearAllMocks();
        module = new ScoreModule();
        mockState = {
            events: new EventEmitter(),
            usersPriv: new Map(),
        };
        mockRoom = { ext: {} };
    });

    it('should track scores on joined event', () => {
        module.attach({ room: mockRoom, state: {}, runtime: mockState } as any);

        const user = { name: 'Player1' };
        mockState.events.emit('joined', user);

        expect(module.scores['Player1']).toBe(1);

        mockState.events.emit('joined', user);
        expect(module.scores['Player1']).toBe(2);
    });

    it('should show leaderboard', () => {
        module.attach({ room: mockRoom, state: {}, runtime: mockState } as any);
        module.scores = {
            'Alice': 10,
            'Bob': 5
        };

        const cmd = module.commands.find(c => c.name === 'scores');
        expect(cmd).toBeDefined();

        const mockUserP = {};
        const mockUser = {};

        cmd!.handler({ userp: mockUserP, user: mockUser, runtime: mockState } as any);

        expect(send_system).toHaveBeenCalledWith(
            mockUserP,
            mockUser,
            expect.stringContaining('1. Alice (10 pts.)\n2. Bob (5 pts.)')
        );
    });

    it('should serialize and deserialize', () => {
        module.scores = { 'Test': 123 };
        const data = module.serialize();
        expect(data).toEqual({ scores: { 'Test': 123 } });

        const newModule = new ScoreModule();
        newModule.deserialize(data);
        expect(newModule.scores).toEqual({ 'Test': 123 });
    });
});
