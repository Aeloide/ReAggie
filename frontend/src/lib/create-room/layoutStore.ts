import { writable } from "svelte/store";
import { defaultDistributors } from "./distributorsPresets";

export type BagId = number;
export type DistributorId = number;

export type DistributorType = "shitstain" | "disk" | "clearRect" | "custom";

export interface Bag {
    id: BagId;
    name: string;
    color: string;
    pieces: Set<number>;
    presolved: boolean;
    hiddenUntil?: BagId;
    distributorType: DistributorType;
    distributorCode?: string;
    connectedToRegion?: {
        parentImageId: string;
        parentBagId: BagId;
        regionName: string;
    };
}

export interface ImageLayoutConfig {
    imageId: string; // The URL or index
    bags: Map<BagId, Bag>;
    // Initial piece positions calculated on the client [x, y] coordinates
    positions?: [number, number][];
    voronoiConfig?: {
        total: number;
        edges: number[];
        seed: number;
        sites: [number, number][]; // User defined sites
    };
    customDistributors?: Map<string, { name: string; code: string }>;
}

export interface SerializedDistributor {
    id: string;
    name: string;
    code: string;
}

export interface SerializedBag {
    id: BagId;
    name: string;
    color: string;
    pieces: number[];
    presolved: boolean;
    hiddenUntil?: BagId;
    distributorType: DistributorType;
    distributorCode?: string;
    connectedToRegion?: {
        parentImageId: string;
        parentBagId: BagId;
        regionName: string;
    };
}

export interface SerializedImageLayoutConfig {
    imageId: string;
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
    customDistributors?: SerializedDistributor[];
}

const defaultLayouts = new Map<string, ImageLayoutConfig>();

function getNextBagId(bags: Map<BagId, Bag>): BagId {
    let max = -1;
    for (const key of bags.keys()) {
        if (key > max) max = key;
    }
    return max + 1;
}

function createLayoutStore() {
    const { subscribe, set, update } = writable<Map<string, ImageLayoutConfig>>(defaultLayouts);

    const colors = ["#f44336", "#e91e63", "#9c27b0", "#673ab7", "#3f51b5", "#2196f3", "#03a9f4", "#00bcd4"];

    return {
        subscribe,
        set,
        update,
        initImage: (imageId: string, pieceCount: number) => {
            update(layouts => {
                if (!layouts.has(imageId)) {
                    const defaultBagId = 0;
                    const allPieces = new Set<number>();
                    for (let i = 0; i < pieceCount; i++) allPieces.add(i);

                    const defaultBag: Bag = {
                        id: defaultBagId,
                        name: "Default Bag",
                        color: "rgba(0,0,0,0)", // Transparent for default
                        pieces: allPieces,
                        presolved: false,
                        distributorType: "clearRect",
                        distributorCode: defaultDistributors.clearRect.code
                    };

                    const bags = new Map<BagId, Bag>();
                    bags.set(defaultBagId, defaultBag);

                    layouts.set(imageId, {
                        imageId,
                        bags,
                        customDistributors: new Map()
                    });
                }
                return layouts;
            });
        },
        setPieceCount: (imageId: string, pieceCount: number) => {
            update(layouts => {
                const layout = layouts.get(imageId);
                if (layout) {
                    const defaultBagId = 0;
                    const allPieces = new Set<number>();
                    for (let i = 0; i < pieceCount; i++) allPieces.add(i);

                    const defaultBag: Bag = {
                        id: defaultBagId,
                        name: "Default Bag",
                        color: "rgba(0,0,0,0)",
                        pieces: allPieces,
                        presolved: false,
                        distributorType: "clearRect",
                        distributorCode: defaultDistributors.clearRect.code
                    };

                    const bags = new Map<BagId, Bag>();
                    bags.set(defaultBagId, defaultBag);

                    layout.bags = bags;
                    if (!layout.customDistributors) {
                        layout.customDistributors = new Map();
                    }
                    layouts.set(imageId, { ...layout, bags: new Map(bags) });
                }
                return new Map(layouts);
            });
        },
        addBag: (imageId: string, name: string, color?: string) => {
            update(layouts => {
                const layout = layouts.get(imageId);
                if (layout) {
                    const defaultBag = layout.bags.get(0);
                    const isConnected = defaultBag && (defaultBag.distributorType === "clearRect");
                    const connectedToRegion = isConnected ? {
                        parentImageId: imageId,
                        parentBagId: 0,
                        regionName: "center"
                    } : undefined;

                    const bagId = getNextBagId(layout.bags);
                    layout.bags.set(bagId, {
                        id: bagId,
                        name,
                        color: color || colors[layout.bags.size % colors.length],
                        pieces: new Set<number>(),
                        presolved: false,
                        distributorType: "disk",
                        distributorCode: defaultDistributors.disk.code,
                        connectedToRegion
                    });
                    if (!layout.customDistributors) {
                        layout.customDistributors = new Map();
                    }
                    layouts.set(imageId, { ...layout, bags: new Map(layout.bags) });
                }
                return new Map(layouts);
            });
        },
        removeBag: (imageId: string, bagId: BagId) => {
            update(layouts => {
                const layout = layouts.get(imageId);
                if (layout) {
                    const bag = layout.bags.get(bagId);
                    if (bag) {
                        // Re-distribute pieces to default bag if any
                        const defaultBagId = Array.from(layout.bags.keys())[0];
                        if (defaultBagId !== undefined && defaultBagId !== bagId) {
                            const defaultBag = layout.bags.get(defaultBagId);
                            if (defaultBag) {
                                for (const p of bag.pieces) {
                                    defaultBag.pieces.add(p);
                                }
                            }
                        }
                        layout.bags.delete(bagId);
                        // Clean up nesting references
                        for (const b of layout.bags.values()) {
                            if (b.hiddenUntil === bagId) {
                                b.hiddenUntil = undefined;
                            }
                            if (b.connectedToRegion?.parentBagId === bagId) {
                                b.connectedToRegion = undefined;
                            }
                        }
                        layouts.set(imageId, { ...layout, bags: new Map(layout.bags) });
                    }
                }
                return new Map(layouts);
            });
        },
        setHiddenUntil: (imageId: string, sourceBagId: BagId, targetBagId: BagId) => {
            update(layouts => {
                const l = layouts.get(imageId);
                if (l) {
                    let curr = targetBagId;
                    let cycle = false;
                    while (curr !== undefined && l.bags.has(curr)) {
                        if (curr === sourceBagId) {
                            cycle = true;
                            break;
                        }
                        curr = l.bags.get(curr)?.hiddenUntil as BagId;
                    }
                    if (!cycle) {
                        const sourceBag = l.bags.get(sourceBagId);
                        if (sourceBag) sourceBag.hiddenUntil = targetBagId;
                        layouts.set(l.imageId, { ...l, bags: new Map(l.bags) });
                    }
                }
                return new Map(layouts);
            });
        },
        clearHiddenUntil: (imageId: string, bagId: BagId) => {
            update(layouts => {
                const l = layouts.get(imageId);
                if (l) {
                    const targetBag = l.bags.get(bagId);
                    if (targetBag) targetBag.hiddenUntil = undefined;
                    layouts.set(l.imageId, { ...l, bags: new Map(l.bags) });
                }
                return new Map(layouts);
            });
        },
        serialize: (layouts: Map<string, ImageLayoutConfig>): SerializedImageLayoutConfig[] => {
            const result: SerializedImageLayoutConfig[] = [];
            for (const [imageId, layout] of layouts.entries()) {
                const bagsArray: SerializedBag[] = [];
                for (const [bagId, bag] of layout.bags.entries()) {
                    bagsArray.push({
                        id: bag.id,
                        name: bag.name,
                        color: bag.color,
                        pieces: Array.from(bag.pieces),
                        presolved: bag.presolved,
                        hiddenUntil: bag.hiddenUntil,
                        distributorType: bag.distributorType,
                        distributorCode: bag.distributorCode,
                        connectedToRegion: bag.connectedToRegion
                    });
                }
                const distsArray: SerializedDistributor[] = [];
                if (layout.customDistributors) {
                    for (const [id, d] of layout.customDistributors.entries()) {
                        distsArray.push({
                            id,
                            name: d.name,
                            code: d.code
                        });
                    }
                }
                result.push({
                    imageId,
                    bags: bagsArray,
                    positions: layout.positions,
                    voronoiConfig: layout.voronoiConfig,
                    customDistributors: distsArray
                });
            }
            return result;
        }
    };
}

export const layoutStore = createLayoutStore();
