import { thisroom, roomstate, getCommandHandlerStateArg, runtime } from "./room.js";
import { IPCReturn, JsonValue, Room, UserPrivate } from "./types.js";

type Bepis = {
    a: 1,
    b: 2;
}


type GeneratorArg = unknown | void | JSON;

type ObjectWithJsonMethods<T> = {
    [K in keyof T]: T[K] extends (...args: infer P) => IPCReturn
    ? P[number] extends JsonValue
    ? T[K]
    : "Error: All method parameters must be compatible with JsonValue."
    : T[K]
};


type IPC<T> = ObjectWithJsonMethods<T> & T
export const create = <T>(t: IPC<T>) => t;
const sleep = (n: number) => new Promise(_ => setTimeout(_, n));
export default (userp: UserPrivate) => {
    return create({
        f(b: number) {
            console.log('f called with b = ', b);
            return b + 43;
        },
        async g(b: number) {
            await sleep(1000);
            return b + 435;
        },
        *h(b: number): Generator<number, number, number> {
            let a = 0;
            a += (yield b + 1);
            a += (yield b + 2);
            a += (yield b + 3);
            a += (yield b + 4);
            return a + 2;
        },
        async *i(b: number) {
            let a = 0;
            await sleep(1000);
            a = yield b + 1;
            await sleep(1000);
            a = yield b + 2;
            await sleep(1000);
            a = yield b + 3;
            await sleep(1000);
            a = yield b + 4;
            await sleep(1000);
            return a + 2;
        },
        command(name: string, args: JsonValue[]) {
            const state = getCommandHandlerStateArg(userp);
            for (const mod of runtime.modules) {
                for (const cmd of mod.commands) {
                    if (cmd.name === name) {
                        return cmd.handler(state, ...args);
                    }
                }
            }
            return undefined;
        }
    });
}
