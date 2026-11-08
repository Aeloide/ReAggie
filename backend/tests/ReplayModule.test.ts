import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReplayModule } from '../src/commands/ReplayModule.js';
import { EventEmitter } from 'events';

// Mock ReplayWriter
const mockWrite = vi.fn();
const mockSetStartTime = vi.fn();
const mockEnd = vi.fn();
const mockEndAndCompress = vi.fn();

vi.mock('../src/core/replay-writer.js', () => ({
    ReplayWriter: class {
        constructor() { }
        write = mockWrite;
        setStartTime = mockSetStartTime;
        end = mockEnd;
        endAndCompress = mockEndAndCompress;
    }
}));

describe('ReplayModule', () => {
    let module: ReplayModule;
    let mockState: any;
    let mockRoom: any;

    beforeEach(() => {
        vi.clearAllMocks();
        module = new ReplayModule();
        mockState = {
            broadcaster: new EventEmitter(),
            events: new EventEmitter()
        };
        mockState.broadcaster.broadcastRoomUsers = vi.fn().mockImplementation(() => {
            mockState.broadcaster.emit('broadcast', 'users', 'dummy');
        });
        mockRoom = {
            startTime: 12345
        };
    });

    it('should initialize writer on startup', () => {
        module.attach({ room: mockRoom, state: {}, runtime: mockState } as any);
        expect(module.replayWriter).toBeDefined();
        // Expect writer to be created with room.startTime
    });

    it('should write broadcast messages', () => {
        module.attach({ room: mockRoom, state: {}, runtime: mockState } as any);

        // Simulate broadcast
        mockState.broadcaster.emit('broadcast', 'binary', 'bin-data');

        expect(mockWrite).toHaveBeenCalledWith('bin-data');
    });

    it('should write initial room state first', () => {
        module.attach({ room: mockRoom, state: {}, runtime: mockState } as any);

        mockState.broadcaster.emit('broadcast', 'binary', 'msg1');

        // first call should be room state JSON
        expect(mockWrite).toHaveBeenNthCalledWith(1, expect.stringContaining('"type":"room"'));
        // second call should be msg1
        expect(mockWrite).toHaveBeenNthCalledWith(2, 'msg1');
    });

    it('should handle lifecycle events', () => {
        mockRoom.startTime = 0; // Simulate not started
        module.attach({ room: mockRoom, state: {}, runtime: mockState } as any);

        mockState.events.emit('setStart');
        expect(mockSetStartTime).toHaveBeenCalled();

        mockState.events.emit('setEnd');
        expect(mockEndAndCompress).toHaveBeenCalled();

        mockState.events.emit('exit');
        expect(mockEnd).toHaveBeenCalled();
    });
});
