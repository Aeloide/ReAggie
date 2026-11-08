import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RoomBroadcaster } from '../../src/core/room-broadcaster.js';

describe('RoomBroadcaster', () => {
    let broadcaster: RoomBroadcaster;
    let mockRuntime: any;

    beforeEach(() => {
        mockRuntime = {
            usersPriv: new Map(),
            users: []
        };
        broadcaster = new RoomBroadcaster({} as any, mockRuntime);
    });

    it('should broadcast text message to all users', () => {
        const send1 = vi.fn();
        const send2 = vi.fn();

        mockRuntime.usersPriv.set(1, { conn: { send: send1 } });
        mockRuntime.usersPriv.set(2, { conn: { send: send2 } });

        const msg = { type: 'chat', text: 'hello' };
        broadcaster.broadcast(msg);

        expect(send1).toHaveBeenCalledWith(JSON.stringify(msg));
        expect(send2).toHaveBeenCalledWith(JSON.stringify(msg));
    });

    it('should broadcast binary message', () => {
        const send1 = vi.fn();
        mockRuntime.usersPriv.set(1, { conn: { send: send1 } });

        const buf = Buffer.from('hello');
        broadcaster.broadcast(buf);

        expect(send1).toHaveBeenCalledWith(buf);
    });

    it('should skip specified user', () => {
        const send1 = vi.fn();
        const send2 = vi.fn();

        mockRuntime.usersPriv.set(1, { conn: { send: send1 } });
        mockRuntime.usersPriv.set(2, { conn: { send: send2 } });

        const msg = { type: 'hi' };
        broadcaster.broadcast(msg, 1);

        expect(send1).not.toHaveBeenCalled();
        expect(send2).toHaveBeenCalledWith(JSON.stringify(msg));
    });

    it('should skip user id zero', () => {
        const send0 = vi.fn();
        const send1 = vi.fn();
        mockRuntime.usersPriv.set(0, { conn: { send: send0 } });
        mockRuntime.usersPriv.set(1, { conn: { send: send1 } });

        broadcaster.broadcast({ type: 'hi' }, 0);

        expect(send0).not.toHaveBeenCalled();
        expect(send1).toHaveBeenCalled();
    });

    it('should reconnect a backpressured client instead of growing memory without bound', () => {
        const send = vi.fn();
        const close = vi.fn();
        mockRuntime.usersPriv.set(1, {
            conn: {
                readyState: 1,
                bufferedAmount: 65 * 1024 * 1024,
                send,
                close
            }
        });

        broadcaster.broadcast({ type: 'hi' });

        expect(send).not.toHaveBeenCalled();
        expect(close).toHaveBeenCalledWith(1013, 'Client cannot keep up');
    });

    it('should not break game-state delivery when a replay listener throws', () => {
        const send = vi.fn();
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        mockRuntime.usersPriv.set(1, { conn: { send } });
        broadcaster.on('broadcast', () => { throw new Error('disk failure'); });

        expect(() => broadcaster.broadcast({ type: 'hi' })).not.toThrow();
        expect(send).toHaveBeenCalled();
        consoleError.mockRestore();
    });


});
