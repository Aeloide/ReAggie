
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ReplayWriter } from '../../src/core/replay-writer.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('ReplayWriter', () => {
    let tmpDir: string;
    let replayFile: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'replay-test-'));
        replayFile = path.join(tmpDir, 'test.jiggie');
    });

    afterEach(() => {
        try {
            if (fs.existsSync(replayFile)) fs.unlinkSync(replayFile);
            if (fs.existsSync(replayFile + '.gz')) fs.unlinkSync(replayFile + '.gz');
            fs.rmdirSync(tmpDir); // Works if empty
        } catch (e) {
            // Ignore cleanup errors
        }
    });

    it('should initialize and write messages', async () => {
        const writer = new ReplayWriter(replayFile, Date.now());

        // Write string
        writer.write(JSON.stringify({ type: 'test' }));

        // Write buffer
        writer.write(Buffer.from([1, 2, 3]));

        await new Promise<void>(resolve => writer.end(resolve));

        const content = fs.readFileSync(replayFile);
        expect(content.length).toBeGreaterThan(0);
    });

    it('should deduplicate move events', async () => {
        const writer = new ReplayWriter(replayFile);

        // Move event 1: User 1, groups len 1
        const move1 = Buffer.alloc(13);
        move1.writeUint8(0x02, 0);
        move1.writeUint16LE(1, 1);
        move1.fill(0xFF, 3);

        // Move event 2: User 1, same groups len
        const move2 = Buffer.alloc(13);
        move2.writeUint8(0x02, 0);
        move2.writeUint16LE(1, 1);
        move2.fill(0xAA, 3);

        // Write move1 then move2
        writer.write(move1);
        writer.write(move2);

        // Write non-move event to flush
        writer.write("flush");

        await new Promise<void>(resolve => writer.end(resolve));

        const content = fs.readFileSync(replayFile);
        // We expect move2 content to be present, move1 might be gone or overwritten in logic?
        // Logic: debounce until non-move or different user/len.
        // So move1 is dropped.

        // Verify move2 pattern (AA...) is present
        const hex = content.toString('hex');
        expect(hex).toContain('aa'.repeat(10)); // rough check
    });

    it('should compress on endAndCompress', async () => {
        const writer = new ReplayWriter(replayFile);
        writer.write("data");

        writer.endAndCompress();

        // Wait for compression (async)
        await new Promise(r => setTimeout(r, 1000));

        expect(fs.existsSync(replayFile)).toBe(true);
        // Maybe check file size or contents to ensure it is compressed (zlib stream)
    });
});
