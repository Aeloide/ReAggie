#!/bin/bun

import { existsSync, readFileSync, writeFileSync } from "fs";
import type { Group, Room, User } from "./src/types";
import { resolve } from "path";
import sharp from 'sharp';
import jsdom from "jsdom"
import { clamp, extractFromArray } from "./src/utils";

const wstarget = `wss://ws.jiggie.fun/ws`;

const getUrl = (s: string) => `https://jiggie.fun${s}`;

const MAX_GLOBAL_CHAT_LOG = 5000;
const MAX_ROOM_CHAT_LOG = 200;
const PIECES_PER_SET = 120;
const SET_COUNT = 24;
const SALUTATION_THRESHOLD_ROOMS = 5;
const MERGE_THRESHOLD_FOR_SALUTATION = 10;
const MENTION_LIMIT_PER_ROOM = 5;
const STATE_FILE_PATH = "_state.json";
const CONNECTION_TIMEOUT_MS = 15000; // 15 seconds for WebSocket connection attempt

// --- Restored Interfaces and Classes ---
interface CreateRoomResult {
    room?: { id: string; secret: string; }; // 'id' here is the room's unique identifier/URL suffix
    error?: string;
}

interface MessageHandler {
    handle(cmd: jsonObj): void;
    handleB(cmd: binaryObj): void;
}


type ContentPart =
    | { text: string }
    | { functionCall: { name: string, args: any } }
    | { functionResponse: { name: string, response: any } };

type Content = {
    role: "user" | "model" | "function";
    parts: ContentPart[];
};

type ToolDeclaration = {
    functionDeclarations: {
        name: string;
        description: string;
        parameters: {
            type: string;
            properties: any;
            required?: string[];
        };
    }[];
};

async function callGeminiAgent(
    apiKey: string,
    systemPrompt: string,
    history: Content[],
    tools: ToolDeclaration[],
    lite = true): Promise<ContentPart[] | null> {
    if (!apiKey) {
        console.warn("Gemini API key not available.");
        return null;
    }
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${lite ? 'gemini-2.5-flash-lite' : 'gemini-2.5-flash'}:generateContent?key=${apiKey}`;

    const requestBody: any = {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: history,
        tools: tools,
    };

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });
        const responseBodyText = await response.text();

        if (!response.ok) {
            console.error("Gemini API error:", response.status, responseBodyText);
            return null;
        }
        const result = JSON.parse(responseBodyText);
        if (result.candidates && result.candidates.length > 0 &&
            result.candidates[0].content && result.candidates[0].content.parts) {
            return result.candidates[0].content.parts;
        } else {
            console.error("Gemini API response structure unexpected:", JSON.stringify(result, null, 2));
            return null;
        }
    } catch (error) {
        console.error("Error calling Gemini API:", error);
        return null;
    }
}


class Listable<T extends File> {
    constructor(private arr: T[] = []) { }
    item(i: number): T | null {
        return this.arr[i] || null;
    }
    get length() {
        return this.arr.length;
    }
    [Symbol.iterator](): IterableIterator<T> {
        return this.arr[Symbol.iterator]();
    }
}
// --- End Restored ---


interface BooruTags {
    includeTags: string[];
    excludeTags: string[];
}

interface BooruImage {
    filename: string;
    source?: string;
    md5: string;
    file_url: string;
    tags_string: string;
    tags_array: string[];
    // removed to avoid needing to make another request per image, will read that from the file later instead.
    // dimensions: { width: number; height: number; };
    rating: string;
}

const COMMON_EXCLUDED_TAGS = ["white_background", "transparent_background", "simple_background", "monochrome", "greyscale", "video", "yaoi", "male_focus"];

async function generateThumbnail(
    imageBuffer: ArrayBuffer,
    targetWidth: number,
    targetHeight: number,
    options?: {
        format?: keyof sharp.FormatEnum; // 'jpeg', 'png', 'webp', 'avif', 'gif', 'tiff' etc.
        quality?: number; // 1-100
        fit?: keyof sharp.FitEnum; // 'cover', 'contain', 'fill', 'inside', 'outside'
    }
): Promise<Blob | undefined> {
    try {
        const image = sharp(Buffer.from(imageBuffer)); // Sharp works with Buffers

        const resizeOptions: sharp.ResizeOptions = {
            width: targetWidth,
            height: targetHeight,
            fit: options?.fit || 'cover',
        };
        image.resize(resizeOptions);

        const outputFormat = options?.format || 'png';
        let mimeType = `image/${outputFormat}`;

        const sharpFormatOptions: any = {}; // To hold format-specific options

        if (outputFormat === 'jpeg') {
            sharpFormatOptions.quality = options?.quality === undefined ? 80 : options.quality;
            mimeType = 'image/jpeg';
        } else if (outputFormat === 'webp') {
            sharpFormatOptions.quality = options?.quality === undefined ? 80 : options.quality;
            mimeType = 'image/webp';
        } else if (outputFormat === 'png') {
            sharpFormatOptions.compressionLevel = options?.quality !== undefined ? Math.max(0, Math.min(9, Math.round(options.quality / 10))) : 6;
            mimeType = 'image/png';
        } else if (outputFormat === 'avif') {
            sharpFormatOptions.quality = options?.quality === undefined ? 50 : options.quality;
            mimeType = 'image/avif';
        }

        const thumbnailBuffer = await image.toFormat(outputFormat, sharpFormatOptions).toBuffer();
        return new Blob([thumbnailBuffer.buffer as ArrayBuffer], { type: mimeType });

    } catch (error) {
        console.error("Thumbnail generation with sharp failed:", error);
        return undefined;
    }
}

async function scrapeSafebooru(
    includeTags: string[],
    excludeTags: string[],
    count: number,
    existingMd5s: Set<string> = new Set()
): Promise<BooruImage[]> {
    const baseUrl = "https://safebooru.org/index.php?page=dapi&s=post&q=index&json=1";
    const allExcludeTags = [...new Set([...COMMON_EXCLUDED_TAGS, ...excludeTags])];
    const tagsQuery = [...includeTags, ...allExcludeTags.map(t => `-${t}`)].join(" ");

    let images: BooruImage[] = [];
    let pid = 0;
    const limitPerRequest = Math.min(count * 3, 100);

    console.log(`Safebooru: Searching for "${tagsQuery}", need ${count} new images.`);

    while (images.length < count && pid < 10) {
        const queryUrl = `${baseUrl}&tags=${encodeURIComponent(tagsQuery)}&pid=${pid}&limit=${limitPerRequest}`;
        try {
            const response = await fetch(queryUrl);
            if (!response.ok) {
                console.error(`Safebooru API error: ${response.status} ${await response.text()}`);
                break;
            }
            const results = await response.json();
            if (!Array.isArray(results)) {
                console.log("Safebooru: No results or unexpected format for this page.", results);
                break;
            }

            for (const item of results) {
                if (item.hash && !existingMd5s.has(item.hash) && !images.some(img => img.md5 === item.hash)) {
                    const tags_array = item.tags.split(" ").filter(Boolean);
                    images.push({
                        filename: item.image,
                        source: item.source,
                        md5: item.hash,
                        file_url: `https://safebooru.org/images/${item.directory}/${item.image}`,
                        tags_string: item.tags,
                        tags_array: tags_array,
                        // dimensions: { width: item.width, height: item.height },
                        rating: item.rating,
                    });
                    if (images.length >= count) break;
                }
            }
            if (results.length < limitPerRequest || images.length >= count) break;
            pid++;
        } catch (error) {
            console.error("Error scraping Safebooru:", error);
            break;
        }
    }
    return images.slice(0, count);
}

type GelbooruScrapResult = {
    post: {
        md5: string,
        tags: string,
        source: string;
        image: string,
        file_url: string,
        width: number,
        height: number,
        rating: string
    }[]
}

async function gelbooruScrapeHTML(s: string): Promise<GelbooruScrapResult> {
    const dom = new jsdom.JSDOM(s);
    const nodes = dom.window.document.querySelectorAll('a[id^=p]');

    const res: GelbooruScrapResult['post'] = [];
    const proms = ([...nodes].map(async node => {
        const img = node.querySelector('img')
        const hashfn = img?.src?.match(/[a-f0-9]{32}\.....?/)?.at(0);
        const server = img?.src?.match(/img[0-9]?/)?.at(0);
        if (!hashfn) return;
        const hash = hashfn.match(/[a-f0-9]{32}/)?.at(0) || '';
        const tags = img?.title || '';
        const url = (node as HTMLAnchorElement).href;
        const req = await fetch(url, {
            headers: {
                cookie: 'fringeBenefits=yup'
            }
        });

        const dom2 = new jsdom.JSDOM(await req.text());
        const file_url = (dom2.window.document.querySelector('meta[name="twitter:image"]') as HTMLMetaElement).content;
        const source = (dom2.window.document.querySelector('a[rel=nofollow]') as HTMLAnchorElement)?.href;
        res.push({
            md5: hash,
            tags,
            rating: 'rating:explicit',
            image: hashfn,
            width: 0,
            height: 0,
            source: source || url,
            file_url,
        })
    }))
    await Promise.all(proms);
    return { post: res };
}

async function scrapeGelbooru(
    includeTags: string[],
    excludeTags: string[],
    count: number,
    existingMd5s: Set<string> = new Set()
): Promise<BooruImage[]> {
    const baseUrl = "https://gelbooru.com/index.php?page=post&s=list";
    const allIncludeTags = [...includeTags];
    if (!includeTags.some(t => t.startsWith("rating:"))) {
        allIncludeTags.push("rating:explicit");
    }

    const allExcludeTags = [...new Set([...COMMON_EXCLUDED_TAGS, ...excludeTags])];
    const tagsQuery = [...allIncludeTags, ...allExcludeTags.map(t => `-${t}`)].join(" ");

    let images: BooruImage[] = [];
    let pid = 0;
    // const limitPerRequest = Math.min(count * 3, 100);
    const limitPerRequest = 42;

    console.log(`Gelbooru: Searching for "${tagsQuery}", need ${count} new images.`);

    while (images.length < count && pid < 10) {
        const queryUrl = `${baseUrl}&tags=${encodeURIComponent(tagsQuery)}&pid=${pid}`;
        try {
            const response = await fetch(queryUrl, {
                headers: {
                    cookie: 'fringeBenefits=yup'
                }
            });
            // console.log(await response.text())
            if (!response.ok) {
                console.error(`Gelbooru API error: ${response.status} ${await response.text()}`);
                break;
            }
            const resultsData = await gelbooruScrapeHTML(await response.text());
            const results = resultsData.post || [];

            if (!Array.isArray(results) || results.length === 0) {
                console.log("Gelbooru: No results for this page.");
                break;
            }

            for (const item of results) {
                if (item.md5 && !existingMd5s.has(item.md5) && !images.some(img => img.md5 === item.md5)) {
                    const tags_array = item.tags.split(" ").filter(Boolean);
                    images.push({
                        filename: item.image,
                        source: item.source,
                        md5: item.md5,
                        file_url: item.file_url,
                        tags_string: item.tags,
                        tags_array: tags_array,
                        // dimensions: { width: item.width, height: item.height },
                        rating: item.rating,
                    });
                    if (images.length >= count) break;
                }
            }
            if (results.length === 0 || images.length >= count) break;
            pid += results.length; // pid is a post offset when in html mode, or a page number in json api mode
        } catch (error) {
            console.error("Error scraping Gelbooru:", error);
            break;
        }
    }
    return images.slice(0, count);
}

interface JigChanUserProfile {
    id: number;
    name: string;
    color: string;
    roomAppearances: string[];
    messageCountTotal: number;
    firstSeenMs: number;
    lastSeenMs: number;
    characterSheet?: string;
    trustLevel?: 'high' | 'medium' | 'low' | 'unknown';
    speakingPatternNotes?: string;
    lastSalutedTimestampByName: number;
    mentionCountInCurrentRoom: number;
    lastRoomIdWithMentionCount?: string;
    mergeCountInCurrentRoom: number;
    lastRoomIdWithMergeCount?: string;
}

interface JigChanActiveRoomState {
    id: string;
    secret: string;
    imageMetadata: Record<string, BooruImage>;
    userList: User[];
    chatMessagesThisRoom: Extract<jsonObj, { type: "chat"; }>[];
    joinTimestamp?: number;
    sent85pctMessage?: boolean;
    triggered95pctCreation?: boolean;
}

interface JigChanState {
    activeRoom?: JigChanActiveRoomState;
    preparedNextRoom?: JigChanActiveRoomState;
    usedMd5Hashes: string[];
    userProfiles: { [userId: string]: JigChanUserProfile; };
    globalChatLog: Extract<jsonObj, { type: "chat"; }>[];
    createdRooms: number;
    jigChanSettings: {
        name: string,
        systemPrompt: string;
        booruType: 'safebooru' | 'gelbooru';
        geminiApiKey: string;
        chatInteractionFrequency: number;
        massMoveThreshold: number;
    };
}

const appendBoolValue = (
    formData: FormData,
    key: string,
    val: boolean,
    trueValue: string = "yes"
) => {
    if (val) {
        formData.append(key, trueValue);
    }
};


export interface RoomSettings {
    pieces: number;
    rotation: boolean;
    edges: boolean;
    preview: boolean;
    votekick: boolean;
    mixsets: boolean;
    juke: boolean;
    square: boolean;
    scores: boolean;
    zigzag: boolean;
    fakeEdge: boolean;
    nomultisel: boolean;
    nolock: boolean;
    norect: boolean;
    nostack: boolean;
    auth: boolean;
    sd: boolean;
    autism: number;
    nsfw: boolean;

    listable: boolean;
    secretkey?: string;
    jukemusic: boolean;
    tags?: string[];
    forceanon: boolean;
    rotting: boolean;
    sticky: boolean;
    jigchan: boolean;
}

export interface CreateRoomSubmitParams {
    name: string;
    urlname: string;
    censor: string;
    size: string;
    files?: FileList | Listable<File>;
    thumbnail?: Blob;
}

const createRoom = async (
    params: CreateRoomSubmitParams,
    settings: RoomSettings
): Promise<CreateRoomResult> => {
    const formData = new FormData();
    formData.append("name", params.name || "New room");
    formData.append("urlname", params.urlname);
    formData.append("censor", params.censor);
    formData.append("size", params.size);
    formData.append("pieces", settings.pieces.toString());
    appendBoolValue(formData, "rotation", settings.rotation);
    appendBoolValue(formData, "edges", settings.edges, "separate");
    appendBoolValue(formData, "preview", settings.preview, "hide");
    appendBoolValue(formData, "votekick", settings.votekick);
    appendBoolValue(formData, "mixsets", settings.mixsets);
    appendBoolValue(formData, "juke", settings.juke);
    appendBoolValue(formData, "square", settings.square);
    appendBoolValue(formData, "scores", settings.scores);
    appendBoolValue(formData, "zigzag", settings.zigzag);
    appendBoolValue(formData, "fakeEdge", settings.fakeEdge);
    appendBoolValue(formData, "nomultisel", settings.nomultisel);
    appendBoolValue(formData, "nolock", settings.nolock);
    appendBoolValue(formData, "norect", settings.norect);
    appendBoolValue(formData, "nostack", settings.nostack);
    appendBoolValue(formData, "auth", settings.auth);
    appendBoolValue(formData, "sd", settings.sd);
    appendBoolValue(formData, "nsfw", settings.nsfw);
    appendBoolValue(formData, "forceanon", settings.forceanon || false);
    appendBoolValue(formData, "rotting", settings.rotting || false);
    appendBoolValue(formData, "sticky", settings.sticky || false);
    appendBoolValue(formData, "jigchan", settings.jigchan || false);
    formData.append("autism", settings.autism.toString());

    appendBoolValue(formData, "listable", settings.listable);
    formData.append("tags", JSON.stringify(settings.tags || []));
    if (settings.listable && settings.secretkey) {
        formData.append("key", settings.secretkey);
    }
    const fetchForm = (url: string, data: FormData) => fetch(url, {
        method: 'post',
        body: data
    });
    async function doCreateRoom() {
        const response = await fetchForm(getUrl("/api/create-room"), formData);
        if (!response.ok) {
            const errorText = await response.text();
            console.error("Failed to create room:", response.status, errorText);
            let errorReason = "Unknown error during room creation";
            try {
                const errorJson = JSON.parse(errorText);
                errorReason = errorJson.error || errorJson.message || errorReason;
            } catch (e) { /* ignore parsing error */ }
            return { error: getErrorMessage(errorReason) };
        }
        return response.json();
    }

    try {
        const intent = (await (await fetch(getUrl('/api/intent' + (settings.sd ? '?sd' : '')))).json()).id as string;

        const filesToUpload: File[] = [];
        if (params.files) {
            if (params.files instanceof Listable) {
                for (const file of params.files) {
                    filesToUpload.push(file);
                }
            } else {
                for (let i = 0; i < params.files.length; i++) {
                    const file = params.files.item(i);
                    if (file) filesToUpload.push(file);
                }
            }
        }

        let dims = params.size.split(';');
        for (let i = 0; i < filesToUpload.length; ++i) {
            const f = filesToUpload[i];
            const intentFormData = new FormData();
            intentFormData.append("id", intent);
            intentFormData.append("sizes", dims[i]);
            intentFormData.append("files", f, f.name);
            await fetchForm(getUrl("/api/intent"), intentFormData);
        }

        if (params.thumbnail) {
            const tformData = new FormData();
            tformData.append("id", intent);
            tformData.append("thumb", 'true');
            tformData.append("files", params.thumbnail, "thumbnail.png");
            await fetchForm(getUrl("/api/intent"), tformData);
            appendBoolValue(formData, "thumbnail", true);
        }
        formData.append("intent", intent);

        const res = await doCreateRoom();
        if (res.error) return { error: res.error };
        return { room: { id: res.id, secret: res.secret } };
    } catch (error) {
        console.error("Error in createRoom parameter preparation or API call:", error);
        return { error: (error as any).error || getErrorMessage("Network failure") };
    }
};

const getErrorMessage = (errorCode: string | undefined) => {
    if (!errorCode) {
        return "Unknown error";
    }
    switch (errorCode) {
        case "already_exists":
        case "EEXISTS":
            return "This name is already in use...";
        case "proxytor":
            return "Proxy/VPN/Tor detected, contact me if you believe this is a mistake.";
        default:
            return "Error: " + errorCode;
    }
};

function getCommonTagsFromBooruImages(booruImages: BooruImage[], count: number): string[] {
    const tagFrequencies: { [tag: string]: number; } = {};
    booruImages.forEach(img => {
        img.tags_array.forEach(tag => {
            if (tag.length > 2 && !tag.includes(':')) {
                tagFrequencies[tag] = (tagFrequencies[tag] || 0) + 1;
            }
        });
    });
    return Object.entries(tagFrequencies)
        .sort(([, aFreq], [, bFreq]) => bFreq - aFreq)
        .slice(0, count)
        .map(([tag]) => tag);
}


export enum ROTATION {
    NORTH = 0, EAST = 1, SOUTH = 2, WEST = 3,
}
export enum CMD_TYPE {
    PICK = 0x1, MOVE = 0x2, DROP = 0x3, SELECT = 0x4, DESELECT = 0x5, MERGE = 0x6, ROTATE = 0x7,
    LOCK = 0x8, UNLOCK = 0x9, STEAL = 0xA, FLIP = 15, HEARTBEAT = 0xB, RECORDSOLVED = 0x40,
    MOVE_KAO = 0x41, RECORD_UPDATE = 0x60, ROT_UPDATE = 0x61, SET_COMMITTED = 0x62,
    UNSET_COMMITTED = 0x63, SET_KAOS = 0x88, EM_PROC = 0xAA
};
export type JukeRecord = { id: number; pos: [x: number, y: number]; };
export type RoomUpdate = Partial<Pick<Room, "hidePreview" | "nolockunlock" | "nomultiselect" | "norectselect" | "startTime" | "endTime">>;
export type track = { id: string; title: string; channel: string; skip: boolean; playcount: number; ext?: string; };
export type binaryObj =
    | { type: CMD_TYPE.PICK | CMD_TYPE.MOVE | CMD_TYPE.DROP; userId: number; groups: { id: number, x: number, y: number; }[]; }
    | { type: CMD_TYPE.SELECT | CMD_TYPE.DESELECT | CMD_TYPE.LOCK | CMD_TYPE.UNLOCK | CMD_TYPE.STEAL; userId: number; groupIds: number[]; }
    | { type: CMD_TYPE.MERGE; userId: number; groupIdA: number; groupIdB: number; x: number; y: number; }
    | { type: CMD_TYPE.ROTATE; userId: number; rotations: { id: number; rotation: ROTATION; }[]; }
    | { type: CMD_TYPE.FLIP; userId: number; flips: { id: number; f: boolean; }[]; }
    | { type: CMD_TYPE.RECORD_UPDATE; userId: number; records: JukeRecord[]; }
    | { type: CMD_TYPE.HEARTBEAT; userId: number; drift?: number; }
    | { type: CMD_TYPE.ROT_UPDATE; groupIdsWithTimestamps: [number, number][]; }
    | { type: CMD_TYPE.SET_COMMITTED; groupIds: number[]; }
    | { type: CMD_TYPE.UNSET_COMMITTED; groupId: number; }
    | { type: CMD_TYPE.MOVE_KAO; id: number; x: number; y: number; }
    | { type: CMD_TYPE.SET_KAOS; kaos: [number, number][]; }
    | { type: CMD_TYPE.EM_PROC; payload: DataView; }
    | { type: CMD_TYPE.RECORDSOLVED; };
export type EndStats = { ranking: [string, number][], jcfav?: string; deadweight?: string; };
type vec2 = [number, number];
type Rectangle = [vec2, vec2];
export type jsonObj =
    | { type: "version"; version: string; } | { type: "noroom"; } | { type: "me"; id: number; }
    | { type: "upgrade"; secret: string; } | { type: "users"; users: User[]; }
    | { type: "room"; room: Room; } | { type: "update"; room: Partial<Room>; }
    | { type: "chat"; name: string; id: number; color: string; message: string; ts?: number; }
    | { type: "emote"; name: string; id: number; color: string; emotes: string[]; }
    | { type: "points"; qty: number; }
    | { type: "playlist"; playlist?: track[]; currentlyPlaying?: string; ext?: string; timeStarted?: number; stop?: boolean; minPrice?: number; reschedule?: boolean; }
    | { type: "zones"; track?: number[]; question?: string; zones: [label: string, region: Rectangle][]; }
    | { type: "wrtc_answer", answer: RTCSessionDescriptionInit; } | { type: "init_wrtc"; }
    | { type: "botnet"; } | { type: "candidate", candidate: RTCIceCandidate; }
    | { type: "proc", id: number; code: string; } | { type: "remproc", id: number; }
    | ({ type: 'endstats'; } & EndStats);

// --- Restored decodeBinary Function ---
function decodeBinary(data: ArrayBuffer): binaryObj {
    const dataView = new DataView(data);
    const type = dataView.getUint8(0) as CMD_TYPE;
    let userId: number;
    try {
        switch (type) {
            case CMD_TYPE.PICK: case CMD_TYPE.MOVE: case CMD_TYPE.DROP:
                userId = dataView.getUint16(1, true);
                const groups: { id: number, x: number, y: number; }[] = [];
                for (let ptr = 3; ptr < data.byteLength; ptr += 10) groups.push({ id: dataView.getUint16(ptr, true), x: dataView.getFloat32(ptr + 2, true), y: dataView.getFloat32(ptr + 6, true) });
                return { type, userId, groups };
            case CMD_TYPE.SELECT: case CMD_TYPE.DESELECT: case CMD_TYPE.LOCK: case CMD_TYPE.UNLOCK: case CMD_TYPE.STEAL:
                userId = dataView.getUint16(1, true);
                const groupIds: number[] = [];
                for (let ptr = 3; ptr < data.byteLength; ptr += 2) groupIds.push(dataView.getUint16(ptr, true));
                return { type, userId, groupIds };
            case CMD_TYPE.MERGE:
                userId = dataView.getUint16(1, true);
                const groupIdA = dataView.getUint16(3, true), groupIdB = dataView.getUint16(5, true);
                const x = dataView.getFloat32(7, true), y = dataView.getFloat32(11, true);
                return { type, userId, groupIdA, groupIdB, x, y };
            case CMD_TYPE.ROTATE:
                userId = dataView.getUint16(1, true);
                const rotations: { id: number; rotation: ROTATION; }[] = [];
                for (let ptr = 3; ptr < dataView.byteLength; ptr += 3) rotations.push({ id: dataView.getUint16(ptr, true), rotation: dataView.getUint8(ptr + 2) as ROTATION });
                return { type, userId, rotations };
            case CMD_TYPE.FLIP:
                userId = dataView.getUint16(1, true);
                const flips: { id: number; f: boolean; }[] = [];
                for (let ptr = 3; ptr < dataView.byteLength; ptr += 3) flips.push({ id: dataView.getUint16(ptr, true), f: dataView.getUint8(ptr + 2) === 1 });
                return { type, userId, flips };
            case CMD_TYPE.RECORD_UPDATE:
                userId = dataView.getUint16(1, true);
                const records: JukeRecord[] = [];
                for (let offset = 3; offset < data.byteLength; offset += 6) records.push({ id: dataView.getUint16(offset, true), pos: [dataView.getUint16(offset + 2, true), dataView.getUint16(offset + 4, true)] });
                return { type, userId, records };
            case CMD_TYPE.HEARTBEAT:
                userId = dataView.getUint16(1, true);
                let drift: number | undefined; if (data.byteLength >= 11) drift = dataView.getFloat64(3, true);
                return { type, userId, drift };
            case CMD_TYPE.ROT_UPDATE:
                const groupsWithTimestamps: [number, number][] = [];
                for (let ptr = 1; ptr < data.byteLength; ptr += 10) groupsWithTimestamps.push([dataView.getUint16(ptr, true), dataView.getFloat64(ptr + 2, true)]);
                return { type, groupIdsWithTimestamps: groupsWithTimestamps };
            case CMD_TYPE.SET_COMMITTED:
                const committedGroupIds: number[] = [];
                for (let ptr = 1; ptr < data.byteLength; ptr += 2) committedGroupIds.push(dataView.getUint16(ptr, true));
                return { type, groupIds: committedGroupIds };
            case CMD_TYPE.UNSET_COMMITTED: return { type, groupId: dataView.getUint16(1, true) };
            case CMD_TYPE.MOVE_KAO: return { type, id: dataView.getUint8(1), x: dataView.getFloat32(2, true), y: dataView.getFloat32(6, true) };
            case CMD_TYPE.SET_KAOS:
                const kaos: [number, number][] = [];
                for (let ptr = 1; ptr < data.byteLength; ptr += 8) kaos.push([dataView.getFloat32(ptr, true), dataView.getFloat32(ptr + 4, true)]);
                return { type, kaos };
            case CMD_TYPE.EM_PROC: return { type, payload: new DataView(data, 1) };
            case CMD_TYPE.RECORDSOLVED: return { type };
            default: console.error(`Not supported binary message type: ${type} (0x${Number(type).toString(16)})`); throw new Error(`Not supported binary message: ${type}`);
        }
    } catch (error) {
        console.error(`Error decoding binary message type ${type} (0x${type.toString(16)}):`, error, Buffer.from(data).toString('hex'));
        throw error;
    }
}
// --- End Restored decodeBinary Function ---


class Playlist {
    state: Extract<jsonObj, { type: 'playlist'; }> = { type: 'playlist' };
    balance = 0;
    constructor(private game: MicroGame) { }
}

class MicroGame {
    meId: number = 0;
    roomdef!: Room;
    version: string = '';
    playlist = new Playlist(this);
    events = new EventTarget;
    endstats?: Extract<jsonObj, { type: 'endstats'; }>;
    userlist: User[] = [];
    chatlog: Extract<jsonObj, { type: 'chat'; }>[] = [];
    poll?: Extract<jsonObj, { type: 'zones'; }>;
    transformedGroups = new Map<number, Group>();
    commited?: number[];
    kaos: vec2[] = [];

    handle(cmd: jsonObj) {
        switch (cmd.type) {
            case 'botnet': case 'candidate': case 'init_wrtc': case 'wrtc_answer':
            case 'proc': case 'remproc': case 'upgrade': case 'emote':
                break;
            case 'me': this.meId = cmd.id; break;
            case 'noroom':
                console.warn("MicroGame: Received 'noroom' message.");
                this.events.dispatchEvent(new CustomEvent(cmd.type, { detail: cmd }));
                return;
            case 'playlist': this.playlist.state = cmd; break;
            case 'points': this.playlist.balance = cmd.qty; break;
            case 'version': this.version = cmd.version; break;
            case 'endstats': this.endstats = cmd; break;
            case 'users': this.userlist = cmd.users; break;
            case 'chat': this.chatlog.push(cmd); if (this.chatlog.length > MAX_ROOM_CHAT_LOG) this.chatlog.shift(); break;
            case 'update':
                if (this.roomdef) Object.assign(this.roomdef, cmd.room);
                else console.warn("MicroGame: Received room update but roomdef is not initialized.");
                break;
            case 'zones': this.poll = cmd; break;
            case 'room':
                this.roomdef = cmd.room;
                this.transformedGroups.clear();
                if (this.roomdef && this.roomdef.groups) {
                    for (const g of this.roomdef.groups) {
                        this.transformedGroups.set(g.id, g);
                        for (const c of g.ids) this.transformedGroups.set(c, g);
                    }
                }
                break;
            default: break;
        }
        this.events.dispatchEvent(new CustomEvent(cmd.type, { detail: cmd }));
    }

    handleB(cmd: binaryObj) {
        if (!this.roomdef && cmd.type !== CMD_TYPE.HEARTBEAT) return;

        switch (cmd.type) {
            case CMD_TYPE.EM_PROC: case CMD_TYPE.HEARTBEAT: case CMD_TYPE.RECORD_UPDATE: case CMD_TYPE.RECORDSOLVED:
                break;
            case CMD_TYPE.SET_COMMITTED: this.commited = cmd.groupIds; break;
            case CMD_TYPE.UNSET_COMMITTED: this.commited = this.commited?.filter(e => e !== cmd.groupId); break;
            case CMD_TYPE.DESELECT: cmd.groupIds.forEach(gId => { delete this.transformedGroups.get(gId)?.selected; }); break;
            case CMD_TYPE.SELECT: cmd.groupIds.forEach(gId => { const g = this.transformedGroups.get(gId); if (g) g.selected = cmd.userId; }); break;
            case CMD_TYPE.LOCK: case CMD_TYPE.UNLOCK: cmd.groupIds.forEach(gId => { const g = this.transformedGroups.get(gId); if (g) g.locked = cmd.type === CMD_TYPE.LOCK; }); break;
            case CMD_TYPE.DROP: case CMD_TYPE.PICK: case CMD_TYPE.MOVE:
                cmd.groups.forEach(gData => {
                    const ng = this.transformedGroups.get(gData.id);
                    if (!ng) return;
                    ng.x = gData.x; ng.y = gData.y;
                    if (cmd.type === CMD_TYPE.DROP) delete ng.selected; else ng.selected = cmd.userId;
                });
                break;
            case CMD_TYPE.ROTATE: cmd.rotations.forEach(rData => { const ng = this.transformedGroups.get(rData.id); if (ng) ng.rot = rData.rotation; }); break;
            case CMD_TYPE.FLIP: cmd.flips.forEach(fData => { const ng = this.transformedGroups.get(fData.id); if (ng) ng.f = fData.f; }); break;
            case CMD_TYPE.STEAL: cmd.groupIds.forEach(gId => { const ng = this.transformedGroups.get(gId); if (ng) delete ng.selected; }); break;
            case CMD_TYPE.ROT_UPDATE: cmd.groupIdsWithTimestamps.forEach(([gId, ts]) => { const ng = this.transformedGroups.get(gId); if (ng) ng.rotp = ts; }); break;
            case CMD_TYPE.SET_KAOS: this.kaos = cmd.kaos; break;
            case CMD_TYPE.MOVE_KAO: if (this.kaos && this.kaos[cmd.id]) this.kaos[cmd.id] = [cmd.x, cmd.y]; break;
            case CMD_TYPE.MERGE:
                let groupA = this.transformedGroups.get(cmd.groupIdA);
                let groupB = this.transformedGroups.get(cmd.groupIdB);
                if (groupA && groupB && groupA !== groupB) {
                    delete groupA.dragged; delete groupA.selected; delete groupB.dragged; delete groupB.selected;
                    this.mergeGroups(groupA, groupB, cmd.x, cmd.y);
                }
                break;
        }
        this.events.dispatchEvent(new CustomEvent(CMD_TYPE[cmd.type], { detail: cmd }));
    }

    mergeGroups(a: Group, b: Group, x: number, y: number) {
        if (!this.roomdef || !this.roomdef.groups || !this.roomdef.boardWidth || !this.roomdef.boardHeight) return;

        a.id = Math.max(a.id, b.id);
        a.indices.push(...b.indices);
        a.ids.push(...b.ids);
        a.locked = a.locked || b.locked;

        extractFromArray(this.roomdef.groups, b);

        this.transformedGroups.set(b.id, a);
        for (const pieceIdInB of b.ids) {
            this.transformedGroups.set(pieceIdInB, a);
        }
        for (const pieceIdInA of a.ids) {
            this.transformedGroups.set(pieceIdInA, a);
        }
        this.transformedGroups.set(a.id, a);


        a.x = clamp(x, 0, this.roomdef.boardWidth);
        a.y = clamp(y, 0, this.roomdef.boardHeight);
    }
}

class Player {
    ws!: WebSocket;
    buffer: (string | ArrayBuffer)[] = [];
    msgcb: (() => void) | undefined;
    private meId: number = 0;
    public username: string;
    public readonly roomid: string;

    private connectionTimeoutId?: ReturnType<typeof setTimeout>;

    constructor(
        private handler: MessageHandler,
        roomid: string,
        username: string,
        private color: string,
        private secret: string = '') {
        this.username = username;
        this.roomid = roomid;
    }

    send(o: any) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.warn(`WebSocket for room ${this.roomid} not open. Cannot send message:`, o);
            return;
        }
        if (o instanceof ArrayBuffer)
            this.ws.send(o);
        else
            this.ws.send(JSON.stringify(o));
    }

    chat(m: string) {
        this.send({ type: "chat", message: m });
    }

    next(): Promise<string | ArrayBuffer> {
        if (this.buffer.length > 0) {
            return Promise.resolve(this.buffer.shift()!);
        }
        return new Promise((resolve) => {
            this.msgcb = () => {
                if (this.buffer.length > 0) {
                    const cb = this.msgcb;
                    delete this.msgcb;
                    if (cb) resolve(this.buffer.shift()!);
                }
            };
        });
    }

    private connect(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            console.log(`Player: Attempting to connect WebSocket for room ${this.roomid}...`);

            this.ws = new WebSocket(wstarget);
            this.ws.binaryType = 'arraybuffer';

            const cleanupTimeout = () => {
                if (this.connectionTimeoutId) {
                    clearTimeout(this.connectionTimeoutId);
                    this.connectionTimeoutId = undefined;
                }
            };

            const onOpen = () => {
                cleanupTimeout();
                console.log(`Player: WebSocket opened for room ${this.roomid}. Sending user info...`);
                this.send({
                    type: 'user',
                    name: this.username,
                    room: this.roomid,
                    color: this.color,
                    ...(this.secret ? { secret: this.secret } : {})
                });
                resolve();
            };

            const onMessage = (ev: MessageEvent) => {
                this.buffer.push(ev.data);
                if (this.msgcb) {
                    this.msgcb();
                }
            };

            const onClose = (ev: CloseEvent) => {
                cleanupTimeout();
                cleanupEventListeners();
                console.log(`Player: WebSocket closed for room ${this.roomid}. Code: ${ev.code}, Reason: ${ev.reason}.`);
            };

            const onError = (ev: Event) => {
                cleanupTimeout();
                cleanupEventListeners();
                console.error(`Player: WebSocket error for room ${this.roomid}:`, ev);
                reject(new Error(`WebSocket error for room ${this.roomid}`));
            };

            const cleanupEventListeners = () => {
                this.ws.removeEventListener('open', onOpen);
                this.ws.removeEventListener('message', onMessage);
                this.ws.removeEventListener('close', onClose);
                this.ws.removeEventListener('error', onError);
            };

            this.ws.addEventListener('open', onOpen);
            this.ws.addEventListener('message', onMessage);
            this.ws.addEventListener('close', onClose);
            this.ws.addEventListener('error', onError);

            this.connectionTimeoutId = setTimeout(() => {
                if (this.ws.readyState !== WebSocket.OPEN) {
                    cleanupEventListeners();
                    console.error(`Player: WebSocket connection attempt for room ${this.roomid} timed out after ${CONNECTION_TIMEOUT_MS}ms.`);
                    if (this.ws.readyState !== WebSocket.CLOSED) {
                        try { this.ws.close(1006, "Connection Timeout"); } catch (e) { /* ignore */ }
                    }
                    reject(new Error(`WebSocket connection timeout for room ${this.roomid}`));
                }
            }, CONNECTION_TIMEOUT_MS);
        });
    }

    async init(): Promise<void> {
        try {
            await this.connect();
            console.log(`Player for room ${this.roomid} successfully connected. Starting message processing.`);
            this.processMessages().catch(err => {
                console.error(`Player for room ${this.roomid}: processMessages loop exited with error:`, err);
            });
        } catch (error) {
            console.error(`Player init failed for room ${this.roomid}:`, error);
            throw error;
        }
    }

    private async processMessages() {
        try {
            while (this.ws && this.ws.readyState === WebSocket.OPEN) {
                const msg = await this.next();
                if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                    console.log(`Player for room ${this.roomid}: WebSocket closed while waiting for message. Exiting loop.`);
                    break;
                }

                if (typeof msg === "string") {
                    try {
                        const cmd = JSON.parse(msg) as jsonObj;
                        if (cmd.type === "me") {
                            this.meId = cmd.id;
                        }
                        this.handler.handle(cmd);
                    } catch (e) {
                        console.error("Failed to parse JSON message:", msg, e);
                    }
                } else if (msg instanceof ArrayBuffer) {
                    const buffer = msg;
                    if (buffer.byteLength > 0) {
                        const dv = new DataView(buffer);
                        const cmdType = dv.getUint8(0) as CMD_TYPE;
                        if (cmdType === CMD_TYPE.HEARTBEAT) {
                            const newBuffer = buffer.slice(0);
                            const newDv = new DataView(newBuffer);
                            if (newDv.byteLength >= 3) {
                                newDv.setUint16(1, this.meId, true);
                            }
                            this.send(newBuffer);
                            try {
                                this.handler.handleB(decodeBinary(buffer));
                            } catch (e) { /* Logged by decodeBinary */ }
                        } else {
                            try {
                                this.handler.handleB(decodeBinary(buffer));
                            } catch (e) { /* Logged by decodeBinary */ }
                        }
                    }
                }
            }
        } catch (error) {
            console.error(`Error in message processing loop for room ${this.roomid}:`, error);
        } finally {
            console.log(`Message processing loop for room ${this.roomid} exited.`);
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.close(1001, "Message loop exited");
            }
        }
    }
}

export class JigChan implements MessageHandler {
    private game: MicroGame;
    private player?: Player;
    private state: JigChanState;
    private isShuttingDown = false;

    private history: Content[] = [];
    private isProcessing = false;
    private eventQueue: string[] = [];

    constructor(systemPrompt: string,
        booruType: 'safebooru' | 'gelbooru',
        geminiApiKey: string,
        name: string = 'Jig-chan',
        private prefixcode = 'jc',
        private priv = false) {
        
        systemPrompt += "\nCRITICAL INSTRUCTION: You have access to user profiles. When interacting with a user, you should use the getUserProfile tool to fetch their character sheet and notes, and use this information to better tailor your responses to them.";
        
        this.game = new MicroGame();
        this.state = this.loadState(name, systemPrompt, booruType, geminiApiKey);

        if (!this.state.jigChanSettings.geminiApiKey) {
            console.warn("Gemini API Key is not set. JigChan's AI functionalities will be disabled.");
        }

        process.on('SIGINT', () => this.shutdown());
        process.on('SIGTERM', () => this.shutdown());
    }

    private loadState(name: string, systemPrompt: string, booruType: 'safebooru' | 'gelbooru', geminiApiKey: string): JigChanState {
        if (require("fs").existsSync(require("path").resolve(this.prefixcode + STATE_FILE_PATH))) {
            try {
                const fileContent = require("fs").readFileSync(require("path").resolve(this.prefixcode + STATE_FILE_PATH), 'utf-8');
                const loadedState = JSON.parse(fileContent) as JigChanState;
                loadedState.jigChanSettings.name = name;
                loadedState.jigChanSettings.systemPrompt = systemPrompt;
                loadedState.jigChanSettings.booruType = booruType;
                loadedState.jigChanSettings.geminiApiKey = geminiApiKey || loadedState.jigChanSettings.geminiApiKey;
                loadedState.createdRooms = loadedState.createdRooms || 0;
                console.log("JigChan state loaded successfully.");
                return loadedState;
            } catch (error) {
                console.error("Error loading JigChan state:", error);
            }
        }
        return {
            usedMd5Hashes: [],
            userProfiles: {},
            globalChatLog: [],
            createdRooms: 0,
            jigChanSettings: {
                name: name,
                systemPrompt,
                booruType,
                geminiApiKey,
                chatInteractionFrequency: 5,
                massMoveThreshold: PIECES_PER_SET * 1.5,
            }
        };
    }

    private saveState(): void {
        if (this.isShuttingDown) return;
        try {
            require("fs").writeFileSync(require("path").resolve(this.prefixcode + STATE_FILE_PATH), JSON.stringify(this.state, null, 2), 'utf-8');
        } catch (error) {
            console.error("Error saving JigChan state:", error);
        }
    }

    public async run(oldPlayerToNotify?: Player): Promise<void> {
        console.log(`${this.state.jigChanSettings.name} is starting...`);
        if (this.state.activeRoom && this.state.activeRoom.id) {
            await this.joinRoom(this.state.activeRoom.id, this.state.activeRoom.secret);
        } else {
            this.pushEvent("System: No active room. You should probably create one or join an existing one.");
        }
    }

    private pushEvent(event: string) {
        this.eventQueue.push(event);
        this.processQueue();
    }

    private async processQueue() {
        if (this.isProcessing) return;
        this.isProcessing = true;
        try {
            while (this.eventQueue.length > 0) {
                const events = [...this.eventQueue];
                this.eventQueue = [];
                const eventText = events.join("\n");
                this.history.push({ role: "user", parts: [{ text: eventText }] });
                await this.agentLoop();
            }
        } finally {
            this.isProcessing = false;
        }
    }

    private getTools(): ToolDeclaration[] {
        return [{
            functionDeclarations: [
                {
                    name: "sendChatMessage",
                    description: "Send a message to the room chat. Important: To execute commands (like kick, plskip, cleanup), just start the message with '/' as if you were typing it in chat.",
                    parameters: {
                        type: "OBJECT",
                        properties: { message: { type: "STRING" } },
                        required: ["message"]
                    }
                },
                {
                    name: "scrapeBooru",
                    description: "Scrape image board for images.",
                    parameters: {
                        type: "OBJECT",
                        properties: {
                            booruType: { type: "STRING", description: "'safebooru' or 'gelbooru'" },
                            includeTags: { type: "ARRAY", items: { type: "STRING" } },
                            excludeTags: { type: "ARRAY", items: { type: "STRING" } },
                            count: { type: "INTEGER" }
                        },
                        required: ["booruType", "includeTags", "excludeTags", "count"]
                    }
                },
                {
                    name: "createPuzzleRoom",
                    description: "Create a new puzzle room using scraped images.",
                    parameters: {
                        type: "OBJECT",
                        properties: {
                            name: { type: "STRING" },
                            images: { type: "ARRAY", items: { type: "OBJECT", properties: { file_url: { type: "STRING" }, filename: { type: "STRING" }, md5: { type: "STRING" } } } },
                            pieces: { type: "INTEGER" },
                            settings: {
                                type: "OBJECT",
                                properties: {
                                    rotation: { type: "BOOLEAN", description: "Enable piece rotation" },
                                    edges: { type: "BOOLEAN", description: "Separate edge pieces" },
                                    fakeEdge: { type: "BOOLEAN", description: "Add fake edge pieces for extra difficulty" },
                                    mixsets: { type: "BOOLEAN", description: "Mix different image sets together" },
                                    nsfw: { type: "BOOLEAN", description: "Mark the room as NSFW" }
                                }
                            }
                        },
                        required: ["name", "images", "pieces"]
                    }
                },
                {
                    name: "joinRoom",
                    description: "Join a room.",
                    parameters: {
                        type: "OBJECT",
                        properties: {
                            roomId: { type: "STRING" },
                            secret: { type: "STRING" }
                        },
                        required: ["roomId"]
                    }
                },
                {
                    name: "getUserSelectionInfo",
                    description: "Get information about the puzzle piece group currently selected by a user. Useful when a user asks about an image or source. The user ID is provided in chat events.",
                    parameters: {
                        type: "OBJECT",
                        properties: { userId: { type: "INTEGER" } },
                        required: ["userId"]
                    }
                },
                {
                    name: "getRoomState",
                    description: "Get current room state including user list, their IDs, and overall puzzle completion.",
                    parameters: {
                        type: "OBJECT",
                        properties: {}
                    }
                },
                {
                    name: "updateUserProfile",
                    description: "Update character sheet and trust level for a user.",
                    parameters: {
                        type: "OBJECT",
                        properties: {
                            userName: { type: "STRING" },
                            trustLevel: { type: "STRING", description: "'low', 'medium', or 'high'" },
                            notes: { type: "STRING" }
                        },
                        required: ["userName", "trustLevel", "notes"]
                    }
                },
                {
                    name: "getUserProfile",
                    description: "Get the character sheet, trust level, and stats for a specific user. Call this to learn about a user you are interacting with.",
                    parameters: {
                        type: "OBJECT",
                        properties: { userName: { type: "STRING" } },
                        required: ["userName"]
                    }
                }
            ]
        }];
    }

    private async agentLoop() {
        if (this.history.length > 50) {
            this.history = this.history.slice(-30);
        }

        let loopCount = 0;
        while (loopCount++ < 5) {
            const parts = await callGeminiAgent(
                this.state.jigChanSettings.geminiApiKey,
                this.state.jigChanSettings.systemPrompt,
                this.history,
                this.getTools()
            );

            if (!parts) break;

            this.history.push({ role: "model", parts });

            const toolCalls = parts.filter((p) => 'functionCall' in p);
            if (toolCalls.length === 0) break;

            const toolResponses: ContentPart[] = [];
            for (const call of toolCalls) {
                const func = call.functionCall;
                let result: any = null;
                try {
                    result = await this.executeTool(func.name, func.args);
                } catch (e) {
                    result = { error: String(e) };
                }
                toolResponses.push({
                    functionResponse: {
                        name: func.name,
                        response: { name: func.name, content: result }
                    }
                });
            }

            this.history.push({ role: "function", parts: toolResponses });
        }
    }

    private async executeTool(name: string, args: any): Promise<any> {
        console.log(`Executing tool: ${name}`, args);
        switch (name) {
            case "sendChatMessage":
                if (this.player) {
                    let msg = args.message;
                    if (!msg.startsWith('/')) msg = '>' + msg;
                    this.player.chat(msg);
                }
                return { success: true };
            case "scrapeBooru":
                const booruScraper = args.booruType === 'safebooru' ? scrapeSafebooru : scrapeGelbooru;
                const imgs = await booruScraper(args.includeTags, args.excludeTags, args.count, new Set(this.state.usedMd5Hashes));
                return { images: imgs.map(i => ({ file_url: i.file_url, filename: i.filename, md5: i.md5, tags: i.tags_array })) };
            case "createPuzzleRoom":
                return await this.toolCreatePuzzleRoom(args.name, args.images, args.pieces, args.settings);
            case "joinRoom":
                await this.joinRoom(args.roomId, args.secret || "");
                return { success: true };
            case "getUserSelectionInfo":
                if (!this.game || !this.game.transformedGroups || !this.state.activeRoom) return { error: "No active room or game state" };
                const userSelectedGroups: any[] = [];
                for (const group of this.game.transformedGroups.values()) {
                    if (group.selected === args.userId) {
                        userSelectedGroups.push(group);
                    }
                }
                if (userSelectedGroups.length === 0) return { info: "User has no pieces currently selected." };
                const group = userSelectedGroups[0];
                const set = this.game.roomdef.sets[group.set];
                if (group.indices.length >= (set.cols * set.rows) - 2) {
                    const fn = (group.f ? (set.image2 || '') : set.image);
                    const m = this.state.activeRoom.imageMetadata;
                    const data = m[fn.replace('jpg', 'jpeg')] || m[fn.replace('jpeg', 'jpg')] || m[fn];
                    return { info: "User has a complete group selected.", metadata: data };
                } else {
                    return { info: "User has a group selected, but it is not complete enough to reveal source. They must complete the puzzle piece group first." };
                }
            case "getRoomState":
                if (!this.game || !this.game.roomdef) return { error: "No active room" };
                const roomCompletion = 1 - (this.game.roomdef.groups.length - this.game.roomdef.sets.length) / (this.game.roomdef.pieces - this.game.roomdef.sets.length);
                return {
                    completionPercentage: Math.round(roomCompletion * 100),
                    users: this.game.userlist.map(u => ({ id: u.id, name: u.name }))
                };
            case "updateUserProfile":
                let profileToUpdate = this.state.userProfiles[args.userName];
                if (!profileToUpdate) {
                    profileToUpdate = {
                        id: 0, name: args.userName, color: "", roomAppearances: [], messageCountTotal: 0,
                        firstSeenMs: Date.now(), lastSeenMs: Date.now(),
                        mentionCountInCurrentRoom: 0, mergeCountInCurrentRoom: 0, lastSalutedTimestampByName: 0
                    };
                    this.state.userProfiles[args.userName] = profileToUpdate;
                }
                profileToUpdate.trustLevel = args.trustLevel;
                profileToUpdate.characterSheet = args.notes;
                this.saveState();
                return { success: true };
            case "getUserProfile":
                const profile = this.state.userProfiles[args.userName];
                if (!profile) return { info: "User profile not found. This user might be new or not in the records." };
                return {
                    name: profile.name,
                    trustLevel: profile.trustLevel || "unknown",
                    characterSheet: profile.characterSheet || "No notes available.",
                    messageCountTotal: profile.messageCountTotal,
                    roomAppearances: profile.roomAppearances.length
                };
            default:
                return { error: `Unknown tool: ${name}` };
        }
    }

    private async toolCreatePuzzleRoom(name: string, images: { file_url: string, filename: string, md5?: string }[], pieces: number, agentSettings?: any) {
        const filesForRoom: File[] = [];
        const imageSizes: string[] = [];

        for (const img of images) {
            try {
                let response = await fetch(img.file_url);
                if (!response.ok) {
                    response = await fetch(img.file_url.replace(/\.jpe?g$/, '.png'));
                }
                if (!response.ok) continue;

                const imageBuffer = await response.arrayBuffer();
                const file = new File([imageBuffer], img.filename, { type: response.headers.get("content-type") || 'application/octet-stream' });
                filesForRoom.push(file);

                const s = sharp(Buffer.from(imageBuffer));
                const meta = await s.metadata();
                imageSizes.push(`${meta.width},${meta.height}`);

                if (img.md5 && !this.state.usedMd5Hashes.includes(img.md5)) {
                    this.state.usedMd5Hashes.push(img.md5);
                }
            } catch (error) {
                console.error(`Failed to download image ${img.filename}:`, error);
            }
        }

        if (filesForRoom.length === 0) return { error: "Failed to download any images." };

        let thumbnailBlob: Blob | undefined;
        try {
            const firstImageBuffer = await filesForRoom[0].arrayBuffer();
            thumbnailBlob = await generateThumbnail(firstImageBuffer, 240, 240, { fit: 'outside' });
        } catch (e) {
            console.error("Failed to generate thumbnail");
        }

        this.state.createdRooms++;
        const newRoomUrlSuffix = `${this.prefixcode}${this.state.createdRooms}`;

        const roomParams: CreateRoomSubmitParams = {
            name,
            urlname: newRoomUrlSuffix,
            censor: "",
            size: imageSizes.join(";"),
            files: new Listable(filesForRoom),
            thumbnail: thumbnailBlob
        };
        const roomSettings: RoomSettings = {
            pieces: pieces, 
            rotation: agentSettings?.rotation || false, 
            edges: agentSettings?.edges || false, 
            preview: true, votekick: true, 
            mixsets: agentSettings?.mixsets || false, 
            juke: true,
            square: false, scores: true, zigzag: false, 
            fakeEdge: agentSettings?.fakeEdge || false, 
            nomultisel: false, nolock: false, norect: true, nostack: true, auth: false, sd: false, autism: 2,
            nsfw: agentSettings?.nsfw !== undefined ? agentSettings.nsfw : true,
            listable: !this.priv, jukemusic: true, tags: [], forceanon: false, rotting: false, sticky: false, jigchan: true,
        };

        const creationResult = await createRoom(roomParams, roomSettings);
        if (creationResult.room && creationResult.room.id) {
            this.state.activeRoom = {
                id: creationResult.room.id,
                secret: creationResult.room.secret || "",
                imageMetadata: {},
                userList: [],
                chatMessagesThisRoom: [],
                joinTimestamp: Date.now()
            };
            this.saveState();
            return { success: true, roomId: creationResult.room.id, secret: creationResult.room.secret };
        }
        return { error: creationResult.error || "Unknown room creation error" };
    }

    private async joinRoom(roomIdToJoin: string, secret: string): Promise<void> {
        if (this.player) {
            try { this.player.ws.close(1000, "Switching rooms"); } catch (e) { }
        }

        this.player = new Player(this, roomIdToJoin, this.state.jigChanSettings.name, "#FF69B4", secret);
        await this.player.init();
        this.pushEvent(`System: Joined room ${roomIdToJoin}`);
    }

    handle(cmd: jsonObj): void {
        this.game.handle(cmd);
        switch (cmd.type) {
            case "chat":
                if (cmd.name !== this.state.jigChanSettings.name) {
                    const userProfileKey = cmd.name;
                    let userProfile = this.state.userProfiles[userProfileKey];
                    const now = Date.now();
                    if (!userProfile) {
                        userProfile = {
                            id: cmd.id,
                            name: cmd.name,
                            color: cmd.color || "",
                            roomAppearances: this.state.activeRoom ? [this.state.activeRoom.id] : [],
                            messageCountTotal: 0,
                            firstSeenMs: now,
                            lastSeenMs: now,
                            trustLevel: 'unknown',
                            mentionCountInCurrentRoom: 0,
                            lastRoomIdWithMentionCount: this.state.activeRoom?.id || "",
                            mergeCountInCurrentRoom: 0,
                            lastRoomIdWithMergeCount: this.state.activeRoom?.id || "",
                            lastSalutedTimestampByName: 0,
                        };
                        this.state.userProfiles[userProfileKey] = userProfile;
                    }
                    userProfile.messageCountTotal = (userProfile.messageCountTotal || 0) + 1;
                    userProfile.lastSeenMs = now;
                    if (this.state.activeRoom) {
                        if (!userProfile.roomAppearances.includes(this.state.activeRoom.id)) {
                            userProfile.roomAppearances.push(this.state.activeRoom.id);
                        }
                        if (userProfile.lastRoomIdWithMentionCount !== this.state.activeRoom.id) {
                            userProfile.mentionCountInCurrentRoom = 0;
                            userProfile.lastRoomIdWithMentionCount = this.state.activeRoom.id;
                        }
                        if (userProfile.lastRoomIdWithMergeCount !== this.state.activeRoom.id) {
                            userProfile.mergeCountInCurrentRoom = 0;
                            userProfile.lastRoomIdWithMergeCount = this.state.activeRoom.id;
                        }
                    }
                    this.saveState();

                    this.pushEvent(`Chat from ${cmd.name} (ID: ${cmd.id}): ${cmd.message}`);
                }
                break;
            case "room":
            case "update":
                if (cmd.room && cmd.room.endTime) {
                    this.pushEvent(`System: Room ended. You should create or join a new room.`);
                }
                break;
            case "users":
                this.pushEvent(`System: User list updated. Total users: ${cmd.users.length}`);
                break;
            case "endstats":
                this.pushEvent(`System: Room ended with stats.`);
                break;
            case "noroom":
                this.pushEvent(`System: Disconnected or no room found.`);
                break;
        }
    }

    handleB(cmd: binaryObj): void {
        this.game.handleB(cmd);
        switch (cmd.type) {
            case CMD_TYPE.MOVE:
            case CMD_TYPE.PICK:
                if (cmd.groups.length >= this.state.jigChanSettings.massMoveThreshold) {
                    const user = this.game.userlist.find(u => u.id === cmd.userId);
                    if (user && user.name !== this.state.jigChanSettings.name) {
                        this.pushEvent(`System: User ${user.name} (ID: ${cmd.userId}) moved ${cmd.groups.length} pieces at once.`);
                    }
                }
                break;
            case CMD_TYPE.MERGE:
                if (this.state.activeRoom) {
                    const user = this.game.userlist.find(u => u.id === cmd.userId);
                    if (user) {
                        const userProfileKey = user.name;
                        const userProfile = this.state.userProfiles[userProfileKey];
                        if (userProfile) {
                            if (userProfile.lastRoomIdWithMergeCount !== this.state.activeRoom.id) {
                                userProfile.mergeCountInCurrentRoom = 0;
                                userProfile.lastRoomIdWithMergeCount = this.state.activeRoom.id;
                            }
                            userProfile.mergeCountInCurrentRoom++;
                            this.saveState();
                        }
                    }
                }
                if (this.game.roomdef && this.game.roomdef.pieces > this.game.roomdef.sets.length) {
                    const completion = 1 - (this.game.roomdef.groups.length - this.game.roomdef.sets.length) / (this.game.roomdef.pieces - this.game.roomdef.sets.length);
                    if (completion > 0.85 && Math.random() < 0.1) {
                        this.pushEvent(`System: Room is currently ${Math.round(completion * 100)}% complete.`);
                    }
                }
                break;
        }
    }

    public async shutdown(): Promise<void> {
        if (this.isShuttingDown) return;
        this.isShuttingDown = true;
        if (this.player && this.player.ws) {
            this.player.ws.close(1000, "Shutting down");
        }
        this.saveState();
        process.exit(0);
    }
}

process.on('exit', function (code) {
    console.trace('Exiting:', code);
});

interface GelbooruTag {
    id: number;
    name: string;
    count: number;
    type: number;
    ambiguous: boolean;
}

interface AutocompleteSuggestion {
    type: "tag",
    label: string,
    value: string,
    post_count: `${number}`,
    category: "character" | 'artist' | 'tag',
}

async function getExistingTags(keywords: string[]): Promise<GelbooruTag[]> {
    return [];
}

async function findBestPartialMatch(keyword: string): Promise<AutocompleteSuggestion | null> {
    const tryAutocomplete = async (term: string): Promise<AutocompleteSuggestion[]> => {
        const url = `https://gelbooru.com/index.php?page=autocomplete2&term=${encodeURIComponent(term)}&type=tag_query`;
        try {
            const response = await fetch(url, {
                headers: {
                    cookie: 'fringeBenefits=yup'
                }
            });
            if (response.ok) {
                return await response.json() as AutocompleteSuggestion[];
            }
            return [];
        } catch (error) {
            console.error(`Error fetching autocomplete for "${term}":`, error);
            return [];
        }
    };

    let suggestions = await tryAutocomplete(keyword);
    if (suggestions.length > 0) {
        return suggestions[0];
    }

    if (keyword.length > 2) {
        const firstHalf = keyword.substring(0, Math.ceil(keyword.length / 2));
        suggestions = await tryAutocomplete(firstHalf);
        if (suggestions.length > 0) {
            return suggestions[0];
        }
    }

    return null;
}

export async function autocorrectTags(keywords: string[]): Promise<GelbooruTag[]> {
    //return keywords.map(e => ({count: 1, name: e, value: e}))
    const lowercasedKeywords = keywords.map(k => k.toLowerCase());
    const uniqueKeywords = [...new Set(lowercasedKeywords)];

    const existingTags = await getExistingTags(uniqueKeywords);
    const existingTagNames = new Set(existingTags.map(tag => tag.name));

    const notFoundKeywords = uniqueKeywords.filter(keyword => !existingTagNames.has(keyword));

    const correctedTagsPromises = notFoundKeywords.map(async (keyword) => {
        const bestMatch = await findBestPartialMatch(keyword);
        if (bestMatch && !existingTagNames.has(bestMatch.value)) {
            existingTagNames.add(bestMatch.value);
            return {
                id: 0,
                type: 0,
                ambiguous: false,
                count: +bestMatch.post_count,
                name: bestMatch.value
            } as GelbooruTag;
        }
        return null;
    });

    const correctedTags = (await Promise.all(correctedTagsPromises)).filter((tag): tag is GelbooruTag => tag !== null);

    const allTags = [...existingTags, ...correctedTags];
    return allTags.sort((a, b) => b.count - a.count);
}
