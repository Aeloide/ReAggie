
import { describe, it, expect, vi } from 'vitest';
import { spawnPromise } from "../src/utils.js";
import cp from 'child_process';
import { EventEmitter } from 'events';

// Mock child_process
vi.mock('child_process', () => {
    const mockSpawn = vi.fn();
    return {
        spawn: mockSpawn,
        default: { spawn: mockSpawn }
    };
});

describe('spawnPromise', () => {
    it('should resolve with stdout data on exit', async () => {
        const mockProc = new EventEmitter() as any;
        mockProc.stdout = new EventEmitter();
        mockProc.stderr = new EventEmitter();
        (cp.spawn as any).mockReturnValue(mockProc);

        const promise = spawnPromise('echo', ['hello']);

        // Emit data
        mockProc.stdout.emit('data', Buffer.from('hello'));
        mockProc.stdout.emit('data', Buffer.from(' world'));

        // Emit exit
        mockProc.emit('exit', 0);

        const result = await promise;
        expect(result.toString()).toBe('hello world');
    });

    it('should reject on error', async () => {
        const mockProc = new EventEmitter() as any;
        mockProc.stdout = new EventEmitter();
        mockProc.stderr = new EventEmitter();
        (cp.spawn as any).mockReturnValue(mockProc);

        const promise = spawnPromise('bad', []);

        // Emit error
        mockProc.emit('error', new Error('spawn failed'));

        await expect(promise).rejects.toBeUndefined(); // The implementation calls rej() with no args
    });

    it('should handle close event (coverage)', async () => {
        // The implementation has an empty close listener, we just need to verify it doesn't crash
        const mockProc = new EventEmitter() as any;
        mockProc.stdout = new EventEmitter();
        mockProc.stderr = new EventEmitter();
        (cp.spawn as any).mockReturnValue(mockProc);

        const promise = spawnPromise('echo', []);

        mockProc.emit('close', 0);
        mockProc.emit('exit', 0);

        await promise;
    });
});
