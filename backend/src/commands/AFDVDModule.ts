import { send_system } from "../room-utils.js";
import type { Group, UserPrivate } from "../types.js";
import { DVDModule } from "./DVDModule.js";
import { ChatModule, Command, CommandRoomStateArg } from "./index.js";
import { PlaylistModule } from "./PlaylistModule.js";

// when a song is finished or skipped, it's pushed back at the end of the list

const sad = [":(", ":^("];
export class AFDVDModule extends ChatModule {
    dvding: {
        bounty: number;
        group: Group;
        dir: [number, number],
        speed: number;
    }[] = [];

    onjoin: any;
    onpick: any;
    update: any;
    override attach({ state, runtime, room }: CommandRoomStateArg): void {
        if (!this.enabled)
            return;

        let cap = 512;
        let cmdbuf = Buffer.alloc(cap * (2 + 4 + 4) + 3);
        cmdbuf[0] = 2; // move
        cmdbuf.writeInt16LE(-1, 1);
        this.update = setInterval(() => {
            if (this.dvding.length > cap) {
                const old = cmdbuf;
                cap *= 2;
                cmdbuf = Buffer.alloc(3 + cap * (2 + 4 + 4));
                cmdbuf.set(old);
            }
            let ptr = 3;
            for (let g of this.dvding) {
                if (!g.group) continue;
                g.group.x += g.speed * g.dir[0];
                g.group.y += g.speed * g.dir[1];
                if ((g.group.x < 0 && g.dir[0] < 0) ||
                    (g.group.x >= room.boardWidth && g.dir[0] > 0)) {
                    // reflect from the vertical walls
                    g.dir[0] *= -1;
                }
                if ((g.group.y < 0 && g.dir[1] < 0) ||
                    (g.group.y >= room.boardHeight && g.dir[1] > 0)) {
                    // reflect from the vertical walls
                    g.dir[1] *= -1;
                }
                cmdbuf.writeUint16LE(g.group.id, ptr); ptr += 2;
                cmdbuf.writeFloatLE(g.group.x, ptr); ptr += 4;
                cmdbuf.writeFloatLE(g.group.y, ptr); ptr += 4;
            }
            runtime.broadcaster.broadcast(cmdbuf.subarray(0, ptr))
        }, 32); // ~30fps

        this.onpick = (user: UserPrivate, gid: number) => {
            if (!this.dvding.length)
                return;

            const ng = room.groups.find(g => g.id == gid);
            if (!ng)
                return;

            const i = this.dvding.findIndex(g => g.group === ng);
            if (i < 0)
                return;

            const g = this.dvding[i];
            send_system(user, {
                color: '#ffffff',
                id: -1,
                name: ''
            }, `You've just picked up ${g.bounty} points!`);
            this.plmod.qtys[user.ipaddr] = (this.plmod.qtys[user.ipaddr] || 0) + g.bounty;
            user.conn.send(JSON.stringify({
                type: "points",
                qty: this.plmod.qtys[user.ipaddr]
            }));
            this.dvding.splice(i, 1);
        }
        this.onjoin = (u: UserPrivate, a: Group, b: Group) => {
            if (this.plmod.qtys[u.ipaddr] < this.plmod.currentPrice * 4) return;
            const roll = Math.random();
            if (roll > 1 - 0.125) return;
            // drop between 75 and 125% of the total: the more you risk loss, the bigger the loss will get
            let drop = (this.plmod.qtys[u.ipaddr] * 0.33) * (0.85 + Math.random() * 0.5);
            drop = Math.ceil(drop);
            this.plmod.qtys[u.ipaddr] -= drop;
            u.conn.send(JSON.stringify({
                type: "points",
                qty: this.plmod.qtys[u.ipaddr]
            }));

            const small = room.groups.filter(e => e.indices.length < 4 && !this.dvding.some(g => g.group == e));
            const pick = small[~~(Math.random() * small.length)];

            let dir = [Math.random(), Math.random()] as [number, number];
            let n = Math.sqrt(dir[0] * dir[0] + dir[1] * dir[1]);
            dir[0] /= n;
            dir[1] /= n;
            this.dvding.push({
                bounty: drop,
                group: pick,
                speed: 5 + Math.random() * 10,
                dir
            });

        };
        runtime.events.addListener("joined", this.onjoin);
        runtime.events.addListener("picked", this.onpick);
    }

    name = "afdvd";
    enabled = true;

    constructor(public plmod: PlaylistModule) {
        // do not keep a reference to anything here because the objects related to
        // this id may not have been constructed yet
        super();
    }

    commands: Command[] = [{
        name: 'stopdvd',
        desc: `Usage: /stopdvd
no fun allowed, disable the april fool prank`,
        handler: ({ state, runtime }) => {
            const r = runtime.modules.indexOf(this);
            runtime.modules.splice(r, 1);
            runtime.modules.push(new DVDModule(runtime.modules.find(e => e.name === 'playlist') as PlaylistModule))
            clearInterval(this.update)
            runtime.events.removeListener("joined", this.onjoin)
            runtime.events.removeListener("picked", this.onpick)
            this.dvding = [];
            this.enabled = false;
            return false;
        }
    }];

    override serialize() {
        return { enabled: this.enabled };
    }

    override deserialize(d: any): void {
        if (!d) return;
        this.enabled = d.enabled;
    }
}
