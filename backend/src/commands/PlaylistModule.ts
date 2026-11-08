import { readFile } from "fs/promises";
import dotenv from "dotenv";

import type { RoomState, User, UserPrivate, Room } from "../types.js";
import { spawn } from "child_process";
import { nonRetardedAsyncExists, shuffleArray, sendAlert } from "../utils.js";
import { send_system } from "../room-utils.js";
import { ensureAsset, saveAsset, ensureBackup } from "../AssetManager.js";
import { ChatModule, Command, CommandRoomStateUserArg, CommandRoomStateArg } from "./index.js";
import { spawnPromise } from "../utils.js";
import { RoomBroadcaster } from "../core/room-broadcaster.js";
import { TextProgress } from "./Process.js";
import type { Jukebox } from "../Jukebox.js";
dotenv.config({ override: true });
// when a song is finished or skipped, it's pushed back at the end of the list

// TODO: round robin across multiple instances
const cookiepath = process.env.COOKIES;
const additional_yt_args = (process.env.YT_DLP_ARGS || '').split(' ');
const dom = 'invidious.nerdvpn.de';

const spawnPromiseWithReason = (cmd: string, args: string[]) =>
    new Promise<Buffer>((res, rej) => {
        const proc = spawn(cmd, args, { stdio: 'pipe' });
        const cumul: Buffer[] = [];
        const err: Buffer[] = [];
        proc.stdout.on("data", d => cumul.push(d));
        proc.stderr.on("data", d => err.push(d));
        proc.on("exit", (code) => {
            if (code === 0)
                res(Buffer.concat(cumul as any));
            else
                rej(Buffer.concat(err as any).toString());
        });
        proc.on("error", () => {
            rej("Failed to spawn process");
        });
    });

const invidiousFetch = async (format: string, id: string, output: string) => {
    let args: string[] = ['-vvv', ...additional_yt_args]; // apparently, yt-dlp crashes if it tries to write to stdout when it's captured by spawn... don't ask me
    if (cookiepath)
        args.push('--cookies', cookiepath);
    else if (await nonRetardedAsyncExists('./cookies.txt')) {
        args.push('--cookies', './cookies.txt');
    }
    const rargs = [...args, "-f", format, `https://youtube.com/watch?v=${id}`, '--no-mtime', '-o', output];

    const res = await spawnPromiseWithReason("sh", ['-c', ['yt-dlp', ...args, "-f", format, `https://youtube.com/watch?v=${id}`, '--no-mtime', '-o', output].join(' ')]);

    console.log(res, ...rargs);

    return await nonRetardedAsyncExists(output);
};

const clearIfOutdated = async (id: string) => {
    return false;
}

const invidiousInfo = async (id: string) => {
    const filename = id + ".info.json";
    const m4a = id + ".m4a";
    const webm = id + ".webm";
    if (await ensureAsset(filename, true)) {
        let entries: ({ ext: 'm4a', format_id: "140" } | { ext: 'webm', format_id: "251" })[] = [];
        // check if the music was properly downloaded, if it wasn't, it means there's something wrong with the metadata, so force a refetch.
        if (await ensureAsset(m4a, true)) entries.push({ ext: 'm4a', format_id: "140" });
        if (await ensureAsset(webm, true)) entries.push({ ext: 'webm', format_id: "251" });
        if (entries.length !== 0) {
            const obj = JSON.parse((await readFile('./assets/' + filename)).toString());
            return { ...obj, formats: entries.concat(obj.formats) };
        }
    }
    let args: string[] = additional_yt_args;
    if (cookiepath)
        args.push('--cookies', cookiepath);
    else if (await nonRetardedAsyncExists('./cookies.txt')) {
        args.push('--cookies', './cookies.txt');
    }
    const buff = await spawnPromise('yt-dlp', [...args, '-j', `https://youtube.com/watch?v=${id}`]);
    let res;
    try {
        res = JSON.parse(buff.toString());
    } catch (e) {
        console.log(e, buff.toString());
        return;
    }
    await saveAsset(filename, buff);

    // // todo: use multiple fallbacks in case of 404 or down, maybe use redirect.invidious.io in a first step
    // const res = await axios.get(`https://${dom}/api/v1/videos/${id}`);

    // /* invidious info -> yt-dlp */
    // res.data.categories ||= [res.data.genre]; // no mandalf for you
    // // partial convert back to yt-dlp format, just what's required
    // res.data.id = res.data.videoId;
    // res.data.formats = res.data.adaptiveFormats.map((e: any) => ({
    //     format_id: e.itag,
    //     ext: e.container
    // }));
    // res.data.duration_string = `${~~(res.data.lengthSeconds / 60)}:${res.data.lengthSeconds % 60}`
    // return res.data;
    // /* end */

    return res;
};

export interface PlaylistEntry {
    title: string;
    channel: string;
    id: string;
    skip: boolean;
    playcount: number; // songs are considered played only if they reached the end
    ext?: string;
}

export class PlaylistModule extends ChatModule {

    room?: Room;
    juke?: Jukebox;

    override attach({ room, state, runtime }: CommandRoomStateArg): void {
        this.room = room;
        this.juke = runtime.juke;

        if (this.pidx !== -1) {
            this.pidx = -1;
            setTimeout(() => {
                //console.log('STARTING FROM', Date.now() - this.timeStarted);
                this.reevaluatePlaylist(runtime.broadcaster, true, Date.now() - this.timeStarted);
            }, 1000);
        }

        runtime.events.on("joined", (u: UserPrivate, rs: RoomState) => {
            this.qtys[u.ipaddr] = (this.qtys[u.ipaddr] || 0) + 1;
            this.send_points(u);
        });

        runtime.events.on("connected", (u: UserPrivate, rs: RoomState) => {
            this.send_points(u);
        });

        if (this.juke) {
            this.juke.ee.on("playfinished", () => {
                // incrementing after playing was finished allows to restart
                // songs that were interrupted by pljam
                // it's important to increment it before picking the next song, else it will always be played twice
                this.playlist[this.pidx].playcount++;
                this.pidx = this.nextTrackNumber();
                this.reevaluatePlaylist(runtime.broadcaster, true);
            });
        }
        if (!room.ext)
            room.ext = {};
        room.ext.minPrice = this.currentPrice;
        room.ext.playlist = this.playlist;

        this.mustBeMusic = !!room.jukemusic;
    }

    name = "playlist";

    currentPrice = 5;

    mustBeMusic = false;

    qtys: Record<string, number> = {};

    pendingorders = new Set<string>();

    playlist: PlaylistEntry[] = [];

    pidx = -1; // currently playing song index, -1 if none

    timeStarted = 0;
    reevaluatePlaylist(broadcaster: RoomBroadcaster, jam: boolean, from: number = 0) {
        if (!this.juke || !this.room) return;

        if (this.pidx == -1) {
            if (this.playlist.length == 0 || this.playlist.every(e => e.skip)) {
                broadcaster.broadcast({
                    type: "playlist",
                    stop: true
                });
                return;
            }
            this.pidx = 0;
            jam = true; // interrupt the silence
        }

        // if jam is true, immediately play the file pointed by pidx
        // happens when pljam or a file reached its end
        if (jam) {
            const filename = './assets/' + this.playlist[this.pidx].id + "." + (this.playlist[this.pidx].ext || "webm");
            this.juke.playFile(filename, from / 1000);
            const r = this.room;
            if (!r.ext)
                r.ext = {};
            r.ext.currentlyPlaying = this.playlist[this.pidx].id;
            this.timeStarted = Date.now() - from;
            this.room.ext!.timeStarted = this.timeStarted;
            broadcaster.broadcast({
                type: "playlist",
                currentlyPlaying: this.playlist[this.pidx].id,
                // File extension has to be included here because this message is sent before *before* the new playlist (with file extensions).
                ext: this.playlist[this.pidx].ext,
                timeStarted: this.timeStarted,
                reschedule: true,
            });
        }
    }

    // Index of the next track to play. Loops unless the jig is done and skips
    // marked tracks. Returns -1 if every song is skipped.
    backlog: typeof this.playlist = [];
    private nextTrackNumber(): number {
        /*
            Algorithm:
            1 - If a song was never played before, pick it.
            2 - If the backlog isn't empty, return the index of the first song, and pop it
            3 - else if the puzzle is ongoing, fill the backlog with songs in a random order, else return -1
        */

        if (this.playlist.every(e => e.skip))
            return -1;
        //1
        let next = this.playlist.findIndex(e => e.playcount == 0 && !e.skip);
        if (next !== -1)
            return next;

        // 2
        if (this.backlog.length > 0) {
            let bl = this.backlog.findIndex(b => !b.skip);
            if (bl >= 0) {
                const ret = this.backlog.splice(bl, 1)[0]!;
                return this.playlist.indexOf(ret);
            }
        }

        // 3
        // shallow clone, the elements still refer to the original objects, allowing indexOf above to work
        this.backlog = [...this.playlist];
        // maybe sort the array so the least played songs come up first?
        shuffleArray(this.backlog);
        if (this.backlog[0] == this.playlist[this.pidx]) {
            // if by chance, the first song in the new backlog
            // was just played, push it back to the middle
            const n = this.backlog.shift()!;
            this.backlog.splice(~~(this.backlog.length / 2), 0, n);
        }

        // this causes an infinite loop if all the songs are set to skipped
        // but this is addressed in skipSong, which doesn't allow all songs to be skipped
        return this.nextTrackNumber();
    }

    public send_points(up: UserPrivate) {
        up.conn.send(JSON.stringify({
            type: "points",
            qty: this.qtys[up.ipaddr] || 0
        }));
    }

    private send_system_done(up: UserPrivate, u: User, message: string) {
        this.send_points(up);
        send_system(up, u, message);
    }

    resyncPl(broadcaster: RoomBroadcaster) {
        if (this.pidx >= 0) {
            broadcaster.broadcast({
                type: "playlist",
                minPrice: this.currentPrice,
                currentlyPlaying: this.playlist[this.pidx].id,
                timeStarted: this.timeStarted,
                playlist: this.playlist
            });
        } else {
            broadcaster.broadcast({
                type: "playlist",
                minPrice: this.currentPrice,
                stop: true,
                playlist: this.playlist
            });

        }
    }

    /**
     * Helper for testing or local playback
     * @param filename Filename without path (e.g. "song.mp3"), assumed to be in assets/
     * @param broadcaster RoomBroadcaster instance
     */
    addLocalFile(filename: string, broadcaster: RoomBroadcaster) {
        const parts = filename.split('.');
        if (parts.length < 2) return; // invalid
        const ext = parts.pop() || '';
        const id = parts.join('.');

        const entry: PlaylistEntry = {
            title: filename,
            channel: 'local',
            id: id,
            ext: ext,
            skip: false,
            playcount: 0
        };
        this.addEntry(entry, false, 0, '127.0.0.1', broadcaster);
    }

    addEntry(entry: PlaylistEntry, jam: boolean, offer: number, userIp: string, broadcaster: RoomBroadcaster) {
        if (!jam) {
            // if the currently playing song has already been played once.
            // behave as if the new song was jammed.
            if (this.pidx > -1) {
                const currentsong = this.playlist[this.pidx];
                jam = (currentsong.playcount > 0);
            }
        }
        if (!jam) {
            this.playlist.push(entry);
        } else {
            // insert right after the current song, skipping it
            if (this.pidx >= 0) // increase the play count for the skipped song, so it doesn't play again after the jammed song plays
                this.playlist[this.pidx].playcount += 1;
            this.pidx++;
            this.playlist.splice(this.pidx, 0, entry);
        }
        this.reevaluatePlaylist(broadcaster, jam);
        if (this.qtys[userIp] !== undefined)
            this.qtys[userIp] -= offer;

        this.currentPrice = jam ? (~~(offer / 2) + 1) : offer;
        if (this.room) {
            if (!this.room.ext)
                this.room.ext = {};
            this.room.ext.minPrice = this.currentPrice;
            this.room.ext.playlist = this.playlist;
        }
        this.resyncPl(broadcaster);
    }

    addToPlaylist(jam: boolean, stateargs: CommandRoomStateUserArg, ...args: string[]) {
        const { room, userp, user, state, runtime } = stateargs;
        if (room.groups.length == room.sets.length) {
            this.send_system_done(userp, user, `The puzzle is finished, so no submission allowed anymore.\n`);
            return true;
        }

        if (this.pendingorders.has(userp.ipaddr)) {
            this.send_system_done(userp, user, `You already have an order currently processing.\n`);
            return true;
        }
        let offer = +args[0];
        offer = ~~offer; // round down, handles NaN
        const url = args[1];
        let minimum = jam ? this.currentPrice * 2 : this.currentPrice + 1;

        if (offer < minimum) {
            this.send_system_done(userp, user, `Minimum offer${jam ? " for jamming" : ""} is ${minimum} points.\n`);
            return true;
        }

        const heldPoints = this.qtys[userp.ipaddr] || 0;
        if (offer > heldPoints) {
            this.send_system_done(userp, user, `Connect more pieces first! ${offer > minimum ? `You don't have ${offer} points.` : `You need ${minimum - heldPoints} more points.`} (You have ${heldPoints}/${minimum})\n`);
            return true;
        }

        let yt: URL;
        try {
            yt = new URL(url);
            if (!["youtube.com", "www.youtube.com", "youtu.be"].includes(yt.host)) {
                this.send_system_done(userp, user, `Needs to be a youtube video\n`);
                return true;
            }
        } catch {
            this.send_system_done(userp, user, `Bad URL\n`);
            return true;
        }

        let id = yt.searchParams.get("v");
        if (!id) {
            if (yt.host != "youtu.be") {
                this.send_system_done(userp, user, `Couldn't parse the video ID\n`);
                return true;
            }
            id = yt.pathname.slice(1);
        }

        // if (this.playlist.some(p => p.id == id)) {
        //     this.send_system_done(userp, user, `This is already in the playlist\n`);
        //     return true;
        // }
        this.pendingorders.add(userp.ipaddr);
        (async () => {
            const nid = ~~((~(1 << 32 - 1)) * Math.random());
            const tracker = new TextProgress(nid, userp);
            try {
                // youtube doesn't work anymore for the metadata
                //const buff = await spawnPromise("yt-dlp", ["-j", `https://youtube.com/watch?v=${id}`]);
                tracker.label = 'Getting video metadata...'
                tracker.value = 10;
                tracker.refresh();
                const info = await invidiousInfo(id);

                if (this.mustBeMusic && info.categories && !info.categories.includes("Music")) {
                    return this.send_system_done(userp, user, "Not categorized as music.\n");
                }

                id = info.id as string; // Fix #112 - Get the actual video ID youtube found.
                const spl = info.duration_string.split(':').map((e: string) => +e);
                const dur = spl[0] * 60 + spl[1];
                if (dur > 6 * 60 + 20 || spl.length > 2) {
                    return this.send_system_done(userp, user, `Video too long\n`);
                }
                if (spl.length == 1 || dur < 80)
                    return this.send_system_done(userp, user, `Video too short\n`);
                // format codes are compatible between invidious and youtube, so no changes here
                const found: { filesize: number, format_id: string; ext: string; }[] =
                    info.formats.filter((f: any) => f.format_id == "251" || f.format_id == "140").reverse(); // fallback to medium .m4a

                if (!found)
                    return this.send_system_done(userp, user, `Couldn't find compatible stream in video...\n`);

                let ext: string = '';
                let lastError: any = null;
                for (let f of found) {
                    // Filename for AssetManager (relative)
                    const relPath = info.id + "." + f.ext;
                    // Filename for filesystem (absolute/relative from CWD for yt-dlp)
                    const fsPath = './assets/' + relPath;

                    tracker.label = 'Downloading song...'
                    tracker.value = 60;
                    tracker.refresh();

                    // Check if exists using AssetManager (checks DB + S3 + local)
                    if (!await ensureAsset(relPath, true)) {
                        try {
                            const success = await invidiousFetch(f.format_id, id, fsPath);
                            if (success) {
                                ext = f.ext;
                                // Register the new local file and sync to S3
                                await ensureAsset(relPath); // Update DB with local presence
                                await ensureBackup(relPath); // Push to S3 & update REMOTE flag
                                break;
                            }
                        } catch (e) {
                            lastError = e;
                        }
                    }
                    else {
                        ext = f.ext;
                        // ensureAsset already updates timestamp/last_access
                    }
                }
                if (!ext) {
                    if (lastError) {
                        sendAlert('Playlist Error', String(lastError));
                    }
                    if (await clearIfOutdated(info.id)) {
                        return this.addToPlaylist(jam, stateargs, ...args);
                    }
                    return this.send_system_done(userp, user, `Failed to download the song, please try again later\n`);
                }
                const j = this.juke;
                if (!j)
                    return this.send_system_done(userp, user, `No such jukebox, what??\n`);

                const entry: PlaylistEntry = {
                    title: info.title,
                    channel: info.channel,
                    id,
                    ext,
                    skip: false,
                    playcount: 0
                };

                this.addEntry(entry, jam, offer, userp.ipaddr, runtime.broadcaster);

                return this.send_system_done(userp, user, `Enqueued: ${info.title}`);
            } catch (e) {
                console.log(e);
                return this.send_system_done(userp, user, `Something wrong happened, sorry.\n`);
            } finally {
                tracker.clear();
                this.pendingorders.delete(userp.ipaddr);
            }
        })();
        return true;
    }

    skipSong({ userp, state, runtime }: CommandRoomStateUserArg, ...args: string[]) {
        if (!userp.host.Playlist)
            return false;

        let n = +args[0];
        if (Number.isNaN(n))
            n = this.pidx; // fallback to currently playing track
        n = ~~n; // round down
        if (n > this.playlist.length || n < 0)
            return true;

        // the whole encoding process is stopped if the jukebox stops, with no recovery possible
        // so don't allow to skip everything in the playlist
        this.playlist[n].skip = !this.playlist[n].skip;
        if (this.playlist.every(s => s.skip)) {
            this.pidx = -1;
            const r = this.room;
            if (!r) return true; // should be initialized
            if (!r.ext)
                r.ext = {};
            r.ext.currentlyPlaying = undefined;
            this.timeStarted = 0;
        }
        this.resyncPl(runtime.broadcaster);

        if (this.pidx != -1 && n != this.pidx) // if the song we skipped wasn't playing, stop there, 
            //if pidx == -1 then there was nothing playing so we must have enabled a song again and need to reevaluate
            return true;

        // 

        // if we get there, then the currently playing song is the same as the 
        // nth only if it wasn't skipped prior to calling this command
        // thus we have to reevaluate the playlist
        this.pidx = this.nextTrackNumber();
        this.reevaluatePlaylist(runtime.broadcaster, true);

        return true;
    }

    commands: Command[] = [{
        name: 'playlist',
        named_params: [],
        handler: ({ userp, user }, ...args) => {
            send_system(userp, user, `The minimum price to add a song is ${this.currentPrice + 1}\nYou have ${this.qtys[userp.ipaddr] || 0}`);
            return true;
        }
    }, {
        name: 'pladd',
        named_params: ['amount', 'url'],
        desc: `
Usage: /pladd [x] [url]
Effect: Adds audio from a youtube video referred to by [url] to the end of the jukebox playlist. Requires paying [x] coins where [x] is greater than the current bid
`,
        handler: this.addToPlaylist.bind(this, false)
    }, {
        name: 'pljam',
        named_params: ['amount', 'url'],
        desc: `
Usage: /pljam [x] [url]
Effect: Same as /pladd, except the audio is played immediately, skipping the current song. Requires paying [x] coins where [x] is greater than double the current bid
`,
        handler: this.addToPlaylist.bind(this, true)
    }, {
        name: 'plskip',
        named_params: ['idx'],
        desc: `
Usage: /plskip OR /plskip [n]
Effect: Skips the currently playing OR toggles skipping of the [n]:th song in the list
`,
        handler: this.skipSong.bind(this)
    }, {
        name: 'plgrant',
        handler: this.gibMonies.bind(this)
    }];

    gibMonies({ userp, user }: CommandRoomStateUserArg, ...args: string[]) {
        if (!userp.host.Debug)
            return true;
        send_system(userp, user, 'Successful');
        this.qtys[userp.ipaddr] ||= 0;
        this.qtys[userp.ipaddr] += 1000;
        this.send_points(userp);
        return true;
    }

    override serialize() {
        return {
            currentPrice: this.currentPrice,
            qtys: this.qtys,
            playlist: this.playlist,
            pidx: this.pidx,
            timeStarted: this.timeStarted
        };
    }

    override deserialize(d: any): void {
        if (!d)
            return;
        const {
            currentPrice, qtys,
            playlist, pidx,
            timeStarted
        } = d;
        this.currentPrice = currentPrice || 5;
        if (qtys)
            this.qtys = qtys;
        if (playlist)
            this.playlist = playlist;
        if (timeStarted)
            this.timeStarted = timeStarted;

        if (this.pidx !== undefined) {
            this.pidx = pidx;
        }
    }

}
