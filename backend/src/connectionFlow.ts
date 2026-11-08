import http from "http";
import * as ws from "ws";
import { Pipeline } from "./core/Pipeline.js";
import * as db from "./db.js";
import { MuteEvaluator } from "./MuteEvaluator.js";
import { fixUserName, pruneuser, syncHostName } from "./room-utils.js";
import { thisroom, roomstate, runtime } from "./room.js";
import type { Permission, PermissionsStrings, Quota, User, UserPrivate } from "./types.js";
import { getIp, Permissions, extract_caphmac, Counter, getAsn, sendAlert, buildCapString } from "./utils.js";
import wsIpc from "./ws-rpc.js";
import webpush from "web-push";
import { estimateClockDrift } from "./core/clock.js";

if (process.env['VAPID_EMAIL'] && process.env['VAPID_PUBLIC'] && process.env['VAPID_PRIVATE']) {
    webpush.setVapidDetails(
        `mailto:${process.env['VAPID_EMAIL']}`,
        process.env['VAPID_PUBLIC'] || '',
        process.env['VAPID_PRIVATE'] || ''
    );
}

const joinQuota: Quota = {
    amount: 10 / 60,
    burst_factor: 60
};

export const safeClose = (conn: ws.WebSocket, code: number, reason = '') => {
    if (conn.readyState !== ws.WebSocket.OPEN) return;
    // RFC 6455 limits close control-frame payloads to 125 bytes. Two bytes
    // are used by the status code; leave room for a split UTF-8 sequence.
    const closeReason = Buffer.from(reason).subarray(0, 120).toString();
    try {
        conn.close(code, closeReason);
    } catch (error) {
        console.error("Failed to close websocket", error);
        conn.terminate();
    }
};

const cleanup = (userpriv: UserPrivate, t: 'error' | 'close') => (e: any) => {
    clearTimeout(userpriv.cancelFollowerNotification);
    clearTimeout(userpriv.roomSyncTimer);
    if (userpriv.slowmodeTimer)
        clearTimeout(userpriv.slowmodeTimer);
    if (userpriv.token)
        void db.rearmNotificationTimer(userpriv.token, 0 as any)
            .catch(error => console.error("Failed to update notification timer", error));
    pruneuser(roomstate, runtime, thisroom, userpriv, () => {
        if (e) {
            if (t === "error")
                doDisconnect(userpriv, `${t} ${e}, ${e.name}, ${e.message}, ${e.stack}`);
            else
                doDisconnect(userpriv, `${t} ${e}`);
        }
        else
            doDisconnect(userpriv);
    });
};

type PendingSocketMessage = [data: ws.RawData, isBinary: boolean];

const attachSocketLifecycleAndQueue = ({ conn, userpriv }: {
    conn: ws.WebSocket;
    userpriv: UserPrivate;
}) => {
    const pendingMessages: PendingSocketMessage[] = [];
    const queueState = { cancelled: false };
    let pendingBytes = 0;
    const queueMessage = (data: ws.RawData, isBinary: boolean) => {
        if (queueState.cancelled) return;
        const size = Array.isArray(data)
            ? data.reduce((total, part) => total + part.byteLength, 0)
            : data.byteLength;
        pendingBytes += size;
        if (pendingMessages.length >= 256 || pendingBytes > 2 * 1024 * 1024) {
            safeClose(conn, 1009, "Too many messages before room readiness");
            return;
        }
        pendingMessages.push([data, isBinary]);
    };
    const cancel = (type: "close" | "error") => {
        const cleanupHandler = cleanup(userpriv, type);
        return (error: any) => {
            queueState.cancelled = true;
            pendingMessages.length = 0;
            cleanupHandler(error);
        };
    };
    conn.on("message", queueMessage);
    conn.on("close", cancel("close"));
    conn.on("error", cancel("error"));
    return { pendingMessages, queueMessage, queueState };
};

const doAttach = async (
    userpriv: UserPrivate,
    onMessage: (userpriv: UserPrivate, data: ws.RawData, isbin: boolean) => void | Promise<void>,
    pendingMessages: PendingSocketMessage[],
    queueMessage: (data: ws.RawData, isBinary: boolean) => void,
    queueState: { cancelled: boolean }
) => {
    const conn = userpriv.conn;
    for (let index = 0; index < pendingMessages.length; index++) {
        if (queueState.cancelled || userpriv.pruned || conn.readyState !== ws.WebSocket.OPEN)
            throw new Error("Connection closed before room readiness");
        const [data, isBinary] = pendingMessages[index]!;
        await onMessage(userpriv, data, isBinary);
    }
    if (queueState.cancelled || userpriv.pruned || conn.readyState !== ws.WebSocket.OPEN)
        throw new Error("Connection closed before room readiness");
    pendingMessages.length = 0;
    conn.off("message", queueMessage);
    conn.on("message", onMessage.bind(null, userpriv));
    const u = userpriv;
    conn.on("pong", () => {
        u.missedPongs = 0;
    });
    userpriv.interid = setInterval(() => {
        if (conn.readyState !== ws.WebSocket.OPEN) {
            if (!userpriv.pruned)
                pruneuser(roomstate, runtime, thisroom, u, () => doDisconnect(u, "socket is no longer open"));
            return;
        }
        // lastsent is from the previously sent message
        // so the client should have tried replying to is asap
        const awaitingReply = u.heartbeatPending === true;
        if (!awaitingReply) {
            if (u.lastsent !== undefined && u.heartbeatSentMono !== undefined
                && u.heartbeatReceivedMono !== undefined && u.clitime !== undefined) {
                const monotonicRoundTrip = u.heartbeatReceivedMono - u.heartbeatSentMono;
                const drift = estimateClockDrift(
                    u.lastsent,
                    u.lastsent + monotonicRoundTrip,
                    u.clitime
                );
                if (drift !== undefined)
                    u.clockDrift = drift;
            }
            u.lastsent = Date.now();
            u.heartbeatSentMono = performance.now();
            u.heartbeatPending = true;
            if (u.clockDrift !== undefined) {
                const dbuff = Buffer.allocUnsafe(8);
                dbuff.writeDoubleLE(u.clockDrift);
                conn.send(Buffer.concat([Buffer.from([0x0b, 0, 0]), dbuff]) as any);
            } else {
                conn.send(Buffer.from([0x0b, 0, 0]));
            }
        }
        conn.ping();
        userpriv.missedhb++;
        userpriv.missedPongs = (userpriv.missedPongs || 0) + 1;
        if (userpriv.missedPongs > 10 && !userpriv.pruned) {
            pruneuser(roomstate, runtime, thisroom, u, () => doDisconnect(u, 'missed 10 pongs'));
        }
    }, 2000);
};

export const doDisconnect = (userpriv: UserPrivate, reason = '') => {
    if (userpriv.disconnecting) return;
    userpriv.disconnecting = true;
    const user = userpriv.user;
    // if the user never solved a piece (might want to take that out?)
    if (!thisroom.endTime && !userpriv.host.ChangeRoomSettings /*&& !solvedone */) {
        // might cause lag on disconnect in large rooms, might want to store a reverse relation
        // in UserPrivate
        const n = Date.now() - 30 * 1000;
        const coll: [id: number, [x: number, y: number]][] = [];
        // TODO: use groupownersbyip instead
        for (const [group, info] of runtime.lastMovedGroups) {
            if (info.time < n) continue; // if the move occured more than 30 seconds ago, don't revert
            if (info.userId !== user.id) continue; // this is another connection's move
            [group.x, group.y] = info.prev;
            coll.push([group.id, [group.x, group.y]]);
            runtime.lastMovedGroups.delete(group);
        }
        const correct = Buffer.alloc(3 + coll.length * 10);
        correct[0] = 2; // move command
        correct.writeUInt16LE(user.id, 1);
        let ptr = 3;
        for (const e of coll) {
            correct.writeUInt16LE(e[0], ptr);
            correct.writeFloatLE(e[1][0], ptr + 2);
            correct.writeFloatLE(e[1][1], ptr + 6);
            ptr += 10; // 2(id) + 4(x) + 4(y)
        }
        runtime.broadcaster.broadcast(correct);
        if (coll.length > 100 && coll.length > thisroom.groups.length * 0.2) {
            sendAlert('faggot alert', `
                                        
${process.argv[2]} ${userpriv.ipaddr} ${user.name}`);
        }
    }
    try {
        runtime.events.emit("leave", userpriv);
    } catch (error) {
        console.error("Error in user leave handler", error);
    }
    if (reason) {
        void Promise.resolve(db.infologsc.insertOne({
            time: new Date(),
            room: process.argv[2]!,
            data: new Error().stack,
            meta: [],
            origin: reason
        })).catch(error => console.error("Failed to log disconnect", error));
    }
    safeClose(userpriv.conn, 1013, reason);
};

const validateHandshake = ({ req, usrmsg }: { req: http.IncomingMessage; usrmsg: any; }) => {
    const ip = getIp(req);
    if (thisroom.auth && !usrmsg.authid) {
        throw new Error("User not externally authenticated"); // shouldn't happen
    }
    // all this is already checked by the entry point, so the next 20 lines might be redundant
    if (usrmsg.type != "user")
        throw new Error("First message needs to be of user type");
    if (thisroom.anon) {
        delete usrmsg.token;
        delete usrmsg.bing;
    }

    usrmsg.name = fixUserName(usrmsg.name, thisroom);
    usrmsg.color ??= '#00ff00';

    if (typeof usrmsg.color != "string")
        delete usrmsg.color;
    if (usrmsg.color && !/^#[0-9a-fA-F]{6}$/.test(usrmsg.color))
        delete usrmsg.color;
    usrmsg.color ??= '#00ff00';
    if (typeof usrmsg.name != "string")
        usrmsg.name = 'Anonymous';
    if (usrmsg.secret && typeof usrmsg.secret != "string")
        delete usrmsg.secret;
    let ishost: Permissions = new Permissions();
    if (usrmsg.secret) {
        if (usrmsg.secret[0] != '|' && usrmsg.secret[0] != '@') {
            ishost = usrmsg.secret == roomstate.secret ? new Permissions(['RoomCreator']) : new Permissions();
        } else {
            ishost = extract_caphmac(Buffer.from(roomstate.secret), usrmsg.secret);
        }
    }
    if (usrmsg.secret == process.env.MONGOPASS)
        ishost = new Permissions(['Admin']);
    return { ishost, ip };
}

const checkBans = ({ conn, req, ishost, ip }: { conn: ws.WebSocket; req: http.IncomingMessage; ishost: Permissions; ip: string; }) => {
    if (!ishost.has('KickImmune') && roomstate.bannedips.includes(ip)) {
        void Promise.resolve(db.infologsc.insertOne({
            time: new Date(),
            room: process.argv[2]!,
            data: [ip, roomstate.bannedips],
            meta: req.rawHeaders,
            origin: 'connection attempt but was previously banned from room'
        })).catch(error => console.error("Failed to log banned connection", error));

        safeClose(conn, 4001, "Banned");
        throw new Error("User banned");
    }
    if (ip == "127.0.0.1") {
        ishost.perms.add('KickImmune');
    }
    return { ip };
}

const checkQuotas = ({ usrmsg, ishost, ip }: { usrmsg: any; ishost: Permissions; ip: string; }) => {
    const quota = runtime.ipJoinLimit[ip] || runtime.nameJoinLimit[usrmsg.name] || new Counter(joinQuota);
    if (ishost.perms.size === 0) {
        // quota.use(1);
        if (thisroom.auth) {
            if (roomstate.bannedids?.includes(usrmsg.authid))
                throw new Error("Banned user");
        }
    }
    runtime.ipJoinLimit[ip] = runtime.nameJoinLimit[usrmsg.name] = quota;
}

const resolveIdentity = ({ conn, req, usrmsg, ishost, ip }: { conn: ws.WebSocket; req: http.IncomingMessage; usrmsg: any; ishost: Permissions; ip: string; }) => {
    const maxUserId = 0xfffe; // 0xffff is used by server-originated binary events
    let nextId = Number.isSafeInteger(roomstate.gid) ? roomstate.gid : 1;
    let nid: number | undefined;
    for (let i = 0; i < maxUserId; i++) {
        const candidate = ((nextId - 1) % maxUserId + maxUserId) % maxUserId + 1;
        nextId = candidate === maxUserId ? 1 : candidate + 1;
        if (!runtime.usersPriv.has(candidate)) {
            nid = candidate;
            roomstate.gid = nextId;
            break;
        }
    }
    if (nid === undefined)
        throw new Error("Room has too many connected users");

    let user: User;
    let userpriv: UserPrivate;
    user = {
        id: nid,
        name: usrmsg.name,
        color: usrmsg.color,
    };
    roomstate.hist![nid] = { ...user, ip };
    runtime.users.push(user);

    let cache = buildHostProps(ishost);
    if (cache.RoomCreator && (!roomstate.hostName || !cache.Admin)) syncHostName(usrmsg.name, thisroom, roomstate);
    let hostval = ishost;
    const asn = getAsn(req);
    userpriv = {
        unreliableReady: false,
        generators: new Map,
        ipc: {} as any,
        user,
        asn,
        muter: new MuteEvaluator([]),
        missedhb: 0,
        missedPongs: 0,
        pruned: false,
        get ishost() { return hostval; },
        set ishost(v) {
            hostval = v;
            cache = buildHostProps(v);
        },
        get host() {
            return cache;
        },
        speed: new Counter({ amount: 4 * (thisroom.boardHeight + thisroom.boardWidth), burst_factor: 1 }),
        solves: new Counter({ amount: 10, burst_factor: 1 }),
        chats: new Counter({ amount: 1, burst_factor: 4 }),
        selects: new Counter({ amount: 10, burst_factor: 2 }),
        ipaddr: ip || '',
        conn,
        name: usrmsg.name,
        processes: new Map,
        doDisconnect,
        get commited() { return runtime.groupownersbyip.get(ip); },
        set commited(v) {
            if (v)
                runtime.groupownersbyip.set(ip, v);

            else
                runtime.groupownersbyip.delete(ip);
        }
    };
    userpriv.ipc = wsIpc(userpriv);

    runtime.usersPriv.set(nid, userpriv);
    return { nid, user, userpriv };
}

const loadAssets = async ({ usrmsg, user, userpriv }: { usrmsg: any; user: User; userpriv: UserPrivate }) => {
    if (usrmsg.bingoToken) {
        try {
            const card = await db.bingoc.findOne({ token: usrmsg.bingoToken });
            if (card?.image) {
                user.avatar = card.image;
                user.banner = card.banner || user.avatar;
            }
        } catch (e) {
            console.error("Error fetching bingo avatar", e);
        }
    }
    if (usrmsg.token) {
        await setToken(userpriv, usrmsg.token);
    }
}

const sendInitialState = ({ conn, usrmsg, nid, userpriv, queueState }: {
    conn: ws.WebSocket;
    usrmsg: any;
    nid: number;
    userpriv: UserPrivate;
    queueState: { cancelled: boolean };
}) => {
    if (queueState.cancelled || userpriv.pruned || conn.readyState !== ws.WebSocket.OPEN)
        throw new Error("Connection closed before initial state");
    conn.send(JSON.stringify({ type: "version", version: "1.8.0" }));
    conn.send(JSON.stringify({ type: "me", id: nid }));
    runtime.broadcaster.broadcastRoomUsers();
    const roomdata = { type: "room", room: thisroom };
    conn.send(JSON.stringify(roomdata));
    // HACKY: pretend we've broadcasted the room message so the replay records it first
    try {
        runtime.broadcaster.emit("broadcast", "room", roomdata);
    } catch (error) {
        console.error("Failed to record initial room state", error);
    }
    runtime.events.emit("connected", userpriv, roomstate, runtime);
    for (const m of roomstate.chatlog || []) {
        if (usrmsg.ts && m.ts <= usrmsg.ts) continue;
        if (userpriv.muter.shouldMute(m.ip || '0.0.0.0', m.asn || 0)) continue;

        conn.send(JSON.stringify({
            type: "chat",
            message: m.message,
            name: m.name,
            color: m.color,
            ts: m.ts,
            id: nid // the id is used only to prevent messages from self from triggering the notification sound
        }));
    }
}

const activateSocket = async ({ userpriv, onMessage, pendingMessages, queueMessage, queueState }: {
    userpriv: UserPrivate;
    onMessage: (userpriv: UserPrivate, data: ws.RawData, isbin: boolean) => void | Promise<void>;
    pendingMessages: PendingSocketMessage[];
    queueMessage: (data: ws.RawData, isBinary: boolean) => void;
    queueState: { cancelled: boolean };
}) => {
    await doAttach(userpriv, onMessage, pendingMessages, queueMessage, queueState);
    if (userpriv.conn.readyState === ws.WebSocket.OPEN)
        userpriv.conn.send(JSON.stringify({ type: "ready" }));
}


export const setToken = async (userpriv: UserPrivate, tokenstr: string) => {
    let token: db.Token | null = tokenstr ? await db.tokensc.findOne({ token: tokenstr }) : null;
    if (!token && !tokenstr) {
        delete userpriv.token;
        clearTimeout(userpriv.cancelFollowerNotification);
        runtime.broadcaster.broadcastRoomUsers();
        return;
    }
    if (!token) {
        token = {
            last_notification: [0, 0, 0, 0],
            name: userpriv.name,
            token: tokenstr!,
            followers: [],
            mutelist: [],
            trustees: []
        };
        await db.tokensc.insertOne(token);
    }

    userpriv.token = token;
    userpriv.muter = new MuteEvaluator(token.mutelist);
    const bitmask = runtime.trustees.get(tokenstr!) as Permission[];
    // HERE
    if (bitmask !== undefined) {
        userpriv.ishost = new Permissions(bitmask);
    }

    // Check for delegated rights from other users in the room
    for (const otherUser of runtime.usersPriv.values()) {
        if (otherUser === userpriv) continue;
        if (!otherUser.host.Delegate || !otherUser.token) continue;
        const trusteeEntry = otherUser.token.trustees.find(t => t.token === token!.token);
        if (!trusteeEntry) continue;
        const delegatedPerms = new Set(trusteeEntry.perms);
        const grantedPerms: string[] = [];

        for (const p of delegatedPerms) {
            if (!otherUser.ishost.has(p as Permission)) continue;
            userpriv.ishost.add(p as any);
            grantedPerms.push(p);
        }

        if (grantedPerms.length > 0) {
            // send_system(otherUser, otherUser.user, `Trustee ${userpriv.name} joined and was granted: ${grantedPerms.join(', ')}`);
        }
        const caps = buildCapString(roomstate.secret, userpriv.ishost);
        userpriv.conn.send(JSON.stringify({
            type: "upgrade",
            secret: caps
        }));
    }
    // remove all admin permissions
    userpriv.ishost.delete('Admin');
    runtime.broadcaster.broadcastRoomUsers();

    // only notify if the target stays in the room more than a minute
    // may be a problem if the user frequently opens a bunch of rooms just to idle
    // TODO: maybe notify at most once every hour, 
    clearTimeout(userpriv.cancelFollowerNotification);
    userpriv.cancelFollowerNotification = setTimeout(() => {
        if (token)
            void doFollowerNotification(token, userpriv)
                .catch(error => console.error("Failed to send follower notifications", error));
    }, 60 * 1000);
};

const doFollowerNotification = async (token: db.Token, userpriv: UserPrivate) => {
    if (!token)
        return;
    const msg = Buffer.from(JSON.stringify({ event: 'joined', rid: process.argv[2], name: userpriv.name }));
    const isPrivate = thisroom.key !== '';
    const joinPerm = isPrivate ? db.FollowPermissions.JoinPrivate : db.FollowPermissions.JoinPublic;
    const lasthour = Date.now() - 3600 * 1000;
    // don't fire the same kind of notification in the same hour
    if (token.last_notification[Math.log2(joinPerm)] > lasthour)
        return;
    const lastweek = Date.now() - 7 * 24 * 3600 * 1000;
    await Promise.allSettled(token.followers.map(async f => {
        if ((f.permissions & joinPerm) === 0)
            return;
        try {
            const fol = await db.followersc.findOne({ subkey: f.subkey });
            if (!fol)
                return;
            // only send notifications if player has been active in the past week
            if (fol.last_seen < lastweek) return;
            const result = await webpush.sendNotification(fol.sub as any, msg, { TTL: 3600 });
            console.log(result);
        } catch (e) {
            console.error(e);
        }
    }));
    await db.rearmNotificationTimer(token, joinPerm);
};

export const buildHostProps = (caps: Permissions): Record<typeof PermissionsStrings[number], boolean> => {
    return new Proxy({} as Record<typeof PermissionsStrings[number], boolean>, {
        get(target, p, receiver) {
            return caps.has(p.toString() as Permission);
        },
    })
};

export default Pipeline.create<{
    conn: ws.WebSocket;
    req: http.IncomingMessage;
    usrmsg: any;
    onMessage: (userpriv: UserPrivate, data: ws.RawData, isbin: boolean) => void | Promise<void>;
}>().step(validateHandshake)
    .step(checkBans)
    .step(checkQuotas)
    .step(resolveIdentity).emit('identified')
    .step(attachSocketLifecycleAndQueue)
    .step(loadAssets)
    .step(sendInitialState).emit('ready')
    .step(activateSocket).emit("finished");
