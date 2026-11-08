import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlaylistModule } from '../src/commands/PlaylistModule.js';
import { EventEmitter } from 'events';
import { send_system } from '../src/room-utils.js';

// Mock room-utils
vi.mock('../src/room-utils.js', () => ({
    send_system: vi.fn(),
    sendAlert: vi.fn(),
}));

// Mock utils
vi.mock('../src/utils.js', () => ({
    shuffleArray: vi.fn(),
    nonRetardedAsyncExists: vi.fn().mockResolvedValue(true)
}));

// Mock index.js (helper functions)
vi.mock('../src/commands/index.js', () => ({
    spawnPromise: vi.fn().mockResolvedValue(Buffer.from('')),
    ChatModule: class { }
}));

describe('PlaylistModule', () => {
    let module: PlaylistModule;
    let mockState: any;
    let mockRoom: any;
    let mockUserP: any;
    let mockUser: any;
    let mockJuke: any;

    beforeEach(() => {
        vi.clearAllMocks();
        module = new PlaylistModule();
        mockJuke = {
            ee: new EventEmitter(),
            playFile: vi.fn()
        };

        mockState = {
            broadcaster: {
                broadcast: vi.fn()
            },
            juke: mockJuke,
            events: new EventEmitter()
        };

        mockRoom = {
            ext: {},
            groups: [],
            sets: [1], // length 1
            jukemusic: false
        };

        mockUser = {
            name: 'testUser',
            color: '#000000',
            id: 1
        };

        mockUserP = {
            host: {},
            ipaddr: '127.0.0.1',
            conn: { send: vi.fn() }
        };
    });

    describe('attach', () => {
        it('should subscribe to events and attach resources', () => {
            module.attach({ room: mockRoom, state: {}, runtime: mockState } as any);
            expect(module.room).toBe(mockRoom);
            expect(module.juke).toBe(mockJuke);
            expect(mockRoom.ext.playlist).toBeDefined();
        });
    });

    describe('pladd command (validation)', () => {
        beforeEach(() => {
            module.attach({ room: mockRoom, state: {}, runtime: mockState } as any);
        });

        it('should reject if not enough points', () => {
            module.currentPrice = 10;
            module.qtys['127.0.0.1'] = 5;

            const cmd = module.commands.find(c => c.name === 'pladd');
            // Usage: /pladd [amount] [url]
            cmd!.handler({ state: {}, runtime: mockState, room: mockRoom, userp: mockUserP, user: mockUser } as any, '11', 'http://youtube.com/v/test');

            expect(send_system).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.stringContaining('Connect more pieces first'));
        });

        it('should reject bad urls', () => {
            module.currentPrice = 0;
            module.qtys['127.0.0.1'] = 100;

            const cmd = module.commands.find(c => c.name === 'pladd');
            // Using a string that definitely triggers new URL() error
            cmd!.handler({ state: {}, runtime: mockState, room: mockRoom, userp: mockUserP, user: mockUser } as any, '2', 'invalid_url_string');
            expect(send_system).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.stringContaining('Bad URL'));
        });

        it('should reject non-youtube urls', () => {
            module.currentPrice = 0;
            module.qtys['127.0.0.1'] = 100;

            const cmd = module.commands.find(c => c.name === 'pladd');
            cmd!.handler({ state: {}, runtime: mockState, room: mockRoom, userp: mockUserP, user: mockUser } as any, '2', 'https://google.com');
            expect(send_system).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.stringContaining('Needs to be a youtube video'));
        });
    });

    describe('skipSong command', () => {
        beforeEach(() => {
            module.attach({ room: mockRoom, state: {}, runtime: mockState } as any);
            module.playlist = [
                { id: '1', title: 'Song 1', channel: 'c', skip: false, playcount: 0 },
                { id: '2', title: 'Song 2', channel: 'c', skip: false, playcount: 0 }
            ] as any;
            module.pidx = 0;
        });

        it('should skip specific index', () => {
            mockUserP.host = { Playlist: true };
            const cmd = module.commands.find(c => c.name === 'plskip');

            // Skip index 1
            cmd!.handler({ state: {}, runtime: mockState, room: mockRoom, userp: mockUserP, user: mockUser } as any, '1');

            expect(module.playlist[1].skip).toBe(true);
            expect(mockState.broadcaster.broadcast).toHaveBeenCalled();
        });

        it('should skip current song and play next if no index argument', () => {
            mockUserP.host = { Playlist: true };
            const cmd = module.commands.find(c => c.name === 'plskip');

            // Skip current (0)
            cmd!.handler({ state: {}, runtime: mockState, room: mockRoom, userp: mockUserP, user: mockUser } as any);

            expect(module.playlist[0].skip).toBe(true);
            // Should verify re-evaluation happened
            // Since pidx was 0, and we skipped it, reevaluatePlaylist should be called. 
            // Logic: this.pidx = this.nextTrackNumber(); this.reevaluatePlaylist(...)
            expect(module.pidx).not.toBe(0);
            expect(mockJuke.playFile).toHaveBeenCalled();
        });

        it('should fail if permission denined', () => {
            mockUserP.host = { Playlist: false };
            const cmd = module.commands.find(c => c.name === 'plskip');
            const res = cmd!.handler({ state: {}, runtime: mockState, room: mockRoom, userp: mockUserP, user: mockUser } as any);
            expect(res).toBe(false);
        });
    });
    describe('Serialization', () => {
        it('should serialize and deserialize state', () => {
            module.currentPrice = 100;
            module.qtys = { '1.2.3.4': 50 };
            module.playlist = [{ id: 'abc', title: 'Song', channel: 'C', skip: false, playcount: 0 }];
            module.pidx = 0;
            module.timeStarted = 123456;

            const data = module.serialize();

            const newModule = new PlaylistModule();
            // defaults
            expect(newModule.currentPrice).toBe(5);

            newModule.deserialize(data);

            expect(newModule.currentPrice).toBe(100);
            expect(newModule.qtys['1.2.3.4']).toBe(50);
            expect(newModule.playlist.length).toBe(1);
            expect(newModule.pidx).toBe(0);
            expect(newModule.timeStarted).toBe(123456);
        });

        it('should handle partial deserialization', () => {
            const newModule = new PlaylistModule();
            newModule.deserialize({});
            expect(newModule.currentPrice).toBe(5); // default
        });
    });
});
