// utils that should only be relevant to a room process
import { BinCommands, type Group, type Room, type RoomState, type RoomRuntimeState, type User, type UserPrivate } from "./types.js";
import { WebSocket } from "ws";
import { infologsc } from "./db.js";
import { runtime } from "./room.js";

export const send_system = (up: UserPrivate, u: User, message: string) => {
    up.conn.send(JSON.stringify({
        type: "chat",
        message,
        name: 'System',
        color: u.color,
        id: u.id
    }));
};

export const pruneuser = (
    r: RoomState,
    runtime: RoomRuntimeState,
    ar: Room,
    u: UserPrivate,
    cb: (conn: WebSocket) => void) => {
    if (u.interid)
        clearInterval(u.interid);
    delete u.interid;
    const ent = [...runtime.usersPriv.entries()].find(e => e[1] == u);
    if (!ent) return;
    const nid = ent[0];
    try {
        cb(ent[1].conn);
    } catch (error) {
        console.error("Error while disconnecting user", error);
    }
    runtime.usersPriv.delete(nid);

    const selected: Group[] = [];
    const dragged: Group[] = [];
    for (const group of ar.groups) {
        const wasSelected = group.selected === nid;
        const wasDragged = group.dragged === nid;
        if (wasSelected) {
            delete group.selected;
            selected.push(group);
        }
        if (wasDragged) {
            delete group.dragged;
            delete group.dragStartX;
            delete group.dragStartY;
            dragged.push(group);
        }
    }

    if (dragged.length) {
        const cmd = Buffer.allocUnsafe(3 + dragged.length * 10);
        cmd[0] = BinCommands.Drop;
        cmd.writeUInt16LE(nid, 1);
        dragged.forEach((group, i) => {
            const offset = 3 + i * 10;
            cmd.writeUInt16LE(group.id, offset);
            cmd.writeFloatLE(group.x, offset + 2);
            cmd.writeFloatLE(group.y, offset + 6);
        });
        runtime.broadcaster.broadcast(cmd);
    }

    if (selected.length) {
        const cmd = Buffer.allocUnsafe(3 + selected.length * 2);
        cmd[0] = BinCommands.Deselect;
        cmd.writeUInt16LE(nid, 1);
        selected.forEach((group, i) => cmd.writeUInt16LE(group.id, 3 + i * 2));
        runtime.broadcaster.broadcast(cmd);
    }

    let idx = runtime.users.findIndex(e => e.id == nid);
    if (idx >= 0) {
        runtime.users.splice(idx, 1);
        runtime.broadcaster.broadcastRoomUsers();
    }
    u.pruned = true;
};

export const banuser = (r: RoomState,
    runtime: RoomRuntimeState,
    ar: Room,
    u: UserPrivate,
    reason: string,
    cb: (conn: WebSocket) => void) => {

    if (!r.bannedips.includes(u.ipaddr))
        r.bannedips.push(u.ipaddr);
    for (let p of runtime.usersPriv.values()) {
        if (p.ipaddr == u.ipaddr) {
            runtime.broadcaster.broadcast({
                type: "chat",
                message: `${p.name} was banned.`,
                name: 'System',
                color: '#FFFFFF',
                id: -1
            });
            console.log(`${p.ipaddr} (${p.name}) was banned.`);
            void Promise.resolve(infologsc.insertOne({
                time: new Date(),
                room: process.argv[2],
                data: p.name,
                meta: p.ipaddr,
                origin: 'closed from propagated ban'
            })).catch(error => console.error("Failed to log propagated ban", error));
            if (p.conn.readyState === undefined || p.conn.readyState === WebSocket.OPEN)
                p.conn.close(4001, "Banned");
        }
    }
    pruneuser(r, runtime, ar, u, cb); //prune is already set to run on websocket close/error?

    if (!r.bannednames)
        r.bannednames = [];

    for (let p of runtime.users) {
        if (runtime.usersPriv.get(p.id)?.ipaddr == u.ipaddr) {
            if (!r.bannednames.includes(p.name))
                r.bannednames.push(p.name);
        }
    }

    if (!r.bannedreason)
        r.bannedreason = [];
    r.bannedreason.push(reason);
};

export * from './utils.js';

export const forceRoomSync = (r: RoomState,
    ar: Room,
    u: UserPrivate) => {
    const now = Date.now();
    if (u.lastRoomSync && now - u.lastRoomSync < 1000) {
        clearTimeout(u.roomSyncTimer);
        u.roomSyncTimer = setTimeout(() => {
            delete u.roomSyncTimer;
            if (!u.pruned)
                forceRoomSync(r, ar, u);
        }, 1000 - (now - u.lastRoomSync));
        return;
    }
    u.lastRoomSync = now;
    if (u.conn.readyState === undefined || u.conn.readyState === WebSocket.OPEN)
        u.conn.send(JSON.stringify({ type: "room", room: ar }));
};

export const fixUserName = (name: string | undefined, thisroom: Room) => {
    if (thisroom.anon) {
        return `Anon#${~~(Math.random() * 10000)}`;
    }

    return name?.slice(0, 21) ?? 'Anonymous';
};

export const syncHostName = (name: string, thisroom: Room, roomstate: RoomState) => {
    if (thisroom.anon) {
        return;
    }

    const multipleHosts = [...runtime.usersPriv.values()].filter(u => (u.host.Delegate && !u.host.Admin)).length > 1;
    if (multipleHosts && roomstate.hostName) {
        return;
    }

    roomstate.hostName = name;
};