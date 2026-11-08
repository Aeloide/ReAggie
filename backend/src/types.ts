import type { WebSocket } from "ws";
import type { EventEmitter } from "events";
import type wsipc from "./ws-rpc.js";
import type { Counter, Permissions } from "./utils.js";
import type { MuteEvaluator } from "./MuteEvaluator.js";
import type { ChatModule } from "./commands/index.js";
import type { RoomBroadcaster } from "./core/room-broadcaster.js";
import type { Jukebox } from "./Jukebox.js";
import type { Token } from "./db.js";
import type { AdminModule } from "./commands/AdminModule.js";
import type { ParserTypes } from "./core/protocols/index.js";

type ConnectionFlow = typeof import("./connectionFlow.js")['default'];
export type Permission = typeof PermissionsStrings[number];

export type GeneratorArg = {
    user: UserPrivate;
    guser: User;
    payload: Buffer;
}

export type IPCReturn = {
    binary?: Buffer;
    json?: any;
    error?: string;
}

export type vec<L extends number, T extends number[] = []> =
    T extends { length: L; } ? T : vec<L, [...T, number]>;
export type Rectangle = [vec2, vec2];
export type vec2 = vec<2>;

export type RevertInfo = {
    ip: string;
    userId: number;
    time: number;
    prev: vec2;
}

export type SpreadingFunction = (gs: Group[],
    bound: Rectangle,
    pdim: vec2,
    idim: vec2, skipRectangles: Rectangle[], force?: boolean) => void;

export type Group = {
    id: number;
    ids: number[];
    indices: number[];
    set: number;
    x: number;
    y: number;
    rot?: number;
    f?: boolean;
    locked?: boolean;
    selected?: boolean | number;
    dragged?: boolean | number;
    dragStartX?: number;
    dragStartY?: number;
    rotp?: number;
};

export type PSet = {
    count?: number;
    seed?: number;
    cols: number;
    height: number;
    image: string;
    image2?: string;
    imageHeight: number;
    imageWidth: number;
    rows: number;
    width: number;
    isvideo?: boolean;
    isvideo2?: boolean;
    pieceWidth?: number;
    pieceHeight?: number;

    tx?: number;
    ty?: number;
    tw?: number;
    th?: number;
    maskX?: number;
    maskY?: number;

    sites?: vec2[]
};

export type Room = {
    boardHeight: number;
    boardWidth: number;
    endTime?: number;
    groups: Group[];
    initialLayout?: Group[];
    hidePreview: boolean;
    jitter: number;
    name: string;
    nolockunlock: boolean;
    nomultiselect: boolean;
    norectselect?: boolean;
    pieces: number;
    rotation: boolean;
    flipping: boolean;
    seed: number;
    sets: PSet[];
    startTime?: number;
    tabSize: number;
    cornerJitter?: number;
    thumb: string;
    juke?: boolean;
    jukemusic?: boolean;
    scores?: boolean;
    zigzag?: boolean;
    square: boolean;
    fakeEdge?: boolean;
    nostack?: boolean;
    auth?: boolean;
    ext?: Record<string, any>;
    thumbnail?: string;

    // undefined: room is private
    // empty string: room is public
    // else: room can only appear if the user knows the keyword
    key?: string; // basically a like a password, but shared among a group of individuals 
    tags?: string[]; // used to filter search and order by relevancy
    rpg?: boolean;
    nsfw?: boolean;
    votekick?: boolean; // can players use votekick
    anon?: boolean;
    jigchan?: boolean;
    noedge?: boolean;
};

export type User = {
    id: number;
    name: string;
    color: string;
    isHost?: number | Permissions;
    avatar?: string;
    banner?: string;
};

export type Quota = {
    amount: number;
    burst_factor: number;
};

// TODO: this is actually terrible. Can't create new permission types without affecting the behavior 
// of previous room hosts (they'll be missing the new permissions and not considered roomcreator)
// DO NOT MODIFY THIS ENUM EVER AGAIN, THIS IS LEGACY
export enum HostCapabilities {
    // Room Creators default
    ChangeRoomSettings = 1 << 0, // set settings like preview on, select, stack, etc...
    KickImmune = 1 << 1, // Prevents being kicked by others with Kick rights or vote kick
    Kick = 1 << 2, // Kick and unkick people
    Lock = 1 << 3, // lock access to this room
    Restart = 1 << 4, // restart the room process
    Delete = 1 << 5, // delete this room
    SlowMode = 1 << 6, // Allow to turn Slow Mode on
    Cleanup = 1 << 7, // Allow the cleanup command
    Playlist = 1 << 8, // Allow managing the playlist
    Poll = 1 << 9, // Allow managing polls
    Rollback = 1 << 10, // Allow rolling back the room state

    // TODO: Actually broken since even if you do not have that right,
    // you could just send your localStorage.secret to someone else and it'd work
    // but it would give them all of your rights
    Delegate = 1 << 11, // Give a subset of your rights to someone.
    RoomCreator = (1 << 12) - 1, // keep this after all the previous permissions
    // Site Admin
    ReadBanlist = 1 << 12, // read banned ips
    Debug = 1 << 13, // enable inspector and debug commands
    Ban = 1 << 14, // Ban room creator IP and deletes all their rooms
    Admin = (1 << 15) - 1 // keep this after all the previous permissions
    // beware that 1<<X breaks after 31
}

export const PermissionsStrings = ['ChangeRoomSettings', 'KickImmune', 'Kick', 'Lock', 'Restart', 'Delete', 'SlowMode', 'Cleanup', 'Playlist', 'Poll', 'Rollback', 'Delegate', 'RoomCreator', 'ReadBanlist', 'Debug', 'Ban', 'Notes', 'Admin'] as const;

export const CapabilitiesDesc: Record<typeof PermissionsStrings[number], string> = {
    ChangeRoomSettings: 'Change room settings',
    KickImmune: 'Cannot be kicked',
    Kick: 'Can Kick and Unkick players',
    Lock: 'Can lock access to the room',
    Restart: 'Can restart the room process',
    Delete: 'Can delete the room',
    SlowMode: 'Can turn slowmode on',
    Cleanup: 'Can cleanup the room',
    Playlist: 'Can manage the playlist',
    Poll: 'Can manage polls',
    Rollback: 'Can rollback the room state',
    Delegate: 'Can delegate these rights to another',
    Notes: 'Can manage notes',

    // admin exclusives, you won't know about these
    ReadBanlist: '',
    Debug: '',
    Ban: '',
    // aggregates
    RoomCreator: '',
    Admin: '',
};

export type UserPrivate = {
    interid?: ReturnType<typeof setInterval>;
    muter: MuteEvaluator;
    token?: Token;
    pushtoken?: string;
    asn: number;
    speed: Counter;
    solves: Counter;
    chats: Counter;
    selects: Counter;

    missedhb: number;
    missedPongs?: number;
    lastrecvd?: number;
    clitime?: number;
    lastsent?: number;
    heartbeatPending?: boolean;
    heartbeatSentMono?: number;
    heartbeatReceivedMono?: number;
    clockDrift?: number;
    ishost: Permissions;
    readonly host: Record<Permission, boolean>;

    ipaddr: string;
    conn: WebSocket;
    name: string;

    pruned: boolean;
    disconnecting?: boolean;
    lastRoomSync?: number;
    roomSyncTimer?: ReturnType<typeof setTimeout>;

    doDisconnect: (self: UserPrivate, reason: string) => void;
    commited: Set<Group> | undefined;

    user: User;
    peer?: RTCPeerConnection;
    dc?: RTCDataChannel;
    unreliableReady: boolean;
    ipc: ReturnType<typeof wsipc>;
    generators: Map<number, Generator | AsyncGenerator>;
    processes: Map<string, Process>;
    slowmode?: boolean;
    slowmodeTimer?: ReturnType<typeof setTimeout>;
    solvedDone?: boolean;
    cancelFollowerNotification?: ReturnType<typeof setTimeout>;
};

interface Process {
    owner: UserPrivate;
}

export type RoomState = {
    gid: number;
    sentsecret?: true;
    secret: string;
    hist?: Record<string, User & { ip: string }>;
    bannedips: string[];
    bannednames?: string[];
    bannedreason?: string[];
    bannedids?: string[];
    secure?: boolean;
    chatlog?: { message: string, name: string, color: string, ts: number; ip?: string; asn?: number; }[];
    iplog: [ip: string, asn?: number][];

    modstate: Record<string, any>;
    frameGroupIds?: number[];
    createdBy?: string;
    createdAsn?: number;
    token?: string;

    refs?: string[];
    hidlog?: {
        sender: string;
        msg: string;
        to?: string;
        ip?: string;
        asn?: number;
    }[];

    hostName?: string;
    endstats?: {
        ranking: [string, number][],
        jcfav?: string;
        deadweight?: string;
    };
};

export type GroupOwnershipInfo = {
    ref: Group;
    t: number;
    pp: [number, number]; // previous position, updated when changing owner
    co?: string; // currently owning ip
};

export type RoomRuntimeState = {
    users: User[];
    usersPriv: Map<number, UserPrivate>;

    archive?: ReturnType<typeof setTimeout>;
    save?: ReturnType<typeof setTimeout>;

    modules: ChatModule[];
    events: EventEmitter;

    slow?: {
        baseTimeout: number;
        allowed: Set<string>;
    };
    token?: string;

    broadcaster: RoomBroadcaster;
    binCodeHandlers: Map<number, readonly [ParserTypes, (
        payload: any,
        raw: Buffer,
        user: UserPrivate,
        room: Room,
        state: RoomState,
        runtime: RoomRuntimeState,) => void]>;
    jsonCodeHandlers: Map<string, (
        payload: { type: string, [key: string]: any },
        user: UserPrivate,
        guser: User) => void>;

    transformedgroups: Map<number, Group>; // maps a piece id to a group
    processes: Map<number, Process>;

    juke?: Jukebox;
    lastMovedGroups: Map<Group, RevertInfo>;
    trustees: Map<string, string[]>;

    adminmodule: AdminModule;
    ipJoinLimit: Record<string, Counter>;
    nameJoinLimit: Record<string, Counter>;
    groupowners: Map<number, GroupOwnershipInfo>;
    groupownersbyip: Map<string, Set<Group>>;
    connectionFlow: ConnectionFlow;

    sendInfos?: () => void;
    getStatsMessage?: () => any;
    reEvalHardbans: () => void;
    setAutodestruct?: (enabled: boolean) => void;
};

export type DBRoomState = RoomState;

export type JsonValue =
    | string
    | number
    | boolean
    | null
    | { [key: string]: JsonValue }
    | JsonValue[];

export enum BinCommands {
    Pick = 1,
    Move = 2,
    Drop = 3,
    Select = 4,
    Deselect = 5,
    Merge = 6,
    Rotate = 7,
    Lock = 8,
    Unlock = 9,
    ForceRelease = 10,
    Heartbeat = 0xB,
    Flip = 0xF,

    SetCommitted = 0x62, // output only
    UnsetCommitted = 0x63, // output only

    SetKaosList = 0x88, // output only

    EntityManagerIO = 0xaa, // output only

    PollMove = 0x41,
    PollHold = 0x42,
    PollRelease = 0x43,

    PickJigChan = 0xab,
    MoveJigChan = 0xac,
    DropJigChan = 0xad,
    StartPatJigChan = 0xae,
    StopPatJigChan = 0xaf,

    Revert = 0xbb,

    MoveDelta = 0x21,
    MoveAlign = 0x22,
    MoveStack = 0x23,
    MoveScatter = 0x24,
}

