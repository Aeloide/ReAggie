
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RoomBroadcaster } from '../src/core/room-broadcaster.js';
import { EventEmitter } from 'events';

describe('RoomBroadcaster Extended', () => {
    let broadcaster: RoomBroadcaster;
    let mockState: any;
    let mockRuntime: any;

    beforeEach(() => {
        mockState = {
        };
        mockRuntime = {
            users: [],
            usersPriv: new Map()
        }
        broadcaster = new RoomBroadcaster(mockState, mockRuntime);
    });

    it('should broadcastRoomUsers', () => {
        const user1 = { id: 1, name: 'u1' };
        // Mock ishost with a Permissions-like object
        const priv1 = { ishost: { has: (p: string) => p === 'RoomCreator', toLegacy: () => 1, perms: ['RoomCreator'] }, conn: { send: vi.fn() } };

        mockRuntime.users = [user1];
        mockRuntime.usersPriv.set(1, priv1);

        broadcaster.broadcastRoomUsers();

        expect(priv1.conn.send).toHaveBeenCalledWith(expect.stringContaining('"type":"users"'));
        expect(priv1.conn.send).toHaveBeenCalledWith(expect.stringContaining('"isHost":["RoomCreator"]'));
    });



    it('should transmit buffer using connection', () => {
        const priv1 = {
            conn: { send: vi.fn() },
        };
        mockRuntime.usersPriv.set(1, priv1);

        const buffer = Buffer.from('test');
        broadcaster.broadcast(buffer, undefined, true);

        expect(priv1.conn.send).toHaveBeenCalledWith(buffer);
    });

    it('should handle skip parameter on broadcast', () => {
        const priv1 = { conn: { send: vi.fn() } };
        const priv2 = { conn: { send: vi.fn() } };
        mockRuntime.usersPriv.set(1, priv1);
        mockRuntime.usersPriv.set(2, priv2);

        broadcaster.broadcast({ type: 'test' }, 1); // skip 1

        expect(priv1.conn.send).not.toHaveBeenCalled();
        expect(priv2.conn.send).toHaveBeenCalled();
    });

    it('should support object messages', () => {
        const priv1 = { conn: { send: vi.fn() } };
        mockRuntime.usersPriv.set(1, priv1);

        broadcaster.broadcast({ type: 'foo', val: 1 });
        expect(priv1.conn.send).toHaveBeenCalledWith(expect.stringContaining('foo'));
    });

});
