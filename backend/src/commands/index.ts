import { Room, RoomState, RoomRuntimeState, User, UserPrivate } from "../types.js";

export interface CommandRoomStateArg {
    room: Room;
    state: RoomState;
    runtime: RoomRuntimeState;
}

export interface CommandRoomStateUserArg extends CommandRoomStateArg {
    userp: UserPrivate;
    user: User;
}

export interface Command {
    name: string;
    desc?: string;
    named_params?: string[];
    // return true if the command should stop being evaluated and NOT added to the chat log and broadcasted
    handler(state: CommandRoomStateUserArg, ...args: any[]): boolean;
};

export abstract class ChatModule {

    abstract get name(): string;
    abstract get commands(): Command[];

    attach(arg: CommandRoomStateArg): void { }

    serialize(): any { }
    deserialize(d: any): void { }
};
