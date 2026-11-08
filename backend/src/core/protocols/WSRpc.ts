import { GeneratorArg, IPCReturn, JsonValue, Room, RoomRuntimeState, RoomState, User, UserPrivate } from "../../types.js";
import { Module } from "./index.js";

export class WSRpc implements Module {
    attach({ runtime, state, room }: { runtime: RoomRuntimeState, state: RoomState, room: Room }): void {
        runtime.jsonCodeHandlers.set("rpc", async (payload, user, guser) => {
            const arg = payload as {
                type: "rpc";
                i: number;
            } & ({
                m: string;
                a: JsonValue[];
            } | {
                gid: number;
                n: JsonValue;
            });
            if ('m' in arg && arg.m in user.ipc) {
                // trust me bro
                const ret: IPCReturn = (user.ipc[arg.m as keyof typeof user['ipc']]! as any)(...arg.a);
                if (!ret) {
                    user.conn.send(JSON.stringify({ type: "rpc", i: arg.i }));
                }
                else if (ret instanceof Promise) {
                    const pid = ~~(Math.random() * 0xFFFFFFFF);
                    user.conn.send(JSON.stringify({ type: "rpc", i: arg.i, t: 'p', p: pid }));
                    ret.then(v => {
                        user.conn.send(JSON.stringify({ type: "rpc", v, p: pid }));
                    }).catch(e => {
                        user.conn.send(JSON.stringify({ type: "rpc", e, p: pid }));
                    });
                }
                else if ((ret as any)?.__proto__?.[Symbol.toStringTag]?.includes('Generator')) {
                    const gid = ~~(Math.random() * 0xFFFFFFFF);
                    // ret is a Generator
                    const bret = ret as any as Generator<GeneratorArg, GeneratorArg, GeneratorArg>;
                    user.conn.send(JSON.stringify({ type: "rpc", i: arg.i, t: 'g', g: gid }));
                    user.generators.set(gid, bret);
                } else {
                    user.conn.send(JSON.stringify({ type: "rpc", i: arg.i, v: ret }));
                }
            }
            else if ('n' in arg) {
                const bret = user.generators.get(arg.gid);
                if (!bret) return;
                const n = await bret.next(arg.n);
                user.conn.send(JSON.stringify({ type: "rpc", i: arg.i, t: 'g', g: arg.gid, d: n.done, v: n.value }));
                if (n.done)
                    user.generators.delete(arg.gid);
            }
        });
    }
}