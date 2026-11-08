
import { file, write } from "bun";
import { join } from "path";

// --- MOCKS ---
class MockStorage {
    private items = new Map<string, string>();
    getItem(key: string) { return this.items.get(key) || null; }
    setItem(key: string, value: string) { this.items.set(key, value); }
    removeItem(key: string) { this.items.delete(key); }
    clear() { this.items.clear(); }
    get length() { return this.items.size; }
    key(index: number) { return Array.from(this.items.keys())[index] || null; }
}

globalThis.localStorage = new Proxy(new MockStorage(), {
    get(target, prop) {
        if (typeof prop === 'string' && prop in target) return (target as any)[prop];
        return target.getItem(String(prop));
    },
    set(target, prop, value) {
        target.setItem(String(prop), String(value));
        return true;
    }
}) as any;

globalThis.window = {
    addEventListener: () => { },
    removeEventListener: () => { },
    location: { reload: () => { } },
    devicePixelRatio: 1,
    localStorage: globalThis.localStorage,
} as any;

globalThis.navigator = {
    userAgent: "Bun/1.0",
} as any;

globalThis.location = {
    search: "",
    hash: "",
    pathname: "/",
    reload: () => { },
    href: "https://jiggie.fun/",
    origin: "https://jiggie.fun",
} as any;

globalThis.document = {
    createElement: (tag: string) => {
        if (tag === "canvas") {
            return {
                getContext: () => ({
                    fillRect: () => { },
                    clearRect: () => { },
                    drawImage: () => { },
                    getImageData: () => { },
                    putImageData: () => { },
                    save: () => { },
                    restore: () => { },
                    translate: () => { },
                    rotate: () => { },
                    scale: () => { },
                    beginPath: () => { },
                    moveTo: () => { },
                    lineTo: () => { },
                    stroke: () => { },
                    fill: () => { },
                    closePath: () => { },
                    resetTransform: () => { },
                }),
                style: {},
                width: 0,
                height: 0,
            }
        }
        if (tag === "video") return { addEventListener: () => { }, play: () => { }, style: {} };
        if (tag === "img") return { style: {} };
        if (tag === "a") return { click: () => { }, style: {} }; // For potential downloads
        return { style: {} };
    },
    body: { appendChild: () => { }, removeChild: () => { } },
    head: { appendChild: () => { }, removeChild: () => { } },
    addEventListener: () => { },
    removeEventListener: () => { },
} as any;

globalThis.onerror = function () { };
globalThis.onunhandledrejection = function () { };

globalThis.innerWidth = 1920;
globalThis.innerHeight = 1080;
globalThis.HTMLVideoElement = class {
    constructor() { }
    prototype = {};
} as any;

globalThis.Audio = class {
    play() { }
    pause() { }
    volume = 1;
} as any;

globalThis.AudioContext = class {
    createGain() { return { gain: { value: 1 }, connect: () => { } } }
    createOscillator() { return { connect: () => { }, start: () => { }, stop: () => { } } }
    destination = {}
} as any;

globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 16);
globalThis.Image = class {
    onload: any;
    onerror: any;
    src: string = "";
    width: number = 0;
    height: number = 0;
    naturalWidth: number = 0;
    naturalHeight: number = 0;
    set src(v: string) {
        // Need to delay to let listeners attach
        setTimeout(() => {
            this.width = 100;
            this.height = 100;
            this.naturalWidth = 100;
            this.naturalHeight = 100;
            if (this.onload) this.onload();
        }, 1);
    }
} as any;

globalThis.Worker = class {
    postMessage() { }
    addEventListener() { }
    terminate() { }
} as any;

globalThis.URL = {
    createObjectURL: () => "blob:fake",
    revokeObjectURL: () => { },
} as any;

// --- IMPORTS ---
// We use dynamic imports to ensure mocks are in place before modules are loaded
const { fetchRoomReplay, updateLogEventsAbsoluteTimes } = await import("$room/replay/replay-loader");
const { Game } = await import("$room/game");
const { RoomMessageHandler } = await import("$room/room-message-handler");
const { MediaSetLoader } = await import("$room/media-set-loader");
const { RoomCommandsInterpolator } = await import("$room/room-commands-interpolator");
const { roomState } = await import("$lib/room/stores");

// --- MONKEY PATCHING ---
MediaSetLoader.loadImage = async (url: string, set: any, isSecond: boolean = false) => {
    return {
        element: new Image() as any,
        isVideo: false,
        url: url,
        width: 1000,
        height: 1000,
        set: set,
        isSecond: isSecond
    };
};

// --- MAIN ---

async function main() {
    const args = process.argv.slice(2);
    if (args.length < 1) {
        console.error("Usage: bun src/scripts/generate-replay-graph.ts <roomId> [output.svg]");
        process.exit(1);
    }

    const roomId = args[0];
    const outputFile = args[1] || `${roomId}_progress.svg`;

    console.log(`Fetching replay for room ${roomId}...`);
    let events;
    try {
        events = await fetchRoomReplay(roomId, true);
    } catch (e) {
        console.log("Failed to fetch as completed game, trying incomplete...");
        try {
            events = await fetchRoomReplay(roomId, false);
        } catch (e2) {
            console.error("Failed to fetch replay:", e2);
            process.exit(1);
        }
    }

    if (!events || events.length === 0) {
        console.error("No events found.");
        process.exit(1);
    }

    console.log(`Loaded ${events.length} events.`);

    const game = new Game();
    game.init()
    // Mock renderer
    game.renderer = {
        destroy: () => { },
        init: async () => {
            // Mimic gpu4-renderer init logic for setPieces
            if (game.roomdef && game.roomdef.sets) {
                // game.setRoomDef(game.roomdef);
                game.state.setPieces = game.roomdef.sets.map(set => {
                    const count = set.cols * set.rows;
                    // We need an array of objects that have a 'length' property effectively? 
                    // No, setPieces is GeoPiece[][].
                    // calculateProgress uses: game.state.setPieces.reduce((p, c) => p + c.length, 0);
                    // So it expects an array of arrays.
                    // The inner array length matters.
                    return new Array(count).fill({});
                }) as any;
            }
        },
        uploadTextures: () => { },
        doRender: () => { },
        doHitTest: () => false,
    } as any;

    let roomdataev = events.find(e => e.data.room);
    if (roomdataev) {
        // Pre-initialize roomdef so renderer.init can work
        // game.roomdef = events[0].data.room;
        game.setRoomDef(roomdataev.data.room);
        await game.renderer!.init();
    } else {
        console.error("No room data found in events.");
        process.exit(1);
    }

    game.syncRoomDefGroups();

    const interpolator = new RoomCommandsInterpolator(game, true);
    const messageHandler = new RoomMessageHandler(game, interpolator);

    // We want to track progress over time.
    const dataPoints: { time: number, percent: number }[] = [];

    // Helper to calculate progress
    function calculateProgress() {
        // console.log("Sets:", game.state.sets);
        if (game.state.sets.length === 0) return 0;

        const totalPieces = game.state.setPieces.reduce((p, c) => p + c.length, 0);
        if (totalPieces <= 1) return 0;

        const currentGroups = game.state.groups.length;
        const totalSets = game.state.sets.length;

        // console.log("Total pieces:", currentGroups, totalSets);
        if (currentGroups === 0) return 0;

        let percent = 100 * (1 - (currentGroups - totalSets) / (totalPieces - 1));
        return Math.max(0, Math.min(100, percent));
    }

    let startTime = 0;
    let processedCount = 0;
    console.log("Processing events...");

    for (const event of events) {
        if (processedCount % 1000 === 0) {
            process.stdout.write(`\r${processedCount}/${events.length}`);
        }

        try {
            messageHandler.handle(event.data);

            // Try to grab start time from room definition
            if (startTime === 0 && game.roomdef && game.roomdef.startTime) {
                startTime = game.roomdef.startTime;
            }
        } catch (e) {
            // console.log(e)
            // Ignore errors
        }

        const currentTime = startTime + event.time * 1000;
        const progress = calculateProgress();

        const lastPoint = dataPoints[dataPoints.length - 1];
        if (!lastPoint || Math.abs(lastPoint.percent - progress) > 0.01 || (currentTime - lastPoint.time) > 10000) {
            dataPoints.push({ time: currentTime, percent: progress });
        }

        processedCount++;
    }

    console.log("\nDone processing.");

    if (dataPoints.length === 0) {
        console.error("No data points generated.");
        process.exit(0);
    }

    // Generate SVG
    console.log(`Generating SVG with ${dataPoints.length} points...`);
    const svg = generateSVG(dataPoints, roomId);

    await write(outputFile, svg);
    console.log(`Saved graph to ${outputFile}`);
    process.exit(0);
}

function generateSVG(data: { time: number, percent: number }[], roomId: string): string {
    if (data.length === 0) return "";

    const width = 800;
    const height = 400;
    const padding = { top: 40, right: 30, bottom: 50, left: 60 };

    const minTime = data[0].time;
    const maxTime = data[data.length - 1].time;
    const timeRange = maxTime - minTime;

    if (timeRange <= 0) {
        return `<svg></svg>`;
    }

    function getX(t: number) {
        return padding.left + ((t - minTime) / timeRange) * (width - padding.left - padding.right);
    }

    function getY(p: number) {
        return height - padding.bottom - (p / 100) * (height - padding.top - padding.bottom);
    }

    let pathD = `M ${getX(data[0].time)} ${getY(data[0].percent)}`;
    for (let i = 1; i < data.length; i++) {
        pathD += ` L ${getX(data[i].time)} ${getY(data[i].percent)}`;
    }

    // Axes
    const xAxisY = height - padding.bottom;
    const yAxisX = padding.left;

    // Time ticks
    const ticks = 5;
    let xTicks = "";
    for (let i = 0; i <= ticks; i++) {
        const t = minTime + (timeRange * i) / ticks;
        const x = getX(t);
        const date = new Date(t);
        const label = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        xTicks += `<line x1="${x}" y1="${xAxisY}" x2="${x}" y2="${xAxisY + 5}" stroke="black" />`;
        xTicks += `<text x="${x}" y="${xAxisY + 20}" text-anchor="middle" font-size="12">${label}</text>`;
    }

    // Percent ticks
    let yTicks = "";
    for (let i = 0; i <= 10; i += 2) {
        const p = i * 10;
        const y = getY(p);
        yTicks += `<line x1="${yAxisX}" y1="${y}" x2="${yAxisX - 5}" y2="${y}" stroke="black" />`;
        yTicks += `<text x="${yAxisX - 10}" y="${y + 4}" text-anchor="end" font-size="12">${p}%</text>`;
    }

    return `<svg version="1.1" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="white" />
    <text x="${width / 2}" y="${padding.top / 2}" text-anchor="middle" font-size="16" font-weight="bold">Progression - Room ${roomId}</text>
    
    <!-- Y Axis -->
    <line x1="${yAxisX}" y1="${padding.top}" x2="${yAxisX}" y2="${xAxisY}" stroke="black" />
    ${yTicks}
    
    <!-- X Axis -->
    <line x1="${yAxisX}" y1="${xAxisY}" x2="${width - padding.right}" y2="${xAxisY}" stroke="black" />
    ${xTicks}
    
    <!-- Graph -->
    <path d="${pathD}" stroke="blue" stroke-width="2" fill="none" />
</svg>`;
}

main().catch(console.error);
