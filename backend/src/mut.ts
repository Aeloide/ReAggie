import * as mongo from "mongodb";
import { EventEmitter } from "events";
import { deserialize } from "bson";

import type { Group, Room, RoomState, RoomRuntimeState, UserPrivate } from "./types.js";

import { AdminModule } from "./commands/AdminModule.js";
import { VoteKickModule } from "./commands/VoteKickModule.js";
import { PlaylistModule } from "./commands/PlaylistModule.js";
import { ChatModule } from "./commands/index.js";
import { RollbackModule } from "./commands/RollbackModule.js";
import { ScoreModule } from "./commands/ScoreModule.js";
import { DVDModule } from "./commands/DVDModule.js";
import { ReplayModule } from "./commands/ReplayModule.js";
import { PollModule } from "./commands/PollModule.js";
import { JigChanModule } from "./commands/JigChanModule.js";
import { ImpactTextModule } from "./commands/ImpactTextModule.js";
import { ScratchCardModule } from "./commands/ScratchCardModule.js";
import { LargeBugModule } from "./commands/LargeBugModule.js";
import { NotesModule } from "./commands/NotesModule.js";

import { buildBinaryRepr, findInList } from "./utils.js";
import { RoomBroadcaster } from "./core/room-broadcaster.js";
import { Jukebox } from "./Jukebox.js";
import { getStatsMessage, ipc } from "./room.js";
import { badgoys, roomc } from "./db.js";
import { trashupRoom } from "./core/cleanup-service.js";
import { AFDVDModule } from "./commands/AFDVDModule.js";
import { FunnyHahaModule } from "./commands/FunnyHahaModule.js";
import { Chat } from "./core/protocols/Chat.js";
import { Game } from "./core/protocols/Game.js";
import { Social } from "./core/protocols/Social.js";
import { WSRpc } from "./core/protocols/WSRpc.js";
import { pruneuser } from "./room-utils.js";
import connectionFlow from "./connectionFlow.js";
import { Implementations, ParserTypes } from "./core/protocols/index.js";
// more like prepareArchiveRoom
export const destroyState = (state: RoomRuntimeState) => {
    clearTimeout(state.archive);
    clearInterval(state.save);
    for (let v of state.usersPriv.values()) {
        if (v.interid) clearInterval(v.interid);
        delete v.interid;
    }
};

export const deserializeBinaryRepr = (b: any) => {
    const ee = deserialize(b.buffer);
    return ee.value.map((e: any) => {
        return {
            id: e[0],
            ids: e[1],
            indices: e[2],
            locked: e[3],
            rot: e[4],
            set: e[5],
            x: e[6],
            y: e[7],
        } as Group;
    });
};

const fromStatus = (byte: number) => {
    return {
        rot: (byte >> 3) & 3,
        set: (byte >> 1) & 3,
        locked: (byte & 1) == 1
    };
};

const fromStatusD = (byte: number) => {
    return {
        rot: (byte >> 6) & 3,
        set: (byte >> 1) & 0x1f,
        locked: (byte & 1) == 1
    };
};

const fromStatusE = (word: number) => {
    return {
        rot: word & 3,
        locked: ((word >> 2) & 1) == 1,
        set: (word >> 8) & 0xff,
        f: (word >> 3) & 1
    };
};

export const deserializeCBinaryRepr = (b: any) => {
    const ee = Buffer.from(b.buffer);
    let ptr = 0;
    const ret = [];
    const n = ee.readUInt16LE(ptr);
    ptr += 2;
    for (let i = 0; i < n; ++i) {
        const id = ee.readInt16LE(ptr); ptr += 2;
        const { rot, set, locked } = fromStatus(ee.readUInt8(ptr)); ptr += 1;
        const x = ee.readFloatLE(ptr); ptr += 4;
        const y = ee.readFloatLE(ptr); ptr += 4;
        const idsl = ee.readInt16LE(ptr); ptr += 2;
        const indl = ee.readInt16LE(ptr); ptr += 2;
        const ids: number[] = [];
        for (let j = 0; j < idsl; ++j) {
            ids.push(ee.readUint16LE(ptr));
            ptr += 2;
        }
        const indices: number[] = [];
        for (let j = 0; j < indl; ++j) {
            indices.push(ee.readUint16LE(ptr));
            ptr += 2;
        }

        ret.push({
            id,
            ids,
            indices,
            locked,
            rot,
            set,
            x,
            y,
        } as Group);
    }

    return ret;
};

export const deserializeDBinaryRepr = (b: any, rotting: boolean) => {
    const ee = Buffer.from(b.buffer);
    let ptr = 0;
    const ret = [];
    const n = ee.readUInt16LE(ptr);
    ptr += 2;
    for (let i = 0; i < n; ++i) {
        const id = ee.readInt16LE(ptr); ptr += 2;
        const { rot, set, locked } = fromStatusD(ee.readUInt8(ptr)); ptr += 1;
        const x = ee.readFloatLE(ptr); ptr += 4;
        const y = ee.readFloatLE(ptr); ptr += 4;
        const idsl = ee.readInt16LE(ptr); ptr += 2;
        const indl = ee.readInt16LE(ptr); ptr += 2;
        let rotp: number | undefined;
        if (rotting) {
            const v = ee.readDoubleLE(ptr); ptr += 8;
            if (!Number.isNaN(v))
                rotp = v;
        }
        const ids: number[] = [];
        for (let j = 0; j < idsl; ++j) {
            ids.push(ee.readUint16LE(ptr));
            ptr += 2;
        }
        const indices: number[] = [];
        for (let j = 0; j < indl; ++j) {
            indices.push(ee.readUint16LE(ptr));
            ptr += 2;
        }

        ret.push({
            id,
            ids,
            indices,
            locked,
            rot,
            set,
            x,
            y,
            rotp
        } as Group);
    }

    return ret;
};

export const deserializeEBinaryRepr = (b: mongo.Binary, rotting: boolean) => {
    const ee = Buffer.from(b.buffer);
    let ptr = 0;
    const ret = [];
    const n = ee.readUInt16LE(ptr);
    ptr += 2;
    for (let i = 0; i < n; ++i) {
        const id = ee.readUint16LE(ptr); ptr += 2;
        const { rot, set, locked, f } = fromStatusE(ee.readUInt16LE(ptr)); ptr += 2;
        const x = ee.readFloatLE(ptr); ptr += 4;
        const y = ee.readFloatLE(ptr); ptr += 4;
        const idsl = ee.readUint16LE(ptr); ptr += 2;
        const indl = ee.readUint16LE(ptr); ptr += 2;
        let rotp: number | undefined;
        if (rotting) {
            const v = ee.readDoubleLE(ptr); ptr += 8;
            if (!Number.isNaN(v))
                rotp = v;
        }
        const ids: number[] = [];
        for (let j = 0; j < idsl; ++j) {
            ids.push(ee.readUint16LE(ptr));
            ptr += 2;
        }
        const indices: number[] = [];
        for (let j = 0; j < indl; ++j) {
            indices.push(ee.readUint16LE(ptr));
            ptr += 2;
        }

        ret.push({
            id,
            ids,
            indices,
            locked,
            rot,
            set,
            x,
            y,
            rotp,
            f: f === 1
        } as Group);
    }
    return ret;
};

export const loadRoom = async (rid: string) => {
    const r = await roomc.findOne({ roomid: rid });
    if (!r) {
        throw new Error("No such room in child " + rid);
    }
    console.log("loading room");
    let room = r.room;

    const modules: ChatModule[] = [
        new AdminModule(),
        new VoteKickModule(),
        new RollbackModule(),
        new ReplayModule()
    ];

    if (room.ext?.bstate) {
        room.groups = deserializeBinaryRepr(room.groups);
    }

    if (room.ext?.cstate) {
        room.groups = deserializeCBinaryRepr(room.groups);
    }

    if (room.ext?.dstate) {
        room.groups = deserializeDBinaryRepr(room.groups, room.ext.rotting);
    }

    if (room.ext?.estate) {
        room.groups = deserializeEBinaryRepr(room.groups as any, room.ext.rotting);
        if (room.initialLayout) {
            room.initialLayout = deserializeEBinaryRepr(room.initialLayout as any, room.ext.rotting);
        }
    }

    let j: Jukebox | undefined;

    if (room.juke) {
        j = new Jukebox();
        const pl = new PlaylistModule();
        modules.push(pl);
        const d = new Date();
        if ((d.getMonth() === 3 && d.getDate() === 1) && room.key === "") {
            modules.push(new AFDVDModule(pl));
        } else {
            modules.push(new DVDModule(pl));
        }
        modules.push(new JigChanModule);
        modules.push(new LargeBugModule);
        modules.push(new ImpactTextModule);
        modules.push(new ScratchCardModule);
        modules.push(new FunnyHahaModule);
    }

    if (room.scores) {
        modules.push(new ScoreModule());
    }

    modules.push(new PollModule);
    modules.push(new NotesModule);

    const roomevents = new EventEmitter;
    let roomstate: RoomState;
    let runtime: RoomRuntimeState;


    const setupAutodestruct = () => {
        return setTimeout(() => {
            void (async () => {
                // no interaction for a minute, kill off this process
                destroyState(runtime); // not really required anymore
                if (room.ext?.selfdestruct) {
                    await trashupRoom(room, rid, async fn => {
                        if (fn.includes('-')) // - means it's not referenced by a persistant room
                            return true;
                        // find a persistant room that references this image
                        const r = await roomc.findOne({
                            'room.ext.selfdestruct': false,
                            'room.sets.image': fn
                        });

                        return !r; // true if the room exist
                    }, 'self destruct');
                }
                [...runtime.usersPriv.values()].forEach(v => {
                    // force all connected clients to refresh the page, which will lead to a 404
                    v.conn.send(JSON.stringify({ type: "noroom" }));
                });
                process.exit(0);
            })().catch(error => {
                console.error("Failed to archive room", error);
                process.exit(1);
            });
        }, 60 * 1000);
    };

    let arch = setupAutodestruct();

    let saveInFlight = false;
    let saveQueued = false;
    const persistRoom = async () => {
        if (saveInFlight) {
            saveQueued = true;
            return;
        }
        saveInFlight = true;
        try {
            do {
                saveQueued = false;
                await saveRoom(rid, roomstate, runtime, room);
            } while (saveQueued);
        } catch (error) {
            console.error("Failed to save room", error);
        } finally {
            saveInFlight = false;
        }
    };
    let save = setInterval(persistRoom, 10 * 1000);

    roomstate = {
        chatlog: [], // allows chatlog to be overwritten
        bannednames: [],
        hist: {},
        ...r.state,
    };

    const evalHardBans = async (p: UserPrivate) => {
        if (!runtime.adminmodule.synced)
            return false;
        const ref: any = await findInList(badgoys, p.ipaddr);
        if (ref) {
            pruneuser(roomstate, runtime, room, p, () => {
                p.conn.close(1001, ref.reason);
            });
            return true;
        }
        return false;
    };

    runtime = {
        adminmodule: modules.find(e => e.name === 'admin')! as AdminModule,
        groupowners: new Map(),
        groupownersbyip: new Map(),
        ipJoinLimit: {},
        nameJoinLimit: {},
        lastMovedGroups: new Map(),
        jsonCodeHandlers: new Map(),
        usersPriv: new Map(),
        archive: arch,
        save,
        modules,
        events: roomevents,
        users: [],
        broadcaster: undefined as any,
        binCodeHandlers: new Map,
        transformedgroups: new Map,
        processes: new Map,
        juke: j,
        trustees: new Map(),
        connectionFlow,
        setAutodestruct: (enabled: boolean) => {
            if (enabled) {
                if (!runtime.archive) {
                    runtime.archive = setupAutodestruct();
                }
            } else {
                if (runtime.archive) {
                    clearTimeout(runtime.archive);
                    runtime.archive = undefined;
                }
            }
        },

        reEvalHardbans: () => {
            for (const p of runtime.usersPriv.values())
                evalHardBans(p); // async unawaited
        }
    };

    const transformedgroups = runtime.transformedgroups;
    roomstate.frameGroupIds = [];
    for (const g of room.groups) {
        transformedgroups.set(g.id, g);
        for (const c of g.ids) {
            transformedgroups.set(c, g);
        }

        const set = room.sets[g.set]!;
        if (g.indices.length < 3 * Math.min(set.cols, set.rows))
            continue;
        let rem = new Set([0, set.cols - 1, (set.rows - 1) * set.cols, (set.cols * set.rows) - 1]);
        for (let p of g.indices) {
            rem.delete(p);
            if (rem.size == 0) {
                roomstate.frameGroupIds.push(g.id);
                break;
            }
        }
    }

    runtime.broadcaster = new RoomBroadcaster(roomstate, runtime); // assuming RoomBroadcaster updated

    modules.forEach(m => {
        m.deserialize(r.state.modstate?.[m.name]);
        m.attach({ room, state: roomstate, runtime });
    });
    const protocolModules = [
        new Chat(),
        new Game(),
        new Social(),
        new WSRpc()
    ];
    const obj = { runtime, state: roomstate, room };
    protocolModules.forEach(m => {
        m.attach(obj);
    });

    for (const [k, v] of Implementations) {
        runtime.binCodeHandlers.set(Number(k), v);
    }

    return [roomstate, runtime, room] as [RoomState, RoomRuntimeState, Room];
};

type Object = {
    [k in string]: Object
};

export const saveRoom = async (rid: string,
    state: RoomState,
    runtime: RoomRuntimeState,
    roomToSave: Room) => {
    const modstate = runtime.modules ? Object.fromEntries(runtime.modules.map(m => [m.name, m.serialize()] as [string, any])) : {};
    const nstate = {
        ...state,
        modstate,
    };

    const room = structuredClone(roomToSave); // create a deep clone;
    // Active users are process-local, so don't persist their interaction state.
    const withoutInteractionState = (g: Group) => ({
        ...g,
        selected: undefined,
        dragged: undefined,
        dragStartX: undefined,
        dragStartY: undefined
    });
    room.groups = buildBinaryRepr(roomToSave.groups.map(withoutInteractionState), room.ext?.rotting) as any;
    if (roomToSave.initialLayout)
        room.initialLayout = buildBinaryRepr(roomToSave.initialLayout.map(withoutInteractionState), room.ext?.rotting) as any;
    room.ext ??= {};
    room.ext.bstate = false;
    room.ext.cstate = false;
    room.ext.dstate = false;
    room.ext.estate = true;
    try {
        const up = await roomc.updateOne({ roomid: rid }, {
            $set: {
                room,
                state: nstate as any
            }
        });

        // give stats to master
        ipc?.[0].write(JSON.stringify(getStatsMessage()));

    } catch (e) {
        console.error(e);
    }
};
