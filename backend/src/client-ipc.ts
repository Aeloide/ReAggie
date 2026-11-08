import net from "net";
import frame from "frame-stream";
import { getMyLibcPath, snooze } from "./utils.js";
import { open, DataType, define } from "ffi-rs";

open({
    library: 'libc',
    path: getMyLibcPath()
});

const syscall = define({
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

export const bindPath = '\0reaggie';

let parentfd: number;

export const setParentFd = (pid: number) => {
    parentfd = pidfd_open(pid, 0);
};

export const extractSocket = (targetfd: number): net.Socket => {
    const targetwsfd = pidfd_getfd(parentfd, targetfd, 0);
    return new net.Socket({ fd: Number(targetwsfd), readable: true, writable: true });
};

export const reconnectToServer = async (cb: (sock: [frame.Encoder, frame.Decoder]) => void, attempt = 0): Promise<void> => {

    let nclii = net.connect(bindPath);
    const encoder = frame.encode();
    encoder.pipe(nclii);
    const decoder = frame.decode();
    nclii.pipe(decoder);

    cb([encoder, decoder]);

    try {
        await new Promise<void>((_, rej) => {
            nclii.once("connect", _);
            nclii.once("error", rej);
        });
    } catch (e) {
        const maxDelay = 5000;
        const baseDelay = 200;
        let delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
        delay = delay * (0.8 + Math.random() * 0.4); // +/- 20% jitter
        await snooze(delay);
        return reconnectToServer(cb, attempt + 1);
    }
};

let lock: net.Server | undefined;
export const initRoomProcessLock = (roomId: string) => {
    if (lock) return;
    const reaggieBindPathLock = '\0reaggie/' + roomId;
    lock = net.createServer();
    lock.on('error', (e) => {
        if ((e as any).code === 'EADDRINUSE') {
            console.error('Address in use, exiting...');
            process.exit(1);
        } else {
            console.error("Room process lock error", e);
        }
    });
    lock.listen(reaggieBindPathLock);
};