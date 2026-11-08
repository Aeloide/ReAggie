import { ReplayWriter } from "../core/replay-writer.js";
import { ChatModule, Command, CommandRoomStateArg } from "./index.js";

export class ReplayModule extends ChatModule {

    isFirst = true;
    replayWriter?: ReplayWriter;
    private recording = false;

    name = 'replay';

    commands: Command[] = [];

    override attach(stateArg: CommandRoomStateArg): void {
        this.startup(stateArg);
    }

    startup({ room, state, runtime }: CommandRoomStateArg): void {
        if (room.endTime) return;

        let rid = process.argv[2];
        const replayFileName = `./replays/${rid}.jiggie`;
        this.replayWriter = new ReplayWriter(replayFileName, room.startTime);
        this.recording = true;
        runtime.broadcaster.on("broadcast", (type, message) => {
            if (!this.recording) return;
            if (type === "binary" || type === "room" || type === "users"
                || type === "update" || type === "push_groups") {
                if (this.isFirst) {
                    this.replayWriter!.write(JSON.stringify({ type: "room", room }));
                    this.isFirst = false;
                } else {
                    // ensure nothing gets recorded before the room message
                    if (type === "binary") {
                        this.replayWriter!.write(message);
                    } else {
                        this.replayWriter!.write(typeof message === "string"
                            ? message
                            : JSON.stringify(message));
                    }
                }
            }
        });

        // without users the state will not be valid
        runtime.broadcaster.broadcastRoomUsers();

        if (!room.startTime) {
            runtime.events.once("setStart", () => {
                this.replayWriter!.setStartTime(room.startTime!);
            });
        }
        if (!room.endTime) {
            runtime.events.once("setEnd", () => {
                this.recording = false;
                this.replayWriter!.endAndCompress();
            });
        }
        runtime.events.once("exit", () => {
            this.recording = false;
            this.replayWriter!.end();
        });
    }

    override serialize() {
        return {
            isFirst: this.isFirst
        };
    }

    override deserialize(d: any): void {
        if (!d)
            return;
        this.isFirst = d.isFirst;
    }
}
