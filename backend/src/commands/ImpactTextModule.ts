import { send_system } from "../room-utils.js";
import { PlaylistModule } from "./PlaylistModule.js";
import { ChatModule, Command, CommandRoomStateArg, CommandRoomStateUserArg } from "./index.js";

const genquad = (tx: number, ty: number) => {
    const a = (1 - ty) / (tx ** 2);
    return (x: number) => a * (x - 75) ** 2 + ty;
}

const z75interp = genquad(75, 0.25);

function truncateToBytes(input: string, maxBytes: number) {
    const encoder = new TextEncoder();  // TextEncoder is available in modern Node.js
    let byteSize = 0;
    let lastValidIndex = 0;

    for (let i = 0; i < input.length; i++) {
        const charByteLength = encoder.encode(input[i]).length;
        if (byteSize + charByteLength > maxBytes) {
            break;
        }
        byteSize += charByteLength;
        lastValidIndex = i + 1;
    }

    return input.slice(0, lastValidIndex);
}

export class ImpactTextModule extends ChatModule {
    name = 'impact';

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
        name: 'impact',
        // seriously, how am i supposed to explain that
        desc: `
Usage: /impact [text up to 75 "characters"]
Effect: Costs 15 points. Will make the passed text scroll right to left on everyone's screens, at a random position/size. Longer text will be generally smaller.`,
        handler: (cmdarg, ...args) => {
            const { userp, user } = cmdarg;

            let ntxt = args.join(' ');

            if (ntxt.trim().length == 0)
                send_system(userp, user, 'You need to write something.');

            ntxt = truncateToBytes(ntxt, 75);// 75 is the limit on niconico
            if (!this.plmodule.qtys[userp.ipaddr] || 15 > this.plmodule.qtys[userp.ipaddr]) {
                if (user.name.includes('mask'))
                    send_system(userp, user, 'See, I told you so.');
                else
                    send_system(userp, user, 'You need at least 15 points');
                return true;
            }

            this.plmodule.qtys[userp.ipaddr] -= 15;
            this.plmodule.send_points(userp);
            send_system(userp, user, 'Success.');

            // I seriously hope there aren't other places where I didn't use the character length of a string as a size for a buffer, h-haha
            const txt = Buffer.concat([Buffer.from(ntxt), Buffer.from([0])]) as any;
            let size = 14 + Math.random() * 26; // random between 14-40
            size *= z75interp(txt.byteLength - 1);
            const top = Math.random() * (100 - size) + size; // somewhere in viewport where it will hopefully be visible
            const buff = Buffer.concat([Buffer.from([0xaa, 2, 0]), txt, Buffer.alloc(8)]) as any;
            let ptr = 3 + txt.byteLength;
            buff.writeFloatLE(top, ptr);
            ptr += 4;
            buff.writeFloatLE(size, ptr);
            cmdarg.runtime.broadcaster.broadcast(buff);
            return true;
        }
    },];

    override serialize() {
        return {
        }
    }

    override deserialize(d: ReturnType<ImpactTextModule['serialize']>): void {
        if (!d)
            return;
    }
}
