import { deleteAsset } from "../AssetManager.js";
import { roomc } from "../db.js";
import { Room } from "../types.js";
import { fileSystem, IFileSystem } from "./io.js";
import { spawnSync } from "child_process";

export interface RoomCollection {
    deleteOne(filter: { roomid: string }): Promise<any>;
}

export async function deleteRoomMediaImpl(
    room: Room,
    fileSystem: IFileSystem,
    del: boolean | ((fn: string) => Promise<boolean>) = true,
    reason = ''
) {
    if (del)
        for (const set of room.sets) {
            try {
                if ((typeof del == "function" && await del(set.image)) || del) {
                    if (reason) {
                        console.log(`deleting ${set.image} because of ${reason}`);
                    }
                    try {
                        if (await fileSystem.exists(`./assets/${set.image}`)) {
                            await fileSystem.unlink(`./assets/${set.image}`);
                        }
                    } catch { }
                    await deleteAsset(set.image);
                }
            } catch {//
            }
        }
    if (room.thumbnail) {
        try {
            if (reason) {
                console.log(`deleting ${room.thumbnail} because of ${reason}`);
            }
            try {
                if (await fileSystem.exists(`./assets/${room.thumbnail}`)) {
                    await fileSystem.unlink(`./assets/${room.thumbnail}`);
                }
            } catch { }
            await deleteAsset(room.thumbnail);
        } catch { /**/ }
    }
}

export async function deleteRoomMedia(room: Room, del: boolean | ((fn: string) => Promise<boolean>) = true, reason = '') {
    return deleteRoomMediaImpl(room, fileSystem, del, reason);
}

export async function trashupRoomImpl(
    room: Room,
    rid: string,
    roomCollection: RoomCollection,
    fileSystem: IFileSystem,
    del: boolean | ((fn: string) => Promise<boolean>) = true,
    reason = ''
) {
    await deleteRoomMediaImpl(room, fileSystem, del, reason);
    await roomCollection.deleteOne({ roomid: rid });

    if (process.env['CF_ZONE']) {
        const files = room.sets.map(e => `https://${process.env['DOMAIN'] || 'jiggie.fun'}/assets/pictures/${e.image}`);
        // server runs on node16 so no fetch, too lazy to import a library so i'll just spawn curl
        spawnSync("curl", [
            '-X', 'POST',
            `https://api.cloudflare.com/client/v4/zones/${process.env['CF_ZONE']}/purge_cache`,
            '-H', `X-Auth-Email: ${process.env['CF_EMAIL']}`,
            '-H', `Authorization: Bearer ${process.env['CF_AUTHKEY']}`,
            '-H', 'Content-Type: application/json"',
            '--data', JSON.stringify({ files })
        ]);
    }
}
export async function trashupRoom(room: Room, rid: string, del: boolean | ((fn: string) => Promise<boolean>) = true, reason = '') {
    return trashupRoomImpl(room, rid, roomc, fileSystem, del, reason);
}
