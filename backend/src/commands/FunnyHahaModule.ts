import { BinCommands } from "../types.js";
import { send_system } from "../room-utils.js";
import { Room, UserPrivate } from "../types.js";
import { PlaylistModule } from "./PlaylistModule.js";
import { ChatModule, Command, CommandRoomStateArg, CommandRoomStateUserArg } from "./index.js";

type FunnyHaha = {
    id: number;
    x: number;
    y: number;
    scale: number;
} & (object | {
    gid: number;
    pid: number;
})

export class FunnyHahaModule extends ChatModule {
    attachedroom?: Room;

    name = 'funnyhaha';

    plmodule!: PlaylistModule;
    entities: Map<number, FunnyHaha> = new Map;
    override attach(args: CommandRoomStateArg): void {
        const { state, runtime, room } = args;
        // module relies on playlist module for points
        const pl = runtime.modules.find(e => e instanceof PlaylistModule) as PlaylistModule | undefined;
        if (!pl)
            return;

        this.plmodule = pl;

        runtime.events.addListener("connected", (up: UserPrivate) => {
            console.log('onsd connnece')
            this.entities.forEach(e => {
                let sc: Buffer;
                if ('gid' in e)
                    sc = makeSpawnCommand(e.id, e.x, e.y, e.scale, e.gid, e.pid);
                else
                    sc = makeSpawnCommand(e.id, e.x, e.y, e.scale);
                up.conn.send(sc);
            });
        });
    }

    commands: Command[] = [{
        name: 'funny',
        named_params: ['id', 'x', 'y', 'scale', 'gid', 'pid'],
        handler: (cmdarg, ...args) => {
            const { userp, user } = cmdarg;
            const qty = 10;
            if (!this.plmodule) {
                send_system(userp, user, 'Jukebox was not enabled in this room');
                return true;
            }
            if (!this.plmodule.qtys[userp.ipaddr] || qty > this.plmodule.qtys[userp.ipaddr]) {
                send_system(userp, user, 'You do not have enough points (10 req)');
                return true;
            }
            let [id, x, y, scale, gid, pid] = args.map(e => +e);
            console.log(id, x, y, scale, gid, pid)
            const sc = makeSpawnCommand(id, x, y, scale, gid, pid);
            cmdarg.runtime.broadcaster.broadcast(sc);
            setTimeout(() => {
                console.log('sending killing command')
                const dc = makeDieCommand(cmdarg, id);
                cmdarg.runtime.broadcaster.broadcast(dc);
            }, 10 * 1000);
            this.plmodule.qtys[userp.ipaddr] -= qty;
            this.plmodule.send_points(userp);
            return true;
        }
    }];

    override serialize() {
        return {
        };
    }

    override deserialize(d: ReturnType<FunnyHahaModule['serialize']>): void {
        if (!d)
            return;
    }
}

function makeSpawnCommand(id: number, x: number, y: number,
    scale: number, gid?: number, pid?: number) {
    const spawnCommand = Buffer.alloc(3 + 25);
    spawnCommand[0] = BinCommands.EntityManagerIO; // entity manager command
    spawnCommand[1] = 4; // entity manager 1;
    spawnCommand[2] = gid !== undefined ? 0 : 1; // spawn entity attached or global

    let ptr = 3;
    spawnCommand.writeInt32LE(id, ptr); ptr += 4;
    spawnCommand.writeFloatLE(x, ptr); ptr += 4;
    spawnCommand.writeFloatLE(y, ptr); ptr += 4;
    spawnCommand.writeFloatLE(scale, ptr); ptr += 4;
    if (gid !== undefined) {
        spawnCommand.writeUInt16LE(gid, ptr); ptr += 2;
        spawnCommand.writeUInt16LE(pid!, ptr); ptr += 2;
    }

    return spawnCommand.subarray(0, ptr);
}


function makeDieCommand(cmdarg: CommandRoomStateUserArg, id: number) {
    const dieCommand = Buffer.alloc(3 + 4);
    dieCommand[0] = BinCommands.EntityManagerIO; // entity manager command
    dieCommand[1] = 4; // entity manager 1;
    dieCommand[2] = 2; // spawn entity attached or global

    let ptr = 3;
    dieCommand.writeInt32LE(id, ptr); ptr += 4;

    return dieCommand;
}

