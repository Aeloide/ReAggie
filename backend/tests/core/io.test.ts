import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NodeFileSystem } from '../../src/core/io.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('NodeFileSystem (Integration)', () => {
    let fileSystem: NodeFileSystem;
    let tempDir: string;

    beforeEach(() => {
        fileSystem = new NodeFileSystem();
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'io-test-'));
    });

    afterEach(() => {
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (e) {
            console.error('Failed to cleanup temp dir', e);
        }
    });

    it('should check if file exists', async () => {
        const filePath = path.join(tempDir, 'exists.txt');
        expect(await fileSystem.exists(filePath)).toBe(false);
        expect(fileSystem.existsSync(filePath)).toBe(false);

        fs.writeFileSync(filePath, 'content');
        expect(await fileSystem.exists(filePath)).toBe(true);
        expect(fileSystem.existsSync(filePath)).toBe(true);
    });

    it('should read file', async () => {
        const filePath = path.join(tempDir, 'read.txt');
        const content = 'hello world';
        fs.writeFileSync(filePath, content);
        const buffer = await fileSystem.readFile(filePath);
        expect(buffer.toString()).toBe(content);
    });

    it('should write file', async () => {
        const filePath = path.join(tempDir, 'write.txt');
        await fileSystem.writeFile(filePath, 'written content');
        const content = fs.readFileSync(filePath, 'utf8');
        expect(content).toBe('written content');
    });

    it('should unlink file', async () => {
        const filePath = path.join(tempDir, 'unlink.txt');
        fs.writeFileSync(filePath, 'bye');
        await fileSystem.unlink(filePath);
        expect(fs.existsSync(filePath)).toBe(false);
    });

    it('should unlink file sync', () => {
        const filePath = path.join(tempDir, 'unlink_sync.txt');
        fs.writeFileSync(filePath, 'bye');
        fileSystem.unlinkSync(filePath);
        expect(fs.existsSync(filePath)).toBe(false);
    });

    it('should stat file', async () => {
        const filePath = path.join(tempDir, 'stat.txt');
        fs.writeFileSync(filePath, 'stats');
        const stats = await fileSystem.stat(filePath);
        expect(stats).toBeDefined();
        expect(stats.mtimeMs).toBeDefined();
    });

    it('should mkdir', async () => {
        const dirPath = path.join(tempDir, 'subdir');
        await fileSystem.mkdir(dirPath);
        expect(fs.existsSync(dirPath)).toBe(true);
        expect(fs.statSync(dirPath).isDirectory()).toBe(true);
    });

    it('should mkdir sync', () => {
        const dirPath = path.join(tempDir, 'subdir_sync');
        fileSystem.mkdirSync(dirPath);
        expect(fs.existsSync(dirPath)).toBe(true);
        expect(fs.statSync(dirPath).isDirectory()).toBe(true);
    });
});
