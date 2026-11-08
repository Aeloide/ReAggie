import { RoomRuntimeState, RoomState, Room, UserPrivate } from "../../types.js";
import Merge from "./Merge.js";
import Heartbeat from "./Heartbeat.js";
import Lock from "./Lock.js";
import Movement from "./Movement.js";
import Rotation from "./Rotation.js";
import Select from "./Select.js";
import JigChanModule from "../../commands/JigChanModule.js";
import PollModule from "../../commands/PollModule.js";
import RollbackModule from "../../commands/RollbackModule.js";

export const Implementations = new Map(Object.entries({
    ...Merge,
    ...Heartbeat,
    ...Lock,
    ...Movement,
    ...Rotation,
    ...Select,
    ...JigChanModule,
    ...PollModule,
    ...RollbackModule,
}).map(([k, v]) => [Number(k), v]))

type ValueType = typeof Implementations extends Map<any, infer V> ? V : never;

export type ParserTypes = ValueType[0];
export type PayloadType = ReturnType<ParserTypes['parse']>;
export type Handler<T extends PayloadType> = (payload: T,
    raw: Buffer,
    user: UserPrivate,
    room: Room,
    state: RoomState,
    runtime: RoomRuntimeState) => void;

export interface Module {
    attach(arg: {
        runtime: RoomRuntimeState;
        state: RoomState;
        room: Room
    }): void;
}
