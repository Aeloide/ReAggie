import { jukebox, jukeboxSongRequest, playlist } from "$lib/room/stores";
import type { Room, track } from "./types";

// The server sends a currentlyplaying message before sending the full playlist on /pljam, so the extension lookup fails.
export function startMusicAt(roomDef: Room, timeStarted: number, mid: string, ext?: string) {
  if (!roomDef!.juke) return;

  jukeboxSongRequest.set({ timeStarted, mid, ext });
}

export function stopCurrentSong() {
  jukeboxSongRequest.stop();
}

export function refreshPlaylist(newPlaylist: track[]) {
  playlist.set(newPlaylist);
}

export function syncJukebox(roomDef: Room) {
  if (roomDef.juke && roomDef.ext) {
    jukebox.setMinPrice(roomDef.ext.minPrice);
    refreshPlaylist(roomDef.ext.playlist);
    if (roomDef.ext.currentlyPlaying && roomDef.ext.timeStarted) {
      startMusicAt(roomDef, roomDef.ext.timeStarted, roomDef.ext.currentlyPlaying);
    }
  }
}
