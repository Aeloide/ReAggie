import { describe, it, expect, vi, beforeEach } from 'vitest';
import { trashupRoomImpl } from '../src/core/cleanup-service.js';
import { setFileSystem, IFileSystem } from '../src/core/io.js';

// Define mocks
const mocks = vi.hoisted(() => ({
    mockDeleteOne: vi.fn(),
    mockUnlinkSync: vi.fn()
}));

// Mock child_process for the curl call
vi.mock('child_process', () => ({
    spawnSync: vi.fn(),
    default: { spawnSync: vi.fn() }
}));

vi.mock('../src/AssetManager.js', () => ({
    deleteAsset: vi.fn()
}));

const mockFileSystem: IFileSystem = {
    exists: vi.fn(),
    existsSync: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    unlink: vi.fn(),
    unlinkSync: mocks.mockUnlinkSync,
    stat: vi.fn(),
    mkdir: vi.fn(),
    mkdirSync: vi.fn()
};

const mockRoomCollection: any = {
    deleteOne: mocks.mockDeleteOne
};

describe('cleanup-service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Inject FileSystem Mock
        setFileSystem(mockFileSystem);
    });

    describe('trashupRoomImpl', () => {
        it('should delete database entry', async () => {
            const room: any = { sets: [], thumbnail: '' };
            await trashupRoomImpl(room, 'room123', mockRoomCollection, mockFileSystem, false);
            expect(mocks.mockDeleteOne).toHaveBeenCalledWith({ roomid: 'room123' });
        });

        it('should handle file deletion (via AssetManager)', async () => {
            const room: any = { sets: [{ image: 'img.jpg' }], thumbnail: 'thumb.jpg' };
            await trashupRoomImpl(room, 'room123', mockRoomCollection, mockFileSystem, true);

            const { deleteAsset } = await import('../src/AssetManager.js');
            expect(deleteAsset).toHaveBeenCalledTimes(2);
            expect(deleteAsset).toHaveBeenCalledWith('img.jpg');
            expect(deleteAsset).toHaveBeenCalledWith('thumb.jpg');
            expect(mocks.mockDeleteOne).toHaveBeenCalled();
        });
    });
});
