import { banuser } from "../room-utils.js";
import { UserPrivate } from "../types.js";
import { send_system } from "../room-utils.js";
import { ChatModule, Command, CommandRoomStateArg, CommandRoomStateUserArg } from "./index.js";
import { clamp } from "../utils.js";

export class VoteKickModule extends ChatModule {
    override attach({ room, state, runtime }: CommandRoomStateArg): void {
        runtime.events.on("leave", (up: UserPrivate) => {
            this.roomVotes.forEach(v => v.delete(up.ipaddr));
        })
    }

    name = 'votekick';

    /** kickTargetIP, voteIPs[] */
    roomVotes = new Map<string, Set<string>>();

    handleVoteKickId({ room, state, runtime, userp: userPriv, user }: CommandRoomStateUserArg, ...args: string[]) {
        const conn = userPriv.conn;
        const sender = user;
        const { ipaddr: senderIP } = userPriv;

        // sendAsSystem for cases a player has muted the sender by id.
        function sendToAll(message: string, sendAsSystem = false) {
            runtime.broadcaster.broadcast({
                type: "chat",
                message: message,
                name: 'System',
                color: sendAsSystem ? '#ffffff' : sender.color,
                id: sendAsSystem ? -1 : sender.id
            });
        }

        function getUser(userId: string | undefined) {
            if (!userId) return null;

            const id: number = +userId;
            const targetUser = runtime.users.find(u => u.id == id);
            if (!targetUser) return null;

            return {
                name: targetUser.name,
                private: runtime.usersPriv.get(targetUser.id)!,
            };
        }

        // Abort if disabled.
        if (!room.votekick) {
            send_system(userPriv, user, 'Votekick is disabled.');
            return true;
        }

        // Abort on missing id
        if (!args[0]) {
            send_system(userPriv, user, 'Missing user id.');
            return true;
        }

        // Abort on invalid id
        const target = getUser(args[0]);
        if (!target) {
            send_system(userPriv, user, `Invalid user id: ${args[0]}`);
            return true;
        }

        // Prevent kicking hosts
        if (target.private.host.KickImmune) {
            send_system(userPriv, user, `Can't vote kick a host.`);
            return true;
        }

        const targetIp = target.private.ipaddr;

        // Initialize vote counting per user
        let targetVotes = this.roomVotes.get(targetIp);
        if (!targetVotes) {
            targetVotes = new Set();
            this.roomVotes.set(targetIp, targetVotes);
        }

        // Reject double-voting
        if (targetVotes.has(senderIP)) {
            send_system(userPriv, user, `You have already voted to kick ${target.name}`);
            return true;
        }

        const roomUsers = [...runtime.usersPriv.values()];
        const uniqueIPs = new Set(roomUsers.map(v => v.ipaddr));
        const requiredVotes = clamp(2, ~~(uniqueIPs.size * 0.6), 42);

        // Count the vote
        targetVotes.add(senderIP);
        sendToAll(`${sender.name} voted to kick ${target.name} (${targetVotes.size}/${requiredVotes})`);

        // Kick the target if the vote passes, don't count disconnected users' votes.
        if ([...targetVotes].filter(ip => uniqueIPs.has(ip)).length >= requiredVotes) {
            const all = [...runtime.usersPriv.values()].filter(e => e.ipaddr == targetIp);
            if (all.length) {
                banuser(state, runtime, room, all[0], 'As a result from a votekick', () => all[0].doDisconnect(all[0], 'As a result from a votekick'));
            } else {
                state.bannedips.push(targetIp);
                sendToAll(`A disconnected user was banned.`, true);
            }
        }

        return true; // Prevent the /votekick chat message from being broadcast.
    }

    /** Votekick by held piece count or name. Useful when the target is ambiguous. */
    handleVoteKick(stateArg: CommandRoomStateUserArg, ...args: string[]) {
        const { room: ar, state: r, runtime, userp, user } = stateArg;
        let most: [number, number, number] | undefined;
        if (args[0]) {
            const u = runtime.users.find(u => u.name.includes(args[0]) || args[0].includes(u.name));
            if (u)
                most = [u.id, 0, 0];
        } else {
            const userpluscounts = runtime.users.map(u => {
                const c = ar.groups.filter(g => g.selected === u.id).length;
                return [u.id, 0, c] as [number, number, number];
            }).sort((a, b) => a[2] - b[2]);
            most = userpluscounts.at(-1);
        }

        if (most)
            this.handleVoteKickId(stateArg, '' + most[0]);
        else
            send_system(userp, user, 'Could not find the user');
        return true; // Prevent the /votekick chat message from being broadcast.
    }

    commands: Command[] = [{
        name: 'votekick',
        named_params: ['name'],
        desc: `
Usage: /votekick [optional:name]
Effect: Cast a vote to kick whoever is holding the most pieces right now, or the specified name.`,
        handler: this.handleVoteKick.bind(this)
    }, {
        name: 'votekickid',
        desc: `
Usage: /votekickid [id]
Effect: Cast a vote to kick the player with the matching id.`,
        named_params: ['user'],
        handler: this.handleVoteKickId.bind(this)
    }];

    override serialize() {
        const d: [string, string[]][] = [];
        for (let [ip, votes] of this.roomVotes) {
            d.push([
                ip,
                [...votes]
            ]);
        }
        return d;
    }

    override deserialize(d: any): void {
        try {
            if (d) {
                this.roomVotes = new Map<string, Set<string>>();
                for (let [ip, votes] of d as [string, string[]][]) {
                    this.roomVotes.set(ip, new Set<string>(votes));
                }
            }
        } catch {
            // old version of vote kick
        }
    }
}