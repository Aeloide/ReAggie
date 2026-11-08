import { BinCommands } from "../types.js";
import { send_system } from "../room-utils.js";
import { Room } from "../types.js";
import { PlaylistModule } from "./PlaylistModule.js";
import { ChatModule, Command, CommandRoomStateArg } from "./index.js";

export class LargeBugModule extends ChatModule {
    attachedroom?: Room;

    name = 'largebug';

    plmodule!: PlaylistModule;
    override attach(args: CommandRoomStateArg): void {
        const { state, runtime, room } = args;
        // module relies on playlist module for points
        const pl = runtime.modules.find(e => e instanceof PlaylistModule) as PlaylistModule | undefined;
        if (!pl)
            return;

        this.plmodule = pl;
    }

    commands: Command[] = [{
        name: 'largebug',
        named_params: ['x', 'y'],
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
            let [x, y] = args.map(e => +e);
            const spawnCommand = Buffer.alloc(3 + 4 * 3);
            spawnCommand[0] = BinCommands.EntityManagerIO; // entity manager command
            spawnCommand[1] = 1; // entity manager 1;
            spawnCommand[2] = 0; // spawn entity;
            spawnCommand.writeFloatLE(x, 3);
            spawnCommand.writeFloatLE(y, 7);
            spawnCommand.writeUint32LE(~~(Math.random() * 0x7FFFFFFF), 11);
            cmdarg.runtime.broadcaster.broadcast(spawnCommand);
            this.plmodule.qtys[userp.ipaddr] -= qty;
            this.plmodule.send_points(userp);
            return true;
        }
    }];

    override serialize() {
        return {
        };
    }

    override deserialize(d: ReturnType<LargeBugModule['serialize']>): void {
        if (!d)
            return;
    }
}
