import { settings } from "$lib/room/stores";
import clickSoundUrl from '$lib/assets/click.webm';
import chatSoundUrl from '$lib/assets/chat.webm';
import lockSoundUrl from '$lib/assets/lock.webm';
import completeSoundUrl from '$lib/assets/complete.webm';
import meowSoundUrl from '$lib/assets/meow.webm';
import memSoundUrl from '$lib/assets/arsene.webm';

export let audioContext: AudioContext;

export let clicksound: AudioBuffer;
export let chatsound: AudioBuffer;
export let discordsound: AudioBuffer;
export let locksound: AudioBuffer;
export let completesound: AudioBuffer;
export let meowsound: AudioBuffer;
export let memsound: AudioBuffer;

(["touchstart", "mousedown", "wheel"] as (keyof WindowEventMap)[]).forEach(t => {
    document.addEventListener(t, preloadsoundeffects, { capture: true, passive: true, once: true });
});

function preloadsoundeffects(e: Event) {
    function loadRemoteFile(path: string, successCb?: (decodedData: AudioBuffer) => AudioBuffer | void) {
        const arrBuffer = new XMLHttpRequest;
        arrBuffer.open("GET", path, true);
        arrBuffer.responseType = "arraybuffer";
        arrBuffer.onload = () => audioContext.decodeAudioData(arrBuffer.response, successCb, e => console.error(e));
        arrBuffer.send();
    }
    if (audioContext)
        return;
    try {
        audioContext = new (AudioContext || (window as any).webkitAudioContext);

        if (!("decodeAudioData" in audioContext)) return;
        loadRemoteFile(clickSoundUrl, a => {
            if (!a) return;
            let t = playsound(clicksound = a);
            t && t.disconnect();
        });

        loadRemoteFile(chatSoundUrl, a => chatsound = a);
        loadRemoteFile('/discord.ogg', a => discordsound = a);
        loadRemoteFile(lockSoundUrl, a => locksound = a);
        loadRemoteFile(completeSoundUrl, a => completesound = a);
        loadRemoteFile(meowSoundUrl, a => meowsound = a);
        loadRemoteFile(memSoundUrl, a => memsound = a);
    } catch (e) {
        if (import.meta.env.DEV) console.warn("Audio preload error:", e);
    }
}

export function playsound(audioBuff: AudioBuffer, volume?: number, force?: boolean, shift = 0) {
    const muted = !settings.snapshot().mutesound || force;
    if (audioContext && "createBufferSource" in audioContext && muted) {
        const bufferSrc = audioContext.createBufferSource();
        bufferSrc.buffer = audioBuff;
        bufferSrc.playbackRate.value = 2 ** ((shift) / 12);
        if (volume != null) { // Allow a volume of 0.
            const gainNode = audioContext.createGain();
            gainNode.gain.value = volume;
            gainNode.connect(audioContext.destination);
            bufferSrc.connect(gainNode);
        } else {
            bufferSrc.connect(audioContext.destination);
        }
        bufferSrc.start(0);
        return bufferSrc;
    }
}
