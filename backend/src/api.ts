/* eslint-disable no-constant-condition */
/* eslint-disable no-constant-binary-expression */
import fileUpload, { UploadedFile } from "express-fileupload";
import { existsSync, mkdirSync, unlinkSync } from "fs";
import pathModule from "path";
import { extension } from "mime-types";
import express from "express";
import bodyparser from "body-parser";
import promClient from 'prom-client';
import crypto from "crypto";
import expressSession from "express-session";
import passport from "passport";
import { Strategy as DiscordStrategy } from "passport-discord";
import MongoStore from "connect-mongo";
import { BSON, Collection, ObjectId, WithId } from "mongodb";
import { isIPv4 } from "net";
import { banlist, clientPromise, playerViews, playersc, publicWarns, reports, roomc, asncapc, warnlist, intentc, badgoys, goodgoys, forbidden, comicc, failedRequests, tokensc, type Token, followersc, FollowPermissions, rearmNotificationTimer, alertsc } from "./db.js";
import { type PSet, type Room, type DBRoomState, Group } from "./types.js";
import { buffToIpv4, buffToIpv6, buildBinaryRepr, getGitHeadCommitHash, getIp, getAsn, randstring, buildCapString, sendAlert, persistAlert, findInList, initAsnReaders, nonRetardedAsyncExists, extract_caphmac, Permissions } from "./utils.js";
import { delegateRequest, startRoomProcess } from "./main.js";
import { roomExec, roomInfos, roomStats, rooms } from "./server-ipc.js";
import { adjustedDims, fitGroupsToBoard } from "./board.js";
import { spawnPromise } from "./utils.js";
import { expandIPv6Address, genRangev4, genRangev6, good_day, ipTo128bin, ipv4ToInt, ipv6ToBigInt } from "./ip-utils.js";
import TwitchStrategy, { Profile, VerifyCallback } from "./oauth-strats/twitch.js";
import shuffle from "./shuffle.js";
import { extract_data } from "./secret.js";
import sharp from "sharp";
import webpush from "web-push";
import axios from "axios";

const hash = getGitHeadCommitHash();

export const app = express();

app.set('trust proxy', true);
app.use("/assets/pictures", express.static("./assets"));
app.use("/assets/comics", express.static("./comic"));
app.use("/replays", express.static("./replays", {
    fallthrough: false,
    index: false,
    redirect: false,
}));
const path = process.env['FRONTENDPATH'] || (__dirname + "/../../frontend/home");

if (process.env['VAPID_EMAIL'] && process.env['VAPID_PUBLIC'] && process.env['VAPID_PRIVATE']) {
    webpush.setVapidDetails(
        `mailto:${process.env['VAPID_EMAIL']}`,
        process.env['VAPID_PUBLIC'] || '',
        process.env['VAPID_PRIVATE'] || ''
    );
}

// Runtime-editable localization files.
const localesDir = process.env["LOCALES_DIR"] || "/opt/reaggie-locales";

app.get("/locales/:lang.json", (req, res) => {
    const lang = req.params.lang;

    if (lang !== "en" && lang !== "ru") {
        res.status(404).json({ error: "Unknown locale" });
        return;
    }

    const file = pathModule.join(localesDir, `${lang}.json`);

    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");

    res.sendFile(file, (err) => {
        if (err && !res.headersSent) {
            res.status(500).json({ error: "Locale file unavailable" });
        }
    });
});

const st = express.static(path, { extensions: ['html'], redirect: false });
app.use(st);

const stats = {
    active: 0,
    freespace: '123',
    /*
        Sometimes the master process isn't restarted after a new build is made
        because no changes requires it to be restarted, so it may lag behind the codebase
        used by the room processes, hence two hashes to represent that
    */
    room_commit: '',
    unique_players: 0,
    master_commit: hash,
    last_comic_timestamp: 0,
    announcement: undefined as string | undefined,
    announcement_timestamp: 0 as number | undefined,
};

const register = new promClient.Registry();

// maybe should prefix the metrics names with jiggie?

const uniquePlayers = new promClient.Gauge({
    name: 'uniquePlayers',
    help: 'Number of unique players over certain period of times',
    registers: [register],
    labelNames: ['group']
});

// normally you'd use a counter, but the total room number can decrease from deletion
const roomTotal = new promClient.Gauge({
    name: 'roomTotal',
    help: 'Number of rooms in the database',
    registers: [register]
});

// normally you'd use a counter, but the total room number can decrease from deletion
const activeRooms = new promClient.Gauge({
    name: 'activeRooms',
    help: 'Number of active rooms',
    registers: [register]
    // could use label to separate rooms by tags? visibility?
});

// normally should be close to uniquePlayers/hour
const activePlayers = new promClient.Gauge({
    name: 'activePlayers',
    help: 'Number of active, online players',
    registers: [register]
});

const jiggietotalHeapUsage = new promClient.Gauge({
    name: 'jiggietotalHeapUsage',
    help: 'Heap reserved by all room processes',
    registers: [register]
});

const jiggietotalPressure = new promClient.Gauge({
    name: 'jiggietotalPressure',
    help: 'Bytes pending to be sent',
    registers: [register]
});

const jiggiemasterHeapUsage = new promClient.Gauge({
    name: 'jiggiemasterHeapUsage',
    help: 'Heap reserved by the master process',
    registers: [register]
    // might be helpful to figure out memleaks, considering it's supposed to be a long lived process
});

const wrtcPlayers = new promClient.Gauge({
    name: 'wrtcPlayers',
    // i expect it to be approximately the number of desktop ipv6 users, + part of ipv4 users, + basically 0 of mobile network users 
    help: 'Amount of players with a valid wrtc connection',
    registers: [register]
});

app.get('/metrics', async (req, res) => {
    res.set('Content-Type', promClient.register.contentType);
    const str = await register.metrics();
    res.end(str);
});

type ExtractProps<T, U> = {
    [K in keyof T as T[K] extends U ? K : never]: T[K]
};

async function updateStats() {
    stats.active = Object.keys(rooms).length;
    stats.unique_players = new Set(Object.values(roomStats).map(e => e.ips || []).flat()).size;

    const [_, __, ___, freespace] = (await spawnPromise('df', ['-h', './assets']))
        .toString()
        .trim()
        .split('\n')
        .at(-1)!
        .replace(/ +/g, ' ')
        .split(' ');
    stats.freespace = freespace!;

    stats.room_commit = getGitHeadCommitHash();

    await Promise.all(Object.entries(playerViews).map(async ([k, v]) => {
        const value = await v.countDocuments();
        uniquePlayers.set({ 'group': k }, value);
    }));
    // bleh
    const totalUnique = await playersc.countDocuments();
    uniquePlayers.set({ 'group': 'alltime' }, totalUnique);

    roomTotal.set(await roomc.estimatedDocumentCount());
    activeRooms.set(stats.active);
    activePlayers.set(stats.unique_players);
    const mem = process.memoryUsage();
    jiggietotalHeapUsage.set(mem.heapTotal + mem.external);
    const sumof = (k: keyof ExtractProps<typeof roomStats[''], number | undefined>) => Object.values(roomStats).map(e => e[k] || 0).reduce((a, b) => a + b, 0);
    jiggietotalHeapUsage.set(sumof('memUsage'));

    const lastComic = await comicc.findOne({}, { sort: { uploadDate: -1 } });
    if (lastComic) {
        stats.last_comic_timestamp = lastComic.uploadDate.getTime();
    }
}

console.log('starting state updates')
const stopStatUpdate = setInterval(() => {
    void updateStats().catch(error => console.error("Failed to update stats", error));
}, 10000);

app.get('/ack', async (req, res, next) => {
    const ip = getIp(req);
    const warn = await findInList(warnlist, ip);
    if (warn) {
        await warnlist.deleteOne({ _id: warn._id });
    }
    res.redirect('/');
});

app.get('/stats', async (req, res, next) => {
    res.send(stats);
});

app.use(fileUpload({
    limits: {
        fileSize: 50 * 1024 * 1024,
        files: 16
    },
    abortOnLimit: true,
}));

app.use(bodyparser.json());

const adminPassFromReq = (req: express.Request) => {
    const header = req.headers['x-admin-pass'];
    if (typeof header === 'string' && header)
        return header;
    if (typeof req.body?.pass === 'string')
        return req.body.pass;
    const queryPass = req.query?.pass;
    if (typeof queryPass === 'string')
        return queryPass;
    return '';
};

const isAdminReq = (req: express.Request) => {
    const expected = process.env.MONGOPASS || '';
    const got = adminPassFromReq(req);
    return !!expected && got === expected;
};

const contactHits = new Map<string, number[]>();
const CONTACT_WINDOW_MS = 10 * 60 * 1000;
const CONTACT_MAX = 8;

const contactRateLimited = (ip: string) => {
    const now = Date.now();
    const hits = (contactHits.get(ip) || []).filter(t => now - t < CONTACT_WINDOW_MS);
    if (hits.length >= CONTACT_MAX) {
        contactHits.set(ip, hits);
        return true;
    }
    hits.push(now);
    contactHits.set(ip, hits);
    return false;
};

const parseAlertId = (id: string) => {
    try {
        return new ObjectId(id);
    } catch {
        return null;
    }
};

app.post('/api/contact', async (req, res) => {
    const ip = getIp(req);
    const sub = req.body?.sub;
    const com = req.body?.com;
    if (typeof sub !== 'string' || typeof com !== 'string') {
        res.status(400).send({ error: 'sub and com required' });
        return;
    }
    if (!sub.trim() && !com.trim()) {
        res.status(400).send({ error: 'empty' });
        return;
    }
    if (contactRateLimited(ip)) {
        res.status(429).send({ error: 'too many requests' });
        return;
    }
    await persistAlert(sub, com, { source: 'client', ip });
    res.send({ ok: true });
});

app.get('/api/alerts', async (req, res) => {
    if (!isAdminReq(req)) {
        res.status(401).send({ error: 'unauthorized' });
        return;
    }
    if (!alertsc) {
        res.send({ items: [], unread: 0 });
        return;
    }
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
    const unreadOnly = req.query.unread === '1' || req.query.unread === 'true';
    const source = req.query.source;
    const filter: Record<string, unknown> = {};
    if (unreadOnly)
        filter.read = false;
    if (source === 'server' || source === 'client')
        filter.source = source;
    const [items, unread] = await Promise.all([
        alertsc.find(filter).sort({ time: -1 }).limit(limit).toArray(),
        alertsc.countDocuments({ read: false }),
    ]);
    res.send({
        items: items.map(e => ({ ...e, _id: String(e._id) })),
        unread,
    });
});

app.patch('/api/alerts/:id', async (req, res) => {
    if (!isAdminReq(req)) {
        res.status(401).send({ error: 'unauthorized' });
        return;
    }
    const id = parseAlertId(req.params.id);
    if (!id) {
        res.status(400).send({ error: 'bad id' });
        return;
    }
    const read = req.body?.read;
    if (typeof read !== 'boolean') {
        res.status(400).send({ error: 'read boolean required' });
        return;
    }
    await alertsc.updateOne({ _id: id }, { $set: { read } });
    res.send({ ok: true });
});

app.delete('/api/alerts/:id', async (req, res) => {
    if (!isAdminReq(req)) {
        res.status(401).send({ error: 'unauthorized' });
        return;
    }
    const id = parseAlertId(req.params.id);
    if (!id) {
        res.status(400).send({ error: 'bad id' });
        return;
    }
    await alertsc.deleteOne({ _id: id });
    res.send({ ok: true });
});

app.post('/api/alerts/read-all', async (req, res) => {
    if (!isAdminReq(req)) {
        res.status(401).send({ error: 'unauthorized' });
        return;
    }
    await alertsc.updateMany({ read: false }, { $set: { read: true } });
    res.send({ ok: true });
});

app.post('/broadcast', async (req, res, next) => {
    if (req.body.pass != process.env.MONGOPASS) {
        next();
        return;
    }
    const { msg } = req.body;
    for (const room of Object.values(rooms)) {
        room.write(JSON.stringify({ type: "broadcast", msg }));
    }
    res.send({ ok: true });
});

app.post('/announcement', async (req, res, next) => {
    if (req.body.pass != process.env.MONGOPASS) {
        next();
        return;
    }
    const { msg } = req.body;
    stats.announcement = msg;
    stats.announcement_timestamp = Date.now();
    res.send({ ok: true });
});

app.delete('/announcement', async (req, res, next) => {
    if (req.body.pass != process.env.MONGOPASS) {
        next();
        return;
    }
    const { msg } = req.body;
    delete stats.announcement;
    delete stats.announcement_timestamp;
    res.send({ ok: true });
});

const sleep = (n: number) => new Promise(_ => setTimeout(_, n));

app.post('/exec', async (req, res, next) => {
    if (req.body.pass != process.env.MONGOPASS) {
        next();
        return;
    }
    const { msg } = req.body;
    const ridsuffix = ~~(Math.random() * ~(1 << 31));
    const results: Promise<{ room: string, pl: any; }>[] = [];
    for (const [roomname, room] of Object.entries(rooms)) {
        const cid = roomname + ridsuffix;
        // valid iff executors run before the write
        results.push(Promise.race([new Promise<{ room: string, pl: any; }>(_ => {
            roomExec[cid] = pl => _({ room: roomname, pl });
        }), sleep(2000).then(_ => ({ room: roomname, pl: undefined }))]));
        room.write(JSON.stringify({ type: "exec", payload: msg, cid }));
    }
    const data = await Promise.all(results);
    res.send({ ok: true, data });
});

app.post('/execr', async (req, res, next) => {
    if (req.body.pass != process.env.MONGOPASS) {
        next();
        return;
    }
    const { msg } = req.body;
    const ridsuffix = ~~(Math.random() * ~(1 << 31));
    const room = rooms[req.body.rid];
    if (!room) {
        res.send({ ok: false });
        return;
    }
    const roomname = req.body.rid;
    const cid = req.body.rid + ridsuffix;
    const prom = Promise.race([new Promise<{ room: string, pl: any; }>(_ => {
        roomExec[cid] = pl => _({ room: roomname, pl });
    }), sleep(2000).then(_ => ({ room: roomname, pl: undefined }))]);
    room.write(JSON.stringify({ type: "exec", payload: msg, cid }));
    const data = await prom;
    res.send({ ok: true, data });
});

app.post('/ack', async (req, res, next) => {
    if (req.body.pass != process.env.MONGOPASS) {
        res.redirect('/');
        return;
    }
    const { ip, type, reason, expire = NaN, range, infractionDate, roomDate } = req.body;
    const v = isIPv4(ip) ? 4 : 6;
    const conv = v == 4 ? ipv4ToInt : (s: string) => ipv6ToBigInt(expandIPv6Address(s));
    const gen = v == 4 ? genRangev4 : genRangev6;
    let r = BigInt(range || (v == 4 ? 32 : 128));
    let [low, hi] = gen(conv(ip), r).map(ipTo128bin);

    let info: string | undefined = undefined;
    if (type == "ban") {
        info = (await spawnPromise("geoiplookup" + (v == 6 ? "6" : ""), [ip])).toString();
    }

    await (type == "ban" ? banlist : warnlist).insertOne({
        v,
        low,
        hi,
        ip,
        reason,
        expire,
        info,
        infractionDate: infractionDate || roomDate,
    } as any);
    res.send({ ok: true });
});

let modstats = {
    queued: 0,
    bans: [] as {
        ip: string;
        reason: string;
        date: number;
        info: string;
    }[],
    warns: [] as {
        reasons: string[];
        response: string;
        images: string[];
        roomid: string;
    }[]
};

const updateModStats = async () => {
    modstats.queued = await reports.countDocuments();
    const ips = new Set<string>();
    modstats.bans = [];
    const bancursor = banlist.find({}).sort("_id", "desc");
    let elem: Awaited<ReturnType<typeof bancursor['next']>>;
    // eslint-disable-next-line no-cond-assign
    while (elem = await bancursor.next()) {
        const ip = elem.ip || (elem.v == 4 ? buffToIpv4(elem.low.buffer) : buffToIpv6(elem.low.buffer));
        if (ips.has(ip))
            continue;
        let info = elem.info;
        if (!info || elem.v == 6) {
            elem.info = info = (await spawnPromise("geoiplookup" + (elem.v == 6 ? "6" : ""), [ip])).toString();
            await banlist.updateOne({ _id: elem._id }, { $set: { info } });
        }
        modstats.bans.push({
            date: +(elem.infractionDate || elem._id.getTimestamp()),
            ip,
            reason: elem.reason,
            info
        });
        ips.add(ip);
    }

    modstats.warns = await publicWarns.find({}).sort("_id", "desc").toArray();
};

setInterval(() => {
    void updateModStats().catch(error => console.error("Failed to update moderation stats", error));
}, 3600 * 1000);

//app.get('/modstats', async (req, res) => {
//    res.send(modstats);
//});

app.get('/api/search', async (req, res) => {
    let kw = req.query.key as string || '';

    // only look in active rooms
    const filteredRooms = Object.entries(roomInfos).filter(e => e[1].key === kw);

    const ip = getIp(req);
    const proms = await Promise.all(filteredRooms.map(async e => {
        const roomStat = roomStats[e[0]]!;
        const room = e[1];
        if (!roomStat) return;
        if (roomStat.completion < 1 && await findInList(goodgoys, roomStat.createdBy)) {
            if (await findInList(badgoys, ip))
                return;
        }
        return {
            id: e[0],
            name: room.name,
            auth: room.auth,
            tags: room.tags,
            sets: room.sets,
            pieces: room.pieces,
            startTime: room.startTime,
            rotation: room.rotation || false,
            nsfw: room.nsfw || false,
            thumbnail: room.thumbnail,
            hidePreview: room.hidePreview,
            hasVideo: room.hasVideo,
            jigChan: room.jigChan,
            gay: room.gay,
            players: roomStat.usercount,
            completion: roomStat.completion || 0,
            hostName: roomStat.hostName,
        };
    }));
    const resRooms = proms.filter(r => r && r.completion < 1);

    res.status(200).json(resRooms);
});

app.post('/api/comic', async (req, res) => {
    if (!req.files || !req.files.file) {
        res.status(400).send('No file uploaded');
        return;
    }
    const file = req.files.file as UploadedFile;
    const description = req.body.description;
    const token = req.body.token;

    if (!token) {
        res.status(401).send('Unauthorized');
        return;
    }

    const cap = extract_caphmac(
        Buffer.from(process.env.MONGOPASS!),
        token);
    if (!cap.has('RoomCreator')) {
        res.status(403).send('Forbidden');
        return;
    }

    const ext = "webp";
    const filename = `/${crypto.randomUUID()}.${ext}`;
    const filepath = `./comic${filename}`;

    if (file.mimetype === "image/webp") {
        await file.mv(filepath);
    } else {
        await sharp(file.data)
            .webp({ lossless: true, effort: 6 })
            .toFile(filepath);
    }

    await comicc.insertOne({
        description,
        filepath: filename,
        uploadDate: new Date()
    });

    stats.last_comic_timestamp = Date.now();

    res.send({ ok: true });
});

app.get('/api/comic', async (req, res) => {
    const comics = await comicc.find({}).sort({ _id: -1 }).toArray();
    res.json(comics);
});

app.get('/banned', async (req, res, next) => {
    const asn = getAsn(req);
    const ip = getIp(req);
    const asncaps = await asncapc.findOne({ asn });
    if (asncaps && (asncaps.cap & 1) == 0) {
        res.send({
            ip, asn,
            offense: 'banned',
            reason: 'Due to abuse from your ISP, your IP range has been banned. If you are using a VPN service, try switching it off.',
            ban: true,
            expiration: 'never',
            expired: false
        });
        return;
    }
    const ban = await findInList(banlist, ip);
    const warn = await findInList(warnlist, ip);
    if (!ban && !warn) {
        res.send({});
        return;
    }

    let body: any;
    if (ban) {
        const secs = Math.floor((ban.expire - Date.now()) / 1000);
        const expired = !Number.isNaN(secs) && secs < 60;
        if (expired) {
            await banlist.deleteOne({ _id: ban._id });
            res.send({});
            return;
        }
        body = {
            ip, asn,
            offense: 'banned',
            reason: ban.reason + `\nIP: ${ip}\nBan IP: ${ban.ip}`,
            ban: true,
            expiration: Number.isNaN(secs) ? 'never' : secs + ' seconds',
            expired
        };
    } else if (warn) {
        body = {
            ip, asn,
            offense: 'warned',
            reason: warn.reason,
            ban: false,
            warn: true,
            expiration: false,
            expired: false
        };
    }
    res.send(body);
});

import { bingoc, bingocondsc } from "./db.js";

// Bingo API

// Seed bingo conditions if empty
export const unlockBingoCondition = async () => {
    try {
        const unchecked = await bingocondsc.find({ checked: { $ne: true } }).toArray();
        if (unchecked.length === 0) return;

        const randomIndex = Math.floor(Math.random() * unchecked.length);
        const selected = unchecked[randomIndex];

        await bingocondsc.updateOne({ id: selected.id }, { $set: { checked: true } });
        console.log(`Unlocked bingo condition: ${selected.id} (${selected.desc})`);

        const remainingUncheckedCount = unchecked.length - 1;
        if (remainingUncheckedCount <= 25) {
            console.log(`Only ${remainingUncheckedCount} locked conditions left. Resetting all conditions...`);
            await bingocondsc.updateMany({}, { $set: { checked: false } });
        }
    } catch (e) {
        console.error("Failed to unlock bingo condition", e);
    }
};

const bingoInterval = setInterval(unlockBingoCondition, 3 * 3600 * 1000);

const bingoseed = async () => {
    try {
        const conditions = await bingocondsc.find({}).toArray();
        const hasAll = conditions.length === 100 && conditions.every(c => {
            const num = parseInt(c.id.split('-')[1]);
            return c.id.startsWith('cond-') && num >= 1 && num <= 100;
        });

        if (!hasAll) {
            console.log("Seeding/re-seeding bingo conditions with 1 to 100...");
            await bingocondsc.deleteMany({});
            const defaultConditions = [];
            for (let i = 1; i <= 100; i++) {
                defaultConditions.push({
                    id: `cond-${i}`,
                    desc: `Condition ${i}`,
                    checked: false
                });
            }
            await bingocondsc.insertMany(defaultConditions);
            console.log("Seeded bingo conditions.");
        }
    } catch (e) {
        console.error("Failed to seed bingo conditions", e);
    }
};

app.get('/api/bingo', async (req, res) => {
    let token = req.query.token as string;

    // If no token, generate one
    if (!token) {
        token = randstring(12);
    }

    let card = await bingoc.findOne({ token });

    if (!card) {
        // Generate new card
        // Pick 25 random conditions that haven't happened yet
        const uncheckedConds = await bingocondsc.find({ checked: { $ne: true } }).toArray();
        let selectedConds = [];

        if (uncheckedConds.length > 0) {
            // Fisher-Yates shuffle
            for (let i = uncheckedConds.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [uncheckedConds[i], uncheckedConds[j]] = [uncheckedConds[j], uncheckedConds[i]];
            }
            // Repeat if not enough? Or just fill what we have.
            // Requirement says 25.
            while (selectedConds.length < 25) {
                for (const c of uncheckedConds) {
                    selectedConds.push(c);
                    if (selectedConds.length === 25) break;
                }
                // Avoid infinite loop if db empty
                if (uncheckedConds.length === 0) break;
            }
        }

        const grid_ids = selectedConds.map(c => c.id);

        await bingoc.insertOne({
            token,
            grid_ids, // Store ONLY IDs
            created_at: new Date()
        });

        card = { token, grid_ids, created_at: new Date(), edited: false } as any;
    }

    // Always fetch latest details for the IDs in the card
    const gridIds = card!.grid_ids || []; // Handle legacy or empty?
    const conditions = await bingocondsc.find({ id: { $in: gridIds } }).toArray();
    const condMap = new Map(conditions.map(c => [c.id, c]));

    const grid = gridIds.map(id => {
        const c = condMap.get(id);
        return {
            id,
            condition: c?.desc || 'Unknown',
            checked: !!c?.checked
        };
    });

    res.json({
        token,
        editable: !card!.edited,
        grid
    });
});

app.get('/api/bingoconds', async (req, res) => {
    // Only return unchecked conditions for editing
    const conds = await bingocondsc.find({ checked: { $ne: true } }).project({ _id: 0 }).toArray();
    res.json(conds);
});

app.patch('/api/bingo', async (req, res) => {
    const { token, grid_ids } = req.body;
    if (!token || !grid_ids || !Array.isArray(grid_ids) || grid_ids.length !== 25) {
        res.status(400).json({ error: "Invalid request" });
        return;
    }

    const card = await bingoc.findOne({ token });
    if (!card) {
        res.status(404).json({ error: "Bingo card not found" });
        return;
    }

    // check that the card is editable (if it has not been edited)
    if (card.edited) {
        res.status(403).json({ error: "Card is not editable" });
        return;
    }

    // Validate valid IDs and CHECKED STATUS
    const conditions = await bingocondsc.find({ id: { $in: grid_ids } }).toArray();

    // Check if any selected conditions are already checked (should be refused)
    if (conditions.some(c => c.checked)) {
        res.status(400).json({ error: "Cannot select already checked conditions" });
        return;
    }

    // Validate we found all descriptions (optional strict check)
    if (conditions.length !== new Set(grid_ids).size) {
        res.status(400).json({ error: "Not all conditions found" });
        return;
    }
    // check that new Set(grid_ids).size === 25
    if (new Set(grid_ids).size !== 25) {
        res.status(400).json({ error: "Duplicate conditions are not allowed" });
        return;
    }

    await bingoc.updateOne({ token }, { $set: { grid_ids, edited: true } });

    res.json({ ok: true });
});

app.post('/api/bingoimg', async (req, res) => {
    if (!req.files || !req.files.file) {
        res.status(400).send('No file uploaded');
        return;
    }
    const file = req.files.file as UploadedFile;
    const token = req.body.token;

    if (!token) {
        res.status(401).send('Unauthorized');
        return;
    }

    const card = await bingoc.findOne({ token });
    if (!card || !card.grid_ids) {
        res.status(404).json({ error: "Bingo card not found" });
        return;
    }

    // Verify winning line based on global checked status
    const conditions = await bingocondsc.find({ id: { $in: card.grid_ids } }).toArray();
    const condMap = new Map(conditions.map(c => [c.id, !!c.checked]));
    const isChecked = (i: number) => condMap.get(card.grid_ids[i]) || false;

    let hasLine = false;

    // Rows
    for (let r = 0; r < 5; r++) {
        if (isChecked(r * 5) && isChecked(r * 5 + 1) && isChecked(r * 5 + 2) && isChecked(r * 5 + 3) && isChecked(r * 5 + 4)) hasLine = true;
    }
    // Cols
    for (let c = 0; c < 5; c++) {
        if (isChecked(c) && isChecked(c + 5) && isChecked(c + 10) && isChecked(c + 15) && isChecked(c + 20)) hasLine = true;
    }
    // Diagonals
    if (isChecked(0) && isChecked(6) && isChecked(12) && isChecked(18) && isChecked(24)) hasLine = true;
    if (isChecked(4) && isChecked(8) && isChecked(12) && isChecked(16) && isChecked(20)) hasLine = true;

    // Enforce check? User asked for factual implementation.
    // "And needs to refuse attempts to set a condition that was checked true" was for editing.
    // "Then checking the state of a bingo become a simple matter..."
    // I will enforce it if possible, but currently no conditions are checked=true in my seed.
    // IF I enforce it now, no one can upload. 
    // However, the prompt implies this flow is complete.
    // I will check hasLine. If false, I might reject? 
    // "Verify winning line" comment was there.
    // I'll log it but maybe allow it for testing if I can't set checked=true easily?
    // Actually, I'll allow it but maybe add a query param `force` for testing? 
    // No, let's just stick to the updated logic: verifies against global state.

    if (!hasLine) {
        res.status(400).json({ error: "No bingo line completed based on global events" });
        return;
        // Commented out to prevent blocking testing since we haven't implemented event triggers setting checked=true yet.
    }

    const filename = await saveFile(file, false, false, "/bingo_rewards/");
    await bingoc.updateOne({ token }, { $set: { image: filename } });

    res.send({ ok: true });
});

app.post('/api/bingobanner', async (req, res) => {
    if (!req.files || !req.files.file) {
        res.status(400).send('No file uploaded');
        return;
    }
    const file = req.files.file as UploadedFile;
    const token = req.body.token;

    if (!token) {
        res.status(401).send('Unauthorized');
        return;
    }

    const card = await bingoc.findOne({ token });
    if (!card || !card.grid_ids) {
        res.status(404).json({ error: "Bingo card not found" });
        return;
    }

    // Verify winning line based on global checked status
    const conditions = await bingocondsc.find({ id: { $in: card.grid_ids } }).toArray();
    const condMap = new Map(conditions.map(c => [c.id, !!c.checked]));
    const isChecked = (i: number) => condMap.get(card.grid_ids[i]) || false;

    let hasLine = false;

    // Rows
    for (let r = 0; r < 5; r++) {
        if (isChecked(r * 5) && isChecked(r * 5 + 1) && isChecked(r * 5 + 2) && isChecked(r * 5 + 3) && isChecked(r * 5 + 4)) hasLine = true;
    }
    // Cols
    for (let c = 0; c < 5; c++) {
        if (isChecked(c) && isChecked(c + 5) && isChecked(c + 10) && isChecked(c + 15) && isChecked(c + 20)) hasLine = true;
    }
    // Diagonals
    if (isChecked(0) && isChecked(6) && isChecked(12) && isChecked(18) && isChecked(24)) hasLine = true;
    if (isChecked(4) && isChecked(8) && isChecked(12) && isChecked(16) && isChecked(20)) hasLine = true;

    if (!hasLine) {
        res.status(400).json({ error: "No bingo line completed based on global events" });
        return;
    }

    const filename = await saveFile(file, false, false, "/bingo_rewards/");
    await bingoc.updateOne({ token }, { $set: { banner: filename } });

    res.send({ ok: true });
});

app.post('/api/bingoconds', async (req, res) => {
    const { desc } = req.body;
    if (!desc || typeof desc !== 'string') {
        res.status(400).json({ error: "Description is required" });
        return;
    }

    if (desc.length > 75) {
        res.status(400).json({ error: "Description too long (max 75 chars)" });
        return;
    }

    const id = `custom-${crypto.randomUUID().slice(0, 8)}`;
    const newCond = {
        id,
        desc,
        checked: false,
        custom: true
    };

    await bingocondsc.insertOne(newCond);
    res.json(newCond);
});

import { saveAsset } from "./AssetManager.js";
import e from "express";
import { findReview, getReview, isReviewerAvailable, ReviewObserver } from "./reviewer.js";

if (!existsSync("./assets"))
    mkdirSync("./assets");
if (!existsSync("./comic"))
    mkdirSync("./comic");
// non-retarded api, not implementation*

const saveFile = async (file: UploadedFile, selfDestruct: boolean, skipFiles: boolean, prefix: string = "") => {
    const ext = extension(file.mimetype);
    let fn = prefix + `${file.md5.slice(0, 2)}/${file.md5.slice(2, 4)}/${file.md5}` + '.' + ext;

    if (!skipFiles) {
        let k = 0;
        if (selfDestruct) // self destruct logic not fully compatible with content-addressed, simple retry
            do {
                fn = prefix + `${file.md5.slice(0, 2)}/${file.md5.slice(2, 4)}/${file.md5}` + `-${k++}.` + '.' + ext;
            } while (await nonRetardedAsyncExists("./assets/" + fn));

        // Use AssetManager
        // Note: saveAsset assumes relative path from assets root
        // Here `fn` is exactly that (e.g. "0a/3f/....png")
        await saveAsset(fn, file.data);
    }

    return fn;
};

interface CreateRoomResult {
    // refactor once the old api will be removed to use 400/500 errors
    error?: string;

    // old api only
    redirect?: string;

    // new api only
    room?: {
        id: string;
        secret: string;
    };
}

// actually only cares about creating a room and returning its ID,
// assumes all arguments are properly checked and coherent
const actualCreateRoom = async (roomarg: {
    size: string,
    layoutsData: SerializedImageLayoutConfig[],
    mode: {
        jitter: number;
        tabSize: number;
        cornerJitter: number;
        squarepieces: boolean;
        fakeedges: boolean;
        rotation: boolean;
        flipping: boolean;
        zigzag: boolean;
        sticky: boolean;
        rot: boolean;
    },
    room_settings: {
        preview: boolean,
        nostack: boolean;
        nolock: boolean;
        nomultisel: boolean;
        norect: boolean;
        votekick: boolean;
        jigchan: boolean;
        noedge: boolean;
    },
    initial_settings: {
        autism: 0 | 1 | 2;
        mixsets: boolean;
        sepedges: boolean;
        juke: boolean;
        jukemusic: boolean;
        scores: boolean;
        sd: boolean;
        tags: string[];
        nsfw: boolean;
        censored: number[];
        auth: boolean;
        forceanon: boolean;
        key?: string;
    },
    name: string,
    pieces: number,
    urlname?: string,
    token?: string,
    files: {
        width: number,
        height: number,
        path: string;
        md5: string;
        mime: string;
    }[],
    thumbnail?: string,
}, creatorIp: string, asn?: number) => {
    let { urlname, name, initial_settings, mode, files, layoutsData } = roomarg;
    let { censored } = initial_settings;
    let rid = urlname || randstring(6);
    let dims = files.map(f => [f.width, f.height] as [number, number]);

    // Scale the images so they have roughly the same surface area
    const adims = adjustedDims(dims);
    if (adims.some(([width, height]) =>
        !Number.isFinite(width) || !Number.isFinite(height)
        || width > 10_000_000 || height > 10_000_000))
        throw new Error("unsupported_dimensions");
    let biggestdims = adims[0]!;
    let biggestarea = biggestdims[0] * biggestdims[1];
    for (let i = 1; i < adims.length; ++i) {
        const narea = adims[i]![0] * adims[i]![1];
        if (narea > biggestarea) {
            biggestarea = narea;
            biggestdims = adims[i]!;
        }
    }

    let genresult: { total: number, sets: PSet[] } = {
        total: 0,
        sets: []
    };
    for (let i = 0; i < layoutsData.length; ++i) {
        const layout = layoutsData[i];
        genresult.total += layout.positions!.length;
        let isvoronoi = layout.voronoiConfig;
        genresult.sets.push({
            height: adims[i]![1],
            width: adims[i]![0],
            imageWidth: files[i]!.width,
            imageHeight: files[i]!.height,
            image: files[i]!.path,
            isvideo: files[i]!.mime == "webm" || files[i]!.mime == "mp4",
            ...(isvoronoi ? {
                cols: 1,
                rows: 1,
                pieceWidth: 1,
                pieceHeight: 1,
                count: layout.voronoiConfig!.total,
                seed: layout.voronoiConfig!.seed,
                sites: layout.voronoiConfig!.sites
            } : {
                cols: layout.setConfig!.cols,
                rows: layout.setConfig!.rows
            })
        });
    }

    let gay = false;
    let m: null | RegExpMatchArray;
    if ((m = name.match(/\?.*$/))) {
        const hash = crypto.hash('sha1', m[0]);
        if (hash !== "cc319d22460c10bc27ab597635b67e386abe0bc5")
            m = null;
        else {
            name = name.replace(/\?.*$/, '');
            gay = true;
        }
    }
    let overwriteRegex = /.^/;
    if ((m = name.match(/\|(.*)\|/))) {
        const msg = Buffer.from(m[1], "base64");
        const { valid, payload } = await extract_data(msg);
        if (valid) {
            overwriteRegex = new RegExp("^" + payload + "$");
            name = name.replace(/\|(.*)\|/, '');
        }
    }
    roomarg.name = name;
    let groups: Group[] = [];
    let hiddenTargets: Record<string, [number, number]> = {};
    let boardDims: { boardWidth: number, boardHeight: number } = { boardWidth: 0, boardHeight: 0 };
    if (layoutsData) {
        const result = buildGroupsFromLayouts(
            layoutsData,
            genresult.sets,
            mode.rotation
        );
        groups = result.groups;
        boardDims = result.boardDims;
        hiddenTargets = result.hiddenTargets;
    }
    const initialLayout = buildBinaryRepr(groups.map(group => {
        const target = hiddenTargets[group.id];
        return target ? { ...group, x: target[0], y: target[1] } : group;
    }), mode.rot) as any;
    let censoredCount = censored.length;
    const censoredIds: number[] = [];
    if (dims.length == 1 && censoredCount >= 1) {
        for (const idx of censored) {
            if (!groups[idx]) {
                censoredCount--;
                continue;
            }
            censoredIds.push(groups[idx]!.id);
            groups[idx]!.x = 0xDEADBABE;
            groups[idx]!.y = 0xDEADBABE;
        }
    }
    shuffle.Knuth(groups); // Prevent manual "cheating" by abusing stacked pieces being ordered

    name = name.slice(0, 40);
    const groupsBinary = buildBinaryRepr(groups, mode.rot) as any;
    let newroom: Room = {
        name,
        key: initial_settings.key,
        pieces: genresult.total,
        hidePreview: !roomarg.room_settings.preview,
        rotation: mode.rotation,
        jitter: mode.jitter, // used to randomize width/height of pieces that aren't on the edge, I think? not sure why
        tabSize: mode.tabSize,
        cornerJitter: mode.cornerJitter,
        nomultiselect: roomarg.room_settings.nomultisel,
        nolockunlock: roomarg.room_settings.nolock,
        norectselect: roomarg.room_settings.norect,
        seed: ~~(Math.random() * 65536),
        ...boardDims,
        thumb: "",
        sets: genresult.sets,
        zigzag: mode.zigzag,
        fakeEdge: mode.fakeedges,
        auth: initial_settings.auth,
        square: mode.squarepieces,
        scores: initial_settings.scores,
        flipping: mode.flipping,
        groups: groupsBinary,
        initialLayout,
        nostack: roomarg.room_settings.nostack,
        ext: {
            estate: true,
            censoredCount,
            ocensoredCount: censoredCount, // track original count
            censoredIds,
            selfdestruct: initial_settings.sd,
            sepedges: initial_settings.sepedges,
            rotting: mode.rot,
            sticky: mode.sticky,
            voronoi: layoutsData.some(layout => !!layout.voronoiConfig),
            gay,
            layouts: layoutsData,
            hiddenBags: layoutsData ? layoutsData.flatMap((l, sid) => l.bags.filter(b => b.hiddenUntil !== undefined && b.hiddenUntil !== null).map(b => ({ setIndex: sid, bag: b }))) : [],
            hiddenTargets,
        },
        thumbnail: roomarg.thumbnail,
        tags: initial_settings.tags,
        nsfw: initial_settings.nsfw,
        votekick: roomarg.room_settings.votekick,
        juke: initial_settings.juke,
        jukemusic: initial_settings.jukemusic,
        anon: initial_settings.forceanon,
        jigchan: roomarg.room_settings.jigchan,
        noedge: roomarg.room_settings.noedge,
    };

    let prev: WithId<{
        roomid: string;
        room: Room;
        state: DBRoomState;
    }> | null;

    let attempt = 0;
    if (urlname) {
        // if attempting to create a room with a forbidden pattern, can't proceed unless the overwriteRegex matches
        if (await forbidden.findOne({ $expr: { $regexMatch: { input: urlname, regex: "$pattern" } } })) {
            if (!urlname.match(overwriteRegex))
                throw new Error("already_exists");
        }
    }

    do {
        prev = await roomc.findOne({ roomid: rid });
        if (!prev) break; // all good
        if (urlname) { // can only overwrite if rid matches the overwriteregex
            if (rid.match(overwriteRegex))
                await roomc.deleteOne({ roomid: rid });
            else
                throw new Error("already_exists");

        }
        rid = randstring(6);
        if (attempt++ > 5) {
            throw new Error("already_exists");
        }
    } while (prev);

    let newstate: DBRoomState = {
        bannedips: [],
        frameGroupIds: [],
        secret: randstring(20),
        token: roomarg.token,
        gid: 1,
        hist: {},
        chatlog: [],
        iplog: [],
        bannednames: [],
        modstate: {},
        createdBy: creatorIp,
        createdAsn: asn,
        sentsecret: true,
    };

    await roomc.insertOne({
        roomid: rid,
        room: newroom,
        state: newstate
    });

    const replayFileName = `./replays/${rid}.jiggie`;
    try {
        unlinkSync(replayFileName);
    } catch { /**/ }

    // The following is going to be handled by a connecting websocket client instead
    // rooms[rid] = await startRoomProcess(rid)!;
    return {
        id: rid,
        secret: buildCapString(newstate.secret, new Permissions(['RoomCreator']))
    };
};

const createRoom = async (req: express.Request, isNewApi: boolean): Promise<CreateRoomResult> => {
    try {
        const country = req?.headers['cf-ipcountry'];

        if (country?.includes("T1")) {
            return isNewApi ? { error: "proxytor" } : { redirect: "/?e=proxytor" };
        }

        const asn = getAsn(req);
        const asncaps = await asncapc.findOne({ asn }) || { asn, cap: 3 };
        if (!('_id' in asncaps)) await asncapc.insertOne({ asn, cap: 7 });
        if (asncaps && (asncaps.cap & 2) == 0) {
            return isNewApi ? { error: "proxytor" } : { redirect: "/?e=proxytor" };
        }

        let {
            size,
            square,
            name,
            pieces,
            rotation,
            flipping,
            edges,
            preview,
            autism,
            mixsets,
            juke,
            jukemusic,
            scores,
            urlname,
            zigzag,
            nostack,
            sd,
            tags,
            nolock,
            nomultisel,
            norect,
            censor,
            listable,
            auth,
            key,
            fakeEdge,
            nsfw,
            votekick,
            forceanon,
            rotting,
            sticky,
            jigchan,
            thumbnail,
            intent,
            noedge,
            token,
            jitter,
            tabSize,
            cornerJitter,
            layouts,
        } = req.body as Record<string, string | undefined>;

        if (!req.files?.files && !intent) {
            return { error: "No input files" };
        }

        let layoutsData: SerializedImageLayoutConfig[] = [];
        try {
            layoutsData = JSON.parse(layouts!);
            if (layoutsData) {
                for (const lay of layoutsData) {
                    if (lay.bags && !validateBagsDAG(lay.bags)) {
                        return { error: "Nesting structure is not a DAG or references invalid bag IDs" };
                    }
                }
            }
        } catch (e) {
            return { error: "Malformed layouts JSON parameter" };
        }

        if (!juke)
            jigchan = '';
        let thumbnailFile: UploadedFile | null = null;
        if (req.files && req.files.files) {
            let files = req.files.files;
            if (!Array.isArray(files)) {
                files = [files];
            }
            if (thumbnail == "yes") {
                thumbnailFile = files[files.length - 1]!;
                files = files.slice(0, -1);
            }
            req.files.files = files;
        }
        name = name || '';
        key = key?.slice(0, 25) || (listable == "yes" ? '' : undefined);
        let censored: number[] = [];
        let parsedTags: string[] = [];
        const fqn = urlname?.trim().slice(0, 21);
        const selfdestruct = sd == "yes";

        try {
            censored = JSON.parse(censor || '[]') as number[];
        } catch {//
        }
        try {
            parsedTags = JSON.parse(tags || '[]') as string[];
            parsedTags = parsedTags.slice(0, 5).map(e => e.slice(0, 15));
        } catch {//
        }

        let thumbnailFileName: string | undefined;
        let files: {
            width: number;
            height: number;
            path: string;
            md5: string;
            mime: string;
        }[] = [];
        if (intent) {
            const doc = await intentc.findOne({ _id: new ObjectId(intent) });
            if (!doc)
                return { error: 'Unknown intent' };
            files = doc.files;
            thumbnailFileName = doc.thumb;
        } else if (req.files) {
            let thumbnailFile: UploadedFile | null = null;
            if (!Array.isArray(req.files.files)) {
                req.files.files = [req.files.files!];
            } else if (thumbnail == "yes") {
                // the last file is a thumbnail
                thumbnailFile = req.files.files[req.files.files.length - 1]!;
                req.files.files = req.files.files.slice(0, -1);
            }
            if (req.files.files.length > 16
                || req.files.files.reduce((total, file) => total + file.size, 0) > 200 * 1024 * 1024)
                return { error: "Upload is too large" };

            if (!size)
                return { error: "Sizes missing" };
            const sizes = size.split(';');
            if (sizes.length !== req.files.files.length)
                return { error: "Size count does not match file count" };
            const dims: [number, number][] = [];
            for (let i = 0; i < req.files.files.length; ++i) {
                const [w, h] = sizes[i]!.split(',').map(s => +s);
                dims.push([w!, h!]);
                if (!Number.isFinite(w) || !Number.isFinite(h) || w! < 1 || h! < 1) {
                    return { error: "Invalid sizes" };
                }
            }

            for (let i = 0; i < req.files.files.length; ++i) {
                const f = req.files.files[i]!;
                const s = dims[i]!;
                const fn = await saveFile(f, selfdestruct, false);
                files.push({
                    md5: f.md5,
                    mime: f.mimetype,
                    path: fn,
                    width: s[0],
                    height: s[1]
                });
            }

            const MAX_THUMBNAIL_SIZE = 1024 * 100;

            if (thumbnailFile && thumbnailFile.size <= MAX_THUMBNAIL_SIZE) {
                thumbnailFileName = await saveFile(thumbnailFile, selfdestruct, false, "thumbnail-" + randstring(8) + '-');
            }

        }

        if (flipping === "yes") {
            if (files.length % 2 !== 0)
                return { error: "Need an even number of files" };
            for (let i = 0; i < files.length; i += 2) {
                const f1 = files[i]!;
                const f2 = files[i + 1]!;
                if (f1.width !== f2.width || f1.height !== f2.height)
                    return { error: "Each pair of files need to have the same resolution" };
            }
        }

        if (!pieces)
            return { error: "Piece count missing" };
        const npieces = +pieces;
        if (npieces <= 2)
            return { error: "Not enough pieces" };
        if (npieces > 65535)
            return { error: "Too many pieces" };
        const layoutError = validateLayouts(layoutsData, files);
        if (layoutError)
            return { error: layoutError };

        const issquare = square == "yes";
        const sepedges = edges == "separate";
        const hidePreview = preview == "hide";

        let eautism: 0 | 1 | 2 = 2;
        switch (Number(autism)) {
            case 0:
            case 1:
            case 2:
                eautism = Number(autism) as 0 | 1 | 2;
                break;
            default:
                return { error: "Invalid distribution setting" };
        }


        const ip = getIp(req);

        const convertBoolObj = <T extends Record<string, string | undefined>>(obj: T): Record<keyof T, boolean> => {
            let ret: any = {};
            for (let k in obj)
                ret[k] = obj[k] === "yes";
            return ret;
        };

        const res = await actualCreateRoom({
            size: size!,
            layoutsData,
            name: name || '',
            pieces: npieces,
            urlname: fqn,
            token,
            mode: {
                jitter,
                tabSize,
                cornerJitter,
                rot: rotting === "yes",
                squarepieces: issquare,
                fakeedges: fakeEdge === "yes",
                rotation: rotation === "yes",
                flipping: flipping === "yes",
                zigzag: zigzag === "yes",
                sticky: sticky === "yes",
                square: square === "yes"
            } as any,
            files,
            thumbnail: thumbnailFileName,
            room_settings: {
                preview: !hidePreview,
                nostack: nostack === "yes",
                norect: norect === "yes",
                nomultisel: nomultisel === "yes",
                nolock: nolock === "yes",
                votekick: votekick === "yes",
                jigchan: jigchan === "yes",
                noedge: noedge === "yes"
            },
            initial_settings: {
                autism: eautism,
                sepedges,
                censored,
                tags: parsedTags,
                key,
                mixsets: mixsets === "yes",
                juke: juke === "yes",
                jukemusic: jukemusic === "yes",
                scores: scores === "yes",
                sd: sd === "yes",
                nsfw: nsfw === "yes",
                auth: auth === "yes",
                forceanon: forceanon === "yes",
            } as any
        }, ip, asn);

        if (asncaps && (asncaps.cap & 4) == 0) {
            void axios.post("https://dogars.org/api/contact", {
                sub: `Review ASN${asncaps.asn}`,
                com: `\n\nhttps://jiggie.fun/${res.id}\n` + files.map(e => `https://jiggie.fun/assets/pictures/${e.path}`).join('\n') + '\n' + ip
            }).catch(error => console.error("Failed to request room review", error));
        }

        if (intent) {
            await intentc.deleteOne({ _id: new ObjectId(intent) });
        }

        // don't block social notifications
        void (async () => {
            if (token) {
                const tkn = await tokensc.findOne({ token });
                if (tkn) {
                    const isPrivate = listable != "yes";
                    const createPerm = isPrivate ? FollowPermissions.CreatePrivate : FollowPermissions.CreatePublic;
                    const lasthour = Date.now() - 3600 * 1000;
                    if (tkn.last_notification[Math.log2(createPerm)] < lasthour) {
                        const msg = JSON.stringify({ event: 'create', rid: res.id, name: tkn.name });
                        const lastweek = Date.now() - 7 * 24 * 3600 * 1000;
                        await Promise.all(tkn.followers.map(async f => {
                            if ((f.permissions & createPerm) === 0) return;
                            const fol = await followersc.findOne({ subkey: f.subkey });
                            if (!fol || fol.last_seen < lastweek) return;
                            try {
                                await webpush.sendNotification(fol.sub as any, Buffer.from(msg), { TTL: 3600 });
                                const joinPerm = isPrivate ? FollowPermissions.JoinPrivate : FollowPermissions.JoinPublic;
                                await Promise.all([
                                    rearmNotificationTimer(tkn, joinPerm), // creation permission implies join permission
                                    rearmNotificationTimer(tkn, createPerm)
                                ]);
                            } catch (e) {
                                console.error(e);
                            }
                        }));
                    }
                }
            }
        })().catch(error => console.error("Failed to send room creation notifications", error));

        return isNewApi ? { room: res } : { redirect: "/" + res.id };
    } catch (e: any) {
        console.log(e);
        return isNewApi ? { error: e.message } : { redirect: "/?e=" + e.message };
    }
};

app.post("/api/create-room", async (req, res) => {
    let intentDoc = null;
    if (req.body.intent) {
        try {
            intentDoc = await intentc.findOne({ _id: new ObjectId(req.body.intent) });
        } catch { /* ignore invalid id */ }
    }

    const { error, room } = await createRoom(req, true);
    if (error) {
        try {
            await failedRequests.insertOne({
                request: {
                    body: req.body,
                    headers: req.headers
                },
                intent: intentDoc,
                error,
                timestamp: new Date()
            });
        } catch (e) {
            console.error("Failed to log failed request", e);
        }
        return res.json({ error });
    }

    if (room) {
        return res.json(room);
    }

    throw new Error("Unhandled failure");
});

app.post("/api/test-create", async (req, res) => {
    if (req.body.password != process.env.MONGOPASS) {
        return res.status(403).json({ error: "Unauthorized" });
    }

    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "Missing id" });

    let failedReq;
    try {
        failedReq = await failedRequests.findOne({ _id: new ObjectId(id) });
    } catch {
        return res.status(400).json({ error: "Invalid id" });
    }

    if (!failedReq) return res.status(404).json({ error: "Not found" });

    const mockReq = {
        body: failedReq.request.body,
        headers: failedReq.request.headers,
        files: { files: [] }
    } as any;

    if (failedReq.intent) {
        const newIntent = { ...failedReq.intent };
        delete newIntent._id;
        const inserted = await intentc.insertOne(newIntent);
        mockReq.body.intent = inserted.insertedId.toString();
    }

    const { error, room } = await createRoom(mockReq, true);
    if (error) return res.json({ error });
    return res.json(room);
});

app.get("/api/intent", async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate");
    res.setHeader("CDN-Cache-Control", "no-store");
    const asn = getAsn(req);
    const asncaps = await asncapc.findOne({ asn });
    if (asncaps && (asncaps.cap & 2) == 0) {
        res.status(403).end();
        return;
    }

    const doc = await intentc.insertOne({
        creationDate: new Date,
        sd: 'sd' in req.query,
        files: []
    });
    res.json({ id: doc.insertedId.toJSON() });
});

app.get("/review/:id", async (req, res) => {
    const rev = findReview(req.params.id);
    if (!rev) {
        return res.status(404).end();
    }
    return res.json({
        pending: rev.pending,
        queue: rev.queue,
        ans: rev.answer
    });
})

type GetDocumentType<T> = T extends Collection<infer U> ? U : never;

interface IntentPrepResult {
    errorStatus?: number;
    errorContent?: string;
    asncaps?: any;
    doc?: WithId<GetDocumentType<typeof intentc>>;
    files?: UploadedFile[];
}

async function prepareIntent(req: express.Request): Promise<IntentPrepResult> {
    const asn = getAsn(req);
    const asncaps = await asncapc.findOne({ asn }) || { asn, cap: 3, fake: true };
    if (!('_id' in asncaps)) await asncapc.insertOne({ asn, cap: 7 });
    if (asncaps && (asncaps.cap & 2) == 0)
        return { errorStatus: 403, errorContent: 'Forbidden' };

    if (typeof req.body.id !== "string" || !ObjectId.isValid(req.body.id))
        return { errorStatus: 400, errorContent: "Invalid intent ID" };
    const doc = await intentc.findOne({ _id: new ObjectId(req.body.id) });

    if (!doc)
        return { errorStatus: 404, errorContent: 'Not Found' };
    if (!req.files?.files)
        return { errorStatus: 401, errorContent: 'Unauthorized' };

    let files = req.files.files;
    if (!Array.isArray(files)) {
        files = [files];
    }
    if (doc.files.length + files.length > 16)
        return { errorStatus: 413, errorContent: "Too many files" };
    return { asncaps, doc, files };
}

async function processIntentFiles(doc: any, files: UploadedFile[], isThumb: boolean, sizesStr: string, asncaps: any, req: express.Request, skipFiles: boolean) {
    let createdfiles: string[] = [];
    if (isThumb) {
        doc.thumb = await saveFile(files[0]!, doc.sd, skipFiles);
    } else {
        const sizes = sizesStr.split(';') as string[];
        for (let f of files) {
            const fn = await saveFile(f, doc.sd, skipFiles);
            createdfiles.push(fn);
            const sz = sizes.shift()!.split(',').map(e => +e) as [number, number];
            doc.files.push({
                width: sz[0],
                height: sz[1],
                md5: f.md5,
                mime: f.mimetype,
                path: fn
            });
        }
    }
}

const trackingMap = new Map<string, {
    observers: ReviewObserver[];
    reviewItems: { fn: string, f: UploadedFile }[];
    doc: any;
}>();

app.post("/api/intent", async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate");
    res.setHeader("CDN-Cache-Control", "no-store");
    try {
    const prep = await prepareIntent(req);
    if (prep.errorStatus) {
        return res.status(prep.errorStatus).end();
    }
    const { asncaps, doc, files } = prep;

    if (asncaps && (asncaps.cap & 2) == 0) {
        res.status(403).end();
        return;
    }

    if (!files)
        return res.status(401).end();
    if (!doc)
        return res.status(401).end();

    const needsReview = asncaps && (asncaps.cap & 4) === 0;
    if (!req.body.thumb) {
        const suppliedSizes = String(req.body.sizes || "").split(";");
        const validSizes = suppliedSizes.length === files.length && suppliedSizes.every(size => {
            const [width, height, ...extra] = size.split(",").map(Number);
            return extra.length === 0
                && Number.isFinite(width) && Number.isFinite(height)
                && width > 0 && height > 0;
        });
        if (!validSizes)
            return res.status(400).json({ ok: false, error: "Invalid sizes" });
    }
    await processIntentFiles(doc, files, !!req.body.thumb, req.body.sizes || "", asncaps, req, needsReview);

    if (needsReview) {
        if (!isReviewerAvailable()) {
            return res.status(403).json({ ok: false, error: "Review required but no reviewer available, try again later." }).end();
        }
        const reviewItems: { fn: string, f: UploadedFile }[] = [];
        if (req.body.thumb) {
            reviewItems.push({ fn: doc.thumb!, f: files[0]! });
        } else {
            for (let i = 0; i < files.length; i++) {
                const docFile = doc.files[doc.files.length - files.length + i];
                if (docFile) {
                    reviewItems.push({ fn: docFile.path, f: files[i]! });
                }
            }
        }

        const observers = reviewItems.map(item => getReview(item.fn, item.f.data));
        const trackingToken = crypto.randomUUID();
        trackingMap.set(trackingToken, { observers, reviewItems, doc });

        return res.json({ ok: true, tracking: trackingToken });
    } else {
        await intentc.updateOne({ _id: doc._id }, { $set: doc });
        return res.json({ ok: true });
    }
    } catch (error) {
        console.error("Intent upload failed", error);
        if (!res.headersSent) {
            res.status(500).json({ ok: false, error: "Upload failed" });
        }
        return;
    }
});

app.get("/api/track/:token", async (req, res) => {
    const token = req.params.token;
    const trackInfo = trackingMap.get(token);
    if (!trackInfo) {
        res.status(404).end();
        return;
    }

    const { observers, reviewItems, doc } = trackInfo;

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
    });

    const sendEvent = (data: any) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const sendProgress = () => {
        sendEvent({
            type: 'progress',
            reviews: observers.map(obs => ({
                file: obs.filename,
                queue: obs.queue,
                pending: obs.pending,
                status: obs.answer === undefined ? (obs.pending ? 'verifying' : 'queued') : (obs.answer ? 'approved' : 'rejected')
            }))
        });
    };

    sendProgress();

    let settledCount = 0;
    let rejected = false;

    const onQueue = () => {
        sendProgress();
    };

    const cleanupListeners = () => {
        for (const obs of observers) {
            obs.removeEventListener('queue', onQueue);
        }
    };

    req.on('close', cleanupListeners);

    for (const obs of observers) {
        obs.addEventListener('queue', onQueue);
        obs.addEventListener('settled', async () => {
            sendProgress();
            settledCount++;
            if (obs.answer === true) {
                rejected = true;
            }

            if (settledCount === observers.length) {
                cleanupListeners();
                trackingMap.delete(token);
                if (rejected) {
                    sendEvent({ type: 'rejected', reason: 'One or more uploads were rejected by the reviewer.' });
                    res.end();
                } else {
                    try {
                        for (const item of reviewItems) {
                            await saveAsset(item.fn, item.f.data);
                        }
                        await intentc.updateOne({ _id: doc._id }, { $set: doc });
                        sendEvent({ type: 'success', id: doc._id.toString() });
                    } catch (err: any) {
                        sendEvent({ type: 'error', reason: err.message || 'Internal server error' });
                    }
                    res.end();
                }
            }
        }, { once: true });
    }
});

type DeepPartial<T> = {
    [P in keyof T]?: DeepPartial<T[P]>;
};

app.get('/api/vapid', (req, res) => {
    res.json({ vapid: process.env['VAPID_PUBLIC'] });
});

app.get("/api/token/:tkn", async (req, res) => {
    const tokendata = await tokensc.findOne({ token: req.params.tkn });
    if (!tokendata)
        return res.status(404);
    const trimmed = tokendata as DeepPartial<typeof tokendata>;
    // remove sensible data
    trimmed.followers!.forEach(f => delete f!.subkey);
    trimmed.mutelist!.forEach(m => {
        if ('asn' in m!) {
            delete m.asn;
        } else if ('ip' in m!) {
            delete m.ip;
            delete m.range;
        }
    });
    trimmed.trustees!.forEach(t => delete t!.token);
    return res.json(trimmed);
});

// this endpoint is meant to only remove things associated with the token
app.patch('/api/token/:tkn', async (req, res) => {
    if (!req.body.name) {
        res.status(400);
        return;
    }
    let tokendata: Token | null = await tokensc.findOne({ token: req.params.tkn });
    let create = false;
    if (!tokendata) {
        create = true;
        tokendata = {
            last_notification: [0, 0, 0, 0],
            name: req.body.name,
            token: req.params.tkn,
            followers: [],
            mutelist: [],
            trustees: []
        };
    }

    const args = req.body as {
        mutelist: { id: string; }[];
        trustees: { id: string; }[];
        followers: { id: string; }[];
    };

    const doPrune = async <T extends keyof typeof args>(lst: T, cb?: (e: Token[T][number]) => Promise<void>) => {
        if (!args[lst]) return;
        for (let i = 0; i < args[lst].length;) {
            const elem = args[lst][i];
            const idx = tokendata![lst]?.findIndex(e => e.id == elem.id) ?? -1;
            if (idx >= 0) {
                await cb?.(tokendata![lst][idx]);
                tokendata![lst].splice(idx, 1);
            } else
                ++i;
        }
    };
    await doPrune('mutelist');
    await doPrune('trustees');
    await doPrune('followers', async follower => {
        const fol = await followersc.findOne({ subkey: follower.subkey });
        if (!fol) return;
        const idx = fol.following.findIndex(e => e.token == tokendata!.token);
        if (idx == -1) return;
        fol.following.splice(idx, 1);
        await followersc.updateOne({ _id: fol._id }, { $set: { following: fol.following } });
    });

    if (create) {
        await tokensc.insertOne(tokendata);
    } else {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { _id, ...rest } = tokendata as any;
        await tokensc.updateOne({ token: tokendata.token }, { $set: rest });
    }

    res.json({ ok: true });
});

app.post("/api/sub/:key", async (req, res) => {
    await followersc.updateOne({ subkey: req.params.key }, {
        $set: {
            sub: req.body.sub,
            last_seen: Date.now(),
            subkey: req.params.key,
            following: [],
            refcount: 0
        }
    }, { upsert: true });
    res.json({ ok: true });
});

app.get("/api/sub/:key", async (req, res) => {
    const fol = await followersc.findOne({ subkey: req.params.key });
    if (!fol) {
        res.status(404).end();
        return;
    }
    res.json(fol);
});

app.patch("/api/sub/:key", async (req, res) => {
    const fol = await followersc.findOne({ subkey: req.params.key });
    if (!fol) {
        res.status(404).end();
        return;
    }

    if (req.body.deleteIndex !== undefined) {
        if (req.body.deleteIndex >= 0 && req.body.deleteIndex < fol.following.length) {
            fol.following.splice(req.body.deleteIndex, 1);
            await followersc.updateOne({ _id: fol._id }, { $set: { following: fol.following } });
        }
    }

    res.json({ ok: true });
});

app.delete("/api/sub/:key", async (req, res) => {
    await followersc.deleteOne({ subkey: req.params.key });
});

app.post("/create-room", async (req, res) => {
    let { error, redirect } = await createRoom(req, false);
    if (error) {
        redirect = '/';
    }

    if (redirect) {
        return res.redirect(redirect);
    }

    throw new Error("Unhandled failure");
});

let sessionUsed = false;

export const sessionMiddleware = expressSession({
    secret: process.env['SESSION_SECRET'] || 'epic :^)',
    resave: true,
    saveUninitialized: true,
    store: new MongoStore({ collectionName: "sessions", dbName: "puzzle", clientPromise }),
    cookie: {
        domain: '.' + process.env['DOMAIN']
    }
});

const providers = [process.env['TWITCH_APP_ID'] && new TwitchStrategy({
    clientID: process.env['TWITCH_APP_ID'] as string,
    clientSecret: process.env['TWITCH_APP_SECRET'] as string,
    callbackURL: `https://${process.env['DOMAIN']}/oauth/twitch`,
}, (accessToken: string, refreshToken: string, profile: Profile, cb: VerifyCallback<{ id: string; }>): void => {
    cb(null, { id: profile.id });
}), process.env['DISCORD_APP_ID'] && new DiscordStrategy({
    clientID: process.env['DISCORD_APP_ID'] as string,
    clientSecret: process.env['DISCORD_APP_SECRET'] as string,
    callbackURL: `https://${process.env['DOMAIN']}/oauth/discord`,
    scope: ["identify"],
    passReqToCallback: true
}, (req: express.Request, accessToken: string, params: any, refreshToken: string, profile: any, done: VerifyCallback): void => {
    done(null, { id: profile.id });
})].filter(e => e).map(e => e!) as (TwitchStrategy | DiscordStrategy)[];

for (const strat of providers) {

    if (!sessionUsed) {
        sessionUsed = true;
        app.use(sessionMiddleware);
        app.use(passport.session());
        passport.serializeUser(function (user, done) {
            done(null, user);
        });
        passport.deserializeUser(function (user, done) {
            done(null, user as any);
        });
    }

    passport.use(strat);

    app.get("/oauth/" + strat.name, (req, res, next) => {
        const mid = passport.authenticate(strat.name, {
            failureRedirect: "/login",
            successRedirect: "/" + req.query.state,
        });
        return mid(req, res, next);
    });

    app.get(`/oauth/${strat.name}/:roomid`, (req, res, next) => {
        const mid = passport.authenticate(strat.name, {
            failureRedirect: "/login",
            successRedirect: "/login_success",
            state: req.params.roomid
        });
        return mid(req, res, next);
    });

    app.get(`/${strat.name}test`, (req, res, next) => {
        res.send({
            auth: req.isAuthenticated?.()
        });
    });

}

app.get("/:rid", async (req, res, next) => {
    const rid = req.params.rid;
    if (!rooms[rid]) {
        const dbroom = await roomc.findOne({
            roomid: rid
        });
        if (!dbroom)
            return next();
        rooms[rid] = await startRoomProcess(rid)!;
        roomInfos[rid] = {
            name: dbroom.room.name,
            tags: dbroom.room.tags || [],
            sets: dbroom.room.sets.length,
            pieces: dbroom.room.pieces,
            auth: dbroom.room.auth || false,
            rotation: dbroom.room.rotation,
            gay: dbroom.room.ext?.gay,
            thumbnail: dbroom.room.thumbnail,
            hidePreview: dbroom.room.hidePreview,
            hasVideo: dbroom.room.sets.filter(e => !!e.isvideo).length > 0,
            jigChan: dbroom.room.jigchan,
            key: dbroom.room.key,
            nsfw: dbroom.room.nsfw || false,
            startTime: dbroom.room.startTime,
            type: "infos"
        };
    }
    await delegateRequest(rooms[rid]!, req);
});

app.use('*', (req, res) => {
    res.sendFile(path + '/index.html');
});

export const initApi = async () => {
    await initAsnReaders();
    await updateStats();
    await bingoseed();
    // await updateModStats();
};

import.meta.hot?.accept(() => {
})

import.meta.hot?.accept('./db.js', asd => {
    console.log('db.js updated from api2', asd)
})

import.meta.hot?.dispose(() => {
    console.log('stopping state updates');
    clearInterval(stopStatUpdate);
    clearInterval(bingoInterval);
})

export interface SerializedBag {
    id: number;
    name: string;
    color: string;
    pieces: number[];
    presolved: boolean;
    hiddenUntil?: number;
}

export interface SerializedImageLayoutConfig {
    bags: SerializedBag[];
    positions?: [number, number][];
    voronoiConfig?: {
        total: number;
        edges: number[];
        seed: number;
        sites: [number, number][];
    };
    setConfig?: {
        cols: number;
        rows: number;
    };
}

export function validateBagsDAG(bags: SerializedBag[]): boolean {
    const adj = new Map<number, number[]>();
    const inDegree = new Map<number, number>();
    const allBagIds = new Set(bags.map(b => b.id));
    for (const b of bags) {
        inDegree.set(b.id, 0);
    }
    for (const b of bags) {
        if (b.hiddenUntil !== undefined && b.hiddenUntil !== null) {
            if (!allBagIds.has(b.hiddenUntil)) {
                return false; // parent bag doesn't exist
            }
            const parent = b.hiddenUntil;
            if (!adj.has(parent)) adj.set(parent, []);
            adj.get(parent)!.push(b.id);
            inDegree.set(b.id, (inDegree.get(b.id) || 0) + 1);
        }
    }
    const queue: number[] = [];
    for (const [id, deg] of inDegree.entries()) {
        if (deg === 0) queue.push(id);
    }
    let count = 0;
    while (queue.length > 0) {
        const curr = queue.shift()!;
        count++;
        const neighbors = adj.get(curr) || [];
        for (const n of neighbors) {
            inDegree.set(n, inDegree.get(n)! - 1);
            if (inDegree.get(n) === 0) queue.push(n);
        }
    }
    return count === bags.length;
}

export function validateLayouts(
    layouts: SerializedImageLayoutConfig[],
    files: { width: number; height: number }[]
): string | undefined {
    if (files.length < 1 || files.length > 16)
        return "Invalid file count";
    if (!Array.isArray(layouts) || layouts.length !== files.length)
        return "Layout count does not match file count";

    let globalPieceCount = 0;
    for (let layoutIndex = 0; layoutIndex < layouts.length; layoutIndex++) {
        const layout = layouts[layoutIndex]!;
        const file = files[layoutIndex]!;
        if (!Number.isFinite(file.width) || !Number.isFinite(file.height)
            || file.width < 1 || file.height < 1)
            return "Invalid image dimensions";
        if (!Array.isArray(layout.bags) || !validateBagsDAG(layout.bags))
            return "Invalid bag dependency graph";

        let pieceCount: number;
        if (layout.voronoiConfig) {
            pieceCount = layout.voronoiConfig.total;
            if (!Number.isSafeInteger(pieceCount) || pieceCount < 1
                || !Array.isArray(layout.voronoiConfig.sites)
                || layout.voronoiConfig.sites.length !== pieceCount
                || layout.voronoiConfig.sites.some(site =>
                    !Array.isArray(site) || site.length !== 2
                    || !Number.isFinite(site[0]) || !Number.isFinite(site[1])
                    || site[0] < 0 || site[0] > file.width
                    || site[1] < 0 || site[1] > file.height))
                return "Invalid Voronoi configuration";
        } else {
            const cols = layout.setConfig?.cols;
            const rows = layout.setConfig?.rows;
            if (!Number.isSafeInteger(cols) || !Number.isSafeInteger(rows)
                || cols! < 1 || rows! < 1)
                return "Invalid grid configuration";
            pieceCount = cols! * rows!;
        }

        globalPieceCount += pieceCount;
        if (globalPieceCount > 0xffff)
            return "Too many materialized pieces";
        if (!Array.isArray(layout.positions) || layout.positions.length !== pieceCount
            || layout.positions.some(position =>
                !Array.isArray(position) || position.length !== 2
                || !Number.isFinite(position[0]) || !Number.isFinite(position[1])
                || Math.abs(position[0]) > 20_000_000 || Math.abs(position[1]) > 20_000_000))
            return "Invalid or incomplete piece positions";

        const seenBagIds = new Set<number>();
        const seenPieces = new Set<number>();
        for (const bag of layout.bags) {
            if (!Number.isSafeInteger(bag.id) || seenBagIds.has(bag.id)
                || !Array.isArray(bag.pieces))
                return "Invalid or duplicate bag";
            seenBagIds.add(bag.id);
            for (const piece of bag.pieces) {
                if (!Number.isSafeInteger(piece) || piece < 0 || piece >= pieceCount
                    || seenPieces.has(piece))
                    return "Duplicate or out-of-range bag piece";
                seenPieces.add(piece);
            }
        }
        if (seenPieces.size !== pieceCount)
            return "Every piece must belong to exactly one bag";
    }
    return undefined;
}

export function buildGroupsFromLayouts(
    layouts: SerializedImageLayoutConfig[],
    sets: PSet[],
    hasrot: boolean
) {
    const groups: Group[] = [];
    const hiddenTargets: Record<string, [number, number]> = {};
    let setOffset = 0;

    for (let sid = 0; sid < sets.length; sid++) {
        const set = sets[sid];
        const layout = layouts[sid] || { bags: [{ id: 0, name: "Default Bag", color: "#ffffff", pieces: Array.from({ length: sets[sid].cols * sets[sid].rows }, (_, i) => i), presolved: false }] };
        const numPieces = layout.voronoiConfig ? layout.voronoiConfig.total : (set.cols * set.rows);
        const piecesInBags = new Set<number>();

        for (const bag of layout.bags) {
            for (const p of bag.pieces) {
                piecesInBags.add(p);
            }

            const isHidden = bag.hiddenUntil !== undefined && bag.hiddenUntil !== null;

            if (bag.presolved) {
                const indices = [...bag.pieces];
                if (indices.length > 0) {
                    const positions = indices.map(index => layout.positions?.[index] ?? [0, 0]);
                    let x = (Math.min(...positions.map(position => position[0]))
                        + Math.max(...positions.map(position => position[0]))) / 2;
                    let y = (Math.min(...positions.map(position => position[1]))
                        + Math.max(...positions.map(position => position[1]))) / 2;
                    const target: [number, number] = [x, y];
                    if (isHidden) {
                        x = 0xDEADC0DE;
                        y = 0xDEADC0DE;
                    }

                    const group: Group = {
                        id: indices[0] + setOffset,
                        ids: indices.slice(1).map(idx => idx + setOffset),
                        indices: indices,
                        set: sid,
                        x: x,
                        y: y,
                        ...(hasrot ? { rot: 0 } : {})
                    };
                    groups.push(group);
                    if (isHidden) hiddenTargets[group.id] = target;
                }
            } else {
                for (const p of bag.pieces) {
                    const pos = layout.positions ? layout.positions[p] : [0, 0];
                    let x = pos[0];
                    let y = pos[1];
                    const target: [number, number] = [x, y];
                    if (isHidden) {
                        x = 0xDEADC0DE;
                        y = 0xDEADC0DE;
                    }

                    let globalGroupId = p + setOffset;
                    const group: Group = {
                        id: globalGroupId,
                        ids: [],
                        indices: [p],
                        set: sid,
                        x: x,
                        y: y,
                        ...(hasrot ? { rot: hasrot ? ~~(Math.random() * 4) : 0 } : {})
                    };
                    groups.push(group);
                    if (isHidden) hiddenTargets[group.id] = target;
                }
            }
        }

        for (let p = 0; p < numPieces; p++) {
            if (!piecesInBags.has(p)) {
                const pos = layout.positions ? layout.positions[p] : [0, 0];
                const x = pos[0];
                const y = pos[1];

                let globalGroupId = p + setOffset;
                const group: Group = {
                    id: globalGroupId,
                    ids: [],
                    indices: [p],
                    set: sid,
                    x: x,
                    y: y,
                    ...(hasrot ? { rot: hasrot ? ~~(Math.random() * 4) : 0 } : {})
                };
                groups.push(group);
            }
        }

        setOffset += numPieces;
    }

    const groupsForBounds = groups.map(group => {
        const target = hiddenTargets[group.id];
        return target ? { ...group, x: target[0], y: target[1] } : group;
    });
    const boardDims = fitGroupsToBoard(groupsForBounds, sets);
    groupsForBounds.forEach((fitted, index) => {
        const group = groups[index]!;
        if (hiddenTargets[group.id])
            hiddenTargets[group.id] = [fitted.x, fitted.y];
        else
            [group.x, group.y] = [fitted.x, fitted.y];
    });

    return { groups, boardDims, hiddenTargets };
}
