import * as ws from "ws";
import { MuteEvaluator } from "./MuteEvaluator.js";
import type { UserPrivate } from "./types.js";
import { Permissions, Counter } from "./utils.js";
import { buildHostProps } from "./connectionFlow.js";

export let queue: any[] = [];
export const superUserPriv: UserPrivate = {
    generators: new Map(),
    ipc: {} as any,
    unreliableReady: false,
    processes: new Map(),
    muter: new MuteEvaluator([]),
    asn: -1,
    host: buildHostProps(new Permissions(['Admin'])),
    conn: {
        send(...o: Parameters<ws.WebSocket['send']>) {
            if (o[1]?.binary || Buffer.isBuffer(o[0])) {
                queue.push({ type: 'buffer', data: o });
            }
            if (o[1]?.binary && o[0] instanceof ArrayBuffer) {
                queue.push({ type: 'buffer', data: Buffer.from(o[0]) });
            }
            if (o[1]?.binary && ArrayBuffer.isView(o[0])) {
                queue.push({ type: 'buffer', data: Buffer.from(o[0].buffer) });
            }
            if (!o[1]?.binary && typeof o[0] === "string") {
                queue.push({ type: 'string', data: o[0] });
            }
        }
    } as any as ws.WebSocket,
    ipaddr: 'localhost',
    user: {
        color: '#000000',
        id: -1,
        name: 'System'
    },
    doDisconnect() { },
    missedhb: 0,
    missedPongs: 0,
    commited: undefined,
    speed: new Counter({ amount: 10e9, burst_factor: 1 }),
    solves: new Counter({ amount: 10e9, burst_factor: 1 }),
    chats: new Counter({ amount: 10e9, burst_factor: 4 }),
    selects: new Counter({ amount: 10e9, burst_factor: 4 }),
    ishost: new Permissions(['Admin']),
    name: 'System',
    pruned: false
};
