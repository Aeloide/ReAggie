import ffmpeg from "fluent-ffmpeg";
import EventEmitter from "events";

export class Jukebox {
    playing = true;

    ee = new EventEmitter();

    constructor() {
    }

    currentfile?: string;

    arm?: NodeJS.Timeout;

    playFile(s: string, from: number = 0) {
        this.currentfile = s;
        if (this.arm)
            clearTimeout(this.arm);
        ffmpeg.ffprobe(s, (err, data) => {
            this.arm = setTimeout(() => {
                this.ee.emit("playfinished");
            }, 1000 * ((data?.format?.duration || 5) - from));
        });
        this.playing = true;
    }
}