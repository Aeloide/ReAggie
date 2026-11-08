import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlaylistModule } from '../src/commands/PlaylistModule.js';
import { EventEmitter } from 'events';

// Mocks
vi.mock('../src/room-utils.js', () => ({
    send_system: vi.fn(),
    sendAlert: vi.fn(),
}));

vi.mock('../src/utils.js', () => ({
    shuffleArray: vi.fn(),
    nonRetardedAsyncExists: vi.fn().mockResolvedValue(true)
}));

vi.mock('../src/commands/index.js', () => ({
    spawnPromise: vi.fn().mockResolvedValue(Buffer.from('')),
    ChatModule: class { }
}));

describe('Playlist Looping Logic', () => {
    let module: PlaylistModule;
    let mockState: any;
    let mockRoom: any;
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
            sets: [1],
            jukemusic: false
        };

        module.attach({ room: mockRoom, state: {}, runtime: mockState } as any);
        module.currentPrice = 0;
        module.qtys['127.0.0.1'] = 100;
    });

    it('should play a single song repeatedly', () => {
        // Add 1 song
        module.addLocalFile('song1.mp3', mockState.broadcaster);

        expect(module.playlist.length).toBe(1);
        expect(module.pidx).toBe(0);
        expect(mockJuke.playFile).toHaveBeenCalledWith('./assets/song1.mp3', 0);
        expect(module.playlist[0].playcount).toBe(0);

        // Finish song 1
        mockJuke.ee.emit('playfinished');

        // Should play again
        expect(module.playlist[0].playcount).toBe(1);
        expect(module.pidx).toBe(0);
        // Playfile called again? 
        expect(mockJuke.playFile).toHaveBeenCalledTimes(2);

        // Finish again
        mockJuke.ee.emit('playfinished');
        expect(module.playlist[0].playcount).toBe(2);
        expect(mockJuke.playFile).toHaveBeenCalledTimes(3);
    });

    it('should cycle through two songs', () => {
        module.addLocalFile('song1.mp3', mockState.broadcaster);
        module.addLocalFile('song2.mp3', mockState.broadcaster);

        // Validating assumptions about playlist and playback
        expect(module.playlist.length).toBe(2);
        expect(module.pidx).toBe(0); // Playing song 1 initially
        expect(mockJuke.playFile).toHaveBeenCalledWith('./assets/song1.mp3', 0);

        // Finish song 1
        mockJuke.ee.emit('playfinished');

        // Should be song 2 (index 1) because it has playcount 0
        expect(module.pidx).toBe(1);
        expect(mockJuke.playFile).toHaveBeenCalledWith('./assets/song2.mp3', 0);

        // Finish song 2
        mockJuke.ee.emit('playfinished');

        // Both played once. Should reshuffle/backlog.
        // Logic might pick either based on shuffle, but backlog ensures strict order if not shuffled?
        // Actually code shuffles backlog. But shuffleArray is mocked to do nothing?
        // If shuffleArray does nothing, order is preserved [song1, song2].
        // But logic says: "if the first song in new backlog was just played, push back to middle".
        // Playlist is [s1, s2]. Last played s2.
        // Backlog = [s1, s2]. 
        // s1 != s2. So it picks s1.

        expect(module.pidx).toBe(0);
        expect(mockJuke.playFile).toHaveBeenCalledWith('./assets/song1.mp3', 0);
    });
});
