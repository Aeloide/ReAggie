import { gameStatus } from "$lib/room/stores";

// TODO: restore this
function reportErrorFetch(e: string) {
    //reportLimit-- <= 0 || "undefined" != typeof fetch && fetch(`/report-error?error=${encodeURIComponent(e)}&room=${ROOM_NAME}"&t=${Date.now()}`);
    // if (reportLimit-- > 0 && typeof fetch !== "undefined") {
    //     fetch(`/report-error?error=${encodeURIComponent(e)}&room=${ROOM_NAME}&t=${Date.now()}`);
    // }
}

onerror = function (e, t, r, a, i) {
    reportErrorFetch(`${e}\n${i && i.stack}`);
};

onunhandledrejection = function (e) {
    let t = e.reason;
    reportErrorFetch("[rejection] " + (t && t.message, "\n") + (t && t.stack));
};

export function errorhandler(e: string | Event | unknown) {
    console.error(e);
    let t = "Error occurred, reload or close to continue";
    if (e instanceof Event) {
        if ("NS_ERROR_FAILURE" === (e as any).name) {
            t = "Error while initializing graphics, try not using a shit browser";
        } else if (e.target instanceof HTMLImageElement || e.target instanceof HTMLVideoElement) {
            t = "Error while loading media, it might be deleted from the server";
        }
    }
    
    gameStatus.set({ status: "error", text: t });
};
