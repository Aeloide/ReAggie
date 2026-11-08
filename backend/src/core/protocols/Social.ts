import * as db from "../../db.js";
import { fixUserName, send_system, syncHostName } from "../../room-utils.js";
import { Room, RoomRuntimeState, RoomState, UserPrivate } from "../../types.js";
import { sendAlert } from "../../utils.js";
import { Module } from "./index.js";
import { setToken } from "../../connectionFlow.js";

let alertSent = false;
const setSubscription = async (userpriv: UserPrivate, sub: PushSubscriptionJSON) => {
    userpriv.pushtoken = sub.endpoint;
    await db.followersc.updateOne({ subkey: sub.endpoint },
        {
            $set: {
                subkey: sub.endpoint,
                sub: sub as any,
                last_seen: Date.now(),
            },
            $setOnInsert: {
                following: []
            }
        },
        { upsert: true });
};

export class Social implements Module {
    attach({ runtime, state, room }: { runtime: RoomRuntimeState, state: RoomState, room: Room }): void {
        runtime.jsonCodeHandlers.set("emote", (payload, user, guser) => {
            try {
                user.chats.use(1.4);
            } catch (e) {
                if (!alertSent) {
                    alertSent = true;
                    send_system(user, guser, 'You are being a nuisance');
                    sendAlert(`Nuisance in ${process.argv[2]}`, `https://jiggie.fun/${process.argv[2]} ${user.ipaddr}`);
                }
                return;
            }
            payload.emotes = payload.emotes.slice(0, 5);
            runtime.broadcaster.broadcast({
                type: "emote",
                emotes: payload.emotes,
                name: user.name,
                color: guser.color,
                id: guser.id
            });
        });

        runtime.jsonCodeHandlers.set("token", async (payload, user, guser) => {
            if (typeof payload.token !== "string") return;
            await setToken(user, payload.token);
        });

        runtime.jsonCodeHandlers.set("sub", async (payload, user, guser) => {
            if (!payload.sub || typeof payload.sub !== "object"
                || typeof payload.sub.endpoint !== "string") return;
            await setSubscription(user, payload.sub);
        });

        runtime.jsonCodeHandlers.set("user", (payload, user, guser) => {
            if (typeof payload.name !== "string"
                || typeof payload.color !== "string"
                || !/^#[0-9a-fA-F]{6}$/.test(payload.color)) {
                send_system(user, guser, "Invalid user update");
                return;
            }
            const name = fixUserName(payload.name, room);
            guser.color = payload.color;
            guser.name = name;
            user.name = name;
            if (user.host.RoomCreator) syncHostName(user.name, room, state);
            runtime.broadcaster.broadcastRoomUsers();
        });
    }
}