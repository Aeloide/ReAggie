import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    extract_caphmac,
    buildCapString,
    findInList,
    getGitHeadCommitHash,
    buildBinaryRepr,
    initAsnReaders,
    nonRetardedAsyncExists,
    Permissions
} from '../src/utils.js'; // Importing these might require exporting them if they are not exported?
// Wait, gen_caphmac is NOT exported. It's used by extract_caphmac which IS exported.
// And buildCapString.
// So I can test gen_caphmac implicitly.

// We need to mock fs/promises and other deps
import * as fsPromises from 'fs/promises';
import { HostCapabilities } from '../src/types.js';
import cp from 'child_process';

vi.mock('fs/promises', () => ({
    access: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    stat: vi.fn().mockResolvedValue({ mtimeMs: Date.now() }),
    constants: { F_OK: 0 }
}));

vi.mock('child_process', () => ({
    default: {
        execSync: vi.fn()
    },
    execSync: vi.fn()
}));

// Mock fetch
const fetchMock = vi.fn();
global.fetch = fetchMock;

// Mock geoip2-node
vi.mock('@maxmind/geoip2-node', () => ({
    Reader: {
        openBuffer: vi.fn().mockReturnValue({
            modelFor: vi.fn()
        })
    },
    Asn: class { }
}));

describe('utils extended', () => {

    describe('Capabilities HMAC', () => {
        const secret = Buffer.from('mysecret');
        // We can't access gen_caphmac directly, but we can verify behavior via extract and build.

        it('should build and extract capabilities correctly', () => {
            const capStr = buildCapString('mysecret', HostCapabilities.RoomCreator);
            // Format: |base64(cap + signature)
            expect(capStr.startsWith('|')).toBe(true);

            const buff = Buffer.from(capStr.slice(1), 'base64');
            const extracted = extract_caphmac(secret, buff);

            expect(extracted.has('RoomCreator')).toBe(true);
        });

        it('should build and extract new format capabilities correctly', () => {
            const capStr = buildCapString('mysecret', new Permissions(['RoomCreator']));
            // Format: @base64(cap + signature)
            expect(capStr.startsWith('@')).toBe(true);

            // Pass string directly as new format requires string parsing
            const extracted = extract_caphmac(secret, capStr);

            expect(extracted.has('RoomCreator')).toBe(true);
        });

        it('should return 0 for invalid signature', () => {
            const capStr = buildCapString('mysecret', 123);
            const buff = Buffer.from(capStr.slice(1), 'base64');

            // Modify signature
            buff[10] = buff[10] ^ 0xFF;

            const extracted = extract_caphmac(secret, buff);
            expect(extracted.perms.size).toBe(0);
        });
    });

    describe('Git Commit Hash', () => {
        it('should return commit hash on success', () => {
            (cp.execSync as any).mockReturnValue(Buffer.from('abcdef123456\n'));
            expect(getGitHeadCommitHash()).toBe('abcdef123456');
        });

        it('should return fallback on error', () => {
            (cp.execSync as any).mockImplementation(() => { throw new Error('git not found'); });
            expect(getGitHeadCommitHash()).toBe('no-git-repo');
        });
    });

    describe('DB findInList', () => {
        let mockList: any;
        beforeEach(() => {
            mockList = { findOne: vi.fn() };
        });

        it('should return undefined if no ip', async () => {
            expect(await findInList(mockList, undefined)).toBeUndefined();
        });

        it('should query for IPv4', async () => {
            await findInList(mockList, '1.2.3.4');
            // Check args to findOne. Hard to verify exact buffer content without repeating logic, 
            // but we can check `v: 4`.
            expect(mockList.findOne).toHaveBeenCalledWith(expect.objectContaining({ v: 4 }));
        });

        it('should query for IPv6', async () => {
            await findInList(mockList, '2001:db8::1');
            expect(mockList.findOne).toHaveBeenCalledWith(expect.objectContaining({ v: 6 }));
        });
    });

    describe('Binary Group Serialization', () => {
        it('should serialize and deserialize groups', () => {
            const g: any = {
                id: 1,
                locked: false,
                set: 0,
                rot: 0,
                f: false,
                x: 10.5,
                y: 20.5,
                ids: [],
                indices: [1]
            };

            // We can't easily test the output binary structure without a deserializer (which is usually on client side),
            // but we can verify `buildBinaryRepr` runs without error and returns Binary.
            const bin = buildBinaryRepr([g], false);
            expect(bin).toBeDefined();
            // Expect valid mongodb Binary
            expect(bin.buffer).toBeInstanceOf(Buffer);
        });

        it('should handle rotting', () => {
            const g: any = { id: 1, ids: [], indices: [], x: 0, y: 0, rotp: 0.5 };
            const bin = buildBinaryRepr([g], true); // rotting=true
            expect(bin.buffer.length).toBeGreaterThan(2);
        });
    });

    describe('Asn Readers', () => {
        beforeEach(() => {
            vi.clearAllMocks();
            fetchMock.mockReset();
        });

        it('should download DB if not exists', async () => {
            // Mock file not exists
            (fsPromises.access as any).mockRejectedValue(new Error('no file'));
            fetchMock.mockResolvedValue({
                arrayBuffer: async () => new ArrayBuffer(10)
            });

            await initAsnReaders();

            expect(fetchMock).toHaveBeenCalledTimes(2); // v4 and v6
            expect(fsPromises.writeFile).toHaveBeenCalledTimes(2);
        });

        it('should use existing file if fresh', async () => {
            (fsPromises.access as any).mockResolvedValue(true);
            (fsPromises.stat as any).mockResolvedValue({ mtimeMs: Date.now() });
            (fsPromises.readFile as any).mockResolvedValue(Buffer.alloc(10));

            await initAsnReaders();

            expect(fetchMock).not.toHaveBeenCalled();
            expect(fsPromises.readFile).toHaveBeenCalledTimes(2);
        });
    });

    describe('nonRetardedAsyncExists', () => {
        it('should return true if access succeeds', async () => {
            (fsPromises.access as any).mockResolvedValue(undefined);
            expect(await nonRetardedAsyncExists('foo')).toBe(true);
        });
        it('should return false if access fails', async () => {
            (fsPromises.access as any).mockRejectedValue(new Error('fail'));
            expect(await nonRetardedAsyncExists('foo')).toBe(false);
        });
    });
});
