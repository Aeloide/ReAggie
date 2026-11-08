import * as ws from "ws";

import http from "http";
import cp, { ChildProcess } from "child_process";
import { Duplex } from "stream";
import { createWriteStream } from "fs";
import passport from "passport";

import { asncapc, banlist, infologsc, mongoinit, playersc, roomc, warnlist } from "./db.js";
import { app, initApi, sessionMiddleware } from "./api.js";

import { open as ffiOpen, DataType, define as ffiDefine } from "ffi-rs";

import { initIpc, isConsumed, isLinked, linking, roomStats, rooms, setHttpServer } from "./server-ipc.js";
import { findInList, getAsn, getIp, getMyLibcPath, spawnPromise } from "./utils.js";
import { isIPv4 } from "net";
import { expandIPv6Address, genRangev4, genRangev6, ipTo128bin, ipv4ToInt, ipv6ToBigInt } from "./ip-utils.js";
import { setReviewerSocket } from "./reviewer.js";

import { timingSafeEqual } from "crypto";

ffiOpen({
    library: 'libc',
    path: getMyLibcPath()
});

const syscall = ffiDefine({
    syscall: {
        library: 'libc',
        retType: DataType.I32,
        paramsType: [DataType.BigInt, DataType.BigInt, DataType.BigInt, DataType.BigInt],
    },
    prctl: { // prctrl is available in musl so it's awright
        library: 'libc',
        retType: DataType.I32,
        paramsType: [DataType.I32, DataType.BigInt, DataType.BigInt, DataType.BigInt, DataType.BigInt],
    },
});

const pidfd_open = (pid: number, flags: number): number => {
    const SYS_pidfd_open = 434; // syscall number for pidfd_open on unistd 64 & 32
    return syscall.syscall([BigInt(SYS_pidfd_open), BigInt(pid), BigInt(flags), 0n]); //dummy 0 ignored on architectures that do caller-side stack restore
}

const pidfd_getfd = (pidfd: number, targetfd: number, flags: number): number => {
    const SYS_pidfd_getfd = 438; // syscall number for pidfd_getfd on unistd 64 & 32
    return syscall.syscall([BigInt(SYS_pidfd_getfd), BigInt(pidfd), BigInt(targetfd), BigInt(flags)]);
}

console.log("Starting up...");

try {
    const PR_SET_PTRACER = 0x59616d61;
    const PR_SET_PTRACER_ANY = 18446744073709551615n;
    syscall.prctl([PR_SET_PTRACER, PR_SET_PTRACER_ANY, 0n, 0n, 0n]);
} catch (e) {
    console.error("Failed to set ptracer:", e);
}

let activeRequests = 0;
let isShuttingDown = false;

const server = http.createServer(app);

server.on('request', (req, res) => {
    activeRequests++;
    let finished = false;
    const cleanup = () => {
        if (finished) return;
        finished = true;
        activeRequests--;
        if (isShuttingDown && activeRequests === 0) {
            console.log("No more active requests. Exiting.");
            process.exit(0);
        }
    };
    res.on('finish', cleanup);
    res.on('close', cleanup);
});

export const initiateGracefulShutdown = () => {
    console.log("Initiating graceful shutdown...");
    isShuttingDown = true;
    server.close(() => {
        console.log("Server closed.");
    });
    if (activeRequests === 0) {
        console.log("No active requests. Exiting immediately.");
        process.exit(0);
    }
}

const MAX_WEBSOCKET_PAYLOAD = 16 * 1024 * 1024;
const wss = new ws.WebSocketServer({
    server,
    clientTracking: false,
    maxPayload: MAX_WEBSOCKET_PAYLOAD
});

export const startRoomProcess = (rid: string) => {
    if (rid in linking)
        return linking[rid];
    return linking[rid] = new Promise<Duplex>((resolve, reject) => {
        let linked = false;
        const timeout = setTimeout(() => {
            if (!linked) {
                reject(new Error(`Timed out starting room ${rid}`));
                child?.kill();
                cleanup(new Error("Room startup timeout"));
            }
        }, 15_000);
        isLinked[rid] = roomSocket => {
            linked = true;
            clearTimeout(timeout);
            resolve(roomSocket);
        };
        let child: ChildProcess;

        if (process.env['DEBUG']) {
            child = cp.spawn("node", ["./dist/room.js", rid], {
                detached: true, stdio: 'pipe'
            });
            const stderr = createWriteStream(`${rid}-error.log`, { flags: "a+" });
            const stdout = createWriteStream(`${rid}-regular.log`, { flags: "a+" });
            child.stderr?.pipe(stderr);

            child.stdout?.pipe(stdout);
        } else {
            child = cp.spawn("node", ["./dist/room.js", rid], {
                detached: true, stdio: 'inherit'
            });
        }
        const cleanup = (code: number | null | Error) => {
            clearTimeout(timeout);
            if (!linked)
                reject(code instanceof Error ? code : new Error(`Room ${rid} exited before linking`));
            if (code) {
                if (typeof code == "number") {
                    if (code)
                        console.log(`Child ${rid} exited abnormally`);
                } else {
                    console.log('exit', code);
                }
            }

            delete linking[rid];
            delete isLinked[rid];
            delete rooms[rid];
            delete roomStats[rid];
            child.removeAllListeners();
        };
        child.on("exit", cleanup);
        child.on("error", cleanup);
    });
};

// should eventually just remove this as the html is now fully static
export const delegateRequest = async (r: Duplex,
    re: http.IncomingMessage) => {
    const req = re as any;
    if (!req.socket?._handle?.fd)
        return;
    const delegatedRoomId = Object.entries(rooms).find(([, socket]) => socket === r)?.[0];
    try {
    await new Promise<void>((resolve, reject) => {
        const fd = req.socket._handle.fd;
        const timeout = setTimeout(() => {
            delete isConsumed[fd];
            reject(new Error("Timed out delegating HTTP socket"));
        }, 10_000);
        isConsumed[fd] = {
            rid: delegatedRoomId,
            resolve: () => {
                clearTimeout(timeout);
                resolve();
            },
            reject: error => {
                clearTimeout(timeout);
                reject(error);
            }
        };
        r.write(JSON.stringify({
            type: "req",
            sock: fd,
            data: {
                params: req.params,
                body: req.body,
                url: req.url,
                path: req.path,
                originalUrl: req.originalUrl,
                baseUrl: req.baseUrl,
                method: req.method,
                headers: req.headers,
            }
        }));
    });
    } catch (error) {
        console.error("Failed to delegate HTTP socket", error);
        re.destroy();
        return;
    }
    re.removeAllListeners(); // does nothing I think
    re.socket.emit('close'); // does the thing
    req.socket?._handle?.close(); // maybe important
    req.socket = null; // most likely not important
    re.destroy(); // maybe important
};

const delegateWebSocket = async (r: Duplex,
    conn: ws.WebSocket, // unused because the websocket should share the same socket fd anyway, as it's upgraded
    re: http.IncomingMessage, // but the request object exposes it "easier"
    usrmsg: any) => {
    const req = re as any;
    if (!req.socket?._handle?.fd) {
        return;
    }
    const delegatedRoomId = Object.entries(rooms).find(([, socket]) => socket === r)?.[0];
    await new Promise<void>((resolve, reject) => {
        const fd = req.socket._handle.fd;
        const timeout = setTimeout(() => {
            delete isConsumed[fd];
            reject(new Error("Timed out delegating websocket"));
        }, 10_000);
        isConsumed[fd] = {
            rid: delegatedRoomId,
            resolve: () => {
                clearTimeout(timeout);
                resolve();
            },
            reject: error => {
                clearTimeout(timeout);
                reject(error);
            }
        };
        r.write(JSON.stringify({
            type: "ws",
            sock: fd,
            data: {
                params: req.params,
                body: req.body,
                url: req.url,
                path: req.path,
                originalUrl: req.originalUrl,
                baseUrl: req.baseUrl,
                method: req.method,
                headers: req.headers,
            },
            usrmsg
        }));
    });

    re.removeAllListeners(); // does nothing I think
    re.socket.emit('close'); // does the thing
    req.socket?._handle?.close(); // maybe important
    req.socket = null; // most likely not important
    re.destroy(); // maybe important
};

const safeStringEqual = (a: string, b: string) => {
    const bufa = Buffer.from(a);
    const bufb = Buffer.from(b);
    const maxLength = Math.max(bufa.length, bufb.length);
    const paddedA = Buffer.alloc(maxLength);
    const paddedB = Buffer.alloc(maxLength);
    bufa.copy(paddedA);
    bufb.copy(paddedB);
    return timingSafeEqual(paddedA, paddedB) && bufa.length === bufb.length;
}

const closeWebSocket = (conn: ws.WebSocket, code: number, reason: string) => {
    if (conn.readyState !== ws.WebSocket.OPEN) return;
    const closeReason = Buffer.from(reason).subarray(0, 120).toString();
    try {
        conn.close(code, closeReason);
    } catch (error) {
        console.error("Failed to close websocket", error);
        conn.terminate();
    }
};

wss.on("connection", async (conn, req) => {
    // error event is handled to prevent crashing
    conn.on("error", e => { console.error("wserror", e); });

    // first message must be auth
    const firstFrame = await new Promise<[ws.RawData, boolean] | undefined>((resolve) => {
        const finish = (value?: [ws.RawData, boolean]) => {
            clearTimeout(timeout);
            conn.off("message", onMessage);
            conn.off("close", onClose);
            resolve(value);
        };
        const onMessage = (data: ws.RawData, isBinary: boolean) => finish([data, isBinary]);
        const onClose = () => finish();
        const timeout = setTimeout(() => {
            finish();
            closeWebSocket(conn, 1008, "Initial frame timeout");
        }, 10_000);
        conn.once("message", onMessage);
        conn.once("close", onClose);
    });
    if (!firstFrame) return;
    const [init, isbin] = firstFrame;
    const initialFrameSize = Array.isArray(init)
        ? init.reduce((size, part) => size + part.byteLength, 0)
        : init.byteLength;
    if (initialFrameSize > 64 * 1024) {
        closeWebSocket(conn, 1009, "Initial frame too large");
        return;
    }

    if (isbin) {
        //console.log("closing because malformatted");
        void infologsc.insertOne({
            time: new Date(),
            room: process.argv[2]!,
            data: [init, isbin],
            meta: req.rawHeaders,
            origin: 'connection init in room'
        }).catch(error => console.error("Failed to log malformed initial frame", error));
        closeWebSocket(conn, 1013, "Malformed initial frame");
        return;
    }

    try {
        const asn = getAsn(req);
        const asncaps = await asncapc.findOne({ asn });
        if (asncaps && (asncaps.cap & 1) == 0) {
            closeWebSocket(conn, 1013, "Range Ban");
            return;
        }
        const ip = getIp(req);
        const ban = await findInList(banlist, ip);
        const warn = await findInList(warnlist, ip);

        if (ban || warn) {
            closeWebSocket(conn, 1013, "Pending ban/warning");
            return;
        }
    } catch (e) {
        //
    }

    try {
        const usrmsg = JSON.parse(init.toString());
        if (usrmsg.type === "review") {
            if (usrmsg.pass) {
                if (!safeStringEqual(usrmsg.pass, process.env['MONGOPASS'] || '')) {
                    const ip = getIp(req);
                    const expire = Date.now() + 60 * 1000;
                    const v = isIPv4(ip) ? 4 : 6;
                    const range = v === 4 ? 24 : 64;
                    const conv = v == 4 ? ipv4ToInt : (s: string) => ipv6ToBigInt(expandIPv6Address(s));
                    const gen = v == 4 ? genRangev4 : genRangev6;
                    let r = BigInt(range || (v == 4 ? 32 : 128));
                    let [low, hi] = gen(conv(ip), r).map(ipTo128bin);
                    // detached
                    void banlist.insertOne({
                        v,
                        low,
                        hi,
                        ip,
                        reason: 'Failed login attempt',
                        expire,
                        info: '',
                        infractionDate: Date.now(),
                    } as any).catch(error => console.error("Failed to record reviewer login ban", error));
                    throw new Error("password incorrect");
                }
                setReviewerSocket(conn);
                return;
            } else
                throw new Error("Missing password");
        }
        if (usrmsg.type !== "user")
            throw new Error("First message needs to be of user type");
        let {
            color, name, room, secret
        } = usrmsg;
        color ??= '#00ff00';
        name ??= 'Anonymous';

        if (typeof color !== "string")
            throw new Error("Bad color specification");
        if (!/^#[0-9a-fA-F]{6}$/.test(color))
            throw new Error("Bad color specification");
        if (typeof name !== "string")
            throw new Error("Bad name specification");
        name = name.slice(0, 21);
        if (!room)
            throw new Error("No room specified");
        if (typeof room !== "string")
            throw new Error("Bad room specification");
        if (secret && typeof secret != "string")
            throw new Error("Bad secret specification");

        let r = rooms[room];
        const dbroom = await roomc.findOne({
            roomid: room
        });
        if (!r) {
            if (!dbroom)
                throw new Error("No such room");
            r = await startRoomProcess(room)!;
            rooms[room] = r;
        }
        if (!r)
            throw new Error("Failed to load room?");

        if (dbroom?.room.auth) {
            await new Promise<void>(resolve => {
                sessionMiddleware(req as any, {} as any, () => {
                    passport.session()(req as any, {} as any, resolve);
                });
            });
            usrmsg.authid = (req as any).user?.id;
            if (!usrmsg.authid)
                throw new Error("not authenticated");
        }

        const ip = getIp(req);
        // don't block
        void playersc.updateOne({ ip }, { $set: { ip, last_seen: Date.now() } }, { upsert: true })
            .catch(error => console.error("Failed to update player activity", error));

        await delegateWebSocket(r, conn, req, usrmsg);
    } catch (e) {
        const err = e as Error;
        //console.log(e);

        // https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent/code
        const TRY_AGAIN_LATER_CODE = 1013;
        closeWebSocket(conn, TRY_AGAIN_LATER_CODE, err.message);
        return;
    }
});

// process.on('uncaughtException', function (...a) {
//     console.log('uncaughtException', process.pid, ...a);
// });

// process.on('unhandledRejection', function (...a) {
//     console.log('unhandledRejection', process.pid, ...a);
// });

(async () => {
    await mongoinit();
    await initApi();
    setHttpServer(server);
    const stolenFd = await initIpc();
    const port = process.env.PORT || 8999;

    if (stolenFd !== undefined) {
        console.log(`Using stolen fd ${stolenFd} from IPC handover.`);
        server.listen({ fd: stolenFd }, () => {
            console.log(`Listening on stolen fd ${stolenFd}`);
        });
    } else {
        server.once('error', async (err: any) => {
            console.log('ERROR SEND', err);
            if (err.code === 'EADDRINUSE') {
                console.log(`Port ${port} in use, attempting to steal file descriptor...`);
                try {
                    const output = await spawnPromise("lsof", ["-i", `:${port}`, "-F", "f"]);
                    const lines = output.toString().trim().split('\n');
                    let pid: number | undefined;
                    let fd: number | undefined;
                    for (const line of lines) {
                        if (line.startsWith('p')) {
                            pid = parseInt(line.slice(1), 10);
                        } else if (line.startsWith('f')) {
                            fd = parseInt(line.slice(1), 10);
                        }
                    }
                    if (pid && fd) {
                        console.log(`Found pid ${pid} with fd ${fd} holding port ${port}.`);
                        const pfd = pidfd_open(pid, 0);
                        if (pfd < 0) throw new Error(`pidfd_open failed with ${pfd}`);
                        const stolenFd = pidfd_getfd(pfd, fd, 0);
                        if (stolenFd < 0) throw new Error(`pidfd_getfd failed with ${stolenFd}`);
                        console.log(`Successfully stole fd ${stolenFd}. Listening...`);

                        server.listen({ fd: stolenFd }, () => {
                            console.log(`Listening on stolen fd ${stolenFd}`);
                        });

                        console.log(`Sending SIGUSR1 to pid ${pid}`);
                        process.kill(pid, 'SIGUSR1');
                    } else {
                        throw new Error("Could not find pid or fd using lsof");
                    }
                } catch (e) {
                    console.error("Failed to steal socket:", e);
                    process.exit(1);
                }
            } else {
                console.error("Server error:", err);
                process.exit(1);
            }
        });
        try {
            server.listen(port);
        } catch (e) {
            console.error("Failed to start server:", e);
            process.exit(1);
        }
    }
})();
