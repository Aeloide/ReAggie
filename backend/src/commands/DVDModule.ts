import type { Group, UserPrivate } from "../types.js";
import { ChatModule, Command, CommandRoomStateArg } from "./index.js";
import { PlaylistModule } from "./PlaylistModule.js";

// when a song is finished or skipped, it's pushed back at the end of the list

const sad = [":(", ":^("];
export class DVDModule extends ChatModule {

    override attach({ state, runtime }: CommandRoomStateArg): void {
        runtime.events.addListener("joined", (u: UserPrivate, a: Group, b: Group) => {
            if (this.plmod.qtys[u.ipaddr] >= this.plmod.currentPrice * 4) {
                const roll = Math.random();
                if (roll < 0.125) {
                    // drop between 75 and 125% of the total: the more you risk loss, the bigger the loss will get
                    let drop = (this.plmod.qtys[u.ipaddr] * 0.33) * (0.85 + Math.random() * 0.5);
                    drop = Math.ceil(drop);
                    this.plmod.qtys[u.ipaddr] -= drop;
                    u.conn.send(JSON.stringify({
                        type: "points",
                        qty: this.plmod.qtys[u.ipaddr]
                    }));

                    // give the money to the poorest (only if they've contributed at least one piece)
                    const poor = Object.entries(this.plmod.qtys).sort((a, b) => a[1] - b[1])[0];
                    this.plmod.qtys[poor[0]] += drop;

                    const msg = JSON.stringify({
                        type: "points",
                        qty: this.plmod.qtys[poor[0]]
                    });
                    for (const up of runtime.usersPriv.values()) {
                        if (up.ipaddr == poor[0])
                            u.conn.send(msg);
                    }
                }
            }
        });
    }

    name = "dvd";

    constructor(public plmod: PlaylistModule) {
        // do not keep a reference to anything here because the objects related to
        // this id may not have been constructed yet
        super();
    }

    commands: Command[] = [];

    override serialize() {
        return {};
    }
}
