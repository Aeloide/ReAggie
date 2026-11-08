import { Binary } from "mongodb";
import { HostCapabilities, type Group, type Quota, type Rectangle, type Room, type vec2, type Permission } from "./types.js";
import axios from "axios";
import cp from "child_process";
import os from "os";
import { IncomingMessage } from "http";
import path from "path";
import { access, constants, readFile, stat, writeFile } from "fs/promises";
import crypto from "crypto";
import { isIPv4 } from "net";
import type { Request } from "express";
import { expandIPv6Address, ipTo128bin, ipv4ToInt, ipv6ToBigInt, genRangev4, genRangev6 } from "./ip-utils.js";
import { Asn, Reader, ReaderModel } from "@maxmind/geoip2-node";

const ipv4dburl = 'https://cdn.jsdelivr.net/npm/@ip-location-db/iptoasn-asn-mmdb/iptoasn-asn-ipv4.mmdb';
const ipv6dburl = 'https://cdn.jsdelivr.net/npm/@ip-location-db/iptoasn-asn-mmdb/iptoasn-asn-ipv6.mmdb';

let ipv4Reader: ReaderModel;
let ipv6Reader: ReaderModel;

export const nonRetardedAsyncExists = async (path: string) => {
    try {
        await access(path, constants.F_OK);
        return true;
    } catch {
        return false;
    }
}


const ONE_DAY = 24 * 3600 * 1000;
const mmdbFromUrl = async (url: string) => {
    let data: Buffer;
    const filename = path.basename(url);
    if (await nonRetardedAsyncExists(filename) && (await stat(filename)).mtimeMs > Date.now() - (ONE_DAY)) {
        data = await readFile(filename);
    } else {
        data = Buffer.from(await (await fetch(url)).arrayBuffer());
        await writeFile(filename, data as any);
    }
    return Reader.openBuffer(data);
}

export const initAsnReaders = async () => {
    ipv4Reader = await mmdbFromUrl(ipv4dburl);
    ipv6Reader = await mmdbFromUrl(ipv6dburl);
}

setInterval(() => {
    void initAsnReaders().catch(error => console.error("Failed to refresh ASN databases", error));
}, ONE_DAY);

export const clauseToChecker = (e: Token['mutelist'][number]): (ip: string, asn: number) => boolean => {
    if ('asn' in e) {
        return (_, asn) => asn === e.asn;
    } else if ('ip' in e) {
        const { ip, range } = e;
        const v = isIPv4(ip) ? 4 : 6;
        const conv = v === 4 ? ipv4ToInt : (s: string) => ipv6ToBigInt(expandIPv6Address(s));
        const gen = v === 4 ? genRangev4 : genRangev6;
        let r = BigInt(range || (v === 4 ? 32 : 128));
        let [low, hi] = gen(conv(ip), r);

        return (ip, _) => {
            const vt = isIPv4(ip) ? 4 : 6;
            if (vt !== v) return false; // need to be the same type
            const bip = conv(ip); // can reuse precomputed converter
            return low <= bip && bip <= hi; // range check
        };
    }
    return undefined as never;
};

export const sameClause = (a: Token['mutelist'][number]) => {
    return (b: Token['mutelist'][number]) => {
        if ('asn' in a && 'asn' in b)
            return a.asn === b.asn;
        if ('ip' in a && 'ip' in b) {
            return a.ip === b.ip && a.range === b.range;
        }
        return false;
    };
};

export class Counter {
    rem: number;
    last_change: number;

    constructor(private q: Quota) {
        this.rem = q.amount * q.burst_factor;
        this.last_change = +new Date;
    }

    add(amount: number) {
        this.use(amount);
    }

    use(amount: number, block?: boolean) {
        const now = +new Date;
        const secs = (now - this.last_change) / 1000;
        let recharge = this.q.amount * (secs);
        this.rem += recharge;
        const max = this.q.amount * this.q.burst_factor;
        if (this.rem > max)
            this.rem = max;
        if (this.rem < amount) {
            throw new Error("Capacity exceeded");
        }
        this.rem -= amount;
        this.last_change = now;
    }

    show() {
        console.log(this.rem);
    }
}

const charset = '0123456789abcdefghijklmnopqrstuvwxyz_ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const randstring = (n: number) => [...new Array(n)].map(e => charset[~~(Math.random() * charset.length)]).join('');

export const getGitHeadCommitHash = () => {
    try {
        const devNull = os.platform() === 'win32' ? 'nul' : '/dev/null';
        return cp.execSync(`git rev-parse HEAD 2>${devNull}`).toString().trim();
    } catch (e) {
        return "no-git-repo";
    }
};

export const snooze = (n: number) => new Promise(_ => setTimeout(_, n));

export const shuffleArray = <T>(array: T[]) => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
};

// (MSB) SSSSSSSS XXXXXLRR (LSB)
const toStatus = (g: Group) =>
    ((g.locked ? 1 : 0) << 2) // 1 bit
    | (g.set << 8) // 8 bits
    | (g.rot || 0) << 0
    | (+(g.f || 0)) << 3; // 1 bits

export const serializeGroup = (g: Group, rotting: boolean) => {
    // 20 bytes min, ~40kb per group max (10000 pieces puzzles)
    // groups grows only as the get merged into other groups
    // so this is basically a constant size
    // however, the overhead is 15 bytes per group, so ~19kb on top
    let groupsize =
        2 + //id 0
        2 + //status 2
        4 + //x 3
        4 + //y 7
        2 + // ids size
        2 + // indices size
        2 * g.ids.length +
        2 * g.indices.length
        + (rotting ? 8 : 0);

    const buff = Buffer.alloc(groupsize);
    let ptr = 0;
    ptr = buff.writeUint16LE(g.id, ptr);
    ptr = buff.writeUInt16LE(toStatus(g), ptr);
    ptr = buff.writeFloatLE(g.x, ptr);
    ptr = buff.writeFloatLE(g.y, ptr);
    ptr = buff.writeUInt16LE(g.ids.length, ptr);
    ptr = buff.writeUInt16LE(g.indices.length, ptr);
    if (rotting)
        ptr = buff.writeDoubleLE(g.rotp || NaN, ptr);
    let bytes: Uint8Array;
    bytes = new Uint8Array(new Uint16Array(g.ids).buffer);
    buff.set(bytes, ptr);
    ptr += bytes.length;

    bytes = new Uint8Array(new Uint16Array(g.indices).buffer);
    buff.set(bytes, ptr);
    ptr += bytes.length;

    return buff;
};

export const buildBinaryRepr = (g: Group[], rotting: boolean) => {
    const groupCount = Buffer.alloc(2);
    groupCount.writeUint16LE(g.length);
    const b = Buffer.concat([groupCount].concat(g.map(e => serializeGroup(e, rotting)))) as any;
    return new Binary(b);
};

export const clamp = (min: number, v: number, max: number) => Math.min(Math.max(min, v), max);

const clip = (value: unknown, max: number) => String(value ?? '').slice(0, max);

export const persistAlert = async (sub: string, com: string, extra: { source: 'server' | 'client'; ip?: string } = { source: 'server' }) => {
    const doc = {
        time: new Date(),
        sub: clip(sub, 500),
        com: clip(com, 20000),
        source: extra.source,
        ip: extra.ip,
        read: false,
    };
    try {
        const db = await import("./db.js");
        if (db.alertsc)
            await db.alertsc.insertOne(doc);
    } catch (error) {
        console.error("Failed to persist alert", error);
    }
    return doc;
};

export const sendAlert = async (sub: string, com: string) => {
    console.log('===ALERT===', sub, com);
    await persistAlert(sub, com, { source: 'server' });
    const webhook = process.env.ALERT_WEBHOOK_URL;
    if (!webhook)
        return;
    try {
        await axios.post(webhook, { sub, com });
    } catch (error) {
        console.error("Failed to send alert", error);
    }
};

export const getRoomCompletionStat = (room: Room) => {
    return 1 - (room.groups.length - room.sets.length) / (room.pieces - room.sets.length);
};

export const getIp = (req: IncomingMessage | Request) => {
    const proxyHeader = (req?.headers['cf-connecting-ip'] || req?.headers['x-forwarded-for']) as string | undefined;
    const ipFromHeader = proxyHeader?.split(/\s*,\s*/)[0];

    return ipFromHeader || (req as Request).ip || req.socket.remoteAddress!;
};

const getAsnV4 = (ip: string) => ((ipv4Reader! as any).modelFor(Asn, "asn ipv4", ip, 'w') as Asn).autonomousSystemNumber || 0
const getAsnV6 = (ip: string) => ((ipv6Reader! as any).modelFor(Asn, "asn ipv6", ip, 'w') as Asn).autonomousSystemNumber || 0

export const getAsn = (req: IncomingMessage | Request) => {
    const ip = getIp(req);
    try {
        if ('x-asnum' in req.headers)
            return +(req!.headers['x-asnum']!);
        return (isIPv4(ip) ? getAsnV4(ip) : getAsnV6(ip));
    } catch {
        console.error('ASN WARNING:', ip)
    }
    return 0;
}

export const buffToIpv4 = (b: Uint8Array) => [...b.subarray(12)].join('.');

export const buffToIpv6 = (buffer: Uint8Array) => {
    const hexString = Buffer.from(buffer).toString('hex');
    const segments = [];

    for (let i = 0; i < hexString.length; i += 4) {
        segments.push(hexString.slice(i, i + 4));
    }

    return segments.join(':');
};

export const isInRectangle = (p: vec2, r: Rectangle) => {
    const xMin = Math.min(r[0][0], r[1][0]);
    const xMax = Math.max(r[0][0], r[1][0]);
    const yMin = Math.min(r[0][1], r[1][1]);
    const yMax = Math.max(r[0][1], r[1][1]);
    return xMin <= p[0] && p[0] <= xMax && yMin <= p[1] && p[1] <= yMax;
};

import { Token, Token as TokenDB } from "./db.js";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
const scratch = Buffer.allocUnsafe(4);
const gen_caphmac = (secret: Buffer, capabilities: number) => {
    // hmac = H(S + H(S + M))
    // assuming capabilities is representable as a 32 bits number
    scratch.writeUInt32LE(capabilities >>> 0);
    const sig = crypto.createHash('sha256').update(Buffer.concat([secret, scratch])).digest();
    const hm = crypto.createHash('sha256').update(Buffer.concat([secret, sig])).digest();
    return hm.subarray(0, 16); // truncate to 128bits to keep it short :^)
};

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

    delete(perm: Permission) {
        this.perms.delete(perm);
        const implied = IMPLIED_PERMISSIONS[perm];
        if (implied) {
            for (const imp of implied)
                this.perms.delete(imp);
        }
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


export const extract_caphmac = (secret: Buffer, buff: Buffer | string): Permissions => {
    // New Format: String strictly starting with @
    if (typeof buff === 'string' && buff.startsWith('@')) {
        const parts = buff.slice(1).split('.');
        if (parts.length !== 2) return new Permissions();

        const payloadStr = parts[0];
        const sigStr = parts[1];

        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(payloadStr!);
        const expectedSig = hmac.digest();
        const sig = Buffer.from(sigStr!, 'base64');

        if (sig.length === expectedSig.length && crypto.timingSafeEqual(sig, expectedSig)) {
            try {
                const json = JSON.parse(Buffer.from(payloadStr!, 'base64').toString());
                const p = Array.isArray(json) ? new Set<Permission>(json) : new Set<Permission>();

                // Filter unsafe permissions
                const allowed = new Set(IMPLIED_PERMISSIONS.RoomCreator);
                allowed.add('RoomCreator');

                const safeP = new Set<Permission>();
                for (const perm of p) {
                    if (allowed.has(perm)) {
                        safeP.add(perm);
                    }
                }
                return new Permissions(safeP);
            } catch {
                return new Permissions();
            }
        }
        return new Permissions();
    }

    let bin: Buffer;
    if (typeof buff === 'string') {
        if (buff.startsWith('|')) {
            bin = Buffer.from(buff.slice(1), 'base64');
        } else {
            bin = Buffer.from(buff, 'base64');
        }
    } else {
        bin = buff;
    }

    if (bin.length === 20) {
        const claim = bin.readUint32LE(0);
        const sig = bin.subarray(4);
        const truesig = gen_caphmac(secret, claim);

        if (sig.compare(truesig) === 0)
            return Permissions.fromLegacy(claim);
    }
    return new Permissions();
}

export const sign_permissions = (secret: Buffer, perms: Permission[]): string => {
    const json = JSON.stringify(perms);
    const payload = Buffer.from(json).toString('base64');
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload);
    const sig = hmac.digest('base64');
    return `@${payload}.${sig}`;
}

export const buildCapString = (secret: string | Buffer, cap: number | Permissions) => {
    if (typeof cap === 'number') {
        scratch.writeUInt32LE(cap >>> 0);
        return '|' + Buffer.concat([scratch, gen_caphmac(Buffer.from(secret as any), cap)]).toString('base64');
    } else {
        return sign_permissions(Buffer.from(secret as any), [...cap.perms]);
    }
}

export const findInList = async (list: any, ip?: string) => {
    if (!ip)
        return;
    if (isIPv4(ip)) {
        const s2 = ipv4ToInt(ip);
        const s = ipTo128bin(s2);
        return await list.findOne({ v: 4, hi: { $gte: s }, low: { $lte: s } } as any);
    }
    const s = ipTo128bin(ipv6ToBigInt(expandIPv6Address(ip)));
    return await list.findOne({ v: 6, hi: { $gte: s }, low: { $lte: s } } as any);
};

export const lerp = (a: number, b: number, t: number) => a + t * (b - a);

export function extractFromArray<T>(arr: T[], obj: T) {
    const i = arr.indexOf(obj);
    if (i !== -1) arr.splice(i, 1);
}
export const spawnPromise = (cmd: string, args: string[]) => new Promise<Buffer>((res, rej) => {
    const proc = spawn(cmd, args, { stdio: 'pipe' });
    const cumul: Buffer[] = [];
    proc.stdout.on("data", d => cumul.push(d));
    proc.on("exit", () => {
        res(Buffer.concat(cumul));
    });
    proc.on("close", () => {
    });
    proc.on('error', () => {
        rej();
    });
});
export function getMyLibcPath() {
    const maps = readFileSync('/proc/self/maps', 'utf8');
    const lines = maps.split('\n');
    for (const line of lines) {
        if (line.includes('libc.so') || line.includes('musl-')) { // libc.musl is a symlink so it does not appear in the maps file
            const match = line.match(/\/.+\.so[^\s]*/);
            if (match) return match[0];
        }
    }
    throw new Error("Could not identify the loaded libc path.");
}
