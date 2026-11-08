import { game } from "$room";
import { driftStore, roomState } from "$lib/room/stores";
import { get } from "svelte/store";

export let canvaselem: HTMLCanvasElement = null!;

export const setCanvasElem = (canvas: HTMLCanvasElement | null) => {
    canvaselem = canvas!;
    if (!canvas)
        return;
    canvaselem.width = innerWidth * devicePixelRatio;
    canvaselem.height = innerHeight * devicePixelRatio;
};

export function updateDonePercent() {
    let e = game.state.setPieces.reduce((p, c) => p + c.length, 0);
    const remainingMerges = Math.max(0, e - game.state.sets.length);
    let t = remainingMerges === 0
        ? 100
        : 100 * (1 - (game.state.groups.length - game.state.sets.length) / remainingMerges);
    t = Math.max(0, Math.min(100, t));
    roomState.update(x => {
        x.donePercent = t;
        return x;
    });
}

export function refreshLockedDisplay() {
    let locked = 0;
    for (const group of game.state.groups) {
        if (group.locked) {
            locked++;
        }
    }

    roomState.update(x => { x.lockedPiecesCount = locked; return x; });
}

function zeroPad(e: string | number) {
    return '' + ((+e) < 10 ? "0" + ('' + e) : e);
}

/**
 * Convert a number to HH:MM in local time
 * @returns e.g. 23:59
 */
export function shortTimeFormat(timeStamp: Date): string {
    return `${zeroPad(timeStamp.getHours())}:${zeroPad(timeStamp.getMinutes())}`
}

export function fullTimeFormat() {
    let start = game.roomdef.startTime;
    const drift = get(driftStore);
    const serverNow = Date.now() - (Number.isFinite(drift) ? drift! : 0);
    let end = game.roomdef.endTime ?? serverNow;
    let secondDiff = start ? Math.floor(Math.max(0, end - start) / 1e3) : 0;
    let seconds = secondDiff % 60;
    let minutes = Math.floor(secondDiff / 60) % 60;
    let hours = Math.floor(secondDiff / 3600) % 24;
    let days = Math.floor(secondDiff / 86400);
    let s = `${zeroPad(minutes)}:${zeroPad(seconds)}`;
    //(days || hours) && (s = `${timeFormat(hours)}:${s}`), days && (s = days + (1 === days ? " day " : " days ") + s);
    if (days || hours) {
        s = `${zeroPad(hours)}:${s}`;
    }

    if (days) {
        if (1 === days) {
            s = days + " day " + s;
        } else {
            s = days + " days " + s;
        }
    }

    roomState.update(x => { x.timerText = s; return x; });
}
