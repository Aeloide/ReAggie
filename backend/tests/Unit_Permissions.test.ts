
import { describe, it, expect, vi } from 'vitest';
import { Permissions, IMPLIED_PERMISSIONS, extract_caphmac } from '../src/utils.js';
import crypto from 'crypto';

// Setup HostCapabilities enum for reference
enum HostCapabilities {
    ChangeRoomSettings = 1 << 0,
    KickImmune = 1 << 1,
    Kick = 1 << 2,
    Lock = 1 << 3,
    Restart = 1 << 4,
    Delete = 1 << 5,
    SlowMode = 1 << 6,
    Cleanup = 1 << 7,
    Playlist = 1 << 8,
    Poll = 1 << 9,
    Rollback = 1 << 10,
    Delegate = 1 << 11,
    // RoomCreator includes all previous
    RoomCreator = (1 << 12) - 1,
    ReadBanlist = 1 << 12,
    Debug = 1 << 13,
    Ban = 1 << 14,
    Admin = (1 << 15) - 1
}

describe('Permissions Class', () => {

    it('should initialize empty permissions', () => {
        const p = new Permissions();
        expect(p.perms.size).toBe(0);
        expect(p.has('Kick')).toBe(false);
    });

    it('should add permission and respect implications (RoomCreator -> Kick)', () => {
        const p = new Permissions();
        p.add('RoomCreator');

        expect(p.has('RoomCreator')).toBe(true);
        expect(p.has('Kick')).toBe(true); // Implied
        expect(p.has('Ban')).toBe(false); // Not implied
    });

    it('should handle constructor with array', () => {
        const p = new Permissions(['Kick', 'Lock']);
        expect(p.has('Kick')).toBe(true);
        expect(p.has('Lock')).toBe(true);
        expect(p.has('Ban')).toBe(false);
    });

    it('fromLegacy: should correctly convert RoomCreator bitmask', () => {
        const legacyVal = HostCapabilities.RoomCreator;
        const p = Permissions.fromLegacy(legacyVal);

        expect(p.has('RoomCreator')).toBe(true);
        // Should also have implied permissions
        expect(p.has('Kick')).toBe(true);
    });

    it('fromLegacy: should correctly convert single bit (Kick)', () => {
        const legacyVal = HostCapabilities.Kick;
        const p = Permissions.fromLegacy(legacyVal);

        expect(p.has('Kick')).toBe(true);
        expect(p.has('RoomCreator')).toBe(false);
    });

    it('fromLegacy: should ignore bits outside valid range', () => {
        // If we implement check against legacy mask
        const invalidBit = 1 << 20;
        const p = Permissions.fromLegacy(HostCapabilities.Kick | invalidBit);
        expect(p.has('Kick')).toBe(true);
        // invalid bit ignored
    });

    it('toLegacy: should convert back to bitmask', () => {
        const p = new Permissions(['Kick', 'Lock']);
        const mask = p.toLegacy();
        const expected = HostCapabilities.Kick | HostCapabilities.Lock;
        expect(mask).toBe(expected);
    });

    it('toLegacy: RoomCreator should result in full mask', () => {
        const p = new Permissions(['RoomCreator']);
        const mask = p.toLegacy();
        expect(mask).toBe(HostCapabilities.RoomCreator);
    });

    describe('Secure Token Parsing (extract_caphmac)', () => {
        const secret = Buffer.from('mysecretkey');

        it('should parse valid token starting with @', () => {
            const payload = JSON.stringify(['Kick', 'Lock']);
            const payloadB64 = Buffer.from(payload).toString('base64');

            // HMAC generation
            const hmac = crypto.createHmac('sha256', secret);
            hmac.update(payloadB64);
            const sig = hmac.digest();
            const sigB64 = sig.toString('base64');

            const token = `@${payloadB64}.${sigB64}`;

            const permissions = extract_caphmac(secret, token);
            expect(permissions.has('Kick')).toBe(true);
            expect(permissions.has('Lock')).toBe(true);
            expect(permissions.has('Ban')).toBe(false);
        });

        it('should return empty permissions for invalid signature', () => {
            const payload = JSON.stringify(['Admin']);
            const payloadB64 = Buffer.from(payload).toString('base64');
            const token = `@${payloadB64}.invalidSignature`;

            const permissions = extract_caphmac(secret, token);
            expect(permissions.has('Admin')).toBe(false);
            expect(permissions.perms.size).toBe(0);
        });

        it('should filter unsafe permissions (e.g. Admin) for normal users?', () => {
            // Check implementation of extract_caphmac filtering
            /* 
               The implementation seems to filter: 
               const allowed = new Set(IMPLIED_PERMISSIONS.RoomCreator);
               allowed.add('RoomCreator');
               p.perms.forEach(perm => { if (!allowed.has(perm)) p.perms.delete(perm); });
            */
            const payload = JSON.stringify(['Admin', 'Kick']);
            const payloadB64 = Buffer.from(payload).toString('base64');

            const hmac = crypto.createHmac('sha256', secret);
            hmac.update(payloadB64);
            const sig = hmac.digest().toString('base64');

            const token = `@${payloadB64}.${sig}`;
            const permissions = extract_caphmac(secret, token);

            expect(permissions.has('Kick')).toBe(true);
            expect(permissions.has('Admin')).toBe(false);
        });
    });
});
