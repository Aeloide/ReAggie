import * as mongo from "mongodb";
import * as dotenv from 'dotenv';
import type { DBRoomState, Room } from "./types.js";

dotenv.config({ override: true });

const mongouser = process.env['MONGOUSER'];
const mongopass = process.env['MONGOPASS'];
const mongohost = process.env['MONGOHOST'] || '127.0.0.1';
let url = `mongodb://${mongohost}`;
if (mongouser)
    url = `mongodb://${mongouser}:${mongopass}@${mongohost}`;
export let mclient = new mongo.MongoClient(url, {
    authSource: 'admin',
    enableUtf8Validation: false,
});

export let roomc: mongo.Collection<{
    roomid: string;
    room: Room;
    state: DBRoomState;
}>;

export let intentc: mongo.Collection<{
    creationDate: Date; // auto-pruned after 10 minutes
    sd: boolean;
    files: {
        width: number,
        height: number,
        path: string;
        md5: string;
        mime: string;
    }[];
    thumb?: string;
}>;

export let comicc: mongo.Collection<{
    description: string;
    filepath: string;
    uploadDate: Date;
}>;

export let playersc: mongo.Collection<{
    ip: string;
    last_seen: number;
}>;

export enum FollowPermissions {
    CreatePublic = 1,
    CreatePrivate = 2,
    JoinPublic = 4,
    JoinPrivate = 8
}

export type Token = {
    token: string;
    name: string;
    last_notification: number[];
    mutelist: ({ id: string; date: number; name: string; } & ({ asn: number; } | { ip: string; range: number; spec: string; }))[];
    // permissions for followers are still bitfields as we only need to track join/create private/public rooms
    followers: { id: string; date: number, subkey: string, name: string, permissions: number; }[];
    // permissions for trustees are strings as we need to track all permissions that could be granted
    trustees: { id: string; token: string, name: string, date: number, perms: string[]; }[];
};

export let tokensc: mongo.Collection<Token>;

export let followersc: mongo.Collection<{
    subkey: string;
    sub: PushSubscription;
    last_seen: number,
    following: {
        token: string;
        name: string;
        date: number;
        perms: FollowPermissions;
    }[];
}>;

type IPRange = ({
    v: 4 | 6,
    ip: string,
    low: mongo.Binary;
    hi: mongo.Binary;
});

export let assetc: mongo.Collection<{
    filename: string;
    size: number;
    last_access: Date;
    flags: number; // 1 = LOCAL, 2 = REMOTE, 3 = BOTH
}>;
export const ASSET_LOCAL = 1;
export const ASSET_REMOTE = 2;

export let banlist: mongo.Collection<IPRange & {
    reason: string;
    info: string;
    expire: number;
    infractionDate: number;
}>;

export let goodgoys: mongo.Collection<IPRange>;
export let badgoys: mongo.Collection<IPRange & { reason: string; }>;
export let forbidden: mongo.Collection<{
    pattern: RegExp
}>;

export let warnlist: mongo.Collection<IPRange & {
    reason: string;
    infractionDate: number;
}>;

export let reports: mongo.Collection<{
    roomid: string;
    room: Room;
    state: DBRoomState;
}>;

export let publicWarns: mongo.Collection<{
    reasons: string[];
    response: string;
    images: string[];
    roomid: string;
}>;

export let asncapc: mongo.Collection<{
    asn: number;
    cap: number; // bitfield for 1 -> can play, 2 -> can create rooms, 4 -> notify when creating rooms
}>;

export let infologsc: mongo.Collection<{
    room: string;
    data: any;
    meta: any;
    origin: string;
    time: Date;
}>;

export let failedRequests: mongo.Collection<{
    request: {
        body: any;
        headers: any;
    };
    intent?: any;
    error: string;
    timestamp: Date;
}>;

export let bingoc: mongo.Collection<{
    token: string;
    grid_ids: string[];
    created_at: Date;
    edited?: boolean;
    image?: string;
    banner?: string;
}>;

export let bingocondsc: mongo.Collection<{
    id: string;
    desc: string;
    checked?: boolean;
}>;

export type AlertDoc = {
    time: Date;
    sub: string;
    com: string;
    source: 'server' | 'client';
    ip?: string;
    read: boolean;
};

export let alertsc: mongo.Collection<AlertDoc>;

export let clientPromise: Promise<mongo.MongoClient>;

clientPromise = mclient.connect();

export const playerViews: Record<string, typeof playersc> = {};

export const mongoreset = async () => {
    await mclient.close();
    mclient = new mongo.MongoClient(url, {
        authSource: 'admin',
        enableUtf8Validation: false,
    });
    await mclient.connect();
    await mongoinit();
}

export const mongoinit = async () => {
    await clientPromise;
    const db = mclient.db("puzzle");
    const offs = ['hour', 'day', 'week', 'month'];
    const colls = ["rooms", "bans", "warns", "reports", "publicWarns",
        'players', 'asncap', 'intents', 'infologs', 'goodgoys', 'badgoys',
        'forbidden', 'comics', 'failedRequests', 'asset_cache', 'tokens', 'followers', 'bingos', 'bingo_conditions', 'alerts'];
    const existing = await db.collections();
    const existingNames = new Set(existing.map(c => c.collectionName)); // it's 5 times faster than calling db.createCollection(coll) for each coll
    for (const coll of colls)
        if (!existingNames.has(coll)) {
            try {
                await db.createCollection(coll);
            } catch {//
            }
        }
    [
        roomc, banlist, warnlist,
        reports, publicWarns, playersc,
        asncapc, intentc, infologsc, goodgoys, badgoys, forbidden, comicc, failedRequests, assetc, tokensc, followersc, bingoc, bingocondsc, alertsc] = colls.map(c => db.collection(c) as any);
    for (let f of offs.map(e => `players_last_` + e)) {
        playerViews[f] = db.collection(f);
    }

    await alertsc.createIndex({ time: -1 }).catch(() => { /* already exists */ });
    await alertsc.createIndex({ read: 1, time: -1 }).catch(() => { /* already exists */ });

    console.log('finished initing mongo')
};

export async function rearmNotificationTimer(token: Token, perms: FollowPermissions) {
    const now = Date.now();
    for (let i = 0; perms >> i; ++i) {
        if ((perms >> i) & 1)
            token.last_notification[i] = now;
    }
    await tokensc.updateOne({ token: token.token }, { $set: { last_notification: token.last_notification } });
}

