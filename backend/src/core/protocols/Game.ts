import { banuser, clamp, forceRoomSync, send_system } from "../../room-utils.js";
import { roomstate } from "../../room.js";
import { BinCommands, Group, PSet, Room, RoomRuntimeState, RoomState, UserPrivate } from "../../types.js";
import { Module } from "./index.js";
import { ChatModule } from "../../commands/index.js";
import { ScoreModule } from "../../commands/ScoreModule.js";
import { JigChanModule } from "../../commands/JigChanModule.js";
import { getGroupSize } from "./arrangePieces.js";

function getModule<T extends ChatModule>(runtime: RoomRuntimeState, ctor: new (...args: any[]) => T) {
    return (runtime.modules.find(e => e instanceof ctor)) as T | undefined;
}

const sendCommit = (
    runtime: RoomRuntimeState,
    ua: UserPrivate,
    id: number
) => {
    const buff = Buffer.allocUnsafe(3);
    buff[0] = BinCommands.SetCommitted;
    const ip = ua.ipaddr;
    buff.writeUint16LE(id, 1);
    runtime.usersPriv.forEach(u => u.ipaddr === ip && u.conn.send(buff));
};

const sendUncommit = (
    runtime: RoomRuntimeState,
    ua: UserPrivate,
    id: number
) => {
    const buff = Buffer.allocUnsafe(3);
    buff[0] = BinCommands.UnsetCommitted;
    const ip = ua.ipaddr;
    buff.writeUint16LE(id, 1);
    runtime.usersPriv.forEach(u => u.ipaddr === ip && u.conn.send(buff));
};

const clearOwnerOf = (runtime: RoomRuntimeState, g: Group) => {
    for (const [ip, committed] of runtime.groupownersbyip) {
        if (!committed.delete(g)) continue;
        const owner = [...runtime.usersPriv.values()].find(user => user.ipaddr === ip);
        if (owner) sendUncommit(runtime, owner, g.id);
        if (committed.size === 0)
            runtime.groupownersbyip.delete(ip);
    }
};

function computeFinalStats(runtime: RoomRuntimeState, roomstate: RoomState) {
    const scores = getModule(runtime, ScoreModule);
    const jc = getModule(runtime, JigChanModule);
    if (!scores)
        return;
    const ranking = Object.entries(scores.scores).sort((a, b) => b[1] - a[1]);
    const counter = new Map<string, number>();
    const chatcounter = new Map<string, number>();

    let jcfav: string | undefined;
    if (jc) {
        for (const jigchan of jc.jigchans.values())
            counter.set(jigchan.loverip, (counter.get(jigchan.loverip) || 0) + 1);
        const lovers = [...counter].sort((a, b) => b[1] - a[1]);
        if (lovers.length > 1 && lovers[0]![1] > 1) { // only consider if someone did some patting
            const m = lovers[0]![1];
            let i = 0;
            while (i < lovers.length && lovers[i]![1] === m)
                ++i;
            const top = lovers.slice(0, i);
            const favip = top[~~(Math.random() * top.length)]![0]; // fav is the one that cucked the most
            const favuser = [...runtime.usersPriv.values()].find(up => up.ipaddr === favip);
            jcfav = favuser?.name;
        }
    }

    // deadweight is whoever has the highest chat messages/points ratio but isn't in the top 3 score.
    for (const msg of roomstate.chatlog || []) {
        chatcounter.set(msg.name, (chatcounter.get(msg.name) || 0) + 1);
    }
    // score is always at least one, since it's tracked when doing a connection, so there's no div/0
    const alts = ranking
        .slice(3)
        .filter(e => chatcounter.has(e[0]))
        .map((e: [string, number]) => [e[0], (chatcounter.get(e[0])!) / e[1]] as [string, number])
        .sort((a, b) => b[1] - a[1]);
    const deadweight = alts.length > 0 ? alts[0]![0] : undefined;
    const stats: {
        ranking: [string, number][],
        jcfav?: string;
        deadweight?: string;
    } = {
        ranking
    };
    if (jcfav)
        stats.jcfav = jcfav;
    if (deadweight)
        stats.deadweight = deadweight;
    roomstate.endstats = stats;
}

const neighboors = (idx: number, s: PSet) => {
    const ret = [];
    const posToId = (x: number, y: number) => y * s.cols + x;
    const [x, y] = [idx % s.cols, ~~(idx / s.cols)];
    if (y > 0) // if not top row
        ret.push(posToId(x, y - 1)); // top neighboor
    if (y < s.rows - 1) // if not bottom
        ret.push(posToId(x, y + 1)); // bottom neighboor
    // do inequality instead of equality because of float fuckery
    if (x > 0) // if not left
        ret.push(posToId(x - 1, y)); // left neighboor
    if (x < s.cols - 1) // if not right
        ret.push(posToId(x + 1, y)); // right neighboor
    return ret;
};

export const revealCensoredGroups = (room: Room, runtime: RoomRuntimeState) => {
    const count = room.ext?.censoredCount || 0;
    if (count < 1) return;

    const marker = 0xDEADBABE;
    const markerTolerance = 1024;
    const configuredIds = Array.isArray(room.ext?.censoredIds)
        ? room.ext.censoredIds as number[]
        : [];
    const fallbackIds = room.groups
        .filter(group => Math.abs(group.x - marker) <= markerTolerance
            && Math.abs(group.y - marker) <= markerTolerance)
        .map(group => group.id);
    const ids = [...new Set(configuredIds.length ? configuredIds : fallbackIds)].slice(0, count);
    const initialById = new Map<number, Group>();
    for (const initial of room.initialLayout || []) {
        initialById.set(initial.id, initial);
        for (const id of initial.ids || []) initialById.set(id, initial);
    }

    const revealed: Group[] = [];
    ids.forEach((id, index) => {
        const group = runtime.transformedgroups.get(id);
        if (!group || revealed.includes(group)) return;
        const initial = initialById.get(id);
        if (initial && initial.x < 0xDEAD0000 && initial.y < 0xDEAD0000) {
            group.x = clamp(0, initial.x, room.boardWidth);
            group.y = clamp(0, initial.y, room.boardHeight);
        } else {
            const angle = 2 * Math.PI * index / Math.max(1, ids.length);
            const radius = Math.min(room.boardWidth, room.boardHeight) * 0.25;
            group.x = clamp(0, room.boardWidth / 2 + Math.cos(angle) * radius, room.boardWidth);
            group.y = clamp(0, room.boardHeight / 2 + Math.sin(angle) * radius, room.boardHeight);
        }
        delete group.selected;
        delete group.dragged;
        revealed.push(group);
    });

    room.ext!.censoredCount = 0;
    if (revealed.length === 0) return;

    const outbound = Buffer.allocUnsafe(3 + revealed.length * 10);
    outbound[0] = BinCommands.Drop;
    outbound.writeUInt16LE(0xffff, 1);
    revealed.forEach((group, index) => {
        const offset = 3 + index * 10;
        outbound.writeUInt16LE(group.id, offset);
        outbound.writeFloatLE(group.x, offset + 2);
        outbound.writeFloatLE(group.y, offset + 6);
    });
    runtime.broadcaster.broadcast(outbound);
};

export class Game implements Module {
    attach({ runtime, state, room }: { runtime: RoomRuntimeState, state: RoomState, room: Room }): void {
        runtime.jsonCodeHandlers.set("kick", (payload, user, guser) => {
            if (!user.host.Kick)
                return;
            const toban = payload.user;
            const u = runtime.usersPriv.get(toban);
            if (!u || (u.host.KickImmune)) return;
            banuser(state, runtime, room, u, 'Banned by ' + user.name, () => u.doDisconnect(u, 'Banned by ' + user.name)); // Kick their alts too.
        });
        runtime.jsonCodeHandlers.set("unkickall", (payload, user) => {
            if (!user.host.Kick)
                return;
            state.bannedips = [];
            state.bannednames = [];
        });
        runtime.jsonCodeHandlers.set("options", (payload, user) => {
            if (!user.host.ChangeRoomSettings)
                return;
            room.hidePreview = payload.hidePreview;
            room.nolockunlock = payload.nolockunlock;
            room.nomultiselect = payload.nomultiselect;
            room.norectselect = payload.norectselect;
            room.nostack = payload.nostack;
            room.votekick = payload.votekick;
            room.jigchan = payload.jigchan;
            runtime.broadcaster.broadcast({
                type: "update",
                room: {
                    hidePreview: room.hidePreview,
                    nolockunlock: room.nolockunlock,
                    nomultiselect: room.nomultiselect,
                    norectselect: room.norectselect,
                    nostack: room.nostack,
                    votekick: room.votekick,
                    jigchan: room.jigchan
                }
            });
        });

        runtime.jsonCodeHandlers.set("cleanup_layout", (payload, user) => {
            if (!user.host.Cleanup) return;
            user.conn.send(JSON.stringify({
                type: "cleanup_layout",
                initialLayout: room.initialLayout
            }));
        });

        runtime.jsonCodeHandlers.set("cleanup_positions", (payload, user) => {
            if (!user.host.Cleanup || !Array.isArray(payload.groups)) return;
            const resolved: { group: Group, x: number, y: number }[] = [];
            const seen = new Set<number>();
            for (const item of payload.groups) {
                if (!item || !Number.isSafeInteger(item.id)
                    || !Number.isFinite(item.x) || !Number.isFinite(item.y))
                    return;
                const group = runtime.transformedgroups.get(item.id);
                if (!group || group.id !== item.id || seen.has(group.id)
                    || group.x >= 0xDEAD0000 || group.y >= 0xDEAD0000)
                    return;
                seen.add(group.id);
                let { w: width, h: height } = getGroupSize(group, room);
                if (group.rot === 1 || group.rot === 3)
                    [width, height] = [height, width];
                const x = width >= room.boardWidth
                    ? room.boardWidth / 2
                    : clamp(width / 2, item.x, room.boardWidth - width / 2);
                const y = height >= room.boardHeight
                    ? room.boardHeight / 2
                    : clamp(height / 2, item.y, room.boardHeight - height / 2);
                resolved.push({ group, x, y });
            }
            if (resolved.length === 0) return;
            const outbound = Buffer.allocUnsafe(3 + resolved.length * 10);
            outbound[0] = BinCommands.Drop;
            outbound.writeUInt16LE(0xffff, 1);
            resolved.forEach(({ group, x, y }, index) => {
                group.x = x;
                group.y = y;
                delete group.selected;
                delete group.dragged;
                const offset = 3 + index * 10;
                outbound.writeUInt16LE(group.id, offset);
                outbound.writeFloatLE(x, offset + 2);
                outbound.writeFloatLE(y, offset + 6);
            });
            runtime.lastMovedGroups.clear();
            runtime.broadcaster.broadcast(outbound);
        });

        runtime.jsonCodeHandlers.set("force_reveal_bags", (payload, user) => {
            if (!user.host.Cleanup)
                return;
            if (room.ext?.layouts && room.ext?.hiddenBags && room.ext.hiddenBags.length > 0) {
                const newlySpawnedGroups: Group[] = [];
                for (const item of room.ext.hiddenBags) {
                    newlySpawnedGroups.push(...spawnBag(room, runtime, item.setIndex, item.bag));
                }
                room.ext.hiddenBags = [];
                if (newlySpawnedGroups.length > 0) {
                    const buff = Buffer.allocUnsafe(3 + 10 * newlySpawnedGroups.length);
                    buff[0] = 3; // DROP
                    buff.writeInt16LE(-1, 1);
                    let ptr = 3;
                    for (const g of newlySpawnedGroups) {
                        buff.writeUint16LE(g.id, ptr);
                        buff.writeFloatLE(g.x, ptr + 2);
                        buff.writeFloatLE(g.y, ptr + 6);
                        ptr += 10;
                    }
                    runtime.broadcaster.broadcast(buff);
                }
            }
        });

        runtime.connectionFlow.on('finished', ({ conn, userpriv, user, ip, ishost }) => {
            if (runtime.slow && !runtime.slow.allowed.has(ip) && ishost.perms.size === 0) {
                send_system(userpriv, user, `Slow mode is enabled, you'll be able to interact in ${runtime.slow.baseTimeout} seconds`);
                userpriv.slowmode = true;
                userpriv.slowmodeTimer = setTimeout(() => {
                    if (!runtime.slow) // if it was disabled while the timeout was pending...
                        return;
                    runtime.slow.allowed.add(ip);
                    userpriv.slowmode = false;
                    send_system(userpriv, user, 'You may now proceed.');
                }, runtime.slow.baseTimeout * 1000);
            }
        });

        // preconditions to allow merge
        runtime.events.on('premerge', (userpriv: UserPrivate, a: Group, b: Group) => {
            if (a.rot === b.rot) return;
            forceRoomSync(roomstate, room, userpriv);
            throw new Error("Rotation mismatch");
        });

        if (room.ext?.sticky) {
            runtime.connectionFlow.on('finished', ({ conn, userpriv, user, ip, ishost }) => {
                const com = userpriv.commited;
                if (!com) return;
                const buff = Buffer.alloc(1 + 2 * com.size);
                buff[0] = BinCommands.SetCommitted;
                let ptr = 1;
                for (const c of com) {
                    buff.writeUint16LE(c.id, ptr);
                    ptr += 2;
                }
                conn.send(buff);
            })

            const preflightCommit = ({
                preventDefault,
                userpriv,
                groups
            }: {
                preventDefault: () => void;
                userpriv: UserPrivate;
                groups: Group[];
            }) => {
                const committed = userpriv.commited || new Set<Group>();
                const newGroups = new Set(groups.filter(group => !committed.has(group)));
                if (committed.size + newGroups.size > 2) {
                    forceRoomSync(state, room, userpriv);
                    preventDefault();
                }
            };
            runtime.events.on("premovebatch", preflightCommit);
            runtime.events.on("preselectbatch", preflightCommit);

            runtime.events.on('premove', ({ preventDefault, userpriv, a }: { preventDefault: () => void, userpriv: UserPrivate, a: Group }) => {
                let s = userpriv.commited;
                if (!s)
                    s = userpriv.commited = new Set();
                if (s.size < 2) {
                    if (!s.has(a)) {
                        clearOwnerOf(runtime, a);
                        sendCommit(runtime, userpriv, a.id);
                        s.add(a); // commit
                    }
                } else if (!s.has(a)) { // tried to move a piece despite being commited to another, could be a desync
                    forceRoomSync(state, room, userpriv);
                    preventDefault();
                }
            });

            runtime.events.on('premerge', (userpriv: UserPrivate, a: Group, b: Group) => {
                const s = userpriv.commited;
                if (!s || (!s.has(a) && !s.has(b))) { // if tried to merge without the committed piece, possible desync
                    forceRoomSync(roomstate, room, userpriv);
                    throw new Error("Commited mismatch");
                }
                clearOwnerOf(runtime, a);
                clearOwnerOf(runtime, b);
            });

            runtime.events.on('preselect', ({ preventDefault, userpriv, group: a }: { preventDefault: () => void, userpriv: UserPrivate, group: Group }) => {
                let s = userpriv.commited;
                if (!s)
                    s = userpriv.commited = new Set();
                if (s.size < 2) {
                    if (!s.has(a)) {
                        clearOwnerOf(runtime, a); // Fixed: added runtime
                        sendCommit(runtime, userpriv, a.id); // Fixed: added runtime
                        s.add(a); // commit
                    }
                } else if (!s.has(a)) { // tried to (de)select a piece despite being commited to another, could be a desync
                    forceRoomSync(state, room, userpriv);
                    return preventDefault();
                }
            });

            runtime.events.on('forceRelease', ({ preventDefault, group: a, user }: { preventDefault: () => void, group: Group, user: UserPrivate }) => {
                if (user.commited?.size)
                    return preventDefault();
                // send uncommit message to old owner
                clearOwnerOf(runtime, a);

                delete a.selected; // can only take something off someone's hand if not committed to a piece
                let committed = user.commited;
                if (!committed)
                    committed = user.commited = new Set();
                committed.add(a);
                sendCommit(runtime, user, a.id); // Fixed: added runtime

            })
        }

        runtime.events.on('joined', (userpriv: UserPrivate, a: Group, b: Group, r: number) => {
            runtime.lastMovedGroups.delete(a); // can also clear from connecting pieces
            runtime.lastMovedGroups.delete(b);

            if (room.ext?.rotting) {
                const b = Buffer.alloc(11);
                b[0] = 0x61;
                b.writeUInt16LE(a.id, 1);
                a.rotp = Date.now();
                b.writeDoubleLE(a.rotp, 3);
                runtime.broadcaster.broadcast(b);
            }

            let v;
            // eslint-disable-next-line no-cond-assign
            if (v = runtime.groupowners.get(a.id)) {
                delete v.co; // free the piece
            }
            runtime.groupowners.delete(r);

            if (room.ext?.censoredCount >= 1) { // censoring is enabled
                const poss = new Set(a.indices.map(i => neighboors(i, room.sets[0]!)).flat(99));
                a.indices.forEach(e => poss.delete(e));
                if (!room.groups.some(e => (e.x < 0xDEAD0000) && e.indices.some(e => poss.has(e)))) {
                    // Nothing neighboring the hidden pieces remains, so reveal them.
                    revealCensoredGroups(room, runtime);
                }
            }

            // if a frame is complete, add it to the frame list so that during cleanup, pieces inside a frame aren't moved
            if ((() => {
                const set = room.sets[a.set]!;
                // slight opt. the shortest way to connect 4 corners is to have 3 sides completed, 
                // so skip this check for groups that have less than 3 * min(cols, rows) 
                if (a.indices.length < 3 * Math.min(set.cols, set.rows))
                    return false;
                const rem = new Set([0, set.cols - 1, (set.rows - 1) * set.cols, (set.cols * set.rows) - 1]);
                for (const p of a.indices) {
                    rem.delete(p);
                    if (rem.size === 0)
                        return true;
                }
                return false;
            })()) {
                if (!roomstate.frameGroupIds)
                    roomstate.frameGroupIds = [];
                let idx: number;
                idx = roomstate.frameGroupIds.indexOf(r);
                if (idx >= 0) roomstate.frameGroupIds.splice(idx, 1);
                idx = roomstate.frameGroupIds.indexOf(a.id);
                if (idx >= 0) roomstate.frameGroupIds.splice(idx, 1);
                roomstate.frameGroupIds.push(a.id);
            }

            // Check custom layout bags
            revealResolvedBags(room, runtime);

            if (room.groups.length === room.sets.length) {
                room.endTime = Date.now();
                try {
                    computeFinalStats(runtime, roomstate);
                } catch (error) {
                    console.error("Failed to compute final stats", error);
                }
                runtime.broadcaster.broadcast({
                    type: "update",
                    room: { endTime: room.endTime }
                });
                runtime.events.emit("setEnd");
            }

        })
        revealResolvedBags(room, runtime);
    }
}

function revealResolvedBags(room: Room, runtime: RoomRuntimeState) {
    if (!room.ext?.layouts || !room.ext?.hiddenBags?.length) return;
    let spawnedAny = true;
    const newlySpawnedGroups: Group[] = [];
    while (spawnedAny) {
        spawnedAny = false;
        const remainingHiddenBags: { setIndex: number, bag: any }[] = [];
        for (const item of room.ext.hiddenBags) {
            if (isBagResolved(room, runtime, item.setIndex, item.bag.hiddenUntil)) {
                newlySpawnedGroups.push(...spawnBag(room, runtime, item.setIndex, item.bag));
                spawnedAny = true;
            } else {
                remainingHiddenBags.push(item);
            }
        }
        if (spawnedAny)
            room.ext.hiddenBags = remainingHiddenBags;
    }
    if (newlySpawnedGroups.length === 0) return;

    const buff = Buffer.allocUnsafe(3 + 10 * newlySpawnedGroups.length);
    buff[0] = BinCommands.Drop;
    buff.writeUInt16LE(0xffff, 1);
    newlySpawnedGroups.forEach((group, index) => {
        const offset = 3 + index * 10;
        buff.writeUInt16LE(group.id, offset);
        buff.writeFloatLE(group.x, offset + 2);
        buff.writeFloatLE(group.y, offset + 6);
    });
    runtime.broadcaster.broadcast(buff);
}

function isBagResolved(room: Room, runtime: RoomRuntimeState, setIndex: number, bagId: number): boolean {
    const layouts = room.ext?.layouts;
    const layout = layouts?.[setIndex];
    if (!layout) return false;
    const bag = layout.bags.find((b: any) => b.id === bagId);
    if (!bag) return false;

    let setOffset = 0;
    for (let i = 0; i < setIndex; i++) {
        const s = room.sets[i];
        const lay = layouts[i];
        const numPieces = lay?.voronoiConfig ? lay.voronoiConfig.total : (s.cols * s.rows);
        setOffset += numPieces;
    }

    if (bag.pieces.length === 0) return true;

    const firstGlobalId = bag.pieces[0] + setOffset;
    const firstGroup = runtime.transformedgroups.get(firstGlobalId);
    if (!firstGroup || firstGroup.x >= 0xDEAD0000 || firstGroup.y >= 0xDEAD0000) return false;

    for (let j = 1; j < bag.pieces.length; j++) {
        const globalId = bag.pieces[j] + setOffset;
        const g = runtime.transformedgroups.get(globalId);
        if (!g || g !== firstGroup) {
            return false;
        }
    }
    return true;
}

function spawnBag(room: Room, runtime: RoomRuntimeState, setIndex: number, bag: any): Group[] {
    const spawnedGroups: Group[] = [];
    for (const g of room.groups) {
        if (g.set === setIndex && g.indices.some(idx => bag.pieces.includes(idx))) {
            const target = room.ext?.hiddenTargets?.[g.id];
            if (Array.isArray(target) && target.length === 2) {
                let { w: width, h: height } = getGroupSize(g, room);
                if (g.rot === 1 || g.rot === 3)
                    [width, height] = [height, width];
                g.x = width >= room.boardWidth
                    ? room.boardWidth / 2
                    : clamp(width / 2, target[0], room.boardWidth - width / 2);
                g.y = height >= room.boardHeight
                    ? room.boardHeight / 2
                    : clamp(height / 2, target[1], room.boardHeight - height / 2);
                delete room.ext!.hiddenTargets[g.id];
                spawnedGroups.push(g);
            } else if (g.x >= 0xDEADC0DE && g.y >= 0xDEADC0DE) {
                // Legacy rooms encoded the target inside float32 coordinates.
                g.x -= 0xDEADC0DE;
                g.y -= 0xDEADC0DE;
                spawnedGroups.push(g);
            }
        }
    }
    return spawnedGroups;
}