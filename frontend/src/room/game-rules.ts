import { otherSettings, otherSettingsSnapshot, type settings as settingsType } from "$lib/room/stores";
import type { Room } from "./types";

export class GameRules {
  constructor(private settings: typeof settingsType, public roomdef: Room) {}

  get sticky() {
    return this.roomdef.ext?.sticky || false;
  }

  canMultiselect() {
    return !this.roomdef.nomultiselect || otherSettingsSnapshot.host.ChangeRoomSettings;
  }

  isHost() {
    return !!this.settings.snapshot().secretforthisroom;
  }

  canRotate() {
    return this.roomdef.rotation;
  }

  canFlip() {
    return this.roomdef.flipping;
  }

  canLock() {
    return !this.roomdef.nolockunlock || otherSettingsSnapshot.host.ChangeRoomSettings;
  }

  noStack() {
    return this.roomdef.nostack;
  }
}
