
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { WebSocket } from 'ws';
import * as db from '../src/db.js';

// Mocks
const mocks = vi.hoisted(() => ({
    sendNotification: vi.fn(),
    tokensFindOne: vi.fn(),
    followersFindOne: vi.fn(),
    tokensInsertOne: vi.fn(),
    roomUsersBroadcast: vi.fn(),
    infologInsert: vi.fn().mockImplementation((doc) => {
        // console.error('INFOLOG:', doc); // Log errors to stdout for debugging
    })
}));

// Mock db
vi.mock('../src/db.js', () => ({
    tokensc: {
        findOne: mocks.tokensFindOne,
        insertOne: mocks.tokensInsertOne
    },
    followersc: {
        findOne: mocks.followersFindOne,
        updateOne: vi.fn()
    },
    badgoys: {
        findOne: vi.fn().mockResolvedValue(null)
    },
    rearmNotificationTimer: vi.fn(),
    mongoinit: vi.fn(),
    FollowPermissions: {
        JoinPublic: 1,
        JoinPrivate: 2
    },
    infologsc: { insertOne: mocks.infologInsert },
    publicWarns: {},
    reports: {},
    roomc: { findOne: vi.fn().mockResolvedValue({ _id: 'test', settings: {} }) },
    banlist: {},
    warnlist: {},
    asncapc: {},
    intentc: {},
    goodgoys: {},
    forbidden: {},
    comicc: {},
    failedRequests: {},
    playersc: {},
    playerViews: {},
    assetc: {},
    bingoc: {},
    bingocondsc: {},
    Token: class { } // Mock Token class if used as type or value
}));

// Mock web-push
vi.mock('web-push', () => ({
    default: {
        setVapidDetails: vi.fn(),
        sendNotification: mocks.sendNotification.mockResolvedValue({})
    }
}));

// Mock ws
vi.mock('ws', () => {
    return {
        WebSocket: class MockWS extends EventEmitter {
            send = vi.fn();
            close = vi.fn();
            terminate = vi.fn();
            ping = vi.fn();
        },
        default: {
            WebSocket: class MockWS extends EventEmitter { }
        }
    }
});

// Mock mut.js
vi.mock('../src/mut.js', () => ({
    loadRoom: vi.fn().mockResolvedValue([
        {}, // roomstate
        {   // runtime
            modules: [{ name: 'admin', synced: true }],
            events: new EventEmitter(),
            broadcaster: {
                broadcastRoomUsers: mocks.roomUsersBroadcast,
                broadcast: vi.fn()
            },
            archive: { refresh: vi.fn() }, // Added archive mock
            users: [],
            usersPriv: new Map()
        },
        {   // thisroom
            sets: [],
            ext: {},
            key: undefined,
            name: 'TestRoom',
            pieces: 100,
            boardHeight: 1000,
            boardWidth: 1000,
            rotation: false,
            flipping: false,
            seed: 123,
            tabSize: 10,
            thumb: '',
            square: false,
            auth: false,
            nsfw: false,
            hidePreview: false,
            jitter: 0,
            nolockunlock: false,
            nomultiselect: false
        },
        {} // juke
    ]),
    saveRoom: vi.fn(),
    pruneRoom: vi.fn()
}));

vi.mock('../src/client-ipc.js', () => ({
    reconnectToServer: vi.fn(),
    setParentFd: vi.fn(),
    extractSocket: vi.fn()
}));

import * as RoomModule from '../src/room.js';
import connectionFlow from '../src/connectionFlow.js';




describe('Integration Notifications', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2020-01-01'));
        vi.clearAllMocks();

        // Setup room state
        RoomModule.setThisRoom({
            key: undefined, // Public room
            name: 'TestRoom',
            groups: [],
            sets: [],
            pieces: 100,
            boardHeight: 1000,
            boardWidth: 1000,
            rotation: false,
            flipping: false,
            seed: 123,
            tabSize: 10,
            thumb: '',
            square: false,
            auth: false,
            nsfw: false,
            hidePreview: false,
            jitter: 0,
            nolockunlock: false,
            nomultiselect: false
        });

        RoomModule.setRuntime({
            users: [],
            usersPriv: new Map(),
            modules: [],
            events: new EventEmitter(),
            broadcaster: {
                broadcastRoomUsers: mocks.roomUsersBroadcast,
                broadcast: vi.fn(),
                emit: vi.fn()
            },
            archive: { refresh: vi.fn() }, // Added archive mock
            binCodeHandlers: new Map(),
            transformedgroups: new Map(),
            slow: { allowed: new Set() },
            ipJoinLimit: {},
            nameJoinLimit: {},
            groupownersbyip: new Map(),
            lastMovedGroups: new Map(),
            trustees: new Map(),
            connectionFlow
        } as any);

        RoomModule.setRoomState({
            gid: 1,
            secret: 'secret',
            bannedips: [],
            chatlog: [],
            modstate: {},
            iplog: [],
            hist: {}
        });

    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should send notification to followers after delay', async () => {
        const tokenStr = 'test-token';
        const subkey = 'https://example.com/endpoint';

        mocks.tokensFindOne.mockResolvedValue({
            token: tokenStr,
            name: 'TestUser',
            mutelist: [],
            last_notification: [0, 0, 0, 0],
            followers: [{ subkey, permissions: 3 }]
        });

        mocks.followersFindOne.mockResolvedValue({
            subkey,
            sub: { endpoint: subkey },
            last_seen: Date.now()
        });

        const mockConn: any = new WebSocket(null as any);

        const mockReq: any = {
            headers: {},
            socket: { remoteAddress: '127.0.0.1' },
            connection: { remoteAddress: '127.0.0.1' }
        };

        const userMsg = {
            type: 'user',
            name: 'TestUser',
            color: '#ffffff',
            token: tokenStr
        };

        await RoomModule.newConnection(mockConn as any, mockReq, userMsg);

        expect(mocks.tokensFindOne).toHaveBeenCalled();

        // Capture NID from 'me' message
        const meCall = mockConn.send.mock.calls.find((c: any[]) => {
            if (typeof c[0] !== 'string') return false;
            try { return JSON.parse(c[0]).type === 'me'; } catch { return false; }
        });
        const nid = JSON.parse(meCall[0]).id;

        const sendHeartbeat = () => {
            const buf = Buffer.alloc(3);
            buf.writeUInt8(0x0b, 0);
            buf.writeInt16LE(nid, 1);
            mockConn.emit('message', buf, true);
        };

        // Advance 60s+ with heartbeats
        for (let i = 0; i < 7; i++) {
            await vi.advanceTimersByTimeAsync(10000); // 10s
            sendHeartbeat();
        }

        expect(mocks.sendNotification).toHaveBeenCalled();
        expect(mocks.sendNotification).toHaveBeenCalledWith(
            expect.objectContaining({ endpoint: subkey }),
            expect.any(Buffer),
            expect.anything()
        );
    });

    it('should NOT send notification if user disconnects before delay', async () => {
        const tokenStr = 'quick-leave';
        const subkey = 'https://example.com/endpoint';

        mocks.tokensFindOne.mockResolvedValue({
            token: tokenStr,
            name: 'Leaver',
            mutelist: [],
            last_notification: [0, 0, 0, 0],
            followers: [{ subkey, permissions: 1 }]
        });
        mocks.followersFindOne.mockResolvedValue({ subkey, last_seen: Date.now() });

        const mockConn: any = new WebSocket(null as any);
        const mockReq: any = { headers: {}, socket: { remoteAddress: '1.2.3.4' } };

        await RoomModule.newConnection(mockConn, mockReq, { type: 'user', name: 'Leaver', color: '#000000', token: tokenStr });

        await vi.advanceTimersByTimeAsync(30000);
        expect(mocks.sendNotification).not.toHaveBeenCalled();
    });
});
