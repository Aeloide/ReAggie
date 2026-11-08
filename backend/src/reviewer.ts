import { randstring } from "./utils.js";
import * as ws from "ws";

let reviewer: ws.WebSocket | null = null;
const reviewQueue: ReviewObserver[] = [];

export const clearReviewerSocket = (socket?: ws.WebSocket) => {
    if (socket && reviewer !== socket) return;
    reviewer = null;
    for (let q of reviewQueue) {
        q.answer = true;
        q.pending = false;
        q.dispatchEvent(new Event("settled"));
    }
    reviewQueue.length = 0;
}

export const isReviewerAvailable = () => reviewer != null;

export const setReviewerSocket = (socket: ws.WebSocket) => {
    for (let q of reviewQueue) {
        q.answer = true;
        q.pending = false;
        q.dispatchEvent(new Event("settled"));
    }
    reviewQueue.length = 0;
    const clear = () => clearReviewerSocket(socket);
    socket.on('close', clear);
    socket.on('error', clear);
    socket.on('message', (ev, isBinary) => {
        let msg: any;
        try {
            if (isBinary) throw new Error("Expected a JSON reviewer reply");
            msg = JSON.parse(ev.toString());
            if (!msg || typeof msg !== "object")
                throw new Error("Expected an object");
        } catch (error) {
            console.error("Malformed reviewer message", error);
            if (socket.readyState === ws.WebSocket.OPEN)
                socket.close(1003, "Malformed reviewer message");
            return;
        }
        switch (msg.type) {
            case "reply": {
                const { reviewId, answer } = msg;
                if (typeof reviewId !== "string" || typeof answer !== "boolean") return;
                const repIdx = reviewQueue.findIndex(e => e.reviewId === reviewId);
                const rep = reviewQueue[repIdx];
                if (!rep) return;
                rep.answer = answer;
                reviewQueue.splice(repIdx, 1);
                rep.dispatchEvent(new Event("settled"));
                for (let i = 0; i < reviewQueue.length; ++i) {
                    reviewQueue[i].queue = i;
                    reviewQueue[i].dispatchEvent(new CustomEvent("queue", { detail: { idx: i } }));
                }
                rescheduleQueue();
                break;
            }
        }
    })
    reviewer = socket;
}

export const findReview = (rid: string) => {
    return reviewQueue.find(e => e.reviewId === rid);
}

export class ReviewObserver extends EventTarget {
    pending = false;
    queue = -1;

    answer?: boolean;

    constructor(public reviewId: string, public filename: string, public file: Buffer) {
        super();
    }
}

const rescheduleQueue = () => {
    const next = reviewQueue[0];
    if (!reviewer) return;
    if (!next) return;
    if (next.pending) return;
    if (reviewer.readyState !== ws.WebSocket.OPEN) {
        clearReviewerSocket(reviewer);
        return;
    }

    next.pending = true;
    const data = Buffer.concat([Buffer.from(next.reviewId), Buffer.from([0]), next.file]);
    try {
        reviewer.send(data);
    } catch (error) {
        console.error("Failed to send review request", error);
        clearReviewerSocket(reviewer);
    }
}

export const getReview = (filename: string, file: Buffer): ReviewObserver => {
    const newReview = new ReviewObserver(randstring(8), filename, file);
    newReview.queue = reviewQueue.length;
    reviewQueue.push(newReview);
    rescheduleQueue();
    return newReview;
}