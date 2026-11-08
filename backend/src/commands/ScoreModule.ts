import { RoomState, UserPrivate } from "../types.js";
import { send_system } from "../room-utils.js";
import { ChatModule, Command, CommandRoomStateArg } from "./index.js";

export class ScoreModule extends ChatModule {

    scores: Record<string, number> = {};

    override attach({ room, state, runtime }: CommandRoomStateArg): void {
        runtime.events.on("joined", (u: UserPrivate, rs: RoomState) => {
            this.scores[u.name] = (this.scores[u.name] || 0) + 1;
        });
        if (!room.ext)
            room.ext = {};
    }
    name = 'score';

    commands: Command[] = [{
        name: 'scores',
        named_params: [],
        desc: `
Usage: /scores
Effect: Shows leaderboard`,
        handler: ({ userp, user }, ...args) => {
            const ld = Object.entries(this.scores).sort((a, b) => b[1] - a[1]).map((e, i) => `${i + 1}. ${e[0]} (${e[1]} pts.)`).join('\n');
            send_system(userp, user, 'Leaderboard:\n' + ld);
            return true;
        }
    }];

    // stateless
    override serialize() {
        return {
            scores: this.scores
        };
    }

    override deserialize(d: any): void {
        if (!d)
            return;
        this.scores = d.scores || {};
    }
}
