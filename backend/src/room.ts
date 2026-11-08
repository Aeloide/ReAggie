// const origlog = console.log.bind(console);
// console.log = (...args) => origlog(process.argv[2], ...args);
// console.error = (...args) => origlog(process.argv[2], ...args);

// LETS THANK THIS GUY FOR ONLY FIXING THE DECODER, NOT THE ENCODER
// https://github.com/davedoesdev/frame-stream/issues/23
import util from "util";
(util as any)._extend = Object.assign.bind(Object);
// ----------------

console.log("room process started");
import * as ws from "ws";
import http from "http";
import express from "express";
import { isIPv4 } from "net";
import { pathToFileURL } from "url";

import * as db from "./db.js";
import * as mut from "./mut.js";
import type { Decoder, Encoder } from "frame-stream";
import { BinCommands, type Room, type RoomState, type RoomRuntimeState, type User, type UserPrivate } from "./types.js";
import { getRoomCompletionStat, lerp, sendAlert, snooze } from "./utils.js";
import type { Jukebox } from "./Jukebox.js";
import { extractSocket, initRoomProcessLock, reconnectToServer, setParentFd } from "./client-ipc.js";
import { CommandRoomStateUserArg } from "./commands/index.js";
import { pruneuser } from "./room-utils.js";
import { expandIPv6Address } from "./ip-utils.js";
import { superUserPriv, queue } from "./superUserPriv.js";
import { doDisconnect, safeClose } from "./connectionFlow.js";
import { Implementations, ParserTypes } from "./core/protocols/index.js";

const MAX_WEBSOCKET_PAYLOAD = 16 * 1024 * 1024;

export const app = express();

app.set('trust proxy', true);
const path = process.env['FRONTENDPATH'] || (__dirname + "/../../frontend/home");
app.use('/*', express.static(path, { extensions: ['html'] }));

// state is now internally tracked by process
export let thisroom: Room;
export let roomstate: RoomState;
export let runtime: RoomRuntimeState;
export let ipc: [Encoder, Decoder];

export const setJuke = (j: Jukebox) => {
    runtime.juke = j;
};

// Used for mocks/unit testing
export const setThisRoom = (r: Room) => { thisroom = r; };
export const setRuntime = (r: RoomRuntimeState) => { runtime = r; };
export const setRoomState = (r: RoomState) => { roomstate = r; };
// ---

export const getInfoMessage = () => ({
    type: "infos",
    tags: thisroom.tags || [],
    key: thisroom.key,
    name: thisroom.name,
    sets: thisroom.sets.length,
    pieces: thisroom.pieces,
    auth: thisroom.auth || false,
    nsfw: thisroom.nsfw || false,
    rotation: thisroom.rotation,
    gay: thisroom.ext?.gay,
    startTime: thisroom.startTime,
    thumbnail: thisroom.thumbnail,
    hidePreview: thisroom.hidePreview,
    hasVideo: thisroom.sets.filter(e => !!e.isvideo).length > 0,
    jigChan: thisroom.jigchan,
});

export const sendInfos = () => {
    ipc[0]!.write(JSON.stringify(getInfoMessage()));
};

const commandProcessor = {
    consoom(msg: { type: string; } & Record<string, any>, userpriv: UserPrivate, sender: User) {
        let stop = false;
        const stateArg = getCommandHandlerStateArg(userpriv);
        for (const mod of runtime.modules) {
            for (const cmd of mod.commands) {
                if (cmd.named_params && msg.type == cmd.name) {
                    stop ||= cmd.handler(stateArg, ...cmd.named_params.map(k => msg[k]));
                    if (stop)
                        break;
                }
            }
        }
    }
};

export const getCommandHandlerStateArg = (userpriv: UserPrivate): CommandRoomStateUserArg => ({
    room: thisroom,
    state: roomstate,
    runtime,
    userp: userpriv,
    user: userpriv.user,
});
const compileHandler = (binhandlers: typeof runtime.binCodeHandlers) => {
    const entries = [...binhandlers.entries()];
    const parsers = new Map<string, ParserTypes>(entries.map(([k, v]) => ['_parse' + k, v[0]] as const));
    const handlers = new Map<string, typeof entries[number][1][1]>(entries.map(([k, v]) => ['_handle' + k, v[1]] as const));

    const parsernames = [...parsers.keys()];
    const parserslist = [...parsers.values()];
    const handlernames = [...handlers.keys()];
    const handlerslist = [...handlers.values()];

    const body = `
        return function(thisroom, roomstate, runtime, bdata, userpriv) {
            switch (bdata[0]) {
                ${[...binhandlers.entries()].map(([k]) => `
                case ${k}: {
                    let pl = _parse${k}.parse(bdata, 1);
                    return (_handle${k})(pl, bdata, userpriv, thisroom, roomstate, runtime);
                }`).join('\n')}
                default: 
                    console.error('Unknown binary handler', bdata[0]); 
                    return 0;
            }
        };
    `;
    const factory = new Function(...parsernames, ...handlernames, body);
    return factory(...parserslist, ...handlerslist) as (
        thisroom: Room,
        roomstate: RoomState,
        runtime: RoomRuntimeState,
        bdata: Buffer,
        userpriv: UserPrivate
    ) => number;
}

const compiledBinaryHandler = compileHandler(Implementations);
// console.log(compiledBinaryHandler);
const onMessage = async (
    userpriv: UserPrivate,
    data: ws.RawData, isbin: boolean) => {
    const user = userpriv.user;
    let shouldRefresh = true;
    if (thisroom.endTime && thisroom.ext?.selfdestruct) {
        // let the room shutdown when the puzzle is solved regardless of activity
        shouldRefresh = false;
    }
    if (shouldRefresh)
        runtime.archive?.refresh();
    if (isbin) {
        let bdata = data as Buffer;
        if (bdata.length > 2 * 1024 * 1024 && bdata[0] !== BinCommands.Revert) {
            doDisconnect(userpriv, `binary message too large: ${bdata.length}`);
            return;
        }
        if (userpriv.slowmode && bdata[0] !== 0xb) { // only heartbeats are allowed when locked
            // attempted to do something, force resync by disconnecting, refreshing the timer
            doDisconnect(userpriv, 'attempted to do things in slow mode: ' + bdata[0]);
            return;
        }
        try {
            compiledBinaryHandler(thisroom, roomstate, runtime, bdata, userpriv);
        } catch (e) {
            console.error(`Error executing bin code ${bdata[0]} from user ${user.id}: ${e}`);
            doDisconnect(userpriv, `invalid binary command ${bdata[0]}`);
        }
    } else {
        const text = data.toString();
        if (Buffer.byteLength(text) > 256 * 1024) {
            doDisconnect(userpriv, "JSON message too large");
            return;
        }
        try {
            const obj = JSON.parse(text);
            if (runtime.jsonCodeHandlers.has(obj.type)) {
                await runtime.jsonCodeHandlers.get(obj.type)!(obj, userpriv, user);
            } else {
                commandProcessor.consoom(obj, userpriv, user);
            }
        } catch (e) {
            const err = e as Error;
            sendAlert('error executing command ' + process.argv[2], `${err.message}
                    ${err.stack}`);
            doDisconnect(userpriv, "invalid JSON command");
        }
    }
};

export const newConnection = async (conn: ws.WebSocket,
    req: http.IncomingMessage,
    usrmsg: any) => {
    let userpriv: UserPrivate;
    try {
        const res = await runtime.connectionFlow.execute({
            conn,
            req,
            usrmsg,
            onMessage
        });
        userpriv = res.userpriv;
    } catch (e) {
        const err = e as Error;
        void Promise.resolve(db.infologsc.insertOne({
            time: new Date(),
            room: process.argv[2]!,
            data: [err, err.name, err.message, err.stack],
            meta: req.rawHeaders,
            origin: 'weird error again'
        })).catch(error => console.error("Failed to log connection error", error));
        const failedUser = userpriv!
            || [...runtime.usersPriv.values()].find(candidate => candidate.conn === conn);
        if (conn.readyState === ws.WebSocket.OPEN) {
            try {
                conn.send(JSON.stringify({ error: err.message }));
            } catch (sendError) {
                console.error("Failed to send connection error", sendError);
            }
        }

        const close = () => safeClose(conn, 1013, err.message);
        if (failedUser)
            pruneuser(roomstate, runtime, thisroom, failedUser, close);
        else
            close();
        return;
    }
};

function extractSocketFromFd(targetFd: number, encoder: Encoder) {
    const baseMsg = { type: "consumed", fd: targetFd };

    try {
        const socket = extractSocket(targetFd);
        encoder.write(JSON.stringify(baseMsg));
        return socket;
    } catch (error) {
        const warnMsg = `Failed to extract socket from fd: ${targetFd}`;
        console.warn(warnMsg, error);
        const errorMsg = error instanceof Error ? error.message : warnMsg;
        encoder.write(JSON.stringify({ ...baseMsg, error: errorMsg }));
        return null;
    }
}

export function getStatsMessage() {
    const mem = process.memoryUsage();
    const memUsage = (mem.heapTotal + mem.external);
    let pressure = 0;
    for (const u of runtime.usersPriv.values()) {
        pressure += u.conn.bufferedAmount;
    }
    const players = [...new Set([...runtime.usersPriv].map(e => [e[1].ipaddr, e[1].name] as const))];
    const uniqueIps = [...new Set(players.map(e => {
        if (isIPv4(e[0]))
            return e[0];
        return expandIPv6Address(e[0]).slice(0, 14); // first 48 bits
    }))];
    return {
        type: "stats",
        usercount: uniqueIps.length,
        completion: getRoomCompletionStat(thisroom),
        ips: players.map(e => e[0]),
        names: players.map(e => e[1]),
        hostName: roomstate.hostName,
        createdBy: roomstate.createdBy,
        memUsage,
    };
}

function killProcess() {
    const processExit = () => process.exit(1);
    runtime.events.emit("exit");
    processExit();
}

export const startRoom = async (rid: string) => {
    console.log("init started");
    initRoomProcessLock(rid);
    await db.mongoinit();
    const loadeddata = await mut.loadRoom(rid);
    [roomstate, runtime, thisroom] = loadeddata;
    runtime.sendInfos = sendInfos;
    runtime.getStatsMessage = getStatsMessage;
    runtime.events.on("setStart", sendInfos);

    if (roomstate.token) {
        const token = await db.tokensc.findOne({ token: roomstate.token });
        if (token) {
            const ents = token.trustees.map(t => [t.token, t.perms] as [string, string[]]);
            runtime.trustees = new Map(ents);
        }
    }

    // lazily handle path migration
    for (let s of thisroom.sets) {
        if (!s.image.includes('/'))
            s.image = `${s.image.slice(0, 2)}/${s.image.slice(2, 4)}/${s.image}`;
        if (s.image2 && !s.image2.includes('/'))
            s.image2 = `${s.image2.slice(0, 2)}/${s.image2.slice(2, 4)}/${s.image2}`;
    }

    let reconnecting = false;
    await reconnectToServer(function handleServerSock(cli) {
        let roguekiller: ReturnType<typeof setTimeout>;

        async function reconnect() {
            console.log('CLOSE OR ERROR: SERVER DISC');
            if (reconnecting) return;
            reconnecting = true;

            roguekiller = setTimeout(() => {
                console.log("Process is going rogue, killing...");
                killProcess();
            }, lerp(100, 200, Math.random()) * 1000); // kill if left 100 seconds without its master

            try {
                console.log("reconnecting...");
                await snooze(lerp(100, 500, Math.random())); // give some time between file creation and connection to allow the server to listen/accept()
                await reconnectToServer(handleServerSock);
                clearTimeout(roguekiller);
            } finally {
                reconnecting = false;
            }
        }

        ipc = cli;
        cli![1].on("close", reconnect);
        cli![1].on("error", reconnect);

        cli![1].on("data", (sdata: any) => {
            try {
                const msg = JSON.parse(sdata.toString());
                switch (msg.type) {
                    case "broadcast": {
                        runtime.broadcaster.broadcast({
                            type: "chat",
                            message: msg.msg,
                            name: 'System',
                            color: '#ffffff',
                            id: -1
                        });
                        break;
                    }
                    case "exec": {
                        let stop = false;
                        const payload = msg.payload as string;
                        const cid = msg.cid as string;
                        const stateArg = getCommandHandlerStateArg(superUserPriv);
                        if (payload.startsWith('/')) {
                            for (const mod of runtime.modules) {
                                for (const cmd of mod.commands) {
                                    if (payload.match(new RegExp(`/${cmd.name}( |$)`))) {
                                        stop ||= cmd.handler(stateArg, ...payload.split(' ').map(e => e.trim()).slice(1));
                                        if (stop)
                                            break;
                                    }
                                }
                            }
                        }
                        cli[0]!.write(JSON.stringify({ type: "exec", cid, res: queue }));
                        queue.length = 0;
                        break;
                    }
                    case "getstats": {
                        cli[0]!.write(JSON.stringify(getStatsMessage()));
                        break;
                    }
                    case "getinfos": {
                        sendInfos();
                        break;
                    }
                    case "getpid": { // used for a master to later rejoin the group
                        const pid = Buffer.alloc(4);
                        pid.writeInt32LE(process.pid);
                        const ret = cli![0].write(pid);
                        break;
                    }
                    case "setmaster": {
                        setParentFd(msg.pid);
                        cli![0].write(Buffer.from(JSON.stringify({ rid })));
                        break;
                    }
                    case "req": {
                        const sock = extractSocketFromFd(msg.sock, cli![0]);
                        if (!sock) break;

                        const req = new http.IncomingMessage(sock);
                        req.method = msg.data.method;
                        req.url = msg.data.url;
                        req.headers = msg.data.headers;

                        const res = new http.ServerResponse(req);
                        (sock as any)._httpMessage = res;
                        (res as any).socket = req.socket;
                        sock.on("close", () => req.emit("close"));
                        sock.on("error", () => { });
                        sock.on("end", () => req.emit("end"));
                        app(req, res);
                        break;
                    }
                    case "ws": {
                        const sock = extractSocketFromFd(msg.sock, cli![0]);
                        if (!sock) break;

                        const cliws = new ws.WebSocket(null as any, undefined, { autoPong: true } as any);
                        (cliws as any).setSocket(sock, Buffer.alloc(0), {
                            maxPayload: MAX_WEBSOCKET_PAYLOAD,
                            skipUTF8Validation: true,
                        });

                        const req = new http.IncomingMessage(sock); // doesn't really matter
                        req.method = msg.data.method;
                        req.url = msg.data.url;
                        req.headers = msg.data.headers;
                        sock.on("close", () => req.emit("close"));
                        sock.on("error", () => { });
                        sock.on("end", () => req.emit("end"));
                        newConnection(cliws, req, msg.usrmsg);
                        break;
                    }
                }
            } catch (e) {
                console.error(sdata.toString().slice(720));
                console.error(sdata.subarray(720));
                console.error(e);
                // A bad master-process frame should be recoverable: reconnect to
                // the master instead of discarding the in-memory room state.
                cli[0].destroy();
                cli[1].destroy();
            }
        });
    });
};

const isRoomEntrypoint = !!process.argv[1]
    && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isRoomEntrypoint) {
    const rid = process.argv[2];
    if (!rid) {
        console.error("Usage: node dist/room.js <roomid>");
        process.exit(1);
    }
    startRoom(rid).catch(error => {
        console.error("Failed to start room process", error);
        process.exit(1);
    });
}
