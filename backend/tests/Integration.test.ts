vi.mock('web-push', () => ({
    default: {
        setVapidDetails: vi.fn(),
        sendNotification: vi.fn()
    }
}));

vi.mock('../src/db.js', () => ({
    infologsc: {
        insertOne: vi.fn()
    },
    mongoinit: vi.fn().mockResolvedValue(undefined),
    roomc: {
        findOne: vi.fn(),
        updateOne: vi.fn(),
        deleteOne: vi.fn()
    },
    tokensc: {
        findOne: vi.fn(),
    }
}));

vi.mock('../src/mut.js', () => ({
    loadRoom: vi.fn().mockResolvedValue([{}, {}, { sets: [] }]), // mock return tuple
}));

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { RoomState, UserPrivate, Room } from '../src/types.js';
import PollHandlers, { PollModule } from '../src/commands/PollModule.js';
import { VoteKickModule } from '../src/commands/VoteKickModule.js';
import { PlaylistModule } from '../src/commands/PlaylistModule.js';
import { ChatModule } from '../src/commands/index.js';
import { Permissions } from '../src/utils.js';

// Minimal mock for RoomBroadcaster
class MockBroadcaster {
    broadcast = vi.fn();
    broadcastRoomUsers = vi.fn();
    on = vi.fn();
}

// Minimal mock for WebSocket
class MockSocket {
    send = vi.fn();
    close = vi.fn();
}

// Helper to create a user
const createUser = (id: number, name: string, ip: string, isHost = false): UserPrivate => {
    return {
        ipaddr: ip,
        name: name,
        conn: new MockSocket() as any,
        processes: new Map(),
        host: {
            // Give all capabilities if host
            Kick: isHost,
            Poll: isHost,
            KickImmune: isHost,
            Playlist: isHost,
            ChangeRoomSettings: isHost,
            Lock: isHost,
            Restart: isHost,
            Delete: isHost,
            SlowMode: isHost,
            Cleanup: isHost,
            Rollback: isHost,
            Delegate: isHost,
            RoomCreator: isHost,
            ReadBanlist: isHost,
            Debug: isHost,
            Ban: isHost,
            Admin: isHost
        } as any,
        doDisconnect: vi.fn(),
        user: { id, name, color: '#fff', isHost: isHost ? 1 : 0 },
        // ... counters
        speed: { use: vi.fn() } as any,
        solves: { use: vi.fn() } as any,
        chats: { use: vi.fn() } as any,
        selects: { use: vi.fn() } as any,
        missedhb: 0,
        muter: { addClause: vi.fn(), removeClause: vi.fn(), shouldMute: vi.fn() } as any,
        asn: -1,
        ishost: isHost ? new Permissions(['RoomCreator']) : new Permissions(),
        pruned: false,
        unreliableReady: true,
        ipc: {} as any,
        generators: new Map(),
        commited: new Set()
    };
};

describe('Integration / Simulation Tests', () => {
    let state: RoomState;
    let runtime: any; // RoomRuntimeState
    let room: Room;
    let pollModule: PollModule;
    let voteKickModule: VoteKickModule;
    let playlistModule: PlaylistModule;

    // Simulation users
    let host: UserPrivate;
    let user1: UserPrivate;
    let user2: UserPrivate;

    beforeEach(() => {
        // Setup Modules
        pollModule = new PollModule();
        voteKickModule = new VoteKickModule();
        playlistModule = new PlaylistModule();

        const modules: ChatModule[] = [pollModule, voteKickModule, playlistModule];

        // Setup RoomState
        // Setup RoomState
        state = {
            gid: 0,
            secret: 'secret',
            bannedips: [],
            bannednames: [], // Added
            modstate: {},
            chatlog: [],
            frameGroupIds: [] // Added
        } as any;

        runtime = {
            users: [],
            usersPriv: new Map(),
            modules,
            events: new EventEmitter(),
            broadcaster: new MockBroadcaster() as any,
            binCodeHandlers: new Map(),
            transformedgroups: new Map(),
            processes: new Map(),
            archive: null as any,
            save: null as any
        } as any;

        // Setup Room
        room = {
            boardHeight: 1000,
            boardWidth: 1000,
            groups: [],
            hidePreview: false,
            jitter: 0,
            name: 'SimRoom',
            nolockunlock: false,
            nomultiselect: false,
            pieces: 100,
            rotation: false,
            flipping: false,
            seed: 123,
            sets: [],
            tabSize: 10,
            thumb: '',
            square: false,
            votekick: true // Enable votekick
        };

        // Attach modules
        modules.forEach(m => m.attach({ room, state, runtime }));

        // Register binary handlers manually for PollModule
        Object.entries(PollHandlers).forEach(([k, v]: [string, any]) => {
            runtime.binCodeHandlers.set(Number(k), v[1]);
        });

        // Create Users
        host = createUser(1, 'Host', '1.1.1.1', true);
        user1 = createUser(2, 'Alice', '2.2.2.2');
        user2 = createUser(3, 'Bob', '3.3.3.3');

        // Add users to state
        [host, user1, user2].forEach(u => {
            runtime.users.push(u.user);
            runtime.usersPriv.set(u.user.id, u);
            runtime.events.emit('joined', u, room, state);
        });
    });

    const runCommand = (u: UserPrivate, cmdStr: string) => {
        const parts = cmdStr.split(' ');
        const name = parts[0].substring(1); // remove /
        const args = parts.slice(1);

        let found = false;
        for (const mod of runtime.modules) {
            for (const cmd of mod.commands) {
                if (cmd.name === name) {
                    cmd.handler({ room, state, runtime, userp: u, user: u.user }, ...args);
                    found = true;
                }
            }
        }
        return found;
    };

    it('Scenario: Host runs a poll, users vote, host stops poll', () => {
        // 1. Host setup poll zones (PollModule requires zones or it auto-picks?
        // PollModule: startpoll -> sets up random kaos.
        // Needs setup?
        // Code: "this.setupState = this.setupPoll(state, choices);"
        // "this.setupState.next(); // kickstart"
        // Wait, setupPoll yields for zones? 
        // "for (const label of choices) { const region = (yield) as Rectangle; ..."
        // It waits for 'setupZone' command input.

        // 1. Host starts poll
        runCommand(host, '/startpoll Favorite?;Red;Blue');
        expect(pollModule.polling).toBe(false); // Waiting for setup
        expect(pollModule.setupState).toBeDefined();

        // 2. Define Zones (2 zones for Red and Blue)
        // Red Zone
        runCommand(host, '/setupZone 0 0 100 100');
        // Still setting up?
        // 2 choices -> 2 yields.
        // setupZone calls next().

        // Blue Zone
        runCommand(host, '/setupZone 200 200 300 300');

        // Should be polling now
        expect(pollModule.polling).toBe(true);
        expect(runtime.broadcaster.broadcast).toHaveBeenCalledWith(expect.objectContaining({ type: "zones" }), undefined);

        // 3. User1 moves a "kao" (kitten) to Red Zone
        // Kaos are at random positions.
        // We simulate a move binary packet?
        // Or we assume kaos are initially random.
        // We need to move a kaomoji to [50, 50] (Red).
        // Protocol: 0x41 (move)
        // Handler: kaomove(pl, userpriv).
        // pl: cmdid:1, kaoid:1, nx:4f, ny:4f.
        const kaoHandler = runtime.binCodeHandlers.get(0x41);
        expect(kaoHandler).toBeDefined();

        const movePacket = Buffer.alloc(10);
        movePacket[0] = 0x41; // cmd
        movePacket[1] = 0; // kao id 0
        movePacket.writeFloatLE(50, 2); // x
        movePacket.writeFloatLE(50, 6); // y

        const payload = { id: 0, x: 50, y: 50 };
        kaoHandler!(payload as any, movePacket, user1, room, state, runtime);

        // Verify kao moved
        expect(pollModule.kaos[0].pos[0]).toBeCloseTo(50);
        expect(pollModule.kaos[0].pos[1]).toBeCloseTo(50);

        // 4. Host stops poll
        runCommand(host, '/stoppoll');

        // Verify results
        expect(runtime.broadcaster.broadcast).toHaveBeenCalledWith(expect.objectContaining({
            message: expect.stringMatching(/Red: \d+ votes/)
        }));
    });

    it('Scenario: Users vote to kick someone', () => {
        // User1 votes to kick User2
        runCommand(user1, `/votekickid ${user2.user.id}`);

        // Should broadcast vote
        expect(runtime.broadcaster.broadcast).toHaveBeenCalledWith(expect.objectContaining({
            message: expect.stringContaining('Alice voted to kick Bob')
        }));

        // Threshold logic: 3 users. clamp(2, 3*0.6=1.8->2, 42). Need 2 votes.

        // Host votes to kick User2
        runCommand(host, `/votekickid ${user2.user.id}`);

        // Should trigger ban (mocked in unit test, but here we can check RoomState)
        // banuser calls p.conn.close
        const mockClose = (user2.conn as any).close;
        expect(mockClose).toHaveBeenCalledWith(4001, "Banned");

        // User2 should be in bannedips
        expect(state.bannedips).toContain('3.3.3.3');
    });

    it('Scenario: Integration command not found', () => {
        const result = runCommand(user1, '/nonexistentxyz');
        expect(result).toBe(false);
    });
});
