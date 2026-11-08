import { writable } from "svelte/store";
import type { RoomSettings } from "./types";
import { layoutStore } from "./layoutStore";

let savedRoomSettings: Partial<RoomSettings> | undefined;
try {
  const parsed = JSON.parse(localStorage.getItem("config") || "null");
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
    savedRoomSettings = parsed;
} catch {
  savedRoomSettings = undefined;
}

const defaultRoomSettings: RoomSettings = {
  pieces: 25,
  rotation: false,
  edges: false,
  preview: false,
  votekick: false,
  mixsets: false,
  juke: false,
  square: false,
  scores: false,
  zigzag: false,
  fakeEdge: false,
  nomultisel: false,
  nolock: false,
  norect: false,
  nostack: false,
  auth: false,
  sd: false,
  autism: 2,
  listable: false,
  nsfw: false,
  jukemusic: false,
  tags: [],
  forceanon: false,
  rotting: false,
  jigchan: false,
  sticky: false,
  flipping: false,
  noEdge: false,
  voronoi: false,
  jitter: 0.15,
  cornerJitter: 0.15,
  tabSize: 0.1,
  voronoiPreset: 'random',
  voronoiCode: '',
  distributorPreset: 'clearRect',
  distributorCode: '',
};

const roomSettings = writable<RoomSettings>(
  savedRoomSettings ? { ...defaultRoomSettings, ...savedRoomSettings } : defaultRoomSettings
);

roomSettings.subscribe((config) => {
  try {
    localStorage.setItem("config", JSON.stringify(config));
  } catch (error) {
    console.warn("Could not persist room settings", error);
  }
  layoutStore.update((layouts) => {
    for (const layout of layouts.values()) {
      if (!config.voronoi) {
        delete layout.voronoiConfig;
      }
    }
    return layouts;
  })
});

export default roomSettings;
