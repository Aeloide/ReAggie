import { UserPrivate } from "../../types.js";
import { BinCommands } from "../../types.js";
import { struct, u16, f64 } from "../binary.js";

const heartbeatStruct = struct({
    id: u16(),
    'clitime?': f64()
});

type HeartbeatStruct = ReturnType<typeof heartbeatStruct['parse']>;

const handleHeartbeat = (
    payload: HeartbeatStruct,
    raw: Buffer,
    user: UserPrivate
) => {
    if (payload.id !== user.user.id) return;
    if (raw.length !== 3 && raw.length !== 11) return;
    if (raw.length === 11 && !Number.isFinite(payload.clitime)) return;
    user.missedhb = 0;
    user.heartbeatPending = false;
    user.lastrecvd = Date.now();
    user.heartbeatReceivedMono = performance.now();
    if (raw.length === 11)
        user.clitime = payload.clitime!;
    else
        delete user.clitime;
}

export default {
    [BinCommands.Heartbeat]: [heartbeatStruct, handleHeartbeat]
} as const