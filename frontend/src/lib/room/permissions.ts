
export enum HostCapabilities {
    // Room Creators default
    ChangeRoomSettings = 1 << 0, // set settings like preview on, select, stack, etc...
    KickImmune = 1 << 1, // Prevents being kicked by others with Kick rights or vote kick
    Kick = 1 << 2, // Kick and unkick people
    Lock = 1 << 3, // lock access to this room
    Restart = 1 << 4, // restart the room process
    Delete = 1 << 5, // delete this room
    SlowMode = 1 << 6, // Allow to turn Slow Mode on
    Cleanup = 1 << 7, // Allow the cleanup command
    Playlist = 1 << 8, // Allow managing the playlist
    Poll = 1 << 9, // Allow managing polls
    Rollback = 1 << 10, // Allow rolling back the room state
    Delegate = 1 << 11, // Give a subset of your rights to someone
    RoomCreator = (1 << 12) - 1, // keep this after all the previous permissions
    // Site Admin
    ReadBanlist = 1 << 12, // read banned ips
    Debug = 1 << 13, // enable inspector and debug commands
    Ban = 1 << 14, // Ban room creator IP and deletes all their rooms
    Notes = 1 << 15, // Allow managing notes
    Admin = (1 << 16) - 1 // keep this after all the previous permissions
    // beware that 1<<X breaks after 31
}

export type Permission = keyof typeof HostCapabilities;

export const IMPLIED_PERMISSIONS: Partial<Record<Permission, Permission[]>> = {
    RoomCreator: ['ChangeRoomSettings', 'KickImmune', 'Kick', 'Lock', 'Restart', 'Delete', 'SlowMode', 'Cleanup', 'Playlist', 'Poll', 'Rollback', 'Delegate', 'Notes'],
    Admin: ['RoomCreator', 'ReadBanlist', 'Debug', 'Ban'],
};

const LEGACY_ALLOWED_MASK = HostCapabilities.RoomCreator;

export class Permissions {
    public readonly perms: Set<Permission>;

    constructor(perms: Set<Permission> | Permission[] = []) {
        this.perms = new Set();
        const initial = Array.isArray(perms) ? perms : [...perms];
        for (const p of initial)
            this.addWithImplications(p);
    }

    private addWithImplications(p: Permission) {
        if (this.perms.has(p)) return;
        this.perms.add(p);
        const implied = IMPLIED_PERMISSIONS[p];
        if (implied) {
            for (const imp of implied)
                this.addWithImplications(imp);
        }
    }

    has(perm: Permission): boolean {
        let h = this.perms.has(perm);
        if (!h) {
            const implied = IMPLIED_PERMISSIONS[perm];
            if (implied) {
                // true if all implied permissions are true
                h = true;
                for (const imp of implied)
                    h = h && this.perms.has(imp);
            }
        }
        return h;
    }

    add(perm: Permission) {
        this.addWithImplications(perm);
    }

    toLegacy(): number {
        let mask = 0;
        for (const [key, val] of Object.entries(HostCapabilities)) {
            if (typeof val === 'number' && typeof key === 'string' && this.has(key as Permission)) {
                mask |= val;
            }
        }
        return mask;
    }

    static fromLegacy(claim: number): Permissions {
        const pSet = new Set<Permission>();
        const safeClaim = claim & LEGACY_ALLOWED_MASK;

        for (const [key, val] of Object.entries(HostCapabilities)) {
            if (typeof val === 'number') {
                if (((val as unknown as number) & ((val as unknown as number) - 1)) === 0 && (val as unknown as number) !== 0) {
                    // Single bit
                    if ((safeClaim & val) === val) {
                        pSet.add(key as Permission);
                    }
                } else {
                    // Composite (RoomCreator)
                    if ((safeClaim & val) === val) {
                        pSet.add(key as Permission);
                    }
                }
            }
        }
        return new Permissions(pSet);
    }
}

export const parsePermissionsToken = (token?: string): Permissions => {
    if (!token) return new Permissions();

    // New Format: String strictly starting with @
    if (token.startsWith('@')) {
        try {
            const parts = token.slice(1).split('.');
            if (parts.length < 1) return new Permissions();

            const payloadStr = parts[0];
            const json = JSON.parse(atob(payloadStr));
            const p = Array.isArray(json) ? new Set<Permission>(json) : new Set<Permission>();

            // Filter using IMPLIED_PERMISSIONS.RoomCreator as allowed set
            const allowed = new Set(IMPLIED_PERMISSIONS.RoomCreator);
            allowed.add('RoomCreator');

            const safeP = new Set<Permission>();
            for (const perm of p) {
                if (allowed.has(perm)) {
                    safeP.add(perm);
                }
            }
            return new Permissions(safeP);
        } catch (e) {
            console.error("Failed to parse permission token", e);
            return new Permissions();
        }
    }

    // Legacy Format
    if (token.startsWith('|')) {
        try {
            const binaryString = atob(token.slice(1));
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            const dv = new DataView(bytes.buffer);
            const claim = dv.getUint32(0, true);
            return Permissions.fromLegacy(claim);
        } catch {
            return new Permissions();
        }
    }

    // Default legacy behavior for empty/unknown strings if treated as RoomCreator in some contexts? 
    // The original code returned HostCapabilities.RoomCreator if string didn't start with | but was not empty?
    // "if (!s || s.length == 0) return 0; ... return HostCapabilities.RoomCreator;"
    // So if it's not empty and not |, it defaults to RoomCreator.
    return Permissions.fromLegacy(HostCapabilities.RoomCreator as unknown as number);
}
