import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Jukebox } from '../src/Jukebox.js';

vi.mock('fluent-ffmpeg', () => ({
    default: {
        ffprobe: vi.fn((file, cb) => cb(null, { format: { duration: 10 } }))
    }
}));

describe('Jukebox', () => {
    let jukebox: Jukebox;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        jukebox = new Jukebox();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should emit playfinished after duration', () => {
        const spy = vi.spyOn(jukebox.ee, 'emit');
        jukebox.playFile('test.mp3');

        expect(jukebox.currentfile).toBe('test.mp3');
        expect(jukebox.playing).toBe(true);

        // Fast forward 10 seconds
        vi.advanceTimersByTime(10000);

        expect(spy).toHaveBeenCalledWith('playfinished');
    });

    it('should adjust timeout based on start time', () => {
        const spy = vi.spyOn(jukebox.ee, 'emit');
        jukebox.playFile('test.mp3', 5); // Start at 5s, total 10s. Remaining 5s.

        vi.advanceTimersByTime(4000);
        expect(spy).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1001);
        expect(spy).toHaveBeenCalledWith('playfinished');
    });

    it('should clear previous timeout on new play', () => {
        const spy = vi.spyOn(jukebox.ee, 'emit');
        jukebox.playFile('song1.mp3');

        // Advance half way
        vi.advanceTimersByTime(5000);

        // Start new song
        jukebox.playFile('song2.mp3');

        // Advance past point where song1 would have finished (10s total, 5s passed + 6s = 11s)
        vi.advanceTimersByTime(6000);

        // Should have NOT fired for song1 (or rather, the timer for song1 should have been cancelled)
        // But wait, song2 started. So song2 finishes in 10s.
        // song1 started at T=0. would end at T=10.
        // At T=5, playFile called. Old timer cleared. New timer set for T=15 (5+10).
        // At T=11. New timer shouldn't fire yet.

        expect(spy).not.toHaveBeenCalled();

        // Now advance to T=15
        vi.advanceTimersByTime(4000);
        expect(spy).toHaveBeenCalledTimes(1);
    });
});
