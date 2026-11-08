
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { trashupRoomImpl } from '../src/core/cleanup-service.js';
import cp from 'child_process';

vi.mock('child_process', () => {
    const fn = vi.fn();
    return {
        spawnSync: fn,
        default: { spawnSync: fn }
    };
});

describe('trashupRoomImpl Extended', () => {
    let mockRoom: any;
    let mockColl: any;
    let mockFs: any;
    const originalEnv = process.env;

    beforeEach(() => {
        vi.clearAllMocks();
        process.env = { ...originalEnv };

        mockRoom = {
            sets: [{ image: 'img1.png' }, { image: 'img2.png' }],
            thumbnail: 'thumb.png'
        };

        mockColl = {
            deleteOne: vi.fn().mockResolvedValue({})
        };

        mockFs = {
            unlink: vi.fn(),
            exists: vi.fn().mockResolvedValue(true)
        };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it('should log reason if provided', async () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => { });

        await trashupRoomImpl(mockRoom, 'room1', mockColl, mockFs, true, 'cleanup');

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('cleanup'));
        expect(mockFs.unlink).toHaveBeenCalledTimes(3); // 2 sets + 1 thumb
    });

    it('should skip deletion if del is false', async () => {
        await trashupRoomImpl(mockRoom, 'room1', mockColl, mockFs, false);

        // Thumbnail is deleted unconditionally in implementation if it exists
        expect(mockFs.unlink).toHaveBeenCalledTimes(1);
    });

    it('should handle functional del param returning true', async () => {
        const delFn = vi.fn().mockResolvedValue(true);
        await trashupRoomImpl(mockRoom, 'room1', mockColl, mockFs, delFn);

        expect(mockFs.unlink).toHaveBeenCalledWith('./assets/img1.png');
    });

    it('should purge Cloudflare cache if env set', async () => {
        process.env.CF_ZONE = 'zone123';
        process.env.CF_EMAIL = 'mail';
        process.env.CF_AUTHKEY = 'key';

        await trashupRoomImpl(mockRoom, 'room1', mockColl, mockFs, true);

        expect(cp.spawnSync).toHaveBeenCalledWith("curl", expect.arrayContaining([
            'https://api.cloudflare.com/client/v4/zones/zone123/purge_cache'
        ]));
    });

    it('should handle errors in unlink', async () => {
        mockFs.unlink.mockImplementation(() => { throw new Error('fail'); });

        // Should not throw
        await trashupRoomImpl(mockRoom, 'room1', mockColl, mockFs, true);
    });
});
