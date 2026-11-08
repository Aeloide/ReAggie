import net from "net";
import frame from "frame-stream";
import { Duplex } from "stream";
import type { getInfoMessage, getStatsMessage } from "./room.js";

const bindPath = '\0reaggie';
export let cli: net.Socket | undefined;

let server: net.Server;
export const rooms: Record<string, Duplex> = {};
// stats that are updated regularly
export const roomStats: Record<string, ReturnType<typeof getStatsMessage>> = {};

// infos are determined on creation
export const roomInfos: Record<string, ReturnType<typeof getInfoMessage>> = {};

export const roomExec: Record<string, (pl: any) => void> = {};

interface PromiseResolveReject {
    resolve: () => void;
    reject: (reason: Error) => void;
    rid?: string;
}

export const isLinked: Record<string, (r: Duplex) => void> = {};
export const linking: Record<string, Promise<Duplex>> = {};
export const isConsumed: Record<string, PromiseResolveReject> = {};

// const unlinkBindPath = () => {
//     try {
//         if (fs.existsSync(bindPath)) {
//             fs.unlinkSync(bindPath);
//         }
//     } catch (e) {
//         console.error(e);
//     }
// }

import { open as ffiOpen, DataType, define as ffiDefine } from "ffi-rs";
import { initiateGracefulShutdown } from "./main.js";
import { getMyLibcPath } from "./utils.js";

ffiOpen({
    library: 'libc',
    path: getMyLibcPath()
});

const syscall = ffiDefine({
    syscall: {
        library: 'libc',
        retType: DataType.I32,
        paramsType: [DataType.BigInt, DataType.BigInt, DataType.BigInt, DataType.BigInt],
    }
});

const pidfd_open = (pid: number, flags: number): number => {
    const SYS_pidfd_open = 434; // syscall number for pidfd_open on unistd 64 & 32
    return syscall.syscall([BigInt(SYS_pidfd_open), BigInt(pid), BigInt(flags), 0n]); //dummy 0 ignored on architectures that do caller-side stack restore
}

const pidfd_getfd = (pidfd: number, targetfd: number, flags: number): number => {
    const SYS_pidfd_getfd = 438; // syscall number for pidfd_getfd on unistd 64 & 32
    return syscall.syscall([BigInt(SYS_pidfd_getfd), BigInt(pidfd), BigInt(targetfd), BigInt(flags)]);
}

export let httpServer: any;
export const setHttpServer = (s: any) => {
    httpServer = s;
};

export const initIpc = async (): Promise<number | undefined> => {
    // unlinkBindPath();

    server = net.createServer(async (rsocket) => {
        rsocket.on('error', console.error);

        const encoder = frame.encode();
        encoder.on("error", console.error);

        const decoder = frame.decode();
        decoder.on("error", console.error);

        encoder.pipe(rsocket).pipe(decoder);
        const socket = [encoder, decoder] as const;

        const ridprom = new Promise<any>((resolve, reject) => {
            const onData = (data: Buffer) => {
                clearTimeout(timeout);
                try {
                    resolve(JSON.parse(data.toString()));
                } catch (error) {
                    reject(error);
                }
            };
            const timeout = setTimeout(() => {
                socket[1].off("data", onData);
                reject(new Error("Timed out waiting for initial room IPC message"));
            }, 10_000);
            socket[1].once("data", onData);
        });

        socket[0].write(JSON.stringify({ type: "setmaster", pid: process.pid }));
        let rido: any;
        try {
            rido = await ridprom;
        } catch (error) {
            console.error("Malformed initial room IPC message", error);
            rsocket.destroy();
            return;
        }
        if (!rido || typeof rido !== "object"
            || (rido.type !== "newmaster" && typeof rido.rid !== "string")) {
            console.error("Invalid initial room IPC message", rido);
            rsocket.destroy();
            return;
        }

        if (rido.type === "newmaster") {
            console.log("Received newmaster request from new master. Initiating shutdown...");
            const fd = httpServer?._handle?.fd;
            socket[0].write(JSON.stringify({ type: "newmaster_ack", pid: process.pid, fd }));
            
            // Close our IPC server so new master can listen
            server.close();
            
            initiateGracefulShutdown();
            
            socket[0].destroy();
            socket[1].destroy();
            rsocket.destroy();
            return;
        }

        rooms[rido.rid] = socket[0];
        roomStats[rido.rid] = { completion: 0, usercount: 0, createdBy: '127.0.0.1', ips: [], names: [], memUsage: 0, type: "stats", hostName: '' };
        roomInfos[rido.rid] = {
            name: '',
            tags: [],
            sets: 0,
            pieces: 0,
            auth: false,
            gay: false,
            hasVideo: false,
            hidePreview: true,
            jigChan: false,
            key: undefined,
            nsfw: false,
            rotation: false,
            startTime: 0,
            type: "infos",
            thumbnail: ''
        };

        if (isLinked[rido.rid])
            isLinked[rido.rid](socket[0]);

        socket[1].on('data', (buf) => {
            let msg: any;
            try {
                msg = JSON.parse(buf.toString());
                if (!msg || typeof msg !== "object") throw new Error("Expected an object");
            } catch (error) {
                console.error("Malformed room IPC message", error);
                rsocket.destroy();
                return;
            }
            switch (msg.type) {
                case "consumed": {
                    if (isConsumed[msg.fd]) {
                        if (msg.error) {
                            isConsumed[msg.fd].reject(new Error(msg.error));
                        } else {
                            isConsumed[msg.fd].resolve();
                        }
                        delete isConsumed[msg.fd];
                    }
                    break;
                }
                case "stats": {
                    roomStats[rido.rid] = msg;
                    break;
                }
                case "infos": {
                    roomInfos[rido.rid] = msg;
                    break;
                }
                case "exec": {
                    roomExec[msg.cid]?.(msg);
                    delete roomExec[msg.cid];
                }
            }
        });

        socket[1].on("end", () => {
        });

        const cleanup = () => {
            for (const [fd, pending] of Object.entries(isConsumed)) {
                if (pending.rid === rido.rid) {
                    pending.reject(new Error(`Room IPC ${rido.rid} closed before consuming socket`));
                    delete isConsumed[fd];
                }
            }
            delete rooms[rido.rid];
            delete isLinked[rido.rid];
            delete roomStats[rido.rid];
            delete roomInfos[rido.rid];
            socket[0].removeAllListeners();
            socket[1].removeAllListeners();
            socket[0].destroy();
            socket[1].destroy();
            rsocket.removeAllListeners();
        };

        rsocket.on('error', cleanup);
        rsocket.on('close', cleanup);

        socket[0].write(JSON.stringify({ type: "getinfos" }));
        socket[0].write(JSON.stringify({ type: "getstats" }));
    });

    try {
        await new Promise<void>((resolve, reject) => {
            server.once('error', (err: any) => {
                if (err.code === 'EADDRINUSE') {
                    reject(err);
                } else {
                    console.error("IPC server error:", err);
                }
            });
            server.listen(bindPath, resolve);
        });
        return undefined;
    } catch (err) {
        console.log("IPC bind path in use, connecting to old master...");
        const stolenFd = await new Promise<number>((resolve, reject) => {
            const socket = net.connect(bindPath);
            const encoder = frame.encode();
            const decoder = frame.decode();
            encoder.pipe(socket).pipe(decoder);

            socket.once('connect', () => {
                encoder.write(JSON.stringify({ type: "newmaster" }));
            });

            decoder.on('data', (buf) => {
                try {
                    const msg = JSON.parse(buf.toString());
                    if (msg.type === "newmaster_ack") {
                        const { pid, fd } = msg;
                        console.log(`Received newmaster_ack from pid ${pid} with fd ${fd}`);
                        
                        const pfd = pidfd_open(pid, 0);
                        if (pfd < 0) throw new Error(`pidfd_open failed: ${pfd}`);
                        const stolen = pidfd_getfd(pfd, fd, 0);
                        if (stolen < 0) throw new Error(`pidfd_getfd failed: ${stolen}`);
                        
                        socket.destroy();
                        resolve(stolen);
                    }
                } catch (e) {
                    reject(e);
                }
            });

            socket.on('error', reject);
        });

        await new Promise<void>((resolve, reject) => {
            const tryListen = () => {
                server.once('error', (err: any) => {
                    if (err.code === 'EADDRINUSE') {
                        setTimeout(tryListen, 100);
                    } else {
                        reject(err);
                    }
                });
                server.listen(bindPath, () => {
                    server.removeAllListeners('error');
                    resolve();
                });
            };
            tryListen();
        });

        return stolenFd;
    }
};
