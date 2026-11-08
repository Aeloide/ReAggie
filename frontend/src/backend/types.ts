import { Permissions, HostCapabilities } from "$lib/room/permissions";
export { Permissions, HostCapabilities };

export type vec2 = [number, number];
export type Rectangle = [vec2, vec2];
export type SpreadingFunction = (gs: Group[],
    bound: Rectangle,
    pdim: vec2,
    idim: vec2, skipRectangles?: Rectangle[], force?: boolean) => void;

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
    rotp?: number; // timestamp of the latest move, reset on merge, set initially when moved
};

export type PSet = {
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
    count?: number; // if voronoi, this is the number of pieces

    pieceWidth?: number;
    pieceHeight?: number;
    tx?: number;
    ty?: number;
    tw?: number;
    th?: number;
    maskX?: number;
    maskY?: number;
    sites?: [number, number][];
};

export type Room = {
    boardHeight: number;
    boardWidth: number;
    endTime?: number;
    groups: Group[];
    hidePreview: boolean;
    jigchan?: boolean;
    votekick: boolean;
    jitter: number;
    cornerJitter: number;
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
    thumb: string;
    juke?: boolean;
    scores?: boolean;
    zigzag?: boolean;
    square: boolean;
    fakeEdge?: boolean;
    nostack?: boolean;
    noedge?: boolean;
    auth?: boolean;
    ext?: Record<string, any>;

    // undefined: room is private
    // empty string: room is public
    // else: room can only appear if the user knows the keyword
    key?: string; // basically a like a password, but shared among a group of individuals 
    tags?: string[]; // used to filter search and order by relevancy

};

export type User = {
    id: number;
    name: string;
    color: string;
    isHost: Permissions;
    avatar?: string;
};

export type Quota = {
    amount: number;
    burst_factor: number;
};
